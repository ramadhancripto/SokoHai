#!/usr/bin/env node
/* ============================================================
 * P5 EVIDENCE — uthibitisho wa kina wa withdrawal (hatua kwa hatua).
 * Kila hatua: ACTION -> STATE (doc/balance/ledger) -> ASSERT.
 * Admin ni NJIA HALISI: server (ADMIN_EMAILS+verified) na rules
 * (custom claims kupitia Auth emulator). Hakuna fake admin.
 * ========================================================== */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai-g1';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
process.env.ADMIN_EMAILS = 'admin@sokohai.test';

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();

const results = [];
let step = 0;
function ev(msg) { step++; console.log('  [E' + step + '] ' + msg); }
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
const ADMIN = { uid: 'adminEv', token: { uid: 'adminEv', email: 'admin@sokohai.test', email_verified: true } };
async function call(name, auth, data) {
  try {
    const r = await fns[name].run({ data: data || {}, auth, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const getd = async (p) => (await db.doc(p).get()).data();
const bal = async (u) => Number((await getd('users/' + u)).walletBalance || 0);
async function ledgerSum(uid) {
  const q = await db.collection('wallet_ledger').where('userId', '==', uid).get();
  let s = 0; const rows = [];
  q.docs.forEach(d => { const x = d.data() || {}; s += Number(x.amountTSh || 0); rows.push(d.id + ':' + x.type + ':' + x.amountTSh); });
  return { sum: s, n: q.size, rows };
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}
async function mkUser(email, claims) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken, 'signUp ' + email + ': ' + JSON.stringify(j).slice(0, 150));
  if (claims) {
    await admin.auth().setCustomUserClaims(j.localId, claims);
    const r2 = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true })
    });
    const j2 = await r2.json();
    return { token: j2.idToken, uid: j2.localId };
  }
  return { token: j.idToken, uid: j.localId };
}
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restGet(tk, docPath) {
  const r = await fetch(`${DOCS}/${docPath}`, { headers: { authorization: 'Bearer ' + tk } });
  return r.status;
}
async function restList(tk, col) {
  const r = await fetch(`${DOCS}/${col}?pageSize=50`, { headers: { authorization: 'Bearer ' + tk } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, n: (j.documents || []).length };
}
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } })
  });
  assert(r.ok, 'rules load: ' + r.status);
}

async function main() {
  console.log('\n[P5 EVIDENCE]');
  await wipe();
  await loadRules();
  // Watumiaji: buyer (mnunuzi) + seller (muuzaji) na admin (claims halisi).
  const BUYER = await mkUser('evbuyer@u.test'), SELLER = await mkUser('evseller@u.test');
  const ADM = await mkUser('evadmin@u.test', { admin: true });
  const STR = await mkUser('evstranger@u.test');
  const B = BUYER.uid, S = SELLER.uid;
  await db.doc('users/' + B).set({ walletBalance: 20000, role: 'buyer' });
  await db.doc('users/' + S).set({ walletBalance: 12000, role: 'seller' });
  ev('setup: buyer=' + B.slice(0, 6) + ' bal=20000, seller=' + S.slice(0, 6) + ' bal=12000, admin claims={admin:true}');

  await test('E-buyer-request', async () => {
    const r = await call('withdrawalRequest', tok(B), { amountTSh: 6000, channel: 'mobile', account: '0712345678', requestKey: 'EV-B1' });
    assert(r.ok, 'request ok: ' + JSON.stringify(r));
    eq(r.data.status, 'pending', 'pending');
    eq(await bal(B), 14000, 'reservation: 20000-6000');
    const led = await getd('wallet_ledger/' + r.data.requestId);
    eq(led.type, 'withdrawal_hold', 'ledger hold'); eq(led.amountTSh, -6000, '-6000');
    ev('buyer request 6000 -> req=' + r.data.requestId + ' pending; bal 20000->14000; ledger withdrawal_hold -6000');
  });

  await test('E-seller-request-min', async () => {
    const r0 = await call('withdrawalRequest', tok(S), { amountTSh: 4999, channel: 'mobile', account: '0755111222', requestKey: 'EV-S0' });
    eq(r0.ok, false, '4999 rejected');
    const r = await call('withdrawalRequest', tok(S), { amountTSh: 5000, channel: 'bank', account: '1234567890', requestKey: 'EV-S1' });
    assert(r.ok, '5000 accepted');
    eq(await bal(S), 7000, 'reservation: 12000-5000');
    ev('seller: 4999 REJECTED; 5000 bank ACCEPTED -> bal 12000->7000 (pending)');
  });

  await test('E-admin-visibility', async () => {
    const qb = await db.collection('withdrawal_requests').where('userId', '==', B).get();
    const qs = await db.collection('withdrawal_requests').where('userId', '==', S).get();
    const docB = 'withdrawal_requests/' + qb.docs[0].id, docS = 'withdrawal_requests/' + qs.docs[0].id;
    const a = await restList(ADM.token, 'withdrawal_requests');
    eq(a.status, 200, 'admin list 200'); eq(a.n, 2, 'admin anaona maombi 2');
    eq(await restGet(BUYER.token, docB), 200, 'buyer GET lake 200');
    eq(await restGet(BUYER.token, docS), 403, 'buyer GET la mtu 403');
    eq(await restGet(STR.token, docB), 403, 'stranger GET 403');
    // List isiyochujwa hukataliwa kwa non-admin (rules sio filters — design).
    const b = await restList(BUYER.token, 'withdrawal_requests');
    eq(b.status, 403, 'buyer list (unfiltered) 403 by design');
    ev('visibility: admin list=2; buyer GET own=200, other=403; stranger=403; buyer list=403 (rules-aren\u2019t-filters)');
  });

  let reqB;
  await test('E-approve', async () => {
    const q = await db.collection('withdrawal_requests').where('userId', '==', B).get();
    reqB = q.docs[0].id;
    const bad = await call('withdrawalResolve', ADMIN, { requestId: reqB, decision: 'paid', note: 'ok' });
    eq(bad.ok, false, 'note fupi rejected');
    eq((await getd('withdrawal_requests/' + reqB)).status, 'pending', 'bado pending baada ya fail');
    const r = await call('withdrawalResolve', ADMIN, { requestId: reqB, decision: 'paid', note: 'M-Pesa 0712345678 imetumwa, txn ABC123' });
    assert(r.ok && r.data.status === 'paid', 'paid ok');
    eq(await bal(B), 14000, 'hakuna debit ya pili');
    const au = await db.collection('admin_audit_log').where('action', '==', 'WITHDRAWAL_PAID').get();
    eq(au.size, 1, 'audit WITHDRAWAL_PAID 1');
    ev('approve: note-fupi FAIL(pending); retry paid OK; bal locked 14000; audit=1');
  });

  await test('E-reject-refund', async () => {
    const q = await db.collection('withdrawal_requests').where('userId', '==', S).get();
    const reqS = q.docs[0].id;
    const r = await call('withdrawalResolve', ADMIN, { requestId: reqS, decision: 'rejected', note: 'Akaunti ya benki si sahihi, thibitisha' });
    assert(r.ok && r.data.status === 'rejected', 'rejected ok');
    eq(await bal(S), 12000, 'refund: 7000+5000');
    const rfs = await db.collection('wallet_ledger').where('withdrawalRequestId', '==', reqS).get();
    const types = rfs.docs.map(d => (d.data() || {}).type + ':' + (d.data() || {}).amountTSh).sort();
    eq(types.join(','), 'withdrawal_hold:-5000,withdrawal_refund:5000', 'hold+refund pair');
    const au = await db.collection('admin_audit_log').where('action', '==', 'WITHDRAWAL_REJECTED').get();
    eq(au.size, 1, 'audit WITHDRAWAL_REJECTED 1');
    ev('reject: status=rejected; bal 7000->12000; ledger hold -5000 + refund +5000; audit=1');
  });

  await test('E-duplicates', async () => {
    const d1 = await call('withdrawalRequest', tok(B), { amountTSh: 6000, channel: 'mobile', account: '0712345678', requestKey: 'EV-B1' });
    assert(d1.ok && d1.data.already === true, 'double-submit already:true');
    eq(await bal(B), 14000, 'debit mara moja tu');
    const d2 = await call('withdrawalResolve', ADMIN, { requestId: reqB, decision: 'paid', note: 'jaribio la pili kabisa' });
    assert(d2.ok && d2.data.already === true && d2.data.status === 'paid', 're-resolve already:true');
    const d3 = await call('withdrawalResolve', ADMIN, { requestId: reqB, decision: 'rejected', note: 'jaribio la refund baada ya paid' });
    assert(d3.ok && d3.data.already === true, 'paid->reject blocked (already)');
    eq(await bal(B), 14000, 'hakuna refund baada ya paid');
    ev('duplicates: request x2=already (bal 14000); resolve x2=already; paid->reject=already (no refund)');
  });

  await test('E-reconcile', async () => {
    // seed: buyer 20000, seller 12000 (bila ledger). balance == seed + sum(ledger).
    const lb = await ledgerSum(B), ls = await ledgerSum(S);
    eq(20000 + lb.sum, await bal(B), 'buyer reconcile: 20000 + (' + lb.sum + ')');
    eq(12000 + ls.sum, await bal(S), 'seller reconcile: 12000 + (' + ls.sum + ')');
    ev('reconcile: buyer rows[' + lb.rows.join(' | ') + '] sum=' + lb.sum + ' -> 20000-6000=14000 ✓; seller rows[' + ls.rows.join(' | ') + '] sum=' + ls.sum + ' -> 12000-5000+5000=12000 ✓');
  });

  await test('E-unauthorized', async () => {
    const q = await db.collection('withdrawal_requests').where('userId', '==', S).get();
    const reqS = q.docs[0].id;
    const u1 = await call('withdrawalResolve', tok(B), { requestId: reqS, decision: 'rejected', note: 'mimi si admin kabisa' });
    eq(u1.ok, false, 'non-admin rejected'); eq(u1.code, 'permission-denied', 'permission-denied');
    const u2 = await call('withdrawalResolve', tok(S), { requestId: reqS, decision: 'paid', note: 'mwenye ombi mwenyewe' });
    eq(u2.ok, false, 'owner cannot self-resolve'); eq(u2.code, 'permission-denied', 'permission-denied');
    let u3;
    try { await fns.withdrawalResolve.run({ data: { requestId: reqS, decision: 'paid', note: 'bila auth' }, auth: null, rawRequest: { headers: {} }, acceptsStreaming: false }); u3 = { ok: true }; }
    catch (e) { u3 = { ok: false, code: e && e.code }; }
    eq(u3.ok, false, 'unauthenticated rejected');
    ev('unauthorized: non-admin=permission-denied; owner-self=permission-denied; no-auth=' + u3.code);
  });

  await test('E-retry-after-failure', async () => {
    // Ombi linaloshindwa (insufficient) haliachi state iliyooza: top-up + retry key MOJA inafanikiwa.
    const f1 = await call('withdrawalRequest', tok(B), { amountTSh: 15000, channel: 'mobile', account: '0712345678', requestKey: 'EV-B2' });
    eq(f1.ok, false, '15000 > 14000 rejected');
    assert(/INSUFFICIENT/.test(f1.message || ''), 'INSUFFICIENT_BALANCE: ' + f1.message);
    // "Mapato" ya 6000 (kama escrow release ingeandika) — kisha retry na key ile ile.
    await db.doc('users/' + B).update({ walletBalance: 20000 });
    await db.collection('wallet_ledger').add({ userId: B, callerUid: 'ev-test', amountTSh: 6000, type: 'escrow_release', note: 'EVIDENCE top-up', byAdmin: false, createdAt: new Date().toISOString() });
    const r2 = await call('withdrawalRequest', tok(B), { amountTSh: 15000, channel: 'mobile', account: '0712345678', requestKey: 'EV-B2' });
    assert(r2.ok && r2.data.status === 'pending', 'retry key moja inafanikiwa');
    eq(await bal(B), 5000, '20000-15000');
    const nf = await call('withdrawalResolve', ADMIN, { requestId: 'wdr_nope_nothing', decision: 'paid', note: 'haipo kabisa hapa' });
    eq(nf.ok, false, 'not-found'); eq(nf.code, 'not-found', 'not-found');
    ev('retry: 15000 FAIL (14000); top-up +6000 (ledger); retry SAME key OK -> bal 5000; resolve-missing=not-found');
    const lb = await ledgerSum(B);
    eq(20000 + lb.sum, await bal(B), 'reconcile baada ya retry: 20000 + (' + lb.sum + ')');
    ev('reconcile-final: buyer sum=' + lb.sum + ' -> bal=' + await bal(B) + ' ✓');
  });

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nP5 EVIDENCE: ' + pass + ' passed, ' + fail + ' failed');
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/* ============================================================
 * PHASE 5 P5-1 — withdrawalRequest / withdrawalResolve + rules.
 * Emulator-only (FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST).
 * In-process callable .run() + Admin SDK + Firestore REST (rules).
 * ========================================================== */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) {
  console.error('BLOCKED: emulators zinahitajika (firestore :8085 + auth :9099).');
  process.exit(2);
}
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai-g1';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
process.env.ADMIN_EMAILS = 'admin@sokohai.test';

const realFetch = globalThis.fetch;
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();

/* ---------- harness ---------- */
const results = [];
let group = '';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
const ADMIN = { uid: 'admin1', token: { uid: 'admin1', email: 'admin@sokohai.test', email_verified: true } };
async function call(name, auth, data) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: typeof auth === 'string' ? tok(auth) : auth, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
function denied(r, codes, msg) {
  assert(!r.ok, msg + ' — ilitarajiwa kukataliwa, imekubaliwa: ' + JSON.stringify(r.data));
  if (codes) assert(codes.includes(r.code), msg + ' — code ' + r.code + ' (' + r.message + ')');
}
async function wipe() {
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe emulator');
}
const bal = async (uid) => Number(((await db.doc('users/' + uid).get()).data() || {}).walletBalance || 0);
const user = (uid, extra) => db.doc('users/' + uid).set(Object.assign({ uid, fullName: uid, walletBalance: 0 }, extra || {}));
const getd = async (p) => (await db.doc(p).get()).data();

/* ---------- Firestore REST (rules, kama kivinjari) ---------- */
async function idToken(uid) {
  const r = await realFetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: uid + '@rules.test', password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken, 'auth emulator signUp: ' + JSON.stringify(j).slice(0, 200));
  return { token: j.idToken, uid: j.localId };
}
function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restCreate(tk, col, id, data) {
  const r = await realFetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restPatch(tk, docPath, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await realFetch(`${DOCS}/${docPath}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restGet(tk, docPath) {
  const r = await realFetch(`${DOCS}/${docPath}`, { headers: { authorization: 'Bearer ' + tk } });
  return r.status;
}
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } })
  });
  assert(r.ok, 'rules load: ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

/* ============================================================ */
async function main() {
  group = 'W request'; console.log('\n[' + group + ']');
  await wipe();
  await user('w1', { walletBalance: 20000 });
  let req1 = null;

  await test('W1 ombi halali: debit atomiki + ledger + doc pending', async () => {
    const r = await call('withdrawalRequest', 'w1', { amountTSh: 6000, channel: 'mobile', account: '0712345678', requestKey: 'k1' });
    assert(r.ok, 'ombi limekubaliwa: ' + JSON.stringify(r));
    req1 = r.data.requestId;
    assert(req1 && req1.indexOf('wdr_') === 0, 'requestId namespaced: ' + req1);
    eq(r.data.status, 'pending', 'status');
    eq(await bal('w1'), 14000, 'salio limetengwa 20000->14000');
    const lg = await getd('wallet_ledger/' + req1);
    eq(lg && lg.type, 'withdrawal_hold', 'ledger type');
    eq(lg && lg.amountTSh, -6000, 'ledger debit');
    const rd = await getd('withdrawal_requests/' + req1);
    eq(rd && rd.status, 'pending', 'doc pending');
    eq(rd && rd.amount, 6000, 'doc amount');
    eq(rd && rd.channel, 'mobile', 'doc channel');
    eq(rd && rd.account, '0712345678', 'doc account');
    eq(rd && rd.userId, 'w1', 'doc userId');
  });

  await test('W2 kurudia (double-submit, key moja) = idempotent, debit mara moja', async () => {
    const r = await call('withdrawalRequest', 'w1', { amountTSh: 6000, channel: 'mobile', account: '0712345678', requestKey: 'k1' });
    assert(r.ok && r.data.already === true, 'already:true: ' + JSON.stringify(r.data));
    eq(r.data.requestId, req1, 'requestId ile ile');
    eq(await bal('w1'), 14000, 'hakuna debit ya pili');
  });

  await test('W3 chini ya TSh 5,000 inakataliwa', async () => {
    denied(await call('withdrawalRequest', 'w1', { amountTSh: 4999, channel: 'mobile', account: '0712345678', requestKey: 'k-low' }), ['invalid-argument'], '4999');
    denied(await call('withdrawalRequest', 'w1', { amountTSh: 0, channel: 'mobile', account: '0712345678', requestKey: 'k-zero' }), ['invalid-argument'], '0');
    eq(await bal('w1'), 14000, 'salio halijaguswa');
  });

  await test('W4 salio halitoshi linakataliwa, hakuna ombi linaloundwa', async () => {
    const r = await call('withdrawalRequest', 'w1', { amountTSh: 15000, channel: 'mobile', account: '0712345678', requestKey: 'k-big' });
    denied(r, ['failed-precondition'], 'insufficient');
    assert(/INSUFFICIENT_BALANCE/.test(r.message || ''), 'alama ya INSUFFICIENT_BALANCE: ' + r.message);
    eq(await bal('w1'), 14000, 'salio halijaguswa');
  });

  await test('W5 akaunti/channel/requestKey zisizo sahihi zinakataliwa', async () => {
    denied(await call('withdrawalRequest', 'w1', { amountTSh: 5000, channel: 'mobile', account: '12ab', requestKey: 'k-bad1' }), ['invalid-argument'], 'account fupi');
    denied(await call('withdrawalRequest', 'w1', { amountTSh: 5000, channel: 'crypto', account: '0712345678', requestKey: 'k-bad2' }), ['invalid-argument'], 'channel');
    denied(await call('withdrawalRequest', 'w1', { amountTSh: 5000, channel: 'mobile', account: '0712345678' }), ['invalid-argument'], 'key missing');
    denied(await call('withdrawalRequest', 'w1', { amountTSh: 5500.5, channel: 'mobile', account: '0712345678', requestKey: 'k-bad3' }), ['invalid-argument'], 'siyo integer');
    eq(await bal('w1'), 14000, 'salio halijaguswa');
  });

  await test('W6 bila login inakataliwa', async () => {
    denied(await call('withdrawalRequest', null, { amountTSh: 5000, channel: 'mobile', account: '0712345678', requestKey: 'k-noauth' }), ['unauthenticated'], 'no auth');
  });

  group = 'W resolve'; console.log('\n[' + group + ']');

  await test('W7 si-admin hawezi kufunga ombi', async () => {
    denied(await call('withdrawalResolve', 'w1', { requestId: req1, decision: 'paid', note: 'ninajaribu mwenyewe' }), ['permission-denied'], 'self-resolve');
    eq((await getd('withdrawal_requests/' + req1)).status, 'pending', 'bado pending');
  });

  await test('W8 admin paid: ombi linafungwa, hakuna debit ya pili, audit inaandikwa', async () => {
    const r = await call('withdrawalResolve', ADMIN, { requestId: req1, decision: 'paid', note: 'M-Pesa imetumwa 0712345678' });
    assert(r.ok && r.data.status === 'paid', 'paid: ' + JSON.stringify(r.data));
    eq(await bal('w1'), 14000, 'hakuna debit ya pili');
    const rd = await getd('withdrawal_requests/' + req1);
    eq(rd.status, 'paid', 'doc paid');
    eq(rd.resolvedBy, 'admin1', 'resolvedBy');
    const audits = await db.collection('admin_audit_log').where('action', '==', 'WITHDRAWAL_PAID').get();
    assert(audits.size >= 1, 'audit WITHDRAWAL_PAID ipo');
  });

  await test('W9 kufunga paid mara ya pili = already, pesa haziguswi', async () => {
    const r = await call('withdrawalResolve', ADMIN, { requestId: req1, decision: 'paid', note: 'kurudia tena hapa' });
    assert(r.ok && r.data.already === true && r.data.status === 'paid', 'already paid: ' + JSON.stringify(r.data));
    eq(await bal('w1'), 14000, 'salio halijabadilika');
  });

  await test('W10 admin reject: salio linarudishwa + refund ledger', async () => {
    const q = await call('withdrawalRequest', 'w1', { amountTSh: 5000, channel: 'bank', account: '1234567890', requestKey: 'k2' });
    assert(q.ok, 'ombi la pili: ' + JSON.stringify(q));
    eq(await bal('w1'), 9000, 'salio 14000->9000');
    const r = await call('withdrawalResolve', ADMIN, { requestId: q.data.requestId, decision: 'rejected', note: 'namba si sahihi, tuma tena' });
    assert(r.ok && r.data.status === 'rejected', 'rejected: ' + JSON.stringify(r.data));
    eq(await bal('w1'), 14000, 'salio limerudi 9000->14000');
    const refunds = await db.collection('wallet_ledger').where('type', '==', 'withdrawal_refund').where('withdrawalRequestId', '==', q.data.requestId).get();
    assert(refunds.size === 1 && refunds.docs[0].data().amountTSh === 5000, 'refund ledger +5000 ipo mara moja');
  });

  await test('W11 reject kwenye paid haurudishi pesa', async () => {
    const r = await call('withdrawalResolve', ADMIN, { requestId: req1, decision: 'rejected', note: 'jaribio la kurudisha' });
    assert(r.ok && r.data.already === true && r.data.status === 'paid', 'already paid, si rejected: ' + JSON.stringify(r.data));
    eq(await bal('w1'), 14000, 'hakuna refund ya wizi');
  });

  await test('W12 ombi lisilopo + note fupi zinakataliwa', async () => {
    denied(await call('withdrawalResolve', ADMIN, { requestId: 'wdr_ghost_x', decision: 'paid', note: 'hakuna ombi hili' }), ['not-found'], 'missing');
    const q = await call('withdrawalRequest', 'w1', { amountTSh: 5000, channel: 'mobile', account: '0712345678', requestKey: 'k3' });
    assert(q.ok, 'ombi k3');
    denied(await call('withdrawalResolve', ADMIN, { requestId: q.data.requestId, decision: 'paid', note: 'sawa' }), ['invalid-argument'], 'note fupi');
    eq((await getd('withdrawal_requests/' + q.data.requestId)).status, 'pending', 'bado pending baada ya note fupi');
    const p = await call('withdrawalResolve', ADMIN, { requestId: q.data.requestId, decision: 'paid', note: 'M-Pesa imetumwa sasa' });
    assert(p.ok, 'paid k3');
    eq(await bal('w1'), 9000, 'salio la mwisho 9000 (6000+5000 nje, 5000 zimerejeshwa)');
  });

  group = 'W rules'; console.log('\n[' + group + ']');
  await loadRules();
  await test('W13 kivinjari hakiwezi kuandika withdrawal_requests; kinasoma yake tu', async () => {
    const A = await idToken('wdr_a'), B = await idToken('wdr_b');
    await db.doc('withdrawal_requests/rr1').set({ userId: A.uid, amount: 5000, status: 'pending' });
    eq(await restCreate(A.token, 'withdrawal_requests', 'fake1', { userId: A.uid, amount: 5000, status: 'pending' }), 403, 'create denied');
    eq(await restPatch(A.token, 'withdrawal_requests/rr1', { status: 'paid' }), 403, 'update denied');
    eq(await restGet(A.token, 'withdrawal_requests/rr1'), 200, 'owner anaweza kusoma');
    eq(await restGet(B.token, 'withdrawal_requests/rr1'), 403, 'mgeni hawezi kusoma');
  });

  /* ---------------- muhtasari ---------------- */
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE5 WITHDRAWAL: ' + pass + ' passed, ' + fail + ' failed');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

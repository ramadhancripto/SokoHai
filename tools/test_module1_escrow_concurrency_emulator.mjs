#!/usr/bin/env node
/* ============================================================
 * [MODULE 1 2026-11-27] ESCROW CONCURRENCY / RETRY / PARTIAL-FAILURE (server, emulator)
 * A3 (duplicate seller payout) on the SERVER path: parallel buyer releases, parallel schedule
 * runs, release racing the schedule, release racing an admin refund, retries after success.
 * Business rules are NOT changed: auto-release only with system/config.escrow
 * .autoReleaseAfterDeliveryHours + server delivery proof + no open dispute. No payout is enabled.
 * Harness copied from tools/test_phase2_security.mjs (emulator only, PesaPal stubbed).
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai \
 *     "node tools/test_module1_escrow_concurrency_emulator.mjs"
 * ========================================================== */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) {
  console.error('BLOCKED: FIRESTORE_EMULATOR_HOST na FIREBASE_AUTH_EMULATOR_HOST zinahitajika.\n' +
    '  Endesha: firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_module1_escrow_concurrency_emulator.mjs"');
  process.exit(2);
}
/* [PHASE K 2026-11-10 T14] Heshimu project ya emulator (battery: demo-sokohai-g1); fallback ni ya awali. */
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
process.env.PESAPAL_CONSUMER_KEY = 'test-key';
process.env.PESAPAL_CONSUMER_SECRET = 'test-secret';
process.env.PESAPAL_BASE_URL = 'https://pesapal.stub/v3';
process.env.ADMIN_EMAILS = 'admin@sokohai.test';

/* ---------- PesaPal stub (mtandao tu) ---------- */
const realFetch = globalThis.fetch;
const PP = new Map(); // trackingId -> { amount, status_code, merchant_reference }
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith('https://pesapal.stub/')) {
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('/api/Auth/RequestToken')) return json({ token: 'stub-token', expiryDate: new Date(Date.now() + 3e5).toISOString(), status: '200' });
    if (u.includes('/GetTransactionStatus')) {
      const id = new URL(u).searchParams.get('orderTrackingId');
      const t = PP.get(id);
      if (!t) return json({ status_code: 0, payment_status_description: 'INVALID', order_tracking_id: id, amount: 0, currency: 'TZS', status: '200' });
      return json({ status_code: t.status_code ?? 1, payment_status_description: (t.status_code ?? 1) === 1 ? 'Completed' : 'Failed',
        order_tracking_id: id, merchant_reference: t.merchant_reference || '', amount: t.amount, currency: 'TZS', status: '200' });
    }
    return json({ error: { message: 'stub: haijulikani' } });
  }
  return realFetch(url, opts);
};

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
  PP.clear();
}
const bal = async (uid) => Number(((await db.doc('users/' + uid).get()).data() || {}).walletBalance || 0);
const user = (uid, extra) => db.doc('users/' + uid).set(Object.assign({ uid, fullName: uid, walletBalance: 0 }, extra || {}));
// [REMEDIATION R2] transporters in these fixtures are admin-approved agents
// (deliveryAccept now requires users.isApprovedAgent + agentApprovedBy).
const AGENT = { isApprovedAgent: true, agentApprovedBy: 'admin_test' };
const isTransporterFixture = (u) => /^driver/.test(u) || u === 'eve';
const seedUsers = async (list) => { for (const u of list) await user(u, isTransporterFixture(u) ? AGENT : null); };
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const exists = async (p) => (await db.doc(p).get()).exists;
// Malipo ya PesaPal yaliyoanzishwa na `uid` kupitia pesapalCheckout (rekodi ya server)
async function ppPaid(trackingId, amount, uid, merchantRef) {
  const mref = merchantRef || ('M_' + trackingId);
  PP.set(trackingId, { amount, status_code: 1, merchant_reference: mref });
  if (uid) await db.doc('escrow_holds/ppinit_' + mref).set({ kind: 'pesapal_init', uid, amount, merchantReference: mref });
  return mref;
}

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
async function restDelete(tk, docPath) {
  const r = await realFetch(`${DOCS}/${docPath}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + tk } });
  return r.status;
}
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } })
  });
  assert(r.ok, 'rules load: ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

/* ---------- Phase 2 helpers ---------- */
const H = (s) => createHash('sha256').update(String(s)).digest('hex');
const later = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const get = async (p) => (await db.doc(p).get()).data() || {};
// Oda iliyolipwa KWELI (PesaPal stub + hold ya server kupitia pesapalTransactionStatus).
async function paidOrder(id, amount, o) {
  o = o || {};
  const buyer = o.buyerId || 'buyer';
  await ppPaid('TX-' + id, amount, buyer);
  const od = Object.assign({ buyerId: buyer, sellerId: 'seller', amount, status: 'held', paymentRef: 'TX-' + id, itemId: 'item_' + id }, o);
  // [REPAIR 2026-10 H2] chanzo cha bei cha server: bidhaa halisi yenye bei = kiasi.
  if (!od.negotiationId && !od.pricedByServer) await db.doc('products/' + od.itemId).set({ title: 'Bidhaa ' + od.itemId, price: Number(od.amount || 0), stock: 5, userId: od.sellerId });
  await db.doc('orders/' + id).set(od);
  const st = await call('pesapalTransactionStatus', buyer, { orderTrackingId: 'TX-' + id });
  assert(st.ok, 'settle ' + id + ': ' + st.message);
  assert(await exists('escrow_holds/order_' + id), 'hold ya server ' + id);
}
// Safari ya oda ya bidhaa iliyoundwa na mnunuzi (kama 43-delivery-choice).
const newRide = (id, o) => db.doc('ride_requests/' + id).set(Object.assign({ customerId: 'buyer', status: 'searching', fare: 3000, price: 3000 }, o || {}));
// Mnyororo kamili wa custody wa server: accept → seller handover → pickup → transit.
async function custodyChain(rideId, driver, sellerUid) {
  const a = await call('deliveryAccept', driver, { rideId });
  assert(a.ok, 'accept: ' + a.message);
  const s = await call('deliveryConfirmCustody', sellerUid, { rideId, role: 'seller', token: a.data.token });
  assert(s.ok, 'seller handover: ' + s.message);
  const p = await call('deliveryConfirmCustody', driver, { rideId, role: 'transporter', token: a.data.token });
  assert(p.ok, 'pickup: ' + p.message);
  const t = await call('deliveryStartTransit', driver, { rideId });
  assert(t.ok, 'transit: ' + t.message);
  return a.data.token;
}
async function signUp(email) {
  const r = await realFetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json(); assert(j.idToken, 'signUp ' + email);
  return { token: j.idToken, uid: j.localId };
}
async function signIn(email) {
  const r = await realFetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json(); assert(j.idToken, 'signIn ' + email);
  return { token: j.idToken, uid: j.localId };
}
const autoRelease = (hoursAhead) => fns.sokopayAutoRelease.run({ scheduleTime: later(hoursAhead || 0) });

/* ============================================================ */
const ledgerFor = async (orderId) => {
  const s = await db.collection('wallet_ledger').get();
  return s.docs.filter((d) => JSON.stringify(d.data()).indexOf('"' + orderId + '"') !== -1 || d.id.indexOf(orderId) !== -1);
};
async function delivered(id, seller) {
  const code = await call('orderDeliveryCodeIssue', 'buyer', { orderId: id }); assert(code.ok, code.message);
  const ok = await call('orderConfirmDelivery', seller, { orderId: id, code: code.data.code }); assert(ok.ok, ok.message);
}
async function main() {
  await loadRules();
  group = 'M1 escrow concurrency'; console.log('\n[' + group + ']');
  await wipe();
  await seedUsers(['buyer', 'sA', 'sB', 'sC', 'sD', 'sE']);

  await test('C1 six PARALLEL buyer escrowRelease calls pay the seller exactly once', async () => {
    await paidOrder('c1', 5000, { sellerId: 'sA' });
    const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => call('escrowRelease', 'buyer', { orderId: 'c1' })));
    eq(await bal('sA'), 5000, 'seller balance');
    assert(rs.every((r) => r.ok), 'every call answers ok (already for the losers): ' + JSON.stringify(rs.filter((r) => !r.ok)));
    eq(rs.filter((r) => !(r.data && r.data.already)).length, 1, 'exactly one call performed the release');
    const rows = (await ledgerFor('c1')).filter((d) => /release/i.test(d.id + JSON.stringify(d.data())));
    assert(rows.length >= 1, 'a release ledger row exists');
    eq((await db.doc('escrow_holds/order_c1').get()).data().released, true, 'hold released');
  });

  await test('C2 retry after a completed release (new session) pays nothing more', async () => {
    const r = await call('escrowRelease', 'buyer', { orderId: 'c1' });
    assert(r.ok && r.data.already, 'already: ' + JSON.stringify(r));
    eq(await bal('sA'), 5000, 'unchanged');
  });

  await test('C3 schedule x4 in PARALLEL + buyer release at the same time -> paid once (config 48h, server proof)', async () => {
    await db.doc('system/config').set({ escrow: { autoReleaseAfterDeliveryHours: 48 } }, { merge: true });
    await paidOrder('c3', 7000, { sellerId: 'sB' });
    await delivered('c3', 'sB');
    await Promise.all([autoRelease(49), autoRelease(49), autoRelease(49), autoRelease(49), call('escrowRelease', 'buyer', { orderId: 'c3' })]);
    eq(await bal('sB'), 7000, 'seller paid once');
    await autoRelease(200);
    eq(await bal('sB'), 7000, 'later schedule runs pay nothing more');
  });

  await test('C4 business rule kept: delivered but window not reached -> parallel schedules pay nothing', async () => {
    await paidOrder('c4', 3000, { sellerId: 'sC' });
    await delivered('c4', 'sC');
    await Promise.all([autoRelease(10), autoRelease(10), autoRelease(10)]);
    eq(await bal('sC'), 0, 'no early release');
  });

  await test('C5 business rule kept: open dispute -> parallel schedules + buyer release pay nothing', async () => {
    await paidOrder('c5', 4000, { sellerId: 'sD' });
    await delivered('c5', 'sD');
    const d = await call('disputeOpen', 'buyer', { orderId: 'c5', reason: 'Bidhaa imefika ikiwa mbovu kabisa' }); assert(d.ok, d.message);
    const rs = await Promise.all([autoRelease(100), autoRelease(100), call('escrowRelease', 'buyer', { orderId: 'c5' })]);
    eq(await bal('sD'), 0, 'frozen by dispute');
    assert(!rs[2].ok, 'buyer release refused while dispute is open');
  });

  await test('C6 admin REFUND racing admin RELEASE on the same dispute -> exactly one outcome, money conserved', async () => {
    const before = await bal('buyer');
    const rs = await Promise.all([
      call('adminResolveDispute', ADMIN, { orderId: 'c5', outcome: 'refund_buyer', reason: 'Picha zinaonyesha bidhaa imevunjika' }),
      call('adminResolveDispute', ADMIN, { orderId: 'c5', outcome: 'release_seller', reason: 'Muuzaji ametoa ushahidi wa kutosha' })
    ]);
    assert(rs.some((r) => r.ok), 'one resolution succeeded: ' + JSON.stringify(rs));
    const paidSeller = await bal('sD'), refunded = (await bal('buyer')) - before;
    eq(paidSeller + refunded, 4000, 'seller + buyer refund == amount (no double movement)');
    assert(paidSeller === 0 || refunded === 0, 'only one side received money: seller=' + paidSeller + ' refund=' + refunded);
    const again = await Promise.all([autoRelease(300), call('escrowRelease', 'buyer', { orderId: 'c5' })]);
    eq((await bal('sD')) + (await bal('buyer')) - before, 4000, 'later attempts move nothing');
  });

  await test('C7 payouts stay disabled: no withdrawal/payout document is created by any of the above', async () => {
    const w = await db.collection('withdrawal_requests').get();
    eq(w.size, 0, 'no withdrawal requests');
  });

  await db.doc('system/config').set({ escrow: {} }, { merge: true });
  const passed = results.filter((r) => r.ok).length, failed = results.length - passed;
  console.log(`\nMODULE 1 ESCROW CONCURRENCY (emulator): ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });

#!/usr/bin/env node
/* ============================================================
 * PHASE 1 SECURITY TESTS (2026-09) — R1 walletAdjust, R2 escrowRelease,
 * R4 SokoPay links + auto-release, R5 deliveryComplete, rules, H2/H3.
 *
 * Inaendeshwa dhidi ya FIREBASE EMULATOR PEKEE (haigusi production, hakuna
 * pesa halisi). PesaPal inaigwa (stub ya fetch) — GetTransactionStatus ya
 * kweli inabaki kwenye code; tunabadilisha jibu la mtandao tu.
 *
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai \
 *     "node tools/test_phase1_security.mjs"
 *   (au: npm run test:security  — ndani ya emulators:exec)
 *
 * Bila FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST script
 * inakataa kuendesha (BLOCKED) — kamwe haiendeshwi dhidi ya production.
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
    '  Endesha: firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_phase1_security.mjs"');
  process.exit(2);
}
const PROJECT = 'demo-sokohai';
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

/* ============================================================ */
async function main() {
  /* ---------------- R1 walletAdjust ---------------- */
  group = 'R1 walletAdjust'; console.log('\n[' + group + ']');
  await wipe();
  await user('alice', { walletBalance: 5000 });
  await user('bob', { walletBalance: 1000 });
  await user('agent1', { walletBalance: 0 });
  await user('member1', { registeredThroughAgentId: 'agent1' });
  await user('member2', { registeredThroughAgentId: 'someoneElse' });

  await test('self-credit (adjustment/payout/refund) inakataliwa', async () => {
    for (const type of ['adjustment', 'payout', 'escrow_release', 'refund', 'commission']) {
      denied(await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: 100000, type }), ['permission-denied'], type);
    }
    eq(await bal('alice'), 5000, 'salio halijabadilika');
  });
  await test('kuongeza wallet ya mtu mwingine inakataliwa', async () => {
    denied(await call('walletAdjust', 'alice', { docId: 'bob', amountTSh: 500, type: 'deposit', orderTrackingId: 'X' }), ['permission-denied'], 'credit bob');
    eq(await bal('bob'), 1000, 'bob hakubadilika');
  });
  await test('kutoa wallet ya mtu mwingine inakataliwa', async () => {
    denied(await call('walletAdjust', 'alice', { docId: 'bob', amountTSh: -500, type: 'purchase' }), ['permission-denied'], 'debit bob');
    eq(await bal('bob'), 1000, 'bob hakubadilika');
  });
  await test('mtumiaji anatoa salio lake (halali) — ledger namespaced', async () => {
    const r = await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: -1500, type: 'purchase', ledgerKey: 'order_EVIL_released' });
    assert(r.ok, r.message);
    eq(await bal('alice'), 3500, 'salio baada ya kutoa');
    assert(!(await exists('wallet_ledger/order_EVIL_released')), 'funguo ya server haikukaliwa');
    assert(await exists('wallet_ledger/u_alice_order_EVIL_released'), 'ledger namespaced');
  });
  await test('kutoa zaidi ya salio inakataliwa (INSUFFICIENT_BALANCE)', async () => {
    const r = await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: -999999, type: 'purchase' });
    denied(r, ['failed-precondition'], 'overdraft'); assert(/INSUFFICIENT/.test(r.message), r.message);
    eq(await bal('alice'), 3500, 'salio halijabadilika');
  });
  await test('deposit bila muamala / muamala usiolipwa inakataliwa', async () => {
    denied(await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: 20000, type: 'deposit', ledgerKey: 'x' }), ['failed-precondition'], 'bila tid');
    denied(await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: 20000, type: 'deposit', orderTrackingId: 'TX-UNPAID' }), ['failed-precondition'], 'haijalipwa');
    PP.set('TX-FAILED', { amount: 20000, status_code: 2 });
    denied(await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: 20000, type: 'deposit', orderTrackingId: 'TX-FAILED' }), ['failed-precondition'], 'failed');
    eq(await bal('alice'), 3500, 'salio halijabadilika');
  });
  await test('deposit yenye kiasi tofauti na PesaPal inakataliwa', async () => {
    await ppPaid('TX-DEP-1', 1000, 'alice');
    denied(await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: 100000, type: 'deposit', orderTrackingId: 'TX-DEP-1' }), ['failed-precondition'], 'kiasi');
    eq(await bal('alice'), 3500, 'salio halijabadilika');
  });
  await test('deposit halali (PesaPal imethibitisha) + replay ni idempotent', async () => {
    await ppPaid('TX-DEP-2', 20000, 'alice');
    const r = await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: 20000, type: 'deposit', ledgerKey: 'deposit_TX-DEP-2', orderTrackingId: 'TX-DEP-2' });
    assert(r.ok, r.message); eq(await bal('alice'), 23500, 'deposit imeingia');
    const r2 = await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: 20000, type: 'deposit', ledgerKey: 'another_key', orderTrackingId: 'TX-DEP-2' });
    assert(r2.ok && r2.data.already, 'replay = already'); eq(await bal('alice'), 23500, 'haikuongezwa mara mbili');
  });
  await test('deposit ya muamala wa mtu mwingine inakataliwa', async () => {
    await ppPaid('TX-DEP-BOB', 7000, 'bob');
    denied(await call('walletAdjust', 'alice', { docId: 'alice', amountTSh: 7000, type: 'deposit', orderTrackingId: 'TX-DEP-BOB' }), ['permission-denied'], 'si wako');
    eq(await bal('alice'), 23500, 'salio halijabadilika');
  });
  await test('kamisheni ya usajili: halali mara moja; mwanachama wa mwingine / bila ada inakataliwa', async () => {
    await ppPaid('TX-REG-1', 2100, 'agent1');
    const bad1 = await call('walletAdjust', 'agent1', { docId: 'agent1', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'member2', orderTrackingId: 'TX-REG-1' });
    denied(bad1, ['permission-denied'], 'member wa wakala mwingine');
    const bad2 = await call('walletAdjust', 'agent1', { docId: 'agent1', amountTSh: 5000, type: 'commission', purpose: 'offline_registration', memberUid: 'member1', orderTrackingId: 'TX-REG-1' });
    denied(bad2, ['failed-precondition'], 'kiasi kikubwa');
    const bad3 = await call('walletAdjust', 'agent1', { docId: 'agent1', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'member1', orderTrackingId: 'TX-NOPE' });
    denied(bad3, ['failed-precondition'], 'ada haijalipwa');
    const ok = await call('walletAdjust', 'agent1', { docId: 'agent1', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'member1', orderTrackingId: 'TX-REG-1', ledgerKey: 'offreg_member1' });
    assert(ok.ok, ok.message); eq(await bal('agent1'), 1260, 'kamisheni');
    const again = await call('walletAdjust', 'agent1', { docId: 'agent1', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'member1', orderTrackingId: 'TX-REG-1', ledgerKey: 'other' });
    assert(again.ok && again.data.already, 'mara moja tu'); eq(await bal('agent1'), 1260, 'haikurudiwa');
  });
  await test('admin (email iliyothibitishwa) anaweza kurekebisha; email isiyothibitishwa haiwezi', async () => {
    const fake = { uid: 'mallory', token: { uid: 'mallory', email: 'admin@sokohai.test', email_verified: false } };
    denied(await call('walletAdjust', fake, { docId: 'bob', amountTSh: 100000, type: 'adjustment' }), ['permission-denied'], 'unverified admin email');
    const r = await call('walletAdjust', ADMIN, { docId: 'bob', amountTSh: 250, type: 'adjustment', ledgerKey: 'adm_fix_1' });
    assert(r.ok, r.message); eq(await bal('bob'), 1250, 'admin adjust');
    denied(await call('walletAdjust', ADMIN, { docId: 'bob', amountTSh: 60000000, type: 'adjustment' }), ['out-of-range'], 'cap');
    denied(await call('walletAdjust', null, { docId: 'bob', amountTSh: 1 }), ['unauthenticated'], 'bila login');
  });

  /* ---------------- R2 escrowRelease ---------------- */
  group = 'R2 escrowRelease'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller', 'eve', 'accomplice']) await user(u);
  const order = (id, o) => db.doc('orders/' + id).set(Object.assign({ buyerId: 'buyer', sellerId: 'seller', amount: 10000, status: 'held', itemId: 'item_' + id }, o || {}));

  await test('oda ya uongo "held" (hakuna malipo ya server) inakataliwa', async () => {
    await order('forged1', { paymentVerified: true, paymentStatus: 'paid', paymentRef: 'TX-NONE' });
    const r = await call('escrowRelease', 'buyer', { orderId: 'forged1' });
    denied(r, ['failed-precondition'], 'forged held');
    eq(await bal('seller'), 0, 'muuzaji hakulipwa');
  });
  await test('mnunuzi = muuzaji (self-trade) inakataliwa hata ikiwa imelipwa', async () => {
    await ppPaid('TX-SELF', 10000, 'eve');
    await order('self1', { buyerId: 'eve', sellerId: 'eve', paymentRef: 'TX-SELF' });
    denied(await call('escrowRelease', 'eve', { orderId: 'self1' }), ['failed-precondition'], 'self trade');
    eq(await bal('eve'), 0, 'hakuna mint');
  });
  await test('oda isiyokuwepo / mtu asiye mnunuzi inakataliwa', async () => {
    denied(await call('escrowRelease', 'buyer', { orderId: 'nope' }), ['not-found'], 'hakuna oda');
    await ppPaid('TX-O1', 10000, 'buyer');
    await order('o1', { paymentRef: 'TX-O1' });
    denied(await call('escrowRelease', 'eve', { orderId: 'o1' }), ['permission-denied'], 'mtu wa tatu');
    denied(await call('escrowRelease', 'seller', { orderId: 'o1' }), ['permission-denied'], 'muuzaji hawezi kujitolea');
    eq(await bal('seller'), 0, 'hakuna malipo');
  });
  await test('oda ya uongo inayotumia muamala wa mtu mwingine inakataliwa', async () => {
    await ppPaid('TX-VICTIM', 10000, 'buyer');
    await order('steal1', { buyerId: 'eve', sellerId: 'accomplice', paymentRef: 'TX-VICTIM' });
    denied(await call('escrowRelease', 'eve', { orderId: 'steal1' }), ['failed-precondition'], 'muamala si wa eve');
    eq(await bal('accomplice'), 0, 'accomplice hakulipwa');
  });
  await test('kiasi: oda kubwa kuliko kilicholipwa inakataliwa', async () => {
    await ppPaid('TX-SMALL', 1000, 'buyer');
    await order('big1', { amount: 10000, paymentRef: 'TX-SMALL' });
    denied(await call('escrowRelease', 'buyer', { orderId: 'big1' }), ['failed-precondition'], 'amount > paid');
    eq(await bal('seller'), 0, 'hakuna malipo');
  });
  await test('kiasi kilichobadilishwa baada ya uthibitisho inakataliwa', async () => {
    await ppPaid('TX-AM', 10000, 'buyer');
    await order('am1', { paymentRef: 'TX-AM' });
    const st = await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-AM' });
    assert(st.ok, 'status: ' + st.message);
    assert(await exists('escrow_holds/order_am1'), 'hold imeundwa na server');
    await db.doc('orders/am1').update({ amount: 900000 });
    denied(await call('escrowRelease', 'buyer', { orderId: 'am1' }), ['failed-precondition'], 'amount mismatch');
    eq(await bal('seller'), 0, 'hakuna malipo');
  });
  await test('muuzaji aliyebadilishwa baada ya uthibitisho inakataliwa', async () => {
    await ppPaid('TX-SW', 10000, 'buyer');
    await order('sw1', { paymentRef: 'TX-SW' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-SW' });
    await db.doc('orders/sw1').update({ sellerId: 'accomplice' });
    denied(await call('escrowRelease', 'buyer', { orderId: 'sw1' }), ['failed-precondition'], 'seller mismatch');
    eq(await bal('accomplice'), 0, 'hakuna malipo');
  });
  await test('release halali (PesaPal imethibitisha) + mara moja tu', async () => {
    const r = await call('escrowRelease', 'buyer', { orderId: 'o1' });
    assert(r.ok, r.message);
    eq(await bal('seller'), 10000, 'muuzaji amelipwa (fees: FREE)');
    eq((await db.doc('orders/o1').get()).data().status, 'completed', 'oda completed');
    eq((await db.doc('escrow_holds/order_o1').get()).data().released, true, 'hold released');
    const r2 = await call('escrowRelease', 'buyer', { orderId: 'o1' });
    assert(r2.ok && r2.data.already, 'idempotent');
    // kurudisha status kuwa 'held' kwa mkono hakuruhusu malipo ya pili
    await db.doc('orders/o1').update({ status: 'held' });
    const r3 = await call('escrowRelease', 'buyer', { orderId: 'o1' });
    assert(r3.ok && r3.data.already, 'hold/marker huzuia malipo ya pili');
    eq(await bal('seller'), 10000, 'hakuna malipo ya pili');
  });
  await test('admin anaweza kutoa escrow iliyothibitishwa', async () => {
    await ppPaid('TX-ADM', 4000, 'buyer');
    await order('adm1', { amount: 4000, paymentRef: 'TX-ADM' });
    const r = await call('escrowRelease', ADMIN, { orderId: 'adm1' });
    assert(r.ok, r.message); eq(await bal('seller'), 14000, 'admin release');
  });

  /* ---------------- R4 SokoPay links + auto-release ---------------- */
  group = 'R4 SokoPay links'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller', 'eve']) await user(u);
  await user('rich', { walletBalance: 100000 });
  const link = (id, o) => db.doc('sokopay_links/' + id).set(Object.assign({ userId: 'seller', price: 5000, status: 'pending', title: 'Kazi' }, o || {}));

  await test('link ya uongo "held" (paidAt ya zamani, hakuna malipo) — release na auto-release zinakataliwa', async () => {
    await link('fake1', { status: 'held', buyerId: 'buyer', paidAt: hoursAgo(72), transactionId: 'TX-FAKE' });
    denied(await call('haipayReleaseLink', 'buyer', { linkId: 'fake1' }), ['failed-precondition'], 'manual');
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    eq(await bal('seller'), 0, 'muuzaji hakulipwa');
    eq((await db.doc('sokopay_links/fake1').get()).data().status, 'held', 'haikukamilishwa');
  });
  await test('oda ya uongo "shipped" (shippedAt ya zamani) haitolewi na auto-release', async () => {
    await db.doc('orders/fakeShip').set({ buyerId: 'eve', sellerId: 'seller', amount: 50000, status: 'shipped', shippedAt: hoursAgo(72) });
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    eq(await bal('seller'), 0, 'hakuna malipo');
    eq((await db.doc('orders/fakeShip').get()).data().status, 'shipped', 'haikubadilika');
  });
  await test('link halali ya PesaPal: server inaifunga, mnunuzi anatoa', async () => {
    await ppPaid('TX-L1', 5000, 'buyer');
    await link('l1', { buyerId: 'buyer', transactionId: 'TX-L1' });
    const st = await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-L1' });
    assert(st.ok, st.message);
    const L = (await db.doc('sokopay_links/l1').get()).data();
    eq(L.status, 'held', 'server imeweka held'); eq(L.paymentVerified, true, 'verified');
    denied(await call('haipayReleaseLink', 'seller', { linkId: 'l1' }), ['permission-denied'], 'muuzaji hawezi kujitolea');
    denied(await call('haipayReleaseLink', 'eve', { linkId: 'l1' }), ['permission-denied'], 'mtu wa tatu');
    const r = await call('haipayReleaseLink', 'buyer', { linkId: 'l1' });
    assert(r.ok, r.message);
    const got = await bal('seller'); assert(got > 0 && got <= 5000, 'muuzaji amelipwa ndani ya kiasi (' + got + ')');
    const r2 = await call('haipayReleaseLink', 'buyer', { linkId: 'l1' });
    assert(r2.ok, 'idempotent'); eq(await bal('seller'), got, 'mara moja tu');
  });
  await test('link: kiasi kilichobadilishwa baada ya malipo inakataliwa', async () => {
    await ppPaid('TX-L2', 5000, 'buyer');
    await link('l2', { buyerId: 'buyer', transactionId: 'TX-L2' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-L2' });
    await db.doc('sokopay_links/l2').update({ price: 500000 });
    const before = await bal('seller');
    denied(await call('haipayReleaseLink', 'buyer', { linkId: 'l2' }), ['failed-precondition'], 'amount');
    eq(await bal('seller'), before, 'hakuna malipo');
  });
  await test('link: mnunuzi/muuzaji waliobadilishwa inakataliwa', async () => {
    await ppPaid('TX-L3', 5000, 'buyer');
    await link('l3', { buyerId: 'buyer', transactionId: 'TX-L3' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-L3' });
    await db.doc('sokopay_links/l3').update({ buyerId: 'eve' });
    denied(await call('haipayReleaseLink', 'eve', { linkId: 'l3' }), ['failed-precondition'], 'buyer mismatch');
    await db.doc('sokopay_links/l3').update({ buyerId: 'buyer', userId: 'eve' });
    denied(await call('haipayReleaseLink', 'buyer', { linkId: 'l3' }), ['failed-precondition'], 'seller mismatch');
    eq(await bal('eve'), 0, 'eve hakulipwa');
  });
  await test('link: muamala mdogo kuliko bei haufungi link', async () => {
    await ppPaid('TX-L4', 100, 'buyer');
    await link('l4', { buyerId: 'buyer', transactionId: 'TX-L4' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-L4' });
    assert(!(await exists('escrow_holds/link_l4')), 'hakuna hold');
    eq((await db.doc('sokopay_links/l4').get()).data().status, 'pending', 'bado pending');
  });
  await test('sokopayLinkWalletPay: atomic debit + held; replay; mlipaji wa pili/muuzaji/bei iliyobadilika zinakataliwa', async () => {
    await link('w1', { price: 30000 });
    denied(await call('sokopayLinkWalletPay', 'seller', { linkId: 'w1' }), ['failed-precondition'], 'muuzaji kujilipia');
    denied(await call('sokopayLinkWalletPay', 'rich', { linkId: 'w1', expectedPrice: 100 }), ['failed-precondition'], 'bei imebadilika');
    denied(await call('sokopayLinkWalletPay', 'buyer', { linkId: 'w1' }), ['failed-precondition'], 'salio halitoshi');
    const r = await call('sokopayLinkWalletPay', 'rich', { linkId: 'w1', expectedPrice: 30000 });
    assert(r.ok, r.message); eq(await bal('rich'), 70000, 'imekatwa');
    eq((await db.doc('sokopay_links/w1').get()).data().status, 'held', 'held');
    const r2 = await call('sokopayLinkWalletPay', 'rich', { linkId: 'w1' });
    assert(r2.ok && r2.data.already, 'replay'); eq(await bal('rich'), 70000, 'haikukatwa mara mbili');
    denied(await call('sokopayLinkWalletPay', 'buyer', { linkId: 'w1' }), ['failed-precondition'], 'mlipaji wa pili');
  });
  await test('auto-release: saa 24 kuanzia uthibitisho wa SERVER (paidAt ya client haitoshi)', async () => {
    const before = await bal('seller');
    // w1 imethibitishwa sasa hivi; client anajaribu kurudisha paidAt nyuma
    await db.doc('sokopay_links/w1').update({ paidAt: hoursAgo(72) });
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    eq(await bal('seller'), before, 'haikutolewa kabla ya saa 24 za server');
    // saa 25 baada ya uthibitisho wa server → inatolewa
    await db.doc('escrow_holds/link_w1').update({ verifiedAt: hoursAgo(25) });
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    const after = await bal('seller');
    assert(after > before && after <= before + 30000, 'auto-release halali (' + before + ' → ' + after + ')');
    eq((await db.doc('sokopay_links/w1').get()).data().status, 'completed', 'completed');
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    eq(await bal('seller'), after, 'haikurudiwa');
  });

  /* ---------------- R5 deliveryComplete ---------------- */
  group = 'R5 deliveryComplete'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['cust', 'driver', 'seller', 'eve', 'driver2']) await user(u);
  const TOKEN_C = 'DL-7Q4XK9';
  const H = (s) => createHash('sha256').update(s).digest('hex');
  async function ride(id, o) {
    await db.doc('ride_requests/' + id).set(Object.assign({
      customerId: 'cust', driverId: 'driver', status: 'in_transit', acceptedAt: hoursAgo(2), custodyStage: 'transit',
      transferCodeHash: H(TOKEN_C), transferTokenStatus: 'issued', fare: 3000, price: 3000,
      // [PHASE 2 P1] nauli iliyogandishwa na server (deliveryAccept) + makabidhiano ya muuzaji halisi
      agreedFare: 3000, sellerConfirmedBy: 'seller'
    }, o || {}));
  }
  await ppPaid('TX-R1', 20000, 'cust');
  await db.doc('orders/ord1').set({ buyerId: 'cust', sellerId: 'seller', amount: 20000, status: 'held', paymentRef: 'TX-R1', itemId: 'goods1' });
  await call('pesapalTransactionStatus', 'cust', { orderTrackingId: 'TX-R1' });

  await test('safari ya uongo (status in_transit bila acceptedAt/custody ya server) inakataliwa', async () => {
    await db.doc('ride_requests/fake1').set({ customerId: 'eve', driverId: 'eve', status: 'in_transit', price: 5000000 });
    denied(await call('deliveryComplete', 'eve', { rideId: 'fake1' }), ['failed-precondition'], 'fake ride');
    await ride('fake2', { customerId: 'eve', driverId: 'eve', custodyStage: null, transferCodeHash: null });
    denied(await call('deliveryComplete', 'eve', { rideId: 'fake2' }), ['failed-precondition'], 'no custody');
    eq(await bal('eve'), 0, 'hakuna malipo');
  });
  await test('mpigaji asiye mhusika / dereva mwingine inakataliwa', async () => {
    await ride('r1', { orderId: 'ord1' });
    denied(await call('deliveryComplete', 'eve', { rideId: 'r1', transferCode: TOKEN_C }), ['permission-denied'], 'mtu wa tatu');
    denied(await call('deliveryComplete', 'driver2', { rideId: 'r1', transferCode: TOKEN_C }), ['permission-denied'], 'dereva mwingine');
    denied(await call('deliveryComplete', 'seller', { rideId: 'r1', transferCode: TOKEN_C }), ['permission-denied'], 'muuzaji');
  });
  await test('Token C: haipo / ya uongo inakataliwa', async () => {
    denied(await call('deliveryComplete', 'driver', { rideId: 'r1' }), ['failed-precondition'], 'bila token');
    denied(await call('deliveryComplete', 'driver', { rideId: 'r1', transferCode: 'DL-WRONG1' }), ['failed-precondition'], 'token ya uongo');
    await ride('r0', { transferCodeHash: null });
    denied(await call('deliveryComplete', 'driver', { rideId: 'r0' }), ['failed-precondition'], 'dereva bila Token C iliyotolewa');
    eq(await bal('driver'), 0, 'hakuna malipo');
  });
  await test('uwasilishaji halali: malipo kutoka escrow ya oda (dereva + muuzaji ≤ escrow)', async () => {
    const r = await call('deliveryComplete', 'driver', { rideId: 'r1', transferCode: TOKEN_C });
    assert(r.ok, r.message);
    eq(r.data.payoutStatus, 'paid_from_escrow', 'payoutStatus');
    eq(await bal('driver'), 3000, 'dereva');
    eq(await bal('seller'), 17000, 'muuzaji');
    const r2 = await call('deliveryComplete', 'driver', { rideId: 'r1', transferCode: TOKEN_C });
    // baada ya kukamilika mzigo uko kwa mpokeaji: dereva anapata 'already' au kukataliwa — kamwe malipo ya pili
    assert((r2.ok && r2.data.already) || !r2.ok, 'replay'); eq(await bal('driver'), 3000, 'mara moja');
    const r3 = await call('deliveryComplete', 'cust', { rideId: 'r1' });
    assert(r3.ok && r3.data.already, 'mpokeaji: already'); eq(await bal('seller'), 17000, 'muuzaji mara moja');
  });
  await test('bei ya kiholela kwenye ride bila oda iliyolipwa → hakuna pesa inayotengenezwa', async () => {
    await ride('r2', { price: 99999999, fare: 99999999, cargoPrice: 99999999 });
    const r = await call('deliveryComplete', 'driver', { rideId: 'r2', transferCode: TOKEN_C });
    assert(r.ok, r.message);
    eq(r.data.payoutStatus, 'unfunded', 'unfunded'); eq(r.data.finalPayout, 0, 'finalPayout 0');
    eq(await bal('driver'), 3000, 'salio halijabadilika');
  });
  await test('bei ya kiholela yenye oda iliyolipwa → imefungwa ndani ya escrow', async () => {
    await ppPaid('TX-R3', 8000, 'cust');
    await db.doc('orders/ord3').set({ buyerId: 'cust', sellerId: 'seller', amount: 8000, status: 'held', paymentRef: 'TX-R3' });
    await call('pesapalTransactionStatus', 'cust', { orderTrackingId: 'TX-R3' });
    await ride('r3', { orderId: 'ord3', fare: 5000000, price: 5000000 });
    const d0 = await bal('driver'), s0 = await bal('seller');
    const r = await call('deliveryComplete', 'driver', { rideId: 'r3', transferCode: TOKEN_C });
    assert(r.ok, r.message);
    const paid = (await bal('driver') - d0) + (await bal('seller') - s0);
    assert(paid <= 8000, 'jumla ya malipo ≤ escrow (' + paid + ')');
    assert(await bal('driver') - d0 <= 8000, 'dereva ≤ escrow');
  });
  await test('ride inayoelekeza oda ya mtu mwingine haitoi escrow yake', async () => {
    await ppPaid('TX-R4', 9000, 'seller');
    await db.doc('orders/ord4').set({ buyerId: 'seller', sellerId: 'driver2', amount: 9000, status: 'held', paymentRef: 'TX-R4' });
    await call('pesapalTransactionStatus', 'seller', { orderTrackingId: 'TX-R4' });
    await ride('r4', { orderId: 'ord4' });
    const r = await call('deliveryComplete', 'driver', { rideId: 'r4', transferCode: TOKEN_C });
    assert(r.ok, r.message); eq(r.data.payoutStatus, 'unfunded', 'oda si ya mteja huyu');
    eq((await db.doc('orders/ord4').get()).data().status, 'held', 'oda ya mwingine haijaguswa');
  });

  /* ---------------- Firestore rules (kama kivinjari) ---------------- */
  group = 'Rules'; console.log('\n[' + group + ']');
  await wipe();
  await loadRules();
  const A = await idToken('rulesA'), B = await idToken('rulesB');
  await test('sokopay_links: kivinjari hakiwezi kuunda/kuweka "held" au kufuta', async () => {
    eq(await restCreate(A.token, 'sokopay_links', 'x1', { userId: A.uid, price: 5000, status: 'held', paidAt: hoursAgo(48) }), 403, 'create held');
    eq(await restCreate(A.token, 'sokopay_links', 'x2', { userId: B.uid, price: 5000, status: 'pending' }), 403, 'create kwa jina la mwingine');
    eq(await restCreate(A.token, 'sokopay_links', 'x3', { userId: A.uid, price: 5000, status: 'pending', title: 'ok' }), 200, 'create halali');
    eq(await restPatch(A.token, 'sokopay_links/x3', { status: 'held', paidAt: hoursAgo(48) }), 403, 'muuzaji kuweka held');
    eq(await restPatch(B.token, 'sokopay_links/x3', { status: 'held', buyerId: B.uid }), 403, 'mnunuzi kuweka held');
    eq(await restPatch(B.token, 'sokopay_links/x3', { buyerId: B.uid, buyerName: 'B', transactionId: 'TX-ANY' }), 200, 'mnunuzi kudai link (hakuna pesa)');
    eq(await restPatch(A.token, 'sokopay_links/x3', { title: 'jina jipya' }), 200, 'muuzaji kuhariri maelezo (pending)');
    eq(await restPatch(A.token, 'sokopay_links/x3', { buyerId: A.uid }), 403, 'muuzaji kubadili mnunuzi');
    eq(await restDelete(A.token, 'sokopay_links/x3'), 403, 'delete');
  });
  await test('ride_requests: kuunda ikiwa na custody/malipo ya server inakataliwa', async () => {
    const base = { customerId: A.uid, status: 'searching', price: 3000, pickupToken: null, pickupTokenStatus: 'unissued', transferTokenStatus: 'unissued' };
    eq(await restCreate(A.token, 'ride_requests', 'rq1', base), 200, 'create halali');
    eq(await restCreate(A.token, 'ride_requests', 'rq2', { ...base, customerId: B.uid }), 403, 'customerId ya mwingine');
    eq(await restCreate(A.token, 'ride_requests', 'rq3', { ...base, status: 'in_transit' }), 403, 'status in_transit');
    eq(await restCreate(A.token, 'ride_requests', 'rq4', { ...base, acceptedAt: hoursAgo(1), driverId: A.uid }), 403, 'acceptedAt');
    eq(await restCreate(A.token, 'ride_requests', 'rq5', { ...base, custodyStage: 'transit' }), 403, 'custodyStage');
    eq(await restCreate(A.token, 'ride_requests', 'rq6', { ...base, transferCodeHash: 'x' }), 403, 'token hash');
    eq(await restCreate(A.token, 'ride_requests', 'rq7', { ...base, transferTokenStatus: 'issued' }), 403, 'token status');
    eq(await restPatch(A.token, 'ride_requests/rq1', { orderId: 'someoneElsesOrder' }), 403, 'orderId update');
    eq(await restPatch(B.token, 'ride_requests/rq1', { customerId: B.uid }), 403, 'customerId update');
    eq(await restPatch(A.token, 'ride_requests/rq1', { custodyStage: 'transit' }), 403, 'custodyStage update');
    eq(await restPatch(A.token, 'ride_requests/rq1', { notes: 'sawa' }), 200, 'update ya kawaida bado inafanya kazi');
  });
  await test('wallet_ledger / escrow_holds: hakuna maandishi ya kivinjari', async () => {
    eq(await restCreate(A.token, 'wallet_ledger', 'order_x_released', { amountTSh: 1 }), 403, 'ledger');
    eq(await restCreate(A.token, 'escrow_holds', 'order_x', { amount: 1, payerUid: A.uid }), 403, 'escrow_holds');
    const r = await realFetch(`${DOCS}/escrow_holds/order_x`, { headers: { authorization: 'Bearer ' + A.token } });
    eq(r.status, 403, 'escrow_holds read');
  });

  /* ---------------- H2/H3 local server ---------------- */
  group = 'H2/H3 local server'; console.log('\n[' + group + ']');
  function runServer(env, port) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ['local-server.js'], { cwd: path.join(ROOT, 'functions'), env: Object.assign({}, process.env, { PORT: String(port), SKH_STATIC: '0' }, env), stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';
      const done = () => { clearTimeout(t); resolve({ child, log }); };
      child.stdout.on('data', d => { log += d; if (/Callables\s*:/.test(log)) setTimeout(done, 400); });
      child.stderr.on('data', d => { log += d; });
      const t = setTimeout(done, 20000);
      child.on('exit', () => { clearTimeout(t); resolve({ child, log }); });
    });
  }
  function listenAddrsOf(pid) {
    try {
      const inodes = new Set(fs.readdirSync('/proc/' + pid + '/fd').map(f => { try { return fs.readlinkSync('/proc/' + pid + '/fd/' + f); } catch (e) { return ''; } })
        .map(l => (/^socket:\[(\d+)\]$/.exec(l) || [])[1]).filter(Boolean));
      const out = [];
      for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
        let txt = ''; try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
        for (const line of txt.trim().split('\n').slice(1)) {
          const c = line.trim().split(/\s+/);
          if (c[3] !== '0A' || !inodes.has(c[9])) continue; // 0A = LISTEN
          const [hex, port] = c[1].split(':');
          const ip = hex.length === 8 ? hex.match(/../g).reverse().map(h => parseInt(h, 16)).join('.') : ('v6:' + hex);
          out.push(ip + ':' + parseInt(port, 16));
        }
      }
      return out;
    } catch (e) { return null; }
  }
  const canConnect = (host, port) => new Promise(res => { const s = net.connect({ host, port }, () => { s.destroy(); res(true); }); s.on('error', () => res(false)); s.setTimeout(1500, () => { s.destroy(); res(false); }); });
  const emuEnv = { FIRESTORE_EMULATOR_HOST: FS_HOST, FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST, GCLOUD_PROJECT: PROJECT, SKH_HOST: '', SKH_RUN_SCHEDULES: '', SKH_ALLOW_PROD_SCHEDULES: '' };

  await test('default: inasikiliza 127.0.0.1 tu, schedules zimezimwa, emulator bila credentials', async () => {
    const { child, log } = await runServer(emuEnv, 5171);
    try {
      assert(/Listening\s*:\s*127\.0\.0\.1:5171/.test(log), 'log: ' + log.slice(0, 600));
      assert(/zimezimwa/.test(log) && !/ZIMEWASHWA/.test(log), 'schedules default off');
      assert(/emulator/i.test(log), 'emulator mode');
      assert(await canConnect('127.0.0.1', 5171), 'localhost inafikiwa');
      // Anwani HALISI ya socket ya process ya server (kutoka /proc) — si jaribio la
      // kuunganisha kupitia IP ya LAN, kwa sababu sandbox hii ina forwarder
      // inayoakisi porti za loopback kwenye 169.254.x (ingetoa matokeo ya uongo).
      const bound = listenAddrsOf(child.pid);
      if (bound) {
        assert(bound.length > 0 && bound.every(a => a === '127.0.0.1:5171'), 'socket za server: ' + JSON.stringify(bound));
      } else {
        assert(/Listening\s*:\s*127\.0\.0\.1:5171/.test(log), '/proc haipo — log tu');
      }
    } finally { child.kill(); }
  });
  await test('SKH_HOST=0.0.0.0 ni opt-in yenye onyo', async () => {
    const { child, log } = await runServer({ ...emuEnv, SKH_HOST: '0.0.0.0' }, 5172);
    try { assert(/INAONEKANA KWENYE MTANDAO/.test(log) && /SKH_HOST=0\.0\.0\.0/.test(log), 'onyo la LAN'); }
    finally { child.kill(); }
  });
  await test('SKH_RUN_SCHEDULES=1 dhidi ya production HAIWASHI bila SKH_ALLOW_PROD_SCHEDULES', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-sec-'));
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(path.join(dir, 'key.json'), JSON.stringify({ type: 'service_account', project_id: 'sokonet-3b847', private_key_id: 'test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: 'test@sokonet-3b847.iam.gserviceaccount.com', client_id: '1', token_uri: 'https://oauth2.googleapis.com/token' }));
    const prodEnv = { FIRESTORE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '', GCLOUD_PROJECT: '', SKH_SERVICE_ACCOUNT: path.join(dir, 'key.json'), SKH_RUN_SCHEDULES: '1', SKH_ALLOW_PROD_SCHEDULES: '', SKH_HOST: '' };
    const { child, log } = await runServer(prodEnv, 5173);
    try {
      assert(/HAZIJAWASHWA/.test(log), 'onyo + imezimwa: ' + log.slice(0, 800));
      assert(!/ZIMEWASHWA/.test(log), 'haijawashwa');
      assert(!log.includes('BEGIN PRIVATE KEY') && !log.includes(privateKey.export({ type: 'pkcs8', format: 'pem' }).slice(40, 80)), 'key haichapishwi');
    } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
  await test('ADC fallback (gcloud application_default_credentials) inatambuliwa bila kuchapisha siri', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-adc-'));
    const secret = 'adc-secret-' + Math.random().toString(36).slice(2);
    fs.writeFileSync(path.join(dir, 'application_default_credentials.json'), JSON.stringify({ type: 'authorized_user', client_id: 'x.apps.googleusercontent.com', client_secret: secret, refresh_token: 'rt-' + secret, quota_project_id: 'sokonet-3b847' }));
    const env = { FIRESTORE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '', GCLOUD_PROJECT: '', SKH_SERVICE_ACCOUNT: '', GOOGLE_APPLICATION_CREDENTIALS: '', HOME: dir, CLOUDSDK_CONFIG: dir, SKH_RUN_SCHEDULES: '', SKH_HOST: '' };
    const { child, log } = await runServer(env, 5174);
    try {
      assert(/Google ADC \(gcloud\) \[authorized_user\]/.test(log), 'ADC imetambuliwa: ' + log.slice(0, 600));
      assert(!log.includes(secret), 'siri haichapishwi');
    } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
  await test('schedules dhidi ya production zinahitaji opt-in mbili + onyo kubwa', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'functions', 'local-server.js'), 'utf8');
    assert(/SKH_ALLOW_PROD_SCHEDULES === '1'/.test(src) && /SCHEDULED JOBS ZINAENDESHWA DHIDI YA FIREBASE YA PRODUCTION/.test(src), 'code ya onyo');
    assert(/process\.env\.SKH_RUN_SCHEDULES === '1'/.test(src), 'default off (opt-in)');
  });

  /* ================= FINAL VERIFICATION (ziada) ================= */
  group = 'V1 walletAdjust boundary'; console.log('\n[' + group + ']');
  await wipe();
  await user('u1', { walletBalance: 10000 });
  await user('u2', { walletBalance: 10000 });
  await user('ag', { walletBalance: 0 });
  await user('memA', { registeredThroughAgentId: 'ag' });
  await user('memB', { registeredThroughAgentId: 'u2' });
  const ALL_TYPES = ['adjustment', 'payout', 'escrow_release', 'refund', 'commission', 'deposit', 'wallet_topup',
    'purchase', 'bonus', 'reward', 'transfer', 'offline_registration', 'dispute_win', 'admin', '', 'DEPOSIT'];
  await test('self-credit kupitia KILA type/purpose bila ushahidi inakataliwa', async () => {
    for (const type of ALL_TYPES) {
      for (const purpose of [undefined, 'offline_registration', 'deposit', 'escrow']) {
        const r = await call('walletAdjust', 'u1', { docId: 'u1', amountTSh: 5000, type, purpose, memberUid: 'memA', orderTrackingId: 'TX-FORGED-' + type });
        denied(r, ['permission-denied', 'failed-precondition'], 'type=' + type + ' purpose=' + purpose);
      }
    }
    eq(await bal('u1'), 10000, 'salio halijabadilika');
  });
  await test('self-debit kupitia KILA type: inapunguza salio lake tu, ledger namespaced', async () => {
    let expect = 10000;
    for (const type of ALL_TYPES) {
      const r = await call('walletAdjust', 'u1', { docId: 'u1', amountTSh: -10, type, ledgerKey: 'dbt_' + (type || 'none') });
      assert(r.ok, 'debit ' + type + ': ' + r.message); expect -= 10;
      assert(r.data.ledgerId.startsWith('u_u1_'), 'namespaced: ' + r.data.ledgerId);
    }
    eq(await bal('u1'), expect, 'salio'); eq(await bal('u2'), 10000, 'u2 hakuguswa');
  });
  await test('ledger key za kughushi hazikalii funguo za server', async () => {
    const forged = ['splink_buy_LINK1', 'pesapal_deposit_TX1', 'offreg_memA', 'order_O1_released', 'order_O1_seller', 'spman_link_L1', 'spman_link_L1_seller', 'dispwin_O1_buyer'];
    for (const k of forged) {
      const r = await call('walletAdjust', 'u1', { docId: 'u1', amountTSh: -1, type: 'purchase', ledgerKey: k });
      assert(r.ok, r.message);
      assert(!(await exists('wallet_ledger/' + k)), 'haikuundwa: ' + k);
    }
    await ppPaid('TX-KEY', 3000, 'u1');
    const d = await call('walletAdjust', 'u1', { docId: 'u1', amountTSh: 3000, type: 'deposit', ledgerKey: 'order_O2_released', orderTrackingId: 'TX-KEY' });
    assert(d.ok, d.message); eq(d.data.ledgerId, 'pesapal_deposit_TX-KEY', 'ufunguo wa server');
    assert(!(await exists('wallet_ledger/order_O2_released')), 'marker ya kughushi haikuundwa');
  });
  await test('orderTrackingId ya kughushi / memberUid ya kughushi inakataliwa', async () => {
    const b = await bal('ag');
    denied(await call('walletAdjust', 'ag', { docId: 'ag', amountTSh: 5000, type: 'deposit', orderTrackingId: 'NOT-A-REAL-TX' }), ['failed-precondition'], 'tid ya kughushi');
    await ppPaid('TX-REG-V', 2100, 'ag');
    denied(await call('walletAdjust', 'ag', { docId: 'ag', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'ghostMember', orderTrackingId: 'TX-REG-V' }), ['permission-denied'], 'member hayupo');
    denied(await call('walletAdjust', 'ag', { docId: 'ag', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'memB', orderTrackingId: 'TX-REG-V' }), ['permission-denied'], 'member wa mwingine');
    denied(await call('walletAdjust', 'ag', { docId: 'ag', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'memA' }), ['failed-precondition'], 'bila tid');
    eq(await bal('ag'), b, 'salio halijabadilika');
  });
  await test('replay ya malipo kati ya madhumuni (deposit ↔ commission ↔ oda) imezuiwa', async () => {
    // commission kwanza, kisha deposit kwa tid ileile
    const ok = await call('walletAdjust', 'ag', { docId: 'ag', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'memA', orderTrackingId: 'TX-REG-V' });
    assert(ok.ok, ok.message);
    denied(await call('walletAdjust', 'ag', { docId: 'ag', amountTSh: 2100, type: 'deposit', orderTrackingId: 'TX-REG-V' }), ['failed-precondition'], 'tid ya kamisheni kama deposit');
    // deposit kwanza, kisha commission kwa tid ileile
    await ppPaid('TX-DEP-V', 2100, 'ag');
    assert((await call('walletAdjust', 'ag', { docId: 'ag', amountTSh: 2100, type: 'deposit', orderTrackingId: 'TX-DEP-V' })).ok, 'deposit');
    await user('memC', { registeredThroughAgentId: 'ag' });
    denied(await call('walletAdjust', 'ag', { docId: 'ag', amountTSh: 1260, type: 'commission', purpose: 'offline_registration', memberUid: 'memC', orderTrackingId: 'TX-DEP-V' }), ['failed-precondition'], 'tid ya deposit kama kamisheni');
    // oda iliyofungwa kwa tid → deposit ya tid ileile
    await user('sellerV');
    await ppPaid('TX-ORD-V', 4000, 'u1');
    await db.doc('orders/ov1').set({ buyerId: 'u1', sellerId: 'sellerV', amount: 4000, status: 'pending', paymentRef: 'TX-ORD-V' });
    await call('pesapalTransactionStatus', 'u1', { orderTrackingId: 'TX-ORD-V' });
    assert(await exists('escrow_holds/order_ov1'), 'oda imefungwa');
    denied(await call('walletAdjust', 'u1', { docId: 'u1', amountTSh: 4000, type: 'deposit', orderTrackingId: 'TX-ORD-V' }), ['failed-precondition'], 'tid ya oda kama deposit');
    eq(await bal('ag'), 1260 + 2100, 'ag: kamisheni 1 + deposit 1 tu');
  });
  await test('cross-user + cap kwa mtumiaji wa kawaida; admin claim inafanya kazi', async () => {
    for (const amt of [5000, -5000]) denied(await call('walletAdjust', 'u1', { docId: 'u2', amountTSh: amt, type: 'purchase' }), ['permission-denied'], 'u1→u2 ' + amt);
    await db.doc('users/fakeDoc').set({ uid: 'u2', walletBalance: 777 });
    denied(await call('walletAdjust', 'u1', { docId: 'fakeDoc', amountTSh: -700, type: 'purchase' }), ['permission-denied'], 'doc ya uid mwingine');
    denied(await call('walletAdjust', 'u1', { docId: 'u1', amountTSh: -60000000, type: 'purchase' }), ['out-of-range'], 'cap ya debit');
    const claim = { uid: 'boss', token: { uid: 'boss', admin: true } };
    const r = await call('walletAdjust', claim, { docId: 'u2', amountTSh: 1, type: 'adjustment', ledgerKey: 'claim_fix' });
    assert(r.ok, 'custom claim admin: ' + r.message);
    eq(await bal('u2'), 10001, 'u2');
  });

  group = 'V2 alternate paths'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller']) await user(u);
  await test('suluhu ya mgogoro ya admin (mnunuzi ameshinda) inatumia escrow — hakuna malipo ya pili', async () => {
    await ppPaid('TX-DSP', 10000, 'buyer');
    await db.doc('orders/d1').set({ buyerId: 'buyer', sellerId: 'seller', amount: 10000, status: 'held', paymentRef: 'TX-DSP' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-DSP' });
    await db.doc('escrow_holds/order_d1').update({ verifiedAt: hoursAgo(48) });
    // 21-sokopay.js resolveDispute: status + walletAdjust ya admin
    await db.doc('orders/d1').update({ status: 'refunded_by_admin', disputeWinner: 'buyer' });
    const r = await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: 10000, type: 'refund', ledgerKey: 'dispwin_d1_buyer' });
    assert(r.ok, r.message); eq(await bal('buyer'), 10000, 'refund');
    eq((await db.doc('escrow_holds/order_d1').get()).data().released, true, 'escrow imetumika');
    // muuzaji anarudisha hali (orders rules ziko wazi) → auto-release; mnunuzi → escrowRelease
    await db.doc('orders/d1').update({ status: 'shipped', shippedAt: hoursAgo(72) });
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    await db.doc('orders/d1').update({ status: 'held' });
    await call('escrowRelease', 'buyer', { orderId: 'd1' });
    eq(await bal('seller'), 0, 'muuzaji HAKULIPWA mara ya pili');
  });
  await test('split refund ya admin kwenye link inatumia escrow', async () => {
    await ppPaid('TX-DSL', 6000, 'buyer');
    await db.doc('sokopay_links/dl1').set({ userId: 'seller', price: 6000, status: 'pending', buyerId: 'buyer', transactionId: 'TX-DSL' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-DSL' });
    await db.doc('sokopay_links/dl1').update({ status: 'split_refund_resolved' });
    assert((await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: 2000, type: 'refund', ledgerKey: 'splitref_buyer_dl1' })).ok, 'buyer part');
    assert((await call('walletAdjust', ADMIN, { docId: 'seller', amountTSh: 4000, type: 'escrow_release', ledgerKey: 'splitref_seller_dl1' })).ok, 'seller part');
    await db.doc('sokopay_links/dl1').update({ status: 'held', paidAt: hoursAgo(72) });
    await db.doc('escrow_holds/link_dl1').update({ verifiedAt: hoursAgo(72) });
    await call('haipayReleaseLink', 'buyer', { linkId: 'dl1' });
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    eq(await bal('seller'), 4000, 'muuzaji: sehemu ya split tu');
  });
  await test('negotiationOrderAction: "held" ya client haisababishi malipo', async () => {
    await db.doc('orders/n1').set({ source: 'negotiation', commerceType: 'product', buyerId: 'buyer', sellerId: 'seller', amount: 50000, status: 'held', paymentStatus: 'paid', paymentVerified: true, deliveryStatus: 'held' });
    const w0 = await bal('seller');
    // [PHASE 2 P4] lango la "imelipwa" sasa ni ushahidi wa server (getEscrowEvidence):
    // hali ya kughushi haipiti hata hatua ya kwanza, na CONFIRM_RECEIPT haikamilishi bila escrow.
    denied(await call('negotiationOrderAction', 'seller', { orderId: 'n1', command: 'PREPARE_ORDER' }), ['failed-precondition'], 'PREPARE_ORDER (forged paid)');
    await db.doc('orders/n1').update({ status: 'delivered', negotiationStage: 'delivered', deliveryStatus: 'delivered' });
    denied(await call('negotiationOrderAction', 'buyer', { orderId: 'n1', command: 'CONFIRM_RECEIPT' }), ['failed-precondition'], 'CONFIRM_RECEIPT bila escrow');
    assert((await db.doc('orders/n1').get()).data().status !== 'completed', 'haikukamilishwa bila escrow');
    await db.doc('orders/n1').update({ status: 'shipped', shippedAt: hoursAgo(72) });
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    denied(await call('escrowRelease', 'buyer', { orderId: 'n1' }), ['failed-precondition'], 'hakuna ushahidi');
    eq(await bal('seller'), w0, 'hakuna pesa iliyohamishwa');
  });

  group = 'V4 SokoPay links (ziada)'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller', 'eve']) await user(u);
  await test('fake paid/paymentVerified/verifiedAmount/paidAt/held — hakuna malipo', async () => {
    await db.doc('sokopay_links/f1').set({ userId: 'seller', price: 9000, status: 'held', buyerId: 'buyer', paid: true, paymentVerified: true, verifiedAmount: 9000, paidAt: hoursAgo(96), paymentType: 'Wallet Payout' });
    denied(await call('haipayReleaseLink', 'buyer', { linkId: 'f1' }), ['failed-precondition'], 'manual');
    denied(await call('haipayReleaseLink', ADMIN, { linkId: 'f1' }), ['failed-precondition'], 'hata admin bila ushahidi');
    await fns.sokopayAutoRelease.run({ scheduleTime: new Date().toISOString() });
    eq(await bal('seller'), 0, 'hakuna malipo');
  });
  await test('mlipaji wa pili: link iliyodaiwa na B, muamala ulioanzishwa na mwingine haufungi link', async () => {
    await ppPaid('TX-OTHER', 9000, 'eve');
    await db.doc('sokopay_links/s2').set({ userId: 'seller', price: 9000, status: 'pending', buyerId: 'buyer', transactionId: 'TX-OTHER' });
    await call('pesapalTransactionStatus', 'eve', { orderTrackingId: 'TX-OTHER' });
    assert(!(await exists('escrow_holds/link_s2')), 'haikufungwa');
    denied(await call('haipayReleaseLink', 'buyer', { linkId: 's2' }), ['failed-precondition'], 'release');
  });
  await test('replay ya muamala mmoja kwa links mbili: moja tu inafungwa', async () => {
    await ppPaid('TX-TWO', 5000, 'buyer');
    await db.doc('sokopay_links/t1').set({ userId: 'seller', price: 5000, status: 'pending', buyerId: 'buyer', transactionId: 'TX-TWO' });
    await db.doc('sokopay_links/t2').set({ userId: 'seller', price: 5000, status: 'pending', buyerId: 'buyer', transactionId: 'TX-TWO' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-TWO' });
    const n = (await exists('escrow_holds/link_t1') ? 1 : 0) + (await exists('escrow_holds/link_t2') ? 1 : 0);
    eq(n, 1, 'link moja tu');
  });

  group = 'V6 rules (ziada)'; console.log('\n[' + group + ']');
  await wipe();
  await loadRules();
  const C = await idToken('rulesC'), D = await idToken('rulesD');
  await test('link iliyo held: muuzaji/mnunuzi hawawezi kubadili bei/malipo; dispute inaruhusiwa', async () => {
    await db.doc('sokopay_links/h1').set({ userId: C.uid, buyerId: D.uid, price: 5000, status: 'held' });
    eq(await restPatch(C.token, 'sokopay_links/h1', { price: 1 }), 403, 'muuzaji bei');
    eq(await restPatch(C.token, 'sokopay_links/h1', { status: 'completed' }), 403, 'muuzaji completed');
    eq(await restPatch(D.token, 'sokopay_links/h1', { paidAt: hoursAgo(99) }), 403, 'mnunuzi paidAt');
    eq(await restPatch(D.token, 'sokopay_links/h1', { buyerId: C.uid }), 403, 'mnunuzi kubadili mnunuzi');
    eq(await restPatch(D.token, 'sokopay_links/h1', { status: 'disputed', disputeReason: 'x', disputedAt: hoursAgo(0) }), 200, 'dispute');
    eq(await restPatch(D.token, 'sokopay_links/h1', { status: 'held' }), 403, 'kurudisha held');
    eq(await restCreate(C.token, 'sokopay_links', 'h2', { userId: C.uid, price: 5000, status: 'pending', paymentVerified: true }), 403, 'create na paymentVerified');
    eq(await restCreate(C.token, 'escrow_holds', 'link_h2', { payerUid: C.uid, amount: 5000 }), 403, 'proof ya kughushi');
  });
  await test('chat + negotiation za halali bado zinafanya kazi (rules zinacompile)', async () => {
    eq(await restCreate(C.token, 'conversations', 'cv1', { participants: [C.uid, D.uid] }), 200, 'conversation');
    eq(await restCreate(C.token, 'conversations/cv1/messages', 'm1', { senderId: C.uid, text: 'habari' }), 200, 'ujumbe');
    eq(await restCreate(D.token, 'chatBlocks', D.uid + '__' + C.uid, { blockerId: D.uid, blockedId: C.uid }), 200, 'block');
    eq(await restCreate(C.token, 'conversations/cv1/messages', 'm2', { senderId: C.uid, text: 'bado?' }), 403, 'block inazuia ujumbe');
    const n0 = { buyerId: C.uid, sellerId: D.uid, version: 1, currentState: 'OFFER_SENT', currentUnitPrice: 1000, quantity: 1, waitingForUserId: D.uid, turn: 'seller' };
    eq(await restCreate(C.token, 'negotiations', 'ng1', n0), 200, 'offer');
    eq(await restPatch(C.token, 'negotiations/ng1', { version: 2, currentState: 'COUNTER_OFFER', currentUnitPrice: 900 }), 403, 'mnunuzi si zamu yake');
    eq(await restPatch(D.token, 'negotiations/ng1', { version: 2, currentState: 'COUNTER_OFFER', currentUnitPrice: 1200, waitingForUserId: C.uid, turn: 'buyer' }), 200, 'muuzaji counter (zamu yake)');
    eq(await restPatch(C.token, 'negotiations/ng1', { version: 3, currentState: 'AGREEMENT' }), 200, 'mnunuzi akubali (zamu yake)');
    eq(await restPatch(D.token, 'negotiations/ng1', { version: 4, currentState: 'ORDER_CREATED' }), 403, 'muuzaji hawezi ORDER_CREATED');
  });

  /* ---------------- muhtasari ---------------- */
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE 1 SECURITY: ' + pass + ' passed, ' + fail + ' failed');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

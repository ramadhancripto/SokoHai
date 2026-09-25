#!/usr/bin/env node
/* ============================================================
 * PHASE 2 SECURITY TESTS (2026-09) — T1–T28: P1 nauli/carrier, P2 hali ya
 * oda (rules), P3 auto-release/stuck completed, P4 negotiation → escrow,
 * P5 suluhu ya mgogoro, P6 deliveryAccept/token/rules za safari.
 * Harness ile ile ya tools/test_phase1_security.mjs.
 *
 * Inaendeshwa dhidi ya FIREBASE EMULATOR PEKEE (haigusi production, hakuna
 * pesa halisi). PesaPal inaigwa (stub ya fetch) — GetTransactionStatus ya
 * kweli inabaki kwenye code; tunabadilisha jibu la mtandao tu.
 *
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai \
 *     "node tools/test_phase2_security.mjs"
 *   (au: npm run test:security:phase2:emulator)
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

const ROOT = '/home/user/SokoHai-phase1';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) {
  console.error('BLOCKED: FIRESTORE_EMULATOR_HOST na FIREBASE_AUTH_EMULATOR_HOST zinahitajika.\n' +
    '  Endesha: firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_phase2_security.mjs"');
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

/* ---------- Phase 2 helpers ---------- */
const H = (s) => createHash('sha256').update(String(s)).digest('hex');
const later = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const get = async (p) => (await db.doc(p).get()).data() || {};
// Oda iliyolipwa KWELI (PesaPal stub + hold ya server kupitia pesapalTransactionStatus).
async function paidOrder(id, amount, o) {
  o = o || {};
  const buyer = o.buyerId || 'buyer';
  await ppPaid('TX-' + id, amount, buyer);
  await db.doc('orders/' + id).set(Object.assign({ buyerId: buyer, sellerId: 'seller', amount, status: 'held', paymentRef: 'TX-' + id, itemId: 'item_' + id }, o));
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
const autoRelease = (hoursAhead) => fns.sokopayAutoRelease.run({ scheduleTime: later(hoursAhead || 0) });


/* ===== HAPPY-PATH JOURNEY (Step 4) — real Auth-emulator users, browser writes via REST+rules ===== */
async function main() {
  await loadRules(); await wipe();
  await realFetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  const B = await signUp('journey.buyer@test.local'), S = await signUp('journey.seller@test.local'), D = await signUp('journey.driver@test.local');
  for (const u of [B, S, D]) await user(u.uid);
  console.log('buyer', B.uid, 'seller', S.uid, 'driver', D.uid);
  const O = 'jorder1', R = 'jride1', TX = 'TX-J1';
  group = 'order+payment'; console.log('\n[' + group + ']');
  await test('J1 buyer creates product order from the browser (rules)', async () => {
    eq(await restCreate(B.token, 'orders', O, { buyerId: B.uid, sellerId: S.uid, amount: 20000, status: 'payment_pending', paymentStatus: 'pending', itemId: 'item1' }), 200, 'create');
  });
  await test('J2 valid PesaPal payment → server escrow hold (status held)', async () => {
    await ppPaid(TX, 20000, B.uid);
    await db.doc('orders/' + O).update({ paymentRef: TX }); // written server-side by pesapalCheckout in the app
    const st = await call('pesapalTransactionStatus', B.uid, { orderTrackingId: TX }); assert(st.ok, st.message);
    eq((await get('orders/' + O)).status, 'held', 'held'); assert(await exists('escrow_holds/order_' + O), 'server hold');
  });
  await test('J3 seller cannot manipulate protected money fields', async () => {
    for (const f of [{ amount: 1 }, { amount: 999999 }, { status: 'completed' }, { sellerEarned: 20000 }, { paymentStatus: 'rejected' }, { paymentVerified: false }, { disputeWinner: 'seller' }])
      eq(await restPatch(S.token, 'orders/' + O, f), 403, 'seller ' + JSON.stringify(f));
    eq(await restCreate(S.token, 'escrow_holds', 'fake_' + O, { amount: 20000 }), 403, 'fake hold');
    eq(await bal(S.uid), 0, 'seller unpaid');
    // faking 'paid' on an order that is NOT paid (value actually changes)
    eq(await restCreate(B.token, 'orders', 'junpaid', { buyerId: B.uid, sellerId: S.uid, amount: 5000, status: 'payment_pending', paymentStatus: 'pending' }), 200, 'unpaid order');
    eq(await restPatch(S.token, 'orders/junpaid', { paymentStatus: 'paid' }), 403, 'seller fake paid');
    eq(await restPatch(B.token, 'orders/junpaid', { paymentStatus: 'paid', paymentVerified: true }), 403, 'buyer fake paid');
    eq(await restPatch(S.token, 'orders/junpaid', { status: 'held' }), 403, 'seller fake held');
  });
  group = 'delivery'; console.log('\n[' + group + ']');
  await test('J4 buyer creates delivery request (rules) and links it to the order once', async () => {
    eq(await restCreate(B.token, 'ride_requests', R, { customerId: B.uid, status: 'searching', fare: 3000, price: 3000, orderId: O, pickupToken: null, pickupTokenStatus: 'unissued', transferTokenStatus: 'unissued' }), 200, 'ride create');
    eq(await restPatch(B.token, 'orders/' + O, { rideRequestId: R, deliveryId: R }), 200, 'link');
    eq(await restPatch(B.token, 'orders/' + O, { rideRequestId: 'other' }), 403, 'relink denied');
  });
  let token;
  await test('J5 driver accepts → agreedFare snapshot; fare frozen after acceptance', async () => {
    const a = await call('deliveryAccept', D.uid, { rideId: R }); assert(a.ok, a.message); token = a.data.token;
    const r = await get('ride_requests/' + R); eq(r.agreedFare, 3000, 'agreedFare'); eq(r.driverId, D.uid, 'driver');
    eq(await restPatch(B.token, 'ride_requests/' + R, { fare: 50000 }), 403, 'fare frozen'); eq(await restPatch(B.token, 'ride_requests/' + R, { price: 50000 }), 403, 'price frozen');
  });
  await test('J6 auto-release cannot bypass the active delivery', async () => {
    await db.doc('escrow_holds/order_' + O).update({ verifiedAt: hoursAgo(72) }); // simulate time passing
    await db.doc('orders/' + O).update({ status: 'shipped', shippedAt: hoursAgo(72) });
    await autoRelease(30); eq(await bal(S.uid), 0, 'not released'); eq((await get('escrow_holds/order_' + O)).released === true, false, 'hold intact');
  });
  await test('J7 seller custody/handover with token; buyer cannot fake it', async () => {
    denied(await call('deliveryConfirmCustody', B.uid, { rideId: R, role: 'seller', token }), ['permission-denied'], 'buyer fake handover');
    const s = await call('deliveryConfirmCustody', S.uid, { rideId: R, role: 'seller', token }); assert(s.ok, s.message);
    eq((await get('ride_requests/' + R)).sellerConfirmedBy, S.uid, 'sellerConfirmedBy');
  });
  await test('J8 pickup/transfer token → transit', async () => {
    const p = await call('deliveryConfirmCustody', D.uid, { rideId: R, role: 'transporter', token }); assert(p.ok, p.message);
    const t = await call('deliveryStartTransit', D.uid, { rideId: R }); assert(t.ok, t.message);
    eq((await get('ride_requests/' + R)).status, 'in_transit', 'in_transit');
  });
  await test('J9 delivery completion → escrow release: seller payout + eligible carrier payout', async () => {
    const c = await call('deliveryComplete', B.uid, { rideId: R }); assert(c.ok, c.message);
    eq(await bal(D.uid), 3000, 'carrier = agreedFare'); eq(await bal(S.uid), 17000, 'seller = escrow − agreedFare');
    eq((await get('escrow_holds/order_' + O)).released, true, 'hold released');
    eq((await get('orders/' + O)).status, 'completed', 'order completed');
  });
  await test('J10 dispute path cannot double-pay; release/auto-release are once-only', async () => {
    denied(await call('walletAdjust', ADMIN, { docId: B.uid, amountTSh: 20000, type: 'refund', ledgerKey: 'dispwin_' + O + '_buyer' }), ['failed-precondition'], 'refund after release');
    eq(await restPatch(B.token, 'orders/' + O, { status: 'held' }), 403, 'completed cannot go back');
    const er = await call('escrowRelease', B.uid, { orderId: O }); assert(er.ok && er.data.already, 'already');
    await autoRelease(90);
    eq(await bal(B.uid), 0, 'buyer'); eq(await bal(S.uid), 17000, 'seller once'); eq(await bal(D.uid), 3000, 'carrier once');
  });
  group = 'negotiation'; console.log('\n[' + group + ']');
  await test('J11 negotiation product: PREPARE → TRANSIT → DELIVERED → CONFIRM_RECEIPT releases once', async () => {
    await ppPaid('TX-NJ', 30000, B.uid);
    await db.doc('orders/nj1').set({ source: 'negotiation', commerceType: 'product', negotiationId: 'negj', buyerId: B.uid, sellerId: S.uid, amount: 30000, status: 'payment_pending', paymentStatus: 'pending', paymentRef: 'TX-NJ', deliveryStatus: 'held' });
    assert((await call('pesapalTransactionStatus', B.uid, { orderTrackingId: 'TX-NJ' })).ok, 'settle');
    for (const [who, cmd] of [[S.uid, 'PREPARE_ORDER'], [S.uid, 'START_TRANSIT'], [S.uid, 'MARK_DELIVERED'], [B.uid, 'CONFIRM_RECEIPT']]) { const r = await call('negotiationOrderAction', who, { orderId: 'nj1', command: cmd, commandId: 'j_' + cmd }); assert(r.ok, cmd + ': ' + r.message); }
    eq(await bal(S.uid), 47000, 'seller +30000'); eq((await get('escrow_holds/order_nj1')).released, true, 'released');
    assert((await call('escrowRelease', B.uid, { orderId: 'nj1' })).data.already, 'once');
  });
  await test('J12 negotiation service: START → SUBMIT → CONFIRM_COMPLETION releases once', async () => {
    await ppPaid('TX-NS', 12000, B.uid);
    await db.doc('orders/ns1').set({ source: 'negotiation', commerceType: 'service', buyerId: B.uid, sellerId: S.uid, amount: 12000, status: 'payment_pending', paymentRef: 'TX-NS', serviceStatus: 'held' });
    assert((await call('pesapalTransactionStatus', B.uid, { orderTrackingId: 'TX-NS' })).ok, 'settle');
    denied(await call('negotiationOrderAction', S.uid, { orderId: 'ns1', command: 'CONFIRM_COMPLETION' }), null, 'seller cannot confirm own work');
    for (const [who, cmd] of [[S.uid, 'START_SERVICE'], [S.uid, 'SUBMIT_WORK'], [B.uid, 'CONFIRM_COMPLETION']]) { const r = await call('negotiationOrderAction', who, { orderId: 'ns1', command: cmd }); assert(r.ok, cmd + ': ' + r.message); }
    eq(await bal(S.uid), 59000, 'seller +12000'); eq((await get('escrow_holds/order_ns1')).released, true, 'released');
  });
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nHAPPY-PATH JOURNEY: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });

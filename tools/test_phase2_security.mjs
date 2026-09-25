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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

/* ============================================================ */
async function main() {
  await loadRules();

  /* ================= P1 — nauli iliyogandishwa / carrier ================= */
  group = 'P1 fare/carrier'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller', 'driver', 'driver2', 'eve']) await user(u);
  const B = await idToken('p1buyer'), S = await idToken('p1seller'), X = await idToken('p1stranger'), D = await idToken('p1driver');

  await test('T1 mgeni hawezi kubadilisha fare/price/status/driverId ya safari (REST)', async () => {
    await db.doc('ride_requests/t1').set({ customerId: B.uid, driverId: D.uid, status: 'in_transit', acceptedAt: hoursAgo(1), custodyStage: 'transit', fare: 3000, agreedFare: 3000 });
    eq(await restPatch(X.token, 'ride_requests/t1', { fare: 20000 }), 403, 'fare');
    eq(await restPatch(X.token, 'ride_requests/t1', { price: 20000 }), 403, 'price');
    eq(await restPatch(X.token, 'ride_requests/t1', { status: 'completed' }), 403, 'status');
    eq(await restPatch(X.token, 'ride_requests/t1', { driverId: null }), 403, 'driverId null');
    eq((await get('ride_requests/t1')).fare, 3000, 'haijabadilika');
  });
  await test('T2 nauli imefungwa baada ya kukubaliwa; mteja anaweza kuibadilisha KABLA', async () => {
    await db.doc('ride_requests/t2').set({ customerId: B.uid, status: 'searching', fare: 3000 });
    eq(await restPatch(B.token, 'ride_requests/t2', { fare: 3500 }), 200, 'kabla ya kukubaliwa (halali)');
    await db.doc('ride_requests/t2').update({ driverId: D.uid, acceptedAt: new Date().toISOString(), status: 'accepted', agreedFare: 3500 });
    eq(await restPatch(B.token, 'ride_requests/t2', { fare: 20000 }), 403, 'mteja baada ya kukubaliwa');
    eq(await restPatch(D.token, 'ride_requests/t2', { fare: 20000 }), 403, 'dereva');
    eq(await restPatch(D.token, 'ride_requests/t2', { cargoPrice: 20000 }), 403, 'cargoPrice');
  });
  await test('T3 agreedFare / sellerConfirmedBy / acceptedAt ni za server tu', async () => {
    for (const [tk, who] of [[B, 'mteja'], [D, 'dereva']]) {
      eq(await restPatch(tk.token, 'ride_requests/t2', { agreedFare: 999999 }), 403, who + ' agreedFare');
      eq(await restPatch(tk.token, 'ride_requests/t2', { sellerConfirmedBy: 'x' }), 403, who + ' sellerConfirmedBy');
      eq(await restPatch(tk.token, 'ride_requests/t2', { acceptedAt: null }), 403, who + ' acceptedAt');
    }
    eq(await restCreate(B.token, 'ride_requests', 't3c', { customerId: B.uid, status: 'searching', fare: 1, agreedFare: 999999 }) === 200, false, 'create yenye agreedFare');
  });
  await test('T4 deliveryAccept inagandisha agreedFare; deliveryComplete inalipa agreedFare PEKEE', async () => {
    await paidOrder('o4', 20000);
    await newRide('r4', { orderId: 'o4' });
    await custodyChain('r4', 'driver', 'seller');
    eq((await get('ride_requests/r4')).agreedFare, 3000, 'agreedFare = fare wakati wa kukubali');
    await db.doc('ride_requests/r4').update({ fare: 20000, price: 20000 }); // ughushi wa zamani (kupita rules)
    const r = await call('deliveryComplete', 'buyer', { rideId: 'r4' });
    assert(r.ok, r.message);
    eq(await bal('driver'), 3000, 'dereva = agreedFare');
    eq(await bal('seller'), 17000, 'muuzaji = escrow − agreedFare');
  });
  await test('T5 mnunuzi hawezi kufanya makabidhiano ya muuzaji (oda ya bidhaa); muuzaji halisi anaweza', async () => {
    await paidOrder('o5', 20000);
    await newRide('r5', { orderId: 'o5' });
    const a = await call('deliveryAccept', 'driver', { rideId: 'r5' }); assert(a.ok, a.message);
    denied(await call('deliveryConfirmCustody', 'buyer', { rideId: 'r5', role: 'seller', direct: true }), ['permission-denied'], 'buyer direct');
    denied(await call('deliveryConfirmCustody', 'buyer', { rideId: 'r5', role: 'seller', token: a.data.token }), ['permission-denied'], 'buyer + token');
    denied(await call('deliveryConfirmCustody', 'eve', { rideId: 'r5', role: 'seller', direct: true }), ['permission-denied'], 'mgeni');
    eq((await get('ride_requests/r5')).status, 'accepted', 'hali haijabadilika');
    const ok = await call('deliveryConfirmCustody', 'seller', { rideId: 'r5', role: 'seller', token: a.data.token });
    assert(ok.ok, ok.message);
    eq((await get('ride_requests/r5')).sellerConfirmedBy, 'seller', 'sellerConfirmedBy ya server');
  });
  await test('T6 S1b: mnunuzi + dereva mshirika hawawezi kuchukua escrow (carrier 0 bila makabidhiano ya muuzaji)', async () => {
    await paidOrder('o6', 20000);
    await newRide('r6', { orderId: 'o6', fare: 20000, price: 20000 });
    denied(await call('deliveryAccept', 'buyer', { rideId: 'r6' }), ['permission-denied'], 'mteja kama dereva');
    const a = await call('deliveryAccept', 'eve', { rideId: 'r6' }); assert(a.ok, a.message);
    // Njia ya zamani ya ughushi (kupita server, mf. data ya legacy): pickup bila muuzaji.
    await db.doc('ride_requests/r6').update({ status: 'in_transit', custodyStage: 'transit', currentCustodian: 'eve' });
    const s0 = await bal('seller');
    const r = await call('deliveryComplete', 'buyer', { rideId: 'r6' }); assert(r.ok, r.message);
    eq(await bal('eve'), 0, 'dereva mshirika hapati escrow');
    eq(await bal('seller') - s0, 20000, 'muuzaji analipwa escrow yote');
  });
  await test('T7 dereva = muuzaji au = mnunuzi → hakuna sehemu ya carrier', async () => {
    await paidOrder('o7', 10000);
    await db.doc('ride_requests/r7').set({ customerId: 'buyer', orderId: 'o7', driverId: 'buyer', acceptedAt: hoursAgo(1), status: 'in_transit', custodyStage: 'transit', agreedFare: 4000, sellerConfirmedBy: 'seller' });
    const s0 = await bal('seller');
    const r = await call('deliveryComplete', 'buyer', { rideId: 'r7' }); assert(r.ok, r.message);
    eq(await bal('buyer'), 0, 'mnunuzi-dereva hapati kitu');
    eq(await bal('seller') - s0, 10000, 'muuzaji analipwa escrow yote');
  });

  /* ================= P2 — mamlaka ya hali ya oda (rules) ================= */
  group = 'P2 order rules'; console.log('\n[' + group + ']');
  await wipe();
  const oDoc = (id, o) => db.doc('orders/' + id).set(Object.assign({ buyerId: B.uid, sellerId: S.uid, amount: 20000, status: 'held', paymentStatus: 'paid', paymentVerified: true }, o || {}));

  await test('T8 mnunuzi → disputed (halali); muuzaji hawezi kurudisha disputed → shipped/held', async () => {
    await oDoc('t8');
    eq(await restPatch(B.token, 'orders/t8', { status: 'disputed', disputeReason: 'mbovu' }), 200, 'buyer dispute');
    eq(await restPatch(S.token, 'orders/t8', { status: 'shipped', shippedAt: hoursAgo(72) }), 403, 'disputed → shipped');
    eq(await restPatch(S.token, 'orders/t8', { status: 'held' }), 403, 'disputed → held');
    eq(await restPatch(B.token, 'orders/t8', { status: 'held' }), 403, 'buyer disputed → held');
    eq((await get('orders/t8')).status, 'disputed', 'bado disputed');
  });
  await test('T9 status completed na mabadiliko ya amount yanakataliwa', async () => {
    await oDoc('t9');
    for (const tk of [B, S]) {
      eq(await restPatch(tk.token, 'orders/t9', { status: 'completed' }), 403, 'completed');
      eq(await restPatch(tk.token, 'orders/t9', { amount: 900000 }), 403, 'amount');
      eq(await restPatch(tk.token, 'orders/t9', { status: 'refunded_by_admin' }), 403, 'refunded');
    }
    eq(await restPatch(X.token, 'orders/t9', { status: 'disputed' }), 403, 'mgeni');
  });
  await test('T10 sehemu za malipo/mgawanyo/suluhu ni za server', async () => {
    await oDoc('t10', { status: 'payment_pending', paymentStatus: 'pending', paymentVerified: false });
    for (const [k, v] of [['paymentVerified', true], ['paymentStatus', 'paid'], ['paidAt', hoursAgo(1)], ['heldAt', hoursAgo(1)], ['verifiedAmount', 20000],
      ['paymentProtectedAt', hoursAgo(1)], ['sellerEarned', 1], ['carrierEarned', 1], ['commission', 0], ['completedAt', hoursAgo(1)],
      ['autoReleased', true], ['autoReleasedAt', hoursAgo(1)], ['disputeResolvedAt', hoursAgo(1)], ['disputeWinner', 'buyer'], ['status', 'held']]) {
      eq(await restPatch(B.token, 'orders/t10', { [k]: v }), 403, 'buyer ' + k);
    }
    // Taarifa halali za ukurasa wa kurudi PesaPal (17-pesapal-return)
    eq(await restPatch(B.token, 'orders/t10', { paymentStatus: 'verification_pending', paymentVerified: false, updatedAt: 'x' }), 200, 'verification_pending');
    eq(await restPatch(B.token, 'orders/t10', { paymentStatus: 'rejected', paymentVerified: false, paymentRejectedAt: 'x' }), 200, 'rejected');
    // baada ya server kuthibitisha: hakuna kubadilisha paymentStatus
    await oDoc('t10b');
    eq(await restPatch(B.token, 'orders/t10b', { paymentStatus: 'rejected', paymentVerified: false }), 403, 'baada ya paid');
  });
  await test('T11 completed/refunded hazirudi kwenye hali ya malipo', async () => {
    await oDoc('t11', { status: 'completed' });
    eq(await restPatch(B.token, 'orders/t11', { status: 'disputed', amount: 5000000 }), 403, 'completed → disputed (+amount)');
    eq(await restPatch(B.token, 'orders/t11', { status: 'disputed' }), 403, 'completed → disputed');
    eq(await restPatch(S.token, 'orders/t11', { status: 'shipped' }), 403, 'completed → shipped');
    await oDoc('t11b', { status: 'refunded_by_admin' });
    eq(await restPatch(S.token, 'orders/t11b', { status: 'held' }), 403, 'refunded → held');
    eq(await restPatch(B.token, 'orders/t11b', { status: 'disputed' }), 403, 'refunded → disputed');
  });
  await test('T12 viungo vya uwasilishaji vinawekwa mara moja tu', async () => {
    await oDoc('t12');
    eq(await restPatch(B.token, 'orders/t12', { rideRequestId: 'rideA', deliveryId: 'rideA', deliveryRequired: true, 'delivery': { status: 'searching', deliveryRequestId: 'rideA' } }), 200, 'kuunganisha (43-delivery-choice)');
    eq(await restPatch(B.token, 'orders/t12', { rideRequestId: 'rideEVIL' }), 403, 'kubadilisha rideRequestId');
    eq(await restPatch(S.token, 'orders/t12', { deliveryId: null }), 403, 'kufuta deliveryId');
    eq(await restPatch(B.token, 'orders/t12', { transportRequestId: 'trA' }), 200, 'transportRequestId (57-checkout-bridge)');
    eq(await restPatch(B.token, 'orders/t12', { transportRequestId: 'trB' }), 403, 'transportRequestId mara ya pili');
  });
  await test('T13 muuzaji held → shipped (+shippedAt) halali; shippedAt haiwezi kurudishwa nyuma baadaye', async () => {
    await oDoc('t13');
    eq(await restPatch(S.token, 'orders/t13', { status: 'shipped', shippingReceipt: 'u', shippedAt: new Date().toISOString() }), 200, '03-dashboard shipped');
    eq(await restPatch(S.token, 'orders/t13', { shippedAt: hoursAgo(72) }), 403, 'backdate shippedAt');
    await oDoc('t13h');
    eq(await restPatch(B.token, 'orders/t13h', { status: 'shipped', shippedAt: 'x' }), 403, 'mnunuzi hawezi held → shipped');
    eq(await restPatch(B.token, 'orders/t13', { status: 'disputed' }), 200, 'mnunuzi anaweza kulalamika baada ya shipped');
    await oDoc('t13c', { status: 'payment_pending', paymentStatus: 'pending', paymentVerified: false });
    eq(await restPatch(B.token, 'orders/t13c', { status: 'cancelled' }), 200, 'kughairi kabla ya malipo');
    eq(await restPatch(S.token, 'orders/t13', { adjustments: ['x'] }), 200, 'sehemu zisizo za pesa (adjustments) bado zinaandikika');
  });
  await test('T14 kuunda oda: hakuna hali ya mwisho wala matokeo ya malipo; uundaji wa kawaida unafanya kazi', async () => {
    eq(await restCreate(B.token, 'orders', 't14a', { buyerId: B.uid, sellerId: S.uid, amount: 100, status: 'completed' }), 403, 'completed');
    eq(await restCreate(B.token, 'orders', 't14b', { buyerId: B.uid, sellerId: S.uid, amount: 100, status: 'held', sellerEarned: 100 }), 403, 'sellerEarned');
    eq(await restCreate(B.token, 'orders', 't14c', { buyerId: B.uid, sellerId: S.uid, amount: 100, status: 'payment_pending', disputeWinner: 'buyer' }), 403, 'disputeWinner');
    eq(await restCreate(B.token, 'orders', 't14d', { buyerId: B.uid, sellerId: S.uid, amount: 100, status: 'payment_pending', paymentStatus: 'pending' }), 200, 'kawaida');
    eq(await restCreate(B.token, 'orders', 't14e', { buyerId: S.uid, sellerId: B.uid, amount: 100, status: 'payment_pending' }), 403, 'buyerId ya mwingine');
    const AD = await signUp('rshabansaid@gmail.com');
    await oDoc('t14f', { status: 'disputed' });
    eq(await restPatch(AD.token, 'orders/t14f', { status: 'refunded_by_admin', disputeResolvedAt: 'x', disputeWinner: 'buyer' }), 200, 'admin (21-sokopay) bado anaweza kusuluhisha');
  });

  /* ================= P3 — auto-release / stuck completed ================= */
  group = 'P3 auto-release'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller', 'driver']) await user(u);

  await test('T15 oda "completed" ya kivinjari yenye hold isiyotolewa — escrow inatolewa mara moja (si "already")', async () => {
    await paidOrder('o15', 10000);
    await db.doc('orders/o15').update({ status: 'completed' }); // S3a (data ya zamani kabla ya rules)
    const r = await call('escrowRelease', 'buyer', { orderId: 'o15' });
    assert(r.ok && !r.data.already, 'imetolewa: ' + JSON.stringify(r.data || r.message));
    eq(await bal('seller'), 10000, 'muuzaji amelipwa');
    eq((await get('escrow_holds/order_o15')).released, true, 'hold released');
    const r2 = await call('escrowRelease', 'buyer', { orderId: 'o15' });
    assert(r2.ok && r2.data.already, 'replay = already'); eq(await bal('seller'), 10000, 'mara moja tu');
  });
  await test('T16 auto-release inatumia updateTime ya server (shippedAt iliyorudishwa nyuma haitoshi)', async () => {
    await paidOrder('o16', 5000, { sellerId: 'seller16' }); await user('seller16');
    await db.doc('escrow_holds/order_o16').update({ verifiedAt: hoursAgo(72) });
    await db.doc('orders/o16').update({ status: 'shipped', shippedAt: hoursAgo(72) }); // uandishi wa sasa hivi
    await autoRelease(0);
    eq(await bal('seller16'), 0, 'haijatolewa: updateTime ni sasa hivi');
    eq((await get('orders/o16')).status, 'shipped', 'bado shipped');
    await autoRelease(25); // saa ya emulator +25h
    eq(await bal('seller16'), 5000, 'imetolewa baada ya saa 24 za server');
    eq((await get('orders/o16')).status, 'completed', 'completed');
    await autoRelease(26);
    eq(await bal('seller16'), 5000, 'mara moja tu');
  });

  /* ================= P4 — negotiation → escrow engine ================= */
  group = 'P4 negotiation'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller', 'eve']) await user(u);

  await test('T17 negotiation happy path: PREPARE → TRANSIT → DELIVERED → CONFIRM_RECEIPT inalipa muuzaji mara moja', async () => {
    await ppPaid('TX-N17', 30000, 'buyer');
    await db.doc('orders/n17').set({ source: 'negotiation', commerceType: 'product', negotiationId: 'neg17', buyerId: 'buyer', sellerId: 'seller', amount: 30000, status: 'payment_pending', paymentStatus: 'pending', paymentRef: 'TX-N17', deliveryStatus: 'held' });
    const st = await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-N17' }); assert(st.ok, st.message);
    eq((await get('orders/n17')).status, 'held', 'server imefunga escrow');
    for (const [who, cmd] of [['seller', 'PREPARE_ORDER'], ['seller', 'START_TRANSIT'], ['seller', 'MARK_DELIVERED'], ['buyer', 'CONFIRM_RECEIPT']]) {
      const r = await call('negotiationOrderAction', who, { orderId: 'n17', command: cmd, commandId: 'c_' + cmd });
      assert(r.ok, cmd + ': ' + r.message);
    }
    const o = await get('orders/n17');
    eq(o.status, 'completed', 'completed'); eq(o.deliveryStatus, 'confirmed', 'hatua ya UI imehifadhiwa');
    eq(await bal('seller'), 30000, 'muuzaji amelipwa');
    eq((await get('escrow_holds/order_n17')).released, true, 'hold released');
    assert(await exists('wallet_ledger/order_n17_released'), 'marker');
    const again = await call('negotiationOrderAction', 'buyer', { orderId: 'n17', command: 'CONFIRM_RECEIPT', commandId: 'c_CONFIRM_RECEIPT' });
    assert(again.ok, 'replay idempotent');
    const again2 = await call('negotiationOrderAction', 'buyer', { orderId: 'n17', command: 'CONFIRM_RECEIPT', commandId: 'c_new' });
    assert(!again2.ok, 'amri mpya baada ya completed inakataliwa');
    const er = await call('escrowRelease', 'buyer', { orderId: 'n17' });
    assert(er.ok && er.data.already, 'escrowRelease = already');
    eq(await bal('seller'), 30000, 'mara moja tu');
  });
  await test('T18 lango la "imelipwa" la kughushi (paymentStatus/status) halifanyi kazi', async () => {
    await db.doc('orders/n18').set({ source: 'negotiation', commerceType: 'product', buyerId: 'buyer', sellerId: 'seller', amount: 50000, status: 'held', paymentStatus: 'paid', paymentVerified: true, deliveryStatus: 'held' });
    denied(await call('negotiationOrderAction', 'seller', { orderId: 'n18', command: 'PREPARE_ORDER' }), ['failed-precondition'], 'forged gate');
    await db.doc('orders/n18').update({ status: 'delivered', deliveryStatus: 'delivered' });
    denied(await call('negotiationOrderAction', 'buyer', { orderId: 'n18', command: 'CONFIRM_RECEIPT' }), ['failed-precondition'], 'confirm bila escrow');
    eq((await get('orders/n18')).status, 'delivered', 'haikukamilishwa');
    eq(await bal('seller'), 30000, 'hakuna pesa mpya');
  });
  await test('T19 huduma: CONFIRM_COMPLETION inatoa escrow (split moja)', async () => {
    await ppPaid('TX-N19', 12000, 'buyer');
    await db.doc('orders/n19').set({ source: 'negotiation', commerceType: 'service', buyerId: 'buyer', sellerId: 'seller', amount: 12000, status: 'payment_pending', paymentRef: 'TX-N19', serviceStatus: 'held' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-N19' });
    for (const [who, cmd] of [['seller', 'START_SERVICE'], ['seller', 'SUBMIT_WORK'], ['buyer', 'CONFIRM_COMPLETION']]) {
      const r = await call('negotiationOrderAction', who, { orderId: 'n19', command: cmd }); assert(r.ok, cmd + ': ' + r.message);
    }
    eq(await bal('seller'), 42000, 'muuzaji +12000');
    eq((await get('orders/n19')).serviceStatus, 'completed', 'hatua ya huduma');
  });

  /* ================= P5 — suluhu ya mgogoro (walletAdjust) ================= */
  group = 'P5 dispute payouts'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller', 'eve']) await user(u);

  await test('T20 S5: baada ya release, disputed + amount 5M → refund ya admin inakataliwa', async () => {
    await paidOrder('o20', 20000);
    assert((await call('escrowRelease', 'buyer', { orderId: 'o20' })).ok, 'release');
    await db.doc('orders/o20').update({ status: 'disputed', amount: 5000000 }); // data ya zamani (kupita rules)
    denied(await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: 5000000, type: 'refund', ledgerKey: 'dispwin_o20_buyer' }), ['failed-precondition'], 'double pay');
    denied(await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: 20000, type: 'refund', ledgerKey: 'dispwin_o20_buyer' }), ['failed-precondition'], 'hata kiasi halisi');
    eq(await bal('buyer'), 0, 'mnunuzi hakulipwa'); eq(await bal('seller'), 20000, 'muuzaji');
  });
  await test('T21 hakuna hold / kiasi ≤ 0 → suluhu inakataliwa', async () => {
    await db.doc('orders/o21').set({ buyerId: 'buyer', sellerId: 'seller', amount: 7000, status: 'disputed' });
    denied(await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: 7000, type: 'refund', ledgerKey: 'dispwin_o21_buyer' }), ['failed-precondition'], 'hakuna hold');
    await paidOrder('o21b', 7000);
    denied(await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: -100, type: 'refund', ledgerKey: 'dispwin_o21b_buyer' }), ['invalid-argument'], 'hasi');
    eq(await bal('buyer'), 0, 'hakuna malipo');
  });
  await test('T22 split: jumla ≤ hold; malipo ya ziada / ya tatu yanakataliwa; winner kamili halali', async () => {
    await user('seller22'); await user('buyer22');
    await paidOrder('o22', 10000, { sellerId: 'seller22', buyerId: 'buyer22' });
    await db.doc('orders/o22').update({ status: 'split_refund_resolved' });
    denied(await call('walletAdjust', ADMIN, { docId: 'buyer22', amountTSh: 12000, type: 'refund', ledgerKey: 'splitref_buyer_o22' }), ['failed-precondition'], 'zaidi ya hold');
    assert((await call('walletAdjust', ADMIN, { docId: 'buyer22', amountTSh: 6000, type: 'refund', ledgerKey: 'splitref_buyer_o22' })).ok, 'buyer 6000');
    denied(await call('walletAdjust', ADMIN, { docId: 'seller22', amountTSh: 5000, type: 'escrow_release', ledgerKey: 'splitref_seller_o22' }), ['failed-precondition'], 'seller > remainder');
    assert((await call('walletAdjust', ADMIN, { docId: 'seller22', amountTSh: 4000, type: 'escrow_release', ledgerKey: 'splitref_seller_o22' })).ok, 'seller 4000');
    denied(await call('walletAdjust', ADMIN, { docId: 'buyer22', amountTSh: 1, type: 'refund', ledgerKey: 'dispwin_o22_buyer' }), ['failed-precondition'], 'hold imetumika yote');
    const h = await get('escrow_holds/order_o22');
    eq(h.disputePaid, 10000, 'disputePaid'); eq(h.releasedFor, 'admin_dispute', 'releasedFor');
    eq(await bal('buyer22'), 6000, 'buyer'); eq(await bal('seller22'), 4000, 'seller');
    // release ya kawaida baada ya suluhu → haipo
    const er = await call('escrowRelease', ADMIN, { orderId: 'o22' });
    assert(!er.ok || er.data.already, 'hakuna release baada ya suluhu'); eq(await bal('seller22'), 4000, 'seller hakuongezwa');
    await paidOrder('o22w', 8000);
    await db.doc('orders/o22w').update({ status: 'refunded_by_admin' });
    assert((await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: 8000, type: 'refund', ledgerKey: 'dispwin_o22w_buyer' })).ok, 'winner buyer halali');
    eq(await bal('buyer'), 8000, 'buyer +8000');
    const rep = await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: 8000, type: 'refund', ledgerKey: 'dispwin_o22w_buyer' });
    assert(rep.ok && rep.data.already, 'replay = already'); eq(await bal('buyer'), 8000, 'mara moja');
  });
  await test('T23 mpokeaji lazima alingane na nafasi (buyer/seller) ya escrow', async () => {
    await paidOrder('o23', 9000);
    denied(await call('walletAdjust', ADMIN, { docId: 'eve', amountTSh: 9000, type: 'refund', ledgerKey: 'dispwin_o23_buyer' }), ['permission-denied'], 'eve kama buyer');
    denied(await call('walletAdjust', ADMIN, { docId: 'buyer', amountTSh: 9000, type: 'escrow_release', ledgerKey: 'dispwin_o23_seller' }), ['permission-denied'], 'buyer kama seller');
    assert((await call('walletAdjust', ADMIN, { docId: 'seller', amountTSh: 9000, type: 'escrow_release', ledgerKey: 'dispwin_o23_seller' })).ok, 'seller halali');
    eq(await bal('eve'), 0, 'eve');
  });

  /* ================= P6 — deliveryAccept / token / rules za safari ================= */
  group = 'P6 ride acceptance'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'seller', 'driver', 'driver2', 'eve']) await user(u);

  await test('T24 madereva wawili kwa wakati mmoja → mmoja tu anafanikiwa', async () => {
    for (let i = 0; i < 3; i++) {
      await newRide('c' + i);
      const [a, b] = await Promise.all([call('deliveryAccept', 'driver', { rideId: 'c' + i }), call('deliveryAccept', 'driver2', { rideId: 'c' + i })]);
      eq([a, b].filter(x => x.ok).length, 1, 'mmoja tu (round ' + i + ')');
      const rd = await get('ride_requests/c' + i);
      eq(rd.driverId, a.ok ? 'driver' : 'driver2', 'driverId = mshindi');
    }
  });
  await test('T25 dereva yule yule kukubali tena = idempotent (hakuna reset)', async () => {
    await newRide('r25');
    const a = await call('deliveryAccept', 'driver', { rideId: 'r25' }); assert(a.ok, a.message);
    const before = await get('ride_requests/r25');
    const b = await call('deliveryAccept', 'driver', { rideId: 'r25' });
    assert(b.ok && b.data.already, 'already'); eq(b.data.token, a.data.token, 'token ile ile');
    const after = await get('ride_requests/r25');
    eq(after.acceptedAt, before.acceptedAt, 'acceptedAt haijabadilika'); eq(after.pickupTokenHash, before.pickupTokenHash, 'hash');
    await db.doc('ride_requests/r25').update({ status: 'in_transit', custodyStage: 'transit' });
    const c = await call('deliveryAccept', 'driver', { rideId: 'r25' });
    assert(!c.ok, 'kukubali tena ukiwa njiani kunakataliwa (hakuna reset)');
    eq((await get('ride_requests/r25')).custodyStage, 'transit', 'custody haijarudishwa nyuma');
  });
  await test('T26 safari completed/cancelled/in-custody haiwezi kutekwa; mgeni hawezi kubadilisha driverId/status', async () => {
    for (const [id, st] of [['h1', 'completed'], ['h2', 'cancelled'], ['h3', 'in_transit'], ['h4', 'picked_up'], ['h5', 'seller_confirmed_handover']]) {
      await newRide(id, { status: st, driverId: 'driver', acceptedAt: hoursAgo(1), custodyStage: st === 'completed' ? 'completed' : 'transit' });
      denied(await call('deliveryAccept', 'driver2', { rideId: id }), ['failed-precondition'], st);
      eq((await get('ride_requests/' + id)).driverId, 'driver', st + ' driverId');
    }
    // S6a: mgeni hawezi kumwondoa dereva, halafu kujikubalisha
    await db.doc('ride_requests/h6').set({ customerId: B.uid, driverId: D.uid, status: 'in_transit', acceptedAt: hoursAgo(1), custodyStage: 'transit', agreedFare: 3000 });
    eq(await restPatch(X.token, 'ride_requests/h6', { driverId: null, status: 'searching' }), 403, 'mgeni driverId null');
    eq(await restPatch(B.token, 'ride_requests/h6', { driverId: null, status: 'searching' }), 403, 'mteja baada ya pickup');
    eq(await restPatch(D.token, 'ride_requests/h6', { status: 'completed' }), 403, 'dereva status completed (S6d)');
    eq(await restPatch(D.token, 'ride_requests/h6', { driverLat: -2.5, driverLon: 32.9, driverLocAt: 'x', driverLocName: 'Mwanza' }), 200, 'eneo la dereva (25-tracking-hub)');
    // breakdown halali (20-logistics): dereva anajiondoa, safari inarudi sokoni
    eq(await restPatch(D.token, 'ride_requests/h6', { status: 'searching', oldDriverId: D.uid, driverId: null, driverName: null, driverPhone: null, isRecoveryActive: true }), 200, 'breakdown');
    // mteja: kughairi / kubadilisha msafirishaji KABLA ya pickup
    await db.doc('ride_requests/h7').set({ customerId: B.uid, driverId: D.uid, status: 'accepted', acceptedAt: hoursAgo(1), custodyStage: 'pickup', agreedFare: 3000 });
    eq(await restPatch(X.token, 'ride_requests/h7', { status: 'cancelled' }), 403, 'mgeni cancel');
    eq(await restPatch(B.token, 'ride_requests/h7', { driverId: null, status: 'searching' }), 200, 'mteja reassign kabla ya pickup');
    eq(await restPatch(B.token, 'ride_requests/h7', { status: 'cancelled' }), 200, 'mteja cancel kabla ya pickup');
    // mteja hawezi kujikubalisha
    await newRide('h8');
    denied(await call('deliveryAccept', 'buyer', { rideId: 'h8' }), ['permission-denied'], 'mteja');
    const a8 = await call('deliveryAccept', 'driver2', { rideId: 'h8' }); assert(a8.ok, 'dereva halali: ' + a8.message);
  });
  await test('T27 token ya pickup: kabla ya pickup tu — haibadilishi safari iliyo njiani/imekamilika/imeghairiwa', async () => {
    for (const st of ['in_transit', 'completed', 'cancelled', 'picked_up']) {
      const id = 'g_' + st;
      await newRide(id, { status: st, driverId: 'driver', acceptedAt: hoursAgo(1), custodyStage: 'transit', pickupTokenStatus: 'used' });
      denied(await call('deliveryGenerateToken', 'driver', { rideId: id, kind: 'pickup' }), ['failed-precondition'], st);
      const rd = await get('ride_requests/' + id);
      eq(rd.status, st, st + ' status'); eq(rd.custodyStage, 'transit', st + ' custody');
    }
    await newRide('g_ok');
    assert((await call('deliveryAccept', 'driver', { rideId: 'g_ok' })).ok, 'accept');
    const t = await call('deliveryGenerateToken', 'driver', { rideId: 'g_ok', kind: 'pickup' });
    assert(t.ok && t.data.token, 'kabla ya pickup: halali');
  });
  await test('T28 uwasilishaji unaoendelea unazuia auto-release; baada ya kukamilika muuzaji + carrier wanalipwa', async () => {
    await paidOrder('o28', 20000);
    await newRide('r28', { orderId: 'o28' });
    await db.doc('orders/o28').update({ rideRequestId: 'r28', deliveryId: 'r28' });
    await custodyChain('r28', 'driver', 'seller');
    await db.doc('escrow_holds/order_o28').update({ verifiedAt: hoursAgo(72) });
    await db.doc('orders/o28').update({ status: 'shipped', shippedAt: hoursAgo(72) });
    await autoRelease(30);
    eq(await bal('seller'), 0, 'auto-release imesubiri uwasilishaji');
    eq((await get('orders/o28')).status, 'shipped', 'bado shipped');
    const r = await call('deliveryComplete', 'buyer', { rideId: 'r28' }); assert(r.ok, r.message);
    eq(await bal('driver'), 3000, 'carrier = agreedFare'); eq(await bal('seller'), 17000, 'muuzaji');
    await autoRelease(60);
    eq(await bal('seller'), 17000, 'hakuna malipo ya pili');
    // oda bila uwasilishaji: tabia ya zamani (auto-release baada ya saa 24)
    await paidOrder('o28b', 6000);
    await db.doc('escrow_holds/order_o28b').update({ verifiedAt: hoursAgo(72) });
    await db.doc('orders/o28b').update({ status: 'shipped', shippedAt: hoursAgo(72) });
    await autoRelease(30);
    eq(await bal('seller'), 23000, 'oda bila uwasilishaji imetolewa');
  });

  /* ---------------- muhtasari ---------------- */
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE 2 SECURITY: ' + pass + ' passed, ' + fail + ' failed');
  results.filter(r => !r.ok).forEach(r => console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });

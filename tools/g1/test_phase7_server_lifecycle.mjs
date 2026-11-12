#!/usr/bin/env node
/* ============================================================
 * PHASE 7 — server lifecycle ya pesa: PesaPal checkout -> IPN/status
 * -> settle (order/link/deposit) -> release. Emulator-only.
 * In-process callable .run() + in-process IPN + stubbed PesaPal net.
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
process.env.PESAPAL_CONSUMER_KEY = 'test-key';
process.env.PESAPAL_CONSUMER_SECRET = 'test-secret';
process.env.PESAPAL_BASE_URL = 'https://pesapal.stub/v3';
process.env.ADMIN_EMAILS = 'admin@sokohai.test';

/* ---------- PesaPal stub (mtandao tu) ---------- */
const realFetch = globalThis.fetch;
const PP = new Map();
let SUBMIT_HOOK = null;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith('https://pesapal.stub/')) {
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('/api/Auth/RequestToken')) return json({ token: 'stub-token', expiryDate: new Date(Date.now() + 3e5).toISOString(), status: '200' });
    if (u.includes('/api/Transactions/SubmitOrderRequest')) {
      const body = JSON.parse((opts && opts.body) || '{}');
      if (SUBMIT_HOOK) return json(await SUBMIT_HOOK(body));
      return json({ redirect_url: 'https://pesapal.stub/pay/' + body.id, order_tracking_id: body.id, status: '200' });
    }
    if (u.includes('/api/URLSetup/RegisterIPN')) return json({ ipn_id: 'IPN-STUB-1', status: '200' });
    if (u.includes('/GetTransactionStatus')) {
      const id = new URL(u).searchParams.get('orderTrackingId');
      const t = PP.get(id);
      if (!t) return json({ status_code: 0, payment_status_description: 'INVALID', order_tracking_id: id, amount: 0, currency: 'TZS', status: '200' });
      return json({ status_code: t.status_code ?? 1, payment_status_description: (t.status_code ?? 1) === 1 ? 'Completed' : 'Failed',
        order_tracking_id: id, merchant_reference: t.merchant_reference || '', amount: t.amount, currency: t.currency || 'TZS', status: '200' });
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
  PP.clear(); SUBMIT_HOOK = null;
}
async function ipn(query) {
  const res = { _h: {}, _c: 0, _b: '', set() {}, type() { return this; }, status(c) { this._c = c; return this; }, send(b) { this._b = String(b); return this; } };
  await fns.pesapalIpn({ method: 'GET', query: query || {} }, res);
  return { status: res._c, body: JSON.parse(res._b || '{}') };
}
const bal = async (uid) => Number(((await db.doc('users/' + uid).get()).data() || {}).walletBalance || 0);
const user = (uid, extra) => db.doc('users/' + uid).set(Object.assign({ uid, fullName: uid, walletBalance: 0 }, extra || {}));
const getd = async (p) => (await db.doc(p).get()).data();
const exists = async (p) => (await db.doc(p).get()).exists;
async function withProduct(id, o) {
  o = Object.assign({}, o);
  if (!o.itemId) o.itemId = 'item_' + id;
  await db.doc('products/' + o.itemId).set({ title: 'Bidhaa ' + o.itemId, price: Number(o.amount || 0), stock: 5, userId: o.sellerId || 'seller' });
  return o;
}
const order = async (id, o) => db.doc('orders/' + id).set(await withProduct(id, Object.assign({ buyerId: 'buyer', sellerId: 'seller', amount: 10000, status: 'payment_pending', itemId: 'item_' + id }, o || {})));
const link = (id, o) => db.doc('sokopay_links/' + id).set(Object.assign({ userId: 'seller', price: 5000, status: 'pending', title: 'Kazi' }, o || {}));
async function ppPaid(trackingId, amount, uid, merchantRef) {
  const mref = merchantRef || ('M_' + trackingId);
  PP.set(trackingId, { amount, status_code: 1, merchant_reference: mref });
  if (uid) await db.doc('escrow_holds/ppinit_' + mref).set({ kind: 'pesapal_init', uid, amount, merchantReference: mref });
  return mref;
}

/* ============================================================ */
async function main() {
  await wipe();
  for (const u of ['buyer', 'seller', 'eve', 'accomplice']) await user(u);

  group = 'L1 checkout'; console.log('\n[' + group + ']');
  await test('L1 unauth checkout denied', async () => {
    denied(await call('pesapalCheckout', null, { amount: 1000 }), ['unauthenticated'], 'no auth');
  });
  await test('L1 invalid amount denied', async () => {
    for (const a of [0, -5, 'x', null]) denied(await call('pesapalCheckout', 'buyer', { amount: a }), ['invalid-argument'], 'amt=' + a);
  });
  await test('L1 ok: redirect + ppinit(purpose/kind/target)', async () => {
    const r = await call('pesapalCheckout', 'buyer', { amount: 10000, orderTrackingId: 'CK1', purpose: 'order', kind: 'order', targetId: 'o1' });
    assert(r.ok, JSON.stringify(r));
    assert((r.data.redirectUrl || '').startsWith('https://pesapal.stub/pay/'), 'redirect ya stub');
    const pi = await getd('escrow_holds/ppinit_CK1');
    eq(pi.uid, 'buyer', 'initiator'); eq(pi.amount, 10000, 'init amount');
    eq(pi.purpose, 'order', 'purpose'); eq(pi.targetId, 'o1', 'targetId');
  });
  await test('L1 duplicate trackingId by other user -> already-exists', async () => {
    denied(await call('pesapalCheckout', 'eve', { amount: 10000, orderTrackingId: 'CK1' }), ['already-exists'], 'eve CK1');
  });
  await test('L1 same user retry ok', async () => {
    const r = await call('pesapalCheckout', 'buyer', { amount: 10000, orderTrackingId: 'CK1' });
    assert(r.ok, JSON.stringify(r));
  });
  await test('L1 missing redirect_url from PesaPal -> internal', async () => {
    SUBMIT_HOOK = async () => ({ status: '200' });
    denied(await call('pesapalCheckout', 'buyer', { amount: 1000, orderTrackingId: 'CK-NOREDIR' }), ['internal'], 'no redirect');
    SUBMIT_HOOK = null;
  });
  await test('L1 SubmitOrderRequest network fail -> internal', async () => {
    SUBMIT_HOOK = async () => { throw new Error('DOWN'); };
    denied(await call('pesapalCheckout', 'buyer', { amount: 1000, orderTrackingId: 'CK-DOWN' }), null, 'down');
    SUBMIT_HOOK = null;
  });
  await test('L1 deposit-purpose checkout records purpose=deposit', async () => {
    const r = await call('pesapalCheckout', 'buyer', { amount: 20000, orderTrackingId: 'CK-D1', purpose: 'deposit' });
    assert(r.ok, JSON.stringify(r));
    eq((await getd('escrow_holds/ppinit_CK-D1')).purpose, 'deposit', 'purpose deposit');
  });

  group = 'L2 IPN+settle'; console.log('\n[' + group + ']');
  await test('L2 IPN bila ids -> 200 ack, hakuna kilichowekwa', async () => {
    const r = await ipn({});
    eq(r.status, 200, 'ack 200'); eq(r.body.status, 200, 'ack body');
    eq((await db.collection('escrow_holds').get()).size, 3, 'ppinit 3 tu (CK1, CK-D1 + ...)');
  });
  await test('L2 IPN unpaid tx -> ack, hakuna hold', async () => {
    PP.set('TX-U1', { amount: 5000, status_code: 0, merchant_reference: 'M_TX-U1' });
    await order('u1', { paymentRef: 'TX-U1' });
    const r = await ipn({ OrderTrackingId: 'TX-U1' });
    eq(r.status, 200, 'ack');
    assert(!(await exists('escrow_holds/order_u1')), 'hakuna hold');
    eq((await getd('orders/u1')).status, 'payment_pending', 'oda haijasonga');
  });
  await test('L2 IPN happy: held + hold + usage + protected event', async () => {
    await ppPaid('TX-H1', 10000, 'buyer');
    await order('h1', { paymentRef: 'TX-H1', conversationId: 'cv1', itemTitle: 'Kiti' });
    const r = await ipn({ OrderTrackingId: 'TX-H1', OrderMerchantReference: 'M_TX-H1', OrderNotificationType: 'IPNCHANGE' });
    eq(r.status, 200, 'ack');
    const od = await getd('orders/h1');
    eq(od.status, 'held', 'held'); eq(od.paymentStatus, 'paid', 'paid'); eq(od.paymentVerified, true, 'verified');
    const h = await getd('escrow_holds/order_h1');
    eq(h.amount, 10000, 'hold amount'); eq(h.released, false, 'hold fresh');
    eq(h.payerUid, 'buyer', 'payer'); eq(h.payeeUid, 'seller', 'payee');
    const us = await getd('escrow_holds/pptx_TX-H1');
    eq(us.usedAmount, 10000, 'usage 10000'); eq(us.targets.length, 1, 'target 1');
    assert(await exists('conversations/cv1/messages/payprot_h1'), 'protected event chat');
    assert(await exists('notifications/payprot_h1'), 'notif muuzaji');
  });
  await test('L2 IPN replay -> already_verified, mara moja', async () => {
    await ipn({ OrderTrackingId: 'TX-H1' });
    const us = await getd('escrow_holds/pptx_TX-H1');
    eq(us.usedAmount, 10000, 'usage haijaongezeka'); eq(us.targets.length, 1, 'targets 1');
  });
  await test('L2 status_check after settle -> paid, settled empty', async () => {
    const st = await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-H1' });
    assert(st.ok && st.data.paid === true, JSON.stringify(st.data));
    eq((st.data.settled || []).length, 0, 'settled empty (already)');
  });
  await test('L2 payer_not_initiator skipped', async () => {
    await ppPaid('TX-P1', 10000, 'buyer');
    await order('pe1', { buyerId: 'eve', sellerId: 'accomplice', paymentRef: 'TX-P1' });
    await ipn({ OrderTrackingId: 'TX-P1' });
    assert(!(await exists('escrow_holds/order_pe1')), 'hakuna hold ya wizi');
  });
  await test('L2 amount_exceeds skipped', async () => {
    await ppPaid('TX-S1', 1000, 'buyer');
    await order('big1', { amount: 10000, paymentRef: 'TX-S1' });
    await ipn({ OrderTrackingId: 'TX-S1' });
    assert(!(await exists('escrow_holds/order_big1')), 'hakuna hold');
  });
  await test('L2 underpriced -> price_review', async () => {
    await ppPaid('TX-PR', 100, 'buyer');
    await order('pr1', { amount: 100, paymentRef: 'TX-PR' });
    await db.doc('products/item_pr1').update({ price: 10000 }); // bei halisi kubwa
    await ipn({ OrderTrackingId: 'TX-PR' });
    eq((await getd('orders/pr1')).paymentStatus, 'price_review', 'price_review');
    assert(!(await exists('escrow_holds/order_pr1')), 'hakuna hold');
  });
  await test('L2 product-path price ok settles', async () => {
    await ppPaid('TX-PP', 7500, 'buyer');
    await order('pp1', { amount: 7500, paymentRef: 'TX-PP' });
    await ipn({ OrderTrackingId: 'TX-PP' });
    eq((await getd('orders/pp1')).status, 'held', 'held');
  });
  await test('L2 multi-target within cap', async () => {
    await ppPaid('TX-M', 15000, 'buyer');
    await order('m1', { amount: 10000, paymentRef: 'TX-M' });
    await order('m2', { amount: 5000, paymentRef: 'TX-M' });
    await ipn({ OrderTrackingId: 'TX-M' });
    eq((await getd('orders/m1')).status, 'held', 'm1 held');
    eq((await getd('orders/m2')).status, 'held', 'm2 held');
    eq((await getd('escrow_holds/pptx_TX-M')).usedAmount, 15000, 'usage 15000');
  });

  group = 'L3 release'; console.log('\n[' + group + ']');
  await test('L3 forged held denied', async () => {
    await order('forged1', { paymentVerified: true, paymentStatus: 'paid', paymentRef: 'TX-NONE' });
    denied(await call('escrowRelease', 'buyer', { orderId: 'forged1' }), ['failed-precondition'], 'forged');
    eq(await bal('seller'), 0, 'seller 0');
  });
  await test('L3 happy release pays seller, idempotent', async () => {
    const r = await call('escrowRelease', 'buyer', { orderId: 'h1' });
    assert(r.ok, r.message);
    eq(await bal('seller'), 10000, 'seller +10000');
    eq((await getd('orders/h1')).status, 'completed', 'completed');
    eq((await getd('escrow_holds/order_h1')).released, true, 'hold released');
    const r2 = await call('escrowRelease', 'buyer', { orderId: 'h1' });
    assert(r2.ok && r2.data.already, 'idempotent');
    await db.doc('orders/h1').update({ status: 'held' }); // flip-back jaribio
    const r3 = await call('escrowRelease', 'buyer', { orderId: 'h1' });
    assert(r3.ok && r3.data.already, 'flip-back blocked');
    eq(await bal('seller'), 10000, 'mara moja tu');
  });
  await test('L3 stranger/seller self-release denied', async () => {
    denied(await call('escrowRelease', 'eve', { orderId: 'm1' }), ['permission-denied'], 'eve');
    denied(await call('escrowRelease', 'seller', { orderId: 'm1' }), ['permission-denied'], 'seller self');
    eq(await bal('seller'), 10000, 'hakuna mabadiliko');
  });
  await test('L3 amount changed after verify denied', async () => {
    await db.doc('orders/m2').update({ amount: 900000 });
    denied(await call('escrowRelease', 'buyer', { orderId: 'm2' }), ['failed-precondition'], 'mismatch');
    eq(await bal('seller'), 10000, 'hakuna malipo');
  });
  await test('L3 seller swapped after verify denied', async () => {
    await ppPaid('TX-SW', 10000, 'buyer');
    await order('sw1', { paymentRef: 'TX-SW' });
    await ipn({ OrderTrackingId: 'TX-SW' });
    await db.doc('orders/sw1').update({ sellerId: 'accomplice' });
    denied(await call('escrowRelease', 'buyer', { orderId: 'sw1' }), ['failed-precondition'], 'swapped');
    eq(await bal('accomplice'), 0, 'accomplice 0');
  });
  await test('L3 admin release with reason ok; without denied', async () => {
    await ppPaid('TX-ADM', 4000, 'buyer');
    await order('adm1', { amount: 4000, paymentRef: 'TX-ADM' });
    await ipn({ OrderTrackingId: 'TX-ADM' });
    denied(await call('escrowRelease', ADMIN, { orderId: 'adm1' }), ['invalid-argument'], 'bila sababu');
    const r = await call('escrowRelease', ADMIN, { reason: 'Uthibitisho wa admin (test)', orderId: 'adm1' });
    assert(r.ok, r.message);
    eq(await bal('seller'), 14000, 'seller 14000');
  });

  group = 'L4 links'; console.log('\n[' + group + ']');
  await test('L4 link happy: held + seller notified', async () => {
    await ppPaid('TX-L1', 5000, 'buyer');
    await link('l1', { buyerId: 'buyer', transactionId: 'TX-L1' });
    const st = await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-L1' });
    assert(st.ok, st.message);
    const L = await getd('sokopay_links/l1');
    eq(L.status, 'held', 'held'); eq(L.paymentVerified, true, 'verified');
    const nL = await getd('notifications/escrow_link_l1');
    assert(nL && nL.userId === 'seller' && nL.system === true, 'notif server kwa muuzaji');
  });
  await test('L4 link replay idempotent', async () => {
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-L1' });
    eq((await getd('escrow_holds/pptx_TX-L1')).targets.length, 1, 'target 1');
  });
  await test('L4 buyer releases link; seller/stranger denied', async () => {
    denied(await call('sokopayReleaseLink', 'seller', { linkId: 'l1' }), ['permission-denied'], 'seller self');
    denied(await call('sokopayReleaseLink', 'eve', { linkId: 'l1' }), ['permission-denied'], 'eve');
    const r = await call('sokopayReleaseLink', 'buyer', { linkId: 'l1' });
    assert(r.ok, r.message);
    eq(await bal('seller'), 19000, 'seller 14000+5000');
    const r2 = await call('sokopayReleaseLink', 'buyer', { linkId: 'l1' });
    assert(r2.ok, 'replay ok');
    eq(await bal('seller'), 19000, 'mara moja tu');
  });
  await test('L4 price changed after pay denied', async () => {
    await ppPaid('TX-L2', 5000, 'buyer');
    await link('l2', { buyerId: 'buyer', transactionId: 'TX-L2' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-L2' });
    await db.doc('sokopay_links/l2').update({ price: 500000 });
    denied(await call('sokopayReleaseLink', 'buyer', { linkId: 'l2' }), ['failed-precondition'], 'price changed');
    eq(await bal('seller'), 19000, 'hakuna malipo');
  });
  await test('L4 parties swapped denied', async () => {
    await ppPaid('TX-L3', 5000, 'buyer');
    await link('l3', { buyerId: 'buyer', transactionId: 'TX-L3' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-L3' });
    await db.doc('sokopay_links/l3').update({ buyerId: 'eve', userId: 'accomplice' });
    denied(await call('sokopayReleaseLink', 'eve', { linkId: 'l3' }), null, 'swapped');
    eq(await bal('accomplice'), 0, 'accomplice 0');
  });
  await test('L4 small payment unsettled', async () => {
    await ppPaid('TX-LS', 100, 'buyer');
    await link('ls1', { buyerId: 'buyer', transactionId: 'TX-LS' });
    await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-LS' });
    eq((await getd('sokopay_links/ls1')).status, 'pending', 'bado pending');
    assert(!(await exists('escrow_holds/link_ls1')), 'hakuna hold');
  });

  group = 'L5 deposit F7-1'; console.log('\n[' + group + ']');
  await test('L5 deposit checkout records purpose', async () => {
    const r = await call('pesapalCheckout', 'buyer', { amount: 15000, orderTrackingId: 'CK-D2', purpose: 'deposit' });
    assert(r.ok, JSON.stringify(r));
    eq((await getd('escrow_holds/ppinit_CK-D2')).purpose, 'deposit', 'purpose');
  });
  await test('L5 IPN-only credits wallet (no return)', async () => {
    PP.set('CK-D1', { amount: 20000, status_code: 1, merchant_reference: 'CK-D1' });
    const b0 = await bal('buyer');
    await ipn({ OrderTrackingId: 'CK-D1' });
    eq(await bal('buyer'), b0 + 20000, 'wallet +20000');
    const lg = await getd('wallet_ledger/pesapal_deposit_CK-D1');
    eq(lg && lg.amountTSh, 20000, 'ledger +20000');
    eq(lg && lg.type, 'deposit', 'type deposit');
    const nn = await db.collection('notifications').where('userId', '==', 'buyer').where('type', '==', 'deposit').get();
    assert(nn.size >= 1, 'notif deposit');
  });
  await test('L5 IPN replay single credit', async () => {
    const b0 = await bal('buyer');
    await ipn({ OrderTrackingId: 'CK-D1' });
    eq(await bal('buyer'), b0, 'hakuna double-credit');
  });
  await test('L5 browser deposit after IPN -> already', async () => {
    PP.set('CK-D1', { amount: 20000, status_code: 1, merchant_reference: 'CK-D1' });
    const r = await call('walletAdjust', 'buyer', { docId: 'buyer', amountTSh: 20000, type: 'deposit', orderTrackingId: 'CK-D1' });
    assert(r.ok && r.data.already === true, 'already:true: ' + JSON.stringify(r.data));
  });
  await test('L5 reverse order: browser first, IPN second -> single', async () => {
    PP.set('CK-D2', { amount: 15000, status_code: 1, merchant_reference: 'CK-D2' });
    const b0 = await bal('buyer');
    const r = await call('walletAdjust', 'buyer', { docId: 'buyer', amountTSh: 15000, type: 'deposit', orderTrackingId: 'CK-D2' });
    assert(r.ok && !r.data.already, 'browser first wins: ' + JSON.stringify(r.data));
    eq(await bal('buyer'), b0 + 15000, 'wallet +15000');
    await ipn({ OrderTrackingId: 'CK-D2' });
    eq(await bal('buyer'), b0 + 15000, 'IPN hakuongeza tena');
  });
  await test('L5 mismatch skipped', async () => {
    await call('pesapalCheckout', 'buyer', { amount: 5000, orderTrackingId: 'CK-D3', purpose: 'deposit' });
    PP.set('CK-D3', { amount: 4000, status_code: 1, merchant_reference: 'CK-D3' });
    const b0 = await bal('buyer');
    await ipn({ OrderTrackingId: 'CK-D3' });
    eq(await bal('buyer'), b0, 'hakuna credit (mismatch)');
    assert(!(await exists('wallet_ledger/pesapal_deposit_CK-D3')), 'hakuna ledger');
  });
  await test('L5 deposit by other uid denied', async () => {
    denied(await call('walletAdjust', 'eve', { docId: 'eve', amountTSh: 20000, type: 'deposit', orderTrackingId: 'CK-D1' }), ['permission-denied'], 'si wake');
    eq(await bal('eve'), 0, 'eve 0');
  });
  await test('L5 unpaid tid deposit denied', async () => {
    denied(await call('walletAdjust', 'buyer', { docId: 'buyer', amountTSh: 5000, type: 'deposit', orderTrackingId: 'TX-NOPE' }), ['failed-precondition'], 'unpaid');
  });

  group = 'L6 guards'; console.log('\n[' + group + ']');
  await test('L6 registerIpn: non-admin denied, admin ok, url required', async () => {
    denied(await call('pesapalRegisterIpn', 'eve', { url: 'https://x.test/ipn' }), ['permission-denied'], 'eve');
    denied(await call('pesapalRegisterIpn', ADMIN, {}), ['invalid-argument'], 'url missing');
    const r = await call('pesapalRegisterIpn', ADMIN, { url: 'https://x.test/ipn' });
    assert(r.ok && r.data.raw && r.data.raw.ipn_id === 'IPN-STUB-1', JSON.stringify(r.data));
  });
  await test('L6 currency/amount guards: USD + zero unpaid', async () => {
    PP.set('TX-USD', { amount: 10000, status_code: 1, merchant_reference: 'M_TX-USD', currency: 'USD' });
    await order('usd1', { paymentRef: 'TX-USD' });
    await ipn({ OrderTrackingId: 'TX-USD' });
    assert(!(await exists('escrow_holds/order_usd1')), 'USD hailipi');
    PP.set('TX-ZERO', { amount: 0, status_code: 1, merchant_reference: 'M_TX-ZERO' });
    await order('z1', { paymentRef: 'TX-ZERO' });
    await ipn({ OrderTrackingId: 'TX-ZERO' });
    assert(!(await exists('escrow_holds/order_z1')), 'zero hailipi');
  });
  await test('L6 ack shape + status_check settles (status path)', async () => {
    const r = await ipn({ OrderTrackingId: 'TX-ACK', OrderMerchantReference: 'M-ACK', OrderNotificationType: 'IPNCHANGE' });
    eq(r.status, 200, 'ack'); eq(r.body.orderTrackingId, 'TX-ACK', 'echo tid'); eq(r.body.status, 200, 'body 200');
    await ppPaid('TX-ST', 10000, 'buyer');
    await order('st1', { paymentRef: 'TX-ST' });
    const st = await call('pesapalTransactionStatus', 'buyer', { orderTrackingId: 'TX-ST' });
    assert(st.ok && st.data.paid, JSON.stringify(st.data));
    assert((st.data.settled || []).length === 1, 'settled via status: ' + JSON.stringify(st.data.settled));
    eq((await getd('orders/st1')).status, 'held', 'held');
  });

  /* ---------------- muhtasari ---------------- */
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE7 SERVER: ' + pass + ' pass, ' + fail + ' fail');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

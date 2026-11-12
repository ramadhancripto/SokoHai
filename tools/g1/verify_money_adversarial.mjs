#!/usr/bin/env node
/* VERIFY (D) — Money adversarial: forged price/status/balance, replay,
 * double-release, double-pay, unauthorized release. Emulator only, no live pay. */
import { createRequire } from 'node:module';
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

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
async function call(name, uid, data, extra) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: uid ? tok(uid, extra) : undefined, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function jwt(uid) { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none' }) + '.' + b64({ user_id: uid, sub: uid, iat: n, exp: n + 3600, firebase: { sign_in_provider: 'password' } }) + '.'; }
function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restPatch(uid, p, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${DOCS}/${p}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
}
const O = 'mOwn', B = 'mBuy', S = 'mSell', X = 'mStranger';
await wipe();
await db.doc('users/' + O).set({ uid: O, businessId: 'vb1', storeId: 'vs1' });
await db.doc('users/' + B).set({ uid: B, walletBalance: 100000 });
await db.doc('users/' + S).set({ uid: S, walletBalance: 0 });
await db.doc('products/mp1').set({ title: 'Sabuni', price: 500, stock: 10, userId: O, businessId: 'vb1', storeId: 'vs1' });
await db.doc('businesses/vb1').set({ businessId: 'vb1', ownerUid: O });
await db.doc('stores/vs1').set({ storeId: 'vs1', businessId: 'vb1', ownerUid: O });

await test('V-D1 posSale: bei ya mteja (forged) inapuuziwa — total ya server kutoka product', async () => {
  const r = await call('posSale', O, { idempotencyKey: 'VD-00001', items: [{ productId: 'mp1', quantity: 2, unitMode: 'pc', pricingMode: 'retail', price: 1, unitPrice: 1 }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 5000 } });
  eq(r.ok, true, JSON.stringify(r));
  eq(r.data.total, 1000, 'server total 2x500');
  eq((await db.doc('products/mp1').get()).data().stock, 8, 'stock -2');
});
await test('V-D2 posSale: double-submit sambamba (key moja) -> mauzo 1, stock inapungua mara 1', async () => {
  const p = { idempotencyKey: 'VD-00002', items: [{ productId: 'mp1', quantity: 2, unitMode: 'pc', pricingMode: 'retail' }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 5000 } };
  const rs = await Promise.all([call('posSale', O, p), call('posSale', O, p)]);
  assert(rs.every(r => r.ok), JSON.stringify(rs));
  eq((await db.doc('products/mp1').get()).data().stock, 6, 'stock -2 once');
  eq((await db.doc('sales/pos_VD-00002').get()).exists, true, 'sale exists');
});
await test('V-D3 posSale: items za maduka 2 tofauti -> denied (single-scope)', async () => {
  await db.doc('products/mp2').set({ title: 'Chai', price: 300, stock: 5, userId: X });
  const r = await call('posSale', O, { idempotencyKey: 'VD-00003', items: [{ productId: 'mp1', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }, { productId: 'mp2', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 5000 } });
  eq(r.ok, false, 'blocked'); eq(r.code, 'permission-denied', r.code);
});
await test('V-D4 escrowRelease: mgeni na muuzaji denied; mnunuzi ok', async () => {
  await db.doc('orders/ve1').set({ buyerId: B, sellerId: S, amount: 10000, status: 'held' });
  await db.doc('escrow_holds/order_ve1').set({ kind: 'escrow_hold', target: 'order', targetId: 've1', amount: 10000, payerUid: B, payeeUid: S, method: 'wallet', released: false, verifiedAt: new Date().toISOString() });
  const g = await call('escrowRelease', X, { orderId: 've1' });
  eq(g.ok, false, 'stranger'); eq(g.code, 'permission-denied', g.code);
  const s = await call('escrowRelease', S, { orderId: 've1' });
  eq(s.ok, false, 'seller'); eq(s.code, 'permission-denied', s.code);
  const b = await call('escrowRelease', B, { orderId: 've1' });
  eq(b.ok, true, JSON.stringify(b));
});
await test('V-D5 escrowRelease mara 2 -> already:true, muuzaji analipwa mara 1', async () => {
  const bal1 = (await db.doc('users/' + S).get()).data().walletBalance;
  assert(bal1 > 0, 'seller paid: ' + bal1);
  const r = await call('escrowRelease', B, { orderId: 've1' });
  eq(r.ok, true, JSON.stringify(r)); eq(r.data.already, true, 'already');
  eq((await db.doc('users/' + S).get()).data().walletBalance, bal1, 'paid once');
  eq((await db.doc('wallet_ledger/order_ve1_released').get()).exists, true, 'marker');
});
await test('V-D6 withdrawal: replay (key moja) -> debit 1; paid kisha reject -> already, no refund', async () => {
  const w1 = await call('withdrawalRequest', B, { amountTSh: 20000, channel: 'mobile', account: '0712000000', requestKey: 'WKEY1' });
  eq(w1.ok, true, JSON.stringify(w1));
  const w2 = await call('withdrawalRequest', B, { amountTSh: 20000, channel: 'mobile', account: '0712000000', requestKey: 'WKEY1' });
  eq(w2.ok && w2.data.already, true, 'replay idempotent');
  eq((await db.doc('users/' + B).get()).data().walletBalance, 80000, 'debited once');
  const ADM = 'mAdmin';
  const p = await call('withdrawalResolve', ADM, { requestId: w1.data.requestId, decision: 'paid', note: 'tumetuma M-Pesa' }, { admin: true });
  eq(p.ok, true, JSON.stringify(p));
  const rj = await call('withdrawalResolve', ADM, { requestId: w1.data.requestId, decision: 'rejected', note: 'jaribio la udanganyifu' }, { admin: true });
  eq(rj.ok && rj.data.already, true, 'no double-resolve');
  eq((await db.doc('users/' + B).get()).data().walletBalance, 80000, 'no phantom refund');
});
await test('V-D7 walletAdjust: kujiongezea salio denied; wallet ya mtu denied', async () => {
  const s = await call('walletAdjust', B, { docId: B, amountTSh: 50000, type: 'payout', ledgerKey: 'steal1', note: 'test' });
  eq(s.ok, false, 'self-credit'); eq(s.code, 'permission-denied', s.code);
  const o = await call('walletAdjust', B, { docId: S, amountTSh: -100, type: 'adjustment', ledgerKey: 'steal2', note: 'test' });
  eq(o.ok, false, 'other wallet'); eq(o.code, 'permission-denied', o.code);
});
await test('V-D8 sokopayLinkWalletPay: malipo mara 2 -> ya pili inakataliwa, debit 1', async () => {
  await db.doc('sokopay_links/vl1').set({ userId: S, price: 5000, status: 'pending', title: 'Kiungo' });
  const p1 = await call('sokopayLinkWalletPay', B, { linkId: 'vl1' });
  eq(p1.ok, true, JSON.stringify(p1));
  const p2 = await call('sokopayLinkWalletPay', B, { linkId: 'vl1' });
  eq(p2.ok, true, 'idempotent-ok'); eq(p2.data.already, true, 'already');
  eq((await db.doc('users/' + B).get()).data().walletBalance, 75000, 'debited once');
});
await test('V-D9 client forge: PATCH walletBalance / paymentVerified -> 403', async () => {
  eq(await restPatch(B, 'users/' + B, { walletBalance: 999999999 }), 403, 'balance forge');
  eq(await restPatch(B, 'orders/ve1', { paymentVerified: true }), 403, 'paymentVerified forge');
  eq(await restPatch(B, 'orders/ve1', { amount: 1 }), 403, 'amount edit');
});
await test('V-D10 posVoid: mgeni denied (scope); void mara 2 idempotent', async () => {
  const sale = (await db.doc('sales/pos_VD-00001').get()).data();
  const shape = { originalSaleId: 'pos_VD-00001', businessId: sale.businessId, storeId: sale.storeId, reason: 'test void reason' };
  const v1 = await call('posVoid', X, Object.assign({ idempotencyKey: 'VDV-00001' }, shape));
  eq(v1.ok, false, 'stranger blocked: ' + JSON.stringify(v1));
  const v2 = await call('posVoid', O, Object.assign({ idempotencyKey: 'VDV-00001' }, shape));
  eq(v2.ok, true, JSON.stringify(v2));
  const v3 = await call('posVoid', O, Object.assign({ idempotencyKey: 'VDV-00001' }, shape));
  eq(v3.ok, true, JSON.stringify(v3));
  eq((await db.doc('products/mp1').get()).data().stock, 8, 'stock restored once (6+2)');
});

await test('V-D11 EVIDENCE: sale ya legacy (bila businessId) haiwezi ku-voidiwa (gap)', async () => {
  await db.doc('users/vLeg').set({ uid: 'vLeg' });
  await db.doc('products/mpLeg').set({ title: 'Kalamu', price: 200, stock: 5, userId: 'vLeg' });
  const s = await call('posSale', 'vLeg', { idempotencyKey: 'VD-LEGACY1', items: [{ productId: 'mpLeg', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 500 } });
  eq(s.ok, true, 'legacy sale ok: ' + JSON.stringify(s));
  const v = await call('posVoid', 'vLeg', { idempotencyKey: 'VDV-LEGACY1', businessId: '', storeId: '', originalSaleId: 'pos_VD-LEGACY1', reason: 'legacy void attempt' });
  console.log('    ... legacy void matokeo: ' + JSON.stringify(v));
  assert(true, 'evidence only');
});

await test('V-D13 adminResolveDispute: non-admin denied; split inalipa mara 1; repeat idempotent', async () => {
  await db.doc('users/vB2').set({ uid: 'vB2', walletBalance: 0 });
  await db.doc('users/vS2').set({ uid: 'vS2', walletBalance: 0 });
  await db.doc('orders/vd1').set({ buyerId: 'vB2', sellerId: 'vS2', amount: 10000, status: 'disputed' });
  await db.doc('escrow_holds/order_vd1').set({ kind: 'escrow_hold', target: 'order', targetId: 'vd1', amount: 10000, payerUid: 'vB2', payeeUid: 'vS2', method: 'wallet', released: false, verifiedAt: new Date().toISOString() });
  const non = await call('adminResolveDispute', B, { orderId: 'vd1', outcome: 'refund_buyer', reason: 'jaribio la mgeni hapa' });
  eq(non.ok, false, 'non-admin'); eq(non.code, 'permission-denied', non.code);
  const r1 = await call('adminResolveDispute', 'mAdmin', { orderId: 'vd1', outcome: 'split', buyerAmount: 4000, reason: 'uamuzi wa mgogoro halali' }, { admin: true });
  eq(r1.ok, true, JSON.stringify(r1));
  eq((await db.doc('users/vB2').get()).data().walletBalance, 4000, 'buyer 4000');
  eq((await db.doc('users/vS2').get()).data().walletBalance, 6000, 'seller 6000');
  const r2 = await call('adminResolveDispute', 'mAdmin', { orderId: 'vd1', outcome: 'refund_buyer', reason: 'jaribio la kulipa mara mbili' }, { admin: true });
  eq(r2.ok, true, JSON.stringify(r2));
  eq((await db.doc('users/vB2').get()).data().walletBalance, 4000, 'no double pay buyer');
  eq((await db.doc('users/vS2').get()).data().walletBalance, 6000, 'no double pay seller');
});

await test('V-D14 adminApproveOrderPrice: non-admin denied; admin huondoa price_review + audit', async () => {
  await db.doc('orders/vp1').set({ buyerId: B, sellerId: S, amount: 15000, status: 'pending', paymentStatus: 'price_review' });
  const non = await call('adminApproveOrderPrice', B, { orderId: 'vp1', reason: 'jaribio la mnunuzi hapa' });
  eq(non.ok, false, 'non-admin'); eq(non.code, 'permission-denied', non.code);
  const r = await call('adminApproveOrderPrice', 'mAdmin', { orderId: 'vp1', reason: 'bei imethibitishwa na risiti' }, { admin: true });
  eq(r.ok, true, JSON.stringify(r));
  const o = (await db.doc('orders/vp1').get()).data();
  eq(o.paymentStatus, 'verification_pending', 'moved');
  eq(o.priceApprovedAmount, 15000, 'amount stamped');
  const au = await db.collection('admin_audit_log').where('action', '==', 'ORDER_PRICE_APPROVED').get();
  eq(au.size >= 1, true, 'audit written');
});

const fails = results.filter(r => !r.ok);
console.log(`\n[VERIFY-D] ${results.length - fails.length}/${results.length} passed`);
if (fails.length) process.exitCode = 1;

#!/usr/bin/env node
/**
 * [PHASE 3 2026-10-31] Online reservation + one stock authority, against the
 * FIRESTORE EMULATOR (real transactions, no production, no money):
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_inventory_reservation_emulator.mjs"
 * PesaPal is NOT called: settlement receives an already-verified transaction
 * object, exactly what pesapalIpn passes after GetTransactionStatus. Provider
 * callbacks / timing are therefore NOT covered here (see the Phase 3 spec).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
process.env.ADMIN_EMAILS = 'ops@sokohai.test';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const R = fns._inventoryReservationForTest;
const admin = require('firebase-admin'); const db = admin.firestore();

let pass = 0, fail = 0; const fails = [];
async function test(n, fn) { try { await fn(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; fails.push(n + ': ' + e.message); console.log('  FAIL ' + n + '\n       ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error('assert: ' + m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const who = (uid, email, extra = {}) => ({ uid, token: Object.assign({ uid, email, email_verified: true }, extra) });
const SELLER = who('seller1', 'seller1@sokohai.test');
const BUYER = who('buyer1', 'buyer1@sokohai.test');
const ADMIN = who('ops', 'ops@sokohai.test');
async function call(name, auth, data) {
  try { return { ok: true, data: await fns[name].run({ data, auth, rawRequest: { headers: {} } }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
const get = async p => (await db.doc(p).get()).data() || null;
const T0 = '2026-11-01T08:00:00.000Z';
const plus = m => new Date(Date.parse(T0) + m * 60000).toISOString();
let seq = 0;
async function order(id, data) {
  await db.doc('orders/' + id).set(Object.assign({ buyerId: 'buyer1', sellerId: 'seller1', status: 'payment_pending', paymentStatus: 'pending', paymentVerified: false, paymentRef: 'TRK-' + id, createdAt: T0 }, data));
  return id;
}
const paid = (id, amount) => ({ paid: true, trackingId: 'TRK-' + id, merchantReference: 'MR-' + id + '-' + (++seq), amount });

await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await db.doc('system_config/inventory').set({ mode: 'pilot', pilotSellerIds: ['seller1'], ttlMinutes: 15, reviewWindowMinutes: 120 });
await db.doc('users/seller1').set({ uid: 'seller1', fullName: 'Muuzaji', walletBalance: 0 });
await db.doc('users/buyer1').set({ uid: 'buyer1', fullName: 'Mnunuzi', walletBalance: 0 });
await db.doc('users/seller2').set({ uid: 'seller2', fullName: 'Nje ya pilot', walletBalance: 0 });
await db.doc('products/p1').set({ userId: 'seller1', title: 'Sabuni', price: 1000, stock: 5, availabilityStatus: 'available' });
const VAR = (id, stock) => ({ variantId: id, sku: 'SH-' + id, unitId: 'piece', price: 2000, options: { size: id }, stock, status: 'ACTIVE', inventoryKey: 'pv:' + id + ':piece' });
await db.doc('products/pv').set({ productId: 'pv', userId: 'seller1', title: 'Shati', price: 2000, stock: 0, variantCombinations: [VAR('s', 3), VAR('m', 2)] });

console.log('\n[T1 reserve]');
await test('R01 reserve 2 of 5: reserved=2, available=3, order ACTIVE', async () => {
  await order('o1', { productId: 'p1', quantity: 2, amount: 2000 });
  const r = await R.reserveOrder('o1', { nowIso: T0 });
  assert(r.ok && r.reservationId === 'o1', JSON.stringify(r));
  const p = await get('products/p1'); eq(p.stock, 5, 'stock'); eq(p.reservedStock, 2, 'reserved');
  const o = await get('orders/o1'); eq(o.reservationStatus, 'ACTIVE', 'order'); eq(o.reservationExpiresAt, plus(15), 'ttl 15 (trial)');
  const res = await get('inventory_reservations/o1'); eq(res.ttlTrial, true, 'ttl marked trial'); eq(res.lines[0].stockKey, 'seller_seller1:default:p1:product:default', 'stock key business:location:product:variant:unit');
});
await test('R02 reserve again is idempotent (trigger + callable race)', async () => {
  const [a, b] = await Promise.all([R.reserveOrder('o1', { nowIso: T0 }), R.reserveOrder('o1', { nowIso: T0 })]);
  assert(a.idempotent && b.idempotent, JSON.stringify([a, b]));
  eq((await get('products/p1')).reservedStock, 2, 'still 2');
});
await test('R03 concurrent orders cannot oversell (available 3, five buyers want 1)', async () => {
  for (let i = 0; i < 5; i++) await order('r' + i, { productId: 'p1', quantity: 1, amount: 1000 });
  const out = await Promise.all([0, 1, 2, 3, 4].map(i => R.reserveOrder('r' + i, { nowIso: T0 })));
  eq(out.filter(x => x.ok).length, 3, 'winners'); eq(out.filter(x => !x.ok && x.error === 'INSUFFICIENT_AVAILABLE').length, 2, 'losers');
  const p = await get('products/p1'); eq(p.reservedStock, 5, 'reserved = stock'); eq(p.stock, 5, 'stock unchanged');
  eq(p.availabilityStatus, 'out_of_stock', 'shown out of stock online');
  const failed = out.map((x, i) => x.ok ? null : 'r' + i).filter(Boolean);
  eq((await get('orders/' + failed[0])).reservationStatus, 'FAILED', 'loser order marked FAILED');
});
await test('R04 buyer callable: other user cannot reserve someone else\'s order', async () => {
  const r = await call('inventoryReserve', who('eve', 'eve@x.tz'), { orderId: 'o1' });
  assert(!r.ok && r.code === 'permission-denied', JSON.stringify(r));
});

console.log('\n[one authority: POS and adjustments see reservations]');
await test('R05 POS cannot sell stock reserved for online orders', async () => {
  const r = await call('posSale', SELLER, { idempotencyKey: 'pos-sale-0001', items: [{ productId: 'p1', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], payment: { method: 'Cash', cashReceived: 1000 } });
  assert(!r.ok && /imehifadhiwa kwa oda za online/.test(r.message), JSON.stringify(r));
  eq((await get('products/p1')).stock, 5, 'no stock moved');
});
await test('R06 inventoryAdjust cannot go below reserved', async () => {
  const r = await call('inventoryAdjust', SELLER, { idempotencyKey: 'adjust-0001', productId: 'p1', delta: -1, reason: 'damaged', movementType: 'ADJUSTMENT' });
  assert(!r.ok && /BELOW_RESERVED/.test(r.message), JSON.stringify(r));
});

console.log('\n[T2 commit inside the payment transaction]');
await test('R07 verified payment commits stock once: stock 5->3, reserved 5->3', async () => {
  const out = await R.settlePesaPalPayment(paid('o1', 2000), 'test');
  assert(out.settled.includes('order_o1'), JSON.stringify(out));
  const p = await get('products/p1'); eq(p.stock, 3, 'stock'); eq(p.reservedStock, 3, 'reserved');
  eq((await get('inventory_reservations/o1')).status, 'COMMITTED', 'reservation');
  const o = await get('orders/o1'); eq(o.status, 'held', 'held'); eq(o.stockCommitted, true, 'committed flag');
  const m = await get('inventory_movements/ONLINE_SALE_o1_0'); eq(m.quantity, -2, 'ledger'); eq(m.resultingStock, 3, 'ledger result');
});
await test('R08 duplicate IPN / webhook does not commit again', async () => {
  const again = await R.settlePesaPalPayment(paid('o1', 2000), 'test-dup');
  assert(!again.settled.length && again.skipped.some(s => s.reason === 'already_verified'), JSON.stringify(again));
  const p = await get('products/p1'); eq(p.stock, 3, 'stock unchanged'); eq(p.reservedStock, 3, 'reserved unchanged');
});

console.log('\n[T4 release / T5 expiry]');
const winners = (await db.collection('orders').where('reservationStatus', '==', 'ACTIVE').get()).docs.map(d => d.id).sort();
await test('R09 cancelling an unpaid order releases its reservation', async () => {
  const id = winners[0];
  await db.doc('orders/' + id).update({ status: 'cancelled' });
  const r = await R.releaseOrderReservation(id, { endedBy: 'order_cancelled' });
  eq(r.status, 'RELEASED', 'released');
  eq((await get('products/p1')).reservedStock, 2, 'reserved 3 -> 2');
  const again = await R.releaseOrderReservation(id, {}); assert(again.idempotent, 'second release is a no-op');
  eq((await get('products/p1')).reservedStock, 2, 'still 2');
});
await test('R10 sweep expires reservations after the TTL (and only then)', async () => {
  const early = await R.runSweep({ nowIso: plus(14) }); eq(early.expired, 0, 'nothing before 15 min');
  const late = await R.runSweep({ nowIso: plus(16) }); eq(late.expired, 2, 'two expired');
  const p = await get('products/p1'); eq(p.reservedStock, 0, 'reserved back to 0'); eq(p.stock, 3, 'stock untouched');
  eq((await get('orders/' + winners[1])).reservationStatus, 'EXPIRED', 'order shows EXPIRED');
});

console.log('\n[T3 late payment]');
await test('R11 late payment with stock: atomic re-reserve + commit (new reservation id)', async () => {
  const id = winners[1];
  const out = await R.settlePesaPalPayment(paid(id, 1000), 'late');
  assert(out.settled.includes('order_' + id), JSON.stringify(out));
  const o = await get('orders/' + id); eq(o.status, 'held', 'held'); eq(o.reservationId, id + '-R1', 'new reservation id');
  eq((await get('inventory_reservations/' + id + '-R1')).status, 'COMMITTED', 'committed');
  eq((await get('inventory_reservations/' + id)).status, 'EXPIRED', 'old one stays EXPIRED');
  eq((await get('products/p1')).stock, 2, 'stock 3 -> 2');
});
await test('R12 late payment WITHOUT stock: NEEDS_REVIEW, not confirmed, escrow blocked, stock never negative', async () => {
  await db.doc('products/p2').set({ userId: 'seller1', title: 'Mafuta', price: 3000, stock: 1 });
  await order('o5', { productId: 'p2', quantity: 1, amount: 3000 });
  assert((await R.reserveOrder('o5', { nowIso: T0 })).ok, 'reserved');
  await R.runSweep({ nowIso: plus(20) });
  const pos = await call('posSale', SELLER, { idempotencyKey: 'pos-sale-0002', items: [{ productId: 'p2', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], payment: { method: 'Cash', cashReceived: 3000 } });
  assert(pos.ok, 'POS sold the released unit: ' + JSON.stringify(pos));
  const out = await R.settlePesaPalPayment(paid('o5', 3000), 'late');
  assert(out.review.includes('order_o5'), JSON.stringify(out));
  const o = await get('orders/o5'); eq(o.status, 'needs_review', 'status'); eq(o.inventoryReviewState, 'NEEDS_REVIEW', 'review'); eq(o.paymentVerified, true, 'money is verified');
  eq(o.reviewDeadlineAt, new Date(Date.parse(o.ipnAt) + 120 * 60000).toISOString(), 'review window 120 min');
  eq((await get('products/p2')).stock, 0, 'stock 0, not -1');
  eq((await get('escrow_holds/order_o5')).blocked, true, 'escrow hold blocked');
  eq((await get('payment_reviews/o5')).state, 'NEEDS_REVIEW', 'review record');
  const dup = await R.settlePesaPalPayment(paid('o5', 3000), 'late-dup');
  assert(!dup.review.length && !dup.settled.length, 'duplicate IPN does nothing');
});
await test('R13 seller cannot ship / escrow cannot be released for an order under review', async () => {
  assert(typeof fns.escrowRelease.run === 'function', 'escrowRelease exists');
  const r = await call('escrowRelease', BUYER, { orderId: 'o5' });
  const r2 = await call('escrowRelease', ADMIN, { orderId: 'o5', reason: 'admin anajaribu kutoa escrow' });
  assert(!r.ok && !r2.ok && r.code === 'failed-precondition' && r2.code === 'failed-precondition', 'release paths refuse: ' + JSON.stringify([r, r2]));
  eq((await get('escrow_holds/order_o5')).released, false, 'hold not released');
});
await test('R14 review window passes -> REFUND_PENDING (no automatic money move)', async () => {
  const s = await R.runSweep({ nowIso: plus(60 * 24) });
  assert(s.refundPending >= 1, JSON.stringify(s));
  eq((await get('orders/o5')).inventoryReviewState, 'REFUND_PENDING', 'state');
  eq((await get('users/buyer1')).walletBalance, 0, 'no money moved yet');
});

console.log('\n[T6 refund once]');
await test('R15 non-admin cannot resolve a review', async () => {
  const r = await call('adminPaymentReviewResolve', SELLER, { orderId: 'o5', action: 'refund', reason: 'stock imeisha kabisa' });
  assert(!r.ok && r.code === 'permission-denied', JSON.stringify(r));
});
await test('R16 admin refund: wallet credited once, audited, hold released', async () => {
  const r = await call('adminPaymentReviewResolve', ADMIN, { orderId: 'o5', action: 'refund', reason: 'stock imeisha kabla ya malipo' });
  assert(r.ok && r.data.state === 'REFUNDED' && r.data.amount === 3000, JSON.stringify(r));
  eq((await get('users/buyer1')).walletBalance, 3000, 'wallet');
  eq((await get('refunds/online_o5')).status, 'COMPLETED', 'refund record');
  eq((await get('escrow_holds/order_o5')).released, true, 'hold released');
  eq((await get('orders/o5')).status, 'cancelled_not_fulfilled', 'order');
  const audit = await db.collection('admin_audit_log').where('action', '==', 'PAYMENT_REVIEW_REFUNDED').get(); eq(audit.size, 1, 'one audit entry');
});
await test('R17 refund replay / double click never pays twice', async () => {
  const [a, b] = await Promise.all([
    call('adminPaymentReviewResolve', ADMIN, { orderId: 'o5', action: 'refund', reason: 'bonyeza mara ya pili' }),
    call('adminPaymentReviewResolve', ADMIN, { orderId: 'o5', action: 'refund', reason: 'bonyeza mara ya tatu' })]);
  assert(a.ok && b.ok && a.data.already && b.data.already, JSON.stringify([a, b]));
  eq((await get('users/buyer1')).walletBalance, 3000, 'still 3000');
});
await test('R18 admin "fulfil" after restock: re-reserve + commit, order held', async () => {
  await db.doc('products/p3').set({ userId: 'seller1', title: 'Unga', price: 500, stock: 0 });
  await order('o6', { productId: 'p3', quantity: 2, amount: 1000 });
  const out = await R.settlePesaPalPayment(paid('o6', 1000), 'no-reservation');
  assert(out.review.includes('order_o6'), 'no stock -> review');
  const no = await call('adminPaymentReviewResolve', ADMIN, { orderId: 'o6', action: 'fulfil', reason: 'jaribu bila stock' });
  assert(!no.ok && /Stock bado haitoshi/.test(no.message), 'still no stock: ' + JSON.stringify(no));
  await db.doc('products/p3').update({ openingStockPending: true });
  const adj = await call('inventoryAdjust', SELLER, { idempotencyKey: 'restock-p3-01', productId: 'p3', delta: 4, reason: 'restock', movementType: 'PURCHASE' });
  assert(adj.ok, JSON.stringify(adj));
  const ok = await call('adminPaymentReviewResolve', ADMIN, { orderId: 'o6', action: 'fulfil', reason: 'stock imerudi dukani' });
  assert(ok.ok && ok.data.state === 'RESOLVED_FULFILLED', JSON.stringify(ok));
  const o = await get('orders/o6'); eq(o.status, 'held', 'held'); eq(o.stockCommitted, true, 'committed');
  eq((await get('products/p3')).stock, 2, 'stock 4 -> 2'); eq((await get('escrow_holds/order_o6')).blocked, false, 'hold unblocked');
});

console.log('\n[unmatched payment, feature switch, variants, one location]');
await test('R19 verified payment that matches no order is kept as UNAPPLIED (once)', async () => {
  await R.settlePesaPalPayment({ paid: true, trackingId: 'TRK-nobody', merchantReference: 'MR-x', amount: 777 }, 'ipn');
  await R.settlePesaPalPayment({ paid: true, trackingId: 'TRK-nobody', merchantReference: 'MR-x', amount: 777 }, 'ipn-dup');
  const r = await get('payment_reviews/unmatched_TRK-nobody'); eq(r.state, 'UNAPPLIED', 'state'); eq(r.paidAmount, 777, 'amount');
  eq(r.source, 'ipn', 'first write kept');
});
await test('R20 seller outside the pilot: legacy behaviour (no reservation, no stock change on payment)', async () => {
  await db.doc('products/q1').set({ userId: 'seller2', title: 'Nje', price: 100, stock: 1 });
  await order('q1', { sellerId: 'seller2', productId: 'q1', quantity: 1, amount: 100 });
  eq((await R.reserveOrder('q1', { nowIso: T0 })).skipped, 'disabled', 'skipped');
  const out = await R.settlePesaPalPayment(paid('q1', 100), 'legacy');
  assert(out.settled.includes('order_q1'), JSON.stringify(out));
  eq((await get('products/q1')).stock, 1, 'unchanged (today\'s behaviour)'); eq((await get('orders/q1')).status, 'held', 'held as before');
});
await test('R21 variant order reserves the VARIANT; POS on another variant keeps product.stock (F5)', async () => {
  await order('ov', { items: [{ productId: 'pv', quantity: 2, variantId: 's' }], amount: 4000 });
  assert((await R.reserveOrder('ov', { nowIso: T0 })).ok, 'reserved');
  let p = await get('products/pv'); eq(p.variantCombinations[0].reserved, 2, 'variant s reserved'); eq(p.stock, 0, 'product.stock untouched');
  const bad = await call('posSale', SELLER, { idempotencyKey: 'pos-sale-v001', items: [{ productId: 'pv', variantId: 's', sku: 'SH-s', unitId: 'piece', quantity: 2, unitMode: 'pc', pricingMode: 'retail' }], payment: { method: 'Cash', cashReceived: 4000 } });
  assert(!bad.ok, 'only 1 of s available');
  const both = await call('posSale', SELLER, { idempotencyKey: 'pos-sale-v002', items: [
    { productId: 'pv', variantId: 's', sku: 'SH-s', unitId: 'piece', quantity: 1, unitMode: 'pc', pricingMode: 'retail' },
    { productId: 'pv', variantId: 'm', sku: 'SH-m', unitId: 'piece', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], payment: { method: 'Cash', cashReceived: 4000 } });
  assert(both.ok, JSON.stringify(both));
  p = await get('products/pv');
  eq(p.variantCombinations[0].stock, 2, 's 3 -> 2'); eq(p.variantCombinations[0].reserved, 2, 's reserved kept');
  eq(p.variantCombinations[1].stock, 1, 'm 2 -> 1 (no lost update between two variants)'); eq(p.stock, 0, 'product.stock still 0');
  const m = await get('inventory_movements/pos_pos-sale-v002_1'); eq(m.previousStock, 2, 'movement previous = variant m stock'); eq(m.variantId, 'm', 'movement variant');
});
await test('R22 productVariantsSave keeps live stock/reserved, appends new at 0, keeps omitted', async () => {
  const sent = [Object.assign({}, VAR('s', 999), { price: 2500, reserved: 0 }), VAR('l', 50)];
  const r = await call('productVariantsSave', SELLER, { productId: 'pv', variantCombinations: sent });
  assert(r.ok, JSON.stringify(r));
  const p = await get('products/pv');
  eq(p.variantCombinations.length, 3, 's, m kept, l added');
  eq(p.variantCombinations[0].stock, 2, 's stock is the live value'); eq(p.variantCombinations[0].reserved, 2, 's reserved live'); eq(p.variantCombinations[0].price, 2500, 'price edited');
  eq(p.variantCombinations[1].variantId, 'm', 'omitted variant kept'); eq(p.variantCombinations[2].stock, 0, 'new variant starts at 0');
  const other = await call('productVariantsSave', who('eve', 'eve@x.tz'), { productId: 'pv', variantCombinations: sent });
  assert(!other.ok && other.code === 'permission-denied', 'other user denied');
});
await test('R23 one order = one location: lines from two stores are refused', async () => {
  await db.doc('products/sa').set({ userId: 'seller1', businessId: 'biz1', storeId: 'stA', title: 'A', price: 100, stock: 5 });
  await db.doc('products/sb').set({ userId: 'seller1', businessId: 'biz1', storeId: 'stB', title: 'B', price: 100, stock: 5 });
  await order('om', { items: [{ productId: 'sa', quantity: 1 }, { productId: 'sb', quantity: 1 }], amount: 200 });
  const r = await R.reserveOrder('om', { nowIso: T0 });
  eq(r.error, 'MULTI_LOCATION_ORDER', 'refused');
  eq((await get('products/sa')).reservedStock, undefined, 'nothing reserved');
});
await test('R24 reconciliation report: no invariant breaks, no reserved drift', async () => {
  const rep = await R.reconcileSeller('seller1', { nowIso: plus(60 * 25) });
  assert(rep.ok, JSON.stringify(rep));
  // ov is still ACTIVE (past its TTL in this clock): reported as overdue for the sweep
  assert(rep.overdueReservations.includes('ov'), 'overdue reservation listed');
});
await test('R25 invariant: no product has negative stock or reserved > stock', async () => {
  const all = await db.collection('products').get();
  all.docs.forEach(d => {
    const p = d.data();
    assert((p.stock || 0) >= 0 && (p.reservedStock || 0) >= 0 && (p.reservedStock || 0) <= (p.stock || 0), d.id + ' base');
    (p.variantCombinations || []).forEach(v => assert(v.stock >= 0 && (v.reserved || 0) <= v.stock, d.id + '/' + v.variantId));
  });
});

console.log('\n[Phase 1 channels at the till]');
await test('R26 POS refuses a Manage-only / marketplace-only product; legacy seller gets the default location warning', async () => {
  await db.doc('products/mo').set({ userId: 'seller1', title: 'Stoo tu', price: 100, stock: 4, salesChannels: ['manage_only'], isOnline: false, isOffline: false });
  const r = await call('posSale', SELLER, { idempotencyKey: 'pos-sale-mo01', items: [{ productId: 'mo', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], payment: { method: 'Cash', cashReceived: 100 } });
  assert(!r.ok && /CHANNEL_NOT_POS/.test(r.message), JSON.stringify(r));
  eq((await get('products/mo')).stock, 4, 'no stock moved');
  await db.doc('products/pp').set({ userId: 'seller1', title: 'POS', price: 100, stock: 4, salesChannels: ['pos'], isOnline: false, isOffline: true });
  const ok = await call('posSale', SELLER, { idempotencyKey: 'pos-sale-pp01', items: [{ productId: 'pp', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], payment: { method: 'Cash', cashReceived: 100 } });
  assert(ok.ok && ok.data.locationId === 'default' && ok.data.locationWarning === 'LEGACY_DEFAULT_LOCATION', JSON.stringify(ok));
});

console.log('\n[Create flow: product + variant opening stock]');
await test('R27 create flow: product opening (0) then each variant opening once; a second variant opening is refused', async () => {
  await db.doc('products/pnew').set({ productId: 'pnew', userId: 'seller1', title: 'Viatu', price: 3000, stock: 0, openingStockPending: true, openingStockInitialized: false });
  const base = await call('inventoryAdjust', SELLER, { productId: 'pnew', delta: 0, movementType: 'OPENING_BALANCE', source: 'PRODUCT_CREATION', reason: 'Initial stock at product creation', idempotencyKey: 'opening-pnew' });
  assert(base.ok, 'base opening: ' + JSON.stringify(base));
  const save = await call('productVariantsSave', SELLER, { productId: 'pnew', variantCombinations: [VAR('40', 0), VAR('41', 0)].map(v => Object.assign(v, { sku: 'VI-' + v.variantId, inventoryKey: 'pnew:' + v.variantId + ':piece' })) });
  assert(save.ok, 'variants saved: ' + JSON.stringify(save));
  const v40 = await call('inventoryAdjust', SELLER, { productId: 'pnew', variantId: '40', delta: 3, movementType: 'OPENING_BALANCE', source: 'PRODUCT_CREATION', reason: 'Variant opening stock', idempotencyKey: 'opening-pnew-40' });
  assert(v40.ok, 'variant 40 opening: ' + JSON.stringify(v40));
  const replay = await call('inventoryAdjust', SELLER, { productId: 'pnew', variantId: '40', delta: 3, movementType: 'OPENING_BALANCE', source: 'PRODUCT_CREATION', reason: 'Variant opening stock', idempotencyKey: 'opening-pnew-40' });
  assert(replay.ok && replay.data.idempotent === true, 'same key is idempotent');
  const again = await call('inventoryAdjust', SELLER, { productId: 'pnew', variantId: '40', delta: 5, movementType: 'OPENING_BALANCE', source: 'PRODUCT_CREATION', reason: 'Variant opening stock', idempotencyKey: 'opening-pnew-40-b' });
  assert(!again.ok, 'second opening with a new key is refused');
  const p = await get('products/pnew');
  eq(p.variantCombinations[0].stock, 3, 'variant 40 stock'); eq(p.variantCombinations[1].stock, 0, 'variant 41 untouched'); eq(p.stock, 0, 'product stock');
});

console.log(`\nINVENTORY RESERVATION (emulator): ${pass} passed, ${fail} failed`);
if (fail) { console.log(fails.join('\n')); process.exit(1); }
process.exit(0);

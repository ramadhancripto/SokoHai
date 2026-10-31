#!/usr/bin/env node
/**
 * [POS 2026-11-01] Decimal weighing (kg / L / m) through the REAL callables on the
 * Firestore emulator: sale, stock movement, return, void, adjustment and limits.
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_decimal_quantity_emulator.mjs"
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
const { _testing: T } = require(path.join(ROOT, 'functions', 'inventory-authority.js'));
const R = require(path.join(ROOT, 'functions', 'reporting-authority.js'))._testing;

let pass = 0, fail = 0;
const PERIOD = { start: '2026-11-01T00:00:00.000Z', end: '2026-11-02T00:00:00.000Z' };
async function test(n, fn) { try { await fn(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`assert: ${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); };
const SELLER = { uid: 'kuku', token: { uid: 'kuku', email: 'kuku@sokohai.test', email_verified: true } };
async function call(name, data) { try { return { ok: true, data: await fns[name].run({ data, auth: SELLER, rawRequest: { headers: {} } }) }; } catch (e) { return { ok: false, code: e.code, message: e.message }; } }
const get = async p => (await db.doc(p).get()).data() || null;
let seq = 0; const key = p => `${p}-${String(++seq).padStart(6, '0')}`;
const sell = (productId, quantity) => call('posSale', { idempotencyKey: key('pos-sale'), items: [{ productId, quantity, unitMode: 'pc', pricingMode: 'retail' }], payment: { method: 'Cash', cashReceived: 1000000 } });

await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await db.doc('users/kuku').set({ uid: 'kuku', businessId: 'B1', storeId: 'S1', shopOwnerUid: 'kuku' });
await db.doc('businesses/B1').set({ ownerUid: 'kuku', businessName: 'Mchele Shop' });
await db.doc('stores/S1').set({ ownerUid: 'kuku', businessId: 'B1', storeName: 'Duka' });
await db.doc('products/rice').set({ userId: 'kuku', businessId: 'B1', storeId: 'S1', title: 'Mchele', price: 4000, stock: 10, baseUnit: 'Kg', quantityPrecision: 3 });
await db.doc('products/soap').set({ userId: 'kuku', businessId: 'B1', storeId: 'S1', title: 'Sabuni', price: 1000, stock: 10 });

let saleRice = null;
await test('D01 sell 1.25 kg: stock 10 -> 8.75, line total 5,000', async () => {
  const r = await sell('rice', 1.25); assert(r.ok, JSON.stringify(r)); saleRice = r.data.saleId;
  eq((await get('products/rice')).stock, 8.75, 'stock'); eq(r.data.items[0].quantity, 1.25, 'qty'); eq(r.data.items[0].lineTotal, 5000, 'line total');
});
await test('D02 0.1 kg + 0.2 kg: exactly 8.45 left (no float drift)', async () => {
  assert((await sell('rice', 0.1)).ok, '0.1'); assert((await sell('rice', 0.2)).ok, '0.2');
  eq((await get('products/rice')).stock, 8.45, 'stock');
});
await test('D03 more decimals than allowed (0.0005 kg) is refused, never rounded', async () => {
  const r = await sell('rice', 0.0005); assert(!r.ok, 'refused'); eq((await get('products/rice')).stock, 8.45, 'unchanged');
});
await test('D04 whole-unit product: 1.5 refused (QUANTITY_DECIMAL_NOT_ALLOWED), 2 accepted (legacy unchanged)', async () => {
  const r = await sell('soap', 1.5); assert(!r.ok && /QUANTITY_DECIMAL_NOT_ALLOWED/.test(r.message), JSON.stringify(r));
  assert((await sell('soap', 2)).ok, 'whole'); eq((await get('products/soap')).stock, 8, 'soap');
});
await test('D05 overselling a decimal product is refused; stock never negative', async () => {
  const r = await sell('rice', 9); assert(!r.ok, 'refused'); eq((await get('products/rice')).stock, 8.45, 'unchanged');
  const exact = await sell('rice', 8.45); assert(exact.ok, 'sell all'); eq((await get('products/rice')).stock, 0, 'zero');
  assert(!(await sell('rice', 0.001)).ok, 'nothing left');
});
await test('D06 decimal stock adjustment: +12.5 kg allowed; 0.5 on a whole-unit product refused', async () => {
  const a = await call('inventoryAdjust', { productId: 'rice', delta: 12.5, movementType: 'PURCHASE', reason: 'Gunia jipya', idempotencyKey: key('adj') });
  assert(a.ok, JSON.stringify(a)); eq((await get('products/rice')).stock, 12.5, 'rice');
  const b = await call('inventoryAdjust', { productId: 'soap', delta: 0.5, movementType: 'ADJUSTMENT', reason: 'x', idempotencyKey: key('adj') });
  assert(!b.ok && /QUANTITY_DECIMAL_NOT_ALLOWED/.test(b.message), JSON.stringify(b));
  const c = await call('inventoryAdjust', { productId: 'rice', delta: -13, movementType: 'ADJUSTMENT', reason: 'x', idempotencyKey: key('adj') });
  assert(!c.ok, 'cannot go negative'); eq((await get('products/rice')).stock, 12.5, 'unchanged');
});
await test('D07 return 0.25 kg of the 1.25 kg sale: stock +0.25; returning more than sold is refused', async () => {
  const req = q => ({ idempotencyKey: key('ret'), businessId: 'B1', storeId: 'S1', originalSaleId: saleRice, reason: 'Mteja amerudisha', inventoryDisposition: 'SELLABLE_RETURN',
    refundIntent: { requested: true, method: 'Cash' }, items: [{ productId: 'rice', originalSaleItemId: `${saleRice}:item:0`, quantity: q }] });
  const r = await call('posReturn', req(0.25)); assert(r.ok, JSON.stringify(r));
  eq((await get('products/rice')).stock, 12.75, 'stock after return');
  const over = await call('posReturn', req(1.001)); assert(!over.ok, 'over-return refused');
  eq((await get('products/rice')).stock, 12.75, 'unchanged');
});
await test('D08 void a decimal sale restores the exact quantity', async () => {
  const s = await sell('rice', 2.375); assert(s.ok, JSON.stringify(s)); eq((await get('products/rice')).stock, 10.375, 'after sale');
  const v = await call('posVoid', { idempotencyKey: key('void'), businessId: 'B1', storeId: 'S1', originalSaleId: s.data.saleId, reason: 'Kosa la kuandika' });
  assert(v.ok, JSON.stringify(v)); eq((await get('products/rice')).stock, 12.75, 'restored');
});
await test('D09 return / void helpers accept decimals but keep whole-unit history valid', async () => {
  eq(T.validateReturnQuantity(1.25, 0.25, 1).status, 'VALID', 'decimal valid');
  eq(T.validateReturnQuantity(1.25, 0.25, 1.001).status !== 'VALID', true, 'over');
  eq(T.validateReturnQuantity(3, 1, 2).status, 'VALID', 'whole units');
});
await test('D10 reports add decimal quantities exactly (0.1 + 0.2 = 0.3)', async () => {
  const sale = (q) => ({ saleId: 's' + q, businessId: 'B1', storeId: 'S1', status: 'COMPLETED', createdAt: '2026-11-01T10:00:00.000Z', totals: { total: 1 }, payment: { method: 'Cash', status: 'PAID', amount: 1 }, items: [{ productId: 'rice', quantity: q, lineTotal: 1 }] });
  const rep = R.aggregateReport({ businessId: 'B1', storeId: 'S1', period: PERIOD, sales: [sale(0.1), sale(0.2)], adjustments: [], credits: [], voids: [], movements: [], ledger: [] });
  const row = Object.values(rep.products)[0]; eq(row.quantitySold, 0.3, 'quantitySold');
});

console.log(`\nDECIMAL QUANTITY (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

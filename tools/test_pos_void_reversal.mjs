#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const child = String.raw`
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const docs = new Map();
const state = { writes: [] };
const snap = data => ({ exists: data !== undefined, data: () => data });
const ref = path => ({ path, id: path.split('/').pop(), async get() { return snap(docs.get(path)); } });
const fakeDb = {
  doc(path) { return ref(path); },
  collection(name) { return { where(field, op, value) { return { name, field, op, value }; } }; },
  async runTransaction(callback) {
    const writes = [];
    const tx = {
      async get(target) {
        if (target && target.name) return { docs: [...docs.entries()].filter(([path, data]) => path.startsWith(target.name + '/') && data && data[target.field] === target.value).map(([path, data]) => ({ id: path.split('/').pop(), data: () => data })) };
        return snap(docs.get(target.path));
      },
      set(target, data, options) { writes.push({ type: 'set', target, data, options }); },
      create(target, data) { writes.push({ type: 'create', target, data }); }
    };
    const result = await callback(tx);
    for (const write of writes) {
      if (write.type === 'create' && docs.has(write.target.path)) throw new Error('already exists');
      if (write.type === 'create') docs.set(write.target.path, write.data);
      if (write.type === 'set') docs.set(write.target.path, write.options && write.options.merge ? { ...(docs.get(write.target.path) || {}), ...write.data } : write.data);
      state.writes.push(write);
    }
    return result;
  }
};
const fakeAdmin = { firestore: Object.assign(() => fakeDb, { FieldValue: {} }) };
Module._load = function(request, parent, isMain) {
  if (request === 'firebase-functions/v2/https') return { onCall: (_opts, handler) => handler, HttpsError: class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } } };
  if (request === 'firebase-admin') return fakeAdmin;
  if (request === './business-store-authority') return { resolveBusinessStoreContext: async ({ auth, product, requestedBusinessId, requestedStoreId }) => {
    if (!auth || auth.uid !== 'cashier-1') throw new Error('UNAUTHORIZED_RETURN');
    if (product.businessId !== requestedBusinessId || product.storeId !== requestedStoreId) throw new Error('SALE_SCOPE_MISMATCH');
    return { ownerUid: 'seller-1', businessId: requestedBusinessId, storeId: requestedStoreId };
  } };
  return originalLoad.call(this, request, parent, isMain);
};
const authority = require('./functions/inventory-authority.js');
const call = (data, auth = { uid: 'cashier-1', token: {} }) => authority.posVoid({ data, auth });
const put = (path, data) => docs.set(path, data);
const request = (key, saleId = 'sale-void-1', extra = {}) => ({ idempotencyKey: key, businessId: 'biz-1', storeId: 'store-1', originalSaleId: saleId, reason: 'Correction', ...extra });
const sale = (id = 'sale-void-1') => ({ saleId: id, idempotencyKey: id + '-key', businessId: 'biz-1', storeId: 'store-1', sellerId: 'seller-1', status: 'COMPLETED', immutableSnapshot: true, totals: { total: 450 }, payment: { method: 'Cash' }, items: [
  { productId: 'p1', quantity: 2, stockQuantity: 4, unitMode: 'unit', pcsPerUnit: 2, unitPriceAtSale: 100, lineTotal: 200, variantId: null },
  { productId: 'p2', quantity: 1, stockQuantity: 1, unitMode: 'pc', pcsPerUnit: 1, unitPriceAtSale: 250, lineTotal: 250, variantId: null }
] });
const seedProducts = () => { put('products/p1', { businessId: 'biz-1', storeId: 'store-1', userId: 'seller-1', stock: 5 }); put('products/p2', { businessId: 'biz-1', storeId: 'store-1', userId: 'seller-1', stock: 7 }); };
const errorCode = async (promise, expected) => { await assert.rejects(promise, error => { assert.ok(error.code === expected || error.message.includes(expected), 'expected ' + expected + ', got ' + (error.code || error.message)); return true; }); };

(async () => {
// Contract normalization and fingerprint exclude client amount/stock authorities.
const normalized = authority._testing.normalizeVoidRequest(request('void-contract'));
assert.equal(normalized.originalSaleId, 'sale-void-1');
assert.equal(authority._testing.buildVoidRequestFingerprint({ ...request('void-contract'), total: 999, refundAmount: 999, stock: 999 }), authority._testing.buildVoidRequestFingerprint(request('void-contract')));

// Authorization and eligibility.
seedProducts(); put('sales/sale-void-1', sale()); put('shop_ledger/pos_sale-void-1-key', { type: 'income_offline', amount: 450, status: 'recorded' });
await errorCode(call(request('void-unauth'), null), 'unauthenticated');
await errorCode(call({ ...request('void-scope'), businessId: 'wrong' }), 'SALE_SCOPE_MISMATCH');
put('sales/sale-cancelled', { ...sale('sale-cancelled'), status: 'CANCELLED' }); await errorCode(call(request('void-cancelled', 'sale-cancelled')), 'SALE_NOT_COMPLETED');
put('sales/sale-legacy', { ...sale('sale-legacy'), immutableSnapshot: false }); await errorCode(call(request('void-legacy', 'sale-legacy')), 'VOID_NOT_SUPPORTED');

// Eligible multi-item void reverses authoritative snapshot quantities atomically.
const originalLedger = docs.get('shop_ledger/pos_sale-void-1-key');
const result = await call(request('void-main'));
assert.equal(result.status, 'VOIDED'); assert.equal(result.inventoryApplied, true); assert.equal(result.originalSaleTotal, 450);
assert.equal(docs.get('products/p1').stock, 9); assert.equal(docs.get('products/p2').stock, 8);
assert.equal(docs.get('inventory_movements/void_void-main_0').quantity, 4); assert.equal(docs.get('inventory_movements/void_void-main_1').quantity, 1);
assert.equal(docs.get('sale_voids/void_void-main').items[0].reversalQuantity, 4);
assert.equal(docs.get('shop_ledger/pos_sale-void-1-key'), originalLedger, 'original ledger preserved');
assert.equal(docs.get('shop_ledger/void_void-main').originalSaleId, 'sale-void-1');
assert.equal(docs.get('sales/sale-void-1').status, 'COMPLETED', 'original status remains immutable evidence'); assert.equal(docs.get('sales/sale-void-1').voidStatus, 'VOIDED');

// Same request retry is idempotent; different payload conflicts; second logical void is blocked.
const retry = await call(request('void-main')); assert.deepEqual(retry, result);
await errorCode(call({ ...request('void-main'), reason: 'different reason' }), 'IDEMPOTENCY_CONFLICT');
await errorCode(call(request('void-second')), 'SALE_ALREADY_VOIDED');

// Return, refund, and credit conflicts are explicit and records are not deleted.
for (const [suffix, collection, record] of [
  ['return', 'sale_adjustments', { adjustmentType: 'RETURN', originalSaleId: 'sale-return-block', status: 'RETURNED' }],
  ['refund', 'refunds', { originalSaleId: 'sale-refund-block', status: 'REFUND_PENDING' }],
  ['credit', 'credit_adjustments', { originalSaleId: 'sale-credit-block', status: 'CREDIT_ADJUSTED' }]
]) {
  const id = 'sale-' + suffix + '-block'; put('sales/' + id, sale(id)); put(collection + '/existing-' + suffix, record);
  const expected = suffix === 'return' ? 'VOID_BLOCKED_BY_RETURN' : suffix === 'refund' ? 'VOID_BLOCKED_BY_REFUND' : 'VOID_BLOCKED_BY_CREDIT_ADJUSTMENT';
  await errorCode(call(request('void-block-' + suffix, id)), expected); assert.ok(docs.has(collection + '/existing-' + suffix));
}

// Missing product in a multi-item sale causes no partial reversal.
const atomicSale = sale('sale-atomic'); atomicSale.items[1] = { ...atomicSale.items[1], productId: 'missing-product' }; put('sales/sale-atomic', atomicSale); const writesBefore = state.writes.length; const p1Before = docs.get('products/p1').stock;
await errorCode(call(request('void-atomic', 'sale-atomic')), 'PRODUCT_NOT_FOUND'); assert.equal(docs.get('products/p1').stock, p1Before); assert.equal(state.writes.length, writesBefore); assert.equal(docs.has('sale_voids/void_void-atomic'), false);

// Already-derived void state is rejected even without a void record.
put('sales/sale-already', { ...sale('sale-already'), voidStatus: 'VOIDED', voidId: 'old-void' }); await errorCode(call(request('void-already', 'sale-already')), 'SALE_ALREADY_VOIDED');

assert.equal(typeof authority.posSale, 'function'); assert.equal(typeof authority.posReturn, 'function'); assert.equal(typeof authority.posRefund, 'function'); assert.equal(typeof authority.posCreditAdjustment, 'function'); assert.equal(typeof authority.posVoid, 'function'); assert.equal(typeof authority.inventoryAdjust, 'function');
assert.equal(Object.prototype.hasOwnProperty.call(authority._testing, 'itemSnapshot'), false);
console.log('POS-4E/F void reversal checks passed');
})();
`;

execFileSync(process.execPath, ['--input-type=commonjs', '-'], { cwd: new URL('..', import.meta.url).pathname, input: child, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });

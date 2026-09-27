#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const child = String.raw`
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const docs = new Map();
const state = { failHistory: false, created: [] };
const ref = path => ({ path, id: path.split('/').pop(), async get() { return snap(docs.get(path)); } });
const snap = data => ({ exists: data !== undefined, data: () => data });
const fakeDb = {
  doc(path) { return ref(path); },
  collection(name) { return { where(field, op, value) { return { name, field, op, value }; } }; },
  async runTransaction(callback) {
    const writes = [];
    const tx = {
      async get(target) {
        if (target && target.name === 'sale_adjustments') {
          if (state.failHistory) throw new Error('history query unavailable');
          const matches = [];
          for (const [path, data] of docs) {
            if (path.startsWith('sale_adjustments/') && data && data[target.field] === target.value) matches.push({ id: path.split('/').pop(), data: () => data });
          }
          return { docs: matches };
        }
        return snap(docs.get(target.path));
      },
      set(target, data, options) { writes.push({ type: 'set', target, data, options }); },
      create(target, data) { writes.push({ type: 'create', target, data }); },
      update(target, data) { writes.push({ type: 'update', target, data }); }
    };
    const result = await callback(tx);
    for (const write of writes) {
      if (write.type === 'create' && docs.has(write.target.path)) throw new Error('already exists');
      if (write.type === 'set') docs.set(write.target.path, write.options && write.options.merge ? { ...(docs.get(write.target.path) || {}), ...write.data } : write.data);
      if (write.type === 'create') docs.set(write.target.path, write.data);
      if (write.type === 'update') docs.set(write.target.path, { ...(docs.get(write.target.path) || {}), ...write.data });
      state.created.push(write);
    }
    return result;
  }
};
const fakeAdmin = { firestore: Object.assign(() => fakeDb, { FieldValue: {} }) };
Module._load = function(request, parent, isMain) {
  if (request === 'firebase-functions/v2/https') return { onCall: (_opts, handler) => handler, HttpsError: class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } } };
  if (request === 'firebase-admin') return fakeAdmin;
  if (request === './business-store-authority') return { resolveBusinessStoreContext: async ({ auth, product, requestedBusinessId, requestedStoreId }) => {
    if (!auth || auth.uid !== 'cashier-1') throw new Error('unauthorized');
    if (product.businessId !== requestedBusinessId || product.storeId !== requestedStoreId) throw new Error('scope mismatch');
    return { ownerUid: product.userId || 'seller-1', businessId: requestedBusinessId, storeId: requestedStoreId };
  } };
  return originalLoad.call(this, request, parent, isMain);
};
const authority = require('./functions/inventory-authority.js');
const call = (data, auth = { uid: 'cashier-1', token: {} }) => authority.posReturn({ data, auth });
const base = (key = 'return-key-001') => ({
  idempotencyKey: key, businessId: 'biz-1', storeId: 'store-1', originalSaleId: 'sale-1',
  items: [{ productId: 'prod-1', originalSaleItemId: 'sale-1:item:0', quantity: 1, variantId: null }],
  reason: 'Customer return', inventoryDisposition: 'SELLABLE_RETURN',
  refundIntent: { requested: true, method: 'Cash' }, customer: { name: 'Asha', phone: '+255700000000' }
});
const sale = () => ({ saleId: 'sale-1', businessId: 'biz-1', storeId: 'store-1', sellerId: 'seller-1', status: 'COMPLETED', immutableSnapshot: true,
  items: [{ productId: 'prod-1', quantity: 3, stockQuantity: 3, unitMode: 'pc', pricingMode: 'retail', pcsPerUnit: 1, unitPriceAtSale: 100, lineTotal: 300, variantId: null }] });
const put = (path, data) => docs.set(path, data);
const seed = () => { put('sales/sale-1', sale()); put('products/prod-1', { businessId: 'biz-1', storeId: 'store-1', userId: 'seller-1', stock: 5 }); };
const errorCode = async (promise, expected) => { await assert.rejects(promise, error => { assert.ok(error.code === expected || error.message.includes(expected), 'expected ' + expected + ', got ' + (error.code || error.message)); return true; }); };

(async () => {
seed();
// Authorization and sale validation.
await errorCode(call(base('unauth-key'), null), 'unauthenticated');
await errorCode(call({ ...base('scope-key'), businessId: 'wrong-biz' }), 'SALE_SCOPE_MISMATCH');
await errorCode(call(base('missing-key'), { uid: 'other-user', token: {} }), 'unauthorized');
put('sales/missing', undefined); await errorCode(call({ ...base('missing-sale-key'), originalSaleId: 'missing' }), 'SALE_NOT_FOUND');
put('sales/not-complete', { ...sale(), saleId: 'not-complete', status: 'CANCELLED' }); await errorCode(call({ ...base('not-complete-key'), originalSaleId: 'not-complete' }), 'SALE_NOT_COMPLETED');
put('sales/legacy', { saleId: 'legacy', businessId: 'biz-1', storeId: 'store-1', sellerId: 'seller-1', status: 'COMPLETED', items: [{ productId: 'prod-1', quantity: 1, unitPriceAtSale: 100 }] }); await errorCode(call({ ...base('legacy-key'), originalSaleId: 'legacy' }), 'RETURN_NOT_SUPPORTED');
await errorCode(call({ ...base('bad-ref-key'), items: [{ ...base().items[0], originalSaleItemId: 'sale-1:item:9' }] }), 'RETURN_NOT_SUPPORTED');

// First partial sellable return: authoritative amount, stock reversal, movement and pending payment.
const first = await call(base('return-key-001'));
assert.deepEqual(first, { success: true, adjustmentId: 'return_return-key-001', originalSaleId: 'sale-1', status: 'RETURNED', paymentStatus: 'REFUND_PENDING', inventoryApplied: true, amount: 100, items: [{ productId: 'prod-1', originalSaleItemId: 'sale-1:item:0', quantity: 1, amount: 100 }] });
assert.equal(docs.get('products/prod-1').stock, 6);
assert.equal(docs.get('sale_adjustments/return_return-key-001').amount, 100);
assert.equal(docs.get('sale_adjustments/return_return-key-001').paymentStatus, 'REFUND_PENDING');
assert.equal(state.created.filter(w => w.type === 'create' && w.target.path.startsWith('inventory_movements/')).length, 1);
assert.equal(docs.get('inventory_movements/return_return-key-001_0').source, 'POS_RETURN');

// Retry is idempotent and does not duplicate stock or movement.
const createdBeforeRetry = state.created.length;
const retry = await call(base('return-key-001'));
assert.deepEqual(retry, first);
assert.equal(docs.get('products/prod-1').stock, 6);
assert.equal(state.created.length, createdBeforeRetry);
await errorCode(call({ ...base('return-key-001'), reason: 'different request' }), 'IDEMPOTENCY_CONFLICT');

// Second partial completes the sold quantity; over-return is rejected atomically.
const second = await call({ ...base('return-key-002'), items: [{ ...base().items[0], quantity: 2 }], refundIntent: { requested: true, method: 'Mpesa' } });
assert.equal(second.amount, 200); assert.equal(second.paymentStatus, 'REFUND_PENDING'); assert.equal(docs.get('products/prod-1').stock, 8);
assert.equal(docs.get('sale_adjustments/return_return-key-002').returnCoverageStatus, 'FULLY_RETURNED');
const stockBeforeOver = docs.get('products/prod-1').stock; const writesBeforeOver = state.created.length;
await errorCode(call({ ...base('return-key-over'), items: [{ ...base().items[0], quantity: 1 }] }), 'RETURN_QUANTITY_EXCEEDS_AVAILABLE');
assert.equal(docs.get('products/prod-1').stock, stockBeforeOver); assert.equal(state.created.length, writesBeforeOver);

// Damaged return is persisted without sellable stock or inventory movement.
put('sales/sale-damaged', { ...sale(), saleId: 'sale-damaged' });
const damaged = await call({ ...base('damaged-key'), originalSaleId: 'sale-damaged', items: [{ ...base().items[0], originalSaleItemId: 'sale-damaged:item:0' }], inventoryDisposition: 'DAMAGED_RETURN', refundIntent: { requested: true, method: 'Bank' } });
assert.equal(damaged.inventoryApplied, false); assert.equal(damaged.paymentStatus, 'REFUND_PENDING');
assert.equal(docs.get('products/prod-1').stock, 8); assert.equal(docs.get('sale_adjustments/return_damaged-key').inventoryDispositionStatus, 'DAMAGED_RETURN_REQUIRES_FUTURE_DISPOSITION');

// Credit adjustment is only a pending intent; no debt or ledger write occurs.
put('sales/sale-credit', { ...sale(), saleId: 'sale-credit' });
const credit = await call({ ...base('credit-key'), originalSaleId: 'sale-credit', items: [{ ...base().items[0], originalSaleItemId: 'sale-credit:item:0' }], refundIntent: { requested: true, method: 'CREDIT_ADJUSTMENT' } });
assert.equal(credit.paymentStatus, 'CREDIT_ADJUSTMENT_PENDING');
assert.equal([...docs.keys()].some(path => path.startsWith('shop_ledger/')), false);

// Client refundAmount is ignored; amount remains sale snapshot price * quantity.
put('sales/sale-amount', { ...sale(), saleId: 'sale-amount' });
const amount = await call({ ...base('amount-key'), originalSaleId: 'sale-amount', items: [{ ...base().items[0], originalSaleItemId: 'sale-amount:item:0' }], refundAmount: 999999 });
assert.equal(amount.amount, 100);

// Returnability cannot be guessed when history cannot be read.
put('sales/sale-history-fail', { ...sale(), saleId: 'sale-history-fail' });
state.failHistory = true;
await errorCode(call({ ...base('history-fail-key'), originalSaleId: 'sale-history-fail', items: [{ ...base().items[0], originalSaleItemId: 'sale-history-fail:item:0' }] }), 'RETURNABILITY_NOT_VERIFIABLE');
state.failHistory = false;

assert.equal(typeof authority.posSale, 'function');
assert.equal(typeof authority.inventoryAdjust, 'function');
console.log('POS-4B server return authority checks passed');
})();
`;

execFileSync(process.execPath, ['--input-type=commonjs', '-'], {
  cwd: new URL('..', import.meta.url).pathname,
  input: child,
  encoding: 'utf8',
  stdio: ['pipe', 'inherit', 'inherit']
});

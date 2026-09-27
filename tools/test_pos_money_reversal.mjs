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
        if (target && target.name) {
          return { docs: [...docs.entries()].filter(([path, data]) => path.startsWith(target.name + '/') && data && data[target.field] === target.value).map(([path, data]) => ({ id: path.split('/').pop(), data: () => data })) };
        }
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
const callRefund = (data, auth = { uid: 'cashier-1', token: {} }) => authority.posRefund({ data, auth });
const callCredit = (data, auth = { uid: 'cashier-1', token: {} }) => authority.posCreditAdjustment({ data, auth });
const put = (path, data) => docs.set(path, data);
const request = (key, adjustmentId, method = 'Cash', extra = {}) => ({ idempotencyKey: key, businessId: 'biz-1', storeId: 'store-1', adjustmentId, method, ...extra });
const adjustment = (id, saleId, method = 'Cash', amount = 200) => ({ adjustmentId: id, adjustmentType: 'RETURN', originalSaleId: saleId, businessId: 'biz-1', storeId: 'store-1', sellerId: 'seller-1', cashierId: 'cashier-1', createdBy: 'cashier-1', customer: { name: 'Asha', phone: '+255700000000' }, amount, status: 'RETURNED', paymentMethod: method, paymentStatus: method === 'CREDIT_ADJUSTMENT' ? 'CREDIT_ADJUSTMENT_PENDING' : 'REFUND_PENDING' });
const sale = (id, method = 'Cash', key = id) => ({ saleId: id, idempotencyKey: key, sellerId: 'seller-1', businessId: 'biz-1', storeId: 'store-1', status: 'COMPLETED', customer: { name: 'Asha', phone: '+255700000000' }, payment: { method, outstanding: method === 'Cash' ? 0 : 500 } });
const errorCode = async (promise, expected) => { await assert.rejects(promise, error => { assert.ok(error.code === expected || error.message.includes(expected), 'expected ' + expected + ', got ' + (error.code || error.message)); return true; }); };

(async () => {
// Refund authority uses the completed return amount and leaves all provider/cash execution pending.
put('sales/sale-cash', sale('sale-cash', 'Cash', 'sale-cash-key'));
put('sale_adjustments/adj-cash', adjustment('adj-cash', 'sale-cash', 'Cash', 200));
const cash = await callRefund(request('refund-cash-1', 'adj-cash', 'Cash'));
assert.equal(cash.status, 'REFUND_PENDING'); assert.equal(cash.amount, 200);
assert.equal(docs.get('refunds/refund_refund-cash-1').pendingReason, 'CASHIER_CONFIRMATION_REQUIRED');
assert.equal(docs.get('refunds/refund_refund-cash-1').reference, null);
const cashRetry = await callRefund(request('refund-cash-1', 'adj-cash', 'Cash')); assert.deepEqual(cashRetry, cash);
await errorCode(callRefund(request('refund-cash-2', 'adj-cash', 'Cash')), 'REFUND_ALREADY_PENDING');
await errorCode(callRefund(request('refund-cash-1', 'adj-cash', 'Mpesa')), 'IDEMPOTENCY_CONFLICT');

// All external provider methods are pending and do not fabricate provider references.
for (const [index, method] of ['Mpesa', 'TigoPesa', 'AirtelMoney', 'Bank'].entries()) {
  const suffix = method.toLowerCase(); const saleId = 'sale-' + suffix; const adjustmentId = 'adj-' + suffix;
  put('sales/' + saleId, sale(saleId, 'Cash', saleId + '-key')); put('sale_adjustments/' + adjustmentId, adjustment(adjustmentId, saleId, method, 50 + index));
  const result = await callRefund(request('refund-' + suffix, adjustmentId, method));
  assert.equal(result.status, 'REFUND_PENDING'); assert.equal(docs.get('refunds/refund_refund-' + suffix).reference, null);
}

// Client amount cannot override the authoritative return amount.
put('sales/sale-amount', sale('sale-amount', 'Cash', 'sale-amount-key')); put('sale_adjustments/adj-amount', adjustment('adj-amount', 'sale-amount', 'Cash', 321));
const amount = await callRefund(request('refund-amount', 'adj-amount', 'Cash', { refundAmount: 999999 })); assert.equal(amount.amount, 321);
await errorCode(callRefund(request('refund-bad-ref', 'adj-amount', 'Cash', { reference: 'fake-provider-reference' })), 'INVALID_REFUND_REQUEST');

// Authorization and eligibility checks.
await errorCode(callRefund(request('refund-unauth', 'adj-amount'), null), 'unauthenticated');
await errorCode(callRefund({ ...request('refund-scope', 'adj-amount'), businessId: 'wrong' }), 'SALE_SCOPE_MISMATCH');
put('sale_adjustments/adj-bad', { ...adjustment('adj-bad', 'sale-amount'), status: 'PENDING' }); await errorCode(callRefund(request('refund-bad', 'adj-bad')), 'RETURN_NOT_SUPPORTED');
put('sale_adjustments/adj-done', { ...adjustment('adj-done', 'sale-amount'), paymentStatus: 'REFUNDED' }); await errorCode(callRefund(request('refund-done', 'adj-done')), 'REFUND_ALREADY_COMPLETED');

// Deni partial credit adjustment updates only the authoritative debt record and preserves history.
put('sales/sale-deni', sale('sale-deni', 'Deni', 'sale-deni-key'));
put('sale_adjustments/adj-deni', adjustment('adj-deni', 'sale-deni', 'CREDIT_ADJUSTMENT', 200));
put('shop_ledger/pos_sale-deni-key', { shopOwnerId: 'seller-1', saleId: 'sale-deni', type: 'debt', amount: 500, outstanding: 500, status: 'pending', title: 'Deni' });
const creditPartial = await callCredit(request('credit-deni-1', 'adj-deni'));
assert.equal(creditPartial.status, 'CREDIT_ADJUSTED'); assert.equal(creditPartial.creditStatus, 'CREDIT_OPEN'); assert.equal(creditPartial.newOutstanding, 300);
assert.equal(docs.get('shop_ledger/pos_sale-deni-key').amount, 300); assert.equal(docs.get('shop_ledger/pos_sale-deni-key').status, 'pending');
assert.equal(docs.get('credit_adjustments/credit_credit-deni-1').amount, 200); assert.equal(docs.get('sale_adjustments/adj-deni').paymentStatus, 'CREDIT_ADJUSTED');
assert.equal(docs.get('shop_ledger/credit_credit-deni-1').originalSaleId, 'sale-deni');
const creditRetry = await callCredit(request('credit-deni-1', 'adj-deni')); assert.deepEqual(creditRetry, creditPartial);
await errorCode(callCredit(request('credit-deni-2', 'adj-deni')), 'CREDIT_ADJUSTMENT_ALREADY_COMPLETED');

// Awamu full settlement and historical debt record preservation.
put('sales/sale-awamu', sale('sale-awamu', 'Awamu', 'sale-awamu-key')); put('sale_adjustments/adj-awamu', adjustment('adj-awamu', 'sale-awamu', 'CREDIT_ADJUSTMENT', 500)); put('shop_ledger/pos_sale-awamu-key', { shopOwnerId: 'seller-1', saleId: 'sale-awamu', type: 'debt', amount: 500, outstanding: 500, status: 'pending' });
const creditFull = await callCredit(request('credit-awamu-1', 'adj-awamu')); assert.equal(creditFull.creditStatus, 'CREDIT_SETTLED'); assert.equal(creditFull.newOutstanding, 0); assert.equal(docs.get('shop_ledger/pos_sale-awamu-key').status, 'completed');

// Non-credit sale and excess outstanding are rejected without writes.
put('sales/sale-cash-credit', sale('sale-cash-credit', 'Cash', 'sale-cash-credit-key')); put('sale_adjustments/adj-cash-credit', adjustment('adj-cash-credit', 'sale-cash-credit', 'CREDIT_ADJUSTMENT', 10)); put('shop_ledger/pos_sale-cash-credit-key', { type: 'income_offline', amount: 10, outstanding: 10 });
await errorCode(callCredit(request('credit-not-applicable', 'adj-cash-credit')), 'CREDIT_ADJUSTMENT_NOT_APPLICABLE');
put('sales/sale-excess', sale('sale-excess', 'Deni', 'sale-excess-key')); put('sale_adjustments/adj-excess', adjustment('adj-excess', 'sale-excess', 'CREDIT_ADJUSTMENT', 700)); put('shop_ledger/pos_sale-excess-key', { type: 'debt', amount: 500, outstanding: 500, status: 'pending' });
const writesBefore = state.writes.length; await errorCode(callCredit(request('credit-excess', 'adj-excess')), 'CREDIT_ADJUSTMENT_EXCEEDS_OUTSTANDING'); assert.equal(state.writes.length, writesBefore); assert.equal(docs.has('credit_adjustments/credit_credit-excess'), false);

assert.equal(typeof authority.posSale, 'function'); assert.equal(typeof authority.posReturn, 'function'); assert.equal(typeof authority.inventoryAdjust, 'function');
console.log('POS-4C/D money reversal checks passed');
})();
`;

execFileSync(process.execPath, ['--input-type=commonjs', '-'], { cwd: new URL('..', import.meta.url).pathname, input: child, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });

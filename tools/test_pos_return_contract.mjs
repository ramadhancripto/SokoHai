#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const child = String.raw`
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const fakeDb = { doc() { return {}; }, runTransaction() { return Promise.resolve(); } };
const fakeAdmin = { firestore: Object.assign(() => fakeDb, { FieldValue: {} }) };
Module._load = function(request, parent, isMain) {
  if (request === 'firebase-functions/v2/https') return { onCall: (_opts, handler) => handler, HttpsError: class HttpsError extends Error {} };
  if (request === 'firebase-admin') return fakeAdmin;
  if (request === './business-store-authority') return { resolveBusinessStoreContext: async () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};
const authority = require('./functions/inventory-authority.js');
const t = authority._testing;
const base = {
  idempotencyKey: 'return-key-001', businessId: 'biz-1', storeId: 'store-1', originalSaleId: 'pos_sale_1',
  items: [{ productId: 'prod-1', originalSaleItemId: 'pos_sale_1:item:0', quantity: 1, variantId: null }],
  reason: 'Customer exchange', inventoryDisposition: 'SELLABLE_RETURN',
  refundIntent: { requested: true, method: 'Cash' }, customer: { name: 'Asha', phone: '+255700000000' }
};
const sale = {
  saleId: 'pos_sale_1', businessId: 'biz-1', storeId: 'store-1', status: 'COMPLETED', immutableSnapshot: true,
  items: [{ productId: 'prod-1', quantity: 3, unitPriceAtSale: 1200, productNameAtSale: 'Product 1', variantId: null }]
};
const expectInvalid = (fn, label) => assert.throws(fn, Error, label);

// Valid request and all supported dispositions/refund intents.
const normalized = t.normalizeReturnRequest(base);
assert.deepEqual(normalized.items[0], { productId: 'prod-1', originalSaleItemId: 'pos_sale_1:item:0', quantity: 1, variantId: null });
for (const disposition of ['SELLABLE_RETURN', 'DAMAGED_RETURN']) {
  for (const method of ['Cash', 'Mpesa', 'CREDIT_ADJUSTMENT']) {
    const result = t.normalizeReturnRequest({ ...base, inventoryDisposition: disposition, refundIntent: { requested: true, method } });
    assert.equal(result.refundIntent.method, method);
  }
}

// Required request validation.
for (const field of ['idempotencyKey', 'originalSaleId', 'businessId', 'storeId', 'reason']) {
  const invalid = { ...base }; delete invalid[field]; expectInvalid(() => t.normalizeReturnRequest(invalid), 'missing ' + field);
}
expectInvalid(() => t.normalizeReturnRequest({ ...base, items: [] }), 'empty items');
expectInvalid(() => t.normalizeReturnRequest({ ...base, items: [{ ...base.items[0], quantity: 0 }] }), 'zero quantity');
expectInvalid(() => t.normalizeReturnRequest({ ...base, items: [{ ...base.items[0], quantity: -1 }] }), 'negative quantity');
expectInvalid(() => t.normalizeReturnRequest({ ...base, items: [{ ...base.items[0], productId: '' }] }), 'missing productId');
expectInvalid(() => t.normalizeReturnRequest({ ...base, items: [{ ...base.items[0], originalSaleItemId: '' }] }), 'missing sale item reference');
expectInvalid(() => t.normalizeReturnRequest({ ...base, inventoryDisposition: 'UNKNOWN' }), 'invalid disposition');
expectInvalid(() => t.normalizeReturnRequest({ ...base, refundIntent: { requested: true, method: 'Bitcoin' } }), 'invalid refund method');
expectInvalid(() => t.normalizeReturnRequest({ ...base, refundIntent: { requested: false, method: 'Cash' } }), 'refund must be requested');

// Current POS-2 sale compatibility and deterministic item references.
assert.equal(t.makeOriginalSaleItemReference('pos_sale_1', 0), 'pos_sale_1:item:0');
assert.equal(t.parseOriginalSaleItemReference('pos_sale_1:item:0', 'pos_sale_1'), 0);
assert.equal(t.parseOriginalSaleItemReference('pos_sale_1:item:1', 'pos_sale_1'), 1);
assert.equal(t.parseOriginalSaleItemReference('other:item:0', 'pos_sale_1'), null);
const compatible = t.validateSaleCompatibility(sale, normalized);
assert.equal(compatible.status, 'SUPPORTED');
assert.equal(compatible.items[0].originalSaleItemId, 'pos_sale_1:item:0');
assert.equal(compatible.items[0].requestedQuantity, 1);

// Unsupported or ambiguous historical/legacy shapes are never guessed.
assert.equal(t.validateSaleCompatibility(null, normalized).status, 'RETURN_NOT_SUPPORTED');
assert.equal(t.validateSaleCompatibility({ ...sale, immutableSnapshot: false }, normalized).status, 'RETURN_NOT_SUPPORTED');
assert.equal(t.validateSaleCompatibility({ ...sale, items: [{ productId: 'prod-1', quantity: 3 }] }, normalized).status, 'RETURN_NOT_SUPPORTED');
assert.equal(t.validateSaleCompatibility({ ...sale, items: [{ ...sale.items[0], productId: 'prod-2' }] }, normalized).status, 'RETURN_NOT_SUPPORTED');
assert.equal(t.validateSaleCompatibility(sale, { ...normalized, items: [{ ...normalized.items[0], originalSaleItemId: 'pos_sale_1:item:9' }] }).status, 'RETURN_NOT_SUPPORTED');
assert.equal(t.validateSaleCompatibility(sale, { ...normalized, items: [normalized.items[0], normalized.items[0]] }).status, 'RETURN_NOT_SUPPORTED');

// Returnability: partial, full, multiple-until-exhausted, and unverifiable history.
assert.deepEqual(t.calculateReturnableQuantity(3, 0), { status: 'VERIFIABLE', returnableQuantity: 3 });
assert.deepEqual(t.calculateReturnableQuantity(3, 1), { status: 'VERIFIABLE', returnableQuantity: 2 });
assert.equal(t.calculateReturnableQuantity(3, undefined).status, 'RETURNABILITY_NOT_VERIFIABLE');
assert.equal(t.validateReturnQuantity(3, 1, 2).status, 'VALID');
assert.equal(t.validateReturnQuantity(3, 1, 3).status, 'RETURN_NOT_SUPPORTED');
assert.equal(t.validateReturnQuantity(3, 0, 3).status, 'VALID');
assert.equal(t.validateReturnQuantity(3, 3, 1).status, 'RETURN_NOT_SUPPORTED');

// Fingerprint uses normalized authoritative fields only.
const fingerprintA = t.buildReturnRequestFingerprint(base);
const fingerprintSame = t.buildReturnRequestFingerprint({ ...base, customer: { phone: '+255700000000', name: 'Asha' } });
const fingerprintDifferent = t.buildReturnRequestFingerprint({ ...base, reason: 'Different reason' });
assert.equal(fingerprintA, fingerprintSame, 'same normalized payload must fingerprint identically');
assert.notEqual(fingerprintA, fingerprintDifferent, 'different payload must conflict');
assert.match(fingerprintA, /^[a-f0-9]{64}$/);
expectInvalid(() => t.buildReturnRequestFingerprint({ ...base, idempotencyKey: 'bad' }), 'invalid fingerprint input');

// Canonical sale_adjustments shape carries no client-authoritative money/payment values.
const adjustment = t.buildReturnAdjustmentShape({
  adjustmentId: 'adj-1', request: base, originalSaleItemId: 'pos_sale_1:item:0', productId: 'prod-1',
  quantity: 1, sellerId: 'seller-1', cashierId: 'cashier-1', createdBy: 'cashier-1'
});
assert.equal(adjustment.adjustmentType, 'RETURN');
assert.equal(adjustment.variantId, null);
assert.equal(adjustment.quantity, 1);
assert.equal(adjustment.amount, null);
assert.equal(adjustment.paymentMethod, null);
assert.equal(adjustment.paymentStatus, null);
assert.equal(adjustment.status, 'RETURN_REQUESTED');
assert.equal(adjustment.requestFingerprint, fingerprintA);

// Existing callable exports and stale blocker regression.
assert.equal(typeof authority.posSale, 'function');
assert.equal(typeof authority.inventoryAdjust, 'function');
assert.equal(Object.prototype.hasOwnProperty.call(t, 'itemSnapshot'), false);
console.log('POS-4A return contract checks passed');
`;

execFileSync(process.execPath, ['--input-type=commonjs', '-'], {
  cwd: new URL('..', import.meta.url).pathname,
  input: child,
  encoding: 'utf8',
  stdio: ['pipe', 'inherit', 'inherit']
});

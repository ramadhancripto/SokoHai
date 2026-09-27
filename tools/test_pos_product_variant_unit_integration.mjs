import assert from 'node:assert/strict';
import fs from 'node:fs';
import identity from '../shared/pos-product-identity-core.js';

const product = {
  productId: 'p-shirt', price: 10, stock: 20, pcsPerUnit: 6,
  variantDefinitions: [{ name: 'Color', values: ['Red', 'Blue'] }],
  variantCombinations: [{
    variantId: identity.deterministicVariantId('p-shirt', { Color: 'Red' }),
    sku: 'SHIRT-RED', options: { Color: 'Red' }, stock: 4, price: 12, status: 'ACTIVE'
  }]
};

let resolved = identity.resolveProductIdentity(product, { productId: 'p-shirt', variantId: product.variantCombinations[0].variantId, sku: 'SHIRT-RED', unitMode: 'unit', pricingMode: 'retail' });
assert.equal(resolved.ok, true);
assert.equal(resolved.variantId, product.variantCombinations[0].variantId);
assert.equal(resolved.stock, 4);
assert.equal(resolved.basePrice, 12);
assert.equal(resolved.unit.conversion, 6);
assert.equal(identity.resolveProductIdentity(product, { productId: 'p-shirt', variantId: null, unitMode: 'pc', pricingMode: 'retail' }).error, 'VARIANT_REQUIRED');
assert.equal(identity.resolveProductIdentity(product, { productId: 'p-shirt', variantId: product.variantCombinations[0].variantId, sku: 'WRONG', unitMode: 'pc', pricingMode: 'retail' }).error, 'SKU_VARIANT_MISMATCH');

const authority = fs.readFileSync(new URL('../functions/inventory-authority.js', import.meta.url), 'utf8');
assert.match(authority, /pos-product-identity-core/);
assert.match(authority, /variantCombinations/);
assert.match(authority, /inventoryKey/);
assert.match(authority, /variantCombinations/);
assert.match(authority, /movementType/);
assert.match(authority, /FINANCIAL_REVERSAL_PENDING/);
const cart = fs.readFileSync(new URL('../js/app/17-hub.js', import.meta.url), 'utf8');
assert.match(cart, /cartKey/);
assert.match(cart, /variantId: item\.variantId/);
assert.match(cart, /unitId: item\.unitId/);
assert.match(cart, /requestFingerprint/);
const cockpit = fs.readFileSync(new URL('../js/app/18-cockpit.js', import.meta.url), 'utf8');
assert.match(cockpit, /QUEUE_PAYLOAD_FINGERPRINT_MISMATCH/);
assert.match(cockpit, /CONFLICT/);
console.log('POS product + variant + unit integration checks passed');

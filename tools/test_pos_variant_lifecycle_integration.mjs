import assert from 'node:assert/strict';
import identity from '../shared/pos-product-identity-core.js';

const variant = identity.buildVariantCombination('product_A', { Color: 'Red', Size: 'L' }, { sku: 'TSH-RED-L', unitId: 'piece', stock: 10, price: 25 });
const product = { productId: 'product_A', price: 20, stock: 99, variantCombinations: [variant] };
const request = { productId: 'product_A', variantId: variant.variantId, sku: variant.sku, unitId: 'piece', unitMode: 'pc', pricingMode: 'retail' };
const saleIdentity = identity.resolveProductIdentity(product, request);
assert.equal(saleIdentity.ok, true);
assert.equal(saleIdentity.inventoryKey, variant.inventoryKey);
variant.stock -= 2;
assert.equal(variant.stock, 8);
assert.equal(product.stock, 99);
const snapshot = { ...request, inventoryKey: saleIdentity.inventoryKey, stockQuantity: 2, quantity: 2, unitPriceAtSale: saleIdentity.basePrice };
assert.equal(identity.resolveProductIdentity(product, snapshot).ok, true);
variant.stock += 1;
assert.equal(variant.stock, 9);
assert.equal(snapshot.inventoryKey, variant.inventoryKey);
const cart = [];
const add = (line) => { const key = [line.productId, line.variantId || 'product', line.unitId || 'default'].join(':'); const existing = cart.find(item => item.cartKey === key); if (existing) existing.quantity += line.quantity; else cart.push({ ...line, cartKey: key }); };
add({ productId: 'product_A', variantId: variant.variantId, sku: variant.sku, unitId: 'piece', quantity: 1 });
add({ productId: 'product_A', variantId: variant.variantId, sku: variant.sku, unitId: 'piece', quantity: 1 });
add({ productId: 'product_A', variantId: 'variant_BLUE_M', sku: 'TSH-BLUE-M', unitId: 'piece', quantity: 1 });
assert.equal(cart.length, 2);
assert.equal(cart[0].quantity, 2);
variant.stock += 2;
assert.equal(variant.stock, 11);
assert.equal(product.stock, 99);
for (const bad of [{ variantId: 'wrong', sku: variant.sku }, { variantId: variant.variantId, sku: 'WRONG' }, { variantId: variant.variantId, sku: variant.sku, unitId: 'carton' }]) {
  assert.equal(identity.resolveProductIdentity(product, { ...request, ...bad }).ok, false);
}
console.log('Firestore-like integration harness — NOT Firebase runtime verification');
console.log('POS variant lifecycle integration checks passed');

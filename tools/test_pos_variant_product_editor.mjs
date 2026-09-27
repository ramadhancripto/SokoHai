import assert from 'node:assert/strict';
import { buildProductWrite, normalizeConcreteVariantCombinations } from '../js/app/39-product-core.js';
import identity from '../shared/pos-product-identity-core.js';

const productId = 'product_A';
const make = (variantId, sku, price = 25000, stock = 10, options = { Color: 'Red', Size: 'L' }) => ({ variantId, sku, price, stock, unitId: 'piece', options, inventoryKey: `${productId}:${variantId}:piece`, status: 'ACTIVE' });
const redL = make('variant_RED_L', 'TSH-RED-L');
const blueM = make('variant_BLUE_M', 'TSH-BLUE-M', 26000, 7, { Color: 'Blue', Size: 'M' });

const created = buildProductWrite({ productId, title: 'T-Shirt', price: 25000, stock: 0, category: 'clothing', location: 'Dar', variantCombinations: [redL, blueM] });
assert.equal(created.variantCombinations.length, 2);
assert.deepEqual(created.variantCombinations[0], redL);
const persisted = JSON.parse(JSON.stringify(created));
const reloaded = buildProductWrite(persisted);
assert.deepEqual(reloaded.variantCombinations, created.variantCombinations);
const edited = buildProductWrite({ ...reloaded, variantCombinations: reloaded.variantCombinations.map(v => v.variantId === 'variant_RED_L' ? { ...v, price: 27000 } : v) });
assert.equal(edited.variantCombinations.find(v => v.variantId === 'variant_RED_L').price, 27000);
assert.throws(() => buildProductWrite({ ...created, variantCombinations: [redL, { ...blueM, sku: 'TSH-RED-L' }] }), /Duplicate SKU/);
assert.throws(() => buildProductWrite({ ...created, variantCombinations: [redL, { ...blueM, variantId: 'variant_RED_L', inventoryKey: `${productId}:variant_RED_L:piece` }] }), /Duplicate variantId/);
assert.equal(normalizeConcreteVariantCombinations([{ ...redL, price: 0 }], productId).ok, false);
assert.equal(identity.validateConcreteCombinations(created).ok, true);
const selectedRedL = identity.resolveConcreteCombination(created, { Color: 'Red', Size: 'L' });
const selectedBlueM = identity.resolveConcreteCombination(created, { Color: 'Blue', Size: 'M' });
assert.equal(selectedRedL.combination.variantId, 'variant_RED_L');
assert.equal(selectedBlueM.combination.variantId, 'variant_BLUE_M');
assert.equal(identity.resolveConcreteCombination(created, { Color: 'Green', Size: 'L' }).error, 'VARIANT_COMBINATION_NOT_FOUND');
const legacy = buildProductWrite({ productId: 'legacy', title: 'Legacy', price: 5, stock: 3, category: 'other', location: 'Dar' });
assert.equal(identity.resolveProductIdentity(legacy, { productId: 'legacy', unitMode: 'pc', pricingMode: 'retail' }).ok, true);
console.log('POS variant product editor behavioral checks passed');

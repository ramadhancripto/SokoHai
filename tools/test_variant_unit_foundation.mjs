#!/usr/bin/env node
import assert from 'node:assert/strict';
import core from '../shared/pos-product-identity-core.js';

const definitions = [{ name: 'Color', options: ['Red', 'Blue'] }, { name: 'Size', options: ['M', 'L'] }];
assert.equal(core.optionSignature({ Color: 'Red', Size: 'L' }), core.optionSignature({ Size: 'L', Color: 'Red' }));
const redL = core.buildVariantCombination('tshirt01', { Color: 'Red', Size: 'L' }, { sku: 'TS-RED-L', stock: 4 });
assert.equal(redL.variantId, core.deterministicVariantId('tshirt01', redL.optionSignature));
assert.equal(redL.inventoryKey, 'tshirt01:' + redL.variantId + ':default');
assert.equal(core.validateCombinationAgainstDefinitions(definitions, { Size: 'L', Color: 'Red' }).ok, true);
assert.equal(core.validateCombinationAgainstDefinitions(definitions, { Color: 'Green', Size: 'L' }).error, 'VARIANT_OPTION_NOT_ALLOWED');
assert.equal(core.validateVariantDefinitions([{ name: 'Color', options: ['Red', 'Red'] }]).errors.length, 1);
assert.throws(() => core.buildVariantCombination('tshirt01', { Color: 'Red', Size: 'L' }, { variantId: 'wrong' }), /VARIANT_ID_NOT_CANONICAL/);
const product = { productId: 'tshirt01', price: 100, wholesalePrice: 80, variantCombinations: [redL], unitConfig: { unitId: 'piece', conversionToBase: 1, conversionSource: 'EXPLICIT' } };
const resolved = core.resolveProductIdentity(product, { productId: 'tshirt01', variantId: redL.variantId, sku: 'TS-RED-L', unitMode: 'pc', unitId: 'piece', pricingMode: 'retail' });
assert.equal(resolved.ok, true); assert.equal(resolved.stock, 4); assert.equal(resolved.sku, 'TS-RED-L');
assert.equal(core.resolveProductIdentity(product, { productId: 'tshirt01', variantId: 'wrong', unitMode: 'pc', pricingMode: 'retail' }).error, 'VARIANT_NOT_FOUND');
assert.equal(core.resolveProductIdentity(product, { productId: 'tshirt01', unitMode: 'pc', pricingMode: 'retail' }).error, 'VARIANT_REQUIRED');
assert.equal(core.resolveProductIdentity({ productId: 'sugar', price: 10, stock: 5, pcsPerUnit: 1 }, { productId: 'sugar', unitMode: 'pc', pricingMode: 'retail' }).ok, true);
assert.equal(core.resolveProductIdentity({ productId: 'x', price: 10, stock: 5, unitConfig: { unitId: 'crate', conversionToBase: 24, conversionSource: 'EXPLICIT' } }, { productId: 'x', unitMode: 'unit', unitId: 'crate', pricingMode: 'retail' }).unit.conversion, 24);
assert.equal(core.resolveProductIdentity({ productId: 'x', price: 10, stock: 5, unitConfig: { unitId: 'crate', conversionToBase: 0 } }, { productId: 'x', unitMode: 'unit', unitId: 'crate', pricingMode: 'retail' }).error, 'UNIT_CONVERSION_INVALID');
console.log('Variant + Unit Foundation checks passed');

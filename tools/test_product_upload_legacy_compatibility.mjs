import assert from 'node:assert/strict';
import { buildProductWrite } from '../js/app/39-product-core.js';
const old = {
  productId: 'old-product-1', title: 'Old item', category: 'Electronics', subCategory: 'Accessories',
  price: 1000, stock: 4, imagesArray: ['old.jpg'], variants: [{name:'Color', options:['Black','White']}],
  variantCombinations: [{variantId:'old-black', sku:'OLD-BLK', unitId:'piece', stock:2, price:1000, options:{Color:'Black'}, inventoryKey:'old-product-1:old-black:piece', status:'ACTIVE'}],
  filters: { Brand:'Legacy' }, barcode:'OLD-BAR', baseUnit:'Piece', inventoryKey:'old-product-1:piece'
};
const out = buildProductWrite(old);
assert.equal(out.productId, old.productId);
assert.equal(out.variantCombinations[0].variantId, 'old-black');
assert.equal(out.variantCombinations[0].inventoryKey, old.variantCombinations[0].inventoryKey);
assert.equal(out.barcode, 'OLD-BAR');
assert.equal(out.baseUnit, 'Piece');
assert.deepEqual(out.filters, old.filters);
assert.deepEqual(out.variants, old.variants);
console.log('PRODUCT UPLOAD LEGACY COMPATIBILITY: passed old product identity, variants, filters, barcode, unit, and inventory identity preservation.');

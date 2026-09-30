import assert from 'node:assert/strict';
import { normalizeProductUploadData, normalizeOptions, normalizeFeatures, resolveVariantImages } from '../shared/product-upload-data-core.mjs';
import { buildProductWrite } from '../js/app/39-product-core.js';

const input = {
  productId: 'product-1',
  title: 'Phone',
  price: 100,
  stock: 2,
  category: 'Electronics',
  location: 'Dar es Salaam',
  images: ['general.jpg'],
  attributes: [
    { name: 'Brand', value: 'Samsung', type: 'text', filterable: true },
    { name: 'RAM', value: '8GB', type: 'text', filterable: true },
    { name: 'Waterproof', value: true, type: 'boolean' }
  ],
  options: [{ name: 'Color', selectorType: 'color', values: [
    { value: 'Black', images: ['black.jpg'] }, { value: 'Blue', images: ['blue.jpg'] }
  ] }],
  variantCombinations: [{
    variantId: 'v-blue-l', sku: 'PHONE-BLUE-L', unitId: 'piece', price: 120, stock: 3,
    options: { Color: 'Blue', Size: 'L' }, inventoryKey: 'product-1:v-blue-l:piece', status: 'ACTIVE'
  }],
  features: [{ name: 'Water resistant', value: true, images: ['water.jpg'] }],
  additionalInfo: [{ name: 'Charging time', value: '2 hours' }]
};

const normalized = normalizeProductUploadData(input);
assert.equal(normalized.attributes.length, 3);
assert.equal(normalized.filters.brand, 'Samsung');
assert.equal(normalized.filters.ram, '8GB');
assert.equal(normalized.options[0].values[1].images[0], 'blue.jpg');
assert.equal(normalized.variantsStructured[0].variantId, 'v-blue-l');
assert.equal(normalized.features[0].images[0], 'water.jpg');
assert.equal(normalized.additionalInfo[0].name, 'Charging time');
assert.equal(normalizeOptions([{ name: 'Storage', selectorType: 'unsupported', values: ['128GB'] }])[0].selectorType, 'button');
assert.equal(resolveVariantImages(normalized, normalized.variantsStructured[0])[0], 'blue.jpg');
assert.equal(resolveVariantImages({ ...normalized, images: ['general.jpg'] }, { variantId: 'v', options: { Color: 'Missing' } })[0], 'general.jpg');

const written = buildProductWrite(input);
assert.equal(written.productId, 'product-1');
assert.equal(written.attributes[0].name, 'Brand');
assert.equal(written.options[0].name, 'Color');
assert.equal(written.options[0].values[1].images[0], 'blue.jpg');
assert.equal(written.variantsStructured[0].inventoryKey, 'product-1:v-blue-l:piece');
assert.deepEqual(written.variantsStructured[0].images, []);
assert.equal(written.variantCombinations[0].variantId, 'v-blue-l');
console.log('PRODUCT UPLOAD DATA CONTRACT: passed additive normalization, filter derivation, option values, variant identity, image inheritance, features, and additional information.');

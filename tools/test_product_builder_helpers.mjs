#!/usr/bin/env node
// [REPAIR 2026-10] Product Builder helpers that the browser module imports.
// Regression for: js/app/06-product-builder.js failed to load because these
// exports were missing from shared/product-upload-data-core.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as core from '../shared/product-upload-data-core.mjs';
const { imageList, combinationKey, generateCombinations, suggestCustom } = core;
let pass = 0; const ok = (n, f) => { f(); pass++; console.log('  PASS ' + n); };

ok('every name the builder imports is exported', () => {
  const src = fs.readFileSync(new URL('../js/app/06-product-builder.js', import.meta.url), 'utf8');
  const m = src.match(/import \{([^}]+)\} from '\.\.\/\.\.\/shared\/product-upload-data-core\.mjs'/);
  assert.ok(m, 'import line'); m[1].split(',').map(s => s.trim()).filter(Boolean).forEach(n => assert.equal(typeof core[n], 'function', n));
});
ok('imageList: strings, arrays, upload objects, de-dup', () => {
  assert.deepEqual(imageList('a.jpg'), ['a.jpg']);
  assert.deepEqual(imageList(['a.jpg', { secure_url: 'b.jpg' }, { url: 'a.jpg' }, null, '']), ['a.jpg', 'b.jpg']);
  assert.deepEqual(imageList(undefined), []);
});
ok('combinationKey ignores key order and case', () => {
  assert.equal(combinationKey({ Size: 'M', Color: 'Red' }), combinationKey({ color: 'red', size: 'm' }));
  assert.notEqual(combinationKey({ Size: 'M' }), combinationKey({ Size: 'L' }));
  assert.equal(combinationKey(null), '');
});
ok('generateCombinations: full product, ids, defaults', () => {
  let n = 0;
  const rows = generateCombinations([{ name: 'Size', values: [{ value: 'S' }, { value: 'M' }] }, { name: 'Color', values: [{ value: 'Red' }, { value: 'Blue' }, { value: '' }] }], [], () => 'v' + (++n), { price: 1000, stock: 0 });
  assert.equal(rows.length, 4); assert.equal(rows[0].price, 1000); assert.equal(rows[0].status, 'INACTIVE'); assert.equal(rows[0].available, false);
  assert.equal(new Set(rows.map(r => combinationKey(r.options))).size, 4); assert.equal(rows[3].variantId, 'v4');
});
ok('generateCombinations keeps existing rows (price, stock, sku)', () => {
  const prev = [{ variantId: 'keep', options: { Size: 'S' }, price: 5000, stock: 7, sku: 'SKU-1' }];
  const rows = generateCombinations([{ name: 'Size', values: [{ value: 'S' }, { value: 'M' }] }], prev, () => 'new', { price: 1 });
  assert.equal(rows[0].variantId, 'keep'); assert.equal(rows[0].stock, 7); assert.equal(rows[1].price, 1);
});
ok('generateCombinations caps runaway products at 500', () => {
  const vals = Array.from({ length: 30 }, (_, i) => ({ value: 'v' + i }));
  assert.equal(generateCombinations([{ name: 'A', values: vals }, { name: 'B', values: vals }], [], () => 'x').length, 500);
});
ok('suggestCustom: placeholder examples and name:value', () => {
  assert.deepEqual(suggestCustom('64GB, 128GB, 256GB'), { kind: 'option', name: 'Storage', value: '64GB, 128GB, 256GB', selectorType: 'button' });
  assert.equal(suggestCustom('Nike').kind, 'attribute');
  assert.equal(suggestCustom('Waterproof').kind, 'attribute'); // capitalised single word -> Brand guess; seller can Edit
  assert.equal(suggestCustom('water resistant').kind, 'feature');
  assert.deepEqual(suggestCustom('Made in Tanzania'), { kind: 'additional', name: 'Country of origin', value: 'Tanzania' });
  assert.deepEqual(suggestCustom('Material: Cotton'), { kind: 'attribute', name: 'Material', value: 'Cotton' });
  assert.equal(suggestCustom('Rangi: Nyekundu, Bluu').kind, 'option');
  assert.equal(suggestCustom('red, blue').selectorType, 'color');
  assert.equal(suggestCustom('   '), null);
});
console.log(`\nPRODUCT BUILDER HELPERS: ${pass} passed, 0 failed`);

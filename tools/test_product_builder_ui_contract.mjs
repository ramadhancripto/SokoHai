import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../html/09-admin-sell.html', import.meta.url), 'utf8');
const builder = fs.readFileSync(new URL('../js/app/06-product-builder.js', import.meta.url), 'utf8');
const submit = fs.readFileSync(new URL('../js/app/08-app-state.js', import.meta.url), 'utf8');
// 'productBuilder' is the authoritative builder root container (js/app/06-product-builder.js
// guards on it, binds to it and moves it between spbCreateMount/spbEditMount). The previously
// asserted 'spbBuilder' id has never existed in markup or JS in any commit.
for (const id of ['productBuilder','spbSuggestions','spbAttributes','spbOptions','spbVariants','spbFeatures','spbAdditional','spbAddAttribute','spbAddOption','spbGenerate','spbManualVariant']) assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
// Variant-generation authority is generateCombinations() from shared/product-upload-data-core.mjs,
// bound to the spbGenerate control; manual rows go through manual() bound to spbManualVariant.
// The previously asserted 'generateVariants' / 'Manual variant' tokens have never existed.
for (const token of ['selectorType','values','filterable','variantsStructured','features','additionalInfo','generateCombinations','spbManualVariant']) assert.ok(builder.includes(token), `missing builder token ${token}`);
// Actual authoritative button labels in html/09-admin-sell.html.
for (const token of ['Generate variants','Add Variant Manually']) assert.ok(html.includes(token), `missing UI label ${token}`);
for (const token of ['structuredFields','structuredProduct','skh.saveData(\'products\'']) assert.ok(submit.includes(token), `missing save bridge ${token}`);
assert.ok(fs.readFileSync(new URL('../html/21-scripts.html', import.meta.url), 'utf8').includes('js/app/06-product-builder.js'));
console.log('PRODUCT BUILDER UI CONTRACT: passed structured Add Product sections and existing save bridge checks.');

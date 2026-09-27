import assert from 'node:assert/strict';
import taxonomy from '../shared/canonical-taxonomy-core.js';
import serviceTaxonomy from '../shared/service-taxonomy-core.js';
import { buildProductWrite } from '../js/app/39-product-core.js';

assert.equal(taxonomy.getCategory('CAT-19').id, 'CAT-19');
assert.deepEqual(taxonomy.getCategoryClassification('CAT-19').contexts, ['PRODUCT', 'SERVICE']);
const productBranches = taxonomy.getCategoryBranches('CAT-19', 'PRODUCT');
assert.equal(productBranches.length, 17);
assert.ok(productBranches.includes('Dawa na Medicinal Products'));
assert.ok(productBranches.includes('Used / Refurbished Medical Equipment'));
assert.deepEqual(taxonomy.getCategoryBranches('CAT-19', 'SERVICE'), []);
assert.equal(taxonomy.isProductBranch('CAT-19', 'Doctor Services'), false);
assert.equal(taxonomy.isServiceDomain('CAT-19'), true);
assert.equal(serviceTaxonomy.validateServiceDomains().ok, true);
for (const n of [17, 18, 20, 21, 22, 23, 24, 25, 26]) {
  assert.equal(taxonomy.isServiceDomain(`CAT-${n}`), true, `CAT-${n} changed service context`);
  assert.equal(taxonomy.hasCategoryContext(`CAT-${n}`, 'PRODUCT'), false, `CAT-${n} became product context`);
}
const health = taxonomy.getProductDefinition('CAT-19', 'Medical Devices');
assert.ok(health);
assert.ok(health.attributes.includes('Registration Number'));
assert.ok(health.attributes.includes('Batch/Lot'));
assert.ok(health.attributes.includes('Expiry Date'));
assert.equal(health.complianceProfile, 'HEALTH_PRODUCT_CONDITIONAL');
const legacy = buildProductWrite({ productId: 'cat19-legacy', title: 'Legacy health product', price: 100, stock: 2, category: 'Afya & Bidhaa za Afya', subcategory: 'Medical Devices', productType: 'physical', sku: 'H-1', unit: 'piece', inventoryKey: 'H-1:piece', location: 'Dar' });
assert.equal(legacy.title, 'Legacy health product');
assert.equal(legacy.price, 100);
assert.equal(legacy.stock, 2);
assert.equal(legacy.sku, 'H-1');
assert.equal(legacy.unit, 'piece');
assert.equal(legacy.inventoryKey, 'H-1:piece');
console.log('CAT-19 reconciliation contract passed: dual context, 17 approved product branches, service boundary, CAT-17/18/20-26 stability, regulated metadata, and legacy fields verified.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import taxonomy from '../shared/canonical-taxonomy-core.js';
import data from '../shared/canonical-taxonomy-data.js';
import serviceTaxonomy from '../shared/service-taxonomy-core.js';
import { buildProductWrite } from '../js/app/39-product-core.js';

const productCategories = taxonomy.listCategories().filter(c => taxonomy.isCanonicalProductCategory(c.id));
assert.equal(productCategories.some(c => c.id === 'CAT-39'), false);
assert.equal(productCategories.some(c => c.id === 'CAT-40'), false);
assert.equal(productCategories.some(c => c.id === 'CAT-41'), false);
assert.equal(productCategories.some(c => c.id === 'CAT-44'), false);
for (const id of ['CAT-17','CAT-18','CAT-20','CAT-21','CAT-22','CAT-23','CAT-24','CAT-25','CAT-26']) assert.equal(taxonomy.hasCategoryContext(id, 'PRODUCT'), false);
assert.deepEqual(taxonomy.getOverlay('CAT-39').values.slice(0, 2), ['USED', 'SECOND_HAND']);
assert.ok(taxonomy.getOverlay('CAT-40').values.includes('WHOLESALE'));
assert.ok(taxonomy.getOverlay('CAT-41').values.includes('IMPORTED'));
assert.equal(taxonomy.getFallbackProductDefinition().preserveSellerInput, true);
assert.deepEqual(taxonomy.getFallbackProductDefinition().distinctValues, ['UNKNOWN','OTHER','NOT_APPLICABLE']);
assert.deepEqual(taxonomy.getCategoryClassification('CAT-19').contexts, ['PRODUCT','SERVICE']);
assert.equal(taxonomy.getCategoryBranches('CAT-19', 'PRODUCT').length, 17);
assert.deepEqual(taxonomy.getCategoryBranches('CAT-19', 'SERVICE'), []);

let typeOccurrences=0, attrOccurrences=0, optionValueOccurrences=0, filterOccurrences=0, featureOccurrences=0, ruleCount=0;
const typeNames=new Set(), attrs=new Set(), optionGroups=new Set(), filters=new Set(), features=new Set(), compliance=new Set();
for (const definitions of Object.values(data.PRODUCT_TYPE_DEFINITIONS)) for (const definition of Object.values(definitions)) {
  for (const value of definition.productTypes || []) { typeOccurrences++; typeNames.add(value); }
  for (const value of definition.attributes || []) { attrOccurrences++; attrs.add(value); }
  for (const [group, values] of Object.entries(definition.options || {})) { optionGroups.add(group); for (const value of values) optionValueOccurrences++; }
  for (const value of definition.filters || []) { filterOccurrences++; filters.add(value); }
  for (const value of definition.features || []) { featureOccurrences++; features.add(value); }
  if (definition.variantRule) ruleCount++;
  if (definition.complianceProfile) compliance.add(definition.complianceProfile);
}
assert.equal(typeOccurrences, 705);
assert.equal(attrOccurrences, 1116);
assert.equal(optionValueOccurrences, 387);
assert.equal(filterOccurrences, 676);
assert.equal(featureOccurrences, 207);
assert.equal(ruleCount, 111);
assert.equal(compliance.size, 19);
assert.equal(data.PROFILE_LIBRARY.commerce.includes('Unit'), true);
assert.ok(taxonomy.getUnitDefinitions().groups.weight);
assert.equal(taxonomy.getUnitDefinitions().units.kg.baseUnit, 'g');
assert.equal(taxonomy.getUnitDefinitions().units.L.baseUnit, 'mL');
assert.equal(taxonomy.getUnitDefinitions().units.kg.unitGroup, 'WEIGHT');
assert.equal(taxonomy.getUnitDefinitions().units.L.unitGroup, 'VOLUME');
const registries = taxonomy.getCanonicalRegistries();
assert.ok(Object.keys(registries.productTypes).length > 0);
assert.ok(Object.keys(registries.attributes).every(id => id.startsWith('ATTR-')));
assert.ok(Object.keys(registries.optionGroups).every(id => id.startsWith('OPTG-')));
assert.ok(Object.keys(registries.filters).every(id => id.startsWith('FLT-')));
assert.ok(Object.keys(registries.features).every(id => id.startsWith('FEAT-')));
assert.ok(Object.values(registries.productTypes).every(item => item.id === item.productTypeId && item.status === 'ACTIVE'));
assert.ok(Object.values(registries.attributes).every(item => item.attributeId && item.dataType && 'validation' in item));
assert.ok(Object.values(registries.features).every(item => item.featureId && item.claimStatus));
assert.equal(taxonomy.convertUnit(1, 'kg', 'g'), 1000);
assert.equal(taxonomy.convertUnit(1, 'kg', 'L'), null);
assert.equal(taxonomy.validateUnitConversion('L', 'mL'), true);
assert.equal(taxonomy.validateUnitConversion('L', 'kg'), false);
const semanticAudit = taxonomy.auditCanonicalProductTaxonomy();
assert.equal(semanticAudit.errors.length, 0);
assert.equal(semanticAudit.duplicateIds.length, 0);
assert.equal(semanticAudit.orphanEntities.length, 0);
assert.ok(semanticAudit.missingBranches.some(item => item.categoryId === 'CAT-16' && item.reason === 'CAT-16 SPECIFICATION REQUIRED'));
assert.equal(semanticAudit.semanticComplete, false);
const specificationArtifact = fs.readFileSync(new URL('../docs/PRODUCT-TAXONOMY-SPECIFICATION.md', import.meta.url), 'utf8');
assert.ok(specificationArtifact.includes('# SokoHai Product Taxonomy Specification'));
for (const id of ['CAT-01','CAT-02','CAT-03','CAT-04','CAT-05','CAT-06','CAT-16','CAT-19','CAT-39','CAT-40','CAT-41','CAT-42','CAT-43','CAT-44']) assert.ok(specificationArtifact.includes(`## ${id} `));
assert.ok(specificationArtifact.includes('CAT-16 Product branch specification = UNSPECIFIED'));
assert.ok(specificationArtifact.includes('CAT-19 = Product + Service'));
const reconciliation = taxonomy.reconcileProductSpecification();
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-16' && row.classification === 'GENUINELY_UNSPECIFIED'));
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-01' && row.branch === 'Mizizi & Viazi' && row.classification === 'SPECIFIED_BUT_INCOMPLETE'));
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-01' && row.branch === 'Mboga & Fresh Produce' && row.classification === 'SPECIFIED_AND_IMPLEMENTED'));
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-17' && row.classification === 'SERVICE'));
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-39' && row.classification === 'OVERLAY'));
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-44' && row.classification === 'FALLBACK'));
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-01' && row.branch === 'Food Services' && row.classification === 'SERVICE'));
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-05' && row.branch === 'Fisheries Trade' && row.classification === 'CONTEXT_ONLY'));
assert.ok(reconciliation.rows.some(row => row.categoryId === 'CAT-06' && row.branch === 'Forest Trade & Compliance' && row.classification === 'CONTEXT_ONLY'));
assert.equal(reconciliation.rows.filter(row => row.classification === 'SPECIFIED_BUT_MISSING').length, 0);
assert.equal(serviceTaxonomy.validateServiceDomains().ok, true);
const legacy=buildProductWrite({productId:'final-legacy',title:'Legacy',price:1,stock:1,category:'CAT-19',subcategory:'Medical Devices',productType:'physical',sku:'L-1',unit:'piece',unitId:'piece',inventoryKey:'L-1:piece'});
for (const key of ['category','subcategory','productType','price','stock','sku','unit','unitId','inventoryKey']) assert.notEqual(legacy[key], undefined);
console.log('FINAL PRODUCT TAXONOMY VERIFICATION CONTRACT: passed canonical coverage, expanded CAT-04/05/06, skipped-category boundary, overlays, fallback, CAT-19, service boundary, definition counts, stable registries, units, and legacy compatibility.');

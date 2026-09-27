import assert from 'node:assert/strict';
import taxonomy from '../shared/canonical-taxonomy-core.js';
import mapping from '../shared/taxonomy-legacy-mapping.js';
import states from '../shared/taxonomy-classification-state.js';
import serviceTaxonomy from '../shared/service-taxonomy-core.js';
import { buildProductWrite } from '../js/app/39-product-core.js';

const registry = taxonomy.validateCategoryRegistry();
assert.equal(registry.ok, true);
assert.equal(taxonomy.validateHierarchy().ok, true);
const category = taxonomy.getCategory('CAT-07');
assert.equal(category.displayName, 'Nguo & Mavazi');
assert.ok(taxonomy.getSubcategories('CAT-07').includes('Nguo za Kiume'));
assert.equal(taxonomy.getCategory('CAT-07').id, 'CAT-07');
assert.equal(mapping.mapLegacyCategory('Mavazi na Fashoni (Fashion)'), 'CAT-07');
assert.equal(states.fallbackForLevel('PRODUCT_TYPE'), 'OTHER_PRODUCT_TYPE');
assert.equal(serviceTaxonomy.validateServiceDomains().ok, true);

const legacy = buildProductWrite({ productId: 'legacy-1', title: 'Legacy shirt', price: 10, stock: 2, category: 'Mavazi na Fashoni (Fashion)', subcategory: 'Nguo za Kiume', productType: 'physical', location: 'Dar' });
assert.equal(legacy.category, 'Mavazi na Fashoni (Fashion)');
assert.equal(legacy.subcategory, 'Nguo za Kiume');
assert.equal(legacy.variantCombinations, undefined);
const structured = buildProductWrite({ productId: 'structured-1', title: 'Nyanya Roma', price: 1000, stock: 3, category: 'Chakula & Vinywaji', subcategory: 'Mboga & Fresh Produce', productType: 'physical', location: 'Dar', categoryId: 'CAT-01', subcategoryId: 'Mboga & Fresh Produce', productTypeId: 'Nyanya', attributeValues: { Variety: 'Roma', Freshness: 'Fresh' }, optionValues: { Size: 'Medium' } });
assert.equal(structured.category, 'Chakula & Vinywaji');
assert.equal(structured.taxonomy.categoryId, 'CAT-01');
assert.equal(structured.taxonomy.productTypeId, 'Nyanya');
assert.equal(structured.taxonomy.attributeValues.Variety, 'Roma');

// Detailed product definitions are now read from the canonical authority populated
// from the approved Category 01–44 specification. Service domains remain excluded.
const food = taxonomy.getProductDefinition('CAT-01', 'Mboga & Fresh Produce');
assert.ok(food);
assert.ok(food.productTypes.includes('Nyanya'));
assert.ok(food.attributes.includes('Variety'));
assert.ok(food.options.Freshness.includes('Fresh'));
assert.ok(food.filters.includes('Organic'));
assert.equal(food.variantRule.requireSkuPriceStockIdentity, true);
assert.equal(taxonomy.isValidProductPath({ category: 'CAT-01', subcategory: 'Mboga & Fresh Produce', productType: 'Nyanya' }), true);
assert.equal(taxonomy.isValidProductPath({ category: 'CAT-01', subcategory: 'Mboga & Fresh Produce', productType: 'Not Canonical' }), false);
const overlay = taxonomy.getOverlay('CAT-40');
assert.ok(overlay.values.includes('WHOLESALE'));
assert.ok(taxonomy.getFallbackProductDefinition().preserveSellerInput);
assert.deepEqual(taxonomy.getProfileLibrary().physical.slice(0, 3), ['Material', 'Color', 'Size']);
// CAT-19 is dual-context: approved product branches are exposed, while
// service authority remains separately authoritative for service concepts.
assert.equal(taxonomy.hasCategoryContext('CAT-19', 'PRODUCT'), true);
assert.equal(taxonomy.hasCategoryContext('CAT-19', 'SERVICE'), true);
assert.ok(taxonomy.getProductDefinition('CAT-19', 'Dawa na Medicinal Products'));
assert.equal(taxonomy.isProductBranch('CAT-19', 'Doctor Services'), false);
console.log('Product taxonomy integration contract passed; canonical product definitions, CAT-19 dual context, overlays, fallback, legacy compatibility, and service boundary verified.');

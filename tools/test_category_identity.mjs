#!/usr/bin/env node
/* [REMEDIATION 2026-11 R4] One canonical category identity end to end:
 * seller form value → saved product → buyer category list → feed query values →
 * client filter → sub-category strip → search text. Unmapped legacy labels are
 * reported, never guessed. */
import { canonicalCategoryId, categoryFilterValues, categoryMatches, buyerProductCategories, buyerSubcategories,
    legacySubcategoriesFor, categoryLabel, categoryInfo } from '../shared/category-filter-core.mjs';
import { getSellerCategoryOptions, getSellerSubcategories } from '../shared/product-taxonomy-bridge.mjs';
import { buildSearchMetadata } from '../js/app/39-product-core.js';
import { legacyAdvancedCategories } from './legacy_catalog_source.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mapping = require('../shared/taxonomy-legacy-mapping.js');

let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, i === undefined ? '' : JSON.stringify(i)); } };
const adv = legacyAdvancedCategories();
const legacyNames = Object.keys(adv);

ok('canonical id resolves to itself', canonicalCategoryId('CAT-11') === 'CAT-11');
ok('lower-case id resolves', canonicalCategoryId('cat-11') === 'CAT-11');
ok('canonical display name resolves', canonicalCategoryId('Electronics & Appliances') === 'CAT-11');
ok('reviewed legacy label resolves', canonicalCategoryId('Electronics & Teknoloji (Tech)') === 'CAT-11');
ok('unknown id is not invented', canonicalCategoryId('CAT-99') === null);
ok('[F-F1] unmapped legacy label is NOT guessed', canonicalCategoryId('Kipengele Kisichojulikana (Test)') === null);
const unmappedLegacy = legacyNames.filter(n => !canonicalCategoryId(n));
ok('every unmapped legacy label is exactly the set missing from the reviewed table',
    JSON.stringify(unmappedLegacy) === JSON.stringify(legacyNames.filter(n => !mapping.DIRECT_CATEGORY_MAPPINGS[n])), unmappedLegacy);

const fv = categoryFilterValues('CAT-11');
ok('filter values for CAT-11 include the legacy label', fv.values.includes('Electronics & Teknoloji (Tech)') && fv.values.includes('CAT-11'), fv);
const fl = categoryFilterValues('Electronics & Teknoloji (Tech)');
ok('filter values for the legacy label include CAT-11', fl.values.includes('CAT-11'), fl);
ok('filter values fit a Firestore "in" (≤ 30)', fv.values.length <= 30);
const fu = categoryFilterValues('Kipengele Kisichojulikana (Test)');
ok('unmapped label filters on itself only and is flagged', fu.unmapped === true && JSON.stringify(fu.values) === '["Kipengele Kisichojulikana (Test)"]', fu);

ok('client match: canonical product under legacy selection', categoryMatches('CAT-11', 'Electronics & Teknoloji (Tech)'));
ok('client match: legacy product under canonical selection', categoryMatches('Electronics & Teknoloji (Tech)', 'CAT-11'));
ok('client match: different canonical ids never match', !categoryMatches('CAT-12', 'CAT-11'));
ok('client match: unmapped label matches only itself', categoryMatches('Kipengele Kisichojulikana (Test)', 'Kipengele Kisichojulikana (Test)') && !categoryMatches('CAT-19', 'Kipengele Kisichojulikana (Test)'));
ok('client match: "Zote" matches all', categoryMatches('CAT-11', 'Zote'));

// buyer list == seller list (same identity, same order)
const seller = getSellerCategoryOptions(adv).map(o => o.value);
const buyer = buyerProductCategories(legacyNames).map(o => o.value);
ok('buyer category list equals the seller form list', JSON.stringify(seller) === JSON.stringify(buyer), { seller: seller.length, buyer: buyer.length });
ok('no duplicate buyer category values', new Set(buyer).size === buyer.length);
ok('mapped legacy labels are represented by their canonical entry, not twice', !buyer.includes('Electronics & Teknoloji (Tech)') && buyer.includes('CAT-11'));
ok('unmapped legacy labels stay reachable for old listings', unmappedLegacy.every(n => buyer.includes(n)));

// sub-categories
const subs = buyerSubcategories('CAT-11', legacySubcategoriesFor('CAT-11', adv));
ok('buyer subs for CAT-11 include canonical leaves', subs.includes('TVs & Home Entertainment'), subs.slice(0, 5));
ok('buyer subs for CAT-11 include legacy subs of the mapped label', subs.includes('Mobile Phones'));
const sellerSubs = getSellerSubcategories('CAT-11', adv);
ok('every seller-form sub-category for CAT-11 is filterable by buyers', sellerSubs.every(s => subs.includes(s)), sellerSubs.filter(s => !subs.includes(s)));
ok('no duplicate buyer subs', new Set(subs.map(s => s.toLowerCase())).size === subs.length);

// end to end: seller option → stored product → buyer filter + search
const opt = getSellerCategoryOptions(adv).find(o => o.value === 'CAT-01');
const saved = { title: 'Mchele Kyela 5kg', category: opt.value, subCategory: 'Nafaka' };
ok('seller form stores the canonical id', saved.category === 'CAT-01');
ok('buyer "Chakula" (legacy) selection finds the saved product', categoryFilterValues('Vyakula na Vinywaji (Food)').values.includes(saved.category));
ok('display label is the canonical name, never the raw id', categoryLabel('CAT-01') === 'Chakula & Vinywaji');
const meta = buildSearchMetadata(saved);
ok('search text contains the category display name', meta.text.includes('chakula & vinywaji'), meta.text);
ok('search text contains the reviewed legacy label', meta.text.includes('vyakula na vinywaji (food)'), meta.text);
ok('categoryInfo reports legacy labels', categoryInfo('CAT-01').legacyLabels.includes('Vyakula na Vinywaji (Food)'));

console.log(`\nCATEGORY IDENTITY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

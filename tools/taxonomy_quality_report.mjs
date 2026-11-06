#!/usr/bin/env node
/* [REMEDIATION 2026-11 R4] Taxonomy quality report (read-only).
 * Totals, duplicates, unmapped legacy labels/sub-categories, orphans and legacy
 * coverage across: canonical taxonomy, seller form, buyer filters, category images.
 * Writes docs/reports/TAXONOMY-QUALITY-REPORT-2026-11.{json,md}. Nothing in the
 * taxonomy is changed; unmapped items are listed, never auto-mapped.
 *   node tools/taxonomy_quality_report.mjs [--check]   (--check: fail on structural errors)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getSellerCategoryOptions, getSellerSubcategories } from '../shared/product-taxonomy-bridge.mjs';
import { canonicalCategoryId, buyerProductCategories, buyerSubcategories, legacySubcategoriesFor } from '../shared/category-filter-core.mjs';
import { legacyAdvancedCategories, legacyServiceDataMap } from './legacy_catalog_source.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const data = require('../shared/canonical-taxonomy-data.js');
const mapping = require('../shared/taxonomy-legacy-mapping.js');
const norm = v => String(v || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const cats = Object.values(data.CATEGORY_REGISTRY);
const adv = legacyAdvancedCategories();
const svc = legacyServiceDataMap();
const legacyNames = Object.keys(adv);
const byKind = {}; cats.forEach(c => { byKind[c.kind] = (byKind[c.kind] || 0) + 1; });

// product leaves & types
const leaves = data.PRODUCT_SUBCATEGORIES;
let leafTotal = 0; const dupLeafWithin = [], leafOwners = {};
Object.entries(leaves).forEach(([id, list]) => {
    leafTotal += list.length;
    const seen = {};
    list.forEach(l => { const k = norm(l); if (seen[k]) dupLeafWithin.push({ categoryId: id, leaf: l }); seen[k] = 1; (leafOwners[k] = leafOwners[k] || []).push(id); });
});
const leafAcross = Object.entries(leafOwners).filter(([, ids]) => new Set(ids).size > 1).map(([k, ids]) => ({ leaf: k, categories: [...new Set(ids)] }));
const types = Object.values(data.PRODUCT_TYPE_REGISTRY);
const typeIds = {}; types.forEach(t => { typeIds[t.id] = (typeIds[t.id] || 0) + 1; });
const dupTypeIds = Object.entries(typeIds).filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));
const defaultTypes = types.filter(t => norm(t.subcategory) === 'default'); // category-level fallback list, by design
const orphanTypes = types.filter(t => norm(t.subcategory) !== 'default' && !(leaves[t.categoryId] || []).some(l => norm(l) === norm(t.subcategory)));
const typesWithin = {}; const dupTypeLabels = [];
types.forEach(t => { const k = t.categoryId + '|' + norm(t.subcategory) + '|' + norm(t.label); if (typesWithin[k]) dupTypeLabels.push(t.id); typesWithin[k] = 1; });

// seller vs buyer
const sellerOpts = getSellerCategoryOptions(adv);
const buyerOpts = buyerProductCategories(legacyNames);
const sellerVals = sellerOpts.map(o => o.value), buyerVals = buyerOpts.map(o => o.value);
const subGaps = [];
sellerOpts.forEach(o => {
    const s = getSellerSubcategories(o.value, adv);
    const b = buyerSubcategories(o.value, legacySubcategoriesFor(o.value, adv));
    const missing = s.filter(x => !b.includes(x));
    if (missing.length) subGaps.push({ category: o.value, missing });
});

// legacy coverage
const mapped = legacyNames.filter(n => mapping.DIRECT_CATEGORY_MAPPINGS[n]);
const unmapped = legacyNames.filter(n => !mapping.DIRECT_CATEGORY_MAPPINGS[n]);
const staleMappings = Object.keys(mapping.DIRECT_CATEGORY_MAPPINGS).filter(n => !adv[n]);
let legacySubTotal = 0, legacySubExact = 0; const legacySubUnmatched = [];
legacyNames.forEach(n => {
    const id = mapping.DIRECT_CATEGORY_MAPPINGS[n];
    const subs = Object.keys((adv[n] && adv[n].subcategories) || {});
    legacySubTotal += subs.length;
    subs.forEach(s => {
        if (id && (leaves[id] || []).some(l => norm(l) === norm(s))) legacySubExact++;
        else legacySubUnmatched.push({ legacyCategory: n, sub: s, canonicalId: id || null });
    });
});
const canonicalWithoutLegacy = sellerOpts.filter(o => o.source === 'CANONICAL' && !Object.values(mapping.DIRECT_CATEGORY_MAPPINGS).includes(o.value)).map(o => o.value);
let svcCats = 0, svcSubs = 0; Object.values(svc).forEach(sec => Object.values(sec).forEach(c => { svcCats++; svcSubs += Object.keys(c).length; }));

// category images
let images = null;
try {
    const imgSrc = fs.readFileSync(path.join(ROOT, 'js/app/83-category-photos.js'), 'utf8');
    const files = fs.readdirSync(path.join(ROOT, 'assets/img/categories')).filter(f => /\.(webp|jpe?g|png)$/i.test(f));
    const idKeys = [...imgSrc.matchAll(/'(CAT-\d{2})'\s*:\s*'[a-z0-9-]+'/g)].map(m => m[1]);
    const legacyKeys = [...imgSrc.matchAll(/^\s*'([^']+)'\s*:\s*'[a-z0-9-]+'/gm)].map(m => m[1]);
    const used = new Set([...imgSrc.replace(/\/\/.*$/gm, '').matchAll(/:\s*'([a-z0-9-]+)'/g)].map(m => m[1]));
    images = { files: files.length, canonicalIdsWithImage: [...new Set(idKeys)].length,
        sellerCategoriesWithImage: sellerVals.filter(v => { const id = canonicalCategoryId(v); return id ? idKeys.includes(id) : legacyKeys.includes(v); }).length,
        sellerCategories: sellerVals.length,
        unusedFiles: files.map(f => f.replace(/\.\w+$/, '')).filter(f => !used.has(f)) };
} catch (e) { images = { error: String(e.message || e) }; }

const report = {
    generatedBy: 'tools/taxonomy_quality_report.mjs', schema: 1,
    canonical: { categories: cats.length, byKind, productCategoriesWithLeaves: Object.keys(leaves).length, leaves: leafTotal,
        productTypes: types.length, duplicateTypeIds: dupTypeIds, duplicateTypeLabelsInBranch: dupTypeLabels.length,
        categoryLevelDefaultTypes: defaultTypes.length, orphanProductTypes: orphanTypes.length, orphanProductTypeSamples: orphanTypes.slice(0, 15).map(t => t.id),
        duplicateLeavesWithinCategory: dupLeafWithin, leavesSharedAcrossCategories: leafAcross.length, leavesSharedSamples: leafAcross.slice(0, 15) },
    sellerVsBuyer: { sellerCategories: sellerVals.length, buyerCategories: buyerVals.length, identical: JSON.stringify(sellerVals) === JSON.stringify(buyerVals),
        subcategoryGaps: subGaps },
    legacy: { categories: legacyNames.length, mapped: mapped.length, unmapped, staleMappings,
        canonicalWithoutLegacyLabel: canonicalWithoutLegacy,
        subcategories: legacySubTotal, subcategoriesExactlyMatchingCanonicalLeaf: legacySubExact, subcategoriesUnmatched: legacySubUnmatched.length,
        subcategoriesUnmatchedSamples: legacySubUnmatched.slice(0, 25) },
    services: { legacyCategories: svcCats, legacySubcategories: svcSubs, canonicalServiceDomains: (data.SERVICE_DOMAINS || []).length },
    images
};
const errors = [];
if (dupTypeIds.length) errors.push('duplicate product-type ids');
if (orphanTypes.length) errors.push('product types point at a missing sub-category');
if (!report.sellerVsBuyer.identical) errors.push('buyer category list differs from seller form');
if (subGaps.length) errors.push('seller sub-categories not filterable by buyers');
if (staleMappings.length) errors.push('mapping table references a legacy label that no longer exists');

const outDir = path.join(ROOT, 'docs/reports');
fs.mkdirSync(outDir, { recursive: true });
const md = [
    '# SokoHai — Taxonomy Quality Report (2026-11)', '',
    'Generated by `node tools/taxonomy_quality_report.mjs` (read-only). Unmapped items are listed for owner review; nothing is auto-mapped.', '',
    '## Canonical taxonomy',
    `- Categories: **${cats.length}** (${Object.entries(byKind).map(([k, n]) => k + ' ' + n).join(', ')})`,
    `- Product categories with sub-categories (seller-visible): **${Object.keys(leaves).length}**, sub-categories: **${leafTotal}**`,
    `- Product types: **${types.length}** · duplicate ids: **${dupTypeIds.length}** · duplicate labels in one branch: **${dupTypeLabels.length}** · category-level default types: ${defaultTypes.length} · orphan types (sub-category missing): **${orphanTypes.length}**`,
    `- Duplicate sub-category names inside one category: **${dupLeafWithin.length}** · sub-category names shared by several categories: **${leafAcross.length}** (allowed; same name, different id path)`, '',
    '## Seller form ↔ buyer filters',
    `- Seller categories: **${sellerVals.length}** · buyer categories: **${buyerVals.length}** · identical list: **${report.sellerVsBuyer.identical ? 'YES' : 'NO'}**`,
    `- Seller sub-categories not filterable by buyers: **${subGaps.length}**`, '',
    '## Legacy coverage',
    `- Legacy buyer categories: **${legacyNames.length}** · reviewed mapping to a canonical id: **${mapped.length}** · unmapped: **${unmapped.length}**`,
    unmapped.length ? '- Unmapped (owner decision needed, kept as legacy-only filters): ' + unmapped.map(n => '`' + n + '`').join(', ') : '',
    `- Canonical categories with no legacy label (new for buyers): ${canonicalWithoutLegacy.length}`,
    `- Stale mapping entries: **${staleMappings.length}**`,
    `- Legacy sub-categories: **${legacySubTotal}** · exactly equal to a canonical sub-category of the mapped category: **${legacySubExact}** · not matched: **${legacySubUnmatched.length}** (shown to buyers alongside canonical ones; no automatic re-mapping)`, '',
    '## Services (separate module)',
    `- Legacy service categories: ${svcCats}, sub-categories: ${svcSubs}; canonical service domains: ${(data.SERVICE_DOMAINS || []).length}. Services are not merged into the product taxonomy.`, '',
    '## Category images',
    images && !images.error ? `- Image files: ${images.files} · canonical ids with an image: ${images.canonicalIdsWithImage} · seller/buyer categories with an image: ${images.sellerCategoriesWithImage}/${images.sellerCategories} (others: neutral fallback tile)\n- Files not used (kept, not deleted): ${images.unusedFiles.join(', ') || 'none'}` : '- ' + JSON.stringify(images), '',
    '## Structural checks', errors.length ? errors.map(e => '- FAIL ' + e).join('\n') : '- PASS no structural errors', ''
].filter(x => x !== '').join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'TAXONOMY-QUALITY-REPORT-2026-11.json'), JSON.stringify(report, null, 1) + '\n');
fs.writeFileSync(path.join(outDir, 'TAXONOMY-QUALITY-REPORT-2026-11.md'), md);
console.log(md);
if (process.argv.includes('--check') && errors.length) process.exit(1);

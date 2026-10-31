#!/usr/bin/env node
// [2026-10-31] Checks for the attribute / variant-family / business-coverage audit (DRAFT).
import { createRequire } from 'node:module';
import { buildAudit, buildBusinessCoverage, resolveAttributes, attrKey } from './attribute_audit.mjs';
const require = createRequire(import.meta.url);
const C = require('../shared/canonical-taxonomy-data.js');
const draft = require('./out/sokohai-taxonomy-v1.draft.json');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail); } };
const a = buildAudit(), bc = buildBusinessCoverage();

const cats = draft.nodes.filter(n => n.level === 1 && n.type !== 'system' && n.origin !== 'SYSTEM');
const leaves = draft.nodes.filter(n => n.level === 2 && n.origin !== 'SYSTEM' && cats.some(c => c.id === n.parentId));
t('A01 every draft category is in the category→attribute mapping', cats.every(c => a.mapping.some(m => m.categoryId === c.id)) && a.mapping.length === cats.length, `${a.mapping.length}/${cats.length}`);
t('A02 coverage counts come from real leaves (sum = draft leaves)', a.totals.leaves === leaves.length, `${a.totals.leaves} vs ${leaves.length}`);
t('A03 explicit + partial + inherit-only = all leaves (nothing double counted)', a.mapping.every(m => m.leavesWithExplicitDefinition + m.leavesWithPartialDefinition + m.leavesInheritOnly === m.leaves));
t('A04 every category has a variant family and product examples (real data source named)', a.missing.categoriesWithoutVariantFamily.length === 0 && a.missing.categoriesWithoutExamples.length === 0 && a.mapping.every(m => m.examplesSource !== 'none'));

const apparel = resolveAttributes('CAT-07', 'Viatu');
const plain = resolveAttributes('CAT-07', 'Mashati (leaf bila definition)');
const layersPlain = new Set(plain.map(x => x.layer.split(':')[0]));
t('A05 inheritance: a leaf without its own definition still gets common + profile + family-axis attributes; a defined leaf adds L3', ['L0_COMMON', 'L1_PROFILE', 'L2_FAMILY_AXIS'].every(l => layersPlain.has(l)) && apparel.some(x => x.layer === 'L3_LEAF') && plain.some(x => x.variantAxis), [...layersPlain].join());
const leafDef = C.PRODUCT_TYPE_DEFINITIONS['CAT-07'] && C.PRODUCT_TYPE_DEFINITIONS['CAT-07']['Viatu'];
const overridden = (leafDef ? [...(leafDef.attributes || []), ...Object.keys(leafDef.options || {})] : []).map(attrKey);
t('A06 override: a leaf attribute replaces the inherited one with the same key (no duplicate rows)', overridden.length > 0 && overridden.every(k => apparel.filter(x => x.key === k).length === 1 && apparel.find(x => x.key === k).layer === 'L3_LEAF'));
const food = resolveAttributes('CAT-01', 'Matunda');
t('A07 categories share attributes through profiles (Color/Brand reused, not redefined)', a.totals.sharedAcrossCategories > 50 && apparel.some(x => x.key === 'brand') && food.some(x => x.key === 'brand'));
t('A08 conditional by family: food gets Ripeness/Variety, apparel does not', food.some(x => x.key === 'ripeness') && !apparel.some(x => x.key === 'ripeness'));
t('A09 real differences kept apart (Size ≠ Shoe Size ≠ Screen Size)', new Set(['Size', 'Shoe Size', 'Screen Size'].map(attrKey)).size === 3);
t('A10 duplicates are reported, never merged (registry size unchanged)', Object.keys(C.ATTRIBUTE_REGISTRY).length === a.totals.registryAttributes && a.duplicates.labelVariants.some(d => d.key === 'color') && a.duplicates.synonymCandidates.every(s => s.status === 'NEEDS_HUMAN_DECISION'));
t('A11 service categories use the service common attributes, not product ones', resolveAttributes('CAT-17', '', { kind: 'service' }).some(x => x.key === 'svcarea') && !resolveAttributes('CAT-17', '', { kind: 'service' }).some(x => x.key === 'condition'));
t('A12 every business type maps to real taxonomy categories', bc.businessTypes.every(b => b.taxonomyCategories.length > 0 && b.missingCategories.length === 0), bc.businessTypes.filter(b => b.missingCategories.length).map(b => b.id).join());
t('A13 POS features carry evidence; gaps are listed per business type, not hidden', bc.posFeatures.every(f => f.evidence && f.status) && bc.businessTypes.filter(b => b.status === 'PARTIAL').every(b => b.gaps.length > 0));
t('A14 no feature is claimed without code: decimal weighing proven by code (quantity-core + posSale), job cards still MISSING', bc.posFeatures.find(f => f.id === 'weighing_fractional').status === 'IMPLEMENTED' && bc.posFeatures.find(f => f.id === 'service_orders').status === 'MISSING');

console.log(`\nattribute audit: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

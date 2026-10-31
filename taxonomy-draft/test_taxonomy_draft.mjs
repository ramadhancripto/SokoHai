#!/usr/bin/env node
// Validator for the taxonomy DRAFT. Rebuilds in memory from the live sources and checks
// structural invariants + preservation of every existing canonical/legacy entry.
import { build, loadInputs } from './build_taxonomy_draft.mjs';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail); } };

const r = await build();
const { canon, browser, adv, svc } = await loadInputs();
const nodes = r.dataset.nodes; const byId = new Map(nodes.map((n) => [n.id, n]));

t('T01 generator reports zero issues', r.issues.length === 0, JSON.stringify(r.issues.slice(0, 5)));
t('T02 node IDs unique', byId.size === nodes.length);
t('T03 every non-sector node has an existing parent', nodes.every((n) => n.level === 0 ? n.parentId === null : byId.has(n.parentId)), nodes.filter((n) => n.level && !byId.has(n.parentId)).slice(0, 3).map((n) => n.id).join());
t('T04 child level > parent level, no cycles', nodes.every((n) => { let p = n, g = 0; while (p.parentId && g++ < 8) { const q = byId.get(p.parentId); if (q.level >= p.level) return false; p = q; } return g < 8; }));
const req = ['id', 'level', 'levelName', 'name', 'displayName', 'description', 'status', 'visibility', 'type', 'origin', 'sourceRefs', 'icon', 'createdAt', 'updatedAt', 'createdBy'];
t('T05 every node has required metadata fields', nodes.every((n) => req.every((k) => k in n) && 'parentId' in n), '');
t('T06 sw + en display names present on every node', nodes.every((n) => n.displayName?.sw?.trim() && n.displayName?.en?.trim()));
const sib = {}; let sibDup = [];
for (const n of nodes) { const k = `${n.parentId}|${n.level}|${n.displayName.en.toLowerCase()}`; if (sib[k]) sibDup.push(n.id); sib[k] = 1; }
t('T07 no duplicate display names among siblings', sibDup.length === 0, sibDup.slice(0, 5).join());
const branchParents = new Set(nodes.filter((n) => n.level === 2 || n.level === 3).map((n) => n.parentId));
const finals = nodes.filter((n) => (n.level === 2 || n.level === 3) && !branchParents.has(n.id));
t('T08 every final branch has an Other (Specify) child', finals.every((f) => byId.has(`OTHER-${f.id}`)), finals.filter((f) => !byId.has(`OTHER-${f.id}`)).slice(0, 3).map((f) => f.id).join());
t('T09 every final branch carries extension workflow flags', finals.every((f) => f.extension?.allowOtherSpecify && f.extension?.allowSuggestType && f.extension?.allowSuggestSubcategory && f.extension?.allowSuggestClassification));
t('T10 every category (non-system) has an Other subcategory', nodes.filter((n) => n.level === 1 && n.type !== 'system').every((c) => byId.has(`OTHER-SC-${c.id}`)));
// Preservation
const catIds = Object.values(canon.CATEGORY_REGISTRY).filter((c) => c.kind !== 'OVERLAY').map((c) => c.id);
t('T11 all 41 non-overlay canonical categories preserved with same ID', catIds.every((id) => byId.get(id)?.origin === 'CANONICAL'), catIds.filter((id) => !byId.has(id)).join());
t('T12 overlays CAT-39..41 preserved as listing dimensions', ['CAT-39', 'CAT-40', 'CAT-41'].every((id) => r.dataset.overlays[id]));
const leaves = Object.entries(browser.productLeaves).flatMap(([c, ls]) => ls.map((l) => [c, l]));
t('T13 all 743 canonical leaves preserved (canonicalRef)', leaves.length === 743 && leaves.every(([c, l]) => nodes.some((n) => n.canonicalRef?.categoryId === c && n.canonicalRef?.subcategory === l)));
const pts = Object.values(canon.PRODUCT_TYPE_REGISTRY);
t('T14 all 720 canonical product types preserved with unchanged IDs', pts.length === 720 && pts.every((p) => byId.get(p.id)?.origin === 'CANONICAL'));
t('T15 no canonical type left hanging on a category (all on a leaf)', pts.every((p) => byId.get(byId.get(p.id).parentId)?.level >= 2));
const lr = r.legacyRows;
t('T16 all 25 legacy advancedCategories have a row', Object.keys(adv).every((c) => lr.some((x) => x.legacyCategory === c && x.legacySub === null)) && Object.keys(adv).length === 25);
const advSubs = Object.entries(adv).flatMap(([c, v]) => Object.keys(v.subcategories).map((s) => [c, s]));
t('T17 all 120 legacy subcategories mapped or NEEDS_HUMAN_DECISION', advSubs.length === 120 && advSubs.every(([c, s]) => lr.some((x) => x.legacyCategory === c && x.legacySub === s && (x.targetNodeId || x.overlay || x.action === 'NEEDS_HUMAN_DECISION'))));
t('T18 every legacy target node exists', lr.every((x) => !x.targetNodeId || byId.has(x.targetNodeId)));
const unmapped12 = ['Afya na Pharmacy (Health)', 'Vito na Saa (Luxury)', 'Vitabu na Elimu (Education)', 'Michezo na Mazoezi (Sports)', 'Vichezeo na Michezo (Toys)', 'Sauti na Muziki (Music)', 'Sanaa na Ubunifu (Arts)', 'Dini na Utamaduni (Religion)', 'Zawadi na Sherehe (Gifts)', 'Vifungashio na Printi (Packaging)', 'Vitu vya Kale na Thamani (Antiques)', 'Mchanganyiko (General Merchandise)'];
t('T19 the 12 previously unmapped legacy categories now have a decision', unmapped12.every((c) => !browser.mappings[c] && lr.some((x) => x.legacyCategory === c && x.legacySub === null && x.action)));
t('T20 existing 13 browser mappings are not contradicted', Object.entries(browser.mappings).every(([lc, cat]) => { const row = lr.find((x) => x.legacyCategory === lc && x.legacySub === null); return row && (row.targetNodeId === cat || row.overlay === cat); }));
const svcSubs = Object.values(svc).flatMap((cats) => Object.entries(cats).flatMap(([c, s]) => Object.keys(s).map((x) => `${c}/${x}`)));
t('T21 all 72 serviceDataMap subcategories mapped to an existing service node', svcSubs.length === 72 && r.svcRows.every((x) => x.targetNodeId && byId.get(x.targetNodeId)?.type === 'service'));
// Content rules
t('T22 every service domain has >= 5 subcategories', ['CAT-16', 'CAT-17', 'CAT-18', 'CAT-20', 'CAT-21', 'CAT-22', 'CAT-23', 'CAT-24', 'CAT-25', 'CAT-26'].every((c) => nodes.filter((n) => n.parentId === c && n.level === 2 && n.origin !== 'SYSTEM').length >= 5));
const proposedCats = nodes.filter((n) => n.level === 1 && n.origin === 'PROPOSED');
t('T23 every new category has description, rationale and source', proposedCats.length === 5 && proposedCats.every((c) => c.description && c.review.some((x) => x.why) && c.sourceRefs.length));
t('T24 every proposed subcategory has a source or rationale', nodes.filter((n) => n.level === 2 && n.origin === 'PROPOSED').every((n) => n.sourceRefs.length || n.review.length));
t('T25 every sourceRef resolves to a recorded source with URLs', nodes.every((n) => n.sourceRefs.every((s) => r.dataset.sources[s]?.urls?.length)));
t('T26 every regulatory flag is defined', nodes.every((n) => n.regulatory.every((f) => r.dataset.regulatoryFlags[f])));
t('T27 medicines leaf carries TMDA + pharmacy flags', ['REG-TMDA', 'REG-PHARMACY'].every((f) => byId.get('SC-CAT-19-DAWA_NA_MEDICINAL_PRODUCTS')?.regulatory.includes(f)));
t('T28 pesticides leaf carries TPHPA flag', byId.get('SC-CAT-02-DAWA_ZA_MIMEA_CROP_PROTECTION')?.regulatory.includes('REG-TPHPA'));
const brands = /\b(samsung|tecno|infinix|apple|iphone|nokia|toyota|nike|adidas|azam|coca|pepsi|huawei|dell|hp)\b/i;
t('T29 no brand names used as proposed types/categories', nodes.filter((n) => n.origin === 'PROPOSED').every((n) => !brands.test(n.displayName.en) && !brands.test(n.displayName.sw)), nodes.filter((n) => n.origin === 'PROPOSED' && brands.test(n.displayName.en)).map((n) => n.id).join());
const variantWords = /^(small|medium|large|red|blue|black|white|xl|xxl|\d+\s?(kg|g|ml|l|gb))$/i;
t('T30 no variant values used as types', nodes.filter((n) => n.level === 4).every((n) => !variantWords.test(n.displayName.en.trim())));
t('T31 sector covers every category exactly once', nodes.filter((n) => n.level === 1).every((c) => byId.get(c.parentId)?.level === 0));
t('T32 units: additions do not redefine existing unit IDs', r.dataset.units.additions.every((u) => !r.dataset.units.existing[u.unitId]));
t('T33 units: convertible units have numeric conversion + baseUnit', r.dataset.units.additions.every((u) => u.convertible ? (typeof u.conversion === 'number' && u.baseUnit) : u.conversion === null));
t('T34 variant families reference known categories only', Object.values(r.dataset.variants.families).every((f) => f.cats.every((c) => byId.get(c)?.level === 1)));
const allUnits = new Set([...Object.keys(r.dataset.units.existing), ...r.dataset.units.additions.map((u) => u.unitId)]);
t('T36 every legacy unit value maps to a registry unit', r.dataset.units.legacyMap.length >= 17 && r.dataset.units.legacyMap.every((m) => allUnits.has(m.unitId)), r.dataset.units.legacyMap.filter((m) => !allUnits.has(m.unitId)).map((m) => m.legacy).join());
{
  const seen = {}; for (const n of nodes) for (const a of n.aliases || []) { const k = String(a).toLowerCase().trim(); (seen[k] ||= new Set()).add(n.id); }
  const shared = Object.entries(seen).filter(([, v]) => v.size > 1).map(([k]) => k).sort();
  const listed = (r.dup.ambiguousAliases || []).map((x) => x.alias);
  t('T37 every alias shared by several nodes is reported for an admin decision', JSON.stringify(shared) === JSON.stringify(listed) && r.dup.ambiguousAliases.every((x) => x.status === 'NEEDS_ADMIN_DECISION'), shared.join('|'));
  t('T38 no alias repeats its own node name', nodes.every((n) => (n.aliases || []).every((a) => ![n.displayName.sw, n.displayName.en].map((x) => x.toLowerCase().trim()).includes(String(a).toLowerCase().trim()))));
  const otherIds = nodes.filter((n) => n.origin === 'SYSTEM');
  t('T39 Other nodes nest at most once (Other subcategory -> Other (Specify) type)', otherIds.every((o) => { const p = byId.get(o.parentId); return p && (p.origin !== 'SYSTEM' || (p.id.startsWith('OTHER-SC-') && o.level === 4)); }));
}
t('T35 stable timestamps (deterministic output)', nodes.every((n) => n.createdAt === r.dataset.meta.generatedAt));

console.log(`\ntaxonomy draft: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

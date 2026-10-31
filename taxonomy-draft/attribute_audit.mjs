#!/usr/bin/env node
// [2026-10-31] Attribute reuse, variant families and business-type coverage audit (DRAFT).
// Reads REAL data only: the runtime canonical taxonomy (shared/canonical-taxonomy-data.js:
// ATTRIBUTE_REGISTRY, PROFILE_LIBRARY, PRODUCT_TYPE_DEFINITIONS, PRODUCT_TYPE_REGISTRY),
// the taxonomy draft (out/sokohai-taxonomy-v1.draft.json) and taxonomy-draft/src/model.mjs.
// Writes out/attribute-audit.draft.json + .md and out/business-coverage.draft.json.
// Nothing is merged or renamed: duplicates are REPORTED for a human decision.
//   node taxonomy-draft/attribute_audit.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { COMMON_PRODUCT_ATTRIBUTES, COMMON_SERVICE_ATTRIBUTES, VARIANT_FAMILIES } from './src/model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'out');
const require = createRequire(import.meta.url);
const C = require('../shared/canonical-taxonomy-data.js');
const draft = JSON.parse(fs.readFileSync(path.join(OUT, 'sokohai-taxonomy-v1.draft.json'), 'utf8'));

/* ---------- normalisation (reporting only) ---------- */
const SPELLING = [[/colour/g, 'color'], [/packaging size|package size|pack size/g, 'packsize'], [/\bqty\b/g, 'quantity']];
export function attrKey(label) {
  let k = String(label || '').toLowerCase().replace(/\(.*?\)/g, ' ');
  for (const [re, to] of SPELLING) k = k.replace(re, to);
  return k.replace(/[^a-z0-9]+/g, '');
}
// Labels that MAY mean the same thing but are kept apart until a person decides.
const SYNONYM_CANDIDATES = [
  ['Color', 'Colour', 'Shade'], ['Package Size', 'Pack Size', 'Packaging'], ['Size', 'Shoe Size', 'Dimensions'],
  ['Storage', 'Storage Capacity', 'Capacity'], ['Weight', 'Net Weight'], ['Volume', 'Capacity'], ['Power', 'Power Rating', 'Wattage'],
  ['Crop', 'Crop Type'], ['Variety', 'Crop Variety'], ['Grade', 'Quality'], ['Model', 'Model Number']
];

/* ---------- inheritance rule: L0 common -> L1 profile groups -> L2 family axes -> L3 leaf definition -> L4 seller (Other) ---------- */
// Which PROFILE_LIBRARY groups a variant family inherits (PROPOSED mapping, reviewed by a person before use).
export const FAMILY_PROFILES = {
  apparel: ['identity', 'commerce', 'physical'], footwear: ['identity', 'commerce', 'physical'], beauty: ['identity', 'commerce', 'physical'],
  food_fresh: ['identity', 'commerce', 'food'], livestock: ['commerce', 'food'], electronics: ['identity', 'commerce', 'physical', 'machine'],
  unique_assets: ['identity', 'commerce', 'property'], parts: ['identity', 'commerce', 'physical'], hardware: ['identity', 'commerce', 'physical'],
  furniture: ['identity', 'commerce', 'physical'], media_books: ['identity', 'commerce', 'digital'], sports_toys: ['identity', 'commerce', 'physical'],
  arts_culture: ['identity', 'commerce', 'physical'], stationery_packaging: ['identity', 'commerce', 'physical'], bulk_commodities: ['commerce', 'food', 'agriculture'],
  digital: ['identity', 'digital'], services: []
};
const familyOf = catId => Object.entries(VARIANT_FAMILIES).find(([, f]) => (f.cats || []).includes(catId))?.[0] || null;
const defsOf = catId => C.PRODUCT_TYPE_DEFINITIONS[catId] || {};

/** Attributes a seller sees for a leaf, each with the layer it came from. Later layers override earlier ones. */
export function resolveAttributes(catId, leafName, { kind = 'product' } = {}) {
  const out = new Map();
  const put = (label, layer, extra = {}) => { const k = attrKey(label); if (!k) return; out.set(k, Object.assign({ label, layer, key: k }, out.get(k) && out.get(k).layer === layer ? out.get(k) : {}, extra, { layer, label })); };
  (kind === 'service' ? COMMON_SERVICE_ATTRIBUTES : COMMON_PRODUCT_ATTRIBUTES).forEach(a => put(a.id.replace(/^ATTR-/, '').replace(/_/g, ' '), 'L0_COMMON', { required: a.required }));
  const fam = familyOf(catId);
  (FAMILY_PROFILES[fam] || []).forEach(g => (C.PROFILE_LIBRARY[g] || []).forEach(l => put(l, 'L1_PROFILE:' + g)));
  ((VARIANT_FAMILIES[fam] || {}).axes || []).forEach(l => put(l, 'L2_FAMILY_AXIS:' + fam, { variantAxis: true }));
  const def = defsOf(catId)[leafName];
  if (def) {
    (def.attributes || []).forEach(l => put(l, 'L3_LEAF', { required: (def.requiredAttributes || []).includes(l) || undefined }));
    Object.keys(def.options || {}).forEach(l => put(l, 'L3_LEAF', { variantAxis: ((def.variantRule || {}).candidates || []).includes(l) }));
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/* ---------- registry, mapping, duplicates, coverage ---------- */
export function buildAudit() {
  const cats = draft.nodes.filter(n => n.level === 1 && n.type !== 'system' && n.origin !== 'SYSTEM');
  const leavesOf = id => draft.nodes.filter(n => n.parentId === id && n.level === 2 && n.origin !== 'SYSTEM');
  const usage = new Map();
  const note = (label, catId, leaf, how) => { const k = attrKey(label); if (!k) return; const u = usage.get(k) || { key: k, labels: new Set(), categories: new Set(), leaves: new Set(), as: new Set() }; u.labels.add(label); if (catId) u.categories.add(catId); if (leaf) u.leaves.add(catId + '›' + leaf); u.as.add(how); usage.set(k, u); };
  Object.values(C.ATTRIBUTE_REGISTRY).forEach(a => note(a.label, null, null, 'registry'));
  Object.entries(C.PROFILE_LIBRARY).forEach(([g, list]) => list.forEach(l => note(l, null, null, 'profile:' + g)));
  Object.entries(VARIANT_FAMILIES).forEach(([f, v]) => (v.axes || []).forEach(l => (v.cats || []).forEach(c => note(l, c, null, 'familyAxis:' + f))));
  Object.entries(C.PRODUCT_TYPE_DEFINITIONS).forEach(([cat, leaves]) => Object.entries(leaves).forEach(([leaf, d]) => {
    (d.attributes || []).forEach(l => note(l, cat, leaf, 'leafAttribute'));
    Object.keys(d.options || {}).forEach(l => note(l, cat, leaf, 'leafOption'));
  }));

  const registry = [...usage.values()].map(u => ({ key: u.key, labels: [...u.labels].sort(), categories: u.categories.size, leaves: u.leaves.size, usedAs: [...u.as].sort() }))
    .sort((a, b) => b.leaves - a.leaves || b.categories - a.categories || a.key.localeCompare(b.key));
  const sharedAcrossCategories = registry.filter(r => r.categories >= 2);

  const labelVariants = registry.filter(r => r.labels.length > 1).map(r => ({ key: r.key, labels: r.labels, status: 'SAME_KEY_DIFFERENT_SPELLING', action: 'Chagua lebo moja ya kuonyesha; ID/thamani zilizopo hazibadilishwi.' }));
  const keySet = new Set(registry.map(r => r.key));
  const synonymCandidates = SYNONYM_CANDIDATES.map(g => g.filter(l => keySet.has(attrKey(l)))).filter(g => g.length > 1)
    .map(g => ({ labels: g, status: 'NEEDS_HUMAN_DECISION', note: 'Huenda zina maana moja au tofauti halisi (mf. Size vs Shoe Size). Hazijaunganishwa.' }));

  const mapping = cats.map(c => {
    const leaves = leavesOf(c.id);
    const canon = leaves.filter(l => l.origin === 'CANONICAL');
    const defs = defsOf(c.id);
    const explicit = canon.filter(l => defs[l.name] && defs[l.name].definitionState === 'EXPLICIT_BRANCH_DEFINITION');
    const partial = canon.filter(l => defs[l.name] && defs[l.name].definitionState !== 'EXPLICIT_BRANCH_DEFINITION');
    const fam = familyOf(c.id);
    const kind = c.type === 'service' ? 'service' : 'product';
    const sampleLeaf = (explicit[0] || partial[0] || leaves[0] || {}).name || '';
    const resolved = resolveAttributes(c.id, sampleLeaf, { kind });
    const examples = Object.values(C.PRODUCT_TYPE_REGISTRY).filter(t => t.categoryId === c.id).slice(0, 3).map(t => t.label);
    const draftTypes = examples.length ? [] : draft.nodes.filter(n => n.level === 4 && n.origin !== 'SYSTEM' && n.id.includes(c.id + '-')).slice(0, 3).map(n => n.displayName.sw);
    return {
      categoryId: c.id, name: c.displayName.sw, kind, leaves: leaves.length, canonicalLeaves: canon.length, proposedLeaves: leaves.length - canon.length,
      leavesWithExplicitDefinition: explicit.length, leavesWithPartialDefinition: partial.length,
      leavesInheritOnly: leaves.length - explicit.length - partial.length,
      variantFamily: fam, inheritedProfiles: FAMILY_PROFILES[fam] || [],
      sampleLeaf, sampleResolvedAttributes: resolved.length, sampleLayers: [...new Set(resolved.map(r => r.layer.split(':')[0]))],
      examples: examples.length ? examples : draftTypes, examplesSource: examples.length ? 'canonical PRODUCT_TYPE_REGISTRY' : (draftTypes.length ? 'draft (PROPOSED types)' : 'none')
    };
  });

  const totals = mapping.reduce((t, m) => { t.categories++; t.leaves += m.leaves; t.explicit += m.leavesWithExplicitDefinition; t.partial += m.leavesWithPartialDefinition; t.inheritOnly += m.leavesInheritOnly; if (m.variantFamily) t.withFamily++; if (m.examples.length) t.withExamples++; return t; }, { categories: 0, leaves: 0, explicit: 0, partial: 0, inheritOnly: 0, withFamily: 0, withExamples: 0 });
  const missing = {
    categoriesWithoutVariantFamily: mapping.filter(m => !m.variantFamily).map(m => m.categoryId + ' ' + m.name),
    categoriesWithNoLeafDefinition: mapping.filter(m => !m.leavesWithExplicitDefinition && !m.leavesWithPartialDefinition).map(m => m.categoryId + ' ' + m.name),
    categoriesWithoutExamples: mapping.filter(m => !m.examples.length).map(m => m.categoryId + ' ' + m.name)
  };
  const families = Object.entries(VARIANT_FAMILIES).map(([id, f]) => ({ id, categories: f.cats, axes: f.axes, forbidden: f.forbidden, profiles: FAMILY_PROFILES[id] || [], note: f.note || null }));
  return {
    meta: { generatedFrom: ['shared/canonical-taxonomy-data.js', 'taxonomy-draft/out/sokohai-taxonomy-v1.draft.json', 'taxonomy-draft/src/model.mjs'], status: 'DRAFT', rule: 'L0 common → L1 profile groups → L2 variant-family axes → L3 leaf definition (overrides) → L4 seller Other/Specify' },
    totals: Object.assign(totals, { attributeKeys: registry.length, sharedAcrossCategories: sharedAcrossCategories.length, registryAttributes: Object.keys(C.ATTRIBUTE_REGISTRY).length }),
    registry, families, mapping, duplicates: { labelVariants, synonymCandidates }, missing
  };
}

/* ---------- business types (F): real taxonomy categories + POS capabilities proven in code ---------- */
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
const has = (f, re) => re.test(read(f));
export const POS_FEATURES = () => ([
  ['units_and_packs', 'Vipimo + pakiti (katoni)', has('html/09-admin-sell.html', /id="prodBaseUnit"/) && has('shared/product-listing-core.mjs', /export function normalizePricing/) ? 'IMPLEMENTED' : 'MISSING', 'prodBaseUnit, prodBulkUnit, normalizePricing'],
  ['barcode', 'Barcode (scan/andika)', has('js/app/15-pos-sales.js', /Barcode/) ? 'IMPLEMENTED' : 'MISSING', 'js/app/15-pos-sales.js scanner prompt'],
  ['weighing_fractional', 'Kupima uzito (kiasi cha desimali)', has('functions/inventory-authority.js', /Q\.precisionOf\(product\)/) && has('shared/quantity-core.js', /function toScaled/) ? 'IMPLEMENTED' : (has('functions/inventory-authority.js', /Number\.isSafeInteger\(quantity\)/) ? 'MISSING' : 'UNVERIFIED'), 'quantity-core (kg/L/m, quantityPrecision opt-in) kwenye posSale/adjust/return/void/ripoti; kikapu kikuu cha POS bado kwa 1'],
  ['batch_expiry', 'Batch + tarehe ya kuisha', has('js/app/08-app-state.js', /batchNumber/) ? 'PARTIAL' : 'MISSING', 'batch/expiry moja kwa bidhaa; hakuna stock kwa kila batch (FEFO)'],
  ['serial_imei', 'Serial / IMEI', has('js/app/08-app-state.js', /imeiNumbers/) ? 'PARTIAL' : 'MISSING', 'orodha ya maandishi; hakuna ufuatiliaji wa kila kipande kinachouzwa'],
  ['variants_at_pos', 'Variants dukani (POS)', has('functions/inventory-authority.js', /variantId/) ? 'IMPLEMENTED' : 'MISSING', 'posSale variantId + tests za pos variant'],
  ['purchases', 'Manunuzi (stock in)', has('functions/inventory-authority.js', /'PURCHASE'/) ? 'IMPLEMENTED' : 'MISSING', "inventoryAdjust movementType 'PURCHASE'"],
  ['returns_voids', 'Returns / void / refund', has('functions/inventory-authority.js', /posReturn|exports\.posVoid/) ? 'IMPLEMENTED' : 'MISSING', 'posReturn, posVoid, posRefund'],
  ['expenses', 'Matumizi (expenses)', has('js/app/15-pos-sales.js', /shop_ledger/) ? 'IMPLEMENTED' : 'MISSING', 'shop_ledger (kivinjari)'],
  ['credit_sales', 'Mauzo ya deni', has('js/app/15-pos-sales.js', /loadDebtsListInLedger/) ? 'IMPLEMENTED' : 'MISSING', 'madeni kwenye ledger'],
  ['reports', 'Ripoti za POS', has('functions/reporting-authority.js', /exports\.posReports/) ? 'IMPLEMENTED' : 'MISSING', 'posReports (server)'],
  ['online_reservation', 'Stock moja POS + online', has('functions/inventory-reservation.js', /reserveOrder/) ? 'IMPLEMENTED_OFF_BY_DEFAULT' : 'MISSING', 'Awamu 3 (local + emulator)'],
  ['multi_location', 'Maduka/ghala nyingi', 'PARTIAL', 'location moja kwa bidhaa; Awamu 4'],
  ['service_orders', 'Oda za huduma / job cards', /jobCard|service_orders/.test(read('functions/index.js')) ? 'IMPLEMENTED' : 'MISSING', 'hakuna module ya job card'],
  ['restaurant_tables', 'Meza / jikoni (restaurant)', /tableNumber|kitchenOrder/.test(read('js/app/15-pos-sales.js')) ? 'IMPLEMENTED' : 'MISSING', 'hakuna oda za meza/jikoni']
]).map(([id, label, status, evidence]) => ({ id, label, status, evidence }));

const BUSINESS_TYPES = [
  ['retail', 'Duka la rejareja', ['CAT-01', 'CAT-08', 'CAT-32'], ['units_and_packs', 'barcode', 'credit_sales']],
  ['wholesale', 'Jumla (wholesale)', ['CAT-01', 'CAT-08', 'CAT-10'], ['units_and_packs', 'purchases', 'credit_sales']],
  ['supermarket', 'Supermarket', ['CAT-01', 'CAT-08', 'CAT-32'], ['barcode', 'units_and_packs', 'batch_expiry', 'weighing_fractional']],
  ['minimarket', 'Mini-market', ['CAT-01', 'CAT-08'], ['barcode', 'units_and_packs']],
  ['hardware', 'Hardware', ['CAT-10', 'CAT-33', 'CAT-34'], ['units_and_packs', 'purchases']],
  ['pharmacy', 'Famasia / vifaa tiba', ['CAT-19'], ['batch_expiry', 'barcode']],
  ['electronics', 'Electronics', ['CAT-11', 'CAT-12', 'CAT-13'], ['serial_imei', 'variants_at_pos', 'returns_voids']],
  ['fashion', 'Nguo na mitindo', ['CAT-07'], ['variants_at_pos', 'returns_voids']],
  ['agrovet', 'Agrovet', ['CAT-02', 'CAT-04', 'CAT-19'], ['batch_expiry', 'units_and_packs']],
  ['produce', 'Mazao ya kilimo', ['CAT-01', 'CAT-03'], ['weighing_fractional', 'units_and_packs']],
  ['livestock', 'Mifugo', ['CAT-04'], ['units_and_packs']],
  ['restaurant', 'Mgahawa / chakula', ['CAT-25', 'CAT-01'], ['restaurant_tables', 'expenses']],
  ['salon', 'Saluni / kinyozi', ['CAT-17'], ['service_orders']],
  ['garage', 'Gereji / karakana', ['CAT-15', 'CAT-18'], ['service_orders', 'purchases']],
  ['furniture', 'Samani', ['CAT-09'], ['variants_at_pos', 'purchases']],
  ['building', 'Vifaa vya ujenzi', ['CAT-10'], ['units_and_packs', 'purchases']],
  ['online_store', 'Duka la mtandaoni', ['CAT-07', 'CAT-11'], ['online_reservation']],
  ['services', 'Biashara za huduma', ['CAT-16', 'CAT-17', 'CAT-18', 'CAT-21', 'CAT-24'], ['service_orders']],
  ['warehouse', 'Ghala / msambazaji', ['CAT-49', 'CAT-16'], ['multi_location', 'purchases']]
];
export function buildBusinessCoverage() {
  const feats = POS_FEATURES();
  const fmap = Object.fromEntries(feats.map(f => [f.id, f.status]));
  const byId = new Map(draft.nodes.map(n => [n.id, n]));
  const rows = BUSINESS_TYPES.map(([id, label, cats, needs]) => {
    const found = cats.filter(c => byId.has(c));
    const gaps = needs.filter(n => !/^IMPLEMENTED/.test(fmap[n] || ''));
    return { id, label, taxonomyCategories: found.map(c => c + ' ' + byId.get(c).displayName.sw), missingCategories: cats.filter(c => !byId.has(c)),
      needs, gaps, status: !found.length ? 'NO_TAXONOMY' : (gaps.length ? 'PARTIAL' : 'SUPPORTED') };
  });
  return { meta: { status: 'DRAFT', note: 'Hali ya feature imethibitishwa kwa kusoma code (regex kwenye files halisi), si kwa madai.' }, posFeatures: feats, businessTypes: rows };
}

function md(a, bc) {
  const L = [];
  L.push('# Attribute reuse, variant families na coverage (DRAFT)', '', `Kanuni ya urithi: ${a.meta.rule}`, '');
  const t = a.totals;
  L.push(`Categories ${t.categories} · leaves ${t.leaves} · leaves zenye definition kamili ${t.explicit} · partial ${t.partial} · zinazorithi tu ${t.inheritOnly} · categories zenye variant family ${t.withFamily} · attribute keys ${t.attributeKeys} (zinazotumika na categories ≥2: ${t.sharedAcrossCategories})`, '');
  L.push('| Category | Leaves | Kamili | Partial | Rithi tu | Family | Mifano |', '|---|---|---|---|---|---|---|');
  a.mapping.forEach(m => L.push(`| ${m.categoryId} ${m.name} | ${m.leaves} | ${m.leavesWithExplicitDefinition} | ${m.leavesWithPartialDefinition} | ${m.leavesInheritOnly} | ${m.variantFamily || '—'} | ${m.examples.join(', ') || '—'} |`));
  L.push('', '## Majina yanayofanana (hayajaunganishwa)', '');
  a.duplicates.labelVariants.forEach(d => L.push(`- ${d.labels.join(' / ')} (${d.status})`));
  a.duplicates.synonymCandidates.forEach(d => L.push(`- ${d.labels.join(' ~ ')} (${d.status})`));
  L.push('', '## Biashara za aina zote', '', '| Biashara | Kategoria | Mahitaji | Mapungufu | Hali |', '|---|---|---|---|---|');
  bc.businessTypes.forEach(b => L.push(`| ${b.label} | ${b.taxonomyCategories.join('; ')} | ${b.needs.join(', ')} | ${b.gaps.join(', ') || '—'} | ${b.status} |`));
  L.push('', '## POS features (zimethibitishwa kwenye code)', '', '| Feature | Hali | Ushahidi |', '|---|---|---|');
  bc.posFeatures.forEach(f => L.push(`| ${f.label} | ${f.status} | ${f.evidence} |`));
  return L.join('\n') + '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = buildAudit(); const bc = buildBusinessCoverage();
  const files = { 'attribute-audit.draft.json': JSON.stringify(a, null, 1) + '\n', 'business-coverage.draft.json': JSON.stringify(bc, null, 1) + '\n', 'attribute-audit.draft.md': md(a, bc) };
  if (process.argv.includes('--check')) {
    for (const [f, v] of Object.entries(files)) { const p = path.join(OUT, f); if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== v) { console.error('STALE', f); process.exit(1); } }
    console.log('attribute audit up to date');
  } else {
    for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), v);
    console.log(`attribute audit: ${a.totals.categories} categories, ${a.totals.leaves} leaves, ${a.totals.attributeKeys} attribute keys, ${a.duplicates.labelVariants.length} spelling variants, ${a.duplicates.synonymCandidates.length} synonym groups; ${bc.businessTypes.length} business types`);
  }
}

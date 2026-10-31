#!/usr/bin/env node
// Builds the LOCAL interactive taxonomy + seller-builder preview from the taxonomy draft.
// Reads only: taxonomy-draft/out/sokohai-taxonomy-v1.draft.json, taxonomy-draft/out/legacy-mapping.draft.json,
//             shared/canonical-taxonomy-data.js (attribute/option definitions, read-only).
// Writes only: taxonomy-draft/preview/taxonomy-preview.html (open directly in a browser, no server, no Firebase)
//              taxonomy-draft/preview/dist/taxonomy-preview.artifact.html (same page without the html/head/body skeleton)
// Usage: node taxonomy-draft/preview/build_preview.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRAFT = path.resolve(HERE, '..');
const ROOT = path.resolve(DRAFT, '..');
const require = createRequire(import.meta.url);

export function buildData() {
  const ds = JSON.parse(fs.readFileSync(path.join(DRAFT, 'out/sokohai-taxonomy-v1.draft.json'), 'utf8'));
  const legacy = JSON.parse(fs.readFileSync(path.join(DRAFT, 'out/legacy-mapping.draft.json'), 'utf8'));
  const canon = require(path.join(ROOT, 'shared/canonical-taxonomy-data.js'));
  const nodes = ds.nodes;
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // compact node rows: [id, parentIndex, level, sw, en, type, origin, status, regFlags, aliases, desc]
  const rows = nodes.map((n) => [
    n.id, n.parentId == null ? -1 : idx.get(n.parentId), n.level, n.displayName.sw, n.displayName.en,
    n.type, n.origin, n.status, n.regulatory.join(' '),
    [...new Set(n.aliases.filter((a) => a && a !== n.displayName.en && a !== n.displayName.sw))].slice(0, 4).join('|'),
    n.level <= 1 ? (n.description || '').slice(0, 220) : '',
  ]);
  // canonical attribute definitions: per leaf node id, and per category ("default")
  const defs = {};
  for (const [cat, branches] of Object.entries(canon.PRODUCT_TYPE_DEFINITIONS)) {
    for (const [branch, d] of Object.entries(branches)) {
      const target = branch === 'default' ? cat : nodes.find((n) => n.canonicalRef && n.canonicalRef.categoryId === cat && n.canonicalRef.subcategory === branch)?.id;
      if (!target) continue;
      defs[target] = { a: d.attributes || [], o: d.options || {}, f: d.filters || [], ft: d.features || [], v: d.variantRule ? { m: d.variantRule.mode, c: d.variantRule.candidates || [] } : null, src: `${cat} › ${branch}` };
    }
  }
  const attrs = {};
  for (const a of Object.values(canon.ATTRIBUTE_REGISTRY)) attrs[a.label] = [a.dataType || 'string', a.unitGroup || '', (a.allowedValues || []).slice(0, 12)];
  const units = [
    ...Object.values(ds.units.existing).map((u) => ({ id: u.unitId, label: u.label, group: u.unitGroup, base: u.baseUnit, conv: u.conversion, ok: u.conversion != null, origin: 'CANONICAL' })),
    ...ds.units.additions.map((u) => ({ id: u.unitId, label: u.label, group: u.unitGroup, base: u.baseUnit, conv: u.conversion, ok: u.convertible, note: u.note || '', origin: 'PROPOSED' })),
  ];
  const scenarios = SCENARIOS.map((s) => {
    if (!byId.has(s.nodeId)) throw new Error('Scenario node missing: ' + s.nodeId);
    return s;
  });
  const legacyRows = legacy.advancedCategories.filter((r) => r.legacySub === null).map((r) => [r.legacyCategory, r.action, r.targetNodeId || r.overlay || '']);
  const counts = { nodes: nodes.length, byLevel: {}, byOrigin: {} };
  for (const n of nodes) { counts.byLevel[n.levelName] = (counts.byLevel[n.levelName] || 0) + 1; counts.byOrigin[n.origin] = (counts.byOrigin[n.origin] || 0) + 1; }
  return {
    meta: { generatedFrom: 'taxonomy-draft/out/sokohai-taxonomy-v1.draft.json', schema: ds.meta.schema, generatedAt: ds.meta.generatedAt, status: ds.meta.status },
    nodes: rows, defs, attrs, units, families: ds.variants.families, variantRules: ds.variants.rules,
    common: ds.attributes.common, reg: ds.regulatoryFlags, overlays: ds.overlays,
    sources: Object.fromEntries(Object.entries(ds.sources).map(([k, v]) => [k, v.title])),
    legacy: legacyRows, scenarios, counts, unitLegacy: ds.units.legacyMap,
  };
}

// The nine required test scenarios + extra product-information examples. Node IDs are
// validated against the draft at build time; store names are marked as examples.
const SCENARIOS = [
  { key: 'dukadogo', biz: 'Duka dogo (POS tu, muuzaji wa zamani)', title: 'Duka dogo la rejareja bila location iliyosajiliwa', kind: 'product', nodeId: 'PT-CAT-01-VIAMBATO_VYA_CHAKULA_SUKARI', name: 'Sukari', marketplace: false, pos: true, legacySeller: true, sellerLocs: [], locs: [], unit: 'kg', price: 3200, cost: 2800, packs: [{ label: 'Pakiti 1 kg', content: 1, price: 3300 }], packMode: 'base', stock: { '': { 'loc-default': 120 } } },
  { key: 'jumla', biz: 'Wholesale (lita, chupa, debe, jumla)', title: 'Muuzaji wa jumla wa mafuta ya kupikia', kind: 'product', nodeId: 'PT-CAT-01-MAFUTA_VIAMBATO_VYA_KUPIKIA_MAFUTA_YA_ALIZETI', name: 'Mafuta ya alizeti', marketplace: true, pos: true, sellerLocs: ['st-a'], locs: ['st-a'], unit: 'L', price: 4000, cost: 3100, packs: [{ label: 'Chupa 3 L', content: 3, price: 11500 }, { label: 'Debe 20 L', content: 20, price: 72000 }], packMode: 'base', tiers: [{ ref: 'Debe 20 L', min: 10, price: 66000 }, { ref: 'base', min: 50, price: 3600 }], stock: { '': { 'st-a': 600 } }, delivery: ['pickup', 'sokohai'] },
  { key: 'kilimo', biz: 'Kilimo (kusimamia tu)', title: 'Mkulima anayesimamia stock ya mahindi ghalani', kind: 'product', nodeId: 'PT-CAT-03-DEFAULT_MAHINDI', name: 'Mahindi meupe', marketplace: false, pos: false, sellerLocs: ['wh-b'], locs: ['wh-b'], unit: 'gunia', content: 90, contentUnit: 'kg', price: 85000, cost: 70000, stock: { '': { 'wh-b': 40 } } },
  { key: 'mifugo', biz: 'Mifugo (idadi au uzito)', title: 'Kuku wa kienyeji: online + POS kutoka duka moja', kind: 'product', nodeId: 'PT-CAT-04-KUKU_KUKU_WA_KIENYEJI', name: 'Kuku wa kienyeji (jogoo)', marketplace: true, pos: true, sellerLocs: ['st-a'], locs: ['st-a'], unit: 'head', price: 18000, cost: 12000, stock: { '': { 'st-a': 25 } }, delivery: ['pickup'] },
  { key: 'electronics', biz: 'Electronics (online tu)', title: 'Simu online pekee, bila duka', kind: 'product', nodeId: 'PT-CAT-12-DEFAULT_SMARTPHONE', name: 'Smartphone', marketplace: true, pos: false, sellerLocs: ['loc-default'], locs: ['loc-default'], unit: 'piece', price: 650000, cost: 560000, axes: { Storage: ['128 GB', '256 GB'], Colour: ['Nyeusi', 'Bluu'] }, delivery: ['seller', 'sokohai'] },
  { key: 'huduma', biz: 'Huduma (fundi umeme)', title: 'Fundi umeme kwenye Huduma Hub', kind: 'service', nodeId: 'PT-CAT-18-UMEME_WA_MAJENGO_WIRING_YA_NYUMBA', name: 'Wiring ya nyumba (vyumba 3)', priceModel: 'quote', area: 'Dar es Salaam — Kinondoni', mode: 'onsite_customer' },
  { key: 'stores', biz: 'Stores nyingi (duka + ghala)', title: 'Saruji: POS dukani, marketplace kutoka ghalani', kind: 'product', nodeId: 'PT-CAT-10-DEFAULT_CEMENT', name: 'Saruji 50kg', marketplace: true, pos: true, sellerLocs: ['st-a', 'wh-b'], locs: ['st-a', 'wh-b'], fulfil: 'wh-b', unit: 'bag', content: 50, contentUnit: 'kg', price: 18500, cost: 16000, tiers: [{ ref: 'base', min: 100, price: 17500 }], stock: { '': { 'st-a': 200, 'wh-b': 75 } }, delivery: ['pickup', 'sokohai'] },
  { key: 'online', biz: 'Online tu (iko dukani)', title: 'Sofa iko dukani lakini inauzwa online tu', kind: 'product', nodeId: 'PT-CAT-09-DEFAULT_SOFA', name: 'Sofa ya viti 3', marketplace: true, pos: false, sellerLocs: ['st-a'], locs: ['st-a'], unit: 'piece', price: 1450000, cost: 1100000, axes: { Colour: ['Kijivu', 'Kahawia'] }, delivery: ['pickup', 'sokohai'] },
  { key: 'posonly', biz: 'POS tu (muuzaji mpya)', title: 'Duka jipya linalouza kwa POS pekee', kind: 'product', nodeId: 'PT-CAT-08-UTUNZAJI_WA_KINYWA_MENO_DAWA_YA_MENO', name: 'Dawa ya meno 100ml', marketplace: false, pos: true, sellerLocs: ['st-a'], locs: ['st-a'], unit: 'piece', price: 4500, cost: 3600, stock: { '': { 'st-a': 48 } } },
  { key: 'nguo', biz: 'Nguo (variants)', title: 'T-shirt online + POS', kind: 'product', nodeId: 'PT-CAT-07-DEFAULT_T_SHIRT', name: 'T-shirt ya pamba', marketplace: true, pos: true, sellerLocs: ['st-a'], locs: ['st-a'], unit: 'piece', price: 25000, cost: 15000, axes: { Size: ['M', 'L', 'XL'], Colour: ['Nyeupe', 'Kijani'] }, delivery: ['pickup', 'seller'] },
  { key: 'gari', biz: 'Gari (kipengee cha kipekee)', title: 'SUV iliyotumika, online', kind: 'product', nodeId: 'PT-CAT-14-DEFAULT_SUV', name: 'SUV 2016', marketplace: true, pos: false, sellerLocs: ['loc-default'], locs: ['loc-default'], unit: 'piece', price: 38000000, cost: 0, stock: { '': { 'loc-default': 1 } }, delivery: ['seller'] },
];

export function assemble(data) {
  const css = fs.readFileSync(path.join(HERE, 'src/style.css'), 'utf8');
  const body = fs.readFileSync(path.join(HERE, 'src/body.html'), 'utf8');
  const MODULES = ['core.js', 'builder.js', 'stock.js', 'views.js', 'flow.js', 'main.js'];
  const app = "/* SokoHai taxonomy + seller-builder PREVIEW. Local only: no Firebase, no network, no storage of business data.\n   Everything a viewer does here lives in memory and disappears on reload. */\n(function () {\n  'use strict';\n" +
    MODULES.map((m) => `  /* ===== ${m} ===== */\n` + fs.readFileSync(path.join(HERE, 'src', m), 'utf8').replace(/^\s*'use strict';\n/, '')).join('\n') + '})();\n';
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const head = '<title>SokoHai Taxonomy Preview</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n';
  const inner = `${head}<style>\n${css}\n</style>\n${body}\n<script>window.SKH_DATA=${json};</script>\n<script>\n${app}\n</script>\n`;
  const full = `<!doctype html>\n<html lang="sw">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n<script>window.SKH_DATA=${json};</script>\n<script>\n${app}\n</script>\n</body>\n</html>\n`;
  return { full, inner };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { full, inner } = assemble(buildData());
  const outFull = path.join(HERE, 'taxonomy-preview.html');
  const outInner = path.join(HERE, 'dist/taxonomy-preview.artifact.html');
  if (process.argv.includes('--check')) {
    const ok = fs.existsSync(outFull) && fs.readFileSync(outFull, 'utf8') === full;
    console.log(ok ? 'preview up to date' : 'STALE preview'); process.exit(ok ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(outInner), { recursive: true });
  fs.writeFileSync(outFull, full); fs.writeFileSync(outInner, inner);
  console.log('wrote', path.relative(ROOT, outFull), (full.length / 1024).toFixed(0) + ' KB');
}

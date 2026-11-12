#!/usr/bin/env node
/* [REMEDIATION 2026-11 R11] Lazy taxonomy split: the bridge built on the small identity
 * projection + lazily loaded definitions returns EXACTLY what the old bridge (full
 * 303 KB projection) returned, for every category, leaf and product type.
 * Also proves the browser path starts without definitions and loads them on demand. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0; const ok = (n, c, i) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n + (c || i === undefined ? '' : ' ' + JSON.stringify(i).slice(0, 300))); };

execFileSync('node', [path.join(ROOT, 'tools/build_product_schema_bridge.mjs'), '--check'], { stdio: 'pipe' });
ok('generated projections in sync with canonical authority (browser, identity, definitions)', true);

// Old bridge = same source, importing the full projection (reference behaviour).
const src = fs.readFileSync(path.join(ROOT, 'shared/product-taxonomy-bridge.mjs'), 'utf8');
const start = src.indexOf('// [REMEDIATION 2026-11 R11]'), end = src.indexOf('export {ensureTaxonomyDefinitions,taxonomyDefinitionsLoaded};') + 'export {ensureTaxonomyDefinitions,taxonomyDefinitionsLoaded};'.length;
ok('bridge carries the lazy loader header', start === 0 && end > start);
const oldSrc = "import projection from './product-taxonomy-browser.mjs';\n" + src.slice(end);
const tmp = path.join(ROOT, 'shared', '.tmp-bridge-reference-' + process.pid + '.mjs');
fs.writeFileSync(tmp, oldSrc);
let OLD; try { OLD = await import(pathToFileURL(tmp).href); } finally { fs.unlinkSync(tmp); }
const NEW = await import('../shared/product-taxonomy-bridge.mjs');
ok('Node loads definitions eagerly', NEW.taxonomyDefinitionsLoaded() === true);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const live = { 'Electronics & Teknoloji (Tech)': { subcategories: { 'TVs & Displays': { filters: ['Brand'] } } } };
ok('getSellerCategoryOptions identical', same(OLD.getSellerCategoryOptions(live), NEW.getSellerCategoryOptions(live)));
let cats = 0, leaves = 0, types = 0, diffs = [];
for (const c of OLD.getSellerCategoryOptions(live)) {
  cats++;
  const a = OLD.getSellerSubcategories(c.value, live), b = NEW.getSellerSubcategories(c.value, live);
  if (!same(a, b)) diffs.push(['subs', c.value]);
  for (const leaf of a) {
    leaves++;
    const ta = OLD.getProductTypeOptions(c.value, leaf), tb = NEW.getProductTypeOptions(c.value, leaf);
    types += ta.length; if (!same(ta, tb)) diffs.push(['types', c.value, leaf]);
    if (!same(OLD.getProductSuggestions(c.value, leaf, live[c.value]), NEW.getProductSuggestions(c.value, leaf, live[c.value]))) diffs.push(['suggest', c.value, leaf]);
  }
  if (!same(OLD.getProductSuggestions(c.value, '', live[c.value]), NEW.getProductSuggestions(c.value, '', live[c.value]))) diffs.push(['suggest-default', c.value]);
}
ok(`identical subcategories, product types and suggestions (${cats} categories, ${leaves} leaves, ${types} product types)`, diffs.length === 0 && leaves > 100 && types > 1000, diffs.slice(0, 5));
ok('legacy label routes the same (Electronics & Teknoloji (Tech))', OLD.categoryIdFor('Electronics & Teknoloji (Tech)') === NEW.categoryIdFor('Electronics & Teknoloji (Tech)'));

// Browser path: a fresh module instance with `window` defined starts WITHOUT definitions.
globalThis.window = {};
const B = await import('../shared/product-taxonomy-bridge.mjs?browser');
ok('browser: definitions not loaded at start', B.taxonomyDefinitionsLoaded() === false);
ok('browser: categories and leaves available without definitions', B.getSellerCategoryOptions({}).length === NEW.getSellerCategoryOptions({}).length && same(B.getSellerSubcategories('CAT-11', {}), NEW.getSellerSubcategories('CAT-11', {})));
await B.ensureTaxonomyDefinitions();
ok('browser: ensureTaxonomyDefinitions() loads them once', B.taxonomyDefinitionsLoaded() === true && (await B.ensureTaxonomyDefinitions()) === true);
ok('browser: after loading, product types + suggestions match', same(B.getProductTypeOptions('CAT-11', NEW.getSellerSubcategories('CAT-11', {})[0]), NEW.getProductTypeOptions('CAT-11', NEW.getSellerSubcategories('CAT-11', {})[0])) && same(B.getProductSuggestions('CAT-01', 'Mboga & Fresh Produce'), NEW.getProductSuggestions('CAT-01', 'Mboga & Fresh Produce')));
delete globalThis.window;

const size = f => fs.statSync(path.join(ROOT, 'shared', f)).size;
const before = size('product-taxonomy-browser.mjs'), after = size('category-identity.mjs');
ok(`buyer-side taxonomy payload: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB (definitions ${Math.round(size('product-taxonomy-definitions.mjs') / 1024)} KB on demand)`, after < before / 10);
const js = ['js/app/05-forms.js', 'js/app/06-product-builder.js', 'js/app/08-app-state.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const browserImports = fs.readdirSync(path.join(ROOT, 'js/app')).filter(f => /\.js$/.test(f)).filter(f => /product-taxonomy-browser|product-taxonomy-definitions/.test(fs.readFileSync(path.join(ROOT, 'js/app', f), 'utf8')));
ok('no app module imports the full projection or definitions statically', browserImports.length === 0, browserImports);
ok('seller form + builder request definitions on demand', /ensureTaxonomyDefinitions/.test(js));
console.log(`\nTAXONOMY LAZY SPLIT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

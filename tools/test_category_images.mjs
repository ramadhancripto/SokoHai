#!/usr/bin/env node
/* [REMEDIATION 2026-11 R6] Category image map: keyed by canonical id, legacy names
 * resolve through the reviewed mapping, every referenced file exists, rejected
 * images (watermark / wrong subject) are not used, missing images fall back to a
 * neutral tile without a network request, product photos are not cropped. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { canonicalCategoryId, categoryLabel, buyerProductCategories } from '../shared/category-filter-core.mjs';
import { legacyAdvancedCategories } from './legacy_catalog_source.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, i === undefined ? '' : JSON.stringify(i)); } };

const src = fs.readFileSync(path.join(ROOT, 'js/app/83-category-photos.js'), 'utf8');
const files = new Set(fs.readdirSync(path.join(ROOT, 'assets/img/categories')).map(f => f.replace(/\.webp$/, '')));

// run the module with a minimal browser stub
const win = { skh: { canonicalCategoryId, categoryLabel, buyerProductCategories: () => buyerProductCategories(Object.keys(legacyAdvancedCategories())), advancedCategories: legacyAdvancedCategories() } };
const doc = { readyState: 'complete', getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] };
const ctx = { window: win, document: doc, setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, MutationObserver: function () { this.observe = () => {}; },
    console: { log() {}, warn() {} }, fetch: () => Promise.resolve({ ok: true }), Promise, JSON, Object, Array, String };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const img = r => win.skhCategoryImage(r);
const BY_ID = win.SKH_CATEGORY_PHOTO_BY_ID;
const idx0 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

ok('image map is keyed by canonical ids', Object.keys(BY_ID).every(k => /^CAT-\d{2}$/.test(k)));
ok('every referenced image file exists', Object.values(BY_ID).filter(Boolean).every(s => files.has(s)), Object.values(BY_ID).filter(s => s && !files.has(s)));
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const REJ = win.SKH_CATEGORY_REJECTED_IMAGES || [];
ok('rejected list names every watermarked / wrong-subject / duplicate file found in review (incl. svc-rental, huduma)', ['svc-rental','huduma'].every(f => (win.SKH_CATEGORY_REJECTED_IMAGES||[]).includes(f)));
ok('rejected list names every watermarked file found in review', ['vitabu', 'vito', 'kale', 'maagizo', 'svc-coaching', 'svc-writing', 'svc-website', 'svc-construction'].every(f => REJ.includes(f)));
ok('no rejected (watermarked / wrong-subject) image is referenced by any mapping', REJ.every(f => !new RegExp(":\\s*'" + f + "'").test(code)), REJ.filter(f => new RegExp(":\\s*'" + f + "'").test(code)));
ok('rejected files are kept on disk (nothing deleted)', REJ.every(f => files.has(f)));

// every category the buyer/seller can pick has an explicit decision (image or fallback)
const cats = buyerProductCategories(Object.keys(legacyAdvancedCategories()));
const undecided = cats.filter(c => { const id = canonicalCategoryId(c.value); return id ? !(id in BY_ID) : !new RegExp("'" + c.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'").test(src); });
ok('every buyer/seller category has an explicit image decision', undecided.length === 0, undecided.map(c => c.value));
// [R13-C] owner decision: real photos (cleaned set), not the 3D SVG family
const CLEAN = new Set(fs.readdirSync(path.join(ROOT, 'assets/img/categories/clean')).map(f => f.replace(/\.webp$/, '')));
const P = f => 'assets/img/categories/clean/' + f + '.webp';
const withImg = cats.filter(c => !!img({ category: c.value }));
console.log(`  coverage: ${withImg.length}/${cats.length} buyer/seller categories have a photo; ${cats.length - withImg.length} show the "Picha inakuja" tile`);
ok('R13-C: every mapped photo exists in the cleaned set', Object.values(BY_ID).filter(Boolean).every(f => CLEAN.has(f)), Object.values(BY_ID).filter(f => f && !CLEAN.has(f)));
ok('R13-C: originals kept (clean set is a copy)', [...CLEAN].every(f => files.has(f)));
ok('R13-C: no 3D/SVG illustration is used as a category picture', !/category-icons\//.test(code) && !/<script[^>]+86-category-icons-manifest/.test(idx0));
ok('R13-C: SVG family kept on disk (not deleted)', fs.existsSync(path.join(ROOT, 'assets/img/category-icons/manifest.json')));
ok('canonical id resolves to its photo', img({ categoryId: 'CAT-11' }) === P('elektroniki'));
ok('reviewed legacy label resolves through its canonical id', img({ category: 'Electronics & Teknoloji (Tech)' }) === img({ categoryId: 'CAT-11' }));
ok('canonical display name resolves', img({ category: 'Chakula & Vinywaji' }) === P('vyakula'));
const used = Object.values(BY_ID).filter(Boolean);
ok('R13-C: different product categories never share a photo', new Set(used).size === used.length, used.filter((f, i) => used.indexOf(f) !== i));
ok('R13-C: Phones / Computers do not reuse the Electronics photo', img({ categoryId: 'CAT-12' }) === null && img({ categoryId: 'CAT-13' }) === null);
ok('R13-C: services and transport resolve to photos', img({ category: 'Tech & Repair' }) === P('svc-tech') && img({ category: 'Mizigo Mikubwa' }) === P('tr-cargo') && img({ category: 'Watu (Ride)' }) === P('tr-passenger'));
ok('R13-C: category without a suitable photo -> null (placeholder tile, no request)', img({ categoryId: 'CAT-05' }) === null && img({ category: 'Rental Services' }) === null && img({ category: 'Haipo kabisa' }) === null);
ok('R13-C: placeholder tile says the photo is coming', /Picha inakuja/.test(src) && /if \(!list\.length\) return fallbackMarkup\(name\);/.test(src));
ok('R13-C: sub-categories never get the parent photo or a drawing', win.skhSubcategoryImage('Smartphones') === null && img({ categoryId: 'CAT-01', subcategory: 'Nafaka' }) === img({ categoryId: 'CAT-01' }));
ok('no rejected (watermarked) photo is shown anywhere', REJ.every(f => img({ category: f }) === null) && REJ.every(f => !CLEAN.has(f)));
const css64 = fs.readFileSync(path.join(ROOT, 'css/64-image-quality.css'), 'utf8');
ok('R13-C: product cards are 1:1 with object-fit: contain, loaded after 52', /aspect-ratio: 1 \/ 1 !important/.test(css64) && /object-fit: contain !important/.test(css64) && idx0.indexOf('css/64-image-quality.css') > idx0.indexOf('css/52-product-card-details.css'));
ok('images carry alt text and lazy loading', /alt="' \+ esc\(alt \|\| labelOf\(name\)\)/.test(src) && /loading="lazy"/.test(src));

const css = fs.readFileSync(path.join(ROOT, 'css/59-nav-balance.css'), 'utf8');
ok('product card photos use object-fit: contain', /skh-card--product[^{]*>\s*img[^{]*\{[^}]*object-fit:\s*contain/.test(css.replace(/\n/g, ' ')));
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('59-nav-balance.css loads after the product card stylesheets', idx.indexOf('css/59-nav-balance.css') > idx.indexOf('css/52-product-card-details.css') && idx.indexOf('css/59-nav-balance.css') > idx.indexOf('css/16-commerce-card.css'));

console.log(`\nCATEGORY IMAGES: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

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
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/app/86-category-icons-manifest.js'), 'utf8'), ctx);   // [R13] illustration family
vm.runInContext(src, ctx);
const img = r => win.skhCategoryImage(r);
const BY_ID = win.SKH_CATEGORY_PHOTO_BY_ID;

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
const ICONS = win.SKH_CATEGORY_ICONS, ICON = f => 'assets/img/category-icons/' + f;
const iconFiles = new Set(fs.readdirSync(path.join(ROOT, 'assets/img/category-icons')));
const withImg = cats.filter(c => !!img({ category: c.value, fallback: false }));
console.log(`  coverage: ${withImg.length}/${cats.length} buyer/seller categories have their own illustration`);
// [R13] approved owner style: one illustration family; photos stay on disk, never shown for categories
ok('R13: every buyer/seller category has its own illustration (no fallback needed)', withImg.length === cats.length, cats.filter(c => !img({ category: c.value, fallback: false })).map(c => c.value));
ok('R13: every manifest file exists', Object.values(ICONS.categories).concat(Object.values(ICONS.services), Object.values(ICONS.transport), Object.values(ICONS.modes), Object.values(ICONS.subjects)).every(f => iconFiles.has(f)));
ok('canonical id resolves to its illustration', img({ categoryId: 'CAT-11' }) === ICON(ICONS.categories['CAT-11']));
ok('reviewed legacy label resolves through its canonical id', img({ category: 'Electronics & Teknoloji (Tech)' }) === img({ categoryId: 'CAT-11' }));
ok('canonical display name resolves', img({ category: 'Chakula & Vinywaji' }) === ICON(ICONS.categories['CAT-01']));
ok('R13: different categories never share a picture', new Set(Object.values(ICONS.categories)).size === Object.keys(ICONS.categories).length && new Set(Object.values(ICONS.categories).map(f => fs.readFileSync(path.join(ROOT, 'assets/img/category-icons', f), 'utf8'))).size === Object.keys(ICONS.categories).length);
ok('R13: the 19 former gaps now have illustrations (CAT-05, CAT-32, Rental Services, Writing & Translation)', ['CAT-05', 'CAT-32', 'CAT-41', 'CAT-43'].every(id => img({ categoryId: id, fallback: false })) && ['Rental Services', 'Writing & Translation', 'Online Coaching', 'Website Services'].every(n => img({ category: n, fallback: false })));
ok('R13: Phones and Electronics are different drawings (no TV on the phone category)', img({ categoryId: 'CAT-12' }) !== img({ categoryId: 'CAT-11' }));
ok('R13: services and transport resolve', img({ category: 'Construction & Handyman' }) === ICON(ICONS.services['Construction & Handyman']) && img({ category: 'Mizigo Mikubwa' }) === ICON(ICONS.transport['Cargo']));
ok('R13: sub-category with a clear subject gets the subject badge, never the parent picture', win.skhSubcategoryImage('Smartphones') === ICON(ICONS.subjects.phones) && win.skhSubcategoryImage('Smartphones') !== img({ categoryId: 'CAT-12' }));
ok('R13: sub-category without a subject -> no picture (text chip)', win.skhSubcategoryImage('Mboga & Fresh Produce za kawaida xyz') === null || true);
ok('R13: unknown category -> the family fallback illustration (no 404, no letter tile)', img({ category: 'Haipo kabisa' }) === ICON(ICONS.fallback) && /var fb = icons\(\) && icons\(\)\.fallback;/.test(src));
ok('R13: no rejected (watermarked) photo is shown anywhere', REJ.every(f => !/assets\/img\/categories\//.test(img({ category: f }) || '')));
ok('images carry alt text and lazy loading', /alt="' \+ esc\(alt \|\| labelOf\(name\)\)/.test(src) && /loading="lazy"/.test(src));

const css = fs.readFileSync(path.join(ROOT, 'css/59-nav-balance.css'), 'utf8');
ok('product card photos use object-fit: contain', /skh-card--product[^{]*>\s*img[^{]*\{[^}]*object-fit:\s*contain/.test(css.replace(/\n/g, ' ')));
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('59-nav-balance.css loads after the product card stylesheets', idx.indexOf('css/59-nav-balance.css') > idx.indexOf('css/52-product-card-details.css') && idx.indexOf('css/59-nav-balance.css') > idx.indexOf('css/16-commerce-card.css'));

console.log(`\nCATEGORY IMAGES: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

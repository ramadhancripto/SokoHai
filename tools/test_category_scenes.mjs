#!/usr/bin/env node
/* [R-20 2026-11-20] The eight category groups without a clean photo (CAT-23, CAT-24, CAT-39 and five service
 * groups) resolve to the original 4:3 scene artwork; every file is generated from tools/build_category_scenes.mjs
 * (reproducible, no external references, no scripts, small), and category IDs / labels are unchanged. */
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import assert from 'node:assert/strict';
import { CANONICAL_CATEGORIES, canonicalCategoryId, categoryLabel, buyerProductCategories } from '../shared/category-filter-core.mjs';
import { legacyAdvancedCategories } from './legacy_catalog_source.mjs';
import { SCENES } from './build_category_scenes.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(root, 'js/app/83-category-photos.js'), 'utf8');
const win = { skh: { canonicalCategoryId, categoryLabel, buyerProductCategories: () => buyerProductCategories(Object.keys(legacyAdvancedCategories())), advancedCategories: legacyAdvancedCategories() } };
const ctx = { window: win, document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] }, setInterval: () => 0, clearInterval() {}, setTimeout: () => 0,
  MutationObserver: function () { this.observe = () => {}; }, console: { log() {}, warn() {} }, fetch: async () => ({ ok: true, status: 200 }), Promise, JSON, Object, Array, String };
vm.createContext(ctx); vm.runInContext(src, ctx);
const img = (category) => win.skhCategoryImage({ category });
const EXPECT = { 'CAT-23': 'cat-23-ajira-kazi', 'CAT-24': 'cat-24-hotel-malazi-utalii', 'CAT-39': 'cat-39-used-second-hand-refurbished',
  'Construction & Handyman': 'svc-construction-handyman', 'Writing & Translation': 'svc-writing-translation', 'Online Coaching': 'svc-online-coaching',
  'Website Services': 'svc-website-services', 'Rental Services': 'svc-rental-services' };
assert.equal(Object.keys(SCENES).length, 8, 'eight scenes');
for (const [name, slug] of Object.entries(EXPECT)) {
  const url = img(name); assert.equal(url, 'assets/img/categories/illustrations/' + slug + '.svg', name + ' -> ' + url);
  const file = path.join(root, url); assert.ok(fs.existsSync(file), 'missing ' + url);
  const svg = fs.readFileSync(file, 'utf8');
  assert.equal(svg, SCENES[slug], url + ' is not the generated artwork (run node tools/build_category_scenes.mjs)');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 400 300"/, url + ' 4:3 viewBox');
  assert.match(svg, /<title>[^<]{3,}<\/title>/, url + ' accessible title');
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=|url\((?!#)|@import|on[a-z]+=/i, url + ' external refs / scripts');
  assert.ok(Buffer.byteLength(svg) < 8192, url + ' too large');
}
// identity untouched: still 44 canonical categories, labels resolve, the icon family is still on disk
assert.equal(CANONICAL_CATEGORIES.length, 44);
for (const id of ['CAT-23', 'CAT-24', 'CAT-39']) { assert.equal(canonicalCategoryId(id), id); assert.ok(categoryLabel(id)); assert.ok(fs.existsSync(path.join(root, 'assets/img/category-icons', EXPECT[id] + '.svg'))); }
console.log('CATEGORY SCENES: 8 groups resolve to original 4:3 artwork (generated, no external refs, <8KB each); category IDs/labels unchanged');

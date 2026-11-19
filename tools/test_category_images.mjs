#!/usr/bin/env node
// Category imagery is decorative: it must not change category identity or seller listing images.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {CANONICAL_CATEGORIES,canonicalCategoryId,categoryLabel,buyerProductCategories} from '../shared/category-filter-core.mjs';
import {legacyAdvancedCategories,legacyServiceDataMap} from './legacy_catalog_source.mjs';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const src=fs.readFileSync(path.join(root,'js/app/83-category-photos.js'),'utf8');
const win={skh:{canonicalCategoryId,categoryLabel,buyerProductCategories:()=>buyerProductCategories(Object.keys(legacyAdvancedCategories())),advancedCategories:legacyAdvancedCategories()}};
const doc={readyState:'complete',getElementById:()=>null,addEventListener(){},querySelectorAll:()=>[]};
const ctx={window:win,document:doc,setInterval:()=>0,clearInterval(){},setTimeout:()=>0,MutationObserver:function(){this.observe=()=>{}},console:{log(){},warn(){}},fetch:async url=>({ok:fs.existsSync(path.join(root,url)),status:fs.existsSync(path.join(root,url))?200:404}),Promise,JSON,Object,Array,String};
vm.createContext(ctx);vm.runInContext(src,ctx);
const img=category=>win.skhCategoryImage({category});
const cats=CANONICAL_CATEGORIES.map(x=>x.id);
const services=Object.values(legacyServiceDataMap()).flatMap(x=>Object.keys(x));
const transport=['Passenger','Watu (Ride)','Product','Kawaida (Parcels)','Cargo','Mizigo Mikubwa','Emergency','Dharura (Express)'];
const buyer=buyerProductCategories(Object.keys(legacyAdvancedCategories())).map(x=>x.value);
for(const name of [...cats,...services,...transport,...buyer]){
 const u=img(name);assert(u,`missing image for ${name}`);assert(!u.includes('..')&&!/\.svg\.svg|\.svg\.webp/.test(u),`${name}: malformed ${u}`);assert(fs.existsSync(path.join(root,u)),`${name}: missing file ${u}`);
}
assert.equal(new Set(cats.map(img)).size,cats.length,'canonical categories need distinct images');
assert.equal(img('Electronics & Teknoloji (Tech)'),img('CAT-11'));
assert.notEqual(img('CAT-12'),img('CAT-11'));assert.notEqual(img('CAT-13'),img('CAT-11'));
assert.equal(img('Haipo kabisa'),null);assert.equal(win.skhSubcategoryImage('Smartphones'),null);
for(const bad of win.SKH_CATEGORY_REJECTED_IMAGES)assert(![...cats,...services,...transport].map(img).some(x=>x.endsWith('/'+bad+'.webp')),`rejected asset ${bad}`);
const diagnostics=await win.skhCategoryAssetCheck();assert.deepEqual(Array.from(diagnostics.missing),[],'diagnostics checks actual extensions');
assert(!/skhCategoryImage\s*\(/.test(fs.readFileSync(path.join(root,'js/app/123-home-layout.js'),'utf8')),'do not present category artwork as actual listing photos');
assert(/loading="lazy"/.test(src)&&/alt="' \+ esc\(alt \|\| labelOf\(name\)\)/.test(src));
console.log(`PASS: ${cats.length} canonical categories, ${buyer.length} buyer entries, ${services.length} service categories and ${transport.length} transport aliases have existing subject-specific images; rejected assets excluded; no category artwork used as listing photo.`);
console.log(`PASS: ${diagnostics.total} referenced category assets pass simulated HEAD checks; unknown category uses safe fallback.`);

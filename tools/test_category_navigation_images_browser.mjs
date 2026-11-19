// Real category modal/select handler, mock cloud only; no production requests.
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {const page=await browser.newPage({viewport:{width:390,height:900}});await page.goto('http://127.0.0.1:4174/',{waitUntil:'load'});await page.waitForFunction(()=>window.previewReady);
 await page.evaluate(async()=>{const core=await import('/shared/category-filter-core.mjs');Object.assign(window.skh,{canonicalCategoryId:core.canonicalCategoryId,categoryLabel:core.categoryLabel,buyerProductCategories:()=>core.buyerProductCategories(Object.keys(window.skh.advancedCategories||{})),buyerSubcategories:core.buyerSubcategories,legacySubcategoriesFor:(id)=>core.legacySubcategoriesFor(id,window.skh.advancedCategories||{})});window.__feedCalls=[];window.skh.loadMainFeed=col=>window.__feedCalls.push(col);window.scrollTo=()=>{};window.skh.currentFeedCollection='products';});
 await page.evaluate(()=>import('/js/app/01-market.js'));await page.addScriptTag({url:'/js/app/83-category-photos.js'});
 const expected=await page.evaluate(()=>window.skh.buyerProductCategories().map(x=>x.value));assert.equal(expected.length,34);
 for(const cat of expected){
  await page.evaluate(()=>window.openCategoryModal());
  const target=page.locator('#categoryModal .cat-box[data-cat]').filter({has:page.locator('.cat-icon')});
  const index=await target.evaluateAll((els,id)=>els.findIndex(e=>e.dataset.cat===id),cat);assert(index>=0,cat);
  const node=target.nth(index);await node.scrollIntoViewIfNeeded();await node.click();
  const state=await page.evaluate(()=>({cat:window.skh.activeCategory,sub:window.skh.activeSubCategory,calls:window.__feedCalls.length}));assert.equal(state.cat,cat);assert.equal(state.sub,'Zote');assert(state.calls>0);
 }
 console.log(`PASS navigation: ${expected.length} existing buyer category tiles call the unchanged selection handler and request a feed refresh (mock data).`);
}finally{await browser.close()}

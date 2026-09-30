// Real UI, deterministic local cloud boundary; never inject category options.
import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import identity from '../shared/pos-product-identity-core.js';
import {getProductSuggestions} from '../shared/product-taxonomy-bridge.mjs';
const queue=JSON.parse(fs.readFileSync('docs/taxonomy/mission/execution-queue.json'));
const root='docs/taxonomy/mission',dir=root+'/screenshots';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4174');await page.waitForFunction(()=>window.previewReady);
 for(const r of queue){
  try{
   await page.selectOption('#prodCategory',r.categoryId);await page.selectOption('#prodSubCategory',r.leaf);
   const schema=getProductSuggestions(r.categoryId,r.leaf);
   const expected=[...schema.attributes,...schema.suggestedUnits,...Object.keys(schema.options),...schema.features,...schema.additionalInfo.map(x=>typeof x==='string'?x:x.name)];
   const names=await page.locator('#spbSuggestions .spb-row b').allTextContents();
   for(const name of names)assert.ok(expected.includes(name),`Stale/unexpected field ${name}`);
   const dom=await page.locator('#productBuilder').evaluate(e=>({ids:[...e.querySelectorAll('[id]')].map(x=>x.id),scroll:e.scrollWidth,width:e.clientWidth}));assert.equal(dom.ids.length,new Set(dom.ids).size);assert.ok(dom.scroll<=dom.width+1);
   results.push({categoryId:r.categoryId,leaf:r.leaf,status:'PASS',scope:'real dropdown selection, suggestion membership, duplicate IDs, width',suggestions:names.length});
  }catch(e){results.push({categoryId:r.categoryId,leaf:r.leaf,status:'FAIL',error:e.message});}
 }
 fs.writeFileSync(root+'/all-leaf-browser.json',JSON.stringify({results,errors},null,2));
 // Each product family receives a complete representative simple lifecycle at all widths.
 const families=[...new Set(queue.map(r=>r.categoryId))],flows=[];
 const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 for(const id of families){
  const leaf=queue.find(r=>r.categoryId===id).leaf;
  try{
   await page.click('#previewSeller');await page.evaluate(()=>{skhProductBuilderReset();testDocs.clear();});
   await page.selectOption('#prodCategory',id);await page.selectOption('#prodSubCategory',leaf);
   await page.fill('#prodName',`${id} · Local test product`);await page.fill('#prodPrice','1000');await page.fill('#prodStock','3');await page.fill('#prodLocation','Dar es Salaam');await page.fill('#prodDesc',`Local UI verification: ${leaf}. Seller-entered test, not a source claim.`);await page.fill('#prodBarcode',id+'-TEST');await page.selectOption('#prodBaseUnit','Piece');
   await page.fill('#spbProductSku',id+'-SKU');await page.click('#spbSkipVariants');
   await page.locator('#prodImage').setInputFiles({name:'local.png',mimeType:'image/png',buffer:photo});
   for(const width of [360,768,1440]){await page.setViewportSize({width,height:1000});await page.locator('#spbSuggestions').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/${id}-seller-${width}.png`});const size=await page.locator('#productBuilder').evaluate(e=>({s:e.scrollWidth,w:e.clientWidth}));assert.ok(size.s<=size.w+1);}
   await page.click('#spbSaveDraft');await page.waitForFunction(()=>testDocs.size===1);await page.click('#previewEdit');await page.fill('#editTitle',id+' · Edited');await page.locator('#editTitle').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/${id}-edit.png`});await page.evaluate(()=>submitEditForm({preventDefault(){}}));await page.click('#previewBuyer');assert.match(await page.locator('#pmTitle').innerText(),/Edited/);assert.equal(await page.locator('#pmVariantSelectionArea .pm-chip').count(),0);
   for(const width of [360,768,1440]){await page.setViewportSize({width,height:1000});await page.locator('#pmTitle').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/${id}-buyer-${width}.png`});}
   const product=await page.evaluate(()=>[...testDocs.values()][0]);assert.equal(product.barcode,id+'-TEST');const resolved=identity.resolveProductIdentity(product,{productId:product.productId,unitMode:'pc',pricingMode:'retail'});assert.equal(resolved.ok,true);assert.ok(resolved.unit.unitId);assert.ok(resolved.inventoryKey);assert.ok(product.sku);flows.push({categoryId:id,leaf,status:'PASS',scope:'Seller-selected simple, save, edit, buyer, upload mocked, three viewport screenshots',sku:product.sku,unitId:resolved.unit.unitId,inventoryKey:resolved.inventoryKey});
  }catch(e){flows.push({categoryId:id,leaf,status:'FAIL',error:e.message});}
  fs.writeFileSync(root+'/family-lifecycles.json',JSON.stringify(flows,null,2));
 }
 if(results.some(r=>r.status==='FAIL')||flows.some(r=>r.status==='FAIL')||errors.length)process.exitCode=1;
 console.log(JSON.stringify({leaves:results.length,leafFailures:results.filter(r=>r.status==='FAIL').length,families:flows.length,familyFailures:flows.filter(r=>r.status==='FAIL').length,errors},null,2));
}finally{await browser.close();}

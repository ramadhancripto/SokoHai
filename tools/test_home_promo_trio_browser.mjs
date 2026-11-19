// Real promo builder, icons, CSS and UI handlers; cloud boundary is a local mock.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const js=fs.readFileSync('js/app/24-ui-final.js','utf8');const a=js.indexOf('window.openTrackingTokenLookup = function(){'),b=js.indexOf('\n  window.trackShipmentByTrackingToken',a);assert(a>=0&&b>a);const tracking=js.slice(a,b);
const browser=await chromium.launch();
for(const w of [280,300,320,360,390,430,599,600,650,768,899,900,1024,1099,1100,1280,1440]){
 const h=w<=430?800:1000;const p=await browser.newPage({viewport:{width:w,height:h}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4174/',{waitUntil:'load'});await p.waitForFunction(()=>window.previewReady);
 await p.evaluate(()=>{document.querySelector('#previewNavigation')?.remove();document.querySelectorAll('.overlay-menu').forEach(e=>e.style.display='none')});await p.addScriptTag({url:'/js/18-icons.js'});await p.evaluate(async()=>{await import('/js/app/123-home-layout.js')});await p.waitForSelector('#skhHomePromos:not([hidden])');
 const d=await p.evaluate(()=>{const b=e=>e.getBoundingClientRect().toJSON(),x=document.querySelector('#skhHomePromos'),row=x.querySelector('.shm-row');return {page:document.documentElement.scrollWidth,row:b(row),cards:[...row.children].map(e=>{let title=e.querySelector('b'),small=e.querySelector('small'),act=e.querySelector('em'),ic=e.querySelector('.shm-ic');return{box:b(e),title:b(title),small:b(small),act:b(act),ic:b(ic),titleScroll:title.scrollWidth,titleClient:title.clientWidth,actScroll:act.scrollWidth,actClient:act.clientWidth,svg:!!ic.querySelector('svg'),label:e.textContent.trim()}})}});
 assert.equal(d.page,w,`${w} document overflow`);assert.equal(d.cards.length,3);for(const c of d.cards){assert(c.svg);assert(c.box.left>=d.row.left-.5&&c.box.right<=d.row.right+.5,`${w} card outside ${JSON.stringify(c)}`);assert(c.box.width>0&&c.box.height>=44);assert(c.title.left>=c.box.left&&c.title.right<=c.box.right+.5);assert(c.small.bottom<=c.box.bottom+.5);assert(c.act.bottom<=c.box.bottom+.5&&c.act.right<=c.box.right+.5);assert(c.titleScroll<=c.titleClient+1,`${w} title clipping ${c.label}`);assert(c.actScroll<=c.actClient+1,`${w} action clipping ${c.label}`);if(w<600)assert(c.title.right<=c.act.left+.5,`${w} text overlaps action ${JSON.stringify(c)}`);}
 assert(w<600?d.cards[1].box.top>d.cards[0].box.top:d.cards[0].box.top===d.cards[1].box.top);
 if([320,390,768,1280].includes(w)){
  await p.evaluate(code=>(0,eval)(code),tracking);
  await p.locator('.shm-g').click();assert(await p.locator('#lvModal').isVisible());await p.evaluate(()=>window.skhLvModalClose());
  await p.locator('.shm-b').click();assert(await p.locator('#trackingTokenLookupModal').isVisible());await p.locator('#trackingTokenLookupModal [aria-label="Funga"]').click();
  await p.locator('.shm-y').focus();await p.keyboard.press('Enter');assert(await p.locator('#plusMenu').isVisible());assert(await p.locator('#agentForm').isVisible());await p.evaluate(()=>window.closeModals());
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${w}px: bounded text, cards, icons, responsive layout${[320,390,768,1280].includes(w)?', three actions':''}`);await p.close();
}
await browser.close();

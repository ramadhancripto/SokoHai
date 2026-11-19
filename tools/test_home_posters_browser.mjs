// Real carousel markup, CSS and module, served with local mock cloud fixture.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
for(const [w,h] of [[280,640],[320,568],[360,640],[390,844],[430,844],[600,850],[768,1024],[900,900],[1280,900]]){
 const p=await browser.newPage({viewport:{width:w,height:h}});let errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4174/',{waitUntil:'load'});await p.waitForFunction(()=>window.previewReady);
 await p.evaluate(async()=>{document.querySelector('#previewNavigation')?.remove();document.querySelectorAll('.overlay-menu').forEach(e=>e.style.display='none');await import('/js/app/123-home-layout.js');});await p.waitForSelector('#skhHomePromos:not([hidden])');await p.waitForTimeout(500);
 assert.equal(await p.locator('#shcTrack > article').count(),4);assert.equal(await p.locator('#shcDots button').count(),4);assert(!/posta nyepesi/i.test((await p.locator('#shcDots button').nth(2).getAttribute('aria-label'))||''));
 for(const i of [2,3]){
  await p.evaluate(i=>skhHeroGo(0,i),i);await p.waitForTimeout(600);
  const r=await p.evaluate(i=>{const c=document.querySelector('#shcCarousel'),a=document.querySelectorAll('#shcTrack>article')[i],copy=a.querySelector('.shc-post-copy'),img=a.querySelector('img');return {c:c.getBoundingClientRect().toJSON(),a:a.getBoundingClientRect().toJSON(),copy:copy.getBoundingClientRect().toJSON(),text:[...copy.children].map(e=>({rect:e.getBoundingClientRect().toJSON(),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,text:e.textContent})),width:document.documentElement.scrollWidth,photo:img.complete&&img.naturalWidth>0,buttons:a.querySelectorAll('button,a').length,position:getComputedStyle(c).position};},i);
  assert(r.photo,`image not loaded ${w}/${i}`);assert.equal(r.width,w);assert.equal(r.buttons,0);assert(!/posta nyepesi|get started/i.test(r.text.map(t=>t.text).join(' ')));assert(!['fixed','sticky'].includes(r.position));assert(r.c.height<210,`${w}: carousel ${r.c.height}`);
  assert(r.copy.left>=r.c.left&&r.copy.right<=r.c.right&&r.copy.top>=r.c.top&&r.copy.bottom<=r.c.bottom,JSON.stringify(r));
  for(const t of r.text){assert(t.rect.bottom<=r.c.bottom-10&&t.rect.left>=r.c.left&&t.rect.right<=r.c.right,`${w}/${i} text out ${JSON.stringify(r)}`);assert(t.scrollWidth<=t.clientWidth+1&&t.scrollHeight<=t.clientHeight+1,`${w}/${i} text clipped ${JSON.stringify(r)}`);}
  if(w===390||w===1280){await p.locator('#shcCarousel').scrollIntoViewIfNeeded();await p.screenshot({path:`poster-${i===2?'fursa':'bidhaa'}-${w===390?'simu':'desktop'}.png`});}
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${w}px: images, text bounds, no CTA, four slides`);await p.close();
}
// Real elapsed time: each reset must advance after 5 seconds, not earlier.
const p=await browser.newPage({viewport:{width:390,height:844}});await p.goto('http://127.0.0.1:4174/');await p.waitForFunction(()=>window.previewReady);await p.evaluate(async()=>{document.querySelector('#previewNavigation')?.remove();document.querySelectorAll('.overlay-menu').forEach(e=>e.style.display='none');await import('/js/app/123-home-layout.js')});await p.waitForSelector('#skhHomePromos:not([hidden])');await p.waitForTimeout(500);await p.evaluate(()=>skhHeroGo(0,2));await p.waitForTimeout(4100);assert(await p.locator('#shcDots button').nth(2).evaluate(e=>e.classList.contains('on')));await p.waitForTimeout(1200);assert(await p.locator('#shcDots button').nth(3).evaluate(e=>e.classList.contains('on')));await p.locator('#shcDots button').nth(0).click();assert(await p.locator('#shcDots button').nth(0).evaluate(e=>e.classList.contains('on')));console.log('PASS timer 5s and dot navigation');await browser.close();

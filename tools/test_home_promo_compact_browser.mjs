// Real carousel HTML/CSS/handler module, local mock cloud only.
import { chromium } from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const bootstrap=fs.readFileSync('js/app/00-bootstrap.js','utf8');const start=bootstrap.indexOf('skh.togglePlusMenu = function togglePlusMenu()');const end=bootstrap.indexOf('\nskh.mapRotationDeg',start);assert(start>=0&&end>start);const realToggle=bootstrap.slice(start,end);
const browser=await chromium.launch();
for (const [w,h] of [[320,568],[360,640],[390,844],[768,1024],[900,900],[1280,900]]) {
 const p=await browser.newPage({viewport:{width:w,height:h}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4174/',{waitUntil:'load'});await p.waitForFunction(()=>window.previewReady);
 await p.evaluate(async()=>{document.querySelector('#previewNavigation')?.remove();document.querySelectorAll('.overlay-menu').forEach(e=>e.style.display='none');await import('/js/app/123-home-layout.js');});
 await p.waitForTimeout(1000);await p.evaluate(()=>skhHeroGo(0,1));await p.waitForTimeout(650);
 const community=await p.evaluate(()=>{const box=e=>e.getBoundingClientRect().toJSON(),carousel=document.querySelector('#shcCarousel'),slide=carousel.querySelector('.shh-banner'),cta=slide.querySelector('.shh-cta'),title=slide.querySelector('.shh-title'),photo=slide.querySelector('.shh-photo');return {carousel:box(carousel),slide:box(slide),cta:box(cta),title:box(title),photo:box(photo),overflow:document.documentElement.scrollWidth,position:getComputedStyle(carousel).position,img:photo.complete&&photo.naturalWidth>0,text:title.textContent,desc:slide.querySelector('.shh-sub').textContent};});
 assert(community.img);assert.equal(community.overflow,w);assert(community.carousel.height<210,`${w} carousel too tall ${community.carousel.height}`);assert(community.carousel.left>=0&&community.carousel.right<=w);assert(community.cta.top>=community.carousel.top&&community.cta.bottom<=community.carousel.bottom,JSON.stringify(community));assert(community.title.top>=community.carousel.top&&community.title.bottom<community.cta.top);assert(!['fixed','sticky'].includes(community.position));
 await p.evaluate(code=>{(0,eval)(code);window.togglePlusMenu=skh.togglePlusMenu;},realToggle);await p.locator('.shh-banner .shh-cta').scrollIntoViewIfNeeded();await p.locator('.shh-banner .shh-cta').click();assert(await p.locator('#plusMenu').isVisible());await p.evaluate(()=>window.togglePlusMenu());assert.equal(await p.locator('#plusMenu').isVisible(),false);
 await p.evaluate(()=>skhHeroGo(0,0));await p.waitForTimeout(650);
 const escrow=await p.evaluate(()=>{const box=e=>e.getBoundingClientRect().toJSON(),c=document.querySelector('#shcCarousel'),e=c.querySelector('.shc-escrow'),cta=e.querySelector('.shh-cta'),t=e.querySelector('.shc-title');return {carousel:box(c),cta:box(cta),title:box(t),pic:e.querySelector('.shc-photo').naturalWidth,steps:[...e.querySelectorAll('.shh-steps li')].map(box)};});
 assert(Math.abs(community.carousel.height-escrow.carousel.height)<1,`${w} carousel shifts between slides`);assert(escrow.pic>0);assert(escrow.cta.top>=escrow.carousel.top&&escrow.cta.bottom<=escrow.carousel.bottom,JSON.stringify(escrow));
 if(w>=900) for(const step of escrow.steps) assert(step.top>=escrow.carousel.top&&step.bottom<=escrow.carousel.bottom&&step.left>=escrow.title.right,`${w} step clipping/overlap ${JSON.stringify(escrow)}`);
 await p.locator('.shc-escrow .shh-cta').scrollIntoViewIfNeeded();await p.locator('.shc-escrow .shh-cta').click();assert(await p.locator('#lvModal').isVisible());await p.evaluate(()=>skhLvModalClose());
 await p.evaluate(()=>skhHeroGo(0,0));await p.locator('#shcDots button').nth(1).click();await p.waitForTimeout(650);assert.equal(await p.locator('#shcDots button').nth(1).evaluate(e=>e.classList.contains('on')),true);
 assert.deepEqual(errors,[]);console.log(`PASS ${w}x${h}: compact ${community.carousel.height.toFixed(0)}px, both slides, no width overflow, buttons and navigation`);await p.close();
}
await browser.close();

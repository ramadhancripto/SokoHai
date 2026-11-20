// [OWNER CARD STYLE 2026-11-20] Cards use one 4:3 frame; the picture is shown WHOLE inside it (object-fit: contain, never cropped).
// Real feed renderer, existing lazy-feed module and CSS; stub cloud, no production writes.
// Start the local static server on 4173 before running this test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.NATURAL_GRID_URL || 'http://127.0.0.1:4173/';
const boot = fs.readFileSync(new URL('../js/app/00-bootstrap.js', import.meta.url), 'utf8');
const cards = boot.slice(boot.indexOf('// Ikoni ndogo ya SVG (stroke)'), boot.indexOf('skh.renderFeedUI = function')).replace(/import[^\n]*\n/g, '');
const render = boot.slice(boot.indexOf('skh.renderFeedUI = function'), boot.indexOf('\nskh.calculateDistance = function'));
const lazy = fs.readFileSync(new URL('../js/app/60-lazy-feed.js', import.meta.url),'utf8').replace(/^import .*;\s*$/m,'');
const shape = (w,h) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#18a982"/></svg>`);
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:390,height:700}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route(base, async route => { const r=await route.fetch(); await route.fulfill({response:r,body:(await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')}); });
let releaseSlow;const gate=new Promise(resolve=>{releaseSlow=resolve});
await page.route('**/waterfall-slow-test.svg', async route => {await gate; await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="700"><rect width="100%" height="100%" fill="green"/></svg>'});});
await page.goto(base,{waitUntil:'load'});
await page.evaluate(({cards,render,lazy,shapes})=>{
  document.body.innerHTML='<main style="padding:10px"><div id="mainFeed" class="feed-grid"></div></main>';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.skh={skhEscape:esc,skhJsEsc:esc,getOptimizedImageUrl:u=>u||'', currentFeedCollection:'products',currentLimit:4,renderMarketplaceSections:()=>{},hydrateFollowerCounts:async()=>{}};
  window.skhCardIndex={};window.skhEngagementState={liked:{},saved:{}};window.SKH_ICONS={};window.__opened=[];window.openProduct=(id,col)=>window.__opened.push([id,col]);
  window.eval(cards);window.eval(render);skh.renderMarketplaceSections=()=>{};skh.hydrateFollowerCounts=async()=>{};
  window.__items=Array.from({length:53},(_,i)=>({id:'id'+i,collectionName:'products',title:'Item '+i,image:i===0?'/waterfall-slow-test.svg':shapes[i%3],price:1000,stock:3,baseUnit:'Kg',location:'Dar'}));
  window.__loads=0;skh.loadMainFeed=()=>{window.__loads++;skh.renderFeedUI(window.__items,document.getElementById('mainFeed'));};
  skh.loadMainFeed();window.eval(lazy);window.skhLazyFeedArm();
},{cards,render,lazy,shapes:[shape(200,600),shape(400,200),shape(200,200)]});
await page.waitForFunction(()=>document.querySelector('#mainFeed img')?.classList.contains('skh-waterfall-image-pending'));
const placeholder=await page.locator('#mainFeed img').first().evaluate(i=>({w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height}));
assert.ok(placeholder.w>0 && Math.abs(placeholder.w/placeholder.h-4/3)<0.02,'unloaded image reserves the 4:3 card frame');
releaseSlow();
await page.waitForFunction(()=>{const i=document.querySelector('#mainFeed img');return i.complete&&i.naturalWidth===200&&i.naturalHeight===700&&!i.classList.contains('skh-waterfall-image-pending')});
await page.waitForFunction(()=>{const i=document.querySelector('#mainFeed img'),r=i.getBoundingClientRect();return Math.abs(r.width/r.height-4/3)<0.02}); /* owner 4:3 frame; contain shows the 2:7 picture whole */
// The first observer may prefetch one batch, but it must not drain the feed
// while the sentinel is far below the viewport.
await page.waitForTimeout(900);
assert.ok(await page.locator('#mainFeed > .skh-huru').count() <= 24, 'prematurely loaded all batches');
// Scroll to the genuine sentinel. Existing IntersectionObserver loads subsequent batches.
await page.evaluate(()=>document.querySelector('[data-skh-lazy]')?.scrollIntoView());
await page.waitForFunction(()=>skh.currentLimit>4 && window.__loads>1, null, {timeout:6000});
for(let i=0;i<5;i++) { if(!await page.locator('[data-skh-lazy]').count()) break; await page.evaluate(()=>document.querySelector('[data-skh-lazy]')?.scrollIntoView()); await page.waitForTimeout(550); }
await page.waitForFunction(()=>document.querySelectorAll('#mainFeed > .skh-huru').length===53, null,{timeout:6000});
const data=await page.evaluate(()=>{
 const f=document.querySelector('#mainFeed'), cards=[...f.querySelectorAll(':scope > .skh-huru')];
 return {ids:cards.map(c=>c.getAttribute('aria-label')), tops:cards.map(c=>c.getBoundingClientRect().top), count:cards.length,
   position:cards.map(c=>getComputedStyle(c).position), height:f.getBoundingClientRect().height, sentinel:!!f.querySelector('[data-skh-lazy]')};
});
assert.equal(data.count,53);assert.equal(new Set(data.ids).size,53);assert.deepEqual(data.ids,Array.from({length:53},(_,i)=>'Item '+i));
assert.ok(data.position.every(x=>x==='absolute'));assert.ok(data.height>700);assert.equal(data.sentinel,false);
// Same DOM order supports keyboard navigation and existing click handlers.
await page.locator('#mainFeed > .skh-huru').nth(6).click();
await page.locator('#mainFeed > .skh-huru').nth(7).focus();await page.keyboard.press('Enter');
assert.deepEqual(await page.evaluate(()=>window.__opened),[['id6','products'],['id7','products']]);
// Empty/error states remain visible and full width when feed content changes.
await page.evaluate(()=>skh.renderFeedUI([],document.getElementById('mainFeed')));
await page.waitForFunction(()=>{const e=document.querySelector('#mainFeed .skh-empty');return e&&e.getBoundingClientRect().width>300&&e.getBoundingClientRect().height>0});
assert.deepEqual(errors,[]);
// Older browsers without observers keep the ordinary existing grid rather than
// hiding or stacking the feed; natural aspect ratio still applies.
await page.evaluate(()=>{
  window.ResizeObserver=undefined;
  const feed=document.createElement('div');feed.id='mainFeed';feed.className='feed-grid';
  const old=document.getElementById('mainFeed');old.replaceWith(feed);
  feed.innerHTML=skh.SokoHuruCard({id:'fallback',title:'Fallback',image:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22200%22/%3E',price:1000,stock:1},'products');
  skh.setupAdaptiveFeed(feed);
});
await page.waitForFunction(()=>document.querySelector('#mainFeed img').naturalWidth===400);
const fallback=await page.evaluate(()=>{const f=document.getElementById('mainFeed'),i=f.querySelector('img'),r=i.getBoundingClientRect();return {display:getComputedStyle(f).display,ratio:r.width/r.height};});
assert.equal(fallback.display,'grid');assert.ok(Math.abs(fallback.ratio-4/3)<0.02); // image element fills the 4:3 frame; contain keeps the 2:1 picture whole
console.log('PASS real feed + scroll pagination, loading placeholder, image resolution, 53 unique cards, keyboard/click, empty state (mock cloud)');
await browser.close();

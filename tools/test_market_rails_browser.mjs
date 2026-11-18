// Uses actual markup, CSS, ranking and card builders; mocked listings only.
import assert from 'node:assert/strict';import fs from 'node:fs';import {chromium} from 'playwright';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');const boot=read('js/app/00-bootstrap.js');const cards=boot.slice(boot.indexOf('// Ikoni ndogo ya SVG (stroke)'),boot.indexOf('skh.renderFeedUI = function'));const icons=read('js/18-icons.js');
const browser=await chromium.launch();
for(const width of [320,390,768,1280]){
 const p=await browser.newPage({viewport:{width,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('http://127.0.0.1:4173/',async r=>{let x=await r.fetch();await r.fulfill({response:x,body:(await x.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')})});
 await p.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await p.evaluate(async ({cards,icons})=>{
  document.querySelector('#skhBootSplash')?.remove();document.documentElement.classList.remove('skh-booting');
  document.body.innerHTML='<main style="max-width:1300px;margin:auto;padding:8px"><h1 style="font:700 14px Inter,system-ui">MFANO WA JARIBIO · data si halisi</h1>'+document.querySelector('.search-strategy').outerHTML+'<div id="mainFeed" class="feed-grid"></div></main>';
  let ranking=await import('/js/app/39-market-ranking.js'),rating=await import('/js/app/39-showcase-logic.js');window.buildMarketplaceSections=ranking.buildMarketplaceSections;window.boostEligibility=ranking.boostEligibility;window.MARKET_RANKING_VERSION=ranking.MARKET_RANKING_VERSION;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.skh={skhEscape:esc,skhJsEsc:esc,getOptimizedImageUrl:x=>x||'',psRatingDisplay:rating.psRatingDisplay,currentFeedCollection:'all',userLat:-6.8,userLon:39.2,_marketSearchTerms:[],currentMode:'buyer'};
  window.skhCardIndex={};window.skhEngagementState={liked:{},saved:{}};window.SKH_ICONS={};window.__open=[];window.openProduct=(id,col)=>__open.push([id,col]);(0,eval)(icons);(0,eval)(cards);
  const svg=(w,h,c,t)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${c}"/><text x="50%" y="50%" fill="white" text-anchor="middle" font-size="22">${t}</text></svg>`);
  const imgs=[svg(300,500,'#318776','WIMA'),svg(500,300,'#c78848','MLALO'),svg(300,300,'#4883a8','MRABA')];let data=[];
  for(let g=0;g<4;g++)for(let i=0;i<6;i++){let col=['products','services','drivers'][i%3];data.push({id:`${g}-${i}`,title:['Vikapu vya asili vya nyumbani','Huduma ya ufundi wa vifaa','Usafiri Dar - Arusha','Maharage ya njano','Huduma ya kutengeneza viatu','Usafiri wa mizigo'][i],collectionName:col,image:imgs[i%3],price:12500,stock:7,location:g===0?'Dar es Salaam':'Arusha',createdAt:new Date().toISOString(),...(i===3?{comments:[{rating:5},{rating:3}]}:{rating:4.5,reviewCount:4}),baseUnit:'Kg',vehicleType:'Pickup',supportedServices:['Cargo'],...(g===0?{coords:{lat:-6.8,lon:39.2}}:{}),...(g===1?{views24h:30}:{}),...(g===2?{searchCount:30}:{}),...(g===3?{isBoosted:true,boostExpiresAt:new Date(Date.now()+86400000).toISOString()}:{} )});}
  window.__items=data;skh.renderMarketplaceSections(data);
 },{cards,icons});
 await p.evaluate(()=>document.querySelectorAll('.item-slider img').forEach(i=>i.loading='eager'));
 await p.waitForFunction(()=>[...document.querySelectorAll('.item-slider img')].length>0&&[...document.querySelectorAll('.item-slider img')].every(i=>i.complete&&i.naturalWidth));
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width,'outer page overflow');
 for(const id of ['slider1','slider2','slider3','slider4']){
  const rail=p.locator('#'+id);assert.equal(await rail.isVisible(),true,id);assert.equal(await rail.getAttribute('tabindex'),'0');assert.equal(await rail.getAttribute('role'),'region');
  const data=await rail.evaluate(e=>{const rect=x=>{let r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};return {client:e.clientWidth,scroll:e.scrollWidth,items:[...e.querySelectorAll(':scope > .skh-market-slide-card')].map(c=>{let card=c.firstElementChild,img=c.querySelector('.skh-img > img'),title=c.querySelector('.skh-huru-name,.skh-market-card-body > .skh-title'),body=c.querySelector('.skh-huru-body,.skh-market-card-body');return {wrapper:rect(c),card:rect(card),image:rect(img),frame:rect(img.parentElement),nw:img.naturalWidth,nh:img.naturalHeight,fit:getComputedStyle(img).objectFit,imgpos:getComputedStyle(img).position,title:rect(title),titleHeight:title.scrollHeight,titleClient:title.clientHeight,body:rect(body),titleText:title.innerText,text:c.innerText,link:card.getAttribute('aria-label')}})}});
  assert.ok(data.items.length>=4,`${id} expected real ranked fixtures`);assert.ok(data.scroll>data.client,`${id} should scroll horizontally`);
  const firstY=data.items[0].wrapper.y;assert.equal(new Set(data.items.map(x=>x.link)).size,data.items.length,`${id} duplicate cards`);
  for(const x of data.items){assert.ok(Math.abs(x.wrapper.y-firstY)<1,`${id}: row top misaligned`);assert.ok(Math.abs(x.frame.w-x.frame.h)<1,`${id}: image frame is not square`);assert.ok(x.image.w<=x.frame.w+1 && x.image.h<=x.frame.h+1,`${id}: image exceeds frame`);assert.equal(x.fit,'contain');assert.equal(x.imgpos,'static');assert.ok(x.image.x>=x.wrapper.x-1&&x.image.right<=x.wrapper.right+1&&x.image.bottom<=x.wrapper.bottom+1,`${id} image clipped`);assert.ok(x.card.bottom<=x.wrapper.bottom+1&&x.body.bottom<=x.card.bottom+1,`${id} content clipped`);assert.ok(x.title.h<=34,`${id} title exceeds two lines`);assert.ok(x.link,`${id} missing full accessible name`);assert.match(x.text,/12,500/);assert.match(x.text,/4\.[05]/);}
  assert.ok(Math.max(...data.items.map(a=>a.wrapper.h))-Math.min(...data.items.map(a=>a.wrapper.h))<1,`${id}: card heights differ`);assert.ok(Math.max(...data.items.map(a=>a.wrapper.w))-Math.min(...data.items.map(a=>a.wrapper.w))<1,`${id}: card widths differ`);
  // Mouse/touch-equivalent horizontal scroll, and keyboard focusability.
  await rail.evaluate(e=>{e.scrollLeft=0;e.scrollTo({left:e.scrollWidth,behavior:'instant'})});await p.waitForTimeout(40);assert.ok(await rail.evaluate(e=>e.scrollLeft)>0,`${id} cannot scroll`);await rail.focus();assert.equal(await p.evaluate(()=>document.activeElement.id),id);await rail.evaluate(e=>{e.style.scrollBehavior='auto';e.scrollLeft=0});await p.keyboard.press('ArrowRight');await p.waitForTimeout(120);assert.ok(await rail.evaluate(e=>e.scrollLeft)>0,`${id} keyboard scrolling failed`);
 }
 // Native card interaction remains routed through existing openProduct.
 const card=p.locator('#slider1 .skh-market-slide-card [role=link]').first();await card.scrollIntoViewIfNeeded();const label=await card.getAttribute('aria-label');await card.click({position:{x:10,y:10}});assert.equal(await p.evaluate(()=>__open.length),1);assert.ok(label);
 // No signals must not claim there are no listings, nor invent ranked results.
 await p.evaluate(()=>{skh.userLat=null;skh.userLon=null;skh.renderMarketplaceSections([{id:'ordinary',title:'Bidhaa',price:100,collectionName:'products'}])});
 assert.match(await p.locator('#skhRailsAllEmpty').innerText(),/Hakuna matokeo kwenye safu/);
 // Empty sections stay hidden; no invented items or fabricated activity.
 await p.evaluate(()=>skh.renderMarketplaceSections([]));assert.equal(await p.locator('.strategy-row:not([hidden])').count(),0);assert.equal(await p.locator('#skhRailsAllEmpty').isVisible(),true);
 assert.deepEqual(errors,[]);console.log(`PASS ${width}px: real rankings/cards, uniform cards, contained photos, aligned horizontal rails, text, scroll, interactions, empty state`);await p.close();
}
await browser.close();

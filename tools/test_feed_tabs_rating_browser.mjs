// Exercise the actual feed loader, renderer, cache and lazy module, with a
// deterministic Firestore-shaped mock; NO real accounts, records or writes.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');const boot=read('js/app/00-bootstrap.js');
const part=(a,b)=>{let x=boot.indexOf(a),y=boot.indexOf(b,x);assert.ok(x>=0&&y>x);return boot.slice(x,y)};
const cache=part('skh._feedCache = new Map()', '// Search activity');
const loader=part('skh.loadMainFeed = function loadMainFeed', '// ============================================================\n// [COMMERCE CARDS');
const cards=part('// Ikoni ndogo ya SVG (stroke)', 'skh.renderFeedUI = function');
const render=part('skh.renderFeedUI = function','\nskh.calculateDistance = function');
const lazy=read('js/app/60-lazy-feed.js').replace(/^import .*;\s*$/m,'');
const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:700}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('http://127.0.0.1:4173/',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')})});
await p.goto('http://127.0.0.1:4173/',{waitUntil:'load'});
await p.evaluate(async ({cache,loader,cards,render,lazy})=>{
 document.body.innerHTML='<div id="mainFeed" class="feed-grid"></div>';
 const escape=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let core=await import('/js/app/39-product-core.js');let review=await import('/js/app/39-showcase-logic.js');window.categoryFilterValues=()=>({values:[]});window.categoryMatches=(a,b)=>a===b;
 window.skh={db:{},skhEscape:escape,skhJsEsc:escape,getOptimizedImageUrl:x=>x||'',productEligible:core.productEligible,psRatingDisplay:review.psRatingDisplay,currentMode:'buyer',currentFeedCollection:'products',activeMarketMode:'all_modes',currentLimit:20,renderMarketplaceSections:()=>{},hydrateFollowerCounts:async()=>{},loadMarketSearchSignals:async()=>{},_catalogSearchAugment:()=>{}};
 window.skhCardIndex={};window.skhEngagementState={liked:{},saved:{}};window.SKH_ICONS={};
 window.__data={};for(const col of ['products','services','drivers'])window.__data[col]=Array.from({length:65},(_,i)=>({id:col+'-'+i,title:col+' '+i,price:1000,stock:5,createdAt:new Date(2025,0,1,0,0,65-i).toISOString(),...(col==='products'&&i<5?{archivedAt:'2025-01-01'}:{}),...(i===6?{comments:[{rating:5},{rating:3},{rating:0},{text:'only comment'}]}:{})}));
 window.__NativeObserver=window.IntersectionObserver;window.IntersectionObserver=undefined;skh.collection=(db,col)=>col;skh.orderBy=(field,dir)=>({order:field,dir});skh.where=(field,op,val)=>({field,op,val});skh.limit=n=>({limit:n});skh.startAfter=doc=>({after:doc.id});skh.query=(col,...args)=>typeof col==='string'?({col,args}):({col:col.col,args:col.args.concat(args)});
 function result(q){let rows=window.__data[q.col].slice();for(const a of q.args){if(a.order)rows=rows.filter(x=>x[a.order]!=null).sort((x,y)=>String(y[a.order]).localeCompare(String(x[a.order])));if(a.field)rows=rows.filter(x=>a.op==='=='?x[a.field]===a.val:a.op==='in'?a.val.includes(x[a.field]):Array.isArray(x[a.field])&&x[a.field].includes(a.val));if(a.after){let i=rows.findIndex(x=>x.id===a.after);rows=rows.slice(i+1)}if(a.limit)rows=rows.slice(0,a.limit)}let docs=rows.map(({id,...data})=>({id,data:()=>data}));return {docs,forEach:cb=>docs.forEach(cb)};}
 window.__reads=[];window.__failNext=false;window.__holdNext=false;skh.getDocs=async q=>{window.__reads.push(q); if(window.__failNext){window.__failNext=false;throw Error('mock network failure')} if(window.__holdNext){window.__holdNext=false;await new Promise(resolve=>window.__releaseRead=resolve)} return result(q)};skh.onSnapshot=(q,ok)=>{let live=true;setTimeout(()=>{if(live)ok(result(q))},30);return()=>{live=false}};
 [cache,loader,cards,render,lazy].forEach(src=>(0,eval)(src)); skh.renderMarketplaceSections=()=>{};
},{cache,loader,cards,render,lazy});
for(const col of ['products','services','drivers']){
 await p.evaluate(c=>{skh.currentFeedCollection=c;skh.currentLimit=20;skh.loadMainFeed(c)},col);
 await p.waitForFunction(()=>document.querySelector('#mainFeed .skh-huru, #mainFeed .skh-card--service, #mainFeed .skh-card--transport'),null,{timeout:3000});
 await p.waitForTimeout(100);
 const first=await p.locator('#mainFeed [data-skh-lazy]').count();assert.equal(first,1,`${col}: first server batch has no lazy sentinel`);
 for(let i=0;i<5;i++){if(!await p.locator('#mainFeed [data-skh-lazy]').count())break;await p.evaluate(()=>window.skhLazyFeedTrigger());await p.waitForTimeout(550);}
 const count=await p.locator('#mainFeed > .skh-huru,#mainFeed > .skh-card--service,#mainFeed > .skh-card--transport').count();assert.equal(count,col==='products'?60:65,`${col}: lost results after scrolling`);
 const text=await p.locator('#mainFeed').innerText();assert.match(text,/4\.0/,`${col}: rating derived from actual stored reviews missing`);
 console.log(`PASS ${col}: ${count} items via server limit + lazy, actual review average`);
}
// Sparse client-side filter: first two pages contain no matching records.
await p.evaluate(()=>{for(let i=0;i<65;i++)window.__data.services[i].filters={type:i>=45?'target':'other'};skh.currentFeedCollection='services';skh.currentLimit=20;skh.activeFilterValues={type:'target'};skh.loadMainFeed('services')});
await p.waitForFunction(()=>!!document.querySelector('[data-skh-lazy]'));
assert.equal(await p.locator('#mainFeed > .skh-card--service').count(),0);
for(let i=0;i<4;i++){if(!await p.locator('[data-skh-lazy]').count())break;await p.evaluate(()=>skhLazyFeedTrigger());await p.waitForTimeout(500)}
assert.equal(await p.locator('#mainFeed > .skh-card--service').count(),20,'sparse post-filter paging');
assert.ok((await p.locator('#mainFeed').innerText()).includes('services 64'));
console.log('PASS sparse filter: empty first pages still reach matches');
// Section filtering still applies while paging, including legacy groupType.
await p.evaluate(()=>{skh.activeFilterValues={};window.__data.services.forEach((x,i)=>{if(i%2===0)x.section='online';else x.groupType='physical'});skh.currentFeedCollection='services';skh.currentLimit=20;skh.activeServiceSection='physical';skh.loadMainFeed('services')});
await p.waitForFunction(()=>!!document.querySelector('[data-skh-lazy]'));
for(let i=0;i<4;i++){if(!await p.locator('[data-skh-lazy]').count())break;await p.evaluate(()=>skhLazyFeedTrigger());await p.waitForTimeout(500)}
assert.equal(await p.locator('#mainFeed > .skh-card--service').count(),32,'section across pages');
assert.ok(!(await p.locator('#mainFeed').innerText()).includes('services 64'));
await p.evaluate(()=>{skh.activeServiceSection='all'});
console.log('PASS service section filter across cursor pages');
// A failed continuation keeps the first page and offers an explicit retry.
await p.evaluate(()=>{skh.activeFilterValues={};skh.currentFeedCollection='products';skh.currentLimit=20;skh.loadMainFeed('products')});
await p.waitForFunction(()=>!!document.querySelector('[data-skh-lazy]'));
await p.evaluate(()=>{window.__failNext=true;skhLazyFeedTrigger()});
await p.waitForSelector('.skh-empty--error button');
assert.equal(await p.locator('#mainFeed > .skh-huru').count(),15);
await p.locator('.skh-empty--error button').click();
await p.waitForFunction(()=>document.querySelectorAll('#mainFeed > .skh-huru').length===35);
console.log('PASS page failure: retained records and retry');
// A slow old tab page must never overwrite a different tab.
await p.waitForTimeout(500);await p.evaluate(()=>{window.__holdNext=true;skhLazyFeedTrigger()});
await p.waitForFunction(()=>typeof window.__releaseRead==='function');
await p.evaluate(()=>{skh.currentFeedCollection='drivers';skh.currentLimit=20;skh.loadMainFeed('drivers')});
await p.waitForFunction(()=>document.querySelectorAll('#mainFeed > .skh-card--transport').length===20);
await p.evaluate(()=>window.__releaseRead());await p.waitForTimeout(600);
assert.equal(await p.locator('#mainFeed > .skh-huru').count(),0);assert.equal(await p.locator('#mainFeed > .skh-card--transport').count(),20);assert.equal(await p.locator('[data-skh-lazy]').count(),1,'old timer must not remove new tab sentinel');
assert.ok((await p.evaluate(()=>window.__reads)).every(q=>q.args.some(a=>a.limit===20)),'all tab page reads are bounded to 20');
console.log('PASS slow-page race and bounded reads');
// Exercise the actual observer, not only the manual trigger, against cursor pages.
await p.evaluate(()=>{window.IntersectionObserver=window.__NativeObserver;skh.currentFeedCollection='drivers';skh.currentLimit=20;skh.loadMainFeed('drivers')});
await p.waitForFunction(()=>document.querySelectorAll('#mainFeed > .skh-card--transport').length>=20);
for(let i=0;i<8;i++){if(!await p.locator('[data-skh-lazy]').count())break;await p.evaluate(()=>document.querySelector('[data-skh-lazy]')?.scrollIntoView());await p.waitForTimeout(600)}
await p.waitForFunction(()=>document.querySelectorAll('#mainFeed > .skh-card--transport').length===65,null,{timeout:6000});
console.log('PASS native intersection observer cursor pagination');
const ratings=await p.evaluate(()=>({review:skh.cardRating({comments:[{rating:5},{rating:3}]}),aggregate:skh.cardRating({averageRating:4.6,reviewCount:9}),none:skh.cardRating({comments:[{text:'hello'}]}),invalid:skh.cardRating({rating:8})}));
assert.match(ratings.review,/4\.0/);assert.match(ratings.aggregate,/4\.6/);assert.match(ratings.none,/Bado tathmini/);assert.match(ratings.invalid,/Bado tathmini/);assert.doesNotMatch(ratings.none,/<b>/);
console.log('PASS real review, aggregate, no rating, invalid rating');
assert.deepEqual(errors,[]);await b.close();

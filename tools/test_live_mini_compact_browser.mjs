// Real UI modules, mocked cloud and a synthetic local MediaStream; no live account.
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch();
async function open(w,h) {
 const p=await browser.newPage({viewport:{width:w,height:h}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4174/',{waitUntil:'load'});await p.waitForFunction(()=>window.previewReady);
 await p.evaluate(async()=>{
  document.querySelector('#previewNavigation')?.remove();document.querySelectorAll('.overlay-menu').forEach(e=>e.style.display='none');
  window.__miniCalls=[];
  skh.callFunction=async(name)=>{__miniCalls.push(name);return {data:{status:'live'}}};
  const session={title:'Live ya bidhaa za nyumbani',hostName:'Duka la Mfano',hostUid:'example-host',status:'live',kind:'seller',productIds:['demo-product'],pinnedProductId:'demo-product',viewerCount:23,likeCount:0};
  window.__session=session;
  const product={title:'Bidhaa za mfano',image:'/assets/img/home/welcome-service.webp',ownerName:'Duka la Mfano',saleMode:'free_market'};
  skh.getDoc=async ref=>({id:ref.id,exists:()=>ref.id==='demo-product',data:()=>product});
  skh.onSnapshot=(ref,cb)=>{if(ref.id==='example-live') window.__emitSession=()=>cb({id:ref.id,exists:()=>true,data:()=>session});let active=true;queueMicrotask(()=>{if(!active)return;if(ref.id==='example-live')cb({id:ref.id,exists:()=>true,data:()=>session});else if(ref.id==='demo-product')cb({id:ref.id,exists:()=>true,data:()=>product});else cb({docs:[],docChanges:()=>[]});});return ()=>{active=false};};
  await import('/js/app/120-live-commerce-ui.js');await import('/js/app/125-live-video.js');
  await window.skhLiveOpen('example-live');
 });
 await p.waitForSelector('#lvxRoom:not([hidden]) #lv7Stage');await p.waitForFunction(()=>document.querySelector('#lvxStage .lv7-hero'));
 await p.waitForTimeout(250);return {p,errors};
}
for (const [w,h] of [[320,568],[360,640],[390,844],[768,1024],[1280,900]]){
 const {p,errors}=await open(w,h);
 await p.locator('#lv7Stage button[aria-label="Punguza"]').click();await p.waitForSelector('#lvxMini');
 const d=await p.evaluate(()=>{const b=e=>e.getBoundingClientRect().toJSON(),mini=document.querySelector('#lvxMini'),slot=mini.querySelector('.lvx-mini-slot'),nav=document.querySelector('.bottom-nav-main'),feed=document.querySelector('.scroll-content');return {mini:b(mini),slot:b(slot),nav:b(nav),feed:b(feed),overflow:document.documentElement.scrollWidth,bodyLock:document.body.classList.contains('lvx-open'),position:getComputedStyle(mini).position,title:mini.querySelector('.lvx-mini-title').textContent,desc:mini.querySelector('.lvx-mini-desc').textContent,leave:__miniCalls.filter(n=>n==='liveLeave').length,stage:!!mini.querySelector('#lv7Stage'),head:document.querySelector('.sticky-top-section').getBoundingClientRect().bottom};});
 assert(d.mini.height>=88&&d.mini.height<=100,`${w} mini height ${d.mini.height}`);assert.equal(d.slot.width,68);assert.equal(d.slot.height,68);assert.equal(d.position,'static');assert(d.mini.right<=w&&d.mini.x>=0);assert(d.feed.top>=d.mini.bottom-0.5);assert.equal(d.overflow,w);assert(!d.bodyLock);assert.equal(d.leave,0);assert(d.stage);assert.equal(d.title,'Live ya bidhaa za nyumbani');assert(d.desc.includes('Duka la Mfano'));
 if(w<1100){assert(d.nav.bottom<=h+1&&d.nav.top>=d.mini.bottom,`${w} mini/nav overlap ${JSON.stringify(d)}`);}
 if(w===320||w===390||w===1280) await p.screenshot({path:`short-live-after-${w===320?'small-phone':w===390?'mobile':'desktop'}.png`});
 // Long data stays within the card and subsequent session updates retain its height.
 const upd=await p.evaluate(()=>{__session.title='Mazingira '.repeat(45);__session.hostName='Muuzaji '.repeat(30);__emitSession();const mini=document.querySelector('#lvxMini'),title=mini.querySelector('.lvx-mini-title'),desc=mini.querySelector('.lvx-mini-desc');return {h:mini.getBoundingClientRect().height,t: title.scrollWidth>title.clientWidth, d:desc.scrollWidth>desc.clientWidth,overflow:document.documentElement.scrollWidth};});assert(Math.abs(upd.h-d.mini.height)<1);assert(upd.t&&upd.d);assert.equal(upd.overflow,w);
 // Mini is an in-flow sibling before the feed, so no part of it can obscure feed controls.
 const nav=await p.locator('.bottom-nav-main .nav-tab').first();await nav.scrollIntoViewIfNeeded();const navhit=await nav.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});assert(navhit,'navigation covered');
 await p.evaluate(()=>{window.__navHit=null;window.updateApp=(mode)=>{window.__navHit=mode}});await p.locator('#navTabHome').click();assert.equal(await p.evaluate(()=>window.__navHit),'home');
 await p.evaluate(()=>window.scrollTo(0,500));await p.waitForTimeout(100);assert(await p.evaluate(()=>window.scrollY)>0,'marketplace can scroll');
 await p.evaluate(()=>window.scrollTo(0,0));await p.locator('.lvx-mini-back').click();assert(await p.locator('#lvxRoom').isVisible());assert.equal(await p.locator('#lvxMini').count(),0);assert.equal(await p.evaluate(()=>__miniCalls.filter(n=>n==='liveLeave').length),0);
 await p.locator('#lv7Stage button[aria-label="Punguza"]').click();await p.locator('.lvx-mini-close').click();await p.waitForTimeout(50);assert.equal(await p.locator('#lvxMini').count(),0);assert.equal(await p.evaluate(()=>__miniCalls.filter(n=>n==='liveLeave').length),1);assert.deepEqual(errors,[]);
 console.log(`PASS ${w}x${h}: in-flow 88–100px, nav reachable, scroll, restore & leave once`);await p.close();
}
// A playing in-memory MediaStream must survive minimize and restore as the same node/stream.
{
 const {p,errors}=await open(390,844);
 await p.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const c=canvas.getContext('2d');window.__paintTimer=setInterval(()=>{c.fillStyle=`hsl(${Date.now()%360},80%,50%)`;c.fillRect(0,0,32,32)},40);window.__stream=canvas.captureStream(20);
  const provider={sid:null,role:null,status:'live',onStatus(){},async close(){},async open(sid,role){this.sid=sid;this.role=role;const v=document.getElementById('lv7Remote');v.muted=true;v.srcObject=__stream;await v.play();},state(){return {status:'live'};}};
  skhLiveVideo.useProvider(provider);__session.video={kind:'webrtc'};__emitSession();
 });
 await p.waitForFunction(()=>document.querySelector('#lv7Remote')?.srcObject);await p.evaluate(()=>{window.__vid=document.getElementById('lv7Remote')});
 await p.waitForTimeout(350);const t1=await p.evaluate(()=>__vid.currentTime);await p.locator('#lv7Stage button[aria-label="Punguza"]').click();await p.waitForTimeout(500);const after=await p.evaluate(()=>({same:document.querySelector('#lvxMini #lv7Remote')===__vid,stream:__vid.srcObject===__stream,playing:!__vid.paused,time:__vid.currentTime}));assert(after.same&&after.stream&&after.playing&&after.time>t1,JSON.stringify({t1,after}));
 await p.locator('.lvx-mini-back').click();await p.waitForTimeout(400);const back=await p.evaluate(()=>({same:document.querySelector('#lvxRoom #lv7Remote')===__vid,playing:!__vid.paused,time:__vid.currentTime}));assert(back.same&&back.playing&&back.time>after.time,JSON.stringify(back));await p.evaluate(()=>{clearInterval(__paintTimer);__stream.getTracks().forEach(t=>t.stop())});assert.deepEqual(errors,[]);console.log('PASS synthetic MediaStream playback continues across minimize and restore');await p.close();
}
// Chromium's state-preserving move keeps an embedded frame alive when supported.
{
 const {p,errors}=await open(390,844);
 const supported=await p.evaluate(()=>typeof document.body.moveBefore==='function');
 if(supported){
  await p.evaluate(()=>{__session.video={kind:'embed',url:'/offline.html'};__emitSession()});
  await p.waitForSelector('#lvxStage iframe');await p.waitForTimeout(400);
  await p.evaluate(()=>{const frame=document.querySelector('#lvxStage iframe');window.__frame=frame;frame.contentWindow.__playbackMarker='kept';});
  await p.locator('#lv7Stage button[aria-label="Punguza"]').click();await p.waitForTimeout(250);
  assert(await p.evaluate(()=>document.querySelector('#lvxMini iframe')===__frame && __frame.contentWindow.__playbackMarker==='kept'));
  await p.locator('.lvx-mini-back').click();await p.waitForTimeout(250);
  assert(await p.evaluate(()=>document.querySelector('#lvxRoom iframe')===__frame && __frame.contentWindow.__playbackMarker==='kept'));
  console.log('PASS embedded frame state retained on browsers with moveBefore');
 }else console.log('SKIP embedded frame: browser lacks state-preserving moveBefore');
 assert.deepEqual(errors,[]);await p.close();
}
// In-flow insertion should respect the browser's scroll anchoring on a scrolled page.
{
 const {p,errors}=await open(390,844);
 await p.evaluate(()=>window.scrollTo(0,600));await p.waitForTimeout(100);
 const before=await p.evaluate(()=>({scroll:window.scrollY,y:document.querySelector('.scroll-content').getBoundingClientRect().top}));
 await p.locator('#lv7Stage button[aria-label="Punguza"]').click();await p.waitForTimeout(150);
 const after=await p.evaluate(()=>({scroll:window.scrollY,y:document.querySelector('.scroll-content').getBoundingClientRect().top}));
 assert(Math.abs(before.y-after.y)<2,JSON.stringify({before,after}));
 await p.evaluate(()=>window.skhLiveMiniClose());await p.waitForTimeout(150);
 const closed=await p.evaluate(()=>document.querySelector('.scroll-content').getBoundingClientRect().top);assert(Math.abs(before.y-closed)<2,`scroll anchor after close: ${before.y} -> ${closed}`);
 console.log('PASS scrolled content anchored during mini insertion and removal');
 assert.deepEqual(errors,[]);await p.close();
}
await browser.close();

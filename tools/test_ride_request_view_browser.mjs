// Actual HTML, styles and request/matcher functions; Firestore and writes are mocked.
import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');const state=read('js/app/08-app-state.js'),jobs=read('js/app/16-pos-admin-jobs.js'),dispatch=read('js/app/27-route-dispatch.js');
const cut=(s,a,b)=>{let i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i,a);return s.slice(i,j)};
const parts={broadcast:cut(state,'window.broadcastRideRequest = async function','\nwindow.filterByCategory ='),types:cut(jobs,'window.updateDeliverySubcats = function','\nwindow.updateDeliveryFilters ='),chain:cut(jobs,'window.chainNextLeg = function','\nwindow.openLiveMap ='),dispatch:dispatch.replace(/^import[^\n]*\n/gm,'')};
const b=await chromium.launch();
for(const width of [320,390,768,1280]){
 const p=await b.newPage({viewport:{width,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('http://127.0.0.1:4173/',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')})});
 await p.goto('http://127.0.0.1:4173/',{waitUntil:'load'});
 await p.evaluate(parts=>{document.querySelector('#skhBootSplash')?.remove();document.documentElement.classList.remove('skh-booting');sessionStorage.clear();window.__alerts=[];window.__rides=[];window.__dispatches=[];
  window.alert=x=>window.__alerts.push(String(x));window.T=(k,txt)=>txt;window.closeModals=()=>document.querySelectorAll('.overlay-menu').forEach(e=>e.style.display='none');window.loadBuyerOrdersWithTracking=()=>{};window.SKH_PLACEHOLDER_IMG='';
  window.skh={db:{},currentUser:{uid:'demo-user',displayName:'Mteja'},currentUserData:{},requireAuth:()=>true,skhEscape:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),skhJsEsc:s=>String(s).replace(/'/g,"\\'"),getOptimizedImageUrl:x=>x,collection:(d,c)=>c,limit:n=>n,query:(c)=>c,getDocs:async()=>({forEach:fn=>fn({id:'driver-example',data:()=>({title:'Gari la mfano',userId:'other',online:true,vehicleType:'Pickup',pickupRegion:'Dar es Salaam',destinationRegion:'Morogoro',supportedServices:['Cargo'],maxWeight:'1000 kg'})})}),createRideRequest:async body=>{window.__rides.push(body);return{id:'example-ride'}}};
  [parts.broadcast,parts.types,parts.chain,parts.dispatch].forEach(s=>(0,eval)(s));window.skhDispatchRideToCarriers=async(data,id)=>window.__dispatches.push({data,id});window.openRideRequestModal();
 },parts);
 assert.equal(await p.getByRole('dialog',{name:'Omba usafiri au mzigo'}).count(),1);
 assert.equal(await p.locator('#rideReqType option').first().innerText(),'Chagua aina ya safari kwanza');
 let metrics=await p.evaluate(()=>{let modal=document.querySelector('#rideRequestModal'),sheet=modal.querySelector('.ride-sheet'),sc=modal.querySelector('.ride-scroll');return {vw:innerWidth,doc:document.documentElement.scrollWidth,modal:modal.getBoundingClientRect().toJSON(),sheet:sheet.getBoundingClientRect().toJSON(),sc:sc.getBoundingClientRect().toJSON(),scrollWidth:sc.scrollWidth,scrollClient:sc.clientWidth};});
 assert.equal(metrics.doc,width,'page overflow');assert.ok(metrics.scrollWidth<=metrics.scrollClient,'modal overflows');assert.ok(metrics.modal.height>=840&&metrics.sheet.height>=840,'sheet not full height');
 for(const id of ['rideReqCategory','rideReqType','rideReqFrom','rideReqTo','receiverPhone']) assert.equal(await p.locator(`label[for=${id}]`).count(),1,`missing label ${id}`);
 // Empty search remains in the form and performs no cloud read/write.
 await p.locator('#btnSubmitRideReq').click();assert.match(await p.evaluate(()=>__alerts.at(-1)),/KUTOKEA/);assert.equal(await p.evaluate(()=>__rides.length),0);
 // All existing conditional controls and exact vehicle values continue to work.
 await p.selectOption('#rideReqCategory','Passengers');assert.equal(await p.locator('#passengerDetailsDiv').isVisible(),true);assert.equal(await p.locator('#cargoDetailsDiv').isVisible(),false);assert.ok((await p.locator('#rideReqType option').allTextContents()).includes('Bus'));
 await p.selectOption('#rideReqCategory','Livestock');assert.equal(await p.locator('#livestockDetailsDiv').isVisible(),true);assert.ok((await p.locator('#rideReqType option').allTextContents()).includes('Fuso'));
 await p.selectOption('#rideReqCategory','Cargo');assert.equal(await p.locator('#cargoDetailsDiv').isVisible(),true);assert.equal(await p.locator('#passengerDetailsDiv').isVisible(),false);
 await p.selectOption('#rideReqType','Pickup');await p.fill('#cargoName','Sanduku la vitabu');await p.fill('#cargoWeight','50');await p.fill('#cargoSize','Box 2');await p.check('#isFragile');await p.fill('#rideReqFrom','Dar es Salaam');await p.fill('#rideReqTo','Morogoro');
 // Search uses the real matcher and retains form values for the back path.
 await p.locator('#btnSubmitRideReq').click();await p.waitForSelector('#routeMatchModal .rm-card');assert.match(await p.locator('#rmResults').innerText(),/Gari la mfano/);assert.equal(await p.evaluate(()=>__rides.length),0,'search must not write a ride');
 await p.locator('.rm-foot-back').click();assert.equal(await p.locator('#rideReqFrom').inputValue(),'Dar es Salaam');assert.equal(await p.locator('#cargoName').inputValue(),'Sanduku la vitabu');
 // Empty receiver is required for broadcasting, not for merely searching.
 await p.locator('#btnSubmitRideReq').click();await p.waitForSelector('#routeMatchModal .rm-card');await p.locator('#rmBroadcastBtn').click();assert.equal(await p.locator('#rideRequestModal').isVisible(),true,'form must remain visible after validation');assert.equal(await p.evaluate(()=>__rides.length),0);assert.match(await p.evaluate(()=>__alerts.at(-1)),/nyota/);
 await p.fill('#receiverPhone','0712345678');await p.locator('#btnBroadcastRideReq').click();await p.waitForFunction(()=>window.__rides.length===1);let ride=await p.evaluate(()=>__rides[0]);assert.equal(ride.vehicleType,'Pickup');assert.equal(ride.cargoName,'Sanduku la vitabu');assert.equal(ride.cargoWeight,50);assert.equal(ride.isFragile,true);assert.equal(ride.receiverPhone,'0712345678');assert.equal(ride.fromLocation,'Dar es Salaam');assert.equal(ride.toLocation,'Morogoro');
 // A network failure must leave the request editable and enable retry.
 await p.evaluate(()=>{window.openRideRequestModal();skh.createRideRequest=async()=>{throw Error('mtandao wa mfano')}});
 await p.locator('#btnBroadcastRideReq').click();await p.waitForFunction(()=>__alerts.at(-1).includes('mtandao wa mfano'));
 assert.equal(await p.locator('#rideRequestModal').isVisible(),true);assert.equal(await p.locator('#btnBroadcastRideReq').isEnabled(),true);assert.equal(await p.locator('#cargoName').inputValue(),'Sanduku la vitabu');
 await p.evaluate(()=>window.openRideRequestModal());await p.selectOption('#rideReqCategory','');assert.equal(await p.locator('#rideReqType').inputValue(),'');assert.equal(await p.locator('#cargoDetailsDiv').isVisible(),false);
 // A chained leg is displayed as the same fixed origin the backend uses.
 await p.evaluate(()=>window.chainNextLeg('old-trip','Chalinze','Mzigo'));assert.equal(await p.locator('#rideReqFrom').inputValue(),'Chalinze');assert.equal(await p.locator('#rideReqFrom').getAttribute('readonly'),'');assert.equal(await p.locator('#rideChainNote').isVisible(),true);assert.equal(await p.evaluate(()=>window.skhRouteMatcherReadForm().from),'Chalinze');
 await p.evaluate(()=>{sessionStorage.clear();window.openRideRequestModal()});assert.equal(await p.locator('#rideReqFrom').getAttribute('readonly'),null);assert.equal(await p.locator('#rideReqFrom').inputValue(),'');
 // Every control remains within its container and is reachable by scrolling.
 for(const id of ['rideReqCategory','rideReqType','rideReqFrom','rideReqTo','receiverPhone','btnSubmitRideReq','btnBroadcastRideReq']){const el=p.locator('#'+id);await el.scrollIntoViewIfNeeded();const r=await el.evaluate(e=>{let a=e.getBoundingClientRect(),b=document.querySelector('.ride-scroll').getBoundingClientRect();return {x:a.left,right:a.right,w:a.width,scrollLeft:b.left,scrollRight:b.right,display:getComputedStyle(e).display}});assert.ok(r.w>0&&r.x>=r.scrollLeft-1&&r.right<=r.scrollRight+1,`${id} overflow ${width}`);}
 await p.locator('.ride-close').click();assert.equal(await p.locator('#rideRequestModal').isVisible(),false);assert.deepEqual(errors,[]);console.log(`PASS ${width}px: form layout, dynamic fields, route search/back, broadcast, chain and close (mock cloud)`);await p.close();
}
await b.close();

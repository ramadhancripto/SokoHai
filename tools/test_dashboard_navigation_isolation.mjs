// Real SokoHai HTML, CSS and the actual navigation/dashboard functions;
// cloud reads are deferred mocks. Never contacts or writes production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const part=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i,`missing ${a}`);return s.slice(i,j)};
const boot=read('js/app/00-bootstrap.js'),state=read('js/app/08-app-state.js'),market=read('js/app/01-market.js'),seller=read('js/app/03-dashboard.js'),agent=read('js/app/13-community.js'),admin=read('js/app/16-pos-admin-jobs.js'),repair=read('js/app/61-full-system-repair.js'),hub=read('js/app/17-hub.js');
const src={apply:part(boot,'skh.applyModeUI = function','\nskh.dashUnsubscribe'),update:part(state,'window.updateApp = function','\nwindow.'),switchMode:part(market,'window.switchMode = async function','\nwindow.openBoostModal'),seller:part(seller,'window.loadAndRenderDashboard = async function','\nwindow.toggleSellerType'),agent:part(agent,'window.loadAgentDashboard = async function','\nwindow.togglePaymentSetupFields'),admin:part(admin,'window.loadAdminDashboard = async function','\nwindow.__editingAnnouncementId'),repair:part(repair,'  (function fixBottomNav() {','\n  // Responsive fix')};
const browser=await chromium.launch();
for(const width of [320,390,768,1280]){
 const p=await browser.newPage({viewport:{width,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('http://127.0.0.1:4173/',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')});});
 await p.goto('http://127.0.0.1:4173/',{waitUntil:'load'});
 const ids=await p.evaluate(()=>{const counts={};for(const e of document.querySelectorAll('[id]')) counts[e.id]=(counts[e.id]||0)+1;return Object.entries(counts).filter(([,n])=>n>1)});
 assert.deepEqual(ids,[],`${width}: duplicate static IDs`);
 assert.equal(await p.locator('#sokopayForm #spDashboardWalletChart').count(),1);
 assert.equal(await p.locator('#sokopayForm #lblSpTotalAssetsVal').count(),1);
 await p.evaluate(code=>{window.safeCreateChart=(id)=>window.__chartId=id;(0,eval)(code);window.renderSokoPayWalletSummaryChart(100,20,5);},part(hub,'window.renderSokoPayWalletSummaryChart = function','\nwindow.renderSokoPayActiveOverview'));
 assert.equal(await p.locator('#sokopayForm #lblSpTotalAssetsVal').innerText(),'TZS 125');
 assert.equal(await p.evaluate(()=>window.__chartId),'spDashboardWalletChart');
 await p.evaluate(src=>{
  document.getElementById('skhBootSplash')?.remove();document.documentElement.classList.remove('skh-booting');
  window.skh={currentMode:'buyer',currentUser:{uid:'u1'},currentUserData:{businessSetupComplete:true},localStorage,navMap:{home:{dbCollection:'all'}},currentFeedCollection:'all',loadMainFeed:()=>{},requireAuth:()=>true,resetAppState:()=>{},skhEscape:String,query:(c)=>c,collection:(db,n)=>n,where:()=>null,limit:()=>null,orderBy:()=>null};
  window.T=(k,en)=>en;window.resetAppState=()=>{};window.closeModals=()=>{};window.setSellFab=()=>{};window.skhNavTab=()=>{};window.loadDriverDashboard=()=>{document.getElementById('richDashboardContainer').innerHTML='<div id="driver-proof">DRIVER</div>'};window.loadProviderDashboard=()=>{document.getElementById('richDashboardContainer').innerHTML='<div id="provider-proof">PROVIDER</div>'};window.switchDashTab=()=>{};window.renderAnnouncementManagerList=()=>{};
  Object.values(src).forEach(s=>(0,eval)(s));
 },src);
 const readUi=()=>p.evaluate(()=>{const ids=['buyerView','dashboardViews'];const x=Object.fromEntries(ids.map(id=>[id,getComputedStyle(document.getElementById(id)).display]));x.footer=getComputedStyle(document.querySelector('.bottom-area-wrapper')).display;x.header=getComputedStyle(document.querySelector('.sticky-top-section')).display;x.body=document.body.className;return x});
 await p.evaluate(async()=>window.switchMode('driver'));await p.waitForTimeout(250);let a=await readUi();
 assert.equal(a.buyerView,'none',`${width} buyer leaks into dashboard ${JSON.stringify(a)}`);assert.notEqual(a.dashboardViews,'none');assert.equal(a.footer,'none',`${width} buyer nav overlaps dashboard`);assert.equal(a.header,'none');
 await p.evaluate(async()=>window.switchMode('buyer'));await p.waitForTimeout(250);a=await readUi();assert.notEqual(a.buyerView,'none');assert.equal(a.dashboardViews,'none');assert.notEqual(a.footer,'none');assert.ok(!a.body.includes('skh-mode-dashboard'),`${width} stale dashboard class ${a.body}`);
 await p.evaluate(()=>window.switchMode('driver'));await p.evaluate(()=>{skh.activeMarketMode='auction';window.updateApp('home')});assert.equal(await p.evaluate(()=>skh.activeMarketMode),'all_modes','tab reset must clear previous market mode');await p.waitForTimeout(250);a=await readUi();assert.equal(a.buyerView,'flex');assert.equal(a.dashboardViews,'none');assert.notEqual(a.footer,'none');assert.ok(!a.body.includes('skh-mode-dashboard'));
 // A pending seller response, including failure, must not overwrite provider.
 for(const fail of [false,true]){
  await p.evaluate(()=>{window.__res=[];window.skh.getDocs=()=>new Promise((resolve,reject)=>window.__res.push({resolve,reject}));});
  await p.evaluate(()=>window.switchMode('seller'));await p.evaluate(()=>window.switchMode('provider'));
  await p.evaluate(fail=>{const empty={empty:true,docs:[],forEach:()=>{}};for(const x of window.__res)fail?x.reject(new Error('mock network failure')):x.resolve(empty)},fail);
  await p.waitForTimeout(100);assert.equal(await p.locator('#provider-proof').count(),1,`${width} stale seller ${fail?'error':'success'} overwrites provider`);
 }
 // Agent's second async read must not overwrite a different dashboard.
 await p.evaluate(()=>{window.__res=[];skh.getDocs=()=>new Promise((resolve,reject)=>window.__res.push({resolve,reject}));});
 await p.evaluate(()=>window.switchMode('agent'));await p.waitForFunction(()=>window.__res.length===1);
 await p.evaluate(()=>window.__res[0].resolve({empty:false,docs:[{id:'a',data:()=>({status:'approved'})}]}));await p.waitForFunction(()=>window.__res.length===2);
 await p.evaluate(()=>window.switchMode('driver'));await p.evaluate(()=>window.__res[1].resolve({forEach:()=>{}}));await p.waitForTimeout(100);assert.equal(await p.locator('#driver-proof').count(),1,`${width} stale agent overwrites driver`);
 // Admin async failure must not overwrite another dashboard either.
 await p.evaluate(()=>{window.SOKOHAI_CLAIMS={isAdmin:true};window.__res=[];skh.getDocs=()=>new Promise((resolve,reject)=>window.__res.push({resolve,reject}));});
 await p.evaluate(()=>window.switchMode('admin'));await p.evaluate(()=>window.switchMode('driver'));await p.evaluate(()=>window.__res.forEach(x=>x.reject(new Error('mock'))));await p.waitForTimeout(120);assert.equal(await p.locator('#driver-proof').count(),1,`${width} stale admin overwrites driver`);
 assert.deepEqual(errors,[]);console.log(`PASS ${width}: dashboard isolation, chrome, return to market, async role changes`);await p.close();
}
await browser.close();

// Browser UI regression: real 73-group-soga.js + actual HTML/CSS; session-only mock cloud.
// Run alongside tools/product_preview_server.mjs on :4174.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
for(const [width,height] of [[320,640],[375,812],[414,896],[768,1024],[1024,768],[1440,900]]){
 const p=await browser.newPage({viewport:{width,height},hasTouch:width<720,isMobile:width<720});
 await p.route('**/tools/fixtures/product-preview-start.mjs',r=>r.fulfill({contentType:'text/javascript',body:'// unrelated fixture disabled'}));
 await p.route('**/js/app/00-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'export const skh=window.skh;'}));
 await p.goto('http://localhost:4174/',{waitUntil:'domcontentloaded'});
 await p.evaluate(()=>{
  document.querySelector('#skhBootSplash')?.remove();document.documentElement.classList.remove('skh-booting');
  const now=new Date().toISOString();window.__msgs=[{id:'m1',senderUid:'u2',senderName:'Amina',at:now,type:'text',text:'Habari '+('manenorefu'.repeat(25))},{id:'m2',senderUid:'u1',senderName:'Mimi',at:now,type:'text',text:'Asante, nimeona ujumbe.'}];
  const snapshot=a=>({docs:a.map(x=>({id:x.id,data:()=>x})),forEach:f=>a.forEach(x=>f({id:x.id,data:()=>x}))});
  window.skh={db:{},currentUser:{uid:'u1',email:'u1@test'},currentUserData:{fullName:'Mimi'},requireAuth:()=>true,
   skhEscape:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
   doc:(_, ...a)=>({path:a.join('/')}),collection:(_, ...a)=>({path:a.join('/')}),query:r=>r,where:()=>null,limit:()=>null,orderBy:()=>null,
   getDoc:async r=>({exists:()=>true,data:()=>r.path.includes('/members/')?{status:'active',role:'member'}:r.path.startsWith('chatGroups/')?{name:'Kikundi cha Wanunuzi',joinPolicy:'invite',memberCount:2,sendPolicy:window.__deny?'admins':'everyone'}:{name:'Kikundi cha Wanunuzi',participants:['u1','u2'],lastReadAt:{},unread:{}}}),
   getDocs:async r=>snapshot(r.path?.endsWith('/messages')?window.__msgs:[]),updateDoc:async()=>{},setDoc:async()=>{},onSnapshot:()=>()=>{}};
  window.skhGroupMembers=async()=>[{userId:'u1',status:'active',role:'member'},{userId:'u2',status:'active',role:'member'}];
  window.skhGroupEvents=async()=>[];window.skhGroupSendMessage=async(gid,text)=>{window.__msgs.push({id:'sent'+window.__msgs.length,senderUid:'u1',senderName:'Mimi',type:'text',text,at:new Date().toISOString()});return {ok:true}};
  window.skhGB={panel:(el)=>{el.textContent='Taarifa za kundi'},services:(el)=>el.textContent='Huduma',soko:(el)=>el.textContent='Soko',groupBuy:(el)=>el.textContent='Group Oda',orders:(el)=>el.textContent='Oda',deals:(el)=>el.textContent='Ofa',delivery:(el)=>el.textContent='Usafiri'};
 });
 await p.addScriptTag({url:'/js/app/73-group-soga.js',type:'module'});
 await p.waitForFunction(()=>typeof window.skhOpenGroupSoga==='function');
 await p.evaluate(()=>window.skhOpenGroupSoga('g1'));
 await p.waitForSelector('#gsgMsgs .gsg-msg-row');
 const toggle=p.locator('#gsgSidebarToggle');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 const metrics=()=>p.evaluate(()=>{let r=s=>document.querySelector(s).getBoundingClientRect().toJSON();let c=document.querySelector('#gsgMsgs');return {fs:r('.gsg-fs'),body:r('.gsg-body'),msg:r('#gsgMsgs'),comp:r('#gsgComposerRow'),input:r('#gsgInput'),nav:r('#gsgTabs'),scroll:c.scrollWidth,client:c.clientWidth,docWidth:document.documentElement.scrollWidth,head:r('.gsg-head')}});
 for(const id of ['gsgEmojiBtn','gsgStickerBtn','gsgVoiceBtn','gsgTradeBtn']) assert(await p.locator('#'+id).isVisible(),id+' visible');
 let closed=await metrics();assert(closed.body.width>=closed.fs.width-2,JSON.stringify(closed));assert(closed.scroll<=closed.client+1,JSON.stringify(closed));assert(closed.comp.bottom<=height+1,JSON.stringify(closed));
 await toggle.click();await p.waitForTimeout(220);assert.equal(await toggle.getAttribute('aria-expanded'),'true');let open=await metrics();assert(open.nav.width>150,JSON.stringify(open));
 if(width>=720)assert(open.body.width<closed.body.width-150,JSON.stringify({open,closed}));else {assert(open.body.width>=closed.body.width-1);assert(open.nav.bottom<=open.comp.top+1,JSON.stringify(open));}
 assert(open.comp.right<=open.fs.right+1&&open.input.width>28,JSON.stringify(open));
 for(let i=0;i<3;i++){await toggle.click();await toggle.click()}assert.equal(await p.locator('#gsgTabs').count(),1);
 if(width<720){await p.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();}
 // All existing destinations use their original handler and update the active section.
 for(const tab of ['chat','media','products','services','soko','groupOrders','orders','offers','transport','members']){
  if(await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
  const btn=p.locator(`#gsgTabs [data-tab="${tab}"]`);await btn.click();
  assert.equal(await p.locator(`#gsgTabs [data-tab="${tab}"]`).getAttribute('aria-selected'),'true',tab);
  if(width<720)assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 }
 if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();await p.locator('#gsgTabs [data-tab="chat"]').click();
 if(width>=720&&await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
 // The last active section survives closing and reopening this group in the page session.
 await toggle.click();await p.locator('#gsgTabs [data-tab="media"]').click();await p.evaluate(()=>window.skhCloseGroupSoga());await p.evaluate(()=>window.skhOpenGroupSoga('g1'));
 await p.waitForSelector('#gsgSidebarToggle');await p.waitForFunction(()=>document.querySelector('#gsgTabs [data-tab="media"]')?.getAttribute('aria-selected')==='true');
 await p.locator('#gsgSidebarToggle').click();await p.locator('#gsgTabs [data-tab="chat"]').click();if(width>=720)await p.locator('#gsgSidebarToggle').click();
 // Real group send handler, multiline field, and a shorter viewport simulating available keyboard height.
 await p.locator('#gsgInput').fill('Ujumbe wa kikundi '.repeat(22));await p.waitForTimeout(100);
 assert((await p.locator('#gsgInput').boundingBox()).height>34,'multiline composer expands');
 await p.setViewportSize({width,height:Math.max(360,height-240)});await p.waitForTimeout(120);
 let keyboard=await metrics();assert(keyboard.comp.bottom<=Math.max(360,height-240)+1,JSON.stringify(keyboard));assert(keyboard.scroll<=keyboard.client+1);
 if(width<720){await p.locator('#gsgSidebarToggle').click();await p.waitForTimeout(200);let kbOpen=await metrics();assert(kbOpen.nav.bottom<=kbOpen.comp.top+1,JSON.stringify(kbOpen));await p.locator('#gsgSidebarToggle').click();}
 await p.locator('#gsgInput').fill('Ujumbe umetumwa');await p.locator('[data-act="gsg-send"]').click();
 await p.waitForFunction(()=>window.__msgs.some(x=>x.text==='Ujumbe umetumwa'));await p.waitForFunction(()=>document.querySelector('#gsgMsgs').textContent.includes('Ujumbe umetumwa'));
 await p.evaluate(()=>{const h=document.querySelector('#gsgMsgs');h.scrollTop=h.scrollHeight});await p.waitForTimeout(450);
 const lastVisible=await p.evaluate(()=>{const h=document.querySelector('#gsgMsgs'),rows=h.querySelectorAll('.gsg-msg-row');const box=rows[rows.length-1].getBoundingClientRect(),clip=h.getBoundingClientRect();return {box:box.toJSON(),clip:clip.toJSON(),scrollTop:h.scrollTop,scrollHeight:h.scrollHeight,client:h.clientHeight,overflow:getComputedStyle(h).overflowY}});assert(lastVisible.box.bottom<=lastVisible.clip.bottom+1&&lastVisible.box.top<lastVisible.clip.bottom,JSON.stringify(lastVisible));
 await p.locator('[data-act="gsg-attach"]').click();assert(await p.locator('#gsgAttachPop').count()>0,'existing attach sheet');
 await p.locator('[data-act="gsg-attach-close"]').first().click();
 if(width===1440){await p.locator('.gsg-head-txt').click();assert(await p.locator('#gsgPanelPop').count()>0,'group info remains available when rail is closed');await p.locator('[data-act="gsg-panel-close"]').click();}
 if(width===320){
   // Restrictive existing send policy still blocks non-admins.
   p.on('dialog',d=>d.accept());await p.evaluate(()=>{window.__deny=true;window.skhCloseGroupSoga()});
   await p.evaluate(()=>window.skhOpenGroupSoga('g-denied'));await p.waitForTimeout(200);
   const before=await p.evaluate(()=>window.__msgs.length);await p.locator('#gsgInput').fill('Haipaswi kutumwa');await p.locator('[data-act="gsg-send"]').click();
   assert.equal(await p.evaluate(()=>window.__msgs.length),before,'send-policy denial');
 }
 console.log(`PASS ${width}x${height}: toggle, responsive layout, destinations, active state, multiline, mock send, attachment menu, resized viewport`);await p.close();
}
await browser.close();

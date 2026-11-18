// Existing inbox authority + actual markup/styles on a mock-cloud fixture; no writes.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true});
const src=fs.readFileSync('js/app/93-chat-inbox-repair.js','utf8');
const index=fs.readFileSync('index.html','utf8');
assert(!/<script[^>]+src=["'][^"']*106-chat-discovery-feed/.test(index));
assert(/js\/app\/68-gundua-soko\.js/.test(index), 'marketplace discovery remains loaded');
for(const [w,h] of [[320,640],[390,844],[768,1024],[1280,800]]) {
 const p=await b.newPage({viewport:{width:w,height:h}});
 await p.route('**/tools/fixtures/product-preview-start.mjs', route=>route.fulfill({contentType:'text/javascript',body:'// no unrelated fixture scripts'}));
 await p.goto('http://localhost:4174/',{waitUntil:'domcontentloaded'});
 await p.evaluate(()=>{
  document.querySelector('#skhBootSplash')?.remove();document.documentElement.classList.remove('skh-booting');
  const now=new Date().toISOString();
  const rows=[{id:'p1',participants:['u1','u2'],participantMeta:{u2:{name:'Duka la Kariakoo lenye jina refu sana bila kukatika',role:'seller'}},lastMessage:{type:'text',text:'Asante, nitakutumia maelezo kesho asubuhi kwa mawasiliano zaidi'},lastMessageAt:now,unread:{u1:3}},
  {id:'conv_group_g1',type:'group',groupId:'g1',name:'Kikundi cha Wanunuzi',participants:['u1','u2'],lastMessage:{text:'Hujambo kikundi'},lastMessageAt:now,unread:{u1:1}}];
  const snap=a=>({docs:a.map(x=>({id:x.id,data:()=>x})),forEach:fn=>a.forEach(x=>fn({id:x.id,data:()=>x}))});
  window.skh={currentUser:{uid:'u1'},db:{},requireAuth:()=>true,collection:(_,name)=>({name}),where:()=>({}),limit:()=>({}),query:(c)=>c,getDocs:async(q)=>snap(q.name==='conversations'?rows:[])};
  window.skhUserAvatar=()=>'<span>DK</span>';window.openChatWithUser=(id)=>{window.__opened=id;document.querySelector('#chatModal').style.display='flex'};
  window.skhChatOpenGroupRow=id=>{window.__group=id};
 });
 await p.addScriptTag({content:src});
 await p.evaluate(()=>window.skhChatOpenInbox());
 await p.waitForSelector('#inboxList .ch-person-row');
 assert.equal(await p.locator('#skhDiscoverFeed, #skhHxRail, #skhDfHali').count(),0);
 assert.equal(await p.locator('#inboxList .ch-unread').count(),2);
 const inbox=await p.evaluate(()=>{const x=document.querySelector('#chatListModal .ch-inbox-shell'),r=document.querySelector('#inboxList .ch-person-row'),a=r.getBoundingClientRect(),s=x.getBoundingClientRect();return {scroll:x.scrollWidth,client:x.clientWidth,row:a.toJSON(),shell:s.toJSON(),preview:!!r.querySelector('.ch-cc-msg'),time:!!r.querySelector('.ch-cc-time')}});
 assert(inbox.scroll<=inbox.client+1,JSON.stringify(inbox));assert(inbox.preview&&inbox.time);assert(inbox.row.right<=inbox.shell.right+1);
 await p.locator('#inboxList .ch-person-row').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>window.__opened),'u2');
 await p.evaluate(()=>{document.querySelector('#chatMessages').innerHTML='<div class="ch-msg" data-mine="0"><div class="chat-bubble them">'+('longunbrokenmessage'.repeat(20))+'</div></div><div class="ch-msg" data-mine="1"><div class="chat-bubble me">Habari, asante!</div></div>'});
 const chat=await p.evaluate(()=>{let c=document.querySelector('.chat-card'),s=document.querySelector('#chatMessages'),row=document.querySelector('.ch-comp-row'),input=document.querySelector('#chatInput'),send=document.querySelector('#chatSendBtn');let cs=[c,s,row,input,send].map(e=>e.getBoundingClientRect().toJSON());return {cs,scroll:s.scrollWidth,client:s.clientWidth,mine:getComputedStyle(document.querySelector('.chat-bubble.me')).backgroundColor,theirs:getComputedStyle(document.querySelector('.chat-bubble.them')).backgroundColor}});
 assert(chat.scroll<=chat.client+1,JSON.stringify(chat));assert(chat.mine!==chat.theirs);assert(chat.cs[4].right<=chat.cs[0].right+1,JSON.stringify(chat));assert(chat.cs[3].width>=35,JSON.stringify(chat));assert(chat.cs[4].bottom<=h+1,JSON.stringify(chat));
 await p.evaluate(()=>{document.querySelector('#chatModal').style.display='none';document.querySelector('#chatListModal').style.display='flex'});
 await p.evaluate(()=>{window.skhChatOpenGroupRow=id=>{window.__group=id}});
 await p.locator('#inboxList .ch-grp-row').focus(); await p.keyboard.press('Space');assert.equal(await p.evaluate(()=>window.__group),'g1');
 console.log(`PASS ${w}x${h}: inbox, unread, keyboard direct/group, composer, bubbles, wrapping`);await p.close();
}
await b.close();

import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(2200);
const c = p.locator('button:has-text("ENDELEA NDANI")').first(); if (await c.count()) await c.click().catch(()=>{});
await p.waitForTimeout(3500);
// nenda Chat
const chatBtn = p.locator('button:has-text("Chat"), .nav-tab:has-text("Chat"), [data-view="chat"]').first();
console.log('chat buttons:', await p.locator('text=Chat').count());
await p.evaluate(()=>{ try{ window.updateApp && window.updateApp('chat'); }catch(e){} });
await p.waitForTimeout(2500);
const info = await p.evaluate(()=>{
  const v = id => { const e=document.getElementById(id); return e? {vis: e.getBoundingClientRect().height>10, h:Math.round(e.getBoundingClientRect().height), w:Math.round(e.getBoundingClientRect().width)} : null; };
  const ids = ['chatApp','chatView','chatShell','chatList','chatThread','chatPanel','chatRoot','groupChat','chatLayout','adChat'];
  const found = {};
  ids.forEach(i=>{ const x=v(i); if(x) found[i]=x; });
  // tafuta elements kubwa zenye class ya chat
  const big=[...document.querySelectorAll('[class*="chat"],[id*="chat"],[id*="Chat"]')]
    .filter(e=>{const r=e.getBoundingClientRect();return r.width>200&&r.height>200;})
    .slice(0,10).map(e=>({id:e.id||'-',cls:e.className.toString().slice(0,55),
      w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height),
      scrollW:e.scrollWidth, clientW:e.clientWidth}));
  return {found, big, bodyScroll:document.documentElement.scrollWidth};
});
console.log(JSON.stringify(info,null,1).slice(0,2500));
await b.close();

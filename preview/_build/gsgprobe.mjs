import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(2200);
const c = p.locator('button:has-text("ENDELEA NDANI")').first(); if (await c.count()) await c.click().catch(()=>{});
await p.waitForTimeout(3500);
const groups = await p.evaluate(async ()=>{
  const skh=window.skh;
  const snap = await skh.getDocs(skh.query(skh.collection(skh.db,'chatGroups'), skh.limit(10)));
  return snap.docs.map(d=>{const x=d.data();return {id:d.id, name:x.name||x.title||'(bila jina)', members:x.memberCount||(x.members&&x.members.length)||null};});
});
console.log('vikundi:', JSON.stringify(groups));
if (groups.length) {
  await p.evaluate(g=>window.skhOpenGroupSoga(g), groups[0].id);
  await p.waitForTimeout(4000);
  const m = await p.evaluate(()=>{
    const mod=document.getElementById('skhGroupSogaModal');
    if(!mod) return {err:'modal haipo'};
    const r=mod.getBoundingClientRect();
    return {w:Math.round(r.width), h:Math.round(r.height), scrollW:mod.scrollWidth, clientW:mod.clientWidth,
      overflowX: mod.scrollWidth-mod.clientWidth,
      inner:[...mod.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0 && (b.right>r.right+2 || b.width>r.width+2);})
        .slice(0,8).map(e=>({tag:e.tagName,cls:(e.className||'').toString().slice(0,40),w:Math.round(e.getBoundingClientRect().width)}))};
  });
  console.log(JSON.stringify(m,null,1).slice(0,1600));
  await p.screenshot({path:'/tmp/gsg-1440.png'});
}
await b.close();

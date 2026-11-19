// Actual markup/CSS with local mock-cloud preview. Exhaustive integer widths;
// no production, auth or live services. Start tools/product_preview_server.mjs first.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:320,height:900}});
 await page.goto('http://127.0.0.1:4174/',{waitUntil:'load'});
 await page.waitForFunction(()=>window.previewReady);
 await page.evaluate(()=>{
  document.querySelectorAll('.overlay-menu').forEach(el=>el.style.display='none');
  document.querySelectorAll('.top-nav-row .skh-count').forEach(el=>{el.hidden=false;el.style.display='inline-flex';el.textContent='99+'});
 });
 for(let width=280;width<=1500;width++){
  await page.setViewportSize({width,height:900});
  const x=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}};
   const q=s=>document.querySelector(s), icons=[...document.querySelectorAll('.top-nav-icons .skh-icon-btn')];
   const controls=[q('.top-nav-left .menu-btn'),q('.top-nav-left .skh-brand'),q('#skhPostBtn'),...icons];
   const hits=controls.map(el=>{const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(hit===el||el.contains(hit))});
   const badges=[...document.querySelectorAll('.top-nav-row .skh-count')].map(el=>({badge:rect(el),button:rect(el.closest('button'))}));
   return {row:rect(q('.top-nav-row')),brand:rect(q('.top-nav-left .skh-brand')),menu:rect(q('.top-nav-left .menu-btn')),post:rect(q('#skhPostBtn')),icons:icons.map(rect),scroll:document.documentElement.scrollWidth,hits,badges};
  });
  const bad=condition=>assert(condition,`width=${width}, bounds=${JSON.stringify(x)}`);
  bad(x.scroll<=width);bad(x.menu.r<=x.brand.l+.1);bad(x.brand.r<=x.post.l+.1);bad(x.post.r<=x.icons[0].l+.1);
  bad(x.hits.every(Boolean));bad(Math.abs(x.post.l+x.post.w/2-(x.row.l+x.row.w/2))<1);
  for(let i=0;i<x.icons.length;i++){const r=x.icons[i];bad(r.l>=x.row.l-.1&&r.r<=x.row.r+.1);bad(Math.abs((r.t+r.h/2)-(x.post.t+x.post.h/2))<1);if(i)bad(x.icons[i-1].r<=r.l+.1)}
  const centers=x.icons.map(r=>r.l+r.w/2), gaps=centers.slice(1).map((c,i)=>c-centers[i]);bad(Math.max(...gaps)-Math.min(...gaps)<1);
  if(width<=480)for(const {badge,button} of x.badges){bad(badge.l>=button.l-.1&&badge.r<=button.r+.1);bad(badge.l>=0&&badge.r<=width)}
 }
 console.log('PASS all 1,221 integer widths 280–1500px: one row, centered Post, equal icon spacing, no overlap/overflow, hit testing; mobile 99+ badges inside their own button. Local mock only.');
} finally {await browser.close()}

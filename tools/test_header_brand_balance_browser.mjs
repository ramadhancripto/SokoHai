// Actual HTML/CSS; fixture uses mock cloud. No production access.
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch();
for(const width of [320,360,375,390,430,768,1099,1100,1280,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});await page.goto('http://127.0.0.1:4174/',{waitUntil:'load'});await page.waitForFunction(()=>window.previewReady);
 let data=await page.evaluate(()=>{const box=e=>{let r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};let row=document.querySelector('.top-nav-row'), post=document.querySelector('#skhPostBtn'),left=document.querySelector('.top-nav-left'),icons=[...document.querySelectorAll('.top-nav-icons .skh-icon-btn')],logo=document.querySelector('.top-nav-row .skh-brand-logo');return{row:box(row),post:box(post),left:box(left),brand:box(document.querySelector('.top-nav-row .skh-brand')),icons:icons.map(box),logo:{loaded:logo.complete&&logo.naturalWidth>0,src:logo.getAttribute('src')},scroll:document.documentElement.scrollWidth};});
 assert(Math.abs(data.post.x+data.post.w/2-(data.row.x+data.row.w/2))<1.1,`${width} centered ${JSON.stringify(data)}`);
 assert(data.left.right<=data.post.x+0.5 && data.brand.right<=data.post.x-1,`${width} brand overlaps post ${JSON.stringify(data)}`);assert(data.logo.loaded,`${width} logo load`);assert.equal(data.scroll,width,`${width} horizontal overflow`);
 for(let i=0;i<4;i++){let a=data.icons[i];assert(a.w>=37&&a.h>=40,`${width} touch size ${JSON.stringify(a)}`);assert(a.x>=data.row.x-1&&a.right<=data.row.right+1,`${width} button outside`);if(i){assert(data.icons[i-1].right<=a.x+.5,`${width} icons overlap`);}}
 if(width>360)assert(data.icons[0].x>=data.post.right-0.5,`${width} post overlaps icons`);
 const centers=data.icons.map(x=>x.x+x.w/2);const intervals=centers.slice(1).map((x,i)=>x-centers[i]);assert(Math.max(...intervals)-Math.min(...intervals)<1,`${width} unequal action spacing ${intervals}`);
 await page.evaluate(()=>{document.querySelectorAll('.overlay-menu').forEach(e=>e.style.display='none');window.__postClicked=0;window.togglePlusMenu=()=>window.__postClicked++;});
 await page.locator('#skhPostBtn').click();assert.equal(await page.evaluate(()=>window.__postClicked),1,`${width} post action`);
 await page.evaluate(()=>{document.getElementById('welcomeModal').style.display='flex'});
 const brand=await page.evaluate(()=>{const w=document.querySelector('#welcomeModal');const img=w.querySelector('img');const read=n=>{let s=getComputedStyle(n);return{font:s.fontFamily,weight:s.fontWeight,color:s.color,text:n.textContent}};return{loaded:img.complete&&img.naturalWidth>0,img:img.getAttribute('src'),header:read(document.querySelector('.top-nav-row .skh-brand-soko')),welcome:read(w.querySelector('.skh-brand-soko')),hai:read(w.querySelector('.skh-brand-hai')),arc:getComputedStyle(w.querySelector('.skh-brand-arc')).borderBottomStyle};});
 assert(brand.loaded);assert.equal(brand.img,data.logo.src);assert.equal(brand.header.font,brand.welcome.font);assert.equal(brand.header.weight,brand.welcome.weight);assert.equal(brand.header.color,brand.welcome.color);assert.equal(brand.hai.text,'Hai');assert.equal(brand.arc,'solid');
 if(width===390||width===320||width===1280){await page.evaluate(()=>document.getElementById('welcomeModal').style.display='none');await page.screenshot({path:`/tmp/sokohai-header-${width}.png`});}
 console.log(`PASS ${width}: centered post, non-overlap, equally spaced actions, matching welcome brand`);await page.close();
}
await browser.close();

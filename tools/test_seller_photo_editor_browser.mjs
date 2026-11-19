// Real seller picker + editor + CSS. Local fixture replaces only cloud boundaries;
// uploads are intercepted and no product is published to Firebase/Cloudinary.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch();
const mobileRule=fs.readFileSync('js/app/24-ui-final.js','utf8').match(/@media \(max-width: 768px\) \{\s*#plusMenu > #sellerForm \{[\s\S]*?\n        \}\n    \}/)?.[0];
assert(mobileRule, 'production seller mobile rule not found');
for(const [w,h,touch] of [[320,568,true],[390,844,true],[1280,900,false]]){
 const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch});
 const p=await ctx.newPage();p.setDefaultTimeout(7000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4174/');await p.waitForFunction(()=>window.previewReady);
 await p.evaluate(rule=>{document.querySelector('#previewNavigation')?.remove();document.querySelector('#mainMenu').style.display='none';let s=document.createElement('style');s.textContent=rule;document.head.appendChild(s)},mobileRule);
 const layout=await p.evaluate(()=>{let f=document.querySelector('#sellerForm'),r=f.getBoundingClientRect(),h=f.querySelector('h3').getBoundingClientRect();return{r:r.toJSON(),head:h.toJSON(),width:document.documentElement.scrollWidth,scroll:f.scrollHeight>f.clientHeight};});
 assert.equal(layout.width,w);assert(layout.r.left>=-1&&layout.r.right<=w+1);assert(layout.head.top>=0&&layout.head.bottom<=h);assert(layout.scroll);
 await p.setInputFiles('#prodImage','tools/fixtures/editor-product-edge-test.png');await p.locator('[data-act="edit"]').click();await p.waitForFunction(()=>document.querySelector('#psEdCanvas')?.width===500);
 const stage=await p.locator('#psEdCanvas').boundingBox();assert(stage.width>=140&&stage.height>=140,`${w} preview too small`);
 await p.locator('[data-ed="rmbg"]').click();await p.waitForFunction(()=>!document.querySelector('.ps-ed-busy').hidden===false);
 const get=()=>p.locator('#psEdCanvas').evaluate(c=>{let ctx=c.getContext('2d');const px=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);return{w:c.width,h:c.height,corner:px(10,10),edge:px(0,250),subject:px(250,300),nearEdge:px(140,300)}});
 let d=await get();assert.equal(d.corner[3],0);assert(d.subject[3]>240);assert(d.edge[3]>100,'border-touching product removed');assert(d.nearEdge[3]>100,'foreground boundary removed');assert.equal(d.w,500);assert.equal(d.h,500);
 assert.match(await p.locator('.ps-ed-status').textContent(),/Mandhari imeondolewa/);
 // White is a preview/export choice, not destructive: switching back preserves alpha.
 await p.locator('[data-ed="bg-white"]').click();assert(await p.locator('.ps-ed-stage').evaluate(e=>e.classList.contains('is-white')));assert.equal((await get()).corner[3],0);
 await p.locator('[data-ed="bg-trans"]').click();assert(!(await p.locator('.ps-ed-stage').evaluate(e=>e.classList.contains('is-white'))));
 // Rotate after removal then repeat removal; prior base must not undo the rotation.
 await p.locator('[data-ed="rotr"]').click();await p.locator('[data-ed="rmbg"]').click();await p.waitForFunction(()=>document.querySelector('.ps-ed-busy').hidden);assert.equal((await get()).w,500);await p.locator('[data-ed="undo"]').click();
 // Real mouse stroke, then undo; eraser should scroll the canvas into view.
 await p.locator('[data-ed="erase"]').click();await p.locator('#psEdCanvas').scrollIntoViewIfNeeded();let box=await p.locator('#psEdCanvas').boundingBox();
 await p.mouse.move(box.x+box.width*.5,box.y+box.height*.6);await p.mouse.down();await p.mouse.move(box.x+box.width*.62,box.y+box.height*.6,{steps:5});await p.mouse.up();
 assert((await get()).subject[3]<20,'mouse erase did not clear pixel');await p.locator('[data-ed="undo"]').click();assert((await get()).subject[3]>200,'undo failed');
 if(touch){
  // CDP touch events exercise actual touch PointerEvents, not synthetic DOM events.
  await p.locator('#psEdCanvas').scrollIntoViewIfNeeded();box=await p.locator('#psEdCanvas').boundingBox();const cdp=await ctx.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.5,y:box.y+box.height*.6}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.6,y:box.y+box.height*.6}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert((await get()).subject[3]<20,'touch erase failed');await p.locator('[data-ed="undo"]').click();assert((await get()).subject[3]>200);
 }
 await p.locator('[data-ed="apply"]').click();await p.waitForSelector('.skh-ps-editor',{state:'detached'});
 let stored=await p.evaluate(async()=>{let f=skhPhotoPickerFiles('prodImage')[0],im=await createImageBitmap(f),c=document.createElement('canvas');c.width=im.width;c.height=im.height;let x=c.getContext('2d');x.drawImage(im,0,0);return{name:f.name,type:f.type,corner:x.getImageData(10,10,1,1).data[3],center:x.getImageData(250,300,1,1).data[3]}});
 assert.equal(stored.type,'image/png');assert.equal(stored.corner,0);assert(stored.center>200);assert(/-nobg\.png$/.test(stored.name));
 // This is the real upload function, but Cloudinary fetch is intercepted by fixture.
 const upload=await p.evaluate(async()=>{let urls=await skhUploadPicked('prodImage',6,{resourceType:'image',folder:'products'});let response=await fetch(urls[0]),blob=await response.blob(),bm=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;let x=c.getContext('2d');x.drawImage(bm,0,0);return{count:urls.length,type:blob.type,alpha:x.getImageData(10,10,1,1).data[3]}});
 assert.equal(upload.count,1);assert.equal(upload.type,'image/png');assert.equal(upload.alpha,0);
 await p.locator('[data-act="restore"]').click();assert.equal(await p.evaluate(()=>skhPhotoPickerFiles('prodImage')[0].name),'editor-product-edge-test.png');
 await p.locator('[data-act="edit"]').click();await p.waitForFunction(()=>document.querySelector('#psEdCanvas')?.width===500);await p.locator('[data-ed="rmbg"]').click();await p.waitForFunction(()=>document.querySelector('.ps-ed-busy').hidden);await p.locator('[data-ed="bg-white"]').click();await p.locator('[data-ed="apply"]').click();await p.waitForSelector('.skh-ps-editor',{state:'detached'});
 stored=await p.evaluate(async()=>{let f=skhPhotoPickerFiles('prodImage')[0],im=await createImageBitmap(f),c=document.createElement('canvas');c.width=im.width;c.height=im.height;let x=c.getContext('2d');x.drawImage(im,0,0);return{type:f.type,corner:Array.from(x.getImageData(10,10,1,1).data)}});
 assert.equal(stored.type,'image/jpeg');assert(stored.corner[0]>240&&stored.corner[3]===255,'white JPEG export');
 await p.locator('[data-act="remove"]').click();assert.equal(await p.evaluate(()=>skhPhotoPickerFiles('prodImage').length),0);
 assert.deepEqual(errors,[]);console.log(`PASS ${w}x${h}: form, background, edge protection, white/alpha preview, mouse${touch?'/touch':''} erase + undo, PNG mock upload, restore, white JPEG, delete`);await ctx.close();
}
// Rectangular orientation, explicit trim, cancel, and a uniform background safety check.
{
 const p=await browser.newPage({viewport:{width:390,height:844}});await p.goto('http://127.0.0.1:4174/');await p.waitForFunction(()=>window.previewReady);await p.evaluate(()=>{document.querySelector('#previewNavigation')?.remove();document.querySelector('#mainMenu').style.display='none'});
 await p.setInputFiles('#prodImage','tools/fixtures/editor-product-wide-test.png');await p.locator('[data-act=edit]').click();await p.waitForFunction(()=>document.querySelector('#psEdCanvas')?.width===500);
 await p.locator('[data-ed=rmbg]').click();await p.waitForFunction(()=>document.querySelector('.ps-ed-busy').hidden);await p.locator('[data-ed=rotr]').click();
 let dim=await p.locator('#psEdCanvas').evaluate(c=>[c.width,c.height]);assert.deepEqual(dim,[300,500]);
 // Re-running after rotation must not reinstate the original orientation.
 await p.locator('[data-ed=rmbg]').click();await p.waitForFunction(()=>document.querySelector('.ps-ed-busy').hidden);assert.deepEqual(await p.locator('#psEdCanvas').evaluate(c=>[c.width,c.height]),[300,500]);
 await p.locator('[data-ed=trim]').click();dim=await p.locator('#psEdCanvas').evaluate(c=>[c.width,c.height]);assert(dim[0]<300&&dim[1]<500,'explicit trim');
 await p.locator('[data-ed=cancel]').click();assert.equal(await p.evaluate(()=>skhPhotoPickerFiles('prodImage')[0].name),'editor-product-wide-test.png');
 await p.locator('[data-act=remove]').click();await p.setInputFiles('#prodImage','tools/fixtures/editor-product-plain-test.png');await p.locator('[data-act=edit]').click();await p.waitForFunction(()=>document.querySelector('#psEdCanvas')?.width===500);await p.locator('[data-ed=rmbg]').click();await p.waitForFunction(()=>document.querySelector('.ps-ed-busy').hidden);
 assert.match(await p.locator('.ps-ed-status').textContent(),/Haikuwezekana/);assert.equal(await p.locator('#psEdCanvas').evaluate(c=>c.getContext('2d').getImageData(0,0,1,1).data[3]),255,'all-white image must not be wiped');
 console.log('PASS non-square rotation, explicit trim, cancel, uniform-image safety');await p.close();
}

// PNG above the compression threshold must not be flattened by real uploader compression.
const p=await browser.newPage();await p.goto('http://127.0.0.1:4174/');await p.waitForFunction(()=>window.previewReady);
const compressed=await p.evaluate(async()=>{let c=document.createElement('canvas');c.width=1700;c.height=1000;let x=c.getContext('2d'),a=x.createImageData(c.width,c.height);let seed=7;for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++){let o=(y*c.width+i)*4;seed=(seed*1664525+1013904223)>>>0;a.data[o]=seed>>>24;seed=(seed*1664525+1013904223)>>>0;a.data[o+1]=seed>>>24;seed=(seed*1664525+1013904223)>>>0;a.data[o+2]=seed>>>24;a.data[o+3]=i<120?0:255;}x.putImageData(a,0,0);let blob=await new Promise(r=>c.toBlob(r,'image/png'));let f=new File([blob],'large.png',{type:'image/png'}),out=await skhCompressImageFile(f),im=await createImageBitmap(out),d=document.createElement('canvas');d.width=im.width;d.height=im.height;let ctx=d.getContext('2d');ctx.drawImage(im,0,0);return{input:f.size,type:out.type,w:im.width,alpha:ctx.getImageData(2,2,1,1).data[3]}});
assert(compressed.input>300*1024);assert.equal(compressed.type,'image/png');assert.equal(compressed.alpha,0);console.log('PASS large PNG compression retains alpha:',compressed);
const webp=await p.evaluate(async()=>{let c=document.createElement('canvas');c.width=1700;c.height=1000;let x=c.getContext('2d'),a=x.createImageData(c.width,c.height),seed=11;for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++){let o=(y*c.width+i)*4;seed=(seed*1664525+1013904223)>>>0;a.data[o]=seed>>>24;seed=(seed*1664525+1013904223)>>>0;a.data[o+1]=seed>>>24;seed=(seed*1664525+1013904223)>>>0;a.data[o+2]=seed>>>24;a.data[o+3]=i<120?0:255;}x.putImageData(a,0,0);let blob=await new Promise(r=>c.toBlob(r,'image/webp',.95));let f=new File([blob],'large.webp',{type:'image/webp'}),out=await skhCompressImageFile(f),im=await createImageBitmap(out),d=document.createElement('canvas');d.width=im.width;d.height=im.height;let ctx=d.getContext('2d');ctx.drawImage(im,0,0);return{input:f.size,type:out.type,w:im.width,alpha:ctx.getImageData(2,2,1,1).data[3]}});
assert(webp.input>300*1024);assert.equal(webp.type,'image/webp');assert.equal(webp.alpha,0);console.log('PASS large WebP compression retains alpha:',webp);
await browser.close();

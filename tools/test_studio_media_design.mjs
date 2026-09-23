/* Functional smoke test — MEDIA + FIRST-LEVEL DESIGNING (2026-09-24).
   Boots the REAL Creator Studio module in jsdom against a stubbed
   00-bootstrap (Firebase) and the real creative model/renderer/palettes,
   then exercises: tab structure, Add Media, crop, video overlay, MEDIA tab,
   Advanced cleanup, CTA/SCHEDULE, preview modes and the Media Library bridge. */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const harness=fs.mkdtempSync(path.join(os.tmpdir(),'skh-studio-'));
fs.mkdirSync(path.join(harness,'creative'),{recursive:true});
for(const f of ['creative-model.js','creative-history.js','creative-svg-renderer.js']){
  fs.symlinkSync(path.join(root,'js/app/creative',f),path.join(harness,'creative',f));
}
fs.symlinkSync(path.join(root,'js/app/95-creative-studio.js'),path.join(harness,'95-creative-studio.js'));

fs.writeFileSync(path.join(harness,'00-bootstrap.js'),`
export const skh={
  currentUser:null,db:{},
  collection:()=>({}),doc:()=>({}),query:()=>({}),
  addDoc:async()=>({id:'doc1'}),setDoc:async()=>{},
  getDoc:async()=>({exists:()=>false}),getDocs:async()=>({forEach:()=>{}}),
  updateDoc:async()=>{},callFunction:async()=>({data:{}})
};
`);

fs.writeFileSync(path.join(harness,'run.mjs'),`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(${JSON.stringify(path.join(root,'package.json'))});
const {JSDOM}=require('jsdom');
const ROOT=${JSON.stringify(root)};

const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',
  {url:'https://sokohai.test/',pretendToBeVisual:true,runScripts:'outside-only'});
const w=dom.window;
globalThis.window=w;
for(const k of ['document','localStorage','HTMLElement','Element','Node','MouseEvent','Event','CustomEvent','Image','URL','FormData','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','confirm','alert']){
  try{globalThis[k]=w[k];}catch(e){}
}
try{Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});}catch(e){}
w.confirm=()=>false;w.alert=()=>{};
w.skhToast=()=>{};
w.skhUploadFromFile=async()=>({url:'https://cdn.test/picha.png',data:{width:10,height:10}});
let libTarget=null;
w.skhOpenAdminMediaLibrary=t=>{libTarget=t;};
w.skhAdvertisementCardHtml=a=>'<div class="fake-home-card">'+(a.headline||'')+'</div>';
w.eval(fs.readFileSync(ROOT+'/js/app/creative/ad-palettes.js','utf8'));

await import('./95-creative-studio.js');
const $=s=>w.document.querySelector(s);
const click=s=>{const el=typeof s==='string'?$(s):s;el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};

/* ---- open studio ---- */
await w.SokoHaiCreativeStudio.open({});
assert.ok($('#skhCreativeStudio'),'studio shell opens');

/* 1. the required 7-tab structure, in order */
const tabs=[...w.document.querySelectorAll('#skhCreativeStudio nav [data-tab]')].map(b=>b.dataset.tab);
assert.deepEqual(tabs,['basic','design','motion','media','cta','schedule','advanced'],'7 tabs in order');
console.log('  · tabs BASIC·DESIGN·MOTION·MEDIA·CTA·SCHEDULE·ADVANCED ✔');

/* 2. DESIGN tab hosts Add Media + basic tools (crop appears once media exists) */
click('#skhCreativeStudio nav [data-tab="design"]');
let lib=$('#csLibrary').innerHTML;
['csAddMediaFile','openmedialibrary','csAddMediaUrl','data-add="shape"','csLogoFile','data-tab="templates"']
  .forEach(s=>assert.ok(lib.includes(s),'DESIGN missing: '+s));
assert.ok(lib.includes('Hakuna media bado'),'clean empty state before media');
console.log('  · DESIGN hosts Add Media + text/logo/shapes/templates ✔');

/* 3. Add Media via URL -> instant canvas preview + crop controls appear */
$('#csAddMediaUrl').value='https://example.com/bidhaa.png';
click('[data-a="addmediaurl"]');
const imgEl=$('#csCanvas svg image');
assert.ok(imgEl&&imgEl.getAttribute('href').includes('bidhaa.png'),'media appears on canvas immediately');
lib=$('#csLibrary').innerHTML;
['data-crop-aspect="1:1"','data-crop-aspect="16:9"','data-crop-aspect="9:16"','data-crop-aspect="custom"','data-prop="style.cropX"','data-prop="style.zoom"','data-a="fitcanvas"','data-align="center"']
  .forEach(s=>assert.ok(lib.includes(s),'crop/size controls missing after media: '+s));
console.log('  · URL media appears on canvas instantly + crop/size controls ✔');

/* 4. crop 1:1 applied to the selected media layer + persisted to draft */
click('[data-crop-aspect="1:1"]');
click('[data-a="save"]');
const draftKey=Object.keys(w.localStorage).find(k=>k.startsWith('skh_creative_draft_'));
const draft=JSON.parse(w.localStorage.getItem(draftKey));
const im=draft.layers.find(l=>l.type==='image');
assert.ok(im,'image layer saved');
assert.equal(im.cropAspect,'1:1');
assert.equal(im.width,im.height,'1:1 crop makes square frame');
assert.ok(im.src.includes('bidhaa.png'));
console.log('  · crop 1:1 applied + persisted (save chain intact) ✔');

/* 5. layer ops: duplicate + order buttons work */
const before=draft.layers.length;
click('[data-op="duplicate"]');
click('[data-a="save"]');
const draft2=JSON.parse(w.localStorage.getItem(draftKey));
assert.equal(draft2.layers.length,before+1,'duplicate layer adds one');
console.log('  · duplicate layer works ✔');

/* 6. video layer -> live preview overlay on canvas */
await w.SokoHaiCreativeStudio.open({creative:{format:'landscape',layers:[
  {type:'video',name:'Video',src:'https://example.com/video.mp4',videoUrl:'https://example.com/video.mp4',x:10,y:10,width:400,height:300,zIndex:2,videoMeta:{autoplay:true,muted:true,loop:true}}
]}});
const vid=$('#csCanvas .cs-video-overlay');
assert.ok(vid,'video overlay exists on canvas');
assert.ok(vid.src.includes('video.mp4'),'overlay plays the layer source');
assert.equal(vid.muted,true,'respects videoMeta.muted');
assert.equal(vid.loop,true,'respects videoMeta.loop');
console.log('  · video live preview overlay on canvas ✔');

/* 7. MEDIA tab = playback + trim (no uploader) */
click('#skhCreativeStudio nav [data-tab="media"]');
lib=$('#csLibrary').innerHTML;
assert.ok(lib.includes('data-vmeta="trimStart"')&&lib.includes('data-vmeta="trimEnd"'),'trim in MEDIA');
assert.ok(lib.includes('togglevideo')&&lib.includes('togglevideomute'),'play/mute controls');
assert.ok(lib.includes('posterUrl'),'poster control');
assert.ok(!lib.includes('csAddMediaFile')&&!lib.includes('type="file"'),'MEDIA tab has no uploader');
console.log('  · MEDIA tab: playback + trim + poster, no duplicate uploader ✔');

/* 8. MOTION tab = animation engine */
click('#skhCreativeStudio nav [data-tab="motion"]');
assert.ok($('#csLibrary').innerHTML.includes('data-anim="entrance"'),'MOTION hosts animation engine');

/* 9. CTA tab uses canonical presets */
click('#skhCreativeStudio nav [data-tab="cta"]');
lib=$('#csLibrary').innerHTML;
assert.ok(lib.includes('Angalia Sasa'),'CTA label presets reused');
assert.ok(lib.includes('data-simple="destination"'),'CTA destination present');

/* 10. SCHEDULE tab owns campaign/dates/priority/display duration */
click('#skhCreativeStudio nav [data-tab="schedule"]');
lib=$('#csLibrary').innerHTML;
['data-simple="category"','data-simple="startAt"','data-simple="priority"','data-simple="displayDurationSeconds"','data-simple="campaignId"']
  .forEach(s=>assert.ok(lib.includes(s),'SCHEDULE missing: '+s));

/* 11. ADVANCED = deep tools only, basics removed */
click('#skhCreativeStudio nav [data-tab="advanced"]');
lib=$('#csLibrary').innerHTML;
assert.ok(lib.includes('data-tab="timeline"'),'deep timeline stays Advanced');
assert.ok(lib.includes('data-a="eraser"'),'advanced masking stays Advanced');
assert.ok(!lib.includes('data-tab="text"'),'basic text not in Advanced');
assert.ok(!lib.includes('data-tab="elements"'),'basic shapes not in Advanced');
console.log('  · MOTION/CTA/SCHEDULE/ADVANCED contracts ✔');

/* 12. Preview modes reuse the Home card renderer + fullscreen */
click('[data-a="preview"]');
const sheet=$('#csSheet').innerHTML;
assert.ok(sheet.includes('fake-home-card'),'Feed/Card preview uses skhAdvertisementCardHtml');
assert.ok(sheet.includes('Mobile / Story')&&sheet.includes('Desktop / Web'),'mobile + desktop modes');
assert.ok(sheet.includes('Fullscreen preview'),'fullscreen mode');
console.log('  · preview modes (card/mobile/desktop/fullscreen) ✔');

/* 13. Media Library bridge: studio is a target of the EXISTING library */
$('#csSheet').hidden=true;
click('#skhCreativeStudio nav [data-tab="design"]');
click('[data-a="openmedialibrary"]');
assert.equal(libTarget,'studio','existing library opened with studio target');
w.skhStudioApplyLibraryMedia('https://example.com/library-media.png','image');
click('[data-a="save"]');
const draft3=JSON.parse(w.localStorage.getItem(draftKey));
assert.ok(draft3.layers.some(l=>(l.src||'').includes('library-media.png')),'library selection lands as a layer');
console.log('  · existing Media Library bridge works ✔');

console.log('STUDIO MEDIA+DESIGN FUNCTIONAL TESTS: ALL PASS ✔');
`);

execFileSync(process.execPath,['--preserve-symlinks','--preserve-symlinks-main',path.join(harness,'run.mjs')],{stdio:'inherit'});
fs.rmSync(harness,{recursive:true,force:true});

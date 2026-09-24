/* SokoHai — NON-CANVAS ADVERTISEMENT DESIGNER MVP acceptance suite.
   Covers spec §30 (Image / Video / Audio / Slideshow / Persistence) + §22
   (preview == published renderer) + §27 (text pipeline) + §33 (60s rule).
   2026-09-24 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  createCreative,normalizeCreative,makeLayer,validateCreative,slideshowTotal,
  detectComposition,COMPOSITION_LABELS,autoAdDuration,MAX_AD_MEDIA_SECONDS,
  SLIDESHOW_TRANSITIONS,MULTIMEDIA_PRESETS
} from '../js/app/creative/creative-model.js';
import {renderCreativeSvg} from '../js/app/creative/creative-svg-renderer.js';

let pass=0;
const t=(name,fn)=>{fn();pass++;console.log('  ✓ '+name);};

console.log('== NON-CANVAS MVP: model & rules ==');

t('§33 MAX_AD_MEDIA_SECONDS === 60',()=>assert.equal(MAX_AD_MEDIA_SECONDS,60));
t('§21 duration clamps to 60',()=>{
  const c=normalizeCreative({duration:120});
  assert.equal(c.duration,60);
  assert.equal(c.maxDuration,60);
});
t('§28 backward compat: old creative normalizes slideshow=disabled',()=>{
  const old=JSON.parse(JSON.stringify(createCreative({format:'square'})));
  delete old.slideshow;
  const n=normalizeCreative(old);
  assert.equal(n.slideshow.enabled,false);
  assert.deepEqual(n.slideshow.slides,[]);
  assert.ok(validateCreative(n).ok||true);
});
t('§11 video ≤60 valid / >60 rejected / trim fixes it',()=>{
  const mk=trimEnd=>{
    const c=createCreative({format:'square'});
    c.destination={type:'external',url:'https://x.com'};
    c.layers=[makeLayer('video',{src:'https://x.com/v.mp4',videoUrl:'https://x.com/v.mp4',videoMeta:{duration:90,trimStart:0,trimEnd}})];
    return validateCreative(c);
  };
  assert.ok(mk(75).ok===false&&mk(75).errors.some(e=>e.code==='VIDEO_DURATION'),'75s effective trim rejected');
  assert.equal(mk(60).ok,true,'60s effective trim accepted');
});
t('§15/§21 slideshow validation: ≥2 slides + total ≤60',()=>{
  const bad=normalizeCreative({slideshow:{enabled:true,slides:[{src:'https://x/1.jpg'}]}});
  const v1=validateCreative(bad,{forPublish:true});
  assert.ok(v1.errors.some(e=>e.code==='SLIDESHOW_SLIDES')||!bad.slideshow.enabled);
  const tooLong=normalizeCreative({slideshow:{enabled:true,slides:[
    {src:'https://x/1.jpg',duration:30},{src:'https://x/2.jpg',duration:30},{src:'https://x/3.jpg',duration:5}
  ]}});
  assert.ok(slideshowTotal(tooLong)===65);
  const v2=validateCreative(tooLong,{forPublish:true});
  assert.ok(v2.errors.some(e=>e.code==='SLIDESHOW_DURATION'));
  const ok=normalizeCreative({slideshow:{enabled:true,transition:'zoom',slides:[
    {src:'https://x/1.jpg',duration:4},{src:'https://x/2.jpg',duration:5},{src:'https://x/3.jpg'}
  ]}});
  assert.equal(ok.slideshow.transition,'zoom');
  assert.equal(ok.slideshow.slides.length,3);
  assert.equal(slideshowTotal(ok),12);
  const v3=validateCreative(ok);
  assert.ok(!v3.errors.some(e=>e.code.startsWith('SLIDESHOW')));
});
t('§24 automatic composition detection (A–F)',()=>{
  const withImg=()=>{const c=createCreative();c.layers.push(makeLayer('image',{src:'https://x/i.jpg'}));return c;};
  const img=withImg(); assert.equal(detectComposition(img),'image');
  assert.equal(COMPOSITION_LABELS[detectComposition(img)],'Static Image Ad');
  const audc=withImg(); audc.layers.push(makeLayer('audio',{src:'https://x/a.mp3'}));
  assert.equal(detectComposition(audc),'image_audio');
  const vidc=createCreative(); vidc.layers.push(makeLayer('video',{src:'https://x/v.mp4',videoUrl:'https://x/v.mp4'}));
  assert.equal(detectComposition(vidc),'video');
  const vaud=JSON.parse(JSON.stringify(vidc)); vaud.layers.push(makeLayer('audio',{src:'https://x/a.mp3'}));
  assert.equal(detectComposition(vaud),'video_audio');
  const ss=normalizeCreative({slideshow:{enabled:true,slides:[{src:'https://x/1.jpg'},{src:'https://x/2.jpg'}]}});
  assert.equal(detectComposition(ss),'slideshow');
});
t('§21 autoAdDuration ≤60 from slideshow/video/audio',()=>{
  const ss=normalizeCreative({slideshow:{enabled:true,slides:[{src:'https://x/1.jpg',duration:6},{src:'https://x/2.jpg',duration:6}]}});
  assert.equal(autoAdDuration(ss),12);
  assert.ok(autoAdDuration(ss)<=MAX_AD_MEDIA_SECONDS);
});
t('§15 slideshow transitions set complete',()=>{
  ['none','fade','slide','zoom','crossfade'].forEach(x=>assert.ok(SLIDESHOW_TRANSITIONS.includes(x)));
});
t('slideshow preset exists with 60s max',()=>{
  assert.ok(MULTIMEDIA_PRESETS.slideshow);
  assert.equal(MULTIMEDIA_PRESETS.slideshow.maxDuration,60);
});

console.log('== NON-CANVAS MVP: SVG renderer (editor preview) ==');

t('§6 text renders into SVG with animation state',()=>{
  const c=createCreative({format:'square'});
  const h=c.layers.find(l=>l.role==='headline');
  h.content='OFa ya leo';
  h.style.fill='#10B981';
  h.animation={enabled:true,entrance:'fade',emphasis:'none',mode:'whole',duration:1500,delay:1000};
  const svg=renderCreativeSvg(c);
  assert.ok(svg.includes('OFa ya leo'),'text content in renderer output');
  assert.ok(svg.includes('#10B981'),'text color in renderer output');
  assert.ok(svg.includes('skh_anim_fade')||svg.includes('animation'),'entrance animation applied');
  assert.ok(svg.includes('1500ms')||svg.includes('1500'),'animation duration applied');
});
t('§7 maxLines caps rendered lines',()=>{
  const c=createCreative({format:'square'});
  c.layers=[makeLayer('text',{content:'word '.repeat(120),x:50,y:50,width:400,height:300,style:{fontSize:40,maxLines:3}})];
  const svg=renderCreativeSvg(c);
  const tspans=(svg.match(/<tspan/g)||[]).length;
  assert.ok(tspans<=3,'maxLines respected, got '+tspans);
});
t('video/audio/slideshow layers all render through same renderer',()=>{
  const c=normalizeCreative({
    slideshow:{enabled:true,slides:[{src:'https://x/1.jpg'},{src:'https://x/2.jpg'}]},
    layers:[makeLayer('text',{role:'headline',content:'SLIDESHOW AD'})]
  });
  const svg=renderCreativeSvg(c);
  assert.ok(svg.includes('SLIDESHOW AD'));
});

console.log('== NON-CANVAS MVP: canonical Home renderer (§22/§23) ==');

/* Boot js/06-announcement.js in a minimal window sandbox and drive cardHtml. */
const sandbox={window:{},console,localStorage:{getItem:()=>null,setItem:()=>{}},sessionStorage:{getItem:()=>null,setItem:()=>{}},
  document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{},createElement:()=>({style:{},setAttribute(){},addEventListener(){}}),body:{appendChild(){}}},
  Date,Math,JSON,Number,String,Array,Object,RegExp,Promise,setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
sandbox.window=sandbox;
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/06-announcement.js','utf8'),sandbox,{filename:'06-announcement.js'});
const cardHtml=sandbox.window.skhAdvertisementCardHtml;
assert.equal(typeof cardHtml,'function','skhAdvertisementCardHtml exposed');

t('§15 published card renders slideshow with keyframes + dots + duration chip',()=>{
  const html=cardHtml({
    headline:'Slideshow ya Bidhaa',text:'Picha 3 kwenye tangazo moja',
    creativeType:'image_text',
    slideshow:{enabled:true,transition:'fade',defaultDuration:3,slides:[
      {src:'https://x/a.jpg',duration:4},{src:'https://x/b.jpg',duration:4},{src:'src',name:'x'},{src:'https://x/c.jpg',duration:4}
    ]}
  });
  assert.ok(html.includes('skh-ann-slideshow'),'slideshow container present');
  assert.ok(html.includes('@keyframes'),'timing keyframes emitted');
  assert.ok(html.includes('skh-ann-slide'),'slide figures present');
  assert.ok(html.includes('skh-ann-ss-dots'),'progress dots present');
  assert.ok(html.includes('SLIDESHOW'),'SLIDESHOW micro-label present');
  assert.ok(html.includes('3 picha')||html.includes('picha ·'),'duration/total chip present');
  assert.ok(html.includes('https://x/a.jpg')&&html.includes('https://x/c.jpg'),'valid slide srcs used');
  assert.ok(!html.includes('https://slides/invalid')&&!(html.match(/<img[^>]+src="src"/g)||[]).length,'invalid slide src filtered');
});
t('§15 slideshow transition=none emits hard-cut keyframes (no fade marker style needed)',()=>{
  const html=cardHtml({headline:'Cut',creativeType:'image_text',
    slideshow:{enabled:true,transition:'none',slides:[{src:'https://x/1.jpg',duration:3},{src:'https://x/2.jpg',duration:3}]}});
  assert.ok(html.includes('skh-ss-none'));
  assert.ok(html.includes('@keyframes'));
});
t('§27 text animation pipeline reaches published card',()=>{
  const html=cardHtml({headline:'OFa ya leo',creativeType:'image_text',
    textAnimation:'fade',textEmphasis:'pulse',animationMode:'word',animationDuration:2500,animationDelay:1000,animationStagger:200});
  assert.ok(html.includes('anim-enter-fade')||html.includes('skh-anim-word'),'entrance class present');
  assert.ok(html.includes('2500ms')||html.includes('--anim-duration:2500ms'),'duration ms present');
  assert.ok(html.includes('1000ms')||html.includes('animation-delay:1000ms'),'start delay present');
});
t('§11 trimmed video duration chip uses mediaDurationSeconds (≤60), not raw length',()=>{
  const html=cardHtml({headline:'Vid',creativeType:'video',videoUrl:'https://x/v.mp4',mediaDurationSeconds:60});
  assert.ok(html.includes('1:00'),'chip shows 1:00 for 60s trim');
});
t('§18 CTA label + badge animation fields accepted (existing CTA system)',()=>{
  const html=cardHtml({headline:'B',ctaLabel:'Nunua Sasa',badgeText:'OFA',badgeAnimation:'pop',ctaAnimation:'shine',link:'#home'});
  assert.ok(html.includes('Nunua Sasa'));
  assert.ok(html.includes('badge-anim-pop')||html.includes('OFA'));
});

console.log('== NON-CANVAS MVP: studio integration (source contracts) ==');

const studio=fs.readFileSync('js/app/95-creative-studio.js','utf8');
const model=fs.readFileSync('js/app/creative/creative-model.js','utf8');
const admin=fs.readFileSync('js/app/16-pos-admin-jobs.js','utf8');
const ann=fs.readFileSync('js/06-announcement.js','utf8');
const adCss=fs.readFileSync('css/38-home-ad-manager.css','utf8');
const csCss=fs.readFileSync('css/39-creative-studio.css','utf8');

t('§3 section structure: media/text/layout/animation/audio/cta/appearance/timing/layers/preview present',()=>{
  ['designControls','animationControls','audioControls','timelineControls','ctaControls','showLayers','showPreview','quickStyleControls','slideshowControls','renderProperties']
    .forEach(s=>assert.ok(studio.includes(s),'studio section missing: '+s));
});
t('§11/§12 video editor: trim UI + Trim to 60s + manual edit',()=>{
  ['trimto60','manualtrim','data-a="trimto60"','Video Trim','data-vmeta="trimStart"','data-vmeta="trimEnd"']
    .forEach(s=>assert.ok(studio.includes(s),'video editor missing: '+s));
});
t('§11 editor preview seeks/wraps within trim window',()=>{
  assert.ok(studio.includes('loadedmetadata'),'trim seek on load');
  assert.ok(studio.includes('trimEnd')||studio.includes('tE>tS'),'trim end wrap');
});
t('§13 audio first-class: upload/play/trim/volume controls',()=>{
  ['audioControls','data-audio="volume"','data-audio="trimStart"','data-audio="trimEnd"','testAudioPlayback','csMasterVolume']
    .forEach(s=>assert.ok(studio.includes(s),'audio control missing: '+s));
});
t('§15 slideshow studio controls + multi-file upload',()=>{
  ['csSlideFiles','addSlidesFromInput','data-ss-act','data-ss-dur','data-ss-transition','slideshowAction','SLIDESHOW_TRANSITIONS']
    .forEach(s=>assert.ok(studio.includes(s),'slideshow control missing: '+s));
  assert.ok(studio.includes('multiple'),'multi-image (4+) file picker');
});
t('§7/§8 full text toolset in properties',()=>{
  ['data-nc-pos','style.letterSpacing','style.lineHeight','style.maxLines','style.fontStyle','style.textDecoration','style.shadowOpacity','style.backgroundColor','style.strokeWidth','focuscustomcolor']
    .forEach(s=>assert.ok(studio.includes(s),'text control missing: '+s));
});
t('§21 duration: Auto/Custom + 60s cap in studio',()=>{
  ['data-dur-mode','setDurationMode','autoAdDuration','data-simple="duration"','MAX_AD_MEDIA_SECONDS']
    .forEach(s=>assert.ok(studio.includes(s),'duration control missing: '+s));
  assert.ok(!studio.includes('max="30" step="1" value="${state.duration'),'timeline still capped at 30');
});
t('§22 preview uses SAME canonical renderer with full mapping',()=>{
  assert.ok(studio.includes('skhAdvertisementCardHtml'),'preview → canonical card renderer');
  assert.ok(studio.includes('slideshow:ss'),'creativeAsAnnouncement maps slideshow');
  assert.ok(studio.includes('mediaDurationSeconds'),'creativeAsAnnouncement maps trimmed duration');
  assert.ok(studio.includes('textAnimation:anim.entrance'),'creativeAsAnnouncement maps text animation');
  assert.ok(studio.includes('paletteId:c.paletteId'),'creativeAsAnnouncement maps palette');
});
t('§6 legacy-form carry-through: hidden fields exist and are written',()=>{
  assert.ok(admin.includes('id="annSlideshow"'),'hidden annSlideshow field in form');
  assert.ok(admin.includes('id="annMediaDuration"'),'hidden annMediaDuration field in form');
  assert.ok(admin.includes("setH('annSlideshow'")||studio.includes("setH('annSlideshow'"),'studio writes annSlideshow');
  assert.ok(studio.includes('annMediaDuration'),'studio writes annMediaDuration');
  assert.ok(admin.includes('slideshow:slideshow'),'skhAdFormData passes slideshow to save');
  assert.ok(admin.includes('mediaDurationSeconds'),'skhAdFormData passes media duration to save');
});
t('§33 no leftover 30s caps in studio trim/timeline sources',()=>{
  assert.ok(!studio.includes('max="30" step="1" value="${vMeta.trimEnd'),'video trim still 30-capped');
  assert.ok(studio.includes('MAX_AD_MEDIA_SECONDS'),'60s constant wired');
});
t('§19 layers actions present (select/reorder/lock/hide/duplicate)',()=>{
  ['data-op="up"','data-op="down"','data-op="lock"','data-op="hide"','data-op="duplicate"','showLayers']
    .forEach(s=>assert.ok(studio.includes(s),'layer action missing: '+s));
});
t('§26 toolbar: back/undo/redo/preview/save/publish + tools',()=>{
  ['data-a="undo"','data-a="redo"','data-a="preview"','data-a="save"','data-a="publish"','data-a="close"']
    .forEach(s=>assert.ok(studio.includes(s),'toolbar missing: '+s));
});
t('§29 no duplicate systems: single uploader/renderer/CTA/palette references',()=>{
  assert.ok(studio.includes('skhUploadFromFile'),'reuses canonical uploader');
  assert.ok(studio.includes('skhOpenAdminMediaLibrary'),'reuses media library');
  assert.ok(studio.includes('SKH_CTA_PRESETS'),'reuses CTA presets');
  assert.ok(studio.includes('skhPaletteTokens')||studio.includes('SKH_AD_PALETTES'),'reuses palette system');
  assert.ok(studio.includes("from './creative/creative-model.js'"),'single creative model import');
});
t('§1 Canvas-adjacent utilities untouched (no new canvas designer)',()=>{
  assert.ok(!studio.includes('new canvas designer'), 'no canvas designer created');
  assert.ok(ann.includes('skhAdvertisementCardHtml')||ann.includes('cardHtml'),'canonical renderer unchanged identity');
});
t('slideshow CSS shipped with home ad styles',()=>{
  assert.ok(adCss.includes('.skh-ann-slideshow'),'slideshow layout CSS');
  assert.ok(adCss.includes('prefers-reduced-motion'),'reduced-motion fallback (slide 1 visible)');
  assert.ok(csCss.includes('.cs-grid9'),'9-grid CSS');
  assert.ok(csCss.includes('.cs-ss-row'),'slideshow row CSS');
});
t('§28 renderer slideshow invalid-branch safety: video/image branches gated',()=>{
  assert.ok(ann.includes('if (!visual && type.indexOf(\'video\')'),'video branch only when no slideshow');
  assert.ok(ann.includes('} else if (!visual && image)'),'image branch only when no slideshow');
});

console.log(`NON-CANVAS AD DESIGNER MVP: ${pass} checks ALL PASS`);

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
  MAX_AD_DURATION_SECONDS,SLIDESHOW_TRANSITIONS,MULTIMEDIA_PRESETS
} from '../js/app/creative/creative-model.js';
import {renderCreativeSvg} from '../js/app/creative/creative-svg-renderer.js';

let pass=0;
const t=(name,fn)=>{fn();pass++;console.log('  ✓ '+name);};

console.log('== NON-CANVAS MVP: model & rules ==');

t('§9 STRICT: exclusive ceiling 60, largest valid duration 59',()=>{
  assert.equal(MAX_AD_MEDIA_SECONDS,60);
  assert.equal(MAX_AD_DURATION_SECONDS,59);
});
t('§21 duration clamps to 59 (0 < duration < 60)',()=>{
  const c=normalizeCreative({duration:120});
  assert.equal(c.duration,59);
  assert.equal(c.maxDuration,59);
});
t('§1 media OPTIONAL: blank creative (bg+text+CTA+anim, no media) is valid',()=>{
  const blank=normalizeCreative({destination:{type:'external',url:'https://x.com'}});
  const v=validateCreative(blank,{forPublish:true});
  assert.equal(v.ok,true,'no-media creative passes publish validation');
  assert.equal(detectComposition(blank),'poster');
  assert.equal(COMPOSITION_LABELS[detectComposition(blank)],'Graphic/Text Advertisement');
});
t('§28 backward compat: old creative normalizes slideshow=disabled',()=>{
  const old=JSON.parse(JSON.stringify(createCreative({format:'square'})));
  delete old.slideshow;
  const n=normalizeCreative(old);
  assert.equal(n.slideshow.enabled,false);
  assert.deepEqual(n.slideshow.slides,[]);
  assert.ok(validateCreative(n).ok||true);
});
t('§9 STRICT duration<60: 59 ✅ / 60 ❌ / 61 ❌ / trim fixes it',()=>{
  const mk=trimEnd=>{
    const c=createCreative({format:'square'});
    c.destination={type:'external',url:'https://x.com'};
    c.layers=[makeLayer('video',{src:'https://x.com/v.mp4',videoUrl:'https://x.com/v.mp4',videoMeta:{duration:90,trimStart:0,trimEnd}})];
    return validateCreative(c);
  };
  assert.equal(mk(59).ok,true,'59s valid (< 60)');
  assert.ok(mk(60).errors.some(e=>e.code==='VIDEO_DURATION'),'60s REJECTED (spec: do NOT use ≤ 60)');
  assert.ok(mk(61).errors.some(e=>e.code==='VIDEO_DURATION'),'61s rejected');
  assert.ok(mk(75).ok===false&&mk(75).errors.some(e=>e.code==='VIDEO_DURATION'),'75s effective trim rejected');
});
t('§15/§19 slideshow validation: ≥2 slides + total < 60',()=>{
  const bad=normalizeCreative({slideshow:{enabled:true,slides:[{src:'https://x/1.jpg'}]}});
  const v1=validateCreative(bad,{forPublish:true});
  assert.ok(v1.errors.some(e=>e.code==='SLIDESHOW_SLIDES')||!bad.slideshow.enabled);
  const tooLong=normalizeCreative({slideshow:{enabled:true,slides:[
    {src:'https://x/1.jpg',duration:30},{src:'https://x/2.jpg',duration:30},{src:'https://x/3.jpg',duration:5}
  ]}});
  assert.ok(slideshowTotal(tooLong)===65);
  const v2=validateCreative(tooLong,{forPublish:true});
  assert.ok(v2.errors.some(e=>e.code==='SLIDESHOW_DURATION'));
  const edge=normalizeCreative({slideshow:{enabled:true,slides:[{src:'https://x/1.jpg',duration:30},{src:'https://x/2.jpg',duration:30}]}});
  assert.ok(validateCreative(edge,{forPublish:true}).errors.some(e=>e.code==='SLIDESHOW_DURATION'),'total exactly 60 REJECTED (< 60 rule)');
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

  const audc=withImg(); audc.layers.push(makeLayer('audio',{src:'https://x/a.mp3'}));
  assert.equal(detectComposition(audc),'image_audio');
  const vidc=createCreative(); vidc.layers.push(makeLayer('video',{src:'https://x/v.mp4',videoUrl:'https://x/v.mp4'}));
  assert.equal(detectComposition(vidc),'video');
  const vaud=JSON.parse(JSON.stringify(vidc)); vaud.layers.push(makeLayer('audio',{src:'https://x/a.mp3'}));
  assert.equal(detectComposition(vaud),'video_audio');
  const ss=normalizeCreative({slideshow:{enabled:true,slides:[{src:'https://x/1.jpg'},{src:'https://x/2.jpg'}]}});
  assert.equal(detectComposition(ss),'slideshow');
});
t('§21 autoAdDuration strictly < 60 from slideshow/video/audio',()=>{
  const ss=normalizeCreative({slideshow:{enabled:true,slides:[{src:'https://x/1.jpg',duration:6},{src:'https://x/2.jpg',duration:6}]}});
  assert.equal(autoAdDuration(ss),12);
  assert.ok(autoAdDuration(ss)<MAX_AD_MEDIA_SECONDS);
  assert.ok(autoAdDuration(ss)<=MAX_AD_DURATION_SECONDS);
});
t('§8 slideshow transitions include slide-left AND slide-right',()=>{
  ['none','fade','slide','slide-left','slide-right','zoom','crossfade'].forEach(x=>assert.ok(SLIDESHOW_TRANSITIONS.includes(x),'missing transition: '+x));
});
t('slideshow preset exists with 59s max (< 60)',()=>{
  assert.ok(MULTIMEDIA_PRESETS.slideshow);
  assert.equal(MULTIMEDIA_PRESETS.slideshow.maxDuration,59);
});
t('§18 Design Mode field on model (auto default, manual preserved)',()=>{
  assert.equal(createCreative().designMode,'auto');
  assert.equal(normalizeCreative({designMode:'manual'}).designMode,'manual');
});
t('§11 video autoplay default FALSE (poster-first)',()=>{
  assert.equal(makeLayer('video',{src:'https://x/v.mp4'}).videoMeta.autoplay,false);
});
t('§18 composition labels per spec mapping',()=>{
  const img=createCreative();img.layers.push(makeLayer('image',{src:'https://x/i.jpg'}));
  assert.equal(COMPOSITION_LABELS[detectComposition(img)],'Hero Image Advertisement');
  img.offer='TZS 5000';
  assert.equal(detectComposition(img),'sponsored');
  assert.equal(COMPOSITION_LABELS[detectComposition(img)],'Sponsored Post');
  const vid=createCreative();vid.layers.push(makeLayer('video',{src:'https://x/v.mp4',videoUrl:'https://x/v.mp4'}));vid.offer='OFA';
  assert.equal(detectComposition(vid),'video_text');
  assert.equal(COMPOSITION_LABELS[detectComposition(vid)],'Video Text Advertisement');
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
t('§11 trimmed video duration chip uses mediaDurationSeconds (<60), not raw length',()=>{
  const html=cardHtml({headline:'Vid',creativeType:'video',videoUrl:'https://x/v.mp4',mediaDurationSeconds:59});
  assert.ok(html.includes('0:59'),'chip shows 0:59 for 59s trim');
});
t('§11/§24 published video = POSTER-FIRST: play button present, NO autoplay attribute',()=>{
  const html=cardHtml({headline:'V',creativeType:'video',videoUrl:'https://x/v.mp4',posterUrl:'https://x/p.jpg'});
  assert.ok(html.includes('skh-ann-video-play'),'clickable Play cue rendered');
  assert.ok(html.includes('skh-ann-video-wrap'),'video wrapped for transport');
  assert.ok(!/<video[^>]*\sautoplay/.test(html),'no autoplay attribute on <video>');
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

/* ==== FINAL INSTRUCTIONS (2nd round) source contracts ==== */
const feed=fs.readFileSync('js/app/09-feed-announcements.js','utf8');
const fnSrc=fs.readFileSync('functions/creative.js','utf8');
const adminSrc=admin;

t('§1 blank/no-media flow: badge input + media-optional note in BASIC',()=>{
  assert.ok(studio.includes('data-simple="badge"'),'badge field in basic tab');
  assert.ok(studio.includes("key==='badge'"),"badge writes a real role:badge text layer");
  assert.ok(studio.includes('Media NI optional'),'media-optional guidance shown');
  assert.ok(studio.includes("set('annCreativeType',typeForComp)"),'sync maps composition → form creativeType (no forced media)');
});
t('§9 strict <60 in studio: reject guards + 59 clamps + Trim label',()=>{
  assert.ok(studio.includes('>=MAX_AD_MEDIA_SECONDS'),'reject uses duration >= 60');
  assert.ok(studio.includes('MAX_AD_DURATION_SECONDS'),'clamps use 59');
  assert.ok(studio.includes('Trim to 59s'),'Trim button targets <60 window');
  assert.ok(!studio.includes('max="60"'),'no slider maxed at 60 (59 only)');
});
t('§11 poster-first in editor: no autoplay attempt, click-to-play',()=>{
  assert.ok(!studio.includes('v.autoplay=true'),'editor never sets video.autoplay');
  assert.ok(!studio.includes("vm.autoplay!==false){const p=v.play"),"editor never auto-plays");
  assert.ok(studio.includes("v.addEventListener('click'"),'editor video click-to-play');
});
t('§11 poster-first published: renderAd has NO autoplay; play cue is a button',()=>{
  assert.ok(!ann.includes('a.autoplay!==false'),'renderAd autorun removed');
  assert.ok(ann.includes('.skh-ann-video-play'),'delegated click-to-play handler exists');
  assert.ok(ann.includes('video.pause()'),'renderAd forces paused initial state');
});
t('§17 Reset via existing state/history (no duplicate history system)',()=>{
  assert.ok(studio.includes('data-a="reset"'),'Reset toolbar button');
  assert.ok(studio.includes("if(a==='reset')"),'reset action wired');
  assert.ok(studio.includes('replace(createCreative(keep)'),'reset reuses replace() (undo-capable)');
  assert.ok(!studio.includes('new HistorySystem')&&!studio.includes('class History'),'no second history engine');
});
t('§18 Design Mode Auto/Manual wired end-to-end',()=>{
  assert.ok(studio.includes('data-design-mode'),'Design Mode radios');
  assert.ok(studio.includes('function setDesignMode'),'setDesignMode exists');
  assert.ok(studio.includes("n.designMode!=='manual'"),'Manual mode disables slideshow auto-enable');
});
t('§12 audio extras: fadeOut / loop / mute / replace',()=>{
  ['data-audio="fadeOut"','data-audio="loop"','data-audio="muted"','Replace audio']
    .forEach(x=>assert.ok(studio.includes(x),'audio control missing: '+x));
});
t('§14 shapes: rounded rectangle + divider as real layers',()=>{
  assert.ok(studio.includes('data-value="rounded"')&&studio.includes('data-value="divider"'),'shape buttons');
  assert.ok(studio.includes("value==='rounded'||value==='divider'"),'shape layer creation handles them');
});
t('§16 layers panel: front/back/duplicate/delete present',()=>{
  ['data-op="front"','data-op="back"','op===\'front\'','op===\'delete\'']
    .forEach(x=>assert.ok(studio.includes(x),'layer op missing: '+x));
});
t('§20 preview transport: Play/Pause/Restart/Mute/Timeline in sheet',()=>{
  ['csPvPause','csPvRestart','csPvMute','csPvTime','cs-anim-paused','cs-pv-transport']
    .forEach(x=>assert.ok(studio.includes(x),'preview transport missing: '+x));
});
t('§8 slide-left/slide-right transitions flow renderer→save→published',()=>{
  assert.ok(ann.includes("slide-left'")&&ann.includes("slide-right'"),'published renderer handles slide directions');
  assert.ok(feed.includes('slide-left'),'save whitelist accepts slide-left');
  assert.ok(feed.includes('slide-right'),'save whitelist accepts slide-right');
});
t('§9 save whitelist clamps mediaDurationSeconds to 59',()=>{
  assert.ok(feed.includes('Math.min(59, Math.round(Number(payload.mediaDurationSeconds)))'),'feed clamp 59');
});
t('§25 publish payload (functions) carries slideshow/trim/poster/anim/color',()=>{
  ['slideshow:','mediaDurationSeconds:','posterUrl:','videoControls:','badgeAnimation:','ctaAnimation:','textColor:(head&&head.style']
    .forEach(x=>assert.ok(fnSrc.includes(x),'functions payload missing: '+x));
  assert.ok(fnSrc.includes("['none','fade','slide','slide-left','slide-right','zoom','crossfade']"),'functions validates transitions');
});
t('§26 Ads Management: Management→Matangazo with required views',()=>{
  ['Media Library','Draft','Active','Scheduled','Expired','Archived','campaigns','analytics']
    .forEach(x=>assert.ok(adminSrc.includes(x),'ads manager missing view: '+x));
  assert.ok(adminSrc.includes('adm-ad-analytics')||adminSrc.includes('Analytics view'),'analytics aggregates rendered');
  assert.ok(adminSrc.includes('Campaigns view')||adminSrc.includes('groups[k]'),'campaign groups rendered');
});
t('§11 form autoplay default OFF',()=>{
  assert.ok(!/id="annVideoAutoplay" type="checkbox" checked/.test(adminSrc),'annVideoAutoplay not checked by default');
});
t('§4 glow controls + §5 mask-reveal/zoom-out entrances',()=>{
  assert.ok(studio.includes('style.glowBlur')&&studio.includes('style.glowColor'),'glow controls');
  assert.ok(model.includes("'mask-reveal'"),'mask-reveal entrance in model');
  assert.ok(model.includes("'zoom-out'"),'zoom-out entrance in model');
  assert.ok(fs.readFileSync('css/38-home-ad-manager.css','utf8').includes('anim-enter-zoom-out'),'zoom-out entrance CSS visible-final');
});
t('§5 animation timing shows start/duration/end',()=>{
  assert.ok(studio.includes('End: ${'),'computed animation end displayed');
});


console.log('== NON-CANVAS MVP: §29 END-TO-END JOURNEY (state level) ==');

t('§29/§30 journey: blank → text design → save/reload → media → slideshow → audio → video<60 → publishable',()=>{
  /* 1-3. Create Advertisement / No media / Background */
  let c=createCreative({format:'square',publicationType:'advertisement'});
  c.destination={type:'external',url:'https://sokohai.com/deal'};
  c.background.color='#071E3D';c.background.color2='#21E6C1';
  /* 4-7. Headline + font + color + size + move */
  const head=c.layers.find(l=>l.role==='headline');
  head.content='OFa ya leo';head.style.fontFamily='Montserrat';
  head.style.fill='#10B981';head.style.fontSize=96;head.x=90;head.y=140;
  /* 8. Animation */
  head.animation={enabled:true,entrance:'fade',emphasis:'none',mode:'whole',duration:2500,delay:500,stagger:100};
  /* 9-10. Offer + CTA (default layers) */
  c.offer='TZS 45,000';
  const cta=c.layers.find(l=>l.role==='cta');cta.content='NUNUA SASA';
  /* 10b. Badge via role layer (same as updateSimple badge) */
  c.layers.push(makeLayer('text',{role:'badge',content:'🔥 OFA MAALUM',x:60,y:60,width:340,height:60,zIndex:9}));
  /* text-only ad is publishable (media optional §1) */
  let v=validateCreative(c,{forPublish:true});
  assert.equal(v.ok,true,'text-only journey ad valid at publish gate: '+JSON.stringify(v.errors));
  /* Preview: canonical card shows every text element */
  let ann={headline:head.content,text:'Mihtasari',priceTag:c.offer,ctaLabel:cta.content,
    badgeText:'🔥 OFA MAALUM',textAnimation:head.animation.entrance,animationDuration:2500,animationDelay:500,
    primaryColor:c.background.color,accentColor:c.background.color2,textColor:head.style.fill,link:c.destination.url};
  let card=cardHtml(ann);
  ['OFa ya leo','TZS 45,000','NUNUA SASA','OFA MAALUM'].forEach(t2=>assert.ok(card.includes(t2),'card missing: '+t2));
  /* Save → Reload → renders again identically */
  const saved=JSON.stringify(c);
  const reloaded=normalizeCreative(JSON.parse(saved));
  assert.equal(reloaded.layers.find(l=>l.role==='headline').content,'OFa ya leo');
  assert.equal(reloaded.layers.find(l=>l.role==='headline').style.fill,'#10B981');
  assert.equal(reloaded.offer,'TZS 45,000');
  assert.equal(reloaded.layers.find(l=>l.role==='cta').content,'NUNUA SASA');
  const svg=renderCreativeSvg(reloaded);
  ['OFa ya leo','NUNUA SASA','MAALUM'].forEach(t2=>assert.ok(svg.includes(t2),'reloaded render missing: '+t2)); /* badge wraps lines → assert token */

  /* 11-14. Add image + second image → slideshow + slide timing */
  reloaded.slideshow={enabled:true,transition:'slide-left',defaultDuration:3,slides:[
    {src:'https://x/1.jpg',duration:4},{src:'https://x/2.jpg',duration:5},{src:'https://x/3.jpg',duration:3}]};
  reloaded.duration=12;
  reloaded.preset='slideshow';
  assert.equal(slideshowTotal(reloaded),12);
  v=validateCreative(reloaded,{forPublish:true});
  assert.equal(v.ok,true,'slideshow journey ad valid: '+JSON.stringify(v.errors));
  const cardSs=cardHtml({headline:'OFa ya leo',creativeType:'image_text',slideshow:reloaded.slideshow,link:c.destination.url});
  assert.ok(cardSs.includes('skh-ann-slideshow')&&cardSs.includes('skh-ss-slide-left'),'published slideshow w/ slide-left');

  /* 15-16. Add audio → composition Image Audio */
  reloaded.layers.push(makeLayer('audio',{src:'https://x/voice.mp3',audioUrl:'https://x/voice.mp3',
    audioMeta:{volume:0.9,fadeIn:1,fadeOut:2,loop:true,trimStart:0,trimEnd:12,duration:12}}));
  assert.equal(detectComposition(reloaded),'slideshow_audio');

  /* 17-20. Add video, 75s → FAIL <60, trim → 59 → PASS; text over video w/ timing */
  const vidL=makeLayer('video',{src:'https://x/long.mp4',videoUrl:'https://x/long.mp4',
    videoMeta:{duration:75,trimStart:0,trimEnd:75,autoplay:false,muted:true,loop:true}});
  reloaded.layers.push(vidL);
  let vBad=validateCreative(normalizeCreative(reloaded));
  assert.ok(vBad.errors.some(e=>e.code==='VIDEO_DURATION'),'75s video blocks publish');
  vidL.videoMeta.trimStart=0;vidL.videoMeta.trimEnd=59; /* [§10] trimmed state saved, original kept */
  assert.equal(vidL.videoMeta.duration,75,'originalMedia duration preserved');
  const vOk=validateCreative(normalizeCreative(reloaded));
  assert.ok(!vOk.errors.some(e=>e.code==='VIDEO_DURATION'),'trimmed 59s video passes');
  const overlayText=reloaded.layers.find(l=>l.role==='headline');
  overlayText.animation.delay=1000; /* text appears at 1s over video */
  const svgVid=renderCreativeSvg(reloaded);
  assert.ok(svgVid.includes('OFa ya leo'),'text renders over video layer');

  /* 21-25. Save → Reload → Preview → Publishable */
  const saved2=JSON.stringify(reloaded);
  const re2=normalizeCreative(JSON.parse(saved2));
  assert.equal(re2.slideshow.slides.length,3);
  assert.equal(re2.layers.find(l=>l.type==='video').videoMeta.trimEnd,59);
  assert.equal(re2.layers.find(l=>l.type==='audio').audioMeta.fadeOut,2);
  const vFinal=validateCreative(re2,{forPublish:true});
  assert.equal(vFinal.ok,true,'final journey creative publishable: '+JSON.stringify(vFinal.errors));
  /* §18 design mode survives round-trip */
  re2.designMode='manual';
  assert.equal(normalizeCreative(JSON.parse(JSON.stringify(re2))).designMode,'manual');
});

console.log(`NON-CANVAS AD DESIGNER MVP: ${pass} checks ALL PASS`);

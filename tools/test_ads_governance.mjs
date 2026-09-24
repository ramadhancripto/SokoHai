import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createCreative, makeLayer, normalizeCreative, validateCreative,
  creativeToAdvertisement, MAX_AD_DURATION_SECONDS, MIN_AD_DURATION_SECONDS,
  MAX_SLIDESHOW_SLIDES, MAX_SLIDE_DURATION_SECONDS, TEXT_ROLE_LIMITS,
  TEXT_ROLE_SIZES, ANIMATION_LIMITS, DEFAULT_SLIDE_DURATION_SECONDS
} from '../js/app/creative/creative-model.js';
import {
  basicFormFromCreative, buildBasicCreative, validateBasicCreative,
  basicCreativeAnnouncement
} from '../js/app/creative/basic-ad-creative.js';

const root=process.cwd();
const rules=globalThis.SokoHaiAdsDesignRules;
assert.ok(rules,'browser/Node share the Ads Design rules module');
let pass=0;
function test(name,fn){fn();pass++;console.log('  ✓ '+name);}
function clone(value){return JSON.parse(JSON.stringify(value));}
function withoutVolatile(value){const x=clone(value);delete x.updatedAt;return x;}

console.log('== Shared Ads Design governance ==');

test('Basic and Advanced use the exact same canonical validation and projection exports',()=>{
  assert.equal(validateBasicCreative({},createCreative()).ruleErrors instanceof Array,true);
  const sample=createCreative({format:'square'});
  assert.deepEqual(validateCreative(sample),rules.validateCreative(sample));
  assert.equal(creativeToAdvertisement,rules.creativeToAdvertisement);
  const projected=basicCreativeAnnouncement({});
  assert.ok(projected&&typeof projected==='object');
  assert.equal(typeof creativeToAdvertisement,'function');
});

test('shared limits govern duration, text, animation and slideshow controls',()=>{
  assert.equal(MAX_AD_DURATION_SECONDS,59);
  assert.equal(MIN_AD_DURATION_SECONDS,1);
  assert.equal(MAX_SLIDESHOW_SLIDES,12);
  assert.equal(MAX_SLIDE_DURATION_SECONDS,30);
  assert.equal(DEFAULT_SLIDE_DURATION_SECONDS,3);
  assert.equal(TEXT_ROLE_LIMITS.headline,120);
  assert.deepEqual(TEXT_ROLE_SIZES.headline,{min:18,max:120});
  assert.deepEqual(ANIMATION_LIMITS.duration,{min:100,max:3000});
});

test('Basic edit with no changes preserves the canonical Advanced state',()=>{
  const original=createCreative({format:'square',ownerId:'owner-1'});
  original.id='creative-roundtrip';
  original.type='advertisement';
  original.basicType='image_text';
  original.destination={type:'external',url:'https://shop.example/item'};
  original.durationAuto=false;
  original.duration=18;
  original.displayDurationSeconds=12;
  original.metadata={source:'advanced-studio',preset:'custom-preset',extra:'keep'};
  original.background={...original.background,type:'pattern',opacity:.63,pattern:'dots',patternOpacity:.21,frameOpacity:.77,borderRadius:19,extra:'keep'};
  original.brandKit={name:'Brand',logoUrl:'https://shop.example/logo.png',primary:'#0E7A5F',secondary:'#167A91',extra:'keep'};
  original.audioMix={originalVideoVolume:.32,musicVolume:.7,voiceVolume:.8,extra:'keep'};
  original.timeline=[{id:'timeline-1',start:2,end:7,extra:'keep'}];
  original.slideshow={enabled:false,transition:'zoom',defaultDuration:4,slides:[{src:'https://shop.example/a.jpg',duration:6,customSlideField:'keep'}],extension:{keep:true}};
  const headline=original.layers.find(layer=>layer.role==='headline');
  headline.name='Advanced headline layer';
  headline.content='Original headline';
  headline.style={...headline.style,fill:'#123456',fontSize:82,fontWeight:700,letterSpacing:2,textDecoration:'underline',lineHeight:1.4,customStyle:'keep'};
  headline.animation={...headline.animation,enabled:true,entrance:'reveal',emphasis:'pulse',exit:'fade-out',duration:1300,delay:120,stagger:0,repeat:2,easing:'linear',customAnimation:'keep'};
  const body=original.layers.find(layer=>layer.role==='body');
  body.name='Advanced body layer';body.content='Body copy';body.style={...body.style,fontWeight:550,lineHeight:1.5,stroke:'#101010',custom:'keep'};
  const cta=original.layers.find(layer=>layer.role==='cta');
  cta.name='Advanced CTA layer';cta.content='Nunua Sasa';cta.style={...cta.style,fill:'#ABCDEF',radius:999,ctaStyle:'outline',fontWeight:600,custom:'keep'};
  cta.animation={...cta.animation,enabled:true,entrance:'pulse',emphasis:'glow',duration:900,custom:'keep'};
  const advancedVideo=makeLayer('video',{
    id:'advanced-video',name:'Unmanaged Advanced video',role:'advanced-media',
    src:'https://shop.example/video.mp4',videoUrl:'https://shop.example/video.mp4',
    videoMeta:{duration:91,trimStart:4,trimEnd:47,loop:false,muted:false,autoplay:true,controls:true,poster:'poster.jpg',custom:'keep'}
  });
  original.layers.push(advancedVideo);
  const form=basicFormFromCreative(original,{});
  const unchanged=buildBasicCreative({...form,changedFields:[]},original);
  assert.deepEqual(withoutVolatile(unchanged),withoutVolatile(normalizeCreative(original)));
});

test('changing one Basic text field preserves unexposed style, layer identity, video metadata and design extensions',()=>{
  const original=createCreative({format:'square',ownerId:'owner-2'});
  original.id='creative-hidden-fields';original.basicType='image_text';
  original.destination={type:'external',url:'https://shop.example'};
  original.metadata={source:'advanced-source',preset:'advanced-preset',extra:'keep'};
  original.background={...original.background,type:'pattern',opacity:.47,pattern:'grain',patternOpacity:.2,frameOpacity:.71,borderRadius:18};
  original.brandKit={name:'Hidden Brand',logoUrl:'https://shop.example/logo.png',extra:'keep'};
  const headline=original.layers.find(layer=>layer.role==='headline');
  headline.name='Preserve this name';headline.content='Before';
  headline.style={...headline.style,fill:'#142A3B',fontSize:76,fontWeight:700,textDecoration:'underline',letterSpacing:3,custom:'keep'};
  headline.animation={...headline.animation,enabled:true,entrance:'reveal',emphasis:'pulse',exit:'fade-out',duration:1400,delay:180,stagger:30,repeat:4,easing:'linear',custom:'keep'};
  const body=original.layers.find(layer=>layer.role==='body');
  body.name='Body Name';body.content='Existing body';body.style={...body.style,fontWeight:550,lineHeight:1.45,stroke:'#111111',custom:'keep'};
  const price=makeLayer('text',{id:'price-layer',role:'price',name:'Price layer',content:'Offer',style:{fontSize:24,padding:17,radius:27,custom:'price-style'}});
  original.layers.push(price);
  const badge=makeLayer('text',{id:'badge-layer',role:'badge',name:'Badge layer',content:'Badge',style:{fontSize:14,padding:14,radius:999,shadowOpacity:.4,custom:'badge-style'}});
  original.layers.push(badge);
  const cta=original.layers.find(layer=>layer.role==='cta');
  cta.name='CTA Name';cta.content='Nunua Sasa';cta.style={...cta.style,fill:'#ABCDEF',ctaStyle:'outline',radius:999,custom:'cta-style'};
  cta.animation={...cta.animation,enabled:true,entrance:'pulse',emphasis:'glow',duration:950,custom:'cta-animation'};
  original.layers.push(makeLayer('video',{
    id:'advanced-video',name:'Advanced media stays untouched',role:'advanced-video',src:'https://shop.example/v.mp4',
    videoUrl:'https://shop.example/v.mp4',videoMeta:{duration:100,trimStart:5,trimEnd:62,loop:false,muted:false,autoplay:true,controls:true,posterUrl:'poster.jpg',custom:'keep'}
  }));
  const form=basicFormFromCreative(original,{});
  const edited=buildBasicCreative({...form,headline:'After',changedFields:['headline']},original);
  const h=edited.layers.find(layer=>layer.role==='headline');
  assert.equal(h.content,'After');
  assert.equal(h.name,'Preserve this name');
  assert.deepEqual(h.animation,original.layers.find(layer=>layer.role==='headline').animation);
  assert.equal(h.style.textDecoration,'underline');assert.equal(h.style.custom,'keep');
  assert.equal(edited.layers.find(layer=>layer.role==='body').name,'Body Name');
  assert.deepEqual(edited.layers.find(layer=>layer.role==='body').style,original.layers.find(layer=>layer.role==='body').style);
  assert.deepEqual(edited.layers.find(layer=>layer.role==='price').style,original.layers.find(layer=>layer.role==='price').style);
  assert.deepEqual(edited.layers.find(layer=>layer.role==='badge').style,original.layers.find(layer=>layer.role==='badge').style);
  assert.equal(edited.layers.find(layer=>layer.role==='cta').name,'CTA Name');
  assert.deepEqual(edited.layers.find(layer=>layer.role==='cta').style,original.layers.find(layer=>layer.role==='cta').style);
  assert.deepEqual(edited.layers.find(layer=>layer.role==='cta').animation,original.layers.find(layer=>layer.role==='cta').animation);
  assert.deepEqual(edited.layers.find(layer=>layer.id==='advanced-video'),original.layers.find(layer=>layer.id==='advanced-video'));
  assert.equal(edited.background.type,'pattern');assert.equal(edited.background.opacity,.47);assert.equal(edited.background.pattern,'grain');
  assert.deepEqual(edited.brandKit,original.brandKit);
  assert.deepEqual(edited.metadata,original.metadata);
  assert.deepEqual(edited.slideshow,original.slideshow);
});

test('Basic type changes explicitly manage tagged/legacy media; unrelated Basic edits do not',()=>{
  const original=createCreative({format:'square',ownerId:'owner-3'});
  original.basicType='image_text';
  original.destination={type:'external',url:'https://shop.example'};
  original.layers.push(makeLayer('video',{id:'advanced-video',role:'',name:'Advanced clip',src:'https://shop.example/v.mp4',videoUrl:'https://shop.example/v.mp4',videoMeta:{duration:90,trimStart:0,trimEnd:50,loop:false,muted:false,controls:true}}));
  const form=basicFormFromCreative(original,{});
  const textEdit=buildBasicCreative({...form,headline:'Edit headline',changedFields:['headline']},original);
  assert.equal(textEdit.layers.find(layer=>layer.id==='advanced-video').role,'');
  assert.equal(textEdit.layers.find(layer=>layer.id==='advanced-video').visible,true);
  const typeEdit=buildBasicCreative({...form,creativeType:'video_text',creativeTypeChanged:true,changedFields:['creativeType']},original);
  assert.equal(typeEdit.layers.find(layer=>layer.id==='advanced-video').role,'basic-video');
  assert.equal(typeEdit.layers.find(layer=>layer.id==='advanced-video').name,'Advanced clip');
  assert.equal(typeEdit.layers.find(layer=>layer.id==='advanced-video').videoMeta.controls,true);
  assert.equal(typeEdit.layers.find(layer=>layer.id==='advanced-video').visible,true);
});

test('Basic↔Advanced slideshow enablement preserves slide metadata and order',()=>{
  const original=createCreative({format:'square',ownerId:'owner-4'});
  original.basicType='image_text';
  original.slideshow={enabled:false,transition:'zoom',defaultDuration:4,slides:[
    {src:'https://shop.example/1.jpg',duration:5,name:'One',custom:'a'},
    {src:'https://shop.example/2.jpg',duration:6,name:'Two',custom:'b'}
  ],extension:'keep'};
  const form=basicFormFromCreative(original,{});
  const changed=buildBasicCreative({...form,creativeType:'slideshow',creativeTypeChanged:true,changedFields:['creativeType']},original);
  assert.equal(changed.slideshow.enabled,true);
  assert.equal(changed.slideshow.transition,'zoom');
  assert.equal(changed.slideshow.slides[0].custom,'a');
  assert.deepEqual(changed.slideshow.slides.map(slide=>slide.src),original.slideshow.slides.map(slide=>slide.src));
  const advanced=normalizeCreative(changed);
  const advancedForm=basicFormFromCreative(advanced,{});
  const back=buildBasicCreative({...advancedForm,changedFields:[]},advanced);
  assert.deepEqual(back.slideshow,advanced.slideshow);
});

test('text-only / graphic ads publish without optional media in Basic and Advanced',()=>{
  const creative=buildBasicCreative({
    creativeType:'solid_text',headline:'Graphic ad without media',description:'No image or video required',
    link:'https://shop.example/text',format:'16:9',timingMode:'custom',creativeDuration:9
  });
  const validation=validateBasicCreative({},creative,{forPublish:true});
  assert.equal(validation.ok,true,JSON.stringify(validation.errors));
  assert.equal(validateCreative(creative,{forPublish:true}).ok,true);
  assert.equal(creative.layers.some(layer=>['image','video','audio'].includes(layer.type)&&layer.visible!==false),false);
});

test('shared validation parity rejects >59s video and slideshow duration identically',()=>{
  const video=normalizeCreative({
    basicType:'video',duration:12,durationAuto:false,displayDurationSeconds:9,
    destination:{type:'external',url:'https://shop.example'},
    canvas:{width:1080,height:1080},
    layers:[makeLayer('video',{id:'video',src:'https://shop.example/video.mp4',videoUrl:'https://shop.example/video.mp4',x:0,y:0,width:1080,height:1080,videoMeta:{duration:90,trimStart:0,trimEnd:60}})]
  });
  const videoBasic=validateBasicCreative({},video,{forPublish:true});
  const videoAdvanced=validateCreative(video,{forPublish:true});
  assert.deepEqual(videoBasic.ruleErrors,videoAdvanced.errors);
  assert.ok(videoBasic.errors.some(error=>error.includes('Video')));
  const slideshow=normalizeCreative({
    basicType:'slideshow',duration:9,durationAuto:false,displayDurationSeconds:9,
    destination:{type:'external',url:'https://shop.example'},canvas:{width:1080,height:1080},
    slideshow:{enabled:true,defaultDuration:30,slides:[{src:'https://shop.example/1.jpg',duration:30},{src:'https://shop.example/2.jpg',duration:30}]},
    layers:[makeLayer('shape',{id:'base',x:0,y:0,width:1080,height:1080})]
  });
  const slideBasic=validateBasicCreative({},slideshow,{forPublish:true});
  const slideAdvanced=validateCreative(slideshow,{forPublish:true});
  assert.deepEqual(slideBasic.ruleErrors,slideAdvanced.errors);
  assert.ok(slideBasic.errors.some(error=>error.includes('Slideshow')));
});

test('Basic and Advanced preview/publish projection is identical',()=>{
  const creative=createCreative({format:'portrait',ownerId:'owner-5'});
  creative.basicType='image_text';creative.destination={type:'external',url:'https://shop.example/offer'};
  creative.slideshow={enabled:true,transition:'crossfade',defaultDuration:3,slides:[{src:'https://shop.example/1.jpg',duration:4},{src:'https://shop.example/2.jpg',duration:5}]};
  const advancedProjection=creativeToAdvertisement(normalizeCreative(creative),{status:'draft'});
  const basicProjection=basicCreativeAnnouncement(creative,{status:'draft'});
  assert.deepEqual(basicProjection,advancedProjection);
});

test('Advanced values outside Basic controls survive normalization and adapter round trip',()=>{
  const legacy={
    id:'legacy',ownerId:'legacy-owner',type:'advertisement',schemaVersion:1,
    customTopLevel:{keep:true},format:'square',duration:12,durationAuto:false,displayDurationSeconds:10,
    destination:{type:'external',url:'https://legacy.example'},
    background:{type:'gradient',filter:{brightness:88,customFilter:true},texture:'grain',futureField:'keep'},
    layers:[makeLayer('text',{id:'legacy-head',role:'headline',name:'Legacy custom layer name',content:'Legacy title',style:{fill:'#123456',fontSize:72,fontWeight:700,customStyle:'keep'},animation:{enabled:true,entrance:'fade',emphasis:'pulse',exit:'fade-out',duration:1200,customAnimation:'keep'}})],
    videoMetadata:{codec:'legacy-codec'},
    slideshow:{enabled:false,transition:'slide-right',defaultDuration:7,slides:[],custom:'keep'}
  };
  const normalized=normalizeCreative(legacy);
  const form=basicFormFromCreative(normalized,{});
  const roundtrip=buildBasicCreative({...form,changedFields:[]},normalized);
  assert.deepEqual(roundtrip.customTopLevel,legacy.customTopLevel);
  assert.deepEqual(roundtrip.videoMetadata,legacy.videoMetadata);
  assert.equal(roundtrip.layers[0].name,'Legacy custom layer name');
  assert.equal(roundtrip.layers[0].style.customStyle,'keep');
  assert.equal(roundtrip.layers[0].animation.customAnimation,'keep');
  assert.equal(roundtrip.slideshow.custom,'keep');
  assert.equal(roundtrip.background.futureField,'keep');
});

test('Cloud Functions packaging includes the exact same rules module',()=>{
  const firebase=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'functions/package.json'),'utf8'));
  const source=fs.readFileSync(path.join(root,'shared/ads-design-rules.js'),'utf8');
  const deployed=fs.readFileSync(path.join(root,'functions/shared/ads-design-rules.js'),'utf8');
  const functionSource=fs.readFileSync(path.join(root,'functions/creative.js'),'utf8');
  assert.equal(firebase.functions.source,'functions');
  assert.ok(firebase.functions.predeploy.some(command=>command.includes('build:shared')));
  assert.equal(pkg.scripts['build:shared'],'node build-shared.js');
  assert.equal(deployed,source);
  assert.ok(functionSource.includes("require(fs.existsSync(packagedRules) ? packagedRules : localRules)"));
  assert.ok(functionSource.includes('ADS_RULES.validateCreative'));
  assert.ok(functionSource.includes('ADS_RULES.creativeToAdvertisement'));
});

test('Basic save/publish/schedule use the shared persistence and Cloud Function routes',()=>{
  const ui=fs.readFileSync(path.join(root,'js/app/16-pos-admin-jobs.js'),'utf8');
  const advanced=fs.readFileSync(path.join(root,'js/app/95-creative-studio.js'),'utf8');
  assert.ok(ui.includes("callFunction('creativeSaveDraft'"));
  assert.ok(ui.includes("callFunction('creativePublish'"));
  assert.ok(ui.includes("action==='schedule'"));
  assert.ok(ui.includes("submitAnnouncementForm('schedule')"));
  assert.ok(!ui.includes('sokohaiSaveAnnouncement('));
  assert.ok(advanced.includes('creativeToAdvertisement(normalizeCreative(creative||{})'));
});

console.log(`ADS GOVERNANCE: ${pass} checks ALL PASS`);

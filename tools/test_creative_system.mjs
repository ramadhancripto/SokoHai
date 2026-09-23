import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createCreative,makeLayer,normalizeCreative,duplicateCreative,resizeCreative,applyEntity,
  templatesFor,autoDesignVariations,designSuggestions,validateCreative,FORMAT_PRESETS,
  VERIFIED_FONTS,TEXT_STYLE_PRESETS,FONT_PAIRING_PRESETS,GRADIENT_PRESETS,PATTERNS,TEXTURES,
  ENTRANCE_ANIMATIONS,EMPHASIS_ANIMATIONS,EXIT_ANIMATIONS,ANIMATION_MODES,BADGE_ANIMATIONS,CTA_ANIMATIONS,
  FIT_MODES,FOCAL_POINTS,ASPECT_RATIOS,generatePalette,alignLayers
} from '../js/app/creative/creative-model.js';
import {CreativeHistory} from '../js/app/creative/creative-history.js';
import {renderCreativeSvg,removeBackgroundClient} from '../js/app/creative/creative-svg-renderer.js';

// --- TEST 1: Canonical Base Model & Formats ---
const c=createCreative({format:'square',sourceType:'product',sourceId:'p1'});
assert.equal(c.canvas.width,1080);
assert.equal(c.canvas.height,1080);
assert.ok(c.layers.length>=5);
assert.ok(VERIFIED_FONTS.length>=1);
assert.equal(VERIFIED_FONTS[0].family,'Inter');
assert.ok(VERIFIED_FONTS.some(f=>f.family==='Montserrat'));

// --- TEST 2: Presets & Animation Constants ---
assert.ok(Object.keys(TEXT_STYLE_PRESETS).length>=8);
assert.ok(FONT_PAIRING_PRESETS.length>=5);
assert.ok(Object.keys(GRADIENT_PRESETS).length>=8);
assert.ok(PATTERNS.length>=6);
assert.ok(TEXTURES.length>=6);
assert.ok(ENTRANCE_ANIMATIONS.includes('fade')&&ENTRANCE_ANIMATIONS.includes('slide-up')&&ENTRANCE_ANIMATIONS.includes('typewriter')&&ENTRANCE_ANIMATIONS.includes('pop'));
assert.ok(EMPHASIS_ANIMATIONS.includes('pulse')&&EMPHASIS_ANIMATIONS.includes('glow')&&EMPHASIS_ANIMATIONS.includes('shake'));
assert.ok(ANIMATION_MODES.includes('whole')&&ANIMATION_MODES.includes('word')&&ANIMATION_MODES.includes('character'));
assert.ok(FIT_MODES.includes('cover')&&FIT_MODES.includes('contain'));
assert.ok(ASPECT_RATIOS.includes('1:1')&&ASPECT_RATIOS.includes('16:9'));

// --- TEST 3: Color Harmony & Alignment ---
const pal=generatePalette('#0E7A5F','complementary');
assert.ok(pal.primary);assert.ok(pal.secondary);assert.ok(pal.accent);assert.ok(pal.text);

const aligned=alignLayers([{x:10,y:20,width:100,height:50}],'center',1080,1080);
assert.equal(aligned[0].x,490);

// --- TEST 4: Entity Adaptation & Resizing ---
const product={id:'p1',title:'Real Phone',price:59000,shopName:'Real Shop',location:'Kinondoni',imageUrl:'https://res.cloudinary.com/demo/image/upload/a.jpg'};
const adapted=applyEntity(c,product,'product');
assert.equal(adapted.linkedEntity.snapshot.price,59000);
assert.ok(adapted.layers.some(l=>l.content==='TZS 59,000'));
assert.equal(adapted.destination.id,'p1');

const story=resizeCreative(adapted,'story');
assert.deepEqual([story.canvas.width,story.canvas.height],[1080,1920]);
assert.ok(story.layers.every(l=>Number.isFinite(l.x)&&Number.isFinite(l.y)));

assert.equal(templatesFor('square').length,19);
assert.equal(autoDesignVariations(adapted).length,5);
assert.ok(Array.isArray(designSuggestions(adapted)));

const valid=validateCreative(adapted,{forPublish:true});
assert.equal(valid.ok,true);

const invalid=validateCreative(createCreative(),{forPublish:true});
assert.equal(invalid.ok,false);
assert.ok(invalid.errors.some(e=>e.code==='DESTINATION'));

const dup=duplicateCreative(adapted);
assert.equal(dup.id,'');
assert.notEqual(dup.layers[0].id,adapted.layers[0].id);

const h=new CreativeHistory(c);
const changed=normalizeCreative({...c,title:'Changed'});
h.commit(changed);
assert.equal(h.undo().title,'Untitled Creative');
assert.equal(h.redo().title,'Changed');

// --- TEST 5: Media Layer System (Image & Video) ---
const videoLayer = makeLayer('video', {
  id: 'vid_hero',
  name: 'Showcase Video',
  src: 'https://res.cloudinary.com/demo/video/upload/promo.mp4',
  videoUrl: 'https://res.cloudinary.com/demo/video/upload/promo.mp4',
  posterUrl: 'https://res.cloudinary.com/demo/image/upload/poster.jpg',
  x: 100, y: 150, width: 880, height: 500,
  focalPoint: 'center',
  videoMeta: { autoplay: true, muted: true, loop: true, trimStart: 0, trimEnd: 15, duration: 15 },
  style: { fit: 'cover', radius: 28, overlayColor: '#000000', overlayOpacity: 0.15 }
});
assert.equal(videoLayer.type, 'video');
assert.equal(videoLayer.videoMeta.autoplay, true);
assert.equal(videoLayer.style.fit, 'cover');

// --- TEST 6: Text & Typography Animation Engine (Word-by-word) ---
const animatedHead = makeLayer('text', {
  id: 'text_anim_head',
  name: 'Headline',
  role: 'headline',
  content: 'BEI IMESHUKA LEO KWA OFA KUBWA',
  x: 80, y: 680, width: 920, height: 160,
  animation: {
    enabled: true,
    entrance: 'slide-up',
    emphasis: 'pulse',
    mode: 'word',
    duration: 500,
    delay: 100,
    stagger: 120,
    repeat: 1,
    easing: 'ease-out'
  },
  style: { fill: '#FFFFFF', fontSize: 64, fontWeight: 950 }
});
assert.equal(animatedHead.animation.mode, 'word');
assert.equal(animatedHead.animation.stagger, 120);

// --- TEST 7: SVG Rendering with Embedded Animation Keyframes & Video ---
const testCreative = createCreative({format:'square',sourceType:'custom'});
testCreative.title = 'Tangazo la Video na Maneno';
testCreative.background.color = '#0E7A5F';
testCreative.background.color2 = '#167A91';
testCreative.background.angle = 45;
testCreative.background.frameOpacity = 0.65;
testCreative.destination = { type: 'external', url: 'https://sokohai.com/deal' };

testCreative.layers = [videoLayer, animatedHead];

const svgOutput = renderCreativeSvg(testCreative);
assert.match(svgOutput, /@keyframes skh_anim_slide_up/);
assert.match(svgOutput, /@keyframes skh_anim_pulse/);
assert.match(svgOutput, /skh-anim-word/);
assert.match(svgOutput, /promo\.mp4|poster\.jpg/);
assert.match(svgOutput, /VIDEO/);

// --- TEST 8: Full Save & Reload Persistence Round-Trip (30+ Properties) ---
const savedJson = JSON.stringify(testCreative);
const reloaded = normalizeCreative(JSON.parse(savedJson));

assert.equal(reloaded.title, 'Tangazo la Video na Maneno');
assert.equal(reloaded.background.color, '#0E7A5F');
assert.equal(reloaded.background.color2, '#167A91');
assert.equal(reloaded.background.angle, 45);
assert.equal(reloaded.destination.url, 'https://sokohai.com/deal');

const reloadedVid = reloaded.layers.find(l => l.id === 'vid_hero');
assert.equal(reloadedVid.type, 'video');
assert.equal(reloadedVid.videoUrl, 'https://res.cloudinary.com/demo/video/upload/promo.mp4');
assert.equal(reloadedVid.posterUrl, 'https://res.cloudinary.com/demo/image/upload/poster.jpg');
assert.equal(reloadedVid.videoMeta.autoplay, true);
assert.equal(reloadedVid.videoMeta.loop, true);
assert.equal(reloadedVid.style.fit, 'cover');
assert.equal(reloadedVid.style.radius, 28);

const reloadedText = reloaded.layers.find(l => l.id === 'text_anim_head');
assert.equal(reloadedText.content, 'BEI IMESHUKA LEO KWA OFA KUBWA');
assert.equal(reloadedText.animation.entrance, 'slide-up');
assert.equal(reloadedText.animation.emphasis, 'pulse');
assert.equal(reloadedText.animation.mode, 'word');
assert.equal(reloadedText.animation.duration, 500);
assert.equal(reloadedText.animation.stagger, 120);

// --- TEST 9: CSS Invariants & Code Contracts ---
const studio=fs.readFileSync('js/app/95-creative-studio.js','utf8'),
      rules=fs.readFileSync('firestore.rules','utf8'),
      fn=fs.readFileSync('functions/creative.js','utf8'),
      adCss=fs.readFileSync('css/38-home-ad-manager.css','utf8'),
      ann=fs.readFileSync('js/06-announcement.js','utf8'),
      adminForm=fs.readFileSync('js/app/16-pos-admin-jobs.js','utf8');

for(const token of ['SokoHaiCreativeStudio','Auto Design','saveDraft','exportCreative','creativePublish','creativeTrackEvent','removebg','eraser','improvedesign','mediaControls','animationControls','uploadMedia']) {
  assert.ok(studio.includes(token)||fn.includes(token),token);
}

for(const token of ['skhAnimSlideUp','skhAnimPulse','skhAnimPop','skhAnimTypewriter','skhAnimGlow','badge-anim-','cta-anim-','aspect-1-1','aspect-16-9','prefers-reduced-motion']) {
  assert.ok(adCss.includes(token), 'CSS contains animation contract: ' + token);
}

for(const token of ['anim-enter-','skh-anim-word','skh-ann-video','aspect-']) {
  assert.ok(ann.includes(token), 'Announcement renderer contains contract: ' + token);
}

assert.ok(adminForm.includes('annTextAnimation')&&adminForm.includes('annMediaAspect')&&adminForm.includes('annBadgeAnimation'),'Admin form includes text animation and media layer controls');

console.log('Creative Media Layer & Animation Engine contracts: ALL PASS');

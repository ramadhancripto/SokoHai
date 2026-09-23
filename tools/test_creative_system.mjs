import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createCreative,makeLayer,normalizeCreative,duplicateCreative,resizeCreative,applyEntity,
  templatesFor,autoDesignVariations,designSuggestions,validateCreative,FORMAT_PRESETS,
  VERIFIED_FONTS,TEXT_STYLE_PRESETS,FONT_PAIRING_PRESETS,GRADIENT_PRESETS,PATTERNS,TEXTURES,
  generatePalette,alignLayers
} from '../js/app/creative/creative-model.js';
import {CreativeHistory} from '../js/app/creative/creative-history.js';
import {renderCreativeSvg,removeBackgroundClient} from '../js/app/creative/creative-svg-renderer.js';

const c=createCreative({format:'square',sourceType:'product',sourceId:'p1'});
assert.equal(c.canvas.width,1080);
assert.equal(c.canvas.height,1080);
assert.ok(c.layers.length>=5);
assert.ok(VERIFIED_FONTS.length>=1);
assert.equal(VERIFIED_FONTS[0].family,'Inter');
assert.ok(VERIFIED_FONTS.some(f=>f.family==='Montserrat'));

// Text & font presets
assert.ok(Object.keys(TEXT_STYLE_PRESETS).length>=8);
assert.ok(FONT_PAIRING_PRESETS.length>=5);
assert.ok(Object.keys(GRADIENT_PRESETS).length>=8);
assert.ok(PATTERNS.length>=6);
assert.ok(TEXTURES.length>=6);

// Color Harmony Generator
const pal=generatePalette('#0E7A5F','complementary');
assert.ok(pal.primary);assert.ok(pal.secondary);assert.ok(pal.accent);assert.ok(pal.text);

// Alignment helpers
const aligned=alignLayers([{x:10,y:20,width:100,height:50}],'center',1080,1080);
assert.equal(aligned[0].x,490);

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

// Rendering with SVG patterns, filters, frames
adapted.background.pattern='dots';
adapted.layers.push(makeLayer('image',{
  id:'test_img',name:'Test Image',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  x:100,y:100,width:200,height:200,
  style:{frameShape:'circle',filter:{brightness:110,contrast:105,saturation:120}}
}));

const svg=renderCreativeSvg(adapted,{guides:true,selectedId:adapted.layers[0].id});
assert.match(svg,/^<svg/);
assert.match(svg,/data-layer-id=/);
assert.match(svg,/text-safe|stroke-dasharray/);
assert.match(svg,/pat_dots/);
assert.match(svg,/clip_test_img/);

const studio=fs.readFileSync('js/app/95-creative-studio.js','utf8'),rules=fs.readFileSync('firestore.rules','utf8'),fn=fs.readFileSync('functions/creative.js','utf8'),scripts=fs.readFileSync('html/21-scripts.html','utf8');
for(const token of ['SokoHaiCreativeStudio','Auto Design','saveDraft','exportCreative','creativePublish','creativeTrackEvent','removebg','eraser','improvedesign']) {
  assert.ok(studio.includes(token)||fn.includes(token),token);
}
for(const token of ['match /creatives/{id}','match /versions/{versionId}','request.resource.data.ownerId == request.auth.uid','allow write: if false'])assert.ok(rules.includes(token),token);
assert.ok(scripts.includes('95-creative-studio.js'));
assert.ok(fn.includes('canonicalEntity'));
assert.ok(fn.includes('immutable:true'));

const adminForm=fs.readFileSync('js/app/16-pos-admin-jobs.js','utf8'),studioCss=fs.readFileSync('css/39-creative-studio.css','utf8');
assert.ok(adminForm.includes('Advanced Design (Optional)'),'familiar advertisement form exposes optional advanced design');
assert.ok(studio.includes("activeTab='content'"),'simple content workflow is default');
assert.ok(studio.includes('Weka maneno yako')&&studio.includes('Weka picha')&&studio.includes('Chagua muonekano'),'guided workflow is understandable');
assert.ok(!studio.includes('window.openAnnouncementFormModal=function'),'Studio does not replace the existing advertisement mechanism');
assert.ok(studioCss.includes('SIMPLE-FIRST MODE'),'simple-first layout contract exists');
assert.ok(studioCss.includes('cs-quick-bar'),'quick action bar styles exist');

console.log('Creative System model/security/integration contracts: ALL PASS');

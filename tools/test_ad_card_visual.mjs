/* AD CARD VISUAL SYSTEM — functional visual QA (2026-09-24).
   Renders the 15 required scenarios through the REAL skhAdvertisementCardHtml
   (js/06-announcement.js) in jsdom and asserts distant-view hierarchy:
   media anchor → headline → offer+CTA row, micro-labels, video cue,
   compact mode, logo behaviour na safe composition rules. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');

const dom=new JSDOM('<body></body>',{url:'https://sokohai.test/',runScripts:'outside-only'});
const w=dom.window;
global.window=w;global.document=w.document;global.localStorage=w.localStorage;global.sessionStorage=w.sessionStorage;
w.eval(fs.readFileSync(new URL('../shared/ads-design-rules.js',import.meta.url),'utf8'));
w.eval(fs.readFileSync(new URL('../js/app/creative/ad-palettes.js',import.meta.url),'utf8'));
w.eval(fs.readFileSync(new URL('../js/06-announcement.js',import.meta.url),'utf8'));
const card=(a,live=false)=>{
  w.document.body.innerHTML=w.skhAdvertisementCardHtml(a,live);
  return w.document.body;
};
const base={creativeType:'image_text',brandName:'Duka Bora',headline:'Ofa Kubwa Wiki Hii',text:'Bidhaa bora kwa bei nafuu',imageUrl:'https://cdn.test/x.jpg',link:'https://x.test/p',ctaLabel:'Nunua Sasa',category:'product'};
let n=0;
const qa=(name,fn)=>{n++;fn();console.log('  QA '+String(n).padStart(2,'0')+' — '+name+' ✔');};

qa('image advertisement',()=>{
  const d=card({...base});
  assert.ok(d.querySelector('.skh-ann-card.skh-comp-product'),'product composition');
  assert.ok(d.querySelector('.skh-ann-media img.skh-ann-media-main'),'media anchor present');
  assert.ok(d.querySelector('.skh-ann-body .skh-ann-title'),'headline inside body after media');
  const media=d.querySelector('.skh-ann-media'),body=d.querySelector('.skh-ann-body');
  assert.ok(media.compareDocumentPosition(body)&w.Node.DOCUMENT_POSITION_FOLLOWING,'media precedes copy (Level-1 anchor)');
  assert.ok(d.querySelector('.skh-ann-micro span'),'category micro-label shown');
  assert.equal(d.querySelectorAll('.skh-ann-micro span').length,1,'only needed labels (no clutter)');
  assert.ok(d.querySelector('.skh-ann-sponsored'),'subtle AD indicator');
});
qa('video advertisement',()=>{
  const d=card({...base,creativeType:'video_text',imageUrl:'',videoUrl:'https://cdn.test/v.mp4',posterUrl:'https://cdn.test/p.jpg',mediaDurationSeconds:24});
  assert.ok(d.querySelector('.skh-ann-card.skh-comp-video'),'video composition');
  const v=d.querySelector('video');
  assert.ok(v,'video element present');
  assert.ok(!v.hasAttribute('controls'),'no full player controls on published card');
  assert.ok(v.hasAttribute('muted')&&v.hasAttribute('playsinline'),'muted + playsinline');
  assert.ok(d.querySelector('.skh-ann-video-cue'),'subtle play indicator');
  assert.equal(d.querySelector('.skh-ann-video-dur').textContent,'0:24','duration chip');
  assert.ok([...d.querySelectorAll('.skh-ann-micro span')].some(s=>s.textContent==='VIDEO'),'VIDEO micro-label');
});
qa('offer advertisement',()=>{
  const d=card({...base,priceTag:'TSh 45,000'});
  assert.ok(d.querySelector('.skh-ann-card.skh-comp-offer'),'offer composition');
  const row=d.querySelector('.skh-ann-post-actions.has-offer');
  assert.ok(row,'offer + CTA share one action row');
  assert.ok(row.querySelector('.skh-ann-offer'),'offer emphasized');
  assert.ok(row.querySelector('.skh-ann-action'),'CTA beside offer');
});
qa('service advertisement',()=>{
  const d=card({...base,category:'service',headline:'Usafi wa Nyumba',priceTag:''});
  assert.ok([...d.querySelectorAll('.skh-ann-micro span')].some(s=>s.textContent==='HUDUMA'),'HUDUMA label');
  assert.ok(d.querySelector('.skh-ann-post-actions:not(.has-offer)'),'no empty offer slot');
});
qa('brand/company advertisement',()=>{
  const d=card({...base,logoUrl:'https://cdn.test/logo.png',campaignName:'Kampeni ya Mwaka'});
  assert.ok(d.querySelector('img.skh-ann-brand-logo'),'brand logo present, controlled size');
  assert.ok(d.querySelector('.skh-ann-brand-copy b').textContent.includes('Duka Bora'));
});
qa('long headline clamped',()=>{
  const long='Maneno mengi sana '.repeat(20);
  const d=card({...base,headline:long});
  const t=d.querySelector('.skh-ann-title').textContent;
  assert.ok(t.length<=121,'headline clamped to readable length');
  assert.ok(t.endsWith('…'));
});
qa('short headline intact',()=>{
  const d=card({...base,headline:'OFYA!'});
  assert.equal(d.querySelector('.skh-ann-title').textContent.trim(),'OFYA!');
});
qa('no logo → fallback mark',()=>{
  const d=card({...base});
  assert.ok(!d.querySelector('img.skh-ann-brand-logo'));
  assert.equal(d.querySelector('.skh-ann-brand-fallback').textContent,'D','initial fallback');
});
qa('logo present → image mark',()=>{
  const d=card({...base,logoUrl:'https://cdn.test/logo.png'});
  assert.ok(d.querySelector('img.skh-ann-brand-logo'));
});
qa('portrait image aspect',()=>{
  const d=card({...base,aspectRatio:'9:16'});
  assert.ok(d.querySelector('.skh-ann-media.aspect-9-16'),'portrait aspect respected');
});
qa('landscape image aspect',()=>{
  const d=card({...base,aspectRatio:'16:9'});
  assert.ok(d.querySelector('.skh-ann-media.aspect-16-9'));
});
qa('busy background → controlled overlay',()=>{
  const d=card({...base,overlayColor:'#000000',overlayOpacity:0.35});
  assert.ok(d.querySelector('.skh-ann-media-overlay'),'overlay rendered');
  assert.ok(d.querySelector('.skh-ann-media-overlay').style.opacity==='0.35');
});
qa('dark image → brightness adjustment honored',()=>{
  const d=card({...base,brightness:130});
  assert.ok(d.querySelector('.skh-ann-media-main').getAttribute('style').includes('brightness(130%)'));
});
qa('light image → saturation adjustment honored',()=>{
  const d=card({...base,saturation:80});
  assert.ok(d.querySelector('.skh-ann-media-main').getAttribute('style').includes('saturate(80%)'));
});
qa('compact mobile card',()=>{
  const d=card({...base,compact:true});
  assert.ok(d.querySelector('.skh-ad-compact'),'compact hook present');
  const css=fs.readFileSync(new URL('../css/38-home-ad-manager.css',import.meta.url),'utf8');
  assert.ok(css.includes('.skh-ad-compact .skh-ann-copy p')&&css.includes('display:none'),'compact hides body text');
  assert.ok(css.includes('.skh-ad-compact .skh-ann-metrics'),'compact hides metrics');
});

/* System-level hierarchy contracts */
qa('CSS spacing/typography tokens exist (no random values)',()=>{
  const css=fs.readFileSync(new URL('../css/38-home-ad-manager.css',import.meta.url),'utf8');
  ['--ad-sp-1','--ad-sp-4','--ad-type-meta','--ad-type-title','--ad-radius-sm','skh-ann-video-cue','skh-comp-video','adm-ad-topnav','skh-ads-panel']
    .forEach(tok=>assert.ok(css.includes(tok),'CSS token missing: '+tok));
});
qa('single subtle ad indicator (no duplication)',()=>{
  const d=card({...base});
  assert.equal(d.querySelectorAll('.skh-ann-sponsored').length,1,'one AD pill');
  assert.ok(!w.document.body.innerHTML.includes('Sponsored · Advertisement'),'redundant double indicator removed');
});
qa('no-media text creative unchanged',()=>{
  const d=card({creativeType:'solid_text',brandName:'SokoHai',headline:'Karibu!',text:'Tangazo la maandishi',link:'https://x.test/'});
  assert.ok(d.querySelector('.skh-ann-text-creative'),'text composition preserved');
  assert.ok(d.querySelector('.skh-comp-text'));
});
qa('Admin Ads top-nav structure',()=>{
  const admin=fs.readFileSync(new URL('../js/app/16-pos-admin-jobs.js',import.meta.url),'utf8');
  ['adm-ad-topnav','adm-ad-topnav-title','Matangazo','+ Tengeneza Tangazo','skh-ads-panel']
    .forEach(s=>assert.ok(admin.includes(s),'top-nav missing: '+s));
  assert.ok(admin.includes("window.skhOpenAdminMediaLibrary('libraryOnly')"),'Media Library action intact');
  assert.ok(admin.includes('window.openAnnouncementFormModal()'),'Create action intact');
});

console.log('\nAD CARD VISUAL QA: '+n+'/'+n+' scenarios PASS ✔');

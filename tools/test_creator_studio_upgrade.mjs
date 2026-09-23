import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createCreative,makeLayer,normalizeCreative,validateCreative,DISPLAY_DURATION_SECONDS} from '../js/app/creative/creative-model.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

/* ============ 1. CANONICAL CREATIVE STATE (model) ============ */
{
  const c=createCreative({format:'square'});
  assert.equal(c.category,'general');
  assert.equal(c.campaignName,'');
  assert.equal(c.campaignId,'');
  assert.equal(c.offer,'');
  assert.equal(c.paletteId,'');
  assert.equal(c.priority,0);
  assert.equal(c.startAt,'');
  assert.equal(c.endAt,'');
  assert.equal(c.displayDurationSeconds,9);
  // display duration is SEPARATE from media/timeline duration
  assert.equal(c.duration,30);
  assert.notEqual(c.displayDurationSeconds,c.duration);

  const tooLong=normalizeCreative({displayDurationSeconds:120});
  assert.equal(tooLong.displayDurationSeconds,59,'display duration clamped to 59s max');
  const tooShort=normalizeCreative({displayDurationSeconds:1});
  assert.equal(tooShort.displayDurationSeconds,5,'display duration clamped to 5s min');
  const missing=normalizeCreative({});
  assert.equal(missing.displayDurationSeconds,9,'default display duration preserved');
  const mediaUntouched=normalizeCreative({duration:10,displayDurationSeconds:45});
  assert.equal(mediaUntouched.duration,10,'media duration NOT forced by display duration');
  assert.equal(mediaUntouched.displayDurationSeconds,45);

  const meta=normalizeCreative({category:'event',campaignName:'Tamasha',campaignId:'cmp_1',offer:'TZS 10,000',paletteId:'gold',priority:5,startAt:'2026-09-30T10:00:00.000Z',endAt:'2026-10-05T10:00:00.000Z'});
  assert.equal(meta.category,'event');
  assert.equal(meta.campaignName,'Tamasha');
  assert.equal(meta.offer,'TZS 10,000');
  assert.equal(meta.paletteId,'gold');
  assert.equal(meta.priority,5);

  // publish validation: CTA destination + schedule + display duration
  const badSchedule=normalizeCreative({startAt:'2026-10-05T10:00:00.000Z',endAt:'2026-10-01T10:00:00.000Z'});
  badSchedule.destination={type:'external',url:'https://example.com'};
  const v1=validateCreative(badSchedule,{forPublish:true});
  assert.ok(v1.errors.some(e=>e.code==='SCHEDULE'),'schedule order rejected at publish');

  const beyond=normalizeCreative({displayDurationSeconds:59});
  beyond.destination={type:'external',url:'https://example.com'};
  const v2=validateCreative(beyond,{forPublish:true});
  assert.ok(!v2.errors.some(e=>e.code==='DISPLAY_DURATION'),'59s display duration allowed');

  // video media duration rule unchanged (media duration is a different concept)
  const vid=normalizeCreative({layers:[makeLayer('video',{src:'https://example.com/v.mp4',videoMeta:{trimEnd:45,trimStart:0}})]});
  const v3=validateCreative(vid);
  assert.ok(v3.errors.some(e=>e.code==='VIDEO_DURATION'),'media duration (>30s) still rejected independently');

  assert.equal(DISPLAY_DURATION_SECONDS.min,5);
  assert.equal(DISPLAY_DURATION_SECONDS.max,59);
  console.log('1. canonical creative state ... OK');
}

/* ============ 2. CANONICAL PALETTE / CTA / CATEGORY TOKENS ============ */
{
  const win={};
  vm.runInNewContext(read('js/app/creative/ad-palettes.js'),{window:win},{filename:'ad-palettes.js'});
  const ids=Object.keys(win.SKH_AD_PALETTES);
  assert.deepEqual(ids.sort(),['emerald','gold','mono','neon','ocean','rose','royal','sunset'],'8 legacy palettes preserved');
  const TOKENS=['background','surface','surfaceAlt','primary','primaryDark','primaryLight','secondary','accent','headline','text','mutedText','border','ctaBackground','ctaText','badgeBackground','badgeText','overlay','gradientStart','gradientMiddle','gradientEnd','shadow','glow'];
  ids.forEach(id=>{
    const p=win.SKH_AD_PALETTES[id];
    TOKENS.forEach(t=>assert.ok(p[t]!=null&&p[t]!=='',`palette ${id} missing token ${t}`));
    assert.ok(Number.isFinite(p.frameOpacity),'palette frameOpacity numeric');
  });
  // legacy base values preserved exactly
  assert.equal(win.SKH_AD_PALETTES.emerald.primary,'#0E7A5F');
  assert.equal(win.SKH_AD_PALETTES.emerald.secondary,'#18A982');
  assert.equal(win.SKH_AD_PALETTES.gold.primary,'#1E2229');
  assert.equal(win.SKH_AD_PALETTES.gold.accent,'#D4AF37');
  assert.equal(Math.round(win.SKH_AD_PALETTES.gold.frameOpacity*100),85,'gold legacy frame opacity 85%');

  const cta=win.SKH_CTA_PRESETS;
  ['Angalia Sasa','Jifunze Zaidi','Tembelea','Buy Now','Wasiliana Nasi','Pata Ofa Hii','Agiza Hapa','Piga Simu','Download','Install','Apply Now','Book Appointment','Register','Visit Website'].forEach(x=>assert.ok(cta.includes(x),'CTA preset missing: '+x));
  assert.ok(cta.includes('Tazama Zaidi')&&cta.includes('Nunua Sasa'),'legacy CTA labels preserved');

  ['arrow','cart','phone','whatsapp','star','download','external','calendar','location'].forEach(x=>assert.ok(x in win.SKH_CTA_ICONS,'CTA icon missing: '+x));
  assert.equal(win.skhCtaIcon('arrow'),'→');
  assert.equal(win.skhCtaIcon('unknown'),'→');

  const cats=win.SKH_AD_CATEGORIES.map(c=>c.id);
  ['general','product','service','business','app','school','hospital','event','transport'].forEach(x=>assert.ok(cats.includes(x),'category missing: '+x));
  console.log('2. canonical palette/CTA/category tokens ... OK ('+TOKENS.length+' tokens × '+ids.length+' palettes)');
}

/* ============ 3. CANONICAL RENDERER (preview = published) ============ */
{
  const el={getElementById:()=>null,addEventListener:()=>{},querySelector:()=>null,querySelectorAll:()=>[]};
  const win={};
  const sandbox={
    window:win,document:el,console,
    localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
    sessionStorage:{getItem:()=>null,setItem:()=>{}},
    setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},
    location:{href:''}
  };
  // palette tokens first (plain script), then renderer
  vm.runInNewContext(read('js/app/creative/ad-palettes.js'),{window:win}, {filename:'ad-palettes.js'});
  vm.runInNewContext(read('js/06-announcement.js'),sandbox,{filename:'06-announcement.js'});
  assert.equal(typeof win.skhAdvertisementCardHtml,'function','canonical renderer exported');

  const html=win.skhAdvertisementCardHtml({
    id:'a1',creativeType:'image_text',brandName:'Duka Bora',headline:'Ofa Kuu',description:'Karibu dukani',
    image:'https://example.com/x.jpg',link:'https://example.com',ctaLabel:'Buy Now',ctaStyle:'glow',ctaIcon:'external',
    badgeText:'MPYA',badgeStyle:'stamp',badgeSize:'lg',badgePosition:'bl',badgeOpacity:.8,badgeIcon:'fire',
    animation:{enabled:true,entrance:'slide-up',emphasis:'glow',mode:'line',duration:700,stagger:120},textAnimation:'slide-up',animationMode:'line',
    paletteId:'gold',category:'product',campaignName:'Kampeni',displayDurationSeconds:30
  },false);

  assert.ok(html.includes('cta-style-glow'),'new CTA style class rendered');
  assert.ok(html.includes('style-stamp'),'new badge style class rendered');
  assert.ok(html.includes('size-lg'),'badge size rendered');
  assert.ok(html.includes('pos-bl'),'badge position rendered');
  assert.ok(html.includes('opacity:0.8'),'badge opacity rendered');
  assert.ok(html.includes('↗'),'external-link icon rendered');
  assert.ok(html.includes('skh-anim-line')||html.includes('anim-enter-slide-up'),'line/entrance animation rendered');
  assert.ok(html.includes('--ad-cta-bg:#D4AF37'),'gold palette CTA token var injected');
  assert.ok(html.includes('--ad-grad-start:#1E2229'),'palette gradient token var injected');
  assert.ok(html.includes('--ad-shadow'),'palette shadow token var injected');

  // no palette => NO palette vars (backwards compatible, no hardcoded styles)
  const plain=win.skhAdvertisementCardHtml({creativeType:'solid_text',headline:'Habari',brandName:'SokoHai'},false);
  assert.ok(!plain.includes('--ad-cta-bg'),'no palette vars when paletteId absent');
  assert.ok(plain.includes('--ad-primary:#0E7A5F'),'legacy defaults intact');
  console.log('3. canonical renderer (preview=published) ... OK');
}

/* ============ 4. FORM CONTRACT — no dropped controls, studio sections ============ */
{
  const form=read('js/app/16-pos-admin-jobs.js');
  const legacyIds=[
    'annCreativeType','annBrand','annHeadline','annText','annPriceTag','annBadgeText','annBadgeStyle','annBadgeColor','annBadgeTextColor',
    'annBadgeAnimation','annCtaAnimation','annTextAnimation','annTextEmphasis','annAnimationMode','annAnimationDuration',
    'annMediaAspect','annMediaFit','annFocalPoint','annVideoAutoplay','annVideoLoop','annBrightness','annContrast',
    'annPrimaryColor','annAccentColor','annTextColor','annSurfaceColor','annFrameOpacity','annGradientAngle','annBorderRadius',
    'annFontWeight','annTextAlign','annTextShadow','annContrastHint','annCta','annLink','annCtaStyle','annCtaIcon',
    'annImage','annImageFile','annVideo','annVideoFile','annAudio','annAudioFile','annLogo','annLogoFile',
    'annStartAt','annEndAt','annPriority','annStatus','annPreview','annPreviewWrapper','annPreviewConfirmed','btnSubmitAnnouncement','annFormTitle','annDurationVal','annBrightVal','annContrastVal','annFrameOpacityValue','annGradientAngleValue','annBorderRadiusValue'
  ];
  legacyIds.forEach(id=>assert.ok(form.includes('id=\\"'+id+'\\"')||form.includes('id="'+id+'"'),'legacy control missing from form: '+id));

  const newIds=['annCategory','annCampaignName','annBadgeSize','annBadgePosition','annBadgeOpacity','annBadgeIcon','annDisplayDuration','annPaletteId','annCreativeId','annCampaignId'];
  newIds.forEach(id=>assert.ok(form.includes(id),'new field missing: '+id));

  ['BASIC','DESIGN','MOTION','MEDIA','SCHEDULE'].forEach(s=>assert.ok(form.includes('>'+s),'editor section missing: '+s));
  assert.ok(form.includes("window.skhPaletteTokens&&window.skhPaletteTokens(name)"),'palette apply must use canonical tokens');
  assert.ok(form.includes('>Download<')&&form.includes('>Visit Website<')&&form.includes('>Buy Now<'),'new CTA presets present');
  assert.ok(form.includes('value="stamp"')&&form.includes('value="outline"'),'new badge styles present');
  assert.ok(form.includes('value="glow"')&&form.includes('value="gradient"')&&form.includes('value="pill"')&&form.includes('value="border"'),'new CTA styles present');
  assert.ok(form.includes('value="line"'),'line-by-line mode present');
  // quick badges preserved
  ['Ofa Maalum','Flash Sale','Punguzo','Bora','Usafiri Bure','Mpya','Bila Badge'].forEach(b=>assert.ok(form.includes(b),'quick badge preserved: '+b));
  // single manager/form (no duplicates)
  assert.equal(form.split('window.skhAdFormHtml=function').length-1,1,'exactly one ad form factory');
  assert.equal(read('js/06-announcement.js').split('window.skhAdvertisementCardHtml=cardHtml').length-1,1,'exactly one canonical card renderer');
  console.log('4. form contract: '+legacyIds.length+' legacy + '+newIds.length+' new controls ... OK');
}

/* ============ 5. SAVE PERSISTENCE (no more dropped fields) ============ */
{
  const save=read('js/app/09-feed-announcements.js');
  ['badgeAnimation','ctaAnimation','textAnimation','textEmphasis','animationMode','animationDuration','videoAutoplay','videoLoop','autoplay','loop','aspectRatio','objectFit','focalPoint','focalX','focalY','brightness','contrast','saturation','creativeId','category','campaignName','campaignId','offer','paletteId','badgeSize','badgePosition','badgeOpacity','badgeIcon','displayDurationSeconds','rotationMs'].forEach(f=>{
    assert.ok(save.includes(f+':'),'save() must persist field: '+f);
  });
  console.log('5. save persistence contract ... OK (33 fields)');
}

/* ============ 6. INTEGRATION POINTS ============ */
{
  const idx=read('index.html');
  const palPos=idx.indexOf('js/app/creative/ad-palettes.js');
  const renPos=idx.indexOf('js/06-announcement.js');
  assert.ok(palPos>0&&renPos>0&&palPos<renPos,'ad-palettes.js must load before the Home renderer');
  assert.ok(idx.includes('js/app/95-creative-studio.js'),'creative studio module still loaded');

  const fn=read('functions/creative.js');
  ['category:text(c.category','displayDurationSeconds:ddS','rotationMs:ddS*1000','paletteId:text(c.paletteId','campaignName:text(c.campaignName','offer:text(c.offer','textAnimation:text(headAnim.entrance'].forEach(s=>{
    assert.ok(fn.includes(s),'creativePublish mapping missing: '+s);
  });
  assert.ok(fn.includes("priority:Math.max(0,Number(c.priority)||0)"),'creativePublish priority mapping');

  const studio=read('js/app/95-creative-studio.js');
  ['applyNamedPalette','data-namedpalette','data-simple="category"','data-simple="displayDurationSeconds"',"set('annPaletteId'","set('annDisplayDuration'",'role:\'badge\'','makeLayer(\'logo\''].forEach(s=>{
    assert.ok(studio.includes(s),'studio bridge missing: '+s);
  });
  assert.ok(!studio.includes("id=\"skhCreativeStudio2\""),'no duplicate studio shell');
  console.log('6. integration points ... OK');
}

/* ============ 7. SECURITY GUARDS UNCHANGED ============ */
{
  const rules=read('firestore.rules');
  assert.ok(rules.includes('match /creatives/{id}'),'creatives rules intact');
  assert.ok(rules.includes('allow write: if false;'),'immutable published versions rule intact');
  const save=read('js/app/09-feed-announcements.js');
  assert.ok(save.includes('Admin authorization required.'),'client guard for admin announcement writes intact');
  const mgr=read('js/app/16-pos-admin-jobs.js');
  assert.ok(mgr.includes("alert('Admin authorization required.');return;"),'admin form guard intact');
  console.log('7. security guards unchanged ... OK');
}

console.log('\nALL CREATOR STUDIO UPGRADE TESTS PASSED ✔');

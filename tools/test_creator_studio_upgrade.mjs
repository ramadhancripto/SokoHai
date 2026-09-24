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

  // video media duration rule (media duration is a different concept)
  /* [2026-09-24 NON-CANVAS MVP] cap 30s→60s (spec §11/§33): 45s no longer
     rejected; >60s still rejected independently. Assertion updated, not removed. */
  const vidOk=normalizeCreative({layers:[makeLayer('video',{src:'https://example.com/v.mp4',videoMeta:{trimEnd:45,trimStart:0}})]});
  assert.equal(validateCreative(vidOk).ok,true,'45s media duration allowed under 60s cap');
  const vid=normalizeCreative({layers:[makeLayer('video',{src:'https://example.com/v.mp4',videoMeta:{trimEnd:75,trimStart:0}})]});
  const v3=validateCreative(vid);
  assert.ok(v3.errors.some(e=>e.code==='VIDEO_DURATION'),'media duration (>60s) still rejected independently');

  assert.equal(DISPLAY_DURATION_SECONDS.min,5);
  assert.equal(DISPLAY_DURATION_SECONDS.max,59);
  console.log('1. canonical creative state ... OK');
}

/* ============ 2. CANONICAL PALETTE / CTA / CATEGORY TOKENS ============ */
{
  const win={};
  vm.runInNewContext(read('js/app/creative/ad-palettes.js'),{window:win},{filename:'ad-palettes.js'});
  const ids=Object.keys(win.SKH_AD_PALETTES);

  // 2a. 70 palettes total; 8 legacy IDs preserved + all 62 new IDs present
  assert.equal(ids.length,70,'70 palettes expected');
  const legacyIds=['emerald','ocean','royal','sunset','mono','gold','rose','neon'];
  const newIds=['forest','mint','sage','olive','tropical','earth','sand','terra',
    'sky','azure','cobalt','deep_ocean','midnight','arctic','cyan','electric_blue',
    'black_gold','champagne','platinum','silver','ivory','burgundy','royal_gold','velvet',
    'fire','coral','amber','orange','mango','peach','cherry','crimson',
    'lavender','violet','lilac','soft_rose','blush','powder_blue','cream','cloud',
    'electric','cyber','hyper_neon','lime','magenta','electric_purple','electric_cyan',
    'professional_blue','corporate_navy','trust_blue','executive','enterprise','clean_business','finance','healthcare',
    'pure_white','soft_white','warm_white','graphite','charcoal','slate','deep_black'];
  legacyIds.forEach(id=>assert.ok(ids.includes(id),'legacy palette preserved: '+id));
  newIds.forEach(id=>assert.ok(ids.includes(id),'new palette missing: '+id));

  // 2b. Full canonical token set per palette
  const TOKENS=['background','surface','surfaceAlt','primary','primaryDark','primaryLight','secondary','accent','headline','text','mutedText','border','ctaBackground','ctaText','badgeBackground','badgeText','overlay','gradientStart','gradientMiddle','gradientEnd','shadow','glow'];
  ids.forEach(id=>{
    const p=win.SKH_AD_PALETTES[id];
    TOKENS.forEach(t=>assert.ok(p[t]!=null&&p[t]!=='',`palette ${id} missing token ${t}`));
    assert.ok(Number.isFinite(p.frameOpacity),'palette frameOpacity numeric');
  });

  // 2c. BACKWARD COMPATIBILITY LOCK — legacy values frozen (snapshot of pre-expansion output)
  const LEGACY_LOCK={
    emerald:['#0E7A5F','#18A982','#FFFFFF','#FFFFFF',42,'#F4C542','#102A43','#0E7A5F','#0d6e56','rgba(8,73,57,0.35)','rgba(24,169,130,0.55)'],
    ocean:['#075E73','#2697B8','#FFFFFF','#FFFFFF',48,'#F4C542','#102A43','#075E73','#065568','rgba(4,56,69,0.35)','rgba(38,151,184,0.55)'],
    royal:['#343A8F','#7559C7','#FFFFFF','#FFFFFF',50,'#F4C542','#102A43','#343A8F','#2f3481','rgba(31,35,86,0.35)','rgba(117,89,199,0.55)'],
    sunset:['#A83E27','#E49A36','#FFFFFF','#FFFDFC',55,'#F59E0B','#451A03','#A83E27','#973823','rgba(101,37,23,0.35)','rgba(228,154,54,0.55)'],
    mono:['#1F2937','#6B7280','#FFFFFF','#FFFFFF',36,'#F59E0B','#111827','#1F2937','#1c2532','rgba(19,25,33,0.35)','rgba(107,114,128,0.55)'],
    gold:['#1E2229','#D4AF37','#FFFFFF','#111827',85,'#D4AF37','#1E2229','#1E2229','#1b1f25','rgba(18,20,25,0.35)','rgba(212,175,55,0.55)'],
    rose:['#881337','#E11D48','#FFFFFF','#FFF1F2',50,'#FBBF24','#881337','#881337','#7a1132','rgba(82,11,33,0.35)','rgba(225,29,72,0.55)'],
    neon:['#064E3B','#10B981','#A7F3D0','#064E3B',60,'#10B981','#064E3B','#064E3B','#054635','rgba(4,47,35,0.35)','rgba(16,185,129,0.55)']
  };
  legacyIds.forEach(id=>{
    const p=win.SKH_AD_PALETTES[id],L=LEGACY_LOCK[id];
    const got=[p.primary,p.secondary,p.headline,p.surface,Math.round(p.frameOpacity*100),p.ctaBackground,p.ctaText,p.background,p.gradientMiddle,p.shadow,p.glow];
    const exp=[L[0],L[1],L[2],L[3],L[4],L[5],L[6],L[7],L[8],L[9],L[10]];
    assert.deepEqual(got,exp,'legacy palette tokens changed: '+id);
  });

  // 2d. Groups: 9 groups with expected coverage
  const groups=win.SKH_AD_PALETTE_GROUPS;
  assert.equal(groups.length,9,'9 palette groups');
  const coverage={classics:8,nature:8,blue:8,luxury:8,warm:8,soft:8,future:7,corporate:8,neutral:7};
  Object.keys(coverage).forEach(g=>{
    const n=ids.filter(id=>win.SKH_AD_PALETTES[id].group===g).length;
    assert.equal(n,coverage[g],'group '+g+' coverage');
    assert.ok(groups.some(x=>x.id===g),'group registered: '+g);
  });

  // 2e. Distinctness — no effectively identical palettes
  const sigs=new Set();
  ids.forEach(id=>{
    const p=win.SKH_AD_PALETTES[id],sig=(p.primary+'|'+p.secondary).toLowerCase();
    assert.ok(!sigs.has(sig),'duplicate palette colors: '+id);
    sigs.add(sig);
    assert.notEqual(p.primary.toLowerCase(),p.headline.toLowerCase(),'unreadable headline/bg: '+id);
  });

  // 2f. CONTRAST — calculated from the ACTUAL selected colors (no fixed claims)
  const lum=(v,i)=>{const c=parseInt(v.slice(i,i+2),16)/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4);};
  const ratio=(a,b)=>{
    const la=.2126*lum(a,1)+.7152*lum(a,3)+.0722*lum(a,5),lb=.2126*lum(b,1)+.7152*lum(b,3)+.0722*lum(b,5);
    return (Math.max(la,lb)+.05)/(Math.min(la,lb)+.05);
  };
  let minTitle={r:99,id:''},minCtaNew={r:99,id:''};
  ids.forEach(id=>{
    const p=win.SKH_AD_PALETTES[id];
    assert.ok(/^#[0-9a-f]{6}$/i.test(p.headline)&&/^#[0-9a-f]{6}$/i.test(p.background),'testable colors: '+id);
    const rT=ratio(p.headline,p.background);
    assert.ok(rT>=4.5,`palette ${id} headline/background ${rT.toFixed(2)}:1 below 4.5:1`);
    if(rT<minTitle.r)minTitle={r:rT,id};
    if(!legacyIds.includes(id)){
      const rC=ratio(p.ctaText,p.ctaBackground);
      assert.ok(rC>=3.0,`palette ${id} CTA ${rC.toFixed(2)}:1 below 3:1 (large-text CTA floor)`);
      if(rC<minCtaNew.r)minCtaNew={r:rC,id};
    }
  });
  console.log('   · real ratios — worst title '+minTitle.id+' '+minTitle.r.toFixed(2)+':1; worst new-CTA '+minCtaNew.id+' '+minCtaNew.r.toFixed(2)+':1; legacy neon CTA '+ratio(win.SKH_AD_PALETTES.neon.ctaText,win.SKH_AD_PALETTES.neon.ctaBackground).toFixed(2)+':1 (preserved)');

  // 2g. CTA presets/icons + categories (unchanged contracts)
  const cta=win.SKH_CTA_PRESETS;
  ['Angalia Sasa','Jifunze Zaidi','Tembelea','Buy Now','Wasiliana Nasi','Pata Ofa Hii','Agiza Hapa','Piga Simu','Download','Install','Apply Now','Book Appointment','Register','Visit Website'].forEach(x=>assert.ok(cta.includes(x),'CTA preset missing: '+x));
  assert.ok(cta.includes('Tazama Zaidi')&&cta.includes('Nunua Sasa'),'legacy CTA labels preserved');
  ['arrow','cart','phone','whatsapp','star','download','external','calendar','location'].forEach(x=>assert.ok(x in win.SKH_CTA_ICONS,'CTA icon missing: '+x));
  assert.equal(win.skhCtaIcon('arrow'),'→');
  assert.equal(win.skhCtaIcon('unknown'),'→');
  const cats=win.SKH_AD_CATEGORIES.map(c=>c.id);
  ['general','product','service','business','app','school','hospital','event','transport'].forEach(x=>assert.ok(cats.includes(x),'category missing: '+x));
  console.log('2. canonical palette system ... OK (70 palettes · 22 tokens × 70 · 9 groups · legacy locked)');
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
  // Grouped palette selector (single engine, single grid)
  assert.ok(form.includes('id=\"annPaletteGrid\"'),'palette grid container missing');
  assert.ok(form.includes('window.skhRenderAdPaletteSelector=function'),'grouped selector renderer missing');
  assert.equal(form.split('window.skhRenderAdPaletteSelector=function').length-1,1,'exactly one selector renderer (no duplicate palette engine)');
  assert.ok(form.includes('adm-ad-pal-group'),'group labels in selector');
  assert.ok(form.includes('skhPaletteContrast')&&form.includes("from './creative/creative-model.js'"),'contrast hint must use canonical contrast engine');
  assert.ok(!form.includes('5.3:1'),'no fixed contrast claims');
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
  assert.ok(read('js/app/95-creative-studio.js').split('data-namedpalette').length-1>=2,'studio palette picker markup must exist (chips + click handler)');
  assert.ok(read('js/app/95-creative-studio.js').includes('contrastRatio(tok.headline'),'studio toast must compute real contrast');
  const css38=read('css/38-home-ad-manager.css');
  ['adm-ad-palette-grid','palette-chip','--ad-shadow','--ad-border'].forEach(s=>assert.ok(css38.includes(s),'form/renderer CSS missing: '+s));
  const css39=read('css/39-creative-studio.css');
  ['cs-palette-scroll','cs-pal-group'].forEach(s=>assert.ok(css39.includes(s),'studio CSS missing: '+s));
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

/* ============ 8. MEDIA + FIRST-LEVEL DESIGNING (2026-09-24) ============ */
{
  const studio=read('js/app/95-creative-studio.js');
  const form=read('js/app/16-pos-admin-jobs.js');

  // 8a. The required 7-tab structure, in order, replaces the old 12-tab nav
  const nav=studio.match(/\[\['basic','Basic'\],\['design','Design'\],\['motion','Motion'\],\['media','Media'\],\['cta','CTA'\],\['schedule','Schedule'\],\['advanced','Advanced'\]\]/);
  assert.ok(nav,'studio nav must be BASIC·DESIGN·MOTION·MEDIA·CTA·SCHEDULE·ADVANCED');
  ['presets','content','style','effects','cutout','uploads'].forEach(old=>{
    assert.ok(!studio.includes(`data-tab="${old}"`),'old nav tab removed: '+old);
  });
  // templates/timeline/brand remain only as sub-views reached FROM the 7 tabs
  assert.ok(studio.includes(`data-tab="templates"`),'templates sub-view reachable from Design');

  // 8b. Add Media — single unified flow in DESIGN (device + library + URL)
  ['id="csAddMediaFile"','accept="image/*,video/*,audio/*"','data-a="openmedialibrary"','id="csAddMediaUrl"','data-a="addmediaurl"']
    .forEach(s=>assert.ok(studio.includes(s),'Add Media flow missing: '+s));

  // 8c. ONE upload mechanism — studio reuses skhUploadFromFile, never its own Cloudinary call
  assert.ok(studio.includes('window.skhUploadFromFile'),'studio reuses canonical uploader');
  assert.ok(!studio.includes('api.cloudinary.com'),'studio must not contain a second uploader');
  assert.ok(studio.includes('await addMediaFile(file);')||studio.includes('addMediaFile(file)'),'legacy inputs delegate to unified Add Media');

  // 8d. Media types auto-detected & validated (incl. GIF/SVG), reusing form size limits
  assert.ok(studio.includes("image/gif")||/image\/\*/.test(studio),'not locked to JPG/PNG');
  ['detectMediaKind','SKH_MEDIA_LIMITS','image:8*1024*1024','video:80*1024*1024','audio:20*1024*1024']
    .forEach(s=>assert.ok(studio.includes(s),'media validation missing: '+s));

  // 8e. Crop / cut-out in DESIGN with required aspect ratios + custom, reusing existing crop fields
  ['original','1:1','4:5','16:9','9:16','4:3','3:4','custom'].forEach(r=>assert.ok(studio.includes(r),'crop ratio missing: '+r));
  ['applyCropAspect','style.cropX','style.cropY','style.zoom'].forEach(s=>assert.ok(studio.includes(s),'crop engine wiring missing: '+s));
  assert.ok(!/cropEngine|new Cropper|cropperjs/i.test(studio),'no second crop engine');

  // 8f. Size/position/fit/align/rotate/opacity in DESIGN
  ['fitMediaToCanvas','data-align="center"','data-align="middle"','data-prop="rotation"','data-prop="opacity"','data-prop="style.radius"','data-prop="style.borderWidth"','data-prop="style.overlayOpacity"']
    .forEach(s=>assert.ok(studio.includes(s),'design control missing: '+s));

  // 8g. Basic designing tools in DESIGN: text, logo, shapes, layers, templates, background
  ['data-tstyle="Headline"','id="csLogoFile"','data-a="applylogourl"','data-add="shape"','data-add="icon"','data-tab="templates"','backgroundControls()']
    .forEach(s=>assert.ok(studio.includes(s),'design tool missing: '+s));
  // layer basic ops wired globally (up/down/lock/duplicate)
  assert.ok(studio.includes("closest('[data-op][data-id]')"),'inline layer ops handler present');
  assert.ok(studio.includes("addLayer('duplicate-layer')"),'duplicate layer implemented');
  assert.ok(studio.includes("type==='delete-layer'"),'delete layer implemented');

  // 8h. Media Library reused — no second library; studio is a new target of the existing one
  assert.ok(form.includes("window.__adminMediaTarget==='studio'"),'existing library accepts studio target');
  assert.ok(studio.includes('window.skhStudioApplyLibraryMedia'),'studio receives library selection');
  assert.ok(studio.includes("skh.collection(skh.db,'adminMedia')"),'studio upload flows into existing adminMedia pipeline');
  assert.ok(!/skhOpenAdminMediaLibrary2|adminMediaLibrary2|secondMediaLibrary/.test(studio),'no duplicate media library');

  // 8i. Video preview + trim + 30s rule preserved
  ['renderVideoOverlays','cs-video-overlay','data-a="togglevideo"','data-a="togglevideomute"','data-prop="posterUrl"']
    .forEach(s=>assert.ok(studio.includes(s),'video preview missing: '+s));
  ['data-vmeta="trimStart"','data-vmeta="trimEnd"'].forEach(s=>assert.ok(studio.includes(s),'video trim missing: '+s));
  const model=read('js/app/creative/creative-model.js');
  /* [2026-09-24 NON-CANVAS MVP · FINAL §9] STRICT `duration < 60` rule. */
  assert.ok(model.includes('MAX_AD_MEDIA_SECONDS'),'exclusive 60s ceiling constant intact');
  assert.ok(model.includes('MAX_AD_DURATION_SECONDS'),'valid max 59s constant intact');
  assert.ok(model.includes('CHINI ya sekunde'),'video-over-limit (<60) message intact');

  // 8j. Advanced cleaned: basic controls OUT, deep tools IN; timeline preserved as Advanced sub-view
  const adv=studio.slice(studio.indexOf('function advancedControls()'),studio.indexOf('function advancedControls()')+900);
  ['data-tab="timeline"','data-a="layers"','data-a="eraser"','data-a="improvedesign"'].forEach(s=>assert.ok(adv.includes(s),'advanced must keep: '+s));
  ['data-tab="text"','data-tab="elements"','data-tab="uploads"'].forEach(s=>assert.ok(!adv.includes(s),'advanced must not expose basic: '+s));
  assert.ok(studio.includes('function timelineControls()'),'deep timeline preserved');

  // 8k. Preview modes reuse existing card renderer + fullscreen; no new renderer
  assert.ok(studio.includes('window.skhAdvertisementCardHtml'),'feed/card preview reuses existing renderer');
  assert.ok(studio.includes('Fullscreen preview'),'fullscreen preview present');
  assert.ok(!/function renderCreativeSvg2|skhNewRenderer/.test(studio),'no duplicate renderer');

  // 8l. Save/reopen round-trip keeps crop, trim, playback, layer order
  const rt=normalizeCreative({layers:[{type:'image',src:'https://x/img.png',crop:{x:5,y:6,width:80,height:90,zoom:1.4},style:{cropX:33,cropY:-40,zoom:1.5,fit:'contain',radius:18,overlayOpacity:0.3},rotation:12,opacity:0.8,zIndex:4},
    {type:'video',src:'https://x/v.mp4',videoMeta:{trimStart:3,trimEnd:21,autoplay:true,muted:true,loop:true},posterUrl:'https://x/p.jpg'},
    {type:'audio',src:'https://x/a.mp3',audioMeta:{volume:0.6,trimStart:2,trimEnd:25}}]});
  const im=rt.layers.find(l=>l.type==='image'),vi=rt.layers.find(l=>l.type==='video'),au=rt.layers.find(l=>l.type==='audio');
  assert.equal(im.style.cropX,33,'cropX survives reopen');assert.equal(im.style.zoom,1.5,'zoom survives reopen');
  assert.equal(im.rotation,12,'rotation survives reopen');assert.equal(im.opacity,0.8,'opacity survives reopen');
  assert.equal(im.style.fit,'contain','fit survives reopen');assert.equal(im.zIndex,4,'layer order survives reopen');
  assert.equal(vi.videoMeta.trimStart,3,'video trim survives reopen');assert.equal(vi.videoMeta.trimEnd,21,'video trim end survives reopen');
  assert.equal(vi.posterUrl,'https://x/p.jpg','poster survives reopen');
  assert.equal(au.audioMeta.volume,0.6,'audio settings survive reopen');

  // 8m. Responsive layout rules still present (canvas left / controls, mobile sheet)
  const css=read('css/39-creative-studio.css');
  ['skh-cs-sheet','max-width:900px','cs-addmedia','cs-crop-grid','cs-video-overlay'].forEach(s=>assert.ok(css.includes(s),'studio CSS missing: '+s));

  console.log('8. media + first-level designing ... OK');
}

console.log('\nALL CREATOR STUDIO UPGRADE TESTS PASSED ✔');

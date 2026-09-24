/* SokoHai Creative Studio — pure, reusable design model. No Firebase/DOM dependency. */
export const CREATIVE_SCHEMA_VERSION = 2;
export const FORMAT_PRESETS = Object.freeze({
  square:{label:'Square 1:1',width:1080,height:1080,safe:72},
  portrait:{label:'Portrait 4:5',width:1080,height:1350,safe:72},
  story:{label:'Story 9:16',width:1080,height:1920,safe:90},
  landscape:{label:'Landscape 16:9',width:1200,height:675,safe:54},
  banner:{label:'Banner',width:1200,height:400,safe:44},
  feed:{label:'Feed Post',width:1080,height:1080,safe:72}
});

export const VERIFIED_FONTS = Object.freeze([
  {family:'Inter',category:'Modern',weights:[400,500,600,700,800,900],verified:true},
  {family:'Roboto',category:'Modern',weights:[400,500,700,900],verified:true},
  {family:'Poppins',category:'Bold',weights:[400,600,700,800,900],verified:true},
  {family:'Montserrat',category:'Bold',weights:[400,600,700,800,900],verified:true},
  {family:'Playfair Display',category:'Luxury',weights:[400,600,700,900],verified:true},
  {family:'Oswald',category:'Display',weights:[400,600,700],verified:true},
  {family:'Nunito',category:'Friendly',weights:[400,600,700,800],verified:true}
]);

export const QUICK_COLORS = Object.freeze([
  '#000000','#FFFFFF','#EF4444','#F97316','#F59E0B','#10B981','#0E7A5F','#3B82F6','#1268A8','#8B5CF6','#EC4899','#78350F','#64748B'
]);

export const SOKOHAI_BRAND_COLORS = Object.freeze([
  '#0E7A5F','#18A982','#1268A8','#2B82BD','#102A43','#F4C542','#D4AF37','#FFFFFF','#F8FBFA'
]);

export const GRADIENT_PRESETS = Object.freeze({
  Sunrise:['#FF512F','#F09819'],
  Ocean:['#2193B0','#6DD5ED'],
  Forest:['#134E5E','#71B280'],
  Luxury:['#141E30','#243B55'],
  Emerald:['#0E7A5F','#18A982'],
  Sunset:['#833AB4','#FD1D1D'],
  Warm:['#F12711','#F5AF19'],
  Cool:['#00C9FF','#92FE9D'],
  Soft:['#E0EAFC','#CFDEF3'],
  Dark:['#0F2027','#203A43'],
  Bright:['#7F00FF','#E100FF']
});

/* [NON-CANVAS MVP 2026-09-24] maxDuration 30→60: advertisement media hard cap
   is now MAX_AD_MEDIA_SECONDS (60s) per spec §11/§33. `duration` values stay as
   defaults only. */
/* [FINAL INSTRUCTIONS §9] maxDuration 59 = largest integer with `duration < 60`. */
export const MULTIMEDIA_PRESETS = Object.freeze({
  static: { id: 'static', label: 'Image + Text (Static)', duration: 0, required: ['image', 'text'] },
  motion: { id: 'motion', label: 'Motion Poster (Animated Text)', duration: 6, required: ['image', 'text'] },
  slideshow: { id: 'slideshow', label: 'Slideshow (Multiple Images)', duration: 12, maxDuration: 59, required: ['image', 'text'] },
  short_video: { id: 'short_video', label: 'Short Video (< 60s)', duration: 30, maxDuration: 59, required: ['video'] },
  audio_visual: { id: 'audio_visual', label: 'Audio-Visual (Image + Audio)', duration: 30, maxDuration: 59, required: ['image', 'audio'] },
  video_audio: { id: 'video_audio', label: 'Video + Audio Mix (< 60s)', duration: 30, maxDuration: 59, required: ['video', 'audio'] },
  full_mix: { id: 'full_mix', label: 'Full Multimedia Mix (Image + Video + Audio)', duration: 30, maxDuration: 59, required: ['image', 'video', 'audio', 'text'] },
  story: { id: 'story', label: 'Story Format (9:16)', format: 'story', duration: 15, maxDuration: 59 },
  feed: { id: 'feed', label: 'Feed Card (1:1 / 4:5)', format: 'square', duration: 15, maxDuration: 59 },
  landscape: { id: 'landscape', label: 'Landscape Banner (16:9)', format: 'landscape', duration: 15, maxDuration: 59 }
});

export const PATTERNS = Object.freeze([
  'dots','grid','lines','waves','geometric','circles','squares','diagonal'
]);

export const TEXTURES = Object.freeze([
  'none','paper','grain','noise','fabric','canvas','concrete','vintage','abstract'
]);

export const ENTRANCE_ANIMATIONS = Object.freeze([
  'none','fade','slide-up','slide-down','slide-left','slide-right','zoom-in','zoom-out','pop','bounce','typewriter','reveal','mask-reveal','blur-in'
  /* [NON-CANVAS MVP 2026-09-24] zoom-out added per spec §9 list; renderer keyframes (skh_anim_zoom_out) already exist. */
]);

export const EMPHASIS_ANIMATIONS = Object.freeze([
  'none','pulse','glow','shake','bounce','scale','wobble','highlight'
]);

export const EXIT_ANIMATIONS = Object.freeze([
  'none','fade-out','slide-out','zoom-out','blur-out'
]);

export const ANIMATION_MODES = Object.freeze([
  'whole','word','character','line'
]);

export const BADGE_ANIMATIONS = Object.freeze([
  'none','pop','pulse','glow','slide','scale','shake'
]);

export const CTA_ANIMATIONS = Object.freeze([
  'none','fade','slide','pulse','glow','scale','shine'
]);

export const DISPLAY_DURATION_SECONDS = Object.freeze({min:5,max:59,default:9});
/* Ad placement display time is a SEPARATE concept from media/timeline duration:
   a 10-second video stays a 10-second video; the placement rotator may show the
   same creative for up to ~5..59 seconds depending on placement rules. */

/* [NON-CANVAS MVP 2026-09-24] HARD RULE — FINAL INSTRUCTIONS §9/§19/§33:
   Advertisement media/duration MUST be STRICTLY LESS THAN 60 seconds
   (`duration < 60`): 59s ✅ … 60s ❌ 61s ❌. MAX_AD_MEDIA_SECONDS is the
   EXCLUSIVE ceiling (60); MAX_AD_DURATION_SECONDS is the largest valid
   integer duration (59). Not the same as DISPLAY_DURATION_SECONDS
   (placement rotation time, 5–59s, unchanged). */
export const MAX_AD_MEDIA_SECONDS = 60;
export const MAX_AD_DURATION_SECONDS = 59;

/* [§8] Slideshow transitions (incl. explicit slide-left / slide-right). */
export const SLIDESHOW_TRANSITIONS = Object.freeze(['none','fade','slide','slide-left','slide-right','zoom','crossfade']);

export const FIT_MODES = Object.freeze([
  'cover','contain','fill','original'
]);

export const FOCAL_POINTS = Object.freeze([
  'center','top','bottom','left','right','top-left','top-right','bottom-left','bottom-right'
]);

export const ASPECT_RATIOS = Object.freeze([
  '1:1','4:5','9:16','16:9'
]);

export const TEXT_STYLE_PRESETS = Object.freeze({
  Headline:{fontSize:72,fontWeight:900,lineHeight:1.05,letterSpacing:-1},
  Subheadline:{fontSize:42,fontWeight:700,lineHeight:1.2,letterSpacing:0},
  Body:{fontSize:28,fontWeight:500,lineHeight:1.35,letterSpacing:0},
  Price:{fontSize:56,fontWeight:900,lineHeight:1.1,letterSpacing:0,fill:'#FFFFFF',backgroundColor:'#0E7A5F',padding:14,radius:16},
  Discount:{fontSize:36,fontWeight:900,lineHeight:1.1,fill:'#FFFFFF',backgroundColor:'#EF4444',padding:10,radius:999},
  CTA:{fontSize:30,fontWeight:900,lineHeight:1.1,fill:'#102A43',backgroundColor:'#F4C542',padding:16,radius:999,textAlign:'center'},
  Badge:{fontSize:22,fontWeight:800,lineHeight:1.1,fill:'#FFFFFF',backgroundColor:'#1268A8',padding:8,radius:8},
  Caption:{fontSize:20,fontWeight:600,lineHeight:1.3,opacity:0.85},
  Location:{fontSize:24,fontWeight:700,lineHeight:1.2},
  Contact:{fontSize:26,fontWeight:800,lineHeight:1.2}
});

export const FONT_PAIRING_PRESETS = Object.freeze([
  {name:'Modern Impact',headline:'Montserrat',body:'Inter',category:'Modern'},
  {name:'Bold Commerce',headline:'Poppins',body:'Inter',category:'Business'},
  {name:'Luxury Brand',headline:'Playfair Display',body:'Inter',category:'Luxury'},
  {name:'Urban Punch',headline:'Oswald',body:'Roboto',category:'Display'},
  {name:'Friendly Market',headline:'Nunito',body:'Inter',category:'Friendly'}
]);

const now=()=>new Date().toISOString();
const uid=()=>`ly_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const clean=s=>String(s==null?'':s).replace(/[\u0000-\u001f]/g,' ').trim();
const color=(v,f='#0E7A5F')=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v):f;

export function makeLayer(type,patch={}){
  const common={
    id:uid(),type,x:120,y:120,width:620,height:type==='text'?150:type==='audio'?80:420,
    rotation:0,opacity:1,zIndex:1,locked:false,visible:true,
    name:type[0].toUpperCase()+type.slice(1),groupId:null,
    src:patch.src||'',originalSrc:patch.originalSrc||patch.src||'',
    videoUrl:patch.videoUrl||(type==='video'?patch.src||'':''),
    audioUrl:patch.audioUrl||(type==='audio'?patch.src||'':''),
    posterUrl:patch.posterUrl||'',
    focalPoint:patch.focalPoint||'center',
    startTime:Number.isFinite(+patch.startTime)?+patch.startTime:0,
    endTime:Number.isFinite(+patch.endTime)?+patch.endTime:30,
    duration:Number.isFinite(+patch.duration)?+patch.duration:30,
    crop:{x:0,y:0,width:100,height:100,zoom:1,...(patch.crop||{})},
    videoMeta:{autoplay:false,muted:true,loop:true,trimStart:0,trimEnd:30,duration:0,controls:false,...(patch.videoMeta||{})},
    audioMeta:{volume:1,fadeIn:0,fadeOut:0,loop:true,trimStart:0,trimEnd:30,duration:0,track:'background',...(patch.audioMeta||{})},
    animation:{
      enabled:false,entrance:'none',emphasis:'none',exit:'none',mode:'whole',
      duration:600,delay:0,stagger:100,repeat:1,direction:'normal',easing:'ease-out',
      trigger:'load',intensity:5,...(patch.animation||{})
    }
  };
  const style={
    fill:'#102A43',fontFamily:'Inter',fontSize:72,fontWeight:800,fontStyle:'normal',textDecoration:'none',
    letterSpacing:0,lineHeight:1.1,textAlign:'left',textTransform:'none',
    stroke:'#FFFFFF',strokeWidth:0,strokeOpacity:1,
    shadowColor:'#000000',shadowOpacity:0,shadowBlur:12,shadowX:0,shadowY:5,
    glowColor:'#18A982',glowBlur:0,
    radius:24,borderColor:'#000000',borderWidth:0,backgroundColor:'transparent',padding:0,
    filter:{brightness:100,contrast:100,saturation:100,blur:0,temperature:0,sharpness:0,exposure:100,highlights:100,shadows:100},
    flipX:false,flipY:false,
    frameShape:'rounded',
    fit:'cover',focalX:50,focalY:50,
    overlayColor:'#000000',overlayOpacity:0,
    cropX:0,cropY:0,zoom:1,
    originalSrc:patch.originalSrc||patch.src||'',
    cutoutDataUrl:''
  };
  return {
    ...common,
    content:type==='text'?'Andika hapa':'',
    style,
    ...patch,
    crop:{...common.crop,...(patch.crop||{})},
    videoMeta:{...common.videoMeta,...(patch.videoMeta||{})},
    audioMeta:{...common.audioMeta,...(patch.audioMeta||{})},
    animation:{...common.animation,...(patch.animation||{})},
    style:{...style,...(patch.style||{}),filter:{...style.filter,...((patch.style&&patch.style.filter)||{})}}
  };
}

/* [NON-CANVAS MVP 2026-09-24] Slideshow state (spec §4/§15/§16). Lives INSIDE
   the canonical creative model — no second model. Safe defaults keep every
   existing creative valid (slideshow disabled unless explicitly enabled). */
function normalizeSlideshow(input){
  const base={enabled:false,transition:'fade',defaultDuration:3,slides:[]};
  if(!input||typeof input!=='object')return base;
  const defDur=Math.min(30,Math.max(1,Number(input.defaultDuration)||3));
  const slides=Array.isArray(input.slides)?input.slides.slice(0,12).map(s=>({
    src:clean(s&&s.src),
    duration:Math.min(30,Math.max(1,Number((s&&s.duration)||0)||defDur)),
    name:clean(s&&s.name).slice(0,80)
  })).filter(s=>s.src):[];
  return {
    enabled:!!input.enabled&&slides.length>=1,
    transition:SLIDESHOW_TRANSITIONS.includes(input.transition)?input.transition:'fade',
    defaultDuration:defDur,
    slides
  };
}

/* Sum of per-slide durations (seconds). */
export function slideshowTotal(c){
  const ss=(c&&c.slideshow)||null;
  if(!ss||!Array.isArray(ss.slides)||!ss.slides.length)return 0;
  return ss.slides.reduce((t,s)=>t+(Number(s.duration)||0),0);
}

/* [§24 AUTOMATIC AD COMPOSITION] Detect composition from media present.
   System suggests; the user always keeps manual override (presets/tabs). */
export function detectComposition(c){
  const x=(c&&Array.isArray(c.layers))?c:normalizeCreative(c);
  const ss=x.slideshow;
  const hasSlides=!!(ss&&ss.enabled&&Array.isArray(ss.slides)&&ss.slides.filter(s=>s&&s.src).length>=2);
  const vid=x.layers.some(l=>l.type==='video'&&l.visible!==false&&(l.src||l.videoUrl));
  const img=x.layers.some(l=>(l.type==='image'||l.type==='logo')&&l.visible!==false&&l.src);
  const aud=x.layers.some(l=>l.type==='audio'&&l.visible!==false&&(l.src||l.audioUrl));
  /* [§18] offer/price present → Sponsored Post / Video Text Ad */
  const hasOffer=!!(String(x.offer||'').trim())||x.layers.some(l=>l.role==='price'&&l.visible!==false&&String(l.content||'').trim());
  if(hasSlides)return aud?'slideshow_audio':'slideshow';           // TYPE E
  if(vid&&img)return aud?'full_mix':'image_video';                // TYPE F
  if(vid)return hasOffer?'video_text':(aud?'video_audio':'video');// TYPE B
  if(img)return aud?'image_audio':(hasOffer?'sponsored':'image'); // TYPE A / Sponsored Post
  if(aud)return 'audio';                                          // TYPE C (no poster)
  return 'poster';                                                // Graphic/Text ad (media OPTIONAL §1)
}
/* [FINAL INSTRUCTIONS §9] Labels per Design Mode Auto mapping (§18). */
export const COMPOSITION_LABELS=Object.freeze({
  image:'Hero Image Advertisement',video:'Video Advertisement',audio:'Audio Advertisement',
  image_audio:'Image Audio Advertisement',image_video:'Image + Video Advertisement',
  slideshow:'Slideshow',slideshow_audio:'Slideshow + Audio Advertisement',
  video_audio:'Video + Audio Advertisement',video_text:'Video Text Advertisement',
  full_mix:'Full Multimedia Ad',poster:'Graphic/Text Advertisement',sponsored:'Sponsored Post'
});

/* [§21 AUTO DURATION] Best-guess overall ad duration from the media present.
   Never exceeds MAX_AD_DURATION_SECONDS (59 = strictly < 60). */
export function autoAdDuration(c){
  const x=(c&&Array.isArray(c.layers))?c:normalizeCreative(c);
  const comp=detectComposition(x);
  if(comp==='slideshow'||comp==='slideshow_audio')return Math.min(MAX_AD_DURATION_SECONDS,Math.max(3,Math.round(slideshowTotal(x)||6)));
  const vid=x.layers.find(l=>l.type==='video'&&(l.src||l.videoUrl));
  if(vid){
    const vm=vid.videoMeta||{};
    const trimmed=(Number(vm.trimEnd)||0)-(Number(vm.trimStart)||0);
    const d=trimmed>0?trimmed:(Number(vm.duration)||0);
    if(d>0)return Math.min(MAX_AD_DURATION_SECONDS,Math.max(1,Math.round(d)));
  }
  const aud=x.layers.find(l=>l.type==='audio'&&(l.src||l.audioUrl));
  if(aud){
    const am=aud.audioMeta||{};
    const trimmed=(Number(am.trimEnd)||0)-(Number(am.trimStart)||0);
    if(trimmed>0)return Math.min(MAX_AD_DURATION_SECONDS,Math.max(1,Math.round(trimmed)));
  }
  return DISPLAY_DURATION_SECONDS.default;
}

function defaultLayers(c){
  const w=c.canvas.width,h=c.canvas.height;
  return [
    makeLayer('shape',{name:'Accent',x:0,y:0,width:w,height:Math.round(h*.045),zIndex:1,style:{fill:'#19A974',radius:0}}),
    makeLayer('text',{name:'Headline',content:'TANGAZA KWA UBORA',x:w*.08,y:h*.13,width:w*.84,height:h*.18,zIndex:3,role:'headline',style:{fill:'#FFFFFF',fontSize:Math.round(w*.07),fontWeight:900,lineHeight:1.02}}),
    makeLayer('text',{name:'Body',content:'Unda tangazo la kitaalamu ndani ya SokoHai',x:w*.08,y:h*.34,width:w*.78,height:h*.13,zIndex:4,role:'body',style:{fill:'#E6FFF7',fontSize:Math.round(w*.032),fontWeight:500,lineHeight:1.25}}),
    makeLayer('shape',{name:'CTA background',x:w*.08,y:h*.72,width:w*.36,height:h*.1,zIndex:5,role:'cta-bg',style:{fill:'#F4C542',radius:999}}),
    makeLayer('text',{name:'CTA',content:'TAZAMA ZAIDI',x:w*.105,y:h*.745,width:w*.31,height:h*.05,zIndex:6,role:'cta',style:{fill:'#102A43',fontSize:Math.round(w*.025),fontWeight:900,textAlign:'center'}})
  ];
}

export function createCreative(context={}){
  const format=FORMAT_PRESETS[context.format]?context.format:'square',p=FORMAT_PRESETS[format];
  const c={
    schemaVersion:CREATIVE_SCHEMA_VERSION,
    id:context.id||'',
    ownerId:context.ownerId||'',
    type:context.publicationType||'advertisement',
    format,
    preset:context.preset||'static',
    /* [NON-CANVAS MVP 2026-09-24] media/timeline duration: STRICT `duration < 60`
       (FINAL INSTRUCTIONS §21) — largest valid integer = MAX_AD_DURATION_SECONDS (59). */
    duration:Math.min(MAX_AD_DURATION_SECONDS,Math.max(1,Number(context.duration)||30)),
    maxDuration:MAX_AD_DURATION_SECONDS,
    slideshow:normalizeSlideshow(context.slideshow),
    /* [§18] Design Mode: Auto (system suggests composition/timing) vs Manual. */
    designMode:context.designMode==='manual'?'manual':'auto',
    canvas:{width:p.width,height:p.height,safe:p.safe,bleed:0,custom:false},
    background:{
      type:'gradient',color:'#0E7A5F',color2:'#075C7A',angle:135,opacity:1,
      texture:'none',textureOpacity:.08,pattern:'none',patternOpacity:.12,
      imageUrl:'',blur:0,
      filter:{brightness:100,contrast:100,saturation:100,blur:0}
    },
    layers:[],
    audioMix:{
      originalVideoVolume:1,
      musicVolume:0.8,
      voiceVolume:1,
      muteOriginal:false,
      ...(context.audioMix||{})
    },
    timeline:context.timeline||[
      {id:'tl_0',layerId:'main_media',startTime:0,endTime:30,type:'media'}
    ],
    brandKit:null,
    linkedEntity:context.sourceId?{type:context.sourceType||'custom',id:context.sourceId}:null,
    destination:context.destination||null,
    // --- Canonical advertisement state (Creator Studio upgrade 2026-09-23) ---
    category:clean(context.category)||'general',      // WHAT is advertised (what-is-it), vs format/preset (how it looks)
    campaignName:clean(context.campaignName),
    campaignId:clean(context.campaignId),
    offer:clean(context.offer),                        // price/offer tag shown on the published post
    paletteId:clean(context.paletteId),                // selected design palette (js/app/creative/ad-palettes.js)
    priority:Math.max(0,Number(context.priority)||0),
    startAt:context.startAt||'',
    endAt:context.endAt||'',
    displayDurationSeconds:Number.isFinite(+context.displayDurationSeconds)?+context.displayDurationSeconds:DISPLAY_DURATION_SECONDS.default,
    version:1,
    status:'DRAFT',
    title:'Untitled Creative',
    createdAt:now(),
    updatedAt:now(),
    metadata:{source:'sokohai-creative-studio',preset:format}
  };
  c.layers=defaultLayers(c);
  return c;
}

export function normalizeCreative(input){
  const base=createCreative({format:input&&input.format}); if(!input||typeof input!=='object')return base;
  const out={
    ...base,...input,
    preset:input.preset||base.preset,
    /* [FINAL INSTRUCTIONS §21] media/timeline duration strictly < 60 (59 max).
       Old creatives without `slideshow` get a safe disabled default (§28). */
    duration:Math.min(MAX_AD_DURATION_SECONDS,Math.max(1,Number(input.duration)||base.duration)),
    maxDuration:MAX_AD_DURATION_SECONDS,
    slideshow:normalizeSlideshow(input.slideshow),
    designMode:input.designMode==='manual'?'manual':'auto',
    category:clean(input.category||base.category)||'general',
    campaignName:clean(input.campaignName),
    campaignId:clean(input.campaignId),
    offer:clean(input.offer),
    paletteId:clean(input.paletteId),
    priority:Math.max(0,Number(input.priority)||0),
    startAt:typeof input.startAt==='string'?input.startAt:base.startAt,
    endAt:typeof input.endAt==='string'?input.endAt:base.endAt,
    displayDurationSeconds:clamp(input.displayDurationSeconds==null?base.displayDurationSeconds:input.displayDurationSeconds,DISPLAY_DURATION_SECONDS.min,DISPLAY_DURATION_SECONDS.max),
    audioMix:{...base.audioMix,...(input.audioMix||{})},
    timeline:Array.isArray(input.timeline)?input.timeline:base.timeline,
    canvas:{...base.canvas,...(input.canvas||{})},
    background:{...base.background,...(input.background||{}),filter:{...base.background.filter,...((input.background&&input.background.filter)||{})}}
  };
  out.canvas.width=clamp(out.canvas.width,240,4096);
  out.canvas.height=clamp(out.canvas.height,240,4096);
  out.canvas.safe=clamp(out.canvas.safe,0,Math.min(out.canvas.width,out.canvas.height)/3);
  out.layers=(Array.isArray(input.layers)?input.layers:base.layers).slice(0,150).map((l,i)=>makeLayer(l.type||'shape',{
    ...l,
    id:clean(l.id)||uid(),
    x:clamp(l.x,-out.canvas.width,out.canvas.width*2),
    y:clamp(l.y,-out.canvas.height,out.canvas.height*2),
    width:clamp(l.width,1,out.canvas.width*3),
    height:clamp(l.height,1,out.canvas.height*3),
    rotation:clamp(l.rotation,-360,360),
    opacity:clamp(l.opacity,0,1),
    startTime:Math.max(0,Number(l.startTime)||0),
    endTime:Math.min(MAX_AD_DURATION_SECONDS,Number(l.endTime)||MAX_AD_DURATION_SECONDS),
    duration:Math.max(0,Number(l.duration)||MAX_AD_DURATION_SECONDS),
    zIndex:Number.isFinite(+l.zIndex)?+l.zIndex:i+1,
    content:clean(l.content),
    groupId:l.groupId||null
  }));
  return out;
}

export function duplicateCreative(c){
  const x=normalizeCreative(JSON.parse(JSON.stringify(c)));
  x.id='';x.version=1;x.status='DRAFT';x.title=(x.title||'Creative')+' — Copy';
  x.createdAt=x.updatedAt=now();
  x.layers=x.layers.map(l=>({...l,id:uid()}));
  return x;
}

export function resizeCreative(c,format,width,height){
  const x=normalizeCreative(JSON.parse(JSON.stringify(c))),old={...x.canvas},p=FORMAT_PRESETS[format]||{width:+width,height:+height,safe:Math.round(Math.min(+width,+height)*.06)};
  const nw=clamp(width||p.width,240,4096),nh=clamp(height||p.height,240,4096),sx=nw/old.width,sy=nh/old.height;
  x.layers=x.layers.map(l=>({...l,x:l.x*sx,y:l.y*sy,width:l.width*sx,height:l.height*sy,style:{...l.style,fontSize:Math.max(10,(l.style.fontSize||32)*Math.min(sx,sy))}}));
  if(Math.abs(nw/nh-old.width/old.height)>.35){
    x.layers=x.layers.map(l=>{
      if(l.role==='headline')return{...l,x:nw*.08,y:nh*.09,width:nw*.84};
      if(l.role==='cta'||l.role==='cta-bg')return{...l,x:nw*.12,y:nh*.82,width:nw*.76};
      if(l.type==='image')return{...l,x:nw*.12,y:nh*.30,width:nw*.76,height:nh*.43,style:{...l.style,fit:'cover'}};
      return l;
    });
  }
  x.format=format||'custom';x.canvas={width:nw,height:nh,safe:p.safe||Math.round(Math.min(nw,nh)*.06),bleed:0,custom:!FORMAT_PRESETS[format]};x.updatedAt=now();
  return x;
}

export function applyEntity(c,entity={},sourceType='product'){
  const x=normalizeCreative(JSON.parse(JSON.stringify(c)));
  const name=clean(entity.title||entity.name||entity.serviceName||entity.company||entity.driverName);
  const image=clean(entity.imageUrl||entity.image||entity.photo||entity.logoUrl||(Array.isArray(entity.images)&&entity.images[0]));
  const seller=clean(entity.shopName||entity.businessName||entity.providerName||entity.sellerName||entity.company);
  const location=clean(entity.location||entity.region||entity.serviceArea||entity.pickupRegion);
  const price=Number(entity.price||entity.currentPrice||entity.servicePrice);
  x.linkedEntity={type:sourceType,id:clean(entity.id),snapshot:{name,image,seller,location,price:Number.isFinite(price)?price:null}};
  x.title=name||x.title;
  const head=x.layers.find(l=>l.role==='headline');if(head&&name)head.content=name;
  const body=x.layers.find(l=>l.role==='body');if(body)body.content=[seller,location].filter(Boolean).join(' · ')||body.content;
  if(image){
    x.layers.push(makeLayer('image',{
      name:'Entity image',src:image,originalSrc:image,
      x:x.canvas.width*.48,y:x.canvas.height*.42,width:x.canvas.width*.46,height:x.canvas.height*.42,
      zIndex:2,style:{fit:'cover',radius:28,originalSrc:image}
    }));
  }
  if(Number.isFinite(price)){
    x.layers.push(makeLayer('text',{
      name:'Real price',role:'price',content:'TZS '+price.toLocaleString('en-US'),
      x:x.canvas.width*.08,y:x.canvas.height*.58,width:x.canvas.width*.42,height:x.canvas.height*.1,
      zIndex:7,style:{fill:'#FFFFFF',fontSize:Math.round(x.canvas.width*.047),fontWeight:900}
    }));
  }
  x.destination={type:sourceType,id:clean(entity.id)};x.updatedAt=now();
  return x;
}

const themes={
 'PRODUCT SALE':['#071E3D','#21E6C1'],'SERVICE':['#3B176F','#FFB703'],'BUSINESS':['#0B3B2E','#4ADE80'],'NEW ARRIVAL':['#111827','#38BDF8'],'DISCOUNT':['#7F1D1D','#FBBF24'],'FLASH SALE':['#1F1147','#FF3366'],'GROUP BUY':['#075985','#22C55E'],'WHOLESALE':['#3F2D20','#E9C46A'],'AUCTION':['#27100A','#F97316'],'PRICE DROP':['#450A0A','#EF4444'],'OPENING':['#052E16','#FDE047'],'GRAND OPENING':['#1E1B4B','#F59E0B'],'EVENT':['#2E1065','#D946EF'],'ANNOUNCEMENT':['#0C4A6E','#38BDF8'],'NEW BRANCH':['#134E4A','#5EEAD4'],'DELIVERY':['#172554','#60A5FA'],'TRANSPORT':['#1C1917','#F97316'],'JOB / OPPORTUNITY':['#3F3F46','#A3E635'],'GENERAL BRANDING':['#0F172A','#2DD4BF']
};
export const TEMPLATE_CATEGORIES=Object.keys(themes);

export function templatesFor(format='square'){
  return TEMPLATE_CATEGORIES.map((name,i)=>{
    const [a,b]=themes[name];
    const c=createCreative({format});
    c.title=name;c.background={...c.background,color:a,color2:b,angle:(i*23)%360};
    const h=c.layers.find(l=>l.role==='headline');h.content=name;h.style.fill='#FFFFFF';
    const body=c.layers.find(l=>l.role==='body');body.content='Badilisha maandishi, picha na maelezo yako';
    return{id:'tpl_'+name.toLowerCase().replace(/\W+/g,'_'),name,category:name,preview:{a,b},creative:c};
  });
}

export function autoDesignVariations(c){
  const defs=[['Minimal','#F8FAFC','#0F766E','#0F172A'],['Bold','#111827','#F97316','#FFFFFF'],['Elegant','#2E1F2B','#D4AF37','#FFF7ED'],['Modern','#082F49','#22D3EE','#F0FDFA'],['Promotional','#7F1D1D','#FBBF24','#FFFFFF']];
  return defs.map(([name,a,b,text],i)=>{
    const x=normalizeCreative(JSON.parse(JSON.stringify(c)));
    x.title=name+' — '+c.title;
    x.background={...x.background,color:a,color2:i===0?a:b,angle:135};
    x.layers=x.layers.map(l=>l.type==='text'?{...l,style:{...l.style,fill:l.role==='cta'?a:text,fontWeight:l.role==='headline'||l.role==='price'?900:l.style.fontWeight}}:l.role==='cta-bg'?{...l,style:{...l.style,fill:b}}:l);
    return{name,creative:x};
  });
}

function hexToRgb(hex){
  const h=clean(hex).replace('#','');
  if(h.length===3)return[parseInt(h[0]+h[0],16),parseInt(h[1]+h[1],16),parseInt(h[2]+h[2],16)];
  if(h.length===6)return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  return[0,0,0];
}

function rgbToHex(r,g,b){
  const toHex=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  let h=0,s=0,l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s=l>.5?d/(2-max-min):d/(max+min);
    switch(max){
      case r:h=(g-b)/d+(g<b?6:0);break;
      case g:h=(b-r)/d+2;break;
      case b:h=(r-g)/d+4;break;
    }
    h/=6;
  }
  return[Math.round(h*360),Math.round(s*100),Math.round(l*100)];
}

function hslToRgb(h,s,l){
  h/=360;s/=100;l/=100;
  let r,g,b;
  if(s===0){r=g=b=l;}
  else{
    const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    const q=l<.5?l*(1+s):l+s-l*s;
    const p=2*l-q;
    r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);
  }
  return[Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}

export function generatePalette(baseColor='#0E7A5F',harmony='complementary'){
  const [r,g,b]=hexToRgb(baseColor),[h,s,l]=rgbToHsl(r,g,b);
  const wrap=v=>(v%360+360)%360;
  const shift=(dh,ds=0,dl=0)=>{const [nr,ng,nb]=hslToRgb(wrap(h+dh),clamp(s+ds,10,100),clamp(l+dl,10,95));return rgbToHex(nr,ng,nb);};
  let pal={primary:baseColor,secondary:shift(30),accent:shift(180),background:'#FFFFFF',text:'#102A43',cta:'#F4C542'};
  if(harmony==='monochromatic')pal={primary:baseColor,secondary:shift(0,-20,15),accent:shift(0,10,-15),background:shift(0,-40,40),text:shift(0,0,-40),cta:shift(0,25,-5)};
  else if(harmony==='analogous')pal={primary:baseColor,secondary:shift(35),accent:shift(-35),background:shift(35,-40,40),text:'#102A43',cta:shift(35,15,-10)};
  else if(harmony==='complementary')pal={primary:baseColor,secondary:shift(20,-10,10),accent:shift(180),background:'#F8FBFA',text:'#102A43',cta:shift(180,10,-5)};
  else if(harmony==='triadic')pal={primary:baseColor,secondary:shift(120),accent:shift(240),background:'#FFFFFF',text:'#102A43',cta:shift(120)};
  else if(harmony==='luxury')pal={primary:'#141E30',secondary:'#243B55',accent:'#D4AF37',background:'#0B132B',text:'#FFF7ED',cta:'#D4AF37'};
  else if(harmony==='warm')pal={primary:'#B91C1C',secondary:'#EA580C',accent:'#FBBF24',background:'#FFFBEB',text:'#451A03',cta:'#F59E0B'};
  return pal;
}

function luminance(hex){const a=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];}
export function contrastRatio(a,b){const x=luminance(color(a,'#000000')),y=luminance(color(b,'#FFFFFF'));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}

export function designSuggestions(c){
  const x=normalizeCreative(c),out=[],bg=x.background.color||'#FFFFFF',colors=new Set([bg,x.background.color2]);
  x.layers.filter(l=>l.visible).forEach(l=>{
    if(l.type==='text'){
      colors.add(l.style.fill);
      if((l.style.fontSize||0)<18)out.push({level:'warning',layerId:l.id,message:`${l.name}: text may be too small.`});
      if(contrastRatio(l.style.fill||'#000000',bg)<3)out.push({level:'warning',layerId:l.id,message:`${l.name}: low contrast against background. Try a darker overlay or high-contrast color.`});
      if((l.content||'').length>160)out.push({level:'hint',layerId:l.id,message:`${l.name}: consider reducing body text.`});
    }
    if(l.x<x.canvas.safe||l.y<x.canvas.safe||l.x+l.width>x.canvas.width-x.canvas.safe||l.y+l.height>x.canvas.height-x.canvas.safe){
      out.push({level:'hint',layerId:l.id,message:`${l.name}: outside the text-safe area.`});
    }
  });
  if(colors.size>6)out.push({level:'hint',message:'More than six colors may weaken visual consistency.'});
  if(!x.layers.some(l=>l.role==='cta'))out.push({level:'hint',message:'Consider adding a clear CTA button.'});
  return out.slice(0,12);
}

export function alignLayers(layers,type,canvasWidth,canvasHeight){
  return layers.map(l=>{
    let {x,y,width,height}=l;
    if(type==='left')x=40;
    else if(type==='center')x=(canvasWidth-width)/2;
    else if(type==='right')x=canvasWidth-width-40;
    else if(type==='top')y=40;
    else if(type==='middle')y=(canvasHeight-height)/2;
    else if(type==='bottom')y=canvasHeight-height-40;
    return{...l,x:Math.round(x),y:Math.round(y)};
  });
}

export function validateCreative(c,{forPublish=false}={}){
  const x=normalizeCreative(c),errors=[];
  if(!x.layers.some(l=>l.visible))errors.push({code:'EMPTY',message:'Add at least one visible layer.'});
  x.layers.filter(l=>l.visible).forEach(l=>{
    if(l.type==='text'&&!clean(l.content))errors.push({code:'EMPTY_TEXT',layerId:l.id,message:`${l.name} has no text.`});
    if(l.x+l.width<0||l.y+l.height<0||l.x>x.canvas.width||l.y>x.canvas.height)errors.push({code:'OUTSIDE',layerId:l.id,message:`${l.name} is outside the canvas.`});
    if(l.type==='image'&&!/^https:\/\/|^data:image/i.test(l.src||''))errors.push({code:'IMAGE',layerId:l.id,message:`${l.name} image is not loaded.`});
    if(l.type==='video'){
      if(!/^https:\/\/|^blob:/i.test(l.src||l.videoUrl||''))errors.push({code:'VIDEO',layerId:l.id,message:`${l.name} video URL is not loaded.`});
      const vDur = (l.videoMeta?.trimEnd - l.videoMeta?.trimStart) || l.videoMeta?.duration || l.duration || 0;
      /* [FINAL INSTRUCTIONS §9/§33] STRICT rule: `duration < 60`
         → 59s ✅, 60s ❌, 61s ❌. Publish blocked until trimmed; original kept. */
      if(vDur >= MAX_AD_MEDIA_SECONDS){
        errors.push({code:'VIDEO_DURATION',layerId:l.id,message:`Video "${l.name}" lazima iwe CHINI ya sekunde ${MAX_AD_MEDIA_SECONDS} (sasa: ${Math.round(vDur)}s — max ${MAX_AD_DURATION_SECONDS}s). Tumia Trim. Original inabaki salama.`});
      }
    }
    if(l.type==='audio'&&l.src&&!/^https:\/\/|^blob:|^data:audio/i.test(l.src||l.audioUrl||'')){
      errors.push({code:'AUDIO',layerId:l.id,message:`${l.name} audio URL si sahihi.`});
    }
  });
  if(forPublish){
    /* [NON-CANVAS MVP 2026-09-24] Slideshow publish gates (spec §15/§21):
       ≥2 real slides, total duration ≤ 60s. */
    const ss=x.slideshow;
    if(ss&&ss.enabled){
      if(!ss.slides||ss.slides.filter(s=>s&&s.src).length<2){
        errors.push({code:'SLIDESHOW_SLIDES',message:'Slideshow inahitaji picha angalau 2 zenye source halisi.'});
      }
      const total=slideshowTotal(x);
      if(total>=MAX_AD_MEDIA_SECONDS){
        errors.push({code:'SLIDESHOW_DURATION',message:`Slideshow lazima iwe CHINI ya sekunde ${MAX_AD_MEDIA_SECONDS} (Jumla: ${Math.round(total)}s — max ${MAX_AD_DURATION_SECONDS}s). Punguza muda wa slides.`});
      }
    }
    const internal=!!(x.destination&&x.destination.type&&x.destination.id),external=!!(x.destination&&x.destination.type==='external'&&/^https:\/\//i.test(x.destination.url||''));
    if(!internal&&!external)errors.push({code:'DESTINATION',message:'Choose a real SokoHai destination or valid HTTPS link before publishing.'});
    if(x.linkedEntity&&!x.linkedEntity.id)errors.push({code:'ENTITY',message:'The selected SokoHai entity is incomplete.'});
    if(x.startAt&&x.endAt&&Date.parse(x.endAt)<=Date.parse(x.startAt))errors.push({code:'SCHEDULE',message:'End date lazima iwe baada ya Start date.'});
    if(!(Number(x.displayDurationSeconds)>=DISPLAY_DURATION_SECONDS.min&&Number(x.displayDurationSeconds)<=DISPLAY_DURATION_SECONDS.max))errors.push({code:'DISPLAY_DURATION',message:'Display duration lazima iwe sekunde '+DISPLAY_DURATION_SECONDS.min+'–'+DISPLAY_DURATION_SECONDS.max+' (media duration ni kitu kingine).'});
  }
  return{ok:errors.length===0,errors};
}

export function serializeCreative(c){return JSON.stringify(normalizeCreative(c));}

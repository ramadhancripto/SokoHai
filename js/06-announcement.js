/* SokoHai Home Advertisement Showcase — existing announcements collection authority. */
(function () {
  'use strict';
  if (window.__SOKOHAI_ANNOUNCEMENT_STORY_V2__) return;
  window.__SOKOHAI_ANNOUNCEMENT_STORY_V2__ = true;

  let activeIndex = 0, rotationTimer = null, scheduleTimer = null, liveTimer = null, liveNotice = null;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = v => { const s=String(v||'').trim(); return /^(https:\/\/|\/|#)/i.test(s)&&!/["'<>\s]/.test(s)?s:''; };
  const short = (v,n) => { const s=String(v||'').replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n-1).trim()+'…':s; };
  const mediaType = a => String(a.creativeType||a.layoutStyle||a.mediaType||a.type||'image_text').toLowerCase();
  const safeColor=(v,fallback)=>/^#[0-9a-f]{6}$/i.test(String(v||'').trim())?String(v).trim():fallback;
  const safeOpacity=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(.08,Math.min(1,n)):0.42};

  // Recover locally cached announcements immediately on startup
  try {
    const cached = localStorage.getItem('skh_cached_announcements');
    if (cached && (!window.__sokohaiAnnouncementsCache || !window.__sokohaiAnnouncementsCache.length)) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) {
        window.__sokohaiAnnouncementsCache = parsed;
      }
    }
  } catch (e) {}

  function stateOf(a, now) {
    if (!a || a.archived === true || a.status === 'archived') return 'archived';
    if (a.status === 'draft' || a.active === false) return 'draft';
    const start=a.startAt?Date.parse(a.startAt):0, end=a.endAt?Date.parse(a.endAt):0;
    if (start && start>now) return 'scheduled';
    if (end && end<now) return 'expired';
    return 'active';
  }
  window.skhAdvertisementState = function(a){ return stateOf(a,Date.now()); };

  function activeAds() {
    const now=Date.now(), source=Array.isArray(window.__sokohaiAnnouncementsCache)?window.__sokohaiAnnouncementsCache:[];
    return source.filter(a=>stateOf(a,now)==='active' && (a.text||a.headline||a.image||a.imageUrl||a.videoUrl||a.badgeText))
      .sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
  function hide(){const h=document.getElementById('topAnnouncement');if(!h)return;h.className='big-announcement skh-ann-story is-empty';h.innerHTML='';h.hidden=true;}
  function track(a,type){if(!a||!a.id||!window.skh||typeof window.skh.callFunction!=='function')return;const key='skh_ad_'+type+'_'+a.id;if(type==='impression'&&sessionStorage.getItem(key))return;try{sessionStorage.setItem(key,'1');window.skh.callFunction('creativeTrackEvent',{announcementId:a.id,type:type}).catch(function(){if(type==='impression')sessionStorage.removeItem(key);});}catch(e){}}
  function openAction(url,id){if(id)track({id:id},'click');if(!url)return;if(url[0]==='#'||url[0]==='/')location.href=url;else window.open(url,'_blank','noopener');}
  window.skhAnnouncementOpen=openAction;

  function mediaHtml(a,title,type) {
    const image=safeUrl(a.image || a.imageUrl || a.mediaUrl || a.photo), video=safeUrl(a.videoUrl), poster=safeUrl(a.posterUrl || image), audio=safeUrl(a.audioUrl);
    const aspect=String(a.aspectRatio || a.format || '16:9').replace(':','-');
    const fit=String(a.objectFit || a.fit || 'cover').toLowerCase();
    const focalX=Number.isFinite(Number(a.focalX))?Number(a.focalX):50;
    const focalY=Number.isFinite(Number(a.focalY))?Number(a.focalY):50;
    const brightness=Number.isFinite(Number(a.brightness))?Number(a.brightness):100;
    const contrast=Number.isFinite(Number(a.contrast))?Number(a.contrast):100;
    const saturation=Number.isFinite(Number(a.saturation))?Number(a.saturation):100;
    const blur=Number.isFinite(Number(a.blur))?Number(a.blur):0;
    const overlayColor=safeColor(a.overlayColor, '#000000');
    const overlayOpacity=Number.isFinite(Number(a.overlayOpacity))?Number(a.overlayOpacity):0;

    const filterStyle=(brightness!==100||contrast!==100||saturation!==100||blur>0)?`filter:brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px);`:'';
    const posStyle=`object-position:${focalX}% ${focalY}%;`;
    const mediaInlineStyle=filterStyle+posStyle;

    const overlayHtml=overlayOpacity>0?`<div class="skh-ann-media-overlay" style="position:absolute;inset:0;z-index:3;background:${overlayColor};opacity:${overlayOpacity};pointer-events:none;"></div>`:'';

    /* [NON-CANVAS MVP 2026-09-24] SLIDESHOW MEDIA (Type E, spec §15/§16).
       Extends THIS canonical renderer — no second renderer. Pure CSS keyframes
       are emitted per card (unique id) from per-slide durations; slide 1 is
       visible without animation (reduced-motion + static contexts). */
    let visual='';
    const ssRaw=(a.slideshow&&typeof a.slideshow==='object')?a.slideshow:null;
    const ssSlides=ssRaw&&Array.isArray(ssRaw.slides)?ssRaw.slides.filter(function(s){return s&&safeUrl(s.src);}).slice(0,12):[];
    if (ssSlides.length>=2) {
      const trans=String((ssRaw.transition||'fade')).toLowerCase();
      const durs=ssSlides.map(function(s){const d=Number(s.duration);return Number.isFinite(d)&&d>0?Math.min(30,d):(Number(ssRaw.defaultDuration)||3);});
      const total=durs.reduce(function(t,d){return t+d;},0)||1;
      let hash=0;const seed=ssSlides.map(function(s){return s.src;}).join('|');
      for(let i=0;i<seed.length;i++){hash=((hash<<5)-hash+seed.charCodeAt(i))|0;}
      const uid='ss'+Math.abs(hash).toString(36);
      const p2=function(n){return (Math.round(n*1000)/1000)+'%';};
      let kf='',slides='';let acc=0;
      const fadePct=Math.max(1.2,Math.min(8,(1.2/total)*100)); /* ~1.2s crossfade window */
      for(let i=0;i<ssSlides.length;i++){
        const sPct=(acc/total)*100, ePct=((acc+durs[i])/total)*100; acc+=durs[i];
        const fi=Math.min(sPct+fadePct,(sPct+ePct)/2), fo=Math.max(ePct-fadePct,(sPct+ePct)/2);
        const enter=(trans==='slide'||trans==='slide-left')?'transform:translateX(-6%);':(trans==='slide-right'?'transform:translateX(6%);':(trans==='zoom'?'transform:scale(1.07);':''));
        const mid=(trans==='slide'||trans==='slide-left'||trans==='slide-right'||trans==='zoom')?'transform:none;':'';
        const name=uid+'k'+i;
        if(trans==='none'){
          /* Hard cuts: visible only inside [start,end). Slide 0 visible from 0%. */
          let seg='';
          if(i===0)seg+='0%,'+p2(sPct)+'{opacity:1}';
          else seg+='0%,'+p2(Math.max(0,sPct-0.001))+'{opacity:0}';
          seg+=p2(sPct)+','+p2(Math.min(100,ePct))+'{opacity:1}';
          if(ePct<100)seg+=p2(Math.min(100,ePct+0.001))+',100%{opacity:0}';
          kf+='@keyframes '+name+'{'+seg+'}';
        }else{
          let seg='0%{opacity:'+(i?0:1)+';'+(i?enter:'')+'}';
          if(i>0)seg+=p2(sPct)+'{opacity:0;'+enter+'}';
          seg+=p2(fi)+'{opacity:1;'+mid+'}'+p2(fo)+'{opacity:1}'+p2(ePct)+'{opacity:0}100%{opacity:0}';
          kf+='@keyframes '+name+'{'+seg+'}';
        }
        slides+='<figure class="skh-ann-slide" style="animation:'+name+' '+total.toFixed(2)+'s linear infinite;'+(i?'opacity:0;':'')+'"><img src="'+esc(safeUrl(ssSlides[i].src))+'" alt="'+esc(ssSlides[i].name||title)+'" loading="'+(i?'lazy':'eager')+'" style="'+mediaInlineStyle+'"></figure>';
      }
      const dots=ssSlides.map(function(_,i){return '<i class="skh-ann-ss-dot'+(i?'':' on')+'"></i>';}).join('');
      visual='<style>'+kf+'</style><div class="skh-ann-slideshow skh-ss-'+esc(['none','fade','slide','slide-left','slide-right','zoom','crossfade'].indexOf(trans)>=0?trans:'fade')+'" data-slides="'+ssSlides.length+'" data-total="'+Math.round(total)+'">'+slides+'<div class="skh-ann-ss-dots" aria-hidden="true">'+dots+'</div><span class="skh-ann-video-dur">'+ssSlides.length+' picha · '+Math.round(total)+'s</span></div>';
    }
    if (!visual && type.indexOf('video')!==-1 && video) {
      /* [FINAL INSTRUCTIONS §11/§24] Poster-first: initial state = POSTER + subtle
         Play cue. Motion + audio start ONLY after the user taps Play (delegated
         handler below). Technical controls remain in Creator Studio; `controls`
         only via explicit opt-in. */
      const durS=Number(a.mediaDurationSeconds||a.videoDuration||a.durationSeconds)||0;
      const durChip=durS>0?'<span class="skh-ann-video-dur">'+Math.floor(durS/60)+':'+String(Math.floor(durS%60)).padStart(2,'0')+'</span>':'';
      visual='<div class="skh-ann-video-wrap"><video class="skh-ann-video" muted playsinline '+(a.videoControls===true?'controls ':'')+'preload="metadata" '+(poster?'poster="'+esc(poster)+'" ':'')+'style="'+mediaInlineStyle+'"><source src="'+esc(video)+'"></video>'+(a.videoControls===true?'':'<button type="button" class="skh-ann-video-cue skh-ann-video-play" aria-label="Play video"><span class="skh-visually-hidden">Play</span></button>'+durChip)+'</div>'+overlayHtml;
    } else if (!visual && image) {
      visual='<img class="skh-ann-media-blur" src="'+esc(image)+'" alt="" aria-hidden="true"><img class="skh-ann-media-main" src="'+esc(image)+'" alt="'+esc(title)+'" loading="eager" decoding="async" style="'+mediaInlineStyle+'">'+overlayHtml;
    }
    if (!visual) return '';
    return '<div class="skh-ann-media aspect-'+esc(aspect)+' fit-'+esc(fit)+'">'+visual+(audio?'<audio class="skh-ann-audio" controls preload="none" src="'+esc(audio)+'"></audio>':'')+'</div>';
  }

  function countLabel(value, label) {
    const n=Number(value)||0;
    return n>0?'<span><b>'+n.toLocaleString()+'</b> '+esc(label)+'</span>':'';
  }

  function cardHtml(a, live) {
    const type=mediaType(a), title=short(a.headline||a.title||a.text||'SokoHai',120), message=short(a.description||a.text||'',320);
    const brand=short(a.brandName||a.brand||'SokoHai',48), logo=safeUrl(a.logoUrl), link=safeUrl(a.link||a.actionUrl), action=short(a.ctaLabel||a.actionLabel||'Tazama Zaidi',32);
    const media=mediaHtml(a,title,type), withText=type.indexOf('text')!==-1||!!(a.headline||a.description||a.text);
    const initial=esc((brand.charAt(0)||'S').toUpperCase());
    const metrics=countLabel(a.likeCount||a.likesCount,'likes')+countLabel(a.viewCount||a.views,'views')+countLabel(a.clickCount||a.clicks,'clicks');
    
    // Badge / Sticker / Ribbon + Animation
    const badgeText=String(a.badgeText||'').trim();
    const badgeColor=safeColor(a.badgeColor, '#F59E0B');
    const badgeTextColor=safeColor(a.badgeTextColor, '#FFFFFF');
    const badgeStyle=String(a.badgeStyle||'pill').toLowerCase();
    const badgeAnim=String(a.badgeAnimation||a.badgeAnim||'none').toLowerCase();
    const badgeAnimClass=badgeAnim&&badgeAnim!=='none'?' badge-anim-'+esc(badgeAnim):'';
    const badgeSize=['sm','md','lg'].indexOf(String(a.badgeSize))>=0?String(a.badgeSize):'md';
    const badgePos=['tl','tr','bl','br'].indexOf(String(a.badgePosition))>=0?String(a.badgePosition):'tr';
    const badgeOpacity=Number.isFinite(Number(a.badgeOpacity))?Math.max(.4,Math.min(1,Number(a.badgeOpacity))):1;
    const badgeIconMap={fire:'\u{1F525}',bolt:'\u26A1',tag:'\u{1F3F7}\uFE0F',star:'\u2B50',truck:'\u{1F69A}',sparkle:'\u2728'};
    const badgeIcon=badgeIconMap[String(a.badgeIcon)]||'';
    let badgeHtml='';
    if (badgeText) {
      badgeHtml='<div class="skh-ann-badge-tag style-'+esc(badgeStyle)+badgeAnimClass+' size-'+esc(badgeSize)+' pos-'+esc(badgePos)+'" style="--badge-bg:'+badgeColor+';--badge-text:'+badgeTextColor+(badgeOpacity<1?';opacity:'+badgeOpacity:'')+';"><span class="skh-badge-inner">'+(badgeIcon?badgeIcon+' ':'')+esc(badgeText)+'</span></div>';
    }

    // Custom design properties
    const primary=safeColor(a.primaryColor,'#0E7A5F');
    const accent=safeColor(a.accentColor,'#167A91');
    const textColor=safeColor(a.textColor,'#FFFFFF');
    const surface=safeColor(a.surfaceColor,'#FFFFFF');
    const frameOpacity=safeOpacity(a.frameOpacity);
    const gradientAngle=Number.isFinite(Number(a.gradientAngle))?Number(a.gradientAngle):135;
    const borderRadius=Number.isFinite(Number(a.borderRadius))?Math.max(0,Math.min(36,Number(a.borderRadius))):22;
    const fontWeight=String(a.fontWeight||'950');
    const fontSize=Number.isFinite(Number(a.fontSize))?Number(a.fontSize):0;
    const textAlign=String(a.textAlign||'left');
    const textShadow=String(a.textShadow||'none');
    const priceTag=String(a.priceTag||a.price||'').trim();
    const ctaStyle=String(a.ctaStyle||'solid').toLowerCase();
    const ctaIcon=String(a.ctaIcon||'arrow');
    const ctaIconHtml=(typeof window.skhCtaIcon==='function'?window.skhCtaIcon(ctaIcon):(ctaIcon==='cart'?'🛒':ctaIcon==='phone'?'📞':ctaIcon==='whatsapp'?'💬':ctaIcon==='star'?'⭐':'→'));

    // Animation Engine settings
    const anim=typeof a.animation==='object'&&a.animation?a.animation:{};
    const entrance=String(a.textAnimation||a.headlineAnimation||anim.entrance||'none').toLowerCase();
    const emphasis=String(a.textEmphasis||anim.emphasis||'none').toLowerCase();
    const animMode=String(a.animationMode||anim.mode||'whole').toLowerCase();
    const animDuration=Number(a.animationDuration||anim.duration)||600;
    const animDelay=Number(a.animationDelay||anim.delay)||0;
    const animStagger=Number(a.animationStagger||anim.stagger)||100;
    const ctaAnim=String(a.ctaAnimation||a.ctaAnim||'none').toLowerCase();
    const ctaAnimClass=ctaAnim&&ctaAnim!=='none'?' cta-anim-'+esc(ctaAnim):'';

    // Animated title formatting (whole, word-by-word, character-by-character)
    let titleFormatted='';
    if (entrance!=='none'||emphasis!=='none') {
      const enterClass=entrance!=='none'?' anim-enter-'+esc(entrance):'';
      const emphClass=emphasis!=='none'?' anim-emph-'+esc(emphasis):'';
      if (animMode==='word') {
        const words=title.split(/\s+/);
        titleFormatted=words.map((w,i)=>{
          const delay=animDelay+(i*animStagger);
          return '<span class="skh-anim-word'+enterClass+'" style="animation-delay:'+delay+'ms;--anim-duration:'+animDuration+'ms;">'+esc(w)+'</span>';
        }).join(' ');
      } else if (animMode==='line') {
        const rows=title.split(/\r?\n+/).filter(function(r){return r.trim();});
        const lineList=rows.length>1?rows:[title];
        titleFormatted=lineList.map(function(row,i){
          const delay=animDelay+(i*animStagger);
          return '<span class="skh-anim-line'+enterClass+'" style="display:block;animation-delay:'+delay+'ms;--anim-duration:'+animDuration+'ms;">'+esc(row)+'</span>';
        }).join('');
      } else if (animMode==='character') {
        const chars=[...title];
        titleFormatted=chars.map((ch,i)=>{
          const delay=animDelay+(i*Math.round(animStagger/2));
          return ch===' '?' ':'<span class="skh-anim-char'+enterClass+'" style="animation-delay:'+delay+'ms;--anim-duration:'+animDuration+'ms;">'+esc(ch)+'</span>';
        }).join('');
      } else {
        titleFormatted='<span class="skh-anim-text'+enterClass+emphClass+'" style="display:inline-block;--anim-duration:'+animDuration+'ms;--anim-delay:'+animDelay+'ms;">'+esc(title)+'</span>';
      }
    } else {
      titleFormatted=esc(title);
    }

    // Copy block — headline hierarchy (Level 2); offer imesogea kwenye action row (Level 3)
    const titleStyleAttr='font-weight:'+esc(fontWeight)+';text-align:'+esc(textAlign)+';'+(fontSize?'font-size:'+fontSize+'px!important;':'')+(textShadow==='subtle'?'text-shadow:0 2px 8px rgba(0,0,0,0.25);':textShadow==='strong'?'text-shadow:0 4px 16px rgba(0,0,0,0.45);':'');
    const copy=withText?'<div class="skh-ann-title-wrap"><strong class="skh-ann-title" style="'+titleStyleAttr+'">'+titleFormatted+'</strong></div>'+(message&&message!==title?'<p style="text-align:'+esc(textAlign)+'">'+esc(message)+'</p>':''):'';

    const actionButton=link?'<button type="button" class="skh-ann-action cta-style-'+esc(ctaStyle)+ctaAnimClass+'" onclick="window.skhAnnouncementOpen(\''+esc(link)+'\',\''+esc(a.id||'')+'\')"><span>'+esc(action)+'</span><b aria-hidden="true">'+ctaIconHtml+'</b></button>':'<span class="skh-ann-no-cta">Tangazo la SokoHai</span>';

    let theme='--ad-primary:'+primary+';--ad-accent:'+accent+';--ad-text:'+textColor+';--ad-surface:'+surface+';--ad-frame-alpha:'+frameOpacity+';--ad-angle:'+gradientAngle+'deg;--ad-radius:'+borderRadius+'px;';
    const pal=(a.paletteId&&typeof window.skhPaletteTokens==='function')?window.skhPaletteTokens(a.paletteId):null;
    if(pal){
      theme+='--ad-pal-background:'+pal.background+';--ad-surface-alt:'+pal.surfaceAlt+';--ad-primary-dark:'+pal.primaryDark+';--ad-primary-light:'+pal.primaryLight+';--ad-secondary:'+pal.secondary+';--ad-muted:'+pal.mutedText+';--ad-border:'+pal.border+';--ad-cta-bg:'+pal.ctaBackground+';--ad-cta-text:'+pal.ctaText+';--ad-badge-bg:'+pal.badgeBackground+';--ad-badge-text:'+pal.badgeText+';--ad-overlay:'+pal.overlay+';--ad-grad-start:'+pal.gradientStart+';--ad-grad-mid:'+pal.gradientMiddle+';--ad-grad-end:'+pal.gradientEnd+';--ad-shadow:'+pal.shadow+';--ad-glow:'+pal.glow+';';
    }

    /* Auto-composition (existing fields tu): video > offer > product > text */
    const hasVideo=type.indexOf('video')!==-1&&!!safeUrl(a.videoUrl);
    const comp=(!media)?'text':hasVideo?'video':(priceTag?'offer':'product');
    /* Micro-labels: zinazohitajika tu (category + VIDEO) — si labels zote */
    const catList=(window.SKH_AD_CATEGORIES&&window.SKH_AD_CATEGORIES.length)?window.SKH_AD_CATEGORIES:[];
    const catObj=a.category?catList.find(function(c){return c.id===a.category;}):null;
    const microLabels=[];
    if(catObj&&a.category!=='general')microLabels.push(esc(String(catObj.label.split('/').pop()||catObj.label).trim().toUpperCase()));
    if(hasVideo)microLabels.push('VIDEO');
    /* [NON-CANVAS MVP 2026-09-24] Slideshow indicator (Type E) */
    const ssActive=!!(a.slideshow&&a.slideshow.enabled&&Array.isArray(a.slideshow.slides)&&a.slideshow.slides.filter(function(s){return s&&s.src;}).length>=2);
    if(ssActive)microLabels.push('SLIDESHOW');
    const kickerHtml=microLabels.length?'<div class="skh-ann-kicker skh-ann-micro">'+microLabels.map(function(t){return '<span>'+t+'</span>';}).join('')+'</div>':'';
    const offerHtml=priceTag?'<span class="skh-ann-price-pill skh-ann-offer">'+esc(priceTag)+'</span>':'';

    return '<article class="skh-ann-card layout-'+esc(type)+' skh-comp-'+esc(comp)+(a.compact===true?' skh-ad-compact':'')+'" style="'+theme+'border-radius:var(--ad-radius,22px);">'
      +badgeHtml
      +'<header class="skh-ann-post-head">'+(logo?'<img class="skh-ann-brand-logo" src="'+esc(logo)+'" alt="'+esc(brand)+'">':'<span class="skh-ann-brand-fallback">'+initial+'</span>')
      +'<div class="skh-ann-brand-copy"><b>'+esc(brand)+'</b><small>'+(live?'SokoHai Live':'Sponsored')+'</small></div><span class="skh-ann-sponsored">AD</span></header>'
      +(media
        ? media+'<div class="skh-ann-body">'+kickerHtml+(copy?'<div class="skh-ann-copy">'+copy+'</div>':'')+'</div><footer class="skh-ann-post-actions'+(offerHtml?' has-offer':'')+'">'+offerHtml+actionButton+'</footer>'
        /* [FINAL §1/§30] Text-only (no-media) ads are complete ads: copy + OFFER + CTA */
        :'<div class="skh-ann-text-creative"><i class="skh-ann-orb one"></i><i class="skh-ann-orb two"></i><i class="skh-ann-shine"></i><span class="skh-ann-text-kicker">Featured on SokoHai</span><div class="skh-ann-text-content">'+copy+'</div>'+(offerHtml?'<div class="skh-ann-text-offer">'+offerHtml+'</div>':'')+'<div class="skh-ann-text-cta">'+actionButton+'</div></div>')
      +(metrics?'<div class="skh-ann-metrics">'+metrics+'</div>':'')
      +'</article>';
  }
  window.skhAdvertisementCardHtml=cardHtml;

  function renderAd(a, live) {
    const host=document.getElementById('topAnnouncement');if(!host||!a)return;
    const hasMedia=!!safeUrl(a.image||a.imageUrl||a.mediaUrl||a.photo||a.videoUrl);
    host.hidden=false;
    host.className='big-announcement skh-ann-story skh-home-ad skh-ann-post '+(hasMedia?'has-media':'no-media')+(live?' is-live':'');
    host.innerHTML=cardHtml(a,live);
    if(!live)track(a,'impression');
    /* [FINAL INSTRUCTIONS §11/§24] NEVER auto-play published video: poster +
       Play button initial state; playback starts only on user tap (delegated
       click handler registered once at module load below). */
    const video=host.querySelector('video');
    if(video){try{video.pause();video.currentTime=0;}catch(e){}}
  }

  function armScheduleRefresh(){clearTimeout(scheduleTimer);const now=Date.now(),source=Array.isArray(window.__sokohaiAnnouncementsCache)?window.__sokohaiAnnouncementsCache:[],times=[];source.forEach(a=>{if(a&&a.archived!==true&&a.status!=='archived'&&a.active!==false&&a.status!=='draft'){const s=Date.parse(a.startAt||''),e=Date.parse(a.endAt||'');if(s>now)times.push(s);if(e>now)times.push(e+50);}});if(times.length){const delay=Math.max(250,Math.min(3600000,Math.min.apply(Math,times)-now));scheduleTimer=setTimeout(renderCurrent,delay);}}
  function renderCurrent(){clearTimeout(rotationTimer);armScheduleRefresh();if(liveNotice){renderAd(liveNotice,true);return;}const list=activeAds();if(!list.length){hide();return;}if(activeIndex>=list.length)activeIndex=0;renderAd(list[activeIndex],false);if(list.length>1){const dMs=Number(list[activeIndex].displayDurationSeconds)>0?Number(list[activeIndex].displayDurationSeconds)*1000:Number(list[activeIndex].rotationMs)||9000;rotationTimer=setTimeout(()=>{activeIndex=(activeIndex+1)%list.length;renderCurrent();},Math.max(5000,Math.min(59000,dMs)));}}
  window.startSokoHaiSmoothMarquee=renderCurrent;window.startSokoHaiAnnouncementRotator=renderCurrent;window.startSokoHaiProAnnouncementBar=renderCurrent;window.playNextSokoHaiProAnnouncement=function(){activeIndex++;renderCurrent();};window.rotateSokoHaiAnnouncement=window.playNextSokoHaiProAnnouncement;
  window.__sokohaiOnAnnouncementsUpdate=function(){activeIndex=0;renderCurrent();};
  window.updateLiveTicker=function(type,message,subject,forceReset){clearTimeout(liveTimer);if(type==='normal'||forceReset){liveNotice=null;renderCurrent();return;}liveNotice={creativeType:'solid_text',brandName:'SokoHai',headline:subject||'Taarifa muhimu',description:message||'',active:true};renderCurrent();liveTimer=setTimeout(()=>{liveNotice=null;renderCurrent();},16000);};
  document.addEventListener('DOMContentLoaded',renderCurrent);setTimeout(renderCurrent,250);

  /* [FINAL INSTRUCTIONS §11/§24] Poster-first click-to-play, delegated once.
     First tap → motion + audio (unmute on user gesture, browser-safe);
     second tap → pause, Play cue returns. Works for Home card, live preview
     and Creator Studio Preview (all render this canonical markup). */
  document.addEventListener('click',function(e){
    const cue=e.target.closest&&e.target.closest('.skh-ann-video-play');
    const vidEl=e.target.closest&&e.target.closest('.skh-ann-video');
    if(!cue&&!vidEl)return;
    const wrap=(cue||vidEl).closest('.skh-ann-video-wrap')||((cue||vidEl).parentNode);
    const v=wrap&&wrap.querySelector?wrap.querySelector('video'):null;
    if(!v)return;
    if(v.paused){
      v.muted=false; /* user gesture → audio allowed (§11: motion + audio after Play) */
      const p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;v.play().catch(function(){});});
      wrap.classList.add('is-playing');
      if(cue)cue.style.display='none';
    }else{
      v.pause();
      wrap.classList.remove('is-playing');
      if(cue)cue.style.display='';
    }
  });
})();

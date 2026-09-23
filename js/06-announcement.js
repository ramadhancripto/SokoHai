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
    let visual='';
    if (type.indexOf('video')!==-1 && video) visual='<video class="skh-ann-video" muted playsinline controls preload="metadata" '+(poster?'poster="'+esc(poster)+'" ':'')+'><source src="'+esc(video)+'"></video>';
    else if (image) visual='<img class="skh-ann-media-blur" src="'+esc(image)+'" alt="" aria-hidden="true"><img class="skh-ann-media-main" src="'+esc(image)+'" alt="'+esc(title)+'" loading="eager" decoding="async">';
    if (!visual) return '';
    return '<div class="skh-ann-media">'+visual+(audio?'<audio class="skh-ann-audio" controls preload="none" src="'+esc(audio)+'"></audio>':'')+'</div>';
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
    
    // Badge / Sticker / Ribbon
    const badgeText=String(a.badgeText||'').trim();
    const badgeColor=safeColor(a.badgeColor, '#F59E0B');
    const badgeTextColor=safeColor(a.badgeTextColor, '#FFFFFF');
    const badgeStyle=String(a.badgeStyle||'pill').toLowerCase();
    let badgeHtml='';
    if (badgeText) {
      badgeHtml='<div class="skh-ann-badge-tag style-'+esc(badgeStyle)+'" style="--badge-bg:'+badgeColor+';--badge-text:'+badgeTextColor+';"><span class="skh-badge-inner">'+esc(badgeText)+'</span></div>';
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
    const ctaIconHtml=ctaIcon==='cart'?'🛒':ctaIcon==='phone'?'📞':ctaIcon==='whatsapp'?'💬':ctaIcon==='star'?'⭐':'→';

    // Copy block
    const titleStyleAttr='font-weight:'+esc(fontWeight)+';text-align:'+esc(textAlign)+';'+(fontSize?'font-size:'+fontSize+'px!important;':'')+(textShadow==='subtle'?'text-shadow:0 2px 8px rgba(0,0,0,0.25);':textShadow==='strong'?'text-shadow:0 4px 16px rgba(0,0,0,0.45);':'');
    const copy=withText?'<div class="skh-ann-title-wrap">'+(priceTag?'<span class="skh-ann-price-pill">'+esc(priceTag)+'</span>':'')+'<strong class="skh-ann-title" style="'+titleStyleAttr+'">'+esc(title)+'</strong></div>'+(message&&message!==title?'<p style="text-align:'+esc(textAlign)+'">'+esc(message)+'</p>':''):'';

    const actionButton=link?'<button type="button" class="skh-ann-action cta-style-'+esc(ctaStyle)+'" onclick="window.skhAnnouncementOpen(\''+esc(link)+'\',\''+esc(a.id||'')+'\')"><span>'+esc(action)+'</span><b aria-hidden="true">'+ctaIconHtml+'</b></button>':'<span class="skh-ann-no-cta">Tangazo la SokoHai</span>';

    const theme='--ad-primary:'+primary+';--ad-accent:'+accent+';--ad-text:'+textColor+';--ad-surface:'+surface+';--ad-frame-alpha:'+frameOpacity+';--ad-angle:'+gradientAngle+'deg;--ad-radius:'+borderRadius+'px;';

    return '<article class="skh-ann-card layout-'+esc(type)+'" style="'+theme+'border-radius:var(--ad-radius,22px);">'
      +badgeHtml
      +'<header class="skh-ann-post-head">'+(logo?'<img class="skh-ann-brand-logo" src="'+esc(logo)+'" alt="'+esc(brand)+'">':'<span class="skh-ann-brand-fallback">'+initial+'</span>')
      +'<div class="skh-ann-brand-copy"><b>'+esc(brand)+'</b><small>'+(live?'SokoHai Live':'Sponsored · Advertisement')+'</small></div><span class="skh-ann-sponsored">AD</span></header>'
      +(media?(copy?'<div class="skh-ann-copy">'+copy+'</div>':'')+media:'<div class="skh-ann-text-creative"><i class="skh-ann-orb one"></i><i class="skh-ann-orb two"></i><i class="skh-ann-shine"></i><span class="skh-ann-text-kicker">Featured on SokoHai</span><div class="skh-ann-text-content">'+copy+'</div><div class="skh-ann-text-cta">'+actionButton+'</div></div>')
      +(metrics?'<div class="skh-ann-metrics">'+metrics+'</div>':'')
      +(media?'<footer class="skh-ann-post-actions">'+actionButton+'</footer>':'')
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
    const video=host.querySelector('video');
    if(video && a.autoplay!==false){video.muted=true;const play=video.play();if(play&&play.catch)play.catch(function(){});}
  }

  function armScheduleRefresh(){clearTimeout(scheduleTimer);const now=Date.now(),source=Array.isArray(window.__sokohaiAnnouncementsCache)?window.__sokohaiAnnouncementsCache:[],times=[];source.forEach(a=>{if(a&&a.archived!==true&&a.status!=='archived'&&a.active!==false&&a.status!=='draft'){const s=Date.parse(a.startAt||''),e=Date.parse(a.endAt||'');if(s>now)times.push(s);if(e>now)times.push(e+50);}});if(times.length){const delay=Math.max(250,Math.min(3600000,Math.min.apply(Math,times)-now));scheduleTimer=setTimeout(renderCurrent,delay);}}
  function renderCurrent(){clearTimeout(rotationTimer);armScheduleRefresh();if(liveNotice){renderAd(liveNotice,true);return;}const list=activeAds();if(!list.length){hide();return;}if(activeIndex>=list.length)activeIndex=0;renderAd(list[activeIndex],false);if(list.length>1)rotationTimer=setTimeout(()=>{activeIndex=(activeIndex+1)%list.length;renderCurrent();},Math.max(5000,Number(list[activeIndex].rotationMs)||9000));}
  window.startSokoHaiSmoothMarquee=renderCurrent;window.startSokoHaiAnnouncementRotator=renderCurrent;window.startSokoHaiProAnnouncementBar=renderCurrent;window.playNextSokoHaiProAnnouncement=function(){activeIndex++;renderCurrent();};window.rotateSokoHaiAnnouncement=window.playNextSokoHaiProAnnouncement;
  window.__sokohaiOnAnnouncementsUpdate=function(){activeIndex=0;renderCurrent();};
  window.updateLiveTicker=function(type,message,subject,forceReset){clearTimeout(liveTimer);if(type==='normal'||forceReset){liveNotice=null;renderCurrent();return;}liveNotice={creativeType:'solid_text',brandName:'SokoHai',headline:subject||'Taarifa muhimu',description:message||'',active:true};renderCurrent();liveTimer=setTimeout(()=>{liveNotice=null;renderCurrent();},16000);};
  document.addEventListener('DOMContentLoaded',renderCurrent);setTimeout(renderCurrent,250);
})();

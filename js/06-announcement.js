/* SokoHai Home Advertisement Showcase — existing announcements collection authority. */
(function () {
  'use strict';
  if (window.__SOKOHAI_ANNOUNCEMENT_STORY_V2__) return;
  window.__SOKOHAI_ANNOUNCEMENT_STORY_V2__ = true;

  let activeIndex = 0, rotationTimer = null, scheduleTimer = null, liveTimer = null, liveNotice = null;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = v => { const s=String(v||'').trim(); return /^(https:\/\/|\/|#)/i.test(s)&&!/["'<>\s]/.test(s)?s:''; };
  const short = (v,n) => { const s=String(v||'').replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n-1).trim()+'…':s; };
  const mediaType = a => String(a.creativeType||a.mediaType||a.type||'image_text').toLowerCase();

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
    return source.filter(a=>stateOf(a,now)==='active' && (a.text||a.headline||a.image||a.imageUrl||a.videoUrl))
      .sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
  function hide(){const h=document.getElementById('topAnnouncement');if(!h)return;h.className='big-announcement skh-ann-story is-empty';h.innerHTML='';h.hidden=true;}
  function openAction(url){if(!url)return;if(url[0]==='#'||url[0]==='/')location.href=url;else window.open(url,'_blank','noopener');}
  window.skhAnnouncementOpen=openAction;

  function mediaHtml(a,title,type) {
    const image=safeUrl(a.image || a.imageUrl || a.mediaUrl || a.photo), video=safeUrl(a.videoUrl), poster=safeUrl(a.posterUrl || image), audio=safeUrl(a.audioUrl);
    let visual='';
    if (type.indexOf('video')!==-1 && video) visual='<video class="skh-ann-video" muted playsinline controls preload="metadata" '+(poster?'poster="'+esc(poster)+'" ':'')+'><source src="'+esc(video)+'"></video>';
    else if (image) visual='<img src="'+esc(image)+'" alt="'+esc(title)+'" loading="eager" decoding="async">';
    if (!visual) return '';
    return '<div class="skh-ann-media">'+visual+(audio?'<audio class="skh-ann-audio" controls preload="none" src="'+esc(audio)+'"></audio>':'')+'</div>';
  }

  function countLabel(value, label) {
    const n=Number(value)||0;
    return n>0?'<span><b>'+n.toLocaleString()+'</b> '+esc(label)+'</span>':'';
  }

  function cardHtml(a, live) {
    const type=mediaType(a), title=short(a.headline||a.title||a.text||'SokoHai',120), message=short(a.description||a.text||'',320);
    const brand=short(a.brandName||a.brand||'SokoHai',48), logo=safeUrl(a.logoUrl), link=safeUrl(a.link||a.actionUrl), action=short(a.ctaLabel||a.actionLabel||'Tazama Zaidi',28);
    const media=mediaHtml(a,title,type), withText=type.indexOf('text')!==-1||!!(a.headline||a.description||a.text);
    const initial=esc((brand.charAt(0)||'S').toUpperCase());
    const metrics=countLabel(a.likeCount||a.likesCount,'likes')+countLabel(a.viewCount||a.views,'views')+countLabel(a.clickCount||a.clicks,'clicks');
    return '<article class="skh-ann-card">'
      +'<header class="skh-ann-post-head">'+(logo?'<img class="skh-ann-brand-logo" src="'+esc(logo)+'" alt="'+esc(brand)+'">':'<span class="skh-ann-brand-fallback">'+initial+'</span>')
      +'<div><b>'+esc(brand)+'</b><small>'+(live?'SokoHai Live':'Sponsored · Advertisement')+'</small></div><span class="skh-ann-sponsored">Ad</span></header>'
      +(withText?'<div class="skh-ann-copy"><strong class="skh-ann-title">'+esc(title)+'</strong>'+(message&&message!==title?'<p>'+esc(message)+'</p>':'')+'</div>':'')
      +media
      +(metrics?'<div class="skh-ann-metrics">'+metrics+'</div>':'')
      +'<footer class="skh-ann-post-actions">'+(link?'<button type="button" class="skh-ann-action" onclick="window.skhAnnouncementOpen(\''+esc(link)+'\')">'+esc(action)+'</button>':'<span class="skh-ann-no-cta">Tangazo la SokoHai</span>')+'</footer>'
      +'</article>';
  }
  window.skhAdvertisementCardHtml=cardHtml;

  function renderAd(a, live) {
    const host=document.getElementById('topAnnouncement');if(!host||!a)return;
    const hasMedia=!!safeUrl(a.image||a.imageUrl||a.mediaUrl||a.photo||a.videoUrl);
    host.hidden=false;
    host.className='big-announcement skh-ann-story skh-home-ad skh-ann-post '+(hasMedia?'has-media':'no-media')+(live?' is-live':'');
    host.innerHTML=cardHtml(a,live);
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

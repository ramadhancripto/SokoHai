/* SokoHai Creative Studio — one lazy-loaded editor for every source/format. */
import { skh } from './00-bootstrap.js';
import {
  createCreative,normalizeCreative,duplicateCreative,resizeCreative,applyEntity,makeLayer,
  FORMAT_PRESETS,VERIFIED_FONTS,QUICK_COLORS,SOKOHAI_BRAND_COLORS,GRADIENT_PRESETS,PATTERNS,TEXTURES,
  ENTRANCE_ANIMATIONS,EMPHASIS_ANIMATIONS,EXIT_ANIMATIONS,ANIMATION_MODES,BADGE_ANIMATIONS,CTA_ANIMATIONS,
  FIT_MODES,FOCAL_POINTS,ASPECT_RATIOS,MULTIMEDIA_PRESETS,
  TEXT_STYLE_PRESETS,FONT_PAIRING_PRESETS,generatePalette,alignLayers,
  templatesFor,autoDesignVariations,designSuggestions,validateCreative,contrastRatio,
  /* [NON-CANVAS MVP 2026-09-24] */
  MAX_AD_MEDIA_SECONDS,MAX_AD_DURATION_SECONDS,SLIDESHOW_TRANSITIONS,slideshowTotal,detectComposition,COMPOSITION_LABELS,autoAdDuration
} from './creative/creative-model.js';
import {CreativeHistory} from './creative/creative-history.js';
import {renderCreativeSvg,exportCreative,downloadBlob,removeBackgroundClient} from './creative/creative-svg-renderer.js';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)], esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,history=null,selected='',activeTab='basic',saveTimer=null,drag=null,zoom=.58,guides=true,variations=[],advancedMode=false,recentColors=[];
let isPlaying=false,currentTime=0,playInterval=null,isMuted=false,masterVolume=1,audioElement=null;
const storageKey=c=>'skh_creative_draft_'+(c.id||'new_'+(c.linkedEntity?.id||'blank'));

function toast(m,t='success'){if(window.skhToast)window.skhToast(m,t);else alert(m);}
function ensureCss(){if($('#skhCreativeCss'))return;const l=document.createElement('link');l.id='skhCreativeCss';l.rel='stylesheet';l.href='css/39-creative-studio.css';document.head.appendChild(l);}
function currentLayer(){return state?.layers.find(l=>l.id===selected)||null;}
function commit(mutator,label){
  const next=JSON.parse(JSON.stringify(state));
  mutator(next);
  next.updatedAt=new Date().toISOString();
  state=history.commit(next);
  render(label);
  syncBackToLegacyForm();
  scheduleSave();
}
function replace(next){
  state=history.replace(normalizeCreative(next));
  selected='';
  render();
  syncBackToLegacyForm();
  scheduleSave();
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft(false),900);}

function togglePlay(){
  isPlaying=!isPlaying;
  const btn=$('#csPlayBtn');
  if(btn)btn.textContent=isPlaying?'⏸':'▶';
  if(isPlaying){
    const dur=state?.duration||30;
    if(currentTime>=dur)currentTime=0;
    playInterval=setInterval(()=>{
      currentTime+=0.2;
      const d=state?.duration||30;
      if(currentTime>=d){
        currentTime=d;
        togglePlay();
      }
      updateTimelineUI();
    },200);
  }else{
    clearInterval(playInterval);
  }
}

function restartPlayback(){
  currentTime=0;
  updateTimelineUI();
  if(!isPlaying)togglePlay();
}

function toggleMute(){
  isMuted=!isMuted;
  const btn=$('#csMuteBtn');
  if(btn)btn.textContent=isMuted?'🔇':'🔊';
  if(audioElement)audioElement.muted=isMuted;
}

function updateTimelineUI(){
  const scr=$('#csTimelineScrubber');
  const ct=$('#csCurrentTime');
  const dur=state?.duration||30;
  if(scr){scr.max=dur;scr.value=currentTime;}
  if(ct){
    const mins=Math.floor(currentTime/60);
    const secs=Math.floor(currentTime%60);
    ct.textContent=`${mins}:${secs<10?'0':''}${secs}`;
  }
}

function syncBackToLegacyForm(){
  const modal=document.getElementById('announcementFormModal');
  if(!modal||!state)return;
  const ssFeed=state.slideshow&&Array.isArray(state.slideshow.slides)&&state.slideshow.slides.filter(s=>s&&s.src).length>=2?state.slideshow:null;
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val!=null)el.value=val;};
  const role=r=>state.layers.find(l=>l.role===r);
  const head=role('headline'),body=role('body'),price=role('price'),cta=role('cta');
  const img=state.layers.find(l=>l.type==='image'||l.type==='video');
  const isVideo=img?.type==='video';
  const aud=state.layers.find(l=>l.type==='audio');
  /* [FINAL INSTRUCTIONS §1/§6] Map composition → form creativeType so the
     simple-form save path never forces media on a text/graphic-only ad. */
  const compNow=detectComposition(state);
  const typeForComp={poster:'solid_text',image:'image_text',sponsored:'image_text',image_audio:'image_audio',
    video:'video',video_text:'video_text',video_audio:'video_audio',slideshow:'image_text',
    slideshow_audio:'image_audio',image_video:'video',full_mix:'video_audio',audio:'solid_text'}[compNow]||'image_text';
  set('annCreativeType',typeForComp);
  if(head?.content)set('annHeadline',head.content);
  if(body?.content)set('annText',body.content);
  if(price?.content)set('annPriceTag',price.content);
  if(cta?.content)set('annCta',cta.content);
  if(state.background?.color)set('annPrimaryColor',state.background.color);
  if(state.background?.color2)set('annAccentColor',state.background.color2);
  if(head?.style?.fill)set('annTextColor',head.style.fill);
  if(head?.style?.fontWeight)set('annFontWeight',head.style.fontWeight);
  if(head?.animation?.entrance)set('annTextAnimation',head.animation.entrance);
  if(head?.animation?.emphasis)set('annTextEmphasis',head.animation.emphasis);
  if(head?.animation?.mode)set('annAnimationMode',head.animation.mode);
  if(head?.animation?.duration)set('annAnimationDuration',head.animation.duration);
  if(img?.src){
    if(isVideo){set('annVideo',img.src);set('annImage','');}
    else{set('annImage',img.src);set('annVideo','');}
  }else if(ssFeed&&ssFeed.slides&&ssFeed.slides[0]?.src){
    set('annImage',ssFeed.slides[0].src);set('annVideo','');
  }
  if(aud?.src)set('annAudio',aud.src);
  if(img?.style?.fit)set('annMediaFit',img.style.fit);
  if(img?.focalPoint)set('annFocalPoint',img.focalPoint);
  if(state.brandKit?.name)set('annBrand',state.brandKit.name);
  if(state.brandKit?.logoUrl)set('annLogo',state.brandKit.logoUrl);
  if(state.destination?.url)set('annLink',state.destination.url);
  // --- Canonical advertisement meta (Creator Studio upgrade) ---
  const bdg=state.layers.find(l=>l.role==='badge');
  if(bdg){
    set('annBadgeText',bdg.content);
    if(/^#[0-9a-f]{6}$/i.test(bdg.style?.backgroundColor||''))set('annBadgeColor',bdg.style.backgroundColor);
    if(/^#[0-9a-f]{6}$/i.test(bdg.style?.fill||''))set('annBadgeTextColor',bdg.style.fill);
    if(bdg.animation&&(bdg.animation.emphasis!=='none'||bdg.animation.entrance!=='none'))set('annBadgeAnimation',bdg.animation.emphasis!=='none'?bdg.animation.emphasis:bdg.animation.entrance);
  }
  if(state.offer)set('annPriceTag',state.offer);
  if(state.category)set('annCategory',state.category);
  if(state.campaignName!=null)set('annCampaignName',state.campaignName);
  if(state.campaignId!=null)set('annCampaignId',state.campaignId);
  if(state.paletteId!=null)set('annPaletteId',state.paletteId);
  if(state.priority!=null)set('annPriority',state.priority);
  if(state.startAt)set('annStartAt',String(state.startAt).slice(0,16));
  if(state.endAt)set('annEndAt',String(state.endAt).slice(0,16));
  if(state.displayDurationSeconds)set('annDisplayDuration',state.displayDurationSeconds);
  if(state.id)set('annCreativeId',state.id);
  /* [NON-CANVAS MVP 2026-09-24] Carry slideshow + trimmed media duration into
     the announcement form so Save → published card keeps them (§6/§22). */
  const setH=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val==null?'':String(val);};
  setH('annSlideshow',ssFeed?JSON.stringify(ssFeed):'');
  setH('annMediaDuration',(()=>{
    const v=state.layers.find(l=>l.type==='video');
    if(v){const vm=v.videoMeta||{};const t=(Number(vm.trimEnd)||0)-(Number(vm.trimStart)||0);return t>0?Math.round(t):Math.round(Number(vm.duration)||0)||'';}
    if(ssFeed)return Math.round(slideshowTotal(state))||'';
    return '';
  })());
  if(typeof window.skhRenderAdminAdPreview==='function'){
    window.skhRenderAdminAdPreview();
  }
}

function rememberColor(hex){
  if(!hex||!/^#[0-9a-f]{6}$/i.test(hex))return;
  recentColors=[hex,...recentColors.filter(c=>c.toLowerCase()!==hex.toLowerCase())].slice(0,8);
}

function shell(){
  let m=$('#skhCreativeStudio');if(m)return m;
  m=document.createElement('div');m.id='skhCreativeStudio';m.className='skh-cs';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
  m.innerHTML=`
 <header class="skh-cs-top">
   <button data-a="close" aria-label="Close">×</button>
   <div class="skh-cs-brand"><b>SokoHai Creative Studio</b><input id="csTitle" aria-label="Design title"></div>
   <div class="skh-cs-tools">
     <button data-a="undo" title="Undo">↶ Undo</button>
     <button data-a="redo" title="Redo">↷ Redo</button>
     <button data-a="reset" title="Reset design to blank creative">⟲ Reset</button>
     <button data-a="preview">Preview</button>
     <button data-a="save">Save draft</button>
     <button class="cs-advanced-only" data-a="duplicate">Duplicate</button>
     <button class="cs-advanced-only" data-a="resize">Resize</button>
     <button class="cs-advanced-only accent" data-a="auto">Auto Design</button>
     <button class="cs-advanced-only" data-a="export">Export</button>
     <button data-a="toggleadvanced">More design tools</button>
     <button class="cs-mobile-props cs-advanced-only" data-a="mobileprops">Properties</button>
     <button class="primary" data-a="publish">Publish</button>
   </div>
 </header>
 <div id="csQuickBar" class="cs-quick-bar" hidden></div>
 <main class="skh-cs-layout">
   <aside class="skh-cs-left">
     <nav>
       ${[['basic','Basic'],['design','Design'],['motion','Motion'],['media','Media'],['cta','CTA'],['schedule','Schedule'],['advanced','Advanced']].map(([x,l])=>`<button data-tab="${x}">${l}</button>`).join('')}
     </nav>
     <div id="csLibrary" class="skh-cs-library"></div>
   </aside>
   <section class="skh-cs-work">
     <div class="skh-cs-status"><span id="csFormat"></span><span id="csSaveState">Draft</span></div>
     <div id="csStage" class="skh-cs-stage">
       <div id="csCanvas" class="skh-cs-canvas"></div>
     </div>
     <div class="cs-timeline-bar" id="csTimelineBar">
       <div class="cs-tb-controls">
         <button data-a="playtoggle" id="csPlayBtn" title="Play/Pause">▶</button>
         <button data-a="restart" title="Restart">⏮</button>
         <span id="csCurrentTime">0:00</span> / <span id="csTotalDuration">0:30</span>
       </div>
       <input type="range" id="csTimelineScrubber" min="0" max="59" step="0.1" value="0">
       <div class="cs-tb-vol">
         <button data-a="mutetoggle" id="csMuteBtn">🔊</button>
         <input type="range" id="csMasterVolume" min="0" max="100" value="100" style="width:70px;">
       </div>
     </div>
     <footer>
       <label>Zoom <input id="csZoom" type="range" min="20" max="100" value="58"></label>
       <button data-a="guides">Guides</button>
       <button data-a="grid">Grid</button>
       <button data-a="fit">Fit</button>
       <button data-a="improvedesign">✨ Improve Design</button>
     </footer>
   </section>
   <aside class="skh-cs-right">
     <div class="skh-cs-right-head"><b>Properties</b><button data-a="layers">Layers</button></div>
     <div id="csProperties"></div>
     <div id="csAssistant"></div>
   </aside>
 </main>
 <div id="csSheet" class="skh-cs-sheet" hidden></div>`;
  document.body.appendChild(m);
  bind(m);
  return m;
}

function bind(m){
  m.addEventListener('click',e=>{
    const a=e.target.closest('[data-a]')?.dataset.a,tab=e.target.closest('[data-tab]')?.dataset.tab;
    if(tab){activeTab=tab;renderLibrary();return;}
    if(a)action(a,e);
    const propBtn=e.target.closest('button[data-prop]');
    if(propBtn)updateProp(propBtn.dataset.prop,propBtn);
    const tpl=e.target.closest('[data-template]')?.dataset.template;
    if(tpl){
      const t=templatesFor(state.format).find(x=>x.id===tpl);
      if(t)replace({...t.creative,linkedEntity:state.linkedEntity,destination:state.destination,id:state.id,ownerId:state.ownerId});
    }
    const add=e.target.closest('[data-add]')?.dataset.add;
    if(add)addLayer(add,e.target.closest('[data-add]').dataset.value);
    const mKind=e.target.closest('[data-media-kind]')?.dataset.mediaKind;
    if(mKind)setMediaKind(mKind);
    const ly=e.target.closest('[data-layer]')?.dataset.layer;
    if(ly){selected=ly;renderCanvas();renderProperties();renderQuickBar();}
    const lop=e.target.closest('[data-op][data-id]');
    if(lop){
      const id=lop.dataset.id,op=lop.dataset.op;
      if(op==='duplicate'){selected=id;addLayer('duplicate-layer');}
      else commit(n=>{
        const l=n.layers.find(x=>x.id===id);if(!l)return;
        if(op==='up')l.zIndex++;
        if(op==='down')l.zIndex--;
        if(op==='lock')l.locked=!l.locked;
        if(op==='hide')l.visible=!l.visible;
      },'Layer '+op);
      return;
    }
    const vari=e.target.closest('[data-variation]')?.dataset.variation;
    if(vari&&variations[+vari])replace(variations[+vari].creative);
    const theme=e.target.closest('[data-quicktheme]')?.dataset.quicktheme;
    if(theme)applyQuickTheme(theme);
    const qcol=e.target.closest('[data-quickcolor]')?.dataset.quickcolor;
    if(qcol)applyQuickColor(qcol);
    const pal=e.target.closest('[data-palpreset]')?.dataset.palpreset;
    if(pal)applyPalettePreset(pal);
    const npal=e.target.closest('[data-namedpalette]')?.dataset.namedpalette;
    if(npal)applyNamedPalette(npal);
    const grad=e.target.closest('[data-gradpreset]')?.dataset.gradpreset;
    if(grad)applyGradientPreset(grad);
    const fpair=e.target.closest('[data-fpair]')?.dataset.fpair;
    if(fpair)applyFontPairing(fpair);
    const tstyle=e.target.closest('[data-tstyle]')?.dataset.tstyle;
    if(tstyle)applyTextStyle(tstyle);
    const frame=e.target.closest('[data-frame]')?.dataset.frame;
    if(frame)applyFrameShape(frame);
    const align=e.target.closest('[data-align]')?.dataset.align;
    if(align)applyAlignment(align);
    const adP=e.target.closest('[data-adpreset]')?.dataset.adpreset;
    if(adP)applyAdPreset(adP);
    const cropA=e.target.closest('[data-crop-aspect]')?.dataset.cropAspect;
    if(cropA)applyCropAspect(cropA);
    const ctaP=e.target.closest('[data-ctapreset]')?.dataset.ctapreset;
    if(ctaP)updateSimple('cta',ctaP);
    const ctaS=e.target.closest('[data-cta-style]')?.dataset.ctaStyle;
    if(ctaS)applyCtaStyle(ctaS);
    const fmtSw=e.target.closest('[data-format-switch]')?.dataset.formatSwitch;
    if(fmtSw)switchFormat(fmtSw);
    /* [NON-CANVAS MVP 2026-09-24] 9-grid text position presets (§8) */
    const ncPos=e.target.closest('[data-nc-pos]')?.dataset.ncPos;
    if(ncPos)applyTextPositionPreset(ncPos);
    /* Slideshow slide actions (§15) */
    const ssAct=e.target.closest('[data-ss-act]')?.dataset.ssAct;
    if(ssAct!=null){
      const idx=Number(e.target.closest('[data-ss-act]').dataset.ssIdx)||0;
      slideshowAction(ssAct,idx);
    }
  });

  m.addEventListener('input',e=>{
    if(e.target.id==='csZoom'){zoom=+e.target.value/100;scaleCanvas();return;}
    if(e.target.id==='csTitle'){state.title=e.target.value;scheduleSave();return;}
    if(e.target.id==='csToolSearch'){filterTools(e.target.value);return;}
    if(e.target.id==='csTimelineScrubber'){currentTime=+e.target.value;updateTimelineUI();return;}
    if(e.target.id==='csMasterVolume'){masterVolume=+e.target.value/100;if(audioElement)audioElement.volume=masterVolume;return;}
    if(e.target.dataset.simple){updateSimple(e.target.dataset.simple,e.target.value);return;}
    if(e.target.dataset.ctabg){updateCtaStyle(e.target.dataset.ctabg,e.target.value);return;}
    if(e.target.dataset.anim){updateAnim(e.target.dataset.anim,e.target);return;}
    if(e.target.dataset.vmeta){updateVmeta(e.target.dataset.vmeta,e.target);return;}
    if(e.target.dataset.audio){updateAudio(e.target.dataset.audio,e.target);return;}
    if(e.target.dataset.mix){updateMix(e.target.dataset.mix,e.target);return;}
    if(e.target.dataset.timelineDur){updateTimelineDur(+e.target.value);return;}
    if(e.target.dataset.layerTime){updateLayerTime(e.target.dataset.layerTime,e.target.dataset.timeField,+e.target.value);return;}
    if(e.target.dataset.ssDur!=null){updateSlideshowProp('slideDur',e.target);return;}
    if(e.target.dataset.ssDefaultDur!=null){updateSlideshowProp('defaultDuration',e.target);return;}
    const key=e.target.dataset.prop;
    if(key)updateProp(key,e.target);
  });

  m.addEventListener('change',e=>{
    if(e.target.id==='csAnimTargetLayer'){selected=e.target.value;renderCanvas();renderProperties();renderQuickBar();return;}
    if(e.target.dataset.durMode){setDurationMode(e.target.dataset.durMode);return;}
    if(e.target.dataset.designMode){setDesignMode(e.target.dataset.designMode);return;}
    if(e.target.dataset.anim){updateAnim(e.target.dataset.anim,e.target);return;}
    if(e.target.dataset.vmeta){updateVmeta(e.target.dataset.vmeta,e.target);return;}
    if(e.target.dataset.audio){updateAudio(e.target.dataset.audio,e.target);return;}
    if(e.target.dataset.mix){updateMix(e.target.dataset.mix,e.target);return;}
    if(e.target.dataset.bg)updateBackground(e.target.dataset.bg,e.target);
    if(e.target.id==='csAddMediaFile')addMediaFromInput(e.target);
    else if(e.target.id==='csLogoFile')addLogoFromInput(e.target);
    else if(e.target.id==='csImageFile'||e.target.id==='csMediaFile')uploadMedia(e.target);
    else if(e.target.id==='csAudioFileInput')uploadAudio(e.target);
    /* [NON-CANVAS MVP 2026-09-24] Slideshow inputs */
    else if(e.target.id==='csSlideFiles')addSlidesFromInput(e.target);
    else if(e.target.dataset.ssDur!=null)updateSlideshowProp('slideDur',e.target);
    else if(e.target.dataset.ssTransition!=null)updateSlideshowProp('transition',e.target);
    else if(e.target.dataset.ssDefaultDur!=null)updateSlideshowProp('defaultDuration',e.target);
  });

  $('#csCanvas',m).addEventListener('pointerdown',pointerStart);
  window.addEventListener('pointermove',pointerMove);
  window.addEventListener('pointerup',pointerEnd);

  document.addEventListener('keydown',e=>{
    if(!$('#skhCreativeStudio')?.classList.contains('open'))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
      e.preventDefault();state=e.shiftKey?history.redo():history.undo();render();
    }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){
      e.preventDefault();state=history.redo();render();
    }else if((e.key==='Delete'||e.key==='Backspace')&&selected&&!/INPUT|TEXTAREA/.test(e.target.tagName)){
      commit(n=>n.layers=n.layers.filter(l=>l.id!==selected));selected='';renderQuickBar();
    }
  });
}

function action(a,e){
  if(a==='close'){close();return;}
  if(a==='openmedialibrary'){openMediaLibraryPicker();return;}
  if(a==='addmediaurl'){
    const url=($('#csAddMediaUrl')?.value||'').trim();
    if(!/^https:\/\//i.test(url))return toast('Weka HTTPS media URL halali.','error');
    applyAddedMedia(url,detectMediaKindFromUrl(url)||'image',url.split('/').pop().slice(0,40)||'Media',{});
    const inp=$('#csAddMediaUrl');if(inp)inp.value='';
    return;
  }
  if(a==='applylogourl'){
    const url=($('#csLogoUrl')?.value||'').trim();
    if(!/^https:\/\//i.test(url))return toast('Weka HTTPS logo URL halali.','error');
    applyAddedMedia(url,'image','Logo',{asLogo:true});
    const inp=$('#csLogoUrl');if(inp)inp.value='';
    return;
  }
  if(a==='removemedia'){
    const l=currentLayer();
    if(l&&(l.type==='image'||l.type==='video'||l.type==='logo'||l.type==='audio')){
      commit(n=>n.layers=n.layers.filter(x=>x.id!==l.id));
      selected='';render();toast('Media layer imeondolewa.');
    }
    return;
  }
  if(a==='fitcanvas'){
    fitMediaToCanvas(e?.target?.closest('[data-a]')?.dataset.fitmode||'fit');return;
  }
  if(a==='togglevideo'||a==='togglevideomute'){
    const v=$('#csCanvas .cs-video-overlay');
    if(!v)return toast('Hakuna video kwenye canvas bado.','warning');
    if(a==='togglevideo'){if(v.paused)v.play().catch(()=>toast('Browser imezuia autoplay — tumia button tena.','warning'));else v.pause();}
    else{v.muted=!v.muted;toast(v.muted?'Video: muted':'Video: sound on','info');}
    return;
  }
  if(a==='toggleadvanced'){
    advancedMode=!advancedMode;
    $('#skhCreativeStudio')?.classList.toggle('advanced',advancedMode);
    if(advancedMode){activeTab='advanced';renderLibrary();}
    else{activeTab='basic';selected='';render();}
    return;
  }
  if(a==='mobileprops'){$('.skh-cs-right')?.classList.toggle('mobile-open');return;}
  if(a==='undo'){state=history.undo();render();return;}
  if(a==='redo'){state=history.redo();render();return;}
  /* [§17] Reset via the SAME state/history mechanism (replace → undo still works) */
  if(a==='reset'){
    if(!confirm('Reset design yote kurudi blank creative? (Undo inaweza kurudisha)'))return;
    const keep={format:state.format,ownerId:state.ownerId,id:state.id,destination:state.destination,
      linkedEntity:state.linkedEntity,category:state.category,campaignName:state.campaignName,
      campaignId:state.campaignId,brandKit:state.brandKit,displayDurationSeconds:state.displayDurationSeconds,
      publicationType:state.type,designMode:state.designMode};
    replace(createCreative(keep));
    toast('Design ime-reset. Undo inaweza kurudisha.','info');
    return;
  }
  if(a==='guides'){guides=!guides;renderCanvas();return;}
  if(a==='fit'){
    zoom=Math.min(.8,Math.max(.2,($('#csStage').clientHeight-80)/state.canvas.height));
    $('#csZoom').value=Math.round(zoom*100);scaleCanvas();return;
  }
  if(a==='save'){saveDraft(true);return;}
  if(a==='duplicate'){replace(duplicateCreative(state));toast('Creative duplicated.');return;}
  if(a==='auto'){variations=autoDesignVariations(state);activeTab='templates';renderLibrary(true);return;}
  if(a==='preview'){showPreview();return;}
  if(a==='export'){showExport();return;}
  if(a==='resize'){showResize();return;}
  if(a==='publish'){publish();return;}
  if(a==='layers'){showLayers();return;}
  if(a==='grid'){guides=true;renderCanvas();return;}
  if(a==='improvedesign'){showImproveDesign();return;}
  if(a==='removebg'){doRemoveBackground();return;}
  if(a==='eraser'){showEraserModal();return;}
  if(a==='restoreimage'){doRestoreImage();return;}
  if(a==='playtoggle'){togglePlay();return;}
  if(a==='restart'){restartPlayback();return;}
  if(a==='mutetoggle'){toggleMute();return;}
  if(a==='testaudio'){testAudioPlayback();return;}
  if(a==='flipx'){
    const l=currentLayer();
    if(l){
      commit(n=>{
        const t=n.layers.find(x=>x.id===l.id);
        if(t){t.style=t.style||{};t.style.flipX=!t.style.flipX;}
      },'Flip X');
    }
    return;
  }
  if(a==='flipy'){
    const l=currentLayer();
    if(l){
      commit(n=>{
        const t=n.layers.find(x=>x.id===l.id);
        if(t){t.style=t.style||{};t.style.flipY=!t.style.flipY;}
      },'Flip Y');
    }
    return;
  }
  if(a==='replayanim'){
    renderCanvas();
    toast('Playing animation preview...','info');
    return;
  }
  /* [NON-CANVAS MVP 2026-09-24] One-click trim to the 60s ad limit (§11/§33).
     Original media is NEVER overwritten — only trimStart/trimEnd metadata. */
  if(a==='trimto60'){
    const l=currentLayer()?.type==='video'?currentLayer():state.layers.find(x=>x.type==='video');
    if(!l)return toast('Hakuna video ya kutrima.','warning');
    commit(n=>{
      const t=n.layers.find(x=>x.id===l.id);if(!t)return;
      t.videoMeta=t.videoMeta||{};
      /* [§9] largest valid window = 59s (STRICT < 60) */
      t.videoMeta.trimStart=0;
      t.videoMeta.trimEnd=MAX_AD_DURATION_SECONDS;
      if(Number(t.videoMeta.duration)>=MAX_AD_MEDIA_SECONDS){
        toast(`Trimmed to 0:00–0:59 (duration < 60). Original (${Math.round(t.videoMeta.duration)}s) preserved for re-editing.`);
      }else toast('Trim set to 0:00–0:59.');
    },'Trim video to <60s');
    renderLibrary();
    return;
  }
  if(a==='manualtrim'){
    activeTab='media';renderLibrary();
    toast('Weka Start/End kwenye Video Trim.','info');
    return;
  }
  if(a==='focuscustomcolor'){
    const inp=$('#csProperties input[type="color"][data-prop="style.fill"]');
    if(inp){inp.click();inp.focus();}else toast('Chagua text layer kwanza.','warning');
    return;
  }
}

function render(){
  if(!state)return;
  $('#csTitle').value=state.title;
  $('#csFormat').textContent=`${state.format} · ${state.canvas.width} × ${state.canvas.height}`;
  const totEl=$('#csTotalDuration');
  if(totEl){const d=state.duration||30;totEl.textContent=`${Math.floor(d/60)}:${String(Math.floor(d%60)).padStart(2,'0')}`;}
  renderCanvas();
  renderLibrary();
  renderProperties();
  renderAssistant();
  renderQuickBar();
  const u=$('[data-a="undo"]'),r=$('[data-a="redo"]');
  if(u)u.disabled=!history.canUndo;
  if(r)r.disabled=!history.canRedo;
}

function renderCanvas(){
  const box=$('#csCanvas');if(!box)return;
  box.innerHTML=renderCreativeSvg(state,{guides,selectedId:selected});
  scaleCanvas();
  $$('[data-layer-id]',box).forEach(n=>{
    n.style.cursor='move';n.setAttribute('tabindex','0');
  });
  renderVideoOverlays(box);
}

/* Editor-only live video preview layered over the SVG canvas (same layer model,
   same coordinates). The published renderer (js/06-announcement.js) is untouched. */
function renderVideoOverlays(box){
  if(!box||!state)return;
  state.layers.filter(l=>l.type==='video'&&l.visible!==false&&(l.videoUrl||l.src)).forEach(l=>{
    const vm=l.videoMeta||{},st=l.style||{};
    const v=document.createElement('video');
    v.className='cs-video-overlay';
    v.src=l.videoUrl||l.src;
    if(l.posterUrl)v.poster=l.posterUrl;
    v.muted=vm.muted!==false;
    v.loop=vm.loop!==false;
    v.playsInline=true;
    /* [FINAL INSTRUCTIONS §10/§11/§25] Trim-aware, poster-first preview:
       - seek into the trimmed segment on load; wrap at trimEnd while looping;
       - HTTPS URL videos: capture real duration once (drives <60s validation);
       - NO autoplay: initial state = poster; click = Play/Pause; original file
         remains the source — nothing is cut on disk. */
    const tS=Number(vm.trimStart)||0,tE=Number(vm.trimEnd)||0;
    v.addEventListener('loadedmetadata',()=>{
      if(v.duration&&Number.isFinite(v.duration)&&v.duration>0&&(!vm.duration||Math.abs(Number(vm.duration)-v.duration)>0.5)){
        commit(n=>{const t=n.layers.find(x=>x.id===l.id);if(t&&t.videoMeta){
          t.videoMeta.duration=Math.round(v.duration);
          if(!t.videoMeta.trimEnd||t.videoMeta.trimEnd>MAX_AD_DURATION_SECONDS)t.videoMeta.trimEnd=Math.min(MAX_AD_DURATION_SECONDS,Math.round(v.duration));
        }},'Video duration detected');
      }
      if(tS>0){try{v.currentTime=tS;}catch(e){}}
    });
    if(tE>tS)v.addEventListener('timeupdate',()=>{
      if(v.currentTime>=tE){v.currentTime=tS||0;if(!vm.loop)v.pause();}
    });
    const fitMode=st.fit==='contain'?'contain':st.fit==='fill'?'fill':'cover';
    v.style.cssText=`position:absolute;left:${(l.x||0)*zoom}px;top:${(l.y||0)*zoom}px;width:${(l.width||0)*zoom}px;height:${(l.height||0)*zoom}px;object-fit:${fitMode};border-radius:${(st.radius||0)*zoom}px;transform:rotate(${l.rotation||0}deg);opacity:${l.opacity??1};pointer-events:auto;cursor:pointer;background:#000;`;
    v.title='Click: Play / Pause (poster-first)';
    v.addEventListener('click',()=>{if(v.paused)v.play().catch(()=>{});else v.pause();});
    box.appendChild(v);
    /* NO autoplay — initial state is the poster (§11/§24) */
  });
}

function scaleCanvas(){
  const b=$('#csCanvas');if(!b||!state)return;
  b.style.width=(state.canvas.width*zoom)+'px';
  b.style.height=(state.canvas.height*zoom)+'px';
}

function renderQuickBar(){
  const bar=$('#csQuickBar');if(!bar)return;
  const l=currentLayer();
  if(!l){bar.hidden=true;bar.innerHTML='';return;}
  bar.hidden=false;
  if(l.type==='image'||l.type==='video'){
    const isVid=l.type==='video';
    bar.innerHTML=`<span class="cs-qb-label">${isVid?'🎬':'🖼️'} ${esc(l.name)}</span>
      ${!isVid?'<button data-a="removebg" class="cs-qb-btn">🪄 Remove BG</button>':''}
      <button data-tab="design" class="cs-qb-btn">✂️ Crop & Design</button>
      ${isVid?'<button data-tab="media" class="cs-qb-btn">🎬 Playback & Trim</button><button data-a="togglevideo" class="cs-qb-btn">⏯ Play</button><button data-a="togglevideomute" class="cs-qb-btn">🔊 Mute</button>':'<button data-tab="media" class="cs-qb-btn">🎛️ Media Controls</button>'}
      <button data-a="flipx" class="cs-qb-btn">↔ Flip</button>
      <button data-a="restoreimage" class="cs-qb-btn">↺ Restore</button>
      <button data-a="toggleadvanced" class="cs-qb-btn">⚙️ Advanced</button>`;
  }else if(l.type==='text'){
    bar.innerHTML=`<span class="cs-qb-label">📝 ${esc(l.name)}</span>
      <button data-tstyle="Headline" class="cs-qb-btn">Headline</button>
      <button data-tab="motion" class="cs-qb-btn">✨ Animate Text</button>
      <button data-prop="style.fontWeight" value="${+l.style.fontWeight>=800?400:900}" class="cs-qb-btn"><b>B</b> Bold</button>
      <button data-tab="design" class="cs-qb-btn">🎨 Colors</button>
      <button data-a="toggleadvanced" class="cs-qb-btn">⚙️ Advanced</button>`;
  }else{
    bar.innerHTML=`<span class="cs-qb-label">🔷 ${esc(l.name)}</span>
      <button data-tab="design" class="cs-qb-btn">🎨 Fill Color</button>
      <button data-add="duplicate-layer" class="cs-qb-btn">Duplicate</button>
      <button data-a="toggleadvanced" class="cs-qb-btn">⚙️ Advanced</button>`;
  }
}

function renderLibrary(showVars=false){
  const box=$('#csLibrary');if(!box)return;
  $$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));
  if(activeTab==='basic')box.innerHTML=basicControls();
  else if(activeTab==='design')box.innerHTML=designControls();
  else if(activeTab==='motion')box.innerHTML=animationControls();
  else if(activeTab==='media')box.innerHTML=mediaTabControls();
  else if(activeTab==='cta')box.innerHTML=ctaControls();
  else if(activeTab==='schedule')box.innerHTML=scheduleControls();
  else if(activeTab==='advanced')box.innerHTML=advancedControls();
  else if(activeTab==='timeline')box.innerHTML=timelineControls(); /* Advanced sub-view */
  else if(showVars||variations.length&&activeTab==='templates')box.innerHTML='<h3>Auto Design Variations</h3><p>Choose a labeled layout. None is called “best”.</p><div class="cs-templates">'+variations.map((v,i)=>`<button data-variation="${i}" style="--a:${v.creative.background.color};--b:${v.creative.background.color2}"><i></i><b>${esc(v.name)}</b></button>`).join('')+'</div><hr><h3>Templates</h3>'+templateCards();
  else if(activeTab==='templates')box.innerHTML='<h3>Editable Templates</h3><p>Every element remains a layer.</p>'+templateCards();
}

function presetsControls(){
  return `
    <div class="cs-simple-head"><span>🚀</span><div><h3>Smart Ad Creation Presets</h3><p>Chagua aina ya tangazo ili kusanidi muundo haraka.</p></div></div>
    
    <div class="cs-theme-picks">
      <button data-adpreset="static"><b>🖼️ Static Ad</b><small>Image + Text</small></button>
      <button data-adpreset="motion"><b>✨ Motion Poster</b><small>Image + Animated Text</small></button>
      <button data-adpreset="short_video"><b>🎬 Short Video</b><small>Video &lt; 60 Seconds (59s max)</small></button>
      <button data-adpreset="slideshow"><b>🖼️ Slideshow</b><small>Multi-Image Sequential Ad</small></button>
      <button data-adpreset="audio_visual"><b>🎵 Audio-Visual</b><small>Image + Audio Music</small></button>
      <button data-adpreset="video_audio"><b>🎥 Video + Audio Mix</b><small>Video + Voiceover / Music</small></button>
      <button data-adpreset="full_mix"><b>🌟 Full Multimedia</b><small>Image + Video + Audio + Text</small></button>
    </div>

    <h4>Ad Formats</h4>
    <div class="cs-addgrid">
      <button data-format-switch="square">Square 1:1</button>
      <button data-format-switch="portrait">Portrait 4:5</button>
      <button data-format-switch="story">Story 9:16</button>
      <button data-format-switch="landscape">Landscape 16:9</button>
    </div>
  `;
}

function audioControls(){
  const audioLayer = state.layers.find(l => l.type === 'audio') || null;
  const aMeta = audioLayer?.audioMeta || {};
  const mix = state.audioMix || { originalVideoVolume: 1, musicVolume: 0.8, voiceVolume: 1, muteOriginal: false };
  if(!audioLayer)return `<p class="cs-note">Hakuna audio track bado. Tumia <b>DESIGN → + Add Media</b> kupakia audio.</p>`;

  return `
    <div style="margin:10px 0;">
      <button data-a="testaudio" class="primary" style="width:100%;">▶ Play / Test Audio Track</button>
    </div>

    <h4>Track Settings</h4>
    <div class="cs-two">
      <label>Track Volume (${Math.round((aMeta.volume??0.8)*100)}%)<input data-audio="volume" type="range" min="0" max="1" step="0.05" value="${aMeta.volume??0.8}"></label>
      <label>Fade In (${aMeta.fadeIn||0}s)<input data-audio="fadeIn" type="range" min="0" max="5" step="0.5" value="${aMeta.fadeIn||0}"></label>
    </div>
    <label>Fade Out (${aMeta.fadeOut||0}s)<input data-audio="fadeOut" type="range" min="0" max="5" step="0.5" value="${aMeta.fadeOut||0}"></label>
    <div class="cs-two">
      <label>Trim Start (${aMeta.trimStart||0}s)<input data-audio="trimStart" type="range" min="0" max="59" step="1" value="${aMeta.trimStart||0}"></label>
      <label>Trim End (${aMeta.trimEnd||59}s)<input data-audio="trimEnd" type="range" min="0" max="59" step="1" value="${aMeta.trimEnd||59}"></label>
    </div>
    <div class="cs-two">
      <label><input type="checkbox" data-audio="loop" ${aMeta.loop!==false?'checked':''}> Loop audio</label>
      <label><input type="checkbox" data-audio="muted" ${aMeta.muted?'checked':''}> Muted</label>
    </div>
    <button class="cs-wide" data-tab="design">🔁 Replace audio (DESIGN → + Add Media)</button>

    <h4>Multi-Track Audio Mixing</h4>
    <label><input type="checkbox" data-mix="muteOriginal" ${mix.muteOriginal?'checked':''}> Mute Original Video Audio</label>
    <div class="cs-two" style="margin-top:6px;">
      <label>Original Video Sound (${Math.round(mix.originalVideoVolume*100)}%)<input data-mix="originalVideoVolume" type="range" min="0" max="1" step="0.05" value="${mix.originalVideoVolume}"></label>
      <label>Background Music (${Math.round(mix.musicVolume*100)}%)<input data-mix="musicVolume" type="range" min="0" max="1" step="0.05" value="${mix.musicVolume}"></label>
    </div>
    <label>Voiceover Volume (${Math.round(mix.voiceVolume*100)}%)<input data-mix="voiceVolume" type="range" min="0" max="1" step="0.05" value="${mix.voiceVolume}"></label>
  `;
}

function timelineControls(){
  return `
    <div class="cs-simple-head"><span>⏱️</span><div><h3>Timeline Orchestration</h3><p>Panga muda wa kila layer: start · duration · end (0 – ${MAX_AD_DURATION_SECONDS}s).</p></div></div>
    
    <label>Total Creative Duration: <b id="csTotalDurVal">${state.duration||30}s (0 &lt; duration &lt; 60 → max ${MAX_AD_DURATION_SECONDS}s)</b>
      <input data-timeline-dur type="range" min="3" max="${MAX_AD_DURATION_SECONDS}" step="1" value="${state.duration||30}">
    </label>

    <h4>Layer Timings (start · duration · end)</h4>
    <div class="cs-timeline-tracks">
      ${state.layers.map(l => {
        const start = l.startTime || 0, end = l.endTime || MAX_AD_DURATION_SECONDS;
        return `
          <div class="cs-tl-row" style="margin-bottom:12px; padding:8px; background:rgba(255,255,255,0.03); border-radius:8px;">
            <b style="font-size:13px; color:#E2E8F0;">${esc(l.name||l.role||l.type)}</b>
            <div class="cs-two" style="margin-top:4px;">
              <label>Start: ${start}s <input data-layer-time="${l.id}" data-time-field="startTime" type="range" min="0" max="${MAX_AD_DURATION_SECONDS}" value="${start}"></label>
              <label>End: ${end}s · Duration: ${Math.max(0,end-start)}s <input data-layer-time="${l.id}" data-time-field="endTime" type="range" min="0" max="${MAX_AD_DURATION_SECONDS}" value="${end}"></label>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function applyAdPreset(presetKey){
  const p = MULTIMEDIA_PRESETS[presetKey];
  if (!p) return;
  if (presetKey === 'slideshow') {
    /* [NON-CANVAS MVP 2026-09-24] Guide the user into the slideshow flow
       instead of guessing media — automation never steals control (§24/§25). */
    commit(n => { n.preset = 'slideshow'; }, 'Select Slideshow preset');
    activeTab = 'design';
    renderLibrary();
    toast('Slideshow: pakia picha 2+ kisha Enable slideshow.','info');
    return;
  }
  commit(n => {
    n.preset = presetKey;
    if (p.duration) n.duration = p.duration;
    if (p.format) {
      n.format = p.format;
      const fp = FORMAT_PRESETS[p.format];
      if (fp) { n.canvas.width = fp.width; n.canvas.height = fp.height; }
    }
    if (presetKey === 'short_video' || presetKey === 'video_audio' || presetKey === 'full_mix') {
      if (!n.layers.some(l => l.type === 'video')) {
        n.layers.push(makeLayer('video', { name: 'Video Layer', x: n.canvas.width*0.1, y: n.canvas.height*0.2, width: n.canvas.width*0.8, height: n.canvas.height*0.5 }));
      }
    }
    if (presetKey === 'audio_visual' || presetKey === 'video_audio' || presetKey === 'full_mix') {
      if (!n.layers.some(l => l.type === 'audio')) {
        n.layers.push(makeLayer('audio', { name: 'Background Audio', x: 80, y: n.canvas.height*0.82, width: n.canvas.width*0.8, height: 70 }));
      }
    }
    if (presetKey === 'motion' || presetKey === 'full_mix') {
      const head = n.layers.find(l => l.role === 'headline');
      if (head) {
        head.animation = { enabled: true, entrance: 'slide-up', emphasis: 'pulse', mode: 'word', duration: 600, delay: 100, stagger: 120, repeat: 1, easing: 'ease-out' };
      }
    }
  }, `Apply Preset ${presetKey}`);
  if (presetKey === 'short_video'||presetKey==='audio_visual'||presetKey==='video_audio'||presetKey==='full_mix') activeTab = 'design';
  else if (presetKey === 'motion') activeTab = 'motion';
  else activeTab = 'basic';
  renderLibrary();
  toast(`Applied preset: ${p.label}`);
}

function switchFormat(fmtKey){
  const p = FORMAT_PRESETS[fmtKey];
  if (!p) return;
  commit(n => {
    n.format = fmtKey;
    n.canvas.width = p.width;
    n.canvas.height = p.height;
  }, `Switch Format ${fmtKey}`);
  toast(`Switched format: ${p.label}`);
}

function updateAudio(key, el){
  const val = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number' ? +el.value : el.value);
  commit(n => {
    let l = n.layers.find(x => x.type === 'audio');
    if (!l) {
      l = makeLayer('audio', { name: 'Audio Track', src: '' });
      n.layers.push(l);
    }
    if (key === 'src') {
      l.src = val;
      l.audioUrl = val;
    } else {
      l.audioMeta = l.audioMeta || {};
      l.audioMeta[key] = val;
      if (key === 'trimStart' || key === 'trimEnd') {
        const start = l.audioMeta.trimStart || 0;
        const end = l.audioMeta.trimEnd || MAX_AD_DURATION_SECONDS;
        l.audioMeta.duration = Math.max(1, Math.min(MAX_AD_DURATION_SECONDS, end - start));
        l.duration = l.audioMeta.duration;
      }
    }
  }, 'Update Audio');
}

function updateMix(key, el){
  const val = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number' ? +el.value : el.value);
  commit(n => {
    n.audioMix = n.audioMix || { originalVideoVolume: 1, musicVolume: 0.8, voiceVolume: 1, muteOriginal: false };
    n.audioMix[key] = val;
  }, 'Update Audio Mix');
}

function updateTimelineDur(val){
  commit(n => {
    n.duration = Math.min(MAX_AD_DURATION_SECONDS, Math.max(1, +val));
    const totalEl = $('#csTotalDuration');
    if (totalEl) totalEl.textContent = `0:${String(n.duration).padStart(2, '0')}`;
  }, 'Update Duration');
}

function updateLayerTime(layerId, field, val){
  commit(n => {
    const l = n.layers.find(x => x.id === layerId);
    if (l) {
      l[field] = Math.min(MAX_AD_DURATION_SECONDS, Math.max(0, +val));
      if (l.startTime != null && l.endTime != null && l.endTime > l.startTime) {
        l.duration = l.endTime - l.startTime;
      }
    }
  }, 'Update Layer Timing');
}

async function uploadAudio(input){
  const file = input.files?.[0]; if (!file) return;
  input.value = '';
  await addMediaFile(file, { kind: 'audio' });
}

function testAudioPlayback(){
  const aud = state.layers.find(l => l.type === 'audio')?.src;
  if (!aud) return toast('No audio URL found. Upload or enter audio first.', 'warning');
  if (!audioElement) {
    audioElement = new Audio(aud);
  } else {
    audioElement.src = aud;
  }
  audioElement.volume = masterVolume;
  audioElement.muted = isMuted;
  audioElement.play().catch(e => toast('Audio playback: ' + e.message, 'warning'));
  toast('Playing audio track...', 'info');
}

/* ==== DESIGN tab helpers ==== */
function designMediaLayer(){
  const sel=state.layers.find(l=>l.id===selected&&(l.type==='image'||l.type==='video'||l.type==='logo'));
  return sel||state.layers.find(l=>l.type==='image'||l.type==='video')||null;
}
function detectMediaKind(file){
  const t=(file&&file.type)||'';
  if(t.startsWith('video/'))return 'video';
  if(t.startsWith('audio/'))return 'audio';
  if(t.startsWith('image/'))return 'image'; /* includes GIF, SVG, WebP */
  const ext=String(file&&file.name||'').split('.').pop().toLowerCase();
  if(['mp4','webm','mov','m4v','avi','mkv'].includes(ext))return 'video';
  if(['mp3','wav','m4a','aac','ogg','flac'].includes(ext))return 'audio';
  if(['jpg','jpeg','png','webp','gif','svg','bmp','avif'].includes(ext))return 'image';
  return null;
}
function detectMediaKindFromUrl(url){
  const u=String(url||'').toLowerCase().split('?')[0];
  if(/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(u))return 'video';
  if(/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(u))return 'audio';
  if(/\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)$/.test(u))return 'image';
  return null;
}
/* Reuses the single canonical uploader (js/11-uploads.js) and the Admin Media
   Library pipeline (adminMedia collection — reference metadata only, bytes stay
   on Cloudinary). Same size limits as the Announcement Form. */
const SKH_MEDIA_LIMITS={image:8*1024*1024,logo:4*1024*1024,video:80*1024*1024,audio:20*1024*1024};
async function addMediaFile(file,opts={}){
  if(!file)return;
  const kind=opts.kind||detectMediaKind(file);
  if(!kind){toast('Aina ya media haitambuliki. Tumia image, video au audio.','error');return;}
  const limitKey=opts.asLogo?'logo':(kind==='video'?'video':kind==='audio'?'audio':'image');
  const limit=SKH_MEDIA_LIMITS[limitKey];
  if(file.size&&file.size>limit){toast(`File ni kubwa kuliko kiwango (${Math.round(limit/1048576)}MB) kwa ${limitKey}.`,'error');return;}
  try{
    if(typeof window.skhUploadFromFile!=='function')throw new Error('SokoHai media uploader is unavailable.');
    toast('Uploading '+kind+'…','info');
    const uploaded=await window.skhUploadFromFile(file,{resourceType:kind==='audio'||kind==='video'?'video':'image',folder:'sokohai/creative-assets'});
    const url=uploaded&&(uploaded.url||uploaded.secure_url);
    if(!url)throw new Error('Upload failed.');
    try{ /* existing Admin Media Library pipeline (admin-only per Firestore rules; silent skip otherwise) */
      if(skh.currentUser){
        const d=uploaded.data||{};
        skh.addDoc(skh.collection(skh.db,'adminMedia'),{url,name:file.name,type:opts.asLogo?'logo':kind,mime:file.type,size:file.size,width:d.width||null,height:d.height||null,duration:d.duration||null,uploadedAt:new Date().toISOString(),uploadedBy:skh.currentUser.uid,archived:false}).catch(()=>{});
      }
    }catch(e){}
    applyAddedMedia(url,opts.asLogo?'image':kind,file.name||'Media',uploaded.data||{},opts);
  }catch(err){
    toast(err.message||'Upload failed.','error');
  }
}
function addMediaFromInput(input){const file=input.files&&input.files[0];input.value='';addMediaFile(file);}
function addLogoFromInput(input){const file=input.files&&input.files[0];input.value='';addMediaFile(file,{asLogo:true});}
function applyAddedMedia(url,kind,name,meta,opts={}){
  commit(n=>{
    let l=null;
    if(opts.asLogo)l=n.layers.find(x=>x.type==='logo');
    else if(kind==='audio')l=n.layers.find(x=>x.type==='audio');
    else l=n.layers.find(x=>x.id===selected&&(x.type===kind||((kind==='image')&&(x.type==='image'||x.type==='logo'))))||n.layers.find(x=>x.type===kind||(kind==='image'&&x.type==='logo'));
    if(!l){
      if(kind==='audio'){
        l=makeLayer('audio',{name:name||'Audio track',x:80,y:Math.round(n.canvas.height*.82),width:Math.round(n.canvas.width*.8),height:70,zIndex:Math.max(0,...n.layers.map(q=>q.zIndex))+1});
        n.layers.push(l);
      }else{
        const type=opts.asLogo?'logo':kind;
        l=makeLayer(type,{name:name||(kind==='video'?'Video layer':'Media'),
          x:opts.asLogo?Math.round(n.canvas.width*.8):Math.round(n.canvas.width*.14),
          y:opts.asLogo?Math.round(n.canvas.height*.05):Math.round(n.canvas.height*.18),
          width:opts.asLogo?Math.round(n.canvas.width*.15):Math.round(n.canvas.width*.72),
          height:opts.asLogo?Math.round(n.canvas.width*.15):Math.round(n.canvas.height*.52),
          zIndex:Math.max(0,...n.layers.map(q=>q.zIndex))+1,
          style:{fit:opts.asLogo?'contain':'cover',radius:opts.asLogo?16:22}});
        n.layers.push(l);
      }
    }
    if(kind==='video'){l.type='video';l.videoUrl=url;}
    l.src=url;
    l.originalSrc=l.originalSrc||url;
    if(name&&name!=='Media')l.name=name;
    if(meta&&meta.duration&&kind==='video'){
      l.videoMeta=l.videoMeta||{};l.videoMeta.duration=meta.duration;
      /* [NON-CANVAS MVP 2026-09-24] HARD 60s cap (spec §11/§33). Original file
         stays available (src/originalSrc) so the trim can be re-edited. */
      l.videoMeta.trimStart=0;
      /* [§9] STRICT <60: trim window max = 59s */
      l.videoMeta.trimEnd=Math.min(MAX_AD_DURATION_SECONDS,Math.max(1,Math.round(meta.duration)));
    }
    selected=l.id;
  },'Add Media');
  toast((opts.asLogo?'Logo':kind[0].toUpperCase()+kind.slice(1))+' imeongezwa kwenye canvas.');
}
function openMediaLibraryPicker(){
  if(typeof window.skhOpenAdminMediaLibrary!=='function'){toast('Media Library haipatikani bado.','error');return;}
  window.skhOpenAdminMediaLibrary('studio');
}
window.skhStudioApplyLibraryMedia=function(url,type){
  if(!url)return;
  const kind=type==='audio'?'audio':type==='video'?'video':'image';
  applyAddedMedia(url,kind,'Library media',{});
};

const SKH_CROP_RATIOS=['original','1:1','4:5','16:9','9:16','4:3','3:4','custom'];
function applyCropAspect(ratio){
  const l=currentLayer();
  if(!l||(l.type!=='image'&&l.type!=='video'&&l.type!=='logo'))return toast('Chagua media kwanza.','warning');
  commit(n=>{
    const t=n.layers.find(x=>x.id===l.id);if(!t)return;
    t.cropAspect=ratio;
    if(ratio==='original'){
      t.crop={x:0,y:0,width:100,height:100,zoom:1};
      t.style.cropX=0;t.style.cropY=0;t.style.zoom=1;t.style.fit='cover';
      return;
    }
    if(ratio==='custom')return; /* free resize on canvas = custom crop */
    const parts=ratio.split(':').map(Number);if(parts.length!==2||!parts[0]||!parts[1])return;
    const cx=t.x+t.width/2,cy=t.y+t.height/2;
    let w=t.width,h=w*parts[1]/parts[0];
    if(h>n.canvas.height*1.05){h=n.canvas.height*.9;w=h*parts[0]/parts[1];}
    t.width=Math.max(20,Math.round(w));t.height=Math.max(20,Math.round(h));
    t.x=Math.round(cx-t.width/2);t.y=Math.round(cy-t.height/2);
    t.style=t.style||{};t.style.fit='cover';
  },'Crop '+ratio);
}
function fitMediaToCanvas(mode){
  const l=currentLayer();
  if(!l||(l.type!=='image'&&l.type!=='video'&&l.type!=='logo'))return toast('Chagua media kwanza.','warning');
  commit(n=>{
    const t=n.layers.find(x=>x.id===l.id);if(!t)return;
    t.x=0;t.y=0;t.width=n.canvas.width;t.height=n.canvas.height;
    t.style=t.style||{};
    t.style.fit=mode==='contain'?'contain':mode==='fill'?'fill':'cover';
  },'Fit media '+mode);
}
function updateCtaStyle(key,val){
  commit(n=>{
    const bg=n.layers.find(x=>x.role==='cta-bg'),cta=n.layers.find(x=>x.role==='cta');
    if(key==='fill'&&bg){bg.style=bg.style||{};bg.style.fill=val;}
    if(key==='text'&&cta){cta.style=cta.style||{};cta.style.fill=val;}
  },'CTA Style');
}
function applyCtaStyle(shape){
  commit(n=>{
    const bg=n.layers.find(x=>x.role==='cta-bg');if(!bg)return;
    bg.style=bg.style||{};
    bg.style.radius=shape==='pill'?999:shape==='square'?8:22;
  },'CTA Shape');
}

/* ==== DESIGN tab — media + first-level designing (Step 2) ==== */
function designControls(){
  const media=designMediaLayer();
  if(media&&selected!==media.id&&!currentLayer())selected=media.id;
  const st=media?.style||{},f=st.filter||{};
  const isVideo=media?.type==='video',isAudioSel=currentLayer()?.type==='audio';
  const audioLayer=state.layers.find(l=>l.type==='audio');

  const addMediaBlock=`
    <div class="cs-simple-head"><span>2</span><div><h3>Design — Media & Visuals</h3><p>Pakia media, kisha crop/size/position hapa hapa.</p></div></div>
    <h4>+ Add Media</h4>
    <div class="cs-addmedia">
      <label class="cs-upload">📤 Upload from device<small style="display:block;font-weight:500;">Image · Video · GIF · SVG · Audio</small><input id="csAddMediaFile" type="file" accept="image/*,video/*,audio/*" hidden></label>
      <button class="cs-wide" data-a="openmedialibrary">🗂 Select from Media Library</button>
      <label>Media HTTPS URL<input id="csAddMediaUrl" placeholder="https://..."></label>
      <button class="cs-wide" data-a="addmediaurl">Link media URL</button>
    </div>`;

  const mediaBlock=media?`
    <h4>Selected Media — ${esc(media.name||media.type)}</h4>
    <div class="cs-two">
      <button data-media-kind="image" ${!isVideo?'class="primary"':''}>Picha</button>
      <button data-media-kind="video" ${isVideo?'class="primary"':''}>Video</button>
    </div>
    <label>Replace media URL<input data-prop="src" value="${esc(media.src||media.videoUrl||'')}" placeholder="https://..."></label>
    <div class="cs-two">
      <button data-a="removemedia">🗑 Remove media</button>
      ${isVideo?'<button data-tab="media">🎬 Playback &amp; Trim</button>':''}
    </div>

    <h4>Crop / Cut-out</h4>
    <div class="cs-crop-grid">
      ${SKH_CROP_RATIOS.map(r=>`<button data-crop-aspect="${r}" ${media.cropAspect===r?'class="primary"':''}>${r==='original'?'Original':r==='custom'?'Custom':r}</button>`).join('')}
    </div>
    <div class="cs-two">
      <label>Pan X (${st.cropX||0})<input data-prop="style.cropX" type="range" min="-1200" max="1200" step="10" value="${st.cropX||0}"></label>
      <label>Pan Y (${st.cropY||0})<input data-prop="style.cropY" type="range" min="-1200" max="1200" step="10" value="${st.cropY||0}"></label>
    </div>
    <label>Zoom / crop-in (${(st.zoom||1).toFixed(2)}×)<input data-prop="style.zoom" type="range" min="1" max="3" step="0.05" value="${st.zoom||1}"></label>

    <h4>Size &amp; Position</h4>
    <div class="cs-crop-grid">
      <button data-a="fitcanvas" data-fitmode="fit">Fit canvas</button>
      <button data-a="fitcanvas" data-fitmode="fill">Fill</button>
      <button data-a="fitcanvas" data-fitmode="contain">Contain</button>
      <button data-align="center">Center H</button>
    </div>
    <div class="cs-crop-grid">
      <button data-align="middle">Center V</button>
      <button data-align="left">Left</button>
      <button data-align="right">Right</button>
      <button data-align="top">Top</button>
    </div>
    <div class="cs-two">
      <label>Fit Mode<select data-prop="style.fit">
        <option value="cover" ${st.fit==='cover'?'selected':''}>Cover</option>
        <option value="contain" ${st.fit==='contain'?'selected':''}>Contain</option>
        <option value="fill" ${st.fit==='fill'?'selected':''}>Fill</option>
        <option value="original" ${st.fit==='original'?'selected':''}>Original</option>
      </select></label>
      <label>Focal Point<select data-prop="focalPoint">
        ${['center','top','bottom','left','right'].map(fp=>`<option value="${fp}" ${media.focalPoint===fp?'selected':''}>${fp}</option>`).join('')}
      </select></label>
    </div>
    <div class="cs-two">
      <label>Rotation (${media.rotation||0}°)<input data-prop="rotation" type="range" min="-180" max="180" value="${media.rotation||0}"></label>
      <label>Opacity (${Math.round((media.opacity??1)*100)}%)<input data-prop="opacity" type="range" min="10" max="100" value="${Math.round((media.opacity??1)*100)}"></label>
    </div>

    <h4>Appearance</h4>
    <div class="cs-two">
      <label>Border radius<input data-prop="style.radius" type="range" min="0" max="300" value="${st.radius||0}"></label>
      <label>Border width<input data-prop="style.borderWidth" type="range" min="0" max="20" value="${st.borderWidth||0}"></label>
    </div>
    <div class="cs-two">
      <label>Border color<input data-prop="style.borderColor" type="color" value="${esc(st.borderColor||'#000000')}"></label>
      <label>Overlay color<input data-prop="style.overlayColor" type="color" value="${esc(st.overlayColor||'#000000')}"></label>
    </div>
    <label>Overlay strength (${Math.round((st.overlayOpacity||0)*100)}%)<input data-prop="style.overlayOpacity" type="range" min="0" max="0.9" step="0.05" value="${st.overlayOpacity||0}"></label>
    <label>Shadow (${st.shadowOpacity||0})<input data-prop="style.shadowOpacity" type="range" min="0" max="1" step="0.05" value="${st.shadowOpacity||0}"></label>
    <h4>Frame Shape</h4>
    <div class="cs-crop-grid">
      <button data-frame="rounded">Rounded</button>
      <button data-frame="circle">Circle</button>
      <button data-frame="square">Square</button>
      <button data-frame="polaroid">Polaroid</button>
    </div>
    <div class="cs-two">
      <button data-a="flipx">↔ Flip X</button>
      <button data-a="flipy">↕ Flip Y</button>
    </div>
    <h4>Basic Filters</h4>
    <label>Brightness: ${f.brightness||100}%<input data-prop="style.filter.brightness" type="range" min="40" max="180" value="${f.brightness||100}"></label>
    <label>Contrast: ${f.contrast||100}%<input data-prop="style.filter.contrast" type="range" min="40" max="180" value="${f.contrast||100}"></label>
    <label>Saturation: ${f.saturation||100}%<input data-prop="style.filter.saturation" type="range" min="0" max="200" value="${f.saturation||100}"></label>
    <label>Warmth: ${f.temperature||0}<input data-prop="style.filter.temperature" type="range" min="-100" max="100" value="${f.temperature||0}"></label>
    <label>Blur: ${f.blur||0}px<input data-prop="style.filter.blur" type="range" min="0" max="20" value="${f.blur||0}"></label>
    ${media.type==='image'?`<div class="cs-actions-grid" style="margin-top:8px;">
      <button data-a="removebg" class="accent">🪄 Cutout / Remove BG</button>
      <button data-a="restoreimage">↺ Restore Original</button>
    </div>`:''}
  `:`
    <p class="cs-note">Hakuna media bado — tumia <b>+ Add Media</b> hapo juu. Media itaonekana moja kwa moja kwenye canvas.</p>`;

  const layersBlock=`
    <h4>Layers</h4>
    <div class="cs-layer-list cs-layer-inline">
      ${[...state.layers].sort((a,b)=>b.zIndex-a.zIndex).map(l=>`<article><button data-layer="${l.id}" ${l.id===selected?'class="primary"':''}>${l.visible===false?'○':'●'} ${esc(l.name||l.type)}</button><button data-op="up" data-id="${l.id}" title="Bring forward">↑</button><button data-op="down" data-id="${l.id}" title="Send backward">↓</button><button data-op="lock" data-id="${l.id}">${l.locked?'🔓':'🔒'}</button><button data-op="duplicate" data-id="${l.id}" title="Duplicate">⧉</button></article>`).join('')}
    </div>
    <p class="cs-simple-tip">Kuchagua layer: click jina lake au click kwenye canvas. Position/size za kina ziko kwenye paneli ya Properties (kulia).</p>`;

  const textBlock=`
    <h4>Text</h4>
    <div class="cs-addgrid">
      <button data-tstyle="Headline">Headline</button>
      <button data-tstyle="Subheadline">Subheadline</button>
      <button data-tstyle="Body">Body text</button>
      <button data-tstyle="Price">Price Tag</button>
      <button data-tstyle="Discount">Discount Pill</button>
      <button data-tstyle="Badge">Badge</button>
      <button data-tstyle="Location">Location</button>
      <button data-tstyle="Contact">Contact</button>
    </div>
    <div class="cs-theme-picks">${FONT_PAIRING_PRESETS.map(p=>`<button data-fpair="${p.name}"><b>${p.name}</b><small>${p.headline} + ${p.body}</small></button>`).join('')}</div>`;

  const logoBlock=`
    <h4>Logo</h4>
    <div class="cs-two">
      <label class="cs-upload" style="padding:10px;">📤 Upload logo<input id="csLogoFile" type="file" accept="image/*" hidden></label>
      <label>Logo HTTPS URL<input id="csLogoUrl" placeholder="https://..."></label>
    </div>
    <button class="cs-wide" data-a="applylogourl">Add / Replace logo</button>`;

  const shapesBlock=`
    <h4>Shapes &amp; Icons</h4>
    <div class="cs-addgrid">
      <button data-add="shape" data-value="rectangle">Rectangle</button>
      <button data-add="shape" data-value="rounded">Rounded Rectangle</button>
      <button data-add="shape" data-value="circle">Circle</button>
      <button data-add="shape" data-value="line">Line</button>
      <button data-add="shape" data-value="divider">Divider</button>
      <button data-add="shape" data-value="arrow">Arrow</button>
      <button data-add="shape" data-value="badge">Badge</button>
      ${['phone','location','chat','cart','delivery','clock','calendar','price','discount','verified','star'].map(i=>`<button data-add="icon" data-value="${i}">${i}</button>`).join('')}
    </div>`;

  const templatesBlock=`
    <h4>Templates &amp; Background</h4>
    <button class="cs-wide" data-tab="templates">📐 Editable Templates</button>
    ${backgroundControls()}`;

  /* [NON-CANVAS MVP 2026-09-24] Slideshow section sits right after media (§3:
     progressive disclosure — visible whenever DESIGN is open, compact). */
  const slideshowBlock=slideshowControls();

  return addMediaBlock+mediaBlock+slideshowBlock+layersBlock+textBlock+logoBlock+shapesBlock+quickStyleControls()+templatesBlock;
}

/* ==== MEDIA tab — media-itself controls (NO uploader duplication) ==== */
function mediaTabControls(){
  const mediaLayer=state.layers.find(l=>l.id===selected&&(l.type==='image'||l.type==='video'||l.type==='audio'))||state.layers.find(l=>l.type==='video')||state.layers.find(l=>l.type==='audio')||null;
  if(mediaLayer&&selected!==mediaLayer.id&&!currentLayer())selected=mediaLayer.id;
  const isVideo=mediaLayer?.type==='video';
  const vMeta=mediaLayer?.videoMeta||{};
  const audioLayer=state.layers.find(l=>l.type==='audio');

  let html=`
    <div class="cs-simple-head"><span>🎛</span><div><h3>Media Controls</h3><p>Playback, trim na mipangilio ya media yenyewe. (Upload iko DESIGN → + Add Media.)</p></div></div>`;

  if(!mediaLayer&&!audioLayer){
    html+=`<p class="cs-note">Hakuna media bado. Enda kwenye <b>DESIGN → + Add Media</b> kupakia image, video, GIF au audio.</p>`;
    return html;
  }

  if(mediaLayer){
    html+=`
    <h4>${isVideo?'🎬 Video':'🖼️ '+esc(mediaLayer.name||'Media')} ${mediaLayer.src?'':'· (bado haina source)'}</h4>
    <p style="word-break:break-all;font-size:11px;">${esc(mediaLayer.src||mediaLayer.videoUrl||'—')}</p>`;
    if(isVideo){
      const vDur=Number(vMeta.duration)||0;
      const trimEnd=Number(vMeta.trimEnd)||0;
      const trimStart=Number(vMeta.trimStart)||0;
      const effective=trimEnd>trimStart?trimEnd-trimStart:vDur;
      /* [FINAL INSTRUCTIONS §9] STRICT rule: duration < 60 → 59s max */
      const overVid=vDur>=MAX_AD_MEDIA_SECONDS;
      const overTrim=effective>=MAX_AD_MEDIA_SECONDS;
      const fmtT=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
      html+=`
    <div style="background:#0F172A; padding:8px 12px; border-radius:8px; margin-bottom:8px;">
      <span style="font-size:12px; color:${(overVid||overTrim)?'#EF4444':'#10B981'}; font-weight:700;">
        ⏱ Video: ${fmtT(vDur)} · Ad maximum: ${fmtT(MAX_AD_DURATION_SECONDS)} (&lt; 60s) · Trim: ${fmtT(Math.max(0,effective))} ${(!overVid&&!overTrim)?'✓ (duration &lt; 60s)':'⚠️ Video hii ni ndefu kuliko kiwango cha tangazo — chagua sehemu iliyo chini ya sekunde 60!'}
      </span>
      ${(overVid||overTrim)?`<div style="display:flex;gap:6px;margin-top:8px;">
        <button data-a="trimto60" class="primary">✂️ Trim to 59s (&lt;60s)</button>
        <button data-a="manualtrim">✏️ Edit manually</button>
      </div>
      <p style="margin:6px 0 0;font-size:11px;color:#94A3B8;">Video hii ni ndefu kuliko kiwango cha tangazo (${fmtT(vDur)}). Chagua sehemu iliyo chini ya sekunde 60. Original media ibaki salama — unaweza kurekebisha trim tena wakati wowote (§10).</p>`:''}
    </div>
    <div class="cs-two">
      <button data-a="togglevideo">⏯ Play / Pause preview</button>
      <button data-a="togglevideomute">🔊 Mute / Unmute</button>
    </div>
    <label>Poster / Cover Image URL<input data-prop="posterUrl" value="${esc(mediaLayer.posterUrl||'')}" placeholder="https://..."></label>
    <h4>Video Trim (Start ─ End)</h4>
    <div class="cs-two">
      <label>Start [${fmtT(trimStart)}]<input data-vmeta="trimStart" type="range" min="0" max="${MAX_AD_DURATION_SECONDS}" step="1" value="${trimStart}"></label>
      <label>End [${fmtT(trimEnd||MAX_AD_DURATION_SECONDS)}]<input data-vmeta="trimEnd" type="range" min="1" max="${MAX_AD_DURATION_SECONDS}" step="1" value="${trimEnd||MAX_AD_DURATION_SECONDS}"></label>
    </div>
    <p class="cs-simple-tip">Start/End hupanga clip ya tangazo (0 &lt; duration &lt; 60 → max ${MAX_AD_DURATION_SECONDS}s). Muda asilia wa video (${fmtT(vDur)}) haukati — ubaki kwenye originalSrc.</p>
    <div class="cs-two">
      <label><input type="checkbox" data-vmeta="autoplay" ${vMeta.autoplay!==false?'checked':''}> Autoplay</label>
      <label><input type="checkbox" data-vmeta="muted" ${vMeta.muted!==false?'checked':''}> Muted</label>
    </div>
    <div class="cs-two">
      <label><input type="checkbox" data-vmeta="loop" ${vMeta.loop!==false?'checked':''}> Loop</label>
      <label><input type="checkbox" data-vmeta="controls" ${vMeta.controls?'checked':''}> Controls</label>
    </div>
    <p class="cs-simple-tip">Media duration ni kitu tofauti na display duration (SCHEDULE). Deep timeline editing iko ADVANCED.</p>`;
    }else{
      html+=`<p class="cs-simple-tip">Crop, size, position na filters za media hii ziko kwenye <b>DESIGN</b>. Preview ya video playback iko hapo hapo kwenye canvas.</p>`;
    }
  }

  if(audioLayer){
    html+=`<h4>🎵 Audio Track</h4>`+audioControls();
  }
  return html;
}

function animationControls(){
  const target = currentLayer() || state.layers.find(l => l.role === 'headline') || state.layers.find(l => l.type === 'text') || state.layers[0];
  const anim = target?.animation || {};

  return `
    <div class="cs-simple-head"><span>✨</span><div><h3>Animation Engine</h3><p>Harakati za maneno na vitu kwenye tangazo.</p></div></div>
    
    <label>Target Layer<select id="csAnimTargetLayer">
      ${state.layers.map(l => `<option value="${l.id}" ${l.id===(target?.id)?'selected':''}>${esc(l.name||l.role||l.type)} (${esc(l.type)})</option>`).join('')}
    </select></label>

    <h4>Entrance Animation (Kuingia)</h4>
    <label>Entrance Type<select data-anim="entrance">
      ${ENTRANCE_ANIMATIONS.map(opt => `<option value="${opt}" ${anim.entrance===opt?'selected':''}>${opt.replace(/-/g,' ').toUpperCase()}</option>`).join('')}
    </select></label>

    <h4>Emphasis (Mvuto wa Kudumu)</h4>
    <label>Emphasis Type<select data-anim="emphasis">
      ${EMPHASIS_ANIMATIONS.map(opt => `<option value="${opt}" ${anim.emphasis===opt?'selected':''}>${opt.replace(/-/g,' ').toUpperCase()}</option>`).join('')}
    </select></label>

    <h4>Exit Animation (Kutoka)</h4>
    <label>Exit Type<select data-anim="exit">
      ${EXIT_ANIMATIONS.map(opt => `<option value="${opt}" ${anim.exit===opt?'selected':''}>${opt.replace(/-/g,' ').toUpperCase()}</option>`).join('')}
    </select></label>

    <h4>Word &amp; Character Splitting Mode</h4>
    <label>Animation Mode<select data-anim="mode">
      ${ANIMATION_MODES.map(m => `<option value="${m}" ${anim.mode===m?'selected':''}>${m==='whole'?'Maandishi Yote (Whole Text)':m==='word'?'Neno kwa Neno (Word by Word)':m==='character'?'Herufi kwa Herufi (Character)':m==='line'?'Mstari kwa Mstari (Line)':m}</option>`).join('')}
    </select></label>

    <h4>Timing &amp; Dynamics</h4>
    <div class="cs-two">
      <label>Duration (${anim.duration||600}ms)<input data-anim="duration" type="range" min="100" max="3000" step="100" value="${anim.duration||600}"></label>
      <label>Delay (${anim.delay||0}ms)<input data-anim="delay" type="range" min="0" max="2000" step="50" value="${anim.delay||0}"></label>
    </div>
    <div class="cs-two">
      <label>Stagger (${anim.stagger||100}ms)<input data-anim="stagger" type="range" min="20" max="400" step="20" value="${anim.stagger||100}"></label>
      <label>Easing<select data-anim="easing">
        <option value="ease-out" ${anim.easing==='ease-out'?'selected':''}>Ease Out</option>
        <option value="ease-in-out" ${anim.easing==='ease-in-out'?'selected':''}>Ease In Out</option>
        <option value="ease-in" ${anim.easing==='ease-in'?'selected':''}>Ease In</option>
        <option value="linear" ${anim.easing==='linear'?'selected':''}>Linear</option>
        <option value="cubic-bezier(0.34, 1.56, 0.64, 1)" ${anim.easing?.includes('cubic')?'selected':''}>Elastic</option>
      </select></label>
    </div>

    <div style="margin-top:14px;">
      <button data-a="replayanim" class="primary" style="width:100%;min-height:42px;font-weight:900;">▶ Play Animation Preview</button>
    </div>
  `;
}

/* ==== BASIC tab — ad presets + content information (Step 1) ==== */
function basicControls(){
  const role=r=>state.layers.find(l=>l.role===r),head=role('headline'),body=role('body'),price=role('price');
  /* [NON-CANVAS MVP 2026-09-24] Automatic composition indicator (§24) +
     overall duration Auto/Custom (§21, max 60s). */
  const comp=detectComposition(state);
  const compLabel=COMPOSITION_LABELS[comp]||comp;
  const autoDur=autoAdDuration(state);
  const isAuto=state.durationAuto!==false&&Math.abs((Number(state.duration)||0)-autoDur)<0.6;
  const dMode=state.designMode==='manual'?'manual':'auto';
  const badge=role('badge');
  return presetsControls()+`
    <div class="cs-simple-head"><span>1</span><div><h3>Content / Advertisement information</h3><p>Andika maneno; preview inabadilika papo hapo.</p></div></div>
    <div class="cs-comp-badge" title="Automatic composition (§24) + Design Mode (§18)">
      <b>Detected: ${esc(compLabel)}</b>
      <div style="display:flex;gap:12px;align-items:center;margin-top:7px;font-weight:800;color:#334E68;">
        <span style="font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;">Design Mode</span>
        <label style="display:flex;gap:4px;align-items:center;margin:0;font-weight:700;color:#486581;"><input type="radio" name="csDesignMode" data-design-mode="auto" ${dMode==='auto'?'checked':''}> Auto</label>
        <label style="display:flex;gap:4px;align-items:center;margin:0;font-weight:700;color:#486581;"><input type="radio" name="csDesignMode" data-design-mode="manual" ${dMode==='manual'?'checked':''}> Manual</label>
      </div>
      <label style="display:flex;gap:10px;align-items:center;margin-top:6px;font-weight:700;color:#486581;">
        <input type="radio" name="csDurMode" data-dur-mode="auto" ${isAuto?'checked':''}> Auto duration (${autoDur}s)
        <input type="radio" name="csDurMode" data-dur-mode="custom" ${!isAuto?'checked':''}> Custom
      </label>
      <div class="cs-two" style="margin-top:6px;">
        <label>Ad duration (${state.duration||30}s · 0 &lt; d &lt; 60 → max ${MAX_AD_DURATION_SECONDS}s)<input data-simple="duration" type="range" min="1" max="${MAX_AD_DURATION_SECONDS}" value="${state.duration||30}"></label>
      </div>
    </div>
    <label>Kichwa kikuu (Headline)<input data-simple="headline" value="${esc(head?.content||'')}" placeholder="Mfano: Ofa kubwa ya wiki"></label>
    <label>Maelezo mafupi (Description)<textarea data-simple="body" rows="3" placeholder="Eleza bidhaa au huduma">${esc(body?.content||'')}</textarea></label>
    <label>Bei / offer<input data-simple="price" value="${esc(price?.content||'')}" placeholder="TZS 59,000"></label>
    <label>Promotional badge<input data-simple="badge" value="${esc(badge?.content||'')}" placeholder="Mfano: 🔥 OFA MAALUM"></label>
    <p class="cs-simple-tip"><b>Media NI optional (§1).</b> Blank creative + Background + Headline + Description + Offer + Badge + CTA + Animation = tangazo halali. Image/Video/Audio ni nyongeza tu. CTA iko <b>CTA</b>; ratiba <b>SCHEDULE</b>.</p>`;
}

/* ==== CTA tab — call-to-action ==== */
function ctaControls(){
  const cta=state.layers.find(l=>l.role==='cta'),bg=state.layers.find(l=>l.role==='cta-bg');
  const presets=(window.SKH_CTA_PRESETS&&window.SKH_CTA_PRESETS.length)?window.SKH_CTA_PRESETS:['TAZAMA ZAIDI'];
  return `
    <div class="cs-simple-head"><span>✦</span><div><h3>CTA — Kitufe cha Kitendo</h3><p>Kitufe kinachomwambia mtumiaji achague nini.</p></div></div>
    <label>CTA text<input data-simple="cta" value="${esc(cta?.content||'TAZAMA ZAIDI')}"></label>
    <h4>Label Presets</h4>
    <div class="cs-cta-presets">${presets.map(p=>`<button data-ctapreset="${esc(p)}" ${cta?.content===p?'class="primary"':''}>${esc(p)}</button>`).join('')}</div>
    <label>CTA destination / website<input data-simple="destination" value="${esc(state.destination?.url||'')}" placeholder="https://... (si lazima kama umetoka kwenye Product/Service)"></label>
    <h4>Button Style</h4>
    <div class="cs-two">
      <label>Button color<input data-ctabg="fill" type="color" value="${esc(bg?.style?.fill||'#F4C542')}"></label>
      <label>Text color<input data-ctabg="text" type="color" value="${esc(cta?.style?.fill||'#102A43')}"></label>
    </div>
    <div class="cs-cta-presets">
      <button data-cta-style="pill">Pill</button>
      <button data-cta-style="rounded">Rounded</button>
      <button data-cta-style="square">Square</button>
    </div>
    <p class="cs-simple-tip">Rangi za CTA pia hufuata palette uliyochagua kwenye DESIGN.</p>`;
}

/* ==== SCHEDULE tab — campaign dates, priority, duration ==== */
function scheduleControls(){
  return `
    <div class="cs-simple-head"><span>🗓</span><div><h3>Schedule & Campaign</h3><p>Nani anatangazwa, lini, na kwa muda gani.</p></div></div>
    <div class="cs-two">
      <label>Advertisement category<select data-simple="category">${((window.SKH_AD_CATEGORIES&&window.SKH_AD_CATEGORIES.length?window.SKH_AD_CATEGORIES:[{id:'general',label:'General Advertisement'}]).map(cat=>`<option value="${esc(cat.id)}" ${state.category===cat.id?'selected':''}>${esc(cat.label)}</option>`).join(''))}</select></label>
      <label>Campaign name<input data-simple="campaignName" value="${esc(state.campaignName||'')}" placeholder="Mfano: Ofa ya Wiki ya Saba"></label>
    </div>
    <label>Campaign ID<input data-simple="campaignId" value="${esc(state.campaignId||'')}" placeholder="(hiari) id ya campaign"></label>
    <div class="cs-two">
      <label>Start (si lazima)<input data-simple="startAt" type="datetime-local" value="${esc(state.startAt?String(state.startAt).slice(0,16):'')}"></label>
      <label>End (si lazima)<input data-simple="endAt" type="datetime-local" value="${esc(state.endAt?String(state.endAt).slice(0,16):'')}"></label>
    </div>
    <div class="cs-two">
      <label>Priority<input data-simple="priority" type="number" min="0" max="999" value="${Number(state.priority)||0}"></label>
      <label>Display duration (5–59s)<input data-simple="displayDurationSeconds" type="number" min="5" max="59" step="1" value="${Number(state.displayDurationSeconds)||9}"></label>
    </div>
    <p class="cs-simple-tip">Display duration ni muda wa tangazo kukaa Home kwenye rotation (5–59s). <b>Sio</b> media duration — video/audio inabaki na urefu wake.</p>`;
}

function quickStyleControls(){
  const h=state.layers.find(l=>l.role==='headline'),b=state.background;
  return `
    <div class="cs-simple-head"><span>3</span><div><h3>Chagua muonekano</h3><p>Badilisha style bila kuingia kwenye controls ngumu.</p></div></div>
    <h4>Color Harmonies</h4>
    <div class="cs-theme-picks">
      <button data-palpreset="complementary"><i></i>Complementary</button>
      <button data-palpreset="analogous"><i></i>Analogous</button>
      <button data-palpreset="monochromatic"><i></i>Monochrome</button>
      <button data-palpreset="luxury"><i></i>Luxury Gold</button>
    </div>
    <h4>SokoHai Design Palettes</h4>
    <div class="cs-palette-scroll">
      ${((window.SKH_AD_PALETTE_GROUPS&&window.SKH_AD_PALETTE_GROUPS.length)?window.SKH_AD_PALETTE_GROUPS:[{id:'classics',label:'Palettes'}]).map(g=>{
        const pals=(window.SKH_AD_PALETTES?Object.values(window.SKH_AD_PALETTES):[]).filter(p=>(p.group||'classics')===g.id);
        return pals.length?`<h5 class="cs-pal-group">${esc(g.label)}</h5><div class="cs-theme-picks">${pals.map(p=>`<button data-namedpalette="${p.id}" style="--a:${p.primary};--b:${p.secondary}"><i></i>${esc(p.label)}${state.paletteId===p.id?' · ✓':''}</button>`).join('')}</div>`:'';
      }).join('')}
    </div>
    <h4>Quick Colors</h4>
    <div class="cs-quick-swatches">
      ${QUICK_COLORS.map(c=>`<button data-quickcolor="${c}" style="background:${c};" title="${c}"></button>`).join('')}
    </div>
    <label>Font ya kichwa<select data-simple="headlineWeight"><option value="600">Regular strong</option><option value="700">Bold</option><option value="800">Extra bold</option><option value="900" ${+h?.style?.fontWeight===900?'selected':''}>Advertising</option></select></label>
    <label>Ukubwa wa kichwa<input data-simple="headlineSize" type="range" min="36" max="130" value="${h?.style?.fontSize||72}"></label>
    <label>Rangi ya maandishi<input data-simple="textColor" type="color" value="${h?.style?.fill||'#FFFFFF'}"></label>
    <label>Rangi kuu<input data-simple="background" type="color" value="${b.color||'#0E7A5F'}"></label>
    <label>Rangi ya pili<input data-simple="background2" type="color" value="${b.color2||'#167A91'}"></label>
    <h4>Gradients</h4>
    <div class="cs-theme-picks">
      ${Object.keys(GRADIENT_PRESETS).slice(0,6).map(k=>`<button data-gradpreset="${k}" style="--a:${GRADIENT_PRESETS[k][0]};--b:${GRADIENT_PRESETS[k][1]}"><i></i>${k}</button>`).join('')}
    </div>`;
}

function advancedControls(){
  return `
    <h3>Advanced Editing</h3>
    <p>Zana za kina kwa editing ya kitaalamu. Basic designing yote (media, crop, text, shapes, logo, CTA) iko kwenye tab ya <b>DESIGN</b>.</p>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <button class="cs-wide" data-tab="timeline">⏱️ Deep Timeline Orchestration</button>
      <button class="cs-wide" data-a="layers">📑 Layers &amp; Grouping (deep)</button>
      <button class="cs-wide" data-a="eraser">🎭 Advanced Masking (Manual Eraser)</button>
      <button class="cs-wide" data-tab="brand">🏢 Brand Kit</button>
      <button class="cs-wide" data-a="improvedesign">✨ Smart Design Improver</button>
    </div>
    <p class="cs-note">Toolbar ya juu (advanced mode): Duplicate · Resize · Auto Design · Export. Keyframes, deep SVG na waveform editing ni features za baadaye.</p>`;
}

function backgroundControls(){
  const b=state.background;
  return `
    <h3>Background & Textures</h3>
    <label>Type<select data-bg="type"><option value="gradient" ${b.type==='gradient'?'selected':''}>Linear Gradient</option><option value="radial_gradient" ${b.type==='radial_gradient'?'selected':''}>Radial Gradient</option><option value="color" ${b.type==='color'?'selected':''}>Solid Color</option><option value="image" ${b.type==='image'?'selected':''}>Image</option></select></label>
    <div class="cs-two">
      <label>Color 1<input data-bg="color" type="color" value="${b.color||'#0E7A5F'}"></label>
      <label>Color 2<input data-bg="color2" type="color" value="${b.color2||'#167A91'}"></label>
    </div>
    <label>Angle (${b.angle||135}°)<input data-bg="angle" type="range" min="0" max="360" value="${b.angle||135}"></label>
    <h4>Preset Gradients</h4>
    <div class="cs-theme-picks">
      ${Object.keys(GRADIENT_PRESETS).map(k=>`<button data-gradpreset="${k}" style="--a:${GRADIENT_PRESETS[k][0]};--b:${GRADIENT_PRESETS[k][1]}"><i></i>${k}</button>`).join('')}
    </div>
    <h4>Patterns</h4>
    <div class="cs-addgrid">
      ${PATTERNS.map(p=>`<button data-prop="background.pattern" value="${p}">${p}</button>`).join('')}
    </div>`;
}

function brandControls(){
  const bk=state.brandKit||{};
  return `
    <h3>Brand Kit</h3>
    <label>Business / Brand Name<input data-bg="brand.name" value="${esc(bk.name||'')}"></label>
    <label>Logo URL<input data-bg="brand.logoUrl" value="${esc(bk.logoUrl||'')}"></label>
    <div class="cs-two">
      <label>Primary<input data-bg="brand.primary" type="color" value="${bk.primary||'#0E7A5F'}"></label>
      <label>Secondary<input data-bg="brand.secondary" type="color" value="${bk.secondary||'#167A91'}"></label>
    </div>
    <button class="cs-wide primary" onclick="window.saveBrandKit()">Save to Brand Kit</button>`;
}

function templateCards(){
  return `<div class="cs-templates">${templatesFor(state.format).map(t=>`<button data-template="${t.id}" style="--a:${t.preview.a};--b:${t.preview.b}"><i></i><b>${esc(t.name)}</b></button>`).join('')}</div>`;
}

function updateSimple(key,val){
  commit(n=>{
    const role=r=>n.layers.find(l=>l.role===r);
    if(key==='headline'){const h=role('headline');if(h)h.content=val;}
    else if(key==='body'){const b=role('body');if(b)b.content=val;}
    else if(key==='price'){let p=role('price');if(!p){p=makeLayer('text',{role:'price',x:80,y:n.canvas.height*.58,width:400,height:90,style:{fill:'#FFFFFF',fontSize:52,fontWeight:900}});n.layers.push(p);}p.content=val;}
    else if(key==='cta'){let c=role('cta');if(c)c.content=val;}
    else if(key==='image'){let img=n.layers.find(l=>l.type==='image');if(!img){img=makeLayer('image',{src:val,originalSrc:val,x:n.canvas.width*.45,y:n.canvas.height*.38,width:n.canvas.width*.48,height:n.canvas.height*.48,style:{fit:'cover',radius:24}});n.layers.push(img);}else{img.src=val;img.originalSrc=val;}}
    else if(key==='headlineWeight'){const h=role('headline');if(h)h.style.fontWeight=+val;}
    else if(key==='headlineSize'){const h=role('headline');if(h)h.style.fontSize=+val;}
    else if(key==='textColor'){n.layers.filter(l=>l.type==='text'&&l.role!=='cta').forEach(l=>l.style.fill=val);rememberColor(val);}
    else if(key==='background'){n.background.color=val;rememberColor(val);}
    else if(key==='background2'){n.background.color2=val;rememberColor(val);}
    else if(key==='destination'){n.destination=val?{type:'external',url:val}:null;}
    // --- Canonical advertisement state (Creator Studio upgrade) ---
    else if(key==='category'){n.category=val;}else if(key==='campaignName'){n.campaignName=val;}else if(key==='campaignId'){n.campaignId=val;}
    else if(key==='offer'){n.offer=val;let p=role('price');if(!p&&val){p=makeLayer('text',{role:'price',x:80,y:n.canvas.height*.58,width:400,height:90,style:{fill:'#FFFFFF',fontSize:52,fontWeight:900}});n.layers.push(p);}if(p&&val)p.content=val;}
    else if(key==='startAt'){n.startAt=val?new Date(val).toISOString():'';}else if(key==='endAt'){n.endAt=val?new Date(val).toISOString():'';}
    else if(key==='priority'){n.priority=Math.max(0,+val||0);}
    else if(key==='displayDurationSeconds'){n.displayDurationSeconds=Math.max(5,Math.min(59,+val||9));}
    /* [NON-CANVAS MVP 2026-09-24] overall ad duration (§21, max 60s) */
    else if(key==='duration'){
      n.durationAuto=false;
      n.duration=Math.max(1,Math.min(MAX_AD_DURATION_SECONDS,Math.round(Number(val)||30)));
    }
    /* [§1/§3] Badge = real text layer (role: badge), rendered everywhere */
    else if(key==='badge'){
      let b=n.layers.find(l=>l.role==='badge');
      if(!b&&String(val||'').trim()){
        b=makeLayer('text',{role:'badge',name:'Promo badge',content:String(val),
          x:Math.round(n.canvas.width*.055),y:Math.round(n.canvas.height*.055),
          width:Math.round(n.canvas.width*.34),height:Math.round(n.canvas.height*.055),
          zIndex:9,style:{fill:'#FFFFFF',backgroundColor:'#F59E0B',fontSize:Math.max(16,Math.round(n.canvas.width*.022)),fontWeight:900,padding:10,radius:999,textAlign:'center'}});
        n.layers.push(b);
      }else if(b)b.content=String(val||'');
    }
  });
}

/* [NON-CANVAS MVP 2026-09-24] Auto/Manual duration mode (§25). */
function setDurationMode(mode){
  commit(n=>{
    if(mode==='auto'){n.durationAuto=true;n.duration=Math.max(1,Math.min(MAX_AD_DURATION_SECONDS,Math.round(autoAdDuration(n)||n.duration)));}
    else n.durationAuto=false;
  },'Duration mode '+mode);
}
/* [§18] Design Mode: Auto = system suggests composition/timing; Manual = user
   chooses everything. Automation is NEVER mandatory. */
function setDesignMode(mode){
  commit(n=>{n.designMode=mode==='manual'?'manual':'auto';},'Design Mode '+mode);
  renderLibrary();
  toast(mode==='manual'?'Manual mode — kila kitu utachagua mwenyewe.':'Auto mode — composition/timing suggestion imewashwa.','info');
}

function applyQuickTheme(t){
  commit(n=>{
    const bg=n.background;
    if(t==='clean'){bg.color='#FFFFFF';bg.color2='#F1F5F9';n.layers.filter(l=>l.type==='text').forEach(l=>l.style.fill='#0F172A');}
    else if(t==='bold'){bg.color='#111827';bg.color2='#F97316';n.layers.filter(l=>l.type==='text'&&l.role!=='cta').forEach(l=>l.style.fill='#FFFFFF');}
    else if(t==='elegant'){bg.color='#2E1F2B';bg.color2='#D4AF37';n.layers.filter(l=>l.type==='text'&&l.role!=='cta').forEach(l=>l.style.fill='#FFF7ED');}
    else if(t==='sale'){bg.color='#7F1D1D';bg.color2='#FBBF24';n.layers.filter(l=>l.type==='text'&&l.role!=='cta').forEach(l=>l.style.fill='#FFFFFF');}
  });
}

function applyQuickColor(hex){
  rememberColor(hex);
  const l=currentLayer();
  if(l){
    commit(n=>{
      const target=n.layers.find(x=>x.id===l.id);
      if(target){
        if(target.type==='text')target.style.fill=hex;
        else if(target.type==='shape')target.style.fill=hex;
        else if(target.type==='icon')target.style.fill=hex;
      }
    });
  }else{
    commit(n=>{n.background.color=hex;});
  }
}

function applyPalettePreset(harmony){
  const pal=generatePalette(state.background.color||'#0E7A5F',harmony);
  commit(n=>{
    n.background.color=pal.primary;
    n.background.color2=pal.secondary;
    n.layers.filter(l=>l.type==='text'&&l.role!=='cta').forEach(l=>l.style.fill=pal.text);
    n.layers.filter(l=>l.role==='cta-bg').forEach(l=>l.style.fill=pal.cta);
  });
  toast(`Applied ${harmony} palette.`);
}

/* Named SokoHai Design Palettes — canonical tokens (js/app/creative/ad-palettes.js).
   Selecting a palette updates the canvas immediately and stores paletteId so the
   saved/published creative re-uses the same token set in the Home renderer. */
function applyNamedPalette(id){
  const tok=(typeof window.skhPaletteTokens==='function')?window.skhPaletteTokens(id):null;
  if(!tok){toast('Palette tokens hazijapakiwa bado.','error');return;}
  commit(n=>{
    n.paletteId=tok.id;
    n.background.color=tok.primary;
    n.background.color2=tok.secondary;
    n.layers.filter(l=>l.type==='text'&&l.role!=='cta').forEach(l=>l.style.fill=tok.headline);
    n.layers.filter(l=>l.role==='cta-bg').forEach(l=>l.style.fill=tok.ctaBackground);
    n.layers.filter(l=>l.role==='cta').forEach(l=>l.style.fill=tok.ctaText);
    if(n.brandKit)n.brandKit={...n.brandKit,primary:tok.primary,secondary:tok.secondary,accent:tok.accent};
  },'Named Palette '+tok.id);
  try{
    const rT=contrastRatio(tok.headline,tok.primary),rC=contrastRatio(tok.ctaText,tok.ctaBackground);
    toast('Palette: '+tok.label+' · kichwa '+rT.toFixed(1)+':1 · CTA '+rC.toFixed(1)+':1');
  }catch(e){toast('Palette applied: '+tok.label);}
}

function applyGradientPreset(key){
  const g=GRADIENT_PRESETS[key];if(!g)return;
  commit(n=>{n.background.type='gradient';n.background.color=g[0];n.background.color2=g[1];});
}

function applyFontPairing(name){
  const p=FONT_PAIRING_PRESETS.find(x=>x.name===name);if(!p)return;
  commit(n=>{
    n.layers.forEach(l=>{
      if(l.role==='headline')l.style.fontFamily=p.headline;
      else if(l.type==='text')l.style.fontFamily=p.body;
    });
  });
  toast(`Font pair '${name}' applied.`);
}

function applyTextStyle(styleKey){
  const s=TEXT_STYLE_PRESETS[styleKey];if(!s)return;
  const l=currentLayer();
  if(l&&l.type==='text'){
    commit(n=>{
      const target=n.layers.find(x=>x.id===l.id);
      if(target){
        target.style={...target.style,...s};
        if(s.fill)target.style.fill=s.fill;
        if(s.backgroundColor)target.style.backgroundColor=s.backgroundColor;
      }
    });
  }else{
    addLayer('text',styleKey.toLowerCase());
  }
}

function applyFrameShape(frame){
  const l=currentLayer();
  if(!l||l.type!=='image')return;
  commit(n=>{
    const target=n.layers.find(x=>x.id===l.id);
    if(target)target.style.frameShape=frame;
  });
}

function applyAlignment(type){
  if(!selected)return;
  commit(n=>{
    const target=n.layers.find(x=>x.id===selected);
    if(!target)return;
    const aligned=alignLayers([target],type,n.canvas.width,n.canvas.height);
    if(aligned[0]){target.x=aligned[0].x;target.y=aligned[0].y;}
  });
}

/* [NON-CANVAS MVP 2026-09-24] 9-grid text position presets (spec §8). */
const NC_POS_GRID={
  'top-left':[0,0],'top-center':[.5,0],'top-right':[1,0],
  'center-left':[0,.5],'center':[.5,.5],'center-right':[1,.5],
  'bottom-left':[0,1],'bottom-center':[.5,1],'bottom-right':[1,1]
};
function applyTextPositionPreset(key){
  const g=NC_POS_GRID[key];if(!g)return;
  const l=currentLayer();if(!l||l.type!=='text')return toast('Chagua text layer kwanza.','warning');
  commit(n=>{
    const t=n.layers.find(x=>x.id===l.id);if(!t)return;
    const m=Math.round(n.canvas.safe/2)||40;
    const fx=g[0],fy=g[1];
    t.x=Math.round(fx===0?m:fx===1?(n.canvas.width-t.width-m):(n.canvas.width-t.width)/2);
    t.y=Math.round(fy===0?m:fy===1?(n.canvas.height-t.height-m):(n.canvas.height-t.height)/2);
    t.style=Object.assign({},t.style,{pos9:key});
    if(fx===.5)t.style.textAlign='center';
    else if(fx===1)t.style.textAlign='right';
    else t.style.textAlign='left';
  },'Position '+key);
}

/* ==== [NON-CANVAS MVP 2026-09-24] SLIDESHOW CONTROLS (spec §4/§15/§16) ==== */
function slideshowControls(){
  const ss=state.slideshow||{enabled:false,transition:'fade',defaultDuration:3,slides:[]};
  const slides=Array.isArray(ss.slides)?ss.slides:[];
  const total=slides.reduce((t,s)=>t+(Number(s.duration)||Number(ss.defaultDuration)||3),0);
  const images=state.layers.filter(l=>l.type==='image'&&l.src);
  return `
    <div class="cs-simple-head"><span>🖼</span><div><h3>Slideshow / Carousel</h3><p>Slides 1–${slides.length||'n'} · jumla ${Math.round(total)}s · transition: ${esc(ss.transition||'fade')}</p></div></div>
    <label class="cs-two" style="align-items:center;">
      <span>Slideshow mode ${ss.enabled?'✓ ON':'OFF'}</span>
      <button data-ss-act="toggle" class="${ss.enabled?'primary':''}">${ss.enabled?'Disable':'Enable slideshow'}</button>
    </label>
    <h4>Add slides</h4>
    <div class="cs-addmedia">
      <label class="cs-upload">📤 Upload image slide(s)<small style="display:block;font-weight:500;">1 / 2 / 3 / 4+ picha — MULTIPLE selection inaruhusiwa</small><input id="csSlideFiles" type="file" accept="image/*" multiple hidden></label>
      <button class="cs-wide" data-a="openmedialibrary">🗂 Select from Media Library</button>
      <label>Image HTTPS URL<input id="csSlideUrl" placeholder="https://..."></label>
      <button class="cs-wide" data-ss-act="addurl">+ Add slide from URL</button>
    </div>
    ${slides.length?`
    <h4>Slides (${slides.length})</h4>
    <div class="cs-ss-list">
      ${slides.map((s,i)=>`
        <div class="cs-ss-row">
          <b>#${i+1}</b>
          <span class="cs-ss-src" title="${esc(s.src)}">${esc(s.name||String(s.src).split('/').pop()||'slide')}</span>
          <label class="cs-ss-dur">${Number(s.duration)||ss.defaultDuration||3}s
            <input data-ss-dur="${i}" type="range" min="1" max="30" value="${Number(s.duration)||ss.defaultDuration||3}">
          </label>
          <button data-ss-act="up" data-ss-idx="${i}" ${i===0?'disabled':''} title="Move up">↑</button>
          <button data-ss-act="down" data-ss-idx="${i}" ${i===slides.length-1?'disabled':''} title="Move down">↓</button>
          <button data-ss-act="remove" data-ss-idx="${i}" title="Remove">🗑</button>
        </div>`).join('')}
    </div>
    <div class="cs-two">
      <label>Default slide duration (${ss.defaultDuration||3}s)<input data-ss-default-dur type="range" min="1" max="15" value="${ss.defaultDuration||3}"></label>
      <label>Transition<select data-ss-transition>
        ${SLIDESHOW_TRANSITIONS.map(t=>`<option value="${t}" ${ss.transition===t?'selected':''}>${t[0].toUpperCase()+t.slice(1)}</option>`).join('')}
      </select></label>
    </div>
    <p class="cs-simple-tip">Jumla ya slideshow: <b>${Math.round(total)}s</b> (0 &lt; jumla &lt; 60 → max ${MAX_AD_DURATION_SECONDS}s). Audio ikiwepo inaendelea cross-slide.</p>
    `:`<p class="cs-note">Ongeza picha 2+ hapo juu kisha bofya <b>Enable slideshow</b>. Kila slide ina muda wake; jumla hujitokeza hapo chini.</p>`}
    ${images.length&&!slides.length?`<p class="cs-simple-tip">Picha ${images.length} zilizo kwenye canvas zipo kama media ya kawaida. Slideshow ni tofauti — pakia/ongeza slides kwenye list hii.</p>`:''}
  `;
}

async function addSlidesFromInput(input){
  const files=[...(input.files||[])];input.value='';
  if(!files.length)return;
  for(const file of files){
    if(!/image\//.test(file.type||'')){toast('Slideshow inapokea picha tu (JPG/PNG/WEBP/GIF/SVG).','warning');continue;}
    if(typeof window.skhUploadFromFile!=='function'){toast('Uploader haipatikani.','error');return;}
    try{
      toast('Uploading slide…','info');
      const up=await window.skhUploadFromFile(file,{resourceType:'image',folder:'sokohai/creative-assets'});
      const url=up&&(up.url||up.secure_url);
      if(!url)throw new Error('Upload failed');
      commit(n=>{
        n.slideshow=n.slideshow||{enabled:false,transition:'fade',defaultDuration:3,slides:[]};
        n.slideshow.slides=n.slideshow.slides||[];
        n.slideshow.slides.push({src:url,duration:Number(n.slideshow.defaultDuration)||3,name:file.name||'slide'});
        /* [§18] Auto mode suggests enabling; Manual waits for explicit Enable. */
        if(n.designMode!=='manual')n.slideshow.enabled=n.slideshow.slides.filter(s=>s&&s.src).length>=2;
      },'Add slideshow slide');
    }catch(err){toast(err.message||'Slide upload failed.','error');}
  }
  activeTab='design';renderLibrary();
  toast('Slides added.');
}

function slideshowAction(act,idx){
  if(act==='toggle'){
    commit(n=>{
      n.slideshow=n.slideshow||{enabled:false,transition:'fade',defaultDuration:3,slides:[]};
      const count=(n.slideshow.slides||[]).filter(s=>s&&s.src).length;
      if(!n.slideshow.enabled&&count<2){toast('Ongeza picha angalau 2 kwanza.','warning');return;}
      n.slideshow.enabled=!n.slideshow.enabled;
      if(n.slideshow.enabled&&count>=2){
        /* Auto duration when slideshow just enabled (§21 Auto) */
        n.duration=Math.min(MAX_AD_DURATION_SECONDS,Math.max(3,Math.round(slideshowTotal(n)||12)));
        n.preset='slideshow';
      }
    },'Toggle slideshow');
    renderLibrary();render();return;
  }
  if(act==='addurl'){
    const url=($('#csSlideUrl')?.value||'').trim();
    if(!/^https:\/\//i.test(url))return toast('Weka HTTPS image URL halali.','error');
    commit(n=>{
      n.slideshow=n.slideshow||{enabled:false,transition:'fade',defaultDuration:3,slides:[]};
      n.slideshow.slides=n.slideshow.slides||[];
      n.slideshow.slides.push({src:url,duration:Number(n.slideshow.defaultDuration)||3,name:url.split('/').pop().slice(0,40)||'slide'});
      if(n.designMode!=='manual')n.slideshow.enabled=n.slideshow.slides.filter(s=>s&&s.src).length>=2;
    },'Add slide URL');
    const inp=$('#csSlideUrl');if(inp)inp.value='';
    renderLibrary();render();return;
  }
  commit(n=>{
    const ss=n.slideshow;if(!ss||!Array.isArray(ss.slides))return;
    const slides=ss.slides;
    if(act==='remove')slides.splice(idx,1);
    else if(act==='up'&&idx>0)[slides[idx-1],slides[idx]]=[slides[idx],slides[idx-1]];
    else if(act==='down'&&idx<slides.length-1)[slides[idx+1],slides[idx]]=[slides[idx],slides[idx+1]];
    ss.enabled=slides.filter(s=>s&&s.src).length>=2&&ss.enabled;
    if(ss.enabled)n.duration=Math.min(MAX_AD_DURATION_SECONDS,Math.max(3,Math.round(slideshowTotal(n)||n.duration)));
  },'Slideshow '+act);
  renderLibrary();render();
}
function updateSlideshowProp(key,el){
  const val=el.type==='range'?Number(el.value):el.value;
  commit(n=>{
    n.slideshow=n.slideshow||{enabled:false,transition:'fade',defaultDuration:3,slides:[]};
    if(key==='transition')n.slideshow.transition=val;
    else if(key==='defaultDuration')n.slideshow.defaultDuration=Math.min(15,Math.max(1,Number(val)||3));
    else if(key==='slideDur'){
      const i=Number(el.dataset.ssDur);
      if(n.slideshow.slides[i])n.slideshow.slides[i].duration=Math.min(30,Math.max(1,Number(val)||3));
    }
    if(n.slideshow.enabled)n.duration=Math.min(MAX_AD_DURATION_SECONDS,Math.max(3,Math.round(slideshowTotal(n)||n.duration)));
  },'Slideshow setting');
}

async function doRemoveBackground(){
  const img=state.layers.find(l=>l.type==='image'||l.id===selected);
  if(!img||!img.src)return toast('Select an image to remove its background.','error');
  toast('Processing background removal…','info');
  try{
    const cutoutUrl=await removeBackgroundClient(img.src);
    commit(n=>{
      const target=n.layers.find(x=>x.id===img.id);
      if(target){
        target.cutoutDataUrl=cutoutUrl;
        target.originalSrc=target.originalSrc||target.src;
      }
    });
    toast('Background removed cleanly.');
  }catch(err){
    toast('Background removal requires direct CORS image access: '+err.message,'warning');
  }
}

function doRestoreImage(){
  const img=state.layers.find(l=>l.type==='image'||l.id===selected);
  if(!img)return;
  commit(n=>{
    const target=n.layers.find(x=>x.id===img.id);
    if(target){
      target.cutoutDataUrl='';
      if(target.originalSrc)target.src=target.originalSrc;
    }
  });
  toast('Original image restored.');
}

function showEraserModal(){
  const img=state.layers.find(l=>l.type==='image'||l.id===selected);
  if(!img)return toast('Select an image to erase parts.','error');
  const s=sheet(`
    <h2>🧽 Manual Brush Eraser</h2>
    <p>Brush over parts of the image to erase them manually.</p>
    <div style="display:flex;gap:12px;margin-bottom:10px;align-items:center;">
      <label style="flex:1;">Brush size: <input id="csBrushSize" type="range" min="5" max="80" value="30"></label>
      <button id="csEraserMode" class="primary">Mode: Erase</button>
    </div>
    <div style="background:#eef2f6;border-radius:12px;padding:12px;display:grid;place-items:center;overflow:auto;max-height:50vh;">
      <canvas id="csEraserCanvas" style="max-width:100%;border:1px solid #d7e0e8;border-radius:8px;cursor:crosshair;background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%);background-size:16px 16px;"></canvas>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="csApplyEraser" class="primary" style="flex:1;">Keep Cutout</button>
      <button id="csCancelEraser" style="flex:1;">Cancel</button>
    </div>
  `);

  const cv=$('#csEraserCanvas',s),ctx=cv.getContext('2d');
  const imageObj=new Image();
  imageObj.crossOrigin='anonymous';
  imageObj.onload=()=>{
    cv.width=imageObj.naturalWidth||imageObj.width;
    cv.height=imageObj.naturalHeight||imageObj.height;
    ctx.drawImage(imageObj,0,0);
  };
  imageObj.src=img.cutoutDataUrl||img.src;

  let isPainting=false;
  cv.onpointerdown=(e)=>{isPainting=true;eraseAt(e);cv.setPointerCapture?.(e.pointerId);};
  cv.onpointermove=(e)=>{if(isPainting)eraseAt(e);};
  cv.onpointerup=()=>{isPainting=false;};

  function eraseAt(e){
    const rect=cv.getBoundingClientRect();
    const scaleX=cv.width/rect.width,scaleY=cv.height/rect.height;
    const x=(e.clientX-rect.left)*scaleX,y=(e.clientY-rect.top)*scaleY;
    const r=+$('#csBrushSize',s).value;
    ctx.save();
    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  $('#csApplyEraser',s).onclick=()=>{
    const resUrl=cv.toDataURL('image/png');
    commit(n=>{
      const target=n.layers.find(x=>x.id===img.id);
      if(target){
        target.cutoutDataUrl=resUrl;
        target.originalSrc=target.originalSrc||target.src;
      }
    });
    s.hidden=true;
    toast('Custom eraser applied.');
  };
  $('#csCancelEraser',s).onclick=()=>s.hidden=true;
}

function showImproveDesign(){
  const s=sheet(`
    <h2>✨ Smart Design Improver</h2>
    <p>The system analyzed your creative and generated balanced layout optimizations.</p>
    <div class="cs-theme-picks">
      <button id="csOptContrast"><i></i>Optimize Contrast & Readability</button>
      <button id="csOptCTA"><i></i>Position High-Impact CTA</button>
      <button id="csOptCenter"><i></i>Center Align All Elements</button>
      <button id="csOptHierarchy"><i></i>Scale Headline & Price</button>
    </div>
    <div style="margin-top:16px;">
      <button onclick="document.getElementById('csSheet').hidden=true" class="cs-wide">Done</button>
    </div>
  `);

  $('#csOptContrast',s).onclick=()=>{
    commit(n=>{
      n.background.color='#0E7A5F';
      n.background.color2='#102A43';
      n.layers.filter(l=>l.type==='text'&&l.role!=='cta').forEach(l=>l.style.fill='#FFFFFF');
    });
    toast('Contrast & colors optimized.');
  };
  $('#csOptCTA',s).onclick=()=>{
    commit(n=>{
      const cta=n.layers.find(l=>l.role==='cta'||l.role==='cta-bg');
      if(cta){cta.x=n.canvas.width*.15;cta.y=n.canvas.height*.78;cta.width=n.canvas.width*.7;}
    });
    toast('CTA prominence enhanced.');
  };
  $('#csOptCenter',s).onclick=()=>{
    commit(n=>{
      n.layers.forEach(l=>{l.x=(n.canvas.width-l.width)/2;if(l.type==='text')l.style.textAlign='center';});
    });
    toast('Design centered.');
  };
  $('#csOptHierarchy',s).onclick=()=>{
    commit(n=>{
      const h=n.layers.find(l=>l.role==='headline');if(h){h.style.fontSize=80;h.style.fontWeight=900;}
      const p=n.layers.find(l=>l.role==='price');if(p){p.style.fontSize=60;p.style.fontWeight=900;}
    });
    toast('Visual hierarchy scaled.');
  };
}

function addLayer(type,value){
  const z=Math.max(0,...state.layers.map(l=>l.zIndex))+1;
  if(type==='duplicate-layer'){
    const l=currentLayer();if(!l)return;
    commit(n=>{
      const src=n.layers.find(x=>x.id===l.id);if(!src)return;
      const copy=JSON.parse(JSON.stringify(src));
      copy.id='ly_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
      copy.x=(copy.x||0)+24;copy.y=(copy.y||0)+24;copy.zIndex=Math.max(0,...n.layers.map(q=>q.zIndex))+1;
      copy.name=(copy.name||'Layer')+' copy';
      n.layers.push(copy);selected=copy.id;
    },'Duplicate Layer');
    return;
  }
  if(type==='delete-layer'){
    const l=currentLayer();if(!l)return;
    commit(n=>n.layers=n.layers.filter(x=>x.id!==l.id));
    selected='';render();return;
  }
  if(type==='text'){
    const content=value==='headline'?'YOUR HEADLINE':value==='price'?'TZS 0':value==='cta'?'TAZAMA ZAIDI':value==='subheadline'?'Subheadline':'Add your message';
    const fs=value==='headline'?72:value==='price'?64:value==='cta'?36:42;
    commit(n=>{
      const l=makeLayer('text',{content,role:value,x:100,y:150,width:700,height:150,zIndex:z,style:{fontSize:fs,fontWeight:value==='headline'||value==='price'?900:600,fill:'#FFFFFF'}});
      n.layers.push(l);selected=l.id;
    });
  }else if(type==='shape'){
    commit(n=>{
      /* [§14] rounded = real rounded-rect layer; divider = real thin line layer */
      const shape=(value==='rounded'||value==='divider')?'rectangle':value;
      const h=value==='line'||value==='arrow'||value==='divider'?(value==='divider'?6:50):260;
      const l=makeLayer('shape',{shape,x:180,y:220,width:420,height:h,zIndex:z,
        style:{fill:value==='divider'?'#FFFFFF':'#F4C542',radius:value==='rounded'?48:(value==='badge'?999:24),
               opacity:value==='divider'?.6:1}});
      l.name=value==='rounded'?'Rounded rectangle':value==='divider'?'Divider':(value[0].toUpperCase()+value.slice(1));
      n.layers.push(l);selected=l.id;
    });
  }else if(type==='icon'){
    commit(n=>{
      const l=makeLayer('icon',{icon:value,x:180,y:220,width:110,height:110,zIndex:z,style:{fill:'#FFFFFF',backgroundColor:'#0E7A5F'}});
      n.layers.push(l);selected=l.id;
    });
  }
}

function setMediaKind(kind){
  commit(n=>{
    let l=n.layers.find(x=>x.id===selected&&(x.type==='image'||x.type==='video'))||n.layers.find(x=>x.type==='image'||x.type==='video');
    if(!l){
      l=makeLayer(kind,{name:kind==='video'?'Video layer':'Image layer',x:n.canvas.width*.2,y:n.canvas.height*.2,width:n.canvas.width*.6,height:n.canvas.height*.5});
      n.layers.push(l);
    }else{
      l.type=kind;
      l.name=kind==='video'?'Video layer':'Image layer';
    }
    selected=l.id;
  },'Set Media Kind');
}

function updateAnim(key,el){
  const targetId=$('#csAnimTargetLayer')?.value||selected||state.layers.find(l=>l.role==='headline')?.id||state.layers[0]?.id;
  const val=el.type==='range'?+el.value:el.value;
  commit(n=>{
    const l=n.layers.find(x=>x.id===targetId);
    if(l){
      l.animation=l.animation||{};
      l.animation[key]=val;
      l.animation.enabled=(l.animation.entrance&&l.animation.entrance!=='none')||(l.animation.emphasis&&l.animation.emphasis!=='none');
    }
  },'Update Animation');
}

function updateVmeta(key,el){
  const val=el.type==='checkbox'?el.checked:el.value;
  commit(n=>{
    const l=n.layers.find(x=>x.id===selected&&x.type==='video')||n.layers.find(x=>x.type==='video');
    if(l){
      l.videoMeta=l.videoMeta||{};
      /* [NON-CANVAS MVP 2026-09-24] trim values are numeric seconds clamped to
         the 0..60s ad window; original duration/src untouched (spec §11). */
      if(key==='trimStart'||key==='trimEnd'){
        /* [§9] STRICT <60 → trim window bounded to 59s */
        let s=Math.max(0,Math.min(MAX_AD_DURATION_SECONDS,Number(val)||0));
        const other=key==='trimStart'?Number(l.videoMeta.trimEnd)||MAX_AD_DURATION_SECONDS:Number(l.videoMeta.trimStart)||0;
        if(key==='trimEnd'&&s<=other)s=Math.min(MAX_AD_DURATION_SECONDS,other+1);
        if(key==='trimStart'&&s>=other)s=Math.max(0,other-1);
        l.videoMeta[key]=s;
      }else{
        l.videoMeta[key]=val;
      }
    }
  },'Update Video Meta');
}

/* Legacy entries (content/media tab file inputs) — delegated to the unified
   Add Media pipeline so there is ONE upload mechanism. */
async function uploadMedia(input){
  const file=input.files?.[0];if(!file)return;
  input.value='';await addMediaFile(file);
}

function renderProperties(){
  const box=$('#csProperties');if(!box)return;
  const l=currentLayer();
  if(!l){
    box.innerHTML='<div class="cs-empty"><b>Select an element</b><p>Click a layer on the canvas or choose from Layers tab.</p></div>';
    return;
  }
  const st=l.style||{};
  const f=st.filter||{};
  const anim=l.animation||{};

  let specificControls='';

  if(l.type==='text'){
    /* [NON-CANVAS MVP 2026-09-24] Full text toolset (spec §7/§8). Every control
       writes to the SAME layer state → SAME renderer → saved → published. */
    const tPos=[['top-left',0,0],['top-center',.5,0],['top-right',1,0],['center-left',0,.5],['center',.5,.5],['center-right',1,.5],['bottom-left',0,1],['bottom-center',.5,1],['bottom-right',1,1]];
    const colorPresets=[['White','#FFFFFF'],['Black','#000000'],['Blue','#3B82F6'],['Green','#10B981'],['Gold','#F4C542']];
    specificControls=`
      <label>Text Content<textarea data-prop="content" rows="3">${esc(l.content)}</textarea></label>
      <label>Font Family<select data-prop="style.fontFamily">${VERIFIED_FONTS.map(f=>`<option value="${f.family}" ${f.family===st.fontFamily?'selected':''}>${f.family}</option>`).join('')}</select></label>
      <div class="cs-two">
        <label>Font Weight<select data-prop="style.fontWeight">
          <option value="400" ${+st.fontWeight===400?'selected':''}>400 Normal</option>
          <option value="600" ${+st.fontWeight===600?'selected':''}>600 SemiBold</option>
          <option value="700" ${+st.fontWeight===700?'selected':''}>700 Bold</option>
          <option value="800" ${+st.fontWeight===800?'selected':''}>800 ExtraBold</option>
          <option value="900" ${+st.fontWeight===900?'selected':''}>900 Black</option>
          <option value="950" ${+st.fontWeight===950?'selected':''}>950 Ultra</option>
        </select></label>
        <label>Text Align<select data-prop="style.textAlign">
          <option value="left" ${st.textAlign==='left'?'selected':''}>Left</option>
          <option value="center" ${st.textAlign==='center'?'selected':''}>Center</option>
          <option value="right" ${st.textAlign==='right'?'selected':''}>Right</option>
        </select></label>
      </div>
      <div class="cs-two">
        <label>Font Size (${st.fontSize||48})<input data-prop="style.fontSize" type="range" min="14" max="220" value="${st.fontSize||48}"></label>
        <label>Text Color<input data-prop="style.fill" type="color" value="${st.fill||'#FFFFFF'}"></label>
      </div>
      <div class="cs-quick-swatches" title="Quick text colors">
        ${colorPresets.map(([nm,hex])=>`<button data-quickcolor="${hex}" style="background:${hex};" title="${nm} ${hex}"></button>`).join('')}
        <button style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);border-radius:50%;" data-a="focuscustomcolor" title="Custom color"></button>
      </div>
      <div class="cs-two">
        <label>Style
          <span class="cs-two" style="gap:4px;">
            <button data-prop="style.fontStyle" value="${st.fontStyle==='italic'?'normal':'italic'}" class="${st.fontStyle==='italic'?'primary':''}" title="Italic"><i>I</i> Italic</button>
            <button data-prop="style.textDecoration" value="${st.textDecoration==='underline'?'none':'underline'}" class="${st.textDecoration==='underline'?'primary':''}" title="Underline"><u>U</u> Under</button>
          </span>
        </label>
        <label>Text Opacity (${Math.round((l.opacity??1)*100)}%)<input data-prop="opacity" type="range" min="10" max="100" value="${Math.round((l.opacity??1)*100)}"></label>
      </div>
      <div class="cs-two">
        <label>Letter Spacing (${st.letterSpacing||0})<input data-prop="style.letterSpacing" type="range" min="-5" max="20" step="0.5" value="${st.letterSpacing||0}"></label>
        <label>Line Height (${st.lineHeight||1.1})<input data-prop="style.lineHeight" type="range" min="0.8" max="2.2" step="0.05" value="${st.lineHeight||1.1}"></label>
      </div>
      <h4>Text Background / Outline / Shadow</h4>
      <div class="cs-two">
        <label>Text background<input data-prop="style.backgroundColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(st.backgroundColor||'')?st.backgroundColor:'#0E7A5F'}"></label>
        <label><button data-prop="style.backgroundColor" value="transparent" class="cs-wide">Clear background</button></label>
      </div>
      <div class="cs-two">
        <label>Outline color<input data-prop="style.stroke" type="color" value="${/^#[0-9a-f]{6}$/i.test(st.stroke||'')?st.stroke:'#000000'}"></label>
        <label>Outline width (${st.strokeWidth||0})<input data-prop="style.strokeWidth" type="range" min="0" max="8" step="0.5" value="${st.strokeWidth||0}"></label>
      </div>
      <div class="cs-two">
        <label>Shadow color<input data-prop="style.shadowColor" type="color" value="${st.shadowColor||'#000000'}"></label>
        <label>Shadow strength (${st.shadowOpacity||0})<input data-prop="style.shadowOpacity" type="range" min="0" max="1" step="0.05" value="${st.shadowOpacity||0}"></label>
      </div>
      <label>Shadow blur (${st.shadowBlur||12}px)<input data-prop="style.shadowBlur" type="range" min="0" max="40" value="${st.shadowBlur||12}"></label>
      <div class="cs-two">
        <label>Glow color<input data-prop="style.glowColor" type="color" value="${st.glowColor||'#18A982'}"></label>
        <label>Glow strength (${st.glowBlur||0})<input data-prop="style.glowBlur" type="range" min="0" max="30" value="${st.glowBlur||0}"></label>
      </div>
      <h4>Position Preset (9-Grid) + Box</h4>
      <div class="cs-grid9">
        ${tPos.map(([k,fx,fy])=>`<button data-nc-pos="${k}" title="${k}" class="${st.pos9===k?'primary':''}">${k.replace('center','·').replace(/-/g,' ').trim()}</button>`).join('')}
      </div>
      <div class="cs-two">
        <label>Width (${Math.round(l.width)})<input data-prop="width" type="range" min="60" max="${state.canvas.width}" value="${Math.round(l.width)}"></label>
        <label>Max lines (${st.maxLines||'auto'})<input data-prop="style.maxLines" type="number" min="1" max="16" placeholder="auto" value="${st.maxLines||''}"></label>
      </div>
      <p class="cs-simple-tip">X/Y/Rotation ziko juu kwenyeProperties. Mabadiliko yote yanaonekana papo hapo kwenye canvas, kwenye Preview, na kwenye tangazo lililochapishwa.</p>

      <h4>Animation Settings</h4>
      <div class="cs-two">
        <label>Entrance<select data-anim="entrance">
          ${ENTRANCE_ANIMATIONS.map(opt=>`<option value="${opt}" ${anim.entrance===opt?'selected':''}>${opt}</option>`).join('')}
        </select></label>
        <label>Emphasis<select data-anim="emphasis">
          ${EMPHASIS_ANIMATIONS.map(opt=>`<option value="${opt}" ${anim.emphasis===opt?'selected':''}>${opt}</option>`).join('')}
        </select></label>
      </div>
      <div class="cs-two">
        <label>Mode<select data-anim="mode">
          ${ANIMATION_MODES.map(m=>`<option value="${m}" ${anim.mode===m?'selected':''}>${m}</option>`).join('')}
        </select></label>
        <label>Duration (${anim.duration||600}ms)<input data-anim="duration" type="range" min="200" max="3000" step="100" value="${anim.duration||600}"></label>
      </div>
      <div class="cs-two">
        <label>Delay / Start (${anim.delay||0}ms)<input data-anim="delay" type="range" min="0" max="5000" step="100" value="${anim.delay||0}"></label>
        <label>End: ${(((anim.delay||0)+(anim.duration||600))/1000).toFixed(1)}s</label>
        <label><button data-a="replayanim" class="primary cs-wide">▶ Play Animation</button></label>
      </div>
    `;
  } else if(l.type==='image'||l.type==='video'||l.type==='logo'){
    const isVid=l.type==='video';
    specificControls=`
      <label>Media Source URL<input data-prop="src" value="${esc(l.src||l.videoUrl||'')}"></label>
      ${isVid?`<label>Poster Cover URL<input data-prop="posterUrl" value="${esc(l.posterUrl||'')}"></label>`:''}
      <div class="cs-two">
        <label>Fit Mode<select data-prop="style.fit">
          <option value="cover" ${st.fit==='cover'?'selected':''}>Cover</option>
          <option value="contain" ${st.fit==='contain'?'selected':''}>Contain</option>
          <option value="fill" ${st.fit==='fill'?'selected':''}>Fill</option>
        </select></label>
        <label>Corner Radius<input data-prop="style.radius" type="range" min="0" max="300" value="${st.radius||0}"></label>
      </div>
      <div class="cs-two">
        <label>Brightness (${f.brightness||100}%)<input data-prop="style.filter.brightness" type="range" min="40" max="180" value="${f.brightness||100}"></label>
        <label>Contrast (${f.contrast||100}%)<input data-prop="style.filter.contrast" type="range" min="40" max="180" value="${f.contrast||100}"></label>
      </div>
      <div class="cs-two">
        <label>Saturation (${f.saturation||100}%)<input data-prop="style.filter.saturation" type="range" min="0" max="200" value="${f.saturation||100}"></label>
        <label>Warmth (${f.temperature||0})<input data-prop="style.filter.temperature" type="range" min="-100" max="100" value="${f.temperature||0}"></label>
      </div>
      <div class="cs-two">
        <label>Blur (${f.blur||0}px)<input data-prop="style.filter.blur" type="range" min="0" max="20" value="${f.blur||0}"></label>
        <label>Opacity<input data-prop="opacity" type="range" min="10" max="100" value="${Math.round((l.opacity??1)*100)}"></label>
      </div>
      <div class="cs-two">
        <button data-a="flipx">Flip Horizontal</button>
        <button data-a="flipy">Flip Vertical</button>
      </div>
    `;
  } else if(l.type==='shape'){
    specificControls=`
      <div class="cs-two">
        <label>Fill Color<input data-prop="style.fill" type="color" value="${st.fill||'#18A982'}"></label>
        <label>Corner Radius<input data-prop="style.radius" type="range" min="0" max="500" value="${st.radius||0}"></label>
      </div>
      <div class="cs-two">
        <label>Border Width<input data-prop="style.borderWidth" type="range" min="0" max="20" value="${st.borderWidth||0}"></label>
        <label>Border Color<input data-prop="style.borderColor" type="color" value="${st.borderColor||'#000000'}"></label>
      </div>
    `;
  }

  box.innerHTML=`
    <div class="cs-prop-head"><input data-prop="name" value="${esc(l.name)}"><button data-add="duplicate-layer">Copy</button><button data-add="delete-layer">Del</button></div>
    <div class="cs-two">
      <label>Position X<input data-prop="x" type="number" value="${Math.round(l.x)}"></label>
      <label>Position Y<input data-prop="y" type="number" value="${Math.round(l.y)}"></label>
    </div>
    <div class="cs-two">
      <label>Width<input data-prop="width" type="number" value="${Math.round(l.width)}"></label>
      <label>Height<input data-prop="height" type="number" value="${Math.round(l.height)}"></label>
    </div>
    <div class="cs-two">
      <label>Rotation<input data-prop="rotation" type="range" min="-180" max="180" value="${l.rotation||0}"></label>
      <label>Layer Order (Z)<input data-prop="zIndex" type="number" min="1" max="100" value="${l.zIndex||1}"></label>
    </div>
    <hr>
    ${specificControls}
    <div class="cs-align" style="margin-top:10px;">
      ${['left','center','right','top','middle','bottom'].map(x=>`<button data-align="${x}">${x}</button>`).join('')}
    </div>
  `;
}

function updateProp(path,input){
  const value=input.type==='number'||input.type==='range'?+input.value:input.value;
  if(input.tagName==='BUTTON')input.value=value;
  commit(n=>{
    const l=n.layers.find(x=>x.id===selected);if(!l)return;
    const p=path.split('.');let o=l;
    while(p.length>1){const k=p.shift();o[k]=o[k]||{};o=o[k];}
    o[p[0]]=value;
  });
}

function updateBackground(path,input){
  const val=input.type==='range'?+input.value:input.value;
  commit(n=>{
    if(path.startsWith('brand.')){
      n.brandKit=n.brandKit||{};
      n.brandKit[path.split('.')[1]]=val;
    }else n.background[path]=val;
  });
}

function renderAssistant(){
  const out=designSuggestions(state),box=$('#csAssistant');if(!box)return;
  box.innerHTML='<h3>Design Assistant</h3>'+(out.length?out.map(x=>`<button data-layer="${x.layerId||''}" class="${x.level}">${esc(x.message)}</button>`).join(''):'<p class="ok">No obvious layout warning found.</p>');
}

function pointerStart(e){
  const handle=e.target.closest('[data-resize-id]'),el=e.target.closest('[data-layer-id]');
  const id=handle?.dataset.resizeId||el?.dataset.layerId;
  if(!id)return;
  const l=state.layers.find(x=>x.id===id);
  if(!l||l.locked)return;
  e.preventDefault();
  selected=l.id;
  drag={
    id:l.id,mode:handle?'resize':'move',corner:handle?.dataset.corner,
    startX:e.clientX,startY:e.clientY,
    x:l.x,y:l.y,width:l.width,height:l.height,
    group:l.groupId?state.layers.filter(x=>x.groupId===l.groupId).map(x=>({id:x.id,x:x.x,y:x.y})):[],
    before:JSON.parse(JSON.stringify(state))
  };
  renderProperties();
  renderQuickBar();
  e.target.setPointerCapture?.(e.pointerId);
}

function pointerMove(e){
  if(!drag)return;
  const l=state.layers.find(x=>x.id===drag.id);if(!l)return;
  const snap=10,dx=(e.clientX-drag.startX)/zoom,dy=(e.clientY-drag.startY)/zoom;
  if(drag.mode==='resize'){
    l.width=Math.max(20,Math.round((drag.width+dx)/snap)*snap);
    l.height=Math.max(20,Math.round((drag.height+dy*(drag.corner==='ne'?-1:1))/snap)*snap);
    if(drag.corner==='ne')l.y=drag.y+drag.height-l.height;
  }else{
    l.x=Math.round((drag.x+dx)/snap)*snap;
    l.y=Math.round((drag.y+dy)/snap)*snap;
    drag.group.forEach(o=>{
      const q=state.layers.find(x=>x.id===o.id);
      if(q&&q.id!==l.id){
        q.x=Math.round((o.x+dx)/snap)*snap;
        q.y=Math.round((o.y+dy)/snap)*snap;
      }
    });
  }
  renderCanvas();
}

function pointerEnd(){
  if(!drag)return;
  const next=JSON.parse(JSON.stringify(state));
  history.replace(drag.before);
  state=history.commit(next);
  drag=null;
  render();
  scheduleSave();
}

function sheet(html){
  const s=$('#csSheet');s.hidden=false;
  s.innerHTML=`<div class="skh-cs-sheet-card"><button class="cs-sheet-close">×</button>${html}</div>`;
  $('.cs-sheet-close',s).onclick=()=>s.hidden=true;
  return s;
}

function showLayers(){
  const s=sheet('<h2>Layers & Grouping</h2><p>Select two or more layers to group them.</p><div style="display:flex;gap:8px;margin-bottom:12px;"><button data-group="group" class="primary">Group selected</button> <button data-group="ungroup">Ungroup selected</button></div><div class="cs-layer-list">'+[...state.layers].sort((a,b)=>b.zIndex-a.zIndex).map(l=>`<article><input type="checkbox" data-pick="${l.id}" aria-label="Select ${esc(l.name)}"><button data-layer="${l.id}">${l.visible===false?'○':'●'} ${esc(l.name)}${l.groupId?' · grouped':''}</button><button data-op="front" data-id="${l.id}" title="Bring to front">⤒</button><button data-op="up" data-id="${l.id}" title="Forward">↑</button><button data-op="down" data-id="${l.id}" title="Backward">↓</button><button data-op="back" data-id="${l.id}" title="Send to back">⤓</button><button data-op="lock" data-id="${l.id}">${l.locked?'🔓':'🔒'}</button><button data-op="hide" data-id="${l.id}">${l.visible===false?'Show':'Hide'}</button><button data-op="duplicate" data-id="${l.id}" title="Duplicate">⧉</button><button data-op="delete" data-id="${l.id}" title="Delete">🗑</button></article>`).join('')+'</div>');
  s.onclick=e=>{
    const grouping=e.target.dataset.group;
    if(grouping){
      const ids=$$('[data-pick]:checked',s).map(x=>x.dataset.pick);
      if(!ids.length)return;
      commit(n=>{
        const gid=grouping==='group'?'grp_'+Date.now().toString(36):null;
        n.layers.filter(l=>ids.includes(l.id)).forEach(l=>l.groupId=gid);
      });
      showLayers();
      return;
    }
    const id=e.target.dataset.id,op=e.target.dataset.op;
    if(!id||!op)return;
    if(op==='duplicate'){selected=id;addLayer('duplicate-layer');showLayers();return;}
    if(op==='delete'){selected=id;addLayer('delete-layer');showLayers();return;}
    commit(n=>{
      const l=n.layers.find(x=>x.id===id);
      if(op==='up')l.zIndex++;
      else if(op==='down')l.zIndex--;
      else if(op==='front')l.zIndex=Math.max(...n.layers.map(q=>q.zIndex))+1;
      else if(op==='back')l.zIndex=Math.max(0,Math.min(...n.layers.map(q=>q.zIndex))-1);
      else if(op==='lock')l.locked=!l.locked;
      else if(op==='hide')l.visible=!l.visible;
    });
    showLayers();
  };
}

function showResize(){
  const opts=Object.entries(FORMAT_PRESETS).map(([k,v])=>`<option value="${k}">${v.label} — ${v.width}×${v.height}</option>`).join('');
  const s=sheet(`<h2>Resize Creative</h2><p>Elements are proportionally adapted; major ratio changes reflow semantic layers for review.</p><label>Preset<select id="csResizePreset">${opts}<option value="custom">Custom</option></select></label><div class="cs-two"><label>Width<input id="csResizeW" type="number" value="${state.canvas.width}"></label><label>Height<input id="csResizeH" type="number" value="${state.canvas.height}"></label></div><button id="csDoResize" class="primary">Resize and review</button>`);
  $('#csResizePreset',s).onchange=e=>{
    const p=FORMAT_PRESETS[e.target.value];
    if(p){$('#csResizeW',s).value=p.width;$('#csResizeH',s).value=p.height;}
  };
  $('#csDoResize',s).onclick=()=>{
    replace(resizeCreative(state,$('#csResizePreset',s).value,+$('#csResizeW',s).value,+$('#csResizeH',s).value));
    s.hidden=true;
  };
}

/* Map canonical creative state to the announcement shape consumed by the
   existing Home card renderer (window.skhAdvertisementCardHtml).
   [NON-CANVAS MVP 2026-09-24] FULL field mapping so the preview card IS the
   published card (§6/§22/§27): slideshow, trimmed video duration, text
   animation/emphasis/mode/timing, palette, CTA + badge animation, category. */
function creativeAsAnnouncement(c){
  const role=r=>c.layers.find(l=>l.role===r);
  const img=c.layers.find(l=>l.type==='image')||c.layers.find(l=>l.type==='logo');
  const vid=c.layers.find(l=>l.type==='video');
  const aud=c.layers.find(l=>l.type==='audio');
  const head=role('headline'),cta=role('cta'),badge=role('badge');
  const anim=head?.animation||{};
  const ss=c.slideshow&&Array.isArray(c.slideshow.slides)&&c.slideshow.slides.filter(s=>s&&s.src).length>=2?c.slideshow:null;
  /* Trimmed video duration (never the raw >60s source length) */
  let mediaDur=0;
  if(vid){
    const vm=vid.videoMeta||{};
    const t=(Number(vm.trimEnd)||0)-(Number(vm.trimStart)||0);
    mediaDur=t>0?t:(Number(vm.duration)||0);
  }else if(ss){
    mediaDur=slideshowTotal(c);
  }else if(aud){
    const am=aud.audioMeta||{};
    const t=(Number(am.trimEnd)||0)-(Number(am.trimStart)||0);
    if(t>0)mediaDur=t;
  }
  return {
    headline:head?.content||c.title,
    text:role('body')?.content||'',
    priceTag:role('price')?.content||c.offer||'',
    image:ss?ss.slides[0].src:(img?.src||''),
    videoUrl:vid?.src||'',audioUrl:aud?.src||'',
    posterUrl:vid?.posterUrl||'',
    slideshow:ss,
    mediaDurationSeconds:Math.round(mediaDur)||null,
    videoControls:vid?.videoMeta?.controls===true,
    ctaLabel:cta?.content||'',badgeText:badge?.content||'',
    badgeColor:badge?.style?.backgroundColor||undefined,
    badgeTextColor:badge?.style?.fill||undefined,
    badgeAnimation:badge?.animation?.entrance!=='none'&&badge?.animation?.entrance?badge.animation.entrance:(badge?.animation?.emphasis||'none'),
    ctaAnimation:cta?.animation?.entrance!=='none'&&cta?.animation?.entrance?cta.animation.entrance:(cta?.animation?.emphasis||'none'),
    category:c.category||'general',
    paletteId:c.paletteId||'',
    /* Text animation pipeline (Input → State → Renderer → Preview → Saved → Published) */
    textAnimation:anim.entrance||'none',
    textEmphasis:anim.emphasis||'none',
    animationMode:anim.mode||'whole',
    animationDuration:anim.duration||600,
    animationDelay:anim.delay||0,
    animationStagger:anim.stagger||100,
    animation:{enabled:!!anim.enabled,entrance:anim.entrance||'none',emphasis:anim.emphasis||'none',mode:anim.mode||'whole',duration:anim.duration||600,delay:anim.delay||0,stagger:anim.stagger||100},
    primaryColor:c.background?.color,accentColor:c.background?.color2,
    textColor:head?.style?.fill||'#FFFFFF',
    fontWeight:head?.style?.fontWeight||'950',
    textAlign:head?.style?.textAlign||'left',
    offer:c.offer||'',
    brandName:c.brandKit?.name||'',logoUrl:c.brandKit?.logoUrl||'',
    link:c.destination?.url||''
  };
}
function showPreview(){
  /* [NON-CANVAS MVP 2026-09-24] §22/§23: EVERY preview mode renders through the
     SAME canonical published renderer (skhAdvertisementCardHtml) fed by the SAME
     creative state — what the user previews IS what appears Home. The SVG design
     canvas remains visible as an extra "Design layout" reference only. */
  const published=typeof window.skhAdvertisementCardHtml==='function'
    ?window.skhAdvertisementCardHtml(creativeAsAnnouncement(state))
    :renderCreativeSvg(state);
  const s=sheet(`<h2>Preview modes <small style="font-weight:600;color:#627D98;">(canonical Home renderer — §22)</small></h2>
    <div class="cs-previews">
      <article><b>Feed / Card (Home)</b><div class="cs-preview-card">${published}</div></article>
      <article class="phone"><b>Mobile / Story</b><div class="cs-preview-card">${published}</div></article>
      <article class="desktop"><b>Desktop / Web</b><div class="cs-preview-card">${published}</div></article>
      <article style="grid-column:1/-1;"><b>Design layout (SVG canvas reference)</b><div>${renderCreativeSvg(state)}</div></article>
    </div>
    <div class="cs-pv-transport">
      <button id="csPvPause">⏸ Pause</button>
      <button id="csPvRestart">↺ Restart</button>
      <button id="csPvMute">🔊 Mute</button>
      <label style="display:flex;align-items:center;gap:8px;flex:1;margin:0;font-weight:700;color:#486581;">Timeline
        <input id="csPvTime" type="range" min="0" max="${state.duration||30}" step="0.1" value="0" style="flex:1;">
        <span id="csPvTimeLabel">0.0s / ${state.duration||30}s</span>
      </label>
    </div>
    <div style="margin-top:14px;"><button id="csPreviewFull" class="primary cs-wide">⛶ Fullscreen preview (published look)</button></div>`);
  $('#csPreviewFull',s).onclick=()=>{
    sheet(`<h2>Fullscreen preview</h2><div class="cs-preview-full cs-preview-card">${published}</div>`);
  };
  /* [§20] Preview transport: same renderer + Play/Pause/Restart/Mute/Timeline */
  let pvPaused=false,pvMuted=false;
  const pvMedia=()=>$$('video,audio',s);
  const pvSyncMedia=()=>pvMedia().forEach(m=>{m.muted=pvMuted;if(pvPaused){try{m.pause();}catch(e){}}});
  $('#csPvPause',s).onclick=e=>{
    pvPaused=!pvPaused;
    e.target.textContent=pvPaused?'▶ Play':'⏸ Pause';
    s.classList.toggle('cs-anim-paused',pvPaused);
    pvSyncMedia();
  };
  $('#csPvRestart',s).onclick=()=>{showPreview();};
  $('#csPvMute',s).onclick=e=>{pvMuted=!pvMuted;e.target.textContent=pvMuted?'🔇 Unmute':'🔊 Mute';pvSyncMedia();};
  $('#csPvTime',s).oninput=e=>{
    const t=Number(e.target.value);
    const lbl=$('#csPvTime',s);if(lbl)lbl.textContent=`${t.toFixed(1)}s / ${state.duration||30}s`;
    pvMedia().forEach(m=>{try{if(Number.isFinite(m.duration)&&m.duration>0)m.currentTime=Math.min(m.duration,t);}catch(err){}});
  };
}

function showExport(){
  const s=sheet(`<h2>Export</h2><p>Editable JSON remains saved separately. Export creates a flattened delivery image only.</p><button id="csPng" class="primary" style="width:100%;margin-bottom:8px;">Download PNG</button><button id="csJpg" style="width:100%;">Download JPG</button>`);
  const run=async type=>{
    try{
      const b=await exportCreative(state,type);
      downloadBlob(b,(state.title||'creative').replace(/\W+/g,'-')+'.'+type);
      toast(type.toUpperCase()+' exported.');
    }catch(e){
      toast(e.message,'error');
    }
  };
  $('#csPng',s).onclick=()=>run('png');
  $('#csJpg',s).onclick=()=>run('jpg');
}

async function saveBrandKit(){
  if(!state.brandKit||!state.brandKit.name)return toast('Enter a business name before saving Brand Kit.','error');
  localStorage.setItem('skh_brand_kit',JSON.stringify(state.brandKit));
  if(!skh.currentUser)return toast('Brand Kit saved on this device. Sign in for cloud save.','warning');
  try{
    await skh.setDoc(skh.doc(skh.db,'brandKits',skh.currentUser.uid+'_default'),{...state.brandKit,ownerId:skh.currentUser.uid,updatedAt:new Date().toISOString()},{merge:true});
    toast('Brand Kit saved.');
  }catch(e){
    toast('Brand Kit cloud save failed: '+e.message,'error');
  }
}
window.saveBrandKit=saveBrandKit;

async function saveDraft(notify){
  localStorage.setItem(storageKey(state),JSON.stringify(state));
  $('#csSaveState').textContent='Saved locally';
  if(skh.currentUser){
    try{
      const payload={...state,ownerId:skh.currentUser.uid,status:state.status||'DRAFT',updatedAt:new Date().toISOString()};
      if(state.id)await skh.setDoc(skh.doc(skh.db,'creatives',state.id),payload,{merge:true});
      else{
        payload.createdAt=payload.createdAt||new Date().toISOString();
        const ref=await skh.addDoc(skh.collection(skh.db,'creatives'),payload);
        state.id=ref.id;history.replace(state);
      }
      $('#csSaveState').textContent='Saved';
      if(notify)toast('Editable Creative saved.');
    }catch(e){
      $('#csSaveState').textContent='Local save only';
      if(notify)toast('Cloud save failed: '+e.message,'error');
    }
  }else if(notify)toast('Saved on this device. Sign in for cloud save.','warning');
}

async function publish(){
  const check=validateCreative(state,{forPublish:true});
  if(!check.ok){
    sheet('<h2>Cannot publish yet</h2><ul class="cs-errors">'+check.errors.map(e=>`<li>${esc(e.message)}</li>`).join('')+'</ul>');
    return;
  }
  await saveDraft(false);
  if(!skh.currentUser)return toast('Sign in before publishing.','error');
  const s=sheet(`<h2>Final pre-publish check</h2><ul class="cs-check"><li>✓ Image and layers loaded</li><li>✓ No technical overflow</li><li>✓ Destination exists in design data</li><li>✓ Linked entity selected</li><li>✓ Creative format valid</li></ul><label>Publication type<select id="csPubType"><option value="advertisement">Advertisement</option><option value="business_update">Business Update</option><option value="product_post">Product Post</option><option value="service_post">Service Post</option><option value="general_post">General Post</option></select></label><p>Non-admin advertisements enter moderation and cannot appear Home until approved.</p><button id="csConfirmPublish" class="primary">Publish pinned version</button>`);
  $('#csConfirmPublish',s).onclick=async()=>{
    try{
      $('#csConfirmPublish',s).disabled=true;
      const result=await skh.callFunction('creativePublish',{creativeId:state.id,publicationType:$('#csPubType',s).value});
      const d=result.data||result;
      state.status=d.status||'READY';
      state.version=d.version||state.version;
      history.replace(state);
      s.hidden=true;
      render();
      toast(d.moderationStatus==='pending'?'Submitted for moderation.':'Creative published.');
    }catch(e){
      toast('Publish failed: '+(e.message||e),'error');
      $('#csConfirmPublish',s).disabled=false;
    }
  };
}

async function fetchEntity(context){
  if(!context.sourceId||!context.sourceType||context.sourceType==='custom')return null;
  const map={product:'products',service:'services',transport:'delivery',seller:'publicProfiles',business:'publicProfiles'};
  const col=map[context.sourceType];if(!col)return null;
  try{
    const snap=await skh.getDoc(skh.doc(skh.db,col,context.sourceId));
    return snap.exists()?{id:snap.id,...snap.data()}:null;
  }catch(e){
    toast('Source could not be loaded: '+e.message,'error');
    return null;
  }
}

async function open(context={}){
  ensureCss();
  const m=shell();
  let c=context.creative?normalizeCreative(context.creative):createCreative({...context,ownerId:skh.currentUser?.uid||''});
  if(context.creativeId){
    try{
      const snap=await skh.getDoc(skh.doc(skh.db,'creatives',context.creativeId));
      if(snap.exists())c=normalizeCreative({id:snap.id,...snap.data()});
    }catch(e){
      toast('Creative could not be opened: '+e.message,'error');
    }
  }else{
    const saved=localStorage.getItem(storageKey(c));
    if(saved&&confirm('Continue editing the recovered draft?'))try{c=normalizeCreative(JSON.parse(saved));}catch(e){}
  }
  const entity=await fetchEntity(context);
  if(entity)c=applyEntity(c,entity,context.sourceType);
  if(!c.brandKit){
    try{const localBrand=localStorage.getItem('skh_brand_kit');if(localBrand)c.brandKit=JSON.parse(localBrand);}catch(e){}
    if(skh.currentUser)try{const bs=await skh.getDoc(skh.doc(skh.db,'brandKits',skh.currentUser.uid+'_default'));if(bs.exists())c.brandKit=bs.data();}catch(e){}
  }
  state=c;
  history=new CreativeHistory(c);
  selected='';
  advancedMode=context.advanced===true;
  activeTab=advancedMode?'advanced':'basic';
  m.classList.toggle('advanced',advancedMode);
  m.classList.add('open');
  document.body.classList.add('skh-cs-open');
  render();
  setTimeout(()=>action('fit'),40);
}

function close(){
  clearTimeout(saveTimer);
  if(state){
    saveDraft(false);
    syncBackToLegacyForm();
  }
  $('#skhCreativeStudio')?.classList.remove('open');
  document.body.classList.remove('skh-cs-open');
}

window.SokoHaiCreativeStudio={open,close,createCreative,validateCreative};
window.CreativeEditor=window.SokoHaiCreativeStudio;
window.openSokoHaiCreativeStudio=open;

window.skhAdvertiseOpenEntity=function(){
  const p=skh.currentOpenProduct;
  if(!p)return toast('Open a Product or Service first.','error');
  const col=String(p.collectionName||p._collection||'products');
  const sourceType=col==='services'?'service':col==='delivery'||col==='drivers'?'transport':'product';
  open({sourceType,sourceId:p.id,format:'square',publicationType:'advertisement'});
};

window.skhOpenAdvancedFromLegacy=function(){
  const get=id=>document.getElementById(id)?.value||'',c=createCreative({format:'landscape',publicationType:'advertisement',ownerId:skh.currentUser?.uid||''});
  c.title=get('annHeadline')||'Advertisement';
  c.background.color=get('annPrimaryColor')||c.background.color;
  c.background.color2=get('annAccentColor')||c.background.color2;
  const setRole=(r,v)=>{const l=c.layers.find(x=>x.role===r);if(l&&v)l.content=v;};
  setRole('headline',get('annHeadline'));
  setRole('body',get('annText'));
  setRole('cta',get('annCta'));
  c.layers.filter(l=>l.type==='text'&&l.role!=='cta').forEach(l=>l.style.fill=get('annTextColor')||l.style.fill);
  const image=get('annImage');
  if(image)c.layers.push(makeLayer('image',{name:'Advertisement image',src:image,originalSrc:image,x:580,y:190,width:530,height:390,zIndex:2,style:{fit:'cover',radius:26,originalSrc:image}}));
  const video=get('annVideo');
  if(video)c.layers.push(makeLayer('video',{name:'Advertisement video',src:video,videoUrl:video,x:580,y:190,width:530,height:390,zIndex:2,style:{fit:'cover',radius:26}}));
  const audio=get('annAudio');
  if(audio)c.layers.push(makeLayer('audio',{name:'Advertisement audio',src:audio,audioUrl:audio,x:80,y:520,width:460,height:60,zIndex:3}));
  const logo=get('annLogo');
  if(logo)c.layers.push(makeLayer('logo',{name:'Brand logo',src:logo,originalSrc:logo,x:c.canvas.width*.82,y:c.canvas.height*.05,width:c.canvas.width*.13,height:c.canvas.width*.13,zIndex:8,style:{fit:'contain',radius:16}}));
  const bdg=get('annBadgeText');
  if(bdg){
    c.layers.push(makeLayer('text',{name:'Promo badge',role:'badge',content:bdg,
      x:c.canvas.width*.055,y:c.canvas.height*.055,width:c.canvas.width*.3,height:c.canvas.height*.055,zIndex:9,
      style:{fill:get('annBadgeTextColor')||'#FFFFFF',backgroundColor:get('annBadgeColor')||'#F59E0B',fontSize:Math.round(c.canvas.width*.022),fontWeight:900,padding:10,radius:get('annBadgeStyle')==='ribbon'?8:999,textAlign:'center'},
      animation:{enabled:get('annBadgeAnimation')!=='none',entrance:get('annBadgeAnimation')==='pop'?'pop':'none',emphasis:get('annBadgeAnimation')!=='none'&&get('annBadgeAnimation')!=='pop'?get('annBadgeAnimation'):'none'}}));
  }
  c.brandKit={name:get('annBrand'),logoUrl:get('annLogo'),primary:c.background.color,secondary:c.background.color2,accent:'#F4C542'};
  if(/^https:\/\//i.test(get('annLink')))c.destination={type:'external',url:get('annLink')};
  // Canonical advertisement meta from the simple form
  c.category=get('annCategory')||'general';
  c.campaignName=get('annCampaignName');
  c.campaignId=get('annCampaignId');
  c.offer=get('annPriceTag');
  c.paletteId=get('annPaletteId');
  c.priority=Math.max(0,+get('annPriority')||0);
  c.startAt=get('annStartAt')?new Date(get('annStartAt')).toISOString():'';
  c.endAt=get('annEndAt')?new Date(get('annEndAt')).toISOString():'';
  const dd=+get('annDisplayDuration')||0;if(dd>=5&&dd<=59)c.displayDurationSeconds=dd;
  const annCreativeId=get('annCreativeId');if(annCreativeId&&!c.id)c.id=annCreativeId;
  document.getElementById('announcementFormModal')?.style.setProperty('display','none');
  open({creative:c,advanced:false});
};

window.skhOpenCompanyAdsSoon=function(){
  open({format:'square',publicationType:'advertisement',advanced:false});
};

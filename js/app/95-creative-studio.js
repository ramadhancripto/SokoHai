/* SokoHai Creative Studio — one lazy-loaded editor for every source/format. */
import { skh } from './00-bootstrap.js';
import {
  createCreative,normalizeCreative,duplicateCreative,resizeCreative,applyEntity,makeLayer,
  FORMAT_PRESETS,VERIFIED_FONTS,QUICK_COLORS,SOKOHAI_BRAND_COLORS,GRADIENT_PRESETS,PATTERNS,TEXTURES,
  TEXT_STYLE_PRESETS,FONT_PAIRING_PRESETS,generatePalette,alignLayers,
  templatesFor,autoDesignVariations,designSuggestions,validateCreative
} from './creative/creative-model.js';
import {CreativeHistory} from './creative/creative-history.js';
import {renderCreativeSvg,exportCreative,downloadBlob,removeBackgroundClient} from './creative/creative-svg-renderer.js';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)], esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,history=null,selected='',activeTab='content',saveTimer=null,drag=null,zoom=.58,guides=true,variations=[],advancedMode=false,recentColors=[];
const storageKey=c=>'skh_creative_draft_'+(c.id||'new_'+(c.linkedEntity?.id||'blank'));

function toast(m,t='success'){if(window.skhToast)window.skhToast(m,t);else alert(m);}
function ensureCss(){if($('#skhCreativeCss'))return;const l=document.createElement('link');l.id='skhCreativeCss';l.rel='stylesheet';l.href='css/39-creative-studio.css';document.head.appendChild(l);}
function currentLayer(){return state?.layers.find(l=>l.id===selected)||null;}
function commit(mutator,label){const next=JSON.parse(JSON.stringify(state));mutator(next);next.updatedAt=new Date().toISOString();state=history.commit(next);render(label);scheduleSave();}
function replace(next){state=history.replace(normalizeCreative(next));selected='';render();scheduleSave();}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft(false),900);}

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
       ${['content','templates','style','effects','cutout','uploads','advanced'].map(x=>`<button data-tab="${x}">${x}</button>`).join('')}
     </nav>
     <div id="csLibrary" class="skh-cs-library"></div>
   </aside>
   <section class="skh-cs-work">
     <div class="skh-cs-status"><span id="csFormat"></span><span id="csSaveState">Draft</span></div>
     <div id="csStage" class="skh-cs-stage">
       <div id="csCanvas" class="skh-cs-canvas"></div>
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
    const ly=e.target.closest('[data-layer]')?.dataset.layer;
    if(ly){selected=ly;renderCanvas();renderProperties();renderQuickBar();}
    const vari=e.target.closest('[data-variation]')?.dataset.variation;
    if(vari&&variations[+vari])replace(variations[+vari].creative);
    const theme=e.target.closest('[data-quicktheme]')?.dataset.quicktheme;
    if(theme)applyQuickTheme(theme);
    const qcol=e.target.closest('[data-quickcolor]')?.dataset.quickcolor;
    if(qcol)applyQuickColor(qcol);
    const pal=e.target.closest('[data-palpreset]')?.dataset.palpreset;
    if(pal)applyPalettePreset(pal);
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
  });

  m.addEventListener('input',e=>{
    if(e.target.id==='csZoom'){zoom=+e.target.value/100;scaleCanvas();return;}
    if(e.target.id==='csTitle'){state.title=e.target.value;scheduleSave();return;}
    if(e.target.id==='csToolSearch'){filterTools(e.target.value);return;}
    if(e.target.dataset.simple){updateSimple(e.target.dataset.simple,e.target.value);return;}
    const key=e.target.dataset.prop;
    if(key)updateProp(key,e.target);
  });

  m.addEventListener('change',e=>{
    if(e.target.dataset.bg)updateBackground(e.target.dataset.bg,e.target);
    if(e.target.id==='csImageFile')uploadImage(e.target);
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

function action(a){
  if(a==='close'){close();return;}
  if(a==='toggleadvanced'){
    advancedMode=!advancedMode;
    $('#skhCreativeStudio')?.classList.toggle('advanced',advancedMode);
    if(advancedMode){activeTab='advanced';renderLibrary();}
    else{activeTab='content';selected='';render();}
    return;
  }
  if(a==='mobileprops'){$('.skh-cs-right')?.classList.toggle('mobile-open');return;}
  if(a==='undo'){state=history.undo();render();return;}
  if(a==='redo'){state=history.redo();render();return;}
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
}

function render(){
  if(!state)return;
  $('#csTitle').value=state.title;
  $('#csFormat').textContent=`${state.format} · ${state.canvas.width} × ${state.canvas.height}`;
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
  if(l.type==='image'){
    bar.innerHTML=`<span class="cs-qb-label">🖼️ ${esc(l.name)}</span>
      <button data-a="removebg" class="cs-qb-btn">🪄 Remove BG</button>
      <button data-a="eraser" class="cs-qb-btn">🧽 Erase</button>
      <button data-tab="effects" class="cs-qb-btn">✨ Frames & Effects</button>
      <button data-prop="style.flipX" value="${!l.style.flipX}" class="cs-qb-btn">↔ Flip</button>
      <button data-a="restoreimage" class="cs-qb-btn">↺ Restore</button>
      <button data-a="toggleadvanced" class="cs-qb-btn">⚙️ Advanced</button>`;
  }else if(l.type==='text'){
    bar.innerHTML=`<span class="cs-qb-label">📝 ${esc(l.name)}</span>
      <button data-tstyle="Headline" class="cs-qb-btn">Headline</button>
      <button data-tstyle="Price" class="cs-qb-btn">🏷️ Price Pill</button>
      <button data-tstyle="CTA" class="cs-qb-btn">⭐ CTA Button</button>
      <button data-prop="style.fontWeight" value="${+l.style.fontWeight>=800?400:900}" class="cs-qb-btn"><b>B</b> Bold</button>
      <button data-tab="style" class="cs-qb-btn">🎨 Colors</button>
      <button data-a="toggleadvanced" class="cs-qb-btn">⚙️ Advanced</button>`;
  }else{
    bar.innerHTML=`<span class="cs-qb-label">🔷 ${esc(l.name)}</span>
      <button data-tab="style" class="cs-qb-btn">🎨 Fill Color</button>
      <button data-add="duplicate-layer" class="cs-qb-btn">Duplicate</button>
      <button data-a="toggleadvanced" class="cs-qb-btn">⚙️ Advanced</button>`;
  }
}

function renderLibrary(showVars=false){
  const box=$('#csLibrary');if(!box)return;
  $$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));
  if(activeTab==='content')box.innerHTML=contentControls();
  else if(activeTab==='style')box.innerHTML=quickStyleControls();
  else if(activeTab==='effects')box.innerHTML=effectsControls();
  else if(activeTab==='cutout')box.innerHTML=cutoutControls();
  else if(activeTab==='advanced')box.innerHTML=advancedControls();
  else if(showVars||variations.length&&activeTab==='templates')box.innerHTML='<h3>Auto Design Variations</h3><p>Choose a labeled layout. None is called “best”.</p><div class="cs-templates">'+variations.map((v,i)=>`<button data-variation="${i}" style="--a:${v.creative.background.color};--b:${v.creative.background.color2}"><i></i><b>${esc(v.name)}</b></button>`).join('')+'</div><hr><h3>Templates</h3>'+templateCards();
  else if(activeTab==='templates')box.innerHTML='<h3>Editable Templates</h3><p>Every element remains a layer.</p>'+templateCards();
  else if(activeTab==='elements')box.innerHTML=`<h3>Elements & Shapes</h3><div class="cs-addgrid"><button data-add="shape" data-value="rectangle">Rectangle</button><button data-add="shape" data-value="circle">Circle</button><button data-add="shape" data-value="line">Line</button><button data-add="shape" data-value="arrow">Arrow</button><button data-add="shape" data-value="badge">Badge</button>${['phone','location','chat','cart','delivery','clock','calendar','price','discount','verified','star','arrow'].map(i=>`<button data-add="icon" data-value="${i}">${i}</button>`).join('')}</div>`;
  else if(activeTab==='text')box.innerHTML=`<h3>Typography</h3><div class="cs-addgrid"><button data-tstyle="Headline">Headline</button><button data-tstyle="Subheadline">Subheadline</button><button data-tstyle="Body">Body text</button><button data-tstyle="Price">Price Tag</button><button data-tstyle="Discount">Discount Pill</button><button data-tstyle="CTA">CTA Button</button><button data-tstyle="Badge">Badge</button><button data-tstyle="Location">Location</button></div><hr><h4>Font Pairings</h4><div class="cs-theme-picks">${FONT_PAIRING_PRESETS.map(p=>`<button data-fpair="${p.name}"><b>${p.name}</b><small>${p.headline} + ${p.body}</small></button>`).join('')}</div>`;
  else if(activeTab==='uploads')box.innerHTML=`<h3>Uploads</h3><label class="cs-upload">Upload image<input id="csImageFile" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><button class="cs-wide" data-add="image-url">Use HTTPS image URL</button><p>Uses the existing SokoHai Cloudinary uploader. Originals are not stored in Firestore.</p>`;
  else if(activeTab==='background')box.innerHTML=backgroundControls();
  else if(activeTab==='brand')box.innerHTML=brandControls();
}

function contentControls(){
  const role=r=>state.layers.find(l=>l.role===r),head=role('headline'),body=role('body'),price=role('price'),cta=role('cta'),img=state.layers.find(l=>l.type==='image');
  return `
    <div class="cs-simple-head"><span>1</span><div><h3>Weka maneno yako</h3><p>Andika tu; preview inabadilika papo hapo.</p></div></div>
    <label>Kichwa kikuu<input data-simple="headline" value="${esc(head?.content||'')}" placeholder="Mfano: Ofa kubwa ya wiki"></label>
    <label>Maelezo mafupi<textarea data-simple="body" rows="3" placeholder="Eleza bidhaa au huduma">${esc(body?.content||'')}</textarea></label>
    <div class="cs-two">
      <label>Bei / offer<input data-simple="price" value="${esc(price?.content||'')}" placeholder="TZS 59,000"></label>
      <label>Kitufe (CTA)<input data-simple="cta" value="${esc(cta?.content||'TAZAMA ZAIDI')}"></label>
    </div>
    <div class="cs-simple-head"><span>2</span><div><h3>Weka picha</h3><p>Upload au tumia picha iliyopo SokoHai.</p></div></div>
    <label class="cs-upload">Chagua picha<input id="csImageFile" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
    <label>Image URL<input data-simple="image" value="${esc(img?.src||'')}" placeholder="https://..."></label>
    <label>CTA destination / website<input data-simple="destination" value="${esc(state.destination?.url||'')}" placeholder="https://... (si lazima kama umetoka kwenye Product/Service)"></label>
    <p class="cs-simple-tip">Kisha chagua Template au Muonekano. Advanced tools zipo kwenye “More design tools”.</p>`;
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

function effectsControls(){
  const img=state.layers.find(l=>l.type==='image');
  return `
    <h3>Image Frames & Effects</h3>
    <p>Chagua umbo la picha na muonekano wa kuvutia.</p>
    <h4>Frame Shapes</h4>
    <div class="cs-addgrid">
      <button data-frame="rounded">Rounded Card</button>
      <button data-frame="circle">Circle</button>
      <button data-frame="square">Sharp Square</button>
      <button data-frame="polaroid">Polaroid Photo</button>
    </div>
    <hr>
    <h4>Background Patterns</h4>
    <div class="cs-addgrid">
      ${PATTERNS.map(p=>`<button data-prop="background.pattern" value="${p}">${p}</button>`).join('')}
      <button data-prop="background.pattern" value="none">None</button>
    </div>`;
}

function cutoutControls(){
  const img=state.layers.find(l=>l.type==='image');
  return `
    <h3>Cutout & Background Removal</h3>
    <p>Ondoa background ya picha ili kubaki na bidhaa au mtu tu.</p>
    ${img?`
      <div style="background:#fff;border:1px solid #d7e0e8;border-radius:12px;padding:12px;text-align:center;">
        <img src="${esc(img.cutoutDataUrl||img.src)}" style="max-width:100%;max-height:160px;border-radius:8px;object-fit:contain;background:#eef2f6;">
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button data-a="removebg" class="primary" style="flex:1;">🪄 Auto Remove BG</button>
          <button data-a="eraser" style="flex:1;">🧽 Manual Brush</button>
        </div>
        ${img.cutoutDataUrl?`<button data-a="restoreimage" style="width:100%;margin-top:8px;">↺ Restore Original</button>`:''}
      </div>
    `:`<p class="cs-note">Weka picha kwanza kwenye tab ya Content au Uploads ili kutumia Cutout.</p>`}`;
}

function advancedControls(){
  return `
    <h3>Advanced Design Tools</h3>
    <p>Zana za kina za graphics, tabaka na vipimo.</p>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <button class="cs-wide" data-tab="text">📝 Typography & Font Pairings</button>
      <button class="cs-wide" data-tab="elements">🔷 Shapes & Icons</button>
      <button class="cs-wide" data-tab="background">🌄 Background, Textures & Gradients</button>
      <button class="cs-wide" data-tab="effects">✨ Filters & Patterns</button>
      <button class="cs-wide" data-tab="cutout">✂️ Cutout & Background Eraser</button>
      <button class="cs-wide" data-tab="brand">🏢 Brand Kit</button>
      <button class="cs-wide" data-a="layers">📑 Layers & Grouping</button>
      <button class="cs-wide" data-a="improvedesign">✨ Smart Design Improver</button>
    </div>`;
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
  });
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
  if(type==='text'){
    const content=value==='headline'?'YOUR HEADLINE':value==='price'?'TZS 0':value==='cta'?'TAZAMA ZAIDI':value==='subheadline'?'Subheadline':'Add your message';
    const fs=value==='headline'?72:value==='price'?64:value==='cta'?36:42;
    commit(n=>{
      const l=makeLayer('text',{content,role:value,x:100,y:150,width:700,height:150,zIndex:z,style:{fontSize:fs,fontWeight:value==='headline'||value==='price'?900:600,fill:'#FFFFFF'}});
      n.layers.push(l);selected=l.id;
    });
  }else if(type==='shape'){
    commit(n=>{
      const l=makeLayer('shape',{shape:value,x:180,y:220,width:420,height:value==='line'||value==='arrow'?50:260,zIndex:z,style:{fill:'#F4C542',radius:value==='badge'?999:24}});
      n.layers.push(l);selected=l.id;
    });
  }else if(type==='icon'){
    commit(n=>{
      const l=makeLayer('icon',{icon:value,x:180,y:220,width:110,height:110,zIndex:z,style:{fill:'#FFFFFF',backgroundColor:'#0E7A5F'}});
      n.layers.push(l);selected=l.id;
    });
  }
}

async function uploadImage(input){
  const file=input.files?.[0];if(!file)return;
  input.disabled=true;
  try{
    if(typeof window.skhUploadFromFile!=='function')throw new Error('SokoHai media uploader is unavailable.');
    const uploaded=await window.skhUploadFromFile(file,{folder:'sokohai/creative-assets'});
    const url=typeof uploaded==='string'?uploaded:uploaded&&uploaded.url;
    if(!url)throw new Error('Upload returned no URL.');
    commit(n=>{
      const l=makeLayer('image',{src:url,originalSrc:url,name:file.name,x:120,y:180,width:700,height:600,zIndex:n.layers.length+1,style:{fit:'cover',radius:22,originalSrc:url}});
      n.layers.push(l);selected=l.id;
    });
    toast('Image uploaded to the existing media service.');
  }catch(e){
    toast(e.message,'error');
  }finally{
    input.disabled=false;input.value='';
  }
}

function renderProperties(){
  const box=$('#csProperties');if(!box)return;
  const l=currentLayer();
  if(!l){
    box.innerHTML='<div class="cs-empty"><b>Select an element</b><p>Click a layer on the canvas or open Layers.</p></div>';
    return;
  }
  const st=l.style||{};
  box.innerHTML=`
    <div class="cs-prop-head"><input data-prop="name" value="${esc(l.name)}"><button data-add="duplicate-layer">Duplicate</button><button data-add="delete-layer">Delete</button></div>
    ${l.type==='text'?`
      <label>Text<textarea data-prop="content" rows="4">${esc(l.content)}</textarea></label>
      <label>Font<select data-prop="style.fontFamily">${VERIFIED_FONTS.map(f=>`<option value="${f.family}" ${st.fontFamily===f.family?'selected':''}>${f.family} (${f.category})</option>`).join('')}</select></label>
      <div class="cs-two">
        <label>Size<input data-prop="style.fontSize" type="number" value="${st.fontSize}"></label>
        <label>Weight<select data-prop="style.fontWeight">${[400,500,600,700,800,900].map(v=>`<option value="${v}" ${+st.fontWeight===v?'selected':''}>${v}</option>`).join('')}</select></label>
      </div>
      <label>Color<input data-prop="style.fill" type="color" value="${st.fill||'#000000'}"></label>
      <div class="cs-three">
        <button data-prop="style.fontStyle" value="${st.fontStyle==='italic'?'normal':'italic'}">Italic</button>
        <button data-prop="style.textDecoration" value="${st.textDecoration==='underline'?'none':'underline'}">Underline</button>
        <select data-prop="style.textAlign"><option value="left" ${st.textAlign==='left'?'selected':''}>left</option><option value="center" ${st.textAlign==='center'?'selected':''}>center</option><option value="right" ${st.textAlign==='right'?'selected':''}>right</option></select>
      </div>
      <label>Line height<input data-prop="style.lineHeight" type="range" min="0.8" max="2" step="0.05" value="${st.lineHeight||1.1}"></label>
      <label>Letter spacing<input data-prop="style.letterSpacing" type="range" min="-4" max="24" value="${st.letterSpacing||0}"></label>
      <fieldset><legend>Stroke</legend>
        <label>Width<input data-prop="style.strokeWidth" type="range" min="0" max="10" step=".5" value="${st.strokeWidth||0}"></label>
        <label>Color<input data-prop="style.stroke" type="color" value="${st.stroke||'#FFFFFF'}"></label>
      </fieldset>
      <fieldset><legend>Shadow & Glow</legend>
        <label>Opacity<input data-prop="style.shadowOpacity" type="range" min="0" max="1" step=".05" value="${st.shadowOpacity||0}"></label>
        <label>Blur<input data-prop="style.shadowBlur" type="range" min="0" max="40" value="${st.shadowBlur||0}"></label>
      </fieldset>
    `:''}
    ${l.type==='image'?`
      <label>Image URL<input data-prop="src" value="${esc(l.src||'')}"></label>
      <label>Fit<select data-prop="style.fit"><option value="cover" ${st.fit==='cover'?'selected':''}>cover</option><option value="contain" ${st.fit==='contain'?'selected':''}>contain</option></select></label>
      <label>Frame Shape<select data-prop="style.frameShape"><option value="rounded" ${st.frameShape==='rounded'?'selected':''}>Rounded Card</option><option value="circle" ${st.frameShape==='circle'?'selected':''}>Circle</option><option value="square" ${st.frameShape==='square'?'selected':''}>Square</option><option value="polaroid" ${st.frameShape==='polaroid'?'selected':''}>Polaroid</option></select></label>
      <div style="display:flex;gap:6px;margin:8px 0;">
        <button data-a="removebg" class="primary" style="flex:1;">🪄 Remove BG</button>
        <button data-a="eraser" style="flex:1;">🧽 Eraser</button>
      </div>
      <label>Brightness<input data-prop="style.filter.brightness" type="range" min="20" max="180" value="${st.filter?.brightness||100}"></label>
      <label>Contrast<input data-prop="style.filter.contrast" type="range" min="20" max="180" value="${st.filter?.contrast||100}"></label>
      <label>Saturation<input data-prop="style.filter.saturation" type="range" min="0" max="200" value="${st.filter?.saturation||100}"></label>
      <label>Warmth<input data-prop="style.filter.temperature" type="range" min="-100" max="100" value="${st.filter?.temperature||0}"></label>
      <label>Blur<input data-prop="style.filter.blur" type="range" min="0" max="20" value="${st.filter?.blur||0}"></label>
    `:''}
    ${l.type!=='text'&&l.type!=='image'?`
      <label>Fill<input data-prop="style.fill" type="color" value="${st.fill||'#FFFFFF'}"></label>
      <label>Radius<input data-prop="style.radius" type="range" min="0" max="300" value="${st.radius||0}"></label>
    `:''}
    <fieldset><legend>Position & Size</legend>
      <div class="cs-two">
        <label>X<input data-prop="x" type="number" value="${Math.round(l.x)}"></label>
        <label>Y<input data-prop="y" type="number" value="${Math.round(l.y)}"></label>
        <label>Width<input data-prop="width" type="number" value="${Math.round(l.width)}"></label>
        <label>Height<input data-prop="height" type="number" value="${Math.round(l.height)}"></label>
      </div>
      <label>Rotation<input data-prop="rotation" type="range" min="-180" max="180" value="${l.rotation||0}"></label>
      <label>Opacity<input data-prop="opacity" type="range" min="0" max="1" step=".05" value="${l.opacity||1}"></label>
    </fieldset>
    <div class="cs-align">
      ${['left','center','right','top','middle','bottom'].map(x=>`<button data-align="${x}">${x}</button>`).join('')}
    </div>`;
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
  const s=sheet('<h2>Layers & Grouping</h2><p>Select two or more layers to group them.</p><div style="display:flex;gap:8px;margin-bottom:12px;"><button data-group="group" class="primary">Group selected</button> <button data-group="ungroup">Ungroup selected</button></div><div class="cs-layer-list">'+[...state.layers].sort((a,b)=>b.zIndex-a.zIndex).map(l=>`<article><input type="checkbox" data-pick="${l.id}" aria-label="Select ${esc(l.name)}"><button data-layer="${l.id}">${l.visible===false?'○':'●'} ${esc(l.name)}${l.groupId?' · grouped':''}</button><button data-op="up" data-id="${l.id}">↑</button><button data-op="down" data-id="${l.id}">↓</button><button data-op="lock" data-id="${l.id}">${l.locked?'Unlock':'Lock'}</button><button data-op="hide" data-id="${l.id}">${l.visible===false?'Show':'Hide'}</button></article>`).join('')+'</div>');
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
    commit(n=>{
      const l=n.layers.find(x=>x.id===id);
      if(op==='up')l.zIndex++;
      if(op==='down')l.zIndex--;
      if(op==='lock')l.locked=!l.locked;
      if(op==='hide')l.visible=!l.visible;
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

function showPreview(){
  sheet(`<h2>Preview modes</h2><div class="cs-previews"><article><b>Feed</b><div>${renderCreativeSvg(state)}</div></article><article class="phone"><b>Mobile / Story</b><div>${renderCreativeSvg(state)}</div></article><article class="desktop"><b>Desktop</b><div>${renderCreativeSvg(state)}</div></article></div>`);
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
  activeTab=advancedMode?'advanced':'content';
  m.classList.toggle('advanced',advancedMode);
  m.classList.add('open');
  document.body.classList.add('skh-cs-open');
  render();
  setTimeout(()=>action('fit'),40);
}

function close(){
  clearTimeout(saveTimer);
  if(state)saveDraft(false);
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
  c.brandKit={name:get('annBrand'),logoUrl:get('annLogo'),primary:c.background.color,secondary:c.background.color2,accent:'#F4C542'};
  if(/^https:\/\//i.test(get('annLink')))c.destination={type:'external',url:get('annLink')};
  document.getElementById('announcementFormModal')?.style.setProperty('display','none');
  open({creative:c,advanced:false});
};

window.skhOpenCompanyAdsSoon=function(){
  open({format:'square',publicationType:'advertisement',advanced:false});
};

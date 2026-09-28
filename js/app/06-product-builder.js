/* Phase 2 Step 2A/B: additive seller product builder UI.
 * It only prepares structured fields for the existing submitSeller authority. */
import { skh } from './00-bootstrap.js';
import { getProductSuggestions } from '../../shared/product-taxonomy-bridge.mjs';

const state = { attributes: [], options: [], variants: [], features: [], additionalInfo: [] };
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id = (prefix, value) => `${prefix}_${String(value || Date.now()).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)}_${Math.random().toString(36).slice(2,7)}`;
const exportState = () => { window.skhProductBuilderExport = { attributes: state.attributes, options: state.options, variantsStructured: state.variants, features: state.features, additionalInfo: state.additionalInfo }; };
const optionTypes = ['color','button','dropdown','image','swatch','text'];
const attrTypes = ['text','number','boolean','single_select','multi_select','measurement'];

function renderAttributes() {
  const el = document.getElementById('spbAttributes'); if (!el) return;
  el.innerHTML = state.attributes.length ? state.attributes.map((a, i) => `<div class="spb-row"><div><b>${esc(a.name)}</b><small>${esc(String(a.value))} · ${esc(a.type)}${a.filterable ? ' · buyer filter' : ''}</small></div><button type="button" data-edit-attr="${i}">Edit</button><button type="button" data-remove-attr="${i}">Remove</button></div>`).join('') : '<p class="spb-empty">No attributes selected yet.</p>';
}
function renderOptions() {
  const el = document.getElementById('spbOptions'); if (!el) return;
  el.innerHTML = state.options.length ? state.options.map((o, i) => `<div class="spb-card"><div class="spb-card-head"><b>${esc(o.name)}</b><span>${esc(o.selectorType)}</span><button type="button" data-remove-option="${i}">Remove</button></div><div class="spb-values">${o.values.map((v, j) => `<span>${esc(v.label)}${v.images?.length ? ' 🖼' : ''}<button type="button" data-attach-value="${i}:${j}">image</button><button type="button" data-remove-value="${i}:${j}">×</button></span>`).join('')}</div><button type="button" data-add-value="${i}" class="spb-link">＋ Add value</button></div>`).join('') : '<p class="spb-empty">No options. This is valid for simple products.</p>';
}
function renderVariants() {
  const el = document.getElementById('spbVariants'); if (!el) return;
  el.innerHTML = state.variants.length ? `<div class="spb-variant-head">${state.variants.length} generated/manual variant(s). Review before saving.</div>` + state.variants.map((v, i) => `<div class="spb-variant"><label><input type="checkbox" data-variant-enabled="${i}" ${v.status === 'ACTIVE' ? 'checked' : ''}> <b>${esc(Object.entries(v.options || {}).map(([k,x]) => `${k}: ${x}`).join(' / ') || 'Manual variant')}</b></label><input data-variant-sku="${i}" value="${esc(v.sku || '')}" placeholder="SKU"><input data-variant-price="${i}" type="number" value="${v.price ?? ''}" placeholder="Price"><input data-variant-stock="${i}" type="number" value="${v.stock ?? ''}" placeholder="Stock"><button type="button" data-attach-variant="${i}">image</button><button type="button" data-remove-variant="${i}">Remove</button></div>`).join('') : '<p class="spb-empty">No variants generated. Options are optional.</p>';
}
function renderSimpleList(key, targetId, empty) {
  const el = document.getElementById(targetId); if (!el) return;
  el.innerHTML = state[key].length ? state[key].map((x, i) => `<div class="spb-row"><div><b>${esc(x.name)}</b><small>${esc(String(x.value))}</small></div><button type="button" data-remove-${key}="${i}">Remove</button></div>`).join('') : `<p class="spb-empty">${empty}</p>`;
}
function renderAll() { renderAttributes(); renderOptions(); renderVariants(); renderSimpleList('features','spbFeatures','No features added.'); renderSimpleList('additionalInfo','spbAdditional','No additional information added.'); exportState(); }
function showEditor(kind, index = -1, extra = {}) {
  const host = document.getElementById('spbEditor'); if (!host) return;
  const current = kind === 'attribute' ? (state.attributes[index] || {}) : kind === 'option' ? (state.options[index] || {}) : kind === 'feature' ? (state.features[index] || {}) : kind === 'additional' ? (state.additionalInfo[index] || {}) : {};
  const value = current.value ?? '';
  const type = current.type || 'text';
  const selector = current.selectorType || 'button';
  host.innerHTML = `<div class="spb-editor"><b>${index >= 0 ? 'Edit' : 'Add'} ${kind}</b><input id="spbEditName" value="${esc(current.name || extra.name || '')}" placeholder="Name"><input id="spbEditValue" value="${esc(value)}" placeholder="Value">${kind === 'attribute' ? `<select id="spbEditType">${attrTypes.map(t => `<option ${t===type?'selected':''}>${t}</option>`).join('')}</select><label><input id="spbEditFilter" type="checkbox" ${current.filterable?'checked':''}> Use as buyer filter</label>` : ''}${kind === 'option' ? `<select id="spbEditSelector">${optionTypes.map(t => `<option ${t===selector?'selected':''}>${t}</option>`).join('')}</select>` : ''}<div><button type="button" id="spbEditorSave" class="spb-btn primary">Save</button><button type="button" id="spbEditorCancel" class="spb-btn">Cancel</button></div></div>`;
  host.hidden = false;
  document.getElementById('spbEditorCancel').onclick = () => { host.hidden = true; host.innerHTML = ''; };
  document.getElementById('spbEditorSave').onclick = () => {
    const name = document.getElementById('spbEditName').value.trim(); if (!name) return;
    const val = document.getElementById('spbEditValue').value.trim();
    if (kind === 'attribute') { const a={id:current.id||id('attr',name),name,value:val,type:document.getElementById('spbEditType').value,source:current.source||'SELLER',display:true,filterable:document.getElementById('spbEditFilter').checked,filterKey:name.toLowerCase().replace(/[^a-z0-9]+/g,'_')}; index>=0?state.attributes[index]=a:state.attributes.push(a); }
    if (kind === 'option') { const o={id:current.id||id('option',name),name,selectorType:document.getElementById('spbEditSelector').value,source:current.source||'SELLER',values:current.values||[],required:false,display:true}; index>=0?state.options[index]=o:state.options.push(o); }
    if (kind === 'feature') state.features.push({id:id('feature',name),name,value:val||true,observable:true,images:[],source:'SELLER'});
    if (kind === 'additional') state.additionalInfo.push({id:id('info',name),name,value:val,source:'SELLER',display:true});
    host.hidden = true; host.innerHTML = ''; renderAll();
  };
}

function suggestions() {
  const cat = document.getElementById('prodCategory')?.value || '';
  const sub = document.getElementById('prodSubCategory')?.value || '';
  const config = skh.advancedCategories?.[cat]?.subcategories?.[sub];
  const bridge = getProductSuggestions(cat, sub, skh.advancedCategories?.[cat]);
  const names = [...new Set([...(bridge.attributes || []), ...(bridge.filters || []), ...Object.keys(bridge.options || {})].map(x => typeof x === 'string' ? x : '').filter(x => x && x.toLowerCase() !== 'others'))];
  const box = document.getElementById('spbSuggestions'); if (!box) return;
  box.innerHTML = names.length ? names.map(name => `<span class="spb-suggestion" data-suggest="${esc(name)}">${esc(name)} <button type="button">Use</button></span>`).join('') : '<span class="spb-empty">No predefined suggestions. Use custom controls below.</span>';
}
function addAttribute(name, value = '', source = 'SELLER') {
  const existing = state.attributes.find(a => a.name.toLowerCase() === name.toLowerCase()); if (existing) return;
  state.attributes.push({ id: id('attr', name), name, value, type: 'text', source, categoryId: document.getElementById('prodCategory')?.value || undefined, subcategoryId: document.getElementById('prodSubCategory')?.value || undefined, display: true, filterable: true, filterKey: name.toLowerCase().replace(/[^a-z0-9]+/g,'_') }); renderAll();
}
function generateVariants() {
  if (state.options.length === 0 || state.options.some(o => !o.values.length)) { alert('Ongeza option na value angalau moja kwanza.'); return; }
  let rows = [{ options: {} }];
  state.options.forEach(option => { rows = rows.flatMap(row => option.values.map(value => ({ options: { ...row.options, [option.name]: value.value } }))); });
  if (rows.length > 200) { alert('Combination nyingi sana. Punguza values kabla ya ku-generate.'); return; }
  state.variants = rows.map(row => ({ variantId: id('variant', Object.values(row.options).join('-')), options: row.options, status: 'DRAFT', available: false, images: [], unitId: document.getElementById('prodBaseUnit')?.value || 'Piece' })); renderVariants(); exportState();
}
function bind() {
  const form = document.getElementById('sellerForm'); if (!form) return;
  form.insertAdjacentHTML('beforeend', `<input type="hidden" id="spbStructuredReady" value="1">`);
  document.getElementById('spbAddAttribute')?.addEventListener('click', () => showEditor('attribute'));
  document.getElementById('spbAddFeature')?.addEventListener('click', () => showEditor('feature'));
  document.getElementById('spbAddAdditional')?.addEventListener('click', () => showEditor('additional'));
  document.getElementById('spbAddOption')?.addEventListener('click', () => showEditor('option'));
  document.getElementById('spbGenerate')?.addEventListener('click', generateVariants);
  document.getElementById('spbManualVariant')?.addEventListener('click', () => { const name = 'Manual variant'; state.variants.push({ variantId:id('variant',name), options:{ Manual:name }, sku:'', status:'DRAFT', available:false, images:[], unitId:document.getElementById('prodBaseUnit')?.value || 'Piece' }); renderAll(); });
  document.addEventListener('click', event => {
    const s = event.target.closest('[data-suggest]'); if (s) { addAttribute(s.dataset.suggest, '', 'SUGGESTION'); s.remove(); return; }
    const editA = event.target.closest('[data-edit-attr]'); if (editA) { showEditor('attribute', Number(editA.dataset.editAttr)); return; }
    const rmA = event.target.closest('[data-remove-attr]'); if (rmA) { state.attributes.splice(Number(rmA.dataset.removeAttr),1); renderAll(); return; }
    const rmO = event.target.closest('[data-remove-option]'); if (rmO) { state.options.splice(Number(rmO.dataset.removeOption),1); renderAll(); return; }
    const addV = event.target.closest('[data-add-value]'); if (addV) { const oi=Number(addV.dataset.addValue); const option=state.options[oi]; showEditor('attribute', -1, {name: option.name + ' value'}); const save=document.getElementById('spbEditorSave'); if(save) save.onclick=()=>{const v=document.getElementById('spbEditValue').value.trim(); if(v){option.values.push({id:id('optv',v),value:v,label:v,images:[],availability:'available',disabled:false});document.getElementById('spbEditor').hidden=true;document.getElementById('spbEditor').innerHTML='';renderAll();}}; return; }
    const attachV = event.target.closest('[data-attach-value]'); if (attachV) { const [oi,vi]=attachV.dataset.attachValue.split(':').map(Number); const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.multiple=true; input.id='spbImg_'+Date.now(); input.onchange=async()=>{ try { const urls=typeof window.skhUploadPicked==='function' ? await window.skhUploadPicked(input.id, 6) : []; state.options[oi].values[vi].images.push(...(urls||[])); renderAll(); } catch(e) { alert('Image upload failed: '+e.message); } finally { input.remove(); } }; document.body.appendChild(input); input.click(); return; }
    const rmV = event.target.closest('[data-remove-value]'); if (rmV) { const [oi,vi]=rmV.dataset.removeValue.split(':').map(Number); state.options[oi].values.splice(vi,1); renderAll(); return; }
    const attachVar = event.target.closest('[data-attach-variant]'); if (attachVar) { const vi=Number(attachVar.dataset.attachVariant); const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.multiple=true; input.id='spbVariantImg_'+Date.now(); input.onchange=async()=>{try{const urls=typeof window.skhUploadPicked==='function'?await window.skhUploadPicked(input.id,6):[];state.variants[vi].images.push(...(urls||[]));renderAll();}catch(e){alert('Image upload failed: '+e.message)}finally{input.remove();}};document.body.appendChild(input);input.click();return; }
    const rmVar = event.target.closest('[data-remove-variant]'); if (rmVar) { state.variants.splice(Number(rmVar.dataset.removeVariant),1); renderAll(); return; }
    const rmF = event.target.closest('[data-remove-features]'); if (rmF) { state.features.splice(Number(rmF.dataset.removeFeatures),1); renderAll(); return; }
    const rmI = event.target.closest('[data-remove-additionalInfo]'); if (rmI) { state.additionalInfo.splice(Number(rmI.dataset.removeAdditionalInfo),1); renderAll(); return; }
  });
  document.addEventListener('change', event => {
    const enabled = event.target.closest('[data-variant-enabled]'); if (enabled) { const v=state.variants[Number(enabled.dataset.variantEnabled)]; v.status=enabled.checked?'ACTIVE':'INACTIVE';v.available=enabled.checked;exportState(); }
    const sku=event.target.closest('[data-variant-sku]'); if(sku) state.variants[Number(sku.dataset.variantSku)].sku=sku.value.trim();
    const price=event.target.closest('[data-variant-price]'); if(price) state.variants[Number(price.dataset.variantPrice)].price=price.value === '' ? undefined : Number(price.value);
    const stock=event.target.closest('[data-variant-stock]'); if(stock) state.variants[Number(stock.dataset.variantStock)].stock=stock.value === '' ? undefined : Number(stock.value);
    exportState();
  });
  document.getElementById('prodCategory')?.addEventListener('change', suggestions); document.getElementById('prodSubCategory')?.addEventListener('change', suggestions); suggestions(); renderAll();
}
window.skhProductBuilderReset = () => { state.attributes=[];state.options=[];state.variants=[];state.features=[];state.additionalInfo=[];renderAll();suggestions(); };
window.addEventListener('DOMContentLoaded', bind);

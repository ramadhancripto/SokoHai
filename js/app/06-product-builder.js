/* Product Builder: UI adapter for the existing seller/edit writers and uploader.
 * No collection, product writer or stock authority lives in this module. */
import { skh } from './00-bootstrap.js';
import { getProductSuggestions, getSellerSubcategories, getSellerCategoryOptions } from '../../shared/product-taxonomy-bridge.mjs';
import { normalizeAttributes, normalizeOptions, normalizeFeatures, normalizeAdditionalInfo, normalizeFilters, imageList, generateCombinations, combinationKey, suggestCustom } from '../../shared/product-upload-data-core.mjs';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = v => JSON.parse(JSON.stringify(v));
const uid = (prefix = 'variant') => prefix + '_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
const key = v => String(v).trim().toLowerCase();
const array = v => Array.isArray(v) ? v : [];
let mode = 'create', pending = 0, suggestionRows = [], session = 0;
let state, createState;
function empty() { return { original: {}, productSku: '', options: [], variants: [], attributes: [], features: [], additionalInfo: [], filters: {}, images: [], canonical: true, selectorsDirty: false, variantsDirty: false, stockDeltas: {}, removed: [], metadataVersion: 0 }; }
state = empty();
function notice(text, error = false) { const el = $('spbNotice'); if (el) { el.textContent = text; el.className = error ? 'spb-error' : 'spb-notice'; } }
function value(id) { return $(id)?.value?.trim() || ''; }
function baseUnit() { return value(mode === 'edit' ? 'editBaseUnit' : 'prodBaseUnit') || 'Piece'; }
function basePrice() { return Number(value(mode === 'edit' ? 'editPrice' : 'prodPrice')) || 0; }
function btn(action, label, data = '', disabled = false) { return `<button type="button" data-spb="${action}" data-index="${data}" ${disabled ? 'disabled' : ''}>${label}</button>`; }
function img(url, alt = '') { return `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">`; }
function media(item, target) { return `<div class="spb-media">${imageList(item.images).map((url, i) => `<span>${img(url)}${btn('remove-image', '×', target + ':' + i)}</span>`).join('')}${btn('attach', '＋ Image', target)}</div>`; }
function exportState() { window.skhProductBuilderExport = { attributes: state.attributes, options: state.options, features: state.features, additionalInfo: state.additionalInfo, [state.canonical ? 'variantCombinations' : 'variantsStructured']: state.variants }; }
function render() {
  if($('spbProductSku')){$('spbProductSku').value=state.productSku || state.original.sku || '';$('spbProductSku').readOnly=!!state.original.sku;}
  if (!$('productBuilder')) return;
  if($('spbSelectorDetails'))$('spbSelectorDetails').hidden=!state.options.length&&!state.variants.length;
  if($('spbCombinationSection'))$('spbCombinationSection').hidden=!state.options.length&&!state.variants.length;
  if($('spbSkipVariants'))$('spbSkipVariants').disabled=!!state.options.length||!!state.variants.length;
  $('spbOptions').innerHTML = state.options.map((o, i) => `<article class="spb-card"><div class="spb-row"><b>${esc(o.name)}</b><small>${esc(o.selectorType)}</small>${btn('edit-option','Edit',i)}${btn('up-option','↑',i,i===0)}${btn('down-option','↓',i,i===state.options.length-1)}${btn('remove-option','Remove',i)}</div><div class="spb-values">${o.values.map((v,j) => `<div class="spb-value"><b>${esc(v.label || v.value)}</b>${media(v,`value:${i}:${j}`)}<div class="spb-actions">${btn('edit-value','Edit',`${i}:${j}`)}${btn('up-value','↑',`${i}:${j}`,j===0)}${btn('down-value','↓',`${i}:${j}`,j===o.values.length-1)}${btn('remove-value','Remove',`${i}:${j}`)}</div></div>`).join('')}</div>${btn('add-value','＋ Add value',i)}</article>`).join('') || '<p class="spb-empty">No selectors. Simple products are welcome.</p>';
  $('spbVariants').innerHTML = (state.variants.length ? `<p>${state.variants.filter(v=>!v.removed).length} combinations · ${state.variants.filter(v=>v.status==='ACTIVE' && !v.removed).length} enabled</p>` : '<p class="spb-empty">Generate combinations or add one manually.</p>') + state.variants.map((v,i) => {
    if (v.removed) return '';
    const saved = array(state.original.variantCombinations).some(x=>x.variantId===v.variantId);
    const legacy = !state.canonical && array(state.original.variantsStructured).some(x=>x.variantId===v.variantId);
    return `<article class="spb-card spb-variant"><label class="spb-check"><input type="checkbox" data-field="enabled" data-row="${i}" ${v.status==='ACTIVE' && v.available!==false?'checked':''}> Enable · <b>${esc(Object.values(v.options || {}).join(' / '))}</b></label><div class="spb-grid">${['sku','barcode','price','stock','unitId'].map(field => {
      const numeric = field==='price'||field==='stock';
      return `<label>${({sku:'SKU',barcode:'Barcode',price:'Price',stock:saved?'Current stock':'Opening stock',unitId:'Unit'})[field]}<input aria-label="${field}" data-field="${field}" data-row="${i}" value="${esc(v[field] ?? '')}" ${numeric?'type="number" min="0"':''} ${field==='stock'?'step="1"':''} ${saved && ['sku','unitId','stock'].includes(field) || legacy && field==='stock'?'readonly':''}></label>`;
    }).join('')}${saved?`<label>Adjust stock by (+ / −)<input type="number" step="1" data-field="stockDelta" data-row="${i}" value="${state.stockDeltas[v.variantId] || 0}"></label>`:''}</div>${saved?'<small>SKU / unit identity retained. Stock changes are audited adjustments.</small>':legacy?'<small>Legacy stock snapshot — inventory changes use the product stock adjustment above.</small>':''}${media(v,`variant:${i}`)}${btn('edit-variant','Edit combination',i)}${btn('remove-variant','Remove',i)}</article>`;
  }).join('');
  [['attributes','spbAttributes','attribute'],['features','spbFeatures','feature'],['additionalInfo','spbAdditional','additional']].forEach(([field,host,kind])=>{
    $(host).innerHTML = state[field].map((a,i)=>`<div class="spb-row"><div><b>${esc(a.name)}</b><small>${esc(Array.isArray(a.value)?a.value.join(', '):a.value)}${a.type?' · '+esc(a.type):''}</small></div>${btn('edit-'+kind,'Edit',i)}${btn('remove-'+kind,'Remove',i)}</div>`).join('') || '<p class="spb-empty">Nothing added yet.</p>';
  });
  $('spbFilters').innerHTML = state.attributes.map((a,i)=>`<label class="spb-check"><input type="checkbox" data-filter-attr="${i}" ${a.filterable?'checked':''}> ${esc(a.name)} · ${esc(Array.isArray(a.value)?a.value.join(', '):a.value)}</label>`).join('') + Object.entries(state.filters).map(([name,val],i)=>`<div class="spb-row"><span>${esc(name)}: ${esc(val)}</span>${btn('edit-filter','Edit',i)}${btn('remove-filter','Remove',i)}</div>`).join('');
  if (mode === 'edit') $('spbEditImages').innerHTML = state.images.map((u,i)=>`<span class="spb-general">${img(u)}${btn('up-general','←',i,i===0)}${btn('remove-general','Remove',i)}</span>`).join('');
  exportState();
}
function closeEditor() { $('spbEditor').hidden = true; $('spbEditor').innerHTML = ''; }
function editor(title, fields, save) {
  const host = $('spbEditor'); host.hidden = false;
  host.innerHTML = `<div class="spb-editor" role="group" aria-label="${esc(title)}"><h4>${esc(title)}</h4>${fields}<p id="spbEditorError" role="alert"></p><div class="spb-actions"><button type="button" id="spbEditorSave">Use / Save</button><button type="button" id="spbEditorCancel">Cancel</button></div></div>`;
  $('spbEditorCancel').onclick = closeEditor;
  $('spbEditorSave').onclick = () => { try { save(); closeEditor(); render(); } catch(e) { $('spbEditorError').textContent = e.message; } };
  host.scrollIntoView?.({block:'nearest',behavior:'smooth'}); host.querySelector('input,select,textarea')?.focus();
}
const input = (id,label,val='',type='text') => `<label>${label}<input id="${id}" type="${type}" value="${esc(val)}"></label>`;
function requireName(name, list, index) { if (!name) throw Error('Jina linahitajika.'); if (list.some((a,i)=>i!==index && key(a.name)===key(name))) throw Error('Jina hili tayari lipo.'); }
function showEditor(kind, index = -1, suggestion = {}) {
  const field = {attribute:'attributes',option:'options',feature:'features',additional:'additionalInfo'}[kind];
  const current = index >= 0 ? state[field][index] : suggestion;
  const types = ['text','number','boolean','single_select','multi_select','measurement','custom'];
  const selectors = ['button','color','image','dropdown','swatch','text'];
  editor(`${index<0?'Add':'Edit'} ${kind==='option'?'Selector':kind}`,input('spbEditName','Name',current.name) + (kind !== 'option' || index < 0 ? input('spbEditValue',kind==='option'?'Values (comma-separated)': 'Value (multiple: comma-separated)',Array.isArray(current.value)?current.value.join(', '):current.value ?? ''):'') + (kind==='attribute'?`<label>Type<select id="spbEditType">${types.map(t=>`<option ${t===(current.type || 'text')?'selected':''}>${t}</option>`).join('')}</select></label><small>Boolean: true / false. Number: e.g. 5000. Multiple: Leather, Cotton.</small>`:'') + (kind==='option'?`<label>Presentation<select id="spbEditSelector">${selectors.map(t=>`<option ${t===(current.selectorType || 'button')?'selected':''}>${t}</option>`).join('')}</select></label>`:''),()=>{
    const name=value('spbEditName'), raw=value('spbEditValue'); requireName(name,state[field],index);
    const data={...current,id:current.id || uid(kind),name,source:current.source || 'SELLER',display:current.display!==false};
    delete data.kind;
    if (kind==='option') {
      data.selectorType=value('spbEditSelector'); data.values=current.values || [];
      if (index<0) data.values=[...new Set(raw.split(/[,;\n]/).map(v=>v.trim()).filter(Boolean))].map(v=>({id:uid('value'),label:v,value:v,images:[]}));
      if (index>=0 && name!==current.name) state.variants.forEach(v=>{ if (Object.hasOwn(v.options,current.name)) { v.options[name]=v.options[current.name]; delete v.options[current.name]; } });
      state.selectorsDirty=true;
    } else {
      data.value=raw;
      if (kind==='attribute') {
        data.type=value('spbEditType'); data.filterable=current.filterable===true; data.filterKey=current.filterKey || key(name).replace(/\s+/g,'_');
        if (data.type==='number') { if (!raw || !Number.isFinite(Number(raw))) throw Error('Weka namba halali.'); data.value=Number(raw); }
        if (data.type==='boolean') { if (!/^(true|false|yes|no|ndiyo|hapana)$/i.test(raw)) throw Error('Tumia true / false.'); data.value=/^(true|yes|ndiyo)$/i.test(raw); }
        if (data.type==='multi_select') data.value=[...new Set(raw.split(/[,;\n]/).map(v=>v.trim()).filter(Boolean))];
      }
      if (kind==='feature') data.value=raw===''||raw==='true'?true:raw==='false'?false:raw;
      if (kind==='additional' && !raw) throw Error('Value inahitajika.');
    }
    if (index<0) state[field].push(data); else state[field][index]=data;
  });
}
function editValue(oi,vi=-1) {
  const o=state.options[oi], old=o.values[vi] || {};
  editor(`${vi<0?'Add':'Edit'} ${o.name} value`,input('spbValue','Value',old.value || ''),()=>{
    const val=value('spbValue'); if (!val) throw Error('Value inahitajika.');
    if (o.values.some((v,i)=>i!==vi && key(v.value)===key(val))) throw Error('Value tayari ipo.');
    const v={...old,id:old.id||uid('value'),value:val,label:val,images:old.images||[]};
    if (vi<0) o.values.push(v); else { o.values[vi]=v; state.variants.forEach(row=>{if(row.options[o.name]===old.value)row.options[o.name]=val;}); }
    state.selectorsDirty=true;
  });
}
function manual(index=-1) {
  if (!state.options.length || state.options.some(o=>!o.values.length)) { notice('Ongeza selectors na values kwanza.',true); return; }
  const current=state.variants[index];
  editor(index<0?'Add Variant Manually':'Edit combination',state.options.map((o,i)=>`<label>${esc(o.name)}<select id="spbManual${i}">${o.values.map(v=>`<option value="${esc(v.value)}" ${current?.options[o.name]===v.value?'selected':''}>${esc(v.label || v.value)}</option>`).join('')}</select></label>`).join(''),()=>{
    const options=Object.fromEntries(state.options.map((o,i)=>[o.name,value('spbManual'+i)]));
    const match=state.variants.find((v,i)=>i!==index && combinationKey(v.options)===combinationKey(options));
    if (match && !match.removed) throw Error('Combination tayari ipo.');
    if (match) { match.removed=false; match.status='INACTIVE'; match.available=false; }
    else if (current) current.options=options;
    else state.variants.push(newVariant(options));
    state.variantsDirty=true;
  });
}
function newVariant(options) { const variantId=uid(); return {variantId,sku:'SKU-'+variantId.slice(-12),barcode:'',unitId:baseUnit(),price:basePrice(),stock:0,options,images:[],status:'INACTIVE',available:false}; }
function generate() {
  try {
    state.variants=generateCombinations(state.options,state.variants,()=>uid(),{unitId:baseUnit(),price:basePrice(),stock:0,barcode:''}).map(v=>({...v,sku:v.sku || 'SKU-'+v.variantId.slice(-12)}));
    state.variantsDirty=true;
    notice('Generated. Review kila combination kisha Enable unazouza. IDs zilizopo zimehifadhiwa.'); render();
  } catch(e) { notice(e.message,true); }
}
function filterEditor(index=-1) {
  const [name='',val='']=Object.entries(state.filters)[index] || [];
  editor('Discovery filter',input('spbFilterName','Name',name)+input('spbFilterValue','Value',val),()=>{
    const n=value('spbFilterName'),v=value('spbFilterValue'); if(!n||!v)throw Error('Name na value zinahitajika.');
    const a=state.attributes.find(a=>key(a.name)===key(n) || key(a.filterKey)===key(n));
    if (a) { a.filterable=true; notice('Filter imeunganishwa na attribute '+a.name+'. Badili value kwenye attribute.'); }
    else { if(n!==name && Object.hasOwn(state.filters,n))throw Error('Filter tayari ipo.'); state.filters[n]=v; }
    if (name && (n!==name || a)) delete state.filters[name];
  });
}
function categorySuggestions() {
  const cat=value(mode==='edit'?'editCategory':'prodCategory'), sub=value(mode==='edit'?'editSubCategory':'prodSubCategory');
  const bridge=getProductSuggestions(cat,sub,skh.advancedCategories?.[cat]);
  suggestionRows=[];
  const add=(kind,name,values)=>{ if (typeof name==='string' && name && !/^(others?|nyingine)$/i.test(name) && !suggestionRows.some(x=>x.kind===kind&&key(x.name)===key(name))) suggestionRows.push({kind,name,value:Array.isArray(values)?values.join(', '):values || '',selectorType:/colou?r|rangi/i.test(name)?'color':'button'}); };
  Object.entries(bridge.options || {}).forEach(([n,v])=>add('option',n,v));
  (bridge.attributes || []).forEach(n=>{add('attribute',n,'');const row=suggestionRows.find(r=>r.kind==='attribute'&&r.name===n);if(row)row.guidance=bridge.attributeValues?.[n]?.join(' / ') || '';});
  (bridge.features || []).forEach(n=>add('feature',n,true));
  (bridge.filters || []).forEach(n=>{add('filter',n,'');const row=suggestionRows.find(r=>r.kind==='filter'&&r.name===n);if(row)row.attributeReference=(bridge.attributes||[]).includes(n);});
  (bridge.additionalInfo || []).forEach(n=>add('additional',typeof n==='string'?n:n.name,typeof n==='object'?n.value:''));
  (bridge.suggestedUnits || []).forEach(n=>add('unit',n,n));
  $('productBuilder').dataset.schema=bridge.profileId || bridge.source;
  let hint=$('spbSchemaHint');if(!hint){hint=document.createElement('p');hint.id='spbSchemaHint';$('spbSuggestions').before(hint);}
  hint.textContent=cat+' → '+sub+' · '+(bridge.variantCapableFields.length?'Optional selector recommendations: '+bridge.variantCapableFields.join(', '):'No evidenced selector recommendation; simple products can be saved.')+' · Images are optional unless an explicit source rule applies. Accepted fields are kept; remove fields you no longer need.';
  if(bridge.unitGuidance)hint.textContent+=' '+bridge.unitGuidance.note;
  // Source gaps remain in schema provenance/audit, not a false seller validation error.
  $('spbSuggestions').innerHTML=suggestionRows.map((r,i)=>`<div class="spb-row"><span><small>${r.kind==='option'?'Selector':esc(r.kind)}</small><b>${esc(r.name)}</b>${r.guidance?`<small>Suggested values (choose or customize): ${esc(r.guidance)}</small>`:''}</span>${btn('suggest-use','Use',i)}${btn('suggest-edit','Edit',i)}${btn('suggest-skip','Skip',i)}</div>`).join('') || '<p class="spb-empty">Add custom fields below. Taxonomy is guidance, not a restriction.</p>';
}
function previewOther() {
  const r=suggestCustom(value('spbOtherInput')); if(!r){notice('Andika custom input kwanza.',true);return;}
  $('spbOtherPreview').innerHTML=`<div class="spb-card"><b>Preview · ${r.kind==='option'?'Selector':esc(r.kind)} → ${esc(r.name)}</b><p>${esc(r.value)}</p>${btn('other-use','Use')}${btn('other-edit','Edit')}${btn('other-skip','Skip')}${btn('other-remove','Remove')}</div>`;
}
function useSuggestion(r, edit=false) {
  if (!r) return;
  if(r.kind==='filter'){const a=state.attributes.find(a=>key(a.name)===key(r.name)||key(a.filterKey)===key(r.name));if(a&&!edit){a.filterable=true;render();return;}if(r.attributeReference){showEditor('attribute',a?state.attributes.indexOf(a):-1,a?{}:{name:r.name,value:'',filterable:true});return;}filterEditor();$('spbFilterName').value=r.name;if(a)$('spbFilterValue').value=Array.isArray(a.value)?a.value.join(', '):String(a.value);return;}
  if(r.kind==='unit'){
    const id=mode==='edit'?'editBaseUnit':'prodBaseUnit';
    editor('Suggested unit',input('spbSuggestedUnit','Unit',r.name),()=>{const el=$(id),v=value('spbSuggestedUnit');if(!v)throw Error('Unit required');if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v))el.add(new Option(v,v));el.value=v;});return;
  }
  if (edit || r.value==='' || r.kind==='option' && !r.value) {showEditor(r.kind,-1,r);return;}
  const fields={option:'options',attribute:'attributes',feature:'features',additional:'additionalInfo'}, field=fields[r.kind];
  if(state[field].some(a=>key(a.name)===key(r.name))) {notice('Tayari ipo: '+r.name+'. Tumia Edit.',true);return;}
  if(r.kind==='option') { state.options.push({id:uid('selector'),name:r.name,selectorType:r.selectorType||'button',display:true,values:String(r.value).split(',').map(v=>({id:uid('value'),value:v.trim(),label:v.trim(),images:[]}))}); state.selectorsDirty=true; }
  else state[field].push({id:uid(r.kind),name:r.name,value:r.value,type:'text',display:true,source:'SUGGESTION',filterable:false});
  render();
}
async function attach(target) {
  const inputEl=document.createElement('input'); inputEl.type='file'; inputEl.accept='image/*'; inputEl.multiple=true; inputEl.id=uid('spbImage'); inputEl.hidden=true;
  const version=session;
  inputEl.onchange=async()=>{
    if(!inputEl.files?.length){inputEl.remove();return;}
    const count=inputEl.files.length;
    if(count>6){notice('Chagua picha zisizozidi 6 kwa wakati mmoja.',true);inputEl.remove();return;}
    pending++; notice('Inapakia picha… subiri kabla ya save.');
    try {
      const urls=imageList(await window.skhUploadPicked(inputEl.id,6));
      if(urls.length!==count)throw Error('Baadhi ya picha hazikupakiwa. Jaribu tena; data yako imebaki.');
      if(version!==session) return;
      if(target==='general')state.images=[...new Set([...state.images,...urls])].slice(0,6);
      else target.images=[...new Set([...imageList(target.images),...urls])].slice(0,6);
      notice('Picha zimeongezwa. Save ili kuhifadhi kwenye bidhaa.');render();
    } catch(e){notice('Image upload failed: '+e.message,true);} finally{pending--;inputEl.remove();}
  };
  inputEl.addEventListener('cancel',()=>inputEl.remove(),{once:true}); document.body.appendChild(inputEl);inputEl.click();
}
function targetFor(parts) { return parts[0]==='value'?state.options[Number(parts[1])]?.values[Number(parts[2])]:state.variants[Number(parts[1])]; }
function action(event) {
  const el=event.target.closest('[data-spb]'); if(!el || !el.closest('#productBuilder,#spbEditFields')) return;
  const a=el.dataset.spb, indices=el.dataset.index.split(':'), i=Number(indices[0]), j=Number(indices[1]);
  try {
    if(a==='edit-option')showEditor('option',i);
    else if(a==='add-value')editValue(i);
    else if(a==='edit-value')editValue(i,j);
    else if(a==='edit-variant')manual(i);
    else if(a==='remove-option' || a==='remove-value') {
      const o=state.options[i], val=o.values[j]?.value;
      if(state.variants.some(v=>!v.removed && Object.hasOwn(v.options,o.name) && (a==='remove-option' || v.options[o.name]===val)))throw Error('Remove combinations zinazotumia selector/value hii kwanza.');
      a==='remove-option'?state.options.splice(i,1):o.values.splice(j,1);state.selectorsDirty=true;render();
    } else if(/^(up|down)-(option|value)$/.test(a)) {
      const list=a.endsWith('option')?state.options:state.options[i].values, pos=a.endsWith('option')?i:j, to=pos+(a.startsWith('up')?-1:1);
      if(to>=0&&to<list.length)[list[pos],list[to]]=[list[to],list[pos]];render();
    } else if(a==='remove-variant') {
      const row=state.variants[i];
      if(array(state.original.variantCombinations).some(v=>v.variantId===row.variantId)) { row.removed=true;row.status='INACTIVE';row.available=false;notice('Imeondolewa kwenye buyer choices. Identity imehifadhiwa kwa POS history/returns.'); }
      else state.variants.splice(i,1);
      state.variantsDirty=true;render();
    } else if(a==='attach')attach(targetFor(indices));
    else if(a==='remove-image'){const target=targetFor(indices);target.images.splice(Number(indices.at(-1)),1);render();}
    else if(a==='remove-general'){state.images.splice(i,1);render();}
    else if(a==='up-general'){[state.images[i-1],state.images[i]]=[state.images[i],state.images[i-1]];render();}
    else if(a==='edit-filter')filterEditor(i);
    else if(a==='remove-filter'){delete state.filters[Object.keys(state.filters)[i]];render();}
    else if(/^(edit|remove)-(attribute|feature|additional)$/.test(a)) {
      const kind=a.split('-')[1],field={attribute:'attributes',feature:'features',additional:'additionalInfo'}[kind];
      if(a.startsWith('edit'))showEditor(kind,i);else{state[field].splice(i,1);render();}
    } else if(a.startsWith('suggest-')) { if(a!=='suggest-skip')useSuggestion(suggestionRows[i],a==='suggest-edit');el.closest('.spb-row').remove(); }
    else if(a.startsWith('other-')) { if(a==='other-use'||a==='other-edit')useSuggestion(suggestCustom(value('spbOtherInput')),a==='other-edit');$('spbOtherPreview').innerHTML=''; }
  } catch(e){notice(e.message,true);}
}
function readChange(event) {
  const el=event.target;
  if(el.id==='spbProductSku')state.productSku=el.value.trim();
  if(el.hasAttribute('data-filter-attr')){state.attributes[Number(el.dataset.filterAttr)].filterable=el.checked;exportState();}
  if(el.hasAttribute('data-field')) {
    const row=state.variants[Number(el.dataset.row)], field=el.dataset.field;
    if(field==='enabled'){row.status=el.checked?'ACTIVE':'INACTIVE';row.available=el.checked;}
    else if(field==='stockDelta')state.stockDeltas[row.variantId]=Number(el.value);
    else row[field]=['price','stock'].includes(field)?(el.value===''?'':Number(el.value)):el.value.trim();
    state.variantsDirty=true;exportState();
  }
}
function legacyOptions(product) {
  let defs=product.variants;
  if(typeof defs==='string')defs=skh.normalizeProductVariants(defs);
  if(defs && !Array.isArray(defs))defs=Object.entries(defs).map(([name,values])=>({name,values:Array.isArray(values)?values:values.options || values.values}));
  let options=normalizeOptions(array(defs).filter(v=>v.name && Array.isArray(v.options || v.values)));
  if(!options.length) {
    const map={}; array(product.variantCombinations || product.variantsStructured).forEach(v=>Object.entries(v.options || {}).forEach(([k,val])=>{(map[k] ||= new Set()).add(val);}));
    options=normalizeOptions(Object.entries(map).map(([name,values])=>({name,values:[...values]})));
  }
  return options;
}
function load(product={}, target='create') {
  if(pending)throw Error('Subiri picha zimalize kupakiwa.');
  session++;
  if(target==='edit' && mode==='create') createState=state;
  mode=target;
  state={...empty(),original:copy(product),productSku:product.sku || '',metadataVersion:Number(product.builderRevision)||0,options:normalizeOptions(product.options),attributes:normalizeAttributes(product.attributes),features:normalizeFeatures(product.features),additionalInfo:normalizeAdditionalInfo(product.additionalInfo || product.others),images:imageList(product.imagesArray || product.images || product.image || product.photo),canonical:Array.isArray(product.variantCombinations) || !Array.isArray(product.variantsStructured)};
  if(!state.options.length)state.options=legacyOptions(product);
  state.variants=copy(array(product.variantCombinations || product.variantsStructured)).map(v=>({...v,images:imageList(v.images || v.imageRefs || v.image)}));
  state.filters=copy(product.filters || {});
  state.attributes.filter(a=>a.filterable).forEach(a=>{delete state.filters[a.filterKey];delete state.filters[a.name];});
  $('spbEditFields').hidden=target!=='edit'; $('spbEditDraft').hidden=target!=='edit';
  $(target==='edit'?'spbEditMount':'spbCreateMount').appendChild($('productBuilder'));
  if(target==='edit')fillEdit(product);
  closeEditor();render();categorySuggestions();notice('');
}
function categoryLabel(v) { return typeof v==='object' && v ? v.name || v.label || v.id || '' : v || ''; }
function fillSelect(id,values,selected) { $(id).innerHTML=[...new Set(['',...values,selected].filter(v=>v!=null))].map(v=>`<option value="${esc(v)}">${esc(v || '— Select / Custom —')}</option>`).join('');$(id).value=selected || ''; }
function fillEdit(p) {
  const category=categoryLabel(p.category), sub=categoryLabel(p.subCategory ?? p.subcategory);
  const categories=getSellerCategoryOptions(skh.advancedCategories);
  fillSelect('editCategory',categories.map(c=>c.value),category);
  for(const option of $('editCategory').options)option.textContent=categories.find(c=>c.value===option.value)?.label||option.textContent;
  fillSelect('editSubCategory',getSellerSubcategories(category,skh.advancedCategories),sub);
  const values={editBuyPrice:p.buyPrice ?? 0,editWholesalePrice:p.wholesalePrice ?? 0,editBarcode:p.barcode || '',editBaseUnit:p.baseUnit || 'Piece',editStock:p.stock ?? 0,editStockDelta:0,editLowStock:p.lowStockThreshold ?? p.lowStockAlert ?? 3,editVisibility:p.isOnline===false?'offline_only':p.isOffline===false?'online_only':'hybrid',editCustomCategory:'',editBulkUnit:p.bulkUnit || '',editConversionRatio:p.conversionRatio || 1};
  Object.entries(values).forEach(([id,val])=>{$(id).value=val;});$('editHasBulk').checked=!!p.hasBulkPackaging;
}
function integer(n,label) { if(!Number.isSafeInteger(Number(n)) || Number(n)<0)throw Error(label+' lazima iwe namba kamili ≥ 0.');return Number(n); }
function collect(productId, fresh=state.original) {
  if(pending)throw Error('Picha bado zinapakiwa. Subiri.');
  if(!$('spbEditor').hidden)throw Error('Use / Save au Cancel field unayohariri kwanza.');
  if(mode==='edit' && Number(fresh.builderRevision || 0)!==state.metadataVersion)throw Error('Bidhaa imehaririwa sehemu nyingine. Fungua Edit tena kabla ya save.');
  state.options.forEach((o,i)=>{requireName(o.name,state.options,i);if(!o.values.length)throw Error('Selector '+o.name+' haina values. Ongeza values au Remove.');});
  const patch={attributes:state.attributes,options:state.options,features:state.features,additionalInfo:state.additionalInfo,filters:normalizeFilters(state.filters,state.attributes),builderRevision:state.metadataVersion+1};
  if(state.original.sku || state.productSku)patch.sku=state.original.sku || state.productSku;
  const offlineCreate=mode==='create'&&value('prodVisibility')==='offline_only';
  const chosenCategory=offlineCreate?(value('prodOfflineCategory')||'Mchanganyiko'):value(mode==='edit'?'editCustomCategory':'') || value(mode==='edit'?'editCategory':'prodCategory');
  const chosenLeaf=offlineCreate?'N/A':value(mode==='edit'?'editSubCategory':'prodSubCategory');
  const schema=getProductSuggestions(chosenCategory,chosenLeaf,skh.advancedCategories?.[chosenCategory]);
  // Read-only provenance through the existing writer, not buyer/stock authority.
  // Don't rewrite legacy taxonomy or invent a canonical subcategory ID.
  if(schema.schemaReference)patch.schemaReference=schema.schemaReference;
  else if(state.original.schemaReference)patch.schemaReference={inputCategory:chosenCategory,inputLeaf:chosenLeaf,mapping:'UNREVIEWED_PATH',canonicalCategoryId:schema.canonicalRef.categoryId||null,canonicalLeaf:null};
  if(state.selectorsDirty || state.variantsDirty || !Object.hasOwn(state.original,'variants'))patch.variants=state.options.map(o=>({name:o.name,options:o.values.map(v=>v.value)}));
  const identities=new Set(), combinations=new Set(),skus=new Set();
  const rows=state.variants.map(v=>{
    const previous=array(fresh.variantCombinations).find(x=>x.variantId===v.variantId);
    const row={...v};
    if(!row.variantId)row.variantId=uid();
    if(identities.has(row.variantId))throw Error('Duplicate variant identity.');identities.add(row.variantId);
    if(!row.removed) {
      const sig=combinationKey(row.options);if(combinations.has(sig))throw Error('Duplicate combination.');combinations.add(sig);
      if(state.options.some(o=>!o.values.some(val=>val.value===row.options[o.name])) || Object.keys(row.options).length!==state.options.length)throw Error('Combination haijakamilika. Edit selectors za kila row.');
    }
    if(!state.canonical) {
      const liveLegacy = array(fresh.variantsStructured).find(x=>x.variantId===row.variantId);
      if (liveLegacy && Object.hasOwn(liveLegacy,'stock')) row.stock=liveLegacy.stock;
      else delete row.stock;
    }
    if(state.canonical) {
      row.sku=previous?.sku || row.sku?.trim();row.unitId=previous?.unitId || row.unitId?.trim();
      if(!row.sku || !row.unitId)throw Error('Kila combination inahitaji SKU na unit.');
      if(skus.has(row.sku))throw Error('Duplicate SKU.');skus.add(row.sku);
      row.price=Number(row.price || basePrice());if(!Number.isFinite(row.price)||row.price<=0)throw Error('Weka bei halali kwenye kila combination.');
      integer(row.stock,'Variant stock');row.stock=previous?.stock ?? 0;
      row.inventoryKey=previous?.inventoryKey || row.inventoryKey || `${productId}:${row.variantId}:${row.unitId}`;
      row.status=row.status==='ACTIVE' && row.available!==false && !row.removed?'ACTIVE':'INACTIVE';row.available=row.status==='ACTIVE';
    }
    return row;
  });
  // Preserve identities created in another tab; never overwrite live stock with form stock.
  if(state.canonical)array(fresh.variantCombinations).forEach(v=>{if(!rows.some(r=>r.variantId===v.variantId))rows.push(v);});
  if(rows.length || Object.hasOwn(state.original,state.canonical?'variantCombinations':'variantsStructured'))patch[state.canonical?'variantCombinations':'variantsStructured']=rows;
  if(mode==='edit') {
    const cat=value('editCustomCategory') || value('editCategory');
    patch.category=cat===categoryLabel(state.original.category)?state.original.category:cat;
    const sub=value('editSubCategory');patch.subCategory=sub===categoryLabel(state.original.subCategory)?state.original.subCategory:sub;
    if(Object.hasOwn(state.original,'subcategory'))patch.subcategory=sub;
    const vis=value('editVisibility');patch.isOnline=vis!=='offline_only';patch.isOffline=vis!=='online_only';
    patch.buyPrice=Number(value('editBuyPrice'));patch.wholesalePrice=Number(value('editWholesalePrice'));
    patch.baseUnit=value('editBaseUnit');patch.barcode=value('editBarcode');patch.lowStockThreshold=integer(value('editLowStock'),'Low stock');patch.lowStockAlert=patch.lowStockThreshold;
    patch.hasBulkPackaging=$('editHasBulk').checked;patch.bulkUnit=value('editBulkUnit');patch.conversionRatio=integer(value('editConversionRatio'),'Ratio');
    if(patch.hasBulkPackaging && patch.conversionRatio<1)throw Error('Conversion ratio lazima iwe ≥ 1.');
    if(!Number.isFinite(patch.buyPrice)||patch.buyPrice<0||!Number.isFinite(patch.wholesalePrice)||patch.wholesalePrice<0)throw Error('Bei si halali.');
    patch.imagesArray=state.images;patch.image=state.images[0] || '';
    if(value('editPublicationStatus')==='published' && !state.images.length)throw Error('Weka angalau picha moja kabla ya publish.');
  }
  return copy(patch);
}
function stockRequests(productId, opening=false) {
  const requests=[];
  state.variants.forEach(v=>{
    const existing=array(state.original.variantCombinations).find(x=>x.variantId===v.variantId);
    const delta=opening || !existing?Number(v.stock) || 0:Number(state.stockDeltas[v.variantId]) || 0;
    if(!Number.isSafeInteger(delta))throw Error('Stock adjustment lazima iwe namba kamili.');
    if(!existing && delta<0)throw Error('Opening stock haiwezi kuwa hasi.');
    if(delta && state.canonical)requests.push({productId,variantId:v.variantId,sku:existing?.sku || v.sku,unitId:existing?.unitId || v.unitId,inventoryKey:existing?.inventoryKey || `${productId}:${v.variantId}:${v.unitId}`,delta,movementType:opening?'OPENING_BALANCE':'ADJUSTMENT',source:opening?'PRODUCT_CREATION':'PRODUCT_EDIT',reason:opening?'Variant opening stock':'Seller variant stock adjustment',idempotencyKey:opening?'opening-'+productId+'-'+v.variantId:(state.adjustmentSession ||= uid('edit'))+'-'+v.variantId});
  });
  if(!opening) {
    const delta=Number(value('editStockDelta'))||0;if(!Number.isSafeInteger(delta))throw Error('Stock adjustment lazima iwe namba kamili.');
    if(delta)requests.push({productId,delta,movementType:'ADJUSTMENT',source:'PRODUCT_EDIT',reason:'Seller product stock adjustment',idempotencyKey:(state.adjustmentSession ||= uid('edit'))+'-base'});
  }
  return requests;
}
function resumeCreate() { if(mode==='edit'){session++;mode='create';state=createState || empty();createState=null;$('spbCreateMount').appendChild($('productBuilder'));closeEditor();render();categorySuggestions();} }
function bind() {
  if(!$('productBuilder') || $('productBuilder').dataset.bound)return;
  $('productBuilder').dataset.bound='1';
  $('spbSkipVariants')?.addEventListener('click',()=>{if(state.options.length||state.variants.length)return;closeEditor();notice('Simple product selected. No selectors or combinations are required.');render();});
  const bindings={spbAddOption:()=>showEditor('option'),spbAddAttribute:()=>showEditor('attribute'),spbAddFeature:()=>showEditor('feature'),spbAddAdditional:()=>showEditor('additional'),spbAddFilter:()=>filterEditor(),spbGenerate:generate,spbManualVariant:()=>manual(),spbSuggestOther:previewOther,spbAddGeneralImage:()=>attach('general')};
  Object.entries(bindings).forEach(([id,fn])=>$(id).addEventListener('click',fn));
  document.addEventListener('click',action);$('productBuilder').addEventListener('input',readChange);
  ['prodCategory','prodSubCategory','editCategory','editSubCategory'].forEach(id=>$(id)?.addEventListener('change',()=>{
    if(id==='editCategory')fillSelect('editSubCategory',getSellerSubcategories(value(id),skh.advancedCategories),'');
    categorySuggestions();
  }));
  // Bubble after existing target/inline category handlers finish rebuilding options.
  document.addEventListener('change',event=>{if(event.target.id==='prodCategory'){const el=$('prodSubCategory'),cat=value('prodCategory');if(!skh.advancedCategories?.[cat]){el.innerHTML='';el.add(new Option('— Select —',''));}const leaves=getSellerSubcategories(cat,skh.advancedCategories);for(const leaf of leaves)if(![...el.options].some(o=>o.value===leaf))el.add(new Option(leaf,leaf));if(leaves.length)$('subCategoryContainer').style.display='block';el.disabled=false;categorySuggestions();}});
  new MutationObserver(()=>{if($('sellerForm').style.display && $('sellerForm').style.display!=='none')resumeCreate();}).observe($('sellerForm'),{attributes:true,attributeFilter:['style']});
  $('sellerForm').addEventListener('reset',()=>{if(mode==='create'){state=empty();session++;closeEditor();render();notice('');}});
  $('spbSaveDraft').addEventListener('click',()=>{$('prodPublicationStatus').value='draft';});
  $('btnSeller').addEventListener('click',()=>{if($('prodPublicationStatus').value==='draft')notice('Saving draft. Chagua Published ili kuchapisha.');});
  $('spbEditDraft').addEventListener('click',()=>{$('editPublicationStatus').value='draft';});
  render();categorySuggestions();
}
window.skhProductBuilder={load,collect,stockRequests,resumeCreate,hasPending:()=>pending>0,afterMetadata:()=>{state.metadataVersion++;},getOriginal:()=>copy(state.original)};
window.skhProductBuilderReset=()=>{state=empty();session++;closeEditor();render();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();

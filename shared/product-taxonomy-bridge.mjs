import projection from './product-taxonomy-browser.mjs';
// Reviewed schema overlays are OPTIONAL dependencies. They are authoritative when
// present, but they are not reconstructed here when absent: the two source modules
// (product-schema-pilots.mjs / product-schema-refinements.mjs) were never committed
// and remain an explicit blocker. When missing we degrade to canonical-only routing
// and report it through schemaOverlayStatus — we never substitute invented data.
let productSchemaPilots = [];
let schemaRefinements = {};
let schemaBatchForCategory = {};
let reviewedLiveLeafAliases = [];
const schemaOverlayStatus = { pilots: 'MISSING', refinements: 'MISSING', degraded: true };
try {
  const m = await import('./product-schema-pilots.mjs');
  productSchemaPilots = m.productSchemaPilots || [];
  schemaOverlayStatus.pilots = 'LOADED';
} catch { /* explicit blocker: module absent from repository */ }
try {
  const m = await import('./product-schema-refinements.mjs');
  schemaRefinements = m.schemaRefinements || {};
  schemaBatchForCategory = m.schemaBatchForCategory || {};
  reviewedLiveLeafAliases = m.reviewedLiveLeafAliases || [];
  schemaOverlayStatus.refinements = 'LOADED';
} catch { /* explicit blocker: module absent from repository */ }
schemaOverlayStatus.degraded = schemaOverlayStatus.pilots !== 'LOADED' || schemaOverlayStatus.refinements !== 'LOADED';
export { schemaOverlayStatus };
const norm=value=>String(value||'').trim().toLowerCase();
// A canonical field counts as "defined" only when it carries real meaning, so an
// empty array/object/string still allows legacy compatibility data to fill the gap.
const defined=value=>{
 if(value===undefined||value===null||value==='')return false;
 if(Array.isArray(value))return value.length>0;
 if(typeof value==='object')return Object.keys(value).length>0;
 return true;
};
const clean=list=>(Array.isArray(list)?list:[]).filter(x=>! /^(others?|nyingine)$/i.test(typeof x==='string'?x:x?.name||''));
function categoryIdFor(value){return projection.categories.find(c=>[c.id,c.displayName,c.name].some(n=>n&&norm(n)===norm(value)))?.id || projection.mappings[value] || null;}
function getProductSuggestions(category,subcategory,liveConfig=null){
 const categoryId=categoryIdFor(category);
 const pilot=productSchemaPilots.find(p=>p.categories.some(c=>norm(c)===norm(category))&&p.branches.some(s=>norm(s)===norm(subcategory)));
 const alias=reviewedLiveLeafAliases.find(a=>norm(a[0])===norm(category)&&norm(a[1])===norm(subcategory));
 const ref=pilot?.canonicalRef || (alias?{categoryId:alias[2],subcategory:alias[3]}:{categoryId,subcategory});
 const definitions=projection.categories.find(c=>c.id===ref.categoryId)?.definitions;
 const canonical=definitions?.[ref.subcategory||'default'] || definitions?.default;
 const live=liveConfig?.subcategories?.[subcategory];
 // PRECEDENCE: canonical → legacy compatibility → explicit reviewed overlay.
 // Canonical is the authoritative visible schema. A legacy live hint may only FILL a
 // field canonical does not define; it can no longer silently replace a source-backed
 // canonical definition. Pilot profiles stay authoritative because they are explicit,
 // reviewed leaf overlays. Saved product data is never read or migrated here.
 const canonicalBase=canonical||{};
 const legacyFill={},legacyFillFields=[],legacySuppressed=[];
 for(const [key,value] of Object.entries(live||{})){
  if(defined(canonicalBase[key])){legacySuppressed.push(key);continue;}
  legacyFill[key]=value;legacyFillFields.push(key);
 }
 const base={...canonicalBase,...legacyFill,...(pilot||{})};
 const options=Object.fromEntries(Object.entries(base.options||{}).filter(([k])=>! /^(others?|nyingine)$/i.test(k)));
 // Canonical wins the source label whenever a canonical definition exists; a legacy
 // hint is only reported as the source when canonical defines nothing for the leaf.
 const result={source:pilot?'PILOT_SCHEMA':canonical?'CANONICAL':live?'LEGACY_LIVE':'GENERIC_FALLBACK',
  taxonomyPrecedence:{order:'CANONICAL_THEN_LEGACY_THEN_REVIEWED_OVERLAY',canonicalDefined:!!canonical,legacyFillFields,legacySuppressedFields:legacySuppressed,overlayStatus:schemaOverlayStatus},
  categoryId:categoryId||ref.categoryId,canonicalRef:ref,profileId:pilot?.id||null,schemaVersion:1,
  definitionState:base.definitionState||'SUGGESTED',options,attributes:clean(base.attributes||live?.filters),filters:clean(base.filters),features:clean(base.features),additionalInfo:clean(base.additionalInfo),
  suggestedUnits:clean(base.suggestedUnits||base.stockTypes),variantRule:base.variantRule||null,variantCapableFields:clean(base.variantCapableFields||base.variantRule?.candidates||Object.keys(options)),mediaRequirements:base.mediaRequirements||{required:false,product:{min:0},selectorValues:[],variantImages:true}};
 return resolveSchemaRoles(result,base,definitions,ref,pilot,{category,subcategory,alias});
}
const unique=values=>[...new Set(clean(values))];
const productFilters={Price:'price',Distance:'location',Location:'location',Availability:'availabilityStatus',Brand:'brand',Condition:'condition',Quantity:'stock',Unit:'baseUnit', 'Product Type':'productType'};
function resolveSchemaRoles(result,base,definitions,ref,pilot,input){
 const context=projection.branchContexts?.[ref.categoryId]?.[ref.subcategory];
 if(context && context!=='PRODUCT')return {...result,source:'CONTEXT_ONLY',completionState:'NOT_PRODUCT',options:{},attributes:[],filters:[],features:[],additionalInfo:[],suggestedUnits:[],variantCapableFields:[],variantRule:{mode:'NONE',candidates:[]}};
 const exact=definitions?.[ref.subcategory], partial=exact?.status==='PARTIAL';
 const review=schemaRefinements[ref.categoryId]?.find(r=>r[0]===ref.subcategory);
 if(!review){
  // Hierarchy coverage is not semantic evidence. Category defaults must never
  // become leaf recommendations on newly exposed canonical paths. Persisted
  // product state and seller custom additions are untouched.
  const canonicalPath=projection.productLeaves?.[ref.categoryId]?.includes(ref.subcategory);
  if(canonicalPath&&!pilot){
   const usable=exact&&(exact.status!=='PARTIAL'||exact.fieldEvidenceVerified===true);
   if(!usable)result={...result,options:{},attributes:[],attributeValues:{},filters:[],features:[],additionalInfo:[],suggestedUnits:[],variantCapableFields:[],variantRule:{mode:'UNSPECIFIED',candidates:[]},
    mediaRequirements:{required:false,product:{min:0},selectorValues:[],variantImages:true,recommendedViews:[],evidence:'UNSPECIFIED'}};
   result.schemaReference={canonicalCategoryId:ref.categoryId,canonicalLeaf:ref.subcategory,inputCategory:input.category,inputLeaf:input.subcategory,mapping:input.alias?'REVIEWED_LEAF_ALIAS':'CANONICAL_PATH'};
  }
  // An unreviewed exact canonical enum remains informational. Existing pilots
  // and legacy-only schemas keep their separate, already reviewed behavior.
  if(exact&&!partial&&!pilot){
   const evidence=classifyVariantEvidence(exact),names=evidence.candidates;
   const informational=Object.entries(exact.options||{}).filter(([name])=>!names.includes(name));
   result={...result,options:Object.fromEntries(names.map(name=>[name,clean(exact.options?.[name]||[])])),variantCapableFields:[...names],
    attributes:unique([...(exact.attributes||[]),...informational.map(([name])=>name)]).filter(name=>!names.includes(name)),attributeValues:Object.fromEntries(informational),
    variantRule:evidence.recommendedRule||{mode:'UNSPECIFIED',candidates:[]}};
  }
  // A filter is a reference, never an independent duplicate attribute authority.
  result.filterMappings=unique(result.filters||[]).map(name=>({name,field:name,source:Object.hasOwn(result.options||{},name)?'SELECTOR':result.attributes.includes(name)?'ATTRIBUTE':result.features.includes(name)?'FEATURE':productFilters[name]?'PRODUCT':'UNRESOLVED'}));
  result.filters=unique(result.filterMappings.filter(f=>f.source==='ATTRIBUTE').map(f=>f.field));
  result.schemaGaps=(result.filterMappings||[]).filter(f=>f.source==='UNRESOLVED').map(f=>'FILTER_UNRESOLVED:'+f.name);
  return {...result,completionState:pilot?'PILOT':partial?'EXPLICIT_INCOMPLETE':exact?'EXACT_REQUIRES_REVIEW':definitions?.default?'INHERITED_REQUIRES_REVIEW':'UNMAPPED_LIVE'};
 }
 const [,names,units,additionalFields,aliases={},overrides={}]=review;
 result={...result,source:'REVIEWED_SCHEMA',profileId:ref.categoryId+':'+ref.subcategory,completionState:'REVIEWED_BATCH',batch:schemaBatchForCategory[ref.categoryId],suggestedUnits:[...units],additionalInfo:[...additionalFields],features:clean(exact.features),
  provenance:{definition:'canonical-taxonomy-data.js',path:[ref.categoryId,ref.subcategory],review:'product-schema-refinements.mjs',status:'ENGINE_REVIEWED_SELLER_CONFIRMATION_REQUIRED'}};
 // Preserve live-only filter information in the resolution audit, never
 // promote it to variant candidates. This does not write or migrate previously saved data.
 const liveFilters=clean(base.filters);
 result.schemaGaps=[];
 base=exact;
 const additional=clean(result.additionalInfo).map(x=>typeof x==='string'?x:x.name);
 const informational=Object.entries(base.options||{}).filter(([k])=>!names.includes(k));
 result.options=Object.fromEntries(names.map(n=>[n,clean(Object.hasOwn(overrides,n)?overrides[n]:base.options?.[n]||[])]));
 result.attributes=unique([...(base.attributes||result.attributes||[]),...informational.map(([n])=>aliases[n]||n)]).filter(n=>!names.includes(n)&&!additional.includes(n)&&!['Unit','Quantity'].includes(n));
 result.attributeValues=Object.fromEntries(informational.map(([n,v])=>[aliases[n]||n,clean(v)]));
 result.variantCapableFields=names.slice();
 result.features=result.features.filter(n=>!result.attributes.includes(aliases[n]||n)&&!names.includes(n));
 const rule=base.variantRule && !Array.isArray(base.variantRule)?base.variantRule:{};
 result.variantRule={...rule,mode:names.length?'OPTIONAL':'NONE',candidates:names.slice(),nonVariantAttributes:unique([...result.attributes,...clean(rule.nonVariantAttributes)]),combinationPolicy:'SELLER_REVIEWED_CARTESIAN_OR_MANUAL',automaticEnable:false,requireSkuPriceStockIdentity:true};
 result.filterMappings=unique([...(base.filters||[]),...liveFilters]).map(name=>{
  const field=aliases[name]||name;
  const source=names.includes(field)?'SELECTOR':result.attributes.includes(field)?'ATTRIBUTE':additional.includes(field)?'ADDITIONAL':result.features.includes(field)?'FEATURE':productFilters[field]?'PRODUCT':'UNRESOLVED';
  return {name,field:source==='PRODUCT'?productFilters[field]:field,source};
 });
 // Form recommendations only link to supported attribute sources; selector values
 // and native product properties remain their source, never duplicate free text.
 result.filters=result.filterMappings.filter(f=>f.source==='ATTRIBUTE').map(f=>f.field);
 result.schemaGaps=result.filterMappings.filter(f=>f.source==='UNRESOLVED').map(f=>'FILTER_UNRESOLVED:'+f.name);
 result.featureState=result.features.length?'SELLER_DECLARED':'NONE_RECOMMENDED';
 if(review)result.mediaRequirements={required:false,product:{min:0},selectorValues:names.filter(n=>n==='Color'),variantImages:true,recommendedViews:[],evidence:'UNSPECIFIED',claims:'Only claim features you can support; photos do not certify a product.'};
 // New evidence-reviewed batches distinguish integration review from source
 // completeness. Empty candidates are not a declaration forbidding variants.
 if(result.batch!=='A'){
  result.inputCategory=input.category;result.inputLeaf=input.subcategory;result.mapping=input.alias?'REVIEWED_LEAF_ALIAS':categoryIdFor(input.category)===ref.categoryId?(projection.mappings[input.category]?'LEGACY_CATEGORY_EXACT_CANONICAL_LEAF':'CANONICAL_PATH'):'UNMAPPED';
  const mode=rule.mode || 'UNSPECIFIED';
  result.variantRule.mode=names.length?mode:['NONE','NO_VARIANTS'].includes(mode)?mode:'UNSPECIFIED';
  if(result.variantRule.mode==='UNSPECIFIED')result.schemaGaps.push('GAP — variant rule required');
  result.completionState='REVIEWED_WITH_GAPS';
  result.mediaRequirements={required:false,product:{min:0},selectorValues:[],variantImages:true,recommendedViews:[],evidence:'UNSPECIFIED'};
  result.schemaGaps.push('MEDIA_GUIDANCE_UNSPECIFIED');
  if(!units.length)result.schemaGaps.push('GAP — selling unit guidance required');
  result.schemaReference={canonicalCategoryId:ref.categoryId,canonicalLeaf:ref.subcategory,inputCategory:result.inputCategory,inputLeaf:result.inputLeaf,mapping:result.mapping,batch:result.batch};
 }
 result.unitGuidance={kind:'SELLER_CONFIRMED_LABELS',conversion:'NOT_DEFINED_BY_SCHEMA',note:units.length?'Package Size/Weight options are labels, not stock conversions. Confirm selling unit and existing packaging ratio separately; stock authority is unchanged.':'No category selling-unit recommendation is available. Choose your selling unit in the stock form; a measurement attribute does not define a stock conversion.'};
 return result;
}
// Add reviewed paths to seller controls only. Never mutate the live catalog object
// or relabel existing options/products; only validated canonical paths are exposed.
// CANONICAL FIRST. The visible Product Builder taxonomy is the canonical registry.
// Legacy-only categories are retained for backward compatibility but are listed after
// canonical, tagged LEGACY_COMPATIBILITY, and never duplicated when they already
// resolve to a canonical ID through taxonomy-legacy-mapping. Nothing here mutates
// skh.advancedCategories or reclassifies any saved product.
function getSellerCategoryOptions(live={}){
 const options=[];
 for(const [id,leaves] of Object.entries(projection.productLeaves||{})){
  if(!leaves.length)continue;
  const category=projection.categories.find(c=>c.id===id);
  if(category)options.push({value:id,label:category.displayName,source:'CANONICAL',canonicalId:id});
 }
 for(const value of Object.keys(live)){
  const id=categoryIdFor(value);
  // Already represented by its canonical route — do not show a duplicate entry.
  if(id&&options.some(o=>o.canonicalId===id))continue;
  if(options.some(o=>o.value===value))continue;
  options.push({value,label:value,source:'LEGACY_COMPATIBILITY',canonicalId:id||null});
 }
 return options;
}
// Canonical product leaves lead; legacy-only leaves follow for compatibility.
// unique() keeps the canonical occurrence when a leaf exists on both sides, so a
// canonical route always wins over an identically named legacy route.
function getSellerSubcategories(category,live={}){
 const id=categoryIdFor(category), existing=Object.keys(live[category]?.subcategories||{});
 return unique([...(projection.productLeaves?.[id]||[]),...existing]);
}
export {categoryIdFor,getProductSuggestions,getSellerSubcategories,getSellerCategoryOptions};

// Evidence classification only: never infer variant capability from enums,
// measurements, a live parent label, or a category-wide default.
function classifyVariantEvidence(definition, scope='EXACT') {
 const rule=definition?.variantRule;
 const unresolved=(reason)=>({classification:'UNSPECIFIED_REQUIRES_SOURCE_REVIEW',variantCapable:null,recommendedRule:null,candidates:[],reason,scope,confidence:'UNDETERMINED',source:'canonical.variantRule',unresolved:true});
 if(scope!=='EXACT'||!definition||definition.status==='PARTIAL')return unresolved('LEAF_DEFINITION_REQUIRED');
 if(Array.isArray(rule))return unresolved('MALFORMED_RULE_ARRAY');
 if(!rule||typeof rule!=='object')return unresolved('RULE_ABSENT');
 const candidates=Array.isArray(rule.candidates)?rule.candidates:[];
 if(['NONE','NO_VARIANTS'].includes(rule.mode)){
  if(candidates.length)return unresolved('CONFLICTING_RULE_AND_CANDIDATES');
  return {classification:'NON_VARIANT',variantCapable:false,recommendedRule:rule,candidates:[],reason:'EXPLICIT_NEGATIVE_RULE',scope,confidence:'SOURCE_EXPLICIT',source:'canonical.variantRule',unresolved:false};
 }
 if(['OPTIONAL','HAS_VARIANTS','REQUIRED'].includes(rule.mode)&&candidates.length)return {classification:rule.mode==='OPTIONAL'?'VARIANT_CAPABLE_BUT_OPTIONAL':'EXPLICIT_VARIANT',variantCapable:true,recommendedRule:rule,candidates:[...candidates],reason:'EXPLICIT_MODE_AND_CANDIDATES',scope,confidence:'SOURCE_EXPLICIT',source:'canonical.variantRule',unresolved:false};
 return unresolved(rule.mode==='UNSPECIFIED'&&!candidates.length?'UNSPECIFIED_NO_CANDIDATES':'INSUFFICIENT_RULE_EVIDENCE');
}
function classifyMediaEvidence(definition,scope='EXACT'){
 const media=definition?.mediaRequirements;
 if(scope!=='EXACT'||!media)return {classification:'UNSPECIFIED',scope,source:'canonical.mediaRequirements',unresolved:true};
 const classification=media.required===true?'REQUIRED':media.recommended===true||media.recommendedViews?.length?'RECOMMENDED':media.required===false?'OPTIONAL':'UNSPECIFIED';
 return {classification,scope,source:'canonical.mediaRequirements',unresolved:classification==='UNSPECIFIED'};
}
export {classifyVariantEvidence,classifyMediaEvidence};

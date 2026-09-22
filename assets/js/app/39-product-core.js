/* SOKOHAI PRODUCT FOUNDATION — one compatibility layer for the existing products collection.
   It reconciles legacy field names without creating a second product database or UI. */
const PUB = new Set(['draft','published','archived']);
const AVAIL = new Set(['available','low_stock','out_of_stock','pre_order','made_to_order','hidden']);
const TYPES = new Set(['physical','digital','wholesale','retail','used','new','custom','made_to_order']);
const CONDITIONS = new Set(['new','used','refurbished','not_applicable']);
const txt = v => String(v == null ? '' : v).trim();
const low = v => txt(v).toLowerCase();
const number = v => { const n=Number(v); return Number.isFinite(n)?n:0; };
const words = s => [...new Set(low(s).normalize('NFKD').replace(/[^a-z0-9\u00c0-\u024f]+/g,' ').split(/\s+/).filter(x=>x.length>1))].slice(0,80);

export function normalizeVariants(value){
  if(!value) return [];
  if(typeof value==='string') value=value.split(/\n|;/).map(row=>{const p=row.split(':');return {name:txt(p.shift()),options:p.join(':').split(',').map(txt).filter(Boolean)};});
  if(!Array.isArray(value)) return [];
  return value.map(v=>({name:txt(v&&v.name),options:[...new Set((Array.isArray(v&&v.options)?v.options:[]).map(txt).filter(Boolean))].slice(0,30)})).filter(v=>v.name&&v.options.length).slice(0,12);
}
export function publicationStatus(p){
  const explicit=low(p&&p.publicationStatus); if(PUB.has(explicit)) return explicit;
  const legacy=low(p&&p.status); if(['draft','archived','deleted','inactive'].includes(legacy)) return legacy==='draft'?'draft':'archived';
  return 'published';
}
export function availabilityStatus(p){
  const explicit=low(p&&p.availabilityStatus); if(AVAIL.has(explicit)) return explicit;
  if(p&&p.hidden===true) return 'hidden';
  if(low(p&&p.productType)==='made_to_order') return 'made_to_order';
  const stock=Number(p&&p.stock); if(Number.isFinite(stock)) return stock<=0?'out_of_stock':stock<=3?'low_stock':'available';
  return 'available';
}
export function productEligible(p){
  return !!p && publicationStatus(p)==='published' && !p.archivedAt && p.isOnline!==false && availabilityStatus(p)!=='hidden';
}
export function buildSearchMetadata(p){
  const attrs=p&&p.filters&&typeof p.filters==='object'?Object.entries(p.filters).flat():[];
  const variants=normalizeVariants(p&&p.variants).flatMap(v=>[v.name,...v.options]);
  const source=[p&&p.title,p&&p.brand,p&&p.model,p&&p.category,p&&p.subCategory,p&&p.description,p&&p.condition,...attrs,...variants,...(Array.isArray(p&&p.tags)?p.tags:[])].filter(Boolean).join(' ');
  return {version:1,text:low(source).slice(0,4000),tokens:words(source)};
}
export function validateProduct(p){
  const errors=[];
  if(txt(p&&p.title).length<2) errors.push('Jina la bidhaa linahitajika.');
  if(number(p&&p.price)<=0) errors.push('Bei lazima iwe namba kubwa kuliko sifuri.');
  if(!txt(p&&p.category)&&p&&p.isOnline!==false) errors.push('Kategoria inahitajika kwa bidhaa ya online.');
  if(number(p&&p.stock)<0) errors.push('Stock haiwezi kuwa hasi.');
  if(!txt(p&&p.location)&&low(p&&p.productType)!=='digital') errors.push('Eneo linahitajika kwa bidhaa ya physical.');
  const variants=normalizeVariants(p&&p.variants); if(variants.some(v=>!v.name||!v.options.length)) errors.push('Variants hazijakamilika.');
  return {ok:!errors.length,errors};
}
export function buildProductWrite(input){
  const p={...input};
  p.title=txt(p.title); p.price=number(p.price); p.stock=Math.max(0,number(p.stock));
  p.currency=txt(p.currency)||'TZS'; p.baseUnit=txt(p.baseUnit)||'Piece';
  p.productType=TYPES.has(low(p.productType))?low(p.productType):'physical';
  p.condition=CONDITIONS.has(low(p.condition))?low(p.condition):(p.productType==='digital'?'not_applicable':'new');
  p.publicationStatus=PUB.has(low(p.publicationStatus))?low(p.publicationStatus):'published';
  p.availabilityStatus=AVAIL.has(low(p.availabilityStatus))?low(p.availabilityStatus):availabilityStatus(p);
  p.status=p.publicationStatus==='published'?'active':p.publicationStatus;
  p.variants=normalizeVariants(p.variants);
  p.minimumOrderQuantity=Math.max(1,number(p.minimumOrderQuantity)||(p.saleMode==='wholesale'&&p.modeData?number(p.modeData.minQty):1));
  p.searchMetadata=buildSearchMetadata(p); p.schemaVersion=2; p.updatedAt=new Date().toISOString();
  return p;
}
export function scoreProduct(p,query){
  const q=low(query), tokens=words(q); if(!tokens.length) return 0;
  const title=low(p.title||p.name), brandModel=low([p.brand,p.model].join(' ')), cat=low([p.category,p.subCategory].join(' '));
  const attrs=low([p.searchMetadata&&p.searchMetadata.text,p.description,JSON.stringify(p.filters||{}),JSON.stringify(p.variants||[])].join(' '));
  let score=0,matched=0;
  if(title===q) score+=180; else if(title.startsWith(q)) score+=120; else if(title.includes(q)) score+=90;
  tokens.forEach(t=>{let hit=false;if(title.includes(t)){score+=45;hit=true;}if(brandModel.includes(t)){score+=30;hit=true;}if(cat.includes(t)){score+=18;hit=true;}if(attrs.includes(t)){score+=7;hit=true;}if(hit)matched++;});
  return matched===tokens.length?score+25:matched?score:0;
}
export function filterProducts(items,opts={}){
  const q=txt(opts.query); let out=(items||[]).filter(productEligible).filter(p=>!q||scoreProduct(p,q)>0);
  if(opts.category) out=out.filter(p=>low(p.category)===low(opts.category));
  if(opts.subCategory) out=out.filter(p=>low(p.subCategory)===low(opts.subCategory));
  if(opts.brand) out=out.filter(p=>low(p.brand)===low(opts.brand));
  if(opts.location) out=out.filter(p=>low(p.location||p.region).includes(low(opts.location)));
  if(opts.condition) out=out.filter(p=>low(p.condition)===low(opts.condition));
  if(opts.productType) out=out.filter(p=>low(p.productType)===low(opts.productType));
  if(opts.availability) out=out.filter(p=>availabilityStatus(p)===low(opts.availability));
  if(Number.isFinite(Number(opts.minPrice))) out=out.filter(p=>number(p.price)>=Number(opts.minPrice));
  if(Number.isFinite(Number(opts.maxPrice))) out=out.filter(p=>number(p.price)<=Number(opts.maxPrice));
  const sort=opts.sort||'relevance';
  out.sort((a,b)=>sort==='price_asc'?number(a.price)-number(b.price):sort==='price_desc'?number(b.price)-number(a.price):sort==='newest'?Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0):(scoreProduct(b,q)-scoreProduct(a,q)||Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0)));
  return out;
}
export const PRODUCT_SCHEMA_VERSION=2;

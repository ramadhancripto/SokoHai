/* SokoHai Creative Studio — pure, reusable design model. No Firebase/DOM dependency. */
export const CREATIVE_SCHEMA_VERSION = 1;
export const FORMAT_PRESETS = Object.freeze({
  square:{label:'Square 1:1',width:1080,height:1080,safe:72},
  portrait:{label:'Portrait 4:5',width:1080,height:1350,safe:72},
  story:{label:'Story 9:16',width:1080,height:1920,safe:90},
  landscape:{label:'Landscape 16:9',width:1200,height:675,safe:54},
  banner:{label:'Banner',width:1200,height:400,safe:44},
  feed:{label:'Feed Post',width:1080,height:1080,safe:72}
});
export const VERIFIED_FONTS = Object.freeze([{family:'Inter',category:'Professional',weights:[400,500,600,700,800,900],verified:true}]);
const now=()=>new Date().toISOString();
const uid=()=>`ly_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const clean=s=>String(s==null?'':s).replace(/[\u0000-\u001f]/g,' ').trim();
const color=(v,f='#0E7A5F')=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v):f;

export function makeLayer(type,patch={}){
  const common={id:uid(),type,x:120,y:120,width:620,height:type==='text'?150:420,rotation:0,opacity:1,zIndex:1,locked:false,visible:true,name:type[0].toUpperCase()+type.slice(1)};
  const style={fill:'#102A43',fontFamily:'Inter',fontSize:72,fontWeight:800,fontStyle:'normal',textDecoration:'none',letterSpacing:0,lineHeight:1.1,textAlign:'left',textTransform:'none',stroke:'#FFFFFF',strokeWidth:0,strokeOpacity:1,shadowColor:'#000000',shadowOpacity:0,shadowBlur:12,shadowX:0,shadowY:5,radius:24,borderColor:'#000000',borderWidth:0,backgroundColor:'transparent',padding:0,filter:{brightness:100,contrast:100,saturation:100,blur:0},flipX:false,flipY:false};
  return {...common,content:type==='text'?'Andika hapa':'',style,...patch,style:{...style,...(patch.style||{}),filter:{...style.filter,...((patch.style&&patch.style.filter)||{})}}};
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
  const c={schemaVersion:CREATIVE_SCHEMA_VERSION,id:context.id||'',ownerId:context.ownerId||'',type:context.publicationType||'advertisement',format,canvas:{width:p.width,height:p.height,safe:p.safe,bleed:0,custom:false},background:{type:'gradient',color:'#0E7A5F',color2:'#075C7A',angle:135,opacity:1,texture:'none',textureOpacity:.08,imageUrl:'',filter:{brightness:100,contrast:100,saturation:100,blur:0}},layers:[],brandKit:null,linkedEntity:context.sourceId?{type:context.sourceType||'custom',id:context.sourceId}:null,destination:context.destination||null,version:1,status:'DRAFT',title:'Untitled Creative',createdAt:now(),updatedAt:now(),metadata:{source:'sokohai-creative-studio',preset:format}};
  c.layers=defaultLayers(c); return c;
}
export function normalizeCreative(input){
  const base=createCreative({format:input&&input.format}); if(!input||typeof input!=='object')return base;
  const out={...base,...input,canvas:{...base.canvas,...(input.canvas||{})},background:{...base.background,...(input.background||{}),filter:{...base.background.filter,...((input.background&&input.background.filter)||{})}}};
  out.canvas.width=clamp(out.canvas.width,240,4096);out.canvas.height=clamp(out.canvas.height,240,4096);out.canvas.safe=clamp(out.canvas.safe,0,Math.min(out.canvas.width,out.canvas.height)/3);
  out.layers=(Array.isArray(input.layers)?input.layers:base.layers).slice(0,150).map((l,i)=>makeLayer(l.type||'shape',{...l,id:clean(l.id)||uid(),x:clamp(l.x,-out.canvas.width,out.canvas.width*2),y:clamp(l.y,-out.canvas.height,out.canvas.height*2),width:clamp(l.width,1,out.canvas.width*3),height:clamp(l.height,1,out.canvas.height*3),rotation:clamp(l.rotation,-360,360),opacity:clamp(l.opacity,0,1),zIndex:Number.isFinite(+l.zIndex)?+l.zIndex:i+1,content:clean(l.content)}));
  return out;
}
export function duplicateCreative(c){const x=normalizeCreative(JSON.parse(JSON.stringify(c)));x.id='';x.version=1;x.status='DRAFT';x.title=(x.title||'Creative')+' — Copy';x.createdAt=x.updatedAt=now();x.layers=x.layers.map(l=>({...l,id:uid()}));return x;}
export function resizeCreative(c,format,width,height){
  const x=normalizeCreative(JSON.parse(JSON.stringify(c))),old={...x.canvas},p=FORMAT_PRESETS[format]||{width:+width,height:+height,safe:Math.round(Math.min(+width,+height)*.06)};
  const nw=clamp(width||p.width,240,4096),nh=clamp(height||p.height,240,4096),sx=nw/old.width,sy=nh/old.height;
  x.layers=x.layers.map(l=>({...l,x:l.x*sx,y:l.y*sy,width:l.width*sx,height:l.height*sy,style:{...l.style,fontSize:Math.max(10,(l.style.fontSize||32)*Math.min(sx,sy))}}));
  // Intelligent role reflow for large aspect changes; never stretches imagery.
  if(Math.abs(nw/nh-old.width/old.height)>.35){x.layers=x.layers.map(l=>{if(l.role==='headline')return{...l,x:nw*.08,y:nh*.09,width:nw*.84};if(l.role==='cta'||l.role==='cta-bg')return{...l,x:nw*.12,y:nh*.82,width:nw*.76};if(l.type==='image')return{...l,x:nw*.12,y:nh*.30,width:nw*.76,height:nh*.43,style:{...l.style,fit:'cover'}};return l;});}
  x.format=format||'custom';x.canvas={width:nw,height:nh,safe:p.safe||Math.round(Math.min(nw,nh)*.06),bleed:0,custom:!FORMAT_PRESETS[format]};x.updatedAt=now();return x;
}
export function applyEntity(c,entity={},sourceType='product'){
  const x=normalizeCreative(JSON.parse(JSON.stringify(c))); const name=clean(entity.title||entity.name||entity.serviceName||entity.company||entity.driverName); const image=clean(entity.imageUrl||entity.image||entity.photo||entity.logoUrl||(Array.isArray(entity.images)&&entity.images[0])); const seller=clean(entity.shopName||entity.businessName||entity.providerName||entity.sellerName||entity.company); const location=clean(entity.location||entity.region||entity.serviceArea||entity.pickupRegion); const price=Number(entity.price||entity.currentPrice||entity.servicePrice); 
  x.linkedEntity={type:sourceType,id:clean(entity.id),snapshot:{name,image,seller,location,price:Number.isFinite(price)?price:null}};x.title=name||x.title;
  const head=x.layers.find(l=>l.role==='headline');if(head&&name)head.content=name;
  const body=x.layers.find(l=>l.role==='body');if(body)body.content=[seller,location].filter(Boolean).join(' · ')||body.content;
  if(image)x.layers.push(makeLayer('image',{name:'Entity image',src:image,x:x.canvas.width*.48,y:x.canvas.height*.42,width:x.canvas.width*.46,height:x.canvas.height*.42,zIndex:2,style:{fit:'cover',radius:28}}));
  if(Number.isFinite(price)){x.layers.push(makeLayer('text',{name:'Real price',role:'price',content:'TZS '+price.toLocaleString('en-US'),x:x.canvas.width*.08,y:x.canvas.height*.58,width:x.canvas.width*.42,height:x.canvas.height*.1,zIndex:7,style:{fill:'#FFFFFF',fontSize:Math.round(x.canvas.width*.047),fontWeight:900}}));}
  x.destination={type:sourceType,id:clean(entity.id)};x.updatedAt=now();return x;
}
const themes={
 'PRODUCT SALE':['#071E3D','#21E6C1'],'SERVICE':['#3B176F','#FFB703'],'BUSINESS':['#0B3B2E','#4ADE80'],'NEW ARRIVAL':['#111827','#38BDF8'],'DISCOUNT':['#7F1D1D','#FBBF24'],'FLASH SALE':['#1F1147','#FF3366'],'GROUP BUY':['#075985','#22C55E'],'WHOLESALE':['#3F2D20','#E9C46A'],'AUCTION':['#27100A','#F97316'],'PRICE DROP':['#450A0A','#EF4444'],'OPENING':['#052E16','#FDE047'],'GRAND OPENING':['#1E1B4B','#F59E0B'],'EVENT':['#2E1065','#D946EF'],'ANNOUNCEMENT':['#0C4A6E','#38BDF8'],'NEW BRANCH':['#134E4A','#5EEAD4'],'DELIVERY':['#172554','#60A5FA'],'TRANSPORT':['#1C1917','#F97316'],'JOB / OPPORTUNITY':['#3F3F46','#A3E635'],'GENERAL BRANDING':['#0F172A','#2DD4BF']};
export const TEMPLATE_CATEGORIES=Object.keys(themes);
export function templatesFor(format='square'){
  const p=FORMAT_PRESETS[format]||FORMAT_PRESETS.square;
  return TEMPLATE_CATEGORIES.map((name,i)=>{const [a,b]=themes[name];const c=createCreative({format});c.title=name;c.background={...c.background,color:a,color2:b,angle:(i*23)%360};const h=c.layers.find(l=>l.role==='headline');h.content=name;h.style.fill='#FFFFFF';const body=c.layers.find(l=>l.role==='body');body.content='Badilisha maandishi, picha na maelezo yako';return{id:'tpl_'+name.toLowerCase().replace(/\W+/g,'_'),name,category:name,preview:{a,b},creative:c};});
}
export function autoDesignVariations(c){
  const defs=[['Minimal','#F8FAFC','#0F766E','#0F172A'],['Bold','#111827','#F97316','#FFFFFF'],['Elegant','#2E1F2B','#D4AF37','#FFF7ED'],['Modern','#082F49','#22D3EE','#F0FDFA'],['Promotional','#7F1D1D','#FBBF24','#FFFFFF']];
  return defs.map(([name,a,b,text],i)=>{const x=normalizeCreative(JSON.parse(JSON.stringify(c)));x.title=name+' — '+c.title;x.background={...x.background,color:a,color2:i===0?a:b,angle:135};x.layers=x.layers.map(l=>l.type==='text'?{...l,style:{...l.style,fill:l.role==='cta'?a:text,fontWeight:l.role==='headline'||l.role==='price'?900:l.style.fontWeight}}:l.role==='cta-bg'?{...l,style:{...l.style,fill:b}}:l);return{name,creative:x};});
}
function luminance(hex){const a=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];}
export function contrastRatio(a,b){const x=luminance(color(a,'#000000')),y=luminance(color(b,'#FFFFFF'));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function designSuggestions(c){
  const x=normalizeCreative(c),out=[],bg=x.background.color||'#FFFFFF',colors=new Set([bg,x.background.color2]);
  x.layers.filter(l=>l.visible).forEach(l=>{if(l.type==='text'){colors.add(l.style.fill);if((l.style.fontSize||0)<18)out.push({level:'warning',layerId:l.id,message:`${l.name}: text may be too small.`});if(contrastRatio(l.style.fill||'#000000',bg)<3)out.push({level:'warning',layerId:l.id,message:`${l.name}: low contrast against background.`});if((l.content||'').length>160)out.push({level:'hint',layerId:l.id,message:`${l.name}: consider reducing body text.`});}if(l.x<x.canvas.safe||l.y<x.canvas.safe||l.x+l.width>x.canvas.width-x.canvas.safe||l.y+l.height>x.canvas.height-x.canvas.safe)out.push({level:'hint',layerId:l.id,message:`${l.name}: outside the text-safe area.`});});
  if(colors.size>6)out.push({level:'hint',message:'More than six colors may weaken visual consistency.'});if(!x.layers.some(l=>l.role==='cta'))out.push({level:'hint',message:'Consider adding a clear CTA.'});return out.slice(0,12);
}
export function validateCreative(c,{forPublish=false}={}){
  const x=normalizeCreative(c),errors=[];if(!x.layers.some(l=>l.visible))errors.push({code:'EMPTY',message:'Add at least one visible layer.'});
  x.layers.filter(l=>l.visible).forEach(l=>{if(l.type==='text'&&!clean(l.content))errors.push({code:'EMPTY_TEXT',layerId:l.id,message:`${l.name} has no text.`});if(l.x+l.width<0||l.y+l.height<0||l.x>x.canvas.width||l.y>x.canvas.height)errors.push({code:'OUTSIDE',layerId:l.id,message:`${l.name} is outside the canvas.`});if(l.type==='image'&&!/^https:\/\//i.test(l.src||''))errors.push({code:'IMAGE',layerId:l.id,message:`${l.name} image is not loaded.`});});
  if(forPublish){if(!x.destination||!x.destination.type||!x.destination.id)errors.push({code:'DESTINATION',message:'Choose a real SokoHai destination before publishing.'});if(!x.linkedEntity||!x.linkedEntity.id)errors.push({code:'ENTITY',message:'Linked entity is required for interactive advertising.'});}
  return{ok:errors.length===0,errors};
}
export function serializeCreative(c){return JSON.stringify(normalizeCreative(c));}

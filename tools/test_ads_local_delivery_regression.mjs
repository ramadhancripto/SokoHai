/* ADS LOCAL DELIVERY REGRESSION (2026-09-24)
   Runtime jsdom test for the regression introduced by 0538616: Home ads must
   render without deployed Cloud Functions, while server answers are respected
   and no delivery analytics/lease is faked. Loads the REAL 06-announcement.js
   and 96-ad-delivery-controller.js (bootstrap import replaced by a stub skh). */
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const controllerSrc=read('js/app/96-ad-delivery-controller.js')
  .replace(/^import \{ skh \} from '\.\/00-bootstrap\.js';$/m,'const skh = window.skh;');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const t=(name,ok)=>{if(ok){pass++;console.log('PASS '+name);}else{fail++;console.log('FAIL '+name);}};
const now=Date.now();
const AD=(id,extra={})=>({id,headline:'Tangazo '+id,text:'Ofa',brandName:'Duka',creativeType:'solid_text',active:true,status:'published',priority:1,...extra});

async function scenario({localEnv=false,admin=false,call,cache=[],mode=null}){
  const dom=new JSDOM('<body><div class="big-announcement" id="topAnnouncement" data-skh-ad-slot="home"><div class="marquee-text">Karibu</div></div></body>',
    {url:localEnv?'http://localhost:5500/':'https://sokohai.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  const calls=[],warns=[];
  w.console.warn=(...a)=>warns.push(a.join(' '));
  if(mode)w.localStorage.setItem('skh_ads_delivery_mode',mode);
  class IO{constructor(cb){this.cb=cb;}observe(el){setTimeout(()=>this.cb([{target:el,isIntersecting:true,intersectionRatio:1}]),0);}unobserve(){}disconnect(){}}
  w.IntersectionObserver=IO;
  w.skh={isLocalEnv:localEnv,currentUser:admin?{email:'rshabansaid@gmail.com'}:{email:'u@x.test'},MY_ADMIN_EMAIL:'rshabansaid@gmail.com',
    callFunction:(name,data)=>{calls.push(name);return call?call(name,data):Promise.reject(Object.assign(new Error('internal'),{code:'functions/internal',fnDown:true}));}};
  w.__sokohaiAnnouncementsCache=cache;
  w.eval(read('shared/ads-design-rules.js'));
  w.eval(read('js/app/creative/ad-palettes.js'));
  w.eval(read('js/06-announcement.js'));
  w.eval(controllerSrc);
  await sleep(120);
  const host=w.document.getElementById('topAnnouncement');
  return {w,host,calls,warns};
}

// A. localhost: no adsRequestDelivery call, real cached ad rendered, no analytics.
{
  const s=await scenario({localEnv:true,cache:[AD('a1',{priority:1}),AD('a2',{priority:9})]});
  t('A localhost renders Home ad from Firestore cache',!!s.host.querySelector('.skh-ann-card')&&!s.host.hidden);
  t('A highest priority campaign first',s.host.textContent.includes('Tangazo a2'));
  t('A localhost does not call adsRequestDelivery',!s.calls.includes('adsRequestDelivery'));
  t('A no delivery analytics / lease faked',!s.calls.includes('adsTrackDeliveryEvent'));
  t('A never calls adsUpdateCampaignDelivery',!s.calls.includes('adsUpdateCampaignDelivery'));
  t('A slot marked local-env',s.host.dataset.skhAdSource==='local-env');
}
// B. deployed host, Functions not deployed (infra error) -> local fallback.
{
  const s=await scenario({cache:[AD('b1')]});
  t('B server attempted first',s.calls[0]==='adsRequestDelivery');
  t('B infra failure falls back to cached ad',!!s.host.querySelector('.skh-ann-card')&&s.host.dataset.skhAdSource==='functions-unavailable');
  t('B fallback is logged, not silent',s.warns.some(x=>/local rendering \(functions-unavailable/.test(x)));
  t('B no delivery analytics on fallback',!s.calls.includes('adsTrackDeliveryEvent'));
}
// C. server NO_FILL is respected (no fallback masking server decision).
{
  const s=await scenario({cache:[AD('c1')],call:n=>n==='adsRequestDelivery'?Promise.resolve({data:{status:'NO_AD'}}):Promise.resolve({data:{}})});
  t('C server no-fill hides slot (no local override)',s.host.hidden===true&&!s.host.querySelector('.skh-ann-card'));
}
// D. real business error (not fnDown) is not masked.
{
  const s=await scenario({cache:[AD('d1')],call:()=>Promise.reject(Object.assign(new Error('denied'),{code:'functions/permission-denied'}))});
  t('D business error does not trigger fallback',s.host.hidden===true&&!s.host.querySelector('.skh-ann-card'));
}
// E. server DELIVERED path unchanged (lease + tracking).
{
  const s=await scenario({cache:[],call:n=>n==='adsRequestDelivery'?Promise.resolve({data:{status:'DELIVERED',leaseId:'L1',campaign:AD('srv')}}):Promise.resolve({data:{ok:true}})});
  t('E server delivered ad renders',s.host.textContent.includes('Tangazo srv'));
  t('E server path still tracks via lease',s.calls.includes('adsTrackDeliveryEvent'));
}
// F. admin: untracked preview, no server call (server returns ADMIN_CONTEXT).
{
  const s=await scenario({admin:true,cache:[AD('f1')]});
  t('F admin sees Home ad preview',!!s.host.querySelector('.skh-ann-card')&&s.host.dataset.skhAdSource==='admin-preview');
  t('F admin preview makes no delivery calls',s.calls.length===0);
}
// G. empty cache at boot, Firestore snapshot arrives later.
{
  const s=await scenario({localEnv:true,cache:[]});
  t('G empty cache hides slot',s.host.hidden===true);
  s.w.__sokohaiAnnouncementsCache=[AD('g1')];
  s.w.__sokohaiOnAnnouncementsUpdate(s.w.__sokohaiAnnouncementsCache);
  await sleep(30);
  t('G snapshot update renders ad without reload',s.host.textContent.includes('Tangazo g1')&&!s.host.hidden);
}
// H. lifecycle/placement/targeting rules honored locally.
{
  const s=await scenario({localEnv:true,cache:[
    AD('paused',{lifecycleStatus:'paused',priority:99}),AD('draft',{status:'draft',priority:98}),
    AD('pending',{moderationStatus:'pending',priority:97}),AD('future',{startAt:new Date(now+864e5).toISOString(),priority:96}),
    AD('expired',{endAt:new Date(now-1e3).toISOString(),priority:95}),AD('search',{placements:['search'],priority:94}),
    AD('targeted',{targetRegions:['arusha'],priority:93}),AD('ok',{priority:1})]});
  t('H only eligible campaign rendered',s.host.textContent.includes('Tangazo ok'));
  const ids=s.w.skhLocalActiveCampaigns('home',{}).map(a=>a.id);
  t('H selector excludes paused/draft/pending/scheduled/expired/other-placement/targeted',JSON.stringify(ids)==='["ok"]');
  t('H search placement selectable for search slot',s.w.skhLocalActiveCampaigns('search',{}).some(a=>a.id==='search'));
}
// I. localhost opt-in to server delivery.
{
  const s=await scenario({localEnv:true,mode:'server',cache:[AD('i1')]});
  t('I localhost opt-in calls server',s.calls[0]==='adsRequestDelivery');
}
// J. Delivery save: no fake success, wiring intact.
{
  const src=read('js/app/16-pos-admin-jobs.js');
  t('J adsUpdateCampaignDelivery wiring intact',src.includes("skh.callFunction('adsUpdateCampaignDelivery'"));
  t('J save failure surfaces error, no cache write in catch',/catch\(error\)\{\/\* Backend failure stays a failure[^}]*skhFnErrText/.test(src));
}
console.log(`\nADS LOCAL DELIVERY REGRESSION: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('/home/user/SokoHai-phase1/sokohai-sw.js','utf8');
function run(serverUp){
  const handlers={}; const cachePuts=[];
  const ctx={self:{addEventListener:(t,f)=>handlers[t]=f,skipWaiting(){},clients:{claim:async()=>{}}},
    caches:{keys:async()=>[],delete:async()=>true,match:async()=>undefined,open:async()=>({put:(...a)=>cachePuts.push(a)})},
    fetch:async(req)=>{ if(!serverUp) throw new TypeError('Failed to fetch'); return {ok:true,status:200,url:req.url,_isResponse:true}; }};
  vm.createContext(ctx); vm.runInContext(src,ctx);
  return async(method,url)=>{ let responded=false,p=null; handlers.fetch({request:{method,url},respondWith(x){responded=true;p=Promise.resolve(x);}});
    if(!responded) return 'NOT intercepted (browser handles it natively)';
    const v=await p.catch(e=>'rejected '+e); if(v===undefined) return "respondWith(undefined) → browser: \"Failed to convert value to 'Response'\" + FetchEvent network error";
    return v._isResponse?'network response passed through (status '+v.status+')':String(v); };
}
(async()=>{
  const up=run(true), down=run(false);
  console.log('server UP   GET  /                    :', await up('GET','http://localhost:5055/'));
  console.log('server UP   POST /__fn/creativePublish :', await up('POST','http://localhost:5055/__fn/creativePublish'));
  console.log('server UP   GET  /js/app/96-ad-...js   :', await up('GET','http://localhost:5055/js/app/96-ad-delivery-controller.js'));
  console.log('server DOWN GET  /                    :', await down('GET','http://localhost:5055/'));
  console.log('server DOWN POST /__fn/adsRequestDelivery:', await down('POST','http://localhost:5055/__fn/adsRequestDelivery'));
  console.log('cache writes anywhere in SW source   :', /cache\.put|\.addAll\(|\.add\(/.test(src)?'YES':'NONE (cache always empty → cannot serve stale data)');
})();

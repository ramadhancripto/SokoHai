// Actual SokoHai Maoni sheet, CSS and comments module; isolated mocked cloud.
// node tools/product_preview_server.mjs then node tools/test_comments_experience_browser.mjs
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch();
for(const width of [320,390,768,1280]){
 const p=await b.newPage({viewport:{width,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4174/',{waitUntil:'load'});await p.waitForFunction(()=>window.previewReady);
 await p.evaluate(async()=>{
  window.closeModals();document.getElementById('productModal').style.display='flex';
  const P={id:'product-1',title:'Kikapu cha asili',price:42000,userId:'seller-1',ownerName:'Rehema',image:'/assets/img/hero-product.jpg',collectionName:'products'};
  window.skh.currentOpenProduct=P;
  window.__comments=[
   {id:'c1',targetType:'product',targetId:P.id,authorId:'buyer-1',authorName:'Asha',text:'Je, bado kinapatikana?',createdAt:'2026-11-01T10:00:00Z',likeCount:2},
   {id:'c2',targetType:'product',targetId:P.id,authorId:'seller-1',authorRole:'seller',authorName:'Rehema',text:'Ndiyo, kinapatikana.',createdAt:'2026-11-03T10:00:00Z',likeCount:5,verifiedPurchase:null},
   {id:'r1',targetType:'product',targetId:P.id,parentId:'c1',rootId:'c1',authorId:'seller-1',authorName:'Rehema',text:'Karibu, kipo.',createdAt:'2026-11-02T10:00:00Z'},
   {id:'r2',targetType:'product',targetId:P.id,parentId:'r1',rootId:'c1',authorId:'buyer-1',authorName:'Asha',text:'Asante kwa taarifa!',createdAt:'2026-11-02T11:00:00Z',verifiedPurchase:{orderId:'order-demo'}},
   {id:'r3',targetType:'product',targetId:P.id,parentId:'c1',rootId:'c1',authorId:'other',authorRole:'seller',authorName:'Juma',text:'Nafuatilia pia.',createdAt:'2026-11-02T12:00:00Z'}
  ];
  window.__likes=[];window.__requests=[];window.__commentError=false;
  const skh=window.skh;
  skh.where=(field,op,value)=>({field,op,value});skh.limit=n=>({limit:n});skh.startAfter=d=>({cursor:d.id});
  skh.query=(col,...args)=>({col:col.col,args});
  skh.getDocs=async q=>{let rows=q.col==='comments'?window.__comments:window.__likes;for(const a of q.args||[])if(a?.field&&a.op==='==')rows=rows.filter(x=>x[a.field]===a.value);else if(a?.field&&a.op==='in')rows=rows.filter(x=>a.value.includes(x[a.field]));
    let cursor=(q.args||[]).find(x=>x?.cursor);if(cursor){let pos=rows.findIndex(x=>x.id===cursor.cursor);rows=rows.slice(pos+1)}let lim=(q.args||[]).find(x=>x?.limit);if(lim)rows=rows.slice(0,lim.limit);
    let docs=rows.map(({id,...x})=>({id,data:()=>x}));return {size:docs.length,docs,empty:!docs.length,forEach:cb=>docs.forEach(cb)};};
  skh.getCountFromServer=async q=>({data:()=>({count:window.__comments.filter(x=>x.targetId===P.id&&x.targetType==='product').length})});
  skh.wrapCallable=name=>async payload=>{window.__requests.push({name,payload});if(name==='commentsEvidence')return {data:{order:window.__evidence ? {orderId:'mock-order'} : null,delivery:null}};
   if(name==='commentsPublish'){if(window.__commentError){let e=new Error('mock failure');e.code='functions/internal';throw e}let item={...payload,id:'new-'+window.__requests.length,authorId:'preview-seller',createdAt:new Date().toISOString(),likeCount:0};window.__comments.push(item);return{data:{ok:true,id:item.id,parentAuthorId:'seller-1'}}}
   if(name==='commentsLike'){let c=window.__comments.find(x=>x.id===payload.commentId);let i=window.__likes.findIndex(x=>x.commentId===c.id);if(i>=0){window.__likes.splice(i,1);c.likeCount--}else {window.__likes.push({id:c.id+'__preview-seller',commentId:c.id,userId:'preview-seller'});c.likeCount=(c.likeCount||0)+1}return{data:{ok:true}}}return{data:{ok:true}};};
  window.skhFnErrText=()=> 'Tafadhali jaribu tena.';window.alert=x=>window.__lastAlert=x;
  await import('/js/app/35-comments.js');await window.skhOpenMaoni();
 });
 await p.waitForFunction(()=>document.querySelectorAll('.skh-cm-conversation').length===2);
 await p.waitForTimeout(350);
 assert.equal(await p.locator('#skhCmPanelCount').innerText(),'5');
 assert.match(await p.locator('#maoniProductSummary').innerText(),/Kikapu cha asili/);
 assert.equal(await p.locator('[data-cid="r3"]').count(),0);assert.equal(await p.locator('[data-cid="r2"] .skh-cm-replyto').innerText(),'↳ @Rehema');
 assert.equal(await p.locator('[data-cid="c2"] .seller').count(),1);assert.equal(await p.locator('[data-cid="r2"] .vp').count(),1);
 await p.locator('#skhCommentInput').fill('Rasimu isibadilike');await p.getByRole('button',{name:'Mpya Zaidi'}).click();
 assert.equal(await p.locator('#skhCommentInput').inputValue(),'Rasimu isibadilike');assert.equal(await p.locator('.skh-cm-conversation').first().locator('.skh-cm-item').first().getAttribute('data-cid'),'c2');
 await p.getByRole('button',{name:'Zilizopendwa'}).click();assert.equal(await p.locator('.skh-cm-conversation').first().locator('.skh-cm-item').first().getAttribute('data-cid'),'c2');
 await p.getByRole('button',{name:/Onyesha majibu zaidi/}).click();assert.equal(await p.locator('[data-cid="r3"]').count(),1);assert.equal(await p.locator('[data-cid="r3"] .seller').count(),0);
 await p.getByRole('button',{name:'Ficha majibu'}).click();assert.equal(await p.locator('[data-cid="r1"]').count(),0);
 await p.getByRole('button',{name:/Onyesha majibu zaidi/}).click();
 await p.locator('[data-cid="r2"] button').filter({hasText:'Jibu'}).click();assert.match(await p.locator('#skhCmReplying').innerText(),/@Asha/);
 await p.locator('#skhCommentInput').fill('Nashukuru sana');await p.locator('#skhCmSendBtn').click();await p.waitForFunction(()=>window.__requests.some(x=>x.name==='commentsPublish'));
 let req=await p.evaluate(()=>window.__requests.find(x=>x.name==='commentsPublish').payload);assert.equal(req.parentId,'r2');assert.equal(req.rootId,'c1');assert.equal(req.text,'Nashukuru sana');
 await p.waitForFunction(()=>document.querySelector('#skhCmPanelCount')?.textContent==='6');
 await p.locator('[data-cid="c1"] .cm-like').click();await p.waitForFunction(()=>window.__requests.some(x=>x.name==='commentsLike'));await p.waitForTimeout(150);assert.equal(await p.locator('[data-cid="c1"] .cm-like').getAttribute('aria-pressed'),'true');
 await p.evaluate(()=>window.__commentError=true);await p.locator('#skhCommentInput').fill('Tafadhali usipoteze rasimu');await p.locator('#skhCmSendBtn').click();await p.waitForFunction(()=>window.__lastAlert);assert.equal(await p.locator('#skhCommentInput').inputValue(),'Tafadhali usipoteze rasimu');assert.equal(await p.locator('#skhCmSendBtn').isDisabled(),false);
 const geom=await p.evaluate(()=>{let d=document.querySelector('.maoni-sheet').getBoundingClientRect(),c=document.querySelector('.skh-cm-composer').getBoundingClientRect(),l=document.querySelector('.skh-cm-list');return {d:d.toJSON(),c:c.toJSON(),scroll:getComputedStyle(l).overflowY,body:document.documentElement.scrollWidth}});
 assert.equal(geom.scroll,'auto');assert.ok(geom.c.bottom<=geom.d.bottom+1);assert.ok(geom.body<=width+1);
 if(width===390) {
  await p.evaluate(()=>{document.getElementById('previewNavigation').style.display='none'; document.getElementById('skhCommentInput').value='';});
  await p.locator('#skhCommentInput').blur();
  await p.screenshot({path:'/home/user/SokoHai-comments-preview.png'});
  // Evidence-eligible upload failure must retain text/media and never send a
  // partial comment. This is a mock failure, not a real Cloudinary upload.
  await p.evaluate(async()=>{window.__evidence=true;window.__commentError=false;await skhCommentsOpen({id:'different',collectionName:'products'});await skhCommentsOpen(skh.currentOpenProduct);await skhOpenMaoni();window.skhUploadFromFile=async()=>{throw Error('mock upload failure')};window.__lastAlert='';});
  await p.waitForSelector('button#skhCmAttachBtn');
  await p.locator('#skhCmFileInput').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:Buffer.from('test')});
  await p.locator('#skhCommentInput').fill('Picha muhimu');
  const before=await p.evaluate(()=>window.__requests.filter(x=>x.name==='commentsPublish').length);
  await p.locator('#skhCmSendBtn').click();await p.waitForFunction(()=>window.__lastAlert);
  assert.equal(await p.evaluate(()=>window.__requests.filter(x=>x.name==='commentsPublish').length),before);
  assert.equal(await p.locator('#skhCommentInput').inputValue(),'Picha muhimu');assert.equal(await p.locator('.skh-cm-chip').count(),1);assert.equal(await p.locator('#skhCmSendBtn').isDisabled(),false);
  // Delayed results from an old product cannot overwrite the newer one.
  await p.evaluate(async()=>{
   const old=skh.getDocs;let release;const gate=new Promise(r=>release=r);window.__releaseOld=release;
   skh.getDocs=async q=>{if(q.col==='comments'&&(q.args||[]).some(x=>x?.field==='targetId'&&x.value==='slow-product'))await gate;return old(q)};
   window.__slow=skhCommentsOpen({id:'slow-product',title:'Slow',collectionName:'products'});
   skh.currentOpenProduct={id:'product-1',title:'Kikapu cha asili',userId:'seller-1',collectionName:'products'};
   await skhCommentsOpen(skh.currentOpenProduct);window.__releaseOld();await window.__slow;skh.getDocs=old;
  });
  assert.match(await p.locator('#maoniProductSummary').innerText(),/Kikapu cha asili/);
  // A parent arriving on a later Firestore page must reconnect its replies;
  // the count is the server aggregate, not merely the first 200 fetched.
  await p.evaluate(async()=>{
   window.__comments=Array.from({length:200},(_,i)=>({id:'page-r'+i,targetType:'product',targetId:'product-1',parentId:'late-root',rootId:'late-root',authorId:'other',authorName:'Mteja',text:'Jibu '+i,createdAt:'2026-11-02'}));
   window.__comments.push({id:'late-root',targetType:'product',targetId:'product-1',authorId:'buyer-1',authorName:'Mzazi',text:'Swali la mzazi',createdAt:'2026-11-01'});
   await window.skhCommentsOpen({id:'different',collectionName:'products'});
   await window.skhCommentsOpen(window.skh.currentOpenProduct);
  });
  assert.equal(await p.locator('#skhCmPanelCount').innerText(),'201');
  await p.getByRole('button',{name:'Pakia maoni zaidi'}).click();
  await p.waitForSelector('[data-cid="late-root"]');
  assert.equal(await p.locator('[data-cid="page-r0"]').count(),1);
  assert.equal(await p.locator('[data-cid="page-r1"]').count(),1);
  await p.keyboard.press('Escape');await p.waitForTimeout(300);
  assert.equal(await p.locator('#maoniLayer').isHidden(),true);
  assert.notEqual(await p.locator('#productModal').evaluate(e=>getComputedStyle(e).display),'none');
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${width}: real sheet, sorting, threads, specific reply, counts, seller/verified, like, failure/draft, layout (mock cloud)`);await p.close();
}
await b.close();

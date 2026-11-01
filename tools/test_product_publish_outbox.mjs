/* Bidhaa/huduma/usafiri: mtandao ukianguka kazi haipotei, na kusambaza
   mara mbili hakuleti bidhaa mbili. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e.message).slice(0,140)));
const dialogs=[]; p.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
await p.goto('http://localhost:8080/', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(5000);
const w = await p.$('button:has-text("ENDELEA NDANI")'); if (w) { try{ await w.click({timeout:1500}); }catch(e){} }
await p.waitForTimeout(500);

const results = [];
const check = (n, ok, extra='') => results.push({ n, ok: !!ok, extra });

const out = await p.evaluate(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const calls = [];
  const setDocs = [], addDocs = [];
  let mode = 'offline';
  const netErr = () => { const e = new Error('Failed to get document because the client is offline.'); e.code='unavailable'; return e; };
  window.skh.addDoc = async (c, payload) => { if (mode==='offline') throw netErr(); addDocs.push(payload); return { id:'AUTO'+addDocs.length }; };
  window.skh.setDoc = async (ref, payload) => { setDocs.push({ path: (ref && ref.path) || String(ref), payload }); return true; };
  window.skh.doc = (db, col, id) => ({ path: col + '/' + id });
  window.skh.updateDoc = async () => true;
  window.skh.wrapCallable = (name) => async (d) => { calls.push({ name, d }); return { data:{ ok:true } }; };
  window.skhUploadPickedDetailed = async () => ({ urls:['https://img.example/p.jpg'], attempted:1, failed:[] });
  window.skh.currentUser = { uid:'u1', email:'d@example.test', displayName:'Demo' };
  window.skh.currentUserData = { businessId:'B1', storeId:'S1' };
  try { localStorage.removeItem('skh_publish_outbox_v1'); } catch(e){}

  const fill = async () => {
    window.showForm('sellerForm'); await sleep(800);
    const set=(id,v)=>{const el=document.getElementById(id); if(el){el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));}};
    set('prodName','Set ya vitanda vya mbao'); set('prodPrice','45000'); set('prodStock','7');
    set('prodLocation','Kariakoo'); set('prodDesc','Vitanda vigumu vya mbao vinavyofaa familia.');
    const vis=document.getElementById('prodVisibility'); if(vis){vis.value='online_only'; vis.dispatchEvent(new Event('change',{bubbles:true}));}
    await sleep(300);
    const cat=document.getElementById('prodCategory'); if(cat){const o=[...cat.options].find(x=>x.value); if(o){cat.value=o.value; cat.dispatchEvent(new Event('change',{bubbles:true}));}}
    await sleep(400);
    const sub=document.getElementById('prodSubCategory'); if(sub){const o=[...sub.options].find(x=>x.value); if(o){sub.value=o.value; sub.dispatchEvent(new Event('change',{bubbles:true}));}}
    await sleep(300);
  };

  /* --- 1. offline: chapisha --- */
  await fill();
  // offline inasimuliwa na navigator.onLine pamoja na kosa la addDoc
  Object.defineProperty(navigator, 'onLine', { value:false, configurable:true });
  document.getElementById('sellerForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await sleep(2500);
  const queueAfter = JSON.parse(localStorage.getItem('skh_publish_outbox_v1') || '[]');
  const offlineState = {
    queued: queueAfter.length,
    status: queueAfter[0] && queueAfter[0].status,
    openingStock: queueAfter[0] && queueAfter[0].openingStock,
    ready: queueAfter[0] && queueAfter[0].ready,
    clientId: queueAfter[0] && queueAfter[0].clientId,
    formReset: (document.getElementById('prodName')||{}).value === '',
    writes: addDocs.length + setDocs.length,
    calls: calls.length
  };

  /* --- 2. online tena: flush --- */
  Object.defineProperty(navigator, 'onLine', { value:true, configurable:true });
  mode = 'online';
  window.dispatchEvent(new Event('online'));
  await sleep(3000);
  const afterFlush = {
    remaining: JSON.parse(localStorage.getItem('skh_publish_outbox_v1') || '[]').length,
    setDocPaths: setDocs.map(s => s.path),
    addDocs: addDocs.length,
    inventoryCalls: calls.filter(c=>c.name==='inventoryAdjust').length,
    invDelta: (calls.find(c=>c.name==='inventoryAdjust')||{}).d?.delta,
    samePayload: setDocs[0] && setDocs[0].payload ? (function(){
      const q = queueAfter[0];
      return !!q && setDocs[0].payload.title === q.payload.title;
    })() : null
  };

  /* --- 3. flush mara ya pili: hakuna nakala --- */
  window.skhPublishOutbox.flush({});
  await sleep(1200);
  const afterSecond = { setDocs: setDocs.length, addDocs: addDocs.length };

  /* --- 4. ruhusa: ujumbe elekezi, hakuna foleni --- */
  mode = 'perm';
  window.skh.addDoc = async () => { const e=new Error('Missing or insufficient permissions.'); e.code='permission-denied'; throw e; };
  await fill();
  document.getElementById('sellerForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await sleep(2200);
  const permState = {
    queued: JSON.parse(localStorage.getItem('skh_publish_outbox_v1') || '[]').length,
    keptInForm: (document.getElementById('prodName')||{}).value || ''
  };
  return { offlineState, afterFlush, afterSecond, permState };
});

check('offline: bidhaa inahifadhiwa kwenye kifaa', out.offlineState.queued === 1, 'queued='+out.offlineState.queued);
check('offline: haiandikwi server (hakuna write)', out.offlineState.writes === 0, 'writes='+out.offlineState.writes);
check('offline: stock ya kuanzia imeambatanishwa', out.offlineState.openingStock === 7 && out.offlineState.ready === true, JSON.stringify({s:out.offlineState.openingStock,r:out.offlineState.ready}));
check('offline: fomu inasafishwa (hakuna kuandika upya)', out.offlineState.formReset === true);
check('offline: ujumbe wa mtumiaji ni wa Kiswahili', dialogs.some(d=>/imehifadhiwa kwenye kifaa/i.test(d)), JSON.stringify(dialogs.slice(0,2)));
check('online: foleni inasambazwa', out.afterFlush.remaining === 0, 'remaining='+out.afterFlush.remaining);
check('online: hati inaandikwa kwa clientId ile ile (hakuna nakala)', /^products\/ob/.test(out.afterFlush.setDocPaths[0] || ''), JSON.stringify(out.afterFlush.setDocPaths));
check('online: addDoc haikutumika (identity ya kudumu)', out.afterFlush.addDocs === 0, 'addDocs='+out.afterFlush.addDocs);
check('online: stock ya kuanzia inakamilishwa kwa OPENING_BALANCE', out.afterFlush.inventoryCalls === 1 && out.afterFlush.invDelta === 7, JSON.stringify({n:out.afterFlush.inventoryCalls,d:out.afterFlush.invDelta}));
check('online: payload ni ile ile iliyohifadhiwa', out.afterFlush.samePayload === true);
check('kusambaza mara ya pili: hakuna hati ya pili', out.afterSecond.setDocs === out.afterFlush.setDocPaths.length && out.afterSecond.addDocs === 0, JSON.stringify(out.afterSecond));
check('ruhusa (permission-denied): haijawekwa kwenye foleni', out.permState.queued === 0, 'queued='+out.permState.queued);
check('ruhusa: maandishi yanabaki kwenye fomu', out.permState.keptInForm === 'Set ya vitanda vya mbao', out.permState.keptInForm);
check('ruhusa: ujumbe unaelekeza kwa Kiswahili (si kiingereza ghafi)', dialogs.some(d=>/Hauna ruhusa/i.test(d) && !/Missing or insufficient/i.test(d)), JSON.stringify(dialogs.filter(d=>/ruhusa/i.test(d))));
check('hakuna kosa la ukurasa', errs.length === 0, JSON.stringify(errs.slice(0,2)));

let pass = 0;
for (const r of results) { if (r.ok) pass++; console.log((r.ok?'PASS ':'FAIL ') + r.n + (r.ok?'':' :: '+(r.extra||''))); }
console.log(`\n${pass}/${results.length} passed`);
await b.close();
process.exit(pass === results.length ? 0 : 1);

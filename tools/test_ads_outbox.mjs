/* Outbox: tangazo linaposhindwa kutumwa linahifadhiwa kwenye kifaa,
   kisha linasambazwa mtandao unapopatikana. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:950} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e.message).slice(0,140)));
await p.goto('http://localhost:8080/', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(5500);

const results = [];
const check = (name, ok, extra='') => results.push({ name, ok: !!ok, extra });

const out = await p.evaluate(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const written = [];
  let serverDown = true, calls = 0;
  window.skh.addDoc = async (c, payload) => { written.push(payload); return { id:'CRE'+written.length }; };
  window.skh.setDoc = async (r, payload) => { written.push(payload); return true; };
  window.skh.callFunction = async (name) => {
    calls++;
    if (serverDown) { const e = new Error('unavailable: mtandao haupatikani'); e.code='unavailable'; throw e; }
    return { data:{ ok:true, announcementId:'ANN'+calls } };
  };
  window.skh.currentUser = { uid:'u1', email:'demo@example.test', displayName:'Demo' };
  try { localStorage.removeItem('skh_ads_outbox_v1'); } catch(e){}
  window.skhOpenMarketplaceAdsStudio();
  await sleep(1500);

  const api = window.skhMarketplaceAdsStudio;
  const st = api.state;
  const listing = { id:'L1', title:'Set ya vitanda', price:45000, region:'Dar es Salaam', shopName:'Duka la Demo',
                    images:['https://example.com/a.jpg'], imageUrl:'https://example.com/a.jpg', stock:5, category:'Furniture' };
  st.draft = Object.assign(st.draft, {
    type:'product', listing, listingCollection:'products',
    headline:'Set ya vitanda — Ofa', description:'Vitanda vigumu vya mbao, vinavyofaa familia. Bei nafuu Dar es Salaam.',
    offer:'TSh 45,000', badge:''
  });
  st.step = 7; st.view = 'create';
  api._render(); await sleep(600);

  /* --- 1. server imeanguka: bonyeza Tuma --- */
  const btn = document.querySelector('#masRoot [data-mas-act="submit"]');
  if (!btn) return { noButton:true, step: st.step };
  btn.click();
  await sleep(2600);
  const afterFail = {
    view: st.view,
    error: (document.querySelector('#masRoot .mas-alert.error')||{}).textContent || '',
    queued: JSON.parse(localStorage.getItem('skh_ads_outbox_v1') || '[]').length,
    stateOutbox: (st.outbox||[]).length,
    queueVisible: !!document.querySelector('#masRoot .mas-outbox'),
    rowText: (document.querySelector('#masRoot .mas-outbox .mas-row')||{}).textContent || ''
  };

  /* --- 2. mtandao unarudi: tukio la 'online' --- */
  serverDown = false;
  window.dispatchEvent(new Event('online'));
  await sleep(2600);
  const afterOnline = {
    remaining: JSON.parse(localStorage.getItem('skh_ads_outbox_v1') || '[]').length,
    calls,
    notice: (document.querySelector('#masRoot .mas-alert.ok')||{}).textContent || '',
    queueVisible: !!document.querySelector('#masRoot .mas-outbox')
  };

  /* --- 3. kosa la kudumu linazuiwa, halirudi kila mara --- */
  serverDown = true;
  st.draft = Object.assign(st.draft, { headline:'Tangazo la pili' });
  st.step = 7; st.view = 'create'; api._render(); await sleep(500);
  const btn2 = document.querySelector('#masRoot [data-mas-act="submit"]');
  if (btn2) btn2.click();
  await sleep(2200);
  window.skh.callFunction = async () => { const e=new Error('permission-denied: Hauna ruhusa ya kutangaza bidhaa hii'); e.code='permission-denied'; throw e; };
  st.view='campaigns'; api._render(); await sleep(400);
  const flushBtn = document.querySelector('#masRoot [data-mas-act="flush-outbox"]');
  if (flushBtn) flushBtn.click();
  await sleep(1800);
  const blocked = JSON.parse(localStorage.getItem('skh_ads_outbox_v1') || '[]');
  return {
    afterFail, afterOnline,
    blocked: { count: blocked.length, status: blocked[0] && blocked[0].status, attempts: blocked[0] && blocked[0].attempts,
               retryBtn: !!document.querySelector('#masRoot [data-mas-act="outbox-retry"]') },
    cleanedKeys: Object.keys(localStorage).filter(k=>k.startsWith('skh_ads_outbox'))
  };
});

check('tuma ikishindwa: tangazo linahifadhiwa kwenye kifaa', out.afterFail && out.afterFail.queued === 1, 'queued=' + (out.afterFail?.queued));
check('tuma ikishindwa: mtumiaji anarudishwa kwenye Kampeni zangu', out.afterFail && out.afterFail.view === 'campaigns');
check('tuma ikishindwa: kosa linaeleza tangazo limehifadhiwa', /limehifadhiwa/.test(out.afterFail?.error || ''), out.afterFail?.error?.slice(0,90));
check('kwenye orodha: kipengele "Zinasubiri kusambazwa" kinaonekana', !!out.afterFail?.queueVisible);
check('kwenye orodha: hali inasemwa kwa lugha rahisi', /Inasubiri mtandao/.test(out.afterFail?.rowText || ''), out.afterFail?.rowText?.slice(0,80));
check('mtandao unarudi: foleni inasambazwa yenyewe', out.afterOnline && out.afterOnline.remaining === 0, 'remaining=' + out.afterOnline?.remaining);
check('mtandao unarudi: creativePublish iliitwa', (out.afterOnline?.calls || 0) >= 2, 'calls=' + out.afterOnline?.calls);
check('mtandao unarudi: kipengele cha foleni kinaondoka', out.afterOnline && out.afterOnline.queueVisible === false);
check('kosa la kudumu linazuiwa (halijaribiwi mara kwa mara)', out.blocked && out.blocked.status === 'blocked', JSON.stringify(out.blocked));
check('kosa la kudumu linaonyesha kitufe "Jaribu tena"', !!out.blocked?.retryBtn);
check('hakuna ufunguo mwingine wa hifadhi unaotumika', out.cleanedKeys && out.cleanedKeys.length === 1, JSON.stringify(out.cleanedKeys));
check('hakuna kosa la ukurasa', errs.length === 0, JSON.stringify(errs.slice(0,2)));

let pass = 0;
for (const r of results) { if (r.ok) pass++; console.log((r.ok?'PASS ':'FAIL ') + r.name + (r.ok?'':' :: ' + (r.extra||''))); }
console.log(`\n${pass}/${results.length} passed`);
if (!out.afterFail) console.log('DEBUG', JSON.stringify(out));
await b.close();
process.exit(pass === results.length ? 0 : 1);

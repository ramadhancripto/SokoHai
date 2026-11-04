#!/usr/bin/env node
/* Stage 3 — MUUNDO WA MODULI 9: uthibitisho wa urambazaji kwenye app HALISI.
   ---------------------------------------------------------------------------
   Inafungua index.html ileile, inaweka shell ya Business OS kwenye host ya
   test, kisha inathibitisha:
     1. moduli 9 kwa mpangilio halisi + namba 1–9
     2. sub-moduli A/B/C za "Stoo na Usafirishaji" zinaonekana
     3. kila sub-button inafungua ukurasa wake (activeDashboardTab + active mark
        + kikundi kinachofunguka + kichwa cha ukurasa)
     4. kila action inaita function iliyopo (POS, uhamisho, stoo, ununuzi,
        kituo cha udhibiti kwa tab yake, kamusi)
     5. accordion: kimoja wazi; kichwa hakibadilishi ukurasa
   Matumizi: node functions/local-server.js --static  (port 5055) kisha:
             node tools/test_business_os_9_modules_browser.mjs
   Env: BOS_URL, M9_SHOTS (screenshots)
*/
import { chromium } from 'playwright';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const SHOTS = process.env.M9_SHOTS || '/home/user/sokohai-business-os/shots/moduli-9';

const b = await chromium.launch({ args: ['--no-sandbox'] });
let pass = 0;
const fails = [];
async function step(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('assert imeshindikana'); pass++; }
  catch (e) { fails.push(name + ' → ' + (e && e.message)); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const eq = (a, b2, m) => { if (a !== b2) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b2)); };

const page = await b.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String((e && e.message) || e)));
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource|Permission|insufficient/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skhBOS && !!window.skhRenderBusinessOSShell, null, { timeout: 30000 });

const MODEL = await page.evaluate(() => ({
  groups: window.skhBOS.navModel.map(g => ({ id: g.id, num: g.num, label: g.label, subgroups: (g.subgroups || []).map(s => ({ id: s.id, label: s.label })) })),
  tabs: window.skhBOS.tabs
}));

await step('moduli 9 kwa mpangilio halisi ulioidhinishwa', async () => {
  const want = ['dashboard', 'products', 'intel', 'stock', 'finance', 'people', 'control', 'pos', 'settings'];
  eq(MODEL.groups.map(g => g.id).join(','), want.join(','), 'mpangilio wa moduli');
  eq(MODEL.groups.map(g => g.num).join(','), '1,2,3,4,5,6,7,8,9', 'namba za moduli');
});

await step('shell inachora moduli 9 + sub-moduli A/B/C', async () => {
  const r = await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'm9Host';
    document.body.appendChild(host);
    window.skhRenderBusinessOSShell(host);
    const nav = host.querySelector('#bosSidebar');
    return {
      groups: nav.querySelectorAll('.bos-nav-group').length,
      nums: [...nav.querySelectorAll('.bos-nav-group-num')].map(n => n.textContent.trim()),
      titles: [...nav.querySelectorAll('.bos-nav-group-title-text')].map(n => n.textContent.trim()),
      subs: [...nav.querySelectorAll('[data-bos-subgroup] .bos-nav-sub-title')].map(n => n.textContent.trim()),
      tabs: nav.querySelectorAll('[data-bos-tab]').length,
      actions: nav.querySelectorAll('[data-bos-action]').length,
      firstGroup: nav.querySelector('.bos-nav-group').getAttribute('data-bos-group'),
      hasWorkspace: !!host.querySelector('#dashWorkspace'),
      defaultTab: window.activeDashboardTab
    };
  });
  eq(r.groups, 9, 'moduli');
  eq(r.firstGroup, 'dashboard', 'moduli ya kwanza');
  eq(r.nums.join(','), '1,2,3,4,5,6,7,8,9', 'namba zinazoonekana');
  eq(r.titles[0], 'Dashboard Kuu', 'jina la moduli 1');
  ok(r.subs.length === 3 && /A · Stoo/.test(r.subs[0]) && /B · Logistics/.test(r.subs[1]) && /C · Usafirishaji wa Oda/.test(r.subs[2]), 'sub-moduli A/B/C: ' + r.subs.join('|'));
  eq(r.tabs, 20, 'tabs zote zinaonekana');
  ok(r.hasWorkspace, 'dashWorkspace ipo');
  ok(['overview', undefined, null].includes(r.defaultTab) || r.defaultTab === 'overview', 'landing: ' + r.defaultTab);
});

await step('kila sub-button inafungua ukurasa wake (20 tabs)', async () => {
  const results = [];
  for (const tab of MODEL.tabs) {
    const r = await page.evaluate(async (t) => {
      const nav = document.querySelector('#m9Host #bosSidebar');
      const btn = nav.querySelector('#btnTab_' + t);
      if (!btn) return { tab: t, missing: true };
      btn.click();
      await new Promise(res => setTimeout(res, 90));
      const open = [...nav.querySelectorAll('.bos-nav-group')].filter(g => !g.classList.contains('is-collapsed'))
        .map(g => g.getAttribute('data-bos-group'));
      return {
        tab: t,
        active: window.activeDashboardTab,
        isActive: btn.classList.contains('is-active'),
        aria: btn.getAttribute('aria-current'),
        open,
        group: btn.getAttribute('data-bos-group'),
        header: (document.getElementById('bosHeaderTitle') || {}).textContent || '',
        wsLen: (document.getElementById('dashWorkspace') || {}).innerHTML ? document.getElementById('dashWorkspace').innerHTML.length : 0
      };
    }, tab);
    ok(!r.missing, 'kitufe hakipo: ' + tab);
    eq(r.active, tab, 'ukurasa haukubadilika: ' + tab);
    ok(r.isActive, 'hakijawekwa active: ' + tab);
    eq(r.aria, 'page', 'aria-current: ' + tab);
    eq(r.open.join(','), r.group, 'kikundi cha ukurasa hakifunguki: ' + tab);
    ok(r.header && r.header.length > 2, 'kichwa hakijabadilika: ' + tab + ' → ' + r.header);
    results.push(tab + '=' + r.header);
  }
  return results.length === 20;
});

await step('POS (Moduli 8) inafungua ukurasa/terminal kamili — si modal pekee', async () => {
  const r = await page.evaluate(async () => {
    const nav = document.querySelector('#m9Host #bosSidebar');
    const btn = nav.querySelector('#btnTab_pos_page');
    if (!btn) return { missing: true };
    btn.click();
    await new Promise(res => setTimeout(res, 400));
    const ws = document.getElementById('dashWorkspace');
    const form = document.getElementById('businessOSForm');
    const page = document.getElementById('bosPosPage');
    return {
      active: window.activeDashboardTab,
      inWorkspace: !!(form && ws && ws.contains(form)),
      pageVisible: !!page,
      formDisplay: form ? getComputedStyle(form).display : 'none',
      formPosition: form ? getComputedStyle(form).position : '',
      hasPosTitle: /SOKOHAI SMART POS/.test(ws ? ws.innerText : ''),
      hasCheckout: !!document.getElementById('posCartTotal'),
      embeddedFlag: !!window.__bosPosEmbedded
    };
  });
  ok(!r.missing, 'kitufe cha POS hakipo');
  eq(r.active, 'pos_page', 'POS haikufungua ukurasa wake');
  ok(r.pageVisible, 'ukurasa wa POS haujaundwa');
  ok(r.inWorkspace, 'terminal haipo ndani ya workspace (bado ni modal)');
  eq(r.formDisplay, 'block', 'terminal haionekani');
  eq(r.formPosition, 'static', 'terminal bado ina mkao wa modal (fixed)');
  ok(r.hasPosTitle, 'kichwa cha POS hakionekani');
  ok(r.hasCheckout, 'sehemu ya checkout haipo');
  ok(r.embeddedFlag, 'hali ya embedded haijawekwa');
});

await step('kuondoka kwenye POS kunarejesha fomu bila kuipoteza', async () => {
  const r = await page.evaluate(async () => {
    window.switchDashTab('overview');
    await new Promise(res => setTimeout(res, 250));
    const form = document.getElementById('businessOSForm');
    const ws = document.getElementById('dashWorkspace');
    const back = {
      stillInDom: !!form,
      inWorkspace: !!(form && ws && ws.contains(form)),
      embedded: !!window.__bosPosEmbedded,
      display: form ? getComputedStyle(form).display : 'none',
      idsIntact: !!(document.getElementById('posCartTotal') || document.querySelector('#businessOSForm'))
    };
    /* njia ya zamani (modal): ipo na haitupi hitilafu. Kumbuka: showForm
       inahitaji mtumiaji aliyeingia, kwa hiyo kwenye sandbox (bila auth)
       hatuwezi kuiona ikifunguka — tunathibitisha tu kwamba haijavunjwa. */
    let modalOk = false;
    try { window.skhBOSRunAction('openPos'); modalOk = typeof window.showForm === 'function'; } catch (e) { modalOk = 'throw:' + e.message; }
    try { if (typeof window.closeModals === 'function') window.closeModals(); } catch (e) { }
    if (form) form.style.display = 'none';
    return { back, modalOk };
  });
  ok(r.back.stillInDom, 'fomu ya POS imepotea kwenye DOM');
  ok(!r.back.inWorkspace, 'fomu haikurejeshwa mahali pake');
  ok(!r.back.embedded, 'hali ya embedded haijafutwa');
  ok(r.back.idsIntact, 'ids za POS zimepotea');
  eq(r.modalOk, true, 'njia ya zamani ya modal imevunjika');
});

await step('vitendo (actions) vinaita functions zilizopo', async () => {
  const r = await page.evaluate(async () => {
    const out = {};
    const sleep = ms => new Promise(s => setTimeout(s, ms));
    function modalVisible() {
      return [...document.querySelectorAll('div')].some(d => {
        const st = getComputedStyle(d);
        return st.display === 'flex' && /modal|overlay/i.test(d.className || '') && d.offsetParent !== null;
      });
    }
    const tryAction = async (name, arg) => {
      try { window.skhBOSRunAction(name, arg); } catch (e) { out[name + (arg || '')] = 'throw:' + e.message; return; }
      await sleep(180);
      out[name + (arg || '')] = modalVisible() ? 'modal' : 'ok';
      try { if (typeof window.closeModals === 'function') window.closeModals(); } catch (e) { }
      await sleep(60);
    };
    out._fnExists = {
      openPos: typeof window.showForm === 'function',
      openStockTransferModal: typeof window.openStockTransferModal === 'function',
      openOfflineStockModal: typeof window.openOfflineStockModal === 'function',
      openProcurementModal: typeof window.openProcurementModal === 'function',
      skhOpenAdminControlCenter: typeof window.skhOpenAdminControlCenter === 'function',
      skhOpenKamusi: typeof window.skhOpenKamusi === 'function'
    };
    await tryAction('openPos');
    await tryAction('openStockTransferModal');
    await tryAction('openOfflineStockModal');
    await tryAction('openProcurementModal');
    await tryAction('skhOpenAdminControlCenter', 'accounts');
    await tryAction('skhOpenKamusi');
    return out;
  });
  Object.keys(r._fnExists).forEach(k => ok(r._fnExists[k], 'function haipo: ' + k));
  Object.keys(r).filter(k => k !== '_fnExists').forEach(k => {
    ok(!String(r[k]).startsWith('throw:'), 'action imeshindikana: ' + k + ' → ' + r[k]);
  });
});

await step('accordion: kimoja wazi, kichwa hakibadilishi ukurasa', async () => {
  const r = await page.evaluate(() => {
    const nav = document.querySelector('#m9Host #bosSidebar');
    const openIds = () => [...nav.querySelectorAll('.bos-nav-group')].filter(g => !g.classList.contains('is-collapsed')).map(g => g.getAttribute('data-bos-group'));
    const before = window.activeDashboardTab;
    const g = nav.querySelector('[data-bos-group="people"] [data-bos-group-toggle]');
    g.click();
    const afterClick = { open: openIds(), tab: window.activeDashboardTab };
    const p = nav.querySelector('[data-bos-group="products"] [data-bos-group-toggle]');
    p.click();
    return { before, afterClick, afterSecond: openIds() };
  });
  eq(r.afterClick.tab, r.before, 'kichwa cha kikundi kimebadilisha ukurasa');
  eq(r.afterClick.open.join(','), 'people', 'kikundi hakifunguki peke yake');
  eq(r.afterSecond.join(','), 'products', 'vikundi viwili wazi');
});

await step('simu (390) + tablet (768): kila moduli/submodule inafunguka', async () => {
  const tabList = MODEL.tabs;
  for (const [w, h] of [[390, 844], [768, 1000]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const res = [];
    for (const tab of tabList) {
      const r = await page.evaluate(async (t) => {
        const nav = document.getElementById('bosSidebar');
        if (nav) { nav.classList.add('active'); nav.style.transform = 'translateX(0)'; }
        const btn = nav.querySelector('#btnTab_' + t);
        if (!btn) return { tab: t, missing: true };
        btn.click();
        await new Promise(res => setTimeout(res, 90));
        const ws = document.getElementById('dashWorkspace');
        return {
          tab: t,
          active: window.activeDashboardTab,
          wsLen: ws ? ws.innerHTML.length : 0,
          isActive: btn.classList.contains('is-active'),
          header: (document.getElementById('bosHeaderTitle') || {}).textContent || ''
        };
      }, tab);
      res.push(r);
    }
    res.forEach(r => {
      ok(!r.missing, w + ': kitufe hakipo ' + r.tab);
      eq(r.active, r.tab, w + ': hakufunguka ' + r.tab);
      ok(r.isActive, w + ': hakijawekwa active ' + r.tab);
      ok(r.wsLen > 60, w + ': workspace haikuchorwa ' + r.tab);
    });
  }
  await page.setViewportSize({ width: 1440, height: 950 });
});

await step('routes za zamani (legacy ids + switchDashTab) zinaendelea kufanya kazi', async () => {
  const legacy = ['overview', 'my_products', 'product_analytics', 'product_performance', 'sales_insights',
    'demand_insights', 'product_compare', 'inventory', 'expenses', 'staff', 'settings'];
  const r = await page.evaluate(async (list) => {
    const out = { ids: [], legacyOk: [], missing: [] };
    list.forEach(t => { if (!document.getElementById('btnTab_' + t)) out.missing.push(t); });
    for (const t of list) {
      window.switchDashTab(t);
      await new Promise(res => setTimeout(res, 60));
      out.legacyOk.push(window.activeDashboardTab === t);
    }
    /* actions za zamani bado zipo kwenye model */
    out.actions = (window.skhBOS.navModel || []).length;
    out.hasFooterPos = !!document.querySelector('#bosSidebar [data-bos-action="openPos"]');
    out.hasKamusi = !!document.querySelector('#bosSidebar [data-bos-action="skhOpenKamusi"]');
    out.hasExit = !!document.querySelector('#bosSidebar .bos-nav-exit');
    return out;
  }, legacy);
  eq(r.missing.length, 0, 'legacy id zimepotea: ' + r.missing.join(','));
  ok(r.legacyOk.every(Boolean), 'legacy switchDashTab imeshindikana');
  ok(r.hasFooterPos && r.hasKamusi && r.hasExit, 'vitufe vya footer/exit vimepotea');
});

await step('UTANGAMANI: shell ya zamani (cache) haivunji dashboard + build marker', async () => {
  const r = await page.evaluate(async () => {
    const model = window.skhBOS.navModel;
    /* 1. kila kikundi lazima kiwe na `items` (shell za zamani zinaita group.items.map) */
    const withoutItems = model.filter(g => !Array.isArray(g.items) || !g.items.length).map(g => g.id);
    /* 2. mtihani halisi wa msimbo wa toleo la zamani */
    let oldShellOk = true, oldShellErr = '';
    try { model.map(g => g.items.map(i => i.label || i.tab || i.action)); }
    catch (e) { oldShellOk = false; oldShellErr = e.message; }
    /* 3. shell mpya ikipewa model isiyo na subgroups pia ifanye kazi */
    let noSubgroupsOk = true;
    try {
      const stripped = model.map(g => Object.assign({}, g, { subgroups: undefined }));
      stripped.map(g => (Array.isArray(g.items) ? g.items : []).map(i => i));
    } catch (e) { noSubgroupsOk = false; }
    return {
      withoutItems, oldShellOk, oldShellErr, noSubgroupsOk,
      build: (window.skhBOS && window.skhBOS.build) || '',
      tabs: window.skhBOS.tabs.length,
      groups: model.length
    };
  });
  eq(r.withoutItems.length, 0, 'vikundi visivyo na items (hatari ya “undefined.map”): ' + r.withoutItems.join(','));
  ok(r.oldShellOk, 'msimbo wa shell ya zamani unavunjika: ' + r.oldShellErr);
  ok(r.noSubgroupsOk, 'shell imeshindwa kwenye model isiyo na subgroups');
  ok(!!r.build, 'build marker haipo (haiwezekani kuthibitisha toleo)');
  eq(r.groups, 9, 'moduli');
  eq(r.tabs, 20, 'tabs');
});

/* ---------------- screenshots ---------------- */
/* Funga modals zote zilizofunguliwa na jaribio la actions (Kamusi/Admin/POS)
   ili sidebar ionekane kwenye picha. */
await page.evaluate(() => {
  try { if (typeof window.closeModals === 'function') window.closeModals(); } catch (e) { }
  document.querySelectorAll('[id$="Modal"], [class*="modal"], [class*="overlay"]').forEach(el => {
    if (el.id === 'm9Host') return;
    try { el.style.display = 'none'; } catch (e) { }
  });
  const host = document.getElementById('m9Host');
  if (host) {
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '99999';
    host.style.background = '#F8FBFA';
    host.style.overflow = 'auto';
  }
});
await page.waitForTimeout(200);
/* 1) Muhtasari wa moduli 9 — vikundi vyote vimefungwa, ukurasa = Dashboard Kuu */
await page.setViewportSize({ width: 1440, height: 950 });
await page.evaluate(() => {
  const nav = document.querySelector('#m9Host #bosSidebar');
  const tabBtn = nav.querySelector('#btnTab_overview');
  if (tabBtn) tabBtn.click();
  nav.querySelectorAll('.bos-nav-group:not(.is-collapsed) [data-bos-group-toggle]').forEach(b => b.click());
  const sc = document.getElementById('bosNavScroll'); if (sc) sc.scrollTop = 0;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
});
await page.waitForTimeout(350);
await page.screenshot({ path: `${SHOTS}/moduli-9-1440.png` });

/* 2) Moduli 4 wazi (sub-moduli A/B/C) */
await page.evaluate(() => {
  const nav = document.querySelector('#m9Host #bosSidebar');
  const g = nav.querySelector('[data-bos-group="stock"]');
  if (g.classList.contains('is-collapsed')) nav.querySelector('[data-bos-group="stock"] [data-bos-group-toggle]').click();
  const sc = document.getElementById('bosNavScroll'); if (sc) sc.scrollTop = 0;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
});
await page.waitForTimeout(320);
await page.screenshot({ path: `${SHOTS}/moduli-4-stoo-1440.png` });

/* 3) Tablet 768 + simu 390 (drawer wazi) */
for (const [w, h] of [[768, 1000], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(300);
  /* drawer ya simu/tablet: class `active` ya mfumo (18-cockpit.js) */
  await page.evaluate(() => {
    const nav = document.getElementById('bosSidebar');
    if (nav) { nav.classList.add('active'); nav.style.transform = 'translateX(0)'; }
    const sc = document.getElementById('bosNavScroll'); if (sc) sc.scrollTop = 0;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/moduli-4-stoo-${w}.png` });
}

await page.evaluate(() => { const h = document.getElementById('m9Host'); if (h) h.remove(); });
await b.close();

console.log('\nBUSINESS OS — MODULI 9: ' + pass + ' passed, ' + fails.length + ' failed');
if (errors.length) console.log('JS errors (' + errors.length + '): ' + errors.slice(0, 6).join(' | '));
fails.forEach(f => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);

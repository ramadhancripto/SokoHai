#!/usr/bin/env node
/* Stage 1A — browser verification ya shell + overview kwenye app HALISI.
   Inafungua index.html ileile (modules zote halisi), kisha:
     • inaweka shell kwenye container ya test na kuclik vikundi / kutafuta
     • inachora overview kwa backend iliyowekwa (stub) ili kuthibitisha wiring
     • inathibitisha empty state, error state na responsive
   Matumizi: node functions/local-server.js --static  (port 5055) kisha:
             node tools/test_business_os_browser.mjs
*/
import { chromium } from 'playwright';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const b = await chromium.launch({ args: ['--no-sandbox'] });
let pass = 0;
const fails = [];

async function step(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('assert imeshindikana'); pass++; }
  catch (e) { fails.push(name + ' → ' + (e && e.message)); }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'expected true'); };
const eq = (a, b2, msg) => { if (a !== b2) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b2)); };

const page = await b.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skhBOS && !!window.skhBusinessOverview, null, { timeout: 30000 });

/* ---------------- 1. Shell ---------------- */
await step('shell inajengwa na moduli 9 + tabs 20', async () => {
  const r = await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'bosHost';
    document.body.appendChild(host);
    window.skhRenderBusinessOSShell(host);
    const nav = host.querySelector('#bosSidebar');
    return {
      groups: nav.querySelectorAll('.bos-nav-group').length,
      tabs: nav.querySelectorAll('[data-bos-tab]').length,
      actions: nav.querySelectorAll('[data-bos-action]').length,
      hasWorkspace: !!host.querySelector('#dashWorkspace'),
      hasPos: !!host.querySelector('.bos-pos-btn'),
      hasExit: !!nav.querySelector('.bos-nav-exit'),
      groupTitles: [...nav.querySelectorAll('.bos-nav-group-title-text')].map(n => n.textContent.trim())
    };
  });
  eq(r.groups, 9, 'moduli 9');
  eq(r.tabs, 20, 'tabs');
  ok(r.hasWorkspace, 'dashWorkspace ipo');
  ok(r.hasPos, 'POS ipo');
  ok(r.hasExit, 'Rudi Soko Kuu ipo');
  ok(r.groupTitles.includes('Dashboard Kuu') && r.groupTitles.includes('Stoo na Usafirishaji') && r.groupTitles.includes('Udhibiti'), 'majina ya vikundi: ' + r.groupTitles.join('|'));
});

await step('kila tab ya awali ina kitufe btnTab_<tab>', async () => {
  const legacy = ['overview', 'my_products', 'product_analytics', 'product_performance', 'sales_insights',
    'demand_insights', 'product_compare', 'inventory', 'expenses', 'staff', 'settings'];
  const found = await page.evaluate(list => list.map(t => !!document.querySelector('#bosHost #btnTab_' + t)), legacy);
  legacy.forEach((t, i) => ok(found[i], 'haipo: ' + t));
});

await step('accordion: kikundi kimoja tu wazi, kichwa hufungua/kufunga', async () => {
  const r = await page.evaluate(async () => {
    const nav = document.querySelector('#bosHost #bosSidebar');
    const openIds = () => [...nav.querySelectorAll('.bos-nav-group')]
      .filter(g => !g.classList.contains('is-collapsed')).map(g => g.getAttribute('data-bos-group'));
    const grp = nav.querySelector('[data-bos-group="intel"]');
    const btn = grp.querySelector('[data-bos-group-toggle]');
    const initial = openIds();
    const tabBefore = window.activeDashboardTab;
    btn.click();
    const afterOpen = openIds();
    const aria = btn.getAttribute('aria-expanded');
    const itemsVisible = getComputedStyle(grp.querySelector('.bos-nav-group-items')).display !== 'none';
    const tabAfter = window.activeDashboardTab;
    const other = nav.querySelector('[data-bos-group="stock"] [data-bos-group-toggle]');
    other.click();
    const afterSecond = openIds();
    btn.click();                       // inafungua tena na kufunga stock
    const afterToggleBack = openIds();
    other.click(); other.click();      // funga kila kitu
    const allClosed = openIds();
    return { initial, afterOpen, aria, itemsVisible, tabBefore, tabAfter, afterSecond, afterToggleBack, allClosed };
  });
  eq(r.initial.length, 1, 'mwanzoni kikundi kimoja tu kiwazi: ' + JSON.stringify(r.initial));
  eq(r.initial[0], 'dashboard', 'kikundi cha ukurasa active (“dashboard”) kifunguke');
  eq(r.afterOpen.join(','), 'intel', 'kufungua intel hakukufunga vingine vyote');
  eq(r.aria, 'true', 'aria-expanded ya kikundi kilichofunguliwa');
  ok(r.itemsVisible, 'sub-buttons hazionekani baada ya kufungua');
  eq(r.tabBefore, r.tabAfter, 'kichwa cha kikundi kimebadilisha ukurasa (hairuhusiwi)');
  eq(r.afterSecond.join(','), 'stock', 'vikundi viwili wazi kwa wakati mmoja');
  eq(r.afterToggleBack.join(','), 'intel', 'kufungua kikundi kingine hakukufunga kilichokuwa wazi');
  eq(r.allClosed.length, 0, 'kubonyeza mara mbili hakufunge kikundi');
});

await step('sub-button pekee inafanya navigation + kikundi chake hufunguka', async () => {
  const r = await page.evaluate(async () => {
    const nav = document.querySelector('#bosHost #bosSidebar');
    // Funga kila kitu kwanza
    nav.querySelectorAll('.bos-nav-group:not(.is-collapsed) [data-bos-group-toggle]').forEach(b => b.click());
    nav.querySelector('[data-bos-group="settings"] [data-bos-group-toggle]').click();  // fungua settings
    document.querySelector('#bosHost #btnTab_settings').click();
    const openAfter = [...nav.querySelectorAll('.bos-nav-group')]
      .filter(g => !g.classList.contains('is-collapsed')).map(g => g.getAttribute('data-bos-group'));
    const group = nav.querySelector('[data-bos-group="settings"]');
    return {
      openAfter,
      active: window.activeDashboardTab,
      activeCls: document.querySelector('#bosHost #btnTab_settings').classList.contains('is-active'),
      groupActive: group.classList.contains('has-active'),
      title: (document.getElementById('bosHeaderTitle') || {}).textContent
    };
  });
  eq(r.active, 'settings', 'sub-button haikubadilisha ukurasa');
  ok(r.activeCls, 'kitufe hakijawekwa active');
  ok(r.groupActive, 'kikundi hakijawekwa hai');
  eq(r.openAfter.join(','), 'settings', 'kikundi cha ukurasa active hakifunguki kiotomatiki');
  ok(/Mipangilio/.test(r.title || ''), 'kichwa hakijabadilika: ' + r.title);
});

await step('skroli: vikundi vyote vinafikiwa, ishara inaonekana inapohitajika', async () => {
  await page.setViewportSize({ width: 1440, height: 520 });   // urefu mdogo => lazima iskroli
  await page.waitForTimeout(250);
  const r = await page.evaluate(async () => {
    const nav = document.querySelector('#bosHost #bosSidebar');
    const sc = document.querySelector('#bosHost #bosNavScroll');
    const hint = document.querySelector('#bosHost #bosNavScrollHint');
    window.skhBOS.applyOpenGroup('intel');                // kikundi kikubwa (hali maalum)
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const atTop = {
      max: sc.scrollHeight - sc.clientHeight,
      hint: getComputedStyle(hint).display,
      hasMore: nav.classList.contains('has-more-below')
    };
    sc.scrollTop = 9999;
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const sys = nav.querySelector('[data-bos-group="settings"]').getBoundingClientRect();
    const sb = sc.getBoundingClientRect();
    const atBottom = {
      scrollTop: sc.scrollTop,
      hint: getComputedStyle(hint).display,
      systemReachable: sys.top >= sb.top - 2 && sys.bottom <= sb.bottom + 2
    };
    // kitufe cha ishara kinarudisha juu? (kinaskroli chini) — tunajaribu kutoka juu
    sc.scrollTop = 0;
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    hint.click();
    await new Promise(res => setTimeout(res, 500));
    const afterHintClick = sc.scrollTop;
    return { atTop, atBottom, afterHintClick, groups: nav.querySelectorAll('.bos-nav-group').length };
  });
  eq(r.groups, 9, 'moduli 9');
  ok(r.atTop.max > 0, 'hakuna scroli ilhali maudhui yanazidi urefu');
  eq(r.atTop.hint, 'flex', 'ishara ya scroll haionekani ilhali kuna zaidi chini');
  ok(r.atTop.hasMore, 'class has-more-below haijawekwa');
  ok(r.atBottom.scrollTop > 0, 'scrollTop haikusogea (skroli haifanyi kazi)');
  ok(r.atBottom.systemReachable, 'UDHIBITI WA MFUMO haufikiwi kwa skroli');
  eq(r.atBottom.hint, 'none', 'ishara inaonekana hata baada ya kufika chini');
  ok(r.afterHintClick > 0, 'kitufe cha ishara hakiskroli');
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.waitForTimeout(200);
});

await step('simu: drawer inaskroli na accordion inafanya kazi', async () => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(250);
  const r = await page.evaluate(async () => {
    const nav = document.querySelector('#bosHost #bosSidebar');
    window.toggleDashboardSidebar();
    window.skhBOS.applyOpenGroup('intel');
    const sc = document.querySelector('#bosHost #bosNavScroll');
    const hint = document.querySelector('#bosHost #bosNavScrollHint');
    const atTop = getComputedStyle(hint).display;
    sc.scrollTop = 9999;
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const sys = nav.querySelector('[data-bos-group="settings"]').getBoundingClientRect();
    const sb = sc.getBoundingClientRect();
    return {
      drawer: nav.classList.contains('active'),
      atTop,
      scrolled: sc.scrollTop,
      systemReachable: sys.top >= sb.top - 2 && sys.bottom <= sb.bottom + 2,
      asideDoubleScroll: nav.scrollHeight > nav.clientHeight + 1,
      open: [...nav.querySelectorAll('.bos-nav-group')].filter(g => !g.classList.contains('is-collapsed')).length
    };
  });
  ok(r.drawer, 'drawer haikufunguka kwenye simu');
  eq(r.atTop, 'flex', 'ishara ya scroll haionekani kwenye simu');
  ok(r.scrolled > 0, 'skroli ya menyu haifanyi kazi kwenye simu');
  ok(r.systemReachable, 'vikundi vya mwisho havifikiki kwenye simu');
  ok(!r.asideDoubleScroll, 'scrollbar mbili zinashindana kwenye simu');
  eq(r.open, 1, 'accordion imevunjika kwenye simu');
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.waitForTimeout(200);
});

await step('tafuta moduli inachuja vikundi', async () => {
  const r = await page.evaluate(() => {
    window.skhBOSFilterNav('stoo');
    const nav = document.querySelector('#bosHost #bosSidebar');
    const hiddenGroups = [...nav.querySelectorAll('.bos-nav-group.is-filtered-out')].length;
    const invVisible = !document.querySelector('#bosHost #btnTab_inventory').classList.contains('is-filtered-out');
    window.skhBOSFilterNav('');
    const restored = nav.querySelectorAll('.bos-nav-item.is-filtered-out').length === 0;
    return { hiddenGroups, invVisible, restored };
  });
  ok(r.hiddenGroups >= 3, 'vikundi havijachujwa');
  ok(r.invVisible, 'inventory imefichwa kimakosa');
  ok(r.restored, 'kuchuja hakujasafishwa');
});

await step('active state inafuata switchDashTab ileile', async () => {
  const r = await page.evaluate(() => {
    window.switchDashTab('inventory');
    const btn = document.querySelector('#bosHost #btnTab_inventory');
    const group = btn.closest('.bos-nav-group');
    return {
      active: btn.classList.contains('is-active'),
      aria: btn.getAttribute('aria-current'),
      groupActive: group.classList.contains('has-active'),
      expanded: !group.classList.contains('is-collapsed'),
      title: (document.getElementById('bosHeaderTitle') || {}).textContent
    };
  });
  ok(r.active, 'kitufe hakijawekwa active');
  eq(r.aria, 'page', 'aria-current');
  ok(r.groupActive, 'kikundi hakijawekwa hai');
  ok(r.expanded, 'kikundi cha tab hai kimefungwa');
  ok(/Stoo/.test(r.title || ''), 'kichwa hakijabadilika: ' + r.title);
});

/* ---------------- 2. Overview kwa data ya stub ---------------- */
const stubReport = {
  summary: {
    grossSales: 1250000, completedSales: 42, pendingPaymentSales: 3, creditSales: 210000,
    returnedAmount: 25000, refundedAmount: 0, refundsPending: 12000, creditAdjusted: 0,
    creditOutstanding: 98000, voidValue: 0, netSales: 1225000, cashCollected: 900000,
    digitalPending: 15000, expenses: 145000, supplierPayments: 0
  },
  payments: { Cash: { count: 30, authoritativeAmount: 900000 }, Mpesa: { count: 8, authoritativeAmount: 260000 }, Deni: { count: 4, authoritativeAmount: 90000 } },
  cashiers: { cashierA: { salesCount: 25, grossSales: 800000 }, cashierB: { salesCount: 17, grossSales: 450000 } },
  products: {
    k1: { productId: 'p1', productName: 'Sukari 2kg', quantitySold: 40, grossSales: 320000 },
    k2: { productId: 'p2', productName: 'Mafuta 1L', quantitySold: 25, grossSales: 180000 }
  },
  inventory: { SALE: 65, RETURN: 2, VOID: 0, ADJUSTMENT: 4 },
  transactions: []
};

await step('overview inachora KPI halisi kutoka posReports (stub)', async () => {
  const r = await page.evaluate(async (report) => {
    // backend stub: posReports + sales + products cache
    const original = { wrapCallable: window.skh.wrapCallable, query: window.skh.query, getDocs: window.skh.getDocs, collection: window.skh.collection, where: window.skh.where, limit: window.skh.limit };
    window.__bosRestore = () => Object.assign(window.skh, original);
    window.skh.wrapCallable = () => async () => ({ data: JSON.parse(JSON.stringify(report)) });
    window.skh.collection = () => ({});
    window.skh.where = () => ({});
    window.skh.limit = () => ({});
    window.skh.query = () => ({});
    window.skh.getDocs = async () => ({ docs: [
      { id: 'pos_a1', data: () => ({ saleId: 'pos_a1', sellerId: 'u1', totals: { total: 25000 }, payment: { method: 'Cash' }, status: 'COMPLETED', completedAt: new Date().toISOString() }) },
      { id: 'pos_b2', data: () => ({ saleId: 'pos_b2', sellerId: 'u1', totals: { total: 18000 }, payment: { method: 'Mpesa' }, status: 'COMPLETED', completedAt: new Date(Date.now() - 3600000).toISOString() }) }
    ] });
    window.dashboardCachedData = {
      prodSnap: { forEach: (cb) => [ { title: 'Sukari 2kg', stock: 2, lowStockAlert: 5 }, { title: 'Mafuta 1L', stock: 40, lowStockAlert: 5 } ].forEach(x => cb({ data: () => x })) },
      poSnap: { forEach: (cb) => [ { status: 'pending' }, { status: 'completed' } ].forEach(x => cb({ data: () => x })) }
    };
    window.skh.currentUser = { uid: 'u1' };
    window.skh.currentUserData = { shopOwnerUid: 'u1', shopName: 'Duka la Test' };

    const host = document.createElement('div');
    host.id = 'ovHost';
    document.body.appendChild(host);
    await window.skhBusinessOverview.render(host);
    await new Promise(r2 => setTimeout(r2, 400));

    const txt = host.textContent;
    return {
      text: txt,
      cards: host.querySelectorAll('.bos-kpi').length,
      gross: txt.includes('1,250,000'),
      orders: txt.includes('42'),
      debt: txt.includes('98,000'),
      cash: txt.includes('900,000'),
      profitUnavailable: /Haipatikani kwa uhakika/.test(txt),
      topProduct: txt.includes('Sukari 2kg'),
      payRow: txt.includes('Mpesa'),
      cashierRow: txt.includes('cashierA'),
      recentSale: txt.includes('A1') || txt.includes('B2'),
      pending: /Oda za manunuzi/.test(txt),
      lowStock: /zimebaki 2/.test(txt),
      sourceBadges: host.querySelectorAll('.bos-source').length,
      followersKpi: !!host.querySelector('#kpiFollowersTotal')
    };
  }, stubReport);

  ok(r.cards >= 6, 'KPI cards: ' + r.cards);
  ok(r.gross, 'gross sales haijaonyeshwa');
  ok(r.orders, 'oda hazijaonyeshwa');
  ok(r.debt, 'madeni hayajaonyeshwa');
  ok(r.cash, 'fedha taslimu hazijaonyeshwa');
  ok(r.profitUnavailable, 'faida haijawekwa kama haipatikani');
  ok(r.topProduct, 'bidhaa inayoongoza haijaonyeshwa');
  ok(r.payRow, 'mchanganyiko wa malipo haujaonyeshwa');
  ok(r.cashierRow, 'mauzo kwa mfanyakazi hayajaonyeshwa');
  ok(r.recentSale, 'mauzo ya hivi karibuni hayajaonyeshwa');
  ok(r.pending, 'kazi zinazosubiri hazijaonyeshwa');
  ok(r.lowStock, 'tahadhari ya stoo haijaonyeshwa');
  ok(r.sourceBadges >= 6, 'source badges: ' + r.sourceBadges);
  ok(r.followersKpi, 'KPI ya wafuasi (feature ya awali) haipo');
});

await step('empty state: hakuna mauzo → hakuna namba za kubuni', async () => {
  const r = await page.evaluate(async () => {
    const zero = { summary: {}, payments: {}, cashiers: {}, products: {}, inventory: {}, transactions: [] };
    window.skh.wrapCallable = () => async () => ({ data: zero });
    window.skh.getDocs = async () => ({ docs: [] });
    window.dashboardCachedData = { prodSnap: { forEach: () => { } }, poSnap: { forEach: () => { } } };
    const host = document.createElement('div');
    host.id = 'emptyHost';
    document.body.appendChild(host);
    await window.skhBusinessOverview.render(host);
    await new Promise(r2 => setTimeout(r2, 300));
    const txt = host.textContent;
    return {
      emptySales: /Hakuna mauzo yaliyorekodiwa bado/.test(txt),
      emptyProducts: /Hakuna mauzo ya bidhaa/.test(txt),
      emptyInventory: /Hakuna bidhaa bado/.test(txt),
      zeroShown: txt.includes('TSh 0'),
      profitNa: /Haipatikani/.test(txt)
    };
  });
  ok(r.emptySales, 'empty state ya mauzo haipo');
  ok(r.emptyProducts, 'empty state ya bidhaa haipo');
  ok(r.emptyInventory, 'empty state ya stoo haipo');
  ok(r.zeroShown, 'sifuri halisi haijaonyeshwa');
  ok(r.profitNa, 'faida haijawekwa wazi');
});

await step('error state: server haijajibu → hakuna namba + retry', async () => {
  const r = await page.evaluate(async () => {
    window.skh.wrapCallable = () => async () => { throw new Error('functions/unavailable'); };
    const host = document.createElement('div');
    host.id = 'errHost';
    document.body.appendChild(host);
    await window.skhBusinessOverview.render(host);
    await new Promise(r2 => setTimeout(r2, 300));
    return {
      hasError: !!host.querySelector('.bos-error'),
      retry: /Jaribu tena/.test(host.textContent),
      noKpi: host.querySelectorAll('.bos-kpi').length === 0,
      mentionsSource: /chanzo rasmi/.test(host.textContent)
    };
  });
  ok(r.hasError, 'error state haipo');
  ok(r.retry, 'retry haipo');
  ok(r.noKpi, 'KPI zimeonyeshwa bila data');
  ok(r.mentionsSource, 'maelezo ya chanzo hayapo');
});

await step('responsive: menyu inaonekana kwenye simu, haipo kwenye desktop', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const mobile = await page.evaluate(() => {
    const btn = document.querySelector('#bosHost .bos-menu-btn');
    return getComputedStyle(btn).display !== 'none';
  });
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.waitForTimeout(200);
  const desktop = await page.evaluate(() => {
    const btn = document.querySelector('#bosHost .bos-menu-btn');
    return getComputedStyle(btn).display;
  });
  ok(mobile, 'kitufe cha menyu hakionekani kwenye simu');
  eq(desktop, 'none', 'kitufe cha menyu kinaonekana kwenye desktop');
});

await step('simu: kichwa cha kikundi KIFUNGUO sub-buttons — drawer HAIFUNGWI', async () => {
  // Hii ni regression iliyogundulika: 18-cockpit.js ina click listener kwenye
  // `document` unaofunga drawer kwa kila kitufe kisicho na `side-menu-link`.
  // Kichwa cha kikundi ni kitufe cha accordion — hakiwi kufunga drawer.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const r = await page.evaluate(async () => {
    window.skhRenderBusinessOSShell(document.getElementById('bosHost'));
    await new Promise(x => setTimeout(x, 150));
    // NB: shell imechorwa upya — vipengele hupatikana baada ya render, si kabla.
    const nav = document.querySelector('#bosHost #bosSidebar');
    const sc = document.querySelector('#bosHost #bosNavScroll');
    const hint = document.querySelector('#bosHost #bosNavScrollHint');
    if (!nav.classList.contains('active')) window.toggleDashboardSidebar();
    await new Promise(x => setTimeout(x, 320));
    const drawerOpened = nav.classList.contains('active');
    const tabBefore = window.activeDashboardTab;
    // 'people' haiko hai — kubonyeza kwake lazima kufungue sub-buttons zake
    const hdr = nav.querySelector('[data-bos-group="people"] [data-bos-group-toggle]');
    const tapHeight = Math.round(hdr.getBoundingClientRect().height);
    hdr.click();
    await new Promise(x => setTimeout(x, 320));
    const afterHeader = {
      drawer: nav.classList.contains('active'),
      left: Math.round(nav.getBoundingClientRect().left),
      peopleOpen: !nav.querySelector('[data-bos-group="people"]').classList.contains('is-collapsed'),
      peopleItemsVisible: getComputedStyle(nav.querySelector('#bosGroup_people')).display !== 'none',
      open: [...nav.querySelectorAll('.bos-nav-group')].filter(g => !g.classList.contains('is-collapsed')).length,
      tabUnchanged: window.activeDashboardTab === tabBefore
    };
    // ishara ya scroll (kama ipo) isifunge drawer
    let afterHint = null;
    if (getComputedStyle(hint).display !== 'none') {
      hint.click();
      await new Promise(x => setTimeout(x, 420));
      afterHint = { drawer: nav.classList.contains('active'), scrolled: sc.scrollTop > 0 };
    }
    // sub-button INAFAA kufunga drawer na kubadili ukurasa
    document.querySelector('#bosHost #btnTab_inventory').click();
    await new Promise(x => setTimeout(x, 320));
    const afterSub = { drawerClosed: !nav.classList.contains('active'), tab: window.activeDashboardTab };
    return { drawerOpened, tapHeight, afterHeader, afterHint, afterSub };
  });
  ok(r.drawerOpened, 'drawer haikufunguka kwenye simu');
  ok(r.tapHeight >= 40, 'kichwa cha kikundi ni kidogo mno kwa kidole: ' + r.tapHeight + 'px');
  ok(r.afterHeader.drawer, 'KICHWA CHA KIKUNDI KIMEFUNGA DRAWER (bug ya awali)');
  eq(r.afterHeader.left, 0, 'drawer imesogea nje ya kioo');
  ok(r.afterHeader.peopleOpen, 'sub-buttons hazikufunguka');
  ok(r.afterHeader.peopleItemsVisible, 'sub-buttons zimefunguliwa lakini hazionekani');
  eq(r.afterHeader.open, 1, 'accordion imevunjika kwenye simu');
  ok(r.afterHeader.tabUnchanged, 'kichwa cha kikundi kimebadilisha ukurasa');
  if (r.afterHint) {
    ok(r.afterHint.drawer, 'kitufe cha ishara ya scroll kimefunga drawer');
    ok(r.afterHint.scrolled, 'kitufe cha ishara hakiskroli kwenye simu');
  }
  ok(r.afterSub.drawerClosed, 'sub-button haikufunga drawer baada ya navigation');
  eq(r.afterSub.tab, 'inventory', 'sub-button haikubadilisha ukurasa');
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.waitForTimeout(200);
});

await step('tablet 768: drawer + accordion + vikundi vyote', async () => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(250);
  const r = await page.evaluate(async () => {
    window.skhRenderBusinessOSShell(document.getElementById('bosHost'));
    await new Promise(x => setTimeout(x, 150));
    const nav = document.querySelector('#bosHost #bosSidebar');
    if (!nav.classList.contains('active')) window.toggleDashboardSidebar();
    await new Promise(x => setTimeout(x, 320));
    // Hakikisha 'people' imefungwa kwanza, kisha ibonyeze ili ifunguke
    const peopleGrp = nav.querySelector('[data-bos-group="people"]');
    if (!peopleGrp.classList.contains('is-collapsed')) {
      nav.querySelector('[data-bos-group="people"] [data-bos-group-toggle]').click();
      await new Promise(x => setTimeout(x, 200));
    }
    nav.querySelector('[data-bos-group="people"] [data-bos-group-toggle]').click();
    await new Promise(x => setTimeout(x, 320));
    const foot = nav.querySelector('.bos-nav-footer').getBoundingClientRect();
    const box = nav.getBoundingClientRect();
    return {
      drawer: nav.classList.contains('active'),
      groups: nav.querySelectorAll('.bos-nav-group').length,
      openPeople: !nav.querySelector('[data-bos-group="people"]').classList.contains('is-collapsed'),
      staffVisible: (() => { const b = document.querySelector('#bosHost #btnTab_staff'); const r2 = b.getBoundingClientRect(); return b.offsetParent !== null && r2.height > 0; })(),
      footerVisible: foot.bottom <= box.bottom + 1 && foot.top >= box.top
    };
  });
  ok(r.drawer, 'tablet: drawer haikufunguka');
  eq(r.groups, 9, 'tablet: moduli havipo 9');
  ok(r.openPeople, 'tablet: sub-buttons za Rasilimali Watu hazikufunguka');
  ok(r.staffVisible, 'tablet: kitufe cha Wafanyakazi hakionekani');
  ok(r.footerVisible, 'tablet: footer (POS/Kamusi/Rudi Soko Kuu) haionekani');
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.waitForTimeout(200);
});

await step('entry point halisi: loadAndRenderDashboard inaweka shell + overview', async () => {
  const r = await page.evaluate(async () => {
    // Firestore stub: snapshots tupu (hakuna data ya production inaguswa)
    const emptySnap = { empty: true, size: 0, docs: [], forEach: () => { } };
    window.skh.getDocs = async () => emptySnap;
    window.skh.wrapCallable = () => async () => ({ data: { summary: {}, payments: {}, cashiers: {}, products: {}, inventory: {}, transactions: [] } });
    window.skh.currentUser = { uid: 'u1', displayName: 'Mmiliki Test' };
    window.skh.currentUserData = { shopOwnerUid: 'u1', shopName: 'Duka la Test' };
    window.skh.currentMode = 'seller';
    const host = document.getElementById('richDashboardContainer');
    host.innerHTML = '';
    await window.loadAndRenderDashboard();
    await new Promise(r2 => setTimeout(r2, 700));
    return {
      shell: !!host.querySelector('.bos-shell'),
      nav: !!host.querySelector('#bosSidebar'),
      workspace: !!host.querySelector('#dashWorkspace'),
      overview: !!host.querySelector('.bos-overview'),
      headerTitle: (host.querySelector('#bosHeaderTitle') || {}).textContent,
      legacyGone: !host.querySelector('.control-tower-wrapper:not(.bos-shell)')
    };
  });
  ok(r.shell, 'shell haikuwekwa kwenye entry point halisi');
  ok(r.nav, 'sidebar haipo');
  ok(r.workspace, 'dashWorkspace haipo');
  ok(r.overview, 'overview haikuchorwa');
  ok(/Dashibodi/.test(r.headerTitle || ''), 'kichwa: ' + r.headerTitle);
  ok(r.legacyGone, 'markup ya awali imetumika badala ya shell');
});

await step('hakuna JS error mpya kwenye ukurasa', async () => {
  const relevant = errors.filter(e => /BOS|skhBOS|skhBusinessOverview|110-|111-/.test(e));
  ok(relevant.length === 0, 'JS errors: ' + JSON.stringify(relevant.slice(0, 3)));
});

await page.screenshot({ path: process.env.BOS_SHOT || '/tmp/bos-stage1a.png', fullPage: false });
await b.close();

if (fails.length) {
  console.log('BUSINESS OS BROWSER (1A): ' + pass + ' passed, ' + fails.length + ' FAILED');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('BUSINESS OS BROWSER (1A): ' + pass + ' passed, 0 failed');

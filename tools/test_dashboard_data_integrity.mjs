#!/usr/bin/env node
/* ============================================================================
   STAGE 1 + STAGE 2 — Data integrity & POS verification (browser, app halisi)
   ----------------------------------------------------------------------------
   Stage 1 (ukurasa 4: product_analytics, inventory, expenses, staff):
     • EMPTY  → `—` / "Hakuna data", hakuna namba za kubuni
     • DATA   → namba zinazohesabiwa kutoka snapshots (fixtures za jaribio)
     • ERROR  → sanduku la hitilafu (si "hakuna data")
   Stage 2 (POS = Moduli 8):
     • ukurasa kamili unatumia terminal ILE ILE (DOM move)
     • cart / qty / total / change / offline queue / madeni / scan handlers
     • njia ya zamani (modal `showForm`) na footer POS zinaendelea kufanya kazi
   Matumizi: node functions/local-server.js --static (5055) kisha:
             node tools/test_dashboard_data_integrity.mjs
   ========================================================================== */
import { chromium } from 'playwright';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const b = await chromium.launch({ args: ['--no-sandbox'] });
let pass = 0;
const fails = [];
async function step(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('assert imeshindikana'); pass++; }
  catch (e) { fails.push(name + ' → ' + (e && e.message)); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const eq = (a, b2, m) => { if (a !== b2) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b2)); };

const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String((e && e.message) || e)));
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource|insufficient|CORS|adminWhoAmI/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)); });

/* Lugha: app default ni 'sw' — i18n halisi hubadilisha labels kuwa Kiswahili.
   Jaribio hili linapima MABANDARI (code) kwa Kiingereza ili assertions ziwe deterministic,
   kisha hatua ya mwisho inathibitisha Kiswahili kinafanya kazi. */
await page.addInitScript(() => { try { localStorage.setItem('sokohai_language', 'en'); } catch (e) { } });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skhBOS && !!window.skhDataStates, null, { timeout: 30000 });

/* Fixtures: snapshots ndogo za jaribio (haziko kwenye app; ni za test pekee) */
const FIXTURE = `
  window.__snap = (arr) => {
    const docs = arr.map((d, i) => ({ id: 'fx' + i, data: () => d }));
    return { size: docs.length, empty: docs.length === 0, forEach: fn => docs.forEach(fn) };
  };
  window.__emptyData = () => ({
    prodSnap: window.__snap([]), ledgerSnap: window.__snap([]), staffSnap: window.__snap([]), poSnap: window.__snap([]),
    totalSales: 0, totalProfit: 0, totalExpenses: 0, activeDebts: 0
  });
  window.__realData = () => ({
    prodSnap: window.__snap([
      { title: 'Sukari 25kg', category: 'Chakula', stock: 10, price: 50000, buyPrice: 40000, lowStockAlert: 5, barcode: '111', baseUnit: 'Pcs', status: 'active' },
      { title: 'Mafuta 5L', category: 'Chakula', stock: 2, price: 30000, buyPrice: 22000, lowStockAlert: 5, barcode: '222', baseUnit: 'Pcs', status: 'active' },
      { title: 'Sabuni', category: 'Usafi', stock: 0, price: 5000, buyPrice: 3000, lowStockAlert: 3, baseUnit: 'Pcs', status: 'draft' }
    ]),
    ledgerSnap: window.__snap([
      { type: 'income_offline', title: 'Mauzo ya duka', amount: 100000, date: '2026-11-01T10:00:00Z', category: 'Mauzo' },
      { type: 'income_online', title: 'Oda ya mtandao', amount: 50000, date: '2026-11-01T12:00:00Z', category: 'Mauzo' },
      { type: 'expense', title: 'Kodi ya pango', amount: 40000, date: '2026-11-02T10:00:00Z', category: 'Kodi' },
      { type: 'expense', title: 'Umeme', amount: 10000, date: '2026-11-02T11:00:00Z', category: 'Huduma' },
      { type: 'debt', title: 'Mteja A', amount: 20000, status: 'pending', date: '2026-11-02T11:30:00Z' }
    ]),
    staffSnap: window.__snap([
      { name: 'Asha', role: 'Cashier', status: 'Active', salary: 300000, paidSalary: 150000 },
      { name: 'Juma', role: 'Store', status: 'Active', salary: 250000, paidSalary: 250000 }
    ]),
    poSnap: window.__snap([{ status: 'pending' }, { status: 'received' }]),
    totalSales: 150000, totalProfit: 100000, totalExpenses: 50000, activeDebts: 20000
  });
  const host = document.createElement('div');
  host.id = 'integrityHost';
  host.style.cssText = 'position:fixed;inset:0;z-index:99990;background:#F8FBFA;overflow:auto';
  document.body.appendChild(host);
  window.skhRenderBusinessOSShell(host);
`;

async function setData(kind) {
  await page.evaluate(({ k }) => {
    if (k === 'empty') window.dashboardCachedData = window.__emptyData();
    else if (k === 'real') window.dashboardCachedData = window.__realData();
    else delete window.dashboardCachedData;
  }, { k: kind });
}
async function text(tab) {
  return page.evaluate(async (t) => {
    window.switchDashTab(t);
    await new Promise(r => setTimeout(r, 400));
    const ws = document.getElementById('dashWorkspace');
    return {
      text: (ws.innerText || '').replace(/\s+/g, ' '),
      canvases: [...ws.querySelectorAll('canvas')].map(c => c.id),
      notes: [...ws.querySelectorAll('[data-skh-nodata-for]')].map(n => n.getAttribute('data-skh-nodata-for'))
    };
  }, tab);
}

const PAGES = ['product_analytics', 'inventory', 'expenses', 'staff'];
const FAKE = ['5,000,000', '15,000,000', '1,250', '85,000,000', '45,000,000', '8.5x', '12%', 'John (Cashier)',
  'Ali Hassan', 'Sugar Bag', 'Rice 25kg', 'Samsung A55', 'Tecno Camon', 'iPhone 14', 'Main Warehouse',
  'Kariakoo Branch', 'Mbezi Branch', 'Rent (40%)', 'Present Count', 'Escrow Released', '300,000', '20000000'];

await page.evaluate(FIXTURE);

/* ---------------- STAGE 1: EMPTY ---------------- */
await step('EMPTY: kurasa 4 zinaonyesha — / "Hakuna data" (hakuna namba za kubuni)', async () => {
  await setData('empty');
  for (const t of PAGES) {
    const r = await text(t);
    ok(r.text.includes('—'), t + ': hakuna alama ya — kwa data isiyopo');
    ok(/Hakuna data|Hakuna bidhaa|Hakuna wafanyakazi|Hakuna miamala|Hakuna madeni|Hakuna maoni|Hakuna rekodi/i.test(r.text), t + ': hakuna empty state ya maandishi');
    for (const f of FAKE) ok(!r.text.includes(f), t + ': namba ya kubuni imebaki → ' + f);
  }
});

await step('EMPTY: charts zisizo na chanzo zinabadilishwa na maelezo (hakuna canvas tupu)', async () => {
  await setData('empty');
  const inv = await text('inventory');
  ok(!inv.canvases.includes('invMovementLine'), 'inventory: chart ya mwendo wa stoo haipaswi kuchorwa bila data');
  ok(!inv.canvases.includes('invDamagesChart'), 'inventory: chart ya uharibifu haipaswi kuchorwa bila data');
  const st = await text('staff');
  ok(!st.canvases.includes('chart_pAttendanceLine'), 'staff: chart ya mahudhurio haipaswi kuchorwa bila data');
  const an = await text('product_analytics');
  ok(!an.canvases.includes('chart_pCategories'), 'analytics: chart ya kategoria haipaswi kuchorwa bila bidhaa');
});

/* ---------------- STAGE 1: REAL DATA ---------------- */
await step('DATA: KPI za inventory zinahesabiwa kutoka bidhaa halisi', async () => {
  await setData('real');
  const r = await text('inventory');
  ok(r.text.includes('TOTAL SKUs 3'), 'TOTAL SKUs si 3: ' + r.text.slice(0, 160));
  ok(r.text.includes('TOTAL STOCK UNITS 12'), 'TOTAL STOCK UNITS si 12');
  ok(r.text.includes('444,000'), 'inventory value (cost) si 444,000');
  ok(r.text.includes('OUT OF STOCK 1'), 'OUT OF STOCK si 1 → ' + r.text.slice(0, 260));
  ok(r.text.includes('PENDING RECEIPTS 1'), 'PENDING RECEIPTS si 1');
  ok(r.text.includes('STOCK OVERVIEW'), 'jedwali la stoo halipo');
  ok(/Sukari 25kg/.test(r.text) && /Sabuni/.test(r.text), 'bidhaa halisi hazionekani kwenye jedwali');
});

await step('DATA: matumizi/mapato/madeni yanahesabiwa kutoka shop_ledger', async () => {
  await setData('real');
  const r = await text('expenses');
  ok(r.text.includes('REVENUE TZS 150,000'), 'REVENUE si 150,000: ' + r.text.slice(0, 200));
  ok(r.text.includes('EXPENSES TZS 50,000'), 'EXPENSES si 50,000');
  ok(r.text.includes('NET PROFIT TZS 100,000'), 'NET PROFIT si 100,000');
  ok(r.text.includes('RECEIVABLES (MATEJA) TZS 20,000'), 'RECEIVABLES si 20,000');
  ok(/Kodi ya pango/.test(r.text) && /Umeme/.test(r.text), 'miamala halisi haipo kwenye journal');
  ok(r.text.includes('General Ledger haijajengwa bado'), 'bango la GL limepotea');
});

await step('DATA: wafanyakazi/mishahara kutoka shop_staff', async () => {
  await setData('real');
  const r = await text('staff');
  ok(r.text.includes('TOTAL STAFF 2'), 'TOTAL STAFF si 2');
  ok(r.text.includes('MONTHLY PAYROLL TZS 550,000'), 'MONTHLY PAYROLL si 550,000');
  ok(/Asha/.test(r.text) && /Juma/.test(r.text), 'wafanyakazi halisi hawajaonekana');
  ok(r.text.includes('TZS 150,000'), 'malipo ya Asha hayajahesabiwa');
  ok(r.text.includes('PRESENT TODAY —'), 'PRESENT TODAY inapaswa kuwa —');
});

await step('DATA: product analytics inahesabu bidhaa + kategoria halisi', async () => {
  await setData('real');
  const r = await text('product_analytics');
  ok(r.text.includes('TOTAL PRODUCTS 3'), 'TOTAL PRODUCTS si 3 → ' + r.text.slice(0, 260));
  ok(r.text.includes('OUT OF STOCK 1') && r.text.includes('LOW STOCK 1'), 'out/low si 1/1');
  ok(r.text.includes('INVENTORY VALUE TZS 560,000'), 'inventory value (stoo × bei ya mauzo) si 560,000: ' + r.text.slice(0, 200));
  ok(r.canvases.includes('chart_pCategories') && r.canvases.includes('chart_pHealth'), 'charts halisi hazijachorwa');
  ok(/Sukari 25kg/.test(r.text), 'maoni ya bidhaa halisi hayapo');
});

await step('LUGHA: Kiswahili (default ya app) kinaonyesha namba zile zile', async () => {
  await setData('real');
  const r = await page.evaluate(async () => {
    if (typeof window.skhSetLang === 'function') window.skhSetLang('sw');
    await new Promise(res => setTimeout(res, 300));
    window.switchDashTab('inventory');
    await new Promise(res => setTimeout(res, 450));
    const t = (document.getElementById('dashWorkspace').innerText || '').replace(/\s+/g, ' ');
    if (typeof window.skhSetLang === 'function') window.skhSetLang('en');
    return { t };
  });
  ok(/\b3\b/.test(r.t) && r.t.includes('12') && r.t.includes('444,000'), 'SW: namba za KPI hazipo → ' + r.t.slice(0, 200));
  ok(/Sukari 25kg/.test(r.t), 'SW: majina ya bidhaa yamepotea');
});

/* ---------------- STAGE 1: ERROR STATE ---------------- */
await step('ERROR: data isipopakiwa → sanduku la hitilafu (si empty state)', async () => {
  await setData('none');
  const r = await text('staff');
  ok(/haijapakiwa|not loaded/i.test(r.text), 'hakuna error state');
  /* kitufe cha kujaribu tena: kinapimwa kwa handler (label inatafsiriwa na i18n) */
  const wired = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#dashWorkspace button')];
    const b2 = bs.find(x => /loadAndRenderDashboard/.test(x.getAttribute('onclick') || ''));
    return { found: !!b2, label: b2 ? (b2.textContent || '').trim() : '', count: bs.length };
  });
  ok(wired.found, 'hakuna kitufe cha kujaribu tena kinachotumia loadAndRenderDashboard (buttons: ' + wired.count + ')');
  ok(wired.label.length > 0, 'kitufe cha kujaribu tena hakina maandishi');
  ok(!/Hakuna wafanyakazi/.test(r.text), 'error state imechanganywa na empty state');
});

/* ---------------- STAGE 2: POS ---------------- */
await step('POS: ukurasa (Moduli 8) unatumia terminal ILE ILE (nodi hiyo hiyo)', async () => {
  await setData('real');
  const r = await page.evaluate(async () => {
    const formBefore = document.getElementById('businessOSForm');
    formBefore.dataset.testMarker = 'pos-node-1';
    const parentBefore = formBefore.parentElement ? (formBefore.parentElement.id || formBefore.parentElement.tagName) : null;
    window.switchDashTab('pos_page');
    await new Promise(res => setTimeout(res, 400));
    const form = document.getElementById('businessOSForm');
    const ws = document.getElementById('dashWorkspace');
    const inPage = !!(form && ws && ws.contains(form));
    /* rudi kwenye ukurasa mwingine: fomu irejeshwe mahali pake */
    window.switchDashTab('overview');
    await new Promise(res => setTimeout(res, 300));
    const back = document.getElementById('businessOSForm');
    return {
      sameNode: form === formBefore,
      marker: !!back && back.dataset.testMarker === 'pos-node-1',
      inPage,
      backHome: !!(back && back.parentElement && (back.parentElement.id || back.parentElement.tagName) === parentBefore),
      embedded: !!window.__bosPosEmbedded
    };
  });
  ok(r.sameNode, 'umedhamini nakala mpya ya terminal (si DOM move)');
  ok(r.inPage, 'terminal haipo kwenye ukurasa wa POS');
  ok(r.marker, 'nodi ya terminal imepotea baada ya kurejeshwa');
  ok(r.backHome, 'terminal haikurejeshwa mahali pake');
  ok(!r.embedded, 'hali ya embedded haijafutwa');
});

await step('POS: cart, qty, total, change, scan, offline queue, madeni zinafanya kazi', async () => {
  const r = await page.evaluate(async () => {
    const out = { calls: [] };
    const fx = () => { };
    try {
      window.switchDashTab('pos_page');
      await new Promise(res => setTimeout(res, 250));
      /* cart */
      window.posCart = [{ productId: 'p1', name: 'Sukari', qty: 2, retailPrice: 1000, wholesalePrice: 900, isWholesale: false, unit: 'Pcs' }];
      window.renderPosCart();
      out.cartHtml = (document.getElementById('posCartItems') || {}).innerHTML || '';
      out.total = (document.getElementById('posCartTotal') || {}).textContent || '';
      window.updatePosCartQty(0, 1);                    // +1 → 3
      out.qtyAfter = (window.posCart[0] || {}).qty;
      out.totalAfter = (document.getElementById('posCartTotal') || {}).textContent || '';
      window.removePosCartItem(0);
      out.cartLenAfterRemove = window.posCart.length;
      window.posCart = [];
      window.renderPosCart();
      out.emptyCart = (document.getElementById('posCartItems') || {}).innerHTML || '';
      out.hasFns = {
        scan: typeof window.simulateBarcodeScan,
        addItem: typeof window.addPosCartItem,
        addById: typeof window.addPosCartItemById,
        switchAction: typeof window.switchPosActionType,
        togglePayment: typeof window.togglePosPaymentDetails,
        toggleDebt: typeof window.togglePosDebtFields,
        calcChange: typeof window.calculatePosChange,
        calcTotal: typeof window.calculatePosTotal,
        offlineSync: typeof (window.posOfflineSync && window.posOfflineSync.manualSync),
        debts: typeof window.loadDebtsListInLedger,
        receipt: typeof window.openPrintingModal
      };
      /* offline queue (hali halisi: tupu au iliyopo) */
      try {
        const q = window.posOfflineQueue && typeof window.posOfflineQueue.read === 'function' ? window.posOfflineQueue.read() : null;
        out.offlineQueueOk = q === null || Array.isArray(q);
      } catch (e) { out.offlineQueueOk = 'throw'; }
      /* madeni: panel ya POS */
      try { window.switchPosActionType(); out.actionOk = true; } catch (e) { out.actionOk = 'throw:' + e.message; }
      window.switchDashTab('overview');
      await new Promise(res => setTimeout(res, 250));
      out.embeddedAfterLeave = !!window.__bosPosEmbedded;
    } catch (e) {
      out.fatal = e.message;
    }
    return out;
  });
  ok(!r.fatal, 'POS imetupa hitilafu: ' + r.fatal);
  ok(/Sukari/.test(r.cartHtml), 'cart haijaonyesha bidhaa');
  ok(/2,000/.test(r.total), 'jumla ya cart si 2,000: ' + r.total);
  eq(r.qtyAfter, 3, 'qty haikuongezwa');
  ok(/3,000/.test(r.totalAfter), 'jumla baada ya kuongeza qty si 3,000: ' + r.totalAfter);
  eq(r.cartLenAfterRemove, 0, 'removePosCartItem haikufanya kazi');
  Object.entries(r.hasFns).forEach(([k, v]) => ok(v === 'function', 'handler haipo: ' + k));
  ok(r.offlineQueueOk === true, 'offline queue haisomeki');
  ok(r.actionOk === true, 'switchPosActionType imeshindikana');
  ok(r.embeddedAfterLeave === false, 'POS haikujitenga baada ya kuondoka kwenye ukurasa');
});

await step('POS: njia ya zamani (modal showForm) na footer POS zinaendelea kufanya kazi', async () => {
  const r = await page.evaluate(async () => {
    /* stub ya auth kwa jaribio pekee (haibadilishi msimbo wa app) */
    const prevUser = window.skh.currentUser;
    const prevAuth = window.skh.requireAuth;
    window.skh.currentUser = { uid: 'test-harness', email: 'harness@test' };
    window.skh.requireAuth = () => true;
    let visible = false, embedded = null, inWorkspace = null;
    try {
      window.showForm('businessOSForm');
      await new Promise(res => setTimeout(res, 150));
      const form = document.getElementById('businessOSForm');
      const ws = document.getElementById('dashWorkspace');
      visible = !!form && getComputedStyle(form).display !== 'none';
      embedded = !!window.__bosPosEmbedded;
      inWorkspace = !!(form && ws && ws.contains(form));
    } finally {
      try { if (typeof window.closeModals === 'function') window.closeModals(); } catch (e) { }
      const f = document.getElementById('businessOSForm');
      if (f) f.style.display = 'none';
      window.skh.currentUser = prevUser;
      window.skh.requireAuth = prevAuth;
    }
    /* footer POS action ipatikane kwenye sidebar */
    const footerPos = !!document.querySelector('#bosSidebar [data-bos-action="openPos"]');
    /* header POS button */
    const headerPos = !!document.querySelector('.bos-pos-btn');
    return { visible, embedded, inWorkspace, footerPos, headerPos };
  });
  ok(r.visible, 'modal ya POS (showForm) haifunguki');
  ok(r.embedded === false, 'modal imefunguliwa ikiwa embedded');
  ok(r.inWorkspace === false, 'modal ya POS imeingizwa kwenye workspace');
  ok(r.footerPos, 'kitufe cha POS cha footer kimepotea');
  ok(r.headerPos, 'kitufe cha POS cha header kimepotea');
});

/* ---------------- SETTINGS SAVE (P0 fix iliyoidhinishwa) ---------------- */
await step('SETTINGS: ukurasa unafanya kazi bila dashboardCachedData (hauteegemei cache)', async () => {
  const r = await page.evaluate(async () => {
    delete window.dashboardCachedData;
    window.switchDashTab('settings');
    await new Promise(x => setTimeout(x, 400));
    const ws = document.getElementById('dashWorkspace');
    return {
      hasForm: !!document.getElementById('btnSaveShopSettings'),
      errorBox: /haijapakiwa|not loaded/i.test(ws.innerText || '')
    };
  });
  ok(r.hasForm, 'settings haikuchorwa bila cache');
  ok(!r.errorBox, 'settings inaonyesha error box ya dashibodi (haipaswi)');
});

await step('SETTINGS: fomu inaonyesha toggles zote 7 (pamoja na ripoti 4 zilizokuwa zimepotea)', async () => {
  const r = await page.evaluate(async () => {
    window.skh.currentUserData = window.skh.currentUserData || {};
    window.skh.currentUserData.shopSettings = { stockMode: 'flexible', showSales: false, showProfit: true, showLowStock: true, showDebts: false, cashierCanViewProfit: true, cashierCanEditStock: false };
    window.switchDashTab('settings');
    await new Promise(x => setTimeout(x, 400));
    const ws = document.getElementById('dashWorkspace');
    const ids = ['setStockMode', 'setRepSales', 'setRepProfit', 'setRepLowStock', 'setRepDebts', 'setCashierViewProfit', 'setCashierEditStock', 'btnSaveShopSettings'];
    const found = {};
    ids.forEach(id => { const el = document.getElementById(id); found[id] = el ? (el.type === 'checkbox' ? el.checked : el.value) : null; });
    return { found, text: (ws.innerText || '').replace(/\s+/g, ' ').slice(0, 200) };
  });
  const f = r.found;
  ['setStockMode', 'setRepSales', 'setRepProfit', 'setRepLowStock', 'setRepDebts', 'setCashierViewProfit', 'setCashierEditStock', 'btnSaveShopSettings']
    .forEach(id => ok(f[id] !== null && f[id] !== undefined, 'kipengele hakipo: ' + id));
  eq(f.setStockMode, 'flexible', 'stockMode haijachukua thamani iliyohifadhiwa');
  eq(f.setRepSales, false, 'setRepSales haijaakisi showSales=false');
  eq(f.setRepProfit, true, 'setRepProfit haijaakisi showProfit=true');
  eq(f.setRepDebts, false, 'setRepDebts haijaakisi showDebts=false');
  eq(f.setCashierViewProfit, true, 'setCashierViewProfit haijaakisi ruhusa');
});

await step('SETTINGS: saveShopSettings inahifadhi bila TypeError na haipotezi key yoyote', async () => {
  const r = await page.evaluate(async () => {
    const saved = {};
    const orig = { updateDoc: window.skh.updateDoc, doc: window.skh.doc, alert: window.alert, log: window.addActivityLog, sw: window.switchDashTab, reload: window.loadAndRenderDashboard };
    const out = {};
    try {
      window.skh.doc = () => ({ path: 'users/test-harness' });
      window.skh.updateDoc = async (ref, payload) => { saved.payload = payload; };
      window.alert = () => { };
      window.addActivityLog = async () => { };
      window.switchDashTab = () => { };
      window.loadAndRenderDashboard = () => { };
      window.skh.currentUser = { uid: 'test-harness' };
      window.skh.currentUserData = { shopSettings: { stockMode: 'strict', showSales: true, showProfit: true, showLowStock: true, showDebts: true, cashierCanViewProfit: false, cashierCanEditStock: false, lowStockDefault: 7, customKeyKeepMe: 'x' } };
      window.switchDashTab('settings');
      await new Promise(x => setTimeout(x, 350));
      /* mtumiaji abadilishe: flexible + zima mauzo + weka faida */
      document.getElementById('setStockMode').value = 'flexible';
      document.getElementById('setRepSales').checked = false;
      document.getElementById('setRepProfit').checked = true;
      try { await window.saveShopSettings(); out.err = null; } catch (e) { out.err = e.message; }
      out.saved = saved.payload ? saved.payload.shopSettings : null;
      out.memory = window.skh.currentUserData.shopSettings;
    } finally {
      window.skh.updateDoc = orig.updateDoc; window.skh.doc = orig.doc; window.alert = orig.alert;
      window.addActivityLog = orig.log; window.switchDashTab = orig.sw; window.loadAndRenderDashboard = orig.reload;
    }
    return out;
  });
  ok(!r.err, 'saveShopSettings imetupa hitilafu: ' + r.err);
  ok(!!r.saved, 'hakuna data iliyoandikwa');
  eq(r.saved.stockMode, 'flexible', 'stockMode haijahifadhiwa');
  eq(r.saved.showSales, false, 'showSales haijahifadhiwa');
  eq(r.saved.showProfit, true, 'showProfit haijahifadhiwa');
  eq(r.saved.lowStockDefault, 7, 'key ya awali (lowStockDefault) imepotea');
  eq(r.saved.customKeyKeepMe, 'x', 'key isiyojulikana imepotea');
  eq(r.memory && r.memory.stockMode, 'flexible', 'kumbukumbu ya mtumiaji haijasasishwa');
});

await step('SETTINGS: kinga ya null — kipengele kikikosekana, save inaendelea kufanya kazi', async () => {
  const r = await page.evaluate(async () => {
    const orig = { updateDoc: window.skh.updateDoc, doc: window.skh.doc, alert: window.alert, log: window.addActivityLog, sw: window.switchDashTab, reload: window.loadAndRenderDashboard };
    const out = {};
    try {
      window.skh.doc = () => ({});
      window.skh.updateDoc = async () => { };
      window.alert = () => { }; window.addActivityLog = async () => { };
      window.switchDashTab = () => { }; window.loadAndRenderDashboard = () => { };
      window.skh.currentUser = { uid: 'test-harness' };
      window.skh.currentUserData = { shopSettings: { stockMode: 'strict', showSales: true, showProfit: true, showLowStock: true, showDebts: true, cashierCanViewProfit: false, cashierCanEditStock: false } };
      window.switchDashTab('settings');
      await new Promise(x => setTimeout(x, 350));
      ['setRepSales', 'setRepProfit', 'setRepLowStock', 'setRepDebts'].forEach(id => { const el = document.getElementById(id); if (el && el.parentElement) el.parentElement.removeChild(el); });
      try { await window.saveShopSettings(); out.err = null; } catch (e) { out.err = e.message; }
      out.after = window.skh.currentUserData.shopSettings;
    } finally {
      window.skh.updateDoc = orig.updateDoc; window.skh.doc = orig.doc; window.alert = orig.alert;
      window.addActivityLog = orig.log; window.switchDashTab = orig.sw; window.loadAndRenderDashboard = orig.reload;
    }
    return out;
  });
  ok(!r.err, 'kinga ya null imeshindikana: ' + r.err);
  eq(r.after.showSales, true, 'thamani ya awali haijahifadhiwa bila kipengele');
});

await step('LEGACY ROUTES: vitufe vya POS (header + footer) vinafungua terminal ile ile; deep-link haivunjiki', async () => {
  const r = await page.evaluate(async () => {
    const prevUser = window.skh.currentUser, prevAuth = window.skh.requireAuth;
    window.skh.currentUser = { uid: 'test-harness', email: 'harness@test' };
    window.skh.requireAuth = () => true;
    const out = {};
    const opened = () => {
      const f = document.getElementById('businessOSForm');
      return !!f && getComputedStyle(f).display !== 'none';
    };
    const hide = () => { const f = document.getElementById('businessOSForm'); if (f) f.style.display = 'none'; };
    try {
      const header = document.querySelector('.bos-pos-btn');
      if (header) { header.click(); await new Promise(x => setTimeout(x, 200)); }
      out.headerOpens = opened(); hide();
      const footer = document.querySelector('#bosSidebar [data-bos-action="openPos"]');
      if (footer) { footer.click(); await new Promise(x => setTimeout(x, 250)); }
      out.footerOpens = opened(); hide();
      out.footerAction = footer ? footer.getAttribute('data-bos-action') : null;
      /* dashboard workspace bado linafanya kazi baada ya modal */
      window.switchDashTab('overview');
      await new Promise(x => setTimeout(x, 300));
      out.overviewAfter = (document.getElementById('dashWorkspace').innerText || '').length > 40;
    } catch (e) { out.fatal = e.message; }
    window.skh.currentUser = prevUser; window.skh.requireAuth = prevAuth;
    return out;
  });
  ok(!r.fatal, 'legacy: ' + r.fatal);
  ok(r.headerOpens, 'kitufe cha POS cha header hakifungui terminal');
  ok(r.footerOpens, 'kitufe cha POS cha footer hakifungui terminal');
  eq(r.footerAction, 'openPos', 'footer POS action imebadilika');
  ok(r.overviewAfter, 'dashboard haifanyi kazi baada ya POS');

  /* deep-link ya zamani (#/product/…) haipaswi kuvunja ukurasa */
  const before = errors.length;
  await page.goto(URL + '#/product/legacy-test-id', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.skhBOS, null, { timeout: 30000 });
  const alive = await page.evaluate(() => typeof window.switchDashTab === 'function' && typeof window.skhRenderBusinessOSShell === 'function');
  ok(alive, 'deep-link ya #/product ilivunja app');
  eq(errors.length, before, 'deep-link imetoa JS error mpya');
  await page.evaluate(FIXTURE);
});

await page.evaluate(() => { const h = document.getElementById('integrityHost'); if (h) h.remove(); });
await b.close();

console.log('\nDATA INTEGRITY + POS: ' + pass + ' passed, ' + fails.length + ' failed');
if (errors.length) console.log('JS errors (' + errors.length + '): ' + errors.slice(0, 5).join(' | '));
fails.forEach(f => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);

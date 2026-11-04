#!/usr/bin/env node
/* Bidhaa Zangu — KPI 6 + filters + drill-down (browser contract test).
   Inathibitisha acceptance criteria 1–13 kwenye app HALISI kwa stub yenye
   muundo halisi wa products / orders / posReports.

   Matumizi: node functions/local-server.js --static   (port 5055)
             node tools/test_my_products_kpi_browser.mjs
*/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const SHOTS = process.env.MP_SHOTS || '/home/user/sokohai-business-os/shots/bidhaa-zangu';
mkdirSync(SHOTS, { recursive: true });

const b = await chromium.launch({ args: ['--no-sandbox'] });
let pass = 0;
const fails = [];
async function step(name, fn) {
    try { const r = await fn(); if (r === false) throw new Error('assert imeshindikana'); pass++; }
    catch (e) { fails.push(name + ' → ' + (e && e.message)); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const eq = (a, b2, m) => { if (a !== b2) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b2)); };

const dayAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

/* ---------------- stub data (muundo halisi) ---------------- */
const PRODUCTS = [
    // 1) low stock kwa lowStockAlert ya bidhaa
    { id: 'p_sukari', userId: 'u1', title: 'Sukari 2kg', category: 'Vyakula', price: 3400, stock: 2, lowStockAlert: 5, sku: 'SUK-2K', barcode: '1234567890', publicationStatus: 'published', status: 'active', baseUnit: 'Piece', views: 820, createdAt: dayAgo(80) },
    // 2) in stock
    { id: 'p_mafuta', userId: 'u1', title: 'Mafuta ya Kupikia 1L', category: 'Vyakula', price: 5200, stock: 40, lowStockAlert: 5, publicationStatus: 'published', status: 'active', baseUnit: 'Litre', views: 640, createdAt: dayAgo(60) },
    // 3) in stock, hakuna SKU
    { id: 'p_sabuni', userId: 'u1', title: 'Sabuni ya Kufulia 1kg', category: 'Usafi', price: 2800, stock: 60, lowStockAlert: 10, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', views: 310, createdAt: dayAgo(45) },
    // 4) out of stock
    { id: 'p_chumvi', userId: 'u1', title: 'Chumvi 1kg', category: 'Vyakula', price: 1200, stock: 0, lowStockAlert: 5, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', views: 90, createdAt: dayAgo(20) },
    // 5) kg ya desimali — 12.75 kg (juu ya kiwango cha 10)
    { id: 'p_mchele', userId: 'u1', title: 'Mchele (kg)', category: 'Vyakula', price: 2800, stock: 12.75, quantityPrecision: 3, lowStockAlert: 10, publicationStatus: 'published', status: 'active', baseUnit: 'Kg', views: 150, createdAt: dayAgo(30) },
    // 6) kg ya desimali — 3.5 kg (CHINI ya kiwango cha 10)
    { id: 'p_nyama', userId: 'u1', title: 'Nyama ya Ng\'ombe (kg)', category: 'Vyakula', price: 9500, stock: 3.5, quantityPrecision: 3, lowStockAlert: 10, publicationStatus: 'published', status: 'active', baseUnit: 'Kg', views: 75, createdAt: dayAgo(10) },
    // 7) variants 3 — bidhaa MOJA, si tatu
    {
        id: 'p_tshirt', userId: 'u1', title: 'T-Shirt ya Pamba', category: 'Mavazi', price: 12000, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', views: 400, createdAt: dayAgo(50),
        variantCombinations: [
            { variantId: 'v_m', sku: 'TS-M', unitId: 'piece', price: 12000, stock: 10, inventoryKey: 'p_tshirt:v_m:piece' },
            { variantId: 'v_l', sku: 'TS-L', unitId: 'piece', price: 12000, stock: 0, inventoryKey: 'p_tshirt:v_l:piece' },
            { variantId: 'v_xl', sku: 'TS-XL', unitId: 'piece', price: 12000, stock: 5, inventoryKey: 'p_tshirt:v_xl:piece' }
        ]
    },
    // 8) draft isiyo na bei — draft + sababu
    { id: 'p_draft', userId: 'u1', title: 'Kikapu cha Mpunga', category: 'Nyumbani', price: 0, stock: 4, publicationStatus: 'draft', status: 'draft', baseUnit: 'Piece', views: 5, createdAt: dayAgo(3) },
    // 9) archived → suspended
    { id: 'p_arch', userId: 'u1', title: 'Redio ya Zamani', category: 'Elektroniki', price: 25000, stock: 2, publicationStatus: 'archived', status: 'archived', archivedAt: dayAgo(5), baseUnit: 'Piece', views: 30, createdAt: dayAgo(100) },
    // 10) bila stock tracking (hakuna stock field)
    { id: 'p_untracked', userId: 'u1', title: 'Huduma ya Kupanga', category: 'Huduma', price: 5000, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', views: 12, createdAt: dayAgo(15) },
    // 11) mali ya muuzaji mwingine — HAIpaswi kuonekana
    { id: 'p_other', userId: 'u2', title: 'Bidhaa ya Muuzaji Mwingine', category: 'Vyakula', price: 999, stock: 99, publicationStatus: 'published', status: 'active' }
];

const ORDERS = [
    { id: 'o1', sellerId: 'u1', status: 'completed', createdAt: dayAgo(2), items: [{ productId: 'p_sukari', qty: 3, price: 3400 }] },
    { id: 'o2', sellerId: 'u1', status: 'delivered', createdAt: dayAgo(4), items: [{ productId: 'p_mafuta', qty: 2, price: 5200 }] },
    { id: 'o3', sellerId: 'u1', status: 'cancelled', createdAt: dayAgo(1), items: [{ productId: 'p_chumvi', qty: 5, price: 1200 }] },
    { id: 'o4', sellerId: 'u1', status: 'completed', createdAt: dayAgo(20), items: [{ productId: 'p_mchele', qty: 1, price: 2800 }] }
];

/* posReports: kipindi cha sasa = bidhaa 2 zenye units; kilichopita = 1 */
const POS_CURRENT = {
    products: {
        'a': { productId: 'p_sukari', quantitySold: 10, quantityReturned: 2, grossSales: 27200 },   // net 8
        'b': { productId: 'p_sabuni', quantitySold: 4, quantityReturned: 0, grossSales: 11200 },    // net 4
        'c': { productId: 'p_chumvi', quantitySold: 1, quantityReturned: 1, grossSales: 0 },        // net 0 → haijahesabiwa
        'd': { productId: 'p_mchele', quantitySold: 6, quantityReturned: 0, quantityVoided: 6, grossSales: 0 }  // void → haijahesabiwa
    },
    summary: { grossSales: 38400 }
};
const POS_PREVIOUS = {
    products: { 'a': { productId: 'p_sukari', quantitySold: 5, quantityReturned: 0, grossSales: 17000 } },
    summary: { grossSales: 17000 }
};

const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skh && !!window.skhRenderMyProducts, null, { timeout: 30000 });

await page.evaluate(async ({ products, orders, posCur, posPrev }) => {
    window.__posCalls = 0;
    window.__prods = products;
    window.skh.collection = (db, name) => ({ __name: name });
    window.skh.where = (f, o, v) => ({ f, o, v });
    window.skh.limit = (n) => ({ n });
    window.skh.query = (col, ...rest) => ({ col, rest });
    window.skh.getDocs = async (q) => {
        const name = q && q.col ? q.col.__name : '';
        let rows = name === 'orders' ? orders.slice() : (name === 'products' ? window.__prods.slice() : []);
        // Firestore enforces where(): scope ya mmiliki/business
        (q.rest || []).forEach(c => { if (c && c.f) rows = rows.filter(r => r[c.f] === c.v); });
        const docs = rows.map(r => ({ id: r.id, data: () => JSON.parse(JSON.stringify(r)) }));
        return { empty: docs.length === 0, docs, size: docs.length, forEach: cb => docs.forEach(cb) };
    };
    window.skh.wrapCallable = (name) => async (payload) => {
        if (name !== 'posReports') return { data: {} };
        window.__posCalls++;
        const isPrev = window.__posCalls === 2;
        return { data: JSON.parse(JSON.stringify(isPrev ? posPrev : posCur)) };
    };
    window.dashboardCachedData = { prodSnap: { forEach: () => { } }, ledgerSnap: { forEach: () => { } }, poSnap: { forEach: () => { } }, staffSnap: { forEach: () => { } } };
    window.skh.currentUser = { uid: 'u1' };
    window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'biz1', storeId: 'store1', shopName: 'Duka la Test' };
    window.skh.currentMode = 'seller';
    window.activeDashboardTab = 'my_products';

    const host = document.getElementById('mpHost') || (() => { const h = document.createElement('div'); h.id = 'mpHost'; document.body.appendChild(h); return h; })();
    host.innerHTML = '';
    window.skhRenderBusinessOSShell(host);
    window.switchDashTab('my_products');
    await new Promise(r => setTimeout(r, 900));
}, { products: PRODUCTS, orders: ORDERS, posCur: POS_CURRENT, posPrev: POS_PREVIOUS });

const cleanHost = async () => {
    await page.evaluate(() => {
        document.querySelectorAll('body > *').forEach(el => {
            if (el.id !== 'mpHost' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') el.style.display = 'none';
        });
        const h = document.getElementById('mpHost');
        h.style.position = 'relative'; h.style.background = '#F8FBFA'; h.style.minHeight = '100vh';
    });
};

/* ---------------- 1. KPI values ---------------- */
await step('1. KPI 6 zinaonyesha data halisi (si kadi za kubuni)', async () => {
    const r = await page.evaluate(() => {
        const k = window.skhMpKpi.kpis();
        const cards = [...document.querySelectorAll('.mpk-card')].map(c => ({
            kpi: c.getAttribute('data-mp-kpi'),
            value: c.querySelector('.mpk-value').textContent.trim(),
            label: c.querySelector('.mpk-label').textContent.trim()
        }));
        return { k, cards, count: cards.length };
    });
    eq(r.count, 6, 'idadi ya KPI cards');
    eq(r.k.total, 10, 'jumla ya bidhaa (bila bidhaa ya muuzaji mwingine)');
    eq(r.k.variants, 3, 'variant count');
    eq(r.k.sellable, 8, 'zinazouzwa (active + imekamilika)');
    eq(r.k.low, 2, 'stock iko chini (sukari 2, nyama 3.5)');
    eq(r.k.out, 1, 'stock imeisha (chumvi 0)');
    eq(r.k.untracked, 1, 'bila stock tracking');
    eq(r.k.draft, 1, 'draft');
    eq(r.k.suspended, 1, 'suspended');
    const byId = Object.fromEntries(r.cards.map(c => [c.kpi, c.value]));
    eq(byId.total, '10', 'kadi: jumla');
    eq(byId.low, '2', 'kadi: chini');
    eq(byId.out, '1', 'kadi: imeisha');
});

await step('2. KPI counts zinafanana na records (hesabu upya kutoka stub)', async () => {
    const r = await page.evaluate(() => {
        const rows = window.skhMpKpi.meta().rows;
        return {
            ids: rows.map(x => x.id),
            unique: new Set(rows.map(x => x.id)).size,
            variantProduct: rows.filter(x => x.id === 'p_tshirt').length,
            kgRow: rows.filter(x => x.id === 'p_nyama').map(x => x.stockInfo.available),
            otherSeller: rows.filter(x => x.id === 'p_other').length
        };
    });
    eq(r.unique, r.ids.length, 'hakuna duplicates');
    eq(r.variantProduct, 1, 'bidhaa ya variants imehesabiwa MARA MOJA');
    eq(r.otherSeller, 0, 'bidhaa ya muuzaji mwingine haijaingia');
    eq(r.kgRow[0], 3.5, 'stock ya kg inasomwa kwa desimali');
});

/* ---------------- 3. drill-down ---------------- */
await step('3. kila KPI inachuja bidhaa sahihi', async () => {
    const expect = { total: 10, sellable: 8, low: 2, out: 1, draft: 1 };
    for (const [kpi, n] of Object.entries(expect)) {
        const got = await page.evaluate((k) => {
            window.skhMpKpi.filter(k);
            return { rows: window.skhMpKpi.rows().length, active: document.querySelector('.mpk-card.is-active')?.getAttribute('data-mp-kpi') };
        }, kpi);
        eq(got.rows, n, 'KPI ' + kpi + ' inachuja');
        eq(got.active, kpi, 'kadi inayoonekana active: ' + kpi);
    }
    const low = await page.evaluate(() => {
        window.skhMpKpi.filter('all');
        window.skhMpKpi.filter('low');
        return [...document.querySelectorAll('#mpTableWrap [data-mp-product]')].map(x => x.getAttribute('data-mp-product'));
    });
    ok(low.includes('p_sukari') && low.includes('p_nyama'), 'bidhaa za stock chini: ' + low.join(','));
    ok(!low.includes('p_chumvi'), 'out-of-stock isingekuwa kwenye low');
    ok(!low.includes('p_mchele'), 'mchele 12.75kg si low');
});

await step('4. Clear filter inarudisha orodha yote', async () => {
    const r = await page.evaluate(() => {
        window.skhMpKpi.filter('low');
        window.skhMpKpi.clear();
        return { rows: window.skhMpKpi.rows().length, kpi: window.skhMpKpi.state().kpi, chip: !!document.querySelector('.mp-active-filter') };
    });
    eq(r.kpi, 'all', 'KPI filter imeondolewa');
    eq(r.rows, 10, 'orodha yote imerudi');
    eq(r.chip, false, 'chip ya filter imeondolewa');
});

await step('5. search (jina/SKU/barcode) + category + status + stock zinafanya kazi pamoja', async () => {
    const r = await page.evaluate(async () => {
        const set = (k, v) => window.skhMPFilter(k, v);
        set('q', ''); set('cat', ''); set('status', ''); set('stock', ''); window.skhMpKpi.clear();
        const bySku = (() => { set('q', 'SUK-2K'); const n = window.skhMpKpi.rows().length; set('q', ''); return n; })();
        const byBarcode = (() => { set('q', '1234567890'); const n = window.skhMpKpi.rows().length; set('q', ''); return n; })();
        set('q', 'sukari'); set('cat', 'Vyakula'); set('status', 'active'); set('stock', 'low');
        const combined = window.skhMpKpi.rows().map(x => x.id);
        const kpiPlusSearch = (() => { window.skhMpKpi.clear(); window.skhMpKpi.filter('low'); set('q', 'nyama'); const n = window.skhMpKpi.rows().length; window.skhMpKpi.clear(); return n; })();
        return { bySku, byBarcode, combined, kpiPlusSearch };
    });
    eq(r.bySku, 1, 'search kwa SKU');
    eq(r.byBarcode, 1, 'search kwa barcode');
    eq(r.combined.join(','), 'p_sukari', 'filters zote pamoja: ' + r.combined.join(','));
    eq(r.kpiPlusSearch, 1, 'KPI + search pamoja');
});

/* ---------------- 6/7. units & stock display ---------------- */
await step('7. stock ya kg/lita inahesabiwa na kuonyeshwa kwa unit yake', async () => {
    const r = await page.evaluate(() => {
        window.skhMpKpi.clear();
        window.skhMPFilter('q', 'Nyama');
        const row = document.querySelector('#mpTableWrap [data-mp-product="p_nyama"]');
        const text = row ? row.textContent : '';
        window.skhMPFilter('q', '');
        return { text, hasKg: /3\.5\s*kg/.test(text) };
    });
    ok(r.hasKg, 'stock ya kg: ' + r.text.slice(0, 120));
});

await step('7b. bidhaa ya variants inaonyesha jumla ya variants, sio moja', async () => {
    const r = await page.evaluate(() => {
        window.skhMpKpi.clear();
        window.skhMPFilter('q', 'T-Shirt');
        const row = document.querySelector('#mpTableWrap [data-mp-product="p_tshirt"]');
        const t = row ? row.textContent : '';
        window.skhMPFilter('q', '');
        return t;
    });
    ok(/15\s*pcs/.test(r), 'jumla ya variants 15 pcs: ' + r.slice(0, 160));
    ok(/variants 3/.test(r), 'idadi ya variants imeonyeshwa');
});

/* ---------------- 8. mauzo / cancelled / pos returns ---------------- */
await step('8. KPI ya mauzo: cancelled haijahesabiwa, returns zimetolewa', async () => {
    const r = await page.evaluate(async () => {
        window.skhMpKpi.setRange('7d');
        await new Promise(r2 => setTimeout(r2, 600));
        const s = window.skhMpKpi.sales();
        return { products: s.products, units: s.units, byProduct: s.byProduct, posState: s.posState, kpi: window.skhMpKpi.kpis().soldProducts };
    });
    eq(r.kpi, 3, 'bidhaa zilizouza kwa siku 7 (sukari, mafuta, sabuni)');
    ok(!r.byProduct['p_chumvi'], 'order iliyocancelled haijahesabiwa');
    ok(!r.byProduct['p_mchele'], 'sale_void (quantityVoided) haijahesabiwa');
    eq(r.units, 17, 'jumla: orders 5 (sukari 3 + mafuta 2) + POS 12 (sukari 8 + sabuni 4); void/return hazijajumuishwa');
    eq(r.byProduct['p_sukari'], 11, 'sukari: orders 3 + POS (10-2)=8 = 11');
    eq(r.byProduct['p_sabuni'], 4, 'sabuni: POS 4 tu');
    eq(r.posState, 'ok', 'posReports imefanikiwa');
});

await step('8b. date filter inabadilisha KPI ya mauzo pekee', async () => {
    const r = await page.evaluate(async () => {
        window.skhMpKpi.setRange('30d');
        await new Promise(r2 => setTimeout(r2, 700));
        const s = window.skhMpKpi.sales();
        const k = window.skhMpKpi.kpis();
        return { sold: k.soldProducts, total: k.total, low: k.low, out: k.out, label: s.window.label };
    });
    eq(r.sold, 4, 'siku 30 inaongeza order ya siku 20');
    eq(r.total, 10, 'jumla ya bidhaa haibadiliki kwa date filter');
    eq(r.low, 2, 'stock snapshot haibadiliki kwa date filter');
    eq(r.label, 'Siku 30', 'lebo ya kipindi');
});

await step('8c. posReports isipopatikana → KPI ya mauzo inaonyesha hali ya wazi', async () => {
    const r = await page.evaluate(async () => {
        const real = window.skh.wrapCallable;
        window.skh.wrapCallable = (name) => async () => { throw new Error('PERMISSION_DENIED'); };
        window.skhMpKpi.setRange('7d');
        await new Promise(r2 => setTimeout(r2, 700));
        const live = window.skhMpKpi.sales();
        const posState = live.posState;
        const sub = [...document.querySelectorAll('.mpk-card')].find(c => c.getAttribute('data-mp-kpi') === 'sold').textContent;
        window.skh.wrapCallable = real;
        window.skhMpKpi.setRange('7d');
        await new Promise(r2 => setTimeout(r2, 600));
        return { posState: posState, sub: sub };
    });
    eq(r.posState, 'error', 'hali ya POS imerekodiwa');
    ok(/haipatikani/i.test(r.sub), 'maandishi yanaonyesha haipatikani: ' + r.sub.slice(0, 140));
});

/* ---------------- 9/10. hakuna fabricated + buttons ---------------- */
await step('9. hakuna namba za kubuni (1,250 / 45,000,000 / Rice 25kg)', async () => {
    const body = await page.evaluate(() => document.getElementById('dashWorkspace').textContent);
    ok(!/1,250|45,000,000|Rice 25kg|1,100 bidhaa/.test(body), 'kuna namba za kubuni kwenye ukurasa');
});

await step('10. vitendo vya awali vipo (Tazama/Hariri/Stoo/Utendaji/Archive) + handlers', async () => {
    const r = await page.evaluate(() => {
        window.skhMpKpi.clear();
        const card = document.querySelector('#mpTableWrap [data-mp-product]');
        const html = card ? card.innerHTML : '';
        return {
            view: /openProduct\(/.test(html), edit: /openEditModal/.test(html), stock: /skhMPStock/.test(html),
            perf: /skhRenderProductPerformance/.test(html), arch: /skhSetProductPublication/.test(html),
            /* [STAGE B] lebo ni Kiswahili: Chapisha (awali: Publish) */
            publish: /Simamisha|Chapisha|Publish/.test(html),
            fns: ['skhRenderMyProducts', 'skhMPFilter', 'skhMPRenderTable', 'skhSetProductPublication', 'skhMPStock', 'skhToggleCompare', 'skhRenderSalesInsights', 'skhRenderDemandInsights', 'skhRenderCompareProducts', 'skhRenderProductPerformance'].every(f => typeof window[f] === 'function')
        };
    });
    ok(r.view && r.edit && r.stock && r.perf && r.arch && r.publish, 'vitendo vya bidhaa: ' + JSON.stringify(r));
    ok(r.fns, 'functions zote za awali zipo');
});

await step('10b. draft inaonyesha sababu ya kutochapishwa', async () => {
    const r = await page.evaluate(() => {
        window.skhMpKpi.clear();
        window.skhMpKpi.filter('draft');
        const card = document.querySelector('#mpTableWrap [data-mp-product="p_draft"]');
        return card ? card.textContent : '';
    });
    ok(/Sababu:/.test(r) && /Bei halali/.test(r), 'sababu ya draft: ' + r.slice(0, 160));
});

/* ---------------- 11. responsive ---------------- */
await step('11. desktop 3 / tablet 2 / mobile 2 kolamu + hakuna overflow', async () => {
    const measure = async (w, h) => {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(220);
        return page.evaluate(() => {
            const grid = document.querySelector('.mpk-grid');
            const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
            const clipped = [...document.querySelectorAll('#dashWorkspace .mpk-card')].filter(c => c.scrollWidth > c.clientWidth + 2).length;
            return { cols, clipped, hScroll: document.documentElement.scrollWidth - window.innerWidth };
        });
    };
    const d = await measure(1440, 1000);
    eq(d.cols, 3, 'desktop');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/bidhaa-zangu-1440.png', fullPage: false });
    const t = await measure(768, 1024);
    eq(t.cols, 2, 'tablet');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/bidhaa-zangu-768.png', fullPage: false });
    const m = await measure(390, 844);
    eq(m.cols, 2, 'mobile');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/bidhaa-zangu-390.png', fullPage: false });
    ok(d.clipped === 0 && t.clipped === 0 && m.clipped === 0, 'kadi zilizokatwa: ' + [d.clipped, t.clipped, m.clipped].join(','));
    ok(d.hScroll <= 1 && t.hScroll <= 1 && m.hScroll <= 1, 'horizontal scroll');
    await page.setViewportSize({ width: 1440, height: 1000 });
});

/* ---------------- 12. accessibility/loading ---------------- */
await step('12. kadi ni button zenye aria-pressed; hakuna page error', async () => {
    const r = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.mpk-card')];
        return { tags: cards.map(c => c.tagName), aria: cards.every(c => c.hasAttribute('aria-pressed')), focusable: cards.every(c => c.tabIndex === 0) };
    });
    ok(r.tags.every(t => t === 'BUTTON'), 'kadi zote ni button');
    ok(r.aria && r.focusable, 'aria-pressed + focus');
    eq(errors.length, 0, 'page errors: ' + errors.join(' | '));
});

/* ---------------- 13. KPI filter + filters za kawaida ---------------- */
await step('13. KPI filter inaunganishwa na search/status + chip inaonyesha jina na matokeo', async () => {
    const r = await page.evaluate(async () => {
        window.skhMpKpi.clear(); window.skhMPFilter('q', '');
        window.skhMPFilter('q', 'sukari');
        window.skhMpKpi.filter('sellable');
        const both = window.skhMpKpi.rows().map(x => x.id);
        const chip = (document.getElementById('mpResultInfo') || {}).textContent || '';
        window.skhMPFilter('status', 'draft');      // inagongana na KPI
        const clash = window.skhMpKpi.rows().map(x => x.id);
        window.skhMPClearAll();
        await new Promise(r2 => setTimeout(r2, 300));
        return { both, clash, chip, all: document.querySelectorAll('[data-mp-product]').length };
    });
    ok(r.both.length === 1 && r.both[0] === 'p_sukari', 'KPI+search: ' + r.both.join(','));
    eq(r.clash.length, 0, 'KPI+status inayogongana = 0 (haivunjiki)');
    ok(/(Chuja|Filter)/i.test(r.chip) && /Bidhaa Zinazouzwa/i.test(r.chip) && /1 matokeo|1 result/i.test(r.chip), 'chip: ' + r.chip.slice(0, 120));
    ok(r.all >= 10, 'clear inarudisha orodha: ' + r.all);
});

/* ---------------- 14. load-more / pagination ---------------- */
await step('14. load-more: 12 kwanza kisha zote (hakuna kupoteza bidhaa)', async () => {
    const r = await page.evaluate(async () => {
        const n0 = window.__prods.length;
        for (let i = 0; i < 5; i++) {
            window.__prods.push({ id: 'p_extra' + i, userId: 'u1', title: 'Bidhaa ya Ziada ' + i, category: 'Vyakula', price: 1000 + i, stock: 20, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', createdAt: new Date(Date.now() - i * 86400000).toISOString() });
        }
        window.skhMPClearAll();
        await window.skhRenderMyProducts();          // re-query ili bidhaa mpya ziingie
        await new Promise(r2 => setTimeout(r2, 500));
        const first = document.querySelectorAll('[data-mp-product]').length;
        const btn = [...document.querySelectorAll('.mp-more')][0];
        const label = btn ? btn.textContent : '';
        if (btn) btn.click();
        await new Promise(r2 => setTimeout(r2, 400));
        const after = document.querySelectorAll('[data-mp-product]').length;
        window.__prods.length = n0;                 // rudisha data ya awali
        await window.skhRenderMyProducts();
        await new Promise(r2 => setTimeout(r2, 400));
        return { first, after, label, restored: window.skhMpKpi.meta().rows.length };
    });
    eq(r.first, 12, 'ukurasa wa kwanza');
    eq(r.after, 15, 'baada ya Onyesha zaidi');
    ok(/zimebaki/i.test(r.label), 'lebo: ' + r.label);
    eq(r.restored, 10, 'data imerejeshwa kwa screenshots');
});

/* ---------------- 15. [REVIEW F1] trend sahihi ---------------- */
await step('15. trend ya KPI 6 inalingana na data (si ▼100% ya uongo)', async () => {
    const r = await page.evaluate(async () => {
        window.__posCalls = 0;                       // kipindi cha sasa kisha kilichopita
        window.skhMpKpi.setRange('7d');
        await new Promise(r2 => setTimeout(r2, 900));
        const card = document.querySelector('.mpk-card[data-mp-kpi="sold"]');
        const trend = card.querySelector('.mpk-trend');
        return { text: trend ? trend.textContent.replace(/\s+/g, ' ').trim() : '', k: window.skhMpKpi.kpis().soldProducts, prev: window.skhMpKpi.kpis().prevSoldProducts };
    });
    eq(r.k, 3, 'bidhaa za sasa');
    eq(r.prev, 1, 'bidhaa za kipindi kilichopita');
    ok(/200%/.test(r.text) && /▲/.test(r.text), 'trend = +200% (3 dhidi ya 1): ' + r.text);
    ok(!/100%/.test(r.text), 'haionyeshi -100% ya uongo');
});

/* ---------------- 16. [REVIEW F2] POS yenye productId ya nje ---------------- */
await step('16. productId isiyo ya muuzaji haiongezi KPI 6 wala kiasi', async () => {
    const r = await page.evaluate(async () => {
        const real = window.skh.wrapCallable;
        window.skh.wrapCallable = () => async () => ({ data: { products: {
            'a': { productId: 'p_sukari', quantitySold: 10, quantityReturned: 2 },
            'g': { productId: 'p_ghost_other_seller', quantitySold: 9, quantityReturned: 0 }
        } } });
        window.__posCalls = 0;
        window.skhMpKpi.setRange('7d');
        await new Promise(r2 => setTimeout(r2, 900));
        const k = window.skhMpKpi.kpis();
        const ghostInMap = !!window.skhMpKpi.sales().byProduct['p_ghost_other_seller'];   // snapshot ya papo hapo
        window.skhMpKpi.filter('sold');
        const rows = window.skhMpKpi.rows().length;
        const chip = (document.getElementById('mpResultInfo') || {}).textContent || '';
        window.skhMPClearAll();
        window.skh.wrapCallable = real;
        window.__posCalls = 0;
        window.skhMpKpi.setRange('7d');
        await new Promise(r2 => setTimeout(r2, 700));
        return { soldProducts: k.soldProducts, soldUnits: k.soldUnits, ghostInMap: ghostInMap, rows, chip };
    });
    eq(r.ghostInMap, true, 'stub yenye bidhaa ya nje imefika kwenye map (hali halisi)');
    eq(r.soldProducts, 2, 'KPI 6 = sukari + mafuta (bidhaa ya nje haijahesabiwa)');
    eq(r.soldUnits, 13, 'kiasi: sukari (10-2)+3 order + mafuta 2 = 13; ghost 9 haijajumuishwa');
    eq(r.rows, 2, 'drill-down = kadi (haivurugiki)');
    ok(/2 matokeo/.test(r.chip), 'chip: ' + r.chip.slice(0, 80));
});

/* ---------------- 17. filter/pagination hazigusi KPI ---------------- */
await step('17. load-more na filters hazibadilishi KPI 1–5', async () => {
    const r = await page.evaluate(async () => {
        const before = window.skhMpKpi.kpis();
        const snap = { total: before.total, low: before.low, out: before.out, draft: before.draft, sellable: before.sellable };
        window.skhMPMore(); window.skhMPMore();
        window.skhMPFilter('cat', 'Vyakula');
        window.skhMPFilter('sort', 'stock');
        await new Promise(r2 => setTimeout(r2, 300));
        const after = window.skhMpKpi.kpis();
        window.skhMPClearAll();
        return { snap, after: { total: after.total, low: after.low, out: after.out, draft: after.draft, sellable: after.sellable } };
    });
    eq(JSON.stringify(r.snap), JSON.stringify(r.after), 'KPI snapshot hazibadiliki');
});

/* ---------------- screenshots za mwisho (full) ---------------- */
for (const [name, w, h] of [['1440', 1440, 1000], ['768', 768, 1024], ['390', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => { window.skhMpKpi.clear(); window.skhMPFilter('q', ''); });
    await page.waitForTimeout(300);
    await cleanHost();
    const el = await page.$('#mpHost');
    await el.screenshot({ path: `${SHOTS}/bidhaa-zangu-full-${name}.png` });
}

await b.close();
console.log('BIDHAA ZANGU KPI BROWSER: ' + pass + ' passed, ' + fails.length + ' FAILED');
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }

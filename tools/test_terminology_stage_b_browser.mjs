#!/usr/bin/env node
/* ============================================================================
   STAGE B — TERMINOLOGY & LABEL CONSISTENCY (Moduli za Bidhaa)
   ----------------------------------------------------------------------------
   Jaribio la tabia kwenye app HALISI (browser) kwa stub yenye muundo halisi wa
   products / orders / posReports. Hakuna write inayofanyika.

   Kinachothibitishwa:
     1. Keys za Kiswahili zimesajiliwa kwenye i18n (LMS) — na T() inazitumia.
     2. Hakuna lebo ya Kiingereza iliyokubaliwa kubadilishwa inayobaki kwenye
        moduli 6 zinazokaguliwa (Bidhaa Zangu, Uchambuzi, Utendaji, Maarifa,
        Mahitaji, Linganisha).
     3. Namba za KPI hazijabadilika (kabla/baada ya Stage B).
     4. Readiness (sellable) haijabadilika — bidhaa iliyochapishwa yenye stock 0
        BADO inahesabiwa (kama ilivyokuwa).
     5. Hali ya stoo haijabadilika (out/low/untracked + filter ya stoo).
     6. Vitendo vya kulinganisha vina aria-label yenye JINA LA BIDHAA na
        onclick yenye productId SAHIHI.
     7. Responsive 1440 / 768 / 390 — hakuna kukatwa kwa mlalo.

   Matumizi:  node functions/local-server.js --static      (port 5055)
              node tools/test_terminology_stage_b_browser.mjs
   ========================================================================== */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const SHOTS = process.env.STB_SHOTS || '/home/user/sokohai-business-os/shots/stage-b-terminology';
mkdirSync(SHOTS, { recursive: true });

let pass = 0;
const fails = [];
async function step(name, fn) {
    try { const r = await fn(); if (r === false) throw new Error('assert imeshindikana'); pass++; }
    catch (e) { fails.push(name + ' → ' + (e && e.message)); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
const has = (hay, needle, m) => { if (String(hay).indexOf(needle) < 0) throw new Error((m || 'haipo') + ': "' + needle + '"'); };
const hasNot = (hay, needle, m) => { if (String(hay).indexOf(needle) >= 0) throw new Error((m || 'haipaswi kuwepo') + ': "' + needle + '"'); };
/* Vichwa vya panel hutumia CSS text-transform:uppercase → linganisha bila herufi kubwa */
const hasCI = (hay, needle, m) => { if (String(hay).toLowerCase().indexOf(String(needle).toLowerCase()) < 0) throw new Error((m || 'haipo') + ': "' + needle + '"'); };
const hasNotCI = (hay, needle, m) => { if (String(hay).toLowerCase().indexOf(String(needle).toLowerCase()) >= 0) throw new Error((m || 'haipaswi kuwepo') + ': "' + needle + '"'); };

const dayAgo = n => new Date(Date.now() - n * 86400000).toISOString();

/* ---------- fixtures (muundo halisi wa Firestore) ---------- */
const P = (id, title, extra) => Object.assign({
    id, userId: 'u1', title, category: 'Vyakula', subCategory: 'Nafaka', price: 2000, buyPrice: 1500,
    stock: 40, lowStockAlert: 5, publicationStatus: 'published', status: 'active', baseUnit: 'Piece',
    image: 'a.jpg', imagesArray: ['a.jpg'], description: 'Maelezo ya kutosha kwa bidhaa hii sokoni.',
    sku: 'SKU-' + id, barcode: 'BC-' + id, createdAt: dayAgo(90), views: 100, likeCount: 5, savedCount: 3
}, extra || {});

const PRODUCTS = [
    P('p1', 'Sukari 2kg', { price: 3400, stock: 50 }),
    P('p2', 'Mafuta 1L', { price: 5200, stock: 3 }),                     // low (3 <= 5)
    P('p3', 'Sabuni 1kg', { price: 2800, stock: 0 }),                    // out — LAKINI published
    P('p4', 'Chumvi 500g', { price: 800, stock: 18, publicationStatus: 'draft', status: 'draft' })
];
const ORDERS = [
    { id: 'o1', sellerId: 'u1', status: 'completed', completedAt: dayAgo(2), createdAt: dayAgo(2), items: [{ productId: 'p1', qty: 25, price: 3400 }] },
    { id: 'o2', sellerId: 'u1', status: 'completed', completedAt: dayAgo(3), createdAt: dayAgo(3), items: [{ productId: 'p2', qty: 4, price: 5200 }] }
];
const POS = { products: {}, daily: [], summary: { grossSales: 0 }, totals: {} };

/* ==========================================================================
   1. i18n keys (Kiswahili) — bila browser
   ========================================================================== */
const fs = await import('node:fs');
const i18nSrc = fs.readFileSync('/home/user/SokoHai/js/app/32-i18n.js', 'utf8');
const KEYS_EXPECTED = {
    pa_title: 'Uchambuzi wa Bidhaa',
    an_active_products: 'BIDHAA ZILIZOCHAPISHWA',
    an_draft_products: 'BIDHAA ZA RASIMU',
    an_top_selling: 'BIDHAA INAYOONGOZA KWA MAUZO',
    an_product_growth: 'UKUAJI WA BIDHAA',
    an_inventory_value: 'THAMANI YA STOO',
    an_low_stock: 'STOO CHINI',
    an_chart_categories: 'Kategoria za Bidhaa',
    an_chart_health: 'Hali ya Stoo',
    an_chart_revenue: 'Mapato kwa Bidhaa',
    an_chart_demand: 'Mwenendo wa Mahitaji',
    an_chart_returns: 'Marejesho',
    an_chart_conversion: 'Kiwango cha Ubadilishaji',
    mpk_st_draft: 'Rasimu',
    mpk_stock_low: 'Stoo chini',
    mpk_sort_oldest: 'Ya zamani zaidi',
    mpk_sort_stock: 'Kiasi cha Stoo',
    mpk_publish: 'Chapisha',
    smp_perf_btn: 'Utendaji',
    smp_conversion: 'Kiwango cha Ubadilishaji',
    feed_title: 'Soko la Mtandaoni'
};

await step('1. keys za Kiswahili zimesajiliwa kwenye 32-i18n.js', async () => {
    const missing = [];
    for (const [k, sw] of Object.entries(KEYS_EXPECTED)) {
        const re = new RegExp("^\\s*" + k + ":\\s*\\[\\s*'[^']*'\\s*,\\s*'" + sw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'\\s*\\]", 'm');
        if (!re.test(i18nSrc)) missing.push(k + ' → ' + sw);
    }
    ok(missing.length === 0, 'keys hazipo/hazina Kiswahili sahihi: ' + missing.join(' | '));
});

/* ==========================================================================
   2. Browser
   ========================================================================== */
const b = await chromium.launch({ args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));
page.on('dialog', d => d.dismiss().catch(() => { }));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skh && !!window.skhRenderMyProducts, null, { timeout: 30000 });

await page.evaluate(({ products, orders, pos }) => {
    window.__posCalls = 0;
    window.skh.collection = (db, n) => ({ __name: n });
    window.skh.where = (f, o, v) => ({ f, o, v });
    window.skh.limit = n => ({ n });
    window.skh.query = (col, ...rest) => ({ col, rest });
    window.skh.getDocs = async (q) => {
        const name = q && q.col ? q.col.__name : '';
        let rows = name === 'orders' ? orders.slice() : (name === 'products' ? products.slice() : []);
        (q.rest || []).forEach(c => { if (c && c.f) rows = rows.filter(r => r[c.f] === c.v); });
        const docs = rows.map(r => ({ id: r.id, data: () => JSON.parse(JSON.stringify(r)) }));
        return { empty: !docs.length, docs, size: docs.length, forEach: cb => docs.forEach(cb) };
    };
    window.skh.getDoc = async (ref) => {
        const rows = ref && ref.__name === 'orders' ? orders : products;
        const row = rows.find(r => r.id === (ref && ref.id));
        return { id: ref && ref.id, exists: () => !!row, data: () => JSON.parse(JSON.stringify(row || {})) };
    };
    window.skh.updateDoc = async () => { };
    window.skh.addDoc = async () => ({ id: 'new1' });
    window.skh.deleteDoc = async () => { };
    window.skh.loadMarketSearchSignals = async () => [{ query: 'sukari', at: new Date(Date.now() - 86400000).toISOString() }];
    window.skh.wrapCallable = (name) => async () => { if (name === 'posReports') window.__posCalls++; return { data: JSON.parse(JSON.stringify(pos)) }; };
    window.skhPrompt = async () => '25';
    window.skh.currentUser = { uid: 'u1' };
    window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'biz1', storeId: 'st1', shopName: 'Duka la Jaribio' };
    window.skh.currentMode = 'seller';
    window.dashboardCachedData = {
        prodSnap: { size: products.length, forEach: cb => products.forEach(p => cb({ id: p.id, data: () => p })) },
        ledgerSnap: { size: 0, forEach: () => { } }, poSnap: { size: 0, forEach: () => { } }, staffSnap: { size: 0, forEach: () => { } },
        totalSales: 0, totalProfit: 0, totalExpenses: 0, activeDebts: 0
    };
    const host = document.createElement('div');
    host.id = 'stbHost';
    host.style.cssText = 'position:fixed;inset:0;z-index:99990;background:#F8FBFA;overflow:auto';
    document.body.appendChild(host);
    window.skhRenderBusinessOSShell(host);
}, { products: PRODUCTS, orders: ORDERS, pos: POS });

const goto = async (tab, w = 1400) => page.evaluate(async ({ t, width }) => {
    await new Promise(r => setTimeout(r, 120));
    window.switchDashTab(t);
    await new Promise(r => setTimeout(r, 2200));
    const ws = document.getElementById('dashWorkspace');
    return { text: (ws ? ws.innerText : '').replace(/[ \t]+/g, ' '), len: ws ? ws.innerText.length : 0 };
}, { t: tab, width: w });

/* ---------- 3. Bidhaa Zangu: lebo ---------- */
await step('2. Bidhaa Zangu — lebo zote zilizokubaliwa ni Kiswahili', async () => {
    const r = await goto('my_products');
    has(r.text, 'Rasimu', 'filter ya hali');
    hasNot(r.text, 'Draft', 'Draft haipaswi kubaki');
    has(r.text, 'Stoo chini', 'filter ya stoo');
    hasNot(r.text, 'Low stock', 'Low stock haipaswi kubaki');
    has(r.text, 'Ya zamani zaidi', 'sort oldest');
    hasNot(r.text, 'Oldest', 'Oldest haipaswi kubaki');
    has(r.text, 'Jina (A–Z)', 'sort name');
    hasNot(r.text, 'Name (A–Z)', 'Name (A–Z) haipaswi kubaki');
    has(r.text, 'Kiasi cha Stoo', 'sort stock qty');
    hasNot(r.text, 'Stock quantity', 'Stock quantity haipaswi kubaki');
});

await step('3. Bidhaa Zangu — vitendo: Utendaji / Chapisha (si Performance / Publish)', async () => {
    const r = await page.evaluate(() => {
        const ws = document.getElementById('dashWorkspace');
        return { text: ws.innerText.replace(/\s+/g, ' ') };
    });
    has(r.text, 'Utendaji', 'kitufe cha utendaji');
    hasNot(r.text, 'Performance', 'Performance haipaswi kubaki');
    has(r.text, 'Chapisha', 'kitufe cha kuchapisha');
    hasNot(r.text, 'Publish', 'Publish haipaswi kubaki');
});

/* ---------- 4. Namba za KPI hazijabadilika ---------- */
await step('4. KPI 6 za Bidhaa Zangu — namba hazijabadilika', async () => {
    const r = await page.evaluate(() => {
        const k = window.skhMpKpi.kpis();
        const cards = [...document.querySelectorAll('.mpk-card')].map(c => ({
            kpi: c.getAttribute('data-mp-kpi'),
            value: c.querySelector('.mpk-value').textContent.trim(),
            label: c.querySelector('.mpk-label').textContent.trim()
        }));
        return { k, cards };
    });
    eq(r.cards.length, 6, 'idadi ya KPI');
    eq(r.k.total, 4, 'jumla');
    eq(r.k.sellable, 3, 'zinazouzwa (p1,p2,p3)');
    eq(r.k.low, 1, 'stock chini');
    eq(r.k.out, 1, 'stock imeisha');
    eq(r.k.draft, 1, 'draft');
    const byId = Object.fromEntries(r.cards.map(c => [c.kpi, c.value]));
    eq(byId.total, '4', 'kadi jumla');
    eq(byId.low, '1', 'kadi chini');
    eq(byId.out, '1', 'kadi imeisha');
    eq(byId.draft, '1', 'kadi draft');
    has(r.cards.find(c => c.kpi === 'draft').label, 'Rasimu', 'lebo ya KPI ya draft');
});

/* ---------- 5. Readiness haijabadilika ---------- */
await step('5. Readiness haijabadilika — bidhaa ya stock 0 bado ni "sellable"', async () => {
    const r = await page.evaluate(() => {
        const k = window.skhMpKpi.kpis();
        return { ids: Object.keys(k.sellableIds || {}), out: Object.keys(k.outIds || {}) };
    });
    ok(r.ids.indexOf('p3') >= 0, 'p3 (stock 0, published) BADO ni sellable — hesabu haijabadilishwa');
    ok(r.out.indexOf('p3') >= 0, 'p3 pia iko kwenye "stock imeisha" — hali mbili huru');
    eq(r.ids.length, 3, 'sellable = 3');
});

/* ---------- 6. Hali ya stoo haijabadilika ---------- */
await step('6. Hali ya stoo & filter hazijabadilika', async () => {
    const r = await page.evaluate(async () => {
        window.skhMPFilter('stock', 'out');
        await new Promise(r => setTimeout(r, 400));
        const outRows = window.skhMpKpi.rows().length;
        window.skhMPClearAll();
        await new Promise(r => setTimeout(r, 400));
        const allRows = window.skhMpKpi.rows().length;
        const meta = window.skhMpKpi.meta().rows.map(x => ({ id: x.id, avail: x.stockInfo ? x.stockInfo.available : null }));
        return { outRows, allRows, meta };
    });
    eq(r.outRows, 1, 'filter "out" → bidhaa 1');
    eq(r.allRows, 4, 'baada ya Safisha → 4');
    eq(r.meta.find(m => m.id === 'p3').avail, 0, 'stock ya p3 = 0');
});

/* ---------- 7. Uchambuzi wa Bidhaa: jina + KPI + charts ---------- */
await step('7. Uchambuzi wa Bidhaa — kichwa, KPI na charts ni Kiswahili', async () => {
    const r = await goto('product_analytics');
    has(r.text, 'Uchambuzi wa Bidhaa', 'kichwa cha ukurasa');
    hasNot(r.text, 'Product Analytics Tower', 'jina la Kiingereza');
    has(r.text, 'BIDHAA ZILIZOCHAPISHWA', 'KPI active');
    hasNot(r.text, 'ACTIVE PRODUCTS', 'ACTIVE PRODUCTS');
    has(r.text, 'BIDHAA ZA RASIMU', 'KPI draft');
    hasNot(r.text, 'DRAFT PRODUCTS', 'DRAFT PRODUCTS');
    has(r.text, 'BIDHAA INAYOONGOZA KWA MAUZO', 'KPI top selling');
    has(r.text, 'UKUAJI WA BIDHAA', 'KPI growth');
    hasNot(r.text, 'PRODUCT GROWTH', 'PRODUCT GROWTH');
    has(r.text, 'THAMANI YA STOO', 'KPI inventory value');
    hasNot(r.text, 'THAMANI YA INVENTORY', 'THAMANI YA INVENTORY');
    hasCI(r.text, 'Kategoria za Bidhaa', 'chart 1');
    hasCI(r.text, 'Hali ya Stoo', 'chart 2');
    hasCI(r.text, 'Mapato kwa Bidhaa', 'chart 3');
    hasCI(r.text, 'Mwenendo wa Mahitaji', 'chart 4');
    hasCI(r.text, 'Marejesho', 'chart 5');
    hasCI(r.text, 'Kiwango cha Ubadilishaji', 'chart 6');
    hasNotCI(r.text, 'Product Categories', 'Product Categories');
    hasNotCI(r.text, 'Inventory Health', 'Inventory Health');
    hasNotCI(r.text, 'Revenue per Product', 'Revenue per Product');
    hasNotCI(r.text, 'Demand Trend', 'Demand Trend');
    hasNotCI(r.text, 'Low Stock', 'legend "Low Stock"');
    hasNotCI(r.text, 'Out of Stock', 'legend "Out of Stock"');
    hasCI(r.text, 'Stoo chini', 'legend "Stoo chini"');
});

await step('8. Uchambuzi — namba za KPI hazijabadilika + tahadhari ya uchapishaji↔stoo', async () => {
    const r = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.bos-kpi-grid > div')].map(d => ({
            label: (d.querySelector('small') || {}).textContent || '',
            value: (d.querySelector('b') || {}).textContent || '',
            hint: (d.querySelector('span') || {}).textContent || ''
        }));
        return { cards };
    });
    const by = Object.fromEntries(r.cards.map(c => [c.label.trim(), c.value.trim()]));
    eq(by['BIDHAA ZOTE'], '4', 'jumla ya bidhaa');
    eq(by['BIDHAA ZILIZOCHAPISHWA'], '3', 'zilizochapishwa (haijabadilishwa)');
    eq(by['BIDHAA ZA RASIMU'], '1', 'rasimu');
    eq(by['IMESHA STOO'], '1', 'imesha stoo');
    eq(by['STOO CHINI'], '1', 'stoo chini');
    const active = r.cards.find(c => c.label.trim() === 'BIDHAA ZILIZOCHAPISHWA');
    has(active.hint, 'haihakikishi stoo', 'hint ya uchapishaji↔stoo');
    hasCI(active.hint, 'inaonekana kwenye kadi', 'hint inaelekeza stoo kando');
});

/* ---------- 9. Utendaji wa Bidhaa ---------- */
await step('9. Utendaji wa Bidhaa — "Marejesho" (si Returns) kwenye KPI/jedwali', async () => {
    const r = await goto('product_performance');
    has(r.text, 'Marejesho', 'marejesho');
    hasNot(r.text, 'Returns', 'Returns haipaswi kubaki');
    has(r.text, 'Alama', 'alama');
});

/* ---------- 10. Maarifa ya Mauzo: chanzo ---------- */
await step('10. Maarifa ya Mauzo — "Soko la Mtandaoni" (si Uwanja wa Mchanganyiko)', async () => {
    const r = await goto('sales_insights');
    has(r.text, 'Soko la Mtandaoni', 'chanzo mp');
    hasNot(r.text, 'Uwanja wa Mchanganyiko', 'Uwanja wa Mchanganyiko');
    hasNot(r.text, 'Marketplace', 'Marketplace');
});

/* ---------- 11. Mahitaji ya Soko: ufafanuzi wa wigo ---------- */
await step('11. Mahitaji ya Soko — jina limebaki + ufafanuzi wa wigo wa duka', async () => {
    const r = await goto('demand_insights');
    has(r.text, 'Mahitaji ya Soko', 'jina la moduli limebaki');
    has(r.text, 'duka lako mwenyewe', 'ufafanuzi wa wigo');
    has(r.text, 'si kipimo cha mahitaji ya soko kwa ujumla', 'kanusho la soko kwa ujumla');
});

/* ---------- 12. Linganisha Bidhaa: aria-label + productId ---------- */
await step('12. Linganisha — aria-label yenye jina la bidhaa + onclick yenye productId sahihi', async () => {
    await goto('product_compare');
    const r = await page.evaluate(async () => {
        const to = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res('T'), ms))]);
        await to(Promise.resolve(window.skhComparePick('p1')), 2000);
        await to(Promise.resolve(window.skhComparePick('p3')), 2000);
        await new Promise(res => setTimeout(res, 400));
        await to(Promise.resolve(window.skhCompareRun()), 4000);
        await new Promise(res => setTimeout(res, 1800));
        const ws = document.getElementById('dashWorkspace');
        const btns = [...ws.querySelectorAll('.cmp-ph-actions button')].map(b => ({
            text: (b.textContent || '').trim(),
            aria: b.getAttribute('aria-label') || '',
            onclick: b.getAttribute('onclick') || ''
        }));
        return { btns, head: [...ws.querySelectorAll('.cmp-ph-title')].map(e => e.textContent.trim()) };
    });
    ok(r.btns.length >= 6, 'vitufe vya vitendo vipo: ' + r.btns.length);
    eq(r.head.length, 2, 'bidhaa 2 zinaonyeshwa');
    const missingAria = r.btns.filter(b => !b.aria);
    eq(missingAria.length, 0, 'kila kitufe kina aria-label: ' + JSON.stringify(missingAria.map(m => m.text)));
    // kila kitufe cha bidhaa p1 kina jina "Sukari 2kg"; p3 → "Sabuni 1kg"
    const wrong = r.btns.filter(b => {
        const idP1 = b.onclick.indexOf("'p1'") >= 0 || b.onclick.indexOf('\\u0027p1') >= 0 || /['"]p1['"]/.test(b.onclick);
        const idP3 = /['"]p3['"]/.test(b.onclick);
        if (idP1 && b.text !== '×') { if (b.aria.indexOf('Sukari 2kg') < 0) return true; }
        if (idP3 && b.text !== '×') { if (b.aria.indexOf('Sabuni 1kg') < 0) return true; }
        return false;
    });
    eq(wrong.length, 0, 'aria-label ina jina la bidhaa sahihi: ' + JSON.stringify(wrong.map(w => w.text + '|' + w.aria + '|' + w.onclick)));
    const removeBtns = r.btns.filter(b => b.text === '×');
    ok(removeBtns.length === 2 && removeBtns.every(b => /Sukari 2kg|Sabuni 1kg/.test(b.aria)), 'kitufe cha kuondoa pia kina muktadha');
});

/* ---------- 13. Responsive ---------- */
const TABS_RESP = ['my_products', 'product_analytics', 'product_performance', 'product_compare'];
for (const w of [1440, 768, 390]) {
    await step('13.' + w + ' responsive @' + w + ' — hakuna kukatwa kwa mlalo', async () => {
        const out = [];
        for (const t of TABS_RESP) {
            await page.setViewportSize({ width: w, height: 1000 });
            await page.evaluate((tab) => window.switchDashTab(tab), t);
            await new Promise(r => setTimeout(r, 1600));
            const m = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                len: (document.getElementById('dashWorkspace') || {}).innerText ? document.getElementById('dashWorkspace').innerText.length : 0
            }));
            out.push({ t, ...m });
        }
        const bad = out.filter(o => o.overflow > 0 || o.len < 50);
        eq(bad.length, 0, 'kukatwa/tupu: ' + JSON.stringify(bad));
    });
}

/* ---------- 14. Hakuna error ---------- */
await step('14. Hakuna JS error wakati wa hatua zote', async () => {
    eq(errors.length, 0, 'errors: ' + errors.slice(0, 3).join(' | '));
});

/* ---------- screenshots ---------- */
const shotTabs = [['my_products', 'bidhaa-zangu'], ['product_analytics', 'uchambuzi'], ['product_performance', 'utendaji'], ['sales_insights', 'maarifa'], ['demand_insights', 'mahitaji'], ['product_compare', 'linganisha']];
for (const [tab, name] of shotTabs) {
    for (const w of [1440, 768, 390]) {
        await page.setViewportSize({ width: w, height: 1100 });
        await page.evaluate((t) => window.switchDashTab(t), tab);
        await new Promise(r => setTimeout(r, 1700));
        await page.screenshot({ path: SHOTS + '/' + name + '-' + w + '.png', fullPage: false });
    }
}

await b.close();
console.log('\nSTAGE B — TERMINOLOGY BROWSER: ' + pass + ' passed, ' + fails.length + ' FAILED');
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }

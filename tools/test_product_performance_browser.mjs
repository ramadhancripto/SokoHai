#!/usr/bin/env node
/* Utendaji wa Bidhaa (product_performance) — browser contract test.
   Inathibitisha acceptance criteria 1–19 kwenye app HALISI kwa stub yenye
   muundo halisi wa products / orders / posReports.

   Matumizi: node functions/local-server.js --static   (port 5055)
             node tools/test_product_performance_browser.mjs
*/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const SHOTS = process.env.PF_SHOTS || '/home/user/sokohai-business-os/shots/utendaji-bidhaa';
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

const P = (id, title, extra) => Object.assign({
    id, userId: 'u1', title, category: 'Vyakula', price: 2000, stock: 40, lowStockAlert: 5,
    publicationStatus: 'published', status: 'active', baseUnit: 'Piece',
    imagesArray: ['x.jpg'], description: 'Maelezo ya kutosha kwa bidhaa hii ili kukidhi ukamilifu wa taarifa za bidhaa sokoni.', sku: 'SKU-' + id,
    createdAt: dayAgo(120)
}, extra || {});

const PRODUCTS = [
    P('p_top', 'Sukari 2kg', { price: 3400, stock: 50, sku: 'SUK-2K' }),
    P('p_grow', 'Mafuta 1L', { price: 5200, stock: 30 }),
    P('p_decline', 'Sabuni 1kg', { price: 2800, stock: 25 }),
    P('p_slow', 'Chumvi 500g', { price: 800, stock: 18 }),
    P('p_nosales', 'Kikapu cha Mpunga', { price: 4500, stock: 20, category: 'Nyumbani', createdAt: dayAgo(100) }),
    P('p_returns', 'T-Shirt ya Pamba', { price: 12000, stock: 15, category: 'Mavazi' }),
    P('p_out', 'Mchele 5kg', { price: 15000, stock: 0 }),
    P('p_new', 'Bidhaa Mpya', { price: 3000, stock: 5, createdAt: dayAgo(3) }),
    P('p_other', 'Bidhaa ya Muuzaji Mwingine', { userId: 'u2', price: 999, stock: 99 })
];

function ord(id, pid, qty, days, status) {
    return { id, sellerId: 'u1', status: status || 'completed', completedAt: dayAgo(days), items: [{ productId: pid, qty, price: 3000 }] };
}
const ORDERS = [
    ord('o1', 'p_top', 25, 3),
    ord('o2', 'p_grow', 8, 2), ord('o3', 'p_grow', 4, 40),
    ord('o4', 'p_decline', 2, 2), ord('o5', 'p_decline', 10, 40),
    ord('o6', 'p_slow', 1, 4),
    ord('o7', 'p_top', 9, 3, 'cancelled'),      // haijahesabiwa
    ord('o8', 'p_nosales', 6, 3, 'pending')     // haijahesabiwa
];
const POS = {
    products: {
        'p_returns:product:piece': { productId: 'p_returns', quantitySold: 4, quantityReturned: 2, quantityVoided: 0, grossSales: 48000, returnsValue: 24000, netSales: 24000 },
        'p_top:p1:piece': { productId: 'p_top', quantitySold: 5, quantityReturned: 0, quantityVoided: 1, grossSales: 17000, returnsValue: 0, netSales: 13600 }
    }
};
const POS_PREV = {
    products: { 'p_decline:product:piece': { productId: 'p_decline', quantitySold: 3, quantityReturned: 0, quantityVoided: 0, grossSales: 8400, returnsValue: 0, netSales: 8400 } }
};

const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));
page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skh && !!window.skhRenderProductPerformance, null, { timeout: 30000 });

async function mount(posBroken) {
    await page.evaluate(async ({ products, orders, pos, posPrev, broken }) => {
        window.__posCalls = 0;
        window.__broken = !!broken;
        window.skh.collection = (db, name) => ({ __name: name });
        window.skh.where = (f, o, v) => ({ f, o, v });
        window.skh.limit = (n) => ({ n });
        window.skh.query = (col, ...rest) => ({ col, rest });
        window.skh.getDocs = async (q) => {
            const name = q && q.col ? q.col.__name : '';
            let rows = name === 'orders' ? orders.slice() : (name === 'products' ? products.slice() : []);
            (q.rest || []).forEach(c => { if (c && c.f) rows = rows.filter(r => r[c.f] === c.v); });
            const docs = rows.map(r => ({ id: r.id, data: () => JSON.parse(JSON.stringify(r)) }));
            return { empty: docs.length === 0, docs, size: docs.length, forEach: cb => docs.forEach(cb) };
        };
        window.skh.wrapCallable = (name) => async () => {
            if (name !== 'posReports') return { data: {} };
            if (window.__broken) throw new Error('POS imezimwa kwa jaribio');
            window.__posCalls++;
            const isPrev = window.__posCalls % 2 === 0;
            return { data: JSON.parse(JSON.stringify(isPrev ? posPrev : pos)) };
        };
        window.dashboardCachedData = { prodSnap: { forEach: () => {} }, ledgerSnap: { forEach: () => {} }, poSnap: { forEach: () => {} }, staffSnap: { forEach: () => {} } };
        window.skh.currentUser = { uid: 'u1' };
        window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'biz1', storeId: 'store1', shopName: 'Duka la Test' };
        window.skh.currentMode = 'seller';
        window.activeDashboardTab = 'product_performance';
        const host = document.getElementById('mpHost') || (() => { const h = document.createElement('div'); h.id = 'mpHost'; document.body.appendChild(h); return h; })();
        window.skhRenderBusinessOSShell(host);
        window.switchDashTab('product_performance');
        await new Promise(r => setTimeout(r, 1400));
    }, { products: PRODUCTS, orders: ORDERS, pos: POS, posPrev: POS_PREV, broken: !!posBroken });
}

const cleanHost = async () => {
    await page.evaluate(() => {
        document.querySelectorAll('body > *').forEach(el => {
            if (el.id !== 'mpHost' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') el.style.display = 'none';
        });
        const h = document.getElementById('mpHost');
        h.style.position = 'relative'; h.style.background = '#F8FBFA'; h.style.minHeight = '100vh';
    });
};

await mount(false);

/* 1 */
await step('1. dashboard inafungua badala ya alert+redirect', async () => {
    const r = await page.evaluate(() => ({
        shell: !!document.querySelector('.pf-shell'),
        kpis: document.querySelectorAll('.pf-kpi').length,
        table: !!document.querySelector('.pf-table'),
        redirected: !!document.querySelector('[data-mp-table]')
    }));
    ok(r.shell, 'shell ya utendaji ipo');
    eq(r.kpis, 7, 'KPI chips 6 + "zote"');
    ok(r.table, 'jedwali lipo');
    ok(!errors.some(e => /^dialog:/.test(e)), 'hakuna alert(): ' + errors.filter(e => /^dialog:/.test(e)).join('|'));
});

/* 2 */
await step('2. KPI 6 zinabofywa na hesabu zake ni sahihi', async () => {
    const r = await page.evaluate(() => ({
        counts: { top: window.skhPf.kpiCount('top'), growing: window.skhPf.kpiCount('growing'), declining: window.skhPf.kpiCount('declining'), no_sales: window.skhPf.kpiCount('no_sales'), returns: window.skhPf.kpiCount('returns'), action: window.skhPf.kpiCount('action') },
        recs: window.skhPf.recs().length
    }));
    eq(r.recs, 8, 'bidhaa 8 za muuzaji');
    eq(r.counts.top, 1, 'top = 1');
    eq(r.counts.growing, 1, 'growing = 1');
    eq(r.counts.declining, 1, 'declining = 1');
    eq(r.counts.no_sales, 1, 'no_sales = 1');
    eq(r.counts.returns, 1, 'returns = 1');
    ok(r.counts.action >= 4, 'action = ' + r.counts.action);
});

/* 3 */
await step('3. kubofya KPI kunachuja orodha (na kubofya tena kunarudisha)', async () => {
    const r = await page.evaluate(async () => {
        window.skhPf.kpi('declining');
        await new Promise(x => setTimeout(x, 150));
        const a = { kpi: window.skhPf.state().kpi, list: window.skhPf.filtered(), rows: document.querySelectorAll('.pf-row').length };
        window.skhPf.kpi('declining');
        await new Promise(x => setTimeout(x, 150));
        return { a, b: { kpi: window.skhPf.state().kpi, rows: document.querySelectorAll('.pf-row').length } };
    });
    eq(r.a.kpi, 'declining', 'kpi imechaguliwa');
    eq(JSON.stringify(r.a.list), JSON.stringify(['p_decline']), 'orodha = p_decline');
    eq(r.a.rows, 1, 'mstari 1 kwenye jedwali');
    eq(r.b.kpi, 'all', 'kubofya tena = zote');
    eq(r.b.rows, 8, 'mstari 8');
});

/* 4 */
await step('4. makundi A–G + N yanapangwa kwa kanuni zilizoandikwa', async () => {
    const r = await page.evaluate(() => window.skhPf.recs().reduce((m, x) => (m[x.id] = x.label, m), {}));
    eq(r.p_top, 'A', 'p_top = A');
    eq(r.p_grow, 'B', 'p_grow = B');
    eq(r.p_decline, 'C', 'p_decline = C');
    eq(r.p_slow, 'D', 'p_slow = D');
    eq(r.p_nosales, 'E', 'p_nosales = E');
    eq(r.p_returns, 'F', 'p_returns = F');
    eq(r.p_out, 'G', 'p_out = G (stock 0)');
    eq(r.p_new, 'N', 'p_new = N (mpya, si polepole)');
});

/* 5 */
await step('5. alama 0–100: parts zinajumlisha hadi total, uzito 40/25/15/10/10', async () => {
    const r = await page.evaluate(() => {
        const recs = window.skhPf.recs();
        return recs.map(x => ({ id: x.id, total: x.score, parts: x.parts, sum: Math.round(x.parts.demand + x.parts.growth + x.parts.stock + x.parts.returns + x.parts.listing) }));
    });
    r.forEach(x => { eq(x.sum, x.total, x.id + ': parts = total'); ok(x.total >= 0 && x.total <= 100, x.id + ' ndani ya 0–100'); });
    const top = r.find(x => x.id === 'p_top');
    ok(top.parts.demand > 30, 'demand ya kiongozi: ' + top.parts.demand.toFixed(1));
    eq(Math.round(r.find(x => x.id === 'p_out').parts.stock), 0, 'stock-out = 0 pointi za upatikanaji');
});

/* 6 */
await step('6. uhakika wa data (confidence) unaonyeshwa', async () => {
    const r = await page.evaluate(() => ({
        badges: document.querySelectorAll('.pf-conf').length,
        conf: window.skhPf.recs().map(x => x.confidence),
        how: (() => { window.skhPf.clear(); window.skhPf && document.querySelector('.pf-how-btn').click(); return document.querySelectorAll('.pf-how').length; })()
    }));
    ok(r.badges >= 8, 'badges: ' + r.badges);
    ok(r.conf.every(c => ['high', 'medium', 'low'].includes(c)), 'confidence values: ' + [...new Set(r.conf)].join(','));
    eq(r.how, 1, 'paneli ya "jinsi inavyohesabiwa" inafunguka');
    await page.evaluate(() => { window.skhPf.clear(); document.querySelector('.pf-how-btn').click(); });
});

/* 7 */
await step('7. bidhaa mpya haionyeshwi kama "polepole" wala "hakuna mauzo"', async () => {
    const r = await page.evaluate(() => {
        const x = window.skhPf.recs().find(r2 => r2.id === 'p_new');
        return { label: x.label, newProduct: x.newProduct, inNoSales: window.skhPf.kpiCount('no_sales') };
    });
    eq(r.label, 'N', 'label N');
    ok(r.newProduct, 'flag ya mpya');
    eq(r.inNoSales, 1, 'KPI "hakuna mauzo" haina bidhaa mpya');
});

/* 8 */
await step('8. stock-out ≠ no-sales: bidhaa iliyoisha stock ni G, si E', async () => {
    const r = await page.evaluate(() => {
        const x = window.skhPf.recs().find(r2 => r2.id === 'p_out');
        return { label: x.label, avail: x.avail, units: x.units };
    });
    eq(r.label, 'G', 'G');
    eq(r.avail, 0, 'available 0');
    eq(r.units, 0, 'units 0');
});

/* 9 */
await step('9. units/returns hazikadiriwi mara mbili; cancelled/pending hazihesabiwi', async () => {
    const r = await page.evaluate(() => {
        const m = window.skhPf.recs().reduce((a, x) => (a[x.id] = x, a), {});
        return { top: m.p_top, ret: m.p_returns, grow: m.p_grow, decline: m.p_decline };
    });
    // p_top: orders 25 (o7 cancelled haijahesabiwa) + POS net (5 - 0 - 1 void) = 29
    eq(r.top.units, 29, 'p_top units = 25 + 4');
    eq(r.top.mpUnits, 25, 'marketplace 25');
    eq(r.top.posUnits, 4, 'POS net 4 (void imetolewa)');
    eq(r.top.orders, 1, 'oda 1 (cancelled imetupwa)');
    // p_returns: POS 4 sold − 2 returned = 2 net units, returns 2
    eq(r.ret.posUnits, 2, 'p_returns POS net 2');
    eq(r.ret.returnedUnits, 2, 'returns 2');
    ok(Math.abs(r.ret.returnRate - 0.5) < 1e-9, 'return rate 50%');
    eq(r.grow.prevUnits, 4, 'grow prev 4');
    eq(r.decline.prevUnits, 13, 'decline prev = 10 + 3 (POS)');
});

/* 10 */
await step('10. vipindi: today/7d/30d/month/3m/custom + kipindi cha awali cha urefu sawa', async () => {
    const r = await page.evaluate(async () => {
        const out = {};
        for (const rg of ['7d', '30d', 'month', '3m']) {
            window.__posCalls = 0;
            await window.skhPf.setRange(rg);
            await new Promise(x => setTimeout(x, 700));
            const w = window.skhPf.window();
            const days = Math.round((w.end - w.start) / 86400000);
            out[rg] = { units: (window.skhPf.recs().find(x => x.id === 'p_top') || {}).units, days, label: w.label, prevDays: Math.round((w.prevEnd - w.prevStart) / 86400000) };
        }
        window.__posCalls = 0;
        await window.skhPf.setRange('30d');
        await new Promise(x => setTimeout(x, 700));
        return out;
    });
    eq(r['7d'].units, 29, 'siku 7 = 29');
    ok(r['30d'].days >= 29, 'siku 30 span');
    eq(r['30d'].prevDays, r['30d'].days, 'kipindi cha awali urefu sawa');
    ok(r['3m'].days >= 89, 'miezi 3 span: ' + r['3m'].days);
    ok(r['month'].label === 'Mwezi huu', 'lebo ya mwezi');
});

/* 11 */
await step('11. stock ya sasa haichujwi kwa tarehe', async () => {
    const r = await page.evaluate(async () => {
        const a = window.skhPf.recs().find(x => x.id === 'p_top').avail;
        window.__posCalls = 0;
        await window.skhPf.setRange('today');
        await new Promise(x => setTimeout(x, 700));
        const b2 = window.skhPf.recs().find(x => x.id === 'p_top').avail;
        window.__posCalls = 0;
        await window.skhPf.setRange('30d');
        await new Promise(x => setTimeout(x, 700));
        return { a, b: b2 };
    });
    eq(r.a, r.b, 'available stock ni ile ile kwa vipindi vyote');
});

/* 12 */
await step('12. sort 8 + search + filters (kategoria/label/stock/hali)', async () => {
    const r = await page.evaluate(async () => {
        const sorts = [...document.querySelectorAll('.pf-tools select')].pop().querySelectorAll('option').length;
        window.skhPf.sort('units');
        await new Promise(x => setTimeout(x, 120));
        const byUnits = window.skhPf.filtered()[0];
        window.skhPf.sort('stock');
        await new Promise(x => setTimeout(x, 120));
        const byStock = window.skhPf.filtered()[0];
        window.skhPf.filter('q', 'chumvi');
        await new Promise(x => setTimeout(x, 120));
        const search = window.skhPf.filtered();
        window.skhPf.clear();
        await new Promise(x => setTimeout(x, 120));
        window.skhPf.filter('stock', 'out');
        await new Promise(x => setTimeout(x, 120));
        const out = window.skhPf.filtered();
        window.skhPf.clear();
        await new Promise(x => setTimeout(x, 120));
        window.skhPf.filter('cat', 'Mavazi');
        await new Promise(x => setTimeout(x, 120));
        const cat = window.skhPf.filtered();
        window.skhPf.clear();
        return { sorts, byUnits, byStock, search, out, cat };
    });
    eq(r.sorts, 8, 'sort options 8');
    eq(r.byUnits, 'p_top', 'units desc');
    ok(['p_out', 'p_new'].includes(r.byStock), 'stock asc: ' + r.byStock);
    eq(JSON.stringify(r.search), JSON.stringify(['p_slow']), 'search');
    eq(JSON.stringify(r.out), JSON.stringify(['p_out']), 'stock=out');
    eq(JSON.stringify(r.cat), JSON.stringify(['p_returns']), 'category filter');
});

/* 13 */
await step('13. jedwali lina kolamu zote zinazohitajika', async () => {
    const r = await page.evaluate(() => ({
        heads: [...document.querySelectorAll('.pf-table thead th')].map(th => th.textContent.trim()),
        cells: document.querySelectorAll('.pf-row').length
    }));
    const need = ['Bidhaa', 'Category', 'Lebo', 'Alama', 'Units', 'Oda (MP)', 'Mapato', 'Stock', 'Marejesho', 'Ukuaji', 'Mauzo ya mwisho', 'Hatua'];
    need.forEach(h => ok(r.heads.includes(h), 'kolamu ' + h));
    eq(r.cells, 8, 'mstari 8');
});

/* 14 */
await step('14. maelezo ya bidhaa: breakdown ya alama + hatua zilizopo (hakuna kubadilisha bei/stock moja kwa moja)', async () => {
    const r = await page.evaluate(async () => {
        window.skhPf.detail('p_returns');
        await new Promise(x => setTimeout(x, 150));
        const box = document.querySelector('.pf-detail');
        const acts = [...document.querySelectorAll('.pf-detail .pf-actions button')].map(b => ({ t: b.textContent.trim(), h: b.getAttribute('onclick') }));
        return {
            open: !!box,
            bars: document.querySelectorAll('.pf-spart').length,
            kv: document.querySelectorAll('.pf-kv').length,
            acts,
            naTx: /Transactions \(POS\)<\/span><b class="pf-na">/.test((box || {}).innerHTML || ''),
            writeOps: acts.filter(a => /skhSetProductPublication|deleteProduct|updateDoc|setDoc/.test(a.h || ''))
        };
    });
    ok(r.open, 'panel ya maelezo imefunguka');
    eq(r.bars, 5, 'bars 5 za alama');
    ok(r.kv >= 10, 'data ya kipindi: ' + r.kv);
    ok(r.acts.length >= 4, 'hatua: ' + r.acts.map(a => a.t).join(','));
    eq(r.writeOps.length, 0, 'hakuna hatua inayobadilisha bei/stock moja kwa moja');
    await page.evaluate(async () => { window.skhPf.detail('p_returns'); await new Promise(x => setTimeout(x, 150)); });
});

/* 15 */
await step('15. tahadhari zina severity, kipindi, hatua na kiungo', async () => {
    const r = await page.evaluate(() => {
        const alerts = window.skhPf.alerts();
        return {
            n: alerts.length,
            sev: [...new Set(alerts.map(a => a.sev))],
            allHavePeriod: alerts.every(a => !!a.period),
            allHaveAction: alerts.every(a => !!a.action && !!a.href),
            outAlert: alerts.some(a => a.pid === 'p_out' && a.sev === 'high'),
            retAlert: alerts.some(a => a.pid === 'p_returns' && /Marejesho|Returns/.test(a.title)),
            shown: document.querySelectorAll('.pf-alert').length
        };
    });
    ok(r.n >= 5, 'tahadhari: ' + r.n);
    ok(r.sev.includes('high') && r.sev.includes('medium'), 'severity: ' + r.sev.join(','));
    ok(r.allHavePeriod, 'kila tahadhari ina kipindi');
    ok(r.allHaveAction, 'kila tahadhari ina hatua + kiungo');
    ok(r.outAlert, 'stock-out = tahadhari pekee');
    ok(r.retAlert, 'returns = tahadhari');
    ok(r.shown >= 3, 'tahadhari zinaonekana kwenye UI: ' + r.shown);
});

/* 16 */
await step('16. ownership: hakuna bidhaa ya muuzaji mwingine', async () => {
    const r = await page.evaluate(() => ({ ids: window.skhPf.recs().map(x => x.id), has: window.skhPf.recs().some(x => x.id === 'p_other') }));
    ok(!r.has, 'p_other haipo');
    eq(r.ids.length, 8, 'bidhaa 8');
});

/* 17 */
await step('17. POS isipopatikana: returns = Haipatikani (si 0), units ni marketplace pekee', async () => {
    await mount(true);
    const r = await page.evaluate(() => {
        const m = window.skhPf.recs().reduce((a, x) => (a[x.id] = x, a), {});
        return {
            top: m.p_top.units,
            retRate: m.p_returns.returnRate,
            warn: !!document.querySelector('.pf-warn'),
            cells: [...document.querySelectorAll('.pf-row')].map(tr => tr.textContent).filter(t => /Haipatikani/.test(t)).length,
            conf: [...new Set(window.skhPf.recs().map(x => x.confidence))]
        };
    });
    eq(r.top, 25, 'units = marketplace pekee');
    eq(r.retRate, null, 'returnRate = null (haipatikani)');
    ok(r.warn, 'onyo la POS linaonekana');
    ok(r.cells >= 8, 'cells za Haipatikani: ' + r.cells);
    ok(!r.conf.includes('high'), 'confidence haipandi bila POS: ' + r.conf.join(','));
    await mount(false);
});

/* 18 */
await step('18. charts 4 zenye lebo', async () => {
    const r = await page.evaluate(() => ({
        charts: document.querySelectorAll('.pf-chart').length,
        titles: [...document.querySelectorAll('.pf-chart > b')].map(x => x.childNodes[0].textContent.trim()),
        bars: document.querySelectorAll('.pf-bar').length
    }));
    eq(r.charts, 4, 'charts 4');
    r.titles.forEach(t => ok(t.length > 3, 'lebo: ' + t));
    ok(r.bars > 8, 'bars: ' + r.bars);
});

/* 19 */
await step('19. responsive 1440/768/390: hakuna overflow ya ukurasa', async () => {
    const measure = async (w, h) => {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(250);
        return page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            rows: document.querySelectorAll('.pf-row').length,
            cards: getComputedStyle(document.querySelector('.pf-row')).display
        }));
    };
    const d = await measure(1440, 1000);
    ok(d.overflow <= 1, 'desktop overflow: ' + d.overflow);
    await cleanHost(); await page.screenshot({ path: SHOTS + '/utendaji-1440.png' });
    const t = await measure(768, 1024);
    ok(t.overflow <= 1, 'tablet overflow: ' + t.overflow);
    await cleanHost(); await page.screenshot({ path: SHOTS + '/utendaji-768.png' });
    const m = await measure(390, 844);
    ok(m.overflow <= 1, 'mobile overflow: ' + m.overflow);
    eq(m.cards, 'block', 'mobile: safu zinakuwa kadi');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/utendaji-390.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
});

/* screenshots kamili */
for (const [name, w, h] of [['1440', 1440, 1000], ['768', 768, 1024], ['390', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await cleanHost();
    const el = await page.$('#mpHost');
    await el.screenshot({ path: `${SHOTS}/utendaji-full-${name}.png` });
}

/* 20 */
await step('20. hakuna error ya JS kwenye ukurasa mzima', async () => {
    eq(errors.length, 0, 'errors: ' + errors.slice(0, 3).join(' | '));
});

await b.close();
console.log('UTENDAJI WA BIDHAA BROWSER: ' + pass + ' passed, ' + fails.length + ' FAILED');
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }

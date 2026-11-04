#!/usr/bin/env node
/* Maarifa ya Mauzo (sales_insights) — browser contract test.
   POS stub inahesabiwa kutoka rekodi za mauzo (kama reporting authority halisi),
   hivyo kila kipindi kinapata namba zake halisi.

   Matumizi: node functions/local-server.js --static   (port 5055)
             node tools/test_sales_insights_browser.mjs
*/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const SHOTS = process.env.SI_SHOTS || '/home/user/sokohai-business-os/shots/maarifa-ya-mauzo';
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
const P = (id, title, cat, extra) => Object.assign({ id, userId: 'u1', title, category: cat || 'Vyakula', price: 2000, stock: 40, lowStockAlert: 5, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', imagesArray: ['x.jpg'], description: 'Maelezo ya kutosha kwa bidhaa hii ili kukidhi ukamilifu wa taarifa za bidhaa sokoni.', sku: 'SKU-' + id, createdAt: dayAgo(200) }, extra || {});

const PRODUCTS = [
    P('p_sukari', 'Sukari 2kg', 'Vyakula', { price: 3400, stock: 50, sku: 'SUK-2K', views: 820, savedCount: 12 }),
    P('p_mafuta', 'Mafuta 1L', 'Vyakula', { price: 5200, stock: 30, views: 300, savedCount: 4 }),
    P('p_sabuni', 'Sabuni 1kg', 'Usafi', { price: 2800, stock: 25, views: 120 }),
    P('p_mpya', 'Bidhaa Mpya', 'Vyakula', { price: 3000, stock: 5, createdAt: dayAgo(3), views: 40 }),
    P('p_kikapu', 'Kikapu cha Mpunga', 'Nyumbani', { price: 4500, stock: 20, views: 60 })
];

/* POS: rekodi za mauzo (COMPLETED) + return moja */
const POS_SALES = [
    { days: 1, total: 40000, items: { p_sukari: 10 } },
    { days: 2, total: 36000, items: { p_mafuta: 6 } },
    { days: 3, total: 28000, items: { p_sabuni: 10 } },
    { days: 10, total: 20000, items: { p_sukari: 5 } },
    { days: 20, total: 18000, items: { p_sabuni: 6 } },
    { days: 40, total: 30000, items: { p_sukari: 8 } },
    { days: 50, total: 12000, items: { p_mafuta: 2 } }
];
const POS_RETURN = { days: 20, amount: 6000, qty: 2, pid: 'p_sabuni' };

const ORDERS = [
    { id: 'o1', sellerId: 'u1', status: 'completed', completedAt: dayAgo(1), items: [{ productId: 'p_sukari', qty: 3, price: 3400 }] },
    { id: 'o2', sellerId: 'u1', status: 'completed', completedAt: dayAgo(2), items: [{ productId: 'p_mafuta', qty: 2, price: 5200 }] },
    { id: 'o3', sellerId: 'u1', status: 'delivered', createdAt: dayAgo(20), items: [{ productId: 'p_sukari', qty: 1, price: 3400 }] },
    { id: 'o4', sellerId: 'u1', status: 'completed', completedAt: dayAgo(45), items: [{ productId: 'p_sabuni', qty: 4, price: 2800 }] },
    { id: 'o5', sellerId: 'u1', status: 'cancelled', completedAt: dayAgo(1), items: [{ productId: 'p_sukari', qty: 99, price: 3400 }] },
    { id: 'o6', sellerId: 'u1', status: 'completed', completedAt: dayAgo(30), items: [{ productId: 'p_kikapu', qty: 5, price: 4500 }] }
];

const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));
page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skh && !!window.skhRenderSalesInsights, null, { timeout: 30000 });

async function mount(posBroken) {
    await page.evaluate(async ({ products, orders, sales, ret, broken }) => {
        window.__broken = !!broken;
        const dayMs = 86400000;
        const keyLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        function buildReport(period) {
            const start = new Date(period.start), end = new Date(period.end);
            const rows = {}, dailyMap = {};
            let completed = 0, gross = 0, returned = 0, returnedQty = 0;
            sales.forEach(s => {
                const at = new Date(Date.now() - s.days * dayMs);
                if (at < start || at > end) return;
                completed++; gross += s.total;
                const k = keyLocal(at);
                if (!dailyMap[k]) dailyMap[k] = { date: k, grossSales: 0, completedSales: 0, returnedAmount: 0, voidValue: 0, expenses: 0, netSales: 0 };
                dailyMap[k].grossSales += s.total; dailyMap[k].completedSales += 1;
                Object.keys(s.items).forEach(pid => {
                    if (!rows[pid]) rows[pid] = { productId: pid, quantitySold: 0, quantityReturned: 0, quantityVoided: 0, grossSales: 0, returnsValue: 0, netSales: 0 };
                    rows[pid].quantitySold += s.items[pid];
                    rows[pid].grossSales += s.total;
                });
            });
            const rat = new Date(Date.now() - ret.days * dayMs);
            if (rat >= start && rat <= end) {
                returned += ret.amount; returnedQty += ret.qty;
                if (!rows[ret.pid]) rows[ret.pid] = { productId: ret.pid, quantitySold: 0, quantityReturned: 0, quantityVoided: 0, grossSales: 0, returnsValue: 0, netSales: 0 };
                rows[ret.pid].quantityReturned += ret.qty; rows[ret.pid].returnsValue += ret.amount;
                const k = keyLocal(rat);
                if (!dailyMap[k]) dailyMap[k] = { date: k, grossSales: 0, completedSales: 0, returnedAmount: 0, voidValue: 0, expenses: 0, netSales: 0 };
                dailyMap[k].returnedAmount += ret.amount;
            }
            Object.keys(rows).forEach(pid => { rows[pid].netSales = rows[pid].grossSales - rows[pid].returnsValue; });
            const daily = Object.values(dailyMap).map(d => Object.assign({}, d, { netSales: d.grossSales - d.returnedAmount }));
            return {
                summary: { completedSales: completed, grossSales: gross, returnedAmount: returned, voidValue: 0, netSales: gross - returned, refundedAmount: 0, creditSales: 0, expenses: 0 },
                products: rows, daily, payments: {}, cashiers: {}, inventory: {}, transactions: []
            };
        }
        window.__buildReport = buildReport;
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
        window.skh.wrapCallable = (name) => async (payload) => {
            if (name !== 'posReports') return { data: {} };
            if (window.__broken) throw new Error('POS imezimwa kwa jaribio');
            return { data: buildReport(payload.period) };
        };
        window.dashboardCachedData = { prodSnap: { forEach: () => {} }, ledgerSnap: { forEach: () => {} }, poSnap: { forEach: () => {} }, staffSnap: { forEach: () => {} } };
        window.skh.currentUser = { uid: 'u1' };
        window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'biz1', storeId: 'store1', shopName: 'Duka la Test' };
        window.skh.currentMode = 'seller';
        window.activeDashboardTab = 'sales_insights';
        const host = document.getElementById('mpHost') || (() => { const h = document.createElement('div'); h.id = 'mpHost'; document.body.appendChild(h); return h; })();
        window.skhRenderBusinessOSShell(host);
        window.switchDashTab('sales_insights');
        await new Promise(r => setTimeout(r, 1800));
    }, { products: PRODUCTS, orders: ORDERS, sales: POS_SALES, ret: POS_RETURN, broken: !!posBroken });
}
const cleanHost = async () => {
    await page.evaluate(() => {
        document.querySelectorAll('body > *').forEach(el => { if (el.id !== 'mpHost' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') el.style.display = 'none'; });
        const h = document.getElementById('mpHost'); h.style.position = 'relative'; h.style.background = '#F8FBFA'; h.style.minHeight = '100vh';
    });
};

await mount(false);

await step('1. dashboard inafungua (hakuna alert/redirect) na KPI 8 zinaonekana', async () => {
    const r = await page.evaluate(() => ({
        shell: !!document.querySelector('.si-shell'),
        kpis: document.querySelectorAll('.si-kpi').length,
        charts: document.querySelectorAll('.si-chart').length,
        panels: document.querySelectorAll('.si-cmp').length
    }));
    ok(r.shell, 'shell ya mauzo');
    eq(r.kpis, 8, 'KPI 8 (transactions, units, ghafi, net, AOV-net, AOV-ghafi, units/txn, ukuaji)');
    eq(r.charts, 4, 'charts 4');
    eq(r.panels, 2, 'WoW + MoM');
    ok(!errors.some(e => /^dialog:/.test(e)), 'hakuna alert()');
});

await step('2. transactions = POS completedSales + oda za marketplace (bila kuhesabu mara mbili)', async () => {
    const r = await page.evaluate(() => window.skhSi.scope('all'));
    // 30d: POS days 1,2,3,10,20 = 5 ; orders: o1(d1), o2(d2), o3(d20) = 3 (cancelled o5 haijahesabiwa)
    eq(r.tx, 8, 'transactions 5 POS + 3 MP');
    eq(r.units, 10 + 6 + 10 + 5 + 6 - 2 + 3 + 2 + 1, 'units: POS net 35 + MP 6');
    eq(r.gross, 142000 + 24000, 'ghafi: POS 142000 + MP 24000');
});

await step('3. units na gross za POS zinatolewa returns/void (net)', async () => {
    const r = await page.evaluate(() => ({ pos: window.skhSi.scope('pos'), mp: window.skhSi.scope('mp') }));
    eq(r.pos.tx, 5, 'POS transactions 5');
    eq(r.pos.units, 35, 'POS net units 35 (10+6+10+5+6−2 return)');
    eq(r.pos.gross, 142000, 'POS ghafi 142000');
    eq(r.pos.net, 142000 - 6000, 'POS net = ghafi − return');
    eq(r.mp.tx, 3, 'MP oda 3');
    eq(r.mp.units, 6, 'MP units 6');
    eq(r.mp.gross, 24000, 'MP ghafi 24000');
});

await step('4. net ya marketplace ni Haipatikani (haikadiriwi)', async () => {
    const r = await page.evaluate(() => ({ mp: window.skhSi.scope('mp'), all: window.skhSi.scope('all') }));
    eq(r.mp.net, null, 'MP net = null');
    eq(r.all.net, null, 'net ya zote haithibitishiki');
    eq(r.all.netPosOnly, 136000, 'net ya POS inaonyeshwa kwa mchanganuo');
});

await step('5. AOV (net ÷ transactions) na AOV(ghafi) ni sahihi', async () => {
    await page.evaluate(() => window.skhSi.source('pos'));
    const r = await page.evaluate(() => {
        const t = window.skhSi.scope('pos');
        const cards = [...document.querySelectorAll('.si-kpi')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
        window.skhSi.source('all');
        return { aov: t.net / t.tx, aovGross: t.gross / t.tx, cards };
    });
    ok(Math.abs(r.aov - 27200) < 1, 'AOV net = 136000/5 = 27200');
    ok(Math.abs(r.aovGross - 28400) < 1, 'AOV ghafi = 142000/5 = 28400');
    ok(r.cards.some(c => /AOV \(net/.test(c)), 'kadi ya AOV ipo');
});

await step('6. units kwa transaction na ukuaji (na denominator halali)', async () => {
    const r = await page.evaluate(() => {
        const t = window.skhSi.scope('all');
        return { perTx: t.units / t.tx, prev: t.prev, growthHtml: [...document.querySelectorAll('.si-kpi')].pop().textContent.replace(/\s+/g, ' ').trim() };
    });
    ok(Math.abs(r.perTx - 41 / 8) < 1e-9, 'units/txn = 41/8');
    ok(r.prev && r.prev.gross === 75700, 'ghafi ya awali = POS 42000 + MP 33700: ' + JSON.stringify(r.prev));
});

await step('7. siku zote za kipindi zipo kwenye mwenendo (siku 0 ≠ data inayokosekana)', async () => {
    const r = await page.evaluate(() => {
        const s = window.skhSi.data().series;
        return { n: s.length, zeros: s.filter(x => !(x.gross > 0)).length, sum: s.reduce((t, x) => t + x.gross, 0) };
    });
    eq(r.n, 30, 'siku 30');
    ok(r.zeros > 20, 'siku zenye 0: ' + r.zeros);
    eq(r.sum, 166000, 'jumla ya mfululizo = ghafi ya kipindi');
});

await step('8. buckets: siku/wiki/mwezi', async () => {
    const r = await page.evaluate(async () => {
        const day = window.skhSi.bps().length;
        window.skhSi.bucket('week');
        await new Promise(x => setTimeout(x, 150));
        const week = window.skhSi.bps().length;
        window.skhSi.bucket('month');
        await new Promise(x => setTimeout(x, 150));
        const month = window.skhSi.bps().length;
        const monthSum = window.skhSi.bps().reduce((t, x) => t + x.gross, 0);
        window.skhSi.bucket('day');
        await new Promise(x => setTimeout(x, 150));
        return { day, week, month, monthSum, back: window.skhSi.bps().length };
    });
    eq(r.day, 30, 'siku 30');
    ok(r.week >= 4 && r.week <= 6, 'wiki: ' + r.week);
    ok(r.month >= 1 && r.month <= 3, 'miezi: ' + r.month);
    eq(r.monthSum, 166000, 'jumla haibadiliki kwa bucket');
    eq(r.back, 30, 'kurudi siku');
});

await step('9. siku za wiki: buckets 7 zinajumlisha jumla', async () => {
    const r = await page.evaluate(() => {
        const d = window.skhSi.dow();
        return { n: d.length, sum: d.reduce((t, x) => t + x.gross, 0), total: window.skhSi.data().series.reduce((t, x) => t + x.gross, 0) };
    });
    eq(r.n, 7, 'siku 7 za wiki');
    eq(r.sum, r.total, 'jumla inalingana');
});

await step('10. WoW na MoM zinaonyesha namba + denominator halali', async () => {
    const r = await page.evaluate(() => {
        const wow = window.skhSi.wow(), mom = window.skhSi.mom();
        const blocks = [...document.querySelectorAll('.si-cmp')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
        return { wow, mom, blocks };
    });
    // wiki hii: POS 40000+36000+28000 = 104000 + MP 10200+10400 = 124600
    eq(r.wow.cur.gross, 104000 + 20600, 'WoW kipindi hiki');
    // wiki iliyopita: POS 20000 (siku 10) + MP 3400 (siku 20 haipo; siku 10 hakuna MP) = 20000
    eq(r.wow.prev.gross, 20000, 'WoW kilichopita');
    ok(/\+/.test(r.blocks[0]), 'asilimia inaonekana: ' + r.blocks[0].slice(0, 120));
    ok(r.blocks[1].length > 20, 'MoM block ipo');
});

await step('11. bidhaa zinazoongoza + polepole (bila kuweka "mpya" kama polepole)', async () => {
    const r = await page.evaluate(() => ({ top: window.skhSi.top(), slow: window.skhSi.slow(), prods: document.querySelectorAll('.si-prod').length }));
    eq(r.top[0].id, 'p_sukari', 'kiongozi = p_sukari (16 units)');
    ok(r.top[0].units === 19, 'units 19: ' + r.top[0].units);
    ok(!r.slow.some(x => x.id === 'p_mpya'), 'bidhaa mpya haipo kwenye polepole');
    ok(r.slow.some(x => x.id === 'p_kikapu'), 'p_kikapu (stock 20, units 0) ipo');
    ok(r.prods >= 2, 'orodha zinaonekana');
});

await step('12. mauzo kwa category yanajumlisha hadi jumla', async () => {
    const r = await page.evaluate(() => {
        const c = window.skhSi.cats();
        const sum = c.reduce((t, x) => t + x.gross, 0);
        const total = window.skhSi.scope('all').gross;
        return { sum, total, cats: c.map(x => x.cat) };
    });
    ok(Math.abs(r.sum - r.total) < 1, 'category jumla = ' + r.sum + ' vs ' + r.total);
    ok(r.cats.includes('Vyakula') && r.cats.includes('Usafi'), 'categories halisi: ' + r.cats.join(','));
});

await step('13. zero-denominator: ukuaji unakataa % ikiwa awali ni 0', async () => {
    const r = await page.evaluate(async () => {
        // kipindi cha leo: awali (jana) haina mauzo ya POS? tunaangalia MoM kwa mwezi (awali 0)
        const mom = window.skhSi.mom();
        const html = document.querySelectorAll('.si-cmp')[1].textContent.replace(/\s+/g, ' ');
        return { momPrev: mom.prev.gross, momCur: mom.cur.gross, hasPct: /%/.test(html), html: html.slice(0, 160) };
    });
    if (r.momPrev === 0) {
        ok(!/[\d.]+%/.test(r.html), 'hakuna % ikiwa awali 0: ' + r.html);
    } else {
        ok(r.hasPct, 'awali ilikuwa ' + r.momPrev + ' → % inaruhusiwa');
    }
});

await step('14. POS isipopatikana: net = Haipatikani, units ni marketplace pekee', async () => {
    await mount(true);
    const r = await page.evaluate(() => {
        const all = window.skhSi.scope('all');
        const cards = [...document.querySelectorAll('.si-kpi')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
        return { units: all.units, gross: all.gross, net: all.netPosOnly, warn: !!document.querySelector('.si-warn'), netCard: cards.find(c => /Mauzo halisi/.test(c)) || '', posState: window.skhSi.data().posState, broken: !!window.__broken };
    });
    eq(r.units, 6, 'units = marketplace pekee (posState=' + r.posState + ', broken=' + r.broken + ')');
    eq(r.gross, 24000, 'ghafi = marketplace pekee');
    eq(r.net, null, 'net = null');
    ok(r.warn, 'onyo la POS');
    ok(/Haipatikani/.test(r.netCard), 'kadi ya net: ' + r.netCard.slice(0, 80));
    await mount(false);
});

await step('15. responsive 1440/768/390', async () => {
    const measure = async (w, h) => {
        await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
        return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    };
    ok((await measure(1440, 1000)) <= 1, 'desktop overflow');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/mauzo-1440.png' });
    ok((await measure(768, 1024)) <= 1, 'tablet overflow');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/mauzo-768.png' });
    ok((await measure(390, 844)) <= 1, 'mobile overflow');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/mauzo-390.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
});

for (const [name, w, h] of [['1440', 1440, 1000], ['768', 768, 1024], ['390', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
    await cleanHost();
    const el = await page.$('#mpHost');
    await el.screenshot({ path: `${SHOTS}/mauzo-full-${name}.png` });
}

await step('16. hakuna error ya JS', async () => { eq(errors.length, 0, 'errors: ' + errors.slice(0, 3).join(' | ')); });

await b.close();
console.log('MAARIFA YA MAUZO BROWSER: ' + pass + ' passed, ' + fails.length + ' FAILED');
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }

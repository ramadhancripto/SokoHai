#!/usr/bin/env node
/* Linganisha Bidhaa (product_compare) — browser contract test.
   Inathibitisha acceptance criteria 1–17 kwenye app HALISI kwa stub yenye
   muundo halisi wa products / orders / posReports.

   Matumizi: node functions/local-server.js --static   (port 5055)
             node tools/test_product_compare_browser.mjs
*/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const SHOTS = process.env.CMP_SHOTS || '/home/user/sokohai-business-os/shots/linganisha-bidhaa';
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

const PRODUCTS = [
    { id: 'p_sukari', userId: 'u1', title: 'Sukari 2kg', category: 'Vyakula', price: 3400, buyPrice: 2800, stock: 2, lowStockAlert: 5, sku: 'SUK-2K', barcode: '1234567890', publicationStatus: 'published', status: 'active', baseUnit: 'Piece', description: 'Sukari nyeupe ya kilo mbili, iliyosafishwa vizuri kwa matumizi ya nyumbani na biashara ndogo.', imagesArray: ['a.jpg', 'b.jpg'], attributes: [{ name: 'Brand' }], features: ['500g x4'], views: 820, createdAt: dayAgo(80) },
    { id: 'p_mafuta', userId: 'u1', title: 'Mafuta ya Kupikia 1L', category: 'Vyakula', price: 5200, buyPrice: 4300, stock: 40, lowStockAlert: 5, publicationStatus: 'published', status: 'active', baseUnit: 'Litre', description: 'Mafuta ya alizeti', imagesArray: ['c.jpg'], createdAt: dayAgo(60) },
    { id: 'p_sabuni', userId: 'u1', title: 'Sabuni ya Kufulia 1kg', category: 'Usafi', price: 2800, stock: 60, lowStockAlert: 10, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', imagesArray: ['d.jpg'], createdAt: dayAgo(45) },
    { id: 'p_tshirt', userId: 'u1', title: 'T-Shirt ya Pamba', category: 'Mavazi', price: 12000, stock: 0, publicationStatus: 'published', status: 'active', baseUnit: 'Piece',
        variantCombinations: [
            { variantId: 'v_m', sku: 'TS-M', unitId: 'piece', stock: 10, reserved: 1 },
            { variantId: 'v_l', sku: 'TS-L', unitId: 'piece', stock: 0, reserved: 0 },
            { variantId: 'v_xl', sku: 'TS-XL', unitId: 'piece', stock: 5, reserved: 0 }
        ], createdAt: dayAgo(50) },
    { id: 'p_mchele', userId: 'u1', title: 'Mchele (kg)', category: 'Vyakula', price: 2800, stock: 12.75, quantityPrecision: 3, lowStockAlert: 10, publicationStatus: 'published', status: 'active', baseUnit: 'Kg', createdAt: dayAgo(30) },
    { id: 'p_untracked', userId: 'u1', title: 'Huduma ya Kupanga', category: 'Huduma', price: 5000, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', createdAt: dayAgo(15) },
    { id: 'p_draft', userId: 'u1', title: 'Kikapu cha Mpunga', category: 'Nyumbani', price: 0, stock: 4, publicationStatus: 'draft', status: 'draft', baseUnit: 'Piece', createdAt: dayAgo(3) },
    { id: 'p_other', userId: 'u2', title: 'Bidhaa ya Muuzaji Mwingine', category: 'Vyakula', price: 999, stock: 99, publicationStatus: 'published', status: 'active' }
];

const ORDERS = [
    { id: 'o1', sellerId: 'u1', status: 'completed', completedAt: dayAgo(2), items: [{ productId: 'p_sukari', qty: 3, price: 3400 }] },
    { id: 'o2', sellerId: 'u1', status: 'delivered', createdAt: dayAgo(4), items: [{ productId: 'p_mafuta', qty: 2, price: 5200 }] },
    { id: 'o3', sellerId: 'u1', status: 'cancelled', createdAt: dayAgo(1), items: [{ productId: 'p_mafuta', qty: 9, price: 5200 }] },
    { id: 'o4', sellerId: 'u1', status: 'in_transit', createdAt: dayAgo(2), items: [{ productId: 'p_sabuni', qty: 4, price: 2800 }] },
    { id: 'o5', sellerId: 'u1', status: 'refunded_by_admin', createdAt: dayAgo(1), items: [{ productId: 'p_tshirt', qty: 7, price: 12000 }] },
    { id: 'o6', sellerId: 'u1', status: 'completed', completedAt: dayAgo(20), items: [{ productId: 'p_mchele', qty: 1, price: 2800 }] }
];

const POS_CURRENT = {
    products: {
        'p_sukari:product:piece': { productId: 'p_sukari', quantitySold: 10, quantityReturned: 2, quantityVoided: 1, grossSales: 34000, returnsValue: 6800, netSales: 27200 },
        'p_tshirt:v_m:piece': { productId: 'p_tshirt', quantitySold: 3, quantityReturned: 0, quantityVoided: 0, grossSales: 36000, returnsValue: 0, netSales: 36000 },
        'p_tshirt:v_xl:piece': { productId: 'p_tshirt', quantitySold: 2, quantityReturned: 0, quantityVoided: 0, grossSales: 24000, returnsValue: 0, netSales: 24000 }
    }
};
const POS_PREVIOUS = { products: { 'p_sukari:product:piece': { productId: 'p_sukari', quantitySold: 5, quantityReturned: 0, quantityVoided: 0, grossSales: 17000, returnsValue: 0, netSales: 17000 } } };

const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skh && !!window.skhRenderCompareProducts, null, { timeout: 30000 });

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
        (q.rest || []).forEach(c => { if (c && c.f) rows = rows.filter(r => r[c.f] === c.v); });
        const docs = rows.map(r => ({ id: r.id, data: () => JSON.parse(JSON.stringify(r)) }));
        return { empty: docs.length === 0, docs, size: docs.length, forEach: cb => docs.forEach(cb) };
    };
    window.skh.wrapCallable = (name) => async () => {
        if (name !== 'posReports') return { data: {} };
        window.__posCalls++;
        const isPrev = window.__posCalls % 2 === 0;
        return { data: JSON.parse(JSON.stringify(isPrev ? posPrev : posCur)) };
    };
    window.dashboardCachedData = { prodSnap: { forEach: () => { } }, ledgerSnap: { forEach: () => { } }, poSnap: { forEach: () => { } }, staffSnap: { forEach: () => { } } };
    window.skh.currentUser = { uid: 'u1' };
    window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'biz1', storeId: 'store1', shopName: 'Duka la Test' };
    window.skh.currentMode = 'seller';
    window.activeDashboardTab = 'product_compare';
    const host = document.getElementById('mpHost') || (() => { const h = document.createElement('div'); h.id = 'mpHost'; document.body.appendChild(h); return h; })();
    window.skhRenderBusinessOSShell(host);
    window.switchDashTab('product_compare');
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

/* ---------------- 1. picker ---------------- */
await step('1. uteuzi: bidhaa zote za muuzaji zinaonekana (si za muuzaji mwingine)', async () => {
    const r = await page.evaluate(() => ({
        picks: [...document.querySelectorAll('[data-cmp-pick]')].map(e => e.getAttribute('data-cmp-pick')),
        hasOther: !!document.querySelector('[data-cmp-pick="p_other"]'),
        run: !!document.querySelector('.cmp-run'),
        tray: (document.getElementById('cmpTray') || {}).textContent || ''
    }));
    eq(r.picks.length, 7, 'bidhaa 7 za muuzaji');
    ok(!r.hasOther, 'bidhaa ya muuzaji mwingine haipo');
    ok(/0\/5/.test(r.tray), 'tray inaonyesha 0/5');
    ok(r.run, 'button ya Linganisha Sasa ipo');
});

/* ---------------- 2/3/4. kikomo na duplicate ---------------- */
await step('2. kuchagua 2–5 kunafanya kazi; ya 6 inazuiwa; duplicate inazuiwa', async () => {
    const r = await page.evaluate(() => {
        const ids = ['p_sukari', 'p_mafuta', 'p_sabuni', 'p_tshirt', 'p_mchele'];
        const out = [];
        ids.forEach(id => { window.skhComparePick(id, { checked: true }); out.push(window.skhCmp.state().ids.length); });
        // ya 6
        const cb6 = document.createElement('input'); cb6.checked = true;
        window.skhComparePick('p_untracked', cb6);
        const after6 = window.skhCmp.state().ids.length;
        const msgMax = (document.getElementById('cmpFlash') || {}).textContent || '';
        const cb6State = cb6.checked;
        // duplicate
        const cbDup = document.createElement('input'); cbDup.checked = true;
        window.skhComparePick('p_sukari', cbDup);
        const afterDup = window.skhCmp.state().ids.length;
        return { lengths: out, after6, afterDup, msgMax, cb6State, tray: (document.getElementById('cmpTray') || {}).textContent };
    });
    eq(JSON.stringify(r.lengths), JSON.stringify([1, 2, 3, 4, 5]), 'kila uteuzi unaongezeka');
    eq(r.after6, 5, 'bidhaa ya 6 imezuiwa');
    eq(r.cb6State, false, 'checkbox ya 6 imerudishwa');
    ok(/5 tu|5 pekee|bidhaa 5/.test(r.msgMax), 'ujumbe wa kikomo: ' + r.msgMax);
    eq(r.afterDup, 5, 'duplicate haiongezi');
    ok(/5\/5/.test(r.tray), 'tray 5/5');
});

/* ---------------- 5. kuondoa ---------------- */
await step('5. kuondoa bidhaa moja kwenye tray kunafanya kazi (na nafasi inafunguka)', async () => {
    const r = await page.evaluate(() => {
        window.skhCompareRemove('p_sabuni');
        const n1 = window.skhCmp.state().ids.length;
        const tray1 = (document.getElementById('cmpTray') || {}).textContent;
        window.skhComparePick('p_untracked', { checked: true });
        return { n1, tray1, n2: window.skhCmp.state().ids.length, ids: window.skhCmp.state().ids };
    });
    eq(r.n1, 4, 'bidhaa 4 zimebaki');
    ok(/4\/5/.test(r.tray1), 'tray 4/5');
    eq(r.n2, 5, 'nafasi iliyofunguka inatumika');
    ok(r.ids.indexOf('p_sabuni') === -1, 'p_sabuni imeondolewa');
    ok(r.ids.indexOf('p_untracked') !== -1, 'p_untracked imeongezwa');
});

/* ---------------- 6/7. Linganisha Sasa ---------------- */
await step('6. Linganisha Sasa inafungua dashboard (hakuna TypeError ya r.sold)', async () => {
    const before = errors.length;
    await page.evaluate(async () => { await window.skhCompareRun(); await new Promise(r => setTimeout(r, 800)); });
    const r = await page.evaluate(() => ({
        view: window.skhCmp.state().view,
        headers: [...document.querySelectorAll('.cmp-ph')].length,
        table: !!document.querySelector('.cmp-table'),
        summary: !!document.querySelector('.cmp-summary'),
        charts: document.querySelectorAll('.cmp-chart').length,
        rows: document.querySelectorAll('.cmp-row').length
    }));
    eq(r.view, 'dash', 'dashboard imefunguka');
    eq(r.headers, 5, 'product headers 5');
    ok(r.table && r.summary, 'jedwali + muhtasari');
    ok(r.charts >= 4, 'charts 4: ' + r.charts);
    ok(r.rows > 20, 'rows za vigezo: ' + r.rows);
    eq(errors.length, before, 'hakuna page error: ' + errors.slice(0, 2).join(' | '));
    ok(!errors.some(e => /sold/.test(e) && /toLocaleString/.test(e)), 'hakuna r.sold TypeError');
});

/* ---------------- 7/8/9. mauzo ---------------- */
await step('7. units/oda/ghafi zinatokana na source sahihi (orders + POS, bila kuhesabu mara mbili)', async () => {
    const r = await page.evaluate(() => {
        const s = window.skhCmp.perProduct('p_sukari');
        const m = window.skhCmp.perProduct('p_mafuta');
        const t = window.skhCmp.perProduct('p_tshirt');
        return { sukari: s, mafuta: m, tshirt: t };
    });
    // sukari: orders 3 + POS (10-2-1)=7 → 10
    eq(r.sukari.units, 10, 'sukari units = 3 + 7');
    eq(r.sukari.orders, 1, 'sukari oda 1');
    eq(r.sukari.mpRevenue, 10200, 'sukari mapato ya mtandaoni 3×3400');
    eq(r.sukari.posGross, 34000, 'POS ghafi');
    eq(r.sukari.posReturns, 6800, 'POS returns');
    // mafuta: oda 2 tu (cancelled haijahesabiwa)
    eq(r.mafuta.units, 2, 'mafuta units = 2 (cancelled 9 haijahesabiwa)');
    // tshirt: POS yake ni variants 2 → 3+2=5, oda refunded haijahesabiwa
    eq(r.tshirt.units, 5, 'tshirt units = variants 3+2 (refunded haijahesabiwa)');
    eq(r.tshirt.posGross, 60000, 'tshirt POS ghafi ya variants imejumlishwa');
});

/* ---------------- 10. stock ---------------- */
await step('10. stock inalingana na authoritative inventory (stock − reserved)', async () => {
    const r = await page.evaluate(() => ({
        sukari: window.skhCmp.perProduct('p_sukari'),
        tshirt: window.skhCmp.perProduct('p_tshirt'),
        untracked: window.skhCmp.perProduct('p_untracked'),
        cell: [...document.querySelectorAll('.cmp-row')].map(tr => tr.textContent)
    }));
    eq(r.sukari.avail, 2, 'sukari available 2');
    eq(r.tshirt.avail, 14, 'tshirt: (10-1)+0+5 = 14');
    eq(r.untracked.tracked, false, 'untracked haifuatiliwi');
    ok(r.cell.some(t => /Bila tracking|Haipatikani/.test(t)), 'untracked haijaonyeshwa kama 0');
});

/* ---------------- 11. variants ---------------- */
await step('11. variants hazisababishi bidhaa mara nyingi', async () => {
    const r = await page.evaluate(() => {
        const hs = [...document.querySelectorAll('.cmp-ph')].map(e => e.getAttribute('data-cmp-col'));
        const row = [...document.querySelectorAll('.cmp-row')].find(tr => /Stock ya variants/.test(tr.textContent));
        return { cols: hs, rows: row ? row.textContent : '' };
    });
    eq(r.cols.filter(c => c === 'p_tshirt').length, 1, 'tshirt ni column moja');
    ok(/TS-M|v_m/.test(r.rows), 'stock ya variants inaonekana: ' + r.rows.slice(0, 120));
});

/* ---------------- 12. missing fields ---------------- */
await step('12. data isiyopo inaonyesha Haijawekwa / Haipatikani (si sifuri)', async () => {
    const r = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('.cmp-cell')];
        return {
            unset: cells.filter(c => c.classList.contains('is-unset')).length,
            na: cells.filter(c => c.classList.contains('is-na')).length,
            sample: cells.filter(c => c.classList.contains('is-na')).slice(0, 2).map(c => c.textContent),
            txPos: (() => {
                const tr = [...document.querySelectorAll('.cmp-row')].find(x => /Transactions \(POS\)/.test(x.textContent));
                return tr ? [...tr.querySelectorAll('.cmp-cell')].map(c => c.textContent.trim()) : null;
            })(),
            txPosNa: (() => {
                const tr = [...document.querySelectorAll('.cmp-row')].find(x => /Transactions \(POS\)/.test(x.textContent));
                return tr ? tr.querySelectorAll('.cmp-cell.is-na').length : -1;
            })()
        };
    });
    ok(r.unset >= 3, 'Haijawekwa cells: ' + r.unset);
    ok(r.na >= 3, 'Haipatikani cells: ' + r.na);
    eq(r.txPosNa, 5, 'POS transactions zote = Haipatikani');
    ok(r.txPos.every(t => t === 'Haipatikani'), 'maandishi: ' + (r.txPos || []).join('|'));
});

/* ---------------- 13. diff toggle ---------------- */
await step('13. "Onyesha Tofauti Pekee" inaficha rows zinazofanana tu', async () => {
    const r = await page.evaluate(async () => {
        const before = document.querySelectorAll('.cmp-row').length;
        window.skhCmp.diff();
        await new Promise(x => setTimeout(x, 250));
        const after = document.querySelectorAll('.cmp-row').length;
        const hasMissing = [...document.querySelectorAll('.cmp-cell.is-na, .cmp-cell.is-unset')].length;
        const pressed = document.querySelector('.cmp-toggle').getAttribute('aria-pressed');
        window.skhCmp.diff();
        await new Promise(x => setTimeout(x, 250));
        return { before, after, hasMissing, pressed, restored: document.querySelectorAll('.cmp-row').length, state: window.skhCmp.state().diffOnly };
    });
    ok(r.after < r.before, 'rows zimepungua: ' + r.before + ' → ' + r.after);
    ok(r.hasMissing > 0, 'rows zenye data isiyopo hazijafichwa');
    eq(r.pressed, 'true', 'aria-pressed = true');
    eq(r.restored, r.before, 'kurudi Onyesha Zote');
    eq(r.state, false, 'toggle imerudi');
});

/* ---------------- 14. date range ---------------- */
await step('14. date range inabadilisha metrics za kipindi pekee', async () => {
    const r = await page.evaluate(async () => {
        const before = { units: window.skhCmp.perProduct('p_mchele').units, stock: window.skhCmp.perProduct('p_mchele').avail };
        window.__posCalls = 0;
        await window.skhCmp.setRange('30d');
        await new Promise(x => setTimeout(x, 900));
        const after = { units: window.skhCmp.perProduct('p_mchele').units, stock: window.skhCmp.perProduct('p_mchele').avail };
        const label = window.skhCmp.window().label;
        window.__posCalls = 0;
        await window.skhCmp.setRange('7d');
        await new Promise(x => setTimeout(x, 900));
        return { before, after, label, back: window.skhCmp.perProduct('p_mchele').units };
    });
    eq(r.before.units, 0, 'mchele hakuuzwa siku 7');
    eq(r.after.units, 1, 'siku 30 inaingiza oda ya siku 20');
    eq(r.before.stock, r.after.stock, 'stock haibadiliki kwa date filter');
    ok(r.label, 'lebo ya kipindi: ' + r.label);
    eq(r.back, 0, 'kurudi siku 7');
});

/* ---------------- makundi + summary ---------------- */
await step('15b. makundi: funga/fungua yote + muhtasari wa kila metric', async () => {
    const r = await page.evaluate(async () => {
        const openRows = document.querySelectorAll('.cmp-row').length;
        window.skhCompareGroupsAll(false);
        await new Promise(x => setTimeout(x, 200));
        const closedRows = document.querySelectorAll('.cmp-row').length;
        window.skhCompareGroupsAll(true);
        await new Promise(x => setTimeout(x, 200));
        const reopened = document.querySelectorAll('.cmp-row').length;
        const sumCards = [...document.querySelectorAll('.cmp-sum-card')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
        return { openRows, closedRows, reopened, sumCards };
    });
    eq(r.closedRows, 0, 'makundi yote yamefungwa');
    eq(r.reopened, r.openRows, 'yamefunguliwa tena');
    ok(r.sumCards.length >= 6, 'kadi za muhtasari: ' + r.sumCards.length);
    ok(r.sumCards.some(c => /Mauzo zaidi/i.test(c)) && r.sumCards.some(c => /Mapato zaidi/i.test(c)), 'muhtasari wa kila metric');
});

/* ---------------- 15. ownership ---------------- */
await step('16. ownership: hakuna data ya muuzaji mwingine', async () => {
    const r = await page.evaluate(() => {
        const ids = window.skhCmp.rebuilt().rows.map(x => x.id);
        return { ids, hasOther: ids.indexOf('p_other') !== -1, n: window.skhCmp.rebuilt().rows.length };
    });
    eq(r.n, 5, 'bidhaa 5 zilizochaguliwa');
    ok(!r.hasOther, 'bidhaa ya muajiri mwingine haipo');
});

/* ---------------- 8. actions zilizopo ---------------- */
await step('17. actions zinatumia handlers halisi (view/edit/price/stock/publish)', async () => {
    const r = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.cmp-ph-actions button')].map(b => b.textContent.trim());
        const html = [...document.querySelectorAll('.cmp-ph-actions button')].map(b => b.getAttribute('onclick')).join(' ');
        return {
            btns, html,
            fns: {
                openProduct: typeof window.openProduct,
                openEditModal: typeof window.openEditModal,
                skhMPStock: typeof window.skhMPStock,
                skhSetProductPublication: typeof window.skhSetProductPublication
            }
        };
    });
    ok(r.btns.length >= 5, 'buttons: ' + r.btns.join(','));
    ok(/openProduct/.test(r.html) && /openEditModal/.test(r.html) && /skhMPStock/.test(r.html) && /skhSetProductPublication/.test(r.html), 'handlers zilizopo zimetumika');
    ok(Object.values(r.fns).every(t => t === 'function'), 'handlers zipo: ' + JSON.stringify(r.fns));
});

/* ---------------- responsive + screenshots ---------------- */
await step('18. desktop 3+ kolamu / tablet / mobile: hakuna overflow ya ukurasa', async () => {
    const measure = async (w, h) => {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(250);
        return page.evaluate(() => {
            const wrap = document.querySelector('.cmp-table-wrap');
            return {
                pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
                tableScrolls: wrap ? wrap.scrollWidth > wrap.clientWidth : false,
                headers: document.querySelectorAll('.cmp-ph').length,
                charts: document.querySelectorAll('.cmp-chart').length
            };
        });
    };
    const d = await measure(1440, 1000);
    ok(d.pageOverflow <= 1, 'desktop page overflow: ' + d.pageOverflow);
    eq(d.headers, 5, 'headers zinaonekana');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/linganisha-1440.png', fullPage: false });
    const t = await measure(768, 1024);
    ok(t.pageOverflow <= 1, 'tablet page overflow: ' + t.pageOverflow);
    await cleanHost(); await page.screenshot({ path: SHOTS + '/linganisha-768.png', fullPage: false });
    const m = await measure(390, 844);
    ok(m.pageOverflow <= 1, 'mobile page overflow: ' + m.pageOverflow);
    ok(m.tableScrolls, 'mobile: jedwali linascroll ndani (haivunji ukurasa)');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/linganisha-390.png', fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
});

/* ---------------- screenshots za mwisho ---------------- */
for (const [name, w, h] of [['1440', 1440, 1000], ['768', 768, 1024], ['390', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await cleanHost();
    const el = await page.$('#mpHost');
    await el.screenshot({ path: `${SHOTS}/linganisha-full-${name}.png` });
}

/* ---------------- picker screenshots + hakuna ukurasa tupu ---------------- */
await step('19. "Chagua tena" inarudi kwenye uteuzi na chips zinabaki', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(async () => { await window.skhCompareBack(); await new Promise(r => setTimeout(r, 700)); });
    const r = await page.evaluate(() => ({
        view: window.skhCmp.state().view,
        picks: document.querySelectorAll('[data-cmp-pick]').length,
        chips: document.querySelectorAll('.cmp-chip').length,
        count: (document.getElementById('cmpPickCount') || {}).textContent,
        filterCat: document.querySelectorAll('.cmp-filters select').length,
        runLabel: (document.querySelector('.cmp-run') || {}).textContent
    }));
    eq(r.view, 'pick', 'tumerudi kwenye uteuzi');
    eq(r.picks, 7, 'orodha kamili');
    eq(r.chips, 5, 'chips 5 zimehifadhiwa');
    ok(/7/.test(r.count), 'count ya orodha: ' + r.count);
    eq(r.filterCat, 2, 'filters 2 (category + status)');
    ok(/Linganisha Sasa/i.test(r.runLabel), 'button: ' + r.runLabel);
    await cleanHost();
    await page.screenshot({ path: SHOTS + '/linganisha-picker-1440.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await cleanHost();
    await page.screenshot({ path: SHOTS + '/linganisha-picker-390.png' });
});

/* ---------------- kikomo cha chini: lazima 2 ---------------- */
await step('20. "chagua angalau 2" inazuiwa kabla ya kuendesha', async () => {
    const r = await page.evaluate(async () => {
        ['p_mafuta', 'p_tshirt', 'p_mchele', 'p_untracked'].forEach(id => window.skhCompareRemove(id));
        const n = window.skhCmp.state().ids.length;
        await window.skhCompareRun();
        await new Promise(x => setTimeout(x, 300));
        return { n, view: window.skhCmp.state().view, flash: (document.getElementById('cmpFlash') || {}).textContent || '', tray: (document.getElementById('cmpTray') || {}).textContent || '' };
    });
    eq(r.n, 1, 'bidhaa 1 imebaki');
    eq(r.view, 'pick', 'haijaenda kwenye dashboard');
    ok(/angalau|2/.test(r.flash), 'ujumbe: ' + r.flash);
    ok(/1\/5/.test(r.tray), 'tray 1/5');
});

await b.close();
console.log('LINGANISHA BIDHAA BROWSER: ' + pass + ' passed, ' + fails.length + ' FAILED');
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }

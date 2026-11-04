#!/usr/bin/env node
/* Cockpit Kuu (C1–C9) — browser contract test kwenye app HALISI.
   Inathibitisha: chart ya siku, marejesho, bidhaa zisizouza, tahadhari,
   quick actions zenye handlers halisi, filter ya malipo, badges za chanzo,
   aria/keyboard, grid 1/2/3, faida "haipatikani", na hakuna namba za kubuni.

   Matumizi: node functions/local-server.js --static   (port 5055)
             node tools/test_cockpit_kuu_browser.mjs
*/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const SHOTS = process.env.COCKPIT_SHOTS || '/home/user/sokohai-business-os/shots';
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

/* ---------------- backend stub (data HALISI ya muundo wa posReports) ---------------- */
const REPORT = {
    period: { start: '2026-10-27T00:00:00.000Z', end: '2026-11-03T00:00:00.000Z' },
    summary: {
        grossSales: 1240000, completedSales: 42, pendingPaymentSales: 2, creditSales: 90000,
        returnedAmount: 55000, refundedAmount: 30000, refundsPending: 25000, creditAdjusted: 12000,
        creditOutstanding: 78000, voidValue: 15000, netSales: 1170000, cashCollected: 860000,
        digitalPending: 40000, expenses: 132000, supplierPayments: 210000
    },
    payments: {
        Cash: { count: 22, authoritativeAmount: 860000, completedAmount: 860000, pendingAmount: 0, failedAmount: 0 },
        Mpesa: { count: 14, authoritativeAmount: 300000, completedAmount: 260000, pendingAmount: 40000, failedAmount: 0 },
        Deni: { count: 6, authoritativeAmount: 80000, completedAmount: 2000, pendingAmount: 78000, failedAmount: 0 }
    },
    cashiers: { 'Amina': { salesCount: 24, grossSales: 700000 }, 'Juma': { salesCount: 18, grossSales: 540000 } },
    products: {
        'p_Sukari2kg:product:default': { productId: 'p_Sukari2kg', productName: 'Sukari 2kg', quantitySold: 30, grossSales: 90000 },
        'p_Mafuta1L:product:default': { productId: 'p_Mafuta1L', productName: 'Mafuta 1L', quantitySold: 12, grossSales: 60000 }
    },
    inventory: { SALE: 42, RETURN: 2, VOID: 1, ADJUSTMENT: 3 },
    transactions: [],
    daily: [
        { date: '2026-10-27', grossSales: 120000, completedSales: 5, returnedAmount: 0, voidValue: 0, expenses: 20000, netSales: 120000 },
        { date: '2026-10-28', grossSales: 90000, completedSales: 4, returnedAmount: 15000, voidValue: 0, expenses: 0, netSales: 75000 },
        { date: '2026-10-29', grossSales: 0, completedSales: 0, returnedAmount: 0, voidValue: 0, expenses: 0, netSales: 0 },
        { date: '2026-10-30', grossSales: 450000, completedSales: 12, returnedAmount: 40000, voidValue: 15000, expenses: 62000, netSales: 395000 },
        { date: '2026-10-31', grossSales: 210000, completedSales: 8, returnedAmount: 0, voidValue: 0, expenses: 50000, netSales: 210000 },
        { date: '2026-11-01', grossSales: 250000, completedSales: 9, returnedAmount: 0, voidValue: 0, expenses: 0, netSales: 250000 },
        { date: '2026-11-02', grossSales: 120000, completedSales: 4, returnedAmount: 0, voidValue: 0, expenses: 0, netSales: 120000 }
    ]
};

const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skhBOS && !!window.skhBusinessOverview, null, { timeout: 30000 });

/* ---------------- install stub + render ---------------- */
async function mount(report) {
    return page.evaluate(async (rep) => {
        if (!window.__bosRestore) {
            const original = { wrapCallable: window.skh.wrapCallable, query: window.skh.query, getDocs: window.skh.getDocs, collection: window.skh.collection, where: window.skh.where, limit: window.skh.limit };
            window.__bosRestore = () => Object.assign(window.skh, original);
        }
        window.__calls = [];
        window.skh.wrapCallable = () => async () => ({ data: JSON.parse(JSON.stringify(rep)) });
        window.skh.collection = () => ({}); window.skh.where = () => ({}); window.skh.limit = () => ({}); window.skh.query = () => ({});
        window.skh.getDocs = async () => ({ docs: [
            { id: 'pos_a1', data: () => ({ saleId: 'pos_a1', totals: { total: 25000 }, payment: { method: 'Cash', status: 'RECORDED', amount: 25000 }, status: 'COMPLETED', completedAt: new Date().toISOString() }) },
            { id: 'pos_b2', data: () => ({ saleId: 'pos_b2', totals: { total: 18000 }, payment: { method: 'Mpesa', status: 'RECORDED', amount: 18000 }, status: 'COMPLETED', completedAt: new Date(Date.now() - 3600000).toISOString() }) },
            { id: 'pos_c3', data: () => ({ saleId: 'pos_c3', totals: { total: 9000 }, payment: { method: 'Mpesa', status: 'RECORDED', amount: 9000 }, status: 'COMPLETED', completedAt: new Date(Date.now() - 7200000).toISOString() }) }
        ] });
        window.dashboardCachedData = {
            prodSnap: { forEach: (cb) => [
                { title: 'Sukari 2kg', stock: 2, lowStockAlert: 5 },
                { title: 'Mafuta 1L', stock: 40, lowStockAlert: 5 },
                { title: 'Sabuni ya kufulia', stock: 60, lowStockAlert: 10 },
                { title: 'Chumvi 1kg', stock: 25, lowStockAlert: 5 }
            ].forEach(x => cb({ id: 'p_' + x.title.replace(/[^a-z0-9]/gi, ''), data: () => x })) },
            poSnap: { forEach: (cb) => [{ status: 'pending' }, { status: 'completed' }].forEach(x => cb({ data: () => x })) }
        };
        window.skh.currentUser = { uid: 'u1' };
        window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'biz1', storeId: 'store1', shopName: 'Duka la Test' };

        const host = document.getElementById('cockpitHost') || (() => { const h = document.createElement('div'); h.id = 'cockpitHost'; document.body.appendChild(h); return h; })();
        host.innerHTML = '';
        window.skhRenderBusinessOSShell(host);
        window.skhBusinessOverview.state.recentSalesError = null;
        window.skhBusinessOverview.state.salesFilter = 'all';
        await window.skhBusinessOverview.render();
        await new Promise(r => setTimeout(r, 60));
        return !!document.querySelector('#dashWorkspace .bos-overview');
    }, report);
}

const rendered = await mount(REPORT);
ok(rendered, 'overview haikuchorwa');

/* ---------------- C1: chart ya kila siku ---------------- */
await step('C1 chart inatumia report.daily (bars 7, si namba za kubuni)', async () => {
    const r = await page.evaluate(() => {
        const chart = document.querySelector('#dashWorkspace .bos-chart');
        const cols = [...document.querySelectorAll('#dashWorkspace .bos-chart-col')];
        return {
            has: !!chart,
            role: chart && chart.getAttribute('role'),
            aria: chart && chart.getAttribute('aria-label'),
            count: cols.length,
            titles: cols.map(c => c.getAttribute('title')),
            heights: cols.map(c => c.querySelector('.bos-chart-bar').style.height),
            zeros: document.querySelectorAll('#dashWorkspace .bos-chart-bar.is-zero').length,
            meta: (document.querySelector('#dashWorkspace .bos-chart-meta') || {}).textContent || ''
        };
    });
    ok(r.has, 'chart haipo');
    eq(r.role, 'img', 'role ya chart');
    ok(r.aria && r.aria.length > 3, 'aria-label ya chart');
    eq(r.count, 7, 'bars');
    ok(/450,000/.test(r.titles[3]), 'title ya siku bora: ' + r.titles[3]);
    ok(/2026-11-02|2 Nov/.test(r.titles[6]), 'title ya siku ya mwisho: ' + r.titles[6]);
    eq(r.heights[3], '100%', 'bar ya juu');
    eq(r.zeros, 1, 'siku tupu ina bar sifuri');
    ok(/1,240,000/.test(r.meta), 'jumla kwenye meta: ' + r.meta);
});

/* ---------------- C2: marejesho/refund/madeni ---------------- */
await step('C2 panel ya marejesho inaonyesha refunds pending na madeni kutoka summary', async () => {
    const txt = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('#dashWorkspace .bos-panel')];
        const p = panels.find(x => /Marejesho/.test(x.querySelector('.bos-panel-head b').textContent));
        return p ? p.textContent : '';
    });
    ok(/55,000/.test(txt), 'marejesho yaliyorejeshwa');
    ok(/25,000/.test(txt), 'refund zinazosubiri');
    ok(/78,000/.test(txt), 'madeni yanayodaiwa');
    ok(/15,000/.test(txt), 'void');
});

/* ---------------- C3: bidhaa zisizouza ---------------- */
await step('C3 bidhaa zisizouza zinatoka products × posReports.products', async () => {
    const r = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('#dashWorkspace .bos-panel')];
        const p = panels.find(x => /zisizouza/.test(x.querySelector('.bos-panel-head b').textContent));
        return p ? [...p.querySelectorAll('.bos-list li')].map(li => li.textContent) : null;
    });
    ok(r, 'panel ya bidhaa zisizouza haipo');
    ok(r.length > 0, 'hakuna bidhaa zisizouza zilizoonyeshwa');
    ok(r.some(t => /Sabuni/.test(t)), 'Sabuni (haikuzwa) haipo: ' + r.join(' | '));
    ok(r.some(t => /Chumvi/.test(t)), 'Chumvi haipo');
    ok(!r.some(t => /Sukari/.test(t)), 'Sukari imeuzwa, haipaswi kuwa hapa: ' + r.join(' | '));
});

/* ---------------- C4: tahadhari zenye kipaumbele ---------------- */
await step('C4 tahadhari zimepangwa kwa kipaumbele na zina vitufe vya kwenda', async () => {
    const r = await page.evaluate(() => {
        const alerts = [...document.querySelectorAll('#dashWorkspace .bos-alert')];
        return {
            count: alerts.length,
            classes: alerts.map(a => a.className),
            labels: alerts.map(a => a.querySelector('b').textContent),
            buttons: alerts.map(a => a.querySelector('button') && a.querySelector('button').getAttribute('onclick'))
        };
    });
    ok(r.count >= 4, 'tahadhari chache mno: ' + r.count);
    ok(/is-danger/.test(r.classes[0]), 'ya kwanza si danger: ' + r.classes[0]);
    ok(r.labels.some(l => /Madeni/.test(l)), 'tahadhari ya madeni haipo');
    ok(r.labels.some(l => /chini ya kiwango/.test(l)), 'tahadhari ya stoo haipo');
    ok(r.buttons.every(Boolean), 'kila tahadhari ina kitufe');
});

await step('C4 kitufe cha tahadhari kinafanya kazi (switchDashTab halisi)', async () => {
    const r = await page.evaluate(async () => {
        const orig = window.switchDashTab;
        const seen = [];
        window.switchDashTab = (t) => { seen.push(t); };
        const btn = document.querySelector('#dashWorkspace .bos-alert button');
        const onclick = btn.getAttribute('onclick');
        btn.click();
        window.switchDashTab = orig;
        return { onclick, seen };
    });
    ok(/switchDashTab/.test(r.onclick), 'handler si switchDashTab: ' + r.onclick);
    eq(r.seen.length, 1, 'switchDashTab haikuitwa');
});

/* ---------------- C5: quick actions ---------------- */
await step('C5 quick actions 6, kila moja na handler halisi', async () => {
    const r = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('#dashWorkspace .bos-qa-btn')];
        return {
            count: btns.length,
            tags: btns.map(b2 => b2.tagName),
            types: btns.map(b2 => b2.getAttribute('type')),
            handlers: btns.map(b2 => b2.getAttribute('onclick')),
            groupRole: (document.querySelector('#dashWorkspace .bos-qa') || {}).getAttribute && document.querySelector('#dashWorkspace .bos-qa').getAttribute('role'),
            hasSwitch: typeof window.switchDashTab === 'function',
            hasRun: typeof window.skhBOSRunAction === 'function'
        };
    });
    eq(r.count, 6, 'idadi ya quick actions (transfer ipo tu kama handler yake ipo)');
    ok(r.tags.every(t => t === 'BUTTON'), 'zote si button');
    ok(r.types.every(t => t === 'button'), 'type=button');
    eq(r.groupRole, 'group', 'role ya kundi');
    ok(r.hasSwitch && r.hasRun, 'handlers halisi hazipo');
    ok(r.handlers.every(h => /switchDashTab|skhBOSRunAction/.test(h)), 'handler isiyojulikana: ' + r.handlers.join(' | '));
});

await step('C5 quick action ya POS inaita handler halisi', async () => {
    const r = await page.evaluate(() => {
        const orig = window.skhBOSRunAction;
        const seen = [];
        window.skhBOSRunAction = (a) => { seen.push(a); };
        const btn = document.querySelector('#dashWorkspace .bos-qa-btn[data-bos-qa="openPos"]');
        btn.click();
        window.skhBOSRunAction = orig;
        return seen;
    });
    eq(r[0], 'openPos', 'openPos haikuitwa: ' + JSON.stringify(r));
});

/* ---------------- C6: filter ya malipo ---------------- */
await step('C6 filter ya njia ya malipo inachuja mauzo halisi', async () => {
    const r = await page.evaluate(async () => {
        const sel = document.querySelector('#dashWorkspace .bos-filter select');
        if (!sel) return { error: 'hakuna select' };
        const recentPanel = () => [...document.querySelectorAll('#dashWorkspace .bos-panel')]
            .find(p => /hivi karibuni/.test(p.querySelector('.bos-panel-head b').textContent));
        const before = recentPanel().querySelectorAll('tbody tr').length;
        const options = [...sel.options].map(o => o.value);
        sel.value = 'Mpesa';
        sel.dispatchEvent(new Event('change'));
        await new Promise(r2 => setTimeout(r2, 40));
        const rows = [...document.querySelectorAll('#dashWorkspace .bos-panel')]
            .find(p => /hivi karibuni/.test(p.querySelector('.bos-panel-head b').textContent))
            .querySelectorAll('tbody tr');
        return {
            options,
            before,
            mpesaRows: rows.length,
            methods: [...rows].map(tr => tr.children[2].textContent.trim()),
            selected: document.querySelector('#dashWorkspace .bos-filter select').value
        };
    });
    ok(!r.error, r.error);
    ok(r.options.includes('all') && r.options.includes('Mpesa'), 'options: ' + r.options);
    eq(r.before, 3, 'mauzo yote kabla ya filter');
    eq(r.mpesaRows, 2, 'mauzo ya Mpesa pekee');
    ok(r.methods.every(m => m === 'Mpesa'), 'njia nyingine imebaki: ' + r.methods);
    eq(r.selected, 'Mpesa', 'chaguo linabaki baada ya kuchora upya');
});

/* ---------------- C7: badges za chanzo + aria ---------------- */
await step('C7 kila panel ina badge ya chanzo; tables zina scope; vipengele vya aria', async () => {
    const r = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('#dashWorkspace .bos-panel')];
        const ths = [...document.querySelectorAll('#dashWorkspace .bos-table th')];
        return {
            panels: panels.length,
            withSource: panels.filter(p => p.querySelector('.bos-source')).length,
            sources: panels.map(p => (p.querySelector('.bos-source') || {}).textContent || ''),
            thsMissingScope: ths.filter(th => th.getAttribute('scope') !== 'col').length,
            chartAria: !!document.querySelector('#dashWorkspace .bos-chart[role="img"][aria-label]'),
            qaAria: !!document.querySelector('#dashWorkspace .bos-qa[aria-label]'),
            filterAria: !!(document.querySelector('#dashWorkspace .bos-filter select') || {}).getAttribute
        };
    });
    eq(r.withSource, r.panels, 'panel zisizo na chanzo: ' + r.panels + ' vs ' + r.withSource);
    eq(r.thsMissingScope, 0, 'th zisizo na scope');
    ok(r.chartAria, 'chart haina role=img+aria-label');
    ok(r.qaAria, 'kundi la quick actions haina aria-label');
});

/* ---------------- C9: faida haipatikani ---------------- */
await step('C9 faida inabaki "haipatikani" (hakuna namba ya kubuni)', async () => {
    const r = await page.evaluate(() => {
        const el = document.querySelector('#dashWorkspace .bos-profit');
        const body = document.querySelector('#dashWorkspace').textContent;
        return {
            cls: el && el.className,
            text: el ? el.textContent : '',
            fabricated: /1,250|1,100|45,000,000|120 bidhaa|Rice 25kg/.test(body)
        };
    });
    ok(r.cls && /is-unavailable/.test(r.cls), 'profit block si is-unavailable');
    ok(/Haipatikani/.test(r.text), 'haijaonyesha "haipatikani"');
    ok(!r.fabricated, 'kuna namba za kubuni kwenye ukurasa');
});

/* ---------------- C7 a11y: keyboard ---------------- */
await step('C7 keyboard: kitufe cha quick action kinapokea focus', async () => {
    const r = await page.evaluate(() => {
        const btn = document.querySelector('#dashWorkspace .bos-qa-btn');
        btn.focus();
        return { focused: document.activeElement === btn, tabIndex: btn.tabIndex };
    });
    ok(r.focused, 'kitufe hakipokei focus');
    eq(r.tabIndex, 0, 'tabIndex');
});

/* ---------------- Bila daily[]: hali ya wazi (hakuna kubuni) ---------------- */
await step('bila daily[] → hali ya wazi, hakuna chart ya kudhaniwa', async () => {
    const rep = JSON.parse(JSON.stringify(REPORT));
    delete rep.daily;
    const okRender = await mount(rep);
    ok(okRender, 'overview haikuchorwa bila daily');
    const r = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('#dashWorkspace .bos-panel')];
        const p = panels.find(x => /kila siku/.test(x.querySelector('.bos-panel-head b').textContent));
        return { cols: document.querySelectorAll('#dashWorkspace .bos-chart-col').length, text: p ? p.textContent : '' };
    });
    eq(r.cols, 0, 'chart bars ziliundwa bila daily');
    ok(/haupatikani|haipatikani/i.test(r.text), 'hakuna ujumbe wa wazi: ' + r.text.slice(0, 120));
    await mount(REPORT);
});

/* ---------------- C8: responsive 1440 / 768 / 390 ---------------- */
await step('C8 grid 1/2/3 kolamu + hakuna content iliyokatwa', async () => {
    const cleanHost = async () => {
        await page.evaluate(() => {
            document.querySelectorAll('body > *').forEach(el => {
                if (el.id !== 'cockpitHost' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') el.style.display = 'none';
            });
            document.getElementById('cockpitHost').style.background = '#F8FBFA';
        });
    };
    const shot = async (file) => {
        await cleanHost();
        await page.waitForTimeout(160);
        const el = await page.$('#cockpitHost');
        await el.screenshot({ path: file });
    };
    const measure = async (w, h) => {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(220);
        return page.evaluate(() => {
            const grid = document.querySelector('#dashWorkspace .bos-grid-2');
            const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
            const doc = document.documentElement;
            const panels = [...document.querySelectorAll('#dashWorkspace .bos-panel')];
            const clipped = panels.filter(p => p.scrollWidth > p.clientWidth + 2).map(p => p.querySelector('.bos-panel-head b').textContent);
            const overflowing = panels.filter(p => {
                const r2 = p.getBoundingClientRect();
                return r2.right > window.innerWidth + 2 || r2.left < -2;
            }).map(p => p.querySelector('.bos-panel-head b').textContent);
            return {
                cols, clipped, overflowing,
                hScroll: doc.scrollWidth - window.innerWidth,
                qaCols: getComputedStyle(document.querySelector('#dashWorkspace .bos-qa')).gridTemplateColumns.split(' ').filter(Boolean).length,
                chartBars: document.querySelectorAll('#dashWorkspace .bos-chart-col').length
            };
        });
    };
    const wide = await measure(1440, 1000);
    ok(wide.cols >= 2, 'desktop inapaswa kuwa >=2 kolamu: ' + wide.cols);
    eq(wide.clipped.length, 0, 'panels zilizokatwa (1440): ' + wide.clipped.join(', '));
    eq(wide.overflowing.length, 0, 'panels zinazotoka nje (1440)');
    ok(wide.hScroll <= 1, 'horizontal scroll (1440): ' + wide.hScroll);
    await shot(SHOTS + '/cockpit-1440.png');

    const mid = await measure(768, 1024);
    ok(mid.cols >= 1, 'tablet cols');
    eq(mid.clipped.length, 0, 'panels zilizokatwa (768): ' + mid.clipped.join(', '));
    ok(mid.hScroll <= 1, 'horizontal scroll (768): ' + mid.hScroll);
    await shot(SHOTS + '/cockpit-768.png');

    const small = await measure(390, 844);
    eq(small.cols, 1, 'simu inapaswa kuwa kolamu 1');
    eq(small.clipped.length, 0, 'panels zilizokatwa (390): ' + small.clipped.join(', '));
    ok(small.hScroll <= 1, 'horizontal scroll (390): ' + small.hScroll);
    ok(small.chartBars === 7, 'bars za chart kwenye simu: ' + small.chartBars);
    await shot(SHOTS + '/cockpit-390.png');

    await page.setViewportSize({ width: 1440, height: 1000 });
});

/* ---------------- hakuna page errors ---------------- */
await step('hakuna page error wakati wa render yote', async () => {
    eq(errors.length, 0, 'errors: ' + errors.join(' | '));
});

await b.close();
console.log('COCKPIT KUU BROWSER: ' + pass + ' passed, ' + fails.length + ' FAILED');
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }

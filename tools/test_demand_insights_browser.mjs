#!/usr/bin/env node
/* Mahitaji ya Soko (demand_insights) — browser contract test.
   Inathibitisha: ishara tofauti hazichanganywi, kikomo cha 250 + siku 14,
   ulinganisho wa maandishi, pengo la stock, hakuna geo/cart, privacy, filters.

   Matumizi: node functions/local-server.js --static   (port 5055)
             node tools/test_demand_insights_browser.mjs
*/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const SHOTS = process.env.DI_SHOTS || '/home/user/sokohai-business-os/shots/mahitaji-ya-soko';
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
    P('p_mafuta', 'Mafuta ya Kupikia 1L', 'Vyakula', { price: 5200, stock: 30, views: 300, savedCount: 4 }),
    P('p_sabuni', 'Sabuni ya Kufulia 1kg', 'Usafi', { price: 2800, stock: 0, views: 450 }),      // stock 0 + views → gap
    P('p_kikapu', 'Kikapu cha Mpunga', 'Nyumbani', { price: 4500, stock: 0 }),                    // stock 0, hakuna ishara → si gap
    P('p_mpya', 'Bidhaa Mpya', 'Vyakula', { price: 3000, stock: 5, createdAt: dayAgo(3), views: 40 })
];

/* search events: 300 za hivi karibuni + 1 ya siku 20 (itapaswa kuachwa) */
const nowMs = Date.now();
const SEARCH_EVENTS = [{ type: 'search', query: 'sukari', at: new Date(nowMs - 20 * 86400000).toISOString() }];
for (let i = 0; i < 300; i++) {
    SEARCH_EVENTS.push({ type: 'search', query: i % 3 === 0 ? 'sukari' : (i % 3 === 1 ? 'mafuta' : 'zzz-sina-bidhaa'), at: new Date(nowMs - (i % 10) * 3600000).toISOString() });
}

const ORDERS = [
    { id: 'o1', sellerId: 'u1', status: 'completed', completedAt: dayAgo(1), items: [{ productId: 'p_sukari', qty: 4, price: 3400 }] },
    { id: 'o2', sellerId: 'u1', status: 'completed', completedAt: dayAgo(40), items: [{ productId: 'p_sukari', qty: 2, price: 3400 }] },
    { id: 'o3', sellerId: 'u1', status: 'completed', completedAt: dayAgo(2), items: [{ productId: 'p_mafuta', qty: 3, price: 5200 }] }
];
const POS = { products: { 'p_sabuni:product:piece': { productId: 'p_sabuni', quantitySold: 5, quantityReturned: 0, quantityVoided: 0, grossSales: 14000, returnsValue: 0, netSales: 14000 } } };

const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));
page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.skh && !!window.skhRenderDemandInsights, null, { timeout: 30000 });

async function mount(opts) {
    const o = opts || {};
    await page.evaluate(async ({ products, orders, pos, events, broken, noSearch }) => {
        window.__broken = !!broken;
        window.skh.collection = (db, name) => ({ __name: name });
        window.skh.where = (f, o2, v) => ({ f, o: o2, v });
        window.skh.limit = (n) => ({ n });
        window.skh.query = (col, ...rest) => ({ col, rest });
        window.skh.getDocs = async (q) => {
            const name = q && q.col ? q.col.__name : '';
            let rows = [];
            if (name === 'orders') rows = orders.slice();
            else if (name === 'products') rows = products.slice();
            else if (name === 'recommendationEvents') rows = noSearch ? [] : events.map((e, i) => Object.assign({ id: 'e' + i }, e));
            (q.rest || []).forEach(c => { if (c && c.f) rows = rows.filter(r => r[c.f] === c.v); });
            const docs = rows.map(r => ({ id: r.id || 'x', data: () => JSON.parse(JSON.stringify(r)) }));
            return { empty: docs.length === 0, docs, size: docs.length, forEach: cb => docs.forEach(cb) };
        };
        window.skh.wrapCallable = (name) => async () => {
            if (name !== 'posReports') return { data: {} };
            if (window.__broken) throw new Error('POS imezimwa kwa jaribio');
            return { data: { products: JSON.parse(JSON.stringify(pos.products)), summary: { completedSales: 1, grossSales: 14000, netSales: 14000, returnedAmount: 0, voidValue: 0 }, daily: [] } };
        };
        window.skh._marketSearchTerms = [];
        window.skh._marketSearchLoadedAt = 0;
        window.skh._marketSearchLoading = false;
        window.dashboardCachedData = { prodSnap: { forEach: () => {} }, ledgerSnap: { forEach: () => {} }, poSnap: { forEach: () => {} }, staffSnap: { forEach: () => {} } };
        window.skh.currentUser = { uid: 'u1', email: 'seller@example.com' };
        window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'biz1', storeId: 'store1', shopName: 'Duka la Test' };
        window.skh.currentMode = 'seller';
        window.activeDashboardTab = 'demand_insights';
        const host = document.getElementById('mpHost') || (() => { const h = document.createElement('div'); h.id = 'mpHost'; document.body.appendChild(h); return h; })();
        window.skhRenderBusinessOSShell(host);
        window.switchDashTab('demand_insights');
        await new Promise(r => setTimeout(r, 1500));
    }, { products: PRODUCTS, orders: ORDERS, pos: POS, events: SEARCH_EVENTS, broken: !!o.broken, noSearch: !!o.noSearch });
}
const cleanHost = async () => {
    await page.evaluate(() => {
        document.querySelectorAll('body > *').forEach(el => { if (el.id !== 'mpHost' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') el.style.display = 'none'; });
        const h = document.getElementById('mpHost'); h.style.position = 'relative'; h.style.background = '#F8FBFA'; h.style.minHeight = '100vh';
    });
};

await mount();

await step('1. dashboard inafungua; aina 4 za ishara zinatenganishwa', async () => {
    const r = await page.evaluate(() => ({
        shell: !!document.querySelector('.di-shell'),
        cards: document.querySelectorAll('.di-card').length,
        charts: document.querySelectorAll('.di-chart').length,
        panels: document.querySelectorAll('.di-panel').length,
        heads: [...document.querySelectorAll('.di-table thead th')].map(t => t.textContent.trim())
    }));
    ok(r.shell, 'shell');
    eq(r.cards, 4, 'kadi 4 (search / matched / gap / bidhaa)');
    eq(r.charts, 3, 'charts 3 tofauti (search, views, ununuzi)');
    eq(r.panels, 2, 'panel 2 (maneno, pengo la stock)');
    ok(r.heads.some(h => /Utafutaji/.test(h)) && r.heads.some(h => /Views/.test(h)) && r.heads.some(h => /Units/.test(h)), 'kolamu za ishara: ' + r.heads.join('|'));
});

await step('2. search: kikomo 250 + cutoff ya siku 14', async () => {
    const r = await page.evaluate(() => window.skhDi.searchState());
    eq(r.state, 'ok', 'search inapatikana');
    ok(r.total <= 250, 'events zilizochakatwa: ' + r.total);
    eq(r.total, 250, 'kikomo 250 kimetumika');
    const hasOld = await page.evaluate(() => (window.skhDi.terms() || []).some(t => t.query === 'sukari' && t.n > 0));
    ok(hasOld, 'maneno mapya yapo');
});

await step('3. ulinganisho wa maandishi: "sukari" inalingana, "zzz" haipatani', async () => {
    const r = await page.evaluate(() => {
        const recs = window.skhDi.recs();
        const sukari = recs.find(x => x.id === 'p_sukari');
        const mafuta = recs.find(x => x.id === 'p_mafuta');
        return { sukari: sukari.searches, mafuta: mafuta.searches, kikapu: recs.find(x => x.id === 'p_kikapu').searches, unmatched: (window.skhDi.unmatched() || []).map(t => t.query) };
    });
    ok(r.sukari > 0, 'sukari imelingana: ' + r.sukari);
    ok(r.mafuta > 0, 'mafuta imelingana: ' + r.mafuta);
    eq(r.kikapu, 0, 'kikapu hakilingani na search yoyote');
    ok(r.unmatched.some(q => /zzz/.test(q)), 'neno lisilopatana limeorodheshwa: ' + r.unmatched.join(','));
});

await step('4. views/saves ni za maisha yote; units ni za kipindi', async () => {
    const r = await page.evaluate(() => {
        const recs = window.skhDi.recs();
        const s = recs.find(x => x.id === 'p_sukari');
        const headText = [...document.querySelectorAll('.di-table thead th')].map(t => t.textContent).join('|');
        return { views: s.views, units: s.units, mpUnits: s.mpUnits, posUnits: s.posUnits, headText };
    });
    eq(r.views, 820, 'views = 820 (maisha yote)');
    eq(r.mpUnits, 4, 'units za kipindi (marketplace) = 4');
    ok(/maisha yote/i.test(r.headText), 'lebo ya views inasema "maisha yote"');
});

await step('5. units zinajumlisha POS + marketplace bila kuhesabu mara mbili', async () => {
    const r = await page.evaluate(() => {
        const s = window.skhDi.recs().find(x => x.id === 'p_sabuni');
        return { units: s.units, pos: s.posUnits, mp: s.mpUnits };
    });
    eq(r.pos, 5, 'POS net 5');
    eq(r.mp, 0, 'hakuna oda ya marketplace');
    eq(r.units, 5, 'jumla 5');
});

await step('6. mwenendo: % tu ikiwa awali > 0', async () => {
    const r = await page.evaluate(() => {
        const recs = window.skhDi.recs();
        const s = recs.find(x => x.id === 'p_sukari');   // 4 sasa vs 2 awali
        const m = recs.find(x => x.id === 'p_mafuta');   // 3 sasa, 0 awali
        const rows = [...document.querySelectorAll('.di-row')].map(t => t.textContent.replace(/\s+/g, ' '));
        return { sTrend: s.trend, mTrend: m.trend, rows };
    });
    ok(r.sTrend !== null && Math.abs(r.sTrend - 1) < 1e-9, 'sukari +100%');
    eq(r.mTrend, null, 'mafuta haina msingi');
    ok(r.rows.some(t => /bila msingi/.test(t)), 'UI inaonyesha "bila msingi"');
});

await step('7. pengo la stock: stock 0 + ishara tu', async () => {
    const r = await page.evaluate(() => {
        const recs = window.skhDi.recs();
        return {
            sabuni: recs.find(x => x.id === 'p_sabuni').gap,
            kikapu: recs.find(x => x.id === 'p_kikapu').gap,
            panel: document.querySelectorAll('.di-gap').length
        };
    });
    ok(r.sabuni, 'p_sabuni: stock 0 + views/search → gap');
    ok(!r.kikapu, 'p_kikapu: stock 0 lakini hakuna ishara → si gap');
    eq(r.panel, 1, 'panel ina bidhaa 1');
});

await step('8. filters: category / mwenendo / upatikanaji', async () => {
    const r = await page.evaluate(async () => {
        window.skhDi.filter('cat', 'Usafi'); await new Promise(x => setTimeout(x, 120));
        const cat = window.skhDi.filtered();
        window.skhDi.clear(); await new Promise(x => setTimeout(x, 120));
        window.skhDi.filter('avail', 'out'); await new Promise(x => setTimeout(x, 120));
        const out = window.skhDi.filtered();
        window.skhDi.filter('avail', 'in'); await new Promise(x => setTimeout(x, 120));
        const inn = window.skhDi.filtered();
        window.skhDi.clear(); await new Promise(x => setTimeout(x, 120));
        window.skhDi.filter('trend', 'none'); await new Promise(x => setTimeout(x, 120));
        const none = window.skhDi.filtered();
        window.skhDi.clear();
        return { cat, out, inn, none };
    });
    eq(JSON.stringify(r.cat), JSON.stringify(['p_sabuni']), 'category Usafi');
    ok(r.out.includes('p_sabuni') && r.out.includes('p_kikapu'), 'stock imeisha: ' + r.out.join(','));
    ok(!r.inn.includes('p_sabuni'), 'stock ipo haijumuishi p_sabuni');
    ok(r.none.includes('p_mafuta') && r.none.includes('p_kikapu'), 'bila msingi: ' + r.none.join(','));
});

await step('9. hakuna geo, cart, wala mapendekezo ya kuagiza', async () => {
    const r = await page.evaluate(() => {
        // ondoa sentensi ya kutangaza kutokuwa na data ya eneo, kisha angalia mabaki
        const raw = (document.querySelector('.di-shell') || {}).textContent || '';
        const txt = raw
            .replace(/Hakuna data ya eneo[^.]*\./gi, ' ')
            .replace(/Hakuna data ya wateja[^.]*\./gi, ' ');
        const src = window.skhDi.sources();
        return {
            geo: /mkoa|wilaya|jografia|geo|location|ramani|map\b/i.test(txt),
            cart: /\bcart\b|kikapu cha manunuzi|addToCart/i.test(txt),
            reorder: /\bagiza\s+\d+/i.test(txt) || /reorder quantity[:\s]*\d/i.test(txt),   // hakuna kiasi cha kuagiza kilichobuniwa
            srcHasGeo: src.some(s => /geo|location|cart/i.test(s)),
            hasNoGeoNote: /Hakuna data ya eneo/i.test(raw)
        };
    });
    ok(!r.geo, 'hakuna maandishi ya eneo/ramani');
    ok(!r.cart, 'hakuna cart');
    ok(!r.reorder, 'hakuna kiasi cha kuagiza kilichobuniwa');
    ok(!r.srcHasGeo, 'vyanzo havina geo/cart');
    ok(r.hasNoGeoNote, 'kuna taarifa ya kutokuwa na data ya eneo');
});

await step('10. privacy: hakuna PII ya mnunuzi/mtumiaji kwenye UI', async () => {
    const r = await page.evaluate(() => {
        const html = document.querySelector('.di-shell').innerHTML;
        return { email: /@/.test(html), uid: /userId|buyerId|customerId|uid/i.test(html) };
    });
    ok(!r.email, 'hakuna email');
    ok(!r.uid, 'hakuna vitambulisho vya watumiaji');
});

await step('11. search isipopatikana: Haipatikani (si 0)', async () => {
    await mount({ noSearch: true });
    const r = await page.evaluate(() => ({
        st: window.skhDi.searchState(),
        warn: !!document.querySelector('.di-warn'),
        card: [...document.querySelectorAll('.di-card')].map(c => c.textContent.replace(/\s+/g, ' ').trim()),
        panel: (document.querySelector('.di-panel') || {}).textContent || ''
    }));
    ok(r.st.state !== 'ok', 'search haipatikani: ' + r.st.state);
    ok(r.warn, 'onyo linaonekana');
    ok(r.card.some(c => /Haipatikani/.test(c)), 'kadi inasema Haipatikani');
    ok(/Haipatikani/.test(r.panel), 'panel inasema Haipatikani');
    await mount();
});

await step('12. POS isipopatikana: units ni marketplace pekee + onyo', async () => {
    await mount({ broken: true });
    const r = await page.evaluate(() => ({
        sabuni: window.skhDi.recs().find(x => x.id === 'p_sabuni'),
        warn: [...document.querySelectorAll('.di-warn')].map(w => w.textContent).join(' | ')
    }));
    eq(r.sabuni.posUnits, 0, 'POS = 0 (haipatikani)');
    eq(r.sabuni.units, 0, 'units = marketplace pekee');
    ok(/POS haipatikani/.test(r.warn), 'onyo la POS: ' + r.warn.slice(0, 80));
    await mount();
});

await step('13. responsive 1440/768/390', async () => {
    const measure = async (w, h) => {
        await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
        return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    };
    ok((await measure(1440, 1000)) <= 1, 'desktop overflow');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/mahitaji-1440.png' });
    ok((await measure(768, 1024)) <= 1, 'tablet overflow');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/mahitaji-768.png' });
    ok((await measure(390, 844)) <= 1, 'mobile overflow');
    await cleanHost(); await page.screenshot({ path: SHOTS + '/mahitaji-390.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
});

for (const [name, w, h] of [['1440', 1440, 1000], ['768', 768, 1024], ['390', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
    await cleanHost();
    const el = await page.$('#mpHost');
    await el.screenshot({ path: `${SHOTS}/mahitaji-full-${name}.png` });
}

await step('14. hakuna error ya JS', async () => { eq(errors.length, 0, 'errors: ' + errors.slice(0, 3).join(' | ')); });

await b.close();
console.log('MAHITAJI YA SOKO BROWSER: ' + pass + ' passed, ' + fails.length + ' FAILED');
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }

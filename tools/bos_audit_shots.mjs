#!/usr/bin/env node
/* ============================================================================
   Business OS — AUDIT SHOTS + RESPONSIVE MEASUREMENTS (Phase 5 & 7)
   ----------------------------------------------------------------------------
   Matumizi: node tools/bos_audit_shots.mjs <outDir>
   Inachora moduli kuu kwenye viewport 1440 / 820 / 768 / 390 / 360 na kupima:
     • horizontal overflow (scrollWidth vs viewport)
     • vipengele vinavyopita upana wa skrini
     • hali ya sidebar (off-canvas) + kitufe cha menu
     • ukubwa wa tap targets (< 32px)
     • majedwali yanayosukuma ukurasa (badala ya kuskroli ndani ya panel)
   Data: backend ya test (stub). HAIONYESHI namba za kubuni — inatumia bidhaa
   moja ya test tu ili kupima mpangilio.
   ========================================================================== */
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = process.argv[2] || '/home/user/sokohai-business-os/shots/business-os-audit';
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';

const MODULES = [
    ['overview', 'Dashibodi Kuu'],
    ['my_products', 'Bidhaa Zangu'],
    ['product_performance', 'Utendaji wa Bidhaa'],
    ['inventory', 'Stoo na Hifadhi'],
    ['expenses', 'Matumizi na Gharama'],
    ['staff', 'Wafanyakazi'],
    ['cargo', 'Kituo cha Tokeni'],
    ['bookings', 'Maombi ya Usafirishaji'],
    ['pos_page', 'POS'],
    ['settings', 'Mipangilio']
];

const STUB = () => {
    const p = [{
        id: 'p1', userId: 'u1', title: 'Sukari 2kg', category: 'Vyakula', subCategory: 'Nafaka', price: 3400, buyPrice: 1500,
        stock: 50, lowStockAlert: 5, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', image: 'a.jpg',
        imagesArray: ['a.jpg'], description: 'Maelezo ya kutosha kwa bidhaa hii sokoni.', sku: 'SKU-p1', barcode: 'BC-p1',
        createdAt: new Date(Date.now() - 90 * 86400000).toISOString(), views: 120, likeCount: 8, savedCount: 4
    }];
    window.skh.collection = (d, n) => ({ __name: n });
    window.skh.where = (f, o, v) => ({ f, o, v });
    window.skh.limit = n => ({ n });
    window.skh.query = (c, ...r) => ({ col: c, rest: r });
    window.skh.getDocs = async () => { const docs = p.map(r => ({ id: r.id, data: () => r })); return { empty: false, docs, size: 1, forEach: cb => docs.forEach(cb) }; };
    window.skh.getDoc = async (r) => ({ id: r && r.id, exists: () => true, data: () => p[0] });
    window.skh.updateDoc = async () => { }; window.skh.addDoc = async () => ({ id: 'n1' }); window.skh.deleteDoc = async () => { };
    window.skh.loadMarketSearchSignals = async () => [];
    window.skh.wrapCallable = () => async () => ({ data: {} });
    window.skh.currentUser = { uid: 'u1', displayName: 'Mkulima Test', email: 'test@example.com' };
    window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'b1', storeId: 's1', shopName: 'Duka la Test', stockMode: 'strict', businessSetupComplete: true };
    window.skh.currentMode = 'seller';
    window.dashboardCachedData = { prodSnap: { size: 1, forEach: cb => cb({ id: 'p1', data: () => p[0] }) }, ledgerSnap: { size: 0, forEach: () => { } }, poSnap: { size: 0, forEach: () => { } }, staffSnap: { size: 0, forEach: () => { } }, totalSales: 0, totalProfit: 0, totalExpenses: 0, activeDebts: 0 };
};

/* Mount HALISI: dashboard ya muuzaji inachorwa na `loadAndRenderDashboard()`
   (03-dashboard.js → skhBOS.renderShell + initShell + switchDashTab). Hii ni
   njia ileile mtumiaji anayoiona — si host ya kubuni. */
const REAL_MOUNT = async () => {
    /* applyModeUI ndiyo inayoficha chrome ya Soko Kuu (top/bottom bars) na
       kuonyesha dashboardViews — hii ni njia halisi ya mtumiaji. */
    try { window.skh.applyModeUI(); } catch (e) { }
    const dv = document.getElementById('dashboardViews');
    if (dv) dv.style.display = 'block';
    if (typeof window.loadAndRenderDashboard === 'function') await window.loadAndRenderDashboard();
    await new Promise(r => setTimeout(r, 2200));
    /* Ficha modal ya kukaribisha (onboarding ya mara moja) — HATUBONYEZI kitufe
       ili hali ya mode isibadilike; tunaficha tu kwa picha. */
    try {
        const w = document.getElementById('welcomeModal');
        if (w) w.style.display = 'none';
        document.querySelectorAll('body > div, body > section').forEach(d => {
            const cs = getComputedStyle(d);
            if (cs.position === 'fixed' && cs.display !== 'none' && Number(cs.zIndex) >= 900
                && !d.querySelector('.bos-shell') && !d.classList.contains('bos-shell')
                && !/^dashboardViews|^buyerView/.test(d.id || '')) {
                d.style.display = 'none';
            }
        });
        const bv = document.getElementById('buyerView');
        if (bv) bv.style.display = 'none';
        const dv = document.getElementById('dashboardViews');
        if (dv) dv.style.display = 'block';
    } catch (e) { }
    await new Promise(r => setTimeout(r, 400));
    return !!document.querySelector('.bos-shell');
};

const VIEWPORTS = [
    ['1440', { width: 1440, height: 950 }],
    ['820', { width: 820, height: 1000 }],
    ['768', { width: 768, height: 1000 }],
    ['390', { width: 390, height: 844 }],
    ['360', { width: 360, height: 780 }]
];

const b = await chromium.launch({ args: ['--no-sandbox'] });
const report = {};

for (const [vwName, vp] of VIEWPORTS) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('dialog', d => d.dismiss().catch(() => { }));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!window.skh && !!window.skhRenderBusinessOSShell, null, { timeout: 30000 });
    await page.evaluate(STUB);
    await page.evaluate(REAL_MOUNT);
    await new Promise(r => setTimeout(r, 1200));

    report[vwName] = [];
    for (const [tab, label] of MODULES) {
        await page.evaluate((t) => {
            const el = document.querySelector(`[data-bos-tab="${t}"]`);
            if (el) el.click();
        }, tab);
        await new Promise(r => setTimeout(r, 1300));

        const m = await page.evaluate(() => {
            const de = document.documentElement;
            const vw = window.innerWidth;
            const wide = [];
            document.querySelectorAll('.bos-shell *').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && (r.right > vw + 2 || r.left < -2)) {
                    const cs = getComputedStyle(el);
                    if (cs.position === 'fixed') return;
                    wide.push((el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : '') + ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']');
                }
            });
            const small = [];
            document.querySelectorAll('.bos-shell button').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.height > 0 && r.height < 30) small.push((el.textContent || '').trim().slice(0, 22) + ':' + Math.round(r.height));
            });
            const sb = document.getElementById('bosSidebar');
            const sbr = sb ? sb.getBoundingClientRect() : null;
            return {
                docScrollW: de.scrollWidth, vw,
                overflowX: de.scrollWidth - vw,
                wideCount: wide.length, wide: wide.slice(0, 5),
                smallTargets: small.length, small: small.slice(0, 4),
                sidebarLeft: sbr ? Math.round(sbr.left) : null,
                sidebarW: sbr ? Math.round(sbr.width) : null,
                sidebarVisible: sbr ? (sbr.right > 0 && sbr.left < vw) : false,
                menuBtn: !!document.querySelector('.bos-menu-btn')
            };
        });
        report[vwName].push({ tab, label, ...m });

        await page.screenshot({ path: `${OUT}/${vwName}-${tab}.png`, fullPage: false });
    }

    /* nav drawer kwenye simu: bonyeza kitufe cha menu */
    if (vp.width <= 900) {
        await page.evaluate(() => { const b2 = document.querySelector('.bos-menu-btn'); if (b2) b2.click(); });
        await new Promise(r => setTimeout(r, 700));
        const open = await page.evaluate(() => {
            const sb = document.getElementById('bosSidebar');
            const r = sb ? sb.getBoundingClientRect() : null;
            return { left: r ? Math.round(r.left) : null, w: r ? Math.round(r.width) : null };
        });
        report[vwName].push({ tab: 'nav-drawer', label: 'drawer', sidebarLeft: open.left, sidebarW: open.w, sidebarVisible: open.left !== null && open.left >= 0 });
        await page.screenshot({ path: `${OUT}/${vwName}-nav-drawer.png`, fullPage: false });
    }
    await ctx.close();
}

await b.close();
fs.writeFileSync(OUT + '/responsive-report.json', JSON.stringify(report, null, 1));

for (const vw of Object.keys(report)) {
    const bad = report[vw].filter(r => r.overflowX > 2 || (r.wideCount || 0) > 0);
    console.log(`\n=== ${vw}px ===  moduli: ${report[vw].length} | overflow/element-wide: ${bad.length}`);
    for (const r of report[vw]) {
        console.log('  ' + (r.tab + '').padEnd(22) + ' overflowX:' + String(r.overflowX).padStart(4) +
            ' wide:' + String(r.wideCount || 0).padStart(2) +
            ' small-targets:' + String(r.smallTargets || 0).padStart(2) +
            ' sidebar:' + (r.sidebarVisible ? 'inaonekana' : 'off-canvas') + (r.sidebarLeft !== null ? ' (' + r.sidebarLeft + 'px)' : '') +
            ((r.wide && r.wide.length) ? ' :: ' + r.wide.join(' , ') : ''));
    }
}
console.log('\nSHOTS:', OUT);

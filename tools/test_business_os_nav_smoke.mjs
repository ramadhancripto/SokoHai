#!/usr/bin/env node
/* ============================================================================
   Business OS — NAV / BUTTON SMOKE (Phase 6, repair 2026-11-04)
   ----------------------------------------------------------------------------
   Inafungua app HALISI (index.html, modules zote), inaweka shell kwenye
   container ya test na backend iliyowekwa (stub — HAKUNA data ya kubuni
   inayoonyeshwa; stub inatumika tu kufanya queries zifanye kazi).

   Inathibitisha:
     1. Kila kipengele cha sidebar kinafikisha mahali pake (kichwa cha ukurasa
        kinalingana na kipengele kilichobonyezwa; hakuna "stale content").
     2. Token Center (cargo) inaonyesha UI HALISI (fomu ya Token C + kitufe).
     3. Moduli 7 za usafirishaji zinaonyesha daraja la ukweli (hakuna namba).
     4. Vitufe vya action vinafungua modal zinazohusika.
     5. Hoja 5 za Kituo cha Udhibiti zinafungua sehemu tofauti (admin) na
        lango la ruhusa (asiye admin).
     6. Kamusi inafunguka; "Rudi Soko Kuu" inabadilisha mode kweli.
     7. Fallback: tab isiyojulikana haionyeshi maudhui ya tab iliyopita.
     8. Hakuna JS error mpya.

   Matumizi:
     node functions/local-server.js --static   (port 5055)
     node tools/test_business_os_nav_smoke.mjs
   ========================================================================== */
import { chromium } from 'playwright';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const b = await chromium.launch({ args: ['--no-sandbox'] });
let pass = 0;
const fails = [];
const ONLY = process.env.ONLY ? String(process.env.ONLY).split(',') : null;
async function step(name, fn) {
    if (ONLY && !ONLY.some(k => name.toLowerCase().indexOf(k.toLowerCase()) !== -1)) return;
    try { const r = await fn(); if (r === false) throw new Error('assert imeshindikana'); pass++; }
    catch (e) { fails.push(name + ' → ' + (e && e.message)); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };

const STUB = (isAdmin) => {
    const p = [{ id: 'p1', userId: 'u1', title: 'Sukari 2kg', category: 'Vyakula', subCategory: 'Nafaka', price: 3400, buyPrice: 1500, stock: 50, lowStockAlert: 5, publicationStatus: 'published', status: 'active', baseUnit: 'Piece', image: 'a.jpg', imagesArray: ['a.jpg'], description: 'Maelezo ya kutosha kwa bidhaa hii sokoni.', sku: 'SKU-p1', barcode: 'BC-p1', createdAt: new Date().toISOString(), views: 10, likeCount: 2, savedCount: 1 }];
    window.skh.collection = (db, n) => ({ __name: n });
    window.skh.where = (f, o, v) => ({ f, o, v });
    window.skh.limit = n => ({ n });
    window.skh.query = (col, ...rest) => ({ col, rest });
    window.skh.getDocs = async () => { const docs = p.map(r => ({ id: r.id, data: () => r })); return { empty: false, docs, size: docs.length, forEach: cb => docs.forEach(cb) }; };
    window.skh.getDoc = async (ref) => ({ id: ref && ref.id, exists: () => true, data: () => p[0] });
    window.skh.updateDoc = async () => { }; window.skh.addDoc = async () => ({ id: 'n1' }); window.skh.deleteDoc = async () => { };
    window.skh.loadMarketSearchSignals = async () => [];
    window.skh.wrapCallable = (name) => async () => ({ data: name === 'adminWhoAmI' ? { admin: !!isAdmin, superAdmin: !!isAdmin } : {} });
    window.skh.currentUser = { uid: 'u1', displayName: 'Mkulima Test', email: 'test@example.com' };
    window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'b1', storeId: 's1', shopName: 'Duka la Test', stockMode: 'strict', businessSetupComplete: true };
    window.skh.currentMode = 'seller';
    window.dashboardCachedData = { prodSnap: { size: 1, forEach: cb => cb({ id: 'p1', data: () => p[0] }) }, ledgerSnap: { size: 0, forEach: () => { } }, poSnap: { size: 0, forEach: () => { } }, staffSnap: { size: 0, forEach: () => { } }, totalSales: 0, totalProfit: 0, totalExpenses: 0, activeDebts: 0 };
    let host = document.getElementById('bosSmokeHost');
    if (!host) {
        host = document.createElement('div');
        host.id = 'bosSmokeHost';
        host.style.cssText = 'position:fixed;inset:0;z-index:99990;background:#F8FBFA;overflow:auto';
        document.body.appendChild(host);
    }
    window.skhRenderBusinessOSShell(host);
};

/* Kila ukurasa unafunguliwa kwenye CONTEXT yake: localStorage/session ya app
   (mf. `sokohai_mode`) isichafue hatua inayofuata. */
async function openPage(isAdmin) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    page.ctx = ctx; // kwa kufunga context nzima ya hatua hii
    const errs = [];
    page.on('pageerror', e => errs.push(String(e && e.message || e)));
    page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource|Geolocation/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    page.on('dialog', d => d.dismiss().catch(() => { }));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!window.skh && !!window.skhRenderBusinessOSShell, null, { timeout: 30000 });
    await page.evaluate(STUB, !!isAdmin);
    // Subiri boot ikamilike: sehemu ya app hufunga modal zote baada ya ~2s,
    // hivyo kubonyeza kabla ya hapo kunapima muda usio sahihi.
    await new Promise(r => setTimeout(r, 2600));
    return { page, errs, ctx };
}

const readWs = (page) => page.evaluate(() => {
    const ws = document.getElementById('dashWorkspace');
    const h = ws ? ws.querySelector('h1,h2,h3') : null;
    const active = document.querySelector('[data-bos-tab].active,[data-bos-tab].is-active');
    return {
        exists: !!ws,
        headline: h ? h.textContent.replace(/\s+/g, ' ').trim() : '',
        len: ws ? ws.innerText.replace(/\s+/g, ' ').length : 0,
        text: ws ? ws.innerText.replace(/\s+/g, ' ') : '',
        active: active ? active.getAttribute('data-bos-tab') : '',
        html: ws ? ws.innerHTML : ''
    };
});
const clickTab = async (page, tab) => {
    await page.evaluate(t => { const el = document.querySelector(`[data-bos-tab="${t}"]`); if (el) el.click(); }, tab);
    await new Promise(r => setTimeout(r, 1300));
    return readWs(page);
};

/* ------------------------------------------------------------------ 1 */
await step('tabs 20: kila kipengele kinaonyesha ukurasa wake (hakuna stale)', async () => {
    const { page } = await openPage(false);
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-bos-tab]'))
        .map(e => ({ tab: e.getAttribute('data-bos-tab'), label: (e.querySelector('b') || e).textContent.replace(/\s+/g, ' ').trim() })));
    ok(tabs.length >= 18, 'tabs zilizopatikana: ' + tabs.length);
    const seen = {};
    const problems = [];
    let prev = null;
    for (const t of tabs) {
        const r = await clickTab(page, t.tab);
        ok(r.exists, 'workspace haipo kwa ' + t.tab);
        if (r.len < 30) problems.push(t.tab + ' (tupu)');
        if (prev && r.html === prev.html) problems.push(t.tab + ' (haijabadilika)');
        if (r.active !== t.tab) problems.push(t.tab + ' (active=' + r.active + ')');
        if (seen[r.html]) problems.push(t.tab + ' (maudhui yanafanana na ' + seen[r.html] + ')');
        seen[r.html] = t.tab;
        prev = r;
    }
    await page.ctx.close();
    ok(problems.length === 0, 'matatizo: ' + problems.join(', '));
});

/* ------------------------------------------------------------------ 2 */
await step('Token Center (cargo): UI halisi, si placeholder', async () => {
    const { page } = await openPage(false);
    const r = await clickTab(page, 'cargo');
    ok(/TOKEN CENTER/i.test(r.headline), 'kichwa: ' + r.headline);
    const ui = await page.evaluate(() => ({
        input: !!document.getElementById('tokenCenterInputDL'),
        btn: !!Array.from(document.querySelectorAll('#dashWorkspace button')).find(x => /VERIFY|HAKIKI/i.test(x.textContent)),
        pickup: /PICKUP VERIFICATION/i.test(document.body.innerText),
        delivery: /DELIVERY VERIFICATION/i.test(document.body.innerText),
        handler: typeof window.verifyTokenCenterDL === 'function',
        notice: !!document.querySelector('.bos-token-notice')
    }));
    ok(ui.input, 'fomu ya Token C haipo');
    ok(ui.btn, 'kitufe cha kuthibitisha haipo');
    ok(ui.pickup && ui.delivery, 'masanduku ya Token A/C hayapo');
    ok(ui.handler, 'window.verifyTokenCenterDL haipo');
    ok(ui.notice, 'taarifa ya utegemezi haipo kwa seller mode');
    const click = await page.evaluate(async () => {
        // Boot ya app husafisha currentUser kutoka auth state; kwa test ya UI
        // tunahakikisha kikao kipo ili kupima ujumbe wa "hakuna safari".
        window.skh.currentUser = { uid: 'u1', email: 't@e.com', displayName: 'T' };
        const i = document.getElementById('tokenCenterInputDL');
        i.value = 'DL-TEST';
        const btn = Array.from(document.querySelectorAll('#dashWorkspace button')).find(x => /VERIFY|HAKIKI/i.test(x.textContent));
        let alerted = '';
        window.alert = m => { alerted = String(m); };
        if (btn) btn.click();
        // Subiri hadi 3s: handler ni async (inajaribu server kwanza).
        for (let k = 0; k < 30 && !alerted; k++) await new Promise(r => setTimeout(r, 100));
        return alerted;
    });
    ok(/hakuna safari|no trip/i.test(click), 'ujumbe wa kuthibitisha bila safari: ' + click);
    await page.ctx.close();
});

/* ------------------------------------------------------------------ 3 */
await step('moduli 7 za usafirishaji: daraja la ukweli, hakuna namba', async () => {
    const { page } = await openPage(false);
    const tabs = ['bookings', 'trips', 'tracking', 'drivers', 'fleet', 'finance', 'analytics'];
    for (const t of tabs) {
        const r = await clickTab(page, t);
        ok(/transport system|mfumo wa usafirishaji/i.test(r.text), t + ': daraja halipo');
        ok(!/TSh\s?\d/.test(r.text), t + ': kuna namba ya fedha isiyo na chanzo');
        ok(r.headline.length > 2, t + ': kichwa hakipo');
    }
    await page.ctx.close();
});

/* ------------------------------------------------------------------ 4 */
await step('vitufe vya action: modal zinazolingana zinafunguka', async () => {
    const cases = [
        ['openOfflineStockModal', '', 'offlineStockModal'],
        ['openProcurementModal', '', 'procurementModal'],
        ['openStockTransferModal', '', 'stockTransferModal'],
        ['openPos', '', 'businessOSForm']
    ];
    for (const [action, arg, modalId] of cases) {
        const { page, errs } = await openPage(false);
        const before = await page.evaluate(id => { const m = document.getElementById(id); return m ? getComputedStyle(m).display : 'haipo'; }, modalId);
        await page.evaluate(([a, g]) => {
            // Boot ya app husafisha kikao kutoka auth state; POS/stock hufungua
            // fomu tu kwa mtumiaji aliyeingia — kwa test tunahakikisha kikao kipo.
            window.skh.currentUser = { uid: 'u1', email: 't@e.com', displayName: 'T' };
            window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'b1', storeId: 's1', shopName: 'Duka la Test', stockMode: 'strict', businessSetupComplete: true };
            window.skh.currentMode = 'seller';
            const el = g ? document.querySelector(`[data-bos-action="${a}"][data-bos-arg="${g}"]`) : document.querySelector(`[data-bos-action="${a}"]`);
            if (el) el.click();
        }, [action, arg]);
        // Poll hadi 3s: modal huwekwa baada ya renderer kukamilisha kazi yake.
        const after = await page.evaluate(async (id) => {
            const probe = () => {
                const m = document.getElementById(id);
                if (!m) return { found: false, visible: false, h: 0 };
                const s = getComputedStyle(m);
                return { found: true, visible: s.display !== 'none' && m.offsetHeight > 60, h: m.offsetHeight };
            };
            let saw = probe();
            for (let k = 0; k < 30; k++) {
                if (saw.found && saw.visible) return { ...saw, at: k * 100 };
                await new Promise(r => setTimeout(r, 100));
                const n = probe();
                if (n.visible) saw = { ...n, at: k * 100 };
                else if (!saw.visible) saw = n;
            }
            return saw;
        }, modalId);
        await page.ctx.close();
        ok(after.found, action + ': modal #' + modalId + ' haipo kwenye DOM');
        ok(after.visible, action + ': modal haifunguki [' + JSON.stringify(after) + ' awali=' + before + '] errs=' + JSON.stringify(errs.slice(-3)));
    }
});

/* ------------------------------------------------------------------ 5 */
await step('Kituo cha Udhibiti: lango la ruhusa + sehemu 5 tofauti', async () => {
    const { page } = await openPage(false);
    await page.evaluate(() => document.querySelector('[data-bos-action="skhOpenAdminControlCenter"]').click());
    await new Promise(r => setTimeout(r, 1500));
    const gate = await page.evaluate(() => { const m = document.getElementById('skhAdminCC'); return m ? m.innerText.replace(/\s+/g, ' ') : ''; });
    ok(/ruhusa|permission/i.test(gate), 'lango la ruhusa halionyeshwi: ' + gate.slice(0, 80));
    await page.ctx.close();

    const { page: p2 } = await openPage(true);
    const seen = new Set();
    for (const arg of ['overview', 'accounts', 'verify', 'audit', 'policy']) {
        await p2.evaluate(a => { const el = document.querySelector(`[data-bos-action="skhOpenAdminControlCenter"][data-bos-arg="${a}"]`); if (el) el.click(); }, arg);
        await new Promise(r => setTimeout(r, 2000)); // mnyororo wa async: whoAmI → render
        const info = await p2.evaluate(() => {
            const m = document.getElementById('skhAdminCC');
            if (!m) return null;
            const t = m.innerText.replace(/\s+/g, ' ').trim();
            return { text: t, len: t.length };
        });
        ok(info, 'modal ya Udhibiti haipo kwa ' + arg);
        ok(!/haikutambui kama admin/i.test(info.text), arg + ': inaonyesha lango la ruhusa badala ya sehemu');
        seen.add(info.text);
    }
    await p2.ctx.close();
    ok(seen.size === 5, 'hoja 5 zinapaswa kufungua sehemu 5 tofauti, zimepatikana: ' + seen.size);
});

/* ------------------------------------------------------------------ 6 */
await step('Kamusi inafunguka', async () => {
    const { page } = await openPage(false);
    await page.evaluate(() => document.querySelector('[data-bos-action="skhOpenKamusi"]').click());
    await new Promise(r => setTimeout(r, 900));
    const r = await page.evaluate(() => {
        const m = document.getElementById('skhKamusiPage');
        if (!m) return { ok: false };
        const s = getComputedStyle(m);
        return { ok: s.display !== 'none' && m.getBoundingClientRect().height > 200, cls: m.className };
    });
    await page.ctx.close();
    ok(r.ok, 'Kamusi haifunguki');
});

/* ------------------------------------------------------------------ 7 */
await step('Rudi Soko Kuu: kubadili mode kunafanya kazi', async () => {
    const { page } = await openPage(false);
    await page.evaluate(() => document.querySelector('[data-bos-action="switchModeBuyer"]').click());
    await new Promise(r => setTimeout(r, 2000));
    const r = await page.evaluate(() => ({ mode: window.skh.currentMode, buyer: (document.getElementById('buyerView') || {}).style ? document.getElementById('buyerView').style.display : '?' }));
    await page.ctx.close();
    ok(r.mode === 'buyer', 'mode baada ya kubonyeza: ' + r.mode);
    ok(r.buyer !== 'none', 'buyerView imefichwa: ' + r.buyer);
});

/* ------------------------------------------------------------------ 8 */
await step('fallback: tab isiyojulikana haionyeshi maudhui ya awali', async () => {
    const { page } = await openPage(false);
    await clickTab(page, 'inventory');
    const before = await readWs(page);
    const r = await page.evaluate(async () => {
        window.switchDashTab('hakuna_tab_hii');
        await new Promise(x => setTimeout(x, 700));
        const ws = document.getElementById('dashWorkspace');
        return { text: ws ? ws.innerText.replace(/\s+/g, ' ') : '', html: ws ? ws.innerHTML : '' };
    });
    await page.ctx.close();
    ok(r.html !== before.html, 'maudhui ya inventory yamebaki');
    ok(/haijatengenezwa|not built/i.test(r.text), 'hali ya ukweli haionyeshwi: ' + r.text.slice(0, 90));
});

/* ------------------------------------------------------------------ 10 */
await step('mount halisi: loadAndRenderDashboard inachora shell + Token Center', async () => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e && e.message || e)));
    page.on('dialog', d => d.dismiss().catch(() => { }));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!window.skh && typeof window.loadAndRenderDashboard === 'function', null, { timeout: 30000 });
    const mounted = await page.evaluate(async () => {
        window.skh.collection = (d, n) => ({ __name: n });
        window.skh.where = (f, o, v) => ({ f, o, v });
        window.skh.limit = n => ({ n });
        window.skh.query = (c, ...rest) => ({ col: c, rest });
        window.skh.getDocs = async () => ({ empty: true, docs: [], size: 0, forEach: () => { } });
        window.skh.getDoc = async () => ({ exists: () => false, data: () => ({}) });
        window.skh.updateDoc = async () => { }; window.skh.addDoc = async () => ({ id: 'x' }); window.skh.deleteDoc = async () => { };
        window.skh.loadMarketSearchSignals = async () => [];
        window.skh.wrapCallable = () => async () => ({ data: {} });
        window.skh.currentUser = { uid: 'u1', email: 't@e.com', displayName: 'Mkulima Test' };
        window.skh.currentUserData = { shopOwnerUid: 'u1', businessId: 'b1', storeId: 's1', shopName: 'Duka la Test', stockSetup: true, businessSetupComplete: true };
        window.skh.currentMode = 'seller';
        window.dashboardCachedData = { prodSnap: { size: 0, forEach: () => { } }, ledgerSnap: { size: 0, forEach: () => { } }, poSnap: { size: 0, forEach: () => { } }, staffSnap: { size: 0, forEach: () => { } }, totalSales: 0, totalProfit: 0, totalExpenses: 0, activeDebts: 0 };
        window.skh.applyModeUI();
        await window.loadAndRenderDashboard();
        await new Promise(r => setTimeout(r, 2600));
        const w = document.getElementById('welcomeModal'); if (w) w.style.display = 'none';
        return { shell: !!document.querySelector('.bos-shell'), nav: !!document.getElementById('bosSidebar'),
                 headline: ((document.getElementById('dashWorkspace') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 40) };
    });
    ok(mounted.shell, 'shell haijachorwa na loadAndRenderDashboard');
    ok(mounted.nav, 'sidebar ya Business OS haipo kwenye mount halisi');
    ok(/Dashibodi/.test(mounted.headline), 'kichwa cha overview kwenye mount halisi: ' + mounted.headline);

    /* Token Center kupitia kitufe HALISI cha sidebar */
    const cargo = await page.evaluate(async () => {
        const el = document.querySelector('#bosSidebar [data-bos-tab="cargo"]');
        if (!el) return { clicked: false };
        el.click();
        await new Promise(r => setTimeout(r, 1500));
        const ws = document.getElementById('dashWorkspace');
        return { clicked: true, text: (ws.innerText || '').replace(/\s+/g, ' '), hasInput: !!document.getElementById('tokenCenterInputDL') };
    });
    ok(cargo.clicked, 'kipengele cha Kituo cha Tokeni hakipo kwenye sidebar halisi');
    ok(cargo.hasInput, 'Token Center haikuchorwa kwenye mount halisi');
    ok(/TOKEN CENTER/i.test(cargo.text), 'kichwa cha Token Center hakipo kwenye mount halisi');
    await ctx.close();
});

/* ------------------------------------------------------------------ 9 */
await step('hakuna JS error mpya kwenye Business OS', async () => {
    const { page, errs } = await openPage(false);
    for (const t of ['overview', 'my_products', 'inventory', 'cargo', 'bookings', 'pos_page', 'settings']) {
        await clickTab(page, t);
    }
    const relevant = errs.filter(e => /BOS|skhBOS|10-dashboard|110-|111-|112-/.test(e));
    await page.ctx.close();
    ok(relevant.length === 0, 'JS errors: ' + JSON.stringify(relevant.slice(0, 3)));
});

await b.close();
if (fails.length) {
    console.log('BUSINESS OS NAV SMOKE: ' + pass + ' passed, ' + fails.length + ' FAILED');
    fails.forEach(f => console.log('  x ' + f));
    process.exit(1);
}
console.log('BUSINESS OS NAV SMOKE: ' + pass + ' passed, 0 failed');

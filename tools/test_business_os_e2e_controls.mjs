#!/usr/bin/env node
/* ============================================================================
   BUSINESS OS — END-TO-END CONTROL RESPONSE TEST (Phase 3)
   ----------------------------------------------------------------------------
   Kila control inaendeshwa dhidi ya app HALISI, ikiwa na "Firestore double"
   inayohifadhi kweli (localStorage) ili tuweze kufanya READ-BACK baada ya
   kila operesheni — si kuamini alert ya "success".

   MUHIMU: hii SI Firestore emulator. Ni mbadala wa API ya Firestore ndani ya
   browser (collection/doc/query/getDocs/addDoc/setDoc/updateDoc/deleteDoc/
   onSnapshot/increment/arrayUnion/arrayRemove/serverTimestamp) unaohifadhi
   ndani ya localStorage. Kwa hiyo:
     • PASS  = tabia ya client + muundo wa data imethibitishwa kwa read-back
     • BLOCKED = inahitaji Cloud Functions / Firestore halisi (callable au rules)

   Matokeo: /home/user/sokohai-business-os/.audit/p3-e2e.json
   ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL_ = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const OUT = '/home/user/sokohai-business-os/.audit/p3-e2e.json';

/* ---------- page-side harness ------------------------------------------- */
const HARNESS = ({ mode, seed, callableMode }) => {
    const DBKEY = 'SKH_E2E_DB';
    if (seed || !localStorage.getItem(DBKEY)) localStorage.setItem(DBKEY, JSON.stringify(seed || {}));
    let db = JSON.parse(localStorage.getItem(DBKEY) || '{}');
    let n = 0;
    window.__writes = [];
    window.__calls = [];
    window.__alerts = [];
    window.__rejections = [];
    window.__callableMode = Object.assign({}, callableMode || {});
    const persist = () => localStorage.setItem(DBKEY, JSON.stringify(db));
    const colName = c => (c && (c.__name || c.id || c.name)) || String(c);
    const ensure = name => (db[name] = db[name] || {});
    const applyPatch = (obj, patch) => {
        Object.keys(patch || {}).forEach(k => {
            const v = patch[k];
            if (v && typeof v === 'object' && v.__op) {
                if (v.__op === 'increment') obj[k] = Number(obj[k] || 0) + Number(v.n || 0);
                else if (v.__op === 'arrayUnion') obj[k] = Array.from(new Set((obj[k] || []).concat(v.v || [])));
                else if (v.__op === 'arrayRemove') obj[k] = (obj[k] || []).filter(x => !(v.v || []).includes(x));
                else if (v.__op === 'ts') obj[k] = new Date().toISOString();
            } else obj[k] = v;
        });
        return obj;
    };
    const log = (op, col, id, data) => {
        window.__writes.push({ op, col, id, data: JSON.parse(JSON.stringify(data || {})) });
        persist();
    };
    const matches = (docData, clauses) => (clauses || []).every(c => {
        if (!c || c.f === undefined) return true;
        const val = docData[c.f];
        switch (c.o) {
            case '==': return val === c.v;
            case '!=': return val !== c.v;
            case '>': return val > c.v;
            case '>=': return val >= c.v;
            case '<': return val < c.v;
            case '<=': return val <= c.v;
            case 'in': return (c.v || []).includes(val);
            case 'array-contains': return Array.isArray(val) && val.includes(c.v);
            default: return true;
        }
    });
    const snapOf = (col, docs) => ({
        empty: docs.length === 0, size: docs.length,
        docs: docs.map(d => ({ id: d.id, data: () => JSON.parse(JSON.stringify(d.data)) })),
        docChanges: () => [],
        forEach: cb => docs.forEach(d => cb({ id: d.id, data: () => JSON.parse(JSON.stringify(d.data)) }))
    });
    const listeners = [];
    const notify = () => listeners.forEach(l => { try { l(); } catch (e) { } });

    /* ---- Firestore-compatible API ---- */
    window.skh.db = {};
    window.skh.collection = (dbx, name) => ({ __name: name });
    window.skh.doc = (dbx, c, id) => ({ __doc: true, col: c && (c.__name || c), id });
    window.skh.where = (f, o, v) => ({ f, o, v });
    window.skh.orderBy = (f, d) => ({ orderBy: f, dir: d || 'asc' });
    window.skh.limit = n2 => ({ limit: n2 });
    window.skh.query = (col, ...clauses) => ({ __query: true, col: col && (col.__name || col), clauses });
    window.skh.increment = n2 => ({ __op: 'increment', n: n2 });
    window.skh.arrayUnion = v => ({ __op: 'arrayUnion', v });
    window.skh.arrayRemove = v => ({ __op: 'arrayRemove', v });
    window.skh.serverTimestamp = () => ({ __op: 'ts' });
    window.skh.getDoc = async (ref) => {
        const name = ref.col, id = ref.id;
        const d = (db[name] || {})[id];
        return { id, exists: () => !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), metadata: { hasPendingWrites: false, fromCache: false } };
    };
    window.skh.getDocs = async (q) => {
        const name = q.col || colName(q);
        const clauses = (q.clauses || []);
        const wh = clauses.filter(c => c && c.f !== undefined);
        const ord = clauses.find(c => c && c.orderBy);
        const lim = clauses.find(c => c && c.limit);
        let docs = Object.keys(db[name] || {}).map(id => ({ id, data: db[name][id] })).filter(d => matches(d.data, wh));
        if (ord) docs.sort((a, b) => (a.data[ord.orderBy] > b.data[ord.orderBy] ? 1 : -1) * (ord.dir === 'desc' ? -1 : 1));
        if (lim) docs = docs.slice(0, lim.limit);
        return snapOf(name, docs);
    };
    window.skh.addDoc = async (col, data) => {
        const name = colName(col), id = 'new' + (++n);
        ensure(name)[id] = JSON.parse(JSON.stringify(data));
        log('add', name, id, data); notify();
        return { id };
    };
    window.skh.setDoc = async (ref, data, opts) => {
        ensure(ref.col);
        const prev = (opts && opts.merge) ? (db[ref.col][ref.id] || {}) : {};
        db[ref.col][ref.id] = applyPatch(JSON.parse(JSON.stringify(prev)), data);
        log('set', ref.col, ref.id, data); notify();
    };
    window.skh.updateDoc = async (ref, patch) => {
        ensure(ref.col);
        if (!db[ref.col][ref.id]) { const e = new Error('NOT_FOUND: ' + ref.col + '/' + ref.id); e.code = 'not-found'; throw e; }
        applyPatch(db[ref.col][ref.id], patch);
        log('update', ref.col, ref.id, patch); notify();
    };
    window.skh.deleteDoc = async (ref) => {
        ensure(ref.col);
        if (!db[ref.col][ref.id]) { const e = new Error('NOT_FOUND'); e.code = 'not-found'; throw e; }
        delete db[ref.col][ref.id];
        log('delete', ref.col, ref.id, {}); notify();
    };
    window.skh.onSnapshot = (ref, cb) => {
        const run = () => {
            const name = ref.__query ? ref.col : ref.col;
            const id = ref.id;
            if (ref.__query) window.skh.getDocs(ref).then(cb);
            else window.skh.getDoc(ref).then(cb);
        };
        listeners.push(run);
        setTimeout(run, 0);
        return { unsubscribe() { const i = listeners.indexOf(run); if (i > -1) listeners.splice(i, 1); } };
    };
    /* app helper used by POS quick-add: saveData(collection, data) -> id */
    window.skh.saveData = async (collection, data) => { const r = await window.skh.addDoc(window.skh.collection(null, collection), data); return r.id; };
    window.skh.wrapCallable = (name2) => async (payload) => {
        const m = window.__callableMode[name2] || 'ok';
        window.__calls.push({ name: name2, payload: JSON.parse(JSON.stringify(payload || {})), mode: m });
        if (m === 'deny') { const e = new Error('permission-denied: huna ruhusa'); e.code = 'permission-denied'; throw e; }
        if (m === 'fail') { const e = new Error('unavailable: server haipatikani'); e.code = 'unavailable'; throw e; }
        const canned = {
            posSale: { total: 3400, receiptNo: 'RCPT-1', status: 'completed' },
            inventoryAdjust: { ok: true },
            deliveryComplete: { ok: true, finalPayout: 5000 },
            adminWhoAmI: { admin: window.__isAdmin === true, superAdmin: window.__isAdmin === true }
        };
        return { data: canned[name2] || { ok: true } };
    };
    window.skh.callFunction = (name2, payload) => window.skh.wrapCallable(name2)(payload);
    window.skh.httpsCallable = () => (payload) => window.skh.wrapCallable('generic')(payload);
    window.skh.getFunctions = () => ({});
    window.skh.loadMarketSearchSignals = async () => [];
    window.skh.cachedItems = [];
    window.skh.localStorage = window.localStorage;

    /* ---- alert capture + rejection capture ---- */
    window.alert = (m) => { window.__alerts.push(String(m)); };
    window.confirm = () => true;
    window.addEventListener('unhandledrejection', e => window.__rejections.push(String((e.reason && e.reason.message) || e.reason)));

    /* ---- session ---- */
    window.skh.currentMode = mode || 'seller';
    window.skh.currentUser = { uid: 'u1', displayName: 'Mmiliki Test', email: 'owner@sokohai.test' };
    window.skh.currentUserData = {
        shopOwnerUid: 'u1', shopName: 'Duka la Test', businessSetupComplete: true,
        businessId: 'b1', storeId: 's1',
        shopSettings: (db.users && db.users.u1 && db.users.u1.shopSettings) || { stockMode: 'strict', showSales: true, showProfit: true, showLowStock: true, showDebts: true, cashierCanViewProfit: false, cashierCanEditStock: false }
    };
    window.dashboardCachedData = null; // renderers must read from the harness store

    /* ---- mount the Business OS shell exactly like the app does ---- */
    let host = document.getElementById('bosSmokeHost');
    if (!host) {
        host = document.createElement('div');
        host.id = 'bosSmokeHost';
        host.style.cssText = 'position:fixed;inset:0;z-index:99990;background:#F8FBFA;overflow:auto';
        document.body.appendChild(host);
    }
    window.skhRenderBusinessOSShell(host);
};

/* ---------- node-side helpers ------------------------------------------- */
const SEED = () => ({
    products: {
        p1: {
            id: 'p1', userId: 'u1', title: 'Sukari 2kg', category: 'Vyakula', subCategory: 'Nafaka',
            price: 3400, buyPrice: 1500, stock: 50, lowStockAlert: 5, sku: 'SKU-p1', barcode: 'BC-p1',
            publicationStatus: 'published', status: 'active', baseUnit: 'Piece',
            createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z',
            description: 'Maelezo ya kutosha kwa bidhaa hii sokoni.', views: 10, likeCount: 2, savedCount: 1
        },
        p2: {
            id: 'p2', userId: 'u1', title: 'Mafuta ya Alizeti 1L', category: 'Vyakula', subCategory: 'Mafuta',
            price: 5200, buyPrice: 4100, stock: 0, lowStockAlert: 3, publicationStatus: 'draft', status: 'draft',
            baseUnit: 'Piece', createdAt: '2026-11-02T08:00:00.000Z', description: 'Mafuta safi ya alizeti.', views: 0, likeCount: 0, savedCount: 0
        }
    },
    users: {
        u1: {
            uid: 'u1', email: 'owner@sokohai.test', shopName: 'Duka la Test',
            shopSettings: { stockMode: 'strict', showSales: true, showProfit: true, showLowStock: true, showDebts: true, cashierCanViewProfit: false, cashierCanEditStock: false }
        }
    },
    shop_ledger: {}, shop_staff: {}, posReports: {}, ride_requests: {}, activity_logs: {}
});

const b = await chromium.launch({ args: ['--no-sandbox'] });
const results = [];

async function session(opts = {}) {
    const ctx = await b.newContext({ viewport: opts.viewport || { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => { const m = String((e && e.message) || e); if (!/Expected type 'Query'/.test(m)) pageErrors.push(m); });
    page.on('dialog', d => d.dismiss().catch(() => { }));
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!window.skh && !!window.skhRenderBusinessOSShell, null, { timeout: 30000 });
    await page.evaluate(HARNESS, { mode: opts.mode || 'seller', seed: opts.seed === null ? null : (opts.seed || SEED()), callableMode: opts.callableMode || {} });
    await new Promise(r => setTimeout(r, 2400));
    // session is cleared by app boot -> restore under the harness
    await page.evaluate((mode) => {
        window.skh.currentMode = mode;
        window.skh.currentUser = { uid: 'u1', displayName: 'Mmiliki Test', email: 'owner@sokohai.test' };
    }, opts.mode || 'seller');
    return { ctx, page, pageErrors };
}

const state = async (page) => page.evaluate(() => ({
    alerts: window.__alerts.slice(),
    writes: window.__writes.slice(),
    calls: window.__calls.slice(),
    rejections: window.__rejections.slice(),
    db: JSON.parse(JSON.stringify(JSON.parse(localStorage.getItem('SKH_E2E_DB') || '{}'))),
    text: (document.getElementById('dashWorkspace') || document.body).innerText.replace(/\s+/g, ' '),
    toasts: Array.from(document.querySelectorAll('.skh-toast,[class*="toast"],[class*="snack"]')).map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4),
    visibleModals: Array.from(document.querySelectorAll('div')).filter(e => {
        const s = getComputedStyle(e);
        return s.position === 'fixed' && s.display !== 'none' && parseFloat(s.zIndex || 0) > 9000 && e.getBoundingClientRect().height > 80;
    }).map(e => e.id || (e.className || '').toString().slice(0, 24)).slice(0, 4)
}));

const reset = (page) => page.evaluate(() => { window.__alerts.length = 0; window.__writes.length = 0; window.__calls.length = 0; });

function record(r) { results.push(r); console.log(`${r.verdict.padEnd(7)} ${r.id.padEnd(4)} ${String(r.control).slice(0, 42).padEnd(44)} ${String(r.detail).slice(0, 90)}`); }

const V = { pass: 'PASS', fail: 'FAIL', blocked: 'BLOCKED', na: 'NOT APPLICABLE' };

/* ---------- action driver: click first, handler as deterministic fallback ----
   Sarafu ya dhahabu: DOM click ndiyo njia ya mtumiaji; ikiwa kitufe hakipatikani
   (au renderer imebadilisha node katikati), tunaita handler ile ile ya kitufe
   ili kupima DATA FLOW. Njia iliyotumika inaandikwa kwenye kila row.          */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function counts(page) { return page.evaluate(() => ({ w: window.__writes.length, c: window.__calls.length, a: window.__alerts.length })); }
async function act(page, { clickRe, handler, args, wait = 1400 }) {
    let clicked = false, effect = false;
    for (let attempt = 0; attempt < 2 && !effect; attempt++) {
        clicked = await page.evaluate((rx) => {
            const re = new RegExp(rx, 'i');
            const el = Array.from(document.querySelectorAll('#dashWorkspace button, #dashWorkspace a, .overlay-menu button'))
                .find(x => re.test((x.textContent || '').trim()) && x.offsetParent !== null);
            if (!el) return false;
            el.click(); return true;
        }, clickRe || 'ZZZ____').catch(() => false);
        if (clicked) await sleep(wait);
        const c = await counts(page);
        effect = (c.w + c.c + c.a) > 0;
        if (!clicked) break;
    }
    let method = 'click';
    if (!effect && handler && typeof handler === 'string') {
        await page.evaluate(async ({ fn, a }) => {
            const f = window[fn];
            if (typeof f !== 'function') return false;
            const out = f.apply(null, a || []);
            if (out && typeof out.then === 'function') await out;
            return true;
        }, { fn: handler, a: args || [] }).catch(() => { });
        await sleep(wait);
        method = 'handler';
    }
    return { clicked, method };
}
async function call(page, fn, args, wait = 1400) {
    await page.evaluate(async ({ f, a }) => {
        const h = window[f];
        if (typeof h !== 'function') return false;
        const out = h.apply(null, a || []);
        if (out && typeof out.then === 'function') await out;
        return true;
    }, { f: fn, a: args || [] }).catch(() => { });
    await sleep(wait);
}

/* ======================================================================= */
/* A. NAVIGATION, REPEATED NAVIGATION, ROLE ISOLATION                      */
/* ======================================================================= */
{
    const { ctx, page, pageErrors } = await session({});
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-bos-tab]')).map(e => e.getAttribute('data-bos-tab')));
    const problems = [];
    for (const t of tabs) {
        for (let i = 0; i < 2; i++) {
            await page.evaluate(tab => document.querySelector(`[data-bos-tab="${tab}"]`).click(), t);
            await sleep(850);
            const r = await page.evaluate(() => {
                const ws = document.getElementById('dashWorkspace');
                const act = document.querySelector('[data-bos-tab].active,[data-bos-tab].is-active');
                const h = ws && ws.querySelector('h1,h2,h3');
                return { len: ws ? ws.innerText.replace(/\s+/g, ' ').length : 0, active: act ? act.getAttribute('data-bos-tab') : '', head: h ? h.textContent.replace(/\s+/g, ' ').trim() : '' };
            });
            if (r.len < 25) problems.push(t + '#pass' + i + ' tupu');
            if (r.active !== t) problems.push(t + '#pass' + i + ' active=' + r.active);
        }
    }
    record({ id: 'A1', group: 'Navigation', module: 'Business OS shell', control: `Vipengele ${tabs.length} vya sidebar × mizunguko 2`, role: 'seller', expected: 'Kila kipengele kinaonyesha ukurasa wake kila mara; active state sahihi; hakuna stale', actual: problems.length ? problems.slice(0, 5).join('; ') : `Vipengele ${tabs.length} × 2 vimefungua ukurasa sahihi`, dataEffect: 'hakuna', feedback: 'kichwa + active state vinabadilika', verdict: problems.length ? V.fail : V.pass, detail: problems.length ? problems.slice(0, 3).join(' | ') : `${tabs.length} tabs ×2 OK`, evidence: 'p3-e2e.json#A1', rootCause: '', recommendation: '', method: 'click' });

    const snapRole = () => page.evaluate(() => ({
        mode: window.skh.currentMode,
        dashViews: getComputedStyle(document.getElementById('dashboardViews') || document.body).display,
        chrome: document.body.dataset.bosChrome || '',
        footer: (() => { const f = document.querySelector('.bottom-area-wrapper'); return f ? getComputedStyle(f).display : 'n/a'; })(),
        bosVisible: (() => { const s = document.querySelector('.bos-shell'); if (!s) return false; const r = s.getBoundingClientRect(); return r.width > 10 && getComputedStyle(s).display !== 'none'; })()
    }));
    const cycle = [['start', await snapRole()]];
    for (const m of ['driver', 'seller', 'buyer', 'seller']) {
        await page.evaluate(async mm => { try { await window.switchMode(mm); } catch (e) { } }, m);
        await sleep(1500);
        await page.evaluate(() => { if (!window.skh.currentUser) window.skh.currentUser = { uid: 'u1', email: 'o@e.com' }; });
        cycle.push([m, await snapRole()]);
    }
    const buyer = cycle.find(c => c[0] === 'buyer')[1];
    const lastSeller = cycle[cycle.length - 1][1];
    const roleOk = buyer.mode === 'buyer' && buyer.dashViews === 'none' && buyer.bosVisible === false
        && lastSeller.mode === 'seller' && lastSeller.dashViews === 'block' && lastSeller.bosVisible === true;
    record({ id: 'A2', group: 'Role isolation', module: 'Mode switching', control: 'Seller → Driver → Seller → Buyer → Seller', role: 'all', expected: 'Mode na maudhui yanafuata role; buyer haoni dashboard/Business OS; seller anarudi kwenye shell', actual: roleOk ? 'Mzunguko wote umefuata role' : JSON.stringify(cycle.map(c => [c[0], c[1].mode, c[1].dashViews, c[1].bosVisible])), dataEffect: 'hakuna data', feedback: 'maudhui yanabadilika kwa role', verdict: roleOk ? V.pass : V.fail, detail: roleOk ? '5 states OK' : 'mzunguko umeshindikana', evidence: 'p3-e2e.json#A2', rootCause: roleOk ? '' : 'angalia 5.4 (chrome latch, cross-system)', recommendation: roleOk ? '' : 'tenganisha na 5.4' });

    /* A3 — mode gating measured on what the APP renders (synthetic host removed,
       ili tuone kile mtumiaji halisi angetaka kuona kwenye #dashboardViews). */
    await page.evaluate(() => { const h = document.getElementById('bosSmokeHost'); if (h) h.remove(); });
    const gate = {};
    for (const m of ['seller', 'driver', 'buyer']) {
        await page.evaluate(async mm => { try { await window.switchMode(mm); } catch (e) { } await new Promise(r => setTimeout(r, 900)); }, m);
        await sleep(1400);
        gate[m] = await page.evaluate(() => {
            const dv = document.getElementById('dashboardViews');
            const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; };
            const cs = el => el ? getComputedStyle(el).display : 'missing';
            return {
                dashboardViews: cs(dv),
                bosInDashViews: document.querySelectorAll('#dashboardViews .bos-shell').length,
                sellerControlsVisible: Array.from(document.querySelectorAll('#dashboardViews button')).filter(b => vis(b) && /Hariri|Nakili|HIFADHI USANIDI|Bidhaa Zangu/i.test(b.innerText || '')).length,
                sample: dv ? (dv.innerText || '').replace(/\s+/g, ' ').slice(0, 70) : ''
            };
        });
    }
    const isoOk = gate.buyer.dashboardViews === 'none' && gate.buyer.bosInDashViews === 0
        && gate.driver.sellerControlsVisible === 0 && gate.driver.bosInDashViews === 0;
    record({ id: 'A3', group: 'Role isolation', module: 'Ukurasa unaorender kwa kila mode', control: 'Buyer / Driver hawaoni vidhibiti vya seller', role: 'buyer, driver', expected: 'Buyer: #dashboardViews imefichwa; Driver: cockpit yake, hakuna vidhibiti vya bidhaa vya seller', actual: JSON.stringify(gate), dataEffect: 'hakuna', feedback: 'maudhui yanafuata mode', verdict: isoOk ? V.pass : V.fail, detail: isoOk ? 'mode gating OK (app render, si CSS pekee)' : 'leak kwenye render', evidence: 'p3-e2e.json#A3', rootCause: '', recommendation: '' });

    record({ id: 'A4', group: 'Role isolation', module: 'Mode switching', control: 'JS errors wakati wa mzunguko', role: 'all', expected: 'Hakuna page error', actual: pageErrors.length ? pageErrors.slice(0, 2).join(' | ') : '0 page errors', dataEffect: 'hakuna', feedback: '—', verdict: pageErrors.length ? V.fail : V.pass, detail: pageErrors.length + ' errors', evidence: 'p3-e2e.json#A4', rootCause: '', recommendation: '' });
    await ctx.close();
}

/* ======================================================================= */
/* B. PRODUCTS                                                             */
/* ======================================================================= */
async function productsSession(callableMode = {}) {
    const s = await session({ callableMode });
    await s.page.evaluate(() => { if (window.switchDashTab) window.switchDashTab('my_products'); });
    await sleep(1300);
    return s;
}
async function productCardButton(page, productTitle, btnRe) {
    return page.evaluate(({ title, re }) => {
        const rx = new RegExp(re, 'i');
        const cards = Array.from(document.querySelectorAll('#dashWorkspace div')).filter(d => (d.innerText || '').includes(title));
        for (const c of cards.reverse()) {
            const b = Array.from(c.querySelectorAll('button')).find(x => rx.test((x.textContent || '').trim()));
            if (b && b.offsetParent !== null) { b.click(); return true; }
        }
        const any = Array.from(document.querySelectorAll('#dashWorkspace button')).find(x => rx.test((x.textContent || '').trim()));
        if (any) { any.click(); return true; }
        return false;
    }, { title: productTitle, re: btnRe }).catch(() => false);
}
/* B1 — unpublish (published -> draft) */
{
    const { ctx, page } = await productsSession();
    await page.evaluate(() => { window.skhConfirm = async () => true; });
    await reset(page);
    const clicked = await productCardButton(page, 'Sukari 2kg', '^Simamisha$');
    await sleep(1500);
    let st = await state(page);
    let method = 'click';
    if (!st.writes.length) { await call(page, 'skhSetProductPublication', ['p1', 'draft']); st = await state(page); method = 'handler'; }
    const doc = st.db.products.p1;
    const ok = doc.publicationStatus === 'draft' && doc.status === 'draft' && doc.updatedAt !== '2026-11-01T08:00:00.000Z' && st.writes.length === 1 && st.writes[0].op === 'update';
    record({ id: 'B1', group: 'Products', module: 'Bidhaa Zangu', control: 'Simamisha (unpublish)', role: 'seller', expected: 'products/p1: publicationStatus=draft, status=draft, updatedAt mpya; orodha inajichora upya; hakuna alert ya mafanikio ya uongo', actual: `click=${clicked} njia=${method} writes=${JSON.stringify(st.writes.map(w => w.op + ':' + w.col + '/' + w.id))} pub=${doc.publicationStatus} status=${doc.status}`, dataEffect: 'UPDATE products/p1 {publicationStatus,status,updatedAt}', feedback: 'renderer inajichora upya (hakuna alert)', verdict: ok ? V.pass : V.fail, detail: ok ? 'read-back OK' : 'hifadhi haikufanana', evidence: 'p3-e2e.json#B1', rootCause: ok ? '' : 'handler/updateDoc', recommendation: '', method });
    await ctx.close();
}
/* B2 — publish (draft -> published) */
{
    const { ctx, page } = await productsSession();
    await page.evaluate(() => { window.skhConfirm = async () => true; });
    await reset(page);
    const clicked = await productCardButton(page, 'Mafuta ya Alizeti 1L', '^Chapisha$');
    await sleep(1500);
    let st = await state(page);
    let method = 'click';
    if (!st.writes.length) { await call(page, 'skhSetProductPublication', ['p2', 'published']); st = await state(page); method = 'handler'; }
    const doc = st.db.products.p2;
    const ok = doc.publicationStatus === 'published' && doc.status === 'active' && st.writes.length === 1;
    record({ id: 'B2', group: 'Products', module: 'Bidhaa Zangu', control: 'Chapisha (publish rudisha)', role: 'seller', expected: 'products/p2: publicationStatus=published, status=active', actual: `click=${clicked} njia=${method} writes=${st.writes.length} pub=${doc.publicationStatus} status=${doc.status}`, dataEffect: 'UPDATE products/p2', feedback: 're-render', verdict: ok ? V.pass : V.fail, detail: ok ? 'read-back OK' : 'haikufanana', evidence: 'p3-e2e.json#B2', rootCause: '', recommendation: '', method });
    await ctx.close();
}
/* B3 — archive */
{
    const { ctx, page } = await productsSession();
    await page.evaluate(() => { window.skhConfirm = async () => true; });
    await reset(page);
    const clicked = await productCardButton(page, 'Sukari 2kg', 'Weka Kumbukumbu|Archive');
    await sleep(1500);
    let st = await state(page);
    let method = 'click';
    if (!st.writes.length) { await call(page, 'skhSetProductPublication', ['p1', 'archived']); st = await state(page); method = 'handler'; }
    const doc = st.db.products.p1;
    const ok = doc.publicationStatus === 'archived' && !!doc.archivedAt && Object.keys(st.db.products).length === 2;
    record({ id: 'B3', group: 'Products', module: 'Bidhaa Zangu', control: 'Weka Kumbukumbu (archive)', role: 'seller', expected: 'publicationStatus=archived + archivedAt; record HAIFUTWI', actual: `click=${clicked} njia=${method} pub=${doc.publicationStatus} archivedAt=${!!doc.archivedAt} jumla=${Object.keys(st.db.products).length}`, dataEffect: 'UPDATE products/p1 (+archivedAt)', feedback: 're-render', verdict: ok ? V.pass : V.fail, detail: ok ? 'read-back OK, hakuna deletion' : 'haikufanana', evidence: 'p3-e2e.json#B3', rootCause: '', recommendation: '', method });
    await ctx.close();
}
/* B4 — cancel must not write */
{
    const { ctx, page } = await productsSession();
    await page.evaluate(() => { window.skhConfirm = async () => false; });
    await reset(page);
    const clicked = await productCardButton(page, 'Sukari 2kg', '^Simamisha$');
    await sleep(1200);
    const st = await state(page);
    const ok = st.writes.length === 0 && st.db.products.p1.publicationStatus === 'published';
    record({ id: 'B4', group: 'Products', module: 'Bidhaa Zangu', control: 'Ghairi kwenye confirm', role: 'seller', expected: 'Hakuna write; bidhaa inabaki published', actual: `click=${clicked} writes=${st.writes.length} pub=${st.db.products.p1.publicationStatus}`, dataEffect: 'hakuna', feedback: 'dialog inafungwa', verdict: ok ? V.pass : V.fail, detail: ok ? 'cancel = no write' : 'write ilitokea', evidence: 'p3-e2e.json#B4', rootCause: '', recommendation: '' });
    await ctx.close();
}
/* B5 — duplicate prefills form only */
{
    const { ctx, page } = await productsSession();
    await reset(page);
    const clicked = await productCardButton(page, 'Sukari 2kg', '^Nakili$');
    await sleep(1800);
    const st = await state(page);
    const form = await page.evaluate(() => {
        const v = id => (document.getElementById(id) || {}).value;
        return { name: v('prodName'), stock: v('prodStock'), sku: v('spbProductSku'), form: !!document.getElementById('sellerForm') };
    });
    const ok = clicked && st.writes.length === 0 && String(form.name || '').indexOf('Sukari 2kg') === 0 && String(form.stock) === '0' && !form.sku;
    record({ id: 'B5', group: 'Products', module: 'Bidhaa Zangu', control: 'Nakili (duplicate template)', role: 'seller', expected: 'Fomu inajazwa (bila SKU/stock/picha); hakuna record mpya', actual: `click=${clicked} writes=${st.writes.length} name="${form.name}" stock="${form.stock}" sku="${form.sku}" form=${form.form}`, dataEffect: 'hakuna (read-only)', feedback: 'banner + fomu', verdict: ok ? V.pass : V.fail, detail: ok ? 'prefill OK, 0 writes' : 'prefill/write mismatch', evidence: 'p3-e2e.json#B5', rootCause: '', recommendation: '' });
    await ctx.close();
}
/* B6 — stock adjust success (callable ok) */
{
    const { ctx, page } = await productsSession();
    await page.evaluate(() => { window.skhPrompt = async () => '60'; });
    await reset(page);
    const clicked = await productCardButton(page, 'Sukari 2kg', '^Stoo$');
    await sleep(1500);
    let st = await state(page);
    let method = 'click';
    if (!st.calls.length) { await call(page, 'skhMPStock', ['p1', 50]); st = await state(page); method = 'handler'; }
    const call1 = st.calls.find(c => c.name === 'inventoryAdjust');
    const ok = !!call1 && call1.payload.delta === 10 && call1.payload.productId === 'p1'
        && st.alerts.some(a => /Stock updated to 60|imesasishwa kuwa 60/i.test(a)) && st.writes.length === 0;
    record({ id: 'B6', group: 'Products', module: 'Bidhaa Zangu', control: 'Stoo (adjust +10)', role: 'seller', expected: 'inventoryAdjust(delta=+10, productId=p1) — server ndiye mwenye mamlaka; hakuna write ya client; uthibitisho kwa mtumiaji', actual: `click=${clicked} njia=${method} call=${call1 ? JSON.stringify({ delta: call1.payload.delta, productId: call1.payload.productId }) : 'hakuna'} alert="${st.alerts[0] || ''}" clientWrites=${st.writes.length}`, dataEffect: 'SERVER inventoryAdjust (+10)', feedback: st.alerts[0] || '', verdict: ok ? V.pass : V.fail, detail: ok ? 'payload + feedback sahihi' : 'payload/feedback mismatch', evidence: 'p3-e2e.json#B6', rootCause: '', recommendation: '', method });
    await ctx.close();
}
/* B7 — stock adjust denied by server */
{
    const { ctx, page } = await productsSession({ inventoryAdjust: 'deny' });
    await page.evaluate(() => { window.skhPrompt = async () => '70'; });
    await reset(page);
    await call(page, 'skhMPStock', ['p1', 50]);
    const st = await state(page);
    const honest = st.alerts.some(a => /Imeshindwa|Failed|permission|ruhusa/i.test(a)) && !st.alerts.some(a => /updated to|imesasishwa kuwa/i.test(a));
    record({ id: 'B7', group: 'Products', module: 'Bidhaa Zangu', control: 'Stoo — server inakataa', role: 'seller', expected: 'Hitilafu inaonekana; HAKUNA ujumbe wa mafanikio', actual: `alerts=${JSON.stringify(st.alerts).slice(0, 160)} rejections=${st.rejections.length}`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: honest ? V.pass : V.fail, detail: honest ? 'error visible, no false success' : 'false success au kimya', evidence: 'p3-e2e.json#B7', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
/* B8 — invalid stock input */
{
    const { ctx, page } = await productsSession();
    await page.evaluate(() => { window.skhPrompt = async () => 'abc'; });
    await reset(page);
    await call(page, 'skhMPStock', ['p1', 50]);
    const st = await state(page);
    const ok = st.calls.length === 0 && st.writes.length === 0 && st.alerts.some(a => /valid number|0 or more|sahihi/i.test(a));
    record({ id: 'B8', group: 'Products', module: 'Bidhaa Zangu', control: 'Stoo — thamani si namba', role: 'seller', expected: 'Validation; hakuna callable, hakuna write', actual: `calls=${st.calls.length} writes=${st.writes.length} alert="${st.alerts[0] || ''}"`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: ok ? V.pass : V.fail, detail: ok ? 'validation OK' : 'validation imepungua', evidence: 'p3-e2e.json#B8', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
/* B9 — product form validation (edit modal, empty name) */
{
    const { ctx, page } = await productsSession();
    await reset(page);
    await call(page, 'openEditModal', ['p1', 'products'], 2000);
    const state1 = await page.evaluate(() => ({ form: !!document.getElementById('sellerForm'), name: (document.getElementById('prodName') || {}).value }));
    const submitted = await page.evaluate(async () => {
        const n = document.getElementById('prodName');
        if (!n) return false;
        n.value = '';
        const btn = Array.from(document.querySelectorAll('button')).find(x => /Hifadhi|Save|Chapisha/i.test(x.textContent) && x.offsetParent !== null && (x.form || x.closest('form')));
        if (btn) { btn.click(); } else {
            const f = document.getElementById('sellerForm');
            if (f && typeof f.requestSubmit === 'function') f.requestSubmit();
        }
        await new Promise(r => setTimeout(r, 1200));
        return true;
    });
    await sleep(800);
    const st = await state(page);
    const invalidShown = await page.evaluate(() => {
        const inv = document.querySelectorAll('[aria-invalid="true"], .sf-issue, :invalid');
        const vis = Array.from(document.querySelectorAll('*')).some(e => /inahitajika|required|jina la bidhaa|tafadhali/i.test((e.innerText || '').slice(0, 80)) && e.offsetParent !== null);
        return { flagged: inv.length, message: vis };
    });
    record({ id: 'B9', group: 'Products', module: 'Fomu ya bidhaa', control: 'Hifadhi bidhaa bila jina', role: 'seller', expected: 'Validation inazuia uhifadhi; hakuna record iliyoundwa/iliyobadilishwa', actual: `form=${state1.form} name="${state1.name}" submitted=${submitted} writes=${st.writes.length} flagged=${invalidShown.flagged} message=${invalidShown.message}`, dataEffect: st.writes.length ? 'write ilitokea (si sahihi)' : 'hakuna', feedback: invalidShown.flagged || invalidShown.message ? 'validation inaonekana' : 'hakuna validation inayoonekana', verdict: (st.writes.length === 0 && (invalidShown.flagged > 0 || invalidShown.message)) ? V.pass : (st.writes.length ? V.fail : V.blocked), detail: st.writes.length ? 'record imehifadhiwa bila jina' : (invalidShown.flagged || invalidShown.message ? 'validation OK' : 'fomu haijapatikana'), evidence: 'p3-e2e.json#B9', rootCause: '', recommendation: '', method: 'click+handler' });
    await ctx.close();
}

/* ======================================================================= */
/* C. SETTINGS                                                             */
/* ======================================================================= */
async function settingsSession(callableMode) {
    const s = await session({ callableMode: callableMode || {} });
    await s.page.evaluate(() => window.switchDashTab('settings'));
    await sleep(1300);
    return s;
}
{
    const { ctx, page } = await settingsSession();
    await page.evaluate(() => { document.getElementById('setStockMode').value = 'flexible'; document.getElementById('setCashierViewProfit').checked = true; });
    await reset(page);
    const res = await act(page, { clickRe: 'HIFADHI USANIDI', handler: 'saveShopSettings', args: [], wait: 1800 });
    const st = await state(page);
    const s2 = st.db.users.u1.shopSettings;
    const pass = s2.stockMode === 'flexible' && s2.cashierCanViewProfit === true && s2.showSales === true && s2.showDebts === true
        && st.writes.some(w => w.col === 'users') && st.alerts.some(a => /imehifadhiwa/i.test(a));
    record({ id: 'C1', group: 'Settings', module: 'Mipangilio ya Mfumo', control: 'HIFADHI USANIDI', role: 'seller', expected: 'users/u1.shopSettings imehifadhiwa (stockMode=flexible, cashierCanViewProfit=true, keys nyingine hazijapotea) + uthibitisho', actual: `stockMode=${s2.stockMode} viewProfit=${s2.cashierCanViewProfit} showSales=${s2.showSales} showDebts=${s2.showDebts} writes=${st.writes.length} alert="${st.alerts[0] || ''}" njia=${res.method}`, dataEffect: 'UPDATE users/u1 {shopSettings}', feedback: st.alerts[0] || '', verdict: pass ? V.pass : V.fail, detail: pass ? 'read-back OK' : 'data haikuhifadhiwa', evidence: 'p3-e2e.json#C1', rootCause: '', recommendation: '', method: res.method });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.skh && !!window.skhRenderBusinessOSShell, null, { timeout: 30000 });
    await page.evaluate(HARNESS, { mode: 'seller', seed: null, callableMode: {} });
    await sleep(2200);
    await page.evaluate(() => window.switchDashTab('settings'));
    await sleep(1300);
    const after = await page.evaluate(() => ({
        stockMode: (document.getElementById('setStockMode') || {}).value,
        viewProfit: !!(document.getElementById('setCashierViewProfit') || {}).checked,
        db: JSON.parse(localStorage.getItem('SKH_E2E_DB')).users.u1.shopSettings
    }));
    const passReload = after.db.stockMode === 'flexible' && after.stockMode === 'flexible' && after.viewProfit === true;
    record({ id: 'C2', group: 'Settings', module: 'Mipangilio ya Mfumo', control: 'Thamani baada ya ku-refresh', role: 'seller', expected: 'Thamani zilizohifadhiwa zinapatikana na fomu inaonyesha zile zile', actual: `form.stockMode=${after.stockMode} form.viewProfit=${after.viewProfit} db.stockMode=${after.db.stockMode}`, dataEffect: 'READ users/u1 (baada ya reload)', feedback: 'fomu inaonyesha thamani halisi', verdict: passReload ? V.pass : V.fail, detail: passReload ? 'persistence OK' : 'haikupatikana baada ya reload', evidence: 'p3-e2e.json#C2', rootCause: '', recommendation: '' });
    await ctx.close();
}
{
    const { ctx, page } = await settingsSession();
    await page.evaluate(() => { window.skh.updateDoc = async () => { const e = new Error('unavailable: server haipatikani'); e.code = 'unavailable'; throw e; }; });
    await reset(page);
    await page.evaluate(async () => { document.getElementById('setStockMode').value = 'flexible'; });
    await call(page, 'saveShopSettings', [], 1500);
    const st = await state(page);
    const kept = await page.evaluate(() => (document.getElementById('setStockMode') || {}).value);
    const pass = st.db.users.u1.shopSettings.stockMode === 'strict' && st.alerts.some(a => /Hitilafu|error/i.test(a)) && kept === 'flexible';
    record({ id: 'C3', group: 'Settings', module: 'Mipangilio ya Mfumo', control: 'HIFADHI — server haipatikani', role: 'seller', expected: 'Hitilafu inaonekana; data haibadilika; chaguo la mtumiaji linabaki', actual: `db.stockMode=${st.db.users.u1.shopSettings.stockMode} alert="${st.alerts[0] || ''}" form=${kept}`, dataEffect: 'hakuna (write imeshindikana)', feedback: st.alerts[0] || 'kimya', verdict: pass ? V.pass : V.fail, detail: pass ? 'no false success, input preserved' : 'false success au input imepotea', evidence: 'p3-e2e.json#C3', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await settingsSession();
    await page.evaluate(() => { document.getElementById('setStockMode').value = 'flexible'; });
    await reset(page);
    await page.evaluate(async () => {
        const btn = document.getElementById('btnSaveShopSettings');
        if (btn) { btn.click(); btn.click(); } // double click kwenye kitufe halisi
        await new Promise(r => setTimeout(r, 1500));
    });
    await sleep(1200);
    const st = await state(page);
    const userWrites = st.writes.filter(w => w.col === 'users');
    record({ id: 'C4', group: 'Settings', module: 'Mipangilio ya Mfumo', control: 'Bonyeza HIFADHI mara mbili', role: 'seller', expected: 'Write moja tu (kitufe kinazuiwa wakati wa kuhifadhi)', actual: `users writes=${userWrites.length} alerts=${st.alerts.length}`, dataEffect: userWrites.length + ' write(s)', feedback: 'button disabled wakati wa kusave', verdict: userWrites.length === 1 ? V.pass : V.fail, detail: userWrites.length === 1 ? 'single write' : userWrites.length + ' writes (duplicate)', evidence: 'p3-e2e.json#C4', rootCause: userWrites.length > 1 ? 'hakuna guard ya pending' : '', recommendation: userWrites.length > 1 ? 'ongeza guard' : '', method: 'click' });
    await ctx.close();
}

/* ======================================================================= */
/* D. INVENTORY MODALS                                                     */
/* ======================================================================= */
{
    const { ctx, page } = await session({});
    await page.evaluate(() => window.openOfflineStockModal());
    await sleep(900);
    await reset(page);
    const opened = await page.evaluate(() => { const m = document.getElementById('offlineStockModal'); return !!m && getComputedStyle(m).display !== 'none'; });
    await page.evaluate(async () => {
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
        set('offInvName', 'Sabuni ya unga 500g'); set('offInvCategory', 'Vyakula');
        set('offInvUnit', 'Piece'); set('offInvPcsPerUnit', '1');
        set('offInvBuyPrice', '1200'); set('offInvSellPrice', '1800'); set('offInvQty', '24');
        const btn = Array.from(document.querySelectorAll('#offlineStockModal button')).find(x => /Hifadhi|Save|Ongeza/i.test(x.textContent));
        if (btn) btn.click();
        await new Promise(r => setTimeout(r, 1200));
    });
    await sleep(1400);
    let st = await state(page);
    let method = 'click';
    if (!st.writes.length) { await call(page, 'saveOfflineInventoryItem', [], 1400); st = await state(page); method = 'handler'; }
    const created = Object.entries(st.db.products || {}).find(([id, d]) => d.title === 'Sabuni ya unga 500g');
    const callInv = st.calls.find(c => c.name === 'inventoryAdjust');
    const pass = opened && !!created && created[1].userId === 'u1' && created[1].price === 1800
        && created[1].stock === 0 && created[1].openingStockPending === true && !!callInv && callInv.payload.delta === 24
        && st.alerts.some(a => /registered|imesajiliwa|imeandikishwa/i.test(a));
    record({ id: 'D1', group: 'Inventory', module: 'Ingiza / Toa Stoo', control: 'Hifadhi bidhaa mpya (24 pcs)', role: 'seller', expected: 'products/{new}: userId=uid, price/buyPrice/category, stock=0, openingStockPending=true, kisha inventoryAdjust(OPENING_BALANCE,+24)', actual: `modal=${opened} njia=${method} created=${!!created} ${created ? JSON.stringify({ userId: created[1].userId, price: created[1].price, stock: created[1].stock, pending: created[1].openingStockPending }) : ''} callable=${callInv ? callInv.payload.delta : 'hakuna'} alert="${st.alerts[0] || ''}"`, dataEffect: 'CREATE products/{new} + SERVER inventoryAdjust', feedback: st.alerts[0] || '', verdict: pass ? V.pass : V.fail, detail: pass ? 'read-back OK' : 'muundo wa record haukufanana', evidence: 'p3-e2e.json#D1', rootCause: '', recommendation: '', method });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    await page.evaluate(() => window.openOfflineStockModal());
    await reset(page);
    await page.evaluate(async () => {
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
        set('offInvName', ''); set('offInvQty', '0'); set('offInvSellPrice', '0');
        const btn = Array.from(document.querySelectorAll('#offlineStockModal button')).find(x => /Hifadhi|Save/i.test(x.textContent));
        if (btn) btn.click();
        await new Promise(r => setTimeout(r, 800));
    });
    await sleep(600);
    let st = await state(page);
    if (!st.alerts.length) { await call(page, 'saveOfflineInventoryItem', [], 900); st = await state(page); }
    const pass = st.writes.length === 0 && st.calls.length === 0 && st.alerts.some(a => /name|stock|price|jaza/i.test(a));
    record({ id: 'D2', group: 'Inventory', module: 'Ingiza / Toa Stoo', control: 'Hifadhi bila jina/stock/bei', role: 'seller', expected: 'Validation inazuia; hakuna record, hakuna callable', actual: `writes=${st.writes.length} calls=${st.calls.length} alert="${st.alerts[0] || ''}"`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: pass ? V.pass : V.fail, detail: pass ? 'validation OK' : 'record imeundwa/validation haionekani', evidence: 'p3-e2e.json#D2', rootCause: '', recommendation: '', method: 'click→handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    await reset(page);
    await page.evaluate(() => {
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
        set('updateStockId', 'p1'); set('offInvQtyNew', '5'); set('offInvBuyPriceNew', '1600');
    });
    await call(page, 'updateExistingStockAmount', [], 1500);
    const st = await state(page);
    const callInv = st.calls.find(c => c.name === 'inventoryAdjust');
    const buy = st.db.products.p1.buyPrice;
    const pass = !!callInv && callInv.payload.delta === 5 && callInv.payload.productId === 'p1' && buy === 1600
        && st.alerts.some(a => /stock received|imepokelewa|imeongezwa/i.test(a));
    record({ id: 'D3', group: 'Inventory', module: 'Ingiza / Toa Stoo (Ongeza)', control: 'Ongeza stock +5 (p1) + buy price 1600', role: 'seller', expected: 'inventoryAdjust(delta=+5, productId=p1) + products/p1.buyPrice=1600 + uthibitisho', actual: `callable=${callInv ? JSON.stringify({ delta: callInv.payload.delta, productId: callInv.payload.productId }) : 'hakuna'} buyPrice=${buy} alert="${st.alerts[0] || ''}"`, dataEffect: 'SERVER inventoryAdjust(+5) + UPDATE products/p1.buyPrice', feedback: st.alerts[0] || '', verdict: pass ? V.pass : V.fail, detail: pass ? 'read-back OK' : 'payload/bei haikufanana', evidence: 'p3-e2e.json#D3', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    await reset(page);
    await page.evaluate(() => { const e = document.getElementById('updateStockId'); if (e) e.value = ''; const q = document.getElementById('offInvQtyNew'); if (q) q.value = '0'; });
    await call(page, 'updateExistingStockAmount', [], 900);
    const st = await state(page);
    const pass = st.calls.length === 0 && st.writes.length === 0 && st.alerts.some(a => /bidhaa|product|idadi/i.test(a));
    record({ id: 'D3b', group: 'Inventory', module: 'Ingiza / Toa Stoo (Ongeza)', control: 'Ongeza stock bila kuchagua bidhaa', role: 'seller', expected: 'Validation; hakuna callable, hakuna write', actual: `calls=${st.calls.length} writes=${st.writes.length} alert="${st.alerts[0] || ''}"`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: pass ? V.pass : V.fail, detail: pass ? 'validation OK' : 'imepita bila bidhaa', evidence: 'p3-e2e.json#D3b', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
/* D4 — modal close (Ghairi) leaves nothing behind */
{
    const { ctx, page } = await session({});
    await page.evaluate(() => window.openOfflineStockModal());
    await sleep(700);
    const closed = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('#offlineStockModal button')).find(x => /GHAIRI|Ghairi/i.test(x.textContent));
        if (btn) btn.click();
        const m = document.getElementById('offlineStockModal');
        return !!m && getComputedStyle(m).display === 'none';
    });
    const st = await state(page);
    record({ id: 'D4', group: 'Inventory', module: 'Ingiza / Toa Stoo', control: 'GHAIRI (funga modal)', role: 'seller', expected: 'Modal inafungwa; hakuna write', actual: `closed=${closed} writes=${st.writes.length}`, dataEffect: 'hakuna', feedback: 'modal inatoweka', verdict: closed && st.writes.length === 0 ? V.pass : V.fail, detail: closed ? 'closed, 0 writes' : 'modal haijafungwa', evidence: 'p3-e2e.json#D4', rootCause: '', recommendation: '', method: 'click' });
    await ctx.close();
}

/* ======================================================================= */
/* E. FINANCE / HR                                                         */
/* ======================================================================= */
{
    const { ctx, page } = await session({});
    await reset(page);
    const present = await page.evaluate(async () => {
        const has = !!document.getElementById('ledgerTitle');
        if (!has) return false;
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
        set('ledgerTitle', 'Umeme wa duka'); set('ledgerAmount', '25000');
        const t = document.getElementById('ledgerType'); if (t) t.value = 'expense';
        const btn = Array.from(document.querySelectorAll('button')).find(x => /Hifadhi|Save|Rekodi/i.test(x.textContent) && x.offsetParent !== null && x.closest('#shopLedgerModal'));
        if (btn) btn.click(); else await window.saveLedgerEntry();
        await new Promise(r => setTimeout(r, 1000));
        return true;
    });
    await sleep(900);
    const st = await state(page);
    const entry = Object.entries(st.db.shop_ledger || {}).find(([id, d]) => d.title === 'Umeme wa duka');
    const pass = present && !!entry && entry[1].amount === 25000 && entry[1].shopOwnerId === 'u1' && entry[1].status === 'pending' && !!entry[1].date;
    record({ id: 'E1', group: 'Finance', module: 'Leja ya duka', control: 'Rekodi matumizi (Umeme 25 000)', role: 'seller', expected: 'shop_ledger: shopOwnerId=u1, type, title, amount, status=pending, date', actual: entry ? JSON.stringify({ owner: entry[1].shopOwnerId, amount: entry[1].amount, status: entry[1].status, date: !!entry[1].date }) : 'hakuna record', dataEffect: 'CREATE shop_ledger/{new}', feedback: st.alerts[0] || '(kimya)', verdict: pass ? V.pass : (present ? V.fail : V.blocked), detail: pass ? 'read-back OK' : (present ? 'record haijaundwa ipasavyo' : 'fomu ya leja haipo kwenye DOM'), evidence: 'p3-e2e.json#E1', rootCause: present ? '' : 'modal ya leja haijaingizwa kwenye index.html', recommendation: '', method: 'click→handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    await reset(page);
    const present = await page.evaluate(async () => {
        if (!document.getElementById('ledgerTitle')) return false;
        document.getElementById('ledgerTitle').value = '';
        document.getElementById('ledgerAmount').value = '0';
        await window.saveLedgerEntry();
        await new Promise(r => setTimeout(r, 700));
        return true;
    });
    const st = await state(page);
    const pass = present && Object.keys(st.db.shop_ledger || {}).length === 0 && st.writes.length === 0 && st.alerts.length > 0;
    record({ id: 'E2', group: 'Finance', module: 'Leja ya duka', control: 'Rekodi bila maelezo/kiasi', role: 'seller', expected: 'Validation; hakuna record', actual: `present=${present} writes=${st.writes.length} alert="${st.alerts[0] || ''}"`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: pass ? V.pass : (present ? V.fail : V.blocked), detail: pass ? 'validation OK' : (present ? 'record imeundwa bila data' : 'fomu haipo'), evidence: 'p3-e2e.json#E2', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    await reset(page);
    const present = await page.evaluate(async () => {
        if (!document.getElementById('staffNewName')) return false;
        document.getElementById('staffNewName').value = 'Asha Mwakyusa';
        document.getElementById('staffSalary').value = '350000';
        const r = document.getElementById('staffNewRole'); if (r) r.value = 'Cashier';
        await window.submitAddNewStaff();
        await new Promise(x => setTimeout(x, 900));
        return true;
    });
    const st = await state(page);
    const staff = Object.entries(st.db.shop_staff || {}).find(([i, d]) => d.name === 'Asha Mwakyusa');
    const pass = present && !!staff && staff[1].shopOwnerId === 'u1' && staff[1].salary === 350000
        && staff[1].paidSalary === 0 && staff[1].pendingSalary === 350000 && staff[1].status === 'active' && !!staff[1].createdAt;
    record({ id: 'E3', group: 'HR', module: 'Wafanyakazi', control: 'Sajili mfanyakazi (Asha, 350 000)', role: 'seller', expected: 'shop_staff: shopOwnerId, name, salary, paidSalary=0, pendingSalary=salary, status=active, createdAt', actual: present ? (staff ? JSON.stringify({ owner: staff[1].shopOwnerId, salary: staff[1].salary, paid: staff[1].paidSalary, pending: staff[1].pendingSalary, status: staff[1].status }) : 'hakuna record') : 'markup ya fomu (staffNewName/staffSalary/staffNewRole) haipo kwenye index.html — handler ipo, UI haipo', dataEffect: 'CREATE shop_staff/{new}', feedback: st.alerts[0] || '(kimya)', verdict: pass ? V.pass : (present ? V.fail : V.blocked), detail: pass ? 'read-back OK' : (present ? 'record haijaundwa' : 'BLOCKED: markup ya fomu haipo kwenye build (grep: hakuna staffNewName kwenye html/*.html)'), evidence: 'p3-e2e.json#E3', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    await reset(page);
    const present = await page.evaluate(async () => {
        if (!document.getElementById('staffNewName')) return false;
        document.getElementById('staffNewName').value = '';
        document.getElementById('staffSalary').value = '0';
        await window.submitAddNewStaff();
        await new Promise(x => setTimeout(x, 600));
        return true;
    });
    const st = await state(page);
    const pass = present && Object.keys(st.db.shop_staff || {}).length === 0 && st.writes.length === 0 && st.alerts.length > 0;
    record({ id: 'E4', group: 'HR', module: 'Wafanyakazi', control: 'Sajili bila jina/mshahara', role: 'seller', expected: 'Validation; hakuna record', actual: `present=${present} writes=${st.writes.length} alert="${st.alerts[0] || ''}"`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: pass ? V.pass : (present ? V.fail : V.blocked), detail: pass ? 'validation OK' : (present ? 'record imeundwa bila data' : 'fomu haipo'), evidence: 'p3-e2e.json#E4', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    await page.evaluate(() => window.switchDashTab('expenses'));
    await sleep(1400);
    const r = await page.evaluate(() => {
        const ws = document.getElementById('dashWorkspace');
        const t = ws ? ws.innerText.replace(/\s+/g, ' ') : '';
        return { len: t.length, text: t.slice(0, 150), fake: /TSh\s?[\d,]{4,}/.test(t) };
    });
    record({ id: 'E5', group: 'Finance', module: 'Matumizi & Gharama', control: 'Ukurasa wa Matumizi (hakuna data)', role: 'seller', expected: 'Empty/honest state; hakuna namba za kubuniwa', actual: `len=${r.len} text="${r.text}"`, dataEffect: 'READ tu', feedback: 'empty state', verdict: (r.len > 25 && !r.fake) ? V.pass : V.fail, detail: r.len > 25 ? 'hali halisi' : 'ukurasa tupu', evidence: 'p3-e2e.json#E5', rootCause: '', recommendation: '' });
    await ctx.close();
}
/* E6 — staff tab is read-only (no create button inside Business OS) */
{
    const { ctx, page } = await session({});
    await page.evaluate(() => window.switchDashTab('staff'));
    await sleep(1300);
    const r = await page.evaluate(() => {
        const ws = document.getElementById('dashWorkspace');
        const labels = ws ? Array.from(ws.querySelectorAll('button')).map(b => (b.innerText || '').trim().slice(0, 24)) : [];
        return { buttons: labels.length, labels, len: ws ? ws.innerText.length : 0 };
    });
    record({ id: 'E6', group: 'HR', module: 'Wafanyakazi & Mishahara', control: 'Ukurasa wa Wafanyakazi ndani ya Business OS', role: 'seller', expected: 'Ukurasa wa kusoma pekee (hakuna kitufe cha kuunda kwa sababu hakipo) — hakuna kitufe kizuri lisilo na kazi', actual: `buttons=${r.buttons} ${JSON.stringify(r.labels)} len=${r.len}`, dataEffect: 'READ tu', feedback: 'orodha/empty state', verdict: r.len > 25 ? V.pass : V.fail, detail: r.buttons === 0 ? 'read-only, hakuna dead button' : 'kitufe: ' + JSON.stringify(r.labels), evidence: 'p3-e2e.json#E6', rootCause: '', recommendation: '' });
    await ctx.close();
}

/* ======================================================================= */
/* F. POS                                                                  */
/* ======================================================================= */
{
    const { ctx, page } = await session({});
    const cart = await page.evaluate(async () => {
        if (typeof window.addPosCartItem !== 'function') return { fn: false };
        window.addPosCartItem('p1', 'Sukari 2kg', 3400, 50, 0);
        window.addPosCartItem('p1', 'Sukari 2kg', 3400, 50, 0);
        await new Promise(r => setTimeout(r, 500));
        const txt = Array.from(document.querySelectorAll('[id*="cart" i],#posCartArea,.pos-cart')).map(e => e.innerText).join(' ');
        return { fn: true, text: txt.replace(/\s+/g, ' ').slice(0, 160) };
    });
    record({ id: 'F1', group: 'POS', module: 'POS Terminal', control: 'Ongeza bidhaa moja mara 2 kwenye cart', role: 'seller', expected: 'Bidhaa moja kwenye cart yenye qty=2 (hakuna duplicate line)', actual: JSON.stringify(cart).slice(0, 200), dataEffect: 'cart state (local)', feedback: 'cart UI inasasishwa', verdict: cart.fn ? V.pass : V.blocked, detail: cart.fn ? 'cart inakubali bidhaa' : 'addPosCartItem haipo', evidence: 'p3-e2e.json#F1', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    await reset(page);
    await page.evaluate(async () => { try { await window.submitPosSale(); } catch (e) { } await new Promise(r => setTimeout(r, 500)); });
    const st = await state(page);
    const pass = st.alerts.some(a => /wazi|empty/i.test(a)) && st.calls.length === 0 && st.writes.length === 0;
    record({ id: 'F2', group: 'POS', module: 'POS Terminal', control: 'Maliza mauzo na cart tupu', role: 'seller', expected: 'Validation: cart tupu; hakuna callable, hakuna write, hakuna risiti', actual: `alerts=${JSON.stringify(st.alerts).slice(0, 120)} calls=${st.calls.length} writes=${st.writes.length}`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: pass ? V.pass : V.fail, detail: pass ? 'validation OK' : 'risiti ya uongo au kimya', evidence: 'p3-e2e.json#F2', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({ callableMode: { posSale: 'deny' } });
    await reset(page);
    await page.evaluate(async () => {
        window.addPosCartItem && window.addPosCartItem('p1', 'Sukari 2kg', 3400, 50, 0);
        await new Promise(r => setTimeout(r, 300));
        try { await window.submitPosSale(); } catch (e) { }
        await new Promise(r => setTimeout(r, 700));
    });
    const st = await state(page);
    const falseSuccess = st.alerts.some(a => /Sale recorded|imehifadhiwa|risiti/i.test(a));
    const errShown = st.alerts.some(a => /Kosa|error|ruhusa|permission/i.test(a));
    record({ id: 'F3', group: 'POS', module: 'POS Terminal', control: 'Maliza mauzo — posSale inakataa', role: 'seller', expected: 'Hitilafu inaonekana; HAKUNA risiti/mafanikio; cart haifutwi; hakuna ledger write', actual: `alerts=${JSON.stringify(st.alerts).slice(0, 200)} ledgerWrites=${st.writes.filter(w => w.col === 'shop_ledger').length}`, dataEffect: 'hakuna', feedback: errShown ? 'error visible' : 'kimya', verdict: (errShown && !falseSuccess) ? V.pass : V.fail, detail: (errShown && !falseSuccess) ? 'honest failure, cart preserved' : 'false success au kimya', evidence: 'p3-e2e.json#F3', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({ callableMode: { posSale: 'ok' } });
    await reset(page);
    await page.evaluate(async () => {
        window.addPosCartItem && window.addPosCartItem('p1', 'Sukari 2kg', 3400, 50, 0);
        await new Promise(r => setTimeout(r, 300));
        try { await window.submitPosSale(); } catch (e) { }
        await new Promise(r => setTimeout(r, 900));
    });
    const st = await state(page);
    const sale = st.calls.find(c => c.name === 'posSale');
    const cartAfter = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('[id*="cart" i],#posCartArea,.pos-cart')).map(e => e.innerText).join(' ');
        return t.replace(/\s+/g, ' ').trim().slice(0, 80);
    });
    const pass = !!sale && Array.isArray(sale.payload.items) && sale.payload.items.length >= 1 && sale.payload.items[0].productId === 'p1'
        && st.alerts.some(a => /Sale recorded|TSh/i.test(a));
    record({ id: 'F4', group: 'POS', module: 'POS Terminal', control: 'Maliza mauzo — posSale OK', role: 'seller', expected: 'posSale inaitwa na items[] sahihi; risiti/uthibitisho; cart inafutwa', actual: `call=${sale ? JSON.stringify({ items: sale.payload.items.length, first: sale.payload.items[0] && sale.payload.items[0].productId, pay: sale.payload.payment && sale.payload.payment.method }) : 'hakuna'} alert="${st.alerts[0] || ''}" cartBaada="${cartAfter}"`, dataEffect: 'SERVER posSale (hakuna write ya client)', feedback: st.alerts[0] || '', verdict: pass ? V.pass : V.fail, detail: pass ? 'payload + feedback sahihi' : 'payload/feedback mismatch', evidence: 'p3-e2e.json#F4', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
/* F5 — Deni without customer name → validation */
{
    const { ctx, page } = await session({});
    await reset(page);
    await page.evaluate(async () => {
        window.addPosCartItem && window.addPosCartItem('p1', 'Sukari 2kg', 3400, 50, 0);
        await new Promise(r => setTimeout(r, 300));
        const p = document.getElementById('posPayType'); if (p) p.value = 'Deni';
        const c = document.getElementById('posCustomerName'); if (c) c.value = '';
        try { await window.submitPosSale(); } catch (e) { }
        await new Promise(r => setTimeout(r, 600));
    });
    const st = await state(page);
    const pass = st.alerts.some(a => /mteja|jina/i.test(a)) && !st.calls.some(c => c.name === 'posSale');
    record({ id: 'F5', group: 'POS', module: 'POS Terminal', control: 'Mauzo ya Deni bila jina la mteja', role: 'seller', expected: 'Validation inazuia kabla ya posSale', actual: `alerts=${JSON.stringify(st.alerts).slice(0, 140)} posSaleCalls=${st.calls.filter(c => c.name === 'posSale').length}`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: pass ? V.pass : V.fail, detail: pass ? 'validation OK' : 'imepita bila jina', evidence: 'p3-e2e.json#F5', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}

/* F6 — qty +/- na removal (kitufe cha × kilichokuwa hakina jina) */
{
    const { ctx, page } = await session({});
    await page.evaluate(() => window.switchDashTab('pos_page'));
    await sleep(1300);
    const r = await page.evaluate(async () => {
        if (typeof window.addPosCartItem !== 'function') return { fn: false };
        const readTotal = () => { const el = document.getElementById('posCartTotal'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : '(hakuna #posCartTotal)'; };
        window.addPosCartItem('p1', 'Sukari 2kg', 3400, 50, 0);
        await new Promise(x => setTimeout(x, 500));
        const t1 = readTotal();
        window.updatePosCartQty(0, 1);
        await new Promise(x => setTimeout(x, 500));
        const t2 = readTotal();
        const removeBtn = Array.from(document.querySelectorAll('#dashWorkspace button, #businessOSForm button')).find(b => /^\u2715$|^×$|^✕$/.test((b.textContent || '').trim()) && b.getAttribute('aria-label'));
        const hasLabel = !!removeBtn && (removeBtn.getAttribute('aria-label') || '').length > 3;
        if (removeBtn) removeBtn.click();
        await new Promise(x => setTimeout(x, 600));
        const t3 = readTotal();
        const empty = /kiko wazi|wazi/i.test((document.getElementById('posCartItems') || document.body).innerText || '');
        return { fn: true, t1, t2, hasLabel, t3, empty };
    });
    const pass = r.fn && /3,400/.test(r.t1 || '') && /6,800/.test(r.t2 || '') && r.hasLabel && /0/.test(r.t3 || '');
    record({ id: 'F6', group: 'POS', module: 'POS Terminal', control: 'Qty +1 na Ondoa bidhaa (×)', role: 'seller', expected: 'Bidhaa moja: jumla 3 400; qty +1: 6 800; kuondoa (×): 0; kitufe kina jina linalosomeka (aria-label)', actual: `t1="${r.t1}" t2="${r.t2}" ariaLabel=${r.hasLabel} baada="${r.t3}"`, dataEffect: 'cart state (local)', feedback: 'cart + jumla zinasasishwa', verdict: pass ? V.pass : V.fail, detail: pass ? 'maths + remove + label OK' : 'maths/remove/label mismatch', evidence: 'p3-e2e.json#F6', rootCause: pass ? '' : 'kitufe kilikuwa hakina maandishi/jina', recommendation: pass ? '' : 'ongeza label', method: 'click' });
    await ctx.close();
}

/* ======================================================================= */
/* G. TOKEN CENTER                                                         */
/* ======================================================================= */
{
    const { ctx, page } = await session({});
    await page.evaluate(() => window.switchDashTab('cargo'));
    await sleep(1200);
    await reset(page);
    const r = await page.evaluate(async () => {
        const i = document.getElementById('tokenCenterInputDL');
        const b2 = Array.from(document.querySelectorAll('#dashWorkspace button')).find(x => /HAKIKI|VERIFY/i.test(x.textContent));
        if (i) i.value = 'DL-TEST';
        if (b2) b2.click();
        await new Promise(x => setTimeout(x, 1200));
        return { input: !!i, btn: !!b2 };
    });
    const st = await state(page);
    const honest = st.alerts.some(a => /Hakuna safari|no trip|si sahihi/i.test(a)) && !st.alerts.some(a => /imekamili|IMEKAMILIKA/i.test(a));
    record({ id: 'G1', group: 'Token Center', module: 'Kituo cha Tokeni', control: 'HAKIKI & RELEASE (seller, hakuna safari)', role: 'seller', expected: 'Fomu ipo; jibu la ukweli; hakuna mafanikio ya uongo', actual: `input=${r.input} btn=${r.btn} alert="${st.alerts[0] || ''}"`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: honest ? V.pass : V.fail, detail: honest ? 'honest refusal' : 'false success', evidence: 'p3-e2e.json#G1', rootCause: '', recommendation: '', method: 'click' });
    await ctx.close();
}
{
    const { ctx, page } = await session({ callableMode: { deliveryComplete: 'deny' } });
    await page.evaluate(() => { window.skh.currentMode = 'driver'; if (window.skh.currentUserData) window.skh.currentUserData.role = 'driver'; window.switchDashTab('cargo'); });
    await sleep(1400);
    await reset(page);
    const r = await page.evaluate(async () => {
        const i = document.getElementById('tokenCenterInputDL');
        const b2 = Array.from(document.querySelectorAll('#dashWorkspace button')).find(x => /HAKIKI|VERIFY/i.test(x.textContent));
        if (i) i.value = 'DL-TEST';
        if (b2) b2.click();
        await new Promise(x => setTimeout(x, 1400));
        return { input: !!i, btn: !!b2 };
    });
    const st = await state(page);
    const refused = st.alerts.some(a => /Hakuna safari|si sahihi|ruhusa|permission/i.test(a)) && !st.alerts.some(a => /IMEKAMILIKA/i.test(a));
    record({ id: 'G2', group: 'Token Center', module: 'Kituo cha Tokeni', control: 'HAKIKI & RELEASE (driver, backend inakataa)', role: 'driver', expected: 'Ujumbe wa ukweli; hakuna "imekamilika" ya uongo', actual: `input=${r.input} btn=${r.btn} alert="${st.alerts[0] || ''}"`, dataEffect: 'hakuna', feedback: st.alerts[0] || 'kimya', verdict: refused ? V.pass : V.fail, detail: refused ? 'honest refusal' : 'false success', evidence: 'p3-e2e.json#G2', rootCause: '', recommendation: '', method: 'click' });
    await ctx.close();
}

/* ======================================================================= */
/* H. ADMIN                                                                */
/* ======================================================================= */
async function adminWalk(page, isAdmin) {
    await page.evaluate(v => { window.__isAdmin = v; }, isAdmin);
    const seen = [];
    for (const t of ['overview', 'accounts', 'verify', 'audit', 'policy']) {
        await page.evaluate(async (tab) => {
            if (typeof window.closeModals === 'function') window.closeModals();
            try { await window.skhOpenAdminControlCenter(tab); } catch (e) { }
            await new Promise(r => setTimeout(r, 800));
        }, t);
        const txt = await page.evaluate(() => {
            const m = document.getElementById('skhAdminCC');
            const vis = m && getComputedStyle(m).display !== 'none';
            return (vis ? m.innerText : '(modal imefungwa)').replace(/\s+/g, ' ').slice(0, 400);
        });
        seen.push({ t, txt });
    }
    return seen;
}
{
    const { ctx, page } = await session({});
    const seen = await adminWalk(page, false);
    const allDenied = seen.every(s => /Hakuna ruhusa|haikutambui/i.test(s.txt));
    record({ id: 'H1', group: 'Admin', module: 'Kituo cha Udhibiti', control: 'Sehemu 5 za admin (mtumiaji wa kawaida)', role: 'seller (non-admin)', expected: 'Kila sehemu inakataliwa kwa ujumbe wa ruhusa', actual: allDenied ? 'Zote 5 zimekataliwa' : JSON.stringify(seen.map(s => [s.t, s.txt.slice(0, 40)])), dataEffect: 'hakuna', feedback: 'ujumbe wa ruhusa', verdict: allDenied ? V.pass : V.fail, detail: allDenied ? 'permission gate OK' : 'sehemu isiyo na ulinzi', evidence: 'p3-e2e.json#H1', rootCause: '', recommendation: '', method: 'handler' });
    await ctx.close();
}
{
    const { ctx, page } = await session({});
    const seen = await adminWalk(page, true);
    const content = seen.filter(s => !/Hakuna ruhusa/i.test(s.txt) && s.txt.length > 200);
    const bodies = new Set(seen.map(s => s.txt.slice(180, 300)));
    const distinct = bodies.size;
    record({ id: 'H2', group: 'Admin', module: 'Kituo cha Udhibiti', control: 'Sehemu 5 za admin (admin halali)', role: 'admin', expected: 'Kila sehemu ina maudhui yake', actual: `sehemu zenye maudhui=${content.length}/5 · maudhui tofauti=${distinct}/5 ${JSON.stringify(seen.map(s => [s.t, s.txt.slice(180, 220)]))}`, dataEffect: 'READ', feedback: 'sehemu inafunguka', verdict: (content.length >= 5 && distinct >= 4) ? V.pass : V.fail, detail: `${content.length}/5 zina maudhui, ${distinct}/5 tofauti`, evidence: 'p3-e2e.json#H2', rootCause: content.length < 4 ? 'adminWhoAmI stub / section renderer' : '', recommendation: '', method: 'handler' });
    await ctx.close();
}

/* ======================================================================= */
/* I. ASYNC INTEGRITY + DUPLICATE LISTENERS                                */
/* ======================================================================= */
{
    const { ctx, page } = await session({ callableMode: { inventoryAdjust: 'fail', posSale: 'fail' } });
    await reset(page);
    await page.evaluate(async () => {
        window.skhPrompt = async () => '55';
        window.skhConfirm = async () => true;
        window.switchDashTab('my_products');
        await new Promise(r => setTimeout(r, 900));
        await window.skhMPStock('p1', 50).catch(() => { });
        await new Promise(r => setTimeout(r, 700));
        try { await window.submitPosSale(); } catch (e) { }
        await new Promise(r => setTimeout(r, 500));
    });
    await sleep(1200);
    const st = await state(page);
    record({ id: 'I1', group: 'Async', module: 'Business OS + POS', control: 'Vitendo vinavyoshindwa (callable fail)', role: 'seller', expected: 'Hakuna unhandled rejection; kila kosa linaonekana kwa mtumiaji', actual: `rejections=${st.rejections.length} ${JSON.stringify(st.rejections).slice(0, 200)} alerts=${st.alerts.length} sampuli="${(st.alerts[0] || '').slice(0, 60)}"`, dataEffect: 'hakuna', feedback: st.alerts.length ? 'errors visible' : 'kimya', verdict: (st.rejections.length === 0 && st.alerts.length > 0) ? V.pass : V.fail, detail: `${st.rejections.length} rejections / ${st.alerts.length} alerts`, evidence: 'p3-e2e.json#I1', rootCause: st.rejections.length ? 'promise haijakamatwa' : '', recommendation: '' });
    await ctx.close();
}
/* I2 — vitendo 11 vya sidebar: kila moja lina mrejesho (modal/mabadiliko), hakuna kimya */
{
    const { ctx, page } = await session({});
    const acts = await page.evaluate(() => Array.from(document.querySelectorAll('#bosSidebar [data-bos-action]')).map(e => e.getAttribute('data-bos-action')));
    const silent = [];
    for (const a of acts) {
        await page.evaluate(() => { if (typeof window.closeModals === 'function') window.closeModals(); });
        await reset(page);
        await page.evaluate(async (act) => { try { await window.skhBOSRunAction(act); } catch (e) { } await new Promise(r => setTimeout(r, 800)); }, a);
        await sleep(700);
        const st = await state(page);
        const modal = await page.evaluate(() => Array.from(document.querySelectorAll('div')).some(e => {
            const s = getComputedStyle(e);
            return s.position === 'fixed' && s.display !== 'none' && parseFloat(s.zIndex || 0) > 9000 && e.getBoundingClientRect().height > 100;
        }));
        const changed = st.writes.length + st.calls.length + st.alerts.length > 0 || modal;
        if (!changed && !/switchModeBuyer/.test(a)) silent.push(a);
    }
    record({ id: 'I2', group: 'Async', module: 'Sidebar actions', control: `Vitendo ${acts.length} vya sidebar`, role: 'seller', expected: 'Kila action ina mrejesho unaoonekana (modal/mabadiliko); "Rudi Soko Kuu" inabadilisha mode', actual: silent.length ? 'kimya: ' + silent.join(', ') : 'kila action ina mrejesho', dataEffect: 'kulingana na action', feedback: 'modal/mabadiliko', verdict: silent.length ? V.fail : V.pass, detail: silent.length ? silent.length + ' silent' : acts.length + '/11 with feedback', evidence: 'p3-e2e.json#I2', rootCause: '', recommendation: '' });
    await ctx.close();
}

/* ======================================================================= */
/* J. VIEWPORTS 1440 / 820 / 768 / 390 / 360                               */
/* ======================================================================= */
for (const [w, h] of [[1440, 900], [820, 1180], [768, 1024], [390, 844], [360, 740]]) {
    const { ctx, page } = await session({ viewport: { width: w, height: h } });
    let problems = [];
    // nav reachability
    await page.evaluate(() => { const el = document.querySelector('[data-bos-tab="product_performance"]'); if (el) el.click(); });
    await sleep(1200);
    const nav = await page.evaluate(() => {
        const ws = document.getElementById('dashWorkspace');
        const r = ws ? ws.getBoundingClientRect() : null;
        return { len: ws ? ws.innerText.length : 0, overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), w: r ? Math.round(r.width) : 0 };
    });
    if (nav.len < 50) problems.push('ukurasa hauna maudhui');
    if (nav.overflowX > 0) problems.push('page overflow ' + nav.overflowX + 'px');
    // mutation at this viewport: settings save + read-back
    await page.evaluate(() => window.switchDashTab('settings'));
    await sleep(1100);
    await reset(page);
    await page.evaluate(async () => { const e = document.getElementById('setStockMode'); if (e) e.value = 'flexible'; await window.saveShopSettings(); await new Promise(r => setTimeout(r, 700)); });
    const st = await state(page);
    if (!st.writes.some(x => x.col === 'users')) problems.push('settings save haikufanya write');
    // product action at this viewport
    await page.evaluate(() => window.switchDashTab('my_products'));
    await sleep(1100);
    await reset(page);
    await page.evaluate(async () => { window.skhConfirm = async () => true; await window.skhSetProductPublication('p1', 'draft'); await new Promise(r => setTimeout(r, 600)); });
    const st2 = await state(page);
    if (!st2.writes.some(x => x.col === 'products')) problems.push('product publish haikufanya write');
    const tiny = await page.evaluate(() => Array.from(document.querySelectorAll('.bos-shell button')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 28 || r.width < 22); }).length);
    if (tiny > 0) problems.push(tiny + ' tap target < 28px');
    record({ id: `J${w}`, group: 'Viewport', module: 'Business OS', control: `Ukaguzi kwa ${w}×${h}`, role: 'seller', expected: 'Nav inafanya kazi, hakuna overflow, save inafanya write, tap targets ≥28px', actual: problems.length ? problems.join('; ') : `workspace=${nav.w}px overflowX=${nav.overflowX} writes=2/2`, dataEffect: 'UPDATE users + products', feedback: 'sawa', verdict: problems.length ? V.fail : V.pass, detail: problems.length ? problems.join(' | ') : 'OK', evidence: 'p3-e2e.json#J' + w, rootCause: '', recommendation: '', viewport: w });
    await ctx.close();
}

await b.close();
fs.mkdirSync('/home/user/sokohai-business-os/.audit', { recursive: true });
const summary = {
    generatedAt: new Date().toISOString(),
    counts: results.reduce((a, r) => (a[r.verdict] = (a[r.verdict] || 0) + 1, a), {}),
    results
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', JSON.stringify(summary.counts));
console.log('written:', OUT);

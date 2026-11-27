/* ============================================================================
 * tools/e2e-emulator/test_delivery_e2e.cjs
 * ----------------------------------------------------------------------------
 * [PART 5B-1 2026-11-25] DELIVERY WORKFLOW — BROWSER E2E (real Chromium against
 * the Firebase EMULATORS: Firestore + Auth + **Functions**).
 *
 * KILICHO HAKIKISHWA HAPA (browser halisi, sio jsdom / sio pure functions):
 *   pages load the REAL app (index.html + js/app/*.js modules) over http on
 *   localhost, signed in with real Auth-emulator accounts; server calls go to
 *   the REAL callables running in the Functions emulator (same functions/index.js
 *   as production, including functions/routing-core.js + routing-logic.js).
 *
 * Scenarios (the 10 required for PART 5B-1 + 01b for PART 5B-3) — see `step()` names:
 *   1  customer creates a delivery request from an order      (client → server)
 *   2  server routing creates the ride + delivery offers
 *   3  intended provider receives the offer (Request Inbox DOM)
 *   4  provider accepts (real click on the inbox Accept button)
 *   5  a second provider cannot take the same assignment
 *   6  seller handover + transporter pickup verified (pickup token)
 *   7  transit begins
 *   8  delivery completion verified
 *   9  order + ride states are consistent; no money docs touched
 *  10  failed / expired / cancelled workflows
 *
 * SAFETY: only ever runs against `demo-*` projects reached on 127.0.0.1 /
 * localhost. Exits 2 with BLOCKED when the emulators are not configured, so it
 * can never fall through to production Firebase. It is deliberately NOT part of
 * `npm test` (it needs Playwright + a running emulator suite). Run it with
 * tools/e2e-emulator/run_delivery_e2e.sh.
 * ==========================================================================*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PROJECT = process.env.SKH_E2E_PROJECT || 'demo-sokohai';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
const FN_HOST = process.env.SKH_FUNCTIONS_EMULATOR || '127.0.0.1:5001';
const REGION = process.env.SKH_FUNCTIONS_REGION || 'europe-west1';
const APP_PORT = Number(process.env.SKH_E2E_PORT || 5056);
/* Njia mbili za backend (zote ni functions ZILE ZILE za functions/index.js):
 *  A) functions emulator  → tumia SKH_FUNCTIONS_EMULATOR (default) + static server yetu
 *  B) functions/local-server.js (repo harness) → SKH_FUNCTIONS_URL=http://127.0.0.1:5055/__fn,
 *     SKH_APP_ORIGIN=http://127.0.0.1:5055 (server hiyo hiyo inaserve app).
 * 127.0.0.1 (sio `localhost`) kwa sababu ::1 haifanyi kazi kwenye sandbox zetu. */
const FN_URL = process.env.SKH_FUNCTIONS_URL || '';
const APP_ORIGIN = process.env.SKH_APP_ORIGIN || ('http://127.0.0.1:' + APP_PORT);

/* ------------------------------------------------------------------ guards */
if (!FS_HOST || !AUTH_HOST) {
    console.error('BLOCKED: FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST zinahitajika.\n' +
        '         Endesha: bash tools/e2e-emulator/run_delivery_e2e.sh');
    process.exit(2);
}
if (!/^demo-[a-z0-9-]+$/.test(PROJECT)) {
    console.error('BLOCKED: project "' + PROJECT + '" si demo-* — jaribio hili ni la emulator pekee.');
    process.exit(2);
}

process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT;

const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const auth = admin.auth();

const { chromium } = (function () {
    try { return require('playwright'); }
    catch (e) { return require(path.join(ROOT, 'node_modules', 'playwright')); }
})();

/* --------------------------------------------------------------- reporting */
/* Kumbukumbu ya maendeleo huandikwa PAPO HAPA kwenye faili: stdout ya jaribio
   la muda mrefu inaweza kufungwa kwa SIGTERM (timeout) na buffer kupotea. */
const LOG_PATH = path.join(__dirname, 'out', 'delivery-e2e.log');
try { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }); fs.writeFileSync(LOG_PATH, ''); } catch (e) {}
function log() {
    const line = Array.prototype.slice.call(arguments).join(' ');
    try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch (e) {}
    try { console.log(line); } catch (e) {}
}
const PART = process.env.SKH_E2E_PART || 'all';
const want = n => PART === 'all' || PART === n;
const STATE_PATH = path.join(__dirname, 'out', 'e2e-state.json');
function saveState(o) { try { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify(o, null, 2)); } catch (e) {} }
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (e) { return {}; } }
const results = [];
let failed = 0;
async function step(name, fn) {
    const t0 = Date.now();
    try {
        const note = await fn();
        results.push({ name, ok: true, note: note || '' });
        log('PASS', name, note ? '— ' + note : '', '(' + (Date.now() - t0) + 'ms)');
        return true;
    } catch (e) {
        failed++;
        results.push({ name, ok: false, note: e && e.message });
        log('FAIL', name, '—', String((e && e.message) || e).slice(0, 500));
        return false;
    }
}
function assert(c, m) { if (!c) throw new Error(m); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function until(fn, label, timeout) {
    const end = Date.now() + (timeout || 15000);
    let last = null;
    while (Date.now() < end) {
        try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
        await sleep(250);
    }
    throw new Error('timeout: ' + label + (last ? ' (' + last.message + ')' : ''));
}

/* ----------------------------------------------------------- static server */
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json'
};
function startStatic() {
    const server = http.createServer((req, res) => {
        let rel = decodeURIComponent(String(req.url || '/').split('?')[0]);
        if (rel === '/' || rel === '') rel = '/index.html';
        const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return;
        }
        res.writeHead(200, {
            'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'cache-control': 'no-store'
        });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(APP_PORT, '127.0.0.1', () => resolve(server));
    });
}

/* ------------------------------------------------------------------- seed */
const PW = 'Test123456!';
const people = {
    customer: { email: 'mteja.e2e@sokohai.test', name: 'Mteja E2E' },
    seller: { email: 'muuzaji.e2e@sokohai.test', name: 'Muuzaji E2E' },
    driverA: { email: 'dereva.a@sokohai.test', name: 'Dereva Lori 10t' },
    driverB: { email: 'dereva.b@sokohai.test', name: 'Dereva Lori 3t' },
    driverSusp: { email: 'dereva.susp@sokohai.test', name: 'Dereva Aliyesimamishwa' },
    driverBajaji: { email: 'dereva.bajaji@sokohai.test', name: 'Dereva Bajaji 500kg' },
    agent: { email: 'wakala.e2e@sokohai.test', name: 'Wakala E2E' }
};

async function ensureUser(p) {
    try {
        const u = await auth.getUserByEmail(p.email);
        await auth.updateUser(u.uid, { password: PW });
        p.uid = u.uid;
    } catch (e) {
        const u = await auth.createUser({ email: p.email, password: PW, displayName: p.name, emailVerified: true });
        p.uid = u.uid;
    }
    return p.uid;
}

const ROUTE = { pickup: 'Dar es Salaam', dest: 'Dodoma', park: 'Morogoro' };

/* Seed ni idempotent: hati iliyopo HAIANDIKWI upya, ili sehemu za baadaye za
   jaribio (custody/failures) zisiangushe hali ya ride/oda iliyokwisha tengenezwa. */
async function put(docPath, data) {
    const ref = db.doc(docPath);
    const snap0 = await ref.get();
    if (snap0.exists) return false;
    await ref.set(data);
    return true;
}

async function seed() {
    for (const k of Object.keys(people)) await ensureUser(people[k]);

    const userDoc = (p, extra) => Object.assign({
        uid: p.uid, email: p.email, displayName: p.name, name: p.name,
        phone: '+25570000' + String(Math.floor(Math.random() * 9000) + 1000),
        accountStatus: 'active', profileComplete: true,
        createdAt: new Date().toISOString()
    }, extra || {});

    await put('users/' + people.customer.uid, userDoc(people.customer, { role: 'buyer', accountType: 'buyer' }));
    await put('users/' + people.seller.uid, userDoc(people.seller, { role: 'seller', accountType: 'seller', storeName: 'Duka la E2E' }));
    await put('users/' + people.driverA.uid, userDoc(people.driverA, { role: 'driver', accountType: 'driver' }));
    await put('users/' + people.driverB.uid, userDoc(people.driverB, { role: 'driver', accountType: 'driver' }));
    await put('users/' + people.driverSusp.uid, userDoc(people.driverSusp, { role: 'driver', suspended: true, accountStatus: 'suspended' }));
    await put('users/' + people.driverBajaji.uid, userDoc(people.driverBajaji, { role: 'driver', accountType: 'driver' }));
    await put('users/' + people.agent.uid, userDoc(people.agent, { role: 'agent', agentStatus: 'approved', location: ROUTE.pickup }));

    const driverDoc = (p, extra) => Object.assign({
        userId: p.uid, name: p.name, online: true, status: 'available',
        pickupRegion: ROUTE.pickup, destinationRegion: ROUTE.dest,
        fullRoute: ROUTE.pickup + ' → ' + ROUTE.park + ' → ' + ROUTE.dest,
        rating: 4.5, completedTrips: 20,
        createdAt: new Date().toISOString()
    }, extra || {});

    await put('drivers/dr_e2e_a', driverDoc(people.driverA, {
        vehicleType: 'Lori', maxWeight: '10 tani', supportedServices: ['cargo'], rating: 4.9
    }));
    await put('drivers/dr_e2e_b', driverDoc(people.driverB, {
        vehicleType: 'Lori', maxWeight: '3 tani', supportedServices: ['cargo'], rating: 4.2
    }));
    await put('drivers/dr_e2e_susp', driverDoc(people.driverSusp, {
        vehicleType: 'Lori', maxWeight: '10 tani', supportedServices: ['cargo'], rating: 5.0
    }));
    await put('drivers/dr_e2e_bajaji', driverDoc(people.driverBajaji, {
        vehicleType: 'Bajaji', maxWeight: '500 kg', supportedServices: ['cargo'], rating: 4.8
    }));
    await put('agents/ag_e2e', {
        userId: people.agent.uid, name: people.agent.name, status: 'approved',
        location: ROUTE.pickup, region: ROUTE.pickup, online: true, rating: 4.0
    });

    /* Oda 1 — mzigo mzito (8,000 kg) wa Lori: dereva 3t/mtoto/bajaji hawastahili. */
    await put('orders/o_e2e_heavy', {
        buyerId: people.customer.uid, buyerName: people.customer.name,
        sellerId: people.seller.uid, sellerName: people.seller.name,
        sellerLocation: ROUTE.pickup,
        itemTitle: 'Saruji mifuko 160', productOrder: true, commerceType: 'product',
        amount: 1600000, currency: 'TZS', status: 'held', paymentStatus: 'held',
        createdAt: new Date().toISOString(),
        delivery: {
            required: true, pickupLocation: ROUTE.pickup, destination: ROUTE.dest,
            vehicleType: 'Lori', fare: 250000, packageWeightKg: 8000,
            packageDescription: 'Saruji kilo 8,000', customerPhone: '+255700000111'
        }
    });

    /* Oda 5 — [PART 5B-3] oda yenye usafiri LAKINI anwani ya kufikishiwa ni
       nafasi tupu: server LAZIMA ikatae (hakuna ride, hakuna ofa). */
    await put('orders/o_e2e_nodest', {
        buyerId: people.customer.uid, buyerName: people.customer.name,
        sellerId: people.seller.uid, sellerName: people.seller.name,
        sellerLocation: ROUTE.pickup,
        itemTitle: 'Mifuko 20 ya saruji', productOrder: true, commerceType: 'product',
        amount: 400000, currency: 'TZS', status: 'held', paymentStatus: 'held',
        createdAt: new Date().toISOString(),
        delivery: {
            required: true, pickupLocation: ROUTE.pickup, destination: '   ',
            vehicleType: 'Lori', fare: 90000, packageWeightKg: 1200,
            packageDescription: 'Mifuko 20 ya saruji', customerPhone: '+255700000111'
        }
    });

    /* Oda 2 — mzigo mwepesi (1,500 kg): dereva A na B wote wanastahili (mbio za ofa). */
    await put('orders/o_e2e_race', {
        buyerId: people.customer.uid, buyerName: people.customer.name,
        sellerId: people.seller.uid, sellerName: people.seller.name,
        sellerLocation: ROUTE.pickup,
        itemTitle: 'Matairi 4', productOrder: true, commerceType: 'product',
        amount: 800000, currency: 'TZS', status: 'held', paymentStatus: 'held',
        createdAt: new Date().toISOString(),
        delivery: {
            required: true, pickupLocation: ROUTE.pickup, destination: ROUTE.dest,
            vehicleType: 'Lori', fare: 120000, packageWeightKg: 1500,
            packageDescription: 'Matairi 4', customerPhone: '+255700000111'
        }
    });

    /* Oda 4 — hali iliyoripotiwa (T-03): kilo 8,000 kwa Lori, dereva aliyesimamishwa
       na Bajaji ya kilo 500 wapo mtandaoni lakini HAWAPASWI kupata ofa. */
    await put('orders/o_e2e_susp_only', {
        buyerId: people.customer.uid, buyerName: people.customer.name,
        sellerId: people.seller.uid, sellerName: people.seller.name,
        sellerLocation: ROUTE.pickup,
        itemTitle: 'Mzigo mzito wa saruji', productOrder: true, commerceType: 'product',
        amount: 500000, currency: 'TZS', status: 'held', paymentStatus: 'held',
        createdAt: new Date().toISOString(),
        delivery: {
            required: true, pickupLocation: ROUTE.pickup, destination: ROUTE.dest,
            vehicleType: 'Lori', fare: 200000, packageWeightKg: 8000,
            packageDescription: 'Saruji kilo 8,000', customerPhone: '+255700000111'
        }
    });

    /* Oda 3 — itaghairishwa (cancelled workflow). */
    await put('orders/o_e2e_cancel', {
        buyerId: people.customer.uid, buyerName: people.customer.name,
        sellerId: people.seller.uid, sellerName: people.seller.name,
        sellerLocation: ROUTE.pickup,
        itemTitle: 'Mifuko ya plastiki', productOrder: true, commerceType: 'product',
        amount: 300000, currency: 'TZS', status: 'held', paymentStatus: 'held',
        createdAt: new Date().toISOString(),
        delivery: {
            required: true, pickupLocation: ROUTE.pickup, destination: ROUTE.dest,
            vehicleType: 'Lori', fare: 90000, packageWeightKg: 900,
            packageDescription: 'Mifuko 300', customerPhone: '+255700000111'
        }
    });
}

/* ------------------------------------------------------------------ browser */
/* Kumbukumbu: sandbox yetu ina RAM ndogo, kwa hiyo tunatumia KIVINJARI KIMOJA
   na kubadilisha mtumiaji (sign-in halisi wa Auth emulator) kwa kila hatua —
   tabia ile ile ya mtumiaji halisi, bila contexts nyingi zinazokula RAM. */
let browser = null;
let CTX = null;
let PAGE = null;
const PAGE_ERRORS = [];   // { who, text }
let CURRENT = null;

async function boot() {
    /* RAM ndogo kwenye sandbox: picha zimezimwa (vipimo vyetu ni DOM/state) na
       heap ya renderer imefungwa. */
    browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
            '--js-flags=--max-old-space-size=256', '--blink-settings=imagesEnabled=false']
    });
    CTX = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'sw-TZ' });
    await loadApp('boot');
}

/* Ukurasa MMOJA unaotumika kwa wote (RAM/CPU ndogo kwenye sandbox); kila
   mtumiaji anaingia kwa sign-in halisi ya Auth emulator. */
async function loadApp(who) {
    PAGE = await CTX.newPage();
    PAGE.setDefaultTimeout(25000);
    PAGE.on('pageerror', e => PAGE_ERRORS.push({ who: who, text: 'PAGEERROR ' + e.message }));
    PAGE.on('console', m => {
        if (m.type() === 'error') PAGE_ERRORS.push({ who: who, text: 'CONSOLE ' + m.text().slice(0, 240) });
    });
    await PAGE.addInitScript(function (cfg) {
        window.SKH_LOCAL_FUNCTIONS_SERVER = true;
        window.SKH_EMULATOR = cfg.emulator;
        window.SKH_FUNCTIONS_URL = cfg.fnUrl;
    }, {
        emulator: {
            projectId: PROJECT,
            authUrl: 'http://127.0.0.1:' + String(AUTH_HOST).split(':').pop(),
            firestore: { host: String(FS_HOST).split(':')[0], port: Number(String(FS_HOST).split(':').pop()) }
        },
        fnUrl: FN_URL || ('http://' + FN_HOST + '/' + PROJECT + '/' + REGION)
    });
    await PAGE.goto(APP_ORIGIN + '/', { waitUntil: 'commit', timeout: 45000 });
    await PAGE.waitForFunction(() => window.skh && window.skh.auth && window.skh.emulator, null, { timeout: 45000 });
    await sleep(600);
}

async function useAs(key) {
    const p = people[key];
    CURRENT = key;
    const t0 = Date.now();
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await withRetry(() => PAGE.evaluate(async ([email, pw]) => {
                await window.skh.signInWithEmailAndPassword(window.skh.auth, email, pw);
            }, [p.email, PW]));
            await PAGE.waitForFunction(uid => !!(window.skh.currentUser && window.skh.currentUser.uid === uid), p.uid, { timeout: 40000 });
            await sleep(400);
            log('     · session → ' + key + ' (' + (Date.now() - t0) + 'ms)');
            return PAGE;
        } catch (e) {
            if (attempt === 1) throw e;
            log('     ! session ' + key + ' stalled — app inapakiwa upya');
            try { await PAGE.close(); } catch (x) {}
            await loadApp(key);
        }
    }
}

/* page helpers ------------------------------------------------------------- */
async function withRetry(fn, tries) {
    tries = tries || 3;
    let last = null;
    for (let i = 0; i < tries; i++) {
        try { return await fn(); } catch (e) {
            last = e;
            const msg = String((e && e.message) || e);
            if (!/offline|unavailable|deadline|network|ECONN|socket/i.test(msg)) throw e;
            await sleep(1200);
        }
    }
    throw last;
}

const callFn = (name, data) => PAGE.evaluate(async ([n, d]) => {
    try {
        const fn = window[n];
        if (typeof fn !== 'function') return { ok: false, error: 'missing:' + n };
        const r = await fn(d);
        return { ok: true, data: (r && r.data) || r };
    } catch (e) {
        return { ok: false, code: String((e && e.code) || ''), message: String((e && e.message) || e) };
    }
}, [name, data]);

const snap = async id => { const s = await db.doc(id).get(); return s.exists ? s.data() : null; };
const orderOf = id => snap('orders/' + id);
const rideOf = id => snap('ride_requests/' + id);

async function offersFor(rideId) {
    const q = await db.collection('delivery_offers').where('rideId', '==', rideId).get();
    const out = []; q.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));
    return out;
}
async function countMoneyDocs(uids) {
    let n = 0;
    for (const c of ['wallet_transactions', 'wallet_ledger', 'escrow_holds', 'payments', 'ledger']) {
        const s = await db.collection(c).get();
        s.forEach(d => { const x = d.data() || {}; if (uids.indexOf(x.userId) !== -1 || uids.indexOf(x.uid) !== -1 || uids.indexOf(x.buyerId) !== -1) n++; });
    }
    return n;
}
async function createDeliveryFromOrder(orderId) {
    return await withRetry(() => PAGE.evaluate(async (id) => {
        const o = await window.skh.getDoc(window.skh.doc(window.skh.db, 'orders', id));
        const od = o.data() || {};
        return await window.skhHandleOrderDelivery(id, od.delivery, od);
    }, orderId));
}
async function openInbox() {
    await PAGE.evaluate(() => {
        if (window.skhCloseRequestInbox) window.skhCloseRequestInbox();
        if (window.skhOpenRequestInbox) window.skhOpenRequestInbox('new');
    });
}

/* ------------------------------------------------------------------- main */
(async function main() {
    const server = FN_URL ? null : await startStatic();
    /* Kizuizi cha mwisho: jaribio lisiishie kwenye hang isiyo na taarifa. */
    const watchdog = setTimeout(() => {
        log('WATCHDOG: jaribio limezidi muda — linaachishwa.');
        try { fs.appendFileSync(LOG_PATH, 'WATCHDOG timeout\n'); } catch (e) {}
        process.exit(2);
    }, Number(process.env.SKH_E2E_MAX_MS || 540000));
    watchdog.unref && watchdog.unref();

    log('== DELIVERY BROWSER E2E ==');
    log('   app   : ' + APP_ORIGIN + '  (index.html, real modules)');
    log('   server: ' + (FN_URL ? FN_URL + '  (functions/local-server.js)' : 'http://' + FN_HOST + '  (functions emulator)'));
    log('   project: ' + PROJECT + '  firestore=' + FS_HOST + ' auth=' + AUTH_HOST);

    if (want('main')) await step('00a reset emulator data (isolated run: Firestore + Auth)', async () => {
        /* Bila hii data ya run iliyopita inabaki na kuharibu vipimo vya "haoni ofa".
           Inagusa emulator ya demo-* pekee (REST ya emulator, sio production). */
        const urls = [
            'http://' + FS_HOST + '/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents',
            'http://' + AUTH_HOST + '/emulator/v1/projects/' + PROJECT + '/accounts'
        ];
        for (const u of urls) {
            const r = await fetch(u, { method: 'DELETE' });
            assert(r.ok || r.status === 404, 'reset failed ' + u + ' -> ' + r.status);
        }
        return 'Firestore + Auth zimesafishwa';
    });

    let heavyRideId = null, heavyOfferA = null, pickupToken = null, cancelRideId = null;
    const ST = loadState();
    if (!want('main')) {
        heavyRideId = ST.heavyRideId || null;
        pickupToken = ST.pickupToken || null;
        heavyOfferA = ST.heavyOfferId ? { id: ST.heavyOfferId, agentId: people.driverA.uid } : null;
        log('   resume: ride=' + heavyRideId + ' offer=' + (heavyOfferA && heavyOfferA.id));
    }

    await step('00 seed users, drivers, orders (emulator only)', async () => {
        await seed();
        return Object.keys(people).length + ' watumiaji, 4 madereva, 4 oda';
    });

    await boot();
    await useAs('customer');

    if (want('main')) await step('00b browser session is the emulator (no production wiring)', async () => {
        const env = await PAGE.evaluate(() => ({
            projectId: window.skh.emulator && window.skh.emulator.projectId,
            fnBase: window.skh.functionsBaseUrl,
            host: window.location.hostname
        }));
        assert(env.projectId === PROJECT, 'emulator project mismatch: ' + env.projectId);
        assert(env.fnBase && (env.fnBase.indexOf('5001') !== -1 || env.fnBase.indexOf('__fn') !== -1),
            'functions base URL is not the local backend: ' + env.fnBase);
        assert(env.host === '127.0.0.1' || env.host === 'localhost', 'page not served locally: ' + env.host);
        return env.projectId + ' @ ' + env.fnBase;
    });

    /* 1 — mteja anatengeneza ombi la usafiri kutoka oda (client → server) */
    if (want('main')) await step('01 customer creates a delivery request from the order', async () => {
        const res = await createDeliveryFromOrder('o_e2e_heavy');
        assert(res && res.routed === true, 'delivery not routed: ' + JSON.stringify(res));
        assert(res.via === 'server', 'expected the server routing path, got: ' + res.via);
        const order = await until(async () => {
            const o = await orderOf('o_e2e_heavy');
            return (o && o.rideRequestId) ? o : null;
        }, 'order.rideRequestId');
        heavyRideId = order.rideRequestId;
        return 'ride=' + heavyRideId + ' offers=' + res.offers + ' via=' + res.via;
    });

    /* 1b — [PART 5B-3] destination integrity: ombi lisilo na anwani halali
       halitengenezi ride/ofa, upande wa client NA server. */
    if (want('main')) await step('01b no destination → customer blocked, server rejects, nothing created', async () => {
        const ordersBefore = (await db.collection('orders').get()).size;
        /* (a) UI: cart yenye usafiri, anwani tupu/nafasi → imezuiwa */
        const ui = await withRetry(() => PAGE.evaluate(async () => {
            window.confirm = () => true; // skhConfirm ya asili isizuie kipimo
            /* Kikapu: skh.smartCartItems() husoma localStorage ('sokohai_cart'),
               hivyo ndiko kunakopaswa kuandikwa. */
            const item = {
                id: 'e2e_nodest_item', title: 'Saruji', price: 20000, qty: 1,
                userId: window.skh.currentUser.uid, ownerName: 'Duka la E2E', location: 'Dar es Salaam'
            };
            try { window.skh.localStorage.setItem('sokohai_cart', JSON.stringify([item])); } catch (e) {}
            window.skh.myCart = [item];
            window.skhDeliverySetRequired(true); // required + chosen
            window.skhDeliveryUpdateField('destination', '   '); // nafasi tupu pekee
            const before = (window.skh.myCart || []).length;
            const res = await window.finalProceedCheckout();
            return {
                res: res || null,
                prob: window.skhDeliveryDestinationProblem('   '),
                msg: window.skhDeliveryDestinationMessage('empty_destination'),
                cartKept: (window.skh.myCart || []).length === before,
                stillRequired: window.skhDeliveryState().required,
                destKept: window.skhDeliveryState().destination
            };
        }));
        assert(ui.res && ui.res.error === 'invalid_destination',
            'customer not blocked: ' + JSON.stringify(ui.res));
        assert(ui.cartKept, 'cart contents were lost on the blocked attempt');
        assert(ui.stillRequired === true && ui.destKept.trim() === '',
            'delivery choice was silently reset instead of kept: ' + JSON.stringify(ui));
        assert(ui.prob === 'empty_destination', 'validator reason=' + ui.prob);
        assert(/anwani/i.test(String(ui.msg)), 'message is not user friendly: ' + ui.msg);

        /* (b) client hook haitumii server wala haandiki ride */
        const hook = await withRetry(() => PAGE.evaluate(async () => {
            const o = await window.skh.getDoc(window.skh.doc(window.skh.db, 'orders', 'o_e2e_nodest'));
            return await window.skhHandleOrderDelivery('o_e2e_nodest', o.data().delivery, o.data());
        }));
        assert(hook && hook.routed === false && hook.error === 'invalid_destination',
            'client hook did not refuse: ' + JSON.stringify(hook));

        /* (c) MWITO WA MOJA KWA MOJA wa server (mteja hapitii UI) → invalid-argument */
        const srv = await withRetry(() => PAGE.evaluate(async () => {
            try {
                const v = await window.skhRoutingServerRouteBooking({ orderId: 'o_e2e_nodest' });
                return { ok: true, v: v && (v.data || v) };
            } catch (e) { return { ok: false, code: e && e.code, msg: e && e.message }; }
        }));
        assert(srv.ok === false, 'server accepted a request without a destination: ' + JSON.stringify(srv));
        assert(String(srv.code || '').indexOf('invalid-argument') !== -1,
            'wrong error code: ' + JSON.stringify(srv));
        assert(/anwani|destination/i.test(String(srv.msg)), 'unclear server message: ' + srv.msg);

        /* (d) hakuna ride, hakuna ofa, oda haijabadilishwa */
        const rides = await db.collection('ride_requests').where('orderId', '==', 'o_e2e_nodest').get();
        assert(rides.size === 0, 'rides created for the invalid order: ' + rides.size);
        const order = await orderOf('o_e2e_nodest');
        assert(!order.rideRequestId && !order.deliveryId, 'order was linked to a ride');
        assert(order.delivery && order.delivery.destination === '   ',
            'order delivery was overwritten: ' + JSON.stringify(order.delivery && order.delivery.destination));
        const allOffers = await db.collection('delivery_offers').get();
        let strayOffers = 0;
        allOffers.forEach(d => { const o = d.data(); if (o.orderId === 'o_e2e_nodest') strayOffers++; });
        assert(strayOffers === 0, 'offers created for the invalid order: ' + strayOffers);
        const ordersAfter = (await db.collection('orders').get()).size;
        assert(ordersAfter === ordersBefore,
            'an order was created despite the blocked checkout: ' + ordersBefore + ' → ' + ordersAfter);

        /* (d2) KITUO KIMOJA cha uandishi (skh.createRideRequest) hakina kuandika
           ride yenye anwani tupu — mwito wa moja kwa moja, hakuna UI. */
        const writer = await withRetry(() => PAGE.evaluate(async (PICKUP) => {
            try {
                await window.skh.createRideRequest({ toLocation: '   ', fromLocation: PICKUP, orderId: 'o_e2e_writer' });
                return { threw: false };
            } catch (e) { return { threw: true, code: e && e.code, msg: e && e.message }; }
        }, ROUTE.pickup).catch(e => ({ threw: true, code: 'eval', msg: String(e && e.message) })));
        assert(writer.threw === true && writer.code === 'invalid_destination',
            'skh.createRideRequest did not refuse a blank destination: ' + JSON.stringify(writer));
        const writerRides = await db.collection('ride_requests').where('orderId', '==', 'o_e2e_writer').get();
        assert(writerRides.size === 0, 'writer created a ride without a destination: ' + writerRides.size);

        /* (e) anwani HALALI inaendelea (hakuna kuzuia uongo) */
        const good = await PAGE.evaluate(() => ({
            str: window.skhDeliveryDestinationProblem('Dodoma Mjini'),
            struct: window.skhDeliveryDestinationProblem({ label: 'Dodoma', lat: -6.17, lon: 35.74 })
        }));
        assert(good.str === null && good.struct === null, 'valid destinations were refused: ' + JSON.stringify(good));

        return 'blocked (client+server), no ride/offers, order untouched, valid still accepted';
    });

    /* 2 — routing ya server inatengeneza ride + ofa */
    if (want('main')) await step('02 server routing created the ride + delivery offers', async () => {
        assert(heavyRideId, 'no ride from scenario 1');
        const ride = await until(async () => {
            const r = await rideOf(heavyRideId);
            return (r && r.offersCount > 0) ? r : null;
        }, 'ride offersCount');
        assert(ride.fromLocation === ROUTE.pickup, 'fromLocation=' + ride.fromLocation);
        assert(ride.toLocation === ROUTE.dest, 'toLocation=' + ride.toLocation);
        assert(ride.vehicleType === 'Lori', 'vehicleType=' + ride.vehicleType);
        assert(Number(ride.cargoWeight) === 8000, 'cargoWeight=' + ride.cargoWeight);
        const offers = await offersFor(heavyRideId);
        const live = offers.filter(o => o.status === 'offered' || o.status === 'waiting');
        assert(live.length >= 1, 'no live offers, got ' + JSON.stringify(offers.map(o => o.status)));
        /* [PART 5B-2] wasiofaa HAWAPATI ofa kabisa. */
        const got = offers.map(o => o.agentId);
        assert(got.indexOf(people.driverA.uid) !== -1, 'eligible 10t driver missing');
        assert(got.indexOf(people.driverSusp.uid) === -1, 'SUSPENDED driver received an offer');
        assert(got.indexOf(people.driverBajaji.uid) === -1, 'Bajaji 500kg received an 8,000kg offer');
        assert(got.indexOf(people.driverB.uid) === -1, '3t Lori received an 8,000kg offer');
        return 'offers=' + offers.length + ' (only the eligible 10t Lori)';
    });

    if (want('main')) await step('03 intended provider sees the offer in the Request Inbox (DOM)', async () => {
        const offers = await offersFor(heavyRideId);
        heavyOfferA = offers.find(o => o.agentId === people.driverA.uid);
        assert(heavyOfferA, 'driver A has no offer');
        await useAs('driverA');
        await openInbox();
        const sel = '[data-ri-id="' + heavyOfferA.id + '"]';
        await PAGE.waitForSelector(sel, { state: 'visible', timeout: 40000 });
        const card = await PAGE.$(sel);
        const text = await card.innerText();
        assert(/OMBI JIPYA|OMEKUBALI/i.test(text), 'card badge missing: ' + text.slice(0, 120));
        assert(text.indexOf('Saruji') !== -1, 'cargo name not shown: ' + text.slice(0, 160));
        assert(text.indexOf(ROUTE.dest) !== -1, 'destination not shown');
        return 'card visible: ' + text.replace(/\s+/g, ' ').slice(0, 80);
    });

    if (want('main')) await step('03b a non-target provider does not see that offer', async () => {
        await useAs('driverB');
        await openInbox();
        await sleep(2500);
        const el = await PAGE.$('[data-ri-id="' + heavyOfferA.id + '"]');
        assert(!el, 'driver B can see driver A offer card');
        const count = await PAGE.$$eval('[data-ri-id]', ns => ns.length);
        assert(count === 0, 'driver B sees ' + count + ' offer card(s) it should not');
        return '0 offer cards for driver B';
    });

    /* 4 — mtoa huduma anakubali (click halisi kwenye kitufe) */
    if (want('main')) await step('04 provider accepts the offer (real DOM click)', async () => {
        await useAs('driverA');
        await openInbox();
        await PAGE.waitForSelector('[data-ri-id="' + heavyOfferA.id + '"] .ri-btn-primary', { state: 'visible', timeout: 40000 });
        await PAGE.click('[data-ri-id="' + heavyOfferA.id + '"] .ri-btn-primary');
        const ride = await until(async () => {
            const r = await rideOf(heavyRideId);
            return (r && r.status === 'accepted' && r.driverId) ? r : null;
        }, 'ride accepted');
        assert(ride.driverId === people.driverA.uid, 'driverId=' + ride.driverId);
        assert(ride.assignmentStatus === 'assigned', 'assignmentStatus=' + ride.assignmentStatus);
        const offers = await offersFor(heavyRideId);
        const mine = offers.find(o => o.id === heavyOfferA.id);
        assert(mine.status === 'accepted', 'offer status=' + mine.status);
        const tok = await until(async () => {
            const t = await snap('delivery_tokens/' + heavyRideId + '_pickup');
            return (t && t.token) ? t : null;
        }, 'pickup token');
        pickupToken = tok.token;
        assert(tok.status === 'pending', 'token status=' + tok.status);
        assert((tok.participants || []).indexOf(people.seller.uid) !== -1, 'seller not a token participant');
        return 'accepted by A; PK issued';
    });

    /* 5 — mtoa huduma wa pili hawezi kuchukua assignment ile ile */
    if (want('main')) await step('05 a second provider cannot take the same assignment', async () => {
        await useAs('driverB');
        const other = await callFn('skhRoutingServerOfferAccept', { offerId: heavyOfferA.id });
        assert(other.ok === false, 'driver B accepted an assignment owned by A!');
        assert(/permission-denied|failed-precondition|not-found/.test(other.code + other.message),
            'unexpected error: ' + other.code + ' ' + other.message);
        const ride = await rideOf(heavyRideId);
        assert(ride.driverId === people.driverA.uid, 'assignment changed to ' + ride.driverId);
        const accepted = (await offersFor(heavyRideId)).filter(o => o.status === 'accepted');
        assert(accepted.length === 1, 'accepted offers = ' + accepted.length);
        return 'B refused (' + String(other.code || other.message).slice(0, 34) + '); still A';
    });

    /* 5b — watoa huduma wawili wanaostahili: foleni ya alama, kukataa kunamhamisha
       ofa kwa wa pili, na mtoa huduma wa kwanza hawezi tena kuikubali. */
    if (want('main')) await step('05b ranked queue: A holds the offer, B is promoted on decline, late A refused', async () => {
        await useAs('customer');
        const res = await createDeliveryFromOrder('o_e2e_race');
        assert(res && res.routed === true, 'race order not routed: ' + JSON.stringify(res).slice(0, 160));
        const order = await until(async () => {
            const o = await orderOf('o_e2e_race');
            return (o && o.rideRequestId) ? o : null;
        }, 'race ride id');
        const rideId = order.rideRequestId;
        const offers = await until(async () => {
            const l = await offersFor(rideId);
            return l.length >= 2 ? l : null;
        }, 'two eligible offers');
        const oa = offers.find(o => o.agentId === people.driverA.uid);
        const ob = offers.find(o => o.agentId === people.driverB.uid);
        assert(oa && ob, 'expected offers for both eligible drivers: ' + JSON.stringify(offers.map(o => o.agentId)));
        assert(oa.status === 'offered', 'rank-1 provider should hold the live offer, got ' + oa.status);
        assert(ob.status === 'waiting', 'rank-2 provider should be queued, got ' + ob.status);

        /* Dereva A anakataa kutoka kwenye UI/API yake → ofa inamhamia B. */
        await useAs('driverA');
        const dec = await callFn('skhRoutingServerOfferDecline', { offerId: oa.id });
        assert(dec.ok !== false, 'decline failed: ' + JSON.stringify(dec).slice(0, 160));
        const promoted = await until(async () => {
            const o = await snap('delivery_offers/' + ob.id);
            return (o && o.status === 'offered') ? o : null;
        }, 'B promoted to offered', 20000);

        await useAs('driverB');
        await openInbox();
        await PAGE.waitForSelector('[data-ri-id="' + ob.id + '"] .ri-btn-primary', { state: 'visible', timeout: 40000 })
            .catch(async () => { await openInbox(); await PAGE.waitForSelector('[data-ri-id="' + ob.id + '"] .ri-btn-primary', { state: 'visible', timeout: 40000 }); });
        await PAGE.click('[data-ri-id="' + ob.id + '"] .ri-btn-primary');
        await until(async () => {
            const r = await rideOf(rideId);
            return (r && r.driverId === people.driverB.uid) ? r : null;
        }, 'ride assigned to B');

        /* A (aliyekataa) hawezi tena kuikubali ofa ile. */
        await useAs('driverA');
        const late = await callFn('skhRoutingServerOfferAccept', { offerId: oa.id });
        assert(late.ok === false, 'A accepted an offer it had already declined!');
        const after = await rideOf(rideId);
        assert(after.driverId === people.driverB.uid, 'assignment overwritten by ' + after.driverId);
        return 'A offered → declined → B promoted → B accepted; late A refused (' +
            String(late.code || late.message).slice(0, 30) + ')';
    });

    if (want('main')) {
        saveState({ heavyRideId: heavyRideId, heavyOfferId: heavyOfferA ? heavyOfferA.id : null, pickupToken: pickupToken });
        log('   state saved: ride=' + heavyRideId);
    }

    /* 6 — makabidhiano: muuzaji → dereva (pickup token) */
    if (want('custody')) await step('06 seller handover then transporter pickup verified', async () => {
        await useAs('seller');
        const h1 = await callFn('skhCustodyServerConfirmCustody', { rideId: heavyRideId, role: 'seller', token: pickupToken });
        assert(h1.ok, 'seller handover failed: ' + JSON.stringify(h1).slice(0, 200));
        assert(h1.data && h1.data.status === 'seller_confirmed_handover', 'seller status=' + JSON.stringify(h1.data));
        const s1 = await rideOf(heavyRideId);
        assert(s1.status === 'seller_confirmed_handover', 'ride status=' + s1.status);

        await useAs('driverA');
        /* Token isiyo sahihi lazima ikataliwe kwanza (usalama wa custody). */
        const bad = await callFn('skhCustodyServerConfirmCustody', { rideId: heavyRideId, role: 'transporter', token: 'PK-000000' });
        assert(bad.ok === false, 'wrong pickup token was accepted!');
        const h2 = await callFn('skhCustodyServerConfirmCustody', { rideId: heavyRideId, role: 'transporter', token: pickupToken });
        assert(h2.ok, 'transporter pickup failed: ' + JSON.stringify(h2).slice(0, 200));
        const ride = await until(async () => {
            const r = await rideOf(heavyRideId);
            return (r && r.status === 'picked_up') ? r : null;
        }, 'picked_up');
        assert(ride.pickupTokenStatus === 'used', 'pickup token status=' + ride.pickupTokenStatus);
        return 'seller_confirmed_handover → picked_up (token single-use)';
    });

    /* 7 — safari inaanza */
    if (want('custody')) await step('07 transit begins', async () => {
        await useAs('driverA');
        const r = await callFn('skhCustodyServerStartTransit', { rideId: heavyRideId });
        assert(r.ok, 'startTransit failed: ' + JSON.stringify(r).slice(0, 200));
        const ride = await until(async () => {
            const x = await rideOf(heavyRideId);
            return (x && x.status === 'in_transit') ? x : null;
        }, 'in_transit');
        assert(ride.custodyStage === 'transit', 'custodyStage=' + ride.custodyStage);
        return 'status=in_transit, custodyStage=transit';
    });

    /* 8 — uwasilishaji umethibitishwa */
    if (want('custody')) await step('08 delivery completion verified', async () => {
        await useAs('customer');
        const r = await callFn('skhCustodyServerComplete', { rideId: heavyRideId });
        assert(r.ok, 'deliveryComplete failed: ' + JSON.stringify(r).slice(0, 240));
        const ride = await until(async () => {
            const x = await rideOf(heavyRideId);
            return (x && x.status === 'completed') ? x : null;
        }, 'completed');
        assert(ride.custodyStage === 'completed', 'custodyStage=' + ride.custodyStage);
        assert(ride.completedAt, 'completedAt missing');
        const again = await callFn('skhCustodyServerComplete', { rideId: heavyRideId });
        assert(again.ok && again.data && again.data.already === true, 'idempotent completion missing: ' + JSON.stringify(again).slice(0, 160));
        return 'status=completed (idempotent retry ok)';
    });

    /* 9 — uthabiti wa hali kati ya oda na ride */
    if (want('custody')) await step('09 order and ride states are consistent; no money docs touched', async () => {
        const order = await orderOf('o_e2e_heavy');
        const ride = await rideOf(heavyRideId);
        assert(order.rideRequestId === heavyRideId, 'order.rideRequestId=' + order.rideRequestId);
        assert(ride.orderId === 'o_e2e_heavy', 'ride.orderId=' + ride.orderId);
        assert(order.buyerId === ride.customerId, 'buyer/customer mismatch');
        assert(ride.driverId === people.driverA.uid, 'ride.driverId changed');
        assert(ride.status === 'completed', 'ride status=' + ride.status);
        assert(order.status === 'held', 'order payment status changed by delivery flow: ' + order.status);
        const money = await countMoneyDocs([people.customer.uid, people.seller.uid, people.driverA.uid]);
        assert(money === 0, money + ' wallet/escrow/payment docs were created by the delivery flow');
        const offers = await offersFor(heavyRideId);
        assert(offers.every(o => ['accepted', 'cancelled', 'declined', 'expired'].indexOf(o.status) !== -1),
            'stale live offers: ' + JSON.stringify(offers.map(o => o.status)));
        return 'order↔ride linked, ride completed, 0 money docs';
    });

    /* 10a — ofa iliyoisha muda hairuhusiwi kukubaliwa */
    if (want('failures')) await step('10a an expired offer cannot be accepted (and is swept on)', async () => {
        await useAs('customer');
        const res = await createDeliveryFromOrder('o_e2e_cancel');
        assert(res && res.routed === true, 'cancel order not routed: ' + JSON.stringify(res).slice(0, 160));
        const order = await until(async () => { const o = await orderOf('o_e2e_cancel'); return (o && o.rideRequestId) ? o : null; }, 'cancel ride id');
        cancelRideId = order.rideRequestId;
        const offers = await until(async () => { const l = await offersFor(cancelRideId); return l.length ? l : null; }, 'cancel ride offers');
        const target = offers.find(o => o.status === 'offered') || offers[0];
        await db.doc('delivery_offers/' + target.id).update({ expiresAt: new Date(Date.now() - 60000).toISOString() });
        await useAs(target.agentId === people.driverA.uid ? 'driverA' : 'driverB');
        const r = await callFn('skhRoutingServerOfferAccept', { offerId: target.id });
        assert(r.ok === false, 'expired offer was accepted!');
        const swept = await callFn('skhRoutingServerSweep', {});
        assert(swept.ok !== false, 'sweep failed: ' + JSON.stringify(swept).slice(0, 160));
        const after = await until(async () => {
            const o = await snap('delivery_offers/' + target.id);
            return (o && ['expired', 'declined', 'cancelled'].indexOf(o.status) !== -1) ? o : null;
        }, 'expired offer closed');
        const ride = await rideOf(cancelRideId);
        assert(!ride.driverId, 'ride got assigned from an expired offer');
        return 'expired offer closed as ' + after.status + '; ride still unassigned';
    });

    /* 10b — kughairi */
    if (want('failures')) await step('10b customer cancels the delivery request', async () => {
        await useAs('customer');
        const r = await callFn('skhCustodyServerCancel', { rideId: cancelRideId, reason: 'Mteja amebadilisha mawazo' });
        assert(r.ok, 'cancel failed: ' + JSON.stringify(r).slice(0, 200));
        const ride = await until(async () => {
            const x = await rideOf(cancelRideId);
            return (x && ['cancelled', 'canceled'].indexOf(String(x.status)) !== -1) ? x : null;
        }, 'ride cancelled');
        const offers = await offersFor(cancelRideId);
        assert(offers.every(o => ['cancelled', 'expired', 'declined'].indexOf(o.status) !== -1),
            'offers still live after cancel: ' + JSON.stringify(offers.map(o => o.status)));
        return 'ride=' + ride.status + ', ' + offers.length + ' offers closed';
    });

    /* 10c — mgombeaji asiyefaa hapati ofa (T-03 kwa njia ya server) */
    if (want('failures')) await step('10c ineligible providers receive nothing (reported T-03 case)', async () => {
        await useAs('customer');
        const res = await createDeliveryFromOrder('o_e2e_susp_only');
        assert(res && res.routed === true, 'order not routed: ' + JSON.stringify(res).slice(0, 160));
        const o2 = await until(async () => { const o = await orderOf('o_e2e_susp_only'); return (o && o.rideRequestId) ? o : null; }, 'ride id');
        const offers = await offersFor(o2.rideRequestId);
        const got = offers.map(o => o.agentId);
        assert(got.indexOf(people.driverSusp.uid) === -1, 'suspended driver offered');
        assert(got.indexOf(people.driverBajaji.uid) === -1, 'bajaji 500kg offered 8t');
        assert(got.indexOf(people.driverB.uid) === -1, '3t Lori offered 8t');
        assert(got.indexOf(people.driverA.uid) !== -1, 'the only eligible 10t Lori got nothing');
        return 'only the eligible 10t Lori was offered (' + offers.length + ' offer)';
    });

    /* errors ------------------------------------------------------------- */
    await step('11 no uncaught page errors in the signed-in sessions', async () => {
        /* PERMISSION_DENIED ya boot ni tabia iliyopo tangu awali ya app (writes za hiari
   zinazokataliwa na rules); haihusiani na mtiririko wa usafirishaji. */
        const NOISE = /net::ERR|Failed to load resource|ERR_FAILED|ERR_BLOCKED|Could not reach Cloud|WebChannel|transport errored|tile|leaflet|maps\.googleapis|Permissions-Policy|favicon|status of 404|PERMISSION_DENIED|Missing or insufficient permissions/i;
        const bad = PAGE_ERRORS.filter(e => !NOISE.test(e.text));
        assert(bad.length === 0, bad.slice(0, 4).map(e => (e.who || '?') + ': ' + e.text).join(' | '));
        return PAGE_ERRORS.length + ' ignored (network/404), 0 real errors';
    });

    /* ------------------------------------------------------------------ end */
    log('');
    log('========================================');
    log('DELIVERY BROWSER E2E: ' + (results.length - failed) + ' pass, ' + failed + ' fail');
    log('========================================');
    clearTimeout(watchdog);
    try { await browser.close(); } catch (e) {}
    try { server && server.close(); } catch (e) {}
    process.exit(failed ? 1 : 0);
})().catch(e => {
    log('FATAL ' + String((e && e.stack) || e));
    process.exit(1);
});

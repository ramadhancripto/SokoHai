/* =====================================================================
 * [PART 4 FINAL RUNTIME INTEGRATION VERIFICATION — 2026-11-24]
 * tools/test_service_edit_browser_part4c.mjs
 *
 * KIPIMO HALISI CHA KIVINJARI (real browser runtime smoke test).
 *
 * Kinachotumika:
 *   - Chromium halisi (Playwright) — sio jsdom.
 *   - index.html HALISI iliyojengwa na tools/build_html.py (bila kuibadilisha).
 *   - Moduli HALISI za js/app/*.js kupitia HTTP kutoka repo.
 *   - Firebase SDK: STUB ya ndani inayoshughulikia tu API inayotumika
 *     (hakuna mtandao, hakuna project halisi, hakuna data ya production).
 *     Hii ni lazima kwa sababu sandbox haina credentials za Firebase.
 *
 * Kinachothibitishwa:
 *   1. js/app/39-service-edit-core.js inapakiwa na kutoa exports 6.
 *   2. index.html (runtime) inapakia 19-roles.js, ambayo ina-import core.
 *   3. window.skhServiceEditOpen inapatikana KABLA ya kubonyeza kitufe.
 *   4. Kuhariri huduma: data inajazwa kwenye fomu HALISI, sehemu inabadilishwa,
 *      hati ILE ILE inasasishwa, hakuna hati ya pili, publicationStatus haibadiliki.
 *   5. Hakuna ReferenceError / missing-function error.
 *
 * Matumizi: node tools/test_service_edit_browser_part4c.mjs
 * ===================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let passed = 0, failed = 0;
const failures = [];
function ok(name, cond, extra) {
    if (cond) { passed++; console.log('  PASS  ' + name); }
    else { failed++; failures.push(name + (extra ? ' → ' + extra : '')); console.log('  FAIL  ' + name + (extra ? ' → ' + extra : '')); }
}

/* ---------------------------------------------------------------- stubs */
const FB = {
    'firebase-app.js': `
export function initializeApp(cfg, name) {
  globalThis.__FBSTUB__ = globalThis.__FBSTUB__ || makeState();
  globalThis.__FBSTUB__.appConfig = cfg || {};
  return globalThis.__FBSTUB__.app = { name: name || '[DEFAULT]', options: cfg || {} };
}`,
    'firebase-auth.js': `
const S = () => globalThis.__FBSTUB__ = globalThis.__FBSTUB__ || makeState();
const USER = { uid: 'u1', email: 'fundi@example.com', displayName: 'Fundi Test', photoURL: '', emailVerified: true, providerData: [] };
export function getAuth() { return S().auth = S().auth || { currentUser: USER, __auth: true, useDeviceLanguage() {}, setPersistence() { return Promise.resolve(); } }; }
export function onAuthStateChanged(auth, cb) { setTimeout(() => { try { cb(USER); } catch (e) { globalThis.__FBSTUB__.errors.push('onAuthStateChanged cb: ' + e.message); } }, 0); return () => {}; }
export function connectAuthEmulator() {}
export function signInWithEmailAndPassword() { return Promise.resolve({ user: USER }); }
export function createUserWithEmailAndPassword() { return Promise.resolve({ user: USER }); }
export function signInWithCustomToken() { return Promise.resolve({ user: USER }); }
export function signInWithPopup() { return Promise.resolve({ user: USER }); }
export function signOut() { return Promise.resolve(); }
export function updateProfile() { return Promise.resolve(); }
export function sendPasswordResetEmail() { return Promise.resolve(); }
export function sendEmailVerification() { return Promise.resolve(); }
export function verifyPasswordResetCode() { return Promise.resolve('fundi@example.com'); }
export function confirmPasswordReset() { return Promise.resolve(); }
export function GoogleAuthProvider() { this.providerId = 'google.com'; }
export const mockUser = USER;`,
    'firebase-firestore.js': `
const S = () => globalThis.__FBSTUB__ = globalThis.__FBSTUB__ || makeState();
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function refOf(db, segs) {
    const flat = [];
    segs.forEach(s => { if (s && s.__colpath) flat.push(s.__colpath); else if (s !== undefined && s !== null) flat.push(String(s)); });
    const p = flat.join('/');
    const parts = p.split('/');
    return { __doc: true, path: p, id: parts[parts.length - 1], colPath: parts.slice(0, -1).join('/') };
}
export function getFirestore(app) { S(); return { __db: true, app }; }
export function connectFirestoreEmulator() {}
export function doc(db, ...segs) { return refOf(db, segs); }
export function collection(db, ...segs) { return { __col: true, __colpath: String(segs.join('/')) }; }
export function getDoc(ref) {
    const st = S(); const has = st.store.has(ref.path); const data = has ? clone(st.store.get(ref.path)) : undefined;
    st.reads.push(ref.path);
    return Promise.resolve({ id: ref.id, ref, exists: () => has, data: () => data, get: f => (data ? data[f] : undefined) });
}
export function getDocs(target) {
    const st = S(); const colPath = target.__col ? target.__colpath : (target && target.__colpath) || '';
    const out = [];
    st.store.forEach((v, k) => { if (k.startsWith(colPath + '/') && k.split('/').length === colPath.split('/').length + 1) out.push({ id: k.split('/').pop(), exists: () => true, data: () => clone(v) }); });
    return Promise.resolve({ docs: out, size: out.length, empty: out.length === 0, forEach: fn => out.forEach(fn) });
}
export function onSnapshot(target, cb) {
    const st = S(); st.listeners++;
    const empty = { docs: [], size: 0, empty: true, forEach: () => {}, exists: () => false, data: () => undefined, id: (target && target.id) || '' };
    setTimeout(() => { try { cb(empty); } catch (e) { st.errors.push('onSnapshot cb: ' + e.message); } }, 0);
    return () => { st.listeners--; };
}
export function updateDoc(ref, patch) {
    const st = S();
    if (st.denyWrites) { st.attempts.push({ path: ref.path, patch: clone(patch), denied: true }); return Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })); }
    st.writes.push({ path: ref.path, patch: clone(patch) });
    st.store.set(ref.path, Object.assign({}, st.store.get(ref.path) || {}, clone(patch)));
    return Promise.resolve();
}
export function setDoc(ref, data, opts) {
    const st = S();
    st.writes.push({ path: ref.path, patch: clone(data), kind: 'set' });
    st.store.set(ref.path, Object.assign({}, (opts && opts.merge) ? (st.store.get(ref.path) || {}) : {}, clone(data)));
    return Promise.resolve();
}
export function addDoc(col, data) {
    const st = S(); const id = 'auto_' + (++st.autoId);
    st.adds.push({ path: col.__colpath + '/' + id, data: clone(data) });
    st.store.set(col.__colpath + '/' + id, clone(data));
    return Promise.resolve({ id, path: col.__colpath + '/' + id });
}
export function deleteDoc(ref) { const st = S(); st.store.delete(ref.path); st.writes.push({ path: ref.path, deleted: true }); return Promise.resolve(); }
export function query(t) { return t; }
export function where() { return {}; }
export function orderBy() { return {}; }
export function limit() { return {}; }
export function startAfter() { return {}; }
export function getCountFromServer() { return Promise.resolve({ data: () => ({ count: 0 }) }); }
export function runTransaction(db, fn) { return fn({ get: getDoc, set: setDoc, update: updateDoc, delete: deleteDoc }); }
export function writeBatch() {
    const ops = [];
    return { set: (r, d, o) => ops.push(() => setDoc(r, d, o)), update: (r, p) => ops.push(() => updateDoc(r, p)), delete: r => ops.push(() => deleteDoc(r)), commit: () => Promise.all(ops.map(f => f())) };
}
export function serverTimestamp() { return new Date().toISOString(); }
export function increment(n) { return { __inc: n }; }
export function arrayUnion(...a) { return { __union: a }; }
export function arrayRemove(...a) { return { __remove: a }; }
export function deleteField() { return { __delete: true }; }
export const documentId = '__name__';`,
    'firebase-functions.js': `
export function getFunctions(app, region) { return { __fn: true, region: region || 'us-central1' }; }
export function httpsCallable(fns, name) { return () => Promise.reject(Object.assign(new Error('stub: callable ' + name + ' haipo kwenye jaribio'), { code: 'unimplemented' })); }
export function httpsCallableFromURL(fns, url) { return () => Promise.reject(Object.assign(new Error('stub: callable url ' + url), { code: 'unimplemented' })); }`,
    'firebase-app-check.js': `
export function initializeAppCheck(app, opts) { globalThis.__FBSTUB__ = globalThis.__FBSTUB__ || makeState(); globalThis.__FBSTUB__.appCheck = true; return { __appCheck: true }; }
export function ReCaptchaEnterpriseProvider(key) { this.siteKey = key; }
export function getToken() { return Promise.resolve({ token: '' }); }`
};

const STATE_BOOT = `
function makeState() {
  return { store: new Map(), writes: [], attempts: [], adds: [], reads: [], errors: [],
           listeners: 0, autoId: 0, denyWrites: false, app: null, auth: null, appCheck: false };
}
globalThis.__FBSTUB__ = globalThis.__FBSTUB__ || makeState();
`;

/* -------------------------------------------------------- static server */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url.startsWith('/__fbstub__/')) {
        const name = url.replace('/__fbstub__/', '');
        const body = name === '__state.js' ? STATE_BOOT : (FB[name] || '');
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(body);
    }
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
/* [MUHIMU] Tunatumia `localhost` (sio 127.0.0.1) ili skh.isLocalEnv iwe true, kisha
   bootstrapping itumie EMULATOR path (demo project) — production haiguswi kabisa. */
const BASE = `http://localhost:${PORT}`;
console.log(`server: ${BASE} (index.html halisi, js/app halisi)\n`);

/* ------------------------------------------------------------ the test */
const pageErrors = [];
const consoleErrors = [];
let browser;
try {
    browser = await chromium.launch({ args: ['--no-sandbox'] });
} catch (e) {
    console.log('BROWSER UNAVAILABLE: ' + String(e).split('\n')[0]);
    server.close();
    console.log('\nHAKUWEZA kuendesha kivinjari halisi. Hii SI uthibitisho wa runtime.');
    process.exit(2);
}
const ctx = await browser.newContext();
const page = await ctx.newPage();
/* Emulator ya ndani: env = 'emulator' + project ya demo. Hakuna production, hakuna mtandao. */
await page.addInitScript(() => {
    window.SKH_LOCAL_FUNCTIONS_SERVER = true;
    window.SKH_EMULATOR = {
        projectId: 'demo-skhtest',
        firestore: { host: 'localhost', port: 8080 },
        auth: { url: 'http://localhost:9099' },
        functions: { host: 'localhost', port: 5001 }
    };
});
page.on('pageerror', e => pageErrors.push(String(e && e.message ? e.message : e)));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
const http404 = [];
const jsLoads = [];
page.on('response', r => {
    const u = r.request().url();
    if (r.status() === 404 && u.indexOf('localhost') !== -1) http404.push(u.replace(/^http:\/\/localhost:\d+/, ''));
    if (/\/js\/app\/.*\.js(\?|$)/.test(u) && r.status() === 200) jsLoads.push(u.replace(/^http:\/\/localhost:\d+/, '').split('?')[0]);
});

/* 1) Firebase SDK inachukuliwa na stub ya ndani; kila kitu kingine cha nje kinazuiwa. */
await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('http://localhost:' + PORT)) return route.continue();
    const m = u.match(/firebasejs\/[\d.]+\/(firebase-[a-z-]+\.js)$/);
    if (m) {
        const stub = (m[1] === 'firebase-app.js' ? STATE_BOOT : '') + (FB[m[1]] || '');
        return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: stub });
    }
    return route.abort();   // hakuna mtandao wa nje, hakuna Firebase halisi
});

console.log('§0 index.html halisi inapakiwa kwenye Chromium');
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
ok('index.html imepakiwa', (await page.title()) !== undefined);
const envInfo = await page.evaluate(() => ({
    env: document.documentElement.getAttribute('data-skh-env'),
    blocked: !!window.SKH_ENV_BLOCKED,
    project: (window.skh && window.skh.firebaseConfig && window.skh.firebaseConfig.projectId) || '',
    isLocal: !!(window.skh && window.skh.isLocalEnv),
    host: location.hostname,
    scripts: document.querySelectorAll('script[type="module"][src]').length,
    rolesLoaded: !!Array.from(document.querySelectorAll('script[type="module"][src]')).find(s => /19-roles\.js/.test(s.src))
}));
ok('mazingira = emulator (hakuna production)', envInfo.env === 'emulator' && !envInfo.blocked, JSON.stringify(envInfo.env || envInfo.blocked));
ok('project ya demo (sio production)', envInfo.project === 'demo-skhtest', envInfo.project);
ok('index.html inapakia 19-roles.js', envInfo.rolesLoaded === true, String(envInfo.scripts) + ' module scripts');
await page.waitForFunction(() => typeof window.skhServiceEditOpen === 'function', null, { timeout: 60000 });
const coreLoad = jsLoads.filter(u => /39-service-edit-core\.js$/.test(u));
ok('39-service-edit-core.js imepakiwa kwa HTTP 200 ndani ya runtime',
    coreLoad.length === 1, JSON.stringify(coreLoad) + ' | js/app modules zilizopakiwa: ' + jsLoads.length);
ok('19-roles.js imepakiwa kwa HTTP 200', jsLoads.some(u => /19-roles\.js$/.test(u)), String(jsLoads.length));

/* 2) Moduli ya msingi inapatikana kwa import halisi ya kivinjari */
console.log('\n§1 js/app/39-service-edit-core.js — inapakiwa kama ES module halisi');
const coreInfo = await page.evaluate(async () => {
    try {
        const m = await import('/js/app/39-service-edit-core.js');
        return { ok: true, keys: Object.keys(m).sort(), types: Object.keys(m).reduce((a, k) => (a[k] = typeof m[k], a), {}) };
    } catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
});
ok('import() imefanikiwa', coreInfo.ok === true, coreInfo.error);
const SIX = ['serviceEditGuard', 'serviceEditSnapshot', 'validateServiceUpdate', 'buildServiceUpdate', 'serviceSubmitGate', 'serviceUpdateErrorText'];
SIX.forEach(fn => ok(`${fn} ni function`, coreInfo.ok && coreInfo.types[fn] === 'function', JSON.stringify(coreInfo.types)));
ok('SERVICE_GROUPS imetolewa', coreInfo.ok && coreInfo.keys.includes('SERVICE_GROUPS'), JSON.stringify(coreInfo.keys));

/* 3) 19-roles.js (runtime) — imepakiwa na ina imports zote zilizotatuliwa */
console.log('\n§2 19-roles.js kwenye runtime: imports zimetatuliwa, hakuna ReferenceError ya core');
const rolesInfo = await page.evaluate(async () => {
    const res = await fetch('/js/app/19-roles.js'); const src = await res.text();
    const imports = (src.match(/import\s*\{[^}]*\}\s*from\s*'\.\/39-service-edit-core\.js'/s) || [])[0] || '';
    const names = (imports.match(/\{([^}]*)\}/) || [])[1] || '';
    return { names: names.split(',').map(s => s.trim()).filter(Boolean), hasSkhEditOpen: typeof window.skhServiceEditOpen === 'function' };
});
SIX.forEach(fn => ok(`19-roles ina-import ${fn}`, rolesInfo.names.includes(fn)));
ok('window.skhServiceEditOpen ipo kwenye runtime', rolesInfo.hasSkhEditOpen === true);

/* 4) Fomu halisi + hati halisi: kuhariri */
console.log('\n§3 Kuhariri huduma kwenye runtime halisi (hati ile ile, hali haibadiliki)');
const seed = {
    id: 'svc1', userId: 'u1', createdAt: '2026-11-01T00:00:00.000Z',
    title: 'Usafi wa Nyumbani', groupType: 'physical', category: 'Home & Personal', subCategory: 'Cleaning Services',
    description: 'Usafi wa nyumbani na ofisini.', location: 'Kinondoni, Dar es Salaam',
    price: '50000', pricingModel: 'fixed', availabilityStatus: 'available',
    travelAvailable: true, negotiationAllowed: true, countryCode: 'TZ', region: 'Dar es Salaam',
    image: 'https://example.invalid/a.jpg', filters: {},
    status: 'draft', publicationStatus: 'draft'
};
const before = await page.evaluate(async (doc0) => {
    const st = globalThis.__FBSTUB__;
    st.store.set('services/svc1', doc0);
    // subiri bootstrap imalize (skh.currentUser amewekwa na onAuthStateChanged)
    for (let i = 0; i < 200; i++) {
        if (window.skh && window.skh.currentUser && window.skh.currentUser.uid) break;
        await new Promise(r => setTimeout(r, 25));
    }
    const svcCount = Array.from(st.store.keys()).filter(k => k.indexOf('services/') === 0).length;
    return { loggedIn: !!(window.skh && window.skh.currentUser && window.skh.currentUser.uid),
             uid: window.skh && window.skh.currentUser && window.skh.currentUser.uid,
             svcCount, allPaths: Array.from(st.store.keys()),
             openFn: typeof window.skhServiceEditOpen };
}, seed);
ok('mtumiaji ameingia (runtime)', before.loggedIn === true, JSON.stringify(before));
ok('huduma moja tu imewekwa mwanzoni', before.svcCount === 1, JSON.stringify(before.allPaths));
ok('skhServiceEditOpen ni function', before.openFn === 'function', before.openFn);

const opened = await page.evaluate(async () => {
    await window.skhServiceEditOpen('svc1');
    const g = id => { const el = document.getElementById(id); return el ? el.value : '__MISSING__'; };
    const note = document.getElementById('serviceEditNote');
    return {
        formVisible: (document.getElementById('serviceForm') || {}).style ? document.getElementById('serviceForm').style.display : 'missing',
        heading: (document.querySelector('#serviceForm h3') || {}).textContent || '',
        button: ((document.getElementById('btnSubmitHubService') || {}).textContent) || '',
        note: note ? note.textContent : '',
        title: g('servHubTitle'), price: g('servHubPrice'), model: g('servPricingModel'),
        avail: g('servAvailability'), desc: g('servHubDesc'), loc: g('servHubLocation'),
        group: g('servGroupType'), cat: g('servHubCategory'), sub: g('servHubSubCategory'),
        country: g('servHubCountry'), region: g('servHubRegion'),
        travel: !!(document.getElementById('servTravelAvailable') || {}).checked,
        nego: !!(document.getElementById('servNegoAllowed') || {}).checked,
        editStateId: (window.__skhServiceEditState || {}).id
    };
});
ok('fomu imefunguliwa', opened.formVisible === 'block', opened.formVisible);
ok('kichwa «Hariri Huduma»', /Hariri Huduma/.test(opened.heading), opened.heading.replace(/\s+/g, ' ').trim());
ok('kitufe «HIFADHI MABADILIKO»', /HIFADHI MABADILIKO/.test(opened.button), opened.button.replace(/\s+/g, ' ').trim());
ok('kidokezo cha hali ya uchapishaji', /haitabadilika/.test(opened.note), opened.note);
ok('jina limejazwa', opened.title === seed.title, opened.title);
ok('bei imejazwa', String(opened.price) === seed.price, String(opened.price));
ok('modeli ya bei imejazwa', opened.model === seed.pricingModel, opened.model);
ok('upatikanaji umejazwa', opened.avail === seed.availabilityStatus, opened.avail);
ok('maelezo yamejazwa', opened.desc === seed.description, String(opened.desc).slice(0, 40));
ok('mahali pajazwa', opened.loc === seed.location, opened.loc);
ok('kundi limejazwa', opened.group === seed.groupType, opened.group);
ok('kategoria imejazwa', opened.cat === seed.category, opened.cat);
ok('aina ndogo imejazwa', opened.sub === seed.subCategory, opened.sub);
ok('nchi imejazwa', opened.country === seed.countryCode, opened.country);
ok('mkoa umejazwa', opened.region === seed.region, opened.region);
ok('travelAvailable imejazwa', opened.travel === true);
ok('negotiationAllowed imejazwa', opened.nego === true);
ok('hali ya uhariri ina id ya hati', opened.editStateId === 'svc1', String(opened.editStateId));

const saved = await page.evaluate(async () => {
    const st = globalThis.__FBSTUB__;
    const w0 = st.writes.length, a0 = st.adds.length;
    document.getElementById('servHubTitle').value = 'Umeme wa Nyumbani (Imeboreshwa)';
    document.getElementById('servHubPrice').value = '65000';
    document.getElementById('servHubDesc').value = 'Usafi wa nyumbani, ofisini na baada ya ujenzi.';
    window.__skhLastServiceAlert = '';
    const origAlert = window.alert; window.alert = m => { window.__skhLastServiceAlert += String(m) + ' | '; };
    const form = document.getElementById('serviceForm');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 240; i++) {
        if (st.writes.length > w0 || st.adds.length > a0) break;
        await new Promise(r => setTimeout(r, 25));
    }
    await new Promise(r => setTimeout(r, 60));
    window.alert = origAlert;
    const doc = st.store.get('services/svc1') || {};
    const svcKeys = Array.from(st.store.keys()).filter(k => k.indexOf('services/') === 0);
    const svcWrites = st.writes.slice(w0).filter(w => String(w.path).indexOf('services/') === 0);
    return {
        newWrites: svcWrites, allNewWrites: st.writes.slice(w0), newAdds: st.adds.slice(a0).filter(a => String(a.path).indexOf('services/') === 0),
        svcCount: svcKeys.length, doc, keys: svcKeys,
        alertText: (window.__skhLastServiceAlert || ''),
        editStateId: (window.__skhServiceEditState || {}).id
    };
});
ok('write moja kwa hati ile ile', saved.newWrites.length === 1 && saved.newWrites[0].path === 'services/svc1',
    JSON.stringify(saved.newWrites.map(w => w.path)));
const patch = (saved.newWrites[0] || {}).patch || {};
ok('jina jipya limehifadhiwa', patch.title === 'Umeme wa Nyumbani (Imeboreshwa)', String(patch.title));
ok('bei mpya imehifadhiwa', String(patch.price) === '65000', String(patch.price));
ok('hakuna hati mpya (addDoc 0)', saved.newAdds.length === 0, String(saved.newAdds.length));
ok('idadi ya hati za huduma haijabadilika (1)', saved.svcCount === 1 && saved.keys.join(',') === 'services/svc1', saved.keys.join(','));
ok('status haipo kwenye patch', !('status' in patch), JSON.stringify(Object.keys(patch)));
ok('publicationStatus haipo kwenye patch', !('publicationStatus' in patch), JSON.stringify(Object.keys(patch)));
ok('userId/createdAt/id hazipo kwenye patch', !('userId' in patch) && !('createdAt' in patch) && !('id' in patch));
ok('hali ya hati ni draft bado', saved.doc.publicationStatus === 'draft' && saved.doc.status === 'draft',
    JSON.stringify({ p: saved.doc.publicationStatus, s: saved.doc.status }));
ok('umiliki haujabadilika', saved.doc.userId === 'u1' && saved.doc.createdAt === seed.createdAt);
ok('hali ya uhariri imefutwa baada ya kuhifadhi', saved.editStateId === null, String(saved.editStateId));

/* 5) Hakuna ReferenceError / missing-function */
console.log('\n§4 Hakuna hitilafu za runtime zinazohusiana na uhariri');
const relevant = pageErrors.filter(e => /serviceEdit|serviceEligible|serviceSubmitGate|validateServiceUpdate|buildServiceUpdate|serviceUpdateErrorText|is not defined|not a function/i.test(e));
ok('hakuna ReferenceError/missing-function ya huduma', relevant.length === 0, JSON.stringify(relevant.slice(0, 4)));
console.log('  (pageerror jumla: ' + pageErrors.length + ', console errors: ' + consoleErrors.length + ')');
if (pageErrors.length) console.log('  pageerrors: ' + JSON.stringify(pageErrors.slice(0, 3)));
if (consoleErrors.length) console.log('  console errors: ' + JSON.stringify(consoleErrors.slice(0, 5)));
if (http404.length) console.log('  404 za ndani (rasilimali, hazihusiani na huduma): ' + JSON.stringify(Array.from(new Set(http404)).slice(0, 8)));
ok('hakuna 404 ya moduli ya js/app', http404.every(u => !/\/js\/app\//.test(u)), JSON.stringify(http404.slice(0, 5)));

/* 6) Ulinzi wa umiliki kwenye runtime halisi */
console.log('\n§5 Runtime: mmiliki mwingine hawezi kuhariri');
const foreign = await page.evaluate(async () => {
    const st = globalThis.__FBSTUB__;
    st.store.set('services/svc2', Object.assign({}, st.store.get('services/svc1'), { id: 'svc2', userId: 'u2', title: 'Huduma ya Mtu Mwingine' }));
    const alerts = [];
    const orig = window.alert; window.alert = m => alerts.push(String(m));
    const w0 = st.writes.length;
    await window.skhServiceEditOpen('svc2');
    window.alert = orig;
    return { alerts, newWrites: st.writes.length - w0, editStateId: (window.__skhServiceEditState || {}).id, titleInForm: (document.getElementById('servHubTitle') || {}).value };
});
ok('taarifa «si yako»', foreign.alerts.some(a => /si yaka|si yako/.test(a)), JSON.stringify(foreign.alerts));
ok('hakuna write', foreign.newWrites === 0, String(foreign.newWrites));
ok('hali ya uhariri haijabadilishwa kwenda hati ya mtu mwingine', foreign.editStateId !== 'svc2', String(foreign.editStateId));

/* 7) Njia halisi ya mtumiaji: orodha ya Huduma Zangu → kitufe cha Hariri */
console.log('\n§6 Njia halisi: orodha ya «Huduma Zangu» → kubonyeza kitufe cha Hariri');
const clickPath = await page.evaluate(async () => {
    if (window.skhServiceEditCancel) window.skhServiceEditCancel();
    let area = document.getElementById('providerWorkspace');
    if (!area) { area = document.createElement('div'); area.id = 'providerWorkspace'; document.body.appendChild(area); }
    await window.loadHubDetailedMyServices();
    const btns = Array.from(area.querySelectorAll('button'));
    const hariri = btns.filter(b => /^\s*Hariri\s*$/.test(b.textContent));
    const hasAngalia = btns.some(b => /Angalia/.test(b.textContent));
    if (!hariri.length) return { rendered: btns.map(b => b.textContent.trim()), noButton: true };
    hariri[0].click();                       // inline onclick → window.skhServiceEditOpen(id)
    for (let i = 0; i < 120; i++) {
        if ((window.__skhServiceEditState || {}).id) break;
        await new Promise(r => setTimeout(r, 25));
    }
    return { count: hariri.length, hasAngalia,
             editId: (window.__skhServiceEditState || {}).id,
             title: (document.getElementById('servHubTitle') || {}).value,
             formOpen: (document.getElementById('serviceForm') || {}).style.display };
});
ok('kitufe cha Hariri kimechorwa kwenye orodha', !clickPath.noButton && clickPath.count >= 1, JSON.stringify(clickPath.rendered || clickPath.count));
ok('kubonyeza Hariri kunafungua fomu ya hati hiyo', clickPath.editId === 'svc1' && clickPath.formOpen === 'block', JSON.stringify({ id: clickPath.editId, form: clickPath.formOpen }));
ok('data imejazwa baada ya kubonyeza kitufe', clickPath.title === 'Umeme wa Nyumbani (Imeboreshwa)', String(clickPath.title));

await browser.close();
server.close();

console.log(`\nMATOKEO (Chromium halisi): ${passed} passed, ${failed} failed`);
if (failed) { console.log('Zilizoshindwa:'); failures.forEach(f => console.log(' - ' + f)); }
process.exit(failed ? 1 : 0);

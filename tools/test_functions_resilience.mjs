/* ============================================================
 * SOKOHAI â€” Jaribio la SAFU YA KATI YA CLOUD FUNCTIONS (jsdom).
 * Huthibitisha:
 *  - makosa ya miundombinu (function haijapelekwa â†’ not-found/INTERNAL,
 *    unavailable, deadline, network) yatambuliwe kama fnDown;
 *  - makosa HALISI ya biashara (permission-denied, invalid-argument,
 *    unauthenticated) yASICHANGANYWE na "server haipo";
 *  - wrapCallable hupitisha majibu vizuri na huweka alama + ujumbe wa
 *    Kiswahili usio na neno "INTERNAL" kwenye kosa la server kutokuwepo;
 *  - code na ujumbe asili HABAKI kubadilika (fallback zilizopo ziendelee).
 * Endesha: node tools/test_functions_resilience.mjs
 * Inahitaji: npm i --no-save jsdom
 * ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'dangerously' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
globalThis.CustomEvent = window.CustomEvent;

// Tabia za callables za majaribio (jina â†’ () => Promise).
const behaviors = {};
globalThis.__fnBehaviors = behaviors;

function firebaseStub() {
    // Chombo kinachorudisha function inayoweza kuitwa/kupigwa 'new'.
    const any = function () { return undefined; };
    return new Proxy(any, {
        get(target, prop) {
            if (prop === 'then') return undefined; // isiwe Promise
            if (prop === 'httpsCallable') {
                return (_app, name) => (data) => {
                    const b = behaviors[name];
                    if (!b) return Promise.resolve({ data: {} });
                    try {
                        const r = b(data);
                        return Promise.resolve(r);
                    } catch (e) {
                        return Promise.reject(e);
                    }
                };
            }
            return function () { return {}; };
        },
        construct(target, args) { return {}; }
    });
}

// Badilisha import 4 za gstatic kwa stub zinazotoa kila jina lililoingizwa.
let src = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf8');
const names = new Set();
src.replace(/^import\s*\{([^}]*)\}\s*from\s*"https:\/\/[^"]+";\s*$/gm, (m, inner) => {
    inner.split(',').forEach(function (n) { n = n.trim(); if (n) names.add(n); });
    return '';
});
const declMap = {};
[...names].forEach(function (n) {
    if (n === 'GoogleAuthProvider') declMap[n] = 'class GoogleAuthProvider { constructor(){ this.providerId="google.com"; } }';
    else if (/^[A-Z]/.test(n)) declMap[n] = 'class ' + n + ' {}';
    else declMap[n] = 'function ' + n + '() { return {}; }';
});
// httpsCallable iwe na tabia ya majaribio (registry ya globalThis.__fnBehaviors).
declMap.httpsCallable = 'function httpsCallable(_app, name) { return function (data) { var b = globalThis.__fnBehaviors[name]; if (!b) return Promise.resolve({ data: {} }); try { return Promise.resolve(b(data)); } catch (e) { return Promise.reject(e); } }; }';
const decls = Object.keys(declMap).map(function (k) { return declMap[k]; });
src = src.replace(/^import[\s\S]*?firebase-functions\.js";\s*$/m, decls.join('\n') + '\n');

const tmp = path.join(ROOT, 'js', 'app', '_tmp_bootstrap.mjs');
fs.writeFileSync(tmp, src);
let skh;
try {
    ({ skh } = await import(pathToFileURL(tmp).href));
} finally {
    fs.unlinkSync(tmp);
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  âœ… ' + n); } else { fail++; console.log('  âŒ ' + n); } };

function fnErr(code, message, details) {
    const e = new Error(message || code);
    e.code = code;
    if (details) e.details = details;
    return e;
}

console.log('\n[1] KUTAMBUA KOSA LA MIUNDOMBINU (server haipo)');
ok('functions/not-found â†’ fnDown', skh.isFunctionsDownError(fnErr('functions/not-found', 'NOT_FOUND')) === true);
ok('functions/internal + ujumbe INTERNAL â†’ fnDown', skh.isFunctionsDownError(fnErr('functions/internal', 'internal')) === true);
ok('functions/unavailable â†’ fnDown', skh.isFunctionsDownError(fnErr('functions/unavailable', 'Service unavailable.')) === true);
ok('functions/deadline-exceeded â†’ fnDown', skh.isFunctionsDownError(fnErr('functions/deadline-exceeded', 'deadline')) === true);
ok('bare internal code â†’ fnDown', skh.isFunctionsDownError(fnErr('internal', 'internal')) === true);
ok('Failed to fetch â†’ fnDown', skh.isFunctionsDownError(new Error('Failed to fetch')) === true);

console.log('\n[2] MAKOSA HALISI HAYACHANGANYWI NA SERVER KUTOSEMA');
ok('permission-denied SI fnDown', skh.isFunctionsDownError(fnErr('functions/permission-denied', 'Hauruhusiwi.')) === false);
ok('invalid-argument SI fnDown', skh.isFunctionsDownError(fnErr('functions/invalid-argument', 'Bei ni ndogo mno.')) === false);
ok('unauthenticated SI fnDown', skh.isFunctionsDownError(fnErr('functions/unauthenticated', 'Ingia kwanza.')) === false);
ok('failed-precondition SI fnDown', skh.isFunctionsDownError(fnErr('functions/failed-precondition', 'Hatua si sahihi.')) === false);

console.log('\n[3] UJUMBE WA MTUMIAJI â€” hakuna INTERNAL mbichi');
const downErr = fnErr('functions/not-found', 'NOT_FOUND');
const wrapped = skh.normalizeFnError('pesapalCheckout', downErr);
ok('umepigwa chapa fnDown', wrapped.fnDown === true);
ok('una friendlyMessage', typeof wrapped.friendlyMessage === 'string' && /malipo/i.test(wrapped.friendlyMessage));
ok('skhFnErrText haina neno INTERNAL', !/internal/i.test(window.skhFnErrText(downErr, 'pesapalCheckout')));
ok('ujumbe asili (code) umehifadhiwa kwa fallback', downErr.code === 'functions/not-found');
const realErr = fnErr('functions/invalid-argument', 'Bei ni ndogo mno.');
ok('kosa halali hurudisha ujumbe halisi', window.skhFnErrText(realErr).indexOf('Bei ni ndogo mno') !== -1);
ok('kosa halali halina chapa fnDown', realErr.fnDown !== true);

console.log('\n[4] wrapCallable â€” mtiririko wa mafanikio na kushindwa');
{
    // Mazingira safi: kizingiti kisiathiriwe na miito ya muda wa kupakia.
    skh.functionsDown = false;
    skh.functionsDownSince = 0;
    let echoCalls = 0;
    behaviors.echoOk = () => { echoCalls++; return { data: { ok: true, value: 7 } }; };
    const call = skh.wrapCallable('echoOk');
    const r = await call({ x: 1 });
    ok('jibu la mafanikio linapita', r.data.value === 7);
    delete behaviors.echoOk;

    behaviors.pesapalCheckout = () => { throw fnErr('functions/internal', 'internal'); };
    let caught = null;
    try { await skh.wrapCallable('pesapalCheckout')({}); } catch (e) { caught = e; }
    ok('kosa la chini linapitishwa (lazima fallback ifanye kazi)', !!caught && caught.fnDown === true);
    ok('bendela la kimataifa limewashwa', skh.functionsDown === true);
    delete behaviors.pesapalCheckout;

    // Kosa halali la kibisharau lisiweke bendela.
    skh.functionsDown = false;
    behaviors.deliveryAccept = () => { throw fnErr('functions/permission-denied', 'Hauruhusiwi.'); };
    let caught2 = null;
    try { await skh.wrapCallable('deliveryAccept')({}); } catch (e) { caught2 = e; }
    ok('permission-denied linapita bila chapa', caught2 && caught2.fnDown !== true);
    ok('bendela HALIWASHWI na kosa halali', skh.functionsDown === false);
    delete behaviors.deliveryAccept;
}

console.log('\n[5] CIRCUIT BREAKER â€” hakuna mtandao wakati wa cooldown, hujifungua baada ya mafanikio');
{
    skh.functionsDown = false;
    skh.functionsDownSince = 0;
    let downCalls = 0;
    behaviors.flakyFn = () => { downCalls++; throw fnErr('functions/internal', 'internal'); };
    const flaky = skh.wrapCallable('flakyFn');
    let c1 = null;
    try { await flaky({}); } catch (e) { c1 = e; }
    ok('mwito wa kwanza uligusa server na kushindwa', !!c1 && c1.fnDown === true && downCalls === 1);
    let c2 = null;
    try { await flaky({}); } catch (e) { c2 = e; }
    ok('mwito wa pili HAUGUSI mtandao (cooldown)', downCalls === 1);
    ok('mwito wa pili unarudisha kosa la down mara moja', !!c2 && c2.fnDown === true && c2.code === 'functions/unavailable');

    // Cooldown ikipita, jaribu tena â€” ikifanikiwa kizingiti hufunguka.
    skh.functionsDownSince = Date.now() - 31000;
    delete behaviors.flakyFn;
    let recoverCalls = 0;
    behaviors.flakyFn = () => { recoverCalls++; return { data: { ok: 1 } }; };
    const r = await flaky({});
    ok('baada ya cooldown hujaribu server tena', recoverCalls === 1 && downCalls === 1);
    ok('mafanalikio hufungua kizingiti', skh.functionsDown === false && r.data.ok === 1);
    delete behaviors.flakyFn;
}

console.log('\n==================================================');
console.log(`FUNCTIONS RESILIENCE: ${pass} zimepita, ${fail} zimeshindwa`);
if (fail) process.exit(1);
console.log('âœ… CLOUD FUNCTIONS ZIKISHINDWA, MTUMIAJI HAONI "INTERNAL" NA FALLBACK ZAENDELEA');



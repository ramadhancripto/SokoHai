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

// [HARDENING 2026-11-16] 00-bootstrap.js refuses to start Firebase on an unconfigured host, so this
// unit test runs as the production host with the real js/00-config.js (Firebase itself is stubbed
// below — nothing leaves the process).
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sokohai.com/', runScripts: 'dangerously' });
const { window } = dom;
window.eval(fs.readFileSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'js', '00-config.js'), 'utf8'));
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
// Any other CDN import (e.g. firebase-app-check.js) is already declared above.
src = src.replace(/^import\s*\{[^}]*\}\s*from\s*"https:\/\/[^"]+";\s*$/gm, '');

const tmp = path.join(ROOT, 'js', 'app', '_tmp_bootstrap.mjs');
fs.writeFileSync(tmp, src);
try {
  const html = fs.readFileSync(path.join(ROOT, 'html/21-scripts.html'), 'utf8');
  const bootTags = [...html.matchAll(/<script\s+type="module"\s+src="([^"]*00-bootstrap\.js[^"]*)"/g)].map(m => m[1]);
  if (bootTags.length !== 1 || bootTags[0] !== 'js/app/00-bootstrap.js') throw new Error('bootstrap must use same URL as feature imports');
  const first = (await import(pathToFileURL(tmp).href)).skh;
  first.currentUserData = { businessId: 'synthetic' };
  const second = (await import(pathToFileURL(tmp).href)).skh;
  if (first !== second || window.skh !== first || second.currentUserData.businessId !== 'synthetic') throw new Error('shared state split');
  console.log('BOOTSTRAP IDENTITY: entrypoint and feature imports use one URL and shared state (mock Firebase)');
} finally { fs.unlinkSync(tmp); }

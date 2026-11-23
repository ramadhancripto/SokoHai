#!/usr/bin/env node
/* [I18N 2026-11-23] Language preference follows the account (emulator, no Cloud Functions):
 *  1. a signed-in user switches to English -> users/{uid}.language = 'en' (owner write allowed by the existing rules)
 *  2. a second device (fresh browser, device preference Swahili) signs in as the same user -> opens in English
 *  3. a guest keeps the device preference and nothing is written
 * Needs: emulator (auth 9099, firestore 8085) + node functions/local-server.js --static (5055). */
import { chromium } from 'playwright'; import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict';
const SDK = (process.env.SKH_FIREBASE_SDK_DIR || '').replace(/\/?$/, '/');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9', EM = 'sync-' + T + '@example.test';
const su = await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EM, password: PW, returnSecureToken: true }) })).json();
const b = await chromium.launch();
async function page(lang) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  if (SDK !== '/') await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(SDK + r.request().url().split('/').pop()) }));
  await ctx.route(/res\.cloudinary\.com|nominatim/, r => r.abort());
  const p = await ctx.newPage(); p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.addInitScript((l) => { try { localStorage.setItem('skh_welcomed_v1', '1'); localStorage.setItem('sokohai_language', l); } catch (e) {} }, lang);
  await p.goto('http://127.0.0.1:5055/'); await p.waitForFunction(() => window.skh && window.skh.__authResolved && window.SokoHaiLMS, null, { timeout: 45000 });
  return p;
}
const signIn = (p) => p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: EM, pw: PW });
const docLang = (p) => p.evaluate(async (uid) => { const s = await window.skh.getDoc(window.skh.doc(window.skh.db, 'users', uid)); return s.exists() ? (s.data() || {}).language || null : 'NO_DOC'; }, su.localId);

const g = await page('sw');
await g.evaluate(() => window.skhSetLang('en')); await g.waitForTimeout(800);
ok(await g.evaluate(() => window.SokoHaiLMS.lang) === 'en' && !(await g.evaluate(() => window.skh.currentUser)), 'guest: the choice applies on the device and needs no account');

const a = await page('sw'); await signIn(a); await a.waitForTimeout(1500);
// the user document normally exists after sign-up; create a minimal own profile if the app has not yet
await a.evaluate(async (uid) => { const r = window.skh.doc(window.skh.db, 'users', uid); const s = await window.skh.getDoc(r); if (!s.exists()) await window.skh.setDoc(r, { uid, name: 'Sync test' }); }, su.localId);
await a.evaluate(() => window.skhSetLang('en')); await a.waitForTimeout(1500);
ok(await docLang(a) === 'en', 'signed-in switch to English is saved to the account (users/{uid}.language = en)');

const c = await page('sw'); ok(await c.evaluate(() => window.SokoHaiLMS.lang) === 'sw', 'second device starts with its own device preference (Swahili) before sign-in');
await signIn(c); await c.waitForFunction(() => window.SokoHaiLMS.lang === 'en', null, { timeout: 15000 }).catch(() => {});
ok(await c.evaluate(() => window.SokoHaiLMS.lang) === 'en' && await c.evaluate(() => localStorage.getItem('sokohai_language')) === 'en', 'after sign-in the second device follows the account (English) and keeps it as its device fallback');
await c.evaluate(() => window.skhSetLang('sw')); await c.waitForTimeout(1500);
ok(await docLang(c) === 'sw', 'switching back on the second device updates the account (sw)');
await b.close();
console.log(`\nLANGUAGE ACCOUNT SYNC (browser + emulator): ${n} passed, 0 failed`);

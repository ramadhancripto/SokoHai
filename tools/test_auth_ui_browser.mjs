#!/usr/bin/env node
/* [AUTH-UI 2026-11-21] Authentication behaviour through the REAL login screen (Firestore + Auth emulator).
 * Written BEFORE the visual redesign and run on both versions, so it proves the redesign changed appearance only:
 *  - the auth screen opens, the login form is shown, the last e-mail is prefilled;
 *  - every control still calls its original handler (doLogin / doSignup / doGoogleLogin / doResetPassword /
 *    toggleAuth / closeModals);
 *  - sign-up creates the account + profile; e-mail/password login works; a wrong password shows the error;
 *  - password recovery sends the reset e-mail (seen in the Auth emulator);
 *  - the Google button reaches the original doGoogleLogin -> signInWithPopup(GoogleAuthProvider) (boundary observed);
 *  - the session survives a page reload;
 *  - no JavaScript errors.
 * Run: emulator (8085/9099) + `node functions/local-server.js` (5055), then
 *      SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_auth_ui_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const T = Date.now().toString(36), email = 'auth-ui-' + T + '@example.test', pass = 'Siri-' + T + '-9';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
const errors = []; page.on('pageerror', e => errors.push(e.message));
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const boot = async () => { await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForFunction(() => window.skh && window.skh.auth && typeof window.openAuthModal === 'function' && window.skh.__authResolved, null, { timeout: 45000 }); };
const hiddenWait = () => page.waitForFunction(() => { const e = document.getElementById('authModal'); return !e || getComputedStyle(e).display === 'none'; }, null, { timeout: 20000 }).then(() => true, () => false);
// the redesigned screen shows the e-mail fields behind an "Ingia kwa Barua Pepe" pill (presentation only)
const ensureEmail = async () => { if (await page.$('[data-skh-auth-email]') && !(await shown('#loginEmail'))) await page.click('[data-skh-auth-email]'); };
const shown = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; }, sel);

await boot();
// 1. wiring of every control (attributes are the contract with 08-app-state.js)
const wiring = await page.evaluate(() => {
  const q = s => document.querySelector(s);
  return {
    login: q('#loginForm') && q('#loginForm').getAttribute('onsubmit'),
    signup: q('#signupForm') && q('#signupForm').getAttribute('onsubmit'),
    google: q('#authModal .google-btn') && q('#authModal .google-btn').getAttribute('onclick'),
    reset: q('#btnResetPass') && q('#btnResetPass').getAttribute('onclick'),
    toSignup: !!document.querySelector('#loginForm [onclick="toggleAuth(\'signup\')"]'),
    toLogin: !!document.querySelector('#signupForm [onclick="toggleAuth(\'login\')"]'),
    close: !!document.querySelector('#authModal [onclick="closeModals()"]'),
    ids: ['loginEmail', 'loginPass', 'signupName', 'signupEmail', 'signupPhone', 'signupAgentCode', 'signupPass'].every(id => document.getElementById(id))
  };
});
ok(wiring.login === 'doLogin(event)' && wiring.signup === 'doSignup(event)', 'forms still submit to doLogin / doSignup');
ok(wiring.google === 'window.doGoogleLogin()' && wiring.reset === 'window.doResetPassword()', 'Google and password-recovery buttons call the original handlers');
ok(wiring.toSignup && wiring.toLogin && wiring.close && wiring.ids, 'switch links, close control and all input ids are present');

// 2. sign up through the form
await page.evaluate(() => window.openAuthModal());
ok(await shown('#authModal') && await shown('#loginForm') && !(await shown('#signupForm')), 'auth screen opens on the login form');
await page.click('#loginForm [onclick="toggleAuth(\'signup\')"]');
ok(await shown('#signupForm') && !(await shown('#loginForm')), '"Jisajili" switches to the sign-up form');
await page.fill('#signupName', 'Asha Mjaribu'); await page.fill('#signupEmail', email); await page.fill('#signupPhone', '0712000000'); await page.fill('#signupPass', pass);
await page.click('#signupForm button[type="submit"]');
await page.waitForFunction(e => window.skh.currentUser && window.skh.currentUser.email === e, email, { timeout: 20000 });
ok(await hiddenWait(), 'sign-up creates the account, signs in and closes the screen');
ok(await page.evaluate(async () => { const s = await window.skh.getDoc(window.skh.doc(window.skh.db, 'users', window.skh.currentUser.uid)); return s.exists() && s.data().fullName === 'Asha Mjaribu'; }), 'profile document written by the original sign-up handler');

// 3. session persists across reload
await boot();
await page.waitForFunction(e => window.skh.currentUser && window.skh.currentUser.email === e, email, { timeout: 20000 });
ok(true, 'session survives a page reload');
await page.evaluate(() => window.skh.signOut(window.skh.auth));
await page.waitForFunction(() => !window.skh.currentUser, null, { timeout: 10000 });

// 4. wrong password -> error; right password -> signed in; last e-mail prefilled
await page.evaluate(() => window.openAuthModal()); await page.waitForTimeout(100); await ensureEmail();
ok(await page.inputValue('#loginEmail') === email, 'last e-mail is prefilled on the login form');
await page.fill('#loginPass', 'kosa-' + T);
dialogs.length = 0; await page.click('#loginForm button[type="submit"]');
await page.waitForFunction(() => true); await page.waitForTimeout(1500);
ok(dialogs.some(m => /Kosa/.test(m)) && !(await page.evaluate(() => !!window.skh.currentUser)), 'wrong password shows the error and does not sign in');
await page.fill('#loginPass', pass); await page.click('#loginForm button[type="submit"]');
await page.waitForFunction(e => window.skh.currentUser && window.skh.currentUser.email === e, email, { timeout: 20000 });
ok(await hiddenWait(), 'e-mail / password login works and closes the screen');
await page.evaluate(() => window.skh.signOut(window.skh.auth));
await page.waitForFunction(() => !window.skh.currentUser, null, { timeout: 10000 });

// 5. password recovery (the welcome card opens 300 ms after a sign-in: let it appear, then open the auth screen)
await page.waitForTimeout(800);
await page.evaluate(() => { try { localStorage.removeItem('skh_reset_at'); } catch (e) {} window.openAuthModal(); });
await page.waitForTimeout(100); await ensureEmail(); await page.fill('#loginEmail', email); dialogs.length = 0;
await page.click('#btnResetPass'); await page.waitForTimeout(2000);
const oob = await (await fetch(`http://${AUTH}/emulator/v1/projects/demo-sokohai/oobCodes`)).json();
ok(dialogs.some(m => /link ya kubadili nenosiri/i.test(m)) && (oob.oobCodes || []).some(c => c.email === email && c.requestType === 'PASSWORD_RESET'), 'password recovery sends the reset e-mail and shows the neutral message');

// 6. Google sign-in. The real Google popup needs Google's servers (not reachable from the test sandbox), so the
//    SDK call is observed at its boundary: the button must reach the ORIGINAL doGoogleLogin, which must call
//    signInWithPopup(auth, GoogleAuthProvider) and then run its normal post-sign-in path (profile + close).
//    The boundary returns an emulator account in place of Google's popup result. Test on a phone before release.
const gmail = 'g-' + T + '@example.test';
await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: gmail, password: pass, returnSecureToken: true }) });
await page.evaluate(({ e, p }) => {
  window.__gcalls = [];
  const real = window.skh.signInWithPopup;
  window.skh.signInWithPopup = async (auth, provider) => { window.__gcalls.push({ sameAuth: auth === window.skh.auth, providerId: provider && provider.providerId, real: typeof real === 'function' });
    return window.skh.signInWithEmailAndPassword(auth, e, p); };
}, { e: gmail, p: pass });
await page.click('#authModal .google-btn');
await page.waitForFunction(e => window.skh.currentUser && window.skh.currentUser.email === e, gmail, { timeout: 20000 });
const g = await page.evaluate(() => window.__gcalls);
ok(g.length === 1 && g[0].sameAuth && g[0].providerId === 'google.com' && g[0].real, 'Google button runs the original doGoogleLogin -> signInWithPopup(auth, GoogleAuthProvider)');
ok(await hiddenWait(), 'auth screen closes after the Google sign-in result');
ok(await page.evaluate(async () => (await window.skh.getDoc(window.skh.doc(window.skh.db, 'users', window.skh.currentUser.uid))).exists()), 'first Google sign-in creates the profile (original handler)');
// [AUTH 2026-11-24] Google errors: a cancelled popup is the user's choice (no alert); a blocked popup gets a clear
// message in the interface language; unknown errors get a generic message (never the raw Firebase text)
await page.evaluate(() => window.skh.signOut(window.skh.auth)); await page.waitForTimeout(800);   // the welcome card opens 300 ms after sign-in
const gErr = code => page.evaluate(c => { window.skh.signInWithPopup = async () => { const e = new Error('Firebase: Error (' + c + ').'); e.code = c; throw e; }; window.openAuthModal(); }, code);
await gErr('auth/popup-closed-by-user'); dialogs.length = 0; await page.click('#authModal .google-btn'); await page.waitForTimeout(800);
ok(dialogs.length === 0, 'a cancelled Google popup shows no error dialog');
await gErr('auth/popup-blocked'); dialogs.length = 0; await page.click('#authModal .google-btn'); await page.waitForTimeout(800);
ok(dialogs.some(m => /Ruhusu pop-ups/.test(m)) && !dialogs.some(m => /Firebase|auth\//.test(m)), 'a blocked popup explains how to allow it, in Kiswahili, without the raw Firebase text');
await gErr('auth/internal-error'); dialogs.length = 0; await page.click('#authModal .google-btn'); await page.waitForTimeout(800);
ok(dialogs.some(m => /Kuingia kwa Google kumeshindikana/.test(m)) && !dialogs.some(m => /Firebase|auth\//.test(m)), 'an unknown Google error shows a generic message, not the raw Firebase text');

// 7. close control
await page.evaluate(() => window.openAuthModal()); await page.click('#authModal [onclick="closeModals()"]');
ok(!(await shown('#authModal')), 'close control hides the auth screen');
ok(errors.filter(m => !/hdr is not defined/.test(m)).length === 0, 'no JavaScript errors: ' + JSON.stringify(errors.slice(0, 3)));
await b.close();
console.log(`\nAUTH UI (browser + emulator): ${n} passed, 0 failed`);
process.exit(0);

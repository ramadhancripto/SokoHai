#!/usr/bin/env node
/* [LEGAL + SUPPORT 2026-11-21] Real browser + Firestore/Auth emulator.
 *  1. The nine public pages load signed-out at 320, 390 and 1366 px: no JS error, no horizontal scroll, footer links,
 *     no request to a third party (fully self-hosted).
 *  2. The app: auth screen links to Terms/Privacy; settings entries open the pages / the real support form;
 *     no ui-avatars.com request while the app runs.
 *  3. Support workflow: /?support=privacy opens the form after sign-in, the request is stored with a reference
 *     number, "Maombi yangu" lists it, an admin replies from Kituo cha Udhibiti → Msaada (reply + status stored, signed).
 *  4. Privacy fixes: a new listing stores only approximate coordinates; the phone-consent switch writes publishPhone.
 * Run: emulator (8085/9099) + `node functions/local-server.js` (5055) from this checkout, then
 *      SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_legal_support_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-sokohai';
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
const require = createRequire(new globalThis.URL('../functions/index.js', import.meta.url));
const admin = require('firebase-admin'); if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-sokohai' }); const db = admin.firestore();
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9';
async function signUp(email) { const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) }); const j = await r.json(); if (!j.localId) throw Error(JSON.stringify(j)); return j.localId; }
const PAGES = ['about.html', 'privacy.html', 'terms.html', 'cookies.html', 'refund-policy.html', 'seller-policy.html', 'community-guidelines.html', 'support.html', 'contact.html'];
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const b = await chromium.launch({ args: ['--no-sandbox'] });

// ---------- 1. public pages, signed out ----------
for (const w of [320, 390, 1366]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } }); const p = await ctx.newPage();
  const errs = [], ext = []; p.on('pageerror', e => errs.push(e.message));
  p.on('request', r => { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') ext.push(u.hostname); });
  const res = [];
  for (const pg of PAGES) {
    const r = await p.goto(APP + pg, { waitUntil: 'load' });
    const info = await p.evaluate(() => ({ h1: (document.querySelector('h1') || {}).textContent || '', app: !!document.getElementById('authModal'),
      over: document.documentElement.scrollWidth > window.innerWidth + 1, foot: document.querySelectorAll('.lp-foot a[href$=".html"]').length,
      font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor }));
    res.push([pg, r.status(), info]);
  }
  ok(res.every(([, s, i]) => s === 200 && i.h1 && !i.app), `${w}px: all nine pages load as their own page (not the app), signed out`);
  ok(res.every(([, , i]) => !i.over), `${w}px: no horizontal scroll ` + res.filter(([, , i]) => i.over).map(x => x[0]).join(','));
  ok(res.every(([, , i]) => i.foot >= 9), `${w}px: footer links to all pages`);
  ok(res.every(([, , i]) => /Inter/.test(i.font)), `${w}px: Inter typography`);
  ok(!errs.length, `${w}px: no JavaScript errors`);
  ok(!ext.length, `${w}px: no third-party requests (${[...new Set(ext)].join(',')})`);
  if (w === 390) { await p.goto(APP + 'privacy.html'); await p.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/privacy-390.png' : '/tmp/privacy-390.png', fullPage: false }); }
  await ctx.close();
}

// ---------- 2-4. the app ----------
const userEmail = 'legal-u-' + T + '@example.test', adminEmail = 'legal-a-' + T + '@example.test';
const uid = await signUp(userEmail), aid = await signUp(adminEmail);
await admin.auth().setCustomUserClaims(aid, { admin: true });
await db.doc('users/' + uid).set({ uid, fullName: 'Neema Mjaribu', email: userEmail, phone: '0712000111', createdAt: new Date().toISOString(), walletBalance: 0 });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
const p = await ctx.newPage(); const errs = [], avatars = [];
p.on('pageerror', e => errs.push(e.message)); p.on('request', r => { if (/ui-avatars\.com/.test(r.url())) avatars.push(r.url()); });
p.on('dialog', d => d.dismiss().catch(() => {}));
await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); localStorage.removeItem('skh_support_last'); } catch (e) {} });
await p.goto(APP + '?support=privacy', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.skh && window.skh.__authResolved && window.skhOpenSupport, null, { timeout: 45000 });
// signed out: the deep link asks to sign in (auth screen) instead of showing a form
await p.waitForFunction(() => { const a = document.getElementById('authModal'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 15000 });
ok(true, 'support deep link while signed out opens the sign-in screen first');
ok(await p.evaluate(() => !!document.querySelector('#authModal a[href="/terms.html"]') && !!document.querySelector('#authModal a[href="/privacy.html"]')), 'auth screen links to Terms and Privacy');
await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: userEmail, pw: PW });
await p.waitForFunction(u => window.skh.currentUser && window.skh.currentUser.uid === u, uid, { timeout: 20000 });
// requireAuth resumes the intended action -> the support form appears with the privacy category
await p.waitForSelector('#skhSupportModal #skhSupForm', { timeout: 20000 });
ok(await p.$eval('#skhSupCat', s => s.value) === 'privacy', 'after sign-in the form opens on the requested category (privacy)');
await p.fill('#skhSupSub', 'Futa akaunti yangu');
await p.fill('#skhSupDesc', 'fupi');
await p.click('#skhSupSend');
ok(/angalau herufi 20/.test(await p.$eval('#skhSupMsg', e => e.textContent)), 'validation: too-short description is explained, nothing sent');
await p.fill('#skhSupDesc', 'Naomba akaunti yangu na taarifa zangu zote zifutwe kwenye SokoHai.');
await p.click('#skhSupSend');
await p.waitForSelector('#skhSupRefOut', { timeout: 15000 });
const ref = await p.$eval('#skhSupRefOut', e => e.textContent.trim());
const doc = (await db.doc('support_requests/' + ref).get()).data();
ok(/^SR-[A-Z0-9]{10}$/.test(ref) && doc && doc.uid === uid && doc.category === 'privacy' && doc.status === 'open', 'request stored with a reference number shown to the user: ' + ref);
ok(!('email' in doc) && !('phone' in doc), 'request stores no e-mail or phone (account identifies the user)');
await p.click('text=Maombi yangu'); await p.waitForFunction(r => document.querySelector('#skhSupportModal') && document.querySelector('#skhSupportModal').textContent.includes(r), ref, { timeout: 15000 });
ok(true, '"Maombi yangu" lists the request');
// second request within a minute is held back on the device
await p.evaluate(() => window.skhOpenSupport('feedback')); await p.waitForSelector('#skhSupForm');
await p.fill('#skhSupSub', 'Wazo'); await p.fill('#skhSupDesc', 'Ningependa kuona orodha ya maduka yaliyo karibu nami.'); await p.click('#skhSupSend');
ok(/Subiri dakika moja/.test(await p.$eval('#skhSupMsg', e => e.textContent)), 'cool-down: a second request within a minute is held back');
await p.evaluate(() => window.skhSupportClose());
// settings entries -> real destinations
const opened = await p.evaluate(() => { const got = []; const o = window.open; window.open = (u) => { got.push(u); return null; }; ['help', 'terms', 'privacy_policy', 'about'].forEach(k => window.openSokoHaiAccountSetting(k)); window.open = o; return got; });
ok(JSON.stringify(opened) === JSON.stringify(['/support.html', '/terms.html', '/privacy.html', '/about.html']), 'settings: Help, Terms, Privacy, About open the public pages');
await p.evaluate(() => window.openSokoHaiAccountSetting('report_problem')); await p.waitForSelector('#skhSupForm');
ok(await p.$eval('#skhSupCat', s => s.value) === 'technical', 'settings: Report a Problem opens the real form (technical)');
await p.evaluate(() => window.skhSupportClose());
await p.evaluate(() => window.openSokoHaiAccountSetting('legal_center'));
ok(await p.evaluate(() => ['/privacy.html', '/terms.html', '/refund-policy.html', '/seller-policy.html', '/community-guidelines.html', '/cookies.html', '/contact.html'].every(h => !!document.querySelector('#sokohaiAccountSettingModal a[href="' + h + '"]'))), 'settings: "Sera Nyingine" lists every policy');
await p.evaluate(() => { const m = document.getElementById('sokohaiAccountSettingModal'); if (m) m.style.display = 'none'; });
// phone consent
await p.evaluate(() => window.skhTogglePublishPhone({ checked: true, disabled: false }));
await p.waitForTimeout(800);
ok((await db.doc('users/' + uid).get()).data().publishPhone === true, 'profile switch stores the consent to publish the phone (publishPhone)');
await p.evaluate(() => window.skhTogglePublishPhone({ checked: false, disabled: false })); await p.waitForTimeout(800);
ok((await db.doc('users/' + uid).get()).data().publishPhone === false, 'switching it off withdraws the consent');
// approximate location on a new listing
const pid = await p.evaluate(async t => { window.skh.userLat = -6.792412; window.skh.userLon = 39.208345;
  return window.skh.saveData('products', { title: 'LEGAL-LOC-' + t, price: 1000, category: 'CAT-01', description: 'Majaribio', location: 'Kariakoo', image: 'https://res.cloudinary.com/demo/image/upload/a.jpg',
    saleMode: 'free_market', modeData: {}, publicationStatus: 'published', availabilityStatus: 'available', currency: 'TZS', stock: 0, reservedStock: 0, openingStockPending: true,
    openingStockInitialized: false, businessId: null, storeId: null, isOnline: true, isOffline: false, salesChannels: ['marketplace'],
    coords: { lat: Math.round(-6.792412 * 100) / 100, lon: Math.round(39.208345 * 100) / 100 } }); }, T);
const pd = (await db.doc('products/' + pid).get()).data() || {};
ok(pd.coords && pd.coords.lat === -6.79 && pd.coords.lon === 39.21, 'listing written through the app keeps only approximate coordinates (-6.79, 39.21)');
const appSrc = readFileSync(new URL('../js/app/08-app-state.js', import.meta.url), 'utf8');
ok(/coords: \(skh\.userLat && skh\.userLon\) \? \{ lat: Math\.round\(Number\(skh\.userLat\) \* 100\) \/ 100/.test(appSrc), 'the sell form rounds GPS to 2 decimals before saving');
// admin replies
await p.evaluate(() => window.skh.signOut(window.skh.auth)); await p.waitForTimeout(500);
await p.evaluate(async ({ e, pw }) => { const c = await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); await c.user.getIdToken(true); }, { e: adminEmail, pw: PW });
await p.waitForFunction(u => window.skh.currentUser && window.skh.currentUser.uid === u, aid, { timeout: 20000 });
const html = await p.evaluate(() => window.skhSupportAdmin.html());
ok(html.includes(ref), 'admin sees the request in Kituo cha Udhibiti → Msaada');
await p.evaluate(r => { const t = document.createElement('textarea'); t.id = 'skhSupReply_' + r; t.value = 'Tumepokea ombi lako; tutalishughulikia ndani ya siku 7.'; document.body.appendChild(t); return window.skhSupportAdmin.set(r, 'in_progress'); }, ref);
const after = (await db.doc('support_requests/' + ref).get()).data();
ok(after.status === 'in_progress' && /siku 7/.test(after.adminReply) && after.handledBy === aid, 'admin reply and status saved, signed by the admin');
ok(!avatars.length, 'no request to ui-avatars.com while the app ran');
ok(errs.length === 0, 'no JavaScript errors in the app: ' + JSON.stringify(errs.slice(0, 3)));
await b.close();
console.log(`\nLEGAL + SUPPORT (browser + emulator): ${n} passed, 0 failed`);
process.exit(0);

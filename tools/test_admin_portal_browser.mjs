#!/usr/bin/env node
/* [ADMIN PORTAL 2026-11-21] /admin/ — separate admin application on the shared backend (Chromium + emulators).
 * Own sign-in (no registration), ordinary users refused, admin sees all sections backed by real data, a limited
 * "support" role sees support only and is refused by the security rules elsewhere, phone layout works.
 * Run: emulators + `node functions/local-server.js` (5055), SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_admin_portal_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8085';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-sokohai';
const APP = (process.env.SKH_APP_URL || 'http://127.0.0.1:5055/') + 'admin/';
const require = createRequire(new globalThis.URL('../functions/index.js', import.meta.url));
const admin = require('firebase-admin'); if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-sokohai' }); const db = admin.firestore();
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9';
async function signUp(email) { const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) }); const j = await r.json(); return j.localId; }
const E = (k) => 'ap-' + k + '-' + T + '@example.test';
const uUser = await signUp(E('user')), uAdmin = await signUp(E('admin')), uSupport = await signUp(E('support'));
await admin.auth().setCustomUserClaims(uAdmin, { admin: true, role: 'admin' });
await admin.auth().setCustomUserClaims(uSupport, { role: 'support' });
await db.doc('orders/apO' + T).set({ buyerId: uUser, sellerId: uAdmin, itemTitle: 'Oda ya Portal ' + T, amount: 12000, status: 'completed', createdAt: new Date().toISOString() });
await db.doc('support_requests/SR-AP' + T.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)).set({ reference: 'SR-AP' + T.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), uid: uUser, category: 'technical', subject: 'Portal ' + T, description: 'Ombi la majaribio la portal ya utawala.', relatedRef: '', status: 'open', createdAt: new Date().toISOString(), appVersion: '', page: '/' });

const b = await chromium.launch();
async function page(w) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.goto(APP); await p.waitForFunction(() => window.skhAdminPortal && !document.getElementById('apBoot').offsetParent, null, { timeout: 45000 });
  return { ctx, p, errs };
}
const login = async (p, who) => { await p.fill('#apEmail', E(who)); await p.fill('#apPass', PW); await p.click('#apSignIn'); };

// signed out
{ const { ctx, p, errs } = await page(1366);
  ok(await p.isVisible('#apLoginForm') && !(await p.isVisible('#apApp')), 'signed out: the portal shows its own sign-in page (not the marketplace)');
  ok(!/jisajili|register|sign up|fungua akaunti/i.test(await p.textContent('#apLoginForm')), 'no registration: admin accounts are not self-created');
  ok(await p.evaluate(() => document.querySelector('meta[name="robots"]').content) === 'noindex, nofollow', 'portal is noindex');
  await login(p, 'user'); await p.waitForFunction(() => /haina ruhusa/.test(document.getElementById('apLoginMsg').textContent), null, { timeout: 20000 });
  ok(!(await p.isVisible('#apApp')) && await p.evaluate(() => !window.skh.currentUser), 'an ordinary account is refused and signed out');
  ok(!errs.length, 'no JavaScript errors (sign-in page) ' + errs.slice(0, 2).join(' | '));
  await ctx.close(); }

// admin
{ const { ctx, p, errs } = await page(1366);
  await login(p, 'admin'); await p.waitForSelector('#apApp:not([hidden])', { timeout: 20000 });
  ok((await p.textContent('#apRole')) === 'Admin', 'admin signs in to the portal directly');
  const navTxt = await p.textContent('#apNav');
  ok(['Muhtasari', 'Akaunti', 'Bidhaa', 'Huduma', 'Usafiri', 'Oda', 'SokoPay', 'Minada', 'Live commerce', 'Maombi ya msaada', 'Matukio ya usalama', 'Kumbukumbu za ukaguzi'].every(t => navTxt.includes(t)), 'admin navigation covers users, marketplace, orders, SokoPay, auctions, live, support, security and audit');
  ok(!navTxt.includes('Sera ya malipo'), 'payment policy is Super Admin only (hidden for Admin)');
  await p.evaluate(() => window.skhAdminPortal.open('orders')); await p.waitForFunction(() => /Oda ya Portal/.test(document.getElementById('apMain').textContent) || /Sheria|Imeshindikana|Hakuna/.test(document.getElementById('apMain').textContent), null, { timeout: 20000 });
  ok((await p.textContent('#apMain')).includes('Oda ya Portal ' + T), 'orders: real records from the database (no invented numbers)');
  await p.evaluate(() => window.skhAdminPortal.open('support')); await p.waitForTimeout(3000);
  if (process.env.DEBUG_AP) console.log('MAIN', (await p.textContent('#apMain')).slice(0, 400), JSON.stringify(await p.evaluate(() => ({ cc: !!document.getElementById('skhAdminCC'), inMain: !!document.querySelector('#apMain #skhAdminCC') }))));
  ok((await p.textContent('#apMain')).includes('Portal ' + T), 'support requests are handled inside the portal (existing Admin Control Center view, inline)');
  await p.evaluate(() => window.skhAdminPortal.open('overview')); await p.waitForTimeout(3000);
  const ov = await p.textContent('#apMain');
  ok(ov.length > 40 && !/Hakuna ruhusa/.test(ov), 'system overview opens for the admin (server role check via adminWhoAmI)');
  // [I18N 2026-11-22] the portal's own interface follows the shared language preference
  await p.click('#apApp [data-ap-lang]'); await p.waitForTimeout(300);
  const navEn = await p.textContent('#apNav');
  ok(['Overview', 'Accounts', 'Orders', 'SokoPay transactions', 'Support requests', 'Security events', 'Audit log'].every(t => navEn.includes(t)) && !navEn.includes('Muhtasari wa mfumo') && (await p.textContent('#apSignOut')) === 'Sign out', 'English: navigation and header switch at once');
  await p.reload(); await p.waitForSelector('#apApp:not([hidden])', { timeout: 30000 });
  ok((await p.textContent('#apNav')).includes('Support requests') && await p.evaluate(() => localStorage.getItem('sokohai_language') === 'en' && document.documentElement.lang === 'en'), 'the language choice survives a reload (same sokohai_language preference as the marketplace)');
  await p.click('#apApp [data-ap-lang]'); await p.waitForTimeout(300);
  ok((await p.textContent('#apNav')).includes('Maombi ya msaada'), 'Kiswahili restored');
  await p.screenshot({ path: (process.env.SHOTS || '/tmp') + '/admin-portal-1366.png' });
  ok(!errs.length, 'no JavaScript errors (admin) ' + errs.slice(0, 2).join(' | '));
  await ctx.close(); }

// limited support role, on a phone
{ const { ctx, p, errs } = await page(360);
  await login(p, 'support'); await p.waitForSelector('#apApp:not([hidden])', { timeout: 20000 });
  ok((await p.textContent('#apRole')) === 'Msaada', 'support staff sign in with a limited role');
  await p.click('#apMenuBtn'); await p.waitForTimeout(400);
  const navTxt = await p.textContent('#apNav');
  ok(navTxt.includes('Maombi ya msaada') && !navTxt.includes('Oda') && !navTxt.includes('Akaunti'), 'support staff see support only');
  await p.evaluate(() => window.skhAdminPortal.open('orders')); await p.waitForTimeout(800);
  ok(!(await p.textContent('#apMain')).includes('Oda ya Portal'), 'support staff cannot open other sections from the page');
  const denied = await p.evaluate(async () => { try { await window.skh.getDocs(window.skh.query(window.skh.collection(window.skh.db, 'orders'), window.skh.limit(5))); return false; } catch (e) { return /permission/i.test(String(e.code || e.message)); } });
  ok(denied, 'security rules refuse support staff reading orders directly (not only hidden in the UI)');
  const canRead = await p.evaluate(async () => { const s = await window.skh.getDocs(window.skh.query(window.skh.collection(window.skh.db, 'support_requests'), window.skh.limit(20))); return s.size > 0; });
  ok(canRead, 'security rules let support staff read support requests');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '360px: no horizontal overflow; navigation in a slide-in menu');
  await p.screenshot({ path: (process.env.SHOTS || '/tmp') + '/admin-portal-360.png' });
  ok(!errs.length, 'no JavaScript errors (support, 360px) ' + errs.slice(0, 2).join(' | '));
  await ctx.close(); }
await b.close();
console.log(`\nADMIN PORTAL (browser + emulator): ${n} passed, 0 failed`);

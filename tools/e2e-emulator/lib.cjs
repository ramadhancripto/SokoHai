const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
/* [REPAIR 2026-10] Browser E2E against the Firebase EMULATOR + functions/local-server.js.
 * Never touches production: every non-local host is aborted (except the Firebase JS SDK
 * CDN when no local copy is given, and Cloudinary, which is answered with a fake upload).
 * Run: see tools/e2e-emulator/run.sh. Output (screenshots) goes to tools/e2e-emulator/out/ (gitignored). */
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(path.join(OUT, 'e2e'), { recursive: true });
const SCR = OUT; // screenshots/state live in out/e2e/
const SDK = process.env.SKH_FIREBASE_SDK_DIR ? process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/') : null; // optional local firebase@10.8.1 package dir
const BASE = 'http://localhost:5055';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'; process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'; process.env.GCLOUD_PROJECT = 'demo-sokohai';
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-sokohai' });
const db = admin.firestore();
const IMG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function open(viewport) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: viewport || { width: 390, height: 844 } });
  const p = await ctx.newPage(); const log = { errs: [], alerts: [], hosts: new Set(), uploads: 0 };
  if (SDK) await p.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => { const f = r.request().url().split('/').pop(); r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(SDK + f) }); });
  await p.route(/api\.cloudinary\.com/, r => { log.uploads++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secure_url: BASE + '/favicon.ico?e2e=' + log.uploads, public_id: 'e2e' + log.uploads, resource_type: 'image' }) }); });
  await p.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => { const u = r.request().url(); if (u.includes('gstatic.com/firebasejs/10.8.1/') || u.includes('api.cloudinary.com')) return r.fallback(); log.hosts.add(new URL(u).host); r.abort(); });
  p.on('pageerror', e => log.errs.push('PAGEERROR ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')));
  p.on('console', m => { if (m.type() === 'error') log.errs.push('CONSOLE ' + m.text().slice(0, 220)); });
  p.on('dialog', d => { log.alerts.push(d.message().slice(0, 200)); (d.type() === 'prompt' ? d.accept(log.promptAnswer || '') : d.accept()).catch(() => {}); });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.skh && window.skh.auth && window.skh.emulator, null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { b, ctx, p, log };
}
const NOISE = /net::ERR|Failed to load resource|ERR_FAILED|ERR_BLOCKED|offline|Could not reach Cloud Firestore|WebChannel|transport errored|maps\.googleapis|leaflet|tile/i;
const realErrs = log => log.errs.filter(e => !NOISE.test(e));
async function login(p, email, pass) {
  await p.evaluate(async ([e, pw]) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, [email, pass]);
  await p.waitForFunction(() => window.skh.currentUserData && window.skh.currentUserData.uid, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
}
async function authUser(email, pass, name) {
  try { return (await admin.auth().getUserByEmail(email)).uid; } catch (e) {}
  return (await admin.auth().createUser({ email, password: pass, displayName: name, emailVerified: true })).uid;
}
const results = []; let failed = 0;
async function step(name, fn) { const t = Date.now(); try { const note = await fn(); results.push({ name, ok: true, note: note || '' }); console.log('PASS', name, note ? '— ' + note : ''); } catch (e) { failed++; results.push({ name, ok: false, note: e.message }); console.log('FAIL', name, '—', e.message.slice(0, 400)); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
module.exports = { open, login, authUser, admin, db, step, assert, results, realErrs, BASE, IMG, SCR, get failed() { return failed; } };
// Click "yes" on the app's own confirm/prompt dialog (js/05-dialogs.js), optionally typing a value.
module.exports.answer = async function (p, value, timeout) {
  await p.waitForSelector('.skd-ov .skd-yes', { timeout: timeout || 10000 });
  if (value != null && await p.$('.skd-ov .skd-inp')) await p.fill('.skd-ov .skd-inp', String(value));
  await p.click('.skd-ov .skd-yes');
};
module.exports.call = (p, name, data) => p.evaluate(async ([n, d]) => { try { const r = await window.skh.wrapCallable(n)(d); return { ok: true, data: r && r.data }; } catch (e) { return { ok: false, code: e.code, message: e.message }; } }, [name, data]);

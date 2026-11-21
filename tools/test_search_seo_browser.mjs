#!/usr/bin/env node
/* [SEARCH-INTEL + SEO 2026-11-21] Real browser (Chromium) + Firestore/Auth emulator.
 *  A. The app (functions/local-server.js on 5055): search panel understands typos / synonyms / plurals, shows
 *     "Je, ulimaanisha", related searches, filters (in stock, verified, price, sort) and a labelled sponsored slot;
 *     /?q= opens a search; search + click events reach `search_logs` without personal fields; the admin
 *     "Utafutaji" and "SEO & Viungo" views work; an open listing's canonical points at its static page; an unknown
 *     path is noindex; the seller share kit shows the shop link; no JS errors.
 *  B. The generated public pages (tools/build_seo.mjs output served like Netlify: static file → section 404 → app):
 *     320 / 390 / 1366 px without horizontal scroll or JS errors, no third-party requests except listing images,
 *     header search goes to /?q=, a missing listing returns HTTP 404.
 * Run: emulator + local-server (5055) from this checkout, then
 *      SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_search_seo_browser.mjs */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-sokohai';
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-sokohai' }); const db = admin.firestore();
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9';
async function signUp(email) { const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) }); const j = await r.json(); if (!j.localId) throw Error(JSON.stringify(j)); return j.localId; }

// ---------------- seed listings (unique words so the test does not depend on other data)
const W = 'zx' + T.slice(-4);   // unique brand-like token
const now = new Date().toISOString();
const P = (o) => Object.assign({ publicationStatus: 'published', availabilityStatus: 'available', salesChannels: ['marketplace'], isOnline: true, currency: 'TZS', createdAt: now, updatedAt: now, timestamp: now,
  images: [], image: '', description: 'Bidhaa halisi ya majaribio ya utafutaji wa SokoHai yenye maelezo ya kutosha.', saleMode: 'free_market', modeData: {}, reservedStock: 0 }, o);
const seedIds = { a: 'ssA' + T, b: 'ssB' + T, c: 'ssC' + T, d: 'ssD' + T };
await db.doc('products/' + seedIds.a).set(P({ title: 'Samsung ' + W + ' Galaxy', brand: 'Samsung', price: 350000, category: 'CAT-12', location: 'Dar es Salaam', userId: 'ssSeller1', sellerName: 'Duka Moja', stock: 5 }));
await db.doc('products/' + seedIds.b).set(P({ title: 'Simu ' + W + ' Tecno', price: 280000, category: 'CAT-12', location: 'Mwanza', userId: 'ssSeller2', sellerName: 'Duka Mbili', stock: 0, openingStockPending: true }));
await db.doc('products/' + seedIds.c).set(P({ title: 'Viatu ' + W + ' Nike', price: 85000, category: 'CAT-07', location: 'Arusha', userId: 'ssSeller3', sellerName: 'Viatu Bora', stock: 3, verified: true }));
await db.doc('products/' + seedIds.d).set(P({ title: 'Kiti ' + W + ' ofisi', price: 90000, category: 'CAT-09', location: 'Dodoma', userId: 'ssSeller4', sellerName: 'Samani', stock: 2,
  isBoosted: true, boostExpiresAt: new Date(Date.now() + 3 * 86400000).toISOString() }));
const userEmail = 'ss-u-' + T + '@example.test', adminEmail = 'ss-a-' + T + '@example.test';
const uid = await signUp(userEmail), aid = await signUp(adminEmail);
await admin.auth().setCustomUserClaims(aid, { admin: true });
await db.doc('users/' + uid).set({ uid, fullName: 'Asha Mjaribu', email: userEmail, storeName: 'Duka la Asha', createdAt: now, walletBalance: 0 });

const b = await chromium.launch({ args: ['--no-sandbox'] });
async function appPage(url, vp) {
  const ctx = await b.newContext({ viewport: vp || { width: 390, height: 844 } });
  if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(sdk + r.request().url().split('/').pop()) })); }
  const p = await ctx.newPage(); p.__errs = [];
  p.on('pageerror', e => p.__errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {} });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.skh && window.skh.__authResolved && window.SKHSearchEngine && window.skhSearchLog, null, { timeout: 45000 });
  return { ctx, p };
}
const signIn = async (p, e) => { await p.evaluate(async ({ e, pw }) => { const c = await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); await c.user.getIdToken(true); }, { e, pw: PW }); await p.waitForFunction(() => window.skh.currentUser, null, { timeout: 20000 }); await p.waitForTimeout(900); };
const waitPool = (p) => p.waitForFunction(ids => { const all = (window.skh._feedSourceItems || []).concat(window.skh.cachedItems || []); return ids.every(id => all.some(x => x.id === id)); }, Object.values(seedIds), { timeout: 30000 });

// ======================= A. the app
{
  const { ctx, p } = await appPage(APP + '?q=' + encodeURIComponent('samsnug ' + W));
  await signIn(p, userEmail);
  await p.evaluate(() => window.loadMainFeed && window.loadMainFeed('all'));
  await waitPool(p);
  // /?q= filled the box
  ok(await p.$eval('#searchInput', i => i.value) === 'samsnug ' + W, '/?q= opens a search with the words (SearchAction target works)');
  const panel = async (q) => { await p.fill('#searchInput', ''); await p.type('#searchInput', q, { delay: 5 }); await p.waitForTimeout(400); return p.$eval('#skhSmartSearch', e => e.innerText); };
  let t = await panel('samsnug ' + W);
  ok(t.includes('Samsung ' + W + ' Galaxy'), 'typo "samsnug" finds the Samsung listing');
  t = await panel('frji ' + W) ; // no friji listing: helpful no-result state
  ok(/Hakuna matokeo/.test(t) && await p.$('#skhSmartSearch [data-skh-noresult]'), 'no-result state with help');
  await p.waitForTimeout(1500);   // let the zero-result search settle (one event per settled query)
  t = await panel('phone ' + W);
  ok(t.includes('Samsung ' + W + ' Galaxy') && t.includes('Simu ' + W + ' Tecno'), 'English "phone" finds Kiswahili phone listings (dictionary + category)');
  t = await panel('kiatu ' + W);
  ok(t.includes('Viatu ' + W + ' Nike'), 'singular "kiatu" finds "Viatu"');
  ok(await p.$('#skhSmartSearch .skh-ss-filters #skhSsSort') && await p.$('#skhSmartSearch [data-skh-filter="instock"]'), 'filter bar: sort, in-stock, verified, price range');
  t = await panel('simu ' + W);
  ok(t.includes('Simu ' + W + ' Tecno'), 'before filtering, the unconfirmed-stock phone is listed');
  await p.click('#skhSmartSearch [data-skh-filter="instock"]'); await p.waitForTimeout(250);
  t = await p.$eval('#skhSmartSearch', e => e.innerText);
  ok(!t.includes('Simu ' + W + ' Tecno') && t.includes('Samsung ' + W + ' Galaxy'), '"Inapatikana" filter hides a listing whose stock is not confirmed');
  await p.evaluate(() => window.skhSearchResetFilters());
  await p.evaluate(() => window.skhSearchSetFilter('verifiedOnly', true));
  t = await panel(W);
  ok(t.includes('Viatu ' + W + ' Nike') && !t.includes('Samsung ' + W), '"Waliothibitishwa" shows only server-verified sellers');
  await p.evaluate(() => window.skhSearchResetFilters());
  await p.evaluate(() => window.skhSearchSetFilter('maxPrice', '100000'));
  t = await panel(W);
  ok(!t.includes('Samsung ' + W) && t.includes('Viatu ' + W), 'price filter (max TSh 100,000)');
  await p.evaluate(() => window.skhSearchResetFilters());
  t = await panel('kiti ' + W);
  const sp = await p.$$eval('#skhSmartSearch .skh-ss-row.is-sponsored', els => els.map(e => e.innerText));
  ok(sp.length === 1 && /Imefadhiliwa/.test(sp[0]), 'boosted listing appears once with the "Imefadhiliwa" label');
  t = await panel('simu chini ya 300k ' + W);
  ok(t.includes('Simu ' + W + ' Tecno') && !t.includes('Samsung ' + W) && /Hadi TSh 300,000/.test(t), 'natural-language price ("chini ya 300k") understood and shown');
  // click -> event; then the logged search for the settled query
  t = await panel('samsung ' + W); await p.waitForTimeout(1500);
  await p.click('#skhSmartSearch .skh-ss-row'); await p.waitForTimeout(1200);
  const logs = (await db.collection('search_logs').where('q', '>=', '').get()).docs.map(d => d.data()).filter(x => String(x.q).includes(W.toLowerCase()));
  const sEv = logs.filter(x => x.t === 'search'), cEv = logs.filter(x => x.t === 'click');
  ok(sEv.length >= 1 && sEv.some(x => x.results >= 1 && Array.isArray(x.top) && x.top.length >= 1) && logs.some(x => x.t === 'search' && x.zero === true), 'search events stored with result count, impressions and zero-result flag');
  ok(cEv.length >= 1 && cEv[0].itemId === seedIds.a && cEv[0].pos >= 1 && cEv[0].cat === 'CAT-12', 'click event stored with position and category');
  ok(logs.every(x => !('uid' in x) && !('userId' in x) && !('email' in x) && /^[a-z0-9]{8,32}$/.test(x.sid)), 'events carry no uid / e-mail (anonymous session id only)');
  ok(logs.some(x => x.t === 'filter'), 'filter usage recorded');
  // open listing: canonical -> static page
  await p.waitForFunction(() => window.skh.currentOpenProduct, null, { timeout: 15000 });
  const can = await p.$eval('#skhCanonical', l => l.href);
  ok(/\/bidhaa\/samsung-[a-z0-9-]+-ssA/.test(can), 'open listing: canonical points at its crawlable page (' + can.replace(/^https?:\/\/[^/]+/, '') + ')');
  ok(await p.$eval('#skhMetaDescription', m => !/escrow/i.test(m.content)), 'listing meta description makes no escrow promise');
  // share kit
  await p.evaluate(() => { const m = document.getElementById('productModal'); if (m) m.style.display = 'none'; window.skhOpenShareKit(); });
  const kit = await p.$eval('#skhKitUrl', i => i.value);
  ok(new RegExp('/duka/duka-la-asha-' + uid + '/$').test(kit) && /rel|Tupo SokoHai/.test(await p.$eval('#skhKitBadge', e => e.value)), 'share kit: public shop link + optional badge snippet');
  ok(!p.__errs.length, 'no JavaScript errors in the app: ' + JSON.stringify(p.__errs.slice(0, 3)));
  await ctx.close();
}
{ // admin views
  const { ctx, p } = await appPage(APP);
  await signIn(p, adminEmail);
  const html = await p.evaluate(() => window.skhSearchAdmin.html());
  ok(/Utafutaji/.test(html) && /Bila matokeo/.test(html) && html.includes(('samsung ' + W).toLowerCase()), 'admin "Utafutaji": totals, zero-result and top queries from real events');
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'tmpSeo'; document.body.appendChild(d); return window.skhSeoAdmin.html().then(h => { d.innerHTML = h; }); });
  await p.evaluate(() => { document.querySelector('#tmpSeo details').open = true; });
  await p.fill('#skhBlSrc', 'https://chama-wauzaji.example.org/wanachama'); await p.fill('#skhBlTgt', '/soko/'); await p.fill('#skhBlAnchor', 'SokoHai');
  await p.evaluate(() => window.skhSeoAdmin.add()); await p.waitForTimeout(800);
  const bl = (await db.collection('seo_backlinks').where('sourceDomain', '==', 'chama-wauzaji.example.org').get()).docs.map(d => d.data());
  ok(bl.length === 1 && bl[0].rel === 'follow' && bl[0].updatedBy === aid, 'admin "SEO & Viungo": backlink recorded (domain, target, type, signed)');
  const parsed = await p.evaluate(() => import('/js/app/131-search-insights.js').then(m => m.parseLinksCsv('Top linking sites,Linking pages\nexample.org,12\nwww.habari.example.co.tz,3\n')));
  ok(parsed.length === 2 && parsed[1].sourceDomain === 'habari.example.co.tz', 'Search Console CSV export parsed');
  ok(!p.__errs.length, 'no JavaScript errors (admin)');
  await ctx.close();
}
{ // unknown path -> noindex
  const { ctx, p } = await appPage(APP + 'hakuna-ukurasa-huu');
  ok(await p.$eval('meta[name="robots"]', m => m.content) === 'noindex, follow', 'unknown app path is marked noindex (no soft-404 indexing)');
  await ctx.close();
}

// ======================= B. generated public pages
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-br-'));
execFileSync(process.execPath, [path.join(ROOT, 'tools/build_seo.mjs'), '--out', OUT], { env: process.env, stdio: 'pipe' });
const SECTIONS = /^\/(bidhaa|huduma|duka|soko|chapa|mwongozo)\//;
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  const tryFiles = [path.join(OUT, u), path.join(OUT, u, 'index.html'), path.join(ROOT, u)];
  const f = tryFiles.find(x => x.startsWith(OUT) || x.startsWith(ROOT) ? fs.existsSync(x) && fs.statSync(x).isFile() : false);
  const type = (x) => ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.js': 'text/javascript' })[path.extname(x)] || 'application/octet-stream';
  if (f) { res.writeHead(200, { 'content-type': type(f) }); fs.createReadStream(f).pipe(res); return; }
  if (SECTIONS.test(u)) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(path.join(OUT, '404.html')).pipe(res); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>app</title>app');
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const SITE = 'http://127.0.0.1:' + srv.address().port;
const pages = ['/soko/', '/mwongozo/', '/washirika.html', '/404.html'].concat(fs.readdirSync(path.join(OUT, 'bidhaa')).slice(0, 2).map(d => '/bidhaa/' + d + '/'))
  .concat(fs.readdirSync(path.join(OUT, 'mwongozo')).filter(d => d !== 'index.html').slice(0, 1).map(d => '/mwongozo/' + d + '/'));
for (const w of [320, 390, 1366]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } }); const p = await ctx.newPage();
  const errs = [], ext = []; p.on('pageerror', e => errs.push(e.message));
  p.on('request', r => { const h = new URL(r.url()).hostname; if (h !== '127.0.0.1' && h !== 'res.cloudinary.com') ext.push(h); });
  await p.route(/res\.cloudinary\.com/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"/>' }));
  const bad = [];
  for (const u of pages) { await p.goto(SITE + u, { waitUntil: 'load' }); const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (over) bad.push(u); }
  ok(!bad.length, `${w}px: public pages have no horizontal scroll (${pages.length} pages) ${bad.join(' ')}`);
  ok(!errs.length && !ext.length, `${w}px: no JS errors, no third-party requests except listing images`);
  if (w === 390 && process.env.SHOTS) { await p.goto(SITE + pages[4]); await p.screenshot({ path: process.env.SHOTS + '/bidhaa-390.png' }); await p.goto(SITE + '/soko/'); await p.screenshot({ path: process.env.SHOTS + '/soko-390.png' }); }
  if (w === 1366 && process.env.SHOTS) { await p.goto(SITE + pages[4]); await p.screenshot({ path: process.env.SHOTS + '/bidhaa-1366.png' }); }
  if (w === 390) {
    await p.goto(SITE + '/soko/'); await p.fill('#spq', 'simu'); await Promise.all([p.waitForNavigation(), p.press('#spq', 'Enter')]);
    ok(new URL(p.url()).pathname === '/' && new URL(p.url()).searchParams.get('q') === 'simu', 'header search on public pages opens the app search (/?q=)');
  }
  await ctx.close();
}
const r404 = await fetch(SITE + '/bidhaa/haipo-kabisa-xyz/');
ok(r404.status === 404 && /Ukurasa haukupatikana/.test(await r404.text()), 'missing listing page → HTTP 404 with the branded 404 page');
srv.close(); fs.rmSync(OUT, { recursive: true, force: true });
await b.close();
console.log(`\nSEARCH + SEO (browser + emulator): ${n} passed, 0 failed`);
process.exit(0);

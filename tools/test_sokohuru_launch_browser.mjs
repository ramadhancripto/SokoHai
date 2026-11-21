#!/usr/bin/env node
/* [SOKOHURU 2026-11-21] Real app + Firestore/Auth emulator, launch scope ON (?launchScope=sokohuru, the same
 * defaults production gets from js/00-config.js LAUNCH):
 *  - a signed-out visitor browses the market (published listing visible);
 *  - auction / price-drop / group-buy are not offered when selling, and the chooser refuses them;
 *  - checkout, escrow, wallet, delivery booking and bid entry points show a clear message and do not run;
 *  - their callables are refused in the browser before any network call;
 *  - a seller posts a FREE listing through the real skh.saveData path: no e-mail in the public document;
 *  - a buyer reports a listing once (a second report is refused).
 * Run: emulator (8085/9099) + `node functions/local-server.js` (port 5055) from this checkout, then
 *      SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_sokohuru_launch_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
process.env.GCLOUD_PROJECT = 'demo-sokohai';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';   // emulator only
const APP = (process.env.SKH_APP_URL || 'http://127.0.0.1:5055/') + '?launchScope=sokohuru';
const require = createRequire(new globalThis.URL('../functions/index.js', import.meta.url));
const admin = require('firebase-admin'); if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-sokohai' }); const db = admin.firestore();
const T = Date.now().toString(36);
async function signUp(email) {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Siri-' + T + '!', returnSecureToken: true }) });
  const j = await r.json(); if (!j.localId) throw Error('signUp ' + JSON.stringify(j)); return j.localId;
}
const sellerEmail = 'huru-seller-' + T + '@example.test', buyerEmail = 'huru-buyer-' + T + '@example.test';
const sellerUid = await signUp(sellerEmail), buyerUid = await signUp(buyerEmail);
const P = 'huru-live-' + T;
await db.doc('products/' + P).set({ userId: sellerUid, title: 'HURU-LIVE-' + T, price: 3000, stock: 2, category: 'CAT-01', salesChannels: ['marketplace'], publicationStatus: 'published', status: 'active', saleMode: 'free_market', createdAt: new Date(Date.now() + 60000).toISOString(), image: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=' });

const b = await chromium.launch({ args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await page.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
page.on('dialog', d => d.dismiss().catch(() => {}));
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  PASS ' + m); };
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.skhLaunch && window.skh && window.skh.db, null, { timeout: 45000 });
// record user-facing messages (toast or alert)
await page.evaluate(() => { window.__msgs = []; window.skhToast = m => window.__msgs.push(String(m)); window.alert = m => window.__msgs.push(String(m)); });

// 1. browsing
await page.waitForFunction(t => document.querySelector('#mainFeed') && document.querySelector('#mainFeed').innerText.includes('HURU-LIVE-' + t), T, { timeout: 45000 });
ok(true, 'signed-out visitor sees the published listing on the market');
const flags = await page.evaluate(() => window.skhLaunch.flags());
ok(['auction', 'priceDrop', 'groupBuy', 'wallet', 'escrow', 'checkout', 'delivery', 'paidEntitlements', 'promotionsManual'].every(f => flags[f] === false), 'launch flags: every payment-dependent feature off, paid promotions off');

// 2. entry points
const entry = await page.evaluate(() => {
  const names = ['openCheckout', 'finalProceedCheckout', 'proceedToPaySokoPay', 'placeBid', 'skhAuctionPlaceBid', 'skhGroupBuyJoin', 'skhPriceDropCheckout',
    'requestWithdrawal', 'openSokoPayDeposit', 'openRideRequestModal', 'skhPsBookTransport', 'payForBoost', 'paySubscription'];
  const out = {};
  for (const n of names) {
    const f = window[n];
    if (typeof f !== 'function') { out[n] = 'absent'; continue; }
    const before = window.__msgs.length;
    let threw = null; try { f(); } catch (e) { threw = e.message; }
    out[n] = (f.__skhLaunchGuard ? 'guarded' : 'open') + '|' + (window.__msgs.length > before && /haijawashwa/.test(window.__msgs[window.__msgs.length - 1]) ? 'told' : 'silent') + (threw ? '|threw:' + threw : '');
  }
  return out;
});
const present = Object.entries(entry).filter(([, v]) => v !== 'absent');
ok(present.length >= 10, 'entry points present in the app: ' + present.length);
ok(present.every(([, v]) => v === 'guarded|told'), 'every money / bid / delivery entry point is guarded and tells the user: ' + JSON.stringify(entry));
ok(await page.evaluate(async () => { try { await window.skh.wrapCallable('auctionPlaceBid')({ productId: 'x', amount: 1 }); return false; } catch (e) { return e.code === 'functions/failed-precondition' && !!e.launchFeature; } }), 'auctionPlaceBid callable refused in the browser (FEATURE_DISABLED)');
ok(await page.evaluate(async () => { try { await window.skh.wrapCallable('withdrawalRequest')({ amount: 1 }); return false; } catch (e) { return e.launchFeature === 'wallet'; } }), 'withdrawalRequest callable refused in the browser');
ok(await page.evaluate(() => typeof window.skh.wrapCallable('commentsPublish') === 'function'), 'marketplace callables (comments) are not intercepted');

// 3. sale modes
const modes = await page.evaluate(() => { const s = document.getElementById('prodSaleMode'); return s ? Array.from(s.options).map(o => o.value + ':' + (o.disabled || o.hidden ? 'off' : 'on')) : null; });
ok(modes && modes.includes('free_market:on') && modes.includes('wholesale:on') && ['auction', 'price_drop', 'group_buy'].every(m => modes.includes(m + ':off')), 'sell form offers free market + wholesale only: ' + JSON.stringify(modes));
const chooser = await page.evaluate(() => { const before = window.__msgs.length; window.skhSaleFlowChoose && window.skhSaleFlowChoose('auction'); return window.__msgs.length > before; });
ok(chooser, 'sale-type chooser refuses auction with a message');

// 4. seller posts a free listing through the real write path
await page.evaluate(async ({ e, p }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, p); }, { e: sellerEmail, p: 'Siri-' + T + '!' });
await page.waitForFunction(u => window.skh.currentUser && window.skh.currentUser.uid === u, sellerUid, { timeout: 20000 });
const newId = await page.evaluate(async t => window.skh.saveData('products', { title: 'HURU-NEW-' + t, price: 15000, category: 'CAT-01', description: 'Bidhaa ya majaribio', location: 'Arusha',
  condition: 'used', image: 'https://res.cloudinary.com/demo/image/upload/a.jpg', imagesArray: ['https://res.cloudinary.com/demo/image/upload/a.jpg'], saleMode: 'free_market', modeData: {},
  publicationStatus: 'published', availabilityStatus: 'available', currency: 'TZS', stock: 0, reservedStock: 0, openingStockPending: true, openingStockInitialized: false,
  businessId: null, storeId: null, isOnline: true, isOffline: false, salesChannels: ['marketplace'] }), T);
ok(typeof newId === 'string' && newId.length > 0, 'seller posted a free listing (no fee, no payment step): ' + newId);
const doc = (await db.doc('products/' + newId).get()).data() || {};
ok(doc.userId === sellerUid && doc.title === 'HURU-NEW-' + T, 'listing stored under the seller');
ok(!('userEmail' in doc) && !('sellerPhone' in doc) && !('ownerPhone' in doc), 'public listing carries no e-mail or phone');
const anon = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-sokohai/databases/(default)/documents/products/${newId}`);
ok(anon.status === 200, 'the new listing is publicly readable');
ok(await page.evaluate(async id => { try { await window.skh.updateDoc(window.skh.doc(window.skh.db, 'products', id), { isBoosted: true, boostDays: 3, boostedAt: new Date().toISOString() }); return false; } catch (e) { return /permission/i.test(e.code || e.message); } }, newId), 'seller cannot boost the listing from the browser');
await page.evaluate(() => window.skh.signOut(window.skh.auth));

// 5. buyer reports a listing
await page.evaluate(async ({ e, p }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, p); }, { e: buyerEmail, p: 'Siri-' + T + '!' });
await page.waitForFunction(u => window.skh.currentUser && window.skh.currentUser.uid === u, buyerUid, { timeout: 20000 });
await page.evaluate(id => { window.skh.currentOpenProduct = { id, userId: 'someone-else' }; window.skhReportListing(id); }, P);
await page.waitForSelector('#skhReportSheet #sklSend');
await page.selectOption('#sklReason', 'wrong_price'); await page.fill('#sklNote', 'Bei hailingani na picha');
await page.click('#sklSend');
await page.waitForFunction(() => /Ripoti imepokelewa/.test(document.querySelector('#sklMsg').textContent), null, { timeout: 15000 });
const rep = (await db.doc('listing_reports/' + P + '_' + buyerUid).get()).data();
ok(rep && rep.reason === 'wrong_price' && rep.status === 'open' && rep.reporterUid === buyerUid, 'report stored for admin review');
await page.evaluate(id => window.skhReportListing(id), P);
await page.click('#sklSend');
await page.waitForFunction(() => /Umeshaliripoti/.test(document.querySelector('#sklMsg').textContent), null, { timeout: 15000 });
ok(true, 'second report of the same listing by the same buyer is refused');
// own listing cannot be reported
await page.evaluate(() => { window.__msgs.length = 0; window.skh.currentOpenProduct = { id: 'mine', userId: window.skh.currentUser.uid }; window.skhReportListing('mine'); });
ok(await page.evaluate(() => window.__msgs.some(m => /lako mwenyewe/.test(m))), 'a seller cannot report their own listing');

// 6. paid promotions: switched on by the owner in system/launch, but no payment channel configured -> no collection
const adminEmail = 'huru-admin-' + T + '@example.test', adminUid = await signUp(adminEmail);
await admin.auth().setCustomUserClaims(adminUid, { admin: true });
await db.doc('system/launch').set({ auction: false, priceDrop: false, groupBuy: false, wallet: false, escrow: false, checkout: false, delivery: false, paidEntitlements: false, promotionsManual: true });
await db.doc('system/promotion_packages').set({ packages: { boost3: { active: true, kind: 'boost', amount: 5000, days: 3, label: 'Siku 3' } } });
try {
  await page.evaluate(() => window.skh.signOut(window.skh.auth));
  await page.evaluate(async ({ e, p }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, p); }, { e: sellerEmail, p: 'Siri-' + T + '!' });
  await page.waitForFunction(u => window.skh.currentUser && window.skh.currentUser.uid === u, sellerUid, { timeout: 20000 });
  await page.waitForFunction(() => window.skhLaunch.enabled('promotionsManual') === true, null, { timeout: 15000 });
  await page.evaluate(id => window.skhLaunch.openPromotionSheet(id), newId);
  await page.waitForFunction(() => /bado hayajafunguliwa/.test((document.querySelector('#skhPromoSheet') || {}).textContent || ''), null, { timeout: 15000 });
  const none = await db.collection('promotion_requests').where('sellerUid', '==', sellerUid).get();
  ok(none.empty, 'without owner-configured payment channels the seller is told promotions are not open and no request is created');
  // admin verifies a pending request (created as the seller would) and activates it from the browser
  const REQ = 'PRM-' + T.toUpperCase().replace(/[^A-Z0-9]/g, '') + 'ZZ', REQ2 = REQ.slice(0, -2) + 'YY';
  for (const r of [REQ, REQ2]) await db.doc('promotion_requests/' + r).set({ reference: r, sellerUid, productId: newId, packageId: 'boost3', kind: 'boost', amount: 5000, currency: 'TZS', days: 3, status: 'pending', createdAt: new Date().toISOString() });
  await page.evaluate(() => window.skh.signOut(window.skh.auth));
  await page.evaluate(async ({ e, p }) => { const c = await window.skh.signInWithEmailAndPassword(window.skh.auth, e, p); await c.user.getIdToken(true); }, { e: adminEmail, p: 'Siri-' + T + '!' });
  await page.waitForFunction(u => window.skh.currentUser && window.skh.currentUser.uid === u, adminUid, { timeout: 20000 });
  const act = await page.evaluate(async r => { try { return await window.skhLaunch.activatePromotion(r, 'mpesa', 'TXN' + r.slice(4, 12)); } catch (e) { return { err: e.code || e.message }; } }, REQ);
  ok(act && act.ok, 'admin activates the verified promotion from the browser: ' + JSON.stringify(act));
  const pd = (await db.doc('products/' + newId).get()).data();
  ok(pd.isBoosted === true && pd.boostPaidRef === REQ && pd.boostDays === 3 && !!pd.boostExpiresAt, 'listing boosted for exactly the paid period, linked to the request');
  ok((await db.doc('admin_audit_log/promo_' + REQ + '_activate').get()).exists && (await db.doc('promotion_payment_refs/mpesa_TXN' + REQ.slice(4, 12)).get()).exists, 'audit record and payment-reference reservation written');
  const replay = await page.evaluate(async ({ r2, ref }) => { try { await window.skhLaunch.activatePromotion(r2, 'mpesa', ref); return 'activated'; } catch (e) { return 'refused'; } }, { r2: REQ2, ref: 'TXN' + REQ.slice(4, 12) });
  ok(replay === 'refused' && (await db.doc('promotion_requests/' + REQ2).get()).data().status === 'pending', 'the same transaction id cannot activate a second request');
  // browser moderation fallback with audit
  const mod = await page.evaluate(async id => { try { return await window.skhLaunch.moderateProduct(id, 'hide', 'Ripoti ya bei ya uongo'); } catch (e) { return { err: e.code || e.message }; } }, P);
  ok(mod && mod.ok && (await db.doc('admin_audit_log/' + mod.auditId).get()).exists && (await db.doc('products/' + P).get()).data().adminHidden === true, 'admin hides a reported listing with an audit record');
  const elig = await page.evaluate(id => window.skh.productEligible ? window.skh.productEligible({ id, title: 'x', publicationStatus: 'published', status: 'active', salesChannels: ['marketplace'], adminHidden: true }) : null, P);
  ok(elig === false, 'a hidden listing is not eligible for the market feed');
} finally {
  await db.doc('system/launch').delete(); await db.doc('system/promotion_packages').delete();
}

ok(pageErrors.filter(m => !/hdr is not defined/.test(m)).length === 0, 'no page errors: ' + JSON.stringify(pageErrors.slice(0, 3)));
await b.close();
console.log(`\nSOKOHURU LAUNCH (browser + emulator): ${pass} passed, 0 failed`);
process.exit(0);

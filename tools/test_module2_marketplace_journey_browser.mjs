#!/usr/bin/env node
/* [MODULE 2 2026-11-27] MARKETPLACE JOURNEY in the REAL app (Chromium) against the Firebase emulators:
 *   browse (Bidhaa tab) -> product details -> quantity (stock limit) -> cart -> reload (persistence)
 *   -> cart quantity update -> delivery choice -> checkout (orders created, unpaid) -> wallet payment
 *   (server: orderWalletPay) with an insufficient balance (refused, nothing changes) -> retry after a
 *   top-up (held once) -> duplicate payment click (no second debit).
 * Uses the existing UI and handlers only (product card click, pmQtyPlus, "Weka kikapuni", cart
 * buttons, finalCartQty, delivery choice, confirmSmartCartOrder, the checkout wallet button).
 * Run: local server on SKH_APP_URL (default http://127.0.0.1:5056/) from THIS checkout + emulators:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai \
 *   SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_module2_marketplace_journey_browser.mjs
 * Without the emulators / server: exit 2 (BLOCKED). */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5056/';
if (!HOST || !AUTH_HOST || !process.env.SKH_FIREBASE_SDK_DIR) { console.error('BLOCKED: emulators + SKH_FIREBASE_SDK_DIR required'); process.exit(2); }
try { await fetch(APP, { method: 'HEAD' }); } catch (e) { console.error('BLOCKED: app server not reachable at ' + APP); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

let pass = 0, fail = 0; const failures = [];
const ok = (c, m, v) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; failures.push(m); console.log('  FAIL ' + m + (v !== undefined ? ' -> ' + JSON.stringify(v).slice(0, 300) : '')); } };

const T = Date.now().toString(36);
const SELLER = 'mjSeller' + T, PID = 'mjProd' + T, TITLE = 'Redio ya Majaribio ' + T, PRICE = 25000, STOCK = 3;
const EMAIL = 'mj-' + T + '@example.test', PW = 'Siri-' + T + '-9';
const base = { publicationStatus: 'published', availabilityStatus: 'available', status: 'active', salesChannels: ['marketplace'], isOnline: true, saleMode: 'free_market', countryCode: 'TZ', currency: 'TZS', region: 'Dar es Salaam', location: 'Dar es Salaam' };

await db.doc('users/' + SELLER).set({ uid: SELLER, fullName: 'Muuzaji Majaribio', walletBalance: 0 });
await db.doc('products/' + PID).set(Object.assign({}, base, { title: TITLE, price: PRICE, stock: STOCK, category: 'CAT-12', image: 'assets/img/categories/clean/new/cat12.webp', imagesArray: ['assets/img/categories/clean/new/cat12.webp'], userId: SELLER, sellerName: 'Muuzaji Majaribio', views: 999, createdAt: new Date().toISOString(), description: 'Bidhaa ya majaribio ya safari ya soko.' }));
const su = await (await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PW, returnSecureToken: true }) })).json();
const BUYER = su.localId;
await db.doc('users/' + BUYER).set({ uid: BUYER, fullName: 'Mnunuzi Majaribio', email: EMAIL, walletBalance: 1000 });   // too little on purpose

const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/');
const b = await chromium.launch();
const VP = (process.env.SKH_VIEWPORT || '390x844').split('x').map(Number);
const ctx = await b.newContext({ viewport: { width: VP[0], height: VP[1] } });
await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) }));
await ctx.route(/nominatim|ui-avatars|tile\.openstreetmap|res\.cloudinary\.com/, (r) => r.abort());
const p = await ctx.newPage(); const errs = []; const dialogs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
p.on('dialog', async (d) => { dialogs.push(d.message().slice(0, 200)); try { await (d.type() === 'prompt' ? d.accept('') : d.accept()); } catch (e) {} });
await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {} });
const boot = async () => { await p.waitForFunction(() => window.skh && window.skh.__authResolved, null, { timeout: 60000 }); };
await p.goto(APP); await boot();
await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: EMAIL, pw: PW });
await p.waitForFunction((u) => window.skh.currentUser && window.skh.currentUser.uid === u, BUYER, { timeout: 20000 });
await p.waitForTimeout(1500);
const cart = () => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('sokohai_cart') || '[]'); } catch (e) { return null; } });

console.log('\n[1. browse -> product details]');
await p.evaluate(() => window.updateApp('bidhaa'));
let card = null;
for (let i = 0; i < 20 && !card; i++) { await p.waitForTimeout(700); card = await p.$(`text=${TITLE}`); }
ok(!!card, 'the seeded product is listed in the Bidhaa tab');
if (card) { await card.scrollIntoViewIfNeeded(); await card.click(); }
await p.waitForFunction(() => { const m = document.getElementById('productModal'); return m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 15000 }).catch(() => {});
const pm = await p.evaluate(() => { const m = document.getElementById('productModal'); return m ? { shown: getComputedStyle(m).display !== 'none', text: m.innerText } : null; });
ok(pm && pm.shown, 'tapping the card opens product details');
ok(pm && pm.text.includes(TITLE), 'details show the product title');
ok(pm && /25[,.]?000/.test(pm.text), 'details show the server price TSh 25,000', pm && pm.text.slice(0, 200));

console.log('\n[2. quantity and stock limit]');
for (let i = 0; i < 6; i++) { const plus = await p.$('#pmQtyPlus'); if (plus) await plus.click().catch(() => {}); await p.waitForTimeout(120); }
const qMax = await p.evaluate(() => Number((document.getElementById('pmQty') || {}).value || 0));
ok(qMax === STOCK, `quantity cannot exceed stock (${STOCK}) after 6 taps on +`, qMax);
const minus = await p.$('#pmQtyMinus'); if (minus) await minus.click();
const q2 = await p.evaluate(() => Number((document.getElementById('pmQty') || {}).value || 0));
ok(q2 === 2, 'minus brings it back to 2', q2);

console.log('\n[3. add to cart]');
const cartBtn = await p.$('#productModal button[onclick="addToCart(false)"]');
ok(!!cartBtn, '"Weka kikapuni" button present on the product');
if (cartBtn) { await cartBtn.click(); await p.waitForTimeout(1500); }
let c = await cart();
const line = (c || []).find((x) => (x.productId || x.id) === PID);
ok(!!line, 'the product is in the cart (localStorage sokohai_cart)', c);
ok(line && Number(line.qty || line.quantity) === 2, 'cart quantity 2', line);
ok(line && Number(String(line.price).replace(/,/g, '')) === PRICE, 'cart unit price equals the product price', line && line.price);

console.log('\n[4. persistence across a reload]');
await p.reload(); await boot(); await p.waitForTimeout(2000);
c = await cart();
ok((c || []).some((x) => (x.productId || x.id) === PID && Number(x.qty || x.quantity) === 2), 'cart survives a reload', c);

console.log('\n[5. cart screen and quantity update]');
await p.evaluate(() => window.openCart());
await p.waitForTimeout(1500);
let cartText = await p.evaluate(() => (document.getElementById('cartModal') || {}).innerText || '');
ok(cartText.includes(TITLE), 'cart screen lists the product');
ok(/50[,.]?000/.test(cartText), 'cart shows 25,000 x 2 = 50,000', cartText.slice(0, 300));
const plusBtns = await p.$$('#cartModal button[onclick*="finalCartQty"]');
ok(plusBtns.length >= 2, 'cart has - / + quantity buttons', plusBtns.length);
for (let i = 0; i < 3; i++) { const pb = await p.$('#cartModal button[onclick*="finalCartQty(0,1)"]'); if (pb) await pb.click(); await p.waitForTimeout(300); }
c = await cart();
const q3 = Number(((c || []).find((x) => (x.productId || x.id) === PID) || {}).qty || 0);
ok(q3 <= STOCK, `cart + cannot go past stock (${STOCK})`, q3);
const mb = await p.$('#cartModal button[onclick*="finalCartQty(0,-1)"]'); if (mb) { await mb.click(); await p.waitForTimeout(300); }
c = await cart();
const qFinal = Number(((c || []).find((x) => (x.productId || x.id) === PID) || {}).qty || 0);
ok(qFinal >= 1 && qFinal < q3, 'cart - lowers the quantity', { q3, qFinal });

console.log('\n[6. checkout validation and order creation]');
dialogs.length = 0;
await p.evaluate(() => { try { window.skhDeliveryReset && window.skhDeliveryReset(); } catch (e) {} });
await p.evaluate(() => window.confirmSmartCartOrder());
await p.waitForTimeout(1200);
ok(dialogs.some((d) => /usafirishaji/i.test(d)), 'checkout without a delivery choice is refused with a message', dialogs);
ok((await db.collection('orders').where('buyerId', '==', BUYER).get()).size === 0, 'no order written by the refused attempt');
await p.evaluate(() => window.skhDeliverySetRequired(false));   // the "Sitahitaji usafirishaji" choice
dialogs.length = 0;
await p.evaluate(() => window.confirmSmartCartOrder());
let orders = [];
for (let i = 0; i < 20; i++) { await p.waitForTimeout(500); orders = (await db.collection('orders').where('buyerId', '==', BUYER).get()).docs; if (orders.length) break; }
ok(orders.length === 1, 'exactly one order created for the single seller', orders.length);
const o = orders[0] ? orders[0].data() : {};
ok(o.sellerId === SELLER, 'order sellerId is the product owner', o.sellerId);
ok(o.status === 'payment_pending' && o.paymentVerified !== true, 'order starts unpaid (payment_pending)', { status: o.status, pv: o.paymentVerified });
const expectGoods = PRICE * qFinal;
const amt = Number(o.amount || (o.totals && o.totals.grandTotal) || 0);
ok(amt >= expectGoods && amt <= Math.round(expectGoods * 1.015) + 1, `order amount = ${qFinal} x 25,000 (+1.5% fee)`, amt);
ok(((await cart()) || []).length === 0, 'cart is emptied after checkout');
const co = await p.evaluate(() => { const m = document.getElementById('checkoutModal'); return m && getComputedStyle(m).display !== 'none'; });
ok(co, 'checkout (payment) screen opens');
const shownTotal = await p.evaluate(() => Number(String((document.getElementById('checkoutAmount') || {}).value || '').replace(/[^0-9]/g, '')) || 0);
const cartTotalText = cartText.match(/Jumla[^0-9]*([0-9][0-9,.]*)/);

console.log('\n[7. payment failure and retry]');
/* app dialogs (js/05-dialogs.js .skd-ov): read the text, press the confirming button like a user */
const appDialogs = [];
async function answerDialogs(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await p.waitForTimeout(900);
    const d = await p.$('.skd-ov'); if (!d) continue;
    appDialogs.push(((await d.innerText()) || '').replace(/\s+/g, ' ').slice(0, 200));
    const yes = (await p.$('.skd-ov .skd-yes')) || (await p.$('.skd-ov .skd-btn'));
    if (yes) await yes.click().catch(() => {});
  }
}
const walletBtn = async () => (await p.$('#checkoutModal button:has-text("Wallet")')) || (await p.$('#checkoutModal button[onclick*="allet"]'));
let wb = await walletBtn();
ok(!!wb, 'checkout offers the SokoPay wallet button');
dialogs.length = 0;
if (wb) { await wb.click(); await answerDialogs(); }
console.log('     dialogs after the 1st payment attempt: ' + JSON.stringify(appDialogs.concat(dialogs)));
const insuff = appDialogs.concat(dialogs).some((t) => /salio|haitoshi|insufficient|ongeza/i.test(t));
ok(insuff, 'the buyer is told the wallet balance is not enough', appDialogs.concat(dialogs));
let od = (await db.doc('orders/' + orders[0].id).get()).data();
ok(od.status === 'payment_pending', 'insufficient wallet: order stays payment_pending', od.status);
ok(Number((await db.doc('users/' + BUYER).get()).data().walletBalance) === 1000, 'insufficient wallet: balance unchanged');
await db.doc('users/' + BUYER).set({ walletBalance: 500000 }, { merge: true });
wb = await walletBtn();
if (!wb) { await p.evaluate(() => { const m = document.getElementById('checkoutModal'); if (m) m.style.display = 'flex'; }); wb = await walletBtn(); }
dialogs.length = 0; appDialogs.length = 0;
if (wb) { await wb.click(); await answerDialogs(); }
for (let i = 0; i < 20; i++) { await p.waitForTimeout(500); od = (await db.doc('orders/' + orders[0].id).get()).data(); if (od.status === 'held') break; }
ok(od.status === 'held' && od.paymentVerified === true, 'after a top-up the retry pays: order held + verified by the server', { status: od.status, pv: od.paymentVerified });
const after1 = Number((await db.doc('users/' + BUYER).get()).data().walletBalance);
ok(500000 - after1 === Number(od.amount), 'exactly the order amount was debited', { debited: 500000 - after1, amount: od.amount });
ok(shownTotal === 500000 - after1, 'PRICE CONSISTENCY: the total shown on the checkout screen equals the amount charged', { shownOnCheckout: shownTotal, charged: 500000 - after1, orderTotals: od.totals, cartHeader: cartTotalText && cartTotalText[1] });
wb = await walletBtn();
if (!wb) { await p.evaluate(() => { const m = document.getElementById('checkoutModal'); if (m) m.style.display = 'flex'; }); wb = await walletBtn(); }
if (wb) { await wb.click().catch(() => {}); await answerDialogs(); }
ok(Number((await db.doc('users/' + BUYER).get()).data().walletBalance) === after1, 'a second click does not debit again');
const holds = await db.doc('escrow_holds/order_' + orders[0].id).get();
ok(holds.exists, 'server escrow hold exists for the order');

ok(errs.length === 0, 'no JavaScript page errors during the journey', errs);
console.log(`\nMODULE 2 MARKETPLACE JOURNEY (browser + emulator): ${pass} passed, ${fail} failed`);
if (fail) console.log('FAILED: ' + failures.join(' | '));
await b.close();
process.exit(fail ? 1 : 0);

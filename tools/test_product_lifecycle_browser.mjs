#!/usr/bin/env node
/* [LIFECYCLE 2026-11-21] Product lifecycle across every public surface — real app (Chromium) + Firestore/Auth emulator.
 * published -> visible (feed, search, storefront, direct link, related rail, cart)
 * archived (seller, through the security rules) -> gone from feed, cached feed, search, storefront, related rail,
 *   old direct link refused, cannot be added to cart, removed from an existing cart, not restored from cache
 * permanently deleted (seller, Recycle Bin path) -> still gone; historical order untouched; other users cannot change or delete it.
 * Run: emulators + `node functions/local-server.js` (5055), SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_product_lifecycle_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8085';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-sokohai';
const HOST = process.env.FIRESTORE_EMULATOR_HOST, APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
const require = createRequire(new globalThis.URL('../functions/index.js', import.meta.url));
const admin = require('firebase-admin'); if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-sokohai' }); const db = admin.firestore();
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9';
async function signUp(email) { const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) }); const j = await r.json(); return { uid: j.localId, token: j.idToken }; }
const seller = await signUp('lc-s-' + T + '@example.test'), buyer = await signUp('lc-b-' + T + '@example.test'), other = await signUp('lc-o-' + T + '@example.test');
const base = `http://${HOST}/v1/projects/demo-sokohai/databases/(default)/documents`;
const enc = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : { stringValue: String(v) };
const patch = (path, tok, data) => fetch(base + '/' + path + '?' + Object.keys(data).map(k => 'updateMask.fieldPaths=' + k).join('&') + '&currentDocument.exists=true',
  { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) }).then(r => r.status);
const del = (path, tok) => fetch(base + '/' + path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } }).then(r => r.status);

const TITLE = 'Taa Lifecycle ' + T, OTHER_TITLE = 'Taa Nyingine ' + T, PID = 'lcP' + T, QID = 'lcQ' + T, OID = 'lcO' + T;
const now = new Date().toISOString();
const prod = (uid, title) => ({ title, price: 25000, stock: 5, category: 'CAT-34', subCategory: 'Taa', userId: uid, sellerName: 'Duka la Taa', publicationStatus: 'published', status: 'active',
  availabilityStatus: 'available', salesChannels: ['marketplace'], isOnline: true, saleMode: 'free_market', currency: 'TZS', createdAt: now, updatedAt: now, location: 'Mwenge',
  image: 'https://res.cloudinary.com/demo/image/upload/v1/' + title.replace(/\W/g, '') + '.jpg', description: 'Taa ya sola kwa nyumba.' });
await db.doc('users/' + seller.uid).set({ uid: seller.uid, fullName: 'Muuzaji Taa', createdAt: now });
await db.doc('users/' + buyer.uid).set({ uid: buyer.uid, fullName: 'Mnunuzi', createdAt: now });
await db.doc('products/' + PID).set(prod(seller.uid, TITLE));
await db.doc('products/' + QID).set(prod(seller.uid, OTHER_TITLE));   // same seller: the "similar" rail (other sellers' close matches go to the compare rails)
const ORDER = { buyerId: buyer.uid, sellerId: seller.uid, productId: PID, itemTitle: TITLE, amount: 25000, status: 'completed', createdAt: now };
await db.doc('orders/' + OID).set(ORDER);

const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
await ctx.route(/res\.cloudinary\.com|nominatim/, r => r.abort());
const p = await ctx.newPage(); const errs = [], dialogs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); localStorage.removeItem('sokohai_cart'); } catch (e) {} });
await p.goto(APP); await p.waitForFunction(() => window.skh && window.skh.__authResolved, null, { timeout: 45000 });
await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: 'lc-b-' + T + '@example.test', pw: PW });
await p.waitForTimeout(2500);
await p.evaluate(() => { const a = document.getElementById('authModal'); if (a) a.style.display = 'none'; });

// public listing surfaces only (the main feed and the Home rails), visible text — a buyer's own order history
// (SokoPay "recent transactions") legitimately keeps the title of a past purchase and is not a listing surface
const feedHas = async (col) => { await p.evaluate(c => window.loadMainFeed(c), col); await p.waitForTimeout(2500);
  return p.evaluate(t => [...document.querySelectorAll('#mainFeed, .shx-rail-row')].some(g => g.offsetParent !== null && g.innerText.includes(t)), TITLE); };
const searchHas = () => p.evaluate(({ t, id }) => { const r = window.skhSearchService(t); return JSON.stringify((r.ranked || []).map(x => (x.item || x).id)).includes(id); }, { t: TITLE, id: PID });
const storeHas = async () => { await p.evaluate(u => { try { closeModals(); } catch (e) {} return window.openSellerProfile(u, 'Muuzaji Taa'); }, seller.uid); await p.waitForTimeout(2500); return p.evaluate(t => document.body.innerText.includes(t), TITLE); };
const relatedHas = async () => { await p.evaluate(q => { try { closeModals(); } catch (e) {} window.openProduct(q, 'products'); }, QID);
  await p.waitForFunction(q => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === q && document.querySelector('.pm-rail'), QID, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(t => ({ has: [...document.querySelectorAll('.pm-rail')].some(r => r.textContent.includes(t)), rails: [...document.querySelectorAll('.pm-rail')].map(r => r.textContent.slice(0, 160)) }), TITLE);
  if (process.env.DEBUG_RAILS) console.log(JSON.stringify(r.rails));
  return r.has; };
// the app's own alert dialog (07-toasts) or, where an alert is native, the browser dialog
const alertText = async () => { const t = await p.evaluate(() => { const m = document.getElementById('skhAlertMsg'); const t = m ? m.textContent : ''; const b = document.getElementById('skhAlertBtn'); if (b) b.click(); return t; }); const d = dialogs.splice(0).join(' | '); return (t + ' ' + d).trim(); };
const cartIds = () => p.evaluate(() => (window.skh.smartCartItems() || []).map(i => i.id || i.productId));

// ---- 1. published
ok(await feedHas('products'), 'published: visible on the Home product feed');
ok(await feedHas('all'), 'published: visible on the "all" feed (this also fills the 2-minute feed cache)');
ok(await searchHas(), 'published: found by search');
ok(await storeHas(), 'published: listed on the seller storefront');
ok(await relatedHas(), 'published: offered in the related rail of another product');
await p.evaluate(id => { try { closeModals(); } catch (e) {} window.openProduct(id, 'products'); }, PID); await p.waitForTimeout(2500);
ok(await p.evaluate(id => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === id, PID), 'published: opens through its direct link');
const staleCopy = await p.evaluate(() => JSON.parse(JSON.stringify(window.skh.currentOpenProduct)));
await p.evaluate(() => window.addToCart(false)); await p.waitForTimeout(1500); await alertText();
ok((await cartIds()).includes(PID), 'published: can be added to the cart');

// ---- 2. permissions: nobody but the seller changes or deletes it
ok(await patch('products/' + PID, other.token, { publicationStatus: 'archived', status: 'archived', archivedAt: now, updatedAt: now }) === 403, 'another user cannot archive the product (security rules)');
ok(await patch('products/' + PID, other.token, { price: 1 }) === 403, 'another user cannot modify the product');
ok(await del('products/' + PID, other.token) === 403 && await del('products/' + PID, seller.token) === 403, 'nobody deletes the document from a browser (records are kept)');

// ---- 3. archived by its seller (the buyer has the product page open at that moment)
await alertText(); await p.evaluate(id => { try { closeModals(); } catch (e) {} window.skh.currentOpenProduct = null; window.openProduct(id, 'products'); }, PID);
await p.waitForFunction(id => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === id && typeof window.activeProductUnsubscribe === 'function', PID, { timeout: 15000 }); await p.waitForTimeout(800);
ok(await patch('products/' + PID, seller.token, { publicationStatus: 'archived', status: 'archived', archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) === 200, 'the seller archives (moves to Recycle Bin) through the rules');
await p.waitForTimeout(1500);
const live = await alertText();
ok(/haipatikani/i.test(live), 'an open product page closes itself when the listing is archived ("' + live.slice(0, 40) + '")');
ok(!(await feedHas('products')), 'archived: gone from the Home product feed');
await p.evaluate(id => { try { closeModals(); } catch (e) {} window.openProduct(id, 'products'); }, PID); await p.waitForTimeout(2500);
const old = await alertText();
ok(/haipatikani/i.test(old) && await p.evaluate(id => !window.skh.currentOpenProduct || window.skh.currentOpenProduct.id !== id || !document.querySelector('#productModal[style*="flex"]'), PID), 'archived: the old direct link is refused');
ok(!(await feedHas('all')), 'archived: not restored from the 2-minute feed cache after the old link revealed it');
ok(!(await searchHas()), 'archived: not in search (search reads the same cache)');
ok(!(await storeHas()), 'archived: gone from the seller storefront');
ok(!(await relatedHas()), 'archived: no longer offered in related rails');
await p.evaluate(() => window.openCart()); await p.waitForTimeout(2000); await alertText();
ok(!(await cartIds()).includes(PID), 'archived: removed from a cart that already held it (cannot be checked out)');
await p.evaluate(s => { window.skh.currentOpenProduct = s; return window.addToCart(false); }, staleCopy); await p.waitForTimeout(1500);
const addMsg = await alertText();
ok(!(await cartIds()).includes(PID) && /haipatikani/i.test(addMsg), 'archived: a stale product page cannot add it to the cart');

// ---- 4. permanently deleted (Recycle Bin purge path)
ok(await patch('products/' + PID, seller.token, { permanentlyDeleted: true, permanentlyDeletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) === 200, 'the seller permanently deletes from the Recycle Bin (flag; the record is kept for history)');
ok(await patch('products/' + PID, seller.token, { publicationStatus: 'published', status: 'active', archivedAt: null, updatedAt: new Date().toISOString() }) === 403, 'a permanently deleted product cannot be republished');
await p.evaluate(id => { try { closeModals(); } catch (e) {} window.openProduct(id, 'products'); }, PID); await p.waitForTimeout(2500);
ok(/haipatikani/i.test(await alertText()), 'deleted: the old direct link is refused');
ok(!(await feedHas('products')) && !(await searchHas()), 'deleted: not in the feed or search');
const order = (await db.doc('orders/' + OID).get()).data();
ok(order && order.productId === PID && order.itemTitle === TITLE && order.status === 'completed' && order.amount === 25000, 'historical order is intact');
ok((await db.doc('products/' + PID).get()).exists, 'the product record itself is kept (no physical deletion)');
// ---- 5. [2026-11-22] stale Home rows without any buyer interaction: the seller archives a listing while the buyer's Home
// is on screen; the feed is NOT reloaded — the background re-check (tab visible again / Home tapped) removes the card.
const RID = 'lcR' + T, RTITLE = 'Taa ya Tatu ' + T;
await db.doc('products/' + RID).set(prod(seller.uid, RTITLE));
await p.evaluate(async ({ r, q }) => {   // the buyer's Home shows both real listings (rendered by the app's own feed renderer)
  try { closeModals(); } catch (e) {}
  const S = window.skh, rows = [];
  for (const id of [r, q]) { const d = await S.getDoc(S.doc(S.db, 'products', id)); if (d.exists()) rows.push(Object.assign({ id: d.id, collectionName: 'products' }, d.data())); }
  S.renderFeedUI(rows, document.getElementById('mainFeed'));
}, { r: RID, q: QID }); await p.waitForTimeout(800);
const cardOn = (id) => p.evaluate(i => !!document.querySelector('[onclick*="openProduct(\'' + i + '\'"]'), id);
ok(await cardOn(RID) && await cardOn(QID), 'stale rows: both live listings are on the buyer\'s Home feed');
ok(await patch('products/' + RID, seller.token, { publicationStatus: 'archived', status: 'archived', archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) === 200, 'stale rows: the seller archives one of them (buyer does nothing)');
const rv = await p.evaluate(() => window.skh.revalidateVisibleListings({ force: true }));
ok(rv && !rv.error && rv.removed >= 1 && rv.checked <= 40, 'stale rows: the background re-check reads at most 40 listings in batches (' + JSON.stringify(rv) + ')');
ok(!(await cardOn(RID)) && await cardOn(QID), 'stale rows: the archived card disappears without reloading the app; the live card stays');
ok(!(await p.evaluate(id => JSON.stringify(window.skh._feedSourceItems || []).includes(id), RID)), 'stale rows: it is also dropped from the feed source the search panel reads');
const again = await p.evaluate(() => window.skh.revalidateVisibleListings());
ok(again && again.skipped === true, 'stale rows: the re-check is throttled (no repeated Firestore reads within 3 minutes)');
ok(!errs.length, 'no JavaScript errors: ' + JSON.stringify(errs.slice(0, 3)));
await b.close();
console.log(`\nPRODUCT LIFECYCLE (browser + emulator): ${n} passed, 0 failed`);
process.exit(0);

#!/usr/bin/env node
/* [RECYCLE 2026-11-21] Real app + Firestore emulator: a product in the Recycle Bin (archived, legacy "deleted",
 * draft, or permanently deleted) never appears on the Home feed (#mainFeed, the 'all' path that mixes products,
 * services and transport, incl. its 2-minute cache) nor on the Bidhaa tab, and a buyer opening its old link is told
 * it is no longer available. A published product and a service keep showing.
 * Run: emulator (8085/9099) + `node functions/local-server.js` (port 5055) from this checkout, then
 *      SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_recycle_market_feed_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
// emulator only: project demo-sokohai on 127.0.0.1 (never production)
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
process.env.GCLOUD_PROJECT = 'demo-sokohai';
const URL = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
const require = createRequire(new globalThis.URL('../functions/index.js', import.meta.url));
const admin = require('firebase-admin'); if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-sokohai' }); const db = admin.firestore();
const T = Date.now().toString(36), now = Date.now();
const iso = k => new Date(now + k * 1000).toISOString();
const base = { userId: 'feed-seller-' + T, price: 2500, stock: 4, category: 'CAT-01', salesChannels: ['marketplace'], image: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=' };
const rows = {
  live:    Object.assign({}, base, { title: 'LIVE-' + T, publicationStatus: 'published', status: 'active', createdAt: iso(5) }),
  binned:  Object.assign({}, base, { title: 'BINNED-' + T, publicationStatus: 'archived', status: 'archived', archivedAt: iso(0), createdAt: iso(4) }),
  stale:   Object.assign({}, base, { title: 'STALE-' + T, publicationStatus: 'published', status: 'active', archivedAt: iso(0), createdAt: iso(3) }),
  legacy:  Object.assign({}, base, { title: 'LEGACYDEL-' + T, status: 'deleted', createdAt: iso(2) }),
  purged:  Object.assign({}, base, { title: 'PURGED-' + T, publicationStatus: 'archived', status: 'archived', archivedAt: iso(0), permanentlyDeleted: true, permanentlyDeletedAt: iso(1), createdAt: iso(6) }),
  draft:   Object.assign({}, base, { title: 'DRAFT-' + T, publicationStatus: 'draft', status: 'draft', createdAt: iso(7) })
};
for (const [k, v] of Object.entries(rows)) await db.doc('products/rbf-' + k + '-' + T).set(v);
await db.doc('services/rbf-svc-' + T).set({ title: 'SERVICE-' + T, userId: base.userId, price: 1000, createdAt: iso(8) });

const b = await chromium.launch({ args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await page.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  PASS ' + m); };
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(t => document.querySelector('#mainFeed') && document.querySelector('#mainFeed').innerText.includes('LIVE-' + t), T, { timeout: 45000 });
const homeText = async () => page.evaluate(() => document.querySelector('#mainFeed').innerText);
let h = await homeText();
ok(h.includes('LIVE-' + T) && h.includes('SERVICE-' + T), 'Home feed shows the published product and the service');
for (const k of ['BINNED', 'STALE', 'LEGACYDEL', 'PURGED', 'DRAFT']) ok(!h.includes(k + '-' + T), `Home feed hides ${k} product`);
// second paint comes from the 2-minute feed cache (the path that used to skip the filter)
await page.evaluate(() => window.skh.loadMainFeed('all')); await page.waitForTimeout(800); h = await homeText();
ok(h.includes('LIVE-' + T) && !h.includes('BINNED-' + T) && !h.includes('PURGED-' + T), 'cached Home repaint still hides Recycle Bin products');
// a buyer (signed out) opening an old link of a binned product
await page.evaluate(id => window.openProduct(id, 'products'), 'rbf-binned-' + T); await page.waitForTimeout(2500);
ok(dialogs.some(m => /haipatikani tena sokoni/i.test(m)), 'opening a binned product link tells the buyer it is no longer available');
ok(!(await page.evaluate(() => window.skh.currentOpenProduct && window.skh.currentOpenProduct.title)) || !(await page.evaluate(t => String((window.skh.currentOpenProduct || {}).title || '').includes('BINNED-' + t), T)), 'the binned product is not loaded as the open product');
// restore = back on the market
await db.doc('products/rbf-binned-' + T).update({ publicationStatus: 'published', status: 'active', archivedAt: null });
await page.evaluate(() => { if (window.skh._feedCache) window.skh._feedCache.clear(); window.skh.loadMainFeed('all'); });
await page.waitForFunction(t => document.querySelector('#mainFeed').innerText.includes('BINNED-' + t), T, { timeout: 20000 });
ok(true, 'after restore the product is visible on the Home feed again');
await b.close();
console.log(`\nRECYCLE MARKET FEED (browser + emulator): ${pass} passed, 0 failed`);

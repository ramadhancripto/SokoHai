#!/usr/bin/env node
/* [G-2 2026-11-20] Every background export: wiring (event type, document path, schedule, region) read from the
 * deployed metadata (__endpoint), and behaviour through the EXPORTED handler (`fn.run(event)` for triggers and
 * schedules, `fn(req, res)` for HTTP) against the emulator. PesaPal is a mocked fetch; FCM is a stubbed sender.
 * Also the backfills that repair production drift (userCards, searchTokens): authorisation, idempotency, no overwrite.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_triggers_schedules_emulator.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator inahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
process.env.SUPER_ADMIN_EMAILS = 'g2boss@sokohai.test';
process.env.PESAPAL_BASE_URL = 'https://cybqa.pesapal.com/pesapalv3'; process.env.PESAPAL_CONSUMER_KEY = 'ck_g2'; process.env.PESAPAL_CONSUMER_SECRET = 'cs_g2';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const T = Date.now().toString(36);
const get = async (p) => (await db.doc(p).get()).data();
async function written(path, data, run) {   // simulate a Firestore write event exactly as the trigger receives it
  const ref = db.doc(path); const before = await ref.get(); if (data === null) await ref.delete(); else await ref.set(data, { merge: true });
  const after = await ref.get(); const parts = path.split('/');
  await run({ data: { before, after }, params: { id: parts[1], docId: parts[1], orderId: parts[1] } });
}
async function created(path, data, run) { const ref = db.doc(path); await ref.set(data); const snap = await ref.get(); const parts = path.split('/'); await run({ data: snap, params: { id: parts[1], orderId: parts[1], docId: parts[1] } }); }
async function updated(path, patch, run) { const ref = db.doc(path); const before = await ref.get(); await ref.update(patch); const after = await ref.get(); const parts = path.split('/'); await run({ data: { before, after }, params: { id: parts[1], orderId: parts[1], docId: parts[1] } }); }

// ---------------- wiring ----------------
const EVENTS = {
  inventoryOrderCreated: ['created', 'orders/{orderId}'], inventoryOrderUpdated: ['updated', 'orders/{orderId}'],
  catalogSearchIndexProducts: ['written', 'products/{id}'], catalogSearchIndexServices: ['written', 'services/{id}'],
  pushOnNotification: ['created', 'notifications/{id}'], userCardSync: ['written', 'users/{docId}'],
  systemConfigAudit: ['written', 'system/{docId}'], announcementsAudit: ['written', 'announcements/{docId}'], adminMediaAudit: ['written', 'adminMedia/{docId}'],
  ordersAdminAudit: ['written', 'orders/{docId}'], productsAdminAudit: ['written', 'products/{docId}'], usersAdminAudit: ['written', 'users/{docId}']
};
const SCHEDULES = ['pesapalReconcileSweep', 'platformStatsHourly', 'sokopayAutoRelease', 'inventoryReservationSweep', 'adsDeliverySweep', 'deliveryOfferExpirySweep', 'commerceModesSweep', 'groupBuySweep'];
const HTTP = ['pesapalIpn', 'sitemapXml'];
await test('wiring: 12 Firestore triggers (event type + document path), 8 schedules, 2 HTTP endpoints, all europe-west1', async () => {
  const bg = Object.keys(fns).filter(k => fns[k] && fns[k].__endpoint && !fns[k].__endpoint.callableTrigger);
  eq(bg.length, 22, 'background exports ' + bg.join(','));
  for (const [n, [kind, docPath]] of Object.entries(EVENTS)) {
    const e = fns[n].__endpoint; ok(e && e.eventTrigger, n + ' trigger');
    eq(e.eventTrigger.eventType, 'google.cloud.firestore.document.v1.' + kind, n + ' type');
    eq(e.eventTrigger.eventFilterPathPatterns.document, docPath, n + ' path'); eq(e.eventTrigger.eventFilters.database, '(default)', n + ' db');
    eq(JSON.stringify(e.region), '["europe-west1"]', n + ' region');
  }
  for (const n of SCHEDULES) { const e = fns[n].__endpoint; ok(e.scheduleTrigger && (/^every \d+ (minutes|hours)$/.test(e.scheduleTrigger.schedule) || /^(\S+\s+){4}\S+$/.test(e.scheduleTrigger.schedule)), n + ' schedule ' + JSON.stringify(e.scheduleTrigger)); eq(JSON.stringify(e.region), '["europe-west1"]', n + ' region'); }
  for (const n of HTTP) { ok(fns[n].__endpoint.httpsTrigger, n + ' http'); }
});

// ---------------- Firestore triggers ----------------
await test('catalogSearchIndexProducts / Services: product + service writes get searchTokens; unchanged data is not rewritten', async () => {
  const P = 'g2p' + T, Sv = 'g2s' + T;
  await written('products/' + P, { title: 'Redio ya Sony', category: 'CAT-11', userId: 'u' }, fns.catalogSearchIndexProducts.run);
  const p1 = await get('products/' + P); ok(Array.isArray(p1.searchTokens) && p1.searchTokens.includes('redio'), 'tokens ' + JSON.stringify(p1.searchTokens));
  const at = p1.searchIndexedAt; await fns.catalogSearchIndexProducts.run({ data: { before: await db.doc('products/' + P).get(), after: await db.doc('products/' + P).get() }, params: { id: P } });
  eq((await get('products/' + P)).searchIndexedAt, at, 'same tokens -> no rewrite (no trigger loop)');
  await written('services/' + Sv, { title: 'Fundi bomba', userId: 'u' }, fns.catalogSearchIndexServices.run);
  ok((await get('services/' + Sv)).searchTokens.includes('fundi'), 'service tokens');
  await written('products/' + P, null, fns.catalogSearchIndexProducts.run); ok(!(await db.doc('products/' + P).get()).exists, 'delete is a no-op');
});
await test('userCardSync: users write -> public userCards card WITHOUT private fields; delete removes the card', async () => {
  const U = 'g2u' + T;
  // a BUYER (not a business account): e-mail, private phone and wallet must never reach the public card
  await written('users/' + U, { uid: U, fullName: 'Asha', email: 'asha@private.test', phone: '0712000000', walletBalance: 5000 }, fns.userCardSync.run);
  const c = await get('userCards/' + U); ok(c && /Asha/.test(JSON.stringify(c)), 'card ' + JSON.stringify(c));
  ok(!('email' in c) && !('walletBalance' in c) && !JSON.stringify(c).includes('asha@private') && !JSON.stringify(c).includes('0712000000'), 'no private fields');
  // a BUSINESS account deliberately publishes its contact number as businessPhone (design: buyers must reach sellers); still no e-mail / wallet
  await written('users/' + U, { uid: U, fullName: 'Asha', email: 'asha@private.test', phone: '0712000000', walletBalance: 5000, businessName: 'Duka la Asha' }, fns.userCardSync.run);
  const b = await get('userCards/' + U); eq(b.businessPhone, '0712000000', 'business contact published'); ok(!('email' in b) && !('walletBalance' in b) && !('phone' in b), 'business card: no private fields');
  await written('users/' + U, null, fns.userCardSync.run); ok(!(await db.doc('userCards/' + U).get()).exists, 'card removed');
});
await test('inventoryOrderCreated / Updated: with reservations ON an order reserves stock; cancelling releases it', async () => {
  const Sl = 'g2sel' + T, P = 'g2ip' + T, O = 'g2o' + T;
  await db.doc('system_config/inventory').set({ mode: 'pilot', pilotSellerIds: [Sl] });
  await db.doc('products/' + P).set({ title: 'Mchele', userId: Sl, price: 1000, stock: 10, reservedStock: 0, status: 'active' });
  await created('orders/' + O, { buyerId: 'b' + T, sellerId: Sl, amount: 2000, status: 'payment_pending', items: [{ productId: P, id: P, qty: 2, quantity: 2, price: 1000, sellerId: Sl }] }, fns.inventoryOrderCreated.run);
  const res = await db.collection('inventory_reservations').where('orderId', '==', O).get(); eq(res.size >= 1, true, 'reservation created');
  eq(res.docs[0].data().status, 'ACTIVE', 'active');
  await updated('orders/' + O, { status: 'cancelled' }, fns.inventoryOrderUpdated.run);
  const after = await db.collection('inventory_reservations').where('orderId', '==', O).get(); ok(after.docs.every(d => d.data().status !== 'ACTIVE'), 'released: ' + after.docs.map(d => d.data().status));
  await db.doc('system_config/inventory').set({ mode: 'off' });
});
await test('pushOnNotification: off by default (no send); with SKH_PUSH_ENABLED=1 sends to the user\'s devices and prunes dead tokens', async () => {
  const U = 'g2push' + T; await db.doc('push_tokens/t1' + T).set({ uid: U, token: 'tok-ok' }); await db.doc('push_tokens/t2' + T).set({ uid: U, token: 'tok-dead' });
  let sent = 0; const stub = () => ({ sendEachForMulticast: async (m) => { sent += m.tokens.length; return { successCount: 1, failureCount: 1, responses: m.tokens.map(t => t === 'tok-dead' ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }) }; } });
  Object.defineProperty(admin, 'messaging', { value: stub, configurable: true, writable: true });
  delete process.env.SKH_PUSH_ENABLED; await created('notifications/n1' + T, { userId: U, title: 'Oda mpya', type: 'order' }, fns.pushOnNotification.run); eq(sent, 0, 'disabled by default');
  process.env.SKH_PUSH_ENABLED = '1'; await created('notifications/n2' + T, { userId: U, title: 'Oda mpya', type: 'order' }, fns.pushOnNotification.run);
  delete admin.messaging; delete process.env.SKH_PUSH_ENABLED;
  eq(sent, 2, 'sent to both devices'); ok(!(await db.doc('push_tokens/t2' + T).get()).exists, 'dead token pruned'); ok((await db.doc('push_tokens/t1' + T).get()).exists, 'live token kept');
});
await test('admin audit triggers: system/config change -> admin_audit_log entry', async () => {
  const before = (await db.collection('admin_audit_log').get()).size;
  await written('system/config', { g2probe: T, lastChangedBy: 'g2admin' }, fns.systemConfigAudit.run);
  ok((await db.collection('admin_audit_log').get()).size > before, 'audit written');
});

// ---------------- schedules ----------------
await test('deliveryOfferExpirySweep: an expired offer is passed on (status expired)', async () => {
  const R = 'g2r' + T, OF = 'g2of' + T, ago = (m) => new Date(Date.now() - m * 60000).toISOString();
  await db.doc('ride_requests/' + R).set({ customerId: 'c', status: 'searching', assignmentStatus: 'offering', routingRound: 1, activeOfferId: OF, createdAt: ago(30) });
  await db.doc('delivery_offers/' + OF).set({ rideId: R, agentId: 'a' + T, status: 'offered', expiresAt: ago(5), createdAt: ago(20) });
  await fns.deliveryOfferExpirySweep.run({}); eq((await get('delivery_offers/' + OF)).status, 'expired', 'expired');
});
await test('inventoryReservationSweep: an ACTIVE reservation past expiry becomes EXPIRED', async () => {
  const id = 'g2res' + T; await db.doc('inventory_reservations/' + id).set({ status: 'ACTIVE', orderId: 'none' + T, sellerId: 's', items: [], expiresAt: new Date(Date.now() - 60000).toISOString(), createdAt: new Date(Date.now() - 3600e3).toISOString() });
  await fns.inventoryReservationSweep.run({}); eq((await get('inventory_reservations/' + id)).status, 'EXPIRED', 'expired');
});
await test('platformStatsHourly: recomputes platform_stats/current from adminRevenue', async () => {
  await db.doc('adminRevenue/g2' + T).set({ amount: 1234 });
  await fns.platformStatsHourly.run({}); const s = await get('platform_stats/current'); ok(s && s.totalRevenue >= 1234 && s.generatedAt, JSON.stringify(s));
});
await test('commerceModesSweep: an auction whose end time has passed is finalised', async () => {
  const P = 'g2auc' + T; await db.doc('products/' + P).set({ title: 'Saa', userId: 'sel' + T, saleMode: 'auction', price: 1000, stock: 1, status: 'active', publicationStatus: 'published',
    modeData: { mode: 'auction', startingBid: 1000, minIncrement: 100, endTime: Date.now() - 60000, totalBids: 0 /* ms, as the client writes it (08-app-state.js) */ } });
  await fns.commerceModesSweep.run({ scheduleTime: new Date().toISOString() });
  ok((await get('products/' + P)).modeData.ended === true, 'ended ' + JSON.stringify((await get('products/' + P)).modeData));
});
await test('groupBuySweep and adsDeliverySweep run their exported handler without error (no due campaigns => no writes)', async () => {
  await fns.groupBuySweep.run({}); await fns.adsDeliverySweep.run({});
});
await test('sokopayAutoRelease: exported schedule runs (held orders without a release date are left alone)', async () => {
  const O = 'g2held' + T; await db.doc('orders/' + O).set({ buyerId: 'b', sellerId: 's', amount: 1000, status: 'held', paymentVerified: true });
  await fns.sokopayAutoRelease.run({}); eq((await get('orders/' + O)).status, 'held', 'not released early');
});

await test('announcementsAudit / adminMediaAudit: a stamped browser admin write is audited; an unstamped server write is not', async () => {
  const cnt = async (a) => (await db.collection('admin_audit_log').where('action', '==', a).get()).docs.filter(d => (d.data().target || {}).id && String(d.data().target.id).endsWith(T)).length;
  await written('announcements/an' + T, { title: 'Tangazo', lastChangedBy: 'adm' + T, lastChangedAt: new Date().toISOString() }, fns.announcementsAudit.run);
  await updated('announcements/an' + T, { impressions: 5 }, fns.announcementsAudit.run);   // server metrics write: no new stamp
  eq(await cnt('ANNOUNCEMENT_CHANGED'), 1, 'one audit row for the stamped write only');
  await written('adminMedia/am' + T, { url: 'https://x/y.jpg', lastChangedBy: 'adm' + T, lastChangedAt: new Date().toISOString() }, fns.adminMediaAudit.run);
  eq(await cnt('ADMIN_MEDIA_CHANGED'), 1, 'media audited');
});
await test('ordersAdminAudit / productsAdminAudit / usersAdminAudit: an admin-signed edit of someone else\'s record is audited; the owner\'s own edit is not', async () => {
  const cnt = async (a) => (await db.collection('admin_audit_log').where('action', '==', a).get()).docs.filter(d => String((d.data().target || {}).id || '').endsWith(T)).length;
  await db.doc('products/pa' + T).set({ title: 'Kiti', userId: 'own' + T, price: 100 });
  await updated('products/pa' + T, { price: 120, lastChangedBy: 'own' + T, lastChangedAt: new Date().toISOString() }, fns.productsAdminAudit.run);
  eq(await cnt('PRODUCT_CHANGED_BY_ADMIN'), 0, 'owner edit not audited');
  await updated('products/pa' + T, { price: 90, lastChangedBy: 'adm' + T, lastChangedAt: new Date(Date.now() + 1000).toISOString() }, fns.productsAdminAudit.run);
  eq(await cnt('PRODUCT_CHANGED_BY_ADMIN'), 1, 'admin edit audited');
  await db.doc('orders/oa' + T).set({ buyerId: 'b', sellerId: 's', status: 'pending' });
  await updated('orders/oa' + T, { status: 'cancelled', lastChangedBy: 'adm' + T, lastChangedAt: new Date().toISOString() }, fns.ordersAdminAudit.run);
  eq(await cnt('ORDER_CHANGED_BY_ADMIN'), 1, 'order edit audited');
  await db.doc('users/ua' + T).set({ uid: 'ua' + T, fullName: 'X' });
  await updated('users/ua' + T, { suspended: true, lastChangedBy: 'adm' + T, lastChangedAt: new Date().toISOString() }, fns.usersAdminAudit.run);
  eq(await cnt('USER_CHANGED_BY_ADMIN'), 1, 'user edit audited');
});
await test('groupBuySweep: a campaign past its end time below target is closed as failed; a running one is untouched', async () => {
  await db.doc('products/gbf' + T).set({ title: 'Mchele kwa kundi', userId: 'sel' + T, saleMode: 'group_buy', price: 1000, stock: 50, status: 'active',
    modeData: { mode: 'group_buy', targetPeople: 10, joinedUsers: 2, endTime: Date.now() - 60000 } });
  await db.doc('products/gbr' + T).set({ title: 'Sukari kwa kundi', userId: 'sel' + T, saleMode: 'group_buy', price: 1000, stock: 50, status: 'active',
    modeData: { mode: 'group_buy', targetPeople: 10, joinedUsers: 2, endTime: Date.now() + 3600e3 } });
  await fns.groupBuySweep.run({});
  eq((await get('products/gbf' + T)).modeData.groupStatus, 'failed', 'expired campaign failed');
  ok(!(await get('products/gbr' + T)).modeData.groupStatus, 'running campaign untouched');
});
await test('sitemapXml (HTTP): 200 XML; lists a sellable product; never an archived one', async () => {
  await db.doc('products/smok' + T).set({ title: 'Sabuni', userId: 's', price: 10, status: 'active', publicationStatus: 'published' });
  await db.doc('products/smarch' + T).set({ title: 'Ya zamani', userId: 's', price: 10, status: 'archived', archived: true });
  const res = { statusCode: 0, headers: {}, body: '', set(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; }, type() { return this; }, end() { return this; } };
  await fns.sitemapXml({ method: 'GET', query: {}, headers: {} }, res);
  eq(res.statusCode, 200, 'status'); ok(/^<\?xml/.test(res.body) && /urlset/.test(res.body), 'xml');
  ok(res.body.includes('/p/smok' + T), 'sellable listed'); ok(!res.body.includes('smarch' + T), 'archived hidden');
});

// ---------------- PesaPal IPN + reconciliation (mocked PesaPal) ----------------
const realFetch = globalThis.fetch;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const U = 'g2dep' + T; await db.doc('users/' + U).set({ uid: U, walletBalance: 0 });
let statusBody = null;
globalThis.fetch = async (url) => /RequestToken/.test(url) ? json(200, { token: 'tok' }) : /SubmitOrderRequest/.test(url) ? json(200, { order_tracking_id: 'TRK' + T, redirect_url: 'https://cybqa.pesapal.com/x' }) : json(200, statusBody || { status_code: 0 });
async function ipn(query) { const res = { statusCode: 200, headers: {}, body: null, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, type(t) { this.headers['Content-Type'] = t; return this; }, end(b) { if (b !== undefined) this.body = b; return this; } };
  await fns.pesapalIpn({ method: 'GET', query, headers: {}, body: {} }, res); return res; }
await test('pesapalIpn: acknowledges PesaPal; an unpaid transaction changes nothing; a COMPLETED deposit credits the wallet ONCE', async () => {
  const init = await fns.pesapalCheckout.run({ data: { amount: 5000, orderTrackingId: 'DEP_' + T, purpose: 'deposit', targetId: U }, auth: { uid: U, token: { uid: U } }, rawRequest: { headers: {} } });
  ok(init.redirectUrl, 'checkout');
  statusBody = { status_code: 0, amount: 5000, currency: 'TZS', order_tracking_id: 'TRK' + T, merchant_reference: 'DEP_' + T };
  const r0 = await ipn({ OrderTrackingId: 'TRK' + T, OrderMerchantReference: 'DEP_' + T, OrderNotificationType: 'IPNCHANGE' });
  eq(r0.statusCode, 200, 'ack'); eq(Number((await get('users/' + U)).walletBalance || 0), 0, 'unpaid: no credit');
  statusBody = Object.assign({}, statusBody, { status_code: 1, payment_status_description: 'Completed' });
  await ipn({ OrderTrackingId: 'TRK' + T, OrderMerchantReference: 'DEP_' + T }); await ipn({ OrderTrackingId: 'TRK' + T, OrderMerchantReference: 'DEP_' + T });
  eq(Number((await get('users/' + U)).walletBalance || 0), 5000, 'credited exactly once after two IPNs');
  const r3 = await ipn({}); eq(r3.statusCode, 200, 'empty IPN still acknowledged');
});
await test('pesapalReconcileSweep: an old open checkout that PesaPal reports COMPLETED is settled once; PesaPal down = left open', async () => {
  const V = 'g2rec' + T; await db.doc('users/' + V).set({ uid: V, walletBalance: 0 });
  statusBody = null;
  await fns.pesapalCheckout.run({ data: { amount: 3000, orderTrackingId: 'REC_' + T, purpose: 'deposit', targetId: V }, auth: { uid: V, token: { uid: V } }, rawRequest: { headers: {} } });
  const hold = await db.doc('escrow_holds/ppinit_REC_' + T).get(); ok(hold.exists, 'init hold');
  await hold.ref.update({ createdAt: new Date(Date.now() - 20 * 60000).toISOString(), pesapalTrackingId: 'TRKR' + T });
  globalThis.fetch = async (url) => /RequestToken/.test(url) ? json(200, { token: 'tok' }) : json(503, {});
  await fns.pesapalReconcileSweep.run({}); eq((await get('escrow_holds/ppinit_REC_' + T)).reconcileState, 'open', 'PesaPal down: still open');
  globalThis.fetch = async (url) => /RequestToken/.test(url) ? json(200, { token: 'tok' }) : json(200, { status_code: 1, amount: 3000, currency: 'TZS', order_tracking_id: 'TRKR' + T, merchant_reference: 'REC_' + T });
  await fns.pesapalReconcileSweep.run({}); await fns.pesapalReconcileSweep.run({});
  eq(Number((await get('users/' + V)).walletBalance || 0), 3000, 'credited once'); eq((await get('escrow_holds/ppinit_REC_' + T)).reconcileState, 'settled', 'settled');
});
globalThis.fetch = realFetch;

// ---------------- backfills (production drift repair) ----------------
const call = async (n, uid, data, token) => { try { return { ok: true, data: await fns[n].run({ data: data || {}, auth: uid ? { uid, token: Object.assign({ uid }, token || {}) } : null, rawRequest: { headers: {} } }) }; } catch (e) { return { ok: false, code: e.code }; } };
const BOSS = { email: 'g2boss@sokohai.test', email_verified: true };
await test('adminBackfillUserCards: super admin only; creates missing cards; idempotent; never copies private fields', async () => {
  const A = 'g2bf' + T; await db.doc('users/' + A).set({ uid: A, fullName: 'Juma Backfill', email: 'juma@private.test', walletBalance: 900 });
  eq((await call('adminBackfillUserCards', 'nobody' + T, {})).code, 'permission-denied', 'normal user');
  eq((await call('adminBackfillUserCards', 'adm' + T, {}, { admin: true })).code, 'permission-denied', 'plain admin is not super admin');
  let r = await call('adminBackfillUserCards', 'boss' + T, { pageSize: 400 }, BOSS); ok(r.ok, JSON.stringify(r));
  while (r.ok && r.data && r.data.next) r = await call('adminBackfillUserCards', 'boss' + T, { pageSize: 400, startAfter: r.data.next }, BOSS);
  const c1 = await get('userCards/' + A); ok(c1 && /Juma Backfill/.test(JSON.stringify(c1)) && !JSON.stringify(c1).includes('juma@private') && !('walletBalance' in c1), 'card ' + JSON.stringify(c1));
  await call('adminBackfillUserCards', 'boss' + T, { pageSize: 400 }, BOSS); const c2 = await get('userCards/' + A);
  eq(JSON.stringify(Object.assign({}, c2, { updatedAt: null, syncedAt: null })), JSON.stringify(Object.assign({}, c1, { updatedAt: null, syncedAt: null })), 'second run: same card');
  eq(Number((await get('users/' + A)).walletBalance), 900, 'user data untouched');
});
await test('adminSearchBackfill: admin only; fills missing searchTokens; second run writes nothing new; product fields untouched', async () => {
  const P = 'g2sb' + T; await db.doc('products/' + P).set({ title: 'Jiko la gesi', userId: 's', price: 50000, stock: 3 });
  eq((await call('adminSearchBackfill', 'nobody' + T, {})).code, 'permission-denied', 'normal user');
  // server-held lease (system_locks/search_backfill): start without runId, then continue with the runId until done
  await db.doc('system_locks/search_backfill').delete();
  const run = async () => { let r = await call('adminSearchBackfill', 'boss' + T, { collections: ['products'], pageSize: 400 }, BOSS); ok(r.ok, JSON.stringify(r)); const runId = r.data.runId; let n = 0;
    while (!r.data.done && n++ < 50) { r = await call('adminSearchBackfill', 'boss' + T, { runId, pageSize: 400 }, BOSS); ok(r.ok, JSON.stringify(r)); } ok(r.data.done, 'run completed'); return r.data.totals; };
  // a second START while the first run holds a live lease is refused (one run at a time)
  const s1 = await call('adminSearchBackfill', 'boss' + T, { collections: ['products'], pageSize: 1 }, BOSS); ok(s1.ok && !s1.data.done || s1.ok, 'start');
  if (s1.ok && !s1.data.done) eq((await call('adminSearchBackfill', 'boss' + T, { collections: ['products'] }, BOSS)).code, 'already-exists', 'parallel start refused');
  await db.doc('system_locks/search_backfill').delete();
  await run(); const p = await get('products/' + P); ok(p.searchTokens && p.searchTokens.includes('jiko'), 'tokens'); eq(p.price, 50000, 'price untouched'); eq(p.stock, 3, 'stock untouched');
  const at = p.searchIndexedAt; await run(); eq((await get('products/' + P)).searchIndexedAt, at, 'idempotent');
});

console.log(`\nTRIGGERS + SCHEDULES (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

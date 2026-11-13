#!/usr/bin/env node
/* [R16] Emulator regression tests for two server defects found by the R16 browser journeys:
 *  1. reviewsPublish / resolveCommentEvidence destructured ({ id, od }) from { id, d } -> od undefined ->
 *     TypeError for every buyer with an order -> no review ever got its "verified purchase" badge.
 *  2. Pickup Token (PK) of a product-ORDER ride was shared with the ride customer (= the BUYER) instead of
 *     the order's seller (the real sender), in deliveryOfferAccept, deliveryAccept and deliveryGenerateToken.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_r16_server_fixes.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const ok = (c, m) => { if (!c) throw new Error(m); };
async function call(name, uid, data) {
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: { uid, token: { uid, email: uid + '@u.test', email_verified: true } }, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const B = 'r16B', S = 'r16S', D = 'r16D', D2 = 'r16D2', T = Date.now().toString(36);
await db.doc('rateLimits/' + B).delete().catch(() => {}); // reviews are limited to 3/min per user

await test('reviewsPublish: buyer with a COMPLETED product order gets verifiedPurchase (was a TypeError)', async () => {
  await db.doc('products/r16p_' + T).set({ title: 'Kitu', userId: S, comments: [] });
  await db.doc('orders/r16o_' + T).set({ buyerId: B, sellerId: S, productId: 'r16p_' + T, status: 'completed', amount: 1000 });
  await db.doc('orders/r16other_' + T).set({ buyerId: B, sellerId: S, productId: 'something-else', status: 'held', amount: 1 });
  const r = await call('reviewsPublish', B, { targetId: 'r16p_' + T, targetType: 'product', rating: 4, text: 'Nzuri' });
  ok(r.ok, JSON.stringify(r)); ok(r.data.verifiedPurchase && r.data.verifiedPurchase.orderId === 'r16o_' + T, JSON.stringify(r.data));
});
await test('reviewsPublish: no order = no badge (still publishes, never fakes)', async () => {
  await db.doc('products/r16q_' + T).set({ title: 'Kingine', userId: S, comments: [] });
  const r = await call('reviewsPublish', 'r16nobody', { targetId: 'r16q_' + T, rating: 3, text: 'Sawa' });
  ok(r.ok && r.data.verifiedPurchase === null, JSON.stringify(r));
});
await test('service review: completed service order linked by serviceId -> verified', async () => {
  await db.doc('services/r16s_' + T).set({ title: 'Fundi', userId: S, comments: [] });
  await db.doc('orders/r16so_' + T).set({ buyerId: B, sellerId: S, serviceId: 'r16s_' + T, collectionName: 'services', commerceType: 'service', status: 'completed', amount: 5000 });
  const r = await call('reviewsPublish', B, { targetId: 'r16s_' + T, targetType: 'service', rating: 5, text: 'Safi' });
  ok(r.ok && r.data.verifiedPurchase && r.data.verifiedPurchase.orderId === 'r16so_' + T, JSON.stringify(r));
});

for (const u of [D, D2]) await db.doc('users/' + u).set({ walletBalance: 0, isApprovedAgent: true, agentApprovedBy: 'a1', displayName: u });
await db.doc('users/' + B).set({ walletBalance: 0 }, { merge: true }); await db.doc('users/' + S).set({ walletBalance: 0 }, { merge: true });
const orderRide = async (id) => {
  await db.doc('orders/o_' + id).set({ buyerId: B, sellerId: S, amount: 20000, status: 'held', commerceType: 'product' });
  await db.doc('ride_requests/' + id).set({ customerId: B, orderId: 'o_' + id, status: 'searching', fare: 3000, fromLocation: 'A', toLocation: 'B' });
};
const parts = async (id) => ((await db.doc('delivery_tokens/' + id + '_pickup').get()).data() || {}).participants || [];

await test('deliveryAccept on an ORDER ride: PK shared with seller + driver, not the buyer', async () => {
  const id = 'r16ra_' + T; await orderRide(id);
  const a = await call('deliveryAccept', D, { rideId: id }); ok(a.ok, JSON.stringify(a));
  const p = await parts(id); ok(p.includes(S) && p.includes(D) && !p.includes(B), JSON.stringify(p));
});
await test('deliveryOfferAccept on an ORDER ride: PK shared with seller + agent, not the buyer', async () => {
  const id = 'r16ro_' + T; await orderRide(id);
  await db.doc('delivery_offers/of_' + id).set({ agentId: D2, rideId: id, customerId: B, orderId: 'o_' + id, status: 'offered', expiresAt: new Date(Date.now() + 3600e3).toISOString() });
  const a = await call('deliveryOfferAccept', D2, { offerId: 'of_' + id }); ok(a.ok, JSON.stringify(a));
  const p = await parts(id); ok(p.includes(S) && p.includes(D2) && !p.includes(B), JSON.stringify(p));
});
await test('deliveryGenerateToken pickup: buyer refused on an ORDER ride; seller allowed', async () => {
  const id = 'r16ra_' + T;
  await db.doc('ride_requests/' + id).update({ pickupTokenStatus: 'expired' });
  const b = await call('deliveryGenerateToken', B, { rideId: id, kind: 'pickup' }); ok(!b.ok && b.code === 'permission-denied', JSON.stringify(b));
  const s = await call('deliveryGenerateToken', S, { rideId: id, kind: 'pickup' }); ok(s.ok && /^PK-/.test(s.data.token), JSON.stringify(s));
  const p = await parts(id); ok(p.includes(S) && !p.includes(B), JSON.stringify(p));
});
await test('transport booking (no order): the customer is still the sender', async () => {
  const id = 'r16rt_' + T;
  await db.doc('ride_requests/' + id).set({ customerId: B, status: 'searching', fare: 2000, fromLocation: 'A', toLocation: 'B' });
  const a = await call('deliveryAccept', D, { rideId: id }); ok(a.ok, JSON.stringify(a));
  const p = await parts(id); ok(p.includes(B) && p.includes(D), JSON.stringify(p));
});
console.log(`\nR16 SERVER FIXES: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

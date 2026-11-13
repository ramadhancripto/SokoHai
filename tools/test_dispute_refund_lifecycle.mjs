#!/usr/bin/env node
/* [R15] Dispute -> refund lifecycle (SokoPay escrow), emulator only, wallet money only (no provider).
 * paid order (escrow hold) -> buyer opens dispute -> release blocked for everyone -> outsider cannot
 * open/resolve -> admin refund_buyer -> buyer wallet +amount exactly once, seller 0, order
 * refunded_by_admin, dispute resolved, wallet_ledger + admin_audit_log + notifications written ->
 * repeat resolve is a no-op -> release after refund is refused.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_dispute_refund_lifecycle.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
async function call(name, uid, data, extra) {
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: uid ? { uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) } : undefined, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const ADM = { admin: true };
const bal = async (u) => Number(((await db.doc('users/' + u).get()).data() || {}).walletBalance || 0);
const O = 'drl1', B = 'drlBuyer', S = 'drlSeller', X = 'drlEve', AMT = 23500;

await db.doc('users/' + B).set({ uid: B, walletBalance: 0 });
await db.doc('users/' + S).set({ uid: S, walletBalance: 0 });
await db.doc('users/' + X).set({ uid: X, walletBalance: 0 });
await db.doc('orders/' + O).set({ buyerId: B, sellerId: S, amount: AMT, status: 'held', paymentStatus: 'paid', paymentMethod: 'wallet', createdAt: new Date().toISOString() });
await db.doc('escrow_holds/order_' + O).set({ kind: 'escrow_hold', target: 'order', targetId: O, amount: AMT, payerUid: B, payeeUid: S, method: 'wallet', released: false, verifiedAt: new Date().toISOString() });
for (const c of ['disputes']) { const d = await db.doc(c + '/order_' + O).get(); if (d.exists) await d.ref.delete(); }

await test('outsider cannot open a dispute; a short reason is refused', async () => {
  eq((await call('disputeOpen', X, { orderId: O, reason: 'si yangu kabisa' })).code, 'permission-denied', 'outsider');
  eq((await call('disputeOpen', B, { orderId: O, reason: 'x' })).code, 'invalid-argument', 'short');
});
await test('buyer opens a dispute: dispute record open, money still held', async () => {
  const r = await call('disputeOpen', B, { orderId: O, reason: 'Bidhaa imefika ikiwa imevunjika' }); ok(r.ok, JSON.stringify(r));
  const d = (await db.doc('disputes/order_' + O).get()).data(); eq(d.status, 'open', 'dispute'); eq(d.openedByRole, 'buyer', 'role');
  eq((await db.doc('escrow_holds/order_' + O).get()).data().released, false, 'hold');
});
await test('while disputed nobody can release to the seller (buyer or seller)', async () => {
  for (const who of [B, S]) { const r = await call('escrowRelease', who, { orderId: O }); eq(r.ok, false, who + ' release'); }
  eq(await bal(S), 0, 'seller 0');
});
await test('non-admin cannot resolve; admin needs a real reason', async () => {
  eq((await call('adminResolveDispute', S, { orderId: O, outcome: 'release_seller', reason: 'najilipa mwenyewe leo' })).code, 'permission-denied', 'seller');
  eq((await call('adminResolveDispute', 'drlAdmin', { orderId: O, outcome: 'refund_buyer', reason: 'fupi' }, ADM)).code, 'invalid-argument', 'reason');
});
await test('admin refund_buyer: buyer wallet +amount, seller 0, order refunded_by_admin, dispute resolved', async () => {
  const r = await call('adminResolveDispute', 'drlAdmin', { orderId: O, outcome: 'refund_buyer', reason: 'Picha zinaonyesha bidhaa imevunjika' }, ADM); ok(r.ok, JSON.stringify(r));
  eq(await bal(B), AMT, 'buyer'); eq(await bal(S), 0, 'seller');
  const o = (await db.doc('orders/' + O).get()).data(); eq(o.status, 'refunded_by_admin', 'order'); eq(o.refundStatus, 'refunded_to_wallet', 'refundStatus');
  eq((await db.doc('disputes/order_' + O).get()).data().status, 'resolved', 'dispute');
  eq((await db.doc('escrow_holds/order_' + O).get()).data().released, true, 'hold closed');
});
await test('ledger, audit and both parties notified', async () => {
  const l = (await db.doc('wallet_ledger/dispute_order_' + O + '_buyer').get()).data(); eq(l && l.amountTSh, AMT, 'ledger'); eq(l.type, 'refund', 'type');
  const a = await db.collection('admin_audit_log').where('action', '==', 'DISPUTE_RESOLVED').get();
  ok(a.docs.some(d => JSON.stringify(d.data()).indexOf(O) !== -1), 'audit');
  for (const u of [B, S]) ok(!(await db.collection('notifications').where('userId', '==', u).where('title', '==', 'Uamuzi wa mgogoro').get()).empty, 'notif ' + u);
});
await test('repeat resolve (any outcome) pays nothing more; release after refund refused', async () => {
  const r = await call('adminResolveDispute', 'drlAdmin', { orderId: O, outcome: 'release_seller', reason: 'jaribio la kulipa mara ya pili' }, ADM);
  ok(r.ok && r.data.already === true, JSON.stringify(r));
  eq(await bal(B), AMT, 'buyer same'); eq(await bal(S), 0, 'seller same');
  eq((await call('escrowRelease', B, { orderId: O })).ok, false, 'release after refund');
  eq(await bal(S), 0, 'seller still 0');
});
console.log(`\nDISPUTE REFUND LIFECYCLE: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

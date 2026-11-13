#!/usr/bin/env node
/* [R16] orderWalletPay — cart / buy-now orders paid from the SokoPay wallet (emulator only, no real money).
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_order_wallet_pay.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
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
async function call(name, uid, data) {
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: { uid, token: { uid, email: uid + '@u.test', email_verified: true } }, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const bal = async (u) => Number(((await db.doc('users/' + u).get()).data() || {}).walletBalance || 0);
const T = Date.now().toString(36), B = 'owpB' + T, S = 'owpS' + T, X = 'owpX' + T, P = 'owpP' + T;
await db.doc('users/' + B).set({ walletBalance: 100000 });
await db.doc('users/' + S).set({ walletBalance: 0 });
await db.doc('users/' + X).set({ walletBalance: 100000 });
await db.doc('products/' + P).set({ title: 'Redio', userId: S, price: 20000, stock: 5, status: 'active' });
const order = (id, amount, qty) => db.doc('orders/' + id).set({ buyerId: B, sellerId: S, amount, status: 'payment_pending', paymentStatus: 'pending',
  items: [{ productId: P, id: P, title: 'Redio', price: 20000, qty: qty || 1, quantity: qty || 1, sellerId: S }], itemTitle: 'Smart Cart Order', date: new Date().toISOString() });
await order('o1' + T, 40300, 2);     // 2 x 20,000 + client escrow fee
await order('o2' + T, 15000, 1);     // underpriced (product costs 20,000)

await test('only the buyer can pay; services are refused here', async () => {
  eq((await call('orderWalletPay', X, { orderIds: ['o1' + T] })).code, 'permission-denied', 'stranger');
  eq(await bal(X), 100000, 'stranger not debited');
});
await test('underpriced order: refused BEFORE any debit (PRICE_CHANGED)', async () => {
  const r = await call('orderWalletPay', B, { orderIds: ['o2' + T] });
  eq(r.ok, false, 'refused'); ok(/PRICE_CHANGED/.test(r.message), r.message); eq(await bal(B), 100000, 'no debit');
});
await test('changed total vs what the buyer saw: refused, no debit', async () => {
  const r = await call('orderWalletPay', B, { orderIds: ['o1' + T], expectedTotal: 40000 });
  eq(r.ok, false, 'refused'); eq(await bal(B), 100000, 'no debit');
});
await test('pay: wallet debited once, order held + verified by wallet, escrow hold, ledger (stock follows the same settlement as PesaPal)', async () => {
  const r = await call('orderWalletPay', B, { orderIds: ['o1' + T], expectedTotal: 40300 });
  ok(r.ok, JSON.stringify(r)); eq(r.data.applied, 40300, 'applied'); eq(r.data.refunded, 0, 'refund');
  eq(await bal(B), 59700, 'buyer debited');
  const o = (await db.doc('orders/o1' + T).get()).data();
  eq(o.status, 'held', 'held'); eq(o.paymentVerified, true, 'verified'); eq(o.paymentVerifiedBy, 'wallet', 'by wallet');
  const h = (await db.doc('escrow_holds/order_o1' + T).get()).data(); eq(h.method, 'wallet', 'hold method'); eq(h.amount, 40300, 'hold amount');
  const l = (await db.doc('wallet_ledger/wltpay_' + o.paymentRef).get()).data(); eq(l.amountTSh, -40300, 'ledger');
});
await test('paying again is a no-op (no second debit)', async () => {
  const r = await call('orderWalletPay', B, { orderIds: ['o1' + T] });
  ok(r.ok && r.data.already === true, JSON.stringify(r)); eq(await bal(B), 59700, 'no double debit');
});
await test('insufficient balance: refused, nothing changes', async () => {
  await order('o3' + T, 80600, 4);
  const r = await call('orderWalletPay', B, { orderIds: ['o3' + T] });
  eq(r.ok, false, 'refused'); ok(/INSUFFICIENT/.test(r.message), r.message); eq(await bal(B), 59700, 'unchanged');
  eq((await db.doc('orders/o3' + T).get()).data().paymentRef, undefined, 'no ref written');
});
await test('the held order releases to the seller through the normal escrow path', async () => {
  const code = await call('orderDeliveryCodeIssue', B, { orderId: 'o1' + T }); ok(code.ok, JSON.stringify(code));
  ok((await call('orderConfirmDelivery', S, { orderId: 'o1' + T, code: code.data.code })).ok, 'confirm');
  ok((await call('escrowRelease', B, { orderId: 'o1' + T })).ok, 'release');
  ok(await bal(S) > 0, 'seller paid'); eq((await db.doc('orders/o1' + T).get()).data().status, 'completed', 'completed');
});
await test('rules: a browser cannot write a WLT_ payment reference', async () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  ok((await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) })).ok, 'rules load');
  const su = await (await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owp' + T + '@rules.test', password: 'secret123', returnSecureToken: true }) })).json();
  await db.doc('orders/r' + T).set({ buyerId: su.localId, sellerId: S, amount: 1000, status: 'payment_pending' });
  const patch = (v) => fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/orders/r${T}?updateMask.fieldPaths=paymentRef`, { method: 'PATCH', headers: { authorization: 'Bearer ' + su.idToken, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { paymentRef: { stringValue: v } } }) }).then(r => r.status);
  eq(await patch('WLT_forged'), 403, 'WLT ref'); eq(await patch('ESCROW_123'), 200, 'normal ref still allowed');
});
console.log(`\nORDER WALLET PAY: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

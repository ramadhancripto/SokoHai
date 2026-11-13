#!/usr/bin/env node
/* [R16] Group Buy lifecycle + policy engine — emulator only (wallet money is emulator data).
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_group_buy_lifecycle.mjs */
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
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
async function call(name, uid, data, extra) {
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: { uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) }, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const ADM = { admin: true }, SUPER = { admin: true, superAdmin: true };
const bal = async (u) => Number(((await db.doc('users/' + u).get()).data() || {}).walletBalance || 0);
const md = async (p) => ((await db.doc('products/' + p).get()).data() || {}).modeData || {};
const T = Date.now().toString(36), S = 'gbS' + T, [M1, M2, M3, X] = ['gbM1', 'gbM2', 'gbM3', 'gbX'].map(x => x + T);
for (const u of [S, M1, M2, M3, X]) await db.doc('users/' + u).set({ walletBalance: u === S ? 0 : 200000 });
const later = (h) => Date.now() + h * 3600e3;
const camp = (id, extra) => db.doc('products/' + id).set(Object.assign({ title: 'Mchele ' + id, price: 50000, stock: 10, userId: S, saleMode: 'group_buy',
  modeData: { mode: 'group_buy', targetPeople: 3, discountValue: 5000, discountType: 'amount', joinedUsers: 1, participants: [], endTime: later(24) } }, extra || {}));
const order = (id, buyer, pid, amount) => db.doc('orders/' + id).set({ buyerId: buyer, sellerId: S, productId: pid, itemId: pid, quantity: 1, amount, status: 'payment_pending',
  items: [{ productId: pid, id: pid, qty: 1, quantity: 1, sellerId: S }], date: new Date().toISOString() });
await db.doc('system/config').set({ groupBuy: admin.firestore.FieldValue.delete(), modes: { group_buy: true } }, { merge: true });

/* ---------------- A. default policy: pay after target ---------------- */
const A = 'gbA' + T, F = 'gbF' + T, C = 'gbC' + T;
await camp(A); await camp(F, { modeData: { mode: 'group_buy', targetPeople: 3, discountValue: 5000, joinedUsers: 1, participants: [], endTime: later(24) } }); await camp(C);
await test('default policy is pay_after_target; money commitment is refused', async () => {
  const l = await call('adminGroupBuyList', 'adm', {}, ADM); ok(l.ok, JSON.stringify(l));
  eq(l.data.policy.effectiveMode, 'pay_after_target', 'mode'); eq(l.data.policy.realMoneyApproved, false, 'not approved');
  eq((await call('groupBuyCommitJoin', M1, { productId: A })).message, 'group_buy_lipa_baada_ya_lengo', 'commit refused');
  eq((await call('adminGroupBuyList', M1, {})).code, 'permission-denied', 'non-admin list');
});
await test('member cannot pay the group price before the target (refused before any debit)', async () => {
  ok((await call('groupBuyJoin', M1, { productId: A })).ok, 'M1 joins');
  await order('oA1' + T, M1, A, 45000);
  const r = await call('orderWalletPay', M1, { orderIds: ['oA1' + T] });
  eq(r.ok, false, 'refused'); ok(/group_buy_target_not_reached/.test(r.message), r.message); eq(await bal(M1), 200000, 'no debit');
});
await test('leave before target, rejoin; stranger cannot leave', async () => {
  eq((await call('groupBuyLeave', X, { productId: A })).message, 'si_mwanachama', 'stranger');
  ok((await call('groupBuyLeave', M1, { productId: A })).ok, 'leave'); eq((await md(A)).joinedUsers, 1, 'count down');
  ok((await call('groupBuyJoin', M1, { productId: A })).ok, 'rejoin');
});
await test('target reached -> settle opens the payment window; member pays the group price; stranger pays base', async () => {
  ok((await call('groupBuyJoin', M2, { productId: A })).ok, 'M2 joins');      // joined = 3 = target
  eq((await call('groupBuySettleNow', X, { productId: A })).code, 'permission-denied', 'stranger settle');
  const s = await call('groupBuySettleNow', S, { productId: A }); ok(s.ok && s.data.status === 'successful' && s.data.paymentDeadline > Date.now(), JSON.stringify(s));
  const r = await call('orderWalletPay', M1, { orderIds: ['oA1' + T] }); ok(r.ok, JSON.stringify(r));   // 50000 - 2*5000 = 40000 <= 45000
  eq((await db.doc('orders/oA1' + T).get()).data().status, 'held', 'held');
  await order('oAx' + T, X, A, 40000);
  const x = await call('orderWalletPay', X, { orderIds: ['oAx' + T] }); eq(x.ok, false, 'stranger at group price refused'); eq(await bal(X), 200000, 'no debit');
});
await test('after the payment window the member price is gone (closed)', async () => {
  await db.doc('products/' + A).update({ 'modeData.paymentDeadline': Date.now() - 1000 });
  const s = await call('groupBuySettleNow', S, { productId: A }); eq(s.data.status, 'closed', 'closed');
  await order('oA2' + T, M2, A, 40000);
  const r = await call('orderWalletPay', M2, { orderIds: ['oA2' + T] }); eq(r.ok, false, 'refused'); ok(/payment_expired/.test(r.message), r.message);
});
await test('deadline below target -> failed; members notified; nobody charged; joining refused', async () => {
  ok((await call('groupBuyJoin', M3, { productId: F })).ok, 'M3 joins F');
  await db.doc('products/' + F).update({ 'modeData.endTime': Date.now() - 1000 });
  const s = await call('groupBuySettleNow', 'adm', { productId: F }, ADM); eq(s.data.status, 'failed', 'failed'); eq(s.data.refunded, 0, 'nothing to refund');
  ok(!(await db.collection('notifications').where('userId', '==', M3).where('type', '==', 'group_buy_failed').get()).empty, 'M3 notified');
  eq((await call('groupBuyJoin', M2, { productId: F })).message, 'group_failed', 'join refused');
});
await test('cancel: needs owner/admin + reason; audited; joining refused after', async () => {
  ok((await call('groupBuyJoin', M1, { productId: C })).ok, 'join');
  eq((await call('groupBuyCancel', X, { productId: C, reason: 'sitaki tena hii' })).code, 'permission-denied', 'stranger');
  eq((await call('groupBuyCancel', S, { productId: C, reason: 'x' })).code, 'invalid-argument', 'reason');
  ok((await call('groupBuyCancel', S, { productId: C, reason: 'Mzigo haukufika kutoka kwa msambazaji' })).ok, 'cancel');
  eq((await md(C)).groupStatus, 'cancelled', 'status');
  ok(!(await db.collection('admin_audit_log').where('action', '==', 'group_buy_cancel').get()).empty, 'audit');
  eq((await call('groupBuyJoin', M2, { productId: C })).message, 'group_cancelled', 'join refused');
});

/* ---------------- B. escrow_commit (owner-approved policy) ---------------- */
const E = 'gbE' + T, G = 'gbG' + T;
await test('policy: admin may choose escrow_commit but only the SUPER admin approves real money; reason + audit', async () => {
  eq((await call('adminSetGroupBuyPolicy', M1, { paymentMode: 'escrow_commit', reason: 'jaribio la mgeni hapa' })).code, 'permission-denied', 'non-admin');
  ok((await call('adminSetGroupBuyPolicy', 'adm', { paymentMode: 'escrow_commit', reason: 'kuandaa sera ya escrow' }, ADM)).ok, 'mode');
  let l = await call('adminGroupBuyList', 'adm', {}, ADM); eq(l.data.policy.effectiveMode, 'pay_after_target', 'still safe without approval');
  eq((await call('adminSetGroupBuyPolicy', 'adm', { realMoneyApproved: true, reason: 'admin wa kawaida anajaribu' }, ADM)).code, 'permission-denied', 'admin cannot approve');
  ok((await call('adminSetGroupBuyPolicy', 'owner', { realMoneyApproved: true, reason: 'mmiliki ameidhinisha (emulator)' }, SUPER)).ok, 'super approves');
  l = await call('adminGroupBuyList', 'adm', {}, ADM); eq(l.data.policy.effectiveMode, 'escrow_commit', 'active');
  ok((await db.collection('admin_audit_log').where('action', '==', 'group_buy_policy').get()).size >= 2, 'audited');
});
await camp(E, { modeData: { mode: 'group_buy', targetPeople: 4, discountValue: 5000, discountType: 'amount', joinedUsers: 1, participants: [], endTime: later(24) } }); await camp(G);
await test('commit join debits the base price once; free join refused; insufficient balance refused', async () => {
  eq((await call('groupBuyJoin', M1, { productId: E })).message, 'tumia_ahadi_ya_malipo', 'free join refused');
  ok((await call('groupBuyCommitJoin', M1, { productId: E })).ok, 'M1 commits');
  const again = await call('groupBuyCommitJoin', M1, { productId: E }); ok(again.ok && again.data.already, 'idempotent');
  eq(await bal(M1), 200000 - 45000 - 50000, 'debited once (45000 order in part A + 50000 commit)');
  await db.doc('users/' + M3).set({ walletBalance: 100 });
  eq((await call('groupBuyCommitJoin', M3, { productId: E })).message, 'INSUFFICIENT_BALANCE', 'poor');
  await db.doc('users/' + M3).set({ walletBalance: 200000 });
});
await test('leave refunds the commitment exactly once', async () => {
  ok((await call('groupBuyCommitJoin', M2, { productId: E })).ok, 'M2 commits'); eq(await bal(M2), 150000, 'M2 debited');
  const lv = await call('groupBuyLeave', M2, { productId: E }); ok(lv.ok, 'leave ' + JSON.stringify(lv)); eq(await bal(M2), 200000, 'refunded');
  eq((await call('groupBuyLeave', M2, { productId: E })).message, 'si_mwanachama', 'second leave');
  eq(await bal(M2), 200000, 'no double refund');
});
await test('target reached -> escrowed orders at the final group price, difference refunded, ledger reconciles', async () => {
  ok((await call('groupBuyCommitJoin', M2, { productId: E })).ok, 'M2'); ok((await call('groupBuyCommitJoin', M3, { productId: E })).ok, 'M3');  // joined 4 = target 4
  const s = await call('groupBuySettleNow', S, { productId: E }); ok(s.ok && s.data.orders === 3, JSON.stringify(s));
  for (const m of [M1, M2, M3]) {
    const o = (await db.doc('orders/gb_' + E + '_' + m).get()).data(); eq(o.status, 'held', m + ' held'); eq(o.amount, 35000, m + ' final 50000-3*5000');
    ok((await db.doc('escrow_holds/order_gb_' + E + '_' + m).get()).exists, m + ' hold');
  }
  eq(await bal(M2), 200000 - 35000, 'M2 paid only the final price');
  const led = await db.collection('wallet_ledger').where('userId', '==', M2).get();
  const sum = led.docs.filter(d => d.data().productId === E).reduce((a, d) => a + d.data().amountTSh, 0); eq(sum, -35000, 'ledger sum');
  const again = await call('groupBuySettleNow', S, { productId: E }); ok(again.ok, 'second settle'); eq(await bal(M2), 165000, 'no double refund');
  eq((await call('groupBuyCancel', 'adm', { productId: E, reason: 'kujaribu baada ya oda' }, ADM)).message, 'oda_zimeshatengenezwa_tumia_mgogoro', 'cancel after orders');
  const r = await call('orderWalletPay', M2, { orderIds: [(await order('oE2' + T, M2, E, 35000), 'oE2' + T)] }); eq(r.ok, false, 'second purchase at group price refused');
});
await test('escrow campaign fails at the deadline -> every commitment refunded, idempotent', async () => {
  ok((await call('groupBuyCommitJoin', M1, { productId: G })).ok, 'M1'); const b1 = await bal(M1);
  await db.doc('products/' + G).update({ 'modeData.endTime': Date.now() - 1000 });
  const s = await call('groupBuySettleNow', S, { productId: G }); eq(s.data.status, 'failed', 'failed'); eq(s.data.refunded, 50000, 'refunded');
  eq(await bal(M1), b1 + 50000, 'M1 refunded'); await call('groupBuySettleNow', S, { productId: G }); eq(await bal(M1), b1 + 50000, 'once');
});
await db.doc('system/config').set({ groupBuy: admin.firestore.FieldValue.delete() }, { merge: true }); // back to the safe default
console.log(`\nGROUP BUY LIFECYCLE: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

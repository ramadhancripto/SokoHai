#!/usr/bin/env node
/* ============================================================
 * SERVICE ORDERS / FUNDI (3I / I-I1) — ombi -> kukubali ->
 * awaiting_payment -> malipo (wallet/PesaPal-wiring) -> held ->
 * shipped -> code -> delivered -> escrowRelease.
 * Kabla ya I-I1: oda iliundwa 'held' bila malipo (uongo wa escrow)
 * na flow ilikufa (shipped/code zinakataa unpaid).
 * ========================================================== */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai-g1';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
process.env.ADMIN_EMAILS = 'admin@sokohai.test';

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();

const results = [];
let group = '[SV svc]';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
async function call(name, uid, data, extra) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: tok(uid, extra), rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}
async function idToken(email) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken, 'signUp: ' + JSON.stringify(j).slice(0, 150));
  return { token: j.idToken, uid: j.localId };
}
function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restPost(tk, col, id, data) {
  const r = await fetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restPatch(tk, p, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${DOCS}/${p}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function loadRules() {
  const src = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf-8');
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: src }] } }) });
  assert(r.ok, 'setSecurityRules: ' + r.status);
}

const C = 'svcCust', F = 'svcFundi', X = 'svcStranger';
async function seed() {
  await wipe(); await loadRules();
  await db.doc('users/' + C).set({ fullName: 'Mteja Huduma', walletBalance: 100000 });
  await db.doc('users/' + F).set({ fullName: 'Fundi Pro', walletBalance: 0 });
  await db.doc('users/' + X).set({ fullName: 'Mtu wa Nje', walletBalance: 100000 });
  await db.doc('requests/svReq1').set({ senderId: C, receiverId: F, senderName: 'Mteja', itemTitle: 'Kurekebisha bomba', detail1: 'Bomba linavuja', detail2: '45000', status: 'accepted' });
  await db.doc('requests/svReqPend').set({ senderId: C, receiverId: F, detail2: '45000', status: 'pending' });
}
await seed();

const svcOrder = (over) => Object.assign({ collectionName: 'services', commerceType: 'service', buyerId: C, buyerName: 'Mteja', sellerId: F, sellerName: 'Fundi Pro', itemId: 'svReq1', itemTitle: 'Huduma: Kurekebisha bomba', amount: 40000, status: 'awaiting_payment', date: new Date().toISOString() }, over || {});

// ---- S1 rules ----
await test('S1 rules: fundi anaunda awaiting_payment kwa ombi lililokubaliwa; held/uongo vinakataliwa', async () => {
  const fundi = await idToken('svcrules-fundi@rules.test');
  const cust = await idToken('svcrules-cust@rules.test');
  const stranger = await idToken('svcrules-str@rules.test');
  await db.doc('requests/svReqR').set({ senderId: cust.uid, receiverId: fundi.uid, detail2: '45000', status: 'accepted' });
  await db.doc('requests/svReqRP').set({ senderId: cust.uid, receiverId: fundi.uid, detail2: '45000', status: 'pending' });
  const base = { collectionName: 'services', buyerId: cust.uid, sellerId: fundi.uid, itemTitle: 'Huduma', amount: 40000, date: new Date().toISOString() };
  eq(await restPost(fundi.token, 'orders', 'svOk', Object.assign({}, base, { itemId: 'svReqR', status: 'awaiting_payment' })), 200, 'fundi create awaiting_payment');
  eq(await restPost(fundi.token, 'orders', 'svHeld', Object.assign({}, base, { itemId: 'svReqR', status: 'held' })), 403, 'fundi create held denied (I-I1)');
  eq(await restPost(fundi.token, 'orders', 'svPend', Object.assign({}, base, { itemId: 'svReqRP', status: 'awaiting_payment' })), 403, 'unaccepted request denied');
  eq(await restPost(stranger.token, 'orders', 'svStr', Object.assign({}, base, { sellerId: stranger.uid, itemId: 'svReqR', status: 'awaiting_payment' })), 403, 'non-receiver create denied');
  eq(await restPatch(cust.token, 'orders/svOk', { paymentRef: 'SVC_TEST_1' }), 200, 'buyer sets paymentRef');
  eq(await restPatch(cust.token, 'orders/svOk', { paymentVerified: true }), 403, 'buyer cannot self-verify');
  eq(await restPatch(fundi.token, 'orders/svOk', { status: 'shipped' }), 403, 'fundi cannot ship unpaid');
});

// ---- S2 wallet pay ----
await test('S2 walletPay: mteja analipa (debit+hold+held); mara mbili/salama zimezuiwa', async () => {
  await db.doc('orders/svPay1').set(svcOrder());
  const r = await call('serviceOrderWalletPay', C, { orderId: 'svPay1', expectedAmount: 40000 });
  eq(r.ok, true, 'pay ok: ' + JSON.stringify(r).slice(0, 200));
  const o = (await db.doc('orders/svPay1').get()).data();
  eq(o.status, 'held', 'held'); eq(o.paymentVerified, true, 'verified'); eq(o.verifiedAmount, 40000, 'verifiedAmount');
  const hold = await db.doc('escrow_holds/order_svPay1').get();
  eq(hold.exists && hold.data().amount, 40000, 'hold 40000');
  eq((await db.doc('users/' + C).get()).data().walletBalance, 60000, 'debited');
  const nq = await db.collection('notifications').where('userId', '==', F).get();
  eq(nq.docs.some(d => String((d.data() || {}).event || '') === 'wallet.escrowFunded'), true, 'fundi notified by server');
  const dup = await call('serviceOrderWalletPay', C, { orderId: 'svPay1' });
  eq(dup.ok && dup.data.already, true, 'double pay idempotent');
  eq((await db.doc('users/' + C).get()).data().walletBalance, 60000, 'no double debit');
  await db.doc('orders/svPay2').set(svcOrder());
  const poor = await call('serviceOrderWalletPay', X, { orderId: 'svPay2' });
  eq(poor.ok, false, 'non-buyer denied');
  const self = await call('serviceOrderWalletPay', F, { orderId: 'svPay2' });
  eq(self.ok, false, 'seller cannot pay');
  await db.doc('users/' + C).set({ walletBalance: 1000 }, { merge: true });
  const ins = await call('serviceOrderWalletPay', C, { orderId: 'svPay2' });
  eq(ins.ok, false, 'insufficient denied');
  eq(/INSUFFICIENT_BALANCE/.test(ins.message || ''), true, 'insufficient code');
  await db.doc('users/' + C).set({ walletBalance: 100000 }, { merge: true });
  const mm = await call('serviceOrderWalletPay', C, { orderId: 'svPay2', expectedAmount: 39999 });
  eq(mm.ok, false, 'expectedAmount mismatch denied');
  await db.doc('orders/svPay3').set(svcOrder({ amount: 46000 }));
  const ob = await call('serviceOrderWalletPay', C, { orderId: 'svPay3' });
  eq(ob.ok, false, 'over-budget denied');
});

// ---- S3 full journey ----
await test('S3 journey: lipa -> shipped -> code -> delivered -> escrowRelease (fundi analipwa)', async () => {
  const fundi = await idToken('svcj-fundi@rules.test');
  await db.doc('users/' + fundi.uid).set({ fullName: 'Fundi J', walletBalance: 0 });
  await db.doc('requests/svReqJ').set({ senderId: C, receiverId: fundi.uid, detail2: '45000', status: 'accepted' });
  await db.doc('orders/svJ1').set(svcOrder({ sellerId: fundi.uid, itemId: 'svReqJ' }));
  const pay = await call('serviceOrderWalletPay', C, { orderId: 'svJ1' });
  eq(pay.ok, true, 'paid: ' + JSON.stringify(pay).slice(0, 160));
  // buyer code issue + fundi confirm (server)
  const code = await call('orderDeliveryCodeIssue', C, { orderId: 'svJ1' });
  eq(code.ok, true, 'code issued: ' + JSON.stringify(code).slice(0, 160));
  const cf = await call('orderConfirmDelivery', fundi.uid, { orderId: 'svJ1', code: code.data.code });
  eq(cf.ok, true, 'confirmed: ' + JSON.stringify(cf).slice(0, 160));
  eq((await db.doc('orders/svJ1').get()).data().status, 'delivered', 'delivered');
  const rel = await call('escrowRelease', C, { orderId: 'svJ1' });
  eq(rel.ok, true, 'released: ' + JSON.stringify(rel).slice(0, 200));
  const fo = await db.doc('orders/svJ1').get();
  eq(fo.data().status, 'completed', 'completed');
  const fbal = Number((await db.doc('users/' + fundi.uid).get()).data()?.walletBalance || 0);
  assert(fbal > 0, 'fundi credited (got ' + fbal + ')');
});

// ---- S4 legacy ----
await test('S4 legacy: oda ya zamani held+unverified inalipika (migration path)', async () => {
  await db.doc('orders/svLeg1').set(svcOrder({ status: 'held', paymentVerified: false, paymentStatus: 'pending' }));
  const r = await call('serviceOrderWalletPay', C, { orderId: 'svLeg1' });
  eq(r.ok, true, 'legacy paid: ' + JSON.stringify(r).slice(0, 160));
  eq((await db.doc('orders/svLeg1').get()).data().paymentVerified, true, 'now verified');
});

// ---- S5 settle-readiness (PesaPal settle yenyewe inahitaji live-IPN: owner) ----
await test('S5 settle-readiness: oda ina paymentRef + ombi halali — settle inaweza kuipata', async () => {
  const cust = await idToken('svcs-cust@rules.test');
  const fundi = await idToken('svcs-fundi@rules.test');
  await db.doc('requests/svReqS').set({ senderId: cust.uid, receiverId: fundi.uid, detail2: '45000', status: 'accepted' });
  const base = { collectionName: 'services', buyerId: cust.uid, sellerId: fundi.uid, itemId: 'svReqS', itemTitle: 'Huduma', amount: 40000, status: 'awaiting_payment', date: new Date().toISOString() };
  eq(await restPost(fundi.token, 'orders', 'svSettle1', base), 200, 'created');
  eq(await restPatch(cust.token, 'orders/svSettle1', { paymentRef: 'SVC_TX_9' }), 200, 'paymentRef set');
  const q = await db.collection('orders').where('paymentRef', '==', 'SVC_TX_9').get();
  eq(q.docs.length, 1, 'settle candidate query finds it');
  const o = q.docs[0].data(), rq = (await db.doc('requests/' + o.itemId).get()).data();
  eq(String(rq.status), 'accepted', 'request accepted');
  eq(Number(o.amount) <= Math.round(Number(rq.detail2)), true, 'amount within budget (price-branch precondition)');
});

const pass = results.filter(r => r.ok).length, fail = results.filter(r => !r.ok);
console.log(`SERVICE ORDERS: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log('  FAIL ' + f.group + ' ' + f.name + ': ' + f.err);
process.exit(fail.length ? 1 : 0);

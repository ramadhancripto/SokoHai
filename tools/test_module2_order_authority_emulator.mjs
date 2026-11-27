#!/usr/bin/env node
/* [MODULE 2 DEF-017 2026-11-27] ORDER-WRITE AUTHORITY — dedicated suite.
 * Who may write what on orders/* (the REAL firestore.rules over REST, as a browser) and which
 * transitions belong to the server (the REAL callables on the emulator):
 *   A  create: buyer may create only an UNPAID order for someone else's sellable product
 *   B  update: parties only; never money keys, parties, paid state or server-only transitions
 *   C  service order created by the provider: only when backed by an accepted request
 *   D  launch scope: system/launch.checkout=false closes browser order creation
 *   E  server transitions: wallet pay (owner/amount/duplicate/parallel), release, cancel-after-pay
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_module2_order_authority_emulator.mjs"
 * Without the emulators: exit 2 (BLOCKED). */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!HOST || !AUTH_HOST) { console.error('BLOCKED: FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST required'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();

let pass = 0, fail = 0; const failures = [];
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`assert: ${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); };
async function call(name, uid, data) {
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: uid ? { uid, token: { uid, email: uid + '@u.test', email_verified: true } } : null, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const bal = async (u) => Number(((await db.doc('users/' + u).get()).data() || {}).walletBalance || 0);
const get = async (p) => (await db.doc(p).get()).data() || null;

/* ---------- REST as a browser ---------- */
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid) { const now = Math.floor(Date.now() / 1000); return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, email: uid + '@u.test', email_verified: true, firebase: { identities: {}, sign_in_provider: 'password' } }) + '.'; }
function enc(v) { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (typeof v === 'string') return { stringValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } }; return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }; }
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
async function rest(method, url, uid, body) { const r = await fetch(url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, uid ? { Authorization: 'Bearer ' + token(uid) } : {}), body: body ? JSON.stringify(body) : undefined }); return r.status; }
const create = (uid, id, data) => rest('PATCH', `${BASE}/orders/${id}?currentDocument.exists=false`, uid, { fields: fields(data) });
const update = (uid, id, data) => rest('PATCH', `${BASE}/orders/${id}?` + Object.keys(data).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true', uid, { fields: fields(data) });
const del = (uid, id) => rest('DELETE', `${BASE}/orders/${id}`, uid);
const ALLOW = (s) => s === 200, DENY = (s) => s === 403;
async function expect(label, want, p) { await test(`${want} ${label}`, async () => { const s = await p; assert(want === 'ALLOW' ? ALLOW(s) : DENY(s), 'status ' + s); }); }

const B = 'oaBuyer', S = 'oaSeller', X = 'oaStranger', P = 'oaProd', GONE = 'oaGone';
const unpaid = (extra) => Object.assign({ buyerId: B, sellerId: S, productId: P, itemId: P, amount: 20000, quantity: 1, status: 'payment_pending', paymentStatus: 'pending', paymentVerified: false }, extra || {});

async function main() {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await db.doc('users/' + B).set({ uid: B, walletBalance: 100000 });
  await db.doc('users/' + S).set({ uid: S, walletBalance: 0 });
  await db.doc('users/' + X).set({ uid: X, walletBalance: 100000 });
  await db.doc('products/' + P).set({ title: 'Redio', userId: S, price: 20000, stock: 5, status: 'active' });
  await db.doc('products/' + GONE).set({ title: 'Imeondolewa', userId: S, price: 20000, stock: 5, status: 'removed' });

  console.log('\n[A. create]');
  await expect('buyer creates an unpaid order for another seller', 'ALLOW', create(B, 'a1', unpaid()));
  await expect('unauthenticated create', 'DENY', create(null, 'a2', unpaid()));
  await expect('create in someone else\'s name (buyerId != caller)', 'DENY', create(X, 'a3', unpaid()));
  await expect('buyer orders from himself (sellerId == caller)', 'DENY', create(B, 'a4', unpaid({ sellerId: B })));
  await expect('create already "held"', 'DENY', create(B, 'a5', unpaid({ status: 'held' })));
  await expect('create with paymentStatus "paid"', 'DENY', create(B, 'a6', unpaid({ paymentStatus: 'paid' })));
  await expect('create with paymentVerified=true', 'DENY', create(B, 'a7', unpaid({ paymentVerified: true })));
  await expect('create with a forged WLT_ wallet reference', 'DENY', create(B, 'a8', unpaid({ paymentRef: 'WLT_fake' })));
  await expect('create with a server-only key (sellerEarned)', 'DENY', create(B, 'a9', unpaid({ sellerEarned: 20000 })));
  await expect('create with a server-only key (escrowStatus)', 'DENY', create(B, 'a10', unpaid({ escrowStatus: 'held' })));
  await expect('create with trust badge', 'DENY', create(B, 'a11', unpaid({ trust: { verified: true } })));
  await expect('create for an archived/removed product', 'DENY', create(B, 'a12', unpaid({ productId: GONE, itemId: GONE })));

  console.log('\n[B. update]');
  await db.doc('orders/b1').set(unpaid());
  await db.doc('orders/b2').set(unpaid({ status: 'held', paymentVerified: true, paymentStatus: 'paid' }));
  await expect('stranger edits an order', 'DENY', update(X, 'b1', { note: 'x' }));
  await expect('buyer edits a harmless field', 'ALLOW', update(B, 'b1', { note: 'Piga simu ukifika' }));
  await expect('buyer lowers the amount', 'DENY', update(B, 'b1', { amount: 1 }));
  await expect('buyer changes quantity', 'DENY', update(B, 'b1', { quantity: 9 }));
  await expect('seller swaps the buyer', 'DENY', update(S, 'b1', { buyerId: X }));
  await expect('buyer marks own order paid', 'DENY', update(B, 'b1', { paymentStatus: 'paid', paymentVerified: true }));
  await expect('buyer jumps to "completed"', 'DENY', update(B, 'b1', { status: 'completed' }));
  await expect('buyer sets escrowStatus', 'DENY', update(B, 'b1', { escrowStatus: 'released' }));
  await expect('buyer writes a WLT_ reference', 'DENY', update(B, 'b1', { paymentRef: 'WLT_x' }));
  await expect('buyer cancels an UNPAID order', 'ALLOW', update(B, 'b1', { status: 'cancelled' }));
  await expect('buyer cancels a PAID (held) order', 'DENY', update(B, 'b2', { status: 'cancelled' }));
  await expect('seller marks a paid order shipped', 'ALLOW', update(S, 'b2', { status: 'shipped' }));
  await expect('seller marks it completed (release is server-only)', 'DENY', update(S, 'b2', { status: 'completed' }));
  await expect('buyer opens a dispute on a shipped order', 'ALLOW', update(B, 'b2', { status: 'disputed' }));
  await expect('seller writes sellerEarned', 'DENY', update(S, 'b2', { sellerEarned: 20000 }));
  await expect('anyone deletes an order (buyer)', 'DENY', del(B, 'b1'));
  await expect('anyone deletes an order (seller)', 'DENY', del(S, 'b2'));

  console.log('\n[C. service order by the provider]');
  await db.doc('requests/rq_ok').set({ senderId: B, receiverId: S, status: 'accepted' });
  await db.doc('requests/rq_pending').set({ senderId: B, receiverId: S, status: 'pending' });
  const svc = (itemId, extra) => Object.assign({ collectionName: 'services', sellerId: S, buyerId: B, amount: 30000, status: 'awaiting_payment', itemId, paymentStatus: 'pending', paymentVerified: false }, extra || {});
  await expect('provider creates a service order backed by an accepted request', 'ALLOW', create(S, 'c1', svc('rq_ok')));
  await expect('provider creates one for a request not yet accepted', 'DENY', create(S, 'c2', svc('rq_pending')));
  await expect('provider creates one already "held"', 'DENY', create(S, 'c3', svc('rq_ok', { status: 'held' })));
  await expect('a stranger creates one for that request', 'DENY', create(X, 'c4', svc('rq_ok', { sellerId: X })));

  console.log('\n[D. launch scope]');
  await db.doc('system/launch').set({ checkout: false });
  await expect('checkout off: buyer creates an order', 'DENY', create(B, 'd1', unpaid()));
  await expect('checkout off: provider creates a service order', 'DENY', create(S, 'd2', svc('rq_ok')));
  await db.doc('system/launch').delete();

  console.log('\n[E. server transitions]');
  const items = [{ productId: P, id: P, title: 'Redio', price: 20000, qty: 1, quantity: 1, sellerId: S }];
  await db.doc('orders/e1').set(unpaid({ amount: 20150, items }));
  await db.doc('orders/e2').set(unpaid({ amount: 20150, items }));
  await test('E1 a stranger cannot pay someone else\'s order', async () => eq((await call('orderWalletPay', X, { orderIds: ['e1'] })).code, 'permission-denied', 'code'));
  await test('E2 unauthenticated wallet pay refused', async () => assert(!(await call('orderWalletPay', null, { orderIds: ['e1'] })).ok, 'allowed'));
  await test('E3 four PARALLEL wallet payments of one order -> one debit, one hold', async () => {
    const before = await bal(B);
    const rs = await Promise.all([1, 2, 3, 4].map(() => call('orderWalletPay', B, { orderIds: ['e1'] })));
    assert(rs.some((r) => r.ok), 'one succeeded ' + JSON.stringify(rs));
    const paid = before - (await bal(B)); assert(paid > 0 && paid <= 20150 + 1000, 'debited once: ' + paid);
    eq((await get('orders/e1')).status, 'held', 'held');
    const again = await call('orderWalletPay', B, { orderIds: ['e1'] }); eq(before - (await bal(B)), paid, 'replay debits nothing (' + JSON.stringify(again).slice(0, 80) + ')');
  });
  await test('E4 a paid order cannot be cancelled by the browser afterwards', async () => assert(DENY(await update(B, 'e1', { status: 'cancelled' })), 'allowed'));
  await test('E5 only the buyer releases; seller and stranger refused; release pays once', async () => {
    assert(!(await call('escrowRelease', S, { orderId: 'e1' })).ok, 'seller released');
    assert(!(await call('escrowRelease', X, { orderId: 'e1' })).ok, 'stranger released');
    const r = await call('escrowRelease', B, { orderId: 'e1' }); assert(r.ok, JSON.stringify(r));
    const sellerAfter = await bal(S); assert(sellerAfter > 0, 'seller paid');
    const r2 = await call('escrowRelease', B, { orderId: 'e1' }); assert(r2.ok && r2.data.already, 'already');
    eq(await bal(S), sellerAfter, 'paid once');
  });
  await test('E6 wallet pay with insufficient balance changes nothing', async () => {
    await db.doc('users/' + X).set({ uid: X, walletBalance: 10 });
    await db.doc('orders/e6').set(Object.assign(unpaid({ amount: 20150, items }), { buyerId: X }));
    const r = await call('orderWalletPay', X, { orderIds: ['e6'] }); assert(!r.ok, 'paid without money');
    eq(await bal(X), 10, 'balance'); eq((await get('orders/e6')).status, 'payment_pending', 'status');
  });

  console.log(`\nMODULE 2 ORDER AUTHORITY (emulator): ${pass} passed, ${fail} failed`);
  if (fail) console.log('FAILED: ' + failures.join(' | '));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });

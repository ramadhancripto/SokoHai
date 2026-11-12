#!/usr/bin/env node
/* PHASE B — adversarial rules suite (fresh personas, REST + Admin SDK).
 * Kila test: jaribio la client (ID token) dhidi ya emulator rules.
 * Exit 0 iff zote zinatabirika (deny=403/401/400-reg, allow=200). */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const FS = 'http://127.0.0.1:8085/v1/projects/demo-sokohai-g1/databases/(default)/documents';
const AU = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
admin.initializeApp({ projectId: 'demo-sokohai-g1' });
const db = admin.firestore();
const RUN = Date.now().toString(36);

const S = (v) => ({ stringValue: String(v) });
const N = (v) => ({ doubleValue: Number(v) });
const B = (v) => ({ booleanValue: !!v });

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  PASS ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' :: ' + String(e.message).slice(0, 180)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

async function mkUser(email, claims) {
  await fetch(AU + ':signUp?key=fake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Test-2026x!', returnSecureToken: true }) });
  if (claims) {
    const u = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(u.uid, claims);
  }
  const si = await (await fetch(AU + ':signInWithPassword?key=fake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Test-2026x!', returnSecureToken: true }) })).json();
  return { uid: si.localId, tok: si.idToken };
}
const H = (t) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + t });
async function rest(method, path, tok, body, masks) {
  let url = FS + '/' + path;
  if (masks) url += '?' + masks.map((m) => 'updateMask.fieldPaths=' + encodeURIComponent(m)).join('&');
  const r = await fetch(url, { method, headers: tok ? H(tok) : { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
const denied = (s) => s === 403 || s === 401 || s === 400;

const buyer = await mkUser('b-rules@example.com');
const sellerA = await mkUser('sA-rules@example.com');
const sellerB = await mkUser('sB-rules@example.com');
const staff = await mkUser('staff-rules@example.com');
const exStaff = await mkUser('exstaff-rules@example.com');
const adminU = await mkUser('admin-rules@example.com', { role: 'admin' });

// setup (server-side)
await db.doc('users/' + staff.uid).set({ uid: staff.uid, shopOwnerUid: sellerA.uid });
await db.doc('users/' + exStaff.uid).set({ uid: exStaff.uid, shopOwnerUid: exStaff.uid });
await db.doc('users/' + buyer.uid).set({ uid: buyer.uid, shopOwnerUid: buyer.uid, walletBalance: 10000 });
await db.doc('shop_ledger/SL-A1').set({ shopOwnerId: sellerA.uid, type: 'income_online', amount: 5000 });
await db.doc('shop_staff/SS-A1').set({ shopOwnerId: sellerA.uid, userId: staff.uid, name: 'Staff A' });
await db.doc('orders/ORD-HELD1').set({ buyerId: buyer.uid, sellerId: sellerA.uid, amount: 5000, status: 'held', paymentStatus: 'paid', paymentVerified: true });
await db.doc('orders/ORD-PEND1').set({ buyerId: buyer.uid, sellerId: sellerA.uid, amount: 5000, status: 'payment_pending', paymentStatus: 'pending', paymentVerified: false });
await db.doc('products/PR-B1').set({ userId: sellerA.uid, title: 'Bidhaa B', price: 5000, stock: 0, openingStockPending: true, reservedStock: 0, views: 10, modeData: { totalBids: 2, maxBidder: 'x', participants: ['x'] } });
await db.doc('requests/REQ-ACC1').set({ senderId: buyer.uid, receiverId: sellerA.uid, status: 'accepted' });

await test('B-R1 anon hawezi kusoma users doc', async () => {
  assert(denied(await rest('GET', 'users/' + buyer.uid, null)), 'anon read allowed?!');
});
await test('B-R2 buyer hawezi kuunda order na paymentVerified=true', async () => {
  const s = await rest('PATCH', 'orders/ORD-EVIL1-' + RUN + '', buyer.tok, { fields: { buyerId: S(buyer.uid), sellerId: S(sellerA.uid), amount: N(100), paymentVerified: B(true) } });
  assert(denied(s), 'status=' + s);
});
await test('B-R3 buyer hawezi kuunda order status=held', async () => {
  const s = await rest('PATCH', 'orders/ORD-EVIL2-' + RUN + '', buyer.tok, { fields: { buyerId: S(buyer.uid), sellerId: S(sellerA.uid), amount: N(100), status: S('held') } });
  assert(denied(s), 'status=' + s);
});
await test('B-R4 buyer hawezi ku-inject sellerEarned', async () => {
  const s = await rest('PATCH', 'orders/ORD-EVIL3-' + RUN + '', buyer.tok, { fields: { buyerId: S(buyer.uid), sellerId: S(sellerA.uid), amount: N(100), sellerEarned: N(999) } });
  assert(denied(s), 'status=' + s);
});
await test('B-R5 buyer ANAWEZA kuunda order safi (positive)', async () => {
  const s = await rest('PATCH', 'orders/ORD-CLEAN1-' + RUN + '', buyer.tok, { fields: { buyerId: S(buyer.uid), sellerId: S(sellerA.uid), amount: N(100), status: S('payment_pending') } });
  assert(s === 200, 'status=' + s);
});
await test('B-R6 seller hawezi kubadilisha amount', async () => {
  const s = await rest('PATCH', 'orders/ORD-PEND1', sellerA.tok, { fields: { amount: N(1) } }, ['amount']);
  assert(denied(s), 'status=' + s);
});
await test('B-R7 buyer hawezi kujiset completed', async () => {
  const s = await rest('PATCH', 'orders/ORD-HELD1', buyer.tok, { fields: { status: S('completed') } }, ['status']);
  assert(denied(s), 'status=' + s);
});
await test('B-R8 buyer ANAWEZA kufungua dispute kutoka held (positive)', async () => {
  const s = await rest('PATCH', 'orders/ORD-HELD1', buyer.tok, { fields: { status: S('disputed') } }, ['status']);
  assert(s === 200, 'status=' + s);
});
await test('B-R9 seller ANAWEZA ku-mark shipped kutoka held+paid (positive)', async () => {
  await db.doc('orders/ORD-HELD2').set({ buyerId: buyer.uid, sellerId: sellerA.uid, amount: 3000, status: 'held', paymentStatus: 'paid', paymentVerified: true });
  const s = await rest('PATCH', 'orders/ORD-HELD2', sellerA.tok, { fields: { status: S('shipped') } }, ['status']);
  assert(s === 200, 'status=' + s);
});
for (const [nm, path] of [['wallet_ledger', 'wallet_ledger/WL-EVIL'], ['escrow_holds', 'escrow_holds/EH-EVIL'], ['withdrawal_requests', 'withdrawal_requests/WR-EVIL'], ['refunds', 'refunds/RF-EVIL'], ['payment_reviews', 'payment_reviews/PR-EVIL'], ['inventory_reservations', 'inventory_reservations/IR-EVIL'], ['sales', 'sales/SA-EVIL']]) {
  await test('B-R10 ' + nm + ' ni write:false kwa client', async () => {
    const s = await rest('PATCH', path, buyer.tok, { fields: { x: N(1) } });
    assert(denied(s), 'status=' + s);
  });
}
await test('B-R11 user hawezi kubadilisha walletBalance yake', async () => {
  const s = await rest('PATCH', 'users/' + buyer.uid, buyer.tok, { fields: { walletBalance: N(999999) } }, ['walletBalance']);
  assert(denied(s), 'status=' + s);
});
await test('B-R12 user hawezi kujipa role=admin', async () => {
  const s = await rest('PATCH', 'users/' + buyer.uid, buyer.tok, { fields: { role: S('admin') } }, ['role']);
  assert(denied(s), 'status=' + s);
});
await test('B-R13 user hawezi kujiset staffRole (server-only)', async () => {
  const s = await rest('PATCH', 'users/' + buyer.uid, buyer.tok, { fields: { staffRole: S('Manager') } }, ['staffRole']);
  assert(denied(s), 'status=' + s);
});
await test('B-R14 cross-biz hawezi kusoma shop_ledger ya A', async () => {
  assert(denied(await rest('GET', 'shop_ledger/SL-A1', sellerB.tok)), 'cross-biz read allowed?!');
});
await test('B-R15 exStaff hawezi kujiunga na duka la zamani', async () => {
  const s = await rest('PATCH', 'users/' + exStaff.uid, exStaff.tok, { fields: { shopOwnerUid: S(sellerA.uid) } }, ['shopOwnerUid']);
  assert(denied(s), 'status=' + s);
});
await test('B-R16 staff hawezi kufuta shop_staff', async () => {
  const s = await rest('DELETE', 'shop_staff/SS-A1', staff.tok);
  assert(denied(s), 'status=' + s);
});
await test('B-R17 seller hawezi kubadilisha stock moja kwa moja', async () => {
  const s = await rest('PATCH', 'products/PR-B1', sellerA.tok, { fields: { stock: N(999) } }, ['stock']);
  assert(denied(s), 'status=' + s);
});
await test('B-R18 seller hawezi ku-reset winner baada ya bids', async () => {
  const s = await rest('PATCH', 'products/PR-B1', sellerA.tok, { fields: { modeData: { mapValue: { fields: { totalBids: N(0) } } } } }, ['modeData']);
  assert(denied(s), 'status=' + s);
});
await test('B-R19 buyer hawezi kuandika bid moja kwa moja', async () => {
  const s = await rest('PATCH', 'products/PR-B1/bids/BID-EVIL', buyer.tok, { fields: { amount: N(1) } });
  assert(denied(s), 'status=' + s);
});
await test('B-R20 signed-in ANAWEZA +1 views (positive)', async () => {
  const s = await rest('PATCH', 'products/PR-B1', buyer.tok, { fields: { views: N(11) } }, ['views']);
  assert(s === 200, 'status=' + s);
});
await test('B-R21 fundi hawezi kuunda service order bila accepted request', async () => {
  const s = await rest('PATCH', 'orders/ORD-SVC-EVIL-' + RUN + '', sellerA.tok, { fields: { collectionName: S('services'), sellerId: S(sellerA.uid), buyerId: S(buyer.uid), amount: N(2000), status: S('awaiting_payment'), itemId: S('REQ-NOPE') } });
  assert(denied(s), 'status=' + s);
});
await test('B-R22 fundi ANAWEZA kuunda awaiting_payment na accepted request (positive)', async () => {
  const s = await rest('PATCH', 'orders/ORD-SVC-OK-' + RUN + '', sellerA.tok, { fields: { collectionName: S('services'), sellerId: S(sellerA.uid), buyerId: S(buyer.uid), amount: N(2000), status: S('awaiting_payment'), itemId: S('REQ-ACC1') } });
  assert(s === 200, 'status=' + s);
});
await test('B-R23 buyer hawezi ku-inject escrowStatus=Released kwenye create', async () => {
  const s = await rest('PATCH', 'orders/ORD-EVIL4-' + RUN + '', buyer.tok, { fields: { buyerId: S(buyer.uid), sellerId: S(sellerA.uid), amount: N(100), escrowStatus: S('Released') } });
  assert(denied(s), 'status=' + s);
});

console.log(`\nPHASE B RULES ADVERSARIAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

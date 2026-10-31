#!/usr/bin/env node
/**
 * [REPAIR 2026-10 Phase 5] Auction bids, Group Buy joins and mode pricing —
 * end-to-end against the FIREBASE EMULATOR (callables + rules + price check).
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_commerce_modes.mjs"
 * Exits 2 (BLOCKED) without the emulator; never touches production.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
process.env.PESAPAL_CONSUMER_KEY = 'k'; process.env.PESAPAL_CONSUMER_SECRET = 's'; process.env.PESAPAL_BASE_URL = 'https://pesapal.stub/v3';
const realFetch = globalThis.fetch; const PP = new Map();
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.startsWith('https://pesapal.stub/')) return realFetch(url, opts);
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('RequestToken')) return json({ token: 't', expiryDate: new Date(Date.now() + 3e5).toISOString() });
  const id = new URL(u).searchParams.get('orderTrackingId'); const t = PP.get(id);
  return json(t ? { status_code: 1, payment_status_description: 'Completed', order_tracking_id: id, merchant_reference: 'M_' + id, amount: t.amount, currency: 'TZS' }
    : { status_code: 0, order_tracking_id: id, amount: 0, currency: 'TZS' });
};
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
const fs = await import('node:fs');
let pass = 0, fail = 0; const fails = [];
async function test(n, fn) { try { await fn(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; fails.push(n + ': ' + e.message); console.log('  FAIL ' + n + '\n       ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error('assert: ' + m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const tok = (uid) => ({ uid, token: { uid, email: uid + '@u.test', email_verified: true } });
async function call(name, uid, data) {
  try { return { ok: true, data: await fns[name].run({ data, auth: uid ? tok(uid) : null, rawRequest: { headers: {} } }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
const get = async (p) => (await db.doc(p).get()).data() || {};
async function wipe() { await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }); PP.clear(); }
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
  assert(r.ok, 'rules load ' + r.status + ' ' + (await r.text()).slice(0, 300));
}
// REST as a browser (rules apply)
function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function jwt(uid) { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none' }) + '.' + b64({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: n, user_id: uid, sub: uid, iat: n, exp: n + 3600, email: uid + '@u.test', email_verified: true, firebase: { sign_in_provider: 'password' } }) + '.'; }
function enc(v) { if (v === null) return { nullValue: null }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (typeof v === 'string') return { stringValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } }; return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }; }
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restPatch(uid, p, data) { const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'); return (await realFetch(`${DOCS}/${p}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) })).status; }
async function restCreate(uid, col, id, data) { return (await realFetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) })).status; }
const later = (h) => new Date(Date.now() + h * 3600e3).getTime();

await loadRules(); await wipe();
for (const u of ['seller', 'b1', 'b2', 'b3']) await db.doc('users/' + u).set({ uid: u, walletBalance: 0 });
console.log('\n[Auction]');
await db.doc('products/a1').set({ title: 'Saa ya zamani', price: 10000, stock: 1, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', endTime: later(2) } });
await test('bidder cannot write modeData directly (rules)', async () => {
  eq(await restPatch('b1', 'products/a1', { modeData: { mode: 'auction', currentBid: 99999, maxBidder: 'b1', totalBids: 1, endTime: later(2) } }), 403, 'direct write');
});
await test('bid below 5% step is refused; valid bid accepted', async () => {
  const low = await call('auctionPlaceBid', 'b1', { productId: 'a1', amount: 10400 });
  assert(!low.ok && /^waliokuzidi/.test(low.message), 'low bid: ' + low.message);
  const ok = await call('auctionPlaceBid', 'b1', { productId: 'a1', amount: 10500 }); assert(ok.ok, ok.message);
  const p = await get('products/a1'); eq(p.modeData.currentBid, 10500, 'currentBid'); eq(p.modeData.maxBidder, 'b1', 'leader'); eq(p.modeData.totalBids, 1, 'count');
  eq((await db.collection('products/a1/bids').get()).size, 1, 'bid history row');
});
await test('seller cannot bid on own auction; leader cannot raise against self', async () => {
  const s = await call('auctionPlaceBid', 'seller', { productId: 'a1', amount: 20000 }); assert(!s.ok && /tangazo_lako/.test(s.message), s.message);
  const self = await call('auctionPlaceBid', 'b1', { productId: 'a1', amount: 20000 }); assert(!self.ok && /tayari_unaongoza/.test(self.message), self.message);
});
await test('outbid notifies previous leader; concurrent bids keep one winner', async () => {
  const r = await Promise.all([call('auctionPlaceBid', 'b2', { productId: 'a1', amount: 11100 }), call('auctionPlaceBid', 'b3', { productId: 'a1', amount: 11100 })]);
  eq(r.filter(x => x.ok).length, 1, 'exactly one of two equal concurrent bids wins');
  const p = await get('products/a1'); eq(p.modeData.totalBids, 2, 'two accepted bids total');
  const n = await db.collection('notifications').where('userId', '==', 'b1').where('type', '==', 'auction_outbid').get(); assert(n.size >= 1, 'outbid notice');
});
await test('seller cannot rewrite winner after bids (rules)', async () => {
  eq(await restPatch('seller', 'products/a1', { modeData: { mode: 'auction', currentBid: 1, maxBidder: 'seller', totalBids: 0, endTime: later(2) } }), 403, 'seller reset');
  eq(await restPatch('seller', 'products/a1', { saleMode: 'free_market' }), 403, 'seller switches mode');
});
await test('auction admin switch off -> imezimwa_admin', async () => {
  await db.doc('system/config').set({ modes: { auction: false } }, { merge: true });
  const r = await call('auctionPlaceBid', 'b1', { productId: 'a1', amount: 50000 }); assert(!r.ok && /imezimwa_admin/.test(r.message), r.message);
  await db.doc('system/config').set({ modes: { auction: true } }, { merge: true });
});
await test('bids refused after end; sweep marks winner and notifies once', async () => {
  await db.doc('products/a1').update({ 'modeData.endTime': Date.now() - 1000 });
  const r = await call('auctionPlaceBid', 'b1', { productId: 'a1', amount: 90000 }); assert(!r.ok && /mnada_umefungwa/.test(r.message), r.message);
  const leader = (await get('products/a1')).modeData.maxBidder;
  await fns._commerceSweepForTest(); await fns._commerceSweepForTest();
  const p = await get('products/a1'); eq(p.modeData.ended, true, 'ended'); eq(p.modeData.winnerId, leader, 'winner');
  eq((await db.collection('notifications').where('type', '==', 'auction_won').get()).size, 1, 'winner notified once');
});
await test('only the winner can pay; at the winning bid; non-winner order goes to price_review', async () => {
  const p = await get('products/a1'); const winner = p.modeData.maxBidder, loser = winner === 'b2' ? 'b3' : 'b2';
  PP.set('TX-W', { amount: p.modeData.currentBid }); PP.set('TX-L', { amount: 10000 }); PP.set('TX-LOW', { amount: 10000 });
  await db.doc('orders/ow').set({ buyerId: winner, sellerId: 'seller', productId: 'a1', itemId: 'a1', quantity: 1, amount: p.modeData.currentBid, status: 'payment_pending', paymentRef: 'TX-W' });
  await db.doc('orders/ol').set({ buyerId: loser, sellerId: 'seller', productId: 'a1', itemId: 'a1', quantity: 1, amount: 10000, status: 'payment_pending', paymentRef: 'TX-L' });
  await db.doc('orders/olow').set({ buyerId: winner, sellerId: 'seller', productId: 'a1', itemId: 'a1', quantity: 1, amount: 10000, status: 'payment_pending', paymentRef: 'TX-LOW' });
  for (const [u, t] of [[winner, 'TX-W'], [loser, 'TX-L'], [winner, 'TX-LOW']]) await call('pesapalTransactionStatus', u, { orderTrackingId: t });
  assert((await db.doc('escrow_holds/order_ow').get()).exists, 'winner paid at winning bid -> escrow');
  assert(!(await db.doc('escrow_holds/order_ol').get()).exists, 'loser not settled'); eq((await get('orders/ol')).priceReviewReason, 'not_auction_winner', 'loser reason');
  assert(!(await db.doc('escrow_holds/order_olow').get()).exists, 'winner underpaying not settled'); eq((await get('orders/olow')).priceReviewReason, 'underpriced', 'underpriced');
});
await test('product cannot be created with a pre-filled winner', async () => {
  eq(await restCreate('seller', 'products', 'a2', { title: 'Kitu', price: 1000, stock: 0, openingStockPending: true, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', maxBidder: 'b1', currentBid: 5000 } }), 403, 'prefilled winner');
  eq(await restCreate('seller', 'products', 'a3', { title: 'Kitu', price: 1000, stock: 0, openingStockPending: true, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', endTime: later(5) } }), 200, 'normal auction listing');
});

console.log('\n[Group Buy]');
await db.doc('products/g1').set({ title: 'Mchele 25kg', price: 50000, stock: 10, userId: 'seller', saleMode: 'group_buy', modeData: { mode: 'group_buy', targetPeople: 3, discountValue: 5000, discountType: 'amount', joinedUsers: 1, participants: [], endTime: later(24) } });
await test('buyer cannot join by writing modeData (rules)', async () => {
  eq(await restPatch('b1', 'products/g1', { modeData: { mode: 'group_buy', joinedUsers: 50, participants: ['b1'] } }), 403, 'direct');
});
await test('join is unique per buyer; seller cannot join', async () => {
  assert((await call('groupBuyJoin', 'b1', { productId: 'g1' })).ok, 'b1 joins');
  const again = await call('groupBuyJoin', 'b1', { productId: 'g1' }); assert(again.ok && again.data.already, 'idempotent');
  const s = await call('groupBuyJoin', 'seller', { productId: 'g1' }); assert(!s.ok && /tangazo_lako/.test(s.message), s.message);
  eq((await get('products/g1')).modeData.joinedUsers, 2, 'joined counted once');
});
await test('target reached -> success notices; further joins refused', async () => {
  assert((await call('groupBuyJoin', 'b2', { productId: 'g1' })).ok, 'b2 joins');
  const p = await get('products/g1'); eq(p.modeData.joinedUsers, 3, 'target'); eq(p.modeData.successNotified, true, 'flag');
  eq((await db.collection('notifications').where('type', '==', 'group_buy_success').get()).size, 3, '2 members + seller');
  const late = await call('groupBuyJoin', 'b3', { productId: 'g1' }); assert(!late.ok && /group_successful/.test(late.message), late.message);
});
await test('member pays group price; non-member at group price goes to price_review', async () => {
  // joined 3 -> price 50000 - 2*5000 = 40000
  PP.set('TX-G1', { amount: 40000 }); PP.set('TX-G3', { amount: 40000 });
  await db.doc('orders/og1').set({ buyerId: 'b1', sellerId: 'seller', productId: 'g1', itemId: 'g1', quantity: 1, amount: 40000, status: 'payment_pending', paymentRef: 'TX-G1' });
  await db.doc('orders/og3').set({ buyerId: 'b3', sellerId: 'seller', productId: 'g1', itemId: 'g1', quantity: 1, amount: 40000, status: 'payment_pending', paymentRef: 'TX-G3' });
  await call('pesapalTransactionStatus', 'b1', { orderTrackingId: 'TX-G1' }); await call('pesapalTransactionStatus', 'b3', { orderTrackingId: 'TX-G3' });
  assert((await db.doc('escrow_holds/order_og1').get()).exists, 'member settled');
  assert(!(await db.doc('escrow_holds/order_og3').get()).exists, 'non-member not settled');
  eq((await get('orders/og3')).priceExpected, 50000, 'non-member expected base price');
});

console.log(`\nCOMMERCE MODES: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  FAIL ' + f)); process.exit(1); }
process.exit(0);

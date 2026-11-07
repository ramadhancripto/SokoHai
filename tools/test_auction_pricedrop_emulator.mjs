#!/usr/bin/env node
/**
 * [R13-B] Auction (increments, start time, duplicates, anti-sniping, finalize, second chance) + Bei Kushuka window/limits/notices —
 * end-to-end against the FIREBASE EMULATOR (callables + rules + price check).
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_auction_pricedrop_emulator.mjs"
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
const cm = require(path.join(ROOT, 'functions', 'commerce-modes.js'))._testing;
const pc = require(path.join(ROOT, 'functions', 'pricing-core.js'));
const ago = (s) => Date.now() - s * 1000, ahead = (s) => Date.now() + s * 1000;
const notes = async (uid, type) => (await db.collection('notifications').where('userId', '==', uid).get()).docs.map(d => d.data()).filter(n => !type || n.type === type);

await loadRules(); await wipe();
for (const u of ['seller', 'b1', 'b2', 'b3', 'w1', 'w2']) await db.doc('users/' + u).set({ uid: u, walletBalance: 0 });

console.log('\n[Mnada: sheria za zabuni]');
await db.doc('products/inc').set({ title: 'Simu', price: 10000, stock: 1, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', endTime: later(2), minIncrement: 2000 } });
await test('seller-set minimum increment (TSh 2,000) is enforced', async () => {
  const lo = await call('auctionPlaceBid', 'b1', { productId: 'inc', amount: 11000 }); assert(!lo.ok && /waliokuzidi:12000/.test(lo.message), lo.message);
  const ok = await call('auctionPlaceBid', 'b1', { productId: 'inc', amount: 12000 }); assert(ok.ok, ok.message); eq(ok.data.minNext, 14000, 'next minimum');
});
await db.doc('products/soon').set({ title: 'TV', price: 5000, stock: 1, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', startTime: later(1), endTime: later(3) } });
await test('bid before the start time is refused', async () => {
  const r = await call('auctionPlaceBid', 'b1', { productId: 'soon', amount: 9000 }); assert(!r.ok && /mnada_haujaanza/.test(r.message), r.message);
});
await db.doc('products/dup').set({ title: 'Saa', price: 10000, stock: 1, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', endTime: later(2) } });
await test('same clientBidId twice = one bid (no duplicate submission)', async () => {
  const a = await call('auctionPlaceBid', 'b1', { productId: 'dup', amount: 10500, clientBidId: 'k1' }); assert(a.ok, a.message);
  const b = await call('auctionPlaceBid', 'b1', { productId: 'dup', amount: 10500, clientBidId: 'k1' }); assert(b.ok && b.data.duplicate === true, JSON.stringify(b));
  eq((await get('products/dup')).modeData.totalBids, 1, 'one bid stored');
  eq((await db.collection('products/dup/bids').get()).size, 1, 'one bid document');
});
await db.doc('products/snipe').set({ title: 'Laptop', price: 10000, stock: 1, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', endTime: ahead(60) } });
await test('bid in the last 2 minutes extends the end by 2 minutes (anti-sniping)', async () => {
  const before = (await get('products/snipe')).modeData.endTime;
  const r = await call('auctionPlaceBid', 'b2', { productId: 'snipe', amount: 10500 }); assert(r.ok && r.data.extended, JSON.stringify(r));
  const m = (await get('products/snipe')).modeData; eq(m.endTime, before + 120000, 'end moved'); eq(m.extensions, 1, 'extension count');
});
await test('extensions are capped (an auction always ends)', async () => {
  const md = { endTime: Date.now() + 1000, extensions: 15 }; eq(cm.antiSnipeEnd(md, Date.now()), null, 'cap');
});
await test('bid history is readable by signed-in users, not writable from a browser', async () => {
  const id = (await db.collection('products/dup/bids').limit(1).get()).docs[0].id;
  const r = await realFetch(`${DOCS}/products/dup/bids/${id}`, { headers: { authorization: 'Bearer ' + jwt('b3') } }); eq(r.status, 200, 'read');
  eq(await restCreate('b3', 'products/dup/bids', 'x1', { uid: 'b3', amount: 999999 }), 403, 'write');
});

console.log('\n[Mnada: matokeo, malipo, nafasi ya pili]');
await db.doc('products/fin').set({ title: 'Friji', price: 10000, stock: 1, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', endTime: later(2) } });
await call('auctionPlaceBid', 'b1', { productId: 'fin', amount: 10500 });
await call('auctionPlaceBid', 'b2', { productId: 'fin', amount: 11100 });
await call('auctionPlaceBid', 'b3', { productId: 'fin', amount: 11700 });
await test('auctionFinalize does nothing while the auction is running', async () => {
  const r = await call('auctionFinalize', 'b1', { productId: 'fin' }); assert(r.ok && r.data.closed === false && !r.data.ended, JSON.stringify(r));
});
await db.doc('products/fin').update({ 'modeData.endTime': ago(5) });
await test('auctionFinalize closes it once: winner = highest bidder, 24h payment deadline', async () => {
  const r = await call('auctionFinalize', 'b2', { productId: 'fin' }); assert(r.ok && r.data.closed && r.data.winnerId === 'b3' && r.data.winnerBid === 11700, JSON.stringify(r));
  const again = await call('auctionFinalize', 'b2', { productId: 'fin' }); eq(again.data.closed, false, 'idempotent');
  const m = (await get('products/fin')).modeData; assert(m.paymentDeadline > Date.now() + 23 * 3600e3, 'deadline'); eq((await notes('b3', 'auction_won')).length, 1, 'winner told once');
});
await test('only the winner can buy, at the winning bid', async () => {
  const p = await get('products/fin');
  eq(pc.modeEligibility(p, 'b3', Date.now()), '', 'winner allowed'); eq(pc.modeEligibility(p, 'b2', Date.now()), 'not_auction_winner', 'others refused');
  eq(pc.modeUnitPrice(p, 1, 'b3', Date.now()), 11700, 'winning price');
});
await test('seller cannot forge the winner (rules)', async () => {
  eq(await restPatch('seller', 'products/fin', { modeData: { mode: 'auction', winnerId: 'seller', winnerBid: 1, totalBids: 0, endTime: ago(5) } }), 403, 'update');
  eq(await restCreate('seller', 'products', 'forged', { title: 'x', price: 100, stock: 0, openingStockPending: true, userId: 'seller', category: 'CAT-11', saleMode: 'auction', modeData: { mode: 'auction', winnerId: 'b1', winnerBid: 1 } }), 403, 'create');
});
await db.doc('products/fin').update({ 'modeData.paymentDeadline': ago(1) });
await test('unpaid winner after the deadline -> second chance to the next distinct bidder at THEIR bid', async () => {
  assert(await cm.secondChance(db.doc('products/fin'), Date.now()), 'moved');
  const m = (await get('products/fin')).modeData;
  eq(m.winnerId, 'b2', 'runner-up'); eq(m.winnerBid, 11100, 'their bid'); eq(m.winnerRound, 2, 'round'); assert(m.pastWinners.includes('b3'), 'past winner kept');
  eq(pc.modeEligibility(await get('products/fin'), 'b3', Date.now()), 'not_auction_winner', 'old winner can no longer buy');
  eq((await notes('b2', 'auction_second_chance')).length, 1, 'runner-up told'); eq((await notes('b3', 'auction_payment_expired')).length, 1, 'old winner told');
});
await test('expired payment window closes the winner too (no late purchase)', async () => {
  const p = await get('products/fin'); p.modeData.paymentDeadline = ago(1); eq(pc.modeEligibility(p, 'b2', Date.now()), 'auction_payment_expired', 'late');
});
await db.doc('orders/o_paid').set({ buyerId: 'b2', sellerId: 'seller', status: 'held', items: [{ productId: 'fin', qty: 1 }] });
await db.doc('products/fin').update({ 'modeData.paymentDeadline': ago(1) });
await test('a paid winner is kept (no second chance)', async () => {
  eq(await cm.secondChance(db.doc('products/fin'), Date.now()), false, 'no move'); const m = (await get('products/fin')).modeData; eq(m.winnerId, 'b2', 'kept'); eq(m.winnerPaid, true, 'marked paid');
});

console.log('\n[Bei Kushuka]');
const pd = (md) => ({ price: 10000, saleMode: 'price_drop', modeData: Object.assign({ mode: 'price_drop', dropAmount: 1000, intervalMs: 60000, minPrice: 6000 }, md) });
await test('price before the start is refused at checkout', async () => { eq(pc.modeEligibility(pd({ startTime: ahead(600) }), 'b1', Date.now()), 'price_drop_not_started', 'not started'); });
await test('ended / stopped offer can not reach checkout (no stale price)', async () => {
  eq(pc.modeEligibility(pd({ startTime: ago(600), endTime: ago(10) }), 'b1', Date.now()), 'price_drop_ended', 'ended');
  eq(pc.modeEligibility(pd({ startTime: ago(600), stopped: true }), 'b1', Date.now()), 'price_drop_ended', 'stopped');
});
await test('inside the window the server price follows the schedule and floor', async () => {
  const p = pd({ startTime: ago(185), endTime: ahead(600) }); eq(pc.modeEligibility(p, 'b1', Date.now()), '', 'open'); eq(pc.modeUnitPrice(p, 1, 'b1', Date.now()), 7000, '3 drops');
  eq(pc.modeUnitPrice(pd({ startTime: ago(3600) }), 1, 'b1', Date.now()), 6000, 'floor');
});
await test('per-buyer limit per order', async () => { eq(pc.modeQuantityLimit(pd({ maxPerBuyer: 2 }), 3), 'over_buyer_limit', 'over'); eq(pc.modeQuantityLimit(pd({ maxPerBuyer: 2 }), 2), '', 'ok'); });
await db.doc('products/drop').set(Object.assign({ title: 'Pasi', stock: 5, userId: 'seller' }, pd({ startTime: ago(185), endTime: ahead(3600) })));
await db.doc('productWatches/w1__drop').set({ userId: 'w1', productId: 'drop' });
await db.doc('productWatches/w2__drop').set({ userId: 'w2', productId: 'drop' });
await test('watchers get ONE notice per real drop', async () => {
  const r1 = await cm.sweepPriceDrops(Date.now()); eq(r1.notified, 2, 'two watchers');
  const r2 = await cm.sweepPriceDrops(Date.now()); eq(r2.notified, 0, 'no repeat without a new drop');
  const n = await notes('w1', 'price_drop'); eq(n.length, 1, 'one notice'); eq(n[0].price, 7000, 'real price');
});

console.log(`\nAUCTION + PRICE DROP: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.join('\n'));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * [R13-D] Bei Kushuka buyer queue (refs 1 & 2), live likes/reminders, auction participation —
 * end-to-end against the FIREBASE EMULATOR (callables + rules + price check).
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_pricedrop_queue_emulator.mjs"
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
const pc = require(path.join(ROOT, 'functions', 'pricing-core.js'));
const q = require(path.join(ROOT, 'functions', 'price-drop-queue.js'))._testing;
const notes = async (uid, type) => (await db.collection('notifications').where('userId', '==', uid).get()).docs.map(d => d.data()).filter(n => !type || n.type === type);
for (const u of ['seller', 'b1', 'b2', 'b3', 'b4']) await db.doc('users/' + u).set({ uid: u });
const now = Date.now();
const pd = (o) => Object.assign({ title: 'TV 43', price: 850000, stock: 2, userId: 'seller', saleMode: 'price_drop',
  modeData: { mode: 'price_drop', startTime: now - 10 * 60e3, intervalMs: 60e3, dropAmount: 1000, minPrice: 550000, endTime: now + 3600e3, maxPerBuyer: 1 } }, o || {});
await db.doc('products/tv').set(pd());

console.log('\n[Weka bei yako]');
await test('price above the current dropping price is refused', async () => {
  const r = await call('priceDropSubmit', 'b1', { productId: 'tv', price: 845000 }); assert(!r.ok && /juu_ya_bei_ya_sasa:840000/.test(r.message), r.message); });
await test('price below the final price is refused', async () => {
  const r = await call('priceDropSubmit', 'b1', { productId: 'tv', price: 500000 }); assert(!r.ok && /chini_ya_bei_ya_mwisho:550000/.test(r.message), r.message); });
await test('seller can not join own campaign', async () => {
  const r = await call('priceDropSubmit', 'seller', { productId: 'tv', price: 700000 }); assert(!r.ok && /tangazo_lako/.test(r.message), r.message); });
await test('valid submissions are ranked by price, then time; names masked on the public board', async () => {
  eq((await call('priceDropSubmit', 'b1', { productId: 'tv', price: 700000, name: 'Amani Mussa' })).data.rank, 1, 'b1 rank');
  eq((await call('priceDropSubmit', 'b2', { productId: 'tv', price: 715000, name: 'Neema Juma' })).data.rank, 1, 'b2 first');
  eq((await call('priceDropSubmit', 'b3', { productId: 'tv', price: 700000, name: 'Baraka' })).data.rank, 3, 'b3 after b1 (same price, later)');
  await call('priceDropSubmit', 'b4', { productId: 'tv', price: 600000, name: 'Zuhura Ali' });
  const b = await get('price_drop_board/tv');
  eq(b.count, 4, 'count'); eq(b.top[0].name, 'N*** J***', 'masked'); eq(b.top[0].price, 715000, 'top price');
  assert(!JSON.stringify(b).includes('b2'), 'no uid on the board');
  eq((await get('products/tv')).modeData.queueEntries, 4, 'server count');
});
await test('same price twice = duplicate (no second entry)', async () => {
  const r = await call('priceDropSubmit', 'b1', { productId: 'tv', price: 700000 }); assert(r.ok && r.data.duplicate, JSON.stringify(r)); });
await test('my rank is private to me', async () => {
  const r = await call('priceDropMyRank', 'b3', { productId: 'tv' }); eq(r.data.rank, 3, 'rank'); eq(r.data.entry.price, 700000, 'price'); });
await test('rules: entries unreadable, board readable, seller can not edit modeData once buyers joined', async () => {
  const st = await realFetch(`${DOCS}/price_drop_entries/tv__b1`, { headers: { authorization: 'Bearer ' + jwt('b1') } }); eq(st.status, 403, 'entry read');
  const bd = await realFetch(`${DOCS}/price_drop_board/tv`); eq(bd.status, 200, 'board read');
  eq(await restPatch('seller', 'products/tv', { modeData: { mode: 'price_drop', minPrice: 100, startTime: now, intervalMs: 60000, dropAmount: 1, endTime: now + 1 } }), 403, 'seller rewrite');
  eq(await restPatch('b1', 'products/tv', { modeData: { opportunities: { b1: { price: 1, qty: 1, deadline: now + 1e9 } } } }), 403, 'buyer forges offer');
});
await test('checkout before the end: queue members pay the current price, not their own', async () => {
  const p = await get('products/tv'); eq(pc.priceDropOffer(p, 'b2', Date.now()), null, 'no offer yet'); eq(pc.modeEligibility(p, 'b2', Date.now()), '', 'can buy now at current'); });

console.log('\n[Mwisho wa kampeni -> fursa ya kununua]');
await test('campaign end: top buyers within stock get an opportunity at their price', async () => {
  await db.doc('products/tv').update({ 'modeData.endTime': Date.now() - 1000 });
  const r = await call('priceDropSettle', 'b4', { productId: 'tv' }); assert(r.ok && r.data.offers === 2, JSON.stringify(r));
  const md = (await get('products/tv')).modeData;
  eq(Object.keys(md.opportunities).sort().join(','), 'b1,b2', 'b2 (715k) + b1 (700k earlier than b3)');
  eq(md.opportunities.b2.price, 715000, 'own price'); assert(md.opportunities.b2.deadline > Date.now() + 2.9 * 3600e3, '3h window');
  eq((await notes('b2', 'price_drop_offer')).length, 1, 'b2 told'); eq((await notes('b3', 'price_drop_ended')).length, 1, 'b3 told its place');
});
await test('checkout: offer holder pays THEIR price; others are refused after the end', async () => {
  const p = await get('products/tv'), t = Date.now();
  eq(pc.modeEligibility(p, 'b2', t), '', 'b2 allowed'); eq(pc.modeUnitPrice(p, 1, 'b2', t), 715000, 'b2 unit');
  eq(pc.modeEligibility(p, 'b3', t), 'price_drop_ended', 'b3 refused'); eq(pc.modeQuantityLimit(p, 2, 'b2', t), 'over_offer_qty', 'qty capped');
});
await test('settle again = no duplicate offers or notices', async () => {
  await call('priceDropSettle', 'b4', { productId: 'tv' }); eq((await notes('b2', 'price_drop_offer')).length, 1, 'still one notice'); });
await test('an offer that is not paid in time moves to the next buyer', async () => {
  await db.doc('products/tv').update({ 'modeData.opportunities.b1.deadline': Date.now() - 1000 });
  await call('priceDropSettle', 'b4', { productId: 'tv' });
  const md = (await get('products/tv')).modeData;
  assert(!md.opportunities.b1 && md.opportunities.b3, 'b1 -> b3: ' + Object.keys(md.opportunities));
  eq(pc.modeEligibility(await get('products/tv'), 'b1', Date.now()), 'price_drop_ended', 'b1 can no longer buy'); eq((await get('price_drop_entries/tv__b1')).status, 'expired', 'b1 entry expired');
  eq((await notes('b1', 'price_drop_offer_expired')).length, 1, 'b1 told'); eq((await notes('b3', 'price_drop_offer')).length, 1, 'b3 told');
});
await test('a paid offer is released as bought (not offered again)', async () => {
  await db.collection('orders').add({ buyerId: 'b2', productId: 'tv', status: 'paid', items: [{ productId: 'tv' }] });
  await call('priceDropSettle', 'b4', { productId: 'tv' });
  const md = (await get('products/tv')).modeData; assert(!md.opportunities.b2, 'b2 settled');
  eq((await get('price_drop_entries/tv__b2')).status, 'bought', 'bought');
});

console.log('\n[Live: likes, ukumbusho; Zabuni zangu]');
await db.doc('live_sessions/L1').set({ hostUid: 'seller', hostName: 'Duka', title: 'Live', kind: 'live', status: 'scheduled', productIds: [], mutedUids: [], viewerCount: 0 });
await test('reminder on a scheduled live -> notified when it starts', async () => {
  assert((await call('liveRemind', 'b1', { sessionId: 'L1' })).ok, 'remind');
  assert((await call('liveStart', 'seller', { sessionId: 'L1' })).ok, 'start');
  eq((await notes('b1', 'live_reminder')).length, 1, 'notified');
});
await test('likes count once per 1.5 s per user', async () => {
  await call('liveLike', 'b1', { sessionId: 'L1' }); await call('liveLike', 'b1', { sessionId: 'L1' }); await call('liveLike', 'b2', { sessionId: 'L1' });
  eq((await get('live_sessions/L1')).likeCount, 2, 'likes');
});
await test('a bid records "Zabuni zangu" readable by its owner only', async () => {
  await db.doc('products/auc').set({ title: 'Simu', price: 10000, stock: 1, userId: 'seller', saleMode: 'auction', modeData: { mode: 'auction', endTime: Date.now() + 3600e3 } });
  assert((await call('auctionPlaceBid', 'b2', { productId: 'auc', amount: 11000, clientBidId: 'x1' })).ok, 'bid');
  const row = await get('auction_participation/b2__auc'); eq(row.myBid, 11000, 'row');
  eq((await realFetch(`${DOCS}/auction_participation/b2__auc`, { headers: { authorization: 'Bearer ' + jwt('b2') } })).status, 200, 'owner reads');
  eq((await realFetch(`${DOCS}/auction_participation/b2__auc`, { headers: { authorization: 'Bearer ' + jwt('b3') } })).status, 403, 'other refused');
});

console.log(`\nPRICE DROP QUEUE + LIVE EXTRAS: ${pass} passed, ${fail} failed`);
if (fail) console.log(fails.join('\n'));
process.exit(fail ? 1 : 0);

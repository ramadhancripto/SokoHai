#!/usr/bin/env node
/**
 * [AUCTION-LIVE] Implementation tests: pause/resume, bidder count, pause-freeze,
 * viewer join/leave counting, finalize idempotency + livePaused rules guards.
 * End-to-end against the FIREBASE EMULATOR (callables + rules).
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_auction_live_impl_emulator.mjs"
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
const realFetch = globalThis.fetch;
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
async function wipe() { await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }); }
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
  assert(r.ok, 'rules load ' + r.status + ' ' + (await r.text()).slice(0, 300));
}
function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function jwt(uid) { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none' }) + '.' + b64({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: n, user_id: uid, sub: uid, iat: n, exp: n + 3600, email: uid + '@u.test', email_verified: true, firebase: { sign_in_provider: 'password' } }) + '.'; }
function enc(v) { if (v === null) return { nullValue: null }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (typeof v === 'string') return { stringValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } }; return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }; }
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restPatch(uid, p, data) { const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'); return (await realFetch(`${DOCS}/${p}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) })).status; }
async function restCreate(uid, col, id, data) { return (await realFetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) })).status; }
const later = (h) => Date.now() + h * 3600e3, ago = (s) => Date.now() - s * 1000;

await loadRules(); await wipe();
for (const u of ['seller', 'b1', 'b2', 'b3']) await db.doc('users/' + u).set({ uid: u, fullName: u, isSeller: u === 'seller', businessSetupComplete: u === 'seller' });
const auc = (over) => Object.assign({ title: 'Kuku wa Kienyeji', price: 30000, stock: 1, userId: 'seller', publicationStatus: 'published', saleMode: 'auction', modeData: { mode: 'auction', endTime: later(2) } }, over || {});
await db.doc('products/A1').set(auc());
await db.doc('products/A2').set(auc({ title: 'Mchele 50kg' }));

console.log('\n[Live session: create/start/join/leave counting]');
let S1;
await test('seller creates + starts an auction live', async () => {
  const c = await call('liveCreate', 'seller', { kind: 'auction', title: 'Mnada wa kuku', productIds: ['A1'] });
  assert(c.ok, c.message); S1 = c.data.sessionId;
  const s = await call('liveStart', 'seller', { sessionId: S1 }); assert(s.ok, s.message);
  eq((await get('live_sessions/' + S1)).status, 'live', 'status');
});
await test('join/leave moves viewerCount exactly once per state change', async () => {
  const j1 = await call('liveJoin', 'b1', { sessionId: S1 }); assert(j1.ok && j1.data.viewerCount === 1, JSON.stringify(j1));
  const j1b = await call('liveJoin', 'b1', { sessionId: S1 }); assert(j1b.ok && j1b.data.viewerCount === 1, 're-join no double count');
  const j2 = await call('liveJoin', 'b2', { sessionId: S1 }); assert(j2.ok && j2.data.viewerCount === 2, JSON.stringify(j2));
  await call('liveLeave', 'b2', { sessionId: S1 });
  eq((await get('live_sessions/' + S1)).viewerCount, 1, 'after leave');
  await call('liveLeave', 'b2', { sessionId: S1 });
  eq((await get('live_sessions/' + S1)).viewerCount, 1, 'leave twice = once');
});

console.log('\n[Bidding: validation, duplicates, concurrency, bidder count]');
await db.doc('products/B1').set(auc({ title: 'B1' }));
await db.doc('products/B2').set(auc({ title: 'B2' }));
await db.doc('products/B3').set(auc({ title: 'B3' }));
await db.doc('products/B4').set(auc({ title: 'B4' }));
await test('below-minimum bid refused with minRequired; owner cannot bid', async () => {
  const lo = await call('auctionPlaceBid', 'b1', { productId: 'B1', amount: 31000 });
  assert(!lo.ok && /waliokuzidi:31500/.test(lo.message), lo.message);
  const own = await call('auctionPlaceBid', 'seller', { productId: 'B1', amount: 40000 });
  assert(!own.ok && /tangazo_lako/.test(own.message), own.message);
});
await test('concurrent bids: accepted set is consistent (leader=max, counts exact, no lost update)', async () => {
  const tries = [['b1', 32000], ['b2', 34000], ['b3', 36000]];
  const rs = await Promise.all(tries.map(([u, a], i) => call('auctionPlaceBid', u, { productId: 'B2', amount: a, clientBidId: 'cc' + i })));
  const acc = tries.filter((_, i) => rs[i].ok);
  assert(acc.length >= 1, 'at least one accepted: ' + JSON.stringify(rs));
  const m = (await get('products/B2')).modeData;
  const maxAcc = Math.max(...acc.map(([_, a]) => a));
  eq(m.currentBid, maxAcc, 'highest accepted leads');
  eq(m.maxBidder, acc.find(([_, a]) => a === maxAcc)[0], 'leader matches');
  eq(m.totalBids, acc.length, 'count matches accepted');
  eq((await db.collection('products/B2/bids').get()).size, acc.length, 'one doc per accepted bid');
});
await test('same clientBidId twice = duplicate (no double submission)', async () => {
  const a = await call('auctionPlaceBid', 'b1', { productId: 'B3', amount: 32000, clientBidId: 'k1' });
  assert(a.ok, a.message);
  const d = await call('auctionPlaceBid', 'b1', { productId: 'B3', amount: 32000, clientBidId: 'k1' });
  assert(d.ok && d.data.duplicate === true, JSON.stringify(d));
  eq((await get('products/B3')).modeData.totalBids, 1, 'still one');
});
await test('distinct bidder count is server-authoritative', async () => {
  assert((await call('auctionPlaceBid', 'b1', { productId: 'B4', amount: 32000, clientBidId: 'd1' })).ok, 'b1');
  assert((await call('auctionPlaceBid', 'b2', { productId: 'B4', amount: 34000, clientBidId: 'd2' })).ok, 'b2');
  assert((await call('auctionPlaceBid', 'b3', { productId: 'B4', amount: 36000, clientBidId: 'd3' })).ok, 'b3');
  const m = (await get('products/B4')).modeData;
  eq(m.bidderCount, 3, 'three distinct bidders'); eq(m.bidders.length, 3, 'bidders array');
  assert((await call('auctionPlaceBid', 'b1', { productId: 'B4', amount: 38000, clientBidId: 'd4' })).ok, 'b1 again');
  const m2 = (await get('products/B4')).modeData;
  eq(m2.bidderCount, 3, 'repeat bidder does not inflate'); eq(m2.totalBids, 4, 'four bids');
});
await test('leader cannot outbid themselves', async () => {
  const r = await call('auctionPlaceBid', 'b1', { productId: 'B4', amount: 40000 });
  assert(!r.ok && /tayari_unaongoza/.test(r.message), r.message);
});

console.log('\n[Pause / resume]');
let S2;
await test('second session on a bid-free product can be paused pre-bid', async () => {
  const c = await call('liveCreate', 'seller', { kind: 'auction', title: 'Mnada wa mchele', productIds: ['A2'] });
  assert(c.ok, c.message); S2 = c.data.sessionId;
  assert((await call('liveStart', 'seller', { sessionId: S2 })).ok, 'start');
  const p = await call('livePause', 'seller', { sessionId: S2 });
  assert(p.ok, p.message);
  eq((await get('live_sessions/' + S2)).status, 'paused', 'paused');
  eq((await get('products/A2')).modeData.livePaused, true, 'product frozen');
});
await test('while paused: bids + comments + likes refused; join still counts', async () => {
  const b = await call('auctionPlaceBid', 'b1', { productId: 'A2', amount: 32000 });
  assert(!b.ok && /mnada_umesitishwa/.test(b.message), b.message);
  const cm = await call('liveComment', 'b1', { sessionId: S2, text: 'hello', clientId: 'x1' });
  assert(!cm.ok && /live_imesitishwa/.test(cm.message), cm.message);
  const lk = await call('liveLike', 'b1', { sessionId: S2 });
  assert(!lk.ok && /live_imesitishwa/.test(lk.message), lk.message);
  const j = await call('liveJoin', 'b1', { sessionId: S2 }); assert(j.ok && j.data.viewerCount === 1, JSON.stringify(j));
});
await test('non-host cannot pause; pause refused once bids exist', async () => {
  const nh = await call('livePause', 'b1', { sessionId: S1 });
  assert(!nh.ok && /si_mwenyeji/.test(nh.message), nh.message);
  assert((await call('auctionPlaceBid', 'b1', { productId: 'A1', amount: 32000, clientBidId: 'hb1' })).ok, 'seed one bid');
  const hasBids = await call('livePause', 'seller', { sessionId: S1 });
  assert(!hasBids.ok && /mnada_una_zabuni/.test(hasBids.message), hasBids.message);
});
await test('resume unfreezes and extends the server endTime; bidding works again', async () => {
  const before = (await get('products/A2')).modeData.endTime;
  await new Promise(r => setTimeout(r, 1200));
  const rs = await call('liveResume', 'seller', { sessionId: S2 });
  assert(rs.ok && rs.data.pausedMs >= 1000, JSON.stringify(rs));
  const m = (await get('products/A2')).modeData;
  eq(m.livePaused, false, 'unfrozen'); assert(m.endTime >= before + 1000, 'endTime extended by paused duration');
  eq((await get('live_sessions/' + S2)).status, 'live', 'live again');
  const b = await call('auctionPlaceBid', 'b1', { productId: 'A2', amount: 32000, clientBidId: 'r1' });
  assert(b.ok, b.message);
  const cm = await call('liveComment', 'b1', { sessionId: S2, text: 'tumerudi', clientId: 'x2' });
  assert(cm.ok, cm.message);
});
await test('ending a paused session unfreezes the products (no stuck freeze)', async () => {
  const c = await call('liveCreate', 'seller', { kind: 'auction', title: 'Jaribio', productIds: ['A2'] });
  const s3 = c.data.sessionId;
  await call('liveStart', 'seller', { sessionId: s3 });
  await db.doc('products/A2').update({ 'modeData.totalBids': 0 });   // simulate pre-bid for the pause rule
  assert((await call('livePause', 'seller', { sessionId: s3 })).ok, 'pause');
  assert((await call('liveEnd', 'seller', { sessionId: s3 })).ok, 'end');
  eq((await get('products/A2')).modeData.livePaused, false, 'unfrozen by end');
});

console.log('\n[Finalize + rules guards]');
await test('auctionFinalize closes once; second call is a no-op', async () => {
  await db.doc('products/B4').update({ 'modeData.endTime': ago(5) });
  const r = await call('auctionFinalize', 'b1', { productId: 'B4' });
  assert(r.ok && r.data.closed && r.data.winnerId === 'b1' && r.data.winnerBid === 38000, JSON.stringify(r));
  const again = await call('auctionFinalize', 'b1', { productId: 'B4' });
  eq(again.data.closed, false, 'idempotent');
});
await test('browser cannot forge bids/modeData (rules)', async () => {
  eq(await restPatch('b1', 'products/A2', { 'modeData.currentBid': 1 }), 403, 'buyer modeData write');
  eq(await restPatch('seller', 'products/A2', { 'modeData.livePaused': true }), 403, 'owner cannot flip livePaused');
});
await test('owner can still edit own listing title (rules sanity)', async () => {
  eq(await restPatch('seller', 'products/A2', { title: 'Mchele 50kg safi' }), 200, 'title edit');
});
await test('create with livePaused=true is refused; clean create allowed (rules)', async () => {
  const base = { title: 'Maharage', price: 5000, stock: 0, openingStockPending: true, reservedStock: 0, userId: 'seller', saleMode: 'auction' };
  eq(await restCreate('seller', 'products', 'pz1', Object.assign({}, base, { modeData: { mode: 'auction', endTime: later(2), livePaused: true } })), 403, 'frozen create');
  eq(await restCreate('seller', 'products', 'pz2', Object.assign({}, base, { modeData: { mode: 'auction', endTime: later(2) } })), 200, 'clean create');
});

console.log(`\nAUCTION-LIVE IMPL: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.join('\n'));
process.exit(fail ? 1 : 0);

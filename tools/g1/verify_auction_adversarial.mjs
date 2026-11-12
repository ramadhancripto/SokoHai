#!/usr/bin/env node
/* ============================================================
 * VERIFY (B) — Auction adversarial: mapengo ambayo battery
 * haikufunika moja kwa moja. Read-only dhidi ya repo; emulator only.
 * ========================================================== */
import { createRequire } from 'node:module';
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

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid) => ({ uid, token: { uid, email: uid + '@u.test', email_verified: true } });
async function call(name, uid, data) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: uid ? tok(uid) : undefined, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
}
function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function jwt(uid) { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none' }) + '.' + b64({ user_id: uid, sub: uid, iat: n, exp: n + 3600, firebase: { sign_in_provider: 'password' } }) + '.'; }
function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restPatch(uid, p, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${DOCS}/${p}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restCreate(uid, col, id, data) {
  const r = await fetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restCreateSub(uid, p, id, data) {
  const r = await fetch(`${DOCS}/${p}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
const later = (h) => Date.now() + h * 3600e3;
const S = 'vSeller', B1 = 'vBid1', B2 = 'vBid2', X = 'vStranger';

await wipe();
await db.doc('products/vauc').set({ title: 'Pikipiki', price: 500000, stock: 1, userId: S, saleMode: 'auction', modeData: { mode: 'auction', endTime: later(2) } });

await test('V-B1 forged bid doc moja kwa moja (subcollection) -> 403', async () => {
  eq(await restCreateSub(B1, 'products/vauc/bids', 'forge1', { uid: B1, amount: 999999999 }), 403, 'bidder forge');
  eq(await restCreateSub(S, 'products/vauc/bids', 'forge2', { uid: S, amount: 1 }), 403, 'seller forge');
});
let minNext = 0;
await test('V-B2 kujipa ushindi (PATCH winnerId/winnerBid) -> 403', async () => {
  const r = await call('auctionPlaceBid', B1, { productId: 'vauc', amount: 600000, clientBidId: 'vb1' });
  eq(r.ok, true, JSON.stringify(r));
  minNext = r.data.minNext;
  eq(await restPatch(B2, 'products/vauc', { modeData: { mode: 'auction', endTime: later(2), currentBid: 600000, maxBidder: B1, totalBids: 1, winnerId: B2, winnerBid: 600000 } }), 403, 'stranger self-win');
  eq(await restPatch(S, 'products/vauc', { modeData: { mode: 'auction', endTime: later(2), currentBid: 100, maxBidder: S, totalBids: 1, winnerId: S, winnerBid: 100 } }), 403, 'seller self-win');
  eq(await restPatch(B1, 'products/vauc', { modeData: { mode: 'auction', endTime: later(2), currentBid: 1, maxBidder: B1, totalBids: 1 } }), 403, 'leader lowers currentBid');
});
await test('V-B3 kufunga mnada mapema (PATCH ended) -> 403; finalize mapema haifungi', async () => {
  eq(await restPatch(S, 'products/vauc', { modeData: { mode: 'auction', endTime: later(2), currentBid: 600000, maxBidder: B1, totalBids: 1, ended: true } }), 403, 'seller early-close');
  const f = await call('auctionFinalize', X, { productId: 'vauc' });
  eq(f.ok, true, JSON.stringify(f));
  eq(f.data.closed, false, 'not closed');
  eq(f.data.ended, false, 'not ended');
  eq((await db.doc('products/vauc').get()).data().modeData.ended || false, false, 'still open');
});
await test('V-B4 race: zabuni 5 sambamba zenye clientBidId moja -> zinahesabika 1', async () => {
  const before = (await db.doc('products/vauc').get()).data().modeData.totalBids;
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => call('auctionPlaceBid', B2, { productId: 'vauc', amount: minNext, clientBidId: 'race1' })));
  assert(rs.every(r => r.ok), 'all ok (dup-ok): ' + JSON.stringify(rs));
  const after = (await db.doc('products/vauc').get()).data().modeData.totalBids;
  eq(after - before, 1, 'counted once');
});
await test('V-B5 kubadilisha saleMode baada ya zabuni -> 403 (hakuna cancel ya siri)', async () => {
  eq(await restPatch(S, 'products/vauc', { saleMode: 'fixed' }), 403, 'mode switch blocked');
});
await test('V-B6 participation row: client write -> 403; mwenza asiyehusika hawezi kuisoma', async () => {
  eq(await restCreate(B2, 'auction_participation', X + '__vauc', { uid: B1, productId: 'vauc' }), 403, 'client write');
  const r = await fetch(`${DOCS}/auction_participation/${B1}__vauc`, { headers: { authorization: 'Bearer ' + jwt(B2) } });
  eq(r.status, 403, 'stranger read');
  const r2 = await fetch(`${DOCS}/auction_participation/${B1}__vauc`, { headers: { authorization: 'Bearer ' + jwt(B1) } });
  eq(r2.status, 200, 'owner read');
});
await test('V-B7 zabuni baada ya kufungwa -> mnada_umefungwa; mshindi analipia kwa bei yake', async () => {
  await db.doc('products/vauc').update({ 'modeData.endTime': Date.now() - 1000 });
  const f = await call('auctionFinalize', X, { productId: 'vauc' });
  eq(f.ok && f.data.closed, true, JSON.stringify(f));
  const late = await call('auctionPlaceBid', B1, { productId: 'vauc', amount: 999999, clientBidId: 'late1' });
  eq(late.ok, false, 'late blocked'); assert(/mnada_umefungwa/.test(late.message || ''), late.message);
  const m = (await db.doc('products/vauc').get()).data().modeData;
  eq(m.winnerId, B2, 'winner'); eq(m.winnerBid, minNext, 'winning bid');
});

const fails = results.filter(r => !r.ok);
console.log(`\n[VERIFY-B] ${results.length - fails.length}/${results.length} passed`);
if (fails.length) process.exitCode = 1;

#!/usr/bin/env node
/* [SEARCH 2026-11-14] Catalogue search on the emulator:
 *  - rules: a client can never create or change `searchTokens` (only keep or drop them);
 *  - adminSearchBackfill: admin only, idempotent, audited;
 *  - a product OLDER than the newest 60 is found by array-contains-any (the old feed search could not).
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_search_index_emulator.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, extra = {}) => { const now = Math.floor(Date.now() / 1000); return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(Object.assign({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }, extra)) + '.'; };
const enc = v => v === null || v === undefined ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
async function rest(method, url, tok, body) { const r = await fetch(url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, text: await r.text() }; }
const create = (col, id, tok, data) => rest('POST', `${BASE}/${col}?documentId=${id}`, tok, { fields: fields(data) });
const patch = (col, id, tok, data) => rest('PATCH', `${BASE}/${col}/${id}?` + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'), tok, { fields: fields(data) });
const del = (col, id, tok, keys) => rest('PATCH', `${BASE}/${col}/${id}?` + keys.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'), tok, { fields: {} });
let pass = 0, fail = 0;
async function test(n, f) { try { await f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + (e && e.message)); } }
const ok = (c, m) => { if (!c) throw new Error(m); };
async function call(name, uid, data, extra) { try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: { uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) }, rawRequest: { headers: {} } }) }; } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; } }
const SELLER = 'srchSeller', T = Date.now().toString(36);
const SELL = token(SELLER, { email: 'srch@test.tz', email_verified: true });
const base = { title: 'Kitu cha majaribio', price: 1000, stock: 0, userId: SELLER, openingStockPending: true, reservedStock: 0, publicationStatus: 'published' };

await test('rules: seller cannot create a product with searchTokens', async () => {
  const r = await create('products', 'srA' + T, SELL, Object.assign({}, base, { searchTokens: ['spam', 'iphone'] }));
  ok(r.status === 403, r.status + ' ' + r.text.slice(0, 120));
});
await test('rules: the same product without searchTokens is accepted', async () => {
  const r = await create('products', 'srB' + T, SELL, base); ok(r.status === 200, r.status + ' ' + r.text.slice(0, 160));
});
await test('server indexes it (indexDoc) and the seller can still edit other fields', async () => {
  const si = require(path.join(ROOT, 'functions', 'search-index.js'));
  const ref = db.doc('products/srB' + T);
  ok(await si._testing.indexDoc(ref, (await ref.get()).data()) === 'written', 'not written');
  ok(await si._testing.indexDoc(ref, (await ref.get()).data()) === 'same', 'second index should be a no-op');
  const r = await patch('products', 'srB' + T, SELL, { price: 1500 }); ok(r.status === 200, r.status + ' ' + r.text.slice(0, 160));
});
await test('rules: seller cannot rewrite searchTokens (keyword stuffing)', async () => {
  const r = await patch('products', 'srB' + T, SELL, { searchTokens: ['iphone', 'samsung', 'bure'] }); ok(r.status === 403, r.status + ' ' + r.text.slice(0, 120));
});
await test('rules: seller may drop searchTokens (full rewrite); the trigger re-adds them', async () => {
  const r = await del('products', 'srB' + T, SELL, ['searchTokens']); ok(r.status === 200, r.status + ' ' + r.text.slice(0, 160));
});
await test('rules: services follow the same rule', async () => {
  const r = await create('services', 'svA' + T, SELL, { title: 'Fundi', userId: SELLER, price: 1000, searchTokens: ['x'] });
  ok(r.status === 403, r.status + ' ' + r.text.slice(0, 120));
});
await test('adminSearchBackfill: non-admin refused', async () => { const r = await call('adminSearchBackfill', 'nobody', { collection: 'products' }); ok(!r.ok && /permission/.test(r.code), JSON.stringify(r)); });
await test('a product older than the newest 60 is found by its name (and by a synonym)', async () => {
  const now = Date.now();
  await db.doc('products/srOld' + T).set(Object.assign({}, base, { title: 'Jokofu la Hisense ' + T, stock: 3, availabilityStatus: 'available', isOnline: true, createdAt: new Date(now - 86400000 * 400).toISOString() }));
  const batch = db.batch();
  for (let i = 0; i < 70; i++) batch.set(db.doc(`products/srNew${T}_${i}`), Object.assign({}, base, { title: 'Bidhaa mpya ' + i, stock: 1, createdAt: new Date(now - i * 1000).toISOString() }));
  await batch.commit();
  const newest = await db.collection('products').orderBy('createdAt', 'desc').limit(60).get();
  ok(!newest.docs.some(d => d.id === 'srOld' + T), 'precondition: old product must be outside the newest 60');
  let next = null, rounds = 0, written = 0;
  do { const r = await call('adminSearchBackfill', 'ops', { collection: 'products', startAfter: next, pageSize: 200 }, { admin: true }); ok(r.ok, JSON.stringify(r)); next = r.data.next; written += r.data.written; } while (next && ++rounds < 50);
  ok(written >= 1, 'nothing indexed');
  const ST = require(path.join(ROOT, 'shared', 'search-tokens.js'));
  for (const q of [T.toLowerCase(), 'hisense', 'fridge hisense']) {
    const snap = await db.collection('products').where('searchTokens', 'array-contains-any', ST.queryTokens(q)).limit(60).get();
    const hit = snap.docs.find(d => d.id === 'srOld' + T);
    ok(hit && ST.matches(hit.data(), q), 'not found for "' + q + '"');
  }
  const audit = await db.collection('admin_audit_log').where('action', '==', 'SEARCH_BACKFILL').limit(1).get(); ok(!audit.empty, 'no audit row');
});
console.log(`SEARCH INDEX (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

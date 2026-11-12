#!/usr/bin/env node
/* ============================================================
 * PHASE 9 — Boost/entitlements: server ndiyo mamlaka ya ada.
 * gate ON: PesaPal lazima (paid + amount + initiator + single-use).
 * gate OFF: free (server bado hukagua umiliki). Client haweza
 * kujiboost mwenyewe (rules). PesaPal = stub (S7 pattern).
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
process.env.PESAPAL_CONSUMER_KEY = 'test-key';
process.env.PESAPAL_CONSUMER_SECRET = 'test-secret';
process.env.PESAPAL_BASE_URL = 'https://pesapal.stub/v3';
process.env.ADMIN_EMAILS = 'admin@sokohai.test';

const realFetch = globalThis.fetch;
const PP = new Map();
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith('https://pesapal.stub/')) {
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('/api/Auth/RequestToken')) return json({ token: 't', expiryDate: new Date(Date.now() + 3e5).toISOString(), status: '200' });
    if (u.includes('/GetTransactionStatus')) {
      const id = new URL(u).searchParams.get('orderTrackingId');
      const t = PP.get(id);
      if (!t) return json({ status_code: 0, payment_status_description: 'INVALID', order_tracking_id: id, amount: 0, currency: 'TZS', status: '200' });
      return json({ status_code: t.status_code ?? 1, payment_status_description: 'Completed', order_tracking_id: id,
        merchant_reference: t.merchant_reference || '', amount: t.amount, currency: 'TZS', status: '200' });
    }
    return json({ error: { message: 'stub' } });
  }
  return realFetch(url, opts);
};

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();

const results = [];
let group = '';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid) => ({ uid, token: { uid, email: uid + '@u.test', email_verified: true } });
async function call(uid, data) {
  try {
    const r = await fns.entitlementGrant.run({ data: data || {}, auth: tok(uid), rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
async function wipe() {
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe'); PP.clear();
}
async function idToken(uid) {
  const r = await realFetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: uid + '@rules.test', password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken, 'signUp: ' + JSON.stringify(j).slice(0, 200));
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
async function restCreate(tk, col, id, data) {
  const r = await realFetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restPatch(tk, docPath, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await realFetch(`${DOCS}/${docPath}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } })
  });
  assert(r.ok, 'rules load: ' + r.status);
}
const getd = async (p) => (await db.doc(p).get()).data();

const UID = 'boostseller';
async function main() {
  group = 'P9 boost'; console.log('\n[' + group + ']');
  await wipe();
  await loadRules();
  await db.doc('system/config').set({ fees: { boost: true } });
  await db.doc('products/b1').set({ userId: UID, price: 5000, stock: 3 });
  await db.doc('products/b2').set({ userId: UID, price: 7000, stock: 1 });
  const price = 2000; // boostPrice(products, 1000 views, 3 days)

  await test('B1 gate ON bila malipo inakataliwa', async () => {
    const r = await call(UID, { kind: 'boost', collectionName: 'products', itemId: 'b1', targetViews: 1000, boostDays: 3 });
    eq(r.ok, false, 'rejected'); eq(r.code, 'failed-precondition', 'needs payment');
    eq((await getd('products/b1')).isBoosted || false, false, 'haijaboost');
  });

  await test('B2 malipo yasiyolipwa / pungufu yanakataliwa', async () => {
    PP.set('TX-BAD', { amount: 0, status_code: 0, merchant_reference: 'MBAD' });
    const r1 = await call(UID, { kind: 'boost', collectionName: 'products', itemId: 'b1', targetViews: 1000, boostDays: 3, orderTrackingId: 'TX-BAD' });
    eq(r1.ok, false, 'unpaid rejected');
    PP.set('TX-LOW', { amount: 500, status_code: 1, merchant_reference: 'MLOW' });
    await db.doc('escrow_holds/ppinit_MLOW').set({ kind: 'pesapal_init', uid: UID, amount: 500, merchantReference: 'MLOW' });
    const r2 = await call(UID, { kind: 'boost', collectionName: 'products', itemId: 'b1', targetViews: 1000, boostDays: 3, orderTrackingId: 'TX-LOW' });
    eq(r2.ok, false, 'underpaid rejected');
    assert(/pungufu/i.test(r2.message || ''), 'ujumbe wa pungufu: ' + r2.message);
  });

  await test('B3 malipo sahihi = boosted (bei ya server)', async () => {
    PP.set('TX-BOOST1', { amount: price, status_code: 1, merchant_reference: 'MBO1' });
    await db.doc('escrow_holds/ppinit_MBO1').set({ kind: 'pesapal_init', uid: UID, amount: price, merchantReference: 'MBO1' });
    const r = await call(UID, { kind: 'boost', collectionName: 'products', itemId: 'b1', targetViews: 1000, boostDays: 3, orderTrackingId: 'TX-BOOST1' });
    assert(r.ok, 'grant ok: ' + JSON.stringify(r).slice(0, 250));
    eq(r.data.price, price, 'bei ya server 2000');
    const p = await getd('products/b1');
    eq(p.isBoosted, true, 'boosted'); eq(p.boostPaidRef, 'TX-BOOST1', 'paidRef'); eq(p.boostPrice, price, 'boostPrice');
  });

  await test('B4 muamala mmoja hauwezi ku-boost vitu viwili (double-spend)', async () => {
    const r = await call(UID, { kind: 'boost', collectionName: 'products', itemId: 'b2', targetViews: 1000, boostDays: 3, orderTrackingId: 'TX-BOOST1' });
    eq(r.ok, false, 'reuse rejected');
    assert(/tayari umetumika/i.test(r.message || ''), 'ujumbe: ' + r.message);
    eq((await getd('products/b2')).isBoosted || false, false, 'b2 haijaboost');
  });

  await test('B5 mtu hawezi ku-boost tangazo la mtu', async () => {
    PP.set('TX-BOOST2', { amount: price, status_code: 1, merchant_reference: 'MBO2' });
    await db.doc('escrow_holds/ppinit_MBO2').set({ kind: 'pesapal_init', uid: 'mwizi', amount: price, merchantReference: 'MBO2' });
    const r = await call('mwizi', { kind: 'boost', collectionName: 'products', itemId: 'b2', targetViews: 1000, boostDays: 3, orderTrackingId: 'TX-BOOST2' });
    eq(r.ok, false, 'rejected'); eq(r.code, 'permission-denied', 'si lako');
  });

  await test('B6 gate OFF (free): bila tid, lakini umiliki bado hukaguliwa', async () => {
    await db.doc('system/config').set({ fees: { boost: false } });
    const r1 = await call(UID, { kind: 'boost', collectionName: 'products', itemId: 'b2', targetViews: 1000, boostDays: 3 });
    assert(r1.ok, 'free grant ok');
    eq((await getd('products/b2')).isBoosted, true, 'b2 boosted bure');
    await db.doc('products/b3').set({ userId: UID, price: 1000, stock: 1 });
    const r2 = await call('mwizi', { kind: 'boost', collectionName: 'products', itemId: 'b3', targetViews: 1000, boostDays: 3 });
    eq(r2.ok, false, 'free still checks ownership');
  });

  await test('B7 client hawezi kujiboost kupitia rules (products/services)', async () => {
    const S = await idToken('p9seller');
    await db.doc('products/p9a').set({ userId: S.uid, price: 1000, stock: 1 });
    eq(await restPatch(S.token, 'products/p9a', { isBoosted: true }), 403, 'self-boost denied');
    eq(await restPatch(S.token, 'products/p9a', { boostPaidRef: 'fake' }), 403, 'paidRef denied');
    await db.doc('services/s9a').set({ userId: S.uid, price: 1000 });
    eq(await restPatch(S.token, 'services/s9a', { isBoosted: true }), 403, 'service self-boost denied');
  });

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE9 BOOST: ' + pass + ' passed, ' + fail + ' failed');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

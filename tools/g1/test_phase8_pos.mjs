#!/usr/bin/env node
/* ============================================================
 * PHASE 8 — POS / shop books / staff: isolation + sale authority.
 * rules (REST): shop_ledger/shop_staff ni za owner (+delegate),
 * shopOwnerId haihaririki, staff hawezi kujipa mwenyewe (rules).
 * server (in-process): posSale idempotent, scope-bound, honored.
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
let group = '';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid) => ({ uid, token: { uid, email: uid + '@u.test', email_verified: true } });
async function call(auth, data) {
  try {
    const r = await fns.posSale.run({ data: data || {}, auth: typeof auth === 'string' ? tok(auth) : auth, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
}
async function idToken(uid) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
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
  const r = await fetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restPatch(tk, docPath, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${DOCS}/${docPath}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restGet(tk, docPath) {
  const r = await fetch(`${DOCS}/${docPath}`, { headers: { authorization: 'Bearer ' + tk } });
  return r.status;
}
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } })
  });
  assert(r.ok, 'rules load: ' + r.status);
}
const getd = async (p) => (await db.doc(p).get()).data();

async function main() {
  group = 'P8 rules'; console.log('\n[' + group + ']');
  await wipe();
  await loadRules();
  const O = await idToken('p8owner'), X = await idToken('p8stranger');

  await test('P8-1 shop_ledger: owner anaandika, mgeni hapati (read/write)', async () => {
    eq(await restCreate(O.token, 'shop_ledger', 'l1', { shopOwnerId: O.uid, type: 'income_offline', title: 'mauzo', amount: 5000, status: 'completed' }), 200, 'owner create');
    eq(await restGet(O.token, 'shop_ledger/l1'), 200, 'owner read');
    eq(await restGet(X.token, 'shop_ledger/l1'), 403, 'stranger read denied');
    eq(await restPatch(X.token, 'shop_ledger/l1', { amount: 1 }), 403, 'stranger write denied');
    eq(await restCreate(X.token, 'shop_ledger', 'l2', { shopOwnerId: O.uid, type: 'debt', title: 'fake', amount: 1 }), 403, 'stranger create-as-owner denied');
  });

  await test('P8-2 shopOwnerId haihaririki (ledger + staff)', async () => {
    eq(await restPatch(O.token, 'shop_ledger/l1', { shopOwnerId: X.uid }), 403, 'ledger owner immutable');
    eq(await restCreate(O.token, 'shop_staff', 's1', { shopOwnerId: O.uid, name: 'Juma', salary: 300000, role: 'cashier', status: 'active' }), 200, 'staff create');
    eq(await restPatch(O.token, 'shop_staff/s1', { shopOwnerId: X.uid }), 403, 'staff owner immutable');
    eq(await restGet(X.token, 'shop_staff/s1'), 403, 'stranger staff read denied');
  });

  await test('P8-3 mtumiaji hawezi kujipa staff kwa duka la mtu (shopOwnerUid)', async () => {
    eq(await restCreate(X.token, 'users', X.uid, { uid: X.uid, displayName: 'X' }), 200, 'profile create');
    eq(await restPatch(X.token, 'users/' + X.uid, { shopOwnerUid: O.uid }), 403, 'self-assign staff denied');
    eq(await restPatch(X.token, 'users/' + X.uid, { shopOwnerUid: X.uid }), 200, 'self-assign own uid ok');
    // X (asiye staff) hawezi kusoma wala kuandika vitabu vya O.
    eq(await restGet(X.token, 'shop_ledger/l1'), 403, 'bado denied');
  });

  group = 'P8 server'; console.log('\n[' + group + ']');
  await test('P8-4 posSale: mauzo halali + idempotent replay', async () => {
    await db.doc('products/p8a').set({ userId: 'seller8', stock: 10, price: 500 });
    const payload = { idempotencyKey: 'P8KEY-0001', items: [{ productId: 'p8a', quantity: 2, unitMode: 'pc', pricingMode: 'retail' }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 1000 } };
    const r1 = await call('seller8', payload);
    assert(r1.ok, 'sale ok: ' + JSON.stringify(r1).slice(0, 300));
    eq(r1.data.total, 1000, 'total 2x500 (server price)');
    eq((await getd('products/p8a')).stock, 8, 'stock 8');
    const r2 = await call('seller8', payload);
    assert(r2.ok && r2.data.idempotent === true, 'replay idempotent');
    eq((await getd('products/p8a')).stock, 8, 'stock bado 8 (si mara mbili)');
  });

  await test('P8-5 posSale: key moja + payload tofauti / mtumiaji tofauti = already-exists', async () => {
    const other = { idempotencyKey: 'P8KEY-0001', items: [{ productId: 'p8a', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 500 } };
    const r = await call('seller8', other);
    eq(r.ok, false, 'rejected'); eq(r.code, 'already-exists', 'fingerprint conflict');
    const same = { idempotencyKey: 'P8KEY-0001', items: [{ productId: 'p8a', quantity: 2, unitMode: 'pc', pricingMode: 'retail' }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 1000 } };
    const r3 = await call('seller8B', same);
    eq(r3.ok, false, 'cross-cashier rejected'); eq(r3.code, 'already-exists', 'cashier bound');
  });

  await test('P8-6 posSale: stock haitoshi / cash haitoshi zinakataliwa (honest)', async () => {
    const noStock = { idempotencyKey: 'P8KEY-0002', items: [{ productId: 'p8a', quantity: 99, unitMode: 'pc', pricingMode: 'retail' }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 99999 } };
    const r1 = await call('seller8', noStock);
    eq(r1.ok, false, 'no stock rejected');
    assert(/haitoshi|INSUFFICIENT/i.test(r1.message || ''), 'ujumbe wa stock: ' + r1.message);
    const noCash = { idempotencyKey: 'P8KEY-0003', items: [{ productId: 'p8a', quantity: 1, unitMode: 'pc', pricingMode: 'retail' }], discountRequest: { type: 'none' }, payment: { method: 'Cash', cashReceived: 100 } };
    const r2 = await call('seller8', noCash);
    eq(r2.ok, false, 'no cash rejected');
    eq((await getd('products/p8a')).stock, 8, 'stock haijaguswa na majaribio yaliyokataliwa');
  });

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE8 POS: ' + pass + ' passed, ' + fail + ' failed');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

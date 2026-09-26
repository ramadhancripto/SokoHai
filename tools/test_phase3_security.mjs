#!/usr/bin/env node
/* Phase C Firestore rules regression suite. Emulator-only; never production. */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) {
  console.error('BLOCKED: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are required.');
  process.exit(2);
}
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
// Load the real Functions module so the same Firebase Admin initialization used
// by the production business logic is exercised against the emulator.
require('../functions/index.js');
const admin = require('firebase-admin');
const db = admin.firestore();
const results = [];
const password = 'TestOnly-' + randomBytes(12).toString('hex') + '!Aa1';
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

function assert(ok, msg) { if (!ok) throw new Error(msg); }
function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
async function tokenFor(label) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=phase-c-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `phasec_${label}_${Date.now()}@sokohai.local`, password, returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken && j.localId, `auth emulator signup failed for ${label}`);
  return { token: j.idToken, uid: j.localId };
}
async function adminToken() {
  const custom = await admin.auth().createCustomToken('phasec_admin', { admin: true });
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=phase-c-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken, 'admin custom-token exchange failed');
  return { token: j.idToken, uid: j.localId || 'phasec_admin' };
}
async function rest(method, token, path, data) {
  const url = `${DOCS}/${path}`;
  const opts = { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } };
  if (data) opts.body = JSON.stringify({ fields: enc(data).mapValue.fields });
  const r = await fetch(url, opts);
  return r.status;
}
async function create(t, col, id, data) { return rest('POST', t.token, `${col}?documentId=${id}`, data); }
async function patch(t, path, data) {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  return rest('PATCH', t.token, `${path}?${mask}&currentDocument.exists=true`, data);
}
async function read(t, path) { return rest('GET', t.token, path); }
async function del(t, path) { return rest('DELETE', t.token, path); }
async function test(name, fn) {
  try { await fn(); results.push(true); console.log('PASS ' + name); }
  catch (e) { results.push(false); console.log('FAIL ' + name + ': ' + e.message); }
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'emulator wipe failed');
}

await wipe();
const buyer = await tokenFor('buyer');
const seller = await tokenFor('seller');
const adminUser = await adminToken();
const agent = await tokenFor('agent');
const other = await tokenFor('other');

// Minimal relationship documents used by the actual active schemas.
await db.doc(`users/${buyer.uid}`).set({ uid: buyer.uid, walletBalance: 0 });
await db.doc(`users/${seller.uid}`).set({ uid: seller.uid, walletBalance: 0 });
await db.doc(`users/${agent.uid}`).set({ uid: agent.uid, walletBalance: 0, isApprovedAgent: true, shopOwnerUid: seller.uid });
await db.doc(`users/${other.uid}`).set({ uid: other.uid, walletBalance: 0 });
await db.doc('suppliers/supplier_phasec').set({ name: 'TEST_SUPPLIER', shopOwnerId: seller.uid });
await db.doc('products/product_phasec').set({ title: 'TEST_PRODUCT', price: 100, stock: 10, userId: seller.uid });
await db.doc('sokopay_core_transactions/core_phasec').set({ orderId: 'order_phasec', buyerId: buyer.uid, sellerId: seller.uid, amount: 1000, paymentStatus: 'pending', escrowStatus: 'pending' });

console.log('\n[adminRevenue]');
await test('buyer create denied', async () => assert(await create(buyer, 'adminRevenue', 'buyer_create', { amount: 1 }) === 403, 'create allowed'));
await test('buyer update denied', async () => {
  await admin.firestore().doc('adminRevenue/server_seed').set({ amount: 100, type: 'test' });
  assert(await patch(buyer, 'adminRevenue/server_seed', { amount: 999 }) === 403, 'update allowed');
});
await test('buyer delete denied', async () => assert(await del(buyer, 'adminRevenue/server_seed') === 403, 'delete allowed'));
await test('buyer read denied', async () => assert(await read(buyer, 'adminRevenue/server_seed') === 403, 'read allowed'));
await test('admin read passes', async () => assert(await read(adminUser, 'adminRevenue/server_seed') === 200, 'admin read denied'));
await test('trusted Admin SDK write passes', async () => {
  await admin.firestore().doc('adminRevenue/server_event').set({ type: 'phase3_server_event', amount: 1 });
  assert((await db.doc('adminRevenue/server_event').get()).exists, 'server write missing');
});

console.log('\n[purchase_orders]');
const po = { shopOwnerId: seller.uid, supplierId: 'supplier_phasec', productId: 'product_phasec', quantity: 2, unitCost: 50, totalCost: 100, status: 'pending', createdAt: new Date().toISOString() };
await test('shop owner create passes', async () => assert(await create(seller, 'purchase_orders', 'po_phasec', po) === 200, 'owner create denied'));
await test('shop owner read passes', async () => assert(await read(seller, 'purchase_orders/po_phasec') === 200, 'owner read denied'));
await test('owner pending to completed passes', async () => assert(await patch(seller, 'purchase_orders/po_phasec', { status: 'completed' }) === 200, 'receive denied'));
await test('unrelated read denied', async () => assert(await read(other, 'purchase_orders/po_phasec') === 403, 'unrelated read allowed'));
await test('unrelated create denied', async () => assert(await create(other, 'purchase_orders', 'po_other', { ...po, shopOwnerId: seller.uid }) === 403, 'unrelated create allowed'));
await test('owner change denied', async () => assert(await patch(seller, 'purchase_orders/po_phasec', { shopOwnerId: other.uid }) === 403, 'owner change allowed'));
await test('delete denied', async () => assert(await del(seller, 'purchase_orders/po_phasec') === 403, 'delete allowed'));

console.log('\n[shipments]');
const shipment = { orderId: 'order_phasec', buyerId: buyer.uid, sellerId: seller.uid, sokopayCoreId: 'core_phasec', status: 'Courier Assigned', updatedAt: new Date().toISOString() };
await test('related buyer shipment create passes', async () => assert(await create(buyer, 'shipments', 'shipment_phasec', shipment) === 200, 'legitimate create denied'));
await test('related seller read passes', async () => assert(await read(seller, 'shipments/shipment_phasec') === 200, 'seller read denied'));
await test('related seller non-sensitive update passes', async () => assert(await patch(seller, 'shipments/shipment_phasec', { updatedAt: new Date().toISOString() }) === 200, 'seller update denied'));
await test('unrelated read denied', async () => assert(await read(other, 'shipments/shipment_phasec') === 403, 'unrelated read allowed'));
await test('unrelated create denied', async () => assert(await create(other, 'shipments', 'shipment_other', { ...shipment, buyerId: other.uid }) === 403, 'unrelated create allowed'));
for (const [label, field, value] of [
  ['buyerId tamper', 'buyerId', other.uid], ['sellerId tamper', 'sellerId', other.uid],
  ['orderId tamper', 'orderId', 'other_order'], ['core tamper', 'sokopayCoreId', 'other_core'],
  ['escrow tamper', 'escrowStatus', 'released'], ['payment tamper', 'paymentStatus', 'paid'],
  ['custody tamper', 'chainOfCustody', [{ by: other.uid }]], ['pickup token tamper', 'pickupToken', 'FAKE'],
  ['completion tamper', 'status', 'completed']
]) await test(label + ' denied', async () => assert(await patch(buyer, 'shipments/shipment_phasec', { [field]: value }) === 403, label + ' allowed'));
await test('shipment delete denied', async () => assert(await del(buyer, 'shipments/shipment_phasec') === 403, 'delete allowed'));

console.log('\n[activity_logs]');
await test('legitimate shop activity passes', async () => assert(await create(seller, 'activity_logs', 'activity_shop', { shopOwnerId: seller.uid, userId: seller.uid, action: 'TEST', createdAt: new Date().toISOString() }) === 200, 'shop activity denied'));
await test('legitimate assisted session passes', async () => assert(await create(agent, 'activity_logs', 'activity_agent', { agentId: agent.uid, memberUid: buyer.uid, type: 'ASSISTED_SESSION_START', at: new Date().toISOString() }) === 200, 'assisted activity denied'));
await test('unrelated write denied', async () => assert(await create(other, 'activity_logs', 'activity_forge', { userId: seller.uid, shopOwnerId: seller.uid, action: 'FORGED', createdAt: new Date().toISOString() }) === 403, 'unrelated write allowed'));
await test('forged actor denied', async () => assert(await create(buyer, 'activity_logs', 'activity_actor_forge', { actorId: other.uid, action: 'FORGED', at: new Date().toISOString() }) === 403, 'forged actor allowed'));
await test('unrelated read denied', async () => assert(await read(other, 'activity_logs/activity_shop') === 403, 'unrelated read allowed'));
await test('activity delete denied', async () => assert(await del(seller, 'activity_logs/activity_shop') === 403, 'delete allowed'));

const pass = results.filter(Boolean).length;
const fail = results.length - pass;
console.log(`\nPHASE 3 SECURITY: ${pass} passed, ${fail} failed`);
await admin.app().delete().catch(() => {});
if (fail) process.exit(1);

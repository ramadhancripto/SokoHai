#!/usr/bin/env node
/* ============================================================
 * PHASE 7 F7-1 GAP — deposit ya wallet kupitia IPN (mtumiaji
 * asiporudi kutoka PesaPal) + mutual-idempotency na njia ya
 * kivinjari. Emulator-only, PesaPal stubbed (network only).
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
    if (u.includes('/api/Transactions/SubmitOrderRequest')) {
      const body = JSON.parse((opts && opts.body) || '{}');
      return json({ redirect_url: 'https://pesapal.stub/pay/' + body.id, order_tracking_id: body.id, status: '200' });
    }
    if (u.includes('/GetTransactionStatus')) {
      const id = new URL(u).searchParams.get('orderTrackingId');
      const t = PP.get(id);
      if (!t) return json({ status_code: 0, payment_status_description: 'INVALID', order_tracking_id: id, amount: 0, currency: 'TZS', status: '200' });
      return json({ status_code: t.status_code ?? 1, payment_status_description: (t.status_code ?? 1) === 1 ? 'Completed' : 'Failed',
        order_tracking_id: id, merchant_reference: t.merchant_reference || '', amount: t.amount, currency: 'TZS', status: '200' });
    }
    return json({ error: { message: 'stub: haijulikani' } });
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
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
async function call(name, auth, data) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: typeof auth === 'string' ? tok(auth) : auth, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
function denied(r, codes, msg) {
  assert(!r.ok, msg + ' — ilitarajiwa kukataliwa: ' + JSON.stringify(r.data));
  if (codes) assert(codes.includes(r.code), msg + ' — code ' + r.code + ' (' + r.message + ')');
}
async function wipe() {
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe'); PP.clear();
}
async function ipn(query) {
  const res = { _c: 0, _b: '', set() {}, type() { return this; }, status(c) { this._c = c; return this; }, send(b) { this._b = String(b); return this; } };
  await fns.pesapalIpn({ method: 'GET', query: query || {} }, res);
  return { status: res._c, body: JSON.parse(res._b || '{}') };
}
const bal = async (uid) => Number(((await db.doc('users/' + uid).get()).data() || {}).walletBalance || 0);
const user = (uid, extra) => db.doc('users/' + uid).set(Object.assign({ uid, fullName: uid, walletBalance: 0 }, extra || {}));
const getd = async (p) => (await db.doc(p).get()).data();
const exists = async (p) => (await db.doc(p).get()).exists;

async function main() {
  group = 'F7-1'; console.log('\n[' + group + ']');
  await wipe();
  for (const u of ['buyer', 'eve']) await user(u);

  await test('S1 IPN peke yake huweka deposit (hakuna return)', async () => {
    await call('pesapalCheckout', 'buyer', { amount: 30000, orderTrackingId: 'DEP-1', purpose: 'deposit' });
    PP.set('DEP-1', { amount: 30000, status_code: 1, merchant_reference: 'DEP-1' });
    await ipn({ OrderTrackingId: 'DEP-1' });
    eq(await bal('buyer'), 30000, 'wallet +30000');
    eq((await getd('wallet_ledger/pesapal_deposit_DEP-1')).amountTSh, 30000, 'ledger');
  });
  await test('S2 IPN -> browser = already (mutual idempotency)', async () => {
    const r = await call('walletAdjust', 'buyer', { docId: 'buyer', amountTSh: 30000, type: 'deposit', orderTrackingId: 'DEP-1' });
    assert(r.ok && r.data.already === true, 'already: ' + JSON.stringify(r.data));
    eq(await bal('buyer'), 30000, 'mara moja tu');
  });
  await test('S3 browser -> IPN = single (reverse)', async () => {
    await call('pesapalCheckout', 'buyer', { amount: 12000, orderTrackingId: 'DEP-2', purpose: 'deposit' });
    PP.set('DEP-2', { amount: 12000, status_code: 1, merchant_reference: 'DEP-2' });
    const r = await call('walletAdjust', 'buyer', { docId: 'buyer', amountTSh: 12000, type: 'deposit', orderTrackingId: 'DEP-2' });
    assert(r.ok && !r.data.already, 'browser wins');
    await ipn({ OrderTrackingId: 'DEP-2' });
    eq(await bal('buyer'), 42000, '30000+12000 mara moja');
  });
  await test('S4 mismatch (init≠paid) salama: hakuna credit', async () => {
    await call('pesapalCheckout', 'buyer', { amount: 9000, orderTrackingId: 'DEP-3', purpose: 'deposit' });
    PP.set('DEP-3', { amount: 7000, status_code: 1, merchant_reference: 'DEP-3' });
    await ipn({ OrderTrackingId: 'DEP-3' });
    eq(await bal('buyer'), 42000, 'hakuna credit');
    assert(!(await exists('wallet_ledger/pesapal_deposit_DEP-3')), 'hakuna ledger');
  });
  await test('S5 unmatched payment huenda review (UNAPPLIED), hailipi', async () => {
    PP.set('ORPHAN-1', { amount: 50000, status_code: 1, merchant_reference: 'M_ORPHAN-1' });
    await ipn({ OrderTrackingId: 'ORPHAN-1' });
    eq(await bal('buyer'), 42000, 'buyer haijaongezeka');
    eq(await bal('eve'), 0, 'eve 0');
    const qs = await db.collection('payment_reviews').where('pesapalTrackingId', '==', 'ORPHAN-1').get();
    assert(qs.size === 1 && qs.docs[0].data().state === 'UNAPPLIED', 'review UNAPPLIED ipo');
  });
  await test('S6 unmatched hairudiwi (replay salama)', async () => {
    await ipn({ OrderTrackingId: 'ORPHAN-1' });
    const qs = await db.collection('payment_reviews').where('pesapalTrackingId', '==', 'ORPHAN-1').get();
    eq(qs.size, 1, 'review moja tu');
    eq(await bal('buyer'), 42000, 'hakuna credit');
  });
  await test('S7 unpaid denied (walletAdjust + IPN no-op)', async () => {
    PP.set('DEP-U', { amount: 5000, status_code: 0, merchant_reference: 'DEP-U' });
    await call('pesapalCheckout', 'buyer', { amount: 5000, orderTrackingId: 'DEP-U', purpose: 'deposit' });
    denied(await call('walletAdjust', 'buyer', { docId: 'buyer', amountTSh: 5000, type: 'deposit', orderTrackingId: 'DEP-U' }), ['failed-precondition'], 'unpaid');
    await ipn({ OrderTrackingId: 'DEP-U' });
    eq(await bal('buyer'), 42000, 'hakuna credit');
  });
  await test('S8 order inashinda deposit kwenye tid moja (no double-use)', async () => {
    await call('pesapalCheckout', 'buyer', { amount: 10000, orderTrackingId: 'BOTH-1', purpose: 'deposit' });
    PP.set('BOTH-1', { amount: 10000, status_code: 1, merchant_reference: 'BOTH-1' });
    await db.doc('products/item_both1').set({ title: 'X', price: 10000, stock: 5, userId: 'seller' });
    await db.doc('orders/both1').set({ buyerId: 'buyer', sellerId: 'seller', amount: 10000, status: 'payment_pending', itemId: 'item_both1', paymentRef: 'BOTH-1' });
    await ipn({ OrderTrackingId: 'BOTH-1' });
    eq((await getd('orders/both1')).status, 'held', 'oda imeshikwa');
    assert(!(await exists('wallet_ledger/pesapal_deposit_BOTH-1')), 'hakuna deposit credit ya pili');
    eq(await bal('buyer'), 42000, 'wallet haijaongezeka');
  });
  await test('S9 same tid haiwezi kufund deposit mbili', async () => {
    const r = await call('walletAdjust', 'buyer', { docId: 'buyer', amountTSh: 30000, type: 'deposit', orderTrackingId: 'DEP-1' });
    assert(r.ok && r.data.already === true, 'already tena');
    eq(await bal('buyer'), 42000, 'mara moja tu');
  });
  await test('S10 initiator binding: deposit inaenda kwa mwanzilishi tu', async () => {
    await db.collection('escrow_holds').doc('ppinit_DEP-E').set({ kind: 'pesapal_init', uid: 'eve', amount: 6000, merchantReference: 'DEP-E', purpose: 'deposit' });
    PP.set('DEP-E', { amount: 6000, status_code: 1, merchant_reference: 'DEP-E' });
    await ipn({ OrderTrackingId: 'DEP-E' });
    eq(await bal('buyer'), 42000, 'buyer haguswi');
    eq(await bal('eve'), 6000, 'eve (initiator) +6000');
  });
  await test('S11 ack 200 hata kwa input taka (robust)', async () => {
    const r = await ipn({ OrderTrackingId: '../../etc', OrderMerchantReference: '<x>' });
    eq(r.status, 200, 'ack 200');
    eq(await bal('buyer'), 42000, 'hakuna credit');
    eq(await bal('eve'), 6000, 'eve bado 6000 (S10)');
  });

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE7 PESAPAL-STUB: ' + pass + ' pass, ' + fail + ' fail');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

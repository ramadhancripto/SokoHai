#!/usr/bin/env node
/* ============================================================
 * PHASE 6 P6-1 — unilateral self-accept ya negotiation IMEZUIWA.
 * Bila fix: buyer anaweka waitingForUserId=self, anakubali ofa yake
 * mwenyewe (AGREEMENT @ TSh 1), server price-check inaamini -> forced-sale.
 * Suite: rules (REST) + settle end-to-end (in-process + stubbed PesaPal).
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
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
async function call(name, auth, data) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: typeof auth === 'string' ? tok(auth) : auth, rawRequest: { headers: {} }, acceptsStreaming: false });
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
const exists = async (p) => (await db.doc(p).get()).exists;

async function main() {
  group = 'N6 rules'; console.log('\n[' + group + ']');
  await wipe();
  await loadRules();
  const B = await idToken('n6buyer'), S = await idToken('n6seller');
  const mkOffer = (extra) => Object.assign({ buyerId: B.uid, sellerId: S.uid, version: 1, currentState: 'OFFER_SENT', currentUnitPrice: 1000, quantity: 1, waitingForUserId: S.uid, turn: 'seller' }, extra || {});

  await test('N1 create na waitingFor=self inakataliwa (P6-1)', async () => {
    eq(await restCreate(B.token, 'negotiations', 'atk1', mkOffer({ currentUnitPrice: 1, waitingForUserId: B.uid, turn: 'buyer' })), 403, 'self-turn create');
    eq(await restCreate(B.token, 'negotiations', 'atk2', mkOffer({ currentUnitPrice: 1 })), 200, 'control: legit create');
    const { waitingForUserId, ...noWait } = mkOffer({ currentUnitPrice: 1 });
    eq(await restCreate(B.token, 'negotiations', 'atk3', noWait), 403, 'missing waitingFor rejected');
  });

  await test('N2 buyer hawezi kukubali mwenyewe (turn ya seller)', async () => {
    eq(await restPatch(B.token, 'negotiations/atk2', { version: 2, currentState: 'AGREEMENT' }), 403, 'self-accept denied');
    eq((await getd('negotiations/atk2')).currentState, 'OFFER_SENT', 'bado OFFER_SENT');
  });

  await test('N3 flow halali: seller counter -> buyer accept (bei ya seller)', async () => {
    eq(await restPatch(S.token, 'negotiations/atk2', { version: 2, currentState: 'COUNTER_OFFER', currentUnitPrice: 1200, waitingForUserId: B.uid, turn: 'buyer' }), 200, 'counter');
    eq(await restPatch(B.token, 'negotiations/atk2', { version: 3, currentState: 'AGREEMENT' }), 200, 'accept');
    const n = await getd('negotiations/atk2');
    eq(n.currentState, 'AGREEMENT', 'AGREEMENT'); eq(n.currentUnitPrice, 1200, 'bei ya seller (1200)');
  });

  await test('N4 accept iliyobadilisha bei inakataliwa (B-04)', async () => {
    eq(await restCreate(B.token, 'negotiations', 'b04', mkOffer()), 200, 'offer');
    eq(await restPatch(S.token, 'negotiations/b04', { version: 2, currentState: 'COUNTER_OFFER', currentUnitPrice: 5000, waitingForUserId: B.uid, turn: 'buyer' }), 200, 'counter 5000');
    eq(await restPatch(B.token, 'negotiations/b04', { version: 3, currentState: 'AGREEMENT', currentUnitPrice: 1 }), 403, 'accept+price-change denied');
  });

  await test('N5 agreed*/orderId/lockedAt ni server-only', async () => {
    eq(await restCreate(B.token, 'negotiations', 'sv1', mkOffer({ agreedUnitPrice: 1 })), 403, 'create agreed denied');
    eq(await restPatch(S.token, 'negotiations/atk2', { version: 4, currentState: 'CHANGE_REQUESTED', agreedUnitPrice: 1 }), 403, 'update agreed denied');
    eq(await restPatch(B.token, 'negotiations/atk2', { version: 4, currentState: 'ORDER_CREATED' }), 403, 'ORDER_CREATED denied');
  });

  group = 'N6 end-to-end'; console.log('\n[' + group + ']');
  await test('N6 jaribio la forced-sale linaishia price_review (mlolongo umekufa)', async () => {
    // Mshambuliaji: ofa TSh 1 (waitingFor=seller kulazimishwa), hawezi kukubali.
    // Anajaribu kulipa TSh 1 moja kwa moja — price check inakataa (not agreed).
    eq(await restCreate(B.token, 'negotiations', 'atk4', mkOffer({ currentUnitPrice: 1 })), 200, 'offer TSh 1');
    eq(await restPatch(B.token, 'negotiations/atk4', { version: 2, currentState: 'AGREEMENT' }), 403, 'self-accept denied');
    PP.set('TX-ATK', { amount: 1, status_code: 1, merchant_reference: 'M_ATK' });
    await db.doc('escrow_holds/ppinit_M_ATK').set({ kind: 'pesapal_init', uid: B.uid, amount: 1, merchantReference: 'M_ATK' });
    await db.doc('orders/atkOrder').set({ buyerId: B.uid, sellerId: S.uid, amount: 1, status: 'payment_pending', negotiationId: 'atk4', paymentRef: 'TX-ATK' });
    const st = await call('pesapalTransactionStatus', { uid: B.uid, token: { uid: B.uid } }, { orderTrackingId: 'TX-ATK' });
    assert(st.ok, 'status ok');
    eq((await getd('orders/atkOrder')).paymentStatus, 'price_review', 'price_review (negotiation_not_agreed)');
    assert(!(await exists('escrow_holds/order_atkOrder')), 'hakuna hold — forced-sale imekufa');
  });

  await test('N7 makubaliano ya pande zote + malipo sahihi = held (njia halali)', async () => {
    PP.set('TX-LEGIT', { amount: 1200, status_code: 1, merchant_reference: 'M_LEGIT' });
    await db.doc('escrow_holds/ppinit_M_LEGIT').set({ kind: 'pesapal_init', uid: B.uid, amount: 1200, merchantReference: 'M_LEGIT' });
    await db.doc('orders/legit1').set({ buyerId: B.uid, sellerId: S.uid, amount: 1200, status: 'payment_pending', negotiationId: 'atk2', paymentRef: 'TX-LEGIT' });
    const st = await call('pesapalTransactionStatus', { uid: B.uid, token: { uid: B.uid } }, { orderTrackingId: 'TX-LEGIT' });
    assert(st.ok, 'status ok');
    eq((await getd('orders/legit1')).status, 'held', 'held — makubaliano ya kweli yanalipwa');
    assert(await exists('escrow_holds/order_legit1'), 'hold ipo');
  });

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE6 NEGOTIATION: ' + pass + ' passed, ' + fail + ' failed');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

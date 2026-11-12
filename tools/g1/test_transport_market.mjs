#!/usr/bin/env node
/* ============================================================
 * TRANSPORT MARKET (C) — routing offers, availability, cancel.
 * offerAccept: ofa yako + hai + ndani ya muda; wengine wamezuiwa.
 * cancel: mteja + kabla ya pickup; tokeni zinabatilishwa; baada
 * ya pickup inakataliwa. Availability: mmiliki tu (rules).
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
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid) => ({ uid, token: { uid, email: uid + '@u.test', email_verified: true } });
async function call(name, uid, data) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: tok(uid), rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}
async function idToken(uid) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: uid + '@rules.test', password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken, 'signUp: ' + JSON.stringify(j).slice(0, 150));
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
async function restPatch(tk, docPath, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${DOCS}/${docPath}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restCreate(tk, col, id, data) {
  const r = await fetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
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
const CUS = 'tmcus', DRV = 'tmdrv', DRV2 = 'tmdrv2';

async function main() {
  group = 'TM offers'; console.log('\n[' + group + ']');
  await wipe();
  await loadRules();
  await db.doc('users/' + DRV).set({ walletBalance: 0, isApprovedAgent: true, agentApprovedBy: 'a1', displayName: 'D1' });
  await db.doc('users/' + DRV2).set({ walletBalance: 0, isApprovedAgent: true, agentApprovedBy: 'a1', displayName: 'D2' });
  await db.doc('users/' + CUS).set({ walletBalance: 0 });
  const future = new Date(Date.now() + 3600e3).toISOString();
  const past = new Date(Date.now() - 60e3).toISOString();
  await db.doc('ride_requests/tm1').set({ customerId: CUS, status: 'searching', fare: 4000 });
  await db.doc('delivery_offers/of1').set({ agentId: DRV, rideId: 'tm1', customerId: CUS, status: 'offered', expiresAt: future, agentName: 'D1' });
  await db.doc('delivery_offers/of2').set({ agentId: DRV, rideId: 'tm1', customerId: CUS, status: 'offered', expiresAt: past, agentName: 'D1' });

  await test('C1 offerAccept: mwenye ofa anaikubali; PK inatolewa', async () => {
    const r = await call('deliveryOfferAccept', DRV, { offerId: 'of1' });
    assert(r.ok, 'accept: ' + JSON.stringify(r).slice(0, 250));
    const rd = await getd('ride_requests/tm1');
    eq(rd.status, 'accepted', 'accepted'); eq(rd.driverId, DRV, 'driver assigned');
    eq((await getd('delivery_offers/of1')).status !== 'offered', true, 'ofa imetumika');
  });

  await test('C2 offerAccept: si yako / imeisha muda / si hai zinakataliwa', async () => {
    await db.doc('ride_requests/tm2').set({ customerId: CUS, status: 'searching', fare: 1000 });
    await db.doc('delivery_offers/of3').set({ agentId: DRV, rideId: 'tm2', customerId: CUS, status: 'offered', expiresAt: future });
    const w = await call('deliveryOfferAccept', DRV2, { offerId: 'of3' });
    eq(w.ok, false, 'si yako denied'); eq(w.code, 'permission-denied', 'denied');
    const e = await call('deliveryOfferAccept', DRV, { offerId: 'of2' });
    eq(e.ok, false, 'expired denied');
    const used = await call('deliveryOfferAccept', DRV, { offerId: 'of1' });
    eq(used.ok, false, 'used offer denied');
  });

  group = 'TM cancel'; console.log('\n[' + group + ']');
  await test('C3 cancel: mteja anaghairi kabla ya pickup; PK inabatilishwa', async () => {
    await db.doc('ride_requests/tm3').set({ customerId: CUS, status: 'searching', fare: 1500 });
    const a = await call('deliveryAccept', DRV, { rideId: 'tm3' });
    assert(a.ok, 'accepted for cancel test');
    const rv = await call('deliveryRevokeTokens', CUS, { rideId: 'tm3' });
    assert(rv.ok, 'revoke ok');
    eq((await getd('ride_requests/tm3')).pickupTokenStatus, 'revoked', 'PK revoked');
    // PK iliyobatilishwa haiwezi kutumika tena.
    const pk = a.data.token;
    const use = await call('deliveryConfirmCustody', CUS, { rideId: 'tm3', role: 'seller', token: pk });
    eq(use.ok, false, 'revoked PK rejected');
  });

  await test('C4 cancel rules: mteja + pre-pickup tu (REST)', async () => {
    const CU = await idToken('tmcus2'), ST = await idToken('tmstr');
    await db.doc('ride_requests/tm4').set({ customerId: CU.uid, status: 'searching', fare: 500 });
    await db.doc('ride_requests/tm5').set({ customerId: CU.uid, status: 'picked_up', fare: 500, driverId: 'dx', currentCustodian: 'dx' });
    eq(await restPatch(CU.token, 'ride_requests/tm4', { status: 'cancelled' }), 200, 'customer pre-pickup cancel ok');
    eq(await restPatch(CU.token, 'ride_requests/tm5', { status: 'cancelled' }), 403, 'post-pickup cancel denied');
    eq(await restPatch(ST.token, 'ride_requests/tm4', { status: 'searching' }), 403, 'stranger denied');
  });

  await test('C5 revoke: mtu wa nje hawezi kubatilisha tokeni', async () => {
    const r = await call('deliveryRevokeTokens', 'tmstranger', { rideId: 'tm3' });
    eq(r.ok, false, 'denied'); eq(r.code, 'permission-denied', 'denied');
  });

  group = 'TM availability'; console.log('\n[' + group + ']');
  await test('C6 drivers.online: mmiliki anaweka; verified ni admin-only', async () => {
    const D1 = await idToken('tmdriver1'), X = await idToken('tmx');
    eq(await restCreate(D1.token, 'drivers', 'dv1', { userId: D1.uid, name: 'D1', online: true }), 200, 'create own');
    eq(await restPatch(D1.token, 'drivers/dv1', { online: false }), 200, 'owner toggles availability');
    eq(await restPatch(D1.token, 'drivers/dv1', { verified: true }), 403, 'self-verify denied');
    eq(await restPatch(D1.token, 'drivers/dv1', { rating: 5 }), 403, 'self-rating denied');
    eq(await restPatch(X.token, 'drivers/dv1', { online: true }), 403, 'stranger denied');
  });

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nTRANSPORT MARKET: ' + pass + ' passed, ' + fail + ' failed');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

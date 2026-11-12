#!/usr/bin/env node
/* ============================================================
 * DELIVERY LIFECYCLE (A normal + B handover) — journey nzima:
 * create(rules) -> accept -> seller-confirm(PK) -> pickup(PK) ->
 * transit -> [handover(TR)] -> Token C(DL) -> complete(+escrow payout).
 * Pamoja na: negatives (order/role/token), rate-limit, idempotency.
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
const CUS = 'dlvcus', SEL = 'dlvsel', DRV = 'dlvdrv', DRV2 = 'dlvdrv2';

async function seedRide(id, extra) {
  await db.doc('ride_requests/' + id).set(Object.assign({
    customerId: CUS, status: 'searching', fare: 3000, orderId: 'o1',
    fromLocation: 'Kariakoo', toLocation: 'Mbezi'
  }, extra || {}));
}

async function main() {
  group = 'DL rules'; console.log('\n[' + group + ']');
  await wipe();
  await loadRules();
  const U = await idToken('dlvuser');
  await test('D1 ride create: mteja anaunda safi; custody/token keys zinakataliwa', async () => {
    eq(await restCreate(U.token, 'ride_requests', 'rc1', { customerId: U.uid, status: 'searching', fare: 2000, fromLocation: 'A', toLocation: 'B' }), 200, 'create safi');
    eq(await restCreate(U.token, 'ride_requests', 'rc2', { customerId: U.uid, status: 'accepted', fare: 2000 }), 403, 'status accepted denied');
    eq(await restCreate(U.token, 'ride_requests', 'rc3', { customerId: U.uid, status: 'searching', pickupToken: 'PK-X' }), 403, 'plaintext token denied');
    eq(await restCreate(U.token, 'ride_requests', 'rc4', { customerId: U.uid, status: 'searching', customerPhone: '0711' }), 403, 'PII kwenye ride denied');
  });

  group = 'DL journey'; console.log('\n[' + group + ']');
  await db.doc('users/' + CUS).set({ walletBalance: 0 });
  await db.doc('users/' + SEL).set({ walletBalance: 0 });
  await db.doc('users/' + DRV).set({ walletBalance: 0, isApprovedAgent: true, agentApprovedBy: 'admin1', displayName: 'Dereva' });
  await db.doc('users/' + DRV2).set({ walletBalance: 0, isApprovedAgent: true, agentApprovedBy: 'admin1', displayName: 'Dereva2' });
  await db.doc('orders/o1').set({ buyerId: CUS, sellerId: SEL, amount: 20000, status: 'held', commerceType: 'product' });
  await db.doc('escrow_holds/order_o1').set({ kind: 'order_hold', amount: 20000, payerUid: CUS, payeeUid: SEL, released: false });
  await seedRide('r1');

  let PK;
  await test('D2 accept: dereva 1 anashinda; mteja/dr2 wanakataliwa', async () => {
    const self = await call('deliveryAccept', CUS, { rideId: 'r1' });
    eq(self.ok, false, 'self-accept denied');
    const a = await call('deliveryAccept', DRV, { rideId: 'r1' });
    assert(a.ok, 'accept: ' + JSON.stringify(a).slice(0, 250));
    PK = a.data.token;
    assert(PK && PK.indexOf('PK-') === 0, 'PK token returned: ' + PK);
    eq((await getd('ride_requests/r1')).status, 'accepted', 'accepted');
    eq((await getd('ride_requests/r1')).agreedFare, 3000, 'fare frozen 3000');
    const a2 = await call('deliveryAccept', DRV2, { rideId: 'r1' });
    eq(a2.ok, false, 'second driver denied');
    const again = await call('deliveryAccept', DRV, { rideId: 'r1' });
    assert(again.ok && again.data.already === true, 're-accept idempotent');
  });

  await test('D3 seller-confirm: token sahihi; token mbaya inakataliwa', async () => {
    const bad = await call('deliveryConfirmCustody', SEL, { rideId: 'r1', role: 'seller', token: 'PK-WRONG' });
    eq(bad.ok, false, 'wrong token denied');
    const wrong = await call('deliveryConfirmCustody', CUS, { rideId: 'r1', role: 'seller', token: PK });
    eq(wrong.ok, false, 'buyer sio seller (order-linked)');
    const s = await call('deliveryConfirmCustody', SEL, { rideId: 'r1', role: 'seller', token: PK, parcelCondition: 'good' });
    assert(s.ok, 'seller confirm: ' + JSON.stringify(s).slice(0, 200));
    eq((await getd('ride_requests/r1')).status, 'seller_confirmed_handover', 'handover state');
  });

  await test('D4 pickup: kabla ya seller-confirm inakataliwa; baada = picked_up', async () => {
    await seedRide('r2');
    await call('deliveryAccept', DRV, { rideId: 'r2' });
    const early = await call('deliveryConfirmCustody', DRV, { rideId: 'r2', role: 'transporter', token: 'PK-ANY' });
    eq(early.ok, false, 'pickup before seller-confirm denied');
    const p = await call('deliveryConfirmCustody', DRV, { rideId: 'r1', role: 'transporter', token: PK, parcelCondition: 'good' });
    assert(p.ok, 'pickup: ' + JSON.stringify(p).slice(0, 200));
    const r = await getd('ride_requests/r1');
    eq(r.status, 'picked_up', 'picked_up'); eq(r.currentCustodian, DRV, 'custodian=drv');
    eq(r.pickupTokenStatus, 'used', 'PK used (single-use)');
    const reuse = await call('deliveryConfirmCustody', DRV, { rideId: 'r1', role: 'transporter', token: PK });
    assert(reuse.ok && reuse.data.status === 'picked_up', 're-pickup idempotent (status echo)');
  });

  await test('D5 transit: custodian tu; lazima picked_up', async () => {
    const outsider = await call('deliveryStartTransit', DRV2, { rideId: 'r1' });
    eq(outsider.ok, false, 'non-custodian denied'); eq(outsider.code, 'permission-denied', 'denied');
    const t = await call('deliveryStartTransit', DRV, { rideId: 'r1' });
    assert(t.ok, 'transit ok');
    eq((await getd('ride_requests/r1')).status, 'in_transit', 'in_transit');
  });

  await test('D6 Token C + complete: escrow payout kwa dereva + muuzaji', async () => {
    const drvMint = await call('deliveryGenerateToken', DRV, { rideId: 'r1', kind: 'transfer' });
    eq(drvMint.ok, false, 'driver cannot mint Token C');
    const m = await call('deliveryGenerateToken', CUS, { rideId: 'r1', kind: 'transfer' });
    assert(m.ok, 'mint: ' + JSON.stringify(m).slice(0, 200));
    const DL = m.data.token;
    const badC = await call('deliveryComplete', DRV, { rideId: 'r1', transferCode: 'DL-WRONG' });
    eq(badC.ok, false, 'wrong Token C denied');
    const c = await call('deliveryComplete', DRV, { rideId: 'r1', transferCode: DL });
    assert(c.ok, 'complete: ' + JSON.stringify(c).slice(0, 300));
    eq(c.data.payoutStatus, 'paid_from_escrow', 'paid_from_escrow');
    eq(c.data.finalPayout, 3000, 'driver fare 3000 (agreedFare)');
    eq(Number((await getd('users/' + DRV)).walletBalance), 3000, 'driver wallet +3000');
    assert(Number((await getd('users/' + SEL)).walletBalance) > 0, 'seller wallet credited');
    eq((await getd('orders/o1')).status, 'completed', 'order completed');
    eq((await getd('ride_requests/r1')).status, 'completed', 'ride completed');
    const again = await call('deliveryComplete', DRV, { rideId: 'r1', transferCode: DL });
    assert(again.ok && again.data.already === true, 'double-complete idempotent');
    eq(Number((await getd('users/' + DRV)).walletBalance), 3000, 'no double pay');
    const stranger = await call('deliveryComplete', 'dlvstranger', { rideId: 'r1' });
    eq(stranger.ok, false, 'stranger already-probe denied'); eq(stranger.code, 'permission-denied', 'no leak');
  });

  await test('D7 receiver anaweza kukamilisha bila Token C (hakuna iliyotolewa)', async () => {
    await seedRide('r3', { orderId: null });
    const a = await call('deliveryAccept', DRV, { rideId: 'r3' });
    // r3 haina orderId → handoverOwner = customerId (CUS) — CUS ndiye seller hapa.
    await call('deliveryConfirmCustody', CUS, { rideId: 'r3', role: 'seller', token: a.data.token });
    await call('deliveryConfirmCustody', DRV, { rideId: 'r3', role: 'transporter', token: a.data.token });
    await call('deliveryStartTransit', DRV, { rideId: 'r3' });
    const drvNo = await call('deliveryComplete', DRV, { rideId: 'r3' });
    eq(drvNo.ok, false, 'driver bila Token C denied');
    const rc = await call('deliveryComplete', CUS, { rideId: 'r3' });
    assert(rc.ok, 'receiver complete ok');
    eq(rc.data.payoutStatus, 'unfunded', 'unfunded (hakuna escrow) — honest');
  });

  group = 'DL handover'; console.log('\n[' + group + ']');
  await test('D8 handover: custodian switch kwa TR token (pande zote)', async () => {
    await seedRide('r4', { orderId: null });
    const a = await call('deliveryAccept', DRV, { rideId: 'r4' });
    await call('deliveryConfirmCustody', CUS, { rideId: 'r4', role: 'seller', token: a.data.token });
    await call('deliveryConfirmCustody', DRV, { rideId: 'r4', role: 'transporter', token: a.data.token });
    await call('deliveryStartTransit', DRV, { rideId: 'r4' });
    const noNext = await call('deliveryGenerateToken', DRV, { rideId: 'r4', kind: 'handover' });
    eq(noNext.ok, false, 'bila nextTransporter denied');
    const h = await call('deliveryGenerateToken', DRV, { rideId: 'r4', kind: 'handover', nextTransporterId: DRV2, nextTransporterName: 'Dereva2' });
    assert(h.ok, 'handover init: ' + JSON.stringify(h).slice(0, 250));
    const TR = h.data.token;
    eq((await getd('ride_requests/r4')).status, 'awaiting_handover', 'awaiting_handover');
    const early = await call('deliveryConfirmCustody', DRV2, { rideId: 'r4', role: 'transporter', token: TR, handover: true });
    eq(early.ok, false, 'bila from-confirm denied');
    const fc = await call('deliveryConfirmCustody', DRV, { rideId: 'r4', role: 'handover_from' });
    assert(fc.ok, 'from-confirm ok');
    const wr = await call('deliveryConfirmCustody', DRV, { rideId: 'r4', role: 'transporter', token: TR, handover: true });
    eq(wr.ok, false, 'dereva wa zamani hawezi kupokea');
    const tp = await call('deliveryConfirmCustody', DRV2, { rideId: 'r4', role: 'transporter', token: TR, handover: true });
    assert(tp.ok, 'handover pickup ok');
    const r = await getd('ride_requests/r4');
    eq(r.status, 'in_transit', 'back in_transit'); eq(r.currentCustodian, DRV2, 'custodian=drv2'); eq(r.driverId, DRV2, 'driver=drv2');
    eq(r.handoverTokenStatus, 'used', 'TR used');
    const rc = await call('deliveryComplete', CUS, { rideId: 'r4' });
    assert(rc.ok, 'complete after handover');
  });

  group = 'DL abuse'; console.log('\n[' + group + ']');
  await test('D9 rate-limit: majaribio 6 mabaya -> resource-exhausted', async () => {
    await seedRide('r5', { orderId: null });
    const a = await call('deliveryAccept', DRV, { rideId: 'r5' });
    assert(a.ok, 'accept r5');
    let codes = [];
    for (let i = 0; i < 7; i++) {
      const r = await call('deliveryConfirmCustody', CUS, { rideId: 'r5', role: 'seller', token: 'PK-BAD' + i });
      codes.push(r.code);
    }
    eq(codes.slice(0, 6).every(c => c === 'failed-precondition'), true, '6x failed-precondition: ' + codes.join(','));
    eq(codes[6], 'resource-exhausted', '7th resource-exhausted');
    const good = await call('deliveryConfirmCustody', CUS, { rideId: 'r5', role: 'seller', token: a.data.token });
    eq(good.ok, false, 'hata token sahihi imefungwa (window)');
    eq(good.code, 'resource-exhausted', 'locked');
  });

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nDELIVERY LIFECYCLE: ' + pass + ' passed, ' + fail + ' failed');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

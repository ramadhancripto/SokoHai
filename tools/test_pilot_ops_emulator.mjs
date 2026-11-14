#!/usr/bin/env node
/* [PILOT OPS 2026-11-14] Emulator tests (PesaPal stubbed at the network layer; no real money):
 *  A. pesapalReconcileSweep: a paid PesaPal deposit whose IPN never arrived is settled ONCE; unpaid
 *     after 48 h -> expired_unpaid; PesaPal down -> stays open; fresh (< 10 min) is left alone.
 *  B. withdrawalResolve two-person approval (system/config.withdrawals.dualApprovalMin).
 *  C. deliveryOfferExpirySweep passes an expired offer on without anyone opening the inbox.
 *  D. adminMoneyWatch (admin only) lists what needs a human; clientErrorReport scrubs and rate-limits.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_pilot_ops_emulator.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
process.env.PESAPAL_CONSUMER_KEY = 'test-key'; process.env.PESAPAL_CONSUMER_SECRET = 'test-secret';
process.env.PESAPAL_BASE_URL = 'https://pesapal.stub/v3';
const realFetch = globalThis.fetch; const PP = new Map(); let ppDown = false;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.startsWith('https://pesapal.stub/')) return realFetch(url, opts);
  if (ppDown) throw new Error('stub: PesaPal down');
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/api/Auth/RequestToken')) return json({ token: 't', expiryDate: new Date(Date.now() + 3e5).toISOString(), status: '200' });
  if (u.includes('/SubmitOrderRequest')) { const b = JSON.parse((opts && opts.body) || '{}'); return json({ redirect_url: 'https://pesapal.stub/pay/' + b.id, order_tracking_id: b.id, status: '200' }); }
  if (u.includes('/GetTransactionStatus')) { const id = new URL(u).searchParams.get('orderTrackingId'); const t = PP.get(id);
    if (!t) return json({ status_code: 0, payment_status_description: 'INVALID', order_tracking_id: id, amount: 0, currency: 'TZS', status: '200' });
    return json({ status_code: 1, payment_status_description: 'Completed', order_tracking_id: id, merchant_reference: t.merchant_reference || id, amount: t.amount, currency: 'TZS', status: '200' }); }
  return json({ error: { message: 'stub' } });
};
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const ops = require(path.join(ROOT, 'functions', 'pilot-ops.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
let pass = 0, fail = 0;
async function test(n, f) { try { await f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + (e && e.message)); } }
const ok = (c, m) => { if (!c) throw new Error(m); };
async function call(name, uid, data, extra, raw) { try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: uid ? { uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) } : null, rawRequest: raw || { headers: {} } }) }; } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; } }
const T = Date.now().toString(36);
const bal = async (u) => Number(((await db.doc('users/' + u).get()).data() || {}).walletBalance || 0);
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const A1 = { admin: true }, ADM1 = 'opsA' + T, ADM2 = 'opsB' + T;

await test('A1 paid deposit, IPN lost, user never returned -> reconcile credits the wallet once', async () => {
  const u = 'ppU' + T; await db.doc('users/' + u).set({ uid: u, walletBalance: 0 });
  const r = await call('pesapalCheckout', u, { amount: 25000, orderTrackingId: 'REC1-' + T, purpose: 'deposit' }); ok(r.ok, JSON.stringify(r));
  const h = db.doc('escrow_holds/ppinit_REC1-' + T); ok((await h.get()).data().reconcileState === 'open', 'ppinit not open');
  PP.set('REC1-' + T, { amount: 25000 });
  ok(await bal(u) === 0, 'precondition: nothing credited before reconcile');
  await h.update({ createdAt: ago(15) });
  const out = await fns._pesapalReconcileForTest();
  ok(await bal(u) === 25000, 'wallet ' + await bal(u) + ' ' + JSON.stringify(out));
  ok((await h.get()).data().reconcileState === 'settled', 'state ' + (await h.get()).data().reconcileState);
  await h.update({ reconcileState: 'open' });            // even if re-opened, money moves once
  await fns._pesapalReconcileForTest();
  ok(await bal(u) === 25000, 'double credit ' + await bal(u));
});
await test('A2 fresh payment (< 10 min) is left alone', async () => {
  const u = 'ppF' + T; await db.doc('users/' + u).set({ uid: u, walletBalance: 0 });
  await call('pesapalCheckout', u, { amount: 5000, orderTrackingId: 'REC2-' + T, purpose: 'deposit' }); PP.set('REC2-' + T, { amount: 5000 });
  await fns._pesapalReconcileForTest();
  ok(await bal(u) === 0 && (await db.doc('escrow_holds/ppinit_REC2-' + T).get()).data().reconcileState === 'open', 'touched too early');
});
await test('A3 PesaPal down -> stays open; unpaid after 48 h -> expired_unpaid (no money)', async () => {
  const u = 'ppD' + T; await db.doc('users/' + u).set({ uid: u, walletBalance: 0 });
  await call('pesapalCheckout', u, { amount: 7000, orderTrackingId: 'REC3-' + T, purpose: 'deposit' });
  const h = db.doc('escrow_holds/ppinit_REC3-' + T); await h.update({ createdAt: ago(60) });
  ppDown = true; await fns._pesapalReconcileForTest(); ppDown = false;
  ok((await h.get()).data().reconcileState === 'open', 'should stay open while PesaPal is down');
  await h.update({ createdAt: ago(49 * 60) }); await fns._pesapalReconcileForTest();
  ok((await h.get()).data().reconcileState === 'expired_unpaid' && await bal(u) === 0, 'state ' + (await h.get()).data().reconcileState);
  ok((await db.doc('system_jobs/pesapalReconcile').get()).exists, 'job summary missing');
});

async function newWithdrawal(u, amount) {
  await db.doc('users/' + u).set({ uid: u, walletBalance: amount + 1000 });
  const r = await call('withdrawalRequest', u, { amountTSh: amount, channel: 'mobile', account: '0712345678', requestKey: 'k' + Math.random().toString(36).slice(2, 8) });
  ok(r.ok, JSON.stringify(r)); return r.data.requestId;
}
await test('B1 no threshold configured -> one admin closes (old behaviour)', async () => {
  await db.doc('system/config').set({ withdrawals: { dualApprovalMin: null } }, { merge: true });
  const id = await newWithdrawal('wdA' + T, 10000);
  const r = await call('withdrawalResolve', ADM1, { requestId: id, decision: 'paid', note: 'imetumwa M-Pesa', externalRef: 'MP12345' }, A1);
  ok(r.ok && r.data.status === 'paid' && !r.data.needsSecondApproval, JSON.stringify(r));
  ok((await db.doc('withdrawal_requests/' + id).get()).data().externalRef === 'MP12345', 'externalRef not stored');
});
await test('B2 threshold set: first admin = first approval only; same admin refused; second admin pays', async () => {
  await db.doc('system/config').set({ withdrawals: { dualApprovalMin: 50000 } }, { merge: true });
  const id = await newWithdrawal('wdB' + T, 80000);
  const r1 = await call('withdrawalResolve', ADM1, { requestId: id, decision: 'paid', note: 'nimeandaa malipo' }, A1);
  ok(r1.ok && r1.data.status === 'pending' && r1.data.needsSecondApproval, JSON.stringify(r1));
  ok((await db.doc('withdrawal_requests/' + id).get()).data().status === 'pending', 'closed by one admin');
  const r2 = await call('withdrawalResolve', ADM1, { requestId: id, decision: 'paid', note: 'tena mimi' }, A1);
  ok(!r2.ok && /admin MWINGINE/.test(r2.message), JSON.stringify(r2));
  const r3 = await call('withdrawalResolve', ADM2, { requestId: id, decision: 'paid', note: 'nimethibitisha', externalRef: 'MP999' }, A1);
  ok(r3.ok && r3.data.status === 'paid', JSON.stringify(r3));
  const audit = await db.collection('admin_audit_log').where('action', '==', 'WITHDRAWAL_FIRST_APPROVAL').limit(5).get(); ok(!audit.empty, 'no first-approval audit');
});
await test('B0 a super admin known only by SUPER_ADMIN_EMAILS (verified e-mail, no claim) may resolve withdrawals', async () => {
  const prev = process.env.SUPER_ADMIN_EMAILS; process.env.SUPER_ADMIN_EMAILS = 'owner.only@sokohai.test';
  try {
    const id = await newWithdrawal('wdS' + T, 9000);
    const no = await call('withdrawalResolve', 'imp' + T, { requestId: id, decision: 'paid', note: 'si admin' }, { email: 'owner.only@sokohai.test', email_verified: false });
    ok(!no.ok && no.code === 'permission-denied', 'unverified e-mail accepted ' + JSON.stringify(no));
    const r = await call('withdrawalResolve', 'own' + T, { requestId: id, decision: 'paid', note: 'mmiliki amelipa' }, { email: 'owner.only@sokohai.test' });
    ok(r.ok && r.data.status === 'paid', JSON.stringify(r));
  } finally { if (prev === undefined) delete process.env.SUPER_ADMIN_EMAILS; else process.env.SUPER_ADMIN_EMAILS = prev; }
});
await test('B3 below threshold: one admin; reject never needs two (money goes back)', async () => {
  const small = await newWithdrawal('wdC' + T, 20000);
  ok((await call('withdrawalResolve', ADM1, { requestId: small, decision: 'paid', note: 'ndogo sawa' }, A1)).data.status === 'paid', 'small');
  const big = await newWithdrawal('wdD' + T, 90000); const before = await bal('wdD' + T);
  const r = await call('withdrawalResolve', ADM1, { requestId: big, decision: 'rejected', note: 'akaunti si sahihi' }, A1);
  ok(r.ok && r.data.status === 'rejected' && await bal('wdD' + T) === before + 90000, JSON.stringify(r));
  await db.doc('system/config').set({ withdrawals: { dualApprovalMin: null } }, { merge: true });
});

await test('C1 an expired delivery offer is passed on by the scheduled sweep (nobody opened the inbox)', async () => {
  const rideId = 'rideX' + T, offerId = 'offX' + T;
  await db.doc('ride_requests/' + rideId).set({ customerId: 'cust' + T, status: 'pending', assignmentStatus: 'offering', routingRound: 1, activeOfferId: offerId, createdAt: ago(30) });
  await db.doc('delivery_offers/' + offerId).set({ rideId, agentId: 'agentX' + T, status: 'offered', expiresAt: ago(5), createdAt: ago(20) });
  const r = await fns._offerExpirySweepForTest();
  const o = (await db.doc('delivery_offers/' + offerId).get()).data();
  ok(r.expiredRides >= 1 && o.status !== 'offered', 'offer still offered ' + JSON.stringify({ r, s: o.status }));
});

await test('D1 adminMoneyWatch: admin only; shows open PesaPal + jobs', async () => {
  ok(!(await call('adminMoneyWatch', 'nobody' + T, {})).ok, 'non-admin allowed');
  const u = 'ppW' + T; await db.doc('users/' + u).set({ uid: u, walletBalance: 0 });
  await call('pesapalCheckout', u, { amount: 3000, orderTrackingId: 'REC4-' + T, purpose: 'deposit' });
  await db.doc('escrow_holds/ppinit_REC4-' + T).update({ createdAt: ago(30) });
  const r = await call('adminMoneyWatch', ADM1, {}, A1); ok(r.ok, JSON.stringify(r));
  const pp = r.data.items.find(i => i.key === 'pesapal_open'); ok(pp && pp.rows.some(x => x.id === 'ppinit_REC4-' + T), JSON.stringify(pp));
  ok(r.data.jobs.pesapalReconcile && r.data.jobs.pesapalReconcile.lastRunAt, 'job info');
});
await test('D2 clientErrorReport scrubs secrets/e-mail/phone and keeps only the path', async () => {
  const r = await call('clientErrorReport', 'errU' + T, { message: 'boom token=abc123 for juma@test.tz 0712 345 678', source: 'https://sokohai.com/js/app/07-product.js?v=1', line: 10, page: 'https://sokohai.com/?q=secret#x' });
  ok(r.ok, JSON.stringify(r));
  const q = await db.collection('client_errors').where('uid', '==', 'errU' + T).limit(1).get(); const d = q.docs[0].data();
  ok(!/abc123|juma@|0712/.test(d.message) && d.page === '/' && d.source === 'js/app/07-product.js', JSON.stringify(d));
});
await test('D3 clientErrorReport is rate limited (30 / hour / user)', async () => {
  let dropped = 0; for (let i = 0; i < 33; i++) { const r = await call('clientErrorReport', 'errR' + T, { message: 'x' + i }); if (r.data && r.data.dropped) dropped++; }
  ok(dropped === 3, 'dropped ' + dropped);
});
await test('E1 adminSetupStatus lists App Check, two-person threshold and search backfill (values, no secrets)', async () => {
  await db.doc('system/config').set({ withdrawals: { dualApprovalMin: 500000 } }, { merge: true });
  await db.collection('admin_audit_log').add({ action: 'SEARCH_BACKFILL', actorUid: ADM1, createdAt: new Date().toISOString() });
  const r = await call('adminSetupStatus', ADM1, {}, A1); ok(r.ok, JSON.stringify(r));
  const it = (k) => r.data.items.find(i => i.key === k) || {};
  ok(it('withdraw_dual').ok && /500,000/.test(it('withdraw_dual').value), JSON.stringify(it('withdraw_dual')));
  ok(it('search_backfill').ok === true, 'backfill'); ok('app_check' in Object.fromEntries(r.data.items.map(i => [i.key, 1])), 'app_check missing');
  await db.doc('system/config').set({ withdrawals: { dualApprovalMin: null } }, { merge: true });
});
await test('F1 pilot caps: unset = no cap; set = PesaPal payment and withdrawal above the cap refused, below allowed', async () => {
  const u = 'capU' + T; await db.doc('users/' + u).set({ uid: u, walletBalance: 900000 });
  ok((await call('pesapalCheckout', u, { amount: 400000, orderTrackingId: 'CAP0-' + T, purpose: 'deposit' })).ok, 'no cap should allow');
  await db.doc('system/config').set({ pilotLimits: { maxPaymentTSh: 200000, maxWithdrawalTSh: 100000 } }, { merge: true });
  try {
    const big = await call('pesapalCheckout', u, { amount: 250000, orderTrackingId: 'CAP1-' + T, purpose: 'deposit' });
    ok(!big.ok && big.code === 'failed-precondition' && !(await db.doc('escrow_holds/ppinit_CAP1-' + T).get()).exists, JSON.stringify(big));
    ok((await call('pesapalCheckout', u, { amount: 150000, orderTrackingId: 'CAP2-' + T, purpose: 'deposit' })).ok, 'below cap refused');
    const wb = await call('withdrawalRequest', u, { amountTSh: 150000, channel: 'mobile', account: '0712345678', requestKey: 'capw1' });
    ok(!wb.ok && wb.code === 'failed-precondition' && await bal(u) === 900000, JSON.stringify(wb));
    ok((await call('withdrawalRequest', u, { amountTSh: 90000, channel: 'mobile', account: '0712345678', requestKey: 'capw2' })).ok, 'small withdrawal refused');
  } finally { await db.doc('system/config').set({ pilotLimits: { maxPaymentTSh: null, maxWithdrawalTSh: null } }, { merge: true }); }
});
console.log(`PILOT OPS (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

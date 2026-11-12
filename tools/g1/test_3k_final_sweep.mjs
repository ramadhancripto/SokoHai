#!/usr/bin/env node
/* ============================================================
 * 3K FINAL SWEEP — funika callables zilizobaki bila test:
 * K1 agent/assisted-session (PIN, lockout, session),
 * K2 negotiation send/action, K3 delivery booking/dispute,
 * K4 static: kila export iliyobaki ni aina sahihi (onCall na
 * auth-gate, onSchedule/onDocument/onRequest kwa zisizo-callable).
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
let group = '[3K]';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
async function call(name, uid, data, extra) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: uid ? tok(uid, extra) : undefined, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

const A = 'kAgent1', M = 'kMember1', M2 = 'kMember2', R = 'kStranger1';
await wipe();

/* ---------- K1: agent / assisted ---------- */
group = '[3K K1 agent]';
await test('K1.0 seed: wakala aliyeidhinishwa + wanachama 2', async () => {
  await db.doc('agents/kAg1').set({ userId: A, status: 'approved', approvedBy: 'admin1' });
  await db.doc('users/' + A).set({ uid: A });
  await db.doc('users/' + M).set({ memberId: 'SKH-00000001' });
  await db.doc('users/' + M2).set({ memberId: 'SKH-00000002' });
  await db.doc('agentMembers/kRel1').set({ agentId: A, memberId: M, status: 'ACTIVE' });
  await db.doc('agentMembers/kRel2').set({ agentId: A, memberId: M2, status: 'ACTIVE' });
  await db.doc('memberSecrets/' + M).set({ uid: M });
  await db.doc('memberSecrets/' + M2).set({ uid: M2 });
});
await test('K1.1 memberSetPin: mpya bila PIN ya zamani -> ok; ya zamani ya uongo inakataliwa', async () => {
  eq((await call('memberSetPin', M, { newPin: '1234' })).ok, true, 'first set');
  const bad = await call('memberSetPin', M, { newPin: '5678', oldPin: '0000' });
  eq(bad.ok, false, 'blocked'); eq(bad.code, 'invalid-argument', bad.code);
  eq((await call('memberSetPin', M, { newPin: '5678', oldPin: '1234' })).ok, true, 'change ok');
  eq((await call('memberSetPin', M2, { newPin: '4321' })).ok, true, 'M2 set');
});
await test('K1.2 agentMemberStatus: asiye-wakala denied; wakala anasimamisha/kuanzisha uhusiano wake', async () => {
  const r1 = await call('agentMemberStatus', R, { memberId: M, status: 'SUSPENDED' });
  eq(r1.ok, false, 'blocked'); eq(r1.code, 'permission-denied', r1.code);
  eq((await call('agentMemberStatus', A, { memberId: M, status: 'SUSPENDED' })).ok, true, 'suspend');
  eq((await db.doc('agentMembers/kRel1').get()).data().status, 'SUSPENDED', 'stored');
  const r2 = await call('agentMemberStatus', A, { memberId: 'ghost', status: 'ACTIVE' });
  eq(r2.ok, false, 'blocked'); eq(r2.code, 'not-found', r2.code);
  eq((await call('agentMemberStatus', A, { memberId: M, status: 'ACTIVE' })).ok, true, 'reactivate');
});
await test('K1.3 agentListMembers: wakala anaona wake; mgeni denied', async () => {
  const r = await call('agentListMembers', A, {});
  eq(r.ok, true, JSON.stringify(r));
  assert((r.data.members || []).length >= 2, '2 members');
  assert(!(r.data.members || []).some(m => JSON.stringify(m).includes('pinHash')), 'no PIN leak');
  const r2 = await call('agentListMembers', R, {});
  eq(r2.ok, false, 'blocked'); eq(r2.code, 'permission-denied', r2.code);
});
await test('K1.4 memberAuthenticate: PIN 5 zisizo sahihi -> lockout (failed-precondition)', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await call('memberAuthenticate', A, { memberId: 'SKH-00000001', pin: '9999' });
    eq(r.ok, false, 'blocked'); eq(r.code, 'invalid-argument', r.code + ' #' + i);
  }
  const r = await call('memberAuthenticate', A, { memberId: 'SKH-00000001', pin: '5678' });
  eq(r.ok, false, 'locked'); eq(r.code, 'failed-precondition', r.code);
});
await test('K1.5 memberAuthenticate: PIN sahihi -> customToken + session; validate + end', async () => {
  const r = await call('memberAuthenticate', A, { memberId: 'SKH-00000002', pin: '4321' });
  eq(r.ok, true, JSON.stringify(r));
  assert(r.data.customToken, 'customToken');
  const sid = r.data.sessionId;
  assert(sid, 'sessionId');
  const v1 = await call('assistedSessionValidate', M2, { sessionId: sid });
  eq(v1.ok, true, JSON.stringify(v1));
  const v2 = await call('assistedSessionValidate', R, { sessionId: sid });
  eq(v2.ok, false, 'stranger blocked'); eq(v2.code, 'permission-denied', v2.code);
  eq((await call('assistedSessionEnd', A, { sessionId: sid })).ok, true, 'agent ends');
  const v3 = await call('assistedSessionValidate', M2, { sessionId: sid });
  eq(v3.ok, false, 'ended'); eq(v3.code, 'failed-precondition', v3.code);
});
await test('K1.6 authenticate ya mwanachama wa mtu mwingine -> denied (no impersonation)', async () => {
  await db.doc('users/kMemberX').set({ memberId: 'SKH-00000009' });
  await db.doc('memberSecrets/kMemberX').set({ uid: 'kMemberX' });
  await call('memberSetPin', 'kMemberX', { newPin: '1111' });
  const r = await call('memberAuthenticate', A, { memberId: 'SKH-00000009', pin: '1111' });
  eq(r.ok, false, 'blocked'); eq(r.code, 'permission-denied', r.code);
});

/* ---------- K2: negotiation ---------- */
group = '[3K K2 negotiation]';
const B = 'kBuyer1', SL = 'kSeller1';
let negoId;
await test('K2.1 sendOffer: unauth/self denied; happy-path inaunda negotiation', async () => {
  await db.doc('products/kProd1').set({ userId: SL, title: 'Kiti', price: 50000 });
  const u = await call('negotiationSendOffer', null, { productId: 'kProd1', sellerId: SL, price: 40000 });
  eq(u.ok, false, 'unauth'); eq(u.code, 'unauthenticated', u.code);
  const s = await call('negotiationSendOffer', SL, { productId: 'kProd1', sellerId: SL, price: 40000 });
  eq(s.ok, false, 'self'); eq(s.code, 'invalid-argument', s.code);
  const r = await call('negotiationSendOffer', B, { productId: 'kProd1', sellerId: SL, price: 40000, quantity: 2 });
  eq(r.ok, true, JSON.stringify(r));
  negoId = r.data.negotiationId;
  assert(negoId, 'negotiationId');
});
await test('K2.2 action: mgeni denied; seller ACCEPT -> agreement; version stale inakataliwa', async () => {
  const g = await call('negotiationAction', R, { negotiationId: negoId, command: 'ACCEPT_OFFER' });
  eq(g.ok, false, 'stranger'); eq(g.code, 'permission-denied', g.code);
  const a = await call('negotiationAction', SL, { negotiationId: negoId, command: 'ACCEPT_OFFER' });
  eq(a.ok, true, JSON.stringify(a));
  const n = (await db.doc('negotiations/' + negoId).get()).data();
  assert((n.agreements || []).length === 1, 'agreement stored');
  const stale = await call('negotiationAction', SL, { negotiationId: negoId, command: 'ACCEPT_OFFER', expectedVersion: 1 });
  eq(stale.ok, false, 'stale'); eq(stale.code, 'failed-precondition', stale.code);
});

/* ---------- K3: delivery booking/dispute ---------- */
group = '[3K K3 delivery]';
await test('K3.1 deliveryRouteBooking: mgeni denied; mhusika ok', async () => {
  await db.doc('orders/kOrd1').set({ buyerId: B, sellerId: SL, status: 'paid', delivery: { required: true, pickupLocation: 'Dar', destination: 'Arusha', vehicleType: 'Lori' } });
  const g = await call('deliveryRouteBooking', R, { orderId: 'kOrd1' });
  eq(g.ok, false, 'stranger'); eq(g.code, 'permission-denied', g.code);
  const n = await call('deliveryRouteBooking', B, { orderId: 'kGhost' });
  eq(n.ok, false, 'missing'); eq(n.code, 'not-found', n.code);
  const r = await call('deliveryRouteBooking', B, { orderId: 'kOrd1' });
  eq(r.ok, true, JSON.stringify(r));
});
await test('K3.2 deliveryDispute: wahusika tu; status -> disputed', async () => {
  await db.doc('ride_requests/kRide1').set({ driverId: SL, customerId: B, status: 'in_transit' });
  const g = await call('deliveryDispute', R, { rideId: 'kRide1', reason: 'test' });
  eq(g.ok, false, 'stranger'); eq(g.code, 'permission-denied', g.code);
  eq((await call('deliveryDispute', B, { rideId: 'kRide1', reason: 'Mzigo umechelewa' })).ok, true, 'receiver ok');
  eq((await db.doc('ride_requests/kRide1').get()).data().status, 'disputed', 'status');
});

/* ---------- K4: static type/auth tripwire ---------- */
group = '[3K K4 static]';
await test('K4.1 kila export iliyobaki: onCall+auth-gate AU trigger/schedule/request', async () => {
  const NON_CALL = {
    inventoryOrderCreated: 'trigger', inventoryOrderUpdated: 'trigger',
    inventoryReconcile: 'call', inventoryReleaseReservation: 'call', inventoryReservationSweep: 'sched',
    commerceModesSweep: 'sched', adsDeliverySweep: 'sched',
    platformStatsHourly: 'sched', sitemapXml: 'request', deliveryRouteRetry: 'call'
  };
  const CALLABLE = ['adminRejectAgent', 'agentListMembers', 'agentMemberStatus', 'assistedSessionEnd',
    'assistedSessionValidate', 'chatOfferAction', 'commentsLike', 'commentsModerate', 'deliveryDispute',
    'deliveryOfferDecline', 'deliveryPassengerBoard', 'deliveryReportTransportFault', 'deliveryRouteBooking',
    'deliveryRouteSweep', 'memberAuthenticate', 'memberSetPin', 'negotiationAction', 'negotiationSendOffer', 'reviewsPublish'];
  const srcs = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'functions')).filter(f => f.endsWith('.js'))) {
    srcs[f] = fs.readFileSync(path.join(ROOT, 'functions', f), 'utf8');
  }
  const all = Object.values(srcs).join('\n');
  function bodyOf(name) {
    for (const [f, t] of Object.entries(srcs)) {
      const i = t.indexOf('exports.' + name + ' =');
      if (i !== -1) return { file: f, body: t.slice(i, i + 3000) };
    }
    return null;
  }
  function resolveDef(name) {
    const d = bodyOf(name);
    assert(d, name + ' exported');
    const head = d.body.slice(0, 220);
    if (new RegExp('exports\\.' + name + '\\s*=\\s*\\w+\\.' + name).test(head)) {
      // re-export (index.js -> engine.*): fuata fasili halisi.
      for (const [f, t] of Object.entries(srcs)) {
        if (f === d.file) continue;
        let j = t.indexOf('exports.' + name + ' = on');
        if (j === -1) { const m = t.match(new RegExp('(const|let) ' + name + ' = on')); j = m ? m.index : -1; }
        if (j !== -1) return { file: f, body: t.slice(j, j + 3000) };
      }
      throw new Error('assert: ' + name + ' engine def missing');
    }
    return d;
  }
  for (const [name, kind] of Object.entries(NON_CALL)) {
    const d = resolveDef(name);
    if (kind === 'sched') assert(/onSchedule/.test(d.body), name + ' onSchedule');
    else if (kind === 'request') assert(/onRequest/.test(d.body), name + ' onRequest');
    else if (kind === 'trigger') assert(/onDocument|onWrite|onCreate|onUpdate/.test(d.body), name + ' trigger');
    else assert(/onCall/.test(d.body), name + ' onCall');
  }
  for (const name of CALLABLE) {
    const d = resolveDef(name);
    assert(new RegExp('exports\\.' + name + '\\s*=\\s*onCall|\\b' + name + ' = onCall').test(d.body.slice(0, 220)), name + ' onCall');
    assert(/requireAuth|authOf|req\.auth|requireApprovedAgent|requireAdmin/.test(d.body), name + ' auth-gate');
  }
});

const fails = results.filter(r => !r.ok);
console.log(`\n[3K] ${results.length - fails.length}/${results.length} passed`);
if (fails.length) { process.exitCode = 1; }

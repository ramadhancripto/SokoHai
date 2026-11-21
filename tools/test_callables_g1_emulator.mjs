#!/usr/bin/env node
/* [G-1 2026-11-20] Direct behavioural tests for the 29 callables that had no test referencing them.
 * Each one runs the REAL exported handler (fns.<name>.run) against the Firestore + Auth emulator and checks the
 * typed outcome AND the data effect (or the absence of one). Emulator only: no real money, no production.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_callables_g1_emulator.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator inahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
process.env.SUPER_ADMIN_EMAILS = 'g1owner@sokohai.test';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
let pass = 0, fail = 0; const covered = new Set();
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const T = Date.now().toString(36);
const ADMIN = { uid: 'g1adm' + T, token: { admin: true } };
async function call(name, who, data) {
  covered.add(name);
  const auth = who === null ? null : { uid: who.uid || who, token: Object.assign({ uid: who.uid || who, email: (who.uid || who) + '@u.test', email_verified: true }, who.token || {}) };
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message, details: e && e.details }; }
}
const code = async (name, who, data) => (await call(name, who, data)).code;
const doc = async (p) => (await db.doc(p).get()).data();
const iso = (ms) => new Date(Date.now() + ms).toISOString();

// ---------- Business OS: staff ----------
const OWNER = 'g1own' + T, STAFF = 'g1stf' + T, OTHER = 'g1oth' + T;
await db.doc('users/' + OWNER).set({ uid: OWNER, fullName: 'Owner', shopOwnerUid: OWNER, isSeller: true });
await db.doc('users/' + STAFF).set({ uid: STAFF, fullName: 'Staff', shopOwnerUid: STAFF });
await db.doc('users/' + OTHER).set({ uid: OTHER, fullName: 'Other', shopOwnerUid: OTHER });
let invite = null;
await test('staffInviteCreate: unauthenticated / bad role refused; owner creates a pending invite with a code', async () => {
  eq(await code('staffInviteCreate', null, { role: 'Cashier' }), 'unauthenticated', 'anon');
  eq(await code('staffInviteCreate', OWNER, { role: 'king' }), 'invalid-argument', 'bad role');
  eq(await code('staffInviteCreate', OWNER, { role: 'Cashier', staffRowId: 'nope' + T }), 'not-found', 'missing row');
  const r = await call('staffInviteCreate', OWNER, { role: 'Cashier' }); ok(r.ok, JSON.stringify(r));
  invite = r.data; ok(invite.code && (invite.inviteId || invite.id), 'code + id ' + JSON.stringify(invite));
  const d = await doc('staff_invites/' + (invite.inviteId || invite.id)); eq(d.status, 'pending', 'pending'); eq(d.shopOwnerId, OWNER, 'owner');
});
await test('staffInviteAccept: bad code not-found; owner cannot accept own invite; staff accepts -> linked to the shop', async () => {
  eq(await code('staffInviteAccept', STAFF, { code: '' }), 'invalid-argument', 'empty');
  eq(await code('staffInviteAccept', STAFF, { code: 'ZZZZZZ' }), 'not-found', 'bad code');
  eq(await code('staffInviteAccept', OWNER, { code: invite.code }), 'failed-precondition', 'own invite');
  const r = await call('staffInviteAccept', STAFF, { code: invite.code }); ok(r.ok, JSON.stringify(r));
  eq((await doc('users/' + STAFF)).shopOwnerUid, OWNER, 'staff linked');
  eq((await doc('staff_invites/' + (invite.inviteId || invite.id))).status, 'accepted', 'invite used');
  eq(await code('staffInviteAccept', OTHER, { code: invite.code }), 'not-found', 'cannot reuse');
});
await test('staffInviteRevoke: stranger permission-denied; owner revokes; second revoke idempotent', async () => {
  const r0 = await call('staffInviteCreate', OWNER, { role: 'Cashier' }); const id = r0.data.inviteId || r0.data.id;
  eq(await code('staffInviteRevoke', OTHER, { inviteId: id }), 'permission-denied', 'stranger');
  eq(await code('staffInviteRevoke', OWNER, { inviteId: 'missing' + T }), 'not-found', 'missing');
  ok((await call('staffInviteRevoke', OWNER, { inviteId: id })).ok, 'revoke'); eq((await doc('staff_invites/' + id)).status, 'revoked', 'revoked');
  eq((await call('staffInviteRevoke', OWNER, { inviteId: id })).data.already, true, 'idempotent');
});
await test('staffRemove: stranger cannot remove; owner removes staff -> staff back on own account; repeat not-found', async () => {
  eq(await code('staffRemove', OWNER, { staffUid: OWNER }), 'invalid-argument', 'self');
  eq(await code('staffRemove', OTHER, { staffUid: STAFF }), 'not-found', 'not their staff');
  ok((await call('staffRemove', OWNER, { staffUid: STAFF })).ok, 'remove');
  eq((await doc('users/' + STAFF)).shopOwnerUid, STAFF, 'unlinked');
  eq(await code('staffRemove', OWNER, { staffUid: STAFF }), 'not-found', 'repeat');
});

// ---------- Marketplace: commentsModerate ----------
await test('commentsModerate: normal user refused; admin hides; invalid action / missing comment typed', async () => {
  const cid = 'g1c' + T; await db.doc('comments/' + cid).set({ text: 'Habari', userId: OTHER, moderationStatus: 'visible' });
  eq(await code('commentsModerate', OTHER, { commentId: cid, action: 'hide' }), 'permission-denied', 'normal user');
  eq((await doc('comments/' + cid)).moderationStatus, 'visible', 'unchanged after refusal');
  eq(await code('commentsModerate', ADMIN, { commentId: cid, action: 'burn' }), 'invalid-argument', 'bad action');
  eq(await code('commentsModerate', ADMIN, { commentId: 'nope' + T, action: 'hide' }), 'not-found', 'missing');
  ok((await call('commentsModerate', ADMIN, { commentId: cid, action: 'hide' })).ok, 'hide');
  eq((await doc('comments/' + cid)).moderationStatus, 'hidden', 'hidden');
});

// ---------- Auctions: auctionConfirmPayment ----------
await test('auctionConfirmPayment: not an auction / not ended / not the winner / unpaid winner all typed, no write', async () => {
  const P = 'g1auc' + T;
  eq(await code('auctionConfirmPayment', OTHER, { productId: '' }), 'invalid-argument', 'empty');
  await db.doc('products/' + P).set({ title: 'Mnada', userId: OWNER, saleMode: 'auction', modeData: { mode: 'auction', ended: false } });
  eq(await code('auctionConfirmPayment', OTHER, { productId: P }), 'failed-precondition', 'not ended');
  await db.doc('products/' + P).update({ 'modeData.ended': true, 'modeData.winnerId': STAFF, 'modeData.winnerRound': 1 });
  eq(await code('auctionConfirmPayment', OTHER, { productId: P }), 'permission-denied', 'not winner');
  eq(await code('auctionConfirmPayment', STAFF, { productId: P }), 'failed-precondition', 'no verified payment');
  ok(!(await doc('products/' + P)).modeData.winnerPaid, 'winnerPaid not set');
  await db.doc('products/' + P).update({ 'modeData.winnerPaid': true });
  eq((await call('auctionConfirmPayment', STAFF, { productId: P })).data.already, true, 'already paid -> idempotent');
});

// ---------- PesaPal: pesapalRegisterIpn ----------
await test('pesapalRegisterIpn: unauthenticated / non-admin refused; admin without keys gets PAYMENTS_NOT_CONFIGURED (no network)', async () => {
  delete process.env.PESAPAL_CONSUMER_KEY; delete process.env.PESAPAL_CONSUMER_SECRET;
  eq(await code('pesapalRegisterIpn', null, { url: 'https://x.test/ipn' }), 'unauthenticated', 'anon');
  eq(await code('pesapalRegisterIpn', OTHER, { url: 'https://x.test/ipn' }), 'permission-denied', 'non-admin');
  const r = await call('pesapalRegisterIpn', ADMIN, { url: 'https://x.test/ipn' });
  eq(r.code, 'failed-precondition', 'typed config error'); ok(/PAYMENTS_NOT_CONFIGURED/.test(r.message), r.message);
});

// ---------- Live ----------
const LS = 'g1live' + T, PL = 'g1lp' + T, PX = 'g1lpx' + T;
await db.doc('products/' + PL).set({ title: 'Live item', userId: OWNER, price: 1000, stock: 2, status: 'active', publicationStatus: 'published' });
await db.doc('products/' + PX).set({ title: 'Not mine', userId: OTHER, price: 1000, stock: 2, status: 'active', publicationStatus: 'published' });
await db.doc('live_sessions/' + LS).set({ hostUid: OWNER, hostName: 'Owner', title: 'Live', kind: 'live', status: 'live', productIds: [], video: { kind: 'none', url: null }, createdAt: iso(0) });
await test('livePing: host only; live session stamps hostSeenAtMs; ended session idle', async () => {
  eq(await code('livePing', null, { sessionId: LS }), 'unauthenticated', 'anon');
  eq(await code('livePing', OTHER, { sessionId: LS }), 'permission-denied', 'not host');
  eq(await code('livePing', OWNER, { sessionId: 'nope' + T }), 'not-found', 'missing session');
  const r = await call('livePing', OWNER, { sessionId: LS }); ok(r.ok && r.data.serverNow, JSON.stringify(r));
  ok(Number((await doc('live_sessions/' + LS)).hostSeenAtMs) > 0, 'heartbeat stored');
});
await test('liveSetProducts: host only; another seller\'s product refused; own product set', async () => {
  eq(await code('liveSetProducts', OTHER, { sessionId: LS, productIds: [PL] }), 'permission-denied', 'not host');
  eq(await code('liveSetProducts', OWNER, { sessionId: LS, productIds: [PX] }), 'permission-denied', 'foreign product');
  eq(await code('liveSetProducts', OWNER, { sessionId: LS, productIds: ['missing' + T] }), 'failed-precondition', 'missing product');
  const r = await call('liveSetProducts', OWNER, { sessionId: LS, productIds: [PL] }); ok(r.ok, JSON.stringify(r));
  eq(JSON.stringify((await doc('live_sessions/' + LS)).productIds), JSON.stringify([PL]), 'stored');
});
await test('liveSetVideo: bad kind / bad URL typed; embed stored; ended session refused', async () => {
  eq(await code('liveSetVideo', OWNER, { sessionId: LS, kind: 'tv' }), 'invalid-argument', 'kind');
  eq(await code('liveSetVideo', OWNER, { sessionId: LS, kind: 'embed', videoUrl: 'https://evil.test/x' }), 'invalid-argument', 'url');
  eq(await code('liveSetVideo', OTHER, { sessionId: LS, kind: 'none' }), 'permission-denied', 'not host');
  const r = await call('liveSetVideo', OWNER, { sessionId: LS, kind: 'embed', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  ok(r.ok && r.data.video.kind === 'embed', JSON.stringify(r));
  await db.doc('live_sessions/' + LS).update({ status: 'ended' });
  eq(await code('liveSetVideo', OWNER, { sessionId: LS, kind: 'none' }), 'failed-precondition', 'ended');
  eq((await call('livePing', OWNER, { sessionId: LS })).data.idle, true, 'ping idle when ended');
});

// ---------- Stories ----------
await test('storyReact: toggles one reaction per user with a consistent count; expired story refused', async () => {
  const S = 'g1st' + T; await db.doc('stories/' + S).set({ authorUid: OWNER, status: 'active', expiresAt: iso(3600e3), reactCount: 0 });
  eq(await code('storyReact', null, { storyId: S }), 'unauthenticated', 'anon');
  eq(await code('storyReact', OTHER, { storyId: 'nope' + T }), 'not-found', 'missing');
  const a = await call('storyReact', OTHER, { storyId: S }); eq(a.data.on, true, 'on'); eq(a.data.count, 1, 'count 1');
  const b = await call('storyReact', OTHER, { storyId: S }); eq(b.data.on, false, 'off'); eq(b.data.count, 0, 'count 0');
  await db.doc('stories/' + S).update({ expiresAt: iso(-1000) });
  eq(await code('storyReact', OTHER, { storyId: S }), 'failed-precondition', 'expired');
});

// ---------- Chat offers ----------
await test('chatOfferAction: invalid action / missing offer typed; a stranger cannot answer; the seller rejects a legacy offer', async () => {
  const O = 'g1of' + T;
  await db.doc('offers/' + O).set({ status: 'pending', buyerId: OTHER, sellerId: OWNER, productId: PL, proposedPrice: 800, currentPrice: 1000, quantity: 1, createdAt: iso(0) });
  eq(await code('chatOfferAction', OWNER, { offerId: O, action: 'steal' }), 'invalid-argument', 'action');
  eq(await code('chatOfferAction', OWNER, { offerId: 'nope' + T, action: 'reject' }), 'not-found', 'missing');
  const s = await code('chatOfferAction', STAFF, { offerId: O, action: 'reject' }); ok(s === 'permission-denied' || s === 'failed-precondition', 'stranger ' + s);
  const r = await call('chatOfferAction', OWNER, { offerId: O, action: 'reject' }); ok(r.ok, JSON.stringify(r));
  const n = await doc('negotiations/' + (await doc('offers/' + O)).negotiationId); eq(n.currentState, 'REJECTED', 'negotiation rejected');
});

// ---------- Transport ----------
const RIDE = 'g1ride' + T;
await db.doc('ride_requests/' + RIDE).set({ customerId: OTHER, driverId: STAFF, currentCustodian: STAFF, status: 'accepted', assignmentStatus: 'assigned', acceptedAt: iso(0), createdAt: iso(0) });
await test('deliveryPassengerBoard: driver only; wrong OTP failed-precondition and the ride is not moved', async () => {
  eq(await code('deliveryPassengerBoard', STAFF, { rideId: RIDE }), 'invalid-argument', 'otp missing');
  eq(await code('deliveryPassengerBoard', OTHER, { rideId: RIDE, otp: 'ABC123' }), 'permission-denied', 'not the driver');
  eq(await code('deliveryPassengerBoard', STAFF, { rideId: 'nope' + T, otp: 'ABC123' }), 'not-found', 'missing ride');
  eq(await code('deliveryPassengerBoard', STAFF, { rideId: RIDE, otp: 'WRONG1' }), 'failed-precondition', 'wrong otp');
  eq((await doc('ride_requests/' + RIDE)).status, 'accepted', 'not moved');
});
await test('deliveryRevokeTokens: stranger refused; customer revokes', async () => {
  eq(await code('deliveryRevokeTokens', OWNER, { rideId: RIDE }), 'permission-denied', 'stranger');
  eq(await code('deliveryRevokeTokens', OTHER, { rideId: 'nope' + T }), 'not-found', 'missing');
  ok((await call('deliveryRevokeTokens', OTHER, { rideId: RIDE })).ok, 'customer revokes');
});
await test('deliveryDispute: stranger refused; receiver opens a dispute -> ride disputed with the reason', async () => {
  eq(await code('deliveryDispute', OTHER, { rideId: RIDE }), 'invalid-argument', 'no reason');
  eq(await code('deliveryDispute', OWNER, { rideId: RIDE, reason: 'Mzigo umeharibika' }), 'permission-denied', 'stranger');
  ok((await call('deliveryDispute', OTHER, { rideId: RIDE, reason: 'Mzigo umeharibika' })).ok, 'dispute');
  const r = await doc('ride_requests/' + RIDE); eq(r.status, 'disputed', 'disputed'); eq(r.disputeReason, 'Mzigo umeharibika', 'reason');
});
const ORD = 'g1ord' + T;
await db.doc('orders/' + ORD).set({ buyerId: OTHER, sellerId: OWNER, amount: 1000, status: 'payment_pending', items: [{ productId: PL, qty: 1 }], createdAt: iso(0) });
await test('deliveryRouteBooking: unrelated user refused; missing order not-found; empty orderId invalid', async () => {
  eq(await code('deliveryRouteBooking', null, { orderId: ORD }), 'unauthenticated', 'anon');
  eq(await code('deliveryRouteBooking', OTHER, {}), 'invalid-argument', 'empty');
  eq(await code('deliveryRouteBooking', OTHER, { orderId: 'nope' + T }), 'not-found', 'missing');
  eq(await code('deliveryRouteBooking', STAFF, { orderId: ORD }), 'permission-denied', 'unrelated');
  const r = await call('deliveryRouteBooking', OTHER, { orderId: ORD });
  // [defect found by this test, fixed in routing.js mapError] an order without delivery.required used to return INTERNAL
  eq(r.code, 'failed-precondition', 'party, order without delivery: typed ' + JSON.stringify(r)); ok(/not_a_booking/.test(r.message), r.message);
  eq((await db.collection('ride_requests').where('orderId', '==', ORD).get()).size, 0, 'no ride created');
});
await test('deliveryRouteRetry: only the customer; ride without order typed', async () => {
  const R2 = 'g1r2' + T; await db.doc('ride_requests/' + R2).set({ customerId: OTHER, status: 'searching', assignmentStatus: 'failed_assignment', routingRound: 1 });
  eq(await code('deliveryRouteRetry', OWNER, { rideId: R2 }), 'permission-denied', 'not customer');
  eq(await code('deliveryRouteRetry', OTHER, { rideId: 'nope' + T }), 'not-found', 'missing');
  eq(await code('deliveryRouteRetry', OTHER, { rideId: R2 }), 'failed-precondition', 'no order');
});
await test('deliveryRouteSweep: signed in only; sweeping a ride with nothing to do is a no-op', async () => {
  eq(await code('deliveryRouteSweep', null, {}), 'unauthenticated', 'anon');
  const r = await call('deliveryRouteSweep', STAFF, {}); ok(r.ok, JSON.stringify(r));
});

// ---------- Inventory ----------
await test('inventoryReleaseReservation: party only; paid order refused; unpaid order released (no stock created)', async () => {
  eq(await code('inventoryReleaseReservation', OTHER, {}), 'invalid-argument', 'empty');
  eq(await code('inventoryReleaseReservation', OTHER, { orderId: 'nope' + T }), 'not-found', 'missing');
  eq(await code('inventoryReleaseReservation', STAFF, { orderId: ORD }), 'permission-denied', 'stranger');
  const before = (await doc('products/' + PL)).stock;
  const r = await call('inventoryReleaseReservation', OTHER, { orderId: ORD }); ok(r.ok, JSON.stringify(r));
  eq((await doc('products/' + PL)).stock, before, 'stock unchanged (nothing was reserved)');
  const PAID = 'g1paid' + T; await db.doc('orders/' + PAID).set({ buyerId: OTHER, sellerId: OWNER, paymentVerified: true });
  eq(await code('inventoryReleaseReservation', OTHER, { orderId: PAID }), 'failed-precondition', 'paid');
});
await test('inventoryReconcile: other seller needs admin; own reconcile returns a report; admin may reconcile anyone', async () => {
  eq(await code('inventoryReconcile', null, {}), 'unauthenticated', 'anon');
  eq(await code('inventoryReconcile', OTHER, { sellerId: OWNER }), 'permission-denied', 'other seller');
  const own = await call('inventoryReconcile', OWNER, {}); ok(own.ok, JSON.stringify(own));
  const adm = await call('inventoryReconcile', ADMIN, { sellerId: OWNER }); ok(adm.ok, JSON.stringify(adm));
});

// ---------- Accounts: admin actions ----------
await test('adminRejectAgent: non-admin refused; short reason invalid; admin rejects -> status rejected + audit', async () => {
  const AG = 'g1ag' + T; await db.doc('agents/' + AG).set({ userId: STAFF, status: 'pending' });
  eq(await code('adminRejectAgent', OTHER, { agentDocId: AG, reason: 'Hati hazijakamilika' }), 'permission-denied', 'non-admin');
  eq(await code('adminRejectAgent', ADMIN, { agentDocId: AG, reason: 'x' }), 'invalid-argument', 'reason');
  eq(await code('adminRejectAgent', ADMIN, { agentDocId: 'nope' + T, reason: 'Hati hazijakamilika' }), 'not-found', 'missing');
  ok((await call('adminRejectAgent', ADMIN, { agentDocId: AG, reason: 'Hati hazijakamilika' })).ok, 'reject');
  eq((await doc('agents/' + AG)).status, 'rejected', 'rejected');
  const a = await db.collection('admin_audit_log').where('action', '==', 'AGENT_REJECTED').where('target.agentDocId', '==', AG).get(); eq(a.size, 1, 'audit');
});
await test('adminSetVerification: non-admin refused; bad kind invalid; admin verifies a service', async () => {
  const SV = 'g1sv' + T; await db.doc('services/' + SV).set({ title: 'Fundi', userId: OWNER });
  eq(await code('adminSetVerification', OTHER, { kind: 'service', id: SV, verified: true, reason: 'Hati sahihi' }), 'permission-denied', 'non-admin');
  eq(await code('adminSetVerification', ADMIN, { kind: 'alien', id: SV, verified: true, reason: 'Hati sahihi' }), 'invalid-argument', 'kind');
  eq(await code('adminSetVerification', ADMIN, { kind: 'service', id: 'nope' + T, verified: true, reason: 'Hati sahihi' }), 'not-found', 'missing');
  ok((await call('adminSetVerification', ADMIN, { kind: 'service', id: SV, verified: true, reason: 'Hati sahihi' })).ok, 'verify');
  eq((await doc('services/' + SV)).providerVerified, true, 'verified flag');
});

// ---------- Accounts: agents, members, assisted sessions ----------
const AGENT = { uid: 'g1agent' + T, token: { agent: true } };
await test('agentMemberStatus / agentListMembers: non-agent refused; agent lists only own members; status change typed', async () => {
  eq(await code('agentListMembers', OTHER, {}), 'permission-denied', 'non-agent list');
  eq(await code('agentMemberStatus', OTHER, { memberId: 'm', status: 'ACTIVE' }), 'permission-denied', 'non-agent status');
  const M = 'g1mem' + T;
  await db.collection('agentMembers').add({ agentId: AGENT.uid, memberId: M, memberCode: 'SKM1', status: 'ACTIVE', createdAt: iso(0) });
  await db.collection('agentMembers').add({ agentId: 'someoneElse' + T, memberId: 'x' + T, status: 'ACTIVE', createdAt: iso(0) });
  const l = await call('agentListMembers', AGENT, {}); ok(l.ok, JSON.stringify(l));
  const items = l.data.members || l.data.items || []; eq(items.length, 1, 'own members only');
  eq(await code('agentMemberStatus', AGENT, { memberId: M, status: 'FROZEN' }), 'invalid-argument', 'bad status');
  eq(await code('agentMemberStatus', AGENT, { memberId: 'x' + T, status: 'SUSPENDED' }), 'not-found', 'not my member');
  ok((await call('agentMemberStatus', AGENT, { memberId: M, status: 'SUSPENDED' })).ok, 'suspend');
  const rel = await db.collection('agentMembers').where('memberId', '==', M).get(); eq(rel.docs[0].data().status, 'SUSPENDED', 'stored');
});
const MEMBER = 'g1mbr' + T;
await test('memberSetPin: no PIN registered not-found; bad PIN invalid; wrong current PIN refused; change works', async () => {
  eq(await code('memberSetPin', MEMBER, { newPin: '12' }), 'invalid-argument', 'short');
  eq(await code('memberSetPin', MEMBER, { newPin: '4321' }), 'not-found', 'no secret');
  await db.doc('memberSecrets/' + MEMBER).set({ uid: MEMBER, pinSalt: null, pinHash: null, pinAttempts: 0 });
  ok((await call('memberSetPin', MEMBER, { newPin: '4321' })).ok, 'first PIN set');
  eq(await code('memberSetPin', MEMBER, { newPin: '9999', oldPin: '0000' }), 'invalid-argument', 'wrong current');
  ok((await call('memberSetPin', MEMBER, { newPin: '9999', oldPin: '4321' })).ok, 'changed');
});
await test('memberAuthenticate: non-agent refused; unknown member not-found; no relationship permission-denied', async () => {
  eq(await code('memberAuthenticate', OTHER, { memberId: 'SKM1', pin: '1234' }), 'permission-denied', 'non-agent');
  eq(await code('memberAuthenticate', AGENT, { memberId: 'NOPE' + T, pin: '1234' }), 'not-found', 'unknown');
  await db.doc('users/' + MEMBER).set({ uid: MEMBER, memberId: 'SKMX' + T.toUpperCase(), isOfflineUser: true });
  eq(await code('memberAuthenticate', AGENT, { memberId: 'SKMX' + T, pin: '1234' }), 'permission-denied', 'no relationship');
});
await test('assistedSessionValidate / assistedSessionEnd: owner only; expired session closed; end is idempotent', async () => {
  const s1 = await db.collection('assistedSessions').add({ userId: MEMBER, agentId: AGENT.uid, active: true, expiresAt: iso(3600e3) });
  eq(await code('assistedSessionValidate', OTHER, { sessionId: s1.id }), 'permission-denied', 'not mine');
  eq(await code('assistedSessionValidate', MEMBER, { sessionId: 'nope' + T }), 'not-found', 'missing');
  ok((await call('assistedSessionValidate', MEMBER, { sessionId: s1.id })).ok, 'valid');
  eq(await code('assistedSessionEnd', OTHER, { sessionId: s1.id }), 'permission-denied', 'stranger end');
  ok((await call('assistedSessionEnd', AGENT, { sessionId: s1.id })).ok, 'agent ends'); eq((await doc('assistedSessions/' + s1.id)).active, false, 'closed');
  eq(await code('assistedSessionValidate', MEMBER, { sessionId: s1.id }), 'failed-precondition', 'closed session');
  ok((await call('assistedSessionEnd', MEMBER, { sessionId: 'nope' + T })).ok, 'end missing = ok');
  const s2 = await db.collection('assistedSessions').add({ userId: MEMBER, agentId: AGENT.uid, active: true, expiresAt: iso(-1000) });
  eq(await code('assistedSessionValidate', MEMBER, { sessionId: s2.id }), 'failed-precondition', 'expired'); eq((await doc('assistedSessions/' + s2.id)).active, false, 'expired closed');
});
await test('entitlementGrant: boost of someone else\'s listing refused; missing listing not-found; bad kind invalid; nothing granted', async () => {
  eq(await code('entitlementGrant', null, { kind: 'boost' }), 'unauthenticated', 'anon');
  eq(await code('entitlementGrant', OTHER, { kind: 'boost', collectionName: 'cars', itemId: PL }), 'invalid-argument', 'collection');
  eq(await code('entitlementGrant', OTHER, { kind: 'boost', collectionName: 'products', itemId: 'nope' + T }), 'not-found', 'missing');
  eq(await code('entitlementGrant', OTHER, { kind: 'boost', collectionName: 'products', itemId: PL }), 'permission-denied', 'not mine');
  ok(!(await doc('products/' + PL)).boostedUntil, 'no boost written');
  const k = await code('entitlementGrant', OWNER, { kind: 'mystery' }); ok(k === 'invalid-argument' || k === 'failed-precondition', 'bad kind ' + k);
});

const LIST = ['staffInviteCreate', 'staffInviteAccept', 'staffInviteRevoke', 'staffRemove', 'commentsModerate', 'auctionConfirmPayment', 'pesapalRegisterIpn', 'livePing', 'liveSetProducts', 'liveSetVideo', 'storyReact', 'chatOfferAction',
  'deliveryDispute', 'deliveryPassengerBoard', 'deliveryRevokeTokens', 'deliveryRouteBooking', 'deliveryRouteRetry', 'deliveryRouteSweep', 'inventoryReconcile', 'inventoryReleaseReservation', 'adminRejectAgent', 'adminSetVerification',
  'agentListMembers', 'agentMemberStatus', 'assistedSessionEnd', 'assistedSessionValidate', 'entitlementGrant', 'memberAuthenticate', 'memberSetPin'];
await test('all 29 G-1 callables were exercised', async () => { const miss = LIST.filter(n => !covered.has(n)); eq(miss.length, 0, 'missing: ' + miss.join(',')); eq(LIST.length, 29, 'list size'); });
console.log(`\nG-1 CALLABLES (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

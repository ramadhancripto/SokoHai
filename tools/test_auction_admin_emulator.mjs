#!/usr/bin/env node
/**
 * [R14] Auction admin callables — role checks on the SERVER, derived statuses, detail,
 * finalize / second chance / payment extension, admin cancel, audit trail.
 * Firebase EMULATOR only:  firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_auction_admin_emulator.mjs"
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!FS_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT; process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
let pass = 0, fail = 0;
async function test(n, fn) { try { await fn(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error('assert: ' + m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
async function call(name, uid, data, claims) {
  try { return { ok: true, data: await fns[name].run({ data, auth: uid ? tok(uid, claims) : null, rawRequest: { headers: {} } }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
const ADMIN = { admin: true };
const get = async (p) => (await db.doc(p).get()).data() || {};
await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
const now = Date.now(), H = 3600e3;
const auc = (id, md, over) => db.doc('products/' + id).set(Object.assign({ title: 'Mnada ' + id, price: 10000, stock: 1, userId: 'seller', sellerName: 'Muuzaji', publicationStatus: 'published', saleMode: 'auction', modeData: Object.assign({ mode: 'auction' }, md) }, over || {}));
await auc('ACT', { endTime: now + 2 * H, currentBid: 12000, totalBids: 2, bidderCount: 2 });
await auc('CLOSE', { endTime: now - 60e3, currentBid: 15000, totalBids: 1, maxBidder: 'b1', maxBidderName: 'b1' });
await db.doc('products/CLOSE/bids/x1').set({ uid: 'b1', name: 'b1', amount: 15000, at: new Date().toISOString() });
await auc('EXP', { endTime: now - 30 * H, ended: true, endNotified: true, winnerId: 'b1', winnerBid: 20000, winnerRound: 1, paymentDeadline: now - H, totalBids: 2 });
await db.doc('products/EXP/bids/a').set({ uid: 'b1', name: 'b1', amount: 20000 }); await db.doc('products/EXP/bids/b').set({ uid: 'b2', name: 'b2', amount: 18000 });
await auc('WAIT', { endTime: now - 2 * H, ended: true, endNotified: true, winnerId: 'b3', winnerBid: 9000, winnerRound: 1, paymentDeadline: now + 5 * H, totalBids: 1 });
await auc('PAID', { ended: true, winnerId: 'b1', winnerPaid: true, paidOrderId: 'o1', endTime: now - 50 * H });

console.log('\n[Access]');
await test('a normal user is refused by the server (list, detail, action)', async () => {
  for (const [n, d] of [['adminAuctionsList', {}], ['adminAuctionDetail', { productId: 'ACT' }], ['adminAuctionAction', { productId: 'CLOSE', action: 'finalize', reason: 'jaribio la mtumiaji' }]]) {
    const r = await call(n, 'b1', d); eq(r.ok, false, n); eq(r.code, 'permission-denied', n + ' code');
  }
});
await test('no login -> unauthenticated', async () => { const r = await call('adminAuctionsList', null, {}); eq(r.code, 'unauthenticated', 'code'); });

console.log('\n[List + detail]');
await test('statuses derived from server fields', async () => {
  const r = await call('adminAuctionsList', 'adm', {}, ADMIN); assert(r.ok, r.message);
  const st = Object.fromEntries(r.data.auctions.map(a => [a.id, a.status]));
  eq(st.ACT, 'active', 'ACT'); eq(st.CLOSE, 'closing', 'CLOSE'); eq(st.EXP, 'payment_expired', 'EXP'); eq(st.WAIT, 'awaiting_payment', 'WAIT'); eq(st.PAID, 'paid', 'PAID');
  const f = await call('adminAuctionsList', 'adm', { status: 'payment_expired' }, ADMIN); eq(f.data.auctions.length, 1, 'filter');
});
await test('detail returns bids (admin sees names) and hides claim markers', async () => {
  const r = await call('adminAuctionDetail', 'adm', { productId: 'EXP' }, ADMIN); assert(r.ok, r.message);
  eq(r.data.bids.length, 2, 'bids'); eq(r.data.bids[0].amount, 20000, 'sorted'); assert(r.data.events.every(e => !String(e.type).startsWith('__')), 'no markers');
});

console.log('\n[Actions]');
await test('a reason is required', async () => { const r = await call('adminAuctionAction', 'adm', { productId: 'CLOSE', action: 'finalize', reason: 'x' }, ADMIN); eq(r.ok, false, 'refused'); });
await test('finalize refused while time remains; works when over', async () => {
  const no = await call('adminAuctionAction', 'adm', { productId: 'ACT', action: 'finalize', reason: 'kufunga mapema' }, ADMIN); eq(no.ok, false, 'early');
  const r = await call('adminAuctionAction', 'adm', { productId: 'CLOSE', action: 'finalize', reason: 'muda umeisha, funga sasa' }, ADMIN); assert(r.ok, r.message);
  const m = (await get('products/CLOSE')).modeData; eq(m.ended, true, 'ended'); eq(m.winnerId, 'b1', 'winner');
});
await test('second chance only after the payment deadline', async () => {
  const no = await call('adminAuctionAction', 'adm', { productId: 'WAIT', action: 'second_chance', reason: 'mshindi hajalipa' }, ADMIN); eq(no.ok, false, 'deadline not passed');
  const r = await call('adminAuctionAction', 'adm', { productId: 'EXP', action: 'second_chance', reason: 'mshindi hajalipa kwa wakati' }, ADMIN); assert(r.ok, r.message);
  const m = (await get('products/EXP')).modeData; eq(m.winnerId, 'b2', 'runner-up'); eq(m.winnerBid, 18000, 'their bid'); eq(m.winnerRound, 2, 'round 2');
});
await test('extend payment: bounded hours, moves the deadline, notifies the winner', async () => {
  const bad = await call('adminAuctionAction', 'adm', { productId: 'WAIT', action: 'extend_payment', hours: 200, reason: 'ombi la mnunuzi' }, ADMIN); eq(bad.ok, false, '>72h');
  const before = (await get('products/WAIT')).modeData.paymentDeadline;
  const r = await call('adminAuctionAction', 'adm', { productId: 'WAIT', action: 'extend_payment', hours: 6, reason: 'mnunuzi alikuwa safarini' }, ADMIN); assert(r.ok, r.message);
  eq((await get('products/WAIT')).modeData.paymentDeadline, before + 6 * H, '+6h');
  const n = await db.collection('notifications').where('userId', '==', 'b3').where('type', '==', 'auction_payment_extended').get(); eq(n.size, 1, 'notified');
});
await test('payment cannot be marked by hand (no such action)', async () => {
  const r = await call('adminAuctionAction', 'adm', { productId: 'WAIT', action: 'mark_paid', reason: 'nimeambiwa amelipa' }, ADMIN); eq(r.code, 'invalid-argument', 'refused');
  eq((await get('products/WAIT')).modeData.winnerPaid, undefined, 'still unpaid');
});
await test('admin cancel (with reason) of an auction with bids; seller cannot', async () => {
  const s = await call('auctionCancel', 'seller', { productId: 'ACT', reason: 'nimebadili mawazo' }); eq(s.ok, false, 'seller refused after bids');
  const r = await call('auctionCancel', 'adm', { productId: 'ACT', reason: 'udanganyifu umeripotiwa' }, ADMIN); assert(r.ok, r.message);
  eq((await get('products/ACT')).modeData.cancelled, true, 'cancelled');
});
await test('every admin action is in admin_audit_log', async () => {
  const q = await db.collection('admin_audit_log').get(); const acts = q.docs.map(d => d.data().action).sort();
  for (const a of ['auction_finalize', 'auction_second_chance', 'auction_extend_payment', 'auction_cancel']) assert(acts.includes(a), 'missing ' + a + ' in ' + acts);
  assert(q.docs.every(d => d.data().actorUid === 'adm'), 'actor');
});
console.log(`\nAUCTION ADMIN: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

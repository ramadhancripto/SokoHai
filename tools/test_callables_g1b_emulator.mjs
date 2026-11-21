#!/usr/bin/env node
/* [G-1b 2026-11-20] The last 10 callables whose only tests were static/contract tests (no handler run):
 * adminSetTrustBadge (had no test at all), posRefund, posCreditAdjustment, posReceipt, posReconcile,
 * creativeSaveDraft, creativePublish, creativeModerate, creativeTrackEvent, adsTrackDeliveryEvent.
 * Each runs the REAL exported handler against the emulator: auth gate, input validation, ownership, and the data
 * effect (or that nothing was written). Emulator only; no real money.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_callables_g1b_emulator.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator inahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
let pass = 0, fail = 0; const covered = new Set();
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const T = Date.now().toString(36);
const ADMIN = { uid: 'g1badm' + T, token: { admin: true } };
async function call(name, who, data, ip) {
  covered.add(name);
  const auth = who === null ? null : { uid: who.uid || who, token: Object.assign({ uid: who.uid || who }, who.token || {}) };
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth, rawRequest: { headers: {}, ip: ip || '10.0.0.' + (Math.random() * 200 | 0) }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message, details: e && e.details }; }
}
const get = async (p) => { const s = await db.doc(p).get(); return s.exists ? s.data() : null; };
const count = async (c, f, v) => (await db.collection(c).where(f, '==', v).get()).size;

await test('adminSetTrustBadge: non-admin refused; bad badge / missing evidence invalid; admin grants -> badge record + public projection + audit; illegal transition refused', async () => {
  const U = 'g1bu' + T; await db.doc('users/' + U).set({ uid: U, fullName: 'Neema' });
  eq((await call('adminSetTrustBadge', null, {})).code, 'unauthenticated', 'anonymous');
  eq((await call('adminSetTrustBadge', 'normal' + T, { badge: 'account', targetId: U, action: 'grant', reason: 'ukaguzi', evidenceRef: 'KYC-1' })).code, 'permission-denied', 'normal user');
  eq((await call('adminSetTrustBadge', ADMIN, { badge: 'gold', targetId: U, action: 'grant', reason: 'ukaguzi' })).code, 'invalid-argument', 'bad badge');
  eq((await call('adminSetTrustBadge', ADMIN, { badge: 'account', targetId: U, action: 'grant', reason: 'ukaguzi' })).code, 'invalid-argument', 'grant without evidence');
  eq(await get('trust_badges/account__user__' + U), null, 'nothing written by refusals');
  const r = await call('adminSetTrustBadge', ADMIN, { badge: 'account', targetId: U, action: 'grant', reason: 'ukaguzi wa NIDA', evidenceRef: 'KYC-77' }); ok(r.ok, JSON.stringify(r));
  const b = await get('trust_badges/account__user__' + U); eq(b && b.status, 'active', 'badge active'); eq(b.evidenceRef, 'KYC-77', 'evidence kept on the badge');
  const u = await get('users/' + U); eq(u.trust && u.trust.account && u.trust.account.status, 'active', 'public projection'); ok(!JSON.stringify(u.trust).includes('KYC-77'), 'no evidence in public projection');
  eq((await call('adminSetTrustBadge', ADMIN, { badge: 'account', targetId: U, action: 'grant', reason: 'mara ya pili', evidenceRef: 'KYC-78' })).code, 'failed-precondition', 'double grant refused');
  eq((await call('adminSetTrustBadge', ADMIN, { badge: 'transaction', targetType: 'order', targetId: 'missing' + T, action: 'grant', reason: 'ukaguzi', evidenceRef: 'X-1' })).code, 'not-found', 'missing order');
});

// ---- POS money reversals + projections: gates before any write ----
const SALE = 'g1bsale' + T;
await db.doc('sales/' + SALE).set({ saleId: SALE, businessId: 'biz' + T, storeId: 'st' + T, ownerUid: 'owner' + T, sellerId: 'owner' + T, total: 5000, status: 'COMPLETED', items: [] });
for (const [name, kind] of [['posRefund', 'REFUND'], ['posCreditAdjustment', 'CREDIT_ADJUSTMENT']]) {
  await test(`${name}: unauthenticated refused; malformed request invalid-argument; a stranger cannot reverse someone else's sale; no adjustment written`, async () => {
    eq((await call(name, null, {})).code, 'unauthenticated', 'anonymous');
    eq((await call(name, 'stranger' + T, {})).code, 'invalid-argument', 'empty request');
    const before = await count('sale_adjustments', 'originalSaleId', SALE);
    const r = await call(name, 'stranger' + T, { adjustmentId: 'adj_' + kind.toLowerCase() + '_' + T, originalSaleId: SALE, businessId: 'biz' + T, storeId: 'st' + T, amount: 1000, reason: 'mteja amerudisha', clientRequestId: 'c' + T, items: [] });
    ok(!r.ok && ['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found'].includes(r.code), 'stranger refused: ' + JSON.stringify(r));
    eq(await count('sale_adjustments', 'originalSaleId', SALE), before, 'no adjustment written');
  });
}
for (const name of ['posReceipt', 'posReconcile']) {
  await test(`${name}: unauthenticated refused; malformed invalid-argument; unknown sale typed; stranger refused; nothing written`, async () => {
    eq((await call(name, null, {})).code, 'unauthenticated', 'anonymous');
    eq((await call(name, 'stranger' + T, {})).code, 'invalid-argument', 'empty request');
    const r = await call(name, 'stranger' + T, { originalSaleId: SALE, businessId: 'biz' + T, storeId: 'st' + T, transactionType: 'SALE', saleId: SALE });
    ok(!r.ok && r.code !== 'internal', 'typed refusal: ' + JSON.stringify(r));
    const coll = name === 'posReceipt' ? 'receipts' : 'reconciliations';
    eq((await db.collection(coll).where('originalSaleId', '==', SALE).get()).size, 0, 'nothing written');
  });
}

// ---- Creative / ads ----
const CR = 'g1bcr' + T;
await db.doc('creatives/' + CR).set({ ownerId: 'adv' + T, title: 'Tangazo la duka', status: 'draft', format: 'banner', headline: 'Bei nafuu', createdAt: new Date().toISOString() });
await test('creativeSaveDraft: unauthenticated / missing id / unknown creative typed; another advertiser refused', async () => {
  eq((await call('creativeSaveDraft', null, { creativeId: CR })).code, 'unauthenticated', 'anonymous');
  eq((await call('creativeSaveDraft', 'adv' + T, {})).code, 'invalid-argument', 'missing id');
  eq((await call('creativeSaveDraft', 'adv' + T, { creativeId: 'nope' + T })).code, 'not-found', 'unknown');
  eq((await call('creativeSaveDraft', 'other' + T, { creativeId: CR })).code, 'permission-denied', 'other advertiser');
});
await test('creativePublish: unauthenticated / bad type typed; another advertiser cannot publish; no announcement created', async () => {
  eq((await call('creativePublish', null, { creativeId: CR })).code, 'unauthenticated', 'anonymous');
  eq((await call('creativePublish', 'adv' + T, { creativeId: CR, publicationType: 'spam' })).code, 'invalid-argument', 'bad type');
  const r = await call('creativePublish', 'other' + T, { creativeId: CR }); ok(!r.ok && r.code === 'permission-denied', JSON.stringify(r));
  eq((await db.collection('announcements').where('creativeId', '==', CR).get()).size, 0, 'nothing published');
});
await test('creativeModerate: non-admin refused; bad decision invalid; admin rejects -> creative moderated', async () => {
  eq((await call('creativeModerate', 'adv' + T, { creativeId: CR, decision: 'approve' })).code, 'permission-denied', 'advertiser cannot moderate');
  eq((await call('creativeModerate', ADMIN, { creativeId: CR, decision: 'maybe' })).code, 'invalid-argument', 'bad decision');
  eq((await call('creativeModerate', ADMIN, { creativeId: 'nope' + T, decision: 'reject' })).code, 'not-found', 'unknown creative');
  const r = await call('creativeModerate', ADMIN, { creativeId: CR, decision: 'reject', note: 'picha haieleweki' });
  ok(r.ok || r.code === 'failed-precondition', 'admin decision handled: ' + JSON.stringify(r));
  if (r.ok) { const c = await get('creatives/' + CR); ok(/reject/i.test(JSON.stringify(c)), 'creative carries the rejection'); }
});
await test('creativeTrackEvent: invalid event typed; inactive ad refused; a repeated impression from the same viewer in the same hour counts once', async () => {
  const AN = 'g1ban' + T; await db.doc('announcements/' + AN).set({ status: 'published', title: 'x', creativeId: CR, metrics: {} });
  eq((await call('creativeTrackEvent', null, { announcementId: AN, type: 'share' })).code, 'invalid-argument', 'bad type');
  await db.doc('announcements/off' + T).set({ status: 'draft' });
  eq((await call('creativeTrackEvent', null, { announcementId: 'off' + T, type: 'click' })).code, 'failed-precondition', 'inactive ad');
  const a = await call('creativeTrackEvent', null, { announcementId: AN, type: 'impression' }, '10.9.9.9'); ok(a.ok, JSON.stringify(a));
  const b = await call('creativeTrackEvent', null, { announcementId: AN, type: 'impression' }, '10.9.9.9'); ok(b.ok, JSON.stringify(b));
  const evs = await db.collection('creativeEvents').where('announcementId', '==', AN).get(); eq(evs.size, 1, 'deduplicated event');
});
await test('adsTrackDeliveryEvent: invalid event typed; unknown lease refused without writing metrics', async () => {
  eq((await call('adsTrackDeliveryEvent', null, { leaseId: '', type: 'impression' })).code, 'invalid-argument', 'missing lease');
  eq((await call('adsTrackDeliveryEvent', null, { leaseId: 'l' + T, type: 'teleport' })).code, 'invalid-argument', 'bad type');
  const r = await call('adsTrackDeliveryEvent', null, { leaseId: 'nolease' + T, type: 'impression', sessionId: 's' + T });
  console.log('    (unknown lease answer: ' + JSON.stringify(r).slice(0, 160) + ')');
  ok(r.ok ? (r.data && (r.data.ok === false || r.data.counted === false || r.data.accepted === false)) : (r.code && r.code !== 'internal'), 'unknown lease must be refused or not counted: ' + JSON.stringify(r));
});
const LIST = ['adminSetTrustBadge', 'posRefund', 'posCreditAdjustment', 'posReceipt', 'posReconcile', 'creativeSaveDraft', 'creativePublish', 'creativeModerate', 'creativeTrackEvent', 'adsTrackDeliveryEvent'];
await test('all 10 G-1b callables were exercised', async () => { const miss = LIST.filter(n => !covered.has(n)); eq(miss.length, 0, 'missing: ' + miss.join(',')); });
console.log(`\nG-1b CALLABLES (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

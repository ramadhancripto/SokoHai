#!/usr/bin/env node
/**
 * [REPAIR 2026-10 C4] Public user cards (functions/user-cards.js) against the
 * FIREBASE EMULATOR: the projection never carries private data, it follows
 * profile changes, and the backfill is Super Admin only + audited.
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_user_cards.mjs"
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
process.env.ADMIN_EMAILS = 'ops@sokohai.test';
process.env.SUPER_ADMIN_EMAILS = 'owner@sokohai.test';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const T = fns._userCardsForTest;
const admin = require('firebase-admin'); const db = admin.firestore();
let pass = 0, fail = 0; const fails = [];
async function test(n, fn) { try { await fn(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; fails.push(n + ': ' + e.message); console.log('  FAIL ' + n + '\n       ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error('assert: ' + m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const who = (uid, email) => ({ uid, token: { uid, email, email_verified: true } });
async function call(name, auth, data) {
  try { return { ok: true, data: await fns[name].run({ data, auth, rawRequest: { headers: {} } }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const PRIVATE = ['email', 'userEmail', 'phone', 'phoneNumber', 'walletBalance', 'cart', 'agentCode', 'myAgentCode', 'memberId',
  'pinHash', 'pinSalt', 'role', 'admin', 'isAdmin', 'superAdmin', 'following', 'followers', 'registeredThroughAgentId', 'createdByAgentId', 'shopOwnerUid', 'paymentAccounts'];
const buyer = { uid: 'b1', fullName: 'Asha Buyer', email: 'asha@x.tz', phone: '0711000000', walletBalance: 90000, cart: [{ id: 1 }],
  agentCode: 'AGT-1', myAgentCode: 'AGT-2', role: 'admin', isAdmin: true, following: ['s1'], memberId: 'SKH-1', pinHash: 'h', paymentAccounts: [{ msisdn: '0711' }] };
const seller = { uid: 's1', fullName: 'Juma', shopName: 'Juma Electronics', isSeller: true, phone: '0755000000', email: 'j@x.tz',
  walletBalance: 5, followers: ['b1', 'b2', 'b3'], rating: 4.5, region: 'Dar es Salaam', isApprovedAgent: true };

console.log('\n[Projection]');
await test('buyer card has no private field', async () => {
  const c = T.buildUserCard(buyer, 'b1');
  PRIVATE.forEach(k => assert(!(k in c), 'leaked ' + k));
  eq(c.fullName, 'Asha Buyer', 'name'); eq(c.uid, 'b1', 'uid'); assert(!('businessPhone' in c), 'buyer phone must not be public');
});
await test('seller card: business phone + follower count, no follower list', async () => {
  const c = T.buildUserCard(seller, 's1');
  eq(c.businessPhone, '0755000000', 'business phone'); eq(c.followersCount, 3, 'count');
  assert(!('followers' in c) && !('email' in c) && !('walletBalance' in c), 'private leaked');
  eq(c.shopName, 'Juma Electronics', 'shop'); eq(c.rating, 4.5, 'rating');
});
await test('agent badge only with a server approval stamp', async () => {
  assert(!('isApprovedAgent' in T.buildUserCard(seller, 's1')), 'unstamped flag must not show');
  eq(T.buildUserCard(Object.assign({}, seller, { agentApprovedBy: 'owner' }), 's1').isApprovedAgent, true, 'stamped');
});
await test('legacy doc id != uid keeps docId for follow writes', async () => {
  const c = T.buildUserCard({ uid: 'u9', fullName: 'X' }, 'legacyDoc123');
  eq(c.uid, 'u9', 'uid'); eq(c.docId, 'legacyDoc123', 'docId');
});

console.log('\n[Sync]');
await test('sync writes card on create and updates on change', async () => {
  await T.syncUserCard('s1', null, seller);
  let c = (await db.doc('userCards/s1').get()).data();
  eq(c.shopName, 'Juma Electronics', 'created');
  await T.syncUserCard('s1', seller, Object.assign({}, seller, { shopName: 'Juma Mobile' }));
  c = (await db.doc('userCards/s1').get()).data();
  eq(c.shopName, 'Juma Mobile', 'updated'); assert(!('email' in c), 'no email');
});
await test('sync deletes card when profile is deleted', async () => {
  await T.syncUserCard('s1', seller, null);
  assert(!(await db.doc('userCards/s1').get()).exists, 'card removed');
});
await test('trigger is exported for deploy', async () => { assert(fns.userCardSync && fns.adminBackfillUserCards, 'exports'); });
await test('trigger handler wiring (run with a users write event)', async () => {
  const snap = (data) => ({ exists: !!data, data: () => data });
  await fns.userCardSync.run({ params: { docId: 'w1' }, data: { before: snap(null), after: snap({ uid: 'w1', fullName: 'Wired', email: 'w@x' }) } });
  const c = (await db.doc('userCards/w1').get()).data() || {};
  eq(c.fullName, 'Wired', 'card via trigger'); assert(!('email' in c), 'no email');
});

console.log('\n[Backfill]');
await db.doc('users/b1').set(buyer); await db.doc('users/s1').set(seller); await db.doc('users/legacy7').set({ uid: 'u7', fullName: 'Old' });
await test('ordinary admin cannot backfill', async () => {
  const r = await call('adminBackfillUserCards', who('ops', 'ops@sokohai.test'), {}); eq(r.code, 'permission-denied', 'code');
});
await test('random user cannot backfill', async () => {
  const r = await call('adminBackfillUserCards', who('b1', 'asha@x.tz'), {}); eq(r.code, 'permission-denied', 'code');
});
await test('super admin backfills in pages and is audited', async () => {
  const r1 = await call('adminBackfillUserCards', who('owner', 'owner@sokohai.test'), { pageSize: 2 });
  assert(r1.ok, r1.message); eq(r1.data.written, 2, 'page 1'); assert(r1.data.next, 'has next page');
  const r2 = await call('adminBackfillUserCards', who('owner', 'owner@sokohai.test'), { pageSize: 2, startAfter: r1.data.next });
  assert(r2.ok && r2.data.done, 'page 2 done');
  for (const id of ['b1', 's1', 'u7']) assert((await db.doc('userCards/' + id).get()).exists, 'card ' + id);
  const a = await db.collection('admin_audit_log').where('action', '==', 'USER_CARDS_BACKFILL').get();
  eq(a.size, 2, 'two audit rows');
});

console.log('\n[Client]');
await test('no browser module reads another user from users/{id} for display', async () => {
  const dir = path.join(ROOT, 'js', 'app');
  const offenders = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      if (/getDoc\(\s*_?skh\.doc\(\s*_?skh\.db\s*,\s*['"]users['"]\s*,\s*(sellerId|sid|otherUid|u2|pu|tUid|transporterId|needs\[i\]|uids2\[i\]|pend\[i\]\.userId)\s*\)/.test(line)) offenders.push(f + ':' + (i + 1));
    });
  }
  eq(offenders.length, 0, 'offenders ' + offenders.join(', '));
  assert(/skh\.getUserCard = async function/.test(fs.readFileSync(path.join(dir, '00-bootstrap.js'), 'utf8')), 'helper defined');
});

console.log('\n[System settings audit]');
const SA = fns._systemAuditForTest;
await test('diff lists only changed keys, ignores stamp fields', async () => {
  const ch = SA.diffConfig({ fees: { boost: false, deposit: true }, modes: { auction: true }, lastChangedAt: 'a' }, { fees: { boost: true, deposit: true }, modes: { auction: true }, lastChangedAt: 'b', lastChangedBy: 'boss' });
  eq(ch.length, 1, 'one change'); eq(ch[0].key, 'fees.boost', 'key'); eq(ch[0].after, true, 'after');
});
await test('browser change is written to admin_audit_log with the author', async () => {
  await SA.auditSystemChange('config', { fees: { boost: false } }, { fees: { boost: true }, lastChangedBy: 'boss', lastChangedVia: 'browser', lastChangedAt: 'x' });
  const q = await db.collection('admin_audit_log').where('action', '==', 'SYSTEM_CONFIG_CHANGED').get();
  eq(q.size, 1, 'one row'); const r = q.docs[0].data(); eq(r.actorUid, 'boss', 'actor'); eq(r.details.changes[0].key, 'fees.boost', 'key');
});
await test('callable policy writes are not double-logged; no-op writes ignored', async () => {
  const a = await SA.auditSystemChange('config', { escrow: {} , lastChangedAt: '1' }, { escrow: { autoReleaseAfterDeliveryHours: 48 }, lastChangedVia: 'adminSetEscrowPolicy', lastChangedAt: '2' });
  eq(a.skipped, 'audited_by_callable', 'skip callable');
  const b = await SA.auditSystemChange('config', { fees: { boost: true } }, { fees: { boost: true }, lastChangedAt: '3', lastChangedBy: 'boss' });
  eq(b.skipped, 'no_changes', 'skip no-op');
});
await test('announcement browser edit is logged with author; server metric writes are not', async () => {
  const r1 = await SA.auditStampedChange('announcements', 'a1', { title: 'A', lastChangedAt: '1' }, { title: 'B', lastChangedAt: '2', lastChangedBy: 'ops' });
  assert(r1.ok, 'logged');
  const r2 = await SA.auditStampedChange('announcements', 'a1', { impressions: 1, lastChangedAt: '2' }, { impressions: 2, lastChangedAt: '2' });
  eq(r2.skipped, 'not_a_browser_admin_write', 'server write skipped');
  const r3 = await SA.auditStampedChange('adminMedia', 'm1', { url: 'u', lastChangedBy: 'ops' }, null);
  assert(r3.ok, 'delete logged');
  const q = await db.collection('admin_audit_log').where('target.kind', 'in', ['announcements', 'adminMedia']).get();
  eq(q.size, 2, 'two rows'); assert(q.docs.some(d => d.data().actorUid === 'ops'), 'author');
});
// [PHASE 9 B-18] signed admin edits on orders/products/users
await test('admin signed edit of another seller product is logged; owner edits and unsigned writes are not', async () => {
  const a = await SA.auditAdminSignedChange('products', 'p9', { userId: 'bob', title: 'A', lastChangedAt: '1' }, { userId: 'bob', title: 'B', lastChangedAt: '2', lastChangedBy: 'ops' });
  assert(a.ok, 'admin edit logged');
  const b = await SA.auditAdminSignedChange('products', 'p9', { userId: 'bob', title: 'B' }, { userId: 'bob', title: 'C', lastChangedAt: '3', lastChangedBy: 'bob' });
  eq(b.skipped, 'owner_edit', 'owner self-stamp skipped');
  const c = await SA.auditAdminSignedChange('products', 'p9', { userId: 'bob', stock: 1, lastChangedAt: '3' }, { userId: 'bob', stock: 0, lastChangedAt: '3', lastChangedBy: 'ops' });
  eq(c.skipped, 'not_signed', 'server write without new stamp skipped');
  const d = await SA.auditAdminSignedChange('orders', 'o9', { status: 'held' }, { status: 'shipped', lastChangedAt: '4', lastChangedBy: 'ops' });
  assert(d.ok, 'order edit logged');
  const e = await SA.auditAdminSignedChange('users', 'u9', { uid: 'u9', fullName: 'X' }, { uid: 'u9', fullName: 'Y', lastChangedAt: '5', lastChangedBy: 'ops' });
  assert(e.ok, 'user edit logged');
  const q = await db.collection('admin_audit_log').where('action', 'in', ['PRODUCT_CHANGED_BY_ADMIN', 'ORDER_CHANGED_BY_ADMIN', 'USER_CHANGED_BY_ADMIN']).get();
  eq(q.size, 3, 'three rows'); assert(q.docs.every(x => x.data().actorUid === 'ops'), 'author recorded');
});
await test('triggers exported for deploy', async () => { assert(fns.systemConfigAudit && fns.announcementsAudit && fns.adminMediaAudit && fns.ordersAdminAudit && fns.productsAdminAudit && fns.usersAdminAudit, 'export'); });

console.log(`\nUSER CARDS + SYSTEM AUDIT: ${pass} passed, ${fail} failed`);
if (fail) { console.log(' - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);

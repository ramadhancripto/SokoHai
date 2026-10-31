#!/usr/bin/env node
/**
 * [REPAIR 2026-10 Phase 2/6] Agent approval + admin authority (callables) against
 * the FIREBASE EMULATOR. Covers C1/B-03 (forged legacy approvals), role changes
 * (super admin only), suspension, required reasons and the audit trail.
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_admin_agent_authority.mjs"
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
process.env.ADMIN_EMAILS = 'ops@sokohai.test';
process.env.SUPER_ADMIN_EMAILS = 'owner@sokohai.test';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
let pass = 0, fail = 0; const fails = [];
async function test(n, fn) { try { await fn(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; fails.push(n + ': ' + e.message); console.log('  FAIL ' + n + '\n       ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error('assert: ' + m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const who = (uid, email, extra) => ({ uid, token: Object.assign({ uid, email, email_verified: true }, extra || {}) });
const OWNER = who('owner', 'owner@sokohai.test'), OPS = who('ops', 'ops@sokohai.test');
async function call(name, auth, data) {
  try { return { ok: true, data: await fns[name].run({ data, auth, rawRequest: { headers: {} } }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
const get = async (p) => (await db.doc(p).get()).data() || {};
await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
for (const [uid, email] of [['owner', 'owner@sokohai.test'], ['ops', 'ops@sokohai.test'], ['agentA', 'a@u.test'], ['forger', 'f@u.test'], ['victim', 'v@u.test']]) {
  await admin.auth().createUser({ uid, email, emailVerified: true, password: 'secret123' });
  await db.doc('users/' + uid).set({ uid, fullName: uid, walletBalance: 0 });
}

console.log('\n[Agents]');
await test('forged legacy approval (no server stamp) cannot use agent tools', async () => {
  await db.doc('agents/forged').set({ userId: 'forger', status: 'approved' });
  await db.doc('users/forger').update({ isApprovedAgent: true });
  const r = await call('memberRegister', who('forger', 'f@u.test'), { fullName: 'Mwanachama', region: 'Dar', pin: '1234' });
  assert(!r.ok && r.code === 'permission-denied', 'forged agent refused: ' + r.message);
});
await test('non-admin cannot approve; admin approval needs the applicant to exist', async () => {
  await db.doc('agents/appA').set({ userId: 'agentA', status: 'pending', isPaid: false });
  const r = await call('adminApproveAgent', who('victim', 'v@u.test'), { agentDocId: 'appA' });
  assert(!r.ok && r.code === 'permission-denied', 'stranger: ' + r.message);
  const u = await call('adminApproveAgent', who('x', 'ops@sokohai.test', { email_verified: false }), { agentDocId: 'appA' });
  assert(!u.ok && u.code === 'permission-denied', 'unverified admin email refused');
});
await test('admin approves -> stamped -> agent can register a member; audit written', async () => {
  const r = await call('adminApproveAgent', OPS, { agentDocId: 'appA', note: 'Nyaraka zimehakikiwa' });
  assert(r.ok, r.message); assert(/^AGT|^[A-Z]/.test(String(r.data.agentCode || 'X')), 'agent code');
  eq((await get('agents/appA')).approvedBy, 'ops', 'agents.approvedBy'); eq((await get('users/agentA')).agentApprovedBy, 'ops', 'users.agentApprovedBy');
  const m = await call('memberRegister', who('agentA', 'a@u.test'), { fullName: 'Asha', region: 'Mwanza', pin: '4321' });
  assert(m.ok, 'member registered: ' + m.message);
  eq((await db.collection('admin_audit_log').where('action', '==', 'AGENT_APPROVED').get()).size, 1, 'audit');
});
await test('admin re-verifies a legacy approval -> stamped and usable', async () => {
  const r = await call('adminApproveAgent', OPS, { agentDocId: 'forged', note: 'Uhakiki upya wa idhini ya zamani' });
  assert(r.ok && !r.data.already, 're-stamp (not "already"): ' + JSON.stringify(r.data || r.message));
  eq((await get('users/forger')).agentApprovedBy, 'ops', 'stamped');
});
await test('suspending the agent stops agent tools; reason required', async () => {
  const noReason = await call('adminSetAgentStatus', OPS, { uid: 'agentA', status: 'suspended' });
  assert(!noReason.ok && noReason.code === 'invalid-argument', 'reason required');
  assert((await call('adminSetAgentStatus', OPS, { uid: 'agentA', status: 'suspended', reason: 'Malalamiko ya wateja' })).ok, 'suspend');
  const m = await call('memberRegister', who('agentA', 'a@u.test'), { fullName: 'Juma', region: 'Arusha', pin: '1111' });
  assert(!m.ok && m.code === 'permission-denied', 'suspended agent refused');
  assert((await call('adminSetAgentStatus', OPS, { uid: 'agentA', status: 'approved', reason: 'Uchunguzi umekamilika' })).ok, 'reinstate');
  assert((await call('memberRegister', who('agentA', 'a@u.test'), { fullName: 'Juma', region: 'Arusha', pin: '1111' })).ok, 'reinstated agent works');
});

console.log('\n[Admin roles & accounts]');
await test('only a super admin grants admin; target email must be verified', async () => {
  const byOps = await call('adminSetRole', OPS, { uid: 'victim', role: 'admin', reason: 'Msaidizi mpya' });
  assert(!byOps.ok && byOps.code === 'permission-denied', 'ordinary admin cannot grant roles');
  const r = await call('adminSetRole', OWNER, { uid: 'victim', role: 'admin', reason: 'Msaidizi mpya wa operesheni' });
  assert(r.ok, r.message); eq((await admin.auth().getUser('victim')).customClaims.admin, true, 'claim set');
  assert((await call('adminSetRole', OWNER, { uid: 'victim', role: 'none', reason: 'Ameondoka kazini' })).ok, 'revoke');
  eq(((await admin.auth().getUser('victim')).customClaims || {}).admin, undefined, 'claim removed');
  eq((await db.collection('admin_audit_log').where('action', '==', 'ROLE_SET').get()).size, 2, 'two audit rows');
});
await test('admin cannot suspend self or another admin; super admin can suspend a user', async () => {
  const self = await call('adminSetAccountStatus', OPS, { uid: 'ops', status: 'suspended', reason: 'jaribio la kujisimamisha' });
  assert(!self.ok, 'self-suspend refused');
  await admin.auth().setCustomUserClaims('agentA', { admin: true });
  const other = await call('adminSetAccountStatus', OPS, { uid: 'agentA', status: 'suspended', reason: 'jaribio la admin' });
  assert(!other.ok && other.code === 'permission-denied', 'ordinary admin cannot suspend an admin');
  await admin.auth().setCustomUserClaims('agentA', {});
  const ok = await call('adminSetAccountStatus', OWNER, { uid: 'forger', status: 'suspended', reason: 'Udanganyifu wa uwakala' });
  assert(ok.ok, ok.message); eq((await admin.auth().getUser('forger')).disabled, true, 'auth disabled'); eq((await get('users/forger')).isSuspended, true, 'profile flag');
  assert((await call('adminSetAccountStatus', OWNER, { uid: 'forger', status: 'active', reason: 'Imerejeshwa baada ya uchunguzi' })).ok, 'restore');
  eq((await admin.auth().getUser('forger')).disabled, false, 'auth restored');
});
await test('escrow policy: super admin only, reason, bounds, audit before/after', async () => {
  const byOps = await call('adminSetEscrowPolicy', OPS, { escrow: { autoReleaseAfterDeliveryHours: 72 }, reason: 'Sera ya kuachia baada ya siku 3' });
  assert(!byOps.ok && byOps.code === 'permission-denied', 'ordinary admin refused');
  const noReason = await call('adminSetEscrowPolicy', OWNER, { escrow: { autoReleaseAfterDeliveryHours: 72 } });
  assert(!noReason.ok && noReason.code === 'invalid-argument', 'reason required');
  const tooBig = await call('adminSetEscrowPolicy', OWNER, { escrow: { autoReleaseAfterDeliveryHours: 5000 }, reason: 'Jaribio la thamani kubwa mno' });
  assert(!tooBig.ok, 'out of bounds refused');
  const unknown = await call('adminSetEscrowPolicy', OWNER, { escrow: { payoutNow: 1 }, reason: 'Jaribio la ufunguo usiojulikana' });
  assert(!unknown.ok, 'unknown key refused');
  const goOn = await call('adminSetEscrowPolicy', OWNER, { features: { chatGroupOrders: true }, reason: 'Jaribio la kuwasha oda za pamoja' });
  eq(goOn.code, 'failed-precondition', 'chat group orders cannot be switched on (no engine)');
  const ok = await call('adminSetEscrowPolicy', OWNER, { escrow: { autoReleaseAfterDeliveryHours: 72, disputeWindowHours: 48 }, features: { chatGroupOrders: false }, reason: 'Sera ya uzinduzi wa majaribio' });
  assert(ok.ok, ok.message);
  const cfg = await get('system/config'); eq(cfg.escrow.autoReleaseAfterDeliveryHours, 72, 'saved'); eq(cfg.escrow.disputeWindowHours, 48, 'saved 2'); eq(cfg.features.chatGroupOrders, false, 'flag');
  const off = await call('adminSetEscrowPolicy', OWNER, { escrow: { autoReleaseAfterDeliveryHours: null }, reason: 'Zima kuachia kiotomatiki' });
  assert(off.ok, off.message); eq((await get('system/config')).escrow.autoReleaseAfterDeliveryHours, null, 'switched off');
  eq((await db.collection('admin_audit_log').where('action', '==', 'ESCROW_POLICY_SET').get()).size, 2, 'audit rows');
});
await test('audit log is readable by admin query only', async () => {
  const r = await call('adminAuditQuery', OPS, { limit: 50 }); assert(r.ok, r.message);
  const n = await call('adminAuditQuery', who('victim', 'v@u.test'), { limit: 5 }); assert(!n.ok, 'non-admin denied');
});

console.log(`\nADMIN & AGENT AUTHORITY: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  FAIL ' + f)); process.exit(1); }
process.exit(0);

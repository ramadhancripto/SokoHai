#!/usr/bin/env node
/* [G-6 / SRV-09 2026-11-20] One administrator policy (functions/authz.js) applied in every module that grants admin
 * powers. Six identities x (the policy itself + one real admin-only callable per module). An admin identity must get
 * past the authorisation gate (any answer except permission-denied/unauthenticated); every other identity must be
 * refused and leave no write behind. No hard-coded address may grant anything.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_admin_authz_matrix_emulator.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator inahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
process.env.SUPER_ADMIN_EMAILS = 'boss@sokohai.test'; process.env.ADMIN_EMAILS = 'staff-admin@sokohai.test';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const authz = require(path.join(ROOT, 'functions', 'authz.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const ok = (c, m) => { if (!c) throw new Error(m); };
const T = Date.now().toString(36);
const ID = {
  claimSuperAdmin: { uid: 'csa' + T, token: { superAdmin: true }, admin: true },
  verifiedSuperEmail: { uid: 'vse' + T, token: { email: 'boss@sokohai.test', email_verified: true }, admin: true },
  verifiedAdminEmail: { uid: 'vae' + T, token: { email: 'staff-admin@sokohai.test', email_verified: true }, admin: true },
  unverifiedSameEmail: { uid: 'use' + T, token: { email: 'boss@sokohai.test', email_verified: false }, admin: false },
  normalUser: { uid: 'nu' + T, token: { email: 'nu@x.test', email_verified: true }, admin: false },
  insufficientRole: { uid: 'ir' + T, token: { role: 'seller', agent: true, email: 'seller@x.test', email_verified: true }, admin: false },
  unauthenticated: { uid: null, admin: false }
};
async function run(name, who, data) {
  const auth = who.uid ? { uid: who.uid, token: Object.assign({ uid: who.uid }, who.token) } : null;
  try { await fns[name].run({ data: data || {}, auth, rawRequest: { headers: {} }, acceptsStreaming: false }); return 'ok'; }
  catch (e) { return e.code; }
}
const DENIED = new Set(['permission-denied', 'unauthenticated']);

await test('policy: claim / verified super e-mail / verified ADMIN_EMAILS are admin; unverified same e-mail, normal user, seller/agent role, anonymous are not', async () => {
  for (const [k, v] of Object.entries(ID)) {
    const req = { auth: v.uid ? { uid: v.uid, token: Object.assign({ uid: v.uid }, v.token) } : null };
    ok(authz.isAdmin(req) === v.admin, k + ' isAdmin=' + authz.isAdmin(req));
  }
  ok(authz.isSuperAdmin({ auth: { uid: 'a', token: { email: 'boss@sokohai.test', email_verified: true } } }), 'super by e-mail');
  ok(!authz.isSuperAdmin({ auth: { uid: 'a', token: { email: 'staff-admin@sokohai.test', email_verified: true } } }), 'ADMIN_EMAILS is not super while SUPER_ADMIN_EMAILS is set');
  ok(authz.isAdmin({ uid: 'x', token: { admin: true } }) && authz.isAdmin({ admin: true, uid: 'x' }), 'auth object and bare token forms');
});
await test('no personal / hard-coded e-mail grants admin anywhere in functions/ (source scan + behaviour)', async () => {
  const files = fs.readdirSync(path.join(ROOT, 'functions')).filter(f => f.endsWith('.js') && f !== 'local-server.js');
  const hits = files.filter(f => /['"][A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook)\.com['"]/.test(fs.readFileSync(path.join(ROOT, 'functions', f), 'utf8')));
  ok(hits.length === 0, 'hard-coded addresses in ' + hits.join(','));
  ok(!authz.isAdmin({ auth: { uid: 'z', token: { email: 'someone@gmail.com', email_verified: true } } }), 'random verified gmail is not admin');
});

const S = 'st' + T; await db.doc('stories/' + S).set({ authorUid: 'author' + T, status: 'active', expiresAt: new Date(Date.now() + 3600e3).toISOString() });
const C = 'cm' + T; await db.doc('comments/' + C).set({ text: 'x', userId: 'author' + T, moderationStatus: 'visible' });
// one admin-only gate per module; payloads are deliberately incomplete so an admin stops at validation (no writes)
const GATES = [
  ['admin-authority.js', 'adminAuditQuery', { limit: 1 }],
  ['index.js', 'withdrawalResolve', {}],
  ['index.js (commentsModerate)', 'commentsModerate', { commentId: C, action: 'nope' }],
  ['creative.js', 'creativeModerationQueue', { limit: 1 }],
  ['ads-delivery.js', 'adsUpdateCampaignDelivery', {}],
  ['live-commerce.js', 'adminLiveRemove', { sessionId: 'missing' + T }],
  ['stories.js', 'storyRemove', { storyId: S }],
  ['inventory-reservation.js', 'inventoryReconcile', { sellerId: 'someoneElse' + T }],
  ['pilot-ops.js', 'adminMoneyWatch', {}],
  ['setup-status.js', 'adminSetupStatus', {}]
];
for (const [mod, fn, data] of GATES) {
  await test(`${mod} ${fn}: admins pass the gate, everyone else is refused`, async () => {
    const out = {};
    for (const [k, v] of Object.entries(ID)) out[k] = await run(fn, v, data);
    for (const [k, v] of Object.entries(ID)) {
      if (v.admin) ok(!DENIED.has(out[k]), `${k} wrongly refused (${out[k]})`);
      else ok(DENIED.has(out[k]), `${k} NOT refused (${out[k]})`);
    }
  });
}
await test('refusals leave no trace: story still active, comment still visible', async () => {
  ok((await db.doc('stories/' + S).get()).data().status === 'active', 'story untouched (admin stopped at missing reason)');
  ok((await db.doc('comments/' + C).get()).data().moderationStatus === 'visible', 'comment untouched');
});
console.log(`\nADMIN AUTHZ MATRIX (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

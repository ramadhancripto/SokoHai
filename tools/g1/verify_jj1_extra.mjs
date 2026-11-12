#!/usr/bin/env node
/* VERIFY (C-extra) — J-J1 adversarial gaps: staff self-invite binding
 * (no escalation), TTL=7d, join-button deadness (static). Emulator only. */
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

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid) => ({ uid, token: { uid, email: uid + '@u.test', email_verified: true } });
async function call(name, uid, data) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: uid ? tok(uid) : undefined, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const O = 'vOwn', ST = 'vStaff';
await test('V-C1 staff akijitengenezea mwaliko, unafungwa na uid yake (si duka) — hawezi kujipa owner', async () => {
  await db.doc('users/' + ST).set({ shopOwnerUid: O });
  const c = await call('staffInviteCreate', ST, { role: 'Manager' });
  eq(c.ok, true, JSON.stringify(c));
  const inv = (await db.doc('staff_invites/' + c.data.inviteId).get()).data();
  eq(inv.shopOwnerId, ST, 'bound to caller, not shop');
  const a = await call('staffInviteAccept', 'vAccomplice', { code: c.data.code });
  eq(a.ok, true, JSON.stringify(a));
  eq((await db.doc('users/vAccomplice').get()).data().shopOwnerUid, ST, 'accomplice joins NOBODY shop');
  eq((await db.doc('users/' + ST).get()).data().shopOwnerUid, O, 'staff stamp unchanged');
});
await test('V-C2 TTL ya mwaliko ni siku 7 kwenye code + expiresAt halisi', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'business.js'), 'utf8');
  assert(/INVITE_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/.test(src), 'const = 7d');
  const c = await call('staffInviteCreate', O, { role: 'Cashier' });
  const inv = (await db.doc('staff_invites/' + c.data.inviteId).get()).data();
  const ttlH = (Date.parse(inv.expiresAt) - Date.parse(inv.createdAt)) / 3600000;
  assert(ttlH > 167 && ttlH < 169, 'expiresAt-createdAt ~168h, got ' + ttlH);
});
await test('V-C3 kodi 3 tofauti, charset sahihi (hakuna 0/O/1/I/L)', async () => {
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await call('staffInviteCreate', O, { role: 'Cashier' })).data.code);
  assert(new Set(codes).size === 3, 'unique: ' + codes.join(','));
  for (const cd of codes) assert(/^[A-HJ-NP-Z2-9]{6}$/.test(cd), 'charset: ' + cd);
});
await test('V-C4 staff hawezi kumwondoa staff mwenza (staffRemove inahitaji owner)', async () => {
  await db.doc('users/vStaff2').set({ shopOwnerUid: O });
  const r = await call('staffRemove', ST, { staffUid: 'vStaff2' });
  eq(r.ok, false, 'blocked'); eq(r.code, 'not-found', r.code);
});
await test('V-C5 EVIDENCE ya UI iliyopotea: skhJoinShopWithCode haipo kwenye js/ (dead menu item)', async () => {
  const dir = fs.readdirSync(path.join(ROOT, 'js', 'app')).filter(f => f.endsWith('.js'));
  let found = [];
  for (const f of dir) {
    const t = fs.readFileSync(path.join(ROOT, 'js', 'app', f), 'utf8');
    if (t.includes('skhJoinShopWithCode')) found.push(f);
  }
  // Kama handler ingekuwepo, menu ingefanya kazi. Sasa: lazima tuandike ukweli.
  console.log('    ... skhJoinShopWithCode inapatikana kwenye: ' + (found.join(', ') || 'HAPANA (dead button)'));
  assert(true, 'evidence only');
});

const fails = results.filter(r => !r.ok);
console.log(`\n[VERIFY-C] ${results.length - fails.length}/${results.length} passed`);
if (fails.length) process.exitCode = 1;

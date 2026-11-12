#!/usr/bin/env node
/* PHASE H — storyReact (ilikuwa NONE kwenye coverage): toggle on/off, expiry, auth. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!FS_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai-g1';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
let F = 0;
async function test(n, fn) { try { await fn(); console.log('  PASS ' + n); } catch (e) { F++; console.log('  FAIL ' + n + ': ' + e.message); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); };
async function call(uid, data) {
  try { const r = await fns.storyReact.run({ data, auth: uid ? { uid, token: { uid } } : undefined }); return { ok: true, data: r }; }
  catch (e) { return { ok: false, code: e.code, msg: e.message }; }
}
await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
await db.doc('stories/ST-H1').set({ status: 'active', expiresAt: future, reactCount: 0 });
await db.doc('stories/ST-H2').set({ status: 'active', expiresAt: past, reactCount: 0 });
await test('H-R1 react ON -> count 1', async () => {
  const r = await call('hu1', { storyId: 'ST-H1' });
  eq(r.ok, true, JSON.stringify(r)); eq(r.data.on, true, 'on'); eq(r.data.count, 1, 'count');
});
await test('H-R2 react OFF (toggle) -> count 0', async () => {
  const r = await call('hu1', { storyId: 'ST-H1' });
  eq(r.ok, true, JSON.stringify(r)); eq(r.data.on, false, 'on'); eq(r.data.count, 0, 'count');
});
await test('H-R3 story iliyoisha -> failed-precondition', async () => {
  const r = await call('hu1', { storyId: 'ST-H2' });
  eq(r.ok, false, 'must fail'); eq(r.code, 'failed-precondition', r.code);
});
await test('H-R4 story haipo -> not-found', async () => {
  const r = await call('hu1', { storyId: 'ST-NOPE' });
  eq(r.ok, false, 'must fail'); eq(r.code, 'not-found', r.code);
});
await test('H-R5 anon -> unauthenticated', async () => {
  const r = await call(null, { storyId: 'ST-H1' });
  eq(r.ok, false, 'must fail'); eq(r.code, 'unauthenticated', r.code);
});
console.log(F ? 'STORYREACT: FAILURES' : 'STORYREACT: 5 passed, 0 failed');
process.exit(F ? 1 : 0);

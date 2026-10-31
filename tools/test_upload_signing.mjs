#!/usr/bin/env node
/**
 * [REPAIR 2026-10 H7] Signed Cloudinary uploads (functions/upload-signing.js)
 * against the FIREBASE EMULATOR (quota + suspended accounts use Firestore).
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_upload_signing.mjs"
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
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const T = fns._uploadSigningForTest;
const admin = require('firebase-admin'); const db = admin.firestore();
let pass = 0, fail = 0; const fails = [];
async function test(n, fn) { try { await fn(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; fails.push(n + ': ' + e.message); console.log('  FAIL ' + n + '\n       ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error('assert: ' + m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const who = (uid) => ({ uid, token: { uid, email: uid + '@x.tz', email_verified: true } });
async function call(auth, data) {
  try { return { ok: true, data: await fns.uploadSignature.run({ data, auth, rawRequest: { headers: {} } }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
const ENV = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_SIGNED_PRESET', 'CLOUDINARY_UPLOAD_MODE', 'UPLOAD_MAX_PER_HOUR'];
const setEnv = (o) => { ENV.forEach(k => delete process.env[k]); Object.assign(process.env, o); };

console.log('\n[Signature]');
await test('matches Cloudinary documented example', async () => {
  eq(T.signParams({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 }, 'abcd'), 'bfd09f95f331f558cbd1320e67aa8d488770583e', 'sha1');
});
await test('folder is server-chosen and cannot escape', async () => {
  eq(T.areaOf('sokohai/agents'), 'agents', 'area'); eq(T.areaOf('../../other-account'), 'other-account', 'no traversal'); eq(T.areaOf(''), 'general', 'default');
});

console.log('\n[Callable]');
await test('login required', async () => { setEnv({}); const r = await call(null, {}); eq(r.code, 'unauthenticated', 'code'); });
await test('transition mode without config -> unsigned fallback', async () => {
  setEnv({}); const r = await call(who('u1'), {}); assert(r.ok, r.message); eq(r.data.mode, 'unsigned', 'mode');
});
await test('signed mode without config -> refused (no silent unsigned upload)', async () => {
  setEnv({ CLOUDINARY_UPLOAD_MODE: 'signed' }); const r = await call(who('u1'), {}); eq(r.code, 'failed-precondition', 'code');
});
const CONF = { CLOUDINARY_CLOUD_NAME: 'democloud', CLOUDINARY_API_KEY: '1234', CLOUDINARY_API_SECRET: 'test-secret', CLOUDINARY_SIGNED_PRESET: 'sokohai_signed', CLOUDINARY_UPLOAD_MODE: 'signed', UPLOAD_MAX_PER_HOUR: '3' };
await test('signed response: per-user folder, valid signature, secret never returned', async () => {
  setEnv(CONF); await db.doc('upload_quota/u2').delete().catch(() => {});
  const r = await call(who('u2'), { folder: 'sokohai/products', resourceType: 'image' });
  assert(r.ok, r.message); eq(r.data.mode, 'signed', 'mode'); eq(r.data.folder, 'sokohai/products/u2', 'folder');
  // [PHASE 9] allowed_formats is part of the signature
  eq(r.data.signature, T.signParams({ allowed_formats: r.data.allowedFormats, folder: r.data.folder, timestamp: r.data.timestamp, upload_preset: 'sokohai_signed' }, 'test-secret'), 'signature');
  assert(r.data.allowedFormats.split(',').includes('jpg') && !r.data.allowedFormats.includes('pdf') && !r.data.allowedFormats.includes('svg'), 'image formats only');
  assert(!JSON.stringify(r.data).includes('test-secret'), 'secret leaked');
});
await test('hourly quota per user', async () => {
  setEnv(CONF); await db.doc('upload_quota/u3').delete().catch(() => {});
  for (let i = 0; i < 3; i++) assert((await call(who('u3'), {})).ok, 'within quota ' + i);
  eq((await call(who('u3'), {})).code, 'resource-exhausted', 'over quota');
  assert((await call(who('u4'), {})).ok, 'other user unaffected');
});
await test('suspended account cannot upload', async () => {
  setEnv(CONF); await db.doc('users/bad').set({ uid: 'bad', accountStatus: 'suspended' });
  eq((await call(who('bad'), {})).code, 'permission-denied', 'code');
});
await test('raw files not signable (only image/video/auto)', async () => {
  setEnv(CONF); await db.doc('upload_quota/u5').delete().catch(() => {});
  const r = await call(who('u5'), { resourceType: 'raw' }); eq(r.data.resourceType, 'image', 'coerced');
});

await test('[PHASE 9] formats per resource: video=audio/video only, auto=+documents, svg only for creative library', async () => {
  const v = T.allowedFormats('video', 'maoni'); assert(v.includes('mp4') && v.includes('m4a') && !v.includes('jpg') && !v.includes('pdf'), 'video');
  const a = T.allowedFormats('auto', 'printing-jobs'); assert(a.includes('pdf') && a.includes('docx') && a.includes('jpg') && !a.includes('svg') && !a.includes('exe') && !a.includes('html'), 'auto');
  assert(T.allowedFormats('image', 'creative-assets').includes('svg') && !T.allowedFormats('image', 'products').includes('svg'), 'svg scope');
  setEnv(CONF); await db.doc('upload_quota/u6').delete().catch(() => {});
  const r = await call(who('u6'), { resourceType: 'video', folder: 'sokohai/maoni' }); eq(r.data.resourceType, 'video', 'type'); assert(r.data.allowedFormats.includes('webm'), 'returned');
});

console.log('\n[Browser]');
await test('browser module has no Cloudinary secret and uses the signature', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', '11-uploads.js'), 'utf8');
  assert(/skhUploadSignature\(resource, opts\.folder\)/.test(src), 'calls signature');
  assert(!/api_secret|API_SECRET/.test(src), 'no secret in browser');
  assert(/fd\.append\('signature', sig\.signature\)/.test(src), 'sends signature');
  assert(/fd\.append\('allowed_formats', sig\.allowedFormats\)/.test(src) && /resource = sig\.resourceType/.test(src), 'sends signed formats + server resource type');
});
setEnv({});
console.log(`\nUPLOAD SIGNING: ${pass} passed, ${fail} failed`);
if (fail) { console.log(' - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);

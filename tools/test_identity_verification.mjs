#!/usr/bin/env node
/* [R16] Identity verification — emulator test (callables + rules). Cloudinary values are FAKE test values.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_identity_verification.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_SIGNED_PRESET']) delete process.env[k];
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const ver = require(path.join(ROOT, 'functions', 'verification.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
async function call(name, uid, data, extra) {
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: { uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) }, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const ADM = { admin: true };
const su = async (email) => { const j = await (await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) })).json(); return { uid: j.localId, tok: j.idToken }; };
const T = Date.now().toString(36);
const U = await su('idv' + T + '@rules.test'), O = await su('idvo' + T + '@rules.test');
await db.doc('users/' + U.uid).set({ fullName: 'Mtumiaji Idv' });
const doc = (uid, n) => ({ publicId: 'sokohai/identity/' + uid + '/id_' + (n || 1), format: 'jpg', version: '1700000000', side: 'front' });

await test('identity uploads are refused while signed Cloudinary is not configured (no public fallback)', async () => {
  const r = await call('uploadSignature', U.uid, { resourceType: 'image', folder: 'identity' });
  eq(r.ok, false, 'refused'); ok(/upakiaji_salama/.test(r.message), r.message);
  const normal = await call('uploadSignature', U.uid, { resourceType: 'image', folder: 'products' }); ok(normal.ok && normal.data.mode === 'unsigned', 'other areas unchanged');
});
await test('configured: identity signature is image-only and type=authenticated (private)', async () => {
  Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'demo-test', CLOUDINARY_API_KEY: 'k-test', CLOUDINARY_API_SECRET: 'not-a-real-secret', CLOUDINARY_SIGNED_PRESET: 'p-test' });
  const r = await call('uploadSignature', U.uid, { resourceType: 'auto', folder: 'identity' });
  ok(r.ok, JSON.stringify(r)); eq(r.data.type, 'authenticated', 'type'); eq(r.data.resourceType, 'image', 'image only'); eq(r.data.folder, 'sokohai/identity/' + U.uid, 'folder'); ok(!/pdf|mp4/.test(r.data.allowedFormats), r.data.allowedFormats);
});
await test('submit validation: doc type, last 4 only, documents must be in the caller\'s own private folder', async () => {
  eq((await call('verificationSubmit', U.uid, { docType: 'x', last4: '1234', docs: [doc(U.uid)] })).code, 'invalid-argument', 'type');
  eq((await call('verificationSubmit', U.uid, { docType: 'national_id', last4: '12', docs: [doc(U.uid)] })).code, 'invalid-argument', 'last4');
  eq((await call('verificationSubmit', U.uid, { docType: 'national_id', last4: '1234', docs: [doc(O.uid)] })).code, 'invalid-argument', 'someone elses document');
  eq((await call('verificationSubmit', U.uid, { docType: 'national_id', last4: '1234', docs: [] })).code, 'invalid-argument', 'no docs');
});
await test('submit -> pending; only last 4 stored; second submit while pending refused', async () => {
  const r = await call('verificationSubmit', U.uid, { docType: 'national_id', last4: '19a7', docs: [doc(U.uid)], note: 'NIDA' }); ok(r.ok, JSON.stringify(r));
  const v = (await db.doc('verification_requests/' + U.uid).get()).data(); eq(v.status, 'pending', 'pending'); eq(v.last4, '19A7', 'last4');
  ok(!JSON.stringify(Object.assign({}, v, { docs: null })).match(/\d{8,}/), 'no full ID number stored (only last 4; docs hold image ids)');
  eq((await call('verificationSubmit', U.uid, { docType: 'national_id', last4: '19A7', docs: [doc(U.uid)] })).code, 'failed-precondition', 'dup');
});
await test('admin queue + signed private links; non-admin refused; viewing is audited', async () => {
  eq((await call('adminVerificationQueue', U.uid, {})).code, 'permission-denied', 'user queue');
  const q = await call('adminVerificationQueue', 'adm', {}, ADM); ok(q.ok && q.data.requests.some(x => x.uid === U.uid), JSON.stringify(q).slice(0, 200));
  eq((await call('adminVerificationDocUrls', U.uid, { uid: U.uid })).code, 'permission-denied', 'user urls');
  const u = await call('adminVerificationDocUrls', 'adm', { uid: U.uid }, ADM); ok(u.ok && u.data.configured, JSON.stringify(u));
  ok(/^https:\/\/res\.cloudinary\.com\/demo-test\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/v1700000000\/sokohai\/identity\//.test(u.data.urls[0].url), u.data.urls[0].url);
  ok(!(await db.collection('admin_audit_log').where('action', '==', 'VERIFICATION_DOCS_VIEWED').get()).empty, 'audit');
});
await test('rules: owner reads own request, other users cannot, nobody writes from the browser', async () => {
  const get = (tok) => fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/verification_requests/${U.uid}`, { headers: { authorization: 'Bearer ' + tok } }).then(r => r.status);
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  ok((await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) })).ok, 'rules');
  eq(await get(U.tok), 200, 'owner'); eq(await get(O.tok), 403, 'other');
  const w = await fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/verification_requests/${U.uid}?updateMask.fieldPaths=status`, { method: 'PATCH', headers: { authorization: 'Bearer ' + U.tok, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { status: { stringValue: 'approved' } } }) });
  eq(w.status, 403, 'self-approve');
});
await test('reject (reason) -> user may resubmit; approve -> users.isVerified + audit; decided twice refused', async () => {
  eq((await call('adminVerificationDecide', 'adm', { uid: U.uid, decision: 'reject', reason: 'x' }, ADM)).code, 'invalid-argument', 'reason');
  ok((await call('adminVerificationDecide', 'adm', { uid: U.uid, decision: 'reject', reason: 'Picha haisomeki vizuri' }, ADM)).ok, 'reject');
  eq((await db.doc('users/' + U.uid).get()).data().isVerified, undefined, 'not verified');
  ok((await call('verificationSubmit', U.uid, { docType: 'national_id', last4: '19A7', docs: [doc(U.uid, 2)] })).ok, 'resubmit');
  ok((await call('adminVerificationDecide', 'adm', { uid: U.uid, decision: 'approve', reason: 'Hati ni halali na inasomeka' }, ADM)).ok, 'approve');
  const u = (await db.doc('users/' + U.uid).get()).data(); eq(u.isVerified, true, 'verified'); eq(u.verificationStatus, 'verified', 'status');
  eq((await call('adminVerificationDecide', 'adm', { uid: U.uid, decision: 'reject', reason: 'kubadili uamuzi' }, ADM)).code, 'failed-precondition', 'twice');
  ok(!(await db.collection('admin_audit_log').where('action', '==', 'IDENTITY_VERIFIED').get()).empty, 'audit');
  ok(!(await db.collection('notifications').where('userId', '==', U.uid).where('type', '==', 'verification').get()).empty, 'notified');
});
await test('signed URL helper matches Cloudinary\'s documented signature scheme', async () => {
  const url = ver._testing.signedUrl({ publicId: 'sample', format: 'jpg', version: '1312461204' });
  ok(/\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/v1312461204\/sample\.jpg$/.test(url), url);
});
console.log(`\nIDENTITY VERIFICATION: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

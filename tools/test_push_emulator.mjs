#!/usr/bin/env node
/* [R15] Web push — emulator test. Real callables + real firestore.rules (REST with emulator tokens);
 * FCM itself is replaced by a recording fake sender (no message leaves this machine).
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_push_emulator.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!FS_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const push = require(path.join(ROOT, 'functions', 'push.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
async function call(name, uid, data) {
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: uid ? { uid, token: { uid, email: uid + '@u.test', email_verified: true } } : undefined, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code }; }
}
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = uid => { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none' }) + '.' + b64({ user_id: uid, sub: uid, iat: n, exp: n + 3600, firebase: { sign_in_provider: 'password' } }) + '.'; };
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const restGet = async (uid, p) => (await fetch(DOCS + '/' + p, { headers: { Authorization: 'Bearer ' + jwt(uid) } })).status;
const restSet = async (uid, p, field) => (await fetch(DOCS + '/' + p, { method: 'PATCH', headers: { Authorization: 'Bearer ' + jwt(uid), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { x: { stringValue: field } } }) })).status;
const TOK_A = 'fcmTokenA_' + 'x'.repeat(40), TOK_A2 = 'fcmTokenA2_' + 'y'.repeat(40), TOK_DEAD = 'fcmTokenDead_' + 'z'.repeat(40);
const A = 'pushA', B = 'pushB';
function fakeSender(dead) { const sent = []; const f = async (m) => { sent.push(m); return { successCount: m.tokens.filter(t => !dead.includes(t)).length, failureCount: m.tokens.filter(t => dead.includes(t)).length, responses: m.tokens.map(t => dead.includes(t) ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }) }; }; f.sent = sent; return f; }

for (const c of ['push_tokens', 'push_prefs']) { const s = await db.collection(c).get(); await Promise.all(s.docs.map(d => d.ref.delete())); }

await test('register: login required; bad token refused; valid token stored for the caller only', async () => {
  eq((await call('pushRegisterToken', null, { token: TOK_A })).code, 'unauthenticated', 'anon');
  eq((await call('pushRegisterToken', A, { token: 'short' })).code, 'invalid-argument', 'short');
  eq((await call('pushRegisterToken', A, { token: 'bad token with spaces and <script>' + 'x'.repeat(20) })).code, 'invalid-argument', 'chars');
  ok((await call('pushRegisterToken', A, { token: TOK_A, platform: 'web' })).ok, 'reg');
  const s = await db.collection('push_tokens').where('uid', '==', A).get(); eq(s.size, 1, 'one doc');
  eq(s.docs[0].id, push._testing.tokenId(A, TOK_A), 'hashed id (token not in the id)');
});
await test('same device token moves to the account that registered it last (shared phone)', async () => {
  ok((await call('pushRegisterToken', B, { token: TOK_A })).ok, 'B reg');
  eq((await db.collection('push_tokens').where('uid', '==', A).get()).size, 0, 'A lost it');
  eq((await db.collection('push_tokens').where('uid', '==', B).get()).size, 1, 'B has it');
  ok((await call('pushRegisterToken', A, { token: TOK_A })).ok, 'A again');
});
await test('rules: nobody reads/writes push_tokens from the browser; push_prefs readable by owner only, never writable', async () => {
  eq(await restGet(A, 'push_tokens/' + push._testing.tokenId(A, TOK_A)), 403, 'owner read token');
  eq(await restSet(A, 'push_tokens/' + A + '_forged', 'x'), 403, 'forge token');
  await call('pushSetPrefs', A, { categories: { chat: false } });
  eq(await restGet(A, 'push_prefs/' + A), 200, 'own prefs');
  eq(await restGet(B, 'push_prefs/' + A), 403, 'other prefs');
  eq(await restSet(A, 'push_prefs/' + A, 'x'), 403, 'write prefs');
});
await test('prefs: unknown category / non-boolean refused; promotions OFF by default', async () => {
  eq((await call('pushSetPrefs', A, { categories: { spam: true } })).code, 'invalid-argument', 'unknown');
  eq((await call('pushSetPrefs', A, { categories: { orders: 'yes' } })).code, 'invalid-argument', 'non-bool');
  const r = await call('pushSetPrefs', A, {}); eq(r.data.prefs.categories.promotions, false, 'promo default'); eq(r.data.prefs.categories.chat, false, 'chat off kept');
});
await test('deliver: order notice goes to all the user\'s devices, short text, link to the notice', async () => {
  await call('pushRegisterToken', A, { token: TOK_A2 });
  const f = fakeSender([]);
  const r = await push._testing.deliver('n1', { userId: A, type: 'order', title: 'Oda mpya', body: 'Una oda mpya ya TV 55"' + ' maelezo'.repeat(40) }, f);
  eq(r.sent, 2, 'sent'); eq(f.sent[0].tokens.length, 2, 'tokens');
  ok(f.sent[0].notification.body.length <= 160, 'body cut'); eq(f.sent[0].data.url, '/?notif=n1', 'link');
});
await test('deliver: respects prefs (chat off, promotions default off, master switch off)', async () => {
  const f = fakeSender([]);
  eq((await push._testing.deliver('n2', { userId: A, type: 'chat', title: 'Ujumbe' }, f)).reason, 'prefs_off', 'chat');
  eq((await push._testing.deliver('n3', { userId: A, type: 'promo', title: 'Ofa' }, f)).reason, 'prefs_off', 'promo');
  eq((await push._testing.deliver('n4', { userId: A, type: 'x', title: 'x', push: false }, f)).reason, 'no_user_or_opt_out', 'per-notice opt-out');
  await call('pushSetPrefs', A, { enabled: false });
  eq((await push._testing.deliver('n5', { userId: A, type: 'order', title: 'Oda' }, f)).reason, 'prefs_off', 'master off');
  eq(f.sent.length, 0, 'nothing sent'); await call('pushSetPrefs', A, { enabled: true });
});
await test('deliver: dead tokens are deleted, live ones kept; no devices = no send', async () => {
  await call('pushRegisterToken', A, { token: TOK_DEAD });
  const r = await push._testing.deliver('n6', { userId: A, type: 'wallet', title: 'Malipo yamepokelewa' }, fakeSender([TOK_DEAD]));
  eq([r.sent, r.pruned, r.category], [2, 1, 'payments'], 'prune');
  eq((await db.collection('push_tokens').where('uid', '==', A).get()).size, 2, '2 left');
  eq((await push._testing.deliver('n7', { userId: 'nobody', type: 'order', title: 'x' }, fakeSender([]))).reason, 'no_devices', 'none');
});
await test('unregister removes only the caller\'s own token', async () => {
  ok((await call('pushUnregisterToken', B, { token: TOK_A2 })).ok, 'B call ok');
  eq((await db.collection('push_tokens').where('uid', '==', A).get()).size, 2, 'A untouched by B');
  ok((await call('pushUnregisterToken', A, { token: TOK_A2 })).ok, 'A');
  eq((await db.collection('push_tokens').where('uid', '==', A).get()).size, 1, 'removed');
});
await test('categories map from existing notice fields', async () => {
  const c = push._testing.categoryOf;
  eq([c({ type: 'auction_payment_extended' }), c({ type: 'delivery' }), c({ type: 'ride_request' }), c({ type: 'new_comment' }), c({ type: 'escrow' }), c({ event: 'wallet.credit' }), c({ type: 'order' }), c({})],
     ['auctions', 'delivery', 'delivery', 'chat', 'payments', 'payments', 'orders', 'orders'], 'map');
});
console.log(`\nRESULT ${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// [2026-10-31] Seller lifecycle (temporary/permanent) rules + server callable on the Firestore emulator.
//   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_seller_lifecycle_emulator.mjs"
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) { console.error('BLOCKED: FIRESTORE_EMULATOR_HOST haijawekwa.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function token(uid, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(Object.assign({
    iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: now, user_id: uid, sub: uid,
    iat: now, exp: now + 3600, firebase: { identities: {}, sign_in_provider: 'password' }
  }, extra)) + '.';
}
const OWNER = 'owner';
const U = {
  seller: token('bob', { email: 'bob@test.tz', email_verified: true }),
  buyer: token('alice', { email: 'alice@test.tz', email_verified: true }),
  other: token('eve', { email: 'eve@test.tz', email_verified: true }),
  admin: token('ops', { email: 'ops@test.tz', email_verified: true, admin: true })
};
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
async function call(method, url, tok, body) {
  const res = await fetch(url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, ok: res.ok, text: await res.text() };
}
const setDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}`, tok, { fields: fields(data) });
const updDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?` + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true', tok, { fields: fields(data) });
const createDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?currentDocument.exists=false`, tok, { fields: fields(data) });
const getDoc = (tok, path) => call('GET', `${BASE}/${path}`, tok);
const seed = (path, data) => setDoc(OWNER, path, data);

// (helpers above are shared with tools/test_inventory_rules.mjs)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
const who = uid => ({ uid, token: { uid, email: uid + '@sokohai.test', email_verified: true } });
async function run(name, auth, data) { try { return { ok: true, data: await fns[name].run({ data, auth, rawRequest: { headers: {} } }) }; } catch (e) { return { ok: false, code: e.code, message: e.message }; } }
let pass = 0, fail = 0;
async function expect(label, want, p) {
  const r = await p; const allowed = r.ok || r.status === 404;
  if ((want === 'ALLOW') === allowed) { pass++; console.log(`PASS  ${want.padEnd(5)} ${label}`); }
  else { fail++; console.log(`FAIL  expected ${want} got ${allowed ? 'ALLOW' : 'DENY'} (${r.status}) ${label}\n      ${String(r.text).slice(0, 200)}`); }
}
async function check(label, fn) { try { await fn(); pass++; console.log('PASS  ' + label); } catch (e) { fail++; console.log('FAIL  ' + label + '\n      ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

await call('DELETE', `http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, null);
console.log('\n-- rules: the browser cannot self-promote');
await expect('new seller creates profile as TEMPORARY', 'ALLOW', createDoc(U.seller, 'users/bob', { uid: 'bob', fullName: 'Bob', sellerType: 'temporary', productLimit: 9 }));
await expect('new profile cannot start as PERMANENT', 'DENY', createDoc(U.buyer, 'users/alice', { uid: 'alice', sellerType: 'permanent' }));
await expect('new profile cannot set productLimit 9999', 'DENY', createDoc(U.buyer, 'users/alice', { uid: 'alice', productLimit: 9999 }));
await expect('new profile cannot write status history', 'DENY', createDoc(U.buyer, 'users/alice', { uid: 'alice', sellerStatusHistory: [] }));
await expect('seller cannot switch himself to PERMANENT', 'DENY', updDoc(U.seller, 'users/bob', { sellerType: 'permanent' }));
await expect('seller cannot raise productLimit', 'DENY', updDoc(U.seller, 'users/bob', { productLimit: 9999 }));
await expect('seller cannot edit status history', 'DENY', updDoc(U.seller, 'users/bob', { sellerStatusHistory: [{ to: 'permanent' }] }));
await expect('seller still edits ordinary profile fields (shop name, mode, store address)', 'ALLOW', updDoc(U.seller, 'users/bob', { shopName: 'Duka la Bob', sellerMode: 'MANAGE_ONLY', storeAddress: 'Kariakoo' }));
await seed('users/carol', { uid: 'carol', sellerType: 'permanent', productLimit: 9999 });
const CAROL = token('carol', { email: 'carol@test.tz', email_verified: true });
await expect('existing PERMANENT seller edits profile (sellerType unchanged)', 'ALLOW', updDoc(CAROL, 'users/carol', { shopName: 'Carol' }));
await expect('nobody writes the lifecycle audit log from the browser', 'DENY', createDoc(U.seller, 'seller_lifecycle_log/x', { uid: 'bob' }));

console.log('\n-- server: sellerLifecycleChange (same account, audit, requirements)');
await seed('products/bp1', { userId: 'bob', title: 'Sabuni', price: 1000, stock: 5 });
await db.doc('system/config').set({ fees: { subscription: true } });
await check('subscription fee ON + no subscription -> refused, nothing changes', async () => {
  const r = await run('sellerLifecycleChange', who('bob'), { target: 'permanent' });
  assert(!r.ok && /SUBSCRIPTION_REQUIRED/.test(r.message), JSON.stringify(r));
  const u = (await db.doc('users/bob').get()).data(); assert(u.sellerType === 'temporary', 'still temporary');
});
await check('subscription active -> PERMANENT on the same uid; products, history and audit kept', async () => {
  await db.doc('users/bob').update({ isSubscribed: true, subscriptionValidUntil: new Date(Date.now() + 864e5).toISOString() });
  const r = await run('sellerLifecycleChange', who('bob'), { target: 'permanent' });
  assert(r.ok && r.data.sellerType === 'permanent' && r.data.from === 'temporary', JSON.stringify(r));
  const u = (await db.doc('users/bob').get()).data();
  assert(u.sellerType === 'permanent' && u.productLimit === 9999 && u.shopName === 'Duka la Bob' && u.storeAddress === 'Kariakoo', 'profile kept');
  assert(u.sellerStatusHistory.length === 1 && u.sellerStatusHistory[0].from === 'temporary', 'history');
  assert((await db.doc('products/bp1').get()).data().userId === 'bob', 'product untouched');
  const log = await db.collection('seller_lifecycle_log').where('uid', '==', 'bob').get(); assert(log.size === 1, 'audit row');
  assert(Array.isArray(log.docs[0].data().pendingVerification), 'verification gap reported');
});
await check('repeat request is idempotent (no second history entry)', async () => {
  const r = await run('sellerLifecycleChange', who('bob'), { target: 'permanent' });
  assert(r.ok && r.data.already === true, JSON.stringify(r));
  assert((await db.doc('users/bob').get()).data().sellerStatusHistory.length === 1, 'one entry');
});
await check('downgrade to TEMPORARY keeps products and data (no deletion)', async () => {
  const r = await run('sellerLifecycleChange', who('bob'), { target: 'temporary' });
  assert(r.ok && r.data.sellerType === 'temporary', JSON.stringify(r));
  assert((await db.doc('products/bp1').get()).exists, 'product kept');
  assert((await db.doc('users/bob').get()).data().sellerStatusHistory.length === 2, 'two entries');
});
await check('fee OFF (default) -> permanent allowed without subscription', async () => {
  await db.doc('system/config').set({ fees: { subscription: false } });
  await db.doc('users/dan').set({ uid: 'dan', sellerType: 'temporary' });
  const r = await run('sellerLifecycleChange', who('dan'), { target: 'permanent' });
  assert(r.ok && r.data.sellerType === 'permanent', JSON.stringify(r));
});
await check('unauthenticated and bad targets are refused', async () => {
  assert(!(await run('sellerLifecycleChange', null, { target: 'permanent' })).ok, 'unauth');
  assert(!(await run('sellerLifecycleChange', who('dan'), { target: 'owner' })).ok, 'bad target');
});
console.log('\n-- configurable verification (nothing invented; admin defines, server enforces)');
await expect('seller cannot mark himself verified (verificationChecks)', 'DENY', updDoc(U.seller, 'users/bob', { verificationChecks: { license: true } }));
await check('enforced requirement for this business type blocks the upgrade and names what is missing', async () => {
  await db.doc('system_config/seller_verification').set({ enforced: true, requirements: [{ id: 'business_licence', label: 'Leseni ya biashara', appliesTo: ['Pharmacy'] }] });
  await db.doc('users/erin').set({ uid: 'erin', sellerType: 'temporary', businessType: 'Pharmacy' });
  const r = await run('sellerLifecycleChange', who('erin'), { target: 'permanent' });
  assert(!r.ok && /VERIFICATION_REQUIRED: business_licence/.test(r.message), JSON.stringify(r));
  assert((await db.doc('users/erin').get()).data().sellerType === 'temporary', 'unchanged');
});
await check('a business type the rule does not cover is not blocked (requirements are per type)', async () => {
  await db.doc('users/fred').set({ uid: 'fred', sellerType: 'temporary', businessType: 'Boutique' });
  const r = await run('sellerLifecycleChange', who('fred'), { target: 'permanent' });
  assert(r.ok && r.data.sellerType === 'permanent', JSON.stringify(r));
});
await check('after an admin records the evidence, the same seller is upgraded; history keeps both lifecycle states', async () => {
  await db.doc('users/erin').update({ verificationChecks: { business_licence: true } });
  const r = await run('sellerLifecycleChange', who('erin'), { target: 'permanent' });
  assert(r.ok && r.data.sellerType === 'permanent' && r.data.pendingVerification.length === 0, JSON.stringify(r));
  await db.doc('system_config/seller_verification').delete();
});
await check('lifecycle is independent of business mode: temporary/permanent x hybrid/offline all valid', async () => {
  for (const [uid, mode] of [['th', 'HYBRID'], ['to', 'OFFLINE'], ['ph', 'HYBRID'], ['po', 'OFFLINE']]) await db.doc('users/' + uid).set({ uid, sellerType: 'temporary', sellerMode: mode });
  for (const uid of ['ph', 'po']) assert((await run('sellerLifecycleChange', who(uid), { target: 'permanent' })).ok, uid);
  for (const [uid, type, mode] of [['th', 'temporary', 'HYBRID'], ['to', 'temporary', 'OFFLINE'], ['ph', 'permanent', 'HYBRID'], ['po', 'permanent', 'OFFLINE']]) {
    const u = (await db.doc('users/' + uid).get()).data(); assert(u.sellerType === type && u.sellerMode === mode, uid + ' ' + JSON.stringify(u));
  }
});
console.log(`\nSELLER LIFECYCLE (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

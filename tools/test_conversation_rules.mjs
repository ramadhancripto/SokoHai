#!/usr/bin/env node
/**
 * [2026-11-06] Conversations: inbox LIST query must work for participants, and
 * must never leak other people's conversations. Needs the Firestore emulator:
 *   firebase emulators:exec --only firestore --project demo-sokohai "node tools/test_conversation_rules.mjs"
 * Without the emulator it exits 2 (BLOCKED) and never reports a pass.
 */
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

let pass = 0, fail = 0; const failures = [];
async function expect(label, want, p) {
  const r = await p;
  const allowed = r.ok || r.status === 404;
  if ((want === 'ALLOW') === allowed) { pass++; console.log(`PASS  ${want.padEnd(5)} ${label}`); }
  else { fail++; failures.push(label); console.log(`FAIL  expected ${want} got ${allowed ? 'ALLOW' : 'DENY'} (${r.status}) ${label}\n      ${r.text.slice(0, 240)}`); }
}
const variant = (id, stock, extra = {}) => Object.assign({ variantId: id, sku: 'SKU-' + id, unitId: 'pcs', price: 1000, options: { size: id }, stock }, extra);
const product = (extra = {}) => Object.assign({ userId: 'bob', title: 'Shati', price: 1000, stock: 0 }, extra);
const listMine = (tok, uid) => call('POST', `${BASE}:runQuery`, tok, { structuredQuery: {
  from: [{ collectionId: 'conversations' }],
  where: { fieldFilter: { field: { fieldPath: 'participants' }, op: 'ARRAY_CONTAINS', value: { stringValue: uid } } }, limit: 100 } });
const listAll = tok => call('POST', `${BASE}:runQuery`, tok, { structuredQuery: { from: [{ collectionId: 'conversations' }], limit: 100 } });
const listOther = (tok, uid) => listMine(tok, uid);

await call('DELETE', `http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, null);
await seed('conversations/conv_ab', { participants: ['alice', 'bob'], type: 'direct' });
await seed('conversations/conv_be', { participants: ['bob', 'eve'], type: 'direct' });
await seed('conversations/conv_group_g1', { participants: ['alice', 'bob'], type: 'group', groupId: 'g1' });
await seed('groups/g1/members/alice', { status: 'active', role: 'member' });

await expect('participant lists own inbox (array-contains me)', 'ALLOW', listMine(U.buyer, 'alice'));
await expect('user cannot list another user\'s inbox', 'DENY', listOther(U.buyer, 'eve'));
await expect('unfiltered list of all conversations is denied', 'DENY', listAll(U.buyer));
await expect('signed-out list denied', 'DENY', listMine(null, 'alice'));
await expect('participant gets own 1:1 conversation', 'ALLOW', getDoc(U.buyer, 'conversations/conv_ab'));
await expect('non-participant cannot get a 1:1 conversation', 'DENY', getDoc(U.other, 'conversations/conv_ab'));
await expect('non-member cannot get a group conversation', 'DENY', getDoc(U.other, 'conversations/conv_group_g1'));

const r = await listMine(U.buyer, 'alice');
const ids = (JSON.parse(r.text) || []).filter(x => x.document).map(x => x.document.name.split('/').pop()).sort();
if (JSON.stringify(ids) === JSON.stringify(['conv_ab', 'conv_group_g1'])) { pass++; console.log('PASS  inbox returns exactly alice\'s conversations: ' + ids.join(',')); }
else { fail++; failures.push('inbox contents'); console.log('FAIL  inbox contents ' + JSON.stringify(ids)); }

console.log(`\nCONVERSATION RULES: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

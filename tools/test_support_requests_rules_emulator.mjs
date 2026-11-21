// [SUPPORT 2026-11-21] Emulator only (demo-sokohai). Rules for support_requests/{SR-…}:
// signed-in users file requests in their own name with fixed fields; only they and admins can read them;
// the user can only close their request; admins set status + reply, signed; nobody deletes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const host = process.env.FIRESTORE_EMULATOR_HOST; if (!host) throw Error('FIRESTORE_EMULATOR_HOST is required');
const project = 'demo-sokohai', base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const lr = await fetch(`http://${host}/emulator/v1/projects/${project}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
assert.ok(lr.ok, 'rules load ' + lr.status);
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid, extra = {}) { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(Object.assign({ iss: 'https://securetoken.google.com/' + project, aud: project, auth_time: n, user_id: uid, sub: uid, iat: n, exp: n + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }, extra)) + '.'; }
function enc(v) { if (v === null) return { nullValue: null }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'string') return { stringValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } }; return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }; }
const f = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
async function req(method, path, tok, data, query = '') { const h = { 'Content-Type': 'application/json' }; if (tok) h.Authorization = 'Bearer ' + tok; const r = await fetch(base + '/' + path + query, { method, headers: h, body: data ? JSON.stringify({ fields: f(data) }) : undefined }); return { status: r.status, body: await r.text() }; }
const create = (p, tok, data) => req('PATCH', p, tok, data, '?currentDocument.exists=false');
const patch = (p, tok, data) => req('PATCH', p, tok, data, '?' + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true');
async function runQuery(tok, uidFilter, limit) {
  const body = { structuredQuery: { from: [{ collectionId: 'support_requests' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uidFilter } } } } };
  if (limit) body.structuredQuery.limit = limit;
  const r = await fetch(base + ':runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });
  return r.status;
}
const T = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
const U = 'sr-u-' + T, O = 'sr-o-' + T, A = 'sr-a-' + T;
const user = token(U), other = token(O), admin = token(A, { admin: true, email: 'staff@example.test', email_verified: true });
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  PASS ' + m); };
const ID = 'SR-' + (T + 'ABCDEFGH').slice(0, 10);
const good = (extra = {}) => Object.assign({ reference: ID, uid: U, category: 'privacy', subject: 'Futa akaunti yangu', description: 'Naomba akaunti yangu na taarifa zangu zifutwe tafadhali.', relatedRef: '', status: 'open', createdAt: new Date().toISOString(), appVersion: '', page: '/' }, extra);

ok((await create('support_requests/' + ID, null, good())).status === 403, 'signed-out visitor cannot file a request');
ok((await create('support_requests/' + ID, other, good())).status === 403, 'cannot file in someone else\'s name');
ok((await create('support_requests/' + ID, user, good({ status: 'resolved' }))).status === 403, 'cannot pre-set the status');
ok((await create('support_requests/' + ID, user, good({ category: 'refund_me_now' }))).status === 403, 'unknown category refused');
ok((await create('support_requests/' + ID, user, good({ description: 'fupi' }))).status === 403, 'too short description refused');
ok((await create('support_requests/' + ID, user, good({ description: 'x'.repeat(2001) }))).status === 403, 'description over 2000 characters refused');
ok((await create('support_requests/' + ID, user, good({ adminReply: 'nimejijibu' }))).status === 403, 'extra fields (e.g. adminReply) refused');
ok((await create('support_requests/' + ID, user, good({ phone: '0712000000' }))).status === 403, 'no phone / contact fields stored');
ok((await create('support_requests/SR-bad', user, good({ reference: 'SR-bad' }))).status === 403, 'reference format enforced');
ok((await create('support_requests/' + ID, user, good({ reference: 'SR-OTHER12345' }))).status === 403, 'reference must equal the document id');
ok((await create('support_requests/' + ID, user, good())).status === 200, 'signed-in user files a request');
ok((await create('support_requests/' + ID, user, good())).status !== 200, 'the same reference cannot be filed twice');
ok((await req('GET', 'support_requests/' + ID, user)).status === 200, 'requester reads their request');
ok((await req('GET', 'support_requests/' + ID, other)).status === 403, 'another user cannot read it');
ok((await req('GET', 'support_requests/' + ID, null)).status === 403, 'signed-out visitor cannot read it');
ok((await req('GET', 'support_requests/' + ID, admin)).status === 200, 'admin reads it');
ok((await runQuery(user, U, 50)) === 200, 'requester lists own requests (limit 50)');
ok((await runQuery(user, U, 0)) === 403, 'unbounded list refused');
ok((await runQuery(other, U, 50)) === 403, 'cannot list someone else\'s requests');
ok((await patch('support_requests/' + ID, user, { status: 'resolved' })).status === 403, 'requester cannot mark it resolved');
ok((await patch('support_requests/' + ID, user, { adminReply: 'sawa' })).status === 403, 'requester cannot write the reply');
ok((await patch('support_requests/' + ID, other, { status: 'closed', closedAt: new Date().toISOString() })).status === 403, 'another user cannot close it');
ok((await patch('support_requests/' + ID, admin, { status: 'in_progress', adminReply: 'Tunashughulikia ombi lako.', handledBy: O, updatedAt: new Date().toISOString() })).status === 403, 'admin must sign as themselves');
ok((await patch('support_requests/' + ID, admin, { status: 'in_progress', adminReply: 'Tunashughulikia ombi lako.', handledBy: A, updatedAt: new Date().toISOString() })).status === 200, 'admin sets status and reply');
ok((await patch('support_requests/' + ID, admin, { subject: 'imebadilishwa', handledBy: A })).status === 403, 'admin cannot rewrite the user\'s text');
ok((await patch('support_requests/' + ID, user, { status: 'closed', closedAt: new Date().toISOString() })).status === 200, 'requester closes the request');
ok((await patch('support_requests/' + ID, user, { status: 'closed', closedAt: new Date().toISOString() })).status === 403, 'a closed request cannot be closed again by the user');
ok((await req('DELETE', 'support_requests/' + ID, user)).status === 403 && (await req('DELETE', 'support_requests/' + ID, admin)).status === 403, 'nobody deletes a request (kept on record)');
console.log(`\nSUPPORT REQUESTS RULES (emulator): ${pass} passed, 0 failed`);

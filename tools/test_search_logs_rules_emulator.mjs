// [SEARCH-INTEL + SEO 2026-11-21] Emulator only (demo-sokohai). Rules for search_logs (anonymous analytics events) and
// seo_backlinks (admin register): signed-in create only, fixed schema, no personal fields, admin-only reads.
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
const T = Date.now().toString(36);
const U = 'sl-u-' + T, A = 'sl-a-' + T;
const user = token(U), admin = token(A, { admin: true, email: 'staff@example.test', email_verified: true });
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  PASS ' + m); };
const ev = (x = {}) => Object.assign({ t: 'search', q: 'simu samsung', sid: 'abc123def456', day: '2026-11-21', at: new Date().toISOString(), v: 'search-intel-2026-11-21', results: 12, zero: false, ms: 40, corrected: '', sort: '', top: ['p1', 'p2'] }, x);
const id = (k) => 'ev' + k + T;
ok((await create('search_logs/' + id(1), null, ev())).status === 403, 'signed-out visitor cannot write analytics');
ok((await create('search_logs/' + id(2), user, ev())).status === 200, 'signed-in browser appends a search event');
ok((await create('search_logs/' + id(3), user, ev({ t: 'click', itemId: 'p1', col: 'products', pos: 2, cat: 'CAT-12', sponsored: false, results: 0, top: [] }))).status === 200, 'click event');
ok((await create('search_logs/' + id(4), user, ev({ uid: U }))).status === 403, 'no uid field allowed (events are anonymous)');
ok((await create('search_logs/' + id(5), user, ev({ email: 'a@b.c' }))).status === 403, 'no e-mail field allowed');
ok((await create('search_logs/' + id(6), user, ev({ lat: -6.8 }))).status === 403, 'no location field allowed');
ok((await create('search_logs/' + id(7), user, ev({ q: 'x'.repeat(81) }))).status === 403, 'query longer than 80 characters refused');
ok((await create('search_logs/' + id(8), user, ev({ t: 'purchase' }))).status === 403, 'unknown event type refused');
ok((await create('search_logs/' + id(9), user, ev({ results: 99999 }))).status === 403, 'impossible result count refused');
ok((await create('search_logs/' + id(10), user, ev({ top: Array.from({ length: 11 }, (_, i) => 'p' + i) }))).status === 403, 'at most 10 impression ids');
ok((await create('search_logs/' + id(11), user, ev({ sid: 'BAD SID!' }))).status === 403, 'session id format enforced');
ok((await patch('search_logs/' + id(2), user, { results: 0 })).status === 403, 'events cannot be edited');
ok((await req('DELETE', 'search_logs/' + id(2), user)).status === 403, 'user cannot delete events');
ok((await req('GET', 'search_logs/' + id(2), user)).status === 403, 'user cannot read analytics');
ok((await req('GET', 'search_logs/' + id(2), admin)).status === 200, 'admin reads analytics');
ok((await req('DELETE', 'search_logs/' + id(3), admin)).status === 200, 'admin may delete (retention clean-up)');
const bl = (x = {}) => Object.assign({ sourceUrl: 'https://chama.example.org/wanachama', sourceDomain: 'chama.example.org', targetPath: '/duka/x-1/', anchor: 'Duka letu', rel: 'follow', quality: 4, kind: 'association', status: 'active', note: '', firstSeen: '2026-11-21', lastChecked: new Date().toISOString(), updatedBy: A }, x);
ok((await create('seo_backlinks/bl1' + T, user, bl({ updatedBy: U }))).status === 403, 'non-admin cannot write the backlink register');
ok((await create('seo_backlinks/bl1' + T, admin, bl())).status === 200, 'admin records a backlink');
ok((await create('seo_backlinks/bl2' + T, admin, bl({ rel: 'paid' }))).status === 403, 'link type must be follow / nofollow / ugc / sponsored');
ok((await create('seo_backlinks/bl3' + T, admin, bl({ quality: 9 }))).status === 403, 'quality 1–5');
ok((await create('seo_backlinks/bl4' + T, admin, bl({ sourceUrl: 'javascript:alert(1)' }))).status === 403, 'source must be an http(s) URL');
ok((await create('seo_backlinks/bl5' + T, admin, bl({ updatedBy: 'someone-else' }))).status === 403, 'admin signs the record as themselves');
ok((await req('GET', 'seo_backlinks/bl1' + T, user)).status === 403 && (await req('GET', 'seo_backlinks/bl1' + T, admin)).status === 200, 'only admins read the register');
console.log(`\nSEARCH LOGS + BACKLINKS RULES (emulator): ${pass} passed, 0 failed`);

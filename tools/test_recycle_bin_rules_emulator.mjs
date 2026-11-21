// [RECYCLE 2026-11-21] Emulator only (demo-sokohai). Rules for the product Recycle Bin:
// archive -> restore to the market (published) -> archive -> "Futa kabisa" (tombstone) -> nothing can bring it back.
// Physical delete stays forbidden; only the owner (or managing agent) may purge; only archived listings can be purged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const host = process.env.FIRESTORE_EMULATOR_HOST; if (!host) throw Error('FIRESTORE_EMULATOR_HOST is required');
const project = 'demo-sokohai', base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
// load THIS checkout's rules into the emulator
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const lr = await fetch(`http://${host}/emulator/v1/projects/${project}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
assert.ok(lr.ok, 'rules load ' + lr.status);
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid) { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ iss: 'https://securetoken.google.com/' + project, aud: project, auth_time: n, user_id: uid, sub: uid, iat: n, exp: n + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }) + '.'; }
function enc(v) { if (v === null) return { nullValue: null }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'string') return { stringValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } }; return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }; }
const f = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
async function req(method, path, tok, data, query = '') { const r = await fetch(base + '/' + path + query, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: data ? JSON.stringify({ fields: f(data) }) : undefined }); return { status: r.status, body: await r.text() }; }
const set = (id, data) => req('PATCH', 'products/' + id, 'owner', data);
const patch = (id, tok, data) => req('PATCH', 'products/' + id, tok, data, '?' + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true');
const T = Date.now().toString(36);
const owner = token('rb-bob' + T), other = token('rb-eve' + T);
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  PASS ' + m); };
const orig = { userId: 'rb-bob' + T, title: 'Sabuni ya maji', price: 1500, stock: 5, publicationStatus: 'published', status: 'active', category: 'CAT-01', salesChannels: ['marketplace'] };
const P = 'rb-p1-' + T, Q = 'rb-p2-' + T;
ok((await set(P, orig)).status === 200 && (await set(Q, orig)).status === 200, 'seed two published listings');
const now = new Date().toISOString();
const archive = { publicationStatus: 'archived', status: 'archived', archivedAt: now, updatedAt: now };
const purge = { permanentlyDeleted: true, permanentlyDeletedAt: now, updatedAt: now };

ok((await patch(P, owner, purge)).status === 403, 'a PUBLISHED listing cannot be purged (must be in the Recycle Bin first)');
ok((await patch(P, owner, archive)).status === 200, 'owner moves the listing to the Recycle Bin');
ok((await patch(P, owner, { publicationStatus: 'published', status: 'active', archivedAt: null, updatedAt: now })).status === 200, 'owner restores it straight back to the market (published)');
ok((await patch(P, owner, archive)).status === 200, 'owner archives it again');
ok((await patch(P, other, purge)).status === 403, 'another seller cannot purge it');
ok((await patch(P, owner, Object.assign({}, purge, { price: 1 }))).status === 403, 'purge may not change any other field');
ok((await patch(P, owner, { permanentlyDeleted: false, permanentlyDeletedAt: now, updatedAt: now })).status === 403, 'purge must set permanentlyDeleted true');
ok((await patch(P, owner, purge)).status === 200, 'owner purges it ("Futa kabisa")');
const later = new Date(Date.now() + 1000).toISOString();
ok((await patch(P, owner, { permanentlyDeleted: true, permanentlyDeletedAt: later, updatedAt: later })).status === 403, 'a second purge is refused (already final)');
ok((await patch(P, owner, { publicationStatus: 'draft', status: 'draft', archivedAt: null, updatedAt: now })).status === 403, 'restore-to-draft path refuses a purged listing');
ok((await patch(P, owner, { publicationStatus: 'published', status: 'active', archivedAt: null, updatedAt: now })).status === 403, 'restore-to-market path refuses a purged listing');
ok((await patch(P, owner, { permanentlyDeleted: false, updatedAt: now })).status === 403, 'owner cannot un-delete it');
ok((await req('DELETE', 'products/' + P, owner)).status === 403, 'physical delete stays forbidden (record kept for orders/payments)');
const g = await fetch(base + '/products/' + P, { headers: { Authorization: 'Bearer owner' } }); const doc = JSON.parse(await g.text()).fields;
ok(doc.permanentlyDeleted.booleanValue === true && doc.stock.integerValue === '5' && doc.title.stringValue === 'Sabuni ya maji' && doc.publicationStatus.stringValue === 'archived', 'record kept intact: still archived, stock and title unchanged');
// unaffected listing: views counter and normal edits still work
ok((await patch(Q, other, { views: 1 })).status === 200, 'a buyer can still add a view to a normal listing');
ok((await patch(Q, owner, { title: 'Sabuni mpya', updatedAt: now })).status === 200, 'owner still edits a normal listing');
console.log(`\nRECYCLE BIN RULES (emulator): ${pass} passed, 0 failed`);

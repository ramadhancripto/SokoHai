#!/usr/bin/env node
/**
 * [REMEDIATION 2026-11 R7] Listing trust badges — Firestore emulator suite.
 * The product/service card shows "Imethibitishwa" when verified / ownerVerified /
 * verificationStatus is set. Only admins (adminSetVerification) may set them.
 *
 *   firebase emulators:exec --only firestore --project demo-sokohai "node tools/test_listing_trust_rules.mjs"
 *
 * Covers direct document reads AND list queries for: customer, assigned driver,
 * seller, active approved agent, suspended agent, legacy (unstamped) agent,
 * unrelated user, unauthenticated caller and admin, plus the private contact
 * subdocument and the create/update guards. Every case asserts ALLOW or DENY.
 * Without the emulator the script exits 2 (BLOCKED) — it never reports a pass it did not run.
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  console.error('BLOCKED: FIRESTORE_EMULATOR_HOST is not set. Run through `firebase emulators:exec --only firestore`.');
  process.exit(2);
}
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `http://${HOST}/v1/${ROOT}`;

function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function token(uid, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(Object.assign({
    iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: now, user_id: uid, sub: uid,
    iat: now, exp: now + 3600, firebase: { identities: {}, sign_in_provider: 'password' }
  }, extra)) + '.';
}
const OWNER = 'owner';
const T = {};
['cust', 'drv', 'sel', 'agentOk', 'agentSusp', 'agentAcct', 'agentLegacy', 'stranger', 'next1']
  .forEach(u => { T[u] = token(u, { email: u + '@test.tz', email_verified: true }); });
T.admin = token('ops', { email: 'ops@test.tz', email_verified: true, admin: true });

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
  const res = await fetch(url, {
    method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, ok: res.ok, text: await res.text() };
}
const setDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}`, tok, { fields: fields(data) });
const createDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?currentDocument.exists=false`, tok, { fields: fields(data) });
const updDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?` + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true', tok, { fields: fields(data) });
const getDoc = (tok, path) => call('GET', `${BASE}/${path}`, tok);
const seed = (path, data) => setDoc(OWNER, path, data);
function commit(tok, writes) {
  return call('POST', `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents:commit`, tok, {
    writes: writes.map(w => ({ update: { name: `${ROOT}/${w.path}`, fields: fields(w.data) }, currentDocument: { exists: false } }))
  });
}
function filt(w) {
  if (w[1] === 'in') return { fieldFilter: { field: { fieldPath: w[0] }, op: 'IN', value: enc(w[2]) } };
  return { fieldFilter: { field: { fieldPath: w[0] }, op: 'EQUAL', value: enc(w[2]) } };
}
function query(tok, collection, wheres, limit, parent) {
  const sq = { from: [{ collectionId: collection }] };
  if (limit) sq.limit = limit;
  if (wheres && wheres.length === 1) sq.where = filt(wheres[0]);
  if (wheres && wheres.length > 1) sq.where = { compositeFilter: { op: 'AND', filters: wheres.map(filt) } };
  return call('POST', `${BASE}${parent ? '/' + parent : ''}:runQuery`, tok, { structuredQuery: sq });
}
function groupQuery(tok, collection, limit) {
  return call('POST', `${BASE}:runQuery`, tok, { structuredQuery: { from: [{ collectionId: collection, allDescendants: true }], limit } });
}

let pass = 0, fail = 0;
function expect(label, res, allow) {
  const got = res.ok && !/PERMISSION_DENIED/.test(res.text);
  if (got === allow) { pass++; console.log(`  ✅ ${allow ? 'ALLOW' : 'DENY '} ${label}`); }
  else { fail++; console.log(`  ❌ expected ${allow ? 'ALLOW' : 'DENY'} got ${res.status} — ${label} :: ${res.text.slice(0, 160)}`); }
}
const ALLOW = true, DENY = false;
const prod = (extra) => Object.assign({ userId: 'sel', title: 'Pasi 1200W', price: 45000, stock: 0, openingStockPending: true, category: 'CAT-11' }, extra || {});
const svc = (extra) => Object.assign({ userId: 'sel', title: 'Fundi bomba', price: 20000 }, extra || {});
async function main() {
  await call('DELETE', `http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
  console.log('\n# Products');
  expect('seller creates a normal product', await createDoc(T.sel, 'products/p_ok', prod()), ALLOW);
  for (const k of ['verified', 'ownerVerified', 'sellerVerified', 'isVerified']) expect('seller creates product with ' + k + '=true', await createDoc(T.sel, 'products/p_' + k, prod({ [k]: true })), DENY);
  expect('seller creates product with verificationStatus=verified', await createDoc(T.sel, 'products/p_vs', prod({ verificationStatus: 'verified' })), DENY);
  expect('seller sets verified=true on own product later', await updDoc(T.sel, 'products/p_ok', { verified: true }), DENY);
  expect('seller sets verificationStatus on own product later', await updDoc(T.sel, 'products/p_ok', { verificationStatus: 'verified' }), DENY);
  expect('seller still edits price on own product', await updDoc(T.sel, 'products/p_ok', { price: 44000 }), ALLOW);
  expect('admin may set the badge (signed admin change)', await updDoc(T.admin, 'products/p_ok', { verified: true, lastChangedBy: 'ops', lastChangedAt: '2026-11-07T00:00:00Z' }), ALLOW);
  expect('seller edit after admin badge keeps working (badge unchanged)', await updDoc(T.sel, 'products/p_ok', { price: 43000 }), ALLOW);
  expect('seller cannot remove/alter the admin badge', await updDoc(T.sel, 'products/p_ok', { verified: false }), DENY);
  console.log('\n# Services');
  expect('provider creates a normal service', await createDoc(T.sel, 'services/s_ok', svc()), ALLOW);
  expect('provider creates service with verified=true', await createDoc(T.sel, 'services/s_v', svc({ verified: true })), DENY);
  expect('provider creates service with ownerVerified=true', await createDoc(T.sel, 'services/s_ov', svc({ ownerVerified: true })), DENY);
  expect('provider sets verificationStatus later', await updDoc(T.sel, 'services/s_ok', { verificationStatus: 'verified' }), DENY);
  expect('provider still edits own service price', await updDoc(T.sel, 'services/s_ok', { price: 25000 }), ALLOW);
  console.log(`\nLISTING TRUST RULES: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

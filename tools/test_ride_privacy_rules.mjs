#!/usr/bin/env node
/**
 * [REMEDIATION 2026-11 R1] ride_requests privacy — Firestore emulator suite.
 *
 *   firebase emulators:exec --only firestore --project demo-sokohai "node tools/test_ride_privacy_rules.mjs"
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
const OPEN = ['searching', 'pending_acceptance', 'open', 'pending'];

async function main() {
  await call('DELETE', `http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
  await seed('users/agentOk', { isApprovedAgent: true, agentApprovedBy: 'boss' });
  await seed('users/agentSusp', { isApprovedAgent: true, agentApprovedBy: 'boss', suspended: true });
  await seed('users/agentAcct', { isApprovedAgent: true, agentApprovedBy: 'boss', accountStatus: 'suspended' });
  await seed('users/agentLegacy', { isApprovedAgent: true });
  await seed('users/stranger', { role: 'buyer' });
  await seed('users/drv', { isDriver: true });
  await seed('ride_requests/open1', { customerId: 'cust', status: 'searching', fromLocation: 'Kariakoo', toLocation: 'Mbezi', cargoName: 'Mchele' });
  await seed('ride_requests/open1/private/contact', { customerId: 'cust', customerName: 'Asha', customerPhone: '0700000001' });
  await seed('ride_requests/job1', { customerId: 'cust', driverId: 'drv', sellerId: 'sel', status: 'accepted', nextTransporterId: 'next1', cargoName: 'TV' });
  await seed('ride_requests/job1/private/contact', { customerId: 'cust', customerName: 'Asha', customerPhone: '0700000001', receiverPhone: '0700000002' });

  console.log('\n# Direct read of an OPEN ride (no contact on the document)');
  expect('customer', await getDoc(T.cust, 'ride_requests/open1'), ALLOW);
  expect('active approved agent', await getDoc(T.agentOk, 'ride_requests/open1'), ALLOW);
  expect('suspended agent (suspended=true)', await getDoc(T.agentSusp, 'ride_requests/open1'), DENY);
  expect('suspended agent (accountStatus)', await getDoc(T.agentAcct, 'ride_requests/open1'), DENY);
  expect('legacy agent without admin stamp', await getDoc(T.agentLegacy, 'ride_requests/open1'), DENY);
  expect('self-declared driver (not an approved agent)', await getDoc(T.drv, 'ride_requests/open1'), DENY);
  expect('unrelated user', await getDoc(T.stranger, 'ride_requests/open1'), DENY);
  expect('unauthenticated', await getDoc(null, 'ride_requests/open1'), DENY);
  expect('admin', await getDoc(T.admin, 'ride_requests/open1'), ALLOW);

  console.log('\n# Direct read of an ASSIGNED ride');
  expect('customer', await getDoc(T.cust, 'ride_requests/job1'), ALLOW);
  expect('assigned driver', await getDoc(T.drv, 'ride_requests/job1'), ALLOW);
  expect('seller of the order', await getDoc(T.sel, 'ride_requests/job1'), ALLOW);
  expect('next transporter', await getDoc(T.next1, 'ride_requests/job1'), ALLOW);
  expect('active agent NOT assigned', await getDoc(T.agentOk, 'ride_requests/job1'), DENY);
  expect('unrelated user', await getDoc(T.stranger, 'ride_requests/job1'), DENY);
  expect('unauthenticated', await getDoc(null, 'ride_requests/job1'), DENY);

  console.log('\n# Private contact subdocument (name / phone / receiver)');
  expect('customer reads own contact', await getDoc(T.cust, 'ride_requests/job1/private/contact'), ALLOW);
  expect('assigned driver reads contact', await getDoc(T.drv, 'ride_requests/job1/private/contact'), ALLOW);
  expect('next transporter reads contact', await getDoc(T.next1, 'ride_requests/job1/private/contact'), ALLOW);
  expect('admin reads contact', await getDoc(T.admin, 'ride_requests/job1/private/contact'), ALLOW);
  expect('seller cannot read buyer contact via ride', await getDoc(T.sel, 'ride_requests/job1/private/contact'), DENY);
  expect('active agent (open board) cannot read contact of open ride', await getDoc(T.agentOk, 'ride_requests/open1/private/contact'), DENY);
  expect('unassigned agent cannot read contact', await getDoc(T.agentOk, 'ride_requests/job1/private/contact'), DENY);
  expect('unrelated user cannot read contact', await getDoc(T.stranger, 'ride_requests/job1/private/contact'), DENY);
  expect('unauthenticated cannot read contact', await getDoc(null, 'ride_requests/job1/private/contact'), DENY);
  expect('driver cannot LIST private subcollection', await query(T.drv, 'private', null, 5, 'ride_requests/job1'), DENY);
  expect('collection-group query on private is denied', await groupQuery(T.agentOk, 'private', 5), DENY);

  console.log('\n# List queries (must be provable from filters)');
  expect('agent: open-status query with limit', await query(T.agentOk, 'ride_requests', [['status', 'in', ['searching', 'pending_acceptance']]], 40), ALLOW);
  expect('agent: open query WITHOUT limit', await query(T.agentOk, 'ride_requests', [['status', 'in', OPEN]]), DENY);
  expect('agent: unfiltered dump', await query(T.agentOk, 'ride_requests', null, 50), DENY);
  expect('agent: accepted-status query (not assigned)', await query(T.agentOk, 'ride_requests', [['status', '==', 'accepted']], 30), DENY);
  expect('suspended agent: open query', await query(T.agentSusp, 'ride_requests', [['status', '==', 'searching']], 40), DENY);
  expect('self-declared driver: open query', await query(T.drv, 'ride_requests', [['status', '==', 'searching']], 40), DENY);
  expect('unrelated user: open query', await query(T.stranger, 'ride_requests', [['status', '==', 'searching']], 40), DENY);
  expect('unauthenticated: open query', await query(null, 'ride_requests', [['status', '==', 'searching']], 40), DENY);
  expect('customer: own rides', await query(T.cust, 'ride_requests', [['customerId', '==', 'cust']], 50), ALLOW);
  expect('stranger: someone else\'s rides by customerId', await query(T.stranger, 'ride_requests', [['customerId', '==', 'cust']], 50), DENY);
  expect('driver: own assigned rides', await query(T.drv, 'ride_requests', [['driverId', '==', 'drv']], 50), ALLOW);
  expect('seller: dispatch list filtered by sellerId', await query(T.sel, 'ride_requests', [['sellerId', '==', 'sel'], ['status', 'in', ['accepted', 'awaiting_pickup', 'pickup_pending', 'seller_confirmed_handover']]], 30), ALLOW);
  expect('seller: dispatch list WITHOUT sellerId filter', await query(T.sel, 'ride_requests', [['status', 'in', ['accepted', 'awaiting_pickup']]], 30), DENY);
  expect('next transporter: own legs', await query(T.next1, 'ride_requests', [['nextTransporterId', '==', 'next1']], 50), ALLOW);
  expect('admin: unfiltered', await query(T.admin, 'ride_requests', null, 50), ALLOW);

  console.log('\n# Create / update guards');
  expect('customer: ride doc WITH customerPhone is rejected', await createDoc(T.cust, 'ride_requests/c1', { customerId: 'cust', status: 'searching', customerPhone: '0711' }), DENY);
  expect('customer: ride doc WITH receiverPhone is rejected', await createDoc(T.cust, 'ride_requests/c2', { customerId: 'cust', status: 'searching', receiverPhone: '0711' }), DENY);
  expect('customer: batch ride + private contact', await commit(T.cust, [
    { path: 'ride_requests/c3', data: { customerId: 'cust', status: 'searching', cargoName: 'Mbao' } },
    { path: 'ride_requests/c3/private/contact', data: { customerId: 'cust', customerName: 'Asha', customerPhone: '0711' } }
  ]), ALLOW);
  expect('stranger: write contact under someone else\'s ride', await createDoc(T.stranger, 'ride_requests/open1/private/contact2', { customerId: 'stranger', customerPhone: '0799' }), DENY);
  expect('customer: private doc with extra key', await commit(T.cust, [
    { path: 'ride_requests/c4', data: { customerId: 'cust', status: 'searching' } },
    { path: 'ride_requests/c4/private/contact', data: { customerId: 'cust', customerPhone: '0711', pickupTokenHash: 'x' } }
  ]), DENY);
  expect('customer: private doc spoofing another customerId', await commit(T.cust, [
    { path: 'ride_requests/c5', data: { customerId: 'cust', status: 'searching' } },
    { path: 'ride_requests/c5/private/contact', data: { customerId: 'stranger', customerPhone: '0711' } }
  ]), DENY);
  expect('customer: updates own contact', await updDoc(T.cust, 'ride_requests/job1/private/contact', { receiverPhone: '0712' }), ALLOW);
  expect('driver: cannot rewrite customer contact', await updDoc(T.drv, 'ride_requests/job1/private/contact', { customerPhone: '0000' }), DENY);
  expect('driver: cannot add customerPhone back onto ride doc', await updDoc(T.drv, 'ride_requests/job1', { customerPhone: '0000' }), DENY);
  expect('customer: cannot add customerName back onto ride doc', await updDoc(T.cust, 'ride_requests/job1', { customerName: 'X' }), DENY);

  console.log(`\nRIDE PRIVACY RULES: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

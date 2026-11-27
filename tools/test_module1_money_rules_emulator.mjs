#!/usr/bin/env node
/**
 * [MODULE 1 2026-11-27] Money is SERVER-WRITE-ONLY — rules proof for the browser wallet paths
 * (gcoWalletAdd, settlementRelease) changed in Module 1. Every case asserts ALLOW or DENY
 * against the real firestore.rules on the emulator. Covers an ordinary user, a group owner and
 * an admin-claim user, so no browser role can move money or mark a group-order settlement.
 *
 *   firebase emulators:exec --only firestore --project demo-sokohai "node tools/test_module1_money_rules_emulator.mjs"
 * Without the emulator: exit 2 (BLOCKED), never a pass.
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  console.error('BLOCKED: FIRESTORE_EMULATOR_HOST haijawekwa. Endesha kupitia `firebase emulators:exec --only firestore`.');
  process.exit(2);
}
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

/* ---------- auth tokens (emulator accepts unsigned JWTs) ---------- */
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
  alice: token('alice', { email: 'alice@test.tz', email_verified: true }),
  bob: token('bob', { email: 'bob@test.tz', email_verified: true }),
  agent: token('agent1', { email: 'agent@test.tz', email_verified: true }),
  fakeAdmin: token('mallory', { email: 'rshabansaid@gmail.com', email_verified: false }),
  realAdmin: token('boss', { email: 'rshabansaid@gmail.com', email_verified: true }),
  claimAdmin: token('ops', { email: 'ops@test.tz', email_verified: true, admin: true }),
  newbie: token('newbie', { email: 'newbie@test.tz', email_verified: false })
};

/* ---------- Firestore REST value encoding ---------- */
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
function fields(o) { return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])); }
async function call(method, url, tok, body) {
  const res = await fetch(url, {
    method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}
const setDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}`, tok, { fields: fields(data) });
const updDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?` + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true', tok, { fields: fields(data) });
const getDoc = (tok, path) => call('GET', `${BASE}/${path}`, tok);
const delDoc = (tok, path) => call('DELETE', `${BASE}/${path}`, tok);
async function list(tok, collection, limit, where, parent) {
  const sq = { from: [{ collectionId: collection }] };
  if (limit) sq.limit = limit;
  if (where) sq.where = { fieldFilter: { field: { fieldPath: where[0] }, op: 'EQUAL', value: enc(where[1]) } };
  return call('POST', `${BASE}${parent ? '/' + parent : ''}:runQuery`, tok, { structuredQuery: sq });
}
const seed = (path, data) => setDoc(OWNER, path, data);
async function listWhere2(tok, collection, limit, w1, w2) {
  const f = w => ({ fieldFilter: { field: { fieldPath: w[0] }, op: 'EQUAL', value: enc(w[1]) } });
  return call('POST', `${BASE}:runQuery`, tok, { structuredQuery: { from: [{ collectionId: collection }], limit, where: { compositeFilter: { op: 'AND', filters: [f(w1), f(w2)] } } } });
}

/* ---------- harness ---------- */
let pass = 0, fail = 0;
const failures = [];
async function expect(label, want, p) {
  const r = await p;
  const allowed = r.ok || r.status === 404; // 404 = rules allowed the read, document absent
  const good = (want === 'ALLOW') === allowed;
  if (good) { pass++; console.log(`PASS  ${want.padEnd(5)} ${label}`); }
  else { fail++; failures.push(label); console.log(`FAIL  expected ${want} got ${allowed ? 'ALLOW' : 'DENY'} (${r.status}) ${label}\n      ${r.text.slice(0, 200)}`); }
}

async function main() {
  await call('DELETE', `http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, null);
  await seed('users/alice', { uid: 'alice', fullName: 'Alice', walletBalance: 1000 });
  await seed('users/bob', { uid: 'bob', fullName: 'Bob', walletBalance: 0 });
  await seed('users/ops', { uid: 'ops', fullName: 'Ops', walletBalance: 0 });
  await seed('chatGroups/g1', { name: 'G1', createdBy: 'alice', ownerId: 'alice', admins: ['alice'] });
  await seed('chatGroups/g1/members/alice', { uid: 'alice', role: 'owner', status: 'active' });
  await seed('chatGroups/g1/members/bob', { uid: 'bob', role: 'member', status: 'active' });
  await seed('chatGroups/g1/groupOrders/go1', { targetPrice: 10000, organizerId: 'alice', productSnapshot: { sellerId: 'bob' } });
  await seed('chatGroups/g1/groupOrders/go1/packages/p1', { qty: 2, status: 'DELIVERED' });
  await seed('wallet_ledger/srv1', { uid: 'bob', kind: 'escrow_release', orderDocId: 'p1', delta: 19700 });

  console.log('\n[wallet balance: users.walletBalance]');
  await expect('seller credits own balance (A3 double credit path)', 'DENY', updDoc(U.bob, 'users/bob', { walletBalance: 19700 }));
  await expect('owner credits another user', 'DENY', updDoc(U.alice, 'users/bob', { walletBalance: 19700 }));
  await expect('admin-claim user credits a balance from the browser', 'DENY', updDoc(U.claimAdmin, 'users/bob', { walletBalance: 19700 }));
  await expect('buyer debits own balance (escrow_hold path)', 'DENY', updDoc(U.alice, 'users/alice', { walletBalance: 0 }));
  await expect('control: user edits own non-money profile field', 'ALLOW', updDoc(U.alice, 'users/alice', { fullName: 'Alice A' }));

  console.log('\n[wallet_ledger]');
  await expect('seller writes a wallet_ledger row', 'DENY', setDoc(U.bob, 'wallet_ledger/fake1', { uid: 'bob', kind: 'escrow_release', orderDocId: 'p1', delta: 19700 }));
  await expect('admin-claim user writes a wallet_ledger row', 'DENY', setDoc(U.claimAdmin, 'wallet_ledger/fake2', { uid: 'bob', kind: 'escrow_release', orderDocId: 'p1', delta: 19700 }));
  await expect('seller edits a server ledger row', 'DENY', updDoc(U.bob, 'wallet_ledger/srv1', { delta: 99999 }));
  await expect('seller deletes a server ledger row', 'DENY', delDoc(U.bob, 'wallet_ledger/srv1'));
  await expect('control: seller reads own server ledger row', 'ALLOW', getDoc(U.bob, 'wallet_ledger/srv1'));
  await expect('other user reads that ledger row', 'DENY', getDoc(U.alice, 'wallet_ledger/srv1'));

  console.log('\n[group order settlement: packages + financialLedger]');
  await expect('group owner marks package settlementReleased', 'DENY', updDoc(U.alice, 'chatGroups/g1/groupOrders/go1/packages/p1', { settlementReleased: true }));
  await expect('member marks package settlementReleased', 'DENY', updDoc(U.bob, 'chatGroups/g1/groupOrders/go1/packages/p1', { settlementReleased: true }));
  await expect('group owner writes financialLedger/main', 'DENY', setDoc(U.alice, 'chatGroups/g1/groupOrders/go1/financialLedger/main', { released: 19700 }));
  await expect('admin-claim user writes financialLedger/main from the browser', 'DENY', setDoc(U.claimAdmin, 'chatGroups/g1/groupOrders/go1/financialLedger/main', { released: 19700 }));
  await expect('control: member reads the package', 'ALLOW', getDoc(U.bob, 'chatGroups/g1/groupOrders/go1/packages/p1'));

  console.log(`\nMODULE 1 MONEY RULES (emulator): ${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1); }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });

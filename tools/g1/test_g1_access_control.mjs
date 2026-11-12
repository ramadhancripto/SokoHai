#!/usr/bin/env node
/**
 * G1 access-control matrix (A–J) vs promoted firestore.rules on the emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-sokohai-g1 node tools/g1/test_g1_access_control.mjs
 * A guest-deny sweep · B public reads · C guest-list deny · D orders party ·
 * E users privacy · F money server-only · G sokopay_links · H calls ·
 * I discoverRequests/productInquiries/sharedContexts/userCards · J conv/notif/disputes/requests.
 * Without the emulator it exits 2 (BLOCKED) and never reports a pass.
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) { console.error('BLOCKED: FIRESTORE_EMULATOR_HOST haijawekwa.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai-g1';
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
  alice: token('alice', { email: 'alice@test.tz', email_verified: true }),
  bob: token('bob', { email: 'bob@test.tz', email_verified: true }),
  eve: token('eve', { email: 'eve@test.tz', email_verified: true }),
  mallory: token('mallory', { email: 'mallory@test.tz', email_verified: true }),
  admin: token('ops', { email: 'ops@test.tz', email_verified: true, admin: true }),
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
const updDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?` + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true', tok, { fields: fields(data) });
const createDoc = (tok, col, id, data) => call('POST', `${BASE}/${col}?documentId=${encodeURIComponent(id)}`, tok, { fields: fields(data) });
const getDoc = (tok, path) => call('GET', `${BASE}/${path}`, tok);
const delDoc = (tok, path) => call('DELETE', `${BASE}/${path}`, tok);
const setDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}`, tok, { fields: fields(data) });
const seed = (path, data) => setDoc(OWNER, path, data);
const runQ = (tok, q) => call('POST', `${BASE}:runQuery`, tok, { structuredQuery: q });
function docIds(r) {
  try {
    const arr = JSON.parse(r.text);
    return (Array.isArray(arr) ? arr : []).filter(x => x.document && x.document.name).map(x => x.document.name.split('/').pop());
  } catch { return []; }
}

let pass = 0, fail = 0; const failures = [];
async function expect(label, want, p) {
  const r = await p;
  const allowed = r.ok || r.status === 404;
  if ((want === 'ALLOW') === allowed) { pass++; console.log(`PASS  ${want.padEnd(5)} ${label}`); }
  else { fail++; failures.push(label); console.log(`FAIL  expected ${want} got ${allowed ? 'ALLOW' : 'DENY'} (${r.status}) ${label}\n      ${r.text.slice(0, 200)}`); }
}
async function expectList(label, want, tok, q, id, present) {
  const r = await runQ(tok, q);
  const ids = docIds(r);
  const has = ids.includes(id);
  const ok = want === 'ALLOW' ? (r.ok && has) : (!has && (r.status === 403 || r.ok));
  if (ok) { pass++; console.log(`PASS  ${want.padEnd(5)} ${label}`); }
  else { fail++; failures.push(label); console.log(`FAIL  expected ${want} got status=${r.status} ids=[${ids.join(',')}] ${label}`); }
}

async function main() {
  await seed('orders/o_ab', { buyerId: 'alice', sellerId: 'bob', amount: 1000, status: 'held', paymentStatus: 'paid', paymentVerified: true });
  await seed('users/alice', { uid: 'alice', displayName: 'Alice' });
  await seed('wallet_ledger/w_a', { userId: 'alice', amount: 5 });
  await seed('escrow_holds/h_1', { kind: 't' });
  await seed('inventory_reservations/ir_1', { buyerId: 'alice', sellerId: 'bob' });
  await seed('disputes/d_ab', { buyerId: 'alice', sellerId: 'bob' });
  await seed('notifications/n_a', { userId: 'alice', type: 'info', title: 't', body: 'b' });
  await seed('conversations/conv_ab', { participants: ['alice', 'bob'], type: 'direct' });
  await seed('requests/rq_ab', { senderId: 'alice', receiverId: 'bob', status: 'pending' });
  await seed('sokopay_links/l_ab', { userId: 'alice', buyerId: 'alice', amount: 500 });
  await seed('calls/c_ab', { from: 'alice', to: 'bob', state: 'ringing' });
  await seed('discoverRequests/dr_a', { userId: 'alice' });
  await seed('productInquiries/pi_ab', { buyerId: 'alice', sellerId: 'bob', productId: 'p1' });
  await seed('sharedContexts/g_1', { participants: ['alice', 'bob'] });
  await seed('userCards/alice', { displayName: 'Alice' });
  await seed('userCards/bob', { displayName: 'Bob' });
  for (const c of ['products/p1', 'services/s1', 'publicProfiles/pp1', 'comments/cm1', 'commentLikes/cl1', 'drivers/d1', 'transport_profiles/tp1', 'logistics_companies/lc1', 'productPriceHistory/ph1', 'price_drop_board/pd1']) await seed(c, { t: 1 });

  for (const p of ['orders/o_ab', 'users/alice', 'sokopay_links/l_ab', 'calls/c_ab', 'sharedContexts/g_1', 'userCards/alice', 'conversations/conv_ab', 'notifications/n_a', 'disputes/d_ab']) {
    const s = await getDoc(OWNER, p);
    if (!s.ok) { console.error('SEED-FAIL ' + p + ' status=' + s.status); process.exit(2); }
  }
  console.log('seeds verified');

  for (const p of ['orders/o_ab', 'users/alice', 'wallet_ledger/w_a', 'escrow_holds/h_1', 'inventory_reservations/ir_1', 'sokopay_links/l_ab', 'disputes/d_ab', 'notifications/n_a', 'requests/rq_ab', 'conversations/conv_ab', 'calls/c_ab', 'discoverRequests/dr_a', 'productInquiries/pi_ab', 'sharedContexts/g_1'])
    await expect(`A guest get ${p} DENY`, 'DENY', getDoc(null, p));

  for (const p of ['products/p1', 'services/s1', 'publicProfiles/pp1', 'comments/cm1', 'commentLikes/cl1', 'drivers/d1', 'transport_profiles/tp1', 'logistics_companies/lc1', 'productPriceHistory/ph1', 'price_drop_board/pd1', 'userCards/alice'])
    await expect(`B guest get ${p} ALLOW`, 'ALLOW', getDoc(null, p));

  await expect('C guest list orders DENY', 'DENY', runQ(null, { from: [{ collectionId: 'orders' }], limit: 10 }));
  await expect('C guest list notifications DENY', 'DENY', runQ(null, { from: [{ collectionId: 'notifications' }], limit: 10 }));
  await expect('C guest list conversations DENY', 'DENY', runQ(null, { from: [{ collectionId: 'conversations' }], limit: 10 }));
  await expect('C guest list userCards DENY', 'DENY', runQ(null, { from: [{ collectionId: 'userCards' }], limit: 10 }));

  await expect('D buyer reads own order ALLOW', 'ALLOW', getDoc(U.alice, 'orders/o_ab'));
  await expect('D seller reads own order ALLOW', 'ALLOW', getDoc(U.bob, 'orders/o_ab'));
  await expect('D stranger reads order DENY', 'DENY', getDoc(U.eve, 'orders/o_ab'));
  await expect('D mallory reads order DENY', 'DENY', getDoc(U.mallory, 'orders/o_ab'));
  await expect('D stranger updates order DENY', 'DENY', updDoc(U.eve, 'orders/o_ab', { status: 'shipped' }));
  await expect('D buyer deletes order DENY', 'DENY', delDoc(U.alice, 'orders/o_ab'));

  await expect('E owner reads own profile ALLOW', 'ALLOW', getDoc(U.alice, 'users/alice'));
  await expect('E non-owner reads profile DENY', 'DENY', getDoc(U.bob, 'users/alice'));
  await expect('E non-owner updates profile DENY', 'DENY', updDoc(U.bob, 'users/alice', { displayName: 'X' }));
  await expect('E owner edits walletBalance DENY', 'DENY', updDoc(U.alice, 'users/alice', { walletBalance: 999 }));
  await expect('E guest creates user DENY', 'DENY', createDoc(null, 'users', 'gx1', { uid: 'x' }));

  await expect('F user creates ledger DENY', 'DENY', createDoc(U.alice, 'wallet_ledger', 'fx1', { userId: 'alice' }));
  await expect('F user updates ledger DENY', 'DENY', updDoc(U.alice, 'wallet_ledger/w_a', { amount: 1 }));
  await expect('F user creates escrow_hold DENY', 'DENY', createDoc(U.bob, 'escrow_holds', 'fx2', {}));
  await expect('F owner reads own ledger ALLOW', 'ALLOW', getDoc(U.alice, 'wallet_ledger/w_a'));
  await expect('F user reads escrow_hold DENY', 'DENY', getDoc(U.alice, 'escrow_holds/h_1'));
  await expect('F admin reads escrow_hold ALLOW', 'ALLOW', getDoc(U.admin, 'escrow_holds/h_1'));

  await expect('G party gets link ALLOW', 'ALLOW', getDoc(U.alice, 'sokopay_links/l_ab'));
  await expect('G signed-in non-party gets link ALLOW', 'ALLOW', getDoc(U.eve, 'sokopay_links/l_ab'));
  const linkWhere = (f, v, l) => ({ from: [{ collectionId: 'sokopay_links' }], where: { fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } }, limit: l });
  await expectList('G owner lists own links (app pattern) ALLOW', 'ALLOW', U.alice, linkWhere('userId', 'alice', 10), 'l_ab', true);
  await expectList('G buyer lists own links (app pattern) ALLOW', 'ALLOW', U.alice, linkWhere('buyerId', 'alice', 5), 'l_ab', true);
  await expectList('G stranger filtered-list excludes link', 'DENY', U.eve, linkWhere('userId', 'alice', 10), 'l_ab', false);
  await expect('G unfiltered list blocked (no enumeration) DENY', 'DENY', runQ(U.eve, { from: [{ collectionId: 'sokopay_links' }], limit: 10 }));
  await expect('G guest creates link DENY', 'DENY', createDoc(null, 'sokopay_links', 'gx2', { userId: 'x' }));

  await expect('H caller creates call ALLOW', 'ALLOW', createDoc(U.alice, 'calls', 'c_new1', { from: 'alice', to: 'bob', state: 'ringing' }));
  await expect('H forged caller DENY', 'DENY', createDoc(U.eve, 'calls', 'c_new2', { from: 'alice', to: 'bob' }));
  await expect('H guest creates call DENY', 'DENY', createDoc(null, 'calls', 'c_new3', { from: 'x', to: 'y' }));
  await expect('H callee reads call ALLOW', 'ALLOW', getDoc(U.bob, 'calls/c_ab'));
  await expect('H stranger reads call DENY', 'DENY', getDoc(U.eve, 'calls/c_ab'));
  await expect('H party updates state ALLOW', 'ALLOW', updDoc(U.alice, 'calls/c_ab', { state: 'ended' }));
  await expect('H stranger updates call DENY', 'DENY', updDoc(U.eve, 'calls/c_ab', { state: 'ended' }));
  await expect('H party changes from-field DENY', 'DENY', updDoc(U.bob, 'calls/c_ab', { from: 'mallory' }));

  await expect('I owner creates discoverRequest ALLOW', 'ALLOW', createDoc(U.alice, 'discoverRequests', 'dr_new', { userId: 'alice' }));
  await expect('I owner reads own discoverRequest ALLOW', 'ALLOW', getDoc(U.alice, 'discoverRequests/dr_a'));
  await expect('I stranger reads discoverRequest DENY', 'DENY', getDoc(U.bob, 'discoverRequests/dr_a'));
  await expect('I admin reads discoverRequest ALLOW', 'ALLOW', getDoc(U.admin, 'discoverRequests/dr_a'));
  await expect('I buyer creates inquiry ALLOW', 'ALLOW', createDoc(U.alice, 'productInquiries', 'pi_new', { buyerId: 'alice', sellerId: 'bob', productId: 'p1' }));
  await expect('I seller reads inquiry ALLOW', 'ALLOW', getDoc(U.bob, 'productInquiries/pi_ab'));
  await expect('I stranger reads inquiry DENY', 'DENY', getDoc(U.eve, 'productInquiries/pi_ab'));
  await expect('I stranger updates inquiry DENY', 'DENY', updDoc(U.eve, 'productInquiries/pi_ab', { note: 'x' }));
  await expect('I participant reads sharedContext ALLOW', 'ALLOW', getDoc(U.alice, 'sharedContexts/g_1'));
  await expect('I non-participant reads sharedContext DENY', 'DENY', getDoc(U.eve, 'sharedContexts/g_1'));
  await expect('I member creates sharedContext ALLOW', 'ALLOW', createDoc(U.eve, 'sharedContexts', 'g_new', { participants: ['eve', 'alice'] }));
  await expect('I outsider creates sharedContext DENY', 'DENY', createDoc(U.eve, 'sharedContexts', 'g_new2', { participants: ['alice'] }));
  await expectList('I signed-in lists userCards ALLOW', 'ALLOW', U.alice, { from: [{ collectionId: 'userCards' }], limit: 10 }, 'alice', true);
  await expect('I user updates userCard DENY', 'DENY', updDoc(U.alice, 'userCards/alice', { displayName: 'X' }));

  await expect('J participant gets conversation ALLOW', 'ALLOW', getDoc(U.alice, 'conversations/conv_ab'));
  await expect('J stranger gets conversation DENY', 'DENY', getDoc(U.eve, 'conversations/conv_ab'));
  await expectList('J inbox list returns mine ALLOW', 'ALLOW', U.alice, { from: [{ collectionId: 'conversations' }], where: { fieldFilter: { field: { fieldPath: 'participants' }, op: 'ARRAY_CONTAINS', value: { stringValue: 'alice' } } }, limit: 10 }, 'conv_ab', true);
  await expect('J owner gets notification ALLOW', 'ALLOW', getDoc(U.alice, 'notifications/n_a'));
  await expect('J stranger gets notification DENY', 'DENY', getDoc(U.bob, 'notifications/n_a'));
  await expect('J user notifies another ALLOW', 'ALLOW', createDoc(U.alice, 'notifications', 'g1note1', { userId: 'bob', type: 'info', title: 'Hi', body: 'Hello', fromUid: 'alice' }));
  await expect('J reserved-prefix notification DENY', 'DENY', createDoc(U.eve, 'notifications', 'escrow_x1', { userId: 'bob', type: 'info', title: 'Hi', body: 'Hello' }));
  await expect('J buyer gets dispute ALLOW', 'ALLOW', getDoc(U.alice, 'disputes/d_ab'));
  await expect('J stranger gets dispute DENY', 'DENY', getDoc(U.eve, 'disputes/d_ab'));
  await expect('J party updates dispute DENY', 'DENY', updDoc(U.alice, 'disputes/d_ab', { note: 'x' }));
  await expect('J stranger gets request DENY', 'DENY', getDoc(U.eve, 'requests/rq_ab'));

  console.log(`\nG1: pass=${pass} fail=${fail}`);
  if (fail) { console.log('FAILURES:', failures.join(' | ')); process.exit(1); }
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });

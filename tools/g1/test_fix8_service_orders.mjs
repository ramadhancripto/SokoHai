#!/usr/bin/env node
/**
 * [LAUNCH-FIX 2026-11-09] Fix 8: seller-side service-order create (fundi
 * anakubali ombi -> orders held) + ship/dispute transitions. Needs the
 * Firestore emulator with PROMOTED firestore.rules:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-sokohai-g1 node tools/g1/test_fix8_service_orders.mjs
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
  fundi: token('bob', { email: 'bob@test.tz', email_verified: true }),
  buyer: token('alice', { email: 'alice@test.tz', email_verified: true }),
  other: token('eve', { email: 'eve@test.tz', email_verified: true }),
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
const createDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?currentDocument.exists=false`, tok, { fields: fields(data) });
const getDoc = (tok, path) => call('GET', `${BASE}/${path}`, tok);
const setDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}`, tok, { fields: fields(data) });
const seed = (path, data) => setDoc(OWNER, path, data);

let pass = 0, fail = 0; const failures = [];
async function expect(label, want, p) {
  const r = await p;
  const allowed = r.ok || r.status === 404;
  if ((want === 'ALLOW') === allowed) { pass++; console.log(`PASS  ${want.padEnd(5)} ${label}`); }
  else { fail++; failures.push(label); console.log(`FAIL  expected ${want} got ${allowed ? 'ALLOW' : 'DENY'} (${r.status}) ${label}\n      ${r.text.slice(0, 240)}`); }
}

const svcOrder = (extra = {}) => Object.assign({
  buyerId: 'alice', buyerName: 'Alice', sellerId: 'bob', sellerName: 'Fundi Bob',
  itemId: 'req_acc_1', itemTitle: 'Huduma: Ukarabati', amount: 50000,
  status: 'awaiting_payment', collectionName: 'services', date: new Date().toISOString(),
  paymentStatus: 'pending', paymentVerified: false
}, extra);

async function main() {
  await seed('requests/req_acc_1', { senderId: 'alice', senderName: 'Alice', receiverId: 'bob', status: 'accepted', itemTitle: 'Ukarabati', detail2: 50000 });
  await seed('requests/req_pend_1', { senderId: 'alice', senderName: 'Alice', receiverId: 'bob', status: 'pending', itemTitle: 'Ukarabati', detail2: 50000 });
  await seed('requests/req_other_1', { senderId: 'alice', senderName: 'Alice', receiverId: 'eve', status: 'accepted', itemTitle: 'Ukarabati', detail2: 50000 });
  const paidHeld = { buyerId: 'alice', sellerId: 'bob', amount: 50000, status: 'held', paymentStatus: 'paid', paymentVerified: true, itemTitle: 'Huduma: Ukarabati', collectionName: 'services' };
  await seed('orders/o_held_paid', paidHeld);
  await seed('orders/o_held_paid2', paidHeld);
  await seed('orders/o_held_unpaid', { buyerId: 'alice', sellerId: 'bob', amount: 20000, status: 'held', paymentStatus: 'pending', paymentVerified: false, itemTitle: 'Huduma', collectionName: 'services' });
  for (const p of ['requests/req_acc_1', 'requests/req_pend_1', 'orders/o_held_paid', 'orders/o_held_paid2', 'orders/o_held_unpaid']) {
    const s = await getDoc(OWNER, p);
    if (!s.ok) { console.error('SEED-FAIL ' + p + ' status=' + s.status); process.exit(2); }
  }
  console.log('seeds verified');

  await expect('fundi creates awaiting_payment order backed by accepted request', 'ALLOW', createDoc(U.fundi, 'orders/svc_ok_1', svcOrder()));
  // [I-I1] 'held' inadai pesa iko escrow — fundi hawezi kuunda held moja kwa
  // moja; server (serviceOrderWalletPay/settle) ndiyo inayohamishia held.
  await expect('DENY fundi creates held directly (escrow-lie guard)', 'DENY', createDoc(U.fundi, 'orders/svc_held_1', svcOrder({ status: 'held' })));
  await expect('DENY pending (not accepted) backing request', 'DENY', createDoc(U.fundi, 'orders/svc_pend_1', svcOrder({ itemId: 'req_pend_1' })));
  await expect('DENY backing request addressed to another fundi', 'DENY', createDoc(U.fundi, 'orders/svc_oth_1', svcOrder({ itemId: 'req_other_1' })));
  await expect('DENY nonexistent backing request', 'DENY', createDoc(U.fundi, 'orders/svc_no_1', svcOrder({ itemId: 'req_missing_xyz' })));
  await expect('DENY zero amount', 'DENY', createDoc(U.fundi, 'orders/svc_amt_1', svcOrder({ amount: 0 })));
  await expect('DENY buyer == seller', 'DENY', createDoc(U.fundi, 'orders/svc_self_1', svcOrder({ buyerId: 'bob' })));
  await expect('DENY non-awaiting_payment initial status', 'DENY', createDoc(U.fundi, 'orders/svc_st_1', svcOrder({ status: 'completed' })));
  await expect('DENY eve forging sellerId=bob', 'DENY', createDoc(U.other, 'orders/svc_forge_1', svcOrder()));
  await expect('DENY pre-verified payment flag', 'DENY', createDoc(U.fundi, 'orders/svc_pv_1', svcOrder({ paymentVerified: true })));
  await expect('DENY guest creates service order', 'DENY', createDoc(null, 'orders/svc_guest_1', svcOrder()));
  await expect('buyer creates own unpaid order', 'ALLOW', createDoc(U.buyer, 'orders/buy_ok_1',
    { buyerId: 'alice', sellerId: 'bob', amount: 10000, status: 'payment_pending', paymentStatus: 'pending', paymentVerified: false, itemTitle: 'Kiti', collectionName: 'products' }));
  await expect('seller ships paid held order', 'ALLOW', updDoc(U.fundi, 'orders/o_held_paid', { status: 'shipped', shippedAt: new Date().toISOString() }));
  await expect('DENY stranger ships paid order', 'DENY', updDoc(U.other, 'orders/o_held_paid2', { status: 'shipped' }));
  await expect('DENY seller ships UNPAID held order', 'DENY', updDoc(U.fundi, 'orders/o_held_unpaid', { status: 'shipped' }));
  await expect('DENY seller edits money amount', 'DENY', updDoc(U.fundi, 'orders/o_held_paid2', { amount: 1 }));
  await expect('DENY buyer completes order directly', 'DENY', updDoc(U.buyer, 'orders/o_held_paid2', { status: 'completed' }));
  await expect('buyer disputes held order', 'ALLOW', updDoc(U.buyer, 'orders/o_held_paid2', { status: 'disputed' }));
  await expect('DENY guest reads order', 'DENY', getDoc(null, 'orders/o_held_paid2'));
  await expect('buyer reads own order', 'ALLOW', getDoc(U.buyer, 'orders/o_held_paid2'));

  console.log(`\nFIX8 SERVICE ORDERS: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILURES:', failures.join(' | ')); process.exit(1); }
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });

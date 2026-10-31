#!/usr/bin/env node
/**
 * [REPAIR 2026-10] Firestore rules regression suite for the audit findings
 * C1-C5, H1, H4-H6, M1, L1 and the Group Buy / Auction rule changes.
 *
 * Needs the Firestore emulator (no npm dependencies):
 *   firebase emulators:exec --only firestore --project demo-sokohai "node tools/test_repair_rules.mjs"
 *
 * Every case asserts ALLOW or DENY. Without the emulator the script exits 2
 * (BLOCKED) — it never reports a pass it did not run.
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

  // Seed (rules bypassed with the emulator owner token).
  await seed('users/alice', { uid: 'alice', fullName: 'Alice', phone: '0700000001', walletBalance: 0 });
  await seed('users/bob', { uid: 'bob', fullName: 'Bob', phone: '0700000002', walletBalance: 5000, agentCode: 'AGT-111111' });
  await seed('users/agent1', { uid: 'agent1', fullName: 'Agent', isApprovedAgent: true, agentApprovedBy: 'admin1', myAgentCode: 'AGT-222222' });
  await seed('agents/a_alice', { userId: 'alice', status: 'pending' });
  await seed('orders/o1', { buyerId: 'alice', sellerId: 'bob', amount: 1000, status: 'held', paymentVerified: true, paymentStatus: 'paid' });
  await seed('wallet_ledger/l_bob', { userId: 'bob', callerUid: 'bob', amountTSh: 5000 });
  await seed('shop_ledger/s_bob', { shopOwnerId: 'bob', amount: 100, type: 'income' });
  await seed('sokopay_core_transactions/c_bob', { buyerId: 'bob', sellerId: 'carol', amount: 900 });
  await seed('conversations/c1', { participants: ['alice', 'bob'] });
  await seed('comments/k1', { authorId: 'bob', text: 'hi', likeCount: 0 });
  await seed('products/p1', { userId: 'bob', title: 'Simu', price: 1000, stock: 3, modeData: { mode: 'auction', currentBid: 1000, totalBids: 0 } });
  await seed('chatGroups/g1', { createdBy: 'bob', visibility: 'public', discoverable: true });
  await seed('system/config', { fees: { enabled: false } });

  console.log('\n-- C1 agent / privilege escalation');
  await expect('user self-sets users.isApprovedAgent', 'DENY', updDoc(U.alice, 'users/alice', { isApprovedAgent: true }));
  await expect('user self-sets myAgentCode (commission hijack H4)', 'DENY', updDoc(U.alice, 'users/alice', { myAgentCode: 'AGT-111111' }));
  // [B-09] Found by the browser E2E: the exact doSignup payload was denied.
  const SIGNUP = { uid: 'newbie', fullName: 'Newbie', phone: '0700000009', email: 'newbie@test.tz', agentCode: '', createdAt: '2026-10-31T00:00:00Z', walletBalance: 0, followers: [], following: [] };
  await expect('B-09 sign-up creates own profile (doSignup payload, walletBalance 0)', 'ALLOW', setDoc(U.newbie, 'users/newbie', SIGNUP));
  await expect('B-09 sign-up with walletBalance > 0', 'DENY', setDoc(U.newbie, 'users/newbie_b', Object.assign({}, SIGNUP, { walletBalance: 5000 })));
  await expect('B-09 sign-up with role admin', 'DENY', setDoc(U.newbie, 'users/newbie_c', Object.assign({}, SIGNUP, { role: 'admin' })));
  await expect('B-09 sign-up with isVerified', 'DENY', setDoc(U.newbie, 'users/newbie_d', Object.assign({}, SIGNUP, { isVerified: true })));
  await expect('user creates profile already isApprovedAgent', 'DENY', setDoc(U.alice, 'users/alice2', { uid: 'alice', isApprovedAgent: true }));
  await expect('user files own approved agent application', 'DENY', setDoc(U.alice, 'agents/x1', { userId: 'alice', status: 'approved' }));
  await expect('user files own pending agent application', 'ALLOW', setDoc(U.alice, 'agents/x2', { userId: 'alice', status: 'pending', isPaid: false, paymentStatus: 'pending' }));
  await expect('user approves own pending application', 'DENY', updDoc(U.alice, 'agents/a_alice', { status: 'approved' }));
  await expect('user edits own profile name', 'ALLOW', updDoc(U.alice, 'users/alice', { fullName: 'Alice M' }));
  await expect('user changes own walletBalance', 'DENY', updDoc(U.alice, 'users/alice', { walletBalance: 999999 }));
  await expect('H5 user points shopOwnerUid at another owner', 'DENY', updDoc(U.alice, 'users/alice', { shopOwnerUid: 'bob' }));
  await expect('user sets shopOwnerUid to self', 'ALLOW', updDoc(U.alice, 'users/alice', { shopOwnerUid: 'alice' }));
  await expect('user edits another user profile', 'DENY', updDoc(U.alice, 'users/bob', { fullName: 'x' }));

  console.log('\n-- H1 admin identity');
  await expect('UNVERIFIED admin email approves agent', 'DENY', updDoc(U.fakeAdmin, 'agents/a_alice', { status: 'approved' }));
  await expect('VERIFIED admin email edits agent', 'ALLOW', updDoc(U.realAdmin, 'agents/a_alice', { note: 'checked' }));
  await expect('admin claim reads escrow_holds', 'ALLOW', list(U.claimAdmin, 'escrow_holds', 5));
  await expect('admin (non-super) writes system/config', 'DENY', updDoc(U.claimAdmin, 'system/config', { fees: { enabled: true } }));
  // [M7] policy change: config writes now carry an author stamp (see M7 section).
  await expect('super admin writes system/config (with author stamp)', 'ALLOW', updDoc(U.realAdmin, 'system/config', { fees: { enabled: false }, lastChangedBy: 'boss', lastChangedAt: '2026-10-31T00:00:01Z', lastChangedVia: 'browser' }));

  console.log('\n-- C2 fake paid orders / H2');
  await expect('buyer creates order already held+paid', 'DENY', setDoc(U.alice, 'orders/f1', { buyerId: 'alice', sellerId: 'bob', amount: 10, status: 'held', paymentStatus: 'paid', paymentVerified: true }));
  await expect('buyer creates order with paidAt', 'DENY', setDoc(U.alice, 'orders/f2', { buyerId: 'alice', sellerId: 'bob', amount: 10, status: 'payment_pending', paidAt: '2026-01-01' }));
  await expect('buyer creates unpaid order', 'ALLOW', setDoc(U.alice, 'orders/f3', { buyerId: 'alice', sellerId: 'bob', amount: 10, status: 'payment_pending', paymentStatus: 'pending', paymentVerified: false }));
  await expect('buyer creates self-trade order', 'DENY', setDoc(U.alice, 'orders/f4', { buyerId: 'alice', sellerId: 'alice', amount: 10, status: 'payment_pending' }));
  await expect('buyer completes order (release)', 'DENY', updDoc(U.alice, 'orders/o1', { status: 'completed' }));
  await expect('buyer changes order amount', 'DENY', updDoc(U.alice, 'orders/o1', { amount: 1 }));
  await expect('buyer opens dispute on held order', 'ALLOW', updDoc(U.alice, 'orders/o1', { status: 'disputed' }));

  console.log('\n-- C3 open collections');
  await expect('stranger reads another shop ledger', 'DENY', getDoc(U.alice, 'shop_ledger/s_bob'));
  await expect('stranger deletes another shop ledger', 'DENY', delDoc(U.alice, 'shop_ledger/s_bob'));
  await expect('owner reads own shop ledger', 'ALLOW', getDoc(U.bob, 'shop_ledger/s_bob'));
  await expect('owner deletes own ledger entry (append-only)', 'DENY', delDoc(U.bob, 'shop_ledger/s_bob'));
  await expect('stranger reads SokoPay core tx', 'DENY', getDoc(U.alice, 'sokopay_core_transactions/c_bob'));
  await expect('party reads SokoPay core tx', 'ALLOW', getDoc(U.bob, 'sokopay_core_transactions/c_bob'));
  await expect('stranger writes customers for another shop', 'DENY', setDoc(U.alice, 'customers/x', { shopOwnerId: 'bob', name: 'x' }));
  await expect('stranger overwrites a driver profile', 'DENY', setDoc(U.alice, 'drivers/d1', { userId: 'bob', name: 'x' }));
  await expect('driver self-verifies', 'DENY', setDoc(U.alice, 'drivers/d2', { userId: 'alice', verified: true }));

  console.log('\n-- C4 bulk personal / financial reads');
  await expect('list ALL users without limit', 'DENY', list(U.alice, 'users'));
  // [C4 users privacy] policy change: another user's private profile is no longer readable.
  await expect('lookup another user (limit 1) -> private now', 'DENY', list(U.alice, 'users', 1, ['uid', 'bob']));
  await expect('paged scrape of users (limit 10)', 'DENY', list(U.alice, 'users', 10));
  await expect('get another user profile (phone, wallet)', 'DENY', getDoc(U.alice, 'users/bob'));
  await expect('owner reads own profile', 'ALLOW', getDoc(U.alice, 'users/alice'));
  // 404 = allowed but missing; 403 = denied by rules.
  const notDenied = p => p.then(r => Object.assign({}, r, { ok: r.ok || r.status === 404 }));
  await expect('new user probes own (missing) profile doc', 'ALLOW', notDenied(getDoc(token('newbie'), 'users/newbie')));
  await expect('user probes another missing profile doc', 'DENY', notDenied(getDoc(U.alice, 'users/newbie')));
  await expect('owner queries own profile by uid', 'ALLOW', list(U.alice, 'users', 1, ['uid', 'alice']));
  await expect('admin (claim) reads any profile', 'ALLOW', getDoc(U.claimAdmin, 'users/bob'));
  await expect('unverified admin e-mail reads profile', 'DENY', getDoc(U.fakeAdmin, 'users/bob'));
  await seed('users/skhm_m1', { uid: 'skhm_m1', fullName: 'Member', isOfflineUser: true, createdByAgentId: 'agent1', managedByAgentUid: 'agent1', memberId: 'SKH-00000001' });
  await expect('managing agent reads its offline member', 'ALLOW', getDoc(U.agent, 'users/skhm_m1'));
  await expect('managing agent finds member by code (own members only)', 'ALLOW', listWhere2(U.agent, 'users', 1, ['memberId', 'SKH-00000001'], ['createdByAgentId', 'agent1']));
  await expect('other user reads offline member', 'DENY', getDoc(U.bob, 'users/skhm_m1'));
  await seed('userCards/bob', { uid: 'bob', docId: 'bob', fullName: 'Bob', followersCount: 0 });
  await expect('anyone reads a public user card', 'ALLOW', getDoc(null, 'userCards/bob'));
  await expect('batch card lookup (limit 10)', 'ALLOW', list(U.alice, 'userCards', 10));
  await expect('unbounded card listing', 'DENY', list(U.alice, 'userCards'));
  await expect('user writes own public card', 'DENY', setDoc(U.bob, 'userCards/bob', { uid: 'bob', fullName: 'Bob', isVerified: true }));
  await expect('user forges someone else\'s card', 'DENY', setDoc(U.alice, 'userCards/bob', { uid: 'bob', fullName: 'Scam' }));

  console.log('\n-- Follow (followers list on another profile)');
  await seed('users/carol', { uid: 'carol', fullName: 'Carol', followers: ['bob'] });
  await expect('follow: add own uid to another followers list', 'ALLOW', updDoc(U.alice, 'users/carol', { followers: ['bob', 'alice'] }));
  await expect('unfollow: remove own uid', 'ALLOW', updDoc(U.alice, 'users/carol', { followers: ['bob'] }));
  await expect('follow: add someone else uid', 'DENY', updDoc(U.alice, 'users/carol', { followers: ['bob', 'mallory'] }));
  await expect('follow: remove another follower', 'DENY', updDoc(U.alice, 'users/carol', { followers: [] }));
  await expect('follow: add self AND remove other', 'DENY', updDoc(U.alice, 'users/carol', { followers: ['alice'] }));
  await expect('follow write also changes fullName', 'DENY', updDoc(U.alice, 'users/carol', { followers: ['bob', 'alice'], fullName: 'x' }));
  await expect('read another user wallet ledger', 'DENY', getDoc(U.alice, 'wallet_ledger/l_bob'));
  await expect('read own wallet ledger', 'ALLOW', getDoc(U.bob, 'wallet_ledger/l_bob'));
  await expect('list all wallet_ledger', 'DENY', list(U.alice, 'wallet_ledger', 50));

  console.log('\n-- H6 / M1 forged trust signals');
  await expect('client posts payprot_ chat message', 'DENY', setDoc(U.alice, 'conversations/c1/messages/payprot_o1', { senderId: 'alice', type: 'order', text: '' }));
  await expect('client posts protected order snapshot', 'DENY', setDoc(U.alice, 'conversations/c1/messages/m2', { senderId: 'alice', type: 'order', orderSnapshot: { protected: true } }));
  await expect('client posts normal chat message', 'ALLOW', setDoc(U.alice, 'conversations/c1/messages/m3', { senderId: 'alice', text: 'habari' }));
  await expect('client creates payprot_ notification', 'DENY', setDoc(U.alice, 'notifications/payprot_o1', { userId: 'bob', title: 'paid' }));
  await expect('client creates normal notification', 'ALLOW', setDoc(U.alice, 'notifications/n1', { userId: 'bob', title: 'Habari' }));

  console.log('\n-- L1 likes / auction / group buy');
  await expect('likeCount jumps by 50', 'DENY', updDoc(U.alice, 'comments/k1', { likeCount: 50 }));
  // [B-10] Found by the browser E2E: the main product form sends businessId/storeId null.
  const NEWP = { title: 'Simu E2E', price: 150000, stock: 0, openingStockPending: true, userId: 'alice', businessId: null, storeId: null, publicationStatus: 'published', availabilityStatus: 'available', variants: [], imagesArray: ['x'], modeData: {} };
  await expect('B-10 seller publishes product with businessId/storeId null', 'ALLOW', setDoc(U.alice, 'products/new1', NEWP));
  await expect('B-10 product scoped to a business that does not exist', 'DENY', setDoc(U.alice, 'products/new2', Object.assign({}, NEWP, { businessId: 'nope' })));
  await expect('B-10 product created with stock already > 0', 'DENY', setDoc(U.alice, 'products/new3', Object.assign({}, NEWP, { stock: 5 })));
  await expect('B-10 product created for another seller', 'DENY', setDoc(U.alice, 'products/new4', Object.assign({}, NEWP, { userId: 'bob' })));
  // [B-11] chat block listener on a pair with no block document
  await expect('B-11 user reads missing block doc for own pair', 'ALLOW', getDoc(U.alice, 'chatBlocks/alice__bob'));
  await expect('B-11 user reads missing block doc of reversed own pair', 'ALLOW', getDoc(U.alice, 'chatBlocks/bob__alice'));
  await expect('B-11 user reads block doc of a pair not involving them', 'DENY', getDoc(U.alice, 'chatBlocks/bob__carol'));
  // [B-12] view / share counters
  await expect('B-12 buyer adds one view to a product', 'ALLOW', updDoc(U.alice, 'products/p1', { views: 1 }));
  await expect('B-12 buyer adds 1000 views at once', 'DENY', updDoc(U.alice, 'products/p1', { views: 1001 }));
  await expect('B-12 buyer adds a view and changes the price', 'DENY', updDoc(U.alice, 'products/p1', { views: 2, price: 1 }));
  await expect('B-12 buyer adds one share', 'ALLOW', updDoc(U.alice, 'products/p1', { shares: 1 }));
  // [B-13] SokoPay link as the real form writes it (17-hub.js generateSokoPayCode)
  const LINK = { contractType: 'service', title: 'Simu', price: 50000, estimatedPlatformFee: 2500, carrierShare: 0, sellerShare: 47500, partnerContact: '', description: '', image: '', code: 'SP-ABC123', link: 'x', qrDataUrl: 'x', userId: 'alice', ownerName: 'Alice', userEmail: 'alice@test.tz', status: 'pending', isSokoPay: true, metadata: {}, createdAt: '2026-10-31' };
  await expect('B-13 seller creates SokoPay link (form payload)', 'ALLOW', setDoc(U.alice, 'sokopay_links/l_new', LINK));
  await expect('B-13 seller creates link with server platformFee', 'DENY', setDoc(U.alice, 'sokopay_links/l_new2', Object.assign({}, LINK, { platformFee: 0 })));
  await expect('B-13 seller creates link already paid', 'DENY', setDoc(U.alice, 'sokopay_links/l_new3', Object.assign({}, LINK, { paymentVerified: true })));
  // [B-16] fake money notices to another user
  await expect('B-16 buyer tells seller "escrow funded" (event)', 'DENY', setDoc(U.alice, 'notifications/n_fake1', { userId: 'bob', event: 'wallet.escrowFunded', title: 'x', body: 'y' }));
  await expect('B-16 buyer tells seller "Malipo yamepokelewa" (title)', 'DENY', setDoc(U.alice, 'notifications/n_fake2', { userId: 'bob', title: ' Malipo ya SokoPay Yamepokelewa!', body: 'y' }));
  await expect('B-16 payment.success event to another user', 'DENY', setDoc(U.alice, 'notifications/n_fake3', { userId: 'bob', event: 'payment.success', title: 'ok' }));
  await expect('B-16 normal chat/nego notice to another user still allowed', 'ALLOW', setDoc(U.alice, 'notifications/n_ok1', { userId: 'bob', event: 'nego.offerReceived', title: 'Ofa mpya', body: 'Una ofa' }));
  await expect('B-16 payment link invitation still allowed', 'ALLOW', setDoc(U.alice, 'notifications/n_ok2', { userId: 'bob', event: 'wallet.paymentLink', title: ' SokoPay: Payment Link Mpya Inakusubiri!' }));
  await expect('B-16 user notifies self about own deposit', 'ALLOW', setDoc(U.alice, 'notifications/n_ok3', { userId: 'alice', title: ' SokoPay: Salio Limeongezeka!' }));
  // [B-18] admin browser edits must be signed; nobody signs as someone else
  const STAMP = { lastChangedBy: 'ops', lastChangedAt: '2026-10-31T09:00:00Z' };
  await expect('B-18 admin edits another seller product without signature', 'DENY', updDoc(U.claimAdmin, 'products/p1', { title: 'Simu X' }));
  await expect('B-18 admin edits another seller product with signature', 'ALLOW', updDoc(U.claimAdmin, 'products/p1', Object.assign({ title: 'Simu X' }, STAMP)));
  await expect('B-18 seller signs own product as the admin', 'DENY', updDoc(U.bob, 'products/p1', { title: 'Simu Y', lastChangedBy: 'ops', lastChangedAt: '2026-10-31T09:01:00Z' }));
  await expect('B-18 seller edits own product (no signature needed)', 'ALLOW', updDoc(U.bob, 'products/p1', { title: 'Simu Z' }));
  await expect('B-18 admin edits a user profile without signature', 'DENY', updDoc(U.claimAdmin, 'users/alice', { fullName: 'Hacked' }));
  await expect('B-18 admin edits a user profile with signature', 'ALLOW', updDoc(U.claimAdmin, 'users/alice', Object.assign({ fullName: 'Alice A' }, STAMP)));
  await expect('B-18 user forges admin signature on own profile', 'DENY', updDoc(U.alice, 'users/alice', { fullName: 'A', lastChangedBy: 'ops', lastChangedAt: '2026-10-31T09:02:00Z' }));
  await expect('B-18 admin edits order without signature', 'DENY', updDoc(U.claimAdmin, 'orders/o1', { note: 'x' }));
  await expect('B-18 admin signed order edit changing money', 'DENY', updDoc(U.claimAdmin, 'orders/o1', Object.assign({ amount: 1 }, STAMP)));
  await expect('B-18 admin signed order note (no money)', 'ALLOW', updDoc(U.claimAdmin, 'orders/o1', Object.assign({ adminNote: 'checked' }, STAMP)));
  await expect('non-owner writes auction modeData (bid)', 'DENY', updDoc(U.alice, 'products/p1', { modeData: { mode: 'auction', currentBid: 5000, totalBids: 1 } }));
  await expect('client writes groupOrders', 'DENY', setDoc(U.bob, 'chatGroups/g1/groupOrders/go1', { amount: 1 }));
  await expect('user joins public group as member', 'ALLOW', setDoc(U.alice, 'chatGroups/g1/members/alice', { role: 'member' }));
  await expect('user joins public group as admin', 'DENY', setDoc(U.alice, 'chatGroups/g1/members/alice', { role: 'admin' }));
  await expect('member reads group orders', 'ALLOW', list(U.alice, 'groupOrders', 5, null, 'chatGroups/g1'));

  console.log('\n-- B-02 ride_requests creation (real client payloads)');
  // Payload ya js/app/43-delivery-choice.js skhDeliveryBuildRide (bila sehemu za UI)
  const ride = { customerId: 'alice', customerName: 'A', reqCategory: 'Cargo', fromLocation: 'Kariakoo', toLocation: 'Mbezi',
    cargoName: 'Mzigo', cargoPrice: 20000, fare: 3000, orderId: 'o1', source: 'product_checkout', productOrder: true, sellerId: 'bob',
    status: 'searching', routingStatus: 'routing', assignmentStatus: 'seeking', routingRound: 1, offersCount: 0, activeOfferId: null,
    pickupToken: null, pickupTokenStatus: 'unissued', handoverToken: null, handoverTokenStatus: 'unissued', transferTokenStatus: 'unissued',
    createdAt: new Date().toISOString() };
  await expect('buyer creates ride (43-delivery-choice payload)', 'ALLOW', setDoc(U.alice, 'ride_requests/rc1', ride));
  await expect('buyer creates ride (08-app-state payload)', 'ALLOW', setDoc(U.alice, 'ride_requests/rc2', { customerId: 'alice', status: 'searching', fare: 2000,
    pickupToken: null, pickupTokenStatus: 'unissued', handoverToken: null, handoverTokenStatus: 'unissued', transferTokenStatus: 'unissued' }));
  await expect('ride for another customer', 'DENY', setDoc(U.alice, 'ride_requests/rc3', Object.assign({}, ride, { customerId: 'bob' })));
  await expect('ride created already matched', 'DENY', setDoc(U.alice, 'ride_requests/rc4', Object.assign({}, ride, { routingStatus: 'matched' })));
  await expect('ride created already assigned', 'DENY', setDoc(U.alice, 'ride_requests/rc5', Object.assign({}, ride, { assignmentStatus: 'assigned' })));
  await expect('ride created with fake offers', 'DENY', setDoc(U.alice, 'ride_requests/rc6', Object.assign({}, ride, { offersCount: 3 })));
  await expect('ride created with plaintext pickup token', 'DENY', setDoc(U.alice, 'ride_requests/rc7', Object.assign({}, ride, { pickupToken: 'PK-123' })));
  await expect('ride created with frozen fare', 'DENY', setDoc(U.alice, 'ride_requests/rc8', Object.assign({}, ride, { agreedFare: 999999 })));
  await expect('ride created with custody stage', 'DENY', setDoc(U.alice, 'ride_requests/rc9', Object.assign({}, ride, { custodyStage: 'transit' })));
  await expect('ride created with delivery proof', 'DENY', setDoc(U.alice, 'ride_requests/rc10', Object.assign({}, ride, { deliveryProofAt: 'x' })));
  await expect('ride created in_transit', 'DENY', setDoc(U.alice, 'ride_requests/rc11', Object.assign({}, ride, { status: 'in_transit' })));

  console.log('\n-- M7 system/config writes must name their author');
  const stamp = (uid, via) => ({ lastChangedBy: uid, lastChangedAt: '2026-10-31T00:00:00Z', lastChangedVia: via || 'browser' });
  await expect('super admin flips a fee WITH author stamp', 'ALLOW', updDoc(U.realAdmin, 'system/config', Object.assign({ 'fees': { boost: true } }, stamp('boss'))));
  await expect('super admin flips a fee WITHOUT stamp', 'DENY', updDoc(U.realAdmin, 'system/config', { fees: { boost: false } }));
  await expect('super admin stamps someone else as author', 'DENY', updDoc(U.realAdmin, 'system/config', Object.assign({ fees: { boost: false } }, stamp('alice'))));
  await expect('super admin pretends write came from the audited callable', 'DENY', updDoc(U.realAdmin, 'system/config', Object.assign({ fees: { boost: false } }, stamp('boss', 'adminSetEscrowPolicy'))));
  await expect('ordinary admin writes system/config', 'DENY', updDoc(U.claimAdmin, 'system/config', Object.assign({ fees: { boost: false } }, stamp('ops'))));
  await expect('super admin deletes system/config', 'DENY', delDoc(U.realAdmin, 'system/config'));
  await expect('normal user writes system/config', 'DENY', updDoc(U.alice, 'system/config', Object.assign({ fees: { boost: false } }, stamp('alice'))));

  console.log('\n-- Admin-only browser writes carry an author stamp (audit)');
  const st2 = (uid, t) => ({ lastChangedBy: uid, lastChangedAt: t || '2026-10-31T01:00:00Z' });
  await expect('admin creates announcement WITH stamp', 'ALLOW', setDoc(U.claimAdmin, 'announcements/an1', Object.assign({ title: 'Promo', status: 'draft' }, st2('ops'))));
  await expect('admin creates announcement WITHOUT stamp', 'DENY', setDoc(U.claimAdmin, 'announcements/an2', { title: 'Promo', status: 'draft' }));
  await expect('admin stamps another admin as author', 'DENY', setDoc(U.claimAdmin, 'announcements/an3', Object.assign({ title: 'x' }, st2('boss'))));
  await expect('admin edits announcement with fresh stamp', 'ALLOW', updDoc(U.claimAdmin, 'announcements/an1', Object.assign({ status: 'published' }, st2('ops', '2026-10-31T02:00:00Z'))));
  await expect('admin edits announcement reusing old stamp', 'DENY', updDoc(U.claimAdmin, 'announcements/an1', { status: 'archived' }));
  await expect('normal user creates announcement', 'DENY', setDoc(U.alice, 'announcements/an4', Object.assign({ title: 'x' }, st2('alice'))));
  await expect('admin deletes announcement', 'ALLOW', delDoc(U.claimAdmin, 'announcements/an1'));
  await expect('admin adds media WITH stamp', 'ALLOW', setDoc(U.claimAdmin, 'adminMedia/m1', Object.assign({ url: 'https://x/y.jpg', archived: false }, st2('ops'))));
  await expect('admin adds media WITHOUT stamp', 'DENY', setDoc(U.claimAdmin, 'adminMedia/m2', { url: 'https://x/y.jpg' }));
  await expect('normal user adds admin media', 'DENY', setDoc(U.alice, 'adminMedia/m3', Object.assign({ url: 'u' }, st2('alice'))));

  console.log('\n-- B-04 negotiation: accepting cannot change the price');
  // buyer offered 7000; seller's turn
  await seed('negotiations/ng1', { buyerId: 'alice', sellerId: 'bob', version: 1, currentState: 'OFFER_SENT', currentUnitPrice: 7000, quantity: 1, waitingForUserId: 'bob', turn: 'seller' });
  await expect('seller counters at 9000 (normal)', 'ALLOW', updDoc(U.bob, 'negotiations/ng1', { version: 2, currentState: 'COUNTER_OFFER', currentUnitPrice: 9000, waitingForUserId: 'alice', turn: 'buyer' }));
  await expect('buyer accepts AND lowers price in one write', 'DENY', updDoc(U.alice, 'negotiations/ng1', { version: 3, currentState: 'AGREEMENT', currentUnitPrice: 1 }));
  await expect('buyer accepts AND changes quantity', 'DENY', updDoc(U.alice, 'negotiations/ng1', { version: 3, currentState: 'AGREEMENT', quantity: 50 }));
  await expect('seller cannot accept on the buyer\'s turn', 'DENY', updDoc(U.bob, 'negotiations/ng1', { version: 3, currentState: 'AGREEMENT' }));
  await expect('buyer accepts the price on the table', 'ALLOW', updDoc(U.alice, 'negotiations/ng1', { version: 3, currentState: 'AGREEMENT' }));
  await expect('buyer writes agreedUnitPrice', 'DENY', updDoc(U.alice, 'negotiations/ng1', { version: 4, currentState: 'CHANGE_REQUESTED', agreedUnitPrice: 1 }));

  console.log(`\nRepair rules: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });

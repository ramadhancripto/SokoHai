// [SOKOHURU 2026-11-21] Emulator only (demo-sokohai). Launch scope enforced by firestore.rules:
// free listings work, sellers own their listings, payment-dependent features are refused while
// system/launch switches them off, listing reports and manually verified paid promotions are tamper-proof.
// The test creates system/launch and removes it again at the end (other suites expect it absent).
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
const seed = (path, data) => req('PATCH', path, 'owner', data);                                       // emulator rules bypass
const create = (path, tok, data) => req('PATCH', path, tok, data, '?currentDocument.exists=false');
const patch = (path, tok, data) => req('PATCH', path, tok, data, '?' + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true');
// atomic multi-document write (same as a client writeBatch)
async function commit(tok, writes) {
  const w = writes.map(x => x.create
    ? { update: { name: `projects/${project}/databases/(default)/documents/${x.create}`, fields: f(x.data) }, currentDocument: { exists: false } }
    : { update: { name: `projects/${project}/databases/(default)/documents/${x.update}`, fields: f(x.data) }, updateMask: { fieldPaths: Object.keys(x.data) }, currentDocument: { exists: true } });
  const r = await fetch(base.replace(/\/documents$/, '/documents:commit'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ writes: w }) });
  return { status: r.status, body: await r.text() };
}
const T = Date.now().toString(36);
const S = 'hu-sel' + T, O = 'hu-oth' + T, B = 'hu-buy' + T, A = 'hu-adm' + T;
const seller = token(S), other = token(O), buyer = token(B), admin = token(A, { admin: true, email: 'staff@example.test', email_verified: true });
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  PASS ' + m); };
const OFF = { auction: false, priceDrop: false, groupBuy: false, wallet: false, escrow: false, checkout: false, delivery: false, paidEntitlements: false, promotionsManual: true, lastChangedBy: 'owner-review' };
const listing = (extra = {}) => Object.assign({ userId: S, title: 'Kitenge cha pamba', price: 25000, stock: 0, openingStockPending: true, reservedStock: 0, publicationStatus: 'published', status: 'active',
  category: 'CAT-01', salesChannels: ['marketplace'], saleMode: 'free_market', condition: 'new', location: 'Dar es Salaam', description: 'Kitenge kipya', images: ['https://res.cloudinary.com/x/a.jpg'], createdAt: new Date().toISOString() }, extra);
const now = () => new Date().toISOString();

try {
  ok((await seed('system/launch', OFF)).status === 200, 'seed system/launch (payment features off, manual promotions on)');
  ok((await seed('system/promotion_packages', { packages: { boost3: { active: true, kind: 'boost', amount: 5000, days: 3, label: 'Siku 3' }, home7: { active: false, kind: 'homepage_sponsored', amount: 30000, days: 7 } } })).status === 200, 'seed promotion packages');

  // ---- free listing ----
  const P = 'hu-p-' + T;
  ok((await create('products/hu-anon-' + T, null, listing())).status === 403, 'anonymous visitor cannot create a listing');
  ok((await create('products/' + P, seller, listing())).status === 200, 'signed-in seller posts a FREE listing (photos, description, price, condition, location)');
  ok((await create('products/hu-x1-' + T, seller, listing({ userId: O }))).status === 403, 'seller cannot post a listing in another seller\'s name');
  ok((await create('products/hu-x2-' + T, seller, listing({ userEmail: 'me@example.test' }))).status === 403, 'listing with userEmail refused (private data in a public document)');
  ok((await create('products/hu-x3-' + T, seller, listing({ sellerPhone: '0700000000' }))).status === 403, 'listing with sellerPhone refused');
  ok((await create('products/hu-x4-' + T, seller, listing({ saleMode: 'auction' }))).status === 403, 'auction listing refused while auction is off');
  ok((await create('products/hu-x5-' + T, seller, listing({ saleMode: 'price_drop' }))).status === 403, 'price-drop listing refused while price drop is off');
  ok((await create('products/hu-x6-' + T, seller, listing({ saleMode: 'group_buy' }))).status === 403, 'group-buy listing refused while group buy is off');
  ok((await create('products/hu-x7-' + T, seller, listing({ isBoosted: true }))).status === 403, 'self-boost on create refused');
  ok((await create('products/hu-x8-' + T, seller, listing({ verified: true }))).status === 403, 'self-assigned verification badge refused');
  ok((await create('products/hu-x9-' + T, seller, listing({ stock: 50, openingStockPending: false }))).status === 403, 'self-declared stock refused (server sets opening stock)');
  const pub = await fetch(base + '/products/' + P); ok(pub.status === 200, 'public (signed-out) read of a listing works');
  ok((await fetch(base + '/users/' + S)).status === 403, 'private user profiles stay closed to anonymous readers');

  // ---- seller-owned edit / archive ----
  ok((await patch('products/' + P, seller, { title: 'Kitenge cha pamba bora', price: 24000, updatedAt: now() })).status === 200, 'owner edits own listing');
  ok((await patch('products/' + P, other, { title: 'Imeibiwa', updatedAt: now() })).status === 403, 'another seller cannot edit the listing');
  ok((await patch('products/' + P, seller, { userId: O })).status === 403, 'ownership cannot be changed');
  ok((await patch('products/' + P, seller, { isBoosted: true, boostDays: 3, boostedAt: now() })).status === 403, 'owner cannot boost without a verified promotion');
  ok((await patch('products/' + P, seller, { isBoosted: true, boostDays: 3, boostedAt: now(), boostPaidRef: 'PRM-FAKE000001' })).status === 403, 'owner cannot fake a promotion reference');
  ok((await patch('products/' + P, seller, { verified: true })).status === 403, 'owner cannot self-verify');
  ok((await patch('products/' + P, seller, { inspectionStatus: 'passed' })).status === 403, 'owner cannot self-certify inspection');
  ok((await patch('products/' + P, seller, { userEmail: 'x@example.test' })).status === 403, 'owner cannot add an e-mail to the public listing');
  ok((await patch('products/' + P, seller, { saleMode: 'auction' })).status === 403, 'owner cannot switch a listing to auction while it is off');
  ok((await patch('products/' + P, seller, { adminHidden: false, moderationStatus: 'active' })).status === 403, 'owner cannot clear moderation');
  const L = 'hu-legacy-' + T;
  await seed('products/' + L, listing({ stock: 3, openingStockPending: false, userEmail: 'old@example.test', saleMode: 'auction', modeData: { totalBids: 0 } }));
  ok((await patch('products/' + L, seller, { title: 'Bidhaa ya zamani', updatedAt: now() })).status === 200, 'legacy listing (old e-mail, old auction mode) still editable when those fields are unchanged');
  ok((await patch('products/' + P, seller, { publicationStatus: 'archived', status: 'archived', archivedAt: now(), updatedAt: now() })).status === 200, 'owner archives own listing');
  ok((await patch('products/' + P, seller, { publicationStatus: 'published', status: 'active', archivedAt: null, updatedAt: now() })).status === 200, 'owner restores it to the market');

  // ---- disabled money / delivery flows (rules) ----
  ok((await create('smart_cart_checkouts/hu-c-' + T, buyer, { buyerId: B, total: 1000 })).status === 403, 'checkout record refused while checkout is off');
  ok((await create('sokopay_tokens/hu-t-' + T, buyer, { buyerId: B, sellerId: S, token: 'x', tokenType: 'pay' })).status === 403, 'SokoPay escrow token refused while escrow is off');
  ok((await create('sokopay_links/hu-l-' + T, seller, { userId: S, amount: 1000, status: 'pending' })).status === 403, 'SokoPay link refused while escrow is off');
  ok((await create('logistics_assignments/hu-a-' + T, buyer, { buyerId: B, sellerId: S })).status === 403, 'delivery assignment refused while delivery is off');
  ok((await create('ride_requests/hu-r-' + T, buyer, { customerId: B, status: 'searching' })).status === 403, 'ride / delivery booking refused while delivery is off');
  ok((await create('orders/hu-o-' + T, buyer, { buyerId: B, sellerId: S, amount: 1000, status: 'pending' })).status === 403, 'order / checkout refused while checkout is off');
  ok((await create('wallet_ledger/hu-w-' + T, buyer, { uid: B, amount: 100000 })).status === 403, 'wallet ledger is server-only (no client deposit)');
  ok((await create('withdrawal_requests/hu-wd-' + T, buyer, { uid: B, amount: 1000 })).status === 403, 'withdrawal request from the browser refused');
  ok((await create('escrow_holds/hu-e-' + T, buyer, { buyerId: B })).status === 403, 'escrow hold is server-only');
  // the same simple records are accepted when the owner switches the feature on -> it is the switch that refuses them
  await seed('system/launch', Object.assign({}, OFF, { checkout: true, escrow: true, delivery: true }));
  ok((await create('smart_cart_checkouts/hu-c2-' + T, buyer, { buyerId: B, total: 1000 })).status === 200, 'control: checkout record accepted when checkout is switched on');
  ok((await create('sokopay_tokens/hu-t2-' + T, buyer, { buyerId: B, sellerId: S, token: 'x', tokenType: 'pay' })).status === 200, 'control: escrow token accepted when escrow is switched on');
  ok((await create('logistics_assignments/hu-a2-' + T, buyer, { buyerId: B, sellerId: S })).status === 200, 'control: delivery assignment accepted when delivery is switched on');
  await seed('system/launch', OFF);
  ok((await patch('system/launch', admin, { checkout: true })).status === 403, 'an ordinary admin cannot switch features on (super admin only)');
  ok((await patch('system/launch', seller, { checkout: true })).status === 403, 'a seller cannot switch features on');
  ok((await patch('system/promotion_packages', admin, { packages: { boost3: { active: true, kind: 'boost', amount: 1, days: 30 } } })).status === 403, 'an ordinary admin cannot change promotion prices');

  // ---- listing reports ----
  const R = P + '_' + B;
  ok((await create('listing_reports/' + R, buyer, { productId: P, reporterUid: B, reason: 'scam', note: 'Bei ni ndogo mno', status: 'open', createdAt: now() })).status === 200, 'buyer reports a listing');
  ok((await create('listing_reports/' + R, buyer, { productId: P, reporterUid: B, reason: 'scam', note: '', status: 'open', createdAt: now() })).status !== 200
     && (await patch('listing_reports/' + R, buyer, { note: 'tena' })).status === 403, 'duplicate report by the same user refused');
  ok((await create('listing_reports/' + P + '_' + O, buyer, { productId: P, reporterUid: O, reason: 'scam', note: '', status: 'open', createdAt: now() })).status === 403, 'cannot report in someone else\'s name');
  ok((await create('listing_reports/' + P + '_' + O, other, { productId: P, reporterUid: O, reason: 'scam', note: '', status: 'actioned', createdAt: now() })).status === 403, 'reporter cannot pre-set the outcome');
  ok((await create('listing_reports/' + P + '_' + O, other, { productId: P, reporterUid: O, reason: 'nonsense', note: '', status: 'open', createdAt: now() })).status === 403, 'unknown report reason refused');
  ok((await fetch(base + '/listing_reports/' + R, { headers: { Authorization: 'Bearer ' + seller } })).status === 403, 'the reported seller cannot read who reported');
  ok((await patch('listing_reports/' + R, admin, { status: 'dismissed', resolvedBy: A, resolvedAt: now(), resolution: 'Si kosa' })).status === 200, 'admin resolves the report');

  // ---- admin moderation (browser fallback with audit) ----
  ok((await patch('products/' + P, admin, { adminHidden: true, moderationStatus: 'hidden', moderatedBy: A, moderatedAt: now(), lastChangedBy: A, lastChangedAt: now() })).status === 403, 'admin hide without an audit record refused');
  const mod = 'mod_' + P + '_x1';
  ok((await commit(admin, [
    { create: 'admin_audit_log/' + mod, data: { actorUid: A, actorRole: 'admin', via: 'browser', action: 'LISTING_HIDE', reason: 'Ripoti ya utapeli', createdAt: now(), targetId: P } },
    { update: 'products/' + P, data: { adminHidden: true, moderationStatus: 'hidden', moderatedBy: A, moderatedAt: now(), moderationAuditId: mod, lastChangedBy: A, lastChangedAt: now() } }])).status === 200, 'admin hides a listing with an audit record in the same write');
  ok((await fetch(base + '/products/' + P).then(r => r.json())).fields.adminHidden.booleanValue === true, 'hidden flag is on the public document (feeds skip it)');
  ok((await patch('products/' + P, seller, { adminHidden: false })).status === 403, 'seller cannot lift the moderation flag');
  ok((await create('admin_audit_log/mod_fake_' + T, seller, { actorUid: S, actorRole: 'admin', via: 'browser', action: 'LISTING_RESTORE', reason: 'mimi mwenyewe', createdAt: now() })).status === 403, 'a seller cannot write audit records');
  ok((await patch('admin_audit_log/' + mod, admin, { reason: 'imebadilishwa' })).status === 403, 'audit records are append-only');
  const mod2 = 'mod_' + P + '_x2';
  ok((await commit(admin, [
    { create: 'admin_audit_log/' + mod2, data: { actorUid: A, actorRole: 'admin', via: 'browser', action: 'LISTING_RESTORE', reason: 'Imekaguliwa, sawa', createdAt: now(), targetId: P } },
    { update: 'products/' + P, data: { adminHidden: false, moderationStatus: 'active', moderatedBy: A, moderatedAt: now(), moderationAuditId: mod2, lastChangedBy: A, lastChangedAt: now() } }])).status === 200, 'admin restores the listing with an audit record');

  // ---- paid promotions (manual verification) ----
  const Q = 'PRM-' + T.toUpperCase().replace(/[^A-Z0-9]/g, '') + 'AA';
  const reqDoc = (extra = {}) => Object.assign({ reference: Q, sellerUid: S, productId: P, packageId: 'boost3', kind: 'boost', amount: 5000, currency: 'TZS', days: 3, status: 'pending', createdAt: now() }, extra);
  ok((await create('promotion_requests/' + Q, seller, reqDoc({ amount: 100 }))).status === 403, 'request with a wrong (cheaper) amount refused');
  ok((await create('promotion_requests/' + Q, seller, reqDoc({ days: 30 }))).status === 403, 'request with more days than the package refused');
  ok((await create('promotion_requests/' + Q, seller, reqDoc({ status: 'active' }))).status === 403, 'forged "active" request refused');
  ok((await create('promotion_requests/' + Q, seller, reqDoc({ paid: true }))).status === 403, 'client "paid=true" refused');
  ok((await create('promotion_requests/' + Q, seller, reqDoc({ packageId: 'home7', kind: 'homepage_sponsored', amount: 30000, days: 7 }))).status === 403, 'inactive package refused');
  ok((await create('promotion_requests/' + Q, other, reqDoc({ sellerUid: O }))).status === 403, 'cannot promote someone else\'s listing');
  ok((await create('promotion_requests/PRM-' + T.toUpperCase().replace(/[^A-Z0-9]/g, '') + 'BB', seller, reqDoc())).status === 403, 'reference must equal the document id');
  ok((await create('promotion_requests/' + Q, seller, reqDoc())).status === 200, 'seller creates a pending promotion request');
  ok((await patch('promotion_requests/' + Q, seller, { status: 'active' })).status === 403, 'seller cannot activate own request');
  const REF = ('TX' + T).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);   // unique per run (a reused id would be refused: that IS the anti-replay)
  const at = now(), exp = new Date(Date.now() + 3 * 86400000).toISOString();
  const activation = (ref, auditId, extra = {}) => [
    { update: 'promotion_requests/' + Q, data: { status: 'active', paymentRef: ref, paymentProvider: 'mpesa', verifiedBy: A, verifiedAt: at, activatedAt: at, expiresAt: exp } },
    { create: 'promotion_payment_refs/mpesa_' + ref, data: { requestId: Q, amount: 5000, verifiedBy: A, verifiedAt: at } },
    { create: 'admin_audit_log/' + auditId, data: { actorUid: A, actorRole: 'admin', via: 'browser', action: 'PROMOTION_ACTIVATED', reason: 'Imethibitishwa M-Pesa', createdAt: at, targetId: Q } },
    { update: 'products/' + P, data: Object.assign({ isBoosted: true, boostDays: 3, boostedAt: at, boostExpiresAt: exp, boostPaidRef: Q, boostPlacement: 'boost', lastChangedBy: A, lastChangedAt: at }, extra) }];
  ok((await commit(seller, activation(REF, 'promo_' + Q + '_activate'))).status === 403, 'non-admin activation refused');
  ok((await commit(admin, activation(REF, 'promo_' + Q + '_activate').filter(w => !String(w.create || '').startsWith('admin_audit_log')))).status === 403, 'activation without an audit record refused');
  ok((await commit(admin, activation(REF, 'promo_' + Q + '_activate').filter(w => !String(w.create || '').startsWith('promotion_payment_refs')))).status === 403, 'activation without reserving the payment reference refused');
  ok((await commit(admin, activation(REF, 'promo_' + Q + '_activate', { boostDays: 30 }))).status === 403, 'activation that boosts longer than paid refused');
  const actR = await commit(admin, activation(REF, 'promo_' + Q + '_activate')); if (actR.status !== 200) console.log(actR.body.slice(0, 1500));
  ok(actR.status === 200, 'admin activates after verification: request + payment ref + audit + boost in one write');
  ok((await patch('products/' + P, seller, { title: 'Kitenge (boosted)', updatedAt: now() })).status === 200, 'boosted listing still editable by its owner (boost fields unchanged)');
  ok((await patch('products/' + P, seller, { boostDays: 30 })).status === 403, 'owner cannot extend the paid boost');
  // replay: a second request paid with the SAME transaction id
  const Q2 = Q.slice(0, -2) + 'CC';
  ok((await create('promotion_requests/' + Q2, seller, reqDoc({ reference: Q2 }))).status === 200, 'second pending request');
  const replay = [
    { update: 'promotion_requests/' + Q2, data: { status: 'active', paymentRef: REF, paymentProvider: 'mpesa', verifiedBy: A, verifiedAt: at, activatedAt: at, expiresAt: exp } },
    { create: 'promotion_payment_refs/mpesa_' + REF + '', data: { requestId: Q2, amount: 5000, verifiedBy: A, verifiedAt: at } },
    { create: 'admin_audit_log/promo_' + Q2 + '_activate', data: { actorUid: A, actorRole: 'admin', via: 'browser', action: 'PROMOTION_ACTIVATED', reason: 'jaribio la kurudia', createdAt: at, targetId: Q2 } }];
  ok((await commit(admin, replay)).status !== 200, 'the same payment reference cannot activate a second promotion (duplicate / replay)');
  ok((await patch('promotion_payment_refs/mpesa_' + REF + '', admin, { requestId: Q2 })).status === 403, 'a reserved payment reference cannot be re-pointed');
  ok((await patch('promotion_requests/' + Q, admin, { status: 'pending' })).status === 403, 'an active promotion cannot be reset to pending (no re-activation)');
  ok((await commit(admin, [
    { update: 'promotion_requests/' + Q2, data: { status: 'rejected', verifiedBy: A, verifiedAt: at, rejectReason: 'Malipo hayakupatikana' } },
    { create: 'admin_audit_log/promo_' + Q2 + '_reject', data: { actorUid: A, actorRole: 'admin', via: 'browser', action: 'PROMOTION_REJECTED', reason: 'Malipo hayakupatikana', createdAt: at, targetId: Q2 } }])).status === 200, 'admin rejects an unpaid request with an audit record');
  ok((await fetch(base + '/promotion_payment_refs/mpesa_' + REF + '', { headers: { Authorization: 'Bearer ' + seller } })).status === 403, 'payment references are admin-only');
  // switch off
  await seed('system/launch', Object.assign({}, OFF, { promotionsManual: false }));
  ok((await create('promotion_requests/' + Q.slice(0, -2) + 'DD', seller, reqDoc({ reference: Q.slice(0, -2) + 'DD' }))).status === 403, 'no promotion requests while promotionsManual is off');
} finally {
  await req('DELETE', 'system/launch', 'owner');
  await req('DELETE', 'system/promotion_packages', 'owner');
}
console.log(`\nSOKOHURU LAUNCH RULES (emulator): ${pass} passed, 0 failed`);

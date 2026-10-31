#!/usr/bin/env node
/**
 * [PHASE 2/3 2026-10-31] Firestore rules: variant stock (F6), reserved
 * counters, order reservation fields, reservation / review / refund records,
 * stock transfer ids (F7). Needs the Firestore emulator:
 *   firebase emulators:exec --only firestore --project demo-sokohai "node tools/test_inventory_rules.mjs"
 * Without the emulator it exits 2 (BLOCKED) and never reports a pass.
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) { console.error('BLOCKED: FIRESTORE_EMULATOR_HOST haijawekwa.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
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
  seller: token('bob', { email: 'bob@test.tz', email_verified: true }),
  buyer: token('alice', { email: 'alice@test.tz', email_verified: true }),
  other: token('eve', { email: 'eve@test.tz', email_verified: true }),
  admin: token('ops', { email: 'ops@test.tz', email_verified: true, admin: true })
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
const setDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}`, tok, { fields: fields(data) });
const updDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?` + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true', tok, { fields: fields(data) });
const createDoc = (tok, path, data) => call('PATCH', `${BASE}/${path}?currentDocument.exists=false`, tok, { fields: fields(data) });
const getDoc = (tok, path) => call('GET', `${BASE}/${path}`, tok);
const seed = (path, data) => setDoc(OWNER, path, data);

let pass = 0, fail = 0; const failures = [];
async function expect(label, want, p) {
  const r = await p;
  const allowed = r.ok || r.status === 404;
  if ((want === 'ALLOW') === allowed) { pass++; console.log(`PASS  ${want.padEnd(5)} ${label}`); }
  else { fail++; failures.push(label); console.log(`FAIL  expected ${want} got ${allowed ? 'ALLOW' : 'DENY'} (${r.status}) ${label}\n      ${r.text.slice(0, 240)}`); }
}
const variant = (id, stock, extra = {}) => Object.assign({ variantId: id, sku: 'SKU-' + id, unitId: 'pcs', price: 1000, options: { size: id }, stock }, extra);
const product = (extra = {}) => Object.assign({ userId: 'bob', title: 'Shati', price: 1000, stock: 0 }, extra);

await call('DELETE', `http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, null);
const V3 = [variant('s', 5), variant('m', 2, { reserved: 1 }), variant('l', 0)];
await seed('products/pv', product({ variantCombinations: V3 }));
await seed('products/pr', product({ stock: 10, reservedStock: 3 }));
const BIG = Array.from({ length: 100 }, (_, i) => variant('v' + i, i % 7));
await seed('products/pbig', product({ variantCombinations: BIG }));

console.log('\n-- F6 variantCombinations (with per-variant stock) is server-only: productVariantsSave');
await expect('seller edits title, variants untouched', 'ALLOW', updDoc(U.seller, 'products/pv', { title: 'Shati Jipya' }));
await expect('100 variants: seller edits title (no list evaluation)', 'ALLOW', updDoc(U.seller, 'products/pbig', { title: 'Mengi' }));
await expect('seller re-sends identical variantCombinations (no change = allowed)', 'ALLOW', updDoc(U.seller, 'products/pv', { variantCombinations: V3 }));
await expect('seller changes a variant price in the browser (use the callable)', 'DENY', updDoc(U.seller, 'products/pv', { variantCombinations: [variant('s', 5, { price: 1200 }), V3[1], V3[2]] }));
await expect('seller raises variant stock', 'DENY', updDoc(U.seller, 'products/pv', { variantCombinations: [variant('s', 50), V3[1], V3[2]] }));
await expect('seller clears variant reserved', 'DENY', updDoc(U.seller, 'products/pv', { variantCombinations: [V3[0], variant('m', 2), V3[2]] }));
await expect('seller removes a variant', 'DENY', updDoc(U.seller, 'products/pv', { variantCombinations: [V3[0], V3[1]] }));
await expect('seller appends a variant with stock 9', 'DENY', updDoc(U.seller, 'products/pv', { variantCombinations: V3.concat([variant('xl', 9)]) }));
await expect('admin (browser) changes variant stock', 'DENY', updDoc(U.admin, 'products/pv', { variantCombinations: [variant('s', 99), V3[1], V3[2]], lastChangedBy: 'ops', lastChangedAt: '2026-10-31T00:00:00Z' }));
await expect('another user edits the product', 'DENY', updDoc(U.other, 'products/pv', { title: 'hack' }));

console.log('\n-- Reserved counters');
await expect('seller clears reservedStock', 'DENY', updDoc(U.seller, 'products/pr', { reservedStock: 0 }));
await expect('admin (browser) clears reservedStock', 'DENY', updDoc(U.admin, 'products/pr', { reservedStock: 0 }));
await expect('seller sets stock directly', 'DENY', updDoc(U.seller, 'products/pr', { stock: 100 }));
await expect('seller edits price on a product with reservations', 'ALLOW', updDoc(U.seller, 'products/pr', { price: 1500 }));

console.log('\n-- Product create');
const NEW = { userId: 'bob', title: 'Kiatu', price: 2000, stock: 0, openingStockPending: true, businessId: null, storeId: null };
await expect('create a product without variants (builder adds them via the callable)', 'ALLOW', createDoc(U.seller, 'products/n1', NEW));
await expect('create with variantCombinations in the browser', 'DENY', createDoc(U.seller, 'products/n2', Object.assign({}, NEW, { variantCombinations: [variant('a', 0)] })));
await expect('create with a variant at stock 7', 'DENY', createDoc(U.seller, 'products/n4', Object.assign({}, NEW, { variantCombinations: [variant('b', 7)] })));
await expect('create with reservedStock 2', 'DENY', createDoc(U.seller, 'products/n3', Object.assign({}, NEW, { reservedStock: 2 })));

console.log('\n-- Orders: reservation and review fields are server-only');
const ORDER = { buyerId: 'alice', sellerId: 'bob', amount: 1000, status: 'payment_pending', paymentStatus: 'pending', paymentVerified: false };
await expect('buyer creates a plain unpaid order', 'ALLOW', createDoc(U.buyer, 'orders/o1', ORDER));
await expect('buyer creates an order with reservationStatus ACTIVE', 'DENY', createDoc(U.buyer, 'orders/o2', Object.assign({}, ORDER, { reservationStatus: 'ACTIVE' })));
await expect('buyer creates an order with stockCommitted', 'DENY', createDoc(U.buyer, 'orders/o3', Object.assign({}, ORDER, { stockCommitted: true })));
await seed('orders/o4', Object.assign({}, ORDER, { reservationId: 'o4', reservationStatus: 'ACTIVE', reservationExpiresAt: '2026-10-31T10:15:00Z' }));
await expect('buyer extends reservationExpiresAt', 'DENY', updDoc(U.buyer, 'orders/o4', { reservationExpiresAt: '2030-01-01T00:00:00Z' }));
await expect('seller marks reservation COMMITTED', 'DENY', updDoc(U.seller, 'orders/o4', { reservationStatus: 'COMMITTED' }));
await expect('buyer cancels the unpaid order (release runs on the server)', 'ALLOW', updDoc(U.buyer, 'orders/o4', { status: 'cancelled' }));
await seed('orders/o5', Object.assign({}, ORDER, { status: 'needs_review', paymentStatus: 'paid', paymentVerified: true, inventoryReviewState: 'NEEDS_REVIEW' }));
await expect('seller clears inventoryReviewState', 'DENY', updDoc(U.seller, 'orders/o5', { inventoryReviewState: 'RESOLVED_FULFILLED' }));
await expect('seller ships an order under review', 'DENY', updDoc(U.seller, 'orders/o5', { status: 'shipped' }));
await expect('admin (browser) sets inventoryReviewState', 'DENY', updDoc(U.admin, 'orders/o5', { inventoryReviewState: 'REFUNDED', lastChangedBy: 'ops', lastChangedAt: '2026-10-31T00:00:00Z' }));

console.log('\n-- Reservation / review / refund records');
await seed('inventory_reservations/o4', { orderId: 'o4', buyerId: 'alice', sellerId: 'bob', status: 'ACTIVE', lines: [] });
await seed('payment_reviews/o5', { orderId: 'o5', buyerId: 'alice', sellerId: 'bob', state: 'NEEDS_REVIEW' });
await seed('refunds/online_o5', { orderId: 'o5', buyerId: 'alice', status: 'COMPLETED', amount: 1000 });
await expect('buyer reads own reservation', 'ALLOW', getDoc(U.buyer, 'inventory_reservations/o4'));
await expect('seller reads own reservation', 'ALLOW', getDoc(U.seller, 'inventory_reservations/o4'));
await expect('stranger reads the reservation', 'DENY', getDoc(U.other, 'inventory_reservations/o4'));
await expect('buyer writes a reservation', 'DENY', setDoc(U.buyer, 'inventory_reservations/x', { orderId: 'x', buyerId: 'alice', status: 'ACTIVE' }));
await expect('seller reads payment review', 'DENY', getDoc(U.seller, 'payment_reviews/o5'));
await expect('admin reads payment review', 'ALLOW', getDoc(U.admin, 'payment_reviews/o5'));
await expect('buyer reads own refund', 'ALLOW', getDoc(U.buyer, 'refunds/online_o5'));
await expect('stranger reads the refund', 'DENY', getDoc(U.other, 'refunds/online_o5'));
await expect('buyer writes a refund', 'DENY', setDoc(U.buyer, 'refunds/online_x', { buyerId: 'alice', status: 'COMPLETED', amount: 9 }));
await expect('client reads system_config/inventory', 'DENY', getDoc(U.seller, 'system_config/inventory'));
await expect('client writes system_config/inventory', 'DENY', setDoc(U.admin, 'system_config/inventory', { mode: 'all' }));

console.log('\n-- F7 stock transfer doc uses its own id');
await expect('owner creates transfer with transferId + outMovementKey', 'ALLOW', createDoc(U.seller, 'stock_transfers/t1', { transferId: 't1', outMovementKey: 'transfer-out-t1', shopOwnerId: 'bob', productId: 'pr', quantity: 2, status: 'awaiting_pickup', pickupToken: 'PT-1', deliveryToken: 'DT-1' }));
await expect('another user creates a transfer for bob', 'DENY', createDoc(U.other, 'stock_transfers/t2', { transferId: 't2', shopOwnerId: 'bob', productId: 'pr', quantity: 2 }));

console.log('\n-- [POS 2026-11-01] decimal precision (kg/L/m)');
await expect('seller creates a kg product with quantityPrecision 3', 'ALLOW', createDoc(U.seller, 'products/kg1', Object.assign({}, NEW, { baseUnit: 'Kg', quantityPrecision: 3 })));
await expect('create with an invalid precision (5)', 'DENY', createDoc(U.seller, 'products/kg2', Object.assign({}, NEW, { quantityPrecision: 5 })));
await expect('seller cannot change precision after create (stock is kept in that precision)', 'DENY', updDoc(U.seller, 'products/kg1', { quantityPrecision: 0 }));
await expect('seller still edits other fields of a kg product', 'ALLOW', updDoc(U.seller, 'products/kg1', { title: 'Mchele safi' }));
console.log(`\nINVENTORY RULES: ${pass} passed, ${fail} failed`);
if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }

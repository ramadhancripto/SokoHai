#!/usr/bin/env node
/* [R-18 2026-11-20] Server-side archive enforcement (emulator only, no real money).
 * An archived / deleted / suspended / admin-removed product can not be bought, bid on or shown in Live,
 * whether the browser goes through the app or writes to the database directly. Active products and
 * legacy products without lifecycle fields keep working. Archive/restore stays owner-only.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_archive_enforcement_emulator.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const { productUnsellableReason } = require(path.join(ROOT, 'functions', 'product-state.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
async function call(name, uid, data) {
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth: { uid, token: { uid, email: uid + '@u.test', email_verified: true } }, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const bal = async (u) => Number(((await db.doc('users/' + u).get()).data() || {}).walletBalance || 0);
const T = Date.now().toString(36), B = 'arcB' + T, S = 'arcS' + T;
const PA = 'arcActive' + T, PX = 'arcArch' + T, PD = 'arcDel' + T, PH = 'arcHidden' + T, PL = 'arcLegacy' + T;
await db.doc('users/' + B).set({ walletBalance: 100000 });
await db.doc('users/' + S).set({ walletBalance: 0, isSeller: true });
const base = { userId: S, price: 10000, stock: 5 };
await db.doc('products/' + PA).set(Object.assign({ title: 'Active', status: 'active', publicationStatus: 'published' }, base));
await db.doc('products/' + PX).set(Object.assign({ title: 'Archived', status: 'archived', publicationStatus: 'archived', archivedAt: '2026-11-19T10:00:00Z' }, base));
await db.doc('products/' + PD).set(Object.assign({ title: 'Deleted', status: 'deleted' }, base));
await db.doc('products/' + PH).set(Object.assign({ title: 'Removed', status: 'active', adminHidden: true, moderationStatus: 'removed' }, base));
await db.doc('products/' + PL).set(Object.assign({ title: 'Legacy (no lifecycle fields)' }, base));
const cartOrder = (id, pid) => db.doc('orders/' + id).set({ buyerId: B, sellerId: S, amount: 10000, status: 'payment_pending', paymentStatus: 'pending',
  items: [{ productId: pid, id: pid, title: 'x', price: 10000, qty: 1, quantity: 1, sellerId: S }], date: new Date().toISOString() });
const directOrder = (id, pid) => db.doc('orders/' + id).set({ buyerId: B, sellerId: S, amount: 10000, quantity: 1, productId: pid, status: 'payment_pending', paymentStatus: 'pending', date: new Date().toISOString() });

await test('helper: archived / deleted / suspended / removed / draft are unsellable; active and legacy are sellable', async () => {
  eq(productUnsellableReason({ status: 'active', publicationStatus: 'published' }), '', 'active');
  eq(productUnsellableReason({ title: 'legacy' }), '', 'legacy without lifecycle fields');
  eq(productUnsellableReason({ archivedAt: '2026-01-01' }), 'product_archived', 'archivedAt');
  eq(productUnsellableReason({ publicationStatus: 'archived' }), 'product_archived', 'publicationStatus');
  eq(productUnsellableReason({ status: 'deleted' }), 'product_deleted', 'status deleted');
  eq(productUnsellableReason({ adminHidden: true }), 'product_removed_by_admin', 'adminHidden');
  eq(productUnsellableReason({ suspended: true }), 'product_suspended', 'suspended');
  eq(productUnsellableReason({ publicationStatus: 'draft' }), 'product_draft', 'draft');
});
for (const [label, pid] of [['archived', PX], ['deleted', PD], ['admin-removed', PH]]) {
  await test(`wallet pay, cart order with an ${label} product: refused BEFORE any debit`, async () => {
    const id = 'oc' + label.slice(0, 3) + T; await cartOrder(id, pid);
    const r = await call('orderWalletPay', B, { orderIds: [id] });
    eq(r.ok, false, 'refused'); ok(/PRICE_CHANGED/.test(r.message) && /product_/.test(r.message), r.message);
    eq(await bal(B), 100000, 'no debit'); eq((await db.doc('orders/' + id).get()).data().paymentRef, undefined, 'no payment ref');
  });
}
await test('wallet pay, single-product order (productId) with an archived product: refused, no debit', async () => {
  await directOrder('od' + T, PX);
  const r = await call('orderWalletPay', B, { orderIds: ['od' + T] });
  eq(r.ok, false, 'refused'); ok(/product_archived/.test(r.message), r.message); eq(await bal(B), 100000, 'no debit');
});
await test('control: the same flow for an ACTIVE product and a LEGACY product still pays', async () => {
  await cartOrder('ok1' + T, PA); await cartOrder('ok2' + T, PL);
  const r = await call('orderWalletPay', B, { orderIds: ['ok1' + T, 'ok2' + T] });
  ok(r.ok, JSON.stringify(r)); eq(await bal(B), 80000, 'debited 2 x 10,000');
});
await test('pesapalCheckout: archived product in the checkout is refused before PesaPal is contacted', async () => {
  const r = await call('pesapalCheckout', B, { amount: 10000, purpose: 'order', productIds: [PA, PX] });
  eq(r.ok, false, 'refused'); eq(r.code, 'failed-precondition', 'code'); ok(/PRODUCT_UNAVAILABLE/.test(r.message), r.message);
});
await test('auction: an archived auction listing takes no bids', async () => {
  const AX = 'arcAuc' + T;
  await db.doc('products/' + AX).set(Object.assign({ title: 'Mnada', saleMode: 'auction', status: 'archived', publicationStatus: 'archived', archivedAt: '2026-11-19T10:00:00Z',
    modeData: { mode: 'auction', startingBid: 1000, minIncrement: 100, endTime: new Date(Date.now() + 3600e3).toISOString() } }, base));
  const r = await call('auctionPlaceBid', B, { productId: AX, amount: 2000 });
  eq(r.ok, false, 'refused'); ok(/bidhaa_haipatikani:product_archived/.test(r.message), r.message);
});
await test('Live: an archived product can not be added to a live session; an active one can', async () => {
  const bad = await call('liveCreate', S, { title: 'Live ya majaribio', kind: 'live', productIds: [PX] });
  eq(bad.ok, false, 'refused'); ok(/bidhaa_haiko_hewani/.test(bad.message), bad.message);
  const good = await call('liveCreate', S, { title: 'Live ya majaribio', kind: 'live', productIds: [PA] });
  ok(good.ok, JSON.stringify(good));
  // archived AFTER the session was created: pinning it is refused
  await db.doc('products/' + PA).update({ status: 'archived', publicationStatus: 'archived', archivedAt: new Date().toISOString() });
  const pin = await call('livePin', S, { sessionId: good.data.sessionId, productId: PA });
  eq(pin.ok, false, 'pin refused'); ok(/bidhaa_haiko_hewani/.test(pin.message), pin.message);
  await db.doc('products/' + PA).update({ status: 'active', publicationStatus: 'published', archivedAt: null });
});

await test('sitemap: archived / deleted / removed listings are not advertised; services use /s/; real origin, no placeholder', async () => {
  const SV = 'arcSvc' + T; await db.doc('services/' + SV).set({ title: 'Fundi', userId: S, price: 5000 });
  let body = '', headers = {};
  await fns.sitemapXml({ method: 'GET', headers: {} }, { set: (k, v) => { headers[k] = v; }, status() { return this; }, send: (b) => { body = String(b); }, end: (b) => { body = String(b || body); } });
  ok(body.includes('/p/' + PA) && body.includes('/p/' + PL), 'active + legacy listed');
  for (const x of [PX, PD, PH]) ok(!body.includes(x), 'unsellable listed: ' + x);
  ok(body.includes('/s/' + SV) && !body.includes('/p/' + SV), 'service route');
  ok(!/example\.com/.test(body), 'placeholder domain');
});
// ---- Firestore rules (direct database writes, as a browser would make them) ----
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const loaded = (await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) })).ok;
async function signUp(tag) { return (await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: tag + T + '@rules.test', password: 'secret123', returnSecureToken: true }) })).json(); }
const buyer = await signUp('arcbuyer'), seller = await signUp('arcseller'), stranger = await signUp('arcstranger');
const RS = 'arcRS' + T, RX = 'arcRX' + T;
await db.doc('products/' + RS).set(Object.assign({ title: 'Rules active', status: 'active', publicationStatus: 'published' }, base, { userId: seller.localId }));
await db.doc('products/' + RX).set(Object.assign({ title: 'Rules archived', status: 'archived', publicationStatus: 'archived', archivedAt: '2026-11-19T10:00:00Z' }, base, { userId: seller.localId }));
const fv = (v) => typeof v === 'number' ? { integerValue: String(v) } : v === null ? { nullValue: null } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fv(v)]));
const createOrder = (tok, id, pid) => fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/orders?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + tok.idToken, 'content-type': 'application/json' },
  body: JSON.stringify({ fields: fields({ buyerId: tok.localId, sellerId: seller.localId, productId: pid, amount: 10000, status: 'payment_pending', paymentStatus: 'pending' }) }) }).then(r => r.status);
const patchProduct = (tok, pid, o) => fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/products/${pid}?` + Object.keys(o).map(k => 'updateMask.fieldPaths=' + k).join('&'), { method: 'PATCH', headers: { authorization: 'Bearer ' + tok.idToken, 'content-type': 'application/json' },
  body: JSON.stringify({ fields: fields(o) }) }).then(r => r.status);
await test('rules: browser order for an ARCHIVED product is denied; for an active product it is allowed', async () => {
  ok(loaded, 'rules load');
  eq(await createOrder(buyer, 'rx' + T, RX), 403, 'archived product order');
  eq(await createOrder(buyer, 'rs' + T, RS), 200, 'active product order');
});
await test('rules: a stranger can not archive, restore or edit another seller\'s product', async () => {
  const now = new Date().toISOString();
  eq(await patchProduct(stranger, RS, { publicationStatus: 'archived', status: 'archived', archivedAt: now, updatedAt: now }), 403, 'archive');
  eq(await patchProduct(stranger, RX, { publicationStatus: 'draft', status: 'draft', archivedAt: null, updatedAt: now }), 403, 'restore');
  eq(await patchProduct(stranger, RS, { price: 1 }), 403, 'edit');
});
await test('rules: the owner archives and restores (to draft) through the existing workflow; history is kept', async () => {
  const now = new Date().toISOString();
  eq(await patchProduct(seller, RS, { publicationStatus: 'archived', status: 'archived', archivedAt: now, updatedAt: now }), 200, 'owner archive');
  eq(await createOrder(buyer, 'rs2' + T, RS), 403, 'no new order after archive');
  ok((await db.doc('orders/rs' + T).get()).exists, 'the earlier order still exists');
  eq(await patchProduct(seller, RS, { publicationStatus: 'draft', status: 'draft', archivedAt: null, updatedAt: now }), 200, 'owner restore to draft');
  ok((await db.doc('products/' + RS).get()).exists, 'product never deleted');
});
console.log(`ARCHIVE ENFORCEMENT (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

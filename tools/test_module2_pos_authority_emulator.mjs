#!/usr/bin/env node
/* [MODULE 2 DEF-006 2026-11-27] POS VOID / RECEIPT ARE SERVER-AUTHORITATIVE.
 * 1. The REAL callables (posSale, posVoid, posReceipt) on the emulator: owner allowed, another
 *    business / no auth / missing reason refused, same idempotency key applied once (also in parallel),
 *    a second void of the same sale refused, stock restored exactly once.
 * 2. The REAL firestore.rules over REST (as a browser): no client write to pos_voids,
 *    pos_transactions, service_orders, sales, sale_voids or receipts.
 * 3. The REAL browser wrapper window.skhPOS.voidTransaction (js/app/62-missing-features.js),
 *    extracted and executed: it only calls posVoid, never writes Firestore, and keeps no history on failure.
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_module2_pos_authority_emulator.mjs"
 * Without the emulator: exit 2 (BLOCKED). */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) { console.error('BLOCKED: FIRESTORE_EMULATOR_HOST required'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT;
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();

let pass = 0, fail = 0; const failures = [];
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`assert: ${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); };
const who = (uid) => ({ uid, token: { uid, email: uid + '@sokohai.test', email_verified: true } });
async function call(name, auth, data) { try { return { ok: true, data: await fns[name].run({ data, auth, rawRequest: { headers: {} } }) }; } catch (e) { return { ok: false, code: e.code, message: e.message }; } }
const get = async (p) => (await db.doc(p).get()).data() || null;
let seq = 0; const key = (p) => `${p}-${String(++seq).padStart(6, '0')}`;
const OWNER = who('kuku'), OTHER = who('mbaya');
const sell = (q) => call('posSale', OWNER, { idempotencyKey: key('pos-sale'), items: [{ productId: 'soap', quantity: q, unitMode: 'pc', pricingMode: 'retail' }], payment: { method: 'Cash', cashReceived: 1000000 } });
const voidReq = (saleId, k, extra) => Object.assign({ idempotencyKey: k, businessId: 'B1', storeId: 'S1', originalSaleId: saleId, reason: 'Kosa la kuandika' }, extra || {});

/* ---------- REST as a browser (unsigned emulator tokens) ---------- */
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid) { const now = Math.floor(Date.now() / 1000); return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, email: uid + '@sokohai.test', email_verified: true, firebase: { identities: {}, sign_in_provider: 'password' } }) + '.'; }
function enc(v) { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (typeof v === 'string') return { stringValue: v }; return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }; }
const rest = async (method, p, tok, data) => { const r = await fetch(`${BASE}/${p}`, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: data ? JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) : undefined }); return r.status; };
const denied = (status) => status === 403;

async function main() {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await db.doc('users/kuku').set({ uid: 'kuku', businessId: 'B1', storeId: 'S1', shopOwnerUid: 'kuku' });
  await db.doc('businesses/B1').set({ ownerUid: 'kuku', businessName: 'Duka la Kuku' });
  await db.doc('stores/S1').set({ ownerUid: 'kuku', businessId: 'B1', storeName: 'Duka' });
  await db.doc('users/mbaya').set({ uid: 'mbaya', businessId: 'B2', storeId: 'S2', shopOwnerUid: 'mbaya' });
  await db.doc('businesses/B2').set({ ownerUid: 'mbaya', businessName: 'Duka Jingine' });
  await db.doc('stores/S2').set({ ownerUid: 'mbaya', businessId: 'B2', storeName: 'Duka 2' });
  await db.doc('products/soap').set({ userId: 'kuku', businessId: 'B1', storeId: 'S1', title: 'Sabuni', price: 1000, stock: 20 });

  console.log('\n[1. callables]');
  let sale1 = null, void1 = null, voidKey = null;
  await test('P1 owner sells 3 then voids: sale voidStatus VOIDED, stock 20 -> 17 -> 20, sale_voids written', async () => {
    const s = await sell(3); assert(s.ok, JSON.stringify(s)); sale1 = s.data.saleId; eq((await get('products/soap')).stock, 17, 'after sale');
    voidKey = key('void'); const v = await call('posVoid', OWNER, voidReq(sale1, voidKey)); assert(v.ok, JSON.stringify(v)); void1 = v.data;
    eq((await get('products/soap')).stock, 20, 'restored');
    const sd = await get('sales/' + sale1); eq(sd.voidStatus, 'VOIDED', 'sale voidStatus (sale snapshot itself stays immutable: status ' + sd.status + ')');
    assert(await get('sale_voids/void_' + voidKey), 'sale_voids doc');
  });
  await test('P2 same idempotency key replayed -> same result, stock not restored twice', async () => {
    const v = await call('posVoid', OWNER, voidReq(sale1, voidKey)); assert(v.ok, JSON.stringify(v));
    eq((await get('products/soap')).stock, 20, 'unchanged');
  });
  await test('P3 four PARALLEL voids with one key -> applied once', async () => {
    const s = await sell(2); assert(s.ok, JSON.stringify(s)); eq((await get('products/soap')).stock, 18, 'after sale');
    const k = key('void'); const rs = await Promise.all([1, 2, 3, 4].map(() => call('posVoid', OWNER, voidReq(s.data.saleId, k))));
    assert(rs.some((r) => r.ok), 'one succeeded ' + JSON.stringify(rs));
    eq((await get('products/soap')).stock, 20, 'restored exactly once');
  });
  await test('P4 a second void of an already voided sale (new key) is refused', async () => {
    const v = await call('posVoid', OWNER, voidReq(sale1, key('void'))); assert(!v.ok, JSON.stringify(v));
    eq((await get('products/soap')).stock, 20, 'unchanged');
  });
  await test('P5 another business cannot void (own ids -> scope mismatch; victim ids -> refused)', async () => {
    const s = await sell(1); assert(s.ok, 'sale'); const sid = s.data.saleId;
    const a = await call('posVoid', OTHER, voidReq(sid, key('void'), { businessId: 'B2', storeId: 'S2' })); assert(!a.ok, 'own ids ' + JSON.stringify(a));
    const b = await call('posVoid', OTHER, voidReq(sid, key('void'))); assert(!b.ok, 'victim ids ' + JSON.stringify(b));
    eq((await get('products/soap')).stock, 19, 'stock untouched');
    assert((await get('sales/' + sid)).voidStatus !== 'VOIDED', 'sale not voided');
  });
  await test('P6 no auth -> refused; missing reason / bad key -> invalid-argument', async () => {
    const s = await sell(1); assert(s.ok, 'sale');
    assert(!(await call('posVoid', null, voidReq(s.data.saleId, key('void')))).ok, 'no auth');
    const r1 = await call('posVoid', OWNER, voidReq(s.data.saleId, key('void'), { reason: '' })); eq(r1.code, 'invalid-argument', 'no reason');
    const r2 = await call('posVoid', OWNER, voidReq(s.data.saleId, 'x')); eq(r2.code, 'invalid-argument', 'short key');
    eq((await get('products/soap')).stock, 18, 'nothing restored (19 - 1 sold)');
  });
  await test('P7 posReceipt VOID: owner gets one receipt (replay same id); other business refused', async () => {
    const req = { idempotencyKey: key('rcpt'), businessId: 'B1', storeId: 'S1', transactionType: 'VOID', originalSaleId: sale1, voidId: (void1 && (void1.voidId || void1.id)) || ('void_' + voidKey) };
    const r = await call('posReceipt', OWNER, req); assert(r.ok, JSON.stringify(r));
    const again = await call('posReceipt', OWNER, Object.assign({}, req, { idempotencyKey: key('rcpt') })); assert(again.ok, JSON.stringify(again));
    eq(again.data.receiptId || again.data.id, r.data.receiptId || r.data.id, 'same receipt');
    assert(!(await call('posReceipt', OTHER, Object.assign({}, req, { idempotencyKey: key('rcpt') }))).ok, 'other business refused');
  });

  console.log('\n[2. rules: a browser cannot write POS / service-order records]');
  const T = token('kuku');
  for (const [label, method, p, data] of [
    ['create pos_voids', 'PATCH', 'pos_voids/x1', { txId: sale1, reason: 'r' }],
    ['create pos_transactions', 'PATCH', 'pos_transactions/x1', { status: 'voided' }],
    ['create service_orders', 'PATCH', 'service_orders/x1', { status: 'pending', clientId: 'kuku' }],
    ['update own sale voidStatus', 'PATCH', 'sales/' + sale1 + '?updateMask.fieldPaths=voidStatus', { voidStatus: 'VOIDED' }],
    ['create sale_voids', 'PATCH', 'sale_voids/void_fake', { originalSaleId: sale1 }],
    ['create receipts', 'PATCH', 'receipts/fake', { total: 1 }]
  ]) await test('R ' + label + ' -> DENY', async () => assert(denied(await rest(method, p, T, data)), 'allowed'));

  console.log('\n[3. browser wrapper window.skhPOS.voidTransaction]');
  const src = fs.readFileSync(path.join(ROOT, 'js/app/62-missing-features.js'), 'utf8');
  await test('W source has no write to pos_voids / pos_transactions / service_orders', async () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/collection\('(pos_voids|pos_transactions|service_orders)'\)/.test(code), 'restricted write still present');
  });
  const start = src.indexOf('  window.skhPOS = window.skhPOS || {};'), end = src.indexOf('  window.skhPOS.getVoidHistory');
  const mk = (behaviour) => {
    const calls = [], writes = [], store = {};
    const skh = { currentUser: { uid: 'kuku' }, currentUserData: { businessId: 'B1', storeId: 'S1' },
      wrapCallable: (n) => async (d) => { calls.push([n, d]); if (behaviour === 'fail') { const e = new Error('SALE_SCOPE_MISMATCH'); e.code = 'permission-denied'; throw e; } return { data: { status: 'VOIDED' } }; },
      setDoc: async () => writes.push('setDoc'), updateDoc: async () => writes.push('updateDoc'), addDoc: async () => writes.push('addDoc') };
    const win = { skh };
    const ls = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } };
    new Function('window', 'localStorage', 'skhToast', 'console', src.slice(start, end))(win, ls, () => {}, { error() {}, log() {} });
    return { fn: win.skhPOS.voidTransaction, calls, writes, win };
  };
  await test('W success -> exactly one posVoid call with the POS-screen idempotency key, no Firestore write, history +1', async () => {
    const e = mk('ok'); const r = await e.fn('SALE123', 'Kosa');
    assert(r.ok, JSON.stringify(r)); eq(e.calls.length, 1, 'calls'); eq(e.calls[0][0], 'posVoid', 'callable');
    eq(e.calls[0][1].idempotencyKey, 'void-ui-SALE123', 'key matches 17-hub submitPosVoid'); eq(e.calls[0][1].businessId, 'B1', 'businessId'); eq(e.calls[0][1].reason, 'Kosa', 'reason');
    eq(e.writes.length, 0, 'no direct write'); eq(e.win.skhPOS.voidHistory.length, 1, 'history');
  });
  await test('W server refusal -> ok:false, no history entry, no write', async () => {
    const e = mk('fail'); const r = await e.fn('SALE9', 'Kosa');
    assert(!r.ok && r.reason === 'permission-denied', JSON.stringify(r)); eq(e.win.skhPOS.voidHistory.length, 0, 'history'); eq(e.writes.length, 0, 'writes');
  });
  await test('W empty reason -> refused before any call', async () => {
    const e = mk('ok'); const r = await e.fn('SALE9', '  ');
    assert(!r.ok && r.reason === 'reason_required', JSON.stringify(r)); eq(e.calls.length, 0, 'no call');
  });

  console.log(`\nMODULE 2 POS AUTHORITY (emulator): ${pass} passed, ${fail} failed`);
  if (fail) console.log('FAILED: ' + failures.join(' | '));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });

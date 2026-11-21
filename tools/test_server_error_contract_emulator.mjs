#!/usr/bin/env node
/* [G-3 2026-11-20] The server error contract (functions/errors.js) and the failure paths behind SRV-05/06/07/10/11.
 * Emulator only; PesaPal is a mocked global fetch (no network, no money).
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai node tools/test_server_error_contract_emulator.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator inahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const E = require(path.join(ROOT, 'functions', 'errors.js'));
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const db = admin.firestore();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const T = Date.now().toString(36);
const logs = []; for (const lvl of ['error', 'warn', 'info']) { const orig = logger[lvl]; logger[lvl] = (msg, entry) => { logs.push({ lvl, msg, entry }); }; }
async function call(name, uid, data, token) {
  const auth = uid ? { uid, token: Object.assign({ uid, email: uid + '@secret-mail.test', email_verified: true }, token || {}) } : null;
  try { return { ok: true, data: await fns[name].run({ data: data || {}, auth, rawRequest: { headers: {} }, acceptsStreaming: false }) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message, details: e && e.details, err: e }; }
}

// ---------------- the wrapper itself ----------------
await test('every exported callable (155) runs inside the shared wrapper and is labelled with its export name', async () => {
  const c = Object.keys(fns).filter(k => fns[k] && fns[k].__endpoint && fns[k].__endpoint.callableTrigger);
  eq(c.length, 155, 'callables'); const bad = c.filter(k => !(fns[k].__skhLabel && fns[k].__skhLabel.name === k)); eq(bad.length, 0, 'unlabelled ' + bad.join(','));
});
await test('unexpected exception -> internal + request id (message + details), raw text never sent, one structured error log', async () => {
  logs.length = 0;
  const h = E.withErrors(async () => { throw new Error('secret stack text: db password=hunter2'); }, { name: 'probeFn' });
  let err; try { await h({ auth: { uid: 'u1', token: { email: 'person@mail.test' } }, data: { pin: '1234', phone: '0712345678' } }); } catch (e) { err = e; }
  ok(err instanceof HttpsError, 'HttpsError'); eq(err.code, 'internal', 'code'); ok(/^[0-9a-f]{12}$/.test(err.details.requestId), 'request id');
  ok(err.message.includes(err.details.requestId) && !/hunter2|secret stack/.test(err.message), 'message: ' + err.message);
  const l = logs.find(x => x.lvl === 'error'); ok(l, 'logged'); eq(l.entry.fn, 'probeFn', 'fn'); eq(l.entry.requestId, err.details.requestId, 'same id');
  eq(l.entry.code, 'internal', 'code logged'); ok(typeof l.entry.durationMs === 'number', 'duration'); ok(/^[0-9a-f]{12}$/.test(l.entry.uidHash), 'uid hashed');
  const s = JSON.stringify(l); ok(!/person@mail|1234|0712345678|hunter2|"u1"/.test(s), 'no PII / payload / secret in the log: ' + s);
});
await test('a typed HttpsError keeps its code and message; request id added; string details untouched; ids unique', async () => {
  const h = E.withErrors(async () => { throw new HttpsError('failed-precondition', 'PRICE_CHANGED: bei imebadilika'); }, { name: 'p' });
  const e1 = await h({}).catch(e => e), e2 = await h({}).catch(e => e);
  eq(e1.code, 'failed-precondition', 'code'); eq(e1.message, 'PRICE_CHANGED: bei imebadilika', 'message'); ok(e1.details.requestId && e1.details.requestId !== e2.details.requestId, 'unique ids');
  const h2 = E.withErrors(async () => { throw new HttpsError('invalid-argument', 'x', 'string-detail'); }, { name: 'q' });
  eq((await h2({}).catch(e => e)).details, 'string-detail', 'string details kept');
  const h3 = E.withErrors(async () => { throw new HttpsError('not-found', 'x', { field: 'a' }); }, { name: 'r' });
  const d3 = (await h3({}).catch(e => e)).details; eq(d3.field, 'a', 'object details kept'); ok(d3.requestId, 'id merged');
});
await test('Firestore / runtime failures map to typed codes (contention, quota, index, deadline, unavailable, exists)', async () => {
  const m = (e) => E.toHttpsError(e, 'rid').code;
  eq(m(Object.assign(new Error('10 ABORTED: Too much contention'), { code: 10 })), 'aborted', 'aborted');
  eq(m(Object.assign(new Error('8 RESOURCE_EXHAUSTED'), { code: 8 })), 'resource-exhausted', 'quota');
  const ix = E.toHttpsError(Object.assign(new Error('9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console...'), { code: 9 }), 'rid');
  eq(ix.code, 'failed-precondition', 'index'); ok(/INDEX_UNAVAILABLE/.test(ix.message) && !/console/.test(ix.message), 'no internal link leaked');
  eq(m(Object.assign(new Error('4 DEADLINE_EXCEEDED'), { code: 4 })), 'deadline-exceeded', 'deadline');
  eq(m(Object.assign(new Error('14 UNAVAILABLE'), { code: 14 })), 'unavailable', 'unavailable');
  eq(m(Object.assign(new Error('6 ALREADY_EXISTS'), { code: 6 })), 'already-exists', 'exists');
  eq(m(Object.assign(new Error('9 FAILED_PRECONDITION: something else'), { code: 9 })), 'internal', 'non-index precondition stays internal');
});
await test('undefined field in a real Firestore write -> invalid-argument INVALID_FIELD (not INTERNAL); nothing written', async () => {
  const id = 'undef' + T;
  const h = E.withErrors(async () => { await db.doc('contract_probe/' + id).set({ a: 1, rating: undefined }); }, { name: 'undefProbe' });
  const e = await h({}).catch(x => x); eq(e.code, 'invalid-argument', 'code ' + e.message); ok(/INVALID_FIELD/.test(e.message), e.message);
  ok(!(await db.doc('contract_probe/' + id).get()).exists, 'no write');
  eq(JSON.stringify(E.stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: [1, undefined, 2] } })), '{"a":1,"c":{"e":[1,2]}}', 'stripUndefined');
});

// ---------------- SRV-05 missing user document ----------------
await test('withdrawalRequest with no users document -> failed-precondition USER_MISSING; no ledger, no request, no balance', async () => {
  const U = 'nouser' + T;
  const r = await call('withdrawalRequest', U, { amountTSh: 5000, channel: 'mobile', account: '0712345678', requestKey: 'k1' });
  eq(r.code, 'failed-precondition', 'code ' + r.message); ok(/USER_MISSING/.test(r.message), r.message);
  eq((await db.collection('wallet_ledger').where('userId', '==', U).get()).size, 0, 'no ledger');
  eq((await db.collection('withdrawal_requests').where('userId', '==', U).get()).size, 0, 'no request');
  ok(!(await db.doc('users/' + U).get()).exists, 'no user doc created');
});
await test('walletAdjust when the user document disappears before the transaction -> failed-precondition USER_MISSING; no ledger', async () => {
  const U = 'gone' + T; await db.doc('users/' + U).set({ uid: U, walletBalance: 0 });
  const orig = db.runTransaction.bind(db);
  db.runTransaction = async (fn, o) => { await db.doc('users/' + U).delete(); db.runTransaction = orig; return orig(fn, o); };
  const r = await call('walletAdjust', 'adm' + T, { docId: U, amountTSh: 1000, type: 'adjustment', ledgerKey: 'adj_' + T, note: 'Marekebisho ya majaribio' }, { admin: true });
  db.runTransaction = orig;
  eq(r.code, 'failed-precondition', 'code ' + r.message); ok(/USER_MISSING/.test(r.message), r.message);
  ok(!(await db.doc('wallet_ledger/adj_' + T).get()).exists, 'no ledger'); ok(!(await db.doc('users/' + U).get()).exists, 'user not recreated');
});

// ---------------- SRV-06 PesaPal (mocked fetch) ----------------
const realFetch = globalThis.fetch;
const BUYER = 'ppb' + T; await db.doc('users/' + BUYER).set({ uid: BUYER, walletBalance: 0 });
const holds = async () => (await db.collection('escrow_holds').where('uid', '==', BUYER).get()).size;
const mock = (impl) => { globalThis.fetch = impl; };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ppCall = (n) => call('pesapalCheckout', BUYER, { amount: 1000, orderTrackingId: 'PPT_' + T + '_' + n, purpose: 'deposit' });
process.env.PESAPAL_BASE_URL = 'https://cybqa.pesapal.com/pesapalv3';
await test('PesaPal keys missing -> failed-precondition PAYMENTS_NOT_CONFIGURED, no network call, no hold', async () => {
  delete process.env.PESAPAL_CONSUMER_KEY; delete process.env.PESAPAL_CONSUMER_SECRET; let called = 0; mock(async () => { called++; return json(200, {}); });
  const r = await ppCall(1); eq(r.code, 'failed-precondition', 'code'); ok(/PAYMENTS_NOT_CONFIGURED/.test(r.message), r.message); eq(called, 0, 'no fetch'); eq(await holds(), 0, 'no hold');
});
process.env.PESAPAL_CONSUMER_KEY = 'ck_test_' + T; process.env.PESAPAL_CONSUMER_SECRET = 'cs_test_' + T;
await test('PesaPal rejects the keys (401) -> failed-precondition PAYMENT_PROVIDER_AUTH; keys never in message or log', async () => {
  logs.length = 0; mock(async () => json(401, { error: { message: 'Invalid consumer credentials' } }));
  const r = await ppCall(2); eq(r.code, 'failed-precondition', 'code'); ok(/PAYMENT_PROVIDER_AUTH/.test(r.message), r.message);
  ok(!JSON.stringify([r.message, logs]).includes('ck_test_') && !JSON.stringify(logs).includes('cs_test_'), 'no keys'); eq(await holds(), 0, 'no hold');
  const l = logs.find(x => x.entry && x.entry.upstream); ok(l && l.entry.upstream.service === 'pesapal' && l.entry.upstream.status === 401, 'upstream status logged ' + JSON.stringify(l));
});
await test('PesaPal 503 -> unavailable PAYMENT_PROVIDER_UNAVAILABLE, no hold', async () => {
  mock(async () => json(503, { message: 'maintenance' }));
  const r = await ppCall(3); eq(r.code, 'unavailable', 'code'); ok(/PAYMENT_PROVIDER_UNAVAILABLE/.test(r.message) && /503/.test(r.message), r.message); eq(await holds(), 0, 'no hold');
});
await test('PesaPal network failure -> unavailable', async () => {
  mock(async () => { throw new TypeError('fetch failed'); });
  const r = await ppCall(4); eq(r.code, 'unavailable', 'code ' + r.message); eq(await holds(), 0, 'no hold');
});
await test('PesaPal hangs -> aborted at 15 s and returned as unavailable (timeout logged), no hold', async () => {
  logs.length = 0;
  mock((url, opts) => new Promise((res, rej) => { opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); }));
  const t0 = Date.now(); const r = await ppCall(5); const ms = Date.now() - t0;
  eq(r.code, 'unavailable', 'code'); ok(/sekunde 15/.test(r.message), r.message); ok(ms >= 14500 && ms < 20000, 'deadline ~15 s, got ' + ms);
  const l = logs.find(x => x.entry && x.entry.upstream && x.entry.upstream.timeout === true); ok(l, 'timeout logged'); eq(await holds(), 0, 'no hold');
});
await test('token OK but SubmitOrderRequest 502 -> unavailable, no hold; then a mocked success creates exactly one hold', async () => {
  mock(async (url) => /RequestToken/.test(url) ? json(200, { token: 'tok_' + T, expiryDate: new Date(Date.now() + 300000).toISOString() }) : json(502, {}));
  const r = await ppCall(6); eq(r.code, 'unavailable', 'code ' + r.message); eq(await holds(), 0, 'no hold');
  mock(async (url) => /RequestToken/.test(url) ? json(200, { token: 'tok_' + T }) : json(200, { order_tracking_id: 'OT' + T, redirect_url: 'https://cybqa.pesapal.com/pay/x' }));
  const s = await ppCall(7); ok(s.ok && s.data.redirectUrl, JSON.stringify(s)); eq(await holds(), 1, 'one init hold');
  ok(!JSON.stringify(logs).includes('tok_' + T), 'token never logged');
});
globalThis.fetch = realFetch;

// ---------------- SRV-11 contention ----------------
await test('8 parallel wallet payments of the same order: one debit, every answer typed (no INTERNAL)', async () => {
  const B = 'cb' + T, S = 'cs' + T, P = 'cp' + T, O = 'co' + T;
  await db.doc('users/' + B).set({ uid: B, walletBalance: 50000 }); await db.doc('users/' + S).set({ uid: S, walletBalance: 0 });
  await db.doc('products/' + P).set({ title: 'Redio', userId: S, price: 10000, stock: 5, status: 'active' });
  await db.doc('orders/' + O).set({ buyerId: B, sellerId: S, amount: 10000, status: 'payment_pending', paymentStatus: 'pending', items: [{ productId: P, id: P, price: 10000, qty: 1, quantity: 1, sellerId: S }] });
  const rs = await Promise.all(Array.from({ length: 8 }, () => call('orderWalletPay', B, { orderIds: [O] })));
  const codes = rs.map(r => r.ok ? 'ok' : r.code); ok(!codes.includes('internal') && !codes.includes('unknown'), 'codes ' + codes.join(','));
  ok(codes.includes('ok'), 'at least one success');
  eq(Number((await db.doc('users/' + B).get()).data().walletBalance), 40000, 'debited exactly once');
});

// ---------------- SRV-07 signing ----------------
await test('memberAuthenticate when custom-token signing is not permitted -> failed-precondition SIGNING_NOT_CONFIGURED and the session is closed', async () => {
  const sig = fns._isSigningPermissionErrorForTest;
  ok(sig(new Error('Permission iam.serviceAccounts.signBlob denied on resource')), 'signBlob msg');
  ok(sig(Object.assign(new Error('x'), { code: 'auth/insufficient-permission' })), 'code'); ok(!sig(new Error('network down')), 'other error');
  const AG = 'ag' + T, M = 'mm' + T, CODE = 'SKS' + T.toUpperCase();
  await db.doc('users/' + M).set({ uid: M, memberId: CODE, isOfflineUser: true });
  await db.collection('agentMembers').add({ agentId: AG, memberId: M, memberCode: CODE, status: 'ACTIVE', createdAt: new Date().toISOString() });
  await db.doc('memberSecrets/' + M).set({ uid: M, pinSalt: null, pinHash: null, pinAttempts: 0 });
  ok((await call('memberSetPin', M, { newPin: '2468' })).ok, 'pin set');
  const auth = admin.auth(); const orig = auth.createCustomToken.bind(auth);
  auth.createCustomToken = async () => { throw Object.assign(new Error('Permission iam.serviceAccounts.signBlob denied'), { code: 'auth/insufficient-permission' }); };
  const r = await call('memberAuthenticate', AG, { memberId: CODE, pin: '2468' }, { agent: true });
  auth.createCustomToken = orig;
  eq(r.code, 'failed-precondition', 'code ' + r.message); ok(/SIGNING_NOT_CONFIGURED/.test(r.message), r.message);
  const sess = await db.collection('assistedSessions').where('userId', '==', M).get(); eq(sess.size, 1, 'one session'); eq(sess.docs[0].data().active, false, 'closed');
  const okr = await call('memberAuthenticate', AG, { memberId: CODE, pin: '2468' }, { agent: true }); ok(okr.ok && okr.data.customToken, 'works when signing is allowed');
});

console.log(`\nSERVER ERROR CONTRACT (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* [G-4 2026-11-20] Client error states in a REAL browser with the REAL Firebase Functions SDK (10.8.1).
 * The app is opened from the local functions server (port 5055, callables at /__fn/<name>); Playwright answers
 * the callable requests with each failure shape so the SDK itself turns them into FunctionsErrors.
 * Checks, per state: classification (e.kind / e.fnDown), the Swahili text the user sees (e.message ==
 * e.friendlyMessage), the request id, and the circuit breaker (network calls actually made).
 *   status 0 (network / CORS), offline, HTTP 500 with server message + request id, bare INTERNAL,
 *   readable 404 (not deployed), server not-found, deadline-exceeded (SDK timeout), front-end 503,
 *   server unavailable (PAYMENT_PROVIDER_UNAVAILABLE), unauthenticated, permission-denied,
 *   typed business code (auction bid) left parseable.
 * Run: node functions/local-server.js (port 5055) then
 *      SKH_FIREBASE_SDK_DIR=<firebase@10.8.1 package> node tools/test_client_error_states_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const URL = process.env.SKH_ERR_URL || 'http://127.0.0.1:5055/';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext();
const page = await ctx.newPage();
if (process.env.SKH_FIREBASE_SDK_DIR) {
  const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/');
  await page.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) }));
}
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + (e && e.message)); } }
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, x, m) => { if (a !== x) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(x) + ')'); };

/* name -> how the "server" answers. hits[name] counts requests that reached the network. */
const hits = {};
const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const err = (status, code, message, details) => json(status, { error: Object.assign({ status: code, message }, details ? { details } : {}) });
const RID = 'a1b2c3d4e5f6';
const PLAN = {
  g4StatusZero: 'abort',
  pesapalG4StatusZero: 'abort',
  g4Http500Server: err(500, 'INTERNAL', 'Hitilafu ya server (namba: ' + RID + '). Jaribu tena; ikiendelea, wasiliana na msaada ukitaja namba hii.', { requestId: RID }),
  g4BareInternal: err(500, 'INTERNAL', 'INTERNAL'),
  g4Missing404: { status: 404, contentType: 'text/html', body: '<html>Not Found</html>' },
  g4ServerNotFound: err(404, 'NOT_FOUND', 'Oda haipo.', { requestId: RID }),
  g4Deadline: 'slow',
  g4FrontEnd503: { status: 503, contentType: 'text/html', body: 'Service Unavailable' },
  g4ServerUnavailable: err(503, 'UNAVAILABLE', 'PAYMENT_PROVIDER_UNAVAILABLE: huduma ya malipo haipatikani kwa sasa. Pesa yoyote haijatolewa.', { requestId: RID, upstream: 'pesapal' }),
  g4Unauth: err(401, 'UNAUTHENTICATED', 'Tafadhali ingia kwanza.', { requestId: RID }),
  g4Denied: err(403, 'PERMISSION_DENIED', 'Admin pekee.', { requestId: RID }),
  g4BidCode: err(400, 'FAILED_PRECONDITION', 'mnada_umefungwa', { requestId: RID }),
  g4Ok: json(200, { result: { ok: true } })
};
await page.route(/\/__fn\/(g4\w+|pesapalG4\w+)$/, async (route) => {
  const name = route.request().url().split('/').pop();
  hits[name] = (hits[name] || 0) + 1;
  const p = PLAN[name];
  if (p === 'abort') return route.abort('failed');
  if (p === 'slow') { await new Promise(r => setTimeout(r, 2500)); return route.fulfill(json(200, { result: { ok: true } })).catch(() => {}); }
  return route.fulfill(p);
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.skh && typeof window.skh.wrapCallable === 'function' && window.skh.fApp, null, { timeout: 45000 });

/* call through the app's own wrapper; return what the UI code sees */
const callFn = (name, opts) => page.evaluate(async ([n, o]) => {
  try { const r = await window.skh.wrapCallable(n)({ probe: 1 }, o || undefined); return { ok: true, data: r && r.data }; }
  catch (e) {
    return { ok: false, code: e.code, kind: e.kind, fnDown: e.fnDown, message: e.message, friendly: e.friendlyMessage, requestId: e.requestId,
      rawMessage: e.rawMessage, missingFlag: !!(window.skh._fnMissing && window.skh._fnMissing[n]), downFlag: !!(window.skh._fnDownSinceByName && window.skh._fnDownSinceByName[n]),
      errText: window.skhFnErrText(e, n) };
  }
}, [name, opts || null]);
const noRaw = (r) => ok(!/^internal$/i.test(r.message) && !/FirebaseError|functions\//.test(r.message), 'raw SDK text leaked: ' + r.message);

await test('status 0 (network / CORS / undeployed): unreachable, Swahili text names both causes, 30 s breaker (no second network call), not marked missing', async () => {
  const r = await callFn('g4StatusZero');
  eq(r.kind, 'unreachable', 'kind'); eq(r.fnDown, true, 'fnDown'); noRaw(r);
  ok(/Hatukuweza kufikia server/.test(r.message), 'text: ' + r.message); eq(r.message, r.friendly, 'alert(e.message) shows the friendly text');
  eq(r.missingFlag, false, 'status 0 must not be treated as a confirmed 404'); eq(r.downFlag, true, 'short breaker armed');
  const r2 = await callFn('g4StatusZero'); eq(hits.g4StatusZero, 1, 'breaker: no second network call'); eq(r2.fnDown, true, 'second call fails fast');
});
await test('status 0 on a money call: the text says no money was taken', async () => {
  const r = await callFn('pesapalG4StatusZero'); ok(/pesa yoyote haijatolewa/i.test(r.message), r.message);
});
await test('offline device: the text says there is no network', async () => {
  await ctx.setOffline(true);
  const r = await page.evaluate(() => window.skhFnDownMessage('g4', 'unreachable'));
  await ctx.setOffline(false);
  ok(/Hakuna mtandao/.test(r), r);
});
await test('HTTP 500 with a server message: a REAL answer (kind server), message + request id shown, breaker NOT armed', async () => {
  const r = await callFn('g4Http500Server');
  eq(r.code, 'functions/internal', 'code'); eq(r.kind, 'server', 'kind'); eq(r.fnDown, false, 'fnDown');
  eq(r.requestId, RID, 'requestId'); ok(r.message.includes(RID), 'request id visible: ' + r.message); eq(r.downFlag, false, 'breaker not armed');
  await callFn('g4Http500Server'); eq(hits.g4Http500Server, 2, 'next call still reaches the server');
});
await test('bare INTERNAL (old deployment, no request id): Swahili server text, never the word INTERNAL, breaker NOT armed', async () => {
  const r = await callFn('g4BareInternal');
  eq(r.kind, 'server', 'kind'); eq(r.fnDown, false, 'fnDown'); noRaw(r); ok(/Hitilafu ya server/.test(r.message), r.message);
  await callFn('g4BareInternal'); eq(hits.g4BareInternal, 2, 'not blocked');
});
await test('readable 404 without a callable body (function not deployed): missing, 10-minute pause', async () => {
  const r = await callFn('g4Missing404');
  eq(r.kind, 'missing', 'kind'); eq(r.fnDown, true, 'fnDown'); eq(r.missingFlag, true, 'long pause flag'); ok(/bado haijawashwa/.test(r.message), r.message);
  await callFn('g4Missing404'); eq(hits.g4Missing404, 1, 'no retry during the pause');
});
await test('not-found answered BY THE SERVER (typed, request id): shown as-is, no breaker', async () => {
  const r = await callFn('g4ServerNotFound');
  eq(r.kind, 'server', 'kind'); eq(r.fnDown, false, 'fnDown'); eq(r.message, 'Oda haipo.', 'server text unchanged'); eq(r.requestId, RID, 'id kept on the error'); eq(r.missingFlag, false, 'not marked missing');
});
await test('deadline-exceeded (real SDK timeout, set when the callable is created): busy, Swahili "imechelewa", fnDown', async () => {
  // The SDK takes `timeout` at httpsCallable() creation (the app uses the default 70 s), so the probe builds its own
  // callable with a 400 ms timeout and passes the SDK's error through the app's normaliser (same path as wrapCallable).
  const r = await page.evaluate(async () => {
    const f = window.skh.httpsCallableFromURL(window.skh.getFunctions(window.skh.fApp, window.skh._functionsRegion), window.skh.functionsBaseUrl + '/g4Deadline', { timeout: 400 });
    try { await f({}); return { ok: true }; } catch (e0) { const e = window.skh.normalizeFnError('g4Deadline', e0); return { code: e.code, kind: e.kind, fnDown: e.fnDown, message: e.message }; }
  });
  eq(r.code, 'functions/deadline-exceeded', 'code'); eq(r.kind, 'busy', 'kind'); eq(r.fnDown, true, 'fnDown'); ok(/imechelewa/.test(r.message), r.message);
});
await test('front-end 503 without a callable body: busy, breaker armed', async () => {
  const r = await callFn('g4FrontEnd503'); eq(r.code, 'functions/unavailable', 'code'); eq(r.kind, 'busy', 'kind'); eq(r.fnDown, true, 'fnDown');
});
await test('unavailable answered BY THE SERVER (PesaPal down): real answer, text + request id, no breaker', async () => {
  const r = await callFn('g4ServerUnavailable');
  eq(r.kind, 'server', 'kind'); eq(r.fnDown, false, 'fnDown'); ok(/PAYMENT_PROVIDER_UNAVAILABLE/.test(r.message) && /Pesa yoyote haijatolewa/.test(r.message), r.message);
  ok(r.message.includes(RID), 'request id shown for a provider outage'); await callFn('g4ServerUnavailable'); eq(hits.g4ServerUnavailable, 2, 'not blocked');
});
await test('unauthenticated: server text shown unchanged, no breaker', async () => {
  const r = await callFn('g4Unauth'); eq(r.code, 'functions/unauthenticated', 'code'); eq(r.kind, 'server', 'kind'); eq(r.fnDown, false, 'fnDown'); eq(r.message, 'Tafadhali ingia kwanza.', 'text');
});
await test('permission-denied: server text shown unchanged, no breaker', async () => {
  const r = await callFn('g4Denied'); eq(r.code, 'functions/permission-denied', 'code'); eq(r.kind, 'server', 'kind'); eq(r.message, 'Admin pekee.', 'text'); eq(r.downFlag, false, 'no breaker');
});
await test('typed business code stays parseable (07-product.js extracts "mnada_umefungwa" from e.message)', async () => {
  const r = await callFn('g4BidCode');
  eq(r.message, 'mnada_umefungwa', 'message unchanged'); eq(r.requestId, RID, 'id still on the error object');
  const code = String(r.message).replace(/^.*?:\s*(?=[a-z_]+(:\d+)?$)/, ''); eq(code, 'mnada_umefungwa', 'placeBid parsing');
});
await test('success after failures: answer returned and the breaker for that callable is open', async () => {
  const r = await callFn('g4Ok'); eq(r.ok, true, 'ok'); eq(r.data && r.data.ok, true, 'data');
});

await b.close();
console.log(`\nCLIENT ERROR STATES (browser): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

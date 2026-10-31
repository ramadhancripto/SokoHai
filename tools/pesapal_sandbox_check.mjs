#!/usr/bin/env node
/**
 * PesaPal SANDBOX check (no real money). Run on YOUR computer or in staging CI,
 * with the sandbox keys in the environment — never paste keys into chat.
 *
 *   PESAPAL_CONSUMER_KEY=... PESAPAL_CONSUMER_SECRET=... \
 *   node tools/pesapal_sandbox_check.mjs order          # step 1: token + IPN list + test order (TSh 100)
 *   node tools/pesapal_sandbox_check.mjs status <OrderTrackingId>   # step 3: after paying on the sandbox page
 *
 * Refuses to run against the LIVE PesaPal URL. Prints no secrets.
 */
const SANDBOX = 'https://cybqa.pesapal.com/pesapalv3';
const base = (process.env.PESAPAL_BASE_URL || SANDBOX).replace(/\/+$/, '');
const [, , cmd, arg] = process.argv;

function die(msg, code = 1) { console.error('STOP: ' + msg); process.exit(code); }
// [PHASE 9] Exact host check. A substring test let a live URL that merely
// contained "cybqa.pesapal.com" (e.g. in a query string) through.
export function isSandboxBase(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'cybqa.pesapal.com'; } catch (e) { return false; }
}
if (process.env.SKH_PESAPAL_GUARD_SELFTEST) { console.log(JSON.stringify({ ok: isSandboxBase(base) })); process.exit(0); }
if (!isSandboxBase(base)) die('PESAPAL_BASE_URL is not the sandbox host cybqa.pesapal.com. This script never touches live money.', 3);
const key = process.env.PESAPAL_CONSUMER_KEY, secret = process.env.PESAPAL_CONSUMER_SECRET;
if (!key || !secret) die('Set PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET (sandbox) in the environment.', 2);
if (!['order', 'status'].includes(cmd)) die('Usage: order | status <OrderTrackingId>', 2);

async function j(url, opts = {}) {
  let r;
  try { r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, opts.headers || {}) })); }
  catch (e) { die('Network: cannot reach ' + new URL(url).host + ' (' + ((e.cause && e.cause.code) || e.message) + '). Run from a computer with internet access.', 4); }
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, d };
}
const tok = await j(base + '/api/Auth/RequestToken', { method: 'POST', body: JSON.stringify({ consumer_key: key, consumer_secret: secret }) });
if (!tok.d || !tok.d.token) die('RequestToken failed (HTTP ' + tok.status + '): ' + JSON.stringify(tok.d.error || tok.d).slice(0, 200));
console.log('OK  1. Token received (expires ' + (tok.d.expiryDate || '?') + ')');
const auth = { Authorization: 'Bearer ' + tok.d.token };

if (cmd === 'order') {
  const ipns = await j(base + '/api/URLSetup/GetIpnList', { headers: auth });
  const list = Array.isArray(ipns.d) ? ipns.d : [];
  console.log('OK  2. Registered IPN URLs: ' + (list.length ? list.map(x => x.url + ' (id ' + x.ipn_id + ')').join(', ') : 'none'));
  const ipnId = process.env.PESAPAL_IPN_ID || (list[0] && list[0].ipn_id) || '';
  if (!ipnId) console.log('WARN   No IPN id: register the staging pesapalIpn URL first (see runbook).');
  const ref = 'SKH-SANDBOX-' + Date.now();
  const order = await j(base + '/api/Transactions/SubmitOrderRequest', { method: 'POST', headers: auth, body: JSON.stringify({
    id: ref, currency: 'TZS', amount: 100, description: 'SokoHai sandbox test (no real money)',
    callback_url: process.env.PESAPAL_REDIRECT_URL || 'https://example.org/sokohai-sandbox-return',
    notification_id: ipnId || undefined,
    billing_address: { email_address: 'sandbox@sokohai.test', first_name: 'Sandbox', last_name: 'Tester' } }) });
  if (!order.d || !order.d.redirect_url) die('SubmitOrderRequest failed (HTTP ' + order.status + '): ' + JSON.stringify(order.d.error || order.d).slice(0, 200));
  console.log('OK  3. Test order ' + ref + ' -> OrderTrackingId ' + order.d.order_tracking_id);
  console.log('NEXT   Open this sandbox page and pay with a PesaPal TEST card/number:\n       ' + order.d.redirect_url);
  console.log('NEXT   Then run: node tools/pesapal_sandbox_check.mjs status ' + order.d.order_tracking_id);
} else {
  if (!arg) die('status needs an OrderTrackingId', 2);
  const s = await j(base + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + encodeURIComponent(arg), { headers: auth });
  const d = s.d || {};
  console.log('OK  Status: ' + (d.payment_status_description || d.status) + ' | status_code ' + d.status_code + ' | amount ' + d.amount + ' ' + d.currency + ' | ref ' + d.merchant_reference);
  console.log(Number(d.status_code) === 1 ? 'PASS   Sandbox payment COMPLETED — SokoHai treats this as paid (status_code 1).' : 'INFO   Not completed yet (status_code ' + d.status_code + ').');
}

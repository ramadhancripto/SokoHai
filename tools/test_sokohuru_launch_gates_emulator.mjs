// [SOKOHURU 2026-11-21] Emulator only (demo-sokohai). Server-side launch gates (functions/launch-gates.js):
// a disabled callable answers failed-precondition FEATURE_DISABLED before its handler runs and writes nothing;
// schedules of disabled features do nothing; marketplace callables are never gated; switching a feature on
// runs the ORIGINAL handler unchanged.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
process.env.GCLOUD_PROJECT = 'demo-sokohai';
delete process.env.SKH_LAUNCH_SCOPE;
const require = createRequire(new URL('../functions/index.js', import.meta.url));
const fns = require('../functions/index.js');            // initialises the default admin app
const admin = require('firebase-admin');
const db = admin.firestore();
const gates = require('../functions/launch-gates.js');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  PASS ' + m); };
const T = Date.now().toString(36), uid = 'gate-u-' + T;
const req = (data = {}) => ({ data, auth: { uid, token: { email: uid + '@example.test', email_verified: true } }, rawRequest: { headers: {}, ip: '127.0.0.1' } });
async function err(p) { try { await p; return null; } catch (e) { return e; } }
const disabled = e => !!(e && e.code === 'failed-precondition' && /FEATURE_DISABLED/.test(e.message));
const OFF = Object.fromEntries(gates.FEATURES.map(f => [f, false]));

try {
  // 1. wiring
  const callables = Object.keys(gates.CALLABLE_FEATURE), schedules = Object.keys(gates.SCHEDULE_FEATURE);
  ok(callables.every(n => fns[n] && fns[n].__skhLaunchFeature === gates.CALLABLE_FEATURE[n] && fns[n].__endpoint.callableTrigger), `all ${callables.length} money/delivery callables are gated`);
  ok(schedules.every(n => fns[n] && fns[n].__skhLaunchFeature && fns[n].__endpoint.scheduleTrigger), `all ${schedules.length} money/delivery schedules are gated`);
  const all = Object.keys(fns).filter(k => fns[k] && fns[k].__endpoint && fns[k].__endpoint.callableTrigger);
  ok(all.length === 155 && all.every(k => fns[k].__skhLabel && fns[k].__skhLabel.name === k), '155 callables still exported and labelled (no export lost or duplicated)');
  const market = ['inventoryAdjust', 'adminModerateListing', 'commentsPublish', 'reviewsPublish', 'userCardSync', 'liveCreate'].filter(n => fns[n]);
  ok(market.length >= 4 && market.every(n => !fns[n].__skhLaunchFeature), 'marketplace callables (stock, moderation, comments, reviews, user cards) are NOT gated: ' + market.join(', '));
  ok(fns.sokopayAutoRelease.__endpoint.scheduleTrigger.schedule === '*/5 * * * *' && fns.sokopayAutoRelease.__endpoint.scheduleTrigger.timeZone === 'Africa/Dar_es_Salaam', 'gated schedule keeps its cron and time zone');

  // 2. production default: env SKH_LAUNCH_SCOPE=sokohuru and no system/launch document -> everything OFF
  await db.doc('system/launch').delete();
  process.env.SKH_LAUNCH_SCOPE = 'sokohuru'; gates.resetCache();
  const results = await Promise.all(callables.map(async n => [n, await err(fns[n].run(req({ amount: 1000, productId: 'x', orderId: 'x' })))]));
  const leaked = results.filter(([, e]) => !disabled(e)).map(([n, e]) => n + ':' + (e ? e.code : 'ok'));
  ok(leaked.length === 0, `every gated callable answers FEATURE_DISABLED with SKH_LAUNCH_SCOPE=sokohuru (${callables.length}) ${leaked.join(',')}`);
  // nothing was written by the refused calls
  const ledger = await db.collection('wallet_ledger').where('uid', '==', uid).get();
  const wreq = await db.collection('withdrawal_requests').where('uid', '==', uid).get();
  ok(ledger.empty && wreq.empty, 'refused wallet / withdrawal calls wrote nothing');
  for (const n of schedules) ok((await fns[n].run({ scheduleTime: new Date().toISOString() })) === undefined, `schedule ${n} skipped while its feature is off`);

  // 3. explicit document wins over the environment
  await db.doc('system/launch').set(Object.assign({}, OFF, { auction: true })); gates.resetCache();
  const onErr = await err(fns.auctionPlaceBid.run(req({ productId: 'missing-' + T, amount: 1 })));
  ok(onErr && !disabled(onErr), 'auction switched ON in system/launch -> the original auctionPlaceBid handler runs (' + (onErr && onErr.code) + ')');
  ok(disabled(await err(fns.walletAdjust.run(req({ uid, amount: 5, reason: 'x' })))), 'wallet still OFF in the same document');

  // 4. no environment flag, document says false -> OFF (staging / emulator can test the launch)
  delete process.env.SKH_LAUNCH_SCOPE;
  await db.doc('system/launch').set(OFF); gates.resetCache();
  ok(disabled(await err(fns.pesapalCheckout.run(req({ amount: 1000 })))), 'checkout OFF by document even without the environment flag');
  ok(disabled(await err(fns.deliveryAccept.run(req({ rideId: 'x' })))), 'delivery OFF by document');
  ok(disabled(await err(fns.entitlementGrant.run(req({ kind: 'boost', collectionName: 'products', docId: 'x' })))), 'paid entitlements (free-mode boost loophole) OFF by document');

  // 5. historic behaviour: no document, no environment flag -> handlers run as before (existing suites)
  await db.doc('system/launch').delete(); gates.resetCache();
  const histErr = await err(fns.groupBuyJoin.run(req({ productId: 'missing-' + T })));
  ok(histErr && !disabled(histErr), 'no system/launch and no SKH_LAUNCH_SCOPE -> historic behaviour (' + (histErr && histErr.code) + ')');
  ok((await gates.featureEnabled('escrow')) === true, 'featureEnabled reports ON in historic mode');
} finally {
  await db.doc('system/launch').delete().catch(() => {});
  gates.resetCache();
}
console.log(`\nSOKOHURU LAUNCH GATES (server, emulator): ${pass} passed, 0 failed`);
process.exit(0);

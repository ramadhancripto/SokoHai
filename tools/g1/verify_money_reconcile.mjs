#!/usr/bin/env node
/* PHASE C4 — reconciliation: wallet balances vs ledger vs escrow vs orders vs withdrawals.
 * Flow kamili: admin-credit buyer -> service order -> walletPay(held) -> ship -> release
 * -> seller withdraw -> admin paid. Kisha suluhu hesabu zote. Emulator only. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai-g1';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();
async function test(name, fn) {
  try { await fn(); console.log('  PASS ' + name); }
  catch (e) { console.log('  FAIL ' + name + ': ' + (e && e.message)); process.exitCode = 1; }
}
function eq(a, b, m) { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function assert(c, m) { if (!c) throw new Error('assert: ' + m); }
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid }, extra || {}) });
async function call(name, uid, data, extra) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: uid ? tok(uid, extra) : undefined, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const B = 'rBuy', S = 'rSell', A = 'rAdmin';
await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await db.doc('users/' + B).set({ uid: B, walletBalance: 0 });
await db.doc('users/' + S).set({ uid: S, walletBalance: 0 });
await db.doc('requests/RQ-R1').set({ senderId: B, receiverId: S, status: 'accepted', detail2: 20000 });
await db.doc('orders/RO-1').set({ buyerId: B, sellerId: S, amount: 20000, status: 'awaiting_payment', paymentStatus: 'pending', paymentVerified: false, collectionName: 'services', itemId: 'RQ-R1' });

await test('C4-1 admin credit buyer 100000 (ledger + balance)', async () => {
  const r = await call('walletAdjust', A, { docId: B, amountTSh: 100000, type: 'adjustment', ledgerKey: 'recon-credit-1', note: 'suluhu test' }, { admin: true });
  eq(r.ok, true, JSON.stringify(r));
  eq((await db.doc('users/' + B).get()).data().walletBalance, 100000, 'buyer balance');
});
await test('C4-2 serviceOrderWalletPay 20000 -> held + buyer debit', async () => {
  const r = await call('serviceOrderWalletPay', B, { orderId: 'RO-1' });
  eq(r.ok, true, JSON.stringify(r));
  eq((await db.doc('orders/RO-1').get()).data().status, 'held', 'held');
  eq((await db.doc('users/' + B).get()).data().walletBalance, 80000, 'buyer debited');
  assert((await db.doc('escrow_holds/order_RO-1').get()).exists, 'escrow hold exists');
});
await test('C4-3 escrowRelease na buyer -> seller credit + marker', async () => {
  const r = await call('escrowRelease', B, { orderId: 'RO-1' });
  eq(r.ok, true, JSON.stringify(r));
  const sb = (await db.doc('users/' + S).get()).data().walletBalance;
  assert(sb > 0 && sb <= 20000, 'seller got paid (comish?): ' + sb);
  assert((await db.doc('wallet_ledger/order_RO-1_released').get()).exists, 'release marker');
  eq((await db.doc('orders/RO-1').get()).data().status, 'completed', 'completed');
  globalThis.__sellerGot = sb;
});
await test('C4-4 seller withdrawal + admin paid -> debit + reference', async () => {
  const amt = Math.min(5000, globalThis.__sellerGot);
  const w = await call('withdrawalRequest', S, { amountTSh: amt, channel: 'mobile', account: '0712000001', requestKey: 'RECON-W1' });
  eq(w.ok, true, JSON.stringify(w));
  eq((await db.doc('users/' + S).get()).data().walletBalance, globalThis.__sellerGot - amt, 'reserved at request');
  const p = await call('withdrawalResolve', A, { requestId: w.data.requestId, decision: 'paid', note: 'M-Pesa recon' }, { admin: true });
  eq(p.ok, true, JSON.stringify(p));
  const wd = (await db.doc('withdrawal_requests/' + w.data.requestId).get()).data();
  eq(wd.status, 'paid', 'paid');
  assert(wd.ledgerKey && wd.resolvedBy && wd.resolvedAt && wd.resolutionNote, 'audit trail: ledgerKey+resolvedBy+At+note');
});
await test('C4-5 SULUHU: kila wallet == jumla ya ledger yake; hakuna negative; kila op ina ref', async () => {
  for (const u of [B, S]) {
    const bal = (await db.doc('users/' + u).get()).data().walletBalance;
    assert(bal >= 0, u + ' negative: ' + bal);
    // ledger entries zinazomhusu mtumiaji (userId/callerUid/uid)
    let sum = 0, n = 0, noRef = 0;
    const snap = await db.collection('wallet_ledger').get();
    snap.forEach((d) => {
      const e = d.data() || {};
      if (e.type === 'escrow_release_marker') return; // alama ya idempotency (kiasi tayari kimehesabiwa kwenye purchase/release)
      if (e.type === 'escrow_release_marker') return; // alama ya idempotency (kiasi kimehesabiwa kwenye purchase/release)
      const mine = e.userId === u || e.uid === u; // umiliki (userId), SI mtekelezaji (callerUid)
      if (!mine) return;
      n++;
      const amt = Number(e.amount ?? e.amountTSh ?? e.delta ?? NaN);
      if (Number.isFinite(amt)) sum += amt;
      if (!e.reference && !e.ref && !e.ledgerKey && !e.note && !e.type) noRef++;
    });
    console.log(`    ${u}: balance=${bal} ledgerEntries=${n} ledgerSum=${sum} bilaRef=${noRef}`);
    assert(n > 0, u + ' hana ledger entries!');
    eq(sum, bal, u + ' ledger sum vs balance');
    eq(noRef, 0, u + ' entries bila reference');
  }
  // escrow hold ya RO-1 imetolewa (released=true au status)
  const h = (await db.doc('escrow_holds/order_RO-1').get()).data() || {};
  assert(h.released === true || h.status === 'released', 'hold released: ' + JSON.stringify(h).slice(0, 120));
});
console.log('done');

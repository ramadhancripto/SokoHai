// _g1a.mjs (scratch) — G1.A guest probe matrix (READ-ONLY, masked, no PII).
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('/tmp/g1a', { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext(); // fresh: no storage, no auth
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8080/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.skh && window.skh.db, null, { timeout: 30000 });
await p.waitForTimeout(1500);
const R = await p.evaluate(async () => {
  const skh = window.skh;
  const rows = [];
  const T = async (col, op, fn) => {
    try {
      const v = await fn();
      rows.push({ col, op, auth: 'guest(null)', result: 'ALLOWED', detail: v });
    } catch (e) {
      rows.push({ col, op, auth: 'guest(null)', result: 'DENIED', detail: String(e.code || e.message).slice(0, 32) });
    }
  };
  const guest = {
    currentUser: skh.currentUser ? 'SET!' : null,
    projectId: skh.firebaseConfig.projectId,
    lsKeys: Object.keys(localStorage).filter((k) => k.indexOf('firebase') === 0),
    ssKeys: Object.keys(sessionStorage).length
  };
  const FAKE = 'g1probe_nonexistent_000';
  let realPid = '';
  await T('products', 'list(1)', async () => { const s = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.limit(1))); realPid = s.empty ? '' : s.docs[0].id; return 'n=' + s.size; });
  await T('products', 'get(real)', async () => 'exists=' + (await skh.getDoc(skh.doc(skh.db, 'products', realPid))).exists());
  await T('products', 'query(orderBy+limit)', async () => 'n=' + (await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.orderBy('createdAt', 'desc'), skh.limit(2)))).size);
  await T('services', 'list(1)', async () => 'n=' + (await skh.getDocs(skh.query(skh.collection(skh.db, 'services'), skh.limit(1)))).size);
  await T('drivers', 'list(1)', async () => 'n=' + (await skh.getDocs(skh.query(skh.collection(skh.db, 'drivers'), skh.limit(1)))).size);
  const targets = ['orders', 'users', 'sokopay_core_transactions', 'wallet_ledger', 'inventory_movements', 'escrow_holds', 'disputes', 'seller_order_inbox', 'sokopay_links', 'notifications', 'serious_deposits', 'payment_reviews', 'refunds'];
  for (const c of targets) {
    await T(c, 'list(1)', async () => 'n=' + (await skh.getDocs(skh.query(skh.collection(skh.db, c), skh.limit(1)))).size);
    await T(c, 'get(fake)', async () => 'exists=' + (await skh.getDoc(skh.doc(skh.db, c, FAKE))).exists());
  }
  await T('orders', 'query(where buyerId)', async () => 'n=' + (await skh.getDocs(skh.query(skh.collection(skh.db, 'orders'), skh.where('buyerId', '==', 'xxx'), skh.limit(1)))).size);
  await T('orders', 'count()', async () => 'count=' + (await skh.getCountFromServer(skh.collection(skh.db, 'orders'))).data().count);
  await T('products/{id}/bids/{fake}', 'get', async () => 'exists=' + (await skh.getDoc(skh.doc(skh.db, 'products', realPid || FAKE, 'bids', FAKE))).exists());
  await T('conversations/{fake}/messages/{fake}', 'get', async () => 'exists=' + (await skh.getDoc(skh.doc(skh.db, 'conversations', FAKE, 'messages', FAKE))).exists());
  await T('chatGroups/{fake}/messages/{fake}', 'get', async () => 'exists=' + (await skh.getDoc(skh.doc(skh.db, 'chatGroups', FAKE, 'messages', FAKE))).exists());
  return { guest, rows };
});
console.log('GUEST_PROOF=' + JSON.stringify(R.guest));
for (const r of R.rows) console.log([r.col, r.op, r.auth, r.result, r.detail].join(' | '));
writeFileSync('/tmp/g1a/probes.json', JSON.stringify(R, null, 1));
await b.close();
console.log('DONE');

// [PILOT 2026-11-14] Real browser on the emulator (no production, no real money):
//  1. full-catalogue search: an OLD listing far outside the loaded feed is found from the search bar
//     (by English synonym + brand) after the admin runs the search backfill;
//  2. checkout double tap: two taps on "confirm" create ONE order, not two;
//  3. admin overview shows the money-watch box; withdrawals show the two-person approval state and the
//     same admin cannot give the second approval.
const L = require('./lib.cjs');
const { seed, PW } = require('./review-seed.cjs');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'out', 'pilot-'); fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const VP = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const ev = (p, fn, a) => p.evaluate(fn, a);
(async () => {
  await seed();
  const uid = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const buyer = await uid('buyer.review@sokohai.test'), seller = await uid('juma.review@sokohai.test');
  const owner = await L.authUser('owner@sokohai.test', PW, 'Owner');
  await L.admin.auth().updateUser(owner, { password: PW }); // emulator account; other scenarios may have created it
  // production admins carry the admin claim (Firestore rules read withdrawal_requests with it); emulator only
  await L.admin.auth().setCustomUserClaims(owner, { admin: true });
  await L.db.doc('users/' + owner).set({ uid: owner, fullName: 'Owner Admin', email: 'owner@sokohai.test' }, { merge: true });
  // 120 newer listings push the old one far outside anything the feed loads
  const now = Date.now(); let batch = L.db.batch();
  for (let i = 0; i < 120; i++) {
    batch.set(L.db.doc('products/filler' + i), { userId: seller, sellerName: 'Juma Electronics', title: 'Kikombe cha chai #' + i + ' · demo', category: 'CAT-09', price: 3000 + i, stock: 5,
      publicationStatus: 'published', availabilityStatus: 'available', isOnline: true, location: 'Dar es Salaam', region: 'Dar es Salaam', currency: 'TZS', createdAt: new Date(now - i * 1000).toISOString() });
    if (i % 100 === 99) { await batch.commit(); batch = L.db.batch(); }
  }
  await batch.commit();
  await L.db.doc('products/oldJokofu').set({ userId: seller, sellerName: 'Juma Electronics', title: 'Jokofu Hisense lita 200 · demo', category: 'CAT-11', price: 640000, stock: 2,
    publicationStatus: 'published', availabilityStatus: 'available', isOnline: true, location: 'Dar es Salaam', region: 'Dar es Salaam', currency: 'TZS', createdAt: new Date(now - 400 * 86400e3).toISOString() });
  await L.db.doc('users/' + buyer).set({ walletBalance: 3000000 }, { merge: true });
  await L.db.doc('rateLimits/' + buyer).delete().catch(() => {});

  const B = await L.open(VP); await L.login(B.p, 'buyer.review@sokohai.test', PW);
  const O = await L.open(VP); await L.login(O.p, 'owner@sokohai.test', PW);
  for (const X of [B, O]) await ev(X.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });

  await L.step('admin runs the search backfill (paged, audited)', async () => {
    let next = null, written = 0, pages = 0;
    do { const r = await L.call(O.p, 'adminSearchBackfill', { collection: 'products', startAfter: next, pageSize: 100 }); L.assert(r.ok, JSON.stringify(r)); next = r.data.next; written += r.data.written; pages++; } while (next && pages < 10);
    const d = (await L.db.doc('products/oldJokofu').get()).data();
    L.assert(Array.isArray(d.searchTokens) && d.searchTokens.includes('fridge') && d.searchTokens.includes('hisense'), 'tokens ' + JSON.stringify(d.searchTokens));
    return written + ' indexed in ' + pages + ' pages'; });

  await L.step('buyer: the old listing is NOT in the feed until searched; "fridge hisense" in the search bar finds it', async () => {
    await B.p.waitForTimeout(2500);
    L.assert(!(await ev(B.p, () => /Jokofu Hisense/.test(document.body.innerText))), 'old listing already visible without search');
    await B.p.fill('#searchInput', 'fridge hisense');
    await B.p.waitForFunction(() => /Jokofu Hisense/.test(document.body.innerText), null, { timeout: 20000 });
    await B.p.screenshot({ path: OUT + (process.env.VP || 'phone') + '-search.png' });
    const fillerShown = await ev(B.p, () => /Kikombe cha chai #/.test((document.getElementById('feedGrid') || document.body).innerText));
    return 'found; unrelated fillers still shown: ' + fillerShown; });

  await L.step('checkout: two quick taps on confirm create ONE order', async () => {
    await ev(B.p, () => { const i = document.getElementById('searchInput'); if (i) i.value = ''; window.skh.searchQuery = ''; try { localStorage.removeItem('sokohai_smart_cart'); } catch (e) {} window.skh.myCart = []; });
    await ev(B.p, (id) => window.openProduct(id, 'products'), 'tv55a');
    await B.p.waitForFunction(() => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === 'tv55a', null, { timeout: 20000 });
    await ev(B.p, () => window.addToCart(false)); await B.p.waitForTimeout(1200);
    await ev(B.p, () => window.openCart()); await B.p.waitForTimeout(1000);
    await ev(B.p, () => window.skhDeliverySetRequired(false)); await B.p.waitForTimeout(500);
    await ev(B.p, () => { window.confirmSmartCartOrder(); window.confirmSmartCartOrder(); });
    await B.p.waitForSelector('#checkoutModal #btnPayWallet', { state: 'visible', timeout: 20000 });
    await B.p.waitForTimeout(3000);
    const o = (await L.db.collection('orders').where('buyerId', '==', buyer).get()).docs.filter(d => d.data().sellerId === seller);
    L.assert(o.length === 1, 'orders created: ' + o.length);
    return '1 order'; });

  let wid;
  await L.step('admin overview shows the money-watch box', async () => {
    await ev(O.p, () => window.skhOpenAdminControlCenter());
    await O.p.waitForFunction(() => /Ulinzi wa pesa/.test((document.getElementById('skhAdminCC') || {}).textContent || ''), null, { timeout: 20000 });
    const keys = await ev(O.p, () => Array.from(document.querySelectorAll('[data-watch]')).map(e => e.getAttribute('data-watch')));
    L.assert(['pesapal_open', 'withdrawals_second', 'withdrawals_old', 'payment_reviews', 'disputes_old'].every(k => keys.includes(k)), keys.join(','));
    await O.p.screenshot({ path: OUT + (process.env.VP || 'phone') + '-moneywatch.png' }); return keys.length + ' checks'; });

  await L.step('withdrawal >= threshold: first admin approval is recorded, the same admin cannot approve again', async () => {
    await L.db.doc('system/config').set({ withdrawals: { dualApprovalMin: 50000 } }, { merge: true });
    const r = await L.call(B.p, 'withdrawalRequest', { amountTSh: 80000, channel: 'mobile', account: '0712345678', requestKey: 'pilot' + Date.now() });
    L.assert(r.ok, JSON.stringify(r)); wid = r.data.requestId;
    await ev(O.p, () => { window.skhConfirm = async () => true; window.skhPrompt = async (q) => /SABABU/.test(q) ? 'nimeandaa malipo' : 'MPTEST123'; window.__toasts = []; const t0 = window.skhToast; window.skhToast = function (m) { window.__toasts.push(String(m)); return t0 && t0.apply(this, arguments); }; });
    await ev(O.p, (id) => window.skhAdminCCWithdrawal(id, 'paid'), wid);
    await O.p.waitForFunction(() => /Idhini ya kwanza/.test((document.getElementById('skhAdminCC') || {}).textContent || ''), null, { timeout: 20000 }).catch(async (e) => { throw new Error(e.message + ' toasts=' + JSON.stringify(await ev(O.p, () => window.__toasts))); });
    const d = (await L.db.doc('withdrawal_requests/' + wid).get()).data();
    L.assert(d.status === 'pending' && d.awaitingSecondApproval && d.firstApprovedBy === owner && d.firstExternalRef === 'MPTEST123', JSON.stringify(d));
    await O.p.screenshot({ path: OUT + (process.env.VP || 'phone') + '-withdrawal.png' });
    const again = await L.call(O.p, 'withdrawalResolve', { requestId: wid, decision: 'paid', note: 'mimi tena' });
    L.assert(!again.ok && /MWINGINE/.test(again.message), JSON.stringify(again));
    L.assert((await L.db.doc('withdrawal_requests/' + wid).get()).data().status === 'pending', 'closed by one admin');
    await L.db.doc('system/config').set({ withdrawals: { dualApprovalMin: null } }, { merge: true });
    return 'pending, awaiting a second admin'; });

  await L.step('an uncaught browser error reaches client_errors (scrubbed, path only) and is capped per page', async () => {
    const X = await L.open(VP);
    await X.ctx.addInitScript(() => { let v; Object.defineProperty(window, 'SOKOHAI_CONFIG', { configurable: true, get: () => v, set: (x) => { v = Object.assign({}, x, { ERROR_REPORTING: true }); } }); });
    await X.p.reload({ waitUntil: 'domcontentloaded' });
    await X.p.waitForFunction(() => window.skh && window.skh.auth && typeof window.skhReportClientError === 'function', null, { timeout: 30000 });
    const before = (await L.db.collection('client_errors').get()).size;
    await ev(X.p, () => { for (let i = 0; i < 8; i++) setTimeout(() => { throw new Error('pilot e2e boom ' + i + ' token=abc123 juma@test.tz'); }, 10 * i); });
    await X.p.waitForTimeout(5000);
    const docs = (await L.db.collection('client_errors').get()).docs.map(d => d.data()).filter(d => /pilot e2e boom/.test(d.message));
    await X.b.close();
    L.assert(docs.length === 5, 'reports ' + docs.length + ' (before ' + before + ')');
    L.assert(docs.every(d => !/abc123|juma@/.test(d.message) && d.page === '/'), JSON.stringify(docs[0]));
    return '5 of 8 reported, secrets removed'; });

  const errs = [...L.realErrs(B.log), ...L.realErrs(O.log)]; console.log('JS errors:', errs.length, errs.slice(0, 5).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await B.b.close(); await O.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

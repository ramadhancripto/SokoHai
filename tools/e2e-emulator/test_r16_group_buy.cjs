// [R16] Group Buy — real browsers on the emulator, default (safe) policy "pay after target".
// Two buyers join from the product page, one leaves and rejoins, nobody can pay the group price before
// the target, the owner sees the campaign in the Admin Control Center and refreshes it -> payment window,
// a member pays the group price from the SokoPay wallet (escrow held), the admin cancels a second campaign
// with a reason (audited). No real money: escrow_commit stays disabled (owner decision).
const L = require('./lib.cjs');
const { seed, PW } = require('./review-seed.cjs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'r16-gb-');
const ev = (p, fn, a) => p.evaluate(fn, a);
(async () => {
  await seed();
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const uid = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const seller = await uid('juma.review@sokohai.test'), b1 = await uid('buyer.review@sokohai.test'), b2 = await uid('neema.review@sokohai.test');
  let owner; try { owner = await uid('owner@sokohai.test'); } catch (e) { owner = await L.authUser('owner@sokohai.test', PW, 'Owner'); }
  const T = Date.now().toString(36), GB = 'r16gb_' + T, GC = 'r16gc_' + T;
  await L.db.doc('system/config').set({ groupBuy: L.admin.firestore.FieldValue.delete(), modes: { group_buy: true } }, { merge: true });
  const camp = (id, title) => L.db.doc('products/' + id).set({ title, price: 60000, stock: 20, userId: seller, ownerName: 'Juma Electronics', saleMode: 'group_buy', status: 'active', category: 'Elektroniki',
    image: L.BASE + '/assets/img/categories/elektroniki.webp', createdAt: new Date().toISOString(),
    modeData: { mode: 'group_buy', targetPeople: 4, discountValue: 6000, discountType: 'amount', joinedUsers: 1, participants: [], endTime: Date.now() + 24 * 3600e3 } });
  await camp(GB, 'Spika Group Buy R16'); await camp(GC, 'Kampeni ya kughairiwa R16');
  await L.db.doc('users/' + b1).set({ walletBalance: 200000 }, { merge: true });
  const B1 = await L.open(vp); await L.login(B1.p, 'buyer.review@sokohai.test', PW);
  const B2 = await L.open(vp); await L.login(B2.p, 'neema.review@sokohai.test', PW);
  const O = await L.open(vp); await L.login(O.p, 'owner@sokohai.test', PW);
  for (const X of [B1, B2, O]) await ev(X.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  const openGB = async (P, id) => {
    await ev(P.p, (i) => window.openProduct(i, 'products'), id || GB);
    await P.p.waitForFunction((i) => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === i, id || GB, { timeout: 20000 });
    await P.p.waitForTimeout(800); await P.p.waitForSelector('[data-mode-panel="group_buy"]', { timeout: 20000 }); };
  const state = (P) => ev(P.p, () => { const el = document.querySelector('[data-mode-panel="group_buy"]'); const j = el && el.querySelector('[data-gb-state]'); return { st: el && el.getAttribute('data-gb-status'), me: j && j.getAttribute('data-gb-state'), text: el ? el.innerText : '' }; });

  await L.step('buyer 1 joins from the product page (no payment asked before the target)', async () => {
    await openGB(B1); await B1.p.screenshot({ path: OUT + 'active.png' });
    await B1.p.click('[data-mode-panel="group_buy"] button:has-text("JIUNGE")'); await B1.p.waitForTimeout(2500); await openGB(B1);
    const s = await state(B1); L.assert(s.me === 'joined', JSON.stringify(s));
    L.assert((await L.db.doc('products/' + GB).get()).data().modeData.participants.includes(b1), 'not a participant');
    L.assert((await L.db.doc('users/' + b1).get()).data().walletBalance === 200000, 'charged while joining'); return 'joined, TSh 0 charged'; });

  await L.step('member cannot pay the group price before the target (server refuses, no debit)', async () => {
    const r = await L.call(B1.p, 'orderWalletPay', { orderIds: [(await L.db.collection('orders').add({ buyerId: b1, sellerId: seller, productId: GB, itemId: GB, quantity: 1, amount: 54000, status: 'payment_pending', items: [{ productId: GB, id: GB, qty: 1, quantity: 1, sellerId: seller }] })).id] });
    L.assert(!r.ok && /target_not_reached/.test(r.message), JSON.stringify(r));
    L.assert((await L.db.doc('users/' + b1).get()).data().walletBalance === 200000, 'debited'); });

  await L.step('buyer 2 joins, leaves (button) and rejoins; a third member joins -> target 4/4 reached', async () => {
    await openGB(B2); await B2.p.click('[data-mode-panel="group_buy"] button:has-text("JIUNGE")'); await B2.p.waitForTimeout(2500); await openGB(B2);
    await B2.p.click('[data-mode-panel="group_buy"] button:has-text("Toka")'); await L.answer(B2.p, null, 15000); await B2.p.waitForTimeout(2500);
    L.assert(!(await L.db.doc('products/' + GB).get()).data().modeData.participants.includes(b2), 'leave');
    await openGB(B2); await B2.p.click('[data-mode-panel="group_buy"] button:has-text("JIUNGE")'); await B2.p.waitForTimeout(2500);
    L.assert((await L.call(O.p, 'groupBuyJoin', { productId: GB })).ok, 'third member');
    const md = (await L.db.doc('products/' + GB).get()).data().modeData; L.assert(md.joinedUsers === 4, 'joined ' + md.joinedUsers); return '4/4'; });

  await L.step('owner opens Admin Control Center -> Group Buy tab (safe policy shown), refreshes the campaign -> payment window', async () => {
    await ev(O.p, () => window.skhOpenAdminControlCenter('groupbuy'));
    await O.p.waitForSelector('[data-gb-mode="pay_after_target"]', { timeout: 20000 });
    await O.p.screenshot({ path: OUT + 'admin.png' });
    await O.p.click(`button[onclick*="skhAdminGbSettle('${GB}')"]`); await O.p.waitForTimeout(3000);
    const md = (await L.db.doc('products/' + GB).get()).data().modeData;
    L.assert(md.groupStatus === 'successful' && md.paymentDeadline > Date.now(), JSON.stringify({ s: md.groupStatus, d: md.paymentDeadline })); });

  await L.step('member sees "LIPIA KWA BEI YA KIKUNDI" and pays from the SokoPay wallet -> escrow held at the group price', async () => {
    await openGB(B1); const s = await state(B1); L.assert(s.st === 'successful' && s.me === 'pay', JSON.stringify(s));
    await B1.p.screenshot({ path: OUT + 'pay.png' });
    await B1.p.click('[data-mode-panel="group_buy"] button:has-text("LIPIA")');
    await B1.p.waitForSelector('#checkoutModal #btnPayWallet', { state: 'visible', timeout: 15000 });
    await B1.p.click('#btnPayWallet'); await L.answer(B1.p, null, 15000); await B1.p.waitForTimeout(4000);
    const o = (await L.db.collection('orders').where('buyerId', '==', b1).where('productId', '==', GB).where('status', '==', 'held').get());
    L.assert(o.size === 1, 'held orders ' + o.size); const od = o.docs[0].data();
    L.assert(od.amount === 42000, 'group price 60000 - 3*6000 = 42000, got ' + od.amount);
    L.assert((await L.db.doc('users/' + b1).get()).data().walletBalance === 158000, 'wallet'); return 'held TSh ' + od.amount; });

  await L.step('admin cancels another campaign with a reason (audited); members see it cancelled', async () => {
    await L.call(B1.p, 'groupBuyJoin', { productId: GC });
    await ev(O.p, () => window.skhAdminCCTab('groupbuy')); await O.p.waitForSelector(`button[onclick*="skhAdminGbCancel('${GC}')"]`, { timeout: 15000 });
    await O.p.click(`button[onclick*="skhAdminGbCancel('${GC}')"]`); await L.answer(O.p, 'Msambazaji amesitisha bidhaa hii', 15000); await O.p.waitForTimeout(3000);
    L.assert((await L.db.doc('products/' + GC).get()).data().modeData.groupStatus === 'cancelled', 'cancelled');
    L.assert(!(await L.db.collection('admin_audit_log').where('action', '==', 'group_buy_cancel').get()).empty, 'audit');
    await openGB(B1, GC); const s = await state(B1); L.assert(s.st === 'cancelled', JSON.stringify(s)); });

  const errs = [...L.realErrs(B1.log), ...L.realErrs(B2.log), ...L.realErrs(O.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); for (const X of [B1, B2, O]) await X.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

// [R16] Buyer -> seller -> order -> SokoPay wallet payment -> escrow -> shipped -> hand-over code ->
// confirmation -> seller paid -> verified product review. Two real browsers on the emulator; the cart,
// checkout modal, Escrow Centre and review form are driven through their own buttons.
const L = require('./lib.cjs');
const { seed, PW } = require('./review-seed.cjs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'r16-ord-');
const ev = (p, fn, a) => p.evaluate(fn, a);
(async () => {
  await seed();
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const uid = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const buyer = await uid('buyer.review@sokohai.test'), seller = await uid('juma.review@sokohai.test');
  const PID = 'tv55a';
  const prod = (await L.db.doc('products/' + PID).get()).data();
  L.assert(prod && prod.userId === seller && Number(prod.price) > 0, 'seeded product missing');
  await L.db.doc('users/' + buyer).set({ walletBalance: Number(prod.price) * 3 }, { merge: true });
  await L.db.doc('users/' + seller).set({ walletBalance: 0 }, { merge: true });
  await L.db.doc('rateLimits/' + buyer).delete().catch(() => {});
  const B = await L.open(vp); await L.login(B.p, 'buyer.review@sokohai.test', PW);
  const S = await L.open(vp); await L.login(S.p, 'juma.review@sokohai.test', PW);
  for (const X of [B, S]) await ev(X.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  let orderId, startBal = Number(prod.price) * 3;

  await L.step('buyer opens the product and adds it to the SokoCart', async () => {
    await ev(B.p, () => { try { localStorage.removeItem('sokohai_smart_cart'); } catch (e) {} window.skh.myCart = []; });
    await ev(B.p, (id) => window.openProduct(id, 'products'), PID);
    await B.p.waitForFunction((id) => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === id, PID, { timeout: 20000 });
    await ev(B.p, () => window.addToCart(false)); await B.p.waitForTimeout(1200);
    L.assert(await ev(B.p, () => window.skh.smartCartItems().length) === 1, 'cart'); });

  await L.step('cart: "self collection" chosen, order prepared, checkout shows the SokoPay wallet option', async () => {
    await ev(B.p, () => window.openCart()); await B.p.waitForTimeout(1200);
    await ev(B.p, () => window.skhDeliverySetRequired(false)); await B.p.waitForTimeout(500);
    await B.p.screenshot({ path: OUT + 'cart.png' });
    await ev(B.p, () => window.confirmSmartCartOrder());
    await B.p.waitForSelector('#checkoutModal #btnPayWallet', { state: 'visible', timeout: 20000 });
    await B.p.waitForFunction(() => /Salio/.test((document.getElementById('walletPayBal') || {}).textContent || ''), null, { timeout: 10000 });
    await B.p.screenshot({ path: OUT + 'checkout.png' });
    const o = (await L.db.collection('orders').where('buyerId', '==', buyer).where('status', '==', 'payment_pending').get()).docs.filter(d => d.data().sellerId === seller);
    L.assert(o.length >= 1, 'no pending order'); orderId = o.sort((a, b) => String(b.data().createdAt || '').localeCompare(String(a.data().createdAt || '')))[0].id;
    return 'order ' + orderId; });

  await L.step('buyer pays with the wallet button -> server verifies price and holds escrow', async () => {
    await B.p.click('#btnPayWallet'); await L.answer(B.p, null, 15000); await B.p.waitForTimeout(4000);
    const o = (await L.db.doc('orders/' + orderId).get()).data();
    L.assert(o.status === 'held' && o.paymentVerified === true && o.paymentVerifiedBy === 'wallet', o.status + '/' + o.paymentVerifiedBy);
    const bal = (await L.db.doc('users/' + buyer).get()).data().walletBalance;
    L.assert(bal === startBal - Number(o.amount), 'wallet ' + bal + ' amount ' + o.amount);
    return 'held, TSh ' + o.amount + ' debited once'; });

  await L.step('seller sees the paid order in the Escrow Centre and marks it shipped', async () => {
    await ev(S.p, () => window.skhOpenEscrowCenter());
    await S.p.waitForSelector(`.skh-esc-card[data-order="${orderId}"] button:has-text("Nimesafirisha")`, { timeout: 15000 });
    await S.p.screenshot({ path: OUT + 'seller.png' });
    await S.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Nimesafirisha")`); await L.answer(S.p, null, 15000); await S.p.waitForTimeout(2000);
    L.assert((await L.db.doc('orders/' + orderId).get()).data().status === 'shipped', 'shipped'); });

  await L.step('buyer reveals the hand-over code (button); seller confirms with it', async () => {
    await ev(B.p, () => window.skhOpenEscrowCenter());
    const n = B.log.alerts.length;
    await B.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Namba ya Kupokea")`); await B.p.waitForTimeout(2500);
    const code = ((B.log.alerts.slice(n).join(' ').match(/DL-[A-Z0-9]+/) || [])[0]);
    L.assert(code, 'code not shown: ' + B.log.alerts.slice(n).join('|').slice(0, 120));
    await ev(S.p, () => window.skhOpenEscrowCenter());
    await S.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Thibitisha")`); await L.answer(S.p, code, 15000); await S.p.waitForTimeout(2500);
    L.assert((await L.db.doc('orders/' + orderId).get()).data().status === 'delivered', 'delivered'); });

  await L.step('buyer confirms receipt -> seller paid exactly once', async () => {
    await ev(B.p, () => window.skhOpenEscrowCenter());
    await B.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Nimepokea")`); await L.answer(B.p, null, 15000); await B.p.waitForTimeout(3000);
    L.assert((await L.db.doc('orders/' + orderId).get()).data().status === 'completed', 'completed');
    const sb = (await L.db.doc('users/' + seller).get()).data().walletBalance; L.assert(sb > 0, 'seller ' + sb);
    await L.call(B.p, 'escrowRelease', { orderId });
    L.assert((await L.db.doc('users/' + seller).get()).data().walletBalance === sb, 'paid twice'); return 'seller wallet ' + sb; });

  await L.step('buyer reviews the product; server marks it verified purchase', async () => {
    await ev(B.p, () => window.skhOpenEscrowCenter());
    await B.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Tathmini")`);
    await B.p.waitForSelector('#ratingModal label[for="star4"]', { state: 'visible', timeout: 10000 });
    await B.p.click('#ratingModal label[for="star4"]'); await B.p.fill('#ratingComment', 'TV nzuri, imefika salama.');
    await B.p.click('#btnSubmitRating'); await B.p.waitForTimeout(3500);
    const c = ((await L.db.doc('products/' + PID).get()).data().comments || []).filter(x => x.authorId === buyer).pop();
    L.assert(c && c.rating === 4, 'review ' + JSON.stringify(c));
    const od = (await L.db.doc('orders/' + orderId).get()).data(); // the badge shows the order number (orders.orderId) when it has one
    L.assert(c.verifiedPurchase && [orderId, od.orderId].includes(c.verifiedPurchase.orderId), 'not verified ' + JSON.stringify(c.verifiedPurchase));
    return 'verified: ' + c.verifiedPurchase.orderId; });

  const errs = [...L.realErrs(B.log), ...L.realErrs(S.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await B.b.close(); await S.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

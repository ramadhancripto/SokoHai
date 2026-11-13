// [R16] Services marketplace — full two-browser journey on the emulator (no real money; SokoPay wallet).
// Provider registers a service through the real Huduma Hub form -> customer finds it in Huduma and opens
// it -> sends a request (real modal) -> provider rejects one request and accepts another in the Hub ->
// customer pays from the wallet in the Escrow Centre (server holds escrow) -> provider marks the job done
// -> customer gives the delivery code, provider confirms it -> customer releases payment -> provider paid
// once -> customer writes a review that the server marks "verified purchase".
const L = require('./lib.cjs');
const { seed, PW } = require('./review-seed.cjs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'r16-svc-');
const ev = (p, fn, a) => p.evaluate(fn, a);
async function confirmYes(P) { await L.answer(P.p, null, 15000); }
(async () => {
  await seed();
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const prov = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  const cust = (await L.admin.auth().getUserByEmail('buyer.review@sokohai.test')).uid;
  for (const c of ['services', 'requests']) { const s = await L.db.collection(c).where(c === 'services' ? 'userId' : 'receiverId', '==', prov).get(); await Promise.all(s.docs.map(d => d.ref.delete())); }
  const old = await L.db.collection('orders').where('sellerId', '==', prov).get(); await Promise.all(old.docs.filter(d => d.data().collectionName === 'services').map(d => d.ref.delete()));
  await L.db.doc('users/' + cust).set({ walletBalance: 100000 }, { merge: true });
  await L.db.doc('users/' + prov).set({ walletBalance: 0, isProvider: true }, { merge: true });
  const P = await L.open(vp); await L.login(P.p, 'juma.review@sokohai.test', PW);
  const C = await L.open(vp); await L.login(C.p, 'buyer.review@sokohai.test', PW);
  for (const X of [P, C]) await ev(X.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  let svcId, orderId, title = 'Fundi Bomba R16 ' + Date.now().toString(36);

  await L.step('provider registers a service with the real Huduma Hub form', async () => {
    await ev(P.p, () => window.showForm('serviceForm')); await P.p.waitForTimeout(700);
    await P.p.selectOption('#servGroupType', 'physical'); await P.p.waitForTimeout(400);
    const cat = await ev(P.p, () => { const o = [...document.getElementById('servHubCategory').options].find(o => o.value); return o && o.value; });
    await P.p.selectOption('#servHubCategory', cat); await P.p.waitForTimeout(400);
    const sub = await ev(P.p, () => { const o = [...document.getElementById('servHubSubCategory').options].find(o => o.value); return o && o.value; });
    await P.p.selectOption('#servHubSubCategory', sub);
    await P.p.fill('#servHubTitle', title); await P.p.fill('#servHubPrice', '45000');
    await P.p.fill('#servHubDesc', 'Kurekebisha mabomba yanayovuja, nyumbani.'); await P.p.fill('#servHubLocation', 'Dar es Salaam');
    await ev(P.p, () => window.submitSokohaiService()); await P.p.waitForTimeout(3000);
    const q = await L.db.collection('services').where('userId', '==', prov).get();
    L.assert(q.size === 1, 'services=' + q.size); svcId = q.docs[0].id; return svcId; });

  await L.step('customer finds the service in Huduma and opens its page', async () => {
    await ev(C.p, () => window.updateApp && window.updateApp('services')); await C.p.waitForTimeout(3500);
    const listed = await ev(C.p, (t) => document.body.innerText.indexOf(t) !== -1, title);
    await ev(C.p, (id) => window.openProduct(id, 'services'), svcId);
    await C.p.waitForFunction((id) => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === id, svcId, { timeout: 20000 });
    await C.p.screenshot({ path: OUT + 'service-page.png' });
    return 'listed in Huduma view=' + listed; });

  await L.step('customer sends two requests through the request form', async () => {
    for (const [d1, d2] of [['Bomba la jikoni linavuja', '45000'], ['Ombi la pili (litakataliwa)', '30000']]) {
      await ev(C.p, () => window.openActionModal('service'));
      await C.p.waitForSelector('#actionRequestModal #armInput1', { state: 'visible', timeout: 10000 });
      await C.p.fill('#armInput1', d1); await C.p.fill('#armInput2', d2);
      await C.p.click('#btnSubmitArm'); await C.p.waitForTimeout(1800);
    }
    const r = await L.db.collection('requests').where('receiverId', '==', prov).where('status', '==', 'pending').get();
    L.assert(r.size === 2, 'pending requests ' + r.size); return '2 pending'; });

  await L.step('provider sees both in the Hub, rejects one (confirm dialog) and accepts the other', async () => {
    await ev(P.p, () => window.switchMode('provider')); await P.p.waitForSelector('#providerWorkspace', { state: 'visible', timeout: 15000 });
    await ev(P.p, () => window.switchProviderDashTab('requests'));
    await P.p.waitForFunction(() => document.querySelectorAll('#hubDetailedNewReqArea [onclick*="acceptHubServiceRequest"]').length === 2, null, { timeout: 20000 });
    await P.p.screenshot({ path: OUT + 'hub-requests.png' });
    const rej = (await L.db.collection('requests').where('receiverId', '==', prov).get()).docs.find(d => /pili/.test(d.data().detail1)).id;
    await P.p.click(`#hubDetailedNewReqArea [onclick*="rejectHubServiceRequest('${rej}')"]`); await confirmYes(P); await P.p.waitForTimeout(1500);
    L.assert((await L.db.doc('requests/' + rej).get()).data().status === 'rejected', 'rejected');
    await P.p.waitForSelector('#hubDetailedNewReqArea [onclick*="acceptHubServiceRequest"]', { timeout: 15000 });
    await P.p.click('#hubDetailedNewReqArea [onclick*="acceptHubServiceRequest"]'); await confirmYes(P); await P.p.waitForTimeout(3000);
    const o = (await L.db.collection('orders').where('sellerId', '==', prov).get()).docs.filter(d => d.data().collectionName === 'services');
    L.assert(o.length === 1, 'orders ' + o.length); orderId = o[0].id; const od = o[0].data();
    L.assert(od.status === 'awaiting_payment' && od.amount === 45000 && od.serviceId === svcId, JSON.stringify({ s: od.status, a: od.amount, sid: od.serviceId }));
    return 'order ' + orderId + ' awaiting_payment, serviceId linked'; });

  await L.step('customer pays from the SokoPay wallet in the Escrow Centre -> server holds escrow', async () => {
    await ev(C.p, () => window.skhOpenEscrowCenter());
    await C.p.waitForSelector(`.skh-esc-card[data-order="${orderId}"] button`, { timeout: 15000 });
    await C.p.screenshot({ path: OUT + 'pay.png' });
    await C.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Lipa")`); await confirmYes(C); await C.p.waitForTimeout(3500);
    const od = (await L.db.doc('orders/' + orderId).get()).data();
    L.assert(od.status === 'held' && od.paymentVerified === true, od.status + '/' + od.paymentVerified);
    const bal = (await L.db.doc('users/' + cust).get()).data().walletBalance; L.assert(bal === 55000, 'buyer wallet ' + bal);
    return 'held; buyer wallet 100000 -> 55000'; });

  await L.step('paying twice is refused by the server (no second debit)', async () => {
    const r = await L.call(C.p, 'serviceOrderWalletPay', { orderId, expectedAmount: 45000 });
    const bal = (await L.db.doc('users/' + cust).get()).data().walletBalance;
    L.assert(bal === 55000, 'wallet ' + bal); return r.ok ? 'already=' + (r.data && r.data.already) : r.code; });

  await L.step('provider marks the job done from "Active tasks"', async () => {
    await ev(P.p, () => window.switchProviderDashTab('active_tasks'));
    await P.p.waitForSelector(`#hubDetailedActiveArea [onclick*="completeServiceTaskPro('${orderId}'"]`, { timeout: 20000 });
    await P.p.click(`#hubDetailedActiveArea [onclick*="completeServiceTaskPro('${orderId}'"]`); await confirmYes(P); await P.p.waitForTimeout(2500);
    L.assert((await L.db.doc('orders/' + orderId).get()).data().status === 'shipped', 'shipped'); });

  await L.step('customer reveals the delivery code; provider confirms the hand-over with it (wrong code refused)', async () => {
    const code = (await L.call(C.p, 'orderDeliveryCodeIssue', { orderId })).data.code; L.assert(/^DL-/.test(code), code);
    const bad = await L.call(P.p, 'orderConfirmDelivery', { orderId, code: 'DL-WRONG000' }); L.assert(!bad.ok, 'wrong code accepted');
    await ev(P.p, () => window.skhOpenEscrowCenter());
    await P.p.waitForSelector(`.skh-esc-card[data-order="${orderId}"] button:has-text("Thibitisha")`, { timeout: 15000 });
    await P.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Thibitisha")`); await L.answer(P.p, code, 15000); await P.p.waitForTimeout(2500);
    L.assert((await L.db.doc('orders/' + orderId).get()).data().status === 'delivered', 'delivered'); });

  await L.step('customer confirms receipt -> payment released to the provider once', async () => {
    await ev(C.p, () => window.skhOpenEscrowCenter());
    await C.p.waitForSelector(`.skh-esc-card[data-order="${orderId}"] button:has-text("Nimepokea")`, { timeout: 15000 });
    await C.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Nimepokea")`); await confirmYes(C); await C.p.waitForTimeout(3000);
    const od = (await L.db.doc('orders/' + orderId).get()).data(); L.assert(od.status === 'completed', od.status);
    const pb = (await L.db.doc('users/' + prov).get()).data().walletBalance; L.assert(pb > 0 && pb <= 45000, 'provider ' + pb);
    const again = await L.call(C.p, 'escrowRelease', { orderId });
    L.assert((await L.db.doc('users/' + prov).get()).data().walletBalance === pb, 'paid twice');
    return 'provider wallet ' + pb + (again.ok ? '' : ' (repeat refused: ' + again.code + ')'); });

  await L.step('customer reviews the service from "Zilizokamilika"; server marks it verified', async () => {
    await ev(C.p, () => window.skhOpenEscrowCenter());
    await C.p.waitForSelector(`.skh-esc-card[data-order="${orderId}"] button:has-text("Tathmini")`, { timeout: 15000 });
    await C.p.click(`.skh-esc-card[data-order="${orderId}"] button:has-text("Tathmini")`);
    await C.p.waitForSelector('#ratingTargetId', { state: 'attached', timeout: 10000 });
    L.assert(await ev(C.p, () => document.getElementById('ratingTargetId').value) === svcId, 'target');
    await C.p.waitForSelector('#ratingModal label[for="star5"]', { state: 'visible', timeout: 10000 });
    await C.p.click('#ratingModal label[for="star5"]');
    await C.p.fill('#ratingComment', 'Kazi nzuri, amefika kwa wakati.');
    await C.p.screenshot({ path: OUT + 'review.png' });
    await C.p.click('#btnSubmitRating'); await C.p.waitForTimeout(3500);
    const cm = ((await L.db.doc('services/' + svcId).get()).data().comments || []).filter(c => c.authorId === cust);
    L.assert(cm.length === 1, 'reviews ' + cm.length);
    L.assert(cm[0].verifiedPurchase && cm[0].verifiedPurchase.orderId === orderId, 'not verified: ' + JSON.stringify(cm[0].verifiedPurchase));
    return 'rating ' + cm[0].rating + ', verified order ' + orderId; });

  const errs = [...L.realErrs(P.log), ...L.realErrs(C.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await P.b.close(); await C.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

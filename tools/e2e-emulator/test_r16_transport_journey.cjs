// [R16] Transport / delivery — three real browsers (buyer, seller, transport agent) on the emulator.
// Preserves the existing chain: orders -> ride_requests -> delivery_offers -> Agent Request Inbox.
// A paid order (escrow held) asks for delivery with a chosen transport post -> the server routes it and
// creates an offer -> the agent sees it in the Request Inbox and taps "Kubali" -> pickup token (PK) ->
// seller confirms hand-over with the PK (wrong code refused) -> agent confirms pickup -> starts transit ->
// buyer mints the delivery code (DL) -> agent completes with it -> escrow pays agent fare + seller, once.
// The order itself is seeded paid (the payment journey is covered by the main E2E 7-12 and money suites).
const L = require('./lib.cjs');
const { seed, PW } = require('./review-seed.cjs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'r16-trn-');
const ev = (p, fn, a) => p.evaluate(fn, a);
(async () => {
  await seed();
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const uid = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const buyer = await uid('buyer.review@sokohai.test'), seller = await uid('juma.review@sokohai.test'), agent = await uid('neema.review@sokohai.test');
  const ORDER = 'r16trn_' + Date.now().toString(36), POST = 'r16post_' + agent, AMT = 60000, FARE = 5000;
  await L.db.doc('users/' + agent).set({ isApprovedAgent: true, agentApprovedBy: 'r16-admin', agentStatus: 'approved', walletBalance: 0, displayName: 'Neema Usafiri' }, { merge: true });
  await L.db.doc('users/' + seller).set({ walletBalance: 0 }, { merge: true });
  await L.db.doc('drivers/' + POST).set({ userId: agent, driverName: 'Neema Usafiri', vehicleType: 'pikipiki', pickupRegion: 'Dar es Salaam', destinationRegion: 'Dar es Salaam', price: FARE, basePrice: FARE, online: true, status: 'active', createdAt: new Date().toISOString() });
  await L.db.doc('orders/' + ORDER).set({ buyerId: buyer, sellerId: seller, amount: AMT, status: 'held', paymentVerified: true, paymentStatus: 'paid', commerceType: 'product', productId: 'tv55a', itemTitle: 'TV 55" (R16 usafiri)', date: new Date().toISOString() });
  await L.db.doc('escrow_holds/order_' + ORDER).set({ kind: 'escrow_hold', target: 'order', targetId: ORDER, amount: AMT, payerUid: buyer, payeeUid: seller, method: 'wallet', released: false, verifiedAt: new Date().toISOString() });

  const B = await L.open(vp); await L.login(B.p, 'buyer.review@sokohai.test', PW);
  const S = await L.open(vp); await L.login(S.p, 'juma.review@sokohai.test', PW);
  const A = await L.open(vp); await L.login(A.p, 'neema.review@sokohai.test', PW);
  for (const X of [B, S, A]) await ev(X.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  let rideId, offerId, PK, DL;

  await L.step('buyer asks for delivery with the chosen transport post -> server creates ride + offer to that agent', async () => {
    const r = await ev(B.p, ([o, post, agent, fare]) => window.skhHandleOrderDelivery(o, { required: true, logisticPostId: post, logisticProviderId: agent, pickupLocation: 'Kariakoo, Dar es Salaam', destination: 'Mbezi Beach, Dar es Salaam', fare, packageDescription: 'TV 55"' }, {}), [ORDER, POST, agent, FARE]);
    L.assert(r && r.routed && r.via === 'server', JSON.stringify(r));
    rideId = r.rideId || (await L.db.doc('orders/' + ORDER).get()).data().rideRequestId;
    const offers = await L.db.collection('delivery_offers').where('rideId', '==', rideId).get();
    const mine = offers.docs.find(d => d.data().agentId === agent && d.data().status === 'offered');
    L.assert(mine, 'no offer for agent; offers=' + offers.size); offerId = mine.id;
    return 'ride ' + rideId + ', offer ' + offerId; });

  await L.step('agent sees the request in the Agent Request Inbox and accepts it (real button)', async () => {
    await ev(A.p, () => window.skhOpenRequestInbox('new'));
    await A.p.waitForSelector(`[data-ri-id="${offerId}"] .ri-btn-primary`, { state: 'visible', timeout: 20000 });
    await A.p.screenshot({ path: OUT + 'inbox.png' });
    await A.p.click(`[data-ri-id="${offerId}"] .ri-btn-primary`); await A.p.waitForTimeout(3000);
    const rd = (await L.db.doc('ride_requests/' + rideId).get()).data();
    L.assert(rd.driverId === agent && ['accepted', 'pickup_pending'].includes(rd.status), rd.status + '/' + rd.driverId);
    PK = await ev(A.p, (r) => window.skhCustodyReadToken(r, 'pickup'), rideId);
    L.assert(/^PK-/.test(String(PK)), 'agent cannot read PK: ' + PK);
    return 'status ' + rd.status + ', agent holds PK'; });

  await L.step('the buyer cannot read the pickup token (only seller + agent); seller confirms hand-over with it (wrong code refused)', async () => {
    const leak = await ev(B.p, (r) => window.skhCustodyReadToken(r, 'pickup'), rideId); L.assert(!leak, 'buyer read PK');
    const sellerSees = await ev(S.p, (r) => window.skhCustodyReadToken(r, 'pickup'), rideId); L.assert(sellerSees === PK, 'seller (sender) should hold PK');
    const bad = await ev(S.p, (r) => window.skhCustodyConfirmSellerHandover(r, 'PK-WRONG00', 'good'), rideId); L.assert(!bad.ok, 'wrong PK accepted');
    const ok = await ev(S.p, ([r, t]) => window.skhCustodyConfirmSellerHandover(r, t, 'good', 'Imefungwa vizuri'), [rideId, PK]);
    L.assert(ok.ok, JSON.stringify(ok));
    L.assert((await L.db.doc('ride_requests/' + rideId).get()).data().status === 'seller_confirmed_handover', 'handover'); });

  await L.step('agent confirms pickup and starts the trip', async () => {
    const p = await ev(A.p, ([r, t]) => window.skhCustodyConfirmTransporterPickup(r, t, 'good'), [rideId, PK]); L.assert(p.ok, JSON.stringify(p));
    const t = await ev(A.p, (r) => window.skhCustodyStartTransit(r), rideId); L.assert(t.ok, JSON.stringify(t));
    const rd = (await L.db.doc('ride_requests/' + rideId).get()).data();
    L.assert(rd.status === 'in_transit' && rd.currentCustodian === agent, rd.status); return 'in_transit, custodian = agent'; });

  await L.step('buyer sees the trip in tracking data; only the buyer can mint the delivery code', async () => {
    const seen = await ev(B.p, async (r) => { const s = await window.skh.getDoc(window.skh.doc(window.skh.db, 'ride_requests', r)); return s.exists() ? s.data().status : null; }, rideId);
    L.assert(seen === 'in_transit', 'buyer view ' + seen);
    const agentMint = await ev(A.p, (r) => window.skhCustodyMintTransferToken(r), rideId); L.assert(!agentMint.ok, 'agent minted DL');
    const m = await ev(B.p, (r) => window.skhCustodyMintTransferToken(r), rideId); L.assert(m.ok && /^DL-/.test(m.token), JSON.stringify(m));
    DL = m.token; return 'status seen by buyer: ' + seen; });

  await L.step('agent completes with the buyer\'s code -> escrow pays agent fare and seller, exactly once', async () => {
    const bad = await ev(A.p, (r) => window.skhCustodyCompleteDelivery(r, 'DL-WRONG000'), rideId); L.assert(!bad.ok, 'wrong DL accepted');
    const c = await ev(A.p, ([r, t]) => window.skhCustodyCompleteDelivery(r, t), [rideId, DL]); L.assert(c.ok, JSON.stringify(c));
    const ab = (await L.db.doc('users/' + agent).get()).data().walletBalance, sb = (await L.db.doc('users/' + seller).get()).data().walletBalance;
    L.assert(ab === FARE, 'agent ' + ab); L.assert(sb > 0 && sb <= AMT - FARE, 'seller ' + sb);
    L.assert((await L.db.doc('orders/' + ORDER).get()).data().status === 'completed', 'order');
    const again = await ev(A.p, ([r, t]) => window.skhCustodyCompleteDelivery(r, t), [rideId, DL]);
    L.assert((await L.db.doc('users/' + agent).get()).data().walletBalance === FARE, 'paid twice');
    return 'agent ' + ab + ', seller ' + sb + ', repeat=' + JSON.stringify(again).slice(0, 60); });

  await L.step('agent Token Box and buyer Escrow Centre open without errors after completion', async () => {
    if (await ev(A.p, () => typeof window.skhOpenTokenBox === 'function')) { await ev(A.p, () => window.skhOpenTokenBox('used')); await A.p.waitForTimeout(1500); await A.p.screenshot({ path: OUT + 'tokenbox.png' }); }
    await ev(B.p, () => window.skhOpenEscrowCenter()); await B.p.waitForSelector(`.skh-esc-card[data-order="${ORDER}"]`, { timeout: 15000 });
    await B.p.screenshot({ path: OUT + 'buyer-done.png' }); });

  const errs = [...L.realErrs(B.log), ...L.realErrs(S.log), ...L.realErrs(A.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); for (const X of [B, S, A]) await X.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

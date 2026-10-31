const L = require('./lib.cjs'); const { step, assert, db, admin } = L; const fs = require('fs');
const SHOT = n => L.SCR + '/e2e/shot-' + n + '.png';
const st = JSON.parse(fs.readFileSync(L.SCR + '/e2e/state.json', 'utf8')); const PW = 'Passw0rd!x';
(async () => {
  const { sellerUid, buyerUid } = st;
  const S = await L.open(); await L.login(S.p, 'seller@sokohai.test', PW); const sp = S.p;
  const B = await L.open(); await L.login(B.p, 'buyer@sokohai.test', PW); const bp = B.p;
  let code, linkId, orderId;
  await step('7 Seller creates a SokoPay escrow link (real form)', async () => {
    await sp.evaluate(() => window.openSokoPay()); await sp.waitForTimeout(1500);
    await sp.evaluate(() => window.toggleSokoPayTab && window.toggleSokoPayTab('create')).catch(() => {});
    await sp.fill('#spItemName', 'Simu E2E (SokoPay link)'); await sp.fill('#spAmount', '50000');
    await sp.evaluate(() => window.generateSokoPayCode()); await sp.waitForTimeout(3000);
    const q = await db.collection('sokopay_links').where('userId', '==', sellerUid).get();
    assert(q.size === 1, 'links=' + q.size + ' alerts=' + S.log.alerts.slice(-2).join('|'));
    linkId = q.docs[0].id; code = q.docs[0].data().code;
    await sp.screenshot({ path: SHOT('07-sokopay-link') });
    return 'code ' + code + ' status ' + q.docs[0].data().status;
  });
  await step('8 Buyer pays the link from wallet -> funds HELD in escrow (server transaction)', async () => {
    // Test money on the emulator only (stands in for a completed PesaPal deposit).
    await db.doc('users/' + buyerUid).update({ walletBalance: 80000 });
    await bp.reload(); await bp.waitForFunction(() => window.skh && window.skh.currentUserData && window.skh.currentUserData.walletBalance === 80000, null, { timeout: 20000 });
    await bp.evaluate(() => window.openSokoPay()); await bp.waitForTimeout(1200);
    await bp.evaluate(() => window.toggleSokoPayTab && window.toggleSokoPayTab('pay')).catch(() => {});
    await bp.fill('#spCodeInputPay', code); await bp.evaluate(() => window.verifyAndPreviewSokoPay()); await bp.waitForTimeout(2000);
    const pay = bp.evaluate(() => window.proceedToPaySokoPay());
    await L.answer(bp); await pay; await bp.waitForTimeout(3000);
    const o = await db.doc('orders/splink_' + linkId).get(); orderId = 'splink_' + linkId;
    const u = (await db.doc('users/' + buyerUid).get()).data();
    const h = await db.doc('escrow_holds/link_' + linkId).get();
    await bp.screenshot({ path: SHOT('08-sokopay-paid') });
    assert(o.exists && o.data().status === 'held', 'order not held: ' + (o.exists ? o.data().status : 'missing') + ' alerts=' + B.log.alerts.slice(-2).join('|'));
    assert(u.walletBalance === 30000, 'wallet not debited: ' + u.walletBalance);
    assert(h.exists, 'escrow hold missing');
    // [PHASE 9 B-16] the seller's "escrow funded" notice is written by the server
    const n = await db.doc('notifications/escrow_link_' + linkId).get();
    assert(n.exists && n.data().userId === sellerUid && n.data().system === true, 'server notice to seller missing');
    return 'order held, wallet 80000 -> 30000, escrow_holds record exists, seller notified by server';
  });
  await step('8b Buyer cannot forge an "escrow funded" notice to the seller (B-16)', async () => {
    const r = await bp.evaluate(async (uid) => { try { await window.skh.addDoc(window.skh.collection(window.skh.db, 'notifications'), { userId: uid, event: 'wallet.escrowFunded', title: ' SokoPay: Malipo ya Escrow Yamefungwa!', body: 'fake', createdAt: new Date().toISOString(), read: false }); return 'ALLOWED'; } catch (e) { return 'DENIED'; } }, sellerUid);
    assert(r === 'DENIED', 'forged money notice was accepted');
    return 'refused by rules';
  });
  let dl;
  await step('9 Seller cannot see the delivery code; buyer gets it (escrow center)', async () => {
    const bad = await L.call(sp, 'orderDeliveryCodeIssue', { orderId }); assert(!bad.ok && bad.code === 'functions/permission-denied', 'seller got code: ' + JSON.stringify(bad));
    await bp.evaluate(() => window.skhOpenEscrowCenter()); await bp.waitForTimeout(2000);
    await bp.screenshot({ path: SHOT('09-escrow-center-buyer') });
    const before = B.log.alerts.length;
    await bp.evaluate(id => window.skhOrderShowDeliveryCode(id), orderId); await bp.waitForTimeout(2000);
    const msg = B.log.alerts.slice(before).join(' '); const m = msg.match(/DL-[A-Z0-9]+/); assert(m, 'no code in alert: ' + msg.slice(0, 200));
    dl = m[0]; return 'seller denied (permission-denied); buyer code ' + dl.slice(0, 4) + '****';
  });
  await step('10 Seller confirms hand-over with the buyer code (wrong code refused)', async () => {
    let pr = sp.evaluate(id => window.skhOrderConfirmDeliveryPrompt(id), orderId); await L.answer(sp, 'DL-WRONG999'); await pr; await sp.waitForTimeout(1500);
    assert(/Kosa/.test(S.log.alerts.slice(-1)[0] || ''), 'wrong code not refused: ' + S.log.alerts.slice(-1)[0]);
    pr = sp.evaluate(id => window.skhOrderConfirmDeliveryPrompt(id), orderId); await L.answer(sp, dl); await pr; await sp.waitForTimeout(2000);
    const o = (await db.doc('orders/' + orderId).get()).data();
    assert(o.deliveryConfirmedAt || o.deliveryConfirmed || /deliver/i.test(o.status || ''), 'not confirmed: ' + JSON.stringify(o).slice(0, 300));
    return 'status ' + o.status + ', still held until buyer confirms';
  });
  await step('11 Buyer confirms receipt -> seller wallet credited, ledger written', async () => {
    const pr = bp.evaluate(id => window.skhOrderConfirmReceipt(id), orderId); await L.answer(bp); await pr; await bp.waitForTimeout(3000);
    const o = (await db.doc('orders/' + orderId).get()).data(); const s = (await db.doc('users/' + sellerUid).get()).data();
    const led = await db.collection('wallet_ledger').where('userId', '==', sellerUid).get();
    await bp.screenshot({ path: SHOT('11-released') });
    assert(/complete|released/i.test(o.status), 'order status ' + o.status + ' alerts=' + B.log.alerts.slice(-1));
    assert(s.walletBalance > 0, 'seller wallet ' + s.walletBalance);
    return 'order ' + o.status + ', seller wallet TSh ' + s.walletBalance + ' (fee deducted from 50000), ledger rows ' + led.size;
  });
  await step('12 Double release is refused (idempotent)', async () => {
    const r = await L.call(bp, 'escrowRelease', { orderId }); const s = (await db.doc('users/' + sellerUid).get()).data().walletBalance;
    const s2 = (await db.doc('users/' + sellerUid).get()).data().walletBalance;
    assert(!r.ok || (r.data && r.data.already), 'second release paid again: ' + JSON.stringify(r)); assert(s === s2, 'balance changed');
    return r.ok ? 'returned already=true' : 'refused: ' + r.code;
  });
  for (const [n, X] of [['seller', S], ['buyer', B]]) { console.log('--', n, 'alerts', X.log.alerts.map(a => a.slice(0, 90))); console.log(L.realErrs(X.log).slice(0, 6).join('\n').slice(0, 2000)); }
  await S.b.close(); await B.b.close();
  fs.writeFileSync(L.SCR + '/e2e/state.json', JSON.stringify(Object.assign(st, { orderId, linkId })));
})();

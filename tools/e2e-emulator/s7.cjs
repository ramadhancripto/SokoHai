// [2026-11-01] Mobile browser onboarding (390px) on the EMULATOR: business modes x seller lifecycle.
// Real wizard + real seller form + real rules + server callable (functions/local-server.js). No production.
const L = require('./lib.cjs');

async function signup(p, log, name, email, phone) {
  await p.evaluate(() => window.openAuthModal());
  await p.evaluate(() => window.toggleAuth('signup'));
  await p.fill('#signupName', name); await p.fill('#signupEmail', email); await p.fill('#signupPhone', phone); await p.fill('#signupPass', 'Passw0rd!x');
  await p.evaluate(() => window.doSignup());
  await p.waitForFunction(() => window.skh.currentUserData && window.skh.currentUserData.uid, null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  const u = await L.admin.auth().getUserByEmail(email);
  return u.uid;
}
async function wizard(p, { type, modeCard, shopName, address, pickup }) {
  await p.evaluate(t => window.selectSellerType(t), type);
  await p.waitForSelector('#shopSetupModal', { state: 'visible' });
  for (let guard = 0; guard < 12; guard++) {
    const step = await p.evaluate(() => window.currentSetupStep);
    if (step === 2) await p.click('#' + modeCard);
    if (step === 3) {
      await p.fill('#regShopName', shopName);
      if (address) await p.fill('#regStoreAddress', address);
      if (pickup) await p.check('#regPickupAvailable');
    }
    const label = (await p.textContent('#btnNextSetup')) || '';
    await p.click('#btnNextSetup');
    await p.waitForTimeout(400);
    if ((type === 'temporary' && step === 3) || /KAMILISHA/i.test(label)) break;
  }
  await p.waitForFunction(() => window.skh.currentUserData && window.skh.currentUserData.businessSetupComplete === true, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
}

(async () => {
  const run = async (name, fn) => { const { b, p, log } = await L.open({ width: 390, height: 844 }); try { await L.step(name, () => fn(p, log)); } finally { await p.screenshot({ path: L.SCR + '/e2e/s7-' + name.slice(0, 3).trim() + '.png' }).catch(() => {}); await b.close(); } };

  await run('25 Temporary + MANAGE_ONLY: wizard on a phone, store address reused by the seller form', async (p, log) => {
    const uid = await signup(p, log, 'Neema Stoo', 'neema@sokohai.test', '0712000025');
    await wizard(p, { type: 'temporary', modeCard: 'modeCard_manage', shopName: 'Stoo ya Neema', address: 'Tandale, Dar es Salaam', pickup: true });
    const u = (await L.db.doc('users/' + uid).get()).data() || {};
    L.assert(u.sellerType === 'temporary', 'sellerType ' + u.sellerType + ' alerts=' + log.alerts.join(' | '));
    L.assert(/manage/i.test(String(u.sellerMode || u.sellMode)), 'mode ' + u.sellerMode);
    L.assert(u.storeAddress === 'Tandale, Dar es Salaam' && u.pickupAvailable === true, 'address/pickup');
    await p.evaluate(() => window.showForm('sellerForm'));
    await p.waitForTimeout(500);
    const vis = await p.inputValue('#prodVisibility'); const loc = await p.inputValue('#prodLocation');
    const online = await p.evaluate(() => { const e = document.getElementById('sellerOnlineSection'); return !!e && e.getClientRects().length > 0; });
    L.assert(vis === 'manage_only' && loc === 'Tandale, Dar es Salaam' && !online, `form vis=${vis} loc=${loc} online=${online}`);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    L.assert(over <= 1, 'horizontal scroll ' + over);
    return `sellerType=${u.sellerType}, mode=${u.sellerMode}, form defaults manage_only + store address, no h-scroll`;
  });

  await run('26 Permanent + OFFLINE_ONLY: server promotes the SAME account, history + audit written', async (p, log) => {
    const uid = await signup(p, log, 'Baraka Duka', 'baraka@sokohai.test', '0712000026');
    await wizard(p, { type: 'permanent', modeCard: 'modeCard_offline', shopName: 'Duka la Baraka', address: 'Mwenge, Dar es Salaam' });
    const u = (await L.db.doc('users/' + uid).get()).data() || {};
    L.assert(u.sellerType === 'permanent', 'sellerType ' + u.sellerType + ' alerts=' + log.alerts.join(' | '));
    L.assert(Array.isArray(u.sellerStatusHistory) && u.sellerStatusHistory.length === 1, 'history');
    const logRows = await L.db.collection('seller_lifecycle_log').where('uid', '==', uid).get();
    L.assert(logRows.size === 1, 'audit rows ' + logRows.size);
    await p.evaluate(() => window.showForm('sellerForm')); await p.waitForTimeout(500);
    L.assert(await p.inputValue('#prodVisibility') === 'offline_only', 'form default offline_only');
    // Decimal weighing end to end: a kg product with 12.5 kg opening stock, no photo (shop-only), real rules + server.
    await p.evaluate(() => { const e = document.getElementById('prodBaseUnit'); e.value = 'Kg'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.fill('#prodName', 'Mchele wa Kyela'); await p.fill('#prodPrice', '3200'); await p.fill('#prodStock', '12.5');
    await p.evaluate(() => window.submitSeller({ preventDefault() {} }));
    let prod = null;
    for (let i = 0; i < 20 && !(prod && prod.stock === 12.5); i++) { await p.waitForTimeout(500); const q = await L.db.collection('products').where('userId', '==', uid).get(); prod = q.empty ? null : q.docs[0].data(); }
    L.assert(prod && prod.quantityPrecision === 3 && prod.stock === 12.5 && prod.isOnline === false, 'kg product ' + JSON.stringify(prod && { s: prod.stock, q: prod.quantityPrecision, on: prod.isOnline }) + ' alerts=' + log.alerts.join(' | '));
    return `permanent via server, history=1, audit=1, form defaults offline_only; kg product saved with stock 12.5 (precision 3), no photo needed`;
  });

  await run('27 Temporary seller cannot self-promote from the browser; dashboard upgrade goes through the server', async (p, log) => {
    const uid = await signup(p, log, 'Asha Muda', 'asha@sokohai.test', '0712000027');
    await wizard(p, { type: 'temporary', modeCard: 'modeCard_hybrid', shopName: 'Asha Hybrid' });
    const forged = await p.evaluate(async u => { try { await window.skh.updateDoc(window.skh.doc(window.skh.db, 'users', u), { sellerType: 'permanent', productLimit: 9999 }); return 'ALLOWED'; } catch (e) { return String(e.code || e.message); } }, uid);
    L.assert(/permission/i.test(forged), 'forged write ' + forged);
    const before = (await L.db.doc('users/' + uid).get()).data();
    L.assert(before.sellerType === 'temporary', 'still temporary');
    const r = await L.call(p, 'sellerLifecycleChange', { target: 'permanent' });
    L.assert(r.ok && r.data.sellerType === 'permanent', JSON.stringify(r));
    const after = (await L.db.doc('users/' + uid).get()).data();
    L.assert(after.shopName === 'Asha Hybrid' && after.businessId === before.businessId, 'same business kept');
    return `self-promotion denied (${forged}); server upgrade ok; businessId kept`;
  });

  console.log('E2E s7 done; failed=' + L.failed);
})();

const L = require('./lib.cjs'); const { step, assert, db, admin } = L; const fs = require('fs');
const SHOT = n => L.SCR + '/e2e/shot-' + n + '.png';
const st = JSON.parse(fs.readFileSync(L.SCR + '/e2e/state.json', 'utf8'));
const PW = 'Passw0rd!x';
const call = (p, name, data) => p.evaluate(async ([n, d]) => { try { const r = await window.skh.wrapCallable(n)(d); return { ok: true, data: r && r.data }; } catch (e) { return { ok: false, code: e.code, message: e.message }; } }, [name, data]);
(async () => {
  const sellerUid = st.sellerUid, productId = st.productId;
  // ---- owner: backfill userCards (server projection) ----
  const O = await L.open({ width: 1280, height: 800 });
  await L.login(O.p, 'owner@sokohai.test', PW);
  await step('3 Super admin backfills public user cards (callable via local server)', async () => {
    const r = await call(O.p, 'adminBackfillUserCards', {}); assert(r.ok, JSON.stringify(r));
    const c = await db.doc('userCards/' + sellerUid).get(); assert(c.exists, 'seller card missing');
    const d = c.data(); assert(!('email' in d) && !('walletBalance' in d) && !('phone' in d), 'card leaks private fields: ' + Object.keys(d));
    return JSON.stringify(r.data).slice(0, 80) + ' card fields: ' + Object.keys(d).join(',');
  });
  // ---- buyer ----
  const B = await L.open(); const bp = B.p; let buyerUid;
  await step('4 Buyer sign-up (real form) and sees the product in the market feed', async () => {
    await bp.evaluate(() => { window.openAuthModal(); window.toggleAuth('signup'); });
    await bp.fill('#signupName', 'Asha Mnunuzi'); await bp.fill('#signupEmail', 'buyer@sokohai.test'); await bp.fill('#signupPhone', '0712000002'); await bp.fill('#signupPass', PW);
    await bp.evaluate(() => window.doSignup()); await bp.waitForTimeout(2500);
    buyerUid = (await admin.auth().getUserByEmail('buyer@sokohai.test')).uid;
    await bp.waitForFunction(() => window.skh.currentUserData && window.skh.currentUserData.uid, null, { timeout: 15000 });
    await bp.evaluate(() => { window.skh._feedCache && window.skh._feedCache.clear && window.skh._feedCache.clear(); return window.updateApp && window.updateApp('buyer'); }).catch(() => {});
    await bp.waitForTimeout(4000);
    const seen = await bp.evaluate(() => document.body.innerText.includes('Simu E2E Test'));
    await bp.screenshot({ path: SHOT('04-buyer-feed') });
    assert(seen, 'product not visible in feed');
    return 'feed shows the product';
  });
  await step('5 Buyer opens product page; seller identity comes from userCards (no private data)', async () => {
    await bp.evaluate(id => window.openProduct(id, 'products'), productId); await bp.waitForTimeout(3000);
    const t = await bp.evaluate(() => { const m = document.getElementById('productModal'); return m && getComputedStyle(m).display !== 'none' ? m.innerText : ''; });
    await bp.screenshot({ path: SHOT('05-product-page') });
    assert(/Simu E2E Test/.test(t), 'product modal not showing title');
    assert(!/CAT-\d+/.test(t), 'raw category id shown to buyer (B-15)');
    assert(!t.includes('seller@sokohai.test') && !t.includes('0712000001'), 'private seller data shown to buyer');
    return 'title + price shown; e-mail/phone of seller not exposed';
  });
  await step('6 Chat: buyer messages seller, seller receives it', async () => {
    await bp.evaluate(([u]) => window.openChatWithUser(u, 'Juma Muuzaji'), [sellerUid]); await bp.waitForTimeout(2500);
    await bp.fill('#chatInput', 'Habari, simu bado ipo? (E2E)'); await bp.evaluate(() => window.sendMessage()); await bp.waitForTimeout(2500);
    await bp.screenshot({ path: SHOT('06-chat-buyer') });
    const convs = await db.collection('conversations').where('participants', 'array-contains', buyerUid).get();
    assert(convs.size >= 1, 'no conversation doc; alerts=' + B.log.alerts.slice(-2).join('|'));
    const msgs = await db.collection('conversations/' + convs.docs[0].id + '/messages').get();
    const any = msgs.docs.some(m => JSON.stringify(m.data()).includes('simu bado ipo'));
    assert(any, 'message not stored (' + msgs.size + ' msgs)');
    return 'conversation ' + convs.docs[0].id.slice(0, 10) + ' with ' + msgs.size + ' message(s)';
  });
  fs.writeFileSync(L.SCR + '/e2e/state.json', JSON.stringify(Object.assign(st, { buyerUid })));
  for (const [n, S] of [['owner', O], ['buyer', B]]) { console.log('--', n, 'alerts', S.log.alerts.slice(0, 6)); console.log(L.realErrs(S.log).slice(0, 8).join('\n').slice(0, 2500)); console.log('blocked', [...S.log.hosts]); }
  await O.b.close(); await B.b.close();
})();

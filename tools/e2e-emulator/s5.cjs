const L = require('./lib.cjs'); const { step, assert, db, admin } = L; const fs = require('fs');
const SHOT = n => L.SCR + '/e2e/shot-' + n + '.png';
const st = JSON.parse(fs.readFileSync(L.SCR + '/e2e/state.json', 'utf8')); const PW = 'Passw0rd!x';
(async () => {
  const { sellerUid, buyerUid, productId, owner } = st;
  await db.doc('system/config').set({ fees: { enabled: false }, modes: {}, e2eMarker: 'cfg-1' }, { merge: true });
  const S = await L.open(); await L.login(S.p, 'seller@sokohai.test', PW); const sp = S.p;
  await step('13 System settings reach a signed-in tab (B-14 fix)', async () => {
    await sp.waitForFunction(() => window.skh.sysConfig && window.skh.sysConfig.e2eMarker === 'cfg-1', null, { timeout: 10000 });
    await db.doc('system/config').set({ e2eMarker: 'cfg-2' }, { merge: true });
    await sp.waitForFunction(() => window.skh.sysConfig.e2eMarker === 'cfg-2', null, { timeout: 10000 });
    return 'initial value and a live change both received';
  });
  await step('14 Seller registers a service (real Huduma Hub form)', async () => {
    await sp.evaluate(() => window.showForm('serviceForm')); await sp.waitForTimeout(600);
    await sp.selectOption('#servGroupType', 'physical'); await sp.waitForTimeout(400);
    const cat = await sp.evaluate(() => { const o = [...document.getElementById('servHubCategory').options].find(o => o.value); return o && o.value; });
    await sp.selectOption('#servHubCategory', cat); await sp.waitForTimeout(400);
    const sub = await sp.evaluate(() => { const o = [...document.getElementById('servHubSubCategory').options].find(o => o.value); return o && o.value; });
    await sp.selectOption('#servHubSubCategory', sub);
    await sp.fill('#servHubTitle', 'Fundi Simu E2E'); await sp.fill('#servHubPrice', '20000'); await sp.fill('#servHubDesc', 'Huduma ya majaribio (E2E).'); await sp.fill('#servHubLocation', 'Dar es Salaam');
    await sp.evaluate(() => window.submitSokohaiService()); await sp.waitForTimeout(3000);
    await sp.screenshot({ path: SHOT('14-service') });
    const q = await db.collection('services').where('userId', '==', sellerUid).get();
    assert(q.size === 1, 'services=' + q.size + ' alerts=' + S.log.alerts.slice(-2).join('|'));
    return cat + ' / ' + sub + ' saved';
  });
  await step('15 POS: seller sells 1 unit at the counter -> sale recorded, stock 4 -> 3', async () => {
    await sp.evaluate(() => window.showForm('businessOSForm')); await sp.waitForTimeout(1200);
    await sp.fill('#posSearchInput', 'Simu E2E'); await sp.waitForTimeout(2500);
    await sp.screenshot({ path: SHOT('15-pos-search') });
    await sp.evaluate(id => window.addPosCartItemById(id), productId); await sp.waitForTimeout(1500);
    const total = await sp.evaluate(() => (document.querySelector('#businessOSForm #posCartTotal') || {}).textContent || '');
    await sp.evaluate(() => { const c = document.getElementById('posCashReceived'); if (c) c.value = '150000'; });
    await sp.screenshot({ path: SHOT('15-pos-cart') });
    await sp.evaluate(() => window.submitPosSale()); await sp.waitForTimeout(4000);
    const sales = await db.collection('sales').where('sellerId', '==', sellerUid).get();
    const p = (await db.doc('products/' + productId).get()).data();
    assert(sales.size >= 1, 'no sale; alerts=' + S.log.alerts.slice(-2).join('|') + ' total=' + total);
    assert(p.stock === 3, 'stock ' + p.stock);
    return 'cart total "' + total.trim() + '", sales=' + sales.size + ', stock 3';
  });
  await step('16 Seller dashboard / analytics opens without errors', async () => {
    const before = L.realErrs(S.log).length;
    await sp.evaluate(() => window.switchMode ? window.switchMode('seller') : window.updateApp('seller')).catch(() => {}); await sp.waitForTimeout(2500);
    for (const t of ['overview', 'my_products', 'product_analytics', 'sales_insights', 'inventory']) { await sp.evaluate(t => window.switchDashTab && window.switchDashTab(t), t).catch(() => {}); await sp.waitForTimeout(900); }
    await sp.screenshot({ path: SHOT('16-seller-dashboard') });
    const errs = L.realErrs(S.log).slice(before); assert(errs.length === 0, errs.join(' || ').slice(0, 600));
    return '5 dashboard tabs rendered';
  });
  await step('17 Group orders clearly disabled for users', async () => {
    const r = await sp.evaluate(() => ({ goEnabled: typeof window.skhGroupOrdersEnabled === 'function' ? window.skhGroupOrdersEnabled() : null, txt: document.body.innerHTML.includes('Inakuja hivi karibuni') }));
    const pol = await L.call(sp, 'adminSetEscrowPolicy', { features: { chatGroupOrders: true }, reason: 'seller tries to enable group orders' });
    assert(!pol.ok, 'non-admin changed policy'); return 'policy change by seller refused (' + pol.code + ')';
  });
  // ---------- admin ----------
  const O = await L.open({ width: 1280, height: 800 }); await L.login(O.p, 'owner@sokohai.test', PW); const op = O.p;
  await step('18 Admin control center: open, find user, escrow policy rejects group orders', async () => {
    await op.evaluate(() => window.skhOpenAdminControlCenter()); await op.waitForTimeout(2500);
    await op.screenshot({ path: SHOT('18-admin-cc') });
    const who = await L.call(op, 'adminWhoAmI', {}); assert(who.ok, JSON.stringify(who));
    const g = await L.call(op, 'adminSetEscrowPolicy', { features: { chatGroupOrders: true }, reason: 'E2E check: group orders must stay off' });
    assert(!g.ok && /failed-precondition/.test(g.code), 'group orders enabled: ' + JSON.stringify(g));
    const a = await L.call(op, 'adminAuditQuery', { limit: 20 });
    return 'whoAmI ' + JSON.stringify(who.data).slice(0, 80) + '; group-orders refused; audit query ' + (a.ok ? 'ok (' + ((a.data.items || a.data.rows || []).length) + ' rows)' : a.code);
  });
  await step('19 Admin moderates the product (hide) -> audit row; then restores', async () => {
    const h = await L.call(op, 'adminModerateListing', { collection: 'products', id: productId, action: 'hide', reason: 'E2E moderation test' });
    assert(h.ok, JSON.stringify(h));
    const p = (await db.doc('products/' + productId).get()).data();
    const r = await L.call(op, 'adminModerateListing', { collection: 'products', id: productId, action: 'restore', reason: 'E2E restore' });
    const audit = await db.collection('admin_audit_log').get();
    return 'hidden=' + (p.adminHidden || p.moderationStatus) + ', restore ' + (r.ok ? 'ok' : r.code) + ', audit rows ' + audit.size;
  });
  await step('20 Ads: admin creates a Home announcement with author stamp (rules) ', async () => {
    const r = await op.evaluate(async () => { try { const ref = await window.skh.addDoc(window.skh.collection(window.skh.db, 'announcements'), Object.assign({ title: 'E2E tangazo', status: 'published', archived: false, active: true, createdAt: new Date().toISOString() }, window.skhAdminStamp())); return { ok: true, id: ref.id }; } catch (e) { return { ok: false, m: e.message }; } });
    assert(r.ok, r.m);
    const nostamp = await op.evaluate(async () => { try { await window.skh.addDoc(window.skh.collection(window.skh.db, 'announcements'), { title: 'x', status: 'draft' }); return 'ALLOWED'; } catch (e) { return 'DENIED'; } });
    assert(nostamp === 'DENIED', 'unstamped admin write allowed');
    const s = await L.call(sp, 'adsRequestDelivery', { placement: 'home', limit: 3 });
    return 'stamped create ok, unstamped denied; adsRequestDelivery ' + (s.ok ? 'ok' : s.code);
  });
  await step('21 Creative studio opens (ads designer)', async () => {
    const before = L.realErrs(O.log).length;
    await op.evaluate(() => window.openSokoHaiCreativeStudio && window.openSokoHaiCreativeStudio()); await op.waitForTimeout(2500);
    await op.screenshot({ path: SHOT('21-creative-studio') });
    const errs = L.realErrs(O.log).slice(before); assert(errs.length === 0, errs.join(' || ').slice(0, 600));
    return 'opened without page errors';
  });
  await step('22 Platform analytics refresh (super admin)', async () => {
    const r = await L.call(op, 'platformStatsRefresh', {}); assert(r.ok, JSON.stringify(r));
    return JSON.stringify(r.data).slice(0, 140);
  });
  for (const [n, X] of [['seller', S], ['owner', O]]) { console.log('--', n, 'alerts', X.log.alerts.map(a => a.slice(0, 100))); console.log(L.realErrs(X.log).slice(0, 8).join('\n').slice(0, 2500)); }
  await S.b.close(); await O.b.close();
})();

const L = require('./lib.cjs'); const { step, assert } = L; const fs = require('fs');
const st = JSON.parse(fs.readFileSync(L.SCR + '/e2e/state.json', 'utf8')); const PW = 'Passw0rd!x';
const VIEWS = [['mobile', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }], ['desktop', { width: 1366, height: 800 }]];
const close = p => p.evaluate(() => { window.closeModals && window.closeModals(); document.querySelectorAll('.skd-ov').forEach(e => e.remove()); });
// [PHASE 9] screens per role: buyer, seller and admin modules
const ROLES = {
  buyer: { email: 'buyer@sokohai.test', pages: [
    ['home', async p => { await close(p); await p.evaluate(() => window.updateApp && window.updateApp('buyer')); }],
    ['products', async p => { await close(p); await p.evaluate(() => { const b = [...document.querySelectorAll('.bottom-nav *, nav *')].find(e => /Bidhaa/.test(e.textContent || '') && e.onclick); b && b.click(); }); }],
    ['services', async p => { await close(p); await p.evaluate(() => window.updateApp && window.updateApp('services')); }],
    ['product', async p => { await close(p); await p.evaluate(id => window.openProduct(id, 'products'), st.productId); }],
    ['chat-list', async p => { await close(p); await p.evaluate(() => window.openChatList()); }],
    ['chat-thread', async p => { await close(p); await p.evaluate(u => window.openChatWithUser(u, 'Juma Muuzaji'), st.sellerUid); }],
    ['sokopay', async p => { await close(p); await p.evaluate(() => window.openSokoPay()); }],
    ['cart', async p => { await close(p); await p.evaluate(() => window.openCart()); }],
    ['escrow-center', async p => { await close(p); await p.evaluate(() => window.skhOpenEscrowCenter()); }],
    ['notifications', async p => { await close(p); await p.evaluate(() => window.openNotifications()); }],
    ['profile', async p => { await close(p); await p.evaluate(() => window.openProfile && window.openProfile()); }],
  ] },
  seller: { email: 'seller@sokohai.test', pages: [
    ['sell-form', async p => { await close(p); await p.evaluate(() => window.showForm('sellerForm')); }],
    ['service-form', async p => { await close(p); await p.evaluate(() => window.showForm('serviceForm')); }],
    ['pos', async p => { await close(p); await p.evaluate(() => window.showForm('businessOSForm')); }],
    ['seller-dashboard', async p => { await close(p); await p.evaluate(() => window.switchMode && window.switchMode('seller')); }],
    ['sokopay-create', async p => { await close(p); await p.evaluate(() => { window.openSokoPay(); window.toggleSokoPayTab && window.toggleSokoPayTab('create'); }); }],
  ] },
  admin: { email: 'owner@sokohai.test', pages: [
    ['admin-control-center', async p => { await close(p); await p.evaluate(() => window.skhOpenAdminControlCenter()); }],
    ['admin-dashboard', async p => { await close(p); await p.evaluate(() => window.loadAdminDashboard && window.loadAdminDashboard()); }],
    ['creative-studio', async p => { await close(p); await p.evaluate(() => window.openSokoHaiCreativeStudio && window.openSokoHaiCreativeStudio()); }],
  ] }
};
async function sweep(role, vn, vp) {
  const R = ROLES[role]; const B = await L.open(vp); await L.login(B.p, R.email, PW); const issues = [];
  for (const [pn, go] of R.pages) {
    const before = L.realErrs(B.log).length;
    try { await go(B.p); } catch (e) { issues.push(pn + ': open failed ' + e.message.slice(0, 80)); continue; }
    await B.p.waitForTimeout(1400);
    const m = await B.p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      wide: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.right > window.innerWidth + 2 && cs.position !== 'fixed' && cs.visibility !== 'hidden' && e.offsetParent !== null; }).slice(0, 3).map(e => (e.id || e.className || e.tagName).toString().slice(0, 40)) }));
    if (m.sw > m.iw + 1) issues.push(`${pn}: horizontal scroll ${m.sw}>${m.iw} [${m.wide.join(', ')}]`);
    const errs = L.realErrs(B.log).slice(before); if (errs.length) issues.push(pn + ': ' + errs[0].slice(0, 160));
    await B.p.screenshot({ path: `${L.SCR}/e2e/resp-${role}-${vn}-${pn}.png` });
  }
  await B.b.close(); return { n: R.pages.length, issues };
}
(async () => {
  for (const role of Object.keys(ROLES)) for (const [vn, vp] of VIEWS) {
    const r = await sweep(role, vn, vp);
    await step(`23 Responsive ${role} ${vn} ${vp.width}px: ${r.n} screens, no horizontal scroll, no page errors`, async () => { assert(!r.issues.length, r.issues.join(' || ')); return 'ok'; });
  }
  const V = await L.open({ width: 390, height: 844 });
  await step('24 Signed-out visitor: home loads, product readable, no page errors', async () => {
    await V.p.evaluate(id => window.openProduct(id, 'products'), st.productId); await V.p.waitForTimeout(2000);
    const t = await V.p.evaluate(() => (document.getElementById('productModal') || {}).innerText || '');
    await V.p.screenshot({ path: L.SCR + '/e2e/resp-visitor-product.png' });
    const errs = L.realErrs(V.log);
    assert(/Simu E2E Test/.test(t), 'product not readable signed-out'); assert(!errs.length, errs.slice(0, 2).join(' || '));
    return 'ok';
  });
  await V.b.close();
})();

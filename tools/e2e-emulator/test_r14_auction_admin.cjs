// [R14] Admin "Minada" screen in the Admin Control Center — real browser, real admin login
// (owner@sokohai.test = SUPER_ADMIN_EMAILS of the local server), real callables, emulator only.
const { seed, L, PW } = require('./review-seed.cjs');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'out', 'r14-admin-'); fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const VP = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const ev = (p, fn, a) => p.evaluate(fn, a);
(async () => {
  await seed();
  const owner = await L.authUser('owner@sokohai.test', PW, 'Owner');
  await L.db.doc('users/' + owner).set({ uid: owner, fullName: 'Owner Admin', email: 'owner@sokohai.test' }, { merge: true });
  const now = Date.now(), H = 3600e3;
  const base = { price: 10000, stock: 1, userId: 'seller1', sellerName: 'Juma Electronics', publicationStatus: 'published', saleMode: 'auction', createdAt: new Date().toISOString() };
  await L.db.doc('products/aucA').set(Object.assign({}, base, { title: 'Simu · mnada demo', modeData: { mode: 'auction', endTime: now + 2 * H, currentBid: 12000, totalBids: 2, bidderCount: 2 } }));
  await L.db.doc('products/aucE').set(Object.assign({}, base, { title: 'Saa · mnada demo', modeData: { mode: 'auction', endTime: now - 30 * H, ended: true, endNotified: true, winnerId: 'b1', winnerName: 'Asha', winnerBid: 20000, winnerRound: 1, paymentDeadline: now - H, totalBids: 2 } }));
  await L.db.doc('products/aucE/bids/a').set({ uid: 'b1', name: 'Asha', amount: 20000 }); await L.db.doc('products/aucE/bids/b').set({ uid: 'b2', name: 'Neema', amount: 18000 });
  const B = await L.open(VP); await L.login(B.p, 'buyer.review@sokohai.test', PW);
  const O = await L.open(VP); await L.login(O.p, 'owner@sokohai.test', PW);
  await L.step('a buyer opening the admin center is refused by the server', async () => {
    await ev(B.p, () => window.skhOpenAdminControlCenter()); await B.p.waitForTimeout(2500);
    const t = await ev(B.p, () => document.getElementById('skhAdminCC').textContent); L.assert(/Hakuna ruhusa/.test(t) && !/Minada/.test(t), t.slice(0, 120)); });
  await L.step('admin: Minada tab lists auctions with server statuses', async () => {
    await ev(O.p, () => window.skhOpenAdminControlCenter('auctions'));
    await O.p.waitForFunction(() => /Malipo yamechelewa/.test((document.getElementById('skhAdminCC') || {}).textContent || ''), null, { timeout: 20000 });
    await O.p.screenshot({ path: OUT + process.env.VP + '-list.png' }); });
  await L.step('admin opens an expired-payment auction and gives the runner-up the chance (reason required)', async () => {
    await ev(O.p, () => window.skhAdminAucOpen('aucE'));
    await O.p.waitForFunction(() => /Mpe anayefuata nafasi/.test(document.getElementById('ccAucDetail').textContent), null, { timeout: 15000 });
    await O.p.screenshot({ path: OUT + process.env.VP + '-detail.png' });
    await ev(O.p, () => { window.prompt = () => 'mshindi hajalipa kwa wakati'; window.skhPrompt = async () => 'mshindi hajalipa kwa wakati'; });
    await ev(O.p, () => window.skhAdminAucAct('aucE', 'second_chance'));
    await O.p.waitForFunction(() => /Neema/.test((document.getElementById('ccAucDetail') || {}).textContent || '') && /second_chance/.test(document.getElementById('ccAucDetail').textContent), null, { timeout: 20000 });
    const m = (await L.db.doc('products/aucE').get()).data().modeData; L.assert(m.winnerId === 'b2' && m.winnerRound === 2, JSON.stringify(m));
    const a = await L.db.collection('admin_audit_log').where('action', '==', 'auction_second_chance').get(); L.assert(a.size === 1, 'audit ' + a.size);
    await O.p.screenshot({ path: OUT + process.env.VP + '-after.png' }); return 'winner b2, round 2, audited'; });
  const errs = [...L.realErrs(B.log), ...L.realErrs(O.log)]; console.log('JS errors:', errs.length, errs.slice(0, 5).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await B.b.close(); await O.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

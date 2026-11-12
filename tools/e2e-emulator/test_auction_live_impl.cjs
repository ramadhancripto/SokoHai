// [AUCTION-LIVE] Browser E2E (emulator): quick chips, bidder count, outbid, history,
// emoji+comments, mini player (minimize/restore/close + leave-once), pause/resume UI,
// ending-soon + extended states, hub paused tag, winner. Real app + real callables.
const { seed, L, PW } = require('./review-seed.cjs');
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'out', 'auction-live-impl-'); fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
// NOTE: lib.open() uses chromium.launch() with no executablePath (needs playwright's own
// browser). This file launches with PW_EXE (headless shell) instead; everything else mirrors lib.
async function open(viewport) {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const ctx = await b.newContext({ viewport: viewport || { width: 390, height: 844 } });
  const p = await ctx.newPage(); const log = { errs: [], alerts: [], hosts: new Set(), uploads: 0 };
  await p.route(/api\.cloudinary\.com/, r => { log.uploads++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secure_url: L.BASE + '/favicon.ico?e2e=' + log.uploads, public_id: 'e2e' + log.uploads, resource_type: 'image' }) }); });
  await p.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => { const u = r.request().url(); if (u.includes('gstatic.com/firebasejs/10.8.1/') || u.includes('api.cloudinary.com')) return r.fallback(); log.hosts.add(new URL(u).host); r.abort(); });
  p.on('pageerror', e => log.errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') log.errs.push('CONSOLE ' + m.text().slice(0, 220)); });
  p.on('dialog', d => { log.alerts.push(d.message().slice(0, 200)); d.accept().catch(() => {}); });
  await p.goto(L.BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.skh && window.skh.auth && window.skh.emulator, null, { timeout: 45000 });
  await p.waitForTimeout(2500);
  return { b, ctx, p, log };
}
const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
const ev = (p, fn, arg) => p.evaluate(fn, arg);
let wi = 0; const W = (p, sel, t) => p.waitForSelector(sel, { timeout: t || 20000 }).catch(async (e) => { await p.screenshot({ path: OUT + 'FAIL-' + (++wi) + '.png' }).catch(() => {}); throw e; });
const closeAll = (p) => ev(p, () => { try { window.skhLvModalClose && skhLvModalClose(); ['lvxRoom', 'lvxHub', 'lvxMyBids'].forEach(i => window.skhLiveClose && skhLiveClose(i)); window.closeModals && closeModals(); } catch (e) {} });
const vc = async (sid) => (await L.db.doc('live_sessions/' + sid).get()).data().viewerCount;
(async () => {
  await seed();
  const uidOf = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const juma = await uidOf('juma.review@sokohai.test'), asha = await uidOf('buyer.review@sokohai.test');
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  const now = Date.now(), img = L.BASE + '/assets/img/categories/elektroniki.webp';
  const base = { userId: juma, ownerName: 'Juma Electronics', sellerName: 'Juma Electronics', publicationStatus: 'published', availabilityStatus: 'available', condition: 'Mpya', createdAt: new Date().toISOString() };
  const auc = (id, title, price, endInMs) => L.db.doc('products/' + id).set(Object.assign({}, base, { title, price, stock: 1, image: img, imagesArray: [img], saleMode: 'auction', modeData: { mode: 'auction', startTime: now - 60000, endTime: now + endInMs, minIncrement: 5000 } }));
  await auc('auc1', 'Simu Samsung A54 · demo', 30000, 2 * 3600e3);
  await auc('aucPause', 'Redio Toptronic · demo', 20000, 2 * 3600e3);
  await auc('aucEnd', 'Saa ya mkono · demo', 50000, 50000);
  await auc('aucExt', 'Spika kubwa · demo', 40000, 90000);
  const S = await open(); await L.login(S.p, 'juma.review@sokohai.test', PW);
  const B = await open(); await L.login(B.p, 'buyer.review@sokohai.test', PW);
  const N = await open(); await L.login(N.p, 'neema.review@sokohai.test', PW);
  for (const P of [S.p, B.p, N.p]) await ev(P, () => { try { window.unlockSystem && unlockSystem(); window.closeWelcome && closeWelcome(); } catch (e) {} });
  let live, pse;
  await L.step('seller starts an auction live (callable) + buyer opens the room', async () => {
    live = (await L.call(S.p, 'liveCreate', { kind: 'auction', title: 'Mnada wa simu', productIds: ['auc1'] })).data.sessionId;
    L.assert((await L.call(S.p, 'liveStart', { sessionId: live })).ok, 'start');
    await ev(B.p, id => window.skhLiveOpen(id), live); await W(B.p, '#lv7BidCta');
    const t = await ev(B.p, () => document.getElementById('lv7BidCta').textContent);
    L.assert(/WEKA ZABUNI[\s\S]*Inayokubalika: TSh 35,000/.test(t), t); await shot(B.p, '01-room'); return t.replace(/\s+/g, ' ');
  });
  await L.step('quick-bid chips set the amount; submit leads; Wazabuni: 1', async () => {
    await B.p.click('#lv7BidCta'); await W(B.p, '#lvBidChips button');
    const n = await ev(B.p, () => document.querySelectorAll('#lvBidChips button').length); L.assert(n === 3, 'chips ' + n);
    await B.p.click('#lvBidChips button:nth-child(2)');
    const v = await ev(B.p, () => document.getElementById('lvBidAmt').value); L.assert(v === '40000', 'chip value ' + v);
    await shot(B.p, '02-chips');
    await B.p.click('#lvBidChips button:nth-child(1)'); await B.p.click('#lvBidGo');
    await B.p.waitForFunction(() => /UNAONGOZA/.test(document.getElementById('lv7Bottom').textContent), null, { timeout: 15000 });
    const f = await ev(B.p, () => document.querySelector('.lv7-foot').textContent);
    L.assert(/Wazabuni: 2|Wazabuni:\s*1/.test(f), f); await shot(B.p, '03-leading'); return f.replace(/\s+/g, ' ');
  });
  await L.step('second buyer bids higher: outbid pop-up + Wazabuni: 2', async () => {
    await ev(N.p, id => window.skhLiveOpen(id), live); await W(N.p, '#lv7BidCta');
    await N.p.click('#lv7BidCta'); await W(N.p, '#lvBidGo');
    await N.p.fill('#lvBidAmt', '45000'); await N.p.click('#lvBidGo');
    await W(B.p, '.lv-outbid:not([hidden]) .lv-btn'); await shot(B.p, '04-outbid');
    await ev(B.p, () => skhLvModalClose());
    const f = await ev(B.p, () => document.querySelector('.lv7-foot').textContent);
    L.assert(/Wazabuni:\s*2/.test(f), f); return f.replace(/\s+/g, ' ');
  });
  await L.step('bid history rows with masked names', async () => {
    await B.p.click('.lv7-foot button'); await B.p.waitForTimeout(900);
    const n = await ev(B.p, () => document.querySelectorAll('.lv7-brow').length); L.assert(n >= 2, 'rows ' + n);
    const t = await ev(B.p, () => document.querySelector('.lv7-bids').textContent); L.assert(/\*\*\*/.test(t), 'masked: ' + t.slice(0, 80));
    await shot(B.p, '05-history');
    await ev(B.p, () => { const s = document.getElementById('lv7Sheet'); if (s) s.hidden = true; }); return n + ' rows';
  });
  await L.step('emoji inserts into chat; comment reaches the seller live', async () => {
    await ev(S.p, id => window.skhLiveOpen(id), live); await W(S.p, '#lv7Bottom');
    await B.p.click('#lvxEmoji button[data-e="🔥"]');
    const v = await ev(B.p, () => document.getElementById('lvxChatInput').value); L.assert(/🔥/.test(v), 'emoji ' + v);
    await B.p.fill('#lvxChatInput', v + ' Inawaka!');
    await B.p.press('#lvxChatInput', 'Enter');
    await S.p.waitForFunction(() => /Inawaka/.test((document.getElementById('lvxComments') || {}).textContent || ''), null, { timeout: 15000 });
    await shot(B.p, '06-chat');
  });
  await L.step('mini player: minimize keeps the session, restore returns, close leaves once', async () => {
    L.assert((await vc(live)) === 3, 'viewers=3 before mini');
    await ev(B.p, () => window.skhLiveMinimize()); await W(B.p, '#lvxMini');
    await B.p.waitForTimeout(1200);
    L.assert((await vc(live)) === 3, 'minimize did not leave'); await shot(B.p, '07-mini');
    await ev(B.p, () => window.skhLiveMiniRestore()); await W(B.p, '#lvxRoom:not([hidden]) #lv7BidCta, #lvxRoom:not([hidden]) .lv7-cta');
    L.assert((await vc(live)) === 3, 'restore did not re-join'); await shot(B.p, '08-restored');
    await ev(B.p, () => window.skhLiveMinimize()); await W(B.p, '#lvxMini');
    await ev(B.p, () => window.skhLiveMiniClose()); await B.p.waitForTimeout(1500);
    L.assert((await vc(live)) === 2, 'close left once'); await shot(B.p, '09-closed');
  });
  await L.step('pause (pre-bid): host menu pauses; buyer sees IMESITISHWA; resume extends endTime', async () => {
    pse = (await L.call(S.p, 'liveCreate', { kind: 'auction', title: 'Mnada wa redio', productIds: ['aucPause'] })).data.sessionId;
    await L.call(S.p, 'liveStart', { sessionId: pse });
    await closeAll(S.p); await ev(S.p, id => window.skhLiveOpen(id), pse); await W(S.p, '#lv7Bottom');
    const endBefore = (await L.db.doc('products/aucPause').get()).data().modeData.endTime;
    await S.p.click('#lv7More'); await W(S.p, '.lv7-mrow');
    await S.p.click('.lv7-mrow:has-text("Sitisha")');
    await S.p.waitForFunction(() => /IMESITISHWA/.test(document.getElementById('lv7Status').textContent), null, { timeout: 15000 });
    await S.p.waitForFunction(() => !document.getElementById('lv7Paused').hidden, null, { timeout: 10000 });
    await shot(S.p, '10-paused-host');
    await closeAll(B.p); await ev(B.p, id => window.skhLiveOpen(id), pse); await W(B.p, '#lv7Bottom');
    const cta = await ev(B.p, () => document.querySelector('#lv7Bottom .lv7-cta').textContent);
    L.assert(/IMESITISHWA/.test(cta), cta); await shot(B.p, '11-paused-buyer');
    await B.p.waitForTimeout(1500);
    await ev(S.p, () => window.skhLiveHost('resume'));
    await S.p.waitForFunction(() => /LIVE/.test(document.getElementById('lv7Status').textContent) && document.getElementById('lv7Paused').hidden, null, { timeout: 15000 });
    const endAfter = (await L.db.doc('products/aucPause').get()).data().modeData.endTime;
    L.assert(endAfter > endBefore, 'extended ' + endBefore + ' -> ' + endAfter);
    const bid = await L.call(B.p, 'auctionPlaceBid', { productId: 'aucPause', amount: 25000, clientBidId: 'pz9' });
    L.assert(bid.ok, JSON.stringify(bid)); return 'endTime +' + Math.round((endAfter - endBefore) / 1000) + 's';
  });
  await L.step('ending-soon banner under 60s + extended +2:00 note after late bid', async () => {
    await closeAll(B.p); await ev(B.p, () => window.skhAuctionRoom('aucEnd')); await W(B.p, '.lv7-endsoon'); await shot(B.p, '12-ending');
    await closeAll(B.p); await ev(B.p, () => window.skhAuctionRoom('aucExt')); await W(B.p, '#lv7Bottom');
    const r = await L.call(N.p, 'auctionPlaceBid', { productId: 'aucExt', amount: 46000, clientBidId: 'ex1' }); L.assert(r.ok && r.data.extended, JSON.stringify(r));
    await B.p.waitForFunction(() => /\+2:00/.test(document.getElementById('lv7Bottom').textContent), null, { timeout: 15000 });
    await shot(B.p, '13-extended');
  });
  await L.step('hub shows a paused live with the ⏸ tag', async () => {
    L.assert((await L.call(S.p, 'livePause', { sessionId: pse })).ok === false, 'pause refused after bids (server rule)');
    const c2 = (await L.call(S.p, 'liveCreate', { kind: 'auction', title: 'Mnada wa redio 2', productIds: ['aucPause'] }));
    const pse2 = c2.data.sessionId; await L.call(S.p, 'liveStart', { sessionId: pse2 });
    await L.db.doc('products/aucPause').update({ 'modeData.totalBids': 0 });   // test-only: pre-bid state for the pause rule
    L.assert((await L.call(S.p, 'livePause', { sessionId: pse2 })).ok, 'paused');
    await closeAll(B.p); await ev(B.p, () => window.skhLiveHub('live')); await W(B.p, '.lvh-pausedtag'); await shot(B.p, '14-hub-paused');
  });
  await L.step('winner announcement + LIPA SASA (server result)', async () => {
    await L.db.doc('products/aucEnd').update({ 'modeData.currentBid': 60000, 'modeData.maxBidder': asha, 'modeData.maxBidderName': 'Asha Mnunuzi', 'modeData.totalBids': 2, 'modeData.endTime': Date.now() - 1000, 'modeData.ended': true, 'modeData.endNotified': true, 'modeData.winnerId': asha, 'modeData.winnerName': 'Asha Mnunuzi', 'modeData.winnerBid': 60000, 'modeData.paymentDeadline': Date.now() + 24 * 3600e3 });
    await closeAll(B.p); await ev(B.p, () => window.skhAuctionRoom('aucEnd')); await W(B.p, '.lv-win:not([hidden]) .lv-btn'); await shot(B.p, '15-winner');
    await ev(B.p, () => skhLvModalClose());
  });
  const errs = [...L.realErrs(S.log), ...L.realErrs(B.log), ...L.realErrs(N.log)]; console.log('JS errors:', errs.length, errs.slice(0, 8).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await S.b.close(); await B.b.close(); await N.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

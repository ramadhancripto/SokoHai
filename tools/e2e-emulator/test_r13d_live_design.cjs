// R13-D UI E2E (emulator): Live hub, Mnada Live room, bid confirm, outbid, winner, Bei Kushuka room,
// Weka bei yako, ranking, campaign end + opportunity, Zabuni zangu, product panels, Nyumbani live,
// Hali viewer (react, chat, live in rail), host view. Three real browsers; real callables; emulator only.
const { seed, L, PW } = require('./review-seed.cjs');
const OUT = require('path').join(__dirname, 'out', 'r13d-'); require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true });
const VP = process.env.VP || 'phone';
const vp = VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const shot = (p, n) => p.screenshot({ path: OUT + VP + '-' + n + '.png' });
const ev = (p, fn, arg) => p.evaluate(fn, arg);
let wi = 0; const W = (p, sel, t) => p.waitForSelector(sel, { timeout: t || 15000 }).catch(async (e) => { await p.screenshot({ path: OUT + VP + '-FAIL-' + (++wi) + '.png' }).catch(() => {}); throw e; });
const closeAll = (p) => ev(p, () => { try { window.skhLvModalClose && skhLvModalClose(); ['lvxRoom', 'lvxHub', 'lvxMyBids'].forEach(i => window.skhLiveClose && skhLiveClose(i)); window.closeModals && closeModals(); } catch (e) {} });
(async () => {
  await seed();
  const uidOf = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const juma = await uidOf('juma.review@sokohai.test'), asha = await uidOf('buyer.review@sokohai.test');
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  const now = Date.now(), img = (n) => L.BASE + '/assets/img/categories/' + n + '.webp';
  const base = { userId: juma, ownerName: 'Juma Electronics', sellerName: 'Juma Electronics', category: 'CAT-11', publicationStatus: 'published', availabilityStatus: 'available', condition: 'Mpya', createdAt: new Date().toISOString() };
  await L.db.doc('products/auc1').set(Object.assign({}, base, { title: 'Simu Samsung A54 · demo', price: 300000, stock: 1, image: img('elektroniki'), imagesArray: [img('elektroniki')], saleMode: 'auction', modeData: { mode: 'auction', startTime: now - 60000, endTime: now + 2 * 3600e3, minIncrement: 5000 } }));
  await L.db.doc('products/auc2').set(Object.assign({}, base, { title: 'Saa ya mkononi · demo', price: 200000, stock: 1, image: img('elektroniki'), imagesArray: [img('elektroniki')], saleMode: 'auction', modeData: { mode: 'auction', startTime: now - 7200e3, endTime: now + 3600e3 } }));
  await L.db.doc('products/pd1').set(Object.assign({}, base, { title: 'Spika JBL · demo', price: 200000, stock: 5, image: img('elektroniki'), imagesArray: [img('elektroniki')], saleMode: 'price_drop', modeData: { mode: 'price_drop', startTime: now - 10 * 60e3, intervalMs: 60e3, dropAmount: 1000, minPrice: 150000, endTime: now + 3 * 3600e3, maxPerBuyer: 2 } }));
  await L.db.doc('products/pd2').set(Object.assign({}, base, { title: 'Smart TV 43 inch · demo', price: 850000, stock: 1, image: img('elektroniki'), imagesArray: [img('elektroniki')], saleMode: 'price_drop', modeData: { mode: 'price_drop', startTime: now - 30 * 60e3, intervalMs: 60e3, dropAmount: 1000, minPrice: 550000, endTime: now + 3600e3, maxPerBuyer: 1 } }));
  await L.db.doc('stories/st1').set({ authorUid: juma, authorName: 'Juma Electronics', kind: 'image', mediaUrl: img('mavazi'), caption: 'Mashati mapya yamefika dukani leo', listing: { col: 'products', id: 'tv55a', title: 'Samsung Smart TV 55 inch', price: 1250000 }, visibility: 'public', status: 'active', viewCount: 0, createdAt: new Date(now - 3600e3).toISOString(), expiresAt: new Date(now + 20 * 3600e3).toISOString(), expiresAtMs: now + 20 * 3600e3 });

  const S = await L.open(vp); await L.login(S.p, 'juma.review@sokohai.test', PW);
  const B = await L.open(vp); await L.login(B.p, 'buyer.review@sokohai.test', PW);
  const N = await L.open({ width: 390, height: 844 }); await L.login(N.p, 'neema.review@sokohai.test', PW);
  for (const P of [S.p, B.p, N.p]) await ev(P, () => { try { window.unlockSystem && unlockSystem(); window.closeWelcome && closeWelcome(); } catch (e) {} });
  let live, auc;
  await L.step('seller starts a seller live, a Mnada Live and schedules one', async () => {
    live = (await L.call(S.p, 'liveCreate', { kind: 'live_commerce', title: 'Ofa za TV na spika leo', description: 'Bidhaa mpya za dukani', productIds: ['pd1', 'tv55a'] })).data.sessionId;
    L.assert((await L.call(S.p, 'liveStart', { sessionId: live })).ok, 'start live');
    auc = (await L.call(S.p, 'liveCreate', { kind: 'auction', title: 'Mnada wa simu', productIds: ['auc1'] })).data.sessionId;
    L.assert((await L.call(S.p, 'liveStart', { sessionId: auc })).ok, 'start auction');
    const sc = await L.call(S.p, 'liveCreate', { kind: 'live_commerce', title: 'Mkusanyiko wa nguo mpya', productIds: ['tv55a'], scheduledAt: now + 2 * 3600e3 }); L.assert(sc.ok, JSON.stringify(sc)); });
  await L.step('Nyumbani shows "Live na fursa za soko" (ref 6)', async () => {
    await ev(B.p, () => location.reload()); await B.p.waitForFunction(() => window.skh && window.skh.currentUser, null, { timeout: 30000 }); await ev(B.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} window.updateApp('home'); });
    await W(B.p, '#lvHome:not([hidden]) .lvhome-feat', 25000); await ev(B.p, () => document.getElementById('lvHome').scrollIntoView({ block: 'start' })); await B.p.waitForTimeout(800); await shot(B.p, '00-home-live'); });
  await L.step('hub: LIVE SASA cards by type with CTA (ref 10)', async () => {
    await ev(B.p, () => window.skhLiveHub()); await W(B.p, '#lvxHub .lvh-card'); await B.p.waitForTimeout(1200);
    const t = await ev(B.p, () => [...document.querySelectorAll('#lvxHub .lvh-cta')].map(b => b.textContent.trim()));
    L.assert(t.includes('FUNGUA MNADA') && t.includes('INGIA LIVE'), t.join()); await shot(B.p, '01-hub-live'); return t.join(' | '); });
  await L.step('hub: YANAYOKUJA + Ukumbusho (server reminder)', async () => {
    await B.p.click('#lvxHub .lvh-tabs button[data-t=scheduled]'); await W(B.p, '.lvh-up'); await B.p.click('.lvh-up .lvh-pill');
    await B.p.waitForFunction(() => /umewekwa/.test(document.querySelector('.lvh-up .lvh-pill').textContent), null, { timeout: 10000 }); await shot(B.p, '01b-hub-yanayokuja'); });
  await L.step('hub: DEALS (price drop + minada)', async () => {
    await B.p.click('#lvxHub .lvh-tabs button[data-t=deals]'); await W(B.p, '#lvxHubGrid .lvh-card'); await B.p.waitForTimeout(800); await shot(B.p, '01c-hub-deals');
    return await ev(B.p, () => document.querySelectorAll('#lvxHubGrid .lvh-card').length) + ' deals'; });
  await L.step('Mnada Live room (ref 7): pills, host + Fuata, product card, WEKA ZABUNI + Inayokubalika', async () => {
    await closeAll(B.p); await ev(B.p, id => window.skhLiveOpen(id), auc); await W(B.p, '#lv7BidCta'); await B.p.waitForTimeout(1500);
    const t = await ev(B.p, () => document.getElementById('lv7BidCta').textContent); L.assert(/WEKA ZABUNI[\s\S]*Inayokubalika: TSh 315,000/.test(t), t);
    await shot(B.p, '02-auction-room'); return t.replace(/\s+/g, ' '); });
  await L.step('bid confirmation dialog (ref 5); low bid refused; valid bid leads in real time', async () => {
    await B.p.click('#lv7BidCta'); await W(B.p, '#lvBidAmt'); await shot(B.p, '03-bid-confirm');
    await B.p.fill('#lvBidAmt', '310000'); await B.p.click('#lvBidGo'); await B.p.waitForTimeout(1500);
    L.assert(await ev(B.p, () => !document.getElementById('lvModal').hidden), 'low bid closed the dialog');
    await B.p.fill('#lvBidAmt', '320000'); await B.p.click('#lvBidGo');
    await B.p.waitForFunction(() => /320,000/.test((document.getElementById('lvxBidNow') || {}).textContent || '') && /UNAONGOZA/.test(document.getElementById('lv7Bottom').textContent), null, { timeout: 15000 });
    await B.p.waitForTimeout(800); await shot(B.p, '03b-leading'); });
  await L.step('live comment from the room reaches the seller in real time', async () => {
    await ev(S.p, id => window.skhLiveOpen(id), auc); await W(S.p, '#lv7Bottom');
    await B.p.fill('#lvxChatInput', 'Ina warranty?'); await B.p.press('#lvxChatInput', 'Enter');
    await S.p.waitForFunction(() => /Ina warranty/.test((document.getElementById('lvxComments') || {}).textContent || ''), null, { timeout: 15000 }); });
  await L.step('outbid pop-up when another buyer bids higher (ref 5)', async () => {
    const r = await L.call(N.p, 'auctionPlaceBid', { productId: 'auc1', amount: 340000, clientBidId: 'n1', bidderName: 'Neema Digital' }); L.assert(r.ok, JSON.stringify(r));
    await W(B.p, '.lv-outbid:not([hidden]) .lv-btn'); await shot(B.p, '04-outbid'); await ev(B.p, () => skhLvModalClose()); });
  await L.step('bid history (ref 5)', async () => {
    await B.p.click('.lv7-foot button'); await B.p.waitForTimeout(800);
    const n = await ev(B.p, () => document.querySelectorAll('.lv7-brow').length); L.assert(n >= 2, 'rows ' + n); await shot(B.p, '05-bid-history');
    await ev(B.p, () => { const s = document.getElementById('lv7Sheet'); if (s) s.hidden = true; }); return n + ' rows'; });
  await L.step('host view of the room (start/end/moderate in "Zaidi")', async () => {
    await S.p.waitForTimeout(600); await shot(S.p, '18-host-room'); await S.p.click('#lv7More'); await W(S.p, '.lv7-mrow'); await shot(S.p, '19-host-menu'); });
  await L.step('winner announcement + LIPA SASA (ref 5)', async () => {
    await L.db.doc('products/auc2').update({ 'modeData.currentBid': 250000, 'modeData.maxBidder': asha, 'modeData.totalBids': 3, 'modeData.endTime': Date.now() - 1000, 'modeData.ended': true, 'modeData.endNotified': true,
      'modeData.winnerId': asha, 'modeData.winnerName': 'Asha Mnunuzi', 'modeData.winnerBid': 250000, 'modeData.paymentDeadline': Date.now() + 24 * 3600e3 });
    await closeAll(B.p); await ev(B.p, () => window.skhAuctionRoom('auc2')); await W(B.p, '.lv-win:not([hidden]) .lv-btn'); await B.p.waitForTimeout(600); await shot(B.p, '06-winner');
    await ev(B.p, () => skhLvModalClose()); });
  await L.step('Bei Kushuka room (ref 2): price engine, WEKA BEI YAKO + NUNUA SASA', async () => {
    await closeAll(B.p); await ev(B.p, id => window.skhLiveOpen(id), live); await W(B.p, '.lv7-engine'); await B.p.waitForTimeout(1200);
    const t = await ev(B.p, () => document.getElementById('lv7Bottom').textContent); L.assert(/WEKA BEI YAKO/.test(t) && /NUNUA SASA/.test(t) && /1[89]\d,\d{3}/.test(t), t.replace(/\s+/g, ' ').slice(0, 200));
    await shot(B.p, '07-pricedrop-room'); });
  await L.step('Weka bei yako (ref 1): submitted, ranked', async () => {
    await B.p.click('.lv7-ctas .lv7-cta'); await W(B.p, '#lvPdAmt'); await B.p.fill('#lvPdAmt', '185000'); await B.p.click('#lvPdGo');
    await B.p.waitForFunction(() => /nafasi ya 1/.test((document.querySelector('#lvPdRes b') || {}).textContent || ''), null, { timeout: 15000 }); await shot(B.p, '08-weka-bei'); await ev(B.p, () => skhLvModalClose()); });
  await L.step('Viongozi na nafasi (ref 1): masked ranking + my place', async () => {
    await L.call(N.p, 'priceDropSubmit', { productId: 'pd1', price: 190000, name: 'Neema Digital' });
    await B.p.waitForTimeout(1500); await B.p.click('.lv7-foot button'); await B.p.waitForTimeout(1200);
    const n = await ev(B.p, () => document.querySelectorAll('.lv7-rrow').length); L.assert(n >= 2, 'rows ' + n); await shot(B.p, '09-ranking');
    await ev(B.p, () => { const s = document.getElementById('lv7Sheet'); if (s) s.hidden = true; }); return n + ' in queue'; });
  await L.step('product opens on top of the live; closing it keeps the live', async () => {
    await ev(B.p, () => window.skhLiveOpenProduct('pd1')); await B.p.waitForFunction(() => getComputedStyle(document.getElementById('productModal')).display !== 'none', null, { timeout: 15000 });
    await B.p.waitForTimeout(1200); await shot(B.p, '15-product-over-live'); await ev(B.p, () => window.closeModals && closeModals()); await B.p.waitForTimeout(500);
    L.assert(await ev(B.p, () => !document.getElementById('lvxRoom').hidden), 'live lost'); });
  await L.step('campaign end (ref 2) -> PONGEZI! fursa ya kununua (ref 1) at the buyer\'s own price', async () => {
    L.assert((await L.call(B.p, 'priceDropSubmit', { productId: 'pd2', price: 715000, name: 'Asha Mnunuzi' })).ok, 'submit pd2');
    await L.call(N.p, 'priceDropSubmit', { productId: 'pd2', price: 705000, name: 'Neema Digital' });
    await L.db.doc('products/pd2').update({ 'modeData.endTime': Date.now() - 1000 });
    await closeAll(B.p); await ev(B.p, () => window.skhPriceDropRoom('pd2')); await W(B.p, '.lv-end:not([hidden]) .lv-btn', 25000); await B.p.waitForTimeout(600); await shot(B.p, '10-campaign-end');
    await B.p.click('.lv-end .lv-btn'); await W(B.p, '.lv-offer:not([hidden]) .lv-btn'); await shot(B.p, '11-opportunity');
    const md = (await L.db.doc('products/pd2').get()).data().modeData; L.assert(md.opportunities[asha] && md.opportunities[asha].price === 715000, 'offer');
    await ev(B.p, () => skhLvModalClose()); });
  await L.step('Zabuni zangu (ref 5)', async () => {
    await closeAll(B.p); await ev(B.p, () => window.skhMyBids()); await W(B.p, '.lvmb-row'); await B.p.waitForTimeout(1500);
    const t = await ev(B.p, () => [...document.querySelectorAll('.lvmb-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); await shot(B.p, '12-my-bids'); return t; });
  await L.step('product page panels: auction (ref 5/6) and Bei Kushuka (ref 2)', async () => {
    await closeAll(B.p); await ev(B.p, () => window.openProduct('auc1', 'products')); await W(B.p, '.lvp .skh-auction-room-btn');
    await ev(B.p, () => document.querySelector('.lvp').scrollIntoView({ block: 'center' })); await B.p.waitForTimeout(600); await shot(B.p, '13-product-auction');
    await closeAll(B.p); await ev(B.p, () => window.openProduct('pd1', 'products')); await W(B.p, '.lvp-pd');
    await B.p.waitForFunction(() => /kati ya|Hujaweka|fursa/.test(document.getElementById('lvpRank').textContent), null, { timeout: 10000 });
    await ev(B.p, () => document.querySelector('.lvp').scrollIntoView({ block: 'center' })); await B.p.waitForTimeout(600); await shot(B.p, '14-product-pricedrop'); });
  await L.step('Chat: Hali rail with LIVE item (ref 9 "Watch Live") + viewer React / Chat na muuzaji', async () => {
    await closeAll(B.p); await ev(B.p, () => window.openChatList()); await W(B.p, '#skhHxRail .hx-live', 20000); await B.p.waitForTimeout(800); await shot(B.p, '16-chat-rail');
    await B.p.click('#skhHxRail .hx-item:not(.hx-add):not(.hx-live)'); await W(B.p, '#hxViewer .hx-react'); await B.p.click('#hxViewer .hx-react button');
    await B.p.waitForFunction(() => document.querySelector('#hxViewer .hx-react button span') && document.querySelector('#hxViewer .hx-react button span').textContent === '1', null, { timeout: 10000 });
    await shot(B.p, '17-hali-viewer'); const c = (await L.db.doc('stories/st1').get()).data().reactCount; await ev(B.p, () => skhStoryClose()); return 'reactCount=' + c; });
  const errs = [...L.realErrs(S.log), ...L.realErrs(B.log), ...L.realErrs(N.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await S.b.close(); await B.b.close(); await N.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

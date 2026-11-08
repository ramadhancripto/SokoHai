// R13-B UI E2E on the local emulator: Live, Mnada Live, Bei Kushuka Live, Hali viewer, Group Soko.
// Two real browsers (seller Juma + buyer Asha) calling the real callables via the app. Emulator only.
const { seed, L, PW } = require('./review-seed.cjs');
const OUT = require('path').join(__dirname, 'out', 'r13b-'); require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true });
const VP = process.env.VP || 'phone';
const vp = VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const shot = (p, n) => p.screenshot({ path: OUT + VP + '-' + n + '.png' });
const ev = (p, fn, arg) => p.evaluate(fn, arg);
(async () => {
  await seed();
  const juma = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  const asha = (await L.admin.auth().getUserByEmail('buyer.review@sokohai.test')).uid;
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  const now = Date.now(), img = L.BASE + '/assets/img/categories/elektroniki.webp';
  await L.db.doc('products/auc1').set({ userId: juma, ownerName: 'Juma Electronics', sellerName: 'Juma Electronics', title: 'Simu Samsung A54 · mnada demo', category: 'CAT-11', price: 300000, stock: 1, publicationStatus: 'published', availabilityStatus: 'available', image: img, imagesArray: [img], saleMode: 'auction', modeData: { mode: 'auction', startTime: now - 60000, endTime: now + 2 * 3600000, minIncrement: 5000 }, createdAt: new Date().toISOString() });
  await L.db.doc('products/pd1').set({ userId: juma, ownerName: 'Juma Electronics', sellerName: 'Juma Electronics', title: 'Spika JBL · bei kushuka demo', category: 'CAT-11', price: 200000, stock: 5, publicationStatus: 'published', availabilityStatus: 'available', image: img, imagesArray: [img], saleMode: 'price_drop', modeData: { mode: 'price_drop', startTime: now - 10 * 60000, intervalMs: 60000, dropAmount: 1000, minPrice: 150000, endTime: now + 3 * 3600000, maxPerBuyer: 2 }, createdAt: new Date().toISOString() });
  await L.db.doc('stories/st1').set({ authorUid: juma, authorName: 'Juma Electronics', kind: 'image', mediaUrl: img, caption: 'TV mpya zimefika dukani leo', listing: { col: 'products', id: 'tv55a', title: 'Samsung Smart TV 55 inch', price: 1250000 }, visibility: 'public', status: 'active', viewCount: 0, createdAt: new Date(now - 3600000).toISOString(), expiresAt: new Date(now + 20 * 3600000).toISOString(), expiresAtMs: now + 20 * 3600000 });

  const S = await L.open(vp); await L.login(S.p, 'juma.review@sokohai.test', PW);
  const B = await L.open(vp); await L.login(B.p, 'buyer.review@sokohai.test', PW);
  for (const P of [S.p, B.p]) await ev(P, () => { try { window.unlockSystem && unlockSystem(); window.closeWelcome && closeWelcome(); } catch (e) {} });
  let live, auc, gid;
  await L.step('seller creates + starts a live with own products (liveCreate/liveStart)', async () => {
    const r = await L.call(S.p, 'liveCreate', { kind: 'live', title: 'Ofa za TV leo', productIds: ['tv55a', 'pd1'] }); L.assert(r.ok, JSON.stringify(r)); live = r.data.sessionId;
    const s = await L.call(S.p, 'liveStart', { sessionId: live }); L.assert(s.ok, JSON.stringify(s)); return live; });
  await L.step('seller cannot put another seller\'s product in a live', async () => {
    const r = await L.call(S.p, 'liveCreate', { kind: 'live', title: 'Live ya bidhaa za wengine', productIds: ['tv55b'] }); L.assert(!r.ok && /si_bidhaa_yako/.test(r.message), JSON.stringify(r)); });
  await L.step('Mnada Live session for the auction product', async () => {
    const r = await L.call(S.p, 'liveCreate', { kind: 'auction', title: 'Mnada wa simu', productIds: ['auc1'] }); L.assert(r.ok, JSON.stringify(r)); auc = r.data.sessionId;
    L.assert((await L.call(S.p, 'liveStart', { sessionId: auc })).ok, 'start'); });
  await L.step('home quick action "Live sasa" opens the hub with the live listed', async () => {
    await ev(B.p, () => window.updateApp('home')); await B.p.waitForTimeout(1500);
    await B.p.click('[data-skh-live-entry]'); await B.p.waitForSelector('#lvxHub .lvx-card', { timeout: 15000 });
    const n = await B.p.$$eval('#lvxHub .lvx-card', e => e.length); await shot(B.p, '01-live-hub'); return n + ' live'; });
  await L.step('buyer joins the room, sends a comment that the seller sees in real time', async () => {
    await ev(B.p, id => window.skhLiveOpen(id), live); await B.p.waitForSelector('#lvxRoom .lvx-prod', { timeout: 15000 });
    await ev(S.p, id => window.skhLiveOpen(id), live); await S.p.waitForSelector('#lvxRoom', { timeout: 15000 });
    await B.p.fill('#lvxRoom .lvx-chat-form input', 'Bei ya TV ni ngapi?'); await B.p.press('#lvxRoom .lvx-chat-form input', 'Enter');
    await S.p.waitForFunction(() => /Bei ya TV ni ngapi/.test((document.getElementById('lvxComments') || {}).textContent || ''), null, { timeout: 15000 });
    const v = (await L.db.doc('live_sessions/' + live).get()).data().viewerCount; await shot(B.p, '02-live-room'); await shot(S.p, '02b-live-room-host'); return 'viewers=' + v; });
  await L.step('host pins a product; buyer sees the pinned card', async () => {
    const r = await L.call(S.p, 'livePin', { sessionId: live, productId: 'tv55a' }); L.assert(r.ok, JSON.stringify(r));
    await B.p.waitForSelector('#lvxPinned .lvx-pin-card', { timeout: 15000 }); });
  await L.step('product opens ON TOP of the live (room stays)', async () => {
    await ev(B.p, () => window.skhLiveOpenProduct('tv55a')); await B.p.waitForFunction(() => { const m = document.getElementById('productModal'); return m && getComputedStyle(m).display !== 'none' && window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === 'tv55a'; }, null, { timeout: 15000 });
    await B.p.waitForTimeout(1500); await shot(B.p, '03-product-over-live');
    const roomOpen = await ev(B.p, () => !document.getElementById('lvxRoom').hidden); L.assert(roomOpen, 'room closed');
    await ev(B.p, () => window.closeModals && window.closeModals()); await B.p.waitForTimeout(600);
    L.assert(await ev(B.p, () => !document.getElementById('lvxRoom').hidden), 'room lost after closing product'); return 'room kept'; });
  await L.step('price-drop product in the room shows the server formula price', async () => {
    const r = await L.call(S.p, 'livePin', { sessionId: live, productId: 'pd1' }); L.assert(r.ok, 'pin');
    await B.p.waitForFunction(() => /Spika/.test((document.getElementById('lvxPinned') || {}).textContent || ''), null, { timeout: 15000 }); await B.p.waitForTimeout(1500);
    const t = await ev(B.p, () => document.querySelector('#lvxPinned .lvx-price').textContent); await shot(B.p, '04-price-drop-live');
    L.assert(/19[0-9],\d{3}/.test(t), 'price ' + t); return t.trim(); });
  await L.step('host ends the live; buyer comment refused after end', async () => {
    L.assert((await L.call(S.p, 'liveEnd', { sessionId: live })).ok, 'end');
    const r = await L.call(B.p, 'liveComment', { sessionId: live, text: 'bado?', clientId: 'x1' }); L.assert(!r.ok, 'comment after end accepted'); return r.message; });
  await L.step('auction room: bid below minimum refused, valid bid shown in real time', async () => {
    await ev(B.p, () => window.skhLiveClose && window.skhLiveClose('lvxRoom')); await ev(B.p, () => window.skhAuctionRoom('auc1'));
    await B.p.waitForSelector('#lvxRoom .lvx-bid input', { timeout: 15000 });
    const low = await L.call(B.p, 'auctionPlaceBid', { productId: 'auc1', amount: 301000, clientBidId: 'b0' }); L.assert(!low.ok, 'low bid accepted');
    await B.p.fill('#lvxRoom .lvx-bid input', '320000'); await B.p.click('#lvxRoom .lvx-bid button');
    await B.p.waitForFunction(() => /320,000/.test((document.getElementById('lvxBidNow') || {}).textContent || ''), null, { timeout: 15000 });
    await B.p.waitForTimeout(800); await shot(B.p, '05-auction-room'); return 'low refused: ' + low.message; });
  await L.step('product page has "Fungua chumba cha mnada"', async () => {
    await ev(B.p, () => { window.skhLiveClose && window.skhLiveClose('lvxRoom'); window.openProduct('auc1', 'products'); });
    await B.p.waitForSelector('.skh-auction-room-btn', { timeout: 15000 }); await shot(B.p, '06-auction-product'); await ev(B.p, () => window.closeModals && window.closeModals()); });
  await L.step('Hali rail in Chat Discovery (own slot, 106 strip kept) + viewer with listing, close', async () => {
    await ev(B.p, () => window.openChatList()); await B.p.waitForSelector('#skhHxRail .hx-item:not(.hx-add)', { state: 'visible', timeout: 20000 });
    const kept = await ev(B.p, () => !!document.getElementById('skhDfHali')); L.assert(kept, '106 slot gone');
    await shot(B.p, '07a-chat-hali-rail');
    await B.p.click('#skhHxRail .hx-item:not(.hx-add)'); await B.p.waitForSelector('#hxViewer .hx-media img', { timeout: 10000 }); await B.p.waitForTimeout(1200);
    await shot(B.p, '07-hali-viewer');
    const views = (await L.db.doc('stories/st1').get()).data().viewCount; await ev(B.p, () => window.skhStoryClose());
    L.assert(await ev(B.p, () => document.getElementById('hxViewer').hidden), 'viewer not closed'); await ev(B.p, () => window.closeModals && window.closeModals()); return 'viewCount=' + views; });
  await L.step('buyer cannot create a story with someone else\'s media', async () => {
    const r = await L.call(B.p, 'storyCreate', { mediaUrl: 'https://res.cloudinary.com/demo/image/upload/sokohai/stories/' + juma + '/a.jpg' }); L.assert(!r.ok, 'accepted'); return r.message; });
  await L.step('Group Soko: create via UI form', async () => {
    await ev(S.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} window.skhLiveClose && window.skhLiveClose('lvxRoom'); window.skhGroupSokoNew(); }); await S.p.waitForSelector('#gsxName');
    await S.p.fill('#gsxName', 'Wauza Elektroniki Pamoja'); await S.p.fill('#gsxPurpose', 'Kununua TV kwa jumla na kuziuza sokoni'); await shot(S.p, '08-groupsoko-create');
    await S.p.click('#gsxCreate'); await S.p.waitForSelector('.gsx-kpis', { timeout: 15000 });
    const q = await L.db.collection('group_soko').where('memberUids', 'array-contains', juma).get(); gid = q.docs[0].id; await shot(S.p, '09-groupsoko-overview'); return gid; });
  await L.step('invite buyer; buyer accepts; buyer records capital; buyer cannot confirm own capital', async () => {
    L.assert((await L.call(S.p, 'groupSokoInvite', { groupId: gid, uid: asha })).ok, 'invite');
    await ev(B.p, id => window.skhGroupSokoOpen(id), gid); await B.p.waitForSelector('#gsxSheet .lvx-btn-primary'); await B.p.click('#gsxSheet .lvx-btn-primary'); await B.p.waitForSelector('.gsx-kpis', { timeout: 15000 });
    await ev(B.p, id => window.skhGroupSokoOpen(id, 'capital'), gid); await B.p.waitForSelector('#gsxAmt');
    await B.p.fill('#gsxAmt', '500000'); await B.p.fill('#gsxRef', 'MP-TEST-001'); await B.p.click('#gsxSheet .gsx-row .lvx-btn-primary');
    await B.p.waitForFunction(() => /Inasubiri/.test(document.getElementById('gsxBody').textContent), null, { timeout: 15000 }); await shot(B.p, '10-groupsoko-capital');
    const c = await L.db.collection('group_soko/' + gid + '/capital').get(); const cid = c.docs[0].id;
    const self = await L.call(B.p, 'groupSokoCapitalConfirm', { groupId: gid, capitalId: cid, decision: 'confirm' }); L.assert(!self.ok, 'self-confirm allowed');
    const ok = await L.call(S.p, 'groupSokoCapitalConfirm', { groupId: gid, capitalId: cid, decision: 'confirm' }); L.assert(ok.ok, JSON.stringify(ok)); return 'self refused: ' + self.message; });
  await L.step('purchase proposal → vote → execute → receive/inspect separation of duties', async () => {
    const pr = await L.call(B.p, 'groupSokoPropose', { groupId: gid, type: 'purchase', title: 'TV 10', details: { supplierName: 'Msambazaji Demo', ownership: 'owned', items: [{ name: 'TV 43', qty: 10, unitCost: 600000 }] } }); L.assert(pr.ok, JSON.stringify(pr));
    const pid = pr.data.proposalId; for (const p of [S.p, B.p]) await L.call(p, 'groupSokoVote', { groupId: gid, proposalId: pid, vote: 'yes' });
    const ex = await L.call(S.p, 'groupSokoExecute', { groupId: gid, proposalId: pid }); L.assert(ex.ok, JSON.stringify(ex));
    const rcv = await L.call(B.p, 'groupSokoPurchaseStep', { groupId: gid, purchaseId: ex.data.purchaseId, step: 'receive' }); L.assert(!rcv.ok, 'requester/member received');
    const ok = await L.call(S.p, 'groupSokoPurchaseStep', { groupId: gid, purchaseId: ex.data.purchaseId, step: 'receive' }); L.assert(ok.ok, JSON.stringify(ok));
    const insp = await L.call(S.p, 'groupSokoPurchaseStep', { groupId: gid, purchaseId: ex.data.purchaseId, step: 'inspect' }); L.assert(!insp.ok, 'receiver inspected');
    await ev(S.p, id => window.skhGroupSokoOpen(id, 'purchases'), gid); await S.p.waitForSelector('.gsx-table'); await S.p.waitForTimeout(600); await shot(S.p, '11-groupsoko-purchases');
    await ev(S.p, id => window.skhGroupSokoOpen(id, 'overview'), gid); await S.p.waitForSelector('.gsx-kpis'); await S.p.waitForTimeout(600); await shot(S.p, '12-groupsoko-report');
    return 'receive by member refused; inspect by receiver refused'; });
  await L.step('sidebar drawer has Live sasa + Group Soko', async () => {
    await ev(B.p, () => { window.skhGroupSokoClose(); window.openSidebarMenu ? window.openSidebarMenu() : (window.toggleSidebar && window.toggleSidebar()); }); await B.p.waitForTimeout(1500);
    const r = await ev(B.p, () => [!!document.querySelector('.skh-menu-live-row'), !!document.querySelector('.skh-menu-groupsoko-row')]); await shot(B.p, '13-sidebar');
    L.assert(r[0] && r[1], 'drawer ' + r); });
  const errs = [...L.realErrs(S.log), ...L.realErrs(B.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await S.b.close(); await B.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

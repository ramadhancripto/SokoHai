// [AUCTION-LIVE] Final visual proof: desktop + landscape room (emulator).
const { seed, L, PW } = require('./review-seed.cjs');
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'out', 'auction-live-impl-');
async function open(w, h) {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.route(/api\.cloudinary\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secure_url: L.BASE + '/favicon.ico', public_id: 'e', resource_type: 'image' }) }));
  await p.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => { const u = r.request().url(); if (u.includes('gstatic.com/firebasejs/10.8.1/') || u.includes('api.cloudinary.com')) return r.fallback(); r.abort(); });
  p.on('dialog', d => d.accept().catch(() => {}));
  await p.goto(L.BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.skh && window.skh.auth && window.skh.emulator, null, { timeout: 45000 });
  await p.waitForTimeout(2500);
  return { b, p };
}
(async () => {
  await seed();
  const uidOf = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const juma = await uidOf('juma.review@sokohai.test');
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  const now = Date.now(), img = L.BASE + '/assets/img/categories/elektroniki.webp';
  await L.db.doc('products/dauc').set({ userId: juma, ownerName: 'Juma Electronics', sellerName: 'Juma Electronics', publicationStatus: 'published', availabilityStatus: 'available', condition: 'Mpya', title: 'Simu Samsung A54 · demo', price: 30000, stock: 1, image: img, imagesArray: [img], saleMode: 'auction', modeData: { mode: 'auction', startTime: now - 60000, endTime: now + 3600e3, minIncrement: 5000 } });
  const D = await open(1440, 900); await L.login(D.p, 'buyer.review@sokohai.test', PW);
  await D.p.evaluate(() => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  const S = await open(390, 844); await L.login(S.p, 'juma.review@sokohai.test', PW);
  await S.p.evaluate(() => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  const live = (await L.call(S.p, 'liveCreate', { kind: 'auction', title: 'Mnada wa simu', productIds: ['dauc'] })).data.sessionId;
  await L.call(S.p, 'liveStart', { sessionId: live });
  await L.call(S.p, 'livePause', { sessionId: live });
  await D.p.evaluate(id => window.skhLiveOpen(id), live);
  await D.p.waitForSelector('#lv7Paused:not([hidden])', { timeout: 20000 });
  await D.p.waitForTimeout(1000);
  await D.p.screenshot({ path: OUT + '16-desktop-paused.png' });
  await L.call(S.p, 'liveResume', { sessionId: live });
  await D.p.waitForFunction(() => document.getElementById('lv7Paused').hidden, null, { timeout: 15000 });
  await D.p.waitForTimeout(1000);
  await D.p.screenshot({ path: OUT + '17-desktop-live.png' });
  const M = await open(844, 390); await L.login(M.p, 'buyer.review@sokohai.test', PW);
  await M.p.evaluate(() => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  await M.p.evaluate(id => window.skhLiveOpen(id), live);
  await M.p.waitForSelector('#lv7BidCta', { timeout: 20000 });
  await M.p.waitForTimeout(1000);
  await M.p.screenshot({ path: OUT + '18-landscape.png' });
  console.log('SHOTS OK');
  await D.b.close(); await S.b.close(); await M.b.close(); process.exit(0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

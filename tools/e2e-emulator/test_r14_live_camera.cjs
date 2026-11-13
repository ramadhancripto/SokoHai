// [R14] Seller camera live — real browsers (Chromium fake camera/mic), real callables, emulator
// signalling (live_sessions/{sid}/rtc). Proves: host source "Kamera" -> liveSetVideo(webrtc),
// camera preview, viewer receives frames over WebRTC (same machine, no TURN), pause keeps the
// link, end stops the camera. NOT proof of internet-scale streaming (needs TURN/SFU, see report).
const { seed, L, PW } = require('./review-seed.cjs');
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out', 'r14-cam-'); fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const SDK = process.env.SKH_FIREBASE_SDK_DIR ? process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/') : null;
async function open(vp) {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: vp, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage(); const log = { errs: [] };
  if (SDK) await p.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(SDK + r.request().url().split('/').pop()) }));
  await p.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => { const u = r.request().url(); if (u.includes('gstatic.com/firebasejs/10.8.1/')) return r.fallback(); r.abort(); });
  p.on('pageerror', e => log.errs.push('PAGEERROR ' + e.message));
  p.on('dialog', d => d.accept(d.type() === 'prompt' ? '' : undefined).catch(() => {}));
  await p.goto(L.BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.skh && window.skh.auth && window.skh.emulator, null, { timeout: 45000 });
  await p.waitForTimeout(2000);
  return { b, p, log };
}
const ev = (p, fn, a) => p.evaluate(fn, a);
(async () => {
  await seed();
  const juma = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const S = await open(vp); await L.login(S.p, 'juma.review@sokohai.test', PW);
  const B = await open(vp); await L.login(B.p, 'buyer.review@sokohai.test', PW);
  for (const P of [S.p, B.p]) await ev(P, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  let sid;
  await L.step('seller creates + starts a live and opens the room', async () => {
    sid = (await L.call(S.p, 'liveCreate', { kind: 'live', title: 'Kamera ya duka leo', productIds: ['tv55a'] })).data.sessionId;
    L.assert((await L.call(S.p, 'liveStart', { sessionId: sid })).ok, 'start');
    await ev(S.p, (s) => skhLiveOpen(s), sid); await S.p.waitForSelector('#lv7SrcCam', { timeout: 20000 }); return sid; });
  await L.step('host chooses "Kamera": liveSetVideo(webrtc) + camera preview has frames', async () => {
    await S.p.click('#lv7SrcCam');
    await S.p.waitForFunction(() => { const v = document.getElementById('lv7CamPrev'); return v && v.srcObject && v.videoWidth > 0; }, null, { timeout: 20000 });
    const kind = (await L.db.doc('live_sessions/' + sid).get()).data().video.kind; L.assert(kind === 'webrtc', kind);
    await S.p.screenshot({ path: OUT + 'host.png' }); return 'video.kind=' + kind; });
  await L.step('viewer receives the camera over WebRTC (frames decoded)', async () => {
    await ev(B.p, (s) => skhLiveOpen(s), sid);
    await B.p.waitForFunction(() => { const v = document.getElementById('lv7Remote'); return v && v.srcObject && v.videoWidth > 0 && v.currentTime > 0; }, null, { timeout: 40000 });
    const st = await ev(B.p, () => { const v = document.getElementById('lv7Remote'); return v.videoWidth + 'x' + v.videoHeight; });
    await B.p.screenshot({ path: OUT + 'viewer.png' }); return st; });
  await L.step('host mutes mic and turns camera off/on (controls really change the tracks)', async () => {
    await S.p.click('#lv7MicBtn'); await S.p.waitForTimeout(800);
    const mic = await ev(S.p, () => skhLiveVideo.state().mic); L.assert(mic === false, 'mic ' + mic);
    await S.p.click('#lv7CamBtn'); await S.p.waitForTimeout(800);
    const cam = await ev(S.p, () => skhLiveVideo.state().cam); L.assert(cam === false, 'cam ' + cam);
    await S.p.click('#lv7CamBtn'); await S.p.waitForTimeout(800);
    L.assert(await ev(S.p, () => skhLiveVideo.state().cam) === true, 'cam back on'); });
  await L.step('pause keeps the link; viewer sees IMESITISHWA; resume', async () => {
    await ev(S.p, () => skhLiveHost('pause')); await B.p.waitForFunction(() => /IMESITISHWA/.test(document.getElementById('lv7Status').textContent), null, { timeout: 15000 });
    const still = await ev(B.p, () => { const v = document.getElementById('lv7Remote'); return !!(v && v.srcObject); }); L.assert(still, 'stream kept while paused');
    await ev(S.p, () => skhLiveHost('resume')); await B.p.waitForFunction(() => /LIVE/.test(document.getElementById('lv7Status').textContent) && !/IMESITISHWA/.test(document.getElementById('lv7Status').textContent), null, { timeout: 15000 }); });
  await L.step('host ends the live: session ended, host camera tracks stopped', async () => {
    await ev(S.p, () => skhLiveHost('end')); await S.p.waitForTimeout(2500);
    const st = (await L.db.doc('live_sessions/' + sid).get()).data().status; L.assert(st === 'ended', st);
    const live = await ev(S.p, () => { const s = window.skhLiveVideo && skhLiveVideo.provider && skhLiveVideo.provider.stream; return s ? s.getTracks().filter(t => t.readyState === 'live').length : 0; });
    L.assert(live === 0, 'live tracks ' + live);
    await B.p.waitForFunction(() => /IMEKWISHA/.test(document.getElementById('lv7Status').textContent), null, { timeout: 15000 }); return 'status=' + st; });
  const errs = [...S.log.errs, ...B.log.errs]; console.log('JS errors:', errs.length, errs.slice(0, 5).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await S.b.close(); await B.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

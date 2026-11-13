// [R15] Push UI — real browser + emulator. FCM itself cannot be reached from a test machine, so this
// proves the parts that do not need Google: the "Arifa za simu" panel inside "Taarifa Zako", honest
// messages when push is not configured / no service worker, no permission prompt without a tap,
// logout without a token makes no calls, and /?notif=<id> opens the notification centre.
const L = require('./lib.cjs');
const { seed, PW } = require('./review-seed.cjs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'r15-push-');
(async () => {
  await seed();
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const P = await L.open(vp);
  let prompts = 0; await P.p.exposeFunction('__permAsked', () => { prompts++; });
  await P.p.evaluate(() => { const o = Notification.requestPermission; Notification.requestPermission = function () { window.__permAsked(); return o.apply(Notification, arguments); }; try { unlockSystem(); closeWelcome(); } catch (e) {} });
  await L.login(P.p, 'buyer.review@sokohai.test', PW);
  await L.step('"Taarifa Zako" shows the push panel; without a VAPID key it says push is not set up yet (button disabled)', async () => {
    await P.p.evaluate(() => window.openNotifications());
    await P.p.waitForSelector('#skhPushPanel #skhPushBtn', { timeout: 15000 });
    const st = await P.p.evaluate(() => ({ dis: document.getElementById('skhPushBtn').disabled, msg: document.getElementById('skhPushMsg').textContent }));
    L.assert(st.dis && /hazijawekwa/.test(st.msg), JSON.stringify(st)); L.assert(prompts === 0, 'permission asked without a tap');
    await P.p.screenshot({ path: OUT + 'panel.png' }); return st.msg; });
  await L.step('with a VAPID key but no service worker (dev host): honest message, still no permission prompt', async () => {
    await P.p.evaluate(() => { window.SKH_FCM_VAPID = 'BTestVapidKeyOnlyForTheE2E'; closeModals(); window.openNotifications(); });
    await P.p.waitForFunction(() => /toleo la mtandaoni/.test((document.getElementById('skhPushMsg') || {}).textContent || ''), null, { timeout: 15000 });
    L.assert(prompts === 0, 'prompted'); });
  await L.step('the panel is inside the dialog and fits the screen (no horizontal overflow)', async () => {
    const r = await P.p.evaluate(() => { const b = document.getElementById('skhPushPanel').getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth, sw: document.documentElement.scrollWidth }; });
    L.assert(r.l >= 0 && r.r <= r.w && r.sw <= r.w, JSON.stringify(r)); });
  await L.step('/?notif=<id> opens "Taarifa Zako" after load and cleans the URL', async () => {
    await P.p.goto(L.BASE + '/?notif=abc123', { waitUntil: 'domcontentloaded' });
    await P.p.waitForFunction(() => window.skh && skh.currentUser, null, { timeout: 45000 });
    await P.p.waitForFunction(() => { const m = document.getElementById('notifModal'); return m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 30000 });
    L.assert(!/notif=/.test(P.p.url()), P.p.url()); });
  await L.step('logout on a device that never enabled push: no push call, logout completes', async () => {
    const calls = []; P.p.on('request', r => { if (/pushUnregisterToken/.test(r.url())) calls.push(r.url()); });
    await P.p.evaluate(() => closeModals());
    await P.p.evaluate(() => window.skhPushOnLogout());
    L.assert(calls.length === 0, 'calls ' + calls.length); });
  const errs = L.realErrs(P.log); console.log('JS errors:', errs.length, errs.slice(0, 5).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await P.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

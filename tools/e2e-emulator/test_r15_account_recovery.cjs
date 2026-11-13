// [R15] Account recovery — real browser, real Firebase Auth EMULATOR (reset e-mails are read from
// the emulator's oobCodes endpoint; nothing is sent to a real inbox). Proves: neutral message for
// existing AND unknown e-mails (no account enumeration), per-device rate limit, the in-app
// reset page (mode=resetPassword&oobCode) sets a new password, the new password logs in, the old one
// fails, an invalid / reused code is refused. NOT proof of real e-mail delivery (needs the live
// Firebase project's e-mail template + authorised domain, see the R15 report).
const L = require('./lib.cjs');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out', 'r15-reset-');
const EMAIL = 'reset.review@sokohai.test', OLD = 'Passw0rd!old', NEW = 'NewPassw0rd!r15';
const OOB = 'http://127.0.0.1:9099/emulator/v1/projects/demo-sokohai/oobCodes';
const shown = async (p) => p.evaluate(() => { const o = document.querySelector('.skd-ov'); return o ? o.innerText : ''; });
async function dismiss(p) { if (await p.$('.skd-ov .skd-yes')) await p.click('.skd-ov .skd-yes').catch(() => {}); await p.waitForTimeout(300); }
async function msgAfterReset(P) {
  const before = P.log.alerts.length;
  await P.p.evaluate(() => window.doResetPassword());
  await P.p.waitForTimeout(2500);
  const t = (P.log.alerts.slice(before).join(' ') + ' ' + await shown(P.p)).trim();
  await dismiss(P.p); return t;
}
async function codesFor(email) { const r = await (await fetch(OOB)).json(); return (r.oobCodes || []).filter(c => c.email === email && c.requestType === 'PASSWORD_RESET'); }
const tryLogin = (p, e, pw) => p.evaluate(async ([e, pw]) => { try { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); const u = window.skh.auth.currentUser.uid; await window.skh.auth.signOut(); return { ok: true, uid: u }; } catch (x) { return { ok: false, code: x.code }; } }, [e, pw]);
(async () => {
  try { await L.admin.auth().deleteUser((await L.admin.auth().getUserByEmail(EMAIL)).uid); } catch (e) {}
  await L.admin.auth().createUser({ email: EMAIL, password: OLD, displayName: 'Reset Review', emailVerified: true });
  await fetch(OOB, { method: 'DELETE' }).catch(() => {});
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const P = await L.open(vp);
  await P.p.evaluate(() => { try { localStorage.removeItem('skh_reset_at'); unlockSystem(); closeWelcome(); } catch (e) {} });
  let neutral = '';
  await L.step('"Umesahau Nenosiri?" with an empty e-mail asks for the e-mail first (no request sent)', async () => {
    await P.p.evaluate(() => { openAuthModal && openAuthModal(); document.getElementById('loginEmail').value = ''; });
    const t = await msgAfterReset(P); L.assert(/Andika barua pepe/.test(t), t);
    L.assert((await codesFor(EMAIL)).length === 0, 'no code'); return t.slice(0, 60); });
  await L.step('existing account: neutral message + one reset code issued by Auth', async () => {
    await P.p.fill('#loginEmail', EMAIL);
    neutral = await msgAfterReset(P); L.assert(/Kama akaunti yenye barua pepe hii ipo/.test(neutral), neutral);
    const c = await codesFor(EMAIL); L.assert(c.length === 1, 'codes ' + c.length);
    await P.p.screenshot({ path: OUT + 'requested.png' }); return 'codes=1'; });
  await L.step('second request inside 60 s is rate-limited on this device (no new code)', async () => {
    const t = await msgAfterReset(P); L.assert(/Subiri dakika moja/.test(t), t);
    L.assert((await codesFor(EMAIL)).length === 1, 'still 1'); });
  await L.step('unknown e-mail gets the SAME neutral message (no account enumeration)', async () => {
    await P.p.evaluate(() => { try { localStorage.removeItem('skh_reset_at'); } catch (e) {} });
    await P.p.fill('#loginEmail', 'nobody.r15@sokohai.test');
    const t = await msgAfterReset(P); L.assert(t === neutral, JSON.stringify([t, neutral])); });
  let code;
  await L.step('invalid code: reset page refuses and shows a Swahili error', async () => {
    await P.p.goto(L.BASE + '/?mode=resetPassword&oobCode=NOT-A-REAL-CODE', { waitUntil: 'domcontentloaded' });
    await P.p.waitForSelector('#skhResetPass #skhRpMsg', { timeout: 30000 });
    const t = await P.p.textContent('#skhRpMsg'); L.assert(/si sahihi|imeisha/.test(t), t); return t; });
  await L.step('real link opens the in-app page with a masked e-mail; weak + mismatched passwords are refused', async () => {
    code = (await codesFor(EMAIL))[0].oobCode;
    await P.p.goto(L.BASE + '/?mode=resetPassword&oobCode=' + encodeURIComponent(code), { waitUntil: 'domcontentloaded' });
    await P.p.waitForSelector('#skhRpP1', { timeout: 30000 });
    const txt = await P.p.textContent('#skhResetPass'); L.assert(/r\*+@sokohai\.test/.test(txt) && txt.indexOf(EMAIL) === -1, 'masked: ' + txt);
    await P.p.fill('#skhRpP1', 'short'); await P.p.fill('#skhRpP2', 'short'); await P.p.click('#skhRpGo');
    L.assert(/herufi 8/.test(await P.p.textContent('#skhRpMsg')), 'weak');
    await P.p.fill('#skhRpP1', NEW); await P.p.fill('#skhRpP2', NEW + 'x'); await P.p.click('#skhRpGo');
    L.assert(/hayafanani/.test(await P.p.textContent('#skhRpMsg')), 'mismatch');
    await P.p.screenshot({ path: OUT + 'form.png' }); });
  await L.step('saving the new password succeeds; the code is removed from the URL', async () => {
    await P.p.fill('#skhRpP2', NEW); await P.p.click('#skhRpGo');
    await P.p.waitForSelector('#skhRpDone', { timeout: 20000 });
    L.assert(!/oobCode/.test(P.p.url()), P.p.url()); await P.p.screenshot({ path: OUT + 'done.png' }); });
  await L.step('new password logs in; the old password is refused', async () => {
    const n = await tryLogin(P.p, EMAIL, NEW); L.assert(n.ok, JSON.stringify(n));
    const o = await tryLogin(P.p, EMAIL, OLD); L.assert(!o.ok, 'old still works'); return 'old=' + o.code; });
  await L.step('the same link cannot be used twice', async () => {
    await P.p.goto(L.BASE + '/?mode=resetPassword&oobCode=' + encodeURIComponent(code), { waitUntil: 'domcontentloaded' });
    await P.p.waitForSelector('#skhResetPass #skhRpMsg', { timeout: 30000 });
    L.assert(!(await P.p.$('#skhRpP1')), 'form shown for a used code'); return await P.p.textContent('#skhRpMsg'); });
  const errs = L.realErrs(P.log); console.log('JS errors:', errs.length, errs.slice(0, 5).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await P.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

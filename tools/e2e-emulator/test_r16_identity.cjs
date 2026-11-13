// [R16] Identity verification — real browsers on the emulator. Needs functions/local-server.js started
// with FAKE Cloudinary values (CLOUDINARY_CLOUD_NAME=demo-e2e ...), because identity documents are only
// accepted through signed, private ('authenticated') uploads. Cloudinary itself is answered by a fake
// upload route here (nothing leaves the machine). Flow: user opens their profile -> "Thibitisha
// utambulisho" -> uploads a document + last 4 characters -> pending; owner reviews it in the Admin
// Control Center (signed private link, reason) -> approves -> the user's account is verified.
const L = require('./lib.cjs');
const { seed, PW } = require('./review-seed.cjs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'r16-idv-');
const ev = (p, fn, a) => p.evaluate(fn, a);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  await seed();
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const user = (await L.admin.auth().getUserByEmail('neema.review@sokohai.test')).uid;
  await L.authUser('owner@sokohai.test', PW, 'Owner'); // super admin via SUPER_ADMIN_EMAILS on the local server
  await L.db.doc('verification_requests/' + user).delete().catch(() => {});
  await L.db.doc('users/' + user).set({ isVerified: false, verificationStatus: null }, { merge: true });
  const U = await L.open(vp); await L.login(U.p, 'neema.review@sokohai.test', PW);
  const O = await L.open(vp); await L.login(O.p, 'owner@sokohai.test', PW);
  let uploads = 0;
  await U.p.route(/api\.cloudinary\.com\/v1_1\/[^/]+\/image\/upload/, async (r) => {
    const body = r.request().postData() || '';
    const folder = (body.match(/name="folder"\r\n\r\n([^\r\n]+)/) || [])[1] || '';
    const type = (body.match(/name="type"\r\n\r\n([^\r\n]+)/) || [])[1] || 'upload';
    uploads++;
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/demo-e2e/image/' + type + '/v1700000000/' + folder + '/doc' + uploads + '.jpg', public_id: folder + '/doc' + uploads, format: 'jpg', version: 1700000000, type }) });
  });
  for (const X of [U, O]) await ev(X.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });

  await L.step('user opens their profile and the identity form (privacy note, last-4 only)', async () => {
    await ev(U.p, () => window.openProfile()); await U.p.waitForSelector('#skhIdvBtn', { timeout: 20000 });
    await U.p.click('#skhIdvBtn'); await U.p.waitForSelector('#skhIdv #skhIdvGo', { timeout: 15000 });
    await U.p.screenshot({ path: OUT + 'form.png' }); });
  await L.step('validation: last 4 and a photo are required', async () => {
    await U.p.click('#skhIdvGo'); L.assert(/4 za mwisho/.test(await U.p.textContent('#skhIdvMsg')), 'last4 msg');
    await U.p.fill('#skhIdvLast4', '7a2c'); await U.p.click('#skhIdvGo'); L.assert(/picha/.test(await U.p.textContent('#skhIdvMsg')), 'photo msg'); });
  await L.step('upload goes to the PRIVATE folder as type=authenticated; request becomes pending', async () => {
    await U.p.selectOption('#skhIdvType', 'national_id');
    await U.p.setInputFiles('#skhIdvFront', { name: 'nida.png', mimeType: 'image/png', buffer: PNG });
    await U.p.click('#skhIdvGo');
    await U.p.waitForSelector('#skhIdvStatus[data-status="pending"]', { timeout: 20000 });
    const v = (await L.db.doc('verification_requests/' + user).get()).data();
    L.assert(v.status === 'pending' && v.last4 === '7A2C' && v.docs[0].publicId.indexOf('sokohai/identity/' + user + '/') === 0, JSON.stringify(v));
    await U.p.screenshot({ path: OUT + 'pending.png' }); return v.docs[0].publicId; });
  await L.step('owner sees it in Admin Control Center -> Uthibitisho, opens the signed private link', async () => {
    await ev(O.p, () => window.skhOpenAdminControlCenter('verify'));
    await O.p.waitForSelector(`[data-idv-uid="${user}"]`, { timeout: 20000 });
    await O.p.click(`[data-idv-uid="${user}"] button:has-text("Tazama hati")`);
    await O.p.waitForSelector(`#ccIdvDocs_${user} a`, { timeout: 15000 });
    const href = await O.p.getAttribute(`#ccIdvDocs_${user} a`, 'href');
    L.assert(/\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/v1700000000\/sokohai\/identity\//.test(href), href);
    await O.p.screenshot({ path: OUT + 'admin.png' }); return 'signed link ok'; });
  await L.step('owner approves with a reason -> user verified, audited, notified; the form shows it', async () => {
    await O.p.click(`[data-idv-uid="${user}"] button:has-text("Idhinisha")`); await L.answer(O.p, 'Hati ya NIDA ni halali', 15000); await O.p.waitForTimeout(2500);
    const u = (await L.db.doc('users/' + user).get()).data(); L.assert(u.isVerified === true && u.verificationStatus === 'verified', JSON.stringify({ v: u.isVerified, s: u.verificationStatus }));
    L.assert(!(await L.db.collection('admin_audit_log').where('action', '==', 'IDENTITY_VERIFIED').get()).empty, 'audit');
    await ev(U.p, () => window.skhOpenIdentityVerification()); await U.p.waitForSelector('#skhIdvStatus[data-status="approved"]', { timeout: 15000 }); });

  const errs = [...L.realErrs(U.log), ...L.realErrs(O.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await U.b.close(); await O.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

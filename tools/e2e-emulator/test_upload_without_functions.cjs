// [UPLOAD 2026-11-15] Live failure on sokohaicom.netlify.app: Cloud Functions are not deployed (404),
// so every photo upload asked for a signature, failed and told a LOGGED-IN seller "Hakikisha umeingia".
// Here every Cloud Function answers 404 exactly like that, and a real seller publishes a product with a
// photo through the real form. Emulator only; Cloudinary is stubbed by lib.cjs.
const L = require('./lib.cjs'); const { step, assert, db, admin } = L;
(async () => {
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-sokohai/databases/(default)/documents', { method: 'DELETE' });
  const PW = 'Passw0rd!x';
  const seller = await L.authUser('seller.nofn@sokohai.test', PW, 'Juma Bila Functions');
  await admin.auth().updateUser(seller, { password: PW });
  await db.doc('users/' + seller).set({ uid: seller, fullName: 'Juma Bila Functions', email: 'seller.nofn@sokohai.test', businessSetupComplete: true, isSeller: true, createdAt: new Date().toISOString() }, { merge: true });
  const S = await L.open(); const p = S.p;
  let fnCalls = [];
  await p.route(/\/__fn\//, (r) => { fnCalls.push(r.request().url().split('/__fn/')[1]); r.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404 Page not found</h1>' }); });
  await L.login(p, 'seller.nofn@sokohai.test', PW);
  await p.evaluate(() => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  await step('logged-in seller, NO Cloud Functions: the photo still uploads (no "hakikisha umeingia")', async () => {
    const r = await p.evaluate(async () => { const f = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' }); const up = await window.skhUploadFromFile(f, { folder: 'products' }); return { url: up && up.url, err: window.skhUploadLastError, mode: window.skhUploadMode }; });
    assert(r.url && r.mode === 'unsigned-fallback' && !r.err, JSON.stringify(r));
    assert(fnCalls.some(c => /uploadSignature/.test(c)), 'signature was not even asked ' + fnCalls.join(','));
    return 'mode ' + r.mode + ', uploads ' + S.log.uploads;
  });
  await step('the real product form publishes the product with its photo', async () => {
    await p.evaluate(() => window.showForm('sellerForm')); await p.waitForTimeout(800);
    const cat = await p.evaluate(() => { const s = document.getElementById('prodCategory'); const o = [...s.options].find(o => o.value && /Electronics|Simu|Elektroniki/i.test(o.value + o.text)) || [...s.options].find(o => o.value); return o.value; });
    await p.selectOption('#prodCategory', cat); await p.waitForTimeout(400);
    const sub = await p.evaluate(() => { const s = document.getElementById('prodSubCategory'); const o = s && [...s.options].find(o => o.value); return o ? o.value : ''; });
    if (sub) await p.selectOption('#prodSubCategory', sub);
    await p.fill('#prodName', 'Simu bila functions'); await p.fill('#prodBuyPrice', '120000'); await p.fill('#prodPrice', '150000'); await p.fill('#prodStock', '4'); await p.fill('#prodLocation', 'Dar es Salaam');
    await p.fill('#prodDesc', 'Majaribio: Cloud Functions hazipo.');
    await p.locator('#prodImage').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: L.IMG });
    await p.click('#btnSeller'); await p.waitForTimeout(6000);
    const q = await db.collection('products').where('userId', '==', seller).get();
    const alerts = S.log.alerts.join(' | ');
    assert(!/Hakikisha umeingia|haikupandishwa/i.test(alerts), 'upload error shown: ' + alerts);
    assert(q.size === 1, 'product docs=' + q.size + ' alerts=' + alerts);
    const d = q.docs[0].data(); const imgs = d.imagesArray || d.images || [];
    assert(imgs.length >= 1 && /e2e=|^https:/.test(imgs[0] || d.image), 'no photo on product ' + JSON.stringify(imgs));
    return 'product ' + q.docs[0].id + ', photos ' + imgs.length + '; alert: ' + alerts.slice(0, 160);
  });
  const errs = L.realErrs(S.log).filter(e => !/404|uploadSignature|inventoryAdjust|__fn/.test(e)); console.log('JS errors:', errs.length, errs.slice(0, 5).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await S.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

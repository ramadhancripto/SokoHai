// [HARDENING 2026-11-16] Admin "Endesha sasa" (search backfill) cannot run twice.
// Real browser on the emulator: the same admin double-clicks in one tab AND clicks in a second tab at
// the same moment. Expected: exactly ONE run (one SEARCH_BACKFILL_STARTED + one SEARCH_BACKFILL audit
// row), the repeat click in the same tab is ignored, the other tab is refused by the SERVER, and the
// button shows "Inaendelea…" while the run is going.
const L = require('./lib.cjs');
const { seed, PW } = require('./review-seed.cjs');
const VP = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const ev = (p, fn, a) => p.evaluate(fn, a);
(async () => {
  await seed();
  const owner = await L.authUser('owner@sokohai.test', PW, 'Owner');
  await L.admin.auth().updateUser(owner, { password: PW });
  await L.admin.auth().setCustomUserClaims(owner, { admin: true });
  await L.db.doc('users/' + owner).set({ uid: owner, fullName: 'Owner Admin', email: 'owner@sokohai.test' }, { merge: true });
  let batch = L.db.batch();
  for (let i = 0; i < 650; i++) { batch.set(L.db.doc('products/bf' + i), { userId: owner, title: 'Bidhaa ya backfill ' + i, price: 1000 + i, stock: 1, publicationStatus: 'published', createdAt: new Date().toISOString() }); if (i % 300 === 299) { await batch.commit(); batch = L.db.batch(); } }
  await batch.commit();
  await L.db.doc('system_locks/search_backfill').delete();
  const T0 = new Date().toISOString();

  const A = await L.open(VP); await L.login(A.p, 'owner@sokohai.test', PW);
  const B = await L.open(VP); await L.login(B.p, 'owner@sokohai.test', PW);
  const prep = (p) => ev(p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} window.skhConfirm = async () => true; window.__toasts = []; const t0 = window.skhToast; window.skhToast = function (m) { window.__toasts.push(String(m)); return t0 && t0.apply(this, arguments); }; });
  await prep(A.p); await prep(B.p);
  for (const X of [A, B]) {
    await ev(X.p, () => window.skhOpenAdminControlCenter());
    await X.p.waitForFunction(() => /Ulinzi wa pesa|Muhtasari/.test((document.getElementById('skhAdminCC') || {}).textContent || ''), null, { timeout: 20000 });
    // the overview only shows the button while no run has completed; inject the same button for the check
    await ev(X.p, () => { const m = document.getElementById('skhAdminCC'); if (!m.querySelector('button[onclick*="skhAdminCCBackfill()"]')) { const b = document.createElement('button'); b.setAttribute('onclick', 'window.skhAdminCCBackfill()'); b.textContent = 'Endesha sasa'; m.appendChild(b); } });
  }

  await L.step('double click in one tab + a click in a second tab at the same moment -> ONE run', async () => {
    const pa = ev(A.p, async () => {
      const btn = document.querySelector('#skhAdminCC button[onclick*="skhAdminCCBackfill()"]');
      btn.click(); await new Promise(r => setTimeout(r, 30));
      const during = { disabled: btn.disabled, text: btn.textContent };
      btn.click(); // the browser ignores clicks on a disabled button; call the handler directly too
      await window.skhAdminCCBackfill();
      return during;
    });
    await A.p.waitForTimeout(150);
    const pb = ev(B.p, async () => { await window.skhAdminCCBackfill(); return window.__toasts.slice(); });
    const [during, toastsB] = await Promise.all([pa, pb]);
    await A.p.waitForFunction(() => window.__toasts.some(t => /Utafutaji umeandaliwa/.test(t)), null, { timeout: 240000 }).catch(async (e) => { throw new Error(e.message + ' toasts A=' + JSON.stringify(await ev(A.p, () => window.__toasts))); });
    const toastsA = await ev(A.p, () => window.__toasts.slice());
    L.assert(during.disabled && /Inaendelea/.test(during.text), 'button not locked: ' + JSON.stringify(during));
    L.assert(toastsA.some(t => /tayari unaendelea/.test(t)), 'repeat click in the same tab not ignored: ' + JSON.stringify(toastsA));
    L.assert(toastsB.some(t => /tayari unaendelea/.test(t)), 'second tab not refused: ' + JSON.stringify(toastsB));
    const rows = (await L.db.collection('admin_audit_log').where('createdAt', '>=', T0).get()).docs.map(d => d.data());
    const started = rows.filter(r => r.action === 'SEARCH_BACKFILL_STARTED'), done = rows.filter(r => r.action === 'SEARCH_BACKFILL'), refused = rows.filter(r => r.action === 'SEARCH_BACKFILL_REFUSED');
    L.assert(started.length === 1 && done.length === 1, `started=${started.length} completed=${done.length}`);
    L.assert(done[0].details.runId === started[0].details.runId && done[0].details.pages >= 3, JSON.stringify(done[0].details));
    L.assert(refused.length >= 1, 'refusal not audited');
    const lock = (await L.db.doc('system_locks/search_backfill').get()).data();
    L.assert(lock.status === 'completed' && !lock.pageInFlight, JSON.stringify(lock));
    const btnAfter = await ev(A.p, () => { const b = document.querySelector('#skhAdminCC button[onclick*="skhAdminCCBackfill()"]'); return b ? { disabled: b.disabled, text: b.textContent } : null; });
    L.assert(!btnAfter || !btnAfter.disabled, 'button stayed locked');
    return `1 run (${done[0].details.pages} pages, ${done[0].details.scanned} scanned), ${refused.length} duplicate start(s) refused`;
  });
  await L.step('a second run after completion is allowed (it is idempotent)', async () => {
    await ev(A.p, () => window.skhAdminCCBackfill());
    const n = (await L.db.collection('admin_audit_log').where('createdAt', '>=', T0).get()).docs.filter(d => d.data().action === 'SEARCH_BACKFILL').length;
    L.assert(n === 2, 'completed runs ' + n); return 'completed runs: ' + n;
  });
  console.log('js errors A', JSON.stringify(L.realErrs(A.log).slice(0, 5)), 'B', JSON.stringify(L.realErrs(B.log).slice(0, 5)));
  await A.b.close(); await B.b.close();
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

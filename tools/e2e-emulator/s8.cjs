/* [2026-11-06] Business OS sweep: every sidebar item (tab or action) of the seller
 * Business OS at 6 viewports. Checks: the item opens something visible (workspace
 * content or a modal), no page errors, no "action failed" toast, no horizontal scroll,
 * no literal "undefined"/"NaN"/"[object Object]" rendered. Emulator only. */
const L = require('./lib.cjs'); const { step, assert } = L;
const PW = 'Passw0rd!x';
const VIEWS = [['xs', { width: 320, height: 640 }], ['phone', { width: 390, height: 844 }], ['phone-l', { width: 430, height: 932 }],
  ['tablet', { width: 820, height: 1180 }], ['laptop', { width: 1366, height: 800 }], ['desktop', { width: 1920, height: 1080 }]];
const ONLY = process.env.S8_VIEWS ? process.env.S8_VIEWS.split(',') : null;
async function ensureBusiness() {
  // The seller from s1/s2 has not run shop setup yet; Business OS requires it (switchMode guard).
  const uid = (await L.admin.auth().getUserByEmail('seller@sokohai.test')).uid;
  await L.db.doc('users/' + uid).set({ businessSetupComplete: true, businessName: 'Duka la E2E', businessType: 'retail' }, { merge: true });
}
async function sweep(vn, vp) {
  const B = await L.open(vp); await L.login(B.p, 'seller@sokohai.test', PW); const issues = []; let n = 0;
  await B.p.evaluate(() => window.switchMode && window.switchMode('seller')); await B.p.waitForTimeout(2500);
  const items = await B.p.evaluate(() => {
    const nav = document.getElementById('bosSidebar'); if (!nav) return null;
    return [...nav.querySelectorAll('button[data-bos-tab], button[data-bos-action]')].map(b => ({ tab: b.getAttribute('data-bos-tab'), action: b.getAttribute('data-bos-action'), arg: b.getAttribute('data-bos-arg'), label: (b.textContent || '').trim().slice(0, 40) }));
  });
  if (!items) { await B.b.close(); return { n: 0, issues: ['Business OS sidebar (#bosSidebar) not rendered in seller mode'] }; }
  const seen = new Set();
  for (const it of items) {
    const key = (it.tab || '') + '|' + (it.action || '') + '|' + (it.arg || ''); if (seen.has(key)) continue; seen.add(key); n++;
    const before = L.realErrs(B.log).length;
    await B.p.evaluate(() => { window.closeModals && window.closeModals(); document.querySelectorAll('.skd-ov').forEach(e => e.remove()); document.querySelectorAll('.skh-toast').forEach(e => e.remove()); });
    await B.p.evaluate(it => { if (it.action && !it.tab) window.skhBOSRunAction(it.action, it.arg || undefined); else window.skhBOSNav(it.tab, it.action || undefined, it.arg || undefined); }, it);
    await B.p.waitForTimeout(1800);
    const m = await B.p.evaluate(() => {
      const ws = document.getElementById('dashWorkspace');
      const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 40 && r.height > 40 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const modals = [...document.querySelectorAll('.modal, .form-box, .skd-ov, [role=dialog], .skh-acc, #adminControlCenter')].filter(e => vis(e) && e.id !== 'dashWorkspace');
      const toastTxt = [...document.querySelectorAll('.skh-toast, [class*=toast]')].map(e => e.textContent || '').join(' | ');
      const wsText = ws ? (ws.innerText || '').trim() : '';
      const bad = /\bundefined\b|\bNaN\b|\[object Object\]/.exec(wsText + ' ' + modals.map(x => x.innerText || '').join(' '));
      return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, wsLen: wsText.length, modals: modals.length, toastTxt: toastTxt.slice(0, 160), bad: bad ? bad[0] + ' near "' + (wsText + ' ' + modals.map(x => x.innerText || '').join(' ')).slice(Math.max(0, bad.index - 40), bad.index + 20).replace(/\s+/g, ' ') + '"' : '',
        wide: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.right > window.innerWidth + 2 && cs.position !== 'fixed' && e.offsetParent !== null; }).slice(0, 3).map(e => (e.id || e.className || e.tagName).toString().slice(0, 40)) };
    });
    const name = it.label + ' [' + (it.tab || it.action) + ']';
    if (m.wsLen < 20 && m.modals === 0) issues.push(name + ': nothing visible opened');
    if (it.tab === 'overview') {
      const ovErr = await B.p.evaluate(() => { const e = document.querySelector('#dashWorkspace .bos-error'); return e ? e.innerText.replace(/\s+/g, ' ').slice(0, 160) : ''; });
      if (ovErr) issues.push(name + ': overview error "' + ovErr + '"');
    }
    if (/hakikufanikiwa|failed|imeshindikana/i.test(m.toastTxt)) issues.push(name + ': toast "' + m.toastTxt + '"');
    if (m.bad) issues.push(name + ': renders ' + m.bad);
    if (m.sw > m.iw + 1) issues.push(name + `: horizontal scroll ${m.sw}>${m.iw} [${m.wide.join(', ')}]`);
    const errs = L.realErrs(B.log).slice(before); if (errs.length) issues.push(name + ': ' + errs[0].slice(0, 200));
    await B.p.screenshot({ path: `${L.SCR}/e2e/bos-${vn}-${(it.tab || it.action)}${it.arg ? '-' + it.arg : ''}.png` });
  }
  // Back navigation: phone/browser back returns to the previous Business OS tab (not out of the app).
  await B.p.evaluate(() => { window.closeModals && window.closeModals(true); });
  await B.p.evaluate(() => window.switchMode('seller')); await B.p.waitForTimeout(2500);
  for (const t of ['overview', 'my_products', 'expenses']) { await B.p.evaluate(t => window.switchDashTab(t), t); await B.p.waitForTimeout(700); }
  await B.p.evaluate(() => history.back()); await B.p.waitForTimeout(1200);
  const b1 = await B.p.evaluate(() => window.activeDashboardTab);
  await B.p.evaluate(() => history.back()); await B.p.waitForTimeout(1200);
  const b2 = await B.p.evaluate(() => window.activeDashboardTab && document.getElementById('bosSidebar') ? window.activeDashboardTab : 'LEFT_APP');
  if (b1 !== 'my_products' || b2 !== 'overview') issues.push(`back navigation: expected my_products→overview, got ${b1}→${b2}`);
  // Header stays one line (no wrap) and icons are visible.
  const hdr = await B.p.evaluate(() => { const h = document.querySelector('.bos-header'); const ic = [...document.querySelectorAll('.bos-icon-btn svg')].map(e => Math.round(e.getBoundingClientRect().width)); return { h: Math.round(h.getBoundingClientRect().height), ic }; });
  if (hdr.h > 80) issues.push('header wraps: ' + hdr.h + 'px tall');
  if (hdr.ic.some(w => w < 14)) issues.push('header icons squashed: ' + hdr.ic.join(','));
  await B.b.close(); return { n, issues };
}
(async () => {
  await ensureBusiness();
  for (const [vn, vp] of VIEWS) {
    if (ONLY && !ONLY.includes(vn)) continue;
    const r = await sweep(vn, vp);
    await step(`25 Business OS ${vn} ${vp.width}px: ${r.n} sidebar items open, no errors/overflow/raw values`, async () => { assert(r.n > 0 && !r.issues.length, r.issues.join(' || ')); return 'ok'; });
  }
})();

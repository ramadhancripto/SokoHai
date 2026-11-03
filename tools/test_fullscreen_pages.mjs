/* ============================================================
 * SOKOHAI — FULL-SCREEN PAGES regression
 * Huhakiki kwamba kila ukurasa unaojitegemea unachukua SKRINI YOTE
 * (hakuna "part" inayobaki, hakuna kadi ndogo yenye nafasi tupu nyuma),
 * maudhui yanabaki kwenye safu inayosomeka, na hakuna mlipuko wa upana.
 *
 * Endesha:  source /home/user/pw.sh && node tools/test_fullscreen_pages.mjs
 * ============================================================ */
import { chromium } from 'playwright';

const PAGES = [
  ['chatListModal', 'chat inbox'],
  ['chatModal', 'mazungumzo'],
  ['productModal', 'bidhaa'],
  ['sellerProfileModal', 'duka la muuzaji'],
  ['mySokoHaiModal', 'MySokoHai'],
  ['buyerOrdersModal', 'oda zangu'],
  ['notifModal', 'taarifa'],
  ['savedItemsModal', 'vitu vilivyohifadhiwa'],
  ['cartModal', 'kikapu'],
  ['escrowModal', 'usimamizi wa oda'],
  ['requestInboxModal', 'maombi'],
  ['routeMatchModal', 'njia / magari'],
  ['rideRequestModal', 'omba usafiri'],
  ['directHireModal', 'ajiri moja kwa moja'],
  ['deliveriesModal', 'mizigo'],
  ['tripsModal', 'safari'],
  ['logisticsTokenModal', 'token za mzigo'],
  ['tokenBoxModal', 'sanduku la mikode'],
  ['unifiedTokenCenterModal', 'token center'],
  ['procurementModal', 'procurement'],
  ['repairModal', 'rejareja / repair'],
  ['industrialProjectModal', 'miradi'],
  ['printingServiceModal', 'uchapishaji'],
  ['scrapYardModal', 'scrap yard'],
  ['offlineStockModal', 'stoo ya nje ya mtandao'],
  ['stockTransferModal', 'mhamisho wa stock'],
  ['shopLedgerModal', 'daftari la duka'],
  ['shopSetupModal', 'setup biashara'],
  ['sellerTypeModal', 'aina ya muuzaji'],
  ['adminSettingsModal', 'admin settings'],
  ['advertiserDashboardModal', 'advertiser dashboard'],
  ['userPaymentModal', 'malipo'],
  ['sokopayDepositModal', 'weka pesa']
];

/* Dialog ndogo kwa makusudi (chaguo/uthibitisho wa haraka) — hazipimwi hapa. */

const b = await chromium.launch({ args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + JSON.stringify(d))); };

for (const vp of [{ width: 1280, height: 900, tag: 'desktop' }, { width: 1024, height: 800, tag: 'laptop' }, { width: 390, height: 844, tag: 'mobile' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.tag === 'mobile', hasTouch: vp.tag === 'mobile' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  const w = await p.$('button:has-text("ENDELEA NDANI")');
  if (w) { try { await w.click({ timeout: 1500 }); } catch (e) {} }
  await p.waitForTimeout(1000);

  console.log(`\n[${vp.tag} ${vp.width}×${vp.height}]`);
  const data = await p.evaluate((PAGES) => {
    const R = e => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    const out = [];
    for (const [id, label] of PAGES) {
      const el = document.getElementById(id);
      if (!el) { out.push({ id, label, missing: true }); continue; }
      const prev = { display: el.style.display, z: el.style.zIndex };
      el.style.display = 'flex'; el.style.zIndex = '999999';
      const sheet = el.firstElementChild;
      const cs = sheet ? getComputedStyle(sheet) : null;
      const ov = R(el);
      out.push({
        id, label,
        overlay: ov,
        sheet: sheet ? R(sheet) : null,
        radius: cs ? cs.borderTopLeftRadius : null,
        shadow: cs ? cs.boxShadow : null,
        hOverflow: sheet ? sheet.scrollWidth > sheet.clientWidth + 2 : false,
        vScroll: sheet ? cs.overflowY : null,
        contentTop: sheet ? Math.round(sheet.getBoundingClientRect().top) : 0
      });
      el.style.display = prev.display || 'none'; el.style.zIndex = prev.z || '';
    }
    return { vw: window.innerWidth, vh: window.innerHeight, out };
  }, PAGES);

  const found = data.out.filter(r => !r.missing);
  ok('kurasa zote zipo kwenye DOM', found.length === PAGES.length, data.out.filter(r => r.missing).map(r => r.id));

  for (const r of found) {
    const tag = r.label.padEnd(24);
    const fullH = Math.abs(r.overlay.h - data.vh) <= 2;
    const fullW = Math.abs(r.overlay.w - data.vw) <= 2;
    ok(`${tag} overlay = skrini yote`, fullH && fullW, [r.overlay, [data.vw, data.vh]]);
    ok(`${tag} sheet = skrini yote`, r.sheet && Math.abs(r.sheet.h - data.vh) <= 2 && r.sheet.w >= data.vw - 2, r.sheet);
    ok(`${tag} pembe 0 (hakuna kadi inayoelea)`, r.radius === '0px' || r.radius === '0', r.radius);
    ok(`${tag} hakuna mlipuko wa upana`, !r.hOverflow, r.hOverflow);
  }
  await ctx.close();
}
await b.close();
console.log(`\nFULL-SCREEN PAGES: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

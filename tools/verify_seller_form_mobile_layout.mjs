/**
 * SokoHai — uthibitisho wa mpangilio wa fomu ya muuzaji kwenye simu.
 *
 * HATARI: hii SI test inayojumuishwa kwenye `npm test` (inahitaji Chromium halisi).
 * Tumia wewe mwenyewe:  node tools/verify_seller_form_mobile_layout.mjs
 *
 * Inafungua app kwenye dev server (chaguo-msingi http://127.0.0.1:8080), inafuata
 * mtiririko halisi wa mtumiaji — (+) → Bidhaa Sokoni → Soko Huru — kisha inapima:
 *   1. fomu haigusi wala kuingia chini ya bottom nav (nafasi >= 0),
 *   2. kichwa cha fomu kiko ndani ya kioo,
 *   3. hakuna horizontal overflow,
 *   4. fomu inasogea ndani yake (scroll) badala ya kuvuja nje.
 * Inarudisha exit code 1 kama moja ya vipimo haipiti.
 */
import { chromium } from 'playwright';

const BASE = process.env.SKH_BASE || 'http://127.0.0.1:8080';
const WIDTHS = [[320, 568], [360, 640], [390, 844]];
const TOLERANCE = 0; // px — fomu lazima iishie juu ya nav, si kugusa

let browser;
try { browser = await chromium.launch(); }
catch (e) { console.error('Chromium haipo. Endesha: npx playwright install chromium'); process.exit(2); }

let failed = 0;
for (const [w, h] of WIDTHS) {
  const ctx = await browser.newContext({ viewport:{ width:w, height:h }, isMobile:true, hasTouch:true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { window.skh.requireAuth = () => true; });
  await p.evaluate(() => window.togglePlusMenu ? window.togglePlusMenu()
    : document.querySelector('[onclick*="togglePlusMenu"]').click());
  await p.waitForTimeout(400);
  await p.locator('#mainMenu .menu-item', { hasText:'Bidhaa Sokoni' }).first().click();
  await p.waitForTimeout(600);
  await p.locator('.skst-type[data-type="free_market"]').click();
  await p.waitForTimeout(800);

  const m = await p.evaluate(() => {
    const f = document.getElementById('sellerForm');
    const nav = document.querySelector('.bottom-nav-main');
    const fr = f.getBoundingClientRect(), nr = nav.getBoundingClientRect();
    const h3 = f.querySelector('h3').getBoundingClientRect();
    return {
      gap: Math.round(nr.top - fr.bottom),
      headerOk: h3.top >= 0 && h3.bottom <= window.innerHeight,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      scrollInside: f.scrollHeight > f.clientHeight,
      top: Math.round(fr.top)
    };
  });

  const checks = [
    ['fomu juu ya bottom nav', m.gap >= TOLERANCE, `nafasi ${m.gap}px`],
    ['kichwa cha fomu kiona',   m.headerOk,             `juu ya fomu ${m.top}px`],
    ['hakuna horizontal overflow', m.overflowX === 0,   `${m.overflowX}px`],
    ['fomu inasogea ndani',     m.scrollInside,         'scroll-y ndani ya fomu']
  ];
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? '  ✓' : '  ✗'} ${w}×${h} · ${name} (${detail})`);
    if (!ok) failed++;
  }
  await ctx.close();
}
await browser.close();
console.log(failed === 0 ? '\nZOTE ZIMEPITA' : `\nZIMESHINDWA: ${failed}`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/* Stage 5 review — screenshots za moduli 9 kwenye app HALISI.
   ---------------------------------------------------------------------------
   HARNESS: hakuna backend kwenye sandbox. Tunatoa `dashboardCachedData` TUPU
   (arrays tupu) ili kurasa zionyeshe HALI ZAO HALISI za "hakuna data" —
   HAKUNA namba za kubuni. Ribbon inaonekana kwenye kila picha.
   Matumizi: node functions/local-server.js --static (5055) kisha:
             node tools/shots_business_os_review.mjs
*/
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.BOS_URL || 'http://127.0.0.1:5055/';
const OUT = process.env.REVIEW_SHOTS || '/home/user/sokohai-business-os/shots/review-9-modules';
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ args: ['--no-sandbox'] });

async function boot(width, height) {
  const page = await b.newPage({ viewport: { width, height } });
  page.on('pageerror', () => { });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.skhBOS && !!window.skhRenderBusinessOSShell, null, { timeout: 30000 });
  await page.evaluate(() => {
    /* Data tupu — kurasa zionyeshe empty state zao halisi, si namba za kubuni */
    window.dashboardCachedData = {
      prodSnap: [], ledgerSnap: [], staffSnap: [], ordersSnap: [], salesSnap: [],
      activeDebts: 0, totalSales: 0, totalRevenue: 0, totalExpenses: 0
    };
    const host = document.createElement('div');
    host.id = 'reviewHost';
    host.style.cssText = 'position:fixed;inset:0;z-index:99990;background:#F8FBFA;overflow:auto';
    document.body.appendChild(host);
    window.skhRenderBusinessOSShell(host);
    /* ribbon ya wazi: picha ya jaribio, si data halisi */
    const rib = document.createElement('div');
    rib.id = 'reviewRibbon';
    rib.textContent = 'PICHA YA JARIBIO — data tupu (hakuna namba za kubuni)';
    rib.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:100000;background:#18352D;color:#fff;'
      + 'font:800 10.5px Inter,system-ui,sans-serif;padding:5px 9px;border-radius:8px;letter-spacing:.3px;opacity:.9';
    document.body.appendChild(rib);
  });
  return page;
}

async function shot(page, name) {
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log('  shot:', name);
}

/* Kila picha inachukuliwa kwenye ukurasa MPYA (fresh boot) ili kuepuka
   race ya async renderers (overview inaendelea kupakia baada ya kubadili tab). */
async function capture(file, setup, opts) {
  const o = opts || {};
  const page = await boot(o.width || 1440, o.height || 950);
  await page.evaluate(setup);
  await page.waitForTimeout(o.wait || 1400);
  if (o.drawer) {
    await page.evaluate(() => {
      const nav = document.getElementById('bosSidebar');
      if (nav) { nav.classList.add('active'); nav.style.transform = 'translateX(0)'; }
      const sc = document.getElementById('bosNavScroll'); if (sc) sc.scrollTop = 0;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    });
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: false });
  console.log('  shot:', file);
  await page.close();
}

/* 1. Sidebar nzima (moduli 9, zote zimefungwa) */
await capture('01-sidebar-moduli-9-1440', () => {
  const nav = document.getElementById('bosSidebar');
  nav.querySelectorAll('.bos-nav-group:not(.is-collapsed) [data-bos-group-toggle]').forEach(x => x.click());
  const sc = document.getElementById('bosNavScroll'); if (sc) sc.scrollTop = 0;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
});

/* 2. Dashboard Kuu (landing) */
await capture('02-dashboard-kuu-1440', () => { window.switchDashTab('overview'); });

/* 3. Fedha na Uhasibu */
await capture('03-fedha-na-uhasibu-1440', () => { window.switchDashTab('expenses'); });

/* 4. Stoo na Usafirishaji (sub-moduli A/B/C) */
await capture('04-stoo-na-usafirishaji-1440', () => {
  window.switchDashTab('inventory');
  const nav = document.getElementById('bosSidebar');
  const g = nav.querySelector('[data-bos-group="stock"]');
  if (g.classList.contains('is-collapsed')) nav.querySelector('[data-bos-group="stock"] [data-bos-group-toggle]').click();
  const sc = document.getElementById('bosNavScroll'); if (sc) sc.scrollTop = 0;
});

/* 5. POS (Moduli 8) — ukurasa kamili */
await capture('05-pos-1440', () => { window.switchDashTab('pos_page'); });

/* 6. Rasilimali Watu */
await capture('06-rasilimali-watu-1440', () => { window.switchDashTab('staff'); });

/* 7-10. tablet + simu */
await capture('07-pos-768', () => { window.switchDashTab('pos_page'); }, { width: 768, height: 1000 });
await capture('08-pos-390', () => { window.switchDashTab('pos_page'); }, { width: 390, height: 844 });
await capture('09-sidebar-390', () => {
  const nav = document.getElementById('bosSidebar');
  nav.querySelectorAll('.bos-nav-group:not(.is-collapsed) [data-bos-group-toggle]').forEach(x => x.click());
}, { width: 390, height: 844, drawer: true });
await capture('10-stoo-390', () => {
  window.switchDashTab('inventory');
  const nav = document.getElementById('bosSidebar');
  const g = nav.querySelector('[data-bos-group="stock"]');
  if (g.classList.contains('is-collapsed')) nav.querySelector('[data-bos-group="stock"] [data-bos-group-toggle]').click();
}, { width: 390, height: 844, drawer: true });

await b.close();
console.log('\nScreenshots zimehifadhiwa: ' + OUT);

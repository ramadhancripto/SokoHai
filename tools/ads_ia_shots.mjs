import { chromium } from 'playwright';
const TEST_UID = 'eLxmcTphB8RSFCDRdT0wSYbeFEN2';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, locale: 'sw-TZ' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5200);
const gate = p.locator('button:has-text("ENDELELA NDANI"), button:has-text("ENDELEA NDANI")').first();
if (await gate.count()) await gate.click().catch(()=>{});
await p.waitForTimeout(1200);
await p.evaluate((uid) => {
  window.skh.currentUser = { uid, email: 'demo.seller@example.test', displayName: 'Demo Seller' };
  const base = { advertiserId: uid, entityType: 'product', brandName: 'Demo Seller', viewCount: 1240, clickCount: 37,
    placements: ['home', 'search'], targetRegions: ['dar es salaam'], goals: { dailyImpressions: 2000, totalImpressions: 40000 } };
  window.__fixtures = [
    Object.assign({}, base, { id: 'F1', headline: 'Set ya vitanda — Ofa', moderationStatus: 'pending', status: 'draft' }),
    Object.assign({}, base, { id: 'F2', headline: 'Graphic designing', entityType: 'service', moderationStatus: 'approved', status: 'published', active: true, viewCount: 5210, clickCount: 210, placements: ['service_detail'] }),
    Object.assign({}, base, { id: 'F3', headline: 'Dar → Tabora', entityType: 'transport', moderationStatus: 'approved', status: 'published', active: false, viewCount: 890, clickCount: 12, placements: ['home'] }),
    Object.assign({}, base, { id: 'F4', headline: 'Simu mpya', moderationStatus: 'rejected', status: 'draft' }),
    Object.assign({}, base, { id: 'F6', headline: 'Viatu vya watoto', moderationStatus: 'draft', status: 'draft' })
  ];
  window.skhOpenMarketplaceAdsStudio();
}, TEST_UID);
await p.waitForTimeout(1800);
await p.evaluate(() => {
  const s = window.skhMarketplaceAdsStudio.state;
  s.campaigns = window.__fixtures;
  window.skhMarketplaceAdsStudio._render();
});
await p.waitForTimeout(700);

const views = ['overview', 'campaigns', 'library', 'audience', 'placements', 'analytics', 'budget', 'transactions', 'notifications', 'settings'];
for (const v of views) {
  await p.evaluate(k => { window.skhMarketplaceAdsStudio.state.campaignFilter = 'all'; document.querySelector(`#masRoot [data-mas-nav="${k}"]`).click(); }, v);
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const g = document.querySelector('#welcomeGate, .welcome-gate, #skhWelcomeGate');
    if (g && getComputedStyle(g).display !== 'none') { const b = g.querySelector('button'); if (b) b.click(); g.remove(); }
  }).catch(() => {});
  await p.waitForTimeout(400);
  await p.screenshot({ path: `audit-shots/mas-ia-${v}.png` });
}
// mobile + tablet sanity for the longer rail
for (const [tag, w, h] of [['mobile', 390, 844], ['tablet', 820, 1180]]) {
  const c2 = await b.newContext({ viewport: { width: w, height: h }, locale: 'sw-TZ' });
  const p2 = await c2.newPage();
  await p2.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(5000);
  const g2 = p2.locator('button:has-text("ENDELEA NDANI")').first();
  if (await g2.count()) await g2.click().catch(()=>{});
  await p2.waitForTimeout(1000);
  await p2.evaluate((uid) => { window.skh.currentUser = { uid, email: 'x@y.test' }; window.skhOpenMarketplaceAdsStudio(); }, TEST_UID);
  await p2.waitForTimeout(1400);
  const m = await p2.evaluate(() => ({
    navItems: document.querySelectorAll('#masRoot .mas-nav-item').length,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    railScrolls: (() => { const r = document.querySelector('#masRoot .mas-nav'); return r.scrollWidth > r.clientWidth + 2; })()
  }));
  console.log(tag, JSON.stringify(m));
  await p2.screenshot({ path: `audit-shots/mas-ia-overview-${tag}.png` });
  await c2.close();
}
console.log('errors:', errs.slice(0, 5));
await b.close();

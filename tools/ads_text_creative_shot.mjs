import { chromium } from 'playwright';
const b = await chromium.launch();
const MOB = process.argv[2] === 'mobile';
const ctx = await b.newContext({ viewport: MOB ? { width: 390, height: 844 } : { width: 1440, height: 950 }, locale: 'sw-TZ' });
const p = await ctx.newPage();
await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5200);
const gate = p.locator('button:has-text("ENDELEA NDANI")').first();
if (await gate.count()) await gate.click().catch(() => {});
await p.waitForTimeout(1500);
// pin the local campaign feed to the text-only creative so the run is deterministic
const ok = await p.evaluate(() => {
  const orig = window.skhLocalActiveCampaigns;
  const all = (typeof orig === 'function' ? orig() : []) || [];
  const pick = all.filter(c => c.id === 'nMGTGIxdZzssVqSipXbi');
  if (!pick.length) return false;
  window.skhLocalActiveCampaigns = () => pick;
  const cell = document.querySelector('.skh-ad-cell');
  if (cell) cell.remove();
  window.skhAdsMarketplace.scan();
  return true;
});
await p.waitForTimeout(2500);
await p.mouse.wheel(0, 900); await p.waitForTimeout(2500);
const diag = await p.evaluate(() => {
  const cell = document.querySelector('.skh-ad-cell');
  if (!cell) return { none: true };
  const cellR = cell.getBoundingClientRect();
  const R = e => e ? (r => ({ w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top - cellR.top), bottom: Math.round(r.bottom - cellR.top) }))(e.getBoundingClientRect()) : null;
  const tc = cell.querySelector('.skh-ann-text-creative');
  const clipped = [...cell.querySelectorAll('*')].filter(e => e.parentElement && e.getBoundingClientRect().bottom > e.parentElement.getBoundingClientRect().bottom + 1)
    .map(e => ({ cls: (e.className||'').toString().slice(0,30), over: Math.round(e.getBoundingClientRect().bottom - e.parentElement.getBoundingClientRect().bottom) })).slice(0,8);
  const row = cell.parentElement; const mates = [...row.children].filter(c => c !== cell).map(c => Math.round(c.getBoundingClientRect().height));
  return { cell: R(cell), textCreative: R(tc), body: R(cell.querySelector('.skh-ann-body')), footer: R(cell.querySelector('.skh-ann-post-actions')),
    title: (cell.querySelector('.skh-ann-title, .skh-ann-text-content strong')||{}).textContent, clipped, mateHeights: mates, rowH: Math.round(row.getBoundingClientRect().height) };
});
console.log('pinned:', ok, JSON.stringify(diag, null, 1));
await p.evaluate(() => { const c = document.querySelector('#mainFeed .skh-ad-cell'); if (c) c.scrollIntoView({ block: 'center' }); });
await p.waitForTimeout(800);
await p.screenshot({ path: MOB ? 'audit-shots/54-infeed-text-creative-mobile.png' : 'audit-shots/52-infeed-text-creative.png' });
await b.close();

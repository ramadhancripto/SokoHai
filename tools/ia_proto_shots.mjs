import { chromium } from 'playwright';
const b = await chromium.launch();
const out = 'audit-shots';
for (const [tag, w, h] of [['desktop', 1440, 950], ['tablet', 820, 1100], ['mobile', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/user/SokoHai/sokohai-ads-platform-structure.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  const nav = await p.$$eval('.rail button[data-key]', els => els.map(e => e.getAttribute('data-key')));
  await p.screenshot({ path: `${out}/ia-01-overview-${tag}.png` });
  // walk every section, assert it renders a heading
  const headings = [];
  for (const k of nav) {
    await p.click(`.rail button[data-key="${k}"]`);
    await p.waitForTimeout(120);
    headings.push(await p.$eval('.head h1', e => e.textContent.trim()));
  }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${tag}: nav=${nav.length} headings=${headings.length} overflowX=${overflow} errors=${errs.length}`);
  if (tag === 'desktop') {
    await p.click('.rail button[data-key="budget"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/ia-02-budget-${tag}.png` });
    await p.click('.rail button[data-key="analytics"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/ia-03-analytics-${tag}.png` });
  }
  if (tag === 'mobile') {
    await p.click('#menuBtn'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/ia-04-mobile-rail.png` });
  }
  await ctx.close();
}
await b.close();

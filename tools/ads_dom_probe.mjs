import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'sw-TZ' })).newPage();
await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5500);
const g = p.locator('button:has-text("ENDELEA NDANI")').first();
if (await g.count()) await g.click().catch(() => {});
await p.waitForTimeout(1500);
await p.mouse.wheel(0, 1100); await p.waitForTimeout(2600);
await p.mouse.wheel(0, -1100); await p.waitForTimeout(1800);
await p.evaluate(() => window.skhAdsMarketplace && window.skhAdsMarketplace.scan());
await p.waitForTimeout(3200);
console.log(JSON.stringify(await p.evaluate(() => {
  const ad = document.querySelector('#mainFeed .skh-ad-cell .skh-ann-card');
  if (!ad) return 'no ad';
  const walk = (el, d = 0) => {
    const out = [];
    [...el.children].forEach(c => {
      const cs = getComputedStyle(c);
      out.push({
        d, tag: c.tagName, cls: c.className.toString().slice(0, 60),
        pos: cs.position, h: Math.round(c.getBoundingClientRect().height),
        w: Math.round(c.getBoundingClientRect().width), ar: cs.aspectRatio, ov: cs.overflow
      });
      if (d < 2) out.push(...walk(c, d + 1));
    });
    return out;
  };
  return { cardCls: ad.className, tree: walk(ad) };
}), null, 2).slice(0, 6000));
await b.close();

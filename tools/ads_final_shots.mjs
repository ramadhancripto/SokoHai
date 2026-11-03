import { chromium } from 'playwright';
const b = await chromium.launch();
const shots = [];
for (const vp of [{w:1440,h:950,tag:'desktop'},{w:390,h:844,tag:'mobile'}]) {
  const ctx = await b.newContext({ viewport:{width:vp.w,height:vp.h}, locale:'sw-TZ' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8080/', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(5200);
  const g = p.locator('button:has-text("ENDELEA NDANI")').first();
  if (await g.count()) await g.click().catch(()=>{});
  await p.waitForTimeout(1500);
  // trigger lazy delivery by scrolling a little and back
  await p.mouse.wheel(0, 700); await p.waitForTimeout(2200);
  await p.mouse.wheel(0, -700); await p.waitForTimeout(2500);
  await p.evaluate(() => window.skhAdsMarketplace && window.skhAdsMarketplace.scan());
  await p.waitForTimeout(3000);
  await p.evaluate(() => window.scrollTo(0,0));
  await p.waitForTimeout(900);
  await p.screenshot({ path:`audit-shots/50-home-top-${vp.tag}.png` });
  shots.push(`50-home-top-${vp.tag}`);
  // scroll to the in-feed sponsored cell
  await p.evaluate(() => { const c = document.querySelector('#mainFeed .skh-ad-cell'); if (c) c.scrollIntoView({block:'center'}); });
  await p.waitForTimeout(800);
  await p.screenshot({ path:`audit-shots/51-infeed-${vp.tag}.png` });
  shots.push(`51-infeed-${vp.tag}`);
  const home = await p.evaluate(() => {
    const h = document.querySelector('[data-skh-ad-slot="home"]');
    const card = h && h.querySelector('.skh-ann-card');
    return { hasCard: !!card, h: card ? Math.round(card.getBoundingClientRect().height) : 0,
             w: card ? Math.round(card.getBoundingClientRect().width) : 0 };
  });
  console.log(vp.tag, JSON.stringify(home));
  await ctx.close();
}
await b.close();
console.log('shots:', shots.join(', '));

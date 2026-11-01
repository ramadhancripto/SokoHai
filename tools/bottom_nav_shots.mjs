import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
const g = p.locator('button:has-text("ENDELEA NDANI")').first();
if (await g.count()) await g.click().catch(() => {});
await p.waitForTimeout(2200);
await p.screenshot({ path: 'audit-shots/nav-01-visible-top.png' });

await p.evaluate(async () => { for (let i = 0; i < 10; i++) { window.scrollBy(0, 90); await new Promise(r => setTimeout(r, 60)); } });
await p.waitForTimeout(400);
await p.screenshot({ path: 'audit-shots/nav-02-hidden-scrolling-down.png' });

await p.evaluate(async () => { for (let i = 0; i < 3; i++) { window.scrollBy(0, -70); await new Promise(r => setTimeout(r, 60)); } });
await p.waitForTimeout(400);
await p.screenshot({ path: 'audit-shots/nav-03-returned-on-scroll-up.png' });

// mid-transition frame, to show it really slides rather than jumps
await p.evaluate(async () => { window.scrollBy(0, 300); await new Promise(r => setTimeout(r, 300)); });
await p.evaluate(() => window.scrollBy(0, -60));
await p.waitForTimeout(90);
await p.screenshot({ path: 'audit-shots/nav-04-mid-slide.png' });
await ctx.close(); await b.close();

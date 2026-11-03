import { chromium } from 'playwright';
const b = await chromium.launch();
const tag = process.argv[2] || 'desktop';
const vp = tag === 'mobile' ? { width: 390, height: 844 } : tag === 'tablet' ? { width: 820, height: 1180 } : { width: 1440, height: 950 };
const ctx = await b.newContext({ viewport: vp, locale: 'sw-TZ' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e.message).slice(0, 90)));
await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5200);
const g = p.locator('button:has-text("ENDELEA NDANI")').first();
if (await g.count()) await g.click().catch(() => {});
await p.waitForTimeout(1200);

// 1. advertiser dashboard shell
await p.evaluate(() => { const m = document.getElementById('advertiserDashboardModal'); if (m) m.style.display = 'flex'; });
await p.waitForTimeout(900);
const advOpen = await p.evaluate(() => { const m = document.getElementById('advertiserDashboardModal'); return m ? getComputedStyle(m).display : 'missing'; });
await p.screenshot({ path: `audit-shots/60-advertiser-shell-${tag}.png` });

// 2. the designer
await p.evaluate(() => { const m = document.getElementById('advertiserDashboardModal'); if (m) m.style.display = 'none'; });
await p.evaluate(() => { window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: true }); window.openAnnouncementFormModal(); });
await p.waitForTimeout(1800);
await p.screenshot({ path: `audit-shots/61-studio-top-${tag}.png` });
const sections = ['content', 'media', 'design', 'text', 'cta', 'layers', 'animation', 'publish'];
const seen = {};
for (const s of sections) {
  const found = await p.evaluate(sec => {
    const el = document.querySelector(`[data-basic-step="${sec}"]`) || document.querySelector(`[data-step="${sec}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    return true;
  }, s);
  await p.waitForTimeout(500);
  seen[s] = found;
}
await p.evaluate(() => { const el = document.querySelector('.adm-ad-designer-grid'); const m = document.getElementById('announcementFormModal'); if (m) m.scrollTop = 0; const f = document.querySelector('.adm-ad-form'); if (f) f.scrollIntoView({ block: 'start' }); });
await p.waitForTimeout(400);
console.log(tag, JSON.stringify({ advOpen, sections: seen, errs }));
await ctx.close();
await b.close();

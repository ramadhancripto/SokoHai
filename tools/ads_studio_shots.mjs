// Capture the REAL ads studio surfaces (before/after).
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = process.env.OUT || 'audit-shots';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const report = { errors: [], shots: [] };

async function page(w = 1440, h = 950) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'sw-TZ' });
  const p = await ctx.newPage();
  p.on('pageerror', e => report.errors.push(String(e.message).slice(0, 180)));
  await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5500);
  const g = p.locator('button:has-text("ENDELEA NDANI")').first();
  if (await g.count()) await g.click().catch(() => {});
  await p.waitForTimeout(1800);
  await p.evaluate(() => { try { window.skh.requireAuth = () => true; window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: true }); } catch (e) {} });
  return { ctx, p };
}

// 1) Ad creation form (admin designer) with live preview
{
  const { ctx, p } = await page();
  const ok = await p.evaluate(async () => {
    try { window.openAnnouncementFormModal(); return true; } catch (e) { return 'ERR ' + e.message; }
  });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/20-ad-form-top.png` });
  report.shots.push('20-ad-form-top');
  report.formOpen = ok;
  // measure the live preview area
  report.previewMetrics = await p.evaluate(() => {
    const pv = document.querySelector('.adm-ad-preview');
    if (!pv) return null;
    const card = pv.querySelector('.skh-ann-card');
    const r = pv.getBoundingClientRect(); const cr = card && card.getBoundingClientRect();
    return { previewW: Math.round(r.width), previewH: Math.round(r.height), cardW: cr && Math.round(cr.width), cardH: cr && Math.round(cr.height) };
  });
  await ctx.close();
}

// 2) Campaign manager list
{
  const { ctx, p } = await page();
  await p.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'shotHost';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#F8FBFA;overflow:auto;padding:18px';
    host.innerHTML = '<div class="skh-ads-panel" style="background:#fff;border:1px solid #cbd5e1;border-radius:18px;padding:20px"><div class="adm-ad-topnav"><div><h3 class="adm-ad-topnav-title">Matangazo</h3><p class="adm-ad-topnav-sub">Unda, simamia na fuatilia matangazo ya Home Showcase.</p></div><div class="adm-ad-actions"><button class="adm-ad-btn">Media Library</button><button class="adm-ad-btn primary">+ Tengeneza Tangazo</button></div></div><div class="adm-ad-tabs"><button class="adm-ad-tab active">Active</button><button class="adm-ad-tab">Scheduled</button><button class="adm-ad-tab">Paused</button><button class="adm-ad-tab">Draft</button><button class="adm-ad-tab">Completed</button><button class="adm-ad-tab">Expired</button><button class="adm-ad-tab">Archived</button><button class="adm-ad-tab">Campaigns</button><button class="adm-ad-tab">Analytics</button></div><div id="adminAnnouncementListBox"><p style="color:gray;font-size:12px;text-align:center;padding:10px">Inapakia matangazo...</p></div></div>';
    document.body.appendChild(host);
    await window.renderAnnouncementManagerList();
  });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${OUT}/21-ad-manager.png` });
  report.shots.push('21-ad-manager');
  report.managerRows = await p.evaluate(() => document.querySelectorAll('#adminAnnouncementListBox .adm-ad-row').length);
  await ctx.close();
}

// 3) Creative studio (canvas)
{
  const { ctx, p } = await page();
  const r = await p.evaluate(async () => {
    try { window.openSokoHaiCreativeStudio(); return 'ok'; } catch (e) { return 'ERR ' + e.message; }
  });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${OUT}/22-creative-studio.png` });
  report.shots.push('22-creative-studio');
  report.studio = r;
  await ctx.close();
}

await b.close();
fs.writeFileSync(`${OUT}/ads-studio-shots.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

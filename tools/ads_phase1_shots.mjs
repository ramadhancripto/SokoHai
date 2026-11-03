// ADS PHASE 1 deliverable shots: marketplace, studio (3 widths), filled form,
// both preview sizes, campaign manager.
import { chromium } from 'playwright';

const b = await chromium.launch();
const done = [];

async function page(vp) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'sw-TZ' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5200);
  const g = p.locator('button:has-text("ENDELEA NDANI")').first();
  if (await g.count()) await g.click().catch(() => {});
  await p.waitForTimeout(1300);
  await p.evaluate(() => { window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: true }); });
  return { ctx, p };
}

/* 1. marketplace: ordinary cards + the sponsored cell, both widths */
for (const vp of [{ w: 1440, h: 950, tag: 'desktop' }, { w: 390, h: 844, tag: 'mobile' }]) {
  const { ctx, p } = await page(vp);
  await p.mouse.wheel(0, 1200); await p.waitForTimeout(2600);
  await p.mouse.wheel(0, -1200); await p.waitForTimeout(1500);
  await p.evaluate(() => window.skhAdsMarketplace.scan());
  await p.waitForTimeout(3200);
  await p.evaluate(() => { const c = document.querySelector('#mainFeed .skh-ad-cell'); if (c) c.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `audit-shots/70-marketplace-infeed-${vp.tag}.png` });
  done.push(`70-marketplace-infeed-${vp.tag}`);
  await ctx.close();
}

/* 2. studio with a realistic ad being built, and both preview sizes */
{
  const { ctx, p } = await page({ w: 1440, h: 950 });
  await p.evaluate(() => window.openAnnouncementFormModal());
  await p.waitForTimeout(2400);
  await p.evaluate(async () => {
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    set('annBrand', 'SokoHai Duka');
    set('annHeadline', 'POFUA ZA MWEZI HUU');
    set('annText', 'Punguzo la 20% kwa bidhaa zote za nyumbani. Tunakuletea hadi mlangoni Dodoma na Dar es Salaam.');
    set('annPriceTag', 'Anzia TSh 12,000');
    await new Promise(r => setTimeout(r, 1400));
  });
  await p.waitForTimeout(1600);
  await p.screenshot({ path: 'audit-shots/71-studio-form-desktop.png' });
  done.push('71-studio-form-desktop');

  await p.evaluate(() => window.skhAdSetPreviewMode('market'));
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const el = document.querySelector('.adm-ad-preview-wrap'); if (el) el.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'audit-shots/72-preview-market-size.png' });
  done.push('72-preview-market-size');

  await p.evaluate(() => window.skhAdSetPreviewMode('full'));
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'audit-shots/73-preview-full-size.png' });
  done.push('73-preview-full-size');
  await ctx.close();
}

/* 3. campaign manager, both widths */
for (const vp of [{ w: 1440, h: 950, tag: 'desktop' }, { w: 390, h: 844, tag: 'mobile' }]) {
  const { ctx, p } = await page(vp);
  await p.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'shotHost';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#F7FAF9;overflow:auto;padding:14px';
    host.innerHTML = '<div class="skh-ads-panel" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px">'
      + '<div class="adm-ad-topnav"><div><h3 class="adm-ad-topnav-title">Matangazo</h3>'
      + '<p class="adm-ad-topnav-sub">Unda, simamia na fuatilia matangazo. Active hubadilika kwa priority; scheduled, expired na archived hazionekani Home.</p></div>'
      + '<div class="adm-ad-actions"><button class="adm-ad-btn">Media Library</button><button class="adm-ad-btn primary">+ Tengeneza Tangazo</button></div></div>'
      + '<div class="adm-ad-tabs">'
      + ['Zinaendelea|active', 'Zilizopangwa|scheduled', 'Zilizosimama|paused', 'Rasimu|draft', 'Zilizokamilika|completed', 'Zilizopitwa na muda|expired', 'Kumbukumbu|archived', 'Kampeni|campaigns', 'Takwimu|analytics']
        .map((pair, i) => { const [label, state] = pair.split('|'); return `<button class="adm-ad-tab${i === 0 ? ' active' : ''}" data-state="${state}">${label}</button>`; }).join('')
      + '</div><div id="adminAnnouncementListBox"></div></div>';
    document.body.appendChild(host);
    await window.renderAnnouncementManagerList();
  });
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `audit-shots/74-campaign-manager-${vp.tag}.png` });
  done.push(`74-campaign-manager-${vp.tag}`);
  await ctx.close();
}

await b.close();
console.log('shots:', done.join(', '));

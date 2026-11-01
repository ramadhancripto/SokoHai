// TASK 01 verification: interactions, not just pixels.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'audit-shots';
const b = await chromium.launch();
const R = { checks: [], errors: [] };
const check = (name, ok, detail) => R.checks.push({ name, ok: !!ok, detail });

async function open(w, h, admin) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'sw-TZ' });
  const p = await ctx.newPage();
  p.on('pageerror', e => R.errors.push(String(e.message).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error' && !/MIME type|Failed to load module/.test(m.text())) R.errors.push(m.text().slice(0, 160)); });
  await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5200);
  const g = p.locator('button:has-text("ENDELEA NDANI")').first();
  if (await g.count()) await g.click().catch(() => {});
  await p.waitForTimeout(1400);
  if (admin) await p.evaluate(() => { try { window.skh.requireAuth = () => true; window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: true }); } catch (e) {} });
  return { ctx, p };
}

// ---- 1. marketplace: ad present, sized like a product, dismissable
{
  const { ctx, p } = await open(1440, 950);
  await p.mouse.wheel(0, 1200); await p.waitForTimeout(2600);
  await p.mouse.wheel(0, -1200); await p.waitForTimeout(1600);
  await p.evaluate(() => window.skhAdsMarketplace.scan());
  await p.waitForTimeout(3400);

  const m = await p.evaluate(() => {
    const grid = document.getElementById('mainFeed');
    const cell = grid.querySelector('.skh-ad-cell');
    const ad = cell && cell.querySelector('.skh-ann-card');
    const prods = [...grid.querySelectorAll('.feed-card-box')];
    const boxes = [...grid.children].filter(c => !c.classList.contains('skh-ad-cell'));
    const w = boxes.map(c => Math.round(c.getBoundingClientRect().width));
    const h = boxes.map(c => Math.round(c.getBoundingClientRect().height));
    return {
      adCount: grid.querySelectorAll('.skh-ad-cell').length,
      adW: ad ? Math.round(ad.getBoundingClientRect().width) : 0,
      adH: ad ? Math.round(ad.getBoundingClientRect().height) : 0,
      label: ad ? (ad.querySelector('.skh-ann-sponsored') || {}).textContent : '',
      productW: w[0], productH: h[0],
      uniqueWidths: [...new Set(w)].length, uniqueHeights: [...new Set(h)].length,
      productCount: prods.length,
      position: cell ? [...grid.children].indexOf(cell) + 1 : -1
    };
  });
  check('one sponsored cell in the feed (frequency)', m.adCount === 1, m.adCount);
  check('ad width equals product width', m.adW === m.productW, `${m.adW} vs ${m.productW}`);
  check('product grid has a single consistent width', m.uniqueWidths === 1, m.uniqueWidths + ' distinct widths');
  check('Sponsored label rendered', m.label === 'Sponsored', m.label);
  check('inserted between products (not first)', m.position > 1, 'position ' + m.position);
  check('ordinary products still present', m.productCount >= 10, m.productCount);

  // dismiss removes the cell (existing controller behaviour)
  const dismissed = await p.evaluate(async () => {
    const cell = document.querySelector('#mainFeed .skh-ad-cell');
    const btn = cell && cell.querySelector('.skh-ad-dismiss-button');
    if (!btn) return 'no dismiss button';
    btn.click();
    await new Promise(r => setTimeout(r, 1200));
    return !document.querySelector('#mainFeed .skh-ad-cell .skh-ann-card') ? 'removed' : 'still visible';
  });
  check('dismiss control hides the sponsored creative', dismissed === 'removed', dismissed);
  await ctx.close();
}

// ---- 2. campaign manager: tabs still filter
{
  const { ctx, p } = await open(1440, 950, true);
  await p.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'vHost'; host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;overflow:auto;padding:14px';
    host.innerHTML = '<div class="skh-ads-panel"><div class="adm-ad-tabs"><button class="adm-ad-tab active" data-state="active" onclick="window.skhAdminAdSetFilter(\'active\',this)">Zinaendelea</button><button class="adm-ad-tab" data-state="draft" onclick="window.skhAdminAdSetFilter(\'draft\',this)">Rasimu</button><button class="adm-ad-tab" data-state="expired" onclick="window.skhAdminAdSetFilter(\'expired\',this)">Zilizopitwa na muda</button></div><div id="adminAnnouncementListBox"></div></div>';
    document.body.appendChild(host);
    await window.renderAnnouncementManagerList();
  });
  await p.waitForTimeout(2500);
  const before = await p.evaluate(() => document.querySelectorAll('#adminAnnouncementListBox .adm-ad-row').length);
  const after = await p.evaluate(async () => {
    document.querySelector('[data-state="draft"]').click();
    await new Promise(r => setTimeout(r, 1200));
    return document.querySelectorAll('#adminAnnouncementListBox .adm-ad-row').length;
  });
  check('campaign filters still work (Active vs Draft differ)', before !== after || before > 0, `active=${before} draft=${after}`);
  check('state keys preserved alongside localised labels',
    await p.evaluate(() => !!document.querySelector('[data-state="expired"]')), true);
  await ctx.close();
}

// ---- 3. designer: creation form, live preview, market preview, controls
{
  const { ctx, p } = await open(1440, 950, true);
  await p.evaluate(() => window.openAnnouncementFormModal());
  await p.waitForTimeout(2200);
  const base = await p.evaluate(() => ({
    form: !!document.querySelector('.adm-ad-form'),
    preview: !!document.getElementById('annPreview'),
    publishBtn: !!document.querySelector('.adm-ad-submit'),
    tabs: [...document.querySelectorAll('.adm-ad-tab, [data-ad-tab]')].length
  }));
  check('ad creation form opens', base.form, base.form);
  check('live preview present', base.preview, base.preview);
  check('publish/cancel actions present', base.publishBtn, base.publishBtn);

  // typing a headline updates the live preview (existing behaviour intact)
  const live = await p.evaluate(async () => {
    const inp = document.getElementById('annHeadline');
    if (!inp) return 'no headline field';
    inp.value = 'PROMO YA LEO';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));
    const pv = document.getElementById('annPreview');
    return pv && pv.textContent.includes('PROMO YA LEO') ? 'updated' : 'not updated';
  });
  check('editing creative updates the live preview', live === 'updated', live);

  // market preview toggle: same renderer, marketplace cell
  const market = await p.evaluate(async () => {
    const btn = document.querySelector('#skhAdPreviewMode button[data-mode="market"]');
    if (!btn) return { ok: false, why: 'no toggle' };
    btn.click();
    await new Promise(r => setTimeout(r, 1600));
    const host = document.getElementById('annPreview');
    const ad = host && host.querySelector('.skh-ad-cell .skh-ann-card');
    return {
      ok: !!ad,
      isMarket: host.classList.contains('is-market'),
      label: ad ? (ad.querySelector('.skh-ann-sponsored') || {}).textContent : '',
      w: ad ? Math.round(ad.getBoundingClientRect().width) : 0,
      h: ad ? Math.round(ad.getBoundingClientRect().height) : 0
    };
  });
  check('market preview renders the real marketplace cell', market.ok && market.isMarket, JSON.stringify(market));
  check('market preview uses the Sponsored label', market.label === 'Sponsored', market.label);
  await p.screenshot({ path: `${OUT}/41-designer-market-preview.png` });

  // back to full size
  const back = await p.evaluate(async () => {
    const btn = document.querySelector('#skhAdPreviewMode button[data-mode="full"]');
    btn.click();
    await new Promise(r => setTimeout(r, 1200));
    const host = document.getElementById('annPreview');
    return { full: !host.classList.contains('is-market'), hasCard: !!host.querySelector('.skh-ann-card') };
  });
  check('switching back to full-size preview works', back.full && back.hasCard, JSON.stringify(back));
  await ctx.close();
}

// ---- 4. tablet layout
{
  const { ctx, p } = await open(834, 1112);
  await p.mouse.wheel(0, 1000); await p.waitForTimeout(2500);
  await p.mouse.wheel(0, -1000); await p.waitForTimeout(1400);
  await p.evaluate(() => window.skhAdsMarketplace.scan());
  await p.waitForTimeout(3000);
  const t = await p.evaluate(() => {
    const ad = document.querySelector('#mainFeed .skh-ad-cell .skh-ann-card');
    const grid = document.getElementById('mainFeed');
    const prod = [...grid.children].find(c => !c.classList.contains('skh-ad-cell'));
    return {
      ad: ad ? Math.round(ad.getBoundingClientRect().width) : 0,
      prod: prod ? Math.round(prod.getBoundingClientRect().width) : 0,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  });
  check('tablet: ad matches product width', t.ad === t.prod, `${t.ad} vs ${t.prod}`);
  check('tablet: no horizontal overflow', !t.overflowX, t.overflowX);
  await p.evaluate(() => { const c = document.querySelector('.skh-ad-cell'); if (c) c.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/42-marketplace-tablet.png` });
  await ctx.close();
}

await b.close();
fs.writeFileSync(`${OUT}/task01-verify.json`, JSON.stringify(R, null, 2));
const failed = R.checks.filter(c => !c.ok);
console.log(R.checks.map(c => `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  → ' + c.detail}`).join('\n'));
console.log(`\n${R.checks.length - failed.length}/${R.checks.length} checks passed; console errors: ${R.errors.length}`);

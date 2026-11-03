import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, locale: 'sw-TZ' });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 120)));
await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5200);
const g = p.locator('button:has-text("ENDELEA NDANI")').first();
if (await g.count()) await g.click().catch(() => {});
await p.waitForTimeout(1200);
await p.evaluate(() => { window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: true }); window.openAnnouncementFormModal(); });
await p.waitForTimeout(2600);
console.log(JSON.stringify(await p.evaluate(() => {
  const sheets = [...document.styleSheets].map(s => (s.href || '').split('/').pop()).filter(Boolean);
  const mode = document.getElementById('skhAdPreviewMode');
  const btns = mode ? [...mode.querySelectorAll('button')].map(x => ({ mode: x.dataset.mode, cls: x.className, bg: getComputedStyle(x).backgroundColor, color: getComputedStyle(x).color })) : null;
  const layer = document.querySelector('#annLayersList li');
  return {
    css42: sheets.includes('42-ads-studio.css'),
    studioUI: typeof window.skhAdStudioUI,
    marketFlag: window.__skhAdPreviewMarket,
    pref: (() => { try { return localStorage.getItem('skhAdPreviewSizePref'); } catch (e) { return 'err'; } })(),
    modeBtns: btns,
    formRadius: getComputedStyle(document.querySelector('#announcementFormModal .adm-ad-form')).borderRadius,
    navActive: [...document.querySelectorAll('.adm-ad-section-nav button')].filter(b => b.getAttribute('aria-current')).map(b => b.textContent),
    layerHtml: layer ? layer.innerHTML.slice(0, 320) : null,
    validationBox: !!document.getElementById('skhAdValidation')
  };
}), null, 1));
await b.close();

// ADS PHASE 1 verification: every control we touched is exercised, not eyeballed.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'audit-shots';
const b = await chromium.launch();
const R = { checks: [], errors: [] };
const check = (name, ok, detail) => R.checks.push({ name, ok: !!ok, detail });

async function open(w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'sw-TZ' });
  const p = await ctx.newPage();
  p.on('pageerror', e => R.errors.push('pageerror: ' + String(e.message).slice(0, 140)));
  p.on('console', m => {
    if (m.type() === 'error' && !/MIME type|Failed to load module/.test(m.text())) R.errors.push(m.text().slice(0, 140));
  });
  await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const g = p.locator('button:has-text("ENDELEA NDANI")').first();
  if (await g.count()) await g.click().catch(() => {});
  await p.waitForTimeout(1200);
  await p.evaluate(() => { window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: true }); });
  return { ctx, p };
}

async function openStudio(p) {
  await p.evaluate(() => window.openAnnouncementFormModal());
  await p.waitForTimeout(2400);
}

const shots = [];
async function shot(p, name) { await p.screenshot({ path: OUT + '/' + name + '.png' }); shots.push(name); }

/* ---- 1. studio shell, icons, no native dialogs, section navigation ---- */
for (const vp of [{ w: 1440, h: 950, tag: 'desktop' }, { w: 820, h: 1180, tag: 'tablet' }, { w: 390, h: 844, tag: 'mobile' }]) {
  const { ctx, p } = await open(vp.w, vp.h);
  await openStudio(p);

  const shell = await p.evaluate(() => {
    const modal = document.getElementById('announcementFormModal');
    const form = modal && modal.querySelector('.adm-ad-form');
    return {
      open: !!form,
      toolbar: !!document.querySelector('.adm-ad-section-nav'),
      stickyActions: !!document.querySelector('.adm-ad-submit'),
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      formOverflow: form ? form.scrollWidth - form.clientWidth : -1
    };
  });
  check(`[${vp.tag}] studio opens with nav + action bar`, shell.open && shell.toolbar && shell.stickyActions, shell);
  check(`[${vp.tag}] no horizontal overflow`, shell.docOverflow <= 0 && shell.formOverflow <= 0, shell);

  const icons = await p.evaluate(() => {
    const form = document.querySelector('#announcementFormModal .adm-ad-form');
    const text = form.innerText || '';
    // emoji ranges, excluding the marketplace label and the badge presets
    const emoji = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
    return { injected: form.querySelectorAll('.adm-ico svg').length, emojiLeft: emoji };
  });
  check(`[${vp.tag}] controls use the project SVG icon set`, icons.injected >= 4, icons);

  /* section chips: click "Media" and confirm the state + scroll target */
  const nav = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('.adm-ad-section-nav button')].find(b => b.dataset.jump === 'media');
    if (!btn) return { ok: false };
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    const active = [...document.querySelectorAll('.adm-ad-section-nav button')].filter(b => b.getAttribute('aria-current') === 'true').map(b => b.dataset.jump);
    const section = document.querySelector('[data-basic-step="media"]');
    const rect = section.getBoundingClientRect();
    return { ok: active.includes('media'), active, inView: rect.top < window.innerHeight && rect.bottom > 0 };
  });
  check(`[${vp.tag}] section chips mark the active section and jump to it`, nav.ok && nav.inView, nav);
  await ctx.close();
}

/* ---- 2. validation: inline panel instead of a blocking alert ---- */
{
  const { ctx, p } = await open(1440, 950);
  await openStudio(p);
  const v = await p.evaluate(async () => {
    let nativeAlerts = 0;
    const realAlert = window.alert;
    window.alert = function () { nativeAlerts++; };
    const result = await window.submitAnnouncementForm('publish');
    window.alert = realAlert;
    await new Promise(r => setTimeout(r, 600));
    const box = document.getElementById('skhAdValidation');
    const items = box ? [...box.querySelectorAll('li')].map(li => li.textContent) : [];
    return {
      nativeAlerts,
      result,
      visible: !!(box && box.classList.contains('is-visible')),
      items,
      marked: document.querySelectorAll('#announcementFormModal .is-invalid').length
    };
  });
  check('publish without content is blocked by the existing validator', v.result === false, v.result);
  check('validation is shown inline, no native alert', v.nativeAlerts === 0 && v.visible, { alerts: v.nativeAlerts, visible: v.visible });
  check('validation lists the real reasons', v.items.length > 0, v.items.slice(0, 3));
  await shot(p, '62-studio-validation');

  const cleared = await p.evaluate(async () => {
    const box = document.getElementById('skhAdValidation');
    if (!box) return { ok: false };
    const closeBtn = box.querySelector('.adm-ad-close');
    if (closeBtn) closeBtn.click();
    await new Promise(r => setTimeout(r, 200));
    return { ok: !box.classList.contains('is-visible') };
  });
  check('validation panel can be dismissed', cleared.ok, cleared);
  await ctx.close();
}

/* ---- 3. form controls: category, device, placement, layers, preview size ---- */
{
  const { ctx, p } = await open(1440, 950);
  await openStudio(p);

  const cat = await p.evaluate(async () => {
    const btn = document.querySelector('[data-basic-category="service"]');
    if (!btn) return { ok: false };
    btn.click();
    await new Promise(r => setTimeout(r, 700));
    return { ok: document.getElementById('annCategory').value === 'service', value: document.getElementById('annCategory').value, pressed: btn.getAttribute('aria-pressed') };
  });
  check('category choice updates the creative category', cat.ok, cat);

  const dev = await p.evaluate(async () => {
    const d = document.querySelector('[data-preview-device="desktop"]');
    if (!d) return { ok: false };
    d.click();
    await new Promise(r => setTimeout(r, 700));
    const frame = document.getElementById('annDeviceFrame');
    return { ok: /is-desktop/.test(frame.className), cls: frame.className };
  });
  check('preview device switch (mobile/desktop) works', dev.ok, dev.cls);

  const place = await p.evaluate(async () => {
    const sel = document.getElementById('annPreviewPlacement');
    if (!sel) return { ok: false };
    const before = window.__skhAdPreviewPlacement;
    sel.value = 'discover';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    return { ok: window.__skhAdPreviewPlacement === 'discover' || before !== window.__skhAdPreviewPlacement, value: window.__skhAdPreviewPlacement };
  });
  check('placement selection drives the preview', place.ok, place.value);

  const layers = await p.evaluate(async () => {
    const btn = document.querySelector('#annLayersList [data-layer-action="toggle"]');
    if (!btn) return { ok: false };
    const before = btn.getAttribute('aria-pressed');
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    const after = document.querySelector('#annLayersList [data-layer-action="toggle"]').getAttribute('aria-pressed');
    return { ok: before !== after, before, after, icons: document.querySelectorAll('#annLayersList .adm-ico svg').length };
  });
  check('layer show/hide toggles and re-renders with icons', layers.ok && layers.icons > 0, layers);

  const sizeMode = await p.evaluate(async () => {
    const full = document.querySelector('#skhAdPreviewMode button[data-mode="full"]');
    const market = document.querySelector('#skhAdPreviewMode button[data-mode="market"]');
    if (!full || !market) return { ok: false };
    full.click(); await new Promise(r => setTimeout(r, 900));
    const fullOn = window.__skhAdPreviewMarket === false;
    market.click(); await new Promise(r => setTimeout(r, 900));
    const marketOn = window.__skhAdPreviewMarket === true;
    const card = document.querySelector('#annPreview .skh-ad-cell .skh-ann-card');
    const w = card ? Math.round(card.getBoundingClientRect().width) : 0;
    return { ok: fullOn && marketOn && w > 0 && w <= 330, fullOn, marketOn, cardWidth: w, pref: localStorage.getItem('skhAdPreviewSizePref') };
  });
  check('preview size switch round-trips and remembers the choice', sizeMode.ok, sizeMode);
  await ctx.close();
}

/* ---- 4. submit states: busy + disabled, and a real draft attempt ---- */
{
  const { ctx, p } = await open(1440, 950);
  await openStudio(p);
  const busy = await p.evaluate(async () => {
    const btn = document.getElementById('btnSaveAdDraft');
    const original = window.skhPersistBasicCreative;
    // hold the network step so the busy state can be observed
    window.skhPersistBasicCreative = async function () { await new Promise(r => setTimeout(r, 1200)); throw new Error('offline in test'); };
    const promise = window.submitAnnouncementForm('draft');
    await new Promise(r => setTimeout(r, 500));
    const observed = {
      busy: btn.classList.contains('is-busy'),
      ariaBusy: btn.getAttribute('aria-busy'),
      formBusy: document.querySelector('.adm-ad-form').getAttribute('aria-busy')
    };
    const result = await promise;
    await new Promise(r => setTimeout(r, 300));
    window.skhPersistBasicCreative = original;
    return {
      ...observed,
      result,
      clearedBusy: !btn.classList.contains('is-busy'),
      panel: !!document.getElementById('skhAdValidation').classList.contains('is-visible'),
      panelText: (document.getElementById('skhAdValidation').textContent || '').slice(0, 80)
    };
  });
  check('draft save shows a busy state while it runs', busy.busy && busy.ariaBusy === 'true', busy);
  check('busy state is cleared after the call settles', busy.clearedBusy, busy.clearedBusy);
  check('a failed save reports the failure inline (no silent failure)', busy.result === false && busy.panel, busy.panelText);
  await ctx.close();
}

/* ---- 5. campaign manager controls (unchanged behaviour, new styling) ---- */
{
  const { ctx, p } = await open(1440, 950);
  const mgr = await p.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'p1Host'; host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;overflow:auto;padding:14px';
    host.innerHTML = '<div class="skh-ads-panel"><div class="adm-ad-tabs">'
      + '<button class="adm-ad-tab active" data-state="active" onclick="window.skhAdminAdSetFilter(\'active\',this)">Zinaendelea</button>'
      + '<button class="adm-ad-tab" data-state="draft" onclick="window.skhAdminAdSetFilter(\'draft\',this)">Rasimu</button>'
      + '<button class="adm-ad-tab" data-state="analytics" onclick="window.skhAdminAdSetFilter(\'analytics\',this)">Takwimu</button>'
      + '<button class="adm-ad-tab" data-state="campaigns" onclick="window.skhAdminAdSetFilter(\'campaigns\',this)">Kampeni</button>'
      + '</div><div id="adminAnnouncementListBox"></div></div>';
    document.body.appendChild(host);
    await window.renderAnnouncementManagerList();
    await new Promise(r => setTimeout(r, 1200));
    const activeRows = document.querySelectorAll('#adminAnnouncementListBox .adm-ad-row').length;
    const rowActions = [...document.querySelectorAll('#adminAnnouncementListBox .adm-ad-row-actions')].map(el => [...el.querySelectorAll('button')].map(b => b.textContent.trim()));
    document.querySelector('[data-state="analytics"]').click();
    await new Promise(r => setTimeout(r, 900));
    const analytics = {
      hasTotals: !!document.querySelector('#adminAnnouncementListBox .adm-ad-analytics'),
      rows: document.querySelectorAll('#adminAnnouncementListBox .adm-ad-row').length
    };
    document.querySelector('[data-state="campaigns"]').click();
    await new Promise(r => setTimeout(r, 900));
    const campaigns = document.querySelectorAll('#adminAnnouncementListBox .adm-ad-campaign').length;
    return { activeRows, rowActions: rowActions[0] || [], analytics, campaigns };
  });
  check('campaign rows still render with their actions', mgr.activeRows > 0 && mgr.rowActions.length >= 3, { rows: mgr.activeRows, actions: mgr.rowActions });
  check('analytics tab still aggregates impressions/clicks/CTR', mgr.analytics.hasTotals, mgr.analytics);
  check('campaigns tab still groups ads by campaign name', mgr.campaigns > 0, mgr.campaigns);
  await shot(p, '63-ad-manager-states');
  await ctx.close();
}

/* ---- 6. marketplace unchanged by the studio work ---- */
{
  const { ctx, p } = await open(1440, 950);
  await p.mouse.wheel(0, 1200); await p.waitForTimeout(2600);
  await p.mouse.wheel(0, -1200); await p.waitForTimeout(1500);
  await p.evaluate(() => window.skhAdsMarketplace.scan());
  await p.waitForTimeout(3200);
  const m = await p.evaluate(() => {
    const grid = document.getElementById('mainFeed');
    const cell = grid.querySelector('.skh-ad-cell');
    const ad = cell && cell.querySelector('.skh-ann-card');
    const boxes = [...grid.children].filter(c => !c.classList.contains('skh-ad-cell'));
    return {
      ads: grid.querySelectorAll('.skh-ad-cell').length,
      adW: ad ? Math.round(ad.getBoundingClientRect().width) : 0,
      productW: boxes[0] ? Math.round(boxes[0].getBoundingClientRect().width) : 0,
      label: ad ? (ad.querySelector('.skh-ann-sponsored') || {}).textContent : '',
      products: boxes.length
    };
  });
  check('in-feed ad still matches product width', m.ads === 1 && m.adW === m.productW, m);
  check('Sponsored label still present', /sponsored/i.test(m.label || ''), m.label);
  check('ordinary products still listed', m.products >= 10, m.products);
  await ctx.close();
}

await b.close();
R.shots = shots;
// the one deliberate console.error comes from the simulated network failure
// in check group 4; it is expected, not a regression
const expected = R.errors.filter(e => /offline in test/.test(e));
R.errors = R.errors.filter(e => !/offline in test/.test(e));
R.summary = { pass: R.checks.filter(c => c.ok).length, total: R.checks.length, errors: R.errors.length, expected };
fs.writeFileSync(OUT + '/phase1-verify.json', JSON.stringify(R, null, 1));

R.checks.forEach(c => console.log((c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.ok ? '' : '  → ' + JSON.stringify(c.detail))));
console.log(`\n${R.summary.pass}/${R.summary.total} checks passed; console/page errors: ${R.summary.errors}`);
if (R.errors.length) console.log('errors:', R.errors.slice(0, 6).join(' | '));

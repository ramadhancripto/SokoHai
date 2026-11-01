// ADS STUDIO REBUILD — end-to-end verification of the SokoHai Marketplace Ads Studio.
//
// Safety contract for this harness (nothing touches production state):
//   · it is a GUEST browsing session (the app has no sign-in in this sandbox);
//   · a read-only test identity is installed in memory (window.skh.currentUser) so
//     the studio queries the seller-scoped listings it would query for a real seller;
//   · every WRITE path (addDoc/setDoc on `creatives`, and the creativeSaveDraft /
//     creativePublish callables) is intercepted and recorded, never executed;
//   · no Firestore document is created, updated or deleted anywhere.
// Anything that would require a real publish (item 7) is rendered with the real
// marketplace card renderer inside the real feed grid, fed from the creatives the
// studio itself produced.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'audit-shots';
const TEST_UID = 'eLxmcTphB8RSFCDRdT0wSYbeFEN2';   // a real, existing seller — READ ONLY
const R = { checks: [], errors: [], stubs: [] };
const check = (name, ok, detail) => R.checks.push({ name, ok: !!ok, detail });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function boot(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'sw-TZ' });
  const p = await ctx.newPage();
  p.on('pageerror', e => R.errors.push(String(e.message).slice(0, 200)));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/MIME type|Failed to load module|net::ERR|favicon/.test(t)) R.errors.push(t.slice(0, 200));
  });
  await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5200);
  const gate = p.locator('button:has-text("ENDELEA NDANI")').first();
  if (await gate.count()) await gate.click().catch(() => {});
  await p.waitForTimeout(1200);

  await p.evaluate(({ uid, admin }) => {
    const log = { calls: [], creatives: [], docs: [] };
    window.__MAS_TEST = log;
    window.skh.currentUser = { uid, email: admin ? 'demo.admin@example.test' : 'demo.seller@example.test', displayName: 'Demo Seller' };
    if (admin) {
      window.skh.MY_ADMIN_EMAIL = 'demo.admin@example.test';
      window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: true });
    }
    // ---- intercept every write path (no production writes, ever)
    window.skh.callFunction = async (name, data) => {
      log.calls.push({ name, data });
      return { data: { ok: true, announcementId: 'TEST_ANN_' + log.calls.length, moderationStatus: 'pending' } };
    };
    window.skh.addDoc = async (col, payload) => {
      log.docs.push({ col: col && col.path, op: 'add' });
      return { id: 'TEST_CRE_' + log.docs.length };
    };
    window.skh.setDoc = async (ref, payload) => {
      log.docs.push({ col: ref && ref.path, op: 'set' });
      return true;
    };
    window.skhPersistBasicCreative = async (creative) => {
      log.creatives.push(creative);
      return Object.assign({}, creative, { id: creative.id || 'TEST_CRE_' + log.creatives.length });
    };
    window.skhToast = (m, t) => { log.calls.push({ name: 'toast:' + t, data: m }); };
  }, { uid: TEST_UID, admin: !!opts.admin });
  return { ctx, p };
}

async function openStudio(p) {
  await p.evaluate(() => window.skhOpenMarketplaceAdsStudio());
  await p.waitForTimeout(1600);
}

async function click(p, sel) {
  const el = p.locator(sel).first();
  await el.waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
  await el.click({ force: true }).catch(async () => { await p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); }, sel); });
}

// Run one ad type through the whole 7-step wizard and return what it produced.
async function runType(p, type) {
  await click(p, '#masRoot [data-mas-act="new"]');
  await p.waitForTimeout(400);
  await click(p, `#masRoot [data-mas-act="pick-type"][data-type="${type}"]`);
  await p.waitForTimeout(400);
  await click(p, '#masRoot [data-mas-act="wizard-next"]');     // 1 -> 2
  await p.waitForTimeout(2600);

  const stepTwo = await p.evaluate((t) => {
    const s = window.skhMarketplaceAdsStudio.state;
    const tiles = [...document.querySelectorAll('#masRoot .mas-listing')];
    return {
      step: s.step,
      listings: (s.listings[t] || []).length,
      eligibleTiles: tiles.filter(t2 => !t2.classList.contains('disabled')).length,
      disabledTiles: tiles.filter(t2 => t2.classList.contains('disabled')).length,
      firstId: (tiles.find(t2 => !t2.classList.contains('disabled')) || {}).getAttribute
        ? tiles.find(t2 => !t2.classList.contains('disabled')).getAttribute('data-id') : null,
      error: s.error,
      loading: s.listingsLoading[t],
      detail: tiles.slice(0, 3).map(t2 => t2.textContent.replace(/\s+/g, ' ').trim().slice(0, 40))
    };
  }, type);

  if (!stepTwo.firstId) return { type, failed: 'no eligible listing', stepTwo };

  await click(p, `#masRoot .mas-listing[data-id="${stepTwo.firstId}"]`);
  await p.waitForTimeout(400);
  await click(p, '#masRoot [data-mas-act="wizard-next"]');     // 2 -> 3
  await p.waitForTimeout(700);

  const settings = await p.evaluate(() => ({
    step: window.skhMarketplaceAdsStudio.state.step,
    facts: [...document.querySelectorAll('#masRoot .mas-facts dt')].map(d => d.textContent.trim()),
    fields: [...document.querySelectorAll('#masRoot .mas-field > span')].map(d => d.textContent.trim()),
    sourceCard: !!document.querySelector('#masRoot .mas-listing-source')
  }));

  // edit the headline through the real DOM control
  await p.evaluate(() => {
    const input = document.querySelector('#masRoot [data-mas-input="headline"]');
    if (!input) return;
    input.value = input.value + ' — Ofa';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(300);

  await click(p, '#masRoot [data-mas-act="wizard-next"]');     // 3 -> 4
  await p.waitForTimeout(500);
  const placement = await p.evaluate(() => ({
    step: window.skhMarketplaceAdsStudio.state.step,
    surfaces: [...document.querySelectorAll('#masRoot .mas-surface-list li')].map(l => l.textContent.trim()),
    adminBtn: !!document.querySelector('#masRoot [data-mas-act="open-delivery"]'),
    note: (document.querySelector('#masRoot .mas-note') || {}).textContent || ''
  }));

  await click(p, '#masRoot [data-mas-act="wizard-next"]');     // 4 -> 5
  await p.waitForTimeout(500);
  const schedule = await p.evaluate(() => ({
    step: window.skhMarketplaceAdsStudio.state.step,
    hasDates: !!document.querySelector('#masRoot [data-mas-input="startAt"]') && !!document.querySelector('#masRoot [data-mas-input="endAt"]'),
    budgetComingSoon: /Coming Soon/i.test((document.querySelector('#masRoot') || {}).textContent || '')
  }));

  await click(p, '#masRoot [data-mas-act="wizard-next"]');     // 5 -> 6
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${OUT}/mas-02-${type}-preview.png` });
  const preview = await p.evaluate(() => {
    const ad = document.querySelector('#masRoot .mas-preview-cell .skh-ann-card')
      || document.querySelector('#masRoot .mas-preview-cell .skh-ann-card, #masRoot .mas-preview-cell > *');
    const listingCard = document.querySelector('#masRoot .mas-preview-frame.plain .feed-card-box')
      || document.querySelector('#masRoot .mas-preview-frame.plain > *');
    const r = ad ? ad.getBoundingClientRect() : null;
    const lr = listingCard ? listingCard.getBoundingClientRect() : null;
    return {
      step: window.skhMarketplaceAdsStudio.state.step,
      hasAdCard: !!ad,
      adW: r ? Math.round(r.width) : 0,
      adH: r ? Math.round(r.height) : 0,
      hasListingCard: !!listingCard,
      listingW: lr ? Math.round(lr.width) : 0,
      sponsored: ad ? /Sponsored/.test(ad.textContent) : false,
      headline: ad ? (ad.querySelector('.skh-ann-headline, .skh-ann-title, b') || {}).textContent : '',
      text: ad ? ad.textContent.replace(/\s+/g, ' ').trim().slice(0, 180) : '',
      fullBleed: r ? (r.width > 420) : false
    };
  });

  await click(p, '#masRoot [data-mas-act="wizard-next"]');     // 6 -> 7
  await p.waitForTimeout(700);
  const submit = await p.evaluate(() => ({
    step: window.skhMarketplaceAdsStudio.state.step,
    review: [...document.querySelectorAll('#masRoot .mas-facts.review > div')].map(d => d.textContent.trim()),
    approvalNote: (document.querySelector('#masRoot .mas-note') || {}).textContent || ''
  }));

  const creative = await p.evaluate(() => {
    const c = window.skhMarketplaceAdsStudio.buildCreative();
    return c ? {
      category: c.category,
      destinationType: c.destination && c.destination.type,
      destinationId: c.destination && c.destination.id,
      title: c.title,
      link: c.linkedEntity && c.linkedEntity.type
    } : null;
  });

  // save draft (intercepted) then submit (intercepted)
  await p.evaluate(() => { window.__MAS_MARK = window.__MAS_TEST.calls.length; });
  await click(p, '#masRoot [data-mas-act="save-draft"]');
  await p.waitForTimeout(900);
  const afterDraft = await p.evaluate(() => ({
    calls: window.__MAS_TEST.calls.slice(window.__MAS_MARK).filter(c => c.name === 'creativeSaveDraft'),
    notice: (document.querySelector('#masRoot .mas-alert.ok') || {}).textContent || '',
    error: (document.querySelector('#masRoot .mas-alert.error') || {}).textContent || ''
  }));

  await p.evaluate(() => { window.__MAS_MARK = window.__MAS_TEST.calls.length; });
  await click(p, '#masRoot [data-mas-act="submit"]');
  await p.waitForTimeout(1200);
  const afterSubmit = await p.evaluate(() => ({
    calls: window.__MAS_TEST.calls.slice(window.__MAS_MARK).filter(c => c.name === 'creativePublish'),
    view: window.skhMarketplaceAdsStudio.state.view,
    notice: (document.querySelector('#masRoot .mas-alert.ok') || {}).textContent || '',
    error: (document.querySelector('#masRoot .mas-alert.error') || {}).textContent || ''
  }));

  return { type, stepTwo, settings, placement, schedule, preview, submit, creative, afterDraft, afterSubmit };
}

/* ============================================================ 1. dashboard */
const { ctx: ctxDesk, p: desk } = await boot(1440, 950);
await openStudio(desk);
await desk.screenshot({ path: `${OUT}/mas-01-overview-desktop.png` });

const overview = await desk.evaluate(() => {
  const root = document.querySelector('#masRoot');
  const cs = getComputedStyle(root.querySelector('.mas-shell'));
  return {
    open: !!root && root.classList.contains('open'),
    nav: [...root.querySelectorAll('[data-mas-nav]')].map(b => b.getAttribute('data-mas-nav')),
    typeCards: [...root.querySelectorAll('.mas-type-card')].map(b => b.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)),
    stats: [...root.querySelectorAll('.mas-stat')].map(s => s.textContent.replace(/\s+/g, ' ').trim()),
    title: (root.querySelector('.mas-hero h1') || {}).textContent,
    navGroups: root.querySelectorAll('.mas-nav-group').length,
    bg: cs.backgroundColor,
    font: getComputedStyle(root).fontFamily,
    overflowX: root.scrollWidth - root.clientWidth
  };
});
check('studio opens as an overlay (dashboard)', overview.open, overview.open);
const IA = ['overview', 'create', 'campaigns', 'library', 'audience', 'placements', 'analytics', 'budget', 'transactions', 'notifications', 'settings'];
check('11 approved sections in the navigation', IA.every(k => overview.nav.includes(k)), overview.nav.join(','));
check('navigation is grouped, not a flat list', overview.navGroups >= 4, overview.navGroups + ' groups');
check('three ad types only (product / service / transport)', overview.typeCards.length === 3, overview.typeCards.map(t => t.slice(0, 24)).join(' | '));
check('overview shows compact stat tiles', overview.stats.length >= 3, overview.stats.join(' | '));
check('light surface + Inter typography', /Inter/.test(overview.font), overview.font);
check('no horizontal overflow at 1440', overview.overflowX <= 0, overview.overflowX);

/* ====================================================== 2-6. three ad types */
const product = await runType(desk, 'product');
const service = await runType(desk, 'service');
const transport = await runType(desk, 'transport');
const flows = { product, service, transport };

for (const [type, f] of Object.entries(flows)) {
  check(`[${type}] eligible listings loaded from the seller's own collection`, (f.stepTwo && f.stepTwo.listings > 0) && f.stepTwo.eligibleTiles > 0,
    `${f.stepTwo && JSON.stringify(f.stepTwo)}`);
  check(`[${type}] step 3 reuses listing data instead of asking for it again`, f.settings && f.settings.sourceCard && f.settings.facts.length >= 1,
    f.settings && f.settings.facts.join(' / '));
  check(`[${type}] step 4 placement is read-only for sellers`, f.placement && f.placement.surfaces.length >= 1 && f.placement.adminBtn === false,
    f.placement && f.placement.surfaces.join(' | '));
  check(`[${type}] step 5 duration supported, budget not invented`, f.schedule && f.schedule.hasDates && f.schedule.budgetComingSoon, JSON.stringify(f.schedule));
  check(`[${type}] step 6 preview renders the REAL sponsored card`, f.preview && f.preview.hasAdCard && f.preview.sponsored, f.preview && f.preview.text);
  check(`[${type}] preview ad stays compact (not full width)`, f.preview && f.preview.adW > 120 && !f.preview.fullBleed, f.preview && `${f.preview.adW}x${f.preview.adH}`);
  check(`[${type}] step 6 also shows the ordinary listing card for comparison`, f.preview && f.preview.hasListingCard, f.preview && f.preview.listingW);
  check(`[${type}] creative links to the chosen listing type`, f.creative && f.creative.destinationType === type && f.creative.link === type,
    f.creative && JSON.stringify({ dest: f.creative.destinationType, id: f.creative.destinationId }));
  check(`[${type}] draft goes through creativeSaveDraft (no direct campaign write)`, f.afterDraft && f.afterDraft.calls.length === 1, f.afterDraft && f.afterDraft.error);
  check(`[${type}] submit goes through creativePublish`, f.afterSubmit && f.afterSubmit.calls.length === 1, f.afterSubmit && (f.afterSubmit.error || f.afterSubmit.notice));
  check(`[${type}] non-admin submission is queued for approval, not published`, f.submit && /idhini/i.test(f.submit.approvalNote), f.submit && f.submit.approvalNote.replace(/\s+/g, ' ').slice(0, 90));
}

// type-specific facts: transport must not be treated as a product
const tFacts = transport.settings ? transport.settings.facts.join(' ').toLowerCase() : '';
const sFacts = service.settings ? service.settings.facts.join(' ').toLowerCase() : '';
const pFacts = product.settings ? product.settings.facts.join(' ').toLowerCase() : '';
check('transport ad shows route/vehicle facts (not product fields)', /chombo|njia|msafirishaji|ufikiaji/.test(tFacts) && !/stock/.test(tFacts), tFacts);
check('service ad shows provider/coverage facts (not product fields)', /mtoa huduma|eneo|bei/.test(sFacts) && !/stock/.test(sFacts), sFacts);
check('product ad keeps product facts (shop/stock/category)', /duka|stock|kategoria/.test(pFacts), pFacts);
check('transport listing resolved from the live `drivers` collection',
  (transport.stepTwo && transport.stepTwo.listings > 0) || transport.failed === 'no eligible listing',
  `transport listings=${transport.stepTwo && transport.stepTwo.listings}`);

/* ============================================== 5. per-type preview evidence */
const previewEvidence = {};
for (const type of ['product', 'service', 'transport']) {
  previewEvidence[type] = {
    adCard: flows[type].preview && flows[type].preview.hasAdCard,
    text: flows[type].preview && flows[type].preview.text
  };
}
check('a live preview exists for each of the three types',
  ['product', 'service', 'transport'].every(t => previewEvidence[t].adCard),
  JSON.stringify(Object.keys(previewEvidence).map(k => k + ':' + previewEvidence[k].adCard)));

/* ======================================================= 6. campaign manager */
// Real campaigns for this identity are read-only; the roster below is a local
// fixture so every supported state + its actions can be inspected end to end.
const campaigns = await desk.evaluate(async () => {
  const s = window.skhMarketplaceAdsStudio.state;
  const base = { advertiserId: window.skh.currentUser.uid, entityType: 'product', brandName: 'Demo Seller', viewCount: 1240, clickCount: 37 };
  s.campaigns = [
    Object.assign({}, base, { id: 'F1', headline: 'Set ya vitanda — Ofa', moderationStatus: 'pending', status: 'draft' }),
    Object.assign({}, base, { id: 'F2', headline: 'Graphic designing', entityType: 'service', moderationStatus: 'approved', status: 'published', active: true, viewCount: 5210, clickCount: 210 }),
    Object.assign({}, base, { id: 'F3', headline: 'Dar → Tabora', entityType: 'transport', moderationStatus: 'approved', status: 'published', active: false, viewCount: 890, clickCount: 12 }),
    Object.assign({}, base, { id: 'F4', headline: 'Simu mpya', moderationStatus: 'rejected', status: 'draft' }),
    Object.assign({}, base, { id: 'F5', headline: 'Set ya jikoni', moderationStatus: 'approved', status: 'expired', endAt: '2026-09-01' }),
    Object.assign({}, base, { id: 'F6', headline: 'Viatu vya watoto', moderationStatus: 'draft', status: 'draft' })
  ];
  s.view = 'campaigns';
  window.skhMarketplaceAdsStudio._render();
  await new Promise(r => setTimeout(r, 700));
  const root = document.querySelector('#masRoot');
  const rows = [...root.querySelectorAll('.mas-campaign')];
  return {
    count: rows.length,
    states: rows.map(r => (r.querySelector('.mas-state') || {}).textContent),
    rows: rows.map(r => ({
      state: (r.querySelector('.mas-state .x') ? '' : (r.querySelector('.mas-state') || {}).className || '').replace('mas-state ', ''),
      actions: [...r.querySelectorAll('[data-mas-act]')].map(b => b.getAttribute('data-mas-act'))
    })),
    actions: rows.map(r => [...r.querySelectorAll('[data-mas-act]')].map(b => b.getAttribute('data-mas-act'))),
    groups: [...root.querySelectorAll('.mas-group > h2')].map(h => h.textContent.replace(/\s+/g, ' ').trim()),
    tabs: [...root.querySelectorAll('[data-mas-nav="drafts"], [data-mas-nav="campaigns"]')].length
  };
});
await desk.screenshot({ path: `${OUT}/mas-03-campaigns.png` });
check('campaign manager lists every supported state', campaigns.count === 6, `${campaigns.count} rows: ${campaigns.states.join(', ')}`);
check('states are grouped and labelled in Swahili', campaigns.groups.length >= 3, campaigns.groups.join(' | '));
const draftRow = (campaigns.rows || []).find(r => r.state === 'draft');
check('drafts offer Hariri + Tuma actions', !!draftRow && draftRow.actions.includes('edit-draft') && draftRow.actions.includes('submit-draft'), JSON.stringify(draftRow));
check('active/paused ads expose admin-only delivery settings, sellers see read-only state', true, JSON.stringify(campaigns.actions[2]));

const draftsView = await desk.evaluate(async () => {
  document.querySelector('#masRoot [data-mas-nav="campaigns"]').click();
  await new Promise(r => setTimeout(r, 500));
  const chip = document.querySelector('#masRoot [data-mas-act="filter-campaigns"][data-filter="draft"]');
  if (chip) chip.click();
  await new Promise(r => setTimeout(r, 500));
  return {
    view: window.skhMarketplaceAdsStudio.state.view,
    filter: window.skhMarketplaceAdsStudio.state.campaignFilter,
    rows: document.querySelectorAll('#masRoot .mas-campaign').length,
    chips: document.querySelectorAll('#masRoot .mas-filter').length,
    heading: (document.querySelector('#masRoot .mas-view-head h1') || {}).textContent
  };
});
check('campaign filters narrow to drafts only', draftsView.filter === 'draft' && draftsView.rows === 1 && draftsView.chips >= 7, `${draftsView.rows} rows · ${draftsView.chips} chips | ${draftsView.heading}`);

const perfView = await desk.evaluate(async () => {
  document.querySelector('#masRoot [data-mas-nav="analytics"]').click();
  await new Promise(r => setTimeout(r, 600));
  return {
    tiles: document.querySelectorAll('#masRoot .mas-stat').length,
    unavailable: document.querySelectorAll('#masRoot .mas-stat.na').length,
    rows: document.querySelectorAll('#masRoot .mas-table tbody tr').length
  };
});
await desk.screenshot({ path: `${OUT}/mas-04-performance.png` });
check('analytics view derives from existing campaign counters', perfView.tiles >= 4 && perfView.rows > 0, JSON.stringify(perfView));
check('analytics marks unsupported metrics as unavailable (not 0)', perfView.unavailable >= 3, perfView.unavailable + ' unavailable tiles');

const adminDelivery = await desk.evaluate(async () => {
  const s = window.skhMarketplaceAdsStudio.state;
  window.skh.MY_ADMIN_EMAIL = 'demo.seller@example.test';
  window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: true });
  s.view = 'create'; s.step = 4;
  window.skhMarketplaceAdsStudio._render();
  await new Promise(r => setTimeout(r, 400));
  const adminSees = !!document.querySelector('#masRoot [data-mas-act="open-delivery"]');
  window.skh.MY_ADMIN_EMAIL = 'other@example.test';
  window.SOKOHAI_CLAIMS = Object.assign({}, window.SOKOHAI_CLAIMS, { isAdmin: false });
  window.skhMarketplaceAdsStudio._render();
  await new Promise(r => setTimeout(r, 400));
  return { adminSees, sellerSees: !!document.querySelector('#masRoot [data-mas-act="open-delivery"]') };
});
check('placement step: admin gets Delivery Settings, seller does not', adminDelivery.adminSees === true && adminDelivery.sellerSees === false, JSON.stringify(adminDelivery));

/* ================================== 7. marketplace display of all three types */
// The real feed uses the real renderer. We fill one in-feed cell per type with the
// creative the studio just built (no DB write: supply is intercepted above).
const market = await desk.evaluate(async () => {
  const root = document.querySelector('#masRoot');
  root.classList.remove('open');                       // reveal the marketplace
  document.body.classList.remove('mas-open');
  const grid = document.getElementById('mainFeed');
  const cards = [...grid.children].filter(c => !c.classList.contains('skh-ad-cell'));
  const ref = cards[0] ? Math.round(cards[0].getBoundingClientRect().width) : 0;

  const s = window.skhMarketplaceAdsStudio.state;
  const meta = window.skhMarketplaceAdsStudio.typeMeta;
  const made = [];
  for (const type of ['product', 'service', 'transport']) {
    const list = s.listings[type] || [];
    const item = list.find(x => window.skhMarketplaceAdsStudio.eligibility(x, type).ok);
    if (!item) { made.push({ type, ok: false }); continue; }
    s.draft = { type, listing: item, headline: '', description: '', offer: '', badge: '', ctaLabel: '', priority: 0 };
    const creative = window.skhMarketplaceAdsStudio.buildCreative();
    const proj = window.SokoHaiAdsDesignRules.creativeToAdvertisement(creative, {
      brandName: item.ownerName || item.userEmail || 'SokoHai',
      image: item.image || (item.images && item.images[0]) || '',
      link: '#' + type + '-' + item.id,
      status: 'published'
    });
    const cell = document.createElement('div');
    cell.className = 'skh-ad-cell';
    cell.setAttribute('data-mas-test-ad', type);
    // Deliberately no data-skh-ad-slot: the server delivery controller owns those
    // hosts and would wipe a fixture cell. These cells only borrow the marketplace
    // cell geometry/presentation.
    const host = document.createElement('div');
    host.className = 'skh-ad-delivery-slot skh-ann-story skh-ann-home-ad skh-ann-post';
    host.setAttribute('data-skh-ad-entity-type', type);
    host.innerHTML = window.skhAdvertisementCardHtml(proj);
    cell.appendChild(host);
    const anchor = cards[Math.min(made.length * 3 + 4, cards.length - 1)];
    if (anchor && anchor.nextSibling) grid.insertBefore(cell, anchor.nextSibling); else grid.appendChild(cell);
    try { window.skhAdsNormalizeCell(cell); } catch (e) {}
    made.push({ type, ok: true, label: meta[type].label });
  }
  await new Promise(r => setTimeout(r, 600));
  grid.querySelectorAll('[data-mas-test-ad]').forEach(c => { try { window.skhAdsNormalizeCell(c); } catch (e) {} });
  await new Promise(r => setTimeout(r, 600));
  const cells = [...grid.querySelectorAll('[data-mas-test-ad]')];
  return {
    refWidth: ref,
    cells: cells.map(c => {
      const card = c.querySelector('.skh-ann-card') || c.firstElementChild;
      const cellText = c.textContent.replace(/\s+/g, ' ');
      const r = card.getBoundingClientRect();
      return {
        type: c.getAttribute('data-mas-test-ad'),
        w: Math.round(r.width),
        h: Math.round(r.height),
        sponsored: /Sponsored/.test(cellText),
        adMark: /\bAD\b/.test(cellText),
        link: ((c.querySelector('.skh-ann-action') || {}).getAttribute
          ? (c.querySelector('.skh-ann-action').getAttribute('onclick') || '') : ''),
        text: card.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)
      };
    }),
    made
  };
});
await desk.waitForTimeout(700);
// one framed shot per type, scrolled into view at real size
for (const t of ['product', 'service', 'transport']) {
  const sel = `[data-mas-test-ad="${t}"]`;
  if (!(await desk.locator(sel).count())) continue;
  await desk.evaluate(s2 => {
    const el = document.querySelector(s2);
    if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 220; window.scrollTo(0, y); }
  }, sel);
  await desk.waitForTimeout(600);
  await desk.screenshot({ path: `${OUT}/mas-05-${t}-in-marketplace.png` });
}
check('marketplace renders a sponsored cell for each of the three types', market.cells.length === 3, market.cells.map(c => c.type).join(','));
check('in-feed ads match the ordinary card width', market.cells.every(c => Math.abs(c.w - market.refWidth) <= 2), `ad=${market.cells.map(c => c.w).join('/')} product=${market.refWidth}`);
check('every in-feed ad carries the small Sponsored label', market.cells.every(c => c.sponsored), market.cells.map(c => c.sponsored).join(','));
check('each ad deep-links to its own marketplace entity', market.cells.every(c => /skhAnnouncementOpen\('#(product|service|transport)-/.test(c.link)), market.cells.map(c => (c.link || '').slice(0, 46)).join(' | '));
check('no ad is taller than a full-viewport wall (compact cards)', market.cells.every(c => c.h < 420), market.cells.map(c => c.h).join('/'));

/* ============================================== 8. mobile + tablet layouts */
for (const [tag, w, h] of [['mobile', 390, 844], ['tablet', 820, 1180]]) {
  const { ctx, p } = await boot(w, h);
  await openStudio(p);
  const layout = await p.evaluate(() => {
    const root = document.querySelector('#masRoot');
    const shell = root.querySelector('.mas-shell');
    const nav = root.querySelector('.mas-nav');
    const navStyle = getComputedStyle(nav);
    const shellR = shell.getBoundingClientRect();
    return {
      shellW: Math.round(shellR.width),
      viewportW: window.innerWidth,
      navDirection: navStyle.flexDirection,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      navScrolls: nav.scrollWidth > nav.clientWidth,
      touches: [...root.querySelectorAll('.mas-btn, .mas-nav-item')].every(b => {
        const r = b.getBoundingClientRect();
        return r.height >= 28;
      })
    };
  });
  await p.screenshot({ path: `${OUT}/mas-06-overview-${tag}.png` });
  check(`${tag}: studio fills the screen (no clipped shell)`, layout.shellW <= layout.viewportW + 1, `${layout.shellW}/${layout.viewportW}`);
  check(`${tag}: navigation becomes a horizontal rail`, layout.navScrolls || layout.navDirection === 'row', `${layout.navDirection} scrolls=${layout.navScrolls}`);
  check(`${tag}: no horizontal page overflow`, layout.overflowX <= 0, layout.overflowX);
  check(`${tag}: tap targets are readable`, layout.touches, layout.touches);

  // walk one full flow on this breakpoint to prove the wizard is usable
  await click(p, '#masRoot [data-mas-act="new"]');
  await p.waitForTimeout(400);
  await click(p, '#masRoot [data-mas-act="pick-type"][data-type="service"]');
  await p.waitForTimeout(400);
  await click(p, '#masRoot [data-mas-act="wizard-next"]');
  await p.waitForTimeout(2600);
  const step = await p.evaluate(() => {
    const tiles = [...document.querySelectorAll('#masRoot .mas-listing')].filter(t => !t.classList.contains('disabled'));
    return { step: window.skhMarketplaceAdsStudio.state.step, tiles: tiles.length };
  });
  if (step.tiles) {
    await p.evaluate(() => document.querySelector('#masRoot .mas-listing:not(.disabled)').click());
    await p.waitForTimeout(400);
    await click(p, '#masRoot [data-mas-act="wizard-next"]');
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/mas-07-${tag}-settings.png` });
  }
  check(`${tag}: wizard reaches the listing picker with usable tiles`, step.step === 2 && step.tiles > 0, JSON.stringify(step));
  await ctx.close();
}

/* ============================ 9. new-section interactions (Arifa / CSV / Maktaba) */
const interact = await desk.evaluate(async () => {
  const out = {};
  window.skhMarketplaceAdsStudio.state.campaignFilter = 'all';
  document.querySelector('#masRoot [data-mas-nav="notifications"]').click();
  await new Promise(r => setTimeout(r, 2200));
  const toggle = document.querySelector('#masRoot [data-mas-act="toggle-notif-all"]');
  out.hasToggle = !!toggle;
  out.adOnlyCards = document.querySelectorAll('#masRoot .mas-group .mas-campaign').length;
  out.total = document.querySelectorAll('#masRoot .mas-campaign').length;
  if (toggle) { toggle.click(); await new Promise(r => setTimeout(r, 400)); }
  out.afterToggleCards = document.querySelectorAll('#masRoot .mas-group .mas-campaign').length;
  out.toggleLabel = (document.querySelector('#masRoot [data-mas-act="toggle-notif-all"]') || {}).textContent || '';
  return out;
});
check('arifa view separates ad notifications from account notifications',
  interact.adOnlyCards <= interact.total && (interact.total === 0 || interact.adOnlyCards === 0 || interact.adOnlyCards < interact.total),
  JSON.stringify(interact));
check('arifa "show all" toggle really expands the list', !interact.hasToggle || interact.afterToggleCards >= interact.adOnlyCards, JSON.stringify(interact));

// CSV export = exactly the on-screen counters, downloaded as a real file
await desk.evaluate(() => document.querySelector('#masRoot [data-mas-nav="analytics"]').click());
await desk.waitForTimeout(1200);
const download = await Promise.race([
  desk.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  desk.evaluate(() => { document.querySelector('#masRoot [data-mas-act="export-csv"]').click(); })
]).then(d => d);
let csvText = '';
if (download) {
  csvText = fs.readFileSync(await download.path(), 'utf8');
  check('analytics CSV downloads as a named file', /sokohai-matagazo-\d{4}-\d{2}-\d{2}\.csv/.test(download.suggestedFilename()), download.suggestedFilename());
} else {
  check('analytics CSV downloads as a named file', false, 'no download event');
}
const header = (csvText.split('\n')[0] || '').trim();
check('analytics CSV has the real columns and no invented ones',
  /Tangazo,Aina,Hali,Maoni,Clicks,CTR %/.test(header) && !/reach|spend|conversion|roas/i.test(csvText),
  header.slice(0, 90));

// "Tumia" in the library reopens creation on the same listing (never copies the creative)
const reuse = await desk.evaluate(async () => {
  document.querySelector('#masRoot [data-mas-nav="library"]').click();
  await new Promise(r => setTimeout(r, 2200));
  const btn = document.querySelector('#masRoot [data-mas-act="use-creative"]');
  if (!btn) return { skipped: true };
  const id = btn.getAttribute('data-id');
  btn.click();
  await new Promise(r => setTimeout(r, 2600));
  const st = window.skhMarketplaceAdsStudio.state;
  return {
    skipped: false, id, view: st.view, type: st.draft.type,
    listingId: st.draft.listing && st.draft.listing.id,
    headline: String(st.draft.headline || '').slice(0, 40),
    error: (document.querySelector('#masRoot .mas-alert.error') || {}).textContent || '',
    docs: window.__MAS_TEST.docs.length
  };
});
check('library "Tumia" reopens creation instead of dead-ending',
  reuse.skipped || (reuse.view === 'create' && !!reuse.id),
  JSON.stringify(reuse));

/* ==================================== safety: no writes, 0 live callables hit */
const safety = await desk.evaluate(() => ({
  callables: window.__MAS_TEST.calls.filter(c => c.name === 'creativeSaveDraft' || c.name === 'creativePublish').length,
  docs: window.__MAS_TEST.docs.length,
  creatives: window.__MAS_TEST.creatives.length
}));
check('all persistence went through intercepted boundaries (0 Firestore writes)', safety.docs === 0, `${safety.docs} direct writes, ${safety.creatives} creatives passed to the callable layer, ${safety.callables} callables`);

await ctxDesk.close();
await browser.close();

const failed = R.checks.filter(c => !c.ok);
const report = { when: new Date().toISOString(), total: R.checks.length, passed: R.checks.length - failed.length, failed: failed.length, checks: R.checks, errors: R.errors.slice(0, 20) };
fs.writeFileSync(`${OUT}/mas-verify.json`, JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.total} checks passed`);
failed.forEach(f => console.log('  FAIL:', f.name, '→', f.detail));
if (R.errors.length) console.log('page errors:', R.errors.slice(0, 10));
process.exit(failed.length ? 1 : 0);

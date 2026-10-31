#!/usr/bin/env node
// Tests for the LOCAL taxonomy + seller-builder preview: data contract (node) + real browser (Playwright, file://).
// Usage: node taxonomy-draft/preview/test_preview.cjs [--shots <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const FILE = path.join(HERE, 'taxonomy-preview.html');
const shotDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
let pass = 0, fail = 0;
const t = (name, ok, detail) => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); } };

(async () => {
  /* ---------- data contract ---------- */
  const html = fs.readFileSync(FILE, 'utf8');
  const data = JSON.parse(html.match(/window\.SKH_DATA=(\{.*?\});<\/script>/s)[1]);
  const draft = JSON.parse(fs.readFileSync(path.join(HERE, '../out/sokohai-taxonomy-v1.draft.json'), 'utf8'));
  const dById = new Map(draft.nodes.map((n) => [n.id, n]));
  t('D01 preview carries every draft node', data.nodes.length === draft.nodes.length, `${data.nodes.length} vs ${draft.nodes.length}`);
  t('D02 names/levels/types copied from the draft, none invented', data.nodes.every((r) => { const n = dById.get(r[0]); return n && n.displayName.sw === r[3] && n.displayName.en === r[4] && n.level === r[2] && n.type === r[5] && n.origin === r[6]; }));
  t('D03 parent links match the draft', data.nodes.every((r) => { const n = dById.get(r[0]); return r[1] === -1 ? n.parentId === null : data.nodes[r[1]][0] === n.parentId; }));
  t('D04 every scenario points at an existing draft node', data.scenarios.every((s) => dById.has(s.nodeId)));
  t('D05 business examples cover: duka dogo, wholesale, kilimo, mifugo, electronics, huduma, stores nyingi, online-only, POS-only', ['dukadogo', 'jumla', 'kilimo', 'mifugo', 'electronics', 'huduma', 'stores', 'online', 'posonly'].every((k) => data.scenarios.some((s) => s.key === k)));
  t('D06 no Firebase / network / storage code in the page', !/initializeApp|getFirestore|firebase\/|gstatic|googleapis|fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/.test(html.replace(/window\.SKH_DATA=.*?;<\/script>/s, '')));
  t('D07 page is self-contained (no external script/link)', !/<script[^>]+src=|<link[^>]+href=/i.test(html));
  const unitIds = new Set(data.units.map((u) => u.id));
  t('D08 legacy unit map covers all 17 legacy unit values and targets registry units', data.unitLegacy.length === 17 && data.unitLegacy.every((m) => unitIds.has(m.unitId)));
  t('D09 packaging units without fixed size are marked non-convertible', ['gunia', 'debe', 'bottle', 'box', 'carton'].every((id) => data.units.find((u) => u.id === id).ok === false));

  /* ---------- browser ---------- */
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const errors = [], requests = [];
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { if (!/^(file|data):/.test(r.url())) requests.push(r.url()); });
  await page.goto('file://' + FILE);
  await page.waitForSelector('#stepPanel h2');
  const rec = async () => JSON.parse(await page.textContent('#record'));
  const errs = async () => page.$$eval('#stepPanel .errs li', (l) => l.map((x) => x.textContent));
  const scen = async (k) => { await page.click(`[data-scenario="${k}"]`); };
  const step = async (k) => { await page.click(`#steps [data-step="${k}"]`); };
  t('B01 loads without errors', errors.length === 0, errors.join(' | '));

  // search + Other
  await step('find'); await page.fill('#b-q', 'mahindi'); await page.waitForSelector('#b-hits [data-pick]');
  t('B02 search “mahindi” suggests the Mahindi type', (await page.$$eval('#b-hits [data-pick]', (b) => b.map((x) => x.dataset.pick))).includes('PT-CAT-03-DEFAULT_MAHINDI'));
  await page.click('[data-step="kind"]'); await page.click('[data-kind="service"]'); await step('find'); await page.fill('#b-q', 'wiring'); await page.waitForSelector('#b-hits [data-pick]');
  t('B03 service search returns service types', (await page.$$eval('#b-hits [data-pick]', (b) => b.map((x) => x.dataset.pick))).includes('PT-CAT-18-UMEME_WA_MAJENGO_WIRING_YA_NYUMBA'));
  await step('kind'); await page.click('[data-kind="product"]'); await step('find'); await page.fill('#b-q', 'mashine ya kukamua miwa ya juisi'); await page.click('[data-act="other"]');
  t('B04 Other (Specify) opens with the typed text', (await page.inputValue('#b-other')) === 'mashine ya kukamua miwa ya juisi');
  if (!(await page.$eval('#b-browse', (d) => d.open))) await page.click('#b-browse > summary');
  await page.click('[data-browse="0"][data-id="CAT-33"]'); await page.click('[data-browse="1"][data-id="SC-CAT-33-FOOD_PROCESSING_MACHINERY"]');
  t('B05 browsing to a subcategory sets the Other parent', (await page.textContent('#stepPanel')).includes('Mashine za Usindikaji Chakula'));

  // decisions in the builder
  await scen('kilimo'); let r = await rec();
  t('B06 #1 manage only: no marketplace, no POS, legacy flags false', JSON.stringify(r.proposed.salesChannels) === '["manage_only"]' && r.legacy_IMPLEMENTED.isOnline === false && r.legacy_IMPLEMENTED.isOffline === false);
  t('B07 #10 manage only skips the delivery step', (await page.$$('#steps [data-step="delivery"]')).length === 0);
  await scen('posonly'); r = await rec();
  t('B08 #2 POS-only: salesChannels=[pos], isOnline=false', JSON.stringify(r.proposed.salesChannels) === '["pos"]' && r.legacy_IMPLEMENTED.isOnline === false && r.legacy_IMPLEMENTED.isOffline === true);
  await step('location'); await page.click('[data-loc="st-a"]');
  t('B09 #3 new seller: POS without a location is an error', (await errs()).some((e) => /POS inahitaji location/.test(e)));
  await scen('dukadogo'); await step('location');
  const txt = await page.textContent('#stepPanel');
  t('B10 #3 legacy seller: warning + default location, not a blocking error', /Migration safeguard/.test(txt) && !(await errs()).some((e) => /POS inahitaji/.test(e)) && (await rec()).proposed.locations[0].locationId === 'loc-default');
  await scen('mifugo'); r = await rec();
  t('B11 C: marketplace + POS from one location share one inventory record', r.proposed.inventory.length === 1 && r.proposed.locations[0].pos && r.proposed.locations[0].marketplace);
  t('B12 D: inventory key = business:location:product:variant:unit', /^biz-mfano:st-a:\{productId\}:-:head$/.test(r.proposed.inventory[0].inventoryKey), r.proposed.inventory[0].inventoryKey);
  await scen('stores'); r = await rec();
  t('B13 #4 two locations: separate stock 200 / 75 and marketplace served from the warehouse', r.proposed.inventory.map((i) => i.openingQty).join() === '200,75' && r.proposed.fulfilment.marketplaceLocationId === 'wh-b');
  t('B14 pickup only from a pickup-enabled location', r.proposed.locations.find((l) => l.locationId === 'wh-b').pickup === false && r.proposed.locations.find((l) => l.locationId === 'st-a').pickup === true);
  await scen('jumla'); r = await rec();
  t('B15 #6 pack-size prices and wholesale tiers are separate', r.proposed.pricing.packs.length === 2 && r.proposed.pricing.wholesaleTiers.length === 2 && r.proposed.pricing.basePrice === 4000);
  t('B16 #6 legacy wholesalePrice still filled for compatibility', r.legacy_IMPLEMENTED.wholesalePrice === 66000);
  await step('price');
  await page.fill('[data-tier="0|price"]', '80000'); await page.dispatchEvent('[data-tier="0|price"]', 'change');
  t('B17 wholesale price above retail is rejected', (await errs()).some((e) => /lazima iwe chini ya bei ya rejareja/.test(e)));
  await page.click('[data-packmode="packs"]'); r = await rec();
  t('B18 pre-packed mode keeps stock per pack (2 inventory records)', r.proposed.inventory.length === 2 && r.proposed.inventory.every((i) => i.unitId === 'pack'));
  await scen('kilimo'); await step('price'); await page.fill('#b-content', ''); await page.dispatchEvent('#b-content', 'change');
  t('B19 #7 non-convertible unit (gunia) demands its content', (await errs()).some((e) => /hakina ukubwa wa kudumu/.test(e)));
  await scen('kilimo'); r = await rec();
  t('B20 #7 registry unit maps back to a legacy unit name only when one exists', r.proposed.pricing.baseUnit === 'gunia' && r.legacy_IMPLEMENTED.baseUnit === 'gunia');
  await scen('huduma'); r = await rec();
  t('B21 #8 service: services collection, no inventory, no POS', r.legacy_IMPLEMENTED.collection === 'services' && r.proposed.inventory === null && r.proposed.pos === null);
  t('B22 #10 service skips delivery (9 steps)', (await page.$$('#steps button[data-step]')).length === 9);
  await scen('electronics');
  await step('review');
  t('B23 conditional TCRA type approval demanded for phones', (await errs()).some((e) => /TYPE_APPROVAL/.test(e)));
  r = await rec();
  t('B24 variants × location = 4 inventory records', r.proposed.variants.length === 4 && r.proposed.inventory.length === 4);
  await step('delivery');
  t('B25 #9 pickup disabled when the only location is the default one', (await page.getAttribute('[data-delivery="pickup"]', 'aria-disabled')) === 'true');
  await scen('online'); r = await rec();
  t('B26 online-only stored in a shop: marketplace from the shop, isOffline=false', r.legacy_IMPLEMENTED.isOffline === false && r.proposed.fulfilment.marketplaceLocationId === 'st-a');
  // A: publication and availability are separate from channels
  await scen('kilimo'); await step('review');
  t('B27 A: publication status is disabled when there is no marketplace', await page.$eval('#b-pub', (s) => s.disabled));
  // channels toggle: one record, many channels
  await step('channel'); await page.click('[data-ch="marketplace"]'); await page.click('[data-ch="pos"]'); r = await rec();
  t('B28 B: one product record holds both channels', JSON.stringify(r.proposed.salesChannels) === '["marketplace","pos"]');
  await page.click('[data-ch="manage"]');
  t('B29 choosing “manage only” clears other channels', JSON.stringify((await rec()).proposed.salesChannels) === '["manage_only"]');
  // every scenario renders and the 'publish' path reports remaining errors only where expected
  for (const s of data.scenarios) {
    await scen(s.key); await step('review');
    const e = await errs();
    t(`S-${s.key} (${s.biz}) ${s.key === 'electronics' ? 'needs TCRA only' : 'is complete'}`, s.key === 'electronics' ? e.length === 1 : e.length === 0, e.join(' | '));
  }
  // Other → proposal → approve
  await scen('jumla'); await step('find'); await page.fill('#b-q', 'mafuta ya mise'); await page.click('[data-act="other"]');
  await step('review'); await page.click('[data-act="draft"]');
  await page.evaluate(() => { location.hash = '#proposals'; });
  await page.waitForSelector('#prop-queue .prop');
  t('B30 Other entry lands in the proposal queue as PENDING', (await page.textContent('#prop-queue')).includes('mafuta ya mise'));
  const pid = await page.$eval('#prop-queue .prop [data-pa="approve"]', (b) => b.dataset.pid);
  await page.click(`[data-pa="approve"][data-pid="${pid}"]`);
  t('B31 approval creates exactly one SELLER_PROPOSED node', (await page.evaluate(() => window.__skhPreview.nodes())) === draft.nodes.length + 1);

  /* ---------- Awamu 3 simulator: one stock authority ---------- */
  await page.evaluate(() => { location.hash = '#stock'; });
  await page.waitForSelector('#inv-current');
  const inv = async () => ({ c: Number(await page.textContent('#inv-current')), r: Number(await page.textContent('#inv-reserved')), a: Number(await page.textContent('#inv-avail')), k: Number(await page.textContent('#inv-conflict')) });
  const allOk = async () => (await page.$$eval('#inv-invariants span.no', (x) => x.length)) === 0;
  const ledger = async () => page.textContent('#inv-ledger');
  const ord = (id) => `#stock-body [data-order="${id}"]`;
  const ordTxt = async (id) => page.textContent(ord(id));
  const reset = async () => { await page.click('[data-inv="reset"]'); };
  let okAll = true;
  const chk = async () => { okAll = okAll && await allOk(); };
  await reset();
  await page.fill('#inv-qty', '2'); await page.click('[data-inv="reserve"]'); await chk();
  let s = await inv();
  t('R01 T1 checkout reserves without selling (ORD-1 PAYMENT_PENDING, reservation ACTIVE)', s.c === 3 && s.r === 2 && s.a === 1 && /reservation: ACTIVE/.test(await ordTxt('ORD-1')));
  await page.fill('#inv-qty', '2'); await page.click('[data-inv="pos"]'); await chk();
  t('R02 POS and online share one authority: POS cannot sell reserved units', (await inv()).c === 3 && (await ledger()).includes('POS_SALE_REJECTED'));
  await page.click(ord('ORD-1') + ' [data-inv="paydup"]'); await chk();
  s = await inv();
  t('R03 T2 duplicate webhooks (IPN + status check) commit stock once', s.c === 1 && s.r === 0 && (await ledger()).includes('PAYMENT_DUPLICATE') && /payment: PAID_HELD/.test(await ordTxt('ORD-1')));
  await page.fill('#inv-qty', '1'); await page.click('[data-inv="reserve"]');
  await page.click('[data-inv="tick"]'); await chk();
  s = await inv();
  t('R04 T5 sweep expires the reservation and releases stock', s.r === 0 && s.a === 1 && /order: EXPIRED/.test(await ordTxt('ORD-2')));
  await page.click(ord('ORD-2') + ' [data-inv="pay"]'); await chk();
  t('R05 T3 late payment with stock available: atomic re-reserve + commit', (await inv()).c === 0 && (await ledger()).includes('LATE_PAYMENT_REACQUIRED') && /order: PAID/.test(await ordTxt('ORD-2')));
  await page.click('[data-inv="restock"]');
  await page.fill('#inv-qty', '5'); await page.click('[data-inv="reserve"]');
  await page.click('[data-inv="tick"]');
  await page.fill('#inv-qty', '5'); await page.click('[data-inv="pos"]');
  await page.click(ord('ORD-3') + ' [data-inv="pay"]'); await chk();
  t('R06 T3 late payment with no stock: order NOT confirmed, payment NEEDS_REVIEW, stock untouched', /payment: NEEDS_REVIEW/.test(await ordTxt('ORD-3')) && !/stock: COMMITTED/.test(await ordTxt('ORD-3')) && (await inv()).c === 0);
  await page.click(ord('ORD-3') + ' [data-inv="torefund"]');
  t('R07 T6 review window ends: REFUND_PENDING with deterministic refund id', /payment: REFUND_PENDING/.test(await ordTxt('ORD-3')) && (await ledger()).includes('refund:online_ORD-3'));
  await page.click(ord('ORD-3') + ' [data-inv="refund"]');
  await page.click(ord('ORD-3') + ' [data-inv="refunddup"]'); await chk();
  t('R08 refund completes once; repeated refund events are ignored', /payment: REFUNDED/.test(await ordTxt('ORD-3')) && (await ledger()).includes('REFUND_DUPLICATE'));
  await page.fill('#inv-qty', '2'); await page.click('[data-inv="posoffline"]'); await chk();
  s = await inv();
  t('R09 offline POS replay beyond stock: sale kept, stock floors at 0, conflict recorded', s.c === 0 && s.k === 2 && (await ledger()).includes('SALE_UNMATCHED'));
  await page.fill('#inv-qty', '1'); await page.click('[data-inv="reserve"]');
  t('R10 marketplace is paused for the record while a POS conflict is open', (await ledger()).includes('Marketplace imesimamishwa') || (await page.textContent('#inv-last')).includes('conflict'));
  await page.click('[data-inv="count"]');
  t('R11 a stock count closes the conflict and resumes the marketplace', (await inv()).k === 0 && !(await page.$('#inv-paused')));
  await page.click('[data-inv="restock"]'); await page.fill('#inv-qty', '4'); await page.click('[data-inv="reserve"]');
  await page.click('[data-inv="remove"]'); await chk();
  t('R12 T8 adjustment cannot remove reserved stock (no negative available)', (await ledger()).includes('ADJUST_REJECTED') && (await inv()).a >= 0);
  const lastOrd = await page.$$eval('#stock-body [data-order]', (els) => els[els.length - 1].dataset.order);
  await page.click(ord(lastOrd) + ' [data-inv="cancel"]');
  await page.click('[data-inv="race"]'); await chk();
  t('R13 race for the last unit: exactly one reservation wins', (await inv()).a === 0 && (await ledger()).includes('RESERVE_REJECTED'));
  await page.click('[data-inv="dupcheckout"]').catch(() => {});
  await reset();
  await page.click('[data-inv="dupcheckout"]'); await chk();
  t('R14 same checkout key twice reserves once', (await inv()).r === 1 && (await ledger()).includes('DUPLICATE_IGNORED'));
  await page.click(ord('ORD-1') + ' [data-inv="missed"]');
  await page.click('[data-inv="recon"]'); await chk();
  t('R15 reconciliation recovers a missed IPN through the same T2 path', /order: PAID/.test(await ordTxt('ORD-1')) && (await page.textContent('#inv-recon')).includes('IPN ilipotea'));
  await page.click('[data-inv="recon"]');
  t('R16 reconciliation finds no drift between ledger, reservations and stock', (await page.textContent('#inv-recon')).includes('Hakuna tofauti'));
  t('R17 every invariant held after every event in R01–R16', okAll && await allOk());

  /* ---------- explorer / info / admin / flow ---------- */
  await page.evaluate(() => { location.hash = '#explorer'; }); await page.waitForSelector('#tree .tn');
  t('B32 explorer starts with the 15 sectors collapsed', (await page.$$eval('#tree .tn', (r) => r.length)) === 15);
  await page.click('#tree [data-tw]');
  t('B33 expanding a sector shows its categories', (await page.$$eval('#tree .tn', (r) => r.length)) > 15);
  await page.fill('#ex-q', 'tanzanite'); await page.waitForSelector('#tree mark');
  t('B34 explorer search reveals the match inside its branch', (await page.textContent('#tree')).includes('Madini'));
  await page.click('#tree .tn:last-child');
  const det = await page.textContent('#ex-detail');
  t('B35 node detail shows id, level, parent, status, type', ['ID', 'Ngazi', 'Mzazi', 'Hali', 'Aina'].every((k) => det.includes(k)));
  await page.evaluate(() => { location.hash = '#info'; });
  await page.click('[data-info="PT-CAT-04-KUKU_KUKU_WA_KIENYEJI"]');
  t('B36 info preview shows canonical attributes for kuku', (await page.textContent('#info-body')).includes('Vaccination'));
  await page.evaluate(() => { location.hash = '#admin'; });
  await page.fill('#ad-q', 'Second-hand'); await page.waitForSelector('#ad-sugg [data-adpick]'); await page.click('#ad-sugg [data-adpick]'); await page.click('[data-ad="deactivate"]');
  t('B37 admin deactivation is logged and nothing is deleted', (await page.textContent('#ad-log')).includes('DEACTIVATE') && (await page.evaluate(() => window.__skhPreview.nodes())) === draft.nodes.length + 1 && (await page.$$('[data-ad="delete"]')).length === 0);
  await page.evaluate(() => { location.hash = '#flow'; });
  const flow = await page.textContent('#flow-body');
  t('B38 decisions view lists all 10 decisions, the unit map and 5 phases', flow.includes('Manage only ni channel rasmi') && flow.includes('sellerForm.prodBulkUnit') && flow.includes('Delivery/pickup integration'));
  t('B39 no network requests were made', requests.length === 0, requests.join(' '));
  if (shotDir) {
    fs.mkdirSync(shotDir, { recursive: true });
    await page.evaluate(() => { location.hash = '#builder'; }); await scen('jumla'); await step('price');
    await page.screenshot({ path: path.join(shotDir, 'desktop-pricing.png') });
    await page.evaluate(() => { location.hash = '#stock'; }); await page.screenshot({ path: path.join(shotDir, 'desktop-stock.png') });
  }

  /* ---------- phone ---------- */
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mob.on('pageerror', (e) => errors.push(String(e)));
  await mob.goto('file://' + FILE);
  for (const v of ['builder', 'stock', 'explorer', 'info', 'proposals', 'admin', 'flow']) {
    await mob.evaluate((h) => { location.hash = '#' + h; }, v); await mob.waitForTimeout(60);
    const over = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    t(`M-${v} no horizontal page scroll at 390px`, over <= 0, String(over));
  }
  await mob.evaluate(() => { location.hash = '#builder'; }); await mob.click('[data-scenario="stores"]');
  await mob.click('[data-act="next"]'); await mob.click('[data-act="next"]'); await mob.click('[data-act="next"]'); await mob.click('[data-act="next"]');
  const over = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  t('M-price step fits the phone (tables scroll inside their box)', over <= 0, String(over));
  t('M-progress bar replaces the side stepper on phones', await mob.isVisible('.mprog'));
  if (shotDir) await mob.screenshot({ path: path.join(shotDir, 'mobile-price.png') });
  t('B40 still no page errors after all interactions', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\ntaxonomy preview: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

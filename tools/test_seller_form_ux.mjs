#!/usr/bin/env node
// [UX 2026-10-31] Browser tests of the ONE seller form (real markup + real modules,
// mock cloud from tools/fixtures; no Firebase, no accounts, session-only data).
//   node tools/product_preview_server.mjs &  node tools/test_seller_form_ux.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:4174';
const b = await chromium.launch();
let pass = 0, fail = 0;
async function test(name, fn, viewport = { width: 390, height: 844 }) {
  const p = await b.newPage({ viewport });
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  try {
    await p.goto(URL); await p.waitForFunction(() => window.previewReady);
    await p.evaluate(async () => { await import('/js/app/14-map-onboarding.js'); window.__skh = (await import('/js/app/00-bootstrap.js')).skh; });
    await fn(p);
    assert.deepEqual(errors, [], 'no page errors');
    pass++; console.log('  PASS ' + name);
  } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
  finally { await p.close(); }
}
const setMode = (p, m) => p.evaluate(m => { const s = document.getElementById('prodVisibility'); s.value = m; s.dispatchEvent(new Event('change', { bubbles: true })); }, m);
const shown = (p, id) => p.evaluate(id => { const el = document.getElementById(id); return !!el && el.getClientRects().length > 0; }, id);
const req = (p, id) => p.evaluate(id => document.getElementById(id).hasAttribute('required'), id);
const open = p => p.evaluate(() => { window.previewSeller(); window.skhSellerFormOpened(); });

await test('U01 HYBRID / ONLINE_ONLY show the marketplace group; description, photos and category are required', async p => {
  await open(p);
  for (const m of ['hybrid', 'online_only']) {
    await setMode(p, m);
    assert.equal(await shown(p, 'sellerOnlineSection'), true, m);
    assert.equal(await req(p, 'prodDesc'), true); assert.equal(await req(p, 'prodCategory'), true);
  }
});
await test('U02 OFFLINE_ONLY / MANAGE_ONLY hide marketplace fields; category optional; buy price optional everywhere', async p => {
  await open(p);
  for (const m of ['offline_only', 'manage_only']) {
    await setMode(p, m);
    assert.equal(await shown(p, 'sellerOnlineSection'), false, m);
    assert.equal(await req(p, 'prodDesc'), false); assert.equal(await req(p, 'prodCategory'), false);
    assert.equal(await shown(p, 'prodCategory'), true, 'taxonomy still offered for POS/stock');
    assert.equal(await shown(p, 'prodOfflineCategory'), true);
  }
  for (const m of ['hybrid', 'offline_only', 'online_only', 'manage_only']) { await setMode(p, m); assert.equal(await req(p, 'prodBuyPrice'), false); assert.equal(await req(p, 'prodPrice'), true); }
});
await test('U03 switching sales mode never loses what the seller typed', async p => {
  await open(p);
  await p.fill('#prodName', 'Sabuni ya kipande'); await p.fill('#prodDesc', 'Sabuni nzuri');
  await setMode(p, 'offline_only'); await setMode(p, 'hybrid');
  assert.equal(await p.inputValue('#prodDesc'), 'Sabuni nzuri'); assert.equal(await p.inputValue('#prodName'), 'Sabuni ya kipande');
});
await test('U04 default sales mode comes from the business mode; location from the store address', async p => {
  await p.evaluate(() => { Object.assign(window.__skh.currentUserData, { sellerMode: 'OFFLINE', storeAddress: 'Kariakoo, Dar es Salaam' }); });
  await open(p);
  assert.equal(await p.inputValue('#prodVisibility'), 'offline_only');
  assert.equal(await p.inputValue('#prodLocation'), 'Kariakoo, Dar es Salaam');
  assert.match(await p.textContent('#prodLocationHint'), /anwani ya duka/);
});
await test('U05 draft: autosaved, survives a reload, restored on request', async p => {
  await open(p);
  await p.fill('#prodName', 'Mchele Super'); await p.fill('#prodPrice', '3200'); await setMode(p, 'offline_only');
  await p.waitForTimeout(900);
  assert.equal((await p.evaluate(() => window.skhSellerDraftForTest.read())).fields.prodName, 'Mchele Super');
  await p.reload(); await p.waitForFunction(() => window.previewReady);
  await p.evaluate(async () => { await import('/js/app/14-map-onboarding.js'); });
  await open(p);
  assert.equal(await shown(p, 'sellerDraftBanner'), true, 'draft offered');
  assert.equal(await p.inputValue('#prodName'), '', 'nothing restored without asking');
  await p.click('#sellerDraftRestore');
  assert.equal(await p.inputValue('#prodName'), 'Mchele Super'); assert.equal(await p.inputValue('#prodPrice'), '3200');
  assert.equal(await p.inputValue('#prodVisibility'), 'offline_only');
  await p.evaluate(() => localStorage.clear());
});
await test('U06 validation names the missing field inline and keeps every typed value', async p => {
  await open(p); await setMode(p, 'offline_only');
  await p.fill('#prodName', 'Panadol'); await p.fill('#prodPrice', '500'); await p.fill('#prodLocation', '');
  await p.evaluate(() => window.submitSeller({ preventDefault() {} }));
  assert.match(await p.textContent('#sellerForm .sf-issue'), /mahali/);
  assert.equal(await p.inputValue('#prodName'), 'Panadol'); assert.equal(await p.inputValue('#prodPrice'), '500');
  assert.equal(await p.evaluate(() => window.testDocs.size), 0, 'nothing saved');
});
await test('U07 search-first taxonomy fills category + subcategory; an OFFLINE product keeps it on save', async p => {
  await open(p); await p.evaluate(() => window.testDocs.clear()); await setMode(p, 'offline_only');
  await p.fill('#prodTaxonomySearch', 'simu');
  await p.waitForSelector('#prodTaxonomyResults [data-tx]');
  await p.click('#prodTaxonomyResults [data-tx]');
  const cat = await p.inputValue('#prodCategory'); assert.ok(cat, 'category chosen');
  await p.fill('#prodName', 'Simu ya POS'); await p.fill('#prodPrice', '250000'); await p.fill('#prodStock', '2'); await p.fill('#prodLocation', 'Dar');
  await p.evaluate(() => window.submitSeller({ preventDefault() {} }));
  await p.waitForFunction(() => window.testDocs.size === 1);
  const doc = await p.evaluate(() => [...window.testDocs.values()][0]);
  assert.equal(doc.category, cat); assert.deepEqual(doc.salesChannels, ['pos']); assert.equal(doc.isOnline, false);
});
await test('U08 copy a previous product: settings copied, SKU / stock / photos / variants not copied', async p => {
  await open(p);
  await p.evaluate(() => window.testDocs.set('src1', { title: 'Shati ya Kitenge', sku: 'SKU-SRC', barcode: '9988', stock: 7, price: 18000, buyPrice: 9000, category: 'CAT-07',
    imagesArray: ['https://x/a.jpg'], salesChannels: ['marketplace', 'pos'], isOnline: true, isOffline: true, location: 'Mwenge', description: 'Kitenge',
    options: [{ id: 'o1', name: 'Saizi', selectorType: 'button', values: [{ id: 'v1', value: 'M', label: 'M', images: ['https://x/m.jpg'] }] }],
    variantCombinations: [{ variantId: 'var1', sku: 'S-1', stock: 7, price: 18000, options: { Saizi: 'M' } }] }));
  await p.evaluate(() => window.skhDuplicateProduct('src1'));
  assert.equal(await p.inputValue('#prodName'), 'Shati ya Kitenge (nakala)');
  assert.equal(await p.inputValue('#prodPrice'), '18000'); assert.equal(await p.inputValue('#prodLocation'), 'Mwenge');
  assert.equal(await p.inputValue('#prodStock'), '0'); assert.equal(await p.inputValue('#prodBarcode'), '');
  assert.equal(await p.inputValue('#spbProductSku'), '');
  assert.equal(await p.evaluate(() => document.getElementById('prodImagePreviews').children.length), 0);
  assert.match(await p.textContent('#spbOptions'), /Saizi/, 'selector template copied');
  assert.equal(await p.evaluate(() => document.querySelectorAll('.spb-variant').length), 0, 'no variants copied');
  assert.match(await p.textContent('#sellerCopyBanner'), /HAZIJANAKILIWA/);
});
await test('U09 bulk variant entry: one price + stock for every enabled variant', async p => {
  await open(p); await p.evaluate(() => { document.getElementById('sellerVariantsDetails').open = true; });
  await p.click('#spbAddOption'); await p.fill('#spbEditName', 'Rangi');
  const valueField = await p.locator('#spbEditor input,#spbEditor textarea').evaluateAll(els => els.map(e => e.id).find(id => /Value/.test(id)));
  await p.fill('#' + valueField, 'Nyeusi, Nyeupe, Bluu'); await p.click('#spbEditorSave'); await p.click('#spbGenerate');
  await p.evaluate(() => { for (const e of document.querySelectorAll('[data-field="enabled"]')) { e.checked = true; e.dispatchEvent(new Event('input', { bubbles: true })); } });
  assert.equal(await shown(p, 'spbBulkApply'), true);
  await p.fill('#spbBulkPrice', '12000'); await p.fill('#spbBulkStock', '4'); await p.click('#spbBulkApplyBtn');
  const rows = await p.evaluate(() => [...document.querySelectorAll('[data-field="price"]')].map(e => [e.value, document.querySelector(`[data-field="stock"][data-row="${e.dataset.row}"]`)?.value]));
  assert.equal(rows.length, 3); for (const [pr, st] of rows) { assert.equal(pr, '12000'); assert.equal(st, '4'); }
});
await test('U10 progress shows only the groups that apply and marks completed ones', async p => {
  await open(p); await setMode(p, 'manage_only');
  const vis = await p.evaluate(() => [...document.querySelectorAll('#sellerFormProgress li')].filter(li => li.getClientRects().length).map(li => li.dataset.group));
  assert.deepEqual(vis, ['channel', 'what', 'price', 'location']);
  await p.fill('#prodName', 'Mafuta'); await p.fill('#prodPrice', '4000');
  assert.match(await p.textContent('#sellerFormProgress li[data-group="price"]'), /✓/);
});
await test('U11 mobile 390px: no horizontal scroll in the seller form', async p => {
  await open(p);
  for (const m of ['hybrid', 'offline_only', 'online_only', 'manage_only']) {
    await setMode(p, m);
    const over = await p.evaluate(() => { const f = document.getElementById('sellerForm'); return f.scrollWidth - f.clientWidth; });
    assert.ok(over <= 1, m + ' overflow ' + over);
  }
});
await test('U12 desktop 1280px: same form, same groups', async p => {
  await open(p);
  for (const g of ['channel', 'what', 'price', 'online', 'location']) assert.equal(await p.evaluate(g => !!document.querySelector(`#sellerForm [data-sf-group="${g}"]`), g), true);
}, { width: 1280, height: 900 });

await test('U13 selling ONLINE still needs a photo (offline/stock-only does not)', async p => {
  await open(p); await p.evaluate(() => window.testDocs.clear()); await setMode(p, 'hybrid');
  await p.fill('#prodTaxonomySearch', 'simu'); await p.waitForSelector('#prodTaxonomyResults [data-tx]'); await p.click('#prodTaxonomyResults [data-tx]');
  await p.fill('#prodName', 'Simu online'); await p.fill('#prodPrice', '250000'); await p.fill('#prodLocation', 'Dar'); await p.fill('#prodDesc', 'Simu nzuri sana');
  await p.evaluate(() => window.submitSeller({ preventDefault() {} }));
  await p.waitForFunction(() => /picha/i.test(document.getElementById('previewStatus').textContent));
  assert.equal(await p.evaluate(() => window.testDocs.size), 0);
  assert.equal(await p.inputValue('#prodDesc'), 'Simu nzuri sana', 'typed data kept');
});

await test('U14 buyer: choosing a colour shows that colour\'s own photos (Black ≠ White)', async p => {
  await open(p);
  await p.evaluate(() => { window.testDocs.clear(); window.testDocs.set('pv1', { title: 'Shati', price: 15000, stock: 4, category: 'CAT-07', imagesArray: ['https://x/general.jpg'],
    options: [{ name: 'Rangi', selectorType: 'color', values: [{ value: 'Nyeusi', images: ['https://x/black.jpg'] }, { value: 'Nyeupe', images: ['https://x/white.jpg'] }] }] }); });
  await p.click('#previewBuyer');
  await p.locator('#pmVariantSelectionArea .pm-chip').filter({ hasText: 'Nyeusi' }).click();
  let srcs = await p.evaluate(() => [...document.querySelectorAll('#pmImageSlider img')].map(i => i.getAttribute('src')));
  assert.ok(srcs[0].includes('black.jpg') && !srcs.some(x => x.includes('white.jpg')), srcs.join());
  await p.locator('#pmVariantSelectionArea .pm-chip').filter({ hasText: 'Nyeupe' }).click();
  srcs = await p.evaluate(() => [...document.querySelectorAll('#pmImageSlider img')].map(i => i.getAttribute('src')));
  assert.ok(srcs[0].includes('white.jpg') && !srcs.some(x => x.includes('black.jpg')), srcs.join());
});

await test('U15 kg product: decimal stock accepted (12.5 kg) and the product is saved with quantityPrecision 3; pieces stay whole', async p => {
  await open(p); await p.evaluate(() => window.testDocs.clear()); await setMode(p, 'offline_only');
  const pickUnit = u => p.evaluate(u => { const e = document.getElementById('prodBaseUnit'); e.value = u; e.dispatchEvent(new Event('change', { bubbles: true })); }, u);
  await pickUnit('Kg');
  assert.equal(await p.getAttribute('#prodStock', 'step'), '0.001');
  await p.fill('#prodName', 'Mchele wa Mbeya'); await p.fill('#prodPrice', '3200'); await p.fill('#prodStock', '12.5'); await p.fill('#prodLocation', 'Dar');
  await p.evaluate(() => window.submitSeller({ preventDefault() {} }));
  await p.waitForFunction(() => window.testDocs.size === 1);
  const doc = await p.evaluate(() => [...window.testDocs.values()][0]);
  assert.equal(doc.quantityPrecision, 3); assert.equal(doc.baseUnit, 'Kg');
  await pickUnit('Piece');
  assert.equal(await p.getAttribute('#prodStock', 'step'), '1');
});
await test('U16 attribute names: a seller cannot add "Colour" when "Color" exists (one canonical attribute)', async p => {
  await open(p); await p.evaluate(() => { document.getElementById('sellerVariantsDetails').open = true; });
  await p.click('#spbAddOption'); await p.fill('#spbEditName', 'Color');
  let vf = await p.locator('#spbEditor input,#spbEditor textarea').evaluateAll(els => els.map(e => e.id).find(id => /Value/.test(id)));
  await p.fill('#' + vf, 'Nyeusi, Nyeupe'); await p.click('#spbEditorSave');
  await p.click('#spbAddOption'); await p.fill('#spbEditName', 'Colour');
  vf = await p.locator('#spbEditor input,#spbEditor textarea').evaluateAll(els => els.map(e => e.id).find(id => /Value/.test(id)));
  await p.fill('#' + vf, 'Bluu'); await p.click('#spbEditorSave');
  assert.match(await p.textContent('#spbEditor'), /tayari lipo/i);
  assert.equal((await p.textContent('#spbOptions')).match(/Colou?r/g).length, 1);
});

await test('U17 drafts are per account: seller B never sees seller A\'s draft on the same device', async p => {
  await open(p);
  await p.fill('#prodName', 'Rasimu ya A'); await p.fill('#prodPrice', '1000'); await p.waitForTimeout(900);
  assert.equal((await p.evaluate(() => window.skhSellerDraftForTest.read())).fields.prodName, 'Rasimu ya A');
  await p.evaluate(() => { window.__skh.currentUser.uid = 'seller-b'; });
  await p.reload(); await p.waitForFunction(() => window.previewReady);
  await p.evaluate(async () => { await import('/js/app/14-map-onboarding.js'); window.__skh = (await import('/js/app/00-bootstrap.js')).skh; window.__skh.currentUser.uid = 'seller-b'; });
  await open(p);
  assert.equal(await shown(p, 'sellerDraftBanner'), false, 'B sees no draft');
  assert.equal(await p.evaluate(() => window.skhSellerDraftForTest.read()), null);
  await p.evaluate(() => localStorage.clear());
});

await b.close();
console.log(`\nSELLER FORM UX (browser): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

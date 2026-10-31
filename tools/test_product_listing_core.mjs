#!/usr/bin/env node
// [PHASE 1/2 2026-10-31] Seller listing model: channels, Manage only, POS default,
// POS location safeguard, one unit registry + legacy map, packs vs wholesale,
// fulfilment, dynamic steps, and backward compatibility of buildProductWrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as L from '../shared/product-listing-core.mjs';
import { buildProductWrite, productEligible } from '../js/app/39-product-core.js';
import { psImagesForSelection } from '../js/app/39-showcase-logic.js';
import { UNIT_LEGACY_MAP as DRAFT_UNIT_MAP } from '../taxonomy-draft/src/model.mjs';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const require = createRequire(import.meta.url);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok ' + name); };

t('visibility <-> channels, Manage only is an official exclusive channel', () => {
  assert.deepEqual(L.channelsFromVisibility('manage_only'), ['manage_only']);
  assert.deepEqual(L.channelsFromVisibility('hybrid'), ['marketplace', 'pos']);
  assert.deepEqual(L.channelsFromVisibility('offline_only'), ['pos']);
  assert.equal(L.channelsFromVisibility(''), null, 'empty choice changes nothing');
  assert.equal(L.normalizeChannels(['manage_only', 'pos']).error, 'MANAGE_ONLY_IS_EXCLUSIVE');
  assert.equal(L.normalizeChannels([]).error, 'CHANNEL_REQUIRED');
  assert.deepEqual(L.normalizeChannels(['pos', 'MARKETPLACE', 'x']).channels, ['marketplace', 'pos']);
  assert.equal(L.visibilityFromChannels(['manage_only']), 'manage_only');
  assert.deepEqual(L.legacyFlagsFor(['manage_only']), { isOnline: false, isOffline: false });
});
t('legacy products keep today\'s meaning', () => {
  assert.deepEqual(L.channelsOf({}), ['marketplace'], 'no flags = online as today');
  assert.deepEqual(L.channelsOf({ isOnline: true, isOffline: true }), ['marketplace', 'pos']);
  assert.deepEqual(L.channelsOf({ isOnline: false, isOffline: true }), ['pos']);
  assert.deepEqual(L.channelsOf({ isOnline: false, isOffline: false }), ['manage_only']);
  assert.deepEqual(L.channelsOf({ salesChannels: ['pos'], isOnline: true }), ['pos'], 'explicit list wins');
  assert.equal(L.posAllowed({}), true, 'legacy product sells at POS as before');
  assert.equal(L.posAllowed({ salesChannels: ['manage_only'] }), false);
  assert.equal(L.posAllowed({ salesChannels: ['marketplace'] }), false);
});
t('POS location safeguard: new sellers need a location, legacy sellers get default + warning', () => {
  assert.equal(L.posLocationCheck({ channels: ['marketplace'] }).required, false);
  assert.deepEqual(L.posLocationCheck({ channels: ['pos'] }), { ok: true, required: true, locationId: 'default', warning: 'LEGACY_DEFAULT_LOCATION' });
  assert.equal(L.posLocationCheck({ channels: ['pos'], businessId: 'b1' }).error, 'POS_LOCATION_REQUIRED');
  assert.equal(L.posLocationCheck({ channels: ['pos'], businessId: 'b1', storeId: 's1' }).locationId, 's1');
});
t('one unit registry: legacy map mirrors the taxonomy draft and every form option is mapped', () => {
  assert.deepEqual(L.UNIT_LEGACY_MAP.map(m => [m.source, m.legacy, m.unitId, m.action]), DRAFT_UNIT_MAP.map(m => [m.source, m.legacy, m.unitId, m.action]));
  const reg = require('../shared/canonical-taxonomy-core.js').getCanonicalRegistries().units;
  assert.deepEqual([...L.CANONICAL_UNIT_IDS].sort(), Object.keys(reg).sort(), 'CANONICAL_UNIT_IDS == canonical UNIT_REGISTRY');
  const html = read('html/09-admin-sell.html');
  const pick = id => { const i = html.indexOf('id="' + id + '"'); const seg = html.slice(i, html.indexOf('</select>', i)); return [...seg.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]).filter(Boolean); };
  ['prodBaseUnit', 'prodBulkUnit'].forEach(id => pick(id).forEach(v => assert.notEqual(L.resolveUnit(v).action, 'UNMAPPED', id + ' option ' + v)));
  assert.deepEqual(L.resolveUnit('Litre'), { unitId: 'L', registered: true, action: 'MAP' });
  assert.equal(L.resolveUnit('Tablet').registered, false, 'proposed unit flagged, legacy still works');
  assert.equal(L.resolveUnit('Furlong').action, 'UNMAPPED');
});
t('pricing: packs (bigger unit, own price) are not wholesale tiers (qty price breaks)', () => {
  const p = L.normalizePricing({ price: 1000, baseUnit: 'Piece', hasBulkPackaging: true, bulkUnit: 'Carton', conversionRatio: 24, wholesalePrice: 900, wholesaleMinQty: 12 });
  assert.deepEqual(p.packs, [{ unitId: 'carton', contentQuantity: 24, contentUnitId: 'piece', price: null, priceSource: 'BASE_PRICE_X_CONTENT' }]);
  assert.deepEqual(p.wholesaleTiers, [{ minQty: 12, price: 900 }]);
  const both = L.normalizePricing({ price: 1000, wholesalePrice: 950, saleMode: 'wholesale', modeData: { tiers: [{ minQty: 50, price: 800 }, { minQty: 10, price: 900 }, { minQty: 10, price: 880 }] } });
  assert.deepEqual(both.wholesaleTiers, [{ minQty: 10, price: 900 }, { minQty: 50, price: 800 }], 'mode tiers win, sorted, no duplicate minQty');
  assert.equal(L.unitPriceFor(both, 9), 1000); assert.equal(L.unitPriceFor(both, 10), 900); assert.equal(L.unitPriceFor(both, 60), 800);
  assert.deepEqual(L.normalizePricing({ price: 500, wholesalePrice: 600 }).issues, ['WHOLESALE_ABOVE_BASE_PRICE']);
  assert.deepEqual(L.normalizePricing({ price: 500 }).wholesaleTiers, []);
});
t('fulfilment follows nature, channel and location capability', () => {
  assert.deepEqual(L.fulfilmentOptions({ channels: ['pos'] }), [], 'not online -> no delivery');
  assert.deepEqual(L.fulfilmentOptions({ channels: ['marketplace'], location: { pickup: true } }), ['pickup', 'seller_delivery', 'sokohai_delivery']);
  assert.deepEqual(L.fulfilmentOptions({ channels: ['marketplace'], location: { pickup: false } }), ['seller_delivery', 'sokohai_delivery'], 'warehouse: no pickup');
  assert.deepEqual(L.fulfilmentOptions({ nature: 'digital', channels: ['marketplace'] }), ['digital_delivery']);
});
t('dynamic steps: skipped steps are not counted (same rule as the preview)', () => {
  assert.equal(L.builderSteps({ channels: ['marketplace', 'pos'] }).length, 10);
  assert.equal(L.builderSteps({ kind: 'service', channels: ['marketplace'] }).length, 9, 'service: no delivery step');
  assert.equal(L.builderSteps({ channels: ['pos'] }).length, 9, 'POS only: no delivery step');
  assert.equal(L.builderSteps({ nature: 'digital', channels: ['marketplace'] }).length, 8, 'digital: no location, no delivery');
  const preview = read('taxonomy-draft/preview/src/builder.js');
  assert.match(preview, /if \(k === 'delivery'\) return !isSvc\(\) && mkt\(\) && S\.nature === 'physical';/);
  assert.match(preview, /if \(k === 'location'\) return isSvc\(\) \|\| S\.nature === 'physical';/);
});
t('buildProductWrite: additive channels/pricing, legacy flags kept in step', () => {
  const legacy = buildProductWrite({ title: 'Sabuni', price: 1000, stock: 0 });
  assert.deepEqual(legacy.salesChannels, ['marketplace']); assert.equal(legacy.isOnline, undefined, 'legacy flag not invented');
  assert.equal(productEligible(legacy), true, 'still listed online');
  const manage = buildProductWrite({ title: 'Stoo', price: 1000, stock: 0, salesChannels: ['manage_only'], isOnline: true, isOffline: true });
  assert.equal(manage.isOnline, false); assert.equal(manage.isOffline, false); assert.equal(productEligible(manage), false, 'manage only is not listed');
  const pos = buildProductWrite({ title: 'POS', price: 1000, stock: 0, isOnline: false, isOffline: true, salesChannels: ['pos'] });
  assert.deepEqual(pos.salesChannels, ['pos']); assert.equal(productEligible(pos), false);
  assert.throws(() => buildProductWrite({ title: 'X', price: 1, salesChannels: ['manage_only', 'pos'] }), /Kusimamia tu/);
  assert.equal(manage.nature, 'physical'); assert.equal(manage.pricing.basePrice, 1000); assert.equal(manage.pricing.baseUnitId, 'piece');
});
t('wiring: form option, create path, POS quick-add default, server POS guard', () => {
  assert.match(read('html/09-admin-sell.html'), /<option value="manage_only">/);
  assert.match(read('js/app/08-app-state.js'), /salesChannels: channelsFromVisibility\(visibility\)/);
  const pos = read('js/app/15-pos-sales.js');
  assert.match(pos, /isOnline: false,\n\s*salesChannels: \['pos'\]/);
  const auth = read('functions/inventory-authority.js');
  assert.match(auth, /CHANNEL_NOT_POS/); assert.match(auth, /LEGACY_DEFAULT_LOCATION/);
  assert.match(read('index.html'), /<option value="manage_only">/, 'index.html rebuilt from html/ partials');
});

/* ---- [UX 2026-10-31] business modes, seller lifecycle, progressive disclosure, copy, draft ---- */
const BC = require('../shared/business-context-core.js');
t('business modes: four modes, independent of product type, condition and seller lifecycle', () => {
  assert.equal(BC.normalizeSellerMode('manage_only'), 'MANAGE_ONLY');
  assert.equal(BC.normalizeSellerMode('hybrid'), 'HYBRID');
  assert.equal(L.visibilityForBusinessMode({ sellerMode: 'OFFLINE' }), 'offline_only');
  assert.equal(L.visibilityForBusinessMode({ sellMode: 'online_only' }), 'online_only');
  assert.equal(L.visibilityForBusinessMode({ sellerMode: 'MANAGE_ONLY' }), 'manage_only');
  assert.equal(L.visibilityForBusinessMode({}), 'hybrid', 'legacy profile keeps the old default');
  // lifecycle never decides the mode, and the mode never decides the lifecycle
  assert.equal(L.visibilityForBusinessMode({ sellerMode: 'OFFLINE', sellerType: 'permanent', productType: 'digital', condition: 'used' }), 'offline_only');
  const ctx = BC.resolveBusinessContext('u1', { businessName: 'Duka', sellerMode: 'MANAGE_ONLY', sellerType: 'temporary', storeAddress: 'Kariakoo' });
  assert.equal(ctx.sellerMode, 'MANAGE_ONLY'); assert.equal(ctx.lifecycle, 'temporary'); assert.equal(ctx.store.address, 'Kariakoo');
});
t('changing the business mode never rewrites existing products (channels live on each product)', () => {
  const old = { salesChannels: ['marketplace', 'pos'], isOnline: true, isOffline: true };
  assert.deepEqual(L.channelsOf(old), ['marketplace', 'pos']);
  assert.equal(L.visibilityForBusinessMode({ sellerMode: 'OFFLINE' }), 'offline_only');
  assert.deepEqual(L.channelsOf(old), ['marketplace', 'pos'], 'product unchanged');
});
t('seller lifecycle: temporary -> permanent on the same account, requirements enforced, no self-bypass', () => {
  const tmp = { uid: 'u1', businessId: 'B1', sellerType: 'temporary' };
  const need = BC.planSellerLifecycleChange({ profile: tmp, target: 'permanent', subscriptionRequired: true, subscriptionActive: false });
  assert.equal(need.ok, false); assert.equal(need.error, 'SUBSCRIPTION_REQUIRED');
  const ok = BC.planSellerLifecycleChange({ profile: tmp, target: 'permanent', subscriptionRequired: true, subscriptionActive: true });
  assert.equal(ok.ok, true); assert.equal(ok.from, 'temporary'); assert.equal(ok.to, 'permanent'); assert.equal(ok.limits.productLimit, 9999);
  assert.deepEqual(ok.pendingVerification, ['IDENTITY_VERIFICATION_NOT_DEFINED'], 'verification reported, not invented');
  assert.equal(BC.planSellerLifecycleChange({ profile: tmp, target: 'temporary' }).noop, true);
  assert.equal(BC.planSellerLifecycleChange({ profile: tmp, target: 'boss' }).ok, false);
  assert.equal(BC.sellerLifecycleOf({ isTemporaryStore: true }), 'temporary');
  const rules = read('firestore.rules');
  assert.match(rules, /function sellerLifecycleUpdateOk\(\)/); assert.match(rules, /sellerLifecycleCreateOk\(d\)/);
  assert.match(read('functions/index.js'), /exports\.sellerLifecycleChange = onCall/);
  assert.doesNotMatch(read('js/app/14-map-onboarding.js'), /payload\.sellerType = 'permanent'/, 'browser no longer self-promotes');
  assert.match(read('js/app/03-dashboard.js'), /wrapCallable\('sellerLifecycleChange'\)/);
});
t('progressive disclosure: each sales mode shows only what applies', () => {
  const h = L.sellerFormRules('hybrid'), off = L.sellerFormRules('offline_only'), on = L.sellerFormRules('online_only'), m = L.sellerFormRules('manage_only');
  assert.equal(h.groups.online, true); assert.ok(h.required.includes('prodDesc') && h.required.includes('prodCategory'));
  assert.equal(on.groups.online, true); assert.equal(on.taxonomy, 'required');
  assert.equal(off.groups.online, false); assert.ok(!off.required.includes('prodDesc')); assert.equal(off.taxonomy, 'optional');
  assert.equal(m.groups.online, false); assert.deepEqual(m.channels, ['manage_only']);
  for (const r of [h, off, on, m]) { assert.ok(r.optional.includes('prodBuyPrice'), 'buy price optional'); assert.ok(r.required.includes('prodPrice')); }
});
t('copy a previous product: settings yes; SKU, barcode, stock, variants, images, serials no', () => {
  const src = { id: 'p1', title: 'Shati', sku: 'SKU-1', barcode: '123', stock: 9, reservedStock: 2, price: 15000, buyPrice: 9000, category: 'CAT-07', subCategory: 'Mashati',
    imagesArray: ['a.jpg'], image: 'a.jpg', imeiNumbers: 'X', batchNumber: 'B1', expiryDate: '2027-01-01',
    variantCombinations: [{ variantId: 'v1', sku: 'S-v1', stock: 3 }], salesChannels: ['marketplace', 'pos'],
    options: [{ id: 'o1', name: 'Rangi', values: [{ id: 'vv', value: 'Nyeusi', images: ['b.jpg'] }] }] };
  const t2 = L.duplicateTemplate(src);
  assert.equal(t2.title, 'Shati (nakala)'); assert.equal(t2.price, 15000); assert.equal(t2.category, 'CAT-07'); assert.equal(t2.visibility, 'hybrid');
  for (const k of ['sku', 'barcode', 'stock', 'reservedStock', 'imagesArray', 'image', 'imeiNumbers', 'batchNumber', 'expiryDate', 'variantCombinations', 'id', 'userId'])
    assert.ok(!(k in t2), 'not copied: ' + k);
  assert.equal(t2.options[0].name, 'Rangi'); assert.equal(t2.options[0].values[0].value, 'Nyeusi');
  assert.ok(!('id' in t2.options[0]) && !('images' in t2.options[0].values[0]) && !('id' in t2.options[0].values[0]));
  assert.equal(t2.copiedFrom, 'p1');
  assert.equal(src.options[0].values[0].images.length, 1, 'source object untouched');
});
t('local draft: plain fields only (no files, stock moves or variant ids), restore needs real content', () => {
  for (const banned of ['prodImage', 'prodImageCam', 'prodImeiNumbers', 'prodBatchNumber', 'prodExpiryDate']) assert.ok(!L.DRAFT_FIELDS.includes(banned));
  assert.equal(L.draftHasContent({ fields: { prodVisibility: 'hybrid', prodStock: '1' } }), false);
  assert.equal(L.draftHasContent({ fields: { prodName: 'Sabuni' } }), true);
  assert.notEqual(L.draftKey('a'), L.draftKey('b'));
  const html = read('html/09-admin-sell.html');
  for (const id of L.DRAFT_FIELDS) assert.match(html, new RegExp('id="' + id + '"'), 'draft field exists in the form: ' + id);
});
t('one seller form: grouped, Swahili labels, no duplicate ids, builder kept (no second builder)', () => {
  const html = read('html/09-admin-sell.html');
  const form = html.slice(html.indexOf('<form id="sellerForm"'), html.indexOf('</form>', html.indexOf('<form id="sellerForm"')));
  const ids = [...form.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, 'unique ids');
  for (const g of ['channel', 'what', 'price', 'online', 'location']) assert.match(form, new RegExp('data-sf-group="' + g + '"'));
  assert.equal((html.match(/id="productBuilder"/g) || []).length, 1, 'one Product Builder');
  assert.doesNotMatch(form, /<h4>0[3-6] · /, 'old numbered English builder headings removed');
  assert.match(form, /id="prodTaxonomySearch"/); assert.match(form, /id="spbBulkApplyBtn"/);
  assert.doesNotMatch(form, /id="prodBuyPrice"[^>]*required/, 'buy price optional');
  assert.match(read('js/app/30-seller-products.js'), /skhDuplicateProduct\(/);
});
t('variant pictures: Black shows Black photos, White shows White photos, no repeats; exact variant photos win', () => {
  const p = { options: [{ name: 'Rangi', values: [{ value: 'Nyeusi', images: ['black1.jpg', 'black2.jpg'] }, { value: 'Nyeupe', images: ['white1.jpg'] }] }, { name: 'Saizi', values: [{ value: 'M' }, { value: 'L' }] }],
    variantCombinations: [{ variantId: 'a', options: { Rangi: 'Nyeusi', Saizi: 'L' }, images: ['black-L.jpg'], status: 'ACTIVE' }, { variantId: 'b', options: { Rangi: 'Nyeupe', Saizi: 'M' }, images: [], status: 'ACTIVE' }] };
  assert.deepEqual(psImagesForSelection(p, { Rangi: 'Nyeusi' }), ['black1.jpg', 'black2.jpg']);
  assert.deepEqual(psImagesForSelection(p, { Rangi: 'Nyeupe' }), ['white1.jpg']);
  assert.deepEqual(psImagesForSelection(p, { Rangi: 'Nyeusi', Saizi: 'L' }), ['black-L.jpg'], 'exact variant');
  assert.deepEqual(psImagesForSelection(p, { Rangi: 'Nyeupe', Saizi: 'M' }), ['white1.jpg'], 'variant without own photos falls back to its colour');
  assert.deepEqual(psImagesForSelection(p, {}), [], 'nothing chosen: general gallery');
  assert.deepEqual(psImagesForSelection({ title: 'simple' }, { Rangi: 'x' }), [], 'product without variants unaffected');
});
console.log(`product listing core: ${n} checks passed`);

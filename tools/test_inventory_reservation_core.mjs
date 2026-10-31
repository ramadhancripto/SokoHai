#!/usr/bin/env node
// [PHASE 3 2026-10-31] Unit tests: shared/inventory-reservation-core.js (pure, no Firestore)
// plus static contracts for the files that use it (F5, F6, F7, deploy packaging).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const core = require('../shared/inventory-reservation-core.js');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok ' + name); };

t('config defaults: OFF, TTL 15 trial, review 120', () => {
  const c = core.resolveConfig(null);
  assert.equal(c.mode, 'off'); assert.equal(c.ttlMinutes, 15); assert.equal(c.ttlValidated, false); assert.equal(c.reviewWindowMinutes, 120);
  assert.equal(core.reservationEnabledFor(c, 'any'), false);
});
t('config is clamped and validated', () => {
  const c = core.resolveConfig({ mode: 'pilot', pilotSellerIds: ['a', 'a', ' b ', ''], ttlMinutes: 1, reviewWindowMinutes: 99999, ttlValidated: 'yes' });
  assert.deepEqual([...c.pilotSellerIds], ['a', 'b']); assert.equal(c.ttlMinutes, 5); assert.equal(c.reviewWindowMinutes, 1440); assert.equal(c.ttlValidated, false);
  assert.equal(core.resolveConfig({ mode: 'everything' }).mode, 'off');
  assert.equal(core.reservationEnabledFor(c, 'a'), true); assert.equal(core.reservationEnabledFor(c, 'z'), false);
  assert.equal(core.reservationEnabledFor(core.resolveConfig({ mode: 'all' }), 'z'), true);
});
t('stock key = business:location:product:variant:unit with legacy fallbacks', () => {
  assert.equal(core.stockKey({ sellerId: 'u1', productId: 'p1' }), 'seller_u1:default:p1:product:default');
  assert.equal(core.stockKey({ businessId: 'b1', storeId: 's1', productId: 'p1', variantId: 'v1', unitId: 'pcs' }), 'b1:s1:p1:v1:pcs');
  assert.equal(core.stockKey({ businessId: 'b:1', locationId: 'w/1', productId: 'p1' }), 'b_1:w_1:p1:product:default');
  assert.deepEqual(core.parseStockKey('b1:s1:p1:product:pcs'), { businessId: 'b1', locationId: 's1', productId: 'p1', variantId: null, unitId: 'pcs' });
  assert.throws(() => core.stockKey({ productId: 'p1' }), /BUSINESS_REQUIRED/);
});
t('state machines allow only the documented transitions', () => {
  assert.equal(core.canTransition('reservation', 'ACTIVE', 'COMMITTED'), true);
  assert.equal(core.canTransition('reservation', 'EXPIRED', 'COMMITTED'), false, 'expired reservation is never revived');
  assert.equal(core.canTransition('reservation', 'COMMITTED', 'RELEASED'), false);
  assert.equal(core.canTransition('review', 'NEEDS_REVIEW', 'REFUNDED'), false, 'refund only from REFUND_PENDING');
  assert.equal(core.canTransition('review', 'REFUND_PENDING', 'REFUNDED'), true);
  assert.equal(core.canTransition('review', 'REFUNDED', 'REFUND_PENDING'), false);
  assert.equal(core.canTransition('refund', 'COMPLETED', 'PENDING'), false);
  assert.throws(() => core.assertTransition('reservation', 'RELEASED', 'ACTIVE'), /INVALID_TRANSITION/);
});
t('deterministic idempotency ids', () => {
  assert.equal(core.ids.reservation('o1'), 'o1'); assert.equal(core.ids.reservation('o1', 2), 'o1-R2');
  assert.equal(core.ids.refund('o1'), 'online_o1'); assert.equal(core.ids.refundLedger('o1'), 'refund_late_o1');
  assert.equal(core.ids.movement('ONLINE_SALE', 'o1', 0), 'ONLINE_SALE_o1_0');
});
t('applyDelta enforces stock>=0, reserved>=0, reserved<=stock', () => {
  const p = { stock: 5, reservedStock: 2 };
  assert.deepEqual(core.stockOf(p), { ok: true, stock: 5, reserved: 2, available: 3, variantIndex: -1, precision: 0 }, "whole-unit product: precision 0 (decimals are opt-in)");
  assert.equal(core.applyDelta(p, null, { reserved: 3 }).reservedStock, 5);
  assert.throws(() => core.applyDelta(p, null, { reserved: 4 }), /INSUFFICIENT_AVAILABLE/);
  assert.throws(() => core.applyDelta(p, null, { stock: -6 }), /STOCK_NEGATIVE/);
  assert.throws(() => core.applyDelta(p, null, { stock: -4 }), /INSUFFICIENT_AVAILABLE/, 'cannot sell reserved units');
  assert.throws(() => core.applyDelta(p, null, { reserved: -3 }), /RESERVED_NEGATIVE/);
  assert.equal(core.applyDelta({ stock: 2 }, null, { stock: -2 }).availabilityStatus, 'out_of_stock');
  assert.equal(core.applyDelta({ stock: 5, availabilityStatus: 'pre_order' }, null, { reserved: 5 }).availabilityStatus, 'pre_order', 'manual status kept');
});
t('legacy product without counters works (missing = 0)', () => {
  assert.equal(core.stockOf({}).available, 0);
  assert.equal(core.stockOf({ stock: 3 }).available, 3);
  assert.equal(core.stockOf({ stock: -1 }).ok, false);
});
t('variant counters are per variant; product.stock untouched', () => {
  const p = { stock: 0, variantCombinations: [{ variantId: 'a', stock: 3 }, { variantId: 'b', stock: 1, reserved: 1 }] };
  const w = core.applyDelta(p, 'a', { reserved: 2 });
  assert.equal(w.variantCombinations[0].reserved, 2); assert.equal(w.stock, 0); assert.equal(p.variantCombinations[0].reserved, undefined, 'input not mutated');
  assert.equal(core.checkAvailable(p, 'b', 1).error, 'INSUFFICIENT_AVAILABLE');
  assert.equal(core.checkAdjust(p, 'b', -1).error, 'BELOW_RESERVED');
  assert.equal(core.checkAdjust(p, 'a', -3).ok, true);
  assert.equal(core.stockOf(p, 'zz').error, 'VARIANT_NOT_FOUND');
  assert.deepEqual(Object.keys(core.productPatch(p, w, 'now')).sort(), ['updatedAt', 'variantCombinations']);
});
t('order lines: products only; services, transport, group child orders skipped', () => {
  assert.deepEqual(core.orderStockLines({ productId: 'p', quantity: 2 }).lines, [{ productId: 'p', quantity: 2, variantId: null, variantRef: null }]);
  assert.equal(core.orderStockLines({ commerceType: 'service', productId: 's' }).lines.length, 0);
  assert.equal(core.orderStockLines({ kind: 'GROUP_CHILD_ORDER' }).skip, 'group_child_order');
  assert.equal(core.orderStockLines({ itemId: 'link1' }).skip, 'no_product_items');
  assert.equal(core.orderStockLines({ items: [{ id: 'a', qty: 0 }] }).error, 'LINE_QUANTITY_INVALID');
  assert.equal(core.orderStockLines({ items: [{ id: 'a/b', qty: 1 }] }).error, 'LINE_PRODUCT_INVALID');
  assert.equal(core.orderStockLines({ items: Array.from({ length: 21 }, (_, i) => ({ id: 'p' + i, qty: 1 })) }).error, 'TOO_MANY_LINES');
  assert.equal(core.orderStockLines({ items: [{ id: 'a', qty: 1, selectedVariant: { variantId: 'v' } }] }).lines[0].variantId, 'v');
});
t('variant resolution: id, options, label, single variant; ambiguous refused', () => {
  const p = { variantCombinations: [{ variantId: 'v1', sku: 'S1', options: { Size: 'M' } }, { variantId: 'v2', sku: 'S2', options: { Size: 'L' } }] };
  assert.equal(core.resolveLineVariant(p, { variantId: 'v2' }).variantId, 'v2');
  assert.equal(core.resolveLineVariant(p, { variantRef: { size: 'm' } }).variantId, 'v1');
  assert.equal(core.resolveLineVariant(p, { variantRef: 'S2' }).variantId, 'v2');
  assert.equal(core.resolveLineVariant(p, {}).error, 'VARIANT_UNRESOLVED');
  assert.equal(core.resolveLineVariant({ variantCombinations: [p.variantCombinations[0]] }, {}).variantId, 'v1');
  assert.equal(core.resolveLineVariant({ stock: 3 }, {}).variantId, null);
});
t('planLines: all-or-nothing, one location, seller check', () => {
  const products = { a: { userId: 's', stock: 2 }, b: { userId: 's', stock: 1 } };
  const ok = core.planLines([{ productId: 'a', quantity: 2 }, { productId: 'b', quantity: 1 }], products, { mode: 'reserve', order: { sellerId: 's' } });
  assert.equal(ok.ok, true); assert.equal(ok.working.a.reservedStock, 2);
  const no = core.planLines([{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }], products, { mode: 'reserve', order: { sellerId: 's' } });
  assert.equal(no.ok, false); assert.equal(no.error, 'INSUFFICIENT_AVAILABLE'); assert.equal(products.a.reservedStock, undefined, 'nothing applied');
  assert.equal(core.planLines([{ productId: 'a', quantity: 1 }], products, { mode: 'reserve', order: { sellerId: 'x' } }).error, 'SELLER_MISMATCH');
  const two = { a: { userId: 's', businessId: 'b', storeId: '1', stock: 5 }, b: { userId: 's', businessId: 'b', storeId: '2', stock: 5 } };
  assert.equal(core.planLines([{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 1 }], two, { mode: 'reserve', order: { sellerId: 's' } }).error, 'MULTI_LOCATION_ORDER');
  const same = core.planLines([{ productId: 'a', quantity: 2 }, { productId: 'a', quantity: 3 }], { a: { userId: 's', stock: 5 } }, { mode: 'reserve_and_commit', order: { sellerId: 's' } });
  assert.equal(same.working.a.stock, 0, 'two lines of one product applied in sequence');
  const commit = core.planLines(null, { a: { stock: 5, reservedStock: 2 } }, { mode: 'commit_reserved', reservationLines: [{ productId: 'a', quantity: 2, variantId: null, stockKey: 'k:l:a:product:default' }] });
  assert.equal(commit.working.a.stock, 3); assert.equal(commit.working.a.reservedStock, 0);
  const drift = core.planLines(null, { a: { stock: 5, reservedStock: 1 } }, { mode: 'release', reservationLines: [{ productId: 'a', quantity: 2, variantId: null, stockKey: 'k:l:a:product:default' }] });
  assert.equal(drift.working.a.reservedStock, 0, 'release clamps at 0'); assert.equal(drift.lines[0].drift, 1, 'drift recorded');
});
t('settlement decision table', () => {
  assert.equal(core.decideSettlement({ enabled: false, hasLines: true, reservation: null }), 'LEGACY');
  assert.equal(core.decideSettlement({ enabled: true, hasLines: false, reservation: null }), 'NONE');
  assert.equal(core.decideSettlement({ enabled: true, hasLines: true, reservation: null }), 'RESERVE_AND_COMMIT');
  assert.equal(core.decideSettlement({ enabled: false, hasLines: true, reservation: { status: 'ACTIVE' } }), 'COMMIT', 'pilot switched off: live reservation still commits');
  assert.equal(core.decideSettlement({ enabled: true, hasLines: true, reservation: { status: 'COMMITTED' } }), 'ALREADY_COMMITTED');
  assert.equal(core.decideSettlement({ enabled: true, hasLines: true, reservation: { status: 'EXPIRED' } }), 'RESERVE_AND_COMMIT');
  assert.equal(core.isExpired({ status: 'ACTIVE', expiresAt: '2026-01-01T00:00:00Z' }, Date.parse('2026-01-01T00:00:01Z')), true);
  assert.equal(core.escrowReleaseBlocked({ inventoryReviewState: 'REFUND_PENDING' }), true);
  assert.equal(core.escrowReleaseBlocked({}), false);
});
t('reconciliation helpers find broken invariants and drift', () => {
  assert.equal(core.productInvariantIssues('p', { stock: 1, reservedStock: 2 })[0].issue, 'RESERVED_EXCEEDS_STOCK');
  assert.deepEqual(core.reservedDrift({ p: { stock: 5, reservedStock: 2 } }, [{ lines: [{ productId: 'p', quantity: 1 }] }]), [{ productId: 'p', variantId: null, reserved: 2, expected: 1 }]);
});

// ---------- static contracts ----------
const authority = read('functions/inventory-authority.js');
const reservation = read('functions/inventory-reservation.js');
const index = read('functions/index.js');
const rules = read('firestore.rules');
t('functions require ./shared copies (../shared is not deployed) and copies are identical', () => {
  assert.match(authority, /require\('\.\/shared\/pos-product-identity-core'\)/);
  assert.doesNotMatch(authority, /require\('\.\.\/shared\//);
  assert.match(reservation, /require\('\.\/shared\/inventory-reservation-core'\)/);
  const build = read('functions/build-shared.js');
  ['pos-product-identity-core.js', 'inventory-reservation-core.js'].forEach(f => {
    assert.match(build, new RegExp(f.replace(/\./g, '\\.')));
    assert.equal(read('functions/shared/' + f), read('shared/' + f), f + ' copy is stale: run npm --prefix functions run build:shared');
  });
});
t('F4/F5: POS checks available stock and per-variant previous stock', () => {
  assert.match(authority, /stockCore\.checkAvailable\(current, item\.variantId \|\| null, item\.stockQuantity\)/);
  assert.match(authority, /previousStock: stock,\n\s*resultingStock: lineStock\[index\]\.resulting/);
  assert.match(authority, /BELOW_RESERVED/);
  assert.match(authority, /function writeStockIncreases/);
});
t('T2: stock commit runs inside the settlement transaction, after the hold check', () => {
  assert.match(index, /settlementPrepare\(t, fresh, stockConfig\)/);
  assert.match(index, /settlementDecide\(stockState, c\.id, c\.data, now\)/);
  assert.match(index, /settlementFlush\(t, stockState, now\)/);
  assert.match(index, /stockCore\.escrowReleaseBlocked\(o\)/);
});
t('F6: rules make variantCombinations and reservedStock server-only; clients use productVariantsSave', () => {
  assert.match(rules, /affectedKeys\(\)\.hasAny\(\['reservedStock','variantCombinations'\]\)/);
  assert.match(rules, /!\('variantCombinations' in request\.resource\.data\)/);
  assert.match(rules, /match \/inventory_reservations\/\{id\}/);
  assert.match(read('js/app/08-app-state.js'), /wrapCallable\('productVariantsSave'\)/);
  assert.match(read('js/app/12-sys-modes.js'), /wrapCallable\('productVariantsSave'\)/);
  assert.match(read('js/app/12-sys-modes.js'), /delete updateMap\.variantCombinations;/);
});
t('F7: stock transfer key is the transfer document id (no undeclared rideId)', () => {
  const hub = read('js/app/17-hub.js');
  const fn = hub.slice(hub.indexOf('window.submitStockTransfer'), hub.indexOf('window.submitStockTransfer') + 4000);
  assert.doesNotMatch(fn, /rideId/);
  assert.match(fn, /idempotencyKey: 'transfer-out-' \+ transferId/);
  assert.match(fn, /skh\.setDoc\(transferRef/);
});
console.log(`inventory reservation core + contracts: ${n} checks passed`);

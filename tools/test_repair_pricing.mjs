#!/usr/bin/env node
/**
 * [REPAIR 2026-10 H2] Server pricing core: unit tests (no emulator needed).
 * Checks commerce-mode lower bounds and that the server boost price equals
 * the browser formula in js/app/01-market.js.
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const P = require('../functions/pricing-core.js');
let pass = 0;
function t(name, fn) { fn(); pass++; console.log('PASS ' + name); }
const now = Date.parse('2026-10-30T12:00:00Z');

t('fixed price product', () => assert.equal(P.modeUnitPrice({ price: 5000 }, 1, 'b', now), 5000));
t('variant price overrides base', () => assert.equal(P.variantPrice({ variants: [{ variantId: 'v1', price: 7000 }] }, { variantId: 'v1' }), 7000));
t('unknown variant -> null', () => assert.equal(P.variantPrice({ variants: [{ variantId: 'v1', price: 7000 }] }, 'v9'), null));
t('price drop never below minPrice', () => assert.equal(P.modeUnitPrice({ price: 10000, modeData: { mode: 'price_drop', startTime: now - 3600e3, intervalMs: 60000, dropAmount: 500, minPrice: 6000 } }, 1, 'b', now), 6000));
t('price drop mid-way', () => assert.equal(P.modeUnitPrice({ price: 10000, modeData: { mode: 'price_drop', startTime: now - 120000, intervalMs: 60000, dropAmount: 500, minPrice: 1000 } }, 1, 'b', now), 9000));
t('group buy discount by joined users', () => assert.equal(P.modeUnitPrice({ price: 10000, modeData: { mode: 'group_buy', joinedUsers: 3, discountValue: 1000 } }, 1, 'b', now), 8000));
t('group buy member gets group price', () => assert.equal(P.modeUnitPrice({ price: 10000, modeData: { mode: 'group_buy', joinedUsers: 3, discountValue: 1000, participants: ['a', 'b'] } }, 1, 'b', now), 8000));
t('group buy non-member pays base price', () => assert.equal(P.modeUnitPrice({ price: 10000, modeData: { mode: 'group_buy', joinedUsers: 3, discountValue: 1000, participants: ['a', 'c'] } }, 1, 'b', now), 10000));
t('wholesale tier applies at min qty', () => assert.equal(P.modeUnitPrice({ price: 1000, modeData: { mode: 'wholesale', tiers: [{ minQty: 10, price: 800 }] } }, 12, 'b', now), 800));
t('wholesale tier ignored below min qty', () => assert.equal(P.modeUnitPrice({ price: 1000, modeData: { mode: 'wholesale', tiers: [{ minQty: 10, price: 800 }] } }, 3, 'b', now), 1000));
t('auction winner pays winning bid after end', () => assert.equal(P.modeUnitPrice({ price: 1000, modeData: { mode: 'auction', endTime: now - 1, maxBidder: 'b', currentBid: 4500 } }, 1, 'b', now), 4500));
t('auction live -> not purchasable', () => assert.equal(P.modeEligibility({ price: 1000, modeData: { mode: 'auction', endTime: now + 60000, maxBidder: 'b', currentBid: 4500 } }, 'b', now), 'auction_live'));
t('auction ended, non-winner -> not purchasable', () => assert.equal(P.modeEligibility({ price: 1000, modeData: { mode: 'auction', endTime: now - 1, maxBidder: 'x', currentBid: 4500 } }, 'b', now), 'not_auction_winner'));
t('auction ended, no bids -> not purchasable', () => assert.equal(P.modeEligibility({ price: 1000, modeData: { mode: 'auction', endTime: now - 1 } }, 'b', now), 'auction_no_winner'));
t('auction ended, winner -> purchasable', () => assert.equal(P.modeEligibility({ price: 1000, modeData: { mode: 'auction', endTime: now - 1, maxBidder: 'b', currentBid: 4500 } }, 'b', now), ''));
t('free market -> purchasable', () => assert.equal(P.modeEligibility({ price: 1000 }, 'b', now), ''));
t('auction non-winner pays base', () => assert.equal(P.modeUnitPrice({ price: 1000, modeData: { mode: 'auction', endTime: now - 1, maxBidder: 'x', currentBid: 4500 } }, 1, 'b', now), 1000));
// Browser formula copied from js/app/01-market.js calculateBoost
function browserBoost(col, v, d) {
  if (col === 'products') return Math.max(2000, Math.round(2000 * Math.pow(((v / 1000) + (d / 3) + 1) / 3, 1.6)));
  return Math.max(1000, Math.round(1000 * Math.pow(((v / 1000) + (d / 7)) / 2, 1.4)));
}
t('boost price matches browser formula', () => {
  for (const col of ['products', 'services']) for (const v of [1000, 5000, 20000]) for (const d of [1, 3, 7, 30]) assert.equal(P.boostPrice(col, v, d), browserBoost(col, v, d));
});
t('subscription prices match the packages shown to users', () => assert.deepEqual(P.SUBSCRIPTION_PRICES, { 'BASIC SELLER': 10000, 'UNLIMITED PRO': 35000, 'MONTHLY PACKAGE': 4000, 'YEARLY SAVER': 43000 }));
console.log(`\nRepair pricing: ${pass} passed, 0 failed`);

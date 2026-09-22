import assert from 'node:assert/strict';
import { buildMarketplaceSections, boostEligibility, distanceKm, listingEligible } from '../js/app/39-market-ranking.js';

let n = 0;
function test(name, fn) { fn(); n += 1; console.log('✅', name); }
const now = Date.parse('2026-09-22T12:00:00Z');
const base = (id, extra = {}) => ({
  id, collectionName: 'products', title: 'Bidhaa ' + id, price: 1000,
  active: true, createdAt: '2026-09-21T12:00:00Z', location: 'Dar es Salaam',
  ...extra
});

test('listing halisi yenye id/title inastahili', () => assert.equal(listingEligible(base('p1')), true));
test('deleted/suspended/draft hazistahili', () => {
  assert.equal(listingEligible(base('d', { deletedAt: 'x' })), false);
  assert.equal(listingEligible(base('s', { status: 'suspended' })), false);
  assert.equal(listingEligible(base('r', { status: 'draft' })), false);
});
test('boost lazima iwe active na haija-expire', () => {
  assert.equal(boostEligibility(base('b1', { isBoosted: true, boostExpiresAt: '2026-09-23T00:00:00Z' }), now).eligible, true);
  assert.equal(boostEligibility(base('b2', { isBoosted: true, boostExpiresAt: '2026-09-20T00:00:00Z' }), now).eligible, false);
});
test('boost iliyofikisha target haisongi boosted rank', () => {
  assert.equal(boostEligibility(base('b3', { isBoosted: true, boostExpiresAt: '2026-09-23T00:00:00Z', boostTargetViews: 10, boostedViewsCount: 10 }), now).eligible, false);
});
test('legacy boost haidumu milele', () => {
  assert.equal(boostEligibility(base('legacy', { isBoosted: true, boostedAt: '2026-09-10T00:00:00Z' }), now).eligible, false);
});
test('haversine inatoa umbali halisi', () => {
  const d = distanceKm(-6.7924, 39.2083, -6.8161, 39.2803);
  assert.ok(d > 7 && d < 9);
});

const items = [
  base('near', { coords: { lat: -6.80, lon: 39.21 }, recentViews: 3 }),
  base('trend', { coords: { lat: -6.9, lon: 39.3 }, views24h: 500, likeCount: 20, shareCount: 8 }),
  base('searched', { recentSearchCount: 90, searchCount7d: 150 }),
  base('boost', { isBoosted: true, boostExpiresAt: '2026-09-24T00:00:00Z', views24h: 5 }),
  base('expired', { isBoosted: true, boostExpiresAt: '2026-09-20T00:00:00Z', views24h: 2 }),
  base('suspended', { isBoosted: true, boostExpiresAt: '2026-09-24T00:00:00Z', status: 'suspended' })
];
const out = buildMarketplaceSections(items, { now, userLat: -6.7924, userLon: 39.2083, region: 'Dar es Salaam', limit: 3 });

test('nearby ina record yenye distance, si dummy', () => {
  assert.ok(out.nearby.length > 0);
  assert.ok(out.nearby.every(x => items.some(i => i.id === x.id)));
  assert.ok(out.nearby.some(x => Number.isFinite(x.computedDistance)));
});
test('trending inatumia recent activity', () => assert.ok([...out.nearby, ...out.trending].some(x => x.id === 'trend' && x._marketScore > 0)));
test('most searched inahitaji search signal', () => assert.ok(out.searched.some(x => x.id === 'searched')));
test('boosted ina active boost tu', () => {
  assert.ok(out.boosted.some(x => x.id === 'boost'));
  assert.ok(!out.boosted.some(x => ['expired', 'suspended'].includes(x.id)));
});
test('dedupe inapunguza kurudia sections mfululizo', () => {
  const ids = [...out.nearby, ...out.trending, ...out.searched, ...out.boosted].map(x => x.id);
  const duplicates = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.ok(duplicates.length <= 1); // reuse only allowed when a section would otherwise be empty
});
test('search events halisi zinaweza kupanga most searched bila hardcode', () => {
  const r = buildMarketplaceSections([
    base('maize', { title: 'Mahindi ya Njano' }),
    base('rice', { title: 'Mchele wa Mbeya' })
  ], { now, searchTerms: [{ query: 'mahindi', at: '2026-09-22T10:00:00Z' }, { query: 'mahindi', at: '2026-09-21T10:00:00Z' }], limit: 5 });
  assert.ok(r.searched.some(x => x.id === 'maize'));
  assert.ok(!r.searched.some(x => x.id === 'rice'));
});
test('boost isiyohusiana na query haishindi relevance', () => {
  const r = buildMarketplaceSections([
    base('phone', { title: 'Simu Android', recentSearchCount: 2 }),
    base('tractor', { title: 'Trekta', isBoosted: true, boostExpiresAt: '2026-09-24T00:00:00Z' })
  ], { now, query: 'simu', limit: 5 });
  assert.ok(!r.boosted.some(x => x.id === 'tractor'));
});

console.log(`MARKET RANKING: ${n} passed, 0 failed`);

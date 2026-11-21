#!/usr/bin/env node
/* [SEARCH-INTEL 2026-11-21] Unit tests for shared/search-engine.js + shared/search-dictionary.js (no emulator, no browser).
 * Kiswahili / English, typos, singular-plural, synonyms and phrases, natural language, category, location, price and
 * availability filters, empty results, duplicates, seller verification, anti-manipulation (paid boost, stuffing,
 * self-reviews, inflated views), sponsored labelling, suggestions, comparison and performance. */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const E = require('../shared/search-engine.js');
const D = require('../shared/search-dictionary.js');
const T = require('../shared/search-tokens.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const NOW = Date.parse('2026-11-21T12:00:00Z'), day = 86400000;
const iso = (d) => new Date(NOW - d * day).toISOString();
const base = (o) => Object.assign({ publicationStatus: 'published', availabilityStatus: 'available', createdAt: iso(5), updatedAt: iso(2), collectionName: 'products',
  images: ['https://res.cloudinary.com/demo/image/upload/a.jpg', 'https://res.cloudinary.com/demo/image/upload/b.jpg'], description: 'Maelezo kamili ya bidhaa hii yenye ubora mzuri na dhamana.' }, o);
const ITEMS = [
  base({ id: 'p1', userId: 'u1', title: 'Samsung Galaxy A15 128GB', brand: 'Samsung', price: 350000, category: 'CAT-12', location: 'Kariakoo, Dar es Salaam', stock: 6, condition: 'Mpya' }),
  base({ id: 'p2', userId: 'u2', title: 'Tecno Spark 20 simu', price: 280000, category: 'CAT-12', location: 'Mwanza', stock: 3, condition: 'Imetumika' }),
  base({ id: 'p3', userId: 'u3', title: 'iPhone 12 Pro', price: 1200000, category: 'CAT-12', location: 'Arusha', stock: 1, verified: true }),
  base({ id: 'p4', userId: 'u4', title: 'Viatu vya Nike Air', price: 85000, category: 'CAT-07', location: 'Dar es Salaam', stock: 4 }),
  base({ id: 'p5', userId: 'u5', title: 'Friji ya LG lita 260', price: 950000, category: 'CAT-11', location: 'Dodoma', stock: 2 }),
  base({ id: 'p6', userId: 'u6', title: 'Nguo za watoto (set ya vipande 3)', price: 25000, category: 'CAT-07', location: 'Morogoro', stock: 10 }),
  base({ id: 'p7', userId: 'u7', title: 'Kiti cha ofisi', price: 120000, category: 'CAT-09', location: 'Dar', stock: 5 }),
  base({ id: 's1', userId: 'u8', title: 'Fundi umeme wa nyumba na ofisi', price: 30000, collectionName: 'services', location: 'Dar es Salaam' }),
  base({ id: 's2', userId: 'u9', title: 'Fundi bomba (plumber) Arusha', price: 25000, collectionName: 'services', location: 'Arusha' }),
  // the same Samsung listing posted three times by one seller
  base({ id: 'p8', userId: 'u1', title: 'Samsung Galaxy A15 128GB', brand: 'Samsung', price: 350000, category: 'CAT-12', location: 'Dar', stock: 6 }),
  base({ id: 'p9', userId: 'u1', title: 'Samsung Galaxy A15 128GB', brand: 'Samsung', price: 350000, category: 'CAT-12', location: 'Dar', stock: 6 }),
  // drafts / removed / hidden must never surface
  base({ id: 'x1', userId: 'u10', title: 'Samsung draft', publicationStatus: 'draft', category: 'CAT-12' }),
  base({ id: 'x2', userId: 'u10', title: 'Samsung removed', moderationStatus: 'removed', category: 'CAT-12' }),
  base({ id: 'x3', userId: 'u10', title: 'Samsung hidden', availabilityStatus: 'hidden', category: 'CAT-12' })
];
const ids = (r) => r.results.filter(x => !x.sponsored).map(x => x.item.id);
const rank = (q, c) => E.rank(ITEMS, q, Object.assign({ now: NOW }, c || {}));

// ---- language understanding
ok(ids(rank('simu')).slice(0, 3).every(id => ['p1', 'p2', 'p3'].includes(id)), 'Kiswahili "simu" finds phones (title word + whole category CAT-12)');
ok(ids(rank('phone')).includes('p1') && ids(rank('mobile phone')).includes('p2'), 'English "phone" / "mobile phone" find Kiswahili listings');
ok(ids(rank('shoes'))[0] === 'p4' && ids(rank('kiatu'))[0] === 'p4', 'shoes / kiatu (singular) find "Viatu" (plural)');
ok(ids(rank('refrigerator'))[0] === 'p5' && ids(rank('jokofu'))[0] === 'p5', 'refrigerator / jokofu find "Friji"');
ok(ids(rank("children's clothes"))[0] === 'p6' && ids(rank('kids clothes'))[0] === 'p6', 'phrase synonyms: children\'s clothes → "Nguo za watoto"');
ok(ids(rank('electrician'))[0] === 's1' && ids(rank('fundi umeme'))[0] === 's1', 'service phrase: electrician / fundi umeme');
ok(ids(rank('plumber'))[0] === 's2', 'service: plumber');
ok(ids(rank('viti'))[0] === 'p7' && ids(rank('chairs'))[0] === 'p7', 'plural "viti" and "chairs" find "Kiti"');
ok(ids(rank('samsnug'))[0] === 'p1' && ids(rank('frji'))[0] === 'p5' && ids(rank('galxy'))[0] === 'p1', 'typo tolerance: samsnug / frji / galxy');
ok(ids(rank('sams'))[0] === 'p1' && ids(rank('tecn'))[0] === 'p2', 'partial words (prefix): sams / tecn');
ok(ids(rank('nataka simu ya samsung tafadhali'))[0] === 'p1', 'natural language: filler words ignored');
ok(E.analyze('fundi umeme').collection === 'services' && E.analyze('viatu').category === 'CAT-07', 'intent: collection and category hints from the dictionary');
ok(D.GROUPS.length >= 80 && D.GROUPS.every(g => Array.isArray(g.terms) && g.terms.length >= 2 && ['products', 'services', 'drivers'].includes(g.kind)), 'dictionary is data: ' + D.GROUPS.length + ' synonym groups, each with a kind');
ok(T.tokensFor({ title: 'Jokofu la Samsung' }).includes('fridge') && T.tokensFor({ title: 'Kiyoyozi' }).includes('ac'), 'server index tokens use the same dictionary (jokofu → fridge, kiyoyozi → ac)');

// ---- intent: price, location, sort
const a1 = E.analyze('simu chini ya 300k'); ok(a1.maxPrice === 300000, 'price: "chini ya 300k" → max 300,000');
ok(ids(rank('simu chini ya 300k')).join() === 'p2', 'price filter applied from the query');
ok(E.analyze('friji kuanzia 1m').minPrice === 1000000 && E.analyze('viatu 50,000 - 90,000').maxPrice === 90000, 'price: "kuanzia 1m" and ranges');
ok(rank('simu bei nafuu').sort === 'price_asc' && ids(rank('simu bei nafuu'))[0] === 'p2', 'intent "bei nafuu" → cheapest first');
ok(E.analyze('viatu mwanza').region === 'Mwanza' && E.analyze('simu kariakoo').region === 'Dar es Salaam', 'location: region names and towns (Kariakoo → Dar es Salaam)');
ok(ids(rank('simu mwanza'))[0] === 'p2', 'location boosts listings in the requested region');
const near = E.rank([base({ id: 'n1', title: 'Simu A', userId: 'a', coords: { lat: -6.79, lon: 39.21 } }), base({ id: 'n2', title: 'Simu B', userId: 'b', coords: { lat: -3.37, lon: 36.68 } })], 'simu', { now: NOW, userLat: -3.39, userLon: 36.68, sort: 'nearest' });
ok(near.results[0].item.id === 'n2' && near.results[0].factors._distanceKm < 10, 'nearest: approximate coordinates → closest first (Arusha user)');

// ---- filters
ok(ids(rank('simu', { inStockOnly: true })).length === 3, 'in-stock filter');
const unconf = E.rank([base({ id: 'u1x', title: 'Simu mpya', userId: 'q', openingStockPending: true, stock: 0 })], 'simu', { now: NOW, inStockOnly: true });
ok(unconf.results.length === 0 && unconf.filtered === 1, 'in-stock filter excludes listings whose stock the seller has not confirmed');
ok(ids(rank('simu', { verifiedOnly: true })).join() === 'p3', 'verified-sellers filter (server-owned flags only)');
ok(ids(rank('simu', { collection: 'services' })).length === 0 && ids(rank('fundi', { collection: 'services' })).length === 2, 'collection filter');
ok(ids(rank('simu', { minPrice: 300000, maxPrice: 400000 })).join() === 'p1', 'price range filter from the UI');

// ---- empty results + suggestions
ok(rank('helikopta').total === 0, 'empty result for an unknown word');
ok(E.correct('samsnug galxy', ITEMS) === 'samsung galaxy', '"Je, ulimaanisha": samsnug galxy → samsung galaxy');
ok(E.correct('samsung', ITEMS) === null, 'no correction for a correct word');
ok(E.related('simu', rank('simu').results).some(s => /phone|smartphone/.test(s)), 'related searches from the dictionary');
ok(E.autocomplete('sam', ITEMS).includes('samsung galaxy a15 128gb'), 'autocomplete from real listing titles');

// ---- eligibility, duplicates
ok(!ids(rank('samsung')).some(id => /^x/.test(id)), 'drafts, removed and hidden listings never appear');
const r1 = rank('samsung galaxy'); ok(ids(r1).filter(id => ['p1', 'p8', 'p9'].includes(id)).length === 1 && r1.duplicates === 2, 'duplicate listings of one seller collapse to one (2 collapsed)');

// ---- ranking quality + anti-manipulation
const pair = (extraA, extraB, q = 'simu tecno') => E.rank([base(Object.assign({ id: 'A', userId: 'a', title: 'Simu Tecno Camon', price: 300000, stock: 4, category: 'CAT-12' }, extraA)),
  base(Object.assign({ id: 'B', userId: 'b', title: 'Simu Tecno Camon', price: 300000, stock: 4, category: 'CAT-12' }, extraB))], q, { now: NOW }).results;
ok(pair({ verified: true }, {}).filter(x => !x.sponsored)[0].item.id === 'A', 'seller verification ranks higher (all else equal)');
ok(pair({}, { stock: 0, availabilityStatus: 'out_of_stock' }).filter(x => !x.sponsored)[0].item.id === 'A', 'out-of-stock listing ranks lower');
ok(pair({ images: [] , description: '' }, {}).filter(x => !x.sponsored)[0].item.id === 'B', 'complete listing (photos, description) ranks higher');
ok(pair({ updatedAt: iso(200), createdAt: iso(200) }, {}).filter(x => !x.sponsored)[0].item.id === 'B', 'fresher listing ranks higher');
const boost = { isBoosted: true, boostExpiresAt: new Date(NOW + 3 * day).toISOString() };
const pb = pair(boost, { verified: true });
ok(pb.filter(x => !x.sponsored)[0].item.id === 'B' && pb.some(x => x.sponsored && x.item.id === 'A' && x.label === 'Imefadhiliwa'), 'paid boost adds NO organic score: shown once in a labelled sponsored slot');
ok(E.rank([base(Object.assign({ id: 'S', userId: 's', title: 'Sofa ya kisasa' }, boost))], 'simu tecno', { now: NOW }).results.length === 0, 'sponsored slot requires a relevant match');
const stuffed = pair({ title: 'Simu Tecno Camon simu simu tecno tecno samsung iphone simu bei nafuu simu' }, {});
ok(stuffed.filter(x => !x.sponsored)[0].item.id === 'B', 'keyword stuffing is penalised');
const selfRev = { comments: [{ userId: 'a', rating: 5 }, { userId: 'a', rating: 5 }, { userId: 'a', rating: 5 }] };
ok(E.reputation(base(Object.assign({ userId: 'a' }, selfRev))).n === 0, 'self-reviews by the listing owner are ignored');
ok(E.reputation(base({ userId: 'a', comments: [{ userId: 'r1', rating: 5 }, { userId: 'r1', rating: 5 }] })).n === 1, 'repeat reviews by one person count once');
ok(E.reputation(base({ userId: 'a', comments: [{ userId: 'r1', rating: 5 }] })).v < 0.75, 'a single 5★ review is shrunk toward the prior');
const views = pair({ views: 1e7, likeCount: 1e6 }, { verified: true });
ok(views.filter(x => !x.sponsored)[0].item.id === 'B', 'inflated views/likes are capped and cannot beat a verified seller');
ok(Math.abs(Object.values(E.WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'ranking weights are documented and sum to 1');
ok(E.rank(ITEMS, 'simu', { now: NOW, weights: { sellerTrust: 0.6, relevance: 0.1 } }).results.filter(x => !x.sponsored)[0].item.id === 'p3', 'weights are configurable');
ok(rank('simu').results.every(r => r.factors && typeof r.factors.relevance === 'number' && r.factors._availability), 'every result explains its factors');

// ---- comparison
const cmp = E.compare(ITEMS[0], ITEMS.concat([base({ id: 'c1', userId: 'c1', title: 'Samsung Galaxy A15 64GB', price: 300000, category: 'CAT-12', stock: 2 }), base({ id: 'c2', userId: 'c2', title: 'Samsung Galaxy A15', price: 330000, category: 'CAT-12', stock: 2 }), base({ id: 'c3', userId: 'c3', title: 'Galaxy A15 Samsung', price: 360000, category: 'CAT-12', stock: 2 })]));
ok(cmp.stats && cmp.stats.count >= 3 && cmp.stats.min === 300000 && !cmp.items.some(x => x.id === 'p1'), 'price comparison: real comparable listings, cheapest first, duplicates removed');

// ---- performance
const big = Array.from({ length: 5000 }, (_, i) => base({ id: 'b' + i, userId: 'u' + (i % 700), title: ['Simu', 'Viatu', 'Friji', 'Kiti', 'Sofa'][i % 5] + ' modeli ' + i, price: 1000 + i, category: 'CAT-1' + (i % 3), stock: i % 7 }));
const t0 = process.hrtime.bigint(); const rb = E.rank(big, 'simu modeli', { now: NOW }); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
const t1 = process.hrtime.bigint(); E.rank(big, 'samsnug', { now: NOW }); const ms2 = Number(process.hrtime.bigint() - t1) / 1e6;
console.log(`    5,000 listings: "simu modeli" ${ms.toFixed(0)} ms (${rb.total} results), typo query ${ms2.toFixed(0)} ms`);
ok(ms < 1500 && ms2 < 2500, 'performance: 5,000 listings ranked in ' + ms.toFixed(0) + ' ms / typo ' + ms2.toFixed(0) + ' ms');
console.log(`\nSEARCH ENGINE (unit): ${n} passed, 0 failed`);

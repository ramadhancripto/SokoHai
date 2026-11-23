#!/usr/bin/env node
/* [LOCATION 2026-11-21] Unit tests for shared/location-core.js and the removal of the fake Dar es Salaam fallback. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const L = require('../shared/location-core.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const NOW = Date.parse('2026-11-21T12:00:00Z');
const pos = (lat, lon, accuracy, ageMs) => ({ coords: { latitude: lat, longitude: lon, accuracy }, timestamp: NOW - (ageMs || 0) });

t('correct GPS: fresh, accurate fix is "gps" with the same coordinates (not swapped)', () => {
  const f = L.fromPosition(pos(-3.3869, 36.6830, 25), NOW); const c = L.classify(f, NOW);
  ok(c.kind === 'gps' && c.lat === -3.3869 && c.lon === 36.683, JSON.stringify(c));
});
t('malformed coordinates are rejected (NaN, strings, out of range, 0,0)', () => {
  ok(L.fromPosition(pos(NaN, 39, 10), NOW) === null); ok(L.fromPosition(pos(-95, 39, 10), NOW) === null);
  ok(L.fromPosition(pos(-6, 200, 10), NOW) === null); ok(L.fromPosition(pos(0, 0, 10), NOW) === null);
  ok(L.fromPosition({}, NOW) === null); ok(L.validCoords('abc', '1') === null); ok(L.validCoords('-6.8', '39.2').lat === -6.8);
});
t('low accuracy (e.g. 15 km, Wi-Fi / IP) is "approximate", never GPS', () => {
  const c = L.classify(L.fromPosition(pos(-6.8, 39.28, 15000), NOW), NOW); ok(c.kind === 'approximate', c.kind);
  ok(/takriban/.test(L.label(c)), L.label(c));
});
t('unknown accuracy (old saved data) is not presented as precise', () => {
  ok(L.classify({ lat: -6.8, lon: 39.28, ts: NOW - 1000, source: 'gps' }, NOW).kind === 'approximate');
});
t('stale cache: 3 h old fix is "approximate" and labelled as the last known place', () => {
  const s = { lat: -6.8, lon: 39.28, accuracy: 20, ts: NOW - 3 * 3600e3, source: 'gps', name: 'Kinondoni, Dar es Salaam', nameFor: L.key({ lat: -6.8, lon: 39.28 }) };
  const c = L.classify(s, NOW); ok(c.kind === 'approximate' && c.stale, JSON.stringify(c));
  ok(L.label(c) === 'Kinondoni, Dar es Salaam (la mwisho)', L.label(c));
});
t('stale cache older than 24 h is not used at all', () => {
  ok(L.classify({ lat: -6.8, lon: 39.28, accuracy: 20, ts: NOW - 25 * 3600e3, source: 'gps' }, NOW).kind === 'unavailable');
});
t('a place name is only used for the coordinates it was resolved for', () => {
  const s = { lat: -3.39, lon: 36.68, accuracy: 20, ts: NOW, source: 'gps', name: 'Kinondoni, Dar es Salaam', nameFor: L.key({ lat: -6.8, lon: 39.28 }) };
  const c = L.classify(s, NOW); ok(c.kind === 'gps' && c.name === '', JSON.stringify(c)); ok(L.label(c) === 'Karibu nawe');
});
t('reverse-geocoding: good answer -> "Area, City"', () => {
  ok(L.nameFromReverse({ lat: '-3.387', lon: '36.683', address: { suburb: 'Kaloleni', city: 'Arusha' } }, -3.3869, 36.683) === 'Kaloleni, Arusha');
});
t('reverse-geocoding failure / error / empty / far-away answer -> no name (no false label)', () => {
  ok(L.nameFromReverse(null, -3.3, 36.6) === ''); ok(L.nameFromReverse({ error: 'Unable to geocode' }, -3.3, 36.6) === '');
  ok(L.nameFromReverse({ address: {} }, -3.3, 36.6) === '');
  ok(L.nameFromReverse({ lat: '-6.8', lon: '39.28', address: { suburb: 'Kinondoni', city: 'Dar es Salaam' } }, -3.3869, 36.683) === '');
});
t('reverse-geocoding: an answer 10 km away is rejected (was accepted: 0.5° ≈ 55 km tolerance)', () => {
  ok(L.nameFromReverse({ lat: '-3.29', lon: '36.683', address: { suburb: 'Ngaramtoni', city: 'Arusha' } }, -3.3869, 36.683) === '');
});
t('reverse-geocoding: an answer without its own coordinates cannot be verified -> no name', () => {
  ok(L.nameFromReverse({ address: { suburb: 'Kaloleni', city: 'Arusha' } }, -3.3869, 36.683) === '');
});
t('reverse-geocoding: point inside the returned place\'s bounding box is accepted even if its centre is 4-5 km away', () => {
  ok(L.nameFromReverse({ lat: '-3.43', lon: '36.70', boundingbox: ['-3.45', '-3.36', '36.65', '36.72'], address: { suburb: 'Sakina', city: 'Arusha' } }, -3.3869, 36.683) === 'Sakina, Arusha');
});
t('reverse-geocoding: a region-sized bounding box does not vouch for a suburb name', () => {
  ok(L.nameFromReverse({ lat: '-3.0', lon: '36.0', boundingbox: ['-5', '-2', '35', '38'], address: { suburb: 'Mbali', city: 'Arusha' } }, -3.3869, 36.683) === '');
});
t('reverse-geocoding: the threshold is geographic (3 km), not degrees', () => {
  ok(L.REVERSE_MAX_KM === 3 && Math.round(L.kmBetween(-3.3869, 36.683, -3.36, 36.683)) === 3);
});
const DC = (o) => L.discoveryContext(Object.assign({ now: NOW }, o));
const FIX = { lat: -3.3869, lon: 36.683, accuracy: 20, ts: NOW - 60e3, source: 'gps', name: 'Kaloleni, Arusha', nameFor: L.key({ lat: -3.3869, lon: 36.683 }) };
t('Discover: a fresh accurate session fix is "gps" (precise)', () => {
  const c = DC({ fix: FIX, sessionLat: -3.3869, sessionLon: 36.683 }); ok(c.kind === 'gps' && c.precise && c.lat === -3.3869 && c.name === 'Kaloleni, Arusha', JSON.stringify(c));
});
t('Discover: a stale or low-accuracy fix is "approximate", never fresh GPS', () => {
  ok(DC({ fix: { ...FIX, ts: NOW - 3 * 3600e3 }, sessionLat: -3.3869, sessionLon: 36.683 }).kind === 'approximate');
  const c = DC({ fix: { ...FIX, accuracy: 15000 }, sessionLat: -3.3869, sessionLon: 36.683 }); ok(c.kind === 'approximate' && !c.precise);
});
t('Discover: skh.userLat alone (no classified fix) is NOT taken as GPS', () => { ok(DC({ fix: null, sessionLat: -6.8, sessionLon: 39.28 }) === null); });
t('Discover: a saved fix from another session without consent is not used', () => { ok(DC({ fix: FIX, sessionLat: null, sessionLon: null }) === null); ok(DC({ fix: { ...FIX, consent: true } }).kind === 'gps'); });
t('Discover: a place typed in Discover wins, as a NAME ONLY — never paired with the device coordinates', () => {
  const c = DC({ discoverManual: { name: 'Mwanza', source: 'manual' }, fix: FIX, sessionLat: -3.3869, sessionLon: 36.683 });
  ok(c.kind === 'manual' && c.name === 'Mwanza' && c.lat === null && c.lon === null && c.hasCoords === false, JSON.stringify(c));
});
t('Discover: typed "lat,lng" is kept as the manual position (validated)', () => {
  const c = DC({ discoverManual: { name: '-2.51,32.90', lat: -2.51, lon: 32.9, source: 'manual' }, fix: FIX }); ok(c.kind === 'manual' && c.lat === -2.51 && c.hasCoords);
  ok(DC({ discoverManual: { name: 'x', lat: 999, lon: 1, source: 'manual' } }).hasCoords === false);
});
t('Discover: the region chosen in the top bar wins over the device fix (name only)', () => {
  const c = DC({ barKind: 'manual', barName: 'Mbeya', fix: FIX, sessionLat: -3.3869, sessionLon: 36.683 }); ok(c.kind === 'manual' && c.name === 'Mbeya' && c.lat === null);
});
t('Discover source: getUserDiscoveryLocation no longer returns every skh.userLat as "gps"', () => {
  const s = read('js/app/75-discover-engine.js');
  ok(!/if \(typeof lat === 'number' && typeof lon === 'number'\) return validLocationContext\(\{ lat, lon, source: 'gps'/.test(s) && /LC\.discoveryContext\(/.test(s) && /return c && c\.hasCoords \? c : null/.test(s));
});
t('permission denied / GPS unavailable -> "unavailable", label asks the user to choose', () => {
  const c = L.classify(null, NOW); ok(c.kind === 'unavailable' && L.label(c) === 'Chagua eneo');
});
t('manual selection is shown as chosen and has no invented coordinates', () => {
  const c = L.classify({ source: 'manual', name: 'Arusha', ts: NOW }, NOW); ok(c.kind === 'manual' && L.label(c) === 'Arusha' && c.lat === undefined);
});
t('a background GPS result never replaces a manual choice; a user action does', () => {
  const m = { source: 'manual', name: 'Arusha' }, g = { lat: -6.8, lon: 39.28, source: 'gps' };
  ok(L.mayReplace(m, g, false) === false && L.mayReplace(m, g, true) === true && L.mayReplace(null, g, false) === true);
});
t('listing coordinates: only from a fresh accurate fix, rounded to ~1 km', () => {
  ok(JSON.stringify(L.listingCoords({ lat: -3.38694, lon: 36.68301, accuracy: 30, ts: NOW - 60e3, source: 'gps' }, NOW)) === '{"lat":-3.39,"lon":36.68}');
});
t('listing coordinates: stale, low-accuracy, manual or missing position -> null (no wrong place on the listing)', () => {
  ok(L.listingCoords({ lat: -6.8, lon: 39.28, accuracy: 30, ts: NOW - 3 * 3600e3, source: 'gps' }, NOW) === null);
  ok(L.listingCoords({ lat: -6.8, lon: 39.28, accuracy: 12000, ts: NOW, source: 'gps' }, NOW) === null);
  ok(L.listingCoords({ source: 'manual', name: 'Arusha' }, NOW) === null); ok(L.listingCoords(null, NOW) === null);
});
t('the browser position cache is limited (no 24 h old fix as "current")', () => { ok(L.BROWSER_MAX_AGE_MS <= 10 * 60e3); });
t('ROOT CAUSE removed: geolocation failures are no longer turned into a fake Dar es Salaam fix', () => {
  const b = read('js/app/00-bootstrap.js');
  ok(!/mockPosition/.test(b) && !/navigator\.geolocation\.getCurrentPosition\s*=/.test(b) && !/navigator\.geolocation\.watchPosition\s*=/.test(b));
  ok(!/latitude:\s*-6\.7924/.test(read('js/app/84-location-fast.js')));
});
t('new listings take coords only from skhListingCoords (fresh GPS), not from whatever skh.userLat holds', () => {
  const s = read('js/app/08-app-state.js');
  ok(/coords: \(typeof window\.skhListingCoords === 'function'\) \? window\.skhListingCoords\(\) : null/.test(s) && !/coords: \(skh\.userLat/.test(s));
});
t('Discover: a typed place name is not saved with another position\'s coordinates', () => {
  const s = read('js/app/75-discover-engine.js');
  ok(!/lat: getUserDiscoveryLocation\(\)\.lat/.test(s) && !/name: 'Current Location'/.test(s));
});
t('one location module: 01-market no longer starts its own GPS request', () => {
  ok(!/setTimeout\(\(\) => \{\s*window\.requestUserLocation\(false\);/.test(read('js/app/01-market.js')));
});
console.log(`\nLOCATION CORE (unit): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

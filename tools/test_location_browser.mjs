#!/usr/bin/env node
/* [LOCATION 2026-11-21] The real app in Chromium with controlled geolocation and a mocked reverse-geocoder:
 * granted / denied / low accuracy / stale cache / reverse-geocoding failure / manual choice kept / listing coords.
 * Run: `node functions/local-server.js` (5055) from this checkout (+ emulators), then
 *      SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_location_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const b = await chromium.launch();
const ARUSHA = { latitude: -3.3869, longitude: 36.6830 };

async function open({ grant, geo, reverse, saved }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: grant ? ['geolocation'] : [], geolocation: geo || undefined });
  if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
  const calls = { reverse: 0 };
  await ctx.route(/nominatim\.openstreetmap\.org\/reverse/, r => { calls.reverse++; return reverse === 'fail' ? r.fulfill({ status: 503, body: 'busy' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reverse || {}) }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((s) => { try { localStorage.setItem('skh_welcomed_v1', '1'); if (s) localStorage.setItem('skh_last_loc', JSON.stringify(s)); } catch (e) {} }, saved || null);
  // [LOCATION 2026-11-24] record every distinct label the bar shows (to catch blinking on page load)
  await p.addInitScript(() => { window.__locSeen = []; const rec = () => { const e = document.getElementById('userLocationStatus'); if (!e) return; const t = e.textContent.trim(); if (window.__locSeen[window.__locSeen.length - 1] !== t) window.__locSeen.push(t); };
    new MutationObserver(rec).observe(document, { subtree: true, childList: true, characterData: true }); });
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.skh && window.skhListingCoords && document.getElementById('userLocationStatus'), null, { timeout: 45000 });
  return { ctx, p, errs, calls };
}
const bar = (p) => p.$eval('#userLocationStatus', e => ({ text: e.textContent.trim(), kind: e.getAttribute('data-loc-kind') }));
const settle = (p, kind) => p.waitForFunction(k => { const e = document.getElementById('userLocationStatus'); return e && e.getAttribute('data-loc-kind') === k; }, kind, { timeout: 20000 });

// 1. permission granted, accurate fix, reverse-geocoder answers
{ const { ctx, p, errs } = await open({ grant: true, geo: { ...ARUSHA, accuracy: 20 }, reverse: { lat: '-3.387', lon: '36.683', address: { suburb: 'Kaloleni', city: 'Arusha' } } });
  await settle(p, 'gps'); await p.waitForFunction(() => /Kaloleni/.test(document.getElementById('userLocationStatus').textContent), null, { timeout: 15000 });
  const s = await p.evaluate(() => ({ lat: window.skh.userLat, lon: window.skh.userLon, kind: window.skh.userLocationKind, lc: window.skhListingCoords() }));
  ok((await bar(p)).text === 'Kaloleni, Arusha', 'GPS granted: the bar shows the place resolved for THESE coordinates');
  ok(s.lat === -3.3869 && s.lon === 36.683 && s.kind === 'gps', 'GPS granted: skh.userLat/userLon are the device fix (not swapped)');
  ok(s.lc && s.lc.lat === -3.39 && s.lc.lon === 36.68, 'a new listing gets approximate (~1 km) coordinates of the real position');
  ok(!errs.length, 'no JavaScript errors (granted) ' + errs.join(' | '));
  await ctx.close(); }

// 2. permission denied: no fake Dar es Salaam, the user is asked to choose
{ const { ctx, p, errs } = await open({ grant: false });
  await settle(p, 'unavailable');
  const s = await p.evaluate(() => ({ lat: window.skh.userLat, lon: window.skh.userLon, lc: window.skhListingCoords() }));
  ok((await bar(p)).text === 'Chagua eneo', 'permission denied: the bar says "Chagua eneo" (no guessed place)');
  await p.waitForTimeout(2500);
  const seen = await p.evaluate(() => window.__locSeen);
  ok(seen.length === 1 && seen[0] === 'Chagua eneo', 'page load with no location does not blink ("Inatafuta…" / "Chagua eneo" back and forth): ' + JSON.stringify(seen));
  ok(s.lat == null && s.lon == null && s.lc === null, 'permission denied: no coordinates at all (the old code invented Dar es Salaam -6.7924, 39.2083)');
  await p.click('#userLocationStatus'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'regionFilterSelect'), 'tapping the bar after a denial opens the manual region choice');
  await p.selectOption('#regionFilterSelect', 'Mwanza'); await settle(p, 'manual');
  ok((await bar(p)).text === 'Mwanza', 'manual selection shows the chosen region');
  ok(await p.evaluate(() => window.skhListingCoords() === null), 'manual region does not invent listing coordinates');
  ok(!errs.length, 'no JavaScript errors (denied) ' + errs.join(' | '));
  await ctx.close(); }

// 3. low accuracy (Wi-Fi / cell / IP) is shown as approximate
{ const { ctx, p } = await open({ grant: true, geo: { latitude: -6.82, longitude: 39.27, accuracy: 15000 }, reverse: { lat: '-6.82', lon: '39.27', address: { suburb: 'Temeke', city: 'Dar es Salaam' } } });
  await settle(p, 'approximate'); await p.waitForFunction(() => /takriban/.test(document.getElementById('userLocationStatus').textContent), null, { timeout: 15000 });
  ok(/\(takriban\)$/.test((await bar(p)).text), 'low accuracy (15 km): labelled "(takriban)", not presented as GPS: ' + (await bar(p)).text);
  ok(await p.evaluate(() => window.skhListingCoords() === null), 'low accuracy: no coordinates are put on a new listing');
  await ctx.close(); }

// 4. reverse-geocoding fails: the old place name is NOT attached to the new coordinates
{ const old = { lat: -6.80, lon: 39.28, accuracy: 20, ts: Date.now() - 2 * 86400e3, name: 'Kinondoni, Dar es Salaam', source: 'gps' };
  const { ctx, p, calls } = await open({ grant: true, geo: { ...ARUSHA, accuracy: 20 }, reverse: 'fail', saved: old });
  await settle(p, 'gps'); await p.waitForTimeout(800);
  const t = (await bar(p)).text;
  ok(calls.reverse >= 1 && t === 'Karibu nawe' && !/Kinondoni|Dar/.test(t), 'reverse-geocoding failure: no false label (was the previous place name) -> "' + t + '"');
  ok(await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('skh_last_loc')); return s.lat === -3.3869 && s.name === ''; }), 'saved fix holds the new coordinates without a borrowed name');
  await ctx.close(); }

// 5. stale cache + GPS unavailable: shown as the last known place, not as current
{ const LC = { lat: -6.80, lon: 39.28 }; const key = (Math.round(LC.lat * 1000) / 1000) + ',' + (Math.round(LC.lon * 1000) / 1000);
  const { ctx, p } = await open({ grant: false, saved: { ...LC, accuracy: 20, ts: Date.now() - 3 * 3600e3, name: 'Kinondoni, Dar es Salaam', nameFor: key, source: 'gps' } });
  await settle(p, 'approximate'); await p.waitForTimeout(600);
  ok((await bar(p)).text === 'Kinondoni, Dar es Salaam (la mwisho)', 'stale cached position is labelled "(la mwisho)", never as current: ' + (await bar(p)).text);
  ok(await p.evaluate(() => window.skhListingCoords() === null), 'stale position: not used for a new listing');
  await ctx.close(); }

// 6. a manual choice is not overwritten by a background GPS result; an explicit tap does replace it
{ const { ctx, p } = await open({ grant: true, geo: { ...ARUSHA, accuracy: 20 }, reverse: { lat: '-3.387', lon: '36.683', address: { suburb: 'Kaloleni', city: 'Arusha' } } });
  await settle(p, 'gps');
  await p.selectOption('#regionFilterSelect', 'Mbeya'); await settle(p, 'manual');
  await p.evaluate(() => { localStorage.removeItem('skh_last_loc'); window.requestUserLocation(false); }); await p.waitForTimeout(1500);
  ok((await bar(p)).text === 'Mbeya', 'background GPS result does not overwrite the manual choice "Mbeya"');
  await p.click('#userLocationStatus'); await settle(p, 'gps'); await p.waitForFunction(() => /Kaloleni/.test(document.getElementById('userLocationStatus').textContent), null, { timeout: 15000 });
  ok((await bar(p)).text === 'Kaloleni, Arusha', 'tapping the bar (user action) switches back to GPS');
  await ctx.close(); }

// 7. Discover uses the same classification and precedence (typed place > bar region > device fix)
{ const { ctx, p, errs } = await open({ grant: true, geo: { ...ARUSHA, accuracy: 20 }, reverse: { lat: '-3.387', lon: '36.683', address: { suburb: 'Kaloleni', city: 'Arusha' } } });
  await settle(p, 'gps'); await p.waitForFunction(() => /Kaloleni/.test(document.getElementById('userLocationStatus').textContent), null, { timeout: 15000 });
  // the Discover engine is not loaded by index.html today (dormant module); load it the way it would be loaded
  await p.evaluate(() => import('/js/app/75-discover-engine.js'));
  await p.waitForFunction(() => typeof window.skhDiscoveryArea === 'function', null, { timeout: 15000 });
  let c = await p.evaluate(() => window.skhDiscoveryArea());
  ok(c && c.kind === 'gps' && c.precise === true && c.lat === -3.3869, 'Discover: fresh accurate device fix is GPS');
  await p.evaluate(() => localStorage.setItem('skh_discover_manual_loc', JSON.stringify({ name: 'Mwanza', ts: Date.now(), source: 'manual' })));
  c = await p.evaluate(() => ({ area: window.skhDiscoveryArea(), dist: window.skhDiscoveryLocation() }));
  ok(c.area.kind === 'manual' && c.area.name === 'Mwanza' && c.area.lat === null && c.dist === null, 'Discover: a typed place wins and is never paired with the Arusha coordinates (no distances from another position)');
  await p.evaluate(() => window.skhDiscoverEngineOpen && window.skhDiscoverEngineOpen('')); await p.waitForTimeout(800);
  ok(await p.evaluate(() => /Mwanza/.test((document.getElementById('skhDiscoverEngineBody') || {}).textContent || '')), 'Discover home shows the typed place (and renders without coordinates)');
  await p.evaluate(() => { localStorage.removeItem('skh_discover_manual_loc'); window.skhDiscoverEngineClose && window.skhDiscoverEngineClose(); });
  await p.selectOption('#regionFilterSelect', 'Mbeya'); await settle(p, 'manual');
  c = await p.evaluate(() => window.skhDiscoveryArea());
  ok(c.kind === 'manual' && c.name === 'Mbeya' && c.lat === null, 'Discover: the region chosen in the top bar takes precedence over GPS');
  await p.selectOption('#regionFilterSelect', ''); await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('skh_last_loc')); s.ts = Date.now() - 3 * 3600e3; localStorage.setItem('skh_last_loc', JSON.stringify(s)); });
  c = await p.evaluate(() => window.skhDiscoveryArea());
  ok(c && c.kind === 'approximate' && c.precise === false && c.stale === true, 'Discover: a 3-hour-old fix is "approximate / last known", not fresh GPS');
  ok(!errs.length, 'no JavaScript errors (Discover) ' + errs.join(' | '));
  await ctx.close(); }

await b.close();
console.log(`\nLOCATION (browser): ${n} passed, 0 failed`);

/* [LOCATION 2026-11-21] One pure module for the user's location (browser global SKHLocationCore, Node require, tests).
 *
 * Why: several modules each read/wrote `skh_last_loc` and `skh.userLat/userLon` with different rules, which produced
 * wrong locations:
 *   - the browser was allowed to return a cached GPS fix up to 24 h old (maximumAge = 24 h) and it was shown as current;
 *   - when reverse-geocoding failed, the NAME of the previously saved place was attached to the NEW coordinates
 *     (or "Tanzania Nzima"), so a user in Arusha could be labelled "Kinondoni, Dar es Salaam";
 *   - a manual area typed in Discover was saved together with the coordinates of the OLD position;
 *   - a new listing took `coords` from whatever position the browser last had (stale, manual or another place),
 *     not from a fresh fix of where the seller is.
 *
 * Rules implemented here:
 *   kind  'gps'          fresh device fix (<= FRESH_MS old) with usable accuracy (<= GOOD_ACCURACY_M)
 *         'approximate'  device fix with poor accuracy, or an older fix still inside STALE_MS ("last known")
 *         'manual'       a region/area the user chose; no coordinates are invented for it
 *         'unavailable'  nothing usable (denied, no GPS, timed out, invalid data, too old)
 *   - coordinates are validated (finite numbers, lat -90..90, lon -180..180, not the 0,0 "null island");
 *   - a background GPS result never replaces a manual choice; only an explicit user action does;
 *   - a place name is only ever derived from THESE coordinates (or omitted) — never borrowed from another fix;
 *   - a listing gets approximate coordinates (2 decimals ≈ 1 km) only from a fresh, accurate GPS fix. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHLocationCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var FRESH_MS = 10 * 60 * 1000;          // a GPS fix is "current" for 10 minutes
  var STALE_MS = 24 * 60 * 60 * 1000;     // after 24 h a saved position is not used at all
  var GOOD_ACCURACY_M = 2000;             // worse than 2 km = approximate (Wi-Fi / cell / IP-based)
  var BROWSER_MAX_AGE_MS = 5 * 60 * 1000; // what we accept from the browser's own position cache

  function num(v) { return typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN); }
  /** Valid coordinates or null. Rejects NaN, out-of-range values and 0,0. */
  function validCoords(lat, lon) {
    var a = num(lat), b = num(lon);
    if (!isFinite(a) || !isFinite(b)) return null;
    if (a < -90 || a > 90 || b < -180 || b > 180) return null;
    if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return null;
    return { lat: a, lon: b };
  }
  /** A browser GeolocationPosition (or {coords:{latitude,longitude,accuracy},timestamp}) -> fix or null. */
  function fromPosition(pos, now) {
    if (!pos || !pos.coords) return null;
    var c = validCoords(pos.coords.latitude, pos.coords.longitude);
    if (!c) return null;
    var acc = num(pos.coords.accuracy);
    var ts = num(pos.timestamp); if (!isFinite(ts) || ts <= 0) ts = now || Date.now();
    return { lat: c.lat, lon: c.lon, accuracy: isFinite(acc) && acc >= 0 ? acc : null, ts: ts, source: 'gps' };
  }
  /** Classify a stored or fresh state. */
  function classify(state, now) {
    now = now || Date.now();
    if (!state || typeof state !== 'object') return { kind: 'unavailable' };
    if (state.source === 'manual') {
      var name = String(state.name || '').trim();
      return name ? { kind: 'manual', name: name, ts: state.ts || 0 } : { kind: 'unavailable' };
    }
    var c = validCoords(state.lat, state.lon);
    if (!c) return { kind: 'unavailable' };
    var ts = num(state.ts), age = isFinite(ts) ? now - ts : Infinity;
    if (!(age >= -60000) || age > STALE_MS) return { kind: 'unavailable', reason: 'stale' };
    var acc = num(state.accuracy);
    var good = isFinite(acc) ? acc <= GOOD_ACCURACY_M : false;   // unknown accuracy (old saves) is not "precise"
    var kind = (age <= FRESH_MS && good) ? 'gps' : 'approximate';
    return { kind: kind, lat: c.lat, lon: c.lon, accuracy: isFinite(acc) ? acc : null, ts: ts, age: age,
      name: state.nameFor && state.nameFor === key(c) ? String(state.name || '') : '', stale: age > FRESH_MS };
  }
  /** Key that ties a place name to the coordinates it was resolved for. */
  function key(c) { return c ? (Math.round(c.lat * 1000) / 1000) + ',' + (Math.round(c.lon * 1000) / 1000) : ''; }
  var REVERSE_MAX_KM = 3;   // a neighbourhood / suburb answer must lie within ~3 km of the point we asked about
  function kmBetween(aLat, aLon, bLat, bLon) {
    var p = Math.PI / 180, dLat = (bLat - aLat) * p, dLon = (bLon - aLon) * p;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  /** Reverse-geocode response (Nominatim JSON) -> "Area, City", or '' when the answer cannot be tied to THIS point.
   * [LOCATION 2026-11-21 review] The answer is accepted only when
   *   - it carries the coordinates of the place it describes (no coordinates = cannot be verified = rejected), and
   *   - the requested point lies inside the returned place's bounding box (+0.01° ≈ 1 km margin), or
   *     the returned place is within REVERSE_MAX_KM (3 km) of the requested point.
   * (Before: any answer within 0.5° — about 55 km — was accepted, and an answer without coordinates always was.) */
  function nameFromReverse(data, lat, lon) {
    if (!data || typeof data !== 'object' || data.error) return '';
    var a = data.address;
    if (!a || typeof a !== 'object') return '';
    var q = validCoords(lat, lon), r = validCoords(data.lat, data.lon);
    if (!q || !r) return '';
    var ok = false, bb = data.boundingbox;
    if (Array.isArray(bb) && bb.length === 4) {
      var s1 = num(bb[0]), n1 = num(bb[1]), w1 = num(bb[2]), e1 = num(bb[3]), M = 0.01;
      if ([s1, n1, w1, e1].every(isFinite) && n1 - s1 < 1 && e1 - w1 < 1)   // a huge box (a whole region) says nothing about the suburb
        ok = q.lat >= s1 - M && q.lat <= n1 + M && q.lon >= w1 - M && q.lon <= e1 + M;
    }
    if (!ok) ok = kmBetween(q.lat, q.lon, r.lat, r.lon) <= REVERSE_MAX_KM;
    if (!ok) return '';
    var hood = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.village || a.hamlet || '';
    var city = a.city || a.town || a.municipality || a.county || a.state || a.region || '';
    var parts = [hood, city].map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (parts.length === 2 && parts[0] === parts[1]) parts.pop();
    return parts.join(', ').slice(0, 80);
  }
  /** Text for the location bar. Never claims GPS for anything that is not a fresh, accurate fix. */
  function label(cls) {
    if (!cls || cls.kind === 'unavailable') return 'Chagua eneo';
    if (cls.kind === 'manual') return cls.name;
    var n = cls.name || '';
    if (cls.kind === 'gps') return n || 'Karibu nawe';
    if (cls.stale) return (n || 'Eneo') + ' (la mwisho)';
    return (n || 'Karibu nawe') + ' (takriban)';
  }
  /** May an incoming state replace the current one? A manual choice is only replaced by an explicit user action. */
  function mayReplace(current, incoming, userAction) {
    if (userAction) return true;
    if (current && current.source === 'manual') return false;
    return !!incoming;
  }
  /** Approximate coordinates for a NEW listing: only from a fresh, accurate GPS fix; otherwise null. */
  function listingCoords(state, now) {
    var cls = classify(state, now);
    if (cls.kind !== 'gps') return null;
    return { lat: Math.round(cls.lat * 100) / 100, lon: Math.round(cls.lon * 100) / 100 };
  }
  /** [LOCATION 2026-11-21 review] Discover's location context, one precedence for every Discover search:
   *   1. a place the user typed in Discover (with its own typed coordinates, or as a NAME ONLY);
   *   2. the region the user chose in the top bar (name only);
   *   3. the device fix, classified ('gps' fresh+accurate, or 'approximate' = poor accuracy / last known);
   *   4. nothing.
   * A manual name is never paired with coordinates of another position; approximate/stale fixes are never
   * reported as fresh GPS. input: { discoverManual, barKind, barName, fix, sessionLat, sessionLon, now } */
  function discoveryContext(input) {
    input = input || {}; var now = input.now || Date.now();
    var m = input.discoverManual;
    if (m && typeof m === 'object' && String(m.name || '').trim()) {
      var mc = validCoords(m.lat, m.lon);
      return { kind: 'manual', source: 'manual', name: String(m.name).trim().slice(0, 80), lat: mc ? mc.lat : null, lon: mc ? mc.lon : null, hasCoords: !!mc, precise: false };
    }
    if (input.barKind === 'manual' && String(input.barName || '').trim()) {
      return { kind: 'manual', source: 'manual', name: String(input.barName).trim().slice(0, 80), lat: null, lon: null, hasCoords: false, precise: false };
    }
    var fix = input.fix;
    if (fix && typeof fix === 'object') {
      // a saved fix counts only if it is this session's fix (the app holds the same coordinates) or the user consented to keep it
      var same = validCoords(input.sessionLat, input.sessionLon);
      var mine = (same && Math.abs(same.lat - fix.lat) < 1e-9 && Math.abs(same.lon - fix.lon) < 1e-9) || fix.consent === true;
      var c = mine ? classify(fix, now) : { kind: 'unavailable' };
      if (c.kind === 'gps' || c.kind === 'approximate') {
        return { kind: c.kind, source: c.kind, name: c.name || '', lat: c.lat, lon: c.lon, hasCoords: true, precise: c.kind === 'gps', stale: !!c.stale, accuracy: c.accuracy };
      }
    }
    return null;
  }
  return { discoveryContext: discoveryContext, FRESH_MS: FRESH_MS, STALE_MS: STALE_MS, GOOD_ACCURACY_M: GOOD_ACCURACY_M, BROWSER_MAX_AGE_MS: BROWSER_MAX_AGE_MS,
    REVERSE_MAX_KM: REVERSE_MAX_KM, kmBetween: kmBetween, validCoords: validCoords, fromPosition: fromPosition, classify: classify, key: key, nameFromReverse: nameFromReverse,
    label: label, mayReplace: mayReplace, listingCoords: listingCoords };
});

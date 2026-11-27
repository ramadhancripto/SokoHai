/* [PART 5B-3 2026-11-25] Destination integrity core — ONE validator for a
 * delivery destination, used by the browser (global SKHDestinationCore), by the
 * server (functions/shared copy via build-shared.js) and by the tests.
 *
 * Why: a delivery request could be created with no destination at all. The
 * checkout only "advised" the customer to fill the address, the order was
 * written with delivery.destination = '', and the routing engine then produced a
 * ride_request with toLocation = '' and delivered it to providers.
 *
 * What is accepted (the formats the app already uses):
 *   - a plain string ............ "Dodoma", "Mtaa wa Kariakoo, Dar es Salaam"
 *   - structured object ......... { label|name|address|formatted|fullAddress|...: "Dodoma" }
 *   - structured + coordinates .. { label: "Dodoma", lat: -6.17, lon: 35.74 }
 *   - coordinates only .......... { lat, lon } / { latitude, longitude } (Firestore GeoPoint)
 *   - nested object ............. { location: {...} } / { place: { name: "Dodoma" } }
 * What is rejected:
 *   missing_destination .... no value at all (undefined / null / field absent)
 *   empty_destination ...... "" / "   " / {} / object whose every value is empty
 *   malformed_destination .. wrong type, or an object that is neither a label nor
 *                            usable coordinates (e.g. { lat: 'abc' }, [..], 42)
 *
 * Rules kept deliberately conservative:
 *   - a whitespace-only string is NEVER a destination (it is trimmed); it is not
 *     replaced by the origin or by any other field inside this module;
 *   - coordinates are validated (finite, lat -90..90, lon -180..180, not 0,0) —
 *     the same rules shared/location-core.js uses for device fixes;
 *   - the result is normalised (trimmed, inner whitespace collapsed, capped at
 *     MAX_LEN) so the ride/order store one canonical value.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // server (functions/shared)
  root.SKHDestinationCore = api;                                          // browser / node global
  if (typeof window !== 'undefined' && window && window !== root) {
    try { window.SKHDestinationCore = api; } catch (e) {}                // jsdom (test harness)
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_LEN = 240;
  var MISSING = 'missing_destination';
  var EMPTY = 'empty_destination';
  var MALFORMED = 'malformed_destination';

  var MESSAGES = {
    missing_destination: 'Weka anwani ya kufikishiwa (destination) kabla ya kuomba usafirishaji.',
    empty_destination: 'Anwani ya kufikishiwa haijajazwa. Jaza mtaa/mji na alama za njia, kisha ujaribu tena.',
    malformed_destination: 'Anwani ya kufikishiwa haieleweki. Tumia mtaa/mji au chagua eneo halali.'
  };

  var LABEL_KEYS = ['label', 'name', 'title', 'text', 'formatted', 'formattedAddress', 'fullAddress',
    'address', 'addressLine', 'addressLine1', 'line1', 'placeName', 'region', 'description', 'value'];
  var NESTED_KEYS = ['location', 'place', 'destination', 'dropoff', 'dropOff', 'to', 'geo', 'point'];

  function text(v) {
    if (typeof v !== 'string') return '';
    var s = v.replace(/\s+/g, ' ').trim();
    if (!s) return '';
    return s.length > MAX_LEN ? s.slice(0, MAX_LEN).trim() : s;
  }

  function num(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') return Number(v);
    return NaN;
  }

  /* Coordinates from a plain object or a Firestore GeoPoint. */
  function coords(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var a = num(obj.lat != null ? obj.lat : (obj.latitude != null ? obj.latitude : obj._latitude));
    var b = num(obj.lon != null ? obj.lon : (obj.lng != null ? obj.lng
      : (obj.longitude != null ? obj.longitude : obj._longitude)));
    if (!isFinite(a) || !isFinite(b)) return null;
    if (a < -90 || a > 90 || b < -180 || b > 180) return null;
    if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return null; // 0,0 "null island"
    return { lat: a, lon: b };
  }

  function labelOfObject(obj) {
    for (var i = 0; i < LABEL_KEYS.length; i++) {
      var t = text(obj[LABEL_KEYS[i]]);
      if (t) return t;
    }
    return '';
  }

  /* Is every own value of this object "empty" (null, '', {}, [], false)? */
  function allEmpty(obj) {
    var keys = Object.keys(obj);
    if (!keys.length) return true;
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v === null || v === undefined || v === '' || v === false || v === 0) continue;
      if (typeof v === 'string' && !text(v)) continue;
      if (Array.isArray(v) && !v.length) continue;
      if (typeof v === 'object' && !Array.isArray(v) && allEmpty(v)) continue;
      return false;
    }
    return true;
  }

  function ok(value, kind, extra) {
    return Object.assign({ ok: true, value: value, kind: kind, coords: null }, extra || {});
  }
  function bad(reason) { return { ok: false, reason: reason, value: '', kind: null, coords: null }; }

  function resolveOnce(v, depth) {
    if (v === undefined || v === null) return bad(MISSING);
    if (typeof v === 'string') {
      var s = text(v);
      return s ? ok(s, 'text') : bad(EMPTY);
    }
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' || typeof v === 'function' || typeof v === 'symbol') {
      return bad(MALFORMED);
    }
    if (Array.isArray(v)) return v.length ? bad(MALFORMED) : bad(EMPTY);
    if (typeof v !== 'object') return bad(MALFORMED);

    /* 1) nested location object: { location: {...} }, { place: { name } }, ... */
    if (depth < 2) {
      for (var n = 0; n < NESTED_KEYS.length; n++) {
        var inner = v[NESTED_KEYS[n]];
        if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
          var r = resolveOnce(inner, depth + 1);
          if (r.ok) return r;
        }
      }
    }

    /* 2) coordinates (with an optional label) */
    var c = coords(v);
    if (c) {
      var lbl = labelOfObject(v);
      return ok(lbl || (Math.round(c.lat * 100000) / 100000 + ', ' + Math.round(c.lon * 100000) / 100000),
        'structured', { coords: c });
    }

    /* 3) structured label */
    var t = labelOfObject(v);
    if (t) return ok(t, 'structured');

    /* 4) empty vs malformed */
    return allEmpty(v) ? bad(EMPTY) : bad(MALFORMED);
  }

  function resolve(v) { return resolveOnce(v, 0); }

  function messageFor(reason) { return MESSAGES[reason] || MESSAGES.missing_destination; }

  /* First value in `list` that resolves to a valid destination.
   * Used to apply ONE precedence (destination → destinationLocation → route.to →
   * toLocation) without inventing a value: a blank entry is skipped, never
   * replaced by the origin. When nothing is valid the most specific reason wins
   * (a malformed/blank field that was actually provided beats "missing"). */
  function firstValid(list) {
    var firstBad = null;
    var items = list || [];
    for (var i = 0; i < items.length; i++) {
      var r = resolve(items[i]);
      if (r.ok) return r;
      if (!firstBad && r.reason !== MISSING) firstBad = r;
    }
    return firstBad || bad(MISSING);
  }

  return {
    MAX_LEN: MAX_LEN,
    REASONS: { MISSING: MISSING, EMPTY: EMPTY, MALFORMED: MALFORMED },
    MESSAGES: MESSAGES,
    resolve: resolve,
    isValid: function (v) { return resolve(v).ok; },
    labelOf: function (v) { var r = resolve(v); return r.ok ? r.value : ''; },
    reasonFor: function (v) { var r = resolve(v); return r.ok ? null : r.reason; },
    messageFor: messageFor,
    firstValid: firstValid
  };
});

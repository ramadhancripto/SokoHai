/* [SEO-PRIVACY 2026-11-21] Country-aware first-level administrative regions for PUBLIC location display.
 * Used by tools/build_seo.mjs so a public page never shows more than "<region>" (or a country name) — never a raw
 * address, street, plot, landmark or coordinates.
 *
 * Supported (implemented AND tested) countries:
 *   TZ  Tanzania — 31 regions + common towns/districts (from shared/search-dictionary.js, the app's own list)
 *   KE  Kenya    — 47 counties (+ a few major towns mapped to their county)
 * Any other valid ISO-3166 alpha-2 country: only the COUNTRY name is shown (no region recognition yet).
 * Missing or unverifiable country: NOTHING is shown — no country is assumed (review 2026-11-21: Tanzania is no longer
 * the default; a listing must carry a verifiable `countryCode` / `country`). Adding a country = adding one entry to
 * COUNTRIES with its regions + tests. Not worldwide.
 *
 * Normalised fields are preferred over free text: `countryCode` / `country` (ISO2 or the country's name),
 * then `region` / `adminRegion` / `state` / `county`, then the free-text `location` (only to RECOGNISE a region). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./search-dictionary.js'));
  else root.SKHAdminRegions = factory(root.SKHSearchDictionary);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DICT) {
  'use strict';
  function fold(s) {
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return ' ' + s.replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  }
  var KE_COUNTIES = ['Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita-Taveta', 'Garissa', 'Wajir', 'Mandera', 'Marsabit',
    'Isiolo', 'Meru', 'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua', 'Nyeri', 'Kirinyaga', "Murang'a",
    'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans-Nzoia', 'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi', 'Baringo', 'Laikipia',
    'Nakuru', 'Narok', 'Kajiado', 'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya', 'Kisumu', 'Homa Bay',
    'Migori', 'Kisii', 'Nyamira', 'Nairobi'];
  var KE_TOWNS = { Nairobi: ['westlands', 'kibera', 'eastleigh', 'karen', 'kilimani', 'cbd nairobi'], 'Uasin Gishu': ['eldoret'], Nakuru: ['naivasha'],
    Kiambu: ['thika', 'ruiru', 'kikuyu'], Kilifi: ['malindi', 'watamu'], 'Trans-Nzoia': ['kitale'], Kajiado: ['kitengela', 'ngong'], Machakos: ['athi river', 'mlolongo'] };
  var COUNTRIES = {
    TZ: { name: 'Tanzania', regions: (DICT && Array.isArray(DICT.REGIONS) ? DICT.REGIONS : []).map(function (r) { return [r[0], r[1] || []]; }) },
    KE: { name: 'Kenya', regions: KE_COUNTIES.map(function (c) { return [c, [c].concat(KE_TOWNS[c] || [])]; }) }
  };
  // aliases sorted longest first so "dar es salaam" wins over "dar", "west pokot" over "pokot"
  Object.keys(COUNTRIES).forEach(function (cc) {
    var list = [];
    COUNTRIES[cc].regions.forEach(function (r) { [r[0]].concat(r[1]).forEach(function (a) { var f = fold(a); if (f.trim()) list.push({ a: f, name: r[0] }); }); });
    list.sort(function (x, y) { return y.a.length - x.a.length; });
    COUNTRIES[cc].aliases = list;
    COUNTRIES[cc].names = {}; COUNTRIES[cc].regions.forEach(function (r) { COUNTRIES[cc].names[fold(r[0])] = r[0]; });
  });
  var NAME_TO_CC = {}; Object.keys(COUNTRIES).forEach(function (cc) { NAME_TO_CC[fold(COUNTRIES[cc].name)] = cc; });
  var DISPLAY = null; try { DISPLAY = new Intl.DisplayNames(['sw', 'en'], { type: 'region' }); } catch (e) { DISPLAY = null; }

  /** ISO2 from a code or a known country name, else null. */
  function countryCode(v) {
    if (v == null) return null;
    var s = String(v).trim(); if (!s) return null;
    if (/^[A-Za-z]{2}$/.test(s)) {
      var cc = s.toUpperCase();
      if (COUNTRIES[cc]) return cc;
      try { if (DISPLAY && DISPLAY.of(cc) && DISPLAY.of(cc) !== cc) return cc; } catch (e) {}
      return null;
    }
    return NAME_TO_CC[fold(s)] || null;
  }
  function countryName(cc) { if (COUNTRIES[cc]) return COUNTRIES[cc].name; try { return DISPLAY ? DISPLAY.of(cc) : cc; } catch (e) { return cc; } }
  function recognise(cc, text) {
    var c = COUNTRIES[cc]; if (!c) return null;
    var t = fold(text);
    for (var i = 0; i < c.aliases.length; i++) if (t.indexOf(c.aliases[i].a) !== -1) return c.aliases[i].name;
    return null;
  }
  /** Public location of a listing: { country, region, label } or null (= show nothing). */
  function publicLocation(d) {
    d = d || {};
    var str = function (v) { return typeof v === 'string' ? v : ''; };
    var cc = countryCode(d.countryCode) || countryCode(d.country);
    if (!cc) return null;                                                   // missing or unverifiable country -> nothing (never assumed)
    var structured = [d.region, d.adminRegion, d.state, d.county].map(str).filter(Boolean);
    var region = null;
    if (COUNTRIES[cc]) {
      // normalised field that IS a region name of that country first, then recognise inside the texts
      structured.some(function (s) { var n = COUNTRIES[cc].names[fold(s)]; if (n) { region = n; return true; } return false; });
      if (!region) region = recognise(cc, structured.concat([str(d.location)]).join(' | '));
    }
    if (region) return { country: cc, region: region, label: cc === 'TZ' ? region : region + ', ' + countryName(cc) };
    return { country: cc, region: null, label: countryName(cc) };   // verified country, no region recognised: country name only, never the raw text
  }
  /** Region names of a supported country (for the listing forms), [] otherwise. */
  function regionsOf(cc) { cc = countryCode(cc); return cc && COUNTRIES[cc] ? COUNTRIES[cc].regions.map(function (r) { return r[0]; }) : []; }
  /** Does this region name belong to that country? (exact official name, case/accents ignored) */
  function isRegionOf(cc, name) { cc = countryCode(cc); return !!(cc && COUNTRIES[cc] && COUNTRIES[cc].names[fold(name)]); }
  /** What a listing form may save: { countryCode, region? } only when verified, else {} (never assumed). */
  function listingFields(cc, region) {
    var c = countryCode(cc); if (!c || !/^[A-Z]{2}$/.test(c)) return {};
    var out = { countryCode: c };
    if (region && COUNTRIES[c] && isRegionOf(c, region)) out.region = COUNTRIES[c].names[fold(region)];
    return out;
  }
  return { regionsOf: regionsOf, isRegionOf: isRegionOf, listingFields: listingFields, SUPPORTED: Object.keys(COUNTRIES), countryCode: countryCode, countryName: countryName, recognise: recognise, publicLocation: publicLocation };
});

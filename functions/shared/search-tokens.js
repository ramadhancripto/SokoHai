/* [SEARCH 2026-11-14] Catalogue search tokens — one pure module for the browser, Cloud Functions
 * (copied to functions/shared by build-shared.js) and tests.
 *
 * Why: the feed search filtered only the 20–100 newest listings that were already loaded, so an
 * older product could never be found by name. The server now stores `searchTokens` on every
 * product/service (written by Cloud Functions only — sellers cannot stuff keywords) and the
 * browser asks Firestore `array-contains-any` for the words the user typed.
 *
 *  - Words are lower-cased, accents removed, split on anything that is not a letter/number.
 *  - Each word of 2+ characters is stored, plus its prefixes from 3 characters ("sams" finds
 *    "samsung") — capped so a document never stores more than MAX_TOKENS entries.
 *  - A short Swahili <-> English synonym table: "simu" finds "phone", "friji" finds "fridge"...
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHSearchTokens = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_TOKENS = 200;      // per document
  var MAX_QUERY = 10;        // Firestore array-contains-any values per query
  var MIN_PREFIX = 3;
  var MAX_PREFIX = 12;

  // Kila kundi = maneno yenye maana moja. Neno lolote likiwa kwenye tangazo, maneno yote ya kundi yanahifadhiwa.
  var SYNONYMS = [
    ['simu', 'phone', 'smartphone', 'mobile'],
    ['tv', 'televisheni', 'television', 'runinga'],
    ['friji', 'fridge', 'jokofu', 'refrigerator'],
    ['kompyuta', 'computer', 'laptop', 'pc'],
    ['viatu', 'shoes', 'kiatu', 'shoe'],
    ['nguo', 'clothes', 'mavazi', 'clothing'],
    ['mchele', 'rice'],
    ['unga', 'flour'],
    ['sukari', 'sugar'],
    ['mafuta', 'oil'],
    ['mbolea', 'fertilizer', 'fertiliser'],
    ['mbegu', 'seeds', 'seed'],
    ['sofa', 'kochi', 'couch'],
    ['kitanda', 'bed'],
    ['meza', 'table'],
    ['kiti', 'chair', 'viti', 'chairs'],
    ['gari', 'car', 'magari', 'vehicle'],
    ['pikipiki', 'motorcycle', 'bodaboda', 'boda'],
    ['baiskeli', 'bicycle', 'bike'],
    ['saa', 'watch'],
    ['mkoba', 'bag', 'begi'],
    ['fundi', 'technician', 'repair', 'mafundi'],
    ['bomba', 'plumber', 'plumbing', 'mabomba'],
    ['umeme', 'electrician', 'electrical'],
    ['usafi', 'cleaning', 'cleaner'],
    ['spika', 'speaker', 'speakers'],
    ['dawa', 'medicine'],
    ['vipodozi', 'cosmetics', 'makeup'],
    ['nyama', 'meat'],
    ['samaki', 'fish'],
    ['matunda', 'fruits', 'fruit'],
    ['mboga', 'vegetables']
  ];
  // [SEARCH-INTEL 2026-11-21] the shared dictionary (shared/search-dictionary.js) is the source of truth;
  // the list above stays as the fallback when the dictionary is not loaded. Only single words are stored.
  var DICT = null;
  try { DICT = (typeof module === 'object' && module.exports) ? require('./search-dictionary.js') : (typeof globalThis !== 'undefined' ? globalThis.SKHSearchDictionary : null); } catch (e) { DICT = null; }
  if (DICT && Array.isArray(DICT.GROUPS)) {
    DICT.GROUPS.forEach(function (g) {
      var single = g.terms.map(function (t) { return String(t).toLowerCase().replace(/'/g, ''); }).filter(function (t) { return /^[a-z0-9]+$/.test(t); });
      if (single.length > 1) SYNONYMS.push(single);
    });
  }
  var SYN = {};
  SYNONYMS.forEach(function (g) { g.forEach(function (w) { SYN[w] = SYN[w] ? SYN[w].concat(g.filter(function (x) { return SYN[w].indexOf(x) === -1; })) : g.slice(); }); });

  function fold(s) {
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return s;
  }
  function words(s) {
    return fold(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 2 && w.length <= 40; });
  }
  var STOP = { na: 1, ya: 1, wa: 1, la: 1, za: 1, kwa: 1, the: 1, and: 1, of: 1, for: 1, in: 1, demo: 1 };

  /** Tokens to store on a listing. */
  function tokensFor(doc) {
    doc = doc || {};
    var parts = [doc.title, doc.name, doc.brand, doc.subCategory, doc.productTypeLabel, doc.categoryLabel,
      doc.serviceType, doc.specialization, doc.businessName, doc.storeName];
    if (Array.isArray(doc.tags)) parts = parts.concat(doc.tags);
    if (doc.filters && typeof doc.filters === 'object') {
      Object.keys(doc.filters).forEach(function (k) { var v = doc.filters[k]; if (typeof v === 'string') parts.push(v); });
    }
    var out = [], seen = {};
    function add(t) { if (!t || seen[t] || out.length >= MAX_TOKENS) return; seen[t] = 1; out.push(t); }
    // full words first (most important), then synonyms, then prefixes
    var ws = [];
    parts.forEach(function (p) { words(p).forEach(function (w) { if (!STOP[w]) ws.push(w); }); });
    ws.forEach(add);
    ws.forEach(function (w) { (SYN[w] || []).forEach(add); });
    ws.forEach(function (w) { for (var n = MIN_PREFIX; n < Math.min(w.length, MAX_PREFIX); n++) add(w.slice(0, n)); });
    return out;
  }

  /** The words of a user query (stop words and empty removed). */
  function queryWords(q) { return words(q).filter(function (w) { return !STOP[w]; }); }

  /** Values for one array-contains-any query: every query word + its synonyms, at most MAX_QUERY. */
  function queryTokens(q) {
    var out = [], seen = {};
    function add(t) { if (!seen[t] && out.length < MAX_QUERY) { seen[t] = 1; out.push(t); } }
    var ws = queryWords(q);
    ws.forEach(function (w) { add(w.length > MAX_PREFIX ? w.slice(0, MAX_PREFIX) : w); });
    ws.forEach(function (w) { (SYN[w] || []).forEach(add); });
    return out;
  }

  /** Does a listing satisfy EVERY query word (by stored token, synonym or plain text)? */
  function matches(doc, q, hay) {
    var ws = queryWords(q);
    if (!ws.length) return true;
    var toks = Array.isArray(doc && doc.searchTokens) ? doc.searchTokens : tokensFor(doc);
    var set = {}; toks.forEach(function (t) { set[t] = 1; });
    var text = fold(hay || '');
    return ws.every(function (w) {
      var key = w.length > MAX_PREFIX ? w.slice(0, MAX_PREFIX) : w;
      if (set[key] || text.indexOf(w) !== -1) return true;
      return (SYN[w] || []).some(function (s) { return set[s] || text.indexOf(s) !== -1; });
    });
  }

  function sameTokens(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  return { tokensFor: tokensFor, queryTokens: queryTokens, queryWords: queryWords, matches: matches,
           sameTokens: sameTokens, MAX_TOKENS: MAX_TOKENS, MAX_QUERY: MAX_QUERY };
});

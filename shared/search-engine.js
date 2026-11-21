/* [SEARCH-INTEL 2026-11-21] SokoHai search engine — ONE pure module (browser global SKHSearchEngine,
 * Node require, build tools, tests). It does not read Firestore and has no UI: callers pass listings in.
 *
 * Pipeline
 *   analyze(query)  -> normalised words, dictionary phrases, synonyms, singular/plural forms, intent
 *                      (price range, region, sort, condition, verified / in-stock), natural-language filler removed.
 *   matchDoc(doc,a) -> how well ONE listing matches: exact, prefix, singular/plural, synonym or typo
 *                      (Damerau-Levenshtein, 1 edit for 4-6 letters, 2 for 7+), per field (title > brand >
 *                      category/attributes > description). Every query word must be found (2/3 for long queries).
 *   rank(items,q,c) -> eligible -> matched -> de-duplicated -> filtered -> scored with the weighted factors
 *                      below -> sorted -> organic list + at most one clearly labelled sponsored slot per page.
 *
 * Ranking (WEIGHTS, configurable; each factor is 0..1, documented in factorsFor):
 *   relevance .44  intent .04  location .10  availability .10  completeness .07  sellerTrust .06
 *   reputation .05  transactions .04  freshness .06  engagement .04
 * Safeguards: payment never adds organic score (sponsored = separate, labelled, relevance-gated, capped);
 * reviews by the listing owner and repeat reviewers are ignored and shrunk to a prior; views/clicks are
 * log-scaled and capped; keyword stuffing is penalised; duplicates of the same seller collapse to one;
 * only server-owned verification fields (clients cannot write them — firestore.rules listingTrustKeys) count. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./search-dictionary.js'));
  else root.SKHSearchEngine = factory(root.SKHSearchDictionary);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DICT) {
  'use strict';
  DICT = DICT || { GROUPS: [], INTENTS: {}, FILLER: [], REGIONS: [], PLURALS: [] };

  var VERSION = 'search-intel-2026-11-21';
  var WEIGHTS = { relevance: 0.44, intent: 0.04, location: 0.10, availability: 0.10, completeness: 0.07, sellerTrust: 0.06,
    reputation: 0.05, transactions: 0.04, freshness: 0.06, engagement: 0.04 };
  var SPONSORED_EVERY = 10;          // at most one sponsored listing per 10 results
  var SPONSORED_MIN_RELEVANCE = 0.5; // and only when it really matches the query

  // ---------------------------------------------------------------- text helpers
  function fold(s) {
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return s.replace(/[’`]/g, "'");
  }
  function words(s) { return fold(s).replace(/'/g, '').split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 1 && w.length <= 40; }); }
  function phraseText(s) { return ' ' + words(s).join(' ') + ' '; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function ts(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v === 'object' && isFinite(v.seconds)) return v.seconds * 1000;
    var n = Date.parse(v); return isFinite(n) ? n : 0;
  }

  // ---------------------------------------------------------------- dictionary indexes
  var FILLER = {}; var FILLER_PHRASES = [];
  (DICT.FILLER || []).forEach(function (f) { f = words(f).join(' '); if (f.indexOf(' ') !== -1) FILLER_PHRASES.push(f); else FILLER[f] = 1; });
  FILLER_PHRASES.sort(function (a, b) { return b.length - a.length; });
  var GROUP_OF = {};                 // normalised term -> group index
  var PHRASES = [];                  // multi-word terms, longest first
  (DICT.GROUPS || []).forEach(function (g, i) {
    g.norm = g.terms.map(function (t) { return words(t).join(' '); });
    g.norm.forEach(function (t) { if (!(t in GROUP_OF)) GROUP_OF[t] = i; if (t.indexOf(' ') !== -1) PHRASES.push(t); });
  });
  PHRASES.sort(function (a, b) { return b.length - a.length; });
  // listings of a category also answer the group that names the whole category ("simu" finds an iPhone in CAT-12)
  var CAT_WORDS = {};
  (DICT.GROUPS || []).forEach(function (g) { if (g.catWide && g.cat) CAT_WORDS[g.cat] = (CAT_WORDS[g.cat] ? CAT_WORDS[g.cat] + ' ' : '') + g.norm.join(' '); });
  var INTENT_TERMS = [];
  Object.keys(DICT.INTENTS || {}).forEach(function (k) { DICT.INTENTS[k].terms.forEach(function (t) { INTENT_TERMS.push({ t: words(t).join(' '), k: k }); }); });
  INTENT_TERMS.sort(function (a, b) { return b.t.length - a.t.length; });
  var REGION_ALIASES = [];
  (DICT.REGIONS || []).forEach(function (r) { r[1].forEach(function (a) { REGION_ALIASES.push({ a: words(a).join(' '), name: r[0] }); }); });
  REGION_ALIASES.sort(function (a, b) { return b.a.length - a.a.length; });

  /** Singular/plural variants of a word (Kiswahili noun classes + English rules). */
  function variants(w) {
    var out = [w];
    function add(v) { if (v && v.length >= 3 && out.indexOf(v) === -1) out.push(v); }
    if (w.length >= 4) {
      var swahili = /[aeiou]$/.test(w);
      var startsPlural = (DICT.PLURALS || []).some(function (p) { return p[1] && w.indexOf(p[1]) === 0; });
      (DICT.PLURALS || []).forEach(function (p) {
        var sg = p[0], pl = p[1], rest;
        if (pl && w.indexOf(pl) === 0) {
          rest = w.slice(pl.length);
          if (sg === 'mw' && !/^[aeiou]/.test(rest)) return;     // wa-toto -> m-toto, not mw-toto
          if (sg === 'm' && /^[aeiou]/.test(rest)) return;       // wa-alimu -> mw-alimu, not m-alimu
          add(sg + rest);
        }
        if (!swahili || startsPlural) return;
        if (sg ? w.indexOf(sg) === 0 : /^[^aeiou]/.test(w)) {
          rest = w.slice(sg.length);
          if (pl === 'wa' && sg === 'm' && /^[aeiou]/.test(rest)) return;
          add(pl + rest);
        }
      });
      if (/ies$/.test(w)) add(w.slice(0, -3) + 'y');
      else if (/(s|x|z|ch|sh)es$/.test(w)) add(w.slice(0, -2));
      else if (/[^s]s$/.test(w)) add(w.slice(0, -1));
      else if (/^[a-z]+$/.test(w) && !/[aeiou]$/.test(w)) add(w + 's');
    }
    return out;
  }

  /** Damerau-Levenshtein distance with an early exit above `max`. */
  function editDistance(a, b, max) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  function typoBudget(w) { return w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0; }

  // ---------------------------------------------------------------- 1) query analysis
  function scalePrice(n, unit) {
    n = parseFloat(String(n).replace(/,/g, '')); if (!isFinite(n)) return null;
    if (/^(k|elfu)$/.test(unit || '')) n *= 1000;
    if (/^(m|mil|milioni|million)$/.test(unit || '')) n *= 1000000;
    return n;
  }
  function analyze(raw) {
    var q = fold(raw).replace(/\s+/g, ' ').trim();
    var a = { raw: String(raw == null ? '' : raw), text: q, terms: [], groups: [], intent: {}, region: null, regionAlias: null,
      minPrice: null, maxPrice: null, collection: null, category: null };
    if (!q) return a;
    var unit = '\\s*(k|elfu|m|mil|milioni|million)?\\b';
    var mMax = q.match(new RegExp('(?:chini ya|isiyozidi|hadi|mpaka|under|below|less than|max|<)\\s*(?:tsh|tzs|sh)?\\s*([\\d.,]+)' + unit));
    if (mMax) { a.maxPrice = scalePrice(mMax[1], mMax[2]); q = q.replace(mMax[0], ' '); }
    var mMin = q.match(new RegExp('(?:kuanzia|zaidi ya|juu ya|above|over|from|min|>)\\s*(?:tsh|tzs|sh)?\\s*([\\d.,]+)' + unit));
    if (mMin) { a.minPrice = scalePrice(mMin[1], mMin[2]); q = q.replace(mMin[0], ' '); }
    var mRange = q.match(new RegExp('([\\d.,]+)' + '\\s*(k|elfu|m)?\\s*(?:-|–|hadi|mpaka|to)\\s*([\\d.,]+)' + unit));
    if (mRange && a.minPrice == null && a.maxPrice == null) { a.minPrice = scalePrice(mRange[1], mRange[2]); a.maxPrice = scalePrice(mRange[3], mRange[4]); q = q.replace(mRange[0], ' '); }
    var s = ' ' + words(q).join(' ') + ' ';
    // route "dodoma kwenda tabora" (transport)
    var mRoute = s.match(/ ([a-z ]{3,30}?) (?:kwenda|hadi|mpaka|to) ([a-z ]{3,30}?) /);
    if (mRoute) {
      var from = regionIn(mRoute[1]), to = regionIn(mRoute[2]);
      if (from && to) { a.route = { from: from.name, to: to.name }; a.collection = 'drivers'; s = s.replace(' ' + from.a + ' ', ' ').replace(/ (kwenda|hadi|mpaka|to) /, ' ').replace(' ' + to.a + ' ', ' '); }
    }
    // intent words (cheap, near me, new/used, verified, in stock)
    INTENT_TERMS.forEach(function (it) {
      if (s.indexOf(' ' + it.t + ' ') !== -1) {
        var set = DICT.INTENTS[it.k].set; Object.keys(set).forEach(function (k) { if (!(k in a.intent)) a.intent[k] = set[k]; });
        s = s.split(' ' + it.t + ' ').join(' ');
      }
    });
    // region
    var reg = regionIn(s);
    if (reg && !a.route) { a.region = reg.name; a.regionAlias = reg.a; s = s.split(' ' + reg.a + ' ').join(' '); }
    // filler phrases (natural language)
    FILLER_PHRASES.forEach(function (f) { s = s.split(' ' + f + ' ').join(' '); });
    // dictionary phrases become one term ("nguo za watoto", "fundi umeme")
    PHRASES.forEach(function (p) {
      if (s.indexOf(' ' + p + ' ') !== -1) { a.terms.push(termFor(p, true)); s = s.split(' ' + p + ' ').join(' '); }
    });
    s.split(' ').forEach(function (w) { if (w && !FILLER[w] && !/^\d{1,2}$/.test(w)) a.terms.push(termFor(w, false)); });
    // group hints -> collection / category (only when unambiguous)
    var kinds = {}, cats = {};
    a.terms.forEach(function (t) { if (t.group != null) { var g = DICT.GROUPS[t.group]; a.groups.push(t.group); kinds[g.kind] = 1; if (g.cat) cats[g.cat] = 1; } });
    if (!a.collection && Object.keys(kinds).length === 1) a.collection = Object.keys(kinds)[0];
    if (Object.keys(cats).length === 1) a.category = Object.keys(cats)[0];
    return a;
  }
  function regionIn(s) {
    s = ' ' + words(s).join(' ') + ' ';
    for (var i = 0; i < REGION_ALIASES.length; i++) if (s.indexOf(' ' + REGION_ALIASES[i].a + ' ') !== -1) return REGION_ALIASES[i];
    return null;
  }
  function termFor(w, phrase) {
    var t = { w: w, phrase: !!phrase, forms: phrase ? [w] : variants(w), syn: [], group: null };
    var gi = GROUP_OF[w];
    if (gi == null && !phrase) t.forms.some(function (f) { if (GROUP_OF[f] != null) { gi = GROUP_OF[f]; return true; } return false; });
    if (gi != null) { t.group = gi; t.syn = DICT.GROUPS[gi].norm.filter(function (x) { return x !== w; }); }
    return t;
  }

  // ---------------------------------------------------------------- 2) document matching
  var FIELDS = [ // [weight, getter]
    ['title', 1.0, function (d) { return [d.title, d.name, d.productName, d.serviceTitle, d.serviceName, d.driverName, d.company, d.companyName]; }],
    ['brand', 0.9, function (d) { return [d.brand, d.model]; }],
    ['category', 0.75, function (d) { return [d.categoryLabel, d.category, d.subCategory, d.productTypeLabel, d.serviceType, d.specialization, d.vehicleType,
      Array.isArray(d.tags) ? d.tags.join(' ') : '', Array.isArray(d.supportedServices) ? d.supportedServices.join(' ') : '',
      d.filters && typeof d.filters === 'object' ? Object.keys(d.filters).map(function (k) { return k + ' ' + d.filters[k]; }).join(' ') : '',
      d.baseUnit, d.unit, d.condition]; }],
    ['categoryGroup', 0.55, function (d) { return [CAT_WORDS[d.category] || '']; }],
    ['location', 0.5, function (d) { return [d.location, d.region, d.pickupRegion, d.destinationRegion, d.storeName, d.businessName, d.sellerName]; }],
    ['description', 0.45, function (d) { return [d.description, d.searchMetadata && d.searchMetadata.text]; }]
  ];
  function docIndex(d) {
    if (d && d.__sxe && d.__sxe.v === VERSION) return d.__sxe;
    var idx = { v: VERSION, f: {}, vocab: {} };
    FIELDS.forEach(function (F) {
      var txt = F[2](d || {}).filter(Boolean).join(' ');
      var ws = words(txt);
      idx.f[F[0]] = { text: ' ' + ws.join(' ') + ' ', words: ws };
      ws.forEach(function (w) { if (w.length >= 3) idx.vocab[w] = 1; });
    });
    try { Object.defineProperty(d, '__sxe', { value: idx, enumerable: false, configurable: true, writable: true }); } catch (e) {}
    return idx;
  }
  /** Best match quality (0..1) of one term in one field. */
  function termInField(t, field) {
    var best = 0, how = '';
    function take(v, h) { if (v > best) { best = v; how = h; } }
    if (t.phrase) { if (field.text.indexOf(' ' + t.w + ' ') !== -1) take(1, 'exact'); }
    else {
      for (var i = 0; i < field.words.length; i++) {
        var fw = field.words[i];
        if (fw === t.w) { take(1, 'exact'); break; }
        if (t.forms.indexOf(fw) !== -1) take(0.92, 'plural');
        else if (t.w.length >= 3 && fw.indexOf(t.w) === 0) take(0.85, 'prefix');
        else if (t.w.length >= 4) {
          var budget = typoBudget(t.w);
          if (budget && editDistance(t.w, fw, budget) <= budget) take(budget === 1 || editDistance(t.w, fw, 1) <= 1 ? 0.62 : 0.5, 'typo');
          else if (budget && fw.length > t.w.length && editDistance(t.w, fw.slice(0, t.w.length), 1) <= 1) take(0.45, 'typo-prefix');
        }
      }
    }
    if (best < 0.8 && t.syn.length) {
      for (var k = 0; k < t.syn.length; k++) { if (field.text.indexOf(' ' + t.syn[k] + ' ') !== -1) { take(0.8, 'synonym'); break; } }
    }
    return { q: best, how: how };
  }
  function matchDoc(d, a) {
    if (!a.terms.length) return { relevance: 0.5, matched: 0, total: 0, all: true, hows: [] };
    var idx = docIndex(d), total = a.terms.length, matched = 0, sum = 0, hows = [];
    a.terms.forEach(function (t) {
      var best = 0, how = '';
      FIELDS.forEach(function (F) { var r = termInField(t, idx.f[F[0]]); var v = r.q * F[1]; if (v > best) { best = v; how = F[0] + ':' + r.how; } });
      if (best > 0) { matched++; sum += best; hows.push(how); }
    });
    var need = total >= 3 ? Math.ceil(total * 2 / 3) : total;
    if (matched < need) return { relevance: 0, matched: matched, total: total, all: false, hows: hows };
    var rel = sum / total;
    var title = idx.f.title.text, phrase = ' ' + a.terms.map(function (t) { return t.w; }).join(' ') + ' ';
    if (total > 1 && title.indexOf(phrase) !== -1) rel += 0.15;
    if (title.indexOf(phrase) === 0 || title.indexOf(' ' + a.terms[0].w + ' ') === 0) rel += 0.08;
    if (matched < total) rel *= 0.8;
    return { relevance: clamp01(rel), matched: matched, total: total, all: matched === total, hows: hows };
  }

  // ---------------------------------------------------------------- 3) quality factors (0..1 each)
  var TRUST_KEYS = ['verified', 'ownerVerified', 'sellerVerified', 'isVerified', 'providerVerified'];
  function kindOf(d) { return String(d.collectionName || d.collection || 'products').toLowerCase(); }
  function availability(d) {
    var st = String(d.availabilityStatus || d.availability || '').toLowerCase();
    if (st === 'out_of_stock' || st === 'sold_out' || d.available === false) return { v: 0, label: 'out_of_stock' };
    if (st === 'hidden') return { v: 0, label: 'hidden' };
    var stock = d.stock;
    if (kindOf(d) === 'products') {
      if (st === 'made_to_order') return { v: 0.65, label: 'made_to_order' };
      if (typeof stock === 'number' && stock > 0) return { v: stock <= 3 ? 0.85 : 1, label: stock <= 3 ? 'low_stock' : 'in_stock' };
      if (d.openingStockPending === true) return { v: 0.55, label: 'stock_unconfirmed' };
      if (typeof stock === 'number' && stock <= 0 && d.stock != null) return { v: 0.1, label: 'out_of_stock' };
    }
    return { v: 0.7, label: 'available' };
  }
  function completeness(d) {
    var imgs = (Array.isArray(d.images) ? d.images.length : 0) || (d.image || d.imageUrl ? 1 : 0);
    var checks = [imgs >= 1, imgs >= 2, String(d.description || '').trim().length >= 40, num(d.price) > 0,
      !!(d.category || d.serviceType || d.vehicleType), !!(d.location || d.region || d.pickupRegion), !!(d.brand || d.model || (d.filters && Object.keys(d.filters).length))];
    return checks.filter(Boolean).length / checks.length;
  }
  function sellerTrust(d) {
    if (TRUST_KEYS.some(function (k) { return d[k] === true; }) || String(d.verificationStatus || '').toLowerCase() === 'verified') return 1;
    return 0.3;
  }
  /** Reviews: only distinct reviewers who are not the listing owner; Bayesian shrink to 3.5 with weight 5. */
  function reputation(d) {
    var seen = {}, n = 0, sum = 0;
    (Array.isArray(d.comments) ? d.comments : []).forEach(function (c) {
      var r = num(c && c.rating), who = c && (c.userId || c.uid || c.authorId);
      if (!(r >= 1 && r <= 5) || !who || who === d.userId || seen[who]) return;
      seen[who] = 1; n++; sum += r;
    });
    var prior = 3.5, C = 5, avg = (prior * C + sum) / (C + n);
    return { v: clamp01((avg - 1) / 4), n: n, avg: n ? sum / n : null };
  }
  /** Completed transactions: only counters maintained by the server (orderCount / soldCount are not client-writable). */
  function transactions(d) { var n = num(d.completedOrders || d.orderCount || d.soldCount); return clamp01(Math.log1p(Math.max(0, n)) / Math.log1p(50)); }
  function freshness(d, now) { var t = ts(d.stockUpdatedAt || d.updatedAt || d.createdAt || d.timestamp); if (!t) return 0.3; return Math.exp(-Math.max(0, now - t) / 86400000 / 30); }
  /** Engagement: log-scaled and capped so bought clicks/views cannot dominate. */
  function engagement(d) { return clamp01(0.6 * Math.log1p(num(d.views)) / Math.log1p(2000) + 0.4 * Math.log1p(num(d.likeCount || d.likesCount) + num(d.saveCount)) / Math.log1p(200)); }
  function coordsOf(d) {
    var c = d.coords || d.coordinates || d.geo || {};
    var lat = num(c.lat != null ? c.lat : c.latitude), lon = num(c.lon != null ? c.lon : (c.lng != null ? c.lng : c.longitude));
    if (!lat || !lon || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null; return { lat: lat, lon: lon };
  }
  function distanceKm(aLat, aLon, bLat, bLon) {
    var p = Math.PI / 180, dLat = (bLat - aLat) * p, dLon = (bLon - aLon) * p;
    var q = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }
  function regionOfDoc(d) { var r = regionIn([d.location, d.region, d.pickupRegion].join(' ')); return r ? r.name : null; }
  function location(d, a, ctx) {
    var region = a.region || ctx.region || null, c = coordsOf(d), dist = null;
    if (c && num(ctx.userLat) && num(ctx.userLon)) dist = distanceKm(num(ctx.userLat), num(ctx.userLon), c.lat, c.lon);
    var rd = regionOfDoc(d);
    if (a.route) {
      var f = regionIn(d.pickupRegion || ''), t = regionIn(d.destinationRegion || '');
      return { v: (f && f.name === a.route.from ? 0.5 : 0) + (t && t.name === a.route.to ? 0.5 : 0), dist: dist, region: rd };
    }
    if (region) return { v: rd === region ? 1 : 0.1, dist: dist, region: rd };
    if (dist != null) return { v: Math.exp(-dist / 40), dist: dist, region: rd };
    return { v: 0.4, dist: null, region: rd };
  }
  /** Keyword stuffing: very long titles, or the same word repeated in the title. */
  function stuffingPenalty(d) {
    var ws = words(d.title || d.name || ''); if (!ws.length) return 1;
    var counts = {}, rep = 0; ws.forEach(function (w) { if (w.length > 2) { counts[w] = (counts[w] || 0) + 1; if (counts[w] > 1) rep++; } });
    var p = 1;
    if (ws.length > 18) p *= 0.8;
    if (rep >= 3 || rep / ws.length > 0.25) p *= 0.7;
    return p;
  }
  function isSponsored(d, now) {
    if (d.isBoosted !== true) return false;
    var end = ts(d.boostExpiresAt || d.boostedUntil || d.boostEndAt);
    if (!end || end <= now) return false;
    var target = num(d.boostTargetViews); if (target > 0 && num(d.boostedViewsCount) >= target) return false;
    return true;
  }
  function eligible(d) {
    if (!d || !(d.id || d.entityId)) return false;
    if (d.archivedAt || d.deletedAt || d.permanentlyDeleted === true || d.deleted === true || d.adminHidden === true || d.suspendedAt) return false;
    if (String(d.moderationStatus || '').toLowerCase() === 'removed') return false;
    var pub = String(d.publicationStatus || '').toLowerCase(); if (pub && pub !== 'published') return false;
    var st = String(d.status || d.listingStatus || '').toLowerCase();
    if (['deleted', 'archived', 'suspended', 'blocked', 'rejected', 'inactive', 'draft'].indexOf(st) !== -1) return false;
    if (d.isOnline === false || d.active === false || String(d.availabilityStatus || '').toLowerCase() === 'hidden') return false;
    return true;
  }
  /** Same seller + same normalised title + same price = one listing (the best one is kept). */
  function dedupeKey(d) { return [d.userId || d.sellerId || d.ownerId || '', words(d.title || d.name || '').join(' '), num(d.price)].join('|'); }

  function factorsFor(d, a, ctx, m) {
    var av = availability(d), rep = reputation(d), loc = location(d, a, ctx), now = ctx.now || Date.now();
    var intent = 0.5;
    if (a.collection) intent = kindOf(d) === a.collection ? 1 : 0.2;
    if (a.category && d.category) intent = (intent + (String(d.category) === a.category ? 1 : 0.3)) / 2;
    if (a.intent.condition && d.condition) intent = (intent + (words(d.condition).join(' ').indexOf(a.intent.condition) !== -1 || (a.intent.condition === 'used' && /mtumba|used|imetumika/.test(fold(d.condition))) ? 1 : 0.2)) / 2;
    return {
      relevance: m.relevance, intent: intent, location: loc.v, availability: av.v, completeness: completeness(d), sellerTrust: sellerTrust(d),
      reputation: rep.v, transactions: transactions(d), freshness: freshness(d, now), engagement: engagement(d),
      _availability: av.label, _reviews: rep.n, _distanceKm: loc.dist == null ? null : Math.round(loc.dist * 10) / 10, _region: loc.region,
      _stuffing: stuffingPenalty(d)
    };
  }
  function scoreOf(f, W) {
    var s = 0; Object.keys(W).forEach(function (k) { s += W[k] * (f[k] || 0); });
    s *= f._stuffing;
    if (f._availability === 'out_of_stock') s *= 0.5;
    return Math.round(s * 10000) / 10000;
  }

  // ---------------------------------------------------------------- 4) rank
  /** rank(items, query, ctx) -> { analysis, results:[{item,score,factors,sponsored}], total, duplicates, filtered, correction }
   *  ctx: { now, userLat, userLon, region, collection, minPrice, maxPrice, inStockOnly, verifiedOnly, sort, weights, limit, offset } */
  function rank(items, query, ctx) {
    ctx = ctx || {}; var now = ctx.now || Date.now();
    var a = typeof query === 'object' && query && query.terms ? query : analyze(query);
    var W = Object.assign({}, WEIGHTS, ctx.weights || {});
    var minP = ctx.minPrice != null ? ctx.minPrice : a.minPrice, maxP = ctx.maxPrice != null ? ctx.maxPrice : a.maxPrice;
    var inStockOnly = ctx.inStockOnly != null ? ctx.inStockOnly : !!a.intent.inStockOnly;
    var verifiedOnly = ctx.verifiedOnly != null ? ctx.verifiedOnly : !!a.intent.verifiedOnly;
    var collection = ctx.collection || null;
    var sort = ctx.sort || a.intent.sort || 'relevance';
    var scored = [], seen = {}, dup = 0, filtered = 0;
    (items || []).forEach(function (d) {
      if (!eligible(d)) return;
      if (collection && kindOf(d) !== collection) return;
      var m = matchDoc(d, a); if (a.terms.length && m.relevance <= 0) return;
      if (a.route) { var loc0 = location(d, a, ctx); if (kindOf(d) === 'drivers' && loc0.v === 0) return; }
      var price = num(d.price);
      if ((minP != null && !(price >= minP)) || (maxP != null && !(price > 0 && price <= maxP))) { filtered++; return; }
      var f = factorsFor(d, a, ctx, m);
      if (inStockOnly && (f._availability === 'out_of_stock' || f._availability === 'stock_unconfirmed')) { filtered++; return; }
      if (verifiedOnly && f.sellerTrust < 1) { filtered++; return; }
      if (a.region && !a.terms.length && f._region !== a.region) return;   // "Mwanza" alone = listings in Mwanza
      var row = { item: d, score: scoreOf(f, W), factors: f, sponsored: false, match: m };
      var key = dedupeKey(d);
      if (seen[key]) { dup++; if (row.score > seen[key].score) { var i = scored.indexOf(seen[key]); scored[i] = row; seen[key] = row; } return; }
      seen[key] = row; scored.push(row);
    });
    var cmp = {
      relevance: function (x, y) { return y.score - x.score; },
      price_asc: function (x, y) { return (num(x.item.price) || Infinity) - (num(y.item.price) || Infinity) || y.score - x.score; },
      price_desc: function (x, y) { return num(y.item.price) - num(x.item.price) || y.score - x.score; },
      newest: function (x, y) { return ts(y.item.createdAt || y.item.timestamp) - ts(x.item.createdAt || x.item.timestamp) || y.score - x.score; },
      nearest: function (x, y) { var dx = x.factors._distanceKm, dy = y.factors._distanceKm; return (dx == null ? 1e9 : dx) - (dy == null ? 1e9 : dy) || y.score - x.score; }
    }[sort] || function (x, y) { return y.score - x.score; };
    scored.sort(function (x, y) { return cmp(x, y) || String(x.item.id).localeCompare(String(y.item.id)); });
    // sponsored: relevance-gated, labelled, max one per SPONSORED_EVERY; never removes an organic result
    var organic = scored.slice(), out = [], spons = organic.filter(function (r) { return isSponsored(r.item, now) && (!a.terms.length || r.factors.relevance >= SPONSORED_MIN_RELEVANCE); });
    for (var i = 0, s = 0; i < organic.length; i++) {
      if (i % SPONSORED_EVERY === 0 && s < spons.length) {
        var sp = spons[s++]; out.push(Object.assign({}, sp, { sponsored: true, label: 'Imefadhiliwa' }));
      }
      out.push(organic[i]);
    }
    var offset = Math.max(0, ctx.offset || 0), limit = ctx.limit || out.length;
    return { analysis: a, sort: sort, total: scored.length, duplicates: dup, filtered: filtered,
      results: out.slice(offset, offset + limit), hasMore: offset + limit < out.length, weights: W, version: VERSION };
  }

  // ---------------------------------------------------------------- 5) suggestions
  /** "Did you mean": replaces each query word that has no exact hit in `vocab` by its closest vocabulary word. */
  function correct(query, items) {
    var a = analyze(query); if (!a.terms.length) return null;
    var vocab = {};
    (items || []).forEach(function (d) { if (eligible(d)) Object.keys(docIndex(d).vocab).forEach(function (w) { vocab[w] = (vocab[w] || 0) + 1; }); });
    (DICT.GROUPS || []).forEach(function (g) { g.norm.forEach(function (t) { if (t.indexOf(' ') === -1) vocab[t] = (vocab[t] || 0) + 1; }); });
    var changed = false;
    var out = a.terms.map(function (t) {
      if (t.phrase || vocab[t.w] || t.w.length < 4) return t.w;
      var best = null, bd = 9, bc = 0, budget = typoBudget(t.w);
      Object.keys(vocab).forEach(function (v) {
        if (Math.abs(v.length - t.w.length) > budget) return;
        var dd = editDistance(t.w, v, budget);
        if (dd <= budget && (dd < bd || (dd === bd && vocab[v] > bc))) { best = v; bd = dd; bc = vocab[v]; }
      });
      if (best) { changed = true; return best; }
      return t.w;
    });
    return changed ? out.join(' ') : null;
  }
  /** Related searches: other words of the same dictionary groups + categories of the best results. */
  function related(query, ranked, limit) {
    var a = typeof query === 'object' && query && query.terms ? query : analyze(query), out = [], seen = {};
    function add(t) { t = String(t || '').trim(); var k = fold(t); if (!t || seen[k] || k === a.text) return; seen[k] = 1; out.push(t); }
    a.terms.forEach(function (t) { if (t.group != null) DICT.GROUPS[t.group].terms.slice(0, 4).forEach(function (s) { if (fold(s) !== t.w) add(s); }); });
    (ranked || []).slice(0, 12).forEach(function (r) { var d = r.item || r; if (d.subCategory) add(d.subCategory); if (d.brand) add(d.brand + ' ' + (a.terms[0] ? a.terms[0].w : '')); });
    return out.slice(0, limit || 8);
  }
  /** Prefix autocomplete from real listings + dictionary (no Firestore query). */
  function autocomplete(prefix, items, limit) {
    var p = fold(prefix).trim(); if (p.length < 2) return [];
    var counts = {};
    (items || []).forEach(function (d) {
      if (!eligible(d)) return;
      var t = words(d.title || d.name || '').slice(0, 6).join(' ');
      if (t.indexOf(p) === 0 || t.indexOf(' ' + p) !== -1) counts[t] = (counts[t] || 0) + 2;
      (d.brand ? [fold(d.brand)] : []).forEach(function (b) { if (b.indexOf(p) === 0) counts[b] = (counts[b] || 0) + 1; });
    });
    (DICT.GROUPS || []).forEach(function (g) { g.norm.forEach(function (t) { if (t.indexOf(p) === 0) counts[t] = (counts[t] || 0) + 1; }); });
    return Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x] || x.length - y.length; }).slice(0, limit || 8);
  }
  /** Comparable listings of one product: same category/type, overlapping words, available; price stats when 3+. */
  function compare(product, items, limit) {
    var base = words(product.title || '').filter(function (w) { return w.length > 2; });
    var rows = (items || []).filter(function (d) {
      if (!eligible(d) || d.id === product.id || kindOf(d) !== kindOf(product)) return false;
      if (product.category && d.category && d.category !== product.category) return false;
      var dw = words(d.title || ''); var common = base.filter(function (w) { return dw.indexOf(w) !== -1; }).length;
      return common >= Math.min(2, base.length) && availability(d).v > 0.1;
    }).map(function (d) { return d; });
    var seen = {}; rows = rows.filter(function (d) { var k = dedupeKey(d); if (seen[k]) return false; seen[k] = 1; return true; });
    var prices = rows.map(function (d) { return num(d.price); }).filter(function (p) { return p > 0; }).sort(function (x, y) { return x - y; });
    var stats = prices.length >= 3 ? { count: prices.length, min: prices[0], max: prices[prices.length - 1], median: prices[Math.floor(prices.length / 2)] } : null;
    rows.sort(function (x, y) { return (num(x.price) || Infinity) - (num(y.price) || Infinity); });
    return { items: rows.slice(0, limit || 6), stats: stats };
  }

  return { VERSION: VERSION, WEIGHTS: WEIGHTS, SPONSORED_EVERY: SPONSORED_EVERY, fold: fold, words: words, variants: variants,
    editDistance: editDistance, analyze: analyze, matchDoc: matchDoc, rank: rank, correct: correct, related: related,
    autocomplete: autocomplete, compare: compare, eligible: eligible, dedupeKey: dedupeKey, availability: availability,
    reputation: reputation, regionIn: function (s) { var r = regionIn(s); return r ? r.name : null; }, distanceKm: distanceKm,
    _factorsFor: factorsFor };
});

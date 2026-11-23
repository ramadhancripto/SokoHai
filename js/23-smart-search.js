/* ============================================================================
   SOKOHAI — SMART SEARCH ENGINE
   ----------------------------------------------------------------------------
   Search si "input box" — ni Discovery Engine.

   HAIVUNJI kilichopo:
     - `window.handleSearch()` (14-map-onboarding.js) inabaki ikifanya kazi;
       tunaiita baada ya kuweka query, hivyo feed filtering ya zamani haijaguswa.
     - `js/20-search-chat.js` (search ya chat) inabaki; tunaiunganisha kama
       provider mmoja badala ya kuiondoa.
     - Hakuna Firestore index mpya: tunatumia `skh.cachedItems` iliyopo
       (data ile ile inayotumika kwenye feed) — hivyo hakuna query mpya
       wala gharama mpya.

   Muundo (§22):
       SearchBar -> SearchController -> SearchService -> Providers
                                                          |- Products
                                                          |- Services
                                                          |- Transport
                                                          |- People/Chat
   ============================================================================ */
(function () {
    'use strict';
    if (window.__skhSmartSearch) return;
    window.__skhSmartSearch = true;

    var LS_RECENT = 'skh_recent_searches';
    var MAX_RECENT = 8;

    function $(id) { return document.getElementById(id); }
    /* [R10] canonical ids (CAT-11) are shown and searched by their buyer label */
    function catLbl(c) {
        var skh = window.skh || {};
        try { return (c && typeof skh.categoryLabel === 'function' && skh.categoryLabel(c)) || c || ''; } catch (e) { return c || ''; }
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    /* [L10N 2026-11-23] strings built with numbers or prices go through the language system at render time */
    function T(k, fb) { try { return window.skhTF ? window.skhTF(k, fb) : fb; } catch (e) { return fb; } }
    function jsq(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 16) : ''; }
    function money(v) {
        var n = Number(v);
        if (!isFinite(n) || n <= 0) return 'Maelewano';
        return 'TSh ' + Math.round(n).toLocaleString('en-US');
    }

    /* ========================================================================
       1) INTENT PARSER (§3) — foundation ya kuaminika, si over-engineering
       ======================================================================== */
    var CAT_HINTS = {
        products:  ['simu','phone','iphone','samsung','laptop','tv','viatu','shoes','nguo','shati',
                    'suruali','bidhaa','chakula','godoro','friji','jokofu','saa','begi'],
        services:  ['fundi','huduma','service','design','ubunifu','usafishaji','cleaning','repair',
                    'matengenezo','ushauri','mafunzo','picha','photographer','mpishi','saluni'],
        drivers:   ['usafiri','usafirishaji','transport','delivery','mzigo','lori','pikipiki','bodaboda',
                    'gari','dereva','safari','kubeba','bajaji']
    };
    var REGIONS = ['dar es salaam','dar','dodoma','arusha','mwanza','mbeya','tanga','morogoro','tabora',
                   'kigoma','iringa','moshi','kilimanjaro','zanzibar','songea','singida','shinyanga',
                   'mtwara','lindi','musoma','bukoba','njombe','manyara','rukwa','katavi','geita','simiyu'];

    /** parseIntent("simu nzuri chini ya 500000") -> {text, collection, maxPrice, ...} */
    function parseIntent(raw) {
        var q = String(raw || '').toLowerCase().trim();
        var out = { text: q, clean: q, collection: null, maxPrice: null, minPrice: null,
                    from: null, to: null, location: null };
        if (!q) return out;

        // Bei: "chini ya 500000", "under 500k", "< 1m", "kuanzia 20000"
        var mMax = q.match(/(?:chini ya|isiyozidi|under|below|less than|<)\s*([\d.,]+)\s*(k|elfu|m|milioni|million)?/);
        if (mMax) out.maxPrice = scalePrice(mMax[1], mMax[2]);
        var mMin = q.match(/(?:kuanzia|zaidi ya|juu ya|above|over|from|>)\s*([\d.,]+)\s*(k|elfu|m|milioni|million)?/);
        if (mMin) out.minPrice = scalePrice(mMin[1], mMin[2]);

        // Njia: "Dodoma kwenda Tabora" / "Dodoma to Tabora" / "Dodoma - Tabora"
        var mRoute = q.match(/([a-z\u00c0-\u024f ]{3,25})\s+(?:kwenda|hadi|mpaka|to)\s+([a-z\u00c0-\u024f ]{3,25})/);
        if (mRoute) {
            // Chukua MKOA pekee kutoka kila upande (si sentensi nzima).
            // "usafiri wa mzigo Dodoma kwenda Tabora" -> from: dodoma, to: tabora
            var a = pickRegion(mRoute[1]), b2 = pickRegion(mRoute[2]);
            if (a || b2) { out.from = a; out.to = b2; out.collection = 'drivers'; }
        }

        // Eneo: mkoa wowote uliotajwa
        for (var i = 0; i < REGIONS.length; i++) {
            if (q.indexOf(REGIONS[i]) !== -1) { out.location = REGIONS[i]; break; }
        }

        // Aina (collection)
        if (!out.collection) {
            var best = null, bestHits = 0;
            Object.keys(CAT_HINTS).forEach(function (col) {
                var hits = 0;
                CAT_HINTS[col].forEach(function (w) { if (q.indexOf(w) !== -1) hits++; });
                if (hits > bestHits) { bestHits = hits; best = col; }
            });
            if (bestHits > 0) out.collection = best;
        }

        // Maneno ya kutafutia (bila vya bei/njia)
        out.clean = q.replace(/(?:chini ya|kuanzia|zaidi ya|under|below|above|over)\s*[\d.,]+\s*(k|elfu|m|milioni|million)?/g, '')
                     .replace(/\s+(kwenda|hadi|mpaka|to)\s+/g, ' ')
                     .replace(/\s{2,}/g, ' ').trim();
        return out;
    }
    function scalePrice(num, unit) {
        var n = parseFloat(String(num).replace(/,/g, ''));
        if (!isFinite(n)) return null;
        if (unit === 'k' || unit === 'elfu') n *= 1000;
        if (unit === 'm' || unit === 'milioni' || unit === 'million') n *= 1000000;
        return n;
    }
    /** pickRegion("usafiri wa mzigo dodoma") -> "dodoma" */
    function pickRegion(str) {
        str = String(str || '').toLowerCase();
        var best = null;
        for (var i = 0; i < REGIONS.length; i++) {
            if (str.indexOf(REGIONS[i]) !== -1) {
                if (!best || REGIONS[i].length > best.length) best = REGIONS[i];
            }
        }
        return best || str.trim().split(/\s+/).pop() || null;
    }

    function inRegions(s) {
        s = String(s || '').trim();
        for (var i = 0; i < REGIONS.length; i++) if (s.indexOf(REGIONS[i]) !== -1) return true;
        return false;
    }
    window.skhParseIntent = parseIntent;

    /* ========================================================================
       2) SEARCH SERVICE (§2, §22) — fields nyingi, si moja
       ======================================================================== */
    function searchableText(it) {
        if (it.__sx) return it.__sx;
        var parts = [it.title, it.name, it.productName, it.serviceTitle, it.description,
                     it.category, catLbl(it.category), it.subCategory, it.productTypeLabel, it.brand, it.model, it.condition,
                     it.location, it.region, it.ownerName, it.sellerName, it.storeName,
                     it.driverName, it.companyName, it.vehicleType,
                     it.pickupRegion, it.destinationRegion, it.baseUnit];
        if (Array.isArray(it.tags)) parts = parts.concat(it.tags);
        if (Array.isArray(it.keywords)) parts = parts.concat(it.keywords);
        if (Array.isArray(it.supportedServices)) parts = parts.concat(it.supportedServices);
        if (it.filters && typeof it.filters === 'object') {
            Object.keys(it.filters).forEach(function (k) { parts.push(k, it.filters[k]); });
        }
        it.__sx = parts.filter(Boolean).join(' ').toLowerCase();
        return it.__sx;
    }

    function scoreItem(it, intent) {
        var kind = it.collectionName || 'products';
        if (kind === 'products' && window.skh && typeof window.skh.productEligible === 'function' && !window.skh.productEligible(it)) return 0;
        // Product exact/name/brand/model/category/attribute weighting comes from
        // the shared Product Foundation; service/transport retain existing logic.
        var coreProductScore = kind === 'products' && window.skh && typeof window.skh.scoreProduct === 'function'
            ? window.skh.scoreProduct(it, intent.clean) : 0;
        var hay = searchableText(it);
        var words = intent.clean.split(/\s+/).filter(function (w) { return w.length > 1; });
        if (!words.length) return 0;

        var score = coreProductScore, matched = 0;
        var title = String(it.title || it.name || '').toLowerCase();
        words.forEach(function (w) {
            if (hay.indexOf(w) === -1) return;
            matched++;
            score += 10;
            if (title.indexOf(w) !== -1) score += 25;          // kichwa kina uzito zaidi
            if (title.indexOf(w) === 0) score += 15;           // kinaanza nacho
        });
        if (!matched) return 0;
        if (matched === words.length) score += 30;             // maneno yote

        // Vichujio vya intent
        var price = Number(it.price);
        if (intent.maxPrice && isFinite(price) && price > 0) {
            if (price > intent.maxPrice) return 0;
            score += 12;
        }
        if (intent.minPrice && isFinite(price) && price > 0) {
            if (price < intent.minPrice) return 0;
            score += 8;
        }
        if (intent.location) {
            var loc = String(it.location || it.region || it.pickupRegion || '').toLowerCase();
            if (loc.indexOf(intent.location) !== -1) score += 20;
        }
        if (intent.from && String(it.pickupRegion || '').toLowerCase().indexOf(intent.from) !== -1) score += 25;
        if (intent.to && String(it.destinationRegion || '').toLowerCase().indexOf(intent.to) !== -1) score += 25;
        if (intent.collection && (it.collectionName || 'products') === intent.collection) score += 18;

        // Ubora/umaarufu kama kivunja-sare
        score += Math.min(10, Number(it.views || 0) / 50);
        score += Math.min(8, Number(it.likeCount || 0));
        // Boost huongeza nafasi ndani ya matokeo yanayohusiana TU ikiwa bado hai.
        var boostOk = window.skh && typeof window.skh.boostEligibility === 'function'
            ? window.skh.boostEligibility(it).eligible : false;
        if (boostOk) score += 5;
        return score;
    }

    /* [SEARCH-INTEL 2026-11-21] Panel filters (sort, availability, verified sellers, price range). */
    var filters = { sort: '', inStockOnly: false, verifiedOnly: false, minPrice: null, maxPrice: null };
    window.skhSearchFilters = filters;
    function searchPool() {
        var skh = window.skh || {}, pool = Array.isArray(skh.cachedItems) ? skh.cachedItems.slice() : [];
        // the full source list (cachedItems may already be narrowed by the feed's own search filter)
        var src = Array.isArray(skh._feedSourceItems) ? skh._feedSourceItems : [];
        if (src.length) { var have = {}; pool.forEach(function (x) { have[(x.collectionName || '') + '/' + x.id] = 1; });
            src.forEach(function (x) { if (!have[(x.collectionName || '') + '/' + x.id]) pool.push(x); }); }
        return pool;
    }

    /** SearchService — hurudisha matokeo yaliyopangwa kwa makundi (§4) */
    window.skhSearchService = function (query, opts) {
        opts = opts || {};
        var intent = parseIntent(query);
        var skh = window.skh || {};
        var E = window.SKHSearchEngine;
        if (E) {
            // [SEARCH-INTEL 2026-11-21] shared engine: typo / plural / synonym / phrase understanding and the
            // documented weighted ranking (shared/search-engine.js). Products still pass the Product Foundation gate.
            var pool0 = searchPool().filter(function (it) {
                return (it.collectionName || 'products') !== 'products' || typeof skh.productEligible !== 'function' || skh.productEligible(it);
            });
            var f = opts.filters || filters;
            var r = E.rank(pool0, query, { userLat: skh.userLat, userLon: skh.userLon, region: skh.filterRegion || null,
                sort: f.sort || undefined, inStockOnly: f.inStockOnly || undefined, verifiedOnly: f.verifiedOnly || undefined,
                minPrice: f.minPrice, maxPrice: f.maxPrice });
            var groups0 = { products: [], services: [], drivers: [] }, all0 = [];
            r.results.forEach(function (x) {
                var it = x.sponsored ? Object.assign(Object.create(Object.getPrototypeOf(x.item)), x.item, { __sponsored: true }) : x.item;
                if (!x.sponsored) { var c = it.collectionName || 'products'; if (groups0[c]) groups0[c].push(it); }
                all0.push(it);
            });
            var an = r.analysis;
            if (an.region && !intent.location) intent.location = an.region;
            if (an.minPrice != null && intent.minPrice == null) intent.minPrice = an.minPrice;
            if (an.maxPrice != null && intent.maxPrice == null) intent.maxPrice = an.maxPrice;
            intent.sort = r.sort; intent.analysis = an;
            return { intent: intent, total: r.total, all: all0.slice(0, opts.limit || 40), groups: groups0, ranked: r.results,
                     duplicates: r.duplicates, filtered: r.filtered, engine: E.VERSION };
        }
        var pool = Array.isArray(skh.cachedItems) ? skh.cachedItems : [];

        var scored = [];
        for (var i = 0; i < pool.length; i++) {
            var s = scoreItem(pool[i], intent);
            if (s > 0) scored.push({ item: pool[i], score: s });
        }
        scored.sort(function (a, b) { return b.score - a.score; });

        var groups = { products: [], services: [], drivers: [] };
        scored.forEach(function (x) {
            var c = x.item.collectionName || 'products';
            if (groups[c]) groups[c].push(x.item);
        });
        return {
            intent: intent,
            total: scored.length,
            all: scored.slice(0, opts.limit || 40).map(function (x) { return x.item; }),
            groups: groups
        };
    };

    /* ========================================================================
       3) SUGGESTIONS (§5) — haraka, bila query mpya ya Firestore
       ======================================================================== */
    function suggestions(q) {
        q = String(q || '').toLowerCase().trim();
        if (q.length < 2) return [];
        if (window.SKHSearchEngine) return window.SKHSearchEngine.autocomplete(q, searchPool(), 6);   // [SEARCH-INTEL] real titles + dictionary
        var skh = window.skh || {};
        var pool = Array.isArray(skh.cachedItems) ? skh.cachedItems : [];
        var seen = {}, out = [];
        for (var i = 0; i < pool.length && out.length < 6; i++) {
            var t = String(pool[i].title || pool[i].name || '').trim();
            if (!t) continue;
            var low = t.toLowerCase();
            if (low.indexOf(q) === -1) continue;
            if (seen[low]) continue;
            seen[low] = 1; out.push(t);
        }
        // kategoria zinazofanana
        var cats = {};
        pool.forEach(function (p) { if (p.category) cats[catLbl(p.category)] = 1; });
        Object.keys(cats).forEach(function (c) {
            if (out.length >= 8) return;
            if (c.toLowerCase().indexOf(q) !== -1 && !seen[c.toLowerCase()]) out.push(c);
        });
        return out;
    }

    /* ========================================================================
       4) RECENT SEARCHES (§6)
       ======================================================================== */
    function getRecent() {
        try { return JSON.parse(localStorage.getItem(LS_RECENT) || '[]'); } catch (e) { return []; }
    }
    function addRecent(q) {
        q = String(q || '').trim(); if (q.length < 2) return;
        var list = getRecent().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
        list.unshift(q);
        try { localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, MAX_RECENT))); } catch (e) {}
    }
    window.skhSearchRemoveRecent = function (q, ev) {
        if (ev) ev.stopPropagation();
        var list = getRecent().filter(function (x) { return x !== q; });
        try { localStorage.setItem(LS_RECENT, JSON.stringify(list)); } catch (e) {}
        render(($('searchInput') || {}).value || '');
    };
    window.skhSearchClearRecent = function (ev) {
        if (ev) ev.stopPropagation();
        try { localStorage.removeItem(LS_RECENT); } catch (e) {}
        render(($('searchInput') || {}).value || '');
    };

    /* ========================================================================
       5) TRENDING (§7) — kutoka data halisi, si static
       ======================================================================== */
    /* [SEARCH-INTEL 2026-11-21] Popular searches = real search events of the last 14 days (skh._marketSearchTerms,
       loaded by skh.loadMarketSearchSignals). Nothing is invented: with no events this list is empty. */
    function popularSearches() {
        var terms = ((window.skh || {})._marketSearchTerms) || [], c = {};
        terms.forEach(function (e) { var q = String(e.query || '').trim().toLowerCase(); if (q.length >= 2 && !/\d{6,}/.test(q)) c[q] = (c[q] || 0) + 1; });
        return Object.keys(c).filter(function (q) { return c[q] >= 2; }).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 8);
    }
    function recentlyAdded(n) {
        function t(x) { var v = x.createdAt || x.timestamp; if (v && typeof v.toMillis === 'function') return v.toMillis(); if (v && v.seconds) return v.seconds * 1000; return Date.parse(v) || 0; }
        var E = window.SKHSearchEngine;
        return searchPool().filter(function (x) { return !E || E.eligible(x); }).sort(function (a, b) { return t(b) - t(a); }).slice(0, n || 4);
    }
    function trending() {
        var skh = window.skh || {};
        var pool = Array.isArray(skh.cachedItems) ? skh.cachedItems : [];
        var cats = {};
        pool.forEach(function (p) {
            if (!p.category) return;
            var cl = catLbl(p.category);
            cats[cl] = (cats[cl] || 0) + 1 + Number(p.views || 0) / 100;
        });
        return Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 6);
    }

    /* ========================================================================
       6) DROPDOWN UI
       ======================================================================== */
    var activeTab = 'all';
    var chatCache = { q: null, list: [] };

    function panel() {
        var el = $('skhSmartSearch');
        if (el) return el;
        var wrap = document.querySelector('.search-wrap');
        if (!wrap) return null;
        el = document.createElement('div');
        el.id = 'skhSmartSearch';
        el.className = 'skh-ss';
        el.addEventListener('click', function (e) { e.stopPropagation(); });
        wrap.appendChild(el);
        return el;
    }

    window.skhSearchClose = function () {
        var el = $('skhSmartSearch');
        if (el) el.classList.remove('open');
        document.body.classList.remove('skh-ss-open');
    };
    document.addEventListener('click', function (e) {
        var w = document.querySelector('.search-wrap');
        if (w && !w.contains(e.target)) window.skhSearchClose();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') window.skhSearchClose();
    });

    function rowItem(it) {
        var col = it.collectionName || 'products';
        var img = it.image || it.photo || (it.imagesArray && it.imagesArray[0]) || '';
        var sub = col === 'drivers'
            ? (esc(it.pickupRegion || '') + ' &rarr; ' + esc(it.destinationRegion || ''))
            : '<span' + (it.category ? ' data-tax-scope' : ' data-user-content') + '>' + esc(catLbl(it.category) || it.location || '') + '</span>';
        var price = (col === 'products') ? money(it.price)
                  : (Number(it.price) > 0 ? T('l10n_ss_from', 'Kuanzia') + ' ' + money(it.price) : T('l10n_ss_negotiable', 'Maelewano'));
        return '<button type="button" class="skh-ss-row' + (it.__sponsored ? ' is-sponsored' : '') + '" data-pos="' + (rowItem.pos = (rowItem.pos || 0) + 1) + '" onclick="window.skhSearchOpen(\'' +
               jsq(it.id) + '\',\'' + jsq(col) + '\',' + rowItem.pos + (it.__sponsored ? ',1' : '') + ')">' +
               (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">'
                    : '<span class="skh-ss-ph">' + ico('package', 16) + '</span>') +
               '<span class="skh-ss-tx"><b' + (it.title || it.name ? ' data-user-content' : '') + '>' + esc(it.title || it.name || T('l10n_ss_listing', 'Tangazo')) + '</b>' +
               '<small>' + (it.__sponsored ? '<em class="skh-ss-ad">' + T('l10n_ss_sponsored', 'Imefadhiliwa') + '</em> ' : '') + sub + '</small></span>' +
               '<span class="skh-ss-price">' + esc(price) + '</span></button>';
    }

    function groupBlock(title, items, iconName) {
        if (!items.length) return '';                    // §4: usionyeshe tupu
        return '<div class="skh-ss-grp"><div class="skh-ss-gh">' + ico(iconName, 13) + ' ' +
               esc(title) + ' <span>(' + items.length + ')</span></div>' +
               items.slice(0, 4).map(rowItem).join('') + '</div>';
    }

    function render(q) {
        var el = panel(); if (!el) return;
        q = String(q || '').trim();
        el.classList.add('open');
        document.body.classList.add('skh-ss-open');

        /* ---- Hali tupu: recent + trending (§6, §7) ---- */
        if (q.length < 2) {
            var rec = getRecent(), tr = trending();
            var h = '';
            if (rec.length) {
                h += '<div class="skh-ss-grp"><div class="skh-ss-gh">' + ico('clock', 13) +
                     ' Umetafuta hivi karibuni <button type="button" class="skh-ss-clear" ' +
                     'onclick="window.skhSearchClearRecent(event)">Futa zote</button></div>' +
                     rec.map(function (r) {
                        return '<div class="skh-ss-chip-row"><button type="button" class="skh-ss-rec" ' +
                               'onclick="window.skhSearchUse(\'' + jsq(r) + '\')">' + ico('search', 13) +
                               ' ' + esc(r) + '</button>' +
                               '<button type="button" class="skh-ss-x" aria-label="Ondoa" ' +
                               'onclick="window.skhSearchRemoveRecent(\'' + jsq(r) + '\', event)">' + ico('x', 12) + '</button></div>';
                     }).join('') + '</div>';
            }
            var pop = popularSearches();
            if (pop.length) {
                h += '<div class="skh-ss-grp"><div class="skh-ss-gh">' + ico('search', 13) + ' Watu wanatafuta</div>' +
                     '<div class="skh-ss-chips">' + pop.map(function (t) {
                        return '<button type="button" class="skh-ss-chip" onclick="window.skhSearchUse(\'' + jsq(t) + '\')">' + esc(t) + '</button>';
                     }).join('') + '</div></div>';
            }
            if (tr.length) {
                h += '<div class="skh-ss-grp"><div class="skh-ss-gh">' + ico('bolt', 13) + ' Kategoria zinazotazamwa</div>' +
                     '<div class="skh-ss-chips">' + tr.map(function (t) {
                        return '<button type="button" class="skh-ss-chip" onclick="window.skhSearchUse(\'' +
                               jsq(t) + '\')">' + esc(t) + '</button>';
                     }).join('') + '</div></div>';
            }
            h += '<div class="skh-ss-grp"><div class="skh-ss-gh">' + ico('camera', 13) + ' Njia nyingine</div>' +
                 '<div class="skh-ss-chips">' +
                 '<button type="button" class="skh-ss-chip" onclick="window.skhImageSearch()">' + ico('camera', 13) + ' Tafuta kwa picha</button>' +
                 '</div></div>';
            el.innerHTML = h || '<div class="skh-ss-empty">Andika unachotafuta…</div>';
            return;
        }

        /* ---- Matokeo ---- */
        rowItem.pos = 0;
        var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        var res = window.skhSearchService(q);
        var ms = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);
        var E = window.SKHSearchEngine;
        var fix = (E && res.total < 3) ? E.correct(q, searchPool()) : null;
        if (fix && fix === String(q).toLowerCase().trim()) fix = null;
        var rel = E ? E.related(res.intent.analysis || q, res.ranked || [], 6) : [];
        logSearch(q, res, ms, fix);
        var sug = suggestions(q);
        var g = res.groups;
        // Watu/chat hupakia kwa async — tunatumia cache ili render iwe haraka
        var chat = chatCache.q === q ? chatCache.list : [];
        if (chatCache.q !== q && typeof window.skhSearchChatPeople === 'function') {
            chatCache.q = q;
            window.skhSearchChatPeople(q).then(function (list) {
                chatCache.list = list || [];
                var cur = ($('searchInput') || {}).value || '';
                if (cur.trim() === q && chatCache.list.length) render(q);   // onyesha ikishafika
            });
        }

        var counts = { all: res.total + chat.length, products: g.products.length,
                       services: g.services.length, drivers: g.drivers.length, people: chat.length };

        var tabs = [['all','Zote'],['products','Bidhaa'],['services','Huduma'],
                    ['drivers','Usafiri'],['people','Watu']]
            .filter(function (t) { return t[0] === 'all' || counts[t[0]] > 0; });   // §4
        if (activeTab !== 'all' && !counts[activeTab]) activeTab = 'all';

        var head = tabs.length > 2
            ? '<div class="skh-ss-tabs">' + tabs.map(function (t) {
                return '<button type="button" class="skh-ss-tab' + (activeTab === t[0] ? ' active' : '') +
                       '" onclick="window.skhSearchTab(\'' + t[0] + '\')">' + esc(t[1]) +
                       '<i>' + counts[t[0]] + '</i></button>';
              }).join('') + '</div>' : '';

        var body = '';
        if (res.total === 0 && !chat.length) {
            /* §19 — empty state yenye msaada, si Firebase error.
               [SEARCH-INTEL 2026-11-21] + "Je, ulimaanisha…", related searches, filters reset and recently added listings. */
            var anyFilter = filters.sort || filters.inStockOnly || filters.verifiedOnly || filters.minPrice != null || filters.maxPrice != null;
            var fresh = recentlyAdded(4);
            body = '<div class="skh-ss-none" data-skh-noresult="1">' +
                   '<div class="skh-ss-none-ic">' + ico('search', 22) + '</div>' +
                   '<b>Hakuna matokeo ya "' + esc(q) + '"</b>' +
                   (fix ? '<p class="skh-ss-dym">Je, ulimaanisha <button type="button" data-skh-fix="1" onclick="window.skhSearchUse(\'' + jsq(fix) + '\')">' + esc(fix) + '</button>?</p>' : '') +
                   (anyFilter ? '<p><button type="button" class="skh-ss-chip" onclick="window.skhSearchResetFilters()">Ondoa vichujio</button></p>' : '') +
                   '<ul><li>Jaribu neno tofauti au fupi</li><li>Angalia tahajia</li>' +
                   '<li>Tumia neno la Kiswahili au Kiingereza (mf. simu / phone)</li></ul>' +
                   (rel.length ? '<div class="skh-ss-chips">' + rel.map(function (t) { return '<button type="button" class="skh-ss-chip" onclick="window.skhSearchUse(\'' + jsq(t) + '\')">' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
                   '<div class="skh-ss-chips">' +
                   '<button type="button" class="skh-ss-chip" onclick="window.skhImageSearch()">' + ico('camera', 13) + ' Tafuta kwa picha</button>' +
                   '</div></div>' +
                   (fresh.length ? '<div class="skh-ss-grp"><div class="skh-ss-gh">' + ico('clock', 13) + ' Zilizoongezwa karibuni</div>' + fresh.map(rowItem).join('') + '</div>' : '');
        } else if (activeTab === 'all') {
            var sp = (res.ranked || []).filter(function (x) { return x.sponsored; }).slice(0, 1).map(function (x) { return Object.assign({}, x.item, { __sponsored: true }); });
            body = (sp.length ? '<div class="skh-ss-grp skh-ss-grp--ad">' + sp.map(rowItem).join('') + '</div>' : '') +
                   groupBlock('Bidhaa', g.products, 'package') +
                   groupBlock('Huduma', g.services, 'wrench') +
                   groupBlock('Usafiri', g.drivers, 'truck');
            if (chat.length && typeof window.skhSearchChatHtml === 'function') body += window.skhSearchChatHtml(chat);
        } else if (activeTab === 'people') {
            body = (typeof window.skhSearchChatHtml === 'function') ? window.skhSearchChatHtml(chat) : '';
        } else {
            var lst = g[activeTab] || [];
            body = lst.slice(0, tabLimit).map(rowItem).join('') +
                   (lst.length > tabLimit ? '<button type="button" class="skh-ss-more" onclick="window.skhSearchMore()">Onyesha zaidi (' + (lst.length - tabLimit) + ')</button>' : '');
        }

        // Intent iliyoeleweka (uwazi kwa mtumiaji)
        var chips = [];
        if (res.intent.maxPrice) chips.push(T('l10n_ss_upto', 'Hadi') + ' ' + money(res.intent.maxPrice));
        if (res.intent.minPrice) chips.push(T('l10n_ss_from', 'Kuanzia') + ' ' + money(res.intent.minPrice));
        if (res.intent.location) chips.push(esc(res.intent.location));
        if (res.intent.sort && res.intent.sort !== 'relevance' && !filters.sort) chips.push({ price_asc: T('l10n_ss_sort_asc', 'Bei ya chini kwanza'), price_desc: T('l10n_ss_sort_desc', 'Bei ya juu kwanza'), newest: T('l10n_ss_sort_new', 'Mpya kwanza'), nearest: T('l10n_ss_sort_near', 'Karibu nawe kwanza') }[res.intent.sort] || '');
        if (res.intent.from && res.intent.to) chips.push(res.intent.from + ' &rarr; ' + res.intent.to);
        var intentBar = chips.length
            ? '<div class="skh-ss-intent">' + ico('filter', 12) + chips.map(function (c) {
                  return '<span>' + c + '</span>'; }).join('') + '</div>' : '';

        var sugBar = (sug.length && res.total > 0)
            ? '<div class="skh-ss-sug">' + sug.slice(0, 5).map(function (s) {
                  return '<button type="button" data-user-content onclick="window.skhSearchUse(\'' + jsq(s) + '\')">' +
                         ico('search', 11) + ' ' + esc(s) + '</button>'; }).join('') + '</div>' : '';

        var footer = res.total > 0
            ? '<button type="button" class="skh-ss-all" onclick="window.skhSearchAll()">' +
              T('l10n_ss_all', 'Ona matokeo yote') + ' (' + res.total + ')</button>' : '';

        var dym = (fix && res.total > 0) ? '<div class="skh-ss-dym">' + T('l10n_ss_dym', 'Je, ulimaanisha') + ' <button type="button" data-user-content data-skh-fix="1" onclick="window.skhSearchUse(\'' + jsq(fix) + '\')">' + esc(fix) + '</button>?</div>' : '';
        var relBar = (rel.length && res.total > 0) ? '<div class="skh-ss-rel"><span>Tafuta pia:</span>' + rel.slice(0, 5).map(function (t) {
                  return '<button type="button" data-user-content onclick="window.skhSearchUse(\'' + jsq(t) + '\')">' + esc(t) + '</button>'; }).join('') + '</div>' : '';
        el.innerHTML = sugBar + dym + filterBar() + intentBar + head + '<div class="skh-ss-body">' + body + '</div>' + relBar + footer;
    }

    /* [SEARCH-INTEL 2026-11-21] Filter / sort bar inside the panel. */
    var tabLimit = 12;
    function filterBar() {
        var sorts = [['', 'Inayohusika zaidi'], ['price_asc', 'Bei: chini → juu'], ['price_desc', 'Bei: juu → chini'], ['newest', 'Mpya kwanza'], ['nearest', 'Karibu nami']];
        return '<div class="skh-ss-filters" role="group" aria-label="Vichujio vya utafutaji">' +
            '<label class="skh-ss-sort"><span class="skh-vh">Panga</span><select id="skhSsSort" aria-label="Panga matokeo" onchange="window.skhSearchSetFilter(\'sort\', this.value)">' +
            sorts.map(function (o) { return '<option value="' + o[0] + '"' + (filters.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
            '<button type="button" class="skh-ss-tog' + (filters.inStockOnly ? ' on' : '') + '" aria-pressed="' + !!filters.inStockOnly + '" data-skh-filter="instock" onclick="window.skhSearchSetFilter(\'inStockOnly\', ' + !filters.inStockOnly + ')">Inapatikana</button>' +
            '<button type="button" class="skh-ss-tog' + (filters.verifiedOnly ? ' on' : '') + '" aria-pressed="' + !!filters.verifiedOnly + '" data-skh-filter="verified" onclick="window.skhSearchSetFilter(\'verifiedOnly\', ' + !filters.verifiedOnly + ')">Waliothibitishwa</button>' +
            '<span class="skh-ss-price-f"><input id="skhSsMin" inputmode="numeric" aria-label="' + T('l10n_ss_min_aria', 'Bei ya chini (TSh)') + '" placeholder="' + T('l10n_ss_min', 'Bei ya chini') + '" value="' + (filters.minPrice != null ? filters.minPrice : '') + '" onchange="window.skhSearchSetFilter(\'minPrice\', this.value)">' +
            '<input id="skhSsMax" inputmode="numeric" aria-label="' + T('l10n_ss_max_aria', 'Bei ya juu (TSh)') + '" placeholder="' + T('l10n_ss_max', 'Bei ya juu') + '" value="' + (filters.maxPrice != null ? filters.maxPrice : '') + '" onchange="window.skhSearchSetFilter(\'maxPrice\', this.value)"></span>' +
            '</div>';
    }
    window.skhSearchSetFilter = function (k, v) {
        if (k === 'minPrice' || k === 'maxPrice') { var n = parseFloat(String(v).replace(/[^\d.]/g, '')); v = isFinite(n) && n > 0 ? n : null; }
        if (k === 'inStockOnly' || k === 'verifiedOnly') v = v === true || v === 'true';
        filters[k] = v; tabLimit = 12;
        if (typeof window.skhSearchLog === 'function') window.skhSearchLog('filter', { q: (($('searchInput') || {}).value || '').trim(), filter: k, value: v == null ? '' : String(v) });
        render(($('searchInput') || {}).value || '');
    };
    window.skhSearchResetFilters = function () { filters.sort = ''; filters.inStockOnly = false; filters.verifiedOnly = false; filters.minPrice = null; filters.maxPrice = null; render(($('searchInput') || {}).value || ''); };
    window.skhSearchMore = function () { tabLimit += 12; render(($('searchInput') || {}).value || ''); };

    /* [SEARCH-INTEL 2026-11-21] Analytics: one event per settled query (not per keystroke). */
    var logTimer = null, lastLogged = '';
    function logSearch(q, res, ms, fix) {
        if (typeof window.skhSearchLog !== 'function') return;
        clearTimeout(logTimer);
        logTimer = setTimeout(function () {
            var cur = (($('searchInput') || {}).value || '').trim();
            var key = cur + '|' + JSON.stringify(filters);
            if (cur !== String(q).trim() || key === lastLogged) return;
            lastLogged = key;
            window.skhSearchLog('search', { q: cur, results: res.total, ms: ms, corrected: fix || '', sort: filters.sort || (res.intent && res.intent.sort) || '' });
        }, 1200);
    }

    window.skhSearchTab = function (t) { activeTab = t; render(($('searchInput') || {}).value || ''); };

    window.skhSearchUse = function (q) {
        var i = $('searchInput'); if (!i) return;
        i.value = q; addRecent(q);
        render(q);
        if (typeof window.handleSearch === 'function') window.handleSearch();  // feed ya zamani
    };

    window.skhSearchOpen = function (id, col, pos, sponsored) {
        try {
            var it = searchPool().filter(function (x) { return x.id === id; })[0] || {};
            if (typeof window.skhSearchLog === 'function') window.skhSearchLog('click', { q: (($('searchInput') || {}).value || '').trim(), itemId: id, col: col || 'products', pos: pos || 0, cat: it.category || '', sponsored: !!sponsored });
        } catch (eL) {}
        window.skhSearchClose();
        var i = $('searchInput'); if (i && i.value.trim()) addRecent(i.value.trim());
        if (typeof window.openProduct === 'function') window.openProduct(id, col);
    };

    window.skhSearchAll = function () {
        var i = $('searchInput'); if (i && i.value.trim()) addRecent(i.value.trim());
        window.skhSearchClose();
        if (typeof window.handleSearch === 'function') window.handleSearch();
        // Discover was intentionally removed. Keep the existing search surface
        // safe; full taxonomy/search replacement is deferred.
    };

    /* ========================================================================
       7) IMAGE SEARCH (§8-12) — kiunzi kinachotumia miundombinu iliyopo
       ======================================================================== */
    window.skhImageSearch = function () {
        var inp = $('imageSearchInput');
        if (!inp) {
            inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'imageSearchInput';
            inp.style.display = 'none';
            document.body.appendChild(inp);
        }
        inp.onchange = function (e) {
            var f = e.target.files && e.target.files[0];
            if (f) handleImage(f);
            e.target.value = '';
        };
        inp.click();
    };

    async function handleImage(file) {
        window.skhSearchClose();
        if (typeof skhBusy === 'function') skhBusy(true, 'Inasoma picha…');
        var url = null;
        try { url = URL.createObjectURL(file); } catch (e) {}
        try {
            var meta = await analyzeImage(file);
            if (typeof skhBusy === 'function') skhBusy(false);
            showImageResults(url, meta);
        } catch (err) {
            if (typeof skhBusy === 'function') skhBusy(false);
            console.warn('[image-search]', err);
            if (typeof skhToast === 'function') {
                skhToast('Imeshindikana kusoma picha kwa sasa. Jaribu tena.', 'error', 3000);
            }
        }
    }

    /**
     * analyzeImage — hurudisha metadata iliyopangwa:
     *   { objects, category, keywords, colors, style, brand }
     * Ikiwa huduma ya AI haipo, tunatumia rangi kuu ya picha (client-side)
     * kupata maneno ya msingi. HATUJIFANYI kuwa visual similarity ipo (§11).
     */
    async function analyzeImage(file) {
        if (typeof window.skhImageAnalyzer === 'function') {
            return await window.skhImageAnalyzer(file);       // hook ya baadaye
        }
        var colors = await dominantColors(file);
        return { objects: [], category: null, keywords: colors.names,
                 colors: colors.hex, style: null, brand: null, _local: true };
    }

    function dominantColors(file) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                try {
                    var c = document.createElement('canvas');
                    var n = 32; c.width = n; c.height = n;
                    var ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0, n, n);
                    var d = ctx.getImageData(0, 0, n, n).data;
                    var buckets = {};
                    for (var i = 0; i < d.length; i += 4) {
                        if (d[i + 3] < 128) continue;
                        var name = colorName(d[i], d[i + 1], d[i + 2]);
                        buckets[name] = (buckets[name] || 0) + 1;
                    }
                    var names = Object.keys(buckets).sort(function (a, b) { return buckets[b] - buckets[a]; }).slice(0, 2);
                    resolve({ names: names, hex: [] });
                } catch (e) { resolve({ names: [], hex: [] }); }
            };
            img.onerror = function () { resolve({ names: [], hex: [] }); };
            try { img.src = URL.createObjectURL(file); } catch (e) { resolve({ names: [], hex: [] }); }
        });
    }
    function colorName(r, g, b) {
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max - min < 30) return max > 200 ? 'nyeupe' : (max < 60 ? 'nyeusi' : 'kijivu');
        if (r === max) return (g > 120 && b < 100) ? 'njano' : 'nyekundu';
        if (g === max) return 'kijani';
        return 'bluu';
    }

    function showImageResults(previewUrl, meta) {
        var terms = (meta.keywords || []).concat(meta.objects || []).filter(Boolean);
        var q = terms.join(' ');
        var res = q ? window.skhSearchService(q) : { all: [], total: 0 };

        var host = document.createElement('div');
        host.className = 'skh-imgres';
        host.innerHTML =
            '<div class="skh-imgres-sheet">' +
              '<div class="skh-imgres-head">' +
                '<b>Ulichotafuta</b>' +
                '<button type="button" class="skh-imgres-x" aria-label="Funga">' + ico('x', 18) + '</button>' +
              '</div>' +
              (previewUrl ? '<img class="skh-imgres-prev" src="' + previewUrl + '" alt="">' : '') +
              (terms.length ? '<div class="skh-ss-chips">' + terms.map(function (t) {
                  return '<button type="button" class="skh-ss-chip" data-term="' + esc(t) + '">' + esc(t) + '</button>';
              }).join('') + '</div>' : '') +
              '<div class="skh-imgres-title">' +
                 (res.total ? 'Bidhaa zinazofanana (' + res.total + ')' : 'Hatujapata zinazofanana') +
              '</div>' +
              '<div class="skh-imgres-list">' +
                 (res.total ? res.all.slice(0, 12).map(rowItem).join('')
                            : '<div class="skh-ss-none"><b>Jaribu picha nyingine</b>' +
                              '<ul><li>Hakikisha bidhaa inaonekana wazi</li>' +
                              '<li>Epuka picha yenye giza</li>' +
                              '<li>Au tafuta kwa maneno</li></ul></div>') +
              '</div>' +
            '</div>';
        document.body.appendChild(host);

        function close() {
            try { if (previewUrl) URL.revokeObjectURL(previewUrl); } catch (e) {}   // §12 cleanup
            host.remove();
        }
        host.querySelector('.skh-imgres-x').addEventListener('click', close);
        host.addEventListener('click', function (e) { if (e.target === host) close(); });
        host.querySelectorAll('[data-term]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                close(); window.skhSearchUse(btn.getAttribute('data-term'));
            });
        });
    }


    /* ========================================================================
       8) UNGANISHA NA SEARCH BAR ILIYOPO
       ======================================================================== */
    var timer = null;
    function bind() {
        var input = $('searchInput');
        if (!input || input.__skhSS) return;
        input.__skhSS = true;

        input.addEventListener('focus', function () { render(input.value); });
        input.addEventListener('input', function () {
            clearTimeout(timer);
            var v = input.value;
            timer = setTimeout(function () { render(v); }, 180);       // §5 debounce
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var v = input.value.trim();
                if (v) { addRecent(v); window.skhSearchClose();
                         if (typeof window.handleSearch === 'function') window.handleSearch();
                         /* Discover removed intentionally; do not open a replacement. */ }
            }
        });

        // Vitufe vya picha/sauti ndani ya upau
        var wrap = document.querySelector('.search-wrap');
        if (wrap && !wrap.querySelector('.skh-ss-tools')) {
            var tools = document.createElement('div');
            tools.className = 'skh-ss-tools';
            tools.innerHTML =
                '<button type="button" class="skh-ss-tool" aria-label="Tafuta kwa picha" title="Tafuta kwa picha" onclick="window.skhImageSearch()">' + ico('camera', 17) + '</button>';
            wrap.appendChild(tools);
            var old = wrap.querySelector('.camera-icon');
            if (old) old.style.display = 'none';        // tusiwe na camera mbili
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
    // [L10N 2026-11-23] an open results panel is rebuilt in the new language (counts, prices and chips are render-time text)
    document.addEventListener('sokohai:languageChanged', function () {
        try { var el = $('skhSmartSearch'); if (el && el.classList.contains('open')) { render(($('searchInput') || {}).value || ''); if (window.SokoHaiLMS) window.SokoHaiLMS.apply(el); } } catch (e) {}
    });
    setTimeout(bind, 1200);
    setTimeout(bind, 3000);
})();

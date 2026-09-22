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
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
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
                     it.category, it.subCategory, it.brand, it.model, it.condition,
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
        var hay = searchableText(it);
        var words = intent.clean.split(/\s+/).filter(function (w) { return w.length > 1; });
        if (!words.length) return 0;

        var score = 0, matched = 0;
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

    /** SearchService — hurudisha matokeo yaliyopangwa kwa makundi (§4) */
    window.skhSearchService = function (query, opts) {
        opts = opts || {};
        var intent = parseIntent(query);
        var skh = window.skh || {};
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
        pool.forEach(function (p) { if (p.category) cats[p.category] = 1; });
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
    function trending() {
        var skh = window.skh || {};
        var pool = Array.isArray(skh.cachedItems) ? skh.cachedItems : [];
        var cats = {};
        pool.forEach(function (p) {
            if (!p.category) return;
            cats[p.category] = (cats[p.category] || 0) + 1 + Number(p.views || 0) / 100;
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
            : esc(it.category || it.location || '');
        var price = (col === 'products') ? money(it.price)
                  : (Number(it.price) > 0 ? 'Kuanzia ' + money(it.price) : 'Maelewano');
        return '<button type="button" class="skh-ss-row" onclick="window.skhSearchOpen(\'' +
               jsq(it.id) + '\',\'' + jsq(col) + '\')">' +
               (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">'
                    : '<span class="skh-ss-ph">' + ico('package', 16) + '</span>') +
               '<span class="skh-ss-tx"><b>' + esc(it.title || it.name || 'Tangazo') + '</b>' +
               '<small>' + sub + '</small></span>' +
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
            if (tr.length) {
                h += '<div class="skh-ss-grp"><div class="skh-ss-gh">' + ico('bolt', 13) + ' Vinavyotafutwa sana</div>' +
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
        var res = window.skhSearchService(q);
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
            /* §19 — empty state yenye msaada, si Firebase error */
            body = '<div class="skh-ss-none">' +
                   '<div class="skh-ss-none-ic">' + ico('search', 22) + '</div>' +
                   '<b>Hakuna matokeo ya "' + esc(q) + '"</b>' +
                   '<ul><li>Jaribu neno tofauti au fupi</li><li>Angalia tahajia</li>' +
                   '<li>Ondoa vichujio vya bei</li></ul>' +
                   '<div class="skh-ss-chips">' +
                   '<button type="button" class="skh-ss-chip" onclick="window.skhImageSearch()">' + ico('camera', 13) + ' Tafuta kwa picha</button>' +
                   '</div></div>';
        } else if (activeTab === 'all') {
            body = groupBlock('Bidhaa', g.products, 'package') +
                   groupBlock('Huduma', g.services, 'wrench') +
                   groupBlock('Usafiri', g.drivers, 'truck');
            if (chat.length && typeof window.skhSearchChatHtml === 'function') body += window.skhSearchChatHtml(chat);
        } else if (activeTab === 'people') {
            body = (typeof window.skhSearchChatHtml === 'function') ? window.skhSearchChatHtml(chat) : '';
        } else {
            body = (g[activeTab] || []).slice(0, 12).map(rowItem).join('');
        }

        // Intent iliyoeleweka (uwazi kwa mtumiaji)
        var chips = [];
        if (res.intent.maxPrice) chips.push('Hadi ' + money(res.intent.maxPrice));
        if (res.intent.minPrice) chips.push('Kuanzia ' + money(res.intent.minPrice));
        if (res.intent.location) chips.push(res.intent.location);
        if (res.intent.from && res.intent.to) chips.push(res.intent.from + ' &rarr; ' + res.intent.to);
        var intentBar = chips.length
            ? '<div class="skh-ss-intent">' + ico('filter', 12) + chips.map(function (c) {
                  return '<span>' + c + '</span>'; }).join('') + '</div>' : '';

        var sugBar = (sug.length && res.total > 0)
            ? '<div class="skh-ss-sug">' + sug.slice(0, 5).map(function (s) {
                  return '<button type="button" onclick="window.skhSearchUse(\'' + jsq(s) + '\')">' +
                         ico('search', 11) + ' ' + esc(s) + '</button>'; }).join('') + '</div>' : '';

        var footer = res.total > 0
            ? '<button type="button" class="skh-ss-all" onclick="window.skhSearchAll()">' +
              'Ona matokeo yote (' + res.total + ')</button>' : '';

        el.innerHTML = sugBar + intentBar + head + '<div class="skh-ss-body">' + body + '</div>' + footer;
    }

    window.skhSearchTab = function (t) { activeTab = t; render(($('searchInput') || {}).value || ''); };

    window.skhSearchUse = function (q) {
        var i = $('searchInput'); if (!i) return;
        i.value = q; addRecent(q);
        render(q);
        if (typeof window.handleSearch === 'function') window.handleSearch();  // feed ya zamani
    };

    window.skhSearchOpen = function (id, col) {
        window.skhSearchClose();
        var i = $('searchInput'); if (i && i.value.trim()) addRecent(i.value.trim());
        if (typeof window.openProduct === 'function') window.openProduct(id, col);
    };

    window.skhSearchAll = function () {
        var i = $('searchInput'); if (i && i.value.trim()) addRecent(i.value.trim());
        window.skhSearchClose();
        if (typeof window.handleSearch === 'function') window.handleSearch();
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
                         if (typeof window.handleSearch === 'function') window.handleSearch(); }
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
    setTimeout(bind, 1200);
    setTimeout(bind, 3000);
})();

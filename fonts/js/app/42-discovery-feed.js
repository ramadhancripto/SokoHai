/* ==== js/app/42-discovery-feed.js ====
// ============================================================
// CONTINUOUS DISCOVERY (2026-09) — tangazo lililofunguliwa
// halikwami kama "bidhaa moja": mtumiaji anatelezesha juu/chini
// (au vifungo/vishale/vibonye) kuhamia tangazo linalofuata/la
// nyuma LA AINA HIYO HIYO, ndani ya muktadha wa soko alilomo.
//
// Kanuni:
//  - HAIUNDI mfumo mpya wa bidhaa/duka: urambazaji unaita
//    openProduct() ILIYOPO (live listener, cart, chat, variants,
//    Maoni, related rails zote zinaendelea kufanya kazi).
//  - Foleni inajengwa kutoka skh.cachedItems (tayari imechujwa na
//    renderFeedUI) + vichujio VILE VILE vya soko (collection,
//    activeCategory, activeServiceSection, activeDeliverySection).
//  - Haichanganyi aina ovyo: ukifungua bidhaa, watembea bidhaa;
//    huduma -> huduma; usafiri -> usafiri.
//  - Nafasi ya kusogeza ya kila tangazo inakumbukwa; picha ya
//    tangalo linalofuata inapakiwa kabla (preload); karibu na
//    mwisho wa foleni, soko la msingi linaombwa vipya zaidi
//    (tena, loadMainFeed ILIYOPO).
// ============================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    var D = {
        col: null,        // collection ya foleni ya sasa
        ids: [],          // mfuatano wa IDs (same collection/context)
        index: -1,
        tops: {},         // id -> scrollTop iliyokumbukwa
        visited: {},
        lock: false,      // zuia mipito ya haraka wakati wa animation
        wheelLock: false,
        moreRequested: false,
        start: null
    };
    skh.discovery = D;

    function norm(s) { return String(s == null ? '' : s).toLowerCase(); }

    /* ------------------ jenga foleni kutoka vitu vya soko ------------------
     * Mantiki hii ni TAKATIFU (inayopimika) — inafuata vichujio vya
     * renderFeedUI (00-bootstrap) bila kuibadili.
     * --------------------------------------------------------------------- */
    function buildQueue(items, ctx) {
        ctx = ctx || {};
        var col = ctx.collection || 'products';
        var cat = ctx.category ? String(ctx.category) : '';
        var sub = ctx.subCategory ? String(ctx.subCategory) : '';
        var serviceSec = ctx.serviceSection ? String(ctx.serviceSection) : 'all';
        var deliverySec = ctx.deliverySection ? String(ctx.deliverySection) : 'all';
        var filters = ctx.filters || null;
        var query = ctx.searchQuery ? String(ctx.searchQuery).trim().toLowerCase() : '';
        var out = [];
        (items || []).forEach(function (it) {
            if (!it || !it.id) return;
            var ic = it.collectionName || col;
            if (ic !== col) return;
            // Sehemu (huduma: physical/online/food/rental)
            if (col === 'services' && serviceSec && serviceSec !== 'all') {
                var sec = norm(it.section || it.groupType);
                if (sec !== norm(serviceSec)) return;
            }
            // Sehemu ya usafiri (Passenger/Product/Cargo/Emergency)
            if (col === 'drivers' && deliverySec && deliverySec !== 'all') {
                var ss0 = it.supportedServices || [];
                if (!ss0.some(function (s) { return norm(s) === norm(deliverySec); })) return;
            }
            // Kategoria kuu (kwa usafiri nayo iko supportedServices)
            if (cat && cat !== 'Zote' && cat !== 'all') {
                if (col === 'drivers') {
                    var ss1 = it.supportedServices || [];
                    if (!ss1.some(function (s) { return norm(s) === norm(cat); })) return;
                } else if (norm(it.category) !== norm(cat)) return;
            }
            // Kategoria ndogo (usafiri: vehicleType)
            if (sub && sub !== 'Zote' && sub !== 'all') {
                if (col === 'drivers') {
                    if (norm(it.vehicleType) !== norm(sub)) return;
                } else if (norm(it.subCategory) !== norm(sub)) return;
            }
            // Vigezo maalum (data.filters ramani)
            if (filters && Object.keys(filters).length) {
                if (!it.filters) return;
                var okF = true;
                Object.keys(filters).forEach(function (fk) {
                    if (!it.filters[fk] || norm(it.filters[fk]) !== norm(filters[fk])) okF = false;
                });
                if (!okF) return;
            }
            // Utafutaji (jina/maelezo/kategoria + vya usafiri)
            if (query) {
                var title = norm(it.title || it.driverName || it.company || '');
                var desc = norm(it.description || '');
                var icat = norm(it.category || '');
                var extra = norm((it.vehicleType || '') + ' ' + (Array.isArray(it.supportedServices) ? it.supportedServices.join(' ') : ''));
                if (title.indexOf(query) === -1 && desc.indexOf(query) === -1
                    && icat.indexOf(query) === -1 && extra.indexOf(query) === -1) return;
            }
            out.push(it.id);
        });
        return out;
    }
    window.skhDiscoveryBuildQueue = buildQueue;

    function currentContext(col) {
        return {
            collection: col,
            category: skh.activeCategory || '',
            subCategory: skh.activeSubCategory || '',
            serviceSection: skh.activeServiceSection || 'all',
            deliverySection: skh.activeDeliverySection || 'all',
            filters: skh.activeFilterValues || null,
            searchQuery: skh.searchQuery || ''
        };
    }

    // Kamilisha foleni endapo ID haipo kwenye cache (deep link, utafutaji).
    async function ensureFetched(col, id) {
        try {
            var q;
            var base = skh.collection(skh.db, col);
            try {
                q = skh.query(base, skh.orderBy('createdAt', 'desc'), skh.limit(120));
            } catch (e) { q = skh.query(base, skh.limit(120)); }
            var snap = await skh.getDocs(q);
            var items = [];
            snap.forEach(function (d) { items.push(Object.assign({ id: d.id, collectionName: col }, d.data())); });
            // Unganisha na cache bila kurudia
            var known = {};
            (skh.cachedItems || []).forEach(function (x) { known[x.collectionName + '/' + x.id] = 1; });
            items.forEach(function (x) {
                var k = col + '/' + x.id;
                if (!known[k]) skh.cachedItems.push(x);
            });
        } catch (e) { /* endelea na cache/iliyo nayo */ }
    }

    function rebuild(col) {
        var ids = buildQueue(skh.cachedItems || [], currentContext(col));
        D.col = col;
        D.ids = ids;
        return ids;
    }

    // Panga foleni kwa tangazo lililofunguliwa.
    async function syncTo(id, col) {
        if (!id) return;
        col = col || (function () {
            var inCache = (skh.cachedItems || []).filter(function (x) { return x.id === id; })[0];
            return (inCache && inCache.collectionName) || skh.currentFeedCollection || 'products';
        })();
        if (col === 'all') col = 'products';

        if (D.col !== col) rebuild(col);
        var pos = D.ids.indexOf(id);
        if (pos === -1) {
            // Labida limejengwa upya (kichujio kipya) au halipo kwenye cache.
            rebuild(col);
            pos = D.ids.indexOf(id);
        }
        if (pos === -1) {
            await ensureFetched(col, id);
            rebuild(col);
            pos = D.ids.indexOf(id);
        }
        if (pos === -1) {
            // Bado halipo (mf. tangazo la related nje ya chujio): weka baada
            // ya nafasi ya sasa ili "nyuma" irudi salama.
            var at = D.index >= 0 ? D.index + 1 : D.ids.length;
            D.ids.splice(at, 0, id);
            pos = at;
        }
        D.index = pos;
        updateNavUi();
        maybeLoadMore();
        preloadNeighbors();
    }

    /* ------------------ UI ------------------ */
    function sheet() { return document.querySelector('#productModal > .pm-sheet'); }
    function scrollEl() { return document.querySelector('#productModal .pm-scroll'); }

    function updateNavUi() {
        var count = document.getElementById('dfCount');
        var prev = document.getElementById('dfPrevBtn');
        var next = document.getElementById('dfNextBtn');
        if (count) count.textContent = D.ids.length ? (D.index + 1) + '/' + D.ids.length : '•';
        if (prev) prev.disabled = D.index <= 0;
        if (next) next.disabled = D.ids.length === 0 || D.index >= D.ids.length - 1;
    }

    function rememberScroll() {
        if (D.index < 0) return;
        var cur = D.ids[D.index];
        var sc = scrollEl();
        if (cur && sc) D.tops[cur] = sc.scrollTop;
    }

    function restoreScroll(id) {
        var sc = scrollEl();
        if (!sc) return;
        var top = D.tops[id] || 0;
        setTimeout(function () { try { sc.scrollTop = top; } catch (e) {} }, 70);
        setTimeout(function () { try { sc.scrollTop = D.tops[id] != null ? D.tops[id] : top; } catch (e) {} }, 220);
    }

    function animate(dir) {
        var sh = sheet();
        if (!sh) return;
        var cls = dir > 0 ? 'df-go-next' : 'df-go-prev';
        sh.classList.remove('df-go-next', 'df-go-prev');
        // reflow ili uhuishaji uruke tena
        void sh.offsetWidth;
        sh.classList.add(cls);
        setTimeout(function () { sh.classList.remove(cls); }, 320);
    }

    function preloadNeighbors() {
        var ids = D.ids;
        [-1, 1, 2].forEach(function (off) {
            var nid = ids[D.index + off];
            if (!nid) return;
            var item = (skh.cachedItems || []).filter(function (x) { return x.id === nid && x.collectionName === D.col; })[0];
            var url = item && (item.image || item.photo || (item.imagesArray && item.imagesArray[0]) || (item.images && item.images[0]));
            if (url && !/ui-avatars\.com/.test(String(url))) {
                try { var im = new Image(); im.src = url; } catch (e) {}
            }
        });
    }

    function maybeLoadMore() {
        if (D.moreRequested) return;
        if (D.ids.length - D.index <= 4) {
            D.moreRequested = true;
            try {
                skh.currentLimit = (skh.currentLimit || 100) + 30;
                // [§1-§5 R8 FILTERS] Discovery TRAIL IMESAKAA kutoku feed-card:
                // Ikiwa user nunaonekana kwa kuponjwa ya Home (all), loadMainFeed
                // BILA kukarabati would bed ya picha (mfadhiri omega kupotea feed).
                const curCol = skh.currentFeedCollection || 'all';
                if (D.col === curCol) skh.loadMainFeed(D.col);
            } catch (e) {}
            // Jengishe upya foleni baada ya muda wa kupakua.
            setTimeout(function () {
                var keepId = D.ids[D.index];
                var ids = buildQueue(skh.cachedItems || [], currentContext(D.col));
                if (ids.length > D.ids.length) { D.ids = ids; D.index = Math.max(0, ids.indexOf(keepId)); updateNavUi(); }
                D.moreRequested = false;
            }, 1600);
        }
    }

    window.skhDiscoveryMove = function (dir) {
        if (D.lock) return;
        var maoni = document.getElementById('maoniLayer');
        if (maoni && maoni.classList.contains('is-open')) return; // sharti Maoni yafungwe kwanza
        var modal = document.getElementById('productModal');
        if (!modal || modal.style.display === 'none') return;
        var target = D.ids[D.index + dir];
        if (!target) return;
        D.lock = true;
        // Kumbuka nafasi ya sasa; wrapper wa openProduct hufanya uhuishaji,
        // syncTo, urejeshaji wa scroll na preload.
        rememberScroll();
        try {
            Promise.resolve(window.openProduct(target, D.col)).catch(function () {});
        } catch (e) {}
        setTimeout(function () { D.lock = false; }, 320);
    };

    /* ------------------ ishara za kugusa/panya/kiibodi ------------------ */
    function gestures() {
        var hero = document.querySelector('#productModal .pm-hero');
        if (!hero || hero._dfReady) return;
        hero._dfReady = true;

        hero.addEventListener('touchstart', function (e) {
            var t = e.touches[0];
            D.start = { x: t.clientX, y: t.clientY, t: Date.now() };
        }, { passive: true });

        hero.addEventListener('touchend', function (e) {
            if (!D.start) return;
            var t = e.changedTouches[0];
            var dx = t.clientX - D.start.x;
            var dy = t.clientY - D.start.y;
            D.start = null;
            // Mlalo ni wa carousel ya picha; wima ni wa discovery.
            if (Math.abs(dy) < 52) return;
            if (Math.abs(dy) <= Math.abs(dx) * 1.1) return;
            // Usipitie vitufe/ikoni.
            if (e.target && e.target.closest && e.target.closest('button,a,input,.pm-image-slider')) return;
            window.skhDiscoveryMove(dy < 0 ? 1 : -1);
        }, { passive: true });

        // Wheel juu ya HERO (bado haina scroll yake) -> discovery moja kwa moja.
        hero.addEventListener('wheel', function (e) {
            if (Math.abs(e.deltaY) < 24) return;
            if (D.wheelLock) { e.preventDefault(); return; }
            if (!D.ids[D.index + (e.deltaY > 0 ? 1 : -1)]) return;
            D.wheelLock = true;
            window.skhDiscoveryMove(e.deltaY > 0 ? 1 : -1);
            setTimeout(function () { D.wheelLock = false; }, 700);
        }, { passive: false });

        // Wheel ndani ya MWILI: endelea na scroll ya kawaida, lakini ukishika
        // ukingo wa juu/chini, ruka tangazo linalofuata/la nyuma.
        var sc = scrollEl();
        if (sc && !sc._dfWheelReady) {
            sc._dfWheelReady = true;
            sc.addEventListener('wheel', function (e) {
                if (Math.abs(e.deltaY) < 20) return;
                if (D.wheelLock) { return; }
                var goingDown = e.deltaY > 0;
                var atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 8;
                var atTop = sc.scrollTop <= 4;
                if ((goingDown && atBottom) || (!goingDown && atTop)) {
                    var nid = D.ids[D.index + (goingDown ? 1 : -1)];
                    if (!nid) return;
                    e.preventDefault();
                    D.wheelLock = true;
                    window.skhDiscoveryMove(goingDown ? 1 : -1);
                    setTimeout(function () { D.wheelLock = false; }, 700);
                }
            }, { passive: false });
        }
    }

    document.addEventListener('keydown', function (e) {
        var modal = document.getElementById('productModal');
        if (!modal || modal.style.display === 'none') return;
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        var maoni = document.getElementById('maoniLayer');
        if (maoni && maoni.classList.contains('is-open')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); window.skhDiscoveryMove(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); window.skhDiscoveryMove(-1); }
    });

    /* ------------------ kaza openProduct ILIYOPO (wrapper) ------------------ */
    var baseOpen = null;
    function installWrapper() {
        if (baseOpen || typeof window.openProduct !== 'function') return;
        baseOpen = window.openProduct;
        window.openProduct = async function (id, col) {
            var before = D.ids[D.index];
            var beforeIdx = D.index;
            if (before && before !== id) {
                rememberScroll(); D.visited[before] = true;
                // Safisha rasilimali za video za tangazo linaloachwa.
                try {
                    var oldVids = document.querySelectorAll('#pmImgWrapper video');
                    Array.prototype.forEach.call(oldVids, function (v) {
                        try { v.pause(); v.removeAttribute('autoplay'); } catch (e) {}
                    });
                } catch (e) {}
                // Kama Maoni yalikuwa wazi, yafunge kwa tangazo jipya.
                var ml = document.getElementById('maoniLayer');
                if (ml && !ml.hidden && typeof window.skhCloseMaoni === 'function') window.skhCloseMaoni();
            }
            var r = await baseOpen.apply(this, arguments);
            var usedCol = col;
            if (!usedCol) {
                var inCache = (skh.cachedItems || []).filter(function (x) { return x.id === id; })[0];
                usedCol = (inCache && inCache.collectionName) || skh.currentFeedCollection || 'products';
            }
            if (usedCol === 'all') usedCol = 'products';
            await syncTo(id, usedCol);
            // Mwelekeo wa uhuishaji ukilinganisha na nafasi mpya.
            if (before && before !== id) {
                animate(beforeIdx >= 0 && D.index > beforeIdx ? 1 : -1);
            }
            // Rejesha scroll iliyokumbukwa; tangazo jipya laanza juu.
            if (D.visited[id]) restoreScroll(id);
            else { var sc = scrollEl(); if (sc) sc.scrollTop = 0; }
            gestures();
            return r;
        };
    }
    // openProduct ya 07-product.js huwa imeshawekwa wakati moduli hii inapakia
    // (mpangilio wa script), lakini tumia njia mbili za usalama.
    installWrapper();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installWrapper);
    else setTimeout(installWrapper, 0);
})();

/* ==== js/21-home-filters.js ==== */
// ============================================================
// SOKOHAI HOME FILTER BAR (2026-09)
// Sheria: HOME (ALL) inaonyesha VYOTE vilivyounganishwa —
// bidhaa + huduma + usafiri. Vitufe ndio vinachuja:
//   Vyote      -> kila kitu (hakuna kichujio)
//   Bidhaa     -> products pekee
//   Huduma     -> services pekee
//   Usafiri    -> drivers pekee
// Kuchuja hufanyika kwenye data iliyopo (papo hapo, bila kupakua
// upya) ili isiharibu mtiririko wa feed ya Home.
// ============================================================
(function () { 'use strict';
    if (window.__skhHomeFilters) return;
    window.__skhHomeFilters = true;

    var FILTERS = [
        ['all', 'Vyote', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
        ['products', 'Bidhaa', 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'],
        ['services', 'Huduma', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
        ['drivers', 'Usafiri', 'M1 3h15v13H1zM16 8h4l3 3v5h-7z']
    ];

    var css = [ '#skhHomeFilterBar{display:none;gap:8px;padding:10px 14px;background:#fff;border-bottom:1px solid #e8eef5;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}', '#skhHomeFilterBar::-webkit-scrollbar{display:none}', '#skhHomeFilterBar.show{display:flex}', '.skh-hf{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:99px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;transition:.16s;box-shadow:0 1px 3px rgba(15,23,42,.05)}', '.skh-hf svg{width:15px;height:15px;flex-shrink:0}', '.skh-hf:hover{border-color:#c7d7e8;background:#fff}', '.skh-hf.active{background:#1268A8;border-color:#1268A8;color:#fff;box-shadow:0 5px 14px rgba(18,104,168,.3)}', '.skh-hf .skh-hf-n{background:rgba(15,23,42,.08);border-radius:99px;padding:1px 7px;font-size:12.5px;font-weight:900}', '.skh-hf.active .skh-hf-n{background:rgba(255,255,255,.22)}'
    ].join('\n');
    var st = document.createElement('style'); st.textContent = css;
    (document.head || document.documentElement).appendChild(st);

    window.skhHomeFilter = 'all';

    function counts() {
        var skh = window.skh || {};
        var arr = Array.isArray(skh.cachedItems) ? skh.cachedItems : [];
        // [FIX 6 · 2026-09-14] Funguo za vitufe ni products/services/transport,
        // wakati data hutumia 'drivers'. Tafsiri ili hesabu zionekane.
        var c = { all: arr.length, products: 0, services: 0, transport: 0 };
        arr.forEach(function (it) {
            var k = it.collectionName || 'products';
            if (k === 'drivers') k = 'transport';
            if (c[k] !== undefined) c[k]++;
        });
        return c;
    }

    function bar() {
        var el = document.getElementById('skhHomeFilterBar');
        if (el) return el;
        var anchor = document.getElementById('topFilterToggles')
            || document.getElementById('locationFilterBar');
        if (!anchor || !anchor.parentNode) return null;
        el = document.createElement('div');
        el.id = 'skhHomeFilterBar';
        anchor.parentNode.insertBefore(el, anchor);
        return el;
    }

    window.skhRenderHomeFilters = function () {
        var el = bar();
        if (!el) return;
        var skh = window.skh || {};
        var homeTab = document.getElementById('navTabHome');
        var tabActive = !!(homeTab && homeTab.classList.contains('active'));
        var onHome = (tabActive || skh.currentFeedCollection === 'all') && (skh.currentMode !== 'seller');
        el.classList.toggle('show', !!onHome);
        if (!onHome) return;
        var c = counts();
        el.innerHTML = FILTERS.map(function (f) {
            var n = c[f[0]] || 0;
            return '<button type="button" class="skh-hf' + (window.skhHomeFilter === f[0] ? ' active' : '') + '"'
                + ' onclick="window.skhSetHomeFilter(\'' + f[0] + '\')">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + f[2] + '"/></svg>'
                + f[1] + (n ? '<span class="skh-hf-n">' + n + '</span>' : '')
                + '</button>';
        }).join('');
    };

    window.skhSetHomeFilter = function (key) {
        window.skhHomeFilter = key || 'all';
        window.skhRenderHomeFilters();
        var skh = window.skh;
        var grid = document.getElementById('mainFeed');
        if (!skh || !grid || typeof skh.renderFeedUI !== 'function') return;
        skh.renderFeedUI(skh.cachedItems || [], grid);
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    };

    // ---- Unganisha na renderFeedUI: chuja Home kwa kitufe kilichochaguliwa ----
    var hooked = false, tries = 0;
    var iv = setInterval(function () {
        tries++;
        var skh = window.skh;
        if (!hooked && skh && typeof skh.renderFeedUI === 'function') {
            hooked = true;
            var orig = skh.renderFeedUI;
            // [FIX 6 · 2026-09-14] Ramani: kitufe -> collection halisi ya Firestore.
            // 'transport' ni jina la kitufe; kwenye data ni 'drivers'.
            var COL = { products: 'products', services: 'services', transport: 'drivers' };
            skh.renderFeedUI = function (dataArray, feedGrid) {
                var data = dataArray || [];
                var key = window.skhHomeFilter;

                // [FIX 6 · 2026-09-14] renderFeedUI HUANDIKA UPYA skh.cachedItems
                // kwa data iliyochujwa (00-bootstrap.js:2340). Bila kuihifadhi,
                // kila mbofyo wa kitufe ungepunguza cache hadi tupu — ndiyo
                // maana chujio la pili lilirudisha "hakuna matokeo".
                var fullCache = Array.isArray(skh.cachedItems) ? skh.cachedItems.slice() : [];
                // Chanzo cha ukweli: cache KAMILI, si data iliyopitishwa.
                var source = (fullCache.length >= data.length) ? fullCache : data;

                if (skh.currentFeedCollection === 'all' && key && key !== 'all') {
                    var want = COL[key] || key;
                    data = source.filter(function (it) {
                        return (it.collectionName || 'products') === want;
                    });
                }

                var r;
                try {
                    r = orig.call(this, data, feedGrid);
                } finally {
                    // Rudisha cache kamili ili vitufe vingine vibaki na data.
                    if (fullCache.length) skh.cachedItems = fullCache;
                    try { window.skhRenderHomeFilters(); } catch (e) {}
                }
                return r;
            };
        }
        // Kila unapobadilisha tab, rudi kwenye "Vyote"
        if (!window.__skhUpdateAppHomeHook && typeof window.updateApp === 'function') {
            window.__skhUpdateAppHomeHook = true;
            var oldUp = window.updateApp;
            window.updateApp = function (mode, el) {
                window.skhHomeFilter = 'all';
                var r = oldUp.apply(this, arguments);
                setTimeout(function () { try { window.skhRenderHomeFilters(); } catch (e) {} }, 60);
                return r;
            };
        }
        if (tries > 60) clearInterval(iv);
    }, 250);

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () { try { window.skhRenderHomeFilters(); } catch (e) {} }, 800);
    });
})();

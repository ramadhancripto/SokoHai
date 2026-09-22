/* ==== js/01-lib-loader.js ====
 * [PERF 2026-09] Maktaba za nje NZITO (Leaflet ~150KB, Chart.js ~200KB)
 * hazipakwi tena kwenye upakiaji wa mwanzo (zilikuwa render-blocking <head>).
 * Zinaingizwa kwa uvivu PALE TU zinapohitajika (ramani au grafu za
 * dashibodi) -> ukurasa wa nyumbani/chat/fungua haraka kwa milliseconds.
 *
 * Matumizi:
 *   window.skhWithLeaflet(function (L) { L.map('x') ... });
 *   window.skhLoadChart().then(function () { new Chart(...) });
 */
(function () { 'use strict';
    var LEAFLET_JS = 'vendor/leaflet/leaflet.js';
    var LEAFLET_CSS = 'vendor/leaflet/leaflet.css';
    var CHART_JS = 'vendor/chart.umd.min.js';

    function loadCss(href) {
        return new Promise(function (resolve, reject) {
            var found = document.querySelector('link[href="' + href + '"]');
            if (found) { if (found.dataset.loaded) return resolve(); found.addEventListener('load', function () { resolve(); }); found.addEventListener('error', reject); return resolve(); }
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            l.onload = function () { resolve(); };
            l.onerror = reject;
            document.head.appendChild(l);
        });
    }

    function loadScript(src) {
        if (window._skhLibPromise && window._skhLibPromise[src]) return window._skhLibPromise[src];
        var p = new Promise(function (resolve, reject) {
            var existing = document.querySelector('script[src="' + src + '"]');
            if (existing) {
                if (window.Chart || window.L) return resolve();
                existing.addEventListener('load', function () { resolve(); });
                existing.addEventListener('error', reject);
                return;
            }
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Imeshindwa kupakua ' + src)); };
            document.head.appendChild(s);
        });
        window._skhLibPromise = window._skhLibPromise || {};
        window._skhLibPromise[src] = p;
        return p;
    }

    var leafletPromise = null;
    window.skhLoadLeaflet = function () {
        if (typeof window.L !== 'undefined' && window.L && window.L.map) return Promise.resolve(window.L);
        if (!leafletPromise) {
            leafletPromise = loadCss(LEAFLET_CSS).catch(function () {})
                .then(function () { return loadScript(LEAFLET_JS); })
                .then(function () {
                    // Ficha default-attribute ya Leaflet isiharibu mpangilio.
                    try { if (window.L && window.L.Icon && window.L.Icon.Default) window.L.Icon.Default.imagePath = 'vendor/leaflet/images/'; } catch (e) {}
                    return window.L;
                });
        }
        return leafletPromise;
    };

    // Callback-style ndio rahisi kwa tovuti zisizo async.
    window.skhWithLeaflet = function (cb, fallback) {
        return window.skhLoadLeaflet().then(function (L) {
            if (typeof cb === 'function') return cb(L);
        }).catch(function (e) {
            console.warn('[lib] leaflet load failed', e && e.message);
            if (typeof fallback === 'function') fallback(e);
        });
    };

    window.skhLoadChart = function () {
        if (typeof window.Chart !== 'undefined') return Promise.resolve(window.Chart);
        return loadScript(CHART_JS).then(function () { return window.Chart; });
    };
    window.skhChartReady = window.skhLoadChart;
})();

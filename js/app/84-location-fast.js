/* ==== js/app/84-location-fast.js ==== */
/* ============================================================
   SOKOHAI — ENEO LA MTUMIAJI, HARAKA NA JINA LINAONEKANA VIZURI
   (Job 13 / R6 — 2026-11-05)

   Tatizo la awali: upau ulikaa "Inatafuta eneo…" muda wote —
   - GPS ilianza baada ya 1.5s,
   - getCurrentPosition ilikuwa na timeout ya 12s,
   - hakuna deadline ya mwisho, hivyo ukiwa hujaruhusu GPS au
     geolocation haipo, maandishi yale yale yalibaki milele.

   Sasa:
   1) Jina lililohifadhiwa linaonekana MARA MOJA (hakuna kusubiri GPS).
   2) GPS inaanza mara moja, timeout 5s; geocoding 4s.
   3) DEADLINE ya 6s: hali ya mwisho inawekwa kila mara
      ("Tanzania Nzima", mkoa uliochaguliwa, au jina lililohifadhiwa).
   4) Ikifaulu: jina linaonyeshwa kwa mpangilio mzuri
      "Kinondoni, Dar es Salaam" (eneo + mji).
   5) Kuchagua mkoa kwenye dropdown kunabadilisha jina papo hapo.
   ============================================================ */
(function () {
    'use strict';

    var TTL = 24 * 60 * 60 * 1000;   // jina/eneo linathibitishwa mara moja kwa siku
    var GEO_MS = 5000;               // GPS timeout
    var GEOCODE_MS = 4000;           // reverse-geocode timeout
    var HARD_MS = 6000;              // deadline: hakuna "Inatafuta eneo…" ya milele

    var settled = true;
    var deadline = null;

    function statusEl() { return document.getElementById('userLocationStatus'); }

    function paint(txt, loading) {
        var el = statusEl();
        if (!el) return;
        el.textContent = txt;
        el.setAttribute('title', txt);                 // jina kamili linapatikana kwa hover
        el.classList.toggle('skh-loc-loading', !!loading);
    }

    function readSaved() {
        try {
            var d = JSON.parse(localStorage.getItem('skh_last_loc') || 'null');
            if (d && typeof d.lat === 'number' && typeof d.lon === 'number') return d;
        } catch (e) {}
        return null;
    }

    function writeSaved(lat, lon, name, source) {
        try {
            localStorage.setItem('skh_last_loc', JSON.stringify({
                lat: lat, lon: lon, name: name || '', ts: Date.now(), source: source || 'gps'
            }));
        } catch (e) {}
    }

    function pretty(name) {
        if (!name) return '';
        var s = String(name)
            .replace(/^\s*Eneo:\s*/i, '')
            .replace(/\s*\(imehifadhiwa\)\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (s.length > 40) s = s.slice(0, 38).replace(/[,\s·-]+$/, '') + '…';
        return s;
    }

    function regionLabel() {
        var sel = document.getElementById('regionFilterSelect');
        var v = sel ? sel.value : '';
        if (!v) return 'Tanzania Nzima';
        if (v === 'nearme') return 'Karibu Nawe (GPS)';
        return v;
    }

    function settle(txt) {
        settled = true;
        if (deadline) { clearTimeout(deadline); deadline = null; }
        paint(txt || regionLabel(), false);
    }

    function refreshFeedIfNeeded() {
        try {
            if (window.skh && window.skh.filterNearMe && typeof window.skh.loadMainFeed === 'function') {
                window.skh.loadMainFeed(window.skh.currentFeedCollection);
            }
        } catch (e) {}
    }

    function reverseGeocode(lat, lon, cb) {
        var called = false;
        function done(name) { if (called) return; called = true; cb(name || ''); }
        try {
            var ctrl = new AbortController();
            var to = setTimeout(function () { try { ctrl.abort(); } catch (e) {} done(''); }, GEOCODE_MS);
            fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&addressdetails=1',
                { signal: ctrl.signal })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    clearTimeout(to);
                    var a = (d && d.address) || {};
                    var hood = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.village || a.hamlet || '';
                    var city = a.city || a.town || a.municipality || a.state || a.region || '';
                    var name = [hood, city].filter(Boolean).join(', ');
                    done(name);
                })
                .catch(function () { clearTimeout(to); done(''); });
        } catch (e) { done(''); }
    }

    function run(force) {
        var el = statusEl();
        if (!el) return;

        var saved = readSaved();

        /* 1) jina lililohifadhiwa linaonekana mara moja (bila kusubiri GPS) */
        if (!force && saved && saved.name && (Date.now() - saved.ts) < TTL) {
            try {
                window.skh.userLat = saved.lat;
                window.skh.userLon = saved.lon;
                window.skh.userRegionName = saved.name;
            } catch (e) {}
            settled = true;
            paint(pretty(saved.name), false);
            return;
        }

        /* 2) hali ya kupata — kisha GPS mara moja */
        settled = false;
        paint('Inatafuta eneo lako…', true);

        if (deadline) clearTimeout(deadline);
        deadline = setTimeout(function () {
            if (settled) return;
            var s2 = readSaved();
            settle((s2 && s2.name) ? pretty(s2.name) : regionLabel());
        }, HARD_MS);

        if (!navigator.geolocation) {
            settle((saved && saved.name) ? pretty(saved.name) : regionLabel());
            return;
        }

        navigator.geolocation.getCurrentPosition(function (pos) {
            var lat = pos.coords.latitude;
            var lon = pos.coords.longitude;
            try { window.skh.userLat = lat; window.skh.userLon = lon; } catch (e) {}

            paint('Inapata jina la eneo…', true);

            reverseGeocode(lat, lon, function (name) {
                if (!name) name = (saved && saved.name) || regionLabel();
                try { if (name) window.skh.userRegionName = name; } catch (e) {}
                writeSaved(lat, lon, name, 'gps');
                settle(pretty(name));
                refreshFeedIfNeeded();
            });
        }, function () {
            /* imekataliwa / haipo / muda umeisha — hali tulivu, si "finding you" */
            var s = readSaved();
            settle((s && s.name) ? pretty(s.name) : regionLabel());
        }, { enableHighAccuracy: false, timeout: GEO_MS, maximumAge: TTL });
    }

    /* badilisha kitendakazi cha mfumo kwa toleo la haraka */
    window.requestUserLocation = function (force) { run(!!force); };

    function boot() {
        var el = statusEl();
        if (!el) return;

        /* i18n ilikuwa inarudisha "Inatafuta eneo..." kila lugha inapowekwa —
           maandishi ya eneo sasa yanasimamiwa na moduli hii pekee. */
        try { el.removeAttribute('data-i18n'); } catch (e) {}

        /* onyesha jina/hali mara moja kabla GPS haijaanza */
        var saved = readSaved();
        paint(saved && saved.name ? pretty(saved.name) : regionLabel(), false);

        /* GPS ianze papo hapo (si baada ya 1.5s) */
        setTimeout(function () { run(false); }, 120);

        /* kubadilisha mkoa → jina linaonyeshwa papo hapo */
        var sel = document.getElementById('regionFilterSelect');
        if (sel && !sel.__skhLocWatch) {
            sel.__skhLocWatch = true;
            sel.addEventListener('change', function () {
                settled = true;
                if (deadline) { clearTimeout(deadline); deadline = null; }
                paint(regionLabel(), false);
            });
        }

        /* kugusa jina = jaribu tena (force) */
        if (!el.__skhLocTap) {
            el.__skhLocTap = true;
            el.addEventListener('click', function () { run(true); });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

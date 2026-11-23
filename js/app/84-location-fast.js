/* ==== js/app/84-location-fast.js ==== */
/* ============================================================
   SOKOHAI — ENEO LA MTUMIAJI                       [LOCATION 2026-11-21]
   Moduli PEKEE inayosimamia eneo la mtumiaji (upau wa juu, skh.userLat/userLon,
   skh.locationState). Sheria ziko kwenye shared/location-core.js.

   Hali nne, zinaonyeshwa kwa ukweli:
     gps          — GPS ya kifaa, mpya (≤ dak 10) na sahihi (≤ km 2)   -> "Kinondoni, Dar es Salaam"
     approximate  — GPS isiyo sahihi au ya zamani (≤ saa 24)           -> "… (takriban)" / "… (la mwisho)"
     manual       — mkoa aliouchagua mtumiaji                           -> "Arusha"
     unavailable  — hakuna ruhusa / GPS / data halali                  -> "Chagua eneo"

   Kilichorekebishwa (chanzo cha eneo lisilo sahihi):
     - kivinjari kiliruhusiwa kurudisha GPS ya hadi saa 24 kama "sasa" (maximumAge 24h) -> sasa dak 5;
     - jina likishindwa kupatikana, jina la eneo LA ZAMANI liliunganishwa na kuratibu MPYA -> sasa hakuna jina;
     - GPS ya nyuma ilifuta mkoa aliouchagua mtumiaji -> sasa chaguo la mtumiaji linaheshimiwa;
     - eneo la zamani lilionyeshwa kama la sasa bila alama -> sasa "(la mwisho)" / "(takriban)".
   ============================================================ */
import '../../shared/location-core.js';

(function () {
    'use strict';
    var L = globalThis.SKHLocationCore;
    var KEY = 'skh_last_loc';
    var GEO_MS = 10000;              // muda wa kusubiri GPS
    var GEOCODE_MS = 5000;           // muda wa kusubiri jina la eneo
    var HARD_MS = 12000;             // hakuna "Inatafuta eneo…" ya milele

    var deadline = null, busy = false, lastError = null;
    var manual = null;               // { source:'manual', name, ts } — chaguo la mtumiaji katika kikao hiki

    function skh() { return window.skh || {}; }
    function statusEl() { return document.getElementById('userLocationStatus'); }
    function paint(txt, loading, kind) {
        var el = statusEl(); if (!el) return;
        // [LOCATION 2026-11-24] no blinking: an unchanged label is not rewritten, and the new text is translated in the
        // same frame (it was written in Kiswahili and swapped to English a moment later, so it flashed in English mode)
        if (el.__skhLocTxt === txt && el.getAttribute('data-loc-kind') === (kind || '')) return;
        el.__skhLocTxt = txt;
        el.textContent = txt;
        try { var LMS = window.SokoHaiLMS; if (LMS && LMS.lang === 'en' && typeof LMS.apply === 'function') LMS.apply(el); } catch (e) {}
        el.setAttribute('title', txt);
        el.setAttribute('data-loc-kind', kind || '');
        el.classList.toggle('skh-loc-loading', !!loading);
    }

    function readFix() {
        try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && typeof d === 'object' ? d : null; } catch (e) { return null; }
    }
    function writeFix(fix) {
        try {
            var prev = readFix() || {};
            // usipoteze ruhusa ya Discover (consent) iliyowekwa na moduli nyingine
            var out = { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy, ts: fix.ts, name: fix.name || '', nameFor: fix.nameFor || '', source: 'gps' };
            if (prev.consent === true) out.consent = true;
            localStorage.setItem(KEY, JSON.stringify(out));
        } catch (e) {}
    }

    /** Hali ya sasa: chaguo la mtumiaji kwanza, kisha GPS iliyohifadhiwa (ikiwa bado inatumika). */
    function current() {
        if (manual) return L.classify(manual);
        return L.classify(readFix());
    }
    /** Weka skh.* kwa mujibu wa hali — kuratibu za GPS tu, kamwe za kubuni. */
    function apply(cls) {
        var s = skh();
        s.locationState = cls;
        var fix = L.classify(readFix());
        if (fix.kind === 'gps' || fix.kind === 'approximate') { s.userLat = fix.lat; s.userLon = fix.lon; }
        else { s.userLat = null; s.userLon = null; }
        s.userRegionName = cls.kind === 'unavailable' ? '' : (cls.name || '');
        s.userLocationKind = cls.kind;
    }
    function show(cls) {
        apply(cls);
        paint(L.label(cls), false, cls.kind);
        if (deadline) { clearTimeout(deadline); deadline = null; }
    }

    function refreshFeedIfNeeded() {
        try { var s = skh(); if (s.filterNearMe && typeof s.loadMainFeed === 'function') s.loadMainFeed(s.currentFeedCollection); } catch (e) {}
    }

    function reverseGeocode(lat, lon, cb) {
        var called = false;
        function done(name) { if (called) return; called = true; cb(name || ''); }
        try {
            var ctrl = new AbortController();
            var to = setTimeout(function () { try { ctrl.abort(); } catch (e) {} done(''); }, GEOCODE_MS);
            fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&addressdetails=1&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon),
                { signal: ctrl.signal, headers: { 'Accept-Language': 'sw,en' } })
                .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(function (d) { clearTimeout(to); done(L.nameFromReverse(d, lat, lon)); })
                .catch(function () { clearTimeout(to); done(''); });
        } catch (e) { done(''); }
    }

    /** Omba GPS. userAction=true: mtumiaji ameomba (anaweza kubadilisha chaguo lake la mkoa). */
    function run(userAction) {
        if (!L) return;
        if (busy) return;
        if (userAction) manual = null;
        var before = current();
        if (!userAction && before.kind === 'gps') { show(before); return; }   // GPS mpya ipo tayari: usiulize tena

        if (!navigator.geolocation) { lastError = 'unsupported'; show(before); return; }
        busy = true;
        // only a search the user asked for shows "Inatafuta…"; the silent start-up check keeps the current label until it
        // has a result (it used to flash "Chagua eneo" -> "Inatafuta eneo lako…" -> "Chagua eneo" on every page load)
        if (userAction) paint('Inatafuta eneo lako…', true, 'loading');
        if (deadline) clearTimeout(deadline);
        deadline = setTimeout(function () { busy = false; show(current()); }, HARD_MS);

        navigator.geolocation.getCurrentPosition(function (pos) {
            var fix = L.fromPosition(pos, Date.now());
            if (!fix) { busy = false; lastError = 'invalid'; show(current()); return; }
            lastError = null;
            // hifadhi kuratibu mara moja (bila jina la eneo jingine)
            writeFix({ lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy, ts: fix.ts, name: '', nameFor: '' });
            if (manual && !userAction) { busy = false; apply(current()); return; }   // chaguo la mtumiaji linabaki kwenye upau
            if (userAction) paint('Inapata jina la eneo…', true, 'loading');
            reverseGeocode(fix.lat, fix.lon, function (name) {
                busy = false;
                var saved = readFix();
                // jina linahifadhiwa TU kama ni la kuratibu hizi hizi
                if (saved && saved.ts === fix.ts) writeFix({ lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy, ts: fix.ts, name: name, nameFor: name ? L.key(fix) : '' });
                if (manual && !userAction) { apply(current()); return; }
                show(current());
                refreshFeedIfNeeded();
            });
        }, function (err) {
            busy = false;
            lastError = err && err.code === 1 ? 'denied' : (err && err.code === 3 ? 'timeout' : 'unavailable');
            show(current());   // eneo la mwisho (likiwa bado linatumika) linaonyeshwa kama "(la mwisho)", vinginevyo "Chagua eneo"
        }, { enableHighAccuracy: !!userAction, timeout: GEO_MS, maximumAge: L.BROWSER_MAX_AGE_MS });
    }

    /** Mtumiaji amechagua mkoa (dropdown). '' au 'nearme' = rudi kwenye GPS. */
    function onRegionChosen(value) {
        if (!value || value === 'nearme') {
            manual = null;
            if (value === 'nearme') run(true); else show(current());
            return;
        }
        manual = { source: 'manual', name: String(value), ts: Date.now() };
        show(current());
    }

    /** Kugusa upau: GPS imekataliwa/haipo -> fungua chaguo la mkoa; vinginevyo jaribu GPS upya. */
    function onTap() {
        if (lastError === 'denied' || lastError === 'unsupported' || !navigator.geolocation) {
            var sel = document.getElementById('regionFilterSelect');
            if (typeof window.sokohaiToast === 'function') window.sokohaiToast(lastError === 'denied' ? 'Ruhusa ya eneo imezimwa. Chagua mkoa wako.' : 'GPS haipatikani. Chagua mkoa wako.', 'info', 3500);
            if (sel) { try { sel.focus(); if (typeof sel.showPicker === 'function') sel.showPicker(); } catch (e) {} }
            return;
        }
        run(true);
    }

    window.requestUserLocation = function (force) { run(!!force); };
    window.skhLocationTap = onTap;
    window.skhLocationChoose = onRegionChosen;
    /** Kuratibu za takriban kwa TANGAZO JIPYA: kutoka GPS mpya na sahihi tu, vinginevyo null. */
    window.skhListingCoords = function () { return L ? L.listingCoords(readFix(), Date.now()) : null; };
    /** Discover / moduli nyingine: hifadhi GPS mpya kupitia sheria zile zile. */
    window.skhLocationFromPosition = function (pos) {
        var fix = L && L.fromPosition(pos, Date.now()); if (!fix) return null;
        manual = null; writeFix({ lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy, ts: fix.ts, name: '', nameFor: '' });
        show(current()); run(false); return fix;
    };

    function boot() {
        var el = statusEl(); if (!el || !L) return;
        try { el.removeAttribute('data-i18n'); } catch (e) {}
        el.onclick = null;
        if (!el.__skhLocTap) { el.__skhLocTap = true; el.addEventListener('click', onTap); }
        el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } });
        var sel = document.getElementById('regionFilterSelect');
        if (sel && !sel.__skhLocWatch) { sel.__skhLocWatch = true; sel.addEventListener('change', function () { onRegionChosen(sel.value); }); }
        show(current());                       // hali halisi mara moja (bila "Inatafuta…" ya uongo)
        setTimeout(function () { run(false); }, 150);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

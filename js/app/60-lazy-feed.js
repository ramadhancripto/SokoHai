/* ============================================================================
   SOKOHAI — 60) LAZY FEED (infinite scroll)  2026-11-04
   ----------------------------------------------------------------------------
   OMBI LA MTUMIAJI:
     "Mfumo wa 'Onyesha zaidi' uondolewe; badala yake iwe LAZY LOAD — bidhaa
      zinaonekana kadri anapokaribia kuscroll, sio mpaka abonye 'Onyesha tena'."

   NAMNA INAVYOFANYA KAZI:
     • `renderFeedUI` (00-bootstrap.js) sasa haichori kitufe; inaweka
       `<div data-skh-lazy>` mwisho wa gridi.
     • Moduli hii inaangalia sentinel hiyo kwa `IntersectionObserver`
       (rootMargin 900px) — ikikaribia skrini, inaita `skhFeedShowMore()`
       ambayo iongeza `skh.currentLimit` kisha kuchora upya kutoka cache.
     • Kabla ya kuongeza, sentinel inaonyesha spinner mdogo ("Inapakia…").
     • Hakuna vitufe vya "Onyesha zaidi" tena. Njia ya zamani (`skhFeedShowMore`)
       inabaki kama API kwa tests/compatibility — haionekani kwa mteja.
     • Ikikosa zaidi (limit haiongezeki, au hakuna bidhaa), sentinel inaondolewa.
     • Fallback: kivinjari kisicho na IntersectionObserver → scroll listener.
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    var ROOT_MARGIN = '900px 0px';
    var busy = false;
    var obs = null;
    var mo = null;
    var safetyTimer = null;

    function feed() { return document.getElementById('mainFeed'); }
    function sentinel() {
        var f = feed();
        return f ? f.querySelector('[data-skh-lazy]') : null;
    }
    function totalItems() {
        var arr = (window.skh && (skh._visibleFeedItems || skh.cachedItems)) || [];
        return arr.length;
    }

    /* ---------------------------------------------------------------- */
    function markLoading(on) {
        var s = sentinel();
        if (s) s.classList.toggle('is-loading', !!on);
    }

    function finish() {
        var s = sentinel();
        if (s) s.remove();
        if (obs) { obs.disconnect(); obs = null; }
    }

    function trigger() {
        if (busy) return;
        var s = sentinel();
        if (!s) return;
        var before = Number(window.skh && skh.currentLimit) || 0;
        var total = totalItems();
        if (total && before >= total) { finish(); return; }   // hakuna zaidi

        busy = true;
        markLoading(true);

        try {
            if (typeof window.skhFeedShowMore === 'function') window.skhFeedShowMore();
            else if (window.skh) { skh.currentLimit = before + 20; skh.loadMainFeed(skh.currentFeedCollection || 'all'); }
        } catch (e) { /* tafuta chini */ }

        // Ukaguzi wa matokeo: kama kikomo hakikua, hakuna bidhaa zaidi.
        clearTimeout(safetyTimer);
        safetyTimer = setTimeout(function () {
            busy = false;
            var after = Number(window.skh && skh.currentLimit) || 0;
            if (after <= before) { markLoading(false); finish(); return; }
            markLoading(false);
            arm();
        }, 420);
    }

    function arm() {
        var s = sentinel();
        if (!s) { if (obs) { obs.disconnect(); obs = null; } return; }

        if (typeof window.IntersectionObserver === 'function') {
            if (obs) obs.disconnect();
            obs = new window.IntersectionObserver(function (entries) {
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].isIntersecting) { trigger(); break; }
                }
            }, { root: null, rootMargin: ROOT_MARGIN, threshold: 0 });
            obs.observe(s);
        } else {
            // Fallback: skroli
            if (!window.__skhLazyScrollBound) {
                window.__skhLazyScrollBound = true;
                window.addEventListener('scroll', function () {
                    var el = sentinel();
                    if (!el) return;
                    var r = el.getBoundingClientRect();
                    if (r.top < (window.innerHeight + 900)) trigger();
                }, { passive: true });
            }
        }
    }

    /* Gridi inachorwa upya kila render — angalia mabadiliko na u-arm upya */
    function watchFeed() {
        var f = feed();
        if (!f || f.__skhLazyWatched) return nextTick();
        f.__skhLazyWatched = true;
        mo = new MutationObserver(function () { if (!busy) arm(); });
        mo.observe(f, { childList: true });
        arm();
    }

    function nextTick() {
        setTimeout(function () {
            var f = feed();
            if (!f) { setTimeout(nextTick, 800); return; }
            if (f.__skhLazyWatched) { arm(); return; }
            f.__skhLazyWatched = false;
            watchFeed();
        }, 600);
    }

    window.skhLazyFeedArm = arm;
    window.skhLazyFeedTrigger = trigger;
    window.skhLazyFeedIsBusy = function () { return busy; };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { nextTick(); setTimeout(nextTick, 1500); });
    } else {
        nextTick();
        setTimeout(nextTick, 1500);
    }
})();

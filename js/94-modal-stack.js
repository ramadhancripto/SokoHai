/* ================================================================
 * 94-modal-stack.js — [FIX 2026-09-20 MODAL STACKING / KADI HAZIFUNGUKI]
 * ----------------------------------------------------------------
 * TATIZO (limethibitishwa kwenye msimbo):
 *   07-product.js (openProduct) inaita window.skhBringToFront('productModal')
 *   lakini kazi hiyo HAIKUWAHI kufafanuliwa popote. Matokeo: productModal
 *   (z-index 7500) ilifunguka NYUMA ya modal karibu zote zilizo juu yake:
 *   duka la muuzaji (7900), chat (7800), Saved (8763), Oda (8750), Discover
 *   (100001), Group Soga (100010), n.k. Mtumiaji anabofya kadi ndani ya duka /
 *   recommendations / chat — kadi "inafunguka" lakini haionekani.
 *
 * SULUHISHO (kanuni ya LIFO — kinachofunguliwa mwisho kiwe juu):
 *   1) window.skhBringToFront(id)  — inapandisha overlay juu ya zote zilizo wazi.
 *   2) Kifuatiliaji (MutationObserver): overlay yoyote inapoonekana upya
 *      (display/class/hidden) na iko chini ya nyingine iliyo wazi, inapandishwa
 *      juu yake. Overlay iliyokwisha kuwa juu HAIGUSWI.
 *   3) Inaunganishwa na rundo la Back (56-nav-back.js) ili kitufe cha X/Back
 *      kifunge KADI kwanza, kisha kirudi kwenye duka/chat/discover ulikotoka.
 *
 * Dialogs/toasts (z-index 2147483000+) hubaki juu ya kila kitu; meneja huyu
 * hapandishi zaidi ya 2,000,000,000.
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhModalStack) return;
    window.__skhModalStack = true;

    var SEL = '.overlay-menu,[id$="Modal"],[id$="Form"],.skh-sheet-overlay';
    var SKIP = { buyerView: 1, sellerView: 1, mainFeed: 1, homeView: 1, appRoot: 1 };
    var MAX_Z = 2000000000;

    function cs(el) { try { return window.getComputedStyle(el); } catch (e) { return null; } }

    // Overlay halisi inayostahili kuhesabiwa (si iliyo ndani ya overlay nyingine —
    // hiyo inapangwa ndani ya stacking context ya mzazi wake).
    function isCandidate(el) {
        if (!el || el.nodeType !== 1 || typeof el.matches !== 'function') return false;
        if (el.id && SKIP[el.id]) return false;
        if (!el.matches(SEL)) return false;
        var p = el.parentElement;
        if (p && typeof p.closest === 'function' && p.closest(SEL)) return false;
        return true;
    }

    function isShown(el) {
        if (!el || !el.isConnected || el.hidden) return false;
        var s = cs(el);
        if (!s) return false;
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        return s.position === 'fixed' || s.position === 'absolute';
    }

    function zOf(el) {
        var s = cs(el);
        var z = s ? parseInt(s.zIndex, 10) : NaN;
        return isNaN(z) ? 0 : z;
    }

    // z-index ya juu kabisa kati ya overlays nyingine ZILIZO WAZI sasa.
    function topZ(except) {
        var max = 0;
        var list = document.querySelectorAll(SEL);
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el === except || !isCandidate(el) || !isShown(el)) continue;
            var z = zOf(el);
            if (z > max) max = z;
        }
        return max;
    }

    function raise(el, explicit) {
        var others = topZ(el);
        var cur = zOf(el);
        var changed = false;
        if (cur <= others) {
            var next = Math.min(others + 1, MAX_Z);
            // 'important' ili ishinde CSS ya #id yenye !important
            el.style.setProperty('z-index', String(next), 'important');
            changed = true;
        }
        // Ungana na rundo la Back: kipengele kinahamia JUU ya rundo.
        if ((changed || explicit) && el.id && typeof window.skhNavPush === 'function') {
            try {
                window.skhNavPush({
                    type: 'modal', id: el.id, raise: true,
                    restore: function () { el.style.display = 'none'; }
                });
            } catch (e) { /* defensive */ }
        }
        return changed;
    }

    var wasShown = (typeof WeakMap === 'function') ? new WeakMap() : null;
    var queue = [];
    var scheduled = false;

    function schedule(el) {
        if (queue.indexOf(el) === -1) queue.push(el);
        if (scheduled) return;
        scheduled = true;
        Promise.resolve().then(flush);
    }

    function flush() {
        scheduled = false;
        var els = queue.slice(); queue.length = 0;
        els.forEach(function (el) {
            var shown = isShown(el);
            var was = wasShown ? wasShown.get(el) === true : false;
            if (wasShown) wasShown.set(el, shown);
            if (shown && !was) raise(el, false);
        });
    }

    /** API ya wazi: openProduct (07-product.js) na wengine wanaweza kuiita. */
    window.skhBringToFront = function (idOrEl) {
        var el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
        if (!el || !isShown(el)) return false;
        if (wasShown) wasShown.set(el, true);
        raise(el, true);
        return true;
    };

    function start() {
        if (!document.body || typeof MutationObserver !== 'function') return;
        var mo = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (r.type === 'attributes') {
                    if (isCandidate(r.target)) schedule(r.target);
                } else if (r.type === 'childList' && r.addedNodes) {
                    for (var j = 0; j < r.addedNodes.length; j++) {
                        if (isCandidate(r.addedNodes[j])) schedule(r.addedNodes[j]);
                    }
                }
            }
        });
        mo.observe(document.body, {
            subtree: true, childList: true, attributes: true,
            attributeFilter: ['style', 'class', 'hidden']
        });
    }

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();

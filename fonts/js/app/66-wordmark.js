/* ================================================================
 * 66-wordmark.js — [BRAND WORDMARK R15 2026-09-17]
 * Mounti ya SVG wordmark ng'ambo zote baada ya boot:
 *   - [data-skh-wm="<w>"] (welcome modal, header, …)
 *   - Skrini nyingine zinazojiongezea baadaye huita skhMountWordmarks(root).
 * Generator yenyewe (window.skhWordmark) iko INLINE kwenye <head> ili
 * splash ipate logo kabla ya modules — HAKUNA duplicate markup.
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhWordmarkBooted) return;
    window.__skhWordmarkBooted = true;

    function mountNow() {
        try { window.skhMountWordmarks(document); } catch (e) {}
        // Baadhi ya containers hufunguliwa baadaye (welcome modal)
        if (!window.__skhWmObserver && window.MutationObserver) {
            window.__skhWmObserver = new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    var added = muts[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        var n = added[j];
                        if (n && n.nodeType === 1 &&
                            (n.hasAttribute && n.hasAttribute('data-skh-wm') ||
                             (n.querySelector && n.querySelector('[data-skh-wm]')))) {
                            window.skhMountWordmarks(n.parentNode || document);
                            return;
                        }
                    }
                }
            });
            window.__skhWmObserver.observe(document.body, { childList: true, subtree: true });
        }
    }
    if (document.readyState !== 'loading') mountNow();
    else document.addEventListener('DOMContentLoaded', mountNow);
})();

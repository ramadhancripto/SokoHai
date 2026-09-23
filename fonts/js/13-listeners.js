/* ==== js/13-listeners.js ==== */
// ============================================================
// SOKOHAI LISTENERS (Phase 4.4) — MSIMAMIZI WA onSnapshot
// Tatizo: listeners 11 za app hazikuwa zinafungwa (unsubscribe) —
// kila dashboard re-render iliongeza listener MPYA (gharama 2x, 3x...).
// Suluhisho: skhOnSnapshot(tag, ref, cb):
//   - listener yenye TAG ile ile inafungiwa kwanza (replace, si accumulate)
//   - skhCancelAllListeners() inafunga zote (logout/mode-switch)
// Classic script — inapakia KABLA ya app.module.js (module).
// ============================================================
(function () { 'use strict';
    var registry = {};   // tag -> unsubscribe fn
    window.SOKOHAI_LISTENERS = registry;

    window.skhOnSnapshot = function (tag, refOrQuery, callback, onError) {
        if (!tag || !refOrQuery) return null;
        if (!onSnapshot_raw) {
            // Haipaswi kutokea (module inasajilisha mwanzoni) — lakini tunaepuka crash
            console.warn('skhOnSnapshot: Firestore haijasajiliwa bado (' + tag + ')');
            return null;
        }
        // Funga ya zamani yenye tag ile ile (dedupe ya re-renders)
        try { if (registry[tag]) registry[tag](); } catch (e) {}
        var unsub = onError
            ? onSnapshot_raw(refOrQuery, callback, onError)
            : onSnapshot_raw(refOrQuery, callback);
        registry[tag] = unsub;
        return unsub;
    };

    // Firestore inapatikana kama global? Hapana — module ina import.
    // Kwa hivyo tunatumia "thunk": app.module.js inaita skhRegisterFirestore(onSnapshotFn)
    // mara moja ili hii file iweze kuituma.
    var onSnapshot_raw = null;
    window.skhRegisterFirestore = function (onSnapshotFn) {
        onSnapshot_raw = onSnapshotFn;
    };

    window.skhCancelAllListeners = function () {
        Object.keys(registry).forEach(function (k) {
            try { registry[k](); } catch (e) {}
            delete registry[k];
        });
    };

    window.skhCancelListenersByPrefix = function (prefix) {
        Object.keys(registry).forEach(function (k) {
            if (k.indexOf(prefix) === 0) {
                try { registry[k](); } catch (e) {}
                delete registry[k];
            }
        });
    };
})();

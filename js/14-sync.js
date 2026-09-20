/* ==== js/14-sync.js ==== */
// ============================================================
// SOKOHAI STATE SYNC (Phase 4.3) — localStorage <-> Firestore
// Inafanya kikapu/mauzo ya nje ya mtandao/wishlist zipatikane kwenye
// VIFAA VYOTE vya mtumiaji (multi-device).
// Mkakati wa usalama (hauvunji chochote):
//   - Inasikiliza localStorage.setItem za keys zilizoorodheshwa
//   - DEBOUNCE ya sekunde 3, kisha inaandika `user_state/{uid}`
//   - Login: inavuta remote; LWW (muda mrefu zaidi ushinde)
//   - Hakuna kubadilisha tabia ya app — app inaendelea kusoma
//     localStorage kama kawaida
// Firestore inasajiliwa na app.module.js (skhSyncRegisterFirestore).
// ============================================================
(function () {
    'use strict';

    var KEYS = ['sokohai_cart', 'sokohai_offline_sales', 'sokohai_saved_cart', 'sokohai_saved_later', 'sokohai_wishlist'];
    var META = 'sokohai_sync_meta';
    var uid = null;
    var fb = null;             // {db, doc, setDoc, getDoc}
    var pushTimer = null;
    var pulledOnce = {};

    // ---------- meta helpers ----------
    function readMeta() {
        try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch (e) { return {}; }
    }
    function writeMeta(m) {
        try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) {}
    }

    // ---------- localStorage.setItem monitor ----------
    var nativeSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
        nativeSet(k, v);
        if (KEYS.indexOf(k) !== -1) {
            var m = readMeta();
            m[k] = Date.now();
            writeMeta(m);
            schedulePush();
        }
    };
    // Usirudishe events wakati tunasoma remote (loop):
    function silentSet(k, v) {
        nativeSet(k, v);
        var m = readMeta();
        m[k] = Date.now();
        writeMeta(m);
    }

    // ---------- push (debounced) ----------
    function schedulePush() {
        if (!uid || !fb) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(doPush, 3000);
    }

    async function doPush() {
        if (!uid || !fb) return;
        try {
            var m = readMeta();
            var payload = { updatedAt: new Date().toISOString(), uid: uid };
            KEYS.forEach(function (k) {
                payload[k] = { v: localStorage.getItem(k), t: m[k] || 0 };
            });
            await fb.setDoc(fb.doc(fb.db, 'user_state', uid), payload, { merge: true });
        } catch (e) {
            console.warn('skhSync push failed:', e && e.message);
        }
    }

    // ---------- pull + LWW merge ----------
    async function doPull() {
        if (!uid || !fb) return;
        try {
            var snap = await fb.getDoc(fb.doc(fb.db, 'user_state', uid));
            if (!snap.exists()) { pulledOnce[uid] = true; return; }
            var remote = snap.data() || {};
            var m = readMeta();
            var localChanged = false;

            KEYS.forEach(function (k) {
                if (pulledOnce[uid]) return;
                var r = remote[k];
                if (!r || typeof r.v !== 'string') return;
                var localT = m[k] || 0;
                var remoteT = r.t || 0;
                if (remoteT > localT) {
                    // Remote mpya zaidi → ikubali
                    silentSet(k, r.v);
                    localChanged = true;
                    try {
                        window.dispatchEvent(new CustomEvent('skh:state-updated', { detail: { key: k, source: 'remote' } }));
                    } catch (e) {}
                }
            });
            pulledOnce[uid] = true;
            // Kama local ilikuwa mpya zaidi kwa baadhi, push itasawazisha remote
            schedulePush();
        } catch (e) {
            console.warn('skhSync pull failed:', e && e.message);
        }
    }

    // ---------- API ----------
    window.skhSyncRegisterFirestore = function (fns) { fb = fns; };
    window.skhSyncOnLogin = function (u) {
        uid = u;
        pulledOnce = {};
        if (fb) doPull();
    };
    window.skhSyncOnLogout = function () {
        if (pushTimer) { clearTimeout(pushTimer); }
        pushTimer = null;
        uid = null;
    };
    window.skhSyncPushNow = function () { if (pushTimer) clearTimeout(pushTimer); return doPush(); };
})();

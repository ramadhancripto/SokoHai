/* ==== js/app/63-audit-fixes.js ==== */
/* ============================================================================
   SOKOHAI 63 — MASTER AUDIT 2026-09-16: KUKAMILISHA VIUNGO VILIVYOKATWA (§27, §28)
   ----------------------------------------------------------------------------
   Handlers zifuatazo ziliitwa kwenye index.html lakini HAZIKUWEPo kwenye code
   (vinarea viliweza kuisha — mirage ya "files 02–04" zilizopotea kwenye
   mlolongo wa js/):

     1. unlockSystem()          <- welcomeModal "ENDELEA NDANI"  (P1: mlango wa
                                   kwanza; ReferenceError ilizuia hata closeWelcome)
     2. proceedToSelfPickup()   <- deliveryChoiceModal "Nitachukua Mwenyewe"
                                   (P1: njia ya "Order only" bila usafiri — §13)
     3. cancelCurrentOrder()    <- deliveryChoiceModal "GHAIRI ODA" (P1)

     4. window.spStatusClass()  <- 15-sp-live.js SokoPay pills (P: ulikuwa na
                                   fallback, lakini pills hazikuwa na rangi)

   Pia: welcomeModal hakuonekani kwa sababu hakuna kitu kilichokuwa kikionyesha —
   sasa inaonekana MARA MOJA kwa kifaa kwa wageni (haisisumbui watumiaji
   walioingia — §27 trigger completion, design ya zamani haijavunjwa).
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    function byId(id) { return document.getElementById(id); }
    function closeAll() { try { if (typeof window.closeModals === 'function') window.closeModals(); } catch (e) {} }
    function toast(msg, type, ms) {
        try { if (typeof window.skhToast === 'function') { window.skhToast(msg, type || 'info', ms || 2800); return; } } catch (e) {}
        try { alert(msg); } catch (e) {}
    }

    /* ------------------------------------------------------------------ 1
       unlockSystem() — kitufe cha "ENDELEA NDANI" kwenye welcomeModal.
       Kazi: weka alama ya kuwa amekaribishwa + funga modal + ondoa lock. */
    window.unlockSystem = function () {
        try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {}
        try { document.body.classList.remove('skh-locked'); } catch (e) {}
        var wm = byId('welcomeModal');
        if (wm) wm.style.display = 'none';
        return true;
    };

    /* [WELCOME-IDENTITY 2026-09-17] Jina la welcomeModal lionyeshe ACCOUNT ya
       mtu halisi (mnunuzi/muuzaji/mtoa huduma), si "MTUMIAJI" kavu.
       1) HATUA A (sync): jina lilitawaliwa tayari ndani ya memory:
          currentUserData (fullName/displayName/storeName) au displayName/email
          ya auth user.
       2) HATUA B (async): vuta `users/{uid}` — account halisi iliyosajiliwa.
       Fallback ya mwisho (mgeni bila account): "Mgeni".
       Kunaanuru: mara moja pekee kwa kifaa — hakuna kuwatesa wanachama. */
    /* [WELCOME-NAME FIX 2026-11-01] Jina la mtumiaji lilikuwa linaandikwa kisha
       KUFUTWA na i18n: `#welcomeName` ilikuwa na data-i18n="onboard_user" ambao
       unatafsiriwa kuwa "MTUMIAJI", na MutationObserver ya `LMS.apply()` hufanya
       hivyo baada ya kila mabadiliko ya DOM — hivyo hata mtumiaji aliyejisajili
       alionyesha "MTUMIAJI". Sasa jina ni thamani ya utambulisho (si lebo):
       linahifadhiwa hapa na kuandikwa upya kila i18n inapogusa ukurasa. */
    var welcomeNameCache = null;

    function writeWelcomeName(nm) {
        var el = byId('welcomeName');
        if (!el) return;
        el.setAttribute('data-no-i18n', '1');
        if (el.hasAttribute('data-i18n')) el.removeAttribute('data-i18n');
        nm = String(nm == null ? '' : nm).trim();
        if (!nm) return;
        welcomeNameCache = nm;
        if (String(el.textContent || '').trim() !== nm) el.textContent = nm;
        guardWelcomeNameEl(el);
    }

    /* Kama kitu kingine kitaandika juu ya jina (mf. tafsiri ya baadaye),
       tunarudisha jina la mtumiaji. Hii inagusa jina letu pekee. */
    function guardWelcomeNameEl(el) {
        if (!el || el.__skhNameGuarded) return;
        el.__skhNameGuarded = true;
        try {
            new MutationObserver(function () {
                if (!welcomeNameCache) return;
                if (String(el.textContent || '').trim() !== welcomeNameCache) {
                    el.textContent = welcomeNameCache;
                }
            }).observe(el, { childList: true, characterData: true, subtree: true });
        } catch (e) { /* defensive */ }
    }
    window.skhWelcomeNameCache = function () { return welcomeNameCache; };

    function resolveWelcomeName(cb) {
        function clean(n) {
            if (!n) return null;
            n = String(n).trim().replace(/\s+/g, ' ');
            if (!n || /^mtumiaji$/i.test(n) || /^user$/i.test(n) || /^mwanachama$/i.test(n)) return null;
            return n;
        }
        /* Jina kamili la akaunti: majina mengi yanayowezekana kutoka users/{uid},
           kisha auth profile, kisha sehemu ya barua pepe. */
        function fromDoc(d) {
            if (!d || typeof d !== 'object') return null;
            var first = clean(d.firstName) || clean(d.jinaLaKwanza);
            var last = clean(d.lastName) || clean(d.jinaLaMwisho);
            var both = (first && last) ? (first + ' ' + last) : null;
            return clean(d.fullName) || clean(d.displayName) || clean(d.name) || both
                || clean(d.storeName) || clean(d.shopName) || clean(d.businessName)
                || clean(d.sellerName) || clean(d.userName) || clean(d.username) || first;
        }
        function pick() {
            var u = skh.currentUserData || {};
            var au = skh.currentUser || {};
            var n = fromDoc(u) || clean(au.displayName);
            if (n) return n;
            var em = u.email || au.email || '';
            if (em && String(em).indexOf('@') > 0) {
                var pre = String(em).split('@')[0];
                if (pre && !/^\d+$/.test(pre)) return pre;
            }
            return null;
        }
        var n0 = pick();
        if (n0) { cb(n0); return; }
        var uid = (skh.currentUser && skh.currentUser.uid) || null;
        if (!uid || !skh.db || !skh.getDoc) { cb(pick() || 'Mgeni'); return; }
        try {
            skh.getDoc(skh.doc(skh.db, 'users', uid)).then(function (s) {
                var n1 = pick();
                if (!n1 && s && s.exists && s.exists()) {
                    var d = s.data() || {};
                    n1 = fromDoc(d);
                    if (!n1) {
                        var em = d.email || d.userEmail || '';
                        if (em && String(em).indexOf('@') > 0) {
                            var pre = String(em).split('@')[0];
                            if (pre && !/^\d+$/.test(pre)) n1 = pre;
                        }
                    }
                }
                cb(n1 || 'Mgeni');
            }).catch(function () { cb(pick() || 'Mgeni'); });
        } catch (e) { cb(pick() || 'Mgeni'); }
    }

    // Inafunguliwa nje (tests + mahali pengine): vuta jina la account halisi.
    window.skhResolveWelcomeName = resolveWelcomeName;

    /* [WELCOME-ALERT] Onyesha welcome alert modal kwa jina la mtumiaji */
    window.skhShowWelcomeAlert = function (name) {
        try {
            var wm = byId('welcomeModal');
            if (!wm) return;
            var nameEl = byId('welcomeName');
            if (name && String(name).trim() && !/^mtumiaji$/i.test(String(name).trim())) {
                writeWelcomeName(String(name).trim());
            } else {
                resolveWelcomeName(function (nm) {
                    writeWelcomeName(nm || 'Mwanachama');
                });
            }
            wm.style.display = 'flex';
        } catch (e) {
            console.warn('[welcome] show error:', e);
        }
    };

    /* Trigger ya welcomeModal: onyesha kwa wageni au kwenye kiungo mara ya kwanza */
    setTimeout(function () {
        try {
            var wm = byId('welcomeModal');
            if (!wm) return;
            if (localStorage.getItem('skh_welcomed_v1') === '1') return;
            var anyOpen = false;
            document.querySelectorAll('.overlay-menu').forEach(function (o) {
                if (o !== wm) { var d = getComputedStyle(o).display; if (d !== 'none') anyOpen = true; }
            });
            if (anyOpen) return;
            var nameEl = byId('welcomeName');
            if (nameEl) {
                nameEl.setAttribute('data-no-i18n', '1');
                nameEl.textContent = '';
            }
            wm.style.display = 'flex';
            resolveWelcomeName(function (nm) { writeWelcomeName(nm || 'Mwanachama'); });
        } catch (e) { console.warn('[63] welcome wiring:', e && e.message); }
    }, 600);

    /* [WELCOME-NAME FIX] Kubadilisha lugha hufanya i18n iandike upya ukurasa —
       jina linarudishwa mara moja baada ya hapo. */
    document.addEventListener('sokohai:languageChanged', function () {
        if (welcomeNameCache) writeWelcomeName(welcomeNameCache);
    });

    /* Mtumiaji akimaliza kuingia / session inapotambuliwa, jina la akaunti
       linavutwa upya endapo welcome modal bado iko wazi. */
    document.addEventListener('skh:auth-ready', function () {
        var wm = byId('welcomeModal');
        if (!wm || getComputedStyle(wm).display === 'none') return;
        resolveWelcomeName(function (nm) { writeWelcomeName(nm || 'Mwanachama'); });
    });

    /* Nje: kurudisha jina kwa mkono (tests / skrini nyingine). */
    window.skhRefreshWelcomeName = function () {
        resolveWelcomeName(function (nm) { writeWelcomeName(nm || 'Mwanachama'); });
    };

    /* ------------------------------------------------------------------ 2
       proceedToSelfPickup() — §13: mtumiaji hahitaji usafiri wa SokoHai.
       Flow: bidhaa imehifadhiwa (pending_order_product) -> Oda bila usafiri ->
       moja kwa moja kwenda malipo (checkout), context ya self-pickup iwekwe
       ili return-handler (17-pesapal-return.js) ijue hakuna transport request. */
    window.proceedToSelfPickup = function () {
        var product = null;
        try { product = JSON.parse(sessionStorage.getItem('pending_order_product') || 'null'); } catch (e) {}
        try {
            sessionStorage.setItem('flow_step', 'self_pickup');
            sessionStorage.setItem('sokohai_self_pickup', '1');
            if (product) {
                sessionStorage.setItem('chain_from', product.location || 'Dukani');
                sessionStorage.setItem('chain_cargo_name', product.title || '');
            }
        } catch (e) {}
        try { if (typeof window.skhDeliveryReset === 'function') window.skhDeliveryReset(); } catch (e) {}
        closeAll();
        toast('Umechagua kujichukulia — maliza malipo ya bidhaa kwanza.', 'success', 3200);
        try {
            if (typeof window.openCheckout === 'function') window.openCheckout('direct');
        } catch (e) { console.warn('[63] openCheckout kwa self-pickup:', e && e.message); }
        return false;
    };

    /* ------------------------------------------------------------------ 3
       cancelCurrentOrder() — "GHAIRI ODA": safisha state zote za oda inayosubiri
       (session markers) bila kugusa cart ya mteja, kisha funga modals. */
    window.cancelCurrentOrder = function () {
        try {
            ['pending_order_product', 'flow_step', 'chain_from', 'chain_cargo_name',
             'sokohai_buynow', 'sokohai_self_pickup'].forEach(function (k) {
                try { sessionStorage.removeItem(k); } catch (e) {}
            });
            if (typeof window.skhDeliveryReset === 'function') window.skhDeliveryReset();
        } catch (e) {}
        closeAll();
        toast('Oda imeghairiwa.', 'info', 2600);
        return false;
    };

    /* ------------------------------------------------------------------ 4
       window.spStatusClass() — ramani ya hali -> class ya pill (15-sp-live.js).
       Imehifadhiwa simple + deterministic; CSS zinazolingana zipo kwenye
       09-sokopay-polish.css (ikiwa class haipo, inategemea text — si breakdown). */
    window.spStatusClass = function (st) {
        var s = String(st == null ? '' : st).toLowerCase();
        if (/complete|delivered|released|received|paid|success|verified|done|active/.test(s)) return 'sp-ok';
        if (/fail|cancel|dispute|reject|error|late|expired|refund/.test(s)) return 'sp-bad';
        if (/pend|waiting|process|held|hold|transit|review|prepar|assigned/.test(s)) return 'sp-warn';
        return 'sp-neutral';
    };

    console.log('[63-audit-fixes] Ready — unlockSystem, proceedToSelfPickup, cancelCurrentOrder, spStatusClass');
})();

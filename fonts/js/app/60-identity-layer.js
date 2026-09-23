/* ============================================================================
   SOKOHAI — IDENTITY LAYER (Offline Member ownership)
   SEHEMU A, B, C, G, H, I, J, K, L, AH
   ----------------------------------------------------------------------------
   TATIZO LILILOTHIBITISHWA:
     Wakati wa KIPINDI CHA MSAADA (assisted session), `skh.currentUser.uid`
     ni ya WAKALA — kwa sababu Firebase Auth bado ina akaunti ya wakala
     (customToken inahitaji server, ambayo bado ni 404).

     Kwa hiyo kila rekodi inayoundwa wakati huo ilikuwa inaandikwa kwa jina
     la wakala:
        34-chat-core.js      myUid()  -> senderId = WAKALA      (SEHEMU K)
        28-buyer-engagement  24 × currentUser.uid -> likes/saves za wakala
        23-smart-cart.js     10 × currentUser.uid -> buyerId = WAKALA (SEHEMU H)
        04-orders-escrow.js   3 × currentUser.uid
        35-comments.js        1 × currentUser.uid -> authorId = WAKALA

   SULUHISHO:
     Safu MOJA inayobadilisha `skh.currentUser` kuwa MWANACHAMA wakati wa
     kipindi cha msaada. Modules zote 43 zinaendelea kutumia
     `skh.currentUser.uid` kama kawaida — hakuna haja ya kuzihariri —
     lakini sasa zinapata UID SAHIHI.

     Utambulisho wa WAKALA unahifadhiwa kwenye `skh.assistAgent` kwa
     monitoring/audit (SEHEMU M, N) — SI umiliki (SEHEMU AH).
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    var KEY = 'skh_assist_session';
    var patched = false;
    var realUser = null;        // akaunti halisi ya Firebase (wakala)

    function session() {
        // [§20 TEST A] Session ni localStorage sasa (inahifadhi 31-agent-assist).
        // Fallback kwa sessionStorage kwa ulinganifu wa nyuma (legacy).
        try { var raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY); return JSON.parse(raw || 'null'); } catch (e) { return null; }
    }

    /* ========================================================================
       1) BADILISHA currentUser KUWA MWANACHAMA (SEHEMU B)
       ======================================================================== */
    function applyMemberIdentity() {
        var s = session();
        var m = s && (s.member || (s.memberUid ? { uid: s.memberUid, fullName: s.memberName } : null));
        if (!m || !m.uid) { restore(); return false; }
        if (patched && skh.currentUser && skh.currentUser.uid === m.uid) return true;

        if (!realUser) realUser = skh.currentUser || null;
        wipeSession();                 // futa data ya wakala kabla ya kuingia

        /* Utambulisho wa mwanachama — ndiye mmiliki wa kila kitu
           kitakachoundwa sasa (SEHEMU G, H, I, J, K, L). */
        /* [IDENTITY-FIX DP 2026-09-16] DP ya mwanachama hutoka session
           (iliyohifadhiwa wakati wa login) — kamwe DP jina avatar tu ikiwa
           profile ina picha halisi. */
        var mPhoto = m.photoURL || (s && s.memberPhoto) || null;
        skh.currentUser = {
            uid: m.uid,
            displayName: m.fullName || s.memberName || 'Mwanachama',
            email: null,                               // hakuna email ya uongo
            phoneNumber: m.phone || m.phoneNumber || null,
            photoURL: mPhoto,
            isOfflineMember: true,
            assistedBy: (s && s.agentId) || (realUser && realUser.uid) || null,
            // Njia ya kufikia akaunti halisi ya Auth (kwa server calls)
            __authUser: realUser
        };
        skh.currentUserData = Object.assign({}, skh.currentUserData || {}, {
            uid: m.uid,
            fullName: m.fullName || s.memberName || '',
            phone: m.phone || null,
            phoneNumber: m.phone || null,
            email: null,
            photoURL: mPhoto,
            accountType: 'offline_member',
            ownerId: m.uid,
            isOfflineUser: true,
            registeredThroughAgentId: (s && s.agentId) || null
        });
        /* [IDENTITY-FIX DP] Chanzo cha kweli cha DP/jina ni users/{uid} —
           mwanachama anaweza kubadilisha DP yake wakati wowote. Soma mara moja,
           merge, pakua UI (only ikiwa identity bado ni mtu yule yule). */
        try {
            if (skh.getDoc && skh.doc && skh.db) {
                var wantUid = m.uid;
                skh.getDoc(skh.doc(skh.db, 'users', wantUid)).then(function (snap) {
                    if (!snap || !snap.exists || !snap.exists()) return;
                    var d = snap.data() || {};
                    if (!skh.currentUser || skh.currentUser.uid !== wantUid) return;
                    if (d.photoURL) { skh.currentUser.photoURL = d.photoURL; skh.currentUserData.photoURL = d.photoURL; }
                    if (d.fullName) skh.currentUserData.fullName = d.fullName;
                    if (d.phone || d.phoneNumber) {
                        skh.currentUserData.phone = d.phone || d.phoneNumber;
                        skh.currentUserData.phoneNumber = d.phone || d.phoneNumber;
                        skh.currentUser.phoneNumber = d.phone || d.phoneNumber;
                    }
                    if (typeof window.skhRefreshProfileUi === 'function') window.skhRefreshProfileUi();
                }).catch(function () {});
            }
        } catch (e) {}

        // Wakala — metadata ya monitoring pekee (SEHEMU M, N)
        skh.assistAgent = realUser ? {
            uid: realUser.uid,
            name: realUser.displayName || '',
            isAgent: true
        } : { uid: (s && s.agentId) || null, isAgent: true };
        skh.assistedMember = skh.currentUser;

        patched = true;
        document.dispatchEvent(new CustomEvent('skh:identity-changed',
            { detail: { uid: m.uid, assisted: true } }));
        reloadForNewIdentity();        // pakia kwa UID ya mwanachama
        return true;
    }

    function restore() {
        if (!patched) return;
        /* [FIX] `realUser` inaweza kuwa null ikiwa identity ilitumika kabla
           ya Firebase Auth kukamilisha. Tumia `__authUser` iliyohifadhiwa
           ndani ya currentUser kama nakala ya akiba. */
        var back = realUser ||
                   (skh.currentUser && skh.currentUser.__authUser) || null;
        wipeSession();                 // futa data ya mwanachama kabla ya kurudi
        if (back) skh.currentUser = back;
        realUser = null;
        skh.assistAgent = null;
        skh.assistedMember = null;
        patched = false;
        document.dispatchEvent(new CustomEvent('skh:identity-changed',
            { detail: { uid: skh.currentUser && skh.currentUser.uid, assisted: false } }));
        reloadForNewIdentity();
    }

    /* ========================================================================
       [FIX 2026-09-15] SAFISHA HALI YA MTUMIAJI WA AWALI
       ------------------------------------------------------------------------
       Bila hii, mwanachama anaona data ya wakala: inbox, oda, arifa, saved,
       cart — kwa sababu cache za module zilishapakia kwa UID ya wakala.
       ======================================================================== */
    function wipeSession() {
        // Cache za moduli (kila moja inapakia upya kwa UID mpya)
        skh.cachedItems = [];
        skh.myCart = [];
        skh.negoCurrent = null;
        skh.negoOrder = null;
        skh.currentOpenProduct = null;
        skh.chatCore = {};
        skh.chatRelated = null;
        skh.activeChatProduct = null;
        skh.activeChatService = null;
        skh.activeChatTransport = null;
        skh.currentChatUid = null;
        skh.chatPartner = null;
        window.skhChatInboxCache = null;
        window.skhEngagementState = {};

        // Chat: futa orodha na listeners
        try { if (typeof window.skhChatWipeState === 'function') window.skhChatWipeState(); } catch (e) {}

        // Vyombo vya UI vinavyoshikilia data ya mtumiaji
        ['inboxList', 'chatMessages', 'notifList', 'savedItemsList',
         'buyerOrdersList', 'richDashboardContainer'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        // Storage ya mtumiaji wa awali (si ya mfumo)
        ['skh_recent_view', 'skh_last_product', 'skh_open_product',
         'pending_sokopay_core_ids', 'smart_cart_checkout_token',
         'skh_checkout_context'].forEach(function (k) {
            try { sessionStorage.removeItem(k); } catch (e) {}
        });

        // Zima listeners zilizoshikamana na UID ya awali
        try { if (typeof window.skhCancelAllListeners === 'function') window.skhCancelAllListeners(); } catch (e) {}
    }

    /* Pakia upya maonyesho kwa UID MPYA */
    function reloadForNewIdentity() {
        setTimeout(function () {
            try { if (typeof skh.loadMainFeed === 'function') skh.loadMainFeed(skh.currentFeedCollection || 'all'); } catch (e) {}
            try { if (typeof window.loadUserNotifications === 'function') window.loadUserNotifications(); } catch (e) {}
            try { if (typeof window.skhRefreshProfileUi === 'function') window.skhRefreshProfileUi(); } catch (e) {}
            try { if (typeof window.updateApp === 'function' && skh.currentMode === 'buyer') {
                var t = document.getElementById('navTabHome');
                if (t) window.updateApp('home', t);
            } } catch (e) {}
        }, 400);
    }

    window.skhIdentityApply = applyMemberIdentity;
    window.skhIdentityRestore = restore;

    /* ========================================================================
       2) API YA UTAMBULISHO (SEHEMU AH)
       ======================================================================== */
    /** Mmiliki halisi wa rekodi zinazoundwa sasa */
    window.skhOwnerId = function () {
        return (skh.currentUser && skh.currentUser.uid) || null;
    };
    /** Akaunti halisi ya Firebase (kwa callable/server) */
    window.skhAuthUser = function () {
        return (skh.currentUser && skh.currentUser.__authUser) || realUser || skh.currentUser || null;
    };
    /** Wakala anayesaidia sasa (au null) */
    window.skhActingAgent = function () { return skh.assistAgent || null; };
    /** Je, tupo kwenye kipindi cha msaada? */
    window.skhIsAssisted = function () { return !!patched; };

    /* ========================================================================
       3) TUMIA MARA KIPINDI KINAPOANZA/KUISHA
       ======================================================================== */
    function hook() {
        // Baada ya kuingia kwa niaba ya mwanachama
        ['skhAssistLoginSubmit', 'skhAssistAuthenticateNative'].forEach(function (fn) {
            var orig = window[fn];
            if (typeof orig !== 'function' || orig.__idLayer) return;
            var w = function () {
                var r = orig.apply(this, arguments);
                Promise.resolve(r).then(function (res) {
                    setTimeout(applyMemberIdentity, 250);
                    return res;
                }).catch(function () {});
                return r;
            };
            w.__idLayer = true; window[fn] = w;
        });
        // Kipindi kikiisha — rudisha wakala
        var out = window.skhAssistLogout;
        if (typeof out === 'function' && !out.__idLayer) {
            var wo = function () { restore(); return out.apply(this, arguments); };
            wo.__idLayer = true; window.skhAssistLogout = wo;
        }
    }

    // Tumia mara moja ikiwa kipindi tayari kipo (baada ya refresh)
    function boot() {
        hook();
        if (session()) setTimeout(applyMemberIdentity, 400);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    setTimeout(hook, 1600);
    setTimeout(hook, 4200);

    /* ========================================================================
       4) MONITORING KWA WAKALA (SEHEMU N) — bila umiliki
       ======================================================================== */
    document.addEventListener('skh:identity-changed', function (e) {
        var d = (e && e.detail) || {};
        if (!d.assisted || typeof window.skhEmitEvent !== 'function') return;
        // Wakala anajua kipindi kimeanza — si tukio la biashara
        try {
            var a = skh.assistAgent;
            if (a && a.uid) {
                skh.addDoc(skh.collection(skh.db, 'activity_logs'), {
                    type: 'ASSISTED_SESSION_ACTIVE', agentId: a.uid,
                    memberUid: d.uid, at: new Date().toISOString()
                }).catch(function () {});
            }
        } catch (err) {}
    });

    console.info('[SokoHai] Identity layer tayari — rekodi zinaandikwa kwa jina la mwanachama.');
})();

/* ============================================================================
   BANNER + PROFILE SYNC  (§5, §17, §18, §19, §20)
   ----------------------------------------------------------------------------
   Mwanachama akiwa ameingia, kila sehemu ya UI ionyeshe JINA NA PICHA YAKE.
   Banner inaeleza wazi kuwa ni kipindi cha msaada — lakini account ni yake.
   ============================================================================ */
(function () {
    'use strict';
    var skh = window.skh || {};

    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''; }
    function esc(s) { return (window.skh && skh.skhEscape) ? skh.skhEscape(String(s == null ? '' : s)) : String(s == null ? '' : s); }

    /** Sasisha kila sehemu inayoonyesha jina/picha ya mtumiaji (§17, §19) */
    window.skhRefreshProfileUi = function () {
        var u = skh.currentUser || {};
        var d = skh.currentUserData || {};
        var name = d.fullName || u.displayName || 'Mtumiaji';
        var photo = d.photoURL || u.photoURL ||
            ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) +
             '&background=1268A8&color=ffffff');

        // Majina popote
        ['sidebarUserName', 'profileName', 'userDisplayName', 'chatMyName'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.textContent = name;
        });
        // Picha popote
        ['searchProfilePic', 'sidebarUserPic', 'profilePic', 'userDp'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.tagName === 'IMG') el.src = photo;
        });
        // Simu (mwanachama hana email — simu ndiyo utambulisho §16)
        var ph = document.getElementById('profilePhone');
        if (ph) ph.textContent = d.phone || d.phoneNumber || u.phoneNumber || '';
    };

    /** Banner: "Umeingia kama <mwanachama>" (§20)
        [IDENTITY-FIX BUG-04 2026-09-16] Chanzo cha banner ni KIMOA:
        31-agent-assist ina banner yake kamili (#skhAssistBanner — PIN + TOKA).
        Hii ni fallback tu — isipigane nayo wala iidanice. */
    function paintBanner() {
        var old = document.getElementById('skhMemberBanner');
        if (!window.skhIsAssisted || !window.skhIsAssisted()) { if (old) old.remove(); return; }
        if (document.getElementById('skhAssistBanner')) { if (old) old.remove(); return; }
        if (old) return;

        var u = skh.currentUser || {};
        var agent = (window.skhActingAgent && window.skhActingAgent()) || {};
        var b = document.createElement('div');
        b.id = 'skhMemberBanner';
        b.className = 'mb-banner';
        b.innerHTML =
            '<div class="mb-left">' + ico('user', 15) +
              '<div><b>' + esc(u.displayName || 'Mwanachama') + '</b>' +
              '<small>Akaunti yako &middot; msaada wa wakala</small></div>' +
            '</div>' +
            '<button type="button" class="mb-exit" id="skhMemberExit">Toka</button>';
        document.body.appendChild(b);
        document.body.classList.add('mb-on');
        b.querySelector('#skhMemberExit').addEventListener('click', async function () {
            // [IDENTITY-FIX BUG-04] skhConfirm HAIPO kwenye mfumo huu (grep proof) —
            // fallback kwa native confirm(), usivunjshe kitu.
            var msg = 'Unataka kutoka kwenye akaunti ya ' +
                (u.displayName || 'mwanachama') + ' na kurudi kwa wakala?';
            var ok = (typeof window.skhConfirm === 'function')
                ? await window.skhConfirm(msg, { title: 'Toka', okText: 'Ndiyo, toka', cancelText: 'Ghairi' })
                : window.confirm(msg);
            if (!ok) return;
            try { localStorage.removeItem('skh_assist_session'); } catch (e) {}
            try { sessionStorage.removeItem('skh_assist_session'); } catch (e) {}
            if (typeof window.skhIdentityRestore === 'function') window.skhIdentityRestore();
            if (typeof window.skhAssistLogout === 'function') { try { window.skhAssistLogout(); } catch (e) {} }
            skhToast('Umerudi kwenye akaunti ya wakala.', 'info', 2600);
        });
    }

    document.addEventListener('skh:identity-changed', function () {
        try { window.skhRefreshProfileUi(); } catch (e) {}
        setTimeout(paintBanner, 120);
        var old = document.getElementById('skhMemberBanner');
        if (old && (!window.skhIsAssisted || !window.skhIsAssisted())) {
            old.remove(); document.body.classList.remove('mb-on');
        }
    });

    setTimeout(paintBanner, 2500);
})();

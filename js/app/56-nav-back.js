/* ============================================================================
   SOKOHAI — UNIVERSAL BACK / CLOSE
   ----------------------------------------------------------------------------
   TATIZO LILILOPIMWA:
     Screens 22 hazikuwa na njia yoyote ya kurudi nyuma. Mtumiaji akiingia
     alikwama — hasa: mySokoHaiModal, sellerProfileModal, deliveriesModal,
     tripsModal, savedItemsModal, shopLedgerModal, procurementModal,
     industrialProjectModal, shopSetupModal, stockTransferModal,
     sokopayDepositModal, unifiedTokenCenterModal, logisticsTokenModal,
     ratingModal, deliveryChoiceModal, offlineStockModal, chatForward/Attach,
     buyerView, loginForm, signupForm.

     Pia dashboards za ndani (admin, wakala) hubadilisha maudhui ya
     `#richDashboardContainer` bila historia — huwezi kurudi ulikotoka.

   SULUHISHO (mfumo MMOJA, si kuhariri screens 22):
     1. Rundo (stack) la kuvinjari — kila kufungua kunasukuma, kurudi kunatoa.
     2. Kitufe cha nyuma kinaingizwa KIOTOMATIKI kwenye screen isiyo nayo.
     3. Kitufe cha nyuma cha simu (hardware/gesture) kinafanya kazi.
     4. Esc inafunga.
     5. Dashboards za ndani zinapata historia yao.

   HAIVUNJI: `closeModals()` iliyopo inaendelea kufanya kazi kama ilivyo.
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    var stack = [];                 // [{ type, id, restore }]
    var MAX = 20;

    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 18) : ''; }
    function byId(id) { return document.getElementById(id); }

    function isOpen(el) {
        if (!el) return false;
        var cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' &&
               el.getBoundingClientRect().height > 0;
    }

    /* ========================================================================
       1) KITUFE CHA NYUMA — kinaingizwa kwenye screen isiyo nayo
       ======================================================================== */
    /* [FIX 2026-09-15] Kitufe kilikuwa kimeenea kupita kiasi.
       Kipimo kilionyesha modals 12 kati ya 21 TAYARI zilikuwa na kitufe chao
       cha kufunga — changu kikawa cha ziada.

       Sasa ukaguzi ni MKALI: tunatafuta kitufe chochote kinachofunga, hata
       kikiwa kimefichwa kwa muda au kina ikoni pekee (bila maandishi). */
    function hasCloseControl(el) {
        var cands = el.querySelectorAll(
            'button,[onclick],[role="button"],[class*="close"],[class*="back"],' +
            '[class*="Close"],[class*="dismiss"],[aria-label]');
        for (var i = 0; i < cands.length; i++) {
            var b = cands[i];
            if (b.closest('.skh-backbar')) continue;          // usihesabu changu
            var probe = (b.getAttribute('onclick') || '') + ' ' +
                        (b.className || '') + ' ' +
                        (b.getAttribute('aria-label') || '') + ' ' +
                        (b.getAttribute('title') || '') + ' ' +
                        (b.id || '');
            if (/close|funga|back|rudi|dismiss|cancel|ghairi|history\.back|skhBack|X$/i.test(probe)) return true;
            /* Modals nyingi hufunga kwa: getElementById('x').style.display='none'
               — hakuna neno "close" popote, lakini ni kitufe cha kufunga. */
            if (/style\.display\s*=\s*['"]none['"]/.test(probe)) return true;
            // Kitufe chenye herufi ya kufunga pekee
            var t = (b.textContent || '').trim();
            if (t === '\u00d7' || t === 'X' || t === 'x' || t === '\u2715' || t === '\u2716') return true;
        }
        return false;
    }

    /* [FIX 2026-09-15] Tenganisha mambo MAWILI tofauti:

       NO_BACKBTN — usiongeze kitufe changu (tayari zina chao).
                    LAKINI bado zinafuatiliwa na rundo, ili `closeModals()`
                    ijue kufunga HATUA MOJA badala ya zote.

       SKIP_TRACK — si overlay kabisa (kurasa za kawaida). Zisiguswe. */
    var NO_BACKBTN = {
        authModal: 1,          // ina njia zake za kufunga/kubadilisha
        productModal: 1,       // ina pm-close
        chatModal: 1,          // ina back yake ya inbox
        chatListModal: 1,
        cartModal: 1,
        notifModal: 1,
        categoryModal: 1,
        modeMenuModal: 1,
        checkoutModal: 1
    };
    var SKIP_TRACK = { buyerView: 1, sellerView: 1, mainFeed: 1, homeView: 1, appRoot: 1 };
    var NO_BACK = NO_BACKBTN;   // utangamano wa nyuma

    function injectBack(el) {
        if (!el || el.querySelector(':scope > .skh-backbar')) return;
        if (NO_BACKBTN[el.id]) return;            // tayari ina kitufe chake
        if (hasCloseControl(el)) return;          // tayari ina yake

        var bar = document.createElement('div');
        bar.className = 'skh-backbar';
        bar.innerHTML =
            '<button type="button" class="skh-backbtn" aria-label="Rudi nyuma">' +
                ico('arrow-left', 18) + '<span>Rudi</span>' +
            '</button>' +
            '<button type="button" class="skh-closebtn" aria-label="Funga">' + ico('x', 18) + '</button>';
        bar.querySelector('.skh-backbtn').addEventListener('click', function (e) {
            e.stopPropagation(); window.skhBack();
        });
        bar.querySelector('.skh-closebtn').addEventListener('click', function (e) {
            e.stopPropagation(); window.skhCloseTop();
        });
        el.insertBefore(bar, el.firstChild);
    }

    /* ========================================================================
       2) RUNDO LA KUVINJARI
       ======================================================================== */
    function push(entry) {
        /* [FIX 2026-09-15] Rundo lilikuwa linajaa sehemu za uongo (8 kwa
           modals 2) kwa sababu `scan()` husukuma kila inapopita, na
           MutationObserver hupiga mara kadhaa kwa mabadiliko yale yale.
           Sasa: kila kipengele kinakuwa kwenye rundo MARA MOJA tu. */
        for (var i = 0; i < stack.length; i++) {
            if (stack[i].type === entry.type && stack[i].id === entry.id) {
                // [FIX 2026-09-20] Modal iliyofunguliwa TENA juu ya nyingine (mf. kadi ndani ya duka
                // iliyokuwa tayari kwenye rundo) lazima ihamie JUU ya rundo — vinginevyo X/Back
                // inafunga duka badala ya kadi. Hali ya kawaida (bila raise) haibadiliki.
                if (entry.raise && i !== stack.length - 1) stack.push(stack.splice(i, 1)[0]);
                return;
            }
        }
        stack.push(entry);
        if (stack.length > MAX) stack.shift();
        syncHistory();
    }

    /** Ondoa kwenye rundo vilivyokwisha fungwa (usafi) */
    function prune() {
        stack = stack.filter(function (e) {
            if (e.type !== 'modal') return true;
            var el = byId(e.id);
            return el && isOpen(el);
        });
    }
    function syncHistory() {
        try {
            if (stack.length) history.pushState({ skhDepth: stack.length }, '');
        } catch (e) {}
    }

    window.skhNavPush = push;
    window.skhNavDepth = function () { return stack.length; };

    /** Funga kilicho juu pekee */
    window.skhCloseTop = function () {
        prune();
        var top = stack.pop();
        if (!top) { fallbackClose(); return; }
        try {
            if (typeof top.restore === 'function') top.restore();
            else if (top.type === 'modal') {
                var el = byId(top.id);
                if (el) el.style.display = 'none';
            }
        } catch (e) { console.warn('[nav-back]', e); }
        if (!stack.length) document.body.style.overflow = 'auto';
    };

    /** Rudi nyuma: funga kilicho juu, kisha onyesha kilichokuwa chini */
    window.skhBack = function () {
        if (stack.length) { window.skhCloseTop(); return true; }
        fallbackClose();
        return false;
    };

    function fallbackClose() {
        // Hakuna rundo: funga chochote kilicho wazi (tabia ya zamani)
        var open = [];
        document.querySelectorAll('.overlay-menu,[id$="Modal"],[id$="Form"]').forEach(function (el) {
            if (isOpen(el)) open.push(el);
        });
        if (open.length) {
            // funga cha mwisho (chenye z-index kubwa / cha karibuni)
            open.sort(function (a, b) {
                return (parseInt(getComputedStyle(a).zIndex, 10) || 0) -
                       (parseInt(getComputedStyle(b).zIndex, 10) || 0);
            });
            open[open.length - 1].style.display = 'none';
            document.body.style.overflow = 'auto';
            return;
        }
        if (typeof window.closeModals === 'function') window.closeModals();
    }

    /* ========================================================================
       3) TAMBUA SCREEN INAPOFUNGUKA (bila kuhariri kila mahali)
       ======================================================================== */
    function watchOpen(el) {
        if (!el || el.__skhBackWatched) return;
        el.__skhBackWatched = true;
        var obs = new MutationObserver(function () {
            if (!isOpen(el) || !isRealOverlay(el)) return;
            /* [FIX 2026-09-15] Rundo lazima lijue KILA overlay iliyo wazi —
               hata zenye vitufe vyao. Vinginevyo `closeModals()` haiwezi
               kujua ipi ifunge, na inarudi kufunga vyote (-> Home).
               Kitufe cha "Rudi" huongezwa TU kwa zisizo nacho. */
            injectBack(el);
            push({ type: 'modal', id: el.id, restore: function () { el.style.display = 'none'; } });
        });
        obs.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    /* [FIX 2026-09-15] Kitufe cha "Rudi" kilikuwa kinaingia hata kwenye
       maeneo YASIYO modal (mf. buyerView — ukurasa wa Home). Sasa tunaweka
       tu kwenye OVERLAY ZA KWELI: zinazoelea juu (fixed/absolute) au zenye
       darasa la overlay. Ukurasa wa kawaida hauguswi. */
    var SKIP_IDS = SKIP_TRACK;

    function isRealOverlay(el) {
        if (!el || !el.id || SKIP_IDS[el.id]) return false;
        if (el.classList.contains('overlay-menu')) return true;
        var cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
        var z = parseInt(cs.zIndex, 10) || 0;
        return z >= 100;                      // inaelea juu ya maudhui
    }

    function scan() {
        document.querySelectorAll('.overlay-menu,[id$="Modal"],[id$="Form"]').forEach(function (el) {
            if (!el.id || SKIP_IDS[el.id]) return;
            watchOpen(el);                       // fuatilia ZOTE (kwa rundo)
            if (isOpen(el) && isRealOverlay(el)) {
                injectBack(el);                  // kitufe kwa zisizo nacho pekee
                push({ type: 'modal', id: el.id,
                       restore: function () { el.style.display = 'none'; } });
            }
        });
    }

    /* ========================================================================
       4) DASHBOARDS ZA NDANI (admin, wakala, POS…) — historia yao
       ------------------------------------------------------------------------
       Hizi hubadilisha `#richDashboardContainer` bila kuacha njia ya kurudi.
       Tunahifadhi maudhui ya awali ili "Rudi" iyarudishe.
       ======================================================================== */
    var DASH = 'richDashboardContainer';

    window.skhDashPush = function (label) {
        var c = byId(DASH);
        if (!c) return;
        var snapshot = c.innerHTML;
        push({
            type: 'dash', id: label || 'dash',
            restore: function () {
                var host = byId(DASH);
                if (host) { host.innerHTML = snapshot; injectDashBack(); }
            }
        });
    };

    function injectDashBack() {
        var c = byId(DASH);
        if (!c || !c.children.length) return;
        if (c.querySelector(':scope > .skh-backbar')) return;
        // Ongeza tu ikiwa kuna mahali pa kurudi
        var hasDash = stack.some(function (s) { return s.type === 'dash'; });
        if (!hasDash) return;
        var bar = document.createElement('div');
        bar.className = 'skh-backbar skh-backbar--inline';
        bar.innerHTML = '<button type="button" class="skh-backbtn" aria-label="Rudi nyuma">' +
                        ico('arrow-left', 16) + '<span>Rudi</span></button>';
        bar.querySelector('.skh-backbtn').addEventListener('click', function () { window.skhBack(); });
        c.insertBefore(bar, c.firstChild);
    }

    // Funika renderers za dashboard ili zihifadhi historia kiotomatiki
    function hookDash() {
        ['skhAssistMembersView', 'skhAssistActivityView', 'skhAssistRegisterView',
         'skhAssistLoginView', 'loadAdminDashboard', 'loadAgentDashboard',
         'skhRenderMyProducts', 'renderSellerOrders'].forEach(function (fname) {
            var fn = window[fname];
            if (typeof fn !== 'function' || fn.__skhBack) return;
            var wrapped = function () {
                try { window.skhDashPush(fname); } catch (e) {}
                var r = fn.apply(this, arguments);
                setTimeout(injectDashBack, 220);
                return r;
            };
            wrapped.__skhBack = true;
            window[fname] = wrapped;
        });
    }

    /* ========================================================================
       5) KITUFE CHA NYUMA CHA SIMU + ESC
       ======================================================================== */
    window.addEventListener('popstate', function () {
        if (stack.length) { window.skhCloseTop(); syncHistory(); }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && stack.length) { e.preventDefault(); window.skhBack(); }
    });

    /* ========================================================================
       6) OANISHA NA closeModals() ILIYOPO
       ======================================================================== */
    /* ========================================================================
       [FIX 2026-09-15] CHANZO HALISI CHA "BACK INARUKA HOME"
       ------------------------------------------------------------------------
       Uchunguzi: vitufe 25 vya "Rudi/Back" kwenye index.html vinaita
       `closeModals()`. Lakini `closeModals()` hufunga KILA overlay kwa mkupuo:

           document.querySelectorAll('.overlay-menu').forEach(ov => display='none')

       Kwa hiyo ukiwa:  Bidhaa -> Tangazo -> Muuzaji -> Chat
       na ukabonyeza "Rudi", vyote vinafungwa kwa pamoja -> unaishia HOME.

       SULUHISHO (§22, §30, §34): `closeModals()` sasa ni MWENYE AKILI —
       ikiwa kuna rundo la kuvinjari, inafunga HATUA MOJA tu na kuacha
       iliyokuwa chini yake wazi. Ikiwa hakuna rundo (au mtu anataka kufunga
       kila kitu kwa makusudi), inafanya kama zamani.

       `closeModals(true)` au `skhCloseAll()` = funga vyote (tabia ya zamani).
       ======================================================================== */
    function hookCloseModals() {
        var orig = window.closeModals;
        if (typeof orig !== 'function' || orig.__skhBack) return;

        window.skhCloseAll = function () {
            stack = [];
            return orig.apply(window, []);
        };

        var wrapped = function (closeEverything) {
            // Kufunga kwa makusudi (logout, baada ya kulipa, n.k.)
            if (closeEverything === true) { stack = []; return orig.apply(this, []); }
            prune();

            // Rundo lina zaidi ya moja -> funga HATUA MOJA (§22)
            if (stack.length > 1) {
                window.skhCloseTop();
                return;
            }
            // Kipengele kimoja tu kiko wazi -> kifunge, rundo liishe
            if (stack.length === 1) {
                window.skhCloseTop();
                return;
            }
            // Hakuna rundo -> tabia ya zamani
            return orig.apply(this, arguments);
        };
        wrapped.__skhBack = true;
        wrapped.__raw = orig;
        window.closeModals = wrapped;
    }

    /* [PERF 2026-09-21] scan() hupitia overlays zote + getComputedStyle —
       batch mutations za frame moja kuwa scan MOJA (badala ya kila mabadiliko). */
    var __scanQueued = false;
    function queueScan() {
        if (__scanQueued) return;
        __scanQueued = true;
        try {
            Promise.resolve().then(function () {
                __scanQueued = false;
                try { scan(); hookDash(); } catch (e) {}
            });
        } catch (e) { __scanQueued = false; try { scan(); hookDash(); } catch (e2) {} }
    }
    function start() {
        scan(); hookDash(); hookCloseModals();
        try {
            new MutationObserver(queueScan)
                .observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    setTimeout(start, 1500);
    setTimeout(start, 4000);
})();

/* ============================================================================
   SOKOHAI — IDENTITY GUARD (Offline Member ownership)  §3, §21, §22, §23
   ----------------------------------------------------------------------------
   Kanuni: profile inayoonyeshwa ni ya MWANACHAMA ALIYEINGIA, si ya wakala.
   Wakala anaonekana kama "Umesajiliwa kupitia" (metadata) pekee.
   ============================================================================ */
(function () {
    'use strict';
    var skh = window.skh || {};

    /** skhWhoAmI() — chanzo kimoja cha utambulisho wa mtumiaji wa sasa */
    window.skhWhoAmI = function () {
        var s = window.skh || {};
        var u = s.currentUser || {};
        var d = s.currentUserData || s.currentUserProfile || {};

        // Kikao cha wakala (assisted): mwanachama ndiye "mimi" kwa maonyesho
        var assisted = null;
        try {
            // [§20 TEST A] Session ya mwanachama ni localStorage sasa; fallback ya sessionStorage.
            var raw = localStorage.getItem('skh_assist_session') || sessionStorage.getItem('skh_assist_session');
            if (raw) assisted = JSON.parse(raw);
        } catch (e) {}
        if (!assisted && s.assistedMember) assisted = { member: s.assistedMember };

        var m = (assisted && (assisted.member || assisted)) || null;
        if (m && (m.uid || m.memberUid)) {
            return {
                userId: m.uid || m.memberUid,
                name: m.fullName || m.memberName || 'Mwanachama',
                phone: m.phone || m.phoneNumber || null,
                email: null,                                   // §5 — hakuna email ya uongo
                accountType: 'offline_member',
                isAssisted: true,
                registeredThroughAgentId: (assisted && assisted.agentId) || null
            };
        }
        return {
            userId: u.uid || null,
            name: d.fullName || u.displayName || (u.email || '').split('@')[0] || 'Mtumiaji',
            phone: d.phone || d.phoneNumber || u.phoneNumber || null,
            // Ficha identifier ya ndani (offline_*@sokohai.internal) — si email ya kweli §5
            email: (d.email && !/@sokohai\.(internal|com)$/.test(d.email)) ? d.email : null,
            accountType: d.accountType || (d.isOfflineUser ? 'offline_member' : 'standard'),
            isAssisted: false,
            registeredThroughAgentId: d.registeredThroughAgentId || d.createdByAgentId || d.managedByAgentUid || null
        };
    };

    /** Jina la kuonyesha — KAMWE lisiwe la wakala (§3) */
    window.skhDisplayName = function () { return window.skhWhoAmI().name; };

    /** Mstari wa "Umesajiliwa kupitia" (§2, §23) — metadata, si umiliki */
    window.skhAgentRefLine = function () {
        var me = window.skhWhoAmI();
        if (!me.registeredThroughAgentId) return '';
        return '<div class="skh-agentref">' +
               (window.skhNavIcon ? window.skhNavIcon('user', 12) : '') +
               ' Umesajiliwa kupitia wakala</div>';
    };

    /** Mmiliki sahihi wa rasilimali mpya (§22) — KAMWE agentId */
    window.skhOwnerId = function () {
        var me = window.skhWhoAmI();
        return me.userId;
    };
})();

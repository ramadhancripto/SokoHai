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
        /* [FIX 2026-11-04] BAR ILIKUWA INAVUNJA SKRINI NZIMA.
           Kipimo halisi: `css/46-fullscreen-pages.css` ina
           `html body #sellerProfileModal > * { height:100% !important }`
           — bar (mtoto wa kwanza) ikawa panel nyeupe 1440x900 na DUKA LA MUUZAJI
           likaonekana tupu, kitufe cha "Rudi" na "✕" pekee.
           Suluhisho: jiometri inawekwa INLINE kwa `!important` — inashinda sheria
           yoyote ya CSS (hata ile yenye ID) na bar inaelea juu ya maudhui. */
        var FS = {
            position: 'absolute', top: '10px', left: '10px', right: 'auto',
            width: 'auto', height: 'auto', 'max-height': 'none', 'min-height': '0',
            display: 'inline-flex', 'align-items': 'center', 'justify-content': 'flex-start',
            gap: '8px', padding: '0', margin: '0',
            background: 'transparent', border: '0', 'box-shadow': 'none',
            'backdrop-filter': 'none', '-webkit-backdrop-filter': 'none', 'z-index': '60'
        };
        Object.keys(FS).forEach(function (k) { bar.style.setProperty(k, FS[k], 'important'); });
        Array.prototype.forEach.call(bar.querySelectorAll('button'), function (btn) {
            btn.style.setProperty('background', '#fff', 'important');
            btn.style.setProperty('box-shadow', '0 2px 10px rgba(15,23,42,.18)', 'important');
        });
        el.insertBefore(bar, el.firstChild);

        /* Skrini nyingine (mf. Duka la muuzaji) huunda kitufe chao cha kufunga kwa
           kuchelewa — kikionekana, bar ya kiotomatiki inaondolewa kabisa. */
        [900, 2000, 4000, 6000].forEach(function (ms) {
            setTimeout(function () {
                try {
                    /* [FIX 2026-11-04] Ondoa KABISA (si kuficha kwa class): jiometri
                       ya bar imewekwa inline kwa !important, hivyo `display:none`
                       ya CSS isingeshinda. */
                    if (bar.parentNode && hasCloseControl(el)) {
                        if (window.__skhDebugBack) console.log('[nav-back] naondoa bar ya kiotomatiki:', el.id);
                        bar.remove();
                    }
                } catch (e) {}
            }, ms);
        });
    }

    /* ========================================================================
       2) RUNDO LA KUVINJARI
       ======================================================================== */
    /* [NAV 2026-11-13] MFUMO MMOJA WA HISTORIA (rundo hili + history ya browser).
       Chanzo cha tatizo "nabonyeza, ukurasa hauonekani mpaka nirudi nyuma":
         a) kila overlay ilisukuma `history.pushState` lakini kufunga kwa X/Esc/tab
            hakukuigusa — historia ilijaa hatua zilizokufa, Back ya simu "haikufanya
            kitu" mara kadhaa;
         b) popstate ilisukuma tena hatua mpya (syncHistory) na kuharibu Forward;
         c) tabs (Home/Bidhaa/Huduma/Usafiri) hazikuwa kwenye historia kabisa;
         d) fomu ndani ya #plusMenu zilifungwa peke yake, backdrop tupu ikabaki juu;
         e) overlay iliyofungwa ili kufungua nyingine (kikapu -> malipo, bidhaa -> chat)
            ilipotea — kufunga ya juu hakukurudisha uliyotoka.
       Sasa kila hatua ya historia ina hali yake: { tab, ov:[overlays zilizo wazi] }.
       Back/Forward inalinganisha hali hiyo na kilicho kwenye skrini (reconcile);
       hatua isiyobadilisha chochote inarukwa. Hakuna router mpya — ni rundo hili hili. */
    var H = { i: 0, tab: 'home', restoring: 0, lastClosed: null, disp: {}, closedAt: {}, intent: 0 };
    var REOPEN = { productModal: 1, cartModal: 1, chatListModal: 1, sellerProfileModal: 1,
                   notifModal: 1, savedItemsModal: 1, buyerOrdersModal: 1, categoryModal: 1,
                   // [NAV 2026-11-14] own profile / My SokoHai: Back from a screen opened there returns to it
                   myProfileModal: 1, mySokoHaiModal: 1 };
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}

    function key(e) { return (e.type === 'modal' ? '' : e.type + ':') + e.id; }
    function live(e) { return e.type !== 'modal' || e.under || isOpen(byId(e.id)); }
    function snapshot() { return stack.filter(live).map(function (e) { return (e.under ? '~' : '') + key(e); }); }
    function navState() { return { skhNav: 1, i: H.i, tab: H.tab, ov: snapshot(), sy: Math.round(window.scrollY || 0) }; }
    function baseState() { var s = history.state; return (s && typeof s === 'object') ? s : {}; }
    /* [NAV] URL ya hatua: `#/product/{id}` ibaki TU pale ukurasa wa bidhaa uko wazi. Zamani
       hash hii ilirithiwa na kila hatua iliyofuata; Back/Forward ilipobadilisha URL,
       `hashchange` (deep-link ya 07-product) ilifungua bidhaa tena juu ya Home/Huduma. */
    function urlFor(st) {
        var h = location.hash || '';
        if (/^#\/?product\//.test(h) && (st.ov || []).indexOf('productModal') === -1) return location.pathname + location.search;
        return undefined;
    }
    function writeState(push) {
        try {
            if (push && !H.restoring) {
                // hifadhi scroll ya ukurasa uliopo kabla ya kusogea mbele
                var href = location.href, cur = baseState();
                if (cur.skhNav) {
                    if (!(cur.ov || []).length) cur = Object.assign({}, cur, { sy: Math.round(window.scrollY || 0) });
                    history.replaceState(cur, '', urlFor(cur));          // hatua ya chini isibebe #/product
                }
                H.i++; var ns = navState();
                history.pushState(ns, '', urlFor(ns) || href);
            } else {
                var keep = baseState().sy, st = navState();
                if (stack.length && keep != null) st.sy = keep;
                history.replaceState(st, '', urlFor(st));
            }
        } catch (e) {}
    }
    function syncHistory() { writeState(false); }
    function userIntent() { return Date.now() - (H.intent || 0) < 900; }

    /* [NAV] Mbio za async: kufungua kwingi ni async (mf. chat inavuta mazungumzo kwanza) na
       mwishoni huweka `display:flex` TENA. Mtumiaji akishabonyeza Back/tab/X kabla haijamaliza,
       overlay ilirudi juu "yenyewe". Ikifunguka tena bila mtumiaji kugusa chochote baada ya
       kuifunga (sekunde 1.5), inafichwa tena. */
    function staleReopen(id) {
        var t = H.closedAt[id];
        return !!t && Date.now() - t < 1500 && (H.intent || 0) <= t;
    }
    // tu kufunga kwa Back/Forward, Esc au tab — si closeModals() ya ndani ya mtiririko wa
    // kufungua (mf. chat: onyesha -> closeModals() -> onyesha tena), hiyo ni halali.
    function markClosed(id) {
        if (!id || !(H.restoring || H.navClosing)) return;
        H.closedAt[id] = Date.now();
        if (id === 'chatModal' && typeof window.skhChatCancelPendingOpen === 'function') { try { window.skhChatCancelPendingOpen(); } catch (e) {} }
    }
    window.skhNavClosing = function (on) { H.navClosing = !!on; };
    function push(entry) {
        if (entry.type === 'modal' && staleReopen(entry.id)) {
            var se = byId(entry.id);
            if (se) { se.style.display = 'none'; if (se.classList) se.classList.remove('open'); }
            settle();
            return;
        }
        /* [FIX 2026-09-15] Kila kipengele kinakuwa kwenye rundo MARA MOJA tu. */
        for (var i = 0; i < stack.length; i++) {
            if (stack[i].type === entry.type && stack[i].id === entry.id) {
                // [FIX 2026-09-20] Modal iliyofunguliwa TENA juu ya nyingine ihamie JUU ya rundo.
                if (entry.raise && i !== stack.length - 1) { stack.push(stack.splice(i, 1)[0]); writeState(false); }
                if (stack[i] && stack[i].under && entry.type === 'modal') { stack[i].under = false; writeState(false); }
                return;
            }
        }
        /* [NAV] Overlay hii imefunguka mara tu baada ya kufunga nyingine kwa closeModals()
           (mf. kikapu -> malipo, ukurasa wa huduma -> fomu ya ombi). Ile ya awali inabaki
           CHINI yake (imefichwa), na kufunga hii kunairudisha. */
        /* [NAV] Overlay iliyofichwa moja kwa moja ili hii ifunguke (mf. inbox -> mazungumzo
           kupitia 81 showOnly) — nayo inabaki chini, haipotei. */
        if (entry.type === 'modal' && userIntent()) {
            var shownNow = baseState().ov || [];
            stack.forEach(function (e) {
                if (e.type === 'modal' && !e.under && e.id !== entry.id && REOPEN[e.id] && shownNow.indexOf(e.id) !== -1 && !isOpen(byId(e.id))) {
                    e.under = true; e.display = H.disp[e.id] || 'flex';
                }
            });
        }
        var lc = H.lastClosed; H.lastClosed = null;
        if (lc && entry.type === 'modal' && lc.entry.id !== entry.id && Date.now() - lc.at < 500 && lc.intent && REOPEN[lc.entry.id]) {
            var el0 = byId(lc.entry.id);
            if (el0 && !isOpen(el0)) {
                lc.entry.under = true; lc.entry.display = lc.display;
                stack.push(lc.entry);
                writeState(false);        // hatua ya sasa inaonyesha tena overlay ya awali
            }
        }
        if (entry.type === 'modal') { var el = byId(entry.id); if (el && el.style.display && el.style.display !== 'none') H.disp[entry.id] = el.style.display; }
        /* [NAV 2026-11-14] The account menu (drawer) closes when you go somewhere from it, for EVERY
           destination, and Back does not reopen it (mobile drawer pattern). Before, it depended on the
           destination: product/Live/notifications stayed above an open drawer (Back -> drawer again),
           cart/orders closed it (Back -> page). */
        if (entry.type === 'modal' && entry.id !== 'sidebarMenuModal' && entry.id !== 'authModal') {
            var di = -1; stack.forEach(function (e, i) { if (e.type === 'modal' && e.id === 'sidebarMenuModal') di = i; });
            if (di !== -1) {
                stack.splice(di, 1);
                var dm = byId('sidebarMenuModal'); if (dm && isOpen(dm)) { dm.style.display = 'none'; if (dm.classList) dm.classList.remove('open'); }
                try { var bs = baseState(); if (bs.skhNav) history.replaceState(Object.assign({}, bs, { ov: (bs.ov || []).filter(function (k) { return k !== 'sidebarMenuModal' && k !== '~sidebarMenuModal'; }) }), ''); } catch (e) {}
            }
        }
        stack.push(entry);
        if (stack.length > MAX) stack.shift();
        writeState(true);
    }

    /** Ondoa kwenye rundo vilivyokwisha fungwa (usafi) */
    function prune() {
        var before = stack.length;
        stack = stack.filter(function (e) {
            if (e.mini && e.under) return !!byId('lvxMini');          // mini player closed by the user -> forget the room
            if (e.type !== 'modal' || e.under) return true;
            var el = byId(e.id);
            return el && isOpen(el);
        });
        // overlay iliyofunikwa ambayo ile iliyoifunika imeshafungwa — irudishe
        reveal();
        return before !== stack.length;
    }
    /* [NAV] Host kama #plusMenu ambayo fomu yake imefungwa haina chochote kinachoonekana:
       ni backdrop tupu inayozuia kugusa. Ifunge pamoja na fomu. */
    var HOSTS = { plusMenu: 1 };          // overlays ambazo ni "fremu" ya fomu nyingine tu
    function isEmptyHost(el) {
        if (!el || !HOSTS[el.id] || !isOpen(el)) return false;
        var kids = el.children, n = 0;
        for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            if (k.classList && k.classList.contains('skh-backbar')) continue;
            if (k.tagName === 'SCRIPT' || k.tagName === 'STYLE') continue;
            if (isOpen(k)) n++;
        }
        return n === 0;
    }
    function reveal() {
        var top = stack[stack.length - 1];
        if (top && top.under && top.mini) {
            top.under = false; top.mini = false;
            if (byId('lvxMini') && typeof window.skhLiveMiniRestore === 'function') { try { window.skhLiveMiniRestore(); } catch (e) {} }
            else stack.pop();
            return;
        }
        if (top && top.under) {
            var el = byId(top.id);
            top.under = false;
            if (el && !isOpen(el)) el.style.display = top.display || H.disp[top.id] || 'flex';
            if (el) try { window.skhBringToFront && window.skhBringToFront(el); } catch (e) {}
        }
    }
    function closeEmptyHosts() {
        for (var guard = 0; guard < 5; guard++) {
            var top = stack[stack.length - 1];
            if (!top || top.type !== 'modal') break;
            var el = byId(top.id);
            if (!isEmptyHost(el)) break;
            stack.pop();
            try { el.style.display = 'none'; } catch (e) {}
        }
        // host isiyo juu ya rundo lakini tupu (mf. plusMenu baada ya fomu kufungwa nje ya rundo)
        var pm = byId('plusMenu');
        if (pm && isEmptyHost(pm) && !stack.some(function (e) { return e.id === 'plusMenu'; })) pm.style.display = 'none';
    }
    /* [NAV] Hakuna overlay iliyo wazi -> ondoa vizuizi vya scroll vilivyobaki. */
    function settle() {
        closeEmptyHosts();
        var anyOpen = stack.some(function (e) { return e.type === 'modal' && !e.under && isOpen(byId(e.id)); });
        if (!anyOpen) {
            if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
            ['lvx-open', 'gsg-open', 'mas-open'].forEach(function (c) {
                if (!document.body.classList.contains(c)) return;
                var still = c === 'lvx-open' ? document.querySelector('.lvx-overlay:not([hidden])') : null;
                if (!still) document.body.classList.remove(c);
            });
        }
    }
    window.skhNavSettle = settle;
    /* [NAV 2026-11-14] A screen opened from the Live room shrinks the room to the mini player (the
       session keeps running; 81-absolute-one-ui-live). The room stays on the stack UNDER the new
       screen, so Back brings the full room back instead of leaving the page with a floating mini
       player. If the user closes the mini player, prune() forgets the room. */
    window.skhNavMarkRoomUnder = function () {
        stack.forEach(function (e) { if (e.type === 'modal' && e.id === 'lvxRoom' && !e.under) { e.under = true; e.mini = true; } });
    };


    window.skhNavPush = push;
    window.skhNavDepth = function () { return stack.length; };
    window.skhNavRestoring = function () { return H.restoring > 0; };
    window.skhNavState = function () { return { i: H.i, tab: H.tab, ov: snapshot() }; };

    /** Funga kilicho juu pekee */
    window.skhCloseTop = function () {
        prune();
        var top = stack.pop();
        if (!top) { fallbackClose(); settle(); return; }
        var el = top.type === 'modal' ? byId(top.id) : null;
        if (top.type === 'modal') markClosed(top.id);
        var disp = el && el.style.display && el.style.display !== 'none' ? el.style.display : (H.disp[top.id] || 'flex');
        try {
            if (typeof top.restore === 'function') top.restore();
            else if (top.type === 'modal') {
                if (el) el.style.display = 'none';
            }
        } catch (e) { console.warn('[nav-back]', e); }
        if (!H.restoring && top.type === 'modal') H.lastClosed = { entry: { type: 'modal', id: top.id, restore: top.restore }, at: Date.now(), display: disp, intent: userIntent() };
        reveal();
        settle();
        if (!stack.length) document.body.style.overflow = 'auto';
        if (!H.restoring) writeState(false);
    };

    /** Rudi nyuma: funga kilicho juu, kisha onyesha kilichokuwa chini */
    window.skhBack = function () {
        if (stack.length) { window.skhCloseTop(); return true; }
        fallbackClose();
        settle();
        return false;
    };

    /** [NAV] Tab ya ukurasa mkuu imebadilika (updateApp) — hatua mpya ya historia. */
    window.skhNavBuyerTab = function () { return H.buyerTab || 'home'; };
    window.skhNavTab = function (mode) {
        mode = mode || 'home';
        if (mode.indexOf('mode:') !== 0) H.buyerTab = mode;
        if (H.restoring) { H.tab = mode; return; }
        var cur = baseState();
        var same = (mode === H.tab) && !((cur.ov || []).length);
        H.tab = mode;
        writeState(!same);
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
    /* [NAV-LIVE 2026-11-14] Skrini za Live (.lvx-overlay: Live hub, chumba cha live, mnada,
       zabuni zangu…) hazikuwa kwenye rundo wala historia: zilifunguka NYUMA ya bidhaa/chat
       (z-index 7400) na Back ilitoka nje ya app. Sasa ni overlays za kawaida za rundo hili;
       kuzifunga kwa Back kunatumia njia yao halali (skhLiveClose -> inaondoka chumbani). */
    var OV_SEL = '.overlay-menu,[id$="Modal"],[id$="Form"],.lvx-overlay';
    function restoreFor(el) {
        if (el.classList && el.classList.contains('lvx-overlay')) {
            return function () {
                if (typeof window.skhLiveClose === 'function') window.skhLiveClose(el.id);
                else el.hidden = true;
            };
        }
        return function () { el.style.display = 'none'; };
    }
    window.skhNavRestoreFor = restoreFor;
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
            push({ type: 'modal', id: el.id, restore: restoreFor(el) });
        });
        obs.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
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
        document.querySelectorAll(OV_SEL).forEach(function (el) {
            if (!el.id || SKIP_IDS[el.id]) return;
            watchOpen(el);                       // fuatilia ZOTE (kwa rundo)
            if (isOpen(el) && isRealOverlay(el)) {
                injectBack(el);                  // kitufe kwa zisizo nacho pekee
                push({ type: 'modal', id: el.id, restore: restoreFor(el) });
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

    /* [2026-11-06] Business OS ina sidebar + historia yake (skhBOSNav/switchDashTab).
       Snapshot ya container nzima hapa ilirudisha HTML ya zamani na ikaongeza
       ukanda wa "Rudi" juu ya kichwa cha BOS (≈70px) kwenye simu. */
    function isBusinessOS(c) { return !!(c && c.querySelector('#bosSidebar')); }

    window.skhDashPush = function (label) {
        var c = byId(DASH);
        if (!c || isBusinessOS(c)) return;
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
        if (isBusinessOS(c)) {
            var stale = c.querySelector(':scope > .skh-backbar');
            if (stale) stale.remove();
            return;
        }
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
       ------------------------------------------------------------------------
       [NAV 2026-11-13] popstate inalinganisha hali ya hatua (tab + overlays) na
       skrini: inafunga zisizotakiwa, inarudisha tab, inafungua tena overlay
       iliyokuwa wazi (Forward / Back kwenda ukurasa uliofunikwa). Hatua isiyobadilisha
       chochote (iliyokufa) inarukwa kwa mwelekeo ule ule. Haisukumi hatua mpya.
       ======================================================================== */
    function applyState(s) {
        var want = (s.ov || []).slice(), changed = false;
        H.restoring++;
        // hashchange ya traversal hii isifungue bidhaa tena — reconcile hii ndiyo inaamua
        window.skhProductHashGuard = true;
        setTimeout(function () { window.skhProductHashGuard = false; }, 150);
        try {
            if (s.tab && s.tab !== H.tab) {
                H.tab = s.tab;
                if (s.tab.indexOf('mode:') === 0) {
                    // dashboard (Duka / Huduma Hub / Admin…) — kupitia switchMode yenye ukaguzi wake
                    if (typeof window.switchMode === 'function') window.switchMode(s.tab.slice(5));
                } else if (typeof window.updateApp === 'function') {
                    window.updateApp(s.tab);      // inafunga overlays zote + inarudisha Soko na tab
                }
                changed = true;
            }
            prune();
            /* [NAV 2026-11-14] '~X' = X was open UNDER another screen at that step. Once the screen on
               top of it is closed (Back), X is revealed and is no longer "under" — it is still wanted.
               Before, the revealed X was closed too, so Back from e.g. cart / seller page / orders
               opened over product details went straight to the page instead of back to details. */
            var wanted = function (e) { return want.indexOf(key(e)) !== -1 || want.indexOf('~' + key(e)) !== -1; };
            for (var g = 0; g < 25 && stack.length && stack.some(function (e) { return !wanted(e); }); g++) {
                window.skhCloseTop(); changed = true; prune();
            }
            // fungua tena overlay zilizotakiwa ambazo hazipo (Forward, au ukurasa uliofunikwa)
            want.forEach(function (k, idx) {
                // an "under" marker only matters when something is still meant to be above it
                var id = k.charAt(0) === '~' ? k.slice(1) : k, under = k.charAt(0) === '~' && idx < want.length - 1;
                if (id.indexOf(':') !== -1) return;                   // dashboards hazirudishwi
                if (stack.some(function (e) { return e.type === 'modal' && e.id === id; })) return;
                var el = byId(id); if (!el) return;
                if (!isOpen(el)) {
                    if (under || !REOPEN[id] || el.classList.contains('lvx-overlay')) return;
                    el.style.display = H.disp[id] || 'flex';
                    try { window.skhBringToFront && window.skhBringToFront(el); } catch (e) {}
                }
                stack.push({ type: 'modal', id: id, under: false, restore: restoreFor(el) });
                changed = true;
            });
            settle();
            if (!stack.some(function (e) { return e.type === 'modal'; }) && s.sy != null && changed) {
                var y = s.sy; setTimeout(function () { try { window.scrollTo(0, y); } catch (e) {} }, 0);
                try { window.scrollTo(0, y); } catch (e) {}
            }
        } finally {
            setTimeout(function () { H.restoring--; }, 0);   // MutationObserver hupiga baada ya hapa
        }
        return changed;
    }
    window.addEventListener('popstate', function (ev) {
        H.intent = Date.now();
        var s = ev.state;
        if (!s || !s.skhNav) {
            // hatua ya nje (mf. #hash ya zamani): funga overlays tu, kama zamani
            if (stack.length) window.skhCloseTop();
            return;
        }
        var dir = (typeof s.i === 'number' && s.i < H.i) ? -1 : 1;
        H.i = typeof s.i === 'number' ? s.i : H.i;
        var changed = applyState(s);
        try { history.replaceState(Object.assign(navState(), { i: H.i, sy: s.sy }), ''); } catch (e) {}
        if (!changed) { try { history.go(dir); } catch (e) {} }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        // dialogs za app (skhConfirm/skhPrompt) zina Esc yao
        if (document.querySelector('.skd-ov')) return;
        H.intent = Date.now();
        prune();
        if (stack.length) { e.preventDefault(); H.navClosing = true; try { window.skhBack(); } finally { H.navClosing = false; } }
        else if (document.querySelector('.overlay-menu[style*="flex"],.overlay-menu[style*="block"]')) { e.preventDefault(); fallbackClose(); settle(); }
    });
    // kugusa kitufe chochote = nia ya mtumiaji (inatumika kurudisha overlay iliyofunikwa)
    ['pointerdown', 'click', 'keydown'].forEach(function (t) {
        document.addEventListener(t, function (e) { if (e.isTrusted) H.intent = Date.now(); }, true);
    });
    try { history.replaceState(Object.assign({}, baseState(), navState()), ''); } catch (e) {}

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
            stack.forEach(function (e) { if (e.type === 'modal' && isOpen(byId(e.id))) markClosed(e.id); });
            stack = []; H.lastClosed = null;
            var r = orig.apply(window, []);
            settle();
            return r;
        };

        var wrapped = function (closeEverything) {
            // Kufunga kwa makusudi (logout, baada ya kulipa, n.k.)
            if (closeEverything === true) { stack.forEach(function (e) { if (e.type === 'modal' && isOpen(byId(e.id))) markClosed(e.id); }); stack = []; H.lastClosed = null; var r0 = orig.apply(this, []); settle(); return r0; }
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

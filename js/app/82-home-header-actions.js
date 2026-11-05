/* ================================================================
 * 82-home-header-actions.js — [HEADER ACTIONS 2026-11-04]
 * ----------------------------------------------------------------
 * 1) Kitufe KIMOJA cha "Kazi" kwenye header. Kinapogusa, mfumo
 *    (overlay ule ule wa app) unaonyesha:
 *        Usimamizi · SokoPay · Cart · Taarifa
 *    Hakuna handler mpya ya biashara — kila kitu kinaita function
 *    iliyopo: openModeMenu(), openSokoPay(), openCart(), openNotifications().
 *
 * 2) "Akaunti Yangu" kwenye SIDEBAR menu (hamburger) — inaingizwa
 *    juu ya menyu baada ya renderSokoHaiAccountMenu() kuchora drawer.
 *
 * Badges: #cartBadge na #notifBadge zimehamia humu (zipo kwenye DOM
 * tangu mwanzo) ili modules zilizopo ziendelee kuzipdates.
 * ================================================================ */
(function () {
    'use strict';

    var SHEET_ID = 'skhKaziSheet';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function ico(path) {
        return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" '
             + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
    }

    var ICONS = {
        manage: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
        pay: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
        cart: '<circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
        bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'
    };

    /* ---------------- 1. SHEET ---------------- */
    function buildSheet() {
        if (document.getElementById(SHEET_ID)) return document.getElementById(SHEET_ID);

        var wrap = document.createElement('div');
        wrap.id = SHEET_ID;
        wrap.className = 'overlay-menu skh-kazi-sheet';
        wrap.style.cssText = 'z-index:100004; display:none; align-items:flex-end; justify-content:center;';
        wrap.innerHTML =
            '<div class="skh-kazi-card" role="dialog" aria-modal="true" aria-label="Kazi — Usimamizi, SokoPay, Cart, Taarifa">'
          +   '<div class="skh-kazi-head"><b>Kazi</b>'
          +     '<button type="button" class="skh-kazi-close" aria-label="Funga" onclick="window.skhKaziClose()">'
          +       ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')
          +     '</button></div>'
          +   '<div class="skh-kazi-list">'
          +     '<button type="button" class="skh-kazi-item" onclick="window.skhKaziGo(\'mode\')">'
          +       '<span class="skh-kazi-ico">' + ico(ICONS.manage) + '</span>'
          +       '<span class="skh-kazi-txt"><b>Usimamizi</b><small>Dashboards na mode za kazi</small></span>'
          +       '<span class="skh-kazi-chev">›</span></button>'
          +     '<button type="button" class="skh-kazi-item" onclick="window.skhKaziGo(\'sokopay\')">'
          +       '<span class="skh-kazi-ico">' + ico(ICONS.pay) + '</span>'
          +       '<span class="skh-kazi-txt"><b>SokoPay</b><small>Escrow, malipo na wallet</small></span>'
          +       '<span class="skh-kazi-chev">›</span></button>'
          +     '<button type="button" class="skh-kazi-item" onclick="window.skhKaziGo(\'cart\')">'
          +       '<span class="skh-kazi-ico">' + ico(ICONS.cart) + '</span>'
          +       '<span class="skh-kazi-txt"><b>Cart</b><small>Vitu ulivyoweka kwenye kikapu</small></span>'
          +       '<span class="badge skh-kazi-badge" id="skhCartCount" style="display:none;">0</span>'
          +       '<span class="skh-kazi-chev">›</span></button>'
          +     '<button type="button" class="skh-kazi-item" onclick="window.skhKaziGo(\'notif\')">'
          +       '<span class="skh-kazi-ico">' + ico(ICONS.bell) + '</span>'
          +       '<span class="skh-kazi-txt"><b>Taarifa</b><small>Notifications zako</small></span>'
          +       '<span class="badge skh-kazi-badge" id="skhNotifCount" style="display:none;">0</span>'
          +       '<span class="skh-kazi-chev">›</span></button>'
          +   '</div>'
          + '</div>';

        /* click nje ya kadi = funga */
        wrap.addEventListener('click', function (e) {
            if (e.target === wrap) window.skhKaziClose();
        });
        document.body.appendChild(wrap);
        return wrap;
    }

    function syncCounts() {
        /* cart: skh.myCart (module iliyopo) au #cartBadge ya zamani */
        var cart = 0, notif = 0;
        try {
            var legacyCart = document.getElementById('cartBadge');
            if (legacyCart && legacyCart.style.display !== 'none') cart = +legacyCart.textContent || 0;
            if (!cart && window.skh && window.skh.myCart) cart = window.skh.myCart.length || 0;
            var legacyNotif = document.getElementById('notifBadge');
            if (legacyNotif && legacyNotif.style.display !== 'none') notif = +legacyNotif.textContent || 0;
        } catch (e) {}

        [['skhCartCount', cart], ['skhNotifCount', notif]].forEach(function (pair) {
            var els = document.querySelectorAll('[id="' + pair[0] + '"]');
            Array.prototype.forEach.call(els, function (el) {
                var n = pair[1];
                el.textContent = n > 99 ? '99+' : String(n);
                el.hidden = n <= 0;
                el.style.display = n > 0 ? 'inline-flex' : 'none';
            });
        });
        /* badge kwenye sheet (cart/taarifa chips) */
        var cartSheet = document.querySelector('.skh-kazi-item [data-badge="cart"]');
        if (cartSheet) { cartSheet.textContent = cart; cartSheet.hidden = cart <= 0; }
        var notifSheet = document.querySelector('.skh-kazi-item [data-badge="notif"]');
        if (notifSheet) { notifSheet.textContent = notif; notifSheet.hidden = notif <= 0; }
    }

    window.skhKaziOpen = function () {
        var s = buildSheet();
        s.style.display = 'flex';
        var b = document.getElementById('skhKaziBtn');
        if (b) b.setAttribute('aria-expanded', 'true');
        syncCounts();
    };

    window.skhKaziClose = function () {
        var s = document.getElementById(SHEET_ID);
        if (s) s.style.display = 'none';
        var b = document.getElementById('skhKaziBtn');
        if (b) b.setAttribute('aria-expanded', 'false');
    };

    window.skhKaziMenu = function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        var s = document.getElementById(SHEET_ID);
        if (s && s.style.display === 'flex') { window.skhKaziClose(); return; }
        window.skhKaziOpen();
    };

    window.skhKaziGo = function (key) {
        window.skhKaziClose();
        try {
            if (key === 'mode' && typeof window.openModeMenu === 'function') return window.openModeMenu();
            if (key === 'sokopay' && typeof window.openSokoPay === 'function') return window.openSokoPay();
            if (key === 'cart' && typeof window.openCart === 'function') return window.openCart();
            if (key === 'notif' && typeof window.openNotifications === 'function') return window.openNotifications();
        } catch (e) {}
    };

    /* ---------------- 2. ACCOUNT kwenye SIDEBAR ---------------- */
    function injectDrawerExtras() {
        var drawer = document.querySelector('#sidebarMenuModal .skh-menu-scroll');
        if (!drawer) return;

        /* --- Lugha (SW/EN) — ilikuwa kwenye header, sasa ipo hapa --- */
        if (!drawer.querySelector('.skh-menu-lang-row')) {
            var cur = (function () {
                try { return (document.getElementById('langToggleLabel') || {}).textContent || 'SW'; }
                catch (e) { return 'SW'; }
            })();
            var lang = document.createElement('button');
            lang.type = 'button';
            lang.className = 'skh-menu-item skh-menu-lang-row';
            lang.innerHTML = '<span class="ico">' + ico('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/>') + '</span>'
                + '<span class="txt"><b>Lugha</b><small>Kiswahili / English</small></span>'
                + '<span class="skh-lang-chip">' + (cur === 'EN' ? 'EN' : 'SW') + '</span>';
            lang.addEventListener('click', function () {
                var now = (document.getElementById('langToggleLabel') || {}).textContent || 'SW';
                var next = now === 'EN' ? 'sw' : 'en';
                if (typeof window.skhSetLang === 'function') window.skhSetLang(next);
                var chip = lang.querySelector('.skh-lang-chip');
                if (chip) chip.textContent = (next === 'en' ? 'EN' : 'SW');
            });
            drawer.insertBefore(lang, drawer.firstChild);
        }

        if (drawer.querySelector('.skh-menu-account-row')) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'skh-menu-item skh-menu-account-row';
        btn.setAttribute('data-skh-account', '1');
        btn.innerHTML = '<span class="ico">' + ico('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') + '</span>'
            + '<span class="txt"><b>Akaunti Yangu</b><small>Wasifu, picha na mipangilio ya akaunti</small></span>'
            + '<span class="chev">›</span>';
        btn.addEventListener('click', function () {
            window.closeModals && window.closeModals();
            if (typeof window.openProfile === 'function') window.openProfile();
            else if (typeof window.openMyProfile === 'function') window.openMyProfile();
        });
        drawer.insertBefore(btn, drawer.firstChild);
    }

    /* ---- ikoni za makundi ya sidebar (data ya awali ilikuwa na '' tupu) ---- */
    var MENU_ICONS = [
        [/feed|soko huru/i, '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
        [/bidhaa sokoni|feed_products|bidhaa/i, ICONS.cart],
        [/huduma|fundi/i, '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'],
        [/usafiri|usafirishaji|boda/i, '<rect x="1" y="5" width="13" height="11" rx="1"/><path d="M14 8h4l3 3.2V16h-7z"/><circle cx="6" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/>'],
        [/dashboard|mnunuzi|muuzaji|mtoa|msafirishaji|wakala|advertiser|admin|usimamizi/i, ICONS.manage],
        [/sokopay|wallet|escrow|token/i, ICONS.pay],
        [/orders|oda/i, '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9"/>'],
        [/inbox|chat|mawasiliano/i, '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6a8.4 8.4 0 0 1-1.4-4.9 8.4 8.4 0 0 1 8.5-8.4 8.4 8.4 0 0 1 9 8.4z"/>'],
        [/taarifa|notification/i, ICONS.bell],
        [/saved|pendwa/i, '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>'],
        [/akaunti|wasifu|profile/i, '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'],
        [/lugha|language/i, '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/>'],
        [/logout|toka/i, '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>']
    ];

    function decorateMenuIcons() {
        var drawer = document.querySelector('#sidebarMenuModal .skh-menu-scroll');
        if (!drawer) return;
        Array.prototype.forEach.call(drawer.querySelectorAll('.skh-menu-item'), function (item) {
            var icoEl = item.querySelector('.ico');
            if (!icoEl) return;
            if (icoEl.querySelector('svg') || (icoEl.textContent || '').trim()) return;
            var label = (item.textContent || '');
            var path = null;
            for (var i = 0; i < MENU_ICONS.length; i++) {
                if (MENU_ICONS[i][0].test(label)) { path = MENU_ICONS[i][1]; break; }
            }
            if (!path) path = '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>';
            icoEl.innerHTML = ico(path);
        });
    }

    /* ---- kwenye simu, placeholder ndefu inakatwa: tumia kifupi ---- */
    var searchFull = '';
    function tuneSearchPlaceholder() {
        var input = document.getElementById('searchInput');
        if (!input) return;
        if (!searchFull) searchFull = input.getAttribute('placeholder') || '';
        var narrow = window.matchMedia('(max-width: 560px)').matches;
        var want = narrow ? 'Tafuta bidhaa...' : searchFull;
        if (input.getAttribute('placeholder') !== want) input.setAttribute('placeholder', want);
    }

    function watchSidebar() {
        var modal = document.getElementById('sidebarMenuModal');
        if (!modal || modal.__skhAccWatch) return;
        modal.__skhAccWatch = true;
        new MutationObserver(function () { injectDrawerExtras(); decorateMenuIcons(); })
            .observe(modal, { childList: true, subtree: true });
        injectDrawerExtras();
        decorateMenuIcons();
        tuneSearchPlaceholder();
        window.addEventListener('resize', tuneSearchPlaceholder);
        setInterval(tuneSearchPlaceholder, 2000);
    }

    /* ---------------- 3. USIMAMIZI panel: onyesha dashboard inayotumika ---------------- */
    var MODE_ALIAS = { business_os: 'seller', supplier: 'seller', moderator: 'admin', super_admin: 'admin' };

    function decorateModePanel() {
        var modal = document.getElementById('modeMenuModal');
        if (!modal) return;
        var cur = '';
        try { cur = (window.skh && window.skh.currentMode) || ''; } catch (e) {}
        if (!cur) {
            var m = String(document.body.className || '').match(/skh-mode-([a-z_]+)/);
            if (m) cur = m[1];
        }
        cur = MODE_ALIAS[cur] || cur || 'buyer';
        Array.prototype.forEach.call(modal.querySelectorAll('.skh-mode-card'), function (c) {
            var key = (c.id || '').replace('mode-', '');
            var on = key === cur;
            c.classList.toggle('is-current', on);
            c.setAttribute('aria-current', on ? 'true' : 'false');
        });
    }

    function watchModePanel() {
        var modal = document.getElementById('modeMenuModal');
        if (!modal) return;
        /* background ya inline kutoka openModeMenu() isitupishe rangi zetu */
        new MutationObserver(decorateModePanel).observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
        decorateModePanel();
        /* openModeMenu() ya awali: ihifadhi kisha iongeze decoration */
        if (typeof window.openModeMenu === 'function' && !window.openModeMenu.__skhDecorated) {
            var original = window.openModeMenu;
            var wrapped = function () {
                var r = original.apply(this, arguments);
                decorateModePanel();
                return r;
            };
            wrapped.__skhDecorated = true;
            window.openModeMenu = wrapped;
        }
    }

    function boot() {
        buildSheet();            /* badge ziwepo kwenye DOM tangu mwanzo */
        watchSidebar();
        watchModePanel();
        syncCounts();
        setInterval(syncCounts, 2000);
        /* Esc = funga sheet */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') window.skhKaziClose();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

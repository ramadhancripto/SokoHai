/* ==========================================================================
 * SokoHai — JS/113-sale-type-flow.js
 * [M1 2026-11-08] Kichaguzi cha aina ya mauzo: (+) → Bidhaa Sokoni → aina 4.
 *
 * KANUNI ZA MODULE HII:
 *  1. Inabadilisha NJIA YA KUINGIA kwenye Bidhaa Sokoni pekee. Haigusi
 *     Huduma/Fundi, Usafirishaji, Sajili Mwanachama, POS wala Wholesale.
 *  2. Haibadilishi `showForm()`, `#sellerForm`, `prodSaleMode` wala
 *     `toggleModeFields()` — inazitumia zilizopo.
 *  3. Haiondoi kitu: "Zaidi ›" inafungua Wholesale (saleMode=wholesale) na
 *     POS/Duka (`showForm('businessOSForm')`) — zote zilizopo.
 *  4. Ikikosa kipengele chochote kinachohitajika, inarudi kwenye tabia ya leo
 *     (`showForm('sellerForm')`) badala ya kuvunja kitufe.
 *
 * Inatumika na: html/15-main-menu.html (onclick ya "BIDHAA SOKONI").
 * ========================================================================== */

(function () {
    'use strict';

    var PANEL_ID = 'skhSaleTypeChooser';
    var SVG = {
        back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
        shop: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-1.4 11.2A2 2 0 0 1 17.6 22H6.4a2 2 0 0 1-2-1.8L3 9Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/></svg>',
        gavel: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 3-2 5h5l-2 5h4l-8 8 2-7H9l2-6H7l3-5Z"/></svg>',
        users: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
        drop: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
        bulk: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v13H3z"/><path d="M3 7 5 3h14l2 4"/><path d="M12 11v5"/></svg>',
        pos: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h4"/></svg>',
        caret: '<svg class="skst-caret" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
        go: '<svg class="skst-go" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
        check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
    };

    /* Aina 4 kuu — zile zile za #prodSaleMode (hakuna kubuni mpya).
     * Majina yanatoka i18n ILIYOPO (js/app/32-i18n.js) ili kichaguzi kizungumze
     * lugha ile ile ya soko (sw: Kundi / Bei Kushuka). Fallback = maandishi haya. */
    function T(key, fallback) {
        try { if (typeof window.t === 'function') { var v = window.t(key); if (v) return v; } } catch (e) {}
        return fallback;
    }

    function types() {
        return [
            { id: 'free_market', name: T('mode_free_market', 'Soko Huru'), desc: 'Mauzo ya kawaida — bei moja, hakuna ratiba', icon: 'shop' },
            { id: 'auction',     name: T('mode_auction', 'Mnada (Live)'), desc: 'Wanunuzi wanashindana kwa zabuni', icon: 'gavel' },
            { id: 'group_buy',   name: T('mode_group_buy', 'Kundi'), desc: 'Wanunuzi wanashiriki kufikia lengo la pamoja', icon: 'users' },
            { id: 'price_drop',  name: T('mode_price_drop', 'Bei Kushuka'), desc: 'Bei inapungua ndani ya muda maalum', icon: 'drop' }
        ];
    }

    function el(id) { return document.getElementById(id); }
    function on(fn) { return (typeof fn === 'function') ? fn : function () {}; }

    /* ---------- Kufungua/kufunga kichaguzi ---------- */

    function closeChooser() {
        var p = el(PANEL_ID);
        if (p && p.parentNode) p.parentNode.removeChild(p);
    }

    function showMainMenu() {
        // Tabia ile ile ya showForm(): #mainMenu inarudi kuonekana.
        var mm = el('mainMenu');
        if (mm) mm.style.display = 'flex';
    }

    function buildPanel() {
        var panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'skst-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Chagua aina ya mauzo');

        var head =
            '<div class="skst-head">' +
                '<button type="button" class="skst-back" aria-label="Funga">' + SVG.back + '</button>' +
                '<div>' +
                    '<h3 class="skst-title">Uza nini leo?</h3>' +
                    '<span class="skst-step">Bidhaa Sokoni · hatua 1 ya 3</span>' +
                '</div>' +
            '</div>' +
            '<p class="skst-sub">Chagua aina ya mauzo. Kila aina ina masharti yake — yataonekana kwenye fomu baadaye.</p>';

        var list = '<div class="skst-list">' + types().map(function (t) {
            return '<button type="button" class="skst-type" data-type="' + t.id + '">' +
                        '<span class="skst-ic">' + SVG[t.icon] + '</span>' +
                        '<span class="skst-tx">' +
                            '<span class="skst-name">' + t.name + '</span>' +
                            '<span class="skst-desc">' + t.desc + '</span>' +
                        '</span>' + SVG.go +
                    '</button>';
        }).join('') + '</div>';

        var more =
            '<div class="skst-more" data-open="0">' +
                '<button type="button" class="skst-more-btn">Zaidi ' + SVG.caret + '</button>' +
                '<div class="skst-more-body">' +
                    '<button type="button" class="skst-link" data-type="wholesale">' +
                        '<span class="skst-ic">' + SVG.bulk + '</span>' +
                        '<span>' + T('mode_wholesale_title', 'KUUZA KWA JUMLA') + '<small>Bei kwa idadi kubwa, tiers na MOQ</small></span>' +
                    '</button>' +
                    '<button type="button" class="skst-link" data-pos="1">' +
                        '<span class="skst-ic">' + SVG.pos + '</span>' +
                        '<span>POS · Duka<small>Uza dukani, stoo na risiti</small></span>' +
                    '</button>' +
                '</div>' +
            '</div>';

        var note =
            '<div class="skst-note">' + SVG.check +
                '<span><b>Hakuna kinachoondolewa.</b> Hizi ni aina zile zile za fomu ya leo; Wholesale na POS zinabaki chini ya “Zaidi”.</span>' +
            '</div>';

        panel.innerHTML = head + list + more + note;

        var back = panel.querySelector('.skst-back');
        if (back) back.addEventListener('click', function () { skhSaleFlowClose(); });

        var moreWrap = panel.querySelector('.skst-more');
        var moreBtn = panel.querySelector('.skst-more-btn');
        if (moreBtn && moreWrap) {
            moreBtn.addEventListener('click', function () {
                var open = moreWrap.getAttribute('data-open') === '1';
                moreWrap.setAttribute('data-open', open ? '0' : '1');
                moreBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
            });
            moreBtn.setAttribute('aria-expanded', 'false');
        }

        Array.prototype.forEach.call(panel.querySelectorAll('.skst-type'), function (b) {
            b.addEventListener('click', function () { skhSaleFlowChoose(b.getAttribute('data-type')); });
        });

        var ws = panel.querySelector('.skst-link[data-type="wholesale"]');
        if (ws) ws.addEventListener('click', function () { skhSaleFlowChoose('wholesale'); });

        var pos = panel.querySelector('.skst-link[data-pos="1"]');
        if (pos) pos.addEventListener('click', function () {
            // POS/duka: kuingia kwa fomu ile ile iliyopo (hakuna kubadilisha POS).
            closeChooser();
            if (typeof window.showForm === 'function') window.showForm('businessOSForm');
        });

        return panel;
    }

    /* ---------- API ---------- */

    window.skhSaleFlowClose = function () {
        closeChooser();
        if (typeof window.closeModals === 'function') window.closeModals();
        showMainMenu();
    };

    window.skhOpenSaleTypeChooser = function () {
        if (window.skh && typeof window.skh.requireAuth === 'function' && !window.skh.requireAuth()) return;

        var host = el('plusMenu');
        // Kama muundo wa modal haupo, rudi kwenye tabia ya leo.
        if (!host) { if (typeof window.showForm === 'function') window.showForm('sellerForm'); return; }

        if (typeof window.closeModals === 'function') window.closeModals();

        // Background ile ile inayotumika kwa fomu (haibadilishwi).
        host.style.display = 'flex';
        var mm = el('mainMenu');
        if (mm) mm.style.display = 'none';

        closeChooser();
        var panel = buildPanel();
        host.appendChild(panel);

        panel.setAttribute('tabindex', '-1');
        try { panel.focus({ preventScroll: true }); } catch (e) {}
    };

    /**
     * Chagua aina → fungua #sellerForm ile ile, kisha weka mtindo unaohusika.
     * Hakuna fomu mpya, hakuna kubadilisha showForm().
     */
    window.skhSaleFlowChoose = function (mode) {
        if (!mode) return;
        closeChooser();

        if (typeof window.showForm !== 'function') return;
        window.showForm('sellerForm');

        // Weka aina BAADA ya showForm() ili rasimu isiibadilishe bila mtumiaji kujua.
        var sel = el('prodSaleMode');
        if (sel) {
            var has = false;
            for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === mode) { has = true; break; } }
            if (has) {
                sel.value = mode;
                if (typeof window.toggleModeFields === 'function') window.toggleModeFields();
            }
        }

        window.skhSaleFlow = window.skhSaleFlow || {};
        window.skhSaleFlow.type = mode;

        if (typeof window.toast === 'function') {
            var label = mode, list = types();
            for (var k = 0; k < list.length; k++) { if (list[k].id === mode) label = list[k].name; }
            if (mode === 'wholesale') label = T('mode_wholesale', 'Jumla');
            try { window.toast('Aina: ' + label + ' — endelea kujaza bidhaa.', 'success'); } catch (e) {}
        }
    };

    /* Escape inafunga kichaguzi (haigusi handlers zilizopo za back). */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var p = el(PANEL_ID);
        if (p) { e.stopPropagation(); window.skhSaleFlowClose(); }
    }, true);

    window.skhSaleFlow = { open: window.skhOpenSaleTypeChooser, choose: window.skhSaleFlowChoose, close: window.skhSaleFlowClose, types: ['free_market', 'auction', 'group_buy', 'price_drop'] };
})();

/* ================================================================
 * 68-gundua-soko.js — [GUNDUA SOKO 2026-11-04 · R2]
 * ----------------------------------------------------------------
 * Strip ya "Gundua Soko" chini ya search bar ya Home.
 *
 * Kanuni:
 *  - Kategoria ZINATOKA kwenye taxonomy ile ile ya mfumo
 *    (skh.advancedCategories — js/app/00-bootstrap.js). Hakuna
 *    kategoria ya kubuni.
 *  - Kila tile inaita selectAdvancedCategory(name) ILE ILE
 *    inayotumiwa na Category Explorer (js/app/01-market.js) —
 *    hivyo vichujio/kazi/navigation zote zinabaki kama zilivyo.
 *  - Tile ya mwisho "Zaidi" inafungua Category Explorer
 *    (openCategoryModal) — ile ile iliyopo.
 *  - Hakuna tile ya "Zote/All" humu ndani (Zote inabaki kwenye
 *    filter chips + explorer).
 *  - Picha: assets/img/categories/*.webp (design ya SokoHai).
 *    Kama picha haipo, tunarudi kwenye skhCatIcon() ya repo.
 * ================================================================ */
(function () {
    'use strict';

    var DESKTOP_COUNT = 6;   /* spec: kategoria 6 + "Zaidi" */
    var MOUNT_ID = 'gunduaSokoGrid';
    var mounted = false;

    /* Kategoria 6 za mwanzo + picha + label fupi (kama design ya SokoHai).
       "name" ni jina KAMILI la taxonomy — ndilo linalotumika kuchuja. */
    var ORDER = [
        { name: 'Vyakula na Vinywaji (Food)',     photo: 'vyakula',     label: 'Vyakula' },
        { name: 'Electronics & Teknoloji (Tech)', photo: 'elektroniki', label: 'Elektroniki' },
        { name: 'Ufugaji (Livestock)',            photo: 'mifugo',      label: 'Mifugo' },
        { name: 'Kilimo (Agriculture)',           photo: 'kilimo',      label: 'Kilimo' },
        { name: 'Mavazi na Fashoni (Fashion)',    photo: 'mavazi',      label: 'Mavazi' },
        { name: 'Ujenzi na Hardware (Hardware)',  photo: 'ujenzi',      label: 'Ujenzi' } // [R6] was "huduma"/"Huduma" (duplicate image, wrong label)
    ];

    var PHOTOS = {};
    var LABELS = {};
    ORDER.forEach(function (o) { PHOTOS[o.name] = o.photo; LABELS[o.name] = o.label; });

    function cats() {
        try {
            var map = (window.skh && window.skh.advancedCategories) || null;
            if (!map) return [];
            return Object.keys(map);
        } catch (e) { return []; }
    }

    function labelFor(name) {
        return LABELS[name] || shortLabel(name);
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    /* Label fupi kwa tile (jina kamili linabaki kwenye title/aria) */
    function shortLabel(name) {
        var m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(name);
        return m ? m[1].trim() : name;
    }

    /* [R6] one image map: 83-category-photos.js (canonical id). The local table is
       only a fallback when that module has not loaded. Returns a file slug. */
    function photoFor(name) {
        try {
            if (typeof window.skhCategoryImage === 'function') {
                var u = window.skhCategoryImage({ category: name });
                return u || null;   /* [R13-C] category photo path (or null -> UI icon tile) */
            }
        } catch (e) {}
        return PHOTOS[name] ? 'assets/img/categories/' + PHOTOS[name] + '.webp' : null;
    }

    function iconFor(name) {
        try {
            if (window.skhCatIcon) return window.skhCatIcon(name, 40);
        } catch (e) {}
        return '';
    }

    function build() {
        var host = document.getElementById(MOUNT_ID);
        if (!host || mounted) return;
        var list = cats();
        if (!list.length) return;           /* taxonomy bado haijapakiwa */

        /* Mpangilio wa design kwanza (kama zipo kwenye taxonomy halisi),
           kisha kategoria nyingine za taxonomy kufikia 6. */
        var picked = ORDER
            .map(function (o) { return o.name; })
            .filter(function (n) { return list.indexOf(n) !== -1; })
            .slice(0, DESKTOP_COUNT);
        if (picked.length < DESKTOP_COUNT) {
            list.forEach(function (n) {
                if (picked.length < DESKTOP_COUNT && picked.indexOf(n) === -1) picked.push(n);
            });
        }

        var html = '';
        for (var i = 0; i < picked.length; i++) {
            var n = picked[i];
            var ph = photoFor(n);
            var media = ph
                ? '<span class="gds-tile-img"><img src="' + esc(ph) + '" alt="' + esc(labelFor(n)) + '" loading="lazy" decoding="async"></span>'
                : '<span class="gds-tile-img gds-tile-img--icon">' + iconFor(n) + '</span>';
            html += '<button type="button" class="gds-tile" title="' + esc(n) + '"'
                 + ' onclick="selectAdvancedCategory(\'' + esc(n).replace(/'/g, "\\'") + '\')">'
                 + media
                 + '<span class="gds-tile-name">' + esc(labelFor(n)) + '</span>'
                 + '</button>';
        }
        /* Tile ya mwisho — Category Explorer kamili */
        html += '<button type="button" class="gds-tile gds-tile--more" onclick="openCategoryModal()"'
             + ' title="Kategoria zote" aria-label="Zaidi — fungua kategoria zote">'
             + '<span class="gds-tile-img gds-tile-img--more">'
             + '<svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true">'
             + '<rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13" y="3" width="8" height="8" rx="1.6"/>'
             + '<rect x="3" y="13" width="8" height="8" rx="1.6"/><rect x="13" y="13" width="8" height="8" rx="1.6"/>'
             + '</svg></span><span class="gds-tile-name">Zaidi</span></button>';

        host.innerHTML = html;
        mounted = true;
    }

    function boot() {
        build();
        if (mounted) return;
        /* taxonomy inaweza kuchelewa (bootstrap module) — jaribu mara chache */
        var tries = 0;
        var t = setInterval(function () {
            build();
            if (mounted || ++tries > 40) clearInterval(t);
        }, 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
    window.skhGunduaSokoBuild = boot;
})();

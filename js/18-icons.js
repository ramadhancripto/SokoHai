/* ==== js/18-icons.js ==== */
// ============================================================
// SOKOHAI ICONS [PHASE 5.9] — maktaba ya ikoni za SVG (hakuna emoji)
// Muundo: stroke-icons safi (Feather-style) + tiles zenye gradient
// za rangi za brand — zaonekana kama "picha" za kisasa, hazitaji mtandao.
// Matumizi:
//   skhNavIcon('cart', 22)            -> SVG markup (currentColor)
//   skhTileIcon('food', 44)           -> tile nzuri yenye ikoni (categories)
//   skhCatIcon('Kilimo (Agriculture)') -> tile kwa jina lolote la kategoria
// Inajizunga na <style> yake — CSS za nje hazikuguswa.
// ============================================================
(function () { 'use strict';

    // ---------- ikoni (path za stroke, viewBox 24) ----------
    var P = {
        menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
        cart: '<circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
        chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6a8.4 8.4 0 0 1-1.4-4.9 8.4 8.4 0 0 1 8.5-8.4 8.4 8.4 0 0 1 9 8.4z"/>',
        bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
        refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
        search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/>',
        folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
        package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.2"/><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
        shop: '<path d="M3 9l1.5-6h15L21 9"/><path d="M3 9V20a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 20V9"/><path d="M3 9h18"/><path d="M9 21.5v-6h6v6"/>',
        wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
        truck: '<rect x="1" y="4" width="14" height="12" rx="1"/><path d="M15 9h4l4 4v3h-8z"/><circle cx="5.5" cy="18.5" r="2.2"/><circle cx="18.5" cy="18.5" r="2.2"/>',
        briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
        globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        food: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
        sprout: '<path d="M12 22V11"/><path d="M12 11C12 7 9 4 5 4c0 4 3 7 7 7z"/><path d="M12 11c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M8 22h8"/>',
        milk: '<path d="M8 2h8v4l2 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10l2-4V2z"/><line x1="6" y1="14" x2="18" y2="14"/>',
        health: '<path d="M12 21C7 17 3 13.5 3 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 3.5c0 4-4 7.5-9 11.5z"/>',
        shirt: '<path d="M20.4 4.6 16 2l-4 3.5L8 2 3.6 4.6 2 10l3 1.2V22h14V11.2L22 10z"/>',
        gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="M12 21 8 9l4-6 4 6z"/>',
        phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="10" y1="18.5" x2="14" y2="18.5"/>',
        sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v3h12v-3a2 2 0 0 1 4 0v6H2z"/>',
        hammer: '<path d="M14 4l6 6-2 2-6-6z"/><path d="m12 6-9 9v4h4l9-9"/>',
        car: '<path d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="7" rx="2"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/>',
        book: '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
        trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5"/>',
        gift: '<rect x="3" y="8" width="18" height="4 rx=1"/><path d="M12 8v13"/><path d="M5 12v9h14v-9"/><path d="M12 8a3 3 0 1 0-3-3c0 1.5 1 2.6 3 3zM12 8a3 3 0 1 1 3-3c0 1.5-1 2.6-3 3z"/>',
        music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        palette: '<circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="10" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/><circle cx="12" cy="15" r="1.2"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1a5 5 0 0 0 5-5 10.4 10.4 0 0 0-10-10z"/>',
        bank: '<line x1="3" y1="10" x2="21" y2="10"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9"/><path d="M3 22h18"/><path d="M12 2 3 7h18z"/>',
        star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
        heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
        wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="15" r="1.3"/>',
        key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9 2 2-2 2 2 2-2 2-2-2-2 2 2 2-2 2z"/>',
        map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
        scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.1" y2="15.9"/><line x1="14.5" y1="14.5" x2="20" y2="20"/><line x1="8.1" y1="8.1" x2="12" y2="12"/>',
        camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        // [COMMERCE 2026-09] ikoni za ziada za commerce/transport (badala ya emoji)
        'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
        'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
        // [LIFECYCLE 2026-09-14] icons za mfumo wa Kumbukumbu/Historia
        'shield-check': '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
        archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><line x1="10" y1="13" x2="14" y2="13"/>',
        trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
        eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
        'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
        shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/>', 'shield-check': '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
        clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><polyline points="9 14 11 16 15 12"/>',
        bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        filter: '<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>',
        check: '<polyline points="20 6 9 17 4 12"/>',
        x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
        send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
        hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
        calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8.01" y2="11"/><line x1="12" y1="11" x2="12.01" y2="11"/><line x1="16" y1="11" x2="16.01" y2="11"/><line x1="8" y1="15" x2="8.01" y2="15"/><line x1="12" y1="15" x2="12.01" y2="15"/><line x1="16" y1="15" x2="16.01" y2="15"/><line x1="8" y1="19" x2="8.01" y2="19"/><line x1="12" y1="19" x2="12.01" y2="19"/><line x1="16" y1="19" x2="16.01" y2="19"/>',
        scales: '<path d="M12 3v18"/><path d="M5 21h14"/><path d="M5 7l-3 8h6z"/><path d="M19 7l-3 8h6z"/><path d="M5 7h14"/><path d="M12 3 8 7"/><path d="M12 3l4 4"/>',
        alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88A3 3 0 0 0 13.5 9H12L7 12"/><path d="m3 12 3-3 4 2"/><path d="M21 12l-3-3"/><path d="M3 21h18"/>',
        /* [AUDIT-FIX 2026-09-16 P3 §24] Zilitumika sana (38/55/56 n.k.) lakini
           hazikuwepo kwenye map — zilikuwa zikionyeshwa kama 'package' vibaya */
        'arrow-left': '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
        'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        // [FILE TYPES 2026-09-17] download icon kwa kadi za faili (zip/pdf/...)
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        back: '<path d="m15 18-6-6 6-6"/>',
        'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'
    };

    function svg(name, size, extra) {
        var p = P[name] || P.package;
        size = size || 22;
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="' + size + '" height="' + size + '" style="vertical-align:middle;' + (extra || '') + '" aria-hidden="true">' + p + '</svg>';
    }
    window.skhNavIcon = function (name, size, extra) { return svg(name, size, extra); };

    // ---------- tiles za kategoria (rangi za brand za SOKOHAI) ----------
    var G = {
        food:     ['#16a34a', '#4ade80'], agri:   ['#15803d', '#86efac'], live: ['#ea580c', '#fdba74'],
        health:   ['#dc2626', '#fca5a5'], fashion:['#db2777', '#f9a8d4'], luxury:['#0891b2', '#67e8f9'],
        tech:     ['#2563eb', '#93c5fd'], home:   ['#4f46e5', '#c7d2fe'], hardware:['#d97706', '#fcd34d'],
        auto:     ['#334155', '#94a3b8'], edu:    ['#1d4ed8', '#a5b4fc'], sports:['#059669', '#6ee7b7'],
        toys:     ['#e11d48', '#fda4af'], music:  ['#7c3aed', '#c4b5fd'], arts:  ['#be185d', '#f9a8d4'],
        all:      ['#0f172a', '#00509d'], service:['#03509d', '#38bdf8'], transport:['#b45309', '#fbbf24'],
        default:  ['#475569', '#94a3b8']
    };
    window.skhTileIcon = function (group, size) {
        var g = G[group] || G.default;
        size = size || 46;
        var inner = size - 18;
        return '<span class="skh-ic-tile" style="display:inline-flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;border-radius:' + Math.round(size * 0.28) + 'px;'
            + 'background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');color:#fff;box-shadow:0 3px 8px rgba(15,23,42,.18);">'
            + svg({ food:'food', agri:'sprout', live:'milk', health:'health', fashion:'shirt', luxury:'gem', tech:'phone', home:'sofa', hardware:'hammer', auto:'car', edu:'book', sports:'trophy', toys:'gift', music:'music', arts:'palette', all:'globe', service:'wrench', transport:'truck' }[group] || 'package', inner)
            + '</span>';
    };

    // ---------- ramani ya kategoria (jina -> group) ----------
    var MAP = [
        [/zote|all/i, 'all'],
        [/vyakula|food|vinywaji|bever|chakula/i, 'food'],
        [/kilimo|agri|mbegu|fertilizer|mazao/i, 'agri'],
        [/ufugaji|livestock|dairy|ng'ombe|ngombe|kuku|mifugo|mbuzi|kondoo/i, 'live'],
        [/afya|health|pharmacy|dawa|medical|clinic/i, 'health'],
        [/mavazi|fashoni|fashion|nguo|wear|footwear|viatu/i, 'fashion'],
        [/vito|luxury|jewel|saa|watch|gem|dhahabu/i, 'luxury'],
        [/repair|fund |matengenezo|technical|electric|plumb|wiring/i, 'service'],
        [/electronic|teknoloj|tech|simu|phone|computer|laptop|tv|audio|gaming/i, 'tech'],
        [/samani|nyumbani|home|furniture|sofa|kitchen|bed|decor|jiko/i, 'home'],
        [/ujenzi|hardware|construction|matofali|zege|mbao|boriti/i, 'hardware'],
        [/magari|automotive|gari|car|spare|tairi|engine/i, 'auto'],
        [/vitabu|elimu|education|book|school|stationery/i, 'edu'],
        [/vichezeo|toys|doll|mchezano/i, 'toys'],
        [/michezo|mazoezi|sports|kickboxing|gym|mchez/i, 'sports'],
        [/sauti|muziki|music|dj|vinara|kenye sauti/i, 'music'],
        [/sanaa|ubunifu|arts|craft|picha|art/i, 'arts'],
        [/usafir|transport|delivery|mzigo|cargo|boda|bajaji|lori|shipping|logist/i, 'transport'],
        [/clean|unafuu|usafi/i, 'service'],
        [/beauty|urembo|salon|kinyozi|groom|hair|nail/i, 'fashion'],
        [/laundry|kufulia/i, 'fashion'],
        [/cook|kupika|chef|catering|lish/i, 'food'],
        [/digital|web|app|graphic|design|marketing|it /i, 'tech'],
        [/event|harusi|usafori|deco|wedding|photography/i, 'arts'],
        [/consult|legal|hesabu|accounting|tax|adv/i, 'edu'],
        [/security|ulinzi|askari|guard/i, 'service'],
        [/mov|safiri|taxi|trip|safari/i, 'transport']
    ];
    window.skhCatGroup = function (name) {
        var n = String(name || '');
        for (var i = 0; i < MAP.length; i++) if (MAP[i][0].test(n)) return MAP[i][1];
        return 'default';
    };
    window.skhCatIcon = function (name, size) { return window.skhTileIcon(window.skhCatGroup(name), size || 46); };

    // ---------- [PHASE 5.9] hydration: kila element yenye data-skh-icon ipatiwe SVG ----------
    // (inafanya kazi na HTML ya tuli — menus, nav, sidebar — bila kubadilisha JS zingine)
    function hydrate() {
        try {
            var els = document.querySelectorAll('[data-skh-icon]');
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (el.getAttribute('data-skh-done')) continue;
                var nm = el.getAttribute('data-skh-icon');
                var sz = el.getAttribute('data-skh-size') || 17;
                el.insertAdjacentHTML('afterbegin', svg(nm, parseInt(sz, 10) || 17) + ' ');
                el.setAttribute('data-skh-done', '1');
            }
        } catch (e) { /* defensive */ }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate);
    else hydrate();
    window.skhIconsHydrate = hydrate;

    // [FIX 2026-09-14] Hydrate ilikimbia MARA MOJA tu. Vipengele
    // vinavyoongezwa baadaye na JS (modals, dashboards, sidebars)
    // vilibaki TUPU — mtumiaji akakosa icons za kunavigate.
    // Sasa tunafuatilia DOM na kujaza kila kinachoongezwa.
    try {
        var q = null;
        var mo = new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                if (muts[i].addedNodes && muts[i].addedNodes.length) {
                    if (q) return;
                    q = setTimeout(function () { q = null; hydrate(); }, 120);
                    return;
                }
            }
        });
        function watch() {
            if (document.body) mo.observe(document.body, { childList: true, subtree: true });
        }
        if (document.body) watch();
        else document.addEventListener('DOMContentLoaded', watch);
    } catch (e) { /* defensive */ }

    // ---------- CSS ya tiles kwenye cat-grid ----------
    try {
        var st = document.createElement('style');
        st.textContent = '.cat-box .cat-icon{font-size:0;line-height:0;} .cat-box .cat-icon .skh-ic-tile{transition:transform .15s;} .cat-box:active .cat-icon .skh-ic-tile{transform:scale(.9);}';
        document.head.appendChild(st);
    } catch (e) { /* defensive */ }
})();

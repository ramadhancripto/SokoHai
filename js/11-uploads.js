/* ==== js/11-uploads.js ==== */
// ============================================================
// SOKOHAI UPLOADS (Phase 4.2) — UPLOADER MMOJA WA PAMOJA
// Ili kuepuka nakala 8 za code ile ile (Cloudinary), uploads
// ZOTE zinapita hapa sasa. Badilisha preset/cloud HAPA pekee.
// Matumizi:
//   skhUploadFromFile(file, {resourceType, folder}) -> {url, data}|null
//   skhUploadFromInput(inputId, opts)               -> url|null
//   skhUploadManyFromInput(inputId, max, opts)      -> [urls]
//  Phase 5: hii itahamishiwa backend (signed uploads).
//
// [REPAIR 2026-11-01] ROOT CAUSE FIX — the seller photo picker never bound.
// The picker was initialised by an INLINE <script> inside the Add-Product
// markup (html/09-admin-sell.html) which runs at parse time, while this file
// is loaded near the end of <body>. window.skhInitPhotoPicker was therefore
// still undefined, the guard silently skipped, and no change-listener was ever
// attached to #prodImage/#prodImageCam. Verified in a real browser: selecting
// 3 photos left previewsRendered=0 and an empty hint; submitSeller then called
// skhUploadPicked -> list empty -> skhUploadManyFromInput on an input the
// picker never touched -> [] -> "Weka angalau picha 1 ya bidhaa."
// The picker now binds itself (data-skh-photo-picker + DOM-ready auto-bind) and
// is idempotent, so load order no longer matters.
// ============================================================
(function () { 'use strict';

    window.SOKOHAI_UPLOADS = {
        cloud: 'dt7erwy1r',          // Cloudinary cloud name (si siri)
        preset: 'Sokohai_preset',    // unsigned preset (funga kwenye dashboard)
        maxBytes: 12 * 1024 * 1024,  // kikomo kimoja cha faili (12MB)
        maxFiles: 6                  // kikomo cha picha kwa bidhaa
    };

    // [PHASE 5.7] tile ya SOKOHAI kwa bidhaa zisizo na picha — SVG data-URI
    if (!window.SKH_PLACEHOLDER_IMG) {
        window.SKH_PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent( '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">' + '<rect width="500" height="500" fill="#EAF6F0"/>' + '<rect x="20" y="20" width="460" height="460" rx="28" fill="#F7FCF9" stroke="#CBE7DC" stroke-width="2"/>' + '<circle cx="250" cy="205" r="78" fill="#18A982" opacity="0.92"/>' + '<path d="M215 190 h70 l-9 66 a8 8 0 0 1 -8 7 h-36 a8 8 0 0 1 -8 -7 z" fill="#f6c445"/>' + '<path d="M228 190 a22 22 0 0 1 44 0" fill="none" stroke="#0f172a" stroke-width="7" stroke-linecap="round"/>' + '<text x="250" y="330" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="bold" fill="#0f172a" text-anchor="middle">SOKOHAI</text>' + '<text x="250" y="372" font-family="Arial,Helvetica,sans-serif" font-size="22" fill="#64748b" text-anchor="middle">Picha inakuja hivi karibuni</text>' + '</svg>');
    }

    // [PHASE 5.7] MGANDAMIZO WA PICHA (client-side) — kabla ya upload
    window.SOKOHAI_UPLOADS.compress = { minBytes: 300 * 1024, maxEdge: 1600, quality: 0.82 };

    window.skhCompressImageFile = async function (file) {
        var cfg = window.SOKOHAI_UPLOADS.compress;
        try {
            if (!file || file.type !== 'image/jpeg' && file.type !== 'image/png' && file.type !== 'image/webp') return file;
            if (file.size && file.size < cfg.minBytes) return file;
            if (typeof document === 'undefined' || !document.createElement) return file;
            var img = new Image();
            var url = URL.createObjectURL(file);
            await new Promise(function (res, rej) {
                img.onload = res; img.onerror = rej;
                img.src = url;
                setTimeout(function () { rej(new Error('timeout')); }, 8000);
            });
            try { URL.revokeObjectURL(url); } catch (e) {}
            var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (!w || !h) return file;
            if (w <= cfg.maxEdge && h <= cfg.maxEdge && file.size && file.size < cfg.minBytes) return file;
            var scale = Math.min(1, cfg.maxEdge / Math.max(w, h));
            var cw = Math.round(w * scale), ch = Math.round(h * scale);
            var c = document.createElement('canvas');
            c.width = cw; c.height = ch;
            var ctx = c.getContext('2d');
            if (!ctx) return file;
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(img, 0, 0, cw, ch);
            var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', cfg.quality); });
            if (!blob || blob.size >= (file.size || Infinity)) return file;
            var out = new File([blob], (file.name || 'picha').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
            return out;
        } catch (e) {
            try { if (typeof URL !== 'undefined' && URL.revokeObjectURL && url) URL.revokeObjectURL(url); } catch (e2) {}
            return file;
        }
    };

    // Ask the server for a one-time upload signature. Returns {mode:'signed'|...},
    // {mode:'unsigned'} (server not configured yet) or {error}. Login required.
    window.skhUploadSignature = async function (resourceType, folder) {
        try {
            var s = window.skh;
            if (!s || typeof s.wrapCallable !== 'function') return { error: 'functions_unavailable' };
            var r = await s.wrapCallable('uploadSignature')({ resourceType: resourceType || 'image', folder: folder || '' });
            return (r && r.data) || { error: 'empty' };
        } catch (e) {
            return { error: String((e && (e.message || e.code)) || e) };
        }
    };

    // [REPAIR 2026-11-01] Upload failures are now REPORTED, never swallowed.
    // Callers can read window.skhUploadLastError to show a true message instead
    // of the misleading "add at least one photo".
    function uploadFail(code, message) {
        window.skhUploadLastError = { code: code, message: message, at: Date.now() };
        return null;
    }
    window.skhUploadLastError = null;

    window.skhUploadFromFile = async function (file, opts) {
        opts = opts || {};
        if (!file) return uploadFail('no_file', 'Hakuna faili lililochaguliwa.');
        window.skhUploadLastError = null;
        try {
            if (window.skhCompressImageFile && (opts.resourceType === 'image' || opts.resourceType === 'auto' || !opts.resourceType)) {
                try { file = await window.skhCompressImageFile(file); } catch (e) { /* picha ya asili */ }
            }
            const fd = new FormData();
            fd.append('file', file);
            let resource = opts.resourceType || 'auto';
            let cloud = window.SOKOHAI_UPLOADS.cloud;
            const sig = await window.skhUploadSignature(resource, opts.folder);
            if (sig && sig.mode === 'signed') {
                cloud = sig.cloudName || cloud;
                if (sig.resourceType) resource = sig.resourceType;
                if (sig.allowedFormats) fd.append('allowed_formats', sig.allowedFormats);
                fd.append('api_key', sig.apiKey);
                fd.append('timestamp', String(sig.timestamp));
                fd.append('signature', sig.signature);
                fd.append('folder', sig.folder);
                fd.append('upload_preset', sig.uploadPreset);
            } else if (sig && sig.mode === 'unsigned') {
                fd.append('upload_preset', window.SOKOHAI_UPLOADS.preset);
                if (opts.folder) fd.append('folder', opts.folder);
            } else {
                console.error('skhUploadFromFile: upload imekataliwa na server', sig && sig.error);
                return uploadFail('not_authorized',
                    'Seva imekataa kupandisha picha. Hakikisha umeingia (login) kisha ujaribu tena.');
            }

            const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resource}/upload`, { method: 'POST', body: fd });
            const data = await res.json().catch(function () { return null; });
            if (!data || !data.secure_url) {
                console.error('skhUploadFromFile: hakuna secure_url', data);
                const msg = (data && data.error && data.error.message) || 'Seva ya picha imeshindikana.';
                return uploadFail('upload_failed', 'Picha haikupandishwa: ' + msg);
            }
            return { url: data.secure_url, data: data };
        } catch (e) {
            console.error('skhUploadFromFile:', e);
            return uploadFail('network', 'Mtandao umeshindikana wakati wa kupandisha picha. Jaribu tena.');
        }
    };

    window.skhUploadFromInput = async function (inputId, opts) {
        const el = document.getElementById(inputId);
        const file = el && el.files ? el.files[0] : null;
        if (!file) return null;
        const r = await window.skhUploadFromFile(file, opts);
        return r ? r.url : null;
    };

    // ────────────────────────────────────────────────────────────
    // [REPAIR 2026-11-01] PHOTO-PICKER YA BIDHAA (v2)
    //  • inajifunga yenyewe (hakuna kutegemea mpangilio wa <script>)
    //  • idempotent: kuita mara nyingi hakuongezi listeners mara mbili
    //  • galari (multiple) + kamera (single) zinaingia kwenye orodha MOJA
    //  • kila picha ina hali: pending / uploading / done / failed
    //  • ujumbe wa makosa ni wa kweli (si "ongeza picha" kwa kosa la mtandao)
    // ────────────────────────────────────────────────────────────
    var pickerCfg = {};    // inputId -> cfg
    var pickerItems = {};  // inputId -> [{file, url, status, error, name}]

    function itemsFor(key) { if (!pickerItems[key]) pickerItems[key] = []; return pickerItems[key]; }
    function filesFor(key) { return itemsFor(key).map(function (x) { return x.file; }); }

    function pickerToast(msg) {
        try { if (typeof window.sokohaiToast === 'function') window.sokohaiToast(msg, 'warn', 4200); else console.warn(msg); }
        catch (e) { console.warn(msg); }
    }

    // ────────────────────────────────────────────────────────────
    //  PICHA STUDIO — sehemu ya picha kwenye fomu ya bidhaa
    //  • hero 1:1 object-fit:contain (picha HA IKATWI)
    //  • strip ya thumbnails: weka kuu / ondoa / panga upya (drag)
    //  • taarifa halisi: azimio, ukubwa, ubora
    //  • live preview: kadi itakavyoonekana sokoni
    // ────────────────────────────────────────────────────────────
    var PS_SVG = {
        pin: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
        zoom: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6M11 8v6M8 11h6"/></svg>',
        star: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8Z"/></svg>',
        trash: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
        plus: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
        check: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        warn: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 20h18Z"/><path d="M12 10v4M12 17.2v.1"/></svg>',
        wand: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 19 9-9"/><path d="M15 4v3M19.5 8.5h-3M18 15l-1.5-1.5M12 12l1.5 1.5"/></svg>',
        undo: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h9a5 5 0 0 1 0 10H7"/><path d="M4 10l4-4M4 10l4 4"/></svg>',
        photo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.5 3.5 3.5 3-3L20 17"/></svg>'
    };

    function psBytes(n) {
        n = Number(n) || 0;
        if (!n) return '';
        if (n >= 1048576) return (n / 1048576).toFixed(1) + 'MB';
        return Math.max(1, Math.round(n / 1024)) + 'KB';
    }

    // Unit ya kadi: "kwa kipande", "kwa kilo" …
    function psUnitLabel(v) {
        var map = { Piece: 'kwa kipande', Kg: 'kwa kilo', Gram: 'kwa gramu', Litre: 'kwa lita',
            Ml: 'kwa ml', Meter: 'kwa mita', Pair: 'kwa jozi', Tablet: 'kwa kidonge', Bottle: 'kwa chupa' };
        return map[v] || '';
    }

    function psNumber(str) {
        var digits = String(str == null ? '' : str).replace(/[^\d.]/g, '');
        if (!digits) return 0;
        var n = parseFloat(digits);
        return isFinite(n) ? n : 0;
    }

    function psMoney(n) {
        return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function psActiveIndex(key) {
        var cfg = pickerCfg[key] || {};
        var items = itemsFor(key);
        var i = Number(cfg.active) || 0;
        if (i < 0 || i >= items.length) i = 0;
        return i;
    }

    function psPaintLive(key) {
        var box = document.getElementById('skhPsLive');
        if (!box) return;
        var items = itemsFor(key);
        var heroUrl = items.length ? (items[psActiveIndex(key)] || items[0]).url : '';

        var nameEl = document.getElementById('prodName');
        var priceEl = document.getElementById('prodPrice');
        var unitEl = document.getElementById('prodBaseUnit');
        var locEl = document.getElementById('prodLocation');
        var stockEl = document.getElementById('prodStock');

        var name = (nameEl && nameEl.value || '').trim();
        var price = psNumber(priceEl && priceEl.value);
        var unit = psUnitLabel(unitEl && unitEl.value);
        var loc = (locEl && locEl.value || '').trim();
        var out = stockEl && stockEl.value !== '' && psNumber(stockEl.value) === 0;

        var imgHtml = heroUrl
            ? '<img src="' + heroUrl + '" alt="Picha ya bidhaa itakavyoonekana sokoni">'
            : '<div class="ps-empty">' + PS_SVG.photo + '<span>Picha yako<br>itaonekana hapa</span></div>';

        box.innerHTML =
            '<div class="skh-lp-head"><b>Itakavyoonekana sokoni</b><span>PREVIEW</span></div>' +
            '<article class="skh-lp-card">' +
                '<div class="skh-lp-imgbox">' + imgHtml + (out ? '<span class="ps-out">Imeisha</span>' : '') + '</div>' +
                '<div class="skh-lp-body">' +
                    '<h4 class="skh-lp-name' + (name ? '' : ' is-placeholder') + '">' + (name || 'Jina la bidhaa') + '</h4>' +
                    '<div class="skh-lp-price' + (price ? '' : ' is-placeholder') + '"><span class="cur">TSh</span>' + (price ? psMoney(price) : '0') + '</div>' +
                    '<div class="skh-lp-unit">' + (unit || '&nbsp;') + '</div>' +
                    '<div class="skh-lp-meta">' + PS_SVG.pin + '<span>' + (loc || 'Eneo la bidhaa') + '</span></div>' +
                '</div>' +
            '</article>' +
            '<p class="skh-lp-hint">Hivi ndivyo mnunuzi atakavyoona kadi yako kwenye soko — picha haikatwi, bei na kipimo vinaonekana wazi.</p>';
    }

    var psLiveBound = false;
    function psBindLiveInputs() {
        if (psLiveBound) return;
        var hero = document.getElementById('skhPsLive');
        if (!hero) return;
        psLiveBound = true;
        ['prodName', 'prodPrice', 'prodBaseUnit', 'prodLocation', 'prodStock'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', function () { psPaintLive('prodImage'); });
            el.addEventListener('change', function () { psPaintLive('prodImage'); });
        });
    }

    function psOpenLightbox(url, label) {
        if (!url) return;
        var wrap = document.createElement('div');
        wrap.className = 'skh-ps-lightbox';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', label || 'Picha kwa ukubwa kamili');
        var img = document.createElement('img');
        img.src = url;
        img.alt = label || 'Picha';
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'ps-lb-x';
        x.setAttribute('aria-label', 'Funga');
        x.innerHTML = '\u2715';
        wrap.appendChild(img);
        wrap.appendChild(x);
        var close = function () {
            document.removeEventListener('keydown', onKey);
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        };
        var onKey = function (e) { if (e.key === 'Escape') close(); };
        wrap.addEventListener('click', function (e) { if (e.target === wrap || e.target === x) close(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
    }

    function psThumbHtml(it, i, count) {
        var state = it.status || 'pending';
        var badge = state === 'done' ? '<span class="ps-badge">' + PS_SVG.check + '</span>'
            : state === 'failed' ? '<span class="ps-badge" style="color:#B4442F">!</span>' : '';
        return '<button type="button" class="skh-ps-thumb" data-i="' + i + '" data-state="' + state + '" ' +
            'draggable="true" aria-label="Picha ' + (i + 1) + (i === 0 ? ' (picha kuu)' : '') + '" ' +
            'aria-current="' + (i === psActiveIndex(it.__key) ? 'true' : 'false') + '">' +
            (it.url ? '<img src="' + it.url + '" alt="">' : '') +
            (i === 0 ? '<span class="ps-main">KUU</span>' : '') +
            badge +
            '<span class="ps-x" role="button" data-x="' + i + '" aria-label="Ondoa picha ' + (i + 1) + '">\u2715</span>' +
            '</button>';
    }

    function paintPicker(key) {
        var cfg = pickerCfg[key] || {};
        var items = itemsFor(key);
        var box = cfg.previewId ? document.getElementById(cfg.previewId) : null;

        if (box) {
            if (!items.length) {
                box.innerHTML = '';
            } else {
                var ai = psActiveIndex(key);
                var it = items[ai] || items[0];
                var state = it.status || 'pending';

                // ---- hero ----
                var heroState = '';
                if (state === 'uploading') heroState = '<div class="ps-state" data-k="uploading"><span class="skh-ps-spin"></span><span>Inapanda\u2026</span><small>Usifunge ukurasa</small></div>';
                else if (state === 'done') heroState = '<div class="ps-state" data-k="done"><span>' + PS_SVG.check + '</span><span>Imepanda</span></div>';
                else if (state === 'failed') heroState = '<div class="ps-state" data-k="failed"><span>Haikupanda</span><small>' + (it.error || 'Jaribu tena') + '</small></div>';

                var heroHtml =
                    '<div class="skh-ps-hero">' +
                        (it.url ? '<img src="' + it.url + '" alt="' + (it.name || 'Picha ya bidhaa') + '">' : '') +
                        (ai === 0 ? '<span class="ps-tag">' + PS_SVG.star + ' Picha kuu</span>'
                                  : '<span class="ps-tag">Picha ' + (ai + 1) + '</span>') +
                        (it.url ? '<button type="button" class="ps-zoom" data-zoom="1">' + PS_SVG.zoom + ' Angalia</button>' : '') +
                        heroState +
                    '</div>';

                // ---- meta ----
                var chips = [];
                var isVector = it.file && /svg/i.test(it.file.type || '');
                if (it.w && it.h) {
                    if (isVector) {
                        chips.push('<span class="skh-ps-chip" data-tone="ok">' + PS_SVG.photo + '<b>Vekta (SVG)</b></span>');
                    } else if (!it.edited) {
                        // picha iliyohaririwa imepunguzwa kwa makusudi — usiionyeshe kama "azimio dogo"
                        var tone = 'ok', label = 'Ubora mzuri';
                        if (Math.min(it.w, it.h) < 600) { tone = 'warn'; label = 'Azimio dogo'; }
                        else if (Math.min(it.w, it.h) < 1000) { tone = 'warn'; label = 'Inatosha'; }
                        chips.push('<span class="skh-ps-chip" data-tone="' + tone + '">' + PS_SVG.photo + '<b>' + label + '</b></span>');
                    }
                    chips.push('<span class="skh-ps-chip">' + it.w + ' \u00d7 ' + it.h + ' px</span>');
                }
                if (it.file && it.file.size) chips.push('<span class="skh-ps-chip">' + psBytes(it.file.size) + '</span>');
                if (it.file && it.file.type) chips.push('<span class="skh-ps-chip">' + (it.file.type.split('/')[1] || 'picha').toUpperCase() + '</span>');
                if (it.edited) chips.push('<span class="skh-ps-chip" data-tone="ok">' + PS_SVG.check + '<b>Imehaririwa</b></span>');
                if (items.length > 1) chips.push('<span class="skh-ps-chip">Picha ' + items.length + ' kwa jumla</span>');

                var metaHtml = chips.length ? '<div class="skh-ps-meta">' + chips.join('') + '</div>' : '';

                // ---- onyo la upole kwa uwiano usio wa kawaida ----
                var noteHtml = '';
                if (it.w && it.h) {
                    var ratio = it.w / it.h;
                    if (ratio > 1.9 || ratio < 0.53) {
                        var shape = ratio > 1.9 ? 'pana sana' : 'ndefu sana';
                        noteHtml = '<div class="skh-ps-note">' + PS_SVG.warn +
                            '<span>Picha hii ni <b>' + shape + '</b>. Itaonekana yote bila kukatwa, lakini nafasi itabaki pembeni. Picha ya mraba (1:1) inaonekana vizuri zaidi kwenye soko.</span></div>';
                    }
                }

                // ---- thumbs ----
                var thumbsHtml = '<div class="skh-ps-thumbs" role="list">' +
                    items.map(function (x, i) { if (!x.__key) x.__key = key; return psThumbHtml(x, i, items.length); }).join('') +
                    '</div>';

                // ---- tools ----
                var tools = '';
                tools += '<button type="button" class="skh-ps-tool" data-act="edit">' + PS_SVG.wand + ' Rekebisha</button>';
                if (it.edited || it.orig) tools += '<button type="button" class="skh-ps-tool" data-act="restore">' + PS_SVG.undo + ' Rudisha picha halisi</button>';
                if (ai !== 0) tools += '<button type="button" class="skh-ps-tool" data-act="main">' + PS_SVG.star + ' Weka kama picha kuu</button>';
                tools += '<button type="button" class="skh-ps-tool" data-act="zoom">' + PS_SVG.zoom + ' Angalia kwa ukubwa</button>';
                tools += '<button type="button" class="skh-ps-tool skh-ps-tool--danger" data-act="remove">' + PS_SVG.trash + ' Ondoa picha hii</button>';
                if (items.length < (cfg.max || 6)) tools += '<button type="button" class="skh-ps-tool" data-act="add">' + PS_SVG.plus + ' Ongeza zaidi</button>';

                box.innerHTML = heroHtml +
                    '<div class="skh-ps-side">' + metaHtml + noteHtml + thumbsHtml +
                    '<div class="skh-ps-tools">' + tools + '</div></div>';
                psWireGallery(key, box);
            }
        }

        // ---- hint chip ----
        var hint = cfg.hintId ? document.getElementById(cfg.hintId) : null;
        if (hint) {
            var n = items.length, min = cfg.min || 0, max = cfg.max || 6;
            var failed = items.filter(function (x) { return x.status === 'failed'; }).length;
            var txt = 'Picha ' + n + '/' + max;
            var tone = 'idle';
            if (failed) { txt += ' \u00b7 ' + failed + ' haikupanda'; tone = 'err'; }
            else if (n >= min && n > 0) { txt += ' \u00b7 tayari'; tone = 'ok'; }
            hint.textContent = txt;
            if (hint.setAttribute) hint.setAttribute('data-tone', tone);
        }

        // dropzone inakuwa ndogo baada ya picha ya kwanza
        var drop = document.getElementById('skhPsDrop');
        if (drop) drop.classList.toggle('is-compact', items.length > 0);
        var dropTxt = drop ? drop.querySelector('b') : null;
        if (dropTxt) dropTxt.textContent = items.length ? 'Ongeza picha zaidi' : 'Buruta picha hapa';

        psBindLiveInputs();
        psPaintLive(key);
    }

    // ── events za gallery (hero, thumbs, tools, drag-reorder) ──────────────
    function psWireGallery(key, box) {
        var items = itemsFor(key);
        var cfg = pickerCfg[key] || {};
        var ai = psActiveIndex(key);

        box.querySelectorAll('.skh-ps-thumb').forEach(function (btn) {
            var idx = Number(btn.getAttribute('data-i')) || 0;

            btn.addEventListener('click', function (ev) {
                var xBtn = ev.target.closest ? ev.target.closest('.ps-x') : null;
                if (xBtn) {
                    ev.preventDefault(); ev.stopPropagation();
                    psRemove(key, idx);
                    return;
                }
                cfg.active = idx;
                paintPicker(key);
            });

            // drag & drop reorder
            btn.addEventListener('dragstart', function (ev) {
                ev.dataTransfer.setData('text/plain', String(idx));
                ev.dataTransfer.effectAllowed = 'move';
                btn.setAttribute('data-drag', '1');
            });
            btn.addEventListener('dragend', function () { btn.removeAttribute('data-drag'); });
            btn.addEventListener('dragover', function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; });
            btn.addEventListener('drop', function (ev) {
                ev.preventDefault();
                var from = Number(ev.dataTransfer.getData('text/plain'));
                if (!isFinite(from) || from === idx) return;
                var moved = items.splice(from, 1)[0];
                items.splice(idx, 0, moved);
                cfg.active = idx;
                paintPicker(key);
            });
        });

        var zoomBtn = box.querySelector('.ps-zoom');
        if (zoomBtn) zoomBtn.addEventListener('click', function () {
            var it = items[ai] || items[0];
            if (it) psOpenLightbox(it.url, it.name);
        });

        box.querySelectorAll('.skh-ps-tool').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var act = btn.getAttribute('data-act');
                if (act === 'edit') {
                    psOpenEditor(key, ai);
                } else if (act === 'restore') {
                    var cur = items[ai];
                    if (cur && cur.orig) {
                        try { if (cur.url) URL.revokeObjectURL(cur.url); } catch (e) {}
                        cur.file = cur.orig.file;
                        cur.url = cur.orig.url;
                        cur.w = cur.orig.w;
                        cur.h = cur.orig.h;
                        cur.name = cur.orig.name;
                        cur.orig = null;
                        cur.edited = false;
                        cur.status = 'pending';
                        cur.error = '';
                        paintPicker(key);
                    }
                } else if (act === 'main') {
                    var moved = items.splice(ai, 1)[0];
                    items.unshift(moved);
                    cfg.active = 0;
                    paintPicker(key);
                } else if (act === 'zoom') {
                    var it = items[ai] || items[0];
                    if (it) psOpenLightbox(it.url, it.name);
                } else if (act === 'remove') {
                    psRemove(key, ai);
                } else if (act === 'add') {
                    var g = document.getElementById(key);
                    if (g) g.click();
                }
            });
        });
    }

    function psRemove(key, idx) {
        var items = itemsFor(key);
        var cfg = pickerCfg[key] || {};
        var removed = items.splice(idx, 1)[0];
        try { if (removed && removed.url) URL.revokeObjectURL(removed.url); } catch (e) {}
        if (Number(cfg.active) >= items.length) cfg.active = Math.max(0, items.length - 1);
        paintPicker(key);
    }


    // ════════════════════════════════════════════════════════════════════
    //  REKEBISHA PICHA — zungusha · ondoa background · punguza pembeni
    //  Kila kitu hufanyika hapa kwenye kifaa (canvas) — hakuna upload ya
    //  ziada, hakuna huduma ya nje. Picha halisi huhifadhiwa kwa "Rudisha".
    // ════════════════════════════════════════════════════════════════════
    var ED_SVG = {
        rotL: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a9 9 0 1 1 2.6 8"/><path d="M3 4v5h5"/></svg>',
        rotR: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 9a9 9 0 1 0-2.6 8"/><path d="M21 4v5h-5"/></svg>',
        cut: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/></svg>',
        wand: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 19 9-9"/><path d="M15 4v3M19.5 8.5h-3M18 15l-1.5-1.5M12 12l1.5 1.5"/></svg>',
        undo: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h9a5 5 0 0 1 0 10H7"/><path d="M4 10l4-4M4 10l4 4"/></svg>',
        shrink: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 20v-5h5"/><path d="M4 9l5 5M20 15l-5-5"/></svg>'
    };

    function edCanvasFromImage(img, maxEdge) {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var scale = Math.min(1, (maxEdge || 1800) / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return c;
    }

    function edLoadImage(url) {
        return new Promise(function (res, rej) {
            var img = new Image();
            img.onload = function () { res(img); };
            img.onerror = rej;
            img.src = url;
        });
    }

    // Background removal: kusafisha rangi ya pembezoni (border) kwa flood-fill.
    // Inafanya kazi vizuri kwa picha za bidhaa zenye background moja (nyeupe,
    // kijivu, rangi moja) — ndiyo hali ya picha nyingi za sokoni.
    function edRemoveBackground(canvas, tol, soft) {
        var ctx = canvas.getContext('2d');
        var W = canvas.width, H = canvas.height;
        var img;
        try { img = ctx.getImageData(0, 0, W, H); } catch (e) { return false; }
        var d = img.data, N = W * H;

        // rangi ya kumbukumbu = wastani wa pikseli za pembezoni
        var rs = 0, gs = 0, bs = 0, n = 0, i, x, y;
        var sample = function (idx) { rs += d[idx]; gs += d[idx + 1]; bs += d[idx + 2]; n++; };
        for (x = 0; x < W; x += Math.max(1, Math.round(W / 200))) { sample(x * 4); sample(((H - 1) * W + x) * 4); }
        for (y = 0; y < H; y += Math.max(1, Math.round(H / 200))) { sample((y * W) * 4); sample((y * W + W - 1) * 4); }
        var R = rs / n, G = gs / n, B = bs / n;

        var lim = tol * tol * 3;           // umbali wa rangi (RGB)
        var visited = new Uint8Array(N);
        var q = new Int32Array(N), qh = 0, qt = 0;
        var push = function (idx) { if (!visited[idx]) { visited[idx] = 1; q[qt++] = idx; } };
        for (x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
        for (y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }

        while (qh < qt) {
            i = q[qh++];
            var o = i * 4;
            var dr = d[o] - R, dg = d[o + 1] - G, db = d[o + 2] - B;
            if (dr * dr + dg * dg + db * db > lim) continue;   // ni sehemu ya bidhaa
            x = i % W; y = (i - x) / W;
            if (x > 0) push(i - 1);
            if (x < W - 1) push(i + 1);
            if (y > 0) push(i - W);
            if (y < H - 1) push(i + W);
        }

        // weka alpha = 0 kwa background
        for (i = 0; i < N; i++) if (visited[i]) d[i * 4 + 3] = 0;

        // lainisha kingo (feather) — pikseli iliyo karibu na background
        if (soft !== false) {
            var alphaCopy = new Uint8Array(N);
            for (i = 0; i < N; i++) alphaCopy[i] = d[i * 4 + 3];
            for (y = 1; y < H - 1; y++) {
                for (x = 1; x < W - 1; x++) {
                    i = y * W + x;
                    if (!alphaCopy[i]) continue;
                    if (!alphaCopy[i - 1] || !alphaCopy[i + 1] || !alphaCopy[i - W] || !alphaCopy[i + W]) {
                        d[i * 4 + 3] = 150;
                    }
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return true;
    }

    // Punguza pembeni tupu (trim) kulingana na alpha / rangi moja ya pembe
    function edTrim(canvas, padPct) {
        var ctx = canvas.getContext('2d');
        var W = canvas.width, H = canvas.height;
        var img;
        try { img = ctx.getImageData(0, 0, W, H); } catch (e) { return canvas; }
        var d = img.data;
        var minX = W, minY = H, maxX = -1, maxY = -1;
        for (var y = 0; y < H; y++) {
            for (var x = 0; x < W; x++) {
                if (d[(y * W + x) * 4 + 3] > 12) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return canvas;
        var pad = Math.round(Math.max(maxX - minX, maxY - minY) * (padPct == null ? 0.04 : padPct));
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
        var cw = maxX - minX + 1, ch = maxY - minY + 1;
        if (cw >= W && ch >= H) return canvas;
        var out = document.createElement('canvas');
        out.width = cw; out.height = ch;
        out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
        return out;
    }

    function edRotate(canvas, dir) {
        var out = document.createElement('canvas');
        out.width = canvas.height;
        out.height = canvas.width;
        var ctx = out.getContext('2d');
        ctx.translate(out.width / 2, out.height / 2);
        ctx.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        return out;
    }

    function edFlatten(canvas, bg) {
        var out = document.createElement('canvas');
        out.width = canvas.width; out.height = canvas.height;
        var ctx = out.getContext('2d');
        if (bg && bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, out.width, out.height); }
        ctx.drawImage(canvas, 0, 0);
        return out;
    }

    function edCompress(canvas, maxEdge, quality, asPng) {
        var w = canvas.width, h = canvas.height;
        var scale = Math.min(1, (maxEdge || 1600) / Math.max(w, h));
        var out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(w * scale));
        out.height = Math.max(1, Math.round(h * scale));
        var ctx = out.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, out.width, out.height);
        return new Promise(function (res) {
            out.toBlob(function (blob) { res({ canvas: out, blob: blob }); },
                asPng ? 'image/png' : 'image/jpeg', quality || 0.86);
        });
    }

    function psOpenEditor(key, idx) {
        var items = itemsFor(key);
        var it = items[idx];
        if (!it || !it.url) return;

        var state = {
            key: key, idx: idx,
            tol: 26, bg: 'transparent', busy: false,
            canvas: null, original: null, changed: false
        };

        var wrap = document.createElement('div');
        wrap.className = 'skh-ps-editor';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', 'Rekebisha picha');
        wrap.innerHTML =
            '<div class="ps-ed-sheet">' +
                '<div class="ps-ed-head">' +
                    '<div><b>Rekebisha picha</b><small>Zungusha · ondoa background · punguza pembeni</small></div>' +
                    '<button type="button" class="ps-ed-x" aria-label="Funga">\u2715</button>' +
                '</div>' +
                '<div class="ps-ed-stage"><canvas id="psEdCanvas"></canvas><div class="ps-ed-busy" hidden><span class="skh-ps-spin"></span><span>Inachakata\u2026</span></div></div>' +
                '<div class="ps-ed-body">' +
                    '<div class="ps-ed-sec"><h5>1 · Zungusha</h5><div class="ps-ed-row">' +
                        '<button type="button" class="ps-ed-btn" data-ed="rotl">' + ED_SVG.rotL + ' Kushoto</button>' +
                        '<button type="button" class="ps-ed-btn" data-ed="rotr">' + ED_SVG.rotR + ' Kulia</button>' +
                        '<button type="button" class="ps-ed-btn" data-ed="reset">' + ED_SVG.undo + ' Anza upya</button>' +
                    '</div></div>' +
                    '<div class="ps-ed-sec"><h5>2 · Background <em>mpya</em></h5><div class="ps-ed-row">' +
                        '<button type="button" class="ps-ed-btn ps-ed-btn--main" data-ed="rmbg">' + ED_SVG.wand + ' Ondoa background</button>' +
                        '<button type="button" class="ps-ed-btn" data-ed="bg-white" aria-pressed="false">Background nyeupe</button>' +
                        '<button type="button" class="ps-ed-btn" data-ed="bg-trans" aria-pressed="true">Uwazi (PNG)</button>' +
                    '</div>' +
                    '<div class="ps-ed-slider"><label for="psEdTol">Nguvu</label>' +
                        '<input type="range" id="psEdTol" min="8" max="60" step="2" value="26" aria-label="Nguvu ya kuondoa background">' +
                        '<output id="psEdTolOut">26</output></div>' +
                    '<p class="ps-ed-hint">Inafanya kazi vizuri kwa picha zenye background moja (nyeupe au rangi moja). Bonyeza “Ondoa background” tena baada ya kubadilisha nguvu.</p>' +
                    '</div>' +
                    '<div class="ps-ed-sec"><h5>3 · Pembeni na ukubwa</h5><div class="ps-ed-row">' +
                        '<button type="button" class="ps-ed-btn" data-ed="trim">' + ED_SVG.cut + ' Punguza pembeni</button>' +
                        '<button type="button" class="ps-ed-btn" data-ed="compress">' + ED_SVG.shrink + ' Punguza ukubwa</button>' +
                    '</div><p class="ps-ed-hint" id="psEdSize">—</p></div>' +
                '</div>' +
                '<div class="ps-ed-foot">' +
                    '<button type="button" class="ps-ed-btn" data-ed="cancel">Ghairi</button>' +
                    '<button type="button" class="ps-ed-btn ps-ed-btn--main" data-ed="apply">Tumia picha hii</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(wrap);

        var cv = wrap.querySelector('#psEdCanvas');
        var busy = wrap.querySelector('.ps-ed-busy');
        var sizeEl = wrap.querySelector('#psEdSize');
        var tolEl = wrap.querySelector('#psEdTol');
        var tolOut = wrap.querySelector('#psEdTolOut');
        var bgWhiteBtn = wrap.querySelector('[data-ed="bg-white"]');
        var bgTransBtn = wrap.querySelector('[data-ed="bg-trans"]');

        function setBusy(on) {
            state.busy = !!on;
            busy.hidden = !on;
            // vitufe vya kufunga/ghairi havifungwi kamwe — mtumiaji asikwame
            wrap.querySelectorAll('.ps-ed-btn').forEach(function (b) {
                var a = b.getAttribute('data-ed');
                b.disabled = !!on && a !== 'cancel';
            });
        }
        function loadError(msg) {
            state.busy = false;
            busy.hidden = true;
            cv.width = 260; cv.height = 100;
            var ctx = cv.getContext('2d');
            ctx.fillStyle = '#FDEDEA';
            ctx.fillRect(0, 0, 260, 100);
            ctx.fillStyle = '#B4442F';
            ctx.font = '800 13px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Picha hii haiwezi kuhaririwa', 130, 46);
            ctx.font = '600 11px Inter, Arial, sans-serif';
            ctx.fillText(msg || 'Jaribu picha nyingine', 130, 66);
            wrap.querySelectorAll('.ps-ed-btn').forEach(function (b) {
                var a = b.getAttribute('data-ed');
                if (a !== 'cancel') b.disabled = true;
            });
        }
        function paint() {
            if (!state.canvas) return;
            cv.width = state.canvas.width;
            cv.height = state.canvas.height;
            var ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.drawImage(state.canvas, 0, 0);
            var c = state.canvas;
            sizeEl.textContent = 'Ukubwa: ' + c.width + ' \u00d7 ' + c.height + ' px';
        }
        function setBg(mode) {
            state.bg = mode;
            bgWhiteBtn.setAttribute('aria-pressed', mode === 'white' ? 'true' : 'false');
            bgTransBtn.setAttribute('aria-pressed', mode === 'transparent' ? 'true' : 'false');
            paint();
        }
        function snapshot() { return state.canvas; }
        function replace(canvas) { state.canvas = canvas; state.changed = true; paint(); }

        // load
        setBusy(true);
        var loadTimer = setTimeout(function () {
            if (!state.canvas) loadError('Imepita muda mrefu kupakia');
        }, 12000);
        edLoadImage(it.url).then(function (img) {
            clearTimeout(loadTimer);
            if (!img.naturalWidth && !img.width) { loadError('Faili si picha halali'); return; }
            var base = edCanvasFromImage(img, 1800);
            state.original = base;
            state.canvas = base;
            setBusy(false);
            paint();
        }).catch(function () {
            clearTimeout(loadTimer);
            loadError('Faili si picha halali');
        });

        tolEl.addEventListener('input', function () {
            state.tol = Number(tolEl.value) || 26;
            tolOut.textContent = String(state.tol);
        });

        wrap.addEventListener('click', function (ev) {
            if (ev.target === wrap) close();
        });

        function close() {
            document.removeEventListener('keydown', onKey);
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        }
        function onKey(e) { if (e.key === 'Escape') close(); }
        document.addEventListener('keydown', onKey);
        wrap.querySelector('.ps-ed-x').addEventListener('click', close);

        wrap.querySelectorAll('[data-ed]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                if (state.busy) return;
                var act = btn.getAttribute('data-ed');
                if (act === 'cancel') { close(); return; }
                if (act === 'reset') {
                    state.canvas = edFlatten(state.original, 'transparent');
                    state.changed = false;
                    state.bgDone = false;
                    state.bgBase = null;
                    paint();
                    return;
                }
                if (act === 'rotl' || act === 'rotr') {
                    replace(edRotate(state.canvas, act === 'rotr' ? 1 : -1));
                    return;
                }
                if (act === 'rmbg') {
                    setBusy(true);
                    setTimeout(function () {
                        // mara ya kwanza: hifadhi nakala safi ili "Nguvu" iweze kurudiwa
                        if (!state.bgBase) {
                            var b = document.createElement('canvas');
                            b.width = state.canvas.width; b.height = state.canvas.height;
                            b.getContext('2d').drawImage(state.canvas, 0, 0);
                            state.bgBase = b;
                        }
                        var flat = document.createElement('canvas');
                        flat.width = state.bgBase.width; flat.height = state.bgBase.height;
                        flat.getContext('2d').drawImage(state.bgBase, 0, 0);

                        var ok = edRemoveBackground(flat, state.tol, true);
                        if (ok) {
                            flat = edTrim(flat, 0.04);
                            state.bgDone = true;
                            replace(edFlatten(flat, state.bg === 'white' ? '#ffffff' : 'transparent'));
                        }
                        setBusy(false);
                    }, 30);
                    return;
                }
                if (act === 'bg-white' || act === 'bg-trans') {
                    setBg(act === 'bg-white' ? 'white' : 'transparent');
                    return;
                }
                if (act === 'trim') {
                    var cut = edTrim(edFlatten(state.canvas, 'transparent'), 0.04);
                    replace(edFlatten(cut, state.bg === 'white' ? '#ffffff' : 'transparent'));
                    return;
                }
                if (act === 'compress') {
                    setBusy(true);
                    var asPng = state.bg === 'transparent';
                    edCompress(edFlatten(state.canvas, asPng ? 'transparent' : '#ffffff'), 1600, 0.84, asPng)
                        .then(function (r) {
                            replace(r.canvas);
                            var kb = r.blob ? Math.round(r.blob.size / 1024) : 0;
                            sizeEl.textContent = 'Ukubwa: ' + r.canvas.width + ' \u00d7 ' + r.canvas.height + ' px \u00b7 ' + (kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB');
                            setBusy(false);
                        }).catch(function () { setBusy(false); });
                    return;
                }
                if (act === 'apply') {
                    setBusy(true);
                    var png = state.bg === 'transparent';
                    var flat = edFlatten(state.canvas, png ? 'transparent' : '#ffffff');
                    edCompress(flat, 1800, 0.9, png).then(function (r) {
                        if (!r.blob) { setBusy(false); return; }
                        var base = (it.name || 'picha').replace(/\.[^.]+$/, '');
                        var f = new File([r.blob], base + (png ? '-nobg.png' : '.jpg'),
                            { type: png ? 'image/png' : 'image/jpeg' });
                        // hifadhi picha halisi mara moja kwa "Rudisha picha halisi"
                        if (!it.orig) it.orig = { file: it.file, url: it.url, w: it.w, h: it.h, name: it.name };
                        it.file = f;
                        it.name = f.name;
                        it.edited = true;
                        it.w = r.canvas.width;
                        it.h = r.canvas.height;
                        it.status = 'pending';
                        it.error = '';
                        var nu = '';
                        try { nu = URL.createObjectURL(f); } catch (e) {}
                        if (nu) it.url = nu;
                        pickerCfg[key].active = idx;
                        close();
                        paintPicker(key);
                    }).catch(function () { setBusy(false); });
                }
            });
        });
    }

    // ── dropzone: buruta na uachie + kibonyezo ─────────────────────────────
    var psDropBound = {};
    function psBindDropzone(key) {
        if (psDropBound[key]) return;
        var drop = document.getElementById('skhPsDrop');
        var input = document.getElementById(key);
        if (!drop || !input) return;
        psDropBound[key] = true;
        var stop = function (e) { e.preventDefault(); e.stopPropagation(); };

        drop.addEventListener('click', function () { input.click(); });
        drop.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        ['dragenter', 'dragover'].forEach(function (t) {
            drop.addEventListener(t, function (e) { stop(e); drop.classList.add('is-over'); });
        });
        ['dragleave', 'dragend'].forEach(function (t) {
            drop.addEventListener(t, function (e) { stop(e); drop.classList.remove('is-over'); });
        });
        drop.addEventListener('drop', function (e) {
            stop(e);
            drop.classList.remove('is-over');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                addFiles(key, e.dataTransfer.files);
            }
        });
        // pia buruta picha juu ya fomu nzima isiendelee (browser haifungui faili)
        window.addEventListener('dragover', function (e) { if (e.dataTransfer) e.preventDefault(); });
        window.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });
    }

    function addFiles(key, fileList) {
        var cfg = pickerCfg[key] || {};
        var max = cfg.max || 6;
        var items = itemsFor(key);
        var added = 0, skippedType = 0, skippedSize = 0, skippedCount = 0;
        Array.prototype.slice.call(fileList || []).forEach(function (f) {
            if (!/^image\//.test(f.type || '')) { skippedType++; return; }
            if (f.size && f.size > window.SOKOHAI_UPLOADS.maxBytes) { skippedSize++; return; }
            if (items.length >= max) { skippedCount++; return; }
            var url = '';
            try { url = URL.createObjectURL(f); } catch (e) {}
            var item = { file: f, url: url, status: 'pending', error: '', name: f.name, w: 0, h: 0 };
            items.push(item);
            added++;
            // pima azimio halisi la picha (kwa chips za ubora + onyo la uwiano)
            if (url) {
                (function (it) {
                    var probe = new Image();
                    probe.onload = function () {
                        it.w = probe.naturalWidth || 0;
                        it.h = probe.naturalHeight || 0;
                        paintPicker(key);
                    };
                    probe.onerror = function () { it.w = 0; it.h = 0; };
                    probe.src = url;
                })(item);
            }
        });
        paintPicker(key);
        if (skippedType) pickerToast('Faili ' + skippedType + ' si picha — zimeondolewa.');
        if (skippedSize) pickerToast('Picha ' + skippedSize + ' ni kubwa mno (zaidi ya 12MB) — zimeondolewa.');
        if (skippedCount) pickerToast('Upeo ni picha ' + max + '. Zilizozidi zimeondolewa.');
        return added;
    }

    function bindPicker(cfg) {
        var key = cfg.galleryInput;
        if (!key) return null;
        var existing = pickerCfg[key];
        if (existing && existing.bound) return pickerHandle(key);   // idempotent

        pickerCfg[key] = {
            galleryInput: key,
            cameraInput: cfg.cameraInput || '',
            previewId: cfg.previewId || '',
            hintId: cfg.hintId || '',
            max: cfg.max || window.SOKOHAI_UPLOADS.maxFiles,
            min: cfg.min || 0,
            bound: true
        };
        if (!pickerItems[key]) pickerItems[key] = [];

        var onPick = function (inputEl) {
            if (!inputEl || !inputEl.files) return;
            addFiles(key, inputEl.files);
            inputEl.value = '';   // ruhusu kuchagua faili ile ile tena
        };
        var g = document.getElementById(key);
        var c = cfg.cameraInput ? document.getElementById(cfg.cameraInput) : null;
        if (g) { g.addEventListener('change', function () { onPick(g); }); pickerCfg[key].galleryEl = g; }
        if (c) { c.addEventListener('change', function () { onPick(c); }); pickerCfg[key].cameraEl = c; }

        psBindDropzone(key);

        window.skhClearPickedPhotos = window.skhClearPickedPhotos || {};
        window.skhClearPickedPhotos[key] = function () {
            itemsFor(key).forEach(function (it) { try { if (it.url) URL.revokeObjectURL(it.url); } catch (e) {} });
            pickerItems[key] = [];
            if (pickerCfg[key]) pickerCfg[key].active = 0;
            paintPicker(key);
        };
        paintPicker(key);
        return pickerHandle(key);
    }

    function pickerHandle(key) {
        return {
            reset: function () { if (window.skhClearPickedPhotos && window.skhClearPickedPhotos[key]) window.skhClearPickedPhotos[key](); },
            files: function () { return filesFor(key); },
            count: function () { return itemsFor(key).length; }
        };
    }

    window.skhInitPhotoPicker = function (cfg) { return bindPicker(cfg || {}); };
    window.skhPhotoPickerFiles = function (inputId) { return filesFor(inputId); };
    window.skhPhotoPickerReset = function (inputId) { if (window.skhClearPickedPhotos && window.skhClearPickedPhotos[inputId]) window.skhClearPickedPhotos[inputId](); };

    // Auto-bind: <div data-skh-photo-picker='{"galleryInput":"prodImage",...}'>
    // This is why load order no longer matters — the markup declares the picker
    // and it is bound as soon as this module runs (or on DOMContentLoaded).
    window.skhAutoBindPhotoPickers = function () {
        var nodes = document.querySelectorAll('[data-skh-photo-picker]');
        Array.prototype.forEach.call(nodes, function (n) {
            if (n.getAttribute('data-skh-bound') === '1') return;
            var cfg = {};
            try { cfg = JSON.parse(n.getAttribute('data-skh-photo-picker') || '{}'); } catch (e) { cfg = {}; }
            if (!cfg.galleryInput) return;
            try { bindPicker(cfg); n.setAttribute('data-skh-bound', '1'); }
            catch (e) { console.warn('[photo-picker] bind imeshindikana:', e && e.message); }
        });
    };
    window.skhAutoBindPhotoPickers();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.skhAutoBindPhotoPickers);
    // Modals are sometimes injected later; a couple of cheap retries cover that.
    [0, 400, 1200, 3000].forEach(function (ms) { setTimeout(function () { try { window.skhAutoBindPhotoPickers(); } catch (e) {} }, ms); });

    // Upload the picked photos (compression + signed Cloudinary upload).
    // Keeps the original contract: resolves to an array of URLs.
    window.skhUploadPicked = async function (inputId, max, opts) {
        var items = itemsFor(inputId);
        if (!items.length) {
            // legacy fallback: a plain <input type=file multiple> with files still in it
            return await window.skhUploadManyFromInput(inputId, max || 6, opts);
        }
        var limit = Math.min(items.length, max || 6);
        var urls = [];
        window.skhUploadLastError = null;
        paintPicker(inputId);
        for (var i = 0; i < limit; i++) {
            items[i].status = 'uploading';
            paintPicker(inputId);
            var r = await window.skhUploadFromFile(items[i].file, opts);
            if (r && r.url) { items[i].status = 'done'; items[i].error = ''; urls.push(r.url); }
            else {
                items[i].status = 'failed';
                items[i].error = (window.skhUploadLastError && window.skhUploadLastError.message) || 'Picha haikupanda.';
                console.error('Kosa kupandisha picha ya ' + (i + 1) + ': ' + items[i].error);
            }
            paintPicker(inputId);
        }
        return urls;
    };

    // Same as above but tells the caller exactly what went wrong (used by the
    // product form so the seller never sees a misleading message).
    window.skhUploadPickedDetailed = async function (inputId, max, opts) {
        var items = itemsFor(inputId);
        var urls = await window.skhUploadPicked(inputId, max, opts);
        return {
            urls: urls,
            attempted: Math.min(items.length, max || 6),
            failed: items.filter(function (x) { return x.status === 'failed'; }).map(function (x) { return { name: x.name, error: x.error }; })
        };
    };

    window.skhUploadManyFromInput = async function (inputId, max, opts) {
        const el = document.getElementById(inputId);
        if (!el || !el.files || el.files.length === 0) return [];
        const urls = [];
        const n = Math.min(el.files.length, max || 4);
        for (let i = 0; i < n; i++) {
            const r = await window.skhUploadFromFile(el.files[i], opts);
            if (r) urls.push(r.url);
            else console.error('Kosa kupandisha picha ya ' + i);
        }
        return urls;
    };
})();

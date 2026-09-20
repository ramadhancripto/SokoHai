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
// ============================================================
(function () {
    'use strict';

    window.SOKOHAI_UPLOADS = {
        cloud: 'dt7erwy1r',          // Cloudinary cloud name (si siri)
        preset: 'Sokohai_preset'     // unsigned preset (funga kwenye dashboard — ona tools/CLOUDINARY_CHECKLIST.md)
    };

    // [PHASE 5.7] tile ya SOKOHAI kwa bidhaa zisizo na picha — SVG data-URI
    // (HAIITAJI MTANDAO; badala ya avatar kijivu ya nje iliyokuwa ikionekana kama prototype)
    if (!window.SKH_PLACEHOLDER_IMG) {
        window.SKH_PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">' +
            '<rect width="500" height="500" fill="#e8f0f7"/>' +
            '<rect x="20" y="20" width="460" height="460" rx="28" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>' +
            '<circle cx="250" cy="205" r="78" fill="#00509d" opacity="0.92"/>' +
            '<path d="M215 190 h70 l-9 66 a8 8 0 0 1 -8 7 h-36 a8 8 0 0 1 -8 -7 z" fill="#f6c445"/>' +
            '<path d="M228 190 a22 22 0 0 1 44 0" fill="none" stroke="#0f172a" stroke-width="7" stroke-linecap="round"/>' +
            '<text x="250" y="330" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="bold" fill="#0f172a" text-anchor="middle">SOKOHAI</text>' +
            '<text x="250" y="372" font-family="Arial,Helvetica,sans-serif" font-size="22" fill="#64748b" text-anchor="middle">Picha inakuja hivi karibuni</text>' +
            '</svg>');
    }

    // [PHASE 5.7] MGANDAMIZO WA PICHA (client-side) — kabla ya upload:
    // picha kubwa (>kB 300 au ukubwa >1600px) inabanwa kuwa JPEG chini ya
    // 1600px ubora 82%. Manufaa: uploads za haraka kwenye mtandao wa TZ,
    // Cloudinary inarudi haraka, na bidhaa zinapakiwa hata kwa simu ya kawaida.
    // Picha Ndogo / si-picha (video, pdf) zinapita bila kuguswa.
    window.SOKOHAI_UPLOADS.compress = { minBytes: 300 * 1024, maxEdge: 1600, quality: 0.82 };

    window.skhCompressImageFile = async function (file) {
        var cfg = window.SOKOHAI_UPLOADS.compress;
        try {
            if (!file || file.type !== 'image/jpeg' && file.type !== 'image/png' && file.type !== 'image/webp') return file; // si picha inayobanika
            if (file.size && file.size < cfg.minBytes) return file; // ndogo tayari — pita
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
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch); // PNG transparent -> nyeupe
            ctx.drawImage(img, 0, 0, cw, ch);
            var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', cfg.quality); });
            if (!blob || blob.size >= (file.size || Infinity)) return file; // hakuwa na faida
            var out = new File([blob], (file.name || 'picha').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
            return out;
        } catch (e) {
            try { if (typeof URL !== 'undefined' && URL.revokeObjectURL && url) URL.revokeObjectURL(url); } catch (e2) {}
            return file; // kosa lolote -> picha ya asili (upload inaendelea)
        }
    };

    window.skhUploadFromFile = async function (file, opts) {
        opts = opts || {};
        if (!file) return null;
        try {
            if (window.skhCompressImageFile && (opts.resourceType === 'image' || opts.resourceType === 'auto' || !opts.resourceType)) {
                try { file = await window.skhCompressImageFile(file); } catch (e) { /* picha ya asili */ }
            }
            const fd = new FormData();
            fd.append('file', file);
            fd.append('upload_preset', window.SOKOHAI_UPLOADS.preset);
            if (opts.folder) fd.append('folder', opts.folder);

            const resource = opts.resourceType || 'auto'; // 'auto' | 'image' | 'video' | 'raw'
            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${window.SOKOHAI_UPLOADS.cloud}/${resource}/upload`,
                { method: 'POST', body: fd }
            );
            const data = await res.json();
            if (!data || !data.secure_url) {
                console.error('skhUploadFromFile: hakuna secure_url', data);
                return null;
            }
            return { url: data.secure_url, data: data };
        } catch (e) {
            console.error('skhUploadFromFile:', e);
            return null;
        }
    };

    // Kutoka input ya file (single) — inabadilisha uploadImage() ya zamani
    window.skhUploadFromInput = async function (inputId, opts) {
        const el = document.getElementById(inputId);
        const file = el && el.files ? el.files[0] : null;
        if (!file) return null;
        const r = await window.skhUploadFromFile(file, opts);
        return r ? r.url : null;
    };

    // [PHASE 5.7] PHOTO-PICKER YA BIDHAA: kamera (capture) + galari (multiple)
    // + previews zenye kufuta. Faili zinakusanywa kwenye orodha moja hadi upload.
    var picked = {}; // inputId -> [File]
    window.skhInitPhotoPicker = function (cfg) {
        // cfg: { galleryInput, cameraInput, previewId, max, hintId }
        var max = cfg.max || 6;
        picked[cfg.galleryInput] = picked[cfg.galleryInput] || [];
        var list = function () { return picked[cfg.galleryInput]; };

        function render() {
            var box = document.getElementById(cfg.previewId);
            if (!box) return;
            while (box.firstChild) box.removeChild(box.firstChild);
            list().forEach(function (f, i) {
                var d = document.createElement('div');
                d.style.cssText = 'position:relative;width:64px;height:64px;border-radius:10px;overflow:hidden;border:1.5px solid #cbd5e1;';
                var im = document.createElement('img');
                im.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                try { im.src = URL.createObjectURL(f); } catch (e) { im.alt = 'picha'; }
                var x = document.createElement('button');
                x.type = 'button';
                x.textContent = '\u2715';
                x.style.cssText = 'position:absolute;top:1px;right:1px;width:20px;height:20px;border:none;border-radius:50%;background:rgba(15,23,42,.85);color:#fff;font-size:11px;cursor:pointer;line-height:1;';
                x.onclick = function () { list().splice(i, 1); render(); };
                d.appendChild(im); d.appendChild(x);
                box.appendChild(d);
            });
            var min = cfg.min || 1;
            var hint = cfg.hintId ? document.getElementById(cfg.hintId) : null;
            if (hint) {
                var remain = Math.max(0, min - list().length);
                hint.textContent = 'Picha ' + list().length + '/' + max
                    + (remain > 0 ? ' (ongeza angalau ' + remain + ' zaidi)' : ' \u2713 zimekamilika');
            }
        }
        function addFrom(inputEl) {
            if (!inputEl || !inputEl.files) return;
            var fs = Array.prototype.slice.call(inputEl.files);
            fs.forEach(function (f) { if (list().length < max && /^image\//.test(f.type || '')) list().push(f); });
            inputEl.value = ''; // ruhusu kuchagua tena faili ile ile
            render();
        }
        var g = document.getElementById(cfg.galleryInput);
        var c = document.getElementById(cfg.cameraInput);
        if (g) g.addEventListener('change', function () { addFrom(g); });
        if (c) c.addEventListener('change', function () { addFrom(c); });
        // futa orodha (baada ya ku-save bidhaa) — skhClearPickedPhotos(inputId)
        window.skhClearPickedPhotos = window.skhClearPickedPhotos || {};
        window.skhClearPickedPhotos[cfg.galleryInput] = function () { picked[cfg.galleryInput] = []; render(); };
        render();
        return { reset: window.skhClearPickedPhotos[cfg.galleryInput] };
    };

    // [PHASE 5.7] upload ya picha zilizochaguliwa na picker (compression + Cloudinary)
    window.skhUploadPicked = async function (inputId, max, opts) {
        var list = (picked && picked[inputId]) || [];
        if (list.length === 0) {
            // fallback ya legacy: input ya kawaida (kama picker haikutumika)
            return await window.skhUploadManyFromInput(inputId, max || 6, opts);
        }
        var urls = [];
        var n = Math.min(list.length, max || 6);
        for (var i = 0; i < n; i++) {
            var r = await window.skhUploadFromFile(list[i], opts);
            if (r) urls.push(r.url); else console.error('Kosa kupandisha picha ya ' + (i + 1));
        }
        return urls;
    };

    // Kutoka input ya file (multiple, max 4 default) — inabadilisha uploadMultipleImages()
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

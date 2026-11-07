/* ================================================================
 * 83-category-photos.js — [CATEGORY PHOTOS 2026-11-04]
 * ----------------------------------------------------------------
 * 1) Home (Nyumbani): strip ya kategoria zenye PICHA (6 + "Zaidi").
 *    - Kila kadi ina picha ya kategoria (assets/img/categories/*.webp)
 *    - Kugusa kadi = selectAdvancedCategory() ILE ILE ya mfumo
 *      (vichujio/subcategories/kazi zote zinabaki kama zilivyo)
 *    - Kadi iliyochaguliwa inaonekana wazi (is-active) na zingine
 *      zinachujwa (feed + chips) — zote zinaendelea kufanya kazi.
 *
 * 2) Category Explorer (#categoryModal): kila .cat-box inapata picha
 *    ya kategoria yake (bidhaa, huduma na usafiri). Tile ya "ZOTE"
 *    inaendelea kuwepo kama kitufe cha kuchuja (mahitaji ya awali).
 *
 * Rangi/mfumo: hakuna module au handler mpya ya biashara.
 * ================================================================ */
(function () {
    'use strict';

    var MOUNT = 'categoryPhotoStrip';
    var BUILD_LIMIT = 40;         /* explorer inaweza kuwa na makumi ya tiles */

    /* ---------- ramani: jina la kategoria -> faili la picha ---------- */
    var PHOTO = {
        /* bidhaa (advancedCategories) */
        'Vyakula na Vinywaji (Food)': 'vyakula',
        'Kilimo (Agriculture)': 'kilimo',
        'Ufugaji (Livestock)': 'mifugo',
        'Afya na Pharmacy (Health)': 'afya',
        'Mavazi na Fashoni (Fashion)': 'mavazi',
        'Vito na Saa (Luxury)': null, /* [R6] vito.webp: stock-photo watermark */
        'Electronics & Teknoloji (Tech)': 'elektroniki',
        'Samani na Nyumbani (Home)': 'samani',
        'Ujenzi na Hardware (Hardware)': 'ujenzi',
        'Magari na Vyombo (Automotive)': 'magari',
        'Vitabu na Elimu (Education)': null, /* [R6] vitabu.webp: stock-photo watermark */
        'Michezo na Mazoezi (Sports)': 'michezo',
        'Vichezeo na Michezo (Toys)': 'vichezeo',
        'Sauti na Muziki (Music)': 'muziki',
        'Sanaa na Ubunifu (Arts)': 'sanaa',
        'Dini na Utamaduni (Religion)': 'dini',
        'Zawadi na Sherehe (Gifts)': 'zawadi',
        'Pet Products (Pet)': 'pet',
        'Vifungashio na Printi (Packaging)': 'vifungashio',
        'Ulinzi na Usalama (Safety)': 'ulinzi',
        'Biashara ya Jumla (Wholesale)': 'jumla',
        'Maagizo ya Nje (Import/Export)': null, /* [R6] maagizo.webp: stock-photo watermark */
        'Vitu vya Kale na Thamani (Antiques)': null, /* [R6] kale.webp: stock-photo watermark */
        'Mchanganyiko (General Merchandise)': 'mchanganyiko',
        'Asili na Utamaduni (Traditional)': 'asili',
        /* huduma (serviceDataMap) */
        'Home & Personal': 'svc-home-personal',
        // [R6] svc-construction.webp carries a third-party watermark/phone number → same-subject ujenzi image
        'Construction & Handyman': 'ujenzi',
        'Cleaning & Maintenance': 'svc-cleaning',
        'Event & Entertainment': 'svc-event',
        'Tech & Repair': 'svc-tech',
        'Industrial Support': 'svc-industrial',
        'Agriculture Support': 'svc-agri',
        'Creative Freelancing': 'svc-creative',
        'Software & IT': 'svc-software',
        'Digital Marketing': 'svc-marketing',
        'Writing & Translation': null, /* [R6] svc-writing.webp: stock-photo watermark */
        'Media Production': 'svc-media',
        'AI Services': 'svc-ai',
        'Virtual Business': 'svc-virtual',
        'Online Coaching': null, /* [R6] svc-coaching.webp: stock-photo watermark */
        'Website Services': null, /* [R6] svc-website.webp: stock-photo watermark */
        'Remote Support': 'svc-support',
        'Food Services': 'svc-food',
        // [R6] svc-rental.webp does not show renting → clean fallback tile until the owner supplies an image
        'Rental Services': null,
        /* usafiri (deliveryTaxonomy) */
        'Passenger': 'tr-passenger',
        'Watu (Ride)': 'tr-passenger',
        'Product': 'tr-product',
        'Kawaida (Parcels)': 'tr-product',
        'Cargo': 'tr-cargo',
        'Mizigo Mikubwa': 'tr-cargo',
        'Emergency': 'tr-emergency',
        'Dharura (Express)': 'tr-emergency'
    };

    /* [REMEDIATION 2026-11 R6] ONE image map keyed by the CANONICAL category id.
       Legacy names reach it through the reviewed legacy→canonical mapping
       (skh.canonicalCategoryId). Only existing files whose subject matches the
       category are used; null = no suitable image yet → fallback tile (no 404s).
       Strategy below category level: product type → sub-category → category →
       fallback. Sub-category/product-type images are not supplied yet, so they
       resolve to the category image (SUB_PHOTO is the hook for owner images). */
    var PHOTO_BY_ID = {
        'CAT-01': 'vyakula', 'CAT-02': 'kilimo', 'CAT-03': 'kilimo', 'CAT-04': 'mifugo',
        'CAT-05': null, 'CAT-06': null, 'CAT-07': 'mavazi', 'CAT-08': null,
        'CAT-09': 'samani', 'CAT-10': 'ujenzi', 'CAT-11': 'elektroniki', 'CAT-12': 'elektroniki',
        'CAT-13': 'elektroniki', 'CAT-14': 'magari', 'CAT-15': null, 'CAT-16': 'tr-cargo',
        'CAT-19': 'afya', 'CAT-27': 'sanaa', 'CAT-28': 'asili', 'CAT-29': 'zawadi',
        'CAT-30': 'vichezeo', 'CAT-31': 'pet', 'CAT-32': null, /* [R6] vitabu.webp: stock-photo watermark */ 'CAT-33': null,
        'CAT-34': null, 'CAT-35': null, 'CAT-36': 'ulinzi', 'CAT-37': 'svc-marketing',
        'CAT-38': null, /* [R6] svc-website.webp: stock-photo watermark */ 'CAT-40': 'jumla', 'CAT-41': null, /* [R6] maagizo.webp: stock-photo watermark */ 'CAT-42': null,
        'CAT-43': null, 'CAT-44': 'mchanganyiko'
    };
    /* [R6 review 2026-11] Files carrying a stock-photo watermark (Dreamstime) or a
       third-party name/phone are never shown; they stay on disk until the owner
       replaces them with licensed images. */
    var REJECTED_IMAGES = ['svc-construction', 'svc-rental', 'huduma', 'vitabu', 'vito', 'kale', 'maagizo', 'svc-coaching', 'svc-writing', 'svc-website'];
    window.SKH_CATEGORY_REJECTED_IMAGES = REJECTED_IMAGES;
    var SUB_PHOTO = {};   /* '<CAT-xx>|<sub-category>' -> slug (owner-supplied; empty today) */
    window.SKH_CATEGORY_PHOTO_BY_ID = PHOTO_BY_ID;

    function canonId(name) {
        try { return (window.skh && typeof window.skh.canonicalCategoryId === 'function') ? window.skh.canonicalCategoryId(name) : null; } catch (e) { return null; }
    }
    /* name | legacy label | CAT-xx  →  file slug | null */
    function slugFor(name) {
        var id = canonId(name);
        if (id && Object.prototype.hasOwnProperty.call(PHOTO_BY_ID, id)) return PHOTO_BY_ID[id];
        return Object.prototype.hasOwnProperty.call(PHOTO, name) ? PHOTO[name] : null;
    }
    window.skhCategoryImage = function (ref) {
        ref = ref || {};
        var id = canonId(ref.categoryId || ref.category);
        var sub = id && ref.subcategory ? SUB_PHOTO[id + '|' + ref.subcategory] : null;
        var slug = sub || slugFor(ref.categoryId || ref.category);
        return slug ? 'assets/img/categories/' + slug + '.webp' : null;
    };

    var LABEL = {
        'Vyakula na Vinywaji (Food)': 'Vyakula',
        'Kilimo (Agriculture)': 'Kilimo',
        'Ufugaji (Livestock)': 'Mifugo',
        'Afya na Pharmacy (Health)': 'Afya',
        'Mavazi na Fashoni (Fashion)': 'Mavazi',
        'Vito na Saa (Luxury)': 'Vito na Saa',
        'Electronics & Teknoloji (Tech)': 'Elektroniki',
        'Samani na Nyumbani (Home)': 'Samani',
        'Ujenzi na Hardware (Hardware)': 'Ujenzi',
        'Magari na Vyombo (Automotive)': 'Magari',
        'Vitabu na Elimu (Education)': 'Vitabu',
        'Michezo na Mazoezi (Sports)': 'Michezo',
        'Vichezeo na Michezo (Toys)': 'Vichezeo',
        'Sauti na Muziki (Music)': 'Muziki',
        'Sanaa na Ubunifu (Arts)': 'Sanaa',
        'Dini na Utamaduni (Religion)': 'Dini',
        'Zawadi na Sherehe (Gifts)': 'Zawadi',
        'Pet Products (Pet)': 'Pet',
        'Vifungashio na Printi (Packaging)': 'Vifungashio',
        'Ulinzi na Usalama (Safety)': 'Usalama',
        'Biashara ya Jumla (Wholesale)': 'Jumla',
        'Maagizo ya Nje (Import/Export)': 'Maagizo',
        'Vitu vya Kale na Thamani (Antiques)': 'Kale',
        'Mchanganyiko (General Merchandise)': 'Mchanganyiko',
        'Asili na Utamaduni (Traditional)': 'Asili',
        'Home & Personal': 'Home & Personal',
        'Construction & Handyman': 'Ujenzi & Fundi',
        'Cleaning & Maintenance': 'Usafi',
        'Event & Entertainment': 'Matukio',
        'Tech & Repair': 'Tech & Repair',
        'Industrial Support': 'Viwanda',
        'Agriculture Support': 'Kilimo',
        'Creative Freelancing': 'Ubunifu',
        'Software & IT': 'Software & IT',
        'Digital Marketing': 'Masoko',
        'Writing & Translation': 'Uandishi',
        'Media Production': 'Media',
        'AI Services': 'AI',
        'Virtual Business': 'Biashara Mtandaoni',
        'Online Coaching': 'Mafunzo',
        'Website Services': 'Website',
        'Remote Support': 'Msaada',
        'Food Services': 'Chakula',
        'Rental Services': 'Kupangisha',
        'Zote': 'Zote'
    };

    /* strip ya Home: kategoria 6 (zile zile za design) */
    var HOME_STRIP = ['CAT-01', 'CAT-11', 'CAT-04', 'CAT-02', 'CAT-07', 'CAT-10']; // [R6] canonical ids

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function photoUrl(name) {
        var f = slugFor(name);
        return f ? 'assets/img/categories/' + f + '.webp' : null;
    }

    /* Njia mbadala: app inaweza kuhudumiwa kutoka folda ndogo (mf. GitHub Pages
       /SokoHai/) au route iliyopachikwa — hivyo tunajaribu njia kadhaa kabla ya
       kuachana na picha. */
    function photoCandidates(name) {
        var f = slugFor(name);
        if (!f) return [];
        return [
            'assets/img/categories/' + f + '.webp',
            './assets/img/categories/' + f + '.webp',
            '../assets/img/categories/' + f + '.webp',
            '/assets/img/categories/' + f + '.webp'
        ];
    }

    function imgMarkup(name, cls, alt) {
        var list = photoCandidates(name);
        if (!list.length) return fallbackMarkup(name);
        var initial = esc((labelOf(name) || '?').trim().charAt(0).toUpperCase());
        return '<img class="' + cls + '" src="' + list[0] + '" alt="' + esc(alt || labelOf(name)) + '"'
             + ' data-i="0" data-cands="' + esc(JSON.stringify(list)) + '" data-initial="' + initial + '"'
             + ' loading="lazy" decoding="async" onerror="window.skhCatImgError&&window.skhCatImgError(this)">';
    }

    /* Picha ikikosekana kabisa: weka "tile" nzuri badala ya picha tupu.
       Hivyo kategoria haionekani tupu hata faili likikosekana. */
    window.skhCatImgError = function (img) {
        if (!img) return;
        var list = [];
        try { list = JSON.parse(img.getAttribute('data-cands') || '[]'); } catch (e) {}
        var i = (+img.getAttribute('data-i') || 0) + 1;
        if (i < list.length) {
            img.setAttribute('data-i', String(i));
            img.src = list[i];
            return;
        }
        var initial = img.getAttribute('data-initial') || '?';
        var host = img.parentElement;
        if (host) {
            host.classList.add('skh-img-fallback');
            host.dataset.initial = initial;
            if (!host.querySelector('.skh-img-fallback-letter')) {
                var sp = document.createElement('span');
                sp.className = 'skh-img-fallback-letter';
                sp.setAttribute('aria-hidden', 'true');
                sp.textContent = initial;
                host.appendChild(sp);
            }
        }
        img.style.display = 'none';
        try { (window.__skhMissingCatImgs = window.__skhMissingCatImgs || new Set()).add(img.getAttribute('src')); } catch (e) {}
    };

    /* [R6] no suitable image: a neutral tile with the initial, no network request */
    function fallbackMarkup(name) {
        var initial = esc((labelOf(name) || '?').trim().charAt(0).toUpperCase());
        return '<span class="skh-img-fallback skh-img-fallback--tile" role="img" aria-label="' + esc(labelOf(name)) + '">'
             + '<span class="skh-img-fallback-letter" aria-hidden="true">' + initial + '</span></span>';
    }

    function labelOf(name) {
        if (LABEL[name]) return LABEL[name];
        try { if (/^CAT-\d{2}$/i.test(String(name)) && window.skh && window.skh.categoryLabel) return window.skh.categoryLabel(name); } catch (e) {}
        return String(name).replace(/\s*\([^)]*\)\s*$/, '');
    }

    /* ---------------- 1. HOME STRIP ---------------- */
    function buildStrip() {
        var host = document.getElementById(MOUNT);
        if (!host || host.dataset.built === '1') return;

        var cats = (window.skh && window.skh.advancedCategories) || null;
        if (!cats) return;                      /* taxonomy bado */

        var list = (window.skh && typeof window.skh.buyerProductCategories === 'function') ? window.skh.buyerProductCategories().map(function (c) { return c.value; }) : Object.keys(cats);
        var names = HOME_STRIP.filter(function (n) { return list.indexOf(n) !== -1; });
        if (names.length < 6) names = list.filter(function (n) { return !!photoUrl(n); }).slice(0, 6);
        if (!names.length) return;

        var html = '';
        names.forEach(function (n) {
            html += '<button type="button" class="cps-card" data-cat="' + esc(n) + '" title="' + esc(n) + '"'
                 + ' aria-pressed="false">'
                 + '<span class="cps-card-img">' + imgMarkup(n, 'cps-photo') + '</span>'
                 + '<span class="cps-card-name">' + esc(labelOf(n)) + '</span></button>';
        });
        /* kadi ya mwisho: Category Explorer */
        html += '<button type="button" class="cps-card cps-card--more" data-more="1"'
             + ' title="Kategoria zote" aria-label="Zaidi — kategoria zote">'
             + '<span class="cps-more-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">'
             + '<rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13" y="3" width="8" height="8" rx="1.6"/>'
             + '<rect x="3" y="13" width="8" height="8" rx="1.6"/><rect x="13" y="13" width="8" height="8" rx="1.6"/></svg></span>'
             + '<b>Zaidi</b></button>';

        host.innerHTML = html;
        host.dataset.built = '1';
        markActive(currentCategory());
    }

    var selectedCat = '';

    function currentCategory() {
        /* 0) [R6] the app state itself  1) kichwa cha feed  2) kitufe cha kategoria  3) kadi iliyoguswa */
        try {
            var a = window.skh && window.skh.activeCategory;
            if (a && a !== 'Zote' && (!window.skh.currentFeedCollection || window.skh.currentFeedCollection === 'products' || window.skh.currentFeedCollection === 'all')) return a;
        } catch (e0) {}
        try {
            var t = (document.getElementById('feedTitleText') || {}).textContent || '';
            var m = /Kategoria:\s*(.+)$/i.exec(t);
            if (m && m[1].trim() && !/zote\s*\/\s*all/i.test(m[1])) return m[1].trim();
            var t2 = (document.getElementById('activeCategoryText') || {}).textContent || '';
            var m2 = /Kategoria:\s*(.+)$/i.exec(t2);
            if (m2) return m2[1].trim();
        } catch (e) {}
        return selectedCat;
    }

    function markActive(catName) {
        var host = document.getElementById(MOUNT);
        if (!host) return;
        var want = canonId(catName) || catName;
        Array.prototype.forEach.call(host.querySelectorAll('.cps-card[data-cat]'), function (c) {
            var on = !!catName && (c.dataset.cat === catName || (canonId(c.dataset.cat) || c.dataset.cat) === want);
            c.classList.toggle('is-active', on);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    document.addEventListener('click', function (e) {
        var card = e.target.closest ? e.target.closest('#categoryPhotoStrip .cps-card') : null;
        if (!card) return;
        e.preventDefault();

        if (card.dataset.more) {
            if (typeof window.openCategoryModal === 'function') window.openCategoryModal();
            return;
        }
        var name = card.dataset.cat;
        if (!name) return;

        /* visual selection mara moja (kisha CSS/feed inachuja) */
        selectedCat = name;
        markActive(name);
        decorateSubchips();
        try {
            if (typeof window.selectAdvancedCategory === 'function') window.selectAdvancedCategory(name);
        } catch (err) {}
    });

    /* rudisha hali ya kuchaguliwa kadri feed inavyobadilika */
    function watchCategoryText() {
        ['activeCategoryText', 'feedTitleText'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el.__cpsWatch) return;
            el.__cpsWatch = true;
            new MutationObserver(function () { markActive(currentCategory()); })
                .observe(el, { childList: true, characterData: true, subtree: true });
        });
    }

    /* ---------------- 2. CATEGORY EXPLORER PHOTOS ---------------- */
    function decorateExplorer() {
        var modal = document.getElementById('categoryModal');
        if (!modal) return;
        var boxes = modal.querySelectorAll('.cat-box');
        for (var i = 0; i < boxes.length; i++) {
            var box = boxes[i];
            if (box.dataset.cpsDone === '1') continue;
            var nameEl = box.querySelector('.cat-name');
            var raw = nameEl ? nameEl.textContent.trim() : '';
            /* majina kwenye explorer ni UPPERCASE — tunalinganisha kwa case-insensitive */
            var url = null, matched = null;
            /* [R6] product tiles carry data-cat (canonical id or legacy label) */
            if (box.dataset.cat) {
                var icon0 = box.querySelector('.cat-icon');
                if (icon0) {
                    icon0.classList.add('skh-cat-photo');
                    icon0.innerHTML = imgMarkup(box.dataset.cat, 'skh-cat-img', labelOf(box.dataset.cat));
                }
                if (nameEl) nameEl.textContent = labelOf(box.dataset.cat);
                box.dataset.cpsDone = '1';
                continue;
            }
            for (var k in PHOTO) {
                if (raw.toLowerCase() === k.toLowerCase()) { url = photoUrl(k); matched = k; break; }
            }
            if (!url && !matched) {
                for (var k2 in PHOTO) {
                    if (raw && k2.toUpperCase().indexOf(raw) !== -1) { url = photoUrl(k2); matched = k2; break; }
                }
            }
            var icon = box.querySelector('.cat-icon');
            if ((url || matched) && icon) { // [R6] known category without a usable image → neutral tile
                icon.classList.add('skh-cat-photo');
                icon.innerHTML = imgMarkup(matched, 'skh-cat-img', raw);
                if (nameEl) nameEl.textContent = labelOf(matched);
            }
            box.dataset.cpsDone = '1';
        }
        /* onyesha tile iliyochaguliwa */
        var cur = currentCategory();
        var curId = canonId(cur);
        Array.prototype.forEach.call(boxes, function (b) {
            var n = (b.querySelector('.cat-name') || {}).textContent || '';
            var on = !!cur && ((curId && b.dataset.cat && canonId(b.dataset.cat) === curId) || n.trim().toLowerCase() === labelOf(cur).toLowerCase());
            b.classList.toggle('is-active', on);
        });
    }

    /* ---------------- 3. SUB-CATEGORY CHIPS (+ picha ndogo) ---------------- */
    var lastCat = '';
    /* [REMEDIATION R5] the product category strip belongs to products/home only;
       Services and Transport keep their own category lists. */
    function syncStripVisibility() {
        var host = document.getElementById(MOUNT);
        if (!host) return;
        var col = window.skh && window.skh.currentFeedCollection;
        var hide = col === 'services' || col === 'drivers';
        if (host.hidden !== hide) host.hidden = hide;
        var sec = host.closest ? host.closest('section') : null;   // the "Gundua Soko" heading goes with it
        if (sec && sec.hidden !== hide) sec.hidden = hide;
    }
    window.skhCategoryStripSync = syncStripVisibility;

    function decorateSubchips() {
        syncStripVisibility();
        var row = document.getElementById('subcatRow');
        if (!row) return;
        var cur = currentCategory();
        if (cur) lastCat = cur;
        // [R6] chips use the parent category's own image; without one they stay plain
        // (no "?" tile, never another category's photo)
        // [R12] the parent's photo repeated on every chip told the buyer nothing (every chip looked
        // the same). Only "Zote" carries the category photo; a sub-category gets a photo only when
        // it has its own (SUB_PHOTO), otherwise it is a clean text chip.
        if (!lastCat) return;
        var catId = canonId(lastCat) || lastCat;
        Array.prototype.forEach.call(row.children, function (chip) {
            if (!chip || chip.dataset.cpsChip === '1') return;
            var txt = (chip.textContent || '').trim();
            if (!txt) return;
            var subSlug = SUB_PHOTO[catId + '|' + (chip.dataset.sub || txt)];
            var isAll = (chip.dataset.sub || txt) === 'Zote';
            if (!subSlug && !(isAll && photoUrl(lastCat))) { chip.dataset.cpsChip = '1'; return; }
            var sp = document.createElement('span');
            sp.className = 'cps-chip-ico';
            sp.innerHTML = subSlug
                ? '<img class="cps-chip-img" src="assets/img/categories/' + subSlug + '.webp" alt="" loading="lazy" decoding="async">'
                : imgMarkup(lastCat, 'cps-chip-img', '');
            chip.insertBefore(sp, chip.firstChild);
            chip.dataset.cpsChip = '1';
            chip.classList.add('cps-chip');
        });
    }

    /* ---------------- 5. UKAGUZI WA PICHA (diagnostics) ----------------
       Kama faili za picha hazipo kwenye kompyuta/server, tunatoa orodha
       kamili kwenye console ili ijulikane papo hapo. */
    window.skhCategoryAssetCheck = function () {
        var slugs = [];
        for (var k in PHOTO) if (PHOTO[k] && slugs.indexOf(PHOTO[k]) === -1) slugs.push(PHOTO[k]);
        for (var k3 in PHOTO_BY_ID) if (PHOTO_BY_ID[k3] && slugs.indexOf(PHOTO_BY_ID[k3]) === -1) slugs.push(PHOTO_BY_ID[k3]);
        var base = 'assets/img/categories/';
        var results = [];
        return Promise.all(slugs.map(function (f) {
            var url = base + f + '.webp';
            return fetch(url, { method: 'HEAD' })
                .then(function (r) { results.push({ file: url, ok: r.ok, status: r.status }); })
                .catch(function () { results.push({ file: url, ok: false, status: 0 }); });
        })).then(function () {
            var missing = results.filter(function (r) { return !r.ok; });
            if (missing.length) {
                console.warn('[SokoHai] Picha ' + missing.length + '/' + results.length +
                    ' za kategoria hazipo. Weka folda "assets/img/categories/" kwenye mzizi wa app. Orodha:',
                    missing.map(function (m) { return m.file; }));
            } else {
                console.log('[SokoHai] Picha zote ' + results.length + ' za kategoria zipo ✓');
            }
            return { total: results.length, missing: missing.map(function (m) { return m.file; }) };
        });
    };

    function watchExplorer() {
        var modal = document.getElementById('categoryModal');
        if (!modal || modal.__cpsWatch) return;
        modal.__cpsWatch = true;
        new MutationObserver(function () { decorateExplorer(); })
            .observe(modal, { childList: true, subtree: true });
        decorateExplorer();
    }

    /* ---------------- boot ---------------- */
    function boot() {
        buildStrip();
        var tries = 0;
        var t = setInterval(function () {
            buildStrip();
            watchCategoryText();
            watchExplorer();
            if ((document.getElementById(MOUNT) || {}).dataset && document.getElementById(MOUNT).dataset.built === '1') {
                if (++tries > 3) clearInterval(t);
            } else if (++tries > 40) clearInterval(t);
        }, 250);
        watchCategoryText();
        watchExplorer();
        decorateSubchips();
        setInterval(decorateSubchips, 1500);
        /* ukaguzi wa picha mara moja (console pekee) */
        setTimeout(function () { try { window.skhCategoryAssetCheck(); } catch (e) {} }, 4000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    window.skhCategoryStripRebuild = function () {
        var h = document.getElementById(MOUNT);
        if (h) h.dataset.built = '0';
        buildStrip();
    };
})();

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
        'Vito na Saa (Luxury)': 'vito',
        'Electronics & Teknoloji (Tech)': 'elektroniki',
        'Samani na Nyumbani (Home)': 'samani',
        'Ujenzi na Hardware (Hardware)': 'ujenzi',
        'Magari na Vyombo (Automotive)': 'magari',
        'Vitabu na Elimu (Education)': 'vitabu',
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
        'Maagizo ya Nje (Import/Export)': 'maagizo',
        'Vitu vya Kale na Thamani (Antiques)': 'kale',
        'Mchanganyiko (General Merchandise)': 'mchanganyiko',
        'Asili na Utamaduni (Traditional)': 'asili',
        /* huduma (serviceDataMap) */
        'Home & Personal': 'svc-home-personal',
        'Construction & Handyman': 'svc-construction',
        'Cleaning & Maintenance': 'svc-cleaning',
        'Event & Entertainment': 'svc-event',
        'Tech & Repair': 'svc-tech',
        'Industrial Support': 'svc-industrial',
        'Agriculture Support': 'svc-agri',
        'Creative Freelancing': 'svc-creative',
        'Software & IT': 'svc-software',
        'Digital Marketing': 'svc-marketing',
        'Writing & Translation': 'svc-writing',
        'Media Production': 'svc-media',
        'AI Services': 'svc-ai',
        'Virtual Business': 'svc-virtual',
        'Online Coaching': 'svc-coaching',
        'Website Services': 'svc-website',
        'Remote Support': 'svc-support',
        'Food Services': 'svc-food',
        'Rental Services': 'svc-rental',
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
    var HOME_STRIP = [
        'Vyakula na Vinywaji (Food)',
        'Electronics & Teknoloji (Tech)',
        'Ufugaji (Livestock)',
        'Kilimo (Agriculture)',
        'Mavazi na Fashoni (Fashion)',
        'Ujenzi na Hardware (Hardware)'
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function photoUrl(name) {
        var f = PHOTO[name];
        return f ? 'assets/img/categories/' + f + '.webp' : null;
    }

    /* Njia mbadala: app inaweza kuhudumiwa kutoka folda ndogo (mf. GitHub Pages
       /SokoHai/) au route iliyopachikwa — hivyo tunajaribu njia kadhaa kabla ya
       kuachana na picha. */
    function photoCandidates(name) {
        var f = PHOTO[name];
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
        if (!list.length) return '';
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

    function labelOf(name) {
        return LABEL[name] || String(name).replace(/\s*\([^)]*\)\s*$/, '');
    }

    /* ---------------- 1. HOME STRIP ---------------- */
    function buildStrip() {
        var host = document.getElementById(MOUNT);
        if (!host || host.dataset.built === '1') return;

        var cats = (window.skh && window.skh.advancedCategories) || null;
        if (!cats) return;                      /* taxonomy bado */

        var names = HOME_STRIP.filter(function (n) { return !!cats[n]; });
        if (names.length < 6) names = Object.keys(cats).filter(function (n) { return !!photoUrl(n); }).slice(0, 6);
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
        /* 1) kichwa cha feed (chanzo halisi)  2) kitufe cha kategoria  3) kadi iliyoguswa */
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
        Array.prototype.forEach.call(host.querySelectorAll('.cps-card[data-cat]'), function (c) {
            var on = !!catName && c.dataset.cat === catName;
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
            for (var k in PHOTO) {
                if (raw.toLowerCase() === k.toLowerCase()) { url = photoUrl(k); matched = k; break; }
            }
            if (!url) {
                for (var k2 in PHOTO) {
                    if (raw && k2.toUpperCase().indexOf(raw) !== -1) { url = photoUrl(k2); matched = k2; break; }
                }
            }
            var icon = box.querySelector('.cat-icon');
            if (url && icon) {
                icon.classList.add('skh-cat-photo');
                icon.innerHTML = imgMarkup(matched, 'skh-cat-img', raw);
                if (nameEl) nameEl.textContent = labelOf(matched);
            }
            box.dataset.cpsDone = '1';
        }
        /* onyesha tile iliyochaguliwa */
        var cur = currentCategory();
        Array.prototype.forEach.call(boxes, function (b) {
            var n = (b.querySelector('.cat-name') || {}).textContent || '';
            b.classList.toggle('is-active', !!cur && n.trim().toLowerCase() === labelOf(cur).toLowerCase());
        });
    }

    /* ---------------- 3. SUB-CATEGORY CHIPS (+ picha ndogo) ---------------- */
    var lastCat = '';
    function decorateSubchips() {
        var row = document.getElementById('subcatRow');
        if (!row) return;
        var cur = currentCategory();
        if (cur) lastCat = cur;
        var parentPhoto = photoUrl(lastCat) || photoUrl('Vyakula na Vinywaji (Food)');
        if (!parentPhoto) return;
        Array.prototype.forEach.call(row.children, function (chip) {
            if (!chip || chip.dataset.cpsChip === '1') return;
            var txt = (chip.textContent || '').trim();
            if (!txt) return;
            var sp = document.createElement('span');
            sp.className = 'cps-chip-ico';
            sp.innerHTML = imgMarkup(lastCat, 'cps-chip-img', '');
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
        for (var k in PHOTO) slugs.push(PHOTO[k]);
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

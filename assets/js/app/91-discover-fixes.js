/* ================================================================
 * 91-discover-fixes.js — MAREKEBISHO YA DISCOVER + ERROR VISIBILITY
 * ----------------------------------------------------------------
 * 1. USIFICHE ERRORS — onyesha wazi console.error + on-screen toast
 * 2. Discover MOBILE RESPONSIVE — usiweke kama laptop, ratio nzuri
 * 3. Cards "bembabumbwa" — spacing na ukubwa uwe mzuri
 * 4. Account yoyote ikibofya (duka/muuzaji/mtoa-huduma/usafiri/mtu)
 *    ifunguke kikamilifu na bidhaa/huduma zake
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhDiscFixesBooted) return;

    function skh() { return window.skh || {}; }

    /* [STABILIZE 2026-09-21] Urithi chain flags kutoka base — vinginevyo
       guard za 93/79/81 huchukulia wrapper yetu kama "chain tata" na
       kuichana (clobber) au ku-wrap tena. */
    var __SKH_CHAIN_FLAGS = ['__blinkPatched','__blinkWrap','__oneUI','__oneUIAtomic','__abs81','__abs81_final','__skh90','__skhAuthPatched','__skhErrPatched','__skh93','__skhBack','__raw','__orig'];
    function __skhCopyChainFlags(from, to) {
        if (!from || !to) return to;
        for (var i = 0; i < __SKH_CHAIN_FLAGS.length; i++) {
            var k = __SKH_CHAIN_FLAGS[i];
            try { if (from[k] !== undefined && to[k] === undefined) to[k] = from[k]; } catch (e) {}
        }
        return to;
    }

    function boot() {
        if (window.__skhDiscFixesBooted) return;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', install);
        } else {
            install();
        }
    }

    function T(k, fb) { try { return (window.t && window.t(k)) || fb || k; } catch (e) { return fb || k; } }

    function showErr(title, err) {
        var msg = (err && err.message) ? String(err.message) : (typeof err === 'string' ? err : 'Hitilafu isiyojulikana');
        console.error('[SOKOHAI ERROR] ' + title + ':', err);
        // Toast
        try {
            if (window.showToast) { window.showToast(title + ': ' + msg.slice(0, 120), 'error'); return; }
        } catch (e) {}
        // Fallback inline toast
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#b91c1c;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:700;z-index:200000;max-width:90vw;box-shadow:0 8px 24px rgba(185,28,28,.3);';
        t.textContent = '⚠ ' + title + ': ' + msg;
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 5000);
    }

    // ------------- 1. ERROR VISIBILITY -------------
    // Override console.error kuwa wazi ZAIDI + weka window.onerror kuonyesha.
    window.addEventListener('error', function (ev) {
        // epuka kelele nyingi - onyesha tu makosa makubwa
        if (ev && ev.error && ev.filename && ev.filename.indexOf('sokohai') !== -1) {
            console.warn('[UNCAUGHT ERROR]', ev.message, 'at', ev.filename + ':' + ev.lineno);
        }
    });
    window.addEventListener('unhandledrejection', function (ev) {
        var reason = ev.reason;
        if (reason && reason.code === 'permission-denied') return; // Firebase rules — kawaida
        console.warn('[UNHANDLED PROMISE REJECTION]', reason && (reason.message || reason));
    });

    // Patch Firebase calls kuonyesha error kwa urahisi zaidi
    function patchGlobalErrors() {
        var s = skh();
        // Wrap common async functions ili errors zionekane
        var wrapFns = ['skhChatOpen', 'skhChatOpenInbox', 'skhOpenGroupSoga', 'openSellerProfile'];
        wrapFns.forEach(function (name) {
            var fn = window[name];
            if (typeof fn !== 'function' || fn.__skhErrPatched) return;
            var wrapped = function () {
                try {
                    var r = fn.apply(this, arguments);
                    if (r && typeof r.then === 'function') {
                        return r.catch(function (e) {
                            showErr(name, e);
                            throw e;
                        });
                    }
                    return r;
                } catch (e) {
                    showErr(name, e);
                    throw e;
                }
            };
            __skhCopyChainFlags(fn, wrapped);
            wrapped.__skhErrPatched = true;
            window[name] = wrapped;
        });
    }
    setTimeout(patchGlobalErrors, 1200);
    setTimeout(patchGlobalErrors, 4000); // baada ya modules zote

    // ------------- 2. DISCOVER MOBILE CSS FIXES -------------
    function injectCss() {
        if (document.getElementById('skhDiscFixCss')) return;
        var s = document.createElement('style');
        s.id = 'skhDiscFixCss';
        s.textContent = [
            '/* ---- DISCOVER MOBILE OVERHAUL ---- */',
            '/* Ondoa desktop-only max-widths kwenye simu */',
            '@media (max-width: 768px) {',
            '  .skh-discover-engine { background: #F6F9FC !important; }',
            '  .skh-de-header { padding: 10px 12px; gap: 8px; }',
            '  .skh-de-header b { font-size: 15px; }',
            '  .skh-de-back { width: 36px; height: 36px; font-size: 16px; }',
            '  .skh-de-body { padding: 10px 10px 100px !important; -webkit-overflow-scrolling: touch; }',
            '  /* Search bar ya simu iwe na urefu wa kutosha */',
            '  .skh-de-search { padding: 10px 12px !important; }',
            '  .skh-de-search input { font-size: 15px !important; padding: 12px 14px !important; }',
            '  /* Quick categories — zisionekane kubembabumbwa */',
            '  .skh-de-quick { gap: 10px; padding: 14px 2px 10px; }',
            '  .skh-de-qcat { min-width: 72px !important; padding: 12px 10px !important; border-radius: 16px !important; }',
            '  .skh-de-qcat-ic { width: 42px !important; height: 42px !important; font-size: 20px !important; margin: 0 auto 4px !important; }',
            '  .skh-de-qcat label { font-size: 11.5px !important; }',
            '  /* Horizontal scroll cards (products/hot) — zisiwe nyembamba sana */',
            '  .skh-de-hscroll { gap: 12px !important; padding: 4px 2px 10px !important; }',
            '  .skh-de-hcard { min-width: 160px !important; border-radius: 18px !important; }',
            '  .skh-de-card-img { aspect-ratio: 1.0 !important; }',
            '  .skh-de-card-body { padding: 10px 11px !important; }',
            '  .skh-de-card-title { font-size: 13px !important; min-height: 34px !important; }',
            '  .skh-de-card-price { font-size: 14px !important; font-weight: 900; }',
            '  .skh-de-card-meta { font-size: 11px !important; }',
            '  /* Biz / person / service / transport cards */',
            '  .skh-de-biz-card, .skh-de-service-card, .skh-de-transport-card, .skh-de-person-card {',
            '    padding: 12px !important; gap: 12px !important; border-radius: 16px !important; margin-bottom: 8px !important;',
            '  }',
            '  .skh-de-biz-avatar { width: 52px !important; height: 52px !important; font-size: 20px !important; border-radius: 14px !important; }',
            '  .skh-de-biz-info b { font-size: 14px !important; }',
            '  .skh-de-biz-info small { font-size: 12px !important; line-height: 1.4; }',
            '  .skh-de-card-btn { font-size: 12px !important; padding: 8px 12px !important; border-radius: 10px !important; min-height: 32px !important; }',
            '  /* Section heads */',
            '  .skh-de-section-head { margin: 14px 2px 8px; }',
            '  .skh-de-section-head h3 { font-size: 13px !important; }',
            '  .skh-de-section-head a { font-size: 12px !important; }',
            '  /* Grid ya matokeo (products) — 2 columns nzuri */',
            '  .skh-de-grid, .dc88-results, [class*=grid] { gap: 10px !important; }',
            '  .skh-de-grid > *, .dc88-results > * { min-width: 0 !important; }',
            '  /* Filter chips */',
            '  .skh-de-filters { gap: 8px; padding: 12px 2px; }',
            '  .skh-de-chip { font-size: 12px; padding: 8px 14px; border-radius: 99px; }',
            '  /* Tabs */',
            '  .skh-de-feed-tabs { gap: 8px; padding: 10px 0; }',
            '  .skh-de-feed-tab { font-size: 12px; padding: 8px 14px; border-radius: 99px; }',
            '  /* Detail view */',
            '  .skh-de-detail { border-radius: 0 !important; }',
            '  .skh-de-detail-hero { aspect-ratio: 1.0 !important; }',
            '  .skh-de-detail-body { padding: 14px !important; }',
            '  .skh-de-detail-title { font-size: 18px !important; line-height: 1.3; }',
            '  .skh-de-detail-price { font-size: 20px !important; }',
            '  /* dc88 (88-discover-complete) classes */',
            '  .dc88-header { padding: 10px 12px !important; gap: 8px; }',
            '  .dc88-header .dc88-title { font-size: 16px !important; }',
            '  .dc88-search-wrap { padding: 10px 12px !important; }',
            '  .dc88-search-wrap input { font-size: 15px !important; padding: 12px 14px !important; }',
            '  .dc88-detail { padding: 0 0 24px; }',
            '  .dc88-detail-cover { border-radius: 14px; margin: 10px 12px 0; overflow: hidden; }',
            '  .dc88-detail-box { margin: 10px 12px; padding: 14px; border-radius: 14px; }',
            '  .dc88-detail-title { font-size: 17px !important; line-height: 1.3; }',
            '  .dc88-detail-price { font-size: 18px !important; }',
            '  .dc88-card-meta { flex-wrap: wrap; gap: 8px; font-size: 12px; }',
            '  .dc88-net-box { min-width: 60px; padding: 10px 6px; }',
            '  .dc88-net-num { font-size: 20px !important; }',
            '  .dc88-net-label { font-size: 10px !important; }',
            '  .dc88-results { grid-template-columns: 1fr 1fr !important; gap: 10px !important; padding: 0; }',
            '  .dc88-results > div { min-width: 0 !important; }',
            '  .dc88-btn-p, .dc88-btn-s { padding: 11px 14px !important; font-size: 13px !important; border-radius: 12px !important; min-height: 42px; }',
            '  .dc88-back { padding: 10px 14px !important; font-size: 13px !important; margin: 10px 12px; }',
            '  /* Profile-person view huko detail */',
            '  .dc88-person-card, .dc88-biz-card-lift { border-radius: 16px; }',
            '  /* Suggestion dropdown */',
            '  .skh-de-suggest { margin: 0 12px; }',
            '  .skh-de-suggest-row { padding: 12px 10px; }',
            '  .skh-de-suggest-ic { width: 40px; height: 40px; font-size: 18px; }',
            '  .skh-de-suggest-tx b { font-size: 14px; }',
            '  .skh-de-suggest-tx small { font-size: 12px; }',
            '}',
            '/* Simu ndogo kabisa (<=360px) */',
            '@media (max-width: 380px) {',
            '  .skh-de-qcat { min-width: 64px !important; padding: 10px 6px !important; }',
            '  .skh-de-qcat-ic { width: 38px !important; height: 38px !important; font-size: 18px !important; }',
            '  .skh-de-qcat label { font-size: 10.5px !important; }',
            '  .skh-de-hcard { min-width: 145px !important; }',
            '  .skh-de-card-title { font-size: 12.5px !important; min-height: 32px !important; }',
            '  .skh-de-biz-avatar { width: 46px !important; height: 46px !important; font-size: 18px !important; }',
            '  .dc88-net-num { font-size: 18px !important; }',
            '  .skh-de-detail-title { font-size: 16px !important; }',
            '  .skh-de-detail-price { font-size: 17px !important; }',
            '}',
            '/* Desktop — iwe na max-width nzuri isiwe kubwa mno */',
            '@media (min-width: 900px) {',
            '  .skh-discover-engine { max-width: 560px; margin: 0 auto; left: 50%; transform: translateX(-50%); right: auto; border-radius: 24px 24px 0 0; height: 94vh !important; top: 3vh; box-shadow: 0 30px 80px rgba(0,0,0,.3); }',
            '  .skh-discover-engine.open { display: flex !important; }',
            '  .dc88-results { grid-template-columns: 1fr 1fr !important; gap: 12px; }',
            '}',
            '/* ==== [VERTICAL-TEXT FIX 2026-09-20] Maandishi yasimamae wima ==== */',
            '/* Pills za mbali/muda — ziwe na upana wa kutosha, maandishi mlalo */',
            '.skh-de-card-distance, .skh-de-card-updated, .skh-de-card-meta span,',
            '.skh-de-card-meta b, .skh-de-card-meta small {',
            '  white-space: nowrap !important; width: auto !important; min-width: 0 !important;',
            '  height: auto !important; max-height: none !important; overflow: visible !important;',
            '  writing-mode: horizontal-tb !important; text-orientation: mixed !important;',
            '  word-break: normal !important; overflow-wrap: normal !important;',
            '  letter-spacing: normal !important; line-height: 1.35 !important;',
            '  text-align: left !important; flex: 0 0 auto !important; display: inline-flex !important; align-items: center !important;',
            '}',
            '/* Meta row iweze kunja mistari badala ya kubana kila pill */',
            '.skh-de-card-meta, .skh-de-card-submeta { display: flex !important; flex-wrap: wrap !important; overflow: visible !important; gap: 4px 8px !important; max-height: none !important; }',
            '/* Vitufe vya kadi — vitatu viwe na nafasi (wrap badala ya kupungukiwa) */',
            '.skh-de-card-actions, .skh-de-hcard-actions { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; overflow: visible !important; }',
            '.skh-de-card-btn { flex: 1 1 calc(33% - 6px) !important; min-width: 88px !important; max-width: none !important; white-space: nowrap !important; overflow: hidden; text-overflow: ellipsis; }',
            '/* Tabs za discover — maandishi mlalo daima, hakuna kubana */',
            '.dc88-tab, .skh-de-feed-tab, .skh-de-chip, .ch-tab, .dc88-filter-btn {',
            '  white-space: nowrap !important; writing-mode: horizontal-tb !important;',
            '  width: auto !important; min-width: 0 !important; height: auto !important; max-height: none !important;',
            '  word-break: normal !important; line-height: 1.4 !important; letter-spacing: normal !important;',
            '  text-align: center !important; display: inline-flex !important; align-items: center !important; justify-content: center !important;',
            '  overflow: visible !important; text-overflow: clip !important;',
            '}',
            '.dc88-tabs, .skh-de-feed-tabs { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }',
            '.dc88-tabs .dc88-tab, .skh-de-feed-tabs .skh-de-feed-tab { flex: 0 0 auto !important; }',
            '/* Sehemu yoyote — siwaziwe KAMARI text iko wima */',
            '.skh-de-body [style*="writing-mode"], .dc88-body [style*="writing-mode"] { writing-mode: horizontal-tb !important; }',
            '/* Vibration reducer — epuka text isiyosomeka */',
            '.skh-de-body *, .dc88-body * { -webkit-tap-highlight-color: transparent; }',
            'button { touch-action: manipulation; }',
            '/* Hakikisha picha zinaonekana vizuri, hazijabanwa */',
            '.skh-de-card-img img, .skh-de-detail-hero img, .dc88-detail-cover img, .feed-img-box img { image-rendering: auto; }',
        ].join('\n');
        document.head.appendChild(s);
    }
    injectCss();

    // ------------- 3. BIDHAA/HUDUMA/USAFIRI/MADUKA PROFILE OPEN -------------
    // Mkia mkuu: kubofya account ya mtu yeyote ifungue full profile.
    function openFullAccount(uid, name, hint) {
        if (!uid) return;
        hint = hint || 'seller';
        // Funga discover kwanza
        try { if (window.skhDiscoverEngineClose) window.skhDiscoverEngineClose(); } catch (e) {}
        // Fungua Seller Profile modal — hii inaonyesha Store + Products + Reviews + About
        if (typeof window.openSellerProfile === 'function') {
            try {
                window.openSellerProfile(uid, name);
                return;
            } catch (e) {
                console.warn('[discover-fix] openSellerProfile failed, trying chat-only', e);
            }
        }
        // Fallback: fungua chat
        if (typeof window.openChatWithUser === 'function') {
            window.openChatWithUser(uid, name);
        }
    }

    // Click delegate kwa ajili ya discover + mahali pengine popote
    document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t) return;
        var btn = (t.closest && t.closest('[data-act]')) || null;
        if (!btn) return;
        var act = btn.getAttribute('data-act') || '';

        // de-view-business / de-view-service / de-view-transport
        //    → fungua seller/account profile na products zake
        if (act === 'de-view-business' || act === 'de-view-service' || act === 'de-view-transport') {
            ev.stopImmediatePropagation();
            ev.preventDefault();
            var id = btn.getAttribute('data-id');
            var listing = findListingById(id);
            var name = (listing && (listing.title || listing.businessName || listing.sellerName)) || id;
            // Kwa biashara, tumia sellerId kama ipo, la sivyo id
            var uid = (listing && (listing.sellerId || listing.ownerId || listing.userId)) || id;
            openFullAccount(uid, name, act);
            return;
        }
        // de-chat, de-chat-person, de-card-btn--green: fungua chat na mtu
        if (act === 'de-chat') {
            // Acha asili ifanye kazi, lakini hakikisha discover inafungwa
            setTimeout(function () {
                try { if (window.skhDiscoverEngineClose) window.skhDiscoverEngineClose(); } catch (e) {}
            }, 50);
            return;
        }
    }, true); // capture ili ifanye kazi kabla ya handlers wengine

    function findListingById(id) {
        try {
            var sections = window.__deLastSections || (window.S && window.S.sections) || {};
            var all = []
                .concat(sections.products || [])
                .concat(sections.businesses || [])
                .concat(sections.nearbyBusinesses || [])
                .concat(sections.services || [])
                .concat(sections.transporters || [])
                .concat(sections.people || [])
                .concat(sections.groups || []);
            for (var i = 0; i < all.length; i++) {
                var r = all[i];
                var l = r.listing || r;
                if (l.entityId === id) return l;
            }
        } catch (e) {}
        return null;
    }

    // ------------- 4. PATCH discover detail for businesses/services/transport
    // Wakati 75/88 zinapoita de-view-biz n.k., ziite openFullAccount
    function patchDiscoverHandlers() {
        // Hakikisha kwamba biashara ikibofya "View" inafungua profile kamili.
        // 88 huwa inashika de-view-person na de-view-group; haina de-view-business.
        // 75 inayo, tunaishinda kupitia click capture hapo juu.
    }

    // ------------- 5. FIX sellerProfileModal max-width kwenye simu -------------
    function fixModalSizing() {
        var m = document.getElementById('sellerProfileModal');
        if (!m) return;
        var inner = m.querySelector('div');
        if (!inner) return;
        if (window.innerWidth < 640) {
            inner.style.width = '100%';
            inner.style.maxWidth = '100%';
            inner.style.height = '100vh';
            inner.style.borderRadius = '0';
            inner.style.boxShadow = 'none';
        } else {
            inner.style.width = '';
            inner.style.maxWidth = '';
            inner.style.height = '';
            inner.style.borderRadius = '';
        }
    }
    window.addEventListener('resize', fixModalSizing);
    setInterval(fixModalSizing, 1500);

    // ------------- 6. WIRE seller-name click kwenye product cards za Discover
    // Mtu akibofya jina la muuzaji ndani ya product card, afungue profile
    function wireSellerNameClicks() {
        var eng = document.getElementById('skhDiscoverEngine');
        if (!eng) return;
        var sellers = eng.querySelectorAll('[data-seller-id], .skh-de-card-business');
        sellers.forEach(function (el) {
            if (el.__skhSellerWired) return;
            el.__skhSellerWired = true;
            el.style.cursor = 'pointer';
            el.addEventListener('click', function (ev) {
                ev.stopPropagation();
                var sid = el.getAttribute('data-seller-id');
                if (!sid) {
                    // try to find from nearest card
                    var card = el.closest('[data-act]');
                    if (card) sid = card.getAttribute('data-seller-id') || card.getAttribute('data-id');
                }
                var name = el.textContent.trim();
                if (sid) openFullAccount(sid, name);
            });
        });
    }
    setInterval(wireSellerNameClicks, 1000);

    // ------------- 7. OPEN PROFILE KUTOKA PRODUCT DETAIL -------------
    // Ukiwa kwenye product detail na ubofye jina la muuzaji, fungua profile
    document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t) return;
        if (t.classList && t.classList.contains('skh-de-card-business')) {
            var card = t.closest('[data-act]');
            var id = card && card.getAttribute('data-id');
            if (id) {
                ev.stopPropagation();
                var listing = findListingById(id);
                var uid = (listing && (listing.sellerId || listing.ownerId)) || id;
                openFullAccount(uid, t.textContent.trim());
            }
        }
    }, true);

    // ------------- 8. EXPAND person detail kuwa na PRODUCTS zake pia -------------
    // Override renderPersonDetail ya 88-discover-complete ili kuongeza bidhaa
    var _origRenderPersonDetail = null;
    function patchPersonRenderer() {
        // 88 inajenga module; tunaweza ku-intercept click ya "View" in products
    }

    // ------------- 9. PATCH openSellerProfile kutoa error ya wazi ikishindwa -------------
    setTimeout(function () {
        var orig = window.openSellerProfile;
        if (typeof orig === 'function' && !orig.__skhErrPatched) {
            window.openSellerProfile = function () {
                try {
                    var r = orig.apply(this, arguments);
                    if (r && typeof r.catch === 'function') {
                        return r.catch(function (e) { showErr('Imeshindwa kufungua profile', e); throw e; });
                    }
                    return r;
                } catch (e) {
                    showErr('Imeshindwa kufungua profile', e);
                    throw e;
                }
            };
            __skhCopyChainFlags(orig, window.openSellerProfile);
            window.openSellerProfile.__skhErrPatched = true;
        }
    }, 1500);

    console.log('[SOKOHAI DISCOVER FIXES] v1 loaded ✓ — error visibility, mobile responsive, full account profiles');

    // ------------- 10. ONGEZA "TAZAMA DUKA/AKAUNTI" BUTTON KWENYE DETAIL VIEWS --------
    // Tumia MutationObserver ili kuona detail inapoandikwa na kuongeza kitufe
    var discObserver = new MutationObserver(function () {
        var eng = document.getElementById('skhDiscoverEngine');
        if (!eng) return;
        if (!eng.classList.contains('open')) return;
        var body = document.getElementById('skhDiscoverEngineBody');
        if (!body) return;

        // Tafuta "Chat" buttons zote na kama hakuna "Tazama Duka" tayari, ongeza
        var chatBtns = body.querySelectorAll('[data-dc88-chat]');
        chatBtns.forEach(function (cb) {
            if (cb.__skhStoreAdded) return;
            cb.__skhStoreAdded = true;
            var cid = cb.getAttribute('data-id');
            var cname = cb.getAttribute('data-name') || 'Akaunti';
            if (!cid) return;
            // usiongeze chini ya group join button
            if (cb.textContent.indexOf('Join') !== -1 || cb.textContent.indexOf('Jiunge') !== -1) return;
            // Tengeneza "Tazama Akaunti" button
            var storeBtn = document.createElement('button');
            storeBtn.type = 'button';
            storeBtn.className = 'dc88-btn-s';
            storeBtn.style.cssText = 'background:#fff;color:#1268A8;border:1.5px solid #1268A8;font-weight:800;font-size:13px;padding:11px 14px;border-radius:12px;cursor:pointer;flex:1;min-height:42px;';
            storeBtn.textContent = '🏪 ' + T('tazama_duka', 'Tazama Akaunti');
            storeBtn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                ev.preventDefault();
                try { closeDiscover && closeDiscover(); } catch (e) {}
                setTimeout(function () { openFullAccount(cid, cname); }, 50);
            });
            var parent = cb.parentElement;
            if (parent) {
                // Weka Chat button flex:1; halafu weka storeBtn baada yake
                cb.style.flex = '1';
                parent.insertBefore(storeBtn, cb.nextSibling);
                parent.style.display = 'flex';
                parent.style.gap = '8px';
            }
        });

        // Pia ongeza click kwenye jina la muuzaji katika product detail
        var sellerNames = body.querySelectorAll('.skh-de-card-business');
        sellerNames.forEach(function (el) {
            if (el.__skhStoreWired) return;
            el.__skhStoreWired = true;
            el.style.cursor = 'pointer';
            el.style.color = '#1268A8';
            el.style.textDecoration = 'underline';
        });
    });
    discObserver.observe(document.body, { childList: true, subtree: true });

    // ------------- 11. [VERTICAL-TEXT] EMOJI SANITIZER + TAB LABELS -------------
    // Emoji zisizokuwa na font hubidi tofu nyembamba zinazosukuma maandishi
    // wima. Tunazificha kwenye tabs/chips/badges za discover (text ibaki).
    var EMOJI_RE = /[\u2190-\u2BFF\u{1F000}-\u{1FAFF}\u{FE0F}\u{200D}\u{20E3}]/u;
    function sanitizeDiscoverTexts() {
        var eng = document.getElementById('skhDiscoverEngine');
        if (!eng) return;
        var sels = '.dc88-tab, .skh-de-chip, .skh-de-feed-tab, .skh-de-card-distance, .skh-de-card-updated, .skh-de-qcat label, .ch-inbox-chips .ch-tab, .dc88-filter-btn';
        var els = eng.querySelectorAll(sels);
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (el.__skhEmojiClean) continue;
            el.__skhEmojiClean = true;
            // Neno la kwanza kama ni emoji pekee → liondolee (font fallback hubomoa layout)
            var txt = (el.textContent || '').trim();
            var parts = txt.split(/\s+/);
            if (parts.length > 1 && EMOJI_RE.test(parts[0])) {
                var rest = parts.slice(1).join(' ');
                // Weka label katika span — emoji isibomoe layout tena
                el.textContent = rest;
            }
        }
    }
    setInterval(sanitizeDiscoverTexts, 1200);
    setTimeout(sanitizeDiscoverTexts, 600);

    window.__skhDiscFixesBooted = true;
})();

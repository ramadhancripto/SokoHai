/* ==== js/app/101-marketplace-ads-studio.js ==== */
/* ============================================================================
   SokoHai — Marketplace Ads Studio   [ADS STUDIO REBUILD · 2026-11-01]
   ----------------------------------------------------------------------------
   Replaces the generic Advertisement Designer as the SELLER entry point.

   Scope, by design: only three marketplace advertising types —
     · product    (an existing `products` listing)
     · service    (an existing `services` listing)
     · transport  (an existing `delivery` listing — the marketplace "Usafiri" feed)

   What this module does NOT do
     · it does not add, change or bypass any backend capability;
     · it does not touch billing, pricing, wallet or payment code (none exists for ads);
     · it does not set placements/targeting itself — those are admin-only in
       `adsUpdateCampaignDelivery` and are shown read-only with the reason;
     · it does not write campaign documents directly: publishing goes through the
       existing `creativeSaveDraft` / `creativePublish` callables, which re-read the
       listing server-side and enforce ownership.

   What it reuses (no duplication)
     · `js/app/creative/creative-model.js` → createCreative / applyEntity / normalizeCreative
     · `shared/ads-design-rules.js`        → creativeToAdvertisement / validateCreative
     · `js/06-announcement.js`             → skhAdvertisementCardHtml (the real ad card)
     · `js/app/00-bootstrap.js`            → skh.CommercePostCard (the real listing card)
     · `js/app/39-market-ranking.js`       → listingEligible (canonical eligibility)
     · `js/app/96-ad-delivery-controller.js`, `js/06-announcement.js` targeting — untouched
   ========================================================================== */
import { createCreative, normalizeCreative, applyEntity } from './creative/creative-model.js';
import { listingEligible } from './39-market-ranking.js';

(function () {
    'use strict';

    /* ------------------------------------------------------------- constants */

    var TYPE_META = {
        product: {
            label: 'Bidhaa',
            plural: 'Bidhaa zangu',
            icon: 'package',
            collection: 'products',
            collections: ['products'],
            entityType: 'product',
            lead: 'Tangaza bidhaa iliyopo kwenye duka lako. Taarifa zote zinakuja kutoka listing yenyewe.',
            empty: 'Huna bidhaa kwenye soko bado. Ongeza bidhaa kwanza, kisha urudi kutangaza.',
            emptyAction: 'Ongeza bidhaa',
            surfaces: ['Home — mchanganyiko wa bidhaa', 'Utafutaji wa bidhaa', 'Kategoria za bidhaa'],
            cta: 'Tazama Bidhaa'
        },
        service: {
            label: 'Huduma',
            plural: 'Huduma zangu',
            icon: 'wrench',
            collection: 'services',
            collections: ['services'],
            entityType: 'service',
            lead: 'Tangaza huduma iliyosajiliwa. Jina, mtoa huduma, eneo na bei vinatoka kwenye huduma yenyewe.',
            empty: 'Huna huduma iliyosajiliwa. Sajili huduma kwanza, kisha urudi kutangaza.',
            emptyAction: 'Sajili huduma',
            surfaces: ['Ukurasa wa huduma (service detail)', 'Utafutaji wa huduma', 'Kategoria za huduma'],
            cta: 'Tazama Huduma'
        },
        transport: {
            label: 'Usafiri & Delivery',
            plural: 'Usafiri wangu',
            icon: 'truck',
            /* The Usafiri feed stores transport listings in `drivers`
               (`functions/index.js` re-types transport -> `drivers`). `delivery`
               is kept as a second, legacy alias so historical docs are not
               orphaned. `canonicalEntity` in functions/creative.js mirrors this
               order — see SOKOHAI-ADS-STUDIO-ARCHITECTURE §7. */
            collection: 'drivers',
            collections: ['drivers', 'delivery'],
            entityType: 'transport',
            lead: 'Tangaza huduma ya usafiri au delivery iliyosajiliwa: njia, aina ya chombo na bei vinatoka kwenye listing.',
            empty: 'Huna huduma ya usafiri iliyosajiliwa. Sajili kwanza, kisha urudi kutangaza.',
            emptyAction: 'Sajili usafiri',
            surfaces: ['Usafiri — mchanganyiko wa wasafirishaji', 'Utafutaji wa usafiri', 'Kategoria za usafiri'],
            cta: 'Tazama Usafiri'
        }
    };
    var TYPE_ORDER = ['product', 'service', 'transport'];

    var OWNER_FIELDS = ['userId', 'ownerId', 'sellerId', 'providerId', 'driverId'];
    var STEPS = [
        { n: 1, key: 'type', label: 'Aina' },
        { n: 2, key: 'listing', label: 'Chagua' },
        { n: 3, key: 'settings', label: 'Maudhui' },
        { n: 4, key: 'placement', label: 'Mahali' },
        { n: 5, key: 'schedule', label: 'Muda' },
        { n: 6, key: 'preview', label: 'Preview' },
        { n: 7, key: 'submit', label: 'Tuma' }
    ];

    /* ----------------------------------------------------------------- state */

    function freshDraft() {
        return {
            type: '',
            listing: null,          // {id, ...listingData}
            listingCollection: '',
            headline: '',
            description: '',
            offer: '',
            badge: '',
            ctaLabel: '',
            startAt: '',
            endAt: '',
            priority: 0,
            creativeId: '',
            announcementId: '',
            listingSnapshot: null
        };
    }

    var S = {
        view: 'overview',
        step: 1,
        draft: freshDraft(),
        listings: { product: null, service: null, transport: null },  // null = not loaded
        listingsLoading: {},
        listingQuery: '',
        campaigns: null,
        campaignsLoading: false,
        campaignFilter: 'all',
        library: null,
        libraryLoading: false,
        notifications: null,
        notificationsLoading: false,
        notifAll: false,
        busy: '',
        error: '',
        notice: '',
        admin: false
    };

    function isAdmin() {
        try {
            return !!((window.SOKOHAI_CLAIMS && window.SOKOHAI_CLAIMS.isAdmin) ||
                (window.skh && window.skh.currentUser && window.skh.currentUser.email &&
                    window.skh.currentUser.email === window.skh.MY_ADMIN_EMAIL));
        } catch (e) { return false; }
    }
    function uid() { try { return (window.skh && window.skh.currentUser && window.skh.currentUser.uid) || ''; } catch (e) { return ''; } }
    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function icon(name, size) {
        try { if (typeof window.skhNavIcon === 'function') return window.skhNavIcon(name, size || 16); } catch (e) {}
        return '';
    }
    function money(v) {
        var n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return '';
        return 'TSh ' + n.toLocaleString('en-US');
    }
    function toast(msg, type) {
        if (typeof window.skhToast === 'function') { window.skhToast(msg, type || 'info'); return; }
        /* never leave the user without feedback */
        S.notice = (type === 'error' ? '' : msg);
        S.error = (type === 'error' ? msg : '');
    }

    /* ------------------------------------------------------------ data access */

    function listingStatusLabel(x) {
        var s = String((x && (x.status || x.listingStatus)) || 'active').toLowerCase();
        return s;
    }

    /* Why a listing may not be advertisable — explained, never silently hidden. */
    function eligibility(item, type) {
        if (!item) return { ok: false, reason: 'Hakuna listing.' };
        if (!listingEligible(item)) {
            var st = listingStatusLabel(item);
            if (['draft', 'inactive'].indexOf(st) >= 0) return { ok: false, reason: 'Bado haijachapishwa (rasimu).' };
            if (['archived', 'deleted', 'suspended', 'blocked'].indexOf(st) >= 0) return { ok: false, reason: 'Imeondolewa au imesimamishwa.' };
            if (['rejected'].indexOf(st) >= 0) return { ok: false, reason: 'Imekataliwa na moderation.' };
            return { ok: false, reason: 'Listing haijakamilika au haipo hai.' };
        }
        if (type === 'product') {
            var stock = Number(item.stock);
            if (Number.isFinite(stock) && stock <= 0) return { ok: false, reason: 'Bidhaa zimeisha (stock 0).' };
        }
        if (!imageOf(item)) return { ok: false, reason: 'Hakuna picha — tangazo linahitaji picha.' };
        return { ok: true, reason: '' };
    }

    function imageOf(x) {
        if (!x) return '';
        return String(x.imageUrl || x.image || x.photo || x.logoUrl || (Array.isArray(x.images) && x.images[0]) || '');
    }
    function priceOf(x) {
        if (!x) return null;
        var v = Number(x.price != null ? x.price : (x.currentPrice != null ? x.currentPrice : (x.servicePrice != null ? x.servicePrice : x.priceFrom)));
        return Number.isFinite(v) ? v : null;
    }
    function titleOf(x, type) {
        if (!x) return '';
        return String(x.title || x.serviceName || x.name || x.company || x.driverName ||
            (type === 'transport' && x.pickupRegion ? (x.pickupRegion + ' → ' + (x.destinationRegion || '')) : '') || '');
    }
    function sellerOf(x) {
        if (!x) return '';
        return String(x.shopName || x.businessName || x.providerName || x.sellerName || x.company || x.driverName || '');
    }
    function locationOf(x, type) {
        if (!x) return '';
        if (type === 'transport') return String(x.pickupRegion || x.location || x.region || '');
        return String(x.location || x.region || x.serviceArea || '');
    }

    async function fetchOwnListings(type) {
        var meta = TYPE_META[type];
        if (!meta || !window.skh || !uid()) return [];
        var seen = {};
        var out = [];
        var cols = meta.collections || [meta.collection];
        for (var c = 0; c < cols.length; c++) {
            var colName = cols[c];
            var answered = false;
            for (var i = 0; i < OWNER_FIELDS.length && !answered; i++) {
                var field = OWNER_FIELDS[i];
                try {
                    var snap = await window.skh.getDocs(window.skh.query(
                        window.skh.collection(window.skh.db, colName),
                        window.skh.where(field, '==', uid()),
                        window.skh.limit(120)
                    ));
                    if (snap.size) answered = true;   // this collection uses this owner field
                    snap.forEach(function (doc) {
                        var data = doc.data() || {};
                        if (seen[doc.id]) return;
                        seen[doc.id] = true;
                        out.push(Object.assign({ id: doc.id, __collection: colName }, data));
                    });
                } catch (e) { /* field not present on this collection — try the next */ }
            }
        }
        return out;
    }

    async function ensureListings(type, force) {
        if (!type) return [];
        if (S.listings[type] && !force) return S.listings[type];
        S.listingsLoading[type] = true;
        render();
        var list = [];
        try {
            list = await fetchOwnListings(type);
        } catch (e) {
            S.error = 'Listing zako hazikuweza kupakiwa: ' + (e && e.message || e);
        }
        S.listings[type] = list;
        S.listingsLoading[type] = false;
        render();
        return list;
    }

    async function fetchMyCampaigns() {
        if (!window.skh || !uid()) return [];
        var byId = {};
        try {
            var snap = await window.skh.getDocs(window.skh.query(
                window.skh.collection(window.skh.db, 'announcements'),
                window.skh.where('advertiserId', '==', uid()),
                window.skh.limit(200)
            ));
            snap.forEach(function (doc) { byId[doc.id] = Object.assign({ id: doc.id }, doc.data()); });
        } catch (e) { /* rules/offline: fall through to the local cache */ }
        try {
            (window.__sokohaiAnnouncementsCache || []).forEach(function (a) {
                if (a && a.advertiserId === uid() && !byId[a.id]) byId[a.id] = a;
            });
        } catch (e) {}
        return Object.keys(byId).map(function (k) { return byId[k]; });
    }

    /* Campaign state uses the SAME vocabulary as the admin manager. */
    function campaignState(a) {
        if (!a) return 'draft';
        /* Moderation outcome first: it is the one state a seller must see even
           when the underlying record still says "draft". */
        var mod0 = String(a.moderationStatus || '').toLowerCase();
        if (mod0 === 'rejected') return 'rejected';
        if (mod0 === 'pending') return 'pending';
        if (typeof window.skhAdminAdState === 'function') {
            try { return window.skhAdminAdState(a); } catch (e) {}
        }
        var st = String(a.status || '').toLowerCase();
        var mod = String(a.moderationStatus || '').toLowerCase();
        if (mod === 'rejected') return 'rejected';
        if (mod === 'pending') return 'pending';
        if (st === 'draft' || mod === 'draft') return 'draft';
        if (st === 'published' && a.active === true) return 'active';
        if (st === 'published' && a.active === false) return 'paused';
        return st || 'draft';
    }
    var STATE_LABEL = {
        draft: 'Rasimu',
        pending: 'Inasubiri idhini',
        active: 'Inaendelea',
        paused: 'Imesimama',
        completed: 'Imekamilika',
        expired: 'Muda umeisha',
        rejected: 'Imekataliwa',
        archived: 'Kumbukumbu',
        scheduled: 'Imepangwa'
    };

    function campaignTypeOf(a) {
        if (!a) return '';
        var t = String(a.entityType || (a.linkedEntity && a.linkedEntity.type) || '').toLowerCase();
        if (t === 'product' || t === 'service' || t === 'transport') return t;
        return '';
    }

    /* ------------------------------------------------------ creative building */

    /* Build the creative for the chosen listing using the canonical model.
       Nothing here is ad-engine specific: createCreative + applyEntity are the
       same functions the advanced Creative Studio uses. */
    function buildCreative() {
        var d = S.draft;
        var meta = TYPE_META[d.type];
        if (!meta || !d.listing) return null;
        var listing = d.listing;
        var head = d.headline || titleOf(listing, d.type);
        var body = d.description || '';
        var offerText = d.offer || money(priceOf(listing));

        var creative = createCreative({
            format: 'landscape',
            ownerId: uid(),
            category: d.type,                      // 'product' | 'service' | 'transport'
            campaignName: head.slice(0, 80),
            offer: offerText,
            publicationType: 'advertisement'
        });
        creative = applyEntity(creative, listing, d.type);
        creative.destination = { type: d.type, id: String(listing.id) };
        creative.linkedEntity = { type: d.type, id: String(listing.id) };
        creative.category = d.type;
        creative.title = head.slice(0, 160);
        creative.campaignName = head.slice(0, 80);
        creative.offer = offerText;
        creative.priority = Number(d.priority) || 0;
        creative.startAt = d.startAt || '';
        creative.endAt = d.endAt || '';

        return harmonizeCreative(normalizeCreative(creative));
    }

    /* The canonical validator is the single source of truth for what may ship.
       Preset typography is sized for the canvas, not for the rule bounds, so we
       ask the rules engine and clamp only the layers it objects to — no hardcoded
       copy of the limits, and the creative still validates on the server. */
    function harmonizeCreative(creative) {
        var rules = window.SokoHaiAdsDesignRules;
        if (!rules || typeof rules.validateCreative !== 'function' || !creative) return creative;
        for (var pass = 0; pass < 3; pass++) {
            var res = rules.validateCreative(creative, { forPublish: true, now: Date.now() });
            var errors = (res && res.errors) || [];
            var fixed = false;
            errors.forEach(function (err) {
                var m = /size lazima iwe (\d+)[^\d]+(\d+)\s*px/i.exec(String(err.message || ''));
                if (!m || !err.layerId) return;
                var min = Number(m[1]), max = Number(m[2]);
                creative.layers.forEach(function (layer) {
                    if (!layer || layer.id !== err.layerId) return;
                    var size = Number(layer.style && layer.style.fontSize);
                    if (!Number.isFinite(size)) return;
                    if (size < min) layer.style.fontSize = min;
                    else if (size > max) layer.style.fontSize = max;
                    fixed = true;
                });
            });
            if (!fixed) break;
        }
        return creative;
    }

    /* --- the layer copy the seller edits -------------------------------- */
    function applyCreativeCopy(creative) {
        var d = S.draft;
        var meta = TYPE_META[d.type];
        if (!creative) return null;
        var head = d.headline || titleOf(d.listing, d.type);
        var body = d.description || '';
        var offerText = d.offer || money(priceOf(d.listing));
        creative.layers.forEach(function (layer) {
            if (!layer) return;
            if (layer.role === 'headline' && layer.type === 'text') layer.content = head.slice(0, 90);
            if (layer.role === 'body' && layer.type === 'text' && body) layer.content = body.slice(0, 200);
            if (layer.role === 'price' && layer.type === 'text' && offerText) layer.content = offerText.slice(0, 40);
            if (layer.role === 'badge' && layer.type === 'text') {
                if (d.badge) layer.content = d.badge.slice(0, 24);
                else layer.visible = false;
            }
            if (layer.role === 'cta' && layer.type === 'text') layer.content = (d.ctaLabel || meta.cta).slice(0, 32);
        });
        return harmonizeCreative(normalizeCreative(creative));
    }

    /* The preview IS the marketplace card: same projection the publish pipeline
       makes, rendered by the canonical card renderer. */
    function adProjection(creative) {
        var rules = window.SokoHaiAdsDesignRules;
        if (!rules || typeof rules.creativeToAdvertisement !== 'function' || !creative) return null;
        var photo = imageOf(S.draft.listing);
        try {
            return rules.creativeToAdvertisement(creative, {
                brandName: sellerOf(S.draft.listing) || 'SokoHai',
                image: photo,
                link: '#' + S.draft.type + '-' + (S.draft.listing && S.draft.listing.id),
                status: 'draft'
            });
        } catch (e) { return null; }
    }

    function adCardHtml(creative) {
        var ad = adProjection(creative);
        if (!ad || typeof window.skhAdvertisementCardHtml !== 'function') {
            return '<div class="mas-preview-empty">Preview haipatikani kwa sasa.</div>';
        }
        ad.brandName = ad.brandName || sellerOf(S.draft.listing) || 'SokoHai';
        return '<div class="skh-ad-cell mas-preview-cell"><div class="skh-ad-delivery-slot skh-ann-story skh-home-ad skh-ann-post">'
            + window.skhAdvertisementCardHtml(ad) + '</div></div>';
    }

    function listingCardHtml(listing, type) {
        if (!listing || !window.skh || typeof window.skh.CommercePostCard !== 'function') return '';
        var meta = TYPE_META[type];
        var col = listing.__collection || (meta && meta.collection);
        try { return window.skh.CommercePostCard(listing, col); } catch (e) { return ''; }
    }

    /* Normalise the freshly rendered preview the same way the feed does, so what
       the seller sees is exactly what ships (labels + readable copy). */
    function decoratePreview() {
        var host = document.querySelector('#masRoot .mas-preview-cell');
        if (!host) return;
        try {
            if (typeof window.skhAdsNormalizeCell === 'function') window.skhAdsNormalizeCell(host);
        } catch (e) {}
    }

    /* ------------------------------------------------------------ persistence */

    async function persistCreative(creative) {
        if (typeof window.skhPersistBasicCreative === 'function') {
            var saved = await window.skhPersistBasicCreative(creative);
            return (saved && saved.id) ? saved : creative;
        }
        if (!window.skh || !uid()) throw new Error('Hakuna akaunti iliyoingia.');
        var payload = Object.assign({}, creative, { ownerId: uid(), updatedAt: new Date().toISOString() });
        if (creative.id) {
            await window.skh.setDoc(window.skh.doc(window.skh.db, 'creatives', creative.id), payload, { merge: true });
            return payload;
        }
        payload.createdAt = payload.createdAt || new Date().toISOString();
        payload.status = payload.status || 'DRAFT';
        var ref = await window.skh.addDoc(window.skh.collection(window.skh.db, 'creatives'), payload);
        payload.id = ref.id;
        return payload;
    }

    async function saveDraft() {
        if (S.busy) return;
        var problem = validateDraft(true);
        if (problem.length) { S.error = problem.join(' '); S.step = firstBadStep(problem); render(); return; }
        S.busy = 'draft'; S.error = ''; render();
        try {
            if (!uid()) throw new Error('Ingia kwenye akaunti kwanza.');
            var creative = buildCreative();
            var saved = await persistCreative(creative);
            var res = await window.skh.callFunction('creativeSaveDraft', {
                creativeId: saved.id,
                announcementId: S.draft.announcementId || ''
            });
            var data = (res && res.data) || res || {};
            if (data.ok === false) throw new Error('Draft haikuhifadhiwa.');
            S.draft.creativeId = saved.id;
            S.draft.announcementId = data.announcementId || S.draft.announcementId || '';
            S.campaigns = null;
            toast('Rasimu imehifadhiwa.', 'success');
            S.notice = 'Rasimu imehifadhiwa. Unaweza kuirudi kwenye "Rasimu".';
        } catch (e) {
            S.error = 'Imeshindwa kuhifadhi rasimu: ' + readableError(e);
        } finally {
            S.busy = ''; render();
        }
    }

    async function submitCampaign() {
        if (S.busy) return;
        var problem = validateDraft(false);
        if (problem.length) { S.error = problem.join(' '); S.step = firstBadStep(problem); render(); return; }
        S.busy = 'submit'; S.error = ''; render();
        try {
            if (!uid()) throw new Error('Ingia kwenye akaunti kwanza.');
            var creative = buildCreative();
            var saved = await persistCreative(creative);
            var payload = { creativeId: saved.id, publicationType: 'advertisement' };
            if (S.draft.announcementId) payload.replaceAnnouncementId = S.draft.announcementId;
            var res = await window.skh.callFunction('creativePublish', payload);
            var data = (res && res.data) || res || {};
            if (data.ok === false) throw new Error('Tangazo halikupitishwa.');
            var admin = isAdmin();
            S.draft.creativeId = saved.id;
            S.draft.announcementId = data.announcementId || '';
            S.campaigns = null;
            S.view = 'campaigns';
            S.notice = admin
                ? 'Tangazo limechapishwa na linaanza kuonekana kwenye soko.'
                : 'Tangazo limetumwa. Linahitaji idhini ya SokoHai kabla ya kuonekana kwenye soko.';
            toast(admin ? 'Tangazo limechapishwa.' : 'Tangazo limetumwa kwa idhini.', 'success');
        } catch (e) {
            S.error = 'Imeshindwa kutuma tangazo: ' + readableError(e);
        } finally {
            S.busy = ''; render();
        }
    }

    function readableError(e) {
        var msg = (e && (e.message || e.msg)) || String(e);
        if (/permission-denied|not authorized/i.test(msg)) return 'Hauna ruhusa ya kufanya hivi kwa listing hii.';
        if (/unauthenticated|sign in/i.test(msg)) return 'Ingia kwenye akaunti kwanza.';
        if (/not-found/i.test(msg)) return 'Listing haipo tena au imeondolewa.';
        if (/must match its linked entity/i.test(msg)) return 'Destination hailingani na listing iliyochaguliwa.';
        if (/failed-precondition/i.test(msg)) return msg.replace(/^.*?:\s*/, '');
        return msg;
    }

    /* ------------------------------------------------------------- validation */

    function validateDraft(forDraft) {
        var out = [];
        var d = S.draft;
        if (!d.type) out.push('Chagua aina ya tangazo.');
        if (d.type && !d.listing) out.push('Chagua listing ya kutangaza.');
        if (d.type && d.listing) {
            var el = eligibility(d.listing, d.type);
            if (!el.ok) out.push(el.reason);
        }
        if (d.startAt && d.endAt) {
            var s = Date.parse(d.startAt), e = Date.parse(d.endAt);
            if (Number.isFinite(s) && Number.isFinite(e) && e <= s) out.push('Tarehe ya mwisho lazima iwe baada ya tarehe ya kuanza.');
        }
        if (!forDraft) {
            /* the canonical creative validator is the source of truth at submit */
            var creative = buildCreative();
            var rules = window.SokoHaiAdsDesignRules;
            if (creative && rules && typeof rules.validateCreative === 'function') {
                var check = rules.validateCreative(creative, { forPublish: true, now: Date.now() });
                (check.errors || []).forEach(function (err) { out.push(err.message); });
            }
        }
        return out;
    }
    function firstBadStep(problems) {
        var text = problems.join(' ').toLowerCase();
        if (/aina|type/.test(text)) return 1;
        if (/chagua listing|listing|picha|stock|haijachapishwa/.test(text)) return 2;
        if (/tarehe|muda|schedule/.test(text)) return 5;
        if (/headline|kichwa|maelezo|body|text|destination/.test(text)) return 3;
        return 7;
    }

    /* ----------------------------------------------------------------- views */

    function shellInner() {
        return '<div class="mas-shell" role="dialog" aria-modal="true" aria-labelledby="masTitle">'
            + headerHtml()
            + '<div class="mas-body">' + navHtml() + '<main class="mas-main" id="masMain">' + viewHtml() + '</main></div>'
            + '</div>';
    }

    function headerHtml() {
        return '<header class="mas-head">'
            + '<div class="mas-head-copy"><b id="masTitle">SokoHai Marketplace Ads</b>'
            + '<small>Tangaza bidhaa, huduma au usafiri ulio nao kwenye soko.</small></div>'
            + '<div class="mas-head-actions">'
            + '<button type="button" class="mas-btn primary" data-mas-act="new">' + icon('plus') + '<span>Tangazo jipya</span></button>'
            + '<button type="button" class="mas-icon-btn" data-mas-act="close" aria-label="Funga">' + icon('x') + '</button>'
            + '</div></header>';
    }

    /* The approved structure: 11 sections, grouped so the rail never becomes a
       flat list of unreachable letters. `ready:false` sections are honest about
       what they need — they never render invented numbers. */
    var VIEWS = [
        { key: 'overview', label: 'Muhtasari', icon: 'home', group: '' },
        { key: 'create', label: 'Tengeneza', icon: 'plus', group: 'Unda' },
        { key: 'campaigns', label: 'Kampeni Zangu', icon: 'clipboard', group: 'Simamia' },
        { key: 'library', label: 'Maktaba', icon: 'image', group: 'Simamia' },
        { key: 'notifications', label: 'Arifa', icon: 'bell', group: 'Simamia' },
        { key: 'audience', label: 'Hadhira', icon: 'target', group: 'Sanidi' },
        { key: 'placements', label: 'Mahali', icon: 'grid', group: 'Sanidi' },
        { key: 'analytics', label: 'Uchanganuzi', icon: 'chart', group: 'Uchanganuzi' },
        { key: 'budget', label: 'Bajeti & Malipo', icon: 'wallet', group: 'Uchanganuzi' },
        { key: 'transactions', label: 'Fedha & Ankara', icon: 'receipt', group: 'Uchanganuzi' },
        { key: 'settings', label: 'Mipangilio', icon: 'settings', group: 'Msaada' }
    ];
    var VIEW_KEYS = VIEWS.map(function (v) { return v.key; });

    function navHtml() {
        var html = '<nav class="mas-nav" aria-label="Sehemu za Ads Studio">';
        var group = '';
        VIEWS.forEach(function (item) {
            if (item.group !== group) {
                group = item.group;
                if (group) html += '<div class="mas-nav-group">' + esc(group) + '</div>';
            }
            var active = S.view === item.key;
            var count = item.key === 'campaigns' ? campaignBadge() : (item.key === 'notifications' ? noticeBadge() : '');
            html += '<button type="button" class="mas-nav-item' + (active ? ' active' : '') + '"'
                + ' data-mas-nav="' + item.key + '"' + (active ? ' aria-current="page"' : '') + '>'
                + icon(item.icon) + '<span>' + esc(item.label) + '</span>' + count + '</button>';
        });
        return html + '</nav>';
    }

    /* A badge is only shown when there is something to act on. */
    function campaignBadge() {
        var list = S.campaigns || [];
        var n = list.filter(function (a) { var st = campaignState(a); return st === 'draft' || st === 'pending'; }).length;
        return n ? '<b class="mas-nav-count">' + n + '</b>' : '';
    }
    function noticeBadge() {
        var list = (S.notifications && S.notifications.items) || [];
        var n = list.filter(function (x) { return x && x.read !== true; }).length;
        return n ? '<b class="mas-nav-count">' + n + '</b>' : '';
    }

    function draftCount() {
        var n = (S.campaigns || []).filter(function (a) { return campaignState(a) === 'draft'; }).length;
        return n ? '<b class="mas-nav-count">' + n + '</b>' : '';
    }

    function viewHtml() {
        var body = '';
        if (S.view === 'create') body = wizardHtml();
        else if (S.view === 'campaigns') body = campaignsHtml();
        else if (S.view === 'library') body = libraryHtml();
        else if (S.view === 'notifications') body = notificationsHtml();
        else if (S.view === 'audience') body = audienceHtml();
        else if (S.view === 'placements') body = placementsHtml();
        else if (S.view === 'analytics') body = analyticsHtml();
        else if (S.view === 'budget') body = budgetHtml();
        else if (S.view === 'transactions') body = transactionsHtml();
        else if (S.view === 'settings') body = settingsHtml();
        else body = overviewHtml();
        return body
            + (S.error ? '<div class="mas-alert error" role="alert">' + icon('alert') + '<div><b>Kuna tatizo</b><p>' + esc(S.error) + '</p></div>'
                + '<button type="button" class="mas-icon-btn" data-mas-act="clear-error" aria-label="Funga">' + icon('x') + '</button></div>' : '')
            + (!S.error && S.notice ? '<div class="mas-alert ok" role="status">' + icon('check') + '<div><p>' + esc(S.notice) + '</p></div>'
                + '<button type="button" class="mas-icon-btn" data-mas-act="clear-notice" aria-label="Funga">' + icon('x') + '</button></div>' : '');
    }

    /* --- overview ---------------------------------------------------------- */
    function overviewHtml() {
        var campaigns = S.campaigns || [];
        var counts = { draft: 0, pending: 0, active: 0, paused: 0, ended: 0, rejected: 0 };
        campaigns.forEach(function (a) {
            var st = campaignState(a);
            if (st === 'draft') counts.draft++;
            else if (st === 'pending') counts.pending++;
            else if (st === 'active') counts.active++;
            else if (st === 'paused') counts.paused++;
            else if (st === 'rejected') counts.rejected++;
            else if (['completed', 'expired', 'archived'].indexOf(st) >= 0) counts.ended++;
        });
        var views = 0, clicks = 0;
        campaigns.forEach(function (a) { views += Number(a.viewCount || 0); clicks += Number(a.clickCount || 0); });
        var ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';

        var typeCards = TYPE_ORDER.map(function (t) {
            var meta = TYPE_META[t];
            var mine = campaigns.filter(function (a) { return campaignTypeOf(a) === t; }).length;
            return '<button type="button" class="mas-type-card" data-mas-act="start" data-type="' + t + '">'
                + '<span class="mas-type-ico">' + icon(meta.icon, 18) + '</span>'
                + '<b>' + esc(meta.label) + '</b>'
                + '<small>' + esc(meta.lead) + '</small>'
                + '<span class="mas-type-meta">' + (mine ? mine + ' tangazo' + (mine === 1 ? '' : ' zaidi') : 'Hakuna tangazo bado') + '</span>'
                + '</button>';
        }).join('');

        var recent = campaigns.slice().sort(function (a, b) { return stateRank(campaignState(a)) - stateRank(campaignState(b)); }).slice(0, 3);
        var alerts = [];
        if (counts.pending) alerts.push(['gold', 'Tangazo linasubiri idhini', counts.pending + ' tangazo linahitaji idhini ya SokoHai kabla ya kuonekana kwenye soko.']);
        if (counts.rejected) alerts.push(['red', 'Tangazo limekataliwa', counts.rejected + ' tangazo halikubaliwa. Sababu zinapatikana kwenye orodha ya kampeni.']);
        if (counts.draft) alerts.push(['blue', 'Rasimu zisizokamilika', counts.draft + ' rasimu bado hazijatumwa. Unaweza kuziendelea wakati wowote.']);

        return '<section class="mas-view">'
            + '<div class="mas-hero">'
            + '<div><h1>Tangaza kile ulichonacho</h1><p>Chagua bidhaa, huduma au usafiri ulio nao kwenye SokoHai. Hatukuulizi kuandika upya taarifa zilizopo — tunazichukua kutoka listing yako.</p></div>'
            + '<button type="button" class="mas-btn primary lg" data-mas-act="new">' + icon('plus') + '<span>Tengeneza tangazo</span></button>'
            + '</div>'
            + '<div class="mas-range" role="group" aria-label="Kichujio cha muda">'
            + '<span class="mas-range-label">' + icon('calendar', 13) + ' Kipindi</span>'
            + [['7', 'Siku 7'], ['30', 'Siku 30'], ['90', 'Siku 90']].map(function (r) {
                // Deliberately not a <button>: the global anti-double-click rule greys
                // out every disabled button, which would read as "these are selected".
                return '<span class="mas-range-btn" aria-disabled="true" title="Kaunta za sasa ni jumla ya maisha ya tangazo, si za kila siku">' + r[1] + '</span>';
            }).join('')
            + '<span class="mas-range-why">Kichujio cha tarehe kitawashwa pale data ya kila siku itakapopatikana.</span>'
            + '</div>'
            + '<div class="mas-stats">'
            + realTile('Zinaendelea', counts.active, '', 'green')
            + realTile('Zinasubiri idhini', counts.pending, '', 'gold')
            + realTile('Rasimu', counts.draft, '', 'grey')
            + realTile('Maoni', views.toLocaleString(), 'kaunta halisi', 'blue')
            + realTile('Clicks · CTR', clicks.toLocaleString() + ' · ' + ctr + '%', 'kaunta halisi', 'green')
            + unavailableTile('Reach', 'Hakuna hesabu ya watu wa kipekee', 'inahitaji rollup')
            + unavailableTile('Conversions', 'Hakuna event ya conversion', 'phase ya attribution')
            + unavailableTile('Matumizi (spend)', 'Hakuna mfumo wa fedha', 'phase ya malipo')
            + unavailableTile('ROAS', 'Inahitaji mapato yaliyothibitishwa', 'phase ya attribution')
            + '</div>'
            + (alerts.length ? '<div class="mas-card"><h2 class="mas-h2">Tahadhari</h2><div class="mas-alert-list">'
                + alerts.map(function (a) {
                    return '<div class="mas-alert ' + a[0] + '">' + icon('alert') + '<div><b>' + esc(a[1]) + '</b><p>' + esc(a[2]) + '</p></div></div>';
                }).join('') + '</div></div>' : '')
            + '<div class="mas-card"><div class="mas-card-head"><h2>Mwendo wa maonyesho</h2>'
            + '<span class="mas-pill soft">Haipatikani bado</span></div>'
            + '<div class="mas-chart-ph">' + icon('chart', 18) + '<b>Chati inahitaji data ya kila siku</b>'
            + '<p>Kaunta zilizopo ni jumla ya maisha ya tangazo. Mfululizo wa kila siku uko kwenye adDeliveryMetrics ya server, ambayo client hairuhusiwi kuisoma bado — hatuchori chati ya kubuni.</p></div>'
            + '</div>'
            + '<div class="mas-card"><div class="mas-card-head"><h2>Kampeni za hivi karibuni</h2>'
            + '<button type="button" class="mas-btn sm" data-mas-nav="campaigns"><span>Zote</span></button></div>'
            + (recent.length ? '<div class="mas-group">' + recent.map(campaignRowHtml).join('') + '</div>'
                : '<p class="mas-muted">Bado hakuna kampeni. Anza na aina moja hapa chini.</p>')
            + '</div>'
            + '<h2 class="mas-h2">Aina tatu za matangazo</h2>'
            + '<div class="mas-type-grid">' + typeCards + '</div>'
            + '</section>';
    }

    function statTile(label, value, tone) {
        return '<div class="mas-stat ' + tone + '"><b>' + esc(String(value)) + '</b><small>' + esc(label) + '</small></div>';
    }

    /* --- wizard ------------------------------------------------------------ */
    function wizardHtml() {
        return '<section class="mas-view mas-wizard">'
            + stepperHtml()
            + '<div class="mas-step-body">' + stepHtml() + '</div>'
            + wizardActionsHtml()
            + '</section>';
    }

    function stepperHtml() {
        return '<ol class="mas-steps" aria-label="Hatua za tangazo">'
            + STEPS.map(function (s) {
                var state = s.n < S.step ? 'done' : (s.n === S.step ? 'current' : 'todo');
                return '<li class="' + state + '"' + (s.n === S.step ? ' aria-current="step"' : '') + '>'
                    + '<span>' + (state === 'done' ? icon('check', 12) : s.n) + '</span><b>' + esc(s.label) + '</b></li>';
            }).join('')
            + '</ol>';
    }

    function stepHtml() {
        switch (STEPS[S.step - 1].key) {
            case 'type': return stepType();
            case 'listing': return stepListing();
            case 'settings': return stepSettings();
            case 'placement': return stepPlacement();
            case 'schedule': return stepSchedule();
            case 'preview': return stepPreview();
            default: return stepSubmit();
        }
    }

    function stepType() {
        return '<div class="mas-card">'
            + '<h2>Tangazo lako ni la nini?</h2>'
            + '<p class="mas-muted">Aina inaamua sehemu ya soko litakapoonekana na taarifa zipi tunazichukua kutoka listing yako.</p>'
            + '<div class="mas-choice-grid">'
            + TYPE_ORDER.map(function (t) {
                var meta = TYPE_META[t];
                return '<button type="button" class="mas-choice' + (S.draft.type === t ? ' active' : '') + '" data-mas-act="pick-type" data-type="' + t + '" aria-pressed="' + (S.draft.type === t) + '">'
                    + '<span class="mas-choice-ico">' + icon(meta.icon, 20) + '</span>'
                    + '<b>' + esc(meta.label) + '</b><small>' + esc(meta.lead) + '</small></button>';
            }).join('')
            + '</div></div>';
    }

    function stepListing() {
        var meta = TYPE_META[S.draft.type];
        if (!meta) return '<div class="mas-card"><p>Chagua aina ya tangazo kwanza.</p></div>';
        if (!uid()) return '<div class="mas-card"><p class="mas-muted">Ingia kwenye akaunti yako ili kuona listing zako.</p></div>';
        if (S.listingsLoading[S.draft.type] || S.listings[S.draft.type] === null) {
            if (!S.listingsLoading[S.draft.type]) { ensureListings(S.draft.type); }
            return '<div class="mas-card"><div class="mas-loading"><span class="mas-spinner"></span>Inapakia ' + esc(meta.plural.toLowerCase()) + '…</div></div>';
        }
        var all = S.listings[S.draft.type] || [];
        if (!all.length) {
            return '<div class="mas-card mas-empty">'
                + '<b>' + esc(meta.empty) + '</b>'
                + '<p class="mas-muted">Bila listing hai, hakuna cha kutangaza. Tangazo hutumia picha, jina na bei ya listing yenyewe.</p>'
                + '<button type="button" class="mas-btn" data-mas-act="go-market">' + icon('plus') + '<span>' + esc(meta.emptyAction) + '</span></button>'
                + '</div>';
        }
        var q = S.listingQuery.trim().toLowerCase();
        var rows = all.map(function (item) { return { item: item, el: eligibility(item, S.draft.type) }; });
        var visible = rows.filter(function (r) { return !q || titleOf(r.item, S.draft.type).toLowerCase().indexOf(q) >= 0; });
        var eligibleCount = rows.filter(function (r) { return r.el.ok; }).length;
        return '<div class="mas-card">'
            + '<div class="mas-card-head"><h2>' + esc(meta.plural) + '</h2>'
            + '<span class="mas-pill">' + eligibleCount + ' tayari kutangazwa</span></div>'
            + '<p class="mas-muted">Taarifa zinachukuliwa moja kwa moja kutoka listing — hutasubiri kuandika upya.</p>'
            + '<input class="mas-search" type="search" placeholder="Tafuta ' + esc(meta.label.toLowerCase()) + '…" value="' + esc(S.listingQuery) + '" data-mas-input="listingQuery" aria-label="Tafuta listing">'
            + '<div class="mas-listing-grid">'
            + visible.map(listingTileHtml).join('')
            + (visible.length ? '' : '<p class="mas-muted">Hakuna listing inayolingana na utafutaji wako.</p>')
            + '</div></div>';
    }

    function listingTileHtml(row) {
        var item = row.item, el = row.el, type = S.draft.type;
        var selected = S.draft.listing && S.draft.listing.id === item.id;
        var img = imageOf(item);
        var price = money(priceOf(item));
        var sub = locationOf(item, type) || sellerOf(item) || '';
        if (type === 'transport' && item.vehicleType) sub = item.vehicleType + (sub ? ' · ' + sub : '');
        return '<button type="button" class="mas-listing' + (selected ? ' selected' : '') + (el.ok ? '' : ' disabled') + '"'
            + ' data-mas-act="pick-listing" data-id="' + esc(item.id) + '"' + (el.ok ? '' : ' aria-disabled="true"') + '>'
            + '<span class="mas-listing-img">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '<i>' + icon('image', 18) + '</i>') + '</span>'
            + '<span class="mas-listing-body">'
            + '<b>' + esc(titleOf(item, type) || TYPE_META[type].label) + '</b>'
            + (price ? '<span class="mas-listing-price">' + esc(price) + '</span>' : '')
            + (sub ? '<small>' + esc(sub) + '</small>' : '')
            + (el.ok ? '' : '<span class="mas-listing-why">' + esc(el.reason) + '</span>')
            + '</span>'
            + (selected ? '<span class="mas-listing-check">' + icon('check', 14) + '</span>' : '')
            + '</button>';
    }

    function stepSettings() {
        var meta = TYPE_META[S.draft.type];
        var item = S.draft.listing;
        if (!meta || !item) return '<div class="mas-card"><p>Chagua listing kwanza.</p></div>';
        var defaults = {
            headline: titleOf(item, S.draft.type),
            description: String(item.description || item.details || item.serviceDescription || item.shortDescription || '').slice(0, 200),
            offer: money(priceOf(item))
        };
        var headline = S.draft.headline || defaults.headline;
        var description = S.draft.description || defaults.description;
        var offer = S.draft.offer || defaults.offer;

        /* Type-aware: transport shows route/vehicle as read-only facts, services
           show provider/coverage, products show stock/shop. No product fields are
           ever forced onto a service or a transport ad. */
        var facts = [];
        if (S.draft.type === 'product') {
            if (item.shopName || item.businessName) facts.push(['Duka', item.shopName || item.businessName]);
            if (Number.isFinite(Number(item.stock))) facts.push(['Stock', Number(item.stock) + '']);
            if (item.category) facts.push(['Kategoria', item.category]);
        } else if (S.draft.type === 'service') {
            if (sellerOf(item)) facts.push(['Mtoa huduma', sellerOf(item)]);
            if (item.serviceArea || item.location || item.region) facts.push(['Eneo', item.serviceArea || item.location || item.region]);
            if (item.pricingModel || item.priceUnit) facts.push(['Bei', item.pricingModel || item.priceUnit]);
        } else {
            if (sellerOf(item)) facts.push(['Msafirishaji', sellerOf(item)]);
            if (item.pickupRegion || item.destinationRegion) facts.push(['Njia', (item.pickupRegion || '—') + ' → ' + (item.destinationRegion || '—')]);
            if (item.vehicleType) facts.push(['Chombo', item.vehicleType]);
            if (item.coverageArea || item.serviceArea) facts.push(['Ufikiaji', item.coverageArea || item.serviceArea]);
        }

        return '<div class="mas-card">'
            + '<div class="mas-card-head"><h2>Maudhui ya tangazo</h2><span class="mas-pill soft">' + esc(meta.label) + '</span></div>'
            + '<div class="mas-listing-source">'
            + (imageOf(item) ? '<img src="' + esc(imageOf(item)) + '" alt="" onerror="this.style.display=\'none\'">' : '')
            + '<div><b>' + esc(titleOf(item, S.draft.type)) + '</b>'
            + '<small>Picha, jina na bei vinatoka kwenye listing yako</small></div>'
            + '</div>'
            + (facts.length ? '<dl class="mas-facts">' + facts.map(function (f) {
                return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
            }).join('') + '</dl>' : '')
            + '<div class="mas-fields">'
            + field('Kichwa cha tangazo', '<input type="text" maxlength="90" value="' + esc(headline) + '" data-mas-input="headline" placeholder="' + esc(defaults.headline) + '">', 'Huonekana kwenye kadi ya tangazo. Kawaida jina la listing linatosha.')
            + field('Maelezo mafupi', '<textarea rows="3" maxlength="200" data-mas-input="description" placeholder="' + esc(defaults.description || 'Maelezo mafupi ya tangazo') + '">' + esc(description) + '</textarea>', 'Sentensi moja au mbili. Si lazima.')
            + '<div class="mas-field-row">'
            + field('Bei / Ofa', '<input type="text" maxlength="40" value="' + esc(offer) + '" data-mas-input="offer" placeholder="' + esc(defaults.offer || 'Mfano: TSh 12,000') + '">')
            + field('Badge (si lazima)', '<input type="text" maxlength="24" value="' + esc(S.draft.badge) + '" data-mas-input="badge" placeholder="Mfano: Ofa">')
            + '</div>'
            + field('Maneno ya kitufe', '<input type="text" maxlength="32" value="' + esc(S.draft.ctaLabel) + '" data-mas-input="ctaLabel" placeholder="' + esc(meta.cta) + '">')
            + '</div></div>';
    }

    function field(label, control, help) {
        return '<label class="mas-field"><span>' + esc(label) + '</span>' + control
            + (help ? '<small>' + esc(help) + '</small>' : '') + '</label>';
    }

    function stepPlacement() {
        var meta = TYPE_META[S.draft.type];
        if (!meta) return '<div class="mas-card"><p>Chagua aina ya tangazo kwanza.</p></div>';
        var admin = isAdmin();
        return '<div class="mas-card">'
            + '<h2>Litakapoonekana</h2>'
            + '<p class="mas-muted">Tangazo linaonekana kama listing ya kawaida kwenye sehemu zinazolingana na aina yake.</p>'
            + '<ul class="mas-surface-list">' + meta.surfaces.map(function (s) {
                return '<li>' + icon('check', 14) + '<span>' + esc(s) + '</span></li>';
            }).join('') + '</ul>'
            + '<div class="mas-note ' + (admin ? 'info' : 'warn') + '">'
            + icon('shield')
            + '<div><b>' + (admin ? 'Placement na targeting' : 'Placement na targeting hupangwa na SokoHai') + '</b>'
            + '<p>' + (admin
                ? 'Wewe ni admin: unaweza kubadilisha placement, targeting na goals kwenye Delivery Settings baada ya kuchapisha.'
                : 'Kwa usalama wa akaunti, uchaguzi wa placement, hadhira na bajeti unafanywa na timu ya SokoHai kupitia Delivery Settings. Tangazo lako linapelekwa kwenye sehemu sahihi kwa aina yake.')
            + '</p></div></div>'
            + (admin ? '<button type="button" class="mas-btn" data-mas-act="open-delivery">' + icon('settings') + '<span>Fungua Delivery Settings</span></button>' : '')
            + '</div>';
    }

    function stepSchedule() {
        return '<div class="mas-card">'
            + '<h2>Muda wa kampeni</h2>'
            + '<p class="mas-muted">Bila tarehe, tangazo linaanza mara linapoidhinishwa na kuendelea hadi utakapolisimamisha.</p>'
            + '<div class="mas-field-row">'
            + field('Kuanzia', '<input type="datetime-local" value="' + esc(S.draft.startAt) + '" data-mas-input="startAt">')
            + field('Hadi', '<input type="datetime-local" value="' + esc(S.draft.endAt) + '" data-mas-input="endAt">')
            + '</div>'
            + field('Kipaumbele (0–999)', '<input type="number" min="0" max="999" value="' + esc(S.draft.priority || 0) + '" data-mas-input="priority">', 'Kipaumbele cha juu kinatangulia kwenye rotation ikiwa kuna matangazo mengi.')
            + '<div class="mas-note">' + icon('wallet')
            + '<div><b>Bajeti</b><p>Malipo ya matangazo bado hayajawashwa (Billing — Coming Soon). Hakuna malipo, wallet wala checkout inayoanzishwa hapa.</p></div>'
            + '</div></div>';
    }

    function stepPreview() {
        var creative = buildCreative();
        var item = S.draft.listing;
        if (!creative || !item) return '<div class="mas-card"><p>Chagua listing kwanza ili kuona preview.</p></div>';
        var collection = item.__collection || TYPE_META[S.draft.type].collection;
        return '<div class="mas-card">'
            + '<div class="mas-card-head"><h2>Preview halisi</h2><span class="mas-pill soft">Kama inavyoonekana kwenye soko</span></div>'
            + '<p class="mas-muted">Hii ni kadi ile ile inayotumika kwenye soko — si picha wala mockup.</p>'
            + '<div class="mas-preview-pair">'
            + '<div class="mas-preview-col"><span class="mas-preview-label">Tangazo lililodhaminiwa</span>'
            + '<div class="mas-preview-frame">' + adCardHtml(creative) + '</div></div>'
            + '<div class="mas-preview-col"><span class="mas-preview-label">Listing ya kawaida (kulinganisha)</span>'
            + '<div class="mas-preview-frame plain">' + (listingCardHtml(item, S.draft.type) || '<p class="mas-muted">Listing preview haipatikani.</p>') + '</div></div>'
            + '</div>'
            + '<p class="mas-help">Aina: <b>' + esc(TYPE_META[S.draft.type].label) + '</b> · Collection: <b>' + esc(collection) + '</b></p>'
            + '</div>';
    }

    function stepSubmit() {
        var meta = TYPE_META[S.draft.type];
        var item = S.draft.listing;
        if (!meta || !item) return '<div class="mas-card"><p>Tangazo halijakamilika.</p></div>';
        var admin = isAdmin();
        var checks = [
            ['Aina', meta.label],
            ['Listing', titleOf(item, S.draft.type)],
            ['Bei / Ofa', S.draft.offer || money(priceOf(item)) || '—'],
            ['Muda', (S.draft.startAt || 'Sasa') + ' → ' + (S.draft.endAt || 'Bila mwisho')],
            ['Mahali', meta.surfaces[0]]
        ];
        return '<div class="mas-card">'
            + '<h2>Kagua na tuma</h2>'
            + '<dl class="mas-facts review">' + checks.map(function (c) {
                return '<div><dt>' + esc(c[0]) + '</dt><dd>' + esc(c[1]) + '</dd></div>';
            }).join('') + '</dl>'
            + '<div class="mas-note ' + (admin ? 'info' : '') + '">' + icon(admin ? 'check' : 'shield')
            + '<div><b>' + (admin ? 'Utachapisha moja kwa moja' : 'Nitathibitisha kwanza') + '</b><p>'
            + (admin
                ? 'Kama admin, tangazo linaanza kuonekana mara moja.'
                : 'Tangazo litaingia kwenye idhini ya SokoHai kama ilivyo utaratibu wa sasa. Hutaweza kulibadilisha wakati linasubiri idhini.')
            + '</p></div></div>'
            + '<div class="mas-submit-actions">'
            + '<button type="button" class="mas-btn" data-mas-act="save-draft"' + (S.busy ? ' disabled' : '') + '>'
            + (S.busy === 'draft' ? '<span class="mas-spinner"></span>Inahifadhi…' : icon('save') + '<span>Hifadhi rasimu</span>') + '</button>'
            + '<button type="button" class="mas-btn primary" data-mas-act="submit"' + (S.busy ? ' disabled' : '') + '>'
            + (S.busy === 'submit' ? '<span class="mas-spinner"></span>Inatuma…' : icon('send') + '<span>' + (admin ? 'Chapisha tangazo' : 'Tuma kwa idhini') + '</span>') + '</button>'
            + '</div></div>';
    }

    function wizardActionsHtml() {
        var isFirst = S.step === 1;
        var isLast = S.step === STEPS.length;
        var nextLabel = S.step === 1 ? 'Endelea' : S.step === STEPS.length - 1 ? 'Kagua na tuma' : 'Endelea';
        var canNext = S.step !== 1 || !!S.draft.type;
        if (S.step === 2) canNext = !!(S.draft.listing);
        return '<div class="mas-wizard-actions">'
            + '<button type="button" class="mas-btn" data-mas-act="wizard-back"' + (isFirst ? ' disabled' : '') + '>' + icon('back') + '<span>Nyuma</span></button>'
            + '<span class="mas-wizard-hint">Hatua ' + S.step + ' kati ya ' + STEPS.length + '</span>'
            + '<button type="button" class="mas-btn primary" data-mas-act="wizard-next"' + (isLast || !canNext ? ' disabled' : '') + '>'
            + '<span>' + esc(nextLabel) + '</span>' + icon('arrow-right') + '</button>'
            + '</div>';
    }

    /* --- campaigns --------------------------------------------------------- */
    var CAMPAIGN_FILTERS = [
        { key: 'all', label: 'Zote' },
        { key: 'draft', label: 'Rasimu' },
        { key: 'pending', label: 'Zinasubiri' },
        { key: 'active', label: 'Zinaendelea' },
        { key: 'paused', label: 'Zimesimama' },
        { key: 'completed', label: 'Zimekamilika' },
        { key: 'rejected', label: 'Zimekataliwa' }
    ];

    function campaignsHtml() {
        if (S.campaigns === null && !S.campaignsLoading) loadCampaigns();
        if (S.campaignsLoading || S.campaigns === null) {
            return '<section class="mas-view"><div class="mas-card"><div class="mas-loading"><span class="mas-spinner"></span>Inapakia kampeni zako…</div></div></section>';
        }
        var filter = S.campaignFilter || 'all';
        var all = S.campaigns.slice();
        var list = all.slice();
        if (filter === 'completed') list = all.filter(function (a) { return ['completed', 'expired', 'archived'].indexOf(campaignState(a)) >= 0; });
        else if (filter !== 'all') list = all.filter(function (a) { return campaignState(a) === filter; });
        list.sort(function (a, b) { return stateRank(campaignState(a)) - stateRank(campaignState(b)); });

        var groups = {};
        list.forEach(function (a) {
            var st = campaignState(a);
            (groups[st] = groups[st] || []).push(a);
        });
        var order = ['pending', 'active', 'paused', 'draft', 'scheduled', 'completed', 'expired', 'rejected', 'archived'];

        var chips = '<div class="mas-filters">' + CAMPAIGN_FILTERS.map(function (f) {
            var n = f.key === 'all' ? all.length
                : (f.key === 'completed'
                    ? all.filter(function (a) { return ['completed', 'expired', 'archived'].indexOf(campaignState(a)) >= 0; }).length
                    : all.filter(function (a) { return campaignState(a) === f.key; }).length);
            return '<button type="button" class="mas-filter' + (filter === f.key ? ' active' : '') + '"'
                + ' data-mas-act="filter-campaigns" data-filter="' + f.key + '">' + esc(f.label)
                + (n ? '<b>' + n + '</b>' : '') + '</button>';
        }).join('') + '</div>';

        if (!list.length) {
            return '<section class="mas-view mas-empty-page">'
                + '<div class="mas-view-head"><h1>Kampeni zangu</h1>'
                + '<button type="button" class="mas-btn primary" data-mas-act="new">' + icon('plus') + '<span>Tangazo jipya</span></button></div>'
                + chips
                + '<div class="mas-card mas-empty"><b>' + (all.length ? 'Hakuna kampeni kwenye kichujio hiki' : 'Hakuna kampeni bado') + '</b>'
                + '<p class="mas-muted">' + (all.length ? 'Badilisha kichujio kuona kampeni zako nyingine.' : 'Tangazo lako la kwanza litaonekana hapa pamoja na hali yake na takwimu zake.') + '</p>'
                + (all.length ? '' : '<button type="button" class="mas-btn primary" data-mas-act="new">' + icon('plus') + '<span>Tengeneza tangazo</span></button>') + '</div></section>';
        }
        return '<section class="mas-view">'
            + '<div class="mas-view-head"><h1>Kampeni zangu</h1>'
            + '<button type="button" class="mas-btn primary" data-mas-act="new">' + icon('plus') + '<span>Tangazo jipya</span></button></div>'
            + chips
            + order.filter(function (k) { return groups[k] && groups[k].length; }).map(function (state) {
                return '<div class="mas-group"><h2 class="mas-h2">' + esc(STATE_LABEL[state] || state) + '<span class="mas-count">' + groups[state].length + '</span></h2>'
                    + groups[state].map(campaignRowHtml).join('') + '</div>';
            }).join('')
            + '</section>';
    }

    function stateRank(st) {
        return ['pending', 'active', 'paused', 'draft', 'scheduled', 'completed', 'expired', 'rejected', 'archived'].indexOf(st);
    }

    function campaignRowHtml(a) {
        var state = campaignState(a);
        var type = campaignTypeOf(a);
        var meta = TYPE_META[type];
        var img = String(a.image || a.imageUrl || a.posterUrl || a.logoUrl || '');
        var views = Number(a.viewCount || 0), clicks = Number(a.clickCount || 0);
        var ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) + '%' : '—';
        var admin = isAdmin();
        var actions = [];
        if (state === 'draft') {
            actions.push({ act: 'edit-draft', label: 'Hariri', icon: 'edit', id: a.id });
            actions.push({ act: 'submit-draft', label: 'Tuma', icon: 'send', id: a.id, primary: true });
        }
        if (admin && (state === 'active' || state === 'paused' || state === 'pending')) {
            actions.push({ act: 'delivery', label: 'Delivery', icon: 'settings', id: a.id });
        }
        actions.push({ act: 'view-campaign', label: 'Angalia', icon: 'eye', id: a.id });
        return '<article class="mas-campaign">'
            + '<div class="mas-campaign-thumb">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : icon('image', 18)) + '</div>'
            + '<div class="mas-campaign-body">'
            + '<div class="mas-campaign-title"><b>' + esc(a.headline || a.title || 'Tangazo') + '</b>'
            + '<span class="mas-state ' + state + '">' + esc(STATE_LABEL[state] || state) + '</span></div>'
            + '<p class="mas-muted">' + (meta ? esc(meta.label) : 'Tangazo') + (a.brandName ? ' · ' + esc(a.brandName) : '')
            + (a.startAt ? ' · ' + esc(fmtDate(a.startAt)) : '') + (a.endAt ? ' → ' + esc(fmtDate(a.endAt)) : '') + '</p>'
            + '<div class="mas-campaign-metrics"><span>' + icon('eye', 13) + ' ' + views.toLocaleString() + '</span>'
            + '<span>' + icon('target', 13) + ' ' + clicks.toLocaleString() + '</span>'
            + '<span>CTR ' + ctr + '</span></div>'
            + '</div>'
            + '<div class="mas-campaign-actions">' + actions.map(function (x) {
                return '<button type="button" class="mas-btn sm' + (x.primary ? ' primary' : '') + '" data-mas-act="' + x.act + '" data-id="' + esc(x.id) + '">'
                    + icon(x.icon) + '<span>' + esc(x.label) + '</span></button>';
            }).join('') + '</div>'
            + '</article>';
    }

    function fmtDate(v) {
        try {
            if (v && typeof v.toDate === 'function') return v.toDate().toLocaleDateString();
            var d = v instanceof Date ? v : new Date(v);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString();
        } catch (e) { return ''; }
    }

    async function loadCampaigns(force) {
        if (S.campaignsLoading) return;
        if (S.campaigns && !force) return;
        S.campaignsLoading = true;
        render();
        try { S.campaigns = await fetchMyCampaigns(); }
        catch (e) { S.error = 'Kampeni hazikuweza kupakiwa: ' + readableError(e); S.campaigns = []; }
        S.campaignsLoading = false;
        render();
    }


    /* ============================ honest-data helpers ========================
       Rule of this whole screen: a metric is only rendered when its source is
       readable by this user. Everything else says WHY it is unavailable. A
       missing number is never shown as 0. */

    function unavailableTile(label, why, source) {
        return '<div class="mas-stat na"><b>Haipatikani</b><small>' + esc(label) + '</small>'
            + '<em class="mas-stat-why">' + esc(why) + '</em>'
            + (source ? '<em class="mas-stat-src">' + esc(source) + '</em>' : '') + '</div>';
    }

    function realTile(label, value, source, tone) {
        return '<div class="mas-stat ' + (tone || '') + '"><b>' + esc(String(value)) + '</b><small>' + esc(label) + '</small>'
            + (source ? '<em class="mas-stat-src">' + esc(source) + '</em>' : '') + '</div>';
    }

    function honestNote(title, body, tone) {
        return '<div class="mas-note ' + (tone || 'info') + '">' + icon('shield')
            + '<div><b>' + esc(title) + '</b><p>' + esc(body) + '</p></div></div>';
    }

    function sectionHead(title, sub, right) {
        return '<div class="mas-view-head"><div><h1>' + esc(title) + '</h1>'
            + (sub ? '<p class="mas-muted">' + esc(sub) + '</p>' : '') + '</div>'
            + (right || '') + '</div>';
    }

    function loadErrorText(scope, e) {
        var msg = (e && e.message) || String(e);
        if (/permission-denied|insufficient/i.test(msg)) return 'Sehemu hii inahitaji akaunti iliyoingia ili kuonyesha ' + scope + '.';
        if (/requires an index|index/i.test(msg)) return 'Server bado haijaandaa index ya ' + scope + '.';
        return 'Imeshindwa kupakia ' + scope + ': ' + msg;
    }

    /* -------------------------------------------------- creative library ---- */

    async function fetchMyCreatives() {
        if (!window.skh || !uid()) throw new Error('permission-denied');
        var snap = await window.skh.getDocs(window.skh.query(
            window.skh.collection(window.skh.db, 'creatives'),
            window.skh.where('ownerId', '==', uid()),
            window.skh.limit(60)
        ));
        var out = [];
        snap.forEach(function (doc) { out.push(Object.assign({}, doc.data(), { id: doc.id })); });
        return out;
    }

    async function loadLibrary(force) {
        if (S.libraryLoading) return;
        if (S.library && !force) return;
        S.libraryLoading = true;
        render();
        try {
            S.library = { items: await fetchMyCreatives(), error: '' };
        } catch (e) {
            S.library = { items: [], error: loadErrorText('maktaba yako ya ubunifu', e) };
        }
        S.libraryLoading = false;
        render();
    }

    function libraryHtml() {
        if (S.library === null && !S.libraryLoading) loadLibrary();
        var st = S.library || { items: [], error: '' };
        var head = sectionHead('Maktaba ya ubunifu',
            'Vichwa, maelezo, CTA na media ya listing ulizotumia. Hakuna katalogi ya pili — media inarejelewa tu.',
            '<span class="mas-pill soft">' + st.items.length + ' ubunifu</span>');
        if (S.libraryLoading && !st.items.length) {
            return '<section class="mas-view">' + head + '<div class="mas-card"><div class="mas-loading"><span class="mas-spinner"></span>Inapakia ubunifu wako…</div></div></section>';
        }
        if (st.error) {
            return '<section class="mas-view">' + head + '<div class="mas-card"><div class="mas-empty"><b>Maktaba haipatikani</b>'
                + '<p class="mas-muted">' + esc(st.error) + '</p></div></div>'
                + honestNote('Kwa nini', 'Ubunifu huhifadhiwa chini ya akaunti yako (creatives). Bila akaunti iliyoingia, server inakataa usomaji — kwa hiyo tunaonyesha hali halisi badala ya orodha ya kubuni.', 'info')
                + '</section>';
        }
        if (!st.items.length) {
            return '<section class="mas-view">' + head + '<div class="mas-card mas-empty"><b>Hakuna ubunifu bado</b>'
                + '<p class="mas-muted">Kila tangazo unalounda linahifadhi ubunifu wake hapa — pamoja na kichwa, maelezo, CTA na picha ya listing.</p>'
                + '<button type="button" class="mas-btn primary" data-mas-act="new">' + icon('plus') + '<span>Tengeneza tangazo</span></button></div></section>';
        }
        var rows = st.items.map(function (c) {
            var title = String(c.title || c.campaignName || 'Ubunifu').slice(0, 80);
            var cat = String(c.category || '');
            var status = String(c.status || 'DRAFT');
            var layers = Array.isArray(c.layers) ? c.layers.length : 0;
            var head2 = '';
            (c.layers || []).forEach(function (l) {
                if (!head2 && l && l.role === 'headline' && l.type === 'text') head2 = String(l.content || '');
            });
            return '<article class="mas-campaign">'
                + '<div class="mas-campaign-thumb">' + icon('image', 18) + '</div>'
                + '<div class="mas-campaign-body">'
                + '<div class="mas-campaign-title"><b>' + esc(head2 || title) + '</b>'
                + '<span class="mas-state ' + (status === 'READY' ? 'active' : 'draft') + '">' + esc(status) + '</span></div>'
                + '<p class="mas-muted">' + esc(TYPE_META[cat] ? TYPE_META[cat].label : (cat || 'Aina haijulikani'))
                + ' · layers ' + layers + '</p>'
                + '</div>'
                + '<div class="mas-campaign-actions">'
                + '<button type="button" class="mas-btn sm" data-mas-act="use-creative" data-id="' + esc(c.id) + '">'
                + icon('plus') + '<span>Tumia</span></button>'
                + '</div></article>';
        }).join('');
        return '<section class="mas-view">' + head + '<div class="mas-card"><h2 class="mas-h2">Ubunifu wako</h2>'
            + '<div class="mas-group">' + rows + '</div></div>'
            + honestNote('Media', 'Picha zinazotumika ni zile zile za listing yako (hazipakuliwi tena), kwa hiyo hakuna nakala inayoweza kuachwa nyuma.', 'info')
            + '</section>';
    }

    /* ------------------------------------------------------- notifications -- */

    async function fetchMyNotifications() {
        if (!window.skh || !uid()) throw new Error('permission-denied');
        var snap = await window.skh.getDocs(window.skh.query(
            window.skh.collection(window.skh.db, 'notifications'),
            window.skh.where('userId', '==', uid()),
            window.skh.limit(40)
        ));
        var out = [];
        snap.forEach(function (doc) { out.push(Object.assign({}, doc.data(), { id: doc.id })); });
        out.sort(function (a, b) {
            var ta = Date.parse(a.createdAt || '') || 0, tb = Date.parse(b.createdAt || '') || 0;
            return tb - ta;
        });
        return out;
    }

    async function loadNotifications(force) {
        if (S.notificationsLoading) return;
        if (S.notifications && !force) return;
        S.notificationsLoading = true;
        render();
        try {
            S.notifications = { items: await fetchMyNotifications(), error: '' };
        } catch (e) {
            S.notifications = { items: [], error: loadErrorText('arifa zako', e) };
        }
        S.notificationsLoading = false;
        render();
    }

    function isAdNotification(n) {
        var hay = [n.type, n.kind, n.category, n.link, n.target, n.title].join(' ').toLowerCase();
        return /(^|[^a-z])(ad|ads|advert|campaign|creative|matangazo|tangazo)([^a-z]|$)/.test(hay);
    }

    function notifCardHtml(n) {
        var when = fmtDate(n.createdAt);
        return '<article class="mas-campaign"><div class="mas-campaign-thumb">' + icon('bell', 18) + '</div>'
            + '<div class="mas-campaign-body"><div class="mas-campaign-title"><b>' + esc(n.title || 'Arifa') + '</b>'
            + (n.read === true ? '' : '<span class="mas-state pending">Mpya</span>')
            + (when ? '<span class="mas-row-val">' + esc(when) + '</span>' : '') + '</div>'
            + '<p class="mas-muted">' + esc(String(n.body || '').slice(0, 180)) + '</p></div></article>';
    }

    function notificationsHtml() {
        if (S.notifications === null && !S.notificationsLoading) loadNotifications();
        var st = S.notifications || { items: [], error: '' };
        var head = sectionHead('Arifa', 'Arifa zinazohusiana na matangazo yako. Arifa za oda na ofa zinabaki kwenye arifa za akaunti.');
        if (S.notificationsLoading && !st.items.length) {
            return '<section class="mas-view">' + head + '<div class="mas-card"><div class="mas-loading"><span class="mas-spinner"></span>Inapakia arifa…</div></div></section>';
        }
        var body;
        if (st.error) {
            body = '<div class="mas-card"><div class="mas-empty"><b>Arifa hazipatikani kwa sasa</b><p class="mas-muted">' + esc(st.error) + '</p></div></div>';
        } else {
            var adItems = st.items.filter(isAdNotification);
            var others = st.items.filter(function (n) { return !isAdNotification(n); });
            var showAll = S.notifAll === true;
            var list = showAll ? st.items : adItems;
            body = '<div class="mas-card"><div class="mas-card-head"><h2>Arifa za matangazo</h2>'
                + '<span class="mas-pill soft">' + adItems.length + ' / ' + st.items.length + '</span></div>'
                + (list.length
                    ? '<div class="mas-group">' + list.map(notifCardHtml).join('') + '</div>'
                    : '<div class="mas-empty"><b>Hakuna arifa ya tangazo bado</b><p class="mas-muted">Utaipokea hapa tangazo linapotumwa, linapoidhinishwa au kukataliwa, na lengo linapokaribia.</p></div>')
                + (others.length
                    ? '<div class="mas-card-foot"><button type="button" class="mas-btn sm" data-mas-act="toggle-notif-all">'
                      + icon(showAll ? 'check' : 'bell') + '<span>' + (showAll ? 'Onyesha za matangazo pekee' : 'Onyesha arifa zote za akaunti (' + others.length + ')') + '</span></button>'
                      + '<button type="button" class="mas-btn sm ghost" data-mas-act="open-app-notifications"><span>Fungua arifa za akaunti</span></button></div>'
                    : '')
                + '</div>';
        }
        return '<section class="mas-view">' + head + body
            + honestNote('Zinatumwa na server', 'Arifa za matangazo zitaandikwa na Cloud Function (idhini, kukataliwa, kuanza, kusimama, lengo kukaribia) — sio na browser. Kwa sasa hakuna writer wa matangazo.', 'warn')
            + '</section>';
    }

    /* ------------------------------------------------- audience & targeting - */

    function audienceHtml() {
        var campaigns = S.campaigns || [];
        var withTargets = campaigns.filter(function (a) {
            return (a.targetRegions && a.targetRegions.length) || (a.targetCategories && a.targetCategories.length)
                || (a.targetKeywords && a.targetKeywords.length) || (a.targetEntityTypes && a.targetEntityTypes.length);
        });
        var rows = withTargets.map(function (a) {
            var parts = [];
            if (a.targetRegions && a.targetRegions.length) parts.push('Mikoa: ' + a.targetRegions.join(', '));
            if (a.targetCategories && a.targetCategories.length) parts.push('Kategoria: ' + a.targetCategories.join(', '));
            if (a.targetKeywords && a.targetKeywords.length) parts.push('Keywords: ' + a.targetKeywords.join(', '));
            if (a.targetEntityTypes && a.targetEntityTypes.length) parts.push('Aina: ' + a.targetEntityTypes.join(', '));
            return '<article class="mas-campaign"><div class="mas-campaign-body">'
                + '<div class="mas-campaign-title"><b>' + esc(a.headline || a.title || 'Tangazo') + '</b>'
                + '<span class="mas-state ' + campaignState(a) + '">' + esc(STATE_LABEL[campaignState(a)] || campaignState(a)) + '</span></div>'
                + '<p class="mas-muted">' + esc(parts.join(' · ')) + '</p></div></article>';
        }).join('');
        return '<section class="mas-view">'
            + sectionHead('Hadhira na walengwa', 'Lengo linategemea data iliyopo tu; kila chaguo linaonyesha kama engine inaliheshimu kweli.')
            + '<div class="mas-grid-2">'
            + '<div class="mas-card"><h2 class="mas-h2">Linaungwa mkono <span class="mas-pill">4 vipimo</span></h2>'
            + '<ul class="mas-surface-list">'
            + '<li>' + icon('check', 14) + '<span>Mkoa — <b>targetRegions</b></span></li>'
            + '<li>' + icon('check', 14) + '<span>Kategoria — <b>targetCategories</b></span></li>'
            + '<li>' + icon('check', 14) + '<span>Maneno muhimu — <b>targetKeywords</b></span></li>'
            + '<li>' + icon('check', 14) + '<span>Aina ya entity — <b>targetEntityTypes</b> (bidhaa / huduma / usafiri)</span></li>'
            + '</ul>'
            + honestNote('Nani anabadilisha', 'Kwa sasa lengo linawekwa na admin kupitia adsUpdateCampaignDelivery. Mfanyabiashara anaona lililowekwa — hawezi kulitumia kama kitufe kisichofanya kazi.', 'warn')
            + '</div>'
            + '<div class="mas-card"><h2 class="mas-h2">Halina msingi</h2>'
            + '<ul class="mas-surface-list">'
            + '<li>' + icon('x', 14) + '<span>Aina ya kifaa (device)</span></li>'
            + '<li>' + icon('x', 14) + '<span>Interests za mteja</span></li>'
            + '<li>' + icon('x', 14) + '<span>Wateja wapya vs wanaorudi</span></li>'
            + '<li>' + icon('x', 14) + '<span>Kadirio la hadhira (hakuna data ya kuhesabu)</span></li>'
            + '</ul></div>'
            + '</div>'
            + '<div class="mas-card"><h2 class="mas-h2">Lengo lililowekwa kwenye kampeni zako <span class="mas-count">' + withTargets.length + '</span></h2>'
            + (rows || '<p class="mas-muted">Hakuna kampeni yenye lengo lililowekwa bado. Hii ni hali halisi, sio kosa.</p>')
            + '</div></section>';
    }

    /* ------------------------------------------------------------ placements - */

    var PLACEMENT_LABEL = {
        home: 'Ukurasa wa mwanzo',
        discover: 'Gundua',
        search: 'Matokeo ya utafutaji',
        product_detail: 'Ukurasa wa bidhaa',
        service_detail: 'Ukurasa wa huduma',
        chat: 'Chati',
        groups: 'Makundi',
        live: 'Live',
        auction: 'Mnada',
        group_buy: 'Ununuzi wa kikundi',
        price_drop: 'Kushuka kwa bei',
        dashboard: 'Dashibodi ya muuzaji'
    };

    var SERVER_PLACEMENTS = ['home', 'discover', 'search', 'product_detail', 'service_detail', 'chat',
        'groups', 'live', 'auction', 'group_buy', 'price_drop', 'dashboard'];   // mirrors functions/ads-delivery-core.js

    function placementsHtml() {
        var campaigns = S.campaigns || [];
        var used = {};
        campaigns.forEach(function (a) {
            (a.placements || []).forEach(function (p) { used[String(p)] = (used[String(p)] || 0) + 1; });
        });
        var rows = SERVER_PLACEMENTS.map(function (p) {
            var n = used[p] || 0;
            return '<div class="mas-row' + (n ? ' on' : '') + '">'
                + '<span class="mas-row-nm">' + esc(PLACEMENT_LABEL[p] || p) + '<code class="mas-row-key">' + esc(p) + '</code></span>'
                + '<span class="mas-row-val" title="' + (n ? 'Kampeni zako ' + n + ' zinaonyeshwa hapa' : 'Hakuna kampeni yako inayotumia mahali hapa') + '">'
                + (n ? n + ' kampeni' : '—') + '</span></div>';
        }).join('');
        return '<section class="mas-view">'
            + sectionHead('Mahali pa kuonekana', 'Mahali halisi panapotumika leo. Uchaguzi unafanywa na admin; unaona kilichowekwa kwenye kampeni zako.')
            + '<div class="mas-card"><h2 class="mas-h2">Mahali yanayotumika <span class="mas-pill soft">' + SERVER_PLACEMENTS.length + '</span></h2>'
            + '<div class="mas-rows cols">' + rows + '</div>'
            + honestNote('Mahali kwa usafiri na huduma', 'Hakuna placement maalum ya usafiri bado; matangazo ya usafiri yanatumia slot za entity-type. Kuongeza transport_detail / service_discovery ni kazi ya server na inahitaji idhini.', 'warn')
            + '</div>'
            + '<div class="mas-card"><h2 class="mas-h2">Kanuni za muonekano</h2>'
            + '<ul class="mas-surface-list">'
            + '<li>' + icon('check', 14) + '<span>Upana sawa na kadi ya kawaida ya soko</span></li>'
            + '<li>' + icon('check', 14) + '<span>Chip ndogo “Sponsored”, hakuna tangazo kubwa la featured</span></li>'
            + '<li>' + icon('check', 14) + '<span>Bei na CTA zinasomeka bila kukatwa</span></li>'
            + '</ul></div></section>';
    }

    /* -------------------------------------------------------------- budget --- */

    function budgetHtml() {
        var campaigns = S.campaigns || [];
        var withGoal = campaigns.filter(function (a) {
            var g = a.goals || {};
            return Number(g.dailyImpressions || 0) > 0 || Number(g.totalImpressions || 0) > 0;
        });
        var rows = withGoal.map(function (a) {
            var g = a.goals || {};
            return '<article class="mas-campaign"><div class="mas-campaign-body">'
                + '<div class="mas-campaign-title"><b>' + esc(a.headline || a.title || 'Tangazo') + '</b></div>'
                + '<p class="mas-muted">Lengo la siku: ' + (Number(g.dailyImpressions || 0) ? Number(g.dailyImpressions).toLocaleString() + ' impressions' : '—')
                + ' · Jumla: ' + (Number(g.totalImpressions || 0) ? Number(g.totalImpressions).toLocaleString() + ' impressions' : '—') + '</p>'
                + '</div></article>';
        }).join('');
        return '<section class="mas-view">'
            + sectionHead('Bajeti na malipo', 'Tunatenganisha kwa makusudi “lengo la uwasilishaji” na “fedha halisi”.')
            + '<div class="mas-stats">'
            + realTile('Kampeni zenye lengo', withGoal.length, 'kutoka kampeni zako')
            + unavailableTile('Matumizi (spend)', 'Hakuna mfumo wa fedha za matangazo', 'inahitaji phase ya malipo')
            + unavailableTile('Bajeti iliyobaki', 'Hakuna bajeti ya fedha', 'inahitaji phase ya malipo')
            + unavailableTile('Fedha zilizotengwa', 'Hakuna reserved funds', 'inahitaji phase ya malipo')
            + '</div>'
            + '<div class="mas-card"><h2 class="mas-h2">Lengo la uwasilishaji (linaungwa mkono)</h2>'
            + (rows || '<p class="mas-muted">Hakuna kampeni yenye lengo la impressions bado. Engine inaweza kupima kasi na kukamilisha kampeni lengo linapofikiwa — lakini lengo la kuweka ni kazi ya server (adsSetMyCampaignGoals).</p>')
            + '</div>'
            + honestNote('Malipo ya matangazo — Coming Soon', 'Hakuna CPC/CPM/CPA, hakuna salio la matangazo, hakuna ankara. Malipo ya SokoPay/PesaPal ya manunuzi hayaguswi na hazitumiki kama bajeti ya matangazo. Hii ni sawa na hali ya Advertiser Billing iliyopo.', 'warn')
            + '</section>';
    }

    /* -------------------------------------------------------- transactions --- */

    function transactionsHtml() {
        return '<section class="mas-view">'
            + sectionHead('Fedha na ankara', 'Kumbukumbu za malipo ya matangazo. Hazipo bado — na hazitengenezwi kwa mwonekano tu.')
            + '<div class="mas-stats">'
            + unavailableTile('Malipo / deposits', 'Hakuna malipo ya matangazo', 'phase ya malipo')
            + unavailableTile('Refunds / adjustments', 'Hakuna salio la matangazo', 'phase ya malipo')
            + unavailableTile('Ankara / risiti', 'Hakuna ankara ya tangazo', 'phase ya malipo')
            + '</div>'
            + '<div class="mas-card mas-empty"><b>Hakuna ankara ya tangazo</b>'
            + '<p class="mas-muted">Ankara zitahitaji server-side numbering na kutobadilika; browser haitaunda ankara. Hadi hapo, hakuna kitu kinaonyeshwa hapa.</p></div>'
            + '</section>';
    }

    /* --- performance ------------------------------------------------------- */
    function analyticsHtml() {
        var campaigns = S.campaigns || [];
        if (S.campaigns === null && !S.campaignsLoading) loadCampaigns();
        var views = 0, clicks = 0;
        campaigns.forEach(function (a) { views += Number(a.viewCount || 0); clicks += Number(a.clickCount || 0); });
        var ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';
        var ranked = campaigns.slice().sort(function (a, b) { return Number(b.clickCount || 0) - Number(a.clickCount || 0); });
        var byType = {};
        campaigns.forEach(function (a) {
            var t = campaignTypeOf(a) || 'other';
            byType[t] = byType[t] || { n: 0, views: 0, clicks: 0 };
            byType[t].n++; byType[t].views += Number(a.viewCount || 0); byType[t].clicks += Number(a.clickCount || 0);
        });

        var table = ranked.length
            ? '<div class="mas-card"><div class="mas-card-head"><h2>Kwa kila tangazo</h2>'
              + '<button type="button" class="mas-btn sm" data-mas-act="export-csv">' + icon('download') + '<span>Pakua CSV</span></button></div>'
              + '<table class="mas-table"><thead><tr><th>Tangazo</th><th>Aina</th><th class="num">Maoni</th><th class="num">Clicks</th><th class="num">CTR</th></tr></thead><tbody>'
              + ranked.map(function (a) {
                  var v = Number(a.viewCount || 0), c = Number(a.clickCount || 0);
                  return '<tr><td>' + esc(a.headline || a.title || 'Tangazo') + '</td><td>' + esc((TYPE_META[campaignTypeOf(a)] || {}).label || '—')
                      + '</td><td class="num">' + v.toLocaleString() + '</td><td class="num">' + c.toLocaleString()
                      + '</td><td class="num">' + (v > 0 ? ((c / v) * 100).toFixed(1) + '%' : '—') + '</td></tr>';
              }).join('')
              + '</tbody></table>'
              + '<p class="mas-help">Chanzo: kaunta halisi za tangazo (impressions, clicks). Hakuna mfumo mpya wa analytics.</p></div>'
            : '<div class="mas-card mas-empty"><b>Hakuna takwimu bado</b><p class="mas-muted">Takwimu zitaonekana tangazo lako likianza kuonekana kwenye soko.</p></div>';

        var typeRows = Object.keys(byType).map(function (t) {
            var d = byType[t];
            return '<div class="mas-row"><span class="mas-row-nm">' + esc((TYPE_META[t] || {}).label || t) + '</span>'
                + '<span class="mas-row-val">' + d.n + ' kampeni · ' + d.views.toLocaleString() + ' maoni · ' + d.clicks.toLocaleString() + ' clicks</span></div>';
        }).join('');

        return '<section class="mas-view">'
            + sectionHead('Uchanganuzi na ripoti', 'Kile kinachopimwa kweli kinaonyeshwa; kisichopimwa kinaeleza kwa nini.', '<span class="mas-pill soft">Chanzo: tracking iliyopo</span>')
            + '<div class="mas-stats">'
            + realTile('Matangazo', campaigns.length, 'kampeni zako', 'grey')
            + realTile('Maoni (impressions)', views.toLocaleString(), 'kaunta halisi', 'blue')
            + realTile('Clicks', clicks.toLocaleString(), 'kaunta halisi', 'green')
            + realTile('CTR', ctr + '%', 'clicks ÷ impressions', 'gold')
            + unavailableTile('Reach', 'Hakuna hesabu ya watu wa kipekee', 'inahitaji rollup ya server')
            + unavailableTile('Frequency', 'Inahitaji reach', 'inahitaji rollup ya server')
            + unavailableTile('Viewable', 'adDeliveryMetrics imefungwa kwa rules', 'inahitaji callable ya mmiliki')
            + unavailableTile('Conversions', 'Hakuna event ya conversion', 'phase ya attribution')
            + unavailableTile('Spend / CPC', 'Hakuna mfumo wa fedha za matangazo', 'phase ya malipo')
            + '</div>'
            + table
            + '<div class="mas-card"><h2 class="mas-h2">Kwa aina ya tangazo</h2><div class="mas-rows">'
            + (typeRows || '<p class="mas-muted">Hakuna data bado.</p>') + '</div></div>'
            + honestNote('Migawanyo isiyopatikana', 'Kwa mahali, mkoa, tarehe na kifaa: server inayo adDeliveryMetrics lakini client hairuhusiwi kuisoma. Hadi callable ya mmiliki iidhinishwe, migawanyo hii haionyeshwi — haitabuniwa.', 'warn')
            + honestNote('Conversion na mapato', 'Hakuna event ya conversion wala rekodi ya attribution. Hatuonyeshi purchases, mapato au ROAS kana kwamba matangazo yamesababisha mauzo.', 'info')
            + '</section>';
    }

    /* Export = exactly the rows on screen, from the real counters. Nothing is
       estimated, and unavailable columns are simply not in the file. */
    function exportCampaignsCsv() {
        var list = (S.campaigns || []).slice();
        if (!list.length) { toast('Hakuna takwimu za kupakua bado.', 'error'); return; }
        var rows = [['Tangazo', 'Aina', 'Hali', 'Maoni', 'Clicks', 'CTR %', 'Kuanzia', 'Hadi']];
        list.forEach(function (a) {
            var v = Number(a.viewCount || 0), c = Number(a.clickCount || 0);
            rows.push([
                String(a.headline || a.title || 'Tangazo').replace(/"/g, '""'),
                (TYPE_META[campaignTypeOf(a)] || {}).label || '',
                STATE_LABEL[campaignState(a)] || campaignState(a),
                v, c, v > 0 ? ((c / v) * 100).toFixed(1) : '',
                fmtDate(a.startAt), fmtDate(a.endAt)
            ]);
        });
        var csv = rows.map(function (r) {
            return r.map(function (cell) {
                var v = String(cell == null ? '' : cell);
                return /[",\n]/.test(v) ? '"' + v + '"' : v;
            }).join(',');
        }).join('\n');
        try {
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'sokohai-matagazo-' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
            S.notice = 'CSV imepakuliwa: maoni, clicks na CTR pekee — vipimo visivyopatikana hazimo.';
        } catch (e) {
            S.error = 'Imeshindwa kupakua CSV: ' + readableError(e);
        }
        render();
    }

    /* --- settings ---------------------------------------------------------- */
    function settingsHtml() {
        var user = (window.skh && window.skh.currentUser) || {};
        var admin = isAdmin();
        return '<section class="mas-view">'
            + '<div class="mas-view-head"><h1>Mipangilio</h1></div>'
            + '<div class="mas-card"><h2 class="mas-h2">Akaunti ya matangazo</h2>'
            + '<dl class="mas-facts">'
            + '<div><dt>Mtumiaji</dt><dd>' + esc(user.displayName || user.email || 'Haujaingia') + '</dd></div>'
            + '<div><dt>Aina ya akaunti</dt><dd>' + (admin ? 'Admin — anaweza kuchapisha papo hapo' : 'Mfanyabiashara — matangazo yanahitaji idhini') + '</dd></div>'
            + '<div><dt>Listing zinazotangazwa</dt><dd>Bidhaa, huduma na usafiri uliosajiliwa</dd></div>'
            + '</dl></div>'
            + '<div class="mas-grid-2">'
            + '<div class="mas-card"><h2 class="mas-h2">Malipo na bajeti</h2>'
            + '<p class="mas-muted">Mfumo wa malipo ya matangazo bado haujawashwa. Hii ni hali ile ile iliyopo kwenye Advertiser Billing.</p>'
            + '<div class="mas-card-actions"><button type="button" class="mas-btn" data-mas-act="open-billing">' + icon('wallet') + '<span>Fungua Billing</span></button></div>'
            + '</div>'
            + '<div class="mas-card"><h2 class="mas-h2">Ufikiaji na usalama</h2>'
            + '<ul class="mas-surface-list">'
            + '<li>' + icon('shield', 14) + '<span>Unaweza kutangaza listing zako tu; server inathibitisha umiliki kila unapotuma.</span></li>'
            + '<li>' + icon('shield', 14) + '<span>Hakuna taarifa za wateja wala malipo yanayoonyeshwa hapa.</span></li>'
            + '</ul></div>'
            + '</div>'
            + '</section>';
    }

    /* ---------------------------------------------------------------- actions */

    function goView(view) {
        S.view = view;
        S.error = ''; S.notice = '';
        if (view === 'campaigns' || view === 'analytics' || view === 'budget' || view === 'overview') loadCampaigns(!S.campaigns);
        if (view === 'library') loadLibrary();
        if (view === 'notifications') loadNotifications();
        render();
    }

    function startNew(type) {
        S.draft = freshDraft();
        S.draft.type = type || '';
        S.step = type ? 2 : 1;
        S.view = 'create';
        S.error = ''; S.notice = '';
        if (type) ensureListings(type, true);
        render();
    }

    function pickType(type) {
        if (!TYPE_META[type]) return;
        if (S.draft.type !== type) { S.draft.listing = null; S.draft.headline = ''; S.draft.description = ''; S.draft.offer = ''; }
        S.draft.type = type;
        ensureListings(type);
        render();
    }

    function pickListing(id) {
        var list = S.listings[S.draft.type] || [];
        var item = list.filter(function (x) { return String(x.id) === String(id); })[0];
        if (!item) return;
        var el = eligibility(item, S.draft.type);
        if (!el.ok) { S.error = el.reason; render(); return; }
        S.draft.listing = item;
        S.draft.listingCollection = item.__collection || TYPE_META[S.draft.type].collection;
        S.error = '';
        render();
    }

    /* "Tumia" on a library creative: reopen the create flow on the SAME listing,
       carrying the headline/description this creative already used. It never
       copies the creative document — publishing always builds a fresh creative
       from the live listing, so stale media or a deleted listing cannot slip
       through. */
    async function useCreative(id) {
        var items = (S.library && S.library.items) || [];
        var item = items.filter(function (c) { return String(c.id) === String(id); })[0];
        if (!item) { S.error = 'Ubunifu huu haupatikani tena.'; render(); return; }
        var linked = item.linkedEntity || item.destination || {};
        var type = String(item.entityType || item.category || linked.type || '').toLowerCase();
        var entityId = String(linked.id || '');
        if (!TYPE_META[type] || !entityId) {
            /* No linked listing: never copy the creative, just open a clean flow. */
            startNew('');
            S.notice = 'Ubunifu huu haujaunganishwa na listing, kwa hiyo tunakufungulia tangazo jipya — chagua listing yako.';
            render();
            return;
        }
        startNew(type);
        try {
            var snap = await window.skh.getDoc(window.skh.doc(window.skh.db, TYPE_META[type].collection, entityId));
            if (!snap || !snap.exists()) throw new Error('not-found');
            var listing = Object.assign({ id: entityId }, snap.data(), { __collection: TYPE_META[type].collection });
            S.listings[type] = [listing].concat((S.listings[type] || []).filter(function (x) { return String(x.id) !== entityId; }));
            pickListing(entityId);
            var head = layerText(item, 'headline');
            if (head && !S.draft.headline) S.draft.headline = head.slice(0, 90);
            S.notice = 'Tangazo jipya limefunguliwa kwa listing ile ile. Kichwa na maelezo yametoka kwenye listing.';
        } catch (e) {
            S.error = /not-found|no document/i.test(String(e && e.message))
                ? 'Listing ya ubunifu huu haipo tena — haitaweza kutangazwa.'
                : 'Imeshindwa kufungua listing: ' + readableError(e);
        }
        render();
    }

    function layerText(creative, role) {
        var out = '';
        (creative && creative.layers || []).forEach(function (l) {
            if (!out && l && l.role === role && l.type === 'text') out = String(l.content || '');
        });
        return out;
    }

    function wizardNext() {
        if (S.step === 1 && !S.draft.type) { S.error = 'Chagua aina ya tangazo.'; render(); return; }
        if (S.step === 2 && !S.draft.listing) { S.error = 'Chagua listing ya kutangaza.'; render(); return; }
        if (S.step >= STEPS.length) return;
        S.step++;
        S.error = '';
        render();
    }

    function wizardBack() {
        if (S.step > 1) { S.step--; S.error = ''; render(); }
    }

    function optionAdminDelivery(id) {
        if (typeof window.skhOpenAdDeliverySettings === 'function') window.skhOpenAdDeliverySettings(String(id || ''));
        else toast('Delivery Settings haipatikani.', 'error');
    }

    async function editDraft(id) {
        var camp = (S.campaigns || []).filter(function (a) { return a.id === id; })[0];
        S.draft = freshDraft();
        S.view = 'create';
        S.step = 3;
        S.busy = ''; S.error = ''; S.notice = '';
        if (camp) {
            var type = campaignTypeOf(camp) || 'product';
            S.draft.type = type;
            S.draft.headline = camp.headline || '';
            S.draft.description = camp.description || '';
            S.draft.offer = camp.offer || camp.priceTag || '';
            S.draft.announcementId = camp.id;
            S.draft.creativeId = camp.creativeId || '';
            await ensureListings(type);
            var list = S.listings[type] || [];
            var linked = (camp.linkedEntity && camp.linkedEntity.id) || camp.entityId || '';
            S.draft.listing = list.filter(function (x) { return String(x.id) === String(linked); })[0] || null;
            if (!S.draft.listing && linked) {
                /* the listing exists but is not in the loaded page — fetch it directly */
                try {
                    var colsTry = TYPE_META[type].collections || [TYPE_META[type].collection];
                    for (var ci = 0; ci < colsTry.length && !S.draft.listing; ci++) {
                        var snap = await window.skh.getDoc(window.skh.doc(window.skh.db, colsTry[ci], String(linked)));
                        if (snap && snap.exists()) S.draft.listing = Object.assign({ id: snap.id, __collection: colsTry[ci] }, snap.data());
                    }
                } catch (e) {}
            }
            if (!S.draft.listing) S.step = 2;
        }
        render();
    }

    async function submitExistingDraft(id) {
        var camp = (S.campaigns || []).filter(function (a) { return a.id === id; })[0];
        if (!camp) return;
        await editDraft(id);
        S.step = STEPS.length;
        render();
        if (S.draft.listing) await submitCampaign();
        else { S.error = 'Listing ya tangazo hili haipo hai tena. Chagua listing nyingine.'; render(); }
    }

    function viewCampaign(id) {
        var camp = (S.campaigns || []).filter(function (a) { return a.id === id; })[0];
        if (!camp) return;
        var state = campaignState(camp);
        var type = campaignTypeOf(camp);
        var img = String(camp.image || camp.imageUrl || '');
        var host = document.querySelector('#masRoot .mas-modal-host');
        if (!host) return;
        host.innerHTML = '<div class="mas-modal" role="dialog" aria-modal="true" aria-labelledby="masCampTitle">'
            + '<div class="mas-modal-head"><b id="masCampTitle">' + esc(camp.headline || camp.title || 'Tangazo') + '</b>'
            + '<button type="button" class="mas-icon-btn" data-mas-act="close-modal" aria-label="Funga">' + icon('x') + '</button></div>'
            + '<div class="mas-modal-body">'
            + (img ? '<img class="mas-modal-img" src="' + esc(img) + '" alt="" onerror="this.style.display=\'none\'">' : '')
            + '<dl class="mas-facts">'
            + '<div><dt>Hali</dt><dd>' + esc(STATE_LABEL[state] || state) + '</dd></div>'
            + '<div><dt>Aina</dt><dd>' + esc((TYPE_META[type] || {}).label || '—') + '</dd></div>'
            + '<div><dt>Maoni</dt><dd>' + Number(camp.viewCount || 0).toLocaleString() + '</dd></div>'
            + '<div><dt>Clicks</dt><dd>' + Number(camp.clickCount || 0).toLocaleString() + '</dd></div>'
            + '<div><dt>Muda</dt><dd>' + esc(fmtDate(camp.startAt) || 'Sasa') + ' → ' + esc(fmtDate(camp.endAt) || 'Bila mwisho') + '</dd></div>'
            + '</dl>'
            + '<p class="mas-help">' + (state === 'pending'
                ? 'Tangazo linasubiri idhini ya SokoHai. Hali haiwezi kubadilishwa na mfanyabiashara kwa sasa.'
                : 'Hali ya kampeni inasimamiwa kupitia Delivery Settings (admin).') + '</p>'
            + '</div></div>';
    }

    /* ----------------------------------------------------------------- render */

    function render() {
        var root = document.getElementById('masRoot');
        if (!root) return;
        var main = root.querySelector('#masMain');
        var scrollTop = main ? main.scrollTop : 0;
        var host = root.querySelector('.mas-modal-host');
        var modalHtml = host ? host.innerHTML : '';
        root.innerHTML = shellInner() + '<div class="mas-modal-host">' + modalHtml + '</div>';
        var nextMain = root.querySelector('#masMain');
        if (nextMain) nextMain.scrollTop = scrollTop;
        if (S.view === 'create' && STEPS[S.step - 1].key === 'preview') decoratePreview();
    }

    function open(opts) {
        opts = opts || {};
        S.admin = isAdmin();
        var root = document.getElementById('masRoot');
        if (!root) {
            root = document.createElement('div');
            root.id = 'masRoot';
            root.className = 'mas-root';
            document.body.appendChild(root);
        }
        root.classList.add('open');
        document.body.classList.add('mas-open');
        if (opts.view) S.view = opts.view;
        if (opts.type) { startNew(opts.type); } else { render(); }
        loadCampaigns(true);
        try { if (typeof window.skhApplyIcons === 'function') window.skhApplyIcons(root); } catch (e) {}
    }

    function close() {
        var root = document.getElementById('masRoot');
        if (root) root.classList.remove('open');
        document.body.classList.remove('mas-open');
    }

    /* --------------------------------------------------------------- events */

    document.addEventListener('click', function (event) {
        var root = document.getElementById('masRoot');
        if (!root || !root.contains(event.target)) return;
        var nav = event.target.closest('[data-mas-nav]');
        if (nav) { goView(nav.getAttribute('data-mas-nav')); return; }
        var actionEl = event.target.closest('[data-mas-act]');
        if (!actionEl) return;
        var act = actionEl.getAttribute('data-mas-act');
        var id = actionEl.getAttribute('data-id');
        switch (act) {
            case 'close': close(); break;
            case 'new': startNew(''); break;
            case 'start': startNew(actionEl.getAttribute('data-type')); break;
            case 'pick-type': pickType(actionEl.getAttribute('data-type')); break;
            case 'pick-listing': pickListing(id); break;
            case 'wizard-next': wizardNext(); break;
            case 'wizard-back': wizardBack(); break;
            case 'save-draft': saveDraft(); break;
            case 'submit': submitCampaign(); break;
            case 'clear-error': S.error = ''; render(); break;
            case 'filter-campaigns': S.campaignFilter = actionEl.getAttribute('data-filter') || 'all'; render(); break;
            case 'export-csv': exportCampaignsCsv(); break;
            case 'toggle-notif-all': S.notifAll = !S.notifAll; render(); break;
            case 'open-app-notifications':
                if (typeof window.openNotifications === 'function') window.openNotifications();
                else { S.error = 'Arifa za akaunti hazipatikani kwenye ukurasa huu.'; render(); }
                break;
            case 'use-creative': useCreative(actionEl.getAttribute('data-id')); break;
            case 'clear-notice': S.notice = ''; render(); break;
            case 'edit-draft': editDraft(id); break;
            case 'submit-draft': submitExistingDraft(id); break;
            case 'view-campaign': viewCampaign(id); break;
            case 'close-modal': {
                var host = root.querySelector('.mas-modal-host');
                if (host) host.innerHTML = '';
                break;
            }
            case 'open-delivery': optionAdminDelivery(S.draft.announcementId); break;
            case 'delivery': optionAdminDelivery(id); break;
            case 'open-billing': if (typeof window.skhOpenAdvertiserBillingSoon === 'function') window.skhOpenAdvertiserBillingSoon(); break;
            case 'go-market': close(); break;
            default: break;
        }
    });

    document.addEventListener('input', function (event) {
        var root = document.getElementById('masRoot');
        if (!root || !root.contains(event.target)) return;
        var key = event.target.getAttribute('data-mas-input');
        if (!key) return;
        var value = event.target.value;
        if (key === 'listingQuery') {
            /* re-render keeps the list honest, but the caret must survive it */
            var caret = event.target.selectionStart;
            S.listingQuery = value;
            render();
            var next = root.querySelector('[data-mas-input="listingQuery"]');
            if (next) {
                next.focus();
                try { next.setSelectionRange(caret, caret); } catch (e) {}
            }
            return;
        }
        if (key === 'priority') value = Math.max(0, Math.min(999, Number(value) || 0));
        S.draft[key] = value;
        /* keep the preview honest while the seller types */
        if (STEPS[S.step - 1].key === 'preview') {
            var frame = root.querySelector('.mas-preview-frame');
            if (frame) { frame.innerHTML = adCardHtml(buildCreative()); decoratePreview(); }
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        var root = document.getElementById('masRoot');
        if (!root || !root.classList.contains('open')) return;
        var host = root.querySelector('.mas-modal-host');
        if (host && host.innerHTML) { host.innerHTML = ''; return; }
        close();
    });

    /* ------------------------------------------------------------- public API */

    window.skhOpenMarketplaceAdsStudio = open;
    window.skhCloseMarketplaceAdsStudio = close;
    window.skhMarketplaceAdsStudio = {
        open: open,
        close: close,
        state: S,
        buildCreative: buildCreative,
        eligibility: eligibility,
        typeMeta: TYPE_META,
        _render: render
    };

    /* Route the existing advertiser entry points to the new studio. The billing
       surfaces keep their current Coming-Soon behaviour and were not touched. */
    window.skhOpenCompanyAdsSoon = function () { open({ view: 'overview' }); };
    var previousAdvertiseEntity = window.skhAdvertiseOpenEntity;
    window.skhAdvertiseOpenEntity = function () {
        try {
            var p = window.skh && window.skh.currentOpenProduct;
            if (p) {
                var col = String(p.collectionName || p._collection || 'products');
                var type = col === 'services' ? 'service' : (col === 'delivery' || col === 'drivers') ? 'transport' : 'product';
                open({ type: type, view: 'create' });
                return;
            }
        } catch (e) {}
        if (typeof previousAdvertiseEntity === 'function') previousAdvertiseEntity();
    };
})();

/* ==== js/app/38-negotiation-form.js ====
   SOKOHAI — DYNAMIC NEGOTIATION FORM (Module 01 · UI)
   ----------------------------------------------------------------
   FOMU MOJA inayojua muktadha wa biashara (PRODUCT | SERVICE |
   TRANSPORT) na kuandaa PROPOSAL iliyopangiliwa kwa Ofa
   ya kwanza (OFFER_SENT). Haiundi oda/malipo/usafirishaji.

   Inatumia:
   - 38-nego-form-logic.js  -> config/validation/totals/proposal (logic tupu)
   - 34-chat-core.js        -> window.skhChatSubmitNegotiationProposal()
                              (ndiyo njia ILIYOPO ya kutuma ofa)
   - design tokens za SokoHai (css/17-negotiation-form.css)
   ================================================================ */
import { skh } from './00-bootstrap.js';
import {
    NF_TYPES, NF_META, sectionsFor, defaultValues, validateForm,
    buildProposal, summaryLines, computeTotals, nfFmtMoney, nfTodayISO
} from './38-nego-form-logic.js';

(function () { 'use strict';

    function esc(s) { return skh.skhEscape(s == null ? '' : String(s)); }
    function myUid() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function myName() {
        if (skh.currentUser && skh.currentUser.displayName) return skh.currentUser.displayName;
        if (skh.currentUser && skh.currentUser.email) return skh.currentUser.email.split('@')[0];
        return 'Mteja';
    }

    var state = null; // { type, entity, values, errors, sending }

    // [ICON POLICY 2026-09] Icons za SVG (hakuna emoji)
    function nfIco(name, size) {
        return window.skhNavIcon ? window.skhNavIcon(name, size || 16) : '';
    }

    /* ============================================================
     * 1) KUTAFUTA MUKTADHA (bidhaa/huduma/usafiri wa chat hii)
     * ============================================================ */
    function core() { return skh.chatCore || {}; }

    function lastCardMessage(kind) {
        var msgs = (core().msgs || []);
        var refKey = kind === 'product' ? 'productRef' : (kind === 'service' ? 'serviceRef' : 'transportRef');
        var snapKey = kind === 'product' ? 'productSnapshot' : (kind === 'service' ? 'serviceSnapshot' : 'transportSnapshot');
        for (var i = msgs.length - 1; i >= 0; i--) {
            var m = msgs[i];
            if (m[refKey] && m[refKey].id) {
                var s = m[snapKey] || {};
                return {
                    id: m[refKey].id, collection: m[refKey].collection || (kind === 'transport' ? 'ride_requests' : kind + 's'),
                    title: s.title || '', price: s.price != null ? s.price : null, fare: s.fare != null ? s.fare : null,
                    image: s.image || '',
                    sellerId: s.sellerId || s.providerId || s.driverId || s.userId || null,
                    sellerName: s.sellerName || s.providerName || s.driverName || s.ownerName || s.company || '',
                    scope: s.scope || '', route: s.route || null, fromLocation: s.fromLocation || (s.route && s.route.from) || '', toLocation: s.toLocation || (s.route && s.route.to) || '',
                    packageDescription: s.packageDescription || '', vehicleType: s.vehicleType || ''
                };
            }
        }
        return null;
    }

    function relatedEntity() {
        var c = core().conv || {};
        var rel = c.related || skh.chatRelated || null;
        if (!rel) return null;
        if (rel.productId) return { id: rel.productId, collection: rel.productCollection || 'products', sellerId: rel.sellerId || null, title: rel.productTitle || '', price: rel.productPrice != null ? rel.productPrice : null, image: rel.productImage || '' };
        if (rel.serviceId) return { id: rel.serviceId, collection: 'services', sellerId: rel.sellerId || null, title: rel.serviceTitle || 'Huduma' };
        if (rel.transportId || rel.rideRequestId) return { id: rel.transportId || rel.rideRequestId, collection: rel.transportCollection || rel.productCollection || 'ride_requests', sellerId: rel.sellerId || null, sellerName: rel.sellerName || '', title: rel.transportTitle || 'Usafiri' };
        return null;
    }

    // Kadi ya MAJADILIANO iliyopo kwenye chat ndiyo mamlaka kuu ya aina
    // (hasa wakati wa Counter) — snapshot.commerceType haiwezi kudanganywa
    // na kadi ya bidhaa iliyoshirikiwa kwenye mazungumzo yaleyale.
    function lastNegotiationCard() {
        var msgs = (core().msgs || []);
        for (var i = msgs.length - 1; i >= 0; i--) {
            var m = msgs[i];
            if (m && m.type === 'negotiation' && m.negotiationId) {
                var snap = m.negotiationSnapshot || (m.nego && m.nego.snapshot) || m.negotiation || null;
                if (snap && snap.negotiationId) return snap;
            }
        }
        return null;
    }

    function entityFromNegotiation(n) {
        n = n || {};
        var t = (n.commerceType === NF_TYPES.SERVICE) ? NF_TYPES.SERVICE
            : (n.commerceType === NF_TYPES.TRANSPORT) ? NF_TYPES.TRANSPORT : NF_TYPES.PRODUCT;
        var base = {
            negotiationId: n.negotiationId,
            sellerId: n.sellerId || null, sellerName: n.sellerName || '',
            isCounter: true
        };
        if (t === NF_TYPES.TRANSPORT) {
            var route = n.route || {};
            return Object.assign(base, {
                id: n.transportId || n.productId || '',
                collection: n.transportCollection || n.productCollection || 'ride_requests',
                title: n.transportTitle || n.productTitle || 'Usafiri',
                image: n.transportImage || n.productImage || '',
                fare: n.currentUnitPrice != null ? n.currentUnitPrice : null,
                price: n.originalUnitPrice != null ? n.originalUnitPrice : (n.currentUnitPrice != null ? n.currentUnitPrice : null),
                route: route, fromLocation: route.from || '', toLocation: route.to || '',
                packageDescription: n.packageDescription || '', packageQuantity: n.packageQuantity || '',
                weight: n.weight != null ? n.weight : null,
                pickupDate: n.pickupDate || '', deliveryDeadline: n.deliveryDeadline || '',
                vehicleType: n.vehicleType || '', specialRequirements: n.specialRequirements || ''
            });
        }
        if (t === NF_TYPES.SERVICE) {
            return Object.assign(base, {
                id: n.serviceId || n.productId || '',
                collection: n.serviceCollection || n.productCollection || 'services',
                title: n.serviceTitle || n.productTitle || 'Huduma',
                image: n.serviceImage || n.productImage || '',
                price: n.originalUnitPrice != null ? n.originalUnitPrice : (n.currentUnitPrice != null ? n.currentUnitPrice : null),
                scope: n.scope || '', location: n.location || '',
                deadline: n.deadline || '', deadlineDate: n.deadlineDate || '',
                requirements: n.requirements || '', quantity: n.quantity || 1
            });
        }
        return Object.assign(base, {
            id: n.productId || '',
            collection: n.productCollection || 'products',
            title: n.productTitle || 'Bidhaa',
            image: n.productImage || '',
            price: n.originalUnitPrice != null ? n.originalUnitPrice : (n.currentUnitPrice != null ? n.currentUnitPrice : null),
            quantity: n.quantity || 1, variants: n.variants || null,
            deliveryLocation: n.deliveryLocation || '', preferredDate: n.preferredDate || ''
        });
    }

    function productEntityFrom(p) {
        p = p || {};
        var col = p.collectionName || p.itemCollection || skh.currentFeedCollection || 'products';
        if (col === 'drivers') {
            return { type: NF_TYPES.TRANSPORT, entity: {
                id: p.id, collectionName: 'drivers',
                title: p.title || p.driverName || p.company || 'Usafiri',
                price: p.price, fare: p.fare != null ? p.fare : p.price,
                image: p.image || '', vehicleType: p.vehicleType || '',
                route: p.route || { from: p.pickupRegion || p.fromRegion || '', to: p.destinationRegion || p.toRegion || '' },
                fromLocation: p.fromLocation || p.pickupRegion || '', toLocation: p.toLocation || p.destinationRegion || '',
                sellerId: p.userId || p.sellerId, sellerName: p.driverName || p.ownerName || p.company || '',
                weight: p.maxWeight != null ? Number(p.maxWeight) : null
            } };
        }
        if (col === 'services') {
            return { type: NF_TYPES.SERVICE, entity: {
                id: p.id, collectionName: 'services',
                title: p.title || p.serviceName, price: p.price, image: p.image,
                sellerId: p.userId || p.providerId || p.sellerId, sellerName: p.ownerName || p.sellerName || '',
                scope: p.scope || p.description || ''
            } };
        }
        return { type: NF_TYPES.PRODUCT, entity: { id: p.id, collection: col, title: p.title || p.itemTitle, price: p.price, image: p.image || (p.images && p.images[0]) || p.photo || '', sellerId: p.userId, sellerName: p.ownerName || '', category: p.category, stockQuantity: p.stockQuantity, saleMode: p.saleMode, selectedVariants: p.selectedVariants } };
    }

    function detectTypeAndEntity(opts) {
        if (opts && opts.type) return { type: opts.type, entity: opts.entity || null };
        
        // Ikiwa ametuma entity moja kwa moja (bila kuifunga ndani ya { type, entity })
        if (opts && (opts.id || opts.productId || opts.serviceId || opts.transportId)) {
            var rawCol = (opts.collectionName || opts.collection || '').toLowerCase();
            var guessType = (rawCol === 'services' || opts.serviceId) ? NF_TYPES.SERVICE
                : ((rawCol === 'drivers' || rawCol === 'ride_requests' || opts.transportId) ? NF_TYPES.TRANSPORT : NF_TYPES.PRODUCT);
            return { type: guessType, entity: opts };
        }

        // 1) Majadiliano yaliyopo (Counter) — aina hufuata snapshot halisi.
        var negoSnap = lastNegotiationCard();
        if (negoSnap) {
            var ent = entityFromNegotiation(negoSnap);
            return { type: ent.collection === 'services' ? NF_TYPES.SERVICE
                : ((ent.collection === 'ride_requests' || ent.collection === 'drivers') ? NF_TYPES.TRANSPORT : NF_TYPES.PRODUCT),
                entity: ent };
        }
        // 2) Muktadha wa chat uliohifadhiwa (fahamu collection kweli).
        if (skh.activeChatTransport && skh.activeChatTransport.id) {
            var t = skh.activeChatTransport;
            var tcol = t.collectionName || t.collection || 'ride_requests';
            return { type: NF_TYPES.TRANSPORT, entity: { id: t.id, collection: tcol, collectionName: tcol, title: t.title || t.cargoName || 'Usafiri', fare: t.price != null ? t.price : t.fare, route: t.route, fromLocation: t.fromLocation, toLocation: t.toLocation, packageDescription: t.packageDescription, sellerId: t.userId || t.providerId || t.driverId || t.sellerId, sellerName: t.driverName || t.ownerName || t.sellerName || '', vehicleType: t.vehicleType || '' } };
        }
        if (skh.activeChatService && skh.activeChatService.id) {
            var s = skh.activeChatService;
            return { type: NF_TYPES.SERVICE, entity: { id: s.id, collection: s.collectionName || s.collection || 'services', title: s.title || s.serviceName, price: s.price, image: s.image, sellerId: s.userId || s.providerId || s.sellerId, sellerName: s.ownerName || s.sellerName || '', scope: s.scope || s.description || '' } };
        }
        if (skh.activeChatProduct && skh.activeChatProduct.id) {
            return productEntityFrom(skh.activeChatProduct);
        }
        // 3) Rejeo la mazungumzo (conversation.related).
        var rel = relatedEntity();
        if (rel) return { type: (rel.collection === 'services' ? NF_TYPES.SERVICE : ((rel.collection === 'ride_requests' || rel.collection === 'drivers') ? NF_TYPES.TRANSPORT : NF_TYPES.PRODUCT)), entity: rel };
        // 4) Kadi zilizoshirikiwa kwenye uzi.
        var tt = lastCardMessage('transport');
        if (tt) return { type: NF_TYPES.TRANSPORT, entity: tt };
        var ts = lastCardMessage('service');
        if (ts) return { type: NF_TYPES.SERVICE, entity: ts };
        var tp = lastCardMessage('product');
        if (tp) return { type: NF_TYPES.PRODUCT, entity: tp };
        return { type: null, entity: null };
    }

    // Vuta taarifa HALISI za bidhaa/huduma/safari kutoka Firestore
    // (bei ya sokoni, picha, muuzaji, stoo, kategoria) — kuziba uwongo.
    async function enrichEntity(type, entity) {
        if (!entity || !entity.id || !skh.db) return entity;
        var coll = entity.collection || entity.collectionName;
        if (!coll) return entity;
        try {
            var snap = await skh.getDoc(skh.doc(skh.db, coll, entity.id));
            if (!snap || !snap.exists || !snap.exists()) return entity;
            var d = snap.data() || {};
            if (type === NF_TYPES.PRODUCT) {
                return {
                    id: entity.id, collection: entity.collection,
                    title: d.title || d.itemTitle || entity.title,
                    price: d.price != null ? d.price : entity.price,
                    image: d.image || (d.images && d.images[0]) || d.photo || entity.image || '',
                    sellerId: d.userId || entity.sellerId,
                    sellerName: d.ownerName || entity.sellerName || '',
                    category: d.category || d.subCategory || '',
                    stockQuantity: d.stockQuantity != null ? d.stockQuantity : null,
                    saleMode: d.saleMode || '',
                    baseUnit: d.baseUnit || '',
                    wholesalePrice: d.wholesalePrice != null ? d.wholesalePrice : null,
                    variants: d.variants || null,
                    selectedVariants: entity.selectedVariants || null
                };
            }
            if (type === NF_TYPES.SERVICE) {
                return {
                    id: entity.id, collection: 'services',
                    title: d.title || d.serviceName || entity.title || 'Huduma',
                    price: d.price != null ? d.price : entity.price,
                    image: d.image || (d.images && d.images[0]) || entity.image || '',
                    sellerId: d.userId || d.providerId || entity.sellerId,
                    sellerName: d.ownerName || entity.sellerName || '',
                    description: d.description || '', location: d.location || '',
                    category: d.category || '', scope: entity.scope || d.description || '',
                    // [NEGO LOCK §21/§22] Provider Settings: mtoa huduma anaweza kuzima
                    // negotiation kwa huduma maalum. Default ON kwa matangazo ya zamani.
                    negotiationAllowed: d.negotiationAllowed === false ? false : true
                };
            }
            if (coll === 'drivers') {
                // Tangazo la mtoa usafiri (si ride_request) — lina pickupRegion/
                // destinationRegion, price (nauli ya msingi) na userId (mmiliki).
                var drRoute = {
                    from: d.pickupRegion || d.fromRegion || (entity.route && entity.route.from) || entity.fromLocation || '',
                    to: d.destinationRegion || d.toRegion || (entity.route && entity.route.to) || entity.toLocation || ''
                };
                return Object.assign({}, entity, {
                    id: entity.id, collection: 'drivers', collectionName: 'drivers',
                    title: d.title || d.driverName || d.company || entity.title || 'Usafiri',
                    fare: d.price != null ? d.price : (entity.fare != null ? entity.fare : (entity.price != null ? entity.price : null)),
                    price: d.price != null ? d.price : entity.price,
                    route: drRoute,
                    fromLocation: drRoute.from, toLocation: drRoute.to,
                    packageDescription: entity.packageDescription || d.description || '',
                    vehicleType: d.vehicleType || entity.vehicleType || '',
                    weight: d.maxWeight != null ? Number(d.maxWeight) : (entity.weight != null ? entity.weight : null),
                    image: d.image || entity.image || '',
                    sellerId: d.userId || d.sellerId || entity.sellerId || entity.userId || null,
                    sellerName: d.driverName || d.ownerName || d.company || entity.sellerName || entity.ownerName || '',
                    // [NEGO LOCK §21/§22] Transporter Settings.
                    negotiationAllowed: d.negotiationAllowed === false ? false : true
                });
            }
            // ride_requests (ombi la usafiri/mzigo)
            var rrRoute = {
                from: d.fromLocation || (entity.route && entity.route.from) || entity.fromLocation || '',
                to: d.toLocation || (entity.route && entity.route.to) || entity.toLocation || ''
            };
            return Object.assign({}, entity, {
                id: entity.id, collection: coll, collectionName: coll,
                title: d.cargoName || entity.title || 'Usafiri',
                fare: d.fare != null ? d.fare : (d.cargoPrice != null ? d.cargoPrice : (entity.fare != null ? entity.fare : null)),
                price: d.cargoPrice != null ? d.cargoPrice : (d.fare != null ? d.fare : entity.price),
                route: rrRoute,
                fromLocation: rrRoute.from, toLocation: rrRoute.to,
                packageDescription: d.cargoDescription || d.cargoName || entity.packageDescription || '',
                packageQuantity: d.cargoSize || entity.packageQuantity || '',
                weight: d.cargoWeight != null ? d.cargoWeight : (entity.weight != null ? entity.weight : null),
                vehicleType: d.vehicleType || entity.vehicleType || '',
                sellerId: d.driverId || d.acceptedDriverId || d.providerId || d.userId || entity.sellerId || entity.providerId || entity.userId || null,
                sellerName: d.driverName || entity.sellerName || entity.providerName || ''
            });
        } catch (e) { /* endelea na snapshot ndogo */ return entity; }
    }

    /* ============================================================
     * 2) SHELL YA FOMU (bottom sheet — mobile first)
     * ============================================================ */
    function close() {
        var shell = document.getElementById('nfShell');
        if (shell) shell.remove();
        /* [NEGO-FIX 2026-09-21] Usirudishe scroll ya background kama chat
           bado iko wazi chini ya fomu (fomu hufunguka NDANI ya chat). */
        try {
            var cm = document.getElementById('chatModal');
            document.body.style.overflow = (cm && cm.style.display !== 'none') ? 'hidden' : '';
        } catch (e) { document.body.style.overflow = ''; }
        state = null;
    }
    window.skhNegoFormClose = close;

    function shellHtml(meta) {
        return '<div class="nf-shell" id="nfShell" role="dialog" aria-modal="true" aria-labelledby="nfTitle">'
            + '<div class="nf-sheet">'
            + '<div class="nf-head">'
            + '<div class="nf-head-t"><span class="nf-head-ico">' + nfIco(meta.icon, 20) + '</span><div><h2 id="nfTitle">' + esc(meta.title) + '</h2><span class="nf-head-sub">SokoHai · Majadiliano salama</span></div></div>'
            + '<button type="button" class="nf-x" id="nfCloseBtn" aria-label="Funga">' + nfIco('x', 18) + '</button>'
            + '</div>'
            + '<div class="nf-body" id="nfBody"></div>'
            + '<div class="nf-foot" id="nfFoot" style="display:none;"></div>'
            + '</div></div>';
    }

    function loadingHtml(meta) {
        return '<div class="nf-state"><div class="nf-spinner" aria-hidden="true"></div>'
            + '<b>' + nfIco(meta.icon, 16) + ' ' + esc(meta.label) + ' inapakiwa…</b>'
            + '<span>subiri kidogo.</span></div>';
    }

    function unavailableHtml(meta, reason) {
        return '<div class="nf-state nf-state-warn">'
            + '<div class="nf-state-ico">' + nfIco('search', 26) + '</div>'
            + '<b>' + (reason || 'Hatujapata' ) + '</b>'
            + '<span>Fungua tena fomu kutoka kwenye kadi ya ' + esc(meta.label.toLowerCase()) + ' ndani ya mazungumzo.</span>'
            + '<button type="button" class="nf-btn nf-btn-light" id="nfUnavailClose">Funga</button></div>';
    }

    /* ============================================================
     * 3) KADI YA MUKTADHA (context — picha, jina, muuzaji, bei ya sokoni)
     * ============================================================ */
    function contextCardHtml(type, entity) {
        var meta = NF_META[type];
        var img = entity.image || '';
        var imgHtml = img
            ? '<img src="' + esc(img) + '" alt="" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'nf-noimg\');">'
            : '<span class="nf-ctx-emoji">' + nfIco(meta.icon, 26) + '</span>';
        var priceLine = '';
        var catalogLabel = type === NF_TYPES.TRANSPORT ? 'Nauli ya tangazo'
            : (type === NF_TYPES.SERVICE ? 'Bei ya kawaida' : 'Bei ya sokoni');
        if (entity.price != null && Number(entity.price) > 0) {
            priceLine = '<div class="nf-ctx-price"><span>' + catalogLabel + '</span><b id="nfCatalogPrice">' + nfFmtMoney(entity.price) + '</b></div>';
        }
        var sellerLine = entity.sellerName
            ? '<div class="nf-ctx-seller">' + nfIco('shop', 13) + ' ' + esc(entity.sellerName) + '</div>' : '';
        var extra = '';
        if (type === NF_TYPES.TRANSPORT) {
            var r = entity.route || {};
            if (r.from || r.to || entity.fromLocation || entity.toLocation) {
                extra = '<div class="nf-ctx-sub">' + nfIco('map', 13) + ' ' + esc(r.from || entity.fromLocation || '?')
                    + ' <span class="nf-inline-arrow">' + nfIco('arrow-right', 12) + '</span> '
                    + esc(r.to || entity.toLocation || '?') + '</div>';
            }
        } else if (type === NF_TYPES.SERVICE && (entity.scope || entity.description)) {
            extra = '<div class="nf-ctx-sub">' + esc(String(entity.scope || entity.description).slice(0, 110)) + '</div>';
        }
        return '<div class="nf-ctx">'
            + '<div class="nf-ctx-img">' + imgHtml + '</div>'
            + '<div class="nf-ctx-info">'
            + '<span class="nf-badge">' + nfIco(meta.icon, 13) + ' ' + esc(meta.label) + '</span>'
            + '<b class="nf-ctx-title">' + esc(entity.title || meta.label) + '</b>'
            +   extra + sellerLine + priceLine
            + '</div></div>';
    }

    /* ============================================================
     * 4) UCHORAJI WA FIELDS
     * ============================================================ */
    var UID = 0;
    function fid(key) { return 'nf_' + key; }
    function errId(key) { return 'nfErr_' + key; }

    function fieldLabel(f) {
        var star = f.required ? ' <span class="nf-req" aria-hidden="true">*</span>' : '';
        return '<label for="' + fid(f.key) + '">' + esc(f.label) + star + '</label>';
    }

    function inputAttrs(f) {
        var a = ' id="' + fid(f.key) + '" data-k="' + esc(f.key) + '"';
        if (f.placeholder) a += ' placeholder="' + esc(f.placeholder) + '"';
        if (f.maxLength) a += ' maxlength="' + f.maxLength + '"';
        if (f.inputMode) a += ' inputmode="' + f.inputMode + '"';
        if (f.step != null) a += ' step="' + f.step + '"';
        return a;
    }

    function chipsHtml(f, current) {
        var options = (f.options || []).filter(function (o) { return o !== ''; });
        var html = '<div class="nf-chips" role="group" aria-label="' + esc(f.label) + '" data-k="' + esc(f.key) + '">';
        options.forEach(function (opt) {
            var on = current === opt;
            html += '<button type="button" class="nf-chip' + (on ? ' on' : '') + '" data-val="' + esc(opt) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(opt) + '</button>';
        });
        var otherOn = current && options.indexOf(current) === -1;
        html += '<button type="button" class="nf-chip nf-chip-other' + (otherOn ? ' on' : '') + '" data-other="1" aria-pressed="' + (otherOn ? 'true' : 'false') + '">' + nfIco('edit', 12) + ' Nyingine</button>';
        html += '</div>';
        html += '<input type="text" class="nf-chip-input' + (otherOn ? '' : ' hidden') + '" id="' + fid(f.key) + '_other" data-k="' + esc(f.key) + '" placeholder="Andika chaguo lako…" value="' + (otherOn ? esc(current) : '') + '" maxlength="60" aria-label="' + esc(f.label) + ' (nyingine)">';
        return html;
    }

    function renderField(f, values) {
        var key = f.key;
        var val = values[key] != null ? values[key] : '';
        var describedBy = ' aria-describedby="' + errId(key) + '"';
        var invalid = state.errors[key] ? ' aria-invalid="true"' : '';
        var inner = '';

        if (f.kind === 'total') {
            return '<div class="nf-total" id="nfTotalBox" aria-live="polite" aria-atomic="true"><span>' + esc(f.label) + '</span><b id="nfTotalVal">—</b></div>';
        }
        if (f.kind === 'chips') {
            inner = chipsHtml(f, val);
        } else if (f.kind === 'textarea') {
            inner = '<textarea' + inputAttrs(f) + ' rows="' + (f.rows || 2) + '"' + describedBy + invalid + '>' + esc(val) + '</textarea>';
        } else if (f.kind === 'select') {
            var opts = (f.options || []).slice();
            var rawOpts = opts.map(function (o) { return String(typeof o === 'string' ? o : o.value); });
            // Thamani halisi ya tangazo (mf. aina ya chombo isiyoorodheshwa)
            // ionekane/ichaguliwe badala ya kupotea kimya.
            if (val !== '' && val != null && rawOpts.indexOf(String(val)) === -1) {
                opts.unshift({ value: String(val), label: String(val) });
            }
            inner = '<select' + inputAttrs(f) + describedBy + invalid + '>' + opts.map(function (o) {
                var ov = typeof o === 'string' ? o : o.value;
                var ol = typeof o === 'string' ? o : o.label;
                return '<option value="' + esc(ov) + '"' + (String(val) === String(ov) ? ' selected' : '') + '>' + esc(ol) + '</option>';
            }).join('') + '</select>';
        } else if (f.kind === 'date') {
            var min = f.minDate === 'today' ? nfTodayISO() : (f.minDate === 'pickupDate' ? (values.pickupDate || nfTodayISO()) : '');
            inner = '<input type="date"' + inputAttrs(f) + (min ? ' min="' + min + '"' : '') + ' value="' + esc(val) + '"' + describedBy + invalid + '>';
        } else if (f.kind === 'money') {
            inner = '<div class="nf-money"><span>TSh</span><input type="number"' + inputAttrs(f) + ' min="' + (f.min || 0) + '" value="' + esc(val) + '"' + describedBy + invalid + '></div>';
        } else if (f.kind === 'number') {
            inner = '<input type="number"' + inputAttrs(f) + ' min="' + (f.min != null ? f.min : 0) + '"' + (f.max != null ? ' max="' + f.max + '"' : '') + (f.locked ? ' readonly tabindex="-1" aria-readonly="true"' : '') + ' value="' + esc(val) + '"' + describedBy + invalid + '>';
        } else {
            inner = '<input type="text"' + inputAttrs(f) + ' value="' + esc(val) + '"' + describedBy + invalid + '>';
        }

        // Jozi (mf. idadi + kizio) — kichocheo cha kuweka pamoja.
        var pairHtml = '';
        if (f.pairedWith) {
            var pf = state._fieldIndex[f.pairedWith];
            if (pf) pairHtml = renderField(pf, values);
        }
        var pairClass = f.pairedWith ? ' nf-pair' : '';
        var hint = f.locked ? '<div class="nf-hint">Bidhaa ya mnada — idadi ni 1.</div>' : '';
        return '<div class="nf-field' + pairClass + '" data-field="' + esc(key) + '">'
            + (f.kind === 'chips' ? '<span class="nf-label">' + esc(f.label) + '</span>' : fieldLabel(f))
            + '<div class="nf-field-control' + (f.pairedWith ? ' nf-pair-row' : '') + '">' + inner + (pairHtml ? pairHtml : '') + '</div>'
            + hint + '<div class="nf-field-error" id="' + errId(key) + '">' + esc(state.errors[key] || '') + '</div></div>';
    }

    function formHtml(type, entity, values) {
        var sections = sectionsFor(type, entity);
        state._fieldIndex = {};
        sections.forEach(function (sec) { sec.fields.forEach(function (f) { state._fieldIndex[f.key] = f; }); });

        var html = contextCardHtml(type, entity);
        var ruleLine = type === NF_TYPES.TRANSPORT
            ? 'Nauli ya tangazo <b>haibadilishwi</b>. Unawasilisha nauli unayopendekeza — msafirishaji ndiye atakayejibu.'
            : (type === NF_TYPES.SERVICE
                ? 'Bei ya kawaida <b>haibadilishwi</b>. Unawasilisha bei unayopendekeza — mtoa huduma ndiye atakayejibu.'
                : 'Bei ya sokoni <b>haibadilishwi</b>. Unawasilisha bei yako ya majadiliano pekee — muuzaji ndiye atakayejibu.');
        html += '<div class="nf-rule-hint">' + nfIco('lock', 13) + ' ' + ruleLine + '</div>';
        html += '<div id="nfBanner" class="nf-banner" style="display:none;" role="alert"></div>';

        sections.forEach(function (sec) {
            html += '<section class="nf-section' + (sec.optional ? ' nf-section-opt' : '') + '">';
            html += '<h3>' + esc(sec.title) + (sec.optional ? ' <span class="nf-opt-tag">hiari</span>' : '') + '</h3>';
            // Paired fields: usirudie kizio (kimejumuishwa kwenye namba)
            var done = {};
            sec.fields.forEach(function (f) {
                if (done[f.key]) return;
                if (isPairedTarget(sec, f)) return; // kimeingizwa kupitia wenzi
                if (f.pairedWith) done[f.pairedWith] = 1;
                html += renderField(f, values);
            });
            html += '</section>';
        });

        var meta = NF_META[type];
        html += '<section class="nf-section nf-summary-sec"><h3>' + nfIco('clipboard', 15) + ' Muhtasari wa Ofa Yako</h3>'
            + '<div class="nf-sum-head"><span class="nf-badge">' + nfIco(meta.icon, 13) + ' ' + esc(meta.label.toUpperCase()) + '</span>'
            + '<b id="nfSumTitle">' + esc(entity.title || meta.label) + '</b></div>'
            + '<div class="nf-summary" id="nfSummary" aria-live="polite"></div></section>';
        return html;
    }

    function isPairedTarget(sec, f) {
        for (var i = 0; i < sec.fields.length; i++) {
            if (sec.fields[i].pairedWith === f.key) return true;
        }
        return false;
    }

    function footerHtml(meta) {
        return '<button type="button" class="nf-btn nf-btn-light" id="nfCancelBtn">Ghairi</button>'
            + '<button type="button" class="nf-btn nf-btn-primary" id="nfSendBtn"><span id="nfSendLabel">' + nfIco('send', 14) + ' ' + esc(meta.cta) + '</span></button>';
    }

    /* ============================================================
     * 5) THAMANI ZA FOMU + MUKTADHA WA MOJA KWA MOJA
     * ============================================================ */
    function readValues() {
        if (!state) return {};
        var sheet = document.getElementById('nfShell');
        if (!sheet) return state.values;
        sheet.querySelectorAll('[data-k]').forEach(function (el) {
            var k = el.getAttribute('data-k');
            if (el.classList && el.classList.contains('nf-chip-input')) {
                // maandishi ya "Nyingine" huandikwa tu yakionekana
                if (!el.classList.contains('hidden')) state.values[k] = el.value.trim();
                return;
            }
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                state.values[k] = el.value;
            }
        });
        return state.values;
    }

    function currentProposal() {
        var c = core();
        var values = readValues();
        var lockedChat = state.chatContext || {};
        var ctx = {
            conversationId: lockedChat.convId || c.convId || null,
            buyerId: myUid(), buyerName: myName(),
            // Mmiliki halisi wa tangazo ndiye mpokeaji; ikiwa hajulikani,
            // mwenyeji wa chat (muuzaji/mtoa huduma/dereva) ndiye mpokeaji.
            sellerId: state.entity.sellerId || state.entity.providerId || state.entity.driverId || state.entity.userId || lockedChat.partnerUid || c.partnerUid || null,
            sellerName: state.entity.sellerName || state.entity.providerName || state.entity.driverName || state.entity.ownerName || state.entity.company || lockedChat.partnerName || c.partnerName || ''
        };
        return buildProposal(state.type, state.entity, values, ctx);
    }

    function refreshLive() {
        if (!state) return;
        var values = readValues();
        var totals = computeTotals(state.type, values);
        var totalEl = document.getElementById('nfTotalVal');
        if (totalEl) totalEl.textContent = totals.total != null ? nfFmtMoney(totals.total) : '—';

        // Tarehe ya mwisho ya kuwasilisha isiwahi kuwa kabla ya pickup.
        var dl = document.getElementById(fid('deliveryDeadline'));
        if (dl && values.pickupDate) dl.min = values.pickupDate;

        // Onyesha tofauti ya bei ya sokoni na pendekezo (sheria ya biashara).
        var proposal = null;
        try { proposal = currentProposal(); } catch (e) {}
        var sumEl = document.getElementById('nfSummary');
        if (sumEl && proposal) {
            var lines = summaryLines(state.type, proposal);
            sumEl.innerHTML = lines.map(function (l) {
                return '<div class="nf-sum-row' + (l.bold ? ' strong' : '') + '"><span>' + nfIco(l.icon, 13) + ' ' + esc(l.label) + '</span><b>' + esc(l.value) + '</b></div>';
            }).join('');
            var cmp = document.getElementById('nfPriceCompare');
            if (cmp) cmp.remove();
            if (proposal.catalogPrice != null && proposal.unitPrice != null && Number(proposal.unitPrice) !== Number(proposal.catalogPrice)) {
                var diff = Number(proposal.unitPrice) - Number(proposal.catalogPrice);
                var less = diff < 0;
                var tag = document.createElement('div');
                tag.id = 'nfPriceCompare';
                tag.className = 'nf-price-cmp ' + (less ? 'down' : 'up');
                tag.innerHTML = nfIco('tag', 12) + ' Sokoni: <b>' + nfFmtMoney(proposal.catalogPrice) + '</b> · Pendekezo lako: <b>' + nfFmtMoney(proposal.unitPrice) + '</b> (' + (less ? 'pungufu ' : 'juu ') + nfFmtMoney(Math.abs(diff)).replace('TSh ', 'TSh ') + ')';
                var priceField = document.querySelector('[data-field="unitPrice"],[data-field="fee"]');
                if (priceField && !priceField.querySelector('#nfPriceCompare')) priceField.appendChild(tag);
            }
        }
    }

    /* ============================================================
     * 6) UHAKIKI KWENYE UI (makosa ya kirafiki, sio alert mbichi)
     * ============================================================ */
    function showErrors(errors) {
        var sheet = document.getElementById('nfShell');
        if (!sheet) return;
        sheet.querySelectorAll('.nf-field').forEach(function (fEl) {
            var k = fEl.getAttribute('data-field');
            var ctrl = fEl.querySelector('input,textarea,select,.nf-chips');
            var errEl = fEl.querySelector('.nf-field-error');
            if (errors[k]) {
                fEl.classList.add('has-error');
                if (ctrl) ctrl.setAttribute('aria-invalid', 'true');
                if (errEl) errEl.textContent = errors[k];
            } else {
                fEl.classList.remove('has-error');
                if (ctrl && ctrl.tagName !== 'DIV') ctrl.removeAttribute('aria-invalid');
                if (errEl) errEl.textContent = '';
            }
        });
    }

    function showBanner(msg) {
        var b = document.getElementById('nfBanner');
        if (!b) return;
        b.style.display = 'block';
        b.innerHTML = nfIco('alert', 13) + ' ' + esc(msg);
    }

    function clearBanner() {
        var b = document.getElementById('nfBanner');
        if (b) { b.style.display = 'none'; b.innerHTML = ''; }
    }

    /* ============================================================
     * 7) MATUKIO (events)
     * ============================================================ */
    function bindEvents() {
        var sheet = document.getElementById('nfShell');
        document.getElementById('nfCloseBtn').addEventListener('click', close);
        var cancel = document.getElementById('nfCancelBtn');
        if (cancel) cancel.addEventListener('click', close);
        // Kufunga kwa kugusa nje ya kadi (backdrop) — clicks za ndani hazifungi
        // kwa sababu hulingani na `e.target === sheet` (hapana stopPropagation,
        // kwani ingezuia chips na vitufe vya ndani).
        sheet.addEventListener('click', function (e) { if (e.target === sheet && !state.sending) close(); });

        sheet.addEventListener('input', function (e) {
            var el = e.target;
            if (!el || !el.getAttribute || !el.getAttribute('data-k')) return;
            var k = el.getAttribute('data-k');
            // Futa kosa la field inapoandikwa upya.
            var fEl = el.closest('.nf-field');
            if (fEl) { fEl.classList.remove('has-error'); var ee = fEl.querySelector('.nf-field-error'); if (ee) ee.textContent = ''; }
            if (el.classList && el.classList.contains('nf-chip-input')) {
                state.values[k] = el.value.trim();
            } else {
                state.values[k] = el.value;
            }
            clearBanner();
            refreshLive();
        });

        sheet.addEventListener('change', function (e) {
            var el = e.target;
            if (el && el.getAttribute && el.getAttribute('data-k')) {
                state.values[el.getAttribute('data-k')] = el.value;
                refreshLive();
            }
        });

        // Chips (size/color/condition)
        sheet.addEventListener('click', function (e) {
            var chip = e.target.closest && e.target.closest('.nf-chip');
            if (!chip) return;
            e.preventDefault();
            var group = chip.closest('.nf-chips');
            if (!group) return;
            var k = group.getAttribute('data-k');
            var otherInput = sheet.querySelector('.nf-chip-input[data-k="' + k + '"]');
            var markPressed = function (pressed) {
                group.querySelectorAll('.nf-chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
                if (pressed) chip.setAttribute('aria-pressed', 'true');
            };
            if (chip.getAttribute('data-other')) {
                group.querySelectorAll('.nf-chip').forEach(function (c) { c.classList.remove('on'); });
                chip.classList.add('on');
                markPressed(true);
                if (otherInput) { otherInput.classList.remove('hidden'); otherInput.focus(); }
                state.values[k] = otherInput ? otherInput.value.trim() : '';
            } else {
                var val = chip.getAttribute('data-val');
                var wasOn = chip.classList.contains('on');
                group.querySelectorAll('.nf-chip').forEach(function (c) { c.classList.remove('on'); });
                if (otherInput) { otherInput.classList.add('hidden'); }
                if (!wasOn) { chip.classList.add('on'); markPressed(true); state.values[k] = val; }
                else { markPressed(false); state.values[k] = ''; }
                if (otherInput && !wasOn) otherInput.value = '';
            }
            refreshLive();
        });

        var sendBtn = document.getElementById('nfSendBtn');
        if (sendBtn) sendBtn.addEventListener('click', onSubmit);

        document.addEventListener('keydown', escHandler);
    }

    function escHandler(e) {
        if (e.key === 'Escape' && document.getElementById('nfShell') && state && !state.sending) close();
    }

    /* ============================================================
     * 8) KUTUMA — hakiki -> hesabu -> proposal -> njia ILIYOPO ya chat
     * ============================================================ */
    async function onSubmit() {
        if (!state || state.sending) return;
        var values = readValues();
        var check = validateForm(state.type, values, state.entity);
        state.errors = check.errors || {};
        showErrors(state.errors);
        if (!check.valid) {
            var firstKey = Object.keys(state.errors)[0];
            var firstEl = document.getElementById(fid(firstKey)) || document.querySelector('.nf-field.has-error input,.nf-field.has-error textarea,.nf-field.has-error select');
            if (firstEl) { try { firstEl.focus(); } catch (e) {} }
            if (typeof window.sokohaiToast === 'function') window.sokohaiToast('Jaza sehemu zilizokosekana.', 'error', 3200);
            return;
        }

        var c = core();
        var lockedChat = state.chatContext || {};
        if (!lockedChat.convId || !lockedChat.partnerUid) { showBanner('Mazungumzo na muuzaji hayajathibitishwa.'); return; }
        if (c.convId !== lockedChat.convId || c.partnerUid !== lockedChat.partnerUid) {
            showBanner('Mazungumzo yamebadilika. Funga fomu na ufungue ofa tena kwenye tangazo sahihi.');
            return;
        }

        var proposal = currentProposal();
        if (!proposal.sellerId) proposal.sellerId = c.partnerUid;
        if (!proposal.sellerName) proposal.sellerName = c.partnerName || '';

        state.sending = true;
        var btn = document.getElementById('nfSendBtn');
        var label = document.getElementById('nfSendLabel');
        if (btn) btn.disabled = true;
        if (label) label.textContent = 'Inatuma…';

        var res = null;
        try {
            if (typeof window.skhChatSubmitNegotiationProposal !== 'function') throw new Error('submit_unavailable');
            res = await window.skhChatSubmitNegotiationProposal(proposal);
        } catch (e) {
            res = { ok: false, error: (e && e.message) || 'Imeshindwa kutuma ofa.' };
        }

        state.sending = false;
        if (res && res.ok) {
            if (typeof window.sokohaiToast === 'function') window.sokohaiToast('Ofa yako imetumwa kwa ' + (proposal.sellerName || 'muuzaji') + '. Inasubiri jibu.', 'success', 3600);
            close();
            return;
        }
        if (btn) btn.disabled = false;
        if (label) label.innerHTML = nfIco('send', 14) + ' ' + esc(NF_META[state.type].cta);
        showBanner((res && res.error) ? res.error : 'Imeshindikana. Angalia mtandao.');
    }

    /* ============================================================
     * 9) KUFUNGUA FOMU
     * ============================================================ */
    window.skhNegoFormOpen = async function (opts) {
        if (!skh.requireAuth || !skh.requireAuth()) return;
        opts = opts || {};
        window.skhNegoFormClose();

        var guessed = detectTypeAndEntity(opts);
        var type = opts.type || guessed.type;
        var baseEntity = opts.entity || guessed.entity;
        // Funga entity/type/conversation wakati wa open; historia ya jozi inaweza
        // kuwa na bidhaa, huduma na usafiri tofauti lakini form hii haiwezi kubadilika.
        var openCore = core();
        var openChat = {
            convId: openCore.convId || null,
            partnerUid: openCore.partnerUid || null,
            partnerName: openCore.partnerName || ''
        };

        var host = document.createElement('div');
        var meta0 = type ? NF_META[type] : NF_META.product;
        host.innerHTML = shellHtml(meta0);
        document.body.appendChild(host.firstChild);
        document.body.style.overflow = 'hidden';
        // Tumia meneja mmoja wa modal/LIFO; hii huiweka nfShell juu ya Chat
        // hata Chat ikiwa imepandishwa hadi z-index 100010 na repair layer.
        if (typeof window.skhBringToFront === 'function') window.skhBringToFront('nfShell');
        var body = document.getElementById('nfBody');

        if (!type || !baseEntity || !baseEntity.id) {
            body.innerHTML = unavailableHtml(meta0, 'Hatujapata bidhaa, huduma au safari kwenye mazungumzo haya.');
            var b0 = document.getElementById('nfUnavailClose');
            if (b0) b0.addEventListener('click', close);
            document.getElementById('nfCloseBtn').addEventListener('click', close);
            document.addEventListener('keydown', escHandler);
            return;
        }

        body.innerHTML = loadingHtml(NF_META[type]);
        var entity = await enrichEntity(type, baseEntity);

        // [NEGO LOCK §21/§22 — FRONT GATE] Mmiliki wa tangazo (provider/transporter)
        // kama amezima negotiation → fomu haifungulwi kamwe. KM bado inafanya kazi
        // (spec §23: chatting ≠ negotiation). Backend gate iko kwenye
        // skhNegoNativeCreate (34-chat-core) — hii ni UX ya haraka tu, si gate pekee.
        if ((type === NF_TYPES.SERVICE || type === NF_TYPES.TRANSPORT) && entity.negotiationAllowed === false) {
            body.innerHTML = unavailableHtml(NF_META[type],
                'Negotiation haijaruhusiwa na mmiliki wa tangazo hili. Bei iliyotangazwa ndiyo sahihi — unaweza kuzungumza nae bado kupitia chat hii.');
            var b0 = document.getElementById('nfUnavailClose');
            if (b0) b0.addEventListener('click', close);
            document.getElementById('nfCloseBtn').addEventListener('click', close);
            return;
        }

        // Thibitisha upande wa pili (usiruhusu kujitolea ofa mwenyewe).
        var c = core();
        var sellerId = entity.sellerId || c.partnerUid;
        if (sellerId && sellerId === myUid()) {
            body.innerHTML = unavailableHtml(NF_META[type], 'Huwezi kujitolea ofa kwenye tangazo lako mwenyewe.');
            var b1 = document.getElementById('nfUnavailClose');
            if (b1) b1.addEventListener('click', close);
            document.getElementById('nfCloseBtn').addEventListener('click', close);
            return;
        }

        var liveCore = core();
        if (!openChat.convId || !openChat.partnerUid || liveCore.convId !== openChat.convId || liveCore.partnerUid !== openChat.partnerUid) {
            body.innerHTML = unavailableHtml(NF_META[type], 'Mazungumzo na mmiliki wa tangazo hayajathibitishwa.');
            var b2 = document.getElementById('nfUnavailClose');
            if (b2) b2.addEventListener('click', close);
            document.getElementById('nfCloseBtn').addEventListener('click', close);
            return;
        }
        state = { type: type, entity: entity, chatContext: openChat, values: defaultValues(type, entity), errors: {}, sending: false, _fieldIndex: {} };
        body.innerHTML = formHtml(type, entity, state.values);
        document.getElementById('nfFoot').style.display = 'flex';
        document.getElementById('nfFoot').innerHTML = footerHtml(NF_META[type]);
        bindEvents();
        refreshLive();

        // Focus ya kwanza (keyboard-friendly) — kwenye idadi au bei.
        setTimeout(function () {
            var first = document.getElementById(fIdSafe(type)) || document.querySelector('#nfBody input:not([type=date]),#nfBody textarea');
            if (first) { try { first.focus(); } catch (e) {} }
        }, 120);
    };
function fIdSafe(type) {
        if (type === NF_TYPES.TRANSPORT) return fid('packageDescription');
        if (type === NF_TYPES.SERVICE) return fid('scope');
        return fid('quantity');
    }

    // Aliases za kimataifa ili sehemu yoyote iweze kufungua fomu bila kukwama
    window.openNegotiationForm = window.skhNegoFormOpen;
    window.skhOpenNegoForm = window.skhNegoFormOpen;
})();
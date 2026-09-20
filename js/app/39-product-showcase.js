/* ==== js/app/39-product-showcase.js ====
   SOKOHAI — PRODUCT SHOWCASE UI (Module 02 · UI)
   ----------------------------------------------------------------
   Modali ya bidhaa inayomfanya BIDHAA kuwa shujaa:
   hero media → utambulisho/bei/upatikanaji → variants → maelezo →
   usambazaji → tathmini → maswali → muuzaji (fupi) → bidhaa
   zinazohusiana (maduka mbalimbali) → kifimbo cha kununua chini.

   Kanuni za utekelezaji:
   - Haiundi mifumo mipya ya bidhaa/duka/cart/chat/order — inatumia
     iliyopo (openProduct, addToCart, startChat, renderSpecialModesUI,
     openActionModal, openDirectHire, engagement 28, comments 35).
   - Ugumu wote wa mantiki uko 39-showcase-logic.js (unapimika).
   - Sehemu zisizo na data hazionyeshwi (hatubandiki uongo).
   ================================================================ */
import { skh } from './00-bootstrap.js';
import {
    psAvailability, psCanBid, psSpecRows, psHasDetails,
    psSummarizeReviews, psRatingDisplay, psVariantGroups, psVariantDelta,
    psBuildRails, psMoney, psNum, psTitle, psSellerName,
    psIsVideo, PS_PRODUCT, PS_SERVICE, PS_DRIVER, PS_FETCH_CAP, PS_LOW_STOCK
} from './39-showcase-logic.js';

(function () {
    'use strict';

    function T(key, en, vars) {
        var s = null;
        try { if (window.t) s = window.t(key, vars); } catch (e) {}
        if (!s || s === key) {
            s = en;
            if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
        }
        return s;
    }
    function esc(s) { return skh.skhEscape(s == null ? '' : String(s)); }
    function jsEsc(s) { return skh.skhJsEsc ? skh.skhJsEsc(s == null ? '' : String(s)) : esc(s); }
    function $(id) { return document.getElementById(id); }
    function fmtDate(iso) {
        try { var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(); } catch (e) { return ''; }
    }
    function starsHtml(r) {
        r = Math.round(Number(r) || 0);
        var full = '';
        var starSvg = (window.skhNavIcon ? window.skhNavIcon('star', 13) : '★');
        for (var i = 0; i < 5; i++) full += '<span class="pm-star' + (i < r ? ' pm-star--on' : '') + '">' + starSvg + '</span>';
        return '<span class="pm-stars" aria-label="Nyota ' + r + ' kati ya 5">' + full + '</span>';
    }

    /* ================================================================
     * UTAMBULISHO (chips, bei, upatikanaji, rating)
     * ================================================================ */
    function renderIdentity(p, col) {
        // Chips: aina / hali ya uuzaji / upatikanaji / eneo
        var chips = '';
        if (typeof skh.cardTypeBadge === 'function') chips += skh.cardTypeBadge(col);
        if (typeof skh.cardModeBadge === 'function') chips += skh.cardModeBadge(p);
        var av = psAvailability(p, col);
        // Mnada hai: mode badge ("Live Mnada") inatosha. Uliofungwa: onyesha.
        var dupAuction = (p.saleMode === 'auction' && av.kind === 'auction');
        if (av.label && !dupAuction) chips += '<span class="pm-avail pm-avail--' + av.kind + '">' + esc(av.label) + '</span>';
        if (typeof skh.cardLocation === 'function') {
            var loc = skh.cardLocation(p, col);
            if (loc) chips += loc;
        }
        $('pmChips').innerHTML = chips;

        $('pmTitle').textContent = psTitle(p, col);

        // Mstari wa tathmini (hufungua sehemu ya reviews)
        var rl = $('pmRatingLine');
        var rd = psRatingDisplay(p);
        if (rd) {
            rl.innerHTML = '<button type="button" class="pm-rating-link" onclick="window.skhPsGoReviews()">'
                + starsHtml(rd.avg) + ' <b>' + rd.avg.toFixed(1) + '</b>'
                + (rd.count ? ' <span class="pm-muted">(' + rd.count + ')</span>' : '')
                + '</button>';
        } else {
            rl.innerHTML = '';
        }

        // Bei kulingana na aina
        var priceEl = $('pmPrice');
        var price = psNum(p.price);
        var priceText = psMoney(p.price);
        if (col === PS_SERVICE) {
            priceText = price !== null && price > 0 ? 'Kuanzia ' + priceText : T('ps_price_negotiable', 'Maelewano');
        } else if (col === PS_DRIVER) {
            priceText = price !== null && price > 0 ? 'Kuanzia ' + priceText : T('ps_price_negotiable', 'Maelewano');
        } else if (p.saleMode === 'auction') {
            var bid = (p.modeData && psNum(p.modeData.currentBid)) || price || 0;
            priceText = 'Dau la sasa: ' + psMoney(bid);
        } else if (priceText === 'Maelewano') {
            priceText = T('ps_price_negotiable', 'Maelewano');
        } else if (p.baseUnit) {
            priceText += ' / ' + esc(p.baseUnit);
        }
        priceEl.textContent = priceText;

        // Fuatilia bei — kwa bidhaa za bei elekezi tu (si huduma/usafiri/mnada)
        var watchBtn = $('btnWatch');
        if (watchBtn) {
            watchBtn.style.display = (col === PS_PRODUCT && p.saleMode !== 'auction' && price !== null && price > 0) ? 'inline-flex' : 'none';
        }

        // Bei ya jumla (wholesale) kama ipo
        var wn = $('pmWholesaleNote');
        var wp = psNum(p.wholesalePrice);
        if (col === PS_PRODUCT && p.hasBulkPackaging && wp !== null && wp > 0) {
            wn.hidden = false;
            wn.textContent = 'Jumla: ' + psMoney(wp) + (p.bulkUnit ? ' / ' + p.bulkUnit : '');
        } else if (wn) {
            wn.hidden = true;
            wn.textContent = '';
        }
    }

    /* ================================================================
     * VARIANTS (data-driven; fallback ya kihafidhina kwa mavazi)
     * ================================================================ */
    function renderVariants(p, col) {
        var area = $('pmVariantSelectionArea');
        var groups = psVariantGroups(p, col);
        p.psVariants = {};
        p.selectedVariants = { size: 'N/A', color: 'N/A' };
        delete p.tempVariantPrice;
        if (!groups.length) {
            area.innerHTML = '';
            area.hidden = true;
            return;
        }
        var html = '';
        groups.forEach(function (g) {
            html += '<div class="pm-var-group"><div class="pm-var-label">' + esc(g.label) + '</div><div class="pm-var-chips">';
            g.options.forEach(function (o, i) {
                var deltaTxt = o.delta ? ' <small class="pm-chip-delta">+' + Math.round(o.delta).toLocaleString() + '</small>' : '';
                html += '<button type="button" class="pm-chip' + (i === 0 ? ' pm-chip--on' : '') + '"'
                    + ' data-g="' + esc(g.key) + '" data-v="' + esc(o.value) + '" aria-pressed="' + (i === 0) + '"'
                    + ' onclick="window.skhSelectVariant(this.getAttribute(\'data-g\'), this.getAttribute(\'data-v\'), this)">'
                    + esc(o.value) + deltaTxt + '</button>';
            });
            html += '</div></div>';
            // chaguo-msingi: cha kwanza
            p.psVariants[g.key] = g.options[0].value;
            if (g.key === 'size') p.selectedVariants.size = g.options[0].value;
            if (g.key === 'color') p.selectedVariants.color = g.options[0].value;
        });
        html += '<div class="pm-var-delta" id="pmVarDelta"></div>';
        area.innerHTML = html;
        area.hidden = false;
        var delta = psVariantDelta(p, p.psVariants);
        if (delta) p.tempVariantPrice = (psNum(p.price) || 0) + delta;
        refreshTotals(p);
    }

    function refreshTotals(p) {
        var totalEl = $('pmTotalPriceCalc');
        if (!totalEl) return; // mnada/huduma hazina jumla ya kununua
        if (p.saleMode === 'auction') return;
        if (typeof skh.calculateDynamicPrice === 'function') {
            try { skh.calculateDynamicPrice(); return; } catch (e) {}
        }
        var qty = parseInt(($('pmQty') || {}).value) || 1;
        var base = psNum(p.tempVariantPrice) !== null ? psNum(p.tempVariantPrice) : (psNum(p.price) || 0);
        totalEl.textContent = psMoney(base * qty);
    }

    window.skhSelectVariant = function (groupKey, value, el) {
        var p = skh.currentOpenProduct;
        if (!p) return;
        p.psVariants = p.psVariants || {};
        p.psVariants[groupKey] = value;
        if (groupKey === 'size') p.selectedVariants.size = value;
        if (groupKey === 'color') p.selectedVariants.color = value;
        if (el) {
            el.parentNode.querySelectorAll('.pm-chip').forEach(function (c) {
                c.classList.remove('pm-chip--on');
                c.setAttribute('aria-pressed', 'false');
            });
            el.classList.add('pm-chip--on');
            el.setAttribute('aria-pressed', 'true');
        }
        var delta = psVariantDelta(p, p.psVariants);
        if (delta) p.tempVariantPrice = (psNum(p.price) || 0) + delta;
        else delete p.tempVariantPrice;
        var dEl = $('pmVarDelta');
        if (dEl) dEl.textContent = delta ? 'Ongezeko la chaguo: ' + psMoney(delta) : '';
        refreshTotals(p);
    };

    // Wrappers za urithi (18-cockpit selectors sasa ni data-driven;
    // hakuna tena ongezeko la kubahatisha la XXL).
    function legacyPick(group, size) {
        var chips = document.querySelectorAll('#pmVariantSelectionArea .pm-chip');
        for (var i = 0; i < chips.length; i++) {
            if (chips[i].getAttribute('data-g') === group && chips[i].getAttribute('data-v') === String(size)) return chips[i];
        }
        return null;
    }
    window.selectProductSize = function (size, element) {
        window.skhSelectVariant('size', size, element || legacyPick('size', size));
    };
    window.selectProductColor = function (color, element) {
        window.skhSelectVariant('color', color, element || legacyPick('color', color));
    };

    /* ================================================================
     * PANEL MAALUM (mnada) — tumia renderSpecialModesUI ILIYOPO
     * ================================================================ */
    function renderSpecial(p, col) {
        var area = $('pmSpecialModeArea');
        if (col === PS_PRODUCT && p.saleMode === 'auction' && typeof window.renderSpecialModesUI === 'function') {
            area.hidden = false;
            area.innerHTML = '';
            window.renderSpecialModesUI('auction', area);
        } else {
            area.hidden = true;
            area.innerHTML = '';
        }
    }

    window.skhPsScrollToBid = function () {
        var el = $('pmSpecialModeArea');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var inp = $('userBidInput');
        if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 400);
    };

    /* ================================================================
     * MAELEZO + SIFA (zilizopo tu)
     * ================================================================ */
    function renderDetails(p, col) {
        var sec = $('pmDetailsSec');
        if (!psHasDetails(p, col)) { sec.hidden = true; return; }
        sec.hidden = false;
        var desc = (p.description || '').trim();
        var descEl = $('pmDesc');
        if (desc && desc.toLowerCase() !== 'in-store product') descEl.textContent = desc;
        else descEl.textContent = T('ps_no_desc', 'Muuzaji hajaweka maelezo ya kina.');
        descEl.classList.toggle('pm-muted', !(desc && desc.toLowerCase() !== 'in-store product'));

        var rows = psSpecRows(p, col);
        var grid = $('pmCustomDetails');
        grid.innerHTML = rows.map(function (r) {
            return '<div class="pm-spec"><span class="pm-spec-lbl">' + esc(r.label) + '</span>'
                + '<span class="pm-spec-val">' + esc(r.value) + '</span></div>';
        }).join('');
    }

    /* ================================================================
     * USAMBAZAJI NA ULINZI (mifumo iliyopo — hakuna ahadi mpya)
     * ================================================================ */
    // [ICON POLICY 2026-09] Hakuna emoji — icons za SVG (18-icons.js)
    function pico(name, size) {
        return window.skhNavIcon ? window.skhNavIcon(name, size || 16) : '';
    }
    function trustRow(iconName, text) {
        return '<div class="pm-trust-item"><span class="pm-trust-ic" aria-hidden="true">' + pico(iconName, 16) + '</span><span>' + text + '</span></div>';
    }

    function renderDelivery(p, col) {
        var list = $('pmDeliveryList');
        var rows = [];
        rows.push(trustRow('shield-check', T('ps_escrow', 'Malipo yanalindwa na Escrow — huachiwa muuzaji hadi upokee.')));

        var loc = p.location || p.region || '';
        var distance = '';
        try {
            if (p.coords && typeof p.coords.lat === 'number' && skh.userLat && skh.userLon && typeof skh.calculateDistance === 'function') {
                var km = skh.calculateDistance(skh.userLat, skh.userLon, p.coords.lat, p.coords.lon);
                if (km < 500) distance = ' (takriban ' + (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km kutoka ulipo)';
            }
        } catch (e) {}

        if (col === PS_PRODUCT) {
            if (p.isOnline !== false) rows.push(trustRow('wallet', T('ps_pay_online', 'Unaweza kulipa mtandaoni kwa Escrow na uchukue au usafirishwe.')));
            if (p.isOffline === true && loc) rows.push(trustRow('shop', 'Ununuzi wa dukani: ' + esc(loc) + esc(distance)));
            else if (loc) rows.push(trustRow('map', 'Kuchukua mwenyewe: ' + esc(loc) + esc(distance)));
            rows.push(trustRow('truck', T('ps_transport', 'Usafirishaji hupangwa kupitia madereva wa SokoHai wakati wa kulipa; nauli ni ya msafirishaji.')));
        } else if (col === PS_SERVICE) {
            if (p.section === 'online' || p.online === true) rows.push(trustRow('globe', 'Huduma ya mtandaoni.'));
            else if (loc) rows.push(trustRow('map', 'Eneo: ' + esc(loc) + esc(distance)));
            rows.push(trustRow('clipboard', T('ps_service_order', 'Eleza mahitaji kwa kitufe cha Agiza Huduma au mwasiliane kwa Chat.')));
        } else if (col === PS_DRIVER) {
            if (p.pickupRegion || p.destinationRegion) {
                rows.push('<div class="pm-trust-item"><span class="pm-trust-ic" aria-hidden="true">' + pico('map', 16) + '</span><span>'
                    + esc(p.pickupRegion || '…') + ' <span class="pm-inline-arrow">' + pico('arrow-right', 13) + '</span> ' + esc(p.destinationRegion || '…') + '</span></div>');
            }
            if (p.vehicleType) rows.push(trustRow('truck', 'Chombo: ' + esc(p.vehicleType)));
            rows.push(trustRow('handshake', T('ps_driver_pay', 'Kubaliananeni nauli na dereva; malipo ya Escrow baada ya kupokezana mzigo.')));
        }
        list.innerHTML = rows.join('');
    }

    /* ================================================================
     * TATHMINI (reviews kutoka comments array)
     * ================================================================ */
    var reviewsExpanded = {};
    var reviewMediaRegistry = {}; // revIdx -> [image urls]
    function reviewMediaHtml(c, revIdx) {
        var media = (c.media && c.media.length) ? c.media : (c.photo ? [c.photo] : []);
        if (!media.length) return '';
        var imgs = [];
        var html = '<div class="pm-rev-media">';
        media.forEach(function (u) {
            var eu = esc(u);
            if (psIsVideo(u)) {
                html += '<video src="' + eu + '" controls preload="metadata" class="pm-rev-video"></video>';
            } else {
                var imgIdx = imgs.length;
                imgs.push(u);
                html += '<button type="button" class="pm-rev-thumb" onclick="window.skhPsReviewZoom(' + revIdx + ',' + imgIdx + ')">'
                    + '<img src="' + eu + '" loading="lazy" alt="Picha ya tathmini"></button>';
            }
        });
        html += '</div>';
        reviewMediaRegistry[revIdx] = imgs;
        return html;
    }

    window.skhPsReviewZoom = function (revIdx, imgIdx) {
        if (typeof window.openImageZoom !== 'function') return;
        var imgs = reviewMediaRegistry[revIdx] || [];
        if (!imgs.length) return;
        window.openImageZoom(imgs, imgIdx || 0);
    };

    function renderReviews(p, col) {
        var sec = $('pmReviewsSec');
        var s = psSummarizeReviews(p.comments);
        var key = col + '__' + p.id;
        var type = col === PS_SERVICE ? 'service' : (col === PS_DRIVER ? 'transport' : 'product');

        var head = '<div class="pm-rev-head"><div class="pm-rev-score">'
            + '<div class="pm-rev-avg">' + (s.count ? s.avg.toFixed(1) : '–') + '</div>'
            + '<div>' + starsHtml(s.avg) + '<div class="pm-muted">' + (s.count ? s.count + ' tathmini' : 'Bado hakuna tathmini') + '</div></div>'
            + '</div>'
            + '<button type="button" class="pm-btn-outline" onclick="window.openRatingModal(\'' + jsEsc(p.id) + '\',\'' + type + '\',\'' + jsEsc(psTitle(p, col)) + '\')">' + pico('star', 14) + ' Toa Tathmini</button>'
            + '</div>';

        if (!s.count) {
            sec.innerHTML = head + '<p class="pm-muted pm-rev-empty">'
                + T('ps_no_reviews', 'Hujaona tathmini bado. Ukinunua kupitia Escrow, tathmini yako inaweza kuthibitishwa.') + '</p>';
            return;
        }
        reviewMediaRegistry = {};
        var show = reviewsExpanded[key] ? s.latest : s.latest.slice(0, 2);
        var list = show.map(function (c) {
            var revIdx = s.latest.indexOf(c);
            var name = esc(c.authorName || 'Mteja');
            var badge = c.verifiedDelivery
                ? '<span class="pm-rev-badge vd">' + pico('check', 11) + ' ' + T('ps_verified_delivery', 'Delivery Imethibitishwa') + '</span>'
                : (c.verifiedPurchase
                    ? '<span class="pm-rev-badge">' + pico('check', 11) + ' ' + T('ps_verified', 'Oda Imethibitishwa') + '</span>' : '');
            var text = c.text ? '<p class="pm-rev-text">' + esc(c.text) + '</p>' : '';
            return '<div class="pm-rev-item"><div class="pm-rev-top">'
                + '<b>' + name + '</b> ' + starsHtml(c.rating)
                + '<span class="pm-rev-date">' + esc(fmtDate(c.timestamp)) + '</span></div>'
                + badge + text + reviewMediaHtml(c, revIdx) + '</div>';
        }).join('');

        var toggle = '';
        if (s.latest.length > 2) {
            toggle = reviewsExpanded[key]
                ? '<button type="button" class="pm-rev-more" onclick="window.skhPsReviewsToggle(false)">Funga tathmini</button>'
                : '<button type="button" class="pm-rev-more" onclick="window.skhPsReviewsToggle(true)">Onyesha zote (' + s.latest.length + ')</button>';
        }
        sec.innerHTML = head + '<div class="pm-rev-list">' + list + '</div>' + toggle;
    }

    window.skhPsReviewsToggle = function (expand) {
        var p = skh.currentOpenProduct;
        if (!p) return;
        reviewsExpanded[(p.collectionName || PS_PRODUCT) + '__' + p.id] = !!expand;
        renderReviews(p, p.collectionName || PS_PRODUCT);
    };

    // Fungua fomu ya tathmini (ilikuwepo HTML lakini opener ilikosekana)
    window.openRatingModal = function (targetId, targetType, name) {
        if (!skh.requireAuth()) return;
        var m = $('ratingModal');
        if (!m || !targetId) return;
        $('ratingTargetId').value = targetId;
        if ($('ratingTargetType')) $('ratingTargetType').value = targetType || 'product';
        document.querySelectorAll('#ratingModal input[name="rate"]').forEach(function (r) { r.checked = false; });
        if ($('ratingComment')) $('ratingComment').value = '';
        if ($('ratingPhoto')) $('ratingPhoto').value = '';
        if ($('ratingVideoUrl')) $('ratingVideoUrl').value = '';
        m.style.display = 'flex';
    };

    window.skhPsGoReviews = function () {
        var el = $('pmReviewsSec');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /* ================================================================
     * MUUZAJI (laki fupi — duka ni kitendo, si shujaa)
     * ================================================================ */
    function renderSeller(p, col) {
        var name = psSellerName(p);
        var nameEl = $('pmSellerName');
        nameEl.textContent = name;

        // [CARD 2026-09] Jina la jukwaa kulingana na AINA ya tangazo.
        var roleEl = $('pmSellerRole');
        if (roleEl) {
            roleEl.textContent = col === PS_SERVICE ? 'Mtoa Huduma'
                : (col === PS_DRIVER ? 'Mtoa Usafiri' : 'Muuzaji');
        }

        var wrap = $('sellerMiniDash');
        wrap.onclick = function () {
            if (p.userId && typeof window.openSellerProfile === 'function') {
                window.openSellerProfile(p.userId, name);
            }
        };
        wrap.setAttribute('role', 'button');
        wrap.tabIndex = 0;
        wrap.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wrap.onclick(); }
        };

        if ($('pmSellerVerified') && typeof skh.cardVerified === 'function') {
            $('pmSellerVerified').innerHTML = skh.cardVerified(p);
        }
        var meta = $('pmSellerMeta');
        var rating = (typeof skh.cardRating === 'function') ? skh.cardRating(p) : '';
        var locTxt = p.location || p.region;
        meta.innerHTML = rating + (locTxt ? '<span class="pm-seller-loc">' + pico('map', 12) + ' ' + esc(locTxt) + '</span>' : '');

        if (typeof window.skhFetchSellerAvatar === 'function') {
            window.skhFetchSellerAvatar(p.userId, p.ownerPhoto || p.ownerPhotoURL || p.ownerAvatar || null, name);
        }
        var follow = $('btnFollow');
        if (follow) follow.style.display = (skh.currentUser && p.userId === skh.currentUser.uid) ? 'none' : 'flex';
    }

    /* ================================================================
     * KIFIMBO CHA KUNUNUA (sticky) — states validi tu, handlers zilizopo
     * ================================================================ */
    // [CARD 2026-09] Idadi ya stock kutoka sehemu zinazotumika katalogini.
    function psStockOf(p) {
        var fields = ['stockQuantity', 'stock', 'quantity', 'qtyAvailable', 'inventory'];
        for (var i = 0; i < fields.length; i++) {
            var v = p[fields[i]];
            if (v != null && v !== '') {
                var n = psNum(v);
                if (n !== null) return n;
            }
        }
        return null; // haijulikani → usizuie oda
    }

    // Andaa mstari wa qty: min/max (stock), kaunta na taarifa ya stock.
    function setupQty(p) {
        var qtyArea = $('pmQtyArea');
        var qtyEl = $('pmQty');
        var stockEl = $('pmStockInfo');
        if (!qtyArea || !qtyEl) return;
        var stock = psStockOf(p);
        var minRaw = psNum(p.minOrderQuantity || p.minOrder || p.minQuantity);
        var minQty = (minRaw !== null && minRaw > 0) ? minRaw : 1;
        var maxQty = (stock !== null) ? Math.max(0, stock) : null;
        qtyEl.dataset.min = String(minQty);
        qtyEl.dataset.max = maxQty === null ? '' : String(maxQty);
        qtyEl.value = String(Math.min(minQty, maxQty === null ? minQty : Math.max(0, maxQty)));
        if (stockEl) {
            stockEl.classList.remove('is-low', 'is-out');
            if (stock === null) {
                stockEl.textContent = '';
            } else if (stock <= 0) {
                stockEl.textContent = 'Zimeisha';
                stockEl.classList.add('is-out');
            } else if (stock <= PS_LOW_STOCK) {
                stockEl.textContent = 'Zimebaki ' + stock;
                stockEl.classList.add('is-low');
            } else {
                stockEl.textContent = 'Zipo ' + stock;
            }
        }
        // Sawazisha vitufe vya +/- na jumla kupitia changeQty iliyopo.
        if (typeof window.changeQty === 'function') window.changeQty(0);
        else refreshTotals(p);
        // Kama mteja ameandika idadi kwa mkono, ikate kwenye min/stock.
        qtyEl.onchange = function () {
            var v = parseInt(qtyEl.value, 10);
            if (isNaN(v)) v = minQty;
            if (v < minQty) v = minQty;
            if (maxQty !== null && v > maxQty) v = maxQty;
            qtyEl.value = String(v);
            if (typeof window.changeQty === 'function') window.changeQty(0);
            else refreshTotals(p);
        };
    }

    function renderBar(p, col) {
        var actionArea = $('pmActionArea');
        var qtyArea = $('pmQtyArea');
        var av = psAvailability(p, col);

        var chatBtn = '<button type="button" class="pm-bar-btn pm-bar-chat" onclick="startChat()" aria-label="Muumbe muuzaji kwa chat" title="Mwasiliane kwa Chat"><span class="pm-bar-ic" aria-hidden="true">' + pico('chat', 16) + '</span><span class="pm-bar-lbl">Chat</span></button>';

        if (col === PS_PRODUCT && p.saleMode === 'auction') {
            qtyArea.style.display = 'none';
            if (psCanBid(p, col)) {
                actionArea.innerHTML = chatBtn
                    + '<button type="button" class="pm-bar-btn pm-bar-bid" onclick="window.skhPsScrollToBid()"><span class="pm-bar-ic">' + pico('hammer', 16) + '</span><span class="pm-bar-lbl">Weka Dau</span></button>';
            } else {
                actionArea.innerHTML = chatBtn
                    + '<button type="button" class="pm-bar-btn pm-bar-btn-dis" disabled aria-disabled="true">Mnada umefungwa</button>';
            }
            return;
        }

        if (col === PS_SERVICE) {
            qtyArea.style.display = 'none';
            // [COMMERCE CORE 2026-09] Huduma hupitia INJINI YA MAJADILIANO
            // (scope/deadline/bei → makubaliano → service order → SokoPay),
            // si mfumo wa zamani wa 'requests' (openActionModal).
            actionArea.innerHTML = chatBtn
                + '<button type="button" class="pm-bar-btn pm-bar-primary" onclick="window.skhPsOfferService()"><span class="pm-bar-ic">' + pico('wrench', 16) + '</span><span class="pm-bar-lbl">Kadirio / Agiza Huduma</span></button>';
            return;
        }

        if (col === PS_DRIVER) {
            qtyArea.style.display = 'none';
            // [COMMERCE CORE 2026-09] Usafiri hupitia majadiliano ya nauli/njia
            // (of a→counter→makubaliano→booking→SokoPay), si direct-hire wa zamani.
            actionArea.innerHTML = chatBtn
                + '<button type="button" class="pm-bar-btn pm-bar-buy" onclick="window.skhPsOfferTransport()"><span class="pm-bar-ic">' + pico('truck', 16) + '</span><span class="pm-bar-lbl">Panga Usafiri</span></button>';
            return;
        }

        // PRODUCTS (kawaida)
        if (av.kind === 'out' || av.kind === 'offline') {
            qtyArea.style.display = 'none';
            var label = av.kind === 'offline' ? 'Dukani pekee' : 'Zimeisha';
            actionArea.innerHTML = chatBtn
                + '<button type="button" class="pm-bar-btn pm-bar-btn-dis" disabled aria-disabled="true">' + label + '</button>';
            return;
        }

        qtyArea.style.display = 'flex';
        setupQty(p);
        actionArea.innerHTML = chatBtn
            + '<button type="button" class="pm-bar-btn pm-bar-cart" onclick="addToCart(false)" aria-label="Weka Kikapuni" title="Weka Kikapuni"><span class="pm-bar-ic">' + pico('cart', 16) + '</span><span class="pm-bar-lbl">Weka Kikapuni</span></button>'
            + '<button type="button" class="pm-bar-btn pm-bar-buy" onclick="addToCart(true)"><span class="pm-bar-ic">' + pico('bolt', 16) + '</span><span class="pm-bar-lbl">Lipa Sasa</span>'
            + '<span class="pm-bar-total" id="pmTotalPriceCalc">' + psMoney(psNum(p.price) || 0) + '</span></button>';
        refreshTotals(p);
    }

    /* ================================================================
     * HUDUMA / USAFIRI — fungua fomu ya MAJADILIANO (injini moja ya nego)
     * badala ya mifumo ya zamani (requests / direct-hire).
     * ================================================================ */
    window.skhPsOfferService = function () {
        if (!skh.requireAuth()) return;
        var p = skh.currentOpenProduct;
        if (!p || !p.id) { alert(T('ch_no_service', 'Hakuna huduma imefunguliwa.')); return; }
        if (typeof window.skhNegoFormOpen === 'function') {
            window.skhNegoFormOpen({ type: 'service', entity: p });
        } else if (typeof window.skhChatOpenServiceOffer === 'function') {
            window.skhChatOpenServiceOffer(p);
        } else if (typeof openActionModal === 'function') {
            openActionModal('service'); // fallback la zamani kama nego haijapakiwa
        }
    };
    window.skhPsOfferTransport = function () {
        if (!skh.requireAuth()) return;
        var p = skh.currentOpenProduct;
        if (!p || !p.id) { alert(T('ch_no_transport', 'Hakuna safari/usafiri imefunguliwa.')); return; }
        if (typeof window.skhNegoFormOpen === 'function') {
            window.skhNegoFormOpen({ type: 'transport', entity: p });
        } else if (typeof window.skhChatOpenTransportOffer === 'function') {
            window.skhChatOpenTransportOffer(p);
        } else if (typeof window.openDirectHire === 'function') {
            window.openDirectHire(p.userId || '', p.driverName || p.ownerName || '', p.vehicleType || '');
        }
    };

    /* ================================================================
     * MASWALI — kitufe cha hero kufungua/sehemu ya comments
     * ================================================================ */
    window.skhHeroComments = function () {
        // [CARD 2026-09] Maoni hufunguka kama SHEET juu ya tangazo.
        if (typeof window.skhOpenMaoni === 'function') { window.skhOpenMaoni(); return; }
        // Njia ya zamani ikiwa moduli ya Maoni haijapakizwa.
        if (typeof window.skhCommentsToggle === 'function') window.skhCommentsToggle(true);
    };

    /* ================================================================
     * BIDHAA ZINAZOHUSIANA — rails safi, maduka mbalimbali
     * (overload ya skh.loadRelatedProducts; signature ya zamani imehifadhiwa)
     * ================================================================ */
    function cardHtml(d, col) {
        var raw = d.image || d.photo || (d.imagesArray && d.imagesArray[0]) || window.SKH_PLACEHOLDER_IMG || '';
        var img = skh.getOptimizedImageUrl ? skh.getOptimizedImageUrl(raw) : raw;
        var title = psTitle(d, col);
        var price = col === PS_PRODUCT ? psMoney(d.price) : (psNum(d.price) ? 'Kuanzia ' + psMoney(d.price) : 'Maelewano');
        var loc = d.location || d.region || (col === PS_DRIVER ? ((d.pickupRegion || '') + (d.destinationRegion ? ' → ' + d.destinationRegion : '')) : '');
        var id = jsEsc(d.id), cc = jsEsc(d.collectionName || col);
        return '<button type="button" class="pm-rel-card" onclick="openProduct(\'' + id + '\',\'' + cc + '\')" aria-label="' + esc(title) + '">'
            + '<span class="pm-rel-img"><img src="' + esc(img) + '" loading="lazy" alt="" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||\'\';this.parentNode.classList.add(\'pm-rel-img--ph\')"></span>'
            + '<span class="pm-rel-body"><span class="pm-rel-title">' + esc(title) + '</span>'
            + '<span class="pm-rel-price">' + esc(price) + '</span>'
            + (loc ? '<span class="pm-rel-loc">' + (window.skhNavIcon ? window.skhNavIcon('map', 11) : '') + ' ' + esc(loc) + '</span>' : '')
            + '</span></button>';
    }

    async function gatherRelated(p, col, category) {
        var merged = new Map();
        function absorb(it) {
            if (!it || !it.id) return;
            var rc = it.collectionName || col;
            if (rc !== col) return;
            if (String(it.id) === String(p.id)) return;
            if (!merged.has(it.id)) merged.set(it.id, Object.assign({ collectionName: rc }, it));
        }
        (skh.cachedItems || []).forEach(absorb);

        try {
            var snap = null;
            var base = skh.collection(skh.db, col);
            var queries = [];
            if (col === PS_DRIVER || !category) {
                queries.push(skh.query(base, skh.orderBy('createdAt', 'desc'), skh.limit(PS_FETCH_CAP)));
            } else {
                queries.push(skh.query(base, skh.where('category', '==', category), skh.orderBy('createdAt', 'desc'), skh.limit(PS_FETCH_CAP)));
                queries.push(skh.query(base, skh.where('category', '==', category), skh.limit(PS_FETCH_CAP)));
                queries.push(skh.query(base, skh.limit(PS_FETCH_CAP))); // wauzaji wengine/aina nyingine
            }
            for (var qi = 0; qi < queries.length && merged.size < PS_FETCH_CAP; qi++) {
                try {
                    var s = await skh.getDocs(queries[qi]);
                    if (s && s.forEach) s.forEach(function (doc) {
                        absorb(Object.assign({ id: doc.id }, doc.data()));
                    });
                } catch (e) { /* jaribu query nyingine isiyo na orderBy */ }
            }
        } catch (e) { /* cache ikishindwa kutosha, tutaonyesha iliyopo */ }

        return psBuildRails(Array.from(merged.values()), p, { collection: col });
    }

    var RAIL_DEFS = [
        ['similar', 'Zinazofanana'],
        ['moreCategory', 'Zaidi za aina hii'],
        ['otherSellers', 'Kutoka maduka mengine'],
        ['recommended', 'Pia unaweza kupenda']
    ];

    function renderRails(wrap, rails, col, key) {
        if (!rails) { wrap.hidden = true; return; }
        var any = RAIL_DEFS.some(function (r) { return rails[r[0]] && rails[r[0]].length; });
        if (!any) { wrap.hidden = true; return; }
        wrap.hidden = false;
        var html = '<h2 class="pm-sec-title pm-related-title">Watu pia wanaangalia</h2>';
        RAIL_DEFS.forEach(function (def, i) {
            var items = rails[def[0]];
            if (!items || !items.length) return;
            html += '<div class="pm-rail" data-rail="' + def[0] + '">'
                + '<div class="pm-rail-head"><h3>' + esc(def[1]) + ' <small>(' + items.length + ')</small></h3>'
                + (items.length > 5 ? '<button type="button" class="pm-rail-grid-btn" onclick="window.skhRelatedToggle(this)">Tazama zote</button>' : '')
                + '</div><div class="pm-rail-track">' + items.map(function (d) { return cardHtml(d, col); }).join('') + '</div></div>';
        });
        wrap.innerHTML = html;
        wrap.dataset.key = key;
    }

    window.skhRelatedToggle = function (btn) {
        var rail = btn && btn.closest ? btn.closest('.pm-rail') : null;
        if (!rail) return;
        var grid = rail.classList.toggle('pm-rail--grid');
        btn.textContent = grid ? 'Funga' : 'Tazama zote';
    };

    skh.loadRelatedProducts = async function loadRelatedProducts(category, excludeId, colToUse) {
        var wrap = $('pmRelatedWrap');
        if (!wrap) return;
        var p = skh.currentOpenProduct;
        if (!p) return;
        var col = colToUse || p.collectionName || PS_PRODUCT;
        var key = col + '__' + excludeId;
        if (wrap.dataset.key === key && wrap.dataset.loaded === '1') return; // usijenge upya kwenye snapshot
        wrap.hidden = false;
        wrap.dataset.key = key;
        wrap.innerHTML = '<div class="pm-rel-loading" aria-live="polite">Inatafuta bidhaa zinazofanana…</div>';
        try {
            var rails = await gatherRelated(p, col, category || p.category || p.subCategory || '');
            if (wrap.dataset.key !== key) return; // bidhaa nyingine imefunguliwa
            renderRails(wrap, rails, col, key);
            wrap.dataset.loaded = '1';
        } catch (e) {
            wrap.hidden = true;
        }
    };

    /* ================================================================
     * RENDERER KUU — huitwa na openProduct (07-product.js)
     * ================================================================ */
    var lastShowcaseKey = null;

    // [FIX] Icons za engagement (♡/🔖/🔔/＋) zilikuwa hazijawahi kujazwa
    // (skhInitEngagementIcons haikuitwa popote). Jaza sasa na kila render.
    function ensureEngagementIcons() {
        if (typeof window.skhInitEngagementIcons === 'function') {
            try { window.skhInitEngagementIcons(); } catch (e) {}
        }
        // Kipochi: kama maktaba bado haijapakia, andika heart/bookmark msingi
        var I = window.SKH_ICONS || {};
        var map = { engIcoLike: I.like, engIcoSave: I.save, engIcoWatch: I.watch, engIcoFollow: I.follow };
        Object.keys(map).forEach(function (id) {
            var el = document.getElementById(id);
            if (el && !el.innerHTML && map[id]) el.innerHTML = map[id];
        });
    }

    // Sawazisha aria-pressed na hali halisi ya engagement (28 huweka class)
    function syncEngagementAria() {
        var st = window.skhEngagementState || {};
        var p = skh.currentOpenProduct;
        if (!p) return;
        var key = (p.collectionName || 'products') + '__' + p.id;
        var set = function (id, on) {
            var el = document.getElementById(id);
            if (el) el.setAttribute('aria-pressed', on ? 'true' : 'false');
        };
        set('btnLike', !!(st.liked && st.liked[key]));
        set('btnSave', !!(st.saved && st.saved[key]));
        set('btnWatch', !!(st.watched && st.watched[key]));
        set('btnFollow', !!(st.following && st.following[p.userId]));
    }
    if (typeof window.skhRefreshEngagementButtons === 'function') {
        var _origRefresh = window.skhRefreshEngagementButtons;
        window.skhRefreshEngagementButtons = function () {
            var r = _origRefresh.apply(this, arguments);
            try { syncEngagementAria(); } catch (e) {}
            return r;
        };
    }

    window.skhRenderShowcase = function (found, col) {
        if (!found) return;
        col = col || found.collectionName || PS_PRODUCT;
        ensureEngagementIcons();
        var key = col + '__' + found.id;
        if (key !== lastShowcaseKey) {
            // Bidhaa mpya: rudi juu, qty ya 1, futa expand ya tathmini/related
            var sc = document.querySelector('#productModal .pm-scroll');
            if (sc) sc.scrollTop = 0;
            var qty = $('pmQty');
            if (qty) qty.value = 1;
            var wrap = $('pmRelatedWrap');
            if (wrap) { delete wrap.dataset.key; wrap.dataset.loaded = ''; wrap.hidden = true; wrap.innerHTML = ''; }
            lastShowcaseKey = key;
        }
        try {
            renderIdentity(found, col);
            renderVariants(found, col);
            renderSpecial(found, col);
            renderDetails(found, col);
            renderDelivery(found, col);
            renderReviews(found, col);
            renderSeller(found, col);
            renderBar(found, col);
        } catch (e) {
            console.warn('[showcase] render error:', e && e.message);
        }
    };

    // Jaza icons mara moja wakati wa kupakia (modali na My SokoHai tabs)
    ensureEngagementIcons();
})();

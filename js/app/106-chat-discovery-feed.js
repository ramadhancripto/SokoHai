/* ==== js/app/106-chat-discovery-feed.js ==== */
/* ============================================================
   [STAGE B 2026-11-04 · REFINEMENT] GUNDUA BIASHARA
   Sponsored Business Advertising & Discovery Feed — Chat inbox
   ------------------------------------------------------------
   Kadi za matangazo zenye media kwanza (4:5), ziko kati ya
   Chat/Search bar (+ vichujio) na #inboxList.

   KANUNI ZILIZOFUATWA (hakuna kubuniwa):
   1. Data: `products` / `services` / `drivers` — koleksheni zilizopo.
      Query ni ILE ILE ya home feed (00-bootstrap.js:1921-1923).
      `skh.cachedItems` ikiwa tayari ina data → hakuna read ya ziada.
   2. Mahesabu ya modes: `window.skhModesCompute()` (07-product.js:495).
   3. SPONSORED: `window.skh.boostEligibility(raw)` (39-market-ranking.js:43)
      — inarudisha eligible:true TU ikiwa `isBoosted===true`, muda haujaisha
      na target ya views haijafikiwa. Bidhaa ya kawaida HAITWI sponsored.
   4. Action: handlers zilizopo —
        group_buy  → skhGroupBuyJoin(productId)      (07-product.js:385)
        auction    → openProduct + skhPsScrollToBid()  (bidding panel halisi)
        price_drop → openProduct                       (07-product.js:97)
        product    → openProduct
        service    → openProduct(id,'services')
        transport  → openProduct(id,'drivers')
      Hakuna Group Order: `skhGroupOrdersEnabled()` ni flag (69-chat-groups.js:544)
      na hakuna backend ya umma → HAIONYESHWI kabisa kwenye feed.
   5. Video: hakuna `videoUrl` kwenye schema ya bidhaa/huduma/usafiri.
      Kwa hiyo play icon + vidhibiti vinaonekana TU pale video halisi ipo.
      Vinginevyo: picha halisi + ufafanuzi. Hakuna autoplay.
   6. Follow: `skhToggleFollowSeller` (28-buyer-engagement.js:269) +
      `skhLoadEngagementState` ku-hydrate hali halisi. Mfumo mmoja tu.
   ============================================================ */

(function () {
    'use strict';

    var LS_HIDDEN = 'skh_df_hidden';
    var MAX_PRODUCTS = 100, MAX_SERVICES = 30, MAX_DRIVERS = 30;
    var NEW_DAYS = 7;

    /* Aina za content zenye destination halisi. Group Order haipo kwa makusudi. */
    var KINDS = {
        product:     { label: 'Bidhaa',            badge: 'BIDHAA',            tone: 'blue',  cta: 'Tazama Bidhaa' },
        group_buy:   { label: 'Nunua Pamoja',      badge: 'NUNUA PAMOJA',      tone: 'green', cta: 'Jiunge Sasa' },
        auction:     { label: 'Mnada',             badge: 'MNADA',             tone: 'gold',  cta: 'Toa Zabuni' },
        price_drop:  { label: 'Bei Imeshuka',      badge: 'BEI IMESHUKA',      tone: 'gold',  cta: 'Tazama Ofa' },
        service:     { label: 'Huduma',            badge: 'HUDUMA',            tone: 'blue',  cta: 'Tazama Huduma' },
        transport:   { label: 'Usafirishaji',      badge: 'USAFIRISHAJI',      tone: 'blue',  cta: 'Omba Usafiri' }
    };
    var KIND_ORDER = ['group_buy', 'auction', 'price_drop', 'product', 'service', 'transport'];

    var state = {
        items: [],
        status: 'idle',        // idle | loading | ready | error
        lastFetch: 0,
        viewerItem: null,
        confirmUntil: 0,
        following: {}          // sellerId -> bool (kutoka skhEngagementState)
    };

    /* ---------------------------------------------------------- 1. HELPERS */
    function skh() { return window.skh || null; }

    function esc(s) {
        s = (s == null) ? '' : String(s);
        if (window.skh && typeof window.skh.skhEscape === 'function') return window.skh.skhEscape(s);
        return s.replace(/[&<>'"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
        });
    }
    function $id(id) { return document.getElementById(id); }
    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

    function tzs(v) {
        var n = Math.round(num(v));
        if (!n) return '';
        try { return 'TZS ' + n.toLocaleString('en-US'); } catch (e) { return 'TZS ' + n; }
    }
    function compact(n) {
        n = Math.round(num(n));
        if (!n) return '';
        if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
        return String(n);
    }
    function initials(name) {
        var s = String(name || '').trim();
        if (!s) return '?';
        var p = s.split(/\s+/);
        return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }

    /* Muda uliobaki — kutoka modeData.endTime halisi. */
    function timeLeft(endTs) {
        var end = num(endTs);
        if (!end || end < 1000) return '';
        var diff = end - Date.now();
        if (diff <= 0) return 'Muda umeisha';
        var m = Math.floor(diff / 60000);
        if (m < 60) return 'Dakika ' + Math.max(1, m);
        var h = Math.floor(m / 60);
        if (h < 24) return 'Saa ' + h + ' zimebaki';
        return 'Siku ' + Math.floor(h / 24) + ' zimebaki';
    }

    /* Picha halisi — mpangilio ule ule wa 07-product.js:1144. */
    function firstImage(o) {
        if (!o) return '';
        var arr = o.imagesArray;
        if (Array.isArray(arr) && arr.length && typeof arr[0] === 'string' && arr[0]) return arr[0];
        if (Array.isArray(o.images) && o.images.length) {
            var i0 = o.images[0];
            if (typeof i0 === 'string' && i0) return i0;
            if (i0 && typeof i0 === 'object' && typeof i0.url === 'string' && i0.url) return i0.url;
        }
        var single = o.image || o.photo || o.imageUrl || o.thumbnail || o.cover;
        return (typeof single === 'string') ? single : '';
    }

    /* Video HALISI pekee. */
    function realVideo(o) {
        if (!o) return '';
        var v = o.videoUrl || o.video || '';
        return (typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(v)) ? v : '';
    }

    function sellerOf(o) { return o.sellerName || o.ownerName || o.storeName || o.shopName || o.providerName || o.companyName || o.driverName || ''; }
    function sellerIdOf(o) { return o.userId || o.ownerId || o.sellerId || o.sellerUid || o.ownerUid || ''; }
    function sellerPhotoOf(o) { return o.sellerPhoto || o.ownerPhoto || o.shopLogo || o.storeLogo || o.providerPhoto || o.driverPhoto || o.photo || ''; }
    function descOf(o) { return o.description || o.details || o.desc || o.maelezo || o.promoText || o.tagline || ''; }
    function placeholderImg() { return window.SKH_PLACEHOLDER_IMG || ''; }

    function isFresh(o) {
        var t = Date.parse(o && o.createdAt);
        return t > 0 && (Date.now() - t) < (NEW_DAYS * 86400000);
    }

    /* SPONSORED halisi — canonical boost eligibility. */
    function boostInfo(o) {
        var s = skh();
        if (!s || typeof s.boostEligibility !== 'function') return { eligible: false };
        try { return s.boostEligibility(o) || { eligible: false }; } catch (e) { return { eligible: false }; }
    }

    /* ---------------------------------------------------------- 2. DATA */
    function classify(row) {
        var col = row.collectionName || 'products';
        var mode = String(row.saleMode || '').toLowerCase();
        if (col === 'services') return 'service';
        if (col === 'drivers') return 'transport';
        if (mode === 'group_buy') return 'group_buy';
        if (mode === 'auction') return 'auction';
        if (mode === 'price_drop') return 'price_drop';
        return 'product';
    }

    /* Aina inayohitaji backend ambao haupo → haionyeshwi. */
    function isRenderable(o) {
        var st = String(o.status || o.listingStatus || '').toLowerCase();
        if (['deleted', 'archived', 'suspended', 'blocked', 'rejected', 'draft', 'inactive'].indexOf(st) >= 0) return false;
        if (o.adminHidden === true || o.moderationStatus === 'rejected') return false;
        return true;
    }

    function toCard(row, kind) {
        var o = row;
        var c = null;
        try {
            if (typeof window.skhModesCompute === 'function' && kind !== 'service' && kind !== 'transport') {
                c = window.skhModesCompute(o);
            }
        } catch (e) { c = null; }

        var boost = boostInfo(o);
        var card = {
            id: o.id || '',
            collection: o.collectionName || 'products',
            kind: kind,
            title: o.title || o.serviceName || o.name || KINDS[kind].label,
            image: firstImage(o),
            video: realVideo(o),
            seller: sellerOf(o),
            sellerId: sellerIdOf(o),
            sellerPhoto: sellerPhotoOf(o),
            desc: descOf(o),
            sponsored: boost.eligible === true,
            price: 0,
            priceLabel: '',
            oldPrice: 0,
            status: '',        // mstari mfupi wa hali (muda / progress)
            meta: [],
            labels: [],
            raw: o
        };

        if (kind === 'group_buy' && c && c.group) {
            card.price = c.group.price;
            card.priceLabel = tzs(c.group.price) + ' / kipande';
            card.meta.push({ b: c.group.joined + '/' + c.group.target, t: 'wamejiunga' });
            if (c.group.status === 'active') {
                if (timeLeft(c.group.endsAt)) card.status = timeLeft(c.group.endsAt);
            } else {
                card.status = c.group.status === 'successful' ? 'Lengo limefikiwa' : 'Muda umeisha';
            }
        } else if (kind === 'auction' && c && c.auction) {
            card.price = c.auction.currentBid;
            card.priceLabel = 'Zabuni ' + tzs(c.auction.currentBid);
            card.meta.push({ b: String(c.auction.totalBids), t: 'zabuni' });
            if (!c.auction.ended) {
                if (timeLeft(c.auction.endsAt)) card.status = timeLeft(c.auction.endsAt);
            } else {
                card.status = 'Mnada umefungwa';
            }
        } else if (kind === 'price_drop' && c && c.drop) {
            card.price = c.drop.currentPrice;
            card.priceLabel = tzs(c.drop.currentPrice);
            if (c.base && c.base > c.drop.currentPrice) card.oldPrice = c.base;
            if (c.drop.ended) card.status = 'Muda umeisha';
            else if (timeLeft(c.drop.endsAt)) card.status = timeLeft(c.drop.endsAt);
        } else {
            card.price = num(o.price);
            if (card.price) card.priceLabel = tzs(card.price);
            if (kind === 'transport') {
                if (o.from && o.to) card.meta.push({ b: String(o.from) + ' → ' + String(o.to), t: '' });
                else if (o.vehicleType) card.meta.push({ b: String(o.vehicleType), t: '' });
            } else if (kind === 'service') {
                if (o.providerVerified === true) card.meta.push({ b: 'Amethibitishwa', t: '' });
                else if (o.category) card.meta.push({ b: String(o.category), t: '' });
            } else if (o.category) {
                card.meta.push({ b: String(o.category), t: '' });
            }
            var views = num(o.views);
            var likes = num(o.likeCount != null ? o.likeCount : (Array.isArray(o.likes) ? o.likes.length : 0));
            if (views) card.meta.push({ b: compact(views), t: 'wameona' });
            else if (likes) card.meta.push({ b: compact(likes), t: 'wapendaji' });
        }

        // Lebo: zinazotokana NA DATA pekee. Chip ya aina daima ipo;
        // ya pili ni moja tu: SPONSORED > LIVE > MPYA (kuzuia msongamano).
        var badge = KINDS[kind].badge;
        if (kind === 'auction' && c && c.auction && !c.auction.ended) badge = 'MNADA UNAENDELEA';
        card.labels.push({ k: badge, tone: KINDS[kind].tone });

        var second = null;
        if (card.sponsored) second = { k: 'SPONSORED', tone: 'sponsored' };
        else if (kind === 'group_buy' && c && c.group && c.group.status === 'active') second = { k: 'LIVE', tone: 'live' };
        else if (isFresh(o)) second = { k: 'MPYA', tone: 'new' };
        if (second) card.labels.push(second);

        card.promo = descOf(o);          // mstari mmoja wa matangazo (viewer ina maelezo kamili)

        return card;
    }

    function sortCards(list) {
        // Sponsored kwanza (ni matangazo halisi ya kulipiwa), kisha fursa zenye muda.
        var rank = { group_buy: 1, auction: 2, price_drop: 3, product: 4, service: 5, transport: 6 };
        return list.slice().sort(function (a, b) {
            if (a.sponsored !== b.sponsored) return a.sponsored ? -1 : 1;
            var ra = rank[a.kind] != null ? rank[a.kind] : 9, rb = rank[b.kind] != null ? rank[b.kind] : 9;
            if (ra !== rb) return ra - rb;
            var ta = Date.parse(a.raw && a.raw.createdAt) || 0;
            var tb = Date.parse(b.raw && b.raw.createdAt) || 0;
            return tb - ta;
        });
    }

    function buildFrom(rows) {
        var out = [], seen = {};
        (rows || []).forEach(function (row) {
            if (!row || !row.id) return;
            if (!isRenderable(row)) return;
            var key = (row.collectionName || 'products') + '/' + row.id;
            if (seen[key]) return;
            seen[key] = 1;
            var kind = classify(row);
            if (!KINDS[kind]) return;               // aina isiyo na destination halisi
            var card = toCard(row, kind);
            if (!card.title && !card.image) return;
            out.push(card);
        });
        return sortCards(out);
    }

    function fetchFresh() {
        var s = skh();
        if (!s || !s.db) return Promise.reject(new Error('no-db'));
        var failures = 0;
        var safe = function (q) {
            return s.getDocs(q).catch(function () { failures++; return { forEach: function () {} }; });
        };
        return Promise.all([
            safe(s.query(s.collection(s.db, 'products'), s.orderBy('createdAt', 'desc'), s.limit(MAX_PRODUCTS))),
            safe(s.query(s.collection(s.db, 'services'), s.orderBy('createdAt', 'desc'), s.limit(MAX_SERVICES))),
            safe(s.query(s.collection(s.db, 'drivers'), s.orderBy('createdAt', 'desc'), s.limit(MAX_DRIVERS)))
        ]).then(function (res) {
            var cols = ['products', 'services', 'drivers'], rows = [];
            res.forEach(function (snap, i) {
                if (!snap || typeof snap.forEach !== 'function') return;
                snap.forEach(function (doc) {
                    rows.push(Object.assign({ id: doc.id, collectionName: cols[i] }, doc.data() || {}));
                });
            });
            // Zote zimeshindikana = hitilafu ya DB, SIO "hakuna data".
            if (failures >= 3) throw new Error('feed_unavailable');
            return rows;
        });
    }

    function load(force) {
        if (state.status === 'loading') return Promise.resolve();
        if (!force && state.status === 'ready' && (Date.now() - state.lastFetch) < 60000) return Promise.resolve();

        var s = skh();
        if (!force && s && Array.isArray(s.cachedItems) && s.cachedItems.length) {
            state.items = buildFrom(s.cachedItems);
            state.status = 'ready';
            state.lastFetch = Date.now();
            render();
            return Promise.resolve();
        }

        state.status = 'loading';
        render();
        return fetchFresh().then(function (rows) {
            state.items = buildFrom(rows);
            state.status = 'ready';
            state.lastFetch = Date.now();
            render();
        }).catch(function () {
            state.status = 'error';
            render();
        });
    }

    /* ---------------------------------------------------------- 3. RENDER */
    function labelsHTML(card) {
        return card.labels.slice(0, 2).map(function (l) {
            return '<span class="skh-df-tag skh-df-tag--' + esc(l.tone) + '">' + esc(l.k) + '</span>';
        }).join('');
    }

    function identityHTML(card, size) {
        var av = (window.skhUserAvatar ? window.skhUserAvatar(card.sellerPhoto, card.seller, size || 22) : '')
            || '<span class="skh-df-av-ph">' + esc(initials(card.seller)) + '</span>';
        return '<span class="skh-df-id">' + av +
            '<span class="skh-df-id-t">' +
                '<b>' + esc(card.seller || 'SokoHai') + '</b>' +
                '<small>' + esc(roleOf(card)) + '</small>' +
            '</span></span>';
    }

    function roleOf(card) {
        if (card.kind === 'service') return card.raw && card.raw.providerVerified === true ? 'Mtoa huduma aliyethibitishwa' : 'Mtoa huduma';
        if (card.kind === 'transport') return 'Msafirishaji';
        if (card.sponsored) return 'Muuzaji · Ametangaza';
        return 'Muuzaji';
    }

    function cardHTML(card) {
        var k = KINDS[card.kind] || KINDS.product;
        var img = card.image || placeholderImg();
        var imgTag = img
            ? '<img src="' + esc(img) + '" alt="' + esc(card.title) + '" loading="lazy" ' +
              'onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||\'\';">'
            : '<span class="skh-df-noimg">Hakuna picha</span>';
        var play = card.video
            ? '<span class="skh-df-play" aria-hidden="true"><span><svg viewBox="0 0 24 24" width="15" height="15" fill="#14453A"><polygon points="8,5 19,12 8,19"/></svg></span></span>'
            : '';

        var priceHTML = card.priceLabel
            ? '<span class="skh-df-price">' + esc(card.priceLabel) +
              (card.oldPrice ? '<del>' + esc(tzs(card.oldPrice)) + '</del>' : '') + '</span>'
            : '';

        var metaHTML = (card.status || (card.meta && card.meta.length))
            ? '<span class="skh-df-meta">' +
                (card.status ? '<b>' + esc(card.status) + '</b>' : '') +
                (card.status && card.meta.length ? '<span class="skh-df-dot">·</span>' : '') +
                (card.meta.slice(0, 1).map(function (m) {
                    return (m.b ? '<b>' + esc(m.b) + '</b>' : '') + (m.b && m.t ? ' ' : '') + esc(m.t || '');
                }).join('')) +
              '</span>'
            : '';

        return '<button type="button" class="skh-df-card' + (card.sponsored ? ' is-sponsored' : '') + '" ' +
            'data-df-id="' + esc(card.id) + '" data-df-col="' + esc(card.collection) + '" ' +
            'data-df-kind="' + esc(card.kind) + '" aria-label="' + esc(k.label + ': ' + card.title) + '">' +
            '<span class="skh-df-media">' + imgTag +
                '<span class="skh-df-shade" aria-hidden="true"></span>' +
                '<span class="skh-df-tags">' + labelsHTML(card) + '</span>' +
                play +
                '<span class="skh-df-onmedia">' + priceHTML + metaHTML + '</span>' +
            '</span>' +
            '<span class="skh-df-body">' +
                '<span class="skh-df-name">' + esc(card.title) + '</span>' +
                (card.promo ? '<span class="skh-df-promo">' + esc(String(card.promo).slice(0, 88)) + '</span>' : '') +
                identityHTML(card, 20) +
                '<span class="skh-df-cta" aria-hidden="true">' + esc(k.cta) + '</span>' +
            '</span></button>';
    }

    function stateHTML() {
        if (state.status === 'loading') {
            return '<div class="skh-df-skel"></div><div class="skh-df-skel"></div><div class="skh-df-skel"></div>';
        }
        if (state.status === 'error') {
            return '<div class="skh-df-state"><b>Imeshindikana kupakia matangazo</b>' +
                'Mtandao umekataa ombi. Jaribu tena.' +
                '<button type="button" class="skh-df-btn" data-df-retry>Jaribu tena</button></div>';
        }
        return '<div class="skh-df-state"><b>Hakuna tangazo bado</b>' +
            'Bidhaa, huduma na fursa zitaonekana hapa mara tu wauzaji wanapochapisha sokoni.</div>';
    }

    function render() {
        var track = $id('skhDfTrack');
        if (!track) return;
        track.innerHTML = (state.status === 'ready' && state.items.length)
            ? state.items.map(cardHTML).join('')
            : stateHTML();
        if (track.parentNode) track.parentNode.style.display = '';
        updateNav();
    }

    function updateNav() {
        var track = $id('skhDfTrack');
        if (!track) return;
        var prev = document.querySelector('#skhDiscoverFeed .skh-df-nav--prev');
        var next = document.querySelector('#skhDiscoverFeed .skh-df-nav--next');
        if (!prev || !next) return;
        var max = track.scrollWidth - track.clientWidth - 2;
        prev.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= max || max <= 0;
    }

    /* ---------------------------------------------------------- 4. SHELL */
    function ensureShell() {
        if ($id('skhDiscoverFeed')) return true;
        var inbox = $id('inboxList');
        if (!inbox || !inbox.parentNode) return false;
        var sec = document.createElement('section');
        sec.id = 'skhDiscoverFeed';
        sec.className = 'skh-df';
        sec.setAttribute('aria-label', 'Gundua Biashara');
        sec.innerHTML =
            '<div class="skh-df-head"><div class="skh-df-titles">' +
                '<span class="skh-df-title">Gundua Biashara</span>' +
                '<span class="skh-df-sub">Matangazo na biashara zinazoendelea</span>' +
            '</div><div class="skh-df-actions">' +
                '<button type="button" class="skh-df-btn" data-df-all>Tazama zote</button>' +
                '<button type="button" class="skh-df-btn skh-df-btn--ghost" data-df-hide>Ficha</button>' +
            '</div></div>' +
            '<div class="skh-df-rail">' +
                '<button type="button" class="skh-df-nav skh-df-nav--prev" data-df-scroll="-1" aria-label="Rudi nyuma">' +
                    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
                '<div class="skh-df-track" id="skhDfTrack"></div>' +
                '<button type="button" class="skh-df-nav skh-df-nav--next" data-df-scroll="1" aria-label="Endelea mbele">' +
                    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>' +
            '</div>';
        inbox.parentNode.insertBefore(sec, inbox);
        return true;
    }

    /* ---------------------------------------------------------- 5. FICHA */
    function isHidden() { try { return window.localStorage.getItem(LS_HIDDEN) === '1'; } catch (e) { return false; } }
    function setHidden(v) {
        try { if (v) window.localStorage.setItem(LS_HIDDEN, '1'); else window.localStorage.removeItem(LS_HIDDEN); } catch (e) {}
        applyHidden();
    }
    function applyHidden() {
        var feed = $id('skhDiscoverFeed'), pill = $id('skhDfPill'), hidden = isHidden();
        if (feed) feed.style.display = hidden ? 'none' : '';
        if (pill) pill.style.display = hidden ? 'flex' : 'none';
        if (!hidden) load(false);
    }

    /* ---------------------------------------------------------- 6. VIEWER */
    function ensureViewer() {
        if ($id('skhDfViewer')) return;
        var v = document.createElement('div');
        v.id = 'skhDfViewer';
        v.setAttribute('role', 'dialog');
        v.setAttribute('aria-modal', 'true');
        v.setAttribute('aria-label', 'Tangazo');
        v.innerHTML = '<div class="skh-df-sheet" data-df-sheet></div>';
        document.body.appendChild(v);
        v.addEventListener('click', function (e) {
            if (e.target === v) { e.stopPropagation(); closeViewer(); }
        });
        bindLayer(v);
    }

    function paintFollowBtn(btn, following) {
        if (!btn) return;
        btn.classList.toggle('is-following', !!following);
        btn.setAttribute('aria-pressed', following ? 'true' : 'false');
        btn.innerHTML = following
            ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Unafuata</span>'
            : '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Fuata</span>';
    }

    /* Hali ya ufuatiliaji: mfumo MMOJA (sellerFollowers + skhToggleFollowSeller).
       Tunasoma doc ya uhusiano moja kwa moja kwa sababu helper ya ukurasa wa
       bidhaa (skhLoadEngagementState) inaunganisha reads 4 kwa Promise.all —
       read moja inayokataliwa (mf. doc ya productLikes isiyopo) huangusha zote.
       Hii ni read ile ile ya koleksheni ile ile; hakuna mfumo wa pili. */
    function hydrateFollow(card) {
        var s = skh();
        if (!card.sellerId || !s || !s.currentUser || !s.db) return;
        var st = window.skhEngagementState;
        if (st && st.following && typeof st.following[card.sellerId] === 'boolean') {
            state.following[card.sellerId] = st.following[card.sellerId];
            paintFollowBtn(document.querySelector('#skhDfViewer [data-df-follow]'), state.following[card.sellerId]);
            return;
        }
        var relId = String(s.currentUser.uid) + '__' + String(card.sellerId);
        Promise.resolve(s.getDoc(s.doc(s.db, 'sellerFollowers', relId))).then(function (snap) {
            var exists = false;
            try { exists = !!(snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists)); } catch (e) { exists = false; }
            state.following[card.sellerId] = exists;
            try { if (st && st.following) st.following[card.sellerId] = exists; } catch (e) {}
            if (state.viewerItem && state.viewerItem.sellerId === card.sellerId) {
                paintFollowBtn(document.querySelector('#skhDfViewer [data-df-follow]'), exists);
            }
        }).catch(function () { /* read imekataliwa: tunaacha "Fuata" — hakuna kujifanya */ });
    }

    function openViewer(card) {
        var v = $id('skhDfViewer');
        if (!v) return;
        state.viewerItem = card;
        state.confirmUntil = 0;
        var k = KINDS[card.kind] || KINDS.product;
        var me = skh() && skh().currentUser ? skh().currentUser.uid : '';
        var canFollow = !!card.sellerId && card.sellerId !== me && typeof window.skhToggleFollowSeller === 'function';

        var mediaHTML = '';
        if (card.video) {
            mediaHTML =
                '<div class="skh-df-stage">' +
                    '<video data-df-video src="' + esc(card.video) + '" playsinline preload="metadata" ' +
                    (card.image ? 'poster="' + esc(card.image) + '" ' : '') + '></video>' +
                    '<div class="skh-df-ctrls">' +
                        '<button type="button" class="skh-df-ctrl" data-df-playpause aria-label="Cheza au simamisha">' +
                            '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg></button>' +
                        '<button type="button" class="skh-df-ctrl" data-df-mute aria-label="Nyamazisha au fungua sauti">' +
                            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg></button>' +
                    '</div>' +
                '</div>';
        } else {
            var img = card.image || placeholderImg();
            mediaHTML =
                '<div class="skh-df-stage">' +
                    (img ? '<img src="' + esc(img) + '" alt="' + esc(card.title) + '" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||\'\';">'
                         : '<div class="skh-df-noimg skh-df-noimg--big">Hakuna picha</div>') +
                    '<span class="skh-df-shade" aria-hidden="true"></span>' +
                    '<span class="skh-df-tags">' + labelsHTML(card) + '</span>' +
                    '<div class="skh-df-novideo">Hakuna video kwa tangazo hili — unaona picha halisi. ' +
                        'Video fupi itaonekana picha ikiwa video.</div>' +
                '</div>';
        }

        var facts = '';
        if (card.priceLabel) facts += '<span class="skh-df-fact skh-df-fact--gold"><b>' + esc(card.priceLabel) + '</b></span>';
        if (card.oldPrice) facts += '<span class="skh-df-fact">Bei ya awali <b>' + esc(tzs(card.oldPrice)) + '</b></span>';
        if (card.status) facts += '<span class="skh-df-fact">' + esc(card.status) + '</span>';
        (card.meta || []).forEach(function (m) {
            facts += '<span class="skh-df-fact">' + esc(m.t || '') + ' <b>' + esc(m.b || '') + '</b></span>';
        });

        var desc = card.desc ? '<p class="skh-df-vdesc">' + esc(String(card.desc).slice(0, 460)) + '</p>' : '';

        var ctaLabel = k.cta;
        var ctaDisabled = false;
        if (card.kind === 'group_buy' && card.sellerId && card.sellerId === me) {
            ctaLabel = 'Tazama Bidhaa';           // muuzaji hajiungi na ofa yake
        }
        // Hakuna handler = hakuna CTA ya uongo.
        if (card.kind !== 'group_buy' && typeof window.openProduct !== 'function') {
            ctaDisabled = true; ctaLabel = 'Haipatikani kwa sasa';
        }

        var followBtn = canFollow
            ? '<button type="button" class="skh-df-follow" data-df-follow>' +
              '<span>Fuata</span></button>'
            : '';

        v.querySelector('[data-df-sheet]').innerHTML =
            '<div class="skh-df-vhead">' +
                // Lebo za aina ziko kwenye media (zisirudiwe hapa).
                '<span class="skh-df-vtitle">' + esc(k.label) + '</span>' +
                '<button type="button" class="skh-df-vclose" data-df-close aria-label="Funga">' +
                    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>' +
            '</div>' +
            mediaHTML +
            '<div class="skh-df-vbody">' +
                '<div class="skh-df-vid">' + identityHTML(card, 34) + followBtn + '</div>' +
                '<h3 class="skh-df-vname">' + esc(card.title) + '</h3>' +
                (facts ? '<div class="skh-df-vfacts">' + facts + '</div>' : '') +
                desc +
            '</div>' +
            '<div class="skh-df-vfoot">' +
                '<button type="button" class="skh-df-cta-btn' + (ctaDisabled ? '' : '') + '" data-df-action' +
                (ctaDisabled ? ' disabled' : '') + '>' + esc(ctaLabel) + '</button>' +
            '</div>';

        v.classList.add('skh-df-viewer--open');
        var vid = v.querySelector('[data-df-video]');
        if (vid) { try { vid.muted = true; vid.pause(); } catch (e) {} }

        if (canFollow) {
            // Kundinyisha kitufe kirekebishwe kwa hali halisi (bila kuandika).
            if (typeof state.following[card.sellerId] === 'boolean') {
                paintFollowBtn(v.querySelector('[data-df-follow]'), state.following[card.sellerId]);
            } else {
                paintFollowBtn(v.querySelector('[data-df-follow]'), false);
                hydrateFollow(card);
            }
        }

        var closeBtn = v.querySelector('[data-df-close]');
        if (closeBtn) { try { closeBtn.focus(); } catch (e) {} }
    }

    function closeViewer() {
        var v = $id('skhDfViewer');
        if (!v) return;
        var vid = v.querySelector('[data-df-video]');
        if (vid) { try { vid.pause(); } catch (e) {} }
        v.classList.remove('skh-df-viewer--open');
        state.viewerItem = null;
        state.confirmUntil = 0;
    }

    /* ---------------------------------------------------------- 7. ACTIONS */
    function toast(msg, type) {
        if (typeof window.skhToast === 'function') { window.skhToast(msg, type || 'info', 4200); return; }
        try { console.log('[Gundua]', msg); } catch (e) {}
    }

    /* Destination halisi kwa kila aina — hakuna ukurasa mpya. */
    function openExistingDetail(card) {
        closeViewer();
        if (typeof window.openProduct !== 'function') {
            toast('Kipengele hiki hakiwezi kufunguka kwa sasa.', 'error');
            return false;
        }
        window.openProduct(card.id, card.collection);
        // Mnada: nenda sehemu ya zabuni iliyopo ndani ya ukurasa wa bidhaa.
        if (card.kind === 'auction' && typeof window.skhPsScrollToBid === 'function') {
            setTimeout(function () { try { window.skhPsScrollToBid(); } catch (e) {} }, 900);
        }
        return true;
    }

    function actOn(card, ctaEl) {
        if (card.kind === 'group_buy') {
            var s = skh();
            if (card.sellerId && s && s.currentUser && card.sellerId === s.currentUser.uid) return openExistingDetail(card);
            if (typeof window.skhGroupBuyJoin !== 'function') return openExistingDetail(card);

            // Hatua mbili: kwanza thibitisha bei, kisha tekeleza (canonical handler).
            if (!state.confirmUntil || Date.now() > state.confirmUntil) {
                state.confirmUntil = Date.now() + 6000;
                if (ctaEl) ctaEl.textContent = 'Thibitisha kujiunga · ' + String(card.priceLabel).replace(' / kipande', '');
                return;
            }
            if (ctaEl) { ctaEl.disabled = true; ctaEl.textContent = 'Inajiunga…'; }
            Promise.resolve(window.skhGroupBuyJoin(card.id)).then(function (r) {
                if (r && r.ok) {
                    toast(r.already ? 'Tayari uko kwenye kundi hili.' : 'Umejiunga na Nunua Pamoja. Endelea kwenye bidhaa kulipia.',
                        r.already ? 'info' : 'success');
                    closeViewer();
                    load(true);
                } else {
                    var err = (r && r.error) || 'error';
                    toast(err === 'login' ? 'Ingia kwanza ili kujiunga.'
                        : err === 'si_group' ? 'Ofa hii si Nunua Pamoja tena.'
                        : err === 'huduma_haipatikani' ? 'Huduma ya kujiunga haipatikani kwa sasa.'
                        : 'Imeshindikana kujiunga (' + err + ').', 'error');
                    if (ctaEl) { ctaEl.disabled = false; ctaEl.textContent = KINDS.group_buy.cta; }
                    state.confirmUntil = 0;
                }
            });
            return;
        }
        return openExistingDetail(card);
    }

    /* ---------------------------------------------------------- 8. ZOTE */
    function ensureAllSheet() {
        if ($id('skhDfAll')) return;
        var s = document.createElement('div');
        s.id = 'skhDfAll';
        s.setAttribute('role', 'dialog');
        s.setAttribute('aria-modal', 'true');
        s.setAttribute('aria-label', 'Gundua Biashara — zote');
        s.innerHTML =
            '<div class="skh-df-all-head">' +
                '<button type="button" class="skh-df-vclose" data-df-allback aria-label="Rudi">' +
                    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
                '<div class="skh-df-all-title"><b>Gundua Biashara</b><small>Matangazo na biashara zinazoendelea</small></div>' +
            '</div>' +
            '<div class="skh-df-chips" data-df-chips></div>' +
            '<div class="skh-df-grid" data-df-grid></div>';
        document.body.appendChild(s);
        s.addEventListener('click', function (e) { if (e.target === s) { e.stopPropagation(); closeAll(); } });
        bindLayer(s);
    }

    function renderAll(filter) {
        var grid = document.querySelector('#skhDfAll [data-df-grid]');
        var chips = document.querySelector('#skhDfAll [data-df-chips]');
        if (!grid || !chips) return;
        var counts = {};
        state.items.forEach(function (c) { counts[c.kind] = (counts[c.kind] || 0) + 1; });
        var sponsoredN = state.items.filter(function (c) { return c.sponsored; }).length;

        chips.innerHTML = ['all', 'sponsored'].concat(KIND_ORDER).map(function (kind) {
            var on = (filter || 'all') === kind;
            var label = kind === 'all' ? 'Zote' : kind === 'sponsored' ? 'SPONSORED' : KINDS[kind].label;
            var n = kind === 'all' ? state.items.length : kind === 'sponsored' ? sponsoredN : (counts[kind] || 0);
            if (kind !== 'all' && kind !== 'sponsored' && !n) return '';   // aina tupu haionyeshwi
            return '<button type="button" class="skh-df-chip" data-df-filter="' + esc(kind) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
                esc(label) + '<span class="skh-df-chip-n">' + n + '</span></button>';
        }).join('');

        var list = !filter || filter === 'all' ? state.items
            : filter === 'sponsored' ? state.items.filter(function (c) { return c.sponsored; })
            : state.items.filter(function (c) { return c.kind === filter; });

        if (!list.length) {
            grid.innerHTML = '<div class="skh-df-empty"><b>' +
                (filter === 'sponsored' ? 'Hakuna tangazo lililolipiwa kwa sasa' : 'Hakuna kitu hapa bado') + '</b>' +
                (filter === 'sponsored'
                    ? 'SPONSORED inaonyesha bidhaa/huduma zilizoboostiwa kwa malipo tu. Hali halisi ya boost ndiyo inayoamua.'
                    : 'Matangazo mapya yataonekana hapa mara tu wauzaji wanapochapisha bidhaa, huduma au fursa.') +
                '</div>';
            return;
        }
        grid.innerHTML = list.map(cardHTML).join('');
    }

    function openAll() {
        ensureAllSheet();
        var s = $id('skhDfAll');
        if (!s) return;
        s.classList.add('skh-df-all--open');
        renderAll('all');
    }
    function closeAll() { var s = $id('skhDfAll'); if (s) s.classList.remove('skh-df-all--open'); }

    /* ---------------------------------------------------------- 9. EVENTS */
    function cardFrom(el) {
        var id = el.getAttribute('data-df-id'), col = el.getAttribute('data-df-col');
        for (var i = 0; i < state.items.length; i++) {
            if (state.items[i].id === id && state.items[i].collection === col) return state.items[i];
        }
        return null;
    }

    function onClick(e) {
        var t = e.target;

        var cardEl = t.closest ? t.closest('[data-df-id]') : null;
        if (cardEl && !t.closest('[data-df-action]')) {
            var c = cardFrom(cardEl);
            if (c) { e.preventDefault(); openViewer(c); }
            return;
        }
        if (t.closest && t.closest('[data-df-hide]')) { e.preventDefault(); setHidden(true); return; }
        if (t.closest && t.closest('#skhDfPill')) { e.preventDefault(); setHidden(false); return; }
        if (t.closest && t.closest('[data-df-all]')) { e.preventDefault(); openAll(); return; }
        if (t.closest && t.closest('[data-df-allback]')) { e.preventDefault(); closeAll(); return; }

        var chip = t.closest ? t.closest('[data-df-filter]') : null;
        if (chip) { e.preventDefault(); renderAll(chip.getAttribute('data-df-filter')); return; }

        var nav = t.closest ? t.closest('[data-df-scroll]') : null;
        if (nav) {
            e.preventDefault();
            var track = $id('skhDfTrack');
            if (track) {
                var dir = parseInt(nav.getAttribute('data-df-scroll'), 10) || 1;
                track.scrollBy({ left: dir * Math.max(220, track.clientWidth * 0.8), behavior: 'smooth' });
            }
            return;
        }
        if (t.closest && t.closest('[data-df-retry]')) { e.preventDefault(); load(true); return; }
        if (t.closest && t.closest('[data-df-close]')) { e.preventDefault(); closeViewer(); return; }

        /* Follow — mfumo ule ule wa canonical (28-buyer-engagement.js). */
        var fbtn = t.closest ? t.closest('[data-df-follow]') : null;
        if (fbtn) {
            e.preventDefault(); e.stopPropagation();
            var card = state.viewerItem;
            if (card && card.sellerId && typeof window.skhToggleFollowSeller === 'function') {
                var nowFollowing = !state.following[card.sellerId];
                state.following[card.sellerId] = nowFollowing;
                paintFollowBtn(fbtn, nowFollowing);
                // btnEl = null: handler ya canonical inaendesha write + toast,
                // lakini HAIPAKI kitufe chetu (yeye huongeza hesabu ya wafuasi,
                // ambayo haifai kwenye kitufe cha tangazo).
                // Handler ni async: subiri iishe, kisha chora HALI HALISI.
                // Hivyo hakuna "success ya uongo" ikiwa write imeshindikana.
                Promise.resolve(window.skhToggleFollowSeller(card.sellerId, card.seller, null)).then(function () {
                    var st2 = window.skhEngagementState;
                    var real = (st2 && st2.following && typeof st2.following[card.sellerId] === 'boolean')
                        ? st2.following[card.sellerId] : nowFollowing;
                    state.following[card.sellerId] = real;
                    paintFollowBtn(document.querySelector('#skhDfViewer [data-df-follow]'), real);
                    if (real !== nowFollowing) toast('Imeshindikana kubadilisha ufuatiliaji. Jaribu tena.', 'error');
                }).catch(function () {
                    state.following[card.sellerId] = !nowFollowing;
                    paintFollowBtn(document.querySelector('#skhDfViewer [data-df-follow]'), !nowFollowing);
                    toast('Imeshindikana kubadilisha ufuatiliaji.', 'error');
                });
            }
            return;
        }

        var actEl = t.closest ? t.closest('[data-df-action]') : null;
        if (actEl) {
            e.preventDefault();
            if (actEl.disabled) return;
            if (state.viewerItem) actOn(state.viewerItem, actEl);
            return;
        }

        var pp = t.closest ? t.closest('[data-df-playpause]') : null;
        if (pp) {
            e.preventDefault();
            var v1 = document.querySelector('#skhDfViewer [data-df-video]');
            if (v1) {
                if (v1.paused) {
                    v1.play().catch(function () {});
                    pp.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#13352C"><rect x="7" y="5" width="3.6" height="14"/><rect x="13.4" y="5" width="3.6" height="14"/></svg>';
                } else {
                    v1.pause();
                    pp.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#13352C"><polygon points="8,5 19,12 8,19"/></svg>';
                }
            }
            return;
        }
        var mu = t.closest ? t.closest('[data-df-mute]') : null;
        if (mu) {
            e.preventDefault();
            var v2 = document.querySelector('#skhDfViewer [data-df-video]');
            if (v2) {
                v2.muted = !v2.muted;
                mu.innerHTML = v2.muted
                    ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>'
                    : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
            }
        }
    }

    function bindLayer(el) {
        if (!el || el.__skhDfLayerBound) return;
        el.__skhDfLayerBound = true;
        el.addEventListener('click', function (e) { e.stopPropagation(); onClick(e); });
        ['mousedown', 'touchstart', 'pointerdown'].forEach(function (ev) {
            el.addEventListener(ev, function (e) { e.stopPropagation(); }, true);
        });
    }

    function bind() {
        document.addEventListener('click', function (e) { onClick(e); });

        /* Escape: capture-phase — ifunge tabaka LANGU pekee, sio inbox iliyo nyuma. */
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            var v = $id('skhDfViewer');
            if (v && v.classList.contains('skh-df-viewer--open')) {
                e.preventDefault(); e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                closeViewer(); return;
            }
            var a = $id('skhDfAll');
            if (a && a.classList.contains('skh-df-all--open')) {
                e.preventDefault(); e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                closeAll();
            }
        }, true);

        document.addEventListener('scroll', function (e) {
            if (e.target && e.target.id === 'skhDfTrack') updateNav();
        }, true);
    }

    /* ---------------------------------------------------------- 10. WAKE */
    function wake() {
        if (!ensureShell()) return;
        ensureViewer();
        ensureAllSheet();
        applyHidden();
    }

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    ready(function () {
        bind();
        var tries = 0;
        (function wait() {
            if ((window.skh && window.skh.db) || tries++ > 60) { wake(); return; }
            setTimeout(wait, 200);
        })();
        setTimeout(wake, 1200);
    });

    window.skhDfDebug = function () {
        var v = $id('skhDfViewer');
        return {
            status: state.status,
            count: state.items.length,
            byKind: state.items.reduce(function (a, c) { a[c.kind] = (a[c.kind] || 0) + 1; return a; }, {}),
            sponsored: state.items.filter(function (c) { return c.sponsored; }).length,
            hidden: isHidden(),
            viewerOpen: !!(v && v.classList.contains('skh-df-viewer--open'))
        };
    };
    window.skhDfReload = function () { return load(true); };

    console.log('[106-chat-discovery-feed] Gundua Biashara (sponsored refinement) loaded.');
})();

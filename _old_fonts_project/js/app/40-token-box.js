/* ==== js/app/40-token-box.js ====
// ============================================================
// TOKEN BOX (2026-09) — Sanduku la mikode la makabidhiano
// linalojitegemea (halijifichi ndani ya oda/safari).
//
// Tokeni za chain-of-custody (zilizopo — 33-custody.js + server):
//   PK-XXXXXXXX  Pickup    (mzigo muuzaji/chanzo -> mshikaji wa kwanza)
//   TR-XXXXXXXX  Handover  (mshikaji A -> mshikaji B / wakala wa kati)
//   DL-XXXXXXXX  Delivery  (mpokeaji wa mwisho, uthibitisho wa uwasilishaji)
//
// Kila tokeni inahusishwa na safari/mzigo (Order -> Transport ->
// Parcel -> Mshika -> Tukio la makabidhiano), ina hali
// (hai/imetumika/imeisha), tarehe ya kuisha na QR, na inasomwa
// na MHUSIKA tu (delivery_tokens za faragha, rules za Firestore).
//
// Sehemu hii ni MSOMAJI/mratibu tu: haitengenezi tokeni zenyewe
// isipokuwa DL ya mpokeaji (kupitia mamlaka ya server iliyopo),
// na haibadili mazingira ya malipo/oda.
// ============================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    var state = { tab: 'active', items: [], bookings: [], routing: [], loaded: false };

    function T(key, en) {
        var s = null;
        try { if (window.t) s = window.t(key); } catch (e) {}
        return (!s || s === key) ? en : s;
    }
    function esc(s) { return (skh.skhEscape ? skh.skhEscape(s) : String(s == null ? '' : s)); }
    function ico(name, size) { return (window.skhNavIcon ? window.skhNavIcon(name, size || 16) : ''); }
    function uid() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function qr(text) { try { return window.spMakeQRDataUrl ? window.spMakeQRDataUrl(text) : ''; } catch (e) { return ''; } }

    var KIND_META = {
        pickup: {
            label: 'Tokeni ya Kuchukua (Pickup)', short: 'Pickup', cls: 'tb-kind--pickup',
            ic: 'package', hint: 'Mpe mwenye mzigo au thibitisha kwa skana mzigo unapokabidhiwa.'
        },
        handover: {
            label: 'Tokeni ya Mkabidhano (Handover)', short: 'Handover', cls: 'tb-kind--handover',
            ic: 'refresh', hint: 'Huthibitisha kupokezana mzigo kati ya washikaji/wakala wawili.'
        },
        transfer: {
            label: 'Tokeni ya Mwisho/Uwasilishaji (Delivery)', short: 'Delivery', cls: 'tb-kind--delivery',
            ic: 'check', hint: 'Mpe msafirishaji atakapofikisha mzigo kwa mpokeaji wa mwisho.'
        }
    };

    function statusOf(rd, kind) {
        var field = kind === 'pickup' ? 'pickupTokenStatus'
            : kind === 'handover' ? 'handoverTokenStatus' : 'transferTokenStatus';
        var expField = kind === 'pickup' ? 'pickupTokenExpiresAt'
            : kind === 'handover' ? 'handoverTokenExpiresAt' : 'transferTokenExpiresAt';
        var st = String(rd[field] || '');
        if (st === 'used') return 'used';
        if (st === 'expired') return 'expired';
        // DL inapothibitishwa safari inakamilika (server haibandiki 'used' kila mara).
        if (kind === 'transfer' && rd.status === 'completed') return 'used';
        if (st === 'pending') {
            var exp = rd[expField];
            if (exp && !isNaN(Date.parse(exp)) && Date.parse(exp) < Date.now()) return 'expired';
            return 'active';
        }
        return 'active';
    }

    function roleOfMine(rd, me) {
        if (rd.customerId === me) return 'Mteja / Mmiliki wa mzigo';
        if (rd.driverId === me) return 'Msafirishaji mkuu';
        if (rd.currentCustodian === me) return 'Mshikaji wa sasa';
        if (rd.nextTransporterId === me) return 'Msafirishaji wa mkono unaofuata';
        return 'Mhusika';
    }

    function rideLabel(rd) {
        return rd.cargoName || rd.itemTitle || rd.transportTitle || 'Mzigo';
    }
    function rideRoute(rd) {
        var f = rd.fromLocation || (rd.route && rd.route.from) || rd.pickupRegion || '';
        var t = rd.toLocation || (rd.route && rd.route.to) || rd.destinationRegion || '';
        return { from: f, to: t };
    }

    // ---------- Kusanya safari zangu ----------
    async function fetchMyRides() {
        var me = uid();
        if (!me || !skh.db) return [];
        var q1 = skh.query(skh.collection(skh.db, 'ride_requests'), skh.where('customerId', '==', me), skh.limit(100));
        var q2 = skh.query(skh.collection(skh.db, 'ride_requests'), skh.where('driverId', '==', me), skh.limit(100));
        var q3 = skh.query(skh.collection(skh.db, 'ride_requests'), skh.where('nextTransporterId', '==', me), skh.limit(100));
        var results = await Promise.allSettled([skh.getDocs(q1), skh.getDocs(q2), skh.getDocs(q3)]);
        var map = new Map();
        results.forEach(function (r) {
            if (r.status !== 'fulfilled' || !r.value) return;
            try {
                r.value.forEach(function (d) {
                    if (!map.has(d.id)) map.set(d.id, Object.assign({ id: d.id }, d.data()));
                });
            } catch (e) { /* query ya nextTransporter inaweza kukosa index */ }
        });
        return Array.from(map.values());
    }

    // ---------- Kusanya booking za majadiliano (orders kind=booking) ----------
    async function fetchMyBookings() {
        var me = uid();
        if (!me || !skh.db) return [];
        var q1 = skh.query(skh.collection(skh.db, 'orders'), skh.where('buyerId', '==', me),
            skh.where('kind', '==', 'booking'), skh.limit(50));
        var q2 = skh.query(skh.collection(skh.db, 'orders'), skh.where('sellerId', '==', me),
            skh.where('kind', '==', 'booking'), skh.limit(50));
        var results = await Promise.allSettled([skh.getDocs(q1), skh.getDocs(q2)]);
        var map = new Map();
        results.forEach(function (r) {
            if (r.status !== 'fulfilled' || !r.value) return;
            r.value.forEach(function (d) { if (!map.has(d.id)) map.set(d.id, Object.assign({ id: d.id }, d.data())); });
        });
        // Tuonyeshe zile ambazo bado hazijawa safari ya custody (hazina token chain).
        return Array.from(map.values()).filter(function (o) { return !o.deliveryId && !o.rideRequestId; });
    }

    // ---------- Tokeni za safari moja ----------
    async function tokensOfRide(rd) {
        var kinds = ['pickup', 'handover', 'transfer'];
        var out = [];
        for (var i = 0; i < kinds.length; i++) {
            var kind = kinds[i];
            var code = null;
            try { code = await window.skhCustodyReadToken(rd.id, kind); } catch (e) { code = null; }
            if (!code) continue;
            var st = statusOf(rd, kind);
            var expField = kind === 'pickup' ? 'pickupTokenExpiresAt'
                : kind === 'handover' ? 'handoverTokenExpiresAt' : 'transferTokenExpiresAt';
            var issuedField = kind === 'pickup' ? 'pickupTokenCreatedAt'
                : kind === 'handover' ? 'handoverTokenCreatedAt' : 'transferTokenCreatedAt';
            out.push({
                rideId: rd.id, kind: kind, code: code, state: st,
                expiresAt: rd[expField] || '', issuedAt: rd[issuedField] || '',
                rideStatus: rd.status || '', role: roleOfMine(rd, uid()),
                label: rideLabel(rd), route: rideRoute(rd), vehicleType: rd.vehicleType || '',
                canMintDL: false
            });
        }
        return out;
    }

    // ---------- Pakia kila kitu ----------
    async function load() {
        var listEl = document.getElementById('tbList');
        if (listEl) listEl.innerHTML = '<div class="tb-loading"><span class="tb-spinner"></span><span>SokoHai anapakia mikode yako…</span></div>';
        var me = uid();
        if (!me) {
            if (listEl) listEl.innerHTML = emptyHtml('Ingia ili kuona mikode yako ya makabidhiano.');
            return;
        }
        try {
            var rides = await fetchMyRides();
            var perRide = await Promise.all(rides.map(tokensOfRide));
            var items = [];
            perRide.forEach(function (a) { items = items.concat(a); });

            // Alama ya kuweza kutoa DL: mteja, safari njiani, DL bado haijatolewa.
            rides.forEach(function (rd) {
                if (rd.customerId !== me) return;
                if (['picked_up', 'in_transit', 'awaiting_handover', 'delivered'].indexOf(rd.status) === -1) return;
                var hasDL = items.some(function (it) { return it.rideId === rd.id && it.kind === 'transfer'; });
                if (hasDL) return;
                items.push({
                    rideId: rd.id, kind: 'transfer', code: null, state: 'active',
                    rideStatus: rd.status || '', role: 'Mteja / Mmiliki wa mzigo',
                    label: rideLabel(rd), route: rideRoute(rd), vehicleType: rd.vehicleType || '',
                    canMintDL: true
                });
            });

            state.items = items;

            // [REQUEST ROUTING 2026-09] Safari za mteja ambazo bado
            // zinapelekwa kwa mawakala (hazina tokeni yoyote bado).
            var withItems = {};
            items.forEach(function (it) { withItems[it.rideId] = true; });
            state.routing = rides.filter(function (rd) {
                if (withItems[rd.id]) return false;
                if (rd.customerId !== me) return false;
                var seeking = ['searching', 'pending_acceptance'].indexOf(rd.status) !== -1
                    || ['routing', 'no_match'].indexOf(rd.routingStatus) !== -1
                    || ['seeking', 'failed_assignment'].indexOf(rd.assignmentStatus) !== -1;
                // Kadi ya kusubiri ionekane tu ikiwa ombi lilipitia routing engine.
                return seeking && !!(rd.routingStatus || rd.assignmentStatus || rd.offersCount > 0);
            });

            state.bookings = await fetchMyBookings();
            state.loaded = true;
            render();
        } catch (e) {
            if (listEl) listEl.innerHTML = emptyHtml('Imeshindikana kupakia: ' + (e && e.message));
        }
    }

    // ---------- Mpangilio: hai kwanza (zilizotolewa karibuni mwisho wa juu) ----------
    function sortItems(a, b) {
        var rank = { active: 0, used: 1, expired: 2 };
        if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
        return String(b.issuedAt || '').localeCompare(String(a.issuedAt || ''));
    }

    function stateBadge(state) {
        if (state === 'active') return '<span class="tb-badge tb-badge--active"><i></i> Hai</span>';
        if (state === 'used') return '<span class="tb-badge tb-badge--used">' + ico('check', 11) + ' Imewahi kutumika</span>';
        return '<span class="tb-badge tb-badge--expired">' + ico('clock', 11) + ' Imeisha muda</span>';
    }

    function rideStatusLine(it) {
        var s = '';
        try { s = window.skhCustodyStatusLabel ? window.skhCustodyStatusLabel(it.rideStatus) : it.rideStatus; } catch (e) { s = it.rideStatus; }
        if (!s) return '';
        return '<span class="tb-ride-status">' + esc(s) + '</span>';
    }

    function cardHtml(it) {
        var m = KIND_META[it.kind] || KIND_META.pickup;
        var route = it.route || {};
        var routeHtml = (route.from || route.to)
            ? '<div class="tb-route">' + ico('map', 13)
                + '<span>' + esc(route.from || '…') + '</span>'
                + '<span class="tb-route-arrow">' + ico('arrow-right', 13) + '</span>'
                + '<span>' + esc(route.to || '…') + '</span></div>' : '';
        var exp = it.expiresAt ? fmtDate(it.expiresAt) : '';
        var qrImg = qr(it.code || '');

        if (it.canMintDL) {
            return '<div class="tb-card tb-card--mint">'
                + '<div class="tb-card-top"><span class="tb-kind ' + m.cls + '">' + ico(m.ic, 13) + ' ' + esc(m.short) + '</span>'
                + stateBadge('active') + '</div>'
                + '<b class="tb-cargo">' + esc(it.label) + '</b>'
                + routeHtml
                + '<p class="tb-mint-hint">' + ico('shield-check', 13) + ' Safari yako njiani. Tokeni ya MWISO (DL) ya mpokeaji bado haijatolewa.</p>'
                + '<button type="button" class="tb-btn tb-btn-primary" onclick="window.skhTokenBoxMintDL(\'' + esc(it.rideId) + '\', event)">'
                + ico('shield-check', 15) + ' Tengeneza Tokeni ya Mwisho (DL)</button>'
                + '</div>';
        }

        return '<div class="tb-card" data-tb-ride="' + esc(it.rideId) + '" data-tb-kind="' + esc(it.kind) + '">'
            + '<div class="tb-card-top"><span class="tb-kind ' + m.cls + '">' + ico(m.ic, 13) + ' ' + esc(m.short) + '</span>'
            + stateBadge(it.state) + '</div>'
            + '<b class="tb-cargo">' + esc(it.label) + '</b>'
            + routeHtml
            + '<div class="tb-code-row"><span class="tb-code" id="tbCode_' + esc(it.rideId) + '_' + esc(it.kind) + '">' + esc(it.code) + '</span>'
            + '<button type="button" class="tb-icon-btn" title="Nakili" aria-label="Nakili kodi" onclick="window.skhTokenBoxCopy(\'' + esc(it.rideId) + '\',\'' + esc(it.kind) + '\')">' + ico('edit', 14) + '</button></div>'
            + '<div class="tb-meta">'
            + '<span>' + ico('user', 12) + ' ' + esc(it.role) + '</span>'
            +   (exp ? '<span>' + ico('calendar', 12) + ' ' + esc(exp) + '</span>' : '')
            +   rideStatusLine(it)
            + '</div>'
            + '<p class="tb-hint">' + esc(m.hint) + '</p>'
            + (qrImg ? '<button type="button" class="tb-btn tb-btn-light tb-qr-toggle" onclick="window.skhTokenBoxToggleQR(this)">'
                + ico('image', 14) + ' Onyesha QR</button>'
                + '<div class="tb-qr" hidden><img alt="QR ya tokeni" src="' + qrImg + '"><small>Picha ya QR ina tokeni kamili — ionyeshe kwa mhusika tu.</small></div>' : '')
            + '<button type="button" class="tb-btn tb-btn-light" onclick="window.skhTokenBoxTrack(\'' + esc(it.rideId) + '\')">'
            + ico('truck', 14) + ' Tazama ufuatiliaji</button>'
            + '</div>';
    }

    function bookingCardHtml(o) {
        var route = o.route || {};
        var routeHtml = (route.from || route.to)
            ? '<div class="tb-route">' + ico('map', 13)
                + '<span>' + esc(route.from || '…') + '</span><span class="tb-route-arrow">' + ico('arrow-right', 13) + '</span>'
                + '<span>' + esc(route.to || '…') + '</span></div>' : '';
        var paid = (o.paymentStatus === 'held' || o.paymentStatus === 'paid' || o.status === 'held');
        return '<div class="tb-card tb-card--booking">'
            + '<div class="tb-card-top"><span class="tb-kind tb-kind--booking">' + ico('clipboard', 13) + ' Booking</span>'
            + '<span class="tb-badge ' + (paid ? 'tb-badge--used' : 'tb-badge--active') + '">'
            + (paid ? ico('check', 11) + ' Imelipwa (Escrow)' : '<i></i> Inasubiri malipo') + '</span></div>'
            + '<b class="tb-cargo">' + esc(o.itemTitle || o.packageDescription || 'Usafiri') + '</b>'
            + routeHtml
            + '<div class="tb-meta"><span>' + ico('hash', 12) + ' ' + esc(o.orderId || o.id) + '</span>'
            + (o.fare ? '<span>' + ico('wallet', 12) + ' TSh ' + Number(o.fare || o.amount || 0).toLocaleString() + '</span>' : '') + '</div>'
            + '<p class="tb-hint">' + ico('lock', 13) + ' Tokeni za makabidhiano zitatokeza punde tu mtoa usafiri anapokubali baada ya malipo.</p>'
            + '<button type="button" class="tb-btn tb-btn-light" onclick="window.skhTokenBoxOpenChat(\'' + esc(o.sellerId || '') + '\',\'' + esc(o.sellerName || '') + '\')">'
            + ico('chat', 14) + ' Fungua mazungumzo/mkataba</button>'
            + '</div>';
    }

    // [REQUEST ROUTING] Kadi ya ombi linalotafuta msafirishaji (bado tokeni).
    function routingCardHtml(rd) {
        var route = rideRoute(rd);
        var routeHtml = (route.from || route.to)
            ? '<div class="tb-route">' + ico('map', 13)
                + '<span>' + esc(route.from || '…') + '</span>'
                + '<span class="tb-route-arrow">' + ico('arrow-right', 13) + '</span>'
                + '<span>' + esc(route.to || '…') + '</span></div>' : '';
        var failed = rd.assignmentStatus === 'failed_assignment' || rd.routingStatus === 'no_match';
        var meta = ['<span>' + ico('users', 12) + ' Mawakala waliochaguliwa: ' + Number(rd.offersCount || 0) + '</span>'];
        if (rd.fare) meta.push('<span>' + ico('wallet', 12) + ' TSh ' + Number(rd.fare).toLocaleString() + '</span>');
        if (rd.pickupDate) meta.push('<span>' + ico('calendar', 12) + ' ' + esc(rd.pickupDate) + '</span>');
        var badge = failed
            ? '<span class="tb-badge tb-badge--expired"><i></i> Hakuna aliyejibu</span>'
            : '<span class="tb-badge tb-badge--active"><i></i> Linatafuta msafirishaji</span>';
        var hint = failed
            ? ('<p class="tb-hint">' + ico('alert', 13) + ' Mawakala waliopeanwa ombi hawakujibu. Rudia routing ili litembelewe tena, na linaonekana pia Requests Marketplace.</p>')
            : ('<p class="tb-hint">' + ico('refresh', 13) + ' Routing Engine inawapa ofa mawakala/madereva walio karibu na route yako; asiyekubali hupelekewa mwingine kiotomatiki.</p>');
        var retryBtn = failed
            ? '<button type="button" class="tb-btn tb-btn-primary" onclick="window.skhTokenBoxRetryRouting(\'' + esc(rd.id) + '\')">'
                + ico('refresh', 15) + ' Rudia kutafuta msafirishaji</button>' : '';
        var trackBtn = '<button type="button" class="tb-btn tb-btn-light" onclick="window.skhTokenBoxTrack(\'' + esc(rd.id) + '\')">'
            + ico('truck', 14) + ' Tazama ufuatiliaji</button>';
        return '<div class="tb-card tb-card--booking">'
            + '<div class="tb-card-top"><span class="tb-kind tb-kind--booking">' + ico('send', 13) + ' Ombi la Usafiri</span>' + badge + '</div>'
            + '<b class="tb-cargo">' + esc(rideLabel(rd)) + '</b>'
            + routeHtml
            + '<div class="tb-meta">' + meta.join('') + '</div>'
            + hint
            + retryBtn + trackBtn
            + '</div>';
    }

    function emptyHtml(msg) {
        return '<div class="tb-empty"><span class="tb-empty-ic">' + ico('shield-check', 30) + '</span>'
            + '<b>Hamna mikodi bado</b><p>' + esc(msg || 'Tokeni za kuchukua, kupokezana na kuwasilisha zitaonekana hapa punde safari inapoanza.') + '</p></div>';
    }

    function fmtDate(iso) {
        try { var d = new Date(typeof iso === 'string' ? iso.replace(' ', 'T') : iso); if (isNaN(d.getTime())) return ''; return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return ''; }
    }

    function render() {
        var listEl = document.getElementById('tbList');
        if (!listEl) return;
        var tab = state.tab;
        var items = state.items.filter(function (it) { return tab === 'all' || it.state === tab; }).sort(sortItems);
        var html = '';

        if (tab === 'active' && state.routing.length) {
            html += '<h4 class="tb-group-title">' + ico('send', 14) + ' Maombi yanayotafuta msafirishaji (' + state.routing.length + ')</h4>'
                + '<div class="tb-group">' + state.routing.map(routingCardHtml).join('') + '</div>';
        }
        if (tab === 'active' && state.bookings.length) {
            html += '<h4 class="tb-group-title">' + ico('clipboard', 14) + ' Booking zinazosubiri (' + state.bookings.length + ')</h4>'
                + '<div class="tb-group">' + state.bookings.map(bookingCardHtml).join('') + '</div>';
        }
        if (items.length) {
            var titles = { active: 'Tokeni hai', used: 'Tokeni zilizotumika', expired: 'Tokeni zilizoisha muda', all: 'Tokeni zote' };
            html += '<h4 class="tb-group-title">' + ico('shield-check', 14) + ' ' + esc(titles[tab] || '') + ' (' + items.length + ')</h4>'
                + '<div class="tb-group">' + items.map(cardHtml).join('') + '</div>';
        }
        if (!html) {
            html = tab === 'active'
                ? emptyHtml('Hakuna tokeni hai wala booking inayosubiri kwa sasa.')
                : emptyHtml('Hakuna tokeni katika kundi hili.');
        }
        listEl.innerHTML = html;
    }

    // ---------- Vitendo ----------
    window.skhOpenTokenBox = function (tab) {
        if (skh.requireAuth && !skh.requireAuth()) return;
        var modal = document.getElementById('tokenBoxModal');
        if (!modal) return;
        if (typeof window.closeModals === 'function') { try { window.closeModals(); } catch (e) {} }
        modal.style.display = 'flex';
        document.querySelectorAll('[data-tb-tab]').forEach(function (b) {
            var on = b.getAttribute('data-tb-tab') === (tab || 'active');
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        state.tab = tab || 'active';
        load();
    };
    window.skhCloseTokenBox = function () {
        var modal = document.getElementById('tokenBoxModal');
        if (modal) modal.style.display = 'none';
    };

    window.skhTokenBoxToggleQR = function (btn) {
        if (!btn) return;
        var box = btn.nextElementSibling;
        if (!box) return;
        var hide = box.hidden;
        box.hidden = !hide;
        btn.innerHTML = hide ? ico('x', 14) + ' Ficha QR' : ico('image', 14) + ' Onyesha QR';
    };

    window.skhTokenBoxCopy = function (rideId, kind) {
        var el = document.getElementById('tbCode_' + rideId + '_' + kind);
        var code = el ? el.textContent.trim() : '';
        if (!code) return;
        var done = function () { if (window.sokohaiToast) window.sokohaiToast('Kodi imenakiliwa.', 'success', 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done).catch(function () {});
        else { try { var ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) {} }
    };

    window.skhTokenBoxTrack = function (rideId) {
        if (typeof window.openLiveMap === 'function') { window.skhCloseTokenBox(); window.openLiveMap(rideId); return; }
        if (typeof window.switchDashTab === 'function') { window.skhCloseTokenBox(); window.switchDashTab('tracking'); }
    };

    window.skhTokenBoxOpenChat = function (sellerId, sellerName) {
        window.skhCloseTokenBox();
        if (sellerId && typeof window.skhChatOpen === 'function') { window.skhChatOpen(sellerId, sellerName, { type: 'order' }); return; }
        if (sellerId && typeof window.openChatWithUser === 'function') { window.openChatWithUser(sellerId, sellerName); return; }
        if (typeof window.openChatList === 'function') window.openChatList();
    };

    window.skhTokenBoxMintDL = async function (rideId, ev) {
        if (!window.skhCustodyMintTransferToken) return;
        var btn = ev && ev.target && ev.target.closest ? ev.target.closest('button') : null;
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="tb-spinner tb-spinner--btn"></span> Inatengenezwa…'; }
        var res = await window.skhCustodyMintTransferToken(rideId);
        if (res && res.ok) {
            if (window.sokohaiToast) window.sokohaiToast('Tokeni ya mwisho (DL) imetengenezwa. Mpe msafirishaji atakapofikisha mzigo.', 'success', 3600);
            load();
        } else {
            if (btn) { btn.disabled = false; btn.innerHTML = ico('shield-check', 15) + ' Tengeneza Tokeni ya Mwisho (DL)'; }
            if (window.sokohaiToast) window.sokohaiToast('Imeshindikana kutengeneza tokeni: ' + ((res && res.error) || 'jaribu tena'), 'error', 3200);
        }
    };

    window.skhTokenBoxRetryRouting = async function (rideId) {
        if (!window.skhRoutingServerRetry) {
            if (window.sokohaiToast) window.sokohaiToast('Routing haipatikani (server haijapakiwa).', 'error', 3000);
            return;
        }
        try {
            if (window.sokohaiToast) window.sokohaiToast('Routing inawatafuta tena mawakala…', 'success', 2000);
            var res = await window.skhRoutingServerRetry({ rideId: rideId });
            var d = (res && res.data) || {};
            if (d.ok) {
                if (window.sokohaiToast) window.sokohaiToast('Ombi limerudiwa: ofa ' + (d.offers || 0) + ' zimetumwa.', 'success', 3200);
                load();
            } else {
                if (window.sokohaiToast) window.sokohaiToast('Imeshindikana kurudia routing.', 'error', 3000);
            }
        } catch (e) {
            if (window.sokohaiToast) window.sokohaiToast('Imeshindikana: ' + ((e && e.message) || 'jaribu tena'), 'error', 3000);
        }
    };

    // ---------- Washa vifungo ----------
    document.addEventListener('DOMContentLoaded', function () {
        var closeBtn = document.getElementById('tbCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', window.skhCloseTokenBox);
        document.querySelectorAll('[data-tb-tab]').forEach(function (b) {
            b.addEventListener('click', function () {
                state.tab = b.getAttribute('data-tb-tab');
                document.querySelectorAll('[data-tb-tab]').forEach(function (x) {
                    var on = x === b;
                    x.classList.toggle('is-active', on);
                    x.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                if (state.loaded) render(); else load();
            });
        });
        var modal = document.getElementById('tokenBoxModal');
        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) window.skhCloseTokenBox(); });
    });
})();

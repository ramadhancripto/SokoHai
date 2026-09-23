/* ==== js/app/43-delivery-choice.js ====
// ============================================================
// DELIVERY OPTION (2026-09) — usafirishaji ni HIARI na uko PEKE
// ya malipo:
//
//   Bidhaa -> Cart/Checkout -> SokoPay -> CHAGUO LA USAFIRISHAJI
//                                            ├─ Nahitaji  -> matangazo HALISI ya drivers
//                                            │             -> ride_request -> delivery_offers
//                                            │             -> Request Inbox ya mtoa usafiri
//                                            └─ Sitahitaji -> kujichukulia/self collection
//
// Kanuni:
//  - HAKUNA carrier wa kuigwa: sokohaiCarrierFallbacks/lgx vehicle
//    generator zimezimwa; kichaguzi kinaonyesha matangazo halisi ya
//    collection `drivers` kwa kutumia kadi ile ile ya soko
//    (skh.TransportPostCard).
//  - Hakuna usanifu mpya wa malipo/oda: SokoPay na cart vya zamani
//    vinatumika kama vilivyo; ombi la usafiri linaunganishwa na oda
//    kupitia orderId na linaingia kwenye mfumo wa Awamu E
//    (ride_requests/delivery_offers/Request Inbox) au, Cloud
//    Functions zisipokuwepo, linaandikwa moja kwa moja kwenye
//    ride_requests (soko la kazi za madereva) + taarifa.
// ============================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    var LS_KEY = 'sokohai_delivery_choice';
    var SESSION_PAYLOAD = 'sokohai_delivery_session';
    var BUY_NOW_KEY = 'sokohai_buynow';

    function T(key, en) {
        var s = null;
        try { if (window.t) s = window.t(key); } catch (e) {}
        return (!s || s === key) ? en : s;
    }
    function esc(s) { return skh.skhEscape ? skh.skhEscape(s == null ? '' : String(s)) : String(s == null ? '' : s); }
    function jsEsc(s) { return skh.skhJsEsc ? skh.skhJsEsc(s == null ? '' : String(s)) : esc(s); }
    function ico(name, size) { return window.skhNavIcon ? window.skhNavIcon(name, size || 16) : ''; }
    function money(n) {
        n = Number(n);
        if (!isFinite(n) || n <= 0) return 'Maelewano';
        return 'TSh ' + Math.round(n).toLocaleString();
    }
    function nowIso() { return new Date().toISOString(); }
    function uid() { return skh.currentUser && skh.currentUser.uid; }

    /* ------------------ hali ya chaguo (huvuka redirect ya PesaPal) ------------------ */
    function defaultState() {
        return { chosen: false, required: false, post: null, destination: '', notes: '', pickupDate: '', pickupTime: '' };
    }
    function loadState() {
        try {
            var raw = skh.localStorage.getItem(LS_KEY);
            if (raw) return Object.assign(defaultState(), JSON.parse(raw));
        } catch (e) {}
        return defaultState();
    }
    function saveState(s) {
        try { skh.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
    }
    var DC = loadState();
    window.skhDeliveryState = function () { return DC; };
    window.skhDeliveryReset = function () { DC = defaultState(); saveState(DC); return DC; };

    /* ------------------ vyanzo vya data ya cart ------------------ */
    function cartItems() { return typeof skh.smartCartItems === 'function' ? skh.smartCartItems() : (skh.myCart || []); }
    function qtyOf(x) { return typeof skh.smartCartQty === 'function' ? skh.smartCartQty(x) : Math.max(1, parseInt(x.qty) || 1); }
    function priceOf(x) { return typeof skh.smartCartPrice === 'function' ? skh.smartCartPrice(x) : (parseFloat(x.price) || 0); }
    function sellerIdOf(x) { return typeof skh.smartCartSellerId === 'function' ? skh.smartCartSellerId(x) : (x.sellerId || x.userId || 'unknown_seller'); }

    // Sehemu ya kuchukuliwa: eneo la muuzaji/duka.
    function pickupOf(items) {
        var it = items[0] || {};
        return it.sellerLocation || it.location || (it.cartMeta && it.cartMeta.pickupAddress) || it.region || 'Eneo la muuzaji';
    }
    function weightOf(items) {
        if (typeof skh.orchPackageSummary === 'function') {
            try { return Number(skh.orchPackageSummary(items).weightKg) || 0; } catch (e) {}
        }
        return items.reduce(function (s, x) { return s + (Number(x.weightKg || x.weight) || 1) * qtyOf(x); }, 0);
    }

    /* ================================================================
     * 1) ZIMA carriers bandia wa cart/logistics marketplace ya zamani
     * ================================================================ */
    window.sokohaiCarrierFallbacks = [];
    window.loadSokoHaiCarriers = async function () { return []; };
    if (skh) skh.lgxLoadCompanies = async function () { return []; };

    /* ================================================================
     * 2) TANGAZO HALISI ZA USAFIRI — pakua/chuja (collection `drivers`)
     * ================================================================ */
    function norm(s) { return String(s == null ? '' : s).toLowerCase().trim(); }
    function contains(a, b) { a = norm(a); b = norm(b); return !!(a && b && (a.indexOf(b) !== -1 || b.indexOf(a) !== -1)); }

    // [PURE] chagua matangazo yanayofaa ombi (hupimika bila Firebase).
    window.skhDeliveryFilterPosts = function (posts, opt) {
        opt = opt || {};
        var pickup = opt.pickup || '', dest = opt.destination || '', weight = Number(opt.weightKg) || 0;
        var out = (posts || []).filter(function (p) {
            if (!p || !p.id) return false;
            if (p.online === false || p.status === 'offline') return false;
            // Uwezo wa mzigo
            var cap = Number(p.capacityKg || p.capacityWeight || p.capacity || 0);
            if (weight > 0 && cap > 0 && cap < weight) return false;
            // Aina ya huduma: mzigo/biashara; usikubali abiria peke yake.
            var ss = (p.supportedServices || []).map(norm);
            if (ss.length && !(ss.indexOf('cargo') !== -1 || ss.indexOf('product') !== -1
                || ss.indexOf('general') !== -1 || ss.indexOf('emergency') !== -1)) return false;
            // Njia: tangazo lilingane na pickup AU destination linapojazwa.
            var routeOk = true;
            if ((pickup || dest) && typeof window.skhRouteMatchesDriver === 'function') {
                var m = window.skhRouteMatchEnds(p, pickup, dest);
                routeOk = !!(m.origin || m.dest) || (!dest && m.origin);
                // Kama njia ya tangazo haijabainishwa, mwachie (chujio cha
                // uwezo/huduma tumemfanyia) — asizikwe kabisa na data pungufu.
                var hasRoute = !!(p.pickupRegion || p.destinationRegion || p.fromRegion || p.toRegion || p.fullRoute || p.route);
                if (!hasRoute) routeOk = true;
            }
            return routeOk;
        });
        // Panga: njia kamili -> bei -> rating.
        out.sort(function (a, b) {
            var ra = window.skhRouteMatchEnds ? window.skhRouteMatchEnds(a, pickup, dest) : { origin: 0, dest: 0 };
            var rb = window.skhRouteMatchEnds ? window.skhRouteMatchEnds(b, pickup, dest) : { origin: 0, dest: 0 };
            var sa = (ra.origin && ra.dest) ? 2 : (ra.origin || ra.dest ? 1 : 0);
            var sb = (rb.origin && rb.dest) ? 2 : (rb.origin || rb.dest ? 1 : 0);
            if (sb !== sa) return sb - sa;
            var pa = Number(a.price || a.basePrice || a.pricePerKm || 0);
            var pb = Number(b.price || b.basePrice || b.pricePerKm || 0);
            if (pa && pb && pa !== pb) return pa - pb;
            return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
        });
        return out;
    };

    async function loadRealPosts() {
        var all = [];
        var push = function (snap) {
            if (snap && snap.forEach) snap.forEach(function (d) {
                all.push(Object.assign({ id: d.id, collectionName: 'drivers' }, d.data()));
            });
        };
        // Jaribu kwanza chujio la huduma ya mzigo (kama index/rules vinaruhusu).
        try {
            var q1 = skh.query(skh.collection(skh.db, 'drivers'),
                skh.where('supportedServices', 'array-contains', 'Cargo'), skh.limit(150));
            push(await skh.getDocs(q1));
        } catch (e) { /* index kukosa -> chukua zote */ }
        if (!all.length) {
            try {
                var q2 = skh.query(skh.collection(skh.db, 'drivers'), skh.limit(200));
                push(await skh.getDocs(q2));
            } catch (e) { /* hali tupu */ }
        }
        // Ondoa marudio.
        var seen = {};
        all = all.filter(function (p) { if (seen[p.id]) return false; seen[p.id] = 1; return true; });
        return all;
    }

    /* ================================================================
     * 3) MODALI YA KICHAGUZI — matangazo halisi (kadi ile ile ya soko)
     * ================================================================ */
    function ensureModal(id) {
        var m = document.getElementById(id);
        if (m) return m;
        m = document.createElement('div');
        m.id = id;
        m.className = 'overlay-menu';
        m.style.cssText = 'z-index:100012;display:none;background:rgba(15,23,42,.55);';
        document.body.appendChild(m);
        return m;
    }

    function cardOfPost(post) {
        try {
            if (skh.TransportPostCard) return skh.TransportPostCard(post, 'drivers');
        } catch (e) {}
        return '<div class="feed-card-box skh-card"><b>' + esc(post.driverName || post.company || 'Usafiri') + '</b></div>';
    }

    window.skhDeliveryOpenPicker = async function (opts) {
        opts = opts || {};
        if (!skh.requireAuth || !skh.requireAuth()) return;
        var m = ensureModal('skhDpickModal');
        var pickup = opts.pickup || pickupOf(cartItems());
        var weight = opts.weightKg || weightOf(cartItems());
        m.innerHTML = pickerShell(pickup);
        m.style.display = 'flex';
        var listEl = document.getElementById('skhDpickList');
        listEl.innerHTML = '<div class="skh-dpick-loading"><span class="ri-spinner"></span><br>' + T('dp_loading', 'Inatafuta matangazo halisi ya usafiri…') + '</div>';

        var render = function (posts) {
            var filtered = window.skhDeliveryFilterPosts(posts, {
                pickup: pickup, destination: DC.destination, weightKg: weight
            });
            if (!filtered.length) {
                listEl.innerHTML = emptyStateHtml();
                return;
            }
            listEl.innerHTML = '<div class="skh-dpick-grid">' + filtered.map(function (p) {
                return '<div class="skh-dpick-card" data-post="' + esc(p.id) + '">'
                    + cardOfPost(p)
                    + '<div class="skh-dpick-actions">'
                    + '<button type="button" class="skh-dpick-view" data-view="' + esc(p.id) + '">' + ico('search', 13) + ' Tazama tangazo</button>'
                    + '<button type="button" class="skh-dpick-select" data-select="' + esc(p.id) + '">' + ico('check', 13) + ' Chagua usafiri huu</button>'
                    + '</div></div>';
            }).join('') + '</div>';
            // Zua kadi ya soko kufungua ukurasa ndani ya kichaguzi.
            listEl.querySelectorAll('.skh-dpick-card').forEach(function (wrap) {
                var cardEl = wrap.querySelector('.feed-card-box');
                if (cardEl) {
                    cardEl.removeAttribute('onclick');
                    cardEl.removeAttribute('onkeydown');
                    cardEl.setAttribute('tabindex', '-1');
                }
            });
        };
        var posts = await loadRealPosts();
        window.__skhDpostsCache = posts;
        render(posts);

        document.getElementById('skhDpickApplyRoute').onclick = async function () {
            DC.destination = document.getElementById('skhDpickDest').value.trim();
            DC.pickupDate = document.getElementById('skhDpickDate').value || '';
            DC.pickupTime = document.getElementById('skhDpickTime').value || '';
            saveState(DC);
            listEl.innerHTML = '<div class="skh-dpick-loading"><span class="ri-spinner"></span><br>Inachuja upya…</div>';
            render(await loadRealPosts());
        };
        listEl.onclick = function (e) {
            var sel = e.target.closest ? e.target.closest('[data-select]') : null;
            var view = e.target.closest ? e.target.closest('[data-view]') : null;
            if (sel) return window.skhDeliverySelectPost(sel.getAttribute('data-select'), posts);
            if (view) {
                m.style.display = 'none';
                window.openProduct(view.getAttribute('data-view'), 'drivers');
            }
        };
    };

    function pickerShell(pickup) {
        return '<div class="skh-dpick-shell"><div class="skh-dpick-head"><div>'
            + '<h2>Chagua Usafiri — Matangazo Halisi</h2>'
            + '<small>Matangazo yaliyotengenezwa na watoa usafiri halisi. Hatutengenezi carrier wa bandia.</small></div>'
            + '<button type="button" class="skh-dpick-x" aria-label="Funga" onclick="document.getElementById(\'skhDpickModal\').style.display=\'none\'">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" width="18" height="18"><path d="M18 6 6 18M6 6l12 12"/></svg>'
            + '</button></div><div class="skh-dpick-body">'
            + '<div class="skh-dpick-route"><div><label>Unakotoka (pickup)</label>'
            + '<input id="skhDpickPickup" value="' + esc(pickup) + '" readonly></div>'
            + '<div><label>Unakokwenda (destination)</label>'
            + '<input id="skhDpickDest" placeholder="Mfano: Dodoma, Mjini" value="' + esc(DC.destination || '') + '"></div>'
            + '<div style="display:flex;gap:8px;grid-column:1/-1">'
            + '<div style="flex:1"><label>Tarehe</label><input id="skhDpickDate" type="date" value="' + esc(DC.pickupDate || '') + '"></div>'
            + '<div style="flex:1"><label>Muda</label><input id="skhDpickTime" type="time" value="' + esc(DC.pickupTime || '') + '"></div>'
            + '<button id="skhDpickApplyRoute" type="button">' + ico('search', 14) + ' Chuja</button>'
            + '</div></div>'
            + '<div id="skhDpickList"></div>'
            + '</div></div>';
    }

    function emptyStateHtml() {
        return '<div class="skh-dpick-empty"><div class="skh-dpick-empty-ic">' + ico('truck', 26) + '</div>'
            + '<b>Hakuna usafiri unaopatikana kwa sasa</b>'
            + '<p>Hatutengenezi magari ya kuigwa. Jaribu kubadili njia au muda, au omba SokoHai ikutafutie mtoa usafiri kwenye soko la kazi.</p>'
            + '<div class="skh-dpick-empty-actions">'
            + '<button type="button" class="light" onclick="window.skhDeliveryOpenPicker()">' + ico('refresh', 13) + ' Rudia</button>'
            + '<button type="button" class="blue" onclick="window.skhDeliveryRequestAny()">' + ico('bell', 13) + ' Omba usaidizi wa SokoHai</button>'
            + '<button type="button" class="primary" onclick="document.getElementById(\'skhDpickModal\').style.display=\'none\'">' + ico('x', 13) + ' Endelea bila kuchagua</button>'
            + '</div></div>';
    }

    // Mteja hajachagua tangazo: weka ombi sokoni (routing ya wazi/agents).
    window.skhDeliveryRequestAny = function () {
        DC.required = true; DC.chosen = true; DC.post = null;
        saveState(DC);
        var m = document.getElementById('skhDpickModal');
        if (m) m.style.display = 'none';
        if (typeof window.renderSmartCart === 'function') window.renderSmartCart();
    };

    window.skhDeliverySelectPost = function (postId, postsCache) {
        var found = null;
        var search = postsCache || window.__skhDpostsCache || [];
        found = search.filter(function (p) { return String(p.id) === String(postId); })[0];
        if (!found) {
            // Pata tena kwenye kadi iliyochorwa (data iko ndani ya soko cache).
            var cached = (skh.cachedItems || []).filter(function (x) {
                return String(x.id) === String(postId) && x.collectionName === 'drivers';
            })[0];
            found = cached;
        }
        if (!found) {
            // Mwisho: soma document moja kwa moja.
            return skh.getDoc(skh.doc(skh.db, 'drivers', String(postId))).then(function (snap) {
                if (!snap.exists) { alert('Tangazo la usafiri halipatikani.'); return; }
                applyPost(Object.assign({ id: postId, collectionName: 'drivers' }, snap.data()));
            });
        }
        applyPost(found);
    };
    function applyPost(post) {
        DC.required = true; DC.chosen = true;
        DC.post = {
            id: post.id, userId: post.userId || post.sellerId || null,
            driverName: post.driverName || post.company || post.ownerName || 'Mtoa usafiri',
            company: post.company || '', vehicleType: post.vehicleType || '',
            pickupRegion: post.pickupRegion || post.fromRegion || '',
            destinationRegion: post.destinationRegion || post.toRegion || '',
            price: Number(post.price || post.basePrice || post.pricePerKm || 0),
            rating: post.rating || null,
            image: post.image || (Array.isArray(post.photos) ? post.photos[0] : '') || (Array.isArray(post.images) ? post.images[0] : '') || '',
            supportedServices: post.supportedServices || [],
            capacityKg: Number(post.capacityKg || post.capacity || 0)
        };
        saveState(DC);
        var m = document.getElementById('skhDpickModal');
        if (m) m.style.display = 'none';
        if (typeof window.renderSmartCart === 'function') window.renderSmartCart();
    }
    window.skhDeliveryClearPost = function () { DC.post = null; saveState(DC); if (typeof window.renderSmartCart === 'function') window.renderSmartCart(); };

    function setRequired(v) {
        DC.required = !!v; DC.chosen = true;
        if (!v) DC.post = null;
        saveState(DC);
        if (typeof window.renderSmartCart === 'function') window.renderSmartCart();
        if (v && !DC.post) {
            // Fungua kichaguzi cha matangazo halisi baada ya kuonyesha redraw.
            setTimeout(function () { window.skhDeliveryOpenPicker(); }, 60);
        }
    }
    window.skhDeliverySetRequired = setRequired;

    /* ================================================================
     * 4) SEHEMU YA CHAGUO NDANI YA CART (inabana kwenye render zilizopo)
     * ================================================================ */
    window.skhDeliverySectionHtml = function () {
        var noOn = DC.chosen && !DC.required ? 'is-on green' : '';
        var yesOn = DC.chosen && DC.required ? 'is-on' : '';
        var post = DC.post;
        var pickup = pickupOf(cartItems());
        var body = '';
        if (DC.required) {
            var sel = post ? '<div class="skh-dpick-selected">'
                + (post.image ? '<img src="' + esc(post.image) + '" alt="">' : '<span class="skh-dpick-empty-ic" style="width:54px;height:54px;border-radius:11px;background:#e2e8f0;display:inline-flex;align-items:center;justify-content:center">' + ico('truck', 22) + '</span>')
                + '<div class="skh-dpick-sel-info"><b>' + esc(post.driverName + (post.company && post.company !== post.driverName ? ' — ' + post.company : '')) + '</b>'
                + '<small>' + ico('truck', 11) + ' ' + esc(post.vehicleType || 'Chombo') + ' &nbsp;'
                + ico('map', 11) + ' ' + esc(post.pickupRegion || pickup) + (post.destinationRegion ? ' -> ' + esc(post.destinationRegion) : '') + '</small>'
                + '<small>' + ico('star', 11) + ' ' + esc(post.rating || '—') + ' &nbsp;·&nbsp; ' + T('dp_fare_hint', 'Nauli huamuliwa na mtoa usafiri') + ': <b>' + money(post.price) + '</b></small></div>'
                + '<div class="skh-dpick-sel-actions"><button type="button" class="skh-dpick-mini" onclick="window.skhDeliveryOpenPicker()">Badili</button>'
                + '<button type="button" class="skh-dpick-mini alt" onclick="window.skhDeliveryClearPost()">Ondoa</button></div></div>' : '';
            body = '<div class="skh-dchoice-body">'
                + '<div class="skh-dchoice-field"><label>' + T('dp_dest', 'Anwani ya kufikishiwa (destination)') + '</label>'
                + '<textarea id="skhDcDest" rows="2" placeholder="Mtaa, mji, alama za njia, simu ya mpokeaji…" onchange="window.skhDeliveryUpdateField(\'destination\',this.value)">' + esc(DC.destination || '') + '</textarea></div>'
                + '<div class="skh-dchoice-row">'
                + '<div class="skh-dchoice-field"><label>Tarehe ya kupokezana</label><input type="date" value="' + esc(DC.pickupDate || '') + '" onchange="window.skhDeliveryUpdateField(\'pickupDate\',this.value)"></div>'
                + '<div class="skh-dchoice-field"><label>Muda</label><input type="time" value="' + esc(DC.pickupTime || '') + '" onchange="window.skhDeliveryUpdateField(\'pickupTime\',this.value)"></div>'
                + '</div>'
                + '<div class="skh-dchoice-field"><label>Maelekezo ya ziada</label>'
                + '<textarea id="skhDcNotes" rows="2" placeholder="Mfano: mpigie simu ukifika…" onchange="window.skhDeliveryUpdateField(\'notes\',this.value)">' + esc(DC.notes || '') + '</textarea></div>'
                + sel
                + (!post ? '<button type="button" class="skh-dpick-mini" style="width:100%;min-height:42px;margin-top:8px;border-color:#0E7A5F;background:#0E7A5F;color:#fff" onclick="window.skhDeliveryOpenPicker()">' + ico('truck', 14) + ' Chagua mtoa usafiri kutoka matangazo halisi</button>'
                    + '<button type="button" class="skh-dpick-mini alt" style="width:100%;min-height:40px;margin-top:7px" onclick="window.skhDeliveryRequestAny()">' + ico('bell', 13) + ' Sina uhakika — omba SokoHai inutafutie</button>' : '')
                + '<div class="skh-dpick-fareline"><span>' + T('dp_pickup', 'Kuchukuliwa kwa muuzaji') + '</span><b>' + esc(pickup) + '</b></div>'
                + '<div class="skh-dpick-note">' + ico('shield', 12) + ' ' + T('dp_note', 'Malipo ya bidhaa (SokoPay Escrow) na nauli ya usafiri vimetengwa. Nauli hupangwa na mtoa usafiri na kulipwa kwenye mfumo wake uliopo baada ya kukubali ombi.') + '</div>'
                + '</div>';
        } else {
            body = '<div class="skh-dchoice-body"><div class="skh-dpick-note" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534;margin-top:0">'
                + ico('check', 12) + ' ' + T('dp_self', 'Utajichukulia mwenyewe au utatumia usafiri wako. Hakuna ombi la usafirishaji litatumwa.')
                + '</div></div>';
        }
        return '<div class="skh-dchoice" id="skhDeliverySection"><div class="skh-dchoice-head">'
            + '<b>' + T('dp_title', 'Usafirishaji / Delivery') + '</b>'
            + '<span class="skh-dchoice-tag">' + T('dp_optional', 'Hiari') + '</span></div>'
            + '<div class="skh-dchoice-radios">'
            + '<label class="skh-dchoice-radio ' + noOn + '"><input type="radio" name="skhDcRadio" value="no" ' + (DC.chosen && !DC.required ? 'checked' : '') + ' onchange="window.skhDeliverySetRequired(false)">'
            + '<span class="skh-dot"></span><span><b>' + T('dp_no', 'Sitahitaji usafirishaji') + '</b>'
            + '<small>' + T('dp_no_sub', 'Najichukulia mwenyewe / nina usafiri wangu') + '</small></span></label>'
            + '<label class="skh-dchoice-radio ' + yesOn + '"><input type="radio" name="skhDcRadio" value="yes" ' + (DC.required ? 'checked' : '') + ' onchange="window.skhDeliverySetRequired(true)">'
            + '<span class="skh-dot"></span><span><b>' + T('dp_yes', 'Nahitaji usafirishaji') + '</b>'
            + '<small>' + T('dp_yes_sub', 'Chagua tangazo halisi la mtoa usafiri') + '</small></span></label>'
            + '</div>' + body + '</div>';
    };
    window.skhDeliveryUpdateField = function (k, v) { DC[k] = v; saveState(DC); };

    // Badilisha sehemu bandia ya delivery kwenye cart baada ya kila render.
    function injectIntoCart() {
        var modal = document.getElementById('cartModal');
        if (!modal || modal.style.display === 'none' || modal.innerHTML.indexOf('fcart-shell') === -1 && modal.innerHTML.indexOf('scart-shell') === -1) return;
        var html = window.skhDeliverySectionHtml();
        // 1) Mwenyeji wa orchestration ya zamani.
        var host = document.getElementById('smartShippingOrchestrationHost');
        if (host) { host.innerHTML = html; }
        // 2) Kadi ya "Delivery Selection" ya fcart/scart.
        var sections = modal.querySelectorAll('.fcart-section, .scart-section');
        for (var i = 0; i < sections.length; i++) {
            var t = sections[i].textContent || '';
            if (t.indexOf('Delivery Selection') !== -1 || t.indexOf('Shipping & Delivery') !== -1
                || (sections[i].querySelector('#openLogisticsMarketplaceBtn'))) {
                sections[i].innerHTML = html;
                break;
            }
        }
        // Ficha vitufe vya zamani vya kuingia marketplace bandia.
        modal.querySelectorAll('button').forEach(function (b) {
            var tx = (b.textContent || '');
            if (tx.indexOf('Open SokoHai Logistics') !== -1 || tx.indexOf('Select Delivery') !== -1
                || tx.indexOf('Select Delivery / Open') !== -1) {
                if (b.id !== 'skhDcKeep') b.style.display = 'none';
            }
        });
    }

    /* ================================================================
     * 5) FUNGAMANA NA CART/CHECKOUT ILIYOPO (bila kugusa SokoPay)
     * ================================================================ */

    // [delivery payload] hutumika kwenye oda/tx.
    function deliveryPayloadFor(sellerItems) {
        var pickup = pickupOf(sellerItems);
        if (!DC.required) {
            return {
                required: false, method: 'self_collection', status: 'not_required',
                pickupLocation: pickup, chosenAt: nowIso()
            };
        }
        var post = DC.post;
        return {
            required: true,
            method: post ? 'selected_listing' : 'marketplace_request',
            status: 'pending_routing',
            logisticPostId: post ? post.id : null,
            logisticProviderId: post ? post.userId : null,
            logisticProviderName: post ? post.driverName : null,
            vehicleType: post ? post.vehicleType : (sellerItems[0] && sellerItems[0].vehicleType) || '',
            postSnapshot: post || null,
            pickupLocation: pickup,
            destination: DC.destination || '',
            notes: DC.notes || '',
            pickupDate: DC.pickupDate || '',
            pickupTime: DC.pickupTime || '',
            fare: post ? post.price : 0,
            packageWeightKg: weightOf(sellerItems),
            packageQuantity: sellerItems.reduce(function (s, x) { return s + qtyOf(x); }, 0),
            packageDescription: sellerItems.slice(0, 4).map(function (x) { return x.title || x.name; }).join(', '),
            chosenAt: nowIso()
        };
    }
    window.skhDeliveryPayloadFor = deliveryPayloadFor;

    function totalsFor(items) {
        var productsTotal = items.reduce(function (s, x) { return s + priceOf(x) * qtyOf(x); }, 0);
        var escrowFee = Math.round(productsTotal * 0.015);
        return { productsTotal: productsTotal, escrowFee: escrowFee, grandTotal: productsTotal + escrowFee };
    }

    // Override ya mwisho ya cart render: endesha ya zamani kisha ingiza chaguo.
    var _renderCart = window.renderSmartCart || window.finalRenderCart;
    var wrappedRender = function () {
        if (typeof _renderCart === 'function') _renderCart.apply(this, arguments);
        try { injectIntoCart(); } catch (e) {}
    };
    window.renderSmartCart = wrappedRender;
    window.finalRenderCart = wrappedRender;

    // Zuia njia ya zamani ya marketplace bandia — elekeza kichaguzi halisi.
    window.openLogisticsMarketplaceFromCart = function () { window.skhDeliveryOpenPicker(); };

    // Checkout haifungiwi tena na carrier; ila chaguo la delivery lazima lifanywe.
    window.finalProceedCheckout = async function () {
        var items = cartItems();
        if (!items.length) return alert('Cart iko wazi.');
        if (!DC.chosen) return alert('Chagua: unahitaji usafirishaji au la (Usafirishaji / Delivery).');
        if (DC.required && !DC.post && !await skhConfirm('Umeomba SokoHai ikutafutie mtoa usafiri (bila tangazo maalum). Endelea?')) return;
        if (DC.required && DC.post && !DC.destination) {
            // destination inashauriwa lakini haikatalishi (anaweza kukubali baadae).
        }
        window.openSmartOrderReview();
    };

    // Pitia ukaguzi wa zamani wa native-confirm na uende kwenye uumbaji safi.
    window.openSmartOrderReview = async function () {
        var items = cartItems();
        if (!items.length) return alert('Cart iko wazi.');
        var t = totalsFor(items);
        var msg = 'MAPITIO YA ODA\nBidhaa: TSh ' + t.productsTotal.toLocaleString()
            + '\nHifadhi ya Escrow: TSh ' + t.escrowFee.toLocaleString()
            + '\nJumla ya kulipa SokoPay: TSh ' + t.grandTotal.toLocaleString()
            + '\nUsafirishaji: ' + (DC.required
                ? (DC.post ? 'Tangazo: ' + DC.post.driverName + ' (nauli huamuliwa na mtoa usafiri)' : 'Ombi la soko (SokoHai itatafuta)')
                : 'Sitahitaji (self collection)')
            + '\n\nThibitisha kuendelea na malipo?';
        if (await skhConfirm(msg)) window.confirmSmartCartOrder();
    };

    // Uumbaji wa oda/SokoPay core: REUSE buildSokoPayCoreTx iliyopo, ONDOA
    // shipments/logistics_assignments/magari bandia. Delivery huunganishwa
    // baada ya malipo kuthibitishwa.
    window.confirmSmartCartOrder = async function () {
        if (typeof window.hydrateSmartCartProducts === 'function') {
            try { await window.hydrateSmartCartProducts(); } catch (e) {}
        }
        var items = cartItems();
        if (!items.length) return alert('Cart iko wazi.');
        // Mfululizo wa Lipa Sasa: chaguo huulizwa baada ya malipo.
        var isBuyNow = false;
        try { isBuyNow = sessionStorage.getItem(BUY_NOW_KEY) === '1'; } catch (e) {}
        if (!DC.chosen && !isBuyNow) return alert('Chagua: unahitaji usafirishaji au la.');
        var effectiveChoice = DC.chosen ? DC : Object.assign(defaultState(), { chosen: false });
        var t = totalsFor(items);
        var transactionToken = skh.smartCartToken();
        var orderId = 'ORD-' + Date.now();
        var groups = {};
        items.forEach(function (x) {
            var sid = sellerIdOf(x);
            (groups[sid] = groups[sid] || []).push(x);
        });
        var createdTx = [];
        var postPay = [];
        try {
            for (var sid in groups) {
                var sellerItems = groups[sid];
                var sellerProfile = null;
                try {
                    var sp = await skh.getDoc(skh.doc(skh.db, 'users', sid));
                    if (sp.exists) sellerProfile = sp.data();
                } catch (e) {}
                var calc = {
                    productsTotal: sellerItems.reduce(function (s, x) { return s + priceOf(x) * qtyOf(x); }, 0),
                    escrowFee: 0, shipping: 0, grandTotal: 0
                };
                calc.escrowFee = Math.round(calc.productsTotal * 0.015);
                calc.grandTotal = calc.productsTotal + calc.escrowFee;
                var core = skh.buildSokoPayCoreTx({
                    orderId: orderId, transactionToken: transactionToken,
                    sellerId: sid, sellerItems: sellerItems, calc: calc, sellerProfile: sellerProfile
                });
                var delivery = (isBuyNow && !DC.chosen) ? null : deliveryPayloadFor(sellerItems);
                core.delivery = delivery;
                core.deliveryRequired = !!(delivery && delivery.required);
                core.shipmentStatus = delivery ? (delivery.required ? 'Awaiting Logistics Selection' : 'Self Collection') : 'Awaiting Delivery Choice';
                if (delivery && !delivery.required) {
                    core.courier = { name: 'Self Collection', phone: '', vehicle: '', eta: '—', distance: '—' };
                }
                var coreRef = await skh.addDoc(skh.collection(skh.db, 'sokopay_core_transactions'), core);
                core.sokopayCoreId = coreRef.id;
                createdTx.push(coreRef.id);

                var orderDoc = Object.assign({}, core, {
                    sokopayCoreId: coreRef.id,
                    status: 'payment_pending',
                    paymentStatus: 'pending',
                    itemTitle: 'Smart Cart Order (' + sellerItems.length + ' items)',
                    delivery: delivery,
                    deliveryRequired: !!(delivery && delivery.required),
                    shipping: { method: delivery ? (delivery.required ? 'sokohai_logistics' : 'self_collection') : 'pending_choice' },
                    orderNotes: (DC.notes || ''),
                    paymentMethod: (window.smartCartState && window.smartCartState.paymentMethod) || 'sokopay_wallet'
                });
                var orderRef = await skh.addDoc(skh.collection(skh.db, 'orders'), orderDoc);
                postPay.push({ orderDocId: orderRef.id, coreId: coreRef.id, delivery: delivery });

                // [IDENTITY WIRING 2026-09-16] AGENT MONITORING (§7/§15): wakala
                // wa buyer/seller apate tukio la ORDER_CREATED. memberSilent=true
                // — taarifa za wateja wenyewe zinatumwa na flows zilizopo hapa
                // chini (seller_order_inbox + notifications), tusizirudie.
                try {
                    if (typeof window.skhEmitEvent === 'function') {
                        var _amt = Number(core.amount || (core.totals && core.totals.grandTotal) || 0) || null;
                        if (core.buyerId) window.skhEmitEvent({ type: 'ORDER_CREATED', memberId: core.buyerId, memberSilent: true, orderId: orderId, amount: _amt, memberName: core.buyerName || '' });
                        if (sid && sid !== core.buyerId) window.skhEmitEvent({ type: 'ORDER_CREATED', memberId: sid, memberSilent: true, orderId: orderId, amount: _amt });
                    }
                } catch (eMon) { /* monitoring si kikwazo cha biashara */ }

                // Sanduku la muuzaji (bila carrier bandia).
                try {
                    await skh.addDoc(skh.collection(skh.db, 'seller_order_inbox'), {
                        sellerId: sid, orderId: orderId, transactionToken: transactionToken,
                        sokopayCoreId: coreRef.id,
                        buyerDetails: { buyerId: core.buyerId, buyerName: core.buyerName },
                        paymentStatus: core.paymentStatus, escrowStatus: core.escrowStatus,
                        delivery: delivery || { required: false, status: 'pending_choice' },
                        pickupAddress: delivery ? delivery.pickupLocation : '', deliveryAddress: delivery ? (delivery.destination || '') : '',
                        items: sellerItems.map(function (x) { return { title: x.title || x.name, price: priceOf(x), qty: qtyOf(x) }; }),
                        createdAt: nowIso(), status: 'new_order'
                    });
                } catch (e) {}
                try {
                    await skh.addDoc(skh.collection(skh.db, 'notifications'), {
                        userId: sid, title: 'Oda Mpya ya SokoCart',
                        body: orderId + ' • ' + transactionToken + ' • ' + (!delivery ? 'Chaguo la usafirishaji baada ya malipo' : (delivery.required ? 'Usafirishaji utahitajika baada ya malipo' : 'Kujichukulia mwenyewe')),
                        createdAt: nowIso(), read: false
                    });
                } catch (e) {}
            }
            await skh.addDoc(skh.collection(skh.db, 'smart_cart_checkouts'), {
                orderId: orderId, transactionToken: transactionToken,
                buyerId: uid(), sokopayCoreIds: createdTx, items: items,
                totals: t, deliveryChoice: { chosen: DC.chosen, required: DC.required, post: DC.post ? DC.post.id : null, destination: DC.destination, undecided: isBuyNow && !DC.chosen },
                paymentMethod: (window.smartCartState && window.smartCartState.paymentMethod) || 'sokopay_wallet',
                createdAt: nowIso()
            });
            try { sessionStorage.setItem('pending_sokopay_core_ids', JSON.stringify(createdTx)); } catch (e) {}
            try { sessionStorage.setItem('smart_cart_checkout_token', transactionToken); } catch (e) {}
            try { sessionStorage.setItem(SESSION_PAYLOAD, JSON.stringify(postPay)); } catch (e) {}
            try { sessionStorage.setItem(BUY_NOW_KEY, sessionStorage.getItem(BUY_NOW_KEY) || (DC.chosen ? '' : '1')); } catch (e) {}

            skh.myCart = [];
            skh.smartCartSave();
            window.skhDeliveryReset();
            if (typeof closeModals === 'function') closeModals();
            skh.activeCheckoutAmount = t.grandTotal;
            var ca = document.getElementById('checkoutAmount');
            if (ca) ca.value = 'TSh ' + t.grandTotal.toLocaleString();
            var cm = document.getElementById('checkoutModal');
            if (cm) cm.style.display = 'flex';
        } catch (e) {
            alert('Order preparation imeshindikana: ' + (e && e.message));
        }
    };

    /* ================================================================
     * 6) BUY NOW — tumia cart/checkout ILE ILE (sio kulazimisha delivery)
     * ================================================================ */
    window.skhBuyNowProceed = async function () {
        // Chaguo la delivery linaulizwa BAADA ya malipo; rudi kwenye mazingira
        // mapya ya oda ya "Lipa Sasa".
        try { sessionStorage.setItem(BUY_NOW_KEY, '1'); } catch (e) {}
        if (typeof window.confirmSmartCartOrder === 'function') {
            if (typeof closeModals === 'function') closeModals();
            await window.confirmSmartCartOrder();
        } else if (typeof window.openCart === 'function') {
            window.openCart();
        }
    };

    /* ================================================================
     * 7) BAADA YA MALIPO — unganisha oda na usafiri HALISI
     * ================================================================ */

    // [PURE] tengeneza ride_request kutoka oda + delivery snapshot.
    window.skhDeliveryBuildRide = function (orderId, order, delivery) {
        order = order || {};
        delivery = delivery || {};
        var items = order.items || [];
        var first = items[0] || {};
        return {
            customerId: order.buyerId || uid(),
            customerName: order.buyerName || 'Mteja',
            customerPhone: delivery.customerPhone || (skh.currentUserData && skh.currentUserData.phone) || '',
            reqCategory: 'Cargo',
            vehicleType: delivery.vehicleType || '',
            fromLocation: delivery.pickupLocation || order.sellerLocation || '',
            toLocation: delivery.destination || '',
            cargoName: order.itemTitle || first.title || delivery.packageDescription || 'Mzigo wa oda',
            cargoDescription: delivery.packageDescription || order.itemTitle || '',
            cargoImage: order.itemImg || (first.image) || delivery.cargoImage || '',
            cargoPrice: Number(order.amount || 0),
            fare: Number(delivery.fare || 0),
            cargoWeight: Number(delivery.packageWeightKg || 0),
            cargoSize: delivery.packageQuantity ? delivery.packageQuantity + ' vipande' : '',
            pickupDate: delivery.pickupDate || '',
            pickupTime: delivery.pickupTime || '',
            specialRequirements: delivery.notes || '',
            orderId: orderId,
            source: 'product_checkout',
            productOrder: true,
            sellerId: order.sellerId || null,
            preferredDriverId: delivery.logisticProviderId || null,
            preferredPostId: delivery.logisticPostId || null,
            status: 'searching',
            routingStatus: 'routing',
            assignmentStatus: 'seeking',
            routingRound: 1, offersCount: 0, activeOfferId: null,
            pickupToken: null, pickupTokenStatus: 'unissued',
            handoverToken: null, handoverTokenStatus: 'unissued',
            transferTokenStatus: 'unissued',
            createdAt: nowIso()
        };
    };

    // Omba routing kupitia Cloud Function (Awamu E); fallback: andika
    // ride_request moja kwa moja (rules zinamruhusu aliyeingia) + taarifa
    // kwa madereva wanaolingana (mfumo wa 27-route-dispatch).
    window.skhHandleOrderDelivery = async function (orderId, delivery, orderData) {
        if (!orderId || !delivery) return { routed: false };
        if (!delivery.required) {
            try {
                await skh.updateDoc(skh.doc(skh.db, 'orders', orderId), { 'delivery.status': 'not_required', deliveryRequired: false
                });
            } catch (e) {}
            return { routed: false, selfCollection: true };
        }
        // Angalia kama tayari imeunganishwa (idempotent).
        try {
            const exSnap = await skh.getDoc(skh.doc(skh.db, 'orders', orderId));
            if (exSnap.exists && (exSnap.data().rideRequestId || (exSnap.data().delivery || {}).deliveryRequestId)) {
                return { routed: true, idempotent: true, rideId: exSnap.data().rideRequestId };
            }
        } catch (e) {}

        // 1) SERVER (ya kuaminika): deliveryRouteBooking hutengeneza
        //    ride + delivery_offers -> Request Inbox ya mtoa usafiri.
        if (window.skhRoutingServerRouteBooking) {
            try {
                var res = await window.skhRoutingServerRouteBooking({
                    orderId: String(orderId),
                    preferredDriverId: delivery.logisticProviderId || null,
                    delivery: delivery
                });
                var d = (res && res.data) || {};
                if (d.ok || d.rideId) return { routed: true, rideId: d.rideId, via: 'server', offers: d.offers || 0 };
            } catch (e) {
                var code = String((e && e.code) || '');
                var msg = String((e && e.message) || '');
                // [FUNCTIONS RESILIENCE] wrapper wa bootstrap huweka alama ya
                // fnDown; hapo nenda kwenye fallback salama (ride_request).
                var down = (e && e.fnDown === true) || skh.functionsDown === true
                    || /unavailable|not-found|deadline|internal|unauthenticated|functions\//i.test(code + ' ' + msg);
                if (!down && code) {
                    // Tatizo halisi la data — liripoti, usijifanye.
                    return { routed: false, error: msg || code };
                }
                // Server haipatikani -> endelea na fallback salama.
            }
        }

        // 2) FALLBACK: tengeneza ride_request wazi (soko la kazi za madereva).
        try {
            var ride = window.skhDeliveryBuildRide(orderId, orderData || {}, delivery);
            var rideRef = await skh.addDoc(skh.collection(skh.db, 'ride_requests'), ride);
            await skh.updateDoc(skh.doc(skh.db, 'orders', orderId), {
                rideRequestId: rideRef.id, deliveryId: rideRef.id, 'delivery.deliveryRequestId': rideRef.id, 'delivery.status': 'searching',
                deliveryRequired: true
            });
            // Taarifa kwa madereva wanaolingana (kazi ya 27).
            if (typeof window.skhDispatchRideToCarriers === 'function') {
                try { await window.skhDispatchRideToCarriers(ride, rideRef.id); } catch (e) {}
            }
            // Taarifa ya moja kwa moja kwa mtoa usafiri aliyechaguliwa.
            if (delivery.logisticProviderId) {
                try {
                    await skh.addDoc(skh.collection(skh.db, 'notifications'), {
                        userId: delivery.logisticProviderId,
                        title: 'Ombi Jipya la Usafiri — Oda #' + orderId,
                        body: (delivery.packageDescription || 'Mzigo') + ' · ' + (delivery.pickupLocation || '') + ' -> ' + (delivery.destination || '')
                            + (delivery.fare ? ' · Nauli ya marejeo: ' + money(delivery.fare) : '') + '. Fungua Requests Marketplace/Request Inbox.',
                        type: 'ride_request', rideId: rideRef.id, orderId: String(orderId),
                        createdAt: nowIso(), read: false
                    });
                } catch (e) {}
            }
            return { routed: true, rideId: rideRef.id, via: 'fallback_ride_request' };
        } catch (e) {
            return { routed: false, error: (e && e.message) || 'ride_create_failed' };
        }
    };

    // Chaguo baada ya malipo kwa yule ambaye hakuchagua kabla ya kulipa
    // (muktadha wa Lipa Sasa). Hurejesha Promise inayosubiri uamuzi.
    window.skhDeliveryPostPayPrompt = function (orders) {
        return new Promise(function (resolve) {
            var m = ensureModal('skhDpostModal');
            var rows = (orders || []).map(function (o) {
                return '<div class="skh-dpost-order"><b>' + esc(o.title || ('Oda #' + o.orderId)) + '</b><br>'
                    + '<small>' + esc(o.sellerName || '') + ' · ' + money(o.amount) + '</small></div>';
            }).join('');
            m.innerHTML = '<div class="skh-dpost-shell"><div class="skh-dpost-head"><h2>Usafirishaji wa oda yako</h2>'
                + '<small>Malipo yamekamilika. Je, unahitaji usafirishaji?</small></div>'
                + '<div class="skh-dpost-body">' + rows
                + '<div class="skh-dchoice-radios" style="grid-template-columns:1fr;margin-top:6px">'
                + '<label class="skh-dchoice-radio green is-on"><span class="skh-dot"></span><span><b>Sitahitaji usafirishaji</b><small>Najichukulia mwenyewe / nina usafiri wangu</small></span></label>'
                + '<label class="skh-dchoice-radio"><span class="skh-dot"></span><span><b>Nahitaji usafirishaji</b><small>Chagua tangazo halisi la mtoa usafiri</small></span></label>'
                + '</div>'
                + '<div class="skh-dpost-actions"><button type="button" class="light" id="skhDpostNo">Sitahitaji</button>'
                + '<button type="button" class="green" id="skhDpostYes">Nahitaji usafirishaji</button></div>'
                + '<p class="skh-dpost-note">Unaweza kuruka na kupanga usafiri baadaye kupitia Oda Zangu.</p>'
                + '</div></div>';
            m.style.display = 'flex';
            var cleanup = function () { m.style.display = 'none'; };
            m.querySelector('#skhDpostNo').onclick = async function () {
                cleanup();
                DC.required = false; DC.chosen = true; saveState(DC);
                for (var i = 0; i < orders.length; i++) {
                    await window.skhHandleOrderDelivery(orders[i].orderId, { required: false, status: 'not_required' }, orders[i]);
                }
                resolve({ required: false });
            };
            m.querySelector('#skhDpostYes').onclick = function () {
                cleanup();
                DC.required = true; DC.chosen = true; saveState(DC);
                window.skhDeliveryOpenPicker().then(function () {});
                // Baada ya kuchagua, endesha routing kwa oda zote.
                var check = setInterval(async function () {
                    if (!DC.post) return;
                    clearInterval(check);
                    for (var i = 0; i < orders.length; i++) {
                        var o = orders[i];
                        var items = [{ title: o.title, location: o.pickupLocation, sellerLocation: o.pickupLocation }];
                        var payload = deliveryPayloadFor(items);
                        await window.skhHandleOrderDelivery(o.orderId, payload, o);
                    }
                    resolve({ required: true, post: DC.post });
                }, 400);
            };
        });
    };

})();

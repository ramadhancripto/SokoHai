/* ==== js/app/41-request-inbox.js ====
// ============================================================
// AGENT REQUEST INBOX (2026-09) — mfumo WA PEKEE wa maombi
// yanayopelekwa na Routing Engine kwa wakala/dereva
// (hayajifichi ndani ya order/soko la jumla).
//
//   Request → Routing → Eligible Agents → Offer → Agent
//   Acceptance → Confirmation → Pickup Token (Token Box)
//
// Kadi ya "NEW REQUEST": mzigo, Pickup, Destination, tarehe ya
// pickup, fee, View Request, Accept, Decline. Akikataa/akichelewa
// mmoja, ofa inahamia kwa mwingine kiotomatiki (server rules +
// lazy expiry sweep). Browser inasoma tu delivery_offers zake;
// uandishi wote unapitia Cloud Functions.
// ============================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    var state = { tab: 'new', offers: [], loaded: false, unsub: null, timer: null };

    function esc(s) { return (skh.skhEscape ? skh.skhEscape(s) : String(s == null ? '' : s)); }
    function ico(name, size) { return (window.skhNavIcon ? window.skhNavIcon(name, size || 14) : ''); }
    function uid() { return (skh.currentUser && skh.currentUser.uid) || null; }

    async function call(name, payload) {
        try {
            var fn = window[name];
            if (typeof fn !== 'function') return { ok: false, error: 'server_unavailable' };
            var res = await fn(payload || {});
            return { ok: true, data: (res && res.data) || {} };
        } catch (e) {
            return { ok: false, error: (e && e.message) || 'error', code: (e && e.code) || null };
        }
    }

    function money(n) {
        n = Number(n);
        if (!isFinite(n) || n <= 0) return 'Maelewano';
        return 'TSh ' + Math.round(n).toLocaleString();
    }

    function fmtDateTime(iso) {
        if (!iso) return '';
        try {
            var d = new Date(typeof iso === 'string' ? iso.replace(' ', 'T') : iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch (e) { return ''; }
    }

    function minsLeft(o) {
        if (o.status !== 'offered' || !o.expiresAt) return null;
        var ms = Date.parse(o.expiresAt) - Date.now();
        return Math.max(0, Math.round(ms / 60000));
    }

    /* ------------------ pakia / sikiliza ------------------ */

    function stopListening() {
        if (state.unsub) { try { state.unsub(); } catch (e) {} state.unsub = null; }
        if (state.timer) { clearInterval(state.timer); state.timer = null; }
    }

    async function load() {
        var listEl = document.getElementById('riList');
        var me = uid();
        if (!me) {
            if (listEl) listEl.innerHTML = emptyHtml('Ingia ili kuona maombi yaliyotumwa kwako.');
            return;
        }
        if (listEl && !state.loaded) {
            listEl.innerHTML = '<div class="ri-loading"><span class="ri-spinner"></span><span>Inapakua maombi yako…</span></div>';
        }

        stopListening();

        // Lazy expiry: toa ofa zilizopita muda kwangu (server humpa mwingine nafasi).
        call('skhRoutingServerSweep', {}).catch(function () {});

        var q = skh.query(
            skh.collection(skh.db, 'delivery_offers'),
            skh.where('agentId', '==', me),
            skh.limit(100)
        );
        state.unsub = skh.onSnapshot(q, function (snap) {
            var all = [];
            snap.forEach(function (d) { all.push(Object.assign({ id: d.id }, d.data())); });
            all.sort(sortOffers);
            state.offers = all;
            state.loaded = true;
            render();
        }, function () {
            if (listEl && !state.offers.length) {
                listEl.innerHTML = emptyHtml('Imeshindikana kupakua maombi. Angalia muunganisho na ufungue tena.');
            }
        });

        // Burudisha "dakika zilizosalia" kila baada ya 30s.
        state.timer = setInterval(function () {
            if (document.getElementById('requestInboxModal').style.display === 'flex') render();
        }, 30000);
    }

    function sortOffers(a, b) {
        var rank = { offered: 0, waiting: 1, accepted: 2, declined: 3, expired: 4, cancelled: 5 };
        var ra = rank[a.status] == null ? 9 : rank[a.status];
        var rb = rank[b.status] == null ? 9 : rank[b.status];
        if (ra !== rb) return ra - rb;
        if (a.status === 'waiting' || b.status === 'waiting') return (a.rank || 0) - (b.rank || 0);
        var ta = a.offeredAt || a.createdAt || '';
        var tb = b.offeredAt || b.createdAt || '';
        return String(tb).localeCompare(String(ta));
    }

    /* ------------------ kadi ------------------ */

    function statusBadge(o) {
        if (o.status === 'offered') {
            var m = minsLeft(o);
            var txt = (m != null) ? (' · bakiza dakika ' + m) : '';
            return '<span class="ri-badge ri-badge--new"><i></i> OMBI JIPYA' + esc(txt) + '</span>';
        }
        if (o.status === 'waiting') return '<span class="ri-badge ri-badge--wait">' + ico('clock', 11) + ' WASUBIRIA ZAMU YANGU</span>';
        if (o.status === 'accepted') return '<span class="ri-badge ri-badge--ok">' + ico('check', 11) + ' UMEKUBALI — SAFARI IMEANZA</span>';
        if (o.status === 'declined') return '<span class="ri-badge ri-badge--dead">' + ico('x', 11) + ' UMEKATAA</span>';
        if (o.status === 'expired') return '<span class="ri-badge ri-badge--dead">' + ico('clock', 11) + ' MUDA UMEISHA</span>';
        return '<span class="ri-badge ri-badge--dead">' + ico('x', 11) + ' IMEFUNGWA</span>';
    }

    function offerCard(o) {
        var routeHtml = (o.fromLocation || o.toLocation)
            ? '<div class="ri-route">' + ico('map', 13)
                + '<span>' + esc(o.fromLocation || '…') + '</span>'
                + '<span class="ri-arrow">' + ico('arrow-right', 13) + '</span>'
                + '<span>' + esc(o.toLocation || '…') + '</span></div>' : '';

        var meta = [];
        var pd = fmtDateTime(o.pickupDate ? (o.pickupDate + (o.pickupTime ? ' ' + o.pickupTime : '')) : '');
        if (pd) meta.push('<span>' + ico('calendar', 12) + ' ' + esc(pd) + '</span>');
        if (o.vehicleType) meta.push('<span>' + ico('truck', 12) + ' ' + esc(o.vehicleType) + '</span>');
        meta.push('<span class="ri-fee">' + ico('wallet', 12) + ' ' + esc(money(o.fare)) + '</span>');
        if (o.round > 1) meta.push('<span>' + ico('refresh', 12) + ' Mzunguko ' + esc(o.round) + '</span>');

        var details = '';
        if (o.cargoDescription || o.requirements || o.weight) {
            details = '<div class="ri-detail" id="riDetail_' + esc(o.id) + '" hidden>'
                + (o.cargoDescription ? '<p><b>Mzigo:</b> ' + esc(o.cargoDescription) + '</p>' : '')
                + (o.weight ? '<p><b>Uzito:</b> ' + esc(o.weight) + ' kg</p>' : '')
                + (o.requirements ? '<p><b>Maagizo:</b> ' + esc(o.requirements) + '</p>' : '')
                + '<p class="ri-ref">' + ico('hash', 11) + ' ' + esc(o.orderId || o.rideId) + '</p>'
                + '</div>';
        }

        var actions = '';
        if (o.status === 'offered') {
            actions = '<div class="ri-actions">'
                + '<button type="button" class="ri-btn ri-btn-light" onclick="window.skhRequestInboxToggle(\'' + esc(o.id) + '\')">'
                + ico('search', 14) + ' Angalia Ombi</button>'
                + '<button type="button" class="ri-btn ri-btn-danger-light" onclick="window.skhRequestInboxDecline(\'' + esc(o.id) + '\')">'
                + ico('x', 14) + ' Kataa</button>'
                + '<button type="button" class="ri-btn ri-btn-primary" onclick="window.skhRequestInboxAccept(\'' + esc(o.id) + '\')">'
                + ico('check', 14) + ' Kubali</button>'
                + '</div>'
                + '<p class="ri-hint ri-hint-live">' + ico('shield-check', 13)
                + ' Hili ni OMBI RASMI (si ujumbe wa gumzo). Ukikubali, rekodi ya usafirishaji na tokeni ya kuchukua (PK) vinatengenezwa na kuingia Token Box yako.</p>';
        } else if (o.status === 'waiting') {
            actions = '<p class="ri-hint">' + ico('clock', 13)
                + ' Mfumo umekuweka miongoni mwa waliostahili. Ofa itakujia kiotomatiki wa kwanza akikataa au akichelewa.</p>';
        } else if (o.status === 'accepted') {
            actions = '<div class="ri-actions">'
                + '<button type="button" class="ri-btn ri-btn-light" onclick="window.skhRequestInboxTrack(\'' + esc(o.rideId) + '\')">'
                + ico('map', 14) + ' Fuatilia Safari</button>'
                + '<button type="button" class="ri-btn ri-btn-primary" onclick="window.skhRequestInboxOpenTokens()">'
                + ico('lock', 14) + ' Fungua Token Box</button>'
                + '</div>';
        }

        var cls = 'ri-card';
        if (o.status === 'offered') cls += ' ri-card--new';
        else if (o.status === 'accepted') cls += ' ri-card--ok';
        else if (['declined', 'expired', 'cancelled'].indexOf(o.status) !== -1) cls += ' ri-card--dead';

        return '<div class="' + cls + '" data-ri-id="' + esc(o.id) + '">'
            + '<div class="ri-top">' + statusBadge(o)
            + (o.exact ? '<span class="ri-fit">' + ico('check', 11) + ' route inayolingana</span>' : '') + '</div>'
            + '<b class="ri-cargo">' + esc(o.cargoName || 'Mzigo') + '</b>'
            + routeHtml
            + '<div class="ri-meta">' + meta.join('') + '</div>'
            + details
            + actions
            + '</div>';
    }

    function emptyHtml(msg) {
        return '<div class="ri-empty"><span class="ri-empty-ic">' + ico('package', 30) + '</span>'
            + '<b>Hamna maombi bado</b><p>' + esc(msg || 'Ombi jipya la usafiri linalolingana na route na chombo chako litaonekana hapa kama OMBI JIPYA.') + '</p></div>';
    }

    function render() {
        var listEl = document.getElementById('riList');
        if (!listEl) return;
        var tab = state.tab;
        var isNew = tab === 'new';
        var list = state.offers.filter(function (o) {
            return isNew ? (o.status === 'offered' || o.status === 'waiting')
                        : (o.status !== 'offered' && o.status !== 'waiting');
        });
        if (!list.length) {
            listEl.innerHTML = isNew
                ? emptyHtml('Huna ombi jipya wala nafasi ya kusubiri kwa sasa.')
                : emptyHtml('Hakuna historia ya maombi bado.');
            return;
        }
        listEl.innerHTML = '<div class="ri-group">' + list.map(offerCard).join('') + '</div>';
    }

    /* ------------------ vitendo ------------------ */

    function setBusy(btn, busy, html) {
        if (!btn) return;
        btn.disabled = busy;
        if (busy) btn.innerHTML = '<span class="ri-spinner ri-spinner--btn"></span>';
        else if (html) btn.innerHTML = html;
    }

    window.skhOpenRequestInbox = function (tab) {
        if (skh.requireAuth && !skh.requireAuth()) return;
        var modal = document.getElementById('requestInboxModal');
        if (!modal) return;
        if (typeof window.closeModals === 'function') { try { window.closeModals(); } catch (e) {} }
        modal.style.display = 'flex';
        state.tab = tab || 'new';
        state.loaded = false;
        document.querySelectorAll('[data-ri-tab]').forEach(function (b) {
            var on = b.getAttribute('data-ri-tab') === state.tab;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        load();
    };

    window.skhCloseRequestInbox = function () {
        var modal = document.getElementById('requestInboxModal');
        if (modal) modal.style.display = 'none';
        stopListening();
    };

    window.skhRequestInboxToggle = function (id) {
        var el = document.getElementById('riDetail_' + id);
        if (el) el.hidden = !el.hidden;
    };

    window.skhRequestInboxAccept = async function (offerId) {
        var card = document.querySelector('[data-ri-id="' + (window.CSS && CSS.escape ? CSS.escape(offerId) : offerId) + '"]');
        var btn = card ? card.querySelector('.ri-btn-primary') : null;
        setBusy(btn, true);
        var r = await call('skhRoutingServerOfferAccept', { offerId: offerId });
        if (r.ok) {
            if (window.sokohaiToast) window.sokohaiToast('Umekubali ombi — Pickup Token imetengenezwa.', 'success', 3600);
            window.skhCloseRequestInbox();
            if (window.skhOpenTokenBox) window.skhOpenTokenBox('active');
        } else {
            setBusy(btn, false, ico('check', 14) + ' Kubali');
            var msg = (r.code === 'failed-precondition')
                ? 'Ofa hii si hai tena — huenda mwingine aliichukua au muda uliisha.'
                : ('Imeshindikana: ' + (r.error || 'jaribu tena'));
            if (window.sokohaiToast) window.sokohaiToast(msg, 'error', 3600);
            else alert(msg);
        }
    };

    window.skhRequestInboxDecline = async function (offerId) {
        if (!confirm('Kataa ombi hili? Mfumo utalihamisha kwa wakala mwingine aliyestahili.')) return;
        var card = document.querySelector('[data-ri-id="' + (window.CSS && CSS.escape ? CSS.escape(offerId) : offerId) + '"]');
        var btn = card ? card.querySelector('.ri-btn-danger-light') : null;
        setBusy(btn, true);
        var r = await call('skhRoutingServerOfferDecline', { offerId: offerId });
        if (r.ok) {
            if (window.sokohaiToast) window.sokohaiToast('Ombi limekataliwa; linapelekwa kwa mwingine.', 'success', 2800);
            load();
        } else {
            setBusy(btn, false, ico('x', 14) + ' Kataa');
            if (window.sokohaiToast) window.sokohaiToast('Imeshindikana: ' + (r.error || 'jaribu tena'), 'error', 3200);
        }
    };

    window.skhRequestInboxTrack = function (rideId) {
        window.skhCloseRequestInbox();
        if (typeof window.openLiveMap === 'function') window.openLiveMap(rideId);
        else if (typeof window.switchDashTab === 'function') window.switchDashTab('tracking');
    };

    window.skhRequestInboxOpenTokens = function () {
        window.skhCloseRequestInbox();
        if (window.skhOpenTokenBox) window.skhOpenTokenBox('active');
    };

    /* ------------------ vifungo ------------------ */
    document.addEventListener('DOMContentLoaded', function () {
        var closeBtn = document.getElementById('riCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', window.skhCloseRequestInbox);
        document.querySelectorAll('[data-ri-tab]').forEach(function (b) {
            b.addEventListener('click', function () {
                state.tab = b.getAttribute('data-ri-tab');
                document.querySelectorAll('[data-ri-tab]').forEach(function (x) {
                    var on = x === b;
                    x.classList.toggle('is-active', on);
                    x.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                render();
            });
        });
        var modal = document.getElementById('requestInboxModal');
        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) window.skhCloseRequestInbox(); });
    });
})();

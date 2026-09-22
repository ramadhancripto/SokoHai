/* ==== js/15-sp-live.js ==== */
// ============================================================
// SOKOHAI SOKOPAY LIVE TABS [PHASE 5.2-UX]
// Tabs za vitengo vya SokoPay (Products/Services/Jobs/Logistics)
// zilionyesha data ya DEMO static (ililoandikwa kwenye code).
// Faili hii inaonyesha DATA HALISI ya mtumiaji:
//   - Products:  orders (ununuo + mauzo yangu)
//   - Services:  services (huduma nilizotangaza)
//   - Jobs:      jobs (fursa za ajira nilizoweka)
//   - Logistics: ride_requests (safari zangu + codes)
// Ukaguzi: hakuna mabadiliko ya module — Firestore inasajiliwa na
// app.module.js kupitia skhSpLiveRegisterFirestore (mfumo wa 14-sync).
// ============================================================
(function () { 'use strict';

    var fb = null; // {db, collection, query, where, orderBy, limit, getDocs}
    window.skhSpLiveRegisterFirestore = function (fns) { fb = fns; };

    // ---------- helpers (XSS-safe kwa msaada wa module) ----------
    function esc(s) { return window.skhEscape ? window.skhEscape(s) : String(s == null ? '' : s); }
    function pill(st) { return window.spStatusClass ? window.spStatusClass(st) : ''; }
    function money(n) { return 'TZS ' + (Number(n) || 0).toLocaleString(); }
    function when(iso) { try { var d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString(); } catch (e) { return '—'; } }
    function setKpi(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
    function uid() { return window.currentUser && window.currentUser.uid; }

    function loading(box, msg) {
        var el = document.getElementById(box);
        if (el) el.innerHTML = '<p style="text-align:center;color:#64748b;padding:24px 8px;"> ' + msg + '</p>';
    }
    function fail(box, e) {
        var el = document.getElementById(box);
        if (el) el.innerHTML = '<p style="text-align:center;color:#e11d48;padding:16px;">Imeshindikana kupakia: ' + esc(e && e.message) + '</p>';
    }
    function emptyState(box, icon, title, sub, ctaLabel, ctaFn) {
        var el = document.getElementById(box);
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:28px 10px;color:#64748b;">' + '<div style="font-size:34px;">' + icon + '</div>' + '<b style="display:block;margin-top:8px;color:#0f172a;">' + esc(title) + '</b>' + '<small style="display:block;margin-top:4px;">' + esc(sub) + '</small>' +
            (ctaLabel ? '<button onclick="' + ctaFn + '" style="margin-top:14px;padding:11px 18px;background:#18A982;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">' + esc(ctaLabel) + '</button>' : '') + '</div>';
    }

    function rowCard(icon, title, sub, amount, status, extra) {
        return '<div style="background:#f8fafc;border:1px solid #e2e8f0;padding:13px 15px;border-radius:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;">' + '<div style="min-width:0;">' + '<b style="font-size:13px;color:#0f172a;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + icon + ' ' + esc(title) + '</b>' + '<small style="color:#64748b;display:block;margin-top:2px;">' + sub + '</small>' +
            (extra || '') + '</div>' + '<div style="text-align:right;flex-shrink:0;">' +
            (amount != null ? '<b style="font-size:13px;color:#00509d;display:block;">' + money(amount) + '</b>' : '') +
            (status ? '<span class="spbuyer-pill ' + pill(status) + '" style="font-size:12px;">' + esc(String(status).toUpperCase()) + '</span>' : '') + '</div></div>';
    }

    function listWrap(header, rows, note) {
        return '<b style="font-size:13px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:block;text-align:left;">' + header + '</b>' + '<div style="display:flex;flex-direction:column;gap:10px;">' + rows.join('') + '</div>' +
            (note ? '<small style="display:block;margin-top:12px;color:#94a3b8;text-align:left;">' + note + '</small>' : '');
    }

    function ready() { return fb && uid(); }

    // ============================================================
    // PRODUCTS — orders (buyer + seller) zangu halisi
    // ============================================================
    window.skhSpLive = {};

    window.skhSpLive.products = async function () {
        if (!ready()) return;
        loading('productSubTabContent', 'Inapakia oda zako halisi za bidhaa...');
        try {
            var my = uid();
            var qB = fb.query(fb.collection(fb.db, 'orders'), fb.where('buyerId', '==', my), fb.limit(50));
            var qS = fb.query(fb.collection(fb.db, 'orders'), fb.where('sellerId', '==', my), fb.limit(50));
            var res = await Promise.all([fb.getDocs(qB), fb.getDocs(qS)]);
            var seen = {}, buyer = [], seller = [], held = 0, heldSum = 0;
            res[0].forEach(function (d) { seen[d.id] = 1; var o = d.data(); o.__id = d.id; buyer.push(o); });
            res[1].forEach(function (d) { if (!seen[d.id]) { var o = d.data(); o.__id = d.id; seller.push(o); } });
            var all = buyer.concat(seller);
            all.forEach(function (o) { if (o.status === 'held') { held++; heldSum += parseFloat(o.amount) || 0; } });

            setKpi('lblActiveProdPayments', (buyer.length + seller.length) + ' Total');
            setKpi('lblActiveProdEscrow', money(heldSum || (held ? heldSum : 0)));

            if (all.length === 0) {
                emptyState('productSubTabContent', '', 'Hakuna oda za bidhaa bado', 'Oda zako za kununua na kuuza zitajitokeza hapa (Live).', ' Weka Bidhaa Sokoni', "window.showForm && window.showForm('sellerForm')");
                return;
            }
            buyer.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
            seller.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

            var rows = [];
            buyer.slice(0, 15).forEach(function (o) {
                rows.push(rowCard('', (o.itemTitle || 'Oda'), 'Ulinunua • ' + when(o.date) + (o.sellerName ? ' • Muuzaji: ' + esc(o.sellerName) : ''), parseFloat(o.amount) || 0, o.status));
            });
            var html = listWrap(' Oda Zangu za Kununua (' + buyer.length + ')', rows.length ? rows : ['<small style="color:#94a3b8;">Hakuna.</small>']);

            if (seller.length) {
                var srows = [];
                seller.slice(0, 15).forEach(function (o) {
                    srows.push(rowCard('', (o.itemTitle || 'Mauzo'), 'Umeuza • ' + when(o.date) + (o.buyerName ? ' • Mteja: ' + esc(o.buyerName) : ''), parseFloat(o.amount) || 0, o.status));
                });
                html += '<div style="height:16px;"></div>' + listWrap(' Mauzo Yangu (' + seller.length + ')', srows);
            }
            html += '<div style="height:10px;"></div><button onclick="window.openBuyerOrdersModal && window.openBuyerOrdersModal()" style="width:100%;padding:12px;background:#001122;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;"> Fungua Ufuatiliaji Kamili (Tracker)</button>';
            document.getElementById('productSubTabContent').innerHTML = html;
        } catch (e) { fail('productSubTabContent', e); }
    };

    // ============================================================
    // SERVICES — huduma nilizotangaza (collection: services)
    // ============================================================
    window.skhSpLive.services = async function () {
        if (!ready()) return;
        loading('serviceSubTabContent', 'Inapakia huduma zako halisi...');
        try {
            var q = fb.query(fb.collection(fb.db, 'services'), fb.where('userId', '==', uid()), fb.limit(50));
            var snap = await fb.getDocs(q);
            var list = [];
            snap.forEach(function (d) { var s = d.data(); s.__id = d.id; list.push(s); });
            setKpi('lblActiveServContracts', list.length + ' Zimetangazwa');

            if (!list.length) {
                emptyState('serviceSubTabContent', '', 'Hujatangaza huduma bado', 'Tangaza ufundi/ujuzi wako — mikataba yake itaonekana hapa (Live).', ' Tangaza Huduma', "window.showForm && window.showForm('serviceForm')");
                return;
            }
            list.sort(function (a, b) { return String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')); });
            setKpi('lblActiveServProtected', money(list.reduce(function (s, x) { return s + (parseFloat(x.price) || 0); }, 0)));
            var rows = list.slice(0, 20).map(function (s) {
                return rowCard('', (s.title || s.name || 'Huduma'), (s.category || 'Huduma') + ' • ' + when(s.createdAt || s.date), parseFloat(s.price) || 0, s.status || 'listed');
            });
            document.getElementById('serviceSubTabContent').innerHTML = listWrap(' Huduma Zangu Zilizotangazwa (' + list.length + ')', rows);
        } catch (e) { fail('serviceSubTabContent', e); }
    };

    // ============================================================
    // JOBS — fursa za ajira nilizoweka (collection: jobs)
    // ============================================================
    window.skhSpLive.jobs = async function () {
        if (!ready()) return;
        loading('jobSubTabContent', 'Inapakia matangazo yako halisi ya ajira...');
        try {
            var q = fb.query(fb.collection(fb.db, 'jobs'), fb.where('userId', '==', uid()), fb.limit(50));
            var snap = await fb.getDocs(q);
            var list = [];
            snap.forEach(function (d) { var j = d.data(); j.__id = d.id; list.push(j); });
            setKpi('lblActiveJobContracts', list.length + ' Zimetangazwa');

            if (!list.length) {
                emptyState('jobSubTabContent', '', 'Hujaweka fursa ya ajira bado', 'Weka tangazo la kazi/vibarua — waombaji watakuona sokoni.', ' Tangaza Ajira', "window.showForm && window.showForm('jobForm')");
                return;
            }
            list.sort(function (a, b) { return String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')); });
            setKpi('lblActiveJobProtected', money(list.reduce(function (s, x) { return s + (parseFloat(x.salary) || parseFloat(x.price) || 0); }, 0)));
            var rows = list.slice(0, 20).map(function (j) {
                return rowCard('', (j.title || 'Kazi'), (j.company || j.jobType || '') + ' • ' + when(j.createdAt || j.date), parseFloat(j.salary) || parseFloat(j.price) || 0, j.status || 'open');
            });
            document.getElementById('jobSubTabContent').innerHTML = listWrap(' Fursa Zangu za Ajira (' + list.length + ')', rows);
        } catch (e) { fail('jobSubTabContent', e); }
    };

    // ============================================================
    // LOGISTICS — safari zangu (collection: ride_requests)
    // ============================================================
    window.skhSpLive.logistics = async function () {
        if (!ready()) return;
        loading('logisticsSubTabContent', 'Inapakia safari zako halisi...');
        try {
            var q = fb.query(fb.collection(fb.db, 'ride_requests'), fb.where('customerId', '==', uid()), fb.orderBy('createdAt', 'desc'), fb.limit(30));
            var snap = await fb.getDocs(q);
            var list = [];
            snap.forEach(function (d) { var r = d.data(); r.__id = d.id; list.push(r); });
            var active = list.filter(function (r) { return ['pending', 'accepted', 'in_transit', 'arrived_at_hub'].indexOf(r.status) !== -1; });
            setKpi('lblActiveShipments', active.length + ' Active');

            if (!list.length) {
                emptyState('logisticsSubTabContent', '', 'Hakuna safari ya mzigo bado', 'Oda zenye usafirishaji wa Sokohai zitaonekana hapa na code za uthibitisho.', ' Sajili Usafirishaji', "window.showForm && window.showForm('deliveryForm')");
                return;
            }
            var rows = list.slice(0, 20).map(function (r) {
                var code = r.transferCode ? '<small style="display:block;margin-top:4px;color:#9a3412;"> Code: <b>' + esc(r.transferCode) + '</b></small>' : '';
                return rowCard('', 'Safari: ' + (r.cargoName || 'Mzigo'), esc(r.fromLocation || '?') + ' ' + esc(r.toLocation || '?') + ' • ' + when(r.createdAt), parseFloat(r.price) || null, r.status, code);
            });
            var html = listWrap(' Safari Zangu (' + list.length + ')', rows);
            html += '<div style="height:10px;"></div><button onclick="window.openBuyerOrdersModal && window.openBuyerOrdersModal()" style="width:100%;padding:12px;background:#001122;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;"> Fungua Ufuatiliaji Kamili (Tracker)</button>';
            document.getElementById('logisticsSubTabContent').innerHTML = html;
        } catch (e) { fail('logisticsSubTabContent', e); }
    };
})();

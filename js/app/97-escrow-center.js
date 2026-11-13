/* ==== js/app/97-escrow-center.js ====
// ============================================================
// [REPAIR 2026-10] SOKOPAY ESCROW CENTRE — Kituo cha Escrow
// ------------------------------------------------------------
// Sehemu moja ya mnunuzi na muuzaji kusimamia fedha zilizo escrow,
// ikitumia mamlaka ya SERVER pekee (Cloud Functions):
//   Mnunuzi : namba ya kupokea (orderDeliveryCodeIssue), "Nimepokea"
//             (escrowRelease), kufungua mgogoro (disputeOpen).
//   Muuzaji : kuthibitisha makabidhiano kwa namba ya mnunuzi
//             (orderConfirmDelivery). Muuzaji HAWEZI kuona wala
//             kutengeneza namba hiyo.
// Hakuna hali ya malipo inayoandikwa na kivinjari hapa.
// ============================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    var ESCROW_STATES = ['held', 'shipped', 'awaiting_pickup', 'in_transit', 'delivered', 'disputed'];
    function esc(s) { return skh.skhEscape ? skh.skhEscape(s) : String(s == null ? '' : s); }
    function money(n) { return 'TSh ' + (Number(n) || 0).toLocaleString(); }
    function call(name) {
        if (typeof skh.wrapCallable !== 'function') throw new Error('Huduma ya server haipatikani kwa sasa.');
        return skh.wrapCallable(name);
    }
    function errText(e) { return (e && (e.message || e.code)) || String(e); }
    function statusLabel(s) {
        return ({ awaiting_payment: 'Inasubiri malipo ya mteja', completed: 'Imekamilika — malipo yametolewa', held: 'Imelipwa — iko Escrow', shipped: 'Imesafirishwa', awaiting_pickup: 'Inasubiri kuchukuliwa',
            in_transit: 'Njiani', delivered: 'Imekabidhiwa (uthibitisho wa server)', disputed: 'Mgogoro — fedha zimesimamishwa' })[s] || s;
    }

    function modal() {
        var m = document.getElementById('skhEscrowCenter');
        if (!m) {
            m = document.createElement('div');
            m.id = 'skhEscrowCenter';
            m.className = 'overlay-menu';
            m.style.cssText = 'z-index:100010;display:none;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:16px;';
            document.body.appendChild(m);
        }
        return m;
    }
    function close() { var m = document.getElementById('skhEscrowCenter'); if (m) m.style.display = 'none'; }
    window.skhEscrowCenterClose = close;

    function card(o, role) {
        var id = esc(o.id);
        var btns = '';
        var B = function (label, fn, bg, fg) {
            return '<button onclick="' + fn + '" style="flex:1;min-width:140px;padding:10px;border:none;border-radius:10px;font-weight:700;cursor:pointer;background:' + bg + ';color:' + (fg || '#fff') + ';">' + label + '</button>';
        };
        var isSvc = String(o.collectionName || '') === 'services';
        if (o.status === 'awaiting_payment') {
            // [R16] oda ya huduma iliyokubaliwa na fundi: mteja analipa kwa SokoPay wallet (server inashikilia escrow)
            if (role === 'buyer' && isSvc) btns += B('Lipa ' + money(o.amount) + ' kwa SokoPay', "window.skhServiceOrderPay('" + id + "'," + (Number(o.amount) || 0) + ")", '#12946f');
            btns += B('Ghairi Oda', "window.skhOrderCancelUnpaid('" + id + "')", '#e2e8f0', '#334155');
        } else if (o.status === 'completed') {
            if (role === 'buyer') {
                var it0 = Array.isArray(o.items) && o.items[0] ? o.items[0] : {};
                var tgt = isSvc ? (o.serviceId || '') : (o.productId || it0.productId || it0.id || o.itemId || '');
                if (tgt) btns += B('Andika Tathmini', "window.skhEscrowReview('" + esc(tgt) + "','" + (isSvc ? 'service' : 'product') + "')", '#fef3c7', '#92400e');
            }
        } else if (role === 'buyer') {
            if (['held', 'shipped', 'awaiting_pickup', 'in_transit'].indexOf(o.status) !== -1) {
                btns += B('Namba ya Kupokea', "window.skhOrderShowDeliveryCode('" + id + "')", '#00509d');
            }
            if (['held', 'shipped', 'awaiting_pickup', 'in_transit', 'delivered'].indexOf(o.status) !== -1) {
                btns += B('Nimepokea — Toa Malipo', "window.skhOrderConfirmReceipt('" + id + "')", '#16a34a');
                btns += B('Fungua Mgogoro', "window.skhOrderOpenDispute('" + id + "')", '#fee2e2', '#b91c1c');
            }
        } else {
            if (o.status === 'held' && o.paymentVerified === true && !o.rideRequestId) {
                btns += B('Nimesafirisha', "window.skhOrderMarkShipped('" + id + "')", '#0f766e');
            }
            if (['held', 'shipped', 'awaiting_pickup', 'in_transit'].indexOf(o.status) !== -1) {
                btns += B('Thibitisha Makabidhiano', "window.skhOrderConfirmDeliveryPrompt('" + id + "')", '#00509d');
            }
            if (['held', 'shipped', 'awaiting_pickup', 'in_transit', 'delivered'].indexOf(o.status) !== -1) {
                btns += B('Fungua Mgogoro', "window.skhOrderOpenDispute('" + id + "')", '#fee2e2', '#b91c1c');
            }
        }
        return '<div class="skh-esc-card" data-order="' + id + '" data-status="' + esc(o.status) + '" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;text-align:left;">'
            + '<div style="display:flex;justify-content:space-between;gap:8px;"><b>' + esc(o.itemTitle || 'Oda') + '</b><b>' + money(o.amount) + '</b></div>'
            + '<div style="font-size:12px;color:#475569;margin:4px 0 8px;">' + (role === 'buyer' ? 'Unanunua' : 'Unauza') + ' · ' + esc(statusLabel(o.status))
            + (o.paymentVerified === true ? ' · <span style="color:#16a34a;font-weight:700;">Malipo yamethibitishwa na server</span>' : ' · <span style="color:#b45309;">Malipo bado hayajathibitishwa</span>')
            + '</div><div style="display:flex;flex-wrap:wrap;gap:8px;">' + (btns || '<small style="color:#64748b;">Hakuna hatua kwa sasa.</small>') + '</div></div>';
    }

    window.skhOpenEscrowCenter = async function () {
        if (!skh.currentUser) { if (skh.requireAuth) skh.requireAuth(); return; }
        var m = modal();
        m.style.display = 'flex';
        m.innerHTML = '<div style="background:#fff;border-radius:18px;max-width:560px;width:100%;max-height:85vh;overflow:auto;padding:18px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h3 style="margin:0;">Kituo cha Escrow (SokoPay)</h3>'
            + '<button onclick="window.skhEscrowCenterClose()" style="border:none;background:#e2e8f0;border-radius:8px;padding:6px 10px;cursor:pointer;">Funga</button></div>'
            + '<p style="font-size:12px;color:#475569;margin:0 0 12px;">Fedha hutolewa kwa muuzaji ukithibitisha kupokea. Usimpe muuzaji Namba ya Kupokea mpaka umepokea mzigo wako.</p>'
            + '<div id="skhEscrowCenterList">Inapakia...</div></div>';
        var me = skh.currentUser.uid;
        try {
            var qb = skh.query(skh.collection(skh.db, 'orders'), skh.where('buyerId', '==', me), skh.limit(100));
            var qs = skh.query(skh.collection(skh.db, 'orders'), skh.where('sellerId', '==', me), skh.limit(100));
            var res = await Promise.allSettled([skh.getDocs(qb), skh.getDocs(qs)]);
            var html = '', done = [];
            ['buyer', 'seller'].forEach(function (role, i) {
                var r = res[i];
                if (r.status !== 'fulfilled') return;
                r.value.forEach(function (d) {
                    var o = Object.assign({ id: d.id }, d.data());
                    if (ESCROW_STATES.indexOf(o.status) !== -1 || o.status === 'awaiting_payment') html += card(o, role);
                    else if (o.status === 'completed' && role === 'buyer') done.push(o);
                });
            });
            done.sort(function (a, b) { return String(b.completedAt || b.date || '').localeCompare(String(a.completedAt || a.date || '')); });
            if (done.length) html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#13231e;">Zilizokamilika</h4>' + done.slice(0, 10).map(function (o) { return card(o, 'buyer'); }).join('');
            document.getElementById('skhEscrowCenterList').innerHTML = html || '<p style="color:#64748b;text-align:center;">Huna oda iliyo kwenye escrow kwa sasa.</p>';
        } catch (e) {
            document.getElementById('skhEscrowCenterList').innerHTML = '<p style="color:#b91c1c;">Imeshindwa kupakia: ' + esc(errText(e)) + '</p>';
        }
    };

    /* [R16] Mteja analipia oda ya huduma kwa wallet: server (serviceOrderWalletPay) inakata salio,
       inashikilia escrow na kuweka 'held' — kivinjari hakiandiki hali ya malipo. */
    var paying = {};
    window.skhServiceOrderPay = async function (orderId, amount) {
        if (paying[orderId]) return;
        var ok = window.skhConfirm ? await window.skhConfirm('Lipa ' + money(amount) + ' kutoka SokoPay wallet yako? Pesa itashikiliwa (escrow) mpaka uthibitishe kazi imekamilika.') : confirm('Lipa?');
        if (!ok) return;
        paying[orderId] = true;
        try {
            var r = await call('serviceOrderWalletPay')({ orderId: orderId, expectedAmount: amount });
            alert(r && r.data && r.data.already ? 'Oda hii tayari imelipiwa.' : 'Malipo yamepokelewa na kushikiliwa kwenye escrow. Fundi ameanza kazi.');
            if (window.skhOpenEscrowCenter) window.skhOpenEscrowCenter();
        } catch (e) {
            var m = errText(e);
            alert(/salio|balance|insufficient/i.test(m) ? 'Salio la wallet halitoshi. Ongeza salio kisha ujaribu tena.' : 'Kosa: ' + m);
        } finally { delete paying[orderId]; }
    };
    window.skhOrderCancelUnpaid = async function (orderId) {
        var ok = window.skhConfirm ? await window.skhConfirm('Ghairi oda hii ambayo bado haijalipiwa?') : confirm('Ghairi?');
        if (!ok) return;
        try {
            await skh.updateDoc(skh.doc(skh.db, 'orders', orderId), { status: 'cancelled', cancelledAt: new Date().toISOString() });
            if (window.skhOpenEscrowCenter) window.skhOpenEscrowCenter();
        } catch (e) { alert('Kosa: ' + errText(e)); }
    };
    window.skhEscrowReview = function (targetId, type) {
        close();
        if (typeof window.openRatingModal === 'function') window.openRatingModal(targetId, type, '');
        else alert('Fomu ya tathmini haipatikani kwa sasa.');
    };

    /* [R16] Muuzaji: oda iliyolipwa (held, server-verified) -> 'shipped'. Hii haitoi pesa;
       rules zinaruhusu muuzaji tu, kutoka held+paymentVerified. */
    window.skhOrderMarkShipped = async function (orderId) {
        var ok = window.skhConfirm ? await window.skhConfirm('Thibitisha umesafirisha / umeandaa mzigo kwa mnunuzi? Pesa bado inabaki escrow mpaka makabidhiano yathibitishwe.') : confirm('Thibitisha?');
        if (!ok) return;
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'orders', orderId)); var o = s.exists() ? s.data() : {};
            await skh.updateDoc(skh.doc(skh.db, 'orders', orderId), { status: 'shipped', shippedAt: new Date().toISOString() });
            try { await skh.addDoc(skh.collection(skh.db, 'notifications'), { userId: o.buyerId, event: 'order.shipped', params: { title: String(o.itemTitle || '') },
                title: 'Mzigo wako umesafirishwa', body: 'Muuzaji amesafirisha "' + String(o.itemTitle || 'oda yako') + '". Ukipokea, mpe Namba ya Kupokea.', type: 'order', orderId: orderId, read: false, createdAt: new Date().toISOString() }); } catch (e) {}
            if (window.skhOpenEscrowCenter) window.skhOpenEscrowCenter();
        } catch (e) { alert('Kosa: ' + errText(e)); }
    };

    window.skhOrderShowDeliveryCode = async function (orderId) {
        try {
            var r = await call('orderDeliveryCodeIssue')({ orderId: orderId });
            var code = r && r.data && r.data.code;
            if (!code) throw new Error('Namba haikupatikana.');
            alert('NAMBA YAKO YA KUPOKEA: ' + code
                + '\n\nMpe muuzaji/msafirishaji namba hii TU baada ya kupokea na kukagua mzigo wako.'
                + '\nNamba hii ni ya siri yako; ukiitoa, unathibitisha kuwa umepokea.'
                + '\nInaisha baada ya saa ' + ((r.data && r.data.expiresInHours) || '') + '. Ukiomba mpya, ya zamani haitafanya kazi.');
        } catch (e) { alert('Kosa: ' + errText(e)); }
    };

    window.skhOrderConfirmDeliveryPrompt = async function (orderId) {
        var code = window.skhPrompt ? await window.skhPrompt('Andika Namba ya Kupokea uliyopewa na mnunuzi (mf. DL-XXXXXXXX):') : prompt('Namba ya Kupokea:');
        if (!code) return;
        try {
            var r = await call('orderConfirmDelivery')({ orderId: orderId, code: String(code).trim() });
            alert('Makabidhiano yamethibitishwa na server. Fedha zitatolewa mnunuzi akithibitisha, au kwa mujibu wa sera ya SokoPay iliyowekwa na Admin.');
            if (window.skhOpenEscrowCenter) window.skhOpenEscrowCenter();
            return r && r.data;
        } catch (e) { alert('Kosa: ' + errText(e)); }
    };

    window.skhOrderConfirmReceipt = async function (orderId) {
        var ok = window.skhConfirm ? await window.skhConfirm('Unathibitisha kuwa umepokea mzigo/huduma kikamilifu? Fedha zitatumwa kwa muuzaji na haziwezi kurudishwa.') : confirm('Thibitisha?');
        if (!ok) return;
        try {
            var r = await call('escrowRelease')({ orderId: orderId });
            var sp = (r && r.data && r.data.split) || {};
            alert('Asante! Malipo yametolewa kwa muuzaji (' + money(sp.sellerEarned) + ').');
            if (window.skhOpenEscrowCenter) window.skhOpenEscrowCenter();
        } catch (e) { alert('Kosa: ' + errText(e)); }
    };

    window.skhOrderOpenDispute = async function (orderId, linkId) {
        var reason = window.skhPrompt ? await window.skhPrompt('Eleza tatizo kwa ufupi (fedha zitasimamishwa mpaka Admin atoe uamuzi):') : prompt('Tatizo:');
        if (!reason) return;
        try {
            await call('disputeOpen')(linkId ? { linkId: linkId, reason: reason } : { orderId: orderId, reason: reason });
            alert('Mgogoro umefunguliwa. Fedha zimesimamishwa kwenye escrow mpaka Admin atoe uamuzi.');
            if (window.skhOpenEscrowCenter && !linkId) window.skhOpenEscrowCenter();
        } catch (e) { alert('Kosa: ' + errText(e)); }
    };
})();

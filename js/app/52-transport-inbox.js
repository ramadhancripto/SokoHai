/* ============================================================================
   SOKOHAI — TRANSPORT INBOX ACTION FLOW
   ----------------------------------------------------------------------------
   Inbox = communication + contextual action center.
   LAKINI source of truth inabaki kama ilivyo (§22):
       Transport Service  -> ride_requests / shipments  (33-custody.js)
       SokoPay            -> malipo
       Token system       -> delivery_tokens (skhCustodyReadToken / GenerateToken)
       Order system       -> orders

   HAKUNA logic mpya ya transport/payment/token hapa (§13, §22). Faili hii ni
   UI LAYER pekee: inasoma hali halisi, inaonyesha kitendo kinachohusika na
   ROLE + STATUS, kisha inaita backend iliyopo.

   Vitendo vinavyotumika (vyote vipo tayari):
     window.skhCustodyGenerateToken(rideId, kind)
     window.skhCustodyReadToken(rideId, kind)
     window.skhCustodyConfirmTransporterPickup(rideId, token, ...)
     window.skhCustodyStartTransit(rideId)
     window.skhCustodyCompleteDelivery(rideId, transferCode, ...)
     window.skhChatSubmitNegotiationProposal(...)   (majadiliano)
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }
    function esc(s) { return skh.skhEscape ? skh.skhEscape(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''; }
    function money(v) {
        var n = Number(v);
        if (!isFinite(n) || n <= 0) return 'Maelewano';
        return 'TSh ' + Math.round(n).toLocaleString('en-US');
    }
    function myUid() { return (skh.currentUser && skh.currentUser.uid) || null; }

    /* ========================================================================
       1) MUKTADHA — tunatafuta transport record inayohusiana na mazungumzo
       ======================================================================== */
    function ctx() {
        var core = skh.chatCore || {};
        var rel = (core.conv && core.conv.related) || skh.chatRelated || {};
        var nego = skh.negoCurrent || null;

        var rideId = rel.transportId || rel.rideId || rel.deliveryId ||
                     (nego && (nego.transportId || nego.rideId)) || null;
        if (!rideId && nego && nego.commerceType === 'transport') rideId = nego.productId || null;
        return {
            rideId: rideId,
            orderId: rel.orderId || (nego && nego.orderId) || null,
            nego: nego,
            conv: core.conv || null,
            partnerUid: core.partnerUid || null
        };
    }

    var cache = { id: null, data: null, at: 0 };

    async function loadRide(rideId) {
        if (!rideId || !skh.db) return null;
        if (cache.id === rideId && Date.now() - cache.at < 4000) return cache.data;
        var cols = ['ride_requests', 'shipments'];
        for (var i = 0; i < cols.length; i++) {
            try {
                var s = await skh.getDoc(skh.doc(skh.db, cols[i], rideId));
                if (s && s.exists && s.exists()) {
                    var d = Object.assign({ id: rideId, __col: cols[i] }, s.data());
                    cache = { id: rideId, data: d, at: Date.now() };
                    return d;
                }
            } catch (e) { /* jaribu collection nyingine */ }
        }
        return null;
    }
    function bust() { cache = { id: null, data: null, at: 0 }; }

    /* ========================================================================
       2) ROLE + STATUS (§15, §16)
       ======================================================================== */
    function roleOf(ride) {
        var me = myUid();
        if (!me || !ride) return 'viewer';
        if (ride.driverId === me || ride.transporterId === me || ride.acceptedDriverId === me) return 'transporter';
        if (ride.userId === me || ride.senderId === me || ride.customerId === me) return 'sender';
        if (ride.receiverId === me) return 'receiver';
        // Kama sijulikani lakini nipo kwenye mazungumzo: mmiliki wa tangazo = transporter
        var c = skh.chatCore || {};
        if (c.partnerUid && ride.userId === c.partnerUid) return 'sender';
        return 'viewer';
    }

    function statusOf(ride, nego) {
        var s = String((ride && ride.status) || '').toLowerCase();
        if (s) {
            if (['completed', 'closed'].indexOf(s) !== -1) return 'COMPLETED';
            if (['delivered', 'arrived'].indexOf(s) !== -1) return 'DELIVERED';
            if (['in_transit', 'transit', 'on_the_way'].indexOf(s) !== -1) return 'IN_TRANSIT';
            if (['picked_up', 'pickup_confirmed', 'collected'].indexOf(s) !== -1) return 'PICKED_UP';
            if (['paid', 'payment_confirmed'].indexOf(s) !== -1) return 'PAID';
            if (['accepted', 'confirmed'].indexOf(s) !== -1) {
                return (ride.paidAt || ride.escrowId || ride.paymentStatus === 'paid') ? 'PAID' : 'CONFIRMED';
            }
            if (['disputed'].indexOf(s) !== -1) return 'DISPUTED';
            if (['cancelled', 'canceled', 'rejected'].indexOf(s) !== -1) return 'CANCELLED';
        }
        // Rudi kwenye hali ya majadiliano
        var ns = String((nego && nego.currentState) || '').toUpperCase();
        if (ns === 'AGREEMENT' || ns === 'FINAL_AGREEMENT') return 'ACCEPTED';
        if (ns === 'ORDER_CREATED') return 'CONFIRMED';
        if (ns === 'REJECTED' || ns === 'CANCELLED') return 'CANCELLED';
        if (ns) return 'NEGOTIATING';
        return ride ? 'NEGOTIATING' : null;
    }

    var STATUS_LABEL = {
        NEGOTIATING: ['Inajadiliwa', 'pending'],
        ACCEPTED:    ['Ofa imekubaliwa', 'info'],
        CONFIRMED:   ['Imethibitishwa', 'info'],
        PAID:        ['Malipo yamethibitishwa', 'completed'],
        PICKED_UP:   ['Mzigo umechukuliwa', 'info'],
        IN_TRANSIT:  ['Safarini', 'info'],
        DELIVERED:   ['Imefikishwa', 'completed'],
        COMPLETED:   ['Imekamilika', 'completed'],
        DISPUTED:    ['Mgogoro', 'failed'],
        CANCELLED:   ['Imeghairiwa', 'failed']
    };

    /* ========================================================================
       3) KADI YA MUKTADHA + VITENDO (§1, §12, §18)
       ======================================================================== */
    function cardHtml(ride, nego, status, role, tokenView) {
        var lbl = STATUS_LABEL[status] || [status, 'neutral'];
        // [GLOSS EXT 2026-09] Label itokane glossary ya i18n; map ya zamani ni fallback.
        try { if (window.skhGloss) lbl = [window.skhGloss(status, 'delivery', lbl[0]), lbl[1]]; } catch (eG) {}
        var from = ride.pickupRegion || ride.fromLocation || (ride.route && ride.route.from) || '—';
        var to   = ride.destinationRegion || ride.toLocation || (ride.route && ride.route.to) || '—';
        var cargo = ride.cargoName || ride.packageDescription || ride.cargoDescription || '';
        var price = (nego && (nego.currentUnitPrice || nego.currentTotal)) || ride.agreedPrice || ride.fare || ride.price;

        var h = '<div class="tx-card">';
        h += '<div class="tx-head">'
           +   '<span class="tx-kind">' + ico('truck', 13) + ' '
           +   (ride.orderId ? 'Usafiri wa Oda #' + esc(String(ride.orderId).slice(0, 8)) : 'Ombi la Usafiri')
           +   '</span>'
           +   '<span class="sh-badge sh-badge--' + lbl[1] + '">' + esc(lbl[0]) + '</span>'
           + '</div>';

        h += '<div class="tx-route">' + esc(from) + ' <span>' + ico('arrow-right', 13) + '</span> ' + esc(to) + '</div>';

        var rows = [];
        if (cargo) rows.push(['Mzigo', cargo]);
        if (ride.vehicleType) rows.push(['Chombo', ride.vehicleType]);
        if (Number(price) > 0) rows.push(['Bei', money(price)]);
        if (ride.pickupDate) rows.push(['Kuchukua', ride.pickupDate]);
        if (rows.length) {
            h += '<div class="tx-rows">' + rows.map(function (r) {
                return '<div class="tx-row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
            }).join('') + '</div>';
        }

        // ---- TOKEN (§6, §7, §18): sender anaona, transporter anaingiza ----
        if (tokenView && tokenView.code) {
            h += '<div class="tx-token">'
               +   '<div class="tx-token-h">' + ico('key', 13) + ' Namba ya Kuchukua</div>'
               +   '<div class="tx-token-code">' + esc(String(tokenView.code).split('').join(' ')) + '</div>'
               +   '<div class="tx-token-ctx">' + esc(from) + ' &rarr; ' + esc(to) + (cargo ? ' · ' + esc(cargo) : '') + '</div>'
               +   '<button type="button" class="sh-btn sh-btn--secondary sh-btn--sm" onclick="window.skhTxCopyToken(\'' + esc(tokenView.code) + '\')">'
               +     ico('clipboard', 14) + ' Nakili</button>'
               + '</div>';
        }

        h += '<div class="tx-actions">' + actionsHtml(status, role, ride) + '</div>';
        return h + '</div>';
    }

    /** Vitendo kulingana na HALI + NAFASI (§16) — si buttons 10 kwa wakati mmoja */
    function actionsHtml(status, role, ride) {
        var A = [];
        function btn(label, fn, kind, iconName) {
            A.push('<button type="button" class="sh-btn ' + (kind || 'sh-btn--secondary') + ' sh-btn--sm" onclick="' + fn + '">'
                 + (iconName ? ico(iconName, 14) : '') + ' ' + esc(label) + '</button>');
        }

        if (status === 'NEGOTIATING') {
            if (role === 'transporter') {
                btn('Kubali Ofa', 'window.skhTxAccept()', 'sh-btn--primary', 'check');
                btn('Toa Ofa Mpya', 'window.skhTxCounter()', 'sh-btn--secondary', 'edit');
                btn('Kataa', 'window.skhTxReject()', 'sh-btn--ghost', 'x');
            } else {
                btn('Toa Ofa Mpya', 'window.skhTxCounter()', 'sh-btn--secondary', 'edit');
                btn('Ghairi Ombi', 'window.skhTxReject()', 'sh-btn--ghost', 'x');
            }
        } else if (status === 'ACCEPTED') {
            if (role === 'transporter') btn('Thibitisha Usafirishaji', 'window.skhTxConfirm()', 'sh-btn--primary', 'check');
            else A.push('<div class="tx-wait">' + ico('clock', 13) + ' Inasubiri msafirishaji athibitishe…</div>');
        } else if (status === 'CONFIRMED') {
            if (role === 'sender') btn('Lipa kwa SokoPay', 'window.skhTxPay()', 'sh-btn--primary', 'wallet');
            else A.push('<div class="tx-wait">' + ico('clock', 13) + ' Inasubiri malipo ya mtumaji…</div>');
        } else if (status === 'PAID') {
            if (role === 'sender') btn('Onyesha Namba ya Kuchukua', 'window.skhTxShowToken()', 'sh-btn--primary', 'key');
            else if (role === 'transporter') btn('Ingiza Namba ya Kuchukua', 'window.skhTxEnterToken()', 'sh-btn--primary', 'key');
        } else if (status === 'PICKED_UP') {
            if (role === 'transporter') btn('Anza Safari', 'window.skhTxStartTransit()', 'sh-btn--primary', 'truck');
            else btn('Fuatilia Safari', 'window.skhTxTrack()', 'sh-btn--secondary', 'map');
        } else if (status === 'IN_TRANSIT') {
            if (role === 'transporter') btn('Thibitisha Kufikisha', 'window.skhTxDeliver()', 'sh-btn--primary', 'check');
            else btn('Fuatilia Safari', 'window.skhTxTrack()', 'sh-btn--secondary', 'map');
        } else if (status === 'DELIVERED') {
            if (role === 'receiver' || role === 'sender') btn('Thibitisha Nimepokea', 'window.skhTxConfirmDelivery()', 'sh-btn--success', 'check');
            else A.push('<div class="tx-wait">' + ico('clock', 13) + ' Inasubiri mpokeaji athibitishe…</div>');
        } else if (status === 'COMPLETED') {
            A.push('<div class="tx-done">' + ico('check', 14) + ' Safari imekamilika</div>');
        }
        return A.join('');
    }

    /* ========================================================================
       4) RENDER — inaingizwa juu ya chat, bila kuvunja anchor iliyopo
       ======================================================================== */
    function host() {
        var el = $('skhTxPanel');
        if (el) return el;
        var msgs = $('chatMessages');
        if (!msgs || !msgs.parentNode) return null;
        el = document.createElement('div');
        el.id = 'skhTxPanel';
        el.className = 'tx-panel';
        msgs.parentNode.insertBefore(el, msgs);
        return el;
    }

    var busy = false;
    window.skhTxRender = async function () {
        var el = host(); if (!el) return;
        var c = ctx();
        if (!c.rideId) { el.style.display = 'none'; el.innerHTML = ''; return; }
        if (busy) return; busy = true;
        try {
            var ride = await loadRide(c.rideId);
            if (!ride) { el.style.display = 'none'; el.innerHTML = ''; return; }

            var role = roleOf(ride);
            var status = statusOf(ride, c.nego);
            var tokenView = null;

            // Token inaonekana kwa MHUSIKA pekee (§7) — sender, baada ya malipo
            if (role === 'sender' && ['PAID', 'PICKED_UP'].indexOf(status) !== -1) {
                if (typeof window.skhCustodyReadToken === 'function') {
                    try {
                        var t = await window.skhCustodyReadToken(ride.id, 'pickup');
                        if (t && (t.code || t.token)) tokenView = { code: t.code || t.token };
                    } catch (e) { /* token bado haijatolewa */ }
                }
            }

            el.innerHTML = cardHtml(ride, c.nego, status, role, tokenView);
            el.style.display = 'block';
            el.dataset.ride = ride.id;
            el.dataset.status = status;
            el.dataset.role = role;
        } catch (e) {
            console.warn('[tx-inbox]', e && e.message);
        } finally { busy = false; }
    };

    function currentRide() {
        var el = $('skhTxPanel');
        return el ? el.dataset.ride : null;
    }

    /* ========================================================================
       5) VITENDO — kila kimoja kinaita BACKEND iliyopo (§14)
       ======================================================================== */
    window.skhTxCopyToken = function (code) {
        try { navigator.clipboard.writeText(String(code)); skhToast('Namba imenakiliwa.', 'success', 1800); }
        catch (e) { skhToast('Namba: ' + code, 'info', 4000); }
    };

    window.skhTxCounter = function () {
        // Tumia fomu ya majadiliano ILIYOPO (38-negotiation-form.js)
        if (typeof window.skhNegoFormOpen === 'function') {
            var c = ctx();
            window.skhNegoFormOpen({ type: 'transport', entity: { id: c.rideId, collection: 'ride_requests' } });
        } else skhToast('Fomu ya majadiliano haipatikani kwa sasa.', 'error');
    };

    window.skhTxAccept = async function () {
        var ok = await skhConfirm('Unakubali ofa hii ya usafirishaji?',
            { title: 'Kubali ofa', okText: 'Ndiyo, kubali', cancelText: 'Ghairi' });
        if (!ok) return;
        await runNego('ACCEPT_OFFER', 'Ofa imekubaliwa.');
    };

    window.skhTxReject = async function () {
        var ok = await skhConfirm('Una uhakika unataka kukataa?',
            { title: 'Kataa ofa', okText: 'Ndiyo, kataa', cancelText: 'Ghairi' });
        if (!ok) return;
        await runNego('REJECT_OFFER', 'Ofa imekataliwa.');
    };

    async function runNego(command, okMsg) {
        var n = skh.negoCurrent;
        if (!n || !n.negotiationId) { skhToast('Hakuna majadiliano yanayoendelea.', 'info'); return; }
        skhBusy(true, 'Inatuma…');
        try {
            if (typeof window.skhNegoRunCommand === 'function') {
                await window.skhNegoRunCommand(n.negotiationId, command, {});
            } else if (typeof window.skhChatNegotiationCommand === 'function') {
                await window.skhChatNegotiationCommand(command, {});
            } else throw new Error('command_unavailable');
            skhBusy(false); skhToast(okMsg, 'success');
            bust(); window.skhTxRender();
        } catch (e) {
            skhBusy(false);
            skhToast('Imeshindikana kwa sasa. Jaribu tena.', 'error', 3000);
            console.warn('[tx-nego]', e);
        }
    }

    /** Confirm Transport — inaonyesha kadi ya uthibitisho kwanza (§2) */
    window.skhTxConfirm = async function () {
        var rideId = currentRide(); if (!rideId) return;
        var ride = await loadRide(rideId); if (!ride) return;
        var from = ride.pickupRegion || ride.fromLocation || '—';
        var to = ride.destinationRegion || ride.toLocation || '—';
        var price = ride.agreedPrice || ride.fare || ride.price;

        var ok = await skhConfirm(
            'Bei iliyokubaliwa: ' + money(price) + '\n' +
            'Kuchukua: ' + from + '\n' +
            'Kupeleka: ' + to,
            { title: 'Thibitisha usafirishaji', okText: 'Thibitisha', cancelText: 'Ghairi' });
        if (!ok) return;

        skhBusy(true, 'Inathibitisha…');
        try {
            await skh.updateDoc(skh.doc(skh.db, ride.__col, rideId), {
                status: 'accepted',
                confirmedAt: new Date().toISOString(),
                confirmedBy: myUid()
            });
            await sysMsg('Msafirishaji amethibitisha usafirishaji.\nBei: ' + money(price) +
                         '\nKuchukua: ' + from + '\nKupeleka: ' + to);
            skhBusy(false); skhToast('Umethibitisha usafirishaji.', 'success');
            bust(); window.skhTxRender();
        } catch (e) {
            skhBusy(false); skhToast('Imeshindikana kuthibitisha.', 'error');
            console.warn('[tx-confirm]', e);
        }
    };

    /** Payment — SokoPay ndiyo source of truth (§4) */
    window.skhTxPay = async function () {
        var rideId = currentRide(); if (!rideId) return;
        var ride = await loadRide(rideId);
        var amount = (ride && (ride.agreedPrice || ride.fare || ride.price)) || 0;
        if (typeof window.skhOpenSokoPayFor === 'function') {
            window.skhOpenSokoPayFor({ type: 'transport', refId: rideId, amount: amount });
        } else if (typeof window.showForm === 'function') {
            window.closeModals && window.closeModals();
            window.showForm('sokopayForm');
            skhToast('Kamilisha malipo ya ' + money(amount) + ' kwa usafirishaji.', 'info', 4000);
        } else {
            skhToast('Mfumo wa malipo haupatikani kwa sasa.', 'error');
        }
    };

    /** Sender: onyesha token (inatolewa na backend ikiwa bado) */
    window.skhTxShowToken = async function () {
        var rideId = currentRide(); if (!rideId) return;
        skhBusy(true, 'Inapata namba…');
        try {
            var t = null;
            if (typeof window.skhCustodyReadToken === 'function') {
                t = await window.skhCustodyReadToken(rideId, 'pickup');
            }
            if ((!t || !(t.code || t.token)) && typeof window.skhCustodyGenerateToken === 'function') {
                t = await window.skhCustodyGenerateToken(rideId, 'pickup');
            }
            skhBusy(false);
            if (t && (t.code || t.token)) { bust(); window.skhTxRender(); }
            else skhToast('Namba bado haijatolewa. Hakikisha malipo yamekamilika.', 'info', 3500);
        } catch (e) {
            skhBusy(false); skhToast('Imeshindikana kupata namba kwa sasa.', 'error');
        }
    };

    /** Transporter: ingiza token (§8) */
    window.skhTxEnterToken = async function () {
        var rideId = currentRide(); if (!rideId) return;
        var code = await skhPrompt('Ingiza namba ya kuchukua uliyopewa na mtumaji:', '',
            { title: 'Namba ya kuchukua', placeholder: '000000', type: 'tel' });
        if (!code) return;
        skhBusy(true, 'Inathibitisha…');
        try {
            if (typeof window.skhCustodyConfirmTransporterPickup !== 'function') throw new Error('no_backend');
            var r = await window.skhCustodyConfirmTransporterPickup(rideId, String(code).trim(), 'good', '', null, null);
            skhBusy(false);
            if (r && r.ok === false) { skhToast(r.error || 'Namba si sahihi.', 'error', 3000); return; }
            await sysMsg('Mzigo umechukuliwa. Namba imethibitishwa.');
            skhToast('Umethibitisha kuchukua mzigo.', 'success');
            bust(); window.skhTxRender();
        } catch (e) {
            skhBusy(false); skhToast('Namba si sahihi au imeshatumika.', 'error', 3000);
        }
    };

    window.skhTxStartTransit = async function () {
        var rideId = currentRide(); if (!rideId) return;
        skhBusy(true, 'Inaanza safari…');
        try {
            if (typeof window.skhCustodyStartTransit === 'function') await window.skhCustodyStartTransit(rideId);
            else await skh.updateDoc(skh.doc(skh.db, 'ride_requests', rideId), { status: 'in_transit' });
            await sysMsg('Safari imeanza.');
            skhBusy(false); skhToast('Safari imeanza.', 'success');
            bust(); window.skhTxRender();
        } catch (e) { skhBusy(false); skhToast('Imeshindikana kuanza safari.', 'error'); }
    };

    window.skhTxDeliver = async function () {
        var rideId = currentRide(); if (!rideId) return;
        var code = await skhPrompt('Ingiza namba ya kufikisha (kama mpokeaji amekupa):', '',
            { title: 'Thibitisha kufikisha', placeholder: 'Hiari' });
        skhBusy(true, 'Inathibitisha…');
        try {
            if (typeof window.skhCustodyCompleteDelivery === 'function') {
                await window.skhCustodyCompleteDelivery(rideId, code ? String(code).trim() : null, null, {});
            } else {
                await skh.updateDoc(skh.doc(skh.db, 'ride_requests', rideId), { status: 'delivered' });
            }
            await sysMsg('Mzigo umefikishwa. Inasubiri uthibitisho wa mpokeaji.');
            skhBusy(false); skhToast('Umethibitisha kufikisha.', 'success');
            bust(); window.skhTxRender();
        } catch (e) { skhBusy(false); skhToast('Imeshindikana kuthibitisha.', 'error'); }
    };

    window.skhTxConfirmDelivery = async function () {
        var rideId = currentRide(); if (!rideId) return;
        var ok = await skhConfirm('Unathibitisha umepokea mzigo wako salama?',
            { title: 'Thibitisha kupokea', okText: 'Ndiyo, nimepokea', cancelText: 'Ghairi' });
        if (!ok) return;
        skhBusy(true, 'Inakamilisha…');
        try {
            // [PHASE 2 P6] Kukamilisha safari ni kwa SERVER (deliveryComplete) —
            // rules haziruhusu tena kivinjari kuandika status 'completed'.
            if (typeof window.skhCustodyCompleteDelivery !== 'function') throw new Error('server_unavailable');
            var tc = null;
            try { tc = window.skhCustodyReadToken ? await window.skhCustodyReadToken(rideId, 'transfer') : null; } catch (e2) { tc = null; }
            var r = await window.skhCustodyCompleteDelivery(rideId, tc || null, null, {});
            if (!r || r.ok === false) throw new Error((r && r.error) || 'failed');
            await sysMsg('Mpokeaji amethibitisha. Safari imekamilika.');
            skhBusy(false); skhToast('Asante! Safari imekamilika.', 'success');
            bust(); window.skhTxRender();
        } catch (e) { skhBusy(false); skhToast('Imeshindikana kukamilisha.', 'error'); }
    };

    window.skhTxTrack = function () {
        var rideId = currentRide();
        if (typeof window.openTrackingModal === 'function') window.openTrackingModal(rideId);
        else if (typeof window.skhOpenTracking === 'function') window.skhOpenTracking(rideId);
        else skhToast('Ufuatiliaji unapatikana kwenye ukurasa wa Usafiri.', 'info', 3000);
    };

    /** Ujumbe wa mfumo ndani ya mazungumzo (§17) — si mtumiaji kuandika */
    async function sysMsg(text) {
        try {
            var core = skh.chatCore || {};
            if (!core.convId || !skh.db) return;
            await skh.addDoc(skh.collection(skh.db, 'conversations/' + core.convId + '/messages'), {
                text: text,
                senderId: 'system',
                system: true,
                type: 'transport_event',
                createdAt: new Date().toISOString()
            });
        } catch (e) { /* si lazima */ }
    }

    /* ========================================================================
       6) UNGANISHA — onyesha upya mazungumzo yakibadilika
       ======================================================================== */
    function hook() {
        ['skhChatOpen', 'skhOpenChat', 'openChatWith'].forEach(function (fn) {
            if (typeof window[fn] !== 'function' || window[fn].__tx) return;
            var orig = window[fn];
            var wrapped = function () {
                var r = orig.apply(this, arguments);
                setTimeout(function () { bust(); window.skhTxRender(); }, 900);
                setTimeout(function () { window.skhTxRender(); }, 2600);
                return r;
            };
            wrapped.__tx = true;
            window[fn] = wrapped;
        });
    }
    hook();
    setTimeout(hook, 1500);
    setTimeout(hook, 4000);

    // Mabadiliko ya negotiation yanapofika, sasisha kadi
    document.addEventListener('skh:nego-updated', function () { bust(); window.skhTxRender(); });

    /* Kwa upimaji: fichua mantiki safi (haina DOM wala Firestore) */
    window.__skhTxLogic = { roleOf: roleOf, statusOf: statusOf, actionsHtml: actionsHtml };
})();

/* ============================================================================
   TRANSPORT OFFER LAUNCHER  (§8, §9, §11)
   ----------------------------------------------------------------------------
   Msafirishaji anapoona ombi kwenye orodha ya kazi, sasa anaweza KUTOA OFA
   badala ya kulazimika kukubali nauli kama ilivyo.

   Tunatumia injini ILIYOPO:
     skhNegoFormOpen({type:'transport'})  -> 38-negotiation-form.js
     -> skhChatSubmitNegotiationProposal  -> 34-chat-core.js
     -> negotiation FSM                   -> 37-negotiation.js
   Hakuna negotiation system mpya.
   ============================================================================ */
(function () {
    'use strict';
    var skh = window.skh || {};

    window.skhTransportOffer = async function (rideId) {
        if (!rideId) return;
        if (skh.requireAuth && !skh.requireAuth()) return;

        skhBusy(true, 'Inafungua majadiliano…');
        var ride = null;
        try {
            var cols = ['ride_requests', 'shipments'];
            for (var i = 0; i < cols.length && !ride; i++) {
                var sn = await skh.getDoc(skh.doc(skh.db, cols[i], rideId));
                if (sn && sn.exists && sn.exists()) {
                    ride = Object.assign({ id: rideId, collection: cols[i] }, sn.data());
                }
            }
        } catch (e) { /* tutaonyesha kosa chini */ }
        skhBusy(false);

        if (!ride) {
            if (window.skhShowErr) {
                window.skhShowErr(new Error('not-found'),
                    { fn: 'transportOffer', entityId: rideId, collection: 'ride_requests' });
            } else skhToast('Ombi hili halipatikani tena.', 'error');
            return;
        }

        var me = (window.skhOwnerId ? window.skhOwnerId() : null) ||
                 (skh.currentUser && skh.currentUser.uid);
        var owner = ride.userId || ride.customerId || ride.requesterId || null;
        if (owner && owner === me) {
            skhToast('Huwezi kujitolea ofa kwenye ombi lako mwenyewe.', 'info', 3200);
            return;
        }
        if (ride.driverId && ride.driverId !== me) {
            skhToast('Kazi hii tayari imechukuliwa na msafirishaji mwingine.', 'info', 3500);
            return;
        }

        if (typeof window.skhNegoFormOpen !== 'function') {
            skhToast('Fomu ya majadiliano haipatikani kwa sasa.', 'error');
            return;
        }
        // Fomu iliyopo inajua kushughulikia type='transport'
        window.skhNegoFormOpen({
            type: 'transport',
            entity: {
                id: ride.id,
                collection: ride.collection || 'ride_requests',
                collectionName: ride.collection || 'ride_requests',
                title: ride.cargoName || ride.itemTitle || 'Usafirishaji',
                fare: ride.fare != null ? ride.fare : ride.price,
                price: ride.price != null ? ride.price : ride.fare,
                route: {
                    from: ride.fromLocation || ride.pickupRegion || '',
                    to: ride.toLocation || ride.destinationRegion || ''
                },
                fromLocation: ride.fromLocation || ride.pickupRegion || '',
                toLocation: ride.toLocation || ride.destinationRegion || '',
                packageDescription: ride.cargoDescription || ride.cargoName || '',
                weight: ride.cargoWeight != null ? ride.cargoWeight : ride.weight,
                vehicleType: ride.vehicleType || '',
                sellerId: owner,                       // mpokeaji wa ofa = mwenye ombi
                sellerName: ride.senderName || ride.customerName || ride.ownerName || ''
            }
        });
    };
})();

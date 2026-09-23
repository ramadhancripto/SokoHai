/* ============================================================================
   SOKOHAI — INBOX → CHECKOUT BRIDGE + PAYMENT MODE
   ----------------------------------------------------------------------------
   AUDIT ILIYOFANYIKA KWANZA (STEP 1) — kilichokuwepo, HAKIKUREPEWA:

     js/app/43-delivery-choice.js — INJINI YA DELIVERY IPO TAYARI:
        • skhDeliverySectionHtml()  — swali la Ndiyo/Hapana (§5) LIPO
        • skhDeliverySetRequired()  — chaguo la mtumiaji
        • skhDeliveryOpenPicker()   — kuchagua mtoa usafiri halisi
        • skhDeliveryPayloadFor()   — payload ya transport request
        • injectIntoCart()          — huingiza sehemu hiyo kwenye cart
        • Bei zimetenganishwa: "Malipo ya bidhaa na nauli ya usafiri vimetengwa"
     js/app/53-test-sandbox.js — simulator + escrow/wallet (ipo)
     js/app/55-escrow-guard.js — masharti ya release (ipo)
     js/app/52-transport-inbox.js — vitendo vya usafiri Inbox (ipo)
     js/app/33-custody.js — tokens, legs, handoff, currentCustodian (ipo)

   PENGO HALISI (§3, §4, §9):
     "LIPA" ya Inbox ilikuwa inaruka checkout — `skhChatPayNegoOrder()`
     inakwenda moja kwa moja PesaPal/DEMO, na `skhTxPay()` inafungua
     sokopayForm. Kwa hiyo mtumiaji HAKUWAHI kuulizwa swali la usafirishaji,
     wala kuona muhtasari wa oda kabla ya kulipa.

   FAILI HII: DARAJA pekee. Inaelekeza LIPA → Checkout (ambapo injini ya
   delivery iliyopo inafanya kazi yake), kisha malipo yanaendelea kwa njia
   ILIYOPO. Hakuna payment/cart/transport system mpya.
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''; }
    function esc(s) { return skh.skhEscape ? skh.skhEscape(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function money(v) {
        var n = Number(v); if (!isFinite(n) || n <= 0) return 'TSh 0';
        return 'TSh ' + Math.round(n).toLocaleString('en-US');
    }
    function byId(id) { return document.getElementById(id); }

    /* ========================================================================
       1) PAYMENT MODE (§2) — TEST vs LIVE, bila kuchanganya rekodi
       ======================================================================== */
    window.skhPaymentMode = function () {
        try {
            if (window.skhSandbox && window.skhSandbox.isOn && window.skhSandbox.isOn()) return 'TEST';
        } catch (e) {}
        if (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.DEMO_MODE) return 'TEST';
        return 'LIVE';
    };

    /* ========================================================================
       2) CHECKOUT CONTEXT (§8) — metadata, si cart mpya
       ======================================================================== */
    var CTX_KEY = 'skh_checkout_context';

    window.skhCheckoutContext = function () {
        try { return JSON.parse(sessionStorage.getItem(CTX_KEY) || 'null'); } catch (e) { return null; }
    };
    function setCtx(c) {
        try { sessionStorage.setItem(CTX_KEY, JSON.stringify(c || {})); } catch (e) {}
    }
    window.skhCheckoutClear = function () {
        try { sessionStorage.removeItem(CTX_KEY); } catch (e) {}
    };

    /* ========================================================================
       3) LIPA → CHECKOUT (§3, §4, §9)
       ------------------------------------------------------------------------
       Badala ya kwenda gateway moja kwa moja, tunaonyesha muhtasari wa oda
       PAMOJA na swali la usafirishaji (injini ya 43-delivery-choice.js).
       ======================================================================== */
    window.skhOpenOrderCheckout = async function (opts) {
        opts = opts || {};
        var order = opts.order || skh.negoOrder || null;
        var nego  = opts.nego  || skh.negoCurrent || null;

        var orderId = opts.orderId || (order && (order.orderId || order.id)) || null;
        var title = opts.title || (order && order.itemTitle) ||
                    (nego && (nego.productTitle || nego.serviceTitle || nego.transportTitle)) || 'Oda';
        var qty = Number(opts.quantity || (order && order.quantity) || (nego && nego.quantity) || 1);
        var unit = Number(opts.unitPrice || (order && order.unitPrice) ||
                          (nego && nego.currentUnitPrice) || 0);
        var productTotal = Number(opts.amount || (order && order.amount) || (unit * qty)) || 0;
        if (!(productTotal > 0)) {
            skhToast('Bei ya oda haijapatikana.', 'error');
            return;
        }
        var commerceType = (nego && nego.commerceType) || opts.type || 'product';

        setCtx({
            orderId: orderId,
            negotiationId: (nego && nego.negotiationId) || (order && order.negotiationId) || null,
            conversationId: (nego && nego.conversationId) || (skh.chatCore && skh.chatCore.convId) || null,
            sellerId: (order && order.sellerId) || (nego && nego.sellerId) || null,
            commerceType: commerceType,
            title: title, quantity: qty, unitPrice: unit,
            productTotal: productTotal,          // §6 — bei ya bidhaa PEKEE
            deliveryFee: 0,                      // §6 — nauli inatenganishwa
            grandTotal: productTotal,
            deliveryRequired: null,              // bado hajachagua
            paymentMode: window.skhPaymentMode(),
            createdAt: new Date().toISOString()
        });

        renderSheet();
    };

    /* ========================================================================
       4) KARATASI YA CHECKOUT
       ======================================================================== */
    function renderSheet() {
        var c = window.skhCheckoutContext();
        if (!c) return;
        var old = byId('skhCheckoutSheet');
        if (old) old.remove();

        // Usafirishaji unahusika kwa BIDHAA pekee (huduma/usafiri hazihitaji)
        var canDeliver = c.commerceType === 'product';
        var dSection = '';
        if (canDeliver && typeof window.skhDeliverySectionHtml === 'function') {
            // Tunatumia INJINI ILIYOPO (43-delivery-choice.js) — si UI mpya
            dSection = '<div id="skhCoDelivery">' + window.skhDeliverySectionHtml() + '</div>';
        }

        var host = document.createElement('div');
        host.id = 'skhCheckoutSheet';
        host.className = 'co-modal';
        host.innerHTML =
          '<div class="co-sheet">' +
            '<div class="co-head">' +
              '<button type="button" class="co-back" aria-label="Rudi">' + ico('arrow-left', 18) + '</button>' +
              '<b>Kamilisha Oda</b>' +
              '<button type="button" class="co-x" aria-label="Funga">' + ico('x', 18) + '</button>' +
            '</div>' +

            (c.paymentMode === 'TEST'
              ? '<div class="co-testbar">' + ico('alert', 13) + ' HALI YA MAJARIBIO — hakuna pesa halisi</div>' : '') +

            '<div class="co-sec">Muhtasari wa oda</div>' +
            '<div class="co-item">' +
              '<div class="co-item-t">' + esc(c.title) + '</div>' +
              '<div class="co-item-m">Idadi: ' + c.quantity +
                 (c.unitPrice ? ' · ' + money(c.unitPrice) + ' kwa kimoja' : '') + '</div>' +
            '</div>' +

            dSection +

            '<div class="co-sec">Malipo</div>' +
            '<div class="co-totals" id="skhCoTotals">' + totalsHtml(c) + '</div>' +

            '<button type="button" class="sh-btn sh-btn--primary sh-btn--block co-pay" id="skhCoPay">' +
              ico('wallet', 16) + ' Endelea Kulipa ' +
              '<span id="skhCoPayAmt">' + money(c.grandTotal) + '</span></button>' +
            '<p class="co-note">' + ico('shield-check', 12) +
              ' Fedha zinalindwa na SokoPay Escrow hadi upokee.</p>' +
          '</div>';
        document.body.appendChild(host);
        document.body.style.overflow = 'hidden';

        function close() { host.remove(); document.body.style.overflow = 'auto'; }
        host.querySelector('.co-x').addEventListener('click', close);
        host.querySelector('.co-back').addEventListener('click', close);
        host.addEventListener('click', function (e) { if (e.target === host) close(); });
        host.querySelector('#skhCoPay').addEventListener('click', function () {
            proceed(this);
        });

        // Delivery section ikibadilika, sasisha jumla
        if (canDeliver) {
            host.addEventListener('change', function (e) {
                if (e.target && e.target.name === 'skhDcRadio') {
                    setTimeout(refresh, 60);
                }
            });
        }
    }

    function totalsHtml(c) {
        var rows = '<div class="co-row"><span>Bidhaa</span><b>' + money(c.productTotal) + '</b></div>';
        if (c.deliveryRequired === true) {
            rows += '<div class="co-row"><span>Usafirishaji</span><b>' +
                    (c.deliveryFee > 0 ? money(c.deliveryFee)
                                       : '<i class="co-tbd">Itapangwa na mtoa usafiri</i>') + '</b></div>';
        } else if (c.deliveryRequired === false) {
            rows += '<div class="co-row"><span>Usafirishaji</span><b class="co-none">Hauhitajiki</b></div>';
        }
        rows += '<div class="co-row co-grand"><span>Jumla ya kulipa sasa</span><b>' +
                money(c.grandTotal) + '</b></div>';
        if (c.deliveryRequired === true) {
            rows += '<div class="co-hint">' + ico('alert', 12) +
                    ' Nauli ya usafiri hulipwa kwa mtoa usafiri baada ya kukubaliana — si sasa.</div>';
        }
        return rows;
    }

    /** Sasisha jumla kutokana na hali ya injini ya delivery */
    function refresh() {
        var c = window.skhCheckoutContext();
        if (!c) return;
        var d = (typeof window.skhDeliveryState === 'function') ? window.skhDeliveryState() : null;
        if (d && d.chosen) c.deliveryRequired = !!d.required;
        // §6 — bei ya bidhaa na nauli HAZICHANGANYWI
        c.grandTotal = c.productTotal;
        setCtx(c);
        var box = byId('skhCoTotals');
        if (box) box.innerHTML = totalsHtml(c);
        var amt = byId('skhCoPayAmt');
        if (amt) amt.textContent = money(c.grandTotal);
        var sec = byId('skhCoDelivery');
        if (sec && typeof window.skhDeliverySectionHtml === 'function') {
            sec.innerHTML = window.skhDeliverySectionHtml();
        }
    }
    window.skhCheckoutRefresh = refresh;

    /* ========================================================================
       5) ENDELEA KULIPA — kupitia njia ILIYOPO (§1, §36)
       ======================================================================== */
    async function proceed(btn) {
        var c = window.skhCheckoutContext();
        if (!c) return;

        var d = (typeof window.skhDeliveryState === 'function') ? window.skhDeliveryState() : null;
        if (c.commerceType === 'product' && d && !d.chosen) {
            skhToast('Tafadhali chagua kama unahitaji usafirishaji.', 'info', 3200);
            var sec = byId('skhCoDelivery');
            if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        c.deliveryRequired = d ? !!d.required : false;
        setCtx(c);

        // Idempotency (§31 ya spec ya awali) — mbofyo mmoja tu
        if (window.skhGuard) {
            return window.skhGuard('checkout_' + (c.orderId || 'x'), btn, function () { return doPay(c, d); });
        }
        return doPay(c, d);
    }

    async function doPay(c, d) {
        /* ---- (a) HALI YA MAJARIBIO: pitisha kwenye simulator halisi (§1) ---- */
        if (c.paymentMode === 'TEST' && typeof window.skhSimulatePayment === 'function') {
            var r = await window.skhSimulatePayment({
                amount: c.grandTotal, orderId: c.orderId, coreId: c.coreId || null, type: c.commerceType
            });
            if (!r || !r.ok) return;
            if (r.outcome !== 'successful') {
                // §35 — usiseme imefanikiwa ikiwa haijafanikiwa
                closeSheet();
                return;
            }
            await afterPaid(c, d, r.testPayId);
            return;
        }

        /* ---- (b) HALI HALISI: tumia njia ILIYOPO ya malipo ---- */
        closeSheet();
        if (typeof window.skhChatPayNegoOrder === 'function' && (skh.negoOrder || c.orderId)) {
            await window.skhChatPayNegoOrder(skh.negoOrder, skh.negoCurrent);
            // Transport request inaundwa baada ya malipo kufanikiwa
            try { await createTransportIfNeeded(c, d); } catch (e) {}
            return;
        }
        if (typeof window.showForm === 'function') {
            window.showForm('sokopayForm');
            skhToast('Kamilisha malipo ya ' + money(c.grandTotal), 'info', 4000);
        } else {
            skhToast('Mfumo wa malipo haupatikani kwa sasa.', 'error');
        }
    }

    function closeSheet() {
        var h = byId('skhCheckoutSheet');
        if (h) h.remove();
        document.body.style.overflow = 'auto';
    }

    async function afterPaid(c, d, payRef) {
        closeSheet();
        await createTransportIfNeeded(c, d);
        skhToast('Malipo yamekamilika. Oda yako inaendelea.', 'success', 3600);
        window.skhCheckoutClear();
        document.dispatchEvent(new CustomEvent('skh:order-paid', {
            detail: { orderId: c.orderId, ref: payRef, deliveryRequired: c.deliveryRequired }
        }));
    }

    /* ========================================================================
       6) TRANSPORT REQUEST (§6, §7) — tu ikiwa amechagua NDIYO
       ------------------------------------------------------------------------
       Tunatumia payload ya injini iliyopo; hatuundi mfumo mpya wa usafiri.
       ======================================================================== */
    async function createTransportIfNeeded(c, d) {
        if (!c || c.deliveryRequired !== true) return null;     // §7 — "Hapana": hakuna request
        if (!skh.db) return null;

        var payload = null;
        if (typeof window.skhDeliveryPayloadFor === 'function') {
            try { payload = window.skhDeliveryPayloadFor(c.orderId); } catch (e) {}
        }
        var st = d || {};
        var body = Object.assign({
            orderId: c.orderId || null,
            requesterId: (window.skhOwnerId ? window.skhOwnerId() : (skh.currentUser && skh.currentUser.uid)) || null,
            buyerId: (skh.currentUser && skh.currentUser.uid) || null,
            sellerId: c.sellerId || null,
            userId: (skh.currentUser && skh.currentUser.uid) || null,
            customerId: (skh.currentUser && skh.currentUser.uid) || null,
            cargoName: c.title,
            fromLocation: st.pickup || '',
            toLocation: st.destination || '',
            pickupDate: st.pickupDate || '',
            pickupTime: st.pickupTime || '',
            notes: st.notes || '',
            status: st.post ? 'pending_acceptance' : 'searching',
            driverId: (st.post && (st.post.userId || st.post.driverId)) || null,
            source: 'checkout',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, payload || {}, (window.skhEnvStamp ? window.skhEnvStamp() : {}));

        try {
            var ref = await skh.addDoc(skh.collection(skh.db, 'ride_requests'), body);
            // Unganisha na oda (§27 — traceable)
            if (c.orderId) {
                try {
                    await skh.updateDoc(skh.doc(skh.db, 'orders', c.orderId), {
                        transportRequestId: ref.id, deliveryRequired: true,
                        'delivery.status': 'requested', updatedAt: new Date().toISOString()
                    });
                } catch (e) {}
            }
            // Arifa kwa mtoa usafiri aliyechaguliwa
            if (body.driverId) {
                try {
                    await skh.addDoc(skh.collection(skh.db, 'notifications'), {
                        userId: body.driverId, title: 'Ombi jipya la usafirishaji',
                        body: c.title + ' · ' + (body.fromLocation || '') + ' → ' + (body.toLocation || ''),
                        createdAt: new Date().toISOString(), read: false, type: 'delivery'
                    });
                } catch (e) {}
            }
            skhToast('Ombi la usafirishaji limetumwa.', 'success', 3200);
            return ref.id;
        } catch (e) {
            if (window.skhShowErr) {
                window.skhShowErr(e, { fn: 'createTransportRequest', entityId: c.orderId,
                                       collection: 'ride_requests', operation: 'create' });
            }
            return null;
        }
    }
    window.skhCreateTransportFromCheckout = createTransportIfNeeded;

    /* ========================================================================
       7) FUNIKA "LIPA" ZILIZOPO — zipitie checkout (§3)
       ======================================================================== */
    function hook() {
        // (a) Malipo ya oda ya majadiliano (Inbox/chat)
        var payNego = window.skhChatPayNegoOrder;
        if (typeof payNego === 'function' && !payNego.__skhCo) {
            var wrapped = function (order, nego) {
                // Ikiwa tunaitwa KUTOKA checkout yetu, endelea moja kwa moja
                if (wrapped.__direct) { wrapped.__direct = false; return payNego.apply(this, arguments); }
                return window.skhOpenOrderCheckout({ order: order, nego: nego });
            };
            wrapped.__skhCo = true;
            wrapped.__raw = payNego;
            window.skhChatPayNegoOrder = wrapped;
            // doPay inahitaji njia ya asili
            window.skhChatPayNegoOrderRaw = payNego;
        }
    }
    // doPay itumie njia ya asili (isijirudie)
    var origDoPay = doPay;
    doPay = async function (c, d) {
        if (c.paymentMode !== 'TEST' && typeof window.skhChatPayNegoOrderRaw === 'function') {
            closeSheet();
            await window.skhChatPayNegoOrderRaw(skh.negoOrder, skh.negoCurrent);
            try { await createTransportIfNeeded(c, d); } catch (e) {}
            return;
        }
        return origDoPay(c, d);
    };

    hook();
    setTimeout(hook, 1500);
    setTimeout(hook, 4000);
})();

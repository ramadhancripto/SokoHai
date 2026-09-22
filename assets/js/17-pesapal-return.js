/* ==== js/17-pesapal-return.js ==== */
// ============================================================
// SOKOHAI PESAPAL RETURN — handler ya kurudi kutoka PesaPal.
// PesaPal inarudisha mtumiaji kwa callback URL yenye query params
// (OrderTrackingId / OrderMerchantReference). Hapa tunathibitisha
// muamala (callable 'pesapalTransactionStatus') na kumalizia
// mtiririko unaohusiana — IDEMPOTENT (haurudishi).
//
//   Nia (intents) zinazohifadhiwa kabla ya redirect:
//   - 'sokohai_pending_checkout' : oda ya mnunuzi (cart/bidhaa)
//   - 'sokohai_pending_payment'  : deposit / ada / boost / payroll / usajili
// ============================================================
(function () { 'use strict';

    var CHECKOUT_KEY = 'sokohai_pending_checkout';
    var PAYMENT_KEY = 'sokohai_pending_payment';
    var fb = null; // { db, collection, query, where, limit, getDocs, updateDoc, setDoc, getDoc, doc, addDoc, apiKey }

    window.skhPesaPalReturnRegister = function (fns) { fb = fns; };
    // Inatumika na DEMO MODE ya checkout (02-checkout.js) kumalizia oda moja kwa moja
    window.skhPesaPalFinishCheckout = finishCheckout;
    // [COMMERCE 2026-09] Malipo ya oda ya MAJADILIANO (DEMO/direct) — huweka
    // oda iliyokuwepo kwenye 'held' (escrow), haiunda oda mpya ya kikapu.
    window.skhPesaPalFinishNegotiationOrder = markNegoOrderPaid;

    // [AUDIT-FIX 2026-09-16 P0 §23/§42] Thibitisha malipo kwa SERVER
    // (callable 'pesapalTransactionStatus') KABLA ya kuandika 'paid'/'held'.
    // Awali faili hii iliandika mafanikio ya malipo ikitegemea tu URL ya kurudi —
    // browser ingeweza kufake mafanikio (user akighairi malipo PesaPal lakini
    // kurudi kwa link yenye OrderTrackingId, oda iliandikwa 'paid').
    // @returns 'verified' | 'rejected' | 'unknown' | 'unavailable'
    async function verifyPaymentWithServer(orderTrackingId) {
        try {
            if (!orderTrackingId || typeof window.skhServerPaymentsStatus !== 'function') return 'unavailable';
            var res = await window.skhServerPaymentsStatus({ orderTrackingId: orderTrackingId });
            var d = (res && typeof res === 'object' && 'data' in res) ? res.data : res;
            if (d && (d.verified === true || d.paid === true)) return 'verified';
            var s = String((d && (d.status || d.payment_status_description || d.paymentStatus)) || '').toLowerCase();
            if (s.indexOf('completed') !== -1 || s.indexOf('paid') !== -1 || s.indexOf('confirmed') !== -1) return 'verified';
            if (s.indexOf('fail') !== -1 || s.indexOf('invalid') !== -1 || s.indexOf('cancel') !== -1 || s.indexOf('reversed') !== -1) return 'rejected';
            return 'unknown';
        } catch (e) {
            console.warn('[payments] pesapalTransactionStatus imekataliwa:', e && e.message);
            return 'unavailable';
        }
    }

    // [COMMERCE 2026-09] Oda ya majadiliano ikishalipwa: funga bei iliyogandishwa
    // kwenye escrow ('held'). HAIUNDI oda mpya — inathibitisha oda ya makubaliano.
    // Hutumika na completePayment (return hai) na DEMO flow ya kadi ya chat.
    async function markNegoOrderPaid(pending, txInfo) {
        if (!fb) return { ok: false, error: 'Firestore haijasajiliwa' };
        var ctx = (pending && pending.context) || {};
        var orderId = ctx.orderId || pending.orderId || '';
        if (!orderId) return { ok: false, error: 'orderId haipo' };
        var now = new Date().toISOString();
        var tid = (txInfo && txInfo.transactionId) || pending.orderTrackingId || pending.txRef || 'N/A';
        var ref = pending.txRef || tid;

        var orderSnap = null;
        try {
            orderSnap = await fb.getDoc(fb.doc(fb.db, 'orders', String(orderId)));
        } catch (e) { orderSnap = null; }
        var existing = (orderSnap && orderSnap.exists && orderSnap.exists()) ? orderSnap.data() : null;
        if (!existing) return { ok: false, error: 'order_not_found' };

        // Idempotent: IPN/return ikija mara mbili, usirudie wala kutuma arifa mpya.
        if (existing.status === 'held' || existing.paymentStatus === 'paid' || existing.paymentVerified === true) {
            return { ok: true, already: true };
        }

        /* [AUDIT-FIX 2026-09-16 P0 §42] HAKUNA kuandika 'paid'/'held' bila
           uthibitisho wa server kwa workflow ZA KWELI (za DEMO huruhusiwa wazi). */
        if (!pending.demo) {
            var verifyOn = !window.SOKOHAI_CONFIG || window.SOKOHAI_CONFIG.PAYMENT_VERIFY_ON_RETURN !== false;
            if (verifyOn) {
                var vres = await verifyPaymentWithServer(tid);
                if (vres === 'rejected') {
                    try { await fb.updateDoc(fb.doc(fb.db, 'orders', String(orderId)), { paymentStatus: 'rejected', paymentVerified: false, paymentRejectedAt: now, updatedAt: now }); } catch (e) {}
                    return { ok: false, error: 'Malipo yamekataliwa na PesaPal' };
                }
                if (vres !== 'verified') {
                    /* Server haikupatikana au hali haijulikani: andika UKWELI
                       (inasubiri uthibitisho) — SI 'paid'. UI/audits zione hali halisi. */
                    try { await fb.updateDoc(fb.doc(fb.db, 'orders', String(orderId)), { paymentStatus: vres === 'unknown' ? 'verification_pending' : 'verification_unavailable', paymentVerified: false, updatedAt: now }); } catch (e) {}
                    return { ok: false, pendingVerification: true, error: 'Malipo hayajathibitishwa bado — yanathaminiwa na server' };
                }
            }
        }

        var patch = {
            status: 'held',
            paymentStatus: 'paid',
            paymentVerified: true,
            paymentRef: ref,
            transactionId: tid,
            paymentType: pending.provider || 'PesaPal',
            paymentMode: pending.demo ? 'demo_negotiation' : 'live_pesapal',
            paidAt: now,
            heldAt: now,
            updatedAt: now
        };
        // Hali za hatua ya biashara zianzie 'held' (tracker ya majadiliano).
        if (existing.commerceType === 'service') patch.serviceStatus = 'held';
        else if (existing.commerceType === 'transport') patch.transportStatus = 'held';
        else patch.deliveryStatus = 'held';
        if (!pending.demo) patch.verifiedByServer = true; // [AUDIT-FIX §42] thibitisho la server
        await fb.updateDoc(fb.doc(fb.db, 'orders', String(orderId)), patch);

        try {
            if (existing.sellerId) {
                // Kitambulisho thabiti -> arifa isirudiwe (DEMO ikibofya mara mbili).
                await fb.setDoc(fb.doc(fb.db, 'notifications', 'payprot_' + String(orderId)), {
                    userId: existing.sellerId,
                    title: ' SokoPay: Malipo Yamelindwa',
                    body: 'Oda #' + orderId + ' imelipwa na fedha zimehifadhiwa Escrow. Tayarisha/endelea na oda sasa.',
                    createdAt: now, read: false, type: 'order',
                    orderId: String(orderId), negotiationId: existing.negotiationId || ctx.negotiationId || null
                }, { merge: true });
            }
        } catch (e) { /* arifa si kikwazo */ }

        return { ok: true, orderId: String(orderId), amount: existing.amount };
    }

    // ============================================================
    // [ADMIN PAYMENTS SWITCH] Kutengeneza mwanachama wa OFFLINE (shared):
    //   - Inaitwa na case 'offline_registration' (baada ya malipo ya PesaPal)
    //   - Inaitwa na registerOfflineMember (FREE MODE) — bila kamisheni
    // opts.skipCommission = true -> FREE (hakuna wallet commission wala adminRevenue)
    // ============================================================
    window.skhCreateOfflineMember = async function (ctx, opts) {
        opts = opts || {};
        var randomDigits = Math.floor(100000 + Math.random() * 900000);
        var offlineAccountId = 'SOH-OF-' + randomDigits;
        var businessId = null;
        var businessSetupComplete = false;
        if (ctx.bType && ctx.bType !== 'Sio Biashara') { businessId = 'BUS-' + randomDigits; businessSetupComplete = true; }
        /* [FIX 2026-09-15 §5] Hii ni IDENTIFIER YA NDANI ya Firebase Auth pekee
           (Auth inahitaji email/password). HAIWASILISHWI kwa mtumiaji kama
           email yake, wala haihifadhiwi kwenye `email` ya profile.
           Utambulisho wa mwanachama ni NAMBA YA SIMU (§5, §6). */
        var authIdentifier = 'offline_' + randomDigits + '@sokohai.internal';
        // [SECURITY-FIX] Nywila ilikuwa 'sokohai'+tarakimu 6 zilezile zilizo kwenye email ya akaunti
        // (mtu yeyote angeweza kuingia kwenye akaunti yoyote ya mwanachama). Sasa ni nasibu salama;
        // hakuna sehemu ya mfumo inayoitegemea (kuingia ni kwa PIN kupitia wakala).
        var defaultPassword = (function () {
            var c = window.crypto || window.msCrypto;
            if (!c || !c.getRandomValues) throw new Error('Kivinjari hakina crypto salama — usajili umesimamishwa.');
            var a = new Uint8Array(24); c.getRandomValues(a);
            return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('') + 'Aa1!';
        })();
        var apiKey = (fb && fb.apiKey) || '';
        var newUid = null;
        if (apiKey) {
            var signUpUrl = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + encodeURIComponent(apiKey);
            var regRes = await fetch(signUpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: authIdentifier, password: defaultPassword, returnSecureToken: false }) });
            var regData = await regRes.json();
            if (regData.error) throw new Error(regData.error.message);
            newUid = regData.localId;
        } else {
            newUid = 'offline_' + Date.now() + '_' + randomDigits;
        }
        await fb.setDoc(fb.doc(fb.db, 'users', newUid), {
            /* [FIX §2,§3,§4,§5,§13,§22] Umiliki ni wa MWANACHAMA:
                 • `email: null` — hakuna email ya uongo; simu ndiyo utambulisho
                 • `accountType: 'offline_member'` — mtumiaji kamili, si sub-account
                 • wakala ni `registeredThroughAgentId` (metadata), SI mmiliki   */
            uid: newUid, fullName: ctx.name, phone: ctx.phone,
            phoneNumber: ctx.phone,
            email: null,
            authIdentifier: authIdentifier,
            accountType: 'offline_member',
            ownerId: newUid,
            notificationChannel: 'sms',
            photoURL: ctx.photoUrl || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(ctx.name || 'x') + '&background=f1f5f9&color=64748b'),
            region: ctx.region, district: ctx.district, businessType: ctx.bType,
            isOfflineUser: true, offlineAccountId: offlineAccountId, businessId: businessId, businessSetupComplete: businessSetupComplete,
            shopName: (ctx.bType && ctx.bType !== 'Sio Biashara') ? ('Duka la ' + ctx.name) : null,
            /* Uhusiano wa wakala = metadata ya onboarding TU (§13).
               `managedBy*` zimehifadhiwa kwa utangamano wa nyuma, lakini
               `registeredThrough*` ndiyo maana sahihi. */
            registeredThroughAgentId: ctx.agentUid, registeredThroughAgentName: ctx.agentName,
            managedByAgentUid: ctx.agentUid, managedByAgentName: ctx.agentName, agentCode: ctx.agentCode,
            walletBalance: 0, createdAt: new Date().toISOString()
        });
        if (opts.skipCommission !== true) {
            if (typeof window.skhWalletAdjust === 'function' && ctx.agentDocId) {
                await window.skhWalletAdjust(fb.doc(fb.db, 'users', ctx.agentDocId), 1260, { type: 'commission', ledgerKey: 'offreg_' + newUid, note: 'Kamisheni ya wakala - usajili wa mwanachama' });
            }
            await fb.addDoc(fb.collection(fb.db, 'adminRevenue'), { type: 'offline_registration', amount: 840, agentCode: ctx.agentCode, date: new Date().toISOString() });
        }
        return { newUid: newUid, offlineAccountId: offlineAccountId, businessId: businessId, businessSetupComplete: businessSetupComplete };
    };

    function esc(s) { return window.skhEscape ? window.skhEscape(s) : String(s == null ? '' : s); }
    function money(n) { return 'TSh ' + (Number(n) || 0).toLocaleString(); }

    function readPending(key) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return null;
            var p = JSON.parse(raw);
            if (!p) return null;
            var age = Date.now() - (Date.parse(p.savedAt) || 0);
            if (age > 2 * 60 * 60 * 1000) { localStorage.removeItem(key); return null; } // saa 2
            return p;
        } catch (e) { return null; }
    }

    // ---------- query/hash param parsing (case-insensitive) ----------
    function param(name) {
        var s = window.location.search || '';
        var m = s.match(new RegExp('[?&]' + name + '=([^&]*)', 'i'));
        if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
        var h = window.location.hash || '';
        m = h.match(new RegExp('[?&]' + name + '=([^&]*)', 'i'));
        if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
        return '';
    }

    // [AUDIT-FIX] helpers hizi zilitumika (skhPesaPalReturnRun) lakini hazikuwepo -> ReferenceError,
    // malipo ya PesaPal hayakuthibitishwa na oda haikuundwa baada ya kurudi.
    function getOrderTrackingId() { return param('OrderTrackingId'); }
    function getMerchantReference() { return param('OrderMerchantReference'); }

    function isReturnVisit() {
        var s = (window.location.search || '').toLowerCase();
        var h = (window.location.hash || '').toLowerCase();
        if (s.indexOf('pesapal_return') !== -1) return true;
        if (s.indexOf('ordertrackingid') !== -1 || s.indexOf('ordermerchantreference') !== -1) return true;
        if (h.indexOf('pesapal-return') !== -1 || h.indexOf('ordertrackingid') !== -1) return true;
        return false;
    }

    // ---------- modal (XSS-safe) ----------
    var MODAL_ID = 'skhPesaPalReturnModal';
    function ensureModal() {
        var m = document.getElementById(MODAL_ID);
        if (m) return m;
        m = document.createElement('div');
        m.id = MODAL_ID;
        m.style.cssText = 'position:fixed;inset:0;z-index:1000200;background:rgba(0,18,34,.82);display:flex;align-items:center;justify-content:center;padding:18px;';
        document.body.appendChild(m);
        return m;
    }
    function mi(name) { return window.skhNavIcon ? window.skhNavIcon(name, 44) : ''; }
    function setModal(icon, title, bodyHtml, buttonsHtml) {
        var m = ensureModal();
        m.innerHTML = '<div style="background:white;max-width:420px;width:100%;border-radius:20px;padding:26px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4);">'
            + '<div style="font-size:44px;">' + icon + '</div>'
            + '<h3 style="margin:10px 0 6px;color:#0f172a;font-size:17px;">' + title + '</h3>'
            + '<div style="font-size:13px;color:#475569;line-height:1.6;">' + bodyHtml + '</div>'
            + '<div style="margin-top:18px;display:flex;flex-direction:column;gap:8px;">' + (buttonsHtml || '') + '</div>'
            + '</div>';
        return m;
    }
    function btn(label, onclickJs, bg, fg) {
        return '<button onclick="' + onclickJs + '" style="padding:13px;border:none;border-radius:12px;font-weight:900;text-transform:uppercase;cursor:pointer;background:' + (bg || '#00509d') + ';color:' + (fg || 'white') + ';">' + label + '</button>';
    }
    window.skhPesaPalReturnClose = function () {
        var m = document.getElementById(MODAL_ID);
        if (m) m.remove();
        try { history.replaceState(null, '', window.location.pathname + (window.location.hash || '')); } catch (e) { /* defensive */ }
    };

    // ---------- uthibitisho wa muamala (server pekee) ----------
    async function verifyTx(orderTrackingId) {
        if (typeof window.skhServerPaymentsStatus !== 'function') return { state: 'unknown' };
        try {
            var res = await window.skhServerPaymentsStatus({ orderTrackingId: orderTrackingId });
            var d = (res && res.data) || {};
            if (d.paid === true) return { state: 'success', transactionId: orderTrackingId };
            var raw = d.raw || {};
            var desc = String(raw.payment_status_description || raw.status_description || raw.status || '').toLowerCase();
            if (Number(raw.status_code) === 1 || ['completed', 'complete', 'paid'].indexOf(desc) !== -1) return { state: 'success', transactionId: orderTrackingId };
            if (['failed', 'invalid', 'reversed', 'cancelled', 'canceled'].indexOf(desc) !== -1) return { state: 'failed', transactionId: orderTrackingId };
            if (desc) return { state: 'pending', transactionId: orderTrackingId };
            return { state: 'unknown', transactionId: orderTrackingId };
        } catch (e) { return { state: 'unknown' }; }
    }

    // ---------- kumalizia ODA (schema ya processPayment) ----------
    async function finishCheckout(pending, txInfo) {
        if (!fb) return { ok: false, error: 'Firestore haijasajiliwa' };
        var created = 0;

        // idempotency
        try {
            var qPrev = fb.query(fb.collection(fb.db, 'orders'), fb.where('paymentRef', '==', pending.txRef), fb.limit(1));
            var prev = await fb.getDocs(qPrev);
            var exists = false;
            prev.forEach(function () { exists = true; });
            if (exists) { localStorage.removeItem(CHECKOUT_KEY); return { ok: true, already: true }; }
        } catch (e) { /* endelea */ }

        async function sellerMeta(sellerUid) {
            var out = { agentUid: null, agentCode: null, isOffline: false };
            try {
                var q = fb.query(fb.collection(fb.db, 'users'), fb.where('uid', '==', String(sellerUid)));
                var s = await fb.getDocs(q);
                s.forEach(function (d) {
                    var u = d.data() || {};
                    out.agentUid = u.managedByAgentUid || null;
                    out.agentCode = u.agentCode || null;
                    out.isOffline = !!u.isOfflineUser;
                });
            } catch (e) { /* defensive */ }
            return out;
        }

        var now = new Date().toISOString();
        var tid = (txInfo && txInfo.transactionId) || pending.orderTrackingId || 'N/A';
        var buyerUid = pending.buyerUid || (window.currentUser && window.currentUser.uid) || '';
        var buyerName = (window.currentUser && (window.currentUser.displayName || window.currentUser.email)) || 'Mnunuzi';

        var items = [];
        if (pending.product && (!pending.cart || pending.cart.length === 0)) {
            items.push({ id: pending.product.id, title: pending.product.title, userId: pending.product.userId, ownerName: pending.product.ownerName || 'Muuzaji', image: pending.product.image || '', price: pending.product.price, quantity: pending.product.quantity || 1, selectedVariant: pending.product.selectedVariant || null, location: pending.product.location || '', isSokoPay: !!pending.product.isSokoPay });
        } else {
            (pending.cart || []).forEach(function (it) { items.push({ id: it.id, title: it.title, userId: it.userId || it.sellerId, ownerName: it.ownerName || it.sellerName || 'Muuzaji', image: it.image || '', price: it.price, location: it.location || it.sellerLocation || (it.cartMeta && it.cartMeta.pickupAddress) || '', quantity: it.qty || 1, selectedVariant: it.selectedVariant || it.selectedVariants || { color: it.chosenColor || null, size: it.chosenSize || null } }); });
        }

        // [DELIVERY OPTION] Usafirishaji ni hiari na unatekelezwa baada ya
        // malipo kuthibitishwa; malipo ya bidhaa hayana nguzo ya delivery.
        var deliveryOrders = [];
        var createdRows = [];
        function deliveryForItem(it) {
            if (!pending.delivery) return { required: false, method: 'self_collection', status: 'not_required', pickupLocation: it.location || '' };
            var d = Object.assign({}, pending.delivery);
            if (!d.pickupLocation) d.pickupLocation = it.location || '';
            return d;
        }

        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var meta = await sellerMeta(it.userId);
            var delivery = deliveryForItem(it);
            var orderRef = await fb.addDoc(fb.collection(fb.db, 'orders'), {
                buyerId: buyerUid, buyerName: buyerName,
                sellerId: it.userId, sellerName: it.ownerName,
                itemId: it.id, productId: it.id, itemTitle: it.title,
                itemImg: it.image || '',
                quantity: Math.max(1, parseInt(it.quantity || 1, 10) || 1),
                unitPrice: parseFloat(it.price) || 0,
                selectedVariant: it.selectedVariant || null,
                productSnapshot: { productId: it.id, title: it.title, image: it.image || '', unitPrice: parseFloat(it.price) || 0, selectedVariant: it.selectedVariant || null },
                amount: items.length === 1 && pending.product ? (pending.amount || 0) : ((parseFloat(it.price) || 0) * Math.max(1, parseInt(it.quantity || 1, 10) || 1) || pending.amount || 0),
                status: 'held', date: now,
                paymentRef: pending.txRef, transactionId: tid,
                paymentType: pending.provider || 'PesaPal',
                paymentMode: 'live_pesapal',
                paymentVerified: true,
                hostedCheckout: true,
                delivery: delivery,
                deliveryRequired: !!delivery.required,
                // [§31 ORDER RECORD] Ikiwa oda ilitoka commerce mode (auction/
                // price_drop/group_buy/wholesale), hifadhi context — kanya buhali za
                // "frasa trade" baadaye (receipts/disputes/life-cycle audit).
                commerceMode: it.commerceMode || (pending.commerceContext && (pending.commerceContext.commerceMode || pending.commerceContext.mode || pending.commerceContext.type)) || null,
                commerceModeSnapshot: it.commerceModeSnapshot || null,
                isOfflineUser: meta.isOffline, managedByAgentUid: meta.agentUid, agentCode: meta.agentCode
            });
            created++;
            createdRows.push({ orderDocId: orderRef.id, delivery: delivery, item: it });
            if (delivery.required) deliveryOrders.push({ orderDocId: orderRef.id, delivery: delivery, item: it });
            try {
                if (meta.isOffline && meta.agentUid) {
                    await fb.addDoc(fb.collection(fb.db, 'notifications'), { userId: meta.agentUid, title: ' Oda Mpya kwa Mteja wako Offline!', body: 'Mteja amelipia oda kwa PesaPal. Msaidie kufunga na kusafirisha mzigo.', createdAt: now, read: false });
                }
            } catch (e) { /* defensive */ }
        }

        // Tekeleza chaguo la usafirishaji baada ya malipo kuthibitishwa.
        if (window.skhHandleOrderDelivery) {
            if (deliveryOrders.length) {
                for (var k = 0; k < deliveryOrders.length; k++) {
                    var drow = deliveryOrders[k];
                    try {
                        await window.skhHandleOrderDelivery(drow.orderDocId, drow.delivery, {
                            buyerId: buyerUid, buyerName: buyerName,
                            sellerId: drow.item.userId, sellerName: drow.item.ownerName,
                            itemTitle: drow.item.title, itemImg: drow.item.image,
                            amount: parseFloat(drow.item.price) || pending.amount || 0
                        });
                    } catch (e) { /* usizuie kumalizia malipo */ }
                }
            }
            // Smart cart: oda ziliandaliwa kabla ya malipo — thibitisha na
            // uunganishe usafiri wake sasa.
            if (Array.isArray(pending.postPayDelivery)) {
                for (var pi = 0; pi < pending.postPayDelivery.length; pi++) {
                    var pp = pending.postPayDelivery[pi];
                    try {
                        await fb.updateDoc(fb.doc(fb.db, 'orders', pp.orderDocId), {
                            status: 'held', paymentStatus: 'paid', paymentVerified: true,
                            paymentRef: pending.txRef, transactionId: tid, paidAt: now
                        });
                    } catch (e) {}
                    if (pp.delivery && pp.delivery.required) {
                        try { await window.skhHandleOrderDelivery(pp.orderDocId, pp.delivery, {}); } catch (e) {}
                    }
                }
            }
            // Lipa Sasa bila chaguo: mwulize mteja baada ya malipo.
            var promptOrders = createdRows.map(function (r) {
                return { orderId: r.orderDocId, title: r.item.title, sellerName: r.item.ownerName, amount: parseFloat(r.item.price) || 0, pickupLocation: r.item.location || '' };
            });
            if (pending.deliveryUndecided && !promptOrders.length && Array.isArray(pending.postPayDelivery)) {
                // Smart-cart/Buy-Now: oda ziliandaliwa kabla ya malipo.
                pending.postPayDelivery.forEach(function (pp) {
                    promptOrders.push({ orderId: pp.orderDocId, title: pp.delivery ? pp.delivery.packageDescription : 'Oda', sellerName: '', amount: 0, pickupLocation: pp.delivery ? pp.delivery.pickupLocation : '' });
                });
            }
            if (pending.deliveryUndecided && promptOrders.length && window.skhDeliveryPostPayPrompt) {
                try {
                    await window.skhDeliveryPostPayPrompt(promptOrders);
                } catch (e) {}
            }
        }
        try { sessionStorage.removeItem('sokohai_delivery_session'); } catch (e) {}
        try { sessionStorage.removeItem('sokohai_buynow'); } catch (e) {}

        // SokoPay link
        if (pending.product && pending.product.isSokoPay) {
            try {
                await fb.updateDoc(fb.doc(fb.db, 'sokopay_links', String(pending.product.id)), {
                    status: 'held', buyerId: buyerUid, buyerName: buyerName, paidAt: now, transactionId: tid
                });
                await fb.addDoc(fb.collection(fb.db, 'notifications'), {
                    userId: pending.product.userId, title: ' Malipo ya SokoPay Yamepokelewa!',
                    body: 'Mteja amelipia mkataba kwa PesaPal. Mtumie mzigo sasa na mpe namba ya usafirishaji.',
                    createdAt: now, read: false
                });
            } catch (e) { /* defensive */ }
        }

        try { localStorage.setItem('sokohai_cart', JSON.stringify([])); } catch (e) {}
        try {
            if (window.currentUser) {
                var uq = fb.query(fb.collection(fb.db, 'users'), fb.where('uid', '==', window.currentUser.uid));
                var us = await fb.getDocs(uq);
                us.forEach(function (d) { fb.updateDoc(fb.doc(fb.db, 'users', d.id), { cart: [] }); });
            }
        } catch (e) { /* defensive */ }

        localStorage.removeItem(CHECKOUT_KEY);
        return { ok: true, created: created };
    }

    // ---------- kumalizia nia nyingine (deposit / ada / boost / payroll / usajili) ----------
    async function completePayment(pending) {
        var now = new Date().toISOString();
        var ctx = pending.context || {};
        var summary = 'Malipo yamethibitishwa.';
        var tid = pending.orderTrackingId || pending.txRef || 'N/A';

        switch (pending.kind) {
            case 'negotiation_order': // oda iliyofungwa kutoka majadiliano ya chat
                var negoRes = await markNegoOrderPaid(pending, { transactionId: tid });
                if (negoRes && negoRes.already) {
                    summary = 'Malipo ya oda hii yalishathibitishwa — Escrow imeshafungwa.';
                } else if (negoRes && negoRes.ok) {
                    summary = ' Oda #' + esc(negoRes.orderId) + ' imelipwa na <b>fedha zimehifadhiwa kwenye SokoPay Escrow</b>. Muuzaji amearifiwa atayarishe oda.';
                } else {
                    summary = 'Malipo yamethibitishwa lakini kufunga oda kumeshindikana — wasiliana na usaidizi.';
                }
                break;

            case 'deposit': // wallet top-up (SokoPay)
                if (typeof window.skhWalletAdjust === 'function' && ctx.docId) {
                    await window.skhWalletAdjust(fb.doc(fb.db, 'users', ctx.docId), pending.amount, { type: 'deposit', ledgerKey: 'deposit_' + tid, note: 'Deposit ya wallet (PesaPal)' });
                }
                await fb.addDoc(fb.collection(fb.db, 'shop_ledger'), { shopOwnerId: ctx.uid, type: 'income_offline', title: 'Weka Pesa: Wallet Top-Up (PesaPal)', amount: pending.amount, profit: pending.amount, date: now });
                await fb.addDoc(fb.collection(fb.db, 'notifications'), { userId: ctx.uid, title: ' SokoPay: Salio Limeongezeka!', body: 'Umefanikiwa kuongeza ' + money(pending.amount) + ' kwenye wallet yako kupitia PesaPal.', createdAt: now, read: false });
                summary = money(pending.amount) + ' imewekwa kwenye Wallet yako ya SokoPay.';
                break;

            case 'deposit_item': // serious deposit (group buy / mnada / price drop)
                await fb.setDoc(fb.doc(fb.db, 'serious_deposits', ctx.depositId), { uid: ctx.uid, itemId: ctx.itemId, hasActiveDeposit: true, amountPaid: 1300, transactionId: tid, date: now });
                await fb.addDoc(fb.collection(fb.db, 'adminRevenue'), { type: 'serious_deposit', amount: 1300, user: ctx.email, itemId: ctx.itemId, date: now });
                summary = 'Deposit imekubaliwa na kuhakikiwa! Sasa unaweza kushiriki kwenye mfumo huu.';
                break;

            case 'payroll': // mshahara wa mfanyakazi
                if (ctx.staffDocId) {
                    var staffSnap = await fb.getDoc(fb.doc(fb.db, 'shop_staff', ctx.staffDocId));
                    if (staffSnap && staffSnap.exists && staffSnap.exists()) {
                        var sd = staffSnap.data() || {};
                        var currentPaid = parseFloat(sd.paidSalary || 0);
                        var totalPaidNow = currentPaid + pending.amount;
                        var full = Number(ctx.fullSalary) || totalPaidNow;
                        await fb.updateDoc(fb.doc(fb.db, 'shop_staff', ctx.staffDocId), { paidSalary: totalPaidNow, pendingSalary: Math.max(0, full - totalPaidNow) });
                        await fb.addDoc(fb.collection(fb.db, 'shop_ledger'), { shopOwnerId: ctx.ownerUid, type: 'expense', title: 'Mshahara: ' + (sd.name || 'Mfanyakazi') + ' (PesaPal)', amount: pending.amount, date: now });
                    }
                }
                summary = 'Mshahara wa ' + money(pending.amount) + ' umetolewa kikamilifu (PesaPal).';
                break;

            case 'boost': // boost ya tangazo
                if (ctx.collectionName && ctx.itemId) {
                    var boostDays = Math.max(1, Number(ctx.boostDays) || (ctx.collectionName === 'products' ? 3 : 7));
                    var boostExpiresAt = ctx.boostExpiresAt || new Date(Date.parse(now) + boostDays * 86400000).toISOString();
                    await fb.updateDoc(fb.doc(fb.db, ctx.collectionName, ctx.itemId), { isBoosted: true, boostTargetViews: ctx.targetViews || 1000, boostedViewsCount: 0, boostDays: boostDays, boostedAt: now, boostExpiresAt: boostExpiresAt });
                }
                await fb.addDoc(fb.collection(fb.db, 'adminRevenue'), { type: 'boost', amount: pending.amount, status: 'success', date: now });
                summary = 'Tangazo lako limekuwa Boosted!';
                break;

            case 'agent_registration': // usajili wa wakala
                // [FIX] Kama ombi tayari liliandikwa kabla ya malipo (status: pending kwa admin),
                // tunasasisha document hiyo hiyo kuwa 'paid' — hatufanyi duplicate.
                if (ctx.agentDocId) {
                    try {
                        await fb.updateDoc(fb.doc(fb.db, 'agents', ctx.agentDocId), { paymentStatus: 'paid', isPaid: true, paymentRef: ctx.txRef || tid, paidAt: now });
                    } catch (e) { /* document inaweza kukosekana kwenye legacy flow */ }
                } else {
                    // Legacy fallback: hakuna draft -> andika sasa.
                    await fb.addDoc(fb.collection(fb.db, 'agents'), { userId: ctx.uid, userEmail: ctx.email, fullName: ctx.name, contact: ctx.phone, email: ctx.agentEmail || '', location: ctx.region, bio: ctx.bio || '', status: 'pending', paymentStatus: 'paid', isPaid: true, paymentRef: ctx.txRef || tid, createdAt: now });
                }
                if (ctx.recordRevenue !== false) {
                    await fb.addDoc(fb.collection(fb.db, 'adminRevenue'), { type: 'agent_registration', amount: pending.amount, paymentRef: ctx.txRef || tid, userEmail: ctx.email, date: now });
                }
                summary = 'Ombi lako la uwakala limetumwa! (Ref: ' + esc(ctx.txRef || tid) + ')';
                break;

            case 'subscription': // usajili wa kifurushi
                if (ctx.docId) {
                    await fb.updateDoc(fb.doc(fb.db, 'users', ctx.docId), { isSubscribed: true, subscriptionType: ctx.title, subscriptionValidUntil: ctx.subExpiryDate || now, subStatus: 'Active' });
                }
                await fb.addDoc(fb.collection(fb.db, 'adminRevenue'), { type: 'subscription', amount: pending.amount, package: ctx.title, userEmail: ctx.email, date: now });
                summary = 'Kifurushi chako (' + esc(ctx.title || '') + ') kimeamilishwa.';
                break;

            case 'offline_registration': // usajili wa mwanachama wa offline
                var offRes = await window.skhCreateOfflineMember(ctx, { skipCommission: false });
                summary = 'Usajili umekamilika! ID ya Mteja: ' + esc(offRes.offlineAccountId) + (offRes.businessId ? ' · Biashara: ' + esc(offRes.businessId) : '') + '<br>TSh 1,260 imewekwa kwenye Wallet yako kama kamisheni ya uwakala.';
                break;

            default:
                summary = 'Malipo yamethibitishwa (Ref: ' + esc(tid) + ').';
        }
        return summary;
    }

    // ---------- mtiririko mkuu ----------
    var running = false;
    window.skhPesaPalReturnRun = async function () {
        if (running) return;
        running = true;
        try {
            var checkoutPending = readPending(CHECKOUT_KEY);
            var paymentPending = readPending(PAYMENT_KEY);
            if (!checkoutPending && !paymentPending) {
                setModal(mi('info'), 'Hakuna malipo yaliyoanza', 'Hakuna rekodi ya malipo ya PesaPal yaliyoanza hivi karibuni kwenye kifaa hiki.',
                    btn('Sawa, endelea', 'window.skhPesaPalReturnClose()', '#e2e8f0', '#334155'));
                return;
            }

            var orderTrackingId = getOrderTrackingId() || getMerchantReference()
                || (checkoutPending && (checkoutPending.orderTrackingId || checkoutPending.txRef))
                || (paymentPending && (paymentPending.orderTrackingId || paymentPending.txRef)) || '';

            setModal(mi('clock'), 'Inathibitisha malipo yako...', '<div style="margin:14px auto;width:34px;height:34px;border:4px solid #e2e8f0;border-top-color:#00509d;border-radius:50%;animation:skhPpSpin 1s linear infinite;"></div>Reference: <b>' + esc(orderTrackingId) + '</b><style>@keyframes skhPpSpin{to{transform:rotate(360deg)}}</style>', '');

            var st = await verifyTx(orderTrackingId);

            if (st.state === 'success') {
                var summary = 'Malipo yamethibitishwa na PesaPal.';
                var extra = '';
                if (checkoutPending) {
                    var fin = { ok: false };
                    try { fin = await finishCheckout(checkoutPending, st); } catch (e) { fin = { ok: false, error: e && e.message }; }
                    if (fin.ok) {
                        extra = (fin.created || 0) > 0 ? '<br>Oda yako <b>' + fin.created + '</b> imeumbwa na pesa zapo kwenye <b>Escrow</b>.' : '<br>Oda yako ipo tayari kwenye Escrow.';
                        window.skhPesaPalPendingClear();
                    } else {
                        extra = '<br>Malipo yamethibitishwa lakini kumalizia oda kumeshindikana kidogo — wasiliana na usaidizi.';
                    }
                } else if (paymentPending) {
                    try { summary = await completePayment(paymentPending); } catch (e) { summary = 'Malipo yamethibitishwa, lakini kukamilisha kumeshindikana: ' + esc((e && e.message) || ''); }
                    window.skhPesaPalPendingClear();
                }
                setModal(mi('check'), 'Malipo Yamekamilika!', summary + extra + '<br><small style="color:#94a3b8;">Ref: ' + esc(orderTrackingId) + '</small>',
                    btn(' Endelea', 'window.skhPesaPalReturnClose(); if(window.openBuyerOrdersModal) window.openBuyerOrdersModal();', '#e2e8f0', '#334155') +
                    btn('Funga', 'window.skhPesaPalReturnClose()'));
                return;
            }
            if (st.state === 'failed') {
                window.skhPesaPalPendingClear();
                if (checkoutPending) localStorage.removeItem(CHECKOUT_KEY);
                setModal(mi('warn'), 'Malipo Hayakukamilika', 'PesaPal imeripoti muamala huu kuwa <b>umeisha bila mafanikio</b>. Unaweza kujaribu tena.<br><small style="color:#94a3b8;">Ref: ' + esc(orderTrackingId) + '</small>',
                    btn('Jaribu Tena', 'window.skhPesaPalReturnClose(); if(window.openCart) window.openCart();') +
                    btn('Funga', 'window.skhPesaPalReturnClose()', '#e2e8f0', '#334155'));
                return;
            }
            setModal(mi('clock'), 'Malipo Yanasubiri Uthibitisho', 'PesaPal bado haijathibitisha muamala huu (mara nyingine inachukua dakika chache).<br><small style="color:#94a3b8;">Ref: ' + esc(orderTrackingId) + '</small>',
                btn(' Angalia Tena', 'window.skhPesaPalReturnRun()') +
                btn('Funga', 'window.skhPesaPalReturnClose()', '#e2e8f0', '#334155'));
        } catch (runErr) {
            // [AUDIT-FIX] hapo awali hitilafu yoyote ilimezwa kimya (try/finally bila catch)
            try { console.error('[PesaPal return]', runErr); } catch (e) { /* defensive */ }
            setModal(mi('warn'), 'Hitilafu Wakati wa Uthibitisho',
                'Imeshindikana kuthibitisha malipo kwa sasa. <b>Malipo yako hayajapotea</b> — jaribu tena, au wasiliana na usaidizi.<br><small style="color:#94a3b8;">' + esc((runErr && runErr.message) || '') + '</small>',
                btn('Jaribu Tena', 'window.skhPesaPalReturnRun()') +
                btn('Funga', 'window.skhPesaPalReturnClose()', '#e2e8f0', '#334155'));
        } finally {
            running = false;
        }
    };

    // ---------- auto-run ----------
    function maybeRun() {
        if (isReturnVisit()) {
            setTimeout(function () { window.skhPesaPalReturnRun(); }, 800);
            return;
        }
        // AUTO-CHECK: pending ipo bila query params (mtumiaji alirudi bila redirect)
        try {
            if (readPending(CHECKOUT_KEY) || readPending(PAYMENT_KEY)) {
                setTimeout(function () { window.skhPesaPalReturnRun(); }, 1200);
            }
        } catch (e) { /* defensive */ }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeRun);
    else maybeRun();
    window.addEventListener('hashchange', maybeRun);
})();

/* ============================================================================
   SOKOHAI — ESCROW RELEASE GUARD  (§21, §22, §23, §30, §35)
   ----------------------------------------------------------------------------
   UKAGUZI WA KWANZA (§33) — kilichokuwepo tayari, HAKIKUREPEWA:

     js/app/33-custody.js  — custody engine KAMILI:
        • skhCustodyGenerateToken / ReadToken / RevokeTokens
        • ConfirmSellerHandover / ConfirmTransporterPickup
        • InitiateHandover / ConfirmHandoverFrom / ConfirmIntermediatePickup
        • currentCustodian + currentCustodianName  (§18 — ipo)
        • custodyLegs + deliveryLegId              (§19 — ipo)
        • skhCustodyRenderTimeline                 (§24 — ipo)
        • Idempotency: PICKED_UP/IN_TRANSIT hurudi ok; pickupTokenStatus
          !== 'pending' -> 'token_used'            (§31, §10 — ipo)
     js/app/25-tracking-hub.js — UI ya "MSHIKA MZIGO SASA" + timeline (ipo)
     js/app/52-transport-inbox.js — vitendo vya Inbox kwa hali/nafasi (ipo)
     functions/index.js — deliveryAccept/ConfirmPickup/GenerateToken (ipo)

   PENGO PEKEE LILILOBAKI:
     `window.confirmSokoPayDelivery` (23-smart-cart.js:272) ilikuwa inaandika
     escrowStatus:'Released' MOJA KWA MOJA — bila kukagua:
        • malipo yamefanyika?
        • usafirishaji umekamilika kweli?
        • mzigo umefika kwa mpokeaji?
        • kuna mgogoro hai?
     Hii ni hatari ya kifedha na inakiuka §22 na §35 ("Don't fake success").

   FAILI HII: mlinzi MMOJA wa release. Haibadilishi custody engine wala
   haiundi collection mpya. Inafunika function iliyopo (wrapper) ili kila
   njia ya release ipite kwenye ukaguzi ule ule.
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    function now() { return new Date().toISOString(); }
    function low(v) { return String(v == null ? '' : v).toLowerCase(); }
    function money(v) {
        var n = Number(v); if (!isFinite(n) || n <= 0) return 'TSh 0';
        return 'TSh ' + Math.round(n).toLocaleString('en-US');
    }

    /* ========================================================================
       1) MASHARTI YA KUACHIA ESCROW (§22)
       ------------------------------------------------------------------------
       Payment Received AND Escrow Funded AND Delivery Verified
       AND Final Delivery Confirmed AND No Active Dispute
       ======================================================================== */
    var DELIVERED = ['delivered', 'arrived', 'completed', 'recipient_confirmed', 'received'];
    var PAID = ['payment protected', 'paid', 'money secured', 'released', 'successful'];

    /**
     * skhEscrowCheck(tx, ride) -> { ok, blockers[], warnings[], summary }
     * tx   = doc ya sokopay_core_transactions
     * ride = doc ya ride_requests/shipments (ikiwa ipo)
     */
    window.skhEscrowCheck = function (tx, ride) {
        tx = tx || {}; ride = ride || null;
        var blockers = [], warnings = [];

        // (a) Malipo yamepokelewa?
        var pay = low(tx.paymentStatus);
        var esc = low(tx.escrowStatus);
        if (!pay || pay === 'pending' || pay === 'failed' || pay === 'cancelled') {
            blockers.push('Malipo bado hayajathibitishwa.');
        }
        // (b) Escrow imeshikilia fedha?
        if (esc && ['refunded', 'cancelled', 'failed'].indexOf(esc) !== -1) {
            blockers.push('Escrow imeshafungwa (' + tx.escrowStatus + ').');
        }
        if (esc === 'released') {
            blockers.push('Fedha tayari zimeachiwa — huhitaji kurudia.');
        }
        // (c) Mgogoro hai?
        var od = low(tx.orderStatus) + ' ' + low(tx.contractStatus);
        if (/disput/.test(od) || (tx.dispute && !tx.dispute.resolvedAt)) {
            blockers.push('Kuna mgogoro hai. Escrow haiwezi kuachiwa hadi utatuliwe.');
        }
        // (d) Usafirishaji umekamilika? (ikiwa oda ina usafirishaji)
        var hasTransport = !!(tx.shipmentId || tx.shipmentDocId || tx.rideId ||
                              tx.transportRequestId || ride);
        if (hasTransport) {
            var ship = low(tx.shipmentStatus);
            var rst = ride ? low(ride.status) : '';
            var delivered = DELIVERED.indexOf(ship) !== -1 || DELIVERED.indexOf(rst) !== -1;
            if (!delivered) {
                blockers.push('Mzigo bado haujafika kwa mpokeaji (hali: ' +
                              (ride ? (ride.status || '—') : (tx.shipmentStatus || '—')) + ').');
            }
            // (e) Chain of custody: pickup ilithibitishwa?
            if (ride) {
                /* Ushahidi WA KWELI wa kuchukua: timestamp au token iliyotumika.
                   HATUKUBALI `status:'delivered'` peke yake kama ushahidi —
                   hali inaweza kuwekwa bila chain of custody kukamilika (§35). */
                var okPickup = !!(ride.pickedUpAt || ride.pickupVerifiedAt ||
                                  ride.pickupTokenUsedAt ||
                                  low(ride.pickupTokenStatus) === 'used' ||
                                  (Array.isArray(ride.custodyLegs) && ride.custodyLegs.length));
                if (!okPickup) {
                    blockers.push('Uchukuaji wa mzigo haujathibitishwa kwa namba (token).');
                }
                if (ride.currentCustodian && !delivered) {
                    warnings.push('Mzigo bado uko kwa: ' + (ride.currentCustodianName || 'msafirishaji'));
                }
            }
        } else {
            warnings.push('Oda hii haina usafirishaji — inakaguliwa kwa malipo pekee.');
        }

        return {
            ok: blockers.length === 0,
            blockers: blockers,
            warnings: warnings,
            summary: {
                payment: tx.paymentStatus || '—',
                escrow: tx.escrowStatus || '—',
                shipment: (ride && ride.status) || tx.shipmentStatus || '—',
                custodian: (ride && ride.currentCustodianName) || null,
                amount: tx.totalAmount || tx.amount || tx.currentTotal || 0
            }
        };
    };

    /* ========================================================================
       2) SOMA RIDE INAYOHUSIANA (bila collection mpya)
       ======================================================================== */
    async function loadRide(tx) {
        var id = tx.rideId || tx.transportRequestId || tx.shipmentDocId || tx.shipmentId;
        if (!id || !skh.db) return null;
        var cols = ['ride_requests', 'shipments'];
        for (var i = 0; i < cols.length; i++) {
            try {
                var s = await skh.getDoc(skh.doc(skh.db, cols[i], id));
                if (s && s.exists && s.exists()) return Object.assign({ id: id, __col: cols[i] }, s.data());
            } catch (e) {}
        }
        return null;
    }

    /* ========================================================================
       3) FUNIKA `confirmSokoPayDelivery` — kila release ipite hapa (§30)
       ======================================================================== */
    /* [P2 RESTORE 2026-11-10] Backlink: oda inayounganishwa na muamala huu.
     * orderDocId ndiyo kiungo (sio orderId/transactionToken — hizo si doc ids).
     * Fallback: tafuta orders kwa sokopayCoreId. Hakuna oda = hakuna release. */
    async function findLinkedOrder(tx, coreId) {
        tx = tx || {};
        if (tx.orderDocId) return String(tx.orderDocId);
        try {
            if (!skh.db || typeof skh.query !== 'function') return null;
            var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'orders'),
                skh.where('sokopayCoreId', '==', coreId), skh.limit(1)));
            if (s && !s.empty && s.docs && s.docs.length) return s.docs[0].id;
        } catch (e) {}
        return null;
    }
    window.skhFindLinkedOrderId = findLinkedOrder;

    function install() {
        if (window.__skhEscrowGuard) return;
        var orig = window.confirmSokoPayDelivery;
        if (typeof orig !== 'function') return;   // jaribu tena baadaye
        window.__skhEscrowGuard = true;

        window.confirmSokoPayDelivery = async function (id) {
            if (!id) return;
            // Idempotency (§31): mbofyo wa pili hauendeshi mara mbili
            return window.skhGuard ? window.skhGuard('escrow_' + id, null, function () { return run(id); })
                                   : run(id);
        };

        async function run(id) {
            skhBusy(true, 'Inakagua masharti…');
            var tx = null, ride = null;
            try {
                var snap = await skh.getDoc(skh.doc(skh.db, 'sokopay_core_transactions', id));
                if (!snap || !snap.exists || !snap.exists()) {
                    skhBusy(false);
                    skhToast('Muamala huu haupatikani.', 'error');
                    return;
                }
                tx = snap.data() || {};
                ride = await loadRide(tx);
            } catch (e) {
                skhBusy(false);
                if (window.skhShowErr) window.skhShowErr(e, { fn: 'confirmSokoPayDelivery', entityId: id,
                                                             collection: 'sokopay_core_transactions', operation: 'read' });
                else skhToast('Imeshindikana kusoma muamala.', 'error');
                return;
            }
            skhBusy(false);

            var chk = window.skhEscrowCheck(tx, ride);

            /* ---- (a) Masharti hayajatimia: SEMA UKWELI (§35) ---- */
            if (!chk.ok) {
                var html = '<div class="esc-check">'
                    + chk.blockers.map(function (b) {
                        return '<div class="esc-row esc-bad">' +
                               (window.skhNavIcon ? window.skhNavIcon('x', 14) : '') +
                               '<span>' + skh.skhEscape(b) + '</span></div>';
                      }).join('')
                    + chk.warnings.map(function (w) {
                        return '<div class="esc-row esc-warn">' +
                               (window.skhNavIcon ? window.skhNavIcon('alert', 14) : '') +
                               '<span>' + skh.skhEscape(w) + '</span></div>';
                      }).join('')
                    + '<div class="esc-sum">Malipo: <b>' + skh.skhEscape(chk.summary.payment) + '</b>'
                    + ' · Usafirishaji: <b>' + skh.skhEscape(chk.summary.shipment) + '</b></div>'
                    + '</div>';
                await skhConfirm(html, {
                    title: 'Escrow haiwezi kuachiwa bado',
                    okText: 'Nimeelewa', cancelText: null, html: true
                });
                return;
            }

            /* ---- (b) Masharti yametimia: thibitisha kwa uwazi ---- */
            var body = '<div class="esc-check">'
                + '<div class="esc-row esc-ok">' + (window.skhNavIcon ? window.skhNavIcon('check', 14) : '') +
                  '<span>Malipo yamethibitishwa</span></div>'
                + '<div class="esc-row esc-ok">' + (window.skhNavIcon ? window.skhNavIcon('check', 14) : '') +
                  '<span>Mzigo umefika kwa mpokeaji</span></div>'
                + '<div class="esc-row esc-ok">' + (window.skhNavIcon ? window.skhNavIcon('check', 14) : '') +
                  '<span>Hakuna mgogoro hai</span></div>'
                + '<div class="esc-sum">Fedha zitakazoachiwa muuzaji: <b>' +
                  money(chk.summary.amount) + '</b></div>'
                + '</div>';
            var ok = await skhConfirm(body, {
                title: 'Thibitisha umepokea', okText: 'Ndiyo, achia fedha',
                cancelText: 'Bado', html: true
            });
            if (!ok) return;

            /* ---- (c0) Muuzaji wa nje: display-only — SERVER haihusiki,
             * hakuna escrow ya kuachia, hakuna money fields za uongo. ---- */
            if (tx.outsideSeller) {
                skhBusy(true, 'Inakamilisha…');
                try {
                    await skh.updateDoc(skh.doc(skh.db, 'sokopay_core_transactions', id), {
                        orderStatus: 'Completed',
                        recipientConfirmedAt: now(),
                        recipientConfirmedBy: (skh.currentUser && skh.currentUser.uid) || null,
                        updatedAt: now(),
                        timeline: skh.arrayUnion({
                            title: 'Buyer Confirmed Receipt',
                            description: 'Muuzaji wa nje — mapokezi yamethibitishwa bila escrow.',
                            at: now(), done: true
                        })
                    });
                    skhBusy(false);
                    skhToast('Asante! Mapokezi yamethibitishwa (muuzaji wa nje — hakuna escrow).', 'success', 3600);
                    if (typeof window.openSokoPayOrderDetail === 'function') window.openSokoPayOrderDetail(id);
                } catch (e) {
                    skhBusy(false);
                    skhToast('Imeshindikana kuhifadhi uthibitisho. Jaribu tena.', 'error');
                }
                return;
            }

            /* ---- (c1) Tafuta oda iliyounganishwa — hakuna oda, hakuna release ---- */
            var orderId = await findLinkedOrder(tx, id);
            if (!orderId) {
                skhToast('Oda iliyounganishwa haikupatikana. Haiwezekani kuachia escrow bila oda.', 'error');
                return;
            }

            /* ---- (c2) SERVER KWANZA — patch + toast TU baada ya server kukubali ---- */
            skhBusy(true, 'Inakamilisha…');
            var rel = null;
            try {
                var relFn = skh.wrapCallable('escrowRelease');
                var relRes = await relFn({ orderId: orderId });
                rel = (relRes && relRes.data) ? relRes.data : relRes;
            } catch (e) {
                skhBusy(false);
                skhToast('Server ya escrow haipatikani kwa sasa. Hakuna kilichoandikwa — jaribu tena baadaye.', 'error');
                return;
            }
            if (!rel || !rel.ok) {
                skhBusy(false);
                var relErr = String((rel && (rel.error || rel.message)) || '');
                if (/disput/i.test(relErr)) {
                    skhToast('Kuna mgogoro kwenye oda hii — escrow haiwezi kuachiwa hadi mgogoro utatuliwe.', 'error');
                } else {
                    skhToast('Server imekataa kuachia escrow' + (relErr ? ' (' + relErr + ')' : '') + '. Hakuna kilichoandikwa.', 'error');
                }
                return;
            }
            try {
                var patch = {
                    shipmentStatus: 'Delivered',
                    escrowStatus: 'Released',
                    paymentStatus: 'Released',
                    orderStatus: 'Completed',
                    contractStatus: 'Completed',
                    recipientConfirmedAt: now(),
                    recipientConfirmedBy: (skh.currentUser && skh.currentUser.uid) || null,
                    updatedAt: now(),
                    timeline: skh.arrayUnion({
                        title: 'Buyer Confirmed Delivery',
                        description: 'Server imeachia escrow; masharti yote yamekaguliwa.',
                        at: now(), done: true
                    })
                };
                await skh.updateDoc(skh.doc(skh.db, 'sokopay_core_transactions', id), patch);

                // Custody: funga safari pia (ikiwa ipo) — hali moja
                if (ride && ride.__col) {
                    try {
                        await skh.updateDoc(skh.doc(skh.db, ride.__col, ride.id), {
                            status: 'completed', recipientConfirmedAt: now(), updatedAt: now()
                        });
                    } catch (e) {}
                }
                // Escrow settlement is authoritative in the trusted Function;
                // do not append a client-forged settlement audit record here.

                skhBusy(false);
                var earned = rel.split ? rel.split.sellerEarned : null;
                if (rel.already) {
                    skhToast('Tayari ilishakamilika awali — hakuna kilichorudiwa.', 'success', 3600);
                } else if (earned) {
                    skhToast('Asante! Fedha zimeachiwa muuzaji: ' + money(earned) + '.', 'success', 3600);
                } else {
                    skhToast('Asante! Fedha zimeachiwa muuzaji.', 'success', 3600);
                }
                if (typeof window.openSokoPayOrderDetail === 'function') window.openSokoPayOrderDetail(id);
            } catch (e) {
                skhBusy(false);
                // Server ilishakubali (pesa zimehamishwa) lakini display patch
                // imeshindwa — sema ukweli, usidanganye.
                skhToast('Server imemaliza malipo lakini rekodi ya kuonyesha imeshindwa. Fungua upya ukurasa.', 'error');
            }
        }
    }

    /* ========================================================================
       4) "RIPOTI TATIZO" — badala ya kuachia (§23)
       ======================================================================== */
    window.skhReportDeliveryProblem = async function (id) {
        if (!id) return;
        var reason = await skhPrompt('Eleza tatizo ulilokutana nalo:', '',
            { title: 'Ripoti tatizo', placeholder: 'Mf. Mzigo umeharibika / haujafika kamili' });
        if (!reason) return;
        // [P2 RESTORE 2026-11-10] Mgogoro wa KWELI kupitia server (disputeOpen)
        // — kuzuia escrow ni kwa server, sio maandishi ya kivinjari.
        var orderId = null;
        try {
            var snap = await skh.getDoc(skh.doc(skh.db, 'sokopay_core_transactions', id));
            var txr = (snap && snap.exists && snap.exists()) ? (snap.data() || {}) : {};
            orderId = await findLinkedOrder(txr, id);
        } catch (e) { orderId = null; }
        if (!orderId) {
            skhToast('Oda iliyounganishwa haikupatikana — tatizo haliwezi kufunguliwa kwa server.', 'error');
            return;
        }
        skhBusy(true, 'Inawasilisha…');
        var opened = false;
        try {
            var dspFn = skh.wrapCallable('disputeOpen');
            var dspRes = await dspFn({ orderId: orderId, reason: String(reason) });
            var dsp = (dspRes && dspRes.data) ? dspRes.data : dspRes;
            opened = !!(dsp && dsp.ok);
        } catch (e) { opened = false; }
        // Rekodi ya kuonyesha huandikwa hata server ikishindwa (ukweli wa
        // pande mbili: toast inasema wazi kilichotokea).
        try {
            await skh.updateDoc(skh.doc(skh.db, 'sokopay_core_transactions', id), {
                orderStatus: 'Disputed', contractStatus: 'Dispute Active',
                dispute: { reason: reason, at: now(),
                           by: (skh.currentUser && skh.currentUser.uid) || null, resolvedAt: null },
                updatedAt: now(),
                timeline: skh.arrayUnion({ title: 'Dispute Opened',
                    description: opened ? 'Mnunuzi ameripoti tatizo; escrow imezuiliwa.'
                                        : 'Mnunuzi ameripoti tatizo; server haijathibitisha — wasiliana na support.',
                    at: now(), done: true })
            });
        } catch (e) {}
        skhBusy(false);
        if (opened) {
            skhToast('Tatizo limewasilishwa. Fedha zimezuiliwa na server hadi utatuzi.', 'info', 4200);
        } else {
            skhToast('Server haikupokea mgogoro — rekodi imehifadhiwa; wasiliana na support ukihitaji msaada wa haraka.', 'error');
        }
        if (typeof window.openSokoPayOrderDetail === 'function') window.openSokoPayOrderDetail(id);
    };

    /* ========================================================================
       5) UCHUNGUZI: "Escrow iko wapi?" (§ maswali ya mwisho)
       ======================================================================== */
    window.skhEscrowStatus = async function (id) {
        var snap = await skh.getDoc(skh.doc(skh.db, 'sokopay_core_transactions', id));
        if (!snap || !snap.exists || !snap.exists()) return { error: 'haipatikani' };
        var tx = snap.data() || {};
        var ride = await loadRide(tx);
        var chk = window.skhEscrowCheck(tx, ride);
        console.table([{
            malipo: chk.summary.payment, escrow: chk.summary.escrow,
            usafirishaji: chk.summary.shipment,
            mshikaMzigo: chk.summary.custodian || '—',
            inawezaKuachiwa: chk.ok ? 'NDIYO' : 'HAPANA'
        }]);
        if (!chk.ok) console.info('Vizuizi:', chk.blockers);
        return chk;
    };

    install();
    setTimeout(install, 1500);
    setTimeout(install, 4000);
})();

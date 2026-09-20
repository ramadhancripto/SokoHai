/* ==== js/16-wallet.js ==== */
// ============================================================
// SOKOHAI WALLET BRIDGE [PHASE 5.2a] — kituo kimoja cha client
// kubadilisha salio la wallet.
//
//   WALLET_VIA_SERVER = false (sasa): skhWalletAdjust inafanya
//       updateDoc(ref, { walletBalance: increment(x) }) — tabia ya
//       zamani 1:1 (hakuna mabadiliko ya mtandao wala tabia).
//   WALLET_VIA_SERVER = true: inaita Cloud Function 'walletAdjust'
//       (transactional + wallet_ledger + idempotent).
//   skhEscrowRelease(orderId): geti likiwa true inaita 'escrowRelease'
//       (smart-split nzima server); likiwa false inarudisha null na
//       caller anaendelea na njia yake ya legacy.
// Firestore/callables zinasajiliwa na app.module.js (mfumo wa 14-sync).
// ============================================================
(function () {
    'use strict';

    var legacy = null;          // {doc, updateDoc, increment}
    var callAdjust = null;      // callable 'walletAdjust'
    var callRelease = null;     // callable 'escrowRelease'

    window.skhWalletRegisterFirestore = function (fns) { legacy = fns; };
    window.skhWalletRegisterCallables = function (fns) {
        callAdjust = fns && fns.adjust ? fns.adjust : null;
        callRelease = fns && fns.release ? fns.release : null;
    };

    function viaServer() {
        return !!(window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.WALLET_VIA_SERVER);
    }

    // Kituo kimoja: badilisha wallet ya mtumiaji (ref = doc ref ya users)
    window.skhWalletAdjust = async function (ref, amountTSh, opts) {
        opts = opts || {};
        if (!viaServer()) {
            // NJIA YA LEGACY — tabia ya zamani 1:1
            if (!legacy) throw new Error('skhWalletAdjust: Firestore ya legacy haijasajiliwa');
            return legacy.updateDoc(ref, { walletBalance: legacy.increment(amountTSh) });
        }
        if (!callAdjust) throw new Error('skhWalletAdjust: callable haikusajiliwa');
        var docId = null;
        try { var parts = String((ref && ref.path) || '').split('/'); if (parts[0] === 'users') docId = parts[1] || null; } catch (e) {}
        var res = await callAdjust({
            docId: docId,
            amountTSh: amountTSh,
            type: opts.type || 'adjustment',
            ledgerKey: opts.ledgerKey || (String(Date.now()) + '_' + Math.random().toString(36).slice(2, 8)),
            note: opts.note || ''
        });
        return res && res.data;
    };

    // Escrow release nzima ya server (null = tumia njia ya legacy)
    window.skhEscrowRelease = async function (orderId) {
        if (!viaServer() || !callRelease) return null;
        var res;
        try {
            res = await callRelease({ orderId: orderId });
        } catch (e) {
            // [FUNCTIONS RESILIENCE] server haijapelekwa/haipatikani → ujumbe wa
            // maana (SokoPay halitoi pesa), si "internal" mbichi.
            if (e && e.fnDown) {
                return { ok: false, fnDown: true, message: e.friendlyMessage
                    || (window.skhFnDownMessage ? window.skhFnDownMessage('escrow') : 'Huduma ya SokoPay haipatikani kwa sasa.') };
            }
            return { ok: false, message: (e && e.message) || 'Server ya escrow imehitilafu.' };
        }
        return res && res.data;
    };
})();

/* ============================================================
   [AWAMU YA 1 - HATUA 3] UNIFIED SMART CART & CHECKOUT HANDLER
   ------------------------------------------------------------
   Mgongano wa kazi: awali openCart() na confirmSmartCartOrder()
   ziliandikwa mara nyingi chini ya faili (patches za awamu
   mbalimbali). Hapa tunazifunga kwenye toleo MOJA la mwisho
   (canonical) — "last definition wins" — ili vitufe vya Cart na
   Checkout ziwe na utekelezaji mmoja tu unaofanya kazi.

   KITU MUHIMU: confirmSmartCartOrder inaendelea kuendesha SokoPay
   Core kamili (order, shipment, tokens, seller inbox, escrow)
   KABLA ya kufungua dirisha la malipo — si tu kufungua dirisha —
   ili malipo yawe na rejesta halisi ya escrow. Kiasi cha mwisho
   kinawekwa kwenye activeCheckoutAmount na checkoutAmount kabla
   ya dirisha kufunguka. (Toleo rahisi la fallback limebaki chini
   kwa usalama wa ziada iwapo core haijasajiliwa.)
   ============================================================ */
(function () { 'use strict';

    // Hifadhi utekelezaji kamili uliofanya kazi (unaofahamu SokoPay Core)
    var coreOpenCart  = window.openCart;
    var coreConfirm   = window.confirmSmartCartOrder;

    // ---- 1) openCart (canonical) ----
    window.openCart = function () {
        if (typeof requireAuth === 'function' && !requireAuth()) return;
        if (typeof coreOpenCart === 'function') {
            return coreOpenCart(); // utaratibu kamili: hydrate + cart + logistics
        }
        // Fallback rahisi (usiweze kuvunjika)
        if (typeof closeModals === 'function') closeModals();
        var cm = document.getElementById('cartModal');
        if (cm) cm.style.display = 'flex';
    };

    // ---- 2) confirmSmartCartOrder (canonical) ----
    window.confirmSmartCartOrder = async function () {
        // NJIA KAMILI: inaunda SokoPay Core order + shipment + tokens,
        // inaweka kiasi cha mwisho na kufungua dirisha la malipo.
        if (typeof coreConfirm === 'function') {
            return coreConfirm();
        }
        // FALLBACK (Unified Handler): iwapo orchestration haijasajiliwa,
        // fungua dirisha la malipo moja kwa moja na kiasi cha mwisho.
        var items = (typeof smartCartItems === 'function')
            ? smartCartItems()
            : (window.myCart || (typeof myCart !== 'undefined' ? myCart : []));
        if (!items || items.length === 0) {
            if (typeof alert === 'function') alert('Kikapu chako kiko wazi.');
            return;
        }
        var calc = (typeof window.smartCartCalculate === 'function')
            ? window.smartCartCalculate()
            : { grandTotal: (window.activeCheckoutAmount || 0) };
        window.activeCheckoutAmount = calc.grandTotal;
        var checkoutInput = document.getElementById('checkoutAmount');
        if (checkoutInput) checkoutInput.value = 'TSh ' + Number(window.activeCheckoutAmount || 0).toLocaleString();
        if (typeof closeModals === 'function') closeModals();
        var chkModal = document.getElementById('checkoutModal');
        if (chkModal) chkModal.style.display = 'flex';
    };
})();

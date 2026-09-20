/* ==== js/12-payments.js ==== */
// ============================================================
// SOKOHAI PAYMENTS — PESAPAL (Phase: AzamPay → PesaPal)
// PesaPal ni hosted checkout: kila malipo (MNO/bank/kadi) hutumia
// redirect ya PesaPal. Siri (consumer key/secret) ziko Cloud Function
// 'pesapalCheckout' PEKEE — browser haioni kabisa.
//
//   skhPesaPalPay({ amount, kind, description, phone, provider, context })
//       -> { ok, redirectUrl, orderTrackingId, error }
//     Inaunda oda ya PesaPal (callable pesapalCheckout), inahifadhi
//     nia (pending intent) kwenye localStorage, na kuelekeza mtumiaji
//     kwenda ukurasa wa PesaPal. Baada ya kurudi, js/17-pesapal-return.js
//     inathibitisha (pesapalTransactionStatus) na kukamilisha mtiririko.
//
//   skhPesaPalPendingWrite / Read / Clear — rekodi ya nia (localStorage)
// ============================================================
(function () {
    'use strict';

    var PENDING_KEY = 'sokohai_pending_payment';

    // Kuchuja ujumbe wa kosa la Firebase callable → ujumbe muhimu kwa mtumiaji.
    // Firebase huficha makosa ya server kama "INTERNAL"; `.details` ndilo
    // lenye ujumbe HALISI kutoka kwenye Cloud Function.
    window.skhPesaPalErrMsg = function (e) {
        if (!e) return 'haijulikani';
        if (typeof e === 'string') return e;
        // [FUNCTIONS RESILIENCE] endpoint haijapelekwa/haipatikani → usimwonyeshe
        // mtumiaji "INTERNAL"; mpe ujumbe wa maana (pesa haijatoka).
        if (e.fnDown) return e.friendlyMessage || 'Huduma ya malipo (SokoPay) haipatikani kwa sasa. Malipo hayajakamilika — jaribu tena baadaye.';
        var m = '';
        if (e.details && typeof e.details === 'string') m = e.details;
        else if (e.details && e.details.message) m = e.details.message;
        else m = e.message || '';
        m = String(m || '').replace(/^Error:\s*/, '').replace(/^\[.*?\]\s*/, '');
        if (!m) m = 'haijulikani';
        if (/^internal$/i.test(m.trim())) {
            // Tofautisha: function haipo (deploy) vs tatizo la siri za PesaPal.
            var code = String(e.code || (e.errorInfo && e.errorInfo.code) || '').toLowerCase();
            if (/not-found|unavailable|deadline/.test(code)) {
                return 'Huduma ya malipo (SokoPay) haijawashwa/haipatikani kwa sasa. Malipo hayajakamilika — tafadhali jaribu tena baadaye au wasiliana na msaada.';
            }
            m = 'hitilafu ya ndani ya server ya malipo. Tafadhali jaribu tena; ikiendelea, wasiliana na msaada (angalia Cloud Functions logs na PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET kwenye functions/.env).';
        }
        return m;
    };

    window.skhPesaPalPendingWrite = function (p) {
        try { localStorage.setItem(PENDING_KEY, JSON.stringify(p || null)); } catch (e) { /* defensive */ }
    };
    window.skhPesaPalPendingRead = function () {
        try {
            var raw = localStorage.getItem(PENDING_KEY);
            if (!raw) return null;
            var p = JSON.parse(raw);
            if (!p || !p.kind) return null;
            var age = Date.now() - (Date.parse(p.savedAt) || 0);
            if (age > 2 * 60 * 60 * 1000) { localStorage.removeItem(PENDING_KEY); return null; } // saa 2
            return p;
        } catch (e) { return null; }
    };
    window.skhPesaPalPendingClear = function () {
        try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* defensive */ }
    };

    function viaServer() {
        return !!(window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.PAYMENTS_VIA_SERVER);
    }

    // Return URL inayoegemewa na PesaPal: origin + '?pesapal_return=1' (hakuna hash)
    function buildReturnUrl() {
        if (window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
            return window.location.origin + '/?pesapal_return=1';
        }
        return '';
    }

    // ----- Anza malipo ya PesaPal (hosted redirect) -----
    // opts: { amount, kind, description, phone, provider, context, txRef, customerName, email }
    window.skhPesaPalPay = async function (opts) {
        opts = opts || {};
        var out = { ok: false, redirectUrl: null, orderTrackingId: null, error: null };

        if (!viaServer() || typeof window.skhServerPaymentsCheckout !== 'function') {
            out.error = "Backend ya malipo (pesapalCheckout) haipatikani. Pakia Cloud Functions na washa PAYMENTS_VIA_SERVER.";
            return out;
        }

        var txRef = String(opts.txRef || ('SKH_' + Date.now()));
        var phone = String(opts.phone || '').replace(/^0/, '255');

        try {
            var res = await window.skhServerPaymentsCheckout({
                amount: opts.amount,
                orderTrackingId: txRef,
                externalId: txRef,
                phone: phone,
                provider: opts.provider || 'PesaPal',
                description: opts.description || 'SokoHai Purchase',
                customerName: opts.customerName || (window.currentUser && (window.currentUser.displayName || window.currentUser.email)) || 'Mteja',
                email: opts.email || (window.currentUser && window.currentUser.email) || '',
                redirectUrl: buildReturnUrl()
            });
            var d = (res && res.data) || {};
            if (!d || !d.ok || !d.redirectUrl) {
                out.error = (d && (d.message || d.error)) || 'PesaPal haikurudisha URL ya malipo.';
                return out;
            }
            out.ok = true;
            out.redirectUrl = d.redirectUrl;
            out.orderTrackingId = d.orderTrackingId || txRef;

            // Hifadhi nia (pending intent) KABLA ya kuelekeza PesaPal
            window.skhPesaPalPendingWrite({
                kind: opts.kind || 'generic',
                orderTrackingId: out.orderTrackingId,
                txRef: txRef,
                amount: opts.amount,
                phone: phone,
                provider: opts.provider || 'PesaPal',
                savedAt: new Date().toISOString(),
                context: opts.context || null
            });

            window.location.href = out.redirectUrl;
            return out;
        } catch (e) {
            out.error = 'PesaPal: ' + (window.skhPesaPalErrMsg ? window.skhPesaPalErrMsg(e) : ((e && e.message) || 'Muunganisho umeshindikana.'));
            return out;
        }
    };

    // Alias ya urahisi (deposit / ada / boost n.k.)
    window.skhPesaPalPayAndRedirect = window.skhPesaPalPay;
})();

/* ==== js/00-config.js ==== */
// ============================================================
// SOKOHAI CONFIG  (Phase 2)
//  USALAMA: PesaPal consumerSecret HAIPASWI kuishi kwenye browser.
// Siri zote za malipo zinaishi Firebase Cloud Functions (functions/.env)
// pekee. Browser inaweka tu URL ya malipo na URL ya kurudi (return).
// Hizi constants za awali za AzamPay zimeondolewa kabisa.
// Browser haina secret yoyote ya PesaPal — zote ziko functions/.env.
// ============================================================

// ============================================================
// MODE ZA MFUMO (Phase 2 — "zuia damu" bila kuvunja chochote)
// ============================================================
window.SOKOHAI_CONFIG = {

    //  AWAMU 1 (USALAMA WA PESA): DEMO_MODE = false -> MODE YA PESA HALISI.
    // Hakuna kujidanganya: malipo yakishindikana, muamala unasimama —
    // oda haiumbwi.  Hii inafanya kazi vizuri BAADA ya kupakia
    // Firebase Cloud Functions (ona folda ya functions/ + README-DEPLOY.md).
    // Ikiwa bado hujapakia functions na unahitaji majaribio, rudisha
    // DEMO_MODE: true hadi deploy ikamilike.
    DEMO_MODE: false,

    // [SANDBOX 2026-09-14] Test/Sandbox mode (§1, §9).
    // false = HAIWEZEKANI kuwasha kwenye host hii (production).
    // Sandbox pia hujiwasha yenyewe kwenye localhost/staging.
    // Hata ikiwa true, bado inahitaji: admin + flag ya mkono.
    ALLOW_SANDBOX: false,

    // Admin: email fallback (ya sasa) + custom claims (njia sahihi, Phase 2.4).
    // Usibadilishe isipokuwa umeshahamisha admin kwenda custom claims.
    ADMIN_EMAIL_FALLBACK: true,

    // [AWAMU 1] MALIPO KUPITIA SERVER (Cloud Functions):
    //   true (sasa) = malipo YOTE yanapita Cloud Function 'pesapalCheckout'
    //                  (secret inaishi functions/.env pekee — browser haioni).
    //   false        = kurudisha njia ya zamani ya client (SI salama — usifanye).
    PAYMENTS_VIA_SERVER: true,

    // [AWAMU 1] WALLET NA ESCROW KUPITIA SERVER (Cloud Functions):
    //   true (sasa) = escrow release NZIMA inafanyika Cloud Function
    // 'escrowRelease' (smart-split atomic + idempotent);
    //                  skhWalletAdjust inapita 'walletAdjust'. Firestore
    //                  rules zinazuia walletBalance kuandikwa na kivinjari.
    //   false        = kurudisha njia ya zamani ya client (SI salama — usifanye).
    WALLET_VIA_SERVER: true,

    // [LIVE-FIX 2026-09] CRON YA KUTOA FEDHA KIOTOMATIKI (SokoPay Auto-Release):
    //   true (sasa) = Cloud Function 'sokopayAutoRelease' (Cloud Scheduler,
    //                 kila dakika 5, server-side, atomic + idempotent) ndiye
    //                 anayeendesha utoaji wa escrow baada ya saa 24. Browser
    //                 HAIFANYI chochote — hii inaokoa gharama/load kwa watumiaji
    //                 wengi (bila hii, kila kivinjari kilikuwa kina-scan orders
    //                 zote kila dakika 5).
    //   false       = kurudisha njia ya zamani (setInterval kwenye browser).
    CRON_VIA_SERVER: true,

    // [PHASE 5.4] MAPATO YA MFUMO KUTOKA DOC MOJA (platform_stats/current):
    //   false (sasa) = daftari la admin linaendelea kusoma adminRevenue
    //                  moja kwa moja (full-scan, cap 1000 — tabia ya sasa).
    //   true         = daftari lasoma DOC MOJA 'platform_stats/current' ambayo
    //                  Cloud Function 'platformStatsHourly' inasasisha kila saa
    //                  (na kitufe cha kusasisha sasa-hapa 'platformStatsRefresh').
    //                  Washa BAADA ya kupakia functions mpya (PHASE5_DEPLOY.md).
    STATS_VIA_DOC: false,

    // ALERTS ZA KISANI (Phase 3.2): alert() za kivinjari zimebadilishwa
    // dialogs/toasts nzuri (js/07-toasts.js). Weka false kurudisha alert
    // za asali za kivinjari.
    NICE_ALERTS: true,

    // [AUDIT-FIX 2026-09-16 P0 §42] UTHIBITISHAJI WA MALIPO KWA SERVER BAADA YA KURUDI PESAPAL:
    //   true (sasa)  = js/17-pesapal-return.js HAIANDIKI 'paid'/'held' kwenye oda
    //                  kabla callable 'pesapalTransactionStatus' kuthibitisha malipo.
    //                  (Awali browser iliandika mafanikio ya malipo bila uthibitisho —
    //                  mtumiaji angeweza kufake malipo kwa link ya kurudi.)
    //   false        = kurudisha tabia ya zamani (SIYO salama — achiwa kwa dharura tu).
    PAYMENT_VERIFY_ON_RETURN: true,

    // [REPAIR 2026-10 M3] Firebase App Check — reCAPTCHA Enterprise SITE key
    // (PUBLIC, si siri). Firebase Console -> App Check -> Apps -> Web app ->
    // reCAPTCHA Enterprise. Tupu = App Check imezimwa.
    APP_CHECK_SITE_KEY: '',

    // [HARDENING 2026-11-16] MAZINGIRA YA FIREBASE KWA HOST (fail-closed).
    // Host inachagua mradi wa Firebase. Host ambayo HAIMO hapa haiwashi Firebase kabisa —
    // inaonyesha "Mazingira hayajasanidiwa" (deploy previews za Netlify, nakala za site, n.k.).
    //  * production: host hizi TU ndizo zinazotumia mradi wa production (sokonet-3b847).
    //  * staging   : host za site ya staging + branch/preview deploys zake
    //                ("<kitu>--<netlifySite>.netlify.app"). `firebase` = config ya web app ya
    //                MRADI WA STAGING (Firebase Console -> Project settings -> Your apps). Si siri.
    //                Ikiwa tupu, staging inaonyesha "haijasanidiwa" — HAIRUDI production kamwe.
    //  * localhost  : emulator pekee (functions/local-server.js). Hakuna production kutoka localhost.
    FIREBASE_ENVIRONMENTS: {
        production: {
            projectId: 'sokonet-3b847',
            hosts: ['sokohai.com', 'www.sokohai.com', 'sokohaicom.netlify.app', 'sokohaimarket.netlify.app']
        },
        staging: {
            hosts: ['sokohai-staging.netlify.app'],
            netlifySite: 'sokohai-staging',
            appCheckSiteKey: '',
            firebase: null
            // firebase: { apiKey: '…', authDomain: 'sokohai-staging.firebaseapp.com', projectId: 'sokohai-staging', storageBucket: 'sokohai-staging.appspot.com', appId: '…' }
        }
    }
};

/* [HARDENING 2026-11-16] Which Firebase project may THIS page use?  Pure function (unit-tested in
   tools/test_firebase_env.mjs); js/app/00-bootstrap.js calls it before initializeApp and refuses to
   start Firebase when it returns env:null.
   in : { hostname, emulator (bool: verified local emulator), productionConfig, environments }
   out: { env: 'emulator'|'production'|'staging'|null, config, appCheckSiteKey, reason } */
window.skhResolveFirebaseEnv = function (input) {
    var inp = input || {};
    var envs = inp.environments || {};
    var prod = envs.production || {}, stg = envs.staging || {};
    var host = String(inp.hostname || '').toLowerCase().replace(/\.$/, '');
    var prodCfg = inp.productionConfig || {};
    function full(c) { return !!(c && c.apiKey && c.authDomain && c.projectId && c.appId); }
    if (inp.emulator === true) return { env: 'emulator', config: prodCfg, appCheckSiteKey: '', reason: 'local-emulator' };
    if (!host) return { env: null, config: null, reason: 'no-host' };
    var prodHosts = Array.isArray(prod.hosts) ? prod.hosts : [];
    if (prodHosts.indexOf(host) !== -1) {
        if (!full(prodCfg) || !prod.projectId || prodCfg.projectId !== prod.projectId) return { env: null, config: null, reason: 'production-config-mismatch' };
        return { env: 'production', config: prodCfg, appCheckSiteKey: null, reason: 'production-host' };
    }
    var stgHosts = Array.isArray(stg.hosts) ? stg.hosts : [];
    var site = String(stg.netlifySite || '').toLowerCase();
    var suffix = '--' + site + '.netlify.app';
    var isStg = stgHosts.indexOf(host) !== -1 || (!!site && /^[a-z0-9-]+$/.test(site) && host.length > suffix.length && host.slice(-suffix.length) === suffix && /^[a-z0-9-]+$/.test(host.slice(0, -suffix.length)));
    if (isStg) {
        var c = stg.firebase;
        if (!full(c)) return { env: null, config: null, reason: 'staging-not-configured' };
        if (c.projectId === prod.projectId || c.projectId === prodCfg.projectId || c.apiKey === prodCfg.apiKey || c.appId === prodCfg.appId) return { env: null, config: null, reason: 'staging-points-at-production' };
        return { env: 'staging', config: Object.assign({}, c), appCheckSiteKey: stg.appCheckSiteKey || '', reason: 'staging-host' };
    }
    return { env: null, config: null, reason: 'unknown-host' };
};

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
    PAYMENT_VERIFY_ON_RETURN: true
};

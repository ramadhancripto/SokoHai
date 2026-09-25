/* ==== js/app/64-i18n-core.js ====
 * SOKOHAI GLOBAL LOCALIZATION CORE (2026-09)
 * ----------------------------------------------------------------------------
 * LAYER YA ARCHITECTURE — 'language sio text replacement'.
 *
 * Hii siyo system mpya: inakamilisha SokoHaiLMS (24-ui-final) + dictionary
 * iliyopo (32-i18n). Kazi katika OP-RA ndio layer ndiyo:
 *
 *   1. NAMESPACES     — t('orders.pending') hutafsiri kupitia alias ya key
 *                       iliyopo. Hakuna duplicate dictionaries.
 *   2. GLOSSARY        — statuses glossaries (canonical PENDING→Inasubiri):
 *                       presentation imebaki kubwa deterministic; backend
 *                       enum (PENDING/ACCEPTED/...) haibadilishi kamwe.
 *   3. PLURALIZATION   — tn(key, count, vars): en_one/en_other + sw_one/sw_other.
 *   4. ERROR MAPPING   — tErr(raw) hutazraw Firebase codes → translation keys.
 *   5. FORMATTING      — skhFmt.date/number/money: locale-aware (sw-TZ/en-GB).
 *   6. VALIDATOR       — runI18nValidation(): missing keys per lugha,
 *                       interpolation mismatch, alias targets zisizpo,
 *                       duplicates, na report ya console (table + return).
 *
 * Kanuni: User generated content (bidhaa/jina/maelezo/uujumbe) HAITOZI
 * kutafsiriwa; brand names (SokoHai/SokoPay) hazibadilishi; deep links hazitegemei lugha.
 */

import { skh } from './00-bootstrap.js';

(function buildLocaleCore() {
    if (window.__skhI18nCoreReady) return;
    window.__skhI18nCoreReady = true;

    function LMS() { return window.SokoHaiLMS || null; }
    function curLang() { var L = LMS(); return L ? L.lang : 'sw'; }

    /* ------------------------------------------------------------------
       1. NAMESPACES — alias map dotted.key -> flat key iliyoajiri kwenye dict.
       Huturuhusu t('orders.pending') bila kuacha jina la zamani litumika mahali pengine.
       ------------------------------------------------------------------ */
    const NS = {
        /* NAVIGATION (§11) */
        'nav.market':        'mode_buyer',
        'nav.products':      'nav_products',
        'nav.services':      'nav_services',
        'nav.transport':     'nav_transport',
        'nav.chat':          'nav_chat',
        'nav.home':          'nav_home',
        /* Majina rasmi ya namespace kulingana na brief (navigation/payments/...) */
        'navigation.home':          'nav_home',
        'navigation.products':      'nav_products',
        'navigation.services':      'nav_services',
        'navigation.transport':     'nav_transport',
        'navigation.chat':          'nav_chat',
        'navigation.market':        'mode_buyer',
        'navigation.language':      'nav_language',
        'navigation.notifications': 'nav_notifications',
        'navigation.work':          'nav_work',
        'payments.balance':         'sp_balance',
        'payments.deposit':         'sp_deposit',
        'payments.withdrawal':      'sp_withdraw',
        'payments.escrow':          'sp_escrow',
        'payments.refund':          'sp_refund',
        'nav.buy':           'nav_buy',
        'nav.language':      'nav_language',
        'nav.notifications': 'nav_notifications',
        'nav.work':          'nav_work',
        /* CHAT STATUS (§17-18) */
        'msg.sent':          'ch_sent',
        'msg.delivered':     'ch_delivered',
        'msg.read':          'ch_seen',
        /* NEGOTIATION (§19) */
        'negotiation.makeOffer':     'ch_make_offer',
        'negotiation.accept':        'ch_accept',
        'negotiation.reject':        'ch_reject',
        'negotiation.counterOffer':  'ch_counter',
        'negotiation.sendFail':      'nego_send_fail',
        /* COMMON QUICK ALIASES (§10) — chuo kwenye chuo cha dict */
        'common.loading':    'common_loading',
        'common.retry':      'common_retry',
        'common.save':       'common_save',
        'common.cancel':     'common_cancel',
        'common.close':      'common_close',
        'common.back':       'common_back',
        'common.search':     'common_search',
        'common.confirm':    'common_confirm',
        'common.delete':     'common_delete',
        'common.edit':       'common_edit',
        'common.view':       'common_view',
        'common.open':       'common_open',
        'common.refresh':    'common_refresh',
        'common.send':       'common_send',
        'common.done':       'common_done',
        'common.yes':        'common_yes',
        'common.no':         'common_no',
        /* ORDERS lifecycle (§22) */
        'orders.pending':        'status_pending',
        'orders.accepted':       'status_accepted',
        'orders.cancelled':      'status_cancelled',
        'orders.completed':      'status_completed',
        'orders.inProgress':     'status_in_progress',
        'orders.disputed':       'status_disputed',
        'orders.refunded':       'status_refunded',
        /* SOKOPAY (§23) */
        'sokopay.balance':       'sp_balance',
        'sokopay.deposit':       'sp_deposit',
        'sokopay.withdrawal':    'sp_withdraw',
        'sokopay.escrow':        'sp_escrow',
        'sokopay.refund':        'sp_refund',
        /* ERRORS (§26) */
        'errors.permissionDenied': 'err_permission_denied',
        'errors.network':          'err_network',
        'errors.failedPrecondition': 'err_failed_precondition',
        'errors.notFound':           'err_not_found',
        'errors.generic':            'err_generic',
        'errors.quota':              'err_quota',
        /* EMPTY (§28) */
        'empty.products':      'empty_products',
        'empty.orders':        'empty_orders',
        'empty.messages':      'empty_messages',
        'empty.notifications': 'empty_notifications',
        /* NOTIFICATIONS (§21) */
        'notif.newProduct':    'notif_new_product',
        'notif.orderAccepted': 'notif_order_accepted'
    };

    /* ------------------------------------------------------------------
       Aliases za status — backend enums zilezile:
         ORDER: PENDING/ACCEPTED/PICKUP_TOKEN_ISSUED/PICKED_UP/IN_TRANSIT/HANDOFF/DELIVERED/RECEIVER_CONFIRMED/COMPLETED/CANCELLED/DISPUTED/REFUNDED
         NEGO:  PENDING/ACCEPTED/REJECTED/COUNTERED/WITHDRAWN/EXPIRED
       ------------------------------------------------------------------ */
    const STATUS_MAP = {   /* family : upper-status -> i18n key */
        order: {
            PENDING:'st_order_PENDING', ACCEPTED:'st_order_ACCEPTED',
            PICKUP_TOKEN_ISSUED:'st_order_PICKUP_TOKEN_ISSUED',
            PICKED_UP:'st_order_PICKED_UP', IN_TRANSIT:'st_order_IN_TRANSIT',
            HANDOFF:'st_order_HANDOFF', DELIVERED:'st_order_DELIVERED',
            RECEIVER_CONFIRMED:'st_order_RECEIVER_CONFIRMED',
            COMPLETED:'st_order_COMPLETED', CANCELLED:'st_order_CANCELLED',
            DISPUTED:'st_order_DISPUTED', REFUNDED:'st_order_REFUNDED'
        },
        delivery: {
            PENDING:'st_del_PENDING', ACCEPTED:'st_del_ACCEPTED',
            PICKED_UP:'st_del_PICKED_UP', IN_TRANSIT:'st_del_IN_TRANSIT',
            HANDOFF:'st_del_HANDOFF', DELIVERED:'st_del_DELIVERED',
            RECEIVER_CONFIRMED:'st_del_RECEIVER_CONFIRMED', COMPLETED:'st_del_COMPLETED',
            /* [GLOSS EXT 2026-09] Hali za dereva/booking + pipeline za commerce (37-negotiation) */
            AWAITING_PICKUP:'st_del_AWAITING_PICKUP',
            PICKUP_PENDING:'st_del_PICKUP_PENDING',
            SELLER_CONFIRMED_HANDOVER:'st_del_SELLER_CONFIRMED_HANDOVER',
            SEARCHING:'st_del_SEARCHING',
            CANCELLED:'st_del_CANCELLED', DISPUTED:'st_del_DISPUTED',
            PAYMENT_PENDING:'st_del_PAYMENT_PENDING',
            HELD:'st_del_HELD', PREPARED:'st_del_PREPARED',
            SHIPPED:'st_del_SHIPPED', CONFIRMED:'st_del_CONFIRMED',
            SERVICE_IN_PROGRESS:'st_del_SERVICE_IN_PROGRESS',
            SERVICE_SUBMITTED:'st_del_SERVICE_SUBMITTED',
            REVISION_REQUESTED:'st_del_REVISION_REQUESTED',
            BOOKING_CONFIRMED:'st_del_BOOKING_CONFIRMED',
            PICKUP:'st_del_PICKUP', HANDOVER:'st_del_HANDOVER',
            PAID:'st_del_PAID'
        },
        nego: {
            PENDING:'st_nego_PENDING', OFFER_SENT:'st_nego_OFFER_SENT',
            COUNTERED:'st_nego_COUNTERED', ACCEPTED:'st_nego_ACCEPTED',
            REJECTED:'st_nego_REJECTED', WITHDRAWN:'st_nego_WITHDRAWN',
            EXPIRED:'st_nego_EXPIRED', AGREEMENT:'st_nego_AGREEMENT',
            FINAL_AGREEMENT:'st_nego_FINAL_AGREEMENT',
            /* [GLOSS EXT 2026-09] Kinds za stage/history (37-negotiation STATE_LABELS) */
            DRAFT:'st_nego_DRAFT',
            COUNTER_OFFER:'st_nego_COUNTER_OFFER',
            CHANGE_REQUESTED:'st_nego_CHANGE_REQUESTED',
            SCOPE_CHANGE_REQUESTED:'st_nego_SCOPE_CHANGE_REQUESTED',
            ROUTE_CHANGE_REQUESTED:'st_nego_ROUTE_CHANGE_REQUESTED',
            RE_NEGOTIATION:'st_nego_RE_NEGOTIATION',
            ORDER_CREATED:'st_nego_ORDER_CREATED',
            COMPLETED:'st_order_COMPLETED', CANCELLED:'st_order_CANCELLED'
        },
        offer: {
            PENDING:'st_off_pending', ACCEPTED:'st_off_accepted',
            REJECTED:'st_off_rejected', COUNTERED:'st_off_countered',
            EXPIRED:'st_off_expired', WITHDRAWN:'st_off_withdrawn'
        },
        payment: {
            PENDING:'st_pay_pending', SUCCESSFUL:'st_pay_successful',
            FAILED:'st_pay_failed', CANCELLED:'st_pay_cancelled'
        }
    };

    /* ------------------------------------------------------------------
       ERROR CODE → KEY (§26): technical codes hazionekani kwa watumiaji.
       Madhiri yahuthi kwenye raw string/class code.
       ------------------------------------------------------------------ */
    function mapErrorToKey(err) {
        var code = '', msg = '';
        if (typeof err === 'string') msg = err;
        else if (err) { code = String(err.code || ''); msg = String(err.message || ''); }
        var probe = (code + ' ' + msg).toLowerCase();
        if (/permission.?denied/.test(probe)) return 'err_permission_denied';
        if (/network|offline|unavailable|failed to fetch|request-failed/.test(probe)) return 'err_network';
        if (/failed.?precondition/.test(probe)) return 'err_failed_precondition';
        if (/not.?found/.test(probe)) return 'err_not_found';
        if (/quota|resource-exhausted/.test(probe)) return 'err_quota';
        if (/unauthenticated|require.?auth|must be signed/.test(probe)) return 'err_unauthenticated';
        if (/invalid.?argument|validation/.test(probe)) return 'err_validation';
        if (/deadline|timeout|timed out/.test(probe)) return 'err_timeout';
        return 'err_generic';
    }

    /* --------- RESOLVER (extension ya LMS.t) --------- */
    function resolveKey(key) {
        var L = LMS(); if (!L) return key;
        // existing flat key ipo → tumia kama ilivyo
        var d = L.dict && L.dict[L.lang] ? L.dict[L.lang] : {};
        if (d[key] !== undefined) return key;
        // dotted alias → flat
        if (key && key.indexOf('.') > -1 && NS[key]) key = NS[key];
        return key;
    }

    /* t(key, vars) — re-wired: dotted aliases + missing-key logging */
    var baseT = window.t || LMS() && LMS().t.bind(LMS());
    window.t = function (key, vars) {
        var L = LMS();
        if (!L && baseT) return baseT(key, vars);
        var k = resolveKey(key);
        var s = L.t(k, vars || {});
        if (s === k && k === key) {
            // missing key — chazia console (dev) na tumia fallback ya key
            try { console.warn('[i18n:miss]', key, 'lang=' + L.lang); } catch (e) {}
        }
        return s;
    };

    /* --------- PLURALIZATION (§50) --------- */
    /* tn(key, count, vars): inatafuta `${key}_one`/`${key}_other` (kivukoni
       kwa en/sw zinapotea). Example: tn('items', 2) → dict.items_other '{count}' → '2 bidhaa'. */
    window.tn = function (key, count, vars) {
        vars = Object.assign({ count: count }, vars || {});
        var k = (count === 1) ? key + '_one' : key + '_other';
        return window.t(k, vars);
    };

    /* --------- ERROR TRANSLATION (§26) --------- */
    window.tErr = function (err, fallbackKey) {
        var k = mapErrorToKey(err);
        return window.t(k) || window.t(fallbackKey || 'err_generic');
    };

    /* --------- STRUCTURED SYSTEM EVENTS (§21) --------- */
    /* Brief: notification ziwe EVENTS, si strings zilizotafsiriwa awali.
       Writers mpya huandika { event: 'tasks.completed', params: {...} }.
       Renderer iko hapa: hutafsiri kwa lugha ya MSOMAJI sasa hivi.
       Docs za zamani (bila `event`) hurudishwa kama zilivyo — zero data loss. */
    var NOTIF_EVENTS = {
        'tasks.completed':            'notif_task_completed',
        /* [EVENTS BATCH 2 2026-09] wallet/malipo/oda/usafiri events */
        'wallet.saleCompleted':       'notif_w_sale',
        'wallet.transportPaid':       'notif_w_transport',
        'wallet.commissionEarned':    'notif_w_commission',
        'wallet.contractCompleted':   'notif_w_contract',
        'wallet.disputeWin':          'notif_w_dispute_win',
        'wallet.disputeLose':         'notif_w_dispute_lose',
        'wallet.splitRefund':         'notif_w_split_refund',
        'wallet.splitPayment':        'notif_w_split_payment',
        'wallet.paymentLink':         'notif_w_paylink',
        'wallet.escrowFunded':        'notif_w_escrow',
        'wallet.autoRelease':         'notif_w_autorelease',
        'wallet.autoReleaseContract': 'notif_w_autorelease_c',
        'agent.activated':            'notif_agent_activated',
        'order.shipped':              'notif_order_shipped_ev',
        'logistics.recoveryStarted':  'notif_log_recovery',
        'logistics.transportFault':   'notif_log_fault',
        /* [EVENTS BATCH 3 2026-09] negotiation lifecycle + cases + custody */
        'nego.orderPrepared':        'notif_nego_prepared',
        'nego.inTransit':            'notif_nego_intransit',
        'nego.delivered':            'notif_nego_delivered',
        'nego.receiptConfirmed':     'notif_nego_receipt',
        'nego.serviceStarted':       'notif_nego_svcstart',
        'nego.workSubmitted':        'notif_nego_worksub',
        'nego.revisionRequested':    'notif_nego_revision',
        'nego.completionConfirmed':  'notif_nego_completion',
        'nego.bookingConfirmed':     'notif_nego_bookingconf',
        'nego.pickupStarted':        'notif_nego_pickup',
        'nego.transitStarted':       'notif_nego_transit',
        'nego.handoverDone':         'notif_nego_handover',
        'nego.receiptConfirmedByYou':'notif_nego_receiptyou',
        'nego.offerReceived':        'notif_nego_offer',
        'nego.countered':            'notif_nego_counter',
        'nego.qtyChangeRequested':   'notif_nego_qtyreq',
        'nego.additionalApproved':   'notif_nego_additional',
        'nego.finalAgreement':       'notif_nego_final',
        'nego.qtyRejected':          'notif_nego_qtyrej',
        'nego.offerAccepted':        'notif_nego_offacc',
        'nego.offerRejected':        'notif_nego_offrej',
        'nego.priceChangeRequested': 'notif_nego_pricereq',
        'nego.bookingCreated':       'notif_nego_booking',
        'nego.orderCreatedEv':       'notif_nego_ordercreated',
        'nego.scopeChangeRequested': 'notif_nego_scopereq',
        'nego.scopeAccepted':        'notif_nego_scopeacc',
        'nego.scopeRejected':        'notif_nego_scoperej',
        'nego.scopeCountered':       'notif_nego_scopecnt',
        'nego.routeChangeRequested': 'notif_nego_routereq',
        'nego.routeAccepted':        'notif_nego_routeacc',
        'nego.routeRejected':        'notif_nego_routerej',
        'nego.routeCountered':       'notif_nego_routecnt',
        'nego.cancelled':            'notif_nego_cancelled',
        'custody.intPickupRequired':    'notif_cust_intpickup',
        'custody.pickupConfirmRequired':'notif_cust_pickupreq',
        'custody.pickedUp':             'notif_cust_picked',
        'custody.transitStarted':       'notif_cust_transit',
        'custody.handoverReady':        'notif_cust_hoready',
        'custody.handoverDone':         'notif_cust_hodone',
        'delivery.transporterAccepted':'notif_transport_accepted',
        'order.accepted':             'notif_order_accepted_ev',
        'order.delivered':            'notif_order_delivered_ev',
        'offer.received':             'notif_offer_received_ev',
        'payment.success':            'notif_pay_success_ev',
        'payment.failed':             'notif_pay_failed_ev'
    };
    window.skhNotifText = function (data) {
        try {
            data = data || {};
            var base = NOTIF_EVENTS[data.event];
            if (base) {
                var vars = data.params || {};
                var title = window.t(base + '_title', vars);
                var body  = window.t(base + '_body', vars);
                return {
                    title: (title && title !== base + '_title') ? title : String(data.title || ''),
                    body:  (body  && body  !== base + '_body')  ? body  : String(data.body  || '')
                };
            }
        } catch (eNotif) {}
        return { title: String((data && data.title) || ''), body: String((data && data.body) || '') };
    };

    /* --------- STATUS PRESENTATION (§22/§64/§74) --------- */
    /* Backend enum HAIBADILISHI. Hii inarudisha label kwa lugha ya sasa.
       family: 'order' | 'delivery' | 'nego' | 'offer' | 'payment' */
    window.tStatus = function (status, family) {
        if (!status) return '';
        var fam = (family && STATUS_MAP[family]) ? family : 'order';
        var key = (STATUS_MAP[fam] || {})[String(status).toUpperCase()];
        if (key) return window.t(key);
        // fallback: uppera jina mbaya → title case (haitaua enum)
        return String(status).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    };

    /* [GLOSS EXT 2026-09] skhGloss(status, family, fallback):
       Ikiwa ipo label ya glossary tumia hiyo; vinginevyo rudi kwa
       `fallback` BILA kubadilisha jina. Hii inawaruhusu map ya zamani
       (mf. ORDER_STATUS_LABELS) kubaki kama fallback halisi. */
    window.skhGloss = function (status, family, fallback) {
        try {
            if (!status) return (fallback != null ? fallback : '');
            var fam = (family && STATUS_MAP[family]) ? family : 'order';
            var key = (STATUS_MAP[fam] || {})[String(status).toUpperCase()];
            if (key) {
                var lbl = window.t(key);
                if (lbl && lbl !== key) return lbl;
                return (fallback != null && fallback !== '') ? fallback : lbl;
            }
        } catch (eGloss) {}
        return (fallback != null && fallback !== '') ? fallback : String(status || '');
    };

    /* --------- LOCALE FORMATTING (§30-§31) --------- */
    function loc() { return curLang() === 'en' ? 'en-GB' : 'sw-TZ'; }
    window.skhFmt = {
        number: function (n) { try { return new Intl.NumberFormat(loc()).format(n); } catch (e) { return String(n); } },
        money: function (n, abbr) {
            var s = window.skhFmt.number(n);
            return (abbr === 'TZS' ? 'TZS ' : 'TSh ') + s;
        },
        date: function (d, opts) {
            try { return new Date(d).toLocaleDateString(loc(), opts || { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return String(d); }
        },
        time: function (d) {
            try { return new Date(d).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }); }
            catch (e) { return String(d); }
        }
    };

    /* ------------------------------------------------------------------
       VALIDATOR (§48/§49/§82) — dev tool: report missing keys per lugha,
       interpolation var mismatch, alias-target gisizpo, duplicates.
       ------------------------------------------------------------------ */
    window.runI18nValidation = function (opts) {
        opts = opts || {};
        var L = LMS();
        if (!L) { console.error('[i18n:val] LOAD SokoHaiLMS hajapakia bado.'); return null; }
        var rep = { missing: [], varMismatch: [], aliasDead: [], duplicates: [] };

        // 1. Missing keys per lugha (dict.entry is rich enough?)
        Object.keys(L.dict.en || {}).forEach(function (k) {
            if (!(k in (L.dict.sw || {}))) rep.missing.push({ key: k, lang: 'sw' });
        });
        Object.keys(L.dict.sw || {}).forEach(function (k) {
            if (!(k in (L.dict.en || {}))) rep.missing.push({ key: k, lang: 'en' });
        });

        // 2. Interpolation variables mismatch (mf. {name} vs {jina} reading the same var names)
        Object.keys(L.dict.en || {}).forEach(function (k) {
            var en = L.dict.en[k] || '', sw = (L.dict.sw || {})[k];
            if (!sw) return;
            var grab = function (s) { var m, out = [], re = /\{([a-zA-Z_][\w]*)\}/g; while ((m = re.exec(s))) out.push(m[1]); return out.sort().join('|'); };
            var ev = grab(en), sv = grab(sw);
            if (ev !== sv) rep.varMismatch.push({ key: k, en: ev, sw: sv });
        });

        // 3. Alias targets zisizpo (namespaces kufuatilia inatechéa)
        Object.keys(NS).forEach(function (dkey) {
            var flat = NS[dkey];
            if (!(flat in (L.dict.en || {})) && !(flat in (L.dict.sw || {}))) rep.aliasDead.push({ alias: dkey, target: flat });
        });

        // 4. Duplicates (same value keys ushuhudiwa kama vitu viwili)
        var seen = {};
        Object.keys(L.dict.en || {}).forEach(function (k) {
            var v = String(L.dict.en[k] || '').trim().toLowerCase();
            if (!v) return;
            if (seen[v]) rep.duplicates.push({ value: L.dict.en[k], keys: [seen[v], k] });
            else seen[v] = k;
        });

        // Report
        try {
            console.group('[i18n:validation]');
            console.log('□ missing   :', rep.missing.length);
            console.log('□ varMismatch:', rep.varMismatch.length);
            console.log('□ aliasDead :', rep.aliasDead.length);
            console.log('□ duplicates:', rep.duplicates.length);
            if (opts.verbose) { console.table(rep.missing); console.table(rep.varMismatch); console.table(rep.aliasDead); console.table(rep.duplicates); }
            console.groupEnd();
        } catch (e) {}
        return rep;
    };

    /* Utils za haraka kwa modules/tuning */
    window.skhLocaleKey = resolveKey;
    window.skhLang = function () { return curLang(); };

    /* ------------------------------------------------------------------
       STATIC PHRASE PACK (deep-l10n 2026-09)
       Brief: kubadilisha lugha KISABADILI KILA KITU. Strings hizi ni
       hardcoded kwenye HTML (index.html) — placeholders, title tooltips
       na maandiko ya onboarding. Zinahifadhiwa kama [swPhrase, key, en]:
       zinasajiliwa kwenye LMS (dict) + phraseKey (kwa translatePhrase),
       hivyo LMS.apply inazibadilisha kiatomatiki kwa text-nodes na
       placeholders. Title attributes zinashughulikiwa na pass maalum.
       ------------------------------------------------------------------ */
    var STATIC_PHRASES = [
        ['Bandika Token (SP-XXXXXX) au Linki hapa...', 'ph_sp_token', 'Paste Token (SP-XXXXXX) or Link here...'],
        ['Tafuta kwa picha', 'tt_search_image', 'Search by image'],
        ['Karibu Kwenye', 'onboard_welcome', 'Welcome to'],
        ['Search, Nunua, Uza, Like, Comment, na Lipa kwa usalama zaidi (Escrow).', 'onboard_tag', 'Search, Buy, Sell, Like, Comment, and Pay more safely (Escrow).'],
        ['ENDELEA NDANI', 'onboard_cta', 'GET STARTED'],
        ['Mf: Mbezi, Karibu na Kanisa', 'ph_loc_example', 'E.g. Mbezi, Near the Church'],
        ['Hifadhi', 'tt_save', 'Save'],
        ['Fuatilia bei', 'tt_track_price', 'Track price'],
        ['Rudi kwenye orodha', 'tt_back_list', 'Back to list'],
        ['Ambatisha (Picha, Faili, Mahali, Bidhaa, Oda...)', 'tt_attach', 'Attach (Photo, File, Location, Product, Order...)'],
        ['Mf: 07XX XXX XXX au Namba ya Benki', 'ph_phone_bank', 'E.g. 07XX XXX XXX or Bank Number'],
        ['Eleza bidhaa yako kwa kina: faida zake, matumizi, ukubwa, rangi n.k...', 'ph_product_desc', 'Describe your product in detail: benefits, uses, size, colour etc...'],
        ['  Tafuta Bidhaa au Scan Barcode hapa...', 'ph_search_product', '  Search Products or Scan Barcode here...'],
        ['Ingiza kiasi alichotoa mteja...', 'ph_amount_withdrawn', 'Enter the amount the customer paid...'],
        ['Ingiza jina la mteja...', 'ph_customer_name', 'Enter customer name...'],
        ['  Andika jina la mteja anayedaiwa...', 'ph_creditor_name', '  Enter the name of the owed customer...'],
        ['  Tafuta bidhaa iliyorudishwa...', 'ph_returned_product', '  Search returned product...'],
        ['Kiasi cha malipo...', 'ph_pay_amount', 'Payment amount...'],
        ['Eleza Uzoefu wako kwa ufupi *', 'ph_experience', 'Briefly describe your Experience *'],
        ['Eleza kwa ufupi jinsi unavyotoa huduma hii kwa wateja...', 'ph_service_how', 'Briefly describe how you deliver this service to clients...'],
        ['Eleza huduma zako za usafirishaji, ratiba, au masharti maalum...', 'ph_shipping_terms', 'Describe your delivery services, schedules, or special terms...'],
        ['Bei ya Chini Kabisa (TSh)', 'ph_min_price', 'Minimum Price (TSh)'],
        ['Rudi Kwenye Soko', 'tt_back_market', 'Back to Market'],
        ['Mf: Malipo ya fundi umeme au shehena ya mchele...', 'ph_pay_reason', 'E.g. Payment for an electrician or rice freight...'],
        ['Maelezo mafupi ya makubaliano...', 'ph_agreement_notes', 'Short agreement notes...'],
        ['Kikapu', 'tt_cart', 'Cart'],
        ['Taarifa', 'tt_notifications', 'Notifications'],
        ['PESA', 'onboard_pesa', 'MONEY'],
        ['Andika maoni yako hapa (Mf: Huduma ni nzuri sana, mzigo umefika on time...)', 'ph_comment', 'Write your comment here (E.g.: Great service, cargo arrived on time...)'],
        ['Bei mpya ya mzigo huu', 'ph_new_price', 'New price for this cargo'],
        ['Kiasi cha fedha', 'ph_amount_money', 'Amount of money'],
        ['Bei ya ununuzi', 'ph_purchase_price', 'Purchase price'],
        ['Eleza kwa ufupi tatizo (Mf: Kioo kimevunjika, duka haliwaki)...', 'ph_problem', 'Briefly describe the problem (E.g.: Broken glass, shop without power)...'],
        ['Eleza kwa ufupi biashara yako...', 'ph_business_desc', 'Briefly describe your business...'],
        ['Andika jina la bidhaa hapa...', 'ph_product_name', 'Write the product name here...'],
        // [DEEP AUDIT #2 2026-09] — strings zilizonaswa audit ya pili (forms/modals/token/payment)
        ['Tafuta, Nunua, Uza, Like, Comment, na Lipa kwa usalama zaidi (Escrow).', 'onboard_tag', 'Search, Buy, Sell, Like, Comment, and Pay more safely (Escrow).'],
        ['Mfano: TV Inchi 55 na Sofa 1', 'ph_cart_items_example', 'e.g.: 55-inch TV and 1 Sofa'],
        ['Ingiza Code (Mfano: ORD-7X92KQ)', 'ph_biz_code', 'Enter Code (e.g.: ORD-7X92KQ)'],
        ['Mfano: Shule ya Sekondari Mbezi', 'ph_school_example', 'e.g.: Mbezi Secondary School'],
        ['Kiasi (Mfano: 10000)', 'ph_amount_example', 'Amount (e.g.: 10000)'],
        ['FUNGA', 'btn_close_caps', 'CLOSE'],
        ['Uhakiki wa kutoa, kupokea na kukabidhi mizigo kwa usalama', 'token_modal_sub', 'Secure issuance, receipt, and handover of cargo'],
        ['Weka Token/Code ya tarakimu 4 uliyopewa na mteja au mfumo ili kuona details na kuhakiki makabidhiano', 'token_modal_hint', 'Enter the 4-digit Token/Code given by the customer or system to view details and verify handover'],
        ['HAKIKI SASA', 'btn_verify_now', 'VERIFY NOW'],
        ['FUNGA DIALOGU', 'btn_close_dialog', 'CLOSE DIALOG'],
        ['Taarifa Zako', 'notif_yours', 'Your Notifications'],
        ['Weka taarifa sahihi za benki au simu kwa kupokea pesa (Withdrawals) au kukatwa (Direct Auto-Pay).', 'pay_hint', 'Enter correct bank or phone details for receiving money (Withdrawals) or deductions (Direct Auto-Pay).'],
        ['Aina ya Njia ya Payment *', 'pay_type_label', 'Payment Method Type *'],
        ['MTUMIAJI', 'onboard_user', 'USER'],
        ['Weka taarifa sahihi za benki, kadi, au mitandao ya simu ili SokoPay iweze kukutumia malipo yako ya Escrow moja kwa moja ukikamilisha kazi.', 'pay_hint2', 'Enter correct bank, card, or mobile network details so SokoPay can send your Escrow payments directly once you complete a job.'],

        // ==== [R16 SITE-WIDE VIEWS PACK 2026-09-17] Usimamizi + Sidebar + Chat ====
        // Usimamizi / role dashboards
        ['Chagua Kategoria', 'r16_choose_cat', 'Choose Category'],
        ['Order na Safari Zangu — Ufuatiliaji', 'r16_orders_trips', 'My Orders & Trips — Tracking'],
        ['Loading oda...', 'r16_loading_orders', 'Loading orders...'],
        ['SokoPay Escrow (Mikataba Ya Payment)', 'r16_escrow_contracts', 'SokoPay Escrow (Payment Contracts)'],
        ['Sanduku la Mikode — Pickup / Handover / Delivery', 'r16_codes_inbox', 'Codes Inbox — Pickup / Handover / Delivery'],
        ['Buyer (Soko) & Order Zangu', 'r16_buyer_orders', 'Buyer (Market) & My Orders'],
        ['Search, Nunua na fuatilia Order Zako (Escrow).', 'r16_buyer_sub', 'Search, Buy and track your Orders (Escrow).'],
        ['Seller wa Bidhaa', 'r16_role_seller', 'Product Seller'],
        ['Dashbodi ya kusimamia bidhaa, oda na mauzo.', 'r16_dash_seller', 'Dashboard for managing products, orders and sales.'],
        ['Mtoa Huduma / Fundi', 'r16_role_provider', 'Service Provider / Craftsman'],
        ['Simamia matangazo yako ya ufundi na mapato.', 'r16_dash_provider', 'Manage your service listings and earnings.'],
        ['Msafirishaji', 'r16_role_driver', 'Transporter'],
        ['Dashbodi ya Boda, Bajaji, au Lori lako na safari.', 'r16_dash_driver', 'Dashboard for your Boda, Bajaji, or Truck and trips.'],
        ['Wakala Sokohai', 'r16_role_agent', 'SokoHai Agent'],
        ['Dashbodi ya miamala na kamisheni yako ya ukweli.', 'r16_dash_agent', 'Dashboard for transactions and your real commission.'],
        ['Admin (Msimamizi)', 'r16_role_admin', 'Admin (Manager)'],
        ['Dashbodi ya Kufuatilia Mfumo mzima na Mapato.', 'r16_dash_admin', 'Dashboard for monitoring the whole system and revenue.'],
        ['Anza Biashara SOKOHAI', 'r16_start_biz', 'Start a Business on SokoHai'],
        ['Chagua aina ya duka unalotaka kufungua sasa:', 'r16_choose_shop', 'Choose the type of shop you want to open now:'],
        ['Duka la Muda (Temporary)', 'r16_temp_shop', 'Temporary Shop'],
        ['Duka la Kudumu (Permanent)', 'r16_perm_shop', 'Permanent Shop'],
        ['Boost Tangazo Lako', 'r16_boost', 'Boost Your Listing'],
        ['Target Views (Lengo la Watazamaji):', 'r16_target_views', 'Target Views:'],
        ['Siku (Days):', 'r16_days', 'Days:'],
        ['Gharama ya Kulipia (TSh):', 'r16_boost_cost', 'Payable Cost (TSh):'],
        ['LIPA NA U-BOOST SASA', 'r16_boost_cta', 'PAY & BOOST NOW'],
        ['Nunua Kifurushi', 'r16_buy_bundle', 'Buy Bundle'],
        ['Usimamizi wa Order', 'r16_order_mgmt', 'Order Management'],
        ['NIMEPOKEA MZIGO VIZURI', 'r16_received_goods', 'I HAVE RECEIVED THE GOODS SAFELY'],
        ['NINA MALALAMIKO (DISPUTE)', 'r16_dispute', 'I HAVE A COMPLAINT (DISPUTE)'],
        ['Inatafuta mawasiliano...', 'r16_searching', 'Searching for contacts...'],
        ['Ombi la Transport', 'r16_transport_req', 'Transport Request'],
        ['Mzigo upo wapi sasa? (Pickup) *', 'r16_pickup_where', 'Where is the cargo now? (Pickup) *'],
        ['Unapelekwa wapi? (Destination) *', 'r16_dest_where', 'Where to? (Destination) *'],
        ['Unasafirisha nini? (Maelezo) *', 'r16_cargo_desc', 'What are you shipping? (Description) *'],
        ['Uzito/Ukubwa Makadirio (Kg/Pcs)', 'r16_est_weight', 'Estimated Weight/Size (Kg/Pcs)'],
        ['TUMA OMBI KWA DEREVA', 'r16_send_driver', 'SEND REQUEST TO DRIVER'],
        // Auth modal
        ['Ingia / Jisajili', 'r16_login_reg', 'Login / Register'],
        ['Umesahau Nenosiri?', 'r16_forgot', 'Forgot Password?'],
        ['INGIA SASA', 'r16_login_now', 'LOG IN NOW'],
        ['au tumia', 'r16_or_use', 'or use'],
        ['Ingia kwa Google', 'r16_google', 'Sign in with Google'],
        ['Huna akaunti?', 'r16_no_account', "Don't have an account?"],
        ['Jiunge Bure', 'r16_join_free', 'Join Free'],
        ['TENGENEZA AKAUNTI', 'r16_create_acc', 'CREATE ACCOUNT'],
        ['Tayari una akaunti?', 'r16_have_acc', 'Already have an account?'],
        ['Ingia Hapa', 'r16_login_here', 'Login Here'],
        // Product modal misc
        ['Maelezo ya bidhaa', 'r16_prod_desc', 'Product description'],
        ['Usambazaji na malipo', 'r16_delivery_pay', 'Delivery and payment'],
        // Chat system
        ['Nyamazisha', 'r16_mute', 'Mute'],
        ['Delete kwangu', 'r16_del_for_me', 'Delete for me'],
        ['Ripoti tatizo', 'r16_report', 'Report a problem'],
        ['Mawasiliano yanalindwa na Sokohai', 'r16_chat_guard', 'Communications are protected by SokoHai'],
        ['Kamera', 'r16_camera', 'Camera'],
        ['Picha & Video', 'r16_media', 'Photos & Videos'],
        ['Hati (Document)', 'r16_document', 'Document'],
        ['Mahali (Location)', 'r16_location', 'Location'],
        ['Bidhaa (Product)', 'r16_product', 'Product'],
        ['Mazungumzo yako ya biashara', 'r16_your_convos', 'Your business conversations'],
        ['Waliozuiwa (Blocked Users)', 'r16_blocked', 'Blocked Users'],
        ['Sambaza ujumbe kwa...', 'r16_broadcast', 'Broadcast message to...'],
        ['Chagua bidhaa kushiriki', 'r16_pick_product', 'Choose a product to share'],
        ['Chagua oda kushiriki', 'r16_pick_order', 'Choose an order to share'],
        // Payment account form
        ['Akaunti ya Payment', 'r16_pay_account', 'Payment Account'],
        ['-- Chagua --', 'r16_select', '-- Select --'],
        ['Mtandao wa Simu (M-Pesa, Tigo, n.k)', 'r16_mobile_net', 'Mobile Network (M-Pesa, Tigo, etc.)'],
        ['Akaunti ya Benki (CRDB, NMB, n.k)', 'r16_bank_acc', 'Bank Account (CRDB, NMB, etc.)'],
        ['Kadi ya Benki (Visa / Mastercard)', 'r16_bank_card', 'Bank Card (Visa / Mastercard)'],
        ['Mtandao *', 'r16_network', 'Network *'],
        ['Jina la Usajili la Laini *', 'r16_line_name', 'Registered Line Name *'],
        ['Jina la Benki *', 'r16_bank_name', 'Bank Name *'],
        // ==== [R16 SIDEBAR PACK] 22-printing quick-menu + 21 account items ====
        ['SOKO (MARKETPLACE)', 'sb_sec_market', 'MARKETPLACE'],
        ['Soko Huru (Feed)', 'sb_feed_all', 'Open Market (Feed)'],
        ['Mchanganyiko wa bidhaa, huduma na usafirishaji', 'sb_feed_all_sub', 'A mix of products, services and transport'],
        ['Bidhaa Sokoni', 'sb_feed_products', 'Market Products'],
        ['Ona bidhaa zote zinazouzwa', 'sb_feed_products_sub', 'See all products on sale'],
        ['Watoa Huduma', 'sb_feed_services', 'Service Providers'],
        ['Mafundi na huduma mbalimbali', 'sb_feed_services_sub', 'Craftsmen and various services'],
        ['Boda, bajaji, gari na mizigo', 'sb_feed_drivers_sub', 'Boda, bajaji, cars and cargo'],
        ['USIMAMIZI (DASHBOARDS)', 'sb_sec_manage', 'MANAGEMENT (DASHBOARDS)'],
        ['Mnunuzi (Soko)', 'sb_mode_buyer', 'Buyer (Market)'],
        ['Tafuta, nunua na fuatilia oda zako', 'sb_mode_buyer_sub', 'Search, buy and track your orders'],
        ['Muuzaji wa Bidhaa', 'sb_mode_seller', 'Product Seller'],
        ['Duka, stoo, mauzo na madeni', 'sb_mode_seller_sub', 'Shop, stock, sales and debts'],
        ['Kazi, mikataba na mapato ya ufundi', 'sb_mode_provider_sub', 'Jobs, contracts and craftsmanship earnings'],
        ['Safari, mizigo, tokens na mapato', 'sb_mode_driver_sub', 'Trips, cargo, tokens and earnings'],
        ['Sajili wanachama na maduka offline', 'sb_mode_agent_sub', 'Register members and offline shops'],
        ['Dhibiti mfumo mzima na mapato', 'sb_mode_admin_sub', 'Oversee the whole system and revenue'],
        ['SOKOPAY & FINANCE', 'sb_sec_pay', 'SOKOPAY & FINANCE'],
        ['SokoPay (Escrow & Trust)', 'sb_sokopay', 'SokoPay (Escrow & Trust)'],
        ['Malipo salama na mikataba ya escrow', 'sb_sokopay_sub', 'Secure payments and escrow contracts'],
        ['SokoPay Wallet', 'sb_wallet', 'SokoPay Wallet'],
        ['Salio lako na njia za malipo', 'sb_wallet_sub', 'Your balance and payment methods'],
        ['Tokens za mizigo na uhakiki', 'sb_token_sub', 'Cargo tokens and verification'],
        ['Oda na safari zako (ufuatiliaji)', 'sb_orders_sub', 'Your orders and trips (tracking)'],
        ['MAWASILIANO', 'sb_sec_comms', 'COMMUNICATION'],
        ['Inbox (Chat)', 'sb_inbox', 'Inbox (Chat)'],
        ['Meseji zako na wauzaji/wateja', 'sb_inbox_sub', 'Your messages with sellers/customers'],
        ['Notifications zako zote', 'sb_notif_sub', 'All your notifications'],
        ['Vitu ulivyovipenda', 'sb_saved_sub', 'Things you loved'],
        // Sidebar drawer misc (22-printing drawer chrome)
        ['WALLET:', 'sb_wallet_lbl', 'WALLET:'],
        ['TOKENS:', 'sb_tokens_lbl', 'TOKENS:'],
        // Account item subtitles (21-sokopay)
        ['Taarifa binafsi, picha, mawasiliano', 'acc_profile_sub', 'Personal info, photo, contacts'],
        ['Toa maoni au omba feature', 'acc_feedback_sub', 'Share feedback or request a feature'],
        ['Jifunze kutumia SokoHai', 'acc_tutorials_sub', 'Learn how to use SokoHai'],
        ['Sheria za matumizi', 'acc_terms_sub', 'Rules of use'],
        ['Sera ya faragha', 'acc_privacy_sub', 'Privacy policy'],
        ['Logout, logout all devices, switch account', 'acc_logout_sub', 'Logout, logout all devices, switch account'],

        // ==== [R16.2] Payment form round-2 + CHAT tabs + misc ====
        ['Namba ya Akaunti ya Benki (Account Number) *', 'r162_acc_num', 'Bank Account Number *'],
        ['Jina la Akaunti (Account Name) *', 'r162_acc_name', 'Account Name *'],
        ['Tawi (Branch Name) (Hiari)', 'r162_branch', 'Branch Name (Optional)'],
        ['Muda wa Kuisha (MM/YY) *', 'r162_expiry', 'Expiry Date (MM/YY) *'],
        ['Jina Lililopo Kwenye Kadi *', 'r162_card_name', 'Name on Card *'],
        ['Taarifa za kadi zinalindwa na hazihifadhiwi waziwazi.', 'r162_card_guard', 'Card details are protected and never stored in plain text.'],
        ['BADILI TAARIFA (EDIT)', 'r162_edit_info', 'EDIT DETAILS'],
        ['SOKOPAY TRANSACTIONS (ESCROW)', 'r162_sokopay_tx', 'SOKOPAY TRANSACTIONS (ESCROW)'],
        ['Loading miamala yako...', 'r162_loading_tx', 'Loading your transactions...'],
        ['‹ Back Kwenye Menu', 'r162_back_menu', '‹ Back to Menu'],
        ['Order (Order)', 'r162_order', 'Order'],
        ['-- -- Chagua --', 'r162_select2', '-- Select --'],
        ['Unread', 'chat_tab_unread', 'Unread'],
        ['Wanunuzi', 'chat_tab_buyers', 'Buyers'],
        ['Wauzaji', 'chat_tab_sellers', 'Sellers'],
        ['Wasafirishaji', 'chat_tab_drivers', 'Transporters'],
        ['Mawakala', 'chat_tab_agents', 'Agents'],
        ['Karibu SokoHai Chat', 'chat_welcome', 'Welcome to SokoHai Chat'],
        ['Anza Chat', 'chat_start', 'Start a Chat'],
        ['Sambaza ujumbe kwa...', 'chat_broadcast2', 'Broadcast message to...'],
        ['Mteja', 'chat_customer', 'Customer'],
        ['Muuzaji', 'chat_seller', 'Seller'],
        ['Msafirishaji', 'chat_driver', 'Transporter'],
        ['Wakala', 'chat_agent', 'Agent'],
        ['Sasa hivi', 'chat_now', 'now'],
        ['Imetumwa', 'chat_sent', 'Sent'],
        ['Imewasilishwa', 'chat_delivered', 'Delivered'],
        ['Imesomwa', 'chat_read', 'Read'],
        // [R16.3] variants zilizoonekana sidebar (sauti nyembamba tofauti)
        ['Usafirishaji', 'r163_transport', 'Transport & Cargo'],
        ['Buyer (Soko)', 'r163_buyer', 'Buyer (Market)'],
        ['Search, nunua na fuatilia oda zako', 'r163_buyer_sub', 'Search, buy and track your orders'],
        ['Payment salama na mikataba ya escrow', 'r163_sokopay_sub', 'Secure payments and escrow contracts'],
        ['Order na safari zako (ufuatiliaji)', 'r163_orders_sub', 'Your orders and trips (tracking)']
    ];
    try {
        var __L0 = LMS();
        if (__L0) {
            STATIC_PHRASES.forEach(function (row) {
                try {
                    __L0.register(row[1], row[2], row[0], 'reviewed');
                    // keyFromPhrase hufanya trim+collapse — phraseKey ziwe normalized vilevile
                    if (__L0.phraseKey) __L0.phraseKey[String(row[0]).replace(/\s+/g, ' ').trim()] = row[1];
                } catch (eReg) {}
            });
        }
    } catch (eStatic) {}

    /* TITLE attributes: LMS hajashughulikia — pass maalum (kwa tooltip). */
    function applyTitles(root) {
        try {
            var L = LMS(); if (!L || typeof L.translatePhrase !== 'function') return;
            var els = (root || document).querySelectorAll('[title]');
            els.forEach(function (el) {
                try {
                    var cur = el.getAttribute('title');
                    if (!cur) return;
                    var nx = L.translatePhrase(cur);
                    if (nx && nx !== cur) el.setAttribute('title', nx);
                } catch (e1) {}
            });
        } catch (e2) {}
    }
    window.skhApplyTitles = applyTitles;

    /* Hook: baada ya kila mabadiliko ya lugha, tafsiri pia title attributes. */
    try {
        var __LW = LMS();
        if (__LW && typeof __LW.setLanguage === 'function' && !__LW.__skhTitleHooked) {
            __LW.__skhTitleHooked = true;
            var __origSet = __LW.setLanguage.bind(__LW);
            __LW.setLanguage = function (lang) {
                var r = __origSet(lang);
                try { applyTitles(document); } catch (eS) {}
                return r;
            };
        }
    } catch (eHook) {}

    /* Nodes mpya (modals zinazofunguliwa baadaye): watcher mwepesi — inaangalia
       title attributes tu ndani ya nodes zilizoingizwa, bila kuvuruga LMS observer. */
    try {
        if (!window.__skhTitleObserver && typeof MutationObserver !== 'undefined') {
            window.__skhTitleObserver = new MutationObserver(function (muts) {
                muts.forEach(function (m) {
                    (Array.prototype.slice.call(m.addedNodes || [])).forEach(function (nd) {
                        if (nd && nd.nodeType === 1) {
                            try { applyTitles(nd); } catch (eN) {}
                        }
                    });
                });
            });
            window.__skhTitleObserver.observe(document.body, { childList: true, subtree: true });
        }
    } catch (eObs) {}

    /* Initial pass baada ya load. */
    try {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(function () { applyTitles(document); }, 800);
        } else {
            document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { applyTitles(document); }, 800); });
        }
    } catch (eInit) {}
})();

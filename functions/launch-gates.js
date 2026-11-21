'use strict';
/* [SOKOHURU 2026-11-21] Server-side launch scope.
 *
 * SokoHai launches as the free marketplace "SokoHuru". Features that move money or depend on SokoPay are
 * switched OFF on the SERVER, not only hidden in the browser: a user who calls one of these callables
 * directly gets `failed-precondition FEATURE_DISABLED` and nothing is written; the matching schedules do
 * nothing. Code, data, tests and UI modules stay in place and come back by flipping one switch.
 *
 * Switch (same document the Firestore rules read): system/launch, written by a super admin only.
 *   { auction, priceDrop, groupBuy, wallet, escrow, checkout, delivery, paidEntitlements : boolean }
 * Resolution, per feature:
 *   1. system/launch.<feature> is a boolean -> that value;
 *   2. otherwise, with SKH_LAUNCH_SCOPE=sokohuru in the functions environment -> OFF (production default);
 *   3. otherwise -> ON (historic behaviour; emulator suites and staging keep working).
 * The document is cached for 30 s per instance. */
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');

/* callable -> feature */
const CALLABLE_FEATURE = {
    // auctions
    auctionPlaceBid: 'auction', auctionFinalize: 'auction', auctionCancel: 'auction', auctionConfirmPayment: 'auction', adminAuctionAction: 'auction',
    // price drop
    priceDropSubmit: 'priceDrop', priceDropSettle: 'priceDrop',
    // group buy (+ Group Soko money pooling)
    groupBuyJoin: 'groupBuy', groupBuyCommitJoin: 'groupBuy', groupBuyLeave: 'groupBuy', groupBuyCancel: 'groupBuy', groupBuySettleNow: 'groupBuy',
    groupSokoCapitalRecord: 'groupBuy', groupSokoCapitalConfirm: 'groupBuy', groupSokoPurchaseStep: 'groupBuy', groupSokoExecute: 'groupBuy',
    // wallet
    walletAdjust: 'wallet', withdrawalRequest: 'wallet', withdrawalResolve: 'wallet',
    // escrow / SokoPay
    escrowRelease: 'escrow', sokopayReleaseLink: 'escrow', sokopayLinkWalletPay: 'escrow', disputeOpen: 'escrow', adminResolveDispute: 'escrow',
    adminPaymentReviewResolve: 'escrow',
    // checkout
    orderWalletPay: 'checkout', serviceOrderWalletPay: 'checkout', pesapalCheckout: 'checkout', pesapalTransactionStatus: 'checkout',
    orderDeliveryCodeIssue: 'checkout', orderConfirmDelivery: 'checkout', negotiationOrderAction: 'checkout', adminApproveOrderPrice: 'checkout',
    // delivery and transport (cancelling / revoking an existing ride stays available: it only reduces exposure)
    deliveryAccept: 'delivery', deliveryOfferAccept: 'delivery', deliveryGenerateToken: 'delivery', deliveryConfirmCustody: 'delivery',
    deliveryStartTransit: 'delivery', deliveryPassengerBoard: 'delivery', deliveryComplete: 'delivery', deliveryDispute: 'delivery',
    deliveryTokenVerify: 'delivery', deliveryRouteBooking: 'delivery', deliveryOfferDecline: 'delivery', deliveryRouteSweep: 'delivery',
    deliveryRouteRetry: 'delivery', deliveryReportTransportFault: 'delivery',
    // paid boost / subscription / agent fee through PesaPal (paid promotions use the manual workflow instead)
    entitlementGrant: 'paidEntitlements'
};
/* schedule -> feature (the sweep is skipped while the feature is off) */
const SCHEDULE_FEATURE = {
    sokopayAutoRelease: 'escrow', pesapalReconcileSweep: 'checkout', commerceModesSweep: 'auction',
    groupBuySweep: 'groupBuy', deliveryOfferExpirySweep: 'delivery'
};
const FEATURES = ['auction', 'priceDrop', 'groupBuy', 'wallet', 'escrow', 'checkout', 'delivery', 'paidEntitlements'];

let cache = { at: 0, data: null };
async function launchDoc() {
    if (cache.data && Date.now() - cache.at < 30000) return cache.data;
    let data = {};
    try { const s = await admin.firestore().doc('system/launch').get(); data = (s.exists && s.data()) || {}; }
    catch (e) { logger.warn('[launch] system/launch unreadable; using environment default', { code: e && e.code }); }
    cache = { at: Date.now(), data };
    return data;
}
async function featureEnabled(feature) {
    const d = await launchDoc();
    if (typeof d[feature] === 'boolean') return d[feature];
    return String(process.env.SKH_LAUNCH_SCOPE || '').toLowerCase() !== 'sokohuru';
}
function resetCache() { cache = { at: 0, data: null }; }

function memoryOf(mb) {
    if (!mb) return undefined;
    if (mb >= 1024 && mb % 1024 === 0) return (mb / 1024) + 'GiB';
    return mb + 'MiB';
}
function callableOptions(e) {
    const o = { region: (e.region && e.region[0]) || 'europe-west1' };
    if (e.timeoutSeconds) o.timeoutSeconds = e.timeoutSeconds;
    const m = memoryOf(e.availableMemoryMb); if (m) o.memory = m;
    if (e.minInstances) o.minInstances = e.minInstances;
    if (e.maxInstances) o.maxInstances = e.maxInstances;
    return o;
}

/* Replace each gated export with a wrapper that checks the switch, then runs the ORIGINAL handler
   unchanged (fn.run). Must run after every export is defined. */
function applyLaunchGates(exp) {
    const gated = [];
    for (const [name, feature] of Object.entries(CALLABLE_FEATURE)) {
        const orig = exp[name];
        if (!orig || !orig.__endpoint || !orig.__endpoint.callableTrigger || typeof orig.run !== 'function') continue;
        const wrapped = onCall(callableOptions(orig.__endpoint), async (req) => {
            if (!(await featureEnabled(feature))) {
                logger.info('[launch] disabled feature called', { fn: name, feature, signedIn: !!(req && req.auth) });
                throw new HttpsError('failed-precondition', 'FEATURE_DISABLED: huduma hii haijawashwa kwenye SokoHuru kwa sasa.', { feature });
            }
            return orig.run(req);
        });
        if (orig.__skhLabel) Object.defineProperty(wrapped, '__skhLabel', { value: orig.__skhLabel, enumerable: false });
        Object.defineProperty(wrapped, '__skhLaunchFeature', { value: feature, enumerable: false });
        exp[name] = wrapped;
        gated.push(name);
    }
    for (const [name, feature] of Object.entries(SCHEDULE_FEATURE)) {
        const orig = exp[name];
        if (!orig || !orig.__endpoint || !orig.__endpoint.scheduleTrigger || typeof orig.run !== 'function') continue;
        const st = orig.__endpoint.scheduleTrigger;
        const opts = { schedule: st.schedule, region: (orig.__endpoint.region && orig.__endpoint.region[0]) || 'europe-west1' };
        if (st.timeZone) opts.timeZone = st.timeZone;
        if (orig.__endpoint.timeoutSeconds) opts.timeoutSeconds = orig.__endpoint.timeoutSeconds;
        const wrapped = onSchedule(opts, async (event) => {
            if (!(await featureEnabled(feature))) { logger.info('[launch] schedule skipped', { fn: name, feature }); return; }
            return orig.run(event);
        });
        Object.defineProperty(wrapped, '__skhLaunchFeature', { value: feature, enumerable: false });
        exp[name] = wrapped;
        gated.push(name);
    }
    return gated;
}

module.exports = { applyLaunchGates, featureEnabled, resetCache, CALLABLE_FEATURE, SCHEDULE_FEATURE, FEATURES };

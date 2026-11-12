/* ==== js/app/20-business-context.js ==== */
/*
 * Business/Store foundation bridge.
 * The core is read-only until the authenticated callable persists the canonical
 * owner-scoped Business/Store pair. Legacy profile fields remain supported.
 */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';
    if (window.__skhBusinessContextBoot) return;
    window.__skhBusinessContextBoot = true;

    var core = window.SKHBusinessContextCore;
    if (!core) throw new Error('Business context core haijapakiwa.');

    skh.normalizeSellerMode = core.normalizeSellerMode;
    skh.normalizeManagement = core.normalizeManagement;
    skh.resolveBusinessContextFromData = core.resolveBusinessContext;
    skh.businessModes = core.MODES;
    skh.managementLevels = core.LEVELS;
    skh.managementCapabilities = core.CAPABILITIES.slice();

    var ensure = null;
    function callable() {
        if (!ensure) ensure = skh.wrapCallable('businessEnsureContext');
        return ensure;
    }

    window.skhResolveBusinessContext = function () {
        var user = skh.currentUserData || {};
        var uid = skh.currentUser && skh.currentUser.uid;
        return core.resolveBusinessContext(uid, user);
    };
    skh.resolveBusinessContext = window.skhResolveBusinessContext;

    window.skhEnsureBusinessContext = async function (input) {
        if (!skh.currentUser || !skh.currentUser.uid) throw new Error('Login inahitajika.');
        var payload = Object.assign({}, input || {});
        delete payload.ownerUid;
        delete payload.businessId;
        delete payload.storeId;
        delete payload.verificationStatus;
        delete payload.status;
        var response = await callable()(payload);
        var data = response && response.data ? response.data : response;
        if (data && data.business) {
            skh.currentUserData = Object.assign({}, skh.currentUserData || {}, {
                businessId: data.business.businessId,
                storeId: data.store.storeId,
                sellerMode: data.sellerMode,
                management: data.management
            });
        }
        return data;
    };

    /* [2026-11-06] Legacy sellers (shop setup completed before the canonical
       Business/Store bridge) have no users.businessId/storeId, so every
       server report (posReports) failed with BUSINESS_STORE_REQUIRED and the
       dashboard wrongly said "Cloud Functions hazipatikani". This creates the
       owner's canonical pair ONCE through the existing server callable, keeping
       the seller's current mode/management (never resetting them to defaults). */
    var scopePromise = null;
    window.skhEnsureBusinessScope = function () {
        var u = skh.currentUserData || {};
        if (u.businessId && u.storeId) return Promise.resolve({ businessId: u.businessId, storeId: u.storeId });
        if (!u.businessSetupComplete) return Promise.resolve({ businessId: null, storeId: null });
        if (!scopePromise) {
            var input = { shopName: u.shopName || u.businessName || u.storeName || '' };
            if (u.sellerMode || u.sellMode) input.sellerMode = u.sellerMode || u.sellMode;
            if (u.management && typeof u.management === 'object') input.management = u.management;
            scopePromise = window.skhEnsureBusinessContext(input).then(function () {
                var v = skh.currentUserData || {};
                return { businessId: v.businessId || null, storeId: v.storeId || null };
            }).catch(function (e) { scopePromise = null; throw e; });
        }
        return scopePromise;
    };
})();

/* SokoHai Business/Store context core — dependency-free, compatibility-only helpers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHBusinessContextCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MODES = Object.freeze({ ONLINE: 'ONLINE', OFFLINE: 'OFFLINE', HYBRID: 'HYBRID', MANAGE: 'MANAGE_ONLY' });
  // [2026-10-31] Seller account lifecycle is NOT a sales mode: temporary/permanent
  // only changes limits and requirements; it never touches channels or data.
  var LIFECYCLE = Object.freeze({ TEMPORARY: 'temporary', PERMANENT: 'permanent' });
  // Limits that exist in today's code (14-map-onboarding.js). productLimit is
  // informational until a server-side limit is approved (not enforced anywhere yet).
  var LIFECYCLE_LIMITS = Object.freeze({ temporary: Object.freeze({ productLimit: 9 }), permanent: Object.freeze({ productLimit: 9999 }) });
  var LEVELS = Object.freeze({ BASIC: 'BASIC', PARTIAL: 'PARTIAL', FULL: 'FULL' });
  var CAPABILITIES = Object.freeze([
    'profile', 'store', 'listings', 'products', 'services', 'transport', 'discover',
    'chat', 'reviews', 'settings', 'inventory', 'pos', 'sales', 'customers',
    'orders', 'expenses', 'purchases', 'profit', 'reports', 'delivery', 'promotions'
  ]);

  function text(value, fallback) {
    var s = value == null ? '' : String(value).trim();
    return s || (fallback || '');
  }

  function normalizeSellerMode(value) {
    var v = text(value).toUpperCase().replace(/[\s-]+/g, '_');
    if (v === 'ONLINE' || v === 'ONLINE_ONLY') return MODES.ONLINE;
    if (v === 'OFFLINE' || v === 'OFFLINE_ONLY') return MODES.OFFLINE;
    if (v === 'HYBRID' || v === 'ONLINE_OFFLINE' || v === 'ONLINE_PLUS_OFFLINE') return MODES.HYBRID;
    if (v === 'MANAGE' || v === 'MANAGE_ONLY') return MODES.MANAGE;
    return null;
  }

  function sellerLifecycleOf(raw) {
    raw = raw || {};
    var t = text(raw.sellerType).toLowerCase();
    if (t === LIFECYCLE.TEMPORARY || t === LIFECYCLE.PERMANENT) return t;
    if (raw.isTemporaryStore === true) return LIFECYCLE.TEMPORARY;
    return null;
  }

  /**
   * Plan a lifecycle change on the SAME account (no new account, ids unchanged).
   * Requirements enforced here are the ones today's product already states:
   * permanent needs an active subscription when the subscription fee is switched on.
   * Identity/KYC verification is reported, not enforced (no approved legal rule yet).
   */
  /**
   * Configurable verification framework (no legal rule is invented here).
   * config (server-only, system_config/seller_verification):
   *   { enforced: false, requirements: [{ id, label, appliesTo: ['*'] | [businessType...] }] }
   * Evidence lives in users.verificationChecks.{id} === true, written by an admin/server only.
   * With no config (default) nothing is required; unmet items are only REPORTED.
   */
  function verificationPlan(config, profile) {
    config = config && typeof config === 'object' ? config : {};
    profile = profile || {};
    var type = text(profile.businessType || profile.primaryProfile) || '*';
    var reqs = (Array.isArray(config.requirements) ? config.requirements : []).filter(function (r) {
      if (!r || !text(r.id)) return false;
      var applies = Array.isArray(r.appliesTo) && r.appliesTo.length ? r.appliesTo : ['*'];
      return applies.indexOf('*') !== -1 || applies.indexOf(type) !== -1;
    });
    var checks = profile.verificationChecks && typeof profile.verificationChecks === 'object' ? profile.verificationChecks : {};
    var unmet = reqs.filter(function (r) { return checks[r.id] !== true; }).map(function (r) { return text(r.id); });
    return { enforced: config.enforced === true, required: reqs.map(function (r) { return text(r.id); }), unmet: unmet, businessType: type };
  }

  function planSellerLifecycleChange(input) {
    input = input || {};
    var from = sellerLifecycleOf(input.profile) || LIFECYCLE.TEMPORARY;
    var to = text(input.target).toLowerCase();
    if (to !== LIFECYCLE.TEMPORARY && to !== LIFECYCLE.PERMANENT) return { ok: false, error: 'TARGET_INVALID', from: from };
    if (from === to) return { ok: true, noop: true, from: from, to: to, limits: LIFECYCLE_LIMITS[to] };
    var unmet = [];
    if (to === LIFECYCLE.PERMANENT && input.subscriptionRequired === true && input.subscriptionActive !== true) unmet.push('SUBSCRIPTION_REQUIRED');
    var verification = verificationPlan(input.verificationConfig, input.profile);
    if (to === LIFECYCLE.PERMANENT && verification.enforced && verification.unmet.length) unmet.push('VERIFICATION_REQUIRED');
    if (unmet.length) return { ok: false, error: unmet[0], unmet: unmet, from: from, to: to, verificationUnmet: verification.unmet };
    var pending = to !== LIFECYCLE.PERMANENT ? [] : (verification.required.length ? verification.unmet : ['IDENTITY_VERIFICATION_NOT_DEFINED']);
    return { ok: true, from: from, to: to, limits: LIFECYCLE_LIMITS[to], pendingVerification: pending, verification: verification };
  }

  function defaultCapabilities(level) {
    var out = {};
    CAPABILITIES.forEach(function (key) { out[key] = false; });
    if (level === LEVELS.BASIC) {
      ['profile','store','listings','products','services','transport','discover','chat','reviews','settings']
        .forEach(function (key) { out[key] = true; });
    } else if (level === LEVELS.FULL) {
      CAPABILITIES.forEach(function (key) { out[key] = true; });
    } else if (level === LEVELS.PARTIAL) {
      ['profile','store','listings','settings'].forEach(function (key) { out[key] = true; });
    }
    return out;
  }

  function normalizeManagement(input) {
    input = input && typeof input === 'object' ? input : {};
    var level = text(input.level || input.managementLevel).toUpperCase();
    if (!LEVELS[level]) level = LEVELS.BASIC;
    var enabled = input.enabled !== false;
    var caps = defaultCapabilities(level);
    var supplied = input.capabilities && typeof input.capabilities === 'object' ? input.capabilities : null;
    if (supplied) CAPABILITIES.forEach(function (key) {
      if (typeof supplied[key] === 'boolean') caps[key] = supplied[key];
    });
    if (!enabled) CAPABILITIES.forEach(function (key) { caps[key] = false; });
    return { enabled: enabled, level: level, capabilities: caps, source: input.source || 'canonical-default' };
  }

  function hasBusinessEvidence(data) {
    data = data || {};
    return !!(data.businessId || data.businessName || data.primaryProfile || data.businessSetupComplete
      || data.shopName || data.storeName || data.myShopCode || data.isBusiness === true);
  }

  function resolveBusinessContext(uid, raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var ownerUid = text(uid || raw.ownerUid || raw.uid);
    var mode = normalizeSellerMode(raw.sellerMode || raw.sellMode || raw.businessMode || raw.prodVisibility);
    var businessEvidence = hasBusinessEvidence(raw);
    var businessId = text(raw.businessId);
    var storeId = text(raw.storeId);
    var businessName = text(raw.businessName || raw.shopName || raw.storeName);
    var storeName = text(raw.storeName || raw.shopName || raw.businessName);
    var managementInput = raw.management || { managementLevel: raw.managementLevel };
    var context = {
      ownerUid: ownerUid || null,
      ownership: { ownerUid: ownerUid || null, verified: !!ownerUid },
      sellerMode: mode,
      management: normalizeManagement(managementInput),
      business: null,
      store: null,
      legacy: {
        source: businessEvidence ? 'user-profile' : 'none',
        businessId: businessId || null,
        storeId: storeId || null,
        myShopCode: text(raw.myShopCode) || null,
        sellMode: text(raw.sellMode) || null,
        sellerType: text(raw.sellerType) || null
      },
      lifecycle: sellerLifecycleOf(raw)
    };
    if (!businessEvidence) return context;
    context.business = {
      id: businessId || null,
      ownerUid: ownerUid || null,
      businessName: businessName || null,
      businessType: text(raw.businessType || raw.primaryProfile) || null,
      categoryId: text(raw.categoryId || raw.category || raw.primaryProfile) || null,
      subcategoryId: text(raw.subcategoryId || raw.subcategory) || null,
      sellerMode: mode,
      management: context.management,
      verificationStatus: text(raw.verificationStatus, 'unverified'),
      visibility: text(raw.visibility || raw.storeVisibility, 'private'),
      contactPolicy: raw.contactPolicy && typeof raw.contactPolicy === 'object' ? raw.contactPolicy : {},
      status: text(raw.status, 'active'),
      canonical: !!businessId,
      source: businessId ? 'user-profile-reference' : 'legacy-user-profile'
    };
    context.store = {
      id: storeId || null,
      businessId: businessId || null,
      ownerUid: ownerUid || null,
      storeName: storeName || null,
      storeLogo: text(raw.storeLogo || raw.logo) || null,
      storeCover: text(raw.storeCover || raw.coverImage) || null,
      categoryId: text(raw.categoryId || raw.category || raw.primaryProfile) || null,
      subcategoryId: text(raw.subcategoryId || raw.subcategory) || null,
      sellerMode: mode,
      locationRef: raw.locationRef || null,
      // [2026-10-31] store address from onboarding; reused as the default product location / pickup point.
      address: text(raw.storeAddress) || null,
      openingHours: raw.openingHours || null,
      pickupAvailable: raw.pickupAvailable === true,
      deliveryAvailable: raw.deliveryAvailable === true,
      verificationStatus: text(raw.storeVerificationStatus || raw.verificationStatus, 'unverified'),
      status: text(raw.storeStatus, 'active'),
      canonical: !!storeId,
      source: storeId ? 'user-profile-reference' : 'legacy-user-profile'
    };
    return context;
  }

  return { MODES: MODES, LEVELS: LEVELS, CAPABILITIES: CAPABILITIES,
    normalizeSellerMode: normalizeSellerMode, normalizeManagement: normalizeManagement,
    resolveBusinessContext: resolveBusinessContext, hasBusinessEvidence: hasBusinessEvidence,
    LIFECYCLE: LIFECYCLE, LIFECYCLE_LIMITS: LIFECYCLE_LIMITS, sellerLifecycleOf: sellerLifecycleOf,
    planSellerLifecycleChange: planSellerLifecycleChange, verificationPlan: verificationPlan };
});

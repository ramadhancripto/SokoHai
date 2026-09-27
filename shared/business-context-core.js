/* SokoHai Business/Store context core — dependency-free, compatibility-only helpers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHBusinessContextCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MODES = Object.freeze({ ONLINE: 'ONLINE', OFFLINE: 'OFFLINE', HYBRID: 'HYBRID' });
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
    return null;
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
      }
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
    resolveBusinessContext: resolveBusinessContext, hasBusinessEvidence: hasBusinessEvidence };
});

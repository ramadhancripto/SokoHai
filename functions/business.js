'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const core = require('./shared/business-context-core');

const db = admin.firestore();
const REGION = 'europe-west1';

function authOf(req) {
  if (!req || !req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Login inahitajika.');
  return req.auth;
}
function clean(value, max) {
  const s = value == null ? '' : String(value).trim();
  return s.slice(0, max || 180);
}
function objectOf(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function allowedContactPolicy(value) {
  const input = objectOf(value); const out = {};
  ['chat', 'contactRequest', 'phone', 'email'].forEach(k => { if (typeof input[k] === 'boolean') out[k] = input[k]; });
  return out;
}
function requestedData(req) {
  const d = objectOf(req.data);
  const mode = core.normalizeSellerMode(d.sellerMode || d.sellMode || d.businessMode);
  const management = core.normalizeManagement(d.management || { managementLevel: d.managementLevel });
  return {
    businessName: clean(d.businessName || d.shopName || d.storeName, 140),
    businessType: clean(d.businessType || d.primaryProfile, 80),
    categoryId: clean(d.categoryId || d.category || d.primaryProfile, 100),
    subcategoryId: clean(d.subcategoryId || d.subcategory, 100),
    description: clean(d.description, 1000),
    sellerMode: mode || core.MODES.ONLINE,
    management,
    visibility: ['private','area','approximate','public','custom'].includes(String(d.visibility || '').toLowerCase()) ? String(d.visibility).toLowerCase() : 'private',
    contactPolicy: allowedContactPolicy(d.contactPolicy),
    storeName: clean(d.storeName || d.shopName || d.businessName, 140),
    storeLogo: clean(d.storeLogo || d.logo, 1000),
    storeCover: clean(d.storeCover || d.coverImage, 1000),
    locationRef: objectOf(d.locationRef),
    openingHours: objectOf(d.openingHours),
    pickupAvailable: d.pickupAvailable === true,
    deliveryAvailable: d.deliveryAvailable === true
  };
}

/*
 * One owner-scoped compatibility bridge. It creates at most one canonical
 * Business and one Store for the authenticated account, while preserving the
 * legacy profile fields and references. Verification/status are never accepted
 * from the browser.
 */
exports.businessEnsureContext = onCall({ region: REGION }, async (req) => {
  const auth = authOf(req);
  const uid = auth.uid;
  const input = requestedData(req);
  const userRef = db.doc('users/' + uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? (userSnap.data() || {}) : {};
  const businessId = clean(user.businessId, 160) || ('business_' + uid);
  const storeId = clean(user.storeId, 160) || ('store_' + uid);
  const businessRef = db.doc('businesses/' + businessId);
  const storeRef = db.doc('stores/' + storeId);
  const now = new Date().toISOString();
  let result = null;

  await db.runTransaction(async tx => {
    const existingBusiness = await tx.get(businessRef);
    const existingStore = await tx.get(storeRef);
    if (existingBusiness.exists && String((existingBusiness.data() || {}).ownerUid || '') !== uid) {
      throw new HttpsError('permission-denied', 'Business hii si ya akaunti hii.');
    }
    if (existingStore.exists && String((existingStore.data() || {}).ownerUid || '') !== uid) {
      throw new HttpsError('permission-denied', 'Store hii si ya akaunti hii.');
    }
    const oldB = existingBusiness.exists ? existingBusiness.data() || {} : {};
    const oldS = existingStore.exists ? existingStore.data() || {} : {};
    const business = {
      businessId, ownerUid: uid,
      businessName: input.businessName || clean(user.businessName || user.shopName || user.storeName, 140) || 'SokoHai Business',
      businessType: input.businessType || clean(user.businessType || user.primaryProfile, 80) || 'general',
      categoryId: input.categoryId || clean(user.categoryId || user.category || user.primaryProfile, 100) || null,
      subcategoryId: input.subcategoryId || clean(user.subcategoryId || user.subcategory, 100) || null,
      description: input.description || clean(user.description || user.about, 1000) || '',
      sellerMode: input.sellerMode,
      management: input.management,
      verificationStatus: oldB.verificationStatus || 'unverified',
      visibility: input.visibility || oldB.visibility || 'private',
      contactPolicy: Object.keys(input.contactPolicy).length ? input.contactPolicy : (oldB.contactPolicy || {}),
      status: oldB.status || 'active',
      legacyOwnerUid: uid,
      legacyBusinessCode: clean(user.myShopCode, 100) || null,
      createdAt: oldB.createdAt || now,
      updatedAt: now
    };
    const store = {
      storeId, businessId, ownerUid: uid,
      storeName: input.storeName || business.businessName,
      storeLogo: input.storeLogo || oldS.storeLogo || clean(user.storeLogo || user.logo, 1000) || null,
      storeCover: input.storeCover || oldS.storeCover || clean(user.storeCover || user.coverImage, 1000) || null,
      categoryId: business.categoryId,
      subcategoryId: business.subcategoryId,
      sellerMode: input.sellerMode,
      locationRef: Object.keys(input.locationRef).length ? input.locationRef : (oldS.locationRef || null),
      openingHours: Object.keys(input.openingHours).length ? input.openingHours : (oldS.openingHours || null),
      pickupAvailable: input.pickupAvailable || oldS.pickupAvailable === true,
      deliveryAvailable: input.deliveryAvailable || oldS.deliveryAvailable === true,
      verificationStatus: oldS.verificationStatus || 'unverified',
      status: oldS.status || 'active',
      createdAt: oldS.createdAt || now,
      updatedAt: now
    };
    tx.set(businessRef, business, { merge: true });
    tx.set(storeRef, store, { merge: true });
    tx.set(userRef, {
      businessId, storeId,
      sellerMode: input.sellerMode,
      management: input.management,
      // Legacy values remain untouched; these fields are compatibility anchors.
      businessContextUpdatedAt: now
    }, { merge: true });
    result = { business, store };
  });
  return { ok: true, ownerUid: uid, business: result.business, store: result.store,
    sellerMode: result.business.sellerMode, management: result.business.management };
});

exports._testing = { requestedData, authOf };

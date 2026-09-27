'use strict';

const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();

function clean(value, max = 160) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function adminClaim(auth) {
  return !!(auth && auth.token && (auth.token.admin === true || auth.token.role === 'admin'));
}

/**
 * Resolves the authenticated caller's Business/Store scope and the Product's
 * legacy/canonical scope. Browser-supplied IDs are requests only; ownership is
 * established from users/{uid}, businesses/{businessId}, stores/{storeId},
 * and the Product document.
 */
async function resolveBusinessStoreContext({ auth, product, requestedBusinessId, requestedStoreId }) {
  if (!auth || !auth.uid) throw new HttpsError('unauthenticated', 'Login inahitajika.');
  const uid = auth.uid;
  const isAdmin = adminClaim(auth);
  const userSnap = await db.doc('users/' + uid).get();
  const user = userSnap.exists ? (userSnap.data() || {}) : {};

  const productOwnerUid = clean(product && (product.userId || product.shopOwnerUid));
  const userOwnerUid = clean(user.shopOwnerUid);
  if (!isAdmin && productOwnerUid && productOwnerUid !== uid && productOwnerUid !== userOwnerUid) {
    throw new HttpsError('permission-denied', 'Product si ya Business/Store hii.');
  }

  const productBusinessId = clean(product && product.businessId);
  const productStoreId = clean(product && product.storeId);
  const userBusinessId = clean(user.businessId);
  const userStoreId = clean(user.storeId);
  const requestedBusiness = clean(requestedBusinessId);
  const requestedStore = clean(requestedStoreId);

  if (productBusinessId && requestedBusiness && productBusinessId !== requestedBusiness) {
    throw new HttpsError('permission-denied', 'Business haifanani na Product.');
  }
  if (productStoreId && requestedStore && productStoreId !== requestedStore) {
    throw new HttpsError('permission-denied', 'Store haifanani na Product.');
  }

  // Canonical Product scope wins. Legacy Products resolve through the
  // authenticated user's canonical profile references, never through random
  // request-supplied IDs.
  const businessId = productBusinessId || userBusinessId || (isAdmin ? requestedBusiness : '');
  const storeId = productStoreId || userStoreId || (isAdmin ? requestedStore : '');

  if (requestedBusiness && businessId && requestedBusiness !== businessId) {
    throw new HttpsError('permission-denied', 'Business request haijaidhinishwa.');
  }
  if (requestedStore && storeId && requestedStore !== storeId) {
    throw new HttpsError('permission-denied', 'Store request haijaidhinishwa.');
  }
  if (requestedBusiness && !businessId && !isAdmin) {
    throw new HttpsError('permission-denied', 'Business haijathibitishwa kwa akaunti hii.');
  }
  if (requestedStore && !storeId && !isAdmin) {
    throw new HttpsError('permission-denied', 'Store haijathibitishwa kwa akaunti hii.');
  }

  let business = null;
  let store = null;
  if (businessId) {
    const snap = await db.doc('businesses/' + businessId).get();
    if (!snap.exists) throw new HttpsError('failed-precondition', 'Business canonical haipo.');
    business = snap.data() || {};
    if (!isAdmin && clean(business.ownerUid) !== uid) {
      throw new HttpsError('permission-denied', 'Business si ya akaunti hii.');
    }
  }
  if (storeId) {
    const snap = await db.doc('stores/' + storeId).get();
    if (!snap.exists) throw new HttpsError('failed-precondition', 'Store canonical haipo.');
    store = snap.data() || {};
    if (clean(store.businessId) && businessId && clean(store.businessId) !== businessId) {
      throw new HttpsError('permission-denied', 'Store si ya Business hii.');
    }
    if (!isAdmin && clean(store.ownerUid) !== uid) {
      throw new HttpsError('permission-denied', 'Store si ya akaunti hii.');
    }
  }

  return {
    uid,
    ownerUid: productOwnerUid || uid,
    businessId: businessId || null,
    storeId: storeId || null,
    business,
    store,
    legacyProduct: !productBusinessId || !productStoreId,
    isAdmin
  };
}

module.exports = { resolveBusinessStoreContext, clean };

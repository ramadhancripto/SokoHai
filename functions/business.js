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

/* [J-J1 2026-11-10] Mwaliko wa mfanyakazi (owner self-service).
 * Tatizo: shop_staff ilikuwa safu za maandishi tu; akaunti halisi ya cashier
 * iliunganishwa na duka TU admin akiandika users.shopOwnerUid (rules
 * zinakataza user kujipangia duka la mtu — kinga sahihi dhidi ya kupanda
 * mamlaka). Matokeo: mmiliki hakuweza kuonboard wafanyakazi mwenyewe.
 * Suluhisho: mmiliki anatengeneza KODI ya mwaliko; mfanyakazi anaingiza kodi
 * (server inathibitisha + inaandika shopOwnerUid + inaunganisha safu ya staff).
 * Kodi haihusishi barua pepe/sim — hakuna lookup ya akaunti za watu. */
const STAFF_ROLES = ['Manager', 'Cashier', 'Storekeeper', 'Pharmacist'];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function inviteCode() {
  const crypto = require('crypto');
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  const buf = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
async function uniqueInviteCode() {
  for (let i = 0; i < 5; i++) {
    const code = inviteCode();
    const hit = await db.collection('staff_invites').where('code', '==', code).where('status', '==', 'pending').limit(1).get();
    if (hit.empty) return code;
  }
  throw new HttpsError('internal', 'Imeshindikana kutengeneza kodi. Jaribu tena.');
}
exports.staffInviteCreate = onCall({ region: REGION }, async (req) => {
  const auth = authOf(req);
  const uid = auth.uid;
  const d = objectOf(req.data);
  const role = STAFF_ROLES.indexOf(String(d.role || '')) !== -1 ? String(d.role) : null;
  if (!role) throw new HttpsError('invalid-argument', 'Chagua nafasi halali ya mfanyakazi.');
  const staffRowId = clean(d.staffRowId, 160);
  if (staffRowId) {
    if (staffRowId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'staffRowId si sahihi.');
    const rs = await db.doc('shop_staff/' + staffRowId).get();
    if (!rs.exists) throw new HttpsError('not-found', 'Safu ya mfanyakazi haipo.');
    const row = rs.data() || {};
    if (String(row.shopOwnerId || '') !== uid) throw new HttpsError('permission-denied', 'Safu hii si ya duka lako.');
    if (row.userId) {
      // Safu inayokaliwa na akaunti ILIYOUNGANISHWA haiwezi kualikwa tena;
      // lakini safu ya aliyeondolewa (stamp imefutwa) INARUHUSIWA (re-join).
      const occ = await db.doc('users/' + String(row.userId)).get();
      if (occ.exists && String((occ.data() || {}).shopOwnerUid || '') === uid) {
        throw new HttpsError('failed-precondition', 'Mfanyakazi huyu tayari ameunganishwa na akaunti.');
      }
    }
  }
  const pend = await db.collection('staff_invites').where('shopOwnerId', '==', uid).where('status', '==', 'pending').limit(60).get();
  if (pend.size >= 50) throw new HttpsError('resource-exhausted', 'Mialiko mingi mno haijatumika. Batilisha mingine kwanza.');
  const code = await uniqueInviteCode();
  const now = new Date().toISOString();
  const ref = await db.collection('staff_invites').add({
    shopOwnerId: uid, role, staffRowId: staffRowId || null, staffName: clean(d.staffName, 120) || null,
    code, status: 'pending', createdBy: uid, createdAt: now,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString()
  });
  return { ok: true, inviteId: ref.id, code, role, expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() };
});
exports.staffInviteAccept = onCall({ region: REGION }, async (req) => {
  const auth = authOf(req);
  const uid = auth.uid;
  const code = String((objectOf(req.data).code) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) throw new HttpsError('invalid-argument', 'Weka kodi ya mwaliko.');
  const q = await db.collection('staff_invites').where('code', '==', code).limit(5).get();
  const inv = q.docs.map(x => ({ id: x.id, d: x.data() || {} })).find(x => x.d.status === 'pending') || null;
  if (!inv) throw new HttpsError('not-found', 'Kodi si sahihi au mwaliko umeshatumika.');
  const owner = String(inv.d.shopOwnerId || '');
  if (!owner) throw new HttpsError('failed-precondition', 'Mwaliko huna duka.');
  if (owner === uid) throw new HttpsError('failed-precondition', 'Huwezi kukubali mwaliko wa duka lako mwenyewe.');
  if (inv.d.expiresAt && Date.parse(inv.d.expiresAt) < Date.now()) throw new HttpsError('deadline-exceeded', 'Mwaliko umeisha muda wake.');
  const uref = db.doc('users/' + uid);
  const now = new Date().toISOString();
  let out = null;
  await db.runTransaction(async (t) => {
    // READS KWANZA (Firestore inakataza read-baada-ya-write kwenye txn).
    const is = await t.get(db.doc('staff_invites/' + inv.id));
    if (!is.exists || (is.data() || {}).status !== 'pending') throw new HttpsError('not-found', 'Mwaliko umeshatumika.');
    const us = await t.get(uref);
    const me = us.exists ? (us.data() || {}) : {};
    const attached = String(me.shopOwnerUid || '');
    if (attached && attached !== uid && attached !== owner) {
      throw new HttpsError('failed-precondition', 'Tayari umeunganishwa na duka lingine. Ondoka kwanza.');
    }
    const rowId = String(inv.d.staffRowId || '');
    let rs = null;
    if (rowId && rowId.indexOf('/') === -1) rs = await t.get(db.doc('shop_staff/' + rowId));
    // Mtu mwingine aliyekalia safu na bado ameunganishwa? Kataa (anti-hijack).
    if (rs && rs.exists) {
      const occ = String((rs.data() || {}).userId || '');
      if (occ && occ !== uid) {
        const occSnap = await t.get(db.doc('users/' + occ));
        if (occSnap.exists && String((occSnap.data() || {}).shopOwnerUid || '') === owner) {
          throw new HttpsError('failed-precondition', 'Safu hii tayari ina mfanyakazi aliyeunganishwa.');
        }
      }
    }
    // WRITES.
    t.set(uref, { shopOwnerUid: owner, staffRole: inv.d.role || null, staffSince: me.staffSince || now }, { merge: true });
    if (rs) {
      if (rs.exists && String((rs.data() || {}).shopOwnerId || '') === owner) {
        t.update(db.doc('shop_staff/' + rowId), { userId: uid, status: 'active', linkedAt: now });
      }
    } else {
      const nm = clean(me.fullName || me.displayName, 120) || 'Mfanyakazi';
      t.set(db.collection('shop_staff').doc(), { shopOwnerId: owner, userId: uid, name: nm, role: inv.d.role || 'Cashier', status: 'active', createdAt: now, linkedAt: now });
    }
    t.update(db.doc('staff_invites/' + inv.id), { status: 'accepted', acceptedBy: uid, acceptedAt: now });
    out = { ok: true, shopOwnerId: owner, role: inv.d.role || null };
  });
  return out;
});
exports.staffInviteRevoke = onCall({ region: REGION }, async (req) => {
  const auth = authOf(req);
  const id = clean(objectOf(req.data).inviteId, 160);
  if (!id || id.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'inviteId inahitajika.');
  const ref = db.doc('staff_invites/' + id);
  const s = await ref.get();
  if (!s.exists) throw new HttpsError('not-found', 'Mwaliko haupo.');
  if (String((s.data() || {}).shopOwnerId || '') !== auth.uid) throw new HttpsError('permission-denied', 'Mwaliko huu si wa duka lako.');
  if ((s.data() || {}).status !== 'pending') return { ok: true, already: true };
  await ref.update({ status: 'revoked', revokedAt: new Date().toISOString() });
  return { ok: true };
});
/* Mmiliki anamwondoa mfanyakazi: stamp inafutwa (inarudi kwa uid wake =
 * "hana duka la nje"), safu zinawekwa inactive. Mshahara uliolipwa hauguswi. */
exports.staffRemove = onCall({ region: REGION }, async (req) => {
  const auth = authOf(req);
  const staffUid = clean(objectOf(req.data).staffUid, 160);
  if (!staffUid || staffUid === auth.uid) throw new HttpsError('invalid-argument', 'staffUid si sahihi.');
  const uref = db.doc('users/' + staffUid);
  const us = await uref.get();
  if (!us.exists || String((us.data() || {}).shopOwnerUid || '') !== auth.uid) {
    throw new HttpsError('not-found', 'Mtumiaji huyu si mfanyakazi wa duka lako.');
  }
  const rows = await db.collection('shop_staff').where('shopOwnerId', '==', auth.uid).where('userId', '==', staffUid).limit(50).get();
  const now = new Date().toISOString();
  await db.runTransaction(async (t) => {
    const cur = await t.get(uref);
    if (String((cur.data() || {}).shopOwnerUid || '') !== auth.uid) throw new HttpsError('not-found', 'Mtumiaji huyu si mfanyakazi wa duka lako.');
    t.set(uref, { shopOwnerUid: staffUid, staffRole: null, staffRemovedAt: now }, { merge: true });
    for (const r of rows.docs) t.update(r.ref, { status: 'inactive', unlinkedAt: now });
  });
  return { ok: true, rows: rows.size };
});

exports._testing = { requestedData, authOf };

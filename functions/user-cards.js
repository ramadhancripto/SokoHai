/**
 * SokoHai — Public user cards (server-maintained privacy projection)
 * [REPAIR 2026-10 C4] Phase 4.
 *
 * Problem: other people's names, photos and shop details were read straight
 * from `users/{id}`, so every signed-in user could also read that person's
 * e-mail, phone, wallet balance, agent codes and cart.
 *
 * Fix: the server copies ONLY public fields into `userCards/{uid}` whenever a
 * `users` document changes. The browser reads other people from `userCards`;
 * `users/{id}` is readable only by its owner, an admin, or the agent who
 * manages that offline member (firestore.rules).
 *
 *   userCardSync          — Firestore trigger on users/{docId}
 *   adminBackfillUserCards — Super Admin, paged, audited (run once after deploy)
 */
'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const db = () => admin.firestore();

// Text fields copied as-is (trimmed, max 300 chars). Nothing private here.
const TEXT_FIELDS = [
    'fullName', 'displayName', 'name', 'userName', 'storeName', 'shopName', 'businessName',
    'photoURL', 'dp', 'logo', 'profileImage', 'coverImage', 'cover',
    'bio', 'about', 'description', 'city', 'region', 'district', 'location',
    'sellerType', 'accountType', 'userRole', 'primaryProfile', 'businessType', 'businessCategory',
    'verificationStatus', 'createdAt', 'memberSince', 'managedByAgentUid'
];
const BOOL_FIELDS = [
    'isSeller', 'isDriver', 'isVerified', 'verified', 'sellerVerified', 'verifiedSeller',
    'driverVerified', 'providerVerified', 'isOfflineUser', 'businessSetupComplete'
];
const NUM_FIELDS = ['rating', 'ratingCount', 'reviewCount', 'followerCount'];

function isBusinessAccount(u) {
    return u.isSeller === true || !!u.sellerType || !!u.shopName || !!u.storeName || !!u.businessName
        || ['seller', 'business', 'provider', 'driver'].indexOf(String(u.userRole || u.accountType || '').toLowerCase()) !== -1;
}

/* Pure: users doc -> public card. Never copies e-mail, private phone, wallet,
 * cart, PIN data, agent codes, admin flags or any other key not listed above. */
function buildUserCard(u, docId) {
    u = u || {};
    const uid = String(u.uid || docId || '');
    const card = { uid, docId: String(docId || uid) };
    TEXT_FIELDS.forEach(k => {
        const v = u[k];
        if (typeof v === 'string' && v.trim()) card[k] = v.trim().slice(0, 300);
        else if (v && typeof v === 'object' && k === 'location' && !Array.isArray(v)) {
            const loc = {};
            ['region', 'district', 'city', 'ward', 'name', 'label'].forEach(x => { if (typeof v[x] === 'string') loc[x] = v[x].slice(0, 120); });
            if (Object.keys(loc).length) card.location = loc;
        }
    });
    BOOL_FIELDS.forEach(k => { if (typeof u[k] === 'boolean') card[k] = u[k]; });
    NUM_FIELDS.forEach(k => { if (Number.isFinite(Number(u[k])) && u[k] !== null && u[k] !== '') card[k] = Number(u[k]); });
    if (Array.isArray(u.followers)) card.followersCount = u.followers.length;
    // Approved-agent badge only when the server stamped the approval (B-03).
    if (u.isApprovedAgent === true && (u.agentApprovedBy || u.approvedBy)) card.isApprovedAgent = true;
    // Business contact number: only for business accounts that chose to sell.
    if (isBusinessAccount(u)) {
        const bp = u.businessPhone || u.shopPhone || u.phone || u.phoneNumber;
        if (typeof bp === 'string' && bp.trim()) card.businessPhone = bp.trim().slice(0, 40);
    }
    card.updatedAt = new Date().toISOString();
    return card;
}

async function syncUserCard(docId, beforeData, afterData) {
    const before = beforeData || null, after = afterData || null;
    const oldUid = before ? String(before.uid || docId) : null;
    if (!after) {
        if (oldUid) await db().doc('userCards/' + oldUid).delete().catch(() => {});
        return { ok: true, deleted: oldUid };
    }
    const card = buildUserCard(after, docId);
    if (!card.uid || card.uid.indexOf('/') !== -1) return { ok: false, reason: 'bad_uid' };
    await db().doc('userCards/' + card.uid).set(card);
    if (oldUid && oldUid !== card.uid) await db().doc('userCards/' + oldUid).delete().catch(() => {});
    return { ok: true, uid: card.uid };
}

exports.userCardSync = onDocumentWritten({ document: 'users/{docId}', region: REGION }, async (event) => {
    const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    await syncUserCard(event.params.docId, before, after);
});

/* One-off / repeatable backfill after deploy. Super Admin only, audited. */
exports.adminBackfillUserCards = onCall({ region: REGION, timeoutSeconds: 540 }, async (req) => {
    const adminAuth = require('./admin-authority')._internal;
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    if (!adminAuth.isSuperAdmin(req)) throw new HttpsError('permission-denied', 'Super Admin pekee.');
    const d = req.data || {};
    const pageSize = Math.min(400, Math.max(1, Number(d.pageSize) || 300));
    let q = db().collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (d.startAfter) q = q.startAfter(String(d.startAfter));
    const snap = await q.get();
    let written = 0, last = null;
    for (const doc of snap.docs) {
        const r = await syncUserCard(doc.id, null, doc.data() || {});
        if (r.ok) written++;
        last = doc.id;
    }
    const done = snap.size < pageSize;
    await adminAuth.writeAudit(req, 'USER_CARDS_BACKFILL', { kind: 'system', id: 'userCards' }, { written, startAfter: d.startAfter || null, last, done });
    return { ok: true, written, next: done ? null : last, done };
});

exports._testing = { buildUserCard, syncUserCard, isBusinessAccount };

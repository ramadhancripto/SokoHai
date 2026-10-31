/**
 * SokoHai — Admin Authority (server-only privileged actions)
 * [REPAIR 2026-10] Phase 2 / Phase 6.
 *
 * Every privileged change goes through these callables. Each one:
 *   1. checks the caller's role on the SERVER (custom claims / verified email);
 *   2. requires a written reason where the action affects another person;
 *   3. writes a permanent, append-only record to `admin_audit_log`
 *      (Firestore rules: read admin, write server only).
 *
 * Roles
 *   superAdmin : claim superAdmin:true, or a VERIFIED email in SUPER_ADMIN_EMAILS
 *                (falls back to ADMIN_EMAILS when SUPER_ADMIN_EMAILS is unset).
 *   admin      : claim admin:true / role:'admin', or a VERIFIED email in ADMIN_EMAILS.
 *   Only a superAdmin can grant or remove admin rights.
 */
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const REGION = 'europe-west1';
const db = () => admin.firestore();
const FieldValue = () => admin.firestore.FieldValue;

function emailsFrom(name) {
    return String(process.env[name] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
function tokenOf(req) { return (req && req.auth && req.auth.token) || {}; }
function verifiedEmail(req) {
    const t = tokenOf(req);
    return (t.email && t.email_verified === true) ? String(t.email).toLowerCase() : '';
}
function isSuperAdmin(req) {
    if (!req || !req.auth) return false;
    const t = tokenOf(req);
    if (t.superAdmin === true) return true;
    const em = verifiedEmail(req);
    const supers = emailsFrom('SUPER_ADMIN_EMAILS');
    const list = supers.length ? supers : emailsFrom('ADMIN_EMAILS');
    return !!em && list.includes(em);
}
function isAdmin(req) {
    if (!req || !req.auth) return false;
    const t = tokenOf(req);
    if (t.admin === true || t.role === 'admin' || t.superAdmin === true) return true;
    const em = verifiedEmail(req);
    return (!!em && emailsFrom('ADMIN_EMAILS').includes(em)) || isSuperAdmin(req);
}
function requireAdmin(req) {
    if (!req || !req.auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    if (!isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    return req.auth;
}
function requireSuperAdmin(req) {
    if (!req || !req.auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    if (!isSuperAdmin(req)) throw new HttpsError('permission-denied', 'Super Admin pekee.');
    return req.auth;
}
function cleanId(v, name) {
    const s = String(v || '').trim();
    if (!s || s.indexOf('/') !== -1 || s.length > 200) throw new HttpsError('invalid-argument', (name || 'id') + ' si sahihi.');
    return s;
}
function requireReason(v, min) {
    const r = String(v || '').trim();
    if (r.length < (min || 5)) throw new HttpsError('invalid-argument', 'Andika sababu (angalau herufi ' + (min || 5) + ').');
    return r.slice(0, 500);
}

/* Append-only audit record. `t` = transaction (optional). */
function auditEntry(req, action, target, details) {
    const t = tokenOf(req);
    return {
        action: String(action),
        actorUid: (req && req.auth && req.auth.uid) || 'system',
        actorEmail: t.email || null,
        actorRole: isSuperAdmin(req) ? 'superAdmin' : (isAdmin(req) ? 'admin' : 'user'),
        target: target || null,
        details: details || {},
        createdAt: new Date().toISOString()
    };
}
async function writeAudit(req, action, target, details, t) {
    const ref = db().collection('admin_audit_log').doc();
    const entry = auditEntry(req, action, target, details);
    if (t) t.set(ref, entry); else await ref.set(entry);
    return ref.id;
}
async function securityEvent(kind, details) {
    try {
        await db().collection('security_events').add({ kind: String(kind), details: details || {}, createdAt: new Date().toISOString() });
    } catch (e) { /* never block the main action */ }
}

// users/{uid} or the legacy doc where uid == uid.
async function userDocFor(uid) {
    if (!uid) return null;
    const direct = await db().doc('users/' + uid).get();
    if (direct.exists) return { id: direct.id, ref: direct.ref, data: direct.data() || {} };
    const q = await db().collection('users').where('uid', '==', uid).limit(1).get();
    if (q.empty) return null;
    return { id: q.docs[0].id, ref: q.docs[0].ref, data: q.docs[0].data() || {} };
}
async function mergeClaims(uid, patch) {
    const u = await admin.auth().getUser(uid);
    const claims = Object.assign({}, u.customClaims || {}, patch);
    Object.keys(claims).forEach(k => { if (claims[k] === null || claims[k] === undefined || claims[k] === false) delete claims[k]; });
    await admin.auth().setCustomUserClaims(uid, claims);
    return claims;
}
async function notify(userId, title, body, type) {
    try {
        await db().collection('notifications').add({ userId, title, body, type: type || 'admin', createdAt: new Date().toISOString(), read: false });
    } catch (e) { /* optional */ }
}

/* ------------------------------------------------------------------
 * AGENTS
 * ---------------------------------------------------------------- */
async function newAgentCode() {
    for (let i = 0; i < 8; i++) {
        const code = 'AGT-' + crypto.randomInt(100000, 999999);
        const q = await db().collection('users').where('myAgentCode', '==', code).limit(1).get();
        if (q.empty) return code;
    }
    throw new HttpsError('internal', 'Imeshindwa kutengeneza namba ya wakala ya kipekee.');
}

const adminApproveAgent = onCall({ region: REGION }, async (req) => {
    requireAdmin(req);
    const d = req.data || {};
    const agentDocId = cleanId(d.agentDocId, 'agentDocId');
    const agentRef = db().doc('agents/' + agentDocId);
    const snap = await agentRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Ombi la wakala halipo.');
    const ag = snap.data() || {};
    const applicantUid = String(ag.userId || '');
    if (!applicantUid) throw new HttpsError('failed-precondition', 'Ombi halina mwombaji (userId).');
    if (applicantUid === req.auth.uid && !isSuperAdmin(req)) {
        throw new HttpsError('permission-denied', 'Admin hawezi kujiidhinisha mwenyewe kuwa wakala.');
    }
    const feeRequired = d.feeWaived === true ? false : (await feeRequiredFor('agent_registration'));
    // isPaid is server-written (paymentFulfill verifies PesaPal); a browser-set
    // feeWaived/paymentStatus is ignored. Only an admin may waive (d.feeWaived).
    if (feeRequired && !(ag.isPaid === true && ag.verifiedPaymentRef)) {
        throw new HttpsError('failed-precondition', 'Ada ya usajili wa wakala haijathibitishwa na server.');
    }
    const user = await userDocFor(applicantUid);
    if (!user) throw new HttpsError('not-found', 'Akaunti ya mwombaji haipatikani.');
    // A legacy approval without approvedBy is re-stamped (admin re-verification, B-03).
    if (ag.status === 'approved' && ag.approvedBy && user.data.isApprovedAgent === true && user.data.agentApprovedBy) {
        return { ok: true, already: true, agentCode: ag.agentCode || user.data.myAgentCode || null };
    }
    const code = ag.agentCode || user.data.myAgentCode || await newAgentCode();
    const now = new Date().toISOString();
    await db().runTransaction(async (t) => {
        t.update(agentRef, {
            status: 'approved', agentCode: code, approvedAt: now, approvedBy: req.auth.uid,
            feeWaived: d.feeWaived === true
        });
        t.update(user.ref, {
            isApprovedAgent: true, myAgentCode: code, agentStatus: 'approved',
            agentApprovedAt: now, agentApprovedBy: req.auth.uid
        });
        await writeAudit(req, 'AGENT_APPROVED', { kind: 'agent', agentDocId, uid: applicantUid },
            { agentCode: code, feeWaived: d.feeWaived === true, note: String(d.note || '').slice(0, 300) }, t);
    });
    try { await mergeClaims(applicantUid, { agent: true }); } catch (e) { /* claim optional; Firestore flag is authoritative */ }
    await notify(applicantUid, 'Hongera! Umeidhinishwa kuwa Wakala',
        'Sasa wewe ni Wakala Rasmi wa SokoHai. Namba yako ni ' + code + '.', 'agent');
    return { ok: true, agentCode: code };
});

const adminRejectAgent = onCall({ region: REGION }, async (req) => {
    requireAdmin(req);
    const d = req.data || {};
    const agentDocId = cleanId(d.agentDocId, 'agentDocId');
    const reason = requireReason(d.reason, 5);
    const agentRef = db().doc('agents/' + agentDocId);
    const snap = await agentRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Ombi la wakala halipo.');
    const ag = snap.data() || {};
    const now = new Date().toISOString();
    await db().runTransaction(async (t) => {
        t.update(agentRef, { status: 'rejected', rejectReason: reason, rejectedAt: now, rejectedBy: req.auth.uid });
        await writeAudit(req, 'AGENT_REJECTED', { kind: 'agent', agentDocId, uid: ag.userId || null }, { reason }, t);
    });
    if (ag.userId) await notify(ag.userId, 'Ombi la uwakala halikukubaliwa', 'Sababu: ' + reason, 'agent');
    return { ok: true };
});

/* Suspend or reinstate an approved agent (keeps the history). */
const adminSetAgentStatus = onCall({ region: REGION }, async (req) => {
    requireAdmin(req);
    const d = req.data || {};
    const uid = cleanId(d.uid, 'uid');
    const status = String(d.status || '');
    if (['approved', 'suspended', 'revoked'].indexOf(status) === -1) throw new HttpsError('invalid-argument', 'Hali si sahihi.');
    const reason = requireReason(d.reason, 5);
    const user = await userDocFor(uid);
    if (!user) throw new HttpsError('not-found', 'Mtumiaji hapatikani.');
    const now = new Date().toISOString();
    const agentsQ = await db().collection('agents').where('userId', '==', uid).limit(20).get();
    await db().runTransaction(async (t) => {
        const up = { isApprovedAgent: status === 'approved', agentStatus: status, agentStatusAt: now, agentStatusBy: req.auth.uid };
        // [REPAIR 2026-10 B-03] a (re)approval is stamped by the acting admin.
        if (status === 'approved') { up.agentApprovedBy = req.auth.uid; up.agentApprovedAt = now; }
        t.update(user.ref, up);
        agentsQ.forEach(a => t.update(a.ref, Object.assign({ status: status === 'approved' ? 'approved' : status, statusReason: reason, statusAt: now },
            status === 'approved' ? { approvedBy: req.auth.uid, approvedAt: now } : {})));
        await writeAudit(req, 'AGENT_STATUS_' + status.toUpperCase(), { kind: 'agent', uid }, { reason }, t);
    });
    try { await mergeClaims(uid, { agent: status === 'approved' ? true : null }); } catch (e) {}
    await notify(uid, 'Hali ya uwakala imebadilika', 'Hali mpya: ' + status + '. Sababu: ' + reason, 'agent');
    return { ok: true };
});

/* ------------------------------------------------------------------
 * ACCOUNTS AND ROLES
 * ---------------------------------------------------------------- */
const adminSetAccountStatus = onCall({ region: REGION }, async (req) => {
    requireAdmin(req);
    const d = req.data || {};
    const uid = cleanId(d.uid, 'uid');
    const status = String(d.status || '');
    if (['active', 'suspended'].indexOf(status) === -1) throw new HttpsError('invalid-argument', 'Hali si sahihi (active/suspended).');
    const reason = requireReason(d.reason, 5);
    if (uid === req.auth.uid) throw new HttpsError('failed-precondition', 'Huwezi kusimamisha akaunti yako mwenyewe.');
    // Only a super admin may suspend another admin.
    let target = null;
    try { target = await admin.auth().getUser(uid); } catch (e) { target = null; }
    const tc = (target && target.customClaims) || {};
    if ((tc.admin || tc.superAdmin || tc.role === 'admin') && !isSuperAdmin(req)) {
        throw new HttpsError('permission-denied', 'Super Admin pekee anaweza kusimamisha admin.');
    }
    if (target) {
        await admin.auth().updateUser(uid, { disabled: status === 'suspended' });
        if (status === 'suspended') await admin.auth().revokeRefreshTokens(uid);
    }
    const user = await userDocFor(uid);
    const now = new Date().toISOString();
    await db().runTransaction(async (t) => {
        if (user) t.update(user.ref, {
            accountStatus: status, isSuspended: status === 'suspended',
            suspendReason: status === 'suspended' ? reason : null,
            suspendedAt: status === 'suspended' ? now : null, suspendedBy: status === 'suspended' ? req.auth.uid : null
        });
        await writeAudit(req, status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_RESTORED', { kind: 'user', uid }, { reason }, t);
    });
    return { ok: true, authUpdated: !!target };
});

/* Grant/remove admin rights. Super admin only. */
const adminSetRole = onCall({ region: REGION }, async (req) => {
    requireSuperAdmin(req);
    const d = req.data || {};
    const uid = cleanId(d.uid, 'uid');
    const role = String(d.role || '');
    if (['admin', 'superAdmin', 'none'].indexOf(role) === -1) throw new HttpsError('invalid-argument', 'role: admin | superAdmin | none');
    const reason = requireReason(d.reason, 5);
    if (uid === req.auth.uid && role === 'none') throw new HttpsError('failed-precondition', 'Huwezi kujiondolea cheo mwenyewe.');
    let target;
    try { target = await admin.auth().getUser(uid); } catch (e) { throw new HttpsError('not-found', 'Akaunti ya Auth haipatikani.'); }
    if (role !== 'none' && target.emailVerified !== true) {
        throw new HttpsError('failed-precondition', 'Email ya akaunti hii haijathibitishwa. Admin lazima awe na email iliyothibitishwa.');
    }
    const claims = await mergeClaims(uid, {
        admin: role === 'admin' || role === 'superAdmin' ? true : null,
        superAdmin: role === 'superAdmin' ? true : null,
        role: role === 'none' ? null : 'admin'
    });
    await admin.auth().revokeRefreshTokens(uid); // the new role applies at next sign-in
    await writeAudit(req, 'ROLE_SET', { kind: 'user', uid, email: target.email || null }, { role, reason });
    await securityEvent('ROLE_CHANGED', { uid, role, by: req.auth.uid });
    return { ok: true, claims };
});

/* Verification of sellers, drivers, service and transport providers. */
const VERIFY_TARGETS = {
    seller:   { collection: 'users', field: 'sellerVerified' },
    driver:   { collection: 'drivers', field: 'verified' },
    transport:{ collection: 'transport_profiles', field: 'verified' },
    logistics:{ collection: 'logistics_companies', field: 'verified' },
    service:  { collection: 'services', field: 'providerVerified' }
};
const adminSetVerification = onCall({ region: REGION }, async (req) => {
    requireAdmin(req);
    const d = req.data || {};
    const kind = String(d.kind || '');
    const spec = VERIFY_TARGETS[kind];
    if (!spec) throw new HttpsError('invalid-argument', 'kind: ' + Object.keys(VERIFY_TARGETS).join(' | '));
    const id = cleanId(d.id, 'id');
    const verified = d.verified === true;
    const reason = requireReason(d.reason, 3);
    let ref = db().doc(spec.collection + '/' + id);
    if (spec.collection === 'users') {
        const u = await userDocFor(id);
        if (!u) throw new HttpsError('not-found', 'Mtumiaji hapatikani.');
        ref = u.ref;
    }
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Rekodi haipatikani.');
    const now = new Date().toISOString();
    await db().runTransaction(async (t) => {
        const patch = { [spec.field]: verified, verificationStatus: verified ? 'verified' : 'rejected', verifiedAt: now, verifiedBy: req.auth.uid, verificationNote: reason };
        if (spec.collection === 'users') patch.isVerified = verified;
        t.update(ref, patch);
        await writeAudit(req, verified ? 'VERIFIED' : 'VERIFICATION_REMOVED', { kind, id }, { reason }, t);
    });
    const owner = (snap.data() || {}).userId || (snap.data() || {}).uid || (spec.collection === 'users' ? id : null);
    if (owner) await notify(owner, verified ? 'Umethibitishwa' : 'Uthibitisho umeondolewa', 'Aina: ' + kind + '. ' + reason, 'verification');
    return { ok: true };
});

/* Hide or restore a listing (product/service) — moderation. */
const adminModerateListing = onCall({ region: REGION }, async (req) => {
    requireAdmin(req);
    const d = req.data || {};
    const col = String(d.collection || '');
    if (['products', 'services'].indexOf(col) === -1) throw new HttpsError('invalid-argument', 'collection: products | services');
    const id = cleanId(d.id, 'id');
    const action = String(d.action || '');
    if (['hide', 'restore'].indexOf(action) === -1) throw new HttpsError('invalid-argument', 'action: hide | restore');
    const reason = requireReason(d.reason, 5);
    const ref = db().doc(col + '/' + id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Tangazo halipo.');
    const now = new Date().toISOString();
    await db().runTransaction(async (t) => {
        t.update(ref, { adminHidden: action === 'hide', moderationStatus: action === 'hide' ? 'hidden' : 'active', moderatedAt: now, moderatedBy: req.auth.uid,
            publicationStatus: action === 'hide' ? 'archived' : ((snap.data() || {}).publicationStatus === 'archived' ? 'published' : ((snap.data() || {}).publicationStatus || 'published')) });
        await writeAudit(req, 'LISTING_' + action.toUpperCase(), { kind: col, id }, { reason }, t);
    });
    const owner = (snap.data() || {}).userId;
    if (owner) await notify(owner, action === 'hide' ? 'Tangazo lako limefichwa' : 'Tangazo lako limerudishwa', 'Sababu: ' + reason, 'moderation');
    return { ok: true };
});

/* [REPAIR 2026-10 Phase 6] Escrow release policy + feature flags.
 * Super admin only, written reason, permanent audit record (before/after).
 * Numbers are hours; null/0 switches that automatic step OFF (manual only). */
const ESCROW_KEYS = { autoReleaseAfterDeliveryHours: [1, 720], linkAutoReleaseHours: [1, 720], disputeWindowHours: [1, 720], deliveryCodeTtlHours: [1, 720] };
const FEATURE_KEYS = ['chatGroupOrders'];
const adminSetEscrowPolicy = onCall({ region: REGION }, async (req) => {
    requireSuperAdmin(req);
    const d = req.data || {};
    const reason = requireReason(d.reason, 10);
    const escrowIn = d.escrow || {}, featuresIn = d.features || {};
    const patch = {}, after = {};
    for (const k of Object.keys(escrowIn)) {
        if (!ESCROW_KEYS[k]) throw new HttpsError('invalid-argument', 'Mpangilio usiojulikana: ' + k);
        const v = escrowIn[k];
        if (v === null || v === 0 || v === '') { patch['escrow.' + k] = null; after[k] = null; continue; }
        const n = Number(v); const [lo, hi] = ESCROW_KEYS[k];
        if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpsError('invalid-argument', k + ' lazima iwe kati ya ' + lo + ' na ' + hi + ' (saa).');
        patch['escrow.' + k] = Math.round(n); after[k] = Math.round(n);
    }
    for (const k of Object.keys(featuresIn)) {
        if (FEATURE_KEYS.indexOf(k) === -1) throw new HttpsError('invalid-argument', 'Feature isiyojulikana: ' + k);
        // Chat-group orders have no server engine yet: they cannot be switched on.
        if (k === 'chatGroupOrders' && featuresIn[k] === true) throw new HttpsError('failed-precondition', 'Oda za Pamoja za makundi bado hazina injini ya server; haziwezi kuwashwa.');
        patch['features.' + k] = featuresIn[k] === true; after['features.' + k] = featuresIn[k] === true;
    }
    if (!Object.keys(patch).length) throw new HttpsError('invalid-argument', 'Hakuna mabadiliko.');
    const ref = db().doc('system/config');
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        const cur = s.exists ? (s.data() || {}) : {};
        const nested = {};
        Object.keys(patch).forEach(k => { const [g, f] = k.split('.'); (nested[g] = nested[g] || {})[f] = patch[k]; });
        // Already audited below; the config-audit trigger skips this writer.
        nested.lastChangedBy = req.auth.uid; nested.lastChangedAt = new Date().toISOString(); nested.lastChangedVia = 'adminSetEscrowPolicy';
        t.set(ref, nested, { merge: true });
        await writeAudit(req, 'ESCROW_POLICY_SET', { kind: 'system', id: 'config' },
            { reason, before: { escrow: cur.escrow || {}, features: cur.features || {} }, after }, t);
    });
    await securityEvent('POLICY_CHANGED', { by: req.auth.uid, after });
    return { ok: true, after };
});

/* Read-only audit log query for the admin dashboard. */
const adminAuditQuery = onCall({ region: REGION }, async (req) => {
    requireAdmin(req);
    const d = req.data || {};
    const limit = Math.min(200, Math.max(1, Number(d.limit) || 50));
    let q = db().collection('admin_audit_log').orderBy('createdAt', 'desc').limit(limit);
    if (d.action) q = db().collection('admin_audit_log').where('action', '==', String(d.action)).limit(limit);
    const snap = await q.get();
    const rows = [];
    snap.forEach(s => rows.push(Object.assign({ id: s.id }, s.data())));
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { ok: true, rows };
});

/* Who am I (role as the SERVER sees it) — used by the admin UI to show/hide tools. */
const adminWhoAmI = onCall({ region: REGION }, async (req) => {
    if (!req || !req.auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    return { ok: true, uid: req.auth.uid, admin: isAdmin(req), superAdmin: isSuperAdmin(req), emailVerified: tokenOf(req).email_verified === true };
});

/* Fees switch helper shared with payments (system/config.fees.<feature>). */
async function feeRequiredFor(feature) {
    try {
        const s = await db().doc('system/config').get();
        const f = (s.exists && (s.data() || {}).fees) || {};
        if (typeof f.enabled === 'boolean') return f.enabled === true;
        return f[feature] === true;
    } catch (e) { return false; }
}

module.exports = {
    adminApproveAgent, adminRejectAgent, adminSetAgentStatus, adminSetEscrowPolicy,
    adminSetAccountStatus, adminSetRole, adminSetVerification, adminModerateListing,
    adminAuditQuery, adminWhoAmI,
    _internal: { isAdmin, isSuperAdmin, writeAudit, auditEntry, securityEvent, userDocFor, requireReason, feeRequiredFor }
};

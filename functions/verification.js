/**
 * SokoHai — identity / business document verification.               [R16 2026-11-13]
 *
 *   verificationSubmit        user sends a document set for review (one open request per user)
 *   adminVerificationQueue    admin: pending (or any status) requests
 *   adminVerificationDocUrls  admin: short-lived SIGNED links to the private document images
 *   adminVerificationDecide   admin: approve / reject with a reason -> users.isVerified + audit + notice
 *
 * Privacy: documents are uploaded to Cloudinary as type 'authenticated' (upload-signing.js, area
 * 'identity'): they are NOT publicly reachable; only this server can mint a signed delivery URL,
 * and only for an admin. Only the LAST 4 characters of an ID number are stored. Uploads of identity
 * documents are refused while signed Cloudinary uploads are not configured (no public fallback).
 */
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const authority = require('./admin-authority');

const REGION = 'europe-west1';
const db = () => admin.firestore();
const { isAdmin, writeAudit, requireReason, userDocFor } = authority._internal;
const DOC_TYPES = ['national_id', 'passport', 'driving_license', 'business_license', 'tin_certificate'];
const MAX_PER_DAY = 3;

function cleanDoc(d, uid) {
    const publicId = String((d && d.publicId) || '');
    const fmt = String((d && d.format) || 'jpg').toLowerCase();
    const version = String((d && d.version) || '').replace(/[^0-9]/g, '');
    if (publicId.indexOf('sokohai/identity/' + uid + '/') !== 0 || publicId.length > 200 || /[^A-Za-z0-9_/.-]/.test(publicId)) throw new HttpsError('invalid-argument', 'hati_si_yako');
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].indexOf(fmt) === -1) throw new HttpsError('invalid-argument', 'aina_ya_picha');
    return { publicId, format: fmt, version, side: ['front', 'back', 'selfie', 'document'].indexOf(String(d.side)) !== -1 ? String(d.side) : 'document' };
}

exports.verificationSubmit = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    const uid = req.auth.uid, d = req.data || {};
    const docType = String(d.docType || '');
    if (DOC_TYPES.indexOf(docType) === -1) throw new HttpsError('invalid-argument', 'docType: ' + DOC_TYPES.join(' | '));
    const last4 = String(d.last4 || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (last4.length !== 4) throw new HttpsError('invalid-argument', 'Andika herufi/namba 4 za mwisho za hati.');
    const docs = (Array.isArray(d.docs) ? d.docs : []).slice(0, 3).map(x => cleanDoc(x, uid));
    if (!docs.length) throw new HttpsError('invalid-argument', 'Pakia picha ya hati.');
    const note = String(d.note || '').replace(/[<>]/g, '').slice(0, 300);
    const ref = db().doc('verification_requests/' + uid), now = new Date().toISOString(), day = now.slice(0, 10);
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        const cur = s.exists ? (s.data() || {}) : {};
        if (cur.status === 'pending') throw new HttpsError('failed-precondition', 'Ombi lako tayari linasubiri ukaguzi.');
        if (cur.status === 'approved' && cur.docType === docType) throw new HttpsError('failed-precondition', 'Hati hii tayari imethibitishwa.');
        const n = cur.day === day ? Number(cur.dayCount || 0) : 0;
        if (n >= MAX_PER_DAY) throw new HttpsError('resource-exhausted', 'Maombi mengi leo. Jaribu kesho.');
        t.set(ref, { uid, docType, last4, docs, note, status: 'pending', submittedAt: now, updatedAt: now, day, dayCount: n + 1,
            attempts: Number(cur.attempts || 0) + 1, decidedAt: null, decidedBy: null, decisionReason: null });
    });
    return { ok: true, status: 'pending' };
});

function needAdmin(req) { if (!req.auth || !isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.'); }

exports.adminVerificationQueue = onCall({ region: REGION }, async (req) => {
    needAdmin(req);
    const status = ['pending', 'approved', 'rejected'].indexOf(String((req.data || {}).status)) !== -1 ? String(req.data.status) : 'pending';
    const q = await db().collection('verification_requests').where('status', '==', status).limit(100).get();
    const rows = q.docs.map(x => { const v = x.data() || {}; return { uid: x.id, docType: v.docType, last4: v.last4, docs: (v.docs || []).length, note: v.note || '', submittedAt: v.submittedAt, attempts: v.attempts || 1, decisionReason: v.decisionReason || null }; })
        .sort((a, b) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')));
    return { ok: true, status, requests: rows };
});

/* Cloudinary signed delivery URL for an 'authenticated' asset:
 * https://res.cloudinary.com/<cloud>/image/authenticated/s--<sig>--/v<ver>/<public_id>.<fmt>
 * sig = first 8 chars of url-safe base64(SHA1("v<ver>/<public_id>.<fmt>" + api_secret)). */
function signedUrl(doc) {
    const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || ''), secret = String(process.env.CLOUDINARY_API_SECRET || '');
    if (!cloud || !secret) return null;
    const tail = (doc.version ? 'v' + doc.version + '/' : '') + doc.publicId + '.' + doc.format;
    const sig = crypto.createHash('sha1').update(tail + secret).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);
    return 'https://res.cloudinary.com/' + cloud + '/image/authenticated/s--' + sig + '--/' + tail;
}

exports.adminVerificationDocUrls = onCall({ region: REGION }, async (req) => {
    needAdmin(req);
    const uid = String((req.data || {}).uid || '');
    if (!uid || uid.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'uid');
    const s = await db().doc('verification_requests/' + uid).get();
    if (!s.exists) throw new HttpsError('not-found', 'Ombi halipo.');
    const v = s.data() || {};
    const urls = (v.docs || []).map(doc => ({ side: doc.side, url: signedUrl(doc) }));
    await writeAudit(req, 'VERIFICATION_DOCS_VIEWED', { kind: 'user', id: uid }, { docType: v.docType, count: urls.length });
    return { ok: true, configured: urls.every(u => !!u.url), docType: v.docType, last4: v.last4, urls };
});

exports.adminVerificationDecide = onCall({ region: REGION }, async (req) => {
    needAdmin(req);
    const d = req.data || {}, uid = String(d.uid || '');
    if (!uid || uid.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'uid');
    const decision = String(d.decision || '');
    if (['approve', 'reject'].indexOf(decision) === -1) throw new HttpsError('invalid-argument', 'decision: approve | reject');
    const reason = requireReason(d.reason, 5);
    const ref = db().doc('verification_requests/' + uid), now = new Date().toISOString();
    const user = await userDocFor(uid);
    if (!user) throw new HttpsError('not-found', 'Mtumiaji hapatikani.');
    let docType = null;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) throw new HttpsError('not-found', 'Ombi halipo.');
        const v = s.data() || {};
        if (v.status !== 'pending') throw new HttpsError('failed-precondition', 'Ombi tayari limeamuliwa (' + v.status + ').');
        docType = v.docType;
        t.update(ref, { status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: now, decidedBy: req.auth.uid, decisionReason: reason, updatedAt: now });
        if (decision === 'approve') t.update(user.ref, { isVerified: true, sellerVerified: true, verificationStatus: 'verified', verifiedAt: now, verifiedBy: req.auth.uid, verificationNote: reason, identityDocType: v.docType });
        else t.update(user.ref, { verificationStatus: 'rejected', verificationNote: reason });
        await writeAudit(req, decision === 'approve' ? 'IDENTITY_VERIFIED' : 'IDENTITY_REJECTED', { kind: 'user', id: uid }, { reason, docType: v.docType }, t);
    });
    try {
        await db().collection('notifications').add({ userId: uid, type: 'verification', source: 'server', read: false, createdAt: now,
            title: decision === 'approve' ? 'Utambulisho wako umethibitishwa' : 'Ombi la uthibitisho limekataliwa',
            body: decision === 'approve' ? 'Akaunti yako sasa ina alama ya "Imethibitishwa".' : 'Sababu: ' + reason + '. Unaweza kutuma hati sahihi tena.' });
    } catch (e) {}
    return { ok: true, decision, docType };
});

exports._testing = { signedUrl, cleanDoc, DOC_TYPES };

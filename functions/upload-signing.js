/**
 * SokoHai — Signed Cloudinary uploads
 * [REPAIR 2026-10 H7] Phase 7.
 *
 * Before: the browser uploaded with an UNSIGNED preset (`Sokohai_preset`), so
 * anyone on the internet could store any file in SokoHai's Cloudinary account.
 *
 * Now: a signed-in, non-suspended user asks this callable for a one-time
 * signature. The server decides the folder (sokohai/<area>/<uid>), applies a
 * per-user hourly quota, and signs with the API secret that lives only in
 * functions/.env. The SIGNED upload preset in the Cloudinary dashboard limits
 * formats and file size. Once the dashboard steps are done, set
 * CLOUDINARY_UPLOAD_MODE=signed and delete/disable the unsigned preset.
 *
 * env (functions/.env):
 *   CLOUDINARY_CLOUD_NAME      e.g. dt7erwy1r (public)
 *   CLOUDINARY_API_KEY         public key id
 *   CLOUDINARY_API_SECRET      SECRET — never in the browser or git
 *   CLOUDINARY_SIGNED_PRESET   name of the signed preset (e.g. sokohai_signed)
 *   CLOUDINARY_UPLOAD_MODE     'signed' (required) | 'transition' (signed when
 *                              configured, unsigned fallback allowed) — default transition
 *   UPLOAD_MAX_PER_HOUR        default 120
 */
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const REGION = 'europe-west1';
const RESOURCE_TYPES = ['image', 'video', 'auto'];

/* [PHASE 9] File types are now part of the SIGNATURE (Cloudinary
 * "allowed_formats"), so a signed upload cannot carry anything else even if the
 * dashboard preset is left loose. Audio uploads as Cloudinary "video".
 * Documents only where the app really sends them: chat files and printing jobs
 * (resource type "auto"). SVG only for the admin creative library. */
const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp'];
const AV_FORMATS = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv', 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'];
const DOC_FORMATS = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'];
function allowedFormats(resourceType, area) {
    let list;
    if (resourceType === 'video') list = AV_FORMATS.slice();
    else if (resourceType === 'image') list = IMAGE_FORMATS.slice();
    else list = IMAGE_FORMATS.concat(AV_FORMATS, DOC_FORMATS);
    if (area === 'creative-assets' && resourceType !== 'video') list.push('svg');
    return list.join(',');
}

function cfg() {
    return {
        cloud: String(process.env.CLOUDINARY_CLOUD_NAME || ''),
        apiKey: String(process.env.CLOUDINARY_API_KEY || ''),
        secret: String(process.env.CLOUDINARY_API_SECRET || ''),
        preset: String(process.env.CLOUDINARY_SIGNED_PRESET || ''),
        mode: String(process.env.CLOUDINARY_UPLOAD_MODE || 'transition').toLowerCase(),
        maxPerHour: Math.max(1, Number(process.env.UPLOAD_MAX_PER_HOUR) || 120)
    };
}

/* Cloudinary signature: params sorted by key, "k=v" joined with "&", secret
 * appended, SHA-1 hex (https://cloudinary.com/documentation/authentication_signatures). */
function signParams(params, secret) {
    const base = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
        .sort().map(k => k + '=' + params[k]).join('&');
    return crypto.createHash('sha1').update(base + secret).digest('hex');
}

/* Requested folder -> safe area slug. The uid is always appended by the server. */
function areaOf(requested) {
    const s = String(requested || '').toLowerCase().replace(/^sokohai[_/-]*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return (s || 'general').slice(0, 40);
}

exports.uploadSignature = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login inahitajika kupakia picha.');
    const c = cfg();
    const d = req.data || {};
    const resourceType = RESOURCE_TYPES.indexOf(String(d.resourceType || 'image')) !== -1 ? String(d.resourceType || 'image') : 'image';
    const configured = !!(c.cloud && c.apiKey && c.secret && c.preset);
    if (!configured) {
        if (c.mode === 'signed') throw new HttpsError('failed-precondition', 'Upload salama haijasanidiwa kwenye server (CLOUDINARY_*).');
        return { ok: true, mode: 'unsigned' }; // transition only: browser keeps the old preset
    }
    const db = admin.firestore();
    const uid = req.auth.uid;
    // Suspended accounts cannot upload.
    try {
        const u = await db.doc('users/' + uid).get();
        const ud = u.exists ? (u.data() || {}) : {};
        if (ud.accountStatus === 'suspended' || ud.suspended === true || ud.isSuspended === true) {
            throw new HttpsError('permission-denied', 'Akaunti imesimamishwa.');
        }
    } catch (e) { if (e instanceof HttpsError) throw e; }
    // Per-user hourly quota (server-only collection).
    const hour = new Date().toISOString().slice(0, 13);
    const qRef = db.doc('upload_quota/' + uid);
    await db.runTransaction(async (t) => {
        const s = await t.get(qRef);
        const q = s.exists ? (s.data() || {}) : {};
        const used = q.hour === hour ? Number(q.count || 0) : 0;
        if (used >= c.maxPerHour) throw new HttpsError('resource-exhausted', 'Umepakia mara nyingi sana saa hii. Jaribu baadaye.');
        t.set(qRef, { hour, count: used + 1, updatedAt: new Date().toISOString() });
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const area = areaOf(d.folder || d.purpose);
    const folder = 'sokohai/' + area + '/' + uid;
    const formats = allowedFormats(resourceType, area);
    const params = { allowed_formats: formats, folder, timestamp, upload_preset: c.preset };
    return {
        ok: true, mode: 'signed', cloudName: c.cloud, apiKey: c.apiKey, resourceType,
        folder, timestamp, uploadPreset: c.preset, allowedFormats: formats, signature: signParams(params, c.secret)
    };
});

exports._testing = { signParams, areaOf, cfg, allowedFormats };

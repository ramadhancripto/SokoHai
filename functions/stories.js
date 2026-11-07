/**
 * SokoHai — Stories (Chat Discovery story / video viewer)  [R13-B 2026-11]
 *
 * A story is a short image or video from a user or business, live for 24 hours, optionally
 * linked to a SokoHai listing (product / service / transport). Media must be the AUTHOR'S OWN
 * signed upload (res.cloudinary.com/.../sokohai/<area>/<uid>/...), so nobody can post someone
 * else's file or an outside link. Visibility: public or followers. Views are counted once per
 * viewer. Reports go to admins; the author or an admin can remove a story.
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const REGION = 'europe-west1';
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;
const TTL_MS = 24 * 60 * 60 * 1000, MAX_PER_DAY = 20;
const clean = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const sid = (v) => { const s = String(v || ''); if (!s || s.length > 128 || s.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'id_si_sahihi'); return s; };
const isAdminToken = (req) => { const t = (req.auth && req.auth.token) || {}; return t.admin === true || t.superAdmin === true; };

function ownMedia(url, uid) {
    let u; try { u = new URL(String(url || '')); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') return null;
    const m = /^\/[A-Za-z0-9_-]+\/(image|video)\/upload\/(?:[^/]+\/)*sokohai\/[a-z0-9-]+\/([A-Za-z0-9_-]+)\/[^/]+$/.exec(u.pathname);
    if (!m || m[2] !== uid) return null;
    return { kind: m[1], url: u.toString() };
}

exports.storyCreate = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid, d = req.data || {};
    const us = await db().doc('users/' + uid).get();
    const u = us.exists ? (us.data() || {}) : null;
    if (!u) throw new HttpsError('failed-precondition', 'akaunti_haipo');
    if (u.accountStatus === 'suspended' || u.isSuspended === true) throw new HttpsError('permission-denied', 'akaunti_imesimamishwa');
    const media = ownMedia(d.mediaUrl, uid);
    if (!media) throw new HttpsError('invalid-argument', 'picha_au_video_yako_pekee');
    let listing = null;
    if (d.listing && d.listing.id) {
        const col = ['products', 'services', 'drivers'].indexOf(d.listing.col) !== -1 ? d.listing.col : 'products';
        const ls = await db().doc(col + '/' + sid(d.listing.id)).get();
        if (!ls.exists) throw new HttpsError('failed-precondition', 'tangazo_halipo');
        const L = ls.data() || {};
        if (String(L.userId || '') !== uid) throw new HttpsError('permission-denied', 'si_tangazo_lako');
        listing = { col, id: ls.id, title: clean(L.title || L.driverName, 120), price: Number(L.price) || null };
    }
    const since = new Date(Date.now() - TTL_MS).toISOString();
    const recent = await db().collection('stories').where('authorUid', '==', uid).where('createdAt', '>=', since).limit(MAX_PER_DAY + 1).get();
    if (recent.size >= MAX_PER_DAY) throw new HttpsError('resource-exhausted', 'stories_nyingi_leo');
    const now = Date.now();
    const ref = db().collection('stories').doc();
    await ref.set({ authorUid: uid, authorName: clean(u.businessName || u.fullName || u.displayName || 'Mtumiaji', 80), kind: media.kind, mediaUrl: media.url,
        caption: clean(d.caption, 200), listing, visibility: d.visibility === 'followers' ? 'followers' : 'public', status: 'active',
        viewCount: 0, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MS).toISOString(), expiresAtMs: now + TTL_MS });
    return { ok: true, storyId: ref.id };
});

exports.storyView = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const ref = db().doc('stories/' + sid((req.data || {}).storyId));
    const vref = ref.collection('views').doc(req.auth.uid);
    let counted = false;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) throw new HttpsError('not-found', 'story_haipo');
        const st = s.data() || {};
        if (st.status !== 'active' || Date.parse(st.expiresAt) <= Date.now()) throw new HttpsError('failed-precondition', 'story_imekwisha');
        if ((await t.get(vref)).exists || st.authorUid === req.auth.uid) return;
        t.set(vref, { uid: req.auth.uid, at: new Date().toISOString() });
        t.update(ref, { viewCount: FV().increment(1) });
        counted = true;
    });
    return { ok: true, counted };
});

exports.storyReport = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const d = req.data || {}, id = sid(d.storyId), reason = clean(d.reason, 300);
    if (reason.length < 3) throw new HttpsError('invalid-argument', 'eleza_sababu');
    const s = await db().doc('stories/' + id).get();
    if (!s.exists) throw new HttpsError('not-found', 'story_haipo');
    const rref = db().doc('story_reports/' + id + '__' + req.auth.uid);
    if ((await rref.get()).exists) return { ok: true, already: true };
    await rref.set({ storyId: id, authorUid: (s.data() || {}).authorUid, reporterUid: req.auth.uid, reason, status: 'open', createdAt: new Date().toISOString() });
    return { ok: true };
});

exports.storyRemove = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const d = req.data || {}, ref = db().doc('stories/' + sid(d.storyId));
    const s = await ref.get();
    if (!s.exists) throw new HttpsError('not-found', 'story_haipo');
    const st = s.data() || {};
    const byAdmin = isAdminToken(req) && st.authorUid !== req.auth.uid;
    if (st.authorUid !== req.auth.uid && !byAdmin) throw new HttpsError('permission-denied', 'si_story_yako');
    if (byAdmin && clean(d.reason, 300).length < 5) throw new HttpsError('invalid-argument', 'sababu_inahitajika');
    await ref.update({ status: 'removed', removedBy: req.auth.uid, removedAt: new Date().toISOString(), removeReason: clean(d.reason, 300) || null });
    if (byAdmin) await db().collection('admin_audit_log').add({ action: 'STORY_REMOVED', actorUid: req.auth.uid, actorRole: 'admin', target: { kind: 'story', id: ref.id }, details: { reason: clean(d.reason, 300) }, createdAt: new Date().toISOString() });
    return { ok: true };
});

/* [R13-D] React (ref 9): one reaction per viewer per story; tapping again removes it. */
exports.storyReact = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const ref = db().doc('stories/' + sid((req.data || {}).storyId));
    const rref = ref.collection('reactions').doc(req.auth.uid);
    let on = false, count = 0;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref); if (!s.exists) throw new HttpsError('not-found', 'story_haipo');
        const st = s.data() || {};
        if (st.status !== 'active' || Date.parse(st.expiresAt) <= Date.now()) throw new HttpsError('failed-precondition', 'story_imekwisha');
        const r = await t.get(rref);
        on = !r.exists; count = Math.max(0, (Number(st.reactCount) || 0) + (on ? 1 : -1));
        if (on) t.set(rref, { at: new Date().toISOString() }); else t.delete(rref);
        t.update(ref, { reactCount: count });
    });
    return { ok: true, on, count };
});
exports._testing = { ownMedia };

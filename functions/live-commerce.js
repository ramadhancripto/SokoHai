/**
 * SokoHai — Live, Live Commerce, Mnada Live and Bei Kushuka Live (one live-room authority)
 * [R13-B 2026-11]
 *
 * One live session = a host (seller/business), a status, the products being shown, a pinned
 * product, real-time comments and a viewer count. The same session powers four experiences:
 *   kind 'live'          — a seller's live show
 *   kind 'live_commerce' — shopping during the show (products open in-room, cart/orders = the
 *                          existing cart, inventory reservation, orders and SokoPay escrow)
 *   kind 'auction'       — Mnada Live: bids go through auctionPlaceBid (commerce-modes.js)
 *   kind 'price_drop'    — Bei Kushuka Live: price from pricing-core (the checkout formula)
 *
 * VIDEO: SokoHai has no streaming server. A session is either 'none' (products + host + chat in
 * real time, no camera) or 'embed' — the host streams on an external provider and pastes its
 * player link; only allow-listed players are accepted (YouTube, Vimeo). Real ingest (camera ->
 * SokoHai) needs a provider account (LiveKit/Mux/Agora...) and is listed as an owner decision.
 *
 * Every write is server-side; the browser can only read (firestore.rules). Comments are
 * rate-limited, length-limited, idempotent per clientId, and removable by host/admin.
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const REGION = 'europe-west1';
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;

const KINDS = ['live', 'live_commerce', 'auction', 'price_drop'];
const MAX_PRODUCTS = 20, MAX_TEXT = 300, COMMENT_GAP_MS = 2000;
const clean = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const id = (v) => { const s = String(v || ''); if (!s || s.length > 128 || s.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'id_si_sahihi'); return s; };
function isAdminToken(req) { const t = (req.auth && req.auth.token) || {}; return t.admin === true || t.superAdmin === true; }

/* Only real players: YouTube / Vimeo embed links (watch/live links are converted). */
function embedUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    let u; try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let m;
    if (h === 'youtube.com' && (m = /^\/(?:embed|live)\/([A-Za-z0-9_-]{6,20})/.exec(u.pathname))) return 'https://www.youtube.com/embed/' + m[1];
    if (h === 'youtube.com' && u.pathname === '/watch' && /^[A-Za-z0-9_-]{6,20}$/.test(u.searchParams.get('v') || '')) return 'https://www.youtube.com/embed/' + u.searchParams.get('v');
    if (h === 'youtu.be' && (m = /^\/([A-Za-z0-9_-]{6,20})$/.exec(u.pathname))) return 'https://www.youtube.com/embed/' + m[1];
    if (h === 'player.vimeo.com' && (m = /^\/video\/(\d{3,12})$/.exec(u.pathname))) return 'https://player.vimeo.com/video/' + m[1];
    if (h === 'vimeo.com' && (m = /^\/(\d{3,12})$/.exec(u.pathname))) return 'https://player.vimeo.com/video/' + m[1];
    return null;
}
async function notify(userId, title, body, extra) {
    if (!userId) return;
    try { await db().collection('notifications').add(Object.assign({ userId: String(userId), title: clean(title, 140), body: clean(body, 500), createdAt: new Date().toISOString(), read: false, source: 'server' }, extra || {})); } catch (e) { /* never blocks */ }
}
async function audit(req, action, target, details) {
    try { await db().collection('admin_audit_log').add({ action, actorUid: (req.auth && req.auth.uid) || 'system', actorRole: isAdminToken(req) ? 'admin' : 'user', target, details: details || {}, createdAt: new Date().toISOString() }); } catch (e) { /* */ }
}
async function userDoc(uid) { const s = await db().doc('users/' + uid).get(); return s.exists ? (s.data() || {}) : null; }
function suspended(u) { return !!u && (u.accountStatus === 'suspended' || u.isSuspended === true || u.sellerLifecycle === 'suspended'); }
async function loadSession(sid) { const ref = db().doc('live_sessions/' + id(sid)); const s = await ref.get(); if (!s.exists) throw new HttpsError('not-found', 'live_haipo'); return { ref, d: s.data() || {} }; }
function mustHost(req, d) { if (!(req.auth && (req.auth.uid === d.hostUid || isAdminToken(req)))) throw new HttpsError('permission-denied', 'si_mwenyeji'); }
function saleMode(p) { const md = p.modeData || {}; return String(p.saleMode || md.mode || p.commerceMode || 'free_market'); }

/* Validate the products a host may show: owned by the host, live listings, and matching the
 * session kind (auction -> auction listings, price_drop -> price-drop listings). */
async function checkProducts(uid, ids, kind) {
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, MAX_PRODUCTS);
    for (const pid of list) {
        const s = await db().doc('products/' + id(pid)).get();
        if (!s.exists) throw new HttpsError('failed-precondition', 'bidhaa_haipo:' + pid);
        const p = s.data() || {};
        if (String(p.userId || '') !== uid) throw new HttpsError('permission-denied', 'si_bidhaa_yako:' + pid);
        if (p.adminHidden || p.moderationStatus === 'removed' || p.publicationStatus === 'draft') throw new HttpsError('failed-precondition', 'bidhaa_haiko_hewani:' + pid);
        if (kind === 'auction' && saleMode(p) !== 'auction') throw new HttpsError('failed-precondition', 'si_mnada:' + pid);
        if (kind === 'price_drop' && saleMode(p) !== 'price_drop') throw new HttpsError('failed-precondition', 'si_bei_kushuka:' + pid);
    }
    return list;
}

exports.liveCreate = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid, d = req.data || {};
    const u = await userDoc(uid);
    if (!u) throw new HttpsError('failed-precondition', 'akaunti_haipo');
    if (suspended(u)) throw new HttpsError('permission-denied', 'akaunti_imesimamishwa');
    const kind = KINDS.indexOf(d.kind) !== -1 ? d.kind : 'live';
    const title = clean(d.title, 120);
    if (title.length < 3) throw new HttpsError('invalid-argument', 'kichwa_kinahitajika');
    const productIds = await checkProducts(uid, d.productIds, kind);
    if (kind !== 'live' && !productIds.length) throw new HttpsError('invalid-argument', 'chagua_bidhaa');
    // A host is a seller: someone with at least one own listing (the products above), or a seller account.
    if (!productIds.length && !(u.isSeller || u.role === 'seller' || u.businessSetupComplete)) throw new HttpsError('permission-denied', 'si_muuzaji');
    let video = { kind: 'none', url: null };
    if (d.videoUrl) { const e = embedUrl(d.videoUrl); if (!e) throw new HttpsError('invalid-argument', 'video_haikubaliki'); video = { kind: 'embed', url: e }; }
    const sched = Number(d.scheduledAt) > Date.now() ? Number(d.scheduledAt) : null;
    const now = new Date().toISOString();
    const ref = db().collection('live_sessions').doc();
    await ref.set({ hostUid: uid, hostName: clean(u.businessName || u.fullName || u.displayName || 'Muuzaji', 80), title, description: clean(d.description, 500),
        kind, status: 'scheduled', scheduledAt: sched, startedAt: null, endedAt: null, productIds, pinnedProductId: productIds[0] || null,
        video, viewerCount: 0, peakViewers: 0, commentCount: 0, mutedUids: [], recordingAllowed: d.recordingAllowed === true, recordingUrl: null,
        createdAt: now, updatedAt: now });
    return { ok: true, sessionId: ref.id, video };
});

exports.liveStart = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const { ref, d } = await loadSession((req.data || {}).sessionId);
    mustHost(req, d);
    if (d.status !== 'scheduled') throw new HttpsError('failed-precondition', 'hali_' + d.status);
    if (suspended(await userDoc(d.hostUid))) throw new HttpsError('permission-denied', 'akaunti_imesimamishwa');
    const now = new Date().toISOString();
    await ref.update({ status: 'live', startedAt: now, updatedAt: now });
    await ref.collection('comments').add({ kind: 'system', text: d.hostName + ' ameanza live', uid: d.hostUid, name: d.hostName, createdAt: now, status: 'visible' });
    // followers of the host get one notice (real followers only)
    const f = await db().collection('sellerFollowers').where('sellerId', '==', d.hostUid).limit(500).get();
    const sent = new Set();
    for (const x of f.docs) { const u = (x.data() || {}).followerId; if (u && !sent.has(u)) { sent.add(u); await notify(u, d.hostName + ' yuko LIVE', d.title, { type: 'live_started', liveSessionId: ref.id }); } }
    // [R13-D] "Ukumbusho" (ref 10): viewers who asked to be reminded of this live
    const r = await ref.collection('reminders').limit(1000).get();
    for (const x of r.docs) if (!sent.has(x.id)) { sent.add(x.id); await notify(x.id, 'Live imeanza: ' + d.title, d.hostName + ' ameanza live uliyoomba ukumbusho.', { type: 'live_reminder', liveSessionId: ref.id }); }
    return { ok: true, notified: sent.size };
});

/* [AUCTION-LIVE] Pause / resume (host only). Business rule: an auction live may only be
 * paused BEFORE the first bid (buyers who already bid must never see a frozen room).
 * While paused, bidding is blocked server-side (modeData.livePaused, enforced by
 * auctionPlaceBid) and comments/likes are refused; on resume the auction endTime moves
 * forward by the paused duration so the server timer stays fair. */
exports.livePause = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const { ref, d } = await loadSession((req.data || {}).sessionId);
    mustHost(req, d);
    if (d.status !== 'live') throw new HttpsError('failed-precondition', 'hali_' + d.status);
    const pids = d.productIds || [];
    if (d.kind === 'auction') {
        for (const pid of pids) {
            const p = ((await db().doc('products/' + id(pid)).get()).data()) || {};
            if ((parseInt(((p.modeData) || {}).totalBids, 10) || 0) > 0) throw new HttpsError('failed-precondition', 'mnada_una_zabuni');
        }
    }
    const now = new Date().toISOString(), nowMs = Date.now();
    await ref.update({ status: 'paused', pausedAt: now, pausedAtMs: nowMs, updatedAt: now });
    for (const pid of pids) {
        try { await db().doc('products/' + id(pid)).update({ 'modeData.livePaused': true }); } catch (e) { /* product may be gone */ }
    }
    await ref.collection('comments').add({ kind: 'system', text: 'Live imesitishwa na mwenyeji kwa muda', uid: d.hostUid, name: d.hostName, createdAt: now, status: 'visible' });
    return { ok: true };
});
exports.liveResume = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const { ref, d } = await loadSession((req.data || {}).sessionId);
    mustHost(req, d);
    if (d.status !== 'paused') throw new HttpsError('failed-precondition', 'hali_' + d.status);
    const now = new Date().toISOString(), nowMs = Date.now();
    const pausedMs = Math.max(0, nowMs - (Number(d.pausedAtMs) || nowMs));
    await ref.update({ status: 'live', pausedAt: null, pausedAtMs: null, updatedAt: now });
    for (const pid of pidsSafe(d)) {
        const pref = db().doc('products/' + id(pid));
        await db().runTransaction(async (t) => {
            const s = await t.get(pref);
            if (!s.exists) return;
            const p = s.data() || {}, md = p.modeData || {};
            const patch = { 'modeData.livePaused': false };
            if (saleMode(p) === 'auction' && Number(md.endTime) > 0 && !md.ended) patch['modeData.endTime'] = Number(md.endTime) + pausedMs;
            t.update(pref, patch);
        });
    }
    await ref.collection('comments').add({ kind: 'system', text: 'Live imeendelea', uid: d.hostUid, name: d.hostName, createdAt: now, status: 'visible' });
    return { ok: true, pausedMs };
});
function pidsSafe(d) { return d.productIds || []; }

exports.liveEnd = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const data = req.data || {};
    const { ref, d } = await loadSession(data.sessionId);
    mustHost(req, d);
    if (d.status === 'ended' || d.status === 'removed') return { ok: true, already: true };
    let rec = null;
    if (data.recordingUrl) { if (!d.recordingAllowed) throw new HttpsError('failed-precondition', 'rekodi_hairuhusiwi'); rec = embedUrl(data.recordingUrl); if (!rec) throw new HttpsError('invalid-argument', 'rekodi_haikubaliki'); }
    const now = new Date().toISOString();
    await ref.update({ status: 'ended', endedAt: now, updatedAt: now, endedBy: req.auth.uid, endReason: clean(data.reason, 200) || null, recordingUrl: rec, viewerCount: 0, pausedAt: null, pausedAtMs: null });
    // [AUCTION-LIVE] unfreeze the products (a paused session may be ended while frozen)
    for (const pid of (d.productIds || [])) {
        try { await db().doc('products/' + id(pid)).update({ 'modeData.livePaused': false }); } catch (e) { /* gone */ }
    }
    await ref.collection('comments').add({ kind: 'system', text: 'Live imekwisha', uid: req.auth.uid, name: 'SokoHai', createdAt: now, status: 'visible' });
    if (req.auth.uid !== d.hostUid) await audit(req, 'LIVE_ENDED_BY_ADMIN', { kind: 'live_session', id: ref.id }, { reason: clean(data.reason, 200) });
    return { ok: true };
});

exports.livePin = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const data = req.data || {};
    const { ref, d } = await loadSession(data.sessionId);
    mustHost(req, d);
    const pid = String(data.productId || '');
    if ((d.productIds || []).indexOf(pid) === -1) throw new HttpsError('failed-precondition', 'bidhaa_haimo_kwenye_live');
    const now = new Date().toISOString();
    await ref.update({ pinnedProductId: pid, updatedAt: now });
    const p = ((await db().doc('products/' + pid).get()).data()) || {};
    await ref.collection('comments').add({ kind: 'product', text: 'Sasa tunaonyesha: ' + clean(p.title, 120), productId: pid, uid: d.hostUid, name: d.hostName, createdAt: now, status: 'visible' });
    return { ok: true };
});

exports.liveSetProducts = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const data = req.data || {};
    const { ref, d } = await loadSession(data.sessionId);
    mustHost(req, d);
    if (d.status === 'ended' || d.status === 'removed') throw new HttpsError('failed-precondition', 'live_imekwisha');
    const list = await checkProducts(d.hostUid, data.productIds, d.kind);
    if (d.kind !== 'live' && !list.length) throw new HttpsError('invalid-argument', 'chagua_bidhaa');
    await ref.update({ productIds: list, pinnedProductId: list.indexOf(d.pinnedProductId) !== -1 ? d.pinnedProductId : (list[0] || null), updatedAt: new Date().toISOString() });
    return { ok: true, productIds: list };
});

/* Viewers: one doc per user; the count moves only when a user's state changes. */
exports.liveJoin = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const { ref, d } = await loadSession((req.data || {}).sessionId);
    if (d.status === 'removed') throw new HttpsError('failed-precondition', 'live_imeondolewa');
    const uid = req.auth.uid, vref = ref.collection('viewers').doc(uid);
    let count = d.viewerCount || 0;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref), v = await t.get(vref);
        const cur = s.data() || {};
        const active = v.exists && (v.data() || {}).active === true;
        const countable = cur.status === 'live' || cur.status === 'paused';   // [AUCTION-LIVE] paused viewers still watch
        const now = new Date().toISOString();
        t.set(vref, { uid, active: countable, joinedAt: (v.exists && (v.data() || {}).joinedAt) || now, lastSeenAt: now }, { merge: true });
        if (!active && countable) { count = (cur.viewerCount || 0) + 1; t.update(ref, { viewerCount: count, peakViewers: Math.max(cur.peakViewers || 0, count) }); }
        else count = cur.viewerCount || 0;
    });
    return { ok: true, status: d.status, viewerCount: count };
});
exports.liveLeave = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const { ref } = await loadSession((req.data || {}).sessionId);
    const vref = ref.collection('viewers').doc(req.auth.uid);
    await db().runTransaction(async (t) => {
        const s = await t.get(ref), v = await t.get(vref);
        if (!v.exists || (v.data() || {}).active !== true) return;
        t.update(vref, { active: false, leftAt: new Date().toISOString() });
        t.update(ref, { viewerCount: Math.max(0, ((s.data() || {}).viewerCount || 0) - 1) });
    });
    return { ok: true };
});

exports.liveComment = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const data = req.data || {}, uid = req.auth.uid;
    const text = clean(data.text, MAX_TEXT);
    if (!text) throw new HttpsError('invalid-argument', 'andika_ujumbe');
    const { ref, d } = await loadSession(data.sessionId);
    if (d.status === 'paused') throw new HttpsError('failed-precondition', 'live_imesitishwa');
    if (d.status !== 'live') throw new HttpsError('failed-precondition', 'live_haiendelei');
    if ((d.mutedUids || []).indexOf(uid) !== -1) throw new HttpsError('permission-denied', 'umezuiwa_kwenye_live');
    const u = await userDoc(uid);
    if (suspended(u)) throw new HttpsError('permission-denied', 'akaunti_imesimamishwa');
    const clientId = String(data.clientId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const cref = clientId ? ref.collection('comments').doc(uid.slice(0, 40) + '_' + clientId) : ref.collection('comments').doc();
    const vref = ref.collection('viewers').doc(uid);
    let dup = false;
    await db().runTransaction(async (t) => {
        if (clientId && (await t.get(cref)).exists) { dup = true; return; }
        const v = await t.get(vref);
        const last = v.exists ? Date.parse((v.data() || {}).lastCommentAt || 0) || 0 : 0;
        if (Date.now() - last < COMMENT_GAP_MS) throw new HttpsError('resource-exhausted', 'subiri_kidogo');
        const now = new Date().toISOString();
        t.set(vref, { uid, lastCommentAt: now }, { merge: true });
        t.set(cref, { kind: 'comment', uid, name: clean((u && (u.fullName || u.displayName)) || 'Mteja', 60), text, createdAt: now, status: 'visible' });
        t.update(ref, { commentCount: FV().increment(1) });
    });
    return { ok: true, duplicate: dup, commentId: cref.id };
});

exports.liveModerate = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const data = req.data || {};
    const { ref, d } = await loadSession(data.sessionId);
    mustHost(req, d);
    const action = String(data.action || '');
    if (action === 'mute' || action === 'unmute') {
        const target = id(data.uid);
        if (target === d.hostUid) throw new HttpsError('invalid-argument', 'huwezi_kujizuia');
        await ref.update({ mutedUids: action === 'mute' ? FV().arrayUnion(target) : FV().arrayRemove(target), updatedAt: new Date().toISOString() });
    } else if (action === 'remove_comment') {
        const cref = ref.collection('comments').doc(id(data.commentId));
        if (!(await cref.get()).exists) throw new HttpsError('not-found', 'ujumbe_haupo');
        await cref.update({ status: 'removed', removedBy: req.auth.uid, removedAt: new Date().toISOString() });
    } else throw new HttpsError('invalid-argument', 'kitendo_si_sahihi');
    await audit(req, 'LIVE_MODERATE_' + action.toUpperCase(), { kind: 'live_session', id: ref.id }, { uid: data.uid || null, commentId: data.commentId || null });
    return { ok: true };
});

exports.liveReport = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const data = req.data || {};
    const { ref, d } = await loadSession(data.sessionId);
    const reason = clean(data.reason, 300);
    if (reason.length < 3) throw new HttpsError('invalid-argument', 'eleza_sababu');
    const rref = db().doc('live_reports/' + ref.id + '__' + req.auth.uid);
    if ((await rref.get()).exists) return { ok: true, already: true };
    await rref.set({ sessionId: ref.id, hostUid: d.hostUid, reporterUid: req.auth.uid, reason, commentId: data.commentId ? id(data.commentId) : null, status: 'open', createdAt: new Date().toISOString() });
    return { ok: true };
});

/* Admin: take a session down (abuse). Recorded in the audit log. */
exports.adminLiveRemove = onCall({ region: REGION }, async (req) => {
    if (!req.auth || !isAdminToken(req)) throw new HttpsError('permission-denied', 'admin_pekee');
    const data = req.data || {};
    const reason = clean(data.reason, 300);
    if (reason.length < 5) throw new HttpsError('invalid-argument', 'sababu_inahitajika');
    const { ref, d } = await loadSession(data.sessionId);
    const now = new Date().toISOString();
    await ref.update({ status: 'removed', endedAt: d.endedAt || now, updatedAt: now, endedBy: req.auth.uid, endReason: reason, viewerCount: 0, pausedAt: null, pausedAtMs: null });
    for (const pid of (d.productIds || [])) {
        try { await db().doc('products/' + id(pid)).update({ 'modeData.livePaused': false }); } catch (e) { /* gone */ }
    }
    await audit(req, 'LIVE_REMOVED', { kind: 'live_session', id: ref.id }, { reason });
    await notify(d.hostUid, 'Live yako imeondolewa', reason, { type: 'live_removed', liveSessionId: ref.id });
    return { ok: true };
});

exports._testing = { embedUrl };

/* [R13-D 2026-11] Likes and reminders (refs 7 and 10).
 * liveLike: one tap = +1 (at most one per user every 1.5 s), counted on the session.
 * liveRemind: toggle a reminder for a scheduled live; liveStart notifies everyone who asked. */
exports.liveLike = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const { ref, d } = await loadSession((req.data || {}).sessionId);
    if (d.status === 'paused') throw new HttpsError('failed-precondition', 'live_imesitishwa');
    if (d.status !== 'live') throw new HttpsError('failed-precondition', 'live_haiendelei');
    const lref = ref.collection('likes').doc(req.auth.uid);
    let ok = false;
    await db().runTransaction(async (t) => {
        const l = await t.get(lref), nowMs = Date.now();
        const last = l.exists ? Number((l.data() || {}).atMs) || 0 : 0;
        if (nowMs - last < 1500) return;
        t.set(lref, { atMs: nowMs, n: FV().increment(1) }, { merge: true });
        t.update(ref, { likeCount: FV().increment(1) });
        ok = true;
    });
    return { ok: true, counted: ok };
});
exports.liveRemind = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const { ref, d } = await loadSession((req.data || {}).sessionId);
    if (d.status !== 'scheduled') throw new HttpsError('failed-precondition', 'hali_' + d.status);
    const rref = ref.collection('reminders').doc(req.auth.uid);
    const on = (req.data || {}).on !== false;
    if (on) await rref.set({ at: new Date().toISOString() }); else await rref.delete();
    return { ok: true, on };
});

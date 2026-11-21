/**
 * SokoHai — Web push (Firebase Cloud Messaging).                [R15 2026-11-13]
 *
 * The in-app notification centre (`notifications/{id}`, badge, list, mark-read) is the source
 * of truth. This module only adds a phone/desktop push for a notification that was already written.
 *
 *   pushRegisterToken   — store this device's FCM token for the signed-in user (server-only collection)
 *   pushUnregisterToken — remove it (logout / user turns push off)
 *   pushSetPrefs        — per-category on/off (orders, payments, delivery, chat, auctions, promotions)
 *   pushOnNotification  — Firestore trigger: notifications/{id} created -> push to that user's devices,
 *                         respecting prefs; dead tokens are deleted.
 *
 * Safety: tokens live in push_tokens/{uid}_{hash} (no client access in firestore.rules); a user can only
 * register/remove tokens for themself; the push text is the notification's own title/body (cut short),
 * never wallet balances or codes; nothing is sent when FCM is not configured (the trigger logs and stops).
 * Real delivery needs: a Firebase Web Push certificate (VAPID key) in the web config and FCM enabled on
 * the project — see docs/R15-PUSH-SETUP.md. Promotions default OFF (owner decision pending).
 */
'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const { onCall } = require('./errors'); // [SRV-10] same onCall, wrapped in the shared error contract
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const crypto = require('crypto');

const REGION = 'europe-west1';
const db = () => admin.firestore();
const MAX_TOKENS = 10;
const CATEGORIES = ['orders', 'payments', 'delivery', 'chat', 'auctions', 'promotions'];
const DEFAULT_PREFS = { orders: true, payments: true, delivery: true, chat: true, auctions: true, promotions: false };

function needUser(req) {
    if (!req || !req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    return req.auth.uid;
}
function cleanToken(v) {
    const t = String(v || '').trim();
    if (t.length < 20 || t.length > 4096 || !/^[A-Za-z0-9_:\-]+$/.test(t)) throw new HttpsError('invalid-argument', 'token_si_sahihi');
    return t;
}
const tokenId = (uid, token) => uid + '_' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);

/* Which preference a notification belongs to (from the fields the app already writes). */
function categoryOf(n) {
    const t = String(n.type || n.event || '').toLowerCase();
    const m = String(n.commerceMode || '').toUpperCase();
    if (/promo|ad_|ads|marketing|campaign/.test(t)) return 'promotions';
    if (m === 'AUCTION' || /auction|mnada|bid/.test(t)) return 'auctions';
    if (/chat|message|comment|mention/.test(t)) return 'chat';
    if (/deliver|ride|transport|courier|agent/.test(t)) return 'delivery';
    if (/wallet|payment|escrow|payout|refund|dispute|payprot|deposit|withdraw/.test(t)) return 'payments';
    return 'orders';
}
function prefsOf(doc) {
    const p = Object.assign({}, DEFAULT_PREFS);
    const d = (doc && doc.categories) || {};
    CATEGORIES.forEach(k => { if (typeof d[k] === 'boolean') p[k] = d[k]; });
    return { enabled: !(doc && doc.enabled === false), categories: p };
}
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

exports.pushRegisterToken = onCall({ region: REGION }, async (req) => {
    const uid = needUser(req);
    const d = req.data || {};
    const token = cleanToken(d.token);
    const platform = ['web', 'android', 'ios'].indexOf(String(d.platform || 'web')) === -1 ? 'web' : String(d.platform || 'web');
    const id = tokenId(uid, token);
    const now = new Date().toISOString();
    // the same device token can only belong to one account at a time (shared phone, account switch)
    const other = await db().collection('push_tokens').where('token', '==', token).limit(20).get();
    const batch = db().batch();
    other.docs.forEach(x => { if (x.id !== id) batch.delete(x.ref); });
    batch.set(db().doc('push_tokens/' + id), { uid, token, platform, ua: cut(d.ua, 160), createdAt: now, lastSeenAt: now }, { merge: true });
    await batch.commit();
    // keep the newest MAX_TOKENS devices per user
    const mine = await db().collection('push_tokens').where('uid', '==', uid).limit(50).get();
    if (mine.size > MAX_TOKENS) {
        const old = mine.docs.sort((a, b) => String(a.data().lastSeenAt || '').localeCompare(String(b.data().lastSeenAt || ''))).slice(0, mine.size - MAX_TOKENS);
        await Promise.all(old.map(x => x.ref.delete()));
    }
    return { ok: true, devices: Math.min(mine.size, MAX_TOKENS) };
});

exports.pushUnregisterToken = onCall({ region: REGION }, async (req) => {
    const uid = needUser(req);
    const token = cleanToken((req.data || {}).token);
    const ref = db().doc('push_tokens/' + tokenId(uid, token));
    const s = await ref.get();
    if (s.exists && s.data().uid === uid) await ref.delete();
    return { ok: true };
});

exports.pushSetPrefs = onCall({ region: REGION }, async (req) => {
    const uid = needUser(req);
    const d = req.data || {};
    const upd = { updatedAt: new Date().toISOString() };
    if (typeof d.enabled === 'boolean') upd.enabled = d.enabled;
    const cats = {};
    Object.keys(d.categories || {}).forEach(k => {
        if (CATEGORIES.indexOf(k) === -1) throw new HttpsError('invalid-argument', 'aina_haijulikani');
        if (typeof d.categories[k] !== 'boolean') throw new HttpsError('invalid-argument', 'thamani_si_boolean');
        cats[k] = d.categories[k];
    });
    if (Object.keys(cats).length) upd.categories = cats;
    await db().doc('push_prefs/' + uid).set(upd, { merge: true });
    return { ok: true, prefs: prefsOf((await db().doc('push_prefs/' + uid).get()).data()) };
});

/* Core, separated from the trigger so the emulator test can pass a fake sender. */
async function deliver(notifId, n, sender) {
    const uid = String((n && n.userId) || '');
    if (!uid || n.push === false) return { sent: 0, reason: 'no_user_or_opt_out' };
    const prefs = prefsOf((await db().doc('push_prefs/' + uid).get()).data());
    const cat = categoryOf(n);
    if (!prefs.enabled || !prefs.categories[cat]) return { sent: 0, reason: 'prefs_off', category: cat };
    const toks = await db().collection('push_tokens').where('uid', '==', uid).limit(MAX_TOKENS).get();
    if (toks.empty) return { sent: 0, reason: 'no_devices', category: cat };
    const tokens = toks.docs.map(x => x.data().token);
    const msg = {
        tokens,
        notification: { title: cut(n.title || 'SokoHai', 80), body: cut(n.body || n.message || '', 160) },
        data: { notifId: String(notifId), category: cat, url: '/?notif=' + encodeURIComponent(String(notifId)) },
        webpush: { fcmOptions: { link: '/?notif=' + encodeURIComponent(String(notifId)) }, notification: { icon: '/assets/img/sokohai-app-192-v2.png', badge: '/assets/img/sokohai-app-192-v2.png', tag: 'skh-' + cat } }
    };
    const res = await sender(msg);
    const dead = [];
    (res.responses || []).forEach((r, i) => {
        const code = r && r.error && (r.error.code || r.error.errorInfo && r.error.errorInfo.code);
        if (!r.success && /registration-token-not-registered|invalid-registration-token/.test(String(code))) dead.push(toks.docs[i].ref);
    });
    await Promise.all(dead.map(r => r.delete()));
    return { sent: res.successCount || 0, failed: res.failureCount || 0, pruned: dead.length, category: cat };
}

exports.pushOnNotification = onDocumentCreated({ document: 'notifications/{id}', region: REGION }, async (event) => {
    const n = event.data && event.data.data();
    if (!n) return;
    if (process.env.SKH_PUSH_ENABLED !== '1') return; // switched on only after FCM is configured (see docs)
    try {
        const r = await deliver(event.params.id, n, (m) => admin.messaging().sendEachForMulticast(m));
        if (r.sent || r.failed) console.log('[push]', event.params.id, JSON.stringify(r));
    } catch (e) { console.warn('[push] imeshindikana', e && e.message); }
});

exports._testing = { deliver, categoryOf, prefsOf, tokenId, DEFAULT_PREFS };

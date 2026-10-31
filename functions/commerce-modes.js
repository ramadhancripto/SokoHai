/**
 * SokoHai — Commerce modes authority (Auction bids, Group Buy joins)
 * [REPAIR 2026-10 Phase 5]
 *
 * Before: the browser wrote products/{id}.modeData directly (currentBid,
 * maxBidder, joinedUsers, participants). Firestore rules only let the product
 * OWNER write a product, so every buyer bid / join was rejected (broken), and
 * opening the rule would have let any buyer forge the auction winner or the
 * group price. These callables are now the only writers of the runtime mode
 * fields. Each runs in one Firestore transaction (no lost bids, no double join).
 *
 * Error messages keep the codes the existing UI already understands
 * (js/app/07-product.js): bidhaa_haipo, si_mnada, mnada_umefungwa, tangazo_lako,
 * imezimwa_admin, waliokuzidi, si_group, group_<status>.
 */
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const db = () => admin.firestore();
const FieldValue = () => admin.firestore.FieldValue;

function saleModeOf(p) {
    const md = (p && p.modeData) || {};
    return String((p && p.saleMode) || md.mode || (p && p.commerceMode) || 'free_market');
}
async function modeEnabled(mode) {
    try {
        const s = await db().doc('system/config').get();
        const m = (s.exists && (s.data() || {}).modes) || {};
        return m[mode] !== false; // default ON (same as the client panel)
    } catch (e) { return true; }
}
function cleanName(v, fallback) {
    return String(v || fallback || 'Mteja').replace(/[<>]/g, '').slice(0, 80);
}
async function notify(userId, title, body, extra) {
    if (!userId) return;
    try {
        await db().collection('notifications').add(Object.assign({
            userId: String(userId), title: String(title).slice(0, 140), body: String(body).slice(0, 500),
            createdAt: new Date().toISOString(), read: false, source: 'server'
        }, extra || {}));
    } catch (e) { /* a notification never blocks the money path */ }
}

/** Pure bid validation (unit-tested without the emulator). */
function validateBid(p, bid, uid, nowMs) {
    const md = (p && p.modeData) || {};
    if (saleModeOf(p) !== 'auction') return { ok: false, code: 'si_mnada' };
    const endsAt = Number(md.endTime) || 0;
    if (md.ended || (endsAt > 0 && nowMs >= endsAt)) return { ok: false, code: 'mnada_umefungwa' };
    if (String(p.userId || '') === String(uid) || String(p.managedByAgentUid || '') === String(uid)) return { ok: false, code: 'tangazo_lako' };
    if (!Number.isFinite(bid) || bid <= 0) return { ok: false, code: 'ingiza_kiasi' };
    const current = Number(md.currentBid) > 0 ? Number(md.currentBid) : Number(p.price || 0);
    const minNext = Math.round(current * 1.05);
    if (bid < minNext) return { ok: false, code: 'waliokuzidi', minRequired: minNext };
    if (String(md.maxBidder || '') === String(uid)) return { ok: false, code: 'tayari_unaongoza', minRequired: minNext };
    return { ok: true, minNext, current };
}

/** Pure group-join validation. */
function validateGroupJoin(p, uid, nowMs) {
    const md = (p && p.modeData) || {};
    if (saleModeOf(p) !== 'group_buy') return { ok: false, code: 'si_group' };
    if (String(p.userId || '') === String(uid)) return { ok: false, code: 'tangazo_lako' };
    const joined = parseInt(md.joinedUsers, 10) || 1;
    const target = parseInt(md.targetPeople, 10) || 10;
    const endsAt = Number(md.endTime) || 0;
    const status = joined >= target ? 'successful' : ((endsAt > 0 && nowMs >= endsAt) ? 'failed' : 'active');
    const participants = Array.isArray(md.participants) ? md.participants : [];
    if (participants.indexOf(uid) !== -1) return { ok: true, already: true, joined, target, status };
    if (status !== 'active') return { ok: false, code: 'group_' + status };
    return { ok: true, joined, target, status };
}

exports.auctionPlaceBid = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid;
    const d = req.data || {};
    const productId = String(d.productId || '');
    const bid = Math.round(Number(d.amount));
    if (!productId || productId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'bidhaa_haipo');
    if (!(await modeEnabled('auction'))) throw new HttpsError('failed-precondition', 'imezimwa_admin');
    const ref = db().doc('products/' + productId);
    const bidderName = cleanName(d.bidderName || (req.auth.token && req.auth.token.name));
    let out = null, prev = null, product = null;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) throw new HttpsError('not-found', 'bidhaa_haipo');
        const p = s.data() || {};
        const v = validateBid(p, bid, uid, Date.now());
        if (!v.ok) throw new HttpsError('failed-precondition', v.code + (v.minRequired ? ':' + v.minRequired : ''));
        const md = p.modeData || {};
        prev = { uid: md.maxBidder || null, bid: Number(md.currentBid) || null };
        product = p;
        const totalBids = (parseInt(md.totalBids, 10) || 0) + 1;
        const now = new Date().toISOString();
        t.update(ref, {
            'modeData.currentBid': bid, 'modeData.maxBidder': uid, 'modeData.maxBidderName': bidderName,
            'modeData.totalBids': totalBids, 'modeData.lastBidAt': now
        });
        t.set(ref.collection('bids').doc(), { uid, name: bidderName, amount: bid, prevBid: prev.bid, createdAt: now, source: 'auctionPlaceBid' });
        out = { ok: true, bid, totalBids, minNext: Math.round(bid * 1.05) };
    });
    const title = (product && product.title) || 'bidhaa';
    if (prev && prev.uid && prev.uid !== uid) {
        await notify(prev.uid, 'Umezidiwa Dau', 'Mteja mwingine ameweka TSh ' + bid.toLocaleString() + ' kwenye mnada wa ' + title + '.',
            { type: 'auction_outbid', productId, commerceMode: 'AUCTION' });
    }
    if (product && product.userId) {
        await notify(product.userId, 'Dau jipya kwenye mnada wako', bidderName + ' ameweka TSh ' + bid.toLocaleString() + ' (zabuni: ' + out.totalBids + ').',
            { type: 'auction_bid', productId, commerceMode: 'AUCTION' });
    }
    return out;
});

exports.groupBuyJoin = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid;
    const productId = String((req.data || {}).productId || '');
    if (!productId || productId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'bidhaa_haipo');
    if (!(await modeEnabled('group_buy'))) throw new HttpsError('failed-precondition', 'imezimwa_admin');
    const ref = db().doc('products/' + productId);
    let out = null, product = null, reached = false;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) throw new HttpsError('not-found', 'bidhaa_haipo');
        const p = s.data() || {};
        product = p;
        const v = validateGroupJoin(p, uid, Date.now());
        if (!v.ok) throw new HttpsError('failed-precondition', v.code);
        if (v.already) { out = { ok: true, already: true, joined: v.joined }; return; }
        const joined = v.joined + 1;
        const patch = { 'modeData.joinedUsers': joined, 'modeData.participants': FieldValue().arrayUnion(uid) };
        if (joined >= v.target && !(p.modeData || {}).successNotified) { patch['modeData.successNotified'] = true; reached = true; }
        t.update(ref, patch);
        out = { ok: true, joined, target: v.target };
    });
    if (reached && product) {
        const parts = ((product.modeData || {}).participants || []).concat([uid]);
        for (const p of parts.slice(0, 200)) {
            await notify(p, 'Group Buy imefanikiwa', 'Lengo la watu limefikiwa kwa ' + (product.title || 'bidhaa') + '. Lipia kwa bei ya kikundi.',
                { type: 'group_buy_success', productId, commerceMode: 'GROUP_BUY' });
        }
        await notify(product.userId, 'Group Buy imefikia lengo', (product.title || 'Bidhaa') + ' imefikia watu ' + out.joined + '.',
            { type: 'group_buy_success', productId, commerceMode: 'GROUP_BUY' });
    }
    return out;
});

/* Auction end: mark ended + winner once, and notify winner and seller.
 * Runs every 15 minutes; idempotent (modeData.endNotified). */
async function sweepAuctions(nowMs) {
    nowMs = nowMs || Date.now();
    const out = { checked: 0, ended: 0 };
    const q = await db().collection('products').where('saleMode', '==', 'auction').limit(500).get();
    for (const doc of q.docs) {
        out.checked++;
        const p = doc.data() || {};
        const md = p.modeData || {};
        const endsAt = Number(md.endTime) || 0;
        if (md.endNotified || !(endsAt > 0 && nowMs >= endsAt)) continue;
        let fire = false;
        await db().runTransaction(async (t) => {
            const s = await t.get(doc.ref);
            const m = ((s.data() || {}).modeData) || {};
            if (m.endNotified) return;
            t.update(doc.ref, { 'modeData.ended': true, 'modeData.endedAt': new Date(nowMs).toISOString(),
                'modeData.winnerId': m.maxBidder || null, 'modeData.endNotified': true });
            fire = true;
        });
        if (!fire) continue;
        out.ended++;
        const t = p.title || 'bidhaa';
        if (md.maxBidder) {
            await notify(md.maxBidder, 'Umeshinda Mnada!', 'Umeshinda mnada wa ' + t + ' kwa TSh ' + Number(md.currentBid || 0).toLocaleString() + '. Lipia sasa ili kumaliza oda yako.',
                { type: 'auction_won', productId: doc.id, commerceMode: 'AUCTION' });
        }
        await notify(p.userId, 'Mnada wako umekamilika', md.maxBidder
            ? 'Mnada wa ' + t + ' umefungwa. Mshindi: ' + (md.maxBidderName || 'mteja') + ' kwa TSh ' + Number(md.currentBid || 0).toLocaleString() + '.'
            : 'Mnada wa ' + t + ' umefungwa bila zabuni.', { type: 'auction_ended', productId: doc.id, commerceMode: 'AUCTION' });
    }
    return out;
}
exports.commerceModesSweep = onSchedule({ region: REGION, schedule: 'every 15 minutes', timeZone: 'Africa/Dar_es_Salaam' },
    async (evt) => {
        const emu = process.env.FIRESTORE_EMULATOR_HOST && evt && evt.scheduleTime ? Date.parse(evt.scheduleTime) : 0;
        await sweepAuctions(emu > 0 ? emu : Date.now());
    });

exports._testing = { validateBid, validateGroupJoin, saleModeOf, sweepAuctions };

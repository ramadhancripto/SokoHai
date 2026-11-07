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

/* [R13-B 2026-11] Auction rules come from the listing (seller-set at creation):
 *   modeData.minIncrementPct (default 5) and/or modeData.minIncrement (TSh, absolute);
 *   the larger of the two applies. modeData.startTime: bids refused before it. */
function minNextBid(p) {
    const md = (p && p.modeData) || {};
    const current = Number(md.currentBid) > 0 ? Number(md.currentBid) : Number(p.price || 0);
    const pct = Number(md.minIncrementPct) > 0 ? Math.min(50, Number(md.minIncrementPct)) : 5;
    const abs = Number(md.minIncrement) > 0 ? Number(md.minIncrement) : 0;
    return { current, minNext: Math.round(current + Math.max(abs, Math.ceil(current * pct / 100))) };
}
/* Anti-sniping: a bid in the last EXTEND_WINDOW_MS moves the end by EXTEND_BY_MS, at most
 * MAX_EXTENSIONS times (so an auction always ends). */
const EXTEND_WINDOW_MS = 2 * 60 * 1000, EXTEND_BY_MS = 2 * 60 * 1000, MAX_EXTENSIONS = 15;
function antiSnipeEnd(md, nowMs) {
    const endsAt = Number(md.endTime) || 0, n = parseInt(md.extensions, 10) || 0;
    if (!(endsAt > 0) || n >= MAX_EXTENSIONS || endsAt - nowMs > EXTEND_WINDOW_MS) return null;
    return { endTime: endsAt + EXTEND_BY_MS, extensions: n + 1 };
}

/** Pure bid validation (unit-tested without the emulator). */
function validateBid(p, bid, uid, nowMs) {
    const md = (p && p.modeData) || {};
    if (saleModeOf(p) !== 'auction') return { ok: false, code: 'si_mnada' };
    const endsAt = Number(md.endTime) || 0;
    if (md.ended || (endsAt > 0 && nowMs >= endsAt)) return { ok: false, code: 'mnada_umefungwa' };
    if (Number(md.startTime) > 0 && nowMs < Number(md.startTime)) return { ok: false, code: 'mnada_haujaanza' };
    if (String(p.userId || '') === String(uid) || String(p.managedByAgentUid || '') === String(uid)) return { ok: false, code: 'tangazo_lako' };
    if (!Number.isFinite(bid) || bid <= 0) return { ok: false, code: 'ingiza_kiasi' };
    const { current, minNext } = minNextBid(p);
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
    // [R13-B] duplicate submissions: the same clientBidId returns the first result, never a second bid
    const clientBidId = String(d.clientBidId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const bidRef = clientBidId ? ref.collection('bids').doc(uid.slice(0, 40) + '_' + clientBidId) : ref.collection('bids').doc();
    let out = null, prev = null, product = null;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) throw new HttpsError('not-found', 'bidhaa_haipo');
        if (clientBidId) {
            const dup = await t.get(bidRef);
            if (dup.exists) { const b = dup.data() || {}; out = { ok: true, duplicate: true, bid: b.amount, totalBids: b.totalBids || null }; return; }
        }
        const p = s.data() || {};
        const nowMs = Date.now();
        const v = validateBid(p, bid, uid, nowMs);
        if (!v.ok) throw new HttpsError('failed-precondition', v.code + (v.minRequired ? ':' + v.minRequired : ''));
        const md = p.modeData || {};
        prev = { uid: md.maxBidder || null, bid: Number(md.currentBid) || null };
        product = p;
        const totalBids = (parseInt(md.totalBids, 10) || 0) + 1;
        const now = new Date(nowMs).toISOString();
        const patch = {
            'modeData.currentBid': bid, 'modeData.maxBidder': uid, 'modeData.maxBidderName': bidderName,
            'modeData.totalBids': totalBids, 'modeData.lastBidAt': now
        };
        const ext = antiSnipeEnd(md, nowMs);
        if (ext) { patch['modeData.endTime'] = ext.endTime; patch['modeData.extensions'] = ext.extensions; }
        t.update(ref, patch);
        t.set(bidRef, { uid, name: bidderName, amount: bid, prevBid: prev.bid, totalBids, createdAt: now, source: 'auctionPlaceBid' });
        // [R13-D] "Zabuni zangu" (ref 5): one participation row per buyer per auction (read by its owner only)
        t.set(db().doc('auction_participation/' + uid + '__' + productId), { uid, productId, title: String(p.title || '').slice(0, 120),
            image: String(p.image || (Array.isArray(p.imagesArray) ? p.imagesArray[0] : '') || '').slice(0, 500), myBid: bid, lastBidAt: now,
            bids: FieldValue().increment(1) }, { merge: true });
        const nextMin = minNextBid(Object.assign({}, p, { modeData: Object.assign({}, md, { currentBid: bid }) })).minNext;
        out = { ok: true, bid, totalBids, minNext: nextMin, endTime: ext ? ext.endTime : (Number(md.endTime) || null), extended: !!ext };
    });
    if (out && out.duplicate) return out;
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

/* [R13-B] Winner payment window and second chance.
 * The winner has PAYMENT_WINDOW_MS to place a paid order; otherwise the next-highest
 * distinct bidder is offered the item at THEIR highest bid (up to MAX_ROUNDS times). */
const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000, MAX_ROUNDS = 3;
const UNPAID = ['pending', 'pending_payment', 'awaiting_payment', 'price_review', 'cancelled', 'cancelled_not_fulfilled', 'failed', 'expired'];
async function winnerHasPaid(productId, uid) {
    const q = await db().collection('orders').where('buyerId', '==', String(uid)).limit(50).get();
    return q.docs.some(d => {
        const o = d.data() || {};
        const items = Array.isArray(o.items) ? o.items : [];
        const hit = String(o.productId || '') === productId || items.some(i => String((i && (i.productId || i.itemId || i.id)) || '') === productId);
        return hit && UNPAID.indexOf(String(o.status || 'pending')) === -1;
    });
}
async function nextBidder(ref, exclude) {
    const q = await ref.collection('bids').orderBy('amount', 'desc').limit(100).get();
    for (const d of q.docs) { const b = d.data() || {}; if (b.uid && exclude.indexOf(b.uid) === -1) return { uid: b.uid, name: b.name || 'mteja', amount: Number(b.amount) || 0 }; }
    return null;
}
/* Close one auction (idempotent). Returns true when this call closed it. */
async function closeAuction(ref, nowMs) {
    let closed = null;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) return;
        const p = s.data() || {}, m = p.modeData || {};
        const endsAt = Number(m.endTime) || 0;
        if (m.endNotified || !(endsAt > 0 && nowMs >= endsAt)) return;
        t.update(ref, { 'modeData.ended': true, 'modeData.endedAt': new Date(nowMs).toISOString(),
            'modeData.winnerId': m.maxBidder || null, 'modeData.winnerName': m.maxBidderName || null,
            'modeData.winnerBid': Number(m.currentBid) || null, 'modeData.winnerRound': 1, 'modeData.pastWinners': [],
            'modeData.paymentDeadline': m.maxBidder ? nowMs + PAYMENT_WINDOW_MS : null, 'modeData.endNotified': true });
        closed = { p, m };
    });
    if (!closed) return false;
    const { p, m } = closed, t = p.title || 'bidhaa';
    if (m.maxBidder) {
        await notify(m.maxBidder, 'Umeshinda Mnada!', 'Umeshinda mnada wa ' + t + ' kwa TSh ' + Number(m.currentBid || 0).toLocaleString() + '. Lipia ndani ya saa 24 ili kumaliza oda yako.',
            { type: 'auction_won', productId: ref.id, commerceMode: 'AUCTION' });
    }
    await notify(p.userId, 'Mnada wako umekamilika', m.maxBidder
        ? 'Mnada wa ' + t + ' umefungwa. Mshindi: ' + (m.maxBidderName || 'mteja') + ' kwa TSh ' + Number(m.currentBid || 0).toLocaleString() + '.'
        : 'Mnada wa ' + t + ' umefungwa bila zabuni.', { type: 'auction_ended', productId: ref.id, commerceMode: 'AUCTION' });
    return true;
}
async function secondChance(ref, nowMs) {
    const s = await ref.get(); const p = s.data() || {}, m = p.modeData || {};
    if (!m.ended || !m.winnerId || !(Number(m.paymentDeadline) > 0) || nowMs < Number(m.paymentDeadline)) return false;
    if (await winnerHasPaid(ref.id, m.winnerId)) { await ref.update({ 'modeData.winnerPaid': true, 'modeData.paymentDeadline': null }); return false; }
    const past = (Array.isArray(m.pastWinners) ? m.pastWinners : []).concat([m.winnerId]);
    const round = (parseInt(m.winnerRound, 10) || 1) + 1;
    const nb = round <= MAX_ROUNDS ? await nextBidder(ref, past) : null;
    let moved = null;
    await db().runTransaction(async (t) => {
        const cur = ((await t.get(ref)).data() || {}).modeData || {};
        if (cur.winnerId !== m.winnerId || Number(cur.paymentDeadline) !== Number(m.paymentDeadline)) return;   // someone else moved it
        t.update(ref, nb
            ? { 'modeData.winnerId': nb.uid, 'modeData.winnerName': nb.name, 'modeData.winnerBid': nb.amount, 'modeData.winnerRound': round,
                'modeData.pastWinners': past, 'modeData.paymentDeadline': nowMs + PAYMENT_WINDOW_MS }
            : { 'modeData.winnerId': null, 'modeData.winnerBid': null, 'modeData.pastWinners': past, 'modeData.paymentDeadline': null, 'modeData.unsold': true });
        moved = nb;
    });
    await notify(m.winnerId, 'Muda wa kulipia mnada umeisha', 'Hukulipia ' + (p.title || 'bidhaa') + ' ndani ya muda. Nafasi imepewa mshiriki anayefuata.', { type: 'auction_payment_expired', productId: ref.id, commerceMode: 'AUCTION' });
    if (moved) await notify(moved.uid, 'Nafasi ya kununua mnada', 'Mshindi wa awali hakulipa. Unaweza kununua ' + (p.title || 'bidhaa') + ' kwa zabuni yako ya TSh ' + moved.amount.toLocaleString() + ' ndani ya saa 24.', { type: 'auction_second_chance', productId: ref.id, commerceMode: 'AUCTION' });
    await notify(p.userId, 'Mnada: mshindi amebadilika', moved ? 'Nafasi imepewa ' + moved.name + ' (TSh ' + moved.amount.toLocaleString() + ').' : 'Hakuna mshiriki mwingine; bidhaa haijauzwa.', { type: 'auction_winner_changed', productId: ref.id, commerceMode: 'AUCTION' });
    return true;
}
/* Anyone signed in may ask the server to close an auction whose time is over, so the result
 * appears immediately instead of at the next sweep. The server decides; the client cannot. */
exports.auctionFinalize = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const productId = String((req.data || {}).productId || '');
    if (!productId || productId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'bidhaa_haipo');
    const ref = db().doc('products/' + productId);
    const s = await ref.get();
    if (!s.exists || saleModeOf(s.data()) !== 'auction') throw new HttpsError('not-found', 'si_mnada');
    const closed = await closeAuction(ref, Date.now());
    const m = (((await ref.get()).data() || {}).modeData) || {};
    return { ok: true, closed, ended: !!m.ended, winnerId: m.winnerId || null, winnerBid: m.winnerBid || null, endTime: m.endTime || null };
});

/* [R13-B] Bei Kushuka: the current price is computed by the SAME formula as checkout
 * (pricing-core.modeUnitPrice). When it has really dropped since the last notice, the buyers
 * who watch the product get one notification (no fabricated "drops"). */
const { modeUnitPrice } = require('./pricing-core');
async function sweepPriceDrops(nowMs) {
    const out = { checked: 0, notified: 0 };
    const q = await db().collection('products').where('saleMode', '==', 'price_drop').limit(500).get();
    for (const doc of q.docs) {
        out.checked++;
        const p = doc.data() || {}, md = p.modeData || {};
        if (Number(md.startTime) > nowMs || (Number(md.endTime) > 0 && nowMs >= Number(md.endTime)) || md.stopped) continue;
        const price = modeUnitPrice(p, 1, '', nowMs);
        const last = Number(md.lastNotifiedPrice) > 0 ? Number(md.lastNotifiedPrice) : Number(p.price || 0);
        if (!(price < last)) continue;
        let fire = false;
        await db().runTransaction(async (t) => {
            const cur = ((await t.get(doc.ref)).data() || {}).modeData || {};
            const l2 = Number(cur.lastNotifiedPrice) > 0 ? Number(cur.lastNotifiedPrice) : Number(p.price || 0);
            if (!(price < l2)) return;
            t.update(doc.ref, { 'modeData.lastNotifiedPrice': price, 'modeData.lastNotifiedAt': new Date(nowMs).toISOString() });
            fire = true;
        });
        if (!fire) continue;
        const w = await db().collection('productWatches').where('productId', '==', doc.id).limit(300).get();
        for (const x of w.docs) {
            await notify((x.data() || {}).userId, 'Bei imeshuka', (p.title || 'Bidhaa') + ' sasa ni TSh ' + price.toLocaleString() + '.', { type: 'price_drop', productId: doc.id, commerceMode: 'PRICE_DROP', price });
            out.notified++;
        }
    }
    return out;
}

/* [R13-B] sweep = close finished auctions + run the winner payment window. */
async function sweepAuctions(nowMs) {
    nowMs = nowMs || Date.now();
    const out = { checked: 0, ended: 0, secondChance: 0 };
    const q = await db().collection('products').where('saleMode', '==', 'auction').limit(500).get();
    for (const doc of q.docs) {
        out.checked++;
        if (await closeAuction(doc.ref, nowMs)) out.ended++;
        if (await secondChance(doc.ref, nowMs)) out.secondChance++;
    }
    return out;
}
exports.commerceModesSweep = onSchedule({ region: REGION, schedule: 'every 15 minutes', timeZone: 'Africa/Dar_es_Salaam' },
    async (evt) => {
        const emu = process.env.FIRESTORE_EMULATOR_HOST && evt && evt.scheduleTime ? Date.parse(evt.scheduleTime) : 0;
        await sweepAuctions(emu > 0 ? emu : Date.now());
        await sweepPriceDrops(emu > 0 ? emu : Date.now());
        await require('./price-drop-queue')._testing.sweepQueues(emu > 0 ? emu : Date.now());   // [R13-D] queue -> opportunities
    });

exports._testing = { validateBid, validateGroupJoin, saleModeOf, sweepAuctions, minNextBid, antiSnipeEnd, closeAuction, secondChance, sweepPriceDrops };

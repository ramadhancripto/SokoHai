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
    /* [FULL-AUCTION 2026-11] a cancelled auction never accepts bids again. */
    if (md.cancelled === true) return { ok: false, code: 'mnada_umeghairiwa' };
    // [AUCTION-LIVE] the host paused the live room: bidding freezes everywhere (room + product page)
    if (md.livePaused === true) return { ok: false, code: 'mnada_umesitishwa' };
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
        // [AUCTION-LIVE] distinct bidder count (server-authoritative; shown as "Wazabuni").
        // The bidders array is capped so the product doc stays small; the count stays exact.
        let bidders = Array.isArray(md.bidders) ? md.bidders : null;
        if (!bidders && totalBids > 1 && !(parseInt(md.bidderCount, 10) > 0)) {
            const bq = await t.get(ref.collection('bids').limit(200));   // one-time seed for legacy auctions
            bidders = [...new Set(bq.docs.map(d => String((d.data() || {}).uid || '')).filter(Boolean))];
        }
        bidders = bidders || [];
        if (bidders.indexOf(uid) === -1) {
            patch['modeData.bidderCount'] = Math.max(parseInt(md.bidderCount, 10) || 0, bidders.length) + 1;
            if (bidders.length < 500) patch['modeData.bidders'] = FieldValue().arrayUnion(uid);
        }
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
/* [FULL-AUCTION 2026-11] Exactly-once claims, v3. PROVEN-WRONG approaches on this
 * emulator: (a) in-transaction read+create — all 4 parallel txns commit; (b) bare
 * single-doc create() — two parallel creates can BOTH succeed (X7: a second claim
 * winner died later in tx contention with jaribu_tena). What DOES serialize exactly
 * (probe-verified, 8 parallel -> 1 winner): a preconditioned update() carrying
 * lastUpdateTime. So claimOnce = create-if-missing (races here are harmless) + ONE
 * guarded update: exactly one claimant's precondition matches. Stale reads are safe:
 * a stale updateTime only ever fails the precondition (taken), never grants a false
 * win. Live claims (fresh at + holder) short-circuit to taken; crashed holders expire
 * after CLAIM_TIMEOUT_MS and the marker is stolen by the same atomic update.
 * Marker docs live in auction_events with type __*_marker; readers must ignore them. */
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
async function claimOnce(markerRef, tag) {
    const holder = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { await markerRef.create({ type: tag, at: 0, holder: '' }); } catch (e) { /* exists or raced — the guarded update below decides */ }
    let s = null;
    try { s = await markerRef.get(); } catch (e) { return false; }
    if (!s || !s.exists) return false;
    const cur = s.data() || {};
    if (cur.holder && cur.at && Date.now() - Number(cur.at) < CLAIM_TIMEOUT_MS) return false;
    try { await markerRef.update({ at: Date.now(), holder }, { lastUpdateTime: s.updateTime }); return true; }
    catch (e2) { return false; }
}
/* [FULL-AUCTION 2026-11] Audit trail: every material auction event is a record under
 * products/{id}/auction_events (server-written, readable by signed-in users). */
async function auctionEvent(ref, type, details) {
    try {
        await ref.collection('auction_events').add(Object.assign({ type, at: new Date().toISOString() }, details || {}));
    } catch (e) { /* the audit trail never blocks the money path */ }
}
/* [FULL-AUCTION 2026-11] Tightened payment proof (was: any paid order containing the
 * product). A qualifying order must ALL hold:
 *   - buyer == the winner uid, and it contains this product,
 *   - it carries the auction commerce context (order.commerceMode or an item commerceMode),
 *   - its status is paid-side (not in UNPAID),
 *   - its amount covers the winner bid of THIS round (delivery/fees may sit on top).
 * Returns the qualifying order id, or null. */
async function winnerHasPaid(productId, uid, m) {
    const winBid = Number((m || {}).winnerBid) || 0;
    const q = await db().collection('orders').where('buyerId', '==', String(uid)).limit(50).get();
    for (const d of q.docs) {
        const o = d.data() || {};
        const items = Array.isArray(o.items) ? o.items : [];
        const hit = String(o.productId || '') === productId || items.some(i => String((i && (i.productId || i.itemId || i.id)) || '') === productId);
        if (!hit) continue;
        const auctionCtx = String(o.commerceMode || '') === 'auction' || items.some(i => String((i && i.commerceMode) || '') === 'auction');
        if (!auctionCtx) continue;
        if (UNPAID.indexOf(String(o.status || 'pending')) !== -1) continue;
        if (winBid > 0 && !(Number(o.amount) + 0.01 >= winBid)) continue;
        return d.id;
    }
    return null;
}
/* [FULL-AUCTION] Mark the CURRENT winner paid — exactly once per auction (payment ends
 * the whole winner flow). Shared by auctionConfirmPayment + both sweep paths, so a
 * sweep and a user confirm racing each other still produce ONE event/notification. */
async function markPaid(ref, uid, round, orderId, via) {
    if (!(await claimOnce(ref.collection('auction_events').doc('__paid'), '__paid_marker'))) return false;
    let marked = false;
    await db().runTransaction(async (t) => {
        const cur = ((await t.get(ref)).data() || {}).modeData || {};
        if (String(cur.winnerId || '') !== String(uid) || cur.winnerPaid === true) return;
        t.update(ref, { 'modeData.winnerPaid': true, 'modeData.paymentDeadline': null, 'modeData.paidOrderId': orderId });
        marked = true;
    });
    if (!marked) return false;
    await auctionEvent(ref, 'winner_paid', { winnerId: uid, round, orderId, via });
    return true;
}
async function nextBidder(ref, exclude) {
    const q = await ref.collection('bids').orderBy('amount', 'desc').limit(100).get();
    for (const d of q.docs) { const b = d.data() || {}; if (b.uid && exclude.indexOf(b.uid) === -1) return { uid: b.uid, name: b.name || 'mteja', amount: Number(b.amount) || 0 }; }
    return null;
}
/* Close one auction (idempotent). Returns true when this call closed it. */
async function closeAuction(ref, nowMs) {
    const pre = await ref.get().catch(() => null);
    if (!pre || !pre.exists) return false;
    const pm0 = (pre.data() || {}).modeData || {};
    const endsAt0 = Number(pm0.endTime) || 0;
    if (pm0.endNotified || pm0.cancelled === true || !(endsAt0 > 0 && nowMs >= endsAt0)) return false;
    /* [STAGE2 2026-11-12] A paused Live freezes its auctions: livePause/liveResume move
     * endTime forward by the paused duration on resume, so the clock that expires while the
     * room is frozen is NOT a real deadline. Finalizing here would silently close an auction
     * the host intended to resume (and pre-empt the host's own rule allowing pause only
     * before the first bid). The sweep and the client tick simply retry after resume. */
    if (pm0.livePaused === true) return false;
    /* [FULL-AUCTION] exactly-once: claim the close BEFORE the field transaction, so
     * parallel finalizers can not each close the auction and spam notifications. */
    if (!(await claimOnce(ref.collection('auction_events').doc('__closed'), '__closed_marker'))) return false;
    let closed = null;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) return;
        const p = s.data() || {}, m = p.modeData || {};
        const endsAt = Number(m.endTime) || 0;
        if (m.endNotified || m.cancelled === true || !(endsAt > 0 && nowMs >= endsAt)) return;
        if (m.livePaused === true) return;   // [STAGE2] re-checked inside the transaction: frozen = not expired
        /* [FULL-AUCTION 2026-11] reserve price: the seller's minimum. When the top bid
         * is below it, the item is NOT sold (no winner, no payment window). */
        const reserve = Number(m.reservePrice) || 0;
        const topBid = Number(m.currentBid) || 0;
        const reserveMet = !(reserve > 0) || (m.maxBidder && topBid >= reserve);
        t.update(ref, { 'modeData.ended': true, 'modeData.endedAt': new Date(nowMs).toISOString(),
            'modeData.winnerId': reserveMet ? (m.maxBidder || null) : null,
            'modeData.winnerName': reserveMet ? (m.maxBidderName || null) : null,
            'modeData.winnerBid': reserveMet ? (topBid || null) : null,
            'modeData.winnerRound': 1, 'modeData.pastWinners': [],
            'modeData.reserveMet': reserveMet,
            'modeData.unsold': !reserveMet,
            'modeData.paymentDeadline': (reserveMet && m.maxBidder) ? nowMs + PAYMENT_WINDOW_MS : null, 'modeData.endNotified': true,
            /* [ACCEPTANCE 2026-11-11] unfreeze on close: a paused-then-finalized auction
             * must not keep livePaused=true (side panel would read "Imesitishwa"). */
            'modeData.livePaused': false, 'modeData.livePausedAtMs': null });
        closed = { p, m, reserveMet, reserve };
    });
    if (!closed) return false;
    const { p, m, reserveMet, reserve } = closed, t = p.title || 'bidhaa';
    await auctionEvent(ref, 'closed', { winnerId: reserveMet ? (m.maxBidder || null) : null, topBid: Number(m.currentBid) || 0,
        totalBids: parseInt(m.totalBids, 10) || 0, reserve: reserve || 0, reserveMet });
    if (reserveMet && m.maxBidder) {
        await notify(m.maxBidder, 'Umeshinda Mnada!', 'Umeshinda mnada wa ' + t + ' kwa TSh ' + Number(m.currentBid || 0).toLocaleString() + '. Lipia ndani ya saa 24 ili kumaliza oda yako.',
            { type: 'auction_won', productId: ref.id, commerceMode: 'AUCTION' });
    } else if (!reserveMet && m.maxBidder) {
        await notify(m.maxBidder, 'Mnada umefungwa bila muuzaji', 'Zabuni yako ya juu (' + 'TSh ' + Number(m.currentBid || 0).toLocaleString() + ') haikufikia kiwango cha chini cha muuzaji, kwa hiyo bidhaa haijauzwa.',
            { type: 'auction_reserve_not_met', productId: ref.id, commerceMode: 'AUCTION' });
    }
    await notify(p.userId, 'Mnada wako umekamilika', (reserveMet && m.maxBidder)
        ? 'Mnada wa ' + t + ' umefungwa. Mshindi: ' + (m.maxBidderName || 'mteja') + ' kwa TSh ' + Number(m.currentBid || 0).toLocaleString() + '.'
        : (!reserveMet ? 'Mnada wa ' + t + ' umefungwa bila kuuzwa: zabuni ya juu haikufikia kiwango chako cha chini.'
            : 'Mnada wa ' + t + ' umefungwa bila zabuni.'), { type: 'auction_ended', productId: ref.id, commerceMode: 'AUCTION' });
    return true;
}
async function secondChance(ref, nowMs) {
    const s = await ref.get(); const p = s.data() || {}, m = p.modeData || {};
    if (!m.ended || !m.winnerId || !(Number(m.paymentDeadline) > 0) || nowMs < Number(m.paymentDeadline)) return false;
    /* [FULL-AUCTION] tightened proof: a second chance NEVER starts when the current
     * winner already paid for THIS auction round (order linked to auction+winner+bid). */
    const paidOrder = await winnerHasPaid(ref.id, m.winnerId, m);
    if (paidOrder) {
        await markPaid(ref, m.winnerId, parseInt(m.winnerRound, 10) || 1, paidOrder, 'sweep');
        return false;
    }
    const past = (Array.isArray(m.pastWinners) ? m.pastWinners : []).concat([m.winnerId]);
    const round = (parseInt(m.winnerRound, 10) || 1) + 1;
    const nb = round <= MAX_ROUNDS ? await nextBidder(ref, past) : null;
    /* [FULL-AUCTION] exactly-once per round: claim the move before transacting. */
    if (!(await claimOnce(ref.collection('auction_events').doc('__sc_round' + round), '__sc_marker'))) return false;
    let moved = null, didMove = false;
    await db().runTransaction(async (t) => {
        const cur = ((await t.get(ref)).data() || {}).modeData || {};
        if (cur.winnerId !== m.winnerId || Number(cur.paymentDeadline) !== Number(m.paymentDeadline)) return;   // someone else moved it
        t.update(ref, nb
            ? { 'modeData.winnerId': nb.uid, 'modeData.winnerName': nb.name, 'modeData.winnerBid': nb.amount, 'modeData.winnerRound': round,
                'modeData.pastWinners': past, 'modeData.paymentDeadline': nowMs + PAYMENT_WINDOW_MS }
            : { 'modeData.winnerId': null, 'modeData.winnerBid': null, 'modeData.pastWinners': past, 'modeData.paymentDeadline': null, 'modeData.unsold': true });
        moved = nb; didMove = true;
    });
    if (!didMove) return false;   // lost the race: no events, no notifications
    await auctionEvent(ref, 'second_chance', { fromWinner: m.winnerId, round, toWinner: moved ? moved.uid : null, toBid: moved ? moved.amount : null, exhausted: !moved });
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

/* [FULL-AUCTION 2026-11] Cancel an auction.
 * Policy: the owner may cancel only BEFORE the first bid (buyers who already bid hold a
 * promise to buy — their auction must end, not vanish). Admins may cancel any live
 * auction with a written reason (abuse/fraud), recorded in the audit trail.
 * A cancelled auction is ended with NO winner; bids stay as history. */
exports.auctionCancel = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid, d = req.data || {};
    const productId = String(d.productId || '');
    if (!productId || productId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'bidhaa_haipo');
    const reason = String(d.reason || '').replace(/[<>]/g, '').slice(0, 300);
    const ref = db().doc('products/' + productId);
    const s = await ref.get();
    if (!s.exists || saleModeOf(s.data()) !== 'auction') throw new HttpsError('not-found', 'si_mnada');
    const p = s.data() || {}, m = p.modeData || {};
    const isOwner = String(p.userId || '') === uid;
    const tok = (req.auth.token) || {};
    const isAdmin = tok.admin === true || tok.superAdmin === true;
    if (!isOwner && !isAdmin) throw new HttpsError('permission-denied', 'si_mwenye_mnada');
    if (m.ended || m.cancelled) throw new HttpsError('failed-precondition', 'mnada_umeisha');
    const bids = parseInt(m.totalBids, 10) || 0;
    if (bids > 0 && !isAdmin) throw new HttpsError('failed-precondition', 'mnada_una_zabuni');
    if (isAdmin && !isOwner && reason.length < 5) throw new HttpsError('invalid-argument', 'sababu_inahitajika');
    /* [FULL-AUCTION] atomic cancel (re-checks state; exactly-once via claim). */
    if (!(await claimOnce(ref.collection('auction_events').doc('__cancelled'), '__cancelled_marker'))) throw new HttpsError('failed-precondition', 'mnada_umeisha');
    let cancelled = false;
    await db().runTransaction(async (t) => {
        const cur = ((await t.get(ref)).data() || {}).modeData || {};
        if (cur.ended || cur.cancelled) return;
        if ((parseInt(cur.totalBids, 10) || 0) > 0 && !isAdmin) throw new HttpsError('failed-precondition', 'mnada_una_zabuni');
        t.update(ref, { 'modeData.cancelled': true, 'modeData.cancelledAt': new Date().toISOString(), 'modeData.cancelledBy': uid,
            'modeData.cancelReason': reason || null, 'modeData.ended': true, 'modeData.endedAt': new Date().toISOString(),
            'modeData.winnerId': null, 'modeData.winnerBid': null, 'modeData.unsold': true,
            'modeData.paymentDeadline': null, 'modeData.endNotified': true, 'modeData.livePaused': false, 'modeData.livePausedAtMs': null });
        cancelled = true;
    });
    if (!cancelled) throw new HttpsError('failed-precondition', 'mnada_umeisha');
    await auctionEvent(ref, 'cancelled', { by: uid, byAdmin: !!(isAdmin && !isOwner), reason: reason || null, bidsVoided: bids });
    if (m.maxBidder) {
        await notify(m.maxBidder, 'Mnada umeghairiwa', 'Mnada wa ' + (p.title || 'bidhaa') + ' umeghairiwa na muuzaji. Zabuni yako haikuhesabiwa kama ununuzi.',
            { type: 'auction_cancelled', productId, commerceMode: 'AUCTION' });
    }
    await notify(p.userId, 'Mnada umeghairiwa', 'Mnada wa ' + (p.title || 'bidhaa') + ' umeghairiwa' + (reason ? ': ' + reason : '.'),
        { type: 'auction_cancelled', productId, commerceMode: 'AUCTION' });
    return { ok: true, bidsVoided: bids };
});

/* [FULL-AUCTION 2026-11] The winner (or the sweep) confirms payment for THIS auction.
 * Verifies server-side: auction ended + caller is the current winner + a paid order
 * exists that is linked to this auction, this winner and this round's bid.
 * On success the payment window closes immediately (no second chance can start later). */
exports.auctionConfirmPayment = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid;
    const productId = String((req.data || {}).productId || '');
    if (!productId || productId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'bidhaa_haipo');
    const ref = db().doc('products/' + productId);
    const s = await ref.get();
    if (!s.exists || saleModeOf(s.data()) !== 'auction') throw new HttpsError('not-found', 'si_mnada');
    const p = s.data() || {}, m = p.modeData || {};
    if (!m.ended || m.cancelled) throw new HttpsError('failed-precondition', 'mnada_haujaisha');
    if (String(m.winnerId || '') !== uid) throw new HttpsError('permission-denied', 'si_mshindi');
    if (m.winnerPaid === true) return { ok: true, already: true };
    const orderId = await winnerHasPaid(productId, uid, m);
    if (!orderId) throw new HttpsError('failed-precondition', 'malipo_hayajathibitishwa');
    const marked = await markPaid(ref, uid, parseInt(m.winnerRound, 10) || 1, orderId, 'confirm');
    if (!marked) {
        /* [FULL-AUCTION] Claim lost (or winner moved under us): the claim-holder
         * may still be committing its tx. Poll briefly so a parallel confirm
         * converges to already:true instead of a spurious jaribu_tena (X7). Only
         * when the paid state never lands (holder crashed; stealable after
         * CLAIM_TIMEOUT_MS) do we ask the client to retry. */
        for (let i = 0; i < 15; i++) {
            const cur = (((await ref.get()).data() || {}).modeData) || {};
            if (cur.winnerPaid === true && String(cur.winnerId || '') === uid) return { ok: true, already: true };
            await new Promise(r => setTimeout(r, 200));
        }
        throw new HttpsError('unavailable', 'jaribu_tena');
    }
    await notify(p.userId, 'Mshindi amelipa', 'Mshindi wa mnada wa ' + (p.title || 'bidhaa') + ' amelipa TSh ' + Number(m.winnerBid || 0).toLocaleString() + '. Tayarisha usafirishaji.',
        { type: 'auction_winner_paid', productId, commerceMode: 'AUCTION' });
    return { ok: true, orderId };
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

/* [FULL-AUCTION 2026-11] Ending-soon: one server notice per auction (leader + seller)
 * when the end is within the sweep horizon. The client banner may miss it when the
 * app is closed; this notice does not. */
const ENDING_SOON_MS = 15 * 60 * 1000, REMIND_WITHIN_MS = 6 * 60 * 60 * 1000;
async function endingSoon(ref, p, m, nowMs) {
    if (m.ended || m.cancelled || m.endingSoonNotified) return false;
    const endsAt = Number(m.endTime) || 0;
    if (!(endsAt > nowMs) || endsAt - nowMs > ENDING_SOON_MS) return false;
    let fire = false;
    await db().runTransaction(async (t) => {
        const cur = ((await t.get(ref)).data() || {}).modeData || {};
        if (cur.ended || cur.cancelled || cur.endingSoonNotified) return;
        t.update(ref, { 'modeData.endingSoonNotified': true });
        fire = true;
    });
    if (!fire) return false;
    const t = p.title || 'bidhaa';
    if (m.maxBidder) await notify(m.maxBidder, 'Mnada unakaribia kuisha', 'Mnada wa ' + t + ' unaisha baada ya dakika chache. Zabuni ya juu: TSh ' + Number(m.currentBid || 0).toLocaleString() + '.', { type: 'auction_ending_soon', productId: ref.id, commerceMode: 'AUCTION' });
    await notify(p.userId, 'Mnada wako unakaribia kuisha', 'Mnada wa ' + t + ' unaisha hivi karibuni.', { type: 'auction_ending_soon', productId: ref.id, commerceMode: 'AUCTION' });
    await auctionEvent(ref, 'ending_soon', {});
    return true;
}
/* [FULL-AUCTION 2026-11] Winner payment reminders + early paid-marking (the winner may
 * pay without ever calling auctionConfirmPayment, e.g. IPN-only flows). */
async function winnerWindow(ref, p, m, nowMs) {
    const out = { reminded: false, markedPaid: false };
    if (!m.ended || m.cancelled || !m.winnerId || !(Number(m.paymentDeadline) > 0)) return out;
    if (m.winnerPaid === true) return out;
    const orderId = await winnerHasPaid(ref.id, m.winnerId, m);
    if (orderId) {
        if (await markPaid(ref, m.winnerId, parseInt(m.winnerRound, 10) || 1, orderId, 'sweep')) out.markedPaid = true;
        return out;
    }
    const round = parseInt(m.winnerRound, 10) || 1;
    if (Number(m.paymentDeadline) - nowMs > REMIND_WITHIN_MS) return out;
    if (Number(m.remindedRound) === round) return out;
    let fire = false;
    await db().runTransaction(async (t) => {
        const cur = ((await t.get(ref)).data() || {}).modeData || {};
        if (String(cur.winnerId || '') !== String(m.winnerId) || Number(cur.remindedRound) === round || cur.winnerPaid === true) return;
        t.update(ref, { 'modeData.remindedRound': round });
        fire = true;
    });
    if (!fire) return out;
    await notify(m.winnerId, 'Kumbusho: lipia mnada ulioshinda', 'Bado saa chache kulipia ' + (p.title || 'bidhaa') + ' (TSh ' + Number(m.winnerBid || 0).toLocaleString() + '). Usipolipa, nafasi inapewa mzabuni anayefuata.', { type: 'auction_payment_reminder', productId: ref.id, commerceMode: 'AUCTION' });
    await auctionEvent(ref, 'payment_reminder', { winnerId: m.winnerId, round });
    out.reminded = true;
    return out;
}

/* [R13-B] sweep = close finished auctions + run the winner payment window. */
async function sweepAuctions(nowMs) {
    nowMs = nowMs || Date.now();
    const out = { checked: 0, ended: 0, secondChance: 0, endingSoon: 0, reminded: 0, markedPaid: 0 };
    const q = await db().collection('products').where('saleMode', '==', 'auction').limit(500).get();
    for (const doc of q.docs) {
        out.checked++;
        const p = doc.data() || {}, m = p.modeData || {};
        if (await endingSoon(doc.ref, p, m, nowMs)) out.endingSoon++;
        if (await closeAuction(doc.ref, nowMs)) out.ended++;
        const w = await winnerWindow(doc.ref, p, ((await doc.ref.get()).data() || {}).modeData || {});
        if (w.reminded) out.reminded++;
        if (w.markedPaid) out.markedPaid++;
        if (await secondChance(doc.ref, nowMs)) out.secondChance++;
    }
    return out;
}
exports.commerceModesSweep = onSchedule({ region: REGION, schedule: 'every 15 minutes', timeZone: 'Africa/Dar_es_Salaam' },
    async (evt) => {
        const emu = process.env.FIRESTORE_EMULATOR_HOST && evt && evt.scheduleTime ? Date.parse(evt.scheduleTime) : 0;
        const now = emu > 0 ? emu : Date.now();
        await sweepAuctions(now);
        await sweepPriceDrops(now);
        await require('./price-drop-queue')._testing.sweepQueues(now);   // [R13-D] queue -> opportunities
        await require('./live-commerce')._testing.sweepLive(now);   // [FULL-AUCTION] live starting-soon/expiry/stale viewers
    });

exports.claimOnce = claimOnce;   // shared exactly-once primitive (used by live-commerce.js)
exports._testing = { validateBid, validateGroupJoin, saleModeOf, sweepAuctions, minNextBid, antiSnipeEnd, closeAuction, secondChance, sweepPriceDrops, winnerHasPaid, endingSoon, winnerWindow, claimOnce };

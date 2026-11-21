/**
 * SokoHai — Auction admin (server-only).            [R14 2026-11-13]
 *
 * The admin auction dashboard reads and acts ONLY through these callables:
 *   adminAuctionsList   — every auction with a derived status (active, paused, awaiting payment,
 *                         payment expired, paid, unsold, cancelled, scheduled, closing)
 *   adminAuctionDetail  — bids (full names/uids, admin only), auction events, the winner's
 *                         orders for this product and the server's own payment check
 *   adminAuctionAction  — finalize | second_chance | extend_payment, each with a written reason
 *                         and an append-only admin_audit_log record.
 * Cancellation stays in auctionCancel (admins may cancel with a reason; it now also writes
 * admin_audit_log). Payment is never "marked" by hand: only auctionConfirmPayment / the sweep
 * may mark a winner paid, after finding a real paid auction order.
 * Role checks run here (custom claims / verified admin e-mail), not in the browser.
 */
'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const { onCall, logBestEffort } = require('./errors'); // [SRV-10] same onCall, wrapped in the shared error contract
const admin = require('firebase-admin');
const authority = require('./admin-authority');
const cm = require('./commerce-modes');

const REGION = 'europe-west1';
const db = () => admin.firestore();
const { isAdmin, writeAudit, requireReason } = authority._internal;
const { closeAuction, secondChance, winnerHasPaid } = cm._admin;

function needAdmin(req) {
    if (!req || !req.auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    if (!isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
}
function cleanPid(v) {
    const s = String(v || '').trim();
    if (!s || s.indexOf('/') !== -1 || s.length > 200) throw new HttpsError('invalid-argument', 'bidhaa_haipo');
    return s;
}
const num = (v) => Number(v) || 0;

/* One status per auction, from server fields only (the same fields the buyer UI uses). */
function statusOf(m, now) {
    if (m.cancelled === true) return 'cancelled';
    if (m.winnerPaid === true) return 'paid';
    if (m.ended) {
        if (!m.winnerId) return 'unsold';
        return num(m.paymentDeadline) > 0 && now > num(m.paymentDeadline) ? 'payment_expired' : 'awaiting_payment';
    }
    if (num(m.startTime) > now) return 'scheduled';
    if (m.livePaused === true) return 'paused';
    if (num(m.endTime) > 0 && now >= num(m.endTime)) return 'closing';
    return 'active';
}
function summary(d, now) {
    const p = d.data() || {}, m = p.modeData || {};
    return {
        id: d.id, title: String(p.title || p.name || '').slice(0, 120), sellerId: p.userId || null,
        sellerName: p.sellerName || p.ownerName || null, startPrice: num(p.price), stock: p.stock == null ? null : num(p.stock),
        currentBid: num(m.currentBid), totalBids: num(m.totalBids), bidderCount: num(m.bidderCount), extensions: num(m.extensions),
        startTime: num(m.startTime) || null, endTime: num(m.endTime) || null, ended: !!m.ended, cancelled: m.cancelled === true,
        cancelReason: m.cancelReason || null, winnerId: m.winnerId || null, winnerName: m.winnerName || m.maxBidderName || null,
        winnerBid: num(m.winnerBid) || null, winnerRound: num(m.winnerRound) || null, paymentDeadline: num(m.paymentDeadline) || null,
        winnerPaid: m.winnerPaid === true, paidOrderId: m.paidOrderId || null, pastWinners: Array.isArray(m.pastWinners) ? m.pastWinners.length : 0,
        unsold: m.unsold === true, livePaused: m.livePaused === true, status: statusOf(m, now)
    };
}

exports.adminAuctionsList = onCall({ region: REGION }, async (req) => {
    needAdmin(req);
    const want = String((req.data || {}).status || 'all');
    const now = Date.now();
    const snap = await db().collection('products').where('saleMode', '==', 'auction').limit(300).get();
    const rows = snap.docs.map(d => summary(d, now));
    const counts = {};
    rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const list = (want === 'all' ? rows : rows.filter(r => r.status === want))
        .sort((a, b) => (b.endTime || 0) - (a.endTime || 0)).slice(0, 150);
    return { ok: true, now, counts, total: rows.length, auctions: list };
});

exports.adminAuctionDetail = onCall({ region: REGION }, async (req) => {
    needAdmin(req);
    const productId = cleanPid((req.data || {}).productId);
    const ref = db().doc('products/' + productId);
    const s = await ref.get();
    if (!s.exists || String((s.data() || {}).saleMode || ((s.data() || {}).modeData || {}).mode || '') !== 'auction') throw new HttpsError('not-found', 'si_mnada');
    const now = Date.now(), m = (s.data() || {}).modeData || {};
    const bids = (await ref.collection('bids').orderBy('amount', 'desc').limit(100).get()).docs.map(d => {
        const b = d.data() || {};
        return { id: d.id, uid: b.uid || null, name: b.name || null, amount: num(b.amount), at: b.at || b.createdAt || null };
    });
    const events = (await ref.collection('auction_events').limit(200).get()).docs
        .map(d => Object.assign({ id: d.id }, d.data()))
        .filter(e => !String(e.type || '').startsWith('__') && !String(e.id).startsWith('__'))
        .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    let winnerOrders = [], paidOrderFound = null;
    if (m.winnerId) {
        const q = await db().collection('orders').where('buyerId', '==', String(m.winnerId)).limit(50).get();
        winnerOrders = q.docs.map(d => ({ id: d.id, o: d.data() || {} }))
            .filter(x => String(x.o.productId || '') === productId || (Array.isArray(x.o.items) && x.o.items.some(i => String((i && (i.productId || i.itemId || i.id)) || '') === productId)))
            .map(x => ({ id: x.id, status: x.o.status || null, amount: num(x.o.amount), commerceMode: x.o.commerceMode || null, createdAt: x.o.createdAt || null }));
        paidOrderFound = await winnerHasPaid(productId, m.winnerId, m);
    }
    return { ok: true, auction: summary(s, now), bids, events, winnerOrders, paidOrderFound: paidOrderFound || null };
});

const ACTIONS = ['finalize', 'second_chance', 'extend_payment'];
exports.adminAuctionAction = onCall({ region: REGION }, async (req) => {
    needAdmin(req);
    const d = req.data || {};
    const productId = cleanPid(d.productId);
    const action = String(d.action || '');
    if (ACTIONS.indexOf(action) === -1) throw new HttpsError('invalid-argument', 'kitendo_hakijulikani');
    const reason = requireReason(d.reason, 5);
    const ref = db().doc('products/' + productId);
    const s = await ref.get();
    if (!s.exists) throw new HttpsError('not-found', 'si_mnada');
    const before = summary(s, Date.now());
    const now = Date.now();
    let result;
    if (action === 'finalize') {
        if (before.ended || before.cancelled) throw new HttpsError('failed-precondition', 'mnada_umeisha');
        if (!(before.endTime && now >= before.endTime)) throw new HttpsError('failed-precondition', 'muda_haujaisha');
        if (before.livePaused) throw new HttpsError('failed-precondition', 'mnada_umesitishwa');
        result = { closed: await closeAuction(ref, now) };
    } else if (action === 'second_chance') {
        if (!before.ended || !before.winnerId || before.winnerPaid) throw new HttpsError('failed-precondition', 'hakuna_mshindi_asiyelipa');
        if (!(before.paymentDeadline && now >= before.paymentDeadline)) throw new HttpsError('failed-precondition', 'muda_wa_malipo_bado');
        result = { moved: await secondChance(ref, now) };
    } else {
        const hours = Math.round(Number(d.hours));
        if (!(hours >= 1 && hours <= 72)) throw new HttpsError('invalid-argument', 'saa_1_hadi_72');
        if (!before.ended || !before.winnerId || before.winnerPaid) throw new HttpsError('failed-precondition', 'hakuna_mshindi_asiyelipa');
        let next = null;
        await db().runTransaction(async (t) => {
            const cur = ((await t.get(ref)).data() || {}).modeData || {};
            if (String(cur.winnerId || '') !== before.winnerId || cur.winnerPaid === true) throw new HttpsError('failed-precondition', 'hali_imebadilika');
            next = Math.max(num(cur.paymentDeadline), now) + hours * 3600000;
            t.update(ref, { 'modeData.paymentDeadline': next });
        });
        await ref.collection('auction_events').add({ type: 'payment_extended', at: new Date().toISOString(), winnerId: before.winnerId, hours, newDeadline: next, byAdmin: true, reason });
        try {
            await db().collection('notifications').add({ userId: before.winnerId, title: 'Muda wa kulipia mnada umeongezwa',
                body: 'Una hadi ' + new Date(next).toISOString().replace('T', ' ').slice(0, 16) + ' (UTC) kulipia ' + before.title + '.',
                createdAt: new Date().toISOString(), read: false, source: 'server', type: 'auction_payment_extended', productId, commerceMode: 'AUCTION' });
        } catch (e) { logBestEffort('auction-admin:145', e); /* a notification never blocks the action */ }
        result = { paymentDeadline: next };
    }
    const after = summary(await ref.get(), Date.now());
    await writeAudit(req, 'auction_' + action, { type: 'auction', productId }, { reason, before: { status: before.status, winnerId: before.winnerId, paymentDeadline: before.paymentDeadline }, after: { status: after.status, winnerId: after.winnerId, paymentDeadline: after.paymentDeadline }, result });
    return { ok: true, action, result, auction: after };
});

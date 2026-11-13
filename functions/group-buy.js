/**
 * SokoHai — Group Buy lifecycle + policy engine.                    [R16 2026-11-13]
 *
 * Builds on commerce-modes.groupBuyJoin (join list, group price for members) and adds the
 * missing lifecycle: leave, cancel, deadline handling (success / failure), a payment window
 * for members, admin oversight and an owner-selectable money policy.
 *
 * POLICY (system/config.groupBuy, written only by adminSetGroupBuyPolicy, audited):
 *   paymentMode        'pay_after_target' (DEFAULT, safe): no money moves while the campaign
 *                      runs. When the target is reached each member has paymentWindowHours to
 *                      buy at the group price through the normal checkout/escrow. Below target
 *                      at the deadline = failed; nobody was charged, nothing to refund.
 *                      'escrow_commit': members commit the full base price from their SokoPay
 *                      wallet when joining (held, never released to the seller before success).
 *                      Success -> one escrowed order per member at the final group price, the
 *                      difference refunded. Failure / cancel / leave -> automatic wallet refund.
 *                      ACTIVE ONLY when realMoneyApproved === true (super admin), otherwise the
 *                      engine falls back to pay_after_target. Default: false (owner decision).
 *   paymentWindowHours 48   maxCampaignDays 14   maxParticipants 100 (hard cap per campaign)
 *   allowLeaveBeforeTarget true
 * All money writes are idempotent (deterministic ledger ids) and reconcile with wallet_ledger.
 */
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const authority = require('./admin-authority');
const { modeUnitPrice } = require('./pricing-core');

const REGION = 'europe-west1';
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;
const { isAdmin, isSuperAdmin, writeAudit, requireReason } = authority._internal;

const DEFAULT_POLICY = { paymentMode: 'pay_after_target', realMoneyApproved: false, paymentWindowHours: 48, maxCampaignDays: 14, maxParticipants: 100, allowLeaveBeforeTarget: true };
async function loadPolicy() {
    let raw = {};
    try { const s = await db().doc('system/config').get(); raw = (s.exists && (s.data() || {}).groupBuy) || {}; } catch (e) {}
    const p = Object.assign({}, DEFAULT_POLICY, raw);
    p.paymentWindowHours = Math.min(168, Math.max(1, Number(p.paymentWindowHours) || 48));
    p.maxCampaignDays = Math.min(60, Math.max(1, Number(p.maxCampaignDays) || 14));
    p.maxParticipants = Math.min(100, Math.max(2, Number(p.maxParticipants) || 100));
    p.effectiveMode = (p.paymentMode === 'escrow_commit' && p.realMoneyApproved === true) ? 'escrow_commit' : 'pay_after_target';
    return p;
}
const isGroup = (p) => String((p && p.saleMode) || ((p && p.modeData) || {}).mode || '') === 'group_buy';
const num = (v) => Number(v) || 0;
function statusOf(md, nowMs) {
    if (md.groupStatus === 'cancelled') return 'cancelled';
    const joined = parseInt(md.joinedUsers, 10) || 1, target = parseInt(md.targetPeople, 10) || 10;
    if (md.groupStatus === 'closed') return 'closed';
    if (joined >= target) return md.paymentDeadline && nowMs > num(md.paymentDeadline) ? 'closed' : 'successful';
    if (num(md.endTime) > 0 && nowMs >= num(md.endTime)) return 'failed';
    return 'active';
}
async function notify(uid, title, body, extra) {
    if (!uid) return;
    try { await db().collection('notifications').add(Object.assign({ userId: String(uid), title, body, createdAt: new Date().toISOString(), read: false, source: 'server', commerceMode: 'GROUP_BUY' }, extra || {})); } catch (e) {}
}
function cleanPid(v) { const s = String(v || '').trim(); if (!s || s.indexOf('/') !== -1 || s.length > 200) throw new HttpsError('invalid-argument', 'bidhaa_haipo'); return s; }
const commitRef = (pid, uid) => db().doc('group_buy_commits/' + pid + '_' + uid);

/* refund one escrow commitment to the member's wallet exactly once (inside a transaction) */
async function refundCommit(t, pid, uid, why, now) {
    const cref = commitRef(pid, uid);
    const cs = await t.get(cref);
    if (!cs.exists) return 0;
    const c = cs.data() || {};
    if (c.state !== 'committed') return 0;
    const amt = num(c.amount);
    return { cref, amt, apply: () => {
        t.update(db().doc('users/' + uid), { walletBalance: FV().increment(amt) });
        t.set(db().doc('wallet_ledger/gbrefund_' + pid + '_' + uid + '_' + (c.seq || 1)), { userId: uid, callerUid: 'system', amountTSh: amt, type: 'refund', note: 'Group Buy: ' + why, productId: pid, createdAt: now });
        t.update(cref, { state: 'refunded', refundedAt: now, refundReason: why });
    } };
}

/* ---------- escrow_commit: money is committed at join (wraps the existing join) ---------- */
exports.groupBuyCommitJoin = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid, pid = cleanPid((req.data || {}).productId);
    const pol = await loadPolicy();
    if (pol.effectiveMode !== 'escrow_commit') throw new HttpsError('failed-precondition', 'group_buy_lipa_baada_ya_lengo'); // pay_after_target: use groupBuyJoin
    const ref = db().doc('products/' + pid), now = new Date().toISOString();
    let out = null;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists || !isGroup(s.data())) throw new HttpsError('not-found', 'si_group');
        const p = s.data() || {}, md = p.modeData || {};
        if (String(p.userId || '') === uid) throw new HttpsError('failed-precondition', 'tangazo_lako');
        const st = statusOf(md, Date.now());
        const parts = Array.isArray(md.participants) ? md.participants : [];
        const cs = await t.get(commitRef(pid, uid));
        if (parts.indexOf(uid) !== -1 || (cs.exists && cs.data().state === 'committed')) { out = { ok: true, already: true }; return; }
        if (st !== 'active') throw new HttpsError('failed-precondition', 'group_' + st);
        const cap = Math.min(pol.maxParticipants, parseInt(md.maxPeople, 10) || pol.maxParticipants);
        if (parts.length + 1 > cap) throw new HttpsError('failed-precondition', 'group_imejaa');
        const amount = Math.round(num(p.price));
        if (!(amount > 0)) throw new HttpsError('failed-precondition', 'bei_si_sahihi');
        const us = await t.get(db().doc('users/' + uid));
        if (num((us.data() || {}).walletBalance) < amount) throw new HttpsError('failed-precondition', 'INSUFFICIENT_BALANCE');
        const joined = (parseInt(md.joinedUsers, 10) || 1) + 1;
        const seq = (cs.exists ? (Number(cs.data().seq) || 1) : 0) + 1; // a member may leave and join again: one ledger row per commitment
        t.update(db().doc('users/' + uid), { walletBalance: FV().increment(-amount) });
        t.set(db().doc('wallet_ledger/gbcommit_' + pid + '_' + uid + '_' + seq), { userId: uid, callerUid: uid, amountTSh: -amount, type: 'purchase', note: 'Group Buy: ahadi ya malipo (escrow)', productId: pid, createdAt: now });
        t.set(commitRef(pid, uid), { productId: pid, uid, sellerId: p.userId, amount, seq, state: 'committed', committedAt: now });
        t.update(ref, { 'modeData.joinedUsers': joined, 'modeData.participants': FV().arrayUnion(uid) });
        out = { ok: true, joined, target: parseInt(md.targetPeople, 10) || 10, committed: amount };
    });
    return out;
});

exports.groupBuyLeave = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid, pid = cleanPid((req.data || {}).productId);
    const pol = await loadPolicy();
    if (!pol.allowLeaveBeforeTarget) throw new HttpsError('failed-precondition', 'kutoka_hakuruhusiwi');
    const ref = db().doc('products/' + pid), now = new Date().toISOString();
    let refunded = 0;
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists || !isGroup(s.data())) throw new HttpsError('not-found', 'si_group');
        const md = (s.data() || {}).modeData || {};
        const parts = Array.isArray(md.participants) ? md.participants : [];
        if (parts.indexOf(uid) === -1) throw new HttpsError('failed-precondition', 'si_mwanachama');
        if (statusOf(md, Date.now()) !== 'active') throw new HttpsError('failed-precondition', 'lengo_limefikiwa_au_imeisha');
        const r = await refundCommit(t, pid, uid, 'umetoka kwenye kikundi', now);
        t.update(ref, { 'modeData.participants': FV().arrayRemove(uid), 'modeData.joinedUsers': Math.max(1, (parseInt(md.joinedUsers, 10) || 1) - 1) });
        if (r) { r.apply(); refunded = r.amt; }
    });
    return { ok: true, refunded };
});

exports.groupBuyCancel = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const pid = cleanPid((req.data || {}).productId);
    const reason = requireReason((req.data || {}).reason, 5);
    const ref = db().doc('products/' + pid);
    const s0 = await ref.get();
    if (!s0.exists || !isGroup(s0.data())) throw new HttpsError('not-found', 'si_group');
    const p0 = s0.data() || {}, adm = isAdmin(req);
    if (!adm && String(p0.userId || '') !== req.auth.uid) throw new HttpsError('permission-denied', 'mmiliki_au_admin');
    const st0 = statusOf(p0.modeData || {}, Date.now());
    if (!adm && st0 !== 'active') throw new HttpsError('failed-precondition', 'group_' + st0);
    if (st0 === 'cancelled') return { ok: true, already: true };
    if ((p0.modeData || {}).ordersCreated === true) throw new HttpsError('failed-precondition', 'oda_zimeshatengenezwa_tumia_mgogoro');
    const res = await closeCampaign(pid, 'cancelled', 'imeghairiwa: ' + reason);
    await writeAudit(req, 'group_buy_cancel', { type: 'product', productId: pid }, { reason, before: st0, refunded: res.refunded });
    return Object.assign({ ok: true }, res);
});

/* failed / cancelled: mark, refund every commitment (batched transactions), notify */
async function closeCampaign(pid, status, why) {
    const ref = db().doc('products/' + pid), now = new Date().toISOString();
    const p = (await ref.get()).data() || {};
    const parts = Array.isArray((p.modeData || {}).participants) ? p.modeData.participants.slice() : [];
    let refunded = 0;
    for (let i = 0; i < parts.length; i += 100) {
        await db().runTransaction(async (t) => {
            const rs = [];
            for (const uid of parts.slice(i, i + 100)) rs.push(await refundCommit(t, pid, uid, why, now));
            rs.forEach(r => { if (r) { r.apply(); refunded += r.amt; } });
        });
    }
    await ref.update({ 'modeData.groupStatus': status, 'modeData.closedAt': now, 'modeData.closeReason': why });
    for (const uid of parts.slice(0, 200)) await notify(uid, status === 'failed' ? 'Group Buy haikufikia lengo' : 'Group Buy imeghairiwa', (p.title || 'Bidhaa') + ': ' + why + (refunded ? '. Ahadi yako imerudishwa kwenye wallet.' : '. Hukutozwa chochote.'), { type: 'group_buy_' + status, productId: pid });
    await notify(p.userId, status === 'failed' ? 'Group Buy haikufikia lengo' : 'Group Buy imeghairiwa', (p.title || 'Bidhaa') + ': ' + why, { type: 'group_buy_' + status, productId: pid });
    return { status, refunded, members: parts.length };
}

/* success: open the payment window; in escrow_commit mode create escrowed orders at the final price */
async function succeed(pid, pol) {
    const ref = db().doc('products/' + pid), now = new Date().toISOString(), nowMs = Date.now();
    const s = await ref.get(); const p = s.data() || {}, md = p.modeData || {};
    const deadline = nowMs + pol.paymentWindowHours * 3600000;
    const parts = Array.isArray(md.participants) ? md.participants.slice() : [];
    let orders = 0, refunded = 0;
    const commits = await db().collection('group_buy_commits').where('productId', '==', pid).where('state', '==', 'committed').get();
    if (!commits.empty) {
        // escrow_commit campaign: final price as for any member (all members share the same count)
        for (const d of commits.docs) {
            const c = d.data(), uid = c.uid;
            await db().runTransaction(async (t) => {
                const cs = await t.get(d.ref);
                if (!cs.exists || cs.data().state !== 'committed') return;
                const ps = await t.get(ref); const pp = ps.data() || {};
                const stock = pp.stock == null ? Infinity : num(pp.stock);
                const now2 = new Date().toISOString();
                if (stock < 1) { // out of stock -> refund this member
                    t.update(db().doc('users/' + uid), { walletBalance: FV().increment(num(c.amount)) });
                    t.set(db().doc('wallet_ledger/gbrefund_' + pid + '_' + uid + '_' + (c.seq || 1)), { userId: uid, callerUid: 'system', amountTSh: num(c.amount), type: 'refund', note: 'Group Buy: stock imeisha', productId: pid, createdAt: now2 });
                    t.update(d.ref, { state: 'refunded', refundReason: 'stock', refundedAt: now2 }); refunded += num(c.amount); return;
                }
                const price = Math.min(num(c.amount), modeUnitPrice(pp, 1, uid, nowMs));
                const diff = Math.round(num(c.amount) - price);
                const oref = db().collection('orders').doc('gb_' + pid + '_' + uid);
                t.set(oref, { buyerId: uid, sellerId: pp.userId, productId: pid, itemId: pid, quantity: 1, amount: price, itemTitle: 'Group Buy: ' + (pp.title || 'bidhaa'),
                    status: 'held', heldAt: now2, paymentStatus: 'paid', paymentVerified: true, paymentVerifiedBy: 'wallet', verifiedAmount: price, paidAt: now2, paymentProtectedAt: now2,
                    pricedByServer: true, priceSource: 'group_buy', commerceMode: 'GROUP_BUY', commerceType: 'product', deliveryStatus: 'held', groupBuyProductId: pid, date: now2, createdAt: now2 });
                t.set(db().collection('escrow_holds').doc('order_' + oref.id), { kind: 'escrow_hold', target: 'order', targetId: oref.id, amount: price, payerUid: uid, payeeUid: pp.userId, method: 'wallet', source: 'group_buy', verifiedAt: now2, released: false });
                if (diff > 0) {
                    t.update(db().doc('users/' + uid), { walletBalance: FV().increment(diff) });
                    t.set(db().doc('wallet_ledger/gbdiff_' + pid + '_' + uid + '_' + (c.seq || 1)), { userId: uid, callerUid: 'system', amountTSh: diff, type: 'refund', note: 'Group Buy: tofauti ya bei ya kikundi', productId: pid, createdAt: now2 });
                    refunded += diff;
                }
                if (pp.stock != null) t.update(ref, { stock: FV().increment(-1) });
                t.update(d.ref, { state: 'ordered', orderId: oref.id, finalPrice: price, orderedAt: now2 });
                orders++;
            });
        }
        await ref.update({ 'modeData.groupStatus': 'successful', 'modeData.ordersCreated': true, 'modeData.successAt': now });
    } else {
        await ref.update({ 'modeData.groupStatus': 'successful', 'modeData.paymentDeadline': deadline, 'modeData.successAt': now });
    }
    for (const uid of parts.slice(0, 200)) await notify(uid, 'Group Buy imefanikiwa', commits.empty
        ? (p.title || 'Bidhaa') + ': lipia kwa bei ya kikundi kabla ya ' + new Date(deadline).toISOString().slice(0, 16).replace('T', ' ') + ' (UTC).'
        : (p.title || 'Bidhaa') + ': oda yako imeundwa na pesa iko escrow. Utapokea mzigo kutoka kwa muuzaji.', { type: 'group_buy_paywindow', productId: pid });
    return { status: 'successful', orders, refunded, paymentDeadline: commits.empty ? deadline : null };
}

/* one campaign: move it to its next state if its time has come (idempotent) */
async function processCampaign(pid) {
    const pol = await loadPolicy();
    const s = await db().doc('products/' + pid).get();
    if (!s.exists || !isGroup(s.data())) return { skipped: 'si_group' };
    const md = (s.data() || {}).modeData || {}, nowMs = Date.now();
    if (md.groupStatus === 'cancelled' || md.groupStatus === 'failed' || md.groupStatus === 'closed') return { status: md.groupStatus, unchanged: true };
    const joined = parseInt(md.joinedUsers, 10) || 1, target = parseInt(md.targetPeople, 10) || 10;
    if (joined >= target && md.groupStatus !== 'successful') return succeed(pid, pol);
    if (md.groupStatus === 'successful' && md.paymentDeadline && nowMs > num(md.paymentDeadline)) {
        await db().doc('products/' + pid).update({ 'modeData.groupStatus': 'closed', 'modeData.closedAt': new Date().toISOString() });
        return { status: 'closed' };
    }
    if (joined < target && num(md.endTime) > 0 && nowMs >= num(md.endTime)) return closeCampaign(pid, 'failed', 'muda umeisha kabla ya kufikia watu ' + target);
    return { status: statusOf(md, nowMs), unchanged: true };
}

exports.groupBuySettleNow = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const pid = cleanPid((req.data || {}).productId);
    const s = await db().doc('products/' + pid).get();
    if (!s.exists) throw new HttpsError('not-found', 'bidhaa_haipo');
    if (!isAdmin(req) && String((s.data() || {}).userId || '') !== req.auth.uid) throw new HttpsError('permission-denied', 'mmiliki_au_admin');
    return Object.assign({ ok: true }, await processCampaign(pid));
});

exports.groupBuySweep = onSchedule({ schedule: 'every 15 minutes', region: REGION }, async () => {
    const q = await db().collection('products').where('saleMode', '==', 'group_buy').limit(300).get();
    for (const d of q.docs) { try { await processCampaign(d.id); } catch (e) { console.warn('[groupBuySweep]', d.id, e && e.message); } }
});

exports.adminGroupBuyList = onCall({ region: REGION }, async (req) => {
    if (!req.auth || !isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    const nowMs = Date.now(), pol = await loadPolicy();
    const q = await db().collection('products').where('saleMode', '==', 'group_buy').limit(300).get();
    const rows = q.docs.map(d => { const p = d.data() || {}, md = p.modeData || {}; return { id: d.id, title: String(p.title || '').slice(0, 120), sellerId: p.userId || null, price: num(p.price),
        joined: parseInt(md.joinedUsers, 10) || 1, target: parseInt(md.targetPeople, 10) || 10, endTime: num(md.endTime) || null, paymentDeadline: num(md.paymentDeadline) || null,
        status: statusOf(md, nowMs), ordersCreated: md.ordersCreated === true }; });
    const counts = {}; rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return { ok: true, policy: pol, counts, campaigns: rows.sort((a, b) => (b.endTime || 0) - (a.endTime || 0)).slice(0, 150) };
});

exports.adminSetGroupBuyPolicy = onCall({ region: REGION }, async (req) => {
    if (!req.auth || !isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    const d = req.data || {};
    const reason = requireReason(d.reason, 10);
    const upd = {};
    if (d.paymentMode != null) {
        if (['pay_after_target', 'escrow_commit'].indexOf(String(d.paymentMode)) === -1) throw new HttpsError('invalid-argument', 'paymentMode');
        upd.paymentMode = String(d.paymentMode);
    }
    if (d.realMoneyApproved != null) {
        if (!isSuperAdmin(req)) throw new HttpsError('permission-denied', 'Mmiliki (super admin) pekee anaidhinisha pesa halisi.');
        upd.realMoneyApproved = d.realMoneyApproved === true;
    }
    [['paymentWindowHours', 1, 168], ['maxCampaignDays', 1, 60], ['maxParticipants', 2, 100]].forEach(([k, lo, hi]) => {
        if (d[k] != null) { const v = Math.round(Number(d[k])); if (!(v >= lo && v <= hi)) throw new HttpsError('invalid-argument', k + ' ' + lo + '-' + hi); upd[k] = v; }
    });
    if (d.allowLeaveBeforeTarget != null) upd.allowLeaveBeforeTarget = d.allowLeaveBeforeTarget === true;
    if (!Object.keys(upd).length) throw new HttpsError('invalid-argument', 'hakuna_badiliko');
    const before = await loadPolicy();
    await db().doc('system/config').set({ groupBuy: upd }, { merge: true });
    const after = await loadPolicy();
    await writeAudit(req, 'group_buy_policy', { type: 'system', id: 'groupBuy' }, { reason, before, after });
    return { ok: true, policy: after };
});

exports._groupBuy = { loadPolicy, processCampaign, statusOf, DEFAULT_POLICY };

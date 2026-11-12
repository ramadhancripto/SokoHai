/**
 * SokoHai — Bei Kushuka: foleni ya wanunuzi (refs 1 & 2)  [R13-D 2026-11]
 *
 * While a price-drop campaign runs, a buyer may "Weka bei yako": the price they will pay
 * (between the final/minimum price and the current dropping price). Buyers are ranked by price
 * (highest first), then by time (earliest first). When the campaign ends the server offers the
 * item to the top-ranked buyers, as far as the stock goes, at THEIR price, with a payment
 * deadline (OFFER_MS). If a buyer does not pay in time the next buyer in the queue gets the
 * opportunity ("Ikiwa utashindwa, nafasi ya pili itapewa fursa").
 *
 * Money: no money moves here. The opportunity is written to products/{id}.modeData.opportunities
 * and checkout (functions/index.js -> pricing-core.priceDropOffer) charges exactly that price
 * through the existing order + SokoPay escrow flow. Buying immediately at the current price
 * ("Agiza sasa") keeps working during the campaign.
 *
 * Storage (server-written only; rules deny client writes):
 *   price_drop_entries/{pid}__{uid}  one row per buyer   {price, qty, atMs, status, ...}
 *   price_drop_board/{pid}           public, masked: top 10, count, closed, offers
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { modeUnitPrice } = require('./pricing-core');
const REGION = 'europe-west1';
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;
const OFFER_MS = 3 * 60 * 60 * 1000;          // "Bado masaa 3:00" (ref 2)
const UNPAID = ['pending', 'pending_payment', 'awaiting_payment', 'price_review', 'cancelled', 'cancelled_not_fulfilled', 'failed', 'expired'];

const sid = (v) => { const s = String(v || ''); if (!s || s.length > 128 || s.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'bidhaa_haipo'); return s; };
const modeOf = (p) => String((p && p.saleMode) || ((p && p.modeData) || {}).mode || '');
/* "Amani Mussa" -> "A*** M***" (ref 1 ranking shows masked names) */
function mask(name) {
    const parts = String(name || 'Mteja').replace(/[<>]/g, '').trim().split(/\s+/).slice(0, 2);
    return parts.map(w => w.charAt(0).toUpperCase() + '***').join(' ') || 'M***';
}
function campaignState(p, nowMs) {
    const md = (p && p.modeData) || {};
    if (Number(md.startTime) > 0 && nowMs < Number(md.startTime)) return 'not_started';
    if (md.stopped || (Number(md.endTime) > 0 && nowMs >= Number(md.endTime))) return 'ended';
    return 'live';
}
async function notify(userId, title, body, extra) {
    if (!userId) return;
    try { await db().collection('notifications').add(Object.assign({ userId: String(userId), title: String(title).slice(0, 140), body: String(body).slice(0, 500), createdAt: new Date().toISOString(), read: false, source: 'server' }, extra || {})); } catch (e) {}
}
async function ranked(pid) {
    const q = await db().collection('price_drop_entries').where('productId', '==', pid).limit(1000).get();
    return q.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.price - a.price) || (a.atMs - b.atMs));
}
async function writeBoard(pid, extra) {
    const all = await ranked(pid);
    const live = all.filter(e => e.status !== 'withdrawn');
    await db().doc('price_drop_board/' + pid).set(Object.assign({ productId: pid, count: live.length,
        top: live.slice(0, 10).map((e, i) => ({ rank: i + 1, name: e.masked, price: e.price, qty: e.qty, status: e.status || 'queued' })),
        updatedAt: new Date().toISOString() }, extra || {}), { merge: true });
    return live;
}

/* ---------------- Weka bei yako ---------------- */
exports.priceDropSubmit = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const uid = req.auth.uid, d = req.data || {}, pid = sid(d.productId);
    const pref = db().doc('products/' + pid);
    const eref = db().doc('price_drop_entries/' + pid + '__' + uid);
    const price = Math.round(Number(d.price));
    let out = null;
    await db().runTransaction(async (t) => {
        const ps = await t.get(pref);
        if (!ps.exists) throw new HttpsError('not-found', 'bidhaa_haipo');
        const p = ps.data() || {}, md = p.modeData || {}, nowMs = Date.now();
        if (modeOf(p) !== 'price_drop') throw new HttpsError('failed-precondition', 'si_bei_kushuka');
        if (p.userId === uid) throw new HttpsError('failed-precondition', 'tangazo_lako');
        const st = campaignState(p, nowMs);
        if (st !== 'live') throw new HttpsError('failed-precondition', st === 'ended' ? 'kampeni_imeisha' : 'kampeni_haijaanza');
        const current = modeUnitPrice(p, 1, '', nowMs);
        const min = Math.max(1, Math.round(Number(md.minPrice) || 1));
        if (!(price >= min)) throw new HttpsError('failed-precondition', 'chini_ya_bei_ya_mwisho:' + min);
        if (!(price <= current)) throw new HttpsError('failed-precondition', 'juu_ya_bei_ya_sasa:' + current);
        const maxQty = Math.max(1, parseInt(md.maxPerBuyer, 10) || 1);
        const qty = Math.min(maxQty, Math.max(1, parseInt(d.qty, 10) || 1));
        if (qty > (Number(p.stock) || 0)) throw new HttpsError('failed-precondition', 'stock_haitoshi');
        const ex = await t.get(eref);
        const prev = ex.exists ? (ex.data() || {}) : null;
        if (prev && prev.price === price && prev.qty === qty) { out = { ok: true, duplicate: true }; return; }
        const nameSrc = d.name || (req.auth.token && req.auth.token.name) || 'Mteja';
        t.set(eref, { productId: pid, uid, masked: mask(nameSrc), price, qty, atMs: nowMs, status: 'queued',
            createdAt: prev ? prev.createdAt : new Date(nowMs).toISOString(), updatedAt: new Date(nowMs).toISOString(), changes: (prev ? (prev.changes || 0) : 0) + 1 });
        if (!prev) t.update(pref, { 'modeData.queueEntries': FV().increment(1) });
        out = { ok: true, price, qty };
    });
    const live = await writeBoard(pid);
    const rank = live.findIndex(e => e.uid === uid) + 1;
    return Object.assign(out || {}, { rank, count: live.length });
});

/* my place in the queue (the board is public and masked; only the server knows who is who) */
exports.priceDropMyRank = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const pid = sid((req.data || {}).productId), uid = req.auth.uid;
    const live = (await ranked(pid)).filter(e => e.status !== 'withdrawn');
    const i = live.findIndex(e => e.uid === uid);
    const p = ((await db().doc('products/' + pid).get()).data() || {});
    const opp = ((p.modeData || {}).opportunities || {})[uid] || null;
    return { ok: true, rank: i + 1, count: live.length, entry: i >= 0 ? { price: live[i].price, qty: live[i].qty, status: live[i].status || 'queued' } : null,
        offer: opp ? { price: opp.price, qty: opp.qty, deadline: opp.deadline } : null };
});

/* ---------------- end of campaign -> opportunities, then expiry -> next buyer ---------------- */
async function paid(pid, uid) {
    const q = await db().collection('orders').where('buyerId', '==', String(uid)).limit(50).get();
    return q.docs.some(d => { const o = d.data() || {}; const items = Array.isArray(o.items) ? o.items : [];
        const hit = String(o.productId || '') === pid || items.some(i => String((i && (i.productId || i.itemId || i.id)) || '') === pid);
        return hit && UNPAID.indexOf(String(o.status || 'pending')) === -1; });
}
async function settle(pid, nowMs) {
    const pref = db().doc('products/' + pid);
    const ps = await pref.get(); if (!ps.exists) return { changed: false };
    const p = ps.data() || {}, md = p.modeData || {};
    if (modeOf(p) !== 'price_drop' || campaignState(p, nowMs) !== 'ended') return { changed: false };
    const all = await ranked(pid);
    const opps = Object.assign({}, md.opportunities || {});
    const notes = [];
    // 1. expired / paid offers
    for (const uid of Object.keys(opps)) {
        const o = opps[uid];
        if (await paid(pid, uid)) { delete opps[uid]; await db().doc('price_drop_entries/' + pid + '__' + uid).set({ status: 'bought' }, { merge: true }); continue; }
        if (Number(o.deadline) > 0 && nowMs > Number(o.deadline)) {
            delete opps[uid];
            await db().doc('price_drop_entries/' + pid + '__' + uid).set({ status: 'expired' }, { merge: true });
            notes.push([uid, 'Muda wa fursa umeisha', 'Hukukamilisha ununuzi wa ' + (p.title || 'bidhaa') + ' ndani ya muda. Nafasi imepewa mnunuzi anayefuata.', 'price_drop_offer_expired']);
        }
    }
    // 2. fill free stock from the queue, in rank order
    const held = Object.values(opps).reduce((n, o) => n + (Number(o.qty) || 1), 0);
    let free = Math.max(0, (Number(p.stock) || 0) - held);
    for (const e of all) {
        if (free <= 0) break;
        if ((e.status || 'queued') !== 'queued' || opps[e.uid]) continue;
        const qty = Math.min(e.qty || 1, free);
        opps[e.uid] = { price: e.price, qty, deadline: nowMs + OFFER_MS, rank: all.indexOf(e) + 1, offeredAt: nowMs };
        free -= qty;
        await db().doc('price_drop_entries/' + e.id).set({ status: 'offered', offeredAt: nowMs, deadline: nowMs + OFFER_MS }, { merge: true });
        notes.push([e.uid, 'Pongezi! Una nafasi ya kununua', 'Kampeni ya ' + (p.title || 'bidhaa') + ' imeisha. Unaweza kununua kwa bei yako ya TSh ' + Number(e.price).toLocaleString() + ' ndani ya saa 3.', 'price_drop_offer']);
    }
    const first = !md.queueClosed;
    await pref.update({ 'modeData.opportunities': opps, 'modeData.queueClosed': true, 'modeData.queueSettledAt': new Date(nowMs).toISOString() });
    if (first) {
        for (const e of all) if (!opps[e.uid] && (e.status || 'queued') === 'queued') {
            notes.push([e.uid, 'Kampeni imeisha', 'Uko nafasi ya ' + (all.indexOf(e) + 1) + ' kwa ' + (p.title || 'bidhaa') + '. Nafasi ikifika kwako tutakujulisha.', 'price_drop_ended']);
        }
        notes.push([p.userId, 'Kampeni ya Bei Kushuka imeisha', all.length + ' wanunuzi walishiriki. Fursa ' + Object.keys(opps).length + ' zimetolewa.', 'price_drop_campaign_end']);
    }
    for (const n of notes) await notify(n[0], n[1], n[2], { type: n[3], productId: pid, commerceMode: 'PRICE_DROP' });
    await writeBoard(pid, { closed: true, offers: Object.values(opps).map(o => ({ rank: o.rank, price: o.price, deadline: o.deadline })) });
    return { changed: true, offers: Object.keys(opps).length };
}
exports.priceDropSettle = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    return Object.assign({ ok: true }, await settle(sid((req.data || {}).productId), Date.now()));
});
async function sweepQueues(nowMs) {
    const q = await db().collection('products').where('saleMode', '==', 'price_drop').limit(500).get();
    let n = 0;
    for (const d of q.docs) { const md = (d.data() || {}).modeData || {}; if ((Number(md.queueEntries) || 0) > 0 && campaignState(d.data(), nowMs) === 'ended') { if ((await settle(d.id, nowMs)).changed) n++; } }
    return { settled: n };
}
exports._testing = { mask, settle, sweepQueues, campaignState, OFFER_MS };

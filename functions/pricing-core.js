/**
 * [REPAIR 2026-10 H2] Pure server pricing helpers (no Firestore access) so
 * they can be unit-tested without the emulator. Mirrors the browser formulas
 * in js/app/07-product.js (commerce modes) and js/app/01-market.js (boost).
 */
'use strict';
const wholesaleCore = require('./shared/wholesale-price-core');

function modeUnitPrice(p, qty, buyerUid, nowMs) {
    const base = Number(p.price || 0);
    const md = p.modeData || {};
    const mode = String(md.mode || p.commerceMode || p.saleMode || '');
    let unit = base;
    const opp = priceDropOffer(p, buyerUid, nowMs);
    if (mode === 'price_drop' && opp) {
        unit = opp.price;   // [R13-D] buyer's own price from the queue (ref 1/2 "fursa ya kununua")
    } else if (mode === 'price_drop') {
        const start = Number(md.startTime) || nowMs;
        const min = Number(md.minPrice) || 0;
        const interval = Number(md.intervalMs) || 60000;
        const drop = Number(md.dropAmount) || 0;
        const steps = Math.max(0, Math.floor((nowMs - start) / interval));
        unit = Math.max(min, base - steps * drop);
    } else if (mode === 'group_buy' && (!Array.isArray(md.participants) || md.participants.indexOf(String(buyerUid)) !== -1)) {
        // [REPAIR 2026-10 Phase 5] the group price is for members (groupBuyJoin);
        // a non-member pays the base price. Legacy docs without a list keep the old rule.
        const joined = parseInt(md.joinedUsers, 10) || 1;
        const discVal = Number(md.discountValue) || 0;
        const extra = Math.max(0, joined - 1);
        unit = md.discountType === 'percent' ? base - (base * Math.min(90, discVal * extra) / 100) : Math.max(base * 0.1, base - discVal * extra);
    } else if (mode === 'auction') {
        const ended = !!md.ended || (Number(md.endTime) > 0 && nowMs >= Number(md.endTime));
        // [R13-B] after a second chance the winner and their own bid come from winnerId/winnerBid
        const winner = md.winnerId !== undefined ? md.winnerId : md.maxBidder;
        const winBid = Number(md.winnerBid) > 0 ? Number(md.winnerBid) : Number(md.currentBid);
        if (ended && winner && String(winner) === String(buyerUid) && winBid > 0) unit = winBid;
    }
    // [2026-11-06] Wholesale tiers + wholesalePrice/wholesaleMinQty: one shared
    // formula with the browser (product page, Smart Cart). Same rules as before.
    unit = wholesaleCore.applyWholesale(p, qty, unit);
    return Math.max(0, Math.round(unit));
}
/* [REPAIR 2026-10 Phase 5] Who may BUY a mode product at all.
 * Returns '' when allowed, otherwise a reason code (order goes to price_review).
 *  - auction: only after it ended, and only the winning bidder (maxBidder). */
function modeEligibility(p, buyerUid, nowMs) {
    const md = (p && p.modeData) || {};
    const mode = String(md.mode || p.commerceMode || p.saleMode || '');
    if (mode === 'auction') {
        const endsAt = Number(md.endTime) || 0;
        const ended = !!md.ended || (endsAt > 0 && nowMs >= endsAt);
        if (!ended) return 'auction_live';
        const winner = md.winnerId !== undefined ? md.winnerId : md.maxBidder;
        if (!winner) return 'auction_no_winner';
        if (String(winner) !== String(buyerUid)) return 'not_auction_winner';
        if (Number(md.paymentDeadline) > 0 && nowMs > Number(md.paymentDeadline)) return 'auction_payment_expired';
    }
    // [R13-B] Bei Kushuka: only inside its window. Before it starts or after it ends the drop price
    // can not reach checkout (the order goes to price review instead of using a stale price).
    if (mode === 'price_drop') {
        if (priceDropOffer(p, buyerUid, nowMs)) return '';   // [R13-D] holder of a live purchase opportunity
        const mine = md.opportunities && buyerUid ? md.opportunities[String(buyerUid)] : null;
        if (mine && Number(mine.deadline) > 0 && nowMs > Number(mine.deadline)) return 'price_drop_offer_expired';
        if (Number(md.startTime) > 0 && nowMs < Number(md.startTime)) return 'price_drop_not_started';
        if (Number(md.endTime) > 0 && nowMs >= Number(md.endTime)) return 'price_drop_ended';
        if (md.stopped) return 'price_drop_ended';
    }
    return '';
}
/* [R13-B] Per-order quantity limit of a Bei Kushuka offer (modeData.maxPerBuyer). Stock itself
 * is enforced by the inventory reservation, so an offer can never sell more than exists. */
function modeQuantityLimit(p, qty, buyerUid, nowMs) {
    const md = (p && p.modeData) || {};
    const mode = String(md.mode || p.commerceMode || p.saleMode || '');
    const opp = priceDropOffer(p, buyerUid, nowMs || Date.now());
    if (mode === 'price_drop' && opp) return Number(qty) > Number(opp.qty || 1) ? 'over_offer_qty' : '';
    if (mode === 'price_drop' && Number(md.maxPerBuyer) > 0 && Number(qty) > Number(md.maxPerBuyer)) return 'over_buyer_limit';
    return '';
}
/* [R13-D] Bei Kushuka buyer queue: after the campaign the server offers the item to the
 * top-ranked buyers at THEIR submitted price (modeData.opportunities[uid] = {price, qty, deadline}).
 * Written only by functions/price-drop-queue.js (rules forbid client writes). */
function priceDropOffer(p, buyerUid, nowMs) {
    const md = (p && p.modeData) || {};
    if (!buyerUid || !md.opportunities) return null;
    const o = md.opportunities[String(buyerUid)];
    if (!o || !(Number(o.price) > 0)) return null;
    if (Number(o.deadline) > 0 && nowMs > Number(o.deadline)) return null;
    return { price: Math.round(Number(o.price)), qty: Math.max(1, parseInt(o.qty, 10) || 1), deadline: Number(o.deadline) || 0 };
}
function variantPrice(p, variant) {
    if (!variant || !Array.isArray(p.variants)) return null;
    const vid = typeof variant === 'object' ? String(variant.variantId || variant.id || '') : String(variant);
    const v = p.variants.find(x => x && (String(x.variantId || x.id || '') === vid));
    return v && Number(v.price) > 0 ? Number(v.price) : null;
}

const SUBSCRIPTION_PRICES = { 'BASIC SELLER': 10000, 'UNLIMITED PRO': 35000, 'MONTHLY PACKAGE': 4000, 'YEARLY SAVER': 43000 };
function boostPrice(collectionName, views, days) {
    const v = Math.max(100, Number(views) || 1000), dd = Math.max(1, Number(days) || 3);
    if (collectionName === 'products') return Math.max(2000, Math.round(2000 * Math.pow(((v / 1000) + (dd / 3) + 1) / 3, 1.6)));
    return Math.max(1000, Math.round(1000 * Math.pow(((v / 1000) + (dd / 7)) / 2, 1.4)));
}

module.exports = { priceDropOffer, modeUnitPrice, modeEligibility, modeQuantityLimit, variantPrice, boostPrice, SUBSCRIPTION_PRICES };

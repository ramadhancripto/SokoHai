/**
 * [REPAIR 2026-10 H2] Pure server pricing helpers (no Firestore access) so
 * they can be unit-tested without the emulator. Mirrors the browser formulas
 * in js/app/07-product.js (commerce modes) and js/app/01-market.js (boost).
 */
'use strict';

function modeUnitPrice(p, qty, buyerUid, nowMs) {
    const base = Number(p.price || 0);
    const md = p.modeData || {};
    const mode = String(md.mode || p.commerceMode || p.saleMode || '');
    let unit = base;
    if (mode === 'price_drop') {
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
    } else if (mode === 'wholesale') {
        const tiers = (Array.isArray(md.tiers) ? md.tiers : [])
            .map(t => ({ minQty: parseInt(t.minQty, 10) || 0, price: Number(t.price) || 0 }))
            .filter(t => t.minQty > 0 && t.price > 0 && qty >= t.minQty);
        if (tiers.length) unit = Math.min.apply(null, tiers.map(t => t.price));
        else if ((parseInt(md.minQty, 10) || 0) > 0 && qty >= parseInt(md.minQty, 10) && Number(md.discountValue) > 0) {
            unit = md.discountType === 'percent' ? base - base * Number(md.discountValue) / 100 : Math.max(0, base - Number(md.discountValue));
        }
    } else if (mode === 'auction') {
        const ended = Number(md.endTime) > 0 && nowMs >= Number(md.endTime);
        if (ended && md.maxBidder && String(md.maxBidder) === String(buyerUid) && Number(md.currentBid) > 0) unit = Number(md.currentBid);
    }
    if (Number(p.wholesalePrice) > 0 && qty >= (parseInt(p.wholesaleMinQty, 10) || Infinity)) unit = Math.min(unit, Number(p.wholesalePrice));
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
        if (!md.maxBidder) return 'auction_no_winner';
        if (String(md.maxBidder) !== String(buyerUid)) return 'not_auction_winner';
    }
    return '';
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

module.exports = { modeUnitPrice, modeEligibility, variantPrice, boostPrice, SUBSCRIPTION_PRICES };

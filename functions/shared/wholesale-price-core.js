/* [2026-11-06] Wholesale / quantity-tier price core — ONE formula for the browser
 * (product page, Smart Cart) and Cloud Functions (pricing-core.js server price
 * check; copied to functions/shared by build-shared.js). Pure, dependency-free.
 *
 * Seller configuration (all optional, existing fields only):
 *  - saleMode/commerceMode/modeData.mode === 'wholesale':
 *      modeData.tiers  [{ minQty, price }]  price per base unit from minQty up
 *      modeData.minQty + discountValue/discountType  (legacy single rule)
 *  - wholesalePrice + wholesaleMinQty (any mode): price per unit from wholesaleMinQty.
 *    wholesalePrice WITHOUT wholesaleMinQty is a POS (counter) price only and never
 *    applies online — exactly the server rule before this module existed.
 * The cheapest applicable price wins; below every threshold the retail price applies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHWholesalePriceCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function int(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function modeOf(p) { var md = (p && p.modeData) || {}; return String(md.mode || p.commerceMode || p.saleMode || ''); }

  /** Normalised online tiers (sorted by minQty, de-duplicated, cheapest per minQty). */
  function tiersOf(p) {
    p = p || {};
    var md = p.modeData || {};
    var base = num(p.price);
    var out = [];
    if (modeOf(p) === 'wholesale') {
      (Array.isArray(md.tiers) ? md.tiers : []).forEach(function (t) {
        var q = int(t && t.minQty), pr = num(t && t.price);
        if (q > 0 && pr > 0) out.push({ minQty: q, price: pr, source: 'tier' });
      });
      if (!out.length && int(md.minQty) > 0 && num(md.discountValue) > 0) {
        var dv = num(md.discountValue);
        var pr2 = md.discountType === 'percent' ? base - base * dv / 100 : Math.max(0, base - dv);
        out.push({ minQty: int(md.minQty), price: pr2, source: 'discount' });
      }
    }
    if (num(p.wholesalePrice) > 0 && int(p.wholesaleMinQty) > 0) {
      out.push({ minQty: int(p.wholesaleMinQty), price: num(p.wholesalePrice), source: 'wholesalePrice' });
    }
    out.sort(function (a, b) { return a.minQty - b.minQty || a.price - b.price; });
    var seen = {};
    return out.filter(function (t) { if (seen[t.minQty]) return false; seen[t.minQty] = true; return true; });
  }

  /** Wholesale-adjusted unit price for qty, starting from `unit` (retail / variant / mode price). */
  function applyWholesale(p, qty, unit) {
    var q = Math.max(1, int(qty) || 1);
    var u = num(unit);
    var md = (p && p.modeData) || {};
    var base = num(p && p.price);
    if (modeOf(p) === 'wholesale') {
      var hits = (Array.isArray(md.tiers) ? md.tiers : [])
        .map(function (t) { return { minQty: int(t && t.minQty), price: num(t && t.price) }; })
        .filter(function (t) { return t.minQty > 0 && t.price > 0 && q >= t.minQty; });
      if (hits.length) u = Math.min.apply(null, hits.map(function (t) { return t.price; }));
      else if (int(md.minQty) > 0 && q >= int(md.minQty) && num(md.discountValue) > 0) {
        u = md.discountType === 'percent' ? base - base * num(md.discountValue) / 100 : Math.max(0, base - num(md.discountValue));
      }
    }
    if (num(p && p.wholesalePrice) > 0 && q >= (int(p && p.wholesaleMinQty) || Infinity)) u = Math.min(u, num(p.wholesalePrice));
    return u;
  }

  /** Unit price the buyer pays for qty (retail or variant price as the starting point). */
  function unitPriceForQty(p, qty, startUnit) {
    var start = startUnit != null && num(startUnit) > 0 ? num(startUnit) : num(p && p.price);
    return Math.max(0, Math.round(applyWholesale(p || {}, qty, start)));
  }

  /** Rows for the buyer: retail row then every tier, with the qty range each covers. */
  function priceTable(p, startUnit) {
    var tiers = tiersOf(p);
    if (!tiers.length) return [];
    var retail = startUnit != null && num(startUnit) > 0 ? num(startUnit) : num(p && p.price);
    var rows = [];
    if (tiers[0].minQty > 1) rows.push({ from: 1, to: tiers[0].minQty - 1, price: Math.round(retail), retail: true });
    tiers.forEach(function (t, i) {
      var next = tiers[i + 1];
      rows.push({ from: t.minQty, to: next ? next.minQty - 1 : null, price: Math.round(Math.min(retail || Infinity, t.price)), retail: false });
    });
    return rows;
  }

  /** Seller-side check of a tier list: thresholds increase, prices do not rise, below retail. */
  function validateTiers(retail, tiers) {
    var issues = [];
    var r = num(retail);
    var prev = null;
    (tiers || []).forEach(function (t, i) {
      var q = int(t.minQty), pr = num(t.price);
      if (q < 2) issues.push({ index: i, code: 'MIN_QTY_BELOW_2' });
      if (!(pr > 0)) issues.push({ index: i, code: 'PRICE_REQUIRED' });
      if (r > 0 && pr >= r) issues.push({ index: i, code: 'NOT_BELOW_RETAIL' });
      if (prev && q <= prev.q) issues.push({ index: i, code: 'MIN_QTY_NOT_INCREASING' });
      if (prev && pr > prev.pr) issues.push({ index: i, code: 'PRICE_RISES' });
      prev = { q: q, pr: pr };
    });
    return issues;
  }

  return { tiersOf: tiersOf, applyWholesale: applyWholesale, unitPriceForQty: unitPriceForQty, priceTable: priceTable, validateTiers: validateTiers };
});

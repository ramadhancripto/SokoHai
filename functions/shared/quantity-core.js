/* [POS 2026-11-01] Quantity core: measured units (kg, g, L, mL, m, cm) and DECIMAL
 * quantities without rounding errors. Pure, dependency-free; used by the browser,
 * Cloud Functions (copied to functions/shared by build-shared.js) and tests.
 *
 * Rules
 *  - A product sells/stocks in decimals ONLY when it says so: product.quantityPrecision
 *    (integer 1..3). Missing/0 = whole units, exactly as before (legacy products unchanged).
 *  - Every sum/difference is done on SCALED INTEGERS (value x 10^precision) and converted
 *    back once, so 0.1 + 0.2 is 0.3 and stock never drifts or goes below zero.
 *  - A quantity with more decimals than the product allows is REJECTED, never rounded.
 *  - Unit conversion only inside one dimension (mass, volume, length) with exact factors.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHQuantityCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_PRECISION = 3;
  var EPS = 1e-9;
  // factor = how many BASE units of the dimension one unit holds (exact integers).
  var MEASURED_UNITS = Object.freeze({
    kg: Object.freeze({ dimension: 'mass', base: 'g', factor: 1000, precision: 3 }),
    g: Object.freeze({ dimension: 'mass', base: 'g', factor: 1, precision: 0 }),
    L: Object.freeze({ dimension: 'volume', base: 'mL', factor: 1000, precision: 3 }),
    mL: Object.freeze({ dimension: 'volume', base: 'mL', factor: 1, precision: 0 }),
    m: Object.freeze({ dimension: 'length', base: 'mm', factor: 1000, precision: 3 }),
    cm: Object.freeze({ dimension: 'length', base: 'mm', factor: 10, precision: 1 })
  });
  // Legacy labels used by the seller form / POS (see shared/product-listing-core.mjs UNIT_LEGACY_MAP).
  var UNIT_ALIASES = Object.freeze({ kg: 'kg', kilogram: 'kg', kilo: 'kg', g: 'g', gram: 'g', gramu: 'g', l: 'L', litre: 'L', liter: 'L', lita: 'L',
    ml: 'mL', millilitre: 'mL', milliliter: 'mL', m: 'm', meter: 'm', metre: 'm', mita: 'm', cm: 'cm', centimeter: 'cm', centimetre: 'cm' });

  function unitIdOf(value) {
    var v = String(value == null ? '' : value).trim();
    if (MEASURED_UNITS[v]) return v;
    return UNIT_ALIASES[v.toLowerCase()] || null;
  }
  function isMeasured(unit) { return !!unitIdOf(unit); }
  /** Default decimal places for a unit (kg/L/m: 3, cm: 1, others 0). */
  function precisionForUnit(unit) { var id = unitIdOf(unit); return id ? MEASURED_UNITS[id].precision : 0; }
  /** Precision a product is ALLOWED to use: explicit opt-in only. */
  function precisionOf(product) {
    var p = product && product.quantityPrecision;
    return Number.isSafeInteger(p) && p >= 0 && p <= MAX_PRECISION ? p : 0;
  }
  function scaleOf(p) { return Math.pow(10, p); }

  /** Exact scaled integer for q at precision p, or null if q is not finite or has too many decimals. */
  function toScaled(q, p) {
    var n = Number(q);
    if (typeof q === 'string' && q.trim() === '') return null;
    if (!Number.isFinite(n)) return null;
    var s = scaleOf(p || 0);
    var r = Math.round(n * s);
    if (Math.abs(r - n * s) > EPS * Math.max(1, Math.abs(n * s))) return null; // more decimals than allowed
    if (!Number.isSafeInteger(r)) return null;
    return r;
  }
  function fromScaled(n, p) { return p ? Number((n / scaleOf(p)).toFixed(p)) : n; }
  /** q is a valid quantity at precision p (>0, or >=0 with allowZero). */
  function isValidQuantity(q, p, opts) {
    var r = toScaled(q, p || 0);
    if (r === null) return false;
    return opts && opts.allowZero ? r >= 0 : r > 0;
  }
  function add(a, b, p) { var x = toScaled(a, p), y = toScaled(b, p); if (x === null || y === null) return NaN; return fromScaled(x + y, p); }
  function sub(a, b, p) { var x = toScaled(a, p), y = toScaled(b, p); if (x === null || y === null) return NaN; return fromScaled(x - y, p); }
  /** q x integer factor (pack conversion), exact. */
  function mulInt(q, factor, p) { var x = toScaled(q, p); if (x === null || !Number.isSafeInteger(factor)) return NaN; var r = x * factor; return Number.isSafeInteger(r) ? fromScaled(r, p) : NaN; }
  function compare(a, b, p) { var x = toScaled(a, p), y = toScaled(b, p); if (x === null || y === null) return NaN; return x === y ? 0 : (x < y ? -1 : 1); }
  /** Money for a decimal quantity: price x quantity, rounded to cents once. */
  function lineTotal(unitPrice, q) { return Math.round(Number(unitPrice) * Number(q) * 100) / 100; }
  /** Sum of quantities for reports without float drift. */
  function sumQuantities(list, p) {
    var prec = p == null ? MAX_PRECISION : p;
    var t = 0;
    for (var i = 0; i < list.length; i++) { var x = toScaled(Number(list[i]) || 0, prec); if (x === null) x = Math.round((Number(list[i]) || 0) * scaleOf(prec)); t += x; }
    return fromScaled(t, prec);
  }
  /** Convert q between two measured units of the SAME dimension (exact, validated). */
  function convert(q, fromUnit, toUnit, p) {
    var a = MEASURED_UNITS[unitIdOf(fromUnit)], b = MEASURED_UNITS[unitIdOf(toUnit)];
    if (!a || !b) return { ok: false, error: 'UNIT_NOT_MEASURED' };
    if (a.dimension !== b.dimension) return { ok: false, error: 'UNIT_DIMENSION_MISMATCH' };
    var prec = p == null ? MAX_PRECISION : p;
    var x = toScaled(q, prec);
    if (x === null) return { ok: false, error: 'QUANTITY_INVALID' };
    var baseScaled = x * a.factor; // in base units x 10^prec
    if (baseScaled % b.factor !== 0) {
      var exact = baseScaled / b.factor;
      var r = toScaled(fromScaled(exact, prec), prec);
      if (r === null || Math.abs(exact - Math.round(exact)) > EPS) return { ok: false, error: 'CONVERSION_NOT_EXACT' };
    }
    return { ok: true, value: fromScaled(baseScaled / b.factor, prec), unitId: unitIdOf(toUnit) };
  }

  return { MAX_PRECISION: MAX_PRECISION, MEASURED_UNITS: MEASURED_UNITS, unitIdOf: unitIdOf, isMeasured: isMeasured,
    precisionForUnit: precisionForUnit, precisionOf: precisionOf, toScaled: toScaled, fromScaled: fromScaled,
    isValidQuantity: isValidQuantity, add: add, sub: sub, mulInt: mulInt, compare: compare, lineTotal: lineTotal,
    sumQuantities: sumQuantities, convert: convert };
});

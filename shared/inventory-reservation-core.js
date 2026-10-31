'use strict';
/**
 * [PHASE 3 — 2026-10-31] Online reservation + stock authority core (pure).
 *
 * One stock authority: the product document that already carries stock today
 * (products/{id}.stock for simple products, variantCombinations[i].stock for
 * canonical variants). This module adds a RESERVED counter on the same
 * record (products.reservedStock / variantCombinations[i].reserved) so POS,
 * manual adjustments and online orders all read and write ONE record inside
 * ONE Firestore transaction. available = stock - reserved, never < 0.
 *
 * Nothing here touches Firestore; functions/inventory-reservation.js applies
 * the plans inside transactions. Missing fields mean 0 (legacy products work
 * unchanged), and the whole feature is OFF unless system_config/inventory says
 * otherwise (see resolveConfig).
 */

const identity = require('./pos-product-identity-core');
const qty = require('./quantity-core');

/* ---------------- configuration ---------------- */
// TTL 15 minutes is a TRIAL value. It is not validated against PesaPal /
// mobile-money callback timing; ttlValidated stays false until staging proves it.
const CONFIG_DEFAULTS = Object.freeze({
  mode: 'off',              // 'off' | 'pilot' | 'all'
  pilotSellerIds: [],
  ttlMinutes: 15,
  reviewWindowMinutes: 120,
  ttlValidated: false
});
const CONFIG_BOUNDS = Object.freeze({ ttlMinutes: [5, 60], reviewWindowMinutes: [30, 1440] });
const MAX_LINES = 20;

function clampInt(value, [min, max], fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function resolveConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const mode = ['off', 'pilot', 'all'].includes(src.mode) ? src.mode : CONFIG_DEFAULTS.mode;
  const pilot = Array.isArray(src.pilotSellerIds)
    ? [...new Set(src.pilotSellerIds.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 500)
    : [];
  return Object.freeze({
    mode,
    pilotSellerIds: Object.freeze(pilot),
    ttlMinutes: clampInt(src.ttlMinutes, CONFIG_BOUNDS.ttlMinutes, CONFIG_DEFAULTS.ttlMinutes),
    reviewWindowMinutes: clampInt(src.reviewWindowMinutes, CONFIG_BOUNDS.reviewWindowMinutes, CONFIG_DEFAULTS.reviewWindowMinutes),
    ttlValidated: src.ttlValidated === true
  });
}

function reservationEnabledFor(config, sellerId) {
  const c = config && config.mode ? config : resolveConfig(config);
  if (c.mode === 'all') return true;
  if (c.mode === 'pilot') return c.pilotSellerIds.includes(String(sellerId || ''));
  return false;
}

/* ---------------- identity ---------------- */
const seg = value => String(value == null ? '' : value).trim().replace(/[:/\s]+/g, '_');

/**
 * Stock identity: business:location:product:variant:unit.
 * The product:variant:unit tail is the EXISTING inventoryKey
 * (pos-product-identity-core.deterministicInventoryKey) so variant docs that
 * already store inventoryKey stay canonical. Single-location sellers use
 * location "default"; sellers without a business use "seller_<uid>".
 */
function stockKey({ businessId, sellerId, locationId, storeId, productId, variantId, unitId } = {}) {
  const product = seg(productId);
  if (!product) throw new Error('STOCK_KEY_PRODUCT_REQUIRED');
  const biz = seg(businessId) || (seg(sellerId) ? 'seller_' + seg(sellerId) : '');
  if (!biz) throw new Error('STOCK_KEY_BUSINESS_REQUIRED');
  const loc = seg(locationId) || seg(storeId) || 'default';
  const tail = identity.deterministicInventoryKey(product, seg(variantId) || null, seg(unitId) || null);
  return [biz, loc, tail].join(':');
}

function parseStockKey(key) {
  const parts = String(key || '').split(':');
  if (parts.length !== 5 || parts.some(p => !p)) return null;
  const [businessId, locationId, productId, variant, unitId] = parts;
  return { businessId, locationId, productId, variantId: variant === 'product' ? null : variant, unitId };
}

/* ---------------- state machines ---------------- */
const MACHINES = Object.freeze({
  reservation: Object.freeze({
    ACTIVE: ['COMMITTED', 'RELEASED', 'EXPIRED'],
    COMMITTED: [], RELEASED: [], EXPIRED: []
  }),
  review: Object.freeze({
    NONE: ['NEEDS_REVIEW'],
    NEEDS_REVIEW: ['REFUND_PENDING', 'RESOLVED_FULFILLED'],
    REFUND_PENDING: ['REFUNDED', 'RESOLVED_FULFILLED', 'REFUND_FAILED'],
    REFUND_FAILED: ['REFUND_PENDING'],
    REFUNDED: [], RESOLVED_FULFILLED: []
  }),
  refund: Object.freeze({
    PENDING: ['COMPLETED', 'FAILED'],
    FAILED: ['PENDING'],
    COMPLETED: []
  })
});

function canTransition(machine, from, to) {
  const m = MACHINES[machine];
  if (!m) throw new Error('UNKNOWN_MACHINE');
  return Array.isArray(m[from]) && m[from].includes(to);
}
function assertTransition(machine, from, to) {
  if (!canTransition(machine, from, to)) {
    const err = new Error(`INVALID_TRANSITION ${machine}: ${from} -> ${to}`);
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
  return to;
}

/* ---------------- deterministic ids (idempotency keys) ---------------- */
const ids = Object.freeze({
  reservation: (orderId, attempt = 0) => seg(orderId) + (attempt > 0 ? '-R' + attempt : ''),
  movement: (kind, orderId, lineIndex) => `${kind}_${seg(orderId)}_${lineIndex}`,
  refund: orderId => 'online_' + seg(orderId),
  refundLedger: orderId => 'refund_late_' + seg(orderId),
  review: orderId => seg(orderId),
  unmatchedReview: trackingId => 'unmatched_' + seg(trackingId)
});

/* ---------------- stock math on one product record ---------------- */
const int = v => (Number.isSafeInteger(Number(v)) ? Number(v) : NaN);
// [POS 2026-11-01] Decimal-capable read: whole units unless the product opts in
// with quantityPrecision (kg/L/m). Invalid values become NaN (-> STOCK_INVALID).
const qOf = (v, p) => { const n = Number(v); return qty.isValidQuantity(n, p, { allowZero: true }) ? n : NaN; };
const AUTO_AVAILABILITY = new Set(['', 'available', 'low_stock', 'out_of_stock']);

function availabilityFor(available, current) {
  if (current && !AUTO_AVAILABILITY.has(String(current))) return current; // manual: pre_order, hidden, ...
  if (available <= 0) return 'out_of_stock';
  return available <= 3 ? 'low_stock' : 'available';
}

function variantIndexOf(product, variantId) {
  const list = Array.isArray(product && product.variantCombinations) ? product.variantCombinations : [];
  return list.findIndex(v => v && v.variantId === variantId);
}

/** {stock, reserved, available} for a product or one canonical variant. */
function stockOf(product, variantId = null) {
  if (variantId) {
    const i = variantIndexOf(product, variantId);
    if (i < 0) return { ok: false, error: 'VARIANT_NOT_FOUND' };
    const v = product.variantCombinations[i];
    const p = qty.precisionOf(product);
    const stock = qOf(v.stock == null ? 0 : v.stock, p);
    const reserved = qOf(v.reserved == null ? 0 : v.reserved, p);
    if (!(stock >= 0) || !(reserved >= 0)) return { ok: false, error: 'STOCK_INVALID' };
    return { ok: true, stock, reserved, available: Math.max(0, qty.sub(stock, reserved, p)), variantIndex: i, precision: p };
  }
  const p = qty.precisionOf(product);
  const stock = qOf(product && product.stock != null ? product.stock : 0, p);
  const reserved = qOf(product && product.reservedStock != null ? product.reservedStock : 0, p);
  if (!(stock >= 0) || !(reserved >= 0)) return { ok: false, error: 'STOCK_INVALID' };
  return { ok: true, stock, reserved, available: Math.max(0, qty.sub(stock, reserved, p)), variantIndex: -1, precision: p };
}

/**
 * Apply {stock, reserved} deltas to a WORKING COPY of a product and return the
 * new copy. Throws on any result that would break an invariant:
 *   stock >= 0, reserved >= 0, reserved <= stock.
 */
function applyDelta(product, variantId, { stock: dStock = 0, reserved: dReserved = 0 } = {}) {
  const s = stockOf(product, variantId);
  if (!s.ok) { const e = new Error(s.error); e.code = s.error; throw e; }
  // Scaled-integer arithmetic: exact for whole units and for decimal (kg/L/m) products.
  const nextStock = qty.add(s.stock, dStock, s.precision);
  const nextReserved = qty.add(s.reserved, dReserved, s.precision);
  if (!Number.isFinite(nextStock) || !Number.isFinite(nextReserved)) throw Object.assign(new Error('STOCK_INVALID'), { code: 'STOCK_INVALID' });
  if (nextStock < 0) throw Object.assign(new Error('STOCK_NEGATIVE'), { code: 'STOCK_NEGATIVE' });
  if (nextReserved < 0) throw Object.assign(new Error('RESERVED_NEGATIVE'), { code: 'RESERVED_NEGATIVE' });
  if (nextReserved > nextStock) throw Object.assign(new Error('INSUFFICIENT_AVAILABLE'), { code: 'INSUFFICIENT_AVAILABLE' });
  const copy = { ...product };
  if (variantId) {
    copy.variantCombinations = product.variantCombinations.map((v, i) => i === s.variantIndex
      ? { ...v, stock: nextStock, reserved: nextReserved, availabilityStatus: availabilityFor(qty.sub(nextStock, nextReserved, s.precision), v.availabilityStatus) }
      : v);
  } else {
    copy.stock = nextStock;
    copy.reservedStock = nextReserved;
    copy.availabilityStatus = availabilityFor(qty.sub(nextStock, nextReserved, s.precision), product.availabilityStatus);
  }
  return copy;
}

/** Firestore merge patch carrying only the stock fields that changed. */
function productPatch(original, working, now) {
  const patch = {};
  if (working.variantCombinations !== original.variantCombinations) patch.variantCombinations = working.variantCombinations;
  if (working.stock !== original.stock) patch.stock = working.stock;
  if (working.reservedStock !== original.reservedStock) patch.reservedStock = working.reservedStock;
  if (working.availabilityStatus !== original.availabilityStatus) patch.availabilityStatus = working.availabilityStatus;
  if (Object.keys(patch).length && now) patch.updatedAt = now;
  return patch;
}

/** POS / manual adjustment guard: a sale may only use AVAILABLE stock. */
function checkAvailable(product, variantId, quantity) {
  const s = stockOf(product, variantId);
  if (!s.ok) return { ok: false, error: s.error };
  if (!qty.isValidQuantity(quantity, s.precision)) return { ok: false, error: 'QUANTITY_INVALID' };
  if (qty.compare(s.available, quantity, s.precision) < 0) return { ok: false, error: 'INSUFFICIENT_AVAILABLE', available: s.available, reserved: s.reserved, stock: s.stock };
  return { ok: true, ...s };
}
/** inventoryAdjust guard: stock may not go below what is already reserved. */
function checkAdjust(product, variantId, delta) {
  const s = stockOf(product, variantId);
  if (!s.ok) return { ok: false, error: s.error };
  const next = qty.add(s.stock, delta, s.precision);
  if (!Number.isFinite(next)) return { ok: false, error: 'QUANTITY_INVALID' };
  if (next < 0) return { ok: false, error: 'STOCK_NEGATIVE' };
  if (qty.compare(next, s.reserved, s.precision) < 0) return { ok: false, error: 'BELOW_RESERVED', reserved: s.reserved, stock: s.stock };
  return { ok: true, ...s, resultingStock: next };
}

/* ---------------- order -> stock lines ---------------- */
const NON_STOCK_TYPES = new Set(['service', 'transport', 'digital']);

/**
 * Lines that need physical stock. Group-buy child orders, services, transport,
 * SokoPay links and negotiation-only orders without a product carry no lines
 * (legacy behaviour stays).
 */
function orderStockLines(order) {
  const o = order && typeof order === 'object' ? order : {};
  if (NON_STOCK_TYPES.has(String(o.commerceType || '').toLowerCase())) return { lines: [], skip: 'non_stock_commerce_type' };
  if (o.kind === 'GROUP_CHILD_ORDER') return { lines: [], skip: 'group_child_order' };
  const raw = Array.isArray(o.items) && o.items.length
    ? o.items
    : (o.productId ? [{ productId: o.productId, quantity: o.quantity != null ? o.quantity : o.qty, selectedVariant: o.selectedVariant, variantId: o.variantId }] : []);
  if (!raw.length) return { lines: [], skip: 'no_product_items' };
  if (raw.length > MAX_LINES) return { lines: [], error: 'TOO_MANY_LINES' };
  const lines = [];
  for (const item of raw) {
    if (!item || item.outsideSeller) continue;
    if (NON_STOCK_TYPES.has(String(item.commerceType || item.kind || '').toLowerCase())) continue;
    const productId = String(item.productId || item.id || item.itemId || '').trim();
    if (!productId || productId.includes('/')) return { lines: [], error: 'LINE_PRODUCT_INVALID' };
    const qty = Number(item.quantity != null ? item.quantity : (item.qty != null ? item.qty : 1));
    if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 1000000) return { lines: [], error: 'LINE_QUANTITY_INVALID' };
    const sel = item.selectedVariant != null ? item.selectedVariant : item.variant;
    lines.push({ productId, quantity: qty, variantId: String(item.variantId || (sel && typeof sel === 'object' ? sel.variantId || '' : '') || '').trim() || null, variantRef: sel == null ? null : sel });
  }
  return { lines };
}

/** Resolve the canonical variant for a line, or explain why it cannot be resolved. */
function resolveLineVariant(product, line) {
  const combos = Array.isArray(product && product.variantCombinations) ? product.variantCombinations.filter(Boolean) : [];
  if (!combos.length) return { ok: true, variantId: null };
  if (line.variantId) {
    return combos.some(v => v.variantId === line.variantId) ? { ok: true, variantId: line.variantId } : { ok: false, error: 'VARIANT_NOT_FOUND' };
  }
  const ref = line.variantRef;
  if (ref && typeof ref === 'object') {
    const opts = ref.options && typeof ref.options === 'object' ? ref.options : ref;
    let sig = '';
    try { sig = identity.optionSignature(opts); } catch (e) { sig = ''; }
    const hit = sig && combos.find(v => (v.optionSignature || (() => { try { return identity.optionSignature(v.options); } catch (e) { return ''; } })()) === sig);
    if (hit) return { ok: true, variantId: hit.variantId };
  } else if (typeof ref === 'string' && ref.trim()) {
    const want = ref.trim().toLowerCase();
    const hit = combos.find(v => String(v.variantId || '').toLowerCase() === want || String(v.sku || '').toLowerCase() === want
      || Object.values(v.options || {}).map(x => String(x).toLowerCase()).join(' / ') === want);
    if (hit) return { ok: true, variantId: hit.variantId };
  }
  if (combos.length === 1) return { ok: true, variantId: combos[0].variantId };
  return { ok: false, error: 'VARIANT_UNRESOLVED' };
}

/**
 * Plan a reservation (or a direct commit) for all lines against product data.
 * products: { [productId]: data|null }. mode: 'reserve' (reserved += q) or
 * 'commit_reserved' (stock -= q, reserved -= q) or 'reserve_and_commit'
 * (stock -= q, checks available). Returns working copies, never partial.
 */
function planLines(lines, products, { mode, order = {}, reservationLines = null } = {}) {
  if (!['reserve', 'commit_reserved', 'reserve_and_commit', 'release'].includes(mode)) throw new Error('PLAN_MODE_INVALID');
  const working = {};
  const planned = [];
  const source = reservationLines || lines;
  for (let i = 0; i < source.length; i += 1) {
    const line = source[i];
    const original = products[line.productId];
    if (!original) return { ok: false, error: 'PRODUCT_NOT_FOUND', lineIndex: i };
    if (order.sellerId && original.userId && String(original.userId) !== String(order.sellerId)) return { ok: false, error: 'SELLER_MISMATCH', lineIndex: i };
    const current = working[line.productId] || original;
    let variantId = line.variantId || null;
    if (!reservationLines) {
      const rv = resolveLineVariant(current, line);
      if (!rv.ok) return { ok: false, error: rv.error, lineIndex: i };
      variantId = rv.variantId;
    }
    const q = line.quantity;
    const delta = mode === 'reserve' ? { reserved: q }
      : mode === 'commit_reserved' ? { stock: -q, reserved: -q }
        : mode === 'release' ? { reserved: -q }
          : { stock: -q };
    const before = stockOf(current, variantId);
    if (!before.ok) return { ok: false, error: before.error, lineIndex: i };
    if ((mode === 'reserve' || mode === 'reserve_and_commit') && before.available < q) {
      return { ok: false, error: 'INSUFFICIENT_AVAILABLE', lineIndex: i, available: before.available };
    }
    try { working[line.productId] = applyDelta(current, variantId, delta); }
    catch (e) {
      // release of a reservation whose counter already drifted: clamp to 0, flag for reconciliation
      if (mode === 'release' && e.code === 'RESERVED_NEGATIVE') {
        working[line.productId] = applyDelta(current, variantId, { reserved: -before.reserved });
        planned.push({ ...line, variantId, drift: q - before.reserved, before });
        continue;
      }
      return { ok: false, error: e.code || e.message, lineIndex: i };
    }
    const unitId = line.unitId || (variantId ? (current.variantCombinations[before.variantIndex].unitId || null) : (current.baseUnitId || null));
    planned.push({
      productId: line.productId, variantId, unitId, quantity: q,
      stockKey: line.stockKey || stockKey({ businessId: original.businessId, sellerId: original.userId || order.sellerId, storeId: original.storeId, productId: line.productId, variantId, unitId }),
      before: { stock: before.stock, reserved: before.reserved },
      after: (() => { const a = stockOf(working[line.productId], variantId); return { stock: a.stock, reserved: a.reserved }; })()
    });
  }
  // one order = one location (decision R2-5)
  const locations = new Set(planned.map(l => l.stockKey.split(':').slice(0, 2).join(':')));
  if (locations.size > 1) return { ok: false, error: 'MULTI_LOCATION_ORDER' };
  return { ok: true, lines: planned, working };
}

/* ---------------- decisions ---------------- */
/**
 * What settlement must do with stock for one paid order.
 *  LEGACY            reservation disabled for this seller and no reservation: no stock change (today's behaviour)
 *  NONE              order has no stock lines
 *  COMMIT            reservation ACTIVE (even if past expiresAt but not yet swept: the stock is still held)
 *  ALREADY_COMMITTED reservation COMMITTED (duplicate / replay)
 *  RESERVE_AND_COMMIT no live reservation (expired, released, failed, or legacy order): take stock now if available
 */
function decideSettlement({ enabled, hasLines, reservation }) {
  if (!hasLines) return 'NONE';
  if (!reservation) return enabled ? 'RESERVE_AND_COMMIT' : 'LEGACY';
  if (reservation.status === 'ACTIVE') return 'COMMIT';
  if (reservation.status === 'COMMITTED') return 'ALREADY_COMMITTED';
  return 'RESERVE_AND_COMMIT';
}

function isExpired(reservation, nowMs) {
  return !!reservation && reservation.status === 'ACTIVE' && Date.parse(reservation.expiresAt) <= nowMs;
}

function addMinutes(iso, minutes) { return new Date(Date.parse(iso) + minutes * 60000).toISOString(); }

const BLOCKING_REVIEW_STATES = Object.freeze(['NEEDS_REVIEW', 'REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED']);
function escrowReleaseBlocked(order) {
  return BLOCKING_REVIEW_STATES.includes(String(order && order.inventoryReviewState || ''));
}

/* ---------------- invariants (reconciliation) ---------------- */
function productInvariantIssues(productId, product) {
  const issues = [];
  const base = stockOf(product, null);
  if (!base.ok) issues.push({ productId, variantId: null, issue: base.error });
  else if (base.reserved > base.stock) issues.push({ productId, variantId: null, issue: 'RESERVED_EXCEEDS_STOCK', stock: base.stock, reserved: base.reserved });
  (Array.isArray(product && product.variantCombinations) ? product.variantCombinations : []).forEach(v => {
    if (!v || !v.variantId) return;
    const s = stockOf(product, v.variantId);
    if (!s.ok) issues.push({ productId, variantId: v.variantId, issue: s.error });
    else if (s.reserved > s.stock) issues.push({ productId, variantId: v.variantId, issue: 'RESERVED_EXCEEDS_STOCK', stock: s.stock, reserved: s.reserved });
  });
  return issues;
}

/** Compare product reserved counters with the sum of ACTIVE reservations. */
function reservedDrift(products, activeReservations) {
  const want = {};
  activeReservations.forEach(r => (r.lines || []).forEach(l => {
    const k = l.productId + '|' + (l.variantId || '');
    want[k] = (want[k] || 0) + l.quantity;
  }));
  const drift = [];
  Object.entries(products).forEach(([productId, p]) => {
    const keys = [[productId + '|', null]].concat((p.variantCombinations || []).filter(v => v && v.variantId).map(v => [productId + '|' + v.variantId, v.variantId]));
    keys.forEach(([k, variantId]) => {
      const s = stockOf(p, variantId);
      if (!s.ok) return;
      const expected = want[k] || 0;
      if (s.reserved !== expected) drift.push({ productId, variantId, reserved: s.reserved, expected });
    });
  });
  return drift;
}

module.exports = {
  CONFIG_DEFAULTS, CONFIG_BOUNDS, MAX_LINES, MACHINES, BLOCKING_REVIEW_STATES,
  resolveConfig, reservationEnabledFor,
  stockKey, parseStockKey, ids,
  canTransition, assertTransition,
  stockOf, applyDelta, productPatch, availabilityFor, checkAvailable, checkAdjust,
  orderStockLines, resolveLineVariant, planLines,
  decideSettlement, isExpired, addMinutes, escrowReleaseBlocked,
  productInvariantIssues, reservedDrift
};

/* SOKOHAI ORDER WRITE CORE — canonical builder + validator for client-created orders.
 * [PHASE 1 G4 2026-11-10] Mirrors the products pattern (buildProductWrite /
 * validateProduct): every browser writer must produce this shape so settle /
 * reserve / analytics stop failing silently on ~20 legacy schemas (F5).
 *
 * Rules contract (firestore.rules — keep in sync):
 *   buyer create: status in ORDER_CREATE_STATUS, paymentStatus unpaid-only,
 *     paymentVerified === false, no server-only keys, no 'trust'.
 *   service create (fundi accepts request): status 'held' + collectionName
 *     'services' + itemId + accepted-request backing (rules enforce backing).
 *
 * Timestamps (F6): canonical field is `createdAt` as an ISO STRING — NOT a
 * Firestore Timestamp. Reason: 93+ live docs use ISO strings and Firestore
 * sorts mixed types in separate groups; switching new docs to Timestamp
 * would silently split feed ordering. The builder always stamps createdAt.
 */
const txt = v => String(v == null ? '' : v).trim();
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

export const ORDER_CREATE_STATUS = ['payment_pending', 'pending', 'pending_choice', 'new_order', 'awaiting_payment'];
export const ORDER_CREATE_PAYMENT = ['pending', 'payment_pending', 'unpaid'];

// Mirror of firestore.rules orderServerOnlyCreateKeys() — keep in sync.
export const ORDER_SERVER_ONLY_CREATE_KEYS = [
  'sellerEarned', 'carrierEarned', 'commission', 'autoReleased', 'autoReleasedAt',
  'disputeWinner', 'disputeResolvedAt', 'verifiedAmount', 'paymentProtectedAt', 'buyerRefund', 'completedAt',
  'paidAt', 'heldAt', 'verifiedByServer', 'paymentVerifiedBy', 'ipnAt', 'pricedByServer', 'priceSource',
  'releaseEligibleAt', 'buyerConfirmedAt', 'deliveryProofAt', 'deliveryProofBy', 'refundStatus', 'refundedAt',
  'priceApprovedBy', 'priceApprovedAt', 'priceApprovedAmount', 'priceApprovalReason',
  'priceReviewReason', 'priceExpected', 'priceReviewAt', 'pesapalTrackingId', 'disputeId', 'priceApprovalAuditId',
  'reservationId', 'reservationStatus', 'reservationExpiresAt', 'reservationAttempt', 'reservationFailReason',
  'reservationCheckedAt', 'reservationEndedAt', 'stockCommitted', 'stockCommittedAt', 'inventoryReviewState',
  'inventoryReviewReason', 'reviewDeadlineAt', 'refundPendingAt', 'refundId', 'reviewResolvedAt', 'reviewResolvedBy'
];

// F12: legacy paymentStatus spellings -> canonical enum.
export function normalizePaymentStatus(v) {
  const s = txt(v);
  if (s === 'Payment Pending' || s === '' || s === '-') return 'pending';
  return s;
}

export function isIsoString(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

export function validateOrder(d) {
  const errors = [];
  const o = d || {};
  if (!txt(o.buyerId)) errors.push('buyerId inahitajika.');
  if (!txt(o.sellerId)) errors.push('sellerId inahitajika.');
  if (txt(o.buyerId) && txt(o.sellerId) && txt(o.buyerId) === txt(o.sellerId)) errors.push('sellerId lazima awe tofauti na buyerId.');
  const amount = num(o.amount);
  if (!Number.isFinite(amount) || !(amount > 0)) errors.push('amount lazima iwe namba > 0.');
  const st = txt(o.status) || 'payment_pending';
  const isService = txt(o.collectionName) === 'services';
  if (isService) {
    if (st !== 'held') errors.push("Oda ya huduma lazima ianze status 'held'.");
    if (!txt(o.itemId)) errors.push('itemId inahitajika kwa oda ya huduma.');
  } else if (ORDER_CREATE_STATUS.indexOf(st) === -1) {
    errors.push("status '" + st + "' si ya kuunda oda (tumia payment_pending).");
  }
  const ps = normalizePaymentStatus(o.paymentStatus);
  if (ORDER_CREATE_PAYMENT.indexOf(ps) === -1) errors.push("paymentStatus '" + txt(o.paymentStatus) + "' si halali kwa oda mpya.");
  if (o.paymentVerified === true) errors.push('paymentVerified lazima iwe false oda inapoundwa.');
  if (o.createdAt !== undefined && !isIsoString(o.createdAt)) errors.push('createdAt lazima iwe ISO string.');
  for (const k of ORDER_SERVER_ONLY_CREATE_KEYS) {
    if (o[k] !== undefined) errors.push("'" + k + "' ni server-only (haiandikwi na kivinjari).");
  }
  if (o.trust !== undefined) errors.push("'trust' ni server-only.");
  return { ok: errors.length === 0, errors };
}

export function buildOrderWrite(input) {
  const p = Object.assign({}, input || {});
  p.buyerId = txt(p.buyerId);
  p.sellerId = txt(p.sellerId);
  if (!p.buyerId) throw new Error('buyerId inahitajika.');
  if (!p.sellerId) throw new Error('sellerId inahitajika.');
  if (p.buyerId === p.sellerId) throw new Error('sellerId lazima awe tofauti na buyerId.');
  p.amount = num(p.amount);
  if (!Number.isFinite(p.amount) || !(p.amount > 0)) throw new Error('amount lazima iwe namba > 0.');
  const isService = txt(p.collectionName) === 'services';
  const st = txt(p.status) || 'payment_pending';
  if (isService) {
    if (st !== 'held') throw new Error("Oda ya huduma lazima ianze 'held'.");
    p.itemId = txt(p.itemId);
    if (!p.itemId) throw new Error('itemId inahitajika kwa oda ya huduma.');
  } else {
    p.status = ORDER_CREATE_STATUS.indexOf(st) !== -1 ? st : 'payment_pending';
  }
  const ps = normalizePaymentStatus(p.paymentStatus === undefined ? 'pending' : p.paymentStatus);
  if (ORDER_CREATE_PAYMENT.indexOf(ps) === -1) throw new Error("paymentStatus '" + txt(p.paymentStatus) + "' si halali.");
  p.paymentStatus = ps;
  p.paymentVerified = false;
  for (const k of ORDER_SERVER_ONLY_CREATE_KEYS) delete p[k];
  delete p.trust;
  const now = new Date().toISOString();
  if (!isIsoString(p.createdAt)) p.createdAt = now;
  p.updatedAt = now;
  p.orderSchemaVersion = 1;
  const v = validateOrder(p);
  if (!v.ok) throw new Error('Oda si canonical: ' + v.errors.join(' | '));
  return p;
}

// Shadow-mode helper: validates, warns on drift, returns the SAME object.
// Zero behavior change — writers keep writing exactly what they wrote.
export function shadowOrder(doc, tag) {
  try {
    const v = validateOrder(doc);
    if (!v.ok && typeof console !== 'undefined' && console.warn) {
      console.warn('[order-shape][' + (tag || '?') + '] ' + v.errors.join(' | '));
    }
  } catch (e) { /* shadow never breaks the write */ }
  return doc;
}

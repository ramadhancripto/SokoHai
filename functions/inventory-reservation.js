'use strict';
/**
 * [PHASE 3 — 2026-10-31] Server-authoritative online reservation.
 *
 * Stock authority = the product record (see shared/inventory-reservation-core.js).
 * Every function below runs inside a Firestore transaction and is idempotent:
 *   T1 reserveOrder            order created / buyer retries  -> reservation ACTIVE (reserved += q)
 *   T2 settlement (index.js)   PesaPal verified, same tx as escrow hold -> COMMITTED (stock -= q, reserved -= q)
 *   T3 late payment            no live reservation -> reserve+commit if available, else NEEDS_REVIEW
 *   T4 releaseReservation      order cancelled -> RELEASED (reserved -= q)
 *   T5 runSweep                expiresAt passed -> EXPIRED; review window passed -> REFUND_PENDING
 *   T6 refund (index.js)       admin, once, audited (wallet ledger id is deterministic)
 * The feature is OFF by default (system_config/inventory.mode = 'off'); while
 * off, orders and payments behave exactly as before.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const core = require('./shared/inventory-reservation-core');

const db = admin.firestore();
const REGION = 'europe-west1';
const RES = 'inventory_reservations';
const UNPAID = ['payment_pending', 'pending', 'pending_choice', 'new_order', 'awaiting_payment'];

async function loadConfig() {
  try {
    const snap = await db.doc('system_config/inventory').get();
    return core.resolveConfig(snap.exists ? snap.data() : null);
  } catch (e) {
    return core.resolveConfig(null);
  }
}

// Same rule as index.js isAdmin(): verified ADMIN_EMAILS address or an admin claim.
function isAdminAuth(auth) {
  if (!auth) return false;
  const t = auth.token || {};
  const email = String(t.email || '').toLowerCase();
  const list = String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (email && t.email_verified === true && list.includes(email)) return true;
  return t.admin === true || t.superAdmin === true || t.role === 'admin';
}

async function readProducts(tx, productIds) {
  const unique = [...new Set(productIds)];
  const snaps = await Promise.all(unique.map(id => tx.get(db.doc('products/' + id))));
  const products = {};
  snaps.forEach((s, i) => { products[unique[i]] = s.exists ? (s.data() || {}) : null; });
  return products;
}

function writeProductPatches(tx, original, working, now) {
  Object.keys(working).forEach(pid => {
    const patch = core.productPatch(original[pid], working[pid], now);
    if (Object.keys(patch).length) tx.set(db.doc('products/' + pid), patch, { merge: true });
  });
}

function movementDocs(tx, kind, orderId, attemptTag, lines, extra, now) {
  lines.forEach((l, i) => {
    const id = core.ids.movement(kind, orderId + (attemptTag || ''), i);
    tx.set(db.doc('inventory_movements/' + id), {
      movementId: id, type: kind, source: 'ONLINE_ORDER', orderId,
      productId: l.productId, variantId: l.variantId || null, unitId: l.unitId || null, stockKey: l.stockKey,
      quantity: kind === 'ONLINE_SALE' ? -l.quantity : 0,
      reservedDelta: kind === 'RESERVE' ? l.quantity : (kind === 'ONLINE_SALE' && extra.fromReservation ? -l.quantity : (kind === 'RELEASE' || kind === 'EXPIRE' ? -l.quantity : 0)),
      previousStock: l.before.stock, resultingStock: l.after.stock,
      previousReserved: l.before.reserved, resultingReserved: l.after.reserved,
      ownerUid: extra.sellerId || null, actorUid: extra.actorUid || 'system', createdAt: now
    });
  });
}

/* ---------------- T1: reserve ---------------- */
async function reserveOrder(orderId, { actorUid = null, admin: asAdmin = false, source = 'callable', config = null, nowIso = null } = {}) {
  const id = String(orderId || '').trim();
  if (!id || id.includes('/')) throw new HttpsError('invalid-argument', 'orderId inahitajika.');
  const cfg = config || await loadConfig();
  const orderRef = db.doc('orders/' + id);
  let result;
  await db.runTransaction(async tx => {
    const now = nowIso || new Date().toISOString();
    const nowMs = Date.parse(now);
    const os = await tx.get(orderRef);
    if (!os.exists) { result = { ok: false, error: 'ORDER_NOT_FOUND' }; return; }
    const order = os.data() || {};
    if (actorUid && !asAdmin && String(order.buyerId || '') !== String(actorUid)) throw new HttpsError('permission-denied', 'Si oda yako.');
    if (!core.reservationEnabledFor(cfg, order.sellerId)) { result = { ok: true, skipped: 'disabled' }; return; }
    if (order.paymentVerified === true) { result = { ok: true, skipped: 'already_paid' }; return; }
    if (!UNPAID.includes(String(order.status || 'payment_pending'))) { result = { ok: false, error: 'ORDER_NOT_RESERVABLE', status: order.status || null }; return; }
    const { lines, skip, error } = core.orderStockLines(order);
    let existing = null; let existingRef = null;
    if (order.reservationId) {
      existingRef = db.doc(RES + '/' + order.reservationId);
      const rs = await tx.get(existingRef);
      existing = rs.exists ? (rs.data() || {}) : null;
    }
    if (existing && existing.status === 'ACTIVE' && !core.isExpired(existing, nowMs)) {
      result = { ok: true, idempotent: true, reservationId: order.reservationId, expiresAt: existing.expiresAt }; return;
    }
    if (existing && existing.status === 'COMMITTED') { result = { ok: true, idempotent: true, committed: true, reservationId: order.reservationId }; return; }
    if (error) {
      tx.update(orderRef, { reservationStatus: 'FAILED', reservationFailReason: error, reservationCheckedAt: now });
      result = { ok: false, error }; return;
    }
    if (!lines.length) { result = { ok: true, skipped: skip || 'no_lines' }; return; }
    const productIds = lines.map(l => l.productId).concat(existing && existing.status === 'ACTIVE' ? (existing.lines || []).map(l => l.productId) : []);
    const products = await readProducts(tx, productIds);
    let base = products;
    if (existing && existing.status === 'ACTIVE') {
      // Same transaction: the stale reservation is expired before the new attempt.
      const rel = core.planLines(null, products, { mode: 'release', order, reservationLines: existing.lines || [] });
      if (rel.ok) {
        base = { ...products, ...rel.working };
        tx.update(existingRef, { status: core.assertTransition('reservation', 'ACTIVE', 'EXPIRED'), expiredAt: now, endedBy: 'reserve_retry' });
        movementDocs(tx, 'EXPIRE', id, '-' + order.reservationId, rel.lines, { sellerId: order.sellerId }, now);
      }
    }
    const plan = core.planLines(lines, base, { mode: 'reserve', order });
    if (!plan.ok) {
      writeProductPatches(tx, products, base === products ? {} : base, now);
      tx.update(orderRef, { reservationStatus: 'FAILED', reservationFailReason: plan.error, reservationCheckedAt: now });
      result = { ok: false, error: plan.error, lineIndex: plan.lineIndex, available: plan.available }; return;
    }
    const attempt = existing ? Number(order.reservationAttempt || 0) + 1 : 0;
    const reservationId = core.ids.reservation(id, attempt);
    const expiresAt = core.addMinutes(now, cfg.ttlMinutes);
    tx.create(db.doc(RES + '/' + reservationId), {
      reservationId, orderId: id, attempt, status: 'ACTIVE',
      buyerId: order.buyerId || null, sellerId: order.sellerId || null,
      lines: plan.lines.map(l => ({ productId: l.productId, variantId: l.variantId, unitId: l.unitId, quantity: l.quantity, stockKey: l.stockKey })),
      locationKey: plan.lines[0].stockKey.split(':').slice(0, 2).join(':'),
      ttlMinutes: cfg.ttlMinutes, ttlTrial: !cfg.ttlValidated, expiresAt, createdAt: now, source
    });
    writeProductPatches(tx, products, { ...(base === products ? {} : base), ...plan.working }, now);
    movementDocs(tx, 'RESERVE', id, attempt ? '-R' + attempt : '', plan.lines, { sellerId: order.sellerId, actorUid }, now);
    tx.update(orderRef, { reservationId, reservationStatus: 'ACTIVE', reservationExpiresAt: expiresAt, reservationAttempt: attempt, reservationFailReason: null, reservationCheckedAt: now });
    result = { ok: true, reservationId, expiresAt, ttlTrial: !cfg.ttlValidated };
  });
  return result;
}

/* ---------------- T4 / T5: release or expire ---------------- */
async function endReservation(reservationId, endState, { nowIso = null, endedBy = 'system', requireOrderUnpaid = true } = {}) {
  const ref = db.doc(RES + '/' + reservationId);
  let result;
  await db.runTransaction(async tx => {
    const now = nowIso || new Date().toISOString();
    const rs = await tx.get(ref);
    if (!rs.exists) { result = { ok: false, error: 'RESERVATION_NOT_FOUND' }; return; }
    const r = rs.data() || {};
    if (r.status !== 'ACTIVE') { result = { ok: true, idempotent: true, status: r.status }; return; }
    const orderRef = db.doc('orders/' + r.orderId);
    const os = await tx.get(orderRef);
    const order = os.exists ? (os.data() || {}) : {};
    if (requireOrderUnpaid && order.paymentVerified === true) { result = { ok: true, skipped: 'order_paid' }; return; }
    const products = await readProducts(tx, (r.lines || []).map(l => l.productId));
    const plan = core.planLines(null, products, { mode: 'release', order, reservationLines: r.lines || [] });
    if (!plan.ok) {
      // The product disappeared or changed shape: end the reservation, record for reconciliation.
      tx.update(ref, { status: core.assertTransition('reservation', 'ACTIVE', endState), endedAt: now, endedBy, releaseError: plan.error });
      result = { ok: true, status: endState, releaseError: plan.error };
      return;
    }
    writeProductPatches(tx, products, plan.working, now);
    movementDocs(tx, endState === 'EXPIRED' ? 'EXPIRE' : 'RELEASE', r.orderId, '-' + reservationId, plan.lines, { sellerId: r.sellerId }, now);
    const drift = plan.lines.filter(l => l.drift).map(l => ({ productId: l.productId, variantId: l.variantId, drift: l.drift }));
    tx.update(ref, { status: core.assertTransition('reservation', 'ACTIVE', endState), endedAt: now, endedBy, ...(drift.length ? { reservedDrift: drift } : {}) });
    if (os.exists && order.reservationId === reservationId) tx.update(orderRef, { reservationStatus: endState, reservationEndedAt: now });
    result = { ok: true, status: endState };
  });
  return result;
}

async function releaseOrderReservation(orderId, opts = {}) {
  const os = await db.doc('orders/' + orderId).get();
  if (!os.exists) return { ok: false, error: 'ORDER_NOT_FOUND' };
  const o = os.data() || {};
  if (!o.reservationId) return { ok: true, skipped: 'no_reservation' };
  return endReservation(o.reservationId, 'RELEASED', opts);
}

async function runSweep({ nowIso = null, limit = 100 } = {}) {
  const now = nowIso || new Date().toISOString();
  const out = { expired: 0, refundPending: 0, errors: 0 };
  const due = await db.collection(RES).where('status', '==', 'ACTIVE').where('expiresAt', '<=', now).limit(limit).get();
  for (const d of due.docs) {
    try { const r = await endReservation(d.id, 'EXPIRED', { nowIso: now, endedBy: 'sweep' }); if (r.ok && r.status === 'EXPIRED' && !r.idempotent) out.expired += 1; }
    catch (e) { out.errors += 1; console.error('[reservationSweep] expire', d.id, e && e.message); }
  }
  const reviews = await db.collection('orders').where('inventoryReviewState', '==', 'NEEDS_REVIEW').where('reviewDeadlineAt', '<=', now).limit(limit).get();
  for (const d of reviews.docs) {
    try {
      await db.runTransaction(async tx => {
        const s = await tx.get(d.ref);
        const o = s.data() || {};
        if (o.inventoryReviewState !== 'NEEDS_REVIEW') return;
        tx.update(d.ref, { inventoryReviewState: core.assertTransition('review', 'NEEDS_REVIEW', 'REFUND_PENDING'), refundPendingAt: now });
        tx.set(db.doc('payment_reviews/' + core.ids.review(d.id)), { state: 'REFUND_PENDING', refundPendingAt: now, updatedAt: now }, { merge: true });
      });
      out.refundPending += 1;
    } catch (e) { out.errors += 1; console.error('[reservationSweep] review', d.id, e && e.message); }
  }
  return out;
}

/* ---------------- T2 / T3: settlement helpers (used by index.js) ----------------
 * prepare() does every read (all reads must precede writes in a transaction),
 * decide() applies one order to the shared working copy, flush() writes. */
async function settlementPrepare(t, orderCands, config) {
  const state = { config, orders: {}, products: {}, working: {}, writes: [] };
  const productIds = [];
  for (const c of orderCands) {
    const enabled = core.reservationEnabledFor(config, c.data.sellerId);
    const { lines, error } = core.orderStockLines(c.data);
    let reservation = null; let reservationRef = null;
    if (c.data.reservationId) {
      reservationRef = db.doc(RES + '/' + c.data.reservationId);
      const rs = await t.get(reservationRef);
      reservation = rs.exists ? (rs.data() || {}) : null;
    }
    const decision = core.decideSettlement({ enabled, hasLines: !error && lines.length > 0, reservation });
    state.orders[c.id] = { lines, lineError: error || null, reservation, reservationRef, decision, enabled };
    if (error && (enabled || reservation)) state.orders[c.id].decision = 'REVIEW_LINE_ERROR';
    if (decision === 'COMMIT') productIds.push(...(reservation.lines || []).map(l => l.productId));
    if (decision === 'RESERVE_AND_COMMIT') productIds.push(...lines.map(l => l.productId));
  }
  const unique = [...new Set(productIds)];
  for (const pid of unique) {
    const s = await t.get(db.doc('products/' + pid));
    state.products[pid] = s.exists ? (s.data() || {}) : null;
  }
  return state;
}

/** Returns { action, orderPatch, reason }. action: LEGACY | NONE | COMMITTED | ALREADY_COMMITTED | NEEDS_REVIEW */
function settlementDecide(state, orderId, order, now) {
  const o = state.orders[orderId];
  if (!o) return { action: 'LEGACY', orderPatch: {} };
  const current = { ...state.products, ...state.working };
  if (o.decision === 'LEGACY' || o.decision === 'NONE') return { action: o.decision, orderPatch: {} };
  if (o.decision === 'ALREADY_COMMITTED') return { action: 'ALREADY_COMMITTED', orderPatch: {} };
  const review = reason => ({
    action: 'NEEDS_REVIEW', reason,
    orderPatch: {
      status: 'needs_review', inventoryReviewState: core.assertTransition('review', 'NONE', 'NEEDS_REVIEW'),
      inventoryReviewReason: reason, reviewDeadlineAt: core.addMinutes(now, state.config.reviewWindowMinutes)
    }
  });
  if (o.decision === 'REVIEW_LINE_ERROR') return review(o.lineError);
  if (o.decision === 'COMMIT') {
    const plan = core.planLines(null, current, { mode: 'commit_reserved', order, reservationLines: o.reservation.lines || [] });
    if (!plan.ok) return review('COMMIT_' + plan.error);
    Object.assign(state.working, plan.working);
    state.writes.push(tx => {
      tx.update(o.reservationRef, { status: core.assertTransition('reservation', 'ACTIVE', 'COMMITTED'), committedAt: now, endedBy: 'payment' });
      movementDocs(tx, 'ONLINE_SALE', orderId, '', plan.lines, { sellerId: order.sellerId, fromReservation: true }, now);
    });
    return { action: 'COMMITTED', orderPatch: { reservationStatus: 'COMMITTED', stockCommitted: true, stockCommittedAt: now } };
  }
  // RESERVE_AND_COMMIT: late payment (reservation expired / released / failed) or legacy order.
  const plan = core.planLines(o.lines, current, { mode: 'reserve_and_commit', order });
  if (!plan.ok) return review(plan.error === 'INSUFFICIENT_AVAILABLE' ? 'LATE_PAYMENT_NO_STOCK' : 'LATE_PAYMENT_' + plan.error);
  Object.assign(state.working, plan.working);
  const attempt = o.reservation ? Number(order.reservationAttempt || 0) + 1 : 0;
  const reservationId = core.ids.reservation(orderId, attempt);
  state.writes.push(tx => {
    tx.create(db.doc(RES + '/' + reservationId), {
      reservationId, orderId, attempt, status: 'COMMITTED', committedAt: now, createdAt: now, endedBy: 'payment',
      buyerId: order.buyerId || null, sellerId: order.sellerId || null, source: o.reservation ? 'late_payment_rereserve' : 'payment_without_reservation',
      lines: plan.lines.map(l => ({ productId: l.productId, variantId: l.variantId, unitId: l.unitId, quantity: l.quantity, stockKey: l.stockKey }))
    });
    movementDocs(tx, 'ONLINE_SALE', orderId, attempt ? '-R' + attempt : '', plan.lines, { sellerId: order.sellerId, fromReservation: false }, now);
  });
  return { action: 'COMMITTED', late: !!o.reservation, orderPatch: { reservationId, reservationAttempt: attempt, reservationStatus: 'COMMITTED', stockCommitted: true, stockCommittedAt: now } };
}

function settlementFlush(t, state, now) {
  writeProductPatches(t, state.products, state.working, now);
  state.writes.forEach(fn => fn(t));
}

/* ---------------- reconciliation (read-only report) ---------------- */
async function reconcileSeller(sellerId, { nowIso = null } = {}) {
  const now = nowIso || new Date().toISOString();
  const nowMs = Date.parse(now);
  const [prods, active] = await Promise.all([
    db.collection('products').where('userId', '==', sellerId).limit(500).get(),
    db.collection(RES).where('sellerId', '==', sellerId).where('status', '==', 'ACTIVE').limit(500).get()
  ]);
  const products = {};
  prods.docs.forEach(d => { products[d.id] = d.data() || {}; });
  const reservations = active.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
  const issues = [];
  Object.entries(products).forEach(([pid, p]) => issues.push(...core.productInvariantIssues(pid, p)));
  const drift = core.reservedDrift(products, reservations);
  const overdue = reservations.filter(r => core.isExpired(r, nowMs)).map(r => r.id);
  return { ok: issues.length === 0 && drift.length === 0, checkedAt: now, products: prods.size, activeReservations: reservations.length, issues, drift, overdueReservations: overdue };
}

/* ---------------- exported Cloud Functions ---------------- */
exports.inventoryReserve = onCall({ region: REGION }, async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Ingia kwanza.');
  const data = req.data || {};
  return reserveOrder(data.orderId, { actorUid: req.auth.uid, admin: isAdminAuth(req.auth), source: 'callable' });
});

exports.inventoryReleaseReservation = onCall({ region: REGION }, async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Ingia kwanza.');
  const orderId = String((req.data || {}).orderId || '').trim();
  if (!orderId || orderId.includes('/')) throw new HttpsError('invalid-argument', 'orderId inahitajika.');
  const os = await db.doc('orders/' + orderId).get();
  if (!os.exists) throw new HttpsError('not-found', 'Oda haipo.');
  const o = os.data() || {};
  const party = [o.buyerId, o.sellerId].map(String).includes(String(req.auth.uid));
  if (!party && !isAdminAuth(req.auth)) throw new HttpsError('permission-denied', 'Si oda yako.');
  if (o.paymentVerified === true) throw new HttpsError('failed-precondition', 'Oda imelipwa; tumia mchakato wa refund.');
  return releaseOrderReservation(orderId, { endedBy: req.auth.uid });
});

exports.inventoryReconcile = onCall({ region: REGION }, async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Ingia kwanza.');
  const sellerId = String((req.data || {}).sellerId || req.auth.uid);
  if (sellerId !== req.auth.uid && !isAdminAuth(req.auth)) throw new HttpsError('permission-denied', 'Admin pekee kwa muuzaji mwingine.');
  return reconcileSeller(sellerId);
});

exports.inventoryOrderCreated = onDocumentCreated({ document: 'orders/{orderId}', region: REGION }, async event => {
  const data = event.data && event.data.data ? event.data.data() : null;
  if (!data || data.paymentVerified === true) return;
  const cfg = await loadConfig();
  if (!core.reservationEnabledFor(cfg, data.sellerId)) return;
  try { await reserveOrder(event.params.orderId, { source: 'order_created', config: cfg }); }
  catch (e) { console.error('[inventoryOrderCreated]', event.params.orderId, e && e.message); }
});

exports.inventoryOrderUpdated = onDocumentUpdated({ document: 'orders/{orderId}', region: REGION }, async event => {
  const after = event.data && event.data.after ? event.data.after.data() : null;
  const before = event.data && event.data.before ? event.data.before.data() : null;
  if (!after || after.reservationStatus !== 'ACTIVE' || after.paymentVerified === true) return;
  if (String(after.status || '') !== 'cancelled' || String((before || {}).status || '') === 'cancelled') return;
  try { await releaseOrderReservation(event.params.orderId, { endedBy: 'order_cancelled' }); }
  catch (e) { console.error('[inventoryOrderUpdated]', event.params.orderId, e && e.message); }
});

// Runs even when mode is 'off': reservations left by a pilot that was switched
// off must still expire, so stock is never held forever.
exports.inventoryReservationSweep = onSchedule({ schedule: 'every 5 minutes', region: REGION, timeZone: 'Africa/Dar_es_Salaam' }, async () => runSweep());

exports._internal = { loadConfig, reserveOrder, endReservation, releaseOrderReservation, runSweep, settlementPrepare, settlementDecide, settlementFlush, reconcileSeller, isAdminAuth };

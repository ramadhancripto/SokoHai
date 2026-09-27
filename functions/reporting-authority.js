'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { resolveBusinessStoreContext } = require('./business-store-authority');
const db = admin.firestore();
const REGION = 'europe-west1';

const PAYMENT_METHODS = ['Cash', 'Mpesa', 'TigoPesa', 'AirtelMoney', 'Bank', 'Deni', 'Awamu'];
const COMPLETED_PAYMENT = new Set(['RECORDED', 'COMPLETED', 'RECONCILED']);
const PENDING_PAYMENT = new Set(['PENDING_VERIFICATION', 'PENDING', 'CREDIT_OPEN', 'REFUND_PENDING', 'CREDIT_ADJUSTMENT_PENDING']);

function text(value) { return String(value == null ? '' : value).trim(); }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function dateValue(value) { const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function periodBounds(input = {}) {
  let start = dateValue(input.start);
  let end = dateValue(input.end);
  if (!start || !end) {
    const anchor = dateValue(input.asOf) || new Date();
    const day = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
    const preset = String(input.preset || 'today').toLowerCase();
    if (preset === 'yesterday') { start = new Date(day); start.setUTCDate(start.getUTCDate() - 1); end = new Date(day); }
    else if (preset === 'this_week') { const offset = (day.getUTCDay() + 6) % 7; start = new Date(day); start.setUTCDate(start.getUTCDate() - offset); end = new Date(start); end.setUTCDate(end.getUTCDate() + 7); }
    else if (preset === 'this_month') { start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)); end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1)); }
    else if (preset === 'last_month') { start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1)); end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)); }
    else { start = day; end = new Date(day); end.setUTCDate(end.getUTCDate() + 1); }
  }
  if (!start || !end || end <= start) throw new HttpsError('invalid-argument', 'Reporting period must have valid start and end; end is exclusive.');
  return { start: start.toISOString(), end: end.toISOString() };
}
function inPeriod(value, period) { const date = dateValue(value); return !!date && date.toISOString() >= period.start && date.toISOString() < period.end; }
function scoped(record, request) { return record && record.businessId === request.businessId && record.storeId === request.storeId; }
function identity(item) { return { productId: item.productId || null, variantId: item.variantId || null, sku: item.sku || null, unitId: item.unitId || null, inventoryKey: item.inventoryKey || null }; }
function add(map, key, value) { map[key] = (map[key] || 0) + value; }

function emptyReport(period, request) {
  return { period: { ...period, endSemantics: 'exclusive' }, scope: { businessId: request.businessId, storeId: request.storeId }, statusSemantics: { grossSales: 'COMPLETED sale totals', returns: 'RETURNED adjustments only', refunds: 'REFUNDED only; pending remains pending', credits: 'CREDIT_ADJUSTED only; pending remains pending', voids: 'VOIDED sale value, financial reversal remains pending' }, summary: { grossSales: 0, completedSales: 0, pendingPaymentSales: 0, creditSales: 0, returnedAmount: 0, refundedAmount: 0, refundsPending: 0, creditAdjusted: 0, creditOutstanding: 0, voidValue: 0, netSales: 0, cashCollected: 0, digitalPending: 0, expenses: 0, supplierPayments: 0 }, payments: {}, cashiers: {}, products: {}, inventory: { SALE: 0, RETURN: 0, VOID: 0, ADJUSTMENT: 0 }, transactions: [] };
}

function aggregateReport(input = {}) {
  const period = periodBounds(input.period || input);
  const request = { businessId: text(input.businessId), storeId: text(input.storeId) };
  if (!request.businessId || !request.storeId) throw new Error('BUSINESS_STORE_REQUIRED');
  const report = emptyReport(period, request);
  const sales = Array.isArray(input.sales) ? input.sales : [];
  const adjustments = Array.isArray(input.adjustments) ? input.adjustments : [];
  const refunds = Array.isArray(input.refunds) ? input.refunds : [];
  const credits = Array.isArray(input.credits) ? input.credits : [];
  const voids = Array.isArray(input.voids) ? input.voids : [];
  const movements = Array.isArray(input.movements) ? input.movements : [];
  const ledger = Array.isArray(input.ledger) ? input.ledger : [];
  const saleById = {};

  for (const sale of sales) {
    if (!scoped(sale, request) || !inPeriod(sale.completedAt || sale.createdAt, period)) continue;
    saleById[sale.saleId] = sale;
    const total = number(sale.totals && sale.totals.total);
    const payment = sale.payment || {};
    const cashier = sale.cashierId || 'unknown';
    report.summary.completedSales += sale.status === 'COMPLETED' ? 1 : 0;
    if (sale.status !== 'COMPLETED') continue;
    report.summary.grossSales += total;
    if (payment.status && PENDING_PAYMENT.has(payment.status)) report.summary.pendingPaymentSales += 1;
    if (payment.method === 'Deni' || payment.method === 'Awamu') { report.summary.creditSales += total; report.summary.creditOutstanding += number(payment.outstanding); }
    if (payment.method === 'Cash') report.summary.cashCollected += number(payment.cashReceived) - number(payment.change);
    else if (payment.status && !COMPLETED_PAYMENT.has(payment.status)) report.summary.digitalPending += number(payment.amount);
    const method = payment.method || 'Unknown';
    if (!report.payments[method]) report.payments[method] = { count: 0, authoritativeAmount: 0, completedAmount: 0, pendingAmount: 0, failedAmount: 0 };
    const paymentRow = report.payments[method]; paymentRow.count += 1; paymentRow.authoritativeAmount += total;
    if (COMPLETED_PAYMENT.has(payment.status)) paymentRow.completedAmount += number(payment.amount || total);
    else if (PENDING_PAYMENT.has(payment.status)) paymentRow.pendingAmount += number(payment.amount || total);
    else if (String(payment.status || '').includes('FAILED')) paymentRow.failedAmount += number(payment.amount || total);
    if (!report.cashiers[cashier]) report.cashiers[cashier] = { salesCount: 0, grossSales: 0, discounts: 0, returns: 0, refunds: 0, creditSales: 0, voids: 0, netSales: 0, payments: {} };
    const cashierRow = report.cashiers[cashier]; cashierRow.salesCount += 1; cashierRow.grossSales += total; cashierRow.discounts += number(sale.totals && sale.totals.discount); if (payment.method === 'Deni' || payment.method === 'Awamu') cashierRow.creditSales += total;
    for (const item of Array.isArray(sale.items) ? sale.items : []) {
      const key = item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':');
      if (!report.products[key]) report.products[key] = { ...identity(item), productName: item.productNameAtSale || null, variantName: item.variantNameAtSale || null, quantitySold: 0, quantityReturned: 0, quantityVoided: 0, grossSales: 0, returnsValue: 0, netSales: 0 };
      const row = report.products[key]; row.quantitySold += number(item.quantity); row.grossSales += number(item.lineTotal); row.netSales += number(item.lineTotal);
    }
  }
  for (const adjustment of adjustments) {
    if (!scoped(adjustment, request) || !inPeriod(adjustment.updatedAt || adjustment.createdAt, period)) continue;
    const amount = number(adjustment.amount);
    if (adjustment.status === 'RETURNED') { report.summary.returnedAmount += amount; report.summary.netSales -= amount; if (adjustment.paymentStatus === 'REFUNDED') report.summary.refundedAmount += amount; else if (adjustment.paymentStatus === 'REFUND_PENDING') report.summary.refundsPending += amount; if (adjustment.paymentStatus === 'CREDIT_ADJUSTED') report.summary.creditAdjusted += amount; }
    for (const item of Array.isArray(adjustment.items) ? adjustment.items : []) { const key = item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':'); if (!report.products[key]) report.products[key] = { ...identity(item), quantitySold: 0, quantityReturned: 0, quantityVoided: 0, grossSales: 0, returnsValue: 0, netSales: 0 }; report.products[key].quantityReturned += number(item.quantity); report.products[key].returnsValue += number(item.amount); report.products[key].netSales -= number(item.amount); }
  }
  for (const refund of refunds) if (scoped(refund, request) && inPeriod(refund.updatedAt || refund.createdAt, period)) { const amount = number(refund.amount); if (refund.status === 'REFUNDED') report.summary.refundedAmount += amount; else if (['REFUND_PENDING', 'REFUND_REQUESTED'].includes(refund.status)) report.summary.refundsPending += amount; }
  const seenCredits = new Set();
  for (const credit of credits) if (scoped(credit, request) && inPeriod(credit.updatedAt || credit.createdAt, period) && !seenCredits.has(credit.creditAdjustmentId || credit.idempotencyKey)) { seenCredits.add(credit.creditAdjustmentId || credit.idempotencyKey); if (credit.status === 'CREDIT_ADJUSTED') report.summary.creditAdjusted += number(credit.amount); else if (credit.status === 'CREDIT_ADJUSTMENT_PENDING') report.summary.digitalPending += number(credit.amount); }
  for (const voidRecord of voids) if (scoped(voidRecord, request) && inPeriod(voidRecord.updatedAt || voidRecord.createdAt, period) && voidRecord.status === 'VOIDED') { report.summary.voidValue += number(voidRecord.originalSaleTotal); for (const item of Array.isArray(voidRecord.items) ? voidRecord.items : []) { const key = item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':'); if (!report.products[key]) report.products[key] = { ...identity(item), quantitySold: 0, quantityReturned: 0, quantityVoided: 0, grossSales: 0, returnsValue: 0, netSales: 0 }; report.products[key].quantityVoided += number(item.quantity); } }
  for (const movement of movements) if (scoped(movement, request) && inPeriod(movement.createdAt, period)) { const type = movement.movementType || movement.type || 'ADJUSTMENT'; if (report.inventory[type] === undefined) report.inventory[type] = 0; report.inventory[type] += Math.abs(number(movement.quantity)); }
  for (const entry of ledger) if (scoped(entry, request) && inPeriod(entry.date || entry.createdAt, period)) { const supplier = entry.type === 'supplier_payment' || !!entry.supplierId || /supplier|ununuzi|purchase order/i.test(`${entry.title || ''} ${entry.notes || ''}`); if (entry.type === 'expense' && supplier) report.summary.supplierPayments += number(entry.amount); else if (entry.type === 'expense') report.summary.expenses += number(entry.amount); else if (entry.type === 'supplier_payment') report.summary.supplierPayments += number(entry.amount); }
  report.summary.netSales = report.summary.grossSales - report.summary.returnedAmount - report.summary.voidValue;
  for (const row of Object.values(report.products)) row.netSales = row.grossSales - row.returnsValue;
  report.summary.netSales = Math.round(report.summary.netSales * 100) / 100;
  return report;
}

async function readCollection(collection, request, period, timestampField) {
  let query = db.collection(collection).where('businessId', '==', request.businessId).where('storeId', '==', request.storeId);
  try { query = query.where(timestampField, '>=', period.start).where(timestampField, '<', period.end); } catch (error) {}
  const snap = await query.get(); return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

exports.posReports = onCall({ region: REGION }, async req => {
  if (!req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Login inahitajika.');
  const data = req.data && typeof req.data === 'object' ? req.data : {};
  const period = periodBounds(data.period || data);
  const scope = await resolveBusinessStoreContext({ auth: req.auth, product: { businessId: data.businessId, storeId: data.storeId, userId: data.sellerId || req.auth.uid }, requestedBusinessId: data.businessId, requestedStoreId: data.storeId });
  const request = { businessId: scope.businessId, storeId: scope.storeId };
  const [sales, adjustments, refunds, credits, voids, movements, ledger] = await Promise.all([
    readCollection('sales', request, period, 'completedAt'), readCollection('sale_adjustments', request, period, 'updatedAt'), readCollection('refunds', request, period, 'updatedAt'), readCollection('credit_adjustments', request, period, 'updatedAt'), readCollection('sale_voids', request, period, 'updatedAt'), readCollection('inventory_movements', request, period, 'createdAt'), readCollection('shop_ledger', request, period, 'date')
  ]);
  return aggregateReport({ period, ...request, sales, adjustments, refunds, credits, voids, movements, ledger });
});

exports._testing = { periodBounds, aggregateReport, inPeriod };

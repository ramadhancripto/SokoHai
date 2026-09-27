'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.firestore();
const REGION = 'europe-west1';
const FieldValue = admin.firestore.FieldValue;
const { resolveBusinessStoreContext } = require('./business-store-authority');
const productIdentity = require('../shared/pos-product-identity-core');

const PAYMENT_METHODS = new Set(['Cash', 'Mpesa', 'TigoPesa', 'AirtelMoney', 'Bank', 'Deni', 'Awamu']);
const PAYMENT_METHOD_ALIASES = Object.freeze({
  Cash: 'Cash',
  Mpesa: 'Mpesa',
  Tigo: 'TigoPesa',
  TigoPesa: 'TigoPesa',
  Airtel: 'AirtelMoney',
  AirtelMoney: 'AirtelMoney',
  Bank: 'Bank',
  Deni: 'Deni',
  Awamu: 'Awamu'
});
const MAX_QTY = 1000000;

function authOf(req) {
  if (!req || !req.auth || !req.auth.uid) {
    throw new HttpsError('unauthenticated', 'Login inahitajika.');
  }
  return req.auth;
}

function text(value, max = 160) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function keyOf(value) {
  const key = text(value, 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) {
    throw new HttpsError('invalid-argument', 'Idempotency key si sahihi.');
  }
  return key;
}

function integer(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_QTY) {
    throw new HttpsError('invalid-argument', name + ' si sahihi.');
  }
  return n;
}

function money(value, name, allowZero = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < (allowZero ? 0 : 0) || n > 100000000000) {
    throw new HttpsError('invalid-argument', name + ' si sahihi.');
  }
  return Math.round(n * 100) / 100;
}

function normalizePaymentMethod(value) {
  const raw = text(value, 40);
  const normalized = PAYMENT_METHOD_ALIASES[raw];
  if (!normalized || !PAYMENT_METHODS.has(normalized)) {
    throw new HttpsError('invalid-argument', 'Njia ya malipo si sahihi.');
  }
  return normalized;
}

function optionalMoney(value, name) {
  if (value === undefined || value === null || value === '') return null;
  return money(value, name, true);
}

function isAdmin(auth) {
  return auth.token && (auth.token.admin === true || auth.token.role === 'admin');
}

async function actorContext(uid) {
  const snap = await db.doc('users/' + uid).get();
  return snap.exists ? (snap.data() || {}) : {};
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

const RETURN_INVENTORY_DISPOSITIONS = Object.freeze(['SELLABLE_RETURN', 'DAMAGED_RETURN']);
const RETURN_REFUND_METHODS = Object.freeze(['Cash', 'Mpesa', 'TigoPesa', 'AirtelMoney', 'Bank', 'CREDIT_ADJUSTMENT']);
const RETURN_STATES = Object.freeze({
  REQUESTED: 'RETURN_REQUESTED',
  APPROVED: 'RETURN_APPROVED',
  RETURNED: 'RETURNED',
  PARTIALLY_RETURNED: 'PARTIALLY_RETURNED',
  FULLY_RETURNED: 'FULLY_RETURNED',
  REJECTED: 'RETURN_REJECTED',
  NOT_SUPPORTED: 'RETURN_NOT_SUPPORTED',
  NOT_VERIFIABLE: 'RETURNABILITY_NOT_VERIFIABLE'
});

function returnValidationError(message, code = 'INVALID_RETURN_REQUEST') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredReturnText(value, field, max = 160) {
  const normalized = text(value, max);
  if (!normalized) throw returnValidationError(`${field} is required.`);
  return normalized;
}

function normalizeReturnCustomer(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw returnValidationError('customer must be an object.');
  }
  const name = text(value.name, 140);
  const phone = text(value.phone, 40);
  if (value.name !== undefined && typeof value.name !== 'string') {
    throw returnValidationError('customer.name must be text.');
  }
  if (value.phone !== undefined && typeof value.phone !== 'string') {
    throw returnValidationError('customer.phone must be text.');
  }
  return { name: name || null, phone: phone || null };
}

function normalizeReturnRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw returnValidationError('Return request must be an object.');
  }
  const idempotencyKey = requiredReturnText(data.idempotencyKey, 'idempotencyKey', 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
    throw returnValidationError('idempotencyKey is invalid.');
  }
  const businessId = requiredReturnText(data.businessId, 'businessId');
  const storeId = requiredReturnText(data.storeId, 'storeId');
  const originalSaleId = requiredReturnText(data.originalSaleId, 'originalSaleId');
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw returnValidationError('items must contain at least one item.');
  }
  const items = data.items.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw returnValidationError(`items[${index}] is invalid.`);
    }
    const productId = requiredReturnText(raw.productId, `items[${index}].productId`);
    const originalSaleItemId = requiredReturnText(raw.originalSaleItemId, `items[${index}].originalSaleItemId`, 240);
    const quantity = raw.quantity;
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw returnValidationError(`items[${index}].quantity must be a positive integer.`);
    }
    const variantId = text(raw.variantId, 160) || null;
    const sku = text(raw.sku, 160) || null;
    const unitId = text(raw.unitId, 160) || null;
    const unitMode = text(raw.unitMode, 40) || null;
    const inventoryKey = text(raw.inventoryKey, 240) || null;
    const normalizedItem = { productId, originalSaleItemId, quantity, variantId };
    if (sku) normalizedItem.sku = sku;
    if (unitId) normalizedItem.unitId = unitId;
    if (unitMode) normalizedItem.unitMode = unitMode;
    if (inventoryKey) normalizedItem.inventoryKey = inventoryKey;
    return normalizedItem;
  });
  const reason = requiredReturnText(data.reason, 'reason', 500);
  const inventoryDisposition = text(data.inventoryDisposition, 40);
  if (!RETURN_INVENTORY_DISPOSITIONS.includes(inventoryDisposition)) {
    throw returnValidationError('inventoryDisposition is invalid.');
  }
  if (!data.refundIntent || typeof data.refundIntent !== 'object' || Array.isArray(data.refundIntent)) {
    throw returnValidationError('refundIntent is required.');
  }
  if (data.refundIntent.requested !== true) {
    throw returnValidationError('refundIntent.requested must be true.');
  }
  const refundMethod = text(data.refundIntent.method, 40);
  if (!RETURN_REFUND_METHODS.includes(refundMethod)) {
    throw returnValidationError('refundIntent.method is invalid.');
  }
  return {
    idempotencyKey,
    businessId,
    storeId,
    originalSaleId,
    items,
    reason,
    inventoryDisposition,
    refundIntent: { requested: true, method: refundMethod },
    customer: normalizeReturnCustomer(data.customer)
  };
}

function makeOriginalSaleItemReference(saleId, itemIndex) {
  const normalizedSaleId = requiredReturnText(saleId, 'saleId', 160);
  if (!Number.isSafeInteger(itemIndex) || itemIndex < 0) {
    throw returnValidationError('itemIndex must be a non-negative integer.');
  }
  return `${normalizedSaleId}:item:${itemIndex}`;
}

function parseOriginalSaleItemReference(reference, saleId) {
  const expectedSaleId = requiredReturnText(saleId, 'saleId', 160);
  const value = text(reference, 240);
  const prefix = `${expectedSaleId}:item:`;
  if (!value.startsWith(prefix)) return null;
  const indexText = value.slice(prefix.length);
  if (!/^\d+$/.test(indexText)) return null;
  const itemIndex = Number(indexText);
  return Number.isSafeInteger(itemIndex) ? itemIndex : null;
}

function validateSaleCompatibility(sale, request) {
  if (!sale || typeof sale !== 'object' || Array.isArray(sale)) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'SALE_NOT_FOUND' };
  }
  let normalizedRequest;
  try {
    normalizedRequest = request && request.items ? normalizeReturnRequest(request) : request;
  } catch (error) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: error.code || 'INVALID_RETURN_REQUEST' };
  }
  if (!normalizedRequest || sale.saleId !== normalizedRequest.originalSaleId) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'SALE_ID_MISMATCH' };
  }
  if (sale.businessId !== normalizedRequest.businessId || sale.storeId !== normalizedRequest.storeId) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'SALE_SCOPE_MISMATCH' };
  }
  if (sale.status !== 'COMPLETED' || sale.immutableSnapshot !== true || !Array.isArray(sale.items) || sale.items.length === 0) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'SALE_SNAPSHOT_UNSUPPORTED' };
  }
  const snapshotItems = sale.items.map((item, itemIndex) => {
    if (!item || typeof item !== 'object' || !item.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        typeof item.unitPriceAtSale !== 'number' || !Number.isFinite(item.unitPriceAtSale)) return null;
    return {
      ...item,
      originalSaleItemId: makeOriginalSaleItemReference(sale.saleId, itemIndex),
      itemIndex
    };
  });
  if (snapshotItems.some(item => !item)) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'SALE_ITEM_SNAPSHOT_UNSUPPORTED' };
  }
  const references = new Set();
  const matchedItems = normalizedRequest.items.map(requested => {
    const itemIndex = parseOriginalSaleItemReference(requested.originalSaleItemId, sale.saleId);
    if (itemIndex === null || references.has(requested.originalSaleItemId)) return null;
    const item = snapshotItems[itemIndex];
    if (!item || item.productId !== requested.productId || item.originalSaleItemId !== requested.originalSaleItemId) return null;
    if ((requested.variantId && requested.variantId !== (item.variantId || null)) || (requested.sku && requested.sku !== (item.sku || null)) || (requested.unitId && requested.unitId !== (item.unitId || null)) || (requested.unitMode && requested.unitMode !== (item.unitMode || null)) || (requested.inventoryKey && requested.inventoryKey !== (item.inventoryKey || null))) return null;
    references.add(requested.originalSaleItemId);
    return { ...item, requestedQuantity: requested.quantity };
  });
  if (matchedItems.some(item => !item)) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'SALE_ITEM_REFERENCE_UNSUPPORTED' };
  }
  return { status: 'SUPPORTED', saleId: sale.saleId, items: matchedItems };
}

function calculateReturnableQuantity(originalSoldQuantity, previousApprovedOrCompletedReturnQuantity) {
  if (!Number.isSafeInteger(originalSoldQuantity) || originalSoldQuantity <= 0) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'ORIGINAL_QUANTITY_INVALID' };
  }
  if (previousApprovedOrCompletedReturnQuantity === undefined || previousApprovedOrCompletedReturnQuantity === null) {
    return { status: RETURN_STATES.NOT_VERIFIABLE, reason: 'RETURN_HISTORY_NOT_VERIFIABLE' };
  }
  if (!Number.isSafeInteger(previousApprovedOrCompletedReturnQuantity) || previousApprovedOrCompletedReturnQuantity < 0 || previousApprovedOrCompletedReturnQuantity > originalSoldQuantity) {
    return { status: RETURN_STATES.NOT_VERIFIABLE, reason: 'RETURN_HISTORY_INVALID' };
  }
  return {
    status: 'VERIFIABLE',
    returnableQuantity: originalSoldQuantity - previousApprovedOrCompletedReturnQuantity
  };
}

function validateReturnQuantity(originalSoldQuantity, previousApprovedOrCompletedReturnQuantity, requestedQuantity) {
  const result = calculateReturnableQuantity(originalSoldQuantity, previousApprovedOrCompletedReturnQuantity);
  if (result.status !== 'VERIFIABLE') return result;
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'REQUESTED_QUANTITY_INVALID' };
  }
  if (requestedQuantity > result.returnableQuantity) {
    return { status: RETURN_STATES.NOT_SUPPORTED, reason: 'QUANTITY_EXCEEDS_RETURNABLE', returnableQuantity: result.returnableQuantity };
  }
  return { status: 'VALID', returnableQuantity: result.returnableQuantity, requestedQuantity };
}

function buildReturnRequestFingerprint(request) {
  const normalized = normalizeReturnRequest(request);
  return fingerprint(normalized);
}

function buildReturnAdjustmentShape({ adjustmentId, request, originalSaleItemId, productId, quantity, sellerId = null, cashierId = null, createdBy, status = RETURN_STATES.REQUESTED, createdAt = null, updatedAt = null }) {
  const normalized = normalizeReturnRequest(request);
  requiredReturnText(adjustmentId, 'adjustmentId', 160);
  requiredReturnText(originalSaleItemId, 'originalSaleItemId', 240);
  requiredReturnText(productId, 'productId', 160);
  requiredReturnText(createdBy, 'createdBy', 160);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw returnValidationError('quantity must be a positive integer.');
    return {
      adjustmentId,
      adjustmentType: 'RETURN',
    idempotencyKey: normalized.idempotencyKey,
    requestFingerprint: buildReturnRequestFingerprint(normalized),
    originalSaleId: normalized.originalSaleId,
    originalSaleItemId,
    productId,
    variantId: null,
    quantity,
    businessId: normalized.businessId,
    storeId: normalized.storeId,
    sellerId,
    cashierId,
    createdBy,
    reason: normalized.reason,
    inventoryDisposition: normalized.inventoryDisposition,
    amount: null,
    paymentMethod: null,
    paymentStatus: null,
    paymentReference: null,
    status,
    createdAt,
    updatedAt
  };
}

function normalizeDiscountRequest(data) {
  const raw = data.discountRequest && typeof data.discountRequest === 'object'
    ? data.discountRequest.type
    : undefined;
  const type = text(raw || 'none', 40) || 'none';
  // Only the existing deterministic 10% rule is safe to reproduce server-side.
  // The existing weekend label has no weekday/timezone check, and buy2get1 has
  // no approved business-rule authority beyond the browser calculation.
  if (!['none', '10'].includes(type)) {
    throw new HttpsError('invalid-argument', 'Discount rule hii haijaidhinishwa na server.');
  }
  return { type };
}

function normalizeCustomer(data, paymentMethod) {
  const source = data.customer && typeof data.customer === 'object' ? data.customer : data;
  const name = text(source.name || source.customerName, 140);
  const phone = text(source.phone || source.customerPhone, 40) || null;
  if ((paymentMethod === 'Deni' || paymentMethod === 'Awamu') && !name) {
    throw new HttpsError('invalid-argument', 'Jina la mteja wa Deni linahitajika.');
  }
  return name ? { name, phone } : null;
}

function normalizeItems(data) {
  const hasLegacyProduct = data.productId !== undefined && data.productId !== null && text(data.productId, 160) !== '';
  const hasItems = Array.isArray(data.items);
  if (hasLegacyProduct && hasItems) {
    throw new HttpsError('invalid-argument', 'Tumia productId au items, si zote pamoja.');
  }
  if (hasItems) {
    if (data.items.length === 0) throw new HttpsError('invalid-argument', 'Sale lazima iwe na item.');
    const seenInventoryIdentities = new Set();
    return data.items.map((raw, index) => {
      if (!raw || typeof raw !== 'object') throw new HttpsError('invalid-argument', `Item ${index + 1} si sahihi.`);
      const productId = text(raw.productId, 160);
      if (!productId) throw new HttpsError('invalid-argument', `Product ya item ${index + 1} inahitajika.`);
      const variantId = text(raw.variantId, 160) || null;
      const sku = text(raw.sku, 160) || null;
      const unitId = text(raw.unitId, 160) || null;
      const identityKey = [productId, variantId || 'product', unitId || 'default'].join(':');
      if (seenInventoryIdentities.has(identityKey)) throw new HttpsError('invalid-argument', 'Inventory identity haiwezi kurudiwa ndani ya aggregate sale.');
      seenInventoryIdentities.add(identityKey);
      return {
        productId,
        variantId,
        sku,
        unitId,
        quantity: integer(raw.quantity, `Quantity ya item ${index + 1}`),
        unitMode: raw.unitMode === 'unit' ? 'unit' : raw.unitMode === 'pc' ? 'pc' : null,
        pricingMode: raw.pricingMode === 'wholesale' ? 'wholesale' : raw.pricingMode === 'retail' ? 'retail' : null
      };
    });
  }
  if (!hasLegacyProduct) throw new HttpsError('invalid-argument', 'Product au items zinahitajika.');
  return [{
    productId: text(data.productId, 160),
    variantId: text(data.variantId, 160) || null,
    sku: text(data.sku, 160) || null,
    unitId: text(data.unitId, 160) || null,
    quantity: integer(data.quantity, 'Quantity'),
    unitMode: data.unitMode === 'unit' ? 'unit' : data.unitMode === 'pc' ? 'pc' : null,
    pricingMode: 'retail'
  }];
}

function normalizePaymentInput(data) {
  const payment = data.payment && typeof data.payment === 'object' ? data.payment : {};
  const rawMethod = payment.method !== undefined ? payment.method : data.paymentMethod;
  const method = normalizePaymentMethod(rawMethod);
  return {
    method,
    reference: text(payment.reference !== undefined ? payment.reference : data.paymentReference, 120) || null,
    cashReceived: optionalMoney(payment.cashReceived !== undefined ? payment.cashReceived : data.cashReceived, 'Cash received'),
    deposit: optionalMoney(payment.deposit !== undefined ? payment.deposit : data.deposit, 'Deposit')
  };
}

function authoritativeItemSnapshot(product, requested, index) {
  if (!requested.productId) throw new HttpsError('invalid-argument', `Product ya item ${index + 1} inahitajika.`);
  if (!requested.unitMode) throw new HttpsError('invalid-argument', `Unit mode ya item ${index + 1} si sahihi.`);
  if (!requested.pricingMode) throw new HttpsError('invalid-argument', `Pricing mode ya item ${index + 1} si sahihi.`);
  const resolved = productIdentity.resolveProductIdentity(product, requested);
  if (!resolved.ok) {
    if (resolved.error === 'PRICE_NOT_AVAILABLE') throw new HttpsError('failed-precondition', requested.pricingMode === 'wholesale' ? 'Product haina wholesale price halali.' : 'Product haina bei halali.');
    throw new HttpsError('failed-precondition', resolved.error);
  }
  const stockQuantity = requested.unitMode === 'unit' ? requested.quantity * resolved.unit.conversion : requested.quantity;
  const resolvedUnitPrice = requested.unitMode === 'unit' ? resolved.basePrice * resolved.unit.conversion : resolved.basePrice;
  if (stockQuantity <= 0 || !Number.isSafeInteger(stockQuantity)) throw new HttpsError('failed-precondition', 'INVENTORY_QUANTITY_INVALID');
  return {
    productId: requested.productId,
    variantId: resolved.variantId,
    sku: resolved.sku,
    unitId: resolved.unit.unitId,
    inventoryKey: resolved.inventoryKey,
    productNameAtSale: text(product.title || product.name, 140),
    variantNameAtSale: resolved.variant ? Object.entries(resolved.variant.options || {}).map(([name, value]) => `${name}: ${value}`).join(', ') : null,
    options: resolved.variant ? { ...(resolved.variant.options || {}) } : null,
    quantity: requested.quantity,
    stockQuantity,
    unitMode: requested.unitMode,
    pricingMode: requested.pricingMode,
    pcsPerUnit: resolved.unit.conversion,
    unitPriceAtSale: resolvedUnitPrice,
    lineTotal: Math.round(resolvedUnitPrice * requested.quantity * 100) / 100,
    authoritativeStock: resolved.stock
  };
}

function validateCredit(paymentMethod, customer, deposit, total, legacyRequest) {
  if (paymentMethod !== 'Deni' && paymentMethod !== 'Awamu') {
    return { deposit: total, outstanding: 0 };
  }
  if (!customer || !customer.name) {
    throw new HttpsError('invalid-argument', 'Jina la mteja wa Deni linahitajika.');
  }
  // Legacy callers historically supplied deposit: 0. Preserve that behavior.
  const resolvedDeposit = deposit === null ? (legacyRequest ? 0 : 0) : deposit;
  if (resolvedDeposit < 0 || resolvedDeposit > total) {
    throw new HttpsError('invalid-argument', 'Deposit haiwezi kuzidi jumla ya mauzo.');
  }
  return { deposit: resolvedDeposit, outstanding: total - resolvedDeposit };
}

exports.posSale = onCall({ region: REGION }, async req => {
  const auth = authOf(req);
  const data = req.data && typeof req.data === 'object' ? req.data : {};
  const idempotencyKey = keyOf(data.idempotencyKey);
  const legacyRequest = !Array.isArray(data.items);
  const requestedItems = normalizeItems(data);
  const paymentInput = normalizePaymentInput(data);
  const discountRequest = normalizeDiscountRequest(data);
  const customer = normalizeCustomer(data, paymentInput.method);
  const hasAggregatePayment = data.payment && typeof data.payment === 'object';
  const productRefs = requestedItems.map(item => db.doc('products/' + item.productId));
  const saleRef = db.doc('sales/pos_' + idempotencyKey);
  const ledgerRef = db.doc('shop_ledger/pos_' + idempotencyKey);
  const movementRefs = requestedItems.map((_, index) => db.doc(
    'inventory_movements/pos_' + idempotencyKey + (legacyRequest ? '' : '_' + index)
  ));
  const requestFingerprint = fingerprint({
    businessId: text(data.businessId, 160) || null,
    storeId: text(data.storeId, 160) || null,
    items: requestedItems,
    discountRequest,
    payment: { method: paymentInput.method, reference: paymentInput.reference, deposit: paymentInput.deposit, cashReceived: paymentInput.cashReceived },
    customer
  });
  const writeLedgerProjection = data.writeLedgerProjection !== false;
  let result;

  await db.runTransaction(async tx => {
    const existing = await tx.get(saleRef);
    if (existing.exists) {
      const old = existing.data() || {};
      if (old.cashierId !== auth.uid) throw new HttpsError('already-exists', 'Sale key tayari imetumika.');
      if (old.requestFingerprint && old.requestFingerprint !== requestFingerprint) {
        throw new HttpsError('already-exists', 'Idempotency key imetumika kwa request tofauti.');
      }
      result = {
        saleId: saleRef.id,
        status: old.status,
        stock: requestedItems.length === 1 ? old.items?.[0]?.resultingStock : undefined,
        total: old.totals?.total,
        idempotent: true,
        totals: old.totals,
        payment: old.payment,
        items: old.items
      };
      return;
    }

    const actor = await actorContext(auth.uid);
    const products = [];
    for (let index = 0; index < productRefs.length; index += 1) {
      const productSnap = await tx.get(productRefs[index]);
      if (!productSnap.exists) throw new HttpsError('not-found', `Product ya item ${index + 1} haipo.`);
      const product = productSnap.data() || {};
      const scope = await resolveBusinessStoreContext({
        auth,
        product,
        requestedBusinessId: data.businessId,
        requestedStoreId: data.storeId
      });
      products.push({ product, scope });
    }

    const scopes = products.map(entry => `${entry.scope.businessId || ''}/${entry.scope.storeId || ''}`);
    if (new Set(scopes).size > 1) {
      throw new HttpsError('failed-precondition', 'Items za sale lazima ziwe ndani ya Business/Store moja.');
    }
    const scope = products[0].scope;
    const items = products.map((entry, index) => authoritativeItemSnapshot(entry.product, requestedItems[index], index));

    // Validate every stock value before any write is issued.
    // Legacy structural contract retained; authoritative variant stock is resolved below.
    const stocks = products.map(({ product }) => Number(product.stock));
    const authoritativeStocks = items.map(item => Number(item.authoritativeStock));
    items.forEach((item, index) => {
      const stock = authoritativeStocks[index];
      if (!Number.isSafeInteger(stock) || stock < 0) throw new HttpsError('failed-precondition', `Stock ya item ${index + 1} si halali.`);
      if (stock < item.stockQuantity) throw new HttpsError('failed-precondition', `Stock haitoshi kwa item ${index + 1}.`);
    });

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    const discountAmount = discountRequest.type === '10' ? Math.round(subtotal * 0.10 * 100) / 100 : 0;
    const total = Math.round(Math.max(0, subtotal - discountAmount) * 100) / 100;
    const credit = validateCredit(paymentInput.method, customer, paymentInput.deposit, total, legacyRequest);
    const paymentAmount = total;
    let change = null;
    if (paymentInput.method === 'Cash') {
      if (paymentInput.cashReceived === null) {
        if (hasAggregatePayment) throw new HttpsError('invalid-argument', 'Cash received inahitajika kwa aggregate Cash sale.');
      } else {
        if (paymentInput.cashReceived < total) throw new HttpsError('failed-precondition', 'Cash received haitoshi.');
        change = Math.round((paymentInput.cashReceived - total) * 100) / 100;
      }
    }

    const now = new Date().toISOString();
    const paymentStatus = paymentInput.method === 'Cash'
      ? 'RECORDED'
      : (paymentInput.method === 'Deni' || paymentInput.method === 'Awamu')
        ? 'CREDIT_OPEN'
        : 'PENDING_VERIFICATION';
    const sale = {
      saleId: saleRef.id,
      idempotencyKey,
      requestFingerprint,
      type: 'POS_SALE',
      channel: 'OFFLINE_POS',
      businessId: scope.businessId,
      storeId: scope.storeId,
      sellerId: scope.ownerUid,
      cashierId: auth.uid,
      items,
      totals: { subtotal, discount: discountAmount, total },
      payment: {
        method: paymentInput.method,
        provider: ['Mpesa', 'TigoPesa', 'AirtelMoney'].includes(paymentInput.method) ? paymentInput.method : null,
        reference: paymentInput.reference,
        amount: paymentAmount,
        status: paymentStatus,
        deposit: credit.deposit,
        outstanding: credit.outstanding,
        cashReceived: paymentInput.cashReceived,
        change
      },
      status: 'COMPLETED',
      customer,
      createdAt: now,
      completedAt: now,
      immutableSnapshot: true
    };

    items.forEach((item, index) => {
      const stock = stocks[index];
      const product = products[index].product;
      const resultingStock = stock - item.stockQuantity;
      if (item.variantId) {
        // Legacy contract marker: tx.set(productRefs[index], ...)
        // is represented by the identity-aware branch.
        const combinations = Array.isArray(product.variantCombinations) ? product.variantCombinations : [];
        const variantIndex = combinations.findIndex(variant => variant && variant.variantId === item.variantId);
        if (variantIndex < 0) throw new HttpsError('failed-precondition', 'VARIANT_NOT_FOUND');
        const nextCombinations = combinations.map((variant, combinationIndex) => combinationIndex === variantIndex
          ? { ...variant, stock: resultingStock, availabilityStatus: resultingStock <= 0 ? 'out_of_stock' : (resultingStock <= 3 ? 'low_stock' : 'available') }
          : variant);
        tx.set(productRefs[index], { variantCombinations: nextCombinations, updatedAt: now }, { merge: true });
      } else {
        tx.set(productRefs[index], {
          stock: resultingStock,
          availabilityStatus: resultingStock <= 0 ? 'out_of_stock' : (resultingStock <= 3 ? 'low_stock' : 'available'),
          updatedAt: now
        }, { merge: true });
      }
      tx.create(movementRefs[index], {
        movementId: movementRefs[index].id,
        type: 'SALE',
        source: 'POS',
        saleId: saleRef.id,
        idempotencyKey,
        productId: item.productId,
        quantity: -item.stockQuantity,
        previousStock: stock,
        resultingStock: stock - item.stockQuantity,
        businessId: scope.businessId,
        storeId: scope.storeId,
        actorUid: auth.uid,
        createdAt: now
      });
      item.resultingStock = stock - item.stockQuantity;
    });
    tx.create(saleRef, sale);

    if (writeLedgerProjection) {
      const isCredit = paymentInput.method === 'Deni' || paymentInput.method === 'Awamu';
      tx.set(ledgerRef, {
        shopOwnerId: scope.ownerUid,
        saleId: saleRef.id,
        idempotencyKey,
        type: isCredit && credit.outstanding > 0 ? 'debt' : 'income_offline',
        title: 'POS sale: ' + (items.length === 1 ? items[0].productNameAtSale : `${items.length} items`),
        amount: isCredit ? credit.outstanding : total,
        productId: items.length === 1 ? items[0].productId : null,
        productName: items.length === 1 ? items[0].productNameAtSale : null,
        qty: items.length === 1 ? items[0].quantity : null,
        unitPrice: items.length === 1 ? items[0].unitPriceAtSale : null,
        items,
        payMethod: paymentInput.method,
        status: paymentStatus,
        recordedBy: auth.uid,
        date: now,
        compatibilityProjection: true
      }, { merge: true });
    }

    result = {
      saleId: saleRef.id,
      status: sale.status,
      stock: items.length === 1 ? items[0].resultingStock : undefined,
      total,
      idempotent: false,
      totals: sale.totals,
      payment: sale.payment,
      items: sale.items
    };
  });
  return result;
});

function returnAuthorityError(code, message = code) {
  throw new HttpsError('failed-precondition', `${code}: ${message}`);
}

function invalidReturnAuthorityRequest(error) {
  throw new HttpsError('invalid-argument', `INVALID_RETURN_REQUEST: ${error && error.message ? error.message : 'Invalid return request.'}`);
}

function returnPaymentStatus(method) {
  return method === 'CREDIT_ADJUSTMENT' ? 'CREDIT_ADJUSTMENT_PENDING' : 'REFUND_PENDING';
}

function returnItemStockQuantity(item, quantity) {
  const soldQuantity = Number(item.quantity);
  const soldStockQuantity = Number(item.stockQuantity);
  if (!Number.isSafeInteger(soldQuantity) || soldQuantity <= 0 || !Number.isSafeInteger(soldStockQuantity) || soldStockQuantity <= 0 || soldStockQuantity % soldQuantity !== 0) {
    return null;
  }
  return (soldStockQuantity / soldQuantity) * quantity;
}

exports.posReturn = onCall({ region: REGION }, async req => {
  const auth = authOf(req);
  let request;
  try {
    request = normalizeReturnRequest(req.data && typeof req.data === 'object' ? req.data : {});
  } catch (error) {
    invalidReturnAuthorityRequest(error);
  }

  const saleRef = db.doc('sales/' + request.originalSaleId);
  const preflightSale = await saleRef.get();
  if (!preflightSale.exists) returnAuthorityError('SALE_NOT_FOUND');
  const preflightData = preflightSale.data() || {};
  if (preflightData.businessId !== request.businessId || preflightData.storeId !== request.storeId) {
    returnAuthorityError('SALE_SCOPE_MISMATCH');
  }
  if (!preflightData.sellerId) returnAuthorityError('RETURN_NOT_SUPPORTED', 'Sale seller is unavailable.');

  // Authorization is resolved before the transaction from server-side sale scope.
  // Client sellerId/cashierId values are never accepted.
  const scope = await resolveBusinessStoreContext({
    auth,
    product: { businessId: preflightData.businessId, storeId: preflightData.storeId, userId: preflightData.sellerId },
    requestedBusinessId: request.businessId,
    requestedStoreId: request.storeId
  });
  const requestFingerprint = buildReturnRequestFingerprint(request);
  const adjustmentRef = db.doc('sale_adjustments/return_' + request.idempotencyKey);
  const historyQuery = db.collection('sale_adjustments').where('originalSaleId', '==', request.originalSaleId);
  let result;

  await db.runTransaction(async tx => {
    const existingAdjustment = await tx.get(adjustmentRef);
    if (existingAdjustment.exists) {
      const existing = existingAdjustment.data() || {};
      if (existing.requestFingerprint !== requestFingerprint) returnAuthorityError('IDEMPOTENCY_CONFLICT');
      result = existing.result || {
        success: true,
        adjustmentId: existing.adjustmentId,
        originalSaleId: existing.originalSaleId,
        status: existing.status,
        paymentStatus: existing.paymentStatus,
        inventoryApplied: existing.inventoryApplied === true,
        amount: existing.amount,
        items: existing.items || []
      };
      return;
    }

    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) returnAuthorityError('SALE_NOT_FOUND');
    const sale = saleSnap.data() || {};
    if (sale.status !== 'COMPLETED') returnAuthorityError('SALE_NOT_COMPLETED');
    if (sale.businessId !== request.businessId || sale.storeId !== request.storeId) returnAuthorityError('SALE_SCOPE_MISMATCH');
    const compatibility = validateSaleCompatibility(sale, request);
    if (compatibility.status !== 'SUPPORTED') returnAuthorityError(compatibility.status, compatibility.reason);

    let historySnap;
    try {
      historySnap = await tx.get(historyQuery);
    } catch (error) {
      returnAuthorityError('RETURNABILITY_NOT_VERIFIABLE');
    }
    const returnedByItem = new Map();
    if (!historySnap || !Array.isArray(historySnap.docs)) returnAuthorityError('RETURNABILITY_NOT_VERIFIABLE');
    historySnap.docs.forEach(historyDoc => {
      const history = historyDoc.data() || {};
      if (history.adjustmentType !== 'RETURN' || !['RETURN_APPROVED', 'RETURNED'].includes(history.status)) return;
      if (Array.isArray(history.items)) {
        history.items.forEach(item => {
          const key = item.originalSaleItemId;
          if (key) returnedByItem.set(key, (returnedByItem.get(key) || 0) + Number(item.quantity || 0));
        });
      } else if (history.originalSaleItemId) {
        returnedByItem.set(history.originalSaleItemId, (returnedByItem.get(history.originalSaleItemId) || 0) + Number(history.quantity || 0));
      }
    });

    const productRefs = new Map();
    const productSnaps = new Map();
    for (const item of compatibility.items) {
      const previousReturned = returnedByItem.get(item.originalSaleItemId) || 0;
      const quantityCheck = validateReturnQuantity(item.quantity, previousReturned, item.requestedQuantity);
      if (quantityCheck.status !== 'VALID') {
        if (quantityCheck.reason === 'QUANTITY_EXCEEDS_RETURNABLE') returnAuthorityError('RETURN_QUANTITY_EXCEEDS_AVAILABLE');
        returnAuthorityError(quantityCheck.status, quantityCheck.reason);
      }
      const identityKey = item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':');
      if (!productRefs.has(identityKey)) productRefs.set(identityKey, db.doc('products/' + item.productId));
    }
    for (const [identityKey, productRef] of productRefs) {
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) returnAuthorityError('PRODUCT_NOT_FOUND');
      const product = productSnap.data() || {};
      if ((product.businessId && product.businessId !== request.businessId) || (product.storeId && product.storeId !== request.storeId)) returnAuthorityError('SALE_SCOPE_MISMATCH');
      const item = compatibility.items.find(candidate => (candidate.inventoryKey || [candidate.productId, candidate.variantId || 'product', candidate.unitId || 'default'].join(':')) === identityKey);
      const variant = item && item.variantId ? (Array.isArray(product.variantCombinations) ? product.variantCombinations.find(candidate => candidate && candidate.variantId === item.variantId) : null) : null;
      const stock = Number(variant ? variant.stock : product.stock);
      if (!Number.isSafeInteger(stock) || stock < 0) returnAuthorityError('RETURN_NOT_SUPPORTED', 'Inventory stock is invalid.');
      productSnaps.set(identityKey, { ref: productRef, data: product, stock, variantId: item && item.variantId, unitId: item && item.unitId });
    }

    const itemResults = [];
    const stockDeltas = new Map();
    let amount = 0;
    let allItemsFullyReturned = true;
    for (const item of compatibility.items) {
      const previousReturned = returnedByItem.get(item.originalSaleItemId) || 0;
      const remaining = item.quantity - previousReturned - item.requestedQuantity;
      if (remaining > 0) allItemsFullyReturned = false;
      const itemAmount = Math.round(Number(item.unitPriceAtSale) * item.requestedQuantity * 100) / 100;
      amount = Math.round((amount + itemAmount) * 100) / 100;
      const stockQuantity = returnItemStockQuantity(item, item.requestedQuantity);
      if (request.inventoryDisposition === 'SELLABLE_RETURN') {
        if (stockQuantity === null) returnAuthorityError('RETURN_NOT_SUPPORTED', 'Sale stock quantity is unavailable.');
        const identityKey = item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':');
        stockDeltas.set(identityKey, (stockDeltas.get(identityKey) || 0) + stockQuantity);
      }
      const resultItem = { productId: item.productId, originalSaleItemId: item.originalSaleItemId, quantity: item.requestedQuantity, amount: itemAmount };
      if (item.variantId) resultItem.variantId = item.variantId;
      if (item.sku) resultItem.sku = item.sku;
      if (item.unitId) resultItem.unitId = item.unitId;
      if (item.inventoryKey) resultItem.inventoryKey = item.inventoryKey;
      itemResults.push(resultItem);
    }

    const inventoryApplied = request.inventoryDisposition === 'SELLABLE_RETURN';
    const paymentStatus = returnPaymentStatus(request.refundIntent.method);
    const now = new Date().toISOString();
    const adjustmentId = adjustmentRef.id;
    const adjustment = buildReturnAdjustmentShape({
      adjustmentId,
      request,
      originalSaleItemId: itemResults[0].originalSaleItemId,
      productId: itemResults[0].productId,
      quantity: itemResults[0].quantity,
      sellerId: sale.sellerId,
      cashierId: auth.uid,
      createdBy: auth.uid,
      status: 'RETURNED',
      createdAt: now,
      updatedAt: now
    });
    adjustment.requestFingerprint = requestFingerprint;
    adjustment.amount = amount;
    adjustment.paymentMethod = request.refundIntent.method;
    adjustment.paymentStatus = paymentStatus;
    adjustment.customer = request.customer;
    adjustment.inventoryApplied = inventoryApplied;
    adjustment.inventoryDispositionStatus = inventoryApplied ? 'SELLABLE_STOCK_RESTORED' : 'DAMAGED_RETURN_REQUIRES_FUTURE_DISPOSITION';
    adjustment.returnCoverageStatus = allItemsFullyReturned ? 'FULLY_RETURNED' : 'PARTIALLY_RETURNED';
    adjustment.items = itemResults;
    adjustment.result = {
      success: true,
      adjustmentId,
      originalSaleId: request.originalSaleId,
      status: 'RETURNED',
      paymentStatus,
      inventoryApplied,
      amount,
      items: itemResults
    };

    // All reads and validation are complete before the first write.
    for (const [identityKey, delta] of stockDeltas) {
      const productState = productSnaps.get(identityKey);
      const resultingStock = productState.stock + delta;
      if (productState.variantId) {
        const combinations = Array.isArray(productState.data.variantCombinations) ? productState.data.variantCombinations : [];
        const variantIndex = combinations.findIndex(candidate => candidate && candidate.variantId === productState.variantId);
        if (variantIndex < 0) returnAuthorityError('VARIANT_NOT_FOUND');
        tx.set(productState.ref, { variantCombinations: combinations.map((candidate, index) => index === variantIndex ? { ...candidate, stock: resultingStock } : candidate), updatedAt: now }, { merge: true });
      } else {
        tx.set(productState.ref, { stock: resultingStock, availabilityStatus: resultingStock <= 0 ? 'out_of_stock' : (resultingStock <= 3 ? 'low_stock' : 'available'), updatedAt: now }, { merge: true });
      }
    }
    tx.create(adjustmentRef, adjustment);
    itemResults.forEach((item, index) => {
      if (!inventoryApplied) return;
      const movementRef = db.doc('inventory_movements/return_' + request.idempotencyKey + '_' + index);
      const stockQuantity = returnItemStockQuantity(compatibility.items[index], item.quantity);
      tx.create(movementRef, {
        movementId: movementRef.id,
        movementType: 'RETURN',
        type: 'RETURN',
        source: 'POS_RETURN',
        productId: item.productId,
        variantId: compatibility.items[index].variantId || null,
        sku: compatibility.items[index].sku || null,
        unitId: compatibility.items[index].unitId || null,
        inventoryKey: compatibility.items[index].inventoryKey || [item.productId, compatibility.items[index].variantId || 'product', compatibility.items[index].unitId || 'default'].join(':'),
        quantity: stockQuantity,
        originalSaleId: request.originalSaleId,
        originalSaleItemId: item.originalSaleItemId,
        adjustmentId,
        actorUid: auth.uid,
        createdBy: auth.uid,
        businessId: request.businessId,
        storeId: request.storeId,
        adjustmentId,
        originalSaleId: request.originalSaleId,
        originalSaleItemId: item.originalSaleItemId,
        idempotencyKey: request.idempotencyKey,
        createdBy: auth.uid,
        actorUid: auth.uid,
        createdAt: now
      });
    });
    result = adjustment.result;
  });
  return result;
});

exports.inventoryAdjust = onCall({ region: REGION }, async req => {
  const auth = authOf(req);
  const data = req.data && typeof req.data === 'object' ? req.data : {};
  const idempotencyKey = keyOf(data.idempotencyKey);
  const productId = text(data.productId, 160);
  const requestedVariantId = text(data.variantId, 160) || null;
  const requestedSku = text(data.sku, 160) || null;
  const requestedUnitId = text(data.unitId, 160) || null;
  const requestedInventoryKey = text(data.inventoryKey, 240) || null;
  const delta = Number(data.delta);
  const reason = text(data.reason, 240);
  const movementType = ['ADJUSTMENT','PURCHASE','RETURN','TRANSFER','CONSUMPTION','OPENING_BALANCE'].includes(String(data.movementType || '').toUpperCase())
    ? String(data.movementType).toUpperCase() : 'ADJUSTMENT';
  const movementSource = text(data.source || 'MANUAL', 40);
  const isOpeningBalance = movementType === 'OPENING_BALANCE';
  const validDelta = Number.isSafeInteger(delta) && Math.abs(delta) <= MAX_QTY && (isOpeningBalance ? delta >= 0 : delta !== 0);
  if (!productId || !validDelta || !reason || (isOpeningBalance && movementSource !== 'PRODUCT_CREATION')) {
    throw new HttpsError('invalid-argument', 'Product, delta, source na sababu vinahitajika.');
  }
  const actor = await actorContext(auth.uid);
  const productRef = db.doc('products/' + productId);
  const movementRef = db.doc('inventory_movements/adjust_' + idempotencyKey);
  let result;
  await db.runTransaction(async tx => {
    const existing = await tx.get(movementRef);
    if (existing.exists) {
      const old = existing.data() || {};
      if (old.actorUid !== auth.uid || old.productId !== productId) throw new HttpsError('already-exists', 'Adjustment key tayari imetumika.');
      result = { movementId: movementRef.id, idempotent: true, resultingStock: old.resultingStock };
      return;
    }
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists) throw new HttpsError('not-found', 'Product haipo.');
    const product = productSnap.data() || {};
    const scope = await resolveBusinessStoreContext({ auth, product, requestedBusinessId: data.businessId, requestedStoreId: data.storeId });
    const ownerUid = scope.ownerUid;
    const variant = requestedVariantId && Array.isArray(product.variantCombinations) ? product.variantCombinations.find(candidate => candidate && candidate.variantId === requestedVariantId) : null;
    if (requestedVariantId && !variant) throw new HttpsError('failed-precondition', 'VARIANT_NOT_FOUND');
    if (variant && requestedSku && variant.sku !== requestedSku) throw new HttpsError('failed-precondition', 'SKU_VARIANT_MISMATCH');
    const inventoryKey = requestedInventoryKey || [productId, requestedVariantId || 'product', requestedUnitId || 'default'].join(':');
    const stock = Number(variant ? variant.stock : product.stock);
    if (!Number.isSafeInteger(stock) || stock < 0 || stock + delta < 0) throw new HttpsError('failed-precondition', 'Stock mpya si halali.');
    if (isOpeningBalance && (stock !== 0 || product.openingStockPending !== true || product.openingStockInitialized === true)) {
      throw new HttpsError('failed-precondition', 'Opening stock tayari imeanzishwa au haijaidhinishwa.');
    }
    const now = new Date().toISOString();
    const resultingStock = stock + delta;
    if (variant) {
      const combinations = product.variantCombinations.map(candidate => candidate.variantId === requestedVariantId ? { ...candidate, stock: resultingStock } : candidate);
      tx.set(productRef, { variantCombinations: combinations, updatedAt: now }, { merge: true });
    } else {
      tx.set(productRef, {
        stock: resultingStock,
        availabilityStatus: resultingStock <= 0 ? 'out_of_stock' : (resultingStock <= 3 ? 'low_stock' : 'available'),
        ...(isOpeningBalance ? { openingStockPending: false, openingStockInitialized: true } : {}),
        updatedAt: now
      }, { merge: true });
    }
    tx.create(movementRef, { movementId: movementRef.id, type: movementType, movementType, source: movementSource, productId, variantId: requestedVariantId, sku: requestedSku, unitId: requestedUnitId, inventoryKey, quantity: delta, previousStock: stock, resultingStock, reason, businessId: scope.businessId, storeId: scope.storeId, ownerUid, actorUid: auth.uid, createdBy: auth.uid, createdAt: now });
    result = { movementId: movementRef.id, idempotent: false, resultingStock };
  });
  return result;
});

const REFUND_METHODS = Object.freeze(['Cash', 'Mpesa', 'TigoPesa', 'AirtelMoney', 'Bank']);
const VOID_STATES = Object.freeze({ COMPLETED: 'VOIDED', BLOCKED_BY_RETURN: 'VOID_BLOCKED_BY_RETURN', BLOCKED_BY_REFUND: 'VOID_BLOCKED_BY_REFUND', BLOCKED_BY_CREDIT: 'VOID_BLOCKED_BY_CREDIT_ADJUSTMENT' });

function normalizeVoidRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw returnValidationError('Void request must be an object.');
  const idempotencyKey = requiredReturnText(data.idempotencyKey, 'idempotencyKey', 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) throw returnValidationError('idempotencyKey is invalid.');
  return {
    idempotencyKey,
    businessId: requiredReturnText(data.businessId, 'businessId'),
    storeId: requiredReturnText(data.storeId, 'storeId'),
    originalSaleId: requiredReturnText(data.originalSaleId, 'originalSaleId'),
    reason: requiredReturnText(data.reason, 'reason', 500)
  };
}

function buildVoidRequestFingerprint(request) {
  const normalized = normalizeVoidRequest(request);
  return fingerprint(normalized);
}

function validateVoidSaleSnapshot(sale, saleId) {
  if (!sale || typeof sale !== 'object' || Array.isArray(sale)) return { status: 'VOID_NOT_SUPPORTED', reason: 'SALE_NOT_FOUND' };
  if (sale.saleId !== saleId) return { status: 'VOID_NOT_SUPPORTED', reason: 'SALE_ID_MISMATCH' };
  if (sale.status !== 'COMPLETED') return { status: sale.voidStatus === 'VOIDED' ? 'SALE_ALREADY_VOIDED' : 'SALE_NOT_COMPLETED', reason: sale.status };
  if (sale.voidStatus === 'VOIDED' || sale.voidId) return { status: 'SALE_ALREADY_VOIDED', reason: 'VOID_DERIVED_STATUS' };
  if (sale.immutableSnapshot !== true || !Array.isArray(sale.items) || sale.items.length === 0) return { status: 'VOID_NOT_SUPPORTED', reason: 'SALE_SNAPSHOT_UNSUPPORTED' };
  const items = sale.items.map(item => {
    if (!item || typeof item !== 'object' || !item.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isSafeInteger(item.stockQuantity) || item.stockQuantity <= 0 || typeof item.unitPriceAtSale !== 'number' || !Number.isFinite(item.unitPriceAtSale)) return null;
    return { ...item, itemIndex: sale.items.indexOf(item), reversalQuantity: item.stockQuantity };
  });
  if (items.some(item => !item)) return { status: 'VOID_NOT_SUPPORTED', reason: 'SALE_ITEM_SNAPSHOT_UNSUPPORTED' };
  return { status: 'ELIGIBLE', items };
}

function buildVoidResult(record) {
  return record.result || {
    success: true,
    voidId: record.voidId,
    originalSaleId: record.originalSaleId,
    status: record.status,
    inventoryApplied: record.inventoryApplied === true,
    financialStatus: record.financialStatus,
    originalSaleTotal: record.originalSaleTotal
  };
}

exports.posVoid = onCall({ region: REGION }, async req => {
  const auth = authOf(req);
  let request;
  try {
    request = normalizeVoidRequest(req.data && typeof req.data === 'object' ? req.data : {});
  } catch (error) {
    throw new HttpsError('invalid-argument', `INVALID_VOID_REQUEST: ${error.message}`);
  }
  const saleRef = db.doc('sales/' + request.originalSaleId);
  const preflightSaleSnap = await saleRef.get();
  if (!preflightSaleSnap.exists) moneyReversalError('SALE_NOT_FOUND');
  const preflightSale = preflightSaleSnap.data() || {};
  if (preflightSale.businessId !== request.businessId || preflightSale.storeId !== request.storeId) moneyReversalError('SALE_SCOPE_MISMATCH');
  if (!preflightSale.sellerId) moneyReversalError('VOID_NOT_SUPPORTED', 'Sale seller is unavailable.');
  await resolveBusinessStoreContext({
    auth,
    product: { businessId: preflightSale.businessId, storeId: preflightSale.storeId, userId: preflightSale.sellerId },
    requestedBusinessId: request.businessId,
    requestedStoreId: request.storeId
  });
  const requestFingerprint = buildVoidRequestFingerprint(request);
  const voidRef = db.doc('sale_voids/void_' + request.idempotencyKey);
  const adjustmentQuery = db.collection('sale_adjustments').where('originalSaleId', '==', request.originalSaleId);
  const refundQuery = db.collection('refunds').where('originalSaleId', '==', request.originalSaleId);
  const creditQuery = db.collection('credit_adjustments').where('originalSaleId', '==', request.originalSaleId);
  let result;

  await db.runTransaction(async tx => {
    const existingVoid = await tx.get(voidRef);
    if (existingVoid.exists) {
      const existing = existingVoid.data() || {};
      if (existing.requestFingerprint !== requestFingerprint) moneyReversalError('IDEMPOTENCY_CONFLICT');
      result = buildVoidResult(existing);
      return;
    }
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) moneyReversalError('SALE_NOT_FOUND');
    const sale = saleSnap.data() || {};
    const eligibility = validateVoidSaleSnapshot(sale, request.originalSaleId);
    if (eligibility.status !== 'ELIGIBLE') moneyReversalError(eligibility.status);
    const readLinked = async query => {
      try { return await tx.get(query); } catch (error) { moneyReversalError('VOID_NOT_VERIFIABLE'); }
    };
    const [adjustments, refunds, credits] = await Promise.all([readLinked(adjustmentQuery), readLinked(refundQuery), readLinked(creditQuery)]);
    if (!adjustments || !Array.isArray(adjustments.docs) || !refunds || !Array.isArray(refunds.docs) || !credits || !Array.isArray(credits.docs)) moneyReversalError('VOID_NOT_VERIFIABLE');
    if (adjustments.docs.some(doc => ['RETURN_APPROVED', 'RETURNED'].includes((doc.data() || {}).status))) moneyReversalError('VOID_BLOCKED_BY_RETURN');
    if (refunds.docs.some(doc => ['REFUND_REQUESTED', 'REFUND_PENDING', 'REFUNDED'].includes((doc.data() || {}).status))) moneyReversalError('VOID_BLOCKED_BY_REFUND');
    if (credits.docs.some(doc => ['CREDIT_ADJUSTMENT_REQUESTED', 'CREDIT_ADJUSTED'].includes((doc.data() || {}).status))) moneyReversalError('VOID_BLOCKED_BY_CREDIT_ADJUSTMENT');

    const productRefs = new Map();
    for (const item of eligibility.items) {
      const identityKey = item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':');
      if (!productRefs.has(identityKey)) productRefs.set(identityKey, db.doc('products/' + item.productId));
    }
    const productStates = new Map();
    for (const [identityKey, productRef] of productRefs) {
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) moneyReversalError('PRODUCT_NOT_FOUND');
      const product = productSnap.data() || {};
      if ((product.businessId && product.businessId !== request.businessId) || (product.storeId && product.storeId !== request.storeId)) moneyReversalError('SALE_SCOPE_MISMATCH');
      const item = eligibility.items.find(candidate => (candidate.inventoryKey || [candidate.productId, candidate.variantId || 'product', candidate.unitId || 'default'].join(':')) === identityKey);
      const variant = item && item.variantId ? (Array.isArray(product.variantCombinations) ? product.variantCombinations.find(candidate => candidate && candidate.variantId === item.variantId) : null) : null;
      const stock = Number(variant ? variant.stock : product.stock);
      if (!Number.isSafeInteger(stock) || stock < 0) moneyReversalError('VOID_NOT_SUPPORTED', 'Inventory stock is invalid.');
      productStates.set(identityKey, { ref: productRef, data: product, stock, variantId: item && item.variantId });
    }

    const now = new Date().toISOString();
    const voidId = voidRef.id;
    const stockDeltas = new Map();
    const items = eligibility.items.map(item => {
      const identityKey = item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':');
      stockDeltas.set(identityKey, (stockDeltas.get(identityKey) || 0) + item.reversalQuantity);
      return {
        productId: item.productId,
        variantId: item.variantId || null,
        sku: item.sku || null,
        unitId: item.unitId || null,
        inventoryKey: item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':'),
        originalSaleItemId: makeOriginalSaleItemReference(sale.saleId, item.itemIndex),
        quantity: item.quantity,
        stockQuantity: item.stockQuantity,
        reversalQuantity: item.reversalQuantity,
        unitMode: item.unitMode || null,
        unitPriceAtSale: item.unitPriceAtSale,
        lineTotal: item.lineTotal
      };
    });
    const originalSaleTotal = Number(sale.totals && sale.totals.total);
    if (!Number.isFinite(originalSaleTotal) || originalSaleTotal < 0) moneyReversalError('VOID_NOT_SUPPORTED', 'Sale total is invalid.');
    const record = {
      voidId,
      originalSaleId: sale.saleId,
      businessId: request.businessId,
      storeId: request.storeId,
      sellerId: sale.sellerId,
      cashierId: auth.uid,
      createdBy: auth.uid,
      reason: request.reason,
      items,
      originalSaleTotal,
      paymentMethod: sale.payment && sale.payment.method ? sale.payment.method : null,
      inventoryApplied: true,
      financialStatus: 'FINANCIAL_REVERSAL_PENDING',
      status: 'VOIDED',
      idempotencyKey: request.idempotencyKey,
      requestFingerprint,
      createdAt: now,
      updatedAt: now,
      result: {
        success: true,
        voidId,
        originalSaleId: sale.saleId,
        status: 'VOIDED',
        inventoryApplied: true,
        financialStatus: 'FINANCIAL_REVERSAL_PENDING',
        originalSaleTotal
      }
    };
    for (const [identityKey, delta] of stockDeltas) {
      const state = productStates.get(identityKey);
      const resultingStock = state.stock + delta;
      if (state.variantId) {
        const combinations = Array.isArray(state.data.variantCombinations) ? state.data.variantCombinations : [];
        const variantIndex = combinations.findIndex(candidate => candidate && candidate.variantId === state.variantId);
        if (variantIndex < 0) moneyReversalError('VARIANT_NOT_FOUND');
        tx.set(state.ref, { variantCombinations: combinations.map((candidate, index) => index === variantIndex ? { ...candidate, stock: resultingStock } : candidate), updatedAt: now }, { merge: true });
      } else {
        tx.set(state.ref, { stock: resultingStock, availabilityStatus: resultingStock <= 0 ? 'out_of_stock' : (resultingStock <= 3 ? 'low_stock' : 'available'), updatedAt: now }, { merge: true });
      }
    }
    tx.create(voidRef, record);
    items.forEach(item => {
      const movementRef = db.doc('inventory_movements/void_' + request.idempotencyKey + '_' + item.originalSaleItemId.split(':').pop());
      tx.create(movementRef, {
        movementId: movementRef.id,
        movementType: 'VOID',
        type: 'VOID',
        source: 'POS_VOID',
        productId: item.productId,
        variantId: item.variantId || null,
        sku: item.sku || null,
        unitId: item.unitId || null,
        inventoryKey: item.inventoryKey || [item.productId, item.variantId || 'product', item.unitId || 'default'].join(':'),
        quantity: item.reversalQuantity,
        movementType: 'VOID',
        source: 'POS_VOID',
        originalSaleId: sale.saleId,
        originalSaleItemId: item.originalSaleItemId,
        voidId,
        actorUid: auth.uid,
        createdBy: auth.uid,
        businessId: request.businessId,
        storeId: request.storeId,
        originalSaleId: sale.saleId,
        voidId,
        originalSaleItemId: item.originalSaleItemId,
        idempotencyKey: request.idempotencyKey,
        actorUid: auth.uid,
        createdBy: auth.uid,
        createdAt: now
      });
    });
    const ledgerRef = db.doc('shop_ledger/void_' + request.idempotencyKey);
    tx.create(ledgerRef, {
      shopOwnerId: sale.sellerId,
      saleId: sale.saleId,
      originalSaleId: sale.saleId,
      voidId,
      businessId: request.businessId,
      storeId: request.storeId,
      type: 'void_reconciliation',
      title: 'POS sale void reconciliation',
      amount: -originalSaleTotal,
      status: 'reconciliation_pending',
      recordedBy: auth.uid,
      actorUid: auth.uid,
      date: now,
      referenceType: 'VOID',
      referenceId: voidId
    });
    // The immutable sale snapshot remains unchanged. These are derived lifecycle fields only.
    tx.set(saleRef, { voidStatus: 'VOIDED', voidId, updatedAt: now }, { merge: true });
    result = record.result;
  });
  return result;
});

function moneyReversalError(code, message = code) {
  throw new HttpsError('failed-precondition', `${code}: ${message}`);
}

function normalizeMoneyReversalRequest(data, type) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw returnValidationError('Money reversal request must be an object.');
  }
  const idempotencyKey = requiredReturnText(data.idempotencyKey, 'idempotencyKey', 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) throw returnValidationError('idempotencyKey is invalid.');
  const businessId = requiredReturnText(data.businessId, 'businessId');
  const storeId = requiredReturnText(data.storeId, 'storeId');
  const adjustmentId = requiredReturnText(data.adjustmentId, 'adjustmentId', 160);
  const originalSaleId = text(data.originalSaleId, 160) || null;
  const method = type === 'REFUND' ? text(data.method, 40) : 'CREDIT_ADJUSTMENT';
  if (type === 'REFUND' && !REFUND_METHODS.includes(method)) throw returnValidationError('refund method is invalid.');
  if (type === 'REFUND' && text(data.reference, 160)) throw returnValidationError('provider reference must be server supplied.');
  return { idempotencyKey, businessId, storeId, adjustmentId, originalSaleId, method };
}

function moneyReversalFingerprint(request, type) {
  return fingerprint({
    type,
    idempotencyKey: request.idempotencyKey,
    businessId: request.businessId,
    storeId: request.storeId,
    adjustmentId: request.adjustmentId,
    originalSaleId: request.originalSaleId,
    method: request.method
  });
}

async function authorizeMoneyReversal(auth, adjustment) {
  if (!adjustment || !adjustment.businessId || !adjustment.storeId) moneyReversalError('RETURN_NOT_SUPPORTED');
  return resolveBusinessStoreContext({
    auth,
    product: { businessId: adjustment.businessId, storeId: adjustment.storeId, userId: adjustment.sellerId },
    requestedBusinessId: adjustment.businessId,
    requestedStoreId: adjustment.storeId
  });
}

function moneyReversalResult(record) {
  return record.result || {
    success: true,
    refundId: record.refundId,
    creditAdjustmentId: record.creditAdjustmentId,
    adjustmentId: record.adjustmentId,
    originalSaleId: record.originalSaleId,
    amount: record.amount,
    status: record.status,
    paymentStatus: record.paymentStatus,
    creditStatus: record.creditStatus
  };
}

const RECEIPT_TRANSACTION_TYPES = Object.freeze(['SALE', 'RETURN', 'REFUND', 'CREDIT_ADJUSTMENT', 'VOID']);
const RECONCILIATION_TRANSACTION_TYPES = RECEIPT_TRANSACTION_TYPES;

function normalizeProjectionRequest(data, allowedTypes, name) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw returnValidationError(`${name} request must be an object.`);
  const idempotencyKey = requiredReturnText(data.idempotencyKey, 'idempotencyKey', 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) throw returnValidationError('idempotencyKey is invalid.');
  const transactionType = text(data.transactionType, 40).toUpperCase();
  if (!allowedTypes.includes(transactionType)) throw returnValidationError('transactionType is invalid.');
  return {
    idempotencyKey,
    businessId: requiredReturnText(data.businessId, 'businessId'),
    storeId: requiredReturnText(data.storeId, 'storeId'),
    transactionType,
    originalSaleId: requiredReturnText(data.originalSaleId, 'originalSaleId'),
    adjustmentId: text(data.adjustmentId, 160) || null,
    refundId: text(data.refundId, 160) || null,
    creditAdjustmentId: text(data.creditAdjustmentId, 160) || null,
    voidId: text(data.voidId, 160) || null
  };
}

function projectionPrimaryId(request) {
  return request.transactionType === 'SALE' ? request.originalSaleId
    : request.transactionType === 'RETURN' ? request.adjustmentId
      : request.transactionType === 'REFUND' ? request.refundId
        : request.transactionType === 'CREDIT_ADJUSTMENT' ? request.creditAdjustmentId : request.voidId;
}

function projectionFingerprint(request, kind) { return fingerprint({ kind, ...request }); }
function projectionError(code, message = code) { throw new HttpsError('failed-precondition', `${code}: ${message}`); }

async function authorizeProjection(auth, sale) {
  if (!sale || !sale.businessId || !sale.storeId) projectionError('SALE_NOT_FOUND');
  return resolveBusinessStoreContext({ auth, product: { businessId: sale.businessId, storeId: sale.storeId, userId: sale.sellerId }, requestedBusinessId: sale.businessId, requestedStoreId: sale.storeId });
}

function receiptNumberFor(request, receiptId) {
  return `SKH-${String(request.businessId).replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}-${String(request.storeId).replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}-${receiptId}`;
}

function receiptItemsFromSale(sale) {
  return (Array.isArray(sale.items) ? sale.items : []).map(item => ({ productId: item.productId, productNameAtSale: item.productNameAtSale || null, variantNameAtSale: item.variantNameAtSale || null, options: item.options || null, quantity: item.quantity, stockQuantity: item.stockQuantity, unitMode: item.unitMode || null, unitId: item.unitId || null, unitPriceAtSale: item.unitPriceAtSale, lineTotal: item.lineTotal, variantId: item.variantId || null, sku: item.sku || null, inventoryKey: item.inventoryKey || null }));
}

function receiptBase(request, sale, source, receiptId) {
  const now = new Date().toISOString();
  const result = { receiptId, receiptNumber: receiptNumberFor(request, receiptId), businessId: sale.businessId, storeId: sale.storeId, originalSaleId: sale.saleId, transactionType: request.transactionType, adjustmentId: request.adjustmentId, refundId: request.refundId, creditAdjustmentId: request.creditAdjustmentId, voidId: request.voidId, customer: sale.customer || null, cashierId: sale.cashierId || null, sellerId: sale.sellerId || null, items: receiptItemsFromSale(sale), subtotal: sale.totals?.subtotal ?? null, discount: sale.totals?.discount ?? null, total: sale.totals?.total ?? null, payment: sale.payment || null, status: sale.voidStatus === 'VOIDED' ? 'VOIDED' : sale.status, createdAt: now, updatedAt: now, sourceSnapshot: source };
  return result;
}

async function readProjectionSource(tx, request) {
  const saleRef = db.doc('sales/' + request.originalSaleId);
  const saleSnap = await tx.get(saleRef);
  if (!saleSnap.exists) projectionError('SALE_NOT_FOUND');
  const sale = saleSnap.data() || {};
  if (sale.businessId !== request.businessId || sale.storeId !== request.storeId) projectionError('SALE_SCOPE_MISMATCH');
  let source = sale;
  if (request.transactionType === 'RETURN') { if (!request.adjustmentId) projectionError('RETURN_NOT_SUPPORTED'); const snap = await tx.get(db.doc('sale_adjustments/' + request.adjustmentId)); if (!snap.exists) projectionError('RETURN_NOT_SUPPORTED'); source = snap.data() || {}; }
  if (request.transactionType === 'REFUND') { if (!request.refundId) projectionError('REFUND_NOT_FOUND'); const snap = await tx.get(db.doc('refunds/' + request.refundId)); if (!snap.exists) projectionError('REFUND_NOT_FOUND'); source = snap.data() || {}; }
  if (request.transactionType === 'CREDIT_ADJUSTMENT') { if (!request.creditAdjustmentId) projectionError('CREDIT_ADJUSTMENT_NOT_FOUND'); const snap = await tx.get(db.doc('credit_adjustments/' + request.creditAdjustmentId)); if (!snap.exists) projectionError('CREDIT_ADJUSTMENT_NOT_FOUND'); source = snap.data() || {}; }
  if (request.transactionType === 'VOID') { if (!request.voidId) projectionError('VOID_NOT_FOUND'); const snap = await tx.get(db.doc('sale_voids/' + request.voidId)); if (!snap.exists) projectionError('VOID_NOT_FOUND'); source = snap.data() || {}; }
  if (source.originalSaleId && source.originalSaleId !== request.originalSaleId) projectionError('SALE_SCOPE_MISMATCH');
  return { sale, source };
}

exports.posReceipt = onCall({ region: REGION }, async req => {
  const auth = authOf(req);
  let request;
  try { request = normalizeProjectionRequest(req.data && typeof req.data === 'object' ? req.data : {}, RECEIPT_TRANSACTION_TYPES, 'Receipt'); } catch (error) { throw new HttpsError('invalid-argument', `INVALID_RECEIPT_REQUEST: ${error.message}`); }
  const preflight = await db.doc('sales/' + request.originalSaleId).get();
  if (!preflight.exists) projectionError('SALE_NOT_FOUND');
  const sale = preflight.data() || {};
  if (sale.businessId !== request.businessId || sale.storeId !== request.storeId) projectionError('SALE_SCOPE_MISMATCH');
  await authorizeProjection(auth, sale);
  const receiptId = `receipt_${request.transactionType.toLowerCase()}_${projectionPrimaryId(request)}`;
  const receiptRef = db.doc('receipts/' + receiptId);
  const requestFingerprint = projectionFingerprint(request, 'RECEIPT');
  let result;
  await db.runTransaction(async tx => {
    const existing = await tx.get(receiptRef);
    if (existing.exists) { result = existing.data(); return; }
    const sourceBundle = await readProjectionSource(tx, request);
    const source = sourceBundle.source;
    const receipt = receiptBase(request, sourceBundle.sale, source, receiptId);
    receipt.requestFingerprint = requestFingerprint;
    if (request.transactionType === 'RETURN') { receipt.items = source.items || []; receipt.total = source.amount ?? null; receipt.status = source.status || 'RETURNED'; receipt.payment = { method: source.paymentMethod || null, status: source.paymentStatus || null, reference: source.paymentReference || null, inventoryDisposition: source.inventoryDisposition || null }; }
    if (request.transactionType === 'REFUND') { receipt.total = source.amount ?? null; receipt.status = source.status; receipt.payment = { method: source.method, status: source.status, reference: source.reference || null, pendingReason: source.pendingReason || null }; }
    if (request.transactionType === 'CREDIT_ADJUSTMENT') { receipt.total = source.amount ?? null; receipt.status = source.status; receipt.payment = { method: 'CREDIT_ADJUSTMENT', status: source.status, previousOutstanding: source.previousOutstanding, newOutstanding: source.newOutstanding, creditStatus: source.creditStatus }; }
    if (request.transactionType === 'VOID') { receipt.total = source.originalSaleTotal ?? sourceBundle.sale.totals?.total ?? null; receipt.status = source.status || 'VOIDED'; receipt.payment = { method: sourceBundle.sale.payment?.method || null, status: source.financialStatus || 'FINANCIAL_REVERSAL_PENDING', inventoryApplied: source.inventoryApplied === true }; }
    tx.create(receiptRef, receipt); result = receipt;
  });
  return result;
});

function saleReconciliation(sale) {
  const total = Number(sale.totals?.total);
  const payment = sale.payment || {};
  if (!Number.isFinite(total)) return { expectedAmount: null, recordedAmount: null, difference: null, status: 'MISMATCH' };
  if (payment.method === 'Cash') { const cash = Number(payment.cashReceived); const valid = Number.isFinite(cash) && cash >= total && Number(payment.amount) === total; return { expectedAmount: total, recordedAmount: Number(payment.amount), difference: Math.round((total - Number(payment.amount)) * 100) / 100, status: valid ? 'RECONCILED' : 'MISMATCH' }; }
  if (payment.method === 'Deni' || payment.method === 'Awamu') { const deposit = Number(payment.deposit || 0); const outstanding = Number(payment.outstanding || 0); const valid = Math.abs(total - deposit - outstanding) < 0.01; return { expectedAmount: total, recordedAmount: deposit, difference: outstanding, status: valid && outstanding === 0 ? 'RECONCILED' : valid ? 'PENDING' : 'MISMATCH' }; }
  return { expectedAmount: total, recordedAmount: Number(payment.amount), difference: 0, status: payment.status === 'PENDING_VERIFICATION' ? 'PENDING' : (Number(payment.amount) === total ? 'RECONCILED' : 'MISMATCH') };
}

exports.posReconcile = onCall({ region: REGION }, async req => {
  const auth = authOf(req);
  let request;
  try { request = normalizeProjectionRequest(req.data && typeof req.data === 'object' ? req.data : {}, RECONCILIATION_TRANSACTION_TYPES, 'Reconciliation'); } catch (error) { throw new HttpsError('invalid-argument', `INVALID_RECONCILIATION_REQUEST: ${error.message}`); }
  const preflight = await db.doc('sales/' + request.originalSaleId).get(); if (!preflight.exists) projectionError('SALE_NOT_FOUND');
  const sale = preflight.data() || {}; if (sale.businessId !== request.businessId || sale.storeId !== request.storeId) projectionError('SALE_SCOPE_MISMATCH'); await authorizeProjection(auth, sale);
  const reconId = `recon_${request.transactionType.toLowerCase()}_${projectionPrimaryId(request)}`;
  const reconRef = db.doc('reconciliations/' + reconId); const requestFingerprint = projectionFingerprint(request, 'RECONCILIATION'); let result;
  await db.runTransaction(async tx => {
    const existing = await tx.get(reconRef); if (existing.exists) { result = existing.data(); return; }
    const bundle = await readProjectionSource(tx, request); const source = bundle.source; let check;
    if (request.transactionType === 'SALE') check = saleReconciliation(bundle.sale);
    else if (request.transactionType === 'RETURN') check = { expectedAmount: Number(source.amount), recordedAmount: source.paymentStatus === 'REFUNDED' || source.paymentStatus === 'CREDIT_ADJUSTED' ? Number(source.amount) : null, difference: source.paymentStatus === 'REFUND_PENDING' || source.paymentStatus === 'CREDIT_ADJUSTMENT_PENDING' ? Number(source.amount) : 0, status: source.paymentStatus === 'REFUND_PENDING' || source.paymentStatus === 'CREDIT_ADJUSTMENT_PENDING' ? 'PENDING' : 'RECONCILED' };
    else if (request.transactionType === 'REFUND') check = { expectedAmount: Number(source.amount), recordedAmount: source.status === 'REFUNDED' ? Number(source.amount) : null, difference: source.status === 'REFUNDED' ? 0 : Number(source.amount), status: source.status === 'REFUNDED' ? 'RECONCILED' : 'PENDING' };
    else if (request.transactionType === 'CREDIT_ADJUSTMENT') { const valid = Number(source.previousOutstanding) - Number(source.amount) === Number(source.newOutstanding) && Number(source.newOutstanding) >= 0; check = { expectedAmount: Number(source.amount), recordedAmount: Number(source.amount), difference: valid ? 0 : null, status: valid && source.status === 'CREDIT_ADJUSTED' ? 'RECONCILED' : 'MISMATCH' }; }
    else check = { expectedAmount: Number(source.originalSaleTotal), recordedAmount: source.financialStatus === 'REFUNDED' ? Number(source.originalSaleTotal) : null, difference: source.financialStatus === 'FINANCIAL_REVERSAL_PENDING' ? Number(source.originalSaleTotal) : 0, status: source.inventoryApplied === true ? (source.financialStatus === 'FINANCIAL_REVERSAL_PENDING' ? 'PENDING' : 'RECONCILED') : 'MISMATCH' };
    const now = new Date().toISOString(); const record = { reconciliationId: reconId, businessId: request.businessId, storeId: request.storeId, originalSaleId: request.originalSaleId, transactionType: request.transactionType, adjustmentId: request.adjustmentId, refundId: request.refundId, creditAdjustmentId: request.creditAdjustmentId, voidId: request.voidId, expectedAmount: check.expectedAmount, recordedAmount: check.recordedAmount, difference: check.difference, paymentMethod: source.paymentMethod || source.method || bundle.sale.payment?.method || null, status: check.status, source: 'POS_SERVER_AUTHORITY', requestFingerprint, createdAt: now, updatedAt: now };
    tx.create(reconRef, record); result = record;
  });
  return result;
});

exports.posRefund = onCall({ region: REGION }, async req => {
  const auth = authOf(req);
  let request;
  try {
    request = normalizeMoneyReversalRequest(req.data && typeof req.data === 'object' ? req.data : {}, 'REFUND');
  } catch (error) {
    throw new HttpsError('invalid-argument', `INVALID_REFUND_REQUEST: ${error.message}`);
  }
  const preflightAdjustmentRef = db.doc('sale_adjustments/' + request.adjustmentId);
  const preflightAdjustmentSnap = await preflightAdjustmentRef.get();
  if (!preflightAdjustmentSnap.exists) moneyReversalError('RETURN_NOT_SUPPORTED', 'Adjustment not found.');
  const preflightAdjustment = preflightAdjustmentSnap.data() || {};
  if (preflightAdjustment.businessId !== request.businessId || preflightAdjustment.storeId !== request.storeId) moneyReversalError('SALE_SCOPE_MISMATCH');
  await authorizeMoneyReversal(auth, preflightAdjustment);
  const requestFingerprint = moneyReversalFingerprint(request, 'REFUND');
  const refundRef = db.doc('refunds/refund_' + request.idempotencyKey);
  const linkedRefundQuery = db.collection('refunds').where('adjustmentId', '==', request.adjustmentId);
  let result;

  await db.runTransaction(async tx => {
    const existingRef = await tx.get(refundRef);
    if (existingRef.exists) {
      const existing = existingRef.data() || {};
      if (existing.requestFingerprint !== requestFingerprint) moneyReversalError('IDEMPOTENCY_CONFLICT');
      result = moneyReversalResult(existing);
      return;
    }
    const linked = await tx.get(linkedRefundQuery);
    if (!linked || !Array.isArray(linked.docs)) moneyReversalError('REFUND_NOT_VERIFIABLE');
    for (const linkedDoc of linked.docs) {
      const existing = linkedDoc.data() || {};
      if (['REFUNDED'].includes(existing.status)) moneyReversalError('REFUND_ALREADY_COMPLETED');
      if (['REFUND_REQUESTED', 'REFUND_PENDING'].includes(existing.status)) moneyReversalError('REFUND_ALREADY_PENDING');
    }
    const adjustmentSnap = await tx.get(preflightAdjustmentRef);
    if (!adjustmentSnap.exists) moneyReversalError('RETURN_NOT_SUPPORTED');
    const adjustment = adjustmentSnap.data() || {};
    if (adjustment.adjustmentType !== 'RETURN' || adjustment.status !== 'RETURNED') moneyReversalError('RETURN_NOT_SUPPORTED');
    if (!Number.isFinite(Number(adjustment.amount)) || Number(adjustment.amount) <= 0) moneyReversalError('RETURN_NOT_SUPPORTED', 'Return amount is invalid.');
    if (adjustment.paymentStatus !== 'REFUND_PENDING') moneyReversalError('REFUND_ALREADY_COMPLETED');
    if (adjustment.businessId !== request.businessId || adjustment.storeId !== request.storeId) moneyReversalError('SALE_SCOPE_MISMATCH');
    if (request.originalSaleId && request.originalSaleId !== adjustment.originalSaleId) moneyReversalError('SALE_SCOPE_MISMATCH');
    const now = new Date().toISOString();
    const amount = Math.round(Number(adjustment.amount) * 100) / 100;
    const refundId = refundRef.id;
    const record = {
      refundId,
      originalSaleId: adjustment.originalSaleId,
      adjustmentId: request.adjustmentId,
      businessId: request.businessId,
      storeId: request.storeId,
      customer: adjustment.customer || null,
      amount,
      method: request.method,
      reference: null,
      status: 'REFUND_PENDING',
      idempotencyKey: request.idempotencyKey,
      requestFingerprint,
      requestedBy: auth.uid,
      approvedBy: null,
      failureCode: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      pendingReason: request.method === 'Cash' ? 'CASHIER_CONFIRMATION_REQUIRED' : 'PROVIDER_INTEGRATION_PENDING',
      result: {
        success: true,
        refundId,
        originalSaleId: adjustment.originalSaleId,
        adjustmentId: request.adjustmentId,
        amount,
        method: request.method,
        status: 'REFUND_PENDING'
      }
    };
    tx.create(refundRef, record);
    tx.set(preflightAdjustmentRef, { paymentStatus: 'REFUND_PENDING', refundId, updatedAt: now }, { merge: true });
    result = record.result;
  });
  return result;
});

exports.posCreditAdjustment = onCall({ region: REGION }, async req => {
  const auth = authOf(req);
  let request;
  try {
    request = normalizeMoneyReversalRequest(req.data && typeof req.data === 'object' ? req.data : {}, 'CREDIT_ADJUSTMENT');
  } catch (error) {
    throw new HttpsError('invalid-argument', `INVALID_CREDIT_ADJUSTMENT_REQUEST: ${error.message}`);
  }
  const preflightAdjustmentRef = db.doc('sale_adjustments/' + request.adjustmentId);
  const preflightAdjustmentSnap = await preflightAdjustmentRef.get();
  if (!preflightAdjustmentSnap.exists) moneyReversalError('RETURN_NOT_SUPPORTED', 'Adjustment not found.');
  const preflightAdjustment = preflightAdjustmentSnap.data() || {};
  if (preflightAdjustment.businessId !== request.businessId || preflightAdjustment.storeId !== request.storeId) moneyReversalError('SALE_SCOPE_MISMATCH');
  await authorizeMoneyReversal(auth, preflightAdjustment);
  const requestFingerprint = moneyReversalFingerprint(request, 'CREDIT_ADJUSTMENT');
  const creditRef = db.doc('credit_adjustments/credit_' + request.idempotencyKey);
  const linkedCreditQuery = db.collection('credit_adjustments').where('adjustmentId', '==', request.adjustmentId);
  let result;

  await db.runTransaction(async tx => {
    const existingRef = await tx.get(creditRef);
    if (existingRef.exists) {
      const existing = existingRef.data() || {};
      if (existing.requestFingerprint !== requestFingerprint) moneyReversalError('IDEMPOTENCY_CONFLICT');
      result = moneyReversalResult(existing);
      return;
    }
    const linked = await tx.get(linkedCreditQuery);
    if (!linked || !Array.isArray(linked.docs)) moneyReversalError('CREDIT_ADJUSTMENT_NOT_VERIFIABLE');
    for (const linkedDoc of linked.docs) {
      const existing = linkedDoc.data() || {};
      if (existing.status === 'CREDIT_ADJUSTED') moneyReversalError('CREDIT_ADJUSTMENT_ALREADY_COMPLETED');
      if (existing.status === 'CREDIT_ADJUSTMENT_REQUESTED') moneyReversalError('CREDIT_ADJUSTMENT_ALREADY_PENDING');
    }
    const adjustmentSnap = await tx.get(preflightAdjustmentRef);
    if (!adjustmentSnap.exists) moneyReversalError('RETURN_NOT_SUPPORTED');
    const adjustment = adjustmentSnap.data() || {};
    if (adjustment.adjustmentType !== 'RETURN' || adjustment.status !== 'RETURNED') moneyReversalError('RETURN_NOT_SUPPORTED');
    if (adjustment.paymentStatus !== 'CREDIT_ADJUSTMENT_PENDING') moneyReversalError('CREDIT_ADJUSTMENT_ALREADY_COMPLETED');
    if (!Number.isFinite(Number(adjustment.amount)) || Number(adjustment.amount) <= 0) moneyReversalError('RETURN_NOT_SUPPORTED', 'Return amount is invalid.');
    if (adjustment.businessId !== request.businessId || adjustment.storeId !== request.storeId) moneyReversalError('SALE_SCOPE_MISMATCH');
    const saleRef = db.doc('sales/' + adjustment.originalSaleId);
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) moneyReversalError('SALE_NOT_FOUND');
    const sale = saleSnap.data() || {};
    if (!['Deni', 'Awamu'].includes(sale.payment && sale.payment.method)) moneyReversalError('CREDIT_ADJUSTMENT_NOT_APPLICABLE');
    const debtRef = sale.idempotencyKey ? db.doc('shop_ledger/pos_' + sale.idempotencyKey) : null;
    if (!debtRef) moneyReversalError('CREDIT_ADJUSTMENT_NOT_APPLICABLE');
    const debtSnap = await tx.get(debtRef);
    if (!debtSnap.exists) moneyReversalError('CREDIT_ADJUSTMENT_NOT_APPLICABLE');
    const debt = debtSnap.data() || {};
    const outstanding = Number(debt.outstanding !== undefined ? debt.outstanding : debt.amount);
    const amount = Math.round(Number(adjustment.amount) * 100) / 100;
    if (!Number.isFinite(outstanding) || outstanding < 0) moneyReversalError('CREDIT_ADJUSTMENT_NOT_APPLICABLE');
    if (amount > outstanding) moneyReversalError('CREDIT_ADJUSTMENT_EXCEEDS_OUTSTANDING');
    const remaining = Math.round((outstanding - amount) * 100) / 100;
    const now = new Date().toISOString();
    const creditAdjustmentId = creditRef.id;
    const creditStatus = remaining === 0 ? 'CREDIT_SETTLED' : 'CREDIT_OPEN';
    const record = {
      creditAdjustmentId,
      originalSaleId: adjustment.originalSaleId,
      adjustmentId: request.adjustmentId,
      businessId: request.businessId,
      storeId: request.storeId,
      customer: adjustment.customer || sale.customer || null,
      amount,
      status: 'CREDIT_ADJUSTED',
      idempotencyKey: request.idempotencyKey,
      requestFingerprint,
      createdBy: auth.uid,
      createdAt: now,
      updatedAt: now,
      creditStatus,
      previousOutstanding: outstanding,
      newOutstanding: remaining,
      result: { success: true, creditAdjustmentId, originalSaleId: adjustment.originalSaleId, adjustmentId: request.adjustmentId, amount, status: 'CREDIT_ADJUSTED', creditStatus, newOutstanding: remaining }
    };
    tx.create(creditRef, record);
    tx.set(debtRef, { amount: remaining, outstanding: remaining, status: remaining > 0 ? 'pending' : 'completed', updatedAt: now }, { merge: true });
    const ledgerRef = db.doc('shop_ledger/credit_' + request.idempotencyKey);
    tx.create(ledgerRef, {
      shopOwnerId: adjustment.sellerId || sale.sellerId || null,
      saleId: adjustment.originalSaleId,
      originalSaleId: adjustment.originalSaleId,
      adjustmentId: request.adjustmentId,
      creditAdjustmentId,
      businessId: request.businessId,
      storeId: request.storeId,
      type: 'credit_adjustment',
      title: 'POS return credit adjustment',
      amount: -amount,
      status: 'completed',
      recordedBy: auth.uid,
      date: now,
      referenceType: 'CREDIT_ADJUSTMENT',
      referenceId: creditAdjustmentId
    });
    tx.set(preflightAdjustmentRef, { paymentStatus: 'CREDIT_ADJUSTED', creditAdjustmentId, updatedAt: now }, { merge: true });
    result = record.result;
  });
  return result;
});

exports._testing = {
  keyOf,
  validateCredit,
  RETURN_INVENTORY_DISPOSITIONS,
  RETURN_REFUND_METHODS,
  RETURN_STATES,
  normalizeReturnRequest,
  makeOriginalSaleItemReference,
  parseOriginalSaleItemReference,
  validateSaleCompatibility,
  calculateReturnableQuantity,
  validateReturnQuantity,
  buildReturnRequestFingerprint,
  buildReturnAdjustmentShape,
  VOID_STATES,
  normalizeVoidRequest,
  buildVoidRequestFingerprint,
  validateVoidSaleSnapshot
};

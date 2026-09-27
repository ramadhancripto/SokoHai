#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = file => execFileSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });

const authority = read('functions/inventory-authority.js');
const hub = read('js/app/17-hub.js');
const sales = read('js/app/15-pos-sales.js');
const html = read('html/09-admin-sell.html');
const index = read('functions/index.js');

// Existing cart and callers.
assert.match(hub, /window\.posCart/);
assert.match(hub, /addPosCartItem/);
assert.match(hub, /submitPosSale/);
assert.match(hub, /items: posCart\.map/);
assert.match(hub, /pricingMode: item\.isWholesale \? 'wholesale' : 'retail'/);
assert.doesNotMatch(hub, /for \(let item of posCart\)/);
assert.match(sales, /processSmartOfflineSale/);
assert.match(html, /posCustomerName/);
assert.match(html, /posPayType/);

// Existing authority remains the only sale/inventory engine.
assert.match(index, /posSale/);
assert.match(index, /inventoryAdjust/);
assert.match(authority, /exports\.posSale = onCall/);
assert.match(authority, /db\.runTransaction\(async tx/);
assert.match(authority, /tx\.create\(saleRef, sale\)/);
assert.match(authority, /tx\.create\(movementRefs\[index\]/);
assert.match(authority, /sales\/pos_\' \+ idempotencyKey/);
assert.match(authority, /inventory_movements\/pos_\' \+ idempotencyKey/);
assert.match(authority, /const existing = await tx\.get\(saleRef\)/);
assert.match(authority, /requestFingerprint/);
assert.match(authority, /Idempotency key imetumika kwa request tofauti/);
assert.match(authority, /authoritativeItemSnapshot/);
assert.match(authority, /pricingMode === 'wholesale'/);
assert.match(authority, /wholesale price halali/);

// All-item validation happens before writes.
assert.match(authority, /const products = \[\]/);
assert.match(authority, /for \(let index = 0; index < productRefs\.length/);
assert.match(authority, /const items = products\.map/);
assert.match(authority, /items\.forEach\(\(item, index\)/);
assert.match(authority, /const subtotal =/);
assert.match(authority, /tx\.set\(productRefs\[index\]/);

// Sale snapshot fields.
for (const field of [
  'saleId', 'idempotencyKey', 'requestFingerprint', "type: 'POS_SALE'", "channel: 'OFFLINE_POS'",
  'businessId', 'storeId', 'sellerId', 'cashierId', 'items', 'totals',
  'payment', "status: 'COMPLETED'", 'customer', 'createdAt', 'completedAt',
  'immutableSnapshot: true'
]) assert.match(authority, new RegExp(field.replace(/[.*+?^${}()|[\\\\]\\\\]/g, '\\\\$&')));

// Payment aliases and authoritative payment fields.
assert.match(authority, /Tigo: 'TigoPesa'/);
assert.match(authority, /Airtel: 'AirtelMoney'/);
assert.match(authority, /'Bank'/);
assert.match(authority, /normalizePaymentMethod\(rawMethod\)/);
assert.match(authority, /amount: paymentAmount/);
assert.match(authority, /paymentInput\.cashReceived < total/);
assert.match(authority, /change = Math\.round/);
assert.match(authority, /PENDING_VERIFICATION/);
assert.match(authority, /CREDIT_OPEN/);

// Discount is rule-based on the server; client amount is not accepted.
assert.match(sales, /activePosDiscountApplied/);
assert.match(sales, /promoType === '10'/);
assert.match(sales, /promoType === 'weekend'/);
assert.match(sales, /promoType === 'buy2get1'/);
assert.match(authority, /normalizeDiscountRequest/);
assert.match(authority, /discountRequest\.type === '10'/);
assert.doesNotMatch(authority, /data\.discountAmount/);
assert.doesNotMatch(authority, /data\.activePosDiscountApplied/);

// POS-5 now owns server receipt/reconciliation projections; offline sales remain POS-3-owned.
assert.match(hub, /sokohai_offline_sales/);
assert.match(authority, /exports\.posReturn/);
assert.match(authority, /exports\.posVoid/);
assert.match(authority, /exports\.posReceipt/);
assert.match(authority, /exports\.posReconcile/);

for (const file of [
  'functions/inventory-authority.js',
  'functions/index.js',
  'js/app/15-pos-sales.js',
  'js/app/17-hub.js'
]) check(file);

console.log('POS-2 contract checks passed');

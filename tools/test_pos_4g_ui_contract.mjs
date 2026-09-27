#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('html/09-admin-sell.html');
const hub = read('js/app/17-hub.js');
const sales = read('js/app/15-pos-sales.js');
const cockpit = read('js/app/18-cockpit.js');

// Existing POS form is extended rather than duplicated.
assert.match(html, /id="posReturnArea"/);
assert.match(html, /id="posReturnSaleId"/);
assert.match(html, /id="posReturnSaleItemId"/);
assert.match(html, /id="posReturnDisposition"/);
assert.match(html, /id="posReturnRefundMethod"/);
assert.match(html, /id="posReturnReason"/);
assert.match(html, /id="posTransactionHistoryResults"/);
assert.match(html, /onclick="window\.submitReturnSale\(\)"/);

// Financial/inventory actions are server callables, not client writes.
for (const callable of ['posReturn', 'posRefund', 'posCreditAdjustment', 'posVoid']) assert.match(hub, new RegExp(`wrapCallable\\('${callable}'\\)`));
assert.match(hub, /window\.loadPosTransactionHistory/);
assert.match(hub, /window\.renderPosTransactionReceipt/);
assert.match(html, /id="posTransactionReceipt"/);
assert.match(hub, /Kitendo hiki kinahitaji muunganisho wa seva/);
assert.match(hub, /posLockActionButton/);
assert.doesNotMatch(hub.slice(hub.indexOf('window.submitReturnSale'), hub.indexOf('window.submitSupplierPaymentOS')), /inventoryAdjust/);
assert.doesNotMatch(hub.slice(hub.indexOf('window.submitReturnSale'), hub.indexOf('window.submitSupplierPaymentOS')), /addDoc\(.*shop_ledger/);
assert.doesNotMatch(hub.slice(hub.indexOf('window.submitReturnSale'), hub.indexOf('window.submitSupplierPaymentOS')), /refundAmount/);
assert.doesNotMatch(hub.slice(hub.indexOf('window.submitReturnSale'), hub.indexOf('window.submitSupplierPaymentOS')), /stockAfter|authoritativeStock/);
assert.doesNotMatch(hub.slice(hub.indexOf('window.submitReturnSale'), hub.indexOf('window.submitSupplierPaymentOS')), /queueAggregate|sokohai_offline_sales/);

// One linked timeline reads sale, return, refund, credit and void events.
for (const collection of ['sale_adjustments', 'refunds', 'credit_adjustments', 'sale_voids']) assert.match(hub, new RegExp(`[\\"']${collection}[\\"']`));
for (const status of ['RETURNED', 'REFUND_PENDING', 'CREDIT_ADJUSTED', 'VOIDED']) assert.match(hub, new RegExp(status));
assert.match(hub, /pendingReason/);
assert.match(hub, /financialStatus/);
assert.match(hub, /inventoryApplied/);

// Existing POS sale/offline code remains present and is not redirected to reversal actions.
assert.match(sales, /wrapCallable\('posSale'\)/);
assert.match(sales, /window\.posOfflineQueue\.queueAggregate/);
assert.match(cockpit, /wrapCallable\('posSale'\)/);
assert.doesNotMatch(sales, /wrapCallable\('posReturn'\)/);
assert.doesNotMatch(cockpit, /wrapCallable\('posReturn'\)/);

for (const file of ['js/app/15-pos-sales.js', 'js/app/17-hub.js', 'js/app/18-cockpit.js']) execFileSync(process.execPath, ['--check', path.join(root, file)]);
console.log('POS-4G UI contract checks passed');

#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = file => execFileSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
const hub = read('js/app/17-hub.js');
const cockpit = read('js/app/18-cockpit.js');
const quick = read('js/app/15-pos-sales.js');
const html = read('html/09-admin-sell.html');

// One canonical queue contract and one owner for creation/sync.
assert.match(hub, /POS_OFFLINE_QUEUE_KEY = 'sokohai_offline_sales'/);
assert.match(hub, /schemaVersion: 1/);
assert.match(hub, /queueId/);
assert.match(hub, /idempotencyKey/);
assert.match(hub, /requestFingerprint/);
assert.match(hub, /status: 'QUEUED'/);
assert.match(hub, /items: input\.items\.map/);
assert.match(hub, /discountRequest/);
assert.match(hub, /cashReceived/);
assert.match(hub, /deposit/);
assert.match(hub, /customer/);
assert.match(hub, /deviceId/);
assert.match(hub, /sessionId/);

// No client-authoritative total, discount amount, change, outstanding, or stock is queued.
assert.doesNotMatch(hub, /finalTotal:/);
assert.doesNotMatch(hub, /discountAmount:/);
assert.doesNotMatch(hub, /outstanding:/);
assert.doesNotMatch(hub, /change:/);
assert.doesNotMatch(hub, /authoritativeStock:/);

// Quick sale joins the same queue when genuinely offline, but Cash requires input first.
assert.match(quick, /window\.posOfflineQueue\.queueAggregate/);
assert.match(quick, /if \(!navigator\.onLine\)/);
assert.match(quick, /payMethod === 'Cash'/);
assert.match(quick, /Ingiza kiasi cha cash kilichopokelewa ili kuhifadhi mauzo offline/);
assert.match(quick, /cashReceived: payMethod === 'Cash' \? quickCashReceived : null/);
assert.doesNotMatch(quick, /sokohai_offline_sales/);

// Main online/offline queue creation uses one aggregate item set.
assert.match(hub, /items: posCart\.map/);
assert.match(hub, /await queueOfflinePosSale/);
assert.doesNotMatch(hub, /for \(let item of posCart\)/);

// Canonical sync ownership and state machine.
for (const state of ['QUEUED', 'SYNCING', 'SYNCED', 'RETRY_WAIT', 'FAILED', 'CONFLICT']) {
  assert.match(cockpit, new RegExp(`['"]${state}['"]`));
}
assert.match(cockpit, /POS_SYNC_LEASE_KEY/);
assert.match(cockpit, /POS_SYNC_LEASE_MS/);
assert.match(cockpit, /posSyncAcquireLease/);
assert.match(cockpit, /posSyncReleaseLease/);
assert.match(cockpit, /window\.posOfflineSync/);
assert.match(cockpit, /window\.addEventListener\('online'/);
assert.match(cockpit, /DOMContentLoaded/);
assert.match(cockpit, /manualSync/);

// Aggregate replay: one queue item, one callable, exact persisted idempotency key.
assert.match(cockpit, /function posSyncPayload/);
assert.match(cockpit, /idempotencyKey: item\.idempotencyKey/);
assert.match(cockpit, /skh\.wrapCallable\('posSale'\)\(posSyncPayload\(item\)\)/);
assert.doesNotMatch(cockpit, /for \(let item of tx\.cart\)/);
assert.doesNotMatch(cockpit, /offline-sync-/);

// Legacy queue is preserved and never silently replayed as aggregate POS-2 data.
assert.match(cockpit, /LEGACY_QUEUE_REQUIRES_MANUAL_HANDLING/);
assert.match(cockpit, /isLegacyPosQueueItem/);
assert.match(cockpit, /if \(isLegacyPosQueueItem\(current\)\) continue/);
assert.match(cockpit, /item\.schemaVersion === 1/);
assert.match(cockpit, /item\.legacy/);
const legacyGuard = cockpit.indexOf('if (isLegacyPosQueueItem(current)) continue;');
const normalStatusCheck = cockpit.indexOf("current.status === 'SYNCED'");
assert.ok(legacyGuard >= 0 && normalStatusCheck > legacyGuard, 'legacy guard must precede normal retry eligibility');

// Retry/conflict behavior and server refresh boundary.
assert.match(cockpit, /POS_SYNC_MAX_ATTEMPTS/);
assert.match(cockpit, /RETRY_WAIT/);
assert.match(cockpit, /setTimeout\(\(\) =>/);
assert.match(cockpit, /posSyncIsConflict/);
assert.match(cockpit, /posSyncCheckPriceConflict/);
assert.match(cockpit, /QUEUE_PAYLOAD_FINGERPRINT_MISMATCH/);
assert.match(cockpit, /warmPosProductsCache/);

// Minimal queue UI exists without a new dashboard.
assert.match(html, /posOfflineQueueStatus/);
assert.match(html, /window\.posOfflineSync && window\.posOfflineSync\.manualSync/);

for (const file of ['js/app/15-pos-sales.js', 'js/app/17-hub.js', 'js/app/18-cockpit.js']) check(file);
console.log('POS-3 offline queue contract checks passed');

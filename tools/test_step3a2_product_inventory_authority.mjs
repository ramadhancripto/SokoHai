#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = file => execFileSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
const inventory = read('functions/inventory-authority.js');
const resolver = read('functions/business-store-authority.js');
const rules = read('firestore.rules');
const primaryCreate = read('js/app/08-app-state.js');
const posCreate = read('js/app/15-pos-sales.js');
const seller = read('js/app/30-seller-products.js');
const hub = read('js/app/17-hub.js');
const cockpit = read('js/app/18-cockpit.js');
const onboarding = read('js/app/14-map-onboarding.js');
const printing = read('js/app/22-printing.js');

assert.match(primaryCreate, /businessId: skh\.currentUserData\?\.businessId/);
assert.match(primaryCreate, /storeId: skh\.currentUserData\?\.storeId/);
assert.match(primaryCreate, /stock: 0/);
assert.match(primaryCreate, /openingStockPending: true/);
assert.match(primaryCreate, /movementType: 'OPENING_BALANCE'/);
assert.match(posCreate, /businessId: skh\.currentUserData\?\.businessId/);
assert.match(posCreate, /storeId: skh\.currentUserData\?\.storeId/);
assert.match(posCreate, /openingStockPending: true/);
assert.match(posCreate, /movementType: 'OPENING_BALANCE'/);

assert.match(inventory, /resolveBusinessStoreContext\(\{ auth, product/);
assert.match(inventory, /db\.runTransaction\(async tx/);
assert.match(inventory, /tx\.set\(productRef/);
assert.match(inventory, /tx\.create\(movementRef/);
assert.match(inventory, /OPENING_BALANCE/);
assert.match(inventory, /openingStockPending !== true/);
assert.match(inventory, /openingStockInitialized === true/);
assert.match(inventory, /stock \+ delta < 0/);
assert.match(inventory, /idempotencyKey/);
assert.match(inventory, /type: 'SALE'/);
assert.match(inventory, /source: 'POS'/);
assert.match(inventory, /businessId: scope\.businessId/);
assert.match(inventory, /storeId: scope\.storeId/);
assert.match(inventory, /actorUid: auth\.uid/);
assert.match(resolver, /productBusinessId \|\| userBusinessId/);

for (const source of [seller, hub, cockpit, onboarding, printing]) {
  assert.match(source, /wrapCallable\(['"]inventoryAdjust['"]\)/, 'operational writer must use inventoryAdjust');
}
for (const file of ['js/app/15-pos-sales.js', 'js/app/17-hub.js', 'js/app/18-cockpit.js', 'js/app/22-printing.js', 'js/app/30-seller-products.js']) {
  const source = read(file);
  assert.doesNotMatch(source, /updateDoc\([^\n]*\b(stock|availabilityStatus)\s*:/, file + ' has direct operational stock update');
}

assert.match(rules, /request\.resource\.data\.stock == 0/);
assert.match(rules, /openingStockPending/);
assert.match(rules, /'comments','stock','businessId','storeId','ownerUid','shopOwnerUid','shopOwnerId','sellerId','userId','openingStockPending','openingStockInitialized'/);
assert.match(rules, /match \/inventory_movements\/\{id\}/);

for (const file of [
  'functions/business-store-authority.js',
  'functions/inventory-authority.js',
  'functions/index.js',
  'js/app/08-app-state.js',
  'js/app/15-pos-sales.js',
  'js/app/17-hub.js',
  'js/app/18-cockpit.js',
  'js/app/22-printing.js',
  'js/app/30-seller-products.js'
]) check(file);

console.log('STEP 3A-2 Product + Inventory authority contract: all checks passed');

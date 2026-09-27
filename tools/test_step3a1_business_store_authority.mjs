#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = file => execFileSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });

const resolver = read('functions/business-store-authority.js');
const inventory = read('functions/inventory-authority.js');
const rules = read('firestore.rules');
const productCreate = read('js/app/08-app-state.js');
const offlineCreate = read('js/app/15-pos-sales.js');

assert.match(resolver, /async function resolveBusinessStoreContext/);
assert.match(resolver, /businesses\/' \+ businessId/);
assert.match(resolver, /stores\/' \+ storeId/);
assert.match(resolver, /ownerUid/);
assert.match(resolver, /productBusinessId \|\| userBusinessId/);
assert.match(inventory, /resolveBusinessStoreContext\(\{ auth, product/);
assert.doesNotMatch(inventory, /requestedBusinessId \|\| null/);
assert.match(productCreate, /businessId: skh\.currentUserData\?\.businessId/);
assert.match(productCreate, /storeId: skh\.currentUserData\?\.storeId/);
assert.match(offlineCreate, /businessId: skh\.currentUserData\?\.businessId/);
assert.match(offlineCreate, /storeId: skh\.currentUserData\?\.storeId/);
assert.match(rules, /businessId','storeId','ownerUid','shopOwnerUid','shopOwnerId','sellerId','userId'/);

for (const file of [
  'functions/business-store-authority.js',
  'functions/inventory-authority.js',
  'functions/index.js',
  'js/app/08-app-state.js',
  'js/app/15-pos-sales.js'
]) check(file);

console.log('STEP 3A-1 Business/Store authority contract: all checks passed');

#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const runCheck = file => execFileSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });

const authority = read('functions/inventory-authority.js');
const index = read('functions/index.js');
const rules = read('firestore.rules');
const pos = read('js/app/15-pos-sales.js');

assert.match(authority, /exports\.posSale\s*=\s*onCall/);
assert.match(authority, /exports\.inventoryAdjust\s*=\s*onCall/);
assert.match(authority, /db\.runTransaction/);
assert.match(authority, /idempotencyKey/);
assert.match(authority, /type: 'SALE'/);
assert.match(authority, /type: movementType/);
assert.match(index, /exports\.posSale\s*=\s*inventoryAuthority\.posSale/);
assert.match(index, /exports\.inventoryAdjust\s*=\s*inventoryAuthority\.inventoryAdjust/);
assert.match(rules, /match \/sales\/{id}/);
assert.match(rules, /match \/inventory_movements\/{id}/);
assert.match(rules, /affectedKeys\(\)\.hasAny\(\[[\s\S]*'comments','stock'/);
assert.match(pos, /skh\.wrapCallable\('posSale'\)/);
assert.match(pos, /skh\.wrapCallable\('inventoryAdjust'\)/);
assert.doesNotMatch(pos, /updateDoc\([^\n]*products[^\n]*stock/);

for (const file of [
  'functions/inventory-authority.js', 'functions/index.js',
  'js/app/14-map-onboarding.js', 'js/app/15-pos-sales.js',
  'js/app/17-hub.js', 'js/app/18-cockpit.js',
  'js/app/22-printing.js', 'js/app/30-seller-products.js'
]) runCheck(file);

for (const file of [
  'js/app/14-map-onboarding.js', 'js/app/17-hub.js',
  'js/app/18-cockpit.js', 'js/app/22-printing.js',
  'js/app/30-seller-products.js'
]) {
  const source = read(file);
  assert.doesNotMatch(source, /updateDoc\([^\n]*products[^\n]*stock/);
  assert.doesNotMatch(source, /stock:\s*skh\.increment/);
}

console.log('STEP 3A-0 authority contract: all checks passed');

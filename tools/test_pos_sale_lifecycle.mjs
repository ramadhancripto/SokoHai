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

// Aggregate request normalization and one-call frontend migration.
assert.match(authority, /const hasItems = Array\.isArray\(data\.items\)/);
assert.match(authority, /Tumia productId au items/);
assert.match(authority, /return data\.items\.map/);
assert.match(authority, /pricingMode: 'retail'/);
assert.match(hub, /const response = await skh\.wrapCallable\('posSale'\)\(/);
assert.match(hub, /items: posCart\.map/);
assert.doesNotMatch(hub, /for \(let item of posCart\)/);

// All Products are read and all stock is validated before Product writes.
assert.match(authority, /const productRefs = requestedItems\.map/);
assert.match(authority, /for \(let index = 0; index < productRefs\.length; index \+= 1\)/);
assert.match(authority, /const products = \[\]/);
assert.match(authority, /const stocks = products\.map/);
assert.match(authority, /items\.forEach\(\(item, index\) => \{/);
assert.match(authority, /if \(stock < item\.stockQuantity\)/);
assert.match(authority, /const subtotal =/);

// One sale, N deterministic movements, one optional projection.
assert.match(authority, /const movementRefs = requestedItems\.map/);
assert.match(authority, /inventory_movements\/pos_' \+ idempotencyKey \+ \(legacyRequest/);
assert.match(authority, /tx\.create\(saleRef, sale\)/);
assert.match(authority, /tx\.create\(movementRefs\[index\]/);
assert.match(authority, /tx\.set\(ledgerRef/);
assert.match(authority, /idempotencyKey,/);
assert.match(authority, /saleId: saleRef\.id/);

// Server totals and payment rules.
assert.match(authority, /const discountAmount =/);
assert.match(authority, /const total =/);
assert.match(authority, /paymentAmount = total/);
assert.match(authority, /cashReceived < total/);
assert.match(authority, /outstanding: credit\.outstanding/);
assert.match(authority, /change\s*\n\s*\}/);

// Conflict-safe idempotency and no client final-total authority.
assert.match(authority, /requestFingerprint/);
assert.match(authority, /old\.requestFingerprint !== requestFingerprint/);
assert.match(authority, /idempotent: true/);
assert.doesNotMatch(hub, /activePosFinalTotal.*posSale/);
assert.doesNotMatch(hub, /activePosDiscountApplied.*posSale/);

check('functions/inventory-authority.js');
check('js/app/17-hub.js');
console.log('POS-2 aggregate sale lifecycle checks passed');

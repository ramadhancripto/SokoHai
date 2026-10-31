#!/usr/bin/env node
// [2026-11-01] Unit tests: decimal quantities (shared/quantity-core.js), canonical attribute
// aliases (shared/attribute-alias-core.mjs) and decimal-aware stock authority core.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as A from '../shared/attribute-alias-core.mjs';
const require = createRequire(import.meta.url);
const Q = require('../shared/quantity-core.js');
const S = require('../shared/inventory-reservation-core.js');
const I = require('../shared/pos-product-identity-core.js');
const C = require('../shared/canonical-taxonomy-data.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok ' + name); };

t('exact decimal arithmetic (scaled integers): 0.1 + 0.2 = 0.3, 5 - 4.7 = 0.3, 0.25 x 12 = 3', () => {
  assert.equal(Q.add(0.1, 0.2, 3), 0.3); assert.equal(Q.sub(5, 4.7, 3), 0.3); assert.equal(Q.mulInt(0.25, 12, 3), 3);
  let s = 0; for (let i = 0; i < 1000; i++) s = Q.add(s, 0.001, 3); assert.equal(s, 1, '1000 x 1 g = 1 kg exactly');
});
t('validation: too many decimals is invalid (never rounded); whole units stay whole', () => {
  assert.equal(Q.isValidQuantity(1.2345, 3), false); assert.equal(Q.isValidQuantity(1.234, 3), true);
  assert.equal(Q.isValidQuantity(1.5, 0), false); assert.equal(Q.isValidQuantity(0, 0, { allowZero: true }), true);
  assert.equal(Q.isValidQuantity(-1, 3), false); assert.equal(Q.isValidQuantity(NaN, 3), false); assert.equal(Q.isValidQuantity('', 3), false);
});
t('units: kg/L/m opt into 3 decimals, g/mL/piece stay whole; product precision is explicit opt-in', () => {
  assert.equal(Q.precisionForUnit('Kg'), 3); assert.equal(Q.precisionForUnit('Litre'), 3); assert.equal(Q.precisionForUnit('Meter'), 3);
  assert.equal(Q.precisionForUnit('Gram'), 0); assert.equal(Q.precisionForUnit('Piece'), 0);
  assert.equal(Q.precisionOf({ baseUnit: 'Kg' }), 0, 'legacy kg product without opt-in stays whole');
  assert.equal(Q.precisionOf({ quantityPrecision: 3 }), 3); assert.equal(Q.precisionOf({ quantityPrecision: 7 }), 0);
});
t('conversion only inside one dimension, exact factors', () => {
  assert.deepEqual(Q.convert(1.25, 'kg', 'g'), { ok: true, value: 1250, unitId: 'g' });
  assert.deepEqual(Q.convert(500, 'mL', 'L'), { ok: true, value: 0.5, unitId: 'L' });
  assert.equal(Q.convert(1, 'kg', 'L').error, 'UNIT_DIMENSION_MISMATCH');
  assert.equal(Q.convert(1, 'piece', 'kg').error, 'UNIT_NOT_MEASURED');
});
t('stock authority core: decimal product sells 1.25 kg, no negative, whole product unchanged', () => {
  const rice = { stock: 2, quantityPrecision: 3 };
  const after = S.applyDelta(rice, null, { stock: -1.25 }); assert.equal(after.stock, 0.75);
  assert.equal(S.checkAvailable(after, null, 0.8).ok, false); assert.equal(S.checkAvailable(after, null, 0.75).ok, true);
  assert.throws(() => S.applyDelta(after, null, { stock: -0.751 }), /STOCK_INVALID|STOCK_NEGATIVE/);
  assert.equal(S.checkAvailable({ stock: 5 }, null, 1.5).ok, false, 'whole-unit product refuses decimals');
  assert.equal(S.checkAdjust({ stock: 5, reservedStock: 2 }, null, -4).error, 'BELOW_RESERVED');
  assert.equal(I.resolveProductIdentity({ productId: 'r', price: 1, stock: 0.75, quantityPrecision: 3 }, { productId: 'r', unitMode: 'pc' }).ok, true);
  assert.equal(I.resolveProductIdentity({ productId: 's', price: 1, stock: 0.75 }, { productId: 's', unitMode: 'pc' }).error, 'INVENTORY_NOT_VALID');
});
t('canonical attributes: Colour = Color (one attribute), legacy id kept; Size vs Dimensions NOT merged', () => {
  const c = A.canonicalAttribute('Colour');
  assert.equal(c.attributeId, 'ATTR-COLOR'); assert.equal(c.legacyId, 'ATTR-COLOUR'); assert.equal(c.alias, true);
  assert.equal(A.canonicalKey('Package Size'), A.canonicalKey('Pack Size'));
  assert.equal(A.canonicalKey('Breeding Status'), 'ATTR-BREEDING_STATUS');
  for (const [a, b] of A.NOT_ALIASED_PENDING_REVIEW) assert.notEqual(A.canonicalKey(a), A.canonicalKey(b), a + ' vs ' + b);
  assert.deepEqual(A.aliasRegistryIssues(C.ATTRIBUTE_REGISTRY), [], 'every canonical label exists in the runtime registry');
  assert.equal(A.canonicalAttribute('Voltage').attributeId, 'ATTR-VOLTAGE', 'unknown labels pass through unchanged');
});
console.log(`quantity + attribute core: ${n} checks passed`);

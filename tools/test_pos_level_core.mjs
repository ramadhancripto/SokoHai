import assert from 'node:assert/strict';
import { LEVEL_ORDER, POS_LEVELS, normalizePosLevel, getPosCapabilities } from '../shared/pos-level-core.mjs';

assert.deepEqual(LEVEL_ORDER, ['basic', 'partial', 'full']);
assert.equal(normalizePosLevel('unknown'), 'basic');
assert.equal(getPosCapabilities('basic').sales, true);
assert.equal(getPosCapabilities('basic').products, true);
assert.equal(getPosCapabilities('basic').inventory, false);
assert.equal(getPosCapabilities('partial').inventory, true);
assert.equal(getPosCapabilities('full').staff, true);
for (const level of LEVEL_ORDER) {
  assert.equal(POS_LEVELS[level].sales, true);
  assert.equal(POS_LEVELS[level].products, true);
  assert.equal(POS_LEVELS[level].receipts, true);
  assert.equal(POS_LEVELS[level].transactions, true);
  assert.equal(POS_LEVELS[level].settings, true);
}
console.log('POS level core checks passed');

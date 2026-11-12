#!/usr/bin/env node
/* [2026-11-06] Stage 6 — owner taxonomy source (01–44) is connected to the runtime:
 * generated branches are current, the merge is additive (no existing id lost), and the
 * seller builder (browser projection) actually offers the owner's product types. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { getProductTypeOptions } from '../shared/product-taxonomy-bridge.mjs';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url);
let passed = 0, failed = 0;
const t = (n, f) => { try { f(); passed++; console.log('PASS ' + n); } catch (e) { failed++; console.log('FAIL ' + n + ' — ' + e.message); } };
const run = (args, env = {}) => execFileSync(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env } }).toString();

t('generated owner branches match the source text', () => run(['tools/build_owner_taxonomy_branches.mjs', '--check']));
t('reconciliation report is current', () => run(['tools/taxonomy_source_reconcile.mjs', '--check']));
t('browser projection is current', () => run(['tools/build_product_schema_bridge.mjs', '--check']));

const data = require('../shared/canonical-taxonomy-data.js');
const baseIds = JSON.parse(run(['-e', "process.stdout.write(JSON.stringify(Object.keys(require('./shared/canonical-taxonomy-data.js').PRODUCT_TYPE_REGISTRY)))"], { SKH_TAXONOMY_SKIP_OWNER_BRANCHES: '1' }));
t('merge is additive: every pre-existing product-type id still exists', () => {
  const missing = baseIds.filter(id => !data.PRODUCT_TYPE_REGISTRY[id]);
  assert.deepEqual(missing, []);
});
t('no duplicate product-type ids after merge', () => {
  let n = 0; for (const b of Object.values(data.PRODUCT_TYPE_DEFINITIONS)) for (const d of Object.values(b)) n += (d.productTypes || []).length;
  assert.equal(Object.keys(data.PRODUCT_TYPE_REGISTRY).length, n);
});
t('no new sub-category invented: every owner branch is a runtime sub-category or base branch', () => {
  const owner = require('../shared/canonical-taxonomy-owner-branches.js');
  for (const [cid, branches] of Object.entries(owner)) for (const b of Object.keys(branches)) {
    const ok = (data.PRODUCT_SUBCATEGORIES[cid] || []).includes(b);
    assert.ok(ok, cid + '/' + b);
  }
});
t('previously empty branches are filled (01 Samaki & Seafood, 02 Zana za Kilimo, 07 Viatu)', () => {
  assert.ok(data.PRODUCT_TYPE_DEFINITIONS['CAT-01']['Samaki & Seafood'].productTypes.includes('Dagaa'));
  assert.ok(data.PRODUCT_TYPE_DEFINITIONS['CAT-02']['Zana za Kilimo'].productTypes.includes('Jembe'));
  assert.ok(data.PRODUCT_TYPE_DEFINITIONS['CAT-07']['Viatu'].productTypes.includes('Golf Shoe'), 'existing label kept');
  assert.ok(data.PRODUCT_TYPE_DEFINITIONS['CAT-07']['Viatu'].productTypes.includes('Sneakers'));
});
for (const [cid, sub, label] of [['CAT-11', 'TVs & Home Entertainment', 'QLED TV'], ['CAT-15', 'Braking System', 'Brake Caliper'],
  ['CAT-43', 'Gemstones', 'Tanzanite'], ['CAT-31', 'Dog Food', 'Puppy food'], ['CAT-02', 'Mbegu', 'Mbegu za Alizeti']]) {
  t(`seller builder offers "${label}" under ${cid} / ${sub}`, () => {
    const opts = getProductTypeOptions(cid, sub);
    const hit = opts.find(o => o.label === label);
    assert.ok(hit, JSON.stringify(opts.slice(0, 8)));
    assert.ok(data.PRODUCT_TYPE_REGISTRY[hit.id], 'browser id must equal canonical registry id: ' + hit.id);
  });
}
const forms = fs.readFileSync(new URL('../js/app/05-forms.js', import.meta.url), 'utf8');
const state = fs.readFileSync(new URL('../js/app/08-app-state.js', import.meta.url), 'utf8');
t('seller search indexes product types and stores the chosen one', () => {
  assert.ok(/getProductTypeOptions\(c\.value, leaf\)/.test(forms));
  assert.ok(/setField\('prodTaxonomyProductTypeId'/.test(forms));
  assert.ok(/\.\.\.skhTaxonomyProductType\(category, subCategory\)/.test(state));
});
console.log('\nOWNER TAXONOMY SOURCE: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

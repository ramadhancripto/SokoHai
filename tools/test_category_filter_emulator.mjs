#!/usr/bin/env node
/* [REMEDIATION 2026-11 R4] The buyer category query against real Firestore (emulator):
 * new products (CAT-xx) and old products (legacy label) appear under the same
 * category; unmapped legacy labels only under themselves; nothing leaks across
 * categories; the read-only impact tool counts them.
 *   firebase emulators:exec --only firestore --project demo-sokohai "node tools/test_category_filter_emulator.mjs"
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { categoryFilterValues, categoryMatches } from '../shared/category-filter-core.mjs';
const require = createRequire(import.meta.url);
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + (i ? JSON.stringify(i) : '')); } };

await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
const t = i => new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString();
const seed = [
  ['new_tv', 'CAT-11', 1], ['old_tv', 'Electronics & Teknoloji (Tech)', 2], ['new_phone', 'CAT-12', 3],
  ['new_rice', 'CAT-01', 4], ['old_rice', 'Vyakula na Vinywaji (Food)', 5],
  ['old_med', 'Afya na Pharmacy (Health)', 6], ['new_med', 'CAT-19', 7], ['old_misc', 'Mchanganyiko (General Merchandise)', 8]
];
for (const [id, category, i] of seed) await db.doc('products/' + id).set({ title: id, category, createdAt: t(i), price: 1000 });
async function feed(active) {
  const v = categoryFilterValues(active).values;
  const q = v.length > 1 ? db.collection('products').where('category', 'in', v) : db.collection('products').where('category', '==', active);
  const s = await q.orderBy('createdAt', 'desc').limit(20).get();
  return s.docs.map(d => d.id);
}
const elec = await feed('CAT-11');
ok('CAT-11 selection: new (CAT-11) and old (legacy label) products, newest first', JSON.stringify(elec) === '["old_tv","new_tv"]', elec);
ok('legacy "Electronics" selection returns the same set', JSON.stringify(await feed('Electronics & Teknoloji (Tech)')) === JSON.stringify(elec));
ok('CAT-12 phones do not leak into CAT-11', !elec.includes('new_phone'));
ok('food: CAT-01 + legacy food label together', JSON.stringify((await feed('CAT-01')).sort()) === '["new_rice","old_rice"]');
// [2026-11-20] Since [F-F1 2026-11-10] (shared/taxonomy-legacy-mapping.js) the reviewed legacy label
// "Afya na Pharmacy (Health)" maps to CAT-19 and "Mchanganyiko" to CAT-44, so selecting either side shows both.
// (This test was written on 2026-11-06, when those labels were still unmapped proposals.)
const med = await feed('Afya na Pharmacy (Health)');
ok('mapped legacy "Afya" selection: legacy + CAT-19 products, newest first', JSON.stringify(med) === '["new_med","old_med"]', med);
ok('CAT-19 selection returns the same set (and nothing else)', JSON.stringify(await feed('CAT-19')) === JSON.stringify(med));
ok('health products do not leak into electronics / food', !elec.includes('old_med') && !(await feed('CAT-01')).includes('old_med'));
ok('client filter agrees with the query for every seeded product', seed.every(([id, c]) => categoryMatches(c, 'CAT-11') === ['new_tv', 'old_tv'].includes(id)));
const impact = JSON.parse(execFileSync('node', [path.join(path.dirname(new URL(import.meta.url).pathname), 'legacy_category_impact.mjs')], { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
ok('impact tool: 8 products, 4 legacy labels mapped (Afya -> CAT-19, Mchanganyiko -> CAT-44), none unmapped', impact.products === 8 && Object.keys(impact.legacyUnmapped).length === 0 && impact.legacyMapped['Afya na Pharmacy (Health) -> CAT-19'] === 1 && impact.legacyMapped['Mchanganyiko (General Merchandise) -> CAT-44'] === 1 && Object.keys(impact.legacyMapped).length === 4, impact);
console.log(`\nCATEGORY FILTER (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

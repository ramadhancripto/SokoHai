#!/usr/bin/env node
/* [REMEDIATION 2026-11 R4] READ-ONLY count of products per stored category value:
 * canonical CAT-xx, legacy labels with a reviewed mapping, and legacy labels that
 * are still UNMAPPED (the 12 awaiting an owner decision). Prints counts only.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node tools/legacy_category_impact.mjs
 *   node tools/legacy_category_impact.mjs --allow-production-read --project <id>   (owner's own credentials; read-only)
 */
import { createRequire } from 'node:module';
import { canonicalCategoryId } from '../shared/category-filter-core.mjs';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const argv = process.argv.slice(2);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
if (!process.env.FIRESTORE_EMULATOR_HOST && !argv.includes('--allow-production-read')) {
  console.error('BLOCKED: emulator, or --allow-production-read --project <id> (read-only).'); process.exit(2);
}
admin.initializeApp({ projectId: val('--project') || process.env.GCLOUD_PROJECT || 'demo-sokohai' });
const snap = await admin.firestore().collection('products').select('category').get();
const rows = {};
snap.forEach(d => { const c = String((d.data() || {}).category || '(empty)'); rows[c] = (rows[c] || 0) + 1; });
const out = { products: snap.size, canonical: {}, legacyMapped: {}, legacyUnmapped: {} };
Object.entries(rows).forEach(([c, n]) => {
  const id = canonicalCategoryId(c);
  if (/^CAT-\d{2}$/.test(c)) out.canonical[c] = n;
  else if (id) out.legacyMapped[c + ' -> ' + id] = n;
  else out.legacyUnmapped[c] = n;
});
console.log(JSON.stringify(out, null, 1));

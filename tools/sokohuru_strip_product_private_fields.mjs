#!/usr/bin/env node
/* [SOKOHURU 2026-11-21] OWNER-RUN maintenance script. NOT run by any test or deploy step.
 *
 * Public product documents (products/*) are readable by anyone. Older listings still carry the seller's
 * e-mail / phone (userEmail, ownerPhone, sellerPhone, ...). The new rules stop NEW writes of these keys; this
 * script removes them from EXISTING listings. Nothing else in the document changes.
 *
 * Default is a DRY RUN that only counts. Writing needs both --apply and --project=<id> typed by the owner.
 *   node tools/sokohuru_strip_product_private_fields.mjs --project=sokonet-3b847            # count only
 *   node tools/sokohuru_strip_product_private_fields.mjs --project=sokonet-3b847 --apply    # remove the keys
 * Credentials: Application Default Credentials of the person running it (gcloud auth application-default login).
 * Take a Firestore export first (gcloud firestore export gs://<bucket>/pre-sokohuru-<date>). */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/index.js', import.meta.url));
const admin = require('firebase-admin');
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const project = arg('project'), apply = process.argv.includes('--apply');
if (!project) { console.error('Usage: --project=<firebase project id> [--apply]'); process.exit(2); }
const KEYS = ['userEmail', 'sellerEmail', 'ownerEmail', 'email', 'ownerPhone', 'sellerPhone', 'phone', 'phoneNumber', 'whatsapp'];
admin.initializeApp({ projectId: project });
const db = admin.firestore();
let scanned = 0, affected = 0, written = 0, last = null;
const perKey = Object.fromEntries(KEYS.map(k => [k, 0]));
for (;;) {
  let q = db.collection('products').orderBy(admin.firestore.FieldPath.documentId()).limit(300);
  if (last) q = q.startAfter(last);
  const snap = await q.get(); if (snap.empty) break;
  const batch = db.batch(); let inBatch = 0;
  for (const d of snap.docs) {
    scanned++; const x = d.data(), del = {};
    for (const k of KEYS) if (k in x) { del[k] = admin.firestore.FieldValue.delete(); perKey[k]++; }
    if (Object.keys(del).length) { affected++; if (apply) { batch.update(d.ref, del); inBatch++; } }
  }
  if (apply && inBatch) { await batch.commit(); written += inBatch; }
  last = snap.docs[snap.docs.length - 1];
}
console.log(JSON.stringify({ project, mode: apply ? 'APPLY' : 'DRY_RUN', scanned, listingsWithPrivateKeys: affected, perKey, written }, null, 2));

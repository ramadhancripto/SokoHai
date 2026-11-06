#!/usr/bin/env node
/**
 * [REMEDIATION 2026-11 R1] Non-destructive migration plan for legacy ride contact fields.
 *
 * Legacy ride_requests documents may still carry customerName / customerPhone /
 * customerEmail / receiverName / receiverPhone on the main document. New writes put
 * them in ride_requests/{id}/private/contact. This tool:
 *   - DRY-RUN by default: counts affected documents, prints NO personal data.
 *   - --apply copies the fields into private/contact (merge) and, only with
 *     --remove-from-main, deletes them from the main document afterwards.
 *   - --apply is refused unless FIRESTORE_EMULATOR_HOST is set. Running it against
 *     production needs a separate, explicit owner approval and is NOT part of this
 *     remediation.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node tools/migrate_ride_contact_private.mjs [--apply] [--remove-from-main]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const KEYS = ['customerName', 'customerPhone', 'customerEmail', 'receiverName', 'receiverPhone'];
const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove-from-main');
if (APPLY && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('REFUSED: --apply only runs against the emulator in this remediation (set FIRESTORE_EMULATOR_HOST).');
  process.exit(3);
}
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('BLOCKED: dry-run also needs FIRESTORE_EMULATOR_HOST here (no production reads from this tool).');
  process.exit(2);
}
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-sokohai' });
const db = admin.firestore();

const snap = await db.collection('ride_requests').get();
let affected = 0, copied = 0, cleaned = 0;
for (const d of snap.docs) {
  const data = d.data() || {};
  const priv = {};
  KEYS.forEach(k => { if (data[k] != null && data[k] !== '') priv[k] = String(data[k]); });
  if (!Object.keys(priv).length) continue;
  affected++;
  if (!APPLY) continue;
  await db.doc(`ride_requests/${d.id}/private/contact`).set(Object.assign({ customerId: data.customerId || '' }, priv), { merge: true });
  copied++;
  if (REMOVE) {
    const del = {}; Object.keys(priv).forEach(k => { del[k] = admin.firestore.FieldValue.delete(); });
    await d.ref.update(del);
    cleaned++;
  }
}
console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', scanned: snap.size, affected, copied, cleaned }));

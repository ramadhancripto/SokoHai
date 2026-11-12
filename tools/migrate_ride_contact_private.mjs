#!/usr/bin/env node
/**
 * [REMEDIATION 2026-11 R1] Non-destructive migration of legacy ride contact fields.
 *
 * Legacy ride_requests documents may still carry customerName / customerPhone /
 * customerEmail / receiverName / receiverPhone on the main document. New writes put
 * them in ride_requests/{id}/private/contact.
 *
 * Every document is classified (no personal data is ever printed):
 *   UNCHANGED  no contact field on the main document (new or already migrated)
 *   CHANGE     contact on the main document, safe to copy into private/contact
 *   PROBLEM    needs a human: no customerId, non-text value, value > 200 chars,
 *              or an existing private/contact that disagrees with the main document
 *
 * Modes
 *   (default)            DRY-RUN: read-only, prints counts + problem reasons/ids.
 *   --apply              copy CHANGE rows into private/contact (merge). Main doc untouched.
 *   --remove-from-main   with --apply: also delete the copied fields from the main doc.
 *                        Requires --backup <file>: the exact removed values are saved first.
 *   --rollback <file>    restore the fields from a backup file onto the main documents.
 *   --report <file>      write the dry-run/apply summary as JSON.
 *
 * Safety
 *   - Every write mode (--apply, --rollback) is REFUSED unless FIRESTORE_EMULATOR_HOST
 *     is set. Running against production needs a separate, explicit owner approval and
 *     a change to this guard; it is not part of this remediation.
 *   - A read-only dry-run against a real project is possible only with
 *     --allow-production-read --project <id> and the owner's own credentials.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node tools/migrate_ride_contact_private.mjs [--report out.json]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const KEYS = ['customerName', 'customerPhone', 'customerEmail', 'receiverName', 'receiverPhone'];
const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const APPLY = flag('--apply'), REMOVE = flag('--remove-from-main'), ROLLBACK = val('--rollback');
const BACKUP = val('--backup'), REPORT = val('--report');
const EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROD_READ = flag('--allow-production-read');

if ((APPLY || ROLLBACK) && !EMU) { console.error('REFUSED: write modes only run against the emulator in this remediation (set FIRESTORE_EMULATOR_HOST).'); process.exit(3); }
if (!EMU && !PROD_READ) { console.error('BLOCKED: set FIRESTORE_EMULATOR_HOST, or pass --allow-production-read --project <id> for a READ-ONLY dry-run with your own credentials.'); process.exit(2); }
if (REMOVE && !APPLY) { console.error('REFUSED: --remove-from-main needs --apply.'); process.exit(3); }
if (REMOVE && !BACKUP) { console.error('REFUSED: --remove-from-main needs --backup <file> (values are saved before removal).'); process.exit(3); }

admin.initializeApp({ projectId: val('--project') || process.env.GCLOUD_PROJECT || 'demo-sokohai' });
const db = admin.firestore();

if (ROLLBACK) {
  const rows = JSON.parse(fs.readFileSync(ROLLBACK, 'utf8'));
  let restored = 0;
  for (const r of rows) { await db.doc('ride_requests/' + r.id).set(r.fields, { merge: true }); restored++; }
  console.log(JSON.stringify({ mode: 'rollback', restored }));
  process.exit(0);
}

const snap = await db.collection('ride_requests').get();
const out = { mode: APPLY ? (REMOVE ? 'apply+remove' : 'apply') : 'dry-run', scanned: snap.size, unchanged: 0, change: 0, problem: 0,
  problems: {}, copied: 0, removed: 0 };
const backup = [];
const problem = (id, why) => { out.problem++; (out.problems[why] = out.problems[why] || []).push(id); };

for (const d of snap.docs) {
  const data = d.data() || {};
  const present = KEYS.filter(k => data[k] !== undefined && data[k] !== null && data[k] !== '');
  if (!present.length) { out.unchanged++; continue; }
  if (typeof data.customerId !== 'string' || !data.customerId) { problem(d.id, 'missing_customerId'); continue; }
  if (present.some(k => typeof data[k] !== 'string' && typeof data[k] !== 'number')) { problem(d.id, 'non_text_value'); continue; }
  if (present.some(k => String(data[k]).length > 200)) { problem(d.id, 'value_too_long'); continue; }
  const priv = {}; present.forEach(k => { priv[k] = String(data[k]); });
  const ps = await db.doc(`ride_requests/${d.id}/private/contact`).get();
  if (ps.exists) {
    const p = ps.data() || {};
    if (p.customerId && p.customerId !== data.customerId) { problem(d.id, 'private_customer_mismatch'); continue; }
    if (present.some(k => p[k] !== undefined && String(p[k]) !== priv[k])) { problem(d.id, 'private_value_conflict'); continue; }
  }
  out.change++;
  if (!APPLY) continue;
  await db.doc(`ride_requests/${d.id}/private/contact`).set(Object.assign({ customerId: data.customerId }, priv), { merge: true });
  out.copied++;
  if (REMOVE) {
    const fields = {}; present.forEach(k => { fields[k] = data[k]; });
    backup.push({ id: d.id, fields });
    fs.writeFileSync(BACKUP, JSON.stringify(backup));            // saved BEFORE the delete
    const del = {}; present.forEach(k => { del[k] = admin.firestore.FieldValue.delete(); });
    await d.ref.update(del);
    out.removed++;
  }
}
if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));

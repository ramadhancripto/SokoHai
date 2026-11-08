#!/usr/bin/env node
/**
 * [REMEDIATION 2026-11 R9] READ-ONLY audit: old rides, seller/listing badges, legacy categories.
 *
 * Writes are impossible from this script: every Firestore write entry point (set, create,
 * update, delete, add, batch commit, transactions, BulkWriter) is replaced with a function
 * that throws BEFORE the client is created. Only counts and document IDs are printed — no
 * names, phones, e-mails or other personal data.
 *
 *   Emulator : FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node tools/production_readonly_audit.mjs
 *   Real data: node tools/production_readonly_audit.mjs --allow-production-read --project <id> [--report out.json]
 *              (the owner's own Application Default Credentials; nothing is changed)
 *   Self-test: --self-test  (on the emulator: proves the write guard throws)
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { canonicalCategoryId } from '../shared/category-filter-core.mjs';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const argv = process.argv.slice(2);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
if (!EMU && !argv.includes('--allow-production-read')) { console.error('BLOCKED: emulator, or --allow-production-read --project <id> (read-only).'); process.exit(2); }
if (!EMU && !val('--project')) { console.error('BLOCKED: --project <id> is required for a production read.'); process.exit(2); }

/* ---------- write guard (installed before any client exists) ---------- */
const F = admin.firestore;
const deny = name => function () { throw new Error('READ-ONLY AUDIT: write refused (' + name + ')'); };
for (const [cls, methods] of [[F.DocumentReference, ['set', 'create', 'update', 'delete']], [F.CollectionReference, ['add']],
  [F.WriteBatch, ['set', 'create', 'update', 'delete', 'commit']], [F.Firestore, ['runTransaction', 'bulkWriter', 'batch', 'recursiveDelete']]]) {
  for (const m of methods) if (cls && cls.prototype && cls.prototype[m]) cls.prototype[m] = deny(cls.name + '.' + m);
}

admin.initializeApp({ projectId: val('--project') || process.env.GCLOUD_PROJECT || 'demo-sokohai' });
const db = admin.firestore();

if (argv.includes('--self-test')) {
  if (!EMU) { console.error('self-test runs on the emulator only'); process.exit(2); }
  const tries = [() => db.doc('x/y').set({ a: 1 }), () => db.doc('x/y').update({ a: 1 }), () => db.doc('x/y').delete(), () => db.collection('x').add({ a: 1 }),
    () => db.batch(), () => db.runTransaction(async () => 0), () => db.bulkWriter()];
  let refused = 0;
  for (const t of tries) { try { await t(); } catch (e) { if (/READ-ONLY AUDIT/.test(e.message)) refused++; } }
  console.log(`WRITE GUARD: ${refused}/${tries.length} write paths refused`);
  process.exit(refused === tries.length ? 0 : 1);
}

const report = { target: EMU ? 'emulator' : 'project:' + val('--project'), readOnly: true, at: new Date().toISOString() };
const ids = (arr, n = 50) => ({ count: arr.length, sampleIds: arr.slice(0, n) });

/* ---------- A. rides: contact fields still on the main document ---------- */
const RIDE_KEYS = ['customerName', 'customerPhone', 'customerEmail', 'receiverName', 'receiverPhone'];
{
  const snap = await db.collection('ride_requests').select('status', 'customerId', ...RIDE_KEYS).get();
  const change = [], unchanged = [], problems = {}, byStatus = {};
  const problem = (id, why) => { (problems[why] = problems[why] || []).push(id); };
  for (const d of snap.docs) {
    const x = d.data() || {};
    const present = RIDE_KEYS.filter(k => x[k] !== undefined && x[k] !== null && x[k] !== '');
    if (!present.length) { unchanged.push(d.id); continue; }
    byStatus[x.status || '(none)'] = (byStatus[x.status || '(none)'] || 0) + 1;
    if (typeof x.customerId !== 'string' || !x.customerId) problem(d.id, 'missing_customerId');
    else if (present.some(k => typeof x[k] !== 'string' && typeof x[k] !== 'number')) problem(d.id, 'non_text_value');
    else if (present.some(k => String(x[k]).length > 200)) problem(d.id, 'value_too_long');
    else change.push(d.id);
  }
  report.rides = { scanned: snap.size, alreadyClean: unchanged.length, needMigration: change.length,
    contactOnMainByStatus: byStatus, problems: Object.fromEntries(Object.entries(problems).map(([k, v]) => [k, ids(v)])), migrationIds: ids(change) };
}

/* ---------- B. badges: where did each "verified" flag come from? ---------- */
{
  const audit = await db.collection('admin_audit_log').where('action', 'in', ['VERIFIED', 'VERIFICATION_REMOVED']).select('action', 'target').get();
  const auditedIds = new Set(audit.docs.map(d => ((d.data() || {}).target || {}).id).filter(Boolean));
  const users = await db.collection('users').select('uid', 'sellerVerified', 'verified', 'isVerified', 'verificationStatus', 'verifiedBy', 'trust').get();
  const flagged = [], audited = [], adminStampOnly = [], unverifiedSource = [];
  for (const d of users.docs) {
    const x = d.data() || {}; const uid = x.uid || d.id;
    const on = x.sellerVerified === true || x.verified === true || x.isVerified === true || x.verificationStatus === 'verified';
    if (!on) continue;
    flagged.push(d.id);
    if (auditedIds.has(d.id) || auditedIds.has(uid)) audited.push(d.id);
    else if (typeof x.verifiedBy === 'string' && x.verifiedBy && x.verifiedBy !== uid) adminStampOnly.push(d.id);
    else unverifiedSource.push(d.id);
  }
  const listing = async col => {
    const s = await db.collection(col).select('userId', 'verified', 'ownerVerified', 'verificationStatus', 'providerVerified', 'lastChangedBy', 'trust').get();
    const self = [], bySeller = {}; let flaggedN = 0;
    for (const d of s.docs) {
      const x = d.data() || {};
      const on = x.verified === true || x.ownerVerified === true || x.providerVerified === true || x.verificationStatus === 'verified';
      if (!on) continue;
      flaggedN++;
      if (!auditedIds.has(d.id)) { self.push(d.id); bySeller[x.userId || '(none)'] = (bySeller[x.userId || '(none)'] || 0) + 1; }
    }
    return { scanned: s.size, withLegacyBadge: flaggedN, noAdminRecord: ids(self), sellersInvolved: Object.keys(bySeller).length };
  };
  const badges = await db.collection('trust_badges').select('badge', 'status').get();
  const byBadge = {}; badges.forEach(d => { const x = d.data() || {}; const k = (x.badge || '?') + ':' + (x.status || '?'); byBadge[k] = (byBadge[k] || 0) + 1; });
  report.badges = {
    note: 'Nothing is granted or removed. Legacy listing flags are no longer shown to buyers (R7/R9); only server-issued trust badges are.',
    users: { scanned: users.size, withVerifiedFlag: flagged.length, withAdminAuditRecord: audited.length,
      adminStampWithoutAudit: ids(adminStampOnly), unverifiedSource_investigate: ids(unverifiedSource) },
    products: await listing('products'), services: await listing('services'),
    serverIssuedTrustBadges: byBadge
  };
}

/* ---------- C. categories: legacy values still stored on products ---------- */
{
  const snap = await db.collection('products').select('category').get();
  const rows = {}; snap.forEach(d => { const c = String((d.data() || {}).category || '(empty)'); rows[c] = (rows[c] || 0) + 1; });
  const out = { products: snap.size, canonical: 0, legacyMapped: {}, legacyUnmapped: {} };
  Object.entries(rows).forEach(([c, n]) => {
    const id = canonicalCategoryId(c);
    if (/^CAT-\d{2}$/.test(c)) out.canonical += n; else if (id) out.legacyMapped[c + ' -> ' + id] = n; else out.legacyUnmapped[c] = n;
  });
  out.note = 'Proposed mappings for unmapped values: docs/reports/LEGACY-CATEGORY-MAPPING-PROPOSALS-2026-11.md (not applied).';
  report.categories = out;
}

const text = JSON.stringify(report, null, 1);
if (val('--report')) fs.writeFileSync(val('--report'), text);
console.log(text);

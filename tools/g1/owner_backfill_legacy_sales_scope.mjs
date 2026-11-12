#!/usr/bin/env node
/**
 * OWNER-ONLY backfill: stamp canonical businessId/storeId on legacy sales/
 * docs that lack them (V-D11 gap — otherwise un-voidable: SALE_SCOPE_MISMATCH).
 * Canonical source = users/{sellerId}.businessId/storeId + businesses/stores docs
 * (same authority as business-store-authority.js). NEVER invent scope.
 *
 *   DRY RUN (default, read-only): FIRESTORE_EMULATOR_HOST=... node tools/g1/owner_backfill_legacy_sales_scope.mjs
 *   FIX: ... --fix --confirm  (+ prod guards kama mwenzake)
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let admin;
try { admin = require('firebase-admin'); }
catch { console.error('BLOCKED: firebase-admin haipo. Endesha: npm i --no-save firebase-admin'); process.exit(2); }

const FIX = process.argv.includes('--fix') && process.argv.includes('--confirm');
if (process.argv.includes('--fix') && !FIX) {
  console.error('Usalama: --fix inahitaji --confirm pia. Hakuna kilichoandikwa.'); process.exit(2);
}
const EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.SKH_BACKFILL_PROJECT || (EMU ? (process.env.GCLOUD_PROJECT || 'demo-sokohai-g1') : 'sokonet-3b847');
if (!EMU && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('BLOCKED: GOOGLE_APPLICATION_CREDENTIALS haijawekwa (owner key inahitajika).'); process.exit(2);
}
if (FIX && !EMU && (PROJECT !== 'sokonet-3b847' || process.env.SKH_BACKFILL_PROJECT !== 'sokonet-3b847' || process.env.SKH_BACKFILL_I_UNDERSTAND_PROD !== 'YES')) {
  console.error('BLOCKED: --fix nje ya emulator inahitaji SKH_BACKFILL_PROJECT=sokonet-3b847 + SKH_BACKFILL_I_UNDERSTAND_PROD=YES.'); process.exit(2);
}
const LIMIT = Number(process.env.SKH_BACKFILL_LIMIT || 2000);
console.log(`TARGET: project=${PROJECT} mode=${EMU ? 'EMULATOR' : 'LIVE'} fix=${FIX ? 'YES' : 'no (dry-run)'} limit=${LIMIT}`);
admin.initializeApp(EMU ? { projectId: PROJECT } : { credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();
const mask = (v) => String(v || '').slice(0, 6) + '…';

const snap = await db.collection('sales').limit(LIMIT).get();
console.log(`sales scanned: ${snap.size}${snap.size >= LIMIT ? ' (LIMIT — endesha tena kwa batches)' : ''}`);
const classes = { STAMPABLE: [], AMBIGUOUS: [], ALREADY: [], NO_SELLER: [] };
for (const d of snap.docs) {
  const s = d.data() || {};
  if (s.businessId && s.storeId) { classes.ALREADY.push(d.id); continue; }
  const sellerId = String(s.sellerId || '');
  if (!sellerId) { classes.NO_SELLER.push(d.id); continue; }
  const u = (await db.doc('users/' + sellerId).get()).data() || {};
  const bId = String(u.businessId || ''), sId = String(u.storeId || '');
  let ok = !!(bId && sId);
  let why = '';
  if (ok) {
    const b = (await db.doc('businesses/' + bId).get());
    const st = (await db.doc('stores/' + sId).get());
    if (!b.exists) { ok = false; why = 'business haipo'; }
    else if (!st.exists) { ok = false; why = 'store haipo'; }
    else if (String((b.data() || {}).ownerUid || '') !== sellerId) { ok = false; why = 'business si ya seller'; }
    else if (String((st.data() || {}).ownerUid || '') !== sellerId) { ok = false; why = 'store si ya seller'; }
    else if (String((st.data() || {}).businessId || '') && String((st.data() || {}).businessId) !== bId) { ok = false; why = 'store si ya business hii'; }
  } else why = 'seller hana canonical refs';
  if (ok) classes.STAMPABLE.push({ id: d.id, seller: mask(sellerId), businessId: bId, storeId: sId, total: s.total ?? s.grandTotal ?? null });
  else classes.AMBIGUOUS.push({ id: d.id, seller: mask(sellerId), why });
}
for (const k of Object.keys(classes)) {
  console.log(`CLASS ${k}: ${classes[k].length}`);
  for (const r of classes[k].slice(0, 30)) console.log('  ' + k, JSON.stringify(r));
}
if (!FIX) { console.log('\nDRY-RUN: hakuna kilichoandikwa.'); process.exit(0); }
let fixed = 0, skipped = 0, errors = 0;
for (const r of classes.STAMPABLE) {
  try {
    const fresh = (await db.doc('sales/' + r.id).get()).data() || {};
    if (fresh.businessId && fresh.storeId) { skipped++; continue; }
    if (String(fresh.sellerId || '') !== String((await db.doc('users/' + fresh.sellerId).get()).data()?.uid || fresh.sellerId)) { skipped++; console.log('  SKIP (seller changed):', r.id); continue; }
    const now = new Date().toISOString();
    await db.doc('sales/' + r.id).update({ businessId: r.businessId, storeId: r.storeId, scopeBackfilledAt: now });
    await db.collection('admin_audit_log').add({ at: now, actor: 'owner_backfill_legacy_sales_scope', action: 'stamp_sale_scope', saleId: r.id, businessId: r.businessId, storeId: r.storeId, project: PROJECT });
    fixed++;
    console.log('  STAMPED', r.id);
  } catch (e) { errors++; console.log('  ERROR', r.id, String((e && e.message) || e).slice(0, 120)); if (errors >= 5) { console.log('ABORT: makosa 5.'); process.exit(3); } }
}
console.log(`\nDONE: fixed=${fixed} skipped=${skipped} errors=${errors} (ambiguous=${classes.AMBIGUOUS.length} manual)`);
process.exit(errors ? 3 : 0);

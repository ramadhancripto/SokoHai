#!/usr/bin/env node
/**
 * OWNER-ONLY backfill: find orders stuck in FALSE 'completed' (client wrote
 * status=completed but server never released escrow — pre-launch bug, now
 * fixed fail-closed). Proof of genuine completion = wallet_ledger doc
 * `order_<orderId>_released` (server-only, written by releaseOrderEscrow).
 *
 *   DRY RUN (default, read-only):
 *     GOOGLE_APPLICATION_CREDENTIALS=/path/to/owner-key.json \
 *     node tools/g1/owner_backfill_false_completions.mjs
 *   FIX (reverts false completions to 'shipped' + notifies buyer/seller):
 *     ... node tools/g1/owner_backfill_false_completions.mjs --fix --confirm
 *
 * Requires: npm i firebase-admin (in this folder or root), owner service key.
 * NEVER run against the emulator with prod data expectations; NEVER commit key.
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
/* [SAFETY 2026-11-10 Phase A/D4] Project guard + emulator support.
 * - Emulator (FIRESTORE_EMULATOR_HOST): dry-run na --fix zinaruhusiwa bila owner key;
 *   project = SKH_BACKFILL_PROJECT || GCLOUD_PROJECT || demo-sokohai-g1.
 * - Production: --fix inahitaji SKH_BACKFILL_PROJECT=sokonet-3b847 WAZI + --confirm +
 *   SKH_BACKFILL_I_UNDERSTAND_PROD=YES. Bila hizo, script inakataa kuandika. */
const EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.SKH_BACKFILL_PROJECT || (EMU ? (process.env.GCLOUD_PROJECT || 'demo-sokohai-g1') : 'sokonet-3b847');
if (!EMU && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('BLOCKED: GOOGLE_APPLICATION_CREDENTIALS haijawekwa (owner key inahitajika).'); process.exit(2);
}
if (FIX && !EMU && (PROJECT !== 'sokonet-3b847' || process.env.SKH_BACKFILL_PROJECT !== 'sokonet-3b847' || process.env.SKH_BACKFILL_I_UNDERSTAND_PROD !== 'YES')) {
  console.error('BLOCKED: --fix nje ya emulator inahitaji SKH_BACKFILL_PROJECT=sokonet-3b847 + SKH_BACKFILL_I_UNDERSTAND_PROD=YES. Hakuna kilichoandikwa.');
  process.exit(2);
}
console.log(`TARGET: project=${PROJECT} mode=${EMU ? 'EMULATOR' : 'LIVE'} fix=${FIX ? 'YES' : 'no (dry-run)'}`);
admin.initializeApp(EMU ? { projectId: PROJECT } : { credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();

/* [PHASE D 2026-11-10] Scan + uainishaji A-E + fix salama (class A tu).
 * A = confirmed false (completed + SI paid + bila marker) -> revert shipped.
 * B = inconsistent (paid/paymentVerified lakini bila marker) -> MANUAL REVIEW (usiguse).
 * D = correctly settled (marker ipo) -> usiguse.
 * E = ambiguous (tayari imeshughulikiwa / inakinzana) -> usiguse mpaka ichunguzwe.
 * C = payment unverified isiyo completed -> nje ya scan (hakuna completed isiyo na dalili).
 * Kila record iliyochanganuliwa inaingia kwenye darasa (hakuna silent skip). */
const snap = await db.collection('orders').where('status', '==', 'completed').get();
console.log(`orders na status=completed: ${snap.size}`);
const mask = (v) => String(v || '').slice(0, 6) + '…';
const classes = { A: [], B: [], D: [], E: [] };
for (const d of snap.docs) {
  const o = d.data() || {};
  const marker = await db.doc('wallet_ledger/order_' + d.id + '_released').get();
  const rec = { id: d.id, paymentStatus: o.paymentStatus || '', paymentVerified: o.paymentVerified === true,
    amount: Number(o.amount) || 0, buyer: mask(o.buyerId), seller: mask(o.sellerId),
    completedAt: o.completedAt || o.updatedAt || null, marker: marker.exists };
  if (marker.exists) classes.D.push(rec);
  else if (o.backfillRevertedAt || o.backfillReviewedAt) classes.E.push({ ...rec, why: 'tayari imeshughulikiwa' });
  else if (rec.paymentVerified || rec.paymentStatus === 'paid') classes.B.push({ ...rec, why: 'paid lakini bila marker — MANUAL REVIEW' });
  else classes.A.push(rec);
}
for (const k of ['A', 'B', 'D', 'E']) {
  console.log(`CLASS ${k}: ${classes[k].length}`);
  for (const r of classes[k].slice(0, 50)) console.log('  ' + k, JSON.stringify(r));
  if (classes[k].length > 50) console.log(`  ... +${classes[k].length - 50} zaidi`);
}

if (!FIX) {
  console.log('\nDRY-RUN: hakuna kilichoandikwa. Kurekebisha CLASS A, endesha na --fix --confirm' + (EMU ? ' (emulator).' : ' + SKH_BACKFILL_PROJECT + SKH_BACKFILL_I_UNDERSTAND_PROD=YES.'));
  process.exit(0);
}
// FIX: class A tu, na uhakiki upya kwa kila record + audit log + kikomo cha makosa.
let fixed = 0, skipped = 0, errors = 0;
for (const r of classes.A) {
  try {
    const fresh = await db.doc('orders/' + r.id).get();
    const o = fresh.exists ? (fresh.data() || {}) : null;
    const mk = await db.doc('wallet_ledger/order_' + r.id + '_released').get();
    if (!o || o.status !== 'completed' || mk.exists || o.paymentVerified === true || o.paymentStatus === 'paid' || o.backfillRevertedAt) {
      skipped++;
      console.log('  SKIP (state imebadilika):', r.id);
      continue;
    }
    const now = new Date().toISOString();
    await db.doc('orders/' + r.id).update({ status: 'shipped', backfillRevertedAt: now,
      backfillNote: 'FALSE completed (bila escrow release) — imerudishwa shipped; mnunuzi athibitishe upya kupitia server.' });
    await db.collection('admin_audit_log').add({ at: now, actor: 'owner_backfill_false_completions', action: 'revert_false_completed',
      orderId: r.id, from: 'completed', to: 'shipped', buyer: r.buyer, seller: r.seller, amount: r.amount, project: PROJECT });
    for (const [uidField, role] of [['buyerId', 'mnunuzi'], ['sellerId', 'muuzaji']]) {
      const uid = o[uidField];
      if (!uid) continue;
      await db.collection('notifications').add({ userId: uid, event: 'order.backfillReverted', params: { orderId: r.id },
        title: 'Oda imerekebishwa na usimamizi',
        body: role === 'mnunuzi'
          ? `Oda ${r.id} ilionyesha kukamilika kimakosa. Imerejeshwa 'safarini' — tafadhali thibitisha kupokea upya.`
          : `Oda ${r.id} ilionyesha kukamilika kimakosa. Imerejeshwa 'safarini' — subiri mnunuzi athibitishe.`,
        createdAt: now, read: false, type: 'order' });
    }
    fixed++;
    console.log('  FIXED', r.id);
  } catch (e) {
    errors++;
    console.log('  ERROR', r.id, String((e && e.message) || e).slice(0, 140));
    if (errors >= 5) { console.log('ABORT: makosa 5 — hali isiyotarajiwa. Hakuna kinachoendelea.'); process.exit(3); }
  }
}
console.log(`\nDONE: fixed=${fixed} skipped=${skipped} errors=${errors} (B=${classes.B.length} manual, D=${classes.D.length} ok, E=${classes.E.length} ambiguous)`);
process.exit(errors ? 3 : 0);

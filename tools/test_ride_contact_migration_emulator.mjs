#!/usr/bin/env node
/* [REMEDIATION 2026-11 R1] Legacy ride-contact migration on the Firestore emulator:
 * dry-run counts (change / unchanged / problem), apply + remove with backup,
 * idempotent second run, rollback, and refusal of write modes outside the emulator.
 *   firebase emulators:exec --only firestore --project demo-sokohai "node tools/test_ride_contact_migration_emulator.mjs"
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCRIPT = path.join(ROOT, 'tools/migrate_ride_contact_private.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ridemig-'));
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + (i ? JSON.stringify(i) : '')); } };
const run = (args, env) => JSON.parse(execFileSync('node', [SCRIPT, ...args], { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').pop());

await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
// 20 legacy rides with contact on the main doc, 8 already split, 4 problematic
for (let i = 0; i < 20; i++) await db.doc('ride_requests/legacy' + i).set({ customerId: 'c' + i, status: i % 2 ? 'completed' : 'searching', customerName: 'Mteja ' + i, customerPhone: '07000000' + String(i).padStart(2, '0'), ...(i % 5 === 0 ? { receiverPhone: '0688' + i } : {}) });
for (let i = 0; i < 8; i++) { await db.doc('ride_requests/new' + i).set({ customerId: 'n' + i, status: 'searching' }); await db.doc(`ride_requests/new${i}/private/contact`).set({ customerId: 'n' + i, customerPhone: '0711' + i }); }
await db.doc('ride_requests/bad_nocust').set({ status: 'searching', customerPhone: '0700' });
await db.doc('ride_requests/bad_obj').set({ customerId: 'x', customerPhone: { a: 1 } });
await db.doc('ride_requests/bad_conflict').set({ customerId: 'y', customerPhone: '0701' });
await db.doc('ride_requests/bad_conflict/private/contact').set({ customerId: 'y', customerPhone: '0799' });
await db.doc('ride_requests/bad_owner').set({ customerId: 'z', customerName: 'Z' });
await db.doc('ride_requests/bad_owner/private/contact').set({ customerId: 'other' });

const dry = run(['--report', path.join(tmp, 'dry.json')]);
ok('dry-run scans every ride', dry.scanned === 32, dry);
ok('dry-run: 20 will change', dry.change === 20, dry);
ok('dry-run: 8 unchanged (already split)', dry.unchanged === 8, dry);
ok('dry-run: 4 problems, each with a reason', dry.problem === 4 && Object.keys(dry.problems).sort().join() === 'missing_customerId,non_text_value,private_customer_mismatch,private_value_conflict', dry.problems);
ok('dry-run writes nothing', !(await db.doc('ride_requests/legacy0/private/contact').get()).exists && (await db.doc('ride_requests/legacy0').get()).data().customerPhone);
ok('dry-run output contains no phone numbers or names', !/07000|Mteja/.test(JSON.stringify(dry)));

let refused = false;
try { execFileSync('node', [SCRIPT, '--apply'], { env: Object.assign({}, process.env, { FIRESTORE_EMULATOR_HOST: '' }), stdio: 'ignore' }); } catch (e) { refused = e.status === 3; }
ok('apply outside the emulator is refused (exit 3)', refused);
let needBackup = false;
try { execFileSync('node', [SCRIPT, '--apply', '--remove-from-main'], { stdio: 'ignore' }); } catch (e) { needBackup = e.status === 3; }
ok('--remove-from-main without --backup is refused', needBackup);

const bk = path.join(tmp, 'backup.json');
const ap = run(['--apply', '--remove-from-main', '--backup', bk]);
ok('apply: 20 copied and removed, problems untouched', ap.copied === 20 && ap.removed === 20 && ap.problem === 4, ap);
const p0 = (await db.doc('ride_requests/legacy0/private/contact').get()).data();
const m0 = (await db.doc('ride_requests/legacy0').get()).data();
ok('private/contact holds the exact values + customerId', p0.customerId === 'c0' && p0.customerPhone === '0700000000' && p0.receiverPhone === '06880' && p0.customerName === 'Mteja 0');
ok('main doc no longer carries contact; other fields kept', !('customerPhone' in m0) && !('customerName' in m0) && m0.status === 'searching');
ok('problem rows were not modified', (await db.doc('ride_requests/bad_conflict').get()).data().customerPhone === '0701');
ok('backup file has 20 rows', JSON.parse(fs.readFileSync(bk, 'utf8')).length === 20);
const again = run([]);
ok('second dry-run: nothing left to change (idempotent)', again.change === 0 && again.unchanged === 28 && again.problem === 4, again);

const rb = run(['--rollback', bk]);
ok('rollback restores 20 rides', rb.restored === 20, rb);
ok('rollback puts the exact values back on the main doc', (await db.doc('ride_requests/legacy5').get()).data().receiverPhone === '06885');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nRIDE CONTACT MIGRATION (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

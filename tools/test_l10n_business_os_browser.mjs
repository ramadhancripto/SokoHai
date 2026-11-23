#!/usr/bin/env node
/* [L10N 2026-11-23 rel1] Business OS / POS / listing forms: live language switch in both directions.
 * Runs tools/l10n_full_scan.mjs on the seller home, the 16 Business OS / POS tabs and the product, service and
 * transport forms. Every screen must really open (opened-proof) and no interface text may stay in the old language.
 * Needs the same environment as the other browser tests (emulators, local server on 5055, SKH_FIREBASE_SDK_DIR). */
import { execFileSync } from 'node:child_process'; import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const here = dirname(fileURLToPath(import.meta.url)), dir = mkdtempSync(join(tmpdir(), 'skh-bos-l10n-'));
const ONLY = '^(seller-home|bos-|pos$|form-)';
const EXPECT = ['seller-home', 'bos-overview', 'bos-myproducts', 'bos-inventory', 'bos-expenses', 'bos-staff', 'bos-finance', 'bos-insights', 'bos-demand',
  'bos-analytics', 'bos-perf', 'bos-compare', 'bos-settings', 'bos-recycle', 'pos', 'bos-tracking', 'bos-bookings', 'form-product', 'form-service', 'form-transport'];
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
for (const target of ['en', 'sw']) {
  const out = join(dir, target + '.json');
  execFileSync(process.execPath, [join(here, 'l10n_full_scan.mjs'), target, out, '390'], { env: { ...process.env, ONLY }, stdio: ['ignore', 'inherit', 'inherit'], timeout: 900000 });
  const r = JSON.parse(readFileSync(out, 'utf8'));
  const missing = EXPECT.filter(k => !r[k]), closed = EXPECT.filter(k => r[k] && !r[k].opened);
  ok(missing.length === 0, `${target}: all ${EXPECT.length} seller screens were scanned: missing ` + JSON.stringify(missing));
  ok(closed.length === 0, `${target}: every seller screen really opened (not just requested): ` + JSON.stringify(closed));
  const total = EXPECT.reduce((a, k) => a + (r[k] ? r[k].total : 0), 0);
  ok(total > 800, `${target}: enough interface text was checked (${total})`);
  const left = EXPECT.flatMap(k => (r[k] ? r[k].left : []).map(t => k + ': ' + t));
  ok(left.length === 0, `${target}: no text left in the other language on the Business OS, POS and forms: ` + JSON.stringify(left.slice(0, 10)));
  ok((r.__errors || []).length === 0, `${target}: no page errors: ` + JSON.stringify((r.__errors || []).slice(0, 3)));
}
console.log(`\ntest_l10n_business_os_browser: ${n} checks passed`);

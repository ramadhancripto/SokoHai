#!/usr/bin/env node
/* [PHASE 9] PesaPal live-money guards (no network, no real money).
 * 1) tools/pesapal_sandbox_check.mjs accepts ONLY https://cybqa.pesapal.com.
 * 2) functions: the LIVE host is refused outside the production project unless
 *    PESAPAL_ALLOW_LIVE=true. */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const probe = (u) => JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tools', 'pesapal_sandbox_check.mjs')], { env: Object.assign({}, process.env, { PESAPAL_BASE_URL: u, SKH_PESAPAL_GUARD_SELFTEST: '1' }) }).toString()).ok;
console.log('[sandbox script]');
t('sandbox host accepted', probe('https://cybqa.pesapal.com/pesapalv3') === true);
t('live host refused', probe('https://pay.pesapal.com/v3') === false);
t('live URL with sandbox text in query refused', probe('https://pay.pesapal.com/v3?x=cybqa.pesapal.com') === false);
t('look-alike host refused', probe('https://cybqa.pesapal.com.evil.tz/v3') === false);
t('plain http refused', probe('http://cybqa.pesapal.com/pesapalv3') === false);
console.log('[functions guard]');
process.env.GCLOUD_PROJECT = 'demo-sokohai';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const G = require(path.join(ROOT, 'functions', 'index.js'))._pesapalGuardForTest;
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
delete process.env.PESAPAL_ALLOW_LIVE;
t('staging/emulator project: live host refused', throws(() => G.pesapalLiveGuard('https://pay.pesapal.com/v3')));
t('staging/emulator project: sandbox allowed', !throws(() => G.pesapalLiveGuard('https://cybqa.pesapal.com/pesapalv3')));
process.env.GCLOUD_PROJECT = 'sokonet-3b847';
t('production project: live host allowed', !throws(() => G.pesapalLiveGuard('https://pay.pesapal.com/v3')));
process.env.GCLOUD_PROJECT = 'sokonet-staging'; process.env.PESAPAL_ALLOW_LIVE = 'true';
t('explicit PESAPAL_ALLOW_LIVE=true override works', !throws(() => G.pesapalLiveGuard('https://pay.pesapal.com/v3')));
delete process.env.PESAPAL_ALLOW_LIVE;
t('invalid URL refused', throws(() => G.pesapalLiveGuard('not a url')));
console.log(`\nPESAPAL GUARDS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

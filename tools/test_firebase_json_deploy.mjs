#!/usr/bin/env node
/* [HARDENING 2026-11-16] firebase.json -> functions deploy.
 *  1. predeploy works in Windows CMD and in Linux shells: no $RESOURCE_DIR (CMD does not expand it)
 *     and no inner quotes (firebase-tools escapes them for cross-env-shell; paths with spaces broke).
 *     firebase-tools runs hooks with cwd = the folder holding firebase.json, so a relative
 *     `--prefix functions` is exact.
 *  2. The upload ignore list keeps secrets / backups out and keeps every real source file in.
 * With firebase-tools available (SKH_FIREBASE_TOOLS_DIR, a local install or the global one) the
 * upload list is computed by firebase-tools' OWN file walker and the predeploy hook is run exactly as
 * firebase-tools runs it (node cross-env-shell "<command>", shell, cwd=project dir) from a folder with
 * spaces in its path. Without it those two parts are reported as SKIPPED, never as passed. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const fn = cfg.functions;
let pass = 0, fail = 0, skip = 0;
async function t(name, f) { try { const r = await f(); if (r === 'SKIP') { skip++; console.log('  SKIP ' + name); } else { pass++; console.log('  PASS ' + name); } } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m); };

await t('predeploy is portable (no $RESOURCE_DIR, no quotes, relative to the project dir)', () => {
  ok(Array.isArray(fn.predeploy) && fn.predeploy.length === 1, JSON.stringify(fn.predeploy));
  const c = fn.predeploy[0];
  ok(c === 'npm --prefix functions run build:shared', c);
  ok(!/[$%"']/.test(c), 'shell-specific characters: ' + c);
  ok(fn.source === 'functions', 'source must stay "functions"');
  ok(JSON.parse(fs.readFileSync(path.join(ROOT, 'functions', 'package.json'), 'utf8')).scripts['build:shared'], 'build:shared script exists');
});
const REQUIRED = ['node_modules', '.git', '.env', '.env.*', '*service-account*.json', '*-firebase-adminsdk-*.json', '*.backup*', '*.bak', 'admin-login.json', 'auth-*.json', 'token.txt', '*.pem', '*.key', '*.local', 'firebase-debug.log'];
await t('ignore list covers .env*, service accounts, backups, keys and the firebase-tools defaults', () => {
  ok(Array.isArray(fn.ignore), 'functions.ignore missing');
  for (const r of REQUIRED) ok(fn.ignore.includes(r), 'missing ignore pattern ' + r);
  for (const p of fn.ignore) ok(!/\*\.js$|^shared|index\.js|package/.test(p), 'pattern would drop source: ' + p);
});

// ---- firebase-tools (optional) ----
const req = createRequire(import.meta.url);
function findFbt() {
  const tries = [process.env.SKH_FIREBASE_TOOLS_DIR, path.join(ROOT, 'node_modules', 'firebase-tools')];
  try { tries.push(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 'firebase-tools')); } catch (e) {}
  for (const d of tries) if (d && fs.existsSync(path.join(d, 'lib', 'fsAsync.js'))) return d;
  return null;
}
const FBT = findFbt();
if (FBT) console.log('  (firebase-tools ' + JSON.parse(fs.readFileSync(path.join(FBT, 'package.json'), 'utf8')).version + ' at ' + FBT + ')');

function copyFunctions(dest) {
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', 'functions'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const f of tracked) { const to = path.join(dest, f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), to); }
  return tracked.map(f => f.slice('functions/'.length));
}
const PLANTED = ['.env', '.env.sokonet-3b847', '.env.sokohai-staging', '.env.local', 'shared/.env.x', 'service-account.json', 'shared/my-service-account-key.json',
  'sokonet-3b847-firebase-adminsdk-ab12c.json', 'application_default_credentials.json', 'admin-login.json', 'auth-users.json', 'token.txt', 'key.pem', 'tls.key',
  'index.js.backup', 'negotiation.js.backup-before-undefined-fix', 'shared/old.js.bak', 'x.orig', 'notes~', '.runtimeconfig.json', 'firebase-debug.log'];

await t('firebase-tools upload walker: every tracked source file is uploaded, no planted secret/backup is', async () => {
  if (!FBT) return 'SKIP';
  const { readdirRecursive } = req(path.join(FBT, 'lib', 'fsAsync.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skh fn upload '));
  const src = path.join(tmp, 'functions');
  const tracked = copyFunctions(tmp);
  for (const p of PLANTED) { const f = path.join(src, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'SECRET'); }
  fs.mkdirSync(path.join(src, 'node_modules', 'dep'), { recursive: true }); fs.writeFileSync(path.join(src, 'node_modules', 'dep', 'index.js'), '');
  // the same call firebase-tools makes in deploy/functions/prepareFunctionsUpload.js
  const ignore = (fn.ignore || ['node_modules', '.git']).slice(); ignore.push('firebase-debug.log', 'firebase-debug.*.log', '.runtimeconfig.json');
  // 13.x reads `ignore`, 14+ reads `ignoreStrings`
  const files = (await readdirRecursive({ path: src, ignore, ignoreStrings: ignore })).map(f => path.relative(src, f.name).split(path.sep).join('/'));
  const missing = tracked.filter(f => !files.includes(f));
  ok(!missing.length, 'legitimate files NOT uploaded: ' + missing.join(', '));
  const leaked = files.filter(f => PLANTED.includes(f) || f.startsWith('node_modules/'));
  ok(!leaked.length, 'would upload: ' + leaked.join(', '));
  ok(files.includes('index.js') && files.includes('package.json') && files.includes('package-lock.json') && files.some(f => f.startsWith('shared/')), 'core files');
  console.log('      uploaded ' + files.length + ' files (tracked ' + tracked.length + '), blocked ' + PLANTED.length + ' planted files');
});
await t('firebase-tools still READS functions/.env.<project> from disk although it is not uploaded', async () => {
  if (!FBT) return 'SKIP';
  const env = req(path.join(FBT, 'lib', 'functions', 'env.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-env-'));
  fs.writeFileSync(path.join(tmp, '.env.sokohai-staging'), 'SUPER_ADMIN_EMAILS=a@b.c\n');
  const loaded = env.loadUserEnvs({ functionsSource: tmp, projectDir: tmp, projectId: 'sokohai-staging', projectAlias: undefined, isEmulator: false });
  ok(loaded.SUPER_ADMIN_EMAILS === 'a@b.c', JSON.stringify(Object.keys(loaded)));
});
await t('predeploy hook runs exactly as firebase-tools runs it, from a folder whose path has spaces', async () => {
  if (!FBT) return 'SKIP';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'real sokohai '));
  copyFunctions(tmp); fs.copyFileSync(path.join(ROOT, 'firebase.json'), path.join(tmp, 'firebase.json'));
  fs.cpSync(path.join(ROOT, 'shared'), path.join(tmp, 'shared'), { recursive: true });
  const target = path.join(tmp, 'functions', 'shared');
  fs.rmSync(target, { recursive: true, force: true }); // inside the throw-away copy only
  const crossEnv = path.resolve(createRequire(path.join(FBT, 'lib', 'deploy', 'lifecycleHooks.js')).resolve('cross-env'), '..', 'bin', 'cross-env-shell.js');
  const command = fn.predeploy[0];
  const translated = '"' + process.execPath + '" "' + crossEnv + '" "' + command.replace(/"/g, '\\"') + '"'; // lifecycleHooks.runCommand
  const r = spawnSync(translated, [], { cwd: tmp, shell: true, encoding: 'utf8', env: Object.assign({}, process.env, { RESOURCE_DIR: path.join(tmp, 'functions') }) });
  ok(r.status === 0, 'exit ' + r.status + ' ' + (r.stderr || '').slice(0, 300));
  ok(fs.existsSync(target) && fs.readdirSync(target).length > 0, 'build:shared did not populate functions/shared');
});
console.log(`FIREBASE.JSON DEPLOY: ${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);

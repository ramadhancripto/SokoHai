#!/usr/bin/env node
/* [HARDENING 2026-11-16] tools/deploy/preflight-firebase.mjs — the gate in DEPLOY-FIREBASE.bat.
 * Every case runs the real script as a child process against a throw-away repo in the OS temp dir.
 * Nothing is deployed and the Firebase CLI is not called (its JSON output is a fixture). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRE = path.join(ROOT, 'tools', 'deploy', 'preflight-firebase.mjs');
const PROD = 'sokonet-3b847', STG = 'sokohai-staging-test';
const SECRET = 'TOPSECRET-' + Date.now();
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m); };

function makeRepo({ staging = STG, rc = { default: PROD }, env = {} } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skh pre flight '));
  fs.mkdirSync(path.join(d, 'tools', 'deploy'), { recursive: true });
  fs.mkdirSync(path.join(d, 'functions', 'shared'), { recursive: true });
  fs.writeFileSync(path.join(d, 'tools', 'deploy', 'firebase-targets.json'), JSON.stringify({ production: { projectId: PROD }, staging: { projectId: staging } }));
  fs.writeFileSync(path.join(d, '.firebaserc'), JSON.stringify({ projects: rc }));
  fs.writeFileSync(path.join(d, 'functions', 'index.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(d, 'functions', 'shared', 'core.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(d, 'functions', 'env.template.txt'), 'SUPER_ADMIN_EMAILS=\n');
  fs.writeFileSync(path.join(d, '.gitignore'), 'functions/.env*\nfunctions/node_modules/\n');
  for (const [id, body] of Object.entries(env)) fs.writeFileSync(path.join(d, 'functions', '.env.' + id), body);
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { stdio: 'pipe' });
  g('init', '-q'); g('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'); g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x');
  return d;
}
const GOOD_ENV = `SUPER_ADMIN_EMAILS=owner@example.com\nPESAPAL_CONSUMER_SECRET=${SECRET}\nPESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3\n`;
function run(d, target, project, extra = []) {
  const r = spawnSync(process.execPath, [PRE, '--root', d, '--target', target, '--project', project, '--skip-ports', ...extra], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  ok(!out.includes(SECRET), 'a secret value was printed');
  return { code: r.status, out };
}
const refused = (r, rx) => { ok(r.code === 1, 'expected refusal, got exit ' + r.code + '\n' + r.out); ok(rx.test(r.out), 'reason not shown (' + rx + '):\n' + r.out); };

const base = makeRepo({ env: { [STG]: GOOD_ENV } });
const prodRepo = makeRepo({ env: { [PROD]: GOOD_ENV } });
await t('valid staging ID with a clean functions/ folder passes', () => { const r = run(base, 'staging', STG); ok(r.code === 0, r.out); });
await t('valid production ID passes the static phase', () => { const r = run(prodRepo, 'production', PROD); ok(r.code === 0, r.out); });
await t('"default" is refused (alias, not a project ID)', () => refused(run(prodRepo, 'production', 'default'), /ALIAS/));
await t('"DEFAULT" is refused too', () => refused(run(base, 'staging', 'DEFAULT'), /ALIAS/));
const aliased = makeRepo({ rc: { default: PROD, prod: PROD, stage: STG }, env: { [STG]: GOOD_ENV } });
await t('every alias in .firebaserc is refused (prod, stage)', () => { refused(run(aliased, 'production', 'prod'), /ALIAS/); refused(run(aliased, 'staging', 'stage'), /ALIAS/); });
await t('a wrong / mistyped project ID is refused', () => { refused(run(prodRepo, 'production', 'sokonet-3b848'), /si mradi uliosajiliwa/); refused(run(base, 'staging', 'sokohai-stagin'), /si mradi uliosajiliwa/); });
await t('production ID typed for staging is refused', () => refused(run(base, 'staging', PROD), /si mradi uliosajiliwa|production, si staging/));
await t('invalid characters / injection attempts are refused', () => { for (const bad of ['Sokonet-3B847', 'a&calc', 'x" & del', '../etc', 'ab']) refused(run(base, 'staging', bad), /si project ID halali|ALIAS/); });
await t('unknown target is refused', () => refused(run(base, 'prod', PROD), /--target/));
const empty = makeRepo({ staging: '' });
await t('staging not yet registered in firebase-targets.json -> refused with instructions', () => refused(run(empty, 'staging', STG), /firebase-targets\.json haina projectId/));
const same = makeRepo({ staging: PROD, env: { [PROD]: GOOD_ENV } });
await t('staging == production in firebase-targets.json is refused', () => refused(run(same, 'staging', PROD), /project ID moja|production, si staging/));
const noenv = makeRepo({});
await t('missing functions/.env.<project> is refused', () => refused(run(noenv, 'staging', STG), /\.env\.sokohai-staging-test haipo/));
const noadmin = makeRepo({ env: { [STG]: 'PESAPAL_CONSUMER_SECRET=' + SECRET + '\n' } });
await t('env without SUPER_ADMIN_EMAILS is refused (secret value never printed)', () => refused(run(noadmin, 'staging', STG), /SUPER_ADMIN_EMAILS/));
const live = makeRepo({ env: { [STG]: 'SUPER_ADMIN_EMAILS=a@b.c\nPESAPAL_BASE_URL=https://pay.pesapal.com/v3\n' } });
await t('staging pointing at PesaPal LIVE is refused', () => refused(run(live, 'staging', STG), /PesaPal LIVE/));

const SENSITIVE = {
  '.env': 'FOO=' + SECRET, '.env.local': 'X=' + SECRET, '.env.other-project': 'X=' + SECRET, [`.env.${PROD}`]: GOOD_ENV,
  'service-account.json': '{}', 'serviceAccountKey.json': '{}', 'sokonet-3b847-firebase-adminsdk-ab12c.json': '{}',
  'application_default_credentials.json': '{}', 'admin-login.json': '{}', 'auth-users.json': '{}', 'token.txt': SECRET,
  'key.pem': SECRET, 'index.js.backup': '//', 'negotiation.js.backup-before-fix': '//', 'old.bak': '//', 'x.orig': '//', 'notes~': '//',
  ['shared/.env.' + STG]: GOOD_ENV, '.runtimeconfig.json': '{}'
};
for (const [rel, body] of Object.entries(SENSITIVE)) {
  await t('functions/' + rel + ' blocks a STAGING deploy', () => {
    const d = makeRepo({ env: { [STG]: GOOD_ENV } });
    fs.mkdirSync(path.dirname(path.join(d, 'functions', rel)), { recursive: true });
    fs.writeFileSync(path.join(d, 'functions', rel), body);
    const r = run(d, 'staging', STG, ['--skip-git']);
    refused(r, new RegExp('functions/' + rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':'));
    ok(fs.existsSync(path.join(d, 'functions', rel)), 'the file must be left in place (never deleted)');
  });
}
await t('node_modules content is not scanned (dependencies may ship *.pem test fixtures)', () => {
  const d = makeRepo({ env: { [STG]: GOOD_ENV } });
  fs.mkdirSync(path.join(d, 'functions', 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(d, 'functions', 'node_modules', 'x', 'test.pem'), 'x');
  ok(run(d, 'staging', STG, ['--skip-git']).code === 0, 'node_modules must be ignored');
});
await t('uncommitted edits to tracked files are refused', () => {
  const d = makeRepo({ env: { [STG]: GOOD_ENV } });
  fs.appendFileSync(path.join(d, 'functions', 'index.js'), '// edit\n');
  refused(run(d, 'staging', STG), /mabadiliko yasiyocommitiwa/);
});
await t('the production env file next to a staging deploy is refused (keep it outside functions/ until a production deploy)', () => {
  const d = makeRepo({ env: { [STG]: GOOD_ENV, [PROD]: GOOD_ENV } });
  refused(run(d, 'staging', STG), /functions\/\.env\.sokonet-3b847: faili la \.env lisilohusika/);
});
await t('a running local server / emulator blocks the deploy', async () => {
  const srv = net.createServer(() => {});
  await new Promise((res) => { srv.once('error', res); srv.listen(9150, '127.0.0.1', res); }); // already in use = also "open"
  const r = spawnSync(process.execPath, [PRE, '--root', base, '--target', 'staging', '--project', STG], { encoding: 'utf8' });
  srv.close();
  ok(r.status === 1 && /Server ya local bado inaendesha \(port [0-9, ]*9150/.test(r.stdout), r.stdout);
});
const pl = (ids) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'skh-pl-')), 'p.json'); fs.writeFileSync(f, typeof ids === 'string' ? ids : '﻿' + JSON.stringify({ status: 'success', result: ids.map(projectId => ({ projectId })) })); return f; };
await t('full phase: project present in `firebase projects:list --json` passes', () => { const r = run(base, 'staging', STG, ['--phase', 'full', '--projects-file', pl([PROD, STG])]); ok(r.code === 0, r.out); });
await t('full phase: project missing from the signed-in account is refused', () => refused(run(base, 'staging', STG, ['--phase', 'full', '--projects-file', pl([PROD])]), /haupo kwenye akaunti/));
await t('full phase: unreadable CLI output / no file is refused', () => { refused(run(base, 'staging', STG, ['--phase', 'full', '--projects-file', pl('Error: not logged in')]), /haisomeki/); refused(run(base, 'staging', STG, ['--phase', 'full']), /projects-file/); });
await t('this repository: functions/ holds no backups or key files (only the env file is missing here)', () => {
  const r = spawnSync(process.execPath, [PRE, '--target', 'production', '--project', PROD, '--skip-ports', '--skip-git'], { encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter(l => /^\s+\* /.test(l));
  ok(lines.every(l => /\.env\.sokonet-3b847 haipo/.test(l)), 'unexpected findings:\n' + lines.join('\n'));
});
await t('DEPLOY-FIREBASE.bat runs the gate before login, after login and after npm ci, and never deploys by alias', () => {
  const bat = fs.readFileSync(path.join(ROOT, 'tools', 'deploy', 'DEPLOY-FIREBASE.bat'), 'utf8');
  ok(/\r\n/.test(bat), 'CRLF line endings');
  ok((bat.match(/node "%PRE%"/g) || []).length === 3, 'three pre-flight calls');
  ok(bat.indexOf('--phase static') < bat.indexOf('projects:list') && bat.indexOf('--phase full') > bat.indexOf('projects:list'), 'order');
  ok(/deploy --only firestore:rules,firestore:indexes,functions --project "%PROJECT%" --non-interactive/.test(bat), 'deploy line');
  ok(!/--project default|use default|firebase use/i.test(bat), 'no alias / firebase use');
  ok(/NDIYO PRODUCTION/.test(bat) && /FUNGA KWANZA server za local/.test(bat), 'production confirmation + local server warning');
  ok(!/\b(rd|rmdir)\b|del \/s|del \/q "%ROOT%/i.test(bat), 'never deletes user files');
});
console.log(`DEPLOY PREFLIGHT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

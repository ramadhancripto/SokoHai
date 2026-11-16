#!/usr/bin/env node
/* [HARDENING 2026-11-16] Firebase environment isolation (js/00-config.js skhResolveFirebaseEnv +
 * the gate in js/app/00-bootstrap.js). Only the listed production hosts may reach production;
 * the staging site and its Netlify branch/preview deploys reach ONLY the staging project; every
 * other host (deploy previews of the production site, copies, localhost without the emulator)
 * gets env:null and Firebase is never initialised. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_SRC = fs.readFileSync(path.join(ROOT, 'js', '00-config.js'), 'utf8');
const BOOT = fs.readFileSync(path.join(ROOT, 'js', 'app', '00-bootstrap.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m); };

function load(mutate) {
  const window = {}; vm.runInNewContext(CONFIG_SRC, { window, console });
  if (mutate) mutate(window.SOKOHAI_CONFIG);
  return window;
}
const prodCfg = (() => { const m = /skh\.firebaseConfig = (\{[\s\S]*?\});/.exec(BOOT); return vm.runInNewContext('(' + m[1] + ')'); })();
const STAGING = { apiKey: 'AIzaStagingKeyForTestsOnly000000000000', authDomain: 'sokohai-staging.firebaseapp.com', projectId: 'sokohai-staging', storageBucket: 'sokohai-staging.appspot.com', appId: '1:111:web:staging' };
function resolve(host, opts = {}) {
  const w = load(opts.mutate);
  return w.skhResolveFirebaseEnv({ hostname: host, emulator: !!opts.emulator, productionConfig: opts.prod || prodCfg, environments: w.SOKOHAI_CONFIG.FIREBASE_ENVIRONMENTS });
}
const withStaging = (c) => { c.FIREBASE_ENVIRONMENTS.staging.firebase = Object.assign({}, STAGING); };

t('shipped config: production project is sokonet-3b847 and matches the SDK config in 00-bootstrap.js', () => {
  const w = load(); const e = w.SOKOHAI_CONFIG.FIREBASE_ENVIRONMENTS;
  ok(e.production.projectId === 'sokonet-3b847' && prodCfg.projectId === 'sokonet-3b847', JSON.stringify(e.production));
  ok(e.staging.firebase === null, 'staging must ship EMPTY until the staging project exists');
});
for (const h of ['sokohai.com', 'www.sokohai.com', 'sokohaicom.netlify.app', 'sokohaimarket.netlify.app', 'SOKOHAI.COM', 'www.sokohai.com.']) {
  t('production host ' + h + ' -> production', () => { const r = resolve(h); ok(r.env === 'production' && r.config.projectId === 'sokonet-3b847', JSON.stringify(r)); });
}
const BLOCKED = [
  'deploy-preview-12--sokohaicom.netlify.app', 'main--sokohaicom.netlify.app', 'pilot-completion-20261114--sokohaimarket.netlify.app',
  '6731a2b3c4d5e6f7a8b9c0d1--sokohaicom.netlify.app', 'sokohaicom.netlify.app.evil.example', 'evil-sokohai.com', 'sokohai.com.evil.example',
  'xsokohai.com', 'sokohai.co', 'localhost', '127.0.0.1', 'sokonet-3b847.web.app', 'sokonet-3b847.firebaseapp.com', 'example.com', ''
];
for (const h of BLOCKED) {
  t('host "' + h + '" -> NOT configured (no Firebase)', () => { const r = resolve(h); ok(r.env === null && r.config === null, JSON.stringify(r)); });
}
t('Netlify deploy previews of the production site never get the production config, even with staging configured', () => {
  for (const h of ['deploy-preview-1--sokohaicom.netlify.app', 'branch--sokohaimarket.netlify.app']) { const r = resolve(h, { mutate: withStaging }); ok(r.env === null, h + ' ' + JSON.stringify(r)); }
});
t('staging site while staging is NOT configured -> blocked, never falls back to production', () => {
  for (const h of ['sokohai-staging.netlify.app', 'deploy-preview-4--sokohai-staging.netlify.app']) { const r = resolve(h); ok(r.env === null && r.reason === 'staging-not-configured', JSON.stringify(r)); }
});
t('staging site + its branch / preview deploys -> the staging project only', () => {
  for (const h of ['sokohai-staging.netlify.app', 'deploy-preview-4--sokohai-staging.netlify.app', 'dev-staging-hardening-20261116--sokohai-staging.netlify.app']) {
    const r = resolve(h, { mutate: withStaging });
    ok(r.env === 'staging' && r.config.projectId === 'sokohai-staging' && r.config.apiKey === STAGING.apiKey && r.appCheckSiteKey === '', h + ' ' + JSON.stringify(r));
  }
});
t('look-alike staging hosts are blocked', () => {
  for (const h of ['sokohai-staging.netlify.app.evil.example', 'x--sokohai-staging.netlify.app.evil.example', '--sokohai-staging.netlify.app', 'evilsokohai-staging.netlify.app', 'a--evil-sokohai-staging.netlify.app']) {
    const r = resolve(h, { mutate: withStaging }); ok(r.env === null, h + ' ' + JSON.stringify(r));
  }
});
t('a staging config that points at the production project (or reuses its apiKey/appId) is refused', () => {
  for (const bad of [{ projectId: 'sokonet-3b847' }, { apiKey: prodCfg.apiKey }, { appId: prodCfg.appId }]) {
    const r = resolve('sokohai-staging.netlify.app', { mutate: (c) => { c.FIREBASE_ENVIRONMENTS.staging.firebase = Object.assign({}, STAGING, bad); } });
    ok(r.env === null && r.reason === 'staging-points-at-production', JSON.stringify(r));
  }
});
t('an incomplete staging config is refused', () => {
  const r = resolve('sokohai-staging.netlify.app', { mutate: (c) => { c.FIREBASE_ENVIRONMENTS.staging.firebase = { projectId: 'sokohai-staging' }; } });
  ok(r.env === null && r.reason === 'staging-not-configured', JSON.stringify(r));
});
t('production host with a mismatched SDK config is refused', () => {
  const r = resolve('sokohai.com', { prod: Object.assign({}, prodCfg, { projectId: 'other-project' }) }); ok(r.env === null && r.reason === 'production-config-mismatch', JSON.stringify(r));
});
t('local emulator (verified by 00-bootstrap.js) -> emulator; App Check off', () => {
  const r = resolve('localhost', { emulator: true }); ok(r.env === 'emulator' && r.appCheckSiteKey === '', JSON.stringify(r));
});
t('00-bootstrap.js: the gate runs before the only initializeApp, throws when blocked, and shows the message', () => {
  const gate = BOOT.indexOf('skhResolveFirebaseEnv('), init = BOOT.indexOf('skh.fApp = skh.initializeApp(');
  ok(gate > 0 && init > gate, 'order gate=' + gate + ' init=' + init);
  ok((BOOT.match(/initializeApp\(/g) || []).length === 1, 'exactly one initializeApp( call');
  ok(/throw new Error\('SKH_ENV_NOT_CONFIGURED: '/.test(BOOT), 'throws to stop every module that imports skh');
  ok(/Environment not configured/.test(BOOT), 'message');
  ok(BOOT.indexOf('skh.emulator = (function') < gate, 'emulator detection happens before the gate');
  ok(!/FIREBASE_BY_HOST/.test(BOOT + CONFIG_SRC), 'old fall-through-to-production map removed');
});
t('no other file initialises Firebase or hard-codes another config', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const hits = walk(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !f.endsWith(path.join('app', '00-bootstrap.js'))).filter(f => /initializeApp\s*\(|apiKey:\s*["']AIza/.test(fs.readFileSync(f, 'utf8')));
  ok(!hits.length, hits.join(', '));
});
console.log(`FIREBASE ENV: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

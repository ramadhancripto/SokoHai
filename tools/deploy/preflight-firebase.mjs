#!/usr/bin/env node
/* SokoHai — Firebase deploy pre-flight.                                  [HARDENING 2026-11-16]
 * Called by tools/deploy/DEPLOY-FIREBASE.bat BEFORE anything is uploaded. It never deploys,
 * never prints secret values and never changes or deletes a file. Exit 0 = safe to continue.
 *
 *   node tools/deploy/preflight-firebase.mjs --target staging|production --project <projectId>
 *        [--phase static|full] [--projects-file <firebase projects:list --json output>]
 *        [--root <repo>] [--skip-ports] [--skip-git]
 *
 * Checks
 *  1. --project is a LITERAL project ID: not "default", not any alias from .firebaserc, valid
 *     Firebase ID syntax, and exactly the ID registered for --target in tools/deploy/firebase-targets.json
 *     (staging and production can never be the same project).
 *  2. functions/ (what Cloud Functions uploads) holds no stray secrets or backups: no .env other than
 *     .env.<project>, no service-account / adminsdk / ADC JSON, keys, admin-login/auth-*.json,
 *     token.txt, *.backup*, *.bak, *.orig, *~.
 *  3. functions/.env.<project> exists and sets SUPER_ADMIN_EMAILS. Staging may not point PesaPal at
 *     the LIVE endpoint (no real money in staging).
 *  4. No local SokoHai server / emulator is running (ports 5055, 8085, 9099, 4000, 4400, 4500, 9150, 5001).
 *  5. Tracked files have no uncommitted edits (the deployed code is a known commit).
 *  6. (--phase full) the project exists in `firebase projects:list --json` for the signed-in account.
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const ROOT = path.resolve(String(opt('root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'))));
const TARGET = String(opt('target', '')).trim().toLowerCase();
const PROJECT = String(opt('project', '')).trim();
const PHASE = String(opt('phase', 'static'));
const errors = [], notes = [];
const fail = (m) => errors.push(m);

export const PORTS = [5055, 8085, 9099, 4000, 4400, 4500, 9150, 5001];
export const ID_RX = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

/** Files in functions/ that must never sit next to deployable code. Returns the reason or null. */
export function forbiddenReason(rel, project) {
  const base = rel.split(/[\\/]/).pop();
  const low = base.toLowerCase();
  if (/^\.env(\.|$)/i.test(base)) {
    if (base === '.env.' + project && rel === base) return null;
    if (base === '.env') return '.env ya jumla (inapakiwa kwa KILA mradi - tumia .env.<projectId>)';
    return 'faili la .env lisilohusika na mradi huu';
  }
  if (low === '.runtimeconfig.json') return 'runtime config ya zamani (siri)';
  if (/service-?account/i.test(base) && /\.json$/i.test(base)) return 'funguo za service account';
  if (/firebase-adminsdk/i.test(base)) return 'funguo za firebase-adminsdk';
  if (low === 'application_default_credentials.json') return 'credentials za gcloud';
  if (low === 'admin-login.json' || /^auth-.*\.json$/i.test(base) || low === 'token.txt') return 'faili la kuingia/token';
  if (/\.(pem|key|p12|pfx)$/i.test(base)) return 'funguo binafsi';
  if (/\.backup/i.test(base) || /\.(bak|orig|old)$/i.test(base) || /~$/.test(base)) return 'nakala ya backup';
  return null;
}

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), r)); else out.push(r);
  }
  return out;
}

function parseEnvKeys(text) {
  const keys = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) keys[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return keys;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(400, () => done(false)); s.once('connect', () => done(true)); s.once('error', () => done(false));
  });
}

async function main() {
  // ---- 1. literal project ID for the chosen target ----
  if (TARGET !== 'staging' && TARGET !== 'production') fail('--target lazima iwe staging au production.');
  let targets = {};
  try { targets = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'deploy', 'firebase-targets.json'), 'utf8')); } catch (e) { fail('tools/deploy/firebase-targets.json haisomeki: ' + e.message); }
  let aliases = [];
  try { const rc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8')); aliases = Object.keys(rc.projects || {}); } catch (e) { /* no .firebaserc = no aliases */ }
  const prodId = targets.production && targets.production.projectId;
  const expected = targets[TARGET] && targets[TARGET].projectId;
  if (!PROJECT) fail('Project ID haijaandikwa.');
  else if (PROJECT.toLowerCase() === 'default' || aliases.includes(PROJECT)) fail(`"${PROJECT}" ni ALIAS (.firebaserc), si project ID. Andika project ID halisi.`);
  else if (!ID_RX.test(PROJECT)) fail(`"${PROJECT}" si project ID halali ya Firebase (herufi ndogo, namba na '-', urefu 6-30).`);
  else if (!expected) fail(`firebase-targets.json haina projectId ya "${TARGET}". Jaza tools/deploy/firebase-targets.json kwanza (Hatua 1 ya mwongozo).`);
  else if (PROJECT !== expected) fail(`"${PROJECT}" si mradi uliosajiliwa kwa ${TARGET} (${expected}). Hakuna deploy.`);
  if (targets.staging && targets.staging.projectId && targets.staging.projectId === prodId) fail('staging na production zina project ID moja - hairuhusiwi.');
  if (TARGET === 'staging' && PROJECT && PROJECT === prodId) fail('Hiyo ni production, si staging.');

  // ---- 6. the project exists for the signed-in account (firebase projects:list --json) ----
  if (PHASE === 'full') {
    const pf = opt('projects-file', null);
    if (!pf || pf === true) fail('--projects-file inahitajika kwa --phase full.');
    else {
      let list = null;
      try { const j = JSON.parse(fs.readFileSync(String(pf), 'utf8').replace(/^﻿/, '')); list = j && j.status === 'success' && Array.isArray(j.result) ? j.result : null; } catch (e) { list = null; }
      if (!list) fail('Orodha ya miradi kutoka Firebase CLI haisomeki (umeingia? `firebase login`).');
      else if (!list.some(p => p && p.projectId === PROJECT)) fail(`Mradi "${PROJECT}" haupo kwenye akaunti uliyoingia nayo (firebase projects:list).`);
      else notes.push(`Mradi ${PROJECT} upo kwenye akaunti yako.`);
    }
  }

  // ---- 2. no secrets / backups in the upload folder ----
  const fdir = path.join(ROOT, 'functions');
  if (!fs.existsSync(path.join(fdir, 'index.js'))) fail('functions/index.js haipo - folda si sahihi.');
  else {
    const bad = walk(fdir).map(r => [r, forbiddenReason(r, PROJECT)]).filter(([, why]) => why);
    for (const [r, why] of bad) fail(`functions/${r}: ${why}. Ihamishe NJE ya functions/ (usiifute) kisha rudia.`);
  }

  // ---- 3. per-project env file ----
  if (PROJECT && ID_RX.test(PROJECT)) {
    const envFile = path.join(fdir, '.env.' + PROJECT);
    if (!fs.existsSync(envFile)) fail(`functions/.env.${PROJECT} haipo. Nakili functions/env.template.txt kuwa functions/.env.${PROJECT} na ujaze.`);
    else {
      const keys = parseEnvKeys(fs.readFileSync(envFile, 'utf8'));
      if (!keys.SUPER_ADMIN_EMAILS) fail(`SUPER_ADMIN_EMAILS haijawekwa kwenye functions/.env.${PROJECT}.`);
      if (TARGET === 'staging' && /(^|\/\/)pay\.pesapal\.com/i.test(keys.PESAPAL_BASE_URL || '')) fail('Staging inaelekeza PesaPal LIVE (pay.pesapal.com). Tumia sandbox (cybqa.pesapal.com) - hakuna pesa halisi kwenye staging.');
      notes.push(`functions/.env.${PROJECT}: funguo ${Object.keys(keys).length} (thamani hazionyeshwi).`);
    }
  }

  // ---- 4. local servers off ----
  if (opt('skip-ports', false) !== true) {
    const open = [];
    for (const p of PORTS) if (await portOpen(p)) open.push(p);
    if (open.length) fail(`Server ya local bado inaendesha (port ${open.join(', ')}). Funga madirisha ya ANZISHA-SOKOHAI-PILOT / emulator kwanza, kisha rudia.`);
  }

  // ---- 5. known commit ----
  if (opt('skip-git', false) !== true) {
    try {
      const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
      if (dirty) fail('Kuna mabadiliko yasiyocommitiwa kwenye faili za mfumo:\n    ' + dirty.split('\n').slice(0, 10).join('\n    '));
      notes.push('Commit: ' + execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim());
    } catch (e) { fail('git haipatikani au folda si repo: ' + String(e.message).split('\n')[0]); }
  }

  for (const n of notes) console.log('  - ' + n);
  if (errors.length) {
    console.log('\n[X] PRE-FLIGHT IMESHINDWA (' + errors.length + '):');
    for (const e of errors) console.log('  * ' + e);
    console.log('\nHakuna kilichopakiwa wala kubadilishwa.');
    process.exit(1);
  }
  console.log(`[OK] Pre-flight (${PHASE}) imepita: target=${TARGET} project=${PROJECT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('[X] pre-flight crash: ' + (e && e.message)); process.exit(2); });
}

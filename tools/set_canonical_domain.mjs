#!/usr/bin/env node
/* [R-19 2026-11-20] Switch the canonical public origin in ONE step, consistently:
 *   node tools/set_canonical_domain.mjs https://sokohai.com [--root <dir>]
 * Rewrites the current canonical origin (read from functions/site-domain.js) in the files below, then
 * rebuilds index.html from html/. It changes ONLY repository files: DNS, the Netlify custom domain,
 * certificates and redirects are the owner's actions (see OWNER-DECISIONS-REQUIRED.md). Run it only after
 * the new origin actually serves the site, otherwise canonical/OG links would point at a dead domain. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const ri = args.indexOf('--root');
const ROOT = ri !== -1 ? path.resolve(args[ri + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = String(args.find((a, i) => !a.startsWith('--') && (ri === -1 || i !== ri + 1)) || '').replace(/\/+$/, '');
export const FILES = ['html/00-head.html', 'robots.txt', '.well-known/security.txt', 'functions/site-domain.js', 'js/00-config.js', 'js/app/00-bootstrap.js'];
const site = fs.readFileSync(path.join(ROOT, 'functions/site-domain.js'), 'utf8');
const current = /const CANONICAL_ORIGIN = '([^']+)'/.exec(site)[1];
const prod = JSON.parse(/const PRODUCTION_ORIGINS = (\[[^\]]*\])/.exec(site)[1].replace(/'/g, '"'));
if (!/^https:\/\/[a-z0-9.-]+$/.test(target)) { console.error('Usage: node tools/set_canonical_domain.mjs https://<host>'); process.exit(2); }
if (!prod.includes(target)) { console.error(target + ' is not in PRODUCTION_ORIGINS (functions/site-domain.js) / FIREBASE_ENVIRONMENTS.production.'); process.exit(2); }
if (target === current) { console.log('Canonical origin is already ' + current); process.exit(0); }
const esc = current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let total = 0;
for (const f of FILES) {
  const p = path.join(ROOT, f); const before = fs.readFileSync(p, 'utf8');
  // site-domain.js keeps the full PRODUCTION_ORIGINS list; only its CANONICAL_ORIGIN line changes
  const after = f === 'functions/site-domain.js'
    ? before.replace(`const CANONICAL_ORIGIN = '${current}'`, `const CANONICAL_ORIGIN = '${target}'`)
    : f === 'js/00-config.js' ? before.replace(`CANONICAL_ORIGIN: '${current}'`, `CANONICAL_ORIGIN: '${target}'`)
    : before.replace(new RegExp(esc + '(?=[/"\'<\\s]|$)', 'g'), target);
  const n = before === after ? 0 : (before.match(new RegExp(esc, 'g')) || []).length - (after.match(new RegExp(esc, 'g')) || []).length;
  if (before !== after) fs.writeFileSync(p, after);
  total += n; console.log(`  ${f}: ${n} reference(s)`);
}
execFileSync('python3', [path.join(ROOT, 'tools', 'build_html.py')], { cwd: ROOT, stdio: 'inherit' });
console.log(`Canonical origin ${current} -> ${target} (${total} references). Run npm test, commit, then deploy.`);

#!/usr/bin/env node
/**
 * [REPAIR 2026-10 C5] Build the PUBLIC site into dist/ from an allow-list.
 *
 * Netlify previously published the repository root, which exposed server
 * source, seed scripts with credentials, backup rules, reports and three old
 * copies of the app. Only the files the browser actually needs are copied
 * here; everything else stays private. No dependencies, Node >= 18.
 *
 *   node tools/build_dist.mjs          -> builds dist/
 *   node tools/build_dist.mjs --check  -> builds, then fails if a forbidden file slipped in
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');

// Whole directories copied recursively (with per-file filters below).
const DIRS = ['css', 'js', 'img', 'vendor', 'shared'];
// Single files.
const FILES = [
  'index.html', 'robots.txt', 'sokohai-manifest.json', 'sokohai-sw.js',
  'icon-192.png', 'icon-512.png', 'assets/sokohai-s-mark.png',
  'fonts/inter.css', 'fonts/sokohai-sw.js'
];
// fonts/*.ttf only (fonts/ also holds a retired copy of the whole app).
const FONT_EXT = new Set(['.ttf', '.woff', '.woff2']);

const DENY_NAME = [/\.backup/i, /\.bak$/i, /\.patch$/i, /\.log$/i, /\.md$/i, /\.env/i, /^package(-lock)?\.json$/i,
  /service-account/i, /adminsdk/i, /token\.txt$/i, /auth-.*\.json$/i, /admin-login\.json$/i, /\.mjs\.map$/i];
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif',
  '.ico', '.ttf', '.woff', '.woff2', '.txt']);

function denied(rel) {
  const base = path.basename(rel);
  if (DENY_NAME.some(r => r.test(base))) return true;
  return !ALLOWED_EXT.has(path.extname(base).toLowerCase());
}
function copyFile(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) { console.warn('[dist] missing (skipped):', rel); return 0; }
  if (denied(rel)) return 0;
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return 1;
}
function copyDir(relDir) {
  let n = 0;
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return 0;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(relDir, ent.name);
    if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
    if (ent.isDirectory()) n += copyDir(rel);
    else if (ent.isFile()) n += copyFile(rel);
  }
  return n;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let count = 0;
for (const d of DIRS) count += copyDir(d);
for (const f of FILES) count += copyFile(f);
for (const f of fs.readdirSync(path.join(ROOT, 'fonts'))) {
  if (FONT_EXT.has(path.extname(f).toLowerCase())) count += copyFile(path.join('fonts', f));
}
console.log(`[dist] ${count} files -> ${path.relative(ROOT, OUT)}/`);

if (process.argv.includes('--check')) {
  const bad = [];
  const forbiddenTop = ['functions', 'tools', 'docs', '_originals', '_old_fonts_project', 'reviews', 'scripts', '_recovery', 'node_modules'];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(OUT, abs);
      if (ent.isDirectory()) {
        if (forbiddenTop.includes(rel.split(path.sep)[0])) bad.push(rel);
        if (rel === path.join('fonts', 'js') || rel === path.join('fonts', 'functions') || rel === path.join('assets', 'functions')) bad.push(rel);
        walk(abs);
      } else if (denied(rel) || /seed-|firestore\.rules|firebase\.json|\.firebaserc/.test(rel)) bad.push(rel);
    }
  })(OUT);
  if (!fs.existsSync(path.join(OUT, 'index.html'))) bad.push('index.html missing');
  if (bad.length) { console.error('[dist] FORBIDDEN or missing:', bad); process.exit(1); }
  console.log('[dist] check OK: only public files are present.');
}

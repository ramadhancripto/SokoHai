#!/usr/bin/env node
/**
 * [85%-PUSH 2026-11-08] Uthibitisho wa usawa wa CSS (skeleton kwa skeleton).
 *
 * Kwa kila faili ya CSS inayopakiwa na index.html, inalinganisha skeleton ya
 * chanzo (ROOT) na skeleton ya dist/:
 *
 *   skeleton = comments zikiondolewa + whitespace YOTE nje ya strings ikiondolewa
 *
 * Kama skeleton zinalingana, dist inatofautiana na chanzo kwa
 * whitespace/comments PEKEE — hakuna selector, property, thamani, wala string
 * iliyobadilika. Pia inahesabu rules (`{`) na `;` pande zote mbili kama
 * ukaguzi wa ziada (tofauti ya `;` inaruhusiwa tu kama zote zilizopotea
 * zilikuwa ndani ya comments — lango hili hukagua hilo moja kwa moja).
 *
 * Kutoka: node tools/build_dist.mjs --minify --check (baada ya verify_minify.mjs).
 * Hakuna dependency. Node >= 18. Exit 0 = SAWA, 1 = KOSA.
 */
import fs from 'node:fs';
import path from 'node:path';
import { skeleton, loadedCss } from './minify_css.mjs';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const JSON_MODE = process.argv.includes('--json');

/** Hesabu `;` ambazo ziko NJE ya comments (strings hazina `;` zinazohesabika vibaya — lakini tunazilinda pia). */
function semisOutsideComments(src) {
  const noCom = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return (noCom.match(/;/g) || []).length;
}
function rulesOf(src) {
  const noCom = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // `{` ndani ya strings ni nadra sana; skeleton ndiyo lango kuu, hii ni ziada.
  return (noCom.match(/\{/g) || []).length;
}

const loaded = loadedCss(ROOT);
const results = [];
let skelDiffs = 0, semiDiffs = 0, missing = 0;

for (const rel of loaded) {
  const srcPath = path.join(ROOT, rel);
  const dstPath = path.join(DIST, rel);
  if (!fs.existsSync(srcPath)) { missing++; results.push({ rel, status: 'HAIPO_chanzo' }); continue; }
  if (!fs.existsSync(dstPath)) { missing++; results.push({ rel, status: 'HAIPO_dist' }); continue; }

  const src = fs.readFileSync(srcPath, 'utf8');
  const dst = fs.readFileSync(dstPath, 'utf8');

  const skelOk = skeleton(src) === skeleton(dst);
  if (!skelOk) skelDiffs++;

  // Ukaguzi wa ziada: `;` nje ya comments lazima zilingane (minifier haiondoi `;`).
  const semisOk = semisOutsideComments(src) === semisOutsideComments(dst);
  if (!semisOk) semiDiffs++;

  const status = skelOk && semisOk ? 'SAWA' : (!skelOk ? 'SKELETON' : 'SEMICOLON');
  // Mahali pa kwanza panapotofautiana (kwa skeleton) — kwa uchunguzi.
  let firstDiff = -1;
  if (!skelOk) {
    const a = skeleton(src), b = skeleton(dst);
    const m = Math.min(a.length, b.length);
    let k = 0;
    while (k < m && a[k] === b[k]) k++;
    firstDiff = k;
    results.push({
      rel, status, firstDiff: { at: k, src: a.slice(k, k + 60), dst: b.slice(k, k + 60) },
      unchanged: src === dst, srcKB: +(Buffer.byteLength(src) / 1024).toFixed(1),
      dstKB: +(Buffer.byteLength(dst) / 1024).toFixed(1), rules: rulesOf(src)
    });
    continue;
  }
  results.push({
    rel, status, unchanged: src === dst,
    srcKB: +(Buffer.byteLength(src) / 1024).toFixed(1),
    dstKB: +(Buffer.byteLength(dst) / 1024).toFixed(1), rules: rulesOf(src)
  });
}

const ok = results.filter((r) => r.status === 'SAWA');
const bad = results.filter((r) => r.status !== 'SAWA');
const totalRules = results.reduce((a, r) => a + (r.rules || 0), 0);
const totalSrc = results.reduce((a, r) => a + (r.srcKB || 0), 0);
const totalDst = results.reduce((a, r) => a + (r.dstKB || 0), 0);
const unchanged = results.filter((r) => r.unchanged).length;

if (JSON_MODE) {
  console.log(JSON.stringify({
    files: loaded.length, ok: ok.length, bad: bad.length,
    skelDiffs, semiDiffs, missing, rules: totalRules,
    srcKB: Math.round(totalSrc), dstKB: Math.round(totalDst),
    failures: bad
  }, null, 1));
} else {
  console.log('\n=== UTHIBITISHO WA USAWA WA CSS (skeleton kwa skeleton) ===');
  console.log(`  faili zinazopakiwa  : ${loaded.length}`);
  console.log(`  zimehakikiwa SAWA   : ${ok.length}`);
  console.log(`  tofauti             : ${bad.length}`);
  console.log(`    - skeleton        : ${skelDiffs}`);
  console.log(`    - semicolon       : ${semiDiffs}`);
  console.log(`  rules zilizohakikiwa: ${totalRules.toLocaleString()}`);
  console.log(`  faili hazipo        : ${missing}`);
  console.log(`  faili ambazo hazikubadilika (haikupunguzwa): ${unchanged}`);
  if (bad.length) {
    console.log('\n  --- TOFAUTI ---');
    for (const r of bad.slice(0, 15)) {
      console.log(`  ${r.status.padEnd(11)} ${r.rel}`);
      if (r.firstDiff) console.log(`     herufi #${r.firstDiff.at}: chanzo=...${r.firstDiff.src}...  dist=...${r.firstDiff.dst}...`);
    }
    if (bad.length > 15) console.log(`  ... na ${bad.length - 15} zaidi`);
  }
}

const pass = bad.length === 0;
console.log(pass
  ? '\n  ✓ USAWA WA CSS UMETHIBITIKA: skeleton inafanana KABISA; `;` zote zipo.'
  : '\n  ✗ KOSA: kuna tofauti ya CSS. Rebuild dist bila --minify.');
process.exit(pass ? 0 : 1);

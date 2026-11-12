#!/usr/bin/env node
/**
 * [AWAMU D2] Uthibitisho wa usawa wa minification — TOKEN kwa TOKEN.
 *
 * Injini yetu (tools/minify_js.mjs) inahifadhi token zote kwa ujenzi: hutokenize
 * chanzo kisha huandika tena token ZILE ZILE kwa mpangilio ule ule, ikibadilisha
 * nafasi pekee. Kwa hiyo kipimo cha usawa ni: mtiririko wa token uwe SAWA KABISA.
 *
 * Kumbuka ya historia: nilijaribu esbuild kwenye pilot. Token hazikufanana kwa
 * sababu esbuild huondoa semicolon zisizohitajika, hugeuza `undefined` -> `void 0`,
 * na HUWEZA kubadilisha jina la kibadilishi cha ndani. Ndiyo sababu injini
 * ilibadilishwa; kipimo hiki ndicho kinacholinda dhidi ya kurudi nyuma.
 *
 *   node tools/verify_minify.mjs            -> hakiki dist/ dhidi ya chanzo
 *   node tools/verify_minify.mjs --json     -> matokeo kwa JSON
 *
 * Inaangalia:
 *   1. AST: chanzo == dist kwa faili KILA moja inayopakiwa na index.html.
 *   2. Seti ya `window.X = ...` inafanana kwa faili kila moja.
 *   3. index.html: dist == chanzo kwa byte (mpangilio wa scripts haujabadilika).
 *
 * Exit code 1 kama kuna tofauti yoyote.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tokenizer } from 'acorn';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const JSON_MODE = process.argv.includes('--json');

/* ---------------- token stream ---------------- */

const TOKENIZER_BASE = {
  ecmaVersion: 'latest',
  allowHashBang: true,
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  allowImportExportEverywhere: true
};

/** Mtiririko wa token: `label\0value` kwa kila token, kwa mpangilio. */
function tokensOf(code, file) {
  let lastErr = null;
  for (const sourceType of ['module', 'script']) {
    try {
      const t = tokenizer(code, { ...TOKENIZER_BASE, sourceType });
      const out = [];
      for (;;) {
        const k = t.getToken();
        if (k.type.label === 'eof') break;
        let v = k.value;
        if (v && typeof v === 'object') v = k.type.label === 'regexp' ? `/${v.pattern}/${v.flags}` : String(v);
        out.push(k.type.label + '\u0000' + String(v));
      }
      return out;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`${file}: tokenize imeshindwa: ${lastErr && lastErr.message}`);
}

const globalsOf = (code) => {
  const s = new Set();
  for (const m of code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) s.add(m[1]);
  return [...s].sort();
};

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* ---------------- faili zinazolengwa ---------------- */

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const loaded = [];
const seen = new Set();
for (const m of html.matchAll(/<script[^>]*\bsrc="([^"?#]+\.js)(?:\?[^"#]*)?"/g)) {
  if (!seen.has(m[1])) { seen.add(m[1]); loaded.push(m[1]); }
}

/* ---------------- hakiki ---------------- */

const results = [];
let astDiffs = 0, globalDiffs = 0, parseErrors = 0, missing = 0;

for (const rel of loaded) {
  const srcPath = path.join(ROOT, rel);
  const dstPath = path.join(DIST, rel);
  if (!fs.existsSync(srcPath)) { missing++; results.push({ rel, status: 'HAIPO_chanzo' }); continue; }
  if (!fs.existsSync(dstPath)) { missing++; results.push({ rel, status: 'HAIPO_dist' }); continue; }

  const src = fs.readFileSync(srcPath, 'utf8');
  const dst = fs.readFileSync(dstPath, 'utf8');

  let a, b;
  try {
    a = tokensOf(src, rel);
    b = tokensOf(dst, rel);
  } catch (e) {
    parseErrors++;
    results.push({ rel, status: 'PARSE_KOSA', note: e.message.slice(0, 130) });
    continue;
  }

  const g1 = globalsOf(src), g2 = globalsOf(dst);
  const globalsOk = JSON.stringify(g1) === JSON.stringify(g2);
  if (!globalsOk) globalDiffs++;

  let tokensOk = a.length === b.length;
  let firstDiff = -1;
  if (tokensOk) {
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { tokensOk = false; firstDiff = i; break; } }
  }
  if (!tokensOk) astDiffs++;

  const identical = src === dst;
  results.push({
    rel,
    status: tokensOk && globalsOk ? 'SAWA' : (!tokensOk ? 'TOKEN' : 'GLOBAL'),
    tokens: a.length,
    firstDiff: firstDiff >= 0 ? { at: firstDiff, src: a[firstDiff], dst: b[firstDiff] } : undefined,
    unchanged: identical,
    srcKB: +(Buffer.byteLength(src) / 1024).toFixed(1),
    dstKB: +(Buffer.byteLength(dst) / 1024).toFixed(1),
    globals: g1.length
  });
}

/* ---------------- index.html ---------------- */

const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'));
const idxDst = fs.readFileSync(path.join(DIST, 'index.html'));
const indexSame = sha(idxSrc) === sha(idxDst);

/* ---------------- ripoti ---------------- */

const ok = results.filter((r) => r.status === 'SAWA');
const bad = results.filter((r) => r.status !== 'SAWA');
const totalSrc = results.reduce((a, r) => a + (r.srcKB || 0), 0);
const totalDst = results.reduce((a, r) => a + (r.dstKB || 0), 0);
const unchanged = results.filter((r) => r.unchanged).length;

if (JSON_MODE) {
  console.log(JSON.stringify({
    files: loaded.length, ok: ok.length, bad: bad.length,
    astDiffs, globalDiffs, parseErrors, missing, indexSame,
    srcKB: Math.round(totalSrc), dstKB: Math.round(totalDst),
    failures: bad
  }, null, 1));
} else {
  console.log('\n=== UTHIBITISHO WA USAWA (token kwa token) ===');
  console.log(`  faili zinazopakiwa  : ${loaded.length}`);
  console.log(`  zimehakikiwa SAWA   : ${ok.length}`);
  console.log(`  tofauti             : ${bad.length}`);
  console.log(`    - token stream     : ${astDiffs}`);
  console.log(`    - global (window.X): ${globalDiffs}`);
  console.log(`  token zilizohakikiwa: ${results.reduce((a, r) => a + (r.tokens || 0), 0).toLocaleString()}`);
  console.log(`  tokenize errors     : ${parseErrors}`);
  console.log(`  faili hazipo        : ${missing}`);
  console.log(`  faili ambazo hazikubadilika (haikupunguzwa): ${unchanged}`);
  console.log(`  index.html byte-sawa: ${indexSame ? 'NDIYO' : 'HAPANA'}`);

  if (bad.length) {
    console.log('\n  --- TOFAUTI ---');
    for (const r of bad.slice(0, 15)) {
      console.log(`  ${r.status.padEnd(11)} ${r.rel}${r.note ? ' | ' + r.note : ''}`);
      if (r.firstDiff) console.log(`     token #${r.firstDiff.at}: chanzo=${r.firstDiff.src.replace('\u0000', '=')}  dist=${r.firstDiff.dst.replace('\u0000', '=')}`);
    }
    if (bad.length > 15) console.log(`  ... na ${bad.length - 15} zaidi`);
  }
}

const pass = bad.length === 0 && indexSame;
console.log(pass
  ? '\n  ✓ USAWA UMETHIBITIKA: mtiririko wa token unafanana KABISA; index.html haijabadilika.'
  : '\n  ✗ KOSA: kuna tofauti. Rebuild dist bila --minify.');
process.exit(pass ? 0 : 1);

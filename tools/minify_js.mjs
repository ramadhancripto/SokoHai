#!/usr/bin/env node
/**
 * SokoHai — whitespace-only JavaScript minifier (AWAMU D2)
 *
 * HUANDIKA KATIKA dist/ PEKEE. Chanzo (js/, shared/) HAKIGUSWI.
 *
 * ============================================================
 *  KWA NINI HATUMTUMII esbuild/terser HAPA
 * ============================================================
 * Nilijaribu esbuild kwenye pilot (Awamu D). Uthibitisho wa token kwa token
 * ukafichua kwamba "minifyWhitespace" ya esbuild HAIFANYI whitespace pekee:
 *
 *   1. Hupunguza semicolon zisizohitajika   (r.unregister();  ->  r.unregister())
 *   2. Hugeuza `{x: x}` kuwa `{x}`           (shorthand)
 *   3. Hugeuza `undefined` kuwa `void 0`
 *   4. HUWEZA KUBADILISHA JINA la kibadilishi cha ndani
 *      (kwa mfano parameter `action` -> `action2` kwenye 06-product-builder.js)
 *
 * Namba 4 inavuka sharti la mmiliki: "hakuna identifier mangling wala syntax
 * transformation". Kwa hiyo module hii inatumia njia inayothibitika:
 *
 *   Tokenize faili kwa acorn, kisha andika tena token ZILE ZILE kwa mpangilio
 *   ule ule, ukibadilisha nafasi PEKEE kati yao:
 *     - pengo lililokuwa na mstari mpya  -> "\n"   (ASI haibadiliki KAMWE)
 *     - pengo lililokuwa na nafasi       -> " "
 *     - pengo tupu (tokens zimeungana)   -> ""
 *
 *   Matokeo: mtiririko wa token ni SAWA KABISA na chanzo. Hakuna jina
 *   linalobadilika, hakuna sintaksia inayopangwa upya, hakuna token
 *   inayoongezwa au kuondolewa. Comments pekee ndizo zinazotolewa — na
 *   `/*! ... *\/` / `@license` zinahifadhiwa.
 *
 *   Gharama: brotli 1,055 KB dhidi ya 1,012 KB ya esbuild = 43 KB (1.9% ya
 *   ukurasa) zaidi. Tunachukua gharama hiyo kwa ajili ya uhakika.
 *
 * ============================================================
 *   node tools/minify_js.mjs --check     -> ripoti tu (hakuna kuandika)
 *   node tools/minify_js.mjs --stats     -> takwimu za faili zinazolengwa
 * ============================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ *
 *  Msingi: token-preserving whitespace minification
 * ------------------------------------------------------------------ */

const TOKENIZER_BASE = {
  ecmaVersion: 'latest',
  allowHashBang: true,
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  allowImportExportEverywhere: true
};

/** Tokenize; inarudi [{start,end,label,value}] na comments zilizopatikana. */
function tokenize(code, file) {
  const comments = [];
  for (const sourceType of ['module', 'script']) {
    try {
      const { tokenizer } = acornRef();
      const t = tokenizer(code, { ...TOKENIZER_BASE, sourceType, onComment: comments });
      const out = [];
      for (;;) {
        const k = t.getToken();
        if (k.type.label === 'eof') break;
        out.push({ start: k.start, end: k.end });
      }
      return { tokens: out, comments };
    } catch (e) {
      if (sourceType === 'script') throw new Error(`${file}: tokenize imeshindwa: ${e.message}`);
    }
  }
}

// acorn hupakiwa kwa lazy import ili build ya kawaida isihitaji dependency.
let _acorn = null;
function acornRef() {
  if (!_acorn) throw new Error('ACORN_HAIPO');
  return _acorn;
}
export async function loadAcorn() {
  try {
    _acorn = await import('acorn');
  } catch {
    throw new Error('Kupunguza ukubwa (--minify) kunahitaji acorn. Sakinisha: npm i -D acorn');
  }
}

const KEEP_COMMENT = /^\/\*!|@license|@preserve/i;

/**
 * Hupunguza nafasi pekee. Token zote zinabaki zile zile, kwa mpangilio ule ule.
 * @returns {{code:string, tokens:number, removedComments:number}}
 */
export function minifyWhitespace(code, file = '?') {
  const { tokens, comments } = tokenize(code, file);

  let out = '';
  let prevEnd = 0;
  let first = true;

  for (const t of tokens) {
    const gap = code.slice(prevEnd, t.start);

    if (!first) {
      const hasNewline = gap.includes('\n') || gap.includes('\r');
      if (hasNewline) out += '\n';
      else if (gap.length) out += ' ';
    }

    out += code.slice(t.start, t.end);
    prevEnd = t.end;
    first = false;
  }

  // Leseni: `/*! ... */` na @license hazitolewi.
  const kept = comments.filter((c) => KEEP_COMMENT.test(typeof c === 'string' ? c : c.value || ''));
  if (kept.length) out = kept.map((c) => (c.type === 'Block' ? `/*${c.value}*/` : `//${c.value}`)).join('\n') + '\n' + out;

  return { code: out, tokens: tokens.length, removedComments: comments.length - kept.length };
}

/* ------------------------------------------------------------------ *
 *  Faili zinazolengwa: zile ambazo index.html inapakia
 * ------------------------------------------------------------------ */

export function loadedJs(rootDir = ROOT) {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const seen = new Set();
  const list = [];
  for (const m of html.matchAll(/<script[^>]*\bsrc="([^"?#]+\.js)(?:\?[^"#]*)?"/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); list.push(m[1]); }
  }
  return list;
}

/* ------------------------------------------------------------------ *
 *  CLI
 * ------------------------------------------------------------------ */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  await loadAcorn();
  const files = loadedJs().filter((f) => fs.existsSync(path.join(ROOT, f)));

  let raw = 0, min = 0, tokens = 0, failed = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try {
      const r = minifyWhitespace(src, rel);
      raw += Buffer.byteLength(src);
      min += Buffer.byteLength(r.code);
      tokens += r.tokens;
      if (args.includes('--stats')) {
        console.log(`  ${(Buffer.byteLength(src) / 1024).toFixed(1).padStart(8)} -> ${(Buffer.byteLength(r.code) / 1024).toFixed(1).padStart(7)} KB  ` +
          `${((1 - Buffer.byteLength(r.code) / Buffer.byteLength(src)) * 100).toFixed(0).padStart(3)}%  ${rel}`);
      }
    } catch (e) {
      failed.push(`${rel}: ${e.message.slice(0, 90)}`);
    }
  }
  console.log(`\n[minify] faili ${files.length} | token ${tokens.toLocaleString()} | raw ${(raw / 1024).toFixed(0)} KB -> ${(min / 1024).toFixed(0)} KB (${((1 - min / raw) * 100).toFixed(1)}% ndogo)`);
  if (failed.length) { console.error('[minify] imeshindikana:'); failed.forEach((f) => console.error('   ' + f)); process.exit(1); }
}

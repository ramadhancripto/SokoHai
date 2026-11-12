#!/usr/bin/env node
/**
 * [85%-PUSH 2026-11-08] Whitespace-only minification ya CSS.
 *
 * Falsafa ile ile ya Awamu D2 (tools/minify_js.mjs): kuondoa whitespace na
 * comments PEKEE. Hakuna syntax transformation, hakuna kuondoa `;`, hakuna
 * kuunganisha rules, hakuna kubadilisha thamani yoyote.
 *
 * Sheria za usalama (conservative kwa makusudi — tunapoteza byte chache ili
 * kuepuka kuvunja CSS):
 *   1. Strings ('...' na "...") hunakiliwa verbatim, backslash-aware.
 *   2. `\\` nje ya string hunakiliwa na herufi inayofuata (escapes za selector).
 *   3. Comments (/* ... *\/) huondolewa. (Hakuna license comment kwenye css/ —
 *      imethibitishwa: hakuna / *! wala @license/@preserve.)
 *   4. Ndani ya calc()/min()/max()/clamp() kila kitu hunakiliwa verbatim,
 *      kwa sababu `calc(100% - 20px)` INAHITAJI nafasi kuzunguka - na +.
 *   5. Baada ya @rule (prelude: @media, @supports, @import, n.k.) whitespace
 *      hupunguzwa (collapse) lakini HAIONDOLEWI — inalinda `and`/`or` kati ya
 *      mabano: `(a) and (b)` lazima ibaki na nafasi, vinginevyo `and(` inge
 *      somwa kama function token na query ingevunjika.
 *   6. Nafasi haiondolewi KAMWE kabla ya `(` — inalinda `url (`, `@media (`.
 *   7. Nafasi kati ya maneno huhifadhiwa (descendant combinator `.a .b`,
 *      thamani `0 auto`, `800 12.5px/1 Inter`).
 *   8. `;` zote zinabaki — hata ile ya mwisho kabla ya `}`.
 *
 * Uthibitisho (tools/verify_minify_css.mjs): skeleton(css) = kuondoa comments
 * na whitespace YOTE nje ya strings. Skeleton ya chanzo LAZIMA ilingane na
 * skeleton ya output — hii inathibitisha output inatofautiana na chanzo kwa
 * whitespace/comments pekee.
 *
 * Hakuna dependency. Node >= 18.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Herufi ambazo nafasi inaweza kuondolewa BAADA yake (p = prev emitted).
const DROP_AFTER = new Set(['{', '}', '(', ':', ';', ',', '>', '+', '~']);
// Herufi ambazo nafasi inaweza kuondolewa KABLA yake (c = next char).
// MUHIMU: `(` haipo hapa kwa makusudi (sheria 6).
const DROP_BEFORE = new Set(['{', '}', ')', ':', ';', ',', '>', '+', '~']);

function isWs(c) {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}
function isNameChar(c) {
  const n = c ? c.charCodeAt(0) : -1;
  return (n >= 65 && n <= 90) || (n >= 97 && n <= 122) || (n >= 48 && n <= 57) ||
    c === '_' || c === '-' || n > 127;
}

/**
 * Minify CSS kwa kuondoa whitespace/comments pekee.
 * @returns {{ code: string, rules: number }} rules = idadi ya `{` nje ya strings/comments.
 */
export function minifyCss(src, file = '?') {
  const out = [];
  let prev = '';            // herufi ya mwisho iliyotolewa
  let pendingSpace = false; // tuliona whitespace, hatujaamua bado
  let inPrelude = false;    // tuko baada ya @rule, kabla ya `{` au `;`
  let rules = 0;
  const n = src.length;
  let i = 0;

  function emitSpace(c) {
    // Amua: nafasi kati ya `prev` na `c` iondolewe au ibaki?
    if (inPrelude) { out.push(' '); prev = ' '; return; }
    if (DROP_AFTER.has(prev) || DROP_BEFORE.has(c)) return; // ondoa
    out.push(' '); prev = ' ';
  }
  function emit(c) {
    if (pendingSpace) { pendingSpace = false; if (prev !== '') emitSpace(c); }
    out.push(c); prev = c;
  }

  while (i < n) {
    const c = src[i];

    // --- comment: /* ... */ -> ruka yote ---
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      pendingSpace = true; // comment inachukuliwa kama whitespace
      continue;
    }
    // --- string: nakili verbatim ---
    if (c === '"' || c === "'") {
      const q = c;
      emit(c); i++;
      while (i < n) {
        const s = src[i];
        out.push(s); prev = s; i++;
        if (s === '\\' && i < n) { out.push(src[i]); prev = src[i]; i++; continue; }
        if (s === q) break;
      }
      continue;
    }
    // --- escape nje ya string: nakili `\` + herufi inayofuata ---
    if (c === '\\' && i + 1 < n) {
      if (pendingSpace) { pendingSpace = false; if (prev !== '') emitSpace('\\'); }
      out.push(c, src[i + 1]); prev = src[i + 1]; i += 2;
      continue;
    }
    // --- at-rule: ingia prelude mode ---
    if (c === '@') {
      emit(c); i++;
      while (i < n && (isNameChar(src[i]))) { out.push(src[i]); prev = src[i]; i++; }
      inPrelude = true;
      continue;
    }
    // --- `(` baada ya calc/min/max/clamp: nakili verbatim hadi `)` inayolingana ---
    if (c === '(' && /(\b|-)calc$|(\b|-)min$|(\b|-)max$|(\b|-)clamp$/i.test(out.join('').slice(-7))) {
      if (pendingSpace) { pendingSpace = false; if (prev !== '') emitSpace('('); }
      // (-webkit-calc n.k. pia zinalindwa na `-` hapo juu.)
      let depth = 0;
      while (i < n) {
        const k = src[i];
        out.push(k); prev = k; i++;
        if (k === '"' || k === "'") { // string ndani: ruka hadi mwisho wake
          const q2 = k;
          while (i < n) {
            const s = src[i]; out.push(s); prev = s; i++;
            if (s === '\\' && i < n) { out.push(src[i]); prev = src[i]; i++; continue; }
            if (s === q2) break;
          }
        } else if (k === '(') depth++;
        else if (k === ')') { depth--; if (depth === 0) break; }
      }
      continue;
    }
    if (c === '{') { inPrelude = false; rules++; emit(c); i++; continue; }
    if (c === ';') { inPrelude = false; emit(c); i++; continue; }
    if (isWs(c)) { pendingSpace = true; i++; continue; }
    emit(c); i++;
  }
  // Ondoa nafasi ya mwisho kama ipo.
  let code = out.join('');
  if (code.endsWith(' ')) code = code.slice(0, -1);
  return { code, rules };
}

/**
 * Skeleton: comments huondolewa, whitespace YOTE nje ya strings huondolewa,
 * strings hubaki. Kama skeleton(chanzo) === skeleton(output), output
 * inatofautiana na chanzo kwa whitespace/comments pekee. Hakuna vinginevyo.
 */
export function skeleton(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      out.push(c); i++;
      while (i < n) {
        const s = src[i]; out.push(s); i++;
        if (s === '\\' && i < n) { out.push(src[i]); i++; continue; }
        if (s === q) break;
      }
      continue;
    }
    if (c === '\\' && i + 1 < n) { out.push(c, src[i + 1]); i += 2; continue; }
    if (isWs(c)) { i++; continue; }
    out.push(c); i++;
  }
  return out.join('');
}

/** Faili za CSS zinazopakiwa na index.html (<link rel="stylesheet">). */
export function loadedCss(rootDir = ROOT) {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const seen = new Set();
  const list = [];
  for (const m of html.matchAll(/<link[^>]*\bhref="([^"?#]+\.css)(?:\?[^"#]*)?"/g)) {
    if (m[1].startsWith('http')) continue;
    if (!seen.has(m[1])) { seen.add(m[1]); list.push(m[1]); }
  }
  return list;
}

/* ------------------------------------------------------------------ *
 *  CLI: node tools/minify_css.mjs   (kipimo tu — haiandiki faili)
 * ------------------------------------------------------------------ */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = loadedCss().filter((f) => fs.existsSync(path.join(ROOT, f)));
  let b0 = 0, b1 = 0, rules = 0, bad = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const r = minifyCss(src, f);
    b0 += Buffer.byteLength(src); b1 += Buffer.byteLength(r.code); rules += r.rules;
    if (skeleton(src) !== skeleton(r.code)) { bad++; console.error('SKELETON FAIL:', f); }
  }
  console.log(`css: faili ${files.length} | rules ${rules.toLocaleString()} | raw ${(b0 / 1024).toFixed(0)} KB -> ${(b1 / 1024).toFixed(0)} KB (${((1 - b1 / b0) * 100).toFixed(1)}% ndogo) | skeleton fail: ${bad}`);
}

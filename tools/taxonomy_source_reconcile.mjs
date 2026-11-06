#!/usr/bin/env node
/* [2026-11-06] Stage 6 — Taxonomy reconciliation.
 *
 * Reads the owner's authoritative taxonomy text (docs/taxonomy-source/*.txt,
 * Categories 01–44, products only) and compares it with the runtime taxonomy
 * (shared/canonical-taxonomy-data.js). Read-only: it never edits runtime data.
 *
 * The source is prose, so parsing is heuristic and documented here:
 *   - "CATEGORY NN — NAME"                  -> category NN
 *   - "NN.x Title" (or "x. Title" in Cat 01)  -> numbered section (sub-category candidate)
 *   - "MASTER STRUCTURE"/"Muundo"/category-name tree at column 0 ("├── X")
 *                                            -> declared sub-categories
 *   - after "Product types" / directly after a section header:
 *       "•<TAB>X" bullets and indented "├── X" tree lines -> product types
 *   - after "Attributes": bullets / short plain lines   -> attributes
 *   - any other header (Options, Features, Variant, Filters, Mfano…) stops collection.
 *
 * Output: docs/taxonomy-source/reconciliation-2026-11-06.json (+ .md summary).
 * Usage: node tools/taxonomy_source_reconcile.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'docs/taxonomy-source/SOKOHAI-TAXONOMY-01-44-OWNER-SOURCE-2026-11-06.txt');
const OUT_JSON = path.join(ROOT, 'docs/taxonomy-source/reconciliation-2026-11-06.json');
const OUT_MD = path.join(ROOT, 'docs/taxonomy-source/RECONCILIATION-2026-11-06.md');

export function norm(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’'`]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOP_HEADER = /^(options?|features?|filters?|filter master|variant|variants|selector|compliance|uses|important|muhimu|boundary|mfano|example|examples|kwa |hapa|special|security|safety|architecture|relation|trade|business|lakini|hivyo|na:|types?:|processing|packaging|unit|units|size|color|material|shape|condition|grade|quality|freshness|life stage|purpose|sex|seed type|package|form|application|plant stage|container|fuel|irrigation type|power|surface|drying|treatment|finish|coverage|scent family|skin type|hair type|hair concerns|hair texture|table shape|table configuration|firmness|bed sizes|configuration|resolution|screen size|fishing method|production system|source type|origin|selector engine|filter engine|variant engine|variant rule|variant logic|variant example|variant mfano|attribute master|master|final|qa|ukaguzi)\b/i;

// Numbered sections that describe engines/rules rather than a product branch.
const SECTION_SKIP = /engine|architecture|identity|profile|rules?\b|filter|selector|compliance|\bai\b|attribute|variant|sku|inventory|boundary|relationship|relation|privacy|verification|documentation|history|condition|warranty|power|connectivity|capacity|measurement|unit|definition|context|mode|trade|quantity|price|pricing|claim|discover|search|origin|provenance|certification|licen[cs]e|delivery|location|address|ownership|tenure|purity|grade|treatment|carat|color|natural vs|rough vs|mineral vs|product vs|model vs|vs\b|seller|agent|bot|photo|configuration|customization|bundle|sets?\b|physical|serial|imei|frequency|sim profile|compatib|position|year range|cross-reference|oem|fitment|safety|summary|final|master|qa|ukaguzi|transaction|^plot$/i;

export function parseSource(text) {
  const lines = text.split('\n');
  const cats = {};
  let cat = null, section = null, mode = null, structMode = false;
  const catOf = n => (cats[n] = cats[n] || { id: n, name: '', declaredSubcategories: [], sections: {} });
  const sec = () => {
    if (!cat || !section) return null;
    const c = catOf(cat);
    return (c.sections[section] = c.sections[section] || { name: section, productTypes: [], attributes: [] });
  };
  for (let raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const t = line.trim();
    let m;
    if ((m = t.match(/^CATEGORY (\d{2}) [—-] (.+)$/))) {
      const n = m[1], name = m[2].trim();
      if (!/QA|BOUNDARY|MASTER|FINAL|IMEKAMILIKA|STRUCTURE|USALAMA:/i.test(name)) {
        cat = n; const c = catOf(n); if (!c.name) c.name = name;
        section = null; mode = null; structMode = false;
      }
      continue;
    }
    if (!cat) continue;
    if (/^_{6,}$/.test(t)) { mode = null; structMode = false; continue; }
    // Numbered section: "02.1 Mbegu" (must belong to the current category) or "1. Nafaka" in Cat 01
    if ((m = t.match(/^(\d{2})\.(\d{1,2}) (.+)$/)) && m[1] === cat) {
      section = m[3].trim(); structMode = /MASTER STRUCTURE|MUUNDO/i.test(section);
      mode = (!structMode && SECTION_SKIP.test(section)) ? 'skip' : 'start'; continue;
    }
    if (cat === '01' && (m = t.match(/^(\d{1,2})\. ([A-Z][^:→]{2,60})$/))) {
      section = m[2].trim(); mode = 'start'; continue;
    }
    if (/^(muundo( mkuu)?|master structure)\b/i.test(t)) { structMode = true; mode = null; continue; }
    // Declared sub-categories: column-0 tree right after a structure header
    if (structMode && (m = line.match(/^[├└]── (.+)$/))) {
      const v = m[1].replace(/\[.*?\]/g, '').trim();
      if (v && !/→|:/.test(v)) catOf(cat).declaredSubcategories.push(v);
      continue;
    }
    if (/^product types?:?$/i.test(t) || /^types:?$/i.test(t) || /^bidhaa:?$/i.test(t)) { mode = 'types'; continue; }
    if (/^([A-Za-z]+ ){0,2}attributes?( zinazoweza kutumika)?:?$/i.test(t)) { if (mode !== 'skip') mode = 'attrs'; continue; }
    const s = sec();
    if (!s) continue;
    if ((m = line.match(/^•\t(.+)$/))) {
      const v = m[1].trim();
      if (/→|:/.test(v) || v.length > 70) continue;
      if (mode === 'types' || mode === 'start') s.productTypes.push(v);
      else if (mode === 'attrs') s.attributes.push(v);
      continue;
    }
    if ((m = line.match(/^\s*[├└]── (.+)$/)) && (mode === 'types' || mode === 'start')) {
      const v = m[1].trim();
      if (!/→|:|×/.test(v) && v.length <= 70 && norm(v) !== norm(section)) s.productTypes.push(v);
      continue;
    }
    // "14.3 PRODUCT TYPE": plain-line lists
    if (mode === 'start' && /product type/i.test(section) && t && t.length <= 40 && !/[:→.,()]/.test(t) && /^[A-Z]/.test(t)) {
      s.productTypes.push(t); continue;
    }
    if (mode === 'attrs' && t && t.length <= 40 && !/[:→.,()]/.test(t) && !STOP_HEADER.test(t) && /^[A-Z]/.test(t)) {
      s.attributes.push(t); continue;
    }
    if (t && STOP_HEADER.test(t) && t.length < 60) { mode = mode === 'attrs' && !t.includes(' ') ? mode : null; if (!/^attributes/i.test(t)) mode = null; }
  }
  // de-duplicate
  for (const c of Object.values(cats)) {
    c.declaredSubcategories = [...new Set(c.declaredSubcategories)];
    for (const s of Object.values(c.sections)) {
      s.productTypes = [...new Set(s.productTypes)];
      s.attributes = [...new Set(s.attributes)];
    }
  }
  return cats;
}

export function runtimeIndex() {
  const d = require('../shared/canonical-taxonomy-data.js');
  const out = {};
  for (const c of d.CATEGORY_REGISTRY) {
    const key = String(c.number).padStart(2, '0'), name = c.displayName, domain = c.kind;
    out[key] = { id: key, name, domain, subcategories: [...(d.PRODUCT_SUBCATEGORIES['CAT-' + key] || [])], branches: {} };
  }
  for (const [cid, branches] of Object.entries(d.PRODUCT_TYPE_DEFINITIONS)) {
    const key = cid.replace('CAT-', '');
    for (const [b, def] of Object.entries(branches)) {
      out[key].branches[b] = { status: def.status || 'ACTIVE', productTypes: [...(def.productTypes || [])], attributes: [...(def.attributes || [])] };
    }
  }
  return out;
}

export function reconcile(src, rt) {
  const report = { categories: [], totals: {} };
  const T = { sourceCategories: 0, runtimeCategories: Object.keys(rt).length, sourceSections: 0,
    sourceProductTypes: 0, runtimeProductTypes: 0, matchedProductTypes: 0, missingInRuntime: 0,
    runtimeOnly: 0, partialBranches: 0, partialBranchesWithSourceTypes: 0 };
  for (const key of Object.keys(rt).sort()) {
    const r = rt[key], s = src[key];
    const rtTypes = new Map();
    for (const [b, def] of Object.entries(r.branches)) {
      if (def.status === 'PARTIAL') T.partialBranches++;
      def.productTypes.forEach(pt => rtTypes.set(norm(pt), { label: pt, branch: b }));
    }
    T.runtimeProductTypes += rtTypes.size;
    const row = { id: key, runtimeName: r.name, domain: r.domain, sourceName: s ? s.name : null,
      inSource: !!s, runtimeSubcategories: r.subcategories.length, sourceDeclaredSubcategories: s ? s.declaredSubcategories.length : 0,
      subcategoriesMissingInRuntime: [], sourceProductTypes: 0, runtimeProductTypes: rtTypes.size,
      matched: 0, missingInRuntime: [], runtimeOnly: [], partialBranchesFillable: [] };
    if (s) {
      T.sourceCategories++;
      const rtSubs = new Set(r.subcategories.map(norm).concat(Object.keys(r.branches).map(norm)));
      row.subcategoriesMissingInRuntime = s.declaredSubcategories.filter(x => !rtSubs.has(norm(x)));
      const seen = new Set();
      for (const sec of Object.values(s.sections)) {
        T.sourceSections++;
        for (const pt of sec.productTypes) {
          const k = norm(pt); if (!k || seen.has(k)) continue; seen.add(k);
          row.sourceProductTypes++;
          if (rtTypes.has(k)) row.matched++;
          else row.missingInRuntime.push({ section: sec.name, label: pt });
        }
      }
      for (const [k, v] of rtTypes) if (!seen.has(k)) row.runtimeOnly.push(v);
      // PARTIAL runtime branches the source can fill (same section name, has types)
      for (const [b, def] of Object.entries(r.branches)) {
        if (def.status !== 'PARTIAL') continue;
        const sec = Object.values(s.sections).find(x => norm(x.name) === norm(b));
        if (sec && sec.productTypes.length) row.partialBranchesFillable.push({ branch: b, productTypes: sec.productTypes, attributes: sec.attributes });
      }
    }
    T.sourceProductTypes += row.sourceProductTypes; T.matchedProductTypes += row.matched;
    T.missingInRuntime += row.missingInRuntime.length; T.runtimeOnly += row.runtimeOnly.length;
    T.partialBranchesWithSourceTypes += row.partialBranchesFillable.length;
    report.categories.push(row);
  }
  report.totals = T;
  return report;
}

function md(rep) {
  const T = rep.totals;
  const L = [];
  L.push('# Taxonomy reconciliation — owner source (01–44) vs runtime', '',
    'Generated by `node tools/taxonomy_source_reconcile.mjs`. Read-only comparison; runtime data is not modified by this tool.', '',
    '| Measure | Count |', '|---|---|');
  for (const [k, v] of Object.entries(T)) L.push(`| ${k} | ${v} |`);
  L.push('', '## Per category', '', '| # | Runtime name | Domain | Source types | Runtime types | Matched | Missing in runtime | Runtime-only | PARTIAL fillable |', '|---|---|---|---|---|---|---|---|---|');
  for (const c of rep.categories) {
    L.push(`| ${c.id} | ${c.runtimeName} | ${c.domain} | ${c.inSource ? c.sourceProductTypes : '— (not in source)'} | ${c.runtimeProductTypes} | ${c.matched} | ${c.missingInRuntime.length} | ${c.runtimeOnly.length} | ${c.partialBranchesFillable.map(x => x.branch).join(', ')} |`);
  }
  L.push('', '## Missing in runtime (first 25 per category)', '');
  for (const c of rep.categories) {
    if (!c.missingInRuntime.length && !c.subcategoriesMissingInRuntime.length) continue;
    L.push(`### ${c.id} ${c.runtimeName}`);
    if (c.subcategoriesMissingInRuntime.length) L.push('', 'Declared sub-categories not in runtime: ' + c.subcategoriesMissingInRuntime.join('; '));
    if (c.missingInRuntime.length) L.push('', c.missingInRuntime.slice(0, 25).map(x => `${x.label} _(${x.section})_`).join('; ') + (c.missingInRuntime.length > 25 ? ` … +${c.missingInRuntime.length - 25}` : ''));
    L.push('');
  }
  L.push('## Notes', '',
    '- Parsing is heuristic (see header of the tool). Numbered sections in the source mix real sub-categories with engine sections (e.g. "CPU ENGINE", "VARIANT RULES"); only bullet/tree items under product-type headings are counted.',
    '- Categories 16–18, 20–26 are SERVICE domains; the owner deferred them ("BIDHAA TU"). 39–41 are overlays; 44 is the fallback.',
    '- Matching is by normalised label within the same category; synonyms and translations (e.g. "Sato / Tilapia" vs "Tilapia") are not merged automatically.');
  return L.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('taxonomy_source_reconcile.mjs')) {
  const src = parseSource(fs.readFileSync(SRC, 'utf8'));
  const rep = reconcile(src, runtimeIndex());
  rep.source = path.relative(ROOT, SRC);
  const json = JSON.stringify(rep, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT_JSON) ? fs.readFileSync(OUT_JSON, 'utf8') : '';
    if (cur !== json) { console.error('reconciliation report is stale — rerun the tool'); process.exit(1); }
    console.log('reconciliation report up to date'); process.exit(0);
  }
  fs.writeFileSync(OUT_JSON, json);
  fs.writeFileSync(OUT_MD, md(rep));
  console.log(rep.totals);
}

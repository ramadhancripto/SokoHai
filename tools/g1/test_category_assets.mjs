#!/usr/bin/env node
/* ============================================================
 * CATEGORIES (3F) — static asset audit (hakuna emulator):
 * kila kategoria canonical (CAT-01..44) ina ingizo la picha;
 * kila picha inayorejelewa ipo disk; picha zilizokataliwa (R6)
 * hazirejelewi; legacy/services/transport labels zimefunikwa;
 * manifest ya SVG (86) imethibitishwa kutotumiwa (dead weight).
 * ========================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_CATEGORIES, canonicalCategoryId } from '../../shared/category-filter-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const results = [];
let group = '[CT cat]';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function braceSpan(src, startIdx) {
  let i = src.indexOf('{', startIdx), d = 0, instr = null, esc = false;
  const b = i;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (instr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === instr) instr = null; continue; }
    if (ch === '"' || ch === "'") { instr = ch; continue; }
    if (ch === '{') d++; else if (ch === '}') { d--; if (!d) return src.slice(b, i + 1); }
  }
  throw new Error('brace span not found');
}
function lit(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) throw new Error('marker missing: ' + marker);
  // eslint-disable-next-line no-eval
  return eval('(' + braceSpan(src, i + marker.length) + ')');
}
function arrLit(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) throw new Error('marker missing: ' + marker);
  const b = src.indexOf('[', i + marker.length);
  let d = 0, instr = null, esc = false, j = b;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (instr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === instr) instr = null; continue; }
    if (ch === '"' || ch === "'") { instr = ch; continue; }
    if (ch === '[') d++; else if (ch === ']') { d--; if (!d) break; }
  }
  // eslint-disable-next-line no-eval
  return eval(src.slice(b, j + 1));
}

const boot = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf-8');
const f83 = fs.readFileSync(path.join(ROOT, 'js/app/83-category-photos.js'), 'utf-8');
const ADV = lit(boot, 'skh.advancedCategories =');
const SVC = lit(boot, 'skh.serviceDataMap =');
const PHOTO = lit(f83, 'var PHOTO =');
const PHOTO_BY_ID = lit(f83, 'var PHOTO_BY_ID =');
const REJECTED = arrLit(f83, 'var REJECTED_IMAGES =');
const CATDIR = path.join(ROOT, 'assets/img/categories');
const fileExists = (v) => fs.existsSync(path.join(CATDIR, v + '.webp'));

await test('F1 taxonomy: CAT-01..CAT-44 zote zipo; PHOTO_BY_ID inafunika zote', async () => {
  eq(CANONICAL_CATEGORIES.length, 44, 'canonical count');
  const ids = CANONICAL_CATEGORIES.map(c => c.id).sort();
  const want = Array.from({ length: 44 }, (_, i) => 'CAT-' + String(i + 1).padStart(2, '0'));
  eq(JSON.stringify(ids), JSON.stringify(want), 'CAT id sequence');
  const missing = want.filter(id => !(id in PHOTO_BY_ID));
  eq(missing.length, 0, 'PHOTO_BY_ID missing: ' + missing.join(','));
  const nulls = want.filter(id => PHOTO_BY_ID[id] === null);
  console.log('    (info) CAT bila picha [' + nulls.length + ']: ' + nulls.join(', '));
});
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b).slice(0, 200) + ')'); }

await test('F2 picha: kila thamani isiyo-null ipo disk; zilizokataliwa hazirejelewi', async () => {
  const vals = new Set([...Object.values(PHOTO), ...Object.values(PHOTO_BY_ID)].filter(v => v !== null));
  const gone = [...vals].filter(v => !fileExists(v));
  eq(gone.length, 0, 'missing webp: ' + gone.join(','));
  const rej = [...vals].filter(v => REJECTED.indexOf(v) !== -1);
  eq(rej.length, 0, 'rejected referenced: ' + rej.join(','));
  console.log('    (info) picha zinazotumika: ' + vals.size + ', zilizokataliwa: ' + REJECTED.length);
});

await test('F3 bidhaa: kila advancedCategory ina ingizo la PHOTO + canonical id', async () => {
  const names = Object.keys(ADV);
  assert(names.length > 20, 'advancedCategories count>20 (got ' + names.length + ')');
  const noPhoto = names.filter(n => !(n in PHOTO));
  eq(noPhoto.length, 0, 'no PHOTO entry: ' + noPhoto.join(' | '));
  const unmapped = names.filter(n => !canonicalCategoryId(n));
  eq(unmapped.length, 0, 'UNMAPPED legacy: ' + unmapped.join(' | '));
  console.log('    (info) advancedCategories: ' + names.length);
});

await test('F4 huduma: kila group ya serviceDataMap ina ingizo la PHOTO', async () => {
  const groups = [];
  for (const mode of Object.values(SVC)) for (const g of Object.keys(mode)) groups.push(g);
  assert(groups.length > 10, 'service groups>10 (got ' + groups.length + ')');
  const noPhoto = groups.filter(g => !(g in PHOTO));
  eq(noPhoto.length, 0, 'no PHOTO entry: ' + noPhoto.join(' | '));
  console.log('    (info) service groups: ' + groups.length + ' :: ' + groups.join(' / '));
});

await test('F5 usafiri: Passenger/Product/Cargo/Emergency (+ Kiswahili) zina picha', async () => {
  for (const k of ['Passenger', 'Watu (Ride)', 'Product', 'Kawaida (Parcels)', 'Cargo', 'Mizigo Mikubwa', 'Emergency', 'Dharura (Express)']) {
    assert(PHOTO[k] && fileExists(PHOTO[k]), 'transport photo: ' + k);
  }
});

await test('F6 manifest SVG (86): faili zote zipo lakini hazitumiwi popote (dead weight)', async () => {
  const m86 = fs.readFileSync(path.join(ROOT, 'js/app/86-category-icons-manifest.js'), 'utf-8');
  const m = m86.match(/window\.SKH_CATEGORY_ICONS = (\{.*\});\s*$/s);
  assert(m, 'manifest parse');
  const man = JSON.parse(m[1]);
  const svgs = new Set([man.fallback,
    ...Object.values(man.categories), ...Object.values(man.services), ...Object.values(man.transport),
    ...Object.values(man.modes), ...Object.values(man.legacy), ...Object.values(man.subjects)]);
  const dir = path.join(ROOT, 'assets/img/category-icons');
  const gone = [...svgs].filter(f => !fs.existsSync(path.join(dir, f)));
  eq(gone.length, 0, 'missing svg: ' + gone.join(','));
  // watumiaji wa manifest (nje ya 86 yenyewe) — lazima wawe 0 (R13-C: picha halisi)
  const users = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.js$|\.html$/.test(e.name) && !p.endsWith('86-category-icons-manifest.js') && !p.includes('test_category_assets')) { const s = fs.readFileSync(p, 'utf-8'); if (s.indexOf('SKH_CATEGORY_ICONS') !== -1 || s.indexOf('category-icons/') !== -1) users.push(path.relative(ROOT, p)); } } };
  walk(path.join(ROOT, 'js')); walk(path.join(ROOT, 'shared'));
  for (const h of ['index.html']) { const p = path.join(ROOT, h); if (fs.existsSync(p)) { const s = fs.readFileSync(p, 'utf-8'); if (s.indexOf('SKH_CATEGORY_ICONS') !== -1 || s.indexOf('category-icons/') !== -1) users.push(h); } }
  eq(users.length, 0, 'manifest consumers (expected 0): ' + users.join(','));
  console.log('    (info) SVG ' + svgs.size + ' (456K) hazitumiwi — uamuzi wa owner: kuzifuta au kuzihifadhi');
});

const pass = results.filter(r => r.ok).length, fail = results.filter(r => !r.ok);
console.log(`CATEGORY ASSETS: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log('  FAIL ' + f.group + ' ' + f.name + ': ' + f.err);
process.exit(fail.length ? 1 : 0);

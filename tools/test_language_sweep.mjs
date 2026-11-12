#!/usr/bin/env node
/* [REMEDIATION 2026-11 R12] Language sweep: whole phrases win over word-by-word
 * replacement (no "Rudi to Main Dashboard"), parentheses phrases match, listing data untouched. */
import { JSDOM } from 'jsdom'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM(`<!doctype html><body>
<button id="a">Back to Main Dashboard</button><span id="b">View all</span><b id="c">Onyesha faida (Profit)</b>
<h3 id="d">Inventory &amp; Stock Control Room</h3><p id="e">Cart iko wazi.</p><span id="f">Back</span>
<h3 class="skh-title" id="g">Home Theatre Settings Kit</h3><small id="h">Settings</small><span id="i">Buyer Dashboard</span></body>`, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window; w.localStorage.setItem('sokohai_lang', 'sw');
w.eval(fs.readFileSync(path.join(ROOT, 'js/22-humanize.js'), 'utf8'));
w.skhLangSweep(w.document.body);
const $ = id => w.document.getElementById(id).textContent;
let pass = 0, fail = 0; const ok = (n, c, v) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n + (c ? '' : ' -> ' + v)); };
ok('whole phrase beats "Back" (no "Rudi to Main Dashboard")', $('a') === 'Rudi Dashibodi Kuu', $('a'));
ok('View all -> Tazama zote', $('b') === 'Tazama zote', $('b'));
ok('phrase ending in ")" matches', $('c') === 'Onyesha faida', $('c'));
ok('"&" phrase', $('d') === 'Udhibiti wa Stoo', $('d'));
ok('Cart iko wazi. -> Kikapu ni tupu.', $('e') === 'Kikapu ni tupu.', $('e'));
ok('single word still mapped', $('f') === 'Rudi', $('f'));
ok('listing title (data) untouched', $('g') === 'Home Theatre Settings Kit', $('g'));
ok('Settings -> Mipangilio', $('h') === 'Mipangilio', $('h'));
ok('Buyer Dashboard -> Dashibodi ya Mnunuzi', $('i') === 'Dashibodi ya Mnunuzi', $('i'));
console.log(`\nLANGUAGE SWEEP: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

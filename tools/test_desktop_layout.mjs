#!/usr/bin/env node
/* [REMEDIATION 2026-11 R10] Desktop layout contract: CSS-only, desktop-only, nav kept. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'css/61-desktop-layout.css'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const boot = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf8');
const ss = fs.readFileSync(path.join(ROOT, 'js/23-smart-search.js'), 'utf8');
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n); };
const body = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
ok('every rule sits inside @media (min-width: 1100px) — phones/tablets untouched', /^@media \(min-width: 1100px\) \{[\s\S]*\}$/.test(body) && (body.match(/@media/g) || []).length === 1);
ok('loaded last (after 60-chat-premium and fonts)', idx.indexOf('css/61-desktop-layout.css') > idx.indexOf('css/60-chat-premium.css') && idx.indexOf('css/61-desktop-layout.css') > idx.indexOf('fonts/inter.css'));
ok('same nav element becomes the left rail (no new nav markup)', /\.bottom-area-wrapper[\s\S]*width: var\(--skh-rail-w\)/.test(css) && (idx.match(/class="bottom-nav-main"/g) || []).length === 1);
ok('all five nav tabs still present', ['navTabHome', 'navTabBidhaa', 'navTabHuduma', 'navTabDelivery', 'openChatList()'].every(k => idx.includes(k)));
ok('floating "+" hidden only because the header "+" (#skhPostBtn) exists', /sell-action-fab \{ display: none/.test(css) && idx.includes('id="skhPostBtn"'));
ok('content capped to a readable width', /--skh-desk-max: 1360px/.test(css));
ok('feed search: all words, any order', /query\.split\(' '\)\.every\(w => hay\.includes\(w\)\)/.test(boot));
ok('feed search includes category label', /skh\.categoryLabel\(data\.category\)/.test(boot));
ok('smart search shows labels, not CAT-xx ids', /catLbl\(it\.category\) \|\| it\.location/.test(ss));
console.log(`\nDESKTOP LAYOUT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* [REMEDIATION 2026-11 R12] System polish contract: light overlays, home hero wired to
 * existing functions only, desktop-only rail items, avatar files served with the right type. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const css = rd('css/62-system-polish.css'), idx = rd('index.html'), js = fs.readdirSync(path.join(ROOT, 'js/app')).filter(f => /\.js$/.test(f)).map(f => rd('js/app/' + f)).join('\n') + rd('js/23-smart-search.js');
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n); };
ok('polish CSS loads last', idx.indexOf('css/62-system-polish.css') > idx.indexOf('css/61-desktop-layout.css'));
ok('overlay scrim is light and translucent (not navy .95)', /\.overlay-menu,\s*#modeRulesAlert\s*\{[\s\S]*var\(--skh-scrim\)/.test(css) && /--skh-scrim: rgba\(12, 35, 29, \.46\)/.test(css));
ok('hero shows on Nyumbani only', /\.shh \{ display: none;/.test(css) && /body:has\(#navTabHome\.active\) \.shh \{ display: block; \}/.test(css));
const hero = idx.slice(idx.indexOf('id="skhHomeHero"'), idx.indexOf('id="categoryStrip"'));
const calls = [...hero.matchAll(/onclick="([^"]+)"/g)].map(m => m[1]);
const fns = new Set(calls.flatMap(c => [...c.matchAll(/(?:window\.)?([A-Za-z]+)\(/g)].map(m => m[1])));
const known = ['updateApp', 'setMarketMode', 'openChatList', 'togglePlusMenu', 'querySelector'];
ok('every hero action calls an existing function: ' + [...fns].join(', '), [...fns].every(f => known.includes(f)) && ['updateApp', 'setMarketMode', 'openChatList', 'togglePlusMenu'].every(f => f === 'querySelector' || new RegExp('window\\.' + f + '\\s*=').test(js)));
ok('hero image is the owner-supplied design asset, present', fs.existsSync(path.join(ROOT, 'assets/img/home/community.webp')));
ok('desktop-only rail items hidden on phones', /\.nav-tab\.nav-desk-only \{ display: none !important; \}/.test(css) && (idx.match(/nav-desk-only/g) || []).length === 3);
ok('SokoPay avatars reference real SVG files (the .png files contain SVG)', idx.includes('img/avatar-user.svg') && rd('img/avatar-user.svg').includes('<svg') && rd('img/avatar-sokohai.svg').includes('<svg'));
ok('old avatar .png files kept (no asset deleted)', fs.existsSync(path.join(ROOT, 'img/avatar-user.png')) && fs.existsSync(path.join(ROOT, 'img/avatar-sokohai.png')));
ok('chat inbox tabs in Swahili', js.includes("['groups', 'Makundi'], ['order_groups', 'Oda za Makundi']"));
const bd = rd('tools/build_dist.mjs');
const refs = [...new Set([...idx.matchAll(/["'(]((?:assets\/)?img\/[^"')?]+\.(?:png|jpe?g|webp|svg))/g)].map(m => m[1]))];
ok('deploy (dist) copies assets/img: ' + refs.length + ' image paths in index.html all covered', /'assets\/img'/.test(bd) && refs.every(r => (r.startsWith('assets/img/') || r.startsWith('img/')) && fs.existsSync(path.join(ROOT, r))));
console.log(`\nSYSTEM POLISH: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

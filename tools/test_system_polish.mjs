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
const known = ['updateApp', 'setMarketMode', 'openChatList', 'togglePlusMenu', 'querySelector', 'skhLiveHub', 'skhEscrowInfo', 'skhHeroGo', 'skhOpenRequestInbox']; // [R13-E] refs 11-15 carousel + quick actions
ok('every hero action calls an existing function: ' + [...fns].join(', '), [...fns].every(f => known.includes(f)) && ['updateApp', 'setMarketMode', 'skhLiveHub', 'togglePlusMenu', 'skhEscrowInfo', 'skhHeroGo', 'openChatList', 'skhOpenRequestInbox'].every(f => f === 'querySelector' || new RegExp('window\\.' + f + '\\s*=').test(js)));
ok('hero image is the owner-supplied design asset, present', fs.existsSync(path.join(ROOT, 'assets/img/home/community.webp')));
ok('desktop-only rail items hidden on phones', /\.nav-tab\.nav-desk-only \{ display: none !important; \}/.test(css) && (idx.match(/nav-desk-only/g) || []).length === 3);
ok('SokoPay avatars reference real SVG files (the .png files contain SVG)', idx.includes('img/avatar-user.svg') && rd('img/avatar-user.svg').includes('<svg') && rd('img/avatar-sokohai.svg').includes('<svg'));
ok('old avatar .png files kept (no asset deleted)', fs.existsSync(path.join(ROOT, 'img/avatar-user.png')) && fs.existsSync(path.join(ROOT, 'img/avatar-sokohai.png')));
ok('chat inbox tabs in Swahili', js.includes("['groups', 'Makundi'], ['order_groups', 'Oda za Makundi']"));
// [R13-B] seller form: optional auction start/min increment and price-drop start/per-buyer limit reach modeData
const st = rd('js/app/08-app-state.js');
ok('seller form has auction start + min increment and price-drop start + per-buyer limit', ['aucStartTime', 'aucMinIncrement', 'pdStartTime', 'pdMaxPerBuyer'].every(id => idx.includes('id="' + id + '"') && st.includes("'" + id + "'")) && /modeData\.minIncrement = aucInc/.test(st) && /modeData\.maxPerBuyer = pdMax/.test(st) && /startTime: startMs/.test(st));
ok('R13-B modules wired: CSS + 3 module scripts + Live entry + Hali own slot', idx.includes('css/63-live-commerce.css') && ['120-live-commerce-ui', '121-stories-ui', '122-group-soko-ui'].every(f => idx.includes('js/app/' + f + '.js')) && idx.includes('data-skh-live-entry') && rd('js/app/121-stories-ui.js').includes("el.id = 'skhHxRail'"));
// [R13-E] Nyumbani in the owner's order (refs 11-15) + POS cashier grid (refs 17/18)
const h66 = rd('css/66-home-layout.css');
ok('R13-E: phone order Gundua Soko -> banner -> Bidhaa Maarufu; desktop hero -> updates -> promos', /#categoryStrip \{ order: 1; \}/.test(h66) && /#skhHomeHero \{ order: 2; \}/.test(h66) && /#skhHomePopular \{ order: 3; \}/.test(h66) && /#skhHomeUpdates \{ order: 2; display: block; \}/.test(h66));
ok('R13-E: home + POS grid modules loaded; POS grid uses the existing add-to-cart path', idx.includes('js/app/123-home-layout.js') && idx.includes('js/app/124-pos-grid.js') && rd('js/app/124-pos-grid.js').includes('window.addPosCartItemById(d.id)') && rd('js/app/17-hub.js').includes('window.skhPosRemember'));
const bd = rd('tools/build_dist.mjs');
const refs = [...new Set([...idx.matchAll(/["'(]((?:assets\/)?img\/[^"')?]+\.(?:png|jpe?g|webp|svg))/g)].map(m => m[1]))];
ok('deploy (dist) copies assets/img: ' + refs.length + ' image paths in index.html all covered', /'assets\/img'/.test(bd) && refs.every(r => (r.startsWith('assets/img/') || r.startsWith('img/')) && fs.existsSync(path.join(ROOT, r))));
console.log(`\nSYSTEM POLISH: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

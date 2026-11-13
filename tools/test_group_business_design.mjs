#!/usr/bin/env node
/* [R13-H 2026-11] Group Chat phase 2 contract: agreed sidebar, sections read existing records only,
 * no fake money features (BLOCKED shown), permissions enforced in rules, app dialogs (no window.prompt). */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const idx = rd('index.html'), gb = rd('js/app/125-group-business.js'), g73 = rd('js/app/73-group-soga.js'), g69 = rd('js/app/69-chat-groups.js'), rules = rd('firestore.rules'), css = rd('css/70-group-business.css');
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n); };
ok('module + CSS wired', idx.includes('js/app/125-group-business.js') && idx.indexOf('css/70-group-business.css') > idx.indexOf('css/69-category-tiles.css'));
ok('agreed sidebar order and labels', /var GSG_TABS = \['chat', 'media', 'products', 'services', 'soko', 'groupOrders', 'orders', 'offers', 'transport', 'members'\]/.test(g73)
   && ["'Huduma'", "'Group Buy'", "'Oda'", "'Mapatano na Ofa'", "'Usafirishaji'", "'Wanachama'"].every(l => g73.includes('return ' + l)));
ok('Soko has its own soft green glow', /data-tab="soko"\][^{]*\{[^}]*0 0 14px rgba\(29, 185, 127/.test(css));
ok('sections read existing collections only', ["'services'", "'products'", "'orders'", "'negotiations'", "'delivery_offers'", "'drivers'", "'/soko'"].every(c => gb.includes(c)) && !/collection\(skh\.db, 'group_services'|'group_orders_v2'/.test(gb));
ok('negotiations via the server engine', /call\('negotiationSendOffer'/.test(gb) && /call\('negotiationAction'/.test(gb) && /expectedVersion/.test(gb));
ok('money with no backend is BLOCKED, never simulated', /Nafasi za kulipia, bei za matangazo na mgawanyo wa mapato — BLOCKED/.test(gb) && /Kuanzisha Group Order mpya ndani ya kundi — BLOCKED/.test(gb) && /sponsored: false/.test(gb));
ok('Soko rules: pending-only, admin decisions, no sponsoring, categories, members-only, no delete', /match \/soko\/\{lid\}/.test(rules) && /request\.resource\.data\.get\('sponsored', false\) == false/.test(rules)
   && /isGroupAdminOrOwner\(id\)\s*\n\s*&& request\.resource\.data\.status in \['approved', 'rejected', 'suspended'\]/.test(rules) && /function sokoCategoryOk/.test(rules));
ok('posting permissions enforced in rules', /function groupPostOk/.test(rules) && /groupPostOk\(gidFromConv\(convId\), request\.resource\.data\)/.test(rules));
ok('app dialogs (window.prompt is replaced by js/05-dialogs.js)', !/window\.prompt\(|window\.confirm\(/.test(gb) && /window\.skhPrompt/.test(gb));
ok('stickers from a fixed set; negotiation card snapshot validated', /GSG_STICKERS\.indexOf/.test(g69) && /type === 'negotiation'/.test(g69) && /\+ng\.price > 0/.test(g69));
ok('info panel: desktop right column, phone via header', /<aside id="gsgSide"/.test(g73) && /data-act="gsg-panel"/.test(g73) && /grid-template-columns: 236px minmax\(0, 1fr\) 320px/.test(css));
ok('forward to groups + report to chatReports + media/doc preview', /function forward\(/.test(gb) && /C\('chatReports'\)/.test(gb) && /function preview\(/.test(gb) && /gsg-img-view/.test(g73) && /gsg-doc-view/.test(g73));
console.log(`\nGROUP BUSINESS DESIGN: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* [R13-G 2026-11] Group Chat phase 1 contract: design layer + the three bugs fixed on the way
 * (rules-rejected sends, unsorted timeline, dead "Tazama"), real-data rules, no fake capability. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const idx = rd('index.html'), g69 = rd('js/app/69-chat-groups.js'), g73 = rd('js/app/73-group-soga.js'), g74 = rd('js/app/74-group-order-system.js'), css = rd('css/68-group-chat-design.css'),
      cat = rd('js/app/83-category-photos.js'), ccss = rd('css/69-category-tiles.css'), rules = rd('firestore.rules'), seed = rd('tools/local-demo-seed.mjs');
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n); };
ok('68 + 69 CSS linked after 67', idx.indexOf('css/68-group-chat-design.css') > idx.indexOf('css/67-chat-discover.css') && idx.indexOf('css/69-category-tiles.css') > idx.indexOf('css/68-group-chat-design.css'));
ok('rules require senderId on group messages, and every client writer sends it', /request\.resource\.data\.senderId == request\.auth\.uid/.test(rules)
   && (g69.match(/senderUid: uid\(\), senderName/g) || []).length === (g69.match(/senderId: uid\(\), senderUid: uid\(\)/g) || []).length && /senderId: uid\(\),\s*\n\s*senderUid: uid\(\)/.test(g74));
ok('timeline sorted by time (a vs b)', /localeCompare\(String\(b\.at \|\| ''\)\); \}\); +\/\/ \[R13-G\] was a\.at/.test(g73) && !/String\(a\.at \|\| ''\)\.localeCompare\(String\(a\.at/.test(g73));
ok('member count from active members (not stale memberCount)', /var actN = Object\.keys\(CUR\.__roles\)\.length;/.test(g73));
ok('system pills come from real group events', /window\.skhGroupEvents\(gid, 500\)/.test(g73) && /amejiunga kwenye kundi/.test(g73));
ok('product card: [Tazama] → openProduct, [Jadili] → private chat with products/{pid}.userId', /window\.openProduct\(pid, 'products'\)/.test(g73) && /sellerUid = pd\.userId/.test(g73) && /openChatWithUser\(sellerUid, sellerNm\)/.test(g73));
ok('Shiriki Bidhaa picks from the user\'s own published listings', /where\('userId', '==', uid\(\)\)/.test(g73) && /productId: pk\.id/.test(g73) && /fields\.product\.location/.test(g69));
ok('(+) menu items of the design ref', ['Tuma Media', 'Shiriki Bidhaa', 'Shiriki Huduma', 'Anzisha Group Order', 'Shiriki Oda ya Kawaida', 'Panga Usafiri', 'Shiriki Ofa', 'Tuma Nyaraka/PDF', 'Shiriki Mahali'].every(w => g73.includes("'" + w + "'")));
ok('sections in the design order incl. Wanachama', /var GSG_TABS = \['chat', 'media', 'products', 'groupOrders', 'orders', 'transport', 'offers', 'members'/.test(g73));
ok('no group-order create button that rules refuse (groupOrders write:false)', /match \/groupOrders\/\{goid\} \{\s*\n\s*allow read: [^\n]*\n\s*allow write: if false;/.test(rules) && /g_sendPolicy_blocked\(\) \|\| goOn\(\) \? '' : goSoonBadge\(\)/.test(g73));
ok('chatGroupOrders flag only in the emulator demo seed; server still refuses it in production', /features: \{ chatGroupOrders: true \}/.test(seed) && /REFUSED: local emulator only/.test(seed) && /Oda za Pamoja za makundi bado hazina injini ya server/.test(rd('functions/admin-authority.js')));
ok('rail: icons on phone, labels on desktop', /#gsgTabs \.gsg-card \.gsg-lb \{ display: none !important; \}/.test(css) && /@media \(min-width: 900px\)[\s\S]*\.gsg-lb \{ display: block !important;/.test(css));
ok('categories keep REAL photos, framed in white cards; desktop 2x6 grid; IDs unchanged', /categories\/clean\//.test(cat) && /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/.test(ccss) && /GRID_SHORT = \{ 'CAT-11'/.test(cat) && /data-cat="' \+ esc\(n\)/.test(cat));
console.log(`\nGROUP CHAT DESIGN: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

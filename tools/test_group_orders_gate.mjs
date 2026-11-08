#!/usr/bin/env node
// [REPAIR 2026-10] Chat-group "Oda za Pamoja" have no server engine yet. While
// system/config.features.chatGroupOrders is not true, no entry point may look
// like it works: no create buttons, clear "coming soon" text, and every action
// stops with a notice. Rules deny groupOrders writes regardless (rules suite).
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let pass = 0, fail = 0; const ok = (n, c) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const g = read('js/app/73-group-soga.js'), o = read('js/app/74-group-order-system.js'), c = read('js/app/69-chat-groups.js'), r = read('firestore.rules');
ok('flag defaults OFF (only system/config.features.chatGroupOrders === true enables it)', /f\.chatGroupOrders === true/.test(c));
ok('74: helper missing => disabled (no default-on)', /function goEnabled\(\) \{ return typeof window\.skhGroupOrdersEnabled === 'function' &&/.test(o));
ok('74: wizard CTA replaced by a coming-soon notice when off', /if \(!goEnabled\(\)\) \{\s*cta\.innerHTML = '<div data-go-disabled/.test(o));
ok('74: CTA click re-checks the flag', /if \(!goEnabled\(\)\) \{ goOff\(\); return; \}\s*openWizardModal\(gid\)/.test(o));
ok('73: Group Orders tab shows "Inakuja hivi karibuni" when off (and no create button at all — [R13-G] rules refuse client writes)', /g_sendPolicy_blocked\(\) \|\| goOn\(\) \? '' : goSoonBadge\(\)/.test(g));
ok('73: (+) menu has no create chip; "Anzisha Group Order" only opens the Group Orders section [R13-G]', !/atChip\('gsg-at-gorder'/.test(g) && /act === 'gsg-at-gotab'\) \{ closeAttachPop\(\); setGsgTab\('groupOrders'\)/.test(g));
ok('73: create action blocked when off', /act === 'gsg-at-gorder'\) \{\s*if \(!goOn\(\)\)/.test(g));
ok('73: empty state explains the feature is not open yet', /Oda za Pamoja hazijafunguliwa bado/.test(g));
ok('rules: browser cannot write groupOrders', !/match \/groupOrders\/\{goid\}[^}]*allow (create|update|write): if (signedIn|isGroup)/.test(r));
console.log(`\nGROUP ORDERS GATE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

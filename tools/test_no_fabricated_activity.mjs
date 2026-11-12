#!/usr/bin/env node
/* [REMEDIATION 2026-11 R8] Buyers never see invented activity: the social-proof
 * toast renders only a real event passed in; nothing generates names on a timer. */
import fs from 'node:fs';
import vm from 'node:vm';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };
const src = fs.readFileSync(new URL('../js/app/14-map-onboarding.js', import.meta.url), 'utf8');
ok('no hard-coded list of fake buyer names', !/\["Juma", "Asha", "Said"/.test(src));
ok('no timer fires the social-proof toast', !/setInterval\([^)]*triggerFomo/s.test(src) && !/triggerFomo\(\);?\s*\n?\s*\}, *\d+\)/.test(src));
const start = src.indexOf('window.triggerFomo = function'); const end = src.indexOf('\n};', start) + 3;
const toast = { innerHTML: '', style: { display: 'none' } };
const ctx = { window: {}, document: { getElementById: () => toast }, setTimeout: () => 0, String };
vm.createContext(ctx); vm.runInContext(src.slice(start, end), ctx);
ctx.window.triggerFomo();
ok('without a real event nothing is shown', toast.style.display === 'none' && toast.innerHTML === '');
ctx.window.triggerFomo({ name: '<b>x</b>', city: 'Arusha', action: 'ameweka oda' });
ok('a real event is shown, escaped', toast.style.display === 'block' && toast.innerHTML.includes('&lt;b&gt;x&lt;/b&gt;'));
console.log(`\nNO FABRICATED ACTIVITY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

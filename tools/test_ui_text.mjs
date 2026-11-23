#!/usr/bin/env node
/* [UI 2026-11-21] shared/ui-text.js (message humanizer used by alerts, dialogs, toasts) + the alert classifier fix. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const U = require('../shared/ui-text.js');
let pass = 0, fail = 0;
const eq = (a, b, n) => { if (a === b) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); } };
const ok = (c, n) => eq(!!c, true, n);
eq(U.humanize(' Ombi lako la Uwakala LIMETUMWA kwa Admin.\nAda ya UWAKALA imelipwa!!!'), 'Ombi lako la Uwakala limetumwa kwa Admin.\nAda ya uwakala imelipwa!', 'shouted words calmed, "!!!" -> "!", stray leading space removed');
eq(U.humanize('SALIO LINALOPATIKANA: TSh 5,000'), 'Salio linalopatikana: TSh 5,000', 'sentence case restored, amount untouched');
eq(U.humanize('Oda ORD-ABCD-WXYZ IMETHIBITISHWA'), 'Oda ORD-ABCD-WXYZ imethibitishwa', 'reference codes are never changed');
eq(U.humanize('Kazi imehifadhiwa: JOB-AB12\nJumla: TSh 12,000'), 'Kazi imehifadhiwa: JOB-AB12\nJumla: TSh 12,000', 'normal message unchanged');
eq(U.humanize('Malipo kupitia SOKOPAY na NIDA'), 'Malipo kupitia SokoPay na NIDA', 'brand names restored, real acronyms kept');
eq(U.humanize(' jaza sehemu zote (*).'), 'Jaza sehemu zote (*).', 'message starts with a capital letter');
eq(U.humanize('SMS / GPS / POS'), 'SMS / GPS / POS', 'short acronyms (3 letters) untouched');
eq(U.humanize(null), '', 'null -> empty');
const src = fs.readFileSync(new URL('../shared/ui-text.js', import.meta.url), 'utf8');
ok(!/['"]HaiPay['"]|HAIPAY\s*:/.test(src) && !/HaiPay/.test(U.humanize('Lipa kwa HAIPAY au SOKOPAY')), 'no obsolete "HaiPay" brand is produced; SokoPay is the official name');
eq(U.humanize('Lipa kwa SOKOPAY'), 'Lipa kwa SokoPay', 'SokoPay naming preserved');
ok(['SokoHai', 'SokoPay', 'SokoCart', 'PesaPal', 'M-Pesa'].every(b => src.includes("'" + b + "'")) && !/Ultimate Pro|HaiPay'/.test(src), 'brand list holds only current names');
const toasts = fs.readFileSync(new URL('../js/07-toasts.js', import.meta.url), 'utf8');
ok(!/\/\|\|/.test(toasts) && !/\(\|/.test(toasts.slice(toasts.indexOf('function classify'), toasts.indexOf('function showNext'))), 'classifier has no empty alternatives (they matched every message, so errors showed green)');
ok(/SKHUiText/.test(toasts) && /SKHUiText/.test(fs.readFileSync(new URL('../js/05-dialogs.js', import.meta.url), 'utf8')), 'alerts, toasts and confirm dialogs use the one humanizer');
ok(fs.readFileSync(new URL('../html/00-head.html', import.meta.url), 'utf8').indexOf('shared/ui-text.js') < fs.readFileSync(new URL('../html/00-head.html', import.meta.url), 'utf8').indexOf('js/05-dialogs.js'), 'humanizer loads before the dialogs');
ok(!/font-family: 'Segoe UI', Tahoma/.test(fs.readFileSync(new URL('../css/01-core.css', import.meta.url), 'utf8')), 'one typeface: the core "* { font-family: Segoe UI }" rule now uses Inter');
console.log(`\nUI TEXT (unit): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

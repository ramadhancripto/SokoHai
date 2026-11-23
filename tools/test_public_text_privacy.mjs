#!/usr/bin/env node
/* [SEO-PRIVACY 2026-11-21 review 2] shared/public-text-privacy.js + shared/admin-regions.js (unit, no emulator):
 * phone numbers / WhatsApp / tel: links are removed; product barcodes, labelled identifiers and amounts are kept;
 * a listing without a verified country shows no location (Tanzania is not assumed). */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../shared/public-text-privacy.js');
const AR = require('../shared/admin-regions.js');
let pass = 0, fail = 0;
const eq = (a, b, n) => { if (a === b) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); } };
const GONE = [['Piga +254 712 345 678 sasa', 'Piga sasa'], ['Call +1 (415) 555-0132', 'Call'], ['UK: +44 20 7946 0958', 'UK:'], ['00 234 803 123 4567', ''],
  ['Nigeria 0803 123 4567', 'Nigeria'], ['Simu 0712 345 678', 'Simu'], ['Piga 0754 111 222 au +255754111222', 'Piga au'], ['255754111222', ''],
  ['namba yangu 712345678', 'namba yangu'], ['754 111 222', ''], ['00 255 754 111 222', ''], ['Contact: 4006381333931', 'Contact:'],
  ['WhatsApp wa.me/254712345678', 'WhatsApp'], ['tel:+256772123456', ''], ['https://api.whatsapp.com/send?phone=255712345678', ''], ['Barua: mmiliki@example.test', 'Barua:']];
for (const [i, o] of GONE) eq(P.scrub(i), o, 'removed: ' + i);
const KEPT = ['Barcode 5901234123457', 'EAN: 4006381333931', 'UPC 036000291452', 'EAN-8 96385074', '6201234567893', 'Order 0012345678905', 'IMEI 356938035643809',
  'SKU 123456789012', 'Serial 9876543210', 'Model SM-A155F', 'Bei TSh 1 500 000 000 tu', 'KSh 12 500 000', 'iPhone 15 Pro 256GB 2023', 'Mwaka 2020-2024', 'Ukubwa 1200x800 mm'];
for (const k of KEPT) eq(P.scrub(k), k, 'kept: ' + k);
eq(P.isGtin('5901234123457') && P.isGtin('036000291452') && P.isGtin('96385074') && !P.isGtin('5901234123458'), true, 'GS1 check digit validated (a wrong check digit is not a barcode)');
eq(P.scrub('Code 5901234123458 simu 0712345678'), 'Code 5901234123458 simu', 'labelled code kept even with a bad check digit; phone after it removed');
eq(AR.publicLocation({ location: 'Kariakoo, Dar es Salaam' }), null, 'no country field: Tanzania NOT assumed -> nothing');
eq(AR.publicLocation({ region: 'Mwanza' }), null, 'region without country -> nothing');
eq(AR.publicLocation({ country: 'Atlantis', region: 'Mwanza' }), null, 'unverifiable country -> nothing');
eq(JSON.stringify(AR.publicLocation({ countryCode: 'TZ', location: 'Kariakoo, Dar es Salaam' })), '{"country":"TZ","region":"Dar es Salaam","label":"Dar es Salaam"}', 'verified TZ -> region only');
eq(AR.publicLocation({ countryCode: 'TZ', location: 'Plot 9, Mtaa wa Jamhuri' }).label, 'Tanzania', 'verified TZ, no region recognised -> country name only');
eq(AR.publicLocation({ countryCode: 'KE', location: 'Moi Avenue 22, Nairobi' }).label, 'Nairobi, Kenya', 'verified KE -> county + country');
eq(JSON.stringify(AR.listingFields('ke', 'nairobi')), '{"countryCode":"KE","region":"Nairobi"}', 'form fields: verified country + region of THAT country');
eq(JSON.stringify(AR.listingFields('KE', 'Arusha')), '{"countryCode":"KE"}', 'form fields: a region of another country is not saved');
eq(JSON.stringify(AR.listingFields('', 'Arusha')), '{}', 'form fields: no country chosen -> nothing saved (never assumed)');
eq(JSON.stringify(AR.listingFields('XX', '')), '{}', 'form fields: invalid ISO code -> nothing saved');
eq(JSON.stringify(AR.listingFields('UG', '')), '{"countryCode":"UG"}', 'form fields: valid country without a region list -> country only');
// more false-positive / false-negative checks
for (const k of ['Pakiti 12 x 500g', 'Lita 20, kilo 25', 'Bei 45,000 kwa kipande', 'Size 42 EU / 8 UK', 'RAM 8GB, ROM 256GB, 5000mAh', 'ISBN 9780306406157', 'Toleo 2.0.1', 'Kiasi: 1,200 pcs'])
  eq(P.scrub(k), k, 'kept: ' + k);
for (const [i, o] of [['Mobile: 0712-345-678', 'Mobile:'], ['WhatsApp +255 (0) 712 345 678', 'WhatsApp'], ['email me: a.b+c@shop.co.tz', 'email me:'], ['Nipo -6.7924, 39.2083', 'Nipo'], ['tel:0712345678 sasa', 'sasa']])
  eq(P.scrub(i), o, 'removed: ' + i);
console.log(`\nPUBLIC TEXT PRIVACY (unit): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

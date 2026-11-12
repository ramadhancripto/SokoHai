#!/usr/bin/env node
/* [2026-11-06] Soko Huru: "Linganisha wauzaji" lists the SAME product from OTHER
 * sellers only — never the same seller, never a different product type, never a
 * different condition — cheapest first. */
import { psBuildRails, PS_PRODUCT } from '../js/app/39-showcase-logic.js';
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, i || ''); } };
const cur = { id: 'a', userId: 's1', title: 'Pasi ya Umeme Philips 1200W', subCategory: 'Vifaa vya Jikoni', price: 45000, condition: 'Mpya' };
const items = [
  { id: 'b', userId: 's2', title: 'Pasi ya umeme Philips 1200W mpya', subCategory: 'Vifaa vya Jikoni', price: 43000, condition: 'Mpya' },
  { id: 'c', userId: 's3', title: 'Philips Pasi Umeme 1200W', subCategory: 'Vifaa vya Jikoni', price: 41000, condition: 'Mpya' },
  { id: 'd', userId: 's1', title: 'Pasi ya Umeme Philips 1200W', subCategory: 'Vifaa vya Jikoni', price: 40000, condition: 'Mpya' },
  { id: 'e', userId: 's4', title: 'Pasi ya Umeme Philips 1200W', subCategory: 'Vifaa vya Jikoni', price: 20000, condition: 'Iliyotumika' },
  { id: 'f', userId: 's5', title: 'Blender Philips 1200W', subCategory: 'Vifaa vya Jikoni', price: 60000, condition: 'Mpya' },
  { id: 'g', userId: 's6', title: 'Pasi ya Umeme Philips 1200W', subCategory: 'Nguo', price: 30000, condition: 'Mpya' }
];
const r = psBuildRails(items, cur, { collection: PS_PRODUCT });
const ids = r.offers.map(x => x.id);
ok('offers = same product from other sellers, cheapest first', JSON.stringify(ids) === JSON.stringify(['c', 'b']), JSON.stringify(ids));
ok('same seller is never shown as another offer', !ids.includes('d'));
ok('different condition is not mixed into the comparison', !ids.includes('e'));
ok('different product is not an offer', !ids.includes('f'));
ok('different sub-category is not an offer', !ids.includes('g'));
ok('offers are not repeated in other rails', !['similar', 'moreCategory', 'otherSellers', 'recommended'].some(k => r[k].some(x => ids.includes(x.id))));
ok('no offers for services', psBuildRails(items, cur, { collection: 'services' }).offers.length === 0);
console.log(`\nOPEN MARKET OFFERS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

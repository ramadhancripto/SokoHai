#!/usr/bin/env node
/* [REMEDIATION 2026-11 R3] Specification-aware seller comparison regression suite.
 * Two listings are compared side by side ONLY when they are the same product;
 * a specification stated on one side and missing on the other is never assumed
 * to match. Covers electronics, phones, food, agriculture, furniture, fashion,
 * vehicles, construction and general goods. */
import { offerEquivalence, offerSpecs, profileFor } from '../js/app/39-offer-equivalence.js';
import { psBuildRails, PS_PRODUCT } from '../js/app/39-showcase-logic.js';

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, info ? JSON.stringify(info) : ''); } };
const P = (title, extra) => Object.assign({ title, subCategory: 'X' }, extra || {});
const same = (a, b) => offerEquivalence(a, b).equivalent;

/* ---------- electronics ---------- */
const tv = { subCategory: 'TV & Audio', category: 'Electronics', condition: 'Mpya' };
ok('TV 55" vs 43" are NOT the same', !same(P('Samsung Smart TV 55 inch', tv), P('Samsung Smart TV 43 inch', tv)));
ok('TV 55 inch vs 55" (unit spelling) ARE the same', same(P('Samsung Smart TV 55 inch', tv), P('Samsung Smart TV 55"', tv)));
ok('TV with size vs TV without size is NOT assumed equal', !same(P('Samsung Smart TV 55 inch', tv), P('Samsung Smart TV', tv)));
ok('TV without size on both sides is not confirmable (electronics needs identity)', !same(P('Samsung Smart TV', tv), P('Samsung Smart TV', tv)));
ok('TV new vs used is NOT the same', !same(P('Samsung TV 55 inch', tv), P('Samsung TV 55 inch', Object.assign({}, tv, { condition: 'Iliyotumika' }))));
ok('TV condition missing on one side is NOT assumed', !same(P('Samsung TV 55 inch', tv), P('Samsung TV 55 inch', { subCategory: 'TV & Audio', category: 'Electronics' })));
const phone = { subCategory: 'Smartphones', category: 'Simu', condition: 'Mpya' };
ok('Phone 128GB vs 256GB are NOT the same', !same(P('Samsung Galaxy A54 128GB', phone), P('Samsung Galaxy A54 256GB', phone)));
ok('Phone A54 vs A34 (model code) are NOT the same', !same(P('Samsung Galaxy A54 128GB', phone), P('Samsung Galaxy A34 128GB', phone)));
ok('iPhone 13 vs iPhone 14 (bare model number) are NOT the same', !same(P('Apple iPhone 13 128GB', phone), P('Apple iPhone 14 128GB', phone)));
ok('Phone same model/capacity/condition ARE the same', same(P('Samsung Galaxy A54 128GB', phone), P('Galaxy A54 Samsung 128 GB', phone)));
ok('Phone 8GB RAM vs 6GB RAM are NOT the same', !same(P('Tecno Spark 20 128GB 8GB RAM', phone), P('Tecno Spark 20 128GB 6GB RAM', phone)));
ok('Phone brand field mismatch is NOT the same', !same(P('Galaxy A54 128GB', Object.assign({ brand: 'Samsung' }, phone)), P('Galaxy A54 128GB', Object.assign({ brand: 'Generic' }, phone))));
ok('Phone brand on one side only is NOT assumed', !same(P('Galaxy A54 128GB', Object.assign({ brand: 'Samsung' }, phone)), P('Galaxy A54 128GB', phone)));
ok('Storage attribute "1TB" equals "1024 GB"', same(P('Laptop HP ProBook', { subCategory: 'Laptops', category: 'Computers', condition: 'Mpya', attributes: { storage: '1TB' } }),
  P('Laptop HP ProBook', { subCategory: 'Laptops', category: 'Computers', condition: 'Mpya', attributes: { storage: '1024 GB' } })));
ok('Iron 1200W vs 1000W are NOT the same', !same(P('Pasi ya Umeme Philips 1200W', { subCategory: 'Jikoni' }), P('Pasi ya Umeme Philips 1000W', { subCategory: 'Jikoni' })));

/* ---------- food ---------- */
const food = { subCategory: 'Nafaka', category: 'Chakula & Vinywaji' };
ok('Rice 5kg vs 25kg are NOT the same', !same(P('Mchele Kyela 5kg', food), P('Mchele Kyela 25kg', food)));
ok('Rice 5kg vs 5000g ARE the same (unit conversion)', same(P('Mchele Kyela 5kg', food), P('Mchele Kyela 5000g', food)));
ok('Rice weight missing on one side is NOT assumed', !same(P('Mchele Kyela 5kg', food), P('Mchele Kyela', food)));
ok('Rice without any weight on both is not confirmable (food needs quantity)', !same(P('Mchele Kyela', food), P('Mchele Kyela', food)));
ok('Cooking oil 1L vs 500ml are NOT the same', !same(P('Mafuta ya Kupikia Korie 1L', food), P('Mafuta ya Kupikia Korie 500ml', food)));
ok('Soda 6x500ml vs 12x500ml (pack size) are NOT the same', !same(P('Coca Cola 6x500ml', food), P('Coca Cola 12x500ml', food)));
ok('Soda 6x500ml vs 6 x 0.5L ARE the same', same(P('Coca Cola 6x500ml', food), P('Coca Cola 6 x 0.5l', food)));
ok('Sugar 1kg vs Rice 1kg (different name) are NOT the same', !same(P('Sukari Kilombero 1kg', food), P('Mchele Kyela 1kg', food)));

/* ---------- agriculture ---------- */
const agri = { subCategory: 'Mbolea', category: 'Kilimo & Inputs za Kilimo' };
ok('Fertilizer 50kg vs 25kg are NOT the same', !same(P('Mbolea ya Urea 50kg', agri), P('Mbolea ya Urea 25kg', agri)));
ok('Fertilizer same bag size ARE the same', same(P('Mbolea ya Urea 50kg', agri), P('Urea Mbolea 50 kg', agri)));
const seeds = { subCategory: 'Mbegu', category: 'Kilimo' };
ok('Seed variety attribute differs → NOT the same', !same(P('Mbegu za Mahindi 2kg', Object.assign({ attributes: { variety: 'SC403' } }, seeds)), P('Mbegu za Mahindi 2kg', Object.assign({ attributes: { variety: 'DK8031' } }, seeds))));
ok('Seed variety stated on one side only → NOT assumed', !same(P('Mbegu za Mahindi 2kg', Object.assign({ attributes: { variety: 'SC403' } }, seeds)), P('Mbegu za Mahindi 2kg', seeds)));

/* ---------- furniture ---------- */
const furn = { subCategory: 'Sofa', category: 'Nyumba & Samani', condition: 'Mpya' };
ok('Sofa 3-seater vs 5-seater are NOT the same', !same(P('Sofa ya Mninga 3 seater', furn), P('Sofa ya Mninga 5 seater', furn)));
ok('Sofa same seats ARE the same', same(P('Sofa ya Mninga 3 seater', furn), P('Sofa Mninga 3 seater', furn)));
ok('Sofa without seats/size on both is not confirmable', !same(P('Sofa ya Mninga', furn), P('Sofa ya Mninga', furn)));
const bed = { subCategory: 'Vitanda', category: 'Samani' };
ok('Bed 5x6 ft vs 6x6 ft (size attribute) are NOT the same', !same(P('Kitanda cha Mninga', Object.assign({ attributes: { size: '5x6' } }, bed)), P('Kitanda cha Mninga', Object.assign({ attributes: { size: '6x6' } }, bed))));

/* ---------- fashion / vehicles / construction / general ---------- */
const shoe = { subCategory: 'Viatu', category: 'Nguo & Mavazi', condition: 'Mpya' };
ok('Shoe size 42 vs 44 (attribute) are NOT the same', !same(P('Nike Air Force 1', Object.assign({ attributes: { size: '42' } }, shoe)), P('Nike Air Force 1', Object.assign({ attributes: { size: '44' } }, shoe))));
ok('Shoe with size vs shoe with size variants sharing it: variant overlap is ok, missing size is not', !same(P('Nike Air Force 1', Object.assign({ attributes: { size: '42' } }, shoe)), P('Nike Air Force 1', shoe)));
ok('Variants with no common option are NOT the same', !same(P('Nike Air Force 1', Object.assign({ attributes: { size: 'multi' }, variants: [{ name: 'Saizi', options: ['40', '41'] }] }, shoe)),
  P('Nike Air Force 1', Object.assign({ attributes: { size: 'multi' }, variants: [{ name: 'Saizi', options: ['44', '45'] }] }, shoe))));
ok('Variants with a common option and same specs ARE the same', same(P('Nike Air Force 1', Object.assign({ attributes: { size: 'multi' }, variants: [{ name: 'Saizi', options: ['40', '41', '42'] }] }, shoe)),
  P('Nike Air Force 1', Object.assign({ attributes: { size: 'multi' }, variants: [{ name: 'Saizi', options: ['42', '43'] }] }, shoe))));
ok('Colour-only difference stated on one side does not block (soft spec)', same(P('Samsung Galaxy A54 128GB', Object.assign({ attributes: { color: 'Black' } }, phone)), P('Samsung Galaxy A54 128GB', phone)));
const tyre = { subCategory: 'Matairi', category: 'Vipuri', condition: 'Mpya' };
ok('Tyre R15 vs R16 (size attribute) are NOT the same', !same(P('Tairi Bridgestone', Object.assign({ attributes: { size: '195/65 R15' } }, tyre)), P('Tairi Bridgestone', Object.assign({ attributes: { size: '205/55 R16' } }, tyre))));
const cement = { subCategory: 'Saruji', category: 'Ujenzi & Hardware' };
ok('Cement 50kg vs 25kg are NOT the same', !same(P('Saruji Twiga 50kg', cement), P('Saruji Twiga 25kg', cement)));
ok('Cement grade 42.5 vs 32.5 (attribute) are NOT the same', !same(P('Saruji Twiga 50kg', Object.assign({ attributes: { grade: '42.5' } }, cement)), P('Saruji Twiga 50kg', Object.assign({ attributes: { grade: '32.5' } }, cement))));
ok('Different product type id is never the same', !same(P('Mchele 5kg', { productTypeId: 'PT-CAT-01-RICE' }), P('Mchele 5kg', { productTypeId: 'PT-CAT-01-FLOUR' })));
ok('Same product type id with differing sub-category label still compares by type', same(P('Mchele Kyela 5kg', { productTypeId: 'PT-CAT-01-RICE', subCategory: 'A' }), P('Mchele Kyela 5kg', { productTypeId: 'PT-CAT-01-RICE', subCategory: 'B' })));

/* ---------- profiles & specs ---------- */
ok('profile: canonical CAT-11 → electronics', profileFor({ categoryId: 'CAT-11' }).id === 'electronics');
ok('profile: legacy "Chakula" → food', profileFor({ category: 'Chakula' }).id === 'food');
ok('profile: unknown → general', profileFor({ category: 'Zawadi' }).id === 'general');
ok('specs: "1.5 L" parsed as volume 1.5', offerSpecs({ title: 'Maji Kilimanjaro 1.5 L' }).specs.volume === '1.5');
ok('specs: "12V 7Ah" voltage parsed', offerSpecs({ title: 'Betri 12V' }).specs.voltage === '12');

/* ---------- rails integration ---------- */
const cur = { id: 'a', userId: 's1', title: 'Samsung Smart TV 55 inch', subCategory: 'TV & Audio', category: 'Electronics', condition: 'Mpya', price: 1200000 };
const items = [
  { id: 'b', userId: 's2', title: 'Samsung Smart TV 55"', subCategory: 'TV & Audio', category: 'Electronics', condition: 'Mpya', price: 1150000 },
  { id: 'c', userId: 's3', title: 'Samsung Smart TV 43 inch', subCategory: 'TV & Audio', category: 'Electronics', condition: 'Mpya', price: 800000 },
  { id: 'd', userId: 's4', title: 'Samsung Smart TV', subCategory: 'TV & Audio', category: 'Electronics', condition: 'Mpya', price: 900000 },
  { id: 'e', userId: 's1', title: 'Samsung Smart TV 55 inch', subCategory: 'TV & Audio', category: 'Electronics', condition: 'Mpya', price: 1000000 }
];
const r = psBuildRails(items, cur, { collection: PS_PRODUCT });
ok('rails: only the 55" listing from another seller is an offer', JSON.stringify(r.offers.map(x => x.id)) === '["b"]', r.offers.map(x => x.id));
ok('rails: 43" and size-unknown listings go to relatedOffers', JSON.stringify(r.relatedOffers.map(x => x.id).sort()) === '["c","d"]', r.relatedOffers.map(x => x.id));
ok('rails: related listings carry the reason', r.relatedOffers.every(x => Array.isArray(x.__reasons) && x.__reasons.length));
ok('rails: same seller is never an offer or related offer', ![...r.offers, ...r.relatedOffers].some(x => x.id === 'e'));
const rice = psBuildRails([{ id: 'r2', userId: 's2', title: 'Mchele Kyela 25kg', subCategory: 'Nafaka', category: 'Chakula', price: 70000 }],
  { id: 'r1', userId: 's1', title: 'Mchele Kyela 5kg', subCategory: 'Nafaka', category: 'Chakula', price: 15000 }, { collection: PS_PRODUCT });
ok('rails: rice 5kg is never compared with 25kg as the same offer', rice.offers.length === 0 && rice.relatedOffers.length === 1);

console.log(`\nOFFER EQUIVALENCE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

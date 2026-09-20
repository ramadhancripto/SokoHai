#!/usr/bin/env node
/* ==== tools/test_showcase.mjs ====
   Majaribio ya mantiki tupu ya Product Showcase (Module 02).
   Hakuna DOM/Firebase — hujaribu 39-showcase-logic.js moja kwa moja.
   Endesha: node tools/test_showcase.mjs
   ================================================================ */
import assert from 'node:assert/strict';
import {
    psMoney, psNum, psPresent, psIsVideo, psTitle, psSellerName,
    psAvailability, psCanBuy, psCanBid,
    psSpecRows, psHasDetails,
    psSummarizeReviews, psRatingDisplay,
    psVariantGroups, psVariantDelta, psVariantLabel,
    psTokens, psScoreItem, psBuildRails,
    PS_PRODUCT, PS_SERVICE, PS_DRIVER
} from '../js/app/39-showcase-logic.js';

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  ✅ ' + name); }
    catch (e) { failed++; console.error('  ❌ ' + name + '\n     ' + (e && e.message)); }
}
function section(name) { console.log('\n[' + name + ']'); }

/* ---------------------------------------------------------------- */
section('A) Misaada ya msingi');

test('psMoney: bei na maelewano', () => {
    assert.equal(psMoney(12500), 'TSh 12,500');
    assert.equal(psMoney(0), 'Maelewano');
    assert.equal(psMoney(null), 'Maelewano');
    assert.equal(psMoney('abc'), 'Maelewano');
});
test('psNum inakataa namba zisizo halali', () => {
    assert.equal(psNum(3), 3); assert.equal(psNum(0), 0); assert.equal(psNum(null), null); assert.equal(psNum('x'), null);
});
test('psPresent inatambua N/A na tupu', () => {
    assert.ok(psPresent('Mbeya')); assert.ok(!psPresent('')); assert.ok(!psPresent('N/A')); assert.ok(!psPresent(null));
});
test('psIsVideo: viendelezi na Cloudinary video', () => {
    assert.ok(psIsVideo('https://x.co/a.mp4'));
    assert.ok(psIsVideo('https://res.cloudinary.com/x/video/upload/v1/a.webm'));
    assert.ok(!psIsVideo('https://x.co/a.jpg'));
});
test('psTitle kulingana na aina', () => {
    assert.equal(psTitle({ title: 'Mchele' }, PS_PRODUCT), 'Mchele');
    assert.equal(psTitle({ driverName: 'Dereva Juma' }, PS_DRIVER), 'Dereva Juma');
    assert.equal(psTitle({}, PS_SERVICE), 'Huduma');
});

/* ---------------------------------------------------------------- */
section('B) Upatikanaji (availability — data ikijulikana tu)');

test('bidhaa zipo nyingi', () => {
    const a = psAvailability({ stock: 40 }, PS_PRODUCT);
    assert.equal(a.kind, 'in'); assert.match(a.label, /40/);
    assert.ok(psCanBuy({ stock: 40 }, PS_PRODUCT));
});
test('zimebaki chache', () => {
    const a = psAvailability({ stock: 3 }, PS_PRODUCT);
    assert.equal(a.kind, 'low'); assert.match(a.label, /Zimebaki 3/);
});
test('zimeisha: hairuhusu kununua', () => {
    const a = psAvailability({ stock: 0 }, PS_PRODUCT);
    assert.equal(a.kind, 'out');
    assert.ok(!psCanBuy({ stock: 0 }, PS_PRODUCT));
});
test('stock isiyojulikana: haibandiki uwongo', () => {
    assert.equal(psAvailability({}, PS_PRODUCT).kind, 'unknown');
    assert.ok(psCanBuy({}, PS_PRODUCT)); // haizuii isipojulikana
});
test('dukani pekee (offline_only) hali tofauti', () => {
    const a = psAvailability({ isOnline: false, isOffline: true }, PS_PRODUCT);
    assert.equal(a.kind, 'offline');
    assert.ok(!psCanBuy({ isOnline: false, isOffline: true }, PS_PRODUCT));
});
test('huduma: inapatikana kila mara', () => {
    assert.equal(psAvailability({}, PS_SERVICE).kind, 'service');
    assert.equal(psAvailability({ section: 'online' }, PS_SERVICE).label, 'Inapatikana mtandaoni');
});
test('mnada: hai vs uliofungwa; CanBid', () => {
    const live = { saleMode: 'auction', modeData: { endTime: Date.now() + 100000 } };
    const closed = { saleMode: 'auction', modeData: { endTime: Date.now() - 1 } };
    assert.equal(psAvailability(live, PS_PRODUCT).kind, 'auction');
    assert.equal(psAvailability(closed, PS_PRODUCT).kind, 'out');
    assert.ok(psCanBid(live, PS_PRODUCT));
    assert.ok(!psCanBid(closed, PS_PRODUCT));
    assert.ok(!psCanBuy(live, PS_PRODUCT)); // mnada si Nunua
});

/* ---------------------------------------------------------------- */
section('C) Sifa zinazoonyeshwa (zilizopo tu)');

test('bidhaa kamili na filters na wholesale', () => {
    const p = {
        category: 'Vyakula', subCategory: 'Mchele', baseUnit: 'kg',
        filters: { 'Aina': 'Kahawa', 'Ukubwa': '25kg' },
        hasBulkPackaging: true, conversionRatio: 25, bulkUnit: 'gunia',
        wholesalePrice: 70000, isOnline: true, isOffline: true
    };
    const rows = psSpecRows(p, PS_PRODUCT);
    const labels = rows.map(r => r.label);
    assert.ok(labels.includes('Kategoria'));
    assert.ok(labels.includes('Aina')); // subCategory
    assert.ok(labels.includes('Kipimo'));
    assert.ok(labels.includes('Ufungaji wa jumla'));
    assert.ok(labels.includes('Bei ya jumla'));
    assert.ok(labels.includes('Mpangilio wa kupata'));
    const pack = rows.find(r => r.label === 'Ufungaji wa jumla');
    assert.match(pack.value, /25 kg = 1 gunia/);
    const chan = rows.find(r => r.label === 'Mpangilio wa kupata');
    assert.match(chan.value, /Mtandaoni na dukani/);
});
test('barcode haionyeshwi kwa mteja; N/A zimeachwa', () => {
    const rows = psSpecRows({ category: 'Simu', subCategory: 'N/A', barcode: '123456' }, PS_PRODUCT);
    const labels = rows.map(r => r.label);
    assert.ok(!labels.includes('Barcode'));
    assert.ok(!labels.includes('Aina')); // N/A imetupwa
});
test('huduma: section, category, filters, eneo', () => {
    const rows = psSpecRows({ section: 'physical', category: 'Ufundi', location: 'Mwanza', filters: { 'Muda': 'Saa 24' } }, PS_SERVICE);
    const labels = rows.map(r => r.label);
    assert.ok(labels.includes('Aina ya huduma'));
    assert.ok(labels.includes('Kategoria'));
    assert.ok(labels.includes('Eneo'));
});
test('dereva: chombo, huduma, njia', () => {
    const rows = psSpecRows({ vehicleType: 'Pickup', supportedServices: ['Mizigo', 'Samani'], pickupRegion: 'Dar', destinationRegion: 'Morogoro' }, PS_DRIVER);
    const blob = rows.map(r => r.label + ':' + r.value).join('|');
    assert.match(blob, /Pickup/);
    assert.match(blob, /Mizigo, Samani/);
    assert.match(blob, /Dar → Morogoro/);
});
test('psHasDetails: description tu / tupu kabisa', () => {
    assert.ok(psHasDetails({ description: 'Mchele mzuri', category: 'Vyakula' }, PS_PRODUCT));
    assert.ok(psHasDetails({ category: 'Vyakula' }, PS_PRODUCT)); // specs za tosha
    assert.ok(!psHasDetails({}, PS_PRODUCT));
    assert.ok(!psHasDetails({ description: 'In-store Product' }, PS_PRODUCT));
});

/* ---------------------------------------------------------------- */
section('D) Tathmini (reviews)');

test('wastani, idadi, mpangilio wa hivi karibuni', () => {
    const comments = [
        { rating: 5, timestamp: '2026-01-03', text: 'bora' },
        { rating: 3, timestamp: '2026-01-01' },
        { rating: 4, timestamp: '2026-01-02' },
        { text: 'swali tu, bila rating' }
    ];
    const s = psSummarizeReviews(comments);
    assert.equal(s.count, 3);
    assert.equal(s.avg, 4.0);
    assert.equal(s.distribution[5], 1);
    assert.equal(s.distribution[3], 1);
    assert.equal(s.latest[0].timestamp, '2026-01-03');
});
test('bila tathmini: sifuri salama', () => {
    const s = psSummarizeReviews(undefined);
    assert.equal(s.count, 0); assert.equal(s.avg, 0);
});
test('psRatingDisplay: comments hushinda field ya zamani', () => {
    const d1 = psRatingDisplay({ comments: [{ rating: 5 }, { rating: 4 }], rating: 2 });
    assert.equal(d1.avg, 4.5); assert.equal(d1.source, 'comments');
    const d2 = psRatingDisplay({ rating: 4.2, reviewCount: 11 });
    assert.equal(d2.avg, 4.2); assert.equal(d2.count, 11); assert.equal(d2.source, 'field');
    assert.equal(psRatingDisplay({}), null);
});

/* ---------------------------------------------------------------- */
section('E) Variants za data (si vya kubahatisha)');

test('Mavazi: saizi fallback, rangi hazibuniwi', () => {
    const g = psVariantGroups({ category: 'Mavazi', price: 10000 }, PS_PRODUCT);
    const keys = g.map(x => x.key);
    assert.ok(keys.includes('size'));
    assert.ok(!keys.includes('color'));
    assert.deepEqual(g[0].options.map(o => o.value), ['S', 'M', 'L', 'XL', 'XXL']);
});
test('Mavazi: rangi huchukuliwa kutoka filters/ data', () => {
    const g = psVariantGroups({ category: 'Mavazi', filters: { 'Rangi': 'Nyekundu, Bluu' } }, PS_PRODUCT);
    const color = g.find(x => x.key === 'color');
    assert.ok(color);
    assert.deepEqual(color.options.map(o => o.value), ['Nyekundu', 'Bluu']);
});
test('sizePrices huongeza bei (delta); XXL haina tena +2000 ya kubuni', () => {
    const p = { category: 'Mavazi', price: 10000, sizePrices: { XXL: 3000 } };
    const g = psVariantGroups(p, PS_PRODUCT);
    const size = g.find(x => x.key === 'size');
    const xxl = size.options.find(o => o.value === 'XXL');
    assert.equal(xxl.delta, 3000);
    const sel = { size: 'XXL' };
    assert.equal(psVariantDelta(p, sel), 3000);
    // bila data, XXL delta 0 (hakuna nyongeza ya uongo)
    const p2 = { category: 'Mavazi', price: 10000 };
    assert.equal(psVariantDelta(p2, { size: 'XXL' }), 0);
});
test('variants kamili vya muuzaji (explicit)', () => {
    const p = {
        variants: [
            { name: 'Ujazo', options: ['500ml', '1L'], priceDeltas: { '1L': 500 } }
        ]
    };
    const g = psVariantGroups(p, PS_PRODUCT);
    assert.equal(g.length, 1);
    assert.equal(g[0].key, 'ujazo');
    assert.equal(g[0].options[1].delta, 500);
});
test('bidhaa isiyo na variants: hamna chips', () => {
    assert.deepEqual(psVariantGroups({ category: 'Vyakula' }, PS_PRODUCT), []);
    assert.deepEqual(psVariantGroups({}, PS_SERVICE), []);
});
test('psVariantLabel', () => {
    const groups = psVariantGroups({ category: 'Mavazi', colors: ['Black'] }, PS_PRODUCT);
    assert.equal(psVariantLabel({ size: 'L', color: 'Black' }, groups), 'L / Black');
    assert.equal(psVariantLabel({ size: 'N/A', color: 'N/A' }, groups), '');
});

/* ---------------------------------------------------------------- */
section('F) Alama za related (scoring)');

test('tokens: maneno mafupi na ya kawaida huondolewa', () => {
    const t = psTokens('Mchele wa Mbeya na Mahindi');
    assert.ok(t.includes('mchele'));
    assert.ok(t.includes('mbeya'));
    assert.ok(t.includes('mahindi'));
    assert.ok(!t.includes('na'));
    assert.ok(!t.includes('wa'));
});
test('subcategory hushinda; muuzaji mwingine anapendelewa; zimeisha zinarudi nyuma', () => {
    const cur = { id: 'a', category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele Mbeya', userId: 's1', location: 'Mbeya' };
    const sameSubOther = { id: 'b', category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele Kahawa', userId: 's2', stock: 10 };
    const sameSubMine = { id: 'c', category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele Mbeya premium', userId: 's1', stock: 10 };
    const catOnlyOther = { id: 'd', category: 'Vyakula', subCategory: 'Mahindi', title: 'Mahindi', userId: 's3', stock: 10 };
    const outOfStock = { id: 'e', category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele', userId: 's4', stock: 0 };
    const sB = psScoreItem(sameSubOther, cur);
    const sC = psScoreItem(sameSubMine, cur);
    const sD = psScoreItem(catOnlyOther, cur);
    const sE = psScoreItem(outOfStock, cur);
    assert.ok(sB > sC, 'muuzaji mwingine apate alama zaidi');
    assert.ok(sC > sD, 'subcategory mbele ya category tu');
    assert.ok(sE < sB, 'zimeisha nyuma');
});

/* ---------------------------------------------------------------- */
section('G) Rails za related (ugawaji + mipaka)');

const baseCur = () => ({ id: 'cur1', collectionName: PS_PRODUCT, category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele Mbeya', userId: 'sellerA', location: 'Mbeya', stock: 20 });

test('bidhaa ya sasa haijirudi; duplicates zinaondolewa; collection inazingatiwa', () => {
    const cur = baseCur();
    const items = [
        { id: 'cur1', category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele Mbeya', userId: 'sellerA' },
        { id: 'x1', collectionName: PS_PRODUCT, category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele', userId: 'sellerB', stock: 5 },
        { id: 'x1', collectionName: PS_PRODUCT, category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele duplicate', userId: 'sellerB', stock: 5 },
        { id: 'srv1', collectionName: PS_SERVICE, category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele huduma', userId: 'sellerB' }
    ];
    const r = psBuildRails(items, cur, { collection: PS_PRODUCT });
    const allIds = [...r.similar, ...r.moreCategory, ...r.otherSellers, ...r.recommended].map(x => x.id);
    assert.ok(!allIds.includes('cur1'));
    assert.equal(allIds.filter(i => i === 'x1').length, 1);
    assert.ok(!allIds.includes('srv1'));
});
test('similar hushika za subcategory; moreCategory za category; otherSellers ni wauzaji tofauti', () => {
    const cur = baseCur();
    const items = [
        { id: 'sim1', category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele Kahawa', userId: 'sellerB', stock: 9 },
        { id: 'sim2', category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele Morogoro', userId: 'sellerA', stock: 9 }, // muuzaji yule
        { id: 'mor1', category: 'Vyakula', subCategory: 'Mahindi', title: 'Mahindi mabichi', userId: 'sellerC', stock: 9 },
        { id: 'mor2', category: 'Vyakula', subCategory: 'Maharage', title: 'Maharage', userId: 'sellerD', stock: 9 }
    ];
    const r = psBuildRails(items, cur, { collection: PS_PRODUCT });
    assert.ok(r.similar.map(x => x.id).includes('sim1'));
    // muuzaji mwingine yuko ama similar ama otherSellers; same-seller hawezi kuwa otherSellers
    assert.ok(!r.otherSellers.some(x => x.userId === 'sellerA'));
    // mahindi yamekwea kwenye moreCategory
    assert.ok(r.moreCategory.map(x => x.id).includes('mor1'));
    // kila id mara moja tu kwa jumla
    const allIds = [...r.similar, ...r.moreCategory, ...r.otherSellers, ...r.recommended].map(x => x.id);
    assert.equal(allIds.length, new Set(allIds).size);
});
test('otherSellers hujazwa na wauzaji wengine hata kama si category hiyo', () => {
    const cur = baseCur();
    const items = [
        { id: 'o1', category: 'Nguo', subCategory: 'Mashati', title: 'Shati', userId: 'sellerZ', stock: 3 },
        { id: 'o2', category: 'Vifaa', subCategory: 'Sufuria', title: 'Sufuria', userId: 'sellerY', stock: 3 }
    ];
    const r = psBuildRails(items, cur, { collection: PS_PRODUCT });
    assert.ok(r.otherSellers.length >= 1);
    assert.ok(r.otherSellers.every(x => x.userId !== 'sellerA'));
});
test('idadi huzuiwa (cap)', () => {
    const cur = baseCur();
    const items = [];
    for (let i = 0; i < 30; i++) {
        items.push({ id: 'b' + i, category: 'Vyakula', subCategory: 'Mchele', title: 'Mchele ' + i, userId: 'seller' + (i + 10), stock: 5 });
    }
    const r = psBuildRails(items, cur, { collection: PS_PRODUCT, cap: 8 });
    assert.ok(r.similar.length <= 8);
    assert.ok(r.moreCategory.length <= 8);
    assert.ok(r.otherSellers.length <= 8);
    assert.ok(r.recommended.length <= 8);
});
test('mtandao mtupu: rails tupu salama', () => {
    const r = psBuildRails([], baseCur(), { collection: PS_PRODUCT });
    assert.equal(r.similar.length, 0);
    assert.equal(r.otherSellers.length, 0);
});
test('kundi lisilohusiana kabisa hujaza recommended (ukuta usiwe tupu)', () => {
    const cur = baseCur();
    const items = [
        { id: 'r1', category: 'Nguo', subCategory: 'Mashati', title: 'Shati nyeupe', userId: 'sellerQ', stock: 2 },
        { id: 'r2', category: 'Nguo', subCategory: 'Suruali', title: 'Suruali jeans', userId: 'sellerR', stock: 2 }
    ];
    const r = psBuildRails(items, cur, { collection: PS_PRODUCT });
    assert.ok(r.recommended.length >= 1 || r.otherSellers.length >= 1);
});

/* ---------------------------------------------------------------- */
console.log('\n==================================================');
console.log(`MATOKEO: ${passed} zimepita, ${failed} zimeshindwa`);
if (failed) process.exit(1);
console.log('✅ SHOWCASE LOGIC: MAJARIBIO YOTE YAMEPITA');

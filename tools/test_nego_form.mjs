/* ============================================================
 * SOKOHAI — Majaribio ya NEGO MODULE 01 (Dynamic Negotiation Form)
 * Hupima LOGIC TUPU (38-nego-form-logic.js) — bila DOM/Firebase.
 * Endesha:  node tools/test_nego_form.mjs
 * ============================================================ */
import assert from 'node:assert/strict';
import {
    NF_TYPES, sectionsFor, defaultValues, validateForm,
    buildProposal, summaryLines, computeTotals, deadlineText,
    resolveVariantFields, nfIsValidDate, nfDateGte, nfTodayISO, nfAddDaysISO
} from '../js/app/38-nego-form-logic.js';

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); passed++; console.log('  ✅ ' + name); }
function eq(name, a, b) { assert.equal(a, b, name + ` (got ${JSON.stringify(a)})`); passed++; console.log('  ✅ ' + name); }

const productEntity = {
    id: 'p_rice1', collection: 'products', title: 'Mchele Mbeya 25kg',
    price: 75000, image: 'https://example.com/rice.jpg', sellerId: 'seller_1',
    sellerName: 'Duka la Mbeya', category: 'Vyakula na Vinywaji (Food)', stockQuantity: 40
};
const shirtEntity = {
    id: 'p_shirt', collection: 'products', title: 'Shati ya Oxford',
    price: 30000, sellerId: 'seller_9', sellerName: 'Fashion DSM',
    category: 'Mavazi na Fashoni (Fashion)', stockQuantity: 12
};
const serviceEntity = {
    id: 's_tailor', collection: 'services', title: 'Ushonaji wa Suti',
    price: 120000, sellerId: 'prov_1', sellerName: 'Fundi Mosi'
};
const serviceScheduled = Object.assign({}, serviceEntity, { negotiationScheduleRequired: true });
const transportEntity = {
    id: 'ride_1', collection: 'ride_requests', title: 'Mifuko ya mchele',
    fare: 30000, route: { from: 'Tabora', to: 'Pangale' },
    fromLocation: 'Tabora', toLocation: 'Pangale', sellerId: 'driver_1'
};
const ctx = { conversationId: 'conv_1', buyerId: 'buyer_1', buyerName: 'Asha', sellerId: 'seller_1', sellerName: 'Duka la Mbeya' };

console.log('\n[1] CONFIG — fomu inajua aina za biashara');
{
    const p = sectionsFor(NF_TYPES.PRODUCT, productEntity);
    const s = sectionsFor(NF_TYPES.SERVICE, serviceEntity);
    const t = sectionsFor(NF_TYPES.TRANSPORT, transportEntity);
    ok('product ina sections za bei/quantity + ujumbe', p.length >= 2);
    ok('service basic ina scope/bei bila delivery/pickup', JSON.stringify(s).includes('scope') && JSON.stringify(s).includes('unitPrice') && !JSON.stringify(s).includes('pickup') && !JSON.stringify(s).includes('deliveryLocation'));
    ok('service basic hailazimishi ratiba/mahali', !JSON.stringify(s).includes('deadlineQty') && !JSON.stringify(s).includes('location'));
    const scheduled = sectionsFor(NF_TYPES.SERVICE, Object.assign({}, serviceEntity, { negotiationScheduleRequired: true }));
    ok('service yenye business rule wazi ina ratiba', JSON.stringify(scheduled).includes('deadlineQty') && JSON.stringify(scheduled).includes('location'));
    ok('transport ina route/cargo/dates/fee', JSON.stringify(t).includes('from') && JSON.stringify(t).includes('to') && JSON.stringify(t).includes('pickupDate') && JSON.stringify(t).includes('deliveryDeadline') && JSON.stringify(t).includes('fee'));
    const tKeys = t.flatMap(sec => sec.fields.map(f => f.key));
    ok('transport HAINA color/size', !tKeys.includes('color') && !tKeys.includes('size'));
    const pKeys = p.flatMap(sec => sec.fields.map(f => f.key));
    ok('product haina pickup/destination/delivery choice', !pKeys.includes('pickupDate') && !pKeys.includes('from') && !pKeys.includes('deliveryLocation') && !pKeys.includes('preferredDate'));
}

console.log('\n[2] VARIANTS — zinaonekana kwa bidhaa zinazofaa tu');
{
    const vFashion = resolveVariantFields(shirtEntity);
    const keys = vFashion.map(f => f.key);
    ok('mavazi yana size na color', keys.includes('size') && keys.includes('color'));
    const vFood = resolveVariantFields(productEntity);
    ok('chakula hakina size/color/model', !vFood.some(f => ['size', 'color', 'model'].includes(f.key)));
    const tech = resolveVariantFields({ category: 'Electronics & Teknoloji (Tech)' });
    ok('tech ina model/condition', tech.some(f => f.key === 'model') && tech.some(f => f.key === 'condition'));
    const declared = resolveVariantFields({ variants: { sizes: ['38', '40'], colors: ['Navy'] } });
    ok('variants waliozwa na muuzaji wanaheshimiwa', declared.some(f => f.key === 'size') && JSON.stringify(declared).includes('Navy'));
}

console.log('\n[3] PRODUCT — idadi, bei, jumla ya kiotomatiki');
{
    const v = defaultValues(NF_TYPES.PRODUCT, productEntity);
    eq('bei ya kuanzia = bei ya sokoni', v.unitPrice, 75000);
    eq('jumla qty 1', computeTotals('product', { quantity: 1, unitPrice: 75000 }).total, 75000);
    eq('jumla qty 2', computeTotals('product', { quantity: 2, unitPrice: 68000 }).total, 136000);
    eq('jumla inabadilika bei ikibadilika', computeTotals('product', { quantity: 3, unitPrice: 60000 }).total, 180000);
    var t = computeTotals('product', { quantity: 5, unitPrice: '' });
    eq('bila bei hakuna jumla', t.total, null);
}

console.log('\n[4] PRODUCT — validation');
{
    const base = { quantity: 2, unitPrice: 68000, notes: '', deliveryLocation: '', preferredDate: '' };
    eq('valid kabisa', validateForm('product', base, productEntity).valid, true);
    eq('qty 0 imekataliwa', validateForm('product', Object.assign({}, base, { quantity: 0 }), productEntity).valid, false);
    eq('qty hasi imekataliwa', validateForm('product', Object.assign({}, base, { quantity: -3 }), productEntity).valid, false);
    eq('qty juu ya stock imekataliwa', validateForm('product', Object.assign({}, base, { quantity: 99 }), productEntity).valid, false);
    eq('bei hasi imekataliwa', validateForm('product', Object.assign({}, base, { unitPrice: -100 }), productEntity).valid, false);
    eq('bei tupu imekataliwa', validateForm('product', Object.assign({}, base, { unitPrice: '' }), productEntity).valid, false);
    eq('delivery fields haziathiri basic negotiation', validateForm('product', Object.assign({}, base, { preferredDate: '2020-01-01', deliveryLocation: 'X' }), productEntity).valid, true);
    const r = validateForm('product', Object.assign({}, base, { quantity: 0 }), productEntity);
    ok('ujumbe wa kirafiki wa qty', /idadi/i.test(r.errors.quantity));
}

console.log('\n[5] PRODUCT — proposal inahifadhi IDs na bei ya sokoni HAIGUSWI');
{
    const values = { quantity: 2, unitPrice: 68000, variants: {}, notes: 'Mchele safi, mifuko mipya', deliveryLocation: 'Pangale', preferredDate: nfAddDaysISO(nfTodayISO(), 7), size: '', color: '', model: '', condition: '', weight: '', package: '' };
    const p = buildProposal('product', productEntity, values, ctx);
    eq('productId imehifadhiwa', p.productId, 'p_rice1');
    eq('sellerId imehifadhiwa', p.sellerId, 'seller_1');
    eq('buyerId imehifadhiwa', p.buyerId, 'buyer_1');
    eq('conversationId imehifadhiwa', p.conversationId, 'conv_1');
    eq('jumla = 2×68000', p.total, 136000);
    eq('bei ya sokoni 75000 imebaki', p.catalogPrice, 75000);
    eq('pendekezo 68000', p.unitPrice, 68000);
    eq('hali ya mwanzo OFFER_SENT', p.currentState, 'OFFER_SENT');
    eq('version 1', p.version, 1);
    eq('maelezo yamehifadhiwa', p.notes, 'Mchele safi, mifuko mipya');
    ok('Product proposal HAINA deliveryLocation/preferredDate', !Object.prototype.hasOwnProperty.call(p, 'deliveryLocation') && !Object.prototype.hasOwnProperty.call(p, 'preferredDate'));
    ok('Product proposal HAINA transport pickup fields', !Object.prototype.hasOwnProperty.call(p, 'pickupDate') && !Object.prototype.hasOwnProperty.call(p, 'route'));
    // SHERIA MUHIMU: entity haijabadilishwa
    eq('bei ya entity bado 75000', productEntity.price, 75000);
    // Variant zilizo tupu haziandikwi
    eq('variants tupu = null', p.variants, null);
}

console.log('\n[6] PRODUCT — variants zimejengwa (fashion)');
{
    const values = { quantity: 1, unitPrice: 28000, notes: '', deliveryLocation: '', preferredDate: '', size: 'L', color: 'Blue', model: '', condition: '', weight: '', package: '' };
    const p = buildProposal('product', shirtEntity, values, Object.assign({}, ctx, { sellerId: 'seller_9' }));
    eq('variant size L', p.variants.size, 'L');
    eq('variant color Blue', p.variants.color, 'Blue');
    const lines = summaryLines('product', p).map(l => l.label + ':' + l.value).join('|');
    ok('summary ina chaguzi', /Chaguzi/.test(lines));
}

console.log('\n[7] SERVICE — scope, idadi, bei, jumla, deadline, mahali');
{
    const v = defaultValues('service', serviceScheduled);
    eq('default deadline qty', v.deadlineQty, 2);
    const values = Object.assign({}, v, { scope: 'Suti mbili rasmi za wanawake', quantity: 2, unitPrice: 100000, deadlineQty: 10, deadlineUnit: 'siku', location: 'Tabora', requirements: 'Mteja atatoa vitambaa', notes: 'Nyeusi, slim fit' });
    const check = validateForm('service', values, serviceScheduled);
    eq('service valid', check.valid, true);
    eq('service total 2×100k', check.totals.total, 200000);
    const p = buildProposal('service', serviceScheduled, values, Object.assign({}, ctx, { sellerId: 'prov_1', sellerName: 'Fundi Mosi' }));
    eq('serviceId', p.serviceId, 's_tailor');
    eq('scope', p.scope, 'Suti mbili rasmi za wanawake');
    eq('deadline text', p.deadline, 'siku 10');
    ok('deadline date imekokotolewa', nfIsValidDate(p.deadlineDate));
    eq('location', p.location, 'Tabora');
    eq('requirements', p.requirements, 'Mteja atatoa vitambaa');
    eq('bado OFFER_SENT (si oda)', p.currentState, 'OFFER_SENT');
    // validation errors
    eq('scope tupu imekataliwa', validateForm('service', Object.assign({}, values, { scope: '' }), serviceScheduled).valid, false);
    eq('mahali tupu imekataliwa', validateForm('service', Object.assign({}, values, { location: '' }), serviceScheduled).valid, false);
    eq('deadline 0 imekataliwa', validateForm('service', Object.assign({}, values, { deadlineQty: 0 }), serviceScheduled).valid, false);
    eq('bei 0 imekataliwa', validateForm('service', Object.assign({}, values, { unitPrice: 0 }), serviceScheduled).valid, false);
}

console.log('\n[8] TRANSPORT — njia, mzigo, tarehe, nauli');
{
    const values = {
        from: 'Tabora', to: 'Pangale', packageDescription: 'Mifuko ya mchele',
        packageCount: 5, packageUnit: 'mfuko', weight: 250,
        pickupDate: nfAddDaysISO(nfTodayISO(), 1), deliveryDeadline: nfAddDaysISO(nfTodayISO(), 2),
        fee: 25000, vehicleType: '', specialRequirements: 'Shughulikia kwa makini', notes: ''
    };
    const check = validateForm('transport', values, transportEntity);
    eq('transport valid', check.valid, true);
    eq('jumla = nauli (si ×qty)', check.totals.total, 25000);
    const p = buildProposal('transport', transportEntity, values, Object.assign({}, ctx, { sellerId: 'driver_1', sellerName: 'Dereva Juma' }));
    eq('transportId', p.transportId, 'ride_1');
    eq('route from', p.route.from, 'Tabora');
    eq('route to', p.route.to, 'Pangale');
    eq('packageQuantity', p.packageQuantity, '5 mfuko');
    eq('weight kg', p.weight, 250);
    eq('pickup', p.pickupDate, values.pickupDate);
    eq('deadline', p.deliveryDeadline, values.deliveryDeadline);
    eq('qty 1 (nauli ya safari)', p.quantity, 1);
    eq('total = fee', p.total, 25000);
    eq('special req', p.specialRequirements, 'Shughulikia kwa makini');
    // errors
    eq('pickup tupu imekataliwa', validateForm('transport', Object.assign({}, values, { pickupDate: '' }), transportEntity).valid, false);
    eq('destination tupu imekataliwa', validateForm('transport', Object.assign({}, values, { to: '' }), transportEntity).valid, false);
    eq('from == to imekataliwa', validateForm('transport', Object.assign({}, values, { to: 'Tabora' }), transportEntity).valid, false);
    eq('deadline kabla ya pickup imekataliwa', validateForm('transport', Object.assign({}, values, { deliveryDeadline: nfAddDaysISO(nfTodayISO(), 0), pickupDate: nfAddDaysISO(nfTodayISO(), 5) }), transportEntity).valid, false);
    eq('nauli 0 imekataliwa', validateForm('transport', Object.assign({}, values, { fee: 0 }), transportEntity).valid, false);
    eq('cargo tupu imekataliwa', validateForm('transport', Object.assign({}, values, { packageDescription: '' }), transportEntity).valid, false);
    eq('uzito hasi umekataliwa', validateForm('transport', Object.assign({}, values, { weight: -5 }), transportEntity).valid, false);
}

console.log('\n[9] LIVE SUMMARY — mistari inafuata aina na thamani za sasa');
{
    const values = { quantity: 2, unitPrice: 68000, notes: 'Mchele safi', deliveryLocation: 'Pangale', preferredDate: '', size: '', color: '', model: '', condition: '', weight: '', package: '' };
    const p = buildProposal('product', productEntity, values, ctx);
    const lines = summaryLines('product', p);
    ok('summary ina idadi/bei/jumla', lines.some(l => l.label === 'Jumla'));
    const totalLine = lines.filter(l => l.label === 'Jumla')[0];
    eq('jumla kwenye summary', totalLine.value, 'TSh 136,000');
    const tValues = { from: 'Tabora', to: 'Pangale', packageDescription: 'Mchele', packageCount: 5, packageUnit: 'mfuko', weight: 250, pickupDate: nfTodayISO(), deliveryDeadline: nfAddDaysISO(nfTodayISO(), 1), fee: 25000, vehicleType: '', specialRequirements: '', notes: '' };
    const tp = buildProposal('transport', transportEntity, tValues, ctx);
    const tl = summaryLines('transport', tp).map(l => l.label + '=' + l.value).join('|');
    ok('summary ya usafiri ina njia', /Tabora → Pangale/.test(tl));
}

console.log('\n[10] DEADLINE CALC — wiki/miezi');
{
    eq('wiki 2 = siku 14', deadlineText({ deadlineQty: 2, deadlineUnit: 'wiki' }).text, 'wiki 2');
    const d = deadlineText({ deadlineQty: 1, deadlineUnit: 'wiki' });
    eq('tarehe wiki moja mbele', d.date, nfAddDaysISO(nfTodayISO(), 7));
}

console.log('\n[11] HAKUNA MABADILIKO YA MFUMO WA NJE (no silent mutation)');
{
    const before = JSON.stringify(productEntity);
    const values = { quantity: 4, unitPrice: 50000, notes: '', deliveryLocation: '', preferredDate: '', size: '', color: '', model: '', condition: '', weight: '', package: '' };
    buildProposal('product', productEntity, values, ctx);
    eq('entity haijaguswa baada ya proposal', JSON.stringify(productEntity), before);
}

console.log('\n========================================');
console.log('ALL ' + passed + ' NEGO FORM TESTS PASSED ✅');

/* ============================================================
 * SOKOHAI — Majaribio ya INJINI YA MAJADILIANO (37-negotiation.js)
 * Scenarios 1–7: ofa → counter → makubaliano → ombi la kiasi →
 * kukataa/kuisha, pamoja na huduma/usafiri na usalama wa HTML.
 * Hupima LOGIC TUPU — bila DOM/Firebase.
 * Endesha:  node tools/test_negotiation_engine.mjs
 * ============================================================ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Injini inategemea skh/window za browser — stub kwa node.
globalThis.window = {};
const src = fs.readFileSync(path.join(root, 'js/app/37-negotiation.js'), 'utf8')
    .replace("import { skh } from './00-bootstrap.js';", 'const skh = {};');
const dataUrl = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
const N = (await import(dataUrl)).default || globalThis.window.skhNego;

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); passed++; console.log('  ✅ ' + name); }
function eq(name, a, b) { assert.equal(a, b, name + ` (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); passed++; console.log('  ✅ ' + name); }
function cmds(nego, role) {
    const ctx = role === 'seller' ? { iAmSeller: true } : { iAmBuyer: true };
    return N.resolve(nego, ctx).map(a => a.command);
}
function baseNego(over) {
    return Object.assign({
        negotiationId: 'n1', conversationId: 'c1', commerceType: 'product',
        productId: 'p1', productTitle: 'Mchele', productCollection: 'products',
        sellerId: 's1', sellerName: 'Duka', buyerId: 'b1', buyerName: 'Asha',
        currency: 'TZS', currentState: 'DRAFT', turn: 'buyer',
        quantity: 2, originalUnitPrice: 75000, currentUnitPrice: 68000, currentTotal: 136000,
        deliveryLocation: 'Pangale', preferredDate: '2026-09-20', version: 0
    }, over || {});
}
// Tekeleza amri kupitia injini na kurudisha nego jipya (kama native fallback).
function step(nego, cmd, actor, params) {
    const uid = actor === 'seller' ? 's1' : 'b1';
    const r = N.applyCommandLocally(nego, cmd, params || {}, uid, '2026-09-13T10:00:00Z');
    if (!r.ok) throw new Error(cmd + ' (' + actor + ') ilishindwa: ' + r.error);
    return Object.assign({}, nego, r.patch);
}

console.log('\n[SCENARIO 1] Mnunuzi atuma ofa → zamu ya muuzaji');
{
    let n = baseNego();
    n = step(n, 'SEND_OFFER', 'buyer', { price: 68000, quantity: 2 });
    eq('hali OFFER_SENT', n.currentState, 'OFFER_SENT');
    eq('turn ya seller', n.turn, 'seller');
    eq('waitingForUserId = seller', n.waitingForUserId, 's1');
    eq('version 1', n.version, 1);
    eq('jumla imehesabiwa', n.currentTotal, 136000);
    const sellerCmds = cmds(n, 'seller');
    ok('muuzaji ana Kubali/Counter/Kataa',
        JSON.stringify(sellerCmds) === JSON.stringify(['ACCEPT_OFFER', 'COUNTER_OFFER', 'REJECT_OFFER']));
    const buyerCmds = cmds(n, 'buyer');
    ok('mnunuzi hana jibu (anaweza kughairi tu)', !buyerCmds.includes('ACCEPT_OFFER') && !buyerCmds.includes('COUNTER_OFFER'));
    // Mtu wa nje hawezi kujibu
    const r = N.applyCommandLocally(n, 'ACCEPT_OFFER', {}, 'mgeni', 'now');
    ok('mgeni kataliwa', !r.ok && r.code === 'permission-denied');
    // Mnunuzi hawezi kujibu zamu ya muuzaji
    const r2 = N.applyCommandLocally(n, 'ACCEPT_OFFER', {}, 'b1', 'now');
    ok('mnunuzi hawezi ACCEPT wakati si zamu yake', !r2.ok);
}

console.log('\n[SCENARIO 2] Muuzaji counter → zamu ya mnunuzi');
{
    let n = step(baseNego(), 'SEND_OFFER', 'buyer', { price: 68000, quantity: 2 });
    n = step(n, 'COUNTER_OFFER', 'seller', { price: 72000, quantity: 2 });
    eq('hali COUNTER_OFFER', n.currentState, 'COUNTER_OFFER');
    eq('turn ya buyer', n.turn, 'buyer');
    eq('waitingForUserId = buyer', n.waitingForUserId, 'b1');
    eq('bei ya counter', n.currentUnitPrice, 72000);
    eq('jumla mpya', n.currentTotal, 144000);
    const buyerCmds = cmds(n, 'buyer');
    ok('mnunuzi sasa ana Kubali/Counter/Kataa',
        JSON.stringify(buyerCmds) === JSON.stringify(['ACCEPT_OFFER', 'COUNTER_OFFER', 'REJECT_OFFER']));
    ok('muuzaji hana tena vitufe vya kujibu', !cmds(n, 'seller').includes('ACCEPT_OFFER'));
}

console.log('\n[SCENARIO 3] Makubaliano → vitufe vya majadiliano kutoweka, Oda kwa mnunuzi');
{
    let n = step(baseNego(), 'SEND_OFFER', 'buyer', { price: 68000, quantity: 2 });
    n = step(n, 'ACCEPT_OFFER', 'seller', {});
    eq('hali AGREEMENT', n.currentState, 'AGREEMENT');
    ok('makubaliano yamerekodiwa', (n.agreements || []).length >= 1);
    const buyerCmds = cmds(n, 'buyer');
    ok('mnunuzi ana CREATE_ORDER', buyerCmds.includes('CREATE_ORDER'));
    ok('mnunuzi ana REQUEST_QUANTITY_CHANGE', buyerCmds.includes('REQUEST_QUANTITY_CHANGE'));
    ok('hakuna tena Counter baada ya makubaliano', !buyerCmds.includes('COUNTER_OFFER'));
    const sellerCmds = cmds(n, 'seller');
    ok('muuzaji haoni CREATE_ORDER', !sellerCmds.includes('CREATE_ORDER'));
    ok('muuzaji haoni Accept/Counter/Reject',
        !sellerCmds.some(c => ['ACCEPT_OFFER', 'COUNTER_OFFER', 'REJECT_OFFER'].includes(c)));
    // Kufungua oda
    const n2 = step(n, 'CREATE_ORDER', 'buyer', {});
    eq('hali ORDER_CREATED', n2.currentState, 'ORDER_CREATED');
    ok('orderId imetolewa', !!n2.orderId);
}

console.log('\n[SCENARIO 4] Ombi la kiasi baada ya makubaliano (current → requested)');
{
    let n = step(baseNego(), 'SEND_OFFER', 'buyer', { price: 68000, quantity: 2 });
    n = step(n, 'ACCEPT_OFFER', 'seller', {});
    // Muuzaji hawezi kuomba mabadiliko ya kiasi
    const rs = N.applyCommandLocally(n, 'REQUEST_QUANTITY_CHANGE', { quantity: 5 }, 's1', 'now');
    ok('muuzaji hawezi REQUEST_QUANTITY_CHANGE', !rs.ok);
    n = step(n, 'REQUEST_QUANTITY_CHANGE', 'buyer', { quantity: 5 });
    eq('hali CHANGE_REQUESTED', n.currentState, 'CHANGE_REQUESTED');
    eq('turn ya seller', n.turn, 'seller');
    eq('kiasi cha sasa bado 2', n.quantity, 2);
    eq('kiasi kilichoombwa 5 (pending)', n.pendingQuantity, 5);
    const pend = N.pendingChangeHtml(n);
    ok('pending huonyesha 2 → 5', pend.some(l => l.includes('2') && l.includes('5') && l.includes('→')));
    const sellerCmds = cmds(n, 'seller');
    ok('muuzaji ana ACCEPT/COUNTER/REJECT za kiasi',
        ['ACCEPT_QUANTITY_CHANGE', 'COUNTER_QUANTITY_CHANGE', 'REJECT_QUANTITY_CHANGE'].every(c => sellerCmds.includes(c)));
    const buyerCmds = cmds(n, 'buyer');
    ok('mnunuzi hana vitufe vya kujibu ombi lake mwenyewe',
        !buyerCmds.includes('ACCEPT_QUANTITY_CHANGE'));
    // Kukubali → FINAL_AGREEMENT, kiasi kubadilika
    let n2 = step(n, 'ACCEPT_QUANTITY_CHANGE', 'seller', {});
    eq('hali FINAL_AGREEMENT', n2.currentState, 'FINAL_AGREEMENT');
    eq('kiasi sasa 5', n2.quantity, 5);
    eq('jumla mpya 340000', n2.currentTotal, 340000);
    eq('pendingQuantity imefutwa', n2.pendingQuantity, null);
    // Counter ya kiasi → RE_NEGOTIATION, zamu ya mnunuzi
    let n3 = step(n, 'COUNTER_QUANTITY_CHANGE', 'seller', { price: 70000, quantity: 4 });
    eq('hali RE_NEGOTIATION', n3.currentState, 'RE_NEGOTIATION');
    eq('turn ya buyer baada ya counter', n3.turn, 'buyer');
    eq('counter imeweka kiasi 4', n3.quantity, 4);
    // Kukataa → warudi AGREEMENT
    const n4 = step(n, 'REJECT_QUANTITY_CHANGE', 'seller', {});
    eq('kukataa ombi kunarudisha AGREEMENT', n4.currentState, 'AGREEMENT');
}

console.log('\n[SCENARIO 5] HUDUMA — majadiliano ya scope');
{
    const n = baseNego({
        commerceType: 'service', productId: null, productTitle: null,
        serviceId: 'h1', serviceTitle: 'Ushonaji wa Suti',
        scope: 'Suti 2', quantity: 1, currentUnitPrice: 120000, currentTotal: 120000
    });
    let n1 = step(n, 'SEND_OFFER', 'buyer', { price: 120000, quantity: 1 });
    eq('ofa ya huduma OFFER_SENT', n1.currentState, 'OFFER_SENT');
    // Mwenye zamu (seller/provider) anaweza kuomba CHANGE_SCOPE
    const sellerCmds = cmds(n1, 'seller');
    ok('provider ana CHANGE_SCOPE', sellerCmds.includes('CHANGE_SCOPE'));
    let n2 = step(n1, 'CHANGE_SCOPE', 'seller', { scope: 'Suti 3', deadline: 'siku 7', price: 150000 });
    eq('hali SCOPE_CHANGE_REQUESTED', n2.currentState, 'SCOPE_CHANGE_REQUESTED');
    ok('pending scope imehifadhiwa', !!n2.pendingScope);
    const pend = N.pendingChangeHtml(n2);
    ok('pending huonyesha scope mpya', pend.some(l => l.includes('Suti 3')));
}

console.log('\n[SCENARIO 6] USAMBARAZAJI — njia/nauli, booking baada ya makubaliano');
{
    const n = baseNego({
        commerceType: 'transport', productId: null, productTitle: null,
        transportId: 't1', transportTitle: 'DSM→Mwanza',
        route: { from: 'Dar es Salaam', to: 'Mwanza' },
        quantity: 1, currentUnitPrice: 150000, currentTotal: 150000
    });
    let n1 = step(n, 'SEND_OFFER', 'buyer', { price: 150000, quantity: 1 });
    const sellerCmds = cmds(n1, 'seller');
    ok('transporter ana CHANGE_ROUTE', sellerCmds.includes('CHANGE_ROUTE'));
    let n2 = step(n1, 'ACCEPT_OFFER', 'seller', {});
    eq('makubaliano ya safari AGREEMENT', n2.currentState, 'AGREEMENT');
    const buyerCmds = cmds(n2, 'buyer');
    ok('mnunuzi ana CREATE_BOOKING', buyerCmds.includes('CREATE_BOOKING'));
    let n3 = step(n2, 'CREATE_BOOKING', 'buyer', {});
    eq('booking imefungwa (ORDER_CREATED)', n3.currentState, 'ORDER_CREATED');
    // Terms huonyesha njia na nauli
    const parts = N.commerceTermParts(n1).map(p => p.label + ':' + p.value);
    ok('njia imeandikwa "Dar es Salaam → Mwanza"', parts.some(p => p.includes('Dar es Salaam → Mwanza')));
    ok('nauli TSh 150,000 imo', parts.some(p => p.includes('150,000')));
}

console.log('\n[SCENARIO 7] Kukataa → terminal, mnunuzi anaweza kutuma ofa mpya');
{
    let n = step(baseNego(), 'SEND_OFFER', 'buyer', { price: 68000, quantity: 2 });
    n = step(n, 'REJECT_OFFER', 'seller', {});
    eq('hali REJECTED', n.currentState, 'REJECTED');
    ok('REJECTED ni terminal', N.isTerminal('REJECTED'));
    ok('muuzaji hana vitufe tena', cmds(n, 'seller').length === 0);
    const buyerCmds = cmds(n, 'buyer');
    ok('mnunuzi anaweza kutuma ofa mpya', buyerCmds.includes('SEND_OFFER'));
    // Ghairi
    let m = step(baseNego(), 'SEND_OFFER', 'buyer', { price: 68000, quantity: 2 });
    m = step(m, 'CANCEL_NEGOTIATION', 'buyer', {});
    eq('kughairi → CANCELLED terminal', m.currentState, 'CANCELLED');
}

console.log('\n[SCENARIO 8] ODA YA BIDHAA — pipeline ya uwasilishaji (kwa pande)');
function paidOrder(over) {
    return Object.assign({
        id: 'o1', orderId: 'o1', negotiationId: 'n1', source: 'negotiation', commerceType: 'product',
        buyerId: 'b1', sellerId: 's1', itemTitle: 'Mchele', quantity: 5, unitPrice: 68000,
        paymentStatus: 'paid', status: 'held', deliveryStatus: 'held'
    }, over || {});
}
{
    // Kabla ya malipo: hakuna utekelezaji wowote
    const unpaid = paidOrder({ paymentStatus: 'pending', status: 'payment_pending', deliveryStatus: 'payment_pending' });
    const r0 = N.applyOrderCommandLocally(unpaid, 'PREPARE_ORDER', 's1', 'now');
    ok('muuzaji hawezi kuandaa kabla ya malipo', !r0.ok);
    // Mnunuzi hawezi kuchukua hatua za muuzaji
    const r1 = N.applyOrderCommandLocally(paidOrder(), 'PREPARE_ORDER', 'b1', 'now');
    ok('mnunuzi hawezi PREPARE_ORDER', !r1.ok && r1.code === 'permission-denied');
    // Mgeni kataliwa
    const r2 = N.applyOrderCommandLocally(paidOrder(), 'PREPARE_ORDER', 'mgeni', 'now');
    ok('mgeni kataliwa kwenye oda', !r2.ok && r2.code === 'permission-denied');
    // Mzunguko kamili wa muuzaji
    let o = paidOrder();
    let r = N.applyOrderCommandLocally(o, 'PREPARE_ORDER', 's1', 't1');
    ok('PREPARE → prepared/shipped', r.ok && r.patch.deliveryStatus === 'prepared' && r.patch.status === 'shipped');
    o = Object.assign({}, o, r.patch);
    r = N.applyOrderCommandLocally(o, 'START_TRANSIT', 's1', 't2');
    ok('TRANSIT → in_transit', r.ok && r.patch.deliveryStatus === 'in_transit');
    o = Object.assign({}, o, r.patch);
    // Rukia hatua hakiruhusiwi
    const skip = N.applyOrderCommandLocally(paidOrder({ deliveryStatus: 'held' }), 'START_TRANSIT', 's1', 't');
    ok('kuruka prepared hairuhusiwi', !skip.ok);
    r = N.applyOrderCommandLocally(o, 'MARK_DELIVERED', 's1', 't3');
    ok('DELIVERED → delivered', r.ok && r.patch.deliveryStatus === 'delivered' && r.patch.status === 'delivered');
    o = Object.assign({}, o, r.patch);
    // Muuzaji hawezi kuthibitisha kupokea
    const rs = N.applyOrderCommandLocally(o, 'CONFIRM_RECEIPT', 's1', 't4');
    ok('muuzaji hawezi kuthibitisha kupokea', !rs.ok);
    r = N.applyOrderCommandLocally(o, 'CONFIRM_RECEIPT', 'b1', 't4');
    ok('CONFIRM → confirmed/completed', r.ok && r.patch.deliveryStatus === 'confirmed' && r.patch.status === 'completed');
    ok('tukio (event) limeandaliwa', !!r.event && r.event.actorRole === 'buyer' && r.event.newState === 'confirmed');
    ok('arifa inamfikia muuzaji', r.notification.to === 's1');
}

console.log('\n[SCENARIO 9] ODA YA HUDUMA — pipeline ya utekelezaji');
{
    const base = paidOrder({ commerceType: 'service', deliveryStatus: undefined, serviceStatus: 'held', kind: 'service_order' });
    let o = base;
    let r = N.applyOrderCommandLocally(o, 'START_SERVICE', 's1', 't1');
    ok('START_SERVICE → service_in_progress (status bado held)', r.ok && r.patch.serviceStatus === 'service_in_progress' && r.patch.status === 'held');
    o = Object.assign({}, o, r.patch);
    r = N.applyOrderCommandLocally(o, 'SUBMIT_WORK', 's1', 't2');
    ok('SUBMIT_WORK → service_submitted', r.ok && r.patch.serviceStatus === 'service_submitted');
    o = Object.assign({}, o, r.patch);
    // Muuzaji hawezi kuthibitisha mwenyewe
    ok('muuzaji hawezi CONFIRM_COMPLETION', !N.applyOrderCommandLocally(o, 'CONFIRM_COMPLETION', 's1', 't').ok);
    // Omba marekebisho → rudia kazi → wasilisha tena → kamilisha
    let rv = N.applyOrderCommandLocally(o, 'REQUEST_REVISION', 'b1', 't3');
    ok('REQUEST_REVISION → revision_requested', rv.ok && rv.patch.serviceStatus === 'revision_requested');
    let o2 = Object.assign({}, o, rv.patch);
    let rs = N.applyOrderCommandLocally(o2, 'SUBMIT_WORK', 's1', 't4');
    ok('SUBMIT_WORK tena baada ya marekebisho', rs.ok && rs.patch.serviceStatus === 'service_submitted');
    let o3 = Object.assign({}, o2, rs.patch);
    let rc = N.applyOrderCommandLocally(o3, 'CONFIRM_COMPLETION', 'b1', 't5');
    ok('CONFIRM_COMPLETION → completed', rc.ok && rc.patch.serviceStatus === 'completed' && rc.patch.status === 'completed');
}

console.log('\n[SCENARIO 10] BOOKING YA USAMBARAZAJI — booking → pickup → safari → handover');
{
    let o = paidOrder({ commerceType: 'transport', deliveryStatus: undefined, transportStatus: 'held', kind: 'booking' });
    let r = N.applyOrderCommandLocally(o, 'CONFIRM_BOOKING', 's1', 't1');
    ok('CONFIRM_BOOKING → booking_confirmed', r.ok && r.patch.transportStatus === 'booking_confirmed');
    o = Object.assign({}, o, r.patch);
    r = N.applyOrderCommandLocally(o, 'START_PICKUP', 's1', 't2');
    ok('START_PICKUP → pickup', r.ok && r.patch.transportStatus === 'pickup');
    o = Object.assign({}, o, r.patch);
    r = N.applyOrderCommandLocally(o, 'START_TRANSIT', 's1', 't3');
    ok('START_TRANSIT → in_transit', r.ok && r.patch.transportStatus === 'in_transit');
    o = Object.assign({}, o, r.patch);
    r = N.applyOrderCommandLocally(o, 'CONFIRM_HANDOVER', 's1', 't4');
    ok('CONFIRM_HANDOVER → handover', r.ok && r.patch.transportStatus === 'handover');
    o = Object.assign({}, o, r.patch);
    r = N.applyOrderCommandLocally(o, 'CONFIRM_RECEIPT', 'b1', 't5');
    ok('mnunuzi athibitishe kupokea → confirmed/completed', r.ok && r.patch.transportStatus === 'confirmed' && r.patch.status === 'completed');
    // Amri ya bidhaa hairuhusiwi kwa booking
    ok('PREPARE_ORDER haifanyi kazi kwa booking', !N.applyOrderCommandLocally(paidOrder({ commerceType: 'transport', transportStatus: 'held' }), 'PREPARE_ORDER', 's1', 't').ok);
}

console.log('\n[SCENARIO 11] SAFARI YA UKAGUZI — ofa→counter→counter→kubali→oda (bei ILIYOGANDISHWA)');
{
    const now = '2026-09-13T10:00:00Z';
    // 68,000×2 → muuzaji counter 72,000 → mnunuzi counter 70,000 → KUBALI → oda
    let n = baseNego();
    n = step(n, 'SEND_OFFER', 'buyer', { price: 68000, quantity: 2 });
    n = step(n, 'COUNTER_OFFER', 'seller', { price: 72000, quantity: 2 });
    n = step(n, 'COUNTER_OFFER', 'buyer', { price: 70000, quantity: 2 });
    n = step(n, 'ACCEPT_OFFER', 'seller', {});
    eq('hali AGREEMENT', n.currentState, 'AGREEMENT');
    eq('bei ya makubaliano 70,000', n.currentUnitPrice, 70000);
    eq('jumla 140,000', n.currentTotal, 140000);
    const agreedSeller = cmds(n, 'seller');
    ok('muuzaji hana CREATE_ORDER baada ya makubaliano', !agreedSeller.includes('CREATE_ORDER'));
    ok('muuzaji hana ACCEPT/COUNTER/REJECT baada ya makubaliano',
        !agreedSeller.some(c => ['ACCEPT_OFFER', 'COUNTER_OFFER', 'REJECT_OFFER'].includes(c)));
    ok('mnunuzi ana CREATE_ORDER', cmds(n, 'buyer').includes('CREATE_ORDER'));

    const create = N.applyCommandLocally(n, 'CREATE_ORDER', {}, 'b1', now);
    ok('CREATE_ORDER imefanikiwa', create.ok && create.order && create.order.id);
    const doc = create.order.doc;
    eq('oda ina unit 70,000 (si bei ya sasa ya katalogi 75,000)', doc.unitPrice, 70000);
    eq('oda ina jumla 140,000', doc.amount, 140000);
    eq('oda ina idadi 2', doc.quantity, 2);
    eq('oda inaunganisha negotiationId', doc.negotiationId, 'n1');
    eq('oda ina conversationId', doc.conversationId, 'c1');
    ok('oda ina snapshot ya makubaliano', !!doc.agreementSnapshot);
    eq('snapshot ya makubaliano pia 70,000', doc.agreementSnapshot && doc.agreementSnapshot.unitPrice, 70000);
    eq('oda mpya haijalipwa (payment_pending)', doc.status, 'payment_pending');
    eq('paymentStatus pending', doc.paymentStatus, 'pending');

    // Jenga tena kupitia helper ya umma (thibitisha bei haiji tena katalogini)
    const doc2 = N.buildOrderDocLocal(Object.assign({}, n, { orderId: create.order.id }), create.order.id, now);
    eq('helper wa umma: unit 70,000', doc2.unitPrice, 70000);
    eq('helper wa umma: jumla 140,000', doc2.amount, 140000);

    // Baada ya CREATE_ORDER: muuzaji haoni kabisa kitufe cha kupinga/kukubali
    const withOrder = Object.assign({}, n, create.patch);
    const sellerAfter = cmds(withOrder, 'seller');
    ok('baada ya oda muuzaji hana ACCEPT/COUNTER/REJECT',
        !sellerAfter.some(c => ['ACCEPT_OFFER', 'COUNTER_OFFER', 'REJECT_OFFER'].includes(c)));
}

console.log('\n[ZIADA] Oda mpya za huduma/usafiri huanzia payment_pending');
{
    const now = '2026-09-13T10:00:00Z';
    const svcNego = Object.assign(baseNego(), { commerceType: 'service', productId: null, serviceId: 'h1', serviceTitle: 'Ushonaji' });
    const svcOrder = N.buildOrderDocLocal(svcNego, 'oX', now);
    eq('service order huanzia payment_pending', svcOrder.serviceStatus, 'payment_pending');
    const trNego = Object.assign(baseNego(), { commerceType: 'transport', productId: null, transportId: 't1', transportTitle: 'Safari' });
    const trOrder = N.buildOrderDocLocal(trNego, 'oY', now);
    eq('booking huanzia payment_pending', trOrder.transportStatus, 'payment_pending');
}

console.log('\n[ZIADA] Uandishi wa terms, jumla na usalama wa HTML');
{
    const n = baseNego({ requirements: '<img src=x onerror=alert(1)>' });
    const html = N.commerceTermsHtml(baseNego()).join('');
    ok('Jumla 136,000 kwenye terms', html.includes('136,000'));
    ok('Bei 68,000 kwenye terms', html.includes('68,000'));
    const svc = baseNego({ commerceType: 'service', productId: null, requirements: '<b>x</b>', scope: 'Suti', currentTotal: 120000 });
    const svcHtml = N.commerceTermsHtml(svc).join(' ');
    ok('thamani chafu ya requirements huachiliwa', svcHtml.includes('&lt;b&gt;x&lt;/b&gt;') && !svcHtml.includes('<b>x</b>'));
    const plain = N.commerceTermsLines(baseNego()).join(' ');
    ok('maandishi tupu hayana <b>', !plain.includes('<b>'));
    // buildButtons: default handler hubeba negotiationId na haulinganikiwi na quotes
    const ofN = step(baseNego(), 'SEND_OFFER', 'buyer', { price: 68000, quantity: 2 });
    const buttons = N.buildButtons(ofN, { iAmSeller: true });
    ok('kila onclick ina negotiationId', (buttons.match(/negotiationId/g) || []).length >= 3);
    ok('nukta za ndani zimefungwa (&quot;)', buttons.includes('&quot;'));
    ok('hakuna markup mbichi ya function kwenye onclick', !buttons.includes('function ()'));
}

console.log('\n==================================================');
console.log(`NEGO ENGINE (Scenarios 1–7): ${passed} zimepita, 0 zimeshindwa`);
console.log('✅ INJINI YA MAJADILIANO SAHIHI');

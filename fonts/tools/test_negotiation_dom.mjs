/* ============================================================
 * SOKOHAI — Jaribio la DOM la MAZUNGUMZO YA BIASHARA (jsdom).
 * Huhakiki pande zote (muuzaji/mnunuzi): kadi, bango la zamu,
 * vitufe, escaping ya HTML, kadi za oda na fallback ya asili.
 * Endesha:  node tools/test_negotiation_dom.mjs
 * Inahitaji: npm i jsdom (node_modules haijajumuishwa kwenye ZIP).
 * ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const dom = new JSDOM('<!doctype html><html><body><div id="chatMessages"></div></body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.navigator = window.navigator;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const skh = {
    db: {},
    currentUser: { uid: 'buyer1', displayName: 'Asha', email: 'a@x.co' },
    skhEscape: esc, skhJsEsc: esc,
    requireAuth: () => true,
    chatCore: null, negoCurrent: null, negoOrder: null,
    localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
    myCart: [],
    collection: () => ({}), doc: () => ({}), query: () => ({}),
    where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    onSnapshot: () => () => {}, getDocs: async () => ({ forEach() {} }),
    getDoc: async () => ({ exists: false, data: () => ({}) }),
    setDoc: async () => {}, addDoc: async () => ({}), updateDoc: async () => {}, deleteDoc: async () => {}
};
window.skh = skh;
globalThis.alert = window.alert = (m) => { console.log('   [alert]', m); };
globalThis.confirm = window.confirm = () => true;

async function loadApp(rel, outName) {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
        .replace("import { skh } from './00-bootstrap.js';", 'const skh = window.skh;');
    const tmp = path.join(ROOT, 'js/app', outName);
    fs.writeFileSync(tmp, src);
    await import('file://' + tmp);
    fs.unlinkSync(tmp);
}
await loadApp('js/app/37-negotiation.js', '_tmp_eng.mjs');
await loadApp('js/app/34-chat-core.js', '_tmp_chat.mjs');
// Hifadhi msikilizaji halisi (baadhi ya sehemu hubandika stub kwa makusudi).
const REAL_NEGO_LISTEN = window.skhNegoListen;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function negoOffer(state, extra) {
    return Object.assign({
        negotiationId: 'nego_1', conversationId: 'conv1',
        commerceType: 'product',
        productId: 'p1', productTitle: 'Mchele Mbeya 25kg', productCollection: 'products',
        sellerId: 'seller1', sellerName: 'Mlimani Rice Store', buyerId: 'buyer1', buyerName: 'Asha',
        currency: 'TZS', currentState: state, turn: 'seller',
        quantity: 2, originalUnitPrice: 75000, currentUnitPrice: 68000, currentTotal: 136000,
        deliveryLocation: 'Pangale', preferredDate: '2026-09-20',
        waitingForUserId: 'seller1', currentActorId: 'seller1', version: 1, history: []
    }, extra || {});
}
function negoMsg(nego) {
    return {
        id: 'm1', senderId: 'system', system: true, type: 'negotiation',
        negotiationId: nego.negotiationId, negotiationSnapshot: nego,
        createdAt: new Date().toISOString(), readBy: []
    };
}
function renderAs(uid, nego) {
    skh.currentUser.uid = uid;
    skh.negoCurrent = null; // hakuna live listener — tumia snapshot
    skh.negoOrder = null;
    skh.chatCore = { convId: 'conv1', partnerUid: uid === 'seller1' ? 'buyer1' : 'seller1', partnerName: 'Duka', msgs: [negoMsg(nego)], conv: {} };
    window.skhChatRenderStream();
    return $('#chatMessages');
}

console.log('\n[1] MUUZAJI anaona ofa — vitufe vya kujibu + bango la zamu');
{
    const n = negoOffer('OFFER_SENT');
    const box = renderAs('seller1', n);
    const html = box.innerHTML;
    ok('kadi ya negotiation imejengwa', !!$('.ch-nego-event'));
    ok('jina la bidhaa lipo', html.includes('Mchele Mbeya 25kg'));
    ok('MUUZAJI anaona KUBALI', html.includes('Kubali'));
    ok('MUUZAJI anaona COUNTER', html.includes('Counter') || html.includes('Badili'));
    ok('MUUZAJI anaona KATAA', html.includes('Kataa'));
    ok('bango: JIBU LAKO linahitajika', html.includes('Jibu lako linahitajika'));
    ok('hapasomeki "Inasubiri muuzaji" kwa muuzaji', !html.includes('Inasubiri muuzaji'));
    ok('vitufe vina negotiationId katika amri',
        $$('.ch-nego-actions .ch-nego-btn').every(b => (b.getAttribute('onclick') || '').includes('nego_1')));
}

console.log('\n[1b] KUBOFYA kweli — amri + negotiationId vinapokelewa');
{
    renderAs('seller1', negoOffer('OFFER_SENT'));
    const calls = [];
    window.skhNegoCommand = (cmd, payload) => { calls.push([cmd, payload]); return Promise.resolve(); };
    const btns = $$('.ch-nego-actions .ch-nego-btn');
    btns[0].click();
    ok('kubofya Kubali kunaita ACCEPT_OFFER', calls[0] && calls[0][0] === 'ACCEPT_OFFER');
    ok('amri ina negotiationId ya kadi', calls[0] && calls[0][1] && calls[0][1].negotiationId === 'nego_1');
    const counter = btns.find(b => /counter|badili/i.test(b.textContent));
    counter && counter.click();
    ok('kubofya Counter kunaita COUNTER_OFFER', calls[1] && calls[1][0] === 'COUNTER_OFFER');
    delete window.skhNegoCommand;
}

console.log('\n[2] MNUNUZI baada ya ofa — kusubiri tu, HANA vitufe');
{
    const box = renderAs('buyer1', negoOffer('OFFER_SENT'));
    ok('bango: Inasubiri muuzaji', box.innerHTML.includes('Inasubiri muuzaji'));
    const labels = $$('.ch-nego-actions .ch-nego-btn').map(b => b.textContent.trim());
    const bad = labels.filter(l => /kubali|counter|kataa|accept|decline/i.test(l));
    ok('hakuna kifungo cha kujibu kwa mnunuzi', bad.length === 0);
}

console.log('\n[3] COUNTER ya muuzaji — sasa zamu ya mnunuzi');
{
    const n = negoOffer('COUNTER_OFFER', { currentUnitPrice: 72000, currentTotal: 144000, turn: 'buyer', waitingForUserId: 'buyer1', currentActorId: 'buyer1', version: 2 });
    ok('mnunuzi anaona Jibu lako', renderAs('buyer1', n).innerHTML.includes('Jibu lako linahitajika'));
    ok('mnunuzi ana vitufe 3', $$('.ch-nego-actions .ch-nego-btn').length >= 3);
    ok('muuzaji anaona Inasubiri mnunuzi', renderAs('seller1', n).innerHTML.includes('Inasubiri mnunuzi'));
}

console.log('\n[4] MAKUBALIANO — majadiliano kufichwa, Oda kwa mnunuzi');
{
    const n = negoOffer('AGREEMENT', { turn: 'buyer', waitingForUserId: null, currentActorId: null });
    const bhtml = renderAs('buyer1', n).innerHTML;
    ok('bango la makubaliano', bhtml.includes('Mmekubaliana'));
    ok('mnunuzi anaona kitufe cha Oda', /Oda|Order/i.test(bhtml));
    ok('hakuna Counter/Kataa baada ya makubaliano', !/Counter/i.test(bhtml) && !/Kataa/i.test(bhtml));
    renderAs('seller1', n);
    const sl = $$('.ch-nego-actions .ch-nego-btn').map(b => b.textContent.trim());
    ok('muuzaji hana vitufe vya kujibu', !sl.some(l => /kubali|counter|kataa|accept|decline/i.test(l)));
}

console.log('\n[4b] OMBI LA KIASI — seller aone 2 → 5 na vitufe');
{
    const n = negoOffer('CHANGE_REQUESTED', { turn: 'seller', waitingForUserId: 'seller1', currentActorId: 'seller1', quantity: 2, pendingQuantity: 5, version: 4 });
    const shtml = renderAs('seller1', n).innerHTML;
    ok('muuzaji anaona ombi 2 → 5', shtml.includes('2') && shtml.includes('5') && shtml.includes('→'));
    ok('muuzaji ana vitufe vya kiasi', $$('.ch-nego-actions .ch-nego-btn').length >= 3);
    ok('bango Jibu lako kwa muuzaji', shtml.includes('Jibu lako linahitajika'));
    const bhtml = renderAs('buyer1', n).innerHTML;
    ok('mnunuzi anaona Inasubiri muuzaji', bhtml.includes('Inasubiri muuzaji'));
    const bl = $$('.ch-nego-actions .ch-nego-btn').map(b => b.textContent.trim());
    ok('mnunuzi hana vitufe vya kujibu ombi lake', !bl.some(l => /kubali|counter|kataa|accept|decline/i.test(l)));
}

console.log('\n[5] HTML IMEEPUKWA — hakuna &lt;b&gt;, XSS imezuiwa');
{
    const n = negoOffer('OFFER_SENT', { commerceType: 'service', productId: null, serviceId: 'h1', serviceTitle: 'Ushonaji', scope: 'Suti 2', requirements: '<img src=x onerror=alert(1)>' });
    const html = renderAs('seller1', n).innerHTML;
    ok('hakuna mfuatano wa &lt;b&gt; mbichi', !html.includes('&lt;b&gt;'));
    ok('hakuna <img> cha sindano', !/<img/i.test(html));
    ok('thamani mbovu imeachiliwa', html.includes('&lt;img'));
    ok('mfumo bado unatumia <b> halali', html.includes('<b>'));
}

console.log('\n[6] Terms za bidhaa (idadi, bei, jumla, uwasilishaji)');
{
    const text = renderAs('seller1', negoOffer('OFFER_SENT')).textContent;
    ok('idadi 2 imo', text.includes('2'));
    ok('bei 68,000 imo', text.includes('68,000'));
    ok('jumla 136,000 imo', text.includes('136,000'));
    ok('uwasilishaji Pangale imo', text.includes('Pangale'));
}

console.log('\n[7] API ya terms salama');
{
    const n = negoOffer('OFFER_SENT');
    ok('parts zipo', window.skhNego.commerceTermParts(n).length >= 3);
    ok('html line ina <b> halali', window.skhNego.commerceTermsHtml(n).some(l => l.includes('<b>')));
    ok('plain text lines HAZINA <b>', window.skhNego.commerceTermsLines(n).every(l => !l.includes('<b>')));
}

console.log('\n[8] KADI YA ODA — vitufe hufuata upande na hatua');
function orderNego(over) {
    return negoOffer('ORDER_CREATED', Object.assign({ turn: 'buyer', orderId: 'ord_9', waitingForUserId: null, currentActorId: null }, over || {}));
}
function renderOrderAs(uid, nego, order) {
    skh.currentUser.uid = uid;
    skh.negoCurrent = nego;
    skh.negoOrder = order;
    const msg = negoMsg(nego); msg.negotiationSnapshot = nego;
    skh.chatCore = { convId: 'conv1', partnerUid: uid === 'seller1' ? 'buyer1' : 'seller1', partnerName: 'Duka', msgs: [msg], conv: {} };
    window.skhChatRenderStream();
}
const orderLabels = () => $$('.ch-nego-actions .ch-nego-btn').map(b => b.textContent.trim());
{
    const n = orderNego();
    const unpaid = { id: 'ord_9', orderId: 'ord_9', commerceType: 'product', buyerId: 'buyer1', sellerId: 'seller1', paymentStatus: 'pending', status: 'payment_pending', deliveryStatus: 'payment_pending' };
    renderOrderAs('buyer1', n, unpaid);
    ok('mnunuzi ana Lipia kabla ya malipo', orderLabels().some(l => /lipia/i.test(l)));
    renderOrderAs('seller1', n, unpaid);
    ok('muuzaji hana vitufe vya oda/malipo kabla ya malipo', !orderLabels().some(l => /lipia|andaa|safirisha|thibitisha|booking|pickup/i.test(l)));

    const held = { id: 'ord_9', orderId: 'ord_9', commerceType: 'product', buyerId: 'buyer1', sellerId: 'seller1', paymentStatus: 'paid', status: 'held', deliveryStatus: 'held' };
    renderOrderAs('seller1', n, held);
    ok('muuzaji ana Andaa baada ya malipo', orderLabels().some(l => /andaa/i.test(l)));
    renderOrderAs('buyer1', n, held);
    ok('mnunuzi hana Andaa', !orderLabels().some(l => /andaa/i.test(l)));

    renderOrderAs('buyer1', n, { id: 'ord_9', orderId: 'ord_9', commerceType: 'product', buyerId: 'buyer1', sellerId: 'seller1', paymentStatus: 'paid', status: 'delivered', deliveryStatus: 'delivered' });
    ok('mnunuzi ana Nimepokea', orderLabels().some(l => /nimepokea|thibitisha/i.test(l)));

    const tn = orderNego({ commerceType: 'transport', productId: null, transportId: 't1', transportTitle: 'Safari' });
    renderOrderAs('seller1', tn, { id: 'ord_9', orderId: 'ord_9', commerceType: 'transport', buyerId: 'buyer1', sellerId: 'seller1', paymentStatus: 'paid', status: 'held', transportStatus: 'held' });
    ok('transporter ana Thibitisha Booking', orderLabels().some(l => /booking/i.test(l)));
}

console.log('\n[9] FALLBACK YA ASILI — amri ya oda huandika transaction');
{
    let txPatch = null, txEvent = null;
    skh.runTransaction = async (db, fn) => {
        const order = { id: 'ord_9', orderId: 'ord_9', source: 'negotiation', commerceType: 'product', buyerId: 'buyer1', sellerId: 'seller1', paymentStatus: 'paid', status: 'held', deliveryStatus: 'held', quantity: 5 };
        await fn({
            get: async () => ({ exists: true, exists: () => true, data: () => order }),
            update: (ref, patch) => { txPatch = patch; },
            set: (ref, data) => { txEvent = data; }
        });
    };
    skh.currentUser.uid = 'seller1';
    const n = orderNego();
    skh.negoCurrent = n;
    skh.negoOrder = { id: 'ord_9', orderId: 'ord_9', source: 'negotiation', commerceType: 'product', buyerId: 'buyer1', sellerId: 'seller1', paymentStatus: 'paid', status: 'held', deliveryStatus: 'held' };
    skh.chatCore = { convId: 'conv1', partnerUid: 'buyer1', partnerName: 'Asha', msgs: [], conv: {} };
    await window.skhNegoOrderCommand('PREPARE_ORDER', { orderId: 'ord_9' });
    ok('transaction imeandika prepared', txPatch && txPatch.deliveryStatus === 'prepared');
    ok('tukio la ukaguzi limeandikwa', txEvent && txEvent.command === 'PREPARE_ORDER');
    delete skh.runTransaction;
}

console.log('\n[10] BAADA YA MAKUBALIANO — bango la jukumu (mnunuzi huunda oda)');
{
    const agreed = negoOffer('AGREEMENT', { turn: 'buyer', waitingForUserId: null, currentActorId: null, currentUnitPrice: 70000, currentTotal: 140000 });
    const bhtml = renderAs('buyer1', agreed).innerHTML;
    ok('mnunuzi aambiwe kufungua oda', bhtml.includes('fungua oda'));
    const shtml = renderAs('seller1', agreed).innerHTML;
    ok('muuzaji aone "inasubiri mnunuzi kutengeneza oda"', shtml.includes('Inasubiri mnunuzi kutengeneza oda'));
    const sLabels = $$('.ch-nego-actions .ch-nego-btn').map(b => b.textContent.trim());
    ok('muuzaji hana Kabali/Counter/Kataa', !sLabels.some(l => /kubali|counter|kataa/i.test(l)));
}

console.log('\n[11] ODA IMEFUNGWA, BADO HAIJALIPWA — kadi + bango hujua jukumu');
{
    const n = orderNego();
    const unpaid = { id: 'ord_9', orderId: 'ord_9', negotiationId: 'nego_1', conversationId: 'conv1',
        commerceType: 'product', itemTitle: 'Mchele Mbeya 25kg', quantity: 2, unitPrice: 70000, amount: 140000,
        buyerId: 'buyer1', sellerId: 'seller1', paymentStatus: 'pending', status: 'payment_pending', deliveryStatus: 'payment_pending' };
    renderOrderAs('buyer1', n, unpaid);
    const bhtml = $('#chatMessages').innerHTML;
    ok('mnunuzi: bango la kulipa SokoPay', bhtml.includes('Lipa oda kupitia SokoPay'));
    ok('kadi: Inasubiri Malipo', bhtml.includes('Inasubiri Malipo'));
    ok('mnunuzi ana kitufe cha kulipa', orderLabels().some(l => /lipia/i.test(l)));
    renderOrderAs('seller1', n, unpaid);
    const shtml = $('#chatMessages').innerHTML;
    ok('muuzaji: inasubiri malipo ya mnunuzi', shtml.includes('Inasubiri malipo ya mnunuzi'));
    ok('muuzaji hana kitufe cha kulipa', !orderLabels().some(l => /lipia/i.test(l)));
}

console.log('\n[12] KADI YA ODA KAMA UJUMBE — inasubiri vs imelindwa escrow');
function orderMsg(snap) {
    return { id: 'om_' + snap.status, senderId: 'system', system: true, type: 'order',
        orderRef: { orderId: 'ord_9' }, orderSnapshot: snap,
        createdAt: new Date().toISOString(), readBy: [] };
}
function renderMsgsAs(uid, msgs) {
    skh.currentUser.uid = uid;
    skh.negoCurrent = null; skh.negoOrder = null;
    skh.chatCore = { convId: 'conv1', partnerUid: uid === 'seller1' ? 'buyer1' : 'seller1', partnerName: 'Duka', msgs: msgs, conv: {} };
    window.skhChatRenderStream();
    return $('#chatMessages');
}
{
    const pendingSnap = { orderId: 'ord_9', orderNumber: 'SH77777', commerceType: 'product',
        itemsSummary: { kind: 'product', title: 'Mchele Mbeya 25kg', quantity: 2, unitPrice: 70000, amount: 140000 },
        amount: 140000, currency: 'TSh', paymentStatus: 'pending', status: 'awaiting_payment', protected: false,
        negotiationId: 'nego_1', sellerId: 'seller1', buyerId: 'buyer1' };
    const html1 = renderMsgsAs('buyer1', [orderMsg(pendingSnap)]).innerHTML;
    ok('kadi ya oda ipo', html1.includes('ch-card-order'));
    ok('bei ya makubaliano 70,000 imeonyeshwa', html1.includes('70,000'));
    ok('jumla 140,000 imeonyeshwa', html1.includes('140,000'));
    ok('beji ya kusubiri malipo', html1.includes('Inasubiri Malipo'));
    ok('bado haionyeshi imelindwa', !html1.includes('SokoPay Imelindwa'));

    const paidSnap = Object.assign({}, pendingSnap, { paymentStatus: 'paid', status: 'held', protected: true, paymentProtectedAt: '2026-09-13T11:00:00Z' });
    const html2 = renderMsgsAs('buyer1', [orderMsg(paidSnap)]).innerHTML;
    ok('kadi ya imelindwa ipo', html2.includes('ch-card-order--paid'));
    ok('beji ya SokoPay Imelindwa', html2.includes('SokoPay Imelindwa'));
    // Muuzaji naye anaona kadi ileile ya mfumo (hata bila kuwa mlipaji)
    const html3 = renderMsgsAs('seller1', [orderMsg(paidSnap)]).innerHTML;
    ok('muuzaji naye anaona SokoPay Imelindwa', html3.includes('SokoPay Imelindwa'));
}

console.log('\n[13] MALIPO YA DEMO — bei ILIYOGANDISHWA ndiyo inayolipwa, kind negotiation_order');
{
    const nego = orderNego();
    const unpaid = { id: 'ord_9', orderId: 'ord_9', negotiationId: 'nego_1', conversationId: 'conv1',
        commerceType: 'product', itemTitle: 'Mchele Mbeya 25kg', quantity: 2, unitPrice: 70000, amount: 140000,
        buyerId: 'buyer1', sellerId: 'seller1', paymentStatus: 'pending', status: 'payment_pending' };
    let captured = null;
    window.SOKOHAI_CONFIG = { DEMO_MODE: true };
    window.skhPesaPalFinishNegotiationOrder = async function (pending) { captured = pending; return { ok: true, orderId: 'ord_9', amount: 140000 }; };
    window.skhNegoListen = () => {};
    skh.currentUser.uid = 'buyer1';
    await window.skhChatPayNegoOrder(unpaid, nego);
    ok('malipo yameanza', !!captured);
    ok('kind = negotiation_order', captured && captured.kind === 'negotiation_order');
    ok('kiasi ni cha makubaliano 140,000', captured && captured.amount === 140000);
    ok('context ina orderId', captured && captured.context.orderId === 'ord_9');
    ok('context ina negotiationId', captured && captured.context.negotiationId === 'nego_1');
    ok('context ina conversationId', captured && captured.context.conversationId === 'conv1');
    // Oda ikiwa imelipwa, kitufe hakiwezi kuomba malipo tena
    const captured2 = [];
    window.skhPesaPalFinishNegotiationOrder = async function (p) { captured2.push(p); return { ok: true }; };
    window.openBuyerOrdersModal = () => { captured2.push('modal'); };
    await window.skhChatPayNegoOrder(Object.assign({}, unpaid, { paymentStatus: 'paid', status: 'held' }), nego);
    ok('oda iliyolipwa hairudii malipo (hufungua modal)', captured2[0] === 'modal');
    delete window.SOKOHAI_CONFIG;
    delete window.skhPesaPalFinishNegotiationOrder;
    delete window.openBuyerOrdersModal;
}

console.log('\n[14] REGRESSION — counter ya muuzaji ISIKWAME kwa mnunuzi (live listener stale / composite index imekosa)');
{
    // Mazingira ya bamba halisi: msikilizaji mkuu amebaki kwenye OFA v1
    // (OFFER_SENT, nasubiri muuzaji), lakini ujumbe wa mfumo una counter v2.
    const offerV1 = negoOffer('OFFER_SENT', {
        currentUnitPrice: 60000, currentTotal: 120000,
        turn: 'seller', waitingForUserId: 'seller1', currentActorId: 'seller1',
        version: 1, updatedAt: '2026-09-14T09:00:00Z'
    });
    const counterV2 = negoOffer('COUNTER_OFFER', {
        currentUnitPrice: 65000, currentTotal: 130000,
        turn: 'buyer', waitingForUserId: 'buyer1', currentActorId: 'buyer1',
        currentProposedBy: 'seller', version: 2, updatedAt: '2026-09-14T09:05:00Z'
    });
    const m1 = Object.assign(negoMsg(offerV1), { id: 'm_ofa' });
    const m2 = Object.assign(negoMsg(counterV2), { id: 'm_counter' });

    // MNUNUZI: live listener amekwama v1 — weka skh.negoCurrent KALE, kadi
    // bado lazima ionyeshe v2 kutoka ukurasa wa ujumbe.
    skh.currentUser.uid = 'buyer1';
    skh.negoCurrent = offerV1;   // stale — ndio chanzo cha bamba cha zamani
    skh.negoOrder = null;
    skh.chatCore = { convId: 'conv1', partnerUid: 'seller1', partnerName: 'Duka', msgs: [m1, m2], conv: {} };
    window.skhChatRenderStream();
    let html = $('#chatMessages').innerHTML;
    ok('bei mpya ya counter 65,000 yaonekana', html.includes('65,000'));
    ok('bango: JIBU LAKO (mnunuzi) linahitajika', html.includes('Jibu lako linahitajika'));
    ok('bango la zamani "Inasubiri muuzaji" halionekani', !html.includes('Inasubiri muuzaji'));
    ok('mnunuzi amerejeshewa vitufe vya kujibu', $$('.ch-nego-actions .ch-nego-btn').length >= 3);
    ok('global imekumeza snapshot mpya (version 2)', skh.negoCurrent.version === 2);

    // MUUZAJI: ujumbe uleule — yeye asubiri mnunuzi, asione vitufe.
    const shtml = renderMsgsAs('seller1', [m1, m2]).innerHTML;
    ok('muuzaji anaona Inasubiri mnunuzi', shtml.includes('Inasubiri mnunuzi'));
    const sLabels = $$('.ch-nego-actions .ch-nego-btn').map(b => b.textContent.trim());
    ok('muuzaji hana Kabali/Counter/Kataa', !sLabels.some(l => /kubali|counter|kataa|badili/i.test(l)));

    // Fallback ya msikilizaji: primary akirudi TUPU (composite index haipo),
    // fallback ya muda halisi inaanza BILA orderBy (single-field index pekee).
    let orderByCount = 0;
    let registrations = [];
    // [13] ilibandika stub juu ya window.skhNegoListen — rudisha halisi.
    window.skhNegoListen = REAL_NEGO_LISTEN;
    const realOnSnapshot = skh.onSnapshot, realOrderBy = skh.orderBy;
    skh.orderBy = () => { orderByCount++; return {}; };
    skh.onSnapshot = (q, cb, err) => {
        registrations.push({ q: q, cb: cb, err: err });
        if (registrations.length === 1) cb({ forEach () {} }); // primary: hakuna negotiation
        return () => {};
    };
    window.skhNegoListen('conv1');
    ok('fallback listener wa muda halisi umeanza', registrations.length >= 2);
    ok('fallback haitumii orderBy (haihitaji composite index)', orderByCount === 1);
    skh.onSnapshot = realOnSnapshot; skh.orderBy = realOrderBy;
}

console.log('\n==================================================');
console.log(`NEGO DIALOGUE DOM: ${pass} zimepita, ${fail} zimeshindwa`);
if (fail) process.exit(1);
console.log('✅ MAZUNGUMZO YA MAJADILIANO SAHIHI KWA PANDE ZOTE');

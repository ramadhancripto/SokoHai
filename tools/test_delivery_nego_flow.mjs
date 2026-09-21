/* ============================================================
 * SOKOHAI — Jaribio la mzunguko wa MAJADILIANO YA USAFIRI (jsdom).
 * Huhakiki:
 *  1. Tangazo la dereva (`drivers`) → fomu ya USAFIRI (si bidhaa),
 *     njia/nauli/chombo kujazwa kutoka tangazo, na kutuma kunafanikiwa
 *     kupitia njia ya ASILI (Cloud Functions zikiwa chini ya fnDown).
 *  2. Counter ya usafiri katika chat yenye kadi ya negotiation ya
 *     transport pamoja na kadi ya bidhaa → bado fomu ya transport.
 *  3. Counter ya huduma → fomu ya service.
 *  4. startChat() huweka muktadha unaofuata collection ya tangazo.
 * Endesha:  node tools/test_delivery_nego_flow.mjs
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

const setNegotiations = [];
const addDocs = [];

function driverDoc() {
    return {
        title: 'Magufuli Bus — Dar to Dodoma',
        driverName: 'Juma Magufuli', userId: 'driverUid1', ownerName: 'Juma Magufuli',
        price: 25000, pickupRegion: 'Dar es Salaam', destinationRegion: 'Dodoma',
        vehicleType: 'Daladala', supportedServices: ['Passenger', 'Cargo'],
        image: 'http://x/bus.png', description: 'Safari za kila siku'
    };
}

const skh = {
    db: {},
    fApp: {},
    currentUser: { uid: 'buyer1', displayName: 'Asha', email: 'a@x.co' },
    skhEscape: esc, skhJsEsc: esc,
    requireAuth: () => true,
    chatCore: null, negoCurrent: null, negoOrder: null,
    myCart: [], functionsDown: false,
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    toast: () => {},
    T: (k, f) => f,
    collection: (db, name) => ({ _col: name }),
    doc: (db, coll, id) => ({ _coll: coll, _id: id }),
    query: () => ({}), where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    onSnapshot: () => () => {}, getDocs: async () => ({ forEach() {} }),
    getDoc: async (ref) => ({ exists: true, data: () => ref && ref._coll === 'drivers' ? driverDoc() : {} }),
    setDoc: async (ref, data) => { if (ref && ref._coll === 'negotiations') setNegotiations.push(data); },
    addDoc: async (col, data) => { addDocs.push({ col: col && col._col, data }); return { id: 'newdoc_x' }; },
    updateDoc: async () => {}, deleteDoc: async () => {},
    wrapCallable: null, httpsCallable: null, getFunctions: () => ({}),
    serverTimestamp: () => ({})
};
window.skh = skh;
globalThis.alert = window.alert = () => {};
globalThis.confirm = window.confirm = () => true;
globalThis.closeModals = window.closeModals = () => {};
globalThis.renderChatStream = window.renderChatStream = () => {};
globalThis.customPrompt = window.customPrompt = () => {};

async function loadApp(rel, outName) {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
        .replace("import { skh } from './00-bootstrap.js';", 'const skh = window.skh;');
    const tmp = path.join(ROOT, 'js/app', outName);
    fs.writeFileSync(tmp, src);
    await import('file://' + tmp + '?t=' + Date.now() + Math.random());
    fs.unlinkSync(tmp);
}

await loadApp('js/app/37-negotiation.js', '_tmp_eng.mjs');
await loadApp('js/app/34-chat-core.js', '_tmp_chat.mjs');
await loadApp('js/app/38-negotiation-form.js', '_tmp_form.mjs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  \u2705 ' + n); } else { fail++; console.log('  \u274c ' + n); } };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function driverPost() {
    return Object.assign({ id: 'dr1', collectionName: 'drivers' }, driverDoc());
}

console.log('\n[1] Tangazo la DEREVA → fomu ya usafiri + kutuma (functions fnDown → native)');
{
    // Wrapper wa functions hurudisha kosa la fnDown (seva haijadeploywa).
    skh.wrapCallable = () => async () => {
        throw Object.assign(new Error('Samahani, huduma za seva ya SokoHai hazipatikani kwa sasa.'),
            { code: 'fnDown', fnDown: true, friendlyMessage: 'huduma hazipatikani' });
    };
    skh.chatCore = { convId: 'c1', partnerUid: 'driverUid1', partnerName: 'Juma', conv: {}, msgs: [] };
    await window.skhNegoFormOpen({ type: 'transport', entity: driverPost() });
    await new Promise(r => setTimeout(r, 60));
    const html = ($('#nfShell') || {}).innerHTML || '';
    ok('shell imejengwa', !!$('#nfShell'));
    ok('kichwa ni cha nauli (Jadili Nauli ya Usafiri)', html.includes('Jadili Nauli ya Usafiri'));
    ok('hakisomeki "Bei ya Bidhaa"', !html.includes('Bei ya Bidhaa'));
    ok('hati ya bei inasema "Nauli ya tangazo"', html.includes('Nauli ya tangazo'));
    ok('dokezo linataja msafirishaji', html.includes('msafirishaji'));
    ok('sehemu ya njia ipo', html.includes('Anapochukuliwa') && html.includes('Anakopelekwa'));
    ok('sehemu ya mzigo ipo', html.includes('Mzigo / Kifurushi'));
    ok('nauli ya tangazo imeonyeshwa (25,000)', html.includes('25,000'));
    ok('njia imejazwa pickupRegion', $('#nf_from') && $('#nf_from').value === 'Dar es Salaam');
    ok('njia imejazwa destinationRegion', $('#nf_to') && $('#nf_to').value === 'Dodoma');
    ok('chombo cha tangazo kimechaguliwa (Daladala)', $('#nf_vehicleType') && $('#nf_vehicleType').value === 'Daladala');

    $('#nf_packageDescription').value = 'Mfuko wa mahindi 2';
    $('#nf_packageCount').value = '1';
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    $('#nf_pickupDate').value = todayStr;
    $('#nf_deliveryDeadline').value = tomorrowStr;
    $('#nf_fee').value = '23000';
    $('#nfSendBtn').click();
    await new Promise(r => setTimeout(r, 200));
    var banner = $('#nfBanner');
    ok('hakuna bango la kosa', !banner || banner.style.display === 'none' || !banner.textContent.trim());
    ok('negotiation imeundwa kwa njia ya asili', setNegotiations.length === 1);
    const n = setNegotiations[0] || {};
    ok('commerceType = transport', n.commerceType === 'transport');
    ok('sellerId = userId wa dereva', n.sellerId === 'driverUid1');
    ok('transportCollection = drivers', n.transportCollection === 'drivers');
    ok('transportId = dr1', n.transportId === 'dr1');
    ok('currentUnitPrice = 23000 (nauli)', n.currentUnitPrice === 23000);
    ok('currentTotal = 23000 (si idadi × bei)', n.currentTotal === 23000);
    ok('route sahihi', n.route && n.route.from === 'Dar es Salaam' && n.route.to === 'Dodoma');
    ok('vehicleType imehifadhiwa', n.vehicleType === 'Daladala');
    if ($('#nfShell')) window.skhNegoFormClose();
}

console.log('\n[2] Counter ya usafiri: chat yenye negotiation ya transport + kadi ya bidhaa');
{
    setNegotiations.length = 0;
    const nego = {
        negotiationId: 'nego_x1', commerceType: 'transport', conversationId: 'c2',
        transportId: 'dr9', transportCollection: 'drivers', transportTitle: 'Magufuli Bus',
        productId: 'dr9', productCollection: 'drivers',
        sellerId: 'driverUid2', sellerName: 'Juma', buyerId: 'buyer1', buyerName: 'Asha',
        currentState: 'COUNTER_OFFER', turn: 'buyer',
        quantity: 1, currentUnitPrice: 23000, originalUnitPrice: 25000, currentTotal: 23000,
        route: { from: 'Dar', to: 'Dodoma' }, packageDescription: 'Mahindi', history: []
    };
    skh.chatCore = {
        convId: 'c2', partnerUid: 'driverUid2', partnerName: 'Juma', conv: {},
        msgs: [
            { id: 'mm1', senderId: 'system', system: true, type: 'product', productRef: { id: 'p9', collection: 'products' }, productSnapshot: { title: 'Mahindi', price: 1000, userId: 'sellerZ' } },
            { id: 'mm2', senderId: 'system', system: true, type: 'negotiation', negotiationId: 'nego_x1', negotiationSnapshot: nego }
        ]
    };
    skh.activeChatProduct = { id: 'p9', collectionName: 'products', title: 'Mahindi', price: 1000, userId: 'sellerZ' };
    skh.activeChatTransport = null;
    await window.skhNegoFormOpen({});
    await new Promise(r => setTimeout(r, 60));
    const html = ($('#nfShell') || {}).innerHTML || '';
    ok('fomu ya counter ni ya USAFIRI', html.includes('Jadili Nauli ya Usafiri'));
    ok('haionyeshi fomu ya bidhaa', !html.includes('Bei unayopendekeza kwa kipande'));
    ok('muktadha ni tangazo la usafiri', html.includes('Magufuli Bus'));
    if ($('#nfShell')) window.skhNegoFormClose();
}

console.log('\n[3] Counter ya huduma: negotiation card ya service');
{
    const nego = {
        negotiationId: 'nego_s1', commerceType: 'service', conversationId: 'c3',
        serviceId: 'sv1', serviceCollection: 'services', serviceTitle: 'Ufundi wa TV',
        productId: 'sv1', productCollection: 'services',
        sellerId: 'prov1', sellerName: 'Fundi K', buyerId: 'buyer1', buyerName: 'Asha',
        currentState: 'COUNTER_OFFER', turn: 'buyer',
        quantity: 1, currentUnitPrice: 30000, originalUnitPrice: 35000, currentTotal: 30000,
        scope: 'Kurekebisha TV', history: []
    };
    skh.chatCore = { convId: 'c3', partnerUid: 'prov1', partnerName: 'Fundi K', conv: {}, msgs: [
        { id: 'm1', senderId: 'system', system: true, type: 'negotiation', negotiationId: 'nego_s1', negotiationSnapshot: nego }
    ] };
    skh.activeChatProduct = null; skh.activeChatTransport = null;
    await window.skhNegoFormOpen({});
    await new Promise(r => setTimeout(r, 60));
    const html = ($('#nfShell') || {}).innerHTML || '';
    ok('fomu ya counter ni ya HUDUMA', html.includes('Jadili Ofa ya Huduma'));
    ok('ina sehemu ya scope', html.includes('Maelezo ya kazi'));
    ok('muktadha ni huduma husika', html.includes('Ufundi wa TV'));
    if ($('#nfShell')) window.skhNegoFormClose();
}

console.log('\n[4] startChat() kutoka tangazo la dereva → activeChatTransport (si activeChatProduct)');
{
    skh.currentOpenProduct = Object.assign(driverPost(), { userEmail: 'juma@x.co' });
    skh.chatCore = null;
    window.startChat();
    ok('activeChatTransport kimewekwa', !!(skh.activeChatTransport && skh.activeChatTransport.id === 'dr1'));
    ok('activeChatProduct ni tupu', skh.activeChatProduct == null);
    const guessed = await window.skhNegoFormOpen({}).then(() => 1).catch(() => 1);
    await new Promise(r => setTimeout(r, 60));
    const html = ($('#nfShell') || {}).innerHTML || '';
    ok('fomu inayofunguliwa ni ya USAFIRI', html.includes('Jadili Nauli ya Usafiri'));
    if ($('#nfShell')) window.skhNegoFormClose();
}

console.log('\nMATOKEO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

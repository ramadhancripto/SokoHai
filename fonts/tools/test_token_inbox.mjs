/* ============================================================
 * SOKOHAI — Jaribio la DOM: TOKEN BOX + AGENT REQUEST INBOX
 * Huhakiki modali mpya zinajenga kadi/vitufe kwa usahihi
 * (routing card, kadi za tokeni/DL mint, NEW REQUEST cards,
 * Accept/Decline/View, tab za historia) kwa JSDOM na data
 * bandia — bila Firebase.
 * Endesha:  node tools/test_token_inbox.mjs
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const ME = 'mteja1';
const DRIVER = 'dereva1';

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name); }
}

/* ------------------ mazingira ya kawaida ------------------ */

function makeDom() {
    const frag = fs.readFileSync(path.join(ROOT, 'html/20-modal-rating.html'), 'utf8');
    const dom = new JSDOM('<!doctype html><html><body>' + frag + '</body></html>', { runScripts: undefined });
    const win = dom.window;
    globalThis.window = win;
    globalThis.document = win.document;
    globalThis.navigator = win.navigator;
    globalThis.confirm = () => true;
    win.skhNavIcon = (name, size) => '<svg data-ic="' + name + '" width="' + (size || 14) + '"></svg>';
    win.sokohaiToast = () => {};
    win.closeModals = () => {};
    return dom;
}

function evalModule(rel) {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src = src.replace(/^import[^\n]*\n/gm, '');
    (0, eval)(src);
}

function snap(docs) {
    return { forEach: cb => docs.forEach((d, i) => cb({ id: d.id || ('doc' + i), data: () => d })) };
}

/* ============================================================
 * TOKEN BOX
 * ============================================================ */
console.log('\n[1] TOKEN BOX — kusanya na kuzalisha kadi');

{

    const dom = makeDom(); const win = dom.window;
    const ridesA = [
        { // A: bado inatafuta mawakala
            id: 'rideA', customerId: ME, status: 'searching', routingStatus: 'routing',
            assignmentStatus: 'seeking', offersCount: 3, cargoName: 'Mchele mifuko',
            fromLocation: 'Tabora', toLocation: 'Pangale', fare: 150000, pickupDate: '2026-09-20'
        },
        { // B: njiani, PK hai, DL bado haijatolewa (mint card)
            id: 'rideB', customerId: ME, status: 'in_transit', cargoName: 'Pikipiki',
            fromLocation: 'Dar', toLocation: 'Dodoma', fare: 90000,
            pickupTokenStatus: 'pending', pickupTokenExpiresAt: new Date(Date.now() + 3600000).toISOString()
        }
    ];
    const ridesC = [
        { // C: nimekubali kama dereva
            id: 'rideC', driverId: ME, customerId: 'mwingine', status: 'accepted',
            cargoName: 'Sofa', fromLocation: 'Mwanza', toLocation: 'Tabora',
            pickupTokenStatus: 'pending', pickupTokenExpiresAt: new Date(Date.now() + 3600000).toISOString()
        }
    ];

    const skh = {
        currentUser: { uid: ME },
        db: {},
        skhEscape: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        collection: (db, name) => ({ name }),
        query: (...a) => a[0],
        where: () => ({}), limit: () => ({}),
        getDocs: async (q) => {
            if (q.name === 'orders') return snap([]);
            callNo += 1;
            if (callNo === 1) return snap(ridesA);
            if (callNo === 2) return snap(ridesC);
            return snap([]);
        },
        getDoc: async () => ({ exists: false })
    };
    let callNo = 0;
    globalThis.skh = skh;
    win.skhCustodyReadToken = async (rideId, kind) => {
        if (rideId === 'rideB' && kind === 'pickup') return 'PK-BBBBBBBB';
        if (rideId === 'rideC' && kind === 'pickup') return 'PK-CCCCCCCC';
        return null;
    };
    win.spMakeQRDataUrl = () => '';
    win.skhCustodyStatusLabel = s => 'Hali: ' + s;

    evalModule('js/app/40-token-box.js');

    await win.skhOpenTokenBox('active');
    await new Promise(r => setTimeout(r, 30));
    const list = document.getElementById('tbList');
    const html = list.innerHTML;
    ok('kadi ya ombi linalotafuta imejengwa', html.includes('Linatafuta msafirishaji') && html.includes('Mchele mifuko'));
    ok('idadi ya mawakala inaonekana', html.includes('Mawakala waliochaguliwa: 3'));
    ok('kadi ya PK hai ina code', html.includes('PK-BBBBBBBB'));
    ok('kadi ya PK niliyopokea kama dereva imo', html.includes('PK-CCCCCCCC') && html.includes('Msafirishaji mkuu'));
    ok('kitufe cha kutoa DL (mint) kipo', html.includes('skhTokenBoxMintDL') && html.includes('Tengeneza Tokeni ya Mwisho'));
    ok('hakuna emoji za kadi', !/[☀-➿🚚-🛺🗑👍✅⭐📦🔑📍📅💰🔒]/u.test(html));

    // DL mint action
    let mintCalled = false;
    win.skhCustodyMintTransferToken = async () => { mintCalled = true; return { ok: true }; };
    await win.skhTokenBoxMintDL('rideB');
    ok('kitufe cha DL hupiga skhCustodyMintTransferToken', mintCalled);

    // Tab ya historia (used/expired) — bado haina tokeni zilizotumika
    document.querySelector('[data-tb-tab="used"]').click();
    await new Promise(r => setTimeout(r, 10));
    ok('tab used ina hali tupu inayofaa', document.getElementById('tbList').innerHTML.includes('Hamna mikodi') || document.getElementById('tbList').innerHTML.includes('kundi hili'));
}

/* ============================================================
 * REQUEST INBOX
 * ============================================================ */
console.log('\n[2] REQUEST INBOX — kadi za NEW REQUEST na vitendo');

{

    const dom = makeDom(); const win = dom.window;
    const now = Date.now();
    const offers = [
        { id: 'rideX_a0', rideId: 'rideX', orderId: 'ord1', customerId: 'c1', agentId: ME,
          agentName: 'Dereva Bora', status: 'offered', rank: 0, round: 1, exact: true,
          cargoName: 'Magunia ya mahindi', cargoDescription: 'Magunia 20', fromLocation: 'Tabora',
          toLocation: 'Pangale', pickupDate: '2026-09-21', pickupTime: '08:00',
          vehicleType: 'Lori', fare: 200000, weight: 1200, requirements: 'Tumia turubai',
          offeredAt: new Date(now).toISOString(), expiresAt: new Date(now + 1800000).toISOString(),
          participants: ['c1', ME] },
        { id: 'rideX_a1', rideId: 'rideX', orderId: 'ord1', customerId: 'c1', agentId: ME,
          status: 'waiting', rank: 1, cargoName: 'Magunia ya mahindi',
          fromLocation: 'Tabora', toLocation: 'Pangale', fare: 200000, participants: ['c1', ME] },
        { id: 'rideOld_a0', rideId: 'rideOld', orderId: 'ord2', customerId: 'c9', agentId: ME,
          status: 'accepted', rank: 0, cargoName: 'Mbuzi 5', fromLocation: 'Shinyanga',
          toLocation: 'Mwanza', fare: 45000, participants: ['c9', ME] }
    ];

    let acceptedWith = null, declinedWith = null, tokensOpened = false, swept = false;
    const skh = {
        currentUser: { uid: ME },
        db: {},
        skhEscape: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        collection: () => ({ name: 'delivery_offers' }),
        query: (...a) => a[0],
        where: () => ({}), limit: () => ({}),
        onSnapshot: (q, cb) => { cb(snap(offers)); return () => {}; }
    };
    globalThis.skh = skh;
    win.skhRoutingServerSweep = async () => { swept = true; return { data: { ok: true } }; };
    win.skhRoutingServerOfferAccept = async p => { acceptedWith = p; return { data: { ok: true } }; };
    win.skhRoutingServerOfferDecline = async p => { declinedWith = p; return { data: { ok: true } }; };
    win.skhOpenTokenBox = () => { tokensOpened = true; };

    evalModule('js/app/41-request-inbox.js');

    win.skhOpenRequestInbox('new');
    await new Promise(r => setTimeout(r, 30));
    ok('sweep ya muda-kuisha inapigwa wakati wa kufungua', swept);
    let html = document.getElementById('riList').innerHTML;
    ok('OMBI JIPYA card ina mzigo/njia/fee', html.includes('OMBI JIPYA') && html.includes('Magunia ya mahindi')
        && html.includes('Tabora') && html.includes('Pangale') && html.includes('200,000'));
    ok('tarehe ya pickup inaoneshwa', (html.includes('Sep') && html.includes('21')) || html.includes('2026-09-21'));
    ok('vitufe Angalia/Kataa/Kubali vipo', html.includes('Angalia Ombi') && html.includes('Kataa') && html.includes('Kubali'));
    ok('beji ya route inayolingana ipo', html.includes('route inayolingana'));
    ok('waiting anaelezwa kusubiri zamu', html.includes('WASUBIRIA ZAMU'));
    ok('accepted haipo kwenye tab ya mapya', !html.includes('Mbuzi 5'));

    // View Request inafungua maelezo
    document.getElementById('riDetail_rideX_a0').hidden = true;
    win.skhRequestInboxToggle('rideX_a0');
    ok('View Request inafungua maelezo (mzigo/maagizo)',
        document.getElementById('riDetail_rideX_a0').hidden === false
        && document.getElementById('riDetail_rideX_a0').innerHTML.includes('Tumia turubai'));

    // Accept
    win.skhRequestInboxAccept('rideX_a0');
    await new Promise(r => setTimeout(r, 30));
    ok('Accept hupiga server callable na offerId sahihi', !!(acceptedWith && acceptedWith.offerId === 'rideX_a0'));
    ok('baada ya accept Token Box inafunguliwa', tokensOpened);

    // Decline (confirm imerudisha true)
    win.skhRequestInboxDecline('rideX_a0');
    await new Promise(r => setTimeout(r, 30));
    // (kadi bado inafunguliwa kwa snapshot bandia — thibitisha tu wito ulitoka)
    ok('Decline hupiga server callable na offerId sahihi', !!(declinedWith && declinedWith.offerId === 'rideX_a0'));

    // Historia
    document.querySelector('[data-ri-tab="history"]').click();
    html = document.getElementById('riList').innerHTML;
    ok('historia ina ombi nililokubali', html.includes('Mbuzi 5') && html.includes('UMEKUBALI'));
    ok('kadi ya accepted ina kitufe cha Token Box', html.includes('Fungua Token Box'));
    ok('historia haina OMBI JIPYA hai', !html.includes('OMBI JIPYA'));
}

/* ============================================================
 * HALI TUPU
 * ============================================================ */
console.log('\n[3] Hali tupu na mtumiaji bila ofa/tokeni');
{

    const dom = makeDom(); const win = dom.window;
    const skh = {
        currentUser: { uid: 'mpya' }, db: {},
        skhEscape: s => String(s == null ? '' : s),
        collection: () => ({ name: 'x' }), query: a => a,
        where: () => ({}), limit: () => ({}),
        getDocs: async () => snap([]),
        getDoc: async () => ({ exists: false }),
        onSnapshot: (q, cb) => { cb(snap([])); return () => {}; }
    };
    globalThis.skh = skh;
    evalModule('js/app/40-token-box.js');
    evalModule('js/app/41-request-inbox.js');
    await win.skhOpenTokenBox('active');
    await new Promise(r => setTimeout(r, 20));
    ok('token box tupu ina ujumbe unaofaa', document.getElementById('tbList').innerHTML.includes('Hamna mikodi'));
    win.skhOpenRequestInbox('new');
    await new Promise(r => setTimeout(r, 20));
    ok('inbox tupu ina ujumbe unaofaa', document.getElementById('riList').innerHTML.includes('Hamna maombi'));
}

console.log('\n========================================');
console.log('TOKEN BOX + INBOX DOM: ' + pass + ' pass, ' + fail + ' fail');
console.log('========================================');
process.exit(fail ? 1 : 0);

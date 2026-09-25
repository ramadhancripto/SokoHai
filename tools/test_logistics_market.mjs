/* ============================================================
 * test_logistics_market.mjs
 * Jaribio la DOM kwa SOKO LA MAOMBI YA USAFIRISHAJI (20-logistics):
 *  - kadi mpya (njia, mzigo, nauli, kitufe cha kukubali)
 *  - hesabu za vichupo + chujio cha aina ya chombo
 *  - vichupo huchuja papo hapo kutoka kache (hakuna mtandao mpya)
 *  - hali tupu na mifupa ya upakiaji
 * ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log('  ✅', name); }
    else { fail++; console.log('  ❌', name); }
}

function makeDom() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    const win = dom.window;
    globalThis.window = win; globalThis.document = win.document; Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
    return dom;
}
function snap(docs) {
    return { forEach: cb => docs.forEach((d, i) => cb({ id: d._id || ('doc' + i), data: () => d })) };
}
function evalModule(rel) {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src = src.replace(/^import[^\n]*\n/gm, '');
    (0, eval)(src);
}

console.log('\n[1] Soko la maombi — kadi, hesabu, chujio');
{
    const dom = makeDom(); const win = dom.window;
    const now = Date.now();
    const iso = new Date(now - 5 * 60000).toISOString();
    const requests = [
        { _id: 'r1', status: 'searching', reqCategory: 'Cargo', vehicleType: 'Lori',
          cargoName: 'Magunia ya mahindi', customerName: 'Asha', fromLocation: 'Dodoma',
          toLocation: 'Tabora', fare: 300000, cargoWeight: 800, pickupDate: '2026-09-20',
          pickupTime: '09:00', isFragile: false, createdAt: iso },
        { _id: 'r2', status: 'pending_acceptance', reqCategory: 'Cargo', vehicleType: 'Lori',
          cargoName: 'Mkaa magunia 40', customerName: 'Juma', fromLocation: 'Mbeya',
          toLocation: 'Iringa', isFragile: true, createdAt: new Date(now - 60 * 60000).toISOString() },
        { _id: 'r3', status: 'searching', reqCategory: 'Passengers', vehicleType: 'Bodaboda',
          cargoName: 'Abiria 1', customerName: 'Musa', passengerCount: 1,
          fromLocation: 'Kariakoo', toLocation: 'Mbagala', fare: 2500,
          createdAt: new Date(now - 2 * 3600000).toISOString() },
        { _id: 'r4', status: 'completed', reqCategory: 'Cargo', vehicleType: 'Lori',
          cargoName: 'Hii haipaswi kuonekana', customerName: 'X', fromLocation: 'A', toLocation: 'B',
          createdAt: iso },
        { _id: 'r5', status: 'searching', reqCategory: 'Cargo', vehicleType: 'Bodaboda',
          cargoName: 'Mzigo wa chombo kingine', customerName: 'Y', fromLocation: 'C', toLocation: 'D',
          createdAt: iso },
        { _id: 'r6', status: 'searching', reqCategory: 'Livestock', vehicleType: 'Lori',
          cargoName: 'Mbuzi 12', customerName: 'Hamisi', animalType: 'Mbuzi', animalCount: 12,
          fromLocation: 'Shinyanga', toLocation: 'Mwanza', createdAt: iso }
    ];

    let snapshotCalls = 0;
    const skh = {
        currentUser: { uid: 'd1' },
        currentUserData: { vehicleType: 'Lori' },
        db: {},
        skhEscape: s => String(s == null ? '' : s),
        collection: () => ({ name: 'ride_requests' }),
        query: (...a) => a[0],
        where: () => ({}),
        limit: () => ({}),
        onSnapshot: (q, cb) => { cb(snap(requests)); return () => {}; }
    };
    globalThis.skh = skh;
    win.skh = skh;
    win.skhNavIcon = n => '<svg data-ic="' + n + '"></svg>';
    win.skhOpenRequestInbox = () => {};
    win.skhOnSnapshot = (key, q, cb) => { snapshotCalls++; cb(snap(requests)); return () => {}; };

    document.body.innerHTML =
        '<div id="liveBookingsList"></div>'
        + '<span id="lmN_all_types"></span><span id="lmN_Cargo"></span>'
        + '<span id="lmN_Passengers"></span><span id="lmN_Livestock"></span>'
        + '<span id="lmTotalCount"></span>'
        + '<div id="lmTabs">'
        + '<button class="lm-tab active" id="tabAll"></button>'
        + '<button class="lm-tab" id="tabCargo"></button>'
        + '<button class="lm-tab" id="tabPass"></button>'
        + '<button class="lm-tab" id="tabLive"></button>'
        + '</div>';

    evalModule('js/app/20-logistics.js');

    win.loadMarketplaceRequests('all_types');
    await new Promise(r => setTimeout(r, 10));

    const list = document.getElementById('liveBookingsList');
    let html = list.innerHTML;

    ok('msikilizaji mmoja tu wa soko umeanzishwa', snapshotCalls === 1);
    ok('ombi completed halionekani sokoni', !html.includes('Hii haipaswi kuonekana'));
    ok('ombi la chombo kingini halionekani (Lori pekee)', !html.includes('Mzigo wa chombo kingine'));
    ok('kadi 3 zinaonekana (mizigo 2 + mifugo 1 ya Lori)', list.querySelectorAll('.lm-card').length === 3);
    ok('jina la mzigo lipo', html.includes('Magunia ya mahindi'));
    ok('sehemu ya kuchukua ipo', html.includes('Dodoma'));
    ok('sehemu ya kupeleka ipo', html.includes('Tabora'));
    ok('nauli iliyopendekezwa inaonekana', html.includes('300,000'));
    ok('ombi bila nauli huandikwa "Maelewano"', html.includes('Maelewano'));
    ok('tarehe ya kuchukua inaonekana', html.includes('2026-09-20'));
    ok('tahadhari ya dhaifu inaonekana', html.includes('Dhaifu'));
    ok('muda jamaa unaonyeshwa', html.includes('dakika 5') || html.includes('saa 1'));
    ok('kitufe cha kukubali kipo', html.includes('Kubali Kazi Hii'));
    ok('kadi ya mifugo ina chip ya wanyama', html.includes('Mbuzi') && html.includes('12'));
    ok('hakuna HTML mbichi ya emoji pekee', !/<lm-/.test(html));

    // Hesabu za vichupo (baada ya kichujio cha chombo Lori): all=3, Cargo=2, Pass=0, Livestock=1
    ok('hesabu jumla ni 3', document.getElementById('lmN_all_types').textContent === '3');
    ok('hesabu Mizigo ni 2', document.getElementById('lmN_Cargo').textContent === '2');
    ok('hesabu Watu ni 0', document.getElementById('lmN_Passengers').textContent === '0');
    ok('hesabu Mifugo ni 1', document.getElementById('lmN_Livestock').textContent === '1');
    ok('bango la juu linaonyesha 3', document.getElementById('lmTotalCount').textContent === '3');

    // Chujio cha Cargo — lazima iwe papo hapo (msikilizizi haupigwi tena)
    win.filterMarketplace('Cargo', document.getElementById('tabCargo'));
    html = list.innerHTML;
    ok('chujio hakianzishi msikilizizi mpya', snapshotCalls === 1);
    ok('baada ya chujio kadi 2 za mizigo tu', list.querySelectorAll('.lm-card').length === 2);
    ok('mifugo haipo kwenye chujio Cargo', !html.includes('Mbuzi 12'));
    ok('kichupo kilichochaguliwa kina class active', document.getElementById('tabCargo').classList.contains('active'));
    ok('kichupo cha zamani kimeondolewa active', !document.getElementById('tabAll').classList.contains('active'));

    // Chujio tupu (Watu kwa dereva wa Lori) → hali tupu yenye njia ya inbox
    win.filterMarketplace('Passengers', document.getElementById('tabPass'));
    html = list.innerHTML;
    ok('hali tupu inaonyeshwa kwa chujio tupu', html.includes('lm-empty') && html.includes('Hamna ombi'));
    ok('hali tupu inatoa kitufe cha "Yaliyotumwa Kwako"', html.includes('Angalia Yaliyotumwa Kwako'));

    // Kurudi kazi zote
    win.filterMarketplace('all_types', document.getElementById('tabAll'));
    ok('kurudi kazi zote yarejesha kadi 3', list.querySelectorAll('.lm-card').length === 3);
}

console.log('\n[2] Mifupa ya upakiaji + dereva asiyejulikana huona soko lote');
{
    const dom = makeDom(); const win = dom.window;
    const requests = [
        { _id: 'q1', status: 'searching', reqCategory: 'Passengers', vehicleType: 'Bodaboda',
          cargoName: 'Mteja haraka', customerName: 'A', fromLocation: 'X', toLocation: 'Y',
          fare: 2000, createdAt: new Date().toISOString() }
    ];
    const skh = {
        currentUser: { uid: 'd2' },
        currentUserData: null, // profile bado haijaja
        db: {},
        skhEscape: s => String(s == null ? '' : s),
        collection: () => ({ name: 'ride_requests' }),
        query: (...a) => a[0], where: () => ({}), limit: () => ({}),
        onSnapshot: (q, cb) => { cb(snap(requests)); return () => {}; }
    };
    globalThis.skh = skh;
    win.skh = skh;
    win.skhNavIcon = n => '<svg data-ic="' + n + '"></svg>';
    win.skhOnSnapshot = (key, q, cb) => { cb(snap(requests)); return () => {}; };
    document.body.innerHTML =
        '<div id="liveBookingsList"></div>'
        + '<span id="lmN_all_types"></span><span id="lmN_Cargo"></span>'
        + '<span id="lmN_Passengers"></span><span id="lmN_Livestock"></span><span id="lmTotalCount"></span>';

    evalModule('js/app/20-logistics.js');
    // Mifupa kabla ya kupakua
    const skelHtml = win.skhMarketSkeleton ? win.skhMarketSkeleton(3) : '';
    ok('mifupa ya upakiaji inatengenezwa', skelHtml.includes('lm-skel') && (skelHtml.match(/lm-skel/g) || []).length >= 3);

    win.loadMarketplaceRequests('all_types');
    await new Promise(r => setTimeout(r, 10));
    const list = document.getElementById('liveBookingsList');
    ok('bila profile ya chombo, ombi bado laonekana (asikose kazi)', list.querySelectorAll('.lm-card').length === 1);
}

console.log('\n========================================');
if (fail) { console.log('LOGISTICS MARKET: ' + pass + ' pass, ' + fail + ' fail'); process.exit(1); }
console.log('LOGISTICS MARKET: ' + pass + ' pass, 0 fail ✅');

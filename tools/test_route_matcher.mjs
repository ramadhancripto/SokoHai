/* ============================================================
 * SOKOHAI — Jaribio la ROUTE MATCHER (usafiri)
 * Huhakiki: SokoHai akichambua magari kulingana na NJIA,
 * aina ya chombo, uwezo na huduma; kundi "vinafaa kabisa"
 * dhidi ya "mapendekezo"; magari ya nje/aliyezima hayumo.
 * Hutumia mantiki HALISI ya 27-route-dispatch.js.
 * Endesha:  node tools/test_route_matcher.mjs
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

let src = fs.readFileSync(path.join(ROOT, 'js/app/27-route-dispatch.js'), 'utf8');
src = src.replace(/^import[^\n]*\n/gm, '');

const win = {};
globalThis.window = win;
globalThis.skh = { currentUser: { uid: 'mteja1' } };
(0, eval)(src);

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name); }
}

const crit = {
    category: 'Cargo',
    vehicleType: 'Lori',
    from: 'Tabora',
    to: 'Pangale',
    cargoName: 'TV na Sofa',
    weight: 800,
    pax: 0,
    fragile: false
};

const dExact = {
    id: 'g1', userId: 'dereva1', online: true,
    vehicleType: 'Lori', maxWeight: 'Tani 5',
    pickupRegion: 'Tabora', destinationRegion: 'Pangale',
    fullRoute: 'Tabora ➔ Pangale', supportedServices: ['Cargo'],
    price: 150000, rating: 4.8, verified: true
};
const dPartial = {
    id: 'g2', userId: 'dereva2', online: true,
    vehicleType: 'Lori', maxWeight: 'Tani 3',
    pickupRegion: 'Tabora', destinationRegion: 'Mwanza',
    fullRoute: 'Tabora ➔ Mwanza', supportedServices: ['Cargo', 'Passenger'],
    price: 120000, rating: 4.2
};
const dWrongVehicle = {
    id: 'g3', userId: 'dereva3', online: true,
    vehicleType: 'Bajaji', maxWeight: '200 kg',
    pickupRegion: 'Tabora', destinationRegion: 'Pangale',
    fullRoute: 'Tabora ➔ Igunga ➔ Pangale', supportedServices: ['Passenger', 'Cargo'],
    price: 15000, rating: 4.0
};
const dOffline = Object.assign({}, dExact, { id: 'g4', userId: 'dereva4', online: false });
const dOtherRoute = {
    id: 'g5', userId: 'dereva5', online: true,
    vehicleType: 'Lori', maxWeight: 'Tani 10',
    pickupRegion: 'Dar es Salaam', destinationRegion: 'Morogoro',
    fullRoute: 'Dar ➔ Morogoro', supportedServices: ['Cargo'],
    price: 200000
};
const dSmallCap = {
    id: 'g6', userId: 'dereva6', online: true,
    vehicleType: 'Lori', maxWeight: '500 kg',
    pickupRegion: 'Tabora', destinationRegion: 'Pangale',
    fullRoute: 'Tabora ➔ Pangale', supportedServices: ['Cargo'],
    price: 100000
};

console.log('\n[1] SKH ROUTE MATCH ENDS — alama za ncha za njia');
{
    const m = win.skhRouteMatchEnds(dExact, 'Tabora', 'Pangale');
    ok('ncha zote mbili zimepatikana', m.origin === true && m.dest === true);
    const m2 = win.skhRouteMatchEnds(dPartial, 'Tabora', 'Pangale');
    ok('asili imepatikana, hatua ya mwisho hapana', m2.origin === true && m2.dest === false);
    const m3 = win.skhRouteMatchEnds(dOtherRoute, 'Tabora', 'Pangale');
    ok('njia ngeni hakuna hata ncha moja', m3.origin === false && m3.dest === false);
    // stoo ya kati kwenye fullRoute
    const m4 = win.skhRouteMatchEnds(dWrongVehicle, 'Igunga', 'Pangale');
    ok('stoo ya kati inalingana', m4.origin === true && m4.dest === true);
}

console.log('\n[2] KUPANGA MAGARI — vinafaa vs mapendekezo');
{
    const res = win.skhRouteMatcherRank(
        [dExact, dPartial, dWrongVehicle, dOffline, dOtherRoute, dSmallCap], crit);
    const ids = (arr) => arr.map(d => d.id);
    ok('gari linalofaa kabisa lipo exact', ids(res.exact).includes('g1'));
    ok('gari la njia pungufu (asili tu) liko mapendekezo', ids(res.alt).includes('g2'));
    ok('chombo tofauti kiko mapendekezo (route inafaa)', ids(res.alt).includes('g3'));
    ok('aliyezima hayumo kabisa', !ids(res.exact).includes('g4') && !ids(res.alt).includes('g4'));
    ok('njia ngeni hayumo kabisa', !ids(res.exact).includes('g5') && !ids(res.alt).includes('g5'));
    ok('uwezo mdogo wa uzita uko mapendekezo (si exact)', ids(res.alt).includes('g6') && !ids(res.exact).includes('g6'));
    // 6 waliopimwa: g4 hayupo online, g5 njia ngeni → 4 tu (bila marudio)
    ok('hajirudishwi mara mbili / asiyeohusika haorodheshwi', res.exact.length + res.alt.length === 4);
}

console.log('\n[3] MPANGILIO — alama ya juu iko mbele');
{
    const res = win.skhRouteMatcherRank([dPartial, dExact], crit);
    ok('ncha zote mbili zinatangulia ncha moja', res.exact[0] && res.exact[0].id === 'g1');
}

console.log('\n[4] UWEZO — tani zinahesabiwa kwa kg');
{
    const m5t = win.skhRouteMatcherScoreDriver(dExact, crit);
    const mSmall = win.skhRouteMatcherScoreDriver(dSmallCap, crit);
    ok('tani 5 zinatosha mzigo 800kg', m5t && m5t.capacityOk === true);
    ok('kg 500 hazitoshi mzigo 800kg', mSmall && mSmall.capacityOk === false);
    const noCap = { id: 'x', userId: 'u9', online: true, vehicleType: 'Lori',
        pickupRegion: 'Tabora', destinationRegion: 'Pangale', supportedServices: ['Cargo'] };
    const mNoCap = win.skhRouteMatcherScoreDriver(noCap, crit);
    ok('bila taarifa ya uwezo haizuiwi (anaulizwa tu)', mNoCap && mNoCap.capacityOk === true && mNoCap.exact === true);
}

console.log('\n[5] AINA ZA SAFARI — ramani ya huduma');
{
    const abiria = win.skhRouteMatcherRank([Object.assign({}, dWrongVehicle, { id: 'b1' })],
        { category: 'Passengers', vehicleType: 'Bajaji', from: 'Tabora', to: 'Pangale', weight: 0 });
    ok('Bajaji ya abiria inafanya kazi ya abiria', abiria.exact.some(d => d.id === 'b1'));
    const mifugo = win.skhRouteMatcherRank([dExact],
        { category: 'Livestock', vehicleType: 'Lori', from: 'Tabora', to: 'Pangale', weight: 2000 });
    ok('Lori la cargo linapokea mifugo (uwezo wa kutosha)', mifugo.exact.some(d => d.id === 'g1'));
}

console.log('\n[6] USALAMA — mteja haoni chombo chake mwenyewe');
{
    globalThis.skh = { currentUser: { uid: 'dereva1' } };
    const m = win.skhRouteMatcherScoreDriver(dExact, crit);
    ok('chombo cha mteja mwenyewe hakionyeshwi', m === null);
    globalThis.skh = { currentUser: { uid: 'mteja1' } };
}

/* ============================================================
 * 7) MTIRIRIKO KAMILI KWENYE DOM (utafutaji → matokeo → nego)
 * ============================================================ */
console.log('\n[7] DOM — utafutaji unafungua matokeo, kadi inaingilia nego');
{
    const dom = new JSDOM('<!doctype html><html><body>'
        + '<div id="rideRequestModal" class="overlay-menu" style="display:flex;">'
        + '<input id="rideReqCategory" value="Cargo"><input id="rideReqType" value="Lori">'
        + '<input id="rideReqFrom" value="Tabora"><input id="rideReqTo" value="Pangale">'
        + '<input id="cargoName" value="TV"><input id="cargoWeight" value="800">'
        + '<input id="ridePaxCount" value="1"><input type="checkbox" id="isFragile">'
        + '</div>'
        + '<div id="routeMatchModal" class="overlay-menu" style="display:none;">'
        + '<span id="rmHeadIcon"></span><span id="rmBroadcastIco"></span>'
        + '<button id="rmCloseBtn" aria-label="Funga"></button>'
        + '<div id="rmCrit"></div><div id="rmResults"></div><div id="rmFooter"></div>'
        + '</div></body></html>',
        { url: 'http://localhost/', runScripts: 'dangerously' });
    const w = dom.window;
    globalThis.window = w; globalThis.document = w.document; globalThis.alert = () => {};
    // maktaba ya icons halisi
    const iconsSrc = fs.readFileSync(path.join(ROOT, 'js/18-icons.js'), 'utf8');
    w.eval(iconsSrc);
    const skh2 = {
        currentUser: { uid: 'mteja1' },
        requireAuth: () => true,
        skhEscape: (s) => String(s == null ? '' : s),
        skhJsEsc: (s) => String(s == null ? '' : s),
        getOptimizedImageUrl: (u) => u || '',
        collection: () => ({}), query: () => ({}), limit: () => ({}),
        getDocs: async () => ({
            forEach(cb) {
                const docs = [
                    { id: 'g1', data: () => ({ userId: 'd1', online: true, vehicleType: 'Lori',
                        maxWeight: 'Tani 5', pickupRegion: 'Tabora', destinationRegion: 'Pangale',
                        fullRoute: 'Tabora ➔ Pangale', supportedServices: ['Cargo'],
                        title: 'Juma Logistics', driverName: 'Juma', price: 150000, image: '' }) },
                    { id: 'g2', data: () => ({ userId: 'd2', online: true, vehicleType: 'Bajaji',
                        maxWeight: '100 kg', pickupRegion: 'Tabora', destinationRegion: 'Pangale',
                        fullRoute: 'Tabora ➔ Pangale', supportedServices: ['Passenger'],
                        title: 'Boda-Boda Mjini', driverName: 'Ali', price: 8000, image: '' }) }
                ];
                docs.forEach(cb);
            }
        })
    };
    w.skh = skh2;
    globalThis.skh = skh2;
    w.eval(src.replace(/^import[^\n]*\n/gm, ''));

    let negoOpened = null;
    w.skhNegoFormOpen = (o) => { negoOpened = o; };
    let broadcastCalled = 0;
    w.broadcastRideRequest = () => { broadcastCalled++; };

    await w.skhRouteMatcherSearch();
    const modal = w.document.getElementById('routeMatchModal');
    const results = w.document.getElementById('rmResults');
    ok('modali ya matokeo imefunguliwa', modal.style.display === 'flex');
    ok('kundi "Vinafaa kabisa" linaonekana', results.innerHTML.includes('Vinafaa kabisa'));
    ok('gari linalolingana limeorodheshwa', results.innerHTML.includes('Juma Logistics'));
    ok('Bajaji kipo kwenye mapendekezo (chombo tofauti)', /Mapendekezo[\s\S]*Boda-Boda Mjini/.test(results.innerHTML));
    ok('kadi ina kitufe cha majadiliano', results.innerHTML.includes('Jadili nafasi na bei'));
    ok('hakuna emoji kwenye matokeo', !/[\u{1F000}-\u{1FAFF}]/u.test(results.innerHTML));
    ok('vigezo vimeandikwa juu', w.document.getElementById('rmCrit').textContent.includes('Tabora'));

    // Chagua gari → nego form
    w.skhRouteMatcherChoose('g1');
    ok('skhNegoFormOpen imeitwa', !!negoOpened);
    ok('aina ya nego ni transport', negoOpened && negoOpened.type === 'transport');
    ok('entity ina route ya mteja', negoOpened && negoOpened.entity.route
        && negoOpened.entity.route.from === 'Tabora' && negoOpened.entity.route.to === 'Pangale');
    ok('entity ina muuzaji sahihi (drivers doc)', negoOpened && negoOpened.entity.sellerId === 'd1'
        && negoOpened.entity.collectionName === 'drivers');

    // Njia ya pili: broadcast bado inafanya kazi
    w.skhRouteMatcherBroadcast();
    ok('broadcast wa zamani unapatikana kama njia ya pili', broadcastCalled === 1);
}

console.log('\n==================================================');
console.log('ROUTE MATCHER: ' + pass + ' zimepita, ' + fail + ' zimeshindwa');
if (fail > 0) process.exit(1);
console.log('✅ UCHAMBUZI WA MAGARI KWA NJIA NI SAHIHI');

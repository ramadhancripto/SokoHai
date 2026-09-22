/* ============================================================
 * SOKOHAI — Jaribio la REQUEST ROUTING ENGINE (2026-09)
 * Huhakiki:
 *   1) Kuchambua wagombeaji (route ends, chombo, huduma,
 *      uwezo tani→kg, online, mwombaji mwenyewe, rating/bei)
 *      na safu ya pili ya mawakala.
 *   2) State machine ya ofa: offered → waiting → decline/expire
 *      → mwingine afunguliwe; wote wakiisha → failed_assignment;
 *      accept atomiki (wengine cancelled, race imenyimwa).
 * Mantiki HALISI: functions/routing-logic.js (server-side).
 * Endesha:  node tools/test_routing.mjs
 * ============================================================ */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../functions/routing-logic.js');
const core = require('../functions/routing-core.js');

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name); }
}
function throws(name, fn, codePart) {
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    const good = threw && (!codePart || String(threw.message).includes(codePart));
    ok(name + (threw ? '' : ' (hakuna kosa)'), !!good);
}

const req = {
    from: 'Tabora', to: 'Pangale', category: 'Cargo',
    vehicleType: 'Lori', weight: 800, excludeUid: 'mteja1'
};

function driver(over) {
    return Object.assign({
        uid: 'd1', kind: 'driver', online: true, vehicleType: 'Lori',
        pickupRegion: 'Tabora', destinationRegion: 'Pangale',
        fullRoute: 'Tabora → Igunga → Pangale',
        supportedServices: ['cargo'], maxWeight: '2 tani',
        rating: 4.5, price: 120000, verified: true
    }, over || {});
}

console.log('\n[A] MATCHING — madereva');

const m1 = L.scoreCandidate(driver(), req);
ok('route kamili + chombo/uwezo → exact', m1 && m1.exact === true);
ok('routeScore 2 (ncha zote)', m1.routeScore === 2);

const mOneEnd = L.scoreCandidate(driver({
    uid: 'd2', destinationRegion: 'Mwanza', fullRoute: 'Tabora → Mwanza'
}), req);
ok('ncha moja tu → si exact (pendekezo)', mOneEnd && mOneEnd.exact === false && mOneEnd.routeScore === 1);

const mWrongVehicle = L.scoreCandidate(driver({
    uid: 'd3', vehicleType: 'Bajaji', maxWeight: '100 kg'
}), req);
ok('chombo tofauti → si exact', mWrongVehicle && mWrongVehicle.exact === false && mWrongVehicle.vehicleOk === false);

const mLowCap = L.scoreCandidate(driver({
    uid: 'd4', maxWeight: '500 kg'
}), req);
ok('uwezo duni (500<800 kg) → capacityOk false', mLowCap.capacityOk === false && mLowCap.exact === false);

ok('tani 2 zinahesabiwa kama 2000 kg', L.capacityKg({ maxWeight: '2 tani' }) === 2000);
ok('kg hubaki kg', L.capacityKg({ capacity: '750kg' }) === 750);

ok('aliyezima (online=false) ametengwa', L.scoreCandidate(driver({ online: false }), req) === null);
ok('mwombaji mwenyewe ametengwa', L.scoreCandidate(driver({ uid: 'mteja1' }), req) === null);
ok('asiyepitia route ametengwa', L.scoreCandidate(driver({
    uid: 'dx', pickupRegion: 'Mbeya', destinationRegion: 'Songwe', fullRoute: 'Mbeya → Songwe'
}), req) === null);

// Abiria → huduma ya passenger
const reqPax = { from: 'Tabora', to: 'Pangale', category: 'Passengers', vehicleType: 'Bajaji', weight: 0 };
const mPax = L.scoreCandidate({
    uid: 'p1', kind: 'driver', online: true, vehicleType: 'Bajaji',
    pickupRegion: 'Tabora', destinationRegion: 'Pangale', fullRoute: 'Tabora → Pangale',
    supportedServices: ['passenger'], rating: 4
}, reqPax);
ok('abiria + chombo cha abiria → exact', mPax && mPax.exact === true);
ok('mizigo haifai kwa chombo cha abiria tu', (() => {
    const m = L.scoreCandidate({
        uid: 'p2', kind: 'driver', online: true, vehicleType: 'Bajaji',
        pickupRegion: 'Tabora', destinationRegion: 'Pangale',
        fullRoute: 'Tabora → Pangale', supportedServices: ['passenger']
    }, req);
    return m && m.serviceOk === false;
})());

console.log('\n[B] RANK — mpangilio na mawakala');

{
    const best = driver({ uid: 'best', rating: 5, price: 100000 });
    const mid = driver({ uid: 'mid2', rating: 4, price: 150000 });
    const oneEnd = driver({ uid: 'alt1', destinationRegion: 'Mwanza', fullRoute: 'Tabora → Mwanza' });
    const ranked = L.rankCandidates([oneEnd, mid, best], req);
    ok('exact wawili mbele', ranked.exact.length === 2);
    ok('aliye alama juu/bei nafuu atangulia', ranked.exact[0].uid === 'best');
    ok('ncha moja yuko mapendekezo', ranked.alt.length === 1 && ranked.alt[0].uid === 'alt1');
    ok('chaguo kina max 5', ranked.chosen.length === 3);
}

{
    // Hakuna dereva → mawakala wa eneo wachukue nafasi
    const agents = [
        { uid: 'ag1', kind: 'agent', status: 'approved', location: 'Tabora Mjini', rating: 4 },
        { uid: 'ag2', kind: 'agent', status: 'approved', location: 'Mbeya', rating: 4 },
        { uid: 'ag3', kind: 'agent', status: 'pending', location: 'Tabora', rating: 5 }
    ];
    const ranked = L.rankCandidates(agents, req);
    ok('wakala wa eneo amechaguliwa', ranked.chosen.some(c => c.uid === 'ag1'));
    ok('wakala wa mkoa mwingine ametengwa', !ranked.chosen.some(c => c.uid === 'ag2'));
    ok('wakala asiyeidhinishwa ametengwa', !ranked.chosen.some(c => c.uid === 'ag3'));
}

{
    // Dereva akipatikana, wakala haingii kwenye chaguo (safu ya pili)
    const ranked = L.rankCandidates([
        driver({ uid: 'd1' }),
        { uid: 'ag1', kind: 'agent', status: 'approved', location: 'Tabora' }
    ], req);
    ok('deregva akipatikana wakala hachaguliwi', ranked.chosen.length === 1 && ranked.chosen[0].uid === 'd1');
}

console.log('\n[C] STATE MACHINE — decline / expiry / reassignment');

function mkOffers(now, r0ExpiresInMs) {
    return [
        { id: 'r0', agentId: 'a0', rank: 0, status: L.OFFER.OFFERED, expiresAt: new Date(now + r0ExpiresInMs).toISOString() },
        { id: 'r1', agentId: 'a1', rank: 1, status: L.OFFER.WAITING, expiresAt: null },
        { id: 'r2', agentId: 'a2', rank: 2, status: L.OFFER.WAITING, expiresAt: null }
    ];
}
const T0 = Date.UTC(2026, 8, 14, 9, 0, 0);

{
    const offers = mkOffers(T0, 30 * 60000);
    let tr = L.transitionOffers(offers, { type: 'sweep' }, T0 + 60000);
    ok('sweep kabla ya kuisha: hakuna mabadiliko', Object.keys(tr.updates).length === 0);

    tr = L.transitionOffers(offers, { type: 'decline', offerId: 'r0', agentId: 'a0' }, T0 + 120000);
    ok('a0 amekataa → declined', tr.updates.r0 && tr.updates.r0.status === L.OFFER.DECLINED);
    ok('a1 amefunguliwa (offered)', tr.updates.r1 && tr.updates.r1.status === L.OFFER.OFFERED && !!tr.updates.r1.expiresAt);
    ok('a1 anarifiwa', tr.notify.length === 1 && tr.notify[0] === 'a1');
    ok('bado kuna wakala: hakuna failed', tr.ridePatch === null);

    // tumia mabadiliko kwa raundi inayofuata
    offers[0].status = L.OFFER.DECLINED;
    offers[1] = Object.assign({}, offers[1], tr.updates.r1);
    tr = L.transitionOffers(offers, { type: 'decline', offerId: 'r1', agentId: 'a1' }, T0 + 180000);
    ok('a1 akikataa → a2 afunguliwe', tr.updates.r2 && tr.updates.r2.status === L.OFFER.OFFERED);
    offers[1].status = L.OFFER.DECLINED;
    offers[2] = Object.assign({}, offers[2], tr.updates.r2);
    tr = L.transitionOffers(offers, { type: 'decline', offerId: 'r2', agentId: 'a2' }, T0 + 240000);
    ok('wote wamekataa → failed_assignment', tr.ridePatch && tr.ridePatch.assignmentStatus === 'failed_assignment');
    ok('roundFailed inatambua', (() => {
        const final = [
            { status: L.OFFER.DECLINED }, { status: L.OFFER.DECLINED },
            Object.assign({ status: L.OFFER.DECLINED }, tr.updates.r2 ? { status: L.OFFER.DECLINED } : {})
        ];
        return L.roundFailed(final);
    })());
}

console.log('\n[D] STATE MACHINE — muda kuisha (lazy sweep)');
{
    const offers = mkOffers(T0, 30 * 60000);
    // r0 alikuwa ajibu, muda waisha
    let tr = L.transitionOffers(offers, { type: 'sweep' }, T0 + 31 * 60000);
    ok('r0 ameisha muda → expired', tr.updates.r0 && tr.updates.r0.status === L.OFFER.EXPIRED);
    ok('r1 amefunguliwa baada ya kuisha', tr.updates.r1 && tr.updates.r1.status === L.OFFER.OFFERED);

    offers[0].status = L.OFFER.EXPIRED;
    offers[1] = Object.assign({}, offers[1], tr.updates.r1);
    const r1Expiry = Date.parse(offers[1].expiresAt);
    tr = L.transitionOffers(offers, { type: 'sweep' }, r1Expiry + 60000);
    offers[1].status = L.OFFER.EXPIRED;
    offers[2] = tr.updates.r2 ? Object.assign({}, offers[2], tr.updates.r2) : offers[2];
    const r2Expiry = offers[2].expiresAt ? Date.parse(offers[2].expiresAt) : r1Expiry + 1;
    tr = L.transitionOffers(offers, { type: 'sweep' }, r2Expiry + 60000);
    ok('wote wakiisha → failed_assignment', tr.ridePatch && tr.ridePatch.assignmentStatus === 'failed_assignment');
}

console.log('\n[E] STATE MACHINE — accept (atomiki + mbio)');
{
    const offers = mkOffers(T0, 30 * 60000);
    let tr = L.transitionOffers(offers, { type: 'accept', offerId: 'r0', agentId: 'a0' }, T0 + 60000);
    ok('a0 amekubali → accepted', tr.updates.r0 && tr.updates.r0.status === L.OFFER.ACCEPTED);
    ok('wengine wameghairiwa', tr.updates.r1.status === L.OFFER.CANCELLED && tr.updates.r2.status === L.OFFER.CANCELLED);
    ok('ride imegawiwa', tr.ridePatch && tr.ridePatch.assignmentStatus === 'assigned' && tr.ridePatch.assignedAgentId === 'a0');
    ok('accepted anaripotiwa', tr.accepted === 'a0');

    // waiting hawezi kukubali
    throws('waiting hawezi accept', () =>
        L.transitionOffers(mkOffers(T0, 30 * 60000), { type: 'accept', offerId: 'r1', agentId: 'a1' }, T0), 'offer_not_active');
    // si yake
    throws('ofa ya mwingine imekataliwa', () =>
        L.transitionOffers(mkOffers(T0, 30 * 60000), { type: 'accept', offerId: 'r0', agentId: 'a9' }, T0), 'not_your_offer');
    // muda umeisha
    throws('accept baada ya kuisha imekataliwa', () =>
        L.transitionOffers(mkOffers(T0, 30 * 60000), { type: 'accept', offerId: 'r0', agentId: 'a0' }, T0 + 31 * 60000), 'offer_expired');
    // mwingine tayari amekubali
    throws('accept baada ya mwingine kukubali', () => {
        const taken = mkOffers(T0, 30 * 60000).map(o =>
            o.id === 'r0' ? Object.assign({}, o, { status: L.OFFER.ACCEPTED }) :
            Object.assign({}, o, { status: L.OFFER.CANCELLED }));
        return L.transitionOffers(taken, { type: 'accept', offerId: 'r1', agentId: 'a1' }, T0);
    }, 'ride_already_assigned');
    // decline ya ofa isiyo hai
    throws('decline ya accepted imekataliwa', () => {
        const taken = mkOffers(T0, 30 * 60000).map(o =>
            o.id === 'r0' ? Object.assign({}, o, { status: L.OFFER.ACCEPTED }) : o);
        return L.transitionOffers(taken, { type: 'decline', offerId: 'r0', agentId: 'a0' }, T0);
    }, 'offer_not_active');
}

console.log('\n[F] Mengine');
{
    const offers = mkOffers(T0, 30 * 60000);
    const tr = L.transitionOffers(offers, { type: 'cancel_round', reason: 'retry' }, T0);
    ok('cancel_round yafunga yote wazi', tr.updates.r0.status === L.OFFER.CANCELLED && tr.updates.r1.status === L.OFFER.CANCELLED && tr.updates.r2.status === L.OFFER.CANCELLED);
    ok('roundFailed si kweli wakiwa waiting', !L.roundFailed(mkOffers(T0, 30 * 60000)));
    ok('roundFailed kweli wakiwa terminal', L.roundFailed([
        { status: L.OFFER.DECLINED }, { status: L.OFFER.EXPIRED }, { status: L.OFFER.CANCELLED }
    ]));
    ok('roundFailed si kweli mmoja akikubali', !L.roundFailed([
        { status: L.OFFER.ACCEPTED }, { status: L.OFFER.CANCELLED }
    ]));
    ok('matchEnds hugundua kituo ndani ya fullRoute', L.matchEnds({
        fullRoute: 'Dar es Salaam → Morogoro → Dodoma'
    }, 'Morogoro', 'Dodoma').origin === true);
}

/* ============================================================
 * [G] DATA LAYER kamili — Firestore bandia (bila firebase-admin)
 * ============================================================ */

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function FakeDb() {
    const docs = new Map();
    let seq = 0;
    function docRef(path) {
        return {
            id: path.split('/').pop(), path: path,
            async get() {
                const d = docs.has(path) ? docs.get(path) : undefined;
                return { id: path.split('/').pop(), ref: docRef(path), exists: d !== undefined, data: () => d };
            },
            async set(d) { docs.set(path, clone(d)); },
            async update(p) {
                const cur = docs.get(path) || {};
                docs.set(path, Object.assign({}, cur, clone(p)));
            },
            async delete() { docs.delete(path); }
        };
    }
    function qSnap(paths) {
        return {
            empty: paths.length === 0, size: paths.length,
            forEach(cb) { paths.forEach(p => {
                const d = docs.get(p);
                cb({ id: p.split('/').pop(), ref: docRef(p), exists: true, data: () => d });
            }); }
        };
    }
    function coll(name) {
        const c = {
            _filters: [],
            doc(id) { if (id === undefined) id = 'auto_' + (++seq); return docRef(name + '/' + id); },
            async add(d) { const r = c.doc(); await r.set(d); return r; },
            where(k, op, v) { c._filters.push([k, op, v]); return c; },
            orderBy() { return c; },
            limit() { return c; },
            async get() {
                let paths = [...docs.keys()].filter(p => p.startsWith(name + '/') && p.split('/').length === 2);
                c._filters.forEach(([k, op, v]) => {
                    paths = paths.filter(p => { const d = docs.get(p); return op === '==' ? d[k] === v : true; });
                });
                return qSnap(paths);
            }
        };
        return c;
    }
    const ops = [];
    return {
        doc: p => docRef(p),
        collection: coll,
        batch() {
            return {
                set(ref, d) { ops.push(['set', ref, d]); },
                update(ref, p) { ops.push(['update', ref, p]); },
                delete(ref) { ops.push(['delete', ref]); },
                async commit() {
                    for (const [op, ref, d] of ops) {
                        if (op === 'set') await ref.set(d);
                        else if (op === 'update') await ref.update(d);
                        else await ref.delete();
                    }
                    ops.length = 0;
                }
            };
        },
        _docs: docs
    };
}

function goodDriver(over) {
    return Object.assign({
        userId: '', kind: 'driver', online: true, vehicleType: 'Lori',
        pickupRegion: 'Tabora', destinationRegion: 'Pangale',
        fullRoute: 'Tabora → Igunga → Pangale',
        supportedServices: ['cargo'], maxWeight: '3 tani', price: 100000
    }, over || {});
}

async function offersByRide(db, rideId) {
    const out = [];
    const snap = await db.collection('delivery_offers').where('rideId', '==', rideId).get();
    snap.forEach(d => out.push(d.data()));
    out.sort((a, b) => a.rank - b.rank);
    return out;
}

console.log('\n[G] DATA LAYER — order → ride → offers → reassignment');
{
    const db = FakeDb();
    await db.doc('orders/o1').set({
        kind: 'booking', buyerId: 'mteja1', sellerId: 'muuzaji1',
        itemTitle: 'Mchele mifuko 10', route: { from: 'Tabora', to: 'Pangale' },
        vehicleType: 'Lori', fare: 150000, currency: 'TZS',
        packageDescription: 'Mchele mifuko 10', status: 'payment_pending'
    });
    await db.collection('drivers').doc('veh_a').set(goodDriver({ userId: 'd0', driverName: 'Dereva Bora', rating: 5 }));
    await db.collection('drivers').doc('veh_b').set(goodDriver({ userId: 'd1', driverName: 'Dereva Wa Pili', rating: 4 }));
    await db.collection('drivers').doc('veh_x').set(goodDriver({
        userId: 'dx', pickupRegion: 'Mbeya', destinationRegion: 'Songwe', fullRoute: 'Mbeya → Songwe'
    }));
    await db.collection('agents').doc('ag1').set({
        userId: 'ag1', status: 'approved', fullName: 'Wakala Tabora', location: 'Tabora'
    });

    const res = await core.routeBookingFromOrder(db, 'o1', { actorId: 'mteja1', round: 1 });
    ok('routeBooking imerudisha rideId', !!res.rideId);
    ok('wagombea 2 (dereva wa nje na wakala hawamo)', res.offers === 2 && res.drivers === 2 && res.agents === 0);
    const rideSnap = await db.doc('ride_requests/' + res.rideId).get();
    const ride = rideSnap.data();
    ok('ride inaundwa status searching/routing', ride.status === 'searching' && ride.routingStatus === 'routing');
    ok('ride inaunganishwa na order', ride.orderId === 'o1');
    ok('ride ina route na mzigo kutoka order', ride.fromLocation === 'Tabora' && ride.cargoName === 'Mchele mifuko 10');

    const orderAfter = (await db.doc('orders/o1').get()).data();
    ok('order inaunganishwa na delivery (deliveryId)', orderAfter.deliveryId === res.rideId && orderAfter.rideRequestId === res.rideId);

    let offers = await offersByRide(db, res.rideId);
    ok('ofaya d0 (rating 5) ni ya kwanza na offered', offers[0].agentId === 'd0' && offers[0].status === 'offered' && !!offers[0].expiresAt);
    ok('d1 ni waiting', offers[1].agentId === 'd1' && offers[1].status === 'waiting');
    ok('kadi ya ofa ina snapshot ya ombi', offers[0].cargoName === 'Mchele mifuko 10' && offers[0].fare === 150000 && offers[0].toLocation === 'Pangale');
    ok('participants ni mteja na wakala', offers[0].participants.length === 2 && offers[0].participants[0] === 'mteja1');
    ok('activeOfferId ya d0', ride.activeOfferId === offers[0].rideId + '_d0');

    // Decline d0 → d1 afunguliwe
    await core.declineOffer(db, offers[0].rideId + '_d0', 'd0');
    offers = await offersByRide(db, res.rideId);
    ok('baada ya decline: d0 declined', offers[0].status === 'declined');
    ok('baada ya decline: d1 offered', offers[1].status === 'offered' && !!offers[1].expiresAt);

    // Decline d1 → failed_assignment
    const r2 = await core.declineOffer(db, offers[1].rideId + '_d1', 'd1');
    const ride2 = (await db.doc('ride_requests/' + res.rideId).get()).data();
    ok('wote wakikataa → failed_assignment', ride2.assignmentStatus === 'failed_assignment' && r2.next === false);

    // Retry mzunguko wa 2: ofa mpya, za zamani zimeghairiwa
    const res2 = await core.routeBookingFromOrder(db, 'o1', { actorId: 'mteja1', round: 2, force: true });
    offers = await offersByRide(db, res2.rideId);
    ok('retry: d0 offered tena round 2', offers[0].status === 'offered' && offers[0].round === 2);
    const ride3 = (await db.doc('ride_requests/' + res.rideId).get()).data();
    ok('retry: routing round 2 na seeking', ride3.routingRound === 2 && ride3.assignmentStatus === 'seeking');

    // Mtu asiye husika hawezi decline
    let blocked = false;
    try { await core.declineOffer(db, offers[0].rideId + '_d0', 'mgeni'); } catch (e) { blocked = String(e.message).includes('not_your_offer'); }
    ok('asiye husika hawezi decline', blocked);
}

console.log('\n[H] DATA LAYER — expiry sweep na no-match');
{
    // Expiry: wa kwanza akiisha, wa pili afunguliwe
    const db = FakeDb();
    await db.doc('orders/o2').set({
        kind: 'booking', buyerId: 'b2', sellerId: 's2',
        route: { from: 'Tabora', to: 'Pangale' }, vehicleType: 'Lori', fare: 50000
    });
    await db.collection('drivers').doc('a').set(goodDriver({ userId: 'd0', rating: 5 }));
    await db.collection('drivers').doc('b').set(goodDriver({ userId: 'd1', rating: 4 }));
    const res = await core.routeBookingFromOrder(db, 'o2', { round: 1 });
    let offers = await offersByRide(db, res.rideId);
    // rudisha nyuma muda wa ofa ya kwanza
    await db.collection('delivery_offers').doc(offers[0].rideId + '_d0')
        .update({ expiresAt: new Date(Date.now() - 60000).toISOString() });
    const sw = await core.sweepRide(db, res.rideId);
    ok('sweep imeona mabadiliko', sw.changed === true);
    offers = await offersByRide(db, res.rideId);
    ok('d0 imeisha', offers[0].status === 'expired');
    ok('d1 amefunguliwa baada ya kuisha', offers[1].status === 'offered');

    // Hakuna anayefaa
    const db2 = FakeDb();
    await db2.doc('orders/o3').set({
        kind: 'booking', buyerId: 'b3', sellerId: 's3',
        route: { from: 'Lindi', to: 'Nachingwea' }, vehicleType: 'Lori', fare: 1000
    });
    await db2.collection('drivers').doc('x').set(goodDriver({ userId: 'dx' }));
    await db2.collection('agents').doc('a').set({ userId: 'ag', status: 'approved', location: 'Mwanza' });
    const r3 = await core.routeBookingFromOrder(db2, 'o3', { round: 1 });
    ok('hakuna mwenye route → no_match', r3.matched === false && r3.offers === 0);
    const rideX = (await db2.doc('ride_requests/' + r3.rideId).get()).data();
    ok('no_match → failed_assignment (soko la jumla)', rideX.assignmentStatus === 'failed_assignment' && rideX.routingStatus === 'no_match');
}

console.log('\n[I] Idempotency');
{
    const db = FakeDb();
    await db.doc('orders/o4').set({
        kind: 'booking', buyerId: 'b4', sellerId: 's4',
        route: { from: 'Tabora', to: 'Pangale' }, vehicleType: 'Lori'
    });
    await db.collection('drivers').doc('a').set(goodDriver({ userId: 'd0' }));
    const r1 = await core.routeBookingFromOrder(db, 'o4', { round: 1 });
    // Weka kuwa tayari imegawiwa
    await db.doc('ride_requests/' + r1.rideId).update({ driverId: 'd0', assignmentStatus: 'assigned' });
    const r2 = await core.routeBookingFromOrder(db, 'o4', { round: 1 });
    ok('mwito wa pili baada ya assignment ni idempotent', r2.idempotent === true && r2.rideId === r1.rideId);

    // Order isiyo booking inakataliwa
    const db2 = FakeDb();
    await db2.doc('orders/o5').set({ kind: 'service_order', buyerId: 'b' });
    let bad = false;
    try { await core.routeBookingFromOrder(db2, 'o5', {}); } catch (e) { bad = String(e.message).includes('not_a_booking'); }
    ok('order isiyo booking inakataliwa', bad);
}

console.log('\n========================================');
console.log('ROUTING TESTS: ' + pass + ' pass, ' + fail + ' fail');
console.log('========================================');
process.exit(fail ? 1 : 0);

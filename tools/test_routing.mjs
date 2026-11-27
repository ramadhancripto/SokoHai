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

// [PART 5B-2] TABIA ILIYOBADILISHWA KWA MAKUSUDI: chombo kisicholingana si
// "alama ndogo" tena — mgombeaji HATENGWI bali HATUMIKI. Kigezo kipya ni
// kutengwa (null) + sababu, si exact=false.
const mWrongVehicle = L.scoreCandidate(driver({
    uid: 'd3', vehicleType: 'Bajaji', maxWeight: '100 kg'
}), req);
ok('chombo tofauti → ametengwa kabisa', mWrongVehicle === null);
ok('sababu: vehicle_mismatch', L.eligibility(driver({ uid: 'd3', vehicleType: 'Bajaji', maxWeight: '100 kg' }), req).reason === 'vehicle_mismatch');

const mLowCap = L.scoreCandidate(driver({
    uid: 'd4', maxWeight: '500 kg'
}), req);
ok('uwezo duni (500<800 kg) → ametengwa kabisa', mLowCap === null);
ok('sababu: capacity_insufficient', L.eligibility(driver({ uid: 'd4', maxWeight: '500 kg' }), req).reason === 'capacity_insufficient');

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
// [PART 5B-2] Huduma isiyolingana pia ni FILTER, si alama.
ok('mizigo haifai kwa chombo cha abiria tu → ametengwa', (() => {
    // chombo KINALINGANA (Lori) ili kigezo cha huduma kipimwe peke yake.
    const cand = {
        uid: 'p2', kind: 'driver', online: true, vehicleType: 'Lori', maxWeight: '3 tani',
        pickupRegion: 'Tabora', destinationRegion: 'Pangale',
        fullRoute: 'Tabora → Pangale', supportedServices: ['passenger']
    };
    return L.scoreCandidate(cand, req) === null && L.eligibility(cand, req).reason === 'service_unsupported';
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
        async runTransaction(fn) {
            const writes = [];
            const t = { get: ref => ref.get(), update: (ref, patch) => writes.push([ref, patch]) };
            const result = await fn(t);
            for (const [ref, patch] of writes) await ref.update(patch);
            return result;
        },
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

console.log('\n[H2] [PART 5B-2] SIFA ZA LAZIMA — waliofeli HAWAPEWI ofa');

{
    // Route ya msingi ya majaribio: Dar es Salaam -> Mwanza, mzigo wa kilo 8,000, Lori.
    const reqHeavy = { from: 'Dar es Salaam', to: 'Mwanza', category: 'Cargo', vehicleType: 'Lori', weight: 8000, excludeUid: 'buyer1' };
    const base = {
        kind: 'driver', online: true, vehicleType: 'Lori', maxWeight: '10 tani',
        supportedServices: ['cargo'], pickupRegion: 'Dar es Salaam', destinationRegion: 'Mwanza',
        fullRoute: 'Dar es Salaam → Morogoro → Mwanza', rating: 4
    };
    const mk = (over) => Object.assign({}, base, over || {});

    /* 1. Dereva aliyesimamishwa */
    const susp = mk({ uid: 'susp1', suspended: true });
    ok('1) dereva aliyesimamishwa ametengwa', L.eligibility(susp, reqHeavy).reason === 'account_inactive' && L.scoreCandidate(susp, reqHeavy) === null);
    ok('1b) hata kama ni "exact" kwa route/chombo/uwezo', L.eligibility(mk({ uid: 'susp2', accountStatus: 'suspended' }), reqHeavy).reason === 'account_inactive');

    /* 2. Akaunti isiyo hai */
    ok('2) accountStatus=inactive ametengwa', L.eligibility(mk({ uid: 'ina1', accountStatus: 'inactive' }), reqHeavy).reason === 'account_inactive');
    ok('2b) agentStatus=suspended ametengwa', L.eligibility(mk({ uid: 'ina2', agentStatus: 'suspended' }), reqHeavy).reason === 'account_inactive');
    ok('2c) accountStatus=active HAPITIWI (anabaki)', L.eligibility(mk({ uid: 'ok1', accountStatus: 'active' }), reqHeavy).ok === true);
    ok('2d) bila accountStatus (data ya zamani) anabaki', L.eligibility(mk({ uid: 'ok2' }), reqHeavy).ok === true);

    /* 3. Chombo kisicholingana */
    ok('3) Bajaji kwa ombi la Lori ametengwa', L.eligibility(mk({ uid: 'veh1', vehicleType: 'Bajaji' }), reqHeavy).reason === 'vehicle_mismatch');
    ok('3b) dereva asiye na vehicleType ametengwa ombi likitaja aina', L.eligibility(mk({ uid: 'veh2', vehicleType: '' }), reqHeavy).reason === 'vehicle_mismatch');
    ok('3c) ombi lisilotaja chombo halikatai kwa vehicleType', L.eligibility(mk({ uid: 'veh3', vehicleType: 'Gari dogo' }), { from: 'Dar es Salaam', to: 'Mwanza', category: 'Cargo', weight: 0 }).ok === true);

    /* 4. Uwezo mdogo */
    ok('4) uwezo 500kg < mzigo 8000kg ametengwa', L.eligibility(mk({ uid: 'cap1', maxWeight: '500 kg' }), reqHeavy).reason === 'capacity_insufficient');
    ok('4b) uwezo 5 tani < 8000kg ametengwa', L.eligibility(mk({ uid: 'cap2', maxWeight: '5 tani' }), reqHeavy).reason === 'capacity_insufficient');
    ok('4c) uwezo 10 tani unatosha', L.eligibility(mk({ uid: 'cap3', maxWeight: '10 tani' }), reqHeavy).ok === true);
    ok('4d) uzito usiojulikana (0) haukatai kwa uwezo', L.eligibility(mk({ uid: 'cap4', maxWeight: '100 kg' }), { from: 'Dar es Salaam', to: 'Mwanza', category: 'Cargo', vehicleType: 'Lori', weight: 0 }).ok === true);

    /* 5. Huduma isiyolingana */
    ok('5) services=[watu] kwa cargo ametengwa', L.eligibility(mk({ uid: 'svc1', supportedServices: ['Watu', 'Passenger'] }), reqHeavy).reason === 'service_unsupported');
    ok('5b) services tupu (hajataja) anaruhusiwa', L.eligibility(mk({ uid: 'svc2', supportedServices: [] }), reqHeavy).ok === true);

    /* 6. Route isiyolingana */
    ok('6) route tofauti kabisa ametengwa', L.eligibility(mk({ uid: 'rt1', pickupRegion: 'Mbeya', destinationRegion: 'Songwe', fullRoute: 'Mbeya → Songwe' }), reqHeavy).reason === 'route_mismatch');
    ok('6b) ncha MOJA (fallback halali) anaruhusiwa', L.eligibility(mk({ uid: 'rt2', destinationRegion: 'Dodoma', fullRoute: 'Dar es Salaam → Dodoma' }), reqHeavy).ok === true);

    /* 7. Dereva anayefaa kikamilifu */
    const good = mk({ uid: 'good1', rating: 4.6, price: 90000 });
    const gm = L.scoreCandidate(good, reqHeavy);
    ok('7) dereva anayefaa → exact', !!gm && gm.exact === true && gm.vehicleOk === true && gm.capacityOk === true && gm.serviceOk === true);
    ok('7b) alama > 0', !!gm && gm.score > 0);

    /* 8. Waliofaa wengi — mpangilio (rating juu/bei nafuu kwanza) */
    const r1 = L.rankCandidates([
        mk({ uid: 'a_ok', rating: 3.0, price: 200000 }),
        mk({ uid: 'b_ok', rating: 5.0, price: 100000 }),
        mk({ uid: 'c_ok', rating: 4.0, price: 150000 })
    ], reqHeavy);
    ok('8) waliofaa wote wamechaguliwa (3)', r1.chosen.length === 3);
    ok('8b) mpangilio: rating/bei bora kwanza', r1.chosen[0].uid === 'b_ok' && r1.chosen[2].uid === 'a_ok');
    ok('8c) hakuna aliyetengwa', r1.rejected.length === 0);

    /* 9. Hakuna dereva anayefaa → seti tupu (+ agents ni safu ya pili) */
    const none = L.rankCandidates([
        mk({ uid: 'x1', suspended: true }),
        mk({ uid: 'x2', maxWeight: '500 kg' }),
        mk({ uid: 'x3', vehicleType: 'Bajaji' })
    ], reqHeavy);
    ok('9) hakuna dereva anayefaa → chosen tupu', none.chosen.length === 0);
    ok('9b) sababu zimeandikwa kwa kila aliyetengwa', none.rejected.length === 3
        && none.rejected.map(r => r.reason).sort().join(',') === 'account_inactive,capacity_insufficient,vehicle_mismatch');

    /* 10. MFANO ULIRIPOTIWA: Bajaji ya kg 500 iliyosimamishwa + mzigo wa Lori kg 8,000 */
    const reported = { uid: 'bajaji1', kind: 'driver', online: true, vehicleType: 'Bajaji', maxWeight: '500 kg', supportedServices: ['passenger'], pickupRegion: 'Dar es Salaam', destinationRegion: 'Mwanza', suspended: true };
    const rep = L.rankCandidates([reported], reqHeavy);
    ok('10) MFANO: Bajaji 500kg iliyosimamishwa HAIPEWI assignment ya Lori 8,000kg', rep.chosen.length === 0 && rep.drivers.length === 0);
    ok('10b) sababu ni ya kwanza kwa usalama (account_inactive)', rep.rejected[0].reason === 'account_inactive');
    const repActive = Object.assign({}, reported, { suspended: false });
    ok('10c) hata akiwa hai: chombo + uwezo bado vinamkataa',
        L.rankCandidates([repActive], reqHeavy).rejected[0].reason === 'vehicle_mismatch');

    /* 11. Mteuzi wa mteja (preferred driver) haepushwi kwenye sifa za lazima */
    {
        const db = FakeDb();
        // Oda ya BIDHAA yenye tangazo lililochaguliwa (product path) — hali halisi
        // ya checkout: 43-delivery-choice huandika delivery.* kwenye oda.
        await db.doc('orders/o_pref').set({
            buyerId: 'mteja1', sellerId: 'muuzaji1', itemTitle: 'Saruji mifuko 40',
            productOrder: true, amount: 400000, currency: 'TZS', status: 'held',
            delivery: {
                required: true, logisticPostId: 'veh_susp', logisticProviderId: 'dsusp',
                pickupLocation: 'Tabora', destination: 'Pangale', vehicleType: 'Lori',
                fare: 120000, packageWeightKg: 800, packageDescription: 'Saruji mifuko 40'
            }
        });
        await db.doc('users/dsusp').set({ displayName: 'Dereva Aliyesimamishwa', suspended: true });
        await db.collection('drivers').doc('veh_susp').set(goodDriver({ userId: 'dsusp', driverName: 'Dereva Aliyesimamishwa' }));
        await db.collection('drivers').doc('veh_good').set(goodDriver({ userId: 'dgood', driverName: 'Dereva Mzuri', rating: 4 }));
        const res = await core.routeBookingFromOrder(db, 'o_pref', { actorId: 'mteja1', preferredDriverId: 'dsusp', force: true });
        const offers = await offersByRide(db, res.rideId);
        const ride = (await db.doc('ride_requests/' + res.rideId).get()).data();
        ok('11) mteuzi aliyesimamishwa HAPEWI ofa', !offers.some(o => o.agentId === 'dsusp'));
        ok('11b) ombi linaendelea kwa wagombeaji waliofaa (fallback)', offers.some(o => o.agentId === 'dgood'));
        ok('11c) sababu imeandikwa kwenye ride', ride.preferredRejectedReason === 'account_inactive');
    }

    /* 12. Mawakala: safu ya pili haipitiwi kwa sifa za chombo */
    const ag = L.rankCandidates([{ uid: 'ag_ok', kind: 'agent', status: 'approved', location: 'Mwanza', rating: 4 }], reqHeavy);
    ok('12) wakala wa eneo anabaki kuwa chaguo la mwisho', ag.chosen.length === 1 && ag.chosen[0].uid === 'ag_ok');
    ok('12b) wakala aliyesimamishwa ametengwa', L.rankCandidates([{ uid: 'ag_susp', kind: 'agent', status: 'approved', location: 'Mwanza', suspended: true }], reqHeavy).chosen.length === 0);
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

/* ============================================================
 * [J] [PART 5B-3 2026-11-25] DESTINATION INTEGRITY — server
 * Ombi la usafiri/oda yenye usafiri lisilo na anwani halali
 * HALITENGENEZI ride_request wala delivery_offers, na halibadilishi
 * delivery ya oda. Kigezo: shared/delivery-destination-core.js
 * kinachotumika pia na kivinjari (hakuna nakala ya pili).
 * ============================================================ */
console.log('\n[J] [PART 5B-3] DESTINATION INTEGRITY — server');
{
    const DEST = require('../shared/delivery-destination-core.js');

    /* -------- J1) kigezo cha pamoja (validator) -------- */
    const accepts = [
        ['Dodoma', 'Dodoma'],
        ['  Dodoma, Mjini  ', 'Dodoma, Mjini'],
        [{ label: 'Dodoma' }, 'Dodoma'],
        [{ name: 'Dodoma', lat: -6.17, lon: 35.74 }, 'Dodoma'],
        [{ address: 'Mtaa wa Kariakoo, Dar es Salaam' }, 'Mtaa wa Kariakoo, Dar es Salaam'],
        [{ lat: -6.17, lon: 35.74 }, '-6.17, 35.74'],
        [{ location: { label: 'Morogoro' } }, 'Morogoro']
    ];
    accepts.forEach(([input, want]) => {
        const r = DEST.resolve(input);
        ok('J1 anakubali ' + JSON.stringify(input).slice(0, 34) + ' → ' + r.value, r.ok && r.value === want);
    });
    const rejects = [
        [undefined, 'missing_destination'],
        [null, 'missing_destination'],
        ['', 'empty_destination'],
        ['   ', 'empty_destination'],
        ['\n\t ', 'empty_destination'],
        [{}, 'empty_destination'],
        [{ label: '   ' }, 'empty_destination'],
        [{ length: 0 }, 'empty_destination'],
        [[], 'empty_destination'],
        [{ lat: 'abc', lon: 'x' }, 'malformed_destination'],
        [{ lat: 999, lon: 35 }, 'malformed_destination'],
        [42, 'malformed_destination'],
        [[1, 2], 'malformed_destination'],
        [{ foo: 1 }, 'malformed_destination']
    ];
    rejects.forEach(([input, want]) => {
        ok('J1 anakataa ' + JSON.stringify(input) + ' (' + want + ')', DEST.resolve(input).reason === want);
    });
    ok('J1 ujumbe wa Kiswahili kwa kila sababu',
        /anwani/i.test(DEST.messageFor('missing_destination')) &&
        /anwani/i.test(DEST.messageFor('empty_destination')) &&
        /anwani/i.test(DEST.messageFor('malformed_destination')));
    ok('J1 kipaumbele: tupu hurukwa, HALIJAJAZWA kwa origin',
        DEST.firstValid(['', 'Dodoma']).value === 'Dodoma' && DEST.firstValid(['', '   ']).ok === false);

    /* -------- J2) booking yenye anwani mbovu HAITENGENEZI kitu -------- */
    async function bookingDb(toValue, extraDelivery) {
        const db = FakeDb();
        const order = {
            kind: 'booking', buyerId: 'mteja1', sellerId: 'muuzaji1',
            itemTitle: 'Mchele mifuko 10', route: { from: 'Tabora' },
            vehicleType: 'Lori', fare: 150000, currency: 'TZS', status: 'payment_pending'
        };
        if (toValue !== '__absent__') order.route.to = toValue;
        if (extraDelivery) order.delivery = extraDelivery;
        await db.doc('orders/o_bad').set(order);
        await db.collection('drivers').doc('veh_a').set(goodDriver({ userId: 'd0', rating: 5 }));
        await db.collection('drivers').doc('veh_b').set(goodDriver({ userId: 'd1', rating: 4 }));
        return db;
    }

    const badCases = [
        ['hakuna sehemu kabisa', '__absent__', undefined, 'missing_destination'],
        ['string tupu', '', undefined, 'empty_destination'],
        ['nafasi tupu', '   ', undefined, 'empty_destination'],
        ['null', null, undefined, 'missing_destination'],
        ['object tupu', {}, undefined, 'empty_destination'],
        ['object yenye label tupu', { label: '  ' }, undefined, 'empty_destination'],
        ['object mbovu (lat si namba)', { lat: 'abc', lon: 'y' }, undefined, 'malformed_destination']
    ];
    for (const [label, toValue, extraDelivery, wantReason] of badCases) {
        const db = await bookingDb(toValue, extraDelivery);
        let err = null;
        try { await core.routeBookingFromOrder(db, 'o_bad', { round: 1 }); } catch (e) { err = e; }
        const rides = await db.collection('ride_requests').get();
        const offers = await db.collection('delivery_offers').get();
        const orderAfter = (await db.doc('orders/o_bad').get()).data();
        ok('J2 booking — ' + label + ': imekataliwa kwa invalid_destination',
            !!err && String(err.message).includes('invalid_destination') && err.destinationReason === wantReason);
        ok('J2 booking — ' + label + ': HAKUNA ride wala ofa', rides.size === 0 && offers.size === 0);
        ok('J2 booking — ' + label + ': oda haijabadilishwa',
            !orderAfter.deliveryId && !orderAfter.rideRequestId && orderAfter.status === 'payment_pending' &&
            JSON.stringify(orderAfter.route) === JSON.stringify(toValue === '__absent__' ? { from: 'Tabora' } : { from: 'Tabora', to: toValue }));
    }

    /* -------- J3) oda ya bidhaa yenye delivery.required -------- */
    async function productDb(destValue) {
        const db = FakeDb();
        const delivery = { required: true, method: 'selected_listing', logisticPostId: 'veh_a', logisticProviderId: 'd0', pickupLocation: 'Morogoro' };
        if (destValue !== '__absent__') delivery.destination = destValue;
        await db.doc('orders/o_prod').set({
            kind: 'product_order', buyerId: 'mteja1', items: [{ title: 'Pembejeo', qty: 1 }],
            amount: 60000, delivery, status: 'pending'
        });
        await db.collection('drivers').doc('veh_a').set(goodDriver({ userId: 'd0', rating: 5 }));
        await db.collection('drivers').doc('veh_b').set(goodDriver({ userId: 'd1', rating: 4 }));
        return db;
    }
    const prodBad = [
        ['hakuna anwani', '__absent__', 'missing_destination'],
        ['string tupu', '', 'empty_destination'],
        ['nafasi tupu', '   ', 'empty_destination'],
        ['null', null, 'missing_destination'],
        ['object tupu', {}, 'empty_destination'],
        ['object mbovu', { lat: 'abc' }, 'malformed_destination'],
        ['array', [1, 2], 'malformed_destination']
    ];
    for (const [label, destValue, wantReason] of prodBad) {
        const db = await productDb(destValue);
        let err = null;
        try { await core.routeBookingFromOrder(db, 'o_prod', { actorId: 'mteja1' }); } catch (e) { err = e; }
        const rides = await db.collection('ride_requests').get();
        const offers = await db.collection('delivery_offers').get();
        const after = (await db.doc('orders/o_prod').get()).data();
        ok('J3 oda — ' + label + ': invalid_destination (' + wantReason + ')',
            !!err && String(err.message).includes('invalid_destination') && err.destinationReason === wantReason);
        ok('J3 oda — ' + label + ': HAKUNA ride/ofa', rides.size === 0 && offers.size === 0);
        const destAfter = after.delivery && after.delivery.destination;
        const sameDest = (destValue === '__absent__')
            ? destAfter === undefined
            : (destValue !== null && typeof destValue === 'object'
                ? JSON.stringify(destAfter) === JSON.stringify(destValue)
                : destAfter === destValue);
        ok('J3 oda — ' + label + ': delivery ya oda iko kama ilivyokuwa (hakuna substitution)',
            !!after.delivery && after.delivery.method === 'selected_listing' &&
            after.delivery.pickupLocation === 'Morogoro' && sameDest);
    }

    /* -------- J4) mwito wa moja kwa moja (bila UI) -------- */
    {
        const db = await productDb('   ');
        let err = null;
        try {
            await core.ensureRideForOrder(db, (await db.doc('orders/o_prod').get()).data(), 'o_prod', { preferredDriverId: 'd0' });
        } catch (e) { err = e; }
        ok('J4 ensureRideForOrder ya moja kwa moja inakataa (bila UI)',
            !!err && String(err.message).includes('invalid_destination'));
        ok('J4 hakuna ride iliyoundwa', (await db.collection('ride_requests').get()).size === 0);
        ok('J4 hakuna ofa iliyoundwa', (await db.collection('delivery_offers').get()).size === 0);
        let errB = null;
        const dbB = await bookingDb('');
        try { await core.ensureRideForOrder(dbB, (await dbB.doc('orders/o_bad').get()).data(), 'o_bad', {}); }
        catch (e) { errB = e; }
        ok('J4 booking tupu: ensureRideForOrder inakataa', !!errB && String(errB.message).includes('invalid_destination'));
    }

    /* -------- J5) anakubali data halali + 5B-2 routing inaendelea -------- */
    {
        const db = FakeDb();
        await db.doc('orders/o_ok').set({
            kind: 'booking', buyerId: 'mteja1', sellerId: 'muuzaji1',
            itemTitle: 'Mchele', route: { from: 'Tabora', to: '  Pangale ' },
            vehicleType: 'Lori', fare: 150000, currency: 'TZS', status: 'payment_pending'
        });
        await db.collection('drivers').doc('veh_a').set(goodDriver({ userId: 'd0', rating: 5 }));
        await db.collection('drivers').doc('veh_b').set(goodDriver({ userId: 'd1', rating: 4 }));
        const res = await core.routeBookingFromOrder(db, 'o_ok', { round: 1 });
        const ride = (await db.doc('ride_requests/' + res.rideId).get()).data();
        const offers = await offersByRide(db, res.rideId);
        ok('J5 string halali: ride imeundwa', !!res.rideId && ride.status === 'searching');
        ok('J5 string halali: toLocation imesafishwa (trim)', ride.toLocation === 'Pangale');
        ok('J5 string halali: ofa zimetengenezwa (5B-2 routing bado inafanya kazi)', res.offers >= 1 && offers.length === res.offers);
    }
    {
        const db = FakeDb();
        await db.doc('orders/o_struct').set({
            kind: 'booking', buyerId: 'mteja1', sellerId: 'muuzaji1', itemTitle: 'Mchele',
            route: { from: 'Tabora', to: { label: 'Pangale', lat: -6.17, lon: 35.74 } },
            vehicleType: 'Lori', fare: 150000, currency: 'TZS', status: 'payment_pending'
        });
        await db.collection('drivers').doc('veh_a').set(goodDriver({ userId: 'd0', rating: 5 }));
        const res = await core.routeBookingFromOrder(db, 'o_struct', { round: 1 });
        const ride = (await db.doc('ride_requests/' + res.rideId).get()).data();
        ok('J5 structured halali: ride imeundwa', !!res.rideId);
        ok('J5 structured: toLocation = label iliyosafishwa', ride.toLocation === 'Pangale');
        ok('J5 structured: ofa zimetengenezwa', res.offers >= 1);
    }
    {
        /* destination tupu LAKINI destinationLocation (jina la zamani) halali:
           halikataliwi, na HALIJAZIBWI kwa origin. */
        const db = FakeDb();
        await db.doc('orders/o_alias').set({
            kind: 'product_order', buyerId: 'mteja1', items: [{ title: 'Pembejeo' }], amount: 5000,
            delivery: { required: true, method: 'selected_listing', logisticPostId: 'veh_a', logisticProviderId: 'd0', pickupLocation: 'Morogoro', destination: '   ', destinationLocation: 'Dodoma' },
            status: 'pending'
        });
        await db.collection('drivers').doc('veh_a').set(goodDriver({ userId: 'd0', rating: 5 }));
        const res = await core.routeBookingFromOrder(db, 'o_alias', {});
        const ride = (await db.doc('ride_requests/' + res.rideId).get()).data();
        ok('J5 destinationLocation (legacy) inakubaliwa', !!res.rideId);
        ok('J5 legacy: toLocation ni anwani halali, SI origin/pickup', ride.toLocation === 'Dodoma' && ride.toLocation !== ride.fromLocation);
    }
    {
        /* POS/direct-hire: oda yenye anwani halali ya string na preferred provider. */
        const db = FakeDb();
        await db.doc('orders/o_pos').set({
            kind: 'product_order', buyerId: 'mteja1', items: [{ title: 'Mchele' }], amount: 9000,
            delivery: { required: true, method: 'direct_hire', logisticProviderId: 'd0', pickupLocation: 'Tabora', destination: 'Pangale' },
            status: 'pending'
        });
        await db.collection('drivers').doc('veh_a').set(goodDriver({ userId: 'd0', rating: 5 }));
        await db.collection('drivers').doc('veh_b').set(goodDriver({ userId: 'd1', rating: 4 }));
        const res = await core.routeBookingFromOrder(db, 'o_pos', { preferredDriverId: 'd0' });
        const offers = await offersByRide(db, res.rideId);
        ok('J5 direct-hire halali: ride + ofa', !!res.rideId && res.offers >= 1);
        ok('J5 direct-hire: provider aliyechaguliwa (5B-2) anapata ofa',
            offers.some(o => o.agentId === 'd0' && o.status === 'offered'));
    }

    /* -------- J6) tabia ya zamani ya eligibility haijabadilika -------- */
    {
        const db = await productDb('Dodoma');
        let err = null;
        const order = (await db.doc('orders/o_prod').get()).data();
        order.delivery.required = false; order.kind = 'service_order';
        try { await core.ensureRideForOrder(db, order, 'o_prod', {}); } catch (e) { err = e; }
        ok('J6 oda isiyo na usafiri bado inakataliwa kwa not_a_booking',
            !!err && String(err.message).includes('not_a_booking'));
        ok('J6 wala hakuna ride', (await db.collection('ride_requests').get()).size === 0);
    }
}

console.log('\n========================================');
console.log('ROUTING TESTS: ' + pass + ' pass, ' + fail + ' fail');
console.log('========================================');
process.exit(fail ? 1 : 0);

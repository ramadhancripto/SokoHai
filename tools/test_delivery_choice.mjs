#!/usr/bin/env node
/* ==== tools/test_delivery_choice.mjs ====
   SOKOHAI — Majaribio ya DELIVERY OPTION (2026-09):
   A) Chujio la matangazo HALISI ya usafiri (pure).
   B) Ride request iunganishwe na oda (pure).
   C) Carriers bandia wamezimwa; kichaguzi hufungua matangazo halisi.
   D) Cart: chaguo la hiari, checkout bila delivery, hakuna shipment bandia.
   E) Chaguo la delivery + tangazo halisi → payload na routing ya server.
   F) Fallback bila Cloud Functions: ride_request + taarifa kwa dereva.
   G) Server routing-core: oda ya bidhaa + preferred driver; oda bila
      delivery haifunguliwi; aliyechaguliwa akikataa ombi linarudi sokoni.
   Endesha: node tools/test_delivery_choice.mjs
   ================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.error('  ❌ ' + name); } }
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ')', a === b); }
function section(n) { console.log('\n[' + n + ']'); }

/* ------------------ server (routing-core) ------------------ */
const core = await import('../functions/routing-core.js');

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function FakeDb() {
    const docs = new Map(); let seq = 0;
    function docRef(p) {
        return {
            id: p.split('/').pop(), path: p,
            async get() { const d = docs.has(p) ? docs.get(p) : undefined; return { id: p.split('/').pop(), ref: docRef(p), exists: d !== undefined, data: () => d }; },
            async set(d) { docs.set(p, clone(d)); },
            async update(p2) {
                const cur = clone(docs.get(p) || {});
                const val = clone(p2);
                Object.keys(val).forEach(k => {
                    if (k.indexOf('.') !== -1) {
                        const parts = k.split('.'); let o = cur;
                        parts.forEach((pp, i) => { if (i === parts.length - 1) o[pp] = val[k]; else { o[pp] = o[pp] || {}; o = o[pp]; } });
                    } else cur[k] = val[k];
                });
                docs.set(p, cur);
            }
        };
    }
    function qSnap(paths) {
        return {
            empty: paths.length === 0, size: paths.length,
            forEach(cb) { paths.forEach(p => { const d = docs.get(p); cb({ id: p.split('/').pop(), ref: docRef(p), exists: true, data: () => d }); }); },
            docs: paths.map(p => ({ id: p.split('/').pop(), ref: docRef(p), exists: true, data: () => docs.get(p) }))
        };
    }
    function coll(name) {
        const c = {
            _filters: [],
            doc(id) { if (id === undefined) id = 'auto_' + (++seq); return docRef(name + '/' + id); },
            async add(d) { const r = c.doc(); await r.set(d); return r; },
            where(k, op, v) { c._filters.push([k, op, v]); return c; },
            orderBy() { return c; }, limit() { return c; },
            async get() {
                let paths = [...docs.keys()].filter(p => p.startsWith(name + '/') && p.split('/').length === 2);
                c._filters.forEach(([k, op, v]) => {
                    paths = paths.filter(p => {
                        const d = docs.get(p);
                        if (op === '==') return d[k] === v;
                        if (op === 'in') return v.includes(d[k]);
                        if (op === 'array-contains') return Array.isArray(d[k]) && d[k].includes(v);
                        return true;
                    });
                });
                return qSnap(paths);
            }
        };
        return c;
    }
    const ops = [];
    return {
        doc: p => docRef(p), collection: coll,
        batch() { return { set(r, d) { ops.push(['set', r, d]); }, update(r, p2) { ops.push(['update', r, p2]); }, delete(r) { ops.push(['delete', r]); }, async commit() { for (const [op, r, d] of ops) { if (op === 'set') await r.set(d); else if (op === 'update') await r.update(d); else await r.delete(); } ops.length = 0; } }; },
        _docs: docs
    };
}

function driverPost(over) {
    return Object.assign({
        userId: 'd0', kind: 'driver', online: true, vehicleType: 'Lori',
        pickupRegion: 'Dar es Salaam', destinationRegion: 'Dodoma',
        fullRoute: 'Dar es Salaam → Morogoro → Dodoma',
        supportedServices: ['cargo'], maxWeight: '1000', capacityKg: 2000, price: 80000, rating: 4.8
    }, over || {});
}

/* ================================================================
   A) Chujio la matangazo halisi
   ================================================================ */
section('A) Chujio la matangazo halisi ya usafiri');
{
    // setup DOM/window globals for module 43
    const dom = new JSDOM('<!doctype html><html><body><div id="cartModal" style="display:none"></div><div id="checkoutModal" style="display:none"><input id="checkoutAmount"></div></body></html>', { url: 'http://localhost/' });
    globalThis.window = dom.window; globalThis.document = dom.window.document; Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
    globalThis.sessionStorage = dom.window.sessionStorage; globalThis.localStorage = dom.window.localStorage;
    globalThis.alert = m => { window.__lastAlert = m; }; globalThis.confirm = () => true;
    globalThis.HTMLElement = dom.window.HTMLElement;
    window.t = k => k;
    window.skhNavIcon = (n, s) => '<svg data-ic="' + n + '"></svg>';
    window.skhRouteMatchesDriver = (d, f, t) => { const m = window.skhRouteMatchEnds(d, f, t); return m.origin || m.dest; };
    window.skhRouteMatchEnds = (d, f, t) => {
        const n = s => String(s || '').toLowerCase();
        return { origin: n(d.pickupRegion).includes(n(f)) || n(f).includes(n(d.pickupRegion)), dest: n(d.destinationRegion).includes(n(t)) || n(t).includes(n(d.destinationRegion)) };
    };
    // stub render ya cart inayoiga fcart ya mwisho
    window.renderSmartCart = function () {
        document.getElementById('cartModal').style.display = 'flex';
        document.getElementById('cartModal').innerHTML =
            '<div class="fcart-shell"><div class="fcart-main">'
            + '<div class="fcart-section"><div class="fcart-title"><b>Product Information</b></div></div>'
            + '<div class="fcart-section"><div class="fcart-title"><b>Delivery Selection</b></div>'
            + '<button id="openLogisticsMarketplaceBtn">Select Delivery / Open SokoHai Logistics</button></div>'
            + '</div><div class="fcart-side"><button class="fcart-btn fcart-btn-gold" onclick="window.finalProceedCheckout()">Proceed to Checkout</button></div></div>';
    };
    const added = { byCollection: {} };
    const skh = {
        currentUser: { uid: 'buyer1', displayName: 'Asha' },
        currentUserData: { phone: '0700' },
        myCart: [],
        fApp: {}, db: {},
        skhEscape: s => String(s == null ? '' : s), skhJsEsc: s => String(s == null ? '' : s),
        requireAuth: () => true,
        localStorage: dom.window.localStorage,
        sessionStorage: dom.window.sessionStorage,
        smartCartItems: () => skh.myCart,
        smartCartPrice: x => Number(x.price) || 0,
        smartCartQty: x => Math.max(1, parseInt(x.qty) || 1),
        smartCartSellerId: x => x.sellerId || x.userId || 'unknown_seller',
        smartCartSave() { dom.window.localStorage.setItem('sokohai_cart', JSON.stringify(skh.myCart)); },
        smartCartToken: () => 'SPC-TEST-1',
        orchProductMeta: p => ({ productId: p.id, sellerId: p.userId, sellerName: p.ownerName, weightKg: p.weightKg || 1 }),
        orchPackageSummary: items => ({ weightKg: items.reduce((s, x) => s + (x.weightKg || 1), 1), sellersCount: 1 }),
        buildSokoPayCoreTx: o => ({
            orderId: o.orderId, transactionToken: o.transactionToken, buyerId: 'buyer1', buyerName: 'Asha',
            sellerId: o.sellerId, sellerName: 'Shop', items: o.sellerItems, amount: 10000,
            paymentStatus: 'Payment Pending', escrowStatus: 'Waiting', timeline: []
        }),
        TransportPostCard: (p) => '<div class="feed-card-box skh-card" id="card_' + p.id + '"><b>' + (p.driverName || p.company) + '</b></div>',
        getDoc: async () => ({ exists: false, data: () => null }),
        addDoc: async (c, d) => {
            const name = c._c || c._name || 'unknown';
            const id = name + '_' + Math.random().toString(36).slice(2, 7);
            (added.byCollection[name] = added.byCollection[name] || []).push(d);
            return { id };
        },
        updateDoc: async () => {},
        collection: (db, name) => ({ _c: name }),
        doc: (db, name, id) => ({ path: name + '/' + id }),
        query: q => q, where: () => ({}), orderBy: () => ({}), limit: () => ({}),
        getDocs: async () => ({ forEach() { } }),
        cachedItems: []
    };
    globalThis.skh = skh; window.skh = skh;
    window.smartCartState = { paymentMethod: 'sokopay_wallet' };
    window.closeModals = () => { document.getElementById('checkoutModal').style.display = 'none'; };

    const posts = [
        Object.assign({ id: 'p1', collectionName: 'drivers', driverName: 'ABC Logistics', company: 'ABC' }, driverPost({ userId: 'd1', pickupRegion: 'Dar es Salaam', destinationRegion: 'Dodoma' })),
        Object.assign({ id: 'p2', collectionName: 'drivers', driverName: 'Mbeya Cargo' }, driverPost({ userId: 'd2', pickupRegion: 'Mbeya', destinationRegion: 'Songwe' })),
        Object.assign({ id: 'p3', collectionName: 'drivers', driverName: 'Mdogomdogo' }, driverPost({ userId: 'd3', capacityKg: 5, online: false })),
        Object.assign({ id: 'p4', collectionName: 'drivers', driverName: 'Abiria tu' }, driverPost({ userId: 'd4', supportedServices: ['passenger'] })),
        Object.assign({ id: 'p5', collectionName: 'drivers', driverName: 'Lori kubwa' }, driverPost({ userId: 'd5', capacityKg: 50, pickupRegion: 'Dar es Salaam', destinationRegion: 'Dodoma' }))
    ];
    let src = fs.readFileSync(path.join(ROOT, 'js/app/43-delivery-choice.js'), 'utf8');
    src = src.replace(/^import[^\n]*\n/gm, '');
    (0, eval)(src);

    const got = window.skhDeliveryFilterPosts(posts, { pickup: 'Dar es Salaam', destination: 'Dodoma', weightKg: 20 });
    eq('madereva wanaolingana ni 2 (route+capacity)', got.length, 2);
    eq('wamepangwa bei/ufaa: ABC kwanza', got[0].id, 'p1');
    ok('p5 naye yuko', got.some(p => p.id === 'p5'));
    const broad = window.skhDeliveryFilterPosts(posts, { pickup: 'Dar es Salaam', weightKg: 0 });
    ok('mzigo mwepesi: offline/abiria hawatokei', !broad.some(p => ['p3', 'p4'].includes(p.id)));

    /* B) ride kutoka oda */
    const ride = window.skhDeliveryBuildRide('ORD-1', {
        buyerId: 'buyer1', buyerName: 'Asha', sellerId: 's1', itemTitle: 'Mchele', amount: 38000, items: [{ title: 'Mchele', image: 'x' }]
    }, { required: true, logisticPostId: 'p1', logisticProviderId: 'd1', vehicleType: 'Lori', pickupLocation: 'Dar', destination: 'Dodoma', fare: 80000, packageWeightKg: 25 });
    eq('ride.orderId', ride.orderId, 'ORD-1');
    eq('ride.preferredDriverId', ride.preferredDriverId, 'd1');
    eq('ride.preferredPostId', ride.preferredPostId, 'p1');
    eq('ride.productOrder', ride.productOrder, true);
    eq('ride.reqCategory', ride.reqCategory, 'Cargo');
    eq('ride huanza searching', ride.status, 'searching');

    /* C) carriers bandia wamezimwa */
    eq('fallback carriers ni tupu', window.sokohaiCarrierFallbacks.length, 0);
    const cs = await window.loadSokoHaiCarriers();
    eq('loadSokoHaiCarriers haitoi tena bandia', cs.length, 0);

    /* C2) kichaguzi hufungua matangazo HALISI kutoka drivers */
    skh.myCart = [{ id: 'x1', title: 'Mchele', price: 38000, qty: 1, userId: 's1', ownerName: 'Juma', location: 'Dar es Salaam' }];
    skh.getDocs = async (q) => ({ forEach(cb) { posts.forEach((p, i) => cb({ id: p.id, data: () => { const { id, ...rest } = p; return rest; } })); } });
    await window.skhDeliveryOpenPicker();
    const picker = document.getElementById('skhDpickModal');
    eq('kichaguzi kimefunguliwa', picker.style.display, 'flex');
    ok('kadi halisi ya ABC imechorwa kwa TransportPostCard', !!document.getElementById('card_p1'));
    ok('hakuna kadi bandia ya "Moto Delivery"', picker.innerHTML.indexOf('Moto Delivery') === -1);
    picker.style.display = 'none';

    /* D) Cart: checkout bila delivery */
    window.renderSmartCart();
    ok('redio ya Sitahitaji ipo', !!document.querySelector('input[name="skhDcRadio"][value="no"]'));
    ok('redio ya Nahitaji ipo', !!document.querySelector('input[name="skhDcRadio"][value="yes"]'));
    let alerted = ''; window.alert = globalThis.alert = m => { alerted = m; };
    window.finalProceedCheckout();
    ok('proceed inakatawa kabla ya kuchagua', alerted.indexOf('Chagua') !== -1);
    // chagua "sitahitaji"
    window.skhDeliverySetRequired(false);
    window.renderSmartCart();
    window.confirm = () => true;
    await window.confirmSmartCartOrder();
    ok('oda imeandikwa', (added.byCollection.orders || []).length >= 1);
    const orderNoDel = (added.byCollection.orders || [])[0] || {};
    eq('delivery.required=false', orderNoDel.delivery && orderNoDel.delivery.required, false);
    eq('njia self_collection', orderNoDel.delivery && orderNoDel.delivery.method, 'self_collection');
    ok('HAKUNA shipments bandia', !added.byCollection.shipments);
    ok('HAKUNA logistics_assignments bandia', !added.byCollection.logistics_assignments);
    ok('checkout modal imefunguliwa', document.getElementById('checkoutModal').style.display === 'flex');

    /* E) Chaguo la delivery na tangazo halisi */
    document.getElementById('checkoutModal').style.display = 'none';
    skh.myCart = [{ id: 'x2', title: 'Pembejeo', price: 60000, qty: 2, userId: 's2', ownerName: 'Shamba', location: 'Morogoro', weightKg: 40 }];
    // reset choice then select post directly
    window.skhDeliveryReset();
    await window.skhDeliverySelectPost('p1', posts);
    const st = window.skhDeliveryState();
    eq('post imechaguliwa', st.post && st.post.id, 'p1');
    eq('provider amehifadhiwa', st.post.userId, 'd1');
    await window.confirmSmartCartOrder();
    const ordersDel = added.byCollection.orders || [];
    const withDel = ordersDel.filter(o => o.delivery && o.delivery.required);
    ok('oda yenye delivery ipo', withDel.length >= 1);
    const dd = withDel[withDel.length - 1].delivery;
    eq('logisticPostId', dd.logisticPostId, 'p1');
    eq('logisticProviderId', dd.logisticProviderId, 'd1');
    eq('njia selected_listing', dd.method, 'selected_listing');
    ok('pickup inatoka eneo la muuzaji', dd.pickupLocation === 'Morogoro');
    ok('sokopay core imeandikwa', (added.byCollection.sokopay_core_transactions || []).length >= 1);

    /* E2) skhHandleOrderDelivery hupitia server callable */
    let serverCall = null;
    window.skhRoutingServerRouteBooking = async (payload) => { serverCall = payload; return { data: { ok: true, rideId: 'ride_srv_1', offers: 1 } }; };
    const r1 = await window.skhHandleOrderDelivery('ORD-REAL-1', dd, {});
    eq('routing imeenda server', r1.via, 'server');
    eq('server imepata orderId', serverCall.orderId, 'ORD-REAL-1');
    eq('server imepata preferredDriverId', serverCall.preferredDriverId, 'd1');

    /* F) Fallback bila Cloud Functions */
    delete window.skhRoutingServerRouteBooking;
    window.skhDispatchRideToCarriers = async () => { dispatchedFallback = true; };
    let dispatchedFallback = false;
    // getDoc ya kuangilia iliyopo -> haipo
    skh.getDoc = async () => ({ exists: false, data: () => null });
    const r2 = await window.skhHandleOrderDelivery('ORD-REAL-2', dd, { buyerId: 'buyer1', itemTitle: 'Pembejeo' });
    eq('fallback imeunda ride_request', r2.via, 'fallback_ride_request');
    ok('ride_request imeandikwa', (added.byCollection.ride_requests || []).length === 1);
    const rideDoc = added.byCollection.ride_requests[0];
    eq('ride ina orderId', rideDoc.orderId, 'ORD-REAL-2');
    eq('ride ina dereva aliyechaguliwa', rideDoc.preferredDriverId, 'd1');
    ok('dispatch notifications imefanyika', dispatchedFallback);
    const notifs = added.byCollection.notifications || [];
    ok('mtoa usafiri aliyechaguliwa amepata taarifa', notifs.some(n => n.userId === 'd1'));

    /* F1b) Server callable IPO lakini imerusha fnDown (seva haijadeploywa)
       → mteja ASISHINDWE kuomba usafiri; fallback iendelee. */
    added.byCollection.ride_requests = [];
    window.skhRoutingServerRouteBooking = async () => {
        throw Object.assign(new Error('huduma hazipatikani'), { code: 'fnDown', fnDown: true });
    };
    const r2b = await window.skhHandleOrderDelivery('ORD-REAL-2B', dd, { buyerId: 'buyer1', itemTitle: 'Pembejeo' });
    eq('fnDown ya server inaangukia fallback', r2b.via, 'fallback_ride_request');
    ok('ride_request imeandikwa licha ya fnDown', (added.byCollection.ride_requests || []).length === 1);
    delete window.skhRoutingServerRouteBooking;

    /* F2) self-collection haiungi delivery */
    added.byCollection.ride_requests = [];
    const r3 = await window.skhHandleOrderDelivery('ORD-REAL-3', { required: false }, {});
    eq('self collection haiungi', r3.selfCollection, true);
    eq('hakuna ride iliyoundwa', (added.byCollection.ride_requests || []).length, 0);
}

/* ================================================================
   G) SERVER routing-core kwa oda za bidhaa
   ================================================================ */
section('G) Server — oda ya bidhaa → ride → ofa kwa mtoa usafiri');
{
    const db = FakeDb();
    await db.collection('drivers').doc('post1').set(Object.assign({ id: 'post1' }, driverPost({ userId: 'd1', driverName: 'ABC Logistics' })));
    await db.collection('users').doc('d1').set({ uid: 'd1', fullName: 'ABC Logistics' });
    await db.collection('orders').doc('ord1').set({
        kind: 'product', buyerId: 'b1', buyerName: 'Asha', sellerId: 's1',
        itemTitle: 'Mchele Gunia', amount: 38000, currency: 'TZS',
        delivery: {
            required: true, logisticPostId: 'post1', logisticProviderId: 'd1',
            vehicleType: 'Lori', pickupLocation: 'Dar es Salaam', destination: 'Dodoma',
            packageDescription: 'Mchele Gunia', packageWeightKg: 30, fare: 80000
        }
    });
    const res = await core.routeBookingFromOrder(db, 'ord1', { actorId: 'b1', force: true });
    ok('routing imefanikiwa', res.ok === true && res.offers >= 1);
    const offersSnap = await db.collection('delivery_offers').get();
    const offers = []; offersSnap.forEach(o => offers.push(o.data()));
    eq('ofA MOJA kwa mtoa aliyechaguliwa', offers.length, 1);
    eq('ofA inaenda kwa d1', offers[0].agentId, 'd1');
    eq('ofA ni offered', offers[0].status, 'offered');
    const rideSnap = await db.collection('ride_requests').get();
    const rides = []; rideSnap.forEach(r => rides.push(r.data()));
    eq('ride_request imeundwa', rides.length, 1);
    eq('ride ni ya oda ya bidhaa', rides[0].productOrder, true);
    eq('ride imeunganishwa na orderId', rides[0].orderId, 'ord1');
    eq('ride ina post teule', rides[0].preferredPostId, 'post1');
    const ord = (await db.doc('orders/ord1').get()).data();
    ok('order imeunganishwa na ride', !!ord.rideRequestId);
    eq('delivery.status sent_to_logistics', ord.delivery.status, 'sent_to_logistics');

    // Mtoa aliyechaguliwa akikataa → ombi larudi sokoni (productOrder).
    const offerId = offersSnap.docs[0].id;
    await core.declineOffer(db, offerId, 'd1');
    const rideAfter = (await db.collection('ride_requests').doc(rides[0] && ord.rideRequestId).get());
    const rides2 = []; (await db.collection('ride_requests').get()).forEach(r => rides2.push(r.data()));
    const ride2 = rides2[0];
    eq('baada ya kukataa: ride yarudi searching', ride2.status, 'searching');
    eq('preferred ameondolewa', ride2.preferredDriverId, null);
}

section('G2) Server — oda bila delivery hairuhusiwi');
{
    const db = FakeDb();
    await db.collection('orders').doc('ord2').set({ kind: 'product', buyerId: 'b1', delivery: { required: false } });
    let threw = '';
    try { await core.routeBookingFromOrder(db, 'ord2', { force: true }); } catch (e) { threw = String(e.message || e); }
    eq('inakataa oda isiyohitaji delivery', threw, 'not_a_booking');
}

/* ------------------ matokeo ------------------ */
console.log('\n========================================');
console.log('MAJARIBIO DELIVERY CHOICE: ' + pass + ' pass, ' + fail + ' fail');
console.log('========================================');
process.exit(fail ? 1 : 0);

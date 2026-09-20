'use strict';
/* ============================================================
 * SOKOHAI — REQUEST ROUTING ENGINE (Cloud Functions, 2026-09)
 * ============================================================
 * Wiring wa Routing Engine (server-authoritative). Mantiki ya
 * data iko routing-core.js (inayopimika bila Firebase), kanuni za
 * kulinganisha na state machine ziko routing-logic.js.
 *
 * Mlolongo:
 *   Order (booking) → ride_request → wagombea waliostahili
 *   → delivery_offers (mmoja hai, wengine waiting)
 *   → Agent Request Inbox: Accept / Decline / muda kuisha
 *   → mwingine afunguliwe (reassignment) / failed → sokoni
 *
 * Kukubali + Pickup Token iko index.js (deliveryOfferAccept)
 * ili itumie tena custody helpers zilizopo.
 * ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const core = require('./routing-core');
const L = require('./routing-logic');

const REGION = 'europe-west1';
const db = admin.firestore();

function requireAuth(req) {
    if (!req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Ingia kwanza.');
    return req.auth;
}

/* ============================================================
 * CALLABLES
 * ============================================================ */

// Mteja/muuzaji anzisha (au rudia) routing ya booking/order yenye delivery.
// [DELIVERY OPTION 2026-09] Inapokea pia:
//   preferredDriverId — tangazo halisi la usafiri lililochaguliwa na mteja
//   delivery         — snapshot ya chaguo la usafirishaji (njia, post, tarehe)
exports.deliveryRouteBooking = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const orderId = String(data.orderId || '');
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId inahitajika.');
    const os = await db.doc('orders/' + orderId).get();
    if (!os.exists) throw new HttpsError('not-found', 'Order haipatikani.');
    const o = os.data();
    if (o.buyerId !== auth.uid && o.sellerId !== auth.uid) {
        throw new HttpsError('permission-denied', 'Huhusiki na order hii.');
    }

    // [DELIVERY OPTION] Kama mteja amepeleka chaguo, kisha thibitisha tangazo
    // halisi la usafiri na uunganishe order nalo (server-authoritative).
    let preferredDriverId = data.preferredDriverId ? String(data.preferredDriverId) : '';
    if (data.delivery && typeof data.delivery === 'object') {
        const d = data.delivery || {};
        const postId = d.logisticPostId ? String(d.logisticPostId) : '';
        if (postId) {
            const ps = await db.doc('drivers/' + postId).get();
            if (!ps.exists) throw new HttpsError('not-found', 'Tangazo la usafiri halipatikani.');
            const post = ps.data() || {};
            // Tangazo liwe la mtoa usafiri aliyetajwa.
            if (preferredDriverId && post.userId && post.userId !== preferredDriverId) {
                throw new HttpsError('invalid-argument', 'Tangazo na mtoa usafiri havilingani.');
            }
            preferredDriverId = preferredDriverId || String(post.userId || '');
            const safeDelivery = Object.assign({}, (o.delivery || {}), {
                required: true,
                source: 'product_checkout',
                logisticPostId: postId,
                logisticProviderId: preferredDriverId || post.userId || null,
                pickupLocation: String(d.pickupLocation || o.delivery?.pickupLocation || ''),
                destination: String(d.destination || d.destinationLocation || ''),
                vehicleType: String(d.vehicleType || post.vehicleType || ''),
                fare: Number(d.fare || post.price || post.basePrice || 0),
                packageDescription: String(d.packageDescription || o.itemTitle || ''),
                packageQuantity: String(d.packageQuantity || ''),
                packageWeightKg: Number(d.packageWeightKg || 0),
                pickupDate: String(d.pickupDate || ''),
                pickupTime: String(d.pickupTime || ''),
                notes: String(d.notes || ''),
                postSnapshot: {
                    id: postId,
                    driverName: post.driverName || post.company || '',
                    company: post.company || '',
                    vehicleType: post.vehicleType || '',
                    pickupRegion: post.pickupRegion || '',
                    destinationRegion: post.destinationRegion || '',
                    image: post.image || (Array.isArray(post.photos) ? post.photos[0] : '') || '',
                    rating: post.rating || null
                },
                status: 'pending_routing',
                chosenAt: new Date().toISOString()
            });
            await db.doc('orders/' + orderId).update({
                delivery: safeDelivery,
                deliveryRequired: true,
                updatedAt: new Date().toISOString()
            });
        } else if (d.required) {
            // Hakuna mtoa usafiri maalum — ombi la wazi sokoni.
            await db.doc('orders/' + orderId).update({
                delivery: Object.assign({}, (o.delivery || {}), d, { required: true, status: 'pending_routing' }),
                deliveryRequired: true,
                updatedAt: new Date().toISOString()
            }).catch(() => {});
        }
    }

    return core.routeBookingFromOrder(db, orderId, {
        actorId: auth.uid,
        force: true,
        preferredDriverId: preferredDriverId || null
    });
});

// Wakala akatae ofa.
exports.deliveryOfferDecline = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const offerId = String((req.data || {}).offerId || '');
    if (!offerId) throw new HttpsError('invalid-argument', 'offerId inahitajika.');
    try {
        return await core.declineOffer(db, offerId, auth.uid);
    } catch (e) {
        throw mapError(e);
    }
});

// Lazy expiry: mteja/agent akiinua inbox au ufuatiliaji, safisha zilizoisha.
exports.deliveryRouteSweep = onCall({ region: REGION }, async (req) => {
    requireAuth(req);
    const data = req.data || {};
    if (data.rideId) return core.sweepRide(db, String(data.rideId));
    // Bila rideId: safisha safari za ofa ZA MGOMBEAJI huyu aliye bado active.
    const uid = req.auth.uid;
    const mine = await db.collection('delivery_offers')
        .where('agentId', '==', uid).where('status', '==', L.OFFER.OFFERED).limit(20).get();
    const ids = new Set();
    mine.forEach(d => ids.add(d.data().rideId));
    const results = [];
    for (const rideId of ids) {
        try { results.push(await core.sweepRide(db, rideId)); } catch (e) { /* ruhusa/haipo */ }
    }
    return { ok: true, swept: ids.size, results: results };
});

// Rudia routing baada ya failed_assignment (mteja pekee).
exports.deliveryRouteRetry = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const rideId = String((req.data || {}).rideId || '');
    if (!rideId) throw new HttpsError('invalid-argument', 'rideId inahitajika.');
    const rs = await db.doc('ride_requests/' + rideId).get();
    if (!rs.exists) throw new HttpsError('not-found', 'Safari haipatikani.');
    const rd = rs.data();
    if (rd.customerId !== auth.uid) throw new HttpsError('permission-denied', 'Si ombi lako.');
    if (rd.driverId || rd.assignmentStatus === 'assigned') {
        throw new HttpsError('failed-precondition', 'Ombi tayari lina msafirishaji.');
    }
    const orderId = rd.orderId;
    if (!orderId) throw new HttpsError('failed-precondition', 'Order halijulikani; tangaza upya ombi.');
    return core.routeBookingFromOrder(db, orderId, {
        actorId: auth.uid, round: Number(rd.routingRound || 1) + 1, force: true
    });
});

/* ---- makosa ya core (strings) → HttpsError zenye kanuni ---- */
function mapError(e) {
    const m = String((e && e.message) || e || '');
    const code = ({
        offer_not_found: 'not-found',
        not_your_offer: 'permission-denied',
        offer_not_active: 'failed-precondition',
        offer_expired: 'failed-precondition',
        ride_already_assigned: 'failed-precondition'
    })[m] || 'internal';
    return new HttpsError(code, m);
}

/* ---- exports kwa ajili ya majaribio / kuunganisha tena ---- */
exports._logic = L;
exports._core = core;

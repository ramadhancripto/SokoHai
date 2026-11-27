'use strict';
const { logBestEffort } = require('./errors'); // [SRV-10] best-effort steps leave a structured trace
/* ============================================================
 * SOKOHAI — REQUEST ROUTING CORE (2026-09)
 * ============================================================
 * Sehemu ya data ya Routing Engine isiyotegemea Firebase Admin:
 * kila function inapokea `db` (Admin Firestore AU bandia wa
 * majaribio), ili mlolongo mzima uweze kupimwa kwa Node tupu.
 *
 *   Order → ride_request → wagombea (routing-logic)
 *        → delivery_offers (mmoja hai, wengine waiting)
 *        → accept/decline/expiry → reassignment/failed
 *
 * Wiring ya Cloud Functions iko routing.js; kanuni za kulinganisha
 * na state machine ziko routing-logic.js.
 * ============================================================ */

const L = require('./routing-logic');
const DEST = require('./shared/delivery-destination-core'); // [PART 5B-3] kigezo kimoja cha destination (shared/)

function nowIso() { return new Date().toISOString(); }

/* ------------------ matukio / arifa (kupitia db waliopewa) ------------------ */

async function routingEvent(myDb, rideId, event, actorId, extra) {
    try {
        await myDb.collection('delivery_events').add(Object.assign({
            deliveryId: rideId,
            event: event,
            actorId: actorId || 'system',
            timestamp: nowIso()
        }, extra || {}));
    } catch (e) { logBestEffort('routing-core:31', e); /* matukio hayapaswi kuvuruga routing */ }
}

async function notify(myDb, userId, title, body, rideId) {
    if (!userId) return;
    try {
        await myDb.collection('notifications').add({
            userId: userId,
            title: title,
            body: body,
            createdAt: nowIso(),
            read: false,
            type: 'delivery_offer',
            rideId: rideId || null
        });
    } catch (e) { logBestEffort('routing-core:46', e); /* si muhimu */ }
}

/* ------------------ kusanya wagombeaji ------------------ */

async function collectCandidates(myDb) {
    const out = [];
    try {
        const ds = await myDb.collection('drivers').limit(400).get();
        ds.forEach(function (d) {
            const x = d.data() || {};
            if (!x.userId) return;
            /* [PART 5B-2] chujio la haraka kwa tangazo lenyewe (bila read ya ziada);
               hali kamili ya akaunti (users/{uid}) hukaguliwa kabla ya ofa. */
            if (L.accountProblem(Object.assign({ kind: 'driver' }, x))) return;
            out.push(Object.assign({ id: d.id, uid: x.userId, kind: 'driver' }, x));
        });
    } catch (e) { logBestEffort('routing-core:60', e); /* endelea na agents */ }
    try {
        const as = await myDb.collection('agents').where('status', '==', 'approved').limit(200).get();
        as.forEach(function (d) {
            const x = d.data() || {};
            if (!x.userId) return;
            out.push(Object.assign({
                id: d.id, uid: x.userId,
                name: x.fullName || x.businessName || 'Wakala',
                rating: x.rating || 0,
                location: x.location || x.region || '',
                online: x.online !== false
            }, x, { kind: 'agent' }));
        });
    } catch (e) { logBestEffort('routing-core:74', e); /* hakuna agents */ }
    return out;
}

/* ------------------ tengeneza/unganisha safari kutoka order ------------------ */

// [DELIVERY CONTRACT 2026-09] Manifest snapshot. Product/order remains the
// authority; this is only the immutable transport view of the order items.
// Never trust a client-supplied cargo description as the item identity.
function cargoManifestFromOrder(order, orderId, delivery) {
    order = order || {};
    delivery = delivery || order.delivery || {};
    const raw = Array.isArray(order.items) && order.items.length ? order.items : [{}];
    const items = raw.map(function (item, index) {
        item = item || {};
        const quantity = Math.max(1, Number(item.quantity || item.qty || (index === 0 ? order.quantity : 1) || 1));
        return {
            orderItemId: String(item.orderItemId || item.itemId || item.id || ('item_' + index)),
            productId: item.productId || item.productRef || order.productId || null,
            variantId: item.variantId || item.variant || null,
            titleSnapshot: String(item.title || item.name || (index === 0 ? order.itemTitle : '') || 'Mzigo wa oda').slice(0, 180),
            quantity: quantity,
            packageCount: Math.max(1, Number(item.packageCount || (index === 0 ? delivery.packageCount : 1) || 1)),
            category: String(item.category || order.category || delivery.reqCategory || 'product').slice(0, 60)
        };
    });
    return {
        source: 'order',
        orderId: orderId,
        shipmentId: order.shipmentId || delivery.shipmentId || null,
        items: items,
        packageCount: Math.max(1, Number(delivery.packageCount || items.reduce(function (n, i) { return n + i.packageCount; }, 0) || 1)),
        declaredWeightKg: Number(delivery.packageWeightKg || order.cargoWeight || order.weight || 0) || null,
        category: String(delivery.reqCategory || order.reqCategory || 'product').slice(0, 60),
        verifiedPickupCount: null
    };
}

// [DELIVERY OPTION 2026-09] Oda za BIDHAA zenye delivery.required = true
// huungana na mfumo huohuo wa ride_request → delivery_offers → Request
// Inbox. Hakuna mkusanyiko mpya wa bandia: oda inabeba snapshot ya
// tangazo HALISI la usafiri (drivers/{postId}) lililochaguliwa na mteja.
function rideFromProductOrder(order, orderId, destinationValue) {
    const d = order.delivery || {};
    const firstItem = (Array.isArray(order.items) && order.items[0]) || {};
    const cargoName = order.itemTitle || firstItem.title || d.packageDescription || 'Mzigo wa oda';
    return {
        customerId: order.buyerId,
        buyerId: order.buyerId || null,
        sellerId: order.sellerId || null,
        customerName: order.buyerName || 'Mteja',
        customerPhone: d.customerPhone || '',
        reqCategory: d.reqCategory || 'Cargo',
        vehicleType: d.vehicleType || '',
        fromLocation: d.pickupLocation || order.sellerLocation || order.fromLocation || '',
        toLocation: destinationValue || d.destination || d.destinationLocation || '', // [PART 5B-3]
        cargoName: cargoName,
        cargoDescription: d.packageDescription || order.itemTitle || cargoName,
        cargoImage: order.itemImg || d.cargoImage || firstItem.image || '',
        cargoPrice: Number(order.amount || 0),
        fare: Number(d.fare || 0),
        cargoWeight: Number(d.packageWeightKg || 0),
        cargoSize: d.packageQuantity || '',
        cargoManifest: cargoManifestFromOrder(order, orderId, d),
        requestedByUid: order.deliveryRequestedByUid || order.requestedByUid || order.buyerId || null,
        requestedByRole: order.deliveryRequestedByRole || order.requestedByRole || 'buyer',
        pickupDate: d.pickupDate || '',
        pickupTime: d.pickupTime || '',
        specialRequirements: d.notes || '',
        // Viungo vya mlolongo: Order → Delivery → Tangazo halisi → Mtoa huduma
        orderId: orderId,
        negotiationId: order.negotiationId || null,
        source: 'product_checkout',
        productOrder: true,
        sellerId: order.sellerId || null,
        preferredDriverId: d.logisticProviderId || d.preferredDriverId || null,
        preferredPostId: d.logisticPostId || null,
        // Pipeline ya Awamu E (hali ya mwanzo safi).
        status: 'searching',
        routingStatus: 'routing',
        assignmentStatus: 'seeking',
        routingRound: 1,
        offersCount: 0,
        activeOfferId: null,
        pickupToken: null, pickupTokenStatus: 'unissued',
        handoverToken: null, handoverTokenStatus: 'unissued',
        transferTokenStatus: 'unissued',
        createdAt: nowIso()
    };
}

// [REMEDIATION 2026-11 R1] Customer contact never sits on the ride document
// that open-board transporters can read; it goes to ride_requests/{id}/private/contact
// (rules: customer, assigned driver/custodian/next transporter, admin).
const RIDE_PRIVATE_KEYS = ['customerName', 'customerPhone', 'customerEmail', 'receiverName', 'receiverPhone'];
function splitRidePrivate(ride) {
    const pub = {}, priv = {};
    Object.keys(ride || {}).forEach(function (k) {
        if (RIDE_PRIVATE_KEYS.indexOf(k) >= 0) { if (ride[k] != null && ride[k] !== '') priv[k] = String(ride[k]); }
        else pub[k] = ride[k];
    });
    return { pub: pub, priv: priv };
}
async function writeRideSplit(myDb, ref, ride) {
    const parts = splitRidePrivate(ride);
    const privRef = myDb.doc('ride_requests/' + ref.id + '/private/contact');
    const hasPriv = Object.keys(parts.priv).length > 0;
    const privData = Object.assign({ customerId: parts.pub.customerId || '' }, parts.priv);
    if (typeof myDb.batch === 'function') {
        const b = myDb.batch();
        b.set(ref, parts.pub);
        if (hasPriv) b.set(privRef, privData);
        await b.commit();
    } else {
        await ref.set(parts.pub);
        if (hasPriv) await privRef.set(privData);
    }
    return parts.pub;
}
/* Server-side reader: ride data merged with its private contact. */
async function rideWithContact(myDb, rideId, rd) {
    try {
        const s = await myDb.doc('ride_requests/' + rideId + '/private/contact').get();
        return Object.assign({}, rd || {}, s.exists ? (s.data() || {}) : {});
    } catch (_) { return Object.assign({}, rd || {}); }
}

/* ============================================================
 * [PART 5B-3 2026-11-25] DESTINATION INTEGRITY (server-authoritative)
 * ------------------------------------------------------------
 * Ombi la usafiri LISILO na anwani ya kufikishiwa halitengenezi
 * ride_request wala delivery_offers. Kigezo ni kimoja (shared/
 * delivery-destination-core.js) kinachotumika pia na kivinjari.
 *
 * Kipaumbele cha sehemu ni kile kile kilichokuwepo (hakuna mabadiliko
 * ya tabia kwa data halali):
 *   delivery.destination → delivery.destinationLocation →
 *   route.to → toLocation
 * Tofauti moja pekee: sehemu TUPU ('' au pengine tupu) hurukwa; haijazibwa
 * kwa ORIGIN wala kwa thamani ya kubuni.
 * ============================================================ */
function needsDestination(order) {
    if (!order || typeof order !== 'object') return false;
    if (order.kind === 'booking') return true;                 // booking ya usafiri
    return !!(order.delivery && order.delivery.required === true); // oda ya bidhaa yenye usafiri
}

function destinationCheck(order) {
    const o = order || {};
    const d = o.delivery || {};
    const route = o.route || {};
    return DEST.firstValid([d.destination, d.destinationLocation, route.to, o.toLocation]);
}

/* Hurtupa Error('invalid_destination') — routing.js huipanga kuwa
 * HttpsError('invalid-argument') kupitia mapError(). */
function requireDestination(order) {
    if (!needsDestination(order)) return null;
    const res = destinationCheck(order);
    if (res.ok) return res;
    const err = new Error('invalid_destination');
    err.destinationReason = res.reason;
    throw err;
}

async function ensureRideForOrder(myDb, order, orderId, opts) {
    opts = opts || {};
    const existingId = order.rideRequestId || order.deliveryId || null;
    if (existingId) {
        const s = await myDb.doc('ride_requests/' + existingId).get();
        if (s.exists) return { ref: s.ref || myDb.doc('ride_requests/' + existingId), data: s.data(), created: false, id: existingId };
    }
    /* [PART 5B-3] Kigezo cha mwisho KABLA ya kuunda hati yoyote: ombi lisilo na
       anwani halali halitengenezi ride wala ofa (hakuna ride nusu-tayari). */
    const destination = requireDestination(order);
    const ref = myDb.collection('ride_requests').doc();

    // [DELIVERY OPTION] Oda za bidhaa (sio booking ya majadiliano) zinahitaji
    // delivery.required; bila ya hapo hakuna safari inayoundwa.
    if (order.kind !== 'booking') {
        const d = order.delivery || {};
        if (!d.required) throw new Error('not_a_booking');
        const ride = rideFromProductOrder(order, orderId, destination && destination.value);
        if (opts.preferredDriverId) ride.preferredDriverId = String(opts.preferredDriverId);
        const pub1 = await writeRideSplit(myDb, ref, ride);
        return { ref: ref, data: pub1, created: true, id: ref.id };
    }

    const route = order.route || {};
    const cargoName = order.itemTitle || order.packageDescription || 'Mzigo';
    const ride = {
        customerId: order.buyerId,
        buyerId: order.buyerId || null,
        sellerId: order.sellerId || null,
        customerName: order.buyerName || 'Mteja',
        customerPhone: order.buyerPhone || '',
        reqCategory: order.reqCategory || 'Cargo',
        vehicleType: order.vehicleType || '',
        fromLocation: route.from || order.fromLocation || '',
        // [PART 5B-3] thamani iliyothibitishwa (trimmed / label ya eneo)
        toLocation: (destination && destination.value) || '',
        cargoName: cargoName,
        cargoDescription: order.packageDescription || '',
        cargoImage: order.image || '',
        cargoPrice: Number(order.fare || order.amount || 0),
        fare: Number(order.fare || order.amount || 0),
        cargoWeight: Number(order.cargoWeight || order.weight || 0),
        cargoSize: order.packageQuantity || '',
        cargoManifest: cargoManifestFromOrder(order, orderId, order.delivery || {}),
        requestedByUid: order.deliveryRequestedByUid || order.requestedByUid || order.buyerId || null,
        requestedByRole: order.deliveryRequestedByRole || order.requestedByRole || 'buyer',
        pickupDate: order.pickupDate || '',
        pickupTime: order.pickupTime || '',
        specialRequirements: order.specialRequirements || '',
        // Viungo vya mlolongo: Order → Transport/Delivery → Parcel → Mshika → Tukio
        orderId: orderId,
        negotiationId: order.negotiationId || null,
        source: 'booking_router',
        status: 'searching',
        routingStatus: 'routing',
        assignmentStatus: 'seeking',
        routingRound: 1,
        offersCount: 0,
        activeOfferId: null,
        // Sehemu za custody (haziandikwi na browser) — mwanzo safi.
        pickupToken: null, pickupTokenStatus: 'unissued',
        handoverToken: null, handoverTokenStatus: 'unissued',
        transferTokenStatus: 'unissued',
        createdAt: nowIso()
    };
    const pub2 = await writeRideSplit(myDb, ref, ride);
    return { ref: ref, data: pub2, created: true, id: ref.id };
}

/* [DELIVERY OPTION] Mteja akichagua tangazo halisi la usafiri, thibitisha
 * kuwa mtoa huduma huyo yupo na (ikibidi) pata jina lake kutoka tangazo. */
async function preferredCandidateFor(myDb, uid, order) {
    if (!uid) return null;
    let name = 'Msafirishaji';
    let post = null;
    let account = null;   // [PART 5B-2] hali ya akaunti ya msafirishaji aliyeteuliwa
    try {
        const u = await myDb.doc('users/' + uid).get();
        if (u.exists) {
            const ud = u.data() || {};
            account = ud;
            name = ud.fullName || ud.displayName || ud.businessName || ud.shopName || name;
        }
    } catch (e) { logBestEffort('routing-core:278', e); /* endelea */ }
    const postId = (order.delivery && order.delivery.logisticPostId) || null;
    if (postId) {
        try {
            const ps = await myDb.doc('drivers/' + postId).get();
            if (ps.exists) {
                post = ps.data() || {};
                // Tangazo lazima liwe la mtoa huduma huyo — USIMKABIDHI mtu mwingine.
                if (post.userId && post.userId !== uid) return null;
                name = post.driverName || post.company || post.ownerName || name;
            } else {
                post = null;
            }
        } catch (e) { post = null; }
    }
    return {
        uid: uid,
        id: postId || ('driver_' + uid),
        kind: 'driver',
        name: name,
        driverName: name,
        rating: post ? (post.rating || 0) : 0,
        /* [PART 5B-2] chombo/uwezo/huduma za tangazo — zinahitajika ili
           kigezo cha lazima (T-03) kiweze kupimwa kwa uteuzi wa mteja pia. */
        vehicleType: post ? (post.vehicleType || '') : '',
        maxWeight: post ? (post.maxWeight || post.capacity || '') : '',
        supportedServices: post ? (post.supportedServices || []) : [],
        online: post && post.online === false ? false : true,
        // Hali halisi za akaunti (kama zipo) — kigezo cha lazima kinazipima.
        accountStatus: account ? account.accountStatus : undefined,
        suspended: account ? (account.suspended === true || account.isSuspended === true) : false,
        banned: account ? account.banned === true : false,
        agentStatus: account ? account.agentStatus : undefined
    };
}

/* ------------------ core: peleka booking kwa wagombeaji ------------------ */

async function routeBookingFromOrder(myDb, orderId, opts) {
    opts = opts || {};
    if (!myDb) throw new Error('db_required');
    if (!orderId) throw new Error('orderId_required');

    const os = await myDb.doc('orders/' + orderId).get();
    if (!os.exists) throw new Error('order_not_found');
    const order = os.data();
    /* [PART 5B-3] Anwani ya kufikishiwa ni sharti la SERVER (haitegemei client). */
    requireDestination(order);
    const delivery = order.delivery || {};
    // ensureRideForOrder ndiyo inayokataa oda isiyokuwa booking/yenye delivery.
    const preferredUid = String(opts.preferredDriverId || delivery.logisticProviderId || delivery.preferredDriverId || '');
    let preferredCandidate = null;
    if (preferredUid) {
        preferredCandidate = await preferredCandidateFor(myDb, preferredUid, order);
    }

    const ens = await ensureRideForOrder(myDb, order, orderId, { preferredDriverId: preferredUid });
    const rideRef = ens.ref;
    const ride = ens.data;
    const created = ens.created;
    // Tayari imegawiwa? Idempotent.
    if (!created && (ride.assignmentStatus === 'assigned' || ride.driverId)) {
        return { ok: true, idempotent: true, rideId: rideRef.id, assigned: true };
    }

    const req = {
        from: ride.fromLocation,
        to: ride.toLocation,
        category: ride.reqCategory,
        vehicleType: ride.vehicleType,
        weight: ride.cargoWeight || 0,
        excludeUid: order.buyerId
    };

    let chosen = [];
    let preferredRejected = null;
    if (preferredCandidate) {
        /* [PART 5B-2 2026-11-25] Uteuzi wa mteja haupiti sifa za LAZIMA:
           dereva aliyesimamishwa, chombo kisicholingana au uwezo mdogo
           HAPEWI ofa; ombi linaendelea kwa orodha ya kawaida (fallback halali)
           na sababu inaandikwa kwenye ride kwa uchunguzi. */
        const gate = L.eligibility(preferredCandidate, req);
        if (gate.ok) {
            // Mteja amechagua tangazo HALISI la mtoa usafiri — ofa ya moja kwa
            // moja huenda kwake (bado hupitia delivery_offers/Request Inbox).
            chosen = [Object.assign({ rank: 0, _m: { score: 100, exact: true } }, preferredCandidate)];
        } else {
            preferredRejected = gate.reason;
            preferredCandidate = null;
        }
    }
    if (!chosen.length) {
        const candidates = await collectCandidates(myDb);
        const ranked = L.rankCandidates(candidates, req);
        chosen = ranked.chosen || [];
    }
    /* [PART 5B-2] Kagua hali halisi ya akaunti kabla ya kuunda ofa. */
    const beforeAccounts = chosen.length;
    chosen = await dropInactiveAccounts(myDb, chosen);
    const accountsRejected = beforeAccounts - chosen.length;

    const now = Date.now();
    const round = Number(opts.round || ride.routingRound || 1);

    const batch = myDb.batch();
    // Funga ofa za mzunguko wa nyuma kama bado zilikuwa wazi (retry).
    if (round > 1 || opts.force) {
        const old = await myDb.collection('delivery_offers').where('rideId', '==', rideRef.id).get();
        old.forEach(function (d) {
            const st = (d.data() || {}).status;
            if ([L.OFFER.WAITING, L.OFFER.OFFERED].indexOf(st) !== -1) {
                batch.update(d.ref, { status: L.OFFER.CANCELLED, cancelledAt: nowIso(), cancelReason: 'new_round' });
            }
        });
    }

    let activeId = null;
    chosen.forEach(function (c, i) {
        const isFirst = i === 0;
        const offer = {
            rideId: rideRef.id,
            orderId: orderId,
            customerId: order.buyerId,
            agentId: c.uid,
            agentName: c.name || c.driverName || c.title || c.fullName || 'Msafirishaji',
            agentKind: c.kind === 'agent' ? 'agent' : 'driver',
            rank: i,
            round: round,
            score: Math.round((c._m && c._m.score) || 0),
            exact: !!(c._m && c._m.exact),
            status: isFirst ? L.OFFER.OFFERED : L.OFFER.WAITING,
            // Snapshot isiyobadilika ya ombi (kadi ya inbox isitegemee order/ride).
            cargoName: ride.cargoName,
            cargoDescription: ride.cargoDescription,
            fromLocation: ride.fromLocation,
            toLocation: ride.toLocation,
            pickupDate: ride.pickupDate,
            pickupTime: ride.pickupTime,
            vehicleType: ride.vehicleType,
            fare: ride.fare,
            currency: order.currency || 'TZS',
            requirements: ride.specialRequirements || '',
            weight: ride.cargoWeight || 0,
            cargoManifest: ride.cargoManifest || null,
            shipmentId: ride.cargoManifest && ride.cargoManifest.shipmentId || order.shipmentId || null,
            requestedByUid: ride.requestedByUid || order.buyerId || null,
            requestedByRole: ride.requestedByRole || 'buyer',
            // Preserve the existing offer visibility contract (buyer + carrier).
            participants: [order.buyerId, c.uid],
            deliveryParticipants: [order.buyerId, order.sellerId, c.uid].filter(Boolean),
            createdAt: nowIso()
        };
        if (isFirst) {
            offer.offeredAt = nowIso();
            offer.expiresAt = new Date(now + L.OFFER_TTL_MS).toISOString();
            activeId = rideRef.id + '_' + c.uid;
        }
        batch.set(myDb.collection('delivery_offers').doc(rideRef.id + '_' + c.uid), offer);
    });

    const matched = chosen.length > 0;
    const ridePatch = {
        routingStatus: matched ? 'routing' : 'no_match',
        assignmentStatus: matched ? 'seeking' : 'failed_assignment',
        routingRound: round,
        offersCount: chosen.length,
        activeOfferId: activeId,
        routingMatchedAt: nowIso(),
        status: ride.status || 'searching'
    };
    if (matched) ridePatch.dispatchedAt = ride.dispatchedAt || nowIso();
    if (preferredRejected) ridePatch.preferredRejectedReason = preferredRejected; // [PART 5B-2] uchunguzi
    if (accountsRejected > 0) ridePatch.accountsRejectedCount = accountsRejected; // [PART 5B-2] uchunguzi
    batch.update(rideRef, ridePatch);
    // Unganisha order ↔ safari (bila kugusa sehemu za malipo).
    const orderPatch = {
        rideRequestId: rideRef.id,
        deliveryId: rideRef.id,
        routingStatus: matched ? 'routing' : 'no_match',
        routingRound: round,
        updatedAt: nowIso()
    };
    // Kwa oda za bidhaa, kweka hadhi ya delivery na mhusika aliyechaguliwa.
    if (order.kind !== 'booking' || order.delivery) {
        orderPatch['delivery.deliveryRequestId'] = rideRef.id;
        orderPatch['delivery.status'] = matched ? 'sent_to_logistics' : 'marketplace';
        orderPatch['delivery.routingStatus'] = matched ? 'routing' : 'no_match';
        if (preferredUid) {
            orderPatch['delivery.logisticProviderId'] = preferredUid;
            orderPatch['delivery.preferredDriverId'] = preferredUid;
        }
    }
    batch.update(os.ref, orderPatch);
    await batch.commit();

    await routingEvent(myDb, rideRef.id, matched ? 'ROUTING_OFFERS_CREATED' : 'ROUTING_NO_MATCH',
        opts.actorId || 'system', { round: round, offers: chosen.length });

    if (matched) {
        const first = chosen[0];
        await notify(myDb, first.uid, 'NEW REQUEST — Ombi Jipya la Usafiri',
            ride.cargoName + ' · ' + ride.fromLocation + ' → ' + ride.toLocation
            + (ride.fare ? ' · TSh ' + Number(ride.fare).toLocaleString() : '')
            + '. Fungua Request Inbox: View / Accept / Decline.', rideRef.id);
        if (chosen.length > 1) {
            await notify(myDb, order.buyerId, 'Ombi Limepelekwa kwa Mawakala',
                'Mfumo umewachambua mawakala/madereva ' + chosen.length
                + ' wanaofaa route yako. Ukikosa wa kwanza, ombi litaenda kwa mwingine kiotomatiki.',
                rideRef.id);
        }
    } else {
        // Hakuna wa moja kwa moja — ombi linabali kwenye soko la jumla (marketplace).
        await notify(myDb, order.buyerId, 'Ombi Limewekwa Sokoni',
            'Hatujapata wakala/dereva wa route hiyo kwa sasa. Ombi linaonekana kwenye Requests Marketplace; '
            + 'unaweza kulirudisha kwenye Routing baadaye.', rideRef.id);
    }

    return {
        ok: true, rideId: rideRef.id, offers: chosen.length,
        matched: matched,
        agents: chosen.filter(c => c.kind === 'agent').length,
        drivers: chosen.filter(c => c.kind !== 'agent').length
    };
}

/* ------------------ ofa za safari ------------------ */

/* [PART 5B-2 2026-11-25] Hali ya akaunti iko kwenye users/{uid}, si kwenye
 * tangazo la chombo. Kwa hiyo kabla ya kuunda ofa, hali halisi ya akaunti ya
 * kila mgombeaji aliyechaguliwa inasomwa (read ndogo: <= MAX_OFFERS_PER_ROUND)
 * na aliyesimamishwa/kuzimwa HATENGWI. Bila hii, dereva aliyesimamishwa
 * kupitia users/{uid}.suspended bado alipokea ofa (T-03). */
async function dropInactiveAccounts(myDb, list) {
    if (!list || !list.length) return [];
    const checks = await Promise.all(list.map(async function (c) {
        try {
            const u = await myDb.doc('users/' + c.uid).get();
            const ud = (u && u.exists) ? (u.data() || {}) : null;
            if (!ud) return { c: c, blocked: null };
            const merged = Object.assign({}, c, {
                accountStatus: ud.accountStatus !== undefined ? ud.accountStatus : c.accountStatus,
                suspended: ud.suspended !== undefined ? ud.suspended : c.suspended,
                isSuspended: ud.isSuspended !== undefined ? ud.isSuspended : c.isSuspended,
                banned: ud.banned !== undefined ? ud.banned : c.banned,
                agentStatus: ud.agentStatus !== undefined ? ud.agentStatus : c.agentStatus,
                status: c.status   // hali ya tangazo (available) haichukui nafasi ya akaunti
            });
            return { c: c, blocked: L.accountProblem(merged) };
        } catch (e) { logBestEffort('routing-core:account', e); return { c: c, blocked: null }; }
    }));
    return checks.filter(x => !x.blocked).map(x => x.c);
}

async function rideOffers(myDb, rideId) {
    const snap = await myDb.collection('delivery_offers').where('rideId', '==', rideId).get();
    const out = [];
    snap.forEach(d => out.push(Object.assign({ id: d.id, ref: d.ref }, d.data())));
    out.sort((a, b) => (a.rank || 0) - (b.rank || 0));
    return out;
}

async function applyTransition(myDb, rideId, tr) {
    const batch = myDb.batch();
    Object.keys(tr.updates || {}).forEach(function (oid) {
        batch.update(myDb.collection('delivery_offers').doc(oid), tr.updates[oid]);
    });
    if (tr.ridePatch) batch.update(myDb.doc('ride_requests/' + rideId), tr.ridePatch);
    return batch.commit();
}

/* [DELIVERY OPTION] Ombi la oda ya bidhaa likishindikana kwa mtoa
 * aliyechaguliwa, liwekwe wazi sokoni (madereva wengine wanaliona kwenye
 * Marketplace ya kazi) badala ya kufia kwenye failed_assignment. */
async function exposeProductRideToMarketplace(myDb, rideId) {
    try {
        const ref = myDb.doc('ride_requests/' + rideId);
        await myDb.runTransaction(async (t) => {
            const rs = await t.get(ref);
            if (!rs.exists) return;
            const rd = rs.data() || {};
            if (!rd.productOrder || rd.status !== 'searching' || rd.driverId || rd.assignmentStatus !== 'failed_assignment') return;
            t.update(ref, { routingStatus: 'marketplace', preferredDriverId: null, activeOfferId: null });
        });
    } catch (e) { logBestEffort('routing-core:504', e); /* best effort; never revive closed rides */ }
}

// Offer changes must contend with acceptance and cancellation on the same ride.
async function transitionRideOffers(myDb, rideId, action) {
    let result = { tr: null, offers: [] };
    await myDb.runTransaction(async (t) => {
        const ref = myDb.doc('ride_requests/' + rideId);
        const rs = await t.get(ref);
        if (!rs.exists) throw new Error('ride_not_found');
        const rd = rs.data() || {};
        // [PILOT-OPS C1 2026-11-20] Open states are the same as firestore.rules rideOpenStates()
        // ('pending' / 'open' are legacy open rides that still carry routing offers).
        const OPEN = ['searching', 'pending_acceptance', 'pending', 'open'];
        if (!OPEN.includes(rd.status) || rd.assignmentStatus === 'assigned' || (rd.driverId && rd.acceptedAt)) {
            if (action.type === 'decline') throw new Error('offer_not_active');
            // A closed / assigned ride is never revived, but its EXPIRED 'offered' offers must not stay
            // live in an agent's inbox forever: mark only those as expired (ride document untouched).
            if (action.type === 'sweep') {
                const nowMs = Date.now(), nowIso = new Date(nowMs).toISOString(), updates = {};
                const closed = await t.get(myDb.collection('delivery_offers').where('rideId', '==', rideId));
                closed.forEach(d => { const o = d.data() || {}; const exp = Date.parse(o.expiresAt || '');
                    if (o.status === L.OFFER.OFFERED && exp && exp <= nowMs) updates[d.id] = { status: L.OFFER.EXPIRED, expiredAt: nowIso }; });
                Object.keys(updates).forEach(oid => t.update(myDb.collection('delivery_offers').doc(oid), updates[oid]));
                result = { tr: Object.keys(updates).length ? { updates, notify: [], ridePatch: null } : null, offers: [] }; return;
            }
            result = { tr: null, offers: [] }; return;
        }
        const snap = await t.get(myDb.collection('delivery_offers').where('rideId', '==', rideId));
        const offers = [];
        snap.forEach(d => offers.push(Object.assign({ id: d.id }, d.data())));
        if (!offers.length) { result = { tr: null, offers }; return; }
        const tr = L.transitionOffers(offers, action);
        Object.keys(tr.updates || {}).forEach(oid => t.update(myDb.collection('delivery_offers').doc(oid), tr.updates[oid]));
        if (tr.ridePatch) t.update(ref, tr.ridePatch);
        result = { tr, offers };
    });
    return result;
}

/* ------------------ Decline → mfungue mwingine ------------------ */

async function declineOffer(myDb, offerId, agentId) {
    const os = await myDb.collection('delivery_offers').doc(offerId).get();
    if (!os.exists) throw new Error('offer_not_found');
    const offer = os.data();
    if (offer.agentId !== agentId) throw new Error('not_your_offer');

    const transition = await transitionRideOffers(myDb, offer.rideId, { type: 'decline', offerId: offerId, agentId: agentId });
    const tr = transition.tr;
    if (!tr) throw new Error('offer_not_active');
    await routingEvent(myDb, offer.rideId, 'OFFER_DECLINED', agentId, {
        offerId: offerId, agentName: offer.agentName || ''
    });
    if (tr.ridePatch && tr.ridePatch.assignmentStatus === 'failed_assignment') {
        await exposeProductRideToMarketplace(myDb, offer.rideId);
        await notify(myDb, offer.customerId, 'Wote Wamekosa/Kataa — Ombi Sokoni',
            'Hakuna wakala aliyejibu ombi lako katika mzunguko huu. Ombi linarudi sokoni; rudisha routing ukipenda.',
            offer.rideId);
        await routingEvent(myDb, offer.rideId, 'ROUTING_FAILED', 'system', { reason: 'all_declined_or_expired' });
    }
    tr.notify.forEach(function (uid) {
        notify(myDb, uid, 'NEW REQUEST — Nafasi Yako',
            offer.cargoName + ' · ' + offer.fromLocation + ' → ' + offer.toLocation
            + '. Fungua Request Inbox kukubali.', offer.rideId);
    });
    return { ok: true, rideId: offer.rideId, next: tr.notify.length > 0 };
}

/* ------------------ Sweep: muda kuisha → mwingine ------------------ */

async function sweepRide(myDb, rideId) {
    const transition = await transitionRideOffers(myDb, rideId, { type: 'sweep' });
    const offers = transition.offers, tr = transition.tr;
    if (!tr) return { ok: true, changed: false };
    const changed = Object.keys(tr.updates).length > 0;
    if (changed) {
        await routingEvent(myDb, rideId, 'OFFERS_SWEEP', 'system', { changed: Object.keys(tr.updates).length });
        tr.notify.forEach(function (uid) {
            const of = offers.find(o => o.agentId === uid) || {};
            notify(myDb, uid, 'NEW REQUEST — Nafasi Yako',
                (of.cargoName || 'Mzigo') + ' · ' + (of.fromLocation || '') + ' → ' + (of.toLocation || '')
                + '. Fungua Request Inbox kukubali.', rideId);
        });
        if (tr.ridePatch && tr.ridePatch.assignmentStatus === 'failed_assignment') {
            await exposeProductRideToMarketplace(myDb, rideId);
            const first = offers[0] || {};
            if (first.customerId) {
                await notify(myDb, first.customerId, 'Muda wa Majibu Umeisha',
                    'Mawakala waliochaguliwa hawakujibu. Ombi linarudi sokoni.', rideId);
            }
            await routingEvent(myDb, rideId, 'ROUTING_FAILED', 'system', { reason: 'all_expired' });
        }
    }
    return { ok: true, changed: changed };
}

module.exports = {
    routingEvent: routingEvent,
    notify: notify,
    collectCandidates: collectCandidates,
    ensureRideForOrder: ensureRideForOrder,
    needsDestination: needsDestination,           // [PART 5B-3]
    destinationCheck: destinationCheck,           // [PART 5B-3]
    requireDestination: requireDestination,
    splitRidePrivate: splitRidePrivate,
    writeRideSplit: writeRideSplit,
    rideWithContact: rideWithContact,
    RIDE_PRIVATE_KEYS: RIDE_PRIVATE_KEYS,
    routeBookingFromOrder: routeBookingFromOrder,
    dropInactiveAccounts: dropInactiveAccounts,
    rideOffers: rideOffers,
    applyTransition: applyTransition,
    declineOffer: declineOffer,
    sweepRide: sweepRide
};

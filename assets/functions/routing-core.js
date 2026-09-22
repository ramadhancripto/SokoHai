'use strict';
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
    } catch (e) { /* matukio hayapaswi kuvuruga routing */ }
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
    } catch (e) { /* si muhimu */ }
}

/* ------------------ kusanya wagombeaji ------------------ */

async function collectCandidates(myDb) {
    const out = [];
    try {
        const ds = await myDb.collection('drivers').limit(400).get();
        ds.forEach(function (d) {
            const x = d.data() || {};
            if (!x.userId) return;
            out.push(Object.assign({ id: d.id, uid: x.userId, kind: 'driver' }, x));
        });
    } catch (e) { /* endelea na agents */ }
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
    } catch (e) { /* hakuna agents */ }
    return out;
}

/* ------------------ tengeneza/unganisha safari kutoka order ------------------ */

// [DELIVERY OPTION 2026-09] Oda za BIDHAA zenye delivery.required = true
// huungana na mfumo huohuo wa ride_request → delivery_offers → Request
// Inbox. Hakuna mkusanyiko mpya wa bandia: oda inabeba snapshot ya
// tangazo HALISI la usafiri (drivers/{postId}) lililochaguliwa na mteja.
function rideFromProductOrder(order, orderId) {
    const d = order.delivery || {};
    const firstItem = (Array.isArray(order.items) && order.items[0]) || {};
    const cargoName = order.itemTitle || firstItem.title || d.packageDescription || 'Mzigo wa oda';
    return {
        customerId: order.buyerId,
        customerName: order.buyerName || 'Mteja',
        customerPhone: d.customerPhone || '',
        reqCategory: d.reqCategory || 'Cargo',
        vehicleType: d.vehicleType || '',
        fromLocation: d.pickupLocation || order.sellerLocation || order.fromLocation || '',
        toLocation: d.destination || d.destinationLocation || '',
        cargoName: cargoName,
        cargoDescription: d.packageDescription || order.itemTitle || cargoName,
        cargoImage: order.itemImg || d.cargoImage || firstItem.image || '',
        cargoPrice: Number(order.amount || 0),
        fare: Number(d.fare || 0),
        cargoWeight: Number(d.packageWeightKg || 0),
        cargoSize: d.packageQuantity || '',
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

async function ensureRideForOrder(myDb, order, orderId, opts) {
    opts = opts || {};
    const existingId = order.rideRequestId || order.deliveryId || null;
    if (existingId) {
        const s = await myDb.doc('ride_requests/' + existingId).get();
        if (s.exists) return { ref: s.ref || myDb.doc('ride_requests/' + existingId), data: s.data(), created: false, id: existingId };
    }
    const ref = myDb.collection('ride_requests').doc();

    // [DELIVERY OPTION] Oda za bidhaa (sio booking ya majadiliano) zinahitaji
    // delivery.required; bila ya hapo hakuna safari inayoundwa.
    if (order.kind !== 'booking') {
        const d = order.delivery || {};
        if (!d.required) throw new Error('not_a_booking');
        const ride = rideFromProductOrder(order, orderId);
        if (opts.preferredDriverId) ride.preferredDriverId = String(opts.preferredDriverId);
        await ref.set(ride);
        return { ref: ref, data: ride, created: true, id: ref.id };
    }

    const route = order.route || {};
    const cargoName = order.itemTitle || order.packageDescription || 'Mzigo';
    const ride = {
        customerId: order.buyerId,
        customerName: order.buyerName || 'Mteja',
        customerPhone: order.buyerPhone || '',
        reqCategory: order.reqCategory || 'Cargo',
        vehicleType: order.vehicleType || '',
        fromLocation: route.from || order.fromLocation || '',
        toLocation: route.to || order.toLocation || '',
        cargoName: cargoName,
        cargoDescription: order.packageDescription || '',
        cargoImage: order.image || '',
        cargoPrice: Number(order.fare || order.amount || 0),
        fare: Number(order.fare || order.amount || 0),
        cargoWeight: Number(order.cargoWeight || order.weight || 0),
        cargoSize: order.packageQuantity || '',
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
    await ref.set(ride);
    return { ref: ref, data: ride, created: true, id: ref.id };
}

/* [DELIVERY OPTION] Mteja akichagua tangazo halisi la usafiri, thibitisha
 * kuwa mtoa huduma huyo yupo na (ikibidi) pata jina lake kutoka tangazo. */
async function preferredCandidateFor(myDb, uid, order) {
    if (!uid) return null;
    let name = 'Msafirishaji';
    let post = null;
    try {
        const u = await myDb.doc('users/' + uid).get();
        if (u.exists) {
            const ud = u.data() || {};
            name = ud.fullName || ud.displayName || ud.businessName || ud.shopName || name;
        }
    } catch (e) { /* endelea */ }
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
        online: true
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
    if (preferredCandidate) {
        // Mteja amechagua tangazo HALISI la mtoa usafiri — ofa ya moja kwa
        // moja huenda kwake (bado hupitia delivery_offers/Request Inbox).
        chosen = [Object.assign({ rank: 0, _m: { score: 100, exact: true } }, preferredCandidate)];
    } else {
        const candidates = await collectCandidates(myDb);
        const ranked = L.rankCandidates(candidates, req);
        chosen = ranked.chosen || [];
    }
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
            participants: [order.buyerId, c.uid],
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
        const rs = await myDb.doc('ride_requests/' + rideId).get();
        if (!rs.exists) return;
        const rd = rs.data() || {};
        if (!rd.productOrder) return;
        await rs.ref.update({
            status: 'searching',
            routingStatus: 'marketplace',
            preferredDriverId: null,
            activeOfferId: null
        });
    } catch (e) { /* siyo kikwazo */ }
}

/* ------------------ Decline → mfungue mwingine ------------------ */

async function declineOffer(myDb, offerId, agentId) {
    const os = await myDb.collection('delivery_offers').doc(offerId).get();
    if (!os.exists) throw new Error('offer_not_found');
    const offer = os.data();
    if (offer.agentId !== agentId) throw new Error('not_your_offer');

    const offers = await rideOffers(myDb, offer.rideId);
    const tr = L.transitionOffers(offers, { type: 'decline', offerId: offerId, agentId: agentId });
    await applyTransition(myDb, offer.rideId, tr);
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
    const offers = await rideOffers(myDb, rideId);
    if (!offers.length) return { ok: true, changed: false };
    const tr = L.transitionOffers(offers, { type: 'sweep' });
    const changed = Object.keys(tr.updates).length > 0;
    if (changed) {
        await applyTransition(myDb, rideId, tr);
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
    routeBookingFromOrder: routeBookingFromOrder,
    rideOffers: rideOffers,
    applyTransition: applyTransition,
    declineOffer: declineOffer,
    sweepRide: sweepRide
};

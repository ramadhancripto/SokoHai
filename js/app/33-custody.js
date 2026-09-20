/* ==== js/app/33-custody.js ====
   SOKOHAI — TRANSPORTER DELIVERY & SECURE PICKUP TOKEN FLOW
   (Chain of Custody — Mlolongo wa Makabidhiano)

   Kanuni kuu: "ACCEPTED ≠ PICKED UP".
   - Kukubali kazi (accepted) ni AHAHADI TU ya kusafirisha.
   - Mzigo unakuwa chini ya ulinzi wa dereva (picked_up) baada ya
     uthibitisho WA PANDEMBILI: muuzaji anathibitisha makabidhiano
     (seller_confirmed_handover) NA dereva anathibitisha upokeaji kwa
     token salama (transporter_confirmed_receipt → picked_up).

   Mpangilio wa statusi:
     accepted → pickup_pending → seller_confirmed_handover
        → transporter_confirmed_receipt → picked_up → in_transit
        → (handover) awaiting_handover → in_transit → ... → delivered

   Tokens ni SALAMA (crypto-random, single-use, na muda wa kuisha):
     - PK-XXXXXXXX  (pickup, muuzaji ↔ dereva wa kwanza)
     - TR-XXXXXXXX  (handover, dereva A ↔ dereva B)

   Server (functions/index.js) ndiyo mamlaka: deliveryGenerateToken +
   deliveryConfirmCustody (role: seller | handover_from | transporter).
   Browser inatumia hizo kwanza; njia ya "demo fallback" hapa chini
   inatumika PEKEE wakati server haipatikani (mf. mazingira ya offline/demo)
   — haichukui nafasi ya uthibitisho wa server.

   Arifa: tunatumia mfumo ULIOPO wa `notifications` (hakuna mfumo mpya).
   Malipo: tunategemea engine iliyopo (walletAdjust/escrowRelease) —
   hakuna mechanism mpya ya malipo.
   Rekodi za makabidhiano: `delivery_handovers` (kila handover ina rekodi).
   ============================================================ */
import { skh } from './00-bootstrap.js';

function T(key, en, vars) {
    var s = null;
    try { if (window.t) s = window.t(key, vars); } catch (e) {}
    if (!s || s === key) {
        s = en;
        if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
    }
    return s;
}

/* ---------- Vijisehemu vya ndani (module-scope, si window) ---------- */
var CUST_STATUS = {
    ACCEPTED: 'accepted',
    PICKUP_PENDING: 'pickup_pending',
    SELLER_CONFIRMED: 'seller_confirmed_handover',
    TRANSPORTER_CONFIRMED: 'transporter_confirmed_receipt',
    PICKED_UP: 'picked_up',
    IN_TRANSIT: 'in_transit',
    AWAITING_HANDOVER: 'awaiting_handover',
    DELIVERED: 'delivered',
    COMPLETED: 'completed'
};

function nowIso() { return new Date().toISOString(); }

// Token salama: 8 hex chars kutoka crypto (si predictable kama 1234/0000).
function secureToken(prefix) {
    try {
        if (typeof window.crypto !== 'undefined' && window.crypto.getRandomValues) {
            var b = new window.Uint8Array(4);
            window.crypto.getRandomValues(b);
            var hex = '';
            for (var i = 0; i < 4; i++) hex += (b[i] < 16 ? '0' : '') + b[i].toString(16);
            return (prefix || 'PK-') + hex.toUpperCase();
        }
    } catch (e) { /* fallback hapa chini */ }
    return (prefix || 'PK-') + Math.random().toString(16).slice(2, 10).toUpperCase();
}

// Rejea ya token isiyo ya siri (kamwe usihifadhi token kamili kwenye handover record).
function maskToken(t) {
    t = String(t || '');
    if (!t) return '';
    return t.slice(0, 3) + '••••' + t.slice(-2);
}

function tokenMatch(stored, input) {
    return String(input || '').trim().toUpperCase() === String(stored || '').trim().toUpperCase();
}

function tokenExpired(rd) {
    var exp = rd && (rd.pickupTokenExpiresAt || rd.handoverTokenExpiresAt);
    if (!exp) return false;
    try { return Date.parse(exp) < Date.now(); } catch (e) { return false; }
}

function notify(userId, title, body, type) {
    if (!userId) return Promise.resolve(null);
    try {
        return skh.addDoc(skh.collection(skh.db, 'notifications'), {
            userId: userId, title: title, body: body,
            createdAt: nowIso(), read: false, type: type || 'delivery'
        });
    } catch (e) { return Promise.resolve(null); }
}

// Rekodi ya tukio la custody (append-only kwenye delivery_events).
function appendEvent(deliveryId, event, extra) {
    extra = extra || {};
    try {
        return skh.addDoc(skh.collection(skh.db, 'delivery_events'), {
            deliveryId: deliveryId,
            event: event,
            actorId: (skh.currentUser && skh.currentUser.uid) || null,
            actorRole: extra.role || null,
            legId: extra.legId || null,
            handoverId: extra.handoverId || null,
            timestamp: nowIso(),
            location: extra.location || null,
            parcelCondition: extra.parcelCondition || null,
            parcelConditionNote: extra.parcelConditionNote || null
        });
    } catch (e) { return Promise.resolve(null); }
}
window.skhCustodyRecordEvent = appendEvent;

async function readRide(rideId) {
    if (!rideId) return null;
    try {
        var s = await skh.getDoc(skh.doc(skh.db, 'ride_requests', rideId));
        if (!s || !s.exists || !s.exists()) return null;
        return { id: rideId, data: s.data() };
    } catch (e) { return null; }
}

// Wito wa server callable — ikifeli, tunarudi kwenye demo fallback.
async function callServer(name, payload) {
    try {
        var fn = window[name];
        if (typeof fn === 'function') {
            var res = await fn(payload || {});
            var data = (res && res.data) || {};
            return { server: true, data: data };
        }
    } catch (e) {
        console.warn('[custody] server callable imeshindwa:', e && e.message);
        return { server: false, data: null, error: (e && e.message) || '', code: (e && e.code) || null };
    }
    return { server: false, data: null };
}

// [CUSTODY/FIX 2026-09] Fail-secure: demo fallback (uandishi wa client moja
// kwa moja kwenye ride_requests) unaruhusiwa PEKEE kwa opt-in ya demo/offline.
// Production default = false → server haipatikani = KOSA (hakuna uandishi wa
// client-authoritative). Hii inazuia "kitufe cha frontend" kubadilisha custody.
function custodyFallbackAllowed() {
    try {
        return !!(window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.CUSTODY_DEMO_FALLBACK === true);
    } catch (e) { return false; }
}
window.skhCustodyFallbackAllowed = custodyFallbackAllowed;

/* ---------- Rate-limit ya majaribio ya token (kuzuia brute force) ---------- */
function badAttempts(key) {
    try { return parseInt(sessionStorage.getItem('cust_attempt_' + key) || '0', 10) || 0; } catch (e) { return 0; }
}
function bumpBadAttempts(key) {
    var n = badAttempts(key) + 1;
    try { sessionStorage.setItem('cust_attempt_' + key, String(n)); } catch (e) {}
    return n;
}
function clearBadAttempts(key) {
    try { sessionStorage.removeItem('cust_attempt_' + key); } catch (e) {}
}
function rateLimitKey(rideId, role) { return 'confirm:' + rideId + ':' + role; }

/* ---------- Rekodi za makabidhiano (delivery_handovers) ---------- */
async function createHandoverRecord(rideId, legNumber, fromId, fromName, toId, toName, location, tokenRef) {
    try {
        var ref = await skh.addDoc(skh.collection(skh.db, 'delivery_handovers'), {
            deliveryId: rideId,
            deliveryLegId: 'leg_' + legNumber,
            fromTransporterId: fromId || null,
            fromTransporterName: fromName || '',
            toTransporterId: toId || null,
            toTransporterName: toName || '',
            handoverLocation: location || '',
            initiatedAt: nowIso(),
            completedAt: null,
            verificationMethod: 'token',
            pickupTokenReference: maskToken(tokenRef),
            fromPartyConfirmed: false,
            toPartyConfirmed: false,
            status: 'pending',
            parcelCondition: null,
            evidence: ''
        });
        return ref ? ref.id : null;
    } catch (e) { return null; }
}
async function updateHandoverRecord(hoId, patch) {
    if (!hoId) return;
    try { await skh.updateDoc(skh.doc(skh.db, 'delivery_handovers', hoId), patch); } catch (e) {}
}
async function completeLastLeg(rideId, parcelCondition, evidence) {
    var rd = await readRide(rideId); if (!rd) return;
    var legs = Array.isArray(rd.data.custodyLegs) ? rd.data.custodyLegs.slice() : [];
    if (!legs.length) return;
    var last = legs[legs.length - 1];
    if (last && last.status === 'pending') {
        legs[legs.length - 1] = Object.assign({}, last, {
            status: 'completed', completedAt: nowIso(),
            parcelCondition: parcelCondition || last.parcelCondition || null,
            evidence: evidence || ''
        });
        try { await skh.updateDoc(skh.doc(skh.db, 'ride_requests', rideId), { custodyLegs: legs }); } catch (e) {}
    }
}

/* ============================================================
   1) KUZALISHA TOKEN (baada ya dereva kukubali / kwenye handover)
   ============================================================ */
window.skhCustodyGenerateToken = async function(rideId, kind, opts) {
    kind = kind || 'pickup';
    opts = opts || {};
    if (!rideId) return { ok: false, error: 'ride_required' };

    // 1. Server kwanza (mamlaka).
    var s = await callServer('skhCustodyServerGenerateToken', {
        rideId: rideId, kind: kind,
        nextTransporterId: opts.nextTransporterId || '',
        nextTransporterName: opts.nextTransporterName || '',
        location: opts.location || ''
    });
    if (s.server && s.data && s.data.token) {
        return { ok: true, token: s.data.token, server: true, handoverId: s.data.handoverId || null, status: s.data.status };
    }

    // Fail-secure: bila opt-in ya demo, hatuandiki custody kwenye browser.
    if (!custodyFallbackAllowed()) return { ok: false, error: 'server_unavailable' };

    // 2. Demo fallback (server haipatikani — DEMO/offline pekee).
    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var d = rd.data;
    var ref = skh.doc(skh.db, 'ride_requests', rideId);

    if (kind === 'handover') {
        var nextId = opts.nextTransporterId || d.nextTransporterId || '';
        var nextName = opts.nextTransporterName || d.nextTransporterName || nextId;
        if (!nextId) return { ok: false, error: 'next_transporter_required' };
        if (d.handoverToken && d.handoverTokenStatus === 'pending' && !tokenExpired(d)) {
            return { ok: true, token: d.handoverToken, server: false, handoverId: d.activeHandoverId || null };
        }
        var tr = secureToken('TR-');
        var legNumber = (Array.isArray(d.custodyLegs) ? d.custodyLegs.length : 1) + 1;
        var fromId = d.currentCustodian || d.driverId;
        var fromName = d.currentCustodianName || d.driverName || 'Transporter A';
        var hoId = await createHandoverRecord(rideId, legNumber, fromId, fromName, nextId, nextName, opts.location || '', tr);
        await skh.updateDoc(ref, {
            handoverToken: tr,
            handoverTokenStatus: 'pending',
            handoverTokenCreatedAt: nowIso(),
            handoverTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            status: CUST_STATUS.AWAITING_HANDOVER,
            custodyStage: 'handover',
            nextTransporterId: nextId,
            nextTransporterName: nextName,
            handoverFromConfirmed: false,
            activeHandoverId: hoId,
            custodyLegs: skh.arrayUnion({
                leg: legNumber, fromId: fromId, from: fromName,
                toId: nextId, to: nextName, status: 'pending', location: opts.location || ''
            })
        });
        await appendEvent(rideId, 'HANDOVER_TOKEN_GENERATED', {});
        await appendEvent(rideId, 'HANDOVER_INITIATED', { legId: 'leg_' + legNumber, handoverId: hoId, location: opts.location || '' });
        await notify(nextId, T('cust_notif_int_pickup', 'Intermediate Pickup Required'),
            T('cust_notif_int_pickup_body', 'Umepewa mkono wa usafirishaji. Thibitisha upokeaji kwa token ya TR.'), 'delivery');
        return { ok: true, token: tr, server: false, handoverId: hoId };
    }

    // pickup
    if (d.pickupToken && d.pickupTokenStatus === 'pending' && d.pickupToken.length > 8 && !tokenExpired(d)) {
        return { ok: true, token: d.pickupToken, server: false };
    }
    var pk = secureToken('PK-');
    await skh.updateDoc(ref, {
        pickupToken: pk,
        pickupTokenStatus: 'pending',
        pickupTokenCreatedAt: nowIso(),
        pickupTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        status: CUST_STATUS.PICKUP_PENDING,
        custodyStage: 'pickup'
    });
    await appendEvent(rideId, 'PICKUP_TOKEN_GENERATED', {});
    return { ok: true, token: pk, server: false };
};

/* ============================================================
   2) MUUZAJI ATHIBITISHE MAKABIDHIANO (pande la kwanza)
      OPTION A — kwa token | OPTION B — direct (bila token)
   ============================================================ */
window.skhCustodyConfirmSellerHandover = async function(rideId, token, parcelCondition, note, location) {
    if (!rideId || !token) return { ok: false, error: 'token_required' };
    return window._skhCustodySellerConfirm(rideId, token, parcelCondition, note, location, false);
};

window.skhCustodyConfirmSellerHandoverDirect = async function(rideId, parcelCondition, note, location) {
    if (!rideId) return { ok: false, error: 'ride_required' };
    return window._skhCustodySellerConfirm(rideId, '', parcelCondition, note, location, true);
};

window._skhCustodySellerConfirm = async function(rideId, token, parcelCondition, note, location, direct) {
    if (badAttempts(rateLimitKey(rideId, 'seller')) >= 6) return { ok: false, error: 'rate_limited' };

    var s = await callServer('skhCustodyServerConfirmCustody', {
        rideId: rideId, role: 'seller', token: token || '', direct: direct,
        parcelCondition: parcelCondition || 'good', parcelConditionNote: note || '', location: location || ''
    });
    if (s.server && s.data && s.data.ok) { clearBadAttempts(rateLimitKey(rideId, 'seller')); return { ok: true, status: s.data.status, server: true }; }

    if (!custodyFallbackAllowed()) return { ok: false, error: 'server_unavailable' };

    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var d = rd.data;
    var ref = skh.doc(skh.db, 'ride_requests', rideId);

    if (d.customerId && skh.currentUser && d.customerId !== skh.currentUser.uid) return { ok: false, error: 'owner_only' };
    if (!d.driverId) return { ok: false, error: 'no_transporter' };
    var allowed = [CUST_STATUS.ACCEPTED, 'awaiting_pickup', CUST_STATUS.PICKUP_PENDING, CUST_STATUS.SELLER_CONFIRMED];
    if (allowed.indexOf(d.status) === -1) return { ok: false, error: 'bad_stage' };
    if (tokenExpired(d)) { try { await skh.updateDoc(ref, { pickupTokenStatus: 'expired' }); } catch (e) {} return { ok: false, error: 'expired' }; }
    if (!direct && !tokenMatch(d.pickupToken, token)) {
        var n = bumpBadAttempts(rateLimitKey(rideId, 'seller'));
        return { ok: false, error: n >= 6 ? 'rate_limited' : 'bad_token' };
    }

    clearBadAttempts(rateLimitKey(rideId, 'seller'));
    await skh.updateDoc(ref, {
        status: CUST_STATUS.SELLER_CONFIRMED,
        sellerConfirmedAt: nowIso(),
        parcelCondition: parcelCondition || 'good',
        parcelConditionNote: note || '',
        custodyStage: 'pickup'
    });
    await appendEvent(rideId, 'SELLER_HANDOVER_CONFIRMED', {
        parcelCondition: parcelCondition || 'good', parcelConditionNote: note || '',
        location: location || '', verificationMethod: direct ? 'direct' : 'token'
    });
    await notify(d.driverId, T('cust_notif_pickup_req', 'Pickup Confirmation Required'),
        T('cust_notif_pickup_req_body', 'Muuzaji amethibitisha makabidhiano. Thibitisha upokeaji wa mzigo kwa token yako.'), 'delivery');
    return { ok: true, status: CUST_STATUS.SELLER_CONFIRMED, server: false };
};

/* ============================================================
   3) DEREVA ATHIBITISHE UPOKEAJI (pande la pili) → PICKED_UP
   ============================================================ */
window.skhCustodyConfirmTransporterPickup = async function(rideId, token, parcelCondition, note, location, pickupCount) {
    if (!rideId || !token) return { ok: false, error: 'token_required' };
    if (badAttempts(rateLimitKey(rideId, 'transporter')) >= 6) return { ok: false, error: 'rate_limited' };

    var s = await callServer('skhCustodyServerConfirmCustody', {
        rideId: rideId, role: 'transporter', token: token,
        parcelCondition: parcelCondition || 'good', parcelConditionNote: note || '', location: location || '',
        pickupCount: pickupCount
    });
    if (s.server && s.data && s.data.ok) { clearBadAttempts(rateLimitKey(rideId, 'transporter')); return { ok: true, status: s.data.status, server: true }; }

    if (!custodyFallbackAllowed()) return { ok: false, error: 'server_unavailable' };

    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var d = rd.data;
    var ref = skh.doc(skh.db, 'ride_requests', rideId);
    var me = (skh.currentUser && skh.currentUser.uid) || null;

    if (d.driverId !== me) return { ok: false, error: 'wrong_transporter' };
    if (d.status === CUST_STATUS.PICKED_UP || d.status === CUST_STATUS.IN_TRANSIT) return { ok: true, status: d.status, server: false };
    if (d.status !== CUST_STATUS.SELLER_CONFIRMED) return { ok: false, error: 'await_seller' };
    if (d.pickupTokenStatus !== 'pending') return { ok: false, error: 'token_used' };
    if (tokenExpired(d)) { try { await skh.updateDoc(ref, { pickupTokenStatus: 'expired' }); } catch (e) {} return { ok: false, error: 'expired' }; }
    if (!tokenMatch(d.pickupToken, token)) {
        var n = bumpBadAttempts(rateLimitKey(rideId, 'transporter'));
        return { ok: false, error: n >= 6 ? 'rate_limited' : 'bad_token' };
    }

    clearBadAttempts(rateLimitKey(rideId, 'transporter'));
    await skh.updateDoc(ref, {
        status: CUST_STATUS.PICKED_UP,
        pickupTokenStatus: 'used',
        currentCustodian: me,
        currentCustodianName: (skh.currentUser && skh.currentUser.displayName) || d.driverName || 'Dereva',
        transporterConfirmedAt: nowIso(),
        parcelCondition: parcelCondition || 'good',
        parcelConditionNote: note || '',
        dispatchedAt: nowIso(),
        custodyStage: 'transit',
        custodyLegs: skh.arrayUnion({
            leg: 1,
            fromId: d.customerId || null,
            from: d.customerName || 'Muuzaji',
            toId: me,
            to: (skh.currentUser && skh.currentUser.displayName) || d.driverName || 'Dereva',
            status: 'completed',
            completedAt: nowIso(),
            location: d.fromLocation || '',
            parcelCondition: parcelCondition || 'good'
        })
    });
    await appendEvent(rideId, 'TRANSPORTER_PICKUP_CONFIRMED', { parcelCondition: parcelCondition || 'good', parcelConditionNote: note || '', location: location || '' });
    await notify(d.customerId, T('cust_notif_picked', 'Mzigo Umechukuliwa (Picked Up)'),
        T('cust_notif_picked_body', 'Dereva amethibitisha kupokea mzigo. Mzigo sasa uko chini ya ulinzi wake.'), 'delivery');
    return { ok: true, status: CUST_STATUS.PICKED_UP, server: false };
};

/* ============================================================
   4) ANZA SAFARI (dereva) — picked_up → in_transit
   ============================================================ */
window.skhCustodyStartTransit = async function(rideId, opts) {
    opts = opts || {};
    // 1. Server kwanza (mamlaka).
    var s = await callServer('skhCustodyServerStartTransit', { rideId: rideId, pickupCount: opts.pickupCount });
    if (s.server && s.data && s.data.ok) return { ok: true, status: s.data.status, server: true };

    // Fail-secure: bila opt-in ya demo, hatuandiki custody kwenye browser.
    if (!custodyFallbackAllowed()) return { ok: false, error: 'server_unavailable' };

    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var d = rd.data;
    var me = (skh.currentUser && skh.currentUser.uid) || null;
    if (d.currentCustodian && d.currentCustodian !== me) return { ok: false, error: 'not_custodian' };
    if (d.status !== CUST_STATUS.PICKED_UP) return { ok: false, error: 'bad_stage' };

    var patch = { status: CUST_STATUS.IN_TRANSIT, custodyStage: 'transit' };
    if (opts.pickupCount != null && !isNaN(Number(opts.pickupCount))) patch.verifiedPickupCount = Number(opts.pickupCount);
    await skh.updateDoc(skh.doc(skh.db, 'ride_requests', rideId), patch);
    await appendEvent(rideId, 'DELIVERY_STARTED', {});
    await notify(d.customerId, T('cust_notif_transit', 'Safari Imeanza'),
        T('cust_notif_transit_body', 'Dereva ameanza safari. Mzigo uko njiani.'), 'delivery');
    return { ok: true, status: CUST_STATUS.IN_TRANSIT, server: false };
};

/* ============================================================
   4b) UKAMILISHAJI WA MWISHO + MGOGORO (server-authoritative)
   ============================================================ */
window.skhCustodyCompleteDelivery = async function(rideId, transferCode, arrivalCount, opts) {
    if (!rideId) return { ok: false, error: 'ride_required' };
    opts = opts || {};
    var s = await callServer('skhCustodyServerComplete', {
        rideId: rideId,
        transferCode: transferCode || '',
        arrivalCount: arrivalCount,
        skipPayout: opts.skipPayout === true
    });
    if (s.server && s.data && s.data.ok) return { ok: true, status: s.data.status, finalPayout: s.data.finalPayout, server: true };
    if (s.server && s.data && s.data.already) return { ok: true, status: s.data.status, finalPayout: s.data.finalPayout, server: true };
    if (s.server && s.data && s.data.error) return { ok: false, error: s.data.error };
    // Fail-secure: hakuna uandishi wa client. Chuja kosa la server ili
    // kumpa mtumiaji ujumbe sahihi (token mbaya vs hatua mbaya vs server).
    var err = ((s && s.error) || '').toString().toLowerCase();
    var code = ((s && s.code) || '').toString().toLowerCase();
    if (err.indexOf('invalid pickup') !== -1 || err.indexOf('verify the token') !== -1) return { ok: false, error: 'bad_token' };
    if (code === 'permission-denied') return { ok: false, error: 'forbidden' };
    if (code === 'failed-precondition') return { ok: false, error: 'bad_stage' };
    return { ok: false, error: 'server_unavailable' };
};

window.skhCustodyRaiseDispute = async function(rideId, reason) {
    if (!rideId) return { ok: false, error: 'ride_required' };
    var s = await callServer('skhCustodyServerDispute', { rideId: rideId, reason: reason || '' });
    if (s.server && s.data && s.data.ok) return { ok: true, status: s.data.status, server: true };
    return { ok: false, error: (s.data && s.data.error) || 'server_unavailable' };
};

// Kusoma token halisi (kwa mhusika pekee) kutoka delivery_tokens.
// [PHASE B] Fallback ya legacy: safari za zamani zilikuwa na plaintext
// kwenye ride doc (pickupToken/handoverToken/transferCode).
window.skhCustodyReadToken = async function(rideId, kind) {
    if (!rideId) return null;
    kind = kind || 'pickup';
    try {
        var s = await skh.getDoc(skh.doc(skh.db, 'delivery_tokens', rideId + '_' + kind));
        if (s && s.exists && s.exists() && s.data() && s.data().token) return s.data().token;
    } catch (e) { /* sio mhusika au haipo */ }
    // Legacy fallback (kwa safari za zamani zilizo na plaintext).
    try {
        var rs = await skh.getDoc(skh.doc(skh.db, 'ride_requests', rideId));
        if (rs && rs.exists && rs.exists()) {
            var d = rs.data() || {};
            var legacyField = (kind === 'handover') ? 'handoverToken' : ((kind === 'transfer') ? 'transferCode' : 'pickupToken');
            if (d[legacyField]) return d[legacyField];
        }
    } catch (e) { /* ruhusa au haipo */ }
    return null;
};

// [CUSTODY PHASE B 2026-09] Mint Token C (DL) ya mpokeaji wa mwisho —
// SERVER-ONLY. Hakuna uandishi wa client-authoritative; demo fallback pekee.
window.skhCustodyMintTransferToken = async function(rideId) {
    if (!rideId) return { ok: false, error: 'ride_required' };
    var s = await callServer('skhCustodyServerGenerateToken', { rideId: rideId, kind: 'transfer' });
    if (s.server && s.data && s.data.token) return { ok: true, token: s.data.token, server: true, status: s.data.status };
    if (s.server && s.data && s.data.error) return { ok: false, error: s.data.error };
    if (!custodyFallbackAllowed()) return { ok: false, error: 'server_unavailable' };
    // Demo fallback (offline/demo pekee) — tabia ya zamani.
    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var d = rd.data;
    if (d.transferCode && d.transferTokenStatus === 'pending') return { ok: true, token: d.transferCode, server: false };
    var dl = secureToken('DL-');
    try {
        await skh.updateDoc(skh.doc(skh.db, 'ride_requests', rideId), { transferCode: dl, transferTokenStatus: 'pending', transferTokenCreatedAt: nowIso() });
    } catch (e) { return { ok: false, error: 'write_denied' }; }
    return { ok: true, token: dl, server: false };
};

// [CUSTODY PHASE B 2026-09] Kupanda kwa abiria (tiketi/OTP) — SERVER-ONLY.
window.skhCustodyPassengerBoard = async function(rideId, otp) {
    if (!rideId || !otp) return { ok: false, error: 'otp_required' };
    var s = await callServer('skhCustodyServerPassengerBoard', { rideId: rideId, otp: otp });
    if (s.server && s.data && s.data.ok) return { ok: true, status: s.data.status, server: true };
    var err = ((s && s.error) || '').toString().toLowerCase();
    var code = ((s && s.code) || '').toString().toLowerCase();
    if (err.indexOf('invalid pickup') !== -1 || err.indexOf('verify the token') !== -1) return { ok: false, error: 'bad_otp' };
    if (code === 'failed-precondition') return { ok: false, error: 'bad_otp' };
    if (code === 'permission-denied') return { ok: false, error: 'forbidden' };
    return { ok: false, error: 'server_unavailable' };
};

// [CUSTODY PHASE B 2026-09] Hujaza token halisi kwenye maeneo ya UI yaliyowekwa
// data-custody-token-ride / data-custody-token-kind (badala ya plaintext ya doc).
window.skhCustodyHydrateTokenCodes = async function(root) {
    root = root || document;
    var els = (root && root.querySelectorAll) ? root.querySelectorAll('[data-custody-token-ride]') : [];
    for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var rideId = el.getAttribute('data-custody-token-ride');
        var kind = el.getAttribute('data-custody-token-kind') || 'transfer';
        if (!rideId) continue;
        try {
            var tok = await window.skhCustodyReadToken(rideId, kind);
            el.textContent = tok ? tok : '• • • (token haijatolewa)';
        } catch (e) { el.textContent = '• • •'; }
    }
};

/* ============================================================
   5) HANDOVER YA KATI (dereva A → dereva B) — multi-hop
   ============================================================ */
window.skhCustodyInitiateHandover = async function(rideId, nextTransporterId, nextTransporterName, location) {
    if (!rideId || !nextTransporterId) return { ok: false, error: 'next_transporter_required' };
    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var d = rd.data;
    var me = (skh.currentUser && skh.currentUser.uid) || null;

    if (d.currentCustodian && d.currentCustodian !== me) return { ok: false, error: 'not_custodian' };
    if (d.status !== CUST_STATUS.IN_TRANSIT && d.status !== CUST_STATUS.PICKED_UP) return { ok: false, error: 'bad_stage' };

    // Token ya handover (TR) + rekodi ya handover + leg → server (au fallback).
    var gen = await window.skhCustodyGenerateToken(rideId, 'handover', {
        nextTransporterId: nextTransporterId,
        nextTransporterName: nextTransporterName,
        location: location || ''
    });
    return gen;
};

// Dereva A anathibitisha amekabidhi (pande la kwanza la handover).
window.skhCustodyConfirmHandoverFrom = async function(rideId) {
    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var d = rd.data;
    var me = (skh.currentUser && skh.currentUser.uid) || null;
    if (d.currentCustodian && d.currentCustodian !== me) return { ok: false, error: 'not_custodian' };
    if (d.status !== CUST_STATUS.AWAITING_HANDOVER) return { ok: false, error: 'bad_stage' };

    var s = await callServer('skhCustodyServerConfirmCustody', { rideId: rideId, role: 'handover_from' });
    if (s.server && s.data && s.data.ok) return { ok: true, status: s.data.status, server: true };

    if (!custodyFallbackAllowed()) return { ok: false, error: 'server_unavailable' };

    await skh.updateDoc(skh.doc(skh.db, 'ride_requests', rideId), { handoverFromConfirmed: true, handoverFromConfirmedAt: nowIso() });
    await updateHandoverRecord(d.activeHandoverId, { fromPartyConfirmed: true, fromConfirmedAt: nowIso() });
    await appendEvent(rideId, 'HANDOVER_CONFIRMED', { handoverId: d.activeHandoverId || null });
    await notify(d.nextTransporterId, T('cust_notif_handover_ready', 'Handover Imethibitishwa'),
        T('cust_notif_handover_ready_body', 'Dereva wa awali amethibitisha makabidhiano. Thibitisha upokeaji kwa token ya TR.'), 'delivery');
    return { ok: true, status: CUST_STATUS.AWAITING_HANDOVER, server: false };
};

// Dereva B anathibitisha upokeaji (pande la pili) → custody inahamia kwake.
window.skhCustodyConfirmIntermediatePickup = async function(rideId, token, parcelCondition, note, location) {
    if (!rideId || !token) return { ok: false, error: 'token_required' };
    if (badAttempts(rateLimitKey(rideId, 'intermediate')) >= 6) return { ok: false, error: 'rate_limited' };

    var s = await callServer('skhCustodyServerConfirmCustody', {
        rideId: rideId, role: 'transporter', handover: true, token: token,
        parcelCondition: parcelCondition || 'good', parcelConditionNote: note || '', location: location || ''
    });
    if (s.server && s.data && s.data.ok) { clearBadAttempts(rateLimitKey(rideId, 'intermediate')); return { ok: true, status: s.data.status, server: true }; }

    if (!custodyFallbackAllowed()) return { ok: false, error: 'server_unavailable' };

    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var d = rd.data;
    var me = (skh.currentUser && skh.currentUser.uid) || null;
    var ref = skh.doc(skh.db, 'ride_requests', rideId);

    if (d.nextTransporterId !== me) return { ok: false, error: 'wrong_transporter' };
    if (d.status !== CUST_STATUS.AWAITING_HANDOVER) return { ok: false, error: 'bad_stage' };
    if (d.handoverFromConfirmed !== true) return { ok: false, error: 'await_handover_from' };
    if (d.handoverTokenStatus !== 'pending') return { ok: false, error: 'token_used' };
    if (tokenExpired(d)) { try { await skh.updateDoc(ref, { handoverTokenStatus: 'expired' }); } catch (e) {} return { ok: false, error: 'expired' }; }
    if (!tokenMatch(d.handoverToken, token)) {
        var n = bumpBadAttempts(rateLimitKey(rideId, 'intermediate'));
        return { ok: false, error: n >= 6 ? 'rate_limited' : 'bad_token' };
    }

    clearBadAttempts(rateLimitKey(rideId, 'intermediate'));
    await skh.updateDoc(ref, {
        status: CUST_STATUS.IN_TRANSIT,
        handoverTokenStatus: 'used',
        currentCustodian: me,
        currentCustodianName: (skh.currentUser && skh.currentUser.displayName) || d.nextTransporterName || 'Dereva',
        driverId: me,
        driverName: (skh.currentUser && skh.currentUser.displayName) || d.nextTransporterName || 'Dereva',
        nextTransporterId: null,
        nextTransporterName: null,
        custodyStage: 'transit'
    });
    await updateHandoverRecord(d.activeHandoverId, {
        toPartyConfirmed: true, completedAt: nowIso(), status: 'completed',
        parcelCondition: parcelCondition || 'good', evidence: note || ''
    });
    await completeLastLeg(rideId, parcelCondition || 'good', note || '');
    await appendEvent(rideId, 'NEXT_TRANSPORTER_PICKUP_CONFIRMED', {
        handoverId: d.activeHandoverId || null, parcelCondition: parcelCondition || 'good',
        parcelConditionNote: note || '', location: location || ''
    });
    await notify(d.currentCustodian, T('cust_notif_handover_done', 'Handover Imekamilika'),
        T('cust_notif_handover_done_body', 'Transporter mpya amepokea mzigo. Custody imehamia kwake.'), 'delivery');
    return { ok: true, status: CUST_STATUS.IN_TRANSIT, server: false };
};

/* ============================================================
   5b) KUFUTA/BATILISHA TOKEN (cancelled → revoked)
   ============================================================ */
window.skhCustodyRevokeTokens = async function(rideId) {
    // Server kwanza (mamlaka); fallback ya demo ikiwa haipatikani.
    var s = await callServer('skhCustodyServerRevokeTokens', { rideId: rideId });
    if (s.server && s.data && s.data.ok) return { ok: true, server: true };

    if (!custodyFallbackAllowed()) return { ok: false, error: 'server_unavailable' };

    var rd = await readRide(rideId);
    if (!rd) return { ok: false, error: 'ride_not_found' };
    var patch = {};
    if (rd.data.pickupTokenStatus === 'pending') patch.pickupTokenStatus = 'revoked';
    if (rd.data.handoverTokenStatus === 'pending') patch.handoverTokenStatus = 'revoked';
    if (Object.keys(patch).length) {
        try { await skh.updateDoc(skh.doc(skh.db, 'ride_requests', rideId), patch); } catch (e) {}
    }
    return { ok: true };
};

/* ============================================================
   6) MLOLONGO WA MAKABIDHIANO (chain of custody timeline)
   ============================================================ */
window.skhCustodyRenderTimeline = async function(rideId, containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:11px; padding:12px;">Inapakia mlolongo wa makabidhiano...</p>';
    try {
        // Kumbuka: hatutumii orderBy hapa — inahitaji composite index kwenye
        // deliveryId + timestamp. Tunapanga kwenye browser (safe bila index).
        var q = skh.query(skh.collection(skh.db, 'delivery_events'),
            skh.where('deliveryId', '==', rideId), skh.limit(50));
        var snap = await skh.getDocs(q);
        var items = [];
        snap.forEach(function (ds) { items.push(ds.data()); });
        items.sort(function (a, b) { return String(a.timestamp || '').localeCompare(String(b.timestamp || '')); });

        if (!items.length) {
            el.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:11px; padding:12px;">Hakuna matukio ya makabidhiano bado.</p>';
            return;
        }
        var labels = {
            TRANSPORTER_ACCEPTED: T('cust_ev_accepted', 'Dereva Amekubali Kazi'),
            PICKUP_TOKEN_GENERATED: T('cust_ev_token', 'Pickup Token Imeundwa'),
            SELLER_HANDOVER_CONFIRMED: T('cust_ev_seller', 'Muuzaji Amethibitisha Makabidhiano'),
            TRANSPORTER_PICKUP_CONFIRMED: T('cust_ev_transporter', 'Dereva Amethibitisha Upokeaji'),
            DELIVERY_STARTED: T('cust_ev_started', 'Safari Imeanza'),
            HANDOVER_TOKEN_GENERATED: T('cust_ev_hotoken', 'Handover Token Imeundwa'),
            HANDOVER_INITIATED: T('cust_ev_hoinit', 'Handover Imeanzishwa'),
            HANDOVER_CONFIRMED: T('cust_ev_hoconf', 'Handover Imethibitishwa'),
            NEXT_TRANSPORTER_PICKUP_CONFIRMED: T('cust_ev_next', 'Transporter Mpya Amepokea'),
            DELIVERY_CONFIRMED: T('cust_ev_delivered', 'Uwasilishaji Umethibitishwa'),
            DELIVERY_COMPLETED: T('cust_ev_completed', 'Uwasilishaji Umekamilika')
        };
        var html = '<div style="border-left:2px solid #cbd5e1; margin-left:8px; padding-left:14px;">';
        items.forEach(function (e, i) {
            var t = '';
            try { t = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ''; } catch (err) {}
            var cond = e.parcelCondition && e.parcelCondition !== 'good'
                ? '<br><small style="color:#b45309;">Hali ya mzigo: ' + skh.skhEscape(e.parcelCondition) + (e.parcelConditionNote ? ' — ' + skh.skhEscape(e.parcelConditionNote) : '') + '</small>' : '';
            html += '<div style="position:relative; padding:0 0 14px 0;">'
                + '<span style="position:absolute; left:-21px; top:1px; width:12px; height:12px; border-radius:50%; background:' + (i === items.length - 1 ? '#10b981' : '#00509d') + '; border:2px solid #fff; box-shadow:0 0 0 2px #e2e8f0;"></span>'
                + '<b style="font-size:12px; color:#0f172a; display:block;">' + skh.skhEscape(labels[e.event] || e.event) + '</b>'
                + '<small style="color:#94a3b8; font-size:10px;">' + t + (e.location ? ' · ' + skh.skhEscape(e.location) : '') + '</small>'
                + cond
                + '</div>';
        });
        html += '</div>';
        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = '<p style="text-align:center; color:#b91c1c; font-size:11px; padding:12px;">Hitilafu kupakia mlolongo wa makabidhiano.</p>';
    }
};

/* Label za statusi kwa UI (kurudia popote panapohitajika). */
window.skhCustodyStatusLabel = function(status) {
    var map = {
        accepted: T('cust_st_accepted', 'Amekubali'),
        pickup_pending: T('cust_st_pickup_pending', 'Anasubiri Makabidhiano'),
        seller_confirmed_handover: T('cust_st_seller', 'Muuzaji Amethibitisha'),
        transporter_confirmed_receipt: T('cust_st_transporter', 'Dereva Amepokea'),
        picked_up: T('cust_st_picked', 'Amechukua (Picked Up)'),
        in_transit: T('cust_st_transit', 'Safarini'),
        awaiting_handover: T('cust_st_handover', 'Anasubiri Handover'),
        delivered: T('cust_st_delivered', 'Imewasilishwa'),
        completed: T('cust_st_completed', 'Imekamilika')
    };
    return map[status] || String(status || '').toUpperCase();
};

/* ---------- Vifungo vya haraka vya dereva (map-onboarding view) ---------- */
window.skhCustodyDriverPickupQuick = async function(rideId) {
    var tok = '';
    try {
        if (window.customPrompt) {
            window.customPrompt("Ingiza Token A (PK) uliyopewa na muuzaji ili kuthibitisha upokeaji wa mzigo:", "PK-XXXXXXXX", async function (v) { tok = v; });
            return; // customPrompt inashughulikia mwendelezo
        }
    } catch (e) {}
    tok = prompt("Ingiza Token A (PK) ili kuthibitisha upokeaji wa mzigo:") || '';
    if (!tok) return;
    var res = await window.skhCustodyConfirmTransporterPickup(rideId, tok, 'good');
    if (!res.ok) {
        alert(res.error === 'rate_limited' ? " Majaribio mengi sana. Subiri kidogo kisha ujaribu tena."
            : (res.error === 'await_seller' ? " Subiri muuzaji athibitishe makabidhiano kwanza." : " Uthibitisho umeshindwa: " + res.error));
        return;
    }
    alert(" Mzigo sasa uko chini ya ulinzi wako (Picked Up).");
    if (typeof window.setupDriverRealtimeQuery === 'function') window.setupDriverRealtimeQuery();
};

window.skhCustodyDriverStartQuick = async function(rideId) {
    var res = await window.skhCustodyStartTransit(rideId);
    if (!res.ok) { alert(" Safari haiwezi kuanza: " + res.error); return; }
    alert(" Safari imeanza! Mzigo upo njiani (In Transit).");
    if (typeof window.setupDriverRealtimeQuery === 'function') window.setupDriverRealtimeQuery();
};

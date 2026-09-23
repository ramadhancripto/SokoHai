'use strict';
/* ============================================================
 * SOKOHAI — GLOBAL NEGOTIATION ENGINE (server-authoritative)
 * ============================================================
 * Injiini MOJA ya majadiliano ya biashara kwenye chat.
 * Server ndiye pekee anayebadilisha state (browser haiwezi —
 * Firestore rules zinazuia). Kanuni:
 *
 *   STATE → valid actions → BUTTON → command → backend validation
 *   → state transition → event → UI update (spec §46).
 *
 * Data (spec §3):
 *   negotiations/{id} — negotiationId, conversationId, productId,
 *   productCollection, productTitle, commerceType, sellerId, buyerId,
 *   currentState, turn, currency, quantity, originalUnitPrice,
 *   currentUnitPrice, currentTotal, currentOfferId, agreementVersion,
 *   agreements[], history[], version, expiresAt, createdAt, updatedAt,
 *   orderId (baada ya CREATE_ORDER).
 *
 *   negotiation_events/{id} — audit trail (spec §41) + idempotency.
 *   offers/{id} — kumbukumbu ya kila ofa/counter (reused existing).
 * ============================================================ */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const db = admin.firestore();

const STATES = {
    DRAFT: 'DRAFT',
    OFFER_SENT: 'OFFER_SENT',
    COUNTER_OFFER: 'COUNTER_OFFER',
    AGREEMENT: 'AGREEMENT',
    CHANGE_REQUESTED: 'CHANGE_REQUESTED',
    SCOPE_CHANGE_REQUESTED: 'SCOPE_CHANGE_REQUESTED',
    ROUTE_CHANGE_REQUESTED: 'ROUTE_CHANGE_REQUESTED',
    RE_NEGOTIATION: 'RE_NEGOTIATION',
    FINAL_AGREEMENT: 'FINAL_AGREEMENT',
    ORDER_CREATED: 'ORDER_CREATED',
    COMPLETED: 'COMPLETED',
    REJECTED: 'REJECTED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED'
};
const TERMINAL = { REJECTED: 1, EXPIRED: 1, CANCELLED: 1, COMPLETED: 1 };

// (from, command) -> { to, actor, turnAfter }.
//   actor: 'buyer' | 'seller' | 'turn' | 'any' | 'system'
const TRANSITIONS = {};
const T = (from, cmd, to, actor, turnAfter) => {
    (TRANSITIONS[from] = TRANSITIONS[from] || {})[cmd] = { to: to, actor: actor, turnAfter: turnAfter };
};

T(STATES.DRAFT, 'SEND_OFFER', STATES.OFFER_SENT, 'buyer', 'seller');
T(STATES.DRAFT, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);

T(STATES.OFFER_SENT, 'ACCEPT_OFFER', STATES.AGREEMENT, 'turn', 'buyer');
T(STATES.OFFER_SENT, 'COUNTER_OFFER', STATES.COUNTER_OFFER, 'turn', null); // turnAfter inahesabiwa
T(STATES.OFFER_SENT, 'REJECT_OFFER', STATES.REJECTED, 'turn', null);
T(STATES.OFFER_SENT, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
T(STATES.OFFER_SENT, 'EXPIRE_NEGOTIATION', STATES.EXPIRED, 'system', null);

T(STATES.COUNTER_OFFER, 'ACCEPT_OFFER', STATES.AGREEMENT, 'turn', 'buyer');
T(STATES.COUNTER_OFFER, 'COUNTER_OFFER', STATES.COUNTER_OFFER, 'turn', null);
T(STATES.COUNTER_OFFER, 'REJECT_OFFER', STATES.REJECTED, 'turn', null);
T(STATES.COUNTER_OFFER, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
T(STATES.COUNTER_OFFER, 'EXPIRE_NEGOTIATION', STATES.EXPIRED, 'system', null);

T(STATES.AGREEMENT, 'REQUEST_QUANTITY_CHANGE', STATES.CHANGE_REQUESTED, 'buyer', 'seller');
T(STATES.AGREEMENT, 'REQUEST_PRICE_CHANGE', STATES.RE_NEGOTIATION, 'buyer', 'seller');
T(STATES.AGREEMENT, 'CREATE_ORDER', STATES.ORDER_CREATED, 'buyer', 'buyer');
T(STATES.AGREEMENT, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);

T(STATES.CHANGE_REQUESTED, 'ACCEPT_QUANTITY_CHANGE', STATES.FINAL_AGREEMENT, 'seller', 'buyer');
T(STATES.CHANGE_REQUESTED, 'REJECT_QUANTITY_CHANGE', STATES.AGREEMENT, 'seller', 'buyer');
T(STATES.CHANGE_REQUESTED, 'COUNTER_QUANTITY_CHANGE', STATES.RE_NEGOTIATION, 'seller', 'buyer');
T(STATES.CHANGE_REQUESTED, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);

T(STATES.RE_NEGOTIATION, 'ACCEPT_OFFER', STATES.FINAL_AGREEMENT, 'turn', 'buyer');
T(STATES.RE_NEGOTIATION, 'COUNTER_OFFER', STATES.RE_NEGOTIATION, 'turn', null);
T(STATES.RE_NEGOTIATION, 'REJECT_OFFER', STATES.AGREEMENT, 'turn', 'buyer');
T(STATES.RE_NEGOTIATION, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
T(STATES.RE_NEGOTIATION, 'EXPIRE_NEGOTIATION', STATES.EXPIRED, 'system', null);

T(STATES.FINAL_AGREEMENT, 'CREATE_ORDER', STATES.ORDER_CREATED, 'buyer', 'buyer');
T(STATES.FINAL_AGREEMENT, 'REQUEST_QUANTITY_CHANGE', STATES.CHANGE_REQUESTED, 'buyer', 'seller');
T(STATES.FINAL_AGREEMENT, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);

T(STATES.ORDER_CREATED, 'REQUEST_ADDITIONAL_ITEMS', STATES.CHANGE_REQUESTED, 'buyer', 'seller');
T(STATES.ORDER_CREATED, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);

// [COMMERCE 2026-09] Service — scope change transitions (spec §8).
// SCOPE_CHANGE_REQUESTED inajibiwa na yule ALIYE ZAMU (turn).
T(STATES.OFFER_SENT, 'CHANGE_SCOPE', STATES.SCOPE_CHANGE_REQUESTED, 'turn', null);
T(STATES.COUNTER_OFFER, 'CHANGE_SCOPE', STATES.SCOPE_CHANGE_REQUESTED, 'turn', null);
T(STATES.SCOPE_CHANGE_REQUESTED, 'ACCEPT_SCOPE_CHANGE', STATES.FINAL_AGREEMENT, 'turn', 'buyer');
T(STATES.SCOPE_CHANGE_REQUESTED, 'REJECT_SCOPE_CHANGE', STATES.AGREEMENT, 'turn', 'buyer');
T(STATES.SCOPE_CHANGE_REQUESTED, 'COUNTER_SCOPE_CHANGE', STATES.COUNTER_OFFER, 'turn', null);
T(STATES.SCOPE_CHANGE_REQUESTED, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
T(STATES.AGREEMENT, 'REQUEST_SCOPE_CHANGE', STATES.SCOPE_CHANGE_REQUESTED, 'buyer', 'seller');
T(STATES.FINAL_AGREEMENT, 'REQUEST_SCOPE_CHANGE', STATES.SCOPE_CHANGE_REQUESTED, 'buyer', 'seller');

// [COMMERCE 2026-09] Transport — route change transitions (spec §12).
T(STATES.OFFER_SENT, 'CHANGE_ROUTE', STATES.ROUTE_CHANGE_REQUESTED, 'turn', null);
T(STATES.COUNTER_OFFER, 'CHANGE_ROUTE', STATES.ROUTE_CHANGE_REQUESTED, 'turn', null);
T(STATES.ROUTE_CHANGE_REQUESTED, 'ACCEPT_ROUTE_CHANGE', STATES.FINAL_AGREEMENT, 'turn', 'buyer');
T(STATES.ROUTE_CHANGE_REQUESTED, 'REJECT_ROUTE_CHANGE', STATES.AGREEMENT, 'turn', 'buyer');
T(STATES.ROUTE_CHANGE_REQUESTED, 'COUNTER_ROUTE_CHANGE', STATES.COUNTER_OFFER, 'turn', null);
T(STATES.ROUTE_CHANGE_REQUESTED, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
T(STATES.AGREEMENT, 'REQUEST_ROUTE_CHANGE', STATES.ROUTE_CHANGE_REQUESTED, 'buyer', 'seller');
T(STATES.FINAL_AGREEMENT, 'REQUEST_ROUTE_CHANGE', STATES.ROUTE_CHANGE_REQUESTED, 'buyer', 'seller');
T(STATES.AGREEMENT, 'CREATE_BOOKING', STATES.ORDER_CREATED, 'buyer', 'buyer');
T(STATES.FINAL_AGREEMENT, 'CREATE_BOOKING', STATES.ORDER_CREATED, 'buyer', 'buyer');

function nowIso() { return new Date().toISOString(); }

/* ---------- idempotency + audit ---------- */
async function commandAlreadyApplied(db, negotiationId, commandId) {
    if (!commandId) return false;
    // [FIX 2026-09] Query ya field MOJA (negotiationId) + uchujaji kwenye
    // memory — HAIHITAJI composite index. Query ya zamani (negotiationId +
    // commandId, field MBILI) ilikuwa ikirusha hitilafu "internal" kwenye
    // production kwa kila ofa/amri bila composite index.
    let snap;
    try {
        snap = await db.collection('negotiation_events')
            .where('negotiationId', '==', negotiationId)
            .limit(100).get();
    } catch (e) { return false; } // usizuie amri kwa ajili ya index/network
    if (!snap || snap.empty) return false;
    let found = false;
    snap.forEach(function (d) {
        if (!found && d.data().commandId === commandId) found = true;
    });
    return found;
}

async function recordEvent(db, ev) {
    await db.collection('negotiation_events').add(Object.assign({ createdAt: nowIso() }, ev));
}

/* ---------- notifications (reuse existing notifications collection) ---------- */
async function notify(db, uid, title, body, type, meta) {
    if (!uid) return;
    await db.collection('notifications').add({
        userId: uid, title: title, body: body, type: type, read: false,
        createdAt: nowIso(), meta: meta || {}
    });
}

/* ---------- membership + block ---------- */
async function checkParticipants(db, auth, nego) {
    if (nego.sellerId === auth.uid || nego.buyerId === auth.uid) return true;
    if (!nego.conversationId) return false;
    try {
        const cs = await db.doc('conversations/' + nego.conversationId).get();
        if (!cs.exists) return false;
        const c = cs.data();
        return (c.participants || []).indexOf(auth.uid) !== -1;
    } catch (e) { return false; }
}

async function isBlocked(db, a, b) {
    try {
        const s = await db.doc('chatBlocks/' + a + '__' + b).get();
        return !!s.exists;
    } catch (e) { return false; }
}

function roleOf(nego, uid) {
    if (nego.sellerId === uid) return 'seller';
    if (nego.buyerId === uid) return 'buyer';
    return null;
}

/* [COMMERCE 2026-09] ACTOR MODEL (spec §4, §6, §21–§22, §48).
 * The engine must ALWAYS know WHO must act now — by USER ID, not role label.
 *   initiatorId      = aliyeanza majadiliano
 *   currentActorId   = anayetakiwa kutenda SASA
 *   waitingForUserId = anayesubiriwa kujibu (== currentActorId)
 *   lastActorId      = aliyetenda mwisho
 * Legacy docs zilizotumia `turn` (role) pekee zinaendelea kufanya kazi
 * kupitia fallback hapa chini. Server inahesabu hizi — kamwe haiamini client. */
function waitingForId(nego) {
    if (nego.waitingForUserId) return nego.waitingForUserId;
    if (nego.currentActorId) return nego.currentActorId;
    return (nego.turn === 'seller' ? nego.sellerId : nego.buyerId);
}
function actorIdForRole(nego, role) {
    return (role === 'buyer' ? nego.buyerId : nego.sellerId);
}
function applyActorModel(nego, patch, uid, myRole) {
    // Huhesabu currentActorId/waitingForUserId/lastActorId kutoka patch.turn
    // (role) — huduma kuu: hakuna actor ID kutoka client inayoaminiwa.
    const finalTurn = (patch.turn != null) ? patch.turn : (nego.turn || 'buyer');
    const nextActorId = actorIdForRole(nego, finalTurn);
    patch.currentActorId = nextActorId;
    patch.waitingForUserId = nextActorId;
    patch.lastActorId = uid;
    patch.lastActorRole = myRole || null;
    patch.initiatorId = nego.initiatorId || nego.buyerId;
    return patch;
}

/* [COMMERCE 2026-09] TURN + PROPOSAL VERSIONING (spec §21, §32).
 * Kila zamu (turn) hurekodiwa: nani alitenda, action gani, proposalVersion gani.
 * Proposal version hupanda TU kwa amri zinazounda pendekezo jipya.
 * History (proposals zote) inabaki immutable — zamu hazifutiwi kamwe. */
const PROPOSAL_COMMANDS = {
    SEND_OFFER: 1, COUNTER_OFFER: 1, COUNTER_QUANTITY_CHANGE: 1,
    REQUEST_QUANTITY_CHANGE: 1, REQUEST_ADDITIONAL_ITEMS: 1, REQUEST_PRICE_CHANGE: 1,
    CHANGE_SCOPE: 1, COUNTER_SCOPE_CHANGE: 1, REQUEST_SCOPE_CHANGE: 1,
    CHANGE_ROUTE: 1, COUNTER_ROUTE_CHANGE: 1, REQUEST_ROUTE_CHANGE: 1
};
function isProposalCommand(command) { return !!PROPOSAL_COMMANDS[command]; }
function buildTurnRecord(nego, turns, uid, myRole, command, proposalVersion, now) {
    return {
        turnId: (nego.negotiationId || 'n') + '_t' + (turns.length + 1),
        actorId: uid,
        actorRole: myRole,
        action: command,
        proposalVersion: proposalVersion,
        createdAt: now,
        respondedAt: null,
        status: 'open'
    };
}
function applyTurnModel(nego, patch, uid, myRole, command, now) {
    // Funga zamu ya mwisho (open → responded), fungua mpya.
    const turns = (nego.turns || []).map(function (t) { return Object.assign({}, t); });
    if (turns.length) {
        const last = turns[turns.length - 1];
        if (last.status === 'open') { last.status = 'responded'; last.respondedAt = now; }
    }
    const isProposal = isProposalCommand(command);
    const proposalVersion = isProposal ? ((nego.proposalVersion || 0) + 1) : (nego.proposalVersion || 0);
    turns.push(buildTurnRecord(nego, turns, uid, myRole, command, proposalVersion, now));
    patch.turns = turns;
    if (isProposal) patch.proposalVersion = proposalVersion;
    return patch;
}

/* ---------- agreement snapshot (spec §14, §19) ---------- */
function buildAgreement(nego, version) {
    return {
        version: version,
        acceptedProposalVersion: nego.proposalVersion || 0,   // spec §32
        productId: nego.productId || null,
        productTitle: nego.productTitle || '',
        commerceType: nego.commerceType || 'product',
        quantity: nego.quantity || 1,
        originalUnitPrice: nego.originalUnitPrice,
        unitPrice: nego.currentUnitPrice,
        total: (nego.quantity || 1) * (nego.currentUnitPrice || 0),
        currency: nego.currency || 'TZS',
        buyerId: nego.buyerId,
        sellerId: nego.sellerId,
        negotiationId: nego.negotiationId,
        createdAt: nowIso()
    };
}

/* ---------- oda (spec §23): tengeneza `orders` doc kutoka makubaliano ---------- */
async function createOrderDoc(db, nego, negotiationId, agreements) {
    const qty = nego.quantity || 1;
    const unit = nego.currentUnitPrice || 0;
    const total = qty * unit;
    let buyerName = nego.buyerName || nego.buyerId;
    let sellerName = nego.sellerName || nego.sellerId;
    try {
        const [bp, sp] = await Promise.allSettled([db.doc('users/' + nego.buyerId).get(), db.doc('users/' + nego.sellerId).get()]);
        if (bp.status === 'fulfilled' && bp.value.exists) { const u = bp.value.data() || {}; buyerName = u.fullName || u.displayName || buyerName; }
        if (sp.status === 'fulfilled' && sp.value.exists) { const u = sp.value.data() || {}; sellerName = u.fullName || u.displayName || u.shopName || sellerName; }
    } catch (e) { /* majina si lazima */ }
    const orderDoc = {
        negotiationId: negotiationId,
        conversationId: nego.conversationId || null,
        agreementVersion: nego.agreementVersion || (agreements && agreements.length) || 1,
        // [COMMERCE 2026-09] Snapshot ya makubaliano yaliyogandishwa (bei haiwezi
        // kubadilishwa na bei ya sasa ya katalogi baada ya oda kufungwa).
        agreementSnapshot: (agreements && agreements.length) ? agreements[agreements.length - 1] : null,
        productId: nego.productId || null,
        itemId: nego.productId || null,
        itemTitle: nego.productTitle || 'Bidhaa',
        collectionName: nego.productCollection || 'products',
        commerceType: nego.commerceType || 'product',
        buyerId: nego.buyerId,
        buyerName: buyerName,
        sellerId: nego.sellerId,
        sellerName: sellerName,
        quantity: qty,
        unitPrice: unit,
        amount: total,
        currency: nego.currency || 'TZS',
        source: 'negotiation',
        status: 'payment_pending',
        paymentStatus: 'pending',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        date: nowIso()
    };
    // [COMMERCE 2026-09] Service order vs Transport booking (spec §6, §12).
    if (orderDoc.commerceType === 'service') {
        orderDoc.serviceId = nego.serviceId || null;
        orderDoc.itemId = nego.serviceId || null;
        orderDoc.itemTitle = nego.serviceTitle || 'Huduma';
        orderDoc.collectionName = 'services';
        orderDoc.kind = 'service_order';
        orderDoc.scope = nego.scope || '';
        orderDoc.scopeUnit = nego.scopeUnit || '';
        orderDoc.deadline = nego.deadline || '';
        orderDoc.location = nego.location || '';
        orderDoc.requirements = nego.requirements || '';
        // [ORDER FIX] Kabla ya malipo: payment_pending (si 'in_progress').
        orderDoc.serviceStatus = 'payment_pending';
    } else if (orderDoc.commerceType === 'transport') {
        orderDoc.transportId = nego.transportId || null;
        orderDoc.itemId = nego.transportId || null;
        orderDoc.itemTitle = nego.transportTitle || 'Usafiri';
        orderDoc.collectionName = 'ride_requests';
        orderDoc.kind = 'booking';
        orderDoc.route = nego.route || {};
        orderDoc.packageDescription = nego.packageDescription || '';
        orderDoc.packageQuantity = nego.packageQuantity || '';
        orderDoc.fare = nego.currentUnitPrice || 0;
        orderDoc.pickupDate = nego.pickupDate || '';
        orderDoc.pickupTime = nego.pickupTime || '';
        orderDoc.vehicleType = nego.vehicleType || '';
        orderDoc.specialRequirements = nego.specialRequirements || '';
        // [ORDER FIX] Kabla ya malipo: payment_pending (booking haijathibitishwa).
        orderDoc.transportStatus = 'payment_pending';
    }
    const orderRef = await db.collection('orders').add(orderDoc);
    return orderRef;
}

/* ============================================================
 * applyCommand — injini kuu (inatumika na negotiationAction na
 * chatOfferAction-delegation). Inafanya validation zote za spec §30:
 * auth, membership, role/turn, state, version, quantity, price,
 * expiration, block, order/payment status, idempotency.
 * ============================================================ */
async function applyCommand(db, auth, params) {
    const negotiationId = String(params.negotiationId || '');
    const command = String(params.command || '');
    const expectedVersion = params.expectedVersion;
    const commandId = String(params.commandId || '');
    if (!negotiationId || !command) throw new HttpsError('invalid-argument', 'negotiationId na command zinahitajika.');

    const negoRef = db.doc('negotiations/' + negotiationId);
    const snap = await negoRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Majadiliano hayapo.');
    const nego = snap.data();
    const uid = auth.uid;

    // 1) uanachama + block
    if (!(await checkParticipants(db, auth, nego))) throw new HttpsError('permission-denied', 'Huna ruhusa kwenye majadiliano haya.');
    if (await isBlocked(db, nego.buyerId, nego.sellerId) || await isBlocked(db, nego.sellerId, nego.buyerId)) {
        throw new HttpsError('permission-denied', 'Mawasiliano yamezuiwa.');
    }

    // 2) idempotency (spec §32)
    if (commandId && (await commandAlreadyApplied(db, negotiationId, commandId))) {
        return { ok: true, idempotent: true, negotiation: nego };
    }

    // 3) expiration (spec §33)
    const expirable = [STATES.OFFER_SENT, STATES.COUNTER_OFFER, STATES.RE_NEGOTIATION, STATES.DRAFT];
    if (nego.expiresAt && Date.parse(nego.expiresAt) < Date.now() && expirable.indexOf(nego.currentState) !== -1) {
        if (command !== 'EXPIRE_NEGOTIATION') {
            const upd = { currentState: STATES.EXPIRED, updatedAt: nowIso(), version: (nego.version || 0) + 1 };
            await negoRef.update(upd);
            await recordEvent(db, { negotiationId, actorId: 'system', actorRole: 'system', command: 'EXPIRE_NEGOTIATION', previousState: nego.currentState, newState: STATES.EXPIRED, commandId: '', version: upd.version });
            throw new HttpsError('failed-precondition', 'Ofa imeisha muda wake.');
        }
    }

    // 4) version control (spec §31)
    if (expectedVersion != null && Number(expectedVersion) !== Number(nego.version || 0)) {
        throw new HttpsError('failed-precondition', 'Ofa hii imebadilika. Tafadhali refresh.');
    }

    // 5) state transition
    const from = nego.currentState || STATES.DRAFT;
    const def = (TRANSITIONS[from] || {})[command];
    if (!def) throw new HttpsError('failed-precondition', 'Kitendo "' + command + '" hakiruhusiwi kwenye hali "' + from + '".');

    // 6) actor/turn check
    const myRole = roleOf(nego, uid);
    if (!myRole) throw new HttpsError('permission-denied', 'Huna nafasi kwenye majadiliano haya.');
    if (def.actor === 'buyer' && myRole !== 'buyer') throw new HttpsError('permission-denied', 'Mnunuzi pekee anaweza kufanya hili.');
    if (def.actor === 'seller' && myRole !== 'seller') throw new HttpsError('permission-denied', 'Muuzaji pekee anaweza kufanya hili.');
    if (def.actor === 'turn' && uid !== waitingForId(nego)) throw new HttpsError('permission-denied', 'Si zamu yako kujibu sasa.');

    const prevState = from;
    const prevQty = nego.quantity || 1;
    const prevPrice = nego.currentUnitPrice || 0;
    const newVersion = (nego.version || 0) + 1;
    const next = def.to;
    const patch = { currentState: next, version: newVersion, updatedAt: nowIso() };
    let eventKind = command.toLowerCase();

    // 7) command-specific handling
    let orderId = nego.orderId || null;
    let notification = null;
    let history = [];
    let agreements = nego.agreements || [];

    const opposite = (r) => (r === 'buyer' ? 'seller' : 'buyer');
    const nextTurn = def.turnAfter === null ? ((command === 'COUNTER_OFFER' || command === 'CHANGE_SCOPE' || command === 'CHANGE_ROUTE' || command === 'COUNTER_SCOPE_CHANGE' || command === 'COUNTER_ROUTE_CHANGE') ? opposite(myRole) : nego.turn) : def.turnAfter;
    patch.turn = nextTurn;

    if (command === 'SEND_OFFER') {
        const qty = Math.max(1, parseInt(params.quantity, 10) || 1);
        const price = Number(params.price);
        if (!(price > 0)) throw new HttpsError('invalid-argument', 'Bei sahihi inahitajika.');
        patch.quantity = qty;
        patch.currentUnitPrice = price;
        patch.currentTotal = qty * price;
        patch.currentProposedBy = 'buyer';
        patch.expiresAt = params.expiresAt || null;
        history.push({ kind: 'offer_sent', actorId: uid, actorRole: 'buyer', price, quantity: qty, at: nowIso() });
        notification = { to: nego.sellerId, title: '💰 Ofa Mpya', body: (nego.productTitle || 'Bidhaa') + ' · TSh ' + price.toLocaleString() };
    } else if (command === 'COUNTER_OFFER' || command === 'COUNTER_QUANTITY_CHANGE') {
        const price = Number(params.price);
        const qty = command === 'COUNTER_QUANTITY_CHANGE'
            ? Math.max(1, parseInt(params.quantity, 10) || (nego.pendingQuantity || nego.quantity || 1))
            : Math.max(1, parseInt(params.quantity, 10) || (nego.quantity || 1));
        if (!(price > 0)) throw new HttpsError('invalid-argument', 'Bei ya counter inahitajika.');
        patch.quantity = qty;
        patch.currentUnitPrice = price;
        patch.currentTotal = qty * price;
        patch.currentProposedBy = myRole;
        patch.pendingQuantity = null;
        history.push({ kind: 'counter', actorId: uid, actorRole: myRole, price, quantity: qty, at: nowIso() });
        notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: '💰 Counter Ofa', body: (nego.productTitle || 'Bidhaa') + ' · TSh ' + price.toLocaleString() };
    } else if (command === 'REQUEST_QUANTITY_CHANGE' || command === 'REQUEST_ADDITIONAL_ITEMS') {
        const qty = Math.max(1, parseInt(params.quantity, 10) || 0);
        if (!(qty > 0)) throw new HttpsError('invalid-argument', 'Kiasi sahihi kinahitajika.');
        // [spec §24] REQUEST_ADDITIONAL_ITEMS ni kwa ODA ILIYOLIPWA pekee.
        if (command === 'REQUEST_ADDITIONAL_ITEMS') {
            if (!nego.orderId) throw new HttpsError('failed-precondition', 'Oda bado haijafungwa.');
            const oSnap = await db.doc('orders/' + nego.orderId).get();
            const o = oSnap.exists ? oSnap.data() : {};
            if (o.paymentStatus !== 'paid') throw new HttpsError('failed-precondition', 'Oda haijalipwa bado.');
        }
        patch.pendingQuantity = qty;
        patch.pendingUnitPrice = nego.currentUnitPrice || 0;
        history.push({ kind: 'quantity_change', actorId: uid, actorRole: 'buyer', previousQuantity: prevQty, newQuantity: qty, at: nowIso() });
        notification = { to: nego.sellerId, title: '🔔 Ombi la Kubadilisha Kiasi', body: (nego.productTitle || 'Bidhaa') + ': ' + prevQty + ' → ' + qty };
    } else if (command === 'ACCEPT_QUANTITY_CHANGE') {
        const qty = Math.max(1, parseInt(nego.pendingQuantity, 10) || prevQty);
        // [spec §25] Oda ILIYOLIPWA → usibadili oda; tengeneza ADJUSTMENT
        // (malipo mapya kupitia SokoPay), rekodi ya awali haigusiwi.
        if (nego.orderId) {
            let parentPaid = false;
            try {
                const oSnap = await db.doc('orders/' + nego.orderId).get();
                if (oSnap.exists && oSnap.data().paymentStatus === 'paid') parentPaid = true;
            } catch (e) { /* assume not paid */ }
            if (parentPaid) {
                const additionalQty = Math.max(1, qty - prevQty);
                const amount = additionalQty * (nego.currentUnitPrice || 0);
                const adjRef = await db.collection('order_adjustments').add({
                    negotiationId: negotiationId,
                    parentOrderId: nego.orderId,
                    productId: nego.productId || null,
                    productTitle: nego.productTitle || '',
                    quantity: additionalQty,
                    unitPrice: nego.currentUnitPrice || 0,
                    amount: amount,
                    currency: nego.currency || 'TZS',
                    status: 'payment_pending',
                    paymentStatus: 'pending',
                    requestedBy: nego.buyerId,
                    approvedBy: uid,
                    createdAt: nowIso()
                });
                await db.doc('orders/' + nego.orderId).update({ adjustments: admin.firestore.FieldValue.arrayUnion({ adjustmentId: adjRef.id, productTitle: nego.productTitle || '', quantity: additionalQty, unitPrice: nego.currentUnitPrice || 0, amount: amount, paymentStatus: 'pending', createdAt: nowIso() }) });
                patch.currentState = STATES.ORDER_CREATED;   // baki kwenye oda — rekodi ya awali haibadiliki
                patch.turn = 'buyer';
                patch.pendingQuantity = null;
                history.push({ kind: 'adjustment', actorId: uid, actorRole: 'seller', adjustmentId: adjRef.id, quantity: additionalQty, amount: amount, at: nowIso() });
                applyActorModel(nego, patch, uid, myRole);   // spec §4/§6: actor model
                applyTurnModel(nego, patch, uid, myRole, command, nowIso());  // spec §21/§32
                patch.history = (nego.history || []).concat(history);
                await negoRef.update(patch);
                await recordEvent(db, { negotiationId, actorId: uid, actorRole: myRole, command: command, previousState: prevState, newState: patch.currentState, previousQuantity: prevQty, newQuantity: qty, previousPrice: prevPrice, newPrice: nego.currentUnitPrice, commandId: commandId, version: newVersion });
                if (notification && notification.to) { await notify(db, notification.to, notification.title, notification.body, 'negotiation', { negotiationId: negotiationId, command: command, adjustmentId: adjRef.id }); }
                const fresh2 = (await negoRef.get()).data();
                return { ok: true, command: command, status: fresh2.currentState, adjustmentId: adjRef.id, negotiation: fresh2, negotiationId: negotiationId };
            }
        }
        patch.quantity = qty;
        patch.currentTotal = qty * (nego.currentUnitPrice || 0);
        patch.pendingQuantity = null;
        patch.agreementVersion = (agreements.length + 1);
        agreements = agreements.concat([buildAgreement(Object.assign({}, nego, { quantity: qty, negotiationId: negotiationId }), agreements.length + 1)]);
        patch.agreements = agreements;
        history.push({ kind: 'agreement', actorId: uid, actorRole: 'seller', agreementVersion: agreements.length, quantity: qty, at: nowIso() });
        notification = { to: nego.buyerId, title: '🟢 Makubaliano ya Mwisho', body: (nego.productTitle || 'Bidhaa') + ' × ' + qty + ' · TSh ' + (qty * (nego.currentUnitPrice || 0)).toLocaleString() };
    } else if (command === 'REJECT_QUANTITY_CHANGE') {
        patch.pendingQuantity = null;
        history.push({ kind: 'quantity_rejected', actorId: uid, actorRole: 'seller', at: nowIso() });
        notification = { to: nego.buyerId, title: '❌ Ombi Limekataliwa', body: 'Muuzaji amekataa mabadiliko ya kiasi.' };
    } else if (command === 'ACCEPT_OFFER') {
        const qty = nego.pendingQuantity ? Math.max(1, parseInt(nego.pendingQuantity, 10) || nego.quantity || 1) : (nego.quantity || 1);
        patch.quantity = qty;
        patch.currentTotal = qty * (nego.currentUnitPrice || 0);
        patch.pendingQuantity = null;
        patch.agreementVersion = (agreements.length + 1);
        agreements = agreements.concat([buildAgreement(Object.assign({}, nego, { quantity: qty, negotiationId: negotiationId }), agreements.length + 1)]);
        patch.agreements = agreements;
        const isFinal = next === STATES.FINAL_AGREEMENT;
        history.push({ kind: 'accepted', actorId: uid, actorRole: myRole, price: nego.currentUnitPrice, quantity: qty, agreementVersion: agreements.length, at: nowIso() });
        notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: '🤝 Ofa Imekubaliwa', body: (nego.productTitle || 'Bidhaa') + ' · TSh ' + Number(nego.currentUnitPrice || 0).toLocaleString() + (isFinal ? ' (Makubaliano ya Mwisho)' : '') };
    } else if (command === 'REJECT_OFFER') {
        if (from === STATES.RE_NEGOTIATION) {
            // Kurudi kwenye makubaliano ya awali — usifute historia (spec §19).
            patch.currentState = STATES.AGREEMENT;
            patch.turn = 'buyer';
            patch.pendingQuantity = null;
        }
        history.push({ kind: 'rejected', actorId: uid, actorRole: myRole, at: nowIso() });
        notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: '❌ Ofa Imekataliwa', body: 'Ofa imekataliwa.' };
    } else if (command === 'REQUEST_PRICE_CHANGE') {
        history.push({ kind: 'price_change_request', actorId: uid, actorRole: 'buyer', at: nowIso() });
        notification = { to: nego.sellerId, title: '💰 Ombi la Kubadilisha Bei', body: (nego.productTitle || 'Bidhaa') + ' — mnunuzi anataka bei nyingine.' };
    } else if (command === 'CREATE_ORDER' || command === 'CREATE_BOOKING') {
        // Oda/booking inaundwa HAPA tu (spec §23, §12) — baada ya makubaliano.
        const orderRef = await createOrderDoc(db, nego, negotiationId, agreements);
        orderId = orderRef.id;
        patch.orderId = orderId;
        history.push({ kind: 'order_created', actorId: uid, actorRole: 'buyer', orderId: orderId, at: nowIso() });
        if (command === 'CREATE_BOOKING') {
            notification = { to: nego.sellerId, title: '📅 Booking Imefungwa', body: 'Booking #' + orderId + ' · ' + (nego.transportTitle || 'Usafiri') };
            // [REQUEST ROUTING 2026-09] Tuma booking kwa Routing Engine:
            // tengeneza ride_request + ofa kwa mawakala/madereva waliostahili.
            // Haipaswi kuvuruga kufungwa kwa booking ikishindwa (mteja ana
            // kitufe cha kurudia routing).
            try {
                const routing = require('./routing');
                await routing._core.routeBookingFromOrder(db, orderId, { actorId: uid, round: 1 });
            } catch (e) { /* routing yaweza kurudiwa baadaye */ }
        } else {
            notification = { to: nego.sellerId, title: '🛒 Oda Imefungwa', body: 'Oda #' + orderId + ' · ' + (nego.serviceTitle || nego.productTitle || 'Bidhaa') + ' · TSh ' + ((nego.quantity || 1) * (nego.currentUnitPrice || 0)).toLocaleString() };
        }
    } else if (command === 'CHANGE_SCOPE') {
        if (params.scope == null && params.deadline == null && !(Number(params.price) > 0)) throw new HttpsError('invalid-argument', 'Scope, deadline au bei inahitajika.');
        if (params.scope != null) patch.pendingScope = String(params.scope);
        if (params.scopeUnit != null) patch.pendingScopeUnit = String(params.scopeUnit);
        if (params.deadline != null) patch.pendingDeadline = String(params.deadline);
        if (params.location != null) patch.pendingLocation = String(params.location);
        if (params.requirements != null) patch.pendingRequirements = String(params.requirements);
        if (Number(params.price) > 0) patch.pendingUnitPrice = Number(params.price);
        history.push({ kind: 'scope_change', actorId: uid, actorRole: myRole, scope: params.scope, deadline: params.deadline, price: params.price, at: nowIso() });
        notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: '🔧 Ombi la Kubadilisha Scope', body: (nego.serviceTitle || 'Huduma') + (params.scope ? ' · ' + params.scope : '') };
    } else if (command === 'REQUEST_SCOPE_CHANGE') {
        if (params.scope == null && params.deadline == null) throw new HttpsError('invalid-argument', 'Scope au deadline inahitajika.');
        if (params.scope != null) patch.pendingScope = String(params.scope);
        if (params.deadline != null) patch.pendingDeadline = String(params.deadline);
        history.push({ kind: 'scope_change', actorId: uid, actorRole: 'buyer', scope: params.scope, deadline: params.deadline, at: nowIso() });
        notification = { to: nego.sellerId, title: '🔧 Ombi la Kubadilisha Scope', body: (nego.serviceTitle || 'Huduma') + (params.scope ? ' · ' + params.scope : '') };
    } else if (command === 'ACCEPT_SCOPE_CHANGE') {
        if (nego.pendingScope != null) patch.scope = nego.pendingScope;
        if (nego.pendingScopeUnit != null) patch.scopeUnit = nego.pendingScopeUnit;
        if (nego.pendingDeadline != null) patch.deadline = nego.pendingDeadline;
        if (nego.pendingLocation != null) patch.location = nego.pendingLocation;
        if (nego.pendingRequirements != null) patch.requirements = nego.pendingRequirements;
        if (nego.pendingUnitPrice > 0) { patch.currentUnitPrice = nego.pendingUnitPrice; patch.currentTotal = (nego.quantity || 1) * nego.pendingUnitPrice; }
        patch.pendingScope = null; patch.pendingScopeUnit = null; patch.pendingDeadline = null; patch.pendingLocation = null; patch.pendingRequirements = null; patch.pendingUnitPrice = null;
        patch.agreementVersion = (agreements.length + 1);
        agreements = agreements.concat([buildAgreement(Object.assign({}, nego, { scope: patch.scope != null ? patch.scope : nego.scope, deadline: patch.deadline != null ? patch.deadline : nego.deadline, negotiationId: negotiationId }), agreements.length + 1)]);
        patch.agreements = agreements;
        history.push({ kind: 'agreement', actorId: uid, actorRole: 'seller', agreementVersion: agreements.length, scope: patch.scope, at: nowIso() });
        notification = { to: nego.buyerId, title: '🟢 Scope Imekubaliwa', body: (nego.serviceTitle || 'Huduma') + ' · Makubaliano ya mwisho' };
    } else if (command === 'REJECT_SCOPE_CHANGE') {
        patch.pendingScope = null; patch.pendingScopeUnit = null; patch.pendingDeadline = null; patch.pendingLocation = null; patch.pendingRequirements = null; patch.pendingUnitPrice = null;
        history.push({ kind: 'scope_rejected', actorId: uid, actorRole: 'seller', at: nowIso() });
        notification = { to: nego.buyerId, title: '❌ Scope Imekataliwa', body: 'Mtoa huduma amekataa mabadiliko ya scope.' };
    } else if (command === 'COUNTER_SCOPE_CHANGE') {
        const price = Number(params.price);
        if (!(price > 0)) throw new HttpsError('invalid-argument', 'Bei ya counter inahitajika.');
        patch.scope = params.scope != null ? String(params.scope) : (nego.pendingScope || nego.scope || '');
        if (params.scopeUnit != null) patch.scopeUnit = String(params.scopeUnit);
        if (params.deadline != null) patch.deadline = String(params.deadline);
        patch.currentUnitPrice = price;
        patch.currentTotal = (nego.quantity || 1) * price;
        patch.currentProposedBy = myRole;
        patch.pendingScope = null; patch.pendingScopeUnit = null; patch.pendingDeadline = null; patch.pendingLocation = null; patch.pendingRequirements = null; patch.pendingUnitPrice = null;
        history.push({ kind: 'counter', actorId: uid, actorRole: myRole, price, scope: patch.scope, at: nowIso() });
        notification = { to: nego.buyerId, title: '💰 Counter Scope', body: (nego.serviceTitle || 'Huduma') + ' · TSh ' + price.toLocaleString() };
    } else if (command === 'CHANGE_ROUTE' || command === 'REQUEST_ROUTE_CHANGE') {
        const route = params.route || {};
        if (!route.from && !route.to && params.pickupDate == null && params.pickupTime == null && params.vehicleType == null && params.packageDescription == null && !(Number(params.price) > 0)) {
            throw new HttpsError('invalid-argument', 'Maelezo ya njia yanahitajika.');
        }
        if (route.from || route.to) {
            const cur = nego.route || {};
            patch.pendingRoute = { from: route.from || cur.from || '', to: route.to || cur.to || '' };
        }
        if (params.pickupDate != null) patch.pendingPickupDate = String(params.pickupDate);
        if (params.pickupTime != null) patch.pendingPickupTime = String(params.pickupTime);
        if (params.vehicleType != null) patch.pendingVehicleType = String(params.vehicleType);
        if (params.packageDescription != null) patch.pendingPackageDescription = String(params.packageDescription);
        if (Number(params.price) > 0) patch.pendingUnitPrice = Number(params.price);
        history.push({ kind: 'route_change', actorId: uid, actorRole: myRole, route, at: nowIso() });
        notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: '🗺️ Ombi la Kubadilisha Njia', body: (nego.transportTitle || 'Usafiri') + (route.from && route.to ? ' · ' + route.from + ' → ' + route.to : '') };
    } else if (command === 'ACCEPT_ROUTE_CHANGE') {
        if (nego.pendingRoute) patch.route = nego.pendingRoute;
        if (nego.pendingPickupDate != null) patch.pickupDate = nego.pendingPickupDate;
        if (nego.pendingPickupTime != null) patch.pickupTime = nego.pendingPickupTime;
        if (nego.pendingVehicleType != null) patch.vehicleType = nego.pendingVehicleType;
        if (nego.pendingPackageDescription != null) patch.packageDescription = nego.pendingPackageDescription;
        if (nego.pendingUnitPrice > 0) { patch.currentUnitPrice = nego.pendingUnitPrice; patch.currentTotal = (nego.quantity || 1) * nego.pendingUnitPrice; }
        patch.pendingRoute = null; patch.pendingPickupDate = null; patch.pendingPickupTime = null; patch.pendingVehicleType = null; patch.pendingPackageDescription = null; patch.pendingUnitPrice = null;
        patch.agreementVersion = (agreements.length + 1);
        agreements = agreements.concat([buildAgreement(Object.assign({}, nego, { route: patch.route || nego.route, negotiationId: negotiationId }), agreements.length + 1)]);
        patch.agreements = agreements;
        history.push({ kind: 'agreement', actorId: uid, actorRole: 'seller', agreementVersion: agreements.length, route: patch.route, at: nowIso() });
        notification = { to: nego.buyerId, title: '🟢 Njia Imekubaliwa', body: (nego.transportTitle || 'Usafiri') + ' · Makubaliano ya mwisho' };
    } else if (command === 'REJECT_ROUTE_CHANGE') {
        patch.pendingRoute = null; patch.pendingPickupDate = null; patch.pendingPickupTime = null; patch.pendingVehicleType = null; patch.pendingPackageDescription = null; patch.pendingUnitPrice = null;
        history.push({ kind: 'route_rejected', actorId: uid, actorRole: 'seller', at: nowIso() });
        notification = { to: nego.buyerId, title: '❌ Njia Imekataliwa', body: 'Mtoa usafiri amekataa mabadiliko ya njia.' };
    } else if (command === 'COUNTER_ROUTE_CHANGE') {
        const price = Number(params.price);
        if (!(price > 0)) throw new HttpsError('invalid-argument', 'Nauli ya counter inahitajika.');
        const route = params.route || {};
        if (route.from || route.to) {
            const cur = (nego.pendingRoute || nego.route) || {};
            patch.route = { from: route.from || cur.from || '', to: route.to || cur.to || '' };
        }
        patch.currentUnitPrice = price;
        patch.currentTotal = (nego.quantity || 1) * price;
        patch.currentProposedBy = myRole;
        patch.pendingRoute = null; patch.pendingPickupDate = null; patch.pendingPickupTime = null; patch.pendingVehicleType = null; patch.pendingPackageDescription = null; patch.pendingUnitPrice = null;
        history.push({ kind: 'counter', actorId: uid, actorRole: myRole, price, route: patch.route, at: nowIso() });
        notification = { to: nego.buyerId, title: '💰 Counter Njia', body: (nego.transportTitle || 'Usafiri') + ' · TSh ' + price.toLocaleString() };
    } else if (command === 'CANCEL_NEGOTIATION') {
        history.push({ kind: 'cancelled', actorId: uid, actorRole: myRole, at: nowIso() });
        notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: '✖ Majadiliano Yamefutwa', body: 'Majadiliano yamefutwa na ' + myRole + '.' };
    } else if (command === 'EXPIRE_NEGOTIATION') {
        history.push({ kind: 'expired', actorId: 'system', actorRole: 'system', at: nowIso() });
    }

    // 7.5) ACTOR MODEL (spec §4/§6/§21–§22): WHO must act next.
    // Inahesabiwa server-side kutoka patch.turn — kamwe kutoka client.
    applyActorModel(nego, patch, uid, myRole);

    // 7.6) TURN + PROPOSAL VERSIONING (spec §21, §32).
    applyTurnModel(nego, patch, uid, myRole, command, nowIso());

    // 8) kuandika
    if (history.length) patch.history = (nego.history || []).concat(history);
    await negoRef.update(patch);

    // 9) audit event (spec §41)
    await recordEvent(db, {
        negotiationId: negotiationId,
        actorId: uid,
        actorRole: myRole,
        command: command,
        previousState: prevState,
        newState: patch.currentState,
        previousQuantity: prevQty,
        newQuantity: patch.quantity,
        previousPrice: prevPrice,
        newPrice: patch.currentUnitPrice,
        commandId: commandId,
        version: newVersion
    });

    // 10) notification (spec §34)
    if (notification && notification.to) {
        await notify(db, notification.to, notification.title, notification.body, 'negotiation', { negotiationId: negotiationId, command: command, orderId: orderId });
    }

    const fresh = (await negoRef.get()).data();
    return { ok: true, command: command, status: fresh.currentState, orderId: orderId, negotiation: fresh, negotiationId: negotiationId };
}

/* ============================================================
 * negotiationSendOffer — mnunuzi anatuma ofa ya kwanza.
 * ============================================================ */
exports.negotiationSendOffer = onCall({ region: REGION }, async (req) => {
    const auth = req.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    const data = req.data || {};
    const conversationId = String(data.conversationId || '');
    const productId = data.productId != null ? String(data.productId) : '';
    const sellerId = String(data.sellerId || '');
    const buyerId = auth.uid;
    const quantity = Math.max(1, parseInt(data.quantity, 10) || 1);
    const price = Number(data.price);
    const note = String(data.note || '').slice(0, 500);
    const commandId = String(data.commandId || '');

    if (!productId || !sellerId) throw new HttpsError('invalid-argument', 'Bidhaa na muuzaji zinahitajika.');
    if (!(price > 0)) throw new HttpsError('invalid-argument', 'Bei sahihi inahitajika.');
    if (sellerId === buyerId) throw new HttpsError('invalid-argument', 'Huwezi kujitolea ofa mwenyewe.');

    // membership (ikiwa conversation ipo)
    if (conversationId) {
        try {
            const cs = await db.doc('conversations/' + conversationId).get();
            if (cs.exists) {
                const c = cs.data();
                if ((c.participants || []).indexOf(buyerId) === -1) throw new HttpsError('permission-denied', 'Huna ruhusa kwenye mazungumzo haya.');
            }
        } catch (e) { if (e instanceof HttpsError) throw e; }
    }

    // block check
    if (await isBlocked(db, buyerId, sellerId) || await isBlocked(db, sellerId, buyerId)) {
        throw new HttpsError('permission-denied', 'Mawasiliano yamezuiwa.');
    }

    // bidhaa ya kweli? (product/service/driver) — kama inapatikana
    let productCollection = String(data.productCollection || 'products');
    let productTitle = String(data.productTitle || '').slice(0, 200);
    let productImage = String(data.productImage || '').slice(0, 500);
    let originalUnitPrice = null;
    try {
        const ps = await db.doc(productCollection + '/' + productId).get();
        if (ps.exists) {
            const p = ps.data();
            productTitle = productTitle || p.title || p.name || p.driverName || 'Bidhaa';
            productImage = productImage || p.image || (p.images && p.images[0]) || '';
            originalUnitPrice = (p.price != null) ? Number(p.price) : null;
        }
    } catch (e) { /* endelea bila meta ya bidhaa */ }

    let buyerName = auth.token && auth.token.email ? auth.token.email.split('@')[0] : buyerId;
    try { const b = await db.doc('users/' + buyerId).get(); if (b.exists) { const u = b.data() || {}; buyerName = u.fullName || u.displayName || buyerName; } } catch (e) {}

    const negoId = db.collection('negotiations').doc().id;
    const now = nowIso();
    const negotiation = {
        negotiationId: negoId,
        conversationId: conversationId || null,
        productId: productId,
        productCollection: productCollection,
        productTitle: productTitle,
        productImage: productImage,
        commerceType: String(data.commerceType || 'product'),
        sellerId: sellerId,
        buyerId: buyerId,
        buyerName: buyerName,
        sellerName: String(data.sellerName || sellerId).slice(0, 200),
        // [COMMERCE 2026-09] Actor model (spec §4/§6/§21–§22) — server-derived.
        initiatorId: buyerId,
        demandSideUserId: buyerId,   // normalized: demand = buyer/customer
        supplySideUserId: sellerId,  // normalized: supply = seller/provider/transporter
        currentActorId: sellerId,    // muuzaji anasubiriwa kujibu ofa ya kwanza
        waitingForUserId: sellerId,
        lastActorId: buyerId,
        currency: 'TZS',
        currentState: STATES.OFFER_SENT,
        turn: 'seller',
        quantity: quantity,
        originalUnitPrice: originalUnitPrice,
        currentUnitPrice: price,
        currentTotal: quantity * price,
        currentProposedBy: 'buyer',
        agreementVersion: 0,
        agreements: [],
        proposalVersion: 1,   // spec §32 — ofa ya kwanza = proposal v1
        turns: [{ turnId: negoId + '_t1', actorId: buyerId, actorRole: 'buyer', action: 'SEND_OFFER', proposalVersion: 1, createdAt: now, respondedAt: null, status: 'open' }],
        history: [{ kind: 'offer_sent', actorId: buyerId, actorRole: 'buyer', price: price, quantity: quantity, at: now }],
        version: 1,
        expiresAt: data.expiresAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        createdAt: now,
        updatedAt: now
    };
    // [NEGO MODULE 01 2026-09] Maelezo ya ziada ya ofa ya kwanza (fomu yenye
    // muktadha) — yamehifadhiwa bila kugusa bei ya sokoni wala oda.
    negotiation.notes = String(data.notes || data.note || '').slice(0, 600);

    // [COMMERCE 2026-09] Terms za Service / Transport (spec §6, §10, §12).
    if (negotiation.commerceType === 'service') {
        negotiation.serviceId = String(data.serviceId || productId || '');
        negotiation.serviceTitle = String(data.serviceTitle || productTitle || 'Huduma');
        negotiation.scope = String(data.scope || '');
        negotiation.scopeUnit = String(data.scopeUnit || '');
        negotiation.deadline = String(data.deadline || '');
        negotiation.deadlineDate = String(data.deadlineDate || '');
        negotiation.location = String(data.location || '');
        negotiation.requirements = String(data.requirements || '');
    } else if (negotiation.commerceType === 'transport') {
        negotiation.transportId = String(data.transportId || productId || '');
        negotiation.transportTitle = String(data.transportTitle || productTitle || 'Usafiri');
        negotiation.route = (data.route && typeof data.route === 'object') ? {
            from: String(data.route.from || ''),
            to: String(data.route.to || '')
        } : {};
        negotiation.packageDescription = String(data.packageDescription || '');
        negotiation.packageQuantity = String(data.packageQuantity || '');
        const w = Number(data.weight);
        negotiation.weight = Number.isFinite(w) && w >= 0 ? w : null;
        negotiation.pickupDate = String(data.pickupDate || '');
        negotiation.pickupTime = String(data.pickupTime || '');
        negotiation.deliveryDeadline = String(data.deliveryDeadline || '');
        negotiation.vehicleType = String(data.vehicleType || '');
        negotiation.specialRequirements = String(data.specialRequirements || '');
        // Nauli ni ya safari nzima — jumla = nauli (si idadi × vifurushi).
        negotiation.quantity = 1;
        negotiation.currentTotal = price;
    } else {
        // [NEGO MODULE 01] Product-only: chaguzi/vipimo + mapendeleo ya uwasilishaji.
        if (data.variants && typeof data.variants === 'object' && !Array.isArray(data.variants)) {
            const clean = {};
            ['size', 'color', 'model', 'condition', 'weight', 'package'].forEach((k) => {
                if (data.variants[k] != null && String(data.variants[k]).trim()) {
                    clean[k] = String(data.variants[k]).trim().slice(0, 60);
                }
            });
            negotiation.variants = Object.keys(clean).length ? clean : null;
        } else {
            negotiation.variants = null;
        }
        negotiation.deliveryLocation = String(data.deliveryLocation || '').slice(0, 120);
        negotiation.preferredDate = String(data.preferredDate || '');
    }

    await db.doc('negotiations/' + negoId).set(negotiation);

    // ofa (reuse existing offers collection)
    const offerRef = await db.collection('offers').add({
        negotiationId: negoId,
        conversationId: conversationId || null,
        productId: productId,
        productTitle: productTitle,
        productCollection: productCollection,
        buyerId: buyerId,
        sellerId: sellerId,
        quantity: quantity,
        currentPrice: originalUnitPrice,
        proposedPrice: price,
        message: note,
        counterOf: null,
        status: 'pending',
        expiresAt: negotiation.expiresAt,
        createdAt: now,
        updatedAt: now
    });
    await db.doc('negotiations/' + negoId).update({ currentOfferId: offerRef.id });

    await recordEvent(db, {
        negotiationId: negoId, actorId: buyerId, actorRole: 'buyer', command: 'SEND_OFFER',
        previousState: STATES.DRAFT, newState: STATES.OFFER_SENT,
        previousQuantity: null, newQuantity: quantity, previousPrice: null, newPrice: price,
        commandId: commandId, version: 1
    });

    await notify(db, sellerId, '💰 Ofa Mpya', (productTitle || 'Bidhaa') + ' · TSh ' + price.toLocaleString(), 'negotiation', { negotiationId: negoId, conversationId: conversationId || null });

    return { ok: true, negotiationId: negoId, offerId: offerRef.id, negotiation: negotiation };
});

/* ============================================================
 * negotiationAction — injini moja ya amri zote (spec §6).
 * ============================================================ */
exports.negotiationAction = onCall({ region: REGION }, async (req) => {
    const auth = req.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    const data = req.data || {};
    return applyCommand(admin.firestore(), auth, data);
});

/* ============================================================
 * applyCommandByOffer — daraja la backward-compat kwa chatOfferAction
 * (ofa za zamani bila negotiationId → tunaunda negotiation kwa njia
 * ya uvivu, kisha tunapita kwenye injini MOJA).
 * ============================================================ */
async function applyCommandByOffer(db, auth, params) {
    const offerId = String(params.offerId || '');
    if (!offerId) throw new HttpsError('invalid-argument', 'offerId inahitajika.');
    const offerRef = db.doc('offers/' + offerId);
    const snap = await offerRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Ofa haipo.');
    const of = snap.data();
    const now = nowIso();

    // Orodhesha action → command
    const map = { accept: 'ACCEPT_OFFER', counter: 'COUNTER_OFFER', reject: 'REJECT_OFFER' };
    const command = map[params.action] || params.command;
    if (!command) throw new HttpsError('invalid-argument', 'action/command inahitajika.');

    let negoId = of.negotiationId || null;
    if (!negoId) {
        // Lazy migration: ofa ya zamani → negotiation mpya.
        if (of.status !== 'pending') throw new HttpsError('failed-precondition', 'Ofa tayari imejibiwa.');
        negoId = db.collection('negotiations').doc().id;
        const negotiation = {
            negotiationId: negoId,
            conversationId: of.conversationId || null,
            productId: of.productId || null,
            productCollection: of.productCollection || 'products',
            productTitle: of.productTitle || 'Bidhaa',
            productImage: of.productImage || '',
            commerceType: 'product',
            sellerId: of.sellerId,
            buyerId: of.buyerId,
            buyerName: of.buyerId,
            sellerName: of.sellerId,
            initiatorId: of.buyerId,
            demandSideUserId: of.buyerId,
            supplySideUserId: of.sellerId,
            currentActorId: of.sellerId,
            waitingForUserId: of.sellerId,
            lastActorId: of.buyerId,
            currency: 'TZS',
            currentState: STATES.OFFER_SENT,
            turn: 'seller',
            quantity: Math.max(1, parseInt(of.quantity, 10) || 1),
            originalUnitPrice: of.currentPrice != null ? Number(of.currentPrice) : null,
            currentUnitPrice: Number(of.proposedPrice),
            currentTotal: (Math.max(1, parseInt(of.quantity, 10) || 1)) * Number(of.proposedPrice),
            currentProposedBy: 'buyer',
            agreementVersion: 0,
            agreements: [],
            proposalVersion: 1,
            turns: [{ turnId: negoId + '_t1', actorId: of.buyerId, actorRole: 'buyer', action: 'SEND_OFFER', proposalVersion: 1, createdAt: now, respondedAt: null, status: 'open' }],
            history: [{ kind: 'offer_sent', actorId: of.buyerId, actorRole: 'buyer', price: Number(of.proposedPrice), quantity: Math.max(1, parseInt(of.quantity, 10) || 1), at: now }],
            version: 1,
            expiresAt: of.expiresAt || null,
            createdAt: now,
            updatedAt: now,
            currentOfferId: offerId
        };
        await db.doc('negotiations/' + negoId).set(negotiation);
        await offerRef.update({ negotiationId: negoId });
    }

    const res = await applyCommand(db, auth, {
        negotiationId: negoId,
        command: command,
        offerId: offerId,
        price: params.counterPrice,
        quantity: params.quantity,
        commandId: params.commandId || '',
        expectedVersion: params.expectedVersion
    });

    // [NEGO 2026-09] Kukubali ofa ya ZAMANI = kufunga oda (kama zamani),
    // ili UI ya zamani (orderId → Smart Cart) iendelee kufanya kazi bila mabadiliko.
    if (command === 'ACCEPT_OFFER' && (res.status === 'AGREEMENT' || res.status === 'FINAL_AGREEMENT') && !res.orderId) {
        const freshNego = res.negotiation || (await db.doc('negotiations/' + negoId).get()).data();
        const orderRef = await createOrderDoc(db, freshNego, negoId, freshNego.agreements || []);
        const upd = {
            orderId: orderRef.id,
            currentState: STATES.ORDER_CREATED,
            version: (freshNego.version || 0) + 1,
            updatedAt: now,
            history: (freshNego.history || []).concat([{ kind: 'order_created', actorId: 'system', actorRole: 'buyer', orderId: orderRef.id, at: now }])
        };
        await db.doc('negotiations/' + negoId).update(upd);
        await recordEvent(db, { negotiationId: negoId, actorId: auth.uid, actorRole: 'buyer', command: 'CREATE_ORDER', previousState: res.status, newState: STATES.ORDER_CREATED, previousQuantity: freshNego.quantity, newQuantity: freshNego.quantity, previousPrice: freshNego.currentUnitPrice, newPrice: freshNego.currentUnitPrice, commandId: '', version: upd.version });
        // [REQUEST ROUTING 2026-09] Booking ya usafiri ikifungwa kupitia
        // njia ya zamani (ACCEPT_OFFER) pia ipite Routing Engine.
        if ((freshNego.commerceType || '') === 'transport') {
            try {
                const routing = require('./routing');
                await routing._core.routeBookingFromOrder(db, orderRef.id, { actorId: auth.uid, round: 1 });
            } catch (e) { /* routing yaweza kurudiwa baadaye */ }
        }
        res.orderId = orderRef.id;
        res.status = STATES.ORDER_CREATED;
        res.negotiation = (await db.doc('negotiations/' + negoId).get()).data();
    }

    // Sawazisha hali ya ofa ili UI ya zamani isionyeshe "pending".
    if (res.status) {
        const offerStatus = { AGREEMENT: 'accepted', FINAL_AGREEMENT: 'accepted', ORDER_CREATED: 'accepted', REJECTED: 'rejected', COUNTER_OFFER: 'countered', RE_NEGOTIATION: 'countered', CANCELLED: 'cancelled', EXPIRED: 'expired' }[res.status];
        if (offerStatus) {
            await offerRef.update({ status: offerStatus, orderId: res.orderId || null, respondedBy: auth.uid, updatedAt: now });
        }
    }
    return res;
}

exports.applyCommandByOffer = applyCommandByOffer;
exports.applyCommand = applyCommand;
exports.STATES = STATES;
exports.TERMINAL = TERMINAL;
exports.TRANSITIONS = TRANSITIONS;
exports.nowIso = nowIso;
exports.buildAgreement = buildAgreement;

/* ============================================================
 * negotiationOrderAction — [DELIVERY FLOW 2026-09] injini ya
 * Uwasilishaji wa oda iliyotokana na majadiliano (spec §23–§26, §37).
 *
 * Kanuni: SERVER ndiye anabadilisha delivery state; chat HAIWEZI.
 * Oda zake (source:'negotiation') hufuata mtiririko:
 *
 *   payment_pending → held (imelipwa — SokoPay/PesaPal) 
 *   → prepared/shipped (muuzaji ameandaa)
 *   → in_transit (amesafirisha)
 *   → delivered (imewasilishwa)
 *   → completed (mnunuzi amethibitisha kupokea) → ⭐ tathmini.
 *
 * `status` inatumia msamiati ULIOPO wa `orders` (shipped/in_transit/
 * delivered/completed) ili jopo la oda lililopo liendelee kufanya kazi.
 * `deliveryStatus` ni lebo ya kirafiki ya pipeline (spec §35).
 * ============================================================ */
// [COMMERCE 2026-09] Transitions zinafata AINA ya oda (bidhaa/huduma/usafiri).
// `stage` huandikwa kwenye deliveryStatus/serviceStatus/transportStatus;
// `status` huandikwa kwenye msamiati wa jumla wa `orders` (held/completed).
const ORDER_STAGE_FIELD = (t) => (t === 'service' ? 'serviceStatus' : (t === 'transport' ? 'transportStatus' : 'deliveryStatus'));
const PRODUCT_ORDER_DEFS = {
    PREPARE_ORDER:    { from: ['held', 'shipped', 'prepared'], actor: 'seller', stage: 'prepared', status: 'shipped', at: 'preparedAt', notif: { title: '📦 Oda Imetayarishwa', body: 'Muuzaji ameandaa bidhaa yako na iko tayari kusafirishwa.' } },
    START_TRANSIT:    { from: ['prepared', 'shipped'], actor: 'seller', stage: 'in_transit', status: 'in_transit', at: 'inTransitAt', notif: { title: '🚚 Bidhaa Yako Iko Njia', body: 'Oda yako imesafirishwa na iko njiani kwako.' } },
    MARK_DELIVERED:   { from: ['in_transit'], actor: 'seller', stage: 'delivered', status: 'delivered', at: 'deliveredAt', notif: { title: '📍 Mzigo Umewasilishwa', body: 'Mzigo wako umewasilishwa. Thibitisha kupokea.' } },
    CONFIRM_RECEIPT:  { from: ['delivered'], actor: 'buyer', stage: 'confirmed', status: 'completed', at: 'completedAt', notif: { title: '✅ Mnunuzi Amethibitisha Kupokea', body: 'Mnunuzi amethibitisha kupokea mzigo. Asante!' } }
};
const SERVICE_ORDER_DEFS = {
    START_SERVICE:       { from: ['held'], actor: 'seller', stage: 'service_in_progress', status: 'held', at: 'serviceStartedAt', notif: { title: '🛠️ Kazi Imeanza', body: 'Mtoa huduma ameanza kazi yako.' } },
    SUBMIT_WORK:         { from: ['service_in_progress', 'revision_requested'], actor: 'seller', stage: 'service_submitted', status: 'held', at: 'serviceSubmittedAt', notif: { title: '📤 Kazi Imewasilishwa', body: 'Kazi yako imewasilishwa. Tafadhali kagua na uthibitishe.' } },
    REQUEST_REVISION:    { from: ['service_submitted'], actor: 'buyer', stage: 'revision_requested', status: 'held', at: 'revisionRequestedAt', notif: { title: '🔁 Marekebisho Yameombwa', body: 'Mteja ameomba marekebisho ya kazi.' } },
    CONFIRM_COMPLETION:  { from: ['service_submitted'], actor: 'buyer', stage: 'completed', status: 'completed', at: 'completedAt', notif: { title: '✅ Kazi Imethibitishwa', body: 'Mteja amethibitisha kukamilika kwa kazi. Asante!' } }
};
const TRANSPORT_ORDER_DEFS = {
    CONFIRM_BOOKING:  { from: ['held'], actor: 'seller', stage: 'booking_confirmed', status: 'held', at: 'bookingConfirmedAt', notif: { title: '📅 Booking Imethibitishwa', body: 'Booking yako imethibitishwa na mtoa usafiri.' } },
    START_PICKUP:     { from: ['booking_confirmed'], actor: 'seller', stage: 'pickup', status: 'held', at: 'pickupStartedAt', notif: { title: '📍 Pickup Imeanza', body: 'Dereva ameelekea kuchukua mzigo.' } },
    START_TRANSIT:    { from: ['pickup'], actor: 'seller', stage: 'in_transit', status: 'held', at: 'inTransitAt', notif: { title: '🚚 Safari Imeanza', body: 'Mzigo wako uko njiani.' } },
    CONFIRM_HANDOVER: { from: ['in_transit'], actor: 'seller', stage: 'handover', status: 'delivered', at: 'handoverAt', notif: { title: '📦 Mzigo Umekabidhiwa', body: 'Mzigo umekabidhiwa. Thibitisha kupokea.' } },
    CONFIRM_RECEIPT:  { from: ['handover'], actor: 'buyer', stage: 'confirmed', status: 'completed', at: 'completedAt', notif: { title: '✅ Umethibitisha Kupokea', body: 'Umethibitisha kupokea mzigo. Asante!' } }
};
function orderDefsForType(t) {
    if (t === 'service') return SERVICE_ORDER_DEFS;
    if (t === 'transport') return TRANSPORT_ORDER_DEFS;
    return PRODUCT_ORDER_DEFS;
}

exports.negotiationOrderAction = onCall({ region: REGION }, async (req) => {
    const auth = req.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Login inahitajika.');
    const data = req.data || {};
    const orderId = String(data.orderId || '');
    const command = String(data.command || '').toUpperCase();
    const commandId = String(data.commandId || '');
    // defs zinajulikana baada ya kusoma oda (zinategemea commerceType) — hapa
    // tunahakikisha tu command ni ya mfumo unaojulikana kwa aina yoyote.
    const KNOWN_ORDER_COMMANDS = Object.assign({}, PRODUCT_ORDER_DEFS, SERVICE_ORDER_DEFS, TRANSPORT_ORDER_DEFS);
    if (!orderId || !KNOWN_ORDER_COMMANDS[command]) throw new HttpsError('invalid-argument', 'orderId na command sahihi zinahitajika.');

    const orderRef = db.doc('orders/' + orderId);
    const snap = await orderRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Oda haipatikani.');
    const o = snap.data();
    const now = nowIso();

    // 1) Oda ya negotiation pekee (zile za kawaida zinatumia mkondo uliopo).
    if (o.source !== 'negotiation') throw new HttpsError('failed-precondition', 'Mtiririko huu ni wa oda za majadiliano pekee.');

    // [COMMERCE 2026-09] defs + sehemu ya hali kulingana na AINA ya oda.
    const ctype = o.commerceType || 'product';
    const defs = orderDefsForType(ctype);
    const def = defs[command];
    if (!def) throw new HttpsError('invalid-argument', 'Hatua "' + command + '" hairuhusiwi kwa oda ya aina hii.');
    const stageField = ORDER_STAGE_FIELD(ctype);

    // 2) uanachama + nafasi (spec §42)
    const isBuyer = o.buyerId === auth.uid;
    const isSeller = o.sellerId === auth.uid;
    if (!isBuyer && !isSeller) throw new HttpsError('permission-denied', 'Huna ruhusa kwenye oda hii.');
    if (def.actor === 'seller' && !isSeller) throw new HttpsError('permission-denied', 'Muuzaji pekee anaweza kufanya hatua hii.');
    if (def.actor === 'buyer' && !isBuyer) throw new HttpsError('permission-denied', 'Mnunuzi pekee anaweza kufanya hatua hii.');
    if (o.buyerId && o.sellerId) {
        if (await isBlocked(db, o.buyerId, o.sellerId) || await isBlocked(db, o.sellerId, o.buyerId)) {
            throw new HttpsError('permission-denied', 'Mawasiliano yamezuiwa.');
        }
    }

    // 3) idempotency (spec §32)
    const negoScope = o.negotiationId || ('order_' + orderId);
    if (commandId && (await commandAlreadyApplied(db, negoScope, commandId))) {
        return { ok: true, idempotent: true, orderId: orderId, deliveryStatus: o[stageField] || o.status, status: o.status };
    }

    // 4) malipo: lazima ilipwe kabla ya utekelezaji (spec §26 — SokoPay ndiye mamlaka).
    const paid = (o.paymentStatus === 'paid') || (o.paymentVerified === true) || (o.status === 'held');
    if (!paid) {
        throw new HttpsError('failed-precondition', 'Oda haijalipwa bado. Mnunuzi alipe kupitia SokoPay kwanza.');
    }

    // 5) transition halali tu (spec §5) — kwenye sehemu ya hali ya aina husika.
    const current = o[stageField] || o.status || 'payment_pending';
    if (def.from.indexOf(current) === -1) {
        throw new HttpsError('failed-precondition', 'Hatua "' + command + '" hairuhusiwi kwenye hali "' + current + '".');
    }

    // 6) kuandika
    const patch = Object.assign({ status: def.status, updatedAt: now }, { [stageField]: def.stage });
    if (def.at) patch[def.at] = now;
    if (command === 'CONFIRM_RECEIPT' || command === 'CONFIRM_COMPLETION') {
        patch.completedAt = now;
        patch.deliveryConfirmedAt = now;
        patch.status = 'completed';
    }
    await orderRef.update(patch);

    // 7) audit (spec §41) — kwenye negotiation_events kwa uthabiti.
    await recordEvent(db, {
        negotiationId: negoScope,
        actorId: auth.uid,
        actorRole: isBuyer ? 'buyer' : 'seller',
        command: command,
        previousState: current,
        newState: def.stage,
        previousQuantity: o.quantity || 1,
        newQuantity: o.quantity || 1,
        previousPrice: o.unitPrice || o.amount || 0,
        newPrice: o.unitPrice || o.amount || 0,
        commandId: commandId,
        orderId: orderId,
        version: (o.version || 0) + 1
    });

    // 8) arifa kwa mwenzake (spec §34) — yule ASIYEfanya hatua.
    if (def.notif) {
        const target = def.actor === 'buyer' ? o.sellerId : o.buyerId;
        const body = (o.itemTitle || o.productTitle || o.serviceTitle || o.transportTitle || 'Bidhaa') + ' — ' + (def.notif.body || '');
        await notify(db, target, def.notif.title, body, 'delivery', { orderId: orderId, negotiationId: o.negotiationId || null, command: command });
    }

    const fresh = (await orderRef.get()).data();
    return { ok: true, command: command, orderId: orderId, deliveryStatus: fresh[stageField] || fresh.status, serviceStatus: fresh.serviceStatus, transportStatus: fresh.transportStatus, status: fresh.status, order: fresh };
});

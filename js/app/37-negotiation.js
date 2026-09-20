/* ==== js/app/37-negotiation.js ====
   SOKOHAI — GLOBAL NEGOTIATION & COMMERCE CHAT AUTOMATION ENGINE (2026-09)
   -------------------------------------------------------------------------
   INJINI MOJA YA UJUMBA ya majadiliano ya biashara (offer → counter →
   agreement → quantity change → re-negotiation → order → SokoPay → delivery).

   Kanuni kuu (spec §1, §46):
     STATE → valid actions → BUTTON → command → backend validation →
     state transition → event → UI update.

   Faili hii ina LOGIC TUPU (state machine + resolver + lugha ya icons +
   kutambua nia kwa lugha asilia) — HAKUNA uandikaji wa Firestore wala
   DOM wa moja kwa moja hapa. Inatumika na:
     - js/app/34-chat-core.js  (UI: anchor + vitufe + events)
     - tests (.arena-test)      (thibitisho la transitions)

   Backend mamlaka: functions/negotiation.js (server ndiye anabadilisha
   state — browser haiwezi, angalia firestore.rules).
   ============================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    /* ============================================================
     * 1) DOMAIN MODEL (spec §3)
     *    Negotiation { negotiationId, conversationId, productId, sellerId,
     *    buyerId, currentState, currency, quantity, originalUnitPrice,
     *    currentUnitPrice, currentTotal, expiresAt, createdAt, updatedAt,
     *    version, history, agreements }
     * ============================================================ */

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

    /* ============================================================
     * 1a) COMMERCE TYPES + CONFIG (spec §1, §3, §14) — adapters moja
     *     kwa kila aina ya biashara. Hakuna injini tatu tofauti:
     *     injini MOJA, config tofauti.
     * ============================================================ */
    const COMMERCE_TYPES = {
        PRODUCT: 'product',
        SERVICE: 'service',
        TRANSPORT: 'transport'
    };

    // Adapter ya kila aina ya biashara (data + lugha + workflow + completion).
    const TYPE_CONFIG = {
        product: {
            key: 'product', icon: 'package', label: 'Bidhaa', orderKind: 'order',
            entityField: 'productId', titleField: 'productTitle',
            entityCollection: 'products',
            anchorPrefix: 'Oda #',
            // Term fields zinazojadiliwa (offers/counters).
            terms: [
                { k: 'quantity', label: 'Kiasi', suffix: 'pc' },
                { k: 'unitPrice', label: 'Bei', money: true },
                // [DIALOGUE FIX] jumla ya ofa (kiasi × bei) ionekane wazi kadi.
                { k: 'total', label: 'Jumla', money: true },
                // [NEGO MODULE 01] mapendeleo ya fomu ya ofa (huonyeshwa kama msingi).
                { k: 'deliveryLocation', label: 'Uwasilishaji', suffix: '' },
                { k: 'preferredDate', label: 'Tarehe', suffix: '' }
            ],
            // Completion pipeline (baada ya oda) — inaishi kwenye order doc.
            completion: 'product'
        },
        service: {
            key: 'service', icon: 'wrench', label: 'Huduma', orderKind: 'service_order',
            entityField: 'serviceId', titleField: 'serviceTitle',
            entityCollection: 'services',
            anchorPrefix: 'Huduma #',
            terms: [
                { k: 'scope', label: 'Scope', suffix: '' },
                { k: 'scopeUnit', label: 'Kizio', suffix: '' },
                { k: 'quantity', label: 'Kiasi', suffix: '' },
                { k: 'unitPrice', label: 'Bei', money: true },
                { k: 'total', label: 'Jumla', money: true },
                { k: 'deadline', label: 'Muda', suffix: '' },
                { k: 'location', label: 'Mahali', suffix: '' },
                { k: 'requirements', label: 'Mahitaji', suffix: '' }
            ],
            completion: 'service'
        },
        transport: {
            key: 'transport', icon: 'truck', label: 'Usafiri', orderKind: 'booking',
            entityField: 'transportId', titleField: 'transportTitle',
            entityCollection: 'ride_requests',
            anchorPrefix: 'Safari #',
            terms: [
                { k: 'route', label: 'Njia', suffix: '' },
                { k: 'packageDescription', label: 'Mzigo', suffix: '' },
                { k: 'packageQuantity', label: 'Idadi', suffix: '' },
                { k: 'weight', label: 'Uzito', suffix: 'kg' },
                { k: 'fare', label: 'Nauli', money: true },
                { k: 'pickupDate', label: 'Siku ya Pickup', suffix: '' },
                { k: 'deliveryDeadline', label: 'Mwisho wa kuwasilisha', suffix: '' },
                { k: 'pickupTime', label: 'Saa ya Pickup', suffix: '' },
                { k: 'vehicleType', label: 'Chombo', suffix: '' },
                { k: 'specialRequirements', label: 'Mahitaji', suffix: '' }
            ],
            completion: 'transport'
        }
    };

    const COMMANDS = {
        SEND_OFFER: 'SEND_OFFER',
        ACCEPT_OFFER: 'ACCEPT_OFFER',
        COUNTER_OFFER: 'COUNTER_OFFER',
        REJECT_OFFER: 'REJECT_OFFER',
        REQUEST_QUANTITY_CHANGE: 'REQUEST_QUANTITY_CHANGE',
        ACCEPT_QUANTITY_CHANGE: 'ACCEPT_QUANTITY_CHANGE',
        REJECT_QUANTITY_CHANGE: 'REJECT_QUANTITY_CHANGE',
        COUNTER_QUANTITY_CHANGE: 'COUNTER_QUANTITY_CHANGE',
        REQUEST_PRICE_CHANGE: 'REQUEST_PRICE_CHANGE',
        CREATE_ORDER: 'CREATE_ORDER',
        REQUEST_ADDITIONAL_ITEMS: 'REQUEST_ADDITIONAL_ITEMS',
        ACCEPT_ADDITIONAL_ITEMS: 'ACCEPT_ADDITIONAL_ITEMS',
        REJECT_ADDITIONAL_ITEMS: 'REJECT_ADDITIONAL_ITEMS',
        COUNTER_ADDITIONAL_ITEMS: 'COUNTER_ADDITIONAL_ITEMS',
        CANCEL_NEGOTIATION: 'CANCEL_NEGOTIATION',
        EXPIRE_NEGOTIATION: 'EXPIRE_NEGOTIATION',
        // [COMMERCE 2026-09] Service — majadiliano ya scope (spec §8, §13).
        CHANGE_SCOPE: 'CHANGE_SCOPE',
        REQUEST_SCOPE_CHANGE: 'REQUEST_SCOPE_CHANGE',
        ACCEPT_SCOPE_CHANGE: 'ACCEPT_SCOPE_CHANGE',
        REJECT_SCOPE_CHANGE: 'REJECT_SCOPE_CHANGE',
        COUNTER_SCOPE_CHANGE: 'COUNTER_SCOPE_CHANGE',
        // [COMMERCE 2026-09] Transport — majadiliano ya route/details (spec §12–§13).
        CHANGE_ROUTE: 'CHANGE_ROUTE',
        REQUEST_ROUTE_CHANGE: 'REQUEST_ROUTE_CHANGE',
        ACCEPT_ROUTE_CHANGE: 'ACCEPT_ROUTE_CHANGE',
        REJECT_ROUTE_CHANGE: 'REJECT_ROUTE_CHANGE',
        COUNTER_ROUTE_CHANGE: 'COUNTER_ROUTE_CHANGE',
        CREATE_BOOKING: 'CREATE_BOOKING',
        // [COMMERCE 2026-09] Service completion (order-level) — spec §8.
        START_SERVICE: 'START_SERVICE',
        SUBMIT_WORK: 'SUBMIT_WORK',
        REQUEST_REVISION: 'REQUEST_REVISION',
        CONFIRM_COMPLETION: 'CONFIRM_COMPLETION',
        // [COMMERCE 2026-09] Transport booking (order-level) — spec §12.
        CONFIRM_BOOKING: 'CONFIRM_BOOKING',
        START_PICKUP: 'START_PICKUP',
        CONFIRM_HANDOVER: 'CONFIRM_HANDOVER'
    };

    // (from, command) -> to  — kioo cha functions/negotiation.js.
    // "actor" (nani anaweza kutoa amri) hutokana na `turn` kwenye doc:
    //   buyer  = mnunuzi pekee | seller = muuzaji pekee | turn = yule
    //   anayepaswa kujibu sasa (anafuatiliwa kwenye negotiation.turn).
    const TRANSITIONS = {};
    const T = (from, cmd, to) => { (TRANSITIONS[from] = TRANSITIONS[from] || {})[cmd] = { to: to }; };

    T(STATES.DRAFT, COMMANDS.SEND_OFFER, STATES.OFFER_SENT);
    T(STATES.DRAFT, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    T(STATES.OFFER_SENT, COMMANDS.ACCEPT_OFFER, STATES.AGREEMENT);
    T(STATES.OFFER_SENT, COMMANDS.COUNTER_OFFER, STATES.COUNTER_OFFER);
    T(STATES.OFFER_SENT, COMMANDS.REJECT_OFFER, STATES.REJECTED);
    T(STATES.OFFER_SENT, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);
    T(STATES.OFFER_SENT, COMMANDS.EXPIRE_NEGOTIATION, STATES.EXPIRED);

    T(STATES.COUNTER_OFFER, COMMANDS.ACCEPT_OFFER, STATES.AGREEMENT);
    T(STATES.COUNTER_OFFER, COMMANDS.COUNTER_OFFER, STATES.COUNTER_OFFER);
    T(STATES.COUNTER_OFFER, COMMANDS.REJECT_OFFER, STATES.REJECTED);
    T(STATES.COUNTER_OFFER, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);
    T(STATES.COUNTER_OFFER, COMMANDS.EXPIRE_NEGOTIATION, STATES.EXPIRED);

    T(STATES.AGREEMENT, COMMANDS.REQUEST_QUANTITY_CHANGE, STATES.CHANGE_REQUESTED);
    T(STATES.AGREEMENT, COMMANDS.REQUEST_PRICE_CHANGE, STATES.RE_NEGOTIATION);
    T(STATES.AGREEMENT, COMMANDS.CREATE_ORDER, STATES.ORDER_CREATED);
    T(STATES.AGREEMENT, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    T(STATES.CHANGE_REQUESTED, COMMANDS.ACCEPT_QUANTITY_CHANGE, STATES.FINAL_AGREEMENT);
    T(STATES.CHANGE_REQUESTED, COMMANDS.REJECT_QUANTITY_CHANGE, STATES.AGREEMENT);
    T(STATES.CHANGE_REQUESTED, COMMANDS.COUNTER_QUANTITY_CHANGE, STATES.RE_NEGOTIATION);
    T(STATES.CHANGE_REQUESTED, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    T(STATES.RE_NEGOTIATION, COMMANDS.ACCEPT_OFFER, STATES.FINAL_AGREEMENT);
    T(STATES.RE_NEGOTIATION, COMMANDS.COUNTER_OFFER, STATES.RE_NEGOTIATION);
    T(STATES.RE_NEGOTIATION, COMMANDS.REJECT_OFFER, STATES.AGREEMENT);
    T(STATES.RE_NEGOTIATION, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);
    T(STATES.RE_NEGOTIATION, COMMANDS.EXPIRE_NEGOTIATION, STATES.EXPIRED);

    T(STATES.FINAL_AGREEMENT, COMMANDS.CREATE_ORDER, STATES.ORDER_CREATED);
    T(STATES.FINAL_AGREEMENT, COMMANDS.REQUEST_QUANTITY_CHANGE, STATES.CHANGE_REQUESTED);
    T(STATES.FINAL_AGREEMENT, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    T(STATES.ORDER_CREATED, COMMANDS.REQUEST_ADDITIONAL_ITEMS, STATES.CHANGE_REQUESTED);
    T(STATES.ORDER_CREATED, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    // ============================================================
    // 1b) TRANSITIONS ZA SERVICE + TRANSPORT (spec §6, §7, §11, §12)
    //     Zinaishi kwenye TRANSITIONS ILE ILE — injini MOJA.
    // ============================================================
    // --- SERVICE (roles: provider=seller, customer=buyer) ---
    T(STATES.DRAFT, COMMANDS.SEND_OFFER, STATES.OFFER_SENT);
    T(STATES.DRAFT, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    T(STATES.OFFER_SENT, COMMANDS.ACCEPT_OFFER, STATES.AGREEMENT);
    T(STATES.OFFER_SENT, COMMANDS.COUNTER_OFFER, STATES.COUNTER_OFFER);
    T(STATES.OFFER_SENT, COMMANDS.CHANGE_SCOPE, STATES.SCOPE_CHANGE_REQUESTED);
    T(STATES.OFFER_SENT, COMMANDS.REJECT_OFFER, STATES.REJECTED);
    T(STATES.OFFER_SENT, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);
    T(STATES.OFFER_SENT, COMMANDS.EXPIRE_NEGOTIATION, STATES.EXPIRED);

    T(STATES.COUNTER_OFFER, COMMANDS.ACCEPT_OFFER, STATES.AGREEMENT);
    T(STATES.COUNTER_OFFER, COMMANDS.COUNTER_OFFER, STATES.COUNTER_OFFER);
    T(STATES.COUNTER_OFFER, COMMANDS.CHANGE_SCOPE, STATES.SCOPE_CHANGE_REQUESTED);
    T(STATES.COUNTER_OFFER, COMMANDS.REJECT_OFFER, STATES.REJECTED);
    T(STATES.COUNTER_OFFER, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);
    T(STATES.COUNTER_OFFER, COMMANDS.EXPIRE_NEGOTIATION, STATES.EXPIRED);

    T(STATES.SCOPE_CHANGE_REQUESTED, COMMANDS.ACCEPT_SCOPE_CHANGE, STATES.FINAL_AGREEMENT);
    T(STATES.SCOPE_CHANGE_REQUESTED, COMMANDS.REJECT_SCOPE_CHANGE, STATES.AGREEMENT);
    T(STATES.SCOPE_CHANGE_REQUESTED, COMMANDS.COUNTER_SCOPE_CHANGE, STATES.COUNTER_OFFER);
    T(STATES.SCOPE_CHANGE_REQUESTED, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    T(STATES.AGREEMENT, COMMANDS.REQUEST_SCOPE_CHANGE, STATES.SCOPE_CHANGE_REQUESTED);
    T(STATES.AGREEMENT, COMMANDS.CREATE_ORDER, STATES.ORDER_CREATED);
    T(STATES.AGREEMENT, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    T(STATES.FINAL_AGREEMENT, COMMANDS.CREATE_ORDER, STATES.ORDER_CREATED);
    T(STATES.FINAL_AGREEMENT, COMMANDS.REQUEST_SCOPE_CHANGE, STATES.SCOPE_CHANGE_REQUESTED);
    T(STATES.FINAL_AGREEMENT, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    // --- TRANSPORT (roles: transporter=seller, customer=buyer) ---
    T(STATES.OFFER_SENT, COMMANDS.CHANGE_ROUTE, STATES.ROUTE_CHANGE_REQUESTED);
    T(STATES.COUNTER_OFFER, COMMANDS.CHANGE_ROUTE, STATES.ROUTE_CHANGE_REQUESTED);

    T(STATES.ROUTE_CHANGE_REQUESTED, COMMANDS.ACCEPT_ROUTE_CHANGE, STATES.FINAL_AGREEMENT);
    T(STATES.ROUTE_CHANGE_REQUESTED, COMMANDS.REJECT_ROUTE_CHANGE, STATES.AGREEMENT);
    T(STATES.ROUTE_CHANGE_REQUESTED, COMMANDS.COUNTER_ROUTE_CHANGE, STATES.COUNTER_OFFER);
    T(STATES.ROUTE_CHANGE_REQUESTED, COMMANDS.CANCEL_NEGOTIATION, STATES.CANCELLED);

    T(STATES.AGREEMENT, COMMANDS.REQUEST_ROUTE_CHANGE, STATES.ROUTE_CHANGE_REQUESTED);
    T(STATES.AGREEMENT, COMMANDS.CREATE_BOOKING, STATES.ORDER_CREATED);
    T(STATES.FINAL_AGREEMENT, COMMANDS.CREATE_BOOKING, STATES.ORDER_CREATED);
    T(STATES.FINAL_AGREEMENT, COMMANDS.REQUEST_ROUTE_CHANGE, STATES.ROUTE_CHANGE_REQUESTED);

    // ============================================================
    // 2) LUGHA YA ICONS (spec §9) — UI representation ya commands.
    // ============================================================
    const LABELS = {
        SEND_OFFER: 'Tuma Ofa',
        ACCEPT_OFFER: 'Kubali',
        COUNTER_OFFER: 'Counter',
        REJECT_OFFER: 'Kataa',
        REQUEST_QUANTITY_CHANGE: 'Ongeza Kiasi',
        ACCEPT_QUANTITY_CHANGE: 'Kubali',
        REJECT_QUANTITY_CHANGE: 'Kataa',
        COUNTER_QUANTITY_CHANGE: 'Badili Ofa',
        REQUEST_PRICE_CHANGE: 'Badili Bei',
        CREATE_ORDER: 'Tengeneza Oda',
        REQUEST_ADDITIONAL_ITEMS: 'Ongeza Bidhaa/Kiasi',
        ACCEPT_ADDITIONAL_ITEMS: 'Kubali',
        REJECT_ADDITIONAL_ITEMS: 'Kataa',
        COUNTER_ADDITIONAL_ITEMS: 'Badili Ofa',
        CANCEL_NEGOTIATION: 'Cancel',
        // [COMMERCE 2026-09] Service labels.
        CHANGE_SCOPE: 'Badili Scope',
        REQUEST_SCOPE_CHANGE: 'Omba Mabadiliko ya Scope',
        ACCEPT_SCOPE_CHANGE: 'Kubali Scope',
        REJECT_SCOPE_CHANGE: 'Kataa Scope',
        COUNTER_SCOPE_CHANGE: 'Counter Scope',
        // [COMMERCE 2026-09] Transport labels.
        CHANGE_ROUTE: 'Badili Njia/Maelezo',
        REQUEST_ROUTE_CHANGE: 'Omba Mabadiliko ya Njia',
        ACCEPT_ROUTE_CHANGE: 'Kubali Njia',
        REJECT_ROUTE_CHANGE: 'Kataa Njia',
        COUNTER_ROUTE_CHANGE: 'Counter Njia',
        CREATE_BOOKING: 'Tengeneza Booking',
        // [COMMERCE 2026-09] Service completion labels.
        START_SERVICE: 'Anza Kazi',
        SUBMIT_WORK: 'Wasilisha Kazi',
        REQUEST_REVISION: 'Omba Marekebisho',
        CONFIRM_COMPLETION: 'Thibitisha Kukamilika',
        // [COMMERCE 2026-09] Transport booking labels.
        CONFIRM_BOOKING: 'Thibitisha Booking',
        START_PICKUP: 'Anza Pickup',
        CONFIRM_HANDOVER: 'Thibitisha Handover'
    };

    const STATE_LABELS = {
        DRAFT: 'Draft',
        OFFER_SENT: 'Ofa Imetumwa',
        COUNTER_OFFER: 'Counter Ofa',
        AGREEMENT: 'Makubaliano',
        CHANGE_REQUESTED: 'Ombi la Mabadiliko',
        SCOPE_CHANGE_REQUESTED: 'Ombi la Kubadilisha Scope',
        ROUTE_CHANGE_REQUESTED: 'Ombi la Kubadilisha Njia',
        RE_NEGOTIATION: 'Majadiliano Upya',
        FINAL_AGREEMENT: 'Makubaliano ya Mwisho',
        ORDER_CREATED: 'Oda Imefungwa',
        COMPLETED: 'Imekamilika',
        REJECTED: 'Imekataliwa',
        EXPIRED: 'Imeisha Muda',
        CANCELLED: 'Imefutwa'
    };

    /* ============================================================
     * 3) ACTION RESOLVER (spec §7) — vitendo halali pekee.
     *    Inatumia `turn` (anayepaswa kujibu) + payment/order state.
     * ============================================================ */
    // [COMMERCE 2026-09] Dispatcher (spec §4, §13) — injini MOJA, aina tofauti.
    // Product logic ni ILE ILE (resolveProductActions) — service/transport ni
    // matawi mapya yanayotumia STATES/COMMANDS/LABELS zile zile.
    function resolveActions(nego, ctx) {
        const type = (nego && nego.commerceType) || COMMERCE_TYPES.PRODUCT;
        if (type === COMMERCE_TYPES.SERVICE) return resolveServiceActions(nego, ctx);
        if (type === COMMERCE_TYPES.TRANSPORT) return resolveTransportActions(nego, ctx);
        return resolveProductActions(nego, ctx);
    }

    function resolveProductActions(nego, ctx) {
        nego = nego || {};
        ctx = ctx || {};
        const state = nego.currentState || STATES.DRAFT;
        const myRole = ctx.iAmSeller ? 'seller' : (ctx.iAmBuyer ? 'buyer' : null);
        const turn = nego.turn || 'buyer';
        const paymentPaid = ctx.order && ctx.order.paymentStatus === 'paid';
        const out = [];

        const btn = function (cmd, opts) {
            out.push(Object.assign({
                command: cmd, label: LABELS[cmd] || cmd, primary: false, role: myRole, confirm: false
            }, opts || {}));
        };
        // Actor model (spec §4/§6): tumia USER ID ikipatikana, vinginevyo role `turn`.
        const waitingFor = nego.waitingForUserId || nego.currentActorId || null;
        const myUid = myRole === 'seller' ? nego.sellerId : (myRole === 'buyer' ? nego.buyerId : null);
        const myTurn = function () { return waitingFor ? (myUid === waitingFor) : (myRole && myRole === turn); };

        if (state === STATES.DRAFT) {
            if (myRole === 'buyer') btn(COMMANDS.SEND_OFFER, { primary: true });
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        if (TERMINAL[state]) {
            if (state === STATES.REJECTED || state === STATES.EXPIRED || state === STATES.CANCELLED) {
                if (myRole === 'buyer') btn(COMMANDS.SEND_OFFER, { label: 'Tuma Ofa Mpya', primary: true });
            }
            return out;
        }

        // Oda ILIYOLIPWA — hakuna mabadiliko ya moja kwa moja (spec §24–25).
        if (paymentPaid && (state === STATES.ORDER_CREATED || state === STATES.FINAL_AGREEMENT || state === STATES.AGREEMENT)) {
            if (myRole === 'buyer') btn(COMMANDS.REQUEST_ADDITIONAL_ITEMS, { primary: true });
            return out;
        }

        if (state === STATES.OFFER_SENT || state === STATES.COUNTER_OFFER) {
            if (myTurn()) {
                btn(COMMANDS.ACCEPT_OFFER, { primary: true });
                btn(COMMANDS.COUNTER_OFFER);
                btn(COMMANDS.REJECT_OFFER);
            } else {
                btn(COMMANDS.CANCEL_NEGOTIATION);
            }
            return out;
        }
        if (state === STATES.AGREEMENT) {
            if (myRole === 'buyer') { btn(COMMANDS.CREATE_ORDER, { primary: true }); btn(COMMANDS.REQUEST_QUANTITY_CHANGE); }
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        if (state === STATES.CHANGE_REQUESTED) {
            if (myRole === 'seller') {
                btn(COMMANDS.ACCEPT_QUANTITY_CHANGE, { primary: true });
                btn(COMMANDS.COUNTER_QUANTITY_CHANGE);
                btn(COMMANDS.REJECT_QUANTITY_CHANGE);
            } else if (myRole === 'buyer') {
                btn(COMMANDS.CANCEL_NEGOTIATION);
            }
            return out;
        }
        if (state === STATES.RE_NEGOTIATION) {
            if (myTurn()) {
                btn(COMMANDS.ACCEPT_OFFER, { primary: true });
                btn(COMMANDS.COUNTER_OFFER);
                btn(COMMANDS.REJECT_OFFER);
            } else {
                btn(COMMANDS.CANCEL_NEGOTIATION);
            }
            return out;
        }
        if (state === STATES.FINAL_AGREEMENT) {
            if (myRole === 'buyer') { btn(COMMANDS.CREATE_ORDER, { primary: true }); btn(COMMANDS.REQUEST_QUANTITY_CHANGE); }
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        if (state === STATES.ORDER_CREATED) {
            if (myRole === 'buyer') btn(COMMANDS.REQUEST_ADDITIONAL_ITEMS, { primary: true });
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        return out;
    }

    /* [COMMERCE 2026-09] Resolver ya SERVICE (spec §8, §13).
       Roles: provider (=seller), customer (=buyer). Scope inajadiliwa zaidi
       ya bei: price, scope, quantity, deadline, location, requirements. */
    function resolveServiceActions(nego, ctx) {
        nego = nego || {};
        ctx = ctx || {};
        const state = nego.currentState || STATES.DRAFT;
        const myRole = ctx.iAmSeller ? 'provider' : (ctx.iAmBuyer ? 'customer' : null);
        const turn = nego.turn || 'buyer';
        const turnToken = myRole === 'provider' ? 'seller' : (myRole === 'customer' ? 'buyer' : null);
        const paymentPaid = ctx.order && ctx.order.paymentStatus === 'paid';
        const out = [];
        const btn = function (cmd, opts) {
            out.push(Object.assign({ command: cmd, label: LABELS[cmd] || cmd, primary: false, role: myRole, confirm: false }, opts || {}));
        };
        const waitingFor = nego.waitingForUserId || nego.currentActorId || null;
        const myUid = myRole === 'provider' ? nego.sellerId : (myRole === 'customer' ? nego.buyerId : null);
        const myTurn = function () { return waitingFor ? (myUid === waitingFor) : (turnToken && turnToken === turn); };

        if (state === STATES.DRAFT) {
            btn(COMMANDS.SEND_OFFER, { primary: true });
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        if (TERMINAL[state]) {
            if (state === STATES.REJECTED || state === STATES.EXPIRED || state === STATES.CANCELLED) {
                btn(COMMANDS.SEND_OFFER, { label: 'Tuma Ofa Mpya', primary: true });
            }
            return out;
        }
        if (paymentPaid && (state === STATES.ORDER_CREATED || state === STATES.FINAL_AGREEMENT || state === STATES.AGREEMENT)) {
            return out; // completion inaishi kwenye order (service pipeline).
        }
        if (state === STATES.OFFER_SENT || state === STATES.COUNTER_OFFER) {
            if (myTurn()) {
                btn(COMMANDS.ACCEPT_OFFER, { primary: true });
                btn(COMMANDS.COUNTER_OFFER);
                btn(COMMANDS.CHANGE_SCOPE);
                btn(COMMANDS.REJECT_OFFER);
            } else {
                btn(COMMANDS.CANCEL_NEGOTIATION);
            }
            return out;
        }
        if (state === STATES.SCOPE_CHANGE_REQUESTED) {
            if (myTurn()) {
                btn(COMMANDS.ACCEPT_SCOPE_CHANGE, { primary: true });
                btn(COMMANDS.COUNTER_SCOPE_CHANGE);
                btn(COMMANDS.REJECT_SCOPE_CHANGE);
            } else {
                btn(COMMANDS.CANCEL_NEGOTIATION);
            }
            return out;
        }
        if (state === STATES.AGREEMENT || state === STATES.FINAL_AGREEMENT) {
            if (myRole === 'customer') { btn(COMMANDS.CREATE_ORDER, { primary: true }); btn(COMMANDS.REQUEST_SCOPE_CHANGE); }
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        if (state === STATES.ORDER_CREATED) {
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        return out;
    }

    /* [COMMERCE 2026-09] Resolver ya TRANSPORT (spec §12–§13).
       Roles: transporter (=seller), customer (=buyer). Route/nauli/mzigo
       vinajadiliwa; booking huundwa na customer baada ya makubaliano. */
    function resolveTransportActions(nego, ctx) {
        nego = nego || {};
        ctx = ctx || {};
        const state = nego.currentState || STATES.DRAFT;
        const myRole = ctx.iAmSeller ? 'transporter' : (ctx.iAmBuyer ? 'customer' : null);
        const turn = nego.turn || 'buyer';
        const turnToken = myRole === 'transporter' ? 'seller' : (myRole === 'customer' ? 'buyer' : null);
        const paymentPaid = ctx.order && ctx.order.paymentStatus === 'paid';
        const out = [];
        const btn = function (cmd, opts) {
            out.push(Object.assign({ command: cmd, label: LABELS[cmd] || cmd, primary: false, role: myRole, confirm: false }, opts || {}));
        };
        const waitingFor = nego.waitingForUserId || nego.currentActorId || null;
        const myUid = myRole === 'transporter' ? nego.sellerId : (myRole === 'customer' ? nego.buyerId : null);
        const myTurn = function () { return waitingFor ? (myUid === waitingFor) : (turnToken && turnToken === turn); };

        if (state === STATES.DRAFT) {
            btn(COMMANDS.SEND_OFFER, { primary: true });
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        if (TERMINAL[state]) {
            if (state === STATES.REJECTED || state === STATES.EXPIRED || state === STATES.CANCELLED) {
                btn(COMMANDS.SEND_OFFER, { label: 'Tuma Ofa Mpya', primary: true });
            }
            return out;
        }
        if (paymentPaid && (state === STATES.ORDER_CREATED || state === STATES.FINAL_AGREEMENT || state === STATES.AGREEMENT)) {
            return out; // mtiririko wa booking unaishi kwenye order (transport pipeline).
        }
        if (state === STATES.OFFER_SENT || state === STATES.COUNTER_OFFER) {
            if (myTurn()) {
                btn(COMMANDS.ACCEPT_OFFER, { primary: true });
                btn(COMMANDS.COUNTER_OFFER);
                btn(COMMANDS.CHANGE_ROUTE);
                btn(COMMANDS.REJECT_OFFER);
            } else {
                btn(COMMANDS.CANCEL_NEGOTIATION);
            }
            return out;
        }
        if (state === STATES.ROUTE_CHANGE_REQUESTED) {
            if (myTurn()) {
                btn(COMMANDS.ACCEPT_ROUTE_CHANGE, { primary: true });
                btn(COMMANDS.COUNTER_ROUTE_CHANGE);
                btn(COMMANDS.REJECT_ROUTE_CHANGE);
            } else {
                btn(COMMANDS.CANCEL_NEGOTIATION);
            }
            return out;
        }
        if (state === STATES.AGREEMENT || state === STATES.FINAL_AGREEMENT) {
            if (myRole === 'customer') { btn(COMMANDS.CREATE_BOOKING, { primary: true }); btn(COMMANDS.REQUEST_ROUTE_CHANGE); }
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        if (state === STATES.ORDER_CREATED) {
            btn(COMMANDS.CANCEL_NEGOTIATION);
            return out;
        }
        return out;
    }

    /* ============================================================
     * 3b) COMMERCE CONTEXT + TERMS (spec §3, §14) — adapters za data.
     *     CommerceContext: aina + entity + negotiation + order + status.
     * ============================================================ */
    function typeOf(nego) {
        const t = (nego && nego.commerceType) || COMMERCE_TYPES.PRODUCT;
        return TYPE_CONFIG[t] ? t : COMMERCE_TYPES.PRODUCT;
    }
    function configOf(nego) { return TYPE_CONFIG[typeOf(nego)] || TYPE_CONFIG.product; }

    function commerceContextOf(nego) {
        nego = nego || {};
        const cfg = configOf(nego);
        const buyerId = nego.buyerId || null;
        const sellerId = nego.sellerId || null;
        const orderId = nego.orderId || null;
        return {
            type: typeOf(nego),
            entityId: nego[cfg.entityField] || null,
            entityTitle: nego[cfg.titleField] || nego.productTitle || '',
            entityCollection: cfg.entityCollection,
            conversationId: nego.conversationId || null,
            productId: nego.productId || null,
            serviceId: nego.serviceId || null,
            transportId: nego.transportId || null,
            providerId: sellerId,
            sellerId: sellerId,
            customerId: buyerId,
            buyerId: buyerId,
            offerId: nego.offerId || null,
            negotiationId: nego.negotiationId || null,
            agreementId: (nego.agreements && nego.agreements.length) ? ('agr_' + nego.agreements.length) : null,
            orderId: orderId,
            bookingId: orderId,
            paymentId: nego.paymentId || null,
            deliveryId: nego.deliveryId || null,
            status: nego.currentState || STATES.DRAFT,
            icon: cfg.icon,
            label: cfg.label,
            orderKind: cfg.orderKind,
            anchorPrefix: cfg.anchorPrefix
        };
    }

    function commerceTitleOf(nego) {
        nego = nego || {};
        const cfg = configOf(nego);
        return nego[cfg.titleField] || nego.productTitle || cfg.label;
    }

    // Terms zilizonormalizwa kwa aina (spec §6, §10, §12).
    function commerceTermsOf(nego) {
        nego = nego || {};
        const cfg = configOf(nego);
        const t = { quantity: nego.quantity || 1 };
        if (cfg.key === COMMERCE_TYPES.PRODUCT) {
            t.unitPrice = nego.currentUnitPrice != null ? nego.currentUnitPrice : (nego.originalUnitPrice != null ? nego.originalUnitPrice : null);
            t.total = nego.currentTotal != null ? nego.currentTotal : null;
            // [NEGO MODULE 01] mapendeleo ya fomu ya ofa.
            t.deliveryLocation = nego.deliveryLocation || '';
            t.preferredDate = nego.preferredDate || '';
        } else if (cfg.key === COMMERCE_TYPES.SERVICE) {
            t.scope = nego.scope || '';
            t.scopeUnit = nego.scopeUnit || '';
            t.unitPrice = nego.currentUnitPrice != null ? nego.currentUnitPrice : null;
            t.total = nego.currentTotal != null ? nego.currentTotal : null;
            t.deadline = nego.deadline || '';
            t.location = nego.location || '';
            t.requirements = nego.requirements || '';
        } else if (cfg.key === COMMERCE_TYPES.TRANSPORT) {
            t.route = nego.route || {};
            t.packageDescription = nego.packageDescription || '';
            t.packageQuantity = nego.packageQuantity || '';
            t.weight = (nego.weight != null && nego.weight !== '') ? nego.weight : '';
            t.fare = nego.currentUnitPrice != null ? nego.currentUnitPrice : null;
            t.pickupDate = nego.pickupDate || '';
            t.deliveryDeadline = nego.deliveryDeadline || '';
            t.pickupTime = nego.pickupTime || '';
            t.vehicleType = nego.vehicleType || '';
            t.specialRequirements = nego.specialRequirements || '';
        }
        return t;
    }

    // Sehemu za terms (spec §14) — thamani GHAFI (hazijaachiliwa kwa HTML).
    // Hutumiwa na commerceTermsLines (maandishi) na commerceTermsHtml (HTML).
    function commerceTermParts(nego) {
        const cfg = configOf(nego);
        const terms = commerceTermsOf(nego);
        const parts = [];
        cfg.terms.forEach(function (f) {
            const v = terms[f.k];
            if (v == null || v === '' || (f.money && !(Number(v) > 0))) return;
            let s;
            if (f.k === 'route' && v && (v.from || v.to)) s = (v.from || '?') + ' → ' + (v.to || '?');
            else if (f.money) s = 'TSh ' + Number(v).toLocaleString();
            else s = String(v);
            if (s) parts.push({ label: f.label, value: s, suffix: f.suffix || '' });
        });
        return parts;
    }

    // [FIX 2026-09] Mistari ya MAANDISHI TU (arifa/kumbukumbu) — bila HTML.
    function commerceTermsLines(nego) {
        return commerceTermParts(nego).map(function (p) {
            return p.label + ': ' + p.value + (p.suffix ? ' ' + p.suffix : '');
        });
    }

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // [FIX 2026-09] Mistari salama ya HTML — thamani za mtumiaji huachiliwa
    // (hapo ndipo kulikojitokeza "&lt;b&gt;maneno&lt;/b&gt;" kwenye kadi).
    function commerceTermsHtml(nego) {
        return commerceTermParts(nego).map(function (p) {
            return escHtml(p.label) + ': <b>' + escHtml(p.value) + '</b>' + (p.suffix ? ' ' + escHtml(p.suffix) : '');
        });
    }

    /* [DIALOGUE §17] Mabadiliko YANAYOOMBWA (bado hayajakubaliwa) — huonyeshwa
     * kando ya terms za sasa: kiasi cha sasa → kilichoombwa, scope/njia mpya.
     * Haya ni MAOMBI yanayosubiri jibu la upande mwingine (CHANGE_REQUESTED /
     * SCOPE_CHANGE_REQUESTED / ROUTE_CHANGE_REQUESTED). */
    function pendingChangeHtml(nego) {
        nego = nego || {};
        const lines = [];
        if (nego.pendingQuantity != null && Number(nego.pendingQuantity) > 0) {
            const cur = nego.quantity || 1;
            const pq = Number(nego.pendingQuantity);
            if (pq !== Number(cur)) {
                lines.push('Ombi la kiasi: <b>' + escHtml(String(cur)) + ' → ' + escHtml(String(pq)) + '</b> pc');
            }
        }
        if (nego.pendingScope != null && nego.pendingScope !== '') {
            lines.push('Scope mpya iliyoombwa: <b>' + escHtml(String(nego.pendingScope)) + '</b>'
                + (nego.pendingScopeUnit ? ' (' + escHtml(String(nego.pendingScopeUnit)) + ')' : ''));
        }
        if (nego.pendingDeadline != null && nego.pendingDeadline !== '') {
            lines.push('Muda mpya ulioombwa: <b>' + escHtml(String(nego.pendingDeadline)) + '</b>');
        }
        if (nego.pendingRoute && (nego.pendingRoute.from || nego.pendingRoute.to)) {
            const r = nego.pendingRoute;
            lines.push('Njia mpya iliyoombwa: <b>' + escHtml(r.from || '?') + ' → ' + escHtml(r.to || '?') + '</b>');
        }
        return lines;
    }

    /* ============================================================
     * 4) JENZI LA VITUFE (spec §8) — vitufe halali pekee.
     * ============================================================ */
    function buildButtons(nego, ctx, handlers) {
        const actions = resolveActions(nego, ctx);
        if (!actions.length) return '';
        handlers = handlers || {};
        // [DIALOGUE FIX] default handler hubeba negotiationId wazi ili vitufe
        // vifanye kazi hata kama skh.negoCurrent haijapakiwa (upande wa muuzaji,
        // index ya Firestore isiyopelekwa, snapshot ya kadi pekee).
        const dflt = handlers.__default__ || function (c) {
            return 'window.skhNegoCommand(' + JSON.stringify(c)
                + ',' + JSON.stringify({ negotiationId: nego.negotiationId }) + ')';
        };
        return '<div class="ch-nego-actions">' + actions.map(function (a) {
            const fn = handlers[a.command] || dflt(a.command, nego, a);
            // [DIALOGUE FIX] fn ina JSON (nukta mbili za ndani) — lazima
            // zifungwe kama &quot; ili sifa ya onclick isivunjike (vivyo hivyo
            // vitufe havikufanya kazi kwa upande wa muuzaji).
            const attr = String(fn).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            const label = escHtml(a.label);
            // [REMBA 2026-09] Madarasa yenye maana + ikoni za SVG (hakuna emoji).
            // window.skhNavIcon haipo katika majaribio ya Node → ikoni huachwa.
            var cls = 'ch-nego-btn' + (a.primary ? ' primary' : '');
            var icName = '';
            if (/^ACCEPT/.test(a.command)) { cls += ' accept'; icName = 'check'; }
            else if (/^REJECT|^CANCEL/.test(a.command)) { cls += ' reject'; icName = a.command.indexOf('CANCEL') === 0 ? 'x' : 'x'; }
            else if (/COUNTER|CHANGE/.test(a.command)) { cls += ' outline'; icName = 'refresh'; }
            else if (/QUANTITY|ADDITIONAL/.test(a.command)) { cls += ' outline'; icName = 'plus'; }
            else if (/CREATE_ORDER/.test(a.command)) { icName = 'cart'; }
            else if (/CREATE_BOOKING/.test(a.command)) { icName = 'truck'; }
            else if (/^SEND_OFFER/.test(a.command)) { icName = 'send'; }
            var ic = '';
            try { if (typeof window !== 'undefined' && window.skhNavIcon && icName) ic = window.skhNavIcon(icName, 14); } catch (e) {}
            return '<button type="button" class="' + cls + '" onclick="' + attr + '">' + ic + '<span>' + label + '</span></button>';
        }).join('') + '</div>';
    }

    // Kichwa kidogo cha mkoba wa majadiliano (history) — spec §22.
    function historyLines(nego) {
        const h = nego.history || [];
        if (!h.length) return '';
        const items = h.slice(-6).map(function (e) {
            const t = {
                offer_sent: '' + (e.price || 0).toLocaleString() + ' — ' + (e.actorRole === 'buyer' ? 'Mnunuzi' : 'Muuzaji'),
                // [REMBA] ikoni ya SVG (Node tests hazina window.skhNavIcon).
                counter: (typeof window !== 'undefined' && window.skhNavIcon ? window.skhNavIcon('refresh', 12) + ' ' : '') + (e.price || 0).toLocaleString() + ' — counter',
                accepted: '' + (e.price || 0).toLocaleString() + ' — Imekubaliwa',
                rejected: 'Imekataliwa',
                quantity_change: 'Kiasi: ' + (e.previousQuantity || 0) + ' → ' + (e.newQuantity || 0),
                agreement: 'Makubaliano v' + (e.agreementVersion || 1),
                order_created: 'Oda #' + (e.orderId || ''),
                cancelled: 'Imefutwa',
                expired: 'Imeisha muda'
            };
            return '<div class="ch-nego-hist-line">' + (t[e.kind] || e.kind || '—') + '</div>';
        });
        return '<details class="ch-nego-hist"><summary>Historia ya Majadiliano</summary>' + items.join('') + '</details>';
    }

    /* ============================================================
     * 5) AI / KUTAMBUA NIA (spec §29) — LOCAL heuristics.
     *    AI inatambua tu na kupendekeza; HAITEKELEZI chochote.
     * ============================================================ */
    function detectIntent(text, ctx) {
        if (!text) return null;
        ctx = ctx || {};
        const type = ctx.type || ctx.commerceType || COMMERCE_TYPES.PRODUCT;
        if (type === COMMERCE_TYPES.SERVICE) return detectServiceIntent(text, ctx);
        if (type === COMMERCE_TYPES.TRANSPORT) return detectTransportIntent(text, ctx);
        return detectProductIntent(text, ctx);
    }

    // [COMMERCE 2026-09] Service intent (propose-only, spec §22).
    function detectServiceIntent(text, ctx) {
        let s = String(text).toLowerCase();
        s = s.replace(/(\d)[,.](?=\d{3}\b)/g, '$1');
        const t = ' ' + s.replace(/[.,!?]+/g, ' ') + ' ';
        const num = function (re) { const m = t.match(re); return m ? parseInt(m[1], 10) : null; };
        // 1) Deadline/duration: "siku 2", "ndani ya siku 3", "masaa 4"
        const days = num(/(?:siku|ndani ya siku|days?|masaa|saa|wiki|weeks?)\D{0,8}(\d{1,3})/);
        if (days && days > 0) {
            const unit = /masaa|saa|hour/i.test(t) ? 'saa' : 'siku';
            return { command: COMMANDS.REQUEST_SCOPE_CHANGE, deadline: days + ' ' + unit, note: text };
        }
        // 2) Scope count: "posters 3", "poster 5", "kazi 2"
        const scope = num(/(?:posters?|kazi|bango|banners?|designs?|fomu|mafomu)\D{0,8}(\d{1,3})/);
        if (scope && scope > 0) return { command: COMMANDS.REQUEST_SCOPE_CHANGE, scope: scope, note: text };
        // 3) Accept
        if (/\b(nakubali|nimekubali|kubali|sawa|okay|ok deal|deal|accept|ninakubali)\b/.test(t)) {
            if (ctx && (ctx.state === STATES.COUNTER_OFFER || ctx.state === STATES.OFFER_SENT || ctx.state === STATES.RE_NEGOTIATION)) {
                return { command: COMMANDS.ACCEPT_OFFER, note: text };
            }
        }
        // 4) Price counter
        const price = num(/(?:naweza|natoa|nitakupa|nakupa|kwa\s*\d+\s*nakupa|bei ni|at|for|offer|give you)\D{0,12}(\d{4,9})/);
        if (price && price > 0) return { command: COMMANDS.COUNTER_OFFER, price: price, quantity: (ctx && ctx.quantity) || null, note: text };
        return null;
    }

    // [COMMERCE 2026-09] Transport intent (propose-only, spec §22).
    function detectTransportIntent(text, ctx) {
        let s = String(text).toLowerCase();
        s = s.replace(/(\d)[,.](?=\d{3}\b)/g, '$1');
        const t = ' ' + s.replace(/[.,!?]+/g, ' ') + ' ';
        const num = function (re) { const m = t.match(re); return m ? parseInt(m[1], 10) : null; };
        // 1) Accept
        if (/\b(nakubali|nimekubali|kubali|sawa|okay|ok deal|deal|accept|ninakubali)\b/.test(t)) {
            if (ctx && (ctx.state === STATES.COUNTER_OFFER || ctx.state === STATES.OFFER_SENT || ctx.state === STATES.RE_NEGOTIATION)) {
                return { command: COMMANDS.ACCEPT_OFFER, note: text };
            }
        }
        // 2) Fare counter: "28,000 inawezekana" au "30,000 mwisho"
        const fare = num(/(?:naweza|natoa|nitakupa|nakupa|inawezekana|mwisho|bei|fare|at|for)\D{0,12}(\d{4,9})/)
            || num(/(\d{4,9})\D{0,8}(?:mwisho|kubwa|ndogo|inawezekana|basi|tu)\b/);
        if (fare && fare > 0) return { command: COMMANDS.COUNTER_OFFER, price: fare, note: text };
        // 3) Route change: "toka A mpaka B"
        const route = t.match(/(?:toka|kutoka)\s+([a-z0-9\s-]+?)\s+(?:mpaka|kwenda|hadi)\s+([a-z0-9\s-]+)/);
        if (route) return { command: COMMANDS.REQUEST_ROUTE_CHANGE, route: { from: route[1].trim(), to: route[2].trim() }, note: text };
        return null;
    }

    function detectProductIntent(text, ctx) {
        if (!text) return null;
        // [NEGO 2026-09] Ondoa separators za maelfu ("65,000" → "65000") KABLA
        // ya kuondoa alama, vinginevyo namba hugawanyika ("65 000") na bei hupotea.
        let s = String(text).toLowerCase();
        s = s.replace(/(\d)[,.](?=\d{3}\b)/g, '$1');
        const t = ' ' + s.replace(/[.,!?]+/g, ' ') + ' ';
        const num = function (re) {
            const m = t.match(re);
            return m ? parseInt(m[1], 10) : null;
        };

        // 1) Mabadiliko ya kiasi: "nataka 5", "ongeza iwe 5", "badilisha kuwa 3"
        const qty = num(/(?:nataka|nipe|ongeza|badili(?:sha)?(?:\s+kuwa|\s+iwe)?|iwe|badilishe kuwa|make it|increase to|reduce to|want)\D{0,12}(\d{1,4})/);
        if (qty && qty > 0 && ctx && ctx.quantity && qty !== ctx.quantity) {
            return { command: COMMANDS.REQUEST_QUANTITY_CHANGE, quantity: qty, note: text };
        }

        // 2) Kukubali: "sawa nakubali 70,000", "ok deal", "nimekubali"
        if (/\b(nakubali|nimekubali|kubali|sawa|okay|ok deal|deal|accept|ninakubali)\b/.test(t)) {
            if (ctx && (ctx.state === STATES.COUNTER_OFFER || ctx.state === STATES.RE_NEGOTIATION || ctx.state === STATES.OFFER_SENT)) {
                return { command: COMMANDS.ACCEPT_OFFER, note: text };
            }
        }

        // 3) Bei mpya: "naweza 65,000?", "natoa 67,000", "kwa 5 nakupa 67,000"
        const price = num(/(?:naweza|natoa|nitakupa|nakupa|kwa\s*\d+\s*nakupa|bei ni|at|for|offer|give you)\D{0,12}(\d{4,9})/);
        if (price && price > 0) {
            const qty2 = num(/(?:nataka|nipe|kwa|for|qty|idadi)\D{0,10}(\d{1,4})/);
            return { command: COMMANDS.COUNTER_OFFER, price: price, quantity: qty2 || (ctx && ctx.quantity) || null, note: text };
        }

        return null;
    }

    /* ============================================================
     * 5b) DELIVERY FLOW (spec §23–§26, §35, §37) — mtiririko wa
     *     uwasilishaji wa oda iliyotokana na majadiliano.
     *     Logic tupu — server ndiye anabadilisha state.
     * ============================================================ */
    const ORDER_STATUS_LABELS = {
        payment_pending: 'Inasubiri Malipo',
        held: 'Imelipwa (Escrow)',
        prepared: 'Imetayarishwa',
        shipped: 'Imesafirishwa',
        in_transit: 'Iko Njiani',
        delivered: 'Imewasilishwa',
        confirmed: 'Imethibitishwa',
        completed: 'Imekamilika'
    };
    const ORDER_PIPELINE = ['held', 'prepared', 'in_transit', 'delivered', 'confirmed'];

    // [COMMERCE 2026-09] Service completion pipeline (spec §7–§8).
    const SERVICE_STATUS_LABELS = {
        payment_pending: 'Inasubiri Malipo',
        held: 'Imelipwa (Escrow)',
        service_in_progress: 'Kazi Inaendelea',
        service_submitted: 'Kazi Imewasilishwa',
        revision_requested: 'Marekebisho Yameombwa',
        completed: 'Imekamilika'
    };
    const SERVICE_PIPELINE = ['held', 'service_in_progress', 'service_submitted', 'completed'];

    // [COMMERCE 2026-09] Transport booking pipeline (spec §11–§12).
    const TRANSPORT_STATUS_LABELS = {
        payment_pending: 'Inasubiri Malipo',
        held: 'Imelipwa (Escrow)',
        booking_confirmed: 'Booking Imethibitishwa',
        pickup: 'Pickup',
        in_transit: 'Njiani',
        handover: 'Handover',
        confirmed: 'Imethibitishwa',
        completed: 'Imekamilika'
    };
    const TRANSPORT_PIPELINE = ['booking_confirmed', 'pickup', 'in_transit', 'handover', 'confirmed'];

    // Hatua za pipeline zilizofikiwa kwa jina (deliveryStatus || status).
    function orderStage(order) {
        order = order || {};
        return String(order.deliveryStatus || order.status || 'payment_pending');
    }

    // [COMMERCE 2026-09] Hatua type-aware (service/transport wana pipeline zao).
    function commerceOrderStage(order) {
        order = order || {};
        const t = order.commerceType || 'product';
        if (t === 'service') return String(order.serviceStatus || order.deliveryStatus || order.status || 'payment_pending');
        if (t === 'transport') return String(order.transportStatus || order.deliveryStatus || order.status || 'payment_pending');
        return orderStage(order);
    }

    // [COMMERCE 2026-09] Dispatcher — tracker ya pipeline kwa aina (spec §14).
    function orderTrackerHtml(order) {
        const t = (order && order.commerceType) || 'product';
        if (t === 'service') return serviceTrackerHtml(order);
        if (t === 'transport') return transportTrackerHtml(order);
        return productTrackerHtml(order);
    }

    function productTrackerHtml(order) {
        const stage = orderStage(order);
        if (stage === 'payment_pending') {
            return '<div class="ch-nego-track"><b>Inasubiri Malipo</b> — mnunuzi alipe kupitia SokoPay.</div>';
        }
        const idx = ORDER_PIPELINE.indexOf(stage);
        const done = idx < 0 ? ORDER_PIPELINE.length : idx + 1;
        const steps = [
            ['Lipia', 'held'],
            ['Andaa', 'prepared'],
            ['Safirisha', 'in_transit'],
            ['Fikisha', 'delivered'],
            ['Thibitisha', 'confirmed']
        ];
        const dots = steps.map(function (st, i) {
            const on = i < done;
            const cls = on ? 'ch-track-dot on' : 'ch-track-dot';
            return '<span class="ch-track-step"><span class="' + cls + '"></span><span class="ch-track-lbl">' + st[0] + '</span></span>';
        }).join('');
        return '<div class="ch-nego-track"><div class="ch-track-line"></div>' + dots + '</div>';
    }

    function serviceTrackerHtml(order) {
        const stage = commerceOrderStage(order);
        if (stage === 'payment_pending') {
            return '<div class="ch-nego-track"><b>Inasubiri Malipo</b> — mteja alipe kupitia SokoPay.</div>';
        }
        const idx = SERVICE_PIPELINE.indexOf(stage);
        const done = idx < 0 ? SERVICE_PIPELINE.length : idx + 1;
        const steps = [
            ['Lipia', 'held'],
            ['Kazi', 'service_in_progress'],
            ['Wasilisha', 'service_submitted'],
            ['Kamilisha', 'completed']
        ];
        const dots = steps.map(function (st, i) {
            const on = i < done;
            const cls = on ? 'ch-track-dot on' : 'ch-track-dot';
            return '<span class="ch-track-step"><span class="' + cls + '"></span><span class="ch-track-lbl">' + st[0] + '</span></span>';
        }).join('');
        return '<div class="ch-nego-track"><div class="ch-track-line"></div>' + dots + '</div>';
    }

    function transportTrackerHtml(order) {
        const stage = commerceOrderStage(order);
        if (stage === 'payment_pending') {
            return '<div class="ch-nego-track"><b>Inasubiri Malipo</b> — mteja alipe kupitia SokoPay.</div>';
        }
        const idx = TRANSPORT_PIPELINE.indexOf(stage);
        const done = idx < 0 ? TRANSPORT_PIPELINE.length : idx + 1;
        const steps = [
            ['Booking', 'booking_confirmed'],
            ['Pickup', 'pickup'],
            ['Safari', 'in_transit'],
            ['Handover', 'handover'],
            ['Thibitisha', 'confirmed']
        ];
        const dots = steps.map(function (st, i) {
            const on = i < done;
            const cls = on ? 'ch-track-dot on' : 'ch-track-dot';
            return '<span class="ch-track-step"><span class="' + cls + '"></span><span class="ch-track-lbl">' + st[0] + '</span></span>';
        }).join('');
        return '<div class="ch-nego-track"><div class="ch-track-line"></div>' + dots + '</div>';
    }

    // Vitendo halali vya oda (spec §7, §9) — kulingana na hali + nafasi + malipo.
    // [COMMERCE 2026-09] Dispatcher — pipeline kwa aina (product/service/transport).
    function getAvailableOrderActions(order, ctx) {
        order = order || {};
        ctx = ctx || {};
        const t = order.commerceType || 'product';
        if (t === 'service') return getServiceOrderActions(order, ctx);
        if (t === 'transport') return getTransportOrderActions(order, ctx);
        return getProductOrderActions(order, ctx);
    }

    function getProductOrderActions(order, ctx) {
        order = order || {};
        ctx = ctx || {};
        const stage = orderStage(order);
        const paid = (order.paymentStatus === 'paid') || (order.paymentVerified === true) || (stage === 'held' || stage === 'prepared' || stage === 'shipped' || stage === 'in_transit' || stage === 'delivered' || stage === 'confirmed' || stage === 'completed');
        const out = [];
        const btn = function (command, label, opts) { out.push(Object.assign({ command: command, label: label, primary: false }, opts || {})); };

        if (!paid) {
            if (ctx.iAmBuyer) btn('PAY_ORDER', 'Lipia', { primary: true });
            return out;
        }
        if (stage === 'held' || stage === 'payment_pending') {
            if (ctx.iAmSeller) btn('PREPARE_ORDER', 'Andaa', { primary: true });
        } else if (stage === 'prepared' || stage === 'shipped') {
            if (ctx.iAmSeller) btn('START_TRANSIT', 'Safirisha', { primary: true });
        } else if (stage === 'in_transit') {
            if (ctx.iAmSeller) btn('MARK_DELIVERED', 'Thibitisha Uwasilishaji', { primary: true });
        } else if (stage === 'delivered') {
            if (ctx.iAmBuyer) btn('CONFIRM_RECEIPT', 'Nimepokea Mzigo', { primary: true });
        } else if (stage === 'confirmed' || stage === 'completed') {
            if (ctx.iAmBuyer) btn('REVIEW_ORDER', 'Tathmini', { primary: true });
        }
        return out;
    }

    // [COMMERCE 2026-09] Service order actions (spec §8).
    function getServiceOrderActions(order, ctx) {
        order = order || {};
        ctx = ctx || {};
        const stage = commerceOrderStage(order);
        const paid = (order.paymentStatus === 'paid') || (order.paymentVerified === true) || (stage === 'held' || stage === 'service_in_progress' || stage === 'service_submitted' || stage === 'revision_requested' || stage === 'completed');
        const out = [];
        const btn = function (command, label, opts) { out.push(Object.assign({ command: command, label: label, primary: false }, opts || {})); };
        if (!paid) {
            if (ctx.iAmBuyer) btn('PAY_ORDER', 'Lipia', { primary: true });
            return out;
        }
        if (stage === 'held' || stage === 'payment_pending') {
            if (ctx.iAmSeller) btn('START_SERVICE', 'Anza Kazi', { primary: true });
        } else if (stage === 'service_in_progress') {
            if (ctx.iAmSeller) btn('SUBMIT_WORK', 'Wasilisha Kazi', { primary: true });
        } else if (stage === 'service_submitted') {
            if (ctx.iAmBuyer) { btn('REQUEST_REVISION', 'Omba Marekebisho'); btn('CONFIRM_COMPLETION', 'Thibitisha Kukamilika', { primary: true }); }
        } else if (stage === 'revision_requested') {
            if (ctx.iAmSeller) btn('SUBMIT_WORK', 'Wasilisha Kazi Tena', { primary: true });
        } else if (stage === 'completed') {
            if (ctx.iAmBuyer) btn('REVIEW_ORDER', 'Tathmini', { primary: true });
        }
        return out;
    }

    // [COMMERCE 2026-09] Transport booking actions (spec §12).
    function getTransportOrderActions(order, ctx) {
        order = order || {};
        ctx = ctx || {};
        const stage = commerceOrderStage(order);
        const paid = (order.paymentStatus === 'paid') || (order.paymentVerified === true) || (stage === 'held' || stage === 'booking_confirmed' || stage === 'pickup' || stage === 'in_transit' || stage === 'handover' || stage === 'confirmed' || stage === 'completed');
        const out = [];
        const btn = function (command, label, opts) { out.push(Object.assign({ command: command, label: label, primary: false }, opts || {})); };
        if (!paid) {
            if (ctx.iAmBuyer) btn('PAY_ORDER', 'Lipia', { primary: true });
            return out;
        }
        if (stage === 'held' || stage === 'payment_pending') {
            if (ctx.iAmSeller) btn('CONFIRM_BOOKING', 'Thibitisha Booking', { primary: true });
        } else if (stage === 'booking_confirmed') {
            if (ctx.iAmSeller) btn('START_PICKUP', 'Anza Pickup', { primary: true });
        } else if (stage === 'pickup') {
            if (ctx.iAmSeller) btn('START_TRANSIT', 'Anza Safari', { primary: true });
        } else if (stage === 'in_transit') {
            if (ctx.iAmSeller) btn('CONFIRM_HANDOVER', 'Thibitisha Handover', { primary: true });
        } else if (stage === 'handover') {
            if (ctx.iAmBuyer) btn('CONFIRM_RECEIPT', 'Nimepokea', { primary: true });
        } else if (stage === 'confirmed' || stage === 'completed') {
            if (ctx.iAmBuyer) btn('REVIEW_ORDER', 'Tathmini', { primary: true });
        }
        return out;
    }

    /* ============================================================
     * 5b) ORDER STAGE ENGINE (spec §23–§26, §37) — logic tupu ya
     *     utekelezaji/uteshaji wa ODA baada ya malipo. Ni MIOO kamili
     *     ya functions/negotiation.js negotiationOrderAction: hapa
     *     hatuandiki Firestore — 34-chat-core hufanya transaction ya
     *     fallback Cloud Functions zisipopatikana.
     * ============================================================ */
    // Sehemu ya hali inayobadilika kwa kila aina.
    function orderStageField(order) {
        const t = (order && order.commerceType) || 'product';
        if (t === 'service') return 'serviceStatus';
        if (t === 'transport') return 'transportStatus';
        return 'deliveryStatus';
    }

    // product: deliveryStatus/status (msamiati wa `orders` uliyopo).
    const PRODUCT_ORDER_DEFS = {
        PREPARE_ORDER:    { from: ['held', 'shipped', 'prepared'], actor: 'seller', stage: 'prepared', status: 'shipped', at: 'preparedAt', notif: { title: 'Oda Imetayarishwa', body: 'Muuzaji ameandaa bidhaa yako na iko tayari kusafirishwa.' } },
        START_TRANSIT:    { from: ['prepared', 'shipped'], actor: 'seller', stage: 'in_transit', status: 'in_transit', at: 'inTransitAt', notif: { title: 'Bidhaa Yako Iko Njia', body: 'Oda yako imesafirishwa na iko njiani kwako.' } },
        MARK_DELIVERED:   { from: ['in_transit'], actor: 'seller', stage: 'delivered', status: 'delivered', at: 'deliveredAt', notif: { title: 'Mzigo Umewasilishwa', body: 'Mzigo wako umewasilishwa. Thibitisha kupokea.' } },
        CONFIRM_RECEIPT:  { from: ['delivered'], actor: 'buyer', stage: 'confirmed', status: 'completed', at: 'completedAt', notif: { title: 'Mnunuzi Amethibitisha Kupokea', body: 'Mnunuzi amethibitisha kupokea mzigo. Asante!' } }
    };
    // service: serviceStatus (status hubaki 'held' hadi kukamilika).
    const SERVICE_ORDER_DEFS = {
        START_SERVICE:        { from: ['held'], actor: 'seller', stage: 'service_in_progress', status: 'held', at: 'serviceStartedAt', notif: { title: 'Kazi Imeanza', body: 'Mtoa huduma ameanza kazi yako.' } },
        SUBMIT_WORK:          { from: ['service_in_progress', 'revision_requested'], actor: 'seller', stage: 'service_submitted', status: 'held', at: 'serviceSubmittedAt', notif: { title: 'Kazi Imewasilishwa', body: 'Kazi yako imewasilishwa. Tafadhali kagua na uthibitishe.' } },
        REQUEST_REVISION:     { from: ['service_submitted'], actor: 'buyer', stage: 'revision_requested', status: 'held', at: 'revisionRequestedAt', notif: { title: 'Marekebisho Yameombwa', body: 'Mteja ameomba marekebisho ya kazi.' } },
        CONFIRM_COMPLETION:   { from: ['service_submitted'], actor: 'buyer', stage: 'completed', status: 'completed', at: 'completedAt', notif: { title: 'Kazi Imethibitishwa', body: 'Mteja amethibitisha kukamilika kwa kazi. Asante!' } }
    };
    // transport: transportStatus (booking → pickup → safari → handover).
    const TRANSPORT_ORDER_DEFS = {
        CONFIRM_BOOKING:   { from: ['held'], actor: 'seller', stage: 'booking_confirmed', status: 'held', at: 'bookingConfirmedAt', notif: { title: 'Booking Imethibitishwa', body: 'Booking yako imethibitishwa na mtoa usafiri.' } },
        START_PICKUP:      { from: ['booking_confirmed'], actor: 'seller', stage: 'pickup', status: 'held', at: 'pickupStartedAt', notif: { title: 'Pickup Imeanza', body: 'Dereva ameelekea kuchukua mzigo.' } },
        START_TRANSIT:     { from: ['pickup'], actor: 'seller', stage: 'in_transit', status: 'held', at: 'inTransitAt', notif: { title: 'Safari Imeanza', body: 'Mzigo wako uko njiani.' } },
        CONFIRM_HANDOVER:  { from: ['in_transit'], actor: 'seller', stage: 'handover', status: 'delivered', at: 'handoverAt', notif: { title: 'Mzigo Umekabidhiwa', body: 'Mzigo umekabidhiwa. Thibitisha kupokea.' } },
        CONFIRM_RECEIPT:   { from: ['handover'], actor: 'buyer', stage: 'confirmed', status: 'completed', at: 'completedAt', notif: { title: 'Umethibitisha Kupokea', body: 'Umethibitisha kupokea mzigo. Asante!' } }
    };
    function orderDefsFor(order) {
        const t = (order && order.commerceType) || 'product';
        if (t === 'service') return SERVICE_ORDER_DEFS;
        if (t === 'transport') return TRANSPORT_ORDER_DEFS;
        return PRODUCT_ORDER_DEFS;
    }

    function orderIsPaid(order) {
        order = order || {};
        return order.paymentStatus === 'paid' || order.paymentVerified === true || order.status === 'held';
    }

    // Tekeleza amri ya oda kimahesabu (bila kuandika). Hurudisha
    // { ok, patch, event, notification } au { ok:false, error, code }.
    function applyOrderCommandLocally(order, command, actorUid, nowIsoStr) {
        order = order || {};
        command = String(command || '').toUpperCase();
        nowIsoStr = nowIsoStr || new Date().toISOString();
        const defs = orderDefsFor(order);
        const def = defs[command];
        const fail = (msg, code) => ({ ok: false, error: msg, code: code || 'failed-precondition' });
        if (!def) return fail('Hatua "' + command + '" haijulikani.', 'invalid-argument');
        const isBuyer = order.buyerId === actorUid;
        const isSeller = order.sellerId === actorUid;
        if (!isBuyer && !isSeller) return fail('Huna ruhusa kwenye oda hii.', 'permission-denied');
        if (def.actor === 'seller' && !isSeller) return fail('Muuzaji pekee anaweza kufanya hatua hii.', 'permission-denied');
        if (def.actor === 'buyer' && !isBuyer) return fail('Mnunuzi pekee anaweza kufanya hatua hii.', 'permission-denied');
        if (!orderIsPaid(order)) return fail('Oda haijalipwa bado. Mnunuzi alipe kupitia SokoPay kwanza.');
        const field = orderStageField(order);
        const current = String(order[field] || order.status || 'payment_pending');
        if (def.from.indexOf(current) === -1) {
            return fail('Hatua "' + command + '" hairuhusiwi kwenye hali "' + current + '".');
        }
        const patch = { status: def.status, updatedAt: nowIsoStr };
        patch[field] = def.stage;
        if (def.at) patch[def.at] = nowIsoStr;
        if (command === 'CONFIRM_RECEIPT' || command === 'CONFIRM_COMPLETION') {
            patch.completedAt = nowIsoStr;
            patch.deliveryConfirmedAt = nowIsoStr;
            patch.status = 'completed';
        }
        const event = {
            orderId: order.orderId || order.id || null,
            negotiationId: order.negotiationId || null,
            actorId: actorUid,
            actorRole: isBuyer ? 'buyer' : 'seller',
            command: command,
            previousState: current,
            newState: def.stage,
            at: nowIsoStr
        };
        const notification = def.notif ? {
            to: def.actor === 'buyer' ? order.sellerId : order.buyerId,
            title: def.notif.title,
            body: (order.itemTitle || order.productTitle || 'Bidhaa') + ' — ' + def.notif.body
        } : null;
        return { ok: true, patch: patch, stage: def.stage, event: event, notification: notification };
    }

    /* ============================================================
     * 5c) LOCAL COMMAND ENGINE (spec §21, §34, §44) — fallback ya
     *     Firestore-native kwa mazingira BILA Cloud Functions.
     *     Mioo kamili ya functions/negotiation.js applyCommand:
     *     inakokotoa patch/event/notification/order — HAIANDIKI Firestore.
     *     Uandikaji wa atomic (transaction) ni jukumu la 34-chat-core.js.
     * ============================================================ */
    const FULL_TRANSITIONS = {};
    const FT = (from, cmd, to, actor, turnAfter) => {
        (FULL_TRANSITIONS[from] = FULL_TRANSITIONS[from] || {})[cmd] = { to: to, actor: actor, turnAfter: turnAfter };
    };
    FT(STATES.DRAFT, 'SEND_OFFER', STATES.OFFER_SENT, 'buyer', 'seller');
    FT(STATES.DRAFT, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.OFFER_SENT, 'ACCEPT_OFFER', STATES.AGREEMENT, 'turn', 'buyer');
    FT(STATES.OFFER_SENT, 'COUNTER_OFFER', STATES.COUNTER_OFFER, 'turn', null);
    FT(STATES.OFFER_SENT, 'REJECT_OFFER', STATES.REJECTED, 'turn', null);
    FT(STATES.OFFER_SENT, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.OFFER_SENT, 'EXPIRE_NEGOTIATION', STATES.EXPIRED, 'system', null);
    FT(STATES.COUNTER_OFFER, 'ACCEPT_OFFER', STATES.AGREEMENT, 'turn', 'buyer');
    FT(STATES.COUNTER_OFFER, 'COUNTER_OFFER', STATES.COUNTER_OFFER, 'turn', null);
    FT(STATES.COUNTER_OFFER, 'REJECT_OFFER', STATES.REJECTED, 'turn', null);
    FT(STATES.COUNTER_OFFER, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.COUNTER_OFFER, 'EXPIRE_NEGOTIATION', STATES.EXPIRED, 'system', null);
    FT(STATES.AGREEMENT, 'REQUEST_QUANTITY_CHANGE', STATES.CHANGE_REQUESTED, 'buyer', 'seller');
    FT(STATES.AGREEMENT, 'REQUEST_PRICE_CHANGE', STATES.RE_NEGOTIATION, 'buyer', 'seller');
    FT(STATES.AGREEMENT, 'CREATE_ORDER', STATES.ORDER_CREATED, 'buyer', 'buyer');
    FT(STATES.AGREEMENT, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.CHANGE_REQUESTED, 'ACCEPT_QUANTITY_CHANGE', STATES.FINAL_AGREEMENT, 'seller', 'buyer');
    FT(STATES.CHANGE_REQUESTED, 'REJECT_QUANTITY_CHANGE', STATES.AGREEMENT, 'seller', 'buyer');
    FT(STATES.CHANGE_REQUESTED, 'COUNTER_QUANTITY_CHANGE', STATES.RE_NEGOTIATION, 'seller', 'buyer');
    FT(STATES.CHANGE_REQUESTED, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.RE_NEGOTIATION, 'ACCEPT_OFFER', STATES.FINAL_AGREEMENT, 'turn', 'buyer');
    FT(STATES.RE_NEGOTIATION, 'COUNTER_OFFER', STATES.RE_NEGOTIATION, 'turn', null);
    FT(STATES.RE_NEGOTIATION, 'REJECT_OFFER', STATES.AGREEMENT, 'turn', 'buyer');
    FT(STATES.RE_NEGOTIATION, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.RE_NEGOTIATION, 'EXPIRE_NEGOTIATION', STATES.EXPIRED, 'system', null);
    FT(STATES.FINAL_AGREEMENT, 'CREATE_ORDER', STATES.ORDER_CREATED, 'buyer', 'buyer');
    FT(STATES.FINAL_AGREEMENT, 'REQUEST_QUANTITY_CHANGE', STATES.CHANGE_REQUESTED, 'buyer', 'seller');
    FT(STATES.FINAL_AGREEMENT, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.ORDER_CREATED, 'REQUEST_ADDITIONAL_ITEMS', STATES.CHANGE_REQUESTED, 'buyer', 'seller');
    FT(STATES.ORDER_CREATED, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);

    // [COMMERCE 2026-09] Service — scope change transitions (spec §8).
    // SCOPE_CHANGE_REQUESTED inajibiwa na yule ALIYE ZAMU (turn) — si muuzaji
    // pekee: baada ya CHANGE_SCOPE (turn), mpinzani ndiye anajibu.
    FT(STATES.OFFER_SENT, 'CHANGE_SCOPE', STATES.SCOPE_CHANGE_REQUESTED, 'turn', null);
    FT(STATES.COUNTER_OFFER, 'CHANGE_SCOPE', STATES.SCOPE_CHANGE_REQUESTED, 'turn', null);
    FT(STATES.SCOPE_CHANGE_REQUESTED, 'ACCEPT_SCOPE_CHANGE', STATES.FINAL_AGREEMENT, 'turn', 'buyer');
    FT(STATES.SCOPE_CHANGE_REQUESTED, 'REJECT_SCOPE_CHANGE', STATES.AGREEMENT, 'turn', 'buyer');
    FT(STATES.SCOPE_CHANGE_REQUESTED, 'COUNTER_SCOPE_CHANGE', STATES.COUNTER_OFFER, 'turn', null);
    FT(STATES.SCOPE_CHANGE_REQUESTED, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.AGREEMENT, 'REQUEST_SCOPE_CHANGE', STATES.SCOPE_CHANGE_REQUESTED, 'buyer', 'seller');
    FT(STATES.FINAL_AGREEMENT, 'REQUEST_SCOPE_CHANGE', STATES.SCOPE_CHANGE_REQUESTED, 'buyer', 'seller');

    // [COMMERCE 2026-09] Transport — route change transitions (spec §12).
    FT(STATES.OFFER_SENT, 'CHANGE_ROUTE', STATES.ROUTE_CHANGE_REQUESTED, 'turn', null);
    FT(STATES.COUNTER_OFFER, 'CHANGE_ROUTE', STATES.ROUTE_CHANGE_REQUESTED, 'turn', null);
    FT(STATES.ROUTE_CHANGE_REQUESTED, 'ACCEPT_ROUTE_CHANGE', STATES.FINAL_AGREEMENT, 'turn', 'buyer');
    FT(STATES.ROUTE_CHANGE_REQUESTED, 'REJECT_ROUTE_CHANGE', STATES.AGREEMENT, 'turn', 'buyer');
    FT(STATES.ROUTE_CHANGE_REQUESTED, 'COUNTER_ROUTE_CHANGE', STATES.COUNTER_OFFER, 'turn', null);
    FT(STATES.ROUTE_CHANGE_REQUESTED, 'CANCEL_NEGOTIATION', STATES.CANCELLED, 'any', null);
    FT(STATES.AGREEMENT, 'REQUEST_ROUTE_CHANGE', STATES.ROUTE_CHANGE_REQUESTED, 'buyer', 'seller');
    FT(STATES.FINAL_AGREEMENT, 'REQUEST_ROUTE_CHANGE', STATES.ROUTE_CHANGE_REQUESTED, 'buyer', 'seller');
    FT(STATES.AGREEMENT, 'CREATE_BOOKING', STATES.ORDER_CREATED, 'buyer', 'buyer');
    FT(STATES.FINAL_AGREEMENT, 'CREATE_BOOKING', STATES.ORDER_CREATED, 'buyer', 'buyer');

    function buildAgreementLocal(nego, version, nowIsoStr) {
        const qty = nego.quantity || 1;
        const t = typeOf(nego);
        const ag = {
            version: version,
            acceptedProposalVersion: nego.proposalVersion || 0,   // spec §32
            productId: nego.productId || null,
            productTitle: nego.productTitle || '',
            commerceType: t,
            quantity: qty,
            originalUnitPrice: nego.originalUnitPrice,
            unitPrice: nego.currentUnitPrice,
            total: qty * (nego.currentUnitPrice || 0),
            currency: nego.currency || 'TZS',
            buyerId: nego.buyerId,
            sellerId: nego.sellerId,
            negotiationId: nego.negotiationId,
            createdAt: nowIsoStr
        };
        if (t === COMMERCE_TYPES.SERVICE) {
            ag.serviceId = nego.serviceId || null;
            ag.serviceTitle = nego.serviceTitle || '';
            ag.scope = nego.scope || '';
            ag.scopeUnit = nego.scopeUnit || '';
            ag.deadline = nego.deadline || '';
            ag.location = nego.location || '';
            ag.requirements = nego.requirements || '';
        } else if (t === COMMERCE_TYPES.TRANSPORT) {
            ag.transportId = nego.transportId || null;
            ag.transportTitle = nego.transportTitle || '';
            ag.route = nego.route || {};
            ag.packageDescription = nego.packageDescription || '';
            ag.packageQuantity = nego.packageQuantity || '';
            ag.fare = nego.currentUnitPrice != null ? nego.currentUnitPrice : null;
            ag.pickupDate = nego.pickupDate || '';
            ag.pickupTime = nego.pickupTime || '';
            ag.vehicleType = nego.vehicleType || '';
            ag.specialRequirements = nego.specialRequirements || '';
        }
        return ag;
    }

    function buildOrderDocLocal(nego, orderId, nowIsoStr) {
        const qty = nego.quantity || 1;
        const unit = nego.currentUnitPrice || 0;
        const total = qty * unit;
        const t = typeOf(nego);
        // SERVICE + TRANSPORT — oda/booking yenye fields zake (spec §6, §12).
        if (t === COMMERCE_TYPES.SERVICE) {
            return {
                negotiationId: nego.negotiationId,
                conversationId: nego.conversationId || null,
                agreementVersion: nego.agreementVersion || (nego.agreements && nego.agreements.length) || 1,
                agreementSnapshot: (nego.agreements && nego.agreements.length) ? nego.agreements[nego.agreements.length - 1] : null,
                serviceId: nego.serviceId || null,
                itemId: nego.serviceId || null,
                itemTitle: nego.serviceTitle || 'Huduma',
                collectionName: 'services',
                commerceType: 'service',
                kind: 'service_order',
                buyerId: nego.buyerId,
                buyerName: nego.buyerName || nego.buyerId,
                sellerId: nego.sellerId,
                sellerName: nego.sellerName || nego.sellerId,
                scope: nego.scope || '',
                scopeUnit: nego.scopeUnit || '',
                deadline: nego.deadline || '',
                location: nego.location || '',
                requirements: nego.requirements || '',
                quantity: qty,
                unitPrice: unit,
                amount: total,
                currency: nego.currency || 'TZS',
                source: 'negotiation',
                status: 'payment_pending',
                paymentStatus: 'pending',
                // [ORDER FIX] Kabla ya malipo hatujafika 'held' — tracker
                // ionyeshe "Inasubiri Malipo", si hatua ya kazi tayari.
                serviceStatus: 'payment_pending',
                createdAt: nowIsoStr,
                updatedAt: nowIsoStr,
                date: nowIsoStr,
                orderId: orderId
            };
        }
        if (t === COMMERCE_TYPES.TRANSPORT) {
            return {
                negotiationId: nego.negotiationId,
                conversationId: nego.conversationId || null,
                agreementVersion: nego.agreementVersion || (nego.agreements && nego.agreements.length) || 1,
                agreementSnapshot: (nego.agreements && nego.agreements.length) ? nego.agreements[nego.agreements.length - 1] : null,
                transportId: nego.transportId || null,
                itemId: nego.transportId || null,
                itemTitle: nego.transportTitle || 'Usafiri',
                collectionName: 'ride_requests',
                commerceType: 'transport',
                kind: 'booking',
                buyerId: nego.buyerId,
                buyerName: nego.buyerName || nego.buyerId,
                sellerId: nego.sellerId,
                sellerName: nego.sellerName || nego.sellerId,
                route: nego.route || {},
                packageDescription: nego.packageDescription || '',
                packageQuantity: nego.packageQuantity || '',
                fare: unit,
                pickupDate: nego.pickupDate || '',
                pickupTime: nego.pickupTime || '',
                vehicleType: nego.vehicleType || '',
                specialRequirements: nego.specialRequirements || '',
                quantity: qty,
                unitPrice: unit,
                amount: total,
                currency: nego.currency || 'TZS',
                source: 'negotiation',
                status: 'payment_pending',
                paymentStatus: 'pending',
                // [ORDER FIX] Booking haijathibitishwa hadi malipo yafanyike.
                transportStatus: 'payment_pending',
                createdAt: nowIsoStr,
                updatedAt: nowIsoStr,
                date: nowIsoStr,
                orderId: orderId
            };
        }
        // PRODUCT — kama ilivyokuwa (HAIBADILIKI, byte-identical).
        return {
            negotiationId: nego.negotiationId,
            conversationId: nego.conversationId || null,
            agreementVersion: nego.agreementVersion || (nego.agreements && nego.agreements.length) || 1,
            agreementSnapshot: (nego.agreements && nego.agreements.length) ? nego.agreements[nego.agreements.length - 1] : null,
            productId: nego.productId || null,
            itemId: nego.productId || null,
            itemTitle: nego.productTitle || 'Bidhaa',
            collectionName: nego.productCollection || 'products',
            commerceType: nego.commerceType || 'product',
            buyerId: nego.buyerId,
            buyerName: nego.buyerName || nego.buyerId,
            sellerId: nego.sellerId,
            sellerName: nego.sellerName || nego.sellerId,
            quantity: qty,
            unitPrice: unit,
            amount: total,
            currency: nego.currency || 'TZS',
            source: 'negotiation',
            status: 'payment_pending',
            paymentStatus: 'pending',
            createdAt: nowIsoStr,
            updatedAt: nowIsoStr,
            date: nowIsoStr,
            orderId: orderId
        };
    }

    // [COMMERCE 2026-09] TURN + PROPOSAL VERSIONING (spec §21, §32) — client mirror.
    const PROPOSAL_COMMANDS = {
        SEND_OFFER: 1, COUNTER_OFFER: 1, COUNTER_QUANTITY_CHANGE: 1,
        REQUEST_QUANTITY_CHANGE: 1, REQUEST_ADDITIONAL_ITEMS: 1, REQUEST_PRICE_CHANGE: 1,
        CHANGE_SCOPE: 1, COUNTER_SCOPE_CHANGE: 1, REQUEST_SCOPE_CHANGE: 1,
        CHANGE_ROUTE: 1, COUNTER_ROUTE_CHANGE: 1, REQUEST_ROUTE_CHANGE: 1
    };
    function applyTurnModelLocal(nego, patch, uid, myRole, command, nowIsoStr) {
        const turns = (nego.turns || []).map(function (t) { return Object.assign({}, t); });
        if (turns.length) {
            const last = turns[turns.length - 1];
            if (last.status === 'open') { last.status = 'responded'; last.respondedAt = nowIsoStr; }
        }
        const isProposal = !!PROPOSAL_COMMANDS[command];
        const proposalVersion = isProposal ? ((nego.proposalVersion || 0) + 1) : (nego.proposalVersion || 0);
        turns.push({
            turnId: (nego.negotiationId || 'n') + '_t' + (turns.length + 1),
            actorId: uid,
            actorRole: myRole,
            action: command,
            proposalVersion: proposalVersion,
            createdAt: nowIsoStr,
            respondedAt: null,
            status: 'open'
        });
        patch.turns = turns;
        if (isProposal) patch.proposalVersion = proposalVersion;
        return patch;
    }

    // Mioo ya applyCommand ya server (spec §30–§35): membership → role/turn →
    // transition → price/quantity/agreements/history → event + notification.
    // `params.orderPaid` / `params.newOrderId` huletwa na caller (34-chat-core).
    function applyCommandLocally(nego, command, params, actorUid, nowIsoStr) {
        nego = nego || {};
        params = params || {};
        nowIsoStr = nowIsoStr || new Date().toISOString();
        const uid = actorUid;
        const from = nego.currentState || STATES.DRAFT;
        const def = (FULL_TRANSITIONS[from] || {})[command];
        const roleOf = (r) => (r === nego.buyerId ? 'buyer' : (r === nego.sellerId ? 'seller' : null));
        const myRole = roleOf(uid);
        const fail = (msg, code) => ({ ok: false, error: msg, code: code || 'failed-precondition' });

        if (!def) return fail('Kitendo "' + command + '" hakiruhusiwi kwenye hali "' + from + '".');
        if (!myRole) return fail('Huna nafasi kwenye majadiliano haya.', 'permission-denied');
        if (def.actor === 'buyer' && myRole !== 'buyer') return fail('Mnunuzi pekee anaweza kufanya hili.', 'permission-denied');
        if (def.actor === 'seller' && myRole !== 'seller') return fail('Muuzaji pekee anaweza kufanya hili.', 'permission-denied');
        const waitingFor = nego.waitingForUserId || nego.currentActorId || (nego.turn === 'seller' ? nego.sellerId : nego.buyerId);
        if (def.actor === 'turn' && uid !== waitingFor) return fail('Si zamu yako kujibu sasa.', 'permission-denied');
        if (def.actor === 'system' && uid !== 'system') return fail('Amri hii ni ya mfumo tu.', 'permission-denied');

        const prevQty = nego.quantity || 1;
        const prevPrice = nego.currentUnitPrice || 0;
        const newVersion = (nego.version || 0) + 1;
        const patch = { currentState: def.to, version: newVersion, updatedAt: nowIsoStr };
        const opposite = (r) => (r === 'buyer' ? 'seller' : 'buyer');
        const nextTurn = def.turnAfter === null ? ((command === 'COUNTER_OFFER' || command === 'COUNTER_QUANTITY_CHANGE' || command === 'CHANGE_SCOPE' || command === 'CHANGE_ROUTE' || command === 'COUNTER_SCOPE_CHANGE' || command === 'COUNTER_ROUTE_CHANGE') ? opposite(myRole) : (nego.turn || 'buyer')) : def.turnAfter;
        patch.turn = nextTurn;

        let history = [];
        let agreements = nego.agreements || [];
        let notification = null;
        let order = null;       // { id, doc } — CREATE_ORDER
        let adjustment = null;  // { id, doc, orderPatch } — paid-order adjustment

        if (command === 'SEND_OFFER') {
            const qty = Math.max(1, parseInt(params.quantity, 10) || 1);
            const price = Number(params.price);
            if (!(price > 0)) return fail('Bei sahihi inahitajika.', 'invalid-argument');
            patch.quantity = qty; patch.currentUnitPrice = price; patch.currentTotal = qty * price;
            patch.currentProposedBy = 'buyer'; patch.expiresAt = params.expiresAt || null;
            // [COMMERCE 2026-09] Terms za service/transport (hiari kwa product).
            if (params.scope != null) patch.scope = String(params.scope);
            if (params.scopeUnit != null) patch.scopeUnit = String(params.scopeUnit);
            if (params.deadline != null) patch.deadline = String(params.deadline);
            if (params.location != null) patch.location = String(params.location);
            if (params.requirements != null) patch.requirements = String(params.requirements);
            if (params.route && (params.route.from || params.route.to)) patch.route = params.route;
            if (params.pickupDate != null) patch.pickupDate = String(params.pickupDate);
            if (params.pickupTime != null) patch.pickupTime = String(params.pickupTime);
            if (params.vehicleType != null) patch.vehicleType = String(params.vehicleType);
            if (params.packageDescription != null) patch.packageDescription = String(params.packageDescription);
            if (params.packageQuantity != null) patch.packageQuantity = String(params.packageQuantity);
            if (params.specialRequirements != null) patch.specialRequirements = String(params.specialRequirements);
            history.push({ kind: 'offer_sent', actorId: uid, actorRole: 'buyer', price: price, quantity: qty, at: nowIsoStr });
            notification = { to: nego.sellerId, title: 'Ofa Mpya', body: (nego.serviceTitle || nego.transportTitle || nego.productTitle || 'Bidhaa') + ' · TSh ' + price.toLocaleString() };
        } else if (command === 'COUNTER_OFFER' || command === 'COUNTER_QUANTITY_CHANGE') {
            const price = Number(params.price);
            const qty = command === 'COUNTER_QUANTITY_CHANGE'
                ? Math.max(1, parseInt(params.quantity, 10) || (nego.pendingQuantity || nego.quantity || 1))
                : Math.max(1, parseInt(params.quantity, 10) || (nego.quantity || 1));
            if (!(price > 0)) return fail('Bei ya counter inahitajika.', 'invalid-argument');
            patch.quantity = qty; patch.currentUnitPrice = price; patch.currentTotal = qty * price;
            patch.currentProposedBy = myRole; patch.pendingQuantity = null;
            // [COMMERCE 2026-09] Counter inaweza kubeba terms za service/transport.
            if (params.scope != null) patch.scope = String(params.scope);
            if (params.scopeUnit != null) patch.scopeUnit = String(params.scopeUnit);
            if (params.deadline != null) patch.deadline = String(params.deadline);
            if (params.location != null) patch.location = String(params.location);
            if (params.requirements != null) patch.requirements = String(params.requirements);
            if (params.route && (params.route.from || params.route.to)) patch.route = params.route;
            if (params.pickupDate != null) patch.pickupDate = String(params.pickupDate);
            if (params.pickupTime != null) patch.pickupTime = String(params.pickupTime);
            if (params.vehicleType != null) patch.vehicleType = String(params.vehicleType);
            if (params.packageDescription != null) patch.packageDescription = String(params.packageDescription);
            if (params.packageQuantity != null) patch.packageQuantity = String(params.packageQuantity);
            if (params.specialRequirements != null) patch.specialRequirements = String(params.specialRequirements);
            history.push({ kind: 'counter', actorId: uid, actorRole: myRole, price: price, quantity: qty, at: nowIsoStr });
            notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: 'Counter Ofa', body: (nego.serviceTitle || nego.transportTitle || nego.productTitle || 'Bidhaa') + ' · TSh ' + price.toLocaleString() };
        } else if (command === 'REQUEST_QUANTITY_CHANGE' || command === 'REQUEST_ADDITIONAL_ITEMS') {
            const qty = Math.max(1, parseInt(params.quantity, 10) || 0);
            if (!(qty > 0)) return fail('Kiasi sahihi kinahitajika.', 'invalid-argument');
            if (command === 'REQUEST_ADDITIONAL_ITEMS') {
                if (!nego.orderId) return fail('Oda bado haijafungwa.');
                if (!params.orderPaid) return fail('Oda haijalipwa bado.');
            }
            patch.pendingQuantity = qty; patch.pendingUnitPrice = nego.currentUnitPrice || 0;
            history.push({ kind: 'quantity_change', actorId: uid, actorRole: 'buyer', previousQuantity: prevQty, newQuantity: qty, at: nowIsoStr });
            notification = { to: nego.sellerId, title: 'Ombi la Kubadilisha Kiasi', body: (nego.productTitle || 'Bidhaa') + ': ' + prevQty + ' → ' + qty };
        } else if (command === 'ACCEPT_QUANTITY_CHANGE') {
            const qty = Math.max(1, parseInt(nego.pendingQuantity, 10) || prevQty);
            if (nego.orderId && params.orderPaid) {
                // [spec §24–§25] Oda ILIYOLIPWA → ADJUSTMENT, rekodi ya awali haibadiliki.
                const additionalQty = Math.max(1, qty - prevQty);
                const unit = nego.currentUnitPrice || 0;
                const amount = additionalQty * unit;
                const adjId = params.adjustmentId || ('adj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
                adjustment = {
                    id: adjId,
                    doc: {
                        negotiationId: nego.negotiationId, parentOrderId: nego.orderId,
                        productId: nego.productId || null, productTitle: nego.productTitle || '',
                        quantity: additionalQty, unitPrice: unit, amount: amount, currency: nego.currency || 'TZS',
                        status: 'payment_pending', paymentStatus: 'pending',
                        requestedBy: nego.buyerId, approvedBy: uid, createdAt: nowIsoStr
                    },
                    orderAdjustment: { adjustmentId: adjId, productTitle: nego.productTitle || '', quantity: additionalQty, unitPrice: unit, amount: amount, paymentStatus: 'pending', createdAt: nowIsoStr }
                };
                patch.currentState = STATES.ORDER_CREATED;
                patch.turn = 'buyer';
                patch.pendingQuantity = null;
                history.push({ kind: 'adjustment', actorId: uid, actorRole: 'seller', adjustmentId: adjId, quantity: additionalQty, amount: amount, at: nowIsoStr });
                notification = { to: nego.buyerId, title: 'Nyongeza Imeidhinishwa', body: (nego.productTitle || 'Bidhaa') + ' +' + additionalQty + ' · TSh ' + amount.toLocaleString() };
            } else {
                patch.quantity = qty;
                patch.currentTotal = qty * (nego.currentUnitPrice || 0);
                patch.pendingQuantity = null;
                patch.agreementVersion = (agreements.length + 1);
                agreements = agreements.concat([buildAgreementLocal(Object.assign({}, nego, { quantity: qty }), agreements.length + 1, nowIsoStr)]);
                patch.agreements = agreements;
                history.push({ kind: 'agreement', actorId: uid, actorRole: 'seller', agreementVersion: agreements.length, quantity: qty, at: nowIsoStr });
                notification = { to: nego.buyerId, title: 'Makubaliano ya Mwisho', body: (nego.productTitle || 'Bidhaa') + ' × ' + qty + ' · TSh ' + (qty * (nego.currentUnitPrice || 0)).toLocaleString() };
            }
        } else if (command === 'REJECT_QUANTITY_CHANGE') {
            patch.pendingQuantity = null;
            history.push({ kind: 'quantity_rejected', actorId: uid, actorRole: 'seller', at: nowIsoStr });
            notification = { to: nego.buyerId, title: 'Ombi Limekataliwa', body: 'Muuzaji amekataa mabadiliko ya kiasi.' };
        } else if (command === 'ACCEPT_OFFER') {
            const qty = nego.pendingQuantity ? Math.max(1, parseInt(nego.pendingQuantity, 10) || nego.quantity || 1) : (nego.quantity || 1);
            patch.quantity = qty;
            patch.currentTotal = qty * (nego.currentUnitPrice || 0);
            patch.pendingQuantity = null;
            patch.agreementVersion = (agreements.length + 1);
            agreements = agreements.concat([buildAgreementLocal(Object.assign({}, nego, { quantity: qty }), agreements.length + 1, nowIsoStr)]);
            patch.agreements = agreements;
            const isFinal = def.to === STATES.FINAL_AGREEMENT;
            history.push({ kind: 'accepted', actorId: uid, actorRole: myRole, price: nego.currentUnitPrice, quantity: qty, agreementVersion: agreements.length, at: nowIsoStr });
            notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: 'Ofa Imekubaliwa', body: (nego.productTitle || 'Bidhaa') + ' · TSh ' + Number(nego.currentUnitPrice || 0).toLocaleString() + (isFinal ? ' (Makubaliano ya Mwisho)' : '') };
        } else if (command === 'REJECT_OFFER') {
            if (from === STATES.RE_NEGOTIATION) { patch.currentState = STATES.AGREEMENT; patch.turn = 'buyer'; patch.pendingQuantity = null; }
            history.push({ kind: 'rejected', actorId: uid, actorRole: myRole, at: nowIsoStr });
            notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: 'Ofa Imekataliwa', body: 'Ofa imekataliwa.' };
        } else if (command === 'REQUEST_PRICE_CHANGE') {
            history.push({ kind: 'price_change_request', actorId: uid, actorRole: 'buyer', at: nowIsoStr });
            notification = { to: nego.sellerId, title: 'Ombi la Kubadilisha Bei', body: (nego.productTitle || 'Bidhaa') + ' — mnunuzi anataka bei nyingine.' };
        } else if (command === 'CREATE_ORDER' || command === 'CREATE_BOOKING') {
            const orderId = params.newOrderId || ('ord_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
            order = { id: orderId, doc: buildOrderDocLocal(nego, orderId, nowIsoStr) };
            patch.orderId = orderId;
            history.push({ kind: 'order_created', actorId: uid, actorRole: 'buyer', orderId: orderId, at: nowIsoStr });
            if (command === 'CREATE_BOOKING') {
                notification = { to: nego.sellerId, title: 'Booking Imefungwa', body: 'Booking #' + orderId + ' · ' + (nego.transportTitle || 'Usafiri') };
            } else {
                notification = { to: nego.sellerId, title: 'Oda Imefungwa', body: 'Oda #' + orderId + ' · ' + (nego.serviceTitle || nego.productTitle || 'Bidhaa') + ' · TSh ' + ((nego.quantity || 1) * (nego.currentUnitPrice || 0)).toLocaleString() };
            }
        } else if (command === 'CHANGE_SCOPE') {
            // Mtoa huduma (au mteja) anapendekeza scope/deadline tofauti (spec §8).
            if (params.scope == null && params.deadline == null && !(params.price > 0)) return fail('Scope, deadline au bei inahitajika.', 'invalid-argument');
            if (params.scope != null) patch.pendingScope = String(params.scope);
            if (params.scopeUnit != null) patch.pendingScopeUnit = String(params.scopeUnit);
            if (params.deadline != null) patch.pendingDeadline = String(params.deadline);
            if (params.location != null) patch.pendingLocation = String(params.location);
            if (params.requirements != null) patch.pendingRequirements = String(params.requirements);
            if (params.price > 0) patch.pendingUnitPrice = Number(params.price);
            history.push({ kind: 'scope_change', actorId: uid, actorRole: myRole, scope: params.scope, deadline: params.deadline, price: params.price, at: nowIsoStr });
            notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: 'Ombi la Kubadilisha Scope', body: (nego.serviceTitle || 'Huduma') + (params.scope ? ' · ' + params.scope : '') };
        } else if (command === 'REQUEST_SCOPE_CHANGE') {
            if (params.scope == null && params.deadline == null) return fail('Scope au deadline inahitajika.', 'invalid-argument');
            if (params.scope != null) patch.pendingScope = String(params.scope);
            if (params.deadline != null) patch.pendingDeadline = String(params.deadline);
            history.push({ kind: 'scope_change', actorId: uid, actorRole: 'buyer', scope: params.scope, deadline: params.deadline, at: nowIsoStr });
            notification = { to: nego.sellerId, title: 'Ombi la Kubadilisha Scope', body: (nego.serviceTitle || 'Huduma') + (params.scope ? ' · ' + params.scope : '') };
        } else if (command === 'ACCEPT_SCOPE_CHANGE') {
            if (nego.pendingScope != null) patch.scope = nego.pendingScope;
            if (nego.pendingScopeUnit != null) patch.scopeUnit = nego.pendingScopeUnit;
            if (nego.pendingDeadline != null) patch.deadline = nego.pendingDeadline;
            if (nego.pendingLocation != null) patch.location = nego.pendingLocation;
            if (nego.pendingRequirements != null) patch.requirements = nego.pendingRequirements;
            if (nego.pendingUnitPrice > 0) { patch.currentUnitPrice = nego.pendingUnitPrice; patch.currentTotal = (nego.quantity || 1) * nego.pendingUnitPrice; }
            patch.pendingScope = null; patch.pendingScopeUnit = null; patch.pendingDeadline = null; patch.pendingLocation = null; patch.pendingRequirements = null; patch.pendingUnitPrice = null;
            patch.agreementVersion = (agreements.length + 1);
            agreements = agreements.concat([buildAgreementLocal(Object.assign({}, nego, {
                scope: patch.scope != null ? patch.scope : nego.scope,
                deadline: patch.deadline != null ? patch.deadline : nego.deadline,
                currentUnitPrice: patch.currentUnitPrice != null ? patch.currentUnitPrice : nego.currentUnitPrice
            }), agreements.length + 1, nowIsoStr)]);
            patch.agreements = agreements;
            history.push({ kind: 'agreement', actorId: uid, actorRole: 'seller', agreementVersion: agreements.length, scope: patch.scope, at: nowIsoStr });
            notification = { to: nego.buyerId, title: 'Scope Imekubaliwa', body: (nego.serviceTitle || 'Huduma') + ' · Makubaliano ya mwisho' };
        } else if (command === 'REJECT_SCOPE_CHANGE') {
            patch.pendingScope = null; patch.pendingScopeUnit = null; patch.pendingDeadline = null; patch.pendingLocation = null; patch.pendingRequirements = null; patch.pendingUnitPrice = null;
            history.push({ kind: 'scope_rejected', actorId: uid, actorRole: 'seller', at: nowIsoStr });
            notification = { to: nego.buyerId, title: 'Scope Imekataliwa', body: 'Mtoa huduma amekataa mabadiliko ya scope.' };
        } else if (command === 'COUNTER_SCOPE_CHANGE') {
            const price = Number(params.price);
            if (!(price > 0)) return fail('Bei ya counter inahitajika.', 'invalid-argument');
            patch.scope = params.scope != null ? String(params.scope) : (nego.pendingScope || nego.scope || '');
            if (params.scopeUnit != null) patch.scopeUnit = String(params.scopeUnit);
            if (params.deadline != null) patch.deadline = String(params.deadline);
            patch.currentUnitPrice = price; patch.currentTotal = (nego.quantity || 1) * price;
            patch.currentProposedBy = myRole;
            patch.pendingScope = null; patch.pendingScopeUnit = null; patch.pendingDeadline = null; patch.pendingLocation = null; patch.pendingRequirements = null; patch.pendingUnitPrice = null;
            history.push({ kind: 'counter', actorId: uid, actorRole: myRole, price: price, scope: patch.scope, at: nowIsoStr });
            notification = { to: nego.buyerId, title: 'Counter Scope', body: (nego.serviceTitle || 'Huduma') + ' · TSh ' + price.toLocaleString() };
        } else if (command === 'CHANGE_ROUTE' || command === 'REQUEST_ROUTE_CHANGE') {
            // Mtoa usafiri (au mteja) anapendekeza njia/details tofauti (spec §12).
            const route = params.route || {};
            if (!route.from && !route.to && params.pickupDate == null && params.pickupTime == null && params.vehicleType == null && params.packageDescription == null && !(params.price > 0)) {
                return fail('Maelezo ya njia yanahitajika.', 'invalid-argument');
            }
            if (route.from || route.to) {
                const cur = nego.route || {};
                patch.pendingRoute = { from: route.from || cur.from || '', to: route.to || cur.to || '' };
            }
            if (params.pickupDate != null) patch.pendingPickupDate = String(params.pickupDate);
            if (params.pickupTime != null) patch.pendingPickupTime = String(params.pickupTime);
            if (params.vehicleType != null) patch.pendingVehicleType = String(params.vehicleType);
            if (params.packageDescription != null) patch.pendingPackageDescription = String(params.packageDescription);
            if (params.price > 0) patch.pendingUnitPrice = Number(params.price);
            history.push({ kind: 'route_change', actorId: uid, actorRole: myRole, route: route, at: nowIsoStr });
            notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: 'Ombi la Kubadilisha Njia', body: (nego.transportTitle || 'Usafiri') + (route.from && route.to ? ' · ' + route.from + ' → ' + route.to : '') };
        } else if (command === 'ACCEPT_ROUTE_CHANGE') {
            if (nego.pendingRoute) patch.route = nego.pendingRoute;
            if (nego.pendingPickupDate != null) patch.pickupDate = nego.pendingPickupDate;
            if (nego.pendingPickupTime != null) patch.pickupTime = nego.pendingPickupTime;
            if (nego.pendingVehicleType != null) patch.vehicleType = nego.pendingVehicleType;
            if (nego.pendingPackageDescription != null) patch.packageDescription = nego.pendingPackageDescription;
            if (nego.pendingUnitPrice > 0) { patch.currentUnitPrice = nego.pendingUnitPrice; patch.currentTotal = (nego.quantity || 1) * nego.pendingUnitPrice; }
            patch.pendingRoute = null; patch.pendingPickupDate = null; patch.pendingPickupTime = null; patch.pendingVehicleType = null; patch.pendingPackageDescription = null; patch.pendingUnitPrice = null;
            patch.agreementVersion = (agreements.length + 1);
            agreements = agreements.concat([buildAgreementLocal(Object.assign({}, nego, {
                route: patch.route || nego.route,
                currentUnitPrice: patch.currentUnitPrice != null ? patch.currentUnitPrice : nego.currentUnitPrice
            }), agreements.length + 1, nowIsoStr)]);
            patch.agreements = agreements;
            history.push({ kind: 'agreement', actorId: uid, actorRole: 'seller', agreementVersion: agreements.length, route: patch.route, at: nowIsoStr });
            notification = { to: nego.buyerId, title: 'Njia Imekubaliwa', body: (nego.transportTitle || 'Usafiri') + ' · Makubaliano ya mwisho' };
        } else if (command === 'REJECT_ROUTE_CHANGE') {
            patch.pendingRoute = null; patch.pendingPickupDate = null; patch.pendingPickupTime = null; patch.pendingVehicleType = null; patch.pendingPackageDescription = null; patch.pendingUnitPrice = null;
            history.push({ kind: 'route_rejected', actorId: uid, actorRole: 'seller', at: nowIsoStr });
            notification = { to: nego.buyerId, title: 'Njia Imekataliwa', body: 'Mtoa usafiri amekataa mabadiliko ya njia.' };
        } else if (command === 'COUNTER_ROUTE_CHANGE') {
            const price = Number(params.price);
            if (!(price > 0)) return fail('Nauli ya counter inahitajika.', 'invalid-argument');
            const route = params.route || {};
            if (route.from || route.to) {
                const cur = (nego.pendingRoute || nego.route) || {};
                patch.route = { from: route.from || cur.from || '', to: route.to || cur.to || '' };
            }
            patch.currentUnitPrice = price; patch.currentTotal = (nego.quantity || 1) * price;
            patch.currentProposedBy = myRole;
            patch.pendingRoute = null; patch.pendingPickupDate = null; patch.pendingPickupTime = null; patch.pendingVehicleType = null; patch.pendingPackageDescription = null; patch.pendingUnitPrice = null;
            history.push({ kind: 'counter', actorId: uid, actorRole: myRole, price: price, route: patch.route, at: nowIsoStr });
            notification = { to: nego.buyerId, title: 'Counter Njia', body: (nego.transportTitle || 'Usafiri') + ' · TSh ' + price.toLocaleString() };
        } else if (command === 'CANCEL_NEGOTIATION') {
            history.push({ kind: 'cancelled', actorId: uid, actorRole: myRole, at: nowIsoStr });
            notification = { to: (myRole === 'seller' ? nego.buyerId : nego.sellerId), title: 'Majadiliano Yamefutwa', body: 'Majadiliano yamefutwa na ' + myRole + '.' };
        } else if (command === 'EXPIRE_NEGOTIATION') {
            history.push({ kind: 'expired', actorId: 'system', actorRole: 'system', at: nowIsoStr });
        }

        // [COMMERCE 2026-09] Actor model (spec §4/§6/§21–§22) — preview ya client
        // inaakisi server: WHO must act next, kwa USER ID (sio role label pekee).
        const finalTurn = (patch.turn != null) ? patch.turn : (nego.turn || 'buyer');
        const nextActorId = (finalTurn === 'buyer' ? nego.buyerId : nego.sellerId);
        patch.currentActorId = nextActorId;
        patch.waitingForUserId = nextActorId;
        patch.lastActorId = uid;
        patch.lastActorRole = myRole || null;
        patch.initiatorId = nego.initiatorId || nego.buyerId;

        // [COMMERCE 2026-09] Turn + proposal versioning (spec §21/§32).
        applyTurnModelLocal(nego, patch, uid, myRole, command, nowIsoStr);

        if (history.length) patch.history = (nego.history || []).concat(history);
        const event = {
            negotiationId: nego.negotiationId, actorId: uid, actorRole: myRole, command: command,
            previousState: from, newState: patch.currentState,
            previousQuantity: prevQty, newQuantity: (patch.quantity != null ? patch.quantity : prevQty),
            previousPrice: prevPrice, newPrice: (patch.currentUnitPrice != null ? patch.currentUnitPrice : prevPrice),
            commandId: params.commandId || '', version: newVersion
        };
        return { ok: true, status: patch.currentState, patch: patch, event: event, notification: notification, order: order, adjustment: adjustment, negotiationId: nego.negotiationId };
    }

    /* [REMINDER §35] Ukumbusho wa kiotomatiki (spec §35) — domain-agnostic.
     * Mhusika anayesubiriwa (`waitingForUserId`) anakumbushwa kujibu iwapo
     * majadiliano yamekaa bila hatua. Idempotent kupitia `lastReminderAt`
     * (kumbusho moja tu kwa kila dirisha). */
    const REMINDER_WINDOW_HOURS = 24;
    function reminderWaitingStates() {
        return [STATES.OFFER_SENT, STATES.COUNTER_OFFER, STATES.RE_NEGOTIATION, STATES.CHANGE_REQUESTED,
            STATES.SCOPE_CHANGE_REQUESTED, STATES.ROUTE_CHANGE_REQUESTED, STATES.DRAFT];
    }
    function reminderEligible(nego) {
        if (!nego || !nego.waitingForUserId) return false;
        return reminderWaitingStates().indexOf(nego.currentState) !== -1;
    }
    function reminderWindowMs(nego) {
        const h = parseFloat(nego && nego.remindAfterHours);
        return (h > 0 ? h : REMINDER_WINDOW_HOURS) * 3600000;
    }
    function reminderDue(nego, nowIso) {
        if (!reminderEligible(nego)) return false;
        const win = reminderWindowMs(nego);
        const base = nego.updatedAt || nego.createdAt || '';
        const updated = base ? Date.parse(base) : 0;
        const last = nego.lastReminderAt ? Date.parse(nego.lastReminderAt) : 0;
        const now = (nowIso ? Date.parse(nowIso) : Date.now()) || Date.now();
        if (!(updated > 0) || isNaN(updated)) return false;
        if (now - updated < win) return false;
        if (last > 0 && (now - last) < win) return false;
        return true;
    }
    function reminderLines(nego) {
        const title = commerceTitleOf(nego);
        const terms = commerceTermsLines(nego);
        return '' + title + (terms.length ? ' — ' + terms.join(' · ') : '') + '. Una zamu ya kujibu.';
    }

    /* ============================================================
     * 6) API ya injini — ikae kama `window.skhNego`.
     * ============================================================ */
    const nego = {
        STATES: STATES,
        COMMANDS: COMMANDS,
        TRANSITIONS: TRANSITIONS,
        LABELS: LABELS,
        STATE_LABELS: STATE_LABELS,
        ORDER_STATUS_LABELS: ORDER_STATUS_LABELS,
        ORDER_PIPELINE: ORDER_PIPELINE,
        COMMERCE_TYPES: COMMERCE_TYPES,
        TYPE_CONFIG: TYPE_CONFIG,
        SERVICE_STATUS_LABELS: SERVICE_STATUS_LABELS,
        SERVICE_PIPELINE: SERVICE_PIPELINE,
        TRANSPORT_STATUS_LABELS: TRANSPORT_STATUS_LABELS,
        TRANSPORT_PIPELINE: TRANSPORT_PIPELINE,
        typeOf: typeOf,
        configOf: configOf,
        commerceContextOf: commerceContextOf,
        commerceTitleOf: commerceTitleOf,
        commerceTermsOf: commerceTermsOf,
        commerceTermsLines: commerceTermsLines,
        pendingChangeHtml: pendingChangeHtml,
        commerceTermParts: commerceTermParts,
        commerceTermsHtml: commerceTermsHtml,
        commerceOrderStage: commerceOrderStage,
        isTerminal: function (s) { return !!TERMINAL[s]; },
        canTransition: function (from, cmd) { return !!(TRANSITIONS[from] || {})[cmd]; },
        resolve: resolveActions,
        resolveProduct: resolveProductActions,
        resolveService: resolveServiceActions,
        resolveTransport: resolveTransportActions,
        buildButtons: buildButtons,
        historyLines: historyLines,
        detectIntent: detectIntent,
        detectProductIntent: detectProductIntent,
        detectServiceIntent: detectServiceIntent,
        detectTransportIntent: detectTransportIntent,
        orderStage: orderStage,
        orderTrackerHtml: orderTrackerHtml,
        getAvailableOrderActions: getAvailableOrderActions,
        getProductOrderActions: getProductOrderActions,
        getServiceOrderActions: getServiceOrderActions,
        getTransportOrderActions: getTransportOrderActions,
        applyCommandLocally: applyCommandLocally,
        applyOrderCommandLocally: applyOrderCommandLocally,
        orderIsPaid: orderIsPaid,
        orderStageField: orderStageField,
        FULL_TRANSITIONS: FULL_TRANSITIONS,
        buildAgreementLocal: buildAgreementLocal,
        buildOrderDocLocal: buildOrderDocLocal,
        REMINDER_WINDOW_HOURS: REMINDER_WINDOW_HOURS,
        reminderEligible: reminderEligible,
        reminderDue: reminderDue,
        reminderLines: reminderLines,
        fmt: function (n) { return Number(n || 0).toLocaleString(); }
    };

    window.skhNego = nego;
    skh.nego = nego;

    // Vifupisho kwa onclick (bila kujenga HTML kwa mkono kila mahali).
    window.skhNegoResolve = resolveActions;
    window.skhNegoBuildButtons = buildButtons;
    window.skhNegoDetectIntent = detectIntent;
    window.skhNegoGetOrderActions = getAvailableOrderActions;
    window.skhNegoOrderTracker = orderTrackerHtml;
    // [COMMERCE 2026-09] Vifupisho vya CommerceContext/Terms.
    window.skhNegoTypeOf = typeOf;
    window.skhNegoContext = commerceContextOf;
    window.skhNegoTitleOf = commerceTitleOf;
    window.skhNegoTermsLines = commerceTermsLines;
    window.skhNegoConfig = configOf;
    // [REMINDER §35] Vifupisho vya ukumbusho.
    window.skhNegoReminderDue = reminderDue;
    window.skhNegoReminderLines = reminderLines;

    if (typeof window.skhNegoReady === 'function') { try { window.skhNegoReady(nego); } catch (e) {} }
})();

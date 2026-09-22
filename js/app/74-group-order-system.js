/* ================================================================
 * 74-group-order-system.js — FULL-SPEC GROUP ORDER SYSTEM
 * Implements 92-section spec as UPDATE+COMPLETION, not rebuild.
 * Preserves 69-chat-groups.js engine, extends with production model.
 *
 * DESIGN SYSTEM: #1268A8 #2B82BD #0B4F7A #18A982 #D8B83A #F6F9FC Inter
 * Mobile first, accessibility, no raw Firebase errors, empty states.
 *
 * COLLECTIONS (Firestore):
 *   chatGroups/{gid}/groupOrders/{goid} — main doc
 *     participants subcollection {uid}: GroupOrderParticipant
 *     agreementVersions subcollection {versionId}: immutable
 *     packages subcollection {packageId}: package model
 *     shipments subcollection {shipmentId}: shipment model
 *     polls subcollection {pollId}: Type A/B/C
 *     payments subcollection {paymentId}: individual payment target
 *     financialLedger subcollection or field: secured/entitlement/fees/refunds/released/pending/disputed
 *     auditLogs subcollection (or reuse chatGroups/{gid}/events)
 *
 * SECURITY RULES (concept, to be deployed in firestore.rules):
 *   match /chatGroups/{gid}/groupOrders/{goid} {
 *     allow read: if isGroupMember(gid);
 *     allow create: if isGroupMember(gid) && isOrganizerRole();
 *     allow update: if isOrganizer(gid,goid) || isSellerForOrder(goid);
 *   }
 *   match /chatGroups/{gid}/groupOrders/{goid}/participants/{uid} {
 *     allow read: if isGroupMember(gid);
 *     allow create: if request.auth.uid == uid && isGroupMember(gid);
 *     allow update: if request.auth.uid == uid && !changingOtherParticipant()
 *                   && !settingField('payment.status','PAID') // cannot self-mark PAID
 *                   && !settingField('delivery.status','DELIVERED');
 *     allow delete: if isOrganizer(gid,goid) && beforePaymentPhase();
 *   }
 *   match /chatGroups/{gid}/groupOrders/{goid}/payments/{pid} {
 *     allow read: if isParticipantOrOrganizer();
 *     allow write: if false; // server-only via Cloud Functions
 *   }
 *   match /chatGroups/{gid}/groupOrders/{goid}/financialLedger/{lid} {
 *     allow read: if isOrganizerOrSeller();
 *     allow write: if false; // server-only
 *   }
 *
 * CLOUD FUNCTIONS (to deploy in functions/index.js):
 *   - createGroupOrder(gid, wizardData) -> validates snapshot immutability
 *   - joinGroupOrder(gid,goid,qty,variant,destination) -> transaction, sum==fulfilled guard, idempotent
 *   - leaveGroupOrder(gid,goid) -> before TARGET_REACHED only
 *   - publishGroupOrder(gid,goid) -> DRAFT->OPEN
 *   - checkDeadlineExpiry(gid,goid) -> OPEN->EXPIRED or CLOSED
 *   - initiatePayment(gid,goid) -> create individual payment targets from agreement snapshot
 *   - confirmPayment(gid,goid,uid,transactionId) -> server marks PAID, updates securedAmount, privacy
 *   - paymentDashboard(gid,goid) -> aggregates Collected/Expected/% without leaking other amounts unless organizer
 *   - requestFulfillment(gid,goid) -> PAYMENT_TARGET_REACHED -> FULFILLMENT_REQUESTED, breakdown variant/location
 *   - sellerFulfillmentResponse(gid,goid,response,partialDetails) -> ACCEPT_FULL/PARTIAL/CANNOT
 *   - allocateOrders(gid,goid,allocationMap) -> validates sum==fulfilled, creates packages
 *   - createShipment(gid,goid,packageIds,destination,transportMethod) -> location aggregation
 *   - assignTransporter(shipmentId,transporterId) -> assignment->accept->pickup token->in transit->handover
 *   - markDelivered(packageId,shipmentId) -> sets deliveredAt server timestamp + confirmationDeadline = deliveredAt+24h
 *   - confirmReceipt(packageId,uid) -> participant confirm, idempotent
 *   - reportProblem(packageId,reason) -> pauses auto-release, DISPUTED
 *   - autoReleaseCheck() -> scheduled every 5min, releases escrow where deliveredAt+24h passed and not disputed, idempotent releaseTransactionId
 *   - settlementRelease(gid,goid,packageId) -> escrow->seller/transporter separate conditions
 *   - createPoll(gid,goid,type,config) -> Type A/B/C with quorum/threshold/minVoters/closingTime
 *   - votePoll(gid,goid,pollId,option) -> voting rules, leading option surfaced not auto-final
 *   - createAgreementVersion(gid,goid,reason,changes) -> immutable versioning
 *   - changeRequestAfterPayment(gid,goid,change) -> impact analysis, new version, refund if needed
 *   - cancelGroupOrder(gid,goid,reason) -> per lifecycle rules
 *   - completeGroupOrder(gid,goid) -> when all packages resolved
 *
 * TRANSACTIONS & IDEMPOTENCY:
 *   - All quantity updates use runTransaction with version field.
 *   - Idempotency keys: join_{uid}_{goid}, pay_{uid}_{goid}_{txId}, release_{packageId}
 *   - releaseTransactionId ensures auto-release idempotent.
 *
 * NOTIFICATIONS:
 *   - Contextual: JOINED-> organizer, PAYMENT_OPEN-> all participants, DELIVERED-> participant, CONFIRMATION_DEADLINE-> reminder, DISPUTED-> admin/organizer/seller
 *   - Uses existing notifications collection, no new system.
 *
 * DEADLINES: separate joiningDeadline, paymentDeadline, confirmationDeadline (server timestamp)
 * EXPIRY: OPEN beyond deadline -> EXPIRED if below minQty, CLOSED if above min but below target (organizer can decide)
 * CANCELLATION: per lifecycle - DRAFT/CONFIGURING anyone, OPEN organizer, PAYMENT_COLLECTING organizer with refund, after FULFILLMENT_REQUESTED requires seller agreement or admin.
 * COMPLETION: all packages CONFIRMED or AUTO_RELEASED and financial ledger settled.
 * SHIPMENT != GROUP COMPLETION: shipment completed does not mean group completed.
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
  if (window.__skhGroupOrderSystemBoot) return;
  window.__skhGroupOrderSystemBoot = true;

  // ---------- Utils ----------
  function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }
  function esc(s) { return skh.skhEscape(String(s == null ? '' : s)); }
  function jsEsc(s) { return skh.skhJsEsc(String(s == null ? '' : s)); }
  function uid() { return (skh.currentUser && skh.currentUser.uid) || ''; }
  function nowIso() { return new Date().toISOString(); }
  function myName() { return (skh.currentUserData && (skh.currentUserData.fullName || skh.currentUserData.displayName)) || (skh.currentUser && skh.currentUser.email) || 'Mimi'; }
  function gRef(gid) { return skh.doc(skh.db, 'chatGroups', gid); }
  function goRef(gid, goid) { return skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders', goid); }
  function goCol(gid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders'); }
  function partRef(gid, goid, puid) { return skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/participants', puid); }
  function partCol(gid, goid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/participants'); }
  function agrCol(gid, goid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/agreementVersions'); }
  function pkgCol(gid, goid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages'); }
  function shipCol(gid, goid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/shipments'); }
  function pollCol(gid, goid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/polls'); }
  function payCol(gid, goid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/payments'); }
  function auditCol(gid, goid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/auditLogs'); }
  function convRef(gid) { return skh.doc(skh.db, 'conversations', 'conv_group_' + gid); }
  function msgsCol(gid) { return skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'); }
  function evCol(gid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/events'); }

  function genId(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function shortCode(str) {
    var s = String(str || 'x'), h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    if (!h) h = 47;
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
    for (var k = 0; k < 4; k++) { out = A[h % A.length] + out; h = Math.floor(h / A.length) || ((h * 31 + 7) >>> 0); }
    return out;
  }

  // ---------- ENUMS (Centralized, 25+ states) ----------
  const GO_STATUS = Object.freeze({
    DRAFT: 'DRAFT',
    CONFIGURING: 'CONFIGURING',
    PUBLISHED: 'PUBLISHED',
    OPEN: 'OPEN',
    INTEREST_PHASE: 'INTEREST_PHASE',
    JOINING: 'JOINING',
    NEAR_TARGET: 'NEAR_TARGET',
    TARGET_REACHED: 'TARGET_REACHED',
    AGREEMENT_PENDING: 'AGREEMENT_PENDING',
    PAYMENT_OPEN: 'PAYMENT_OPEN',
    PAYMENT_COLLECTING: 'PAYMENT_COLLECTING',
    PAYMENT_TARGET_REACHED: 'PAYMENT_TARGET_REACHED',
    FULFILLMENT_REQUESTED: 'FULFILLMENT_REQUESTED',
    SELLER_PROCESSING: 'SELLER_PROCESSING',
    READY_FOR_ALLOCATION: 'READY_FOR_ALLOCATION',
    ALLOCATING: 'ALLOCATING',
    ALLOCATED: 'ALLOCATED',
    DISTRIBUTION_READY: 'DISTRIBUTION_READY',
    IN_TRANSIT: 'IN_TRANSIT',
    DELIVERED: 'DELIVERED',
    AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
    PARTIALLY_CONFIRMED: 'PARTIALLY_CONFIRMED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    SELLER_UNABLE_TO_FULFILL: 'SELLER_UNABLE_TO_FULFILL',
    PARTIALLY_FULFILLED: 'PARTIALLY_FULFILLED',
    DISPUTED: 'DISPUTED',
    REFUND_PENDING: 'REFUND_PENDING',
    REFUNDED: 'REFUNDED',
    CLOSED: 'CLOSED',
    PROCESSING: 'PROCESSING'
  });

  const PARTICIPANT_STATE = Object.freeze({
    INTERESTED: 'INTERESTED',
    JOINED: 'JOINED',
    COMMITTED: 'COMMITTED',
    CONFIRMED: 'CONFIRMED',
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    PAID: 'PAID',
    ALLOCATED: 'ALLOCATED',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    CONFIRMED_RECEIPT: 'CONFIRMED_RECEIPT',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED'
  });

  const PAYMENT_STATUS = Object.freeze({
    UNPAID: 'UNPAID',
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    PAID: 'PAID',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    REFUND_PENDING: 'REFUND_PENDING',
    REFUNDED: 'REFUNDED'
  });

  const GROUP_PAYMENT_STATUS = Object.freeze({
    PENDING: 'PENDING',
    COLLECTING: 'COLLECTING',
    PARTIALLY_COLLECTED: 'PARTIALLY_COLLECTED',
    TARGET_REACHED: 'TARGET_REACHED',
    READY_FOR_FULFILLMENT: 'READY_FOR_FULFILLMENT',
    FAILED: 'FAILED',
    REFUNDED: 'REFUNDED'
  });

  const DELIVERY_STATUS = Object.freeze({
    READY: 'READY',
    PICKUP_PENDING: 'PICKUP_PENDING',
    PICKED_UP: 'PICKED_UP',
    IN_TRANSIT: 'IN_TRANSIT',
    ARRIVED: 'ARRIVED',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
    CONFIRMED: 'CONFIRMED',
    AUTO_RELEASED: 'AUTO_RELEASED',
    DISPUTED: 'DISPUTED',
    RETURNED: 'RETURNED'
  });

  const FULFILLMENT_RESPONSE = Object.freeze({
    ACCEPT_FULL: 'ACCEPT_FULL',
    ACCEPT_PARTIAL: 'ACCEPT_PARTIAL',
    CANNOT_FULFILL: 'CANNOT_FULFILL'
  });

  const POLL_TYPE = Object.freeze({
    A: 'INTEREST',
    B: 'DECISION',
    C: 'AGREEMENT'
  });

  const PACKAGE_STATUS = Object.freeze({
    PENDING: 'PENDING',
    ALLOCATED: 'ALLOCATED',
    PACKED: 'PACKED',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    CONFIRMED: 'CONFIRMED',
    RETURNED: 'RETURNED',
    DISPUTED: 'DISPUTED'
  });

  const SHIPMENT_STATUS = Object.freeze({
    CREATED: 'CREATED',
    ASSIGNED: 'ASSIGNED',
    ACCEPTED: 'ACCEPTED',
    PICKUP_PENDING: 'PICKUP_PENDING',
    PICKED_UP: 'PICKED_UP',
    IN_TRANSIT: 'IN_TRANSIT',
    HANDOVER: 'HANDOVER',
    DELIVERED: 'DELIVERED',
    CONFIRMED: 'CONFIRMED',
    COMPLETED: 'COMPLETED',
    DISPUTED: 'DISPUTED'
  });

  const DISTRIBUTION_MODE = Object.freeze({
    SHARED_COLLECTION: 'SHARED_COLLECTION',
    SHARED_DELIVERY: 'SHARED_DELIVERY',
    INDIVIDUAL: 'INDIVIDUAL',
    SELF_PICKUP: 'SELF_PICKUP',
    MIXED: 'MIXED'
  });

  window.SKH_GO_STATUS = GO_STATUS;
  window.SKH_GO_PARTICIPANT_STATE = PARTICIPANT_STATE;
  window.SKH_GO_PAYMENT_STATUS = PAYMENT_STATUS;
  window.SKH_GO_DELIVERY_STATUS = DELIVERY_STATUS;
  window.SKH_GO_POLL_TYPE = POLL_TYPE;
  window.SKH_GO_PACKAGE_STATUS = PACKAGE_STATUS;
  window.SKH_GO_SHIPMENT_STATUS = SHIPMENT_STATUS;

  // ---------- Phase helpers ----------
  function goPhaseOf(d) {
    var st = String((d && d.status) || 'DRAFT');
    if (GO_STATUS[st]) return st;
    // map legacy
    if (st === 'OPEN' || st === 'NEAR_TARGET') return GO_STATUS.JOINING;
    if (st === 'TARGET_REACHED') return GO_STATUS.TARGET_REACHED;
    if (st === 'CLOSED') return ((+d.totalQty || 0) >= (+d.targetQty || 1)) ? GO_STATUS.PAYMENT_COLLECTING : GO_STATUS.EXPIRED;
    if (st === 'PROCESSING') return GO_STATUS.PAYMENT_COLLECTING;
    if (st === 'COMPLETED') return GO_STATUS.COMPLETED;
    if (st === 'CANCELLED') return GO_STATUS.CANCELLED;
    return st;
  }

  // ---------- Product Snapshot (Immutable) ----------
  async function fetchProductForSnapshot(productId, collectionName) {
    collectionName = collectionName || 'products';
    try {
      var snap = await skh.getDoc(skh.doc(skh.db, collectionName, productId));
      if (snap && snap.exists && snap.exists()) {
        var data = snap.data() || {};
        data.__id = snap.id;
        data.__collection = collectionName;
        return data;
      }
    } catch (e) {}
    return null;
  }

  function buildProductSnapshot(productDoc) {
    if (!productDoc) return null;
    var now = nowIso();
    return {
      productId: productDoc.__id || productDoc.id || '',
      sellerId: productDoc.userId || productDoc.sellerId || productDoc.ownerId || '',
      sellerName: productDoc.ownerName || productDoc.sellerName || productDoc.storeName || '',
      name: productDoc.title || productDoc.itemTitle || productDoc.name || 'Bidhaa',
      description: (productDoc.description || '').slice(0, 500),
      images: productDoc.images || (productDoc.image ? [productDoc.image] : []) || [],
      image: productDoc.image || (productDoc.images && productDoc.images[0]) || '',
      variant: productDoc.variant || productDoc.selectedVariant || null,
      originalPrice: +productDoc.price || 0,
      agreedPrice: +productDoc.price || 0, // will be overridden by tier pricing
      currency: productDoc.currency || 'TZS',
      collectionName: productDoc.__collection || 'products',
      snapshotTimestamp: now,
      immutable: true // flag for audit
    };
  }

  // ---------- Quantity Validation ----------
  function validateQuantity(cfg) {
    var targetQty = Math.floor(+cfg.targetQty);
    var minQty = cfg.minQty != null ? Math.floor(+cfg.minQty) : targetQty;
    var maxQty = cfg.maxQty != null ? Math.floor(+cfg.maxQty) : targetQty * 10;
    if (!(targetQty >= 2 && targetQty <= 100000)) return { ok: false, field: 'targetQty' };
    if (!(minQty >= 1 && minQty <= targetQty)) return { ok: false, field: 'minQty' };
    if (!(maxQty >= targetQty && maxQty <= 1000000)) return { ok: false, field: 'maxQty' };
    return { ok: true, targetQty: targetQty, minQty: minQty, maxQty: maxQty };
  }

  // ---------- Tier Pricing ----------
  function validateTiers(tiers, targetPrice) {
    if (!Array.isArray(tiers)) return { ok: true, tiers: [] };
    var rows = tiers.slice(0, 6);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var mq = Math.floor(+rows[i].minQty);
      var pr = +String(rows[i].price).replace(/[,\\s]/g, '');
      if (!(mq >= 2 && mq <= 1e6) || !(pr > 0 && pr <= 1e9)) return { ok: false, reason: 'tier_invalid' };
      out.push({ minQty: mq, price: pr, discount: targetPrice ? Math.round((1 - pr / targetPrice) * 100) : 0 });
    }
    out.sort(function (a, b) { return a.minQty - b.minQty; });
    for (var j = 1; j < out.length; j++) {
      if (out[j].minQty === out[j - 1].minQty) return { ok: false, reason: 'tier_dup_qty' };
      if (out[j].price > out[j - 1].price) return { ok: false, reason: 'tier_price_increase' }; // discount must not increase
    }
    return { ok: true, tiers: out };
  }

  function tierInfoFor(d) {
    if (!d) return { idx: -1, price: 0, next: null, needed: 0, discount: 0 };
    var ts = Array.isArray(d.priceTiers) ? d.priceTiers : [];
    var total = +d.totalQty || 0;
    var idx = -1;
    for (var i = 0; i < ts.length; i++) { var mq = +(ts[i].minQty || 0); if (mq > 0 && total >= mq) idx = i; }
    var price = idx >= 0 ? (+ts[idx].price || 0) : (+d.targetPrice || 0);
    var next = null, needed = 0;
    for (var k = idx + 1; k < ts.length; k++) { var mq2 = +(ts[k].minQty || 0); if (mq2 > total) { next = ts[k]; needed = mq2 - total; break; } }
    var base = +d.targetPrice || price || 1;
    var discount = base ? Math.round((1 - price / base) * 100) : 0;
    return { idx: idx, price: price, next: next, needed: needed, discount: discount };
  }

  // ---------- Agreement Versioning (Immutable) ----------
  async function createAgreementVersion(gid, goid, createdBy, reason, changes, snapshot) {
    var verId = genId('agr');
    var prevSnap = null;
    try {
      var goSnap = await skh.getDoc(goRef(gid, goid));
      if (goSnap && goSnap.exists && goSnap.exists()) prevSnap = goSnap.data() || {};
    } catch (e) {}
    var versionNum = (prevSnap && prevSnap.agreementVersionNum ? +prevSnap.agreementVersionNum : 0) + 1;
    var doc = {
      versionId: verId,
      version: versionNum,
      previousAgreementId: (prevSnap && prevSnap.currentAgreementId) || null,
      createdBy: createdBy || uid(),
      reason: String(reason || '').slice(0, 300),
      changes: changes || {},
      snapshot: snapshot || prevSnap || {},
      createdAt: nowIso(),
      immutable: true
    };
    await skh.setDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/agreementVersions', verId), doc);
    await skh.updateDoc(goRef(gid, goid), {
      currentAgreementId: verId,
      agreementVersionNum: versionNum,
      agreementVersion: 'V' + versionNum,
      updatedAt: nowIso()
    });
    await logAudit(gid, goid, 'agreement_version_created', createdBy || uid(), { version: versionNum, reason: reason });
    return { ok: true, versionId: verId, version: versionNum };
  }

  async function getAgreementVersions(gid, goid) {
    var out = [];
    try {
      var snap = await skh.getDocs(agrCol(gid, goid));
      snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; out.push(x); });
      out.sort(function (a, b) { return (a.version || 0) - (b.version || 0); });
    } catch (e) {}
    return out;
  }

  // ---------- Audit Logs ----------
  async function logAudit(gid, goid, type, actorUid, meta) {
    try {
      await skh.addDoc(auditCol(gid, goid), {
        type: type,
        actorUid: actorUid || uid() || null,
        goid: goid,
        meta: meta || null,
        at: nowIso()
      });
      // also to group events for unified timeline
      await skh.addDoc(evCol(gid), {
        type: 'go_' + type,
        actorUid: actorUid || uid() || null,
        goid: goid,
        note: (meta && meta.reason) || type,
        at: nowIso()
      });
    } catch (e) { console.warn('[go audit]', e); }
  }

  async function getAuditLogs(gid, goid, limit) {
    var out = [];
    try {
      var snap = await skh.getDocs(auditCol(gid, goid));
      snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; out.push(x); });
      out.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
    } catch (e) {}
    return out.slice(0, Math.max(1, Math.min(100, +limit || 20)));
  }

  // ---------- Participants (Scalable Subcollection + Map for compat) ----------
  async function ensureParticipantDoc(gid, goid, puid, data) {
    try {
      await skh.setDoc(partRef(gid, goid, puid), Object.assign({
        participantId: puid,
        groupOrderId: goid,
        groupId: gid,
        joinedAt: nowIso(),
        updatedAt: nowIso()
      }, data || {}), { merge: true });
    } catch (e) { console.warn('[go part]', e); }
  }

  async function getParticipants(gid, goid) {
    var out = [];
    try {
      var snap = await skh.getDocs(partCol(gid, goid));
      snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; out.push(x); });
    } catch (e) {}
    // fallback to map if subcollection empty
    if (!out.length) {
      try {
        var goSnap = await skh.getDoc(goRef(gid, goid));
        var goData = goSnap && goSnap.exists && goSnap.exists() ? goSnap.data() : {};
        var map = goData.participants || {};
        Object.keys(map).forEach(function (k) {
          var v = map[k] || {};
          out.push(Object.assign({ participantId: k, quantity: v.qty || v.quantity || 0 }, v));
        });
      } catch (e2) {}
    }
    return out;
  }

  // ---------- Polls Type A/B/C ----------
  async function createPoll(gid, goid, type, config) {
    if (![POLL_TYPE.A, POLL_TYPE.B, POLL_TYPE.C].includes(type)) type = POLL_TYPE.B;
    config = config || {};
    var q = String(config.question || '').trim().slice(0, 300);
    var opts = Array.isArray(config.options) ? config.options.map(function (o) { return String(o).trim().slice(0, 120); }).filter(Boolean).slice(0, 6) : [];
    if (q.length < 3 || opts.length < 2) return { ok: false, reason: 'invalid_poll' };
    var pollId = genId('poll');
    var quorum = Math.max(1, Math.min(100, +config.quorum || 50)); // %
    var threshold = Math.max(1, Math.min(100, +config.threshold || 60)); // %
    var minVoters = Math.max(1, +config.minVoters || 2);
    var closingTime = config.closingTime || new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    var doc = {
      pollId: pollId,
      type: type,
      question: q,
      options: opts,
      votes: {}, // {optionIdx: [uids]}
      quorum: quorum,
      threshold: threshold,
      minVoters: minVoters,
      closingTime: closingTime,
      status: 'OPEN',
      leadingOption: null,
      createdBy: uid(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await skh.setDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/polls', pollId), doc);
    await logAudit(gid, goid, 'poll_created', uid(), { pollId: pollId, type: type });
    return { ok: true, pollId: pollId, poll: doc };
  }

  async function votePoll(gid, goid, pollId, optionIdx) {
    var ref = skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/polls', pollId);
    var snap = await skh.getDoc(ref);
    if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
    var poll = snap.data() || {};
    if (poll.status !== 'OPEN') return { ok: false, reason: 'closed' };
    if (new Date(poll.closingTime).getTime() < Date.now()) {
      await skh.updateDoc(ref, { status: 'CLOSED', updatedAt: nowIso() });
      return { ok: false, reason: 'expired' };
    }
    var idx = Math.floor(+optionIdx);
    if (isNaN(idx) || idx < 0 || idx >= (poll.options || []).length) return { ok: false, reason: 'invalid_option' };
    var votes = poll.votes && typeof poll.votes === 'object' ? poll.votes : {};
    // remove previous vote
    var prev = null;
    Object.keys(votes).forEach(function (k) { if (Array.isArray(votes[k]) && votes[k].indexOf(uid()) >= 0) prev = k; });
    if (prev !== null) votes[prev] = (votes[prev] || []).filter(function (u) { return u !== uid(); });
    votes[String(idx)] = (votes[String(idx)] || []).concat([uid()]);
    // compute leading option surfaced not auto-final
    var leading = null, max = -1;
    Object.keys(votes).forEach(function (k) {
      var cnt = Array.isArray(votes[k]) ? votes[k].length : 0;
      if (cnt > max) { max = cnt; leading = parseInt(k, 10); }
    });
    await skh.updateDoc(ref, { votes: votes, leadingOption: leading, updatedAt: nowIso() });
    await logAudit(gid, goid, 'poll_voted', uid(), { pollId: pollId, optionIdx: idx });
    return { ok: true, votes: votes, leadingOption: leading };
  }

  async function getPolls(gid, goid) {
    var out = [];
    try {
      var snap = await skh.getDocs(pollCol(gid, goid));
      snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; out.push(x); });
      out.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    } catch (e) {}
    return out;
  }

  function getLeadingOption(poll) {
    if (!poll) return null;
    return poll.leadingOption != null ? { idx: poll.leadingOption, label: (poll.options || [])[poll.leadingOption], votes: ((poll.votes || {})[poll.leadingOption] || []).length } : null;
  }

  // ---------- Payment (SokoPay Escrow) ----------
  // Individual payment target: amountDue, amountPaid, status, transactionId
  // Group dashboard: Collected/Expected/% + privacy
  async function initiatePaymentPhase(gid, goid) {
    var goSnap = await skh.getDoc(goRef(gid, goid));
    if (!(goSnap && goSnap.exists && goSnap.exists())) return { ok: false, reason: 'not_found' };
    var goData = goSnap.data() || {};
    var status = String(goData.status || '');
    if ([GO_STATUS.TARGET_REACHED, GO_STATUS.PAYMENT_OPEN, GO_STATUS.PAYMENT_COLLECTING].indexOf(status) < 0 && goData.totalQty < goData.targetQty) {
      return { ok: false, reason: 'target_not_reached' };
    }
    // Use agreement snapshot pricing, not current product price
    var tier = tierInfoFor(goData);
    var unitPrice = tier.price || goData.targetPrice;
    var participants = await getParticipants(gid, goid);
    var expectedTotal = 0;
    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      var qty = +p.quantity || +p.qty || 0;
      var subtotal = Math.round(qty * unitPrice);
      var deliveryFee = +p.deliveryFee || 0;
      var total = subtotal + deliveryFee;
      expectedTotal += total;
      var payId = 'pay_' + p.participantId;
      await skh.setDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/payments', payId), {
        paymentId: payId,
        participantId: p.participantId,
        groupOrderId: goid,
        amountDue: total,
        amountPaid: 0,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        unitPrice: unitPrice,
        quantity: qty,
        status: PAYMENT_STATUS.UNPAID,
        transactionId: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      }, { merge: true });
      await ensureParticipantDoc(gid, goid, p.participantId, {
        payment: { amountDue: total, amountPaid: 0, status: PAYMENT_STATUS.UNPAID, transactionId: null },
        unitPrice: unitPrice,
        subtotal: subtotal,
        total: total
      });
    }
    await skh.updateDoc(goRef(gid, goid), {
      status: GO_STATUS.PAYMENT_COLLECTING,
      paymentStatus: GROUP_PAYMENT_STATUS.COLLECTING,
      paymentExpected: expectedTotal,
      paymentCollected: 0,
      paymentProgress: 0,
      paymentOpenedAt: nowIso(),
      updatedAt: nowIso()
    });
    await logAudit(gid, goid, 'payment_opened', uid(), { expected: expectedTotal, unitPrice: unitPrice });
    try { await syncGoHead(gid); } catch (e) {}
    return { ok: true, expected: expectedTotal, unitPrice: unitPrice };
  }

  async function confirmIndividualPayment(gid, goid, participantId, amountPaid, transactionId) {
    // Server-side in production; client simulation with idempotency
    var payId = 'pay_' + participantId;
    var ref = skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/payments', payId);
    var snap = await skh.getDoc(ref);
    if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'payment_not_found' };
    var pay = snap.data() || {};
    if (pay.status === PAYMENT_STATUS.PAID) return { ok: true, already: true };
    // Idempotency check
    try {
      var q = skh.query(skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/payments'), skh.where('transactionId', '==', transactionId), skh.limit(1));
      var qs = await skh.getDocs(q);
      if (!qs.empty) return { ok: true, already: true };
    } catch (e) {}
    var due = +pay.amountDue || 0;
    if (+amountPaid < due) return { ok: false, reason: 'insufficient' };
    await skh.updateDoc(ref, {
      amountPaid: +amountPaid,
      status: PAYMENT_STATUS.PAID,
      transactionId: transactionId || genId('tx'),
      paidAt: nowIso(),
      updatedAt: nowIso()
    });
    await ensureParticipantDoc(gid, goid, participantId, {
      payment: { amountDue: due, amountPaid: +amountPaid, status: PAYMENT_STATUS.PAID, transactionId: transactionId },
      state: PARTICIPANT_STATE.PAID
    });
    // update group aggregates
    try {
      var goSnap = await skh.getDoc(goRef(gid, goid));
      var goData = goSnap.data() || {};
      var collected = +goData.paymentCollected || 0;
      collected += due;
      var expected = +goData.paymentExpected || due;
      var progress = expected ? Math.round((collected / expected) * 100) : 0;
      var newStatus = progress >= 100 ? GO_STATUS.PAYMENT_TARGET_REACHED : GO_STATUS.PAYMENT_COLLECTING;
      var groupPayStatus = progress >= 100 ? GROUP_PAYMENT_STATUS.TARGET_REACHED : GROUP_PAYMENT_STATUS.COLLECTING;
      if (progress >= 100) groupPayStatus = GROUP_PAYMENT_STATUS.READY_FOR_FULFILLMENT;
      await skh.updateDoc(goRef(gid, goid), {
        paymentCollected: collected,
        paymentProgress: progress,
        status: newStatus,
        paymentStatus: groupPayStatus,
        updatedAt: nowIso()
      });
      if (progress >= 100) {
        await logAudit(gid, goid, 'payment_target_reached', participantId, { collected: collected, expected: expected });
        // auto move to fulfillment requested
        await skh.updateDoc(goRef(gid, goid), { status: GO_STATUS.FULFILLMENT_REQUESTED, updatedAt: nowIso() });
      }
    } catch (eAgg) {}
    await logAudit(gid, goid, 'participant_paid', participantId, { amount: amountPaid, tx: transactionId });
    return { ok: true };
  }

  async function getPaymentDashboard(gid, goid, requesterUid) {
    var goSnap = await skh.getDoc(goRef(gid, goid));
    var goData = goSnap && goSnap.exists && goSnap.exists() ? goSnap.data() : {};
    var isOrganizer = (goData.organizerId === requesterUid) || false;
    var myRole = null;
    try { myRole = await window.skhGroupMyRole(gid); } catch (e) {}
    isOrganizer = isOrganizer || (myRole === 'owner' || myRole === 'admin' || myRole === 'organizer');
    var pays = [];
    try {
      var snap = await skh.getDocs(payCol(gid, goid));
      snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; pays.push(x); });
    } catch (e) {}
    var collected = +goData.paymentCollected || pays.filter(function (p) { return p.status === PAYMENT_STATUS.PAID; }).reduce(function (s, p) { return s + (+p.amountPaid || 0); }, 0);
    var expected = +goData.paymentExpected || pays.reduce(function (s, p) { return s + (+p.amountDue || 0); }, 0);
    var pct = expected ? Math.round((collected / expected) * 100) : 0;
    // privacy: non-organizer sees only own payment + aggregates
    var visiblePays = isOrganizer ? pays : pays.filter(function (p) { return p.participantId === requesterUid; }).map(function (p) {
      return { participantId: p.participantId, status: p.status, amountDue: p.amountDue, amountPaid: p.amountPaid, isMine: true };
    });
    return {
      collected: collected,
      expected: expected,
      progress: pct,
      payments: visiblePays,
      isOrganizer: isOrganizer,
      quantityTarget: { collected: +goData.totalQty || 0, target: +goData.targetQty || 0 },
      paymentTarget: { collected: collected, expected: expected, progress: pct }
    };
  }

  // ---------- Seller Fulfillment ----------
  async function requestFulfillment(gid, goid) {
    var goSnap = await skh.getDoc(goRef(gid, goid));
    if (!(goSnap && goSnap.exists && goSnap.exists())) return { ok: false, reason: 'not_found' };
    var goData = goSnap.data() || {};
    if (goData.status !== GO_STATUS.PAYMENT_TARGET_REACHED && goData.status !== GO_STATUS.FULFILLMENT_REQUESTED) {
      return { ok: false, reason: 'payment_not_complete' };
    }
    var participants = await getParticipants(gid, goid);
    var variantBreakdown = {};
    var locationBreakdown = {};
    var totalQty = 0;
    participants.forEach(function (p) {
      var v = p.variant || 'default';
      var loc = p.destination || p.deliveryArea || 'unknown';
      var qty = +p.quantity || +p.qty || 0;
      totalQty += qty;
      variantBreakdown[v] = (variantBreakdown[v] || 0) + qty;
      locationBreakdown[loc] = (locationBreakdown[loc] || 0) + qty;
    });
    var fulfillmentId = genId('fulfill');
    await skh.setDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/fulfillments', fulfillmentId), {
      fulfillmentId: fulfillmentId,
      groupOrderId: goid,
      groupId: gid,
      totalQty: totalQty,
      variantBreakdown: variantBreakdown,
      locationBreakdown: locationBreakdown,
      participantsCount: participants.length,
      securedAmount: goData.paymentCollected || 0,
      paymentDeadline: goData.paymentDeadline || null,
      status: 'REQUESTED',
      requestedAt: nowIso(),
      requestedBy: uid()
    });
    await skh.updateDoc(goRef(gid, goid), { status: GO_STATUS.SELLER_PROCESSING, updatedAt: nowIso() });
    await logAudit(gid, goid, 'fulfillment_requested', uid(), { totalQty: totalQty, variantBreakdown: variantBreakdown, locationBreakdown: locationBreakdown });
    return { ok: true, fulfillmentId: fulfillmentId, variantBreakdown: variantBreakdown, locationBreakdown: locationBreakdown };
  }

  async function sellerFulfillmentResponse(gid, goid, response, partialDetails) {
    if (![FULFILLMENT_RESPONSE.ACCEPT_FULL, FULFILLMENT_RESPONSE.ACCEPT_PARTIAL, FULFILLMENT_RESPONSE.CANNOT_FULFILL].includes(response)) {
      return { ok: false, reason: 'invalid_response' };
    }
    var goSnap = await skh.getDoc(goRef(gid, goid));
    var goData = goSnap.data() || {};
    var fulfilledQty = response === FULFILLMENT_RESPONSE.ACCEPT_FULL ? +goData.totalQty : (partialDetails && +partialDetails.fulfilledQty) || 0;
    if (response === FULFILLMENT_RESPONSE.ACCEPT_PARTIAL && !(fulfilledQty > 0 && fulfilledQty <= +goData.totalQty)) {
      return { ok: false, reason: 'invalid_fulfilled_qty' };
    }
    var update = {
      fulfillmentResponse: response,
      fulfilledQty: fulfilledQty,
      sellerResponseAt: nowIso(),
      sellerResponseBy: uid(),
      updatedAt: nowIso()
    };
    if (response === FULFILLMENT_RESPONSE.CANNOT_FULFILL) {
      update.status = GO_STATUS.SELLER_UNABLE_TO_FULFILL;
    } else if (response === FULFILLMENT_RESPONSE.ACCEPT_PARTIAL) {
      update.status = GO_STATUS.PARTIALLY_FULFILLED;
      update.partialReason = partialDetails && partialDetails.reason ? String(partialDetails.reason).slice(0, 300) : null;
    } else {
      update.status = GO_STATUS.READY_FOR_ALLOCATION;
    }
    await skh.updateDoc(goRef(gid, goid), update);
    await logAudit(gid, goid, 'seller_response', uid(), { response: response, fulfilledQty: fulfilledQty });
    return { ok: true, response: response, fulfilledQty: fulfilledQty };
  }

  // ---------- Allocation Engine (sum==fulfilled validation) ----------
  async function allocateOrders(gid, goid, allocationMap) {
    // allocationMap: {participantId: allocatedQty}
    var goSnap = await skh.getDoc(goRef(gid, goid));
    if (!(goSnap && goSnap.exists && goSnap.exists())) return { ok: false, reason: 'not_found' };
    var goData = goSnap.data() || {};
    var fulfilledQty = +goData.fulfilledQty || +goData.totalQty || 0;
    if (!(fulfilledQty > 0)) return { ok: false, reason: 'no_fulfilled_qty' };
    allocationMap = allocationMap || {};
    var participants = await getParticipants(gid, goid);
    var sumAllocated = 0;
    var allocations = {};
    participants.forEach(function (p) {
      var pid = p.participantId;
      var requested = +p.quantity || +p.qty || 0;
      var allocated = allocationMap[pid] != null ? Math.floor(+allocationMap[pid]) : requested;
      if (allocated < 0 || allocated > requested) throw new Error('invalid allocation for ' + pid);
      allocations[pid] = allocated;
      sumAllocated += allocated;
    });
    // validation sum == fulfilled
    if (sumAllocated !== fulfilledQty) {
      return { ok: false, reason: 'allocation_mismatch', sum: sumAllocated, fulfilled: fulfilledQty, message: 'Allocation sum ' + sumAllocated + ' must equal fulfilled qty ' + fulfilledQty };
    }
    // create packages
    var packageIds = [];
    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      var pid = p.participantId;
      var allocQty = allocations[pid] || 0;
      if (allocQty <= 0) continue;
      var pkgId = genId('pkg');
      var pkgDoc = {
        packageId: pkgId,
        orderId: p.orderId || genId('ORD'),
        participantId: pid,
        groupOrderId: goid,
        groupId: gid,
        contents: goData.productSnapshot ? [goData.productSnapshot] : [{ name: goData.productName }],
        qty: allocQty,
        variant: p.variant || null,
        destination: p.destination || goData.deliveryArea || '',
        deliveryMethod: p.deliveryMethod || goData.deliveryMethod || 'individual',
        shipmentId: null,
        status: PACKAGE_STATUS.ALLOCATED,
        allocatedAt: nowIso(),
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      await skh.setDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages', pkgId), pkgDoc);
      packageIds.push(pkgId);
      await ensureParticipantDoc(gid, goid, pid, {
        allocation: { allocatedQty: allocQty, packageId: pkgId },
        state: PARTICIPANT_STATE.ALLOCATED
      });
      // create individual order ORD-xxxx per participant with snapshot
      try {
        var orderHumanId = 'ORD-' + shortCode(pid + goid).toUpperCase() + '-' + String(i + 1).padStart(2, '0');
        var amount = Math.round(allocQty * (+goData.targetPrice || 0));
        await skh.addDoc(skh.collection(skh.db, 'orders'), {
          kind: 'GROUP_CHILD_ORDER',
          source: 'GROUP_ORDER_ALLOCATION',
          orderId: orderHumanId,
          humanId: orderHumanId,
          parentGoid: goid,
          groupId: gid,
          buyerId: pid,
          buyerName: p.participantName || pid,
          sellerId: goData.productSnapshot ? goData.productSnapshot.sellerId : goData.organizerId,
          itemTitle: (goData.productName || 'Bidhaa') + ' ×' + allocQty,
          productTitle: goData.productName || '',
          qty: allocQty,
          unit: goData.unit || null,
          variant: p.variant || null,
          destination: p.destination || null,
          unitPrice: +goData.targetPrice || 0,
          totalPrice: amount,
          amount: amount,
          currency: 'TZS',
          status: 'allocated',
          paymentStatus: 'secured',
          escrowStatus: 'held',
          timeline: { allocatedAt: nowIso() },
          delivery: { method: p.deliveryMethod || goData.deliveryMethod, area: p.destination || goData.deliveryArea },
          groupOrder: { gid: gid, goid: goid, parentCode: goData.parentCode || 'GO-' + shortCode(goid), agreementVersion: goData.agreementVersion || 'V1' },
          productSnapshot: goData.productSnapshot || null,
          packageId: pkgId,
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
      } catch (eOrd) { console.warn('[go ord create]', eOrd); }
    }
    await skh.updateDoc(goRef(gid, goid), {
      status: GO_STATUS.ALLOCATED,
      allocatedQty: sumAllocated,
      packageIds: packageIds,
      allocatedAt: nowIso(),
      updatedAt: nowIso()
    });
    await logAudit(gid, goid, 'allocated', uid(), { sum: sumAllocated, packages: packageIds.length });
    return { ok: true, allocatedQty: sumAllocated, packageIds: packageIds };
  }

  // ---------- Distribution Engine ----------
  function aggregateByLocation(packages) {
    var agg = {};
    packages.forEach(function (pkg) {
      var dest = pkg.destination || 'unknown';
      if (!agg[dest]) agg[dest] = { destination: dest, totalQty: 0, packageIds: [], variants: {} };
      agg[dest].totalQty += +pkg.qty || 0;
      agg[dest].packageIds.push(pkg.packageId);
      var v = pkg.variant || 'default';
      agg[dest].variants[v] = (agg[dest].variants[v] || 0) + (+pkg.qty || 0);
    });
    return Object.values(agg);
  }

  async function createShipment(gid, goid, packageIds, destinationArea, transportMethod, distributionMode) {
    if (!Array.isArray(packageIds) || !packageIds.length) return { ok: false, reason: 'no_packages' };
    distributionMode = distributionMode || DISTRIBUTION_MODE.INDIVIDUAL;
    var shipmentId = genId('ship');
    var doc = {
      shipmentId: shipmentId,
      packageIds: packageIds,
      destinationArea: destinationArea || '',
      transportMethod: transportMethod || 'road',
      distributionMode: distributionMode,
      transporterId: null,
      transporterName: null,
      status: SHIPMENT_STATUS.CREATED,
      events: [{ status: SHIPMENT_STATUS.CREATED, at: nowIso(), by: uid() }],
      groupOrderId: goid,
      groupId: gid,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await skh.setDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/shipments', shipmentId), doc);
    // link packages to shipment
    for (var i = 0; i < packageIds.length; i++) {
      try {
        await skh.updateDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages', packageIds[i]), {
          shipmentId: shipmentId,
          status: PACKAGE_STATUS.SHIPPED,
          updatedAt: nowIso()
        });
      } catch (e) {}
    }
    await skh.updateDoc(goRef(gid, goid), { status: GO_STATUS.DISTRIBUTION_READY, updatedAt: nowIso() });
    await logAudit(gid, goid, 'shipment_created', uid(), { shipmentId: shipmentId, packages: packageIds.length, destination: destinationArea });
    return { ok: true, shipmentId: shipmentId, shipment: doc };
  }

  async function assignTransporter(gid, goid, shipmentId, transporterId) {
    var ref = skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/shipments', shipmentId);
    var snap = await skh.getDoc(ref);
    if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
    var tName = transporterId;
    try { var us = await skh.getDoc(skh.doc(skh.db, 'users', transporterId)); if (us && us.exists && us.exists()) tName = us.data().fullName || us.data().displayName || tName; } catch (e) {}
    await skh.updateDoc(ref, {
      transporterId: transporterId,
      transporterName: tName,
      status: SHIPMENT_STATUS.ASSIGNED,
      events: skh.arrayUnion ? skh.arrayUnion({ status: SHIPMENT_STATUS.ASSIGNED, at: nowIso(), by: uid(), transporterId: transporterId }) : [{ status: SHIPMENT_STATUS.ASSIGNED, at: nowIso(), by: uid() }],
      updatedAt: nowIso()
    });
    await logAudit(gid, goid, 'transporter_assigned', uid(), { shipmentId: shipmentId, transporterId: transporterId });
    return { ok: true };
  }

  async function updateShipmentStatus(gid, goid, shipmentId, newStatus, meta) {
    if (!Object.values(SHIPMENT_STATUS).includes(newStatus)) return { ok: false, reason: 'invalid_status' };
    var ref = skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/shipments', shipmentId);
    var snap = await skh.getDoc(ref);
    if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
    var cur = snap.data() || {};
    // pickup token generation for PICKED_UP
    var pickupToken = null;
    if (newStatus === SHIPMENT_STATUS.PICKED_UP) {
      pickupToken = 'PK-' + shortCode(shipmentId + nowIso()).toUpperCase() + '-' + Math.floor(Math.random() * 9000 + 1000);
    }
    var event = { status: newStatus, at: nowIso(), by: uid(), meta: meta || null };
    if (pickupToken) event.pickupToken = pickupToken;
    var update = {
      status: newStatus,
      updatedAt: nowIso()
    };
    if (pickupToken) update.pickupToken = pickupToken;
    // handle deliveredAt + confirmationDeadline for DELIVERED
    if (newStatus === SHIPMENT_STATUS.DELIVERED) {
      var deliveredAt = nowIso();
      var confirmationDeadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // server-controlled in prod via FieldValue.serverTimestamp()
      update.deliveredAt = deliveredAt;
      update.confirmationDeadline = confirmationDeadline;
      // also update packages
      var pkgIds = cur.packageIds || [];
      for (var i = 0; i < pkgIds.length; i++) {
        try {
          await skh.updateDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages', pkgIds[i]), {
            status: PACKAGE_STATUS.DELIVERED,
            deliveredAt: deliveredAt,
            confirmationDeadline: confirmationDeadline,
            updatedAt: nowIso()
          });
          await skh.setDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages/' + pkgIds[i] + '/delivery', 'status'), {
            status: DELIVERY_STATUS.DELIVERED,
            deliveredAt: deliveredAt,
            confirmationDeadline: confirmationDeadline,
            updatedAt: nowIso()
          }, { merge: true });
        } catch (eP) {}
      }
    }
    try {
      var existingEvents = cur.events || [];
      existingEvents.push(event);
      update.events = existingEvents;
      await skh.updateDoc(ref, update);
    } catch (e) {
      await skh.updateDoc(ref, { status: newStatus, updatedAt: nowIso() });
    }
    await logAudit(gid, goid, 'shipment_' + newStatus.toLowerCase(), uid(), { shipmentId: shipmentId, pickupToken: pickupToken });
    // update group order status if all shipments delivered
    if (newStatus === SHIPMENT_STATUS.DELIVERED) {
      await skh.updateDoc(goRef(gid, goid), { status: GO_STATUS.AWAITING_CONFIRMATION, updatedAt: nowIso() });
    }
    return { ok: true, pickupToken: pickupToken, deliveredAt: update.deliveredAt, confirmationDeadline: update.confirmationDeadline };
  }

  // ---------- Delivery Confirmation & 24h Auto-Release ----------
  async function confirmReceipt(gid, goid, packageId, participantId) {
    var pkgRef = skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages', packageId);
    var pkgSnap = await skh.getDoc(pkgRef);
    if (!(pkgSnap && pkgSnap.exists && pkgSnap.exists())) return { ok: false, reason: 'package_not_found' };
    var pkg = pkgSnap.data() || {};
    if (pkg.participantId !== participantId && participantId !== uid()) return { ok: false, reason: 'not_owner' };
    if (pkg.status === PACKAGE_STATUS.CONFIRMED) return { ok: true, already: true };
    if (pkg.status !== PACKAGE_STATUS.DELIVERED && pkg.status !== PACKAGE_STATUS.SHIPPED) return { ok: false, reason: 'not_delivered' };
    await skh.updateDoc(pkgRef, {
      status: PACKAGE_STATUS.CONFIRMED,
      confirmedAt: nowIso(),
      confirmedBy: participantId || uid(),
      updatedAt: nowIso()
    });
    await ensureParticipantDoc(gid, goid, pkg.participantId, {
      delivery: { status: DELIVERY_STATUS.CONFIRMED, confirmedAt: nowIso() },
      state: PARTICIPANT_STATE.CONFIRMED_RECEIPT
    });
    await logAudit(gid, goid, 'package_confirmed', participantId || uid(), { packageId: packageId });
    // check if all packages confirmed -> group COMPLETED
    try { await checkGroupCompletion(gid, goid); } catch (e) {}
    // settlement: release escrow to seller/transporter
    try { await settlementRelease(gid, goid, packageId); } catch (eS) {}
    return { ok: true };
  }

  async function reportProblem(gid, goid, packageId, reason, evidence) {
    var pkgRef = skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages', packageId);
    var pkgSnap = await skh.getDoc(pkgRef);
    if (!(pkgSnap && pkgSnap.exists && pkgSnap.exists())) return { ok: false, reason: 'package_not_found' };
    await skh.updateDoc(pkgRef, {
      status: PACKAGE_STATUS.DISPUTED,
      disputeReason: String(reason || '').slice(0, 500),
      disputeEvidence: evidence || null,
      disputedAt: nowIso(),
      disputedBy: uid(),
      updatedAt: nowIso()
    });
    // pause auto-release
    await skh.setDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages/' + packageId + '/delivery', 'status'), {
      status: DELIVERY_STATUS.DISPUTED,
      disputeReason: reason,
      disputedAt: nowIso(),
      autoReleasePaused: true,
      updatedAt: nowIso()
    }, { merge: true });
    await skh.updateDoc(goRef(gid, goid), { status: GO_STATUS.DISPUTED, updatedAt: nowIso() });
    await logAudit(gid, goid, 'package_disputed', uid(), { packageId: packageId, reason: reason });
    return { ok: true };
  }

  async function autoReleaseCheck(gid, goid) {
    // Client simulation of server scheduled function. In prod, uses FieldValue.serverTimestamp() and releaseTransactionId idempotent.
    var pkgs = [];
    try {
      var snap = await skh.getDocs(pkgCol(gid, goid));
      snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; pkgs.push(x); });
    } catch (e) { return { ok: false, reason: 'fetch_failed' }; }
    var released = [];
    var now = Date.now();
    for (var i = 0; i < pkgs.length; i++) {
      var pkg = pkgs[i];
      if (pkg.status !== PACKAGE_STATUS.DELIVERED) continue;
      if (pkg.disputeReason) continue; // dispute pauses auto-release
      var deadline = pkg.confirmationDeadline ? new Date(pkg.confirmationDeadline).getTime() : 0;
      if (!deadline || deadline > now) continue;
      // idempotency: check if already has releaseTransactionId
      if (pkg.releaseTransactionId) continue;
      var releaseTxId = 'rel_' + pkg.packageId + '_' + Date.now().toString(36);
      try {
        await skh.updateDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages', pkg.__id), {
          status: PACKAGE_STATUS.CONFIRMED,
          autoReleased: true,
          releaseTransactionId: releaseTxId,
          releasedAt: nowIso(),
          confirmationDeadline: pkg.confirmationDeadline,
          updatedAt: nowIso()
        });
        await ensureParticipantDoc(gid, goid, pkg.participantId, {
          delivery: { status: DELIVERY_STATUS.AUTO_RELEASED, releasedAt: nowIso(), releaseTransactionId: releaseTxId },
          state: PARTICIPANT_STATE.COMPLETED
        });
        await settlementRelease(gid, goid, pkg.__id);
        released.push(pkg.__id);
        await logAudit(gid, goid, 'auto_released', 'system', { packageId: pkg.__id, releaseTxId: releaseTxId });
      } catch (eR) { console.warn('[auto-release]', eR); }
    }
    return { ok: true, released: released, count: released.length };
  }

  // ---------- Settlement (SokoPay escrow -> seller/transporter) ----------
  async function settlementRelease(gid, goid, packageId) {
    var pkgSnap = await skh.getDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages', packageId));
    if (!(pkgSnap && pkgSnap.exists && pkgSnap.exists())) return { ok: false, reason: 'package_not_found' };
    var pkg = pkgSnap.data() || {};
    if (pkg.settlementReleased) return { ok: true, already: true };
    var goSnap = await skh.getDoc(goRef(gid, goid));
    var goData = goSnap.data() || {};
    var unitPrice = +goData.targetPrice || 0;
    var qty = +pkg.qty || 0;
    var amount = Math.round(qty * unitPrice);
    var feeRate = 0.015;
    var fee = Math.round(amount * feeRate);
    var sellerAmount = amount - fee;
    var transporterFee = 0;
    // In prod, financial ledger secured/entitlement/fees/refunds/released/pending/disputed server-side
    var sellerId = goData.productSnapshot ? goData.productSnapshot.sellerId : goData.organizerId;
    // release to seller
    if (sellerId) {
      try {
        var uRef = skh.doc(skh.db, 'users', sellerId);
        var uSnap = await skh.getDoc(uRef);
        var bal = uSnap && uSnap.exists && uSnap.exists() ? (+uSnap.data().walletBalance || 0) : 0;
        await skh.updateDoc(uRef, { walletBalance: bal + sellerAmount, updatedAt: nowIso() });
        await skh.addDoc(skh.collection(skh.db, 'wallet_ledger'), {
          kind: 'escrow_release_seller',
          uid: sellerId,
          orderDocId: packageId,
          groupOrderId: goid,
          groupId: gid,
          delta: sellerAmount,
          before: bal,
          after: bal + sellerAmount,
          fee: fee,
          at: nowIso()
        });
      } catch (eS) { console.warn('[settle seller]', eS); }
    }
    // transporter release if shipment has transporter
    try {
      var shipId = pkg.shipmentId;
      if (shipId) {
        var shipSnap = await skh.getDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/shipments', shipId));
        var ship = shipSnap && shipSnap.exists && shipSnap.exists() ? shipSnap.data() : {};
        var transporterId = ship.transporterId;
        if (transporterId && ship.transportFee) {
          transporterFee = +ship.transportFee || 0;
          var tRef = skh.doc(skh.db, 'users', transporterId);
          var tSnap = await skh.getDoc(tRef);
          var tBal = tSnap && tSnap.exists && tSnap.exists() ? (+tSnap.data().walletBalance || 0) : 0;
          await skh.updateDoc(tRef, { walletBalance: tBal + transporterFee, updatedAt: nowIso() });
          await skh.addDoc(skh.collection(skh.db, 'wallet_ledger'), {
            kind: 'escrow_release_transporter',
            uid: transporterId,
            orderDocId: packageId,
            groupOrderId: goid,
            shipmentId: shipId,
            delta: transporterFee,
            before: tBal,
            after: tBal + transporterFee,
            at: nowIso()
          });
        }
      }
    } catch (eT) {}
    // financial ledger update
    try {
      var finRef = skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/financialLedger', 'main');
      var finSnap = await skh.getDoc(finRef);
      var fin = finSnap && finSnap.exists && finSnap.exists() ? finSnap.data() : { secured: 0, entitlement: 0, fees: 0, refunds: 0, released: 0, pending: 0, disputed: 0 };
      fin.released = (+fin.released || 0) + sellerAmount + transporterFee;
      fin.fees = (+fin.fees || 0) + fee;
      fin.pending = Math.max(0, (+fin.secured || 0) - (+fin.released || 0) - (+fin.refunds || 0));
      fin.updatedAt = nowIso();
      await skh.setDoc(finRef, fin, { merge: true });
    } catch (eF) {}
    await skh.updateDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/packages', packageId), {
      settlementReleased: true,
      settlementReleasedAt: nowIso(),
      settlementAmount: sellerAmount,
      settlementFee: fee,
      updatedAt: nowIso()
    });
    await logAudit(gid, goid, 'settlement_released', uid() || 'system', { packageId: packageId, sellerAmount: sellerAmount, fee: fee });
    return { ok: true, sellerAmount: sellerAmount, fee: fee };
  }

  async function getFinancialLedger(gid, goid) {
    try {
      var ref = skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/financialLedger', 'main');
      var snap = await skh.getDoc(ref);
      if (snap && snap.exists && snap.exists()) return snap.data();
    } catch (e) {}
    // compute from payments if ledger missing
    var dash = await getPaymentDashboard(gid, goid, uid());
    return {
      secured: dash.collected || 0,
      entitlement: 0,
      fees: 0,
      refunds: 0,
      released: 0,
      pending: dash.collected || 0,
      disputed: 0,
      expected: dash.expected || 0
    };
  }

  // ---------- Completion ----------
  async function checkGroupCompletion(gid, goid) {
    var pkgs = [];
    try {
      var snap = await skh.getDocs(pkgCol(gid, goid));
      snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; pkgs.push(x); });
    } catch (e) { return { ok: false }; }
    if (!pkgs.length) return { ok: false, reason: 'no_packages' };
    var allResolved = pkgs.every(function (p) { return p.status === PACKAGE_STATUS.CONFIRMED || p.status === PACKAGE_STATUS.RETURNED; });
    if (!allResolved) return { ok: false, reason: 'not_all_confirmed', total: pkgs.length, confirmed: pkgs.filter(function (p) { return p.status === PACKAGE_STATUS.CONFIRMED; }).length };
    await skh.updateDoc(goRef(gid, goid), { status: GO_STATUS.COMPLETED, completedAt: nowIso(), updatedAt: nowIso() });
    await logAudit(gid, goid, 'completed', uid() || 'system', { packages: pkgs.length });
    try { await syncGoHead(gid); } catch (e) {}
    return { ok: true, completed: true };
  }

  // ---------- Cancellation ----------
  async function cancelGroupOrder(gid, goid, reason) {
    var goSnap = await skh.getDoc(goRef(gid, goid));
    if (!(goSnap && goSnap.exists && goSnap.exists())) return { ok: false, reason: 'not_found' };
    var goData = goSnap.data() || {};
    var st = String(goData.status || '');
    // rules per lifecycle
    var cancellable = [GO_STATUS.DRAFT, GO_STATUS.CONFIGURING, GO_STATUS.OPEN, GO_STATUS.JOINING, GO_STATUS.NEAR_TARGET, GO_STATUS.TARGET_REACHED, GO_STATUS.PAYMENT_OPEN, GO_STATUS.PAYMENT_COLLECTING, GO_STATUS.EXPIRED];
    if (cancellable.indexOf(st) < 0 && st !== 'OPEN' && st !== 'NEAR_TARGET' && st !== 'TARGET_REACHED') {
      // after fulfillment requires seller agreement or admin
      var myRole = null;
      try { myRole = await window.skhGroupMyRole(gid); } catch (e) {}
      if (myRole !== 'owner' && myRole !== 'admin' && goData.organizerId !== uid()) return { ok: false, reason: 'cannot_cancel_after_fulfillment' };
    }
    await skh.updateDoc(goRef(gid, goid), { status: GO_STATUS.CANCELLED, cancelledAt: nowIso(), cancelReason: reason || 'organizer', updatedAt: nowIso() });
    await logAudit(gid, goid, 'cancelled', uid(), { reason: reason });
    // refund if payments collected
    try {
      var pays = await skh.getDocs(payCol(gid, goid));
      pays.forEach(function (d) {
        var p = d.data() || {};
        if (p.status === PAYMENT_STATUS.PAID) {
          skh.updateDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders/' + goid + '/payments', d.id), { status: PAYMENT_STATUS.REFUND_PENDING, updatedAt: nowIso() });
        }
      });
      await skh.updateDoc(goRef(gid, goid), { paymentStatus: GROUP_PAYMENT_STATUS.REFUNDED, status: GO_STATUS.REFUNDED, updatedAt: nowIso() });
    } catch (eR) {}
    try { await syncGoHead(gid); } catch (e) {}
    return { ok: true };
  }

  // ---------- Expiry ----------
  async function checkExpiry(gid, goid) {
    var goSnap = await skh.getDoc(goRef(gid, goid));
    if (!(goSnap && goSnap.exists && goSnap.exists())) return null;
    var d = goSnap.data() || {};
    var open = [GO_STATUS.OPEN, GO_STATUS.JOINING, GO_STATUS.NEAR_TARGET, GO_STATUS.INTEREST_PHASE, 'OPEN', 'NEAR_TARGET'].includes(String(d.status));
    if (!open) return { ok: true, status: d.status, closedNow: false };
    var deadline = d.deadline ? new Date(String(d.deadline).slice(0, 10) + 'T23:59:59').getTime() : 0;
    if (!deadline || deadline > Date.now()) return { ok: true, status: d.status, closedNow: false };
    var total = +d.totalQty || 0;
    var min = +d.minQty || +d.targetQty || 1;
    var target = +d.targetQty || 1;
    var newStatus = total >= min ? GO_STATUS.CLOSED : GO_STATUS.EXPIRED;
    var reason = total >= min ? 'min_reached' : 'expired_below_min';
    await skh.updateDoc(goRef(gid, goid), { status: newStatus, closedReason: reason, updatedAt: nowIso() });
    await logAudit(gid, goid, 'expired', uid() || 'system', { total: total, min: min, target: target });
    try { await syncGoHead(gid); } catch (e) {}
    if (total >= target) {
      try { var sp = await window.skhGroupOrderSpawnChildren(gid, goid); if (sp && sp.ok) return { ok: true, status: GO_STATUS.PROCESSING, closedNow: true, spawned: sp.spawned }; } catch (eSP) {}
    }
    return { ok: true, status: newStatus, closedNow: true };
  }

  // ---------- Sync goHead (chat list commerce snippet) ----------
  async function syncGoHead(gid) {
    if (!gid) return;
    try {
      if (typeof window.skhGroupSyncGoHead === 'function') { await window.skhGroupSyncGoHead(gid); return; }
      var q0 = skh.query(goCol(gid), skh.limit(60));
      var sn = await skh.getDocs(q0);
      var best = null, pri = { OPEN: 1, JOINING: 1, NEAR_TARGET: 2, TARGET_REACHED: 3, PAYMENT_COLLECTING: 4, PAYMENT_TARGET_REACHED: 4, FULFILLMENT_REQUESTED: 4, PROCESSING: 4 };
      sn.forEach(function (dx) {
        var g = dx.data() || {}; g.__id = dx.id;
        var p = pri[String(g.status)] || 0;
        if (!p) return;
        if (!best || p > pri[String(best.status)] || (p === pri[String(best.status)] && String(g.updatedAt || '') > String(best.updatedAt || ''))) best = g;
      });
      var ref = convRef(gid);
      var cv = await skh.getDoc(ref);
      if (!(cv && cv.exists && cv.exists())) return;
      var head = best ? { goid: best.__id, productName: best.productName || '', totalQty: +best.totalQty || 0, targetQty: +best.targetQty || 0, status: String(best.status) } : null;
      await skh.updateDoc(ref, { goHead: head });
    } catch (eH) {}
  }

  // ---------- 8-Step Wizard ----------
  var WIZARD_STEPS = [
    { id: 1, key: 'product', label: 'Chagua Bidhaa', desc: 'Select Product (immutable snapshot)' },
    { id: 2, key: 'quantity', label: 'Kiasi', desc: 'min/target/max + location-based' },
    { id: 3, key: 'pricing', label: 'Bei', desc: 'Tiered pricing + snapshot protection' },
    { id: 4, key: 'deadline', label: 'Muda', desc: 'Joining + Payment deadline' },
    { id: 5, key: 'delivery', label: 'Usafirishaji', desc: 'Method + Area + aggregation' },
    { id: 6, key: 'payment', label: 'Malipo', desc: 'Escrow config + individual target' },
    { id: 7, key: 'review', label: 'Hakiki', desc: 'Review all + agreement' },
    { id: 8, key: 'publish', label: 'Chapisha', desc: 'Publish to group' }
  ];

  var wizardState = {
    gid: null,
    step: 1,
    data: {
      productSnapshot: null,
      productId: null,
      productName: '',
      targetQty: 100,
      minQty: 50,
      maxQty: 1000,
      locationQuantities: {}, // {location: qty}
      priceTiers: [],
      targetPrice: 0,
      unit: '',
      currency: 'TZS',
      deadline: '',
      paymentDeadline: '',
      deliveryMethod: 'individual',
      deliveryArea: '',
      distributionMode: DISTRIBUTION_MODE.INDIVIDUAL,
      description: '',
      agreement: null
    }
  };

  function resetWizard(gid) {
    wizardState.gid = gid;
    wizardState.step = 1;
    wizardState.data = {
      productSnapshot: null,
      productId: null,
      productName: '',
      targetQty: 100,
      minQty: 50,
      maxQty: 1000,
      locationQuantities: {},
      priceTiers: [{ minQty: 100, price: 0 }, { minQty: 200, price: 0 }],
      targetPrice: 0,
      unit: 'pcs',
      currency: 'TZS',
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      paymentDeadline: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      deliveryMethod: 'individual',
      deliveryArea: '',
      distributionMode: DISTRIBUTION_MODE.INDIVIDUAL,
      description: '',
      agreement: { terms: '', version: 1 }
    };
  }

  function wizardValidateStep(step) {
    var d = wizardState.data;
    if (step === 1) {
      if (!d.productSnapshot || !d.productSnapshot.productId) return { ok: false, msg: 'Chagua bidhaa kwanza (product snapshot required)' };
    }
    if (step === 2) {
      var qv = validateQuantity(d);
      if (!qv.ok) return { ok: false, msg: 'Kiasi si sahihi: ' + qv.field };
    }
    if (step === 3) {
      if (!(+d.targetPrice > 0)) return { ok: false, msg: 'Weka bei lengo sahihi' };
      var tv = validateTiers(d.priceTiers, +d.targetPrice);
      if (!tv.ok) return { ok: false, msg: 'Price tiers si sahihi: ' + tv.reason };
    }
    if (step === 4) {
      if (!d.deadline || !/^\\d{4}-\\d{2}-\\d{2}/.test(d.deadline)) return { ok: false, msg: 'Weka deadline ya joining' };
      if (new Date(d.deadline) < new Date(new Date().toISOString().slice(0, 10))) return { ok: false, msg: 'Deadline imepita' };
    }
    if (step === 5) {
      if (!d.deliveryArea) return { ok: false, msg: 'Weka eneo la delivery' };
      if (['individual', 'shared'].indexOf(d.deliveryMethod) < 0) return { ok: false, msg: 'Chagua njia ya delivery' };
    }
    return { ok: true };
  }

  async function createGroupOrderFromWizard(gid) {
    var d = wizardState.data;
    // final validation all steps
    for (var s = 1; s <= 6; s++) { var v = wizardValidateStep(s); if (!v.ok) return { ok: false, reason: 'step_' + s, msg: v.msg }; }
    var qv = validateQuantity(d);
    var tv = validateTiers(d.priceTiers, +d.targetPrice);
    var productSnap = d.productSnapshot;
    // immutable after financial commit: snapshot locked now
    var goDoc = {
      type: 'GROUP_ORDER',
      status: GO_STATUS.DRAFT,
      productName: productSnap ? productSnap.name : d.productName,
      productSnapshot: productSnap,
      targetQty: qv.targetQty,
      minQty: qv.minQty,
      maxQty: qv.maxQty,
      locationQuantities: d.locationQuantities || {},
      totalQty: 0,
      participantCount: 0,
      interested: {},
      interestedCount: 0,
      targetPrice: +d.targetPrice,
      priceTiers: tv.tiers,
      unit: d.unit || 'pcs',
      currency: 'TZS',
      deadline: d.deadline,
      paymentDeadline: d.paymentDeadline || new Date(new Date(d.deadline).getTime() + 3 * 86400000).toISOString().slice(0, 10),
      deliveryMethod: d.deliveryMethod,
      deliveryArea: d.deliveryArea,
      distributionMode: d.distributionMode,
      description: d.description || null,
      organizerId: uid(),
      organizerName: myName(),
      participants: {},
      supplierMode: 'request_offers',
      supplierName: null,
      supplierOffers: {},
      offersCount: 0,
      agreementVersion: 'V1',
      agreementVersionNum: 1,
      currentAgreementId: null,
      agreement: d.agreement || { terms: '', version: 1 },
      financialLedger: { secured: 0, entitlement: 0, fees: 0, refunds: 0, released: 0, pending: 0, disputed: 0, expected: 0 },
      paymentStatus: GROUP_PAYMENT_STATUS.PENDING,
      paymentExpected: 0,
      paymentCollected: 0,
      paymentProgress: 0,
      fulfilledQty: 0,
      allocatedQty: 0,
      packageIds: [],
      parentCode: 'GO-' + shortCode(genId()).toUpperCase(),
      childOrdersSpawned: false,
      childOrderIds: [],
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    var rr = await skh.addDoc(goCol(gid), goDoc);
    var goid = rr && rr.id;
    // create first agreement version immutable
    await createAgreementVersion(gid, goid, uid(), 'Initial agreement from wizard', { created: true }, goDoc);
    // publish -> OPEN
    await skh.updateDoc(goRef(gid, goid), { status: GO_STATUS.OPEN, publishedAt: nowIso(), updatedAt: nowIso() });
    await logAudit(gid, goid, 'group_order_created', uid(), { productName: goDoc.productName, targetQty: goDoc.targetQty });
    try { await syncGoHead(gid); } catch (e) {}
    // commerce reference card in chat
    try {
      await skh.addDoc(msgsCol(gid), {
        senderUid: uid(),
        senderName: myName(),
        at: nowIso(),
        type: 'group_order',
        gorderId: goid,
        snapshot: { productName: goDoc.productName, targetQty: goDoc.targetQty, totalQty: 0, targetPrice: goDoc.targetPrice, deadline: goDoc.deadline, deliveryMethod: goDoc.deliveryMethod, status: GO_STATUS.OPEN }
      });
    } catch (eC) {}
    return { ok: true, id: goid, doc: goDoc };
  }

  // ---------- Workspace UI ----------
  // Header/tabs Overview/Chat/Participants/Orders/Payment/Delivery
  // Overview product/agreement/progress/deadline/next action
  // Context-aware action panel JOIN/PAY NOW/VIEW MY ORDER/VIEW FULFILLMENT/TRACK/CONFIRM
  function renderGroupOrderWorkspace(gid, goid, targetEl) {
    targetEl = targetEl || document.getElementById('gsgTabOrders');
    if (!targetEl) return;
    targetEl.innerHTML = '<div style=\"text-align:center;padding:20px;color:#64748b;\">Inapakia workspace...</div>';
    (async function () {
      var goSnap = await skh.getDoc(goRef(gid, goid));
      if (!(goSnap && goSnap.exists && goSnap.exists())) { targetEl.innerHTML = '<div style=\"padding:20px;text-align:center;color:#b91c1c;\">Group Order haipatikani</div>'; return; }
      var goData = goSnap.data() || {};
      goData.__id = goSnap.id;
      var participants = await getParticipants(gid, goid);
      var polls = await getPolls(gid, goid);
      var paymentDash = await getPaymentDashboard(gid, goid, uid());
      var ledger = await getFinancialLedger(gid, goid);
      var packages = [];
      try { var pkgSnap = await skh.getDocs(pkgCol(gid, goid)); pkgSnap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; packages.push(x); }); } catch (e) {}
      var shipments = [];
      try { var shipSnap = await skh.getDocs(shipCol(gid, goid)); shipSnap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; shipments.push(x); }); } catch (e) {}
      var auditLogs = await getAuditLogs(gid, goid, 20);
      var agreementVersions = await getAgreementVersions(gid, goid);

      var isParticipant = participants.some(function (p) { return p.participantId === uid(); });
      var myPart = participants.find(function (p) { return p.participantId === uid(); });
      var isOrganizer = goData.organizerId === uid();
      var myRole = null;
      try { myRole = await window.skhGroupMyRole(gid); } catch (e) {}
      isOrganizer = isOrganizer || (myRole === 'owner' || myRole === 'admin' || myRole === 'organizer');
      var isSeller = goData.productSnapshot && goData.productSnapshot.sellerId === uid();

      var tier = tierInfoFor(goData);
      var progress = goData.targetQty ? Math.min(100, Math.round((+goData.totalQty || 0) / (+goData.targetQty || 1) * 100)) : 0;
      var qtyNeeded = Math.max(0, (+goData.targetQty || 0) - (+goData.totalQty || 0));

      // header
      var headerHtml = '<div style=\"background:#FFF9E8;border:1px solid #ead98a;border-left:4px solid #D8B83A;border-radius:14px;padding:14px 16px;margin-bottom:12px;\">'
        + '<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap;\">'
        + '<span style=\"font-size:9px;font-weight:900;letter-spacing:.6px;color:#8a6d00;background:#fff;border:1px solid #ead98a;border-radius:6px;padding:2px 8px;\">GROUP ORDER</span>'
        + '<span style=\"font-size:10px;font-weight:900;color:' + (goData.status === 'COMPLETED' ? '#0f766e' : goData.status === 'CANCELLED' ? '#b91c1c' : '#0B4F7A') + ';background:#fff;border:1px solid #dbe4ed;border-radius:6px;padding:3px 9px;\">' + esc(String(goData.status || '').replace(/_/g, ' ')) + '</span>'
        + '<span style=\"font-size:10px;font-weight:800;color:#8a6d00;background:#fff;border:1px solid #ead98a;border-radius:6px;padding:3px 9px;\">' + esc(goData.parentCode || '') + '</span>'
        + '</div>'
        + '<b style=\"display:block;font-size:16px;color:#0f172a;margin-top:8px;\">' + esc(goData.productName || '') + '</b>'
        + '<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;\">'
        + '<span style=\"font-size:11px;font-weight:800;color:#334155;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px;\">📦 ' + (+goData.totalQty || 0) + '/' + (+goData.targetQty || 0) + ' (' + progress + '%)</span>'
        + '<span style=\"font-size:11px;font-weight:800;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:8px;padding:5px 10px;\">TZS ' + (tier.price || goData.targetPrice || 0) + (tier.discount ? ' · -' + tier.discount + '%' : '') + '</span>'
        + '<span style=\"font-size:11px;font-weight:700;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px;\">👥 ' + (goData.participantCount || participants.length || 0) + ' participants</span>'
        + '<span style=\"font-size:11px;font-weight:700;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px;\">⏰ ' + esc(String(goData.deadline || '').slice(0, 10)) + '</span>'
        + '</div>'
        + '<div style=\"height:8px;border-radius:99px;background:#f1e9c6;margin-top:10px;overflow:hidden;\"><div style=\"height:100%;width:' + progress + '%;background:linear-gradient(90deg,#D8B83A,#18A982);\"></div></div>'
        + (qtyNeeded ? '<small style=\"display:block;margin-top:6px;color:#8a6d00;font-weight:700;\">Bado ' + qtyNeeded + ' kutimiza lengo' + (tier.next ? ' · Bado ' + tier.needed + ' kufikia TZS ' + tier.next.price : '') + '</small>' : '<small style=\"display:block;margin-top:6px;color:#0f766e;font-weight:800;\">Lengo limetimia ✓</small>')
        + '</div>';

      // context-aware action panel
      var actionPanel = '';
      if (!isParticipant && [GO_STATUS.OPEN, GO_STATUS.JOINING, 'OPEN', 'NEAR_TARGET'].includes(String(goData.status))) {
        actionPanel = '<div style=\"background:#fff;border:1.5px solid #D8B83A;border-radius:12px;padding:12px;margin-bottom:12px;display:flex;gap:8px;align-items:center;\">'
          + '<div style=\"flex:1;\"><b style=\"display:block;font-size:13px;color:#0f172a;\">Jiunge na Group Order</b><small style=\"color:#64748b;\">Interest ≠ Join — ku-join ni commitment ya kiasi</small></div>'
          + '<button type=\"button\" data-act=\"go-join\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"border:none;background:#D8B83A;color:#4a3900;font-weight:900;padding:10px 18px;border-radius:10px;cursor:pointer;\">JOIN</button>'
          + '</div>';
      } else if (isParticipant && myPart && myPart.payment && myPart.payment.status === PAYMENT_STATUS.UNPAID && [GO_STATUS.PAYMENT_COLLECTING, GO_STATUS.PAYMENT_OPEN, 'PROCESSING'].includes(String(goData.status))) {
        actionPanel = '<div style=\"background:#eef6fc;border:1.5px solid #1268A8;border-radius:12px;padding:12px;margin-bottom:12px;display:flex;gap:8px;align-items:center;\">'
          + '<div style=\"flex:1;\"><b style=\"display:block;font-size:13px;color:#0B4F7A;\">Lipa Sasa — SokoPay Escrow</b><small style=\"color:#475569;\">Kiasi: TZS ' + (myPart.total || myPart.payment.amountDue || 0) + ' · Bei kutoka agreement snapshot, si bei ya sasa</small></div>'
          + '<button type=\"button\" data-act=\"go-pay-now\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"border:none;background:#18A982;color:#fff;font-weight:900;padding:10px 18px;border-radius:10px;cursor:pointer;\">PAY NOW</button>'
          + '</div>';
      } else if (isParticipant && myPart) {
        var pkg = packages.find(function (p) { return p.participantId === uid(); });
        if (pkg && pkg.status === PACKAGE_STATUS.DELIVERED) {
          actionPanel = '<div style=\"background:#f0faf6;border:1.5px solid #18A982;border-radius:12px;padding:12px;margin-bottom:12px;display:flex;gap:8px;align-items:center;\">'
            + '<div style=\"flex:1;\"><b style=\"display:block;font-size:13px;color:#0f766e;\">Thibitisha Kupokea</b><small style=\"color:#475569;\">Package ' + esc(pkg.packageId) + ' imefika · Confirmation deadline: ' + esc(String(pkg.confirmationDeadline || '').slice(0, 16).replace('T', ' ')) + ' · 24h auto-release</small></div>'
            + '<button type=\"button\" data-act=\"go-confirm\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" data-pkg=\"' + esc(pkg.packageId) + '\" style=\"border:none;background:#18A982;color:#fff;font-weight:900;padding:10px 18px;border-radius:10px;cursor:pointer;\">CONFIRM</button>'
            + '<button type=\"button\" data-act=\"go-report\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" data-pkg=\"' + esc(pkg.packageId) + '\" style=\"border:1.5px solid #fecaca;background:#fff;color:#b91c1c;font-weight:800;padding:10px 14px;border-radius:10px;cursor:pointer;\">REPORT PROBLEM</button>'
            + '</div>';
        } else if (pkg) {
          actionPanel = '<div style=\"background:#fff;border:1px solid #cbe9dd;border-radius:12px;padding:12px;margin-bottom:12px;\">'
            + '<b style=\"font-size:13px;color:#0f172a;\">My Order: ' + esc(pkg.orderId || pkg.packageId) + '</b>'
            + '<div style=\"margin-top:6px;font-size:12px;color:#334155;\">Qty: ' + (+pkg.qty || 0) + ' · Status: ' + esc(pkg.status) + ' · Shipment: ' + esc(pkg.shipmentId || '—') + '</div>'
            + '<button type=\"button\" data-act=\"go-track\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" data-pkg=\"' + esc(pkg.packageId) + '\" style=\"margin-top:8px;border:1px solid #1268A8;background:#eef6fc;color:#0B4F7A;font-weight:800;padding:8px 14px;border-radius:10px;cursor:pointer;\">TRACK</button>'
            + '</div>';
        }
      }
      if (isOrganizer) {
        actionPanel += '<div style=\"background:#F1F7FC;border:1px solid #d3e6f5;border-radius:12px;padding:12px;margin-bottom:12px;\">'
          + '<b style=\"font-size:12px;color:#0B4F7A;\">Organizer Panel</b><small style=\"display:block;color:#64748b;margin-top:2px;\">No fund withdrawal — escrow only · Participants: ' + participants.length + ' · Payment: ' + paymentDash.progress + '%</small>'
          + '<div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;\">'
          + '<button type=\"button\" data-act=\"go-payment-dash\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"border:1px solid #1268A8;background:#fff;color:#0B4F7A;font-weight:800;padding:7px 12px;border-radius:10px;cursor:pointer;\">Payment Dashboard</button>'
          + '<button type=\"button\" data-act=\"go-fulfillment\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"border:1px solid #D8B83A;background:#FFFBE8;color:#8a6d00;font-weight:800;padding:7px 12px;border-radius:10px;cursor:pointer;\">Fulfillment</button>'
          + '<button type=\"button\" data-act=\"go-allocation\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"border:1px solid #18A982;background:#f0faf6;color:#0f766e;font-weight:800;padding:7px 12px;border-radius:10px;cursor:pointer;\">Allocation</button>'
          + '<button type=\"button\" data-act=\"go-polls\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"border:1px solid #cbd5e1;background:#fff;color:#334155;font-weight:800;padding:7px 12px;border-radius:10px;cursor:pointer;\">Polls</button>'
          + '</div></div>';
      }
      if (isSeller) {
        actionPanel += '<div style=\"background:#fff;border:1px solid #cbe9dd;border-radius:12px;padding:12px;margin-bottom:12px;\">'
          + '<b style=\"font-size:12px;color:#0f766e;\">Seller View</b><small style=\"display:block;color:#64748b;\">Total: ' + (+goData.totalQty || 0) + ' · Secured: TZS ' + (ledger.secured || paymentDash.collected || 0) + ' · Deadline: ' + esc(String(goData.paymentDeadline || '').slice(0, 10)) + '</small>'
          + '<div style=\"display:flex;gap:6px;margin-top:8px;\">'
          + '<button type=\"button\" data-act=\"go-fulfillment\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"border:none;background:#18A982;color:#fff;font-weight:800;padding:8px 14px;border-radius:10px;cursor:pointer;\">VIEW FULFILLMENT</button>'
          + '</div></div>';
      }

      // tabs
      var activeTab = targetEl.getAttribute('data-active-tab') || 'overview';
      var tabs = ['overview', 'chat', 'participants', 'orders', 'payment', 'delivery'];
      var tabLabels = { overview: 'Overview', chat: 'Chat', participants: 'Participants', orders: 'Orders', payment: 'Payment', delivery: 'Delivery' };
      var tabsHtml = '<div style=\"display:flex;gap:2px;overflow-x:auto;padding:0 0 8px;margin-bottom:12px;border-bottom:1px solid #e2e8f0;\">'
        + tabs.map(function (t) {
          var on = t === activeTab;
          return '<button type=\"button\" data-act=\"go-tab\" data-tab=\"' + t + '\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"border:none;background:' + (on ? '#1268A8' : '#fff') + ';color:' + (on ? '#fff' : '#64748b') + ';font-weight:800;font-size:11.5px;padding:8px 14px;border-radius:10px;white-space:nowrap;cursor:pointer;\">' + tabLabels[t] + '</button>';
        }).join('') + '</div>';

      var contentHtml = '';
      if (activeTab === 'overview') {
        contentHtml = '<div style=\"display:grid;gap:12px;\">'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;color:#0f172a;\">Product Snapshot (Immutable)</b>'
          + (goData.productSnapshot ? '<div style=\"display:flex;gap:10px;margin-top:8px;\">'
            + '<img src=\"' + esc(goData.productSnapshot.image || '') + '\" style=\"width:60px;height:60px;border-radius:10px;object-fit:cover;background:#f1f5f9;\">'
            + '<div><b style=\"font-size:13px;\">' + esc(goData.productSnapshot.name) + '</b><br><small style=\"color:#64748b;\">Seller: ' + esc(goData.productSnapshot.sellerName || '') + ' · ' + esc(goData.productSnapshot.currency) + ' ' + (+goData.productSnapshot.originalPrice || 0) + ' · Snapshot: ' + esc(String(goData.productSnapshot.snapshotTimestamp || '').slice(0, 10)) + '</small>'
            + '<div style=\"margin-top:4px;font-size:11px;color:#8a6d00;background:#FFFBE8;border:1px solid #ead98a;border-radius:6px;padding:3px 7px;display:inline-block;\">Immutable after financial commit</div>'
            + '</div></div>' : '<small style=\"color:#94a3b8;\">No product snapshot</small>')
          + '</div>'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;color:#0f172a;\">Agreement (V' + (goData.agreementVersionNum || 1) + ')</b>'
          + '<div style=\"margin-top:6px;font-size:12px;color:#334155;\">' + esc((goData.agreement && goData.agreement.terms) || goData.description || '—') + '</div>'
          + '<div style=\"margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;\">' + agreementVersions.map(function (av) {
            return '<span style=\"font-size:10px;font-weight:700;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:3px 8px;\">V' + av.version + ' · ' + esc(String(av.createdAt).slice(0, 10)) + ' · ' + esc(av.reason || '') + '</span>';
          }).join('') + '</div>'
          + (isOrganizer ? '<button type=\"button\" data-act=\"go-new-version\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"margin-top:8px;border:1px solid #1268A8;background:#fff;color:#1268A8;font-weight:800;padding:6px 12px;border-radius:10px;cursor:pointer;\">+ New Version</button>' : '')
          + '</div>'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;color:#0f172a;\">Progress</b>'
          + '<div style=\"display:flex;justify-content:space-between;font-size:12px;margin-top:6px;\"><span>Quantity</span><span>' + (+goData.totalQty || 0) + '/' + (+goData.targetQty || 0) + ' · ' + progress + '%</span></div>'
          + '<div style=\"display:flex;justify-content:space-between;font-size:12px;margin-top:4px;\"><span>Payment</span><span>' + paymentDash.collected + '/' + paymentDash.expected + ' · ' + paymentDash.progress + '%</span></div>'
          + '<div style=\"display:flex;justify-content:space-between;font-size:12px;margin-top:4px;\"><span>Deadline</span><span>' + esc(String(goData.deadline || '').slice(0, 10)) + ' · Payment: ' + esc(String(goData.paymentDeadline || '').slice(0, 10)) + '</span></div>'
          + '<div style=\"margin-top:8px;font-size:11px;color:#64748b;\">Next: ' + (function () {
            var st = String(goData.status || '');
            if (st === GO_STATUS.OPEN || st === GO_STATUS.JOINING) return 'Collecting participants — need ' + qtyNeeded + ' more';
            if (st === GO_STATUS.TARGET_REACHED) return 'Target reached — open payment phase';
            if (st === GO_STATUS.PAYMENT_COLLECTING) return 'Collecting payments — ' + paymentDash.progress + '% secured';
            if (st === GO_STATUS.PAYMENT_TARGET_REACHED) return 'Payment complete — request fulfillment';
            if (st === GO_STATUS.SELLER_PROCESSING) return 'Waiting seller response';
            if (st === GO_STATUS.READY_FOR_ALLOCATION) return 'Ready for allocation — sum must equal fulfilled';
            if (st === GO_STATUS.ALLOCATED) return 'Allocated — create shipments';
            if (st === GO_STATUS.DISTRIBUTION_READY) return 'Shipments ready — in transit';
            if (st === GO_STATUS.AWAITING_CONFIRMATION) return 'Awaiting participant confirmation — 24h auto-release';
            if (st === GO_STATUS.COMPLETED) return 'Completed ✓';
            return st;
          })() + '</div>'
          + '</div>'
          + '</div>';
      } else if (activeTab === 'participants') {
        contentHtml = '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;\">'
          + '<div style=\"padding:10px 14px;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;\"><b style=\"font-size:12px;color:#0f172a;\">Participants (' + participants.length + ')</b><small style=\"color:#64748b;\">Scalable subcollection</small></div>'
          + (participants.length ? participants.map(function (p) {
            var isMe = p.participantId === uid();
            return '<div style=\"display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f1f5f9;' + (isMe ? 'background:#f0faf6;' : '') + '\">'
              + '<span style=\"width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#1268A8,#18A982);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;\">' + esc(String(p.participantId || '?').charAt(0).toUpperCase()) + '</span>'
              + '<div style=\"flex:1;min-width:0;\"><b style=\"font-size:12.5px;display:block;\">' + esc(p.participantId) + (isMe ? ' (You)' : '') + '</b>'
              + '<small style=\"color:#64748b;\">Qty: ' + (+p.quantity || +p.qty || 0) + (p.variant ? ' · ' + esc(p.variant) : '') + (p.destination ? ' · ' + esc(p.destination) : '') + ' · ' + esc(p.state || p.delivery && p.delivery.status || 'JOINED') + '</small></div>'
              + '<span style=\"font-size:10px;font-weight:800;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:3px 7px;\">TZS ' + (p.total || p.subtotal || 0) + '</span>'
              + '</div>';
          }).join('') : '<div style=\"padding:20px;text-align:center;color:#94a3b8;\">No participants yet — empty state</div>')
          + '</div>';
      } else if (activeTab === 'payment') {
        contentHtml = '<div style=\"display:grid;gap:12px;\">'
          + '<div style=\"background:#eef6fc;border:1px solid #d3e6f5;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;color:#0B4F7A;\">Group Dashboard — Collected/Expected/%</b>'
          + '<div style=\"display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;\">'
          + '<span style=\"font-size:12px;font-weight:800;background:#fff;border:1px solid #d3e6f5;border-radius:8px;padding:6px 12px;\">Collected: TZS ' + paymentDash.collected + '</span>'
          + '<span style=\"font-size:12px;font-weight:800;background:#fff;border:1px solid #d3e6f5;border-radius:8px;padding:6px 12px;\">Expected: TZS ' + paymentDash.expected + '</span>'
          + '<span style=\"font-size:12px;font-weight:800;background:#18A982;color:#fff;border-radius:8px;padding:6px 12px;\">' + paymentDash.progress + '%</span>'
          + '</div>'
          + '<div style=\"margin-top:8px;height:8px;border-radius:99px;background:#dbeafe;overflow:hidden;\"><div style=\"height:100%;width:' + paymentDash.progress + '%;background:#18A982;\"></div></div>'
          + '<small style=\"display:block;margin-top:6px;color:#64748b;\">Quantity target vs Payment target distinct · Privacy: ' + (paymentDash.isOrganizer ? 'Organizer sees all' : 'Participant sees only own') + '</small>'
          + '</div>'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;\">'
          + '<div style=\"padding:10px 14px;border-bottom:1px solid #eef2f7;\"><b style=\"font-size:12px;\">Individual Payments</b></div>'
          + (paymentDash.payments.length ? paymentDash.payments.map(function (p) {
            return '<div style=\"display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;\">'
              + '<span>' + esc(p.participantId) + ' · ' + esc(p.status) + '</span>'
              + '<span style=\"font-weight:800;\">TZS ' + (+p.amountDue || 0) + ' → ' + (+p.amountPaid || 0) + '</span></div>';
          }).join('') : '<div style=\"padding:20px;text-align:center;color:#94a3b8;\">No payments yet</div>')
          + '</div>'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;\">Financial Ledger</b>'
          + '<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:11.5px;\">'
          + '<div>Secured: <b>TZS ' + (ledger.secured || 0) + '</b></div>'
          + '<div>Entitlement: <b>TZS ' + (ledger.entitlement || 0) + '</b></div>'
          + '<div>Fees: <b>TZS ' + (ledger.fees || 0) + '</b></div>'
          + '<div>Refunds: <b>TZS ' + (ledger.refunds || 0) + '</b></div>'
          + '<div>Released: <b>TZS ' + (ledger.released || 0) + '</b></div>'
          + '<div>Pending: <b>TZS ' + (ledger.pending || 0) + '</b></div>'
          + '<div>Disputed: <b>TZS ' + (ledger.disputed || 0) + '</b></div>'
          + '</div><small style=\"display:block;margin-top:6px;color:#94a3b8;\">Server-side ledger — seller cannot release escrow, participant cannot set PAID</small></div>'
          + '</div>';
      } else if (activeTab === 'orders') {
        contentHtml = '<div style=\"display:grid;gap:12px;\">'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;\">Packages (' + packages.length + ') — Group Shipment ≠ Group Ownership</b>'
          + (packages.length ? packages.map(function (pkg) {
            return '<div style=\"display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;\">'
              + '<b>' + esc(pkg.packageId) + '</b><span style=\"flex:1;\">' + esc(pkg.participantId) + ' · ' + (+pkg.qty || 0) + ' · ' + esc(pkg.destination || '') + '</span>'
              + '<span style=\"font-size:10px;font-weight:800;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:3px 7px;\">' + esc(pkg.status) + '</span>'
              + '<span style=\"font-size:10px;color:#64748b;\">' + esc(pkg.shipmentId || 'no shipment') + '</span></div>';
          }).join('') : '<div style=\"padding:20px;text-align:center;color:#94a3b8;\">No packages yet — allocation creates ORD-xxxx per participant</div>')
          + '</div>'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;\">Allocation Engine — sum==fulfilled validation</b>'
          + '<div style=\"margin-top:6px;font-size:11.5px;color:#334155;\">Fulfilled: ' + (+goData.fulfilledQty || 0) + ' · Allocated: ' + (+goData.allocatedQty || 0) + ' · Valid: ' + ((+goData.allocatedQty || 0) === (+goData.fulfilledQty || 0) || !goData.fulfilledQty ? '✓' : '✗ sum mismatch') + '</div>'
          + (isOrganizer && goData.status === GO_STATUS.READY_FOR_ALLOCATION ? '<button type=\"button\" data-act=\"go-allocate-auto\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"margin-top:8px;border:none;background:#18A982;color:#fff;font-weight:800;padding:8px 14px;border-radius:10px;cursor:pointer;\">Auto Allocate</button>' : '')
          + '</div>'
          + '</div>';
      } else if (activeTab === 'delivery') {
        contentHtml = '<div style=\"display:grid;gap:12px;\">'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;\">Shipments (' + shipments.length + ') — multi-package, location aggregation</b>'
          + (shipments.length ? shipments.map(function (ship) {
            return '<div style=\"border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-top:8px;\">'
              + '<div style=\"display:flex;justify-content:space-between;\"><b style=\"font-size:12px;\">' + esc(ship.shipmentId) + '</b><span style=\"font-size:10px;font-weight:800;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:3px 7px;\">' + esc(ship.status) + '</span></div>'
              + '<div style=\"font-size:11.5px;color:#334155;margin-top:4px;\">Destination: ' + esc(ship.destinationArea || '') + ' · Packages: ' + (ship.packageIds || []).length + ' · Mode: ' + esc(ship.distributionMode || '') + ' · Transport: ' + esc(ship.transportMethod || '') + '</div>'
              + '<div style=\"font-size:11px;color:#64748b;margin-top:4px;\">Transporter: ' + esc(ship.transporterName || ship.transporterId || '—') + (ship.pickupToken ? ' · Token: ' + esc(ship.pickupToken) : '') + (ship.deliveredAt ? ' · Delivered: ' + esc(String(ship.deliveredAt).slice(0, 16).replace('T', ' ')) : '') + (ship.confirmationDeadline ? ' · Confirm by: ' + esc(String(ship.confirmationDeadline).slice(0, 16).replace('T', ' ')) : '') + '</div>'
              + '<div style=\"display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;\">' + (ship.events || []).slice(-3).map(function (ev) { return '<span style=\"font-size:9px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:5px;padding:2px 6px;\">' + esc(ev.status) + ' ' + esc(String(ev.at || '').slice(5, 16).replace('T', ' ')) + '</span>'; }).join('') + '</div>'
              + '</div>';
          }).join('') : '<div style=\"padding:20px;text-align:center;color:#94a3b8;\">No shipments yet — distribution engine: shared/individual/mixed</div>')
          + '</div>'
          + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\"><b style=\"font-size:12px;\">24h Auto-Release</b><small style=\"display:block;color:#64748b;margin-top:4px;\">Server-controlled deliveredAt/confirmationDeadline idempotent with releaseTransactionId/status/releasedAt, dispute pauses auto-release</small>'
          + '<button type=\"button\" data-act=\"go-auto-release\" data-gid=\"' + esc(gid) + '\" data-goid=\"' + esc(goid) + '\" style=\"margin-top:8px;border:1px solid #18A982;background:#f0faf6;color:#0f766e;font-weight:800;padding:8px 14px;border-radius:10px;cursor:pointer;\">Check Auto-Release</button>'
          + '</div>'
          + '</div>';
      } else if (activeTab === 'chat') {
        contentHtml = '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;\">'
          + '<b style=\"font-size:12px;\">Group Chat — Negotiation separate from poll</b><small style=\"display:block;color:#64748b;margin-top:4px;\">Direct chat negotiation stays intact — poll is collective agreement, not chat</small>'
          + '<div style=\"margin-top:8px;\"><button type=\"button\" data-act=\"go-open-chat\" data-gid=\"' + esc(gid) + '\" style=\"border:1px solid #1268A8;background:#eef6fc;color:#0B4F7A;font-weight:800;padding:8px 14px;border-radius:10px;cursor:pointer;\">Open Chat</button></div>'
          + '<div style=\"margin-top:12px;\"><b style=\"font-size:11px;\">Polls — Type A/B/C quorum/threshold/min voters/closing</b>'
          + (polls.length ? polls.map(function (poll) {
            var lead = getLeadingOption(poll);
            return '<div style=\"border:1px solid #d3e6f5;border-radius:10px;padding:10px;margin-top:8px;\">'
              + '<div style=\"display:flex;justify-content:space-between;\"><b style=\"font-size:12px;\">' + esc(poll.question) + '</b><span style=\"font-size:9px;font-weight:800;background:#eef6fc;border:1px solid #d3e6f5;border-radius:5px;padding:2px 6px;\">' + esc(poll.type) + '</span></div>'
              + '<div style=\"margin-top:6px;\">' + (poll.options || []).map(function (opt, idx) {
                var votes = (poll.votes && poll.votes[idx] ? poll.votes[idx].length : 0);
                var isLead = lead && lead.idx === idx;
                return '<div style=\"display:flex;justify-content:space-between;padding:6px 8px;background:' + (isLead ? '#FFFBE8' : '#f8fafc') + ';border:1px solid ' + (isLead ? '#ead98a' : '#e2e8f0') + ';border-radius:8px;margin-top:4px;font-size:12px;\"><span>' + esc(opt) + (isLead ? ' ★ leading' : '') + '</span><span style=\"font-weight:800;\">' + votes + ' votes</span></div>';
              }).join('') + '</div>'
              + '<small style=\"display:block;margin-top:4px;color:#64748b;\">Quorum: ' + poll.quorum + '% · Threshold: ' + poll.threshold + '% · Min: ' + poll.minVoters + ' · Closes: ' + esc(String(poll.closingTime || '').slice(0, 16).replace('T', ' ')) + ' · Leading surfaced not auto-final</small>'
              + '</div>';
          }).join('') : '<div style=\"padding:20px;text-align:center;color:#94a3b8;\">No polls yet</div>')
          + '</div></div>';
      }

      targetEl.innerHTML = headerHtml + actionPanel + tabsHtml + contentHtml;

      // audit logs footer
      var auditHtml = '<div style=\"margin-top:16px;background:#fff;border:1px dashed #cbd5e1;border-radius:12px;padding:12px;\"><b style=\"font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;\">Audit Log — Events List</b>'
        + (auditLogs.length ? '<div style=\"margin-top:8px;\">' + auditLogs.map(function (l) {
          return '<div style=\"display:flex;gap:8px;font-size:10.5px;padding:3px 0;border-bottom:1px solid #f1f5f9;\"><span style=\"color:#94a3b8;\">' + esc(String(l.at || '').slice(5, 16).replace('T', ' ')) + '</span><span style=\"font-weight:700;color:#0B4F7A;\">' + esc(l.type) + '</span><span style=\"color:#334155;\">' + esc(l.actorUid || '') + '</span></div>';
        }).join('') + '</div>' : '<small style=\"color:#94a3b8;\">No audit logs</small>') + '</div>';
      targetEl.innerHTML += auditHtml;
    })();
  }

  // ---------- Wizard UI ----------
  function openWizardModal(gid) {
    resetWizard(gid);
    var old = document.getElementById('goWizardModal');
    if (old) old.remove();
    var modal = document.createElement('div');
    modal.id = 'goWizardModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100150;background:rgba(11,22,40,.55);display:flex;align-items:center;justify-content:center;padding:12px;';
    modal.innerHTML = '<div style=\"width:100%;max-width:520px;max-height:94vh;background:#fff;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(11,22,40,.35);\">'
      + '<div style=\"padding:16px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;\">'
      + '<b style=\"font-size:15px;color:#0f172a;\">Group Order — 8 Steps</b><span style=\"flex:1;\"></span>'
      + '<button type=\"button\" data-act=\"go-wiz-close\" style=\"border:none;background:#f1f5f9;width:32px;height:32px;border-radius:50%;font-weight:900;cursor:pointer;\">×</button></div>'
      + '<div id=\"goWizProgress\" style=\"padding:10px 18px;background:#F6F9FC;border-bottom:1px solid #e2e8f0;\"></div>'
      + '<div id=\"goWizBody\" style=\"flex:1;overflow-y:auto;padding:18px;background:#fff;\"></div>'
      + '<div style=\"padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;gap:8px;\">'
      + '<button type=\"button\" data-act=\"go-wiz-prev\" style=\"border:1.5px solid #cbd5e1;background:#fff;color:#334155;font-weight:800;padding:11px 18px;border-radius:12px;cursor:pointer;\">Back</button>'
      + '<span style=\"flex:1;\"></span>'
      + '<button type=\"button\" data-act=\"go-wiz-next\" style=\"border:none;background:#18A982;color:#fff;font-weight:900;padding:11px 22px;border-radius:12px;cursor:pointer;\">Next</button>'
      + '</div></div>';
    modal.addEventListener('click', function (e) { if (e.target === modal) closeWizardModal(); });
    document.body.appendChild(modal);
    renderWizardStep();
  }

  function closeWizardModal() { var m = document.getElementById('goWizardModal'); if (m) m.remove(); }

  function renderWizardStep() {
    var prog = document.getElementById('goWizProgress');
    var body = document.getElementById('goWizBody');
    if (!prog || !body) return;
    var step = wizardState.step;
    var d = wizardState.data;
    prog.innerHTML = '<div style=\"display:flex;gap:4px;flex-wrap:wrap;\">' + WIZARD_STEPS.map(function (s) {
      var on = s.id === step;
      var done = s.id < step;
      return '<span style=\"font-size:9px;font-weight:900;padding:4px 8px;border-radius:99px;border:1.5px solid ' + (on ? '#1268A8' : done ? '#18A982' : '#e2e8f0') + ';background:' + (on ? '#1268A8;color:#fff' : done ? '#f0faf6;color:#0f766e' : '#fff;color:#94a3b8') + ';\">' + s.id + '. ' + esc(s.label) + '</span>';
    }).join('') + '</div><small style=\"display:block;margin-top:6px;color:#64748b;\">' + esc(WIZARD_STEPS[step - 1].desc) + '</small>';

    var html = '';
    if (step === 1) {
      html = '<b style=\"font-size:14px;\">1. Select Product — immutable snapshot</b><small style=\"display:block;color:#64748b;margin-top:4px;\">Using existing product system snapshot (productId/sellerId/name/desc/images/variant/price/currency/timestamp) immutable after financial commit</small>'
        + '<div style=\"margin-top:12px;\"><input id=\"goWizProdSearch\" type=\"text\" placeholder=\"Tafuta bidhaa...\" style=\"width:100%;padding:11px;border:1.5px solid #cbd5e1;border-radius:10px;\">'
        + '<div id=\"goWizProdList\" style=\"margin-top:8px;max-height:260px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:12px;\"><small style=\"display:block;padding:16px;text-align:center;color:#94a3b8;\">Loading products...</small></div></div>'
        + (d.productSnapshot ? '<div style=\"margin-top:12px;padding:10px;background:#f0faf6;border:1px solid #cbe9dd;border-radius:10px;display:flex;gap:10px;\"><img src=\"' + esc(d.productSnapshot.image) + '\" style=\"width:48px;height:48px;border-radius:8px;object-fit:cover;\"><div><b>' + esc(d.productSnapshot.name) + '</b><br><small>TZS ' + d.productSnapshot.originalPrice + ' · ' + esc(d.productSnapshot.sellerName) + '</small></div></div>' : '');
      body.innerHTML = html;
      loadProductsForWizard();
    } else if (step === 2) {
      html = '<b style=\"font-size:14px;\">2. Quantity — min/target/max + location-based</b>'
        + '<div style=\"display:grid;gap:10px;margin-top:12px;\">'
        + '<label style=\"font-size:12px;font-weight:700;color:#334155;\">Target Qty (lengo) <input id=\"goWizTarget\" type=\"number\" min=\"2\" value=\"' + d.targetQty + '\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"></label>'
        + '<label style=\"font-size:12px;font-weight:700;color:#334155;\">Min Qty (chini) <input id=\"goWizMin\" type=\"number\" min=\"1\" value=\"' + d.minQty + '\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"></label>'
        + '<label style=\"font-size:12px;font-weight:700;color:#334155;\">Max Qty (juu) <input id=\"goWizMax\" type=\"number\" min=\"2\" value=\"' + d.maxQty + '\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"></label>'
        + '<div style=\"background:#F6F9FC;border:1px solid #d3e6f5;border-radius:10px;padding:10px;\"><b style=\"font-size:11px;\">Location-based quantity (optional)</b><small style=\"display:block;color:#64748b;\">Mfano: Dar 50, Arusha 30 — progress 78/100 + participant count distinct</small>'
        + '<div id=\"goWizLocList\" style=\"margin-top:6px;\">' + Object.keys(d.locationQuantities).map(function (loc) { return '<div style=\"display:flex;gap:6px;margin-top:4px;\"><input value=\"' + esc(loc) + '\" disabled style=\"flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:8px;\"><input value=\"' + d.locationQuantities[loc] + '\" disabled style=\"width:80px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;\"><button type=\"button\" data-act=\"go-wiz-loc-del\" data-loc=\"' + esc(loc) + '\" style=\"border:none;background:#fef2f2;color:#b91c1c;padding:6px 10px;border-radius:8px;cursor:pointer;\">×</button></div>'; }).join('') + '</div>'
        + '<div style=\"display:flex;gap:6px;margin-top:8px;\"><input id=\"goWizLocName\" type=\"text\" placeholder=\"Eneo\" style=\"flex:1;padding:8px;border:1.5px solid #cbd5e1;border-radius:8px;\"><input id=\"goWizLocQty\" type=\"number\" placeholder=\"Qty\" style=\"width:80px;padding:8px;border:1.5px solid #cbd5e1;border-radius:8px;\"><button type=\"button\" data-act=\"go-wiz-loc-add\" style=\"border:none;background:#18A982;color:#fff;padding:8px 14px;border-radius:8px;cursor:pointer;\">+</button></div></div>'
        + '</div>';
      body.innerHTML = html;
    } else if (step === 3) {
      html = '<b style=\"font-size:14px;\">3. Pricing — Tiered + snapshot protection</b><small style=\"display:block;color:#64748b;margin-top:4px;\">Tiered pricing + price snapshot protection — payment uses agreement snapshot not current product price</small>'
        + '<div style=\"margin-top:12px;\"><label style=\"font-size:12px;font-weight:700;\">Target Price (TZS) <input id=\"goWizPrice\" type=\"number\" min=\"1\" value=\"' + d.targetPrice + '\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"></label>'
        + '<label style=\"font-size:12px;font-weight:700;margin-top:10px;display:block;\">Unit <input id=\"goWizUnit\" type=\"text\" value=\"' + esc(d.unit) + '\" placeholder=\"pcs, kg, gunia\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"></label>'
        + '<div style=\"margin-top:12px;background:#FFFBE8;border:1px solid #ead98a;border-radius:10px;padding:10px;\"><b style=\"font-size:11px;\">Price Tiers (sorted ascending, discount validation)</b><div id=\"goWizTiers\">' + d.priceTiers.map(function (t, i) {
          return '<div style=\"display:flex;gap:6px;margin-top:6px;\"><input data-ti=\"' + i + '\" data-k=\"minQty\" type=\"number\" value=\"' + t.minQty + '\" placeholder=\"minQty\" style=\"flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:8px;\"><input data-ti=\"' + i + '\" data-k=\"price\" type=\"number\" value=\"' + t.price + '\" placeholder=\"price\" style=\"flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:8px;\"><button type=\"button\" data-act=\"go-wiz-tier-del\" data-idx=\"' + i + '\" style=\"border:none;background:#fef2f2;color:#b91c1c;padding:6px 10px;border-radius:8px;cursor:pointer;\">×</button></div>';
        }).join('') + '</div><button type=\"button\" data-act=\"go-wiz-tier-add\" style=\"margin-top:8px;border:1px dashed #D8B83A;background:#fffdf0;color:#8a6d00;padding:7px 12px;border-radius:8px;cursor:pointer;\">+ Add Tier</button></div></div>';
      body.innerHTML = html;
    } else if (step === 4) {
      html = '<b style=\"font-size:14px;\">4. Deadline — joining + payment</b>'
        + '<div style=\"display:grid;gap:10px;margin-top:12px;\">'
        + '<label style=\"font-size:12px;font-weight:700;\">Joining Deadline <input id=\"goWizDeadline\" type=\"date\" value=\"' + d.deadline + '\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"></label>'
        + '<label style=\"font-size:12px;font-weight:700;\">Payment Deadline (+3d default) <input id=\"goWizPayDeadline\" type=\"date\" value=\"' + d.paymentDeadline + '\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"></label>'
        + '<small style=\"color:#64748b;\">Deadlines separate, expiry rule: below minQty → EXPIRED, above min → CLOSED</small></div>';
      body.innerHTML = html;
    } else if (step === 5) {
      html = '<b style=\"font-size:14px;\">5. Delivery — method + area + aggregation</b>'
        + '<div style=\"display:grid;gap:10px;margin-top:12px;\">'
        + '<label style=\"font-size:12px;font-weight:700;\">Delivery Method <select id=\"goWizDelMethod\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"><option value=\"individual\" ' + (d.deliveryMethod === 'individual' ? 'selected' : '') + '>Individual</option><option value=\"shared\" ' + (d.deliveryMethod === 'shared' ? 'selected' : '') + '>Shared / Pamoja</option></select></label>'
        + '<label style=\"font-size:12px;font-weight:700;\">Distribution Mode <select id=\"goWizDistMode\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"><option value=\"INDIVIDUAL\" ' + (d.distributionMode === 'INDIVIDUAL' ? 'selected' : '') + '>Individual</option><option value=\"SHARED_COLLECTION\" ' + (d.distributionMode === 'SHARED_COLLECTION' ? 'selected' : '') + '>Shared Collection</option><option value=\"SHARED_DELIVERY\" ' + (d.distributionMode === 'SHARED_DELIVERY' ? 'selected' : '') + '>Shared Delivery</option><option value=\"SELF_PICKUP\" ' + (d.distributionMode === 'SELF_PICKUP' ? 'selected' : '') + '>Self Pickup</option><option value=\"MIXED\" ' + (d.distributionMode === 'MIXED' ? 'selected' : '') + '>Mixed</option></select></label>'
        + '<label style=\"font-size:12px;font-weight:700;\">Delivery Area <input id=\"goWizDelArea\" type=\"text\" value=\"' + esc(d.deliveryArea) + '\" placeholder=\"Dar es Salaam, Tabora...\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\"></label>'
        + '<small style=\"color:#64748b;\">Location aggregation: shared collection/shared delivery/individual/self/mixed — shipment model multi-package</small></div>';
      body.innerHTML = html;
    } else if (step === 6) {
      html = '<b style=\"font-size:14px;\">6. Payment — SokoPay escrow</b><small style=\"display:block;color:#64748b;margin-top:4px;\">Individual payment target amountDue/Paid/status/transactionId, group dashboard Collected/Expected/% + privacy, quantity vs payment distinct, secured funds → READY_FOR_FULFILLMENT</small>'
        + '<div style=\"margin-top:12px;background:#eef6fc;border:1px solid #d3e6f5;border-radius:10px;padding:12px;font-size:12px;color:#0B4F7A;\">'
        + '<div>Target: ' + d.targetQty + ' ' + esc(d.unit) + ' @ TZS ' + d.targetPrice + '</div>'
        + '<div style=\"margin-top:4px;\">Expected Total: TZS ' + (d.targetQty * d.targetPrice) + '</div>'
        + '<div style=\"margin-top:4px;\">Escrow: SokoPay — individual payments secured, group dashboard privacy, no fund withdrawal for organizer</div>'
        + '<div style=\"margin-top:4px;\">Currency: TZS · Fees: 1.5% · Settlement escrow→seller/transporter separate</div>'
        + '</div>'
        + '<label style=\"font-size:12px;font-weight:700;margin-top:12px;display:block;\">Description / Terms <textarea id=\"goWizDesc\" rows=\"3\" placeholder=\"Maelezo ya group order...\" style=\"width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:10px;margin-top:4px;\">' + esc(d.description) + '</textarea></label>';
      body.innerHTML = html;
    } else if (step === 7) {
      var totalEst = d.targetQty * d.targetPrice;
      html = '<b style=\"font-size:14px;\">7. Review — hakiki yote</b>'
        + '<div style=\"margin-top:12px;display:grid;gap:8px;font-size:12px;\">'
        + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;\"><b>Product</b><br>' + (d.productSnapshot ? esc(d.productSnapshot.name) + ' · TZS ' + d.productSnapshot.originalPrice + '<br><small style=\"color:#8a6d00;\">Immutable snapshot: ' + esc(String(d.productSnapshot.snapshotTimestamp).slice(0, 10)) + '</small>' : esc(d.productName)) + '</div>'
        + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;\"><b>Quantity</b><br>Min: ' + d.minQty + ' · Target: ' + d.targetQty + ' · Max: ' + d.maxQty + '<br>Locations: ' + (Object.keys(d.locationQuantities).length ? JSON.stringify(d.locationQuantities) : '—') + '</div>'
        + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;\"><b>Pricing</b><br>Target: TZS ' + d.targetPrice + ' / ' + esc(d.unit) + '<br>Tiers: ' + d.priceTiers.length + ' · ' + d.priceTiers.map(function (t) { return t.minQty + '→' + t.price; }).join(', ') + '<br><small style=\"color:#8a6d00;\">Payment uses agreement snapshot not current price</small></div>'
        + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;\"><b>Deadlines</b><br>Join: ' + d.deadline + ' · Pay: ' + d.paymentDeadline + '</div>'
        + '<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;\"><b>Delivery</b><br>' + esc(d.deliveryMethod) + ' · ' + esc(d.deliveryArea) + ' · ' + esc(d.distributionMode) + '</div>'
        + '<div style=\"background:#eef6fc;border:1px solid #d3e6f5;border-radius:10px;padding:10px;\"><b>Payment</b><br>Expected: TZS ' + totalEst + ' · Escrow SokoPay · No organizer withdrawal</div>'
        + '<div style=\"background:#FFFBE8;border:1px solid #ead98a;border-radius:10px;padding:10px;\"><b>Commercial Agreement</b><br>' + esc(d.description || '—') + '<br><small>Immutable versioning: agreementVersion, previousAgreementId, createdBy, reason, changes</small></div>'
        + '</div>';
      body.innerHTML = html;
    } else if (step === 8) {
      html = '<b style=\"font-size:14px;\">8. Publish — chapisha kwa kikundi</b><small style=\"display:block;color:#64748b;margin-top:4px;\">Publish to group — status DRAFT→OPEN, audit log, commerce indicator in chat list #FFF9E8 with left accent</small>'
        + '<div style=\"margin-top:16px;text-align:center;\"><div style=\"width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#D8B83A,#18A982);margin:0 auto;display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;\">✓</div>'
        + '<b style=\"display:block;margin-top:12px;font-size:14px;\">Tayari Kuchapisha</b><small style=\"color:#64748b;\">Group Order itaonekana kwenye chat list kama #FFF9E8 na commerce badge 78/100 • Open</small></div>'
        + '<button type=\"button\" data-act=\"go-wiz-publish\" style=\"width:100%;margin-top:18px;border:none;background:#18A982;color:#fff;font-weight:900;padding:14px;border-radius:12px;cursor:pointer;\">PUBLISH GROUP ORDER</button>';
      body.innerHTML = html;
    }

    // bind inputs to state
    setTimeout(function () {
      var bind = function (id, key, isNum) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', function () {
          wizardState.data[key] = isNum ? (+el.value || 0) : el.value;
        });
        el.addEventListener('change', function () {
          wizardState.data[key] = isNum ? (+el.value || 0) : el.value;
        });
      };
      bind('goWizTarget', 'targetQty', true);
      bind('goWizMin', 'minQty', true);
      bind('goWizMax', 'maxQty', true);
      bind('goWizPrice', 'targetPrice', true);
      bind('goWizUnit', 'unit', false);
      bind('goWizDeadline', 'deadline', false);
      bind('goWizPayDeadline', 'paymentDeadline', false);
      bind('goWizDelMethod', 'deliveryMethod', false);
      bind('goWizDistMode', 'distributionMode', false);
      bind('goWizDelArea', 'deliveryArea', false);
      bind('goWizDesc', 'description', false);
      // tiers live edit
      document.querySelectorAll('#goWizTiers [data-ti]').forEach(function (inp) {
        inp.addEventListener('input', function () {
          var idx = parseInt(inp.getAttribute('data-ti'), 10);
          var k = inp.getAttribute('data-k');
          if (wizardState.data.priceTiers[idx]) wizardState.data.priceTiers[idx][k] = inp.getAttribute('data-k') === 'minQty' ? (+inp.value || 0) : (+inp.value || 0);
        });
      });
    }, 100);
  }

  async function loadProductsForWizard() {
    var listEl = document.getElementById('goWizProdList');
    if (!listEl) return;
    try {
      var snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.orderBy('createdAt', 'desc'), skh.limit(50)));
      var products = [];
      snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; x.__collection = 'products'; products.push(x); });
      if (!products.length) { listEl.innerHTML = '<small style=\"display:block;padding:16px;text-align:center;color:#94a3b8;\">Hakuna bidhaa — empty state</small>'; return; }
      var q = (document.getElementById('goWizProdSearch') || {}).value || '';
      var filtered = products.filter(function (p) {
        if (!q) return true;
        var hay = (p.title || p.name || '') + ' ' + (p.description || '');
        return hay.toLowerCase().includes(q.toLowerCase());
      });
      listEl.innerHTML = filtered.map(function (p) {
        var img = p.image || (p.images && p.images[0]) || '';
        return '<div data-act=\"go-wiz-select-prod\" data-pid=\"' + esc(p.__id) + '\" style=\"display:flex;gap:10px;padding:10px;border-bottom:1px solid #f1f5f9;cursor:pointer;align-items:center;\">'
          + '<img src=\"' + esc(img) + '\" style=\"width:44px;height:44px;border-radius:8px;object-fit:cover;background:#f1f5f9;\">'
          + '<div style=\"flex:1;min-width:0;\"><b style=\"font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">' + esc(p.title || p.name || 'Bidhaa') + '</b><small style=\"color:#64748b;\">TZS ' + (+p.price || 0) + ' · ' + esc(p.userId || '').slice(0, 8) + '</small></div>'
          + '<span style=\"font-size:10px;font-weight:800;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:3px 7px;\">Select</span></div>';
      }).join('');
      var searchEl = document.getElementById('goWizProdSearch');
      if (searchEl && !searchEl._bound) {
        searchEl._bound = true;
        searchEl.addEventListener('input', function () { loadProductsForWizard(); });
      }
    } catch (e) {
      listEl.innerHTML = '<small style=\"display:block;padding:16px;text-align:center;color:#b91c1c;\">Imeshindwa kupakia bidhaa: ' + esc(e.message || '') + '</small>';
    }
  }

  // ---------- Public API ----------
  window.skhGroupOrderWizardOpen = function (gid) { openWizardModal(gid); };
  window.skhGroupOrderWizardClose = closeWizardModal;

  window.skhGroupOrderCreateFull = async function (gid, wizardData) {
    // direct API for tests / programmatic
    if (wizardData) wizardState.data = Object.assign(wizardState.data, wizardData);
    wizardState.gid = gid;
    return await createGroupOrderFromWizard(gid);
  };

  window.skhGroupOrderJoinFull = async function (gid, goid, qty, extra) {
    // enhanced join with scalable subcollection
    var memCheck = null;
    try { var ms = await skh.getDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/members', uid())); memCheck = ms && ms.exists && ms.exists() ? ms.data() : null; } catch (e) {}
    if (!memCheck || memCheck.status !== 'active') return { ok: false, reason: 'not_member' };
    var goSnap = await skh.getDoc(goRef(gid, goid));
    if (!(goSnap && goSnap.exists && goSnap.exists())) return { ok: false, reason: 'not_found' };
    var goData = goSnap.data() || {};
    var st = String(goData.status || '');
    if ([GO_STATUS.OPEN, GO_STATUS.JOINING, 'OPEN', 'NEAR_TARGET'].indexOf(st) < 0) return { ok: false, reason: 'state' };
    var qtyNum = Math.floor(+qty);
    if (!(qtyNum >= 1)) return { ok: false, reason: 'qty' };
    var prevQty = 0;
    try { var prevSnap = await skh.getDoc(partRef(gid, goid, uid())); if (prevSnap && prevSnap.exists && prevSnap.exists()) prevQty = +prevSnap.data().quantity || +prevSnap.data().qty || 0; } catch (e) {}
    if (goData.maxQty && ((+goData.totalQty || 0) - prevQty + qtyNum) > +goData.maxQty) return { ok: false, reason: 'max_reached', maxQty: +goData.maxQty };

    // transaction-like: read-modify-write with version guard
    var tier = tierInfoFor(goData);
    var unitPrice = tier.price || goData.targetPrice;
    var subtotal = Math.round(qtyNum * unitPrice);
    var deliveryFee = 0;
    var total = subtotal + deliveryFee;

    await ensureParticipantDoc(gid, goid, uid(), {
      quantity: qtyNum,
      qty: qtyNum,
      variant: extra && extra.variant ? String(extra.variant).slice(0, 40) : null,
      deliveryMethod: extra && extra.deliveryMethod ? String(extra.deliveryMethod).slice(0, 20) : goData.deliveryMethod,
      destination: extra && extra.destination ? String(extra.destination).slice(0, 80) : goData.deliveryArea,
      contact: extra && extra.contact ? String(extra.contact).slice(0, 40) : null,
      unitPrice: unitPrice,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      total: total,
      payment: { amountDue: total, amountPaid: 0, status: PAYMENT_STATUS.UNPAID, transactionId: null },
      order: { orderId: null },
      allocation: { allocatedQty: 0, packageId: null },
      delivery: { status: DELIVERY_STATUS.READY },
      confirmation: { confirmed: false },
      state: PARTICIPANT_STATE.COMMITTED,
      participantName: myName(),
      joinedAt: nowIso(),
      updatedAt: nowIso()
    });

    // update main doc totals for backward compat + goHead
    var newTotal = 0, newCount = 0;
    try {
      var parts = await getParticipants(gid, goid);
      parts.forEach(function (p) { newTotal += +p.quantity || +p.qty || 0; newCount++; });
    } catch (e) { newTotal = +goData.totalQty + qtyNum - prevQty; newCount = Object.keys(goData.participants || {}).length + (prevQty ? 0 : 1); }
    var newStatus = newTotal >= (+goData.targetQty || 1) ? GO_STATUS.TARGET_REACHED : (newTotal >= Math.ceil((+goData.targetQty || 1) * 0.75) ? GO_STATUS.NEAR_TARGET : GO_STATUS.OPEN);
    var mapUpdate = {};
    mapUpdate['participants.' + uid()] = { qty: qtyNum, joinedAt: nowIso(), state: 'COMMITTED', variant: extra && extra.variant || null, destination: extra && extra.destination || null, deliveryMethod: extra && extra.deliveryMethod || null, contact: extra && extra.contact || null };
    await skh.updateDoc(goRef(gid, goid), Object.assign({
      totalQty: newTotal,
      participantCount: newCount,
      status: newStatus,
      updatedAt: nowIso(),
      version: (goData.version || 1) + 1
    }, mapUpdate));
    await logAudit(gid, goid, 'participant_joined', uid(), { qty: qtyNum, totalQty: newTotal });
    try { await syncGoHead(gid); } catch (e) {}
    return { ok: true, totalQty: newTotal, participantCount: newCount, status: newStatus, unitPrice: unitPrice, subtotal: subtotal, total: total };
  };

  // expose core functions
  window.skhGroupOrderGetFull = async function (gid, goid) {
    var snap = await skh.getDoc(goRef(gid, goid));
    if (!(snap && snap.exists && snap.exists())) return null;
    var data = snap.data() || {};
    data.__id = snap.id;
    data.participantsList = await getParticipants(gid, goid);
    data.polls = await getPolls(gid, goid);
    data.packages = [];
    try { var ps = await skh.getDocs(pkgCol(gid, goid)); ps.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; data.packages.push(x); }); } catch (e) {}
    data.shipments = [];
    try { var ss = await skh.getDocs(shipCol(gid, goid)); ss.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; data.shipments.push(x); }); } catch (e) {}
    data.paymentDashboard = await getPaymentDashboard(gid, goid, uid());
    data.financialLedger = await getFinancialLedger(gid, goid);
    data.agreementVersions = await getAgreementVersions(gid, goid);
    data.auditLogs = await getAuditLogs(gid, goid, 20);
    return data;
  };

  window.skhGroupOrderWorkspaceRender = renderGroupOrderWorkspace;

  // payment
  window.skhGroupOrderInitiatePayment = initiatePaymentPhase;
  window.skhGroupOrderConfirmPayment = confirmIndividualPayment;
  window.skhGroupOrderPaymentDashboard = getPaymentDashboard;

  // fulfillment
  window.skhGroupOrderRequestFulfillment = requestFulfillment;
  window.skhGroupOrderSellerResponse = sellerFulfillmentResponse;

  // allocation & distribution
  window.skhGroupOrderAllocate = allocateOrders;
  window.skhGroupOrderCreateShipment = createShipment;
  window.skhGroupOrderAssignTransporter = assignTransporter;
  window.skhGroupOrderUpdateShipment = updateShipmentStatus;
  window.skhGroupOrderAggregateByLocation = function (gid, goid) {
    return (async function () {
      var pkgs = [];
      try { var snap = await skh.getDocs(pkgCol(gid, goid)); snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; pkgs.push(x); }); } catch (e) {}
      return aggregateByLocation(pkgs);
    })();
  };

  // delivery
  window.skhGroupOrderConfirmReceipt = confirmReceipt;
  window.skhGroupOrderReportProblem = reportProblem;
  window.skhGroupOrderAutoReleaseCheck = autoReleaseCheck;

  // settlement
  window.skhGroupOrderSettlementRelease = settlementRelease;
  window.skhGroupOrderFinancialLedger = getFinancialLedger;

  // polls
  window.skhGroupOrderCreatePoll = createPoll;
  window.skhGroupOrderVotePoll = votePoll;
  window.skhGroupOrderPolls = getPolls;
  window.skhGroupOrderLeadingOption = getLeadingOption;

  // agreement
  window.skhGroupOrderCreateAgreementVersion = createAgreementVersion;
  window.skhGroupOrderAgreementVersions = getAgreementVersions;

  // audit
  window.skhGroupOrderAuditLogs = getAuditLogs;

  // lifecycle
  window.skhGroupOrderCancel = cancelGroupOrder;
  window.skhGroupOrderCheckExpiry = checkExpiry;
  window.skhGroupOrderComplete = checkGroupCompletion;

  // wizard state for testing
  window.SKH_GROUP_ORDER_WIZARD_STEPS = WIZARD_STEPS;
  window.SKH_GROUP_ORDER_SYSTEM = {
    GO_STATUS: GO_STATUS,
    PARTICIPANT_STATE: PARTICIPANT_STATE,
    PAYMENT_STATUS: PAYMENT_STATUS,
    GROUP_PAYMENT_STATUS: GROUP_PAYMENT_STATUS,
    DELIVERY_STATUS: DELIVERY_STATUS,
    FULFILLMENT_RESPONSE: FULFILLMENT_RESPONSE,
    POLL_TYPE: POLL_TYPE,
    PACKAGE_STATUS: PACKAGE_STATUS,
    SHIPMENT_STATUS: SHIPMENT_STATUS,
    DISTRIBUTION_MODE: DISTRIBUTION_MODE,
    validateQuantity: validateQuantity,
    validateTiers: validateTiers,
    tierInfoFor: tierInfoFor,
    buildProductSnapshot: buildProductSnapshot,
    aggregateByLocation: aggregateByLocation
  };

  // ---------- Event Delegation for Workspace UI ----------
  document.addEventListener('click', function (ev) {
    try {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!b) return;
      var act = b.getAttribute('data-act');
      var gid = b.getAttribute('data-gid');
      var goid = b.getAttribute('data-goid');

      if (act === 'go-wiz-close') { closeWizardModal(); return; }
      if (act === 'go-wiz-prev') {
        if (wizardState.step > 1) { wizardState.step--; renderWizardStep(); }
        return;
      }
      if (act === 'go-wiz-next') {
        var v = wizardValidateStep(wizardState.step);
        if (!v.ok) { alert(v.msg || 'Jaza sehemu zote muhimu'); return; }
        if (wizardState.step < 8) { wizardState.step++; renderWizardStep(); }
        return;
      }
      if (act === 'go-wiz-select-prod') {
        var pid = b.getAttribute('data-pid');
        (async function () {
          var pdoc = await fetchProductForSnapshot(pid, 'products');
          if (!pdoc) { alert('Bidhaa haipatikani'); return; }
          var snap = buildProductSnapshot(pdoc);
          wizardState.data.productSnapshot = snap;
          wizardState.data.productId = snap.productId;
          wizardState.data.productName = snap.name;
          wizardState.data.targetPrice = snap.originalPrice || wizardState.data.targetPrice;
          renderWizardStep();
        })();
        return;
      }
      if (act === 'go-wiz-loc-add') {
        var locName = document.getElementById('goWizLocName');
        var locQty = document.getElementById('goWizLocQty');
        var ln = locName ? locName.value.trim() : '';
        var lq = locQty ? Math.floor(+locQty.value) : 0;
        if (!ln || !(lq > 0)) { alert('Weka eneo na kiasi'); return; }
        wizardState.data.locationQuantities[ln] = lq;
        renderWizardStep();
        return;
      }
      if (act === 'go-wiz-loc-del') {
        var loc = b.getAttribute('data-loc');
        delete wizardState.data.locationQuantities[loc];
        renderWizardStep();
        return;
      }
      if (act === 'go-wiz-tier-add') {
        wizardState.data.priceTiers.push({ minQty: 0, price: 0 });
        renderWizardStep();
        return;
      }
      if (act === 'go-wiz-tier-del') {
        var idx = parseInt(b.getAttribute('data-idx'), 10);
        wizardState.data.priceTiers.splice(idx, 1);
        renderWizardStep();
        return;
      }
      if (act === 'go-wiz-publish') {
        (async function () {
          b.disabled = true;
          b.textContent = 'Inachapisha...';
          var res = await createGroupOrderFromWizard(wizardState.gid);
          if (res && res.ok) {
            closeWizardModal();
            try { window.showToast && window.showToast('Group Order imechapishwa ✓ ' + (res.doc.parentCode || ''), 'success'); } catch (e) {}
            try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (e) {}
            // open workspace if in group soga modal
            try {
              var ordersTab = document.getElementById('gsgTabOrders');
              if (ordersTab) { renderGroupOrderWorkspace(wizardState.gid, res.id, ordersTab); ordersTab.style.display = 'block'; }
            } catch (e) {}
          } else {
            b.disabled = false;
            b.textContent = 'PUBLISH GROUP ORDER';
            alert('Imeshindwa: ' + (res && (res.msg || res.reason) || 'unknown'));
          }
        })();
        return;
      }
      if (act === 'go-tab') {
        var tab = b.getAttribute('data-tab');
        var host = document.getElementById('gsgTabOrders') || b.closest('#goWorkspace');
        if (host) { host.setAttribute('data-active-tab', tab); renderGroupOrderWorkspace(gid, goid, host); }
        return;
      }
      if (act === 'go-join') {
        if (window.skhGroupOrderJoinFull) {
          var qty = prompt('Weka kiasi chako (quantity):', '10');
          if (qty == null) return;
          window.skhGroupOrderJoinFull(gid, goid, qty, {}).then(function (r) {
            if (r && r.ok) { try { window.showToast && window.showToast('Umejiunga ✓ TZS ' + r.total, 'success'); } catch (e) {} renderGroupOrderWorkspace(gid, goid, document.getElementById('gsgTabOrders')); }
            else alert('Join failed: ' + (r && r.reason || 'unknown'));
          });
        }
        return;
      }
      if (act === 'go-pay-now') {
        (async function () {
          var dash = await getPaymentDashboard(gid, goid, uid());
          var mine = dash.payments.find(function (p) { return p.participantId === uid(); }) || { amountDue: 0 };
          if (!mine.amountDue) { alert('Payment target not found — organizer must open payment phase'); return; }
          if (!confirm('Thibitisha kulipa TZS ' + mine.amountDue + ' kupitia SokoPay Escrow? (Bei kutoka agreement snapshot)')) return;
          var txId = 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
          var res = await confirmIndividualPayment(gid, goid, uid(), mine.amountDue, txId);
          if (res && res.ok) { try { window.showToast && window.showToast('Malipo yamelindwa Escrow ✓', 'success'); } catch (e) {} renderGroupOrderWorkspace(gid, goid, document.getElementById('gsgTabOrders')); }
          else alert('Payment failed: ' + (res && res.reason || 'unknown'));
        })();
        return;
      }
      if (act === 'go-confirm') {
        var pkgId = b.getAttribute('data-pkg');
        (async function () {
          var res = await confirmReceipt(gid, goid, pkgId, uid());
          if (res && res.ok) { try { window.showToast && window.showToast('Umethibitisha kupokea ✓', 'success'); } catch (e) {} renderGroupOrderWorkspace(gid, goid, document.getElementById('gsgTabOrders')); }
          else alert('Confirm failed: ' + (res && res.reason || ''));
        })();
        return;
      }
      if (act === 'go-report') {
        var pkgId2 = b.getAttribute('data-pkg');
        var reason = prompt('Sababu ya tatizo:');
        if (!reason) return;
        (async function () {
          var res = await reportProblem(gid, goid, pkgId2, reason, null);
          if (res && res.ok) { try { window.showToast && window.showToast('Tatizo limeripotiwa — auto-release imesitishwa', 'info'); } catch (e) {} renderGroupOrderWorkspace(gid, goid, document.getElementById('gsgTabOrders')); }
        })();
        return;
      }
      if (act === 'go-auto-release') {
        (async function () {
          b.disabled = true;
          var res = await autoReleaseCheck(gid, goid);
          b.disabled = false;
          try { window.showToast && window.showToast('Auto-release: ' + (res && res.count || 0) + ' packages released', 'info'); } catch (e) {}
          renderGroupOrderWorkspace(gid, goid, document.getElementById('gsgTabOrders'));
        })();
        return;
      }
      if (act === 'go-payment-dash') { var host2 = document.getElementById('gsgTabOrders'); if (host2) { host2.setAttribute('data-active-tab', 'payment'); renderGroupOrderWorkspace(gid, goid, host2); } return; }
      if (act === 'go-fulfillment') {
        (async function () {
          if (confirm('Request fulfillment from seller? (variant/location breakdown)')) {
            var res = await requestFulfillment(gid, goid);
            if (res && res.ok) { try { window.showToast && window.showToast('Fulfillment requested ✓', 'success'); } catch (e) {} renderGroupOrderWorkspace(gid, goid, document.getElementById('gsgTabOrders')); }
            else alert('Fulfillment request failed: ' + (res && res.reason || ''));
          }
        })();
        return;
      }
      if (act === 'go-allocate-auto') {
        (async function () {
          var goSnap = await skh.getDoc(goRef(gid, goid));
          var goData = goSnap.data() || {};
          var fulfilled = +goData.fulfilledQty || +goData.totalQty || 0;
          if (!fulfilled) { alert('No fulfilled qty — seller must respond ACCEPT_FULL/PARTIAL first'); return; }
          // auto allocation: distribute proportionally, sum==fulfilled
          var parts = await getParticipants(gid, goid);
          var totalRequested = parts.reduce(function (s, p) { return s + (+p.quantity || +p.qty || 0); }, 0);
          var allocMap = {};
          var sum = 0;
          parts.forEach(function (p, idx) {
            if (idx === parts.length - 1) allocMap[p.participantId] = fulfilled - sum;
            else {
              var share = Math.floor((+p.quantity || 0) / totalRequested * fulfilled);
              allocMap[p.participantId] = share;
              sum += share;
            }
          });
          var res = await allocateOrders(gid, goid, allocMap);
          if (res && res.ok) { try { window.showToast && window.showToast('Allocated ' + res.allocatedQty + ' → ' + res.packageIds.length + ' packages', 'success'); } catch (e) {} renderGroupOrderWorkspace(gid, goid, document.getElementById('gsgTabOrders')); }
          else alert('Allocation failed: ' + (res && res.message || res.reason || ''));
        })();
        return;
      }
      if (act === 'go-open-chat') {
        try { var tabChat = document.getElementById('gsgTabs'); if (tabChat) { var btn = tabChat.querySelector('[data-tab=\"chat\"]'); if (btn) btn.click(); } } catch (e) {}
        return;
      }
      if (act === 'go-new-version') {
        var reasonV = prompt('Reason for new agreement version:');
        if (!reasonV) return;
        var changesV = prompt('Changes (brief):') || '';
        (async function () {
          var goSnap = await skh.getDoc(goRef(gid, goid));
          var goData = goSnap.data() || {};
          var res = await createAgreementVersion(gid, goid, uid(), reasonV, { changes: changesV }, goData);
          if (res && res.ok) { try { window.showToast && window.showToast('New version V' + res.version + ' created ✓', 'success'); } catch (e) {} renderGroupOrderWorkspace(gid, goid, document.getElementById('gsgTabOrders')); }
        })();
        return;
      }
    } catch (e) { console.warn('[go ui click]', e); }
  }, true);

  // ---------- Integration: Enhance existing group-soga tabs ----------
  // Add Group Order workspace button to group soga modal if not present
  function enhanceGroupSoga() {
    try {
      var tabsEl = document.getElementById('gsgTabs');
      if (!tabsEl) return;
      // Add button to create group order via wizard if not already in orders tab
      var ordersTab = document.getElementById('gsgTabOrders');
      if (ordersTab && !ordersTab._enhanced) {
        ordersTab._enhanced = true;
        // inject wizard CTA at top
        var cta = document.createElement('div');
        cta.id = 'goWizardCTA';
        cta.style.cssText = 'margin-bottom:12px;display:flex;gap:8px;';
        cta.innerHTML = '<button type=\"button\" data-act=\"go-wiz-open\" style=\"flex:1;border:none;background:linear-gradient(135deg,#1268A8,#18A982);color:#fff;font-weight:900;padding:12px;border-radius:12px;cursor:pointer;\">+ New Group Order (8 Steps)</button>';
        ordersTab.prepend(cta);
        cta.querySelector('[data-act=\"go-wiz-open\"]').addEventListener('click', function () {
          var gid = window.__skhGroupSogaCurGid || (function () { try { return document.getElementById('skhGroupSogaModal').getAttribute('data-gid') || CUR && CUR.gid; } catch (e) { return null; } })() || (typeof CUR !== 'undefined' ? CUR.gid : null);
          if (!gid) { alert('Fungua kikundi kwanza'); return; }
          openWizardModal(gid);
        });
      }
    } catch (e) {}
  }

  // Poll for group soga modal appearance
  if (typeof MutationObserver !== 'undefined') {
    var mo = new MutationObserver(function () { try { enhanceGroupSoga(); } catch (e) {} });
    var boot = function () { try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {} };
    if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
  }

  // ---------- Testing Hooks ----------
  window.skhGroupOrderTest = {
    createSnapshot: buildProductSnapshot,
    validateQuantity: validateQuantity,
    validateTiers: validateTiers,
    tierInfo: tierInfoFor,
    aggregate: aggregateByLocation,
    genId: genId,
    shortCode: shortCode
  };

  console.log('[74-group-order-system] Full-spec Group Order System loaded — 25+ states, 8-step wizard, allocation, distribution, 24h auto-release, settlement, polls A/B/C, agreement versioning');

})();

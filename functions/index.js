/**
 * SOKOHAI / SokoPay — Cloud Functions (server-authoritative)
 * =========================================================
 * Hizi ndizo functions ambazo client (js/16-wallet.js, js/12-payments.js,
 * js/02-checkout.js, js/04-orders-escrow.js, js/21-sokopay.js) TAYARI
 * anaziita kupitia httpsCallable (region: europe-west1):
 *
 *   walletAdjust            — mabadiliko YOTE ya salio la wallet (atomic + ledger)
 *   escrowRelease           — kutoa escrow ya marketplace (smart-split kamili)
 *   haipayReleaseLink       — kutoa escrow ya SokoPay payment link
 *   pesapalCheckout         — kuanzisha malipo ya PesaPal (secret iko server pekee)
 *   pesapalTransactionStatus— kuangalia hali ya muamala wa PesaPal
 *   pesapalIpn              — (HTTP) PesaPal anaripoti malipo yalipokamilika (IPN)
 *   pesapalRegisterIpn      — kusajili URL ya IPN (admin pekee)
 *   platformStatsRefresh    — kusasisha platform_stats/current sasa hivi
 *   platformStatsHourly     — scheduler kila saa
 *
 * KANUNI YA MSINGI: Browser HAITHIBITISHI malipo wala salio — server ndiyo
 * mamlaka pekee ya mabadiliko ya fedha. Firestore rules zinazuia browser
 * kuandika walletBalance moja kwa moja.
 */
'use strict';

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const crypto = require('crypto');

// Region ILIYOFUNGWA: client anaita getFunctions(app, "europe-west1")
// [REPAIR 2026-10 M3] App Check on every callable. Roll-out: deploy with
// APP_CHECK_ENFORCE unset (monitor in Firebase Console -> App Check -> Metrics),
// then set APP_CHECK_ENFORCE=true in functions/.env and deploy again.
// HTTP endpoints (pesapalIpn, sitemapXml) are not callables and stay open.
const APP_CHECK_ENFORCE = String(process.env.APP_CHECK_ENFORCE || '').toLowerCase() === 'true';
setGlobalOptions({ region: 'europe-west1', maxInstances: 10, enforceAppCheck: APP_CHECK_ENFORCE });

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const REGION = 'europe-west1';

/* ============================================================
 * 1) MAZINGIRA (PesaPal creds zinaishi functions/.env PEKEE)
 *    Live keys → base URL rasmi: https://pay.pesapal.com/v3
 * ========================================================== */
function ppConfig() {
    return {
        consumerKey: process.env.PESAPAL_CONSUMER_KEY || '',
        consumerSecret: process.env.PESAPAL_CONSUMER_SECRET || '',
        baseUrl: (process.env.PESAPAL_BASE_URL || 'https://pay.pesapal.com/v3').replace(/\/+$/, ''),
        defaultCallback: process.env.PESAPAL_REDIRECT_URL || '',
        ipnUrl: process.env.PESAPAL_IPN_URL || '',
        ipnId: process.env.PESAPAL_IPN_ID || ''
    };
}

/* [PHASE 9] Live-money guard. The LIVE PesaPal host is only allowed in the
 * production Firebase project (sokonet-3b847). A staging/emulator project that
 * was given live keys or left PESAPAL_BASE_URL unset (default = live) is refused,
 * unless PESAPAL_ALLOW_LIVE=true is set on purpose. */
const PRODUCTION_PROJECT_ID = 'sokonet-3b847';
function currentProjectId() {
    if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
    try { return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || ''; } catch (e) { return ''; }
}
function pesapalLiveGuard(baseUrl) {
    let host = '';
    try { host = new URL(baseUrl).hostname; } catch (e) { throw new Error('PESAPAL_BASE_URL si URL halali.'); }
    const live = host === 'pay.pesapal.com';
    if (live && currentProjectId() !== PRODUCTION_PROJECT_ID && String(process.env.PESAPAL_ALLOW_LIVE || '').toLowerCase() !== 'true') {
        throw new Error('PesaPal LIVE imezuiwa kwenye project "' + (currentProjectId() || '?') + '". Tumia sandbox (https://cybqa.pesapal.com/pesapalv3) kwenye staging.');
    }
    return { host, live };
}

// Token ya PesaPal inaishi ~dakika 5 — tunacache mpaka inakaribia kuisha
let _ppToken = { value: '', expiresAt: 0 };

async function pesapalToken() {
    const c = ppConfig();
    if (!c.consumerKey || !c.consumerSecret) {
        throw new Error('PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET hazijasanidiwa (angalia functions/.env).');
    }
    pesapalLiveGuard(c.baseUrl);
    const now = Date.now();
    if (_ppToken.value && _ppToken.expiresAt > now + 30000) return _ppToken.value;

    const res = await fetch(c.baseUrl + '/api/Auth/RequestToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ consumer_key: c.consumerKey, consumer_secret: c.consumerSecret })
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = { _raw: text }; }
    const token = (data && (data.token || (data.data && data.data.token))) || '';
    if (!token) {
        const detail = (data && data.error && (data.error.message || data.error)) || (data && data.message) || text.slice(0, 140);
        // Ujumbe wazi ili iwe rahisi kujua chanzo: funguo / mazingira / mtandao
        const msg = (res.status === 401 || res.status === 403)
            ? 'Funguo za PesaPal hazikubaliwa (HTTP ' + res.status + '). Angalia PESAPAL_CONSUMER_KEY/SECRET na base URL. ' + detail
            : 'PesaPal RequestToken imeshindwa (HTTP ' + res.status + '): ' + detail;
        throw new Error(String(msg));
    }
    const expiryTs = Date.parse(data.expiryDate);
    const expiresIn = Number.isFinite(expiryTs) ? (expiryTs - now) : Number(data.expiresIn || 300000);
    _ppToken = {
        value: token,
        expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300000)
    };
    return token;
}

async function ppFetchJson(url, opts = {}) {
    const method = opts.method || 'GET';
    const token = opts.token || null;
    const body = opts.body;
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = { _raw: text }; }
    return { status: res.status, json, text };
}

// Hali "COMPLETED" ya PesaPal → malipo yamethibitishwa
function isPesaPalPaid(data) {
    if (!data) return false;
    if (Number(data.status_code) === 1) return true;
    const desc = String(data.payment_status_description || data.status_description || data.status || '').toLowerCase();
    return ['completed', 'complete', 'paid'].indexOf(desc) !== -1;
}

function requireAuth(context) {
    if (!context || !context.auth) {
        throw new HttpsError('unauthenticated', 'Login inahitajika.');
    }
    return context.auth;
}

// [ADMIN PAYMENTS SWITCH] Je, admin amewasha ADA HUSIKA (per-feature)?
//  system/config → fees.<feature> === true → PAID; vinginevyo FREE (default).
//  [MIGRATION] fees.enabled ya zamani (global) bado inaheshimiwa kwa kila feature.
async function paymentGate(feature) {
    try {
        const s = await db.doc('system/config').get();
        const cfg = s.exists ? s.data() : {};
        const f = (cfg && cfg.fees) || {};
        if (typeof f.enabled === 'boolean') return f.enabled === true; // global ya zamani
        if (feature in f) return f[feature] === true;
        return false; // default: FREE (salama kwa kuanza production)
    } catch (e) {
        return false; // default: FREE
    }
}

const ADMIN_EMAILS = () => String(process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function isAdmin(context) {
    if (!context || !context.auth) return false;
    const em = (context.auth.token && context.auth.token.email || '').toLowerCase();
    // [PHASE 1 SECURITY 2026-09] Email ya admin lazima iwe IMETHIBITISHWA
    // (email_verified) — vinginevyo mtu angesajili akaunti kwa email hiyo.
    if (em && context.auth.token.email_verified === true && ADMIN_EMAILS().includes(em)) return true;
    const tk = context.auth.token || {};
    return tk.admin === true || tk.superAdmin === true || tk.role === 'admin';
}

/* ============================================================
 * [PHASE 1 SECURITY 2026-09] USHAHIDI WA MALIPO WA SERVER (escrow_holds)
 * ------------------------------------------------------------
 *  Kanuni: pesa haitolewi (release/payout) mpaka SERVER iwe na ushahidi
 *  huru wa malipo. Uga za oda/link kama status:'held', paymentStatus:'paid'
 *  au paymentVerified:true zinaweza kuandikwa na kivinjari — HAZIAMINIWI
 *  tena kama uthibitisho wa malipo.
 *
 *  Vyanzo halali vya ushahidi (vilivyopo tayari kwenye mfumo):
 *    1) PesaPal GetTransactionStatus (IPN / pesapalTransactionStatus) —
 *       server inathibitisha COMPLETED + kiasi, kisha inaandika
 *       `escrow_holds/order_<id>` au `escrow_holds/link_<id>`.
 *    2) Wallet ya SokoPay — makato ya server (wallet_ledger) ya mnunuzi:
 *       `sokopayLinkWalletPay` (atomic) au rekodi ya zamani
 *       `wallet_ledger/splink_buy_<linkId>` (legacy, iliyoandikwa na server).
 *  `escrow_holds` haina rule ya client → catch-all deny (server pekee).
 *  Kila hold inaweza kutolewa MARA MOJA (released:true) — inazuia malipo
 *  mara mbili kati ya escrowRelease / deliveryComplete / auto-release.
 * ========================================================== */
const ESCROW_HOLDS = 'escrow_holds';
const MONEY_EPS = 0.5; // TSh — uvumilivu wa rounding tu

function safeKey(s) {
    return String(s || '').replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 300);
}
function moneyOf(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
function sameMoney(a, b) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= MONEY_EPS;
}

// users/{uid} au users where uid == uid (mfumo una aina zote mbili za doc id).
async function userDocFor(uid) {
    if (!uid) return null;
    const direct = await db.doc('users/' + uid).get();
    if (direct.exists) return { id: direct.id, data: direct.data() || {} };
    const q = await db.collection('users').where('uid', '==', uid).limit(1).get();
    if (q.empty) return null;
    return { id: q.docs[0].id, data: q.docs[0].data() || {} };
}

// PesaPal: thibitisha muamala kwa GetTransactionStatus (njia ILIYOPO).
async function ppVerifyTransaction(trackingId) {
    const id = String(trackingId || '').trim();
    if (!id) return { paid: false, reason: 'missing_tracking_id' };
    let d = {};
    try {
        const c = ppConfig();
        const token = await pesapalToken();
        const r = await ppFetchJson(c.baseUrl + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + encodeURIComponent(id), { method: 'GET', token });
        d = r.json || {};
    } catch (e) {
        return { paid: false, reason: 'pesapal_unavailable', message: (e && e.message) || '' };
    }
    return ppTxFromStatus(d, id);
}

function ppTxFromStatus(d, id) {
    d = d || {};
    const amount = moneyOf(d.amount);
    const currency = String(d.currency || '').toUpperCase();
    const paid = isPesaPalPaid(d) && amount > 0 && (!currency || currency === 'TZS');
    return {
        paid: paid,
        reason: paid ? '' : 'not_paid',
        amount: amount,
        currency: currency,
        trackingId: String(d.order_tracking_id || id || ''),
        merchantReference: String(d.merchant_reference || ''),
        raw: d
    };
}

/* Aliyeanzisha malipo (pesapalCheckout huandika escrow_holds/ppinit_<merchantRef>).
 * null = malipo ya zamani bila rekodi (tabia ya awali inabaki). */
async function ppInitiatorUid(tx) {
    const ref = String((tx && tx.merchantReference) || '').trim();
    if (!ref) return null;
    try {
        const s = await db.collection(ESCROW_HOLDS).doc('ppinit_' + safeKey(ref)).get();
        return s.exists ? (String((s.data() || {}).uid || '') || null) : null;
    } catch (e) { return null; }
}

/* ============================================================
 * [REPAIR 2026-10 H2] SERVER PRICE CHECK
 * ------------------------------------------------------------
 * A browser-created order carries a browser-chosen `amount`. Before PesaPal
 * money is attached to an order as escrow, the server recomputes the lowest
 * legitimate price from its own records and refuses to settle an order that
 * was under-priced. Sources (first match wins):
 *   1. pricedByServer orders (negotiation engine, SokoPay link tracking order);
 *   2. negotiationId  -> agreed unit price x quantity in `negotiations`;
 *   3. sokopay link   -> link price;
 *   4. products/{id}  -> base or variant price, adjusted for the commerce mode
 *                        (price drop, group buy, wholesale tier, won auction);
 *   5. services/{id}  -> fixed price only (negotiable services must negotiate);
 *   6. Smart Cart `items[]` -> sum of the above per item.
 * Anything else is held for admin review (status 'price_review'), never paid.
 * ========================================================== */
const { modeUnitPrice, modeEligibility, variantPrice, boostPrice, SUBSCRIPTION_PRICES } = require('./pricing-core');
// [PHASE 3 2026-10-31] Online reservation / stock commit (OFF unless system_config/inventory.mode says otherwise).
const inventoryReservation = require('./inventory-reservation');
const stockCore = require('./shared/inventory-reservation-core');
async function expectedItemAmount(item, buyerUid, nowMs) {
    const qty = Math.max(1, parseInt(item.quantity || item.qty || 1, 10) || 1);
    const pid = String(item.productId || item.itemId || item.id || '');
    if (pid && pid.indexOf('/') === -1) {
        const ps = await db.doc('products/' + pid).get();
        if (ps.exists) {
            const p = ps.data() || {};
            if (item.sellerId && String(p.userId || '') !== String(item.sellerId)) return { ok: false, reason: 'seller_mismatch' };
            const elig = modeEligibility(p, buyerUid, nowMs);
            if (elig) return { ok: false, reason: elig };
            const vp = variantPrice(p, item.selectedVariant || item.variant || item.variantId);
            const unit = modeUnitPrice(vp ? Object.assign({}, p, { price: vp }) : p, qty, buyerUid, nowMs);
            return { ok: unit > 0, amount: unit * qty, source: 'products', reason: unit > 0 ? '' : 'no_price' };
        }
        const ss = await db.doc('services/' + pid).get();
        if (ss.exists) {
            const sv = ss.data() || {};
            if (['negotiable', 'quotation_required', 'range', 'starting'].indexOf(String(sv.pricingModel || 'fixed')) !== -1) return { ok: false, reason: 'service_requires_negotiation' };
            const unit = Number(sv.price || 0);
            return { ok: unit > 0, amount: unit * qty, source: 'services', reason: unit > 0 ? '' : 'no_price' };
        }
    }
    return { ok: false, reason: 'unknown_item' };
}
async function expectedOrderAmount(o, docId) {
    const nowMs = Date.now();
    if (o.pricedByServer === true) return { ok: true, amount: moneyOf(o.amount), source: o.priceSource || 'server' };
    if (o.priceApprovedBy && Number(o.priceApprovedAmount) > 0) {
        // [REPAIR 2026-10 B-01] Trust an admin price approval only when the
        // permanent audit record written by adminApproveOrderPrice exists.
        const aid = String(o.priceApprovalAuditId || '');
        if (aid && aid.indexOf('/') === -1) {
            const as = await db.doc('admin_audit_log/' + aid).get();
            const a = as.exists ? (as.data() || {}) : {};
            if (a.action === 'ORDER_PRICE_APPROVED' && a.target && docId && String(a.target.id || '') === String(docId)
                && sameMoney(moneyOf((a.details || {}).amount), moneyOf(o.priceApprovedAmount))) {
                return { ok: true, amount: moneyOf(o.priceApprovedAmount), source: 'admin_review' };
            }
        }
        return { ok: false, reason: 'price_approval_unverified' };
    }
    if (o.negotiationId && String(o.negotiationId).indexOf('/') === -1) {
        const ns = await db.doc('negotiations/' + o.negotiationId).get();
        if (ns.exists) {
            const n = ns.data() || {};
            if (String(n.buyerId) !== String(o.buyerId) || String(n.sellerId) !== String(o.sellerId)) return { ok: false, reason: 'negotiation_parties_mismatch' };
            const agreed = ['AGREEMENT', 'FINAL_AGREEMENT', 'ORDER_CREATED', 'COMPLETED'].indexOf(String(n.currentState || '')) !== -1;
            const unit = Number(n.agreedUnitPrice || n.currentUnitPrice || 0);
            const qty = Math.max(1, Number(n.quantity || 1));
            if (!agreed || !(unit > 0)) return { ok: false, reason: 'negotiation_not_agreed' };
            return { ok: true, amount: Math.round(Number(n.agreedTotal) > 0 ? Number(n.agreedTotal) : unit * qty), source: 'negotiation' };
        }
    }
    const itemId = String(o.itemId || '');
    if (itemId && itemId.indexOf('/') === -1) {
        const ls = await db.doc('sokopay_links/' + itemId).get();
        if (ls.exists) {
            const L = ls.data() || {};
            if (String(L.userId || '') !== String(o.sellerId || '')) return { ok: false, reason: 'seller_mismatch' };
            return { ok: Number(L.price) > 0, amount: moneyOf(L.price), source: 'sokopay_link', reason: Number(L.price) > 0 ? '' : 'no_price' };
        }
    }
    if (Array.isArray(o.items) && o.items.length) {
        let sum = 0;
        for (const it of o.items.slice(0, 50)) {
            const r = await expectedItemAmount(Object.assign({ sellerId: o.sellerId }, it), o.buyerId, nowMs);
            if (!r.ok) return r;
            sum += r.amount;
        }
        return { ok: true, amount: sum, source: 'cart_items' };
    }
    if (o.productId || o.itemId || o.serviceId) {
        return expectedItemAmount({ productId: o.productId || o.serviceId || o.itemId, quantity: o.quantity, selectedVariant: o.selectedVariant, sellerId: o.sellerId }, o.buyerId, nowMs);
    }
    return { ok: false, reason: 'no_price_source' };
}

/* Funga oda/link zilizolipwa kwa muamala wa PesaPal ULIOTHIBITISHWA.
 * Rejea (paymentRef ya oda / transactionId ya link) zinalinganishwa na
 * tracking id NA merchant_reference iliyorudishwa na PesaPal yenyewe.
 * Jumla ya oda/link zinazofungwa HAIWEZI kuzidi kiasi kilicholipwa
 * (escrow_holds/pptx_<tracking> huhesabu kilichotumika). */
async function settlePesaPalPayment(tx, source) {
    const out = { ok: false, settled: [], skipped: [] };
    if (!tx || !tx.paid) return out;
    const refs = Array.from(new Set([tx.trackingId, tx.merchantReference].filter(Boolean)));
    const usageRef = db.collection(ESCROW_HOLDS).doc('pptx_' + safeKey(tx.trackingId));
    const now = new Date().toISOString();
    const events = [];
    const linkEvents = [];
    const initiatorUid = await ppInitiatorUid(tx);
    // [REPAIR H2] Server price check for every candidate order (outside the
    // transaction: product/negotiation prices are only a lower bound).
    const priceOf = {};
    for (const ref of refs) {
        const pre = await db.collection('orders').where('paymentRef', '==', ref).limit(20).get();
        for (const d of pre.docs) {
            if (priceOf[d.id]) continue;
            try { priceOf[d.id] = await expectedOrderAmount(d.data() || {}, d.id); }
            catch (e) { priceOf[d.id] = { ok: false, reason: 'price_check_error' }; }
        }
    }
    const stockConfig = await inventoryReservation._internal.loadConfig();
    const unmatchedRef = db.collection('payment_reviews').doc(stockCore.ids.unmatchedReview(tx.trackingId));
    await db.runTransaction(async (t) => {
        out.settled = []; out.skipped = []; out.review = []; events.length = 0;
        const usageSnap = await t.get(usageRef);
        const usage = usageSnap.exists ? (usageSnap.data() || {}) : {};
        let used = Number(usage.usedAmount || 0);
        const targets = Array.isArray(usage.targets) ? usage.targets.slice() : [];
        const cands = [];
        for (const ref of refs) {
            const oq = await t.get(db.collection('orders').where('paymentRef', '==', ref).limit(20));
            oq.forEach(d => cands.push({ kind: 'order', id: d.id, ref: d.ref, data: d.data() || {} }));
            const lq = await t.get(db.collection('sokopay_links').where('transactionId', '==', ref).limit(20));
            lq.forEach(d => cands.push({ kind: 'link', id: d.id, ref: d.ref, data: d.data() || {} }));
        }
        const seen = new Set();
        const list = cands.filter(c => {
            const k = c.kind + '_' + c.id;
            if (seen.has(k)) return false;
            seen.add(k); return true;
        }).sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));
        const holds = [];
        for (const c of list) holds.push(await t.get(db.collection(ESCROW_HOLDS).doc(c.kind + '_' + c.id)));
        // [PHASE 3] every stock read happens here, before the first write.
        const fresh = list.filter((c, i) => c.kind === 'order' && !holds[i].exists);
        const stockState = await inventoryReservation._internal.settlementPrepare(t, fresh, stockConfig);
        const unmatchedSnap = list.length ? null : await t.get(unmatchedRef);

        list.forEach((c, i) => {
            const key = c.kind + '_' + c.id;
            if (holds[i].exists) { out.skipped.push({ target: key, reason: 'already_verified' }); return; }
            const amount = moneyOf(c.kind === 'order' ? c.data.amount : c.data.price);
            const payer = String(c.data.buyerId || '');
            const payee = String(c.kind === 'order' ? (c.data.sellerId || '') : (c.data.userId || ''));
            if (!(amount > 0) || !payer || !payee || payer === payee) {
                out.skipped.push({ target: key, reason: 'invalid_amount_or_parties' }); return;
            }
            if (initiatorUid && payer !== initiatorUid) {
                out.skipped.push({ target: key, reason: 'payer_not_initiator' }); return;
            }
            if (used + amount > tx.amount + MONEY_EPS) {
                out.skipped.push({ target: key, reason: 'amount_exceeds_payment' }); return;
            }
            if (c.kind === 'order') {
                const pc = priceOf[c.id];
                if (!pc || !pc.ok || !(amount + MONEY_EPS >= moneyOf(pc.amount))) {
                    const why = !pc ? 'price_unchecked' : (!pc.ok ? pc.reason : 'underpriced');
                    out.skipped.push({ target: key, reason: 'price_' + why });
                    t.update(c.ref, { paymentStatus: 'price_review', priceReviewReason: why,
                        priceExpected: pc && pc.ok ? moneyOf(pc.amount) : null, priceReviewAt: now,
                        pesapalTrackingId: tx.trackingId });
                    return;
                }
            }
            used += amount;
            targets.push(key);
            // [PHASE 3] stock is committed in THIS transaction, together with the
            // escrow hold: a duplicate IPN finds the hold above and never commits twice.
            const stockResult = c.kind === 'order'
                ? inventoryReservation._internal.settlementDecide(stockState, c.id, c.data, now)
                : { action: 'LEGACY', orderPatch: {} };
            const needsReview = stockResult.action === 'NEEDS_REVIEW';
            t.set(db.collection(ESCROW_HOLDS).doc(key), Object.assign({
                kind: 'escrow_hold', target: c.kind, targetId: c.id,
                amount: amount, payerUid: payer, payeeUid: payee,
                method: 'pesapal', source: String(source || 'pesapal'),
                pesapalTrackingId: tx.trackingId, merchantReference: tx.merchantReference || null,
                paidAmount: tx.amount, verifiedAt: now, released: false
            }, needsReview ? { blocked: true, blockedReason: 'INVENTORY_' + stockResult.reason } : {}));
            if (c.kind === 'order') {
                const od = c.data;
                const pcx = priceOf[c.id] || {};
                const patch = {
                    pricedByServer: true, priceSource: pcx.source || 'server_check', priceExpected: moneyOf(pcx.amount),
                    paymentStatus: 'paid', paymentVerified: true, paymentVerifiedBy: 'pesapal',
                    verifiedAmount: amount, paymentProtectedAt: now, paidAt: od.paidAt || now,
                    ipnAt: now, updatedAt: now
                };
                // Usirudishe nyuma oda iliyokwisha songa mbele (shipped/in_transit...).
                if (!needsReview && ['shipped', 'awaiting_pickup', 'in_transit', 'delivered', 'completed'].indexOf(String(od.status || '')) === -1) {
                    patch.status = 'held';
                    patch.heldAt = now;
                    if (od.commerceType === 'service') patch.serviceStatus = 'held';
                    else if (od.commerceType === 'transport') patch.transportStatus = 'held';
                    else patch.deliveryStatus = 'held';
                }
                Object.assign(patch, stockResult.orderPatch);
                t.update(c.ref, patch);
                if (needsReview) {
                    // Money is verified but the goods are not secured: no shipping, no
                    // release; admin re-reserves or refunds (adminPaymentReviewResolve).
                    t.set(db.collection('payment_reviews').doc(stockCore.ids.review(c.id)), {
                        kind: 'order_inventory', orderId: c.id, state: 'NEEDS_REVIEW', reason: stockResult.reason,
                        buyerId: payer, sellerId: payee, amount, pesapalTrackingId: tx.trackingId,
                        reviewDeadlineAt: stockResult.orderPatch.reviewDeadlineAt, createdAt: now, updatedAt: now
                    }, { merge: true });
                    out.review.push(key);
                } else {
                    events.push({ id: c.id, data: od });
                }
            } else {
                const L = c.data;
                const patch = { paymentVerified: true, verifiedAmount: amount, updatedAt: now };
                if (!L.status || L.status === 'pending' || L.status === 'held') { patch.status = 'held'; patch.paidAt = now; }
                t.update(c.ref, patch);
                linkEvents.push({ id: c.id, sellerId: L.userId || L.sellerId || '', title: L.title || L.itemTitle || '', amount });
            }
            out.settled.push(key);
        });
        inventoryReservation._internal.settlementFlush(t, stockState, now);
        // [PHASE 3] A verified payment that matches no order/link is kept for review (never applied).
        if (!list.length && unmatchedSnap && !unmatchedSnap.exists) {
            t.set(unmatchedRef, { kind: 'unmatched_payment', state: 'UNAPPLIED', pesapalTrackingId: tx.trackingId,
                merchantReference: tx.merchantReference || null, paidAmount: tx.amount, initiatorUid: initiatorUid || null,
                source: String(source || 'pesapal'), createdAt: now, updatedAt: now });
        }
        t.set(usageRef, {
            kind: 'pesapal_tx', trackingId: tx.trackingId, merchantReference: tx.merchantReference || null,
            paidAmount: tx.amount, usedAmount: used, targets: targets, updatedAt: now
        }, { merge: true });
    });
    for (const ev of events) {
        await postOrderPaymentProtectedEvent(db, ev.id, ev.data, tx.trackingId, now);
    }
    for (const le of linkEvents) {
        if (le.sellerId) await notifyLinkEscrowFunded(db, le.id, le.sellerId, le.title, le.amount, 'pesapal');
    }
    out.ok = true;
    return out;
}

/* Ushahidi wa escrow wa oda au link. Hurudisha { ok, amount, holdId, hold,
 * payerUid, payeeUid, legacy } au { ok:false, reason }. */
async function getEscrowEvidence(kind, id, doc, opts) {
    opts = opts || {};
    doc = doc || {};
    const holdsCol = db.collection(ESCROW_HOLDS);
    async function readHold(holdId) {
        const s = await holdsCol.doc(holdId).get();
        return s.exists ? Object.assign({ holdId: holdId }, s.data() || {}) : null;
    }
    async function legacyWalletLink(linkId, buyerUid, price) {
        // Rekodi ya zamani ya server: walletAdjust(-price, ledgerKey splink_buy_<linkId>).
        if (!linkId) return null;
        const s = await db.doc('wallet_ledger/splink_buy_' + linkId).get();
        if (!s.exists) return null;
        const L = s.data() || {};
        if (!buyerUid || String(L.callerUid || '') !== buyerUid) return null;
        if (!sameMoney(-moneyOf(L.amountTSh), moneyOf(price))) return null;
        return { holdId: 'link_' + linkId, amount: moneyOf(price), payerUid: buyerUid, method: 'wallet_legacy', legacy: true, released: false, verifiedAt: L.createdAt || null };
    }

    let hold = await readHold(kind + '_' + id);
    if (!hold && kind === 'order' && doc.itemId) {
        // Oda ya kufuatilia ya SokoPay link (itemId = linkId) — chanzo ni link.
        hold = await readHold('link_' + doc.itemId);
        if (!hold) {
            const ls = await db.doc('sokopay_links/' + doc.itemId).get();
            if (ls.exists) hold = await legacyWalletLink(doc.itemId, String(doc.buyerId || ''), (ls.data() || {}).price);
        }
    }
    if (!hold && kind === 'link') hold = await legacyWalletLink(id, String(doc.buyerId || ''), doc.price);

    if (!hold && opts.recheckPesaPal) {
        // Malipo yanaweza kuwa yamekamilika kabla IPN kufika — thibitisha
        // tena kwa PesaPal (njia iliyopo), kisha funga kwa settlePesaPalPayment.
        const refs = Array.from(new Set([doc.transactionId, doc.paymentRef].map(x => String(x || '').trim()).filter(Boolean)));
        for (const r of refs) {
            const tx = await ppVerifyTransaction(r);
            if (tx.paid) {
                await settlePesaPalPayment(tx, 'recheck');
                hold = await readHold(kind + '_' + id);
                if (hold) break;
            }
        }
    }
    if (!hold) return { ok: false, reason: 'payment_not_verified' };
    const payer = String(hold.payerUid || '');
    if (payer && String(doc.buyerId || '') !== payer) return { ok: false, reason: 'buyer_mismatch', hold };
    if (hold.payeeUid) {
        const payeeNow = String(kind === 'link' ? (doc.userId || '') : (doc.sellerId || ''));
        // Oda ya kufuatilia ya link: muuzaji wa oda lazima alingane na mmiliki wa link.
        if (payeeNow !== String(hold.payeeUid)) return { ok: false, reason: 'seller_mismatch', hold };
    }
    return { ok: true, amount: moneyOf(hold.amount), holdId: hold.holdId, hold, payerUid: payer, legacy: !!hold.legacy };
}

function evidenceError(ev) {
    const why = {
        payment_not_verified: 'Malipo hayajathibitishwa na server (PesaPal/Wallet). Escrow haiwezi kutolewa.',
        buyer_mismatch: 'Mnunuzi wa oda hailingani na aliyelipa.',
        seller_mismatch: 'Muuzaji wa oda hailingani na aliyelipwa kwenye escrow.',
        amount_mismatch: 'Kiasi cha oda hakilingani na kiasi kilicholipwa na kuthibitishwa.',
        self_trade: 'Mnunuzi na muuzaji hawawezi kuwa mtu mmoja.'
    };
    return new HttpsError('failed-precondition', why[ev && ev.reason] || 'Escrow haikubaliki.');
}

// Funguo za ledger za suluhu ya mgogoro ya admin (21-sokopay.js) → id ya oda/link.
function adminDisputeTarget(key) {
    key = String(key || '');
    let m = /^dispwin_(.+)_(buyer|seller)$/.exec(key);
    let id = m ? m[1] : null, role = m ? m[2] : null;
    if (!id) { m = /^splitref_(buyer|seller)_(.+)$/.exec(key); id = m ? m[2] : null; role = m ? m[1] : null; }
    return (id && id.indexOf('/') === -1) ? { id, role } : null;
}
function adminDisputeTargetId(key) {
    const t = adminDisputeTarget(key);
    return t ? t.id : null;
}

/* [PHASE 2 P1] Safari inastahili malipo ya carrier kutoka escrow ya oda TU ikiwa:
 *  • nauli imegandishwa na server (agreedFare) wakati wa kukubali;
 *  • dereva si mnunuzi wala muuzaji;
 *  • oda ya bidhaa/huduma: makabidhiano ya mwanzo yamethibitishwa na muuzaji
 *    HALISI wa oda (sellerConfirmedBy — huandikwa na deliveryConfirmCustody). */
function carrierRideEligible(rd, o) {
    rd = rd || {}; o = o || {};
    const drv = String(rd.driverId || '');
    if (!drv || !(Number(rd.agreedFare || 0) > 0)) return false;
    if (drv === String(o.buyerId || '') || drv === String(o.sellerId || '')) return false;
    if ((o.commerceType || 'product') !== 'transport' && String(rd.sellerConfirmedBy || '') !== String(o.sellerId || '')) return false;
    return true;
}

/* [PHASE 2 P6] Oda ina uwasilishaji unaoendelea (dereva amekubaliwa na server,
 * safari bado haijakamilika/kughairiwa)? Auto-release ya muuzaji pekee
 * inasubiri — malipo ya muuzaji + carrier yatafanywa na deliveryComplete. */
async function orderHasActiveDelivery(orderId, od) {
    const seen = new Set();
    const rides = [];
    for (const rid of [od && od.rideRequestId, od && od.deliveryId]) {
        const id = String(rid || '');
        if (id && id.indexOf('/') === -1 && !seen.has(id)) {
            seen.add(id);
            const s = await db.doc('ride_requests/' + id).get();
            if (s.exists) rides.push(s.data() || {});
        }
    }
    const q = await db.collection('ride_requests').where('orderId', '==', orderId).limit(10).get();
    q.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); rides.push(d.data() || {}); } });
    return rides.some(rd => rd.driverId && rd.acceptedAt
        && ['completed', 'cancelled'].indexOf(String(rd.status || '')) === -1
        && String(rd.custodyStage || '') !== 'completed');
}

/* ============================================================
 * 2) walletAdjust — kituo kimoja cha mabadiliko ya salio
 *    (atomic + idempotent + wallet_ledger audit trail)
 * ========================================================== */
exports.walletAdjust = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const docId = String(data.docId || '');
    const amountTSh = Number(data.amountTSh);
    const type = String(data.type || 'adjustment');
    const rawLedgerKey = String(data.ledgerKey || ('auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)));
    const note = String(data.note || '').slice(0, 300);

    if (!docId || docId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'docId inahitajika.');
    if (!Number.isFinite(amountTSh) || amountTSh === 0) {
        throw new HttpsError('invalid-argument', 'amountTSh lazima iwe namba isiyo sifuri.');
    }
    const CAP = Number(process.env.WALLET_MAX_ABS || 50000000);
    if (Math.abs(amountTSh) > CAP) {
        throw new HttpsError('out-of-range', 'Kiasi kinazidi kikomo cha muamala mmoja (' + CAP + ').');
    }

    const userRef = db.doc('users/' + docId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'Akaunti ya mtumiaji haipatikani (users/' + docId + ').');
    const ud = userSnap.data() || {};

    /* [PHASE 1 SECURITY 2026-09] Uidhinishaji wa SERVER:
     *  • Admin (custom claim `admin` au ADMIN_EMAILS iliyothibitishwa) — anaweza
     *    kurekebisha wallet yoyote (mf. suluhu ya migogoro / split refund).
     *  • Mtumiaji wa kawaida — wallet YAKE TU:
     *      - kutoa (amount < 0): ruhusa (anatumia salio lake mwenyewe);
     *      - kuongeza (amount > 0): TU kwa ushahidi wa server:
     *          'deposit'/'wallet_topup' → muamala wa PesaPal uliothibitishwa;
     *          'commission' (purpose offline_registration) → ada ya usajili
     *          iliyolipwa PesaPal + mwanachama aliyesajiliwa na wakala huyu.
     *    Aina nyingine zote za kuongeza (payout, escrow_release, refund...)
     *    zinafanyika NDANI ya server (escrowRelease/deliveryComplete/...).
     *  • ledgerKey ya mtumiaji wa kawaida inawekwa namespace yake (u_<uid>_…)
     *    ili asiweze "kukalia" funguo za server (order_*_released, splink_buy_*). */
    const admin_ = isAdmin(req);
    const ownsWallet = (docId === auth.uid) || (String(ud.uid || '') === auth.uid);
    let ledgerKey = rawLedgerKey;
    let pesapalUse = null;      // { tx, amount } — matumizi ya muamala wa PesaPal
    let ledgerExtra = {};

    if (!admin_) {
        if (!ownsWallet) {
            throw new HttpsError('permission-denied', 'Huwezi kubadilisha wallet ya mtumiaji mwingine.');
        }
        if (amountTSh > 0) {
            if (type === 'deposit' || type === 'wallet_topup') {
                const tid = String(data.orderTrackingId || '').trim()
                    || (rawLedgerKey.indexOf('deposit_') === 0 ? rawLedgerKey.slice('deposit_'.length) : '');
                if (!tid) throw new HttpsError('failed-precondition', 'Deposit inahitaji muamala wa PesaPal (orderTrackingId).');
                const tx = await ppVerifyTransaction(tid);
                if (!tx.paid) throw new HttpsError('failed-precondition', 'Malipo ya PesaPal hayajathibitishwa (' + (tx.reason || 'not_paid') + ').');
                if (!sameMoney(moneyOf(amountTSh), tx.amount)) {
                    throw new HttpsError('failed-precondition', 'Kiasi cha deposit hakilingani na kilicholipwa PesaPal.');
                }
                const initUid = await ppInitiatorUid(tx);
                if (initUid && initUid !== auth.uid) throw new HttpsError('permission-denied', 'Muamala huu wa PesaPal si wako.');
                pesapalUse = { tx, amount: moneyOf(amountTSh), target: 'deposit_' + docId };
                ledgerKey = 'pesapal_deposit_' + safeKey(tx.trackingId); // muamala mmoja = deposit moja
                ledgerExtra = { pesapalTrackingId: tx.trackingId, verifiedBy: 'pesapal' };
            } else if (type === 'commission' && String(data.purpose || '') === 'offline_registration') {
                const COMMISSION = Number(process.env.OFFLINE_REG_COMMISSION || 1260);
                const FEE = Number(process.env.OFFLINE_REG_FEE || 2100);
                const memberUid = String(data.memberUid || '').trim();
                const tid = String(data.orderTrackingId || '').trim();
                if (!memberUid || !tid) throw new HttpsError('failed-precondition', 'Kamisheni inahitaji memberUid na muamala wa PesaPal.');
                if (!sameMoney(moneyOf(amountTSh), COMMISSION)) throw new HttpsError('failed-precondition', 'Kiasi cha kamisheni si sahihi.');
                const ms = await db.doc('users/' + memberUid).get();
                const md = ms.exists ? (ms.data() || {}) : {};
                if (!ms.exists || String(md.registeredThroughAgentId || md.managedByAgentUid || '') !== auth.uid) {
                    throw new HttpsError('permission-denied', 'Mwanachama huyu hakusajiliwa na wewe.');
                }
                const tx = await ppVerifyTransaction(tid);
                if (!tx.paid || tx.amount + MONEY_EPS < FEE) throw new HttpsError('failed-precondition', 'Ada ya usajili haijathibitishwa na PesaPal.');
                const initUid = await ppInitiatorUid(tx);
                if (initUid && initUid !== auth.uid) throw new HttpsError('permission-denied', 'Muamala huu wa PesaPal si wako.');
                pesapalUse = { tx, amount: tx.amount, target: 'offreg_' + memberUid };
                ledgerKey = 'offreg_' + safeKey(memberUid); // mwanachama mmoja = kamisheni moja
                ledgerExtra = { pesapalTrackingId: tx.trackingId, verifiedBy: 'pesapal', memberUid };
            } else {
                throw new HttpsError('permission-denied', 'Huwezi kujiongezea salio mwenyewe (type: ' + type + ').');
            }
        } else {
            ledgerKey = 'u_' + safeKey(auth.uid) + '_' + safeKey(rawLedgerKey);
        }
    }
    const ledgerRef = db.doc('wallet_ledger/' + ledgerKey);
    const usageRef = pesapalUse ? db.collection(ESCROW_HOLDS).doc('pptx_' + safeKey(pesapalUse.tx.trackingId)) : null;
    // [PHASE 1 VERIFY 2026-09] Suluhu ya mgogoro ya ADMIN (21-sokopay.js:
    // 'dispwin_<id>_<winner>' na 'splitref_<buyer|seller>_<id>') hulipa pesa ya
    // escrow — hivyo ushahidi wa escrow wa oda/link hiyo UNATUMIKA (released).
    // Bila hili, hali ya oda (client-writable) ingerudishwa 'held'/'shipped'
    // na escrowRelease/auto-release zingelipa MARA YA PILI.
    // [REPAIR 2026-10 §4] An admin cannot change a balance silently: a written
    // reason is required and an audit record is written in the same transaction.
    const adminActing = admin_ && !(ownsWallet && amountTSh < 0);
    if (adminActing && note.trim().length < 5) {
        throw new HttpsError('invalid-argument', 'Admin: andika sababu (note) ya mabadiliko haya ya wallet (angalau herufi 5).');
    }
    const disputeTarget = admin_ ? adminDisputeTarget(rawLedgerKey) : null;
    const disputeId = disputeTarget ? disputeTarget.id : null;
    if (disputeId && !(amountTSh > 0)) {
        throw new HttpsError('invalid-argument', 'Suluhu ya mgogoro lazima iwe kiasi chanya.');
    }

    let applied = false;
    await db.runTransaction(async (t) => {
        applied = false;
        const ls = await t.get(ledgerRef);
        if (ls.exists) return; // idempotent — tayari imetekelezwa
        const us = await t.get(userRef);
        if (!us.exists) throw new Error('USER_MISSING');
        let usage = null;
        if (usageRef) {
            const u = await t.get(usageRef);
            usage = u.exists ? (u.data() || {}) : {};
            const used = Number(usage.usedAmount || 0);
            if (used + pesapalUse.amount > pesapalUse.tx.amount + MONEY_EPS) {
                throw new HttpsError('failed-precondition', 'Muamala huu wa PesaPal tayari umetumika.');
            }
        }
        /* [PHASE 2 P5] Suluhu ya mgogoro ya admin imefungwa kwenye ushahidi
         * HALISI wa escrow (escrow_holds / ledger ya server ya wallet-link) —
         * si order.amount/status ya kivinjari:
         *  • hold lazima iwepo;
         *  • hold iliyotolewa na njia ya kawaida (release/auto/delivery) → KATAA;
         *  • jumla ya malipo ya mgogoro (disputePaid) ≤ hold.amount (split = sehemu);
         *  • mpokeaji: 'buyer' = aliyelipa (payer), 'seller' = muuzaji wa oda/link. */
        const disputeHolds = [];       // holds nyingine zinazowakilisha fedha hiyo hiyo
        let dispHold = null;           // { id, data, synth }
        if (disputeId) {
            const os = await t.get(db.doc('orders/' + disputeId));
            const ls2 = await t.get(db.doc('sokopay_links/' + disputeId));
            const od = os.exists ? (os.data() || {}) : null;
            const ld = ls2.exists ? (ls2.data() || {}) : null;
            const cands = [];
            if (od) cands.push('order_' + disputeId);
            const itemId = od ? String(od.itemId || '') : '';
            let itemLink = null;
            if (itemId && itemId.indexOf('/') === -1 && itemId !== disputeId) {
                const li = await t.get(db.doc('sokopay_links/' + itemId));
                if (li.exists) { cands.push('link_' + itemId); itemLink = { id: itemId, data: li.data() || {} }; }
            }
            if (ld) cands.push('link_' + disputeId);
            const snaps = [];
            for (const h of cands) snaps.push(await t.get(db.collection(ESCROW_HOLDS).doc(h)));
            snaps.forEach((hs, i) => {
                if (!hs.exists) return;
                const hd = hs.data() || {};
                if (hd.released === true && hd.releasedFor !== 'admin_dispute') {
                    throw new HttpsError('failed-precondition', 'Escrow hii tayari imetolewa (' + (hd.releasedFor || 'release') + '). Suluhu ya mgogoro haiwezi kulipa mara ya pili.');
                }
                if (!dispHold && Number(hd.amount || 0) > 0) dispHold = { id: cands[i], data: hd };
                else disputeHolds.push(cands[i]);
            });
            if (!dispHold) {
                // Link ya zamani iliyolipwa kwa wallet (ledger ya server splink_buy_<id>).
                const legacyLink = ld ? { id: disputeId, data: ld } : itemLink;
                if (legacyLink) {
                    const lg = await t.get(db.doc('wallet_ledger/splink_buy_' + legacyLink.id));
                    const L = lg.exists ? (lg.data() || {}) : null;
                    if (L && String(L.callerUid || '') === String(legacyLink.data.buyerId || '')
                        && sameMoney(-moneyOf(L.amountTSh), moneyOf(legacyLink.data.price))) {
                        dispHold = { id: 'link_' + legacyLink.id, synth: true, data: {
                            kind: 'escrow_hold', target: 'link', targetId: legacyLink.id, amount: moneyOf(legacyLink.data.price),
                            payerUid: String(legacyLink.data.buyerId || ''), payeeUid: String(legacyLink.data.userId || ''),
                            method: 'wallet_legacy', released: false } };
                    }
                }
            }
            if (!dispHold) throw new HttpsError('failed-precondition', 'Hakuna escrow iliyothibitishwa na server kwa mgogoro huu.');
            const hd = dispHold.data;
            const paidSoFar = Number(hd.disputePaid || 0);
            const remaining = moneyOf(hd.amount) - paidSoFar;
            if (!(remaining > MONEY_EPS)) throw new HttpsError('failed-precondition', 'Escrow ya mgogoro huu imeshatumika yote.');
            if (moneyOf(amountTSh) > remaining + MONEY_EPS) {
                throw new HttpsError('failed-precondition', 'Kiasi kinazidi escrow iliyobaki (TSh ' + remaining + ').');
            }
            const src = od || ld || {};
            const buyerUid = String(hd.payerUid || src.buyerId || '');
            const sellerUid = String(hd.payeeUid || (od ? od.sellerId : (ld ? ld.userId : '')) || '');
            const want = disputeTarget.role === 'buyer' ? buyerUid : sellerUid;
            const who = String(us.data().uid || docId);
            if (!want || (who !== want && docId !== want)) {
                throw new HttpsError('permission-denied', 'Mpokeaji si ' + (disputeTarget.role === 'buyer' ? 'mnunuzi' : 'muuzaji') + ' wa escrow hii.');
            }
            dispHold.newPaid = paidSoFar + moneyOf(amountTSh);
        }
        const cur = Number(us.data().walletBalance || 0);
        const next = cur + amountTSh;
        if (next < 0) throw new HttpsError('failed-precondition', 'INSUFFICIENT_BALANCE: Salio halitoshi.');

        t.set(ledgerRef, Object.assign({
            userId: docId,
            callerUid: auth.uid,
            amountTSh,
            type,
            note,
            byAdmin: admin_,
            createdAt: new Date().toISOString()
        }, ledgerExtra));
        t.update(userRef, { walletBalance: FieldValue.increment(amountTSh) });
        if (adminActing) {
            t.set(db.collection('admin_audit_log').doc(), {
                action: disputeTarget ? 'DISPUTE_PAYOUT' : 'WALLET_ADJUST',
                actorUid: auth.uid, actorEmail: (auth.token && auth.token.email) || null, actorRole: 'admin',
                target: { kind: 'wallet', userDocId: docId }, details: { amountTSh, type, ledgerKey, note, balanceBefore: cur },
                createdAt: new Date().toISOString()
            });
        }
        if (dispHold) {
            const nowIso = new Date().toISOString();
            t.set(db.collection(ESCROW_HOLDS).doc(dispHold.id), Object.assign(dispHold.synth ? dispHold.data : {}, {
                released: true, releasedAt: dispHold.data.releasedAt || nowIso, releasedFor: 'admin_dispute',
                releaseTrigger: 'admin_dispute', resolutionLedgerId: ledgerKey,
                disputePaid: dispHold.newPaid,
                disputeLedgerIds: FieldValue.arrayUnion(ledgerKey)
            }), { merge: true });
        }
        disputeHolds.filter(h => !dispHold || h !== dispHold.id).forEach(h => t.set(db.collection(ESCROW_HOLDS).doc(h), {
            released: true, releasedAt: new Date().toISOString(), releasedFor: 'admin_dispute',
            releaseTrigger: 'admin_dispute', resolutionLedgerId: ledgerKey
        }, { merge: true }));
        if (usageRef) {
            const targets = Array.isArray(usage.targets) ? usage.targets.slice() : [];
            targets.push(pesapalUse.target);
            t.set(usageRef, {
                kind: 'pesapal_tx', trackingId: pesapalUse.tx.trackingId,
                merchantReference: pesapalUse.tx.merchantReference || null,
                paidAmount: pesapalUse.tx.amount,
                usedAmount: Number(usage.usedAmount || 0) + pesapalUse.amount,
                targets, updatedAt: new Date().toISOString()
            }, { merge: true });
        }
        applied = true;
    });

    if (!applied) {
        const existing = await ledgerRef.get();
        return {
            ok: true, already: true, ledgerId: ledgerKey,
            amountTSh: (existing.data() && existing.data().amountTSh) || 0
        };
    }
    return { ok: true, docId, amountTSh, type, ledgerId: ledgerKey };
});

/* ============================================================
 * 3) escrowRelease — kutoa escrow ya marketplace ODA
 *    (smart-split atomic: muuzaji + carrier + wakala + platform)
 * ========================================================== */
exports.escrowRelease = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const orderId = String((req.data || {}).orderId || '');
    if (!orderId || orderId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'orderId inahitajika.');

    const orderSnap = await db.doc('orders/' + orderId).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Oda haipatikani.');
    const o = orderSnap.data() || {};

    // [PHASE 1 SECURITY 2026-09] Mnunuzi wa oda (kutoka hali ya server) au admin PEKEE.
    const admin_ = isAdmin(req);
    const isBuyer = String(o.buyerId || '') === auth.uid;
    if (!admin_ && !isBuyer) {
        throw new HttpsError('permission-denied', 'Ni mnunuzi wa oda hii (au admin) pekee anayeweza kutoa escrow.');
    }
    if (o.status === 'disputed' || await hasOpenDispute('order', orderId)) {
        throw new HttpsError('failed-precondition', 'Kuna mgogoro ulio wazi. Uamuzi wa Admin (adminResolveDispute) unahitajika.');
    }
    // [REPAIR 2026-10 §4] Admin override (not the buyer) needs a written reason
    // and leaves a permanent audit record.
    if (admin_ && !isBuyer) {
        const reason = String((req.data || {}).reason || '').trim();
        if (reason.length < 10) throw new HttpsError('invalid-argument', 'Admin: andika sababu ya kutoa escrow kwa niaba ya mnunuzi (angalau herufi 10).');
        const r = await releaseOrderEscrow(orderId, { callerUid: auth.uid, trigger: 'admin' });
        await adminAuth.writeAudit(req, 'ESCROW_RELEASE_OVERRIDE', { kind: 'order', id: orderId }, { reason, already: !!(r && r.already) });
        return r;
    }
    const r = await releaseOrderEscrow(orderId, { callerUid: auth.uid, trigger: 'buyer' });
    if (r && r.ok && !r.already) { try { await db.doc('orders/' + orderId).update({ buyerConfirmedAt: new Date().toISOString() }); } catch (e) {} }
    return r;
});

/* Utoaji wa escrow ya ODA — smart-split atomic (muuzaji + carrier + wakala +
 * platform). Inatumiwa na escrowRelease, deliveryComplete na auto-release.
 * Uidhinishaji wa MPIGAJI unafanywa na function inayoita; hapa tunathibitisha
 * hali ya server: wahusika, hali ya oda, ushahidi wa malipo na kiasi.
 *   ctx.trigger:  'buyer' | 'admin' | 'delivery_complete' | 'auto_release'
 *   ctx.carrier:  { rideId, driverUid, amount } — (deliveryComplete) au null
 *   ctx.noCarrier: true → usitafute carrier (auto-release: tabia ya awali)
 *   ctx.requireStatus: hali pekee inayokubalika (auto-release: 'shipped') */
async function releaseOrderEscrow(orderId, ctx) {
    ctx = ctx || {};
    const orderRef = db.doc('orders/' + orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Oda haipatikani.');
    const o = orderSnap.data() || {};

    const alreadyResult = () => ({
        ok: true, already: true, orderId,
        split: {
            sellerEarned: Number(o.sellerEarned || 0),
            carrierShare: Number(o.carrierEarned || 0),
            platformFee: Number(o.commission || 0)
        }
    });
    // [PHASE 2 P3] 'completed' ya oda PEKEE si ushahidi wa malipo (status ilikuwa
    // client-writable). "already" TU ikiwa marker ya release ipo au hold
    // imeshatumika; vinginevyo escrow iliyokwama bado inaweza kutolewa.
    let stuckCompleted = false;
    if (o.status === 'completed') {
        if (ctx.requireStatus) return alreadyResult();
        const mk = await db.doc('wallet_ledger/order_' + orderId + '_released').get();
        if (mk.exists) return alreadyResult();
        const ev0 = await getEscrowEvidence('order', orderId, o, { recheckPesaPal: false });
        if (!ev0.ok || !ev0.hold || ev0.hold.released === true) return alreadyResult();
        stuckCompleted = true;
    }
    // [PHASE 2 P4] 'delivered' (MARK_DELIVERED / CONFIRM_HANDOVER) inakubalika kwa
    // uthibitisho ulioidhinishwa (mnunuzi/admin/uwasilishaji) — si auto-release.
    const okStatuses = ctx.requireStatus ? [ctx.requireStatus]
        : ['held', 'shipped', 'awaiting_pickup', 'in_transit', 'delivered'].concat(stuckCompleted ? ['completed'] : []);
    if (okStatuses.indexOf(o.status) === -1) {
        throw new HttpsError('failed-precondition', 'Oda si kwenye escrow (status: ' + o.status + ').');
    }
    // [PHASE 3] A paid order whose goods were not secured (late payment, no stock)
    // is under review: its escrow can only be refunded or re-reserved by admin.
    if (stockCore.escrowReleaseBlocked(o)) {
        throw new HttpsError('failed-precondition', 'Oda iko kwenye ukaguzi wa stock/refund (' + o.inventoryReviewState + '); escrow haiwezi kutolewa.');
    }

    const sellerId = String(o.sellerId || '');
    const buyerId = String(o.buyerId || '');
    const itemId = String(o.itemId || '');
    if (!sellerId || !buyerId) throw new HttpsError('failed-precondition', 'Oda haina mnunuzi/muuzaji halali.');
    if (sellerId === buyerId) throw evidenceError({ reason: 'self_trade' });

    // Ushahidi wa malipo wa SERVER (si status ya kivinjari).
    const ev = await getEscrowEvidence('order', orderId, o, { recheckPesaPal: true });
    if (!ev.ok) throw evidenceError(ev);
    const orderAmount = moneyOf(o.amount);
    if (!(orderAmount > 0) || !sameMoney(orderAmount, ev.amount)) throw evidenceError({ reason: 'amount_mismatch' });
    const totalAmount = ev.amount;

    // [ADMIN PAYMENTS SWITCH] Global OFF = FREE → kamisheni 0.
    const platformFee = (await paymentGate('commission')) ? Math.round(totalAmount * 0.05) : 0;
    const maxCarrier = Math.max(0, totalAmount - platformFee);

    // Carrier: safari ILIYOUNGANISHWA na oda hii, iliyokubaliwa na SERVER
    // (acceptedAt) na iliyobeba mzigo (custodyStage transit/completed).
    // [PHASE 2 P1] Nauli ya carrier = agreedFare iliyogandishwa na SERVER wakati
    // wa kukubali (deliveryAccept/deliveryOfferAccept) PEKEE — hakuna fallback kwa
    // fare/price (client-editable) wala 15%. Kwa oda ya bidhaa, makabidhiano ya
    // mwanzo lazima yamethibitishwa na MUUZAJI HALISI (sellerConfirmedBy).
    let carrierShare = 0, driverId = null, rideDocId = null;
    if (ctx.carrier && ctx.carrier.driverUid) {
        driverId = String(ctx.carrier.driverUid);
        rideDocId = ctx.carrier.rideId || null;
        const want = Number(ctx.carrier.amount) > 0 ? Number(ctx.carrier.amount) : 0;
        carrierShare = Math.min(Math.max(0, want), maxCarrier);
    } else if (!ctx.noCarrier) {
        try {
            const cands = [];
            const linkedId = String(o.rideRequestId || o.deliveryId || '');
            if (linkedId && linkedId.indexOf('/') === -1) {
                const s = await db.doc('ride_requests/' + linkedId).get();
                if (s.exists) cands.push(s);
            }
            const q = await db.collection('ride_requests').where('orderId', '==', orderId).limit(5).get();
            q.forEach(d => cands.push(d));
            const match = cands.find(d => {
                const rd = d.data() || {};
                return rd.driverId && rd.acceptedAt && String(rd.customerId || '') === buyerId
                    && String(rd.orderId || '') === orderId
                    && ['transit', 'handover', 'completed'].indexOf(String(rd.custodyStage || '')) !== -1
                    && carrierRideEligible(rd, o);
            });
            if (match) {
                const rd = match.data();
                rideDocId = match.id;
                driverId = rd.driverId;
                carrierShare = Math.min(Math.max(0, Number(rd.agreedFare || 0)), maxCarrier);
            }
        } catch (e) { /* carrier ni hiari */ }
    }
    if (driverId && driverId === buyerId) { driverId = null; carrierShare = 0; } // mnunuzi hajilipi mwenyewe
    if (driverId && driverId === sellerId) { driverId = null; carrierShare = 0; } // [PHASE 2 P1] muuzaji hapati "nauli" juu ya mauzo
    if (!driverId) carrierShare = 0;
    const sellerEarned = Math.max(0, totalAmount - platformFee - carrierShare);

    // tafuta docs za wahusika
    let sellerDocId = null, sellerAgentCode = null;
    const sdoc = await userDocFor(sellerId);
    if (sdoc) { sellerDocId = sdoc.id; sellerAgentCode = sdoc.data.agentCode || null; }
    let driverDocId = null;
    if (driverId) { const ddoc = await userDocFor(driverId); if (ddoc) driverDocId = ddoc.id; }
    let agentDocId = null, agentUid = null, agentShare = 0, adminShare = platformFee;
    if (sellerAgentCode) {
        const aq = await db.collection('users').where('myAgentCode', '==', sellerAgentCode).limit(1).get();
        if (!aq.empty) {
            const au = aq.docs[0].data();
            if (String(au.uid || '') !== sellerId && String(au.uid || '') !== buyerId) {
                agentDocId = aq.docs[0].id;
                agentUid = au.uid || null;
                agentShare = Math.round(platformFee * 0.60);
                adminShare = platformFee - agentShare;
            }
        }
    }

    const releaseKey = 'order_' + orderId + '_released';
    const sellerKey = 'order_' + orderId + '_seller';
    const carrierKey = 'order_' + orderId + '_carrier';
    const agentKey = 'order_' + orderId + '_agent';
    const holdRef = db.collection(ESCROW_HOLDS).doc(ev.holdId);
    const now = new Date().toISOString();
    const callerUid = String(ctx.callerUid || 'system');

    let applied = false, alreadyReleased = false;
    await db.runTransaction(async (t) => {
        applied = false; alreadyReleased = false;
        const rel = await t.get(db.doc('wallet_ledger/' + releaseKey));
        if (rel.exists) { alreadyReleased = true; return; } // tayari ilitolewa (idempotent)
        const cur = await t.get(orderRef);
        const co = cur.data() || {};
        if (okStatuses.indexOf(co.status) === -1 || !sameMoney(moneyOf(co.amount), totalAmount)
            || String(co.buyerId || '') !== buyerId || String(co.sellerId || '') !== sellerId) {
            throw new HttpsError('aborted', 'Oda imebadilika wakati wa kutoa escrow. Jaribu tena.');
        }
        const hs = await t.get(holdRef);
        if (hs.exists && hs.data().released === true) { alreadyReleased = true; return; } // chanzo kimeshatumika
        if ((hs.exists && hs.data().blocked === true) || stockCore.escrowReleaseBlocked(co)) {
            throw new HttpsError('failed-precondition', 'Escrow imezuiwa kwa ukaguzi wa stock/refund.');
        }
        let linkRef = null, linkSnap = null;
        if (itemId && itemId.indexOf('/') === -1) {
            linkRef = db.doc('sokopay_links/' + itemId);
            linkSnap = await t.get(linkRef);
        }

        t.set(holdRef, Object.assign(hs.exists ? {} : {
            kind: 'escrow_hold', target: ev.holdId.split('_')[0], targetId: ev.holdId.slice(ev.holdId.indexOf('_') + 1),
            amount: totalAmount, payerUid: buyerId, method: (ev.hold && ev.hold.method) || 'wallet_legacy', verifiedAt: now
        }, { released: true, releasedAt: now, releasedFor: 'order_' + orderId, releaseTrigger: ctx.trigger || 'buyer' }), { merge: true });
        t.set(db.doc('wallet_ledger/' + releaseKey), {
            orderId, type: 'escrow_release_marker', callerUid, trigger: ctx.trigger || 'buyer',
            holdId: ev.holdId, amount: totalAmount, createdAt: now
        });
        const orderPatch = {
            status: 'completed', commission: platformFee,
            carrierEarned: carrierShare, sellerEarned, completedAt: now
        };
        if (ctx.trigger === 'auto_release') { orderPatch.autoReleased = true; orderPatch.autoReleasedAt = now; }
        t.update(orderRef, orderPatch);
        if (rideDocId && !ctx.carrier) t.update(db.doc('ride_requests/' + rideDocId), { status: 'completed' });
        if (linkSnap && linkSnap.exists) t.update(linkRef, { status: 'completed', completedAt: now });

        if (sellerDocId && sellerEarned > 0) {
            t.set(db.doc('wallet_ledger/' + sellerKey), {
                userId: sellerDocId, callerUid, amountTSh: sellerEarned,
                type: 'escrow_release', note: 'Escrow release — muuzaji', createdAt: now
            });
            t.update(db.doc('users/' + sellerDocId), { walletBalance: FieldValue.increment(sellerEarned) });
        }
        if (driverDocId && carrierShare > 0) {
            t.set(db.doc('wallet_ledger/' + carrierKey), {
                userId: driverDocId, callerUid, amountTSh: carrierShare,
                type: 'escrow_release', note: 'Escrow release — carrier', rideId: rideDocId || null, createdAt: now
            });
            t.update(db.doc('users/' + driverDocId), { walletBalance: FieldValue.increment(carrierShare) });
        }
        if (agentDocId && agentShare > 0) {
            t.set(db.doc('wallet_ledger/' + agentKey), {
                userId: agentDocId, callerUid, amountTSh: agentShare,
                type: 'escrow_release', note: 'Escrow release — kamisheni ya wakala', createdAt: now
            });
            t.update(db.doc('users/' + agentDocId), { walletBalance: FieldValue.increment(agentShare) });
        }

        t.set(db.collection('adminRevenue').doc(), {
            type: 'commission', amount: adminShare, orderId, date: now
        });
        applied = true;
    });

    if (alreadyReleased) {
        const fresh = (await orderRef.get()).data() || {};
        return {
            ok: true, already: true, orderId,
            split: { sellerEarned: Number(fresh.sellerEarned || 0), carrierShare: Number(fresh.carrierEarned || 0), platformFee: Number(fresh.commission || 0) }
        };
    }

    // taarifa (baada ya transaction — si muhimu kuwa atomic)
    try {
        if (sellerId) {
            await db.collection('notifications').add({
                userId: sellerId, title: ' SokoPay: Mauzo Yamekamilika!',
                body: 'Mnunuzi amethibitisha mapokezi. TSh ' + sellerEarned.toLocaleString() + ' imeingizwa kwenye wallet yako.',
                createdAt: now, read: false
            });
        }
        if (driverId && carrierShare > 0) {
            await db.collection('notifications').add({
                userId: driverId, title: ' SokoPay: Malipo ya Usafiri Yamepokelewa!',
                body: 'Mteja amethibitisha kupokea mzigo. TSh ' + carrierShare.toLocaleString() + ' imeingizwa kwenye wallet yako.',
                createdAt: now, read: false
            });
        }
        if (agentUid && agentShare > 0) {
            await db.collection('notifications').add({
                userId: agentUid, title: ' SokoPay: Kamisheni Mpya ya Uwakala!',
                body: 'Mteja wako amefanya mauzo. Umepata TSh ' + agentShare.toLocaleString() + '.',
                createdAt: now, read: false
            });
        }
    } catch (e) { /* notifications si muhimu ku-crash */ }

    return {
        ok: true, orderId, ledgerId: releaseKey, applied,
        split: { sellerEarned, carrierShare, platformFee }
    };
}

/* ============================================================
 * 4) haipayReleaseLink — kutoa escrow ya SokoPay payment link
 * ========================================================== */
exports.haipayReleaseLink = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const linkId = String((req.data || {}).linkId || '');
    if (!linkId || linkId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'linkId inahitajika.');
    const linkSnap = await db.doc('sokopay_links/' + linkId).get();
    if (!linkSnap.exists) throw new HttpsError('not-found', 'Link haipatikani.');
    const L = linkSnap.data() || {};
    // [PHASE 1 SECURITY 2026-09] Mnunuzi wa link (aliyelipa) au admin PEKEE.
    const admin_ = isAdmin(req);
    const isBuyer = String(L.buyerId || '') === auth.uid;
    if (!admin_ && !isBuyer) {
        throw new HttpsError('permission-denied', 'Ni mnunuzi aliyelipia link hii (au admin) pekee anayeweza kuitoa.');
    }
    if (admin_ && !isBuyer) {
        const reason = String((req.data || {}).reason || '').trim();
        if (reason.length < 10) throw new HttpsError('invalid-argument', 'Admin: andika sababu ya kutoa escrow ya link (angalau herufi 10).');
        const r = await releaseLinkEscrow(linkId, { callerUid: auth.uid, trigger: 'admin' });
        await adminAuth.writeAudit(req, 'LINK_RELEASE_OVERRIDE', { kind: 'link', id: linkId }, { reason });
        return r;
    }
    return releaseLinkEscrow(linkId, { callerUid: auth.uid, trigger: 'buyer' });
});

async function releaseLinkEscrow(linkId, ctx) {
    ctx = ctx || {};
    const linkRef = db.doc('sokopay_links/' + linkId);
    const linkSnap = await linkRef.get();
    if (!linkSnap.exists) throw new HttpsError('not-found', 'Link haipatikani.');
    const L = linkSnap.data() || {};

    if (L.status === 'completed') return { ok: true, already: true, linkId };
    if (L.status !== 'held') {
        throw new HttpsError('failed-precondition', 'Link si kwenye escrow (status: ' + L.status + ').');
    }
    const sellerId = String(L.userId || '');
    const buyerId = String(L.buyerId || '');
    if (!sellerId || !buyerId) throw new HttpsError('failed-precondition', 'Link haina mnunuzi/muuzaji halali.');
    if (sellerId === buyerId) throw evidenceError({ reason: 'self_trade' });

    const ev = await getEscrowEvidence('link', linkId, L, { recheckPesaPal: true });
    if (!ev.ok) throw evidenceError(ev);
    const price = moneyOf(L.price);
    if (!(price > 0) || !sameMoney(price, ev.amount)) throw evidenceError({ reason: 'amount_mismatch' });
    const totalAmount = ev.amount;

    // [ADMIN PAYMENTS SWITCH] Global OFF = FREE → kamisheni 0.
    const platformFee = (await paymentGate('commission')) ? Math.round(totalAmount * 0.05) : 0;
    const carrierShare = Math.min(Math.max(0, Number(L.carrierShare || 0)), Math.max(0, totalAmount - platformFee));
    const sellerEarned = Math.max(0, totalAmount - platformFee - carrierShare);

    let sellerDocId = null;
    const sdoc = await userDocFor(sellerId);
    if (sdoc) sellerDocId = sdoc.id;

    const releaseKey = ctx.trigger === 'auto_release' ? ('spauto_link_' + linkId) : ('spman_link_' + linkId);
    const holdRef = db.collection(ESCROW_HOLDS).doc(ev.holdId);
    const now = new Date().toISOString();
    const callerUid = String(ctx.callerUid || 'system');

    let applied = false;
    await db.runTransaction(async (t) => {
        applied = false;
        const hs = await t.get(holdRef);
        if (hs.exists && hs.data().released === true) return; // chanzo kimeshatumika (oda au link)
        const rel = await t.get(db.doc('wallet_ledger/' + releaseKey));
        if (rel.exists) return;
        const cur = await t.get(linkRef);
        const cl = cur.data() || {};
        if (cl.status !== 'held' || !sameMoney(moneyOf(cl.price), totalAmount)
            || String(cl.buyerId || '') !== buyerId || String(cl.userId || '') !== sellerId) return;

        t.set(holdRef, Object.assign(hs.exists ? {} : {
            kind: 'escrow_hold', target: 'link', targetId: linkId, amount: totalAmount,
            payerUid: buyerId, payeeUid: sellerId, method: (ev.hold && ev.hold.method) || 'wallet_legacy', verifiedAt: now
        }, { released: true, releasedAt: now, releasedFor: 'link_' + linkId, releaseTrigger: ctx.trigger || 'buyer' }), { merge: true });
        t.set(db.doc('wallet_ledger/' + releaseKey), {
            linkId, type: ctx.trigger === 'auto_release' ? 'haipay_auto_release' : 'haipay_release',
            callerUid, holdId: ev.holdId, amount: totalAmount, createdAt: now
        });
        const patch = { status: 'completed', sellerEarned, platformFee, completedAt: now };
        if (ctx.trigger === 'auto_release') { patch.autoReleased = true; patch.autoReleasedAt = now; }
        t.update(linkRef, patch);

        if (sellerDocId && sellerEarned > 0) {
            t.set(db.doc('wallet_ledger/' + releaseKey + '_seller'), {
                userId: sellerDocId, callerUid, amountTSh: sellerEarned,
                type: 'escrow_release', note: ctx.trigger === 'auto_release' ? 'SokoPay auto-release (saa 24) - mkataba' : 'SokoPay link release', createdAt: now
            });
            t.update(db.doc('users/' + sellerDocId), { walletBalance: FieldValue.increment(sellerEarned) });
        }
        t.set(db.collection('adminRevenue').doc(), {
            type: 'sokopay_commission', amount: platformFee, linkId, contractCode: L.code || null, date: now
        });
        applied = true;
    });
    if (!applied) return { ok: true, already: true, linkId };

    try {
        if (sellerId) {
            await db.collection('notifications').add({
                userId: sellerId, title: ' SokoPay: Link Imekamilika!',
                body: 'Mteja amethibitisha. TSh ' + sellerEarned.toLocaleString() + ' imewekwa kwenye wallet yako.',
                createdAt: now, read: false
            });
        }
        if (buyerId) {
            await db.collection('notifications').add({
                userId: buyerId, title: ' SokoPay: Escrow Imetolewa!',
                body: 'Uthibitisho umepokelewa; pesa imetumwa kwa muuzaji.',
                createdAt: now, read: false
            });
        }
    } catch (e) { /* hiari */ }

    return {
        ok: true, linkId, ledgerId: releaseKey,
        split: { sellerEarned, carrierShare, platformFee }
    };
}

/* ============================================================
 * 4b) sokopayLinkWalletPay — [PHASE 1 SECURITY 2026-09] kulipia SokoPay
 *     link kwa salio la wallet. ATOMIC: makato ya mnunuzi + link 'held' +
 *     ushahidi wa escrow (escrow_holds/link_<id>) katika transaction MOJA.
 *     Inachukua nafasi ya: walletAdjust(-price) + updateDoc(link 'held')
 *     ya kivinjari (hatua mbili zisizo za atomic, 'held' ya client).
 *     Inatumia wallet ILE ILE (users.walletBalance + wallet_ledger).
 * ========================================================== */
exports.sokopayLinkWalletPay = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const linkId = String(data.linkId || '');
    if (!linkId || linkId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'linkId inahitajika.');
    const buyer = await userDocFor(auth.uid);
    if (!buyer) throw new HttpsError('not-found', 'Akaunti yako haipatikani.');
    const linkRef = db.doc('sokopay_links/' + linkId);
    const buyerRef = db.doc('users/' + buyer.id);
    const holdRef = db.collection(ESCROW_HOLDS).doc('link_' + linkId);
    const ledgerRef = db.doc('wallet_ledger/splink_buy_' + linkId);
    const CAP = Number(process.env.WALLET_MAX_ABS || 50000000);
    const now = new Date().toISOString();
    let result = null;
    await db.runTransaction(async (t) => {
        const ls = await t.get(linkRef);
        if (!ls.exists) throw new HttpsError('not-found', 'Link haipatikani.');
        const L = ls.data() || {};
        const hs = await t.get(holdRef);
        if (hs.exists) {
            if (String(hs.data().payerUid || '') === auth.uid) { result = { ok: true, already: true, linkId }; return; }
            throw new HttpsError('failed-precondition', 'Link hii tayari imelipiwa.');
        }
        const led = await t.get(ledgerRef);
        if (led.exists) throw new HttpsError('failed-precondition', 'Link hii tayari imelipiwa.');
        if ((L.status || 'pending') !== 'pending') throw new HttpsError('failed-precondition', 'Link hii haiko wazi kwa malipo (status: ' + L.status + ').');
        const sellerId = String(L.userId || '');
        if (!sellerId) throw new HttpsError('failed-precondition', 'Link haina muuzaji.');
        if (sellerId === auth.uid) throw evidenceError({ reason: 'self_trade' });
        const price = moneyOf(L.price);
        if (!(price > 0) || price > CAP) throw new HttpsError('failed-precondition', 'Bei ya link si sahihi.');
        if (data.expectedPrice != null && !sameMoney(moneyOf(data.expectedPrice), price)) {
            throw new HttpsError('failed-precondition', 'Bei ya link imebadilika. Hakiki tena kabla ya kulipa.');
        }
        const bs = await t.get(buyerRef);
        const bal = Number((bs.data() || {}).walletBalance || 0);
        if (bal < price) throw new HttpsError('failed-precondition', 'INSUFFICIENT_BALANCE: Salio halitoshi.');

        t.set(ledgerRef, {
            userId: buyer.id, callerUid: auth.uid, amountTSh: -price, type: 'purchase',
            note: 'Ununuzi wa mkataba wa SokoPay kutoka wallet', linkId, createdAt: now
        });
        t.update(buyerRef, { walletBalance: FieldValue.increment(-price) });
        t.set(holdRef, {
            kind: 'escrow_hold', target: 'link', targetId: linkId, amount: price,
            payerUid: auth.uid, payeeUid: sellerId, method: 'wallet', source: 'sokopayLinkWalletPay',
            verifiedAt: now, released: false
        });
        const buyerName = String(data.buyerName || (bs.data() || {}).fullName || 'Mwanachama').slice(0, 120);
        t.update(linkRef, {
            status: 'held', buyerId: auth.uid,
            buyerName,
            paidAt: now, paymentType: 'Wallet Payout', paymentVerified: true, verifiedAmount: price
        });
        // [REPAIR 2026-10 C2] Tracking order is created by the SERVER in the same
        // transaction (the browser may no longer create 'held' orders). Its escrow
        // evidence is the link hold (getEscrowEvidence follows order.itemId).
        const trackRef = db.doc('orders/splink_' + safeKey(linkId));
        t.set(trackRef, {
            buyerId: auth.uid, buyerName,
            sellerId, sellerName: String(L.sellerName || L.ownerName || '').slice(0, 120),
            itemId: linkId, itemTitle: String(L.title || L.itemTitle || 'SokoPay').slice(0, 180),
            amount: price, quantity: 1, unitPrice: price, currency: 'TZS',
            status: 'held', paymentStatus: 'paid', paymentVerified: true, paymentVerifiedBy: 'wallet',
            verifiedAmount: price, paidAt: now, heldAt: now, paymentProtectedAt: now,
            paymentRef: String(L.code || linkId), paymentType: 'Wallet Payout',
            pricedByServer: true, priceSource: 'sokopay_link',
            commerceType: L.commerceType || 'product', source: 'sokopayLinkWalletPay',
            date: now, createdAt: now
        }, { merge: true });
        result = { ok: true, linkId, amount: price, sellerId, orderId: trackRef.id, title: String(L.title || 'SokoPay') };
    });
    // [PHASE 9 B-16] The seller learns about the payment from the SERVER (the
    // browser may no longer send "escrow funded" notices to other users).
    if (result && result.ok && result.sellerId) await notifyLinkEscrowFunded(db, linkId, result.sellerId, result.title, result.amount, 'wallet');
    return result;
});

/* [PHASE 9 B-16] Idempotent "escrow funded" notice for a SokoPay link
 * (server-only id prefix "escrow_", which the rules refuse to clients). */
async function notifyLinkEscrowFunded(db, linkId, sellerId, title, amount, method) {
    try {
        const amt = Number(amount || 0);
        await db.collection('notifications').doc('escrow_link_' + safeKey(linkId)).set({
            userId: String(sellerId), type: 'escrow', system: true,
            event: 'wallet.escrowFunded', params: { title: String(title || ''), amount: amt.toLocaleString() },
            title: ' SokoPay: Malipo ya Escrow Yamefungwa!',
            body: 'Mteja amelipia "' + String(title || 'mkataba') + '" (TSh ' + amt.toLocaleString() + ') kwa ' + (method === 'wallet' ? 'Wallet' : 'PesaPal')
                + '. Pesa imethibitishwa na server na iko salama kwenye Escrow ya SokoPay. Unaweza kuanza kazi/kusafirisha sasa.',
            linkId: String(linkId), createdAt: new Date().toISOString(), read: false
        }, { merge: true });
    } catch (e) { /* taarifa si kikwazo cha malipo */ }
}

/* ============================================================
 * 5) pesapalCheckout — kuanzisha malipo ya PesaPal (secret server-side)
 *    PesaPal haina USSD/mno push kama AzamPay: kila malipo hutumia
 *    redirect/iframe ya PesaPal → SubmitOrderRequest.
 * ========================================================== */
exports.pesapalCheckout = onCall({ region: REGION }, async (req) => {
    requireAuth(req);
    const d = req.data || {};
    const c = ppConfig();
    const amount = Number(d.amount);
    const orderTrackingId = String(d.orderTrackingId || ('SKH_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)));
    const description = String(d.description || 'SokoHai Purchase').slice(0, 180);
    const merchantReference = String(d.merchantReference || d.externalId || orderTrackingId);
    // [REPAIR 2026-10 M5] Only return to SokoHai's own origins (no open redirect).
    const allowedOrigins = String(process.env.PESAPAL_ALLOWED_RETURN_ORIGINS
        || 'https://sokohaimarket.netlify.app,https://sokohaicom.netlify.app' + (process.env.FUNCTIONS_EMULATOR === 'true' ? ',http://localhost:5000,http://127.0.0.1:5000' : ''))
        .split(',').map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
    let redirectUrl = String(d.redirectUrl || c.defaultCallback);
    try {
        const ru = new URL(redirectUrl);
        if (allowedOrigins.indexOf(ru.origin) === -1) redirectUrl = c.defaultCallback || allowedOrigins[0];
    } catch (e) { redirectUrl = c.defaultCallback || allowedOrigins[0]; }
    const email = String(d.email || '');
    const phone = String(d.phone || '').replace(/^0/, '255');
    const names = String(d.customerName || 'Mteja').split(/\s+/).filter(Boolean);
    const firstName = names[0] || 'Mteja';
    const lastName = names.slice(1).join(' ') || '-';

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new HttpsError('invalid-argument', 'Kiasi cha malipo si sahihi.');
    }

    const token = await pesapalToken().catch(e => {
        throw new HttpsError('internal', 'PesaPal (RequestToken): ' + ((e && e.message) || 'Muunganisho umeshindikana.'));
    });

    const body = {
        id: orderTrackingId,
        currency: 'TZS',
        amount: Math.round(amount * 100) / 100,
        description,
        callback_url: redirectUrl,
        billing_address: {
            email_address: email || undefined,
            phone_number: phone || undefined,
            first_name: firstName,
            last_name: lastName
        }
    };
    if (c.ipnId) body.notification_id = c.ipnId;

    let data = {};
    try {
        const r = await ppFetchJson(c.baseUrl + '/api/Transactions/SubmitOrderRequest', { method: 'POST', token, body });
        data = r.json || {};
    } catch (e) {
        throw new HttpsError('internal', 'PesaPal (SubmitOrderRequest): ' + ((e && e.message) || 'Muunganisho umeshindikana.'));
    }
    if (data.error && !data.redirect_url) {
        const msg = (data.error && (data.error.message || data.error)) || 'PesaPal imekataa ombi la malipo.';
        throw new HttpsError('internal', 'PesaPal (SubmitOrderRequest): ' + String(msg));
    }
    // [PHASE 1 SECURITY 2026-09] Rekodi ya server: nani alianzisha malipo haya
    // (merchant reference). settlePesaPalPayment/walletAdjust hukataa kufunga
    // oda/link/deposit ya mtu mwingine kwa muamala huu.
    try {
        await db.collection(ESCROW_HOLDS).doc('ppinit_' + safeKey(orderTrackingId)).create({
            kind: 'pesapal_init', uid: req.auth.uid, amount: body.amount, merchantReference: orderTrackingId,
            pesapalTrackingId: String(data.order_tracking_id || ''), createdAt: new Date().toISOString()
        });
    } catch (e) {
        const ex = await db.collection(ESCROW_HOLDS).doc('ppinit_' + safeKey(orderTrackingId)).get().catch(() => null);
        if (ex && ex.exists && String((ex.data() || {}).uid || '') !== req.auth.uid) {
            throw new HttpsError('already-exists', 'Rejea hii ya malipo tayari inatumika.');
        }
    }
    const redirectUrlOut = data.redirect_url || data.redirectUrl || null;
    if (!redirectUrlOut) {
        throw new HttpsError('internal', 'PesaPal haikurudisha URL ya malipo.');
    }
    return { ok: true, redirectUrl: redirectUrlOut, orderTrackingId, merchantReference };
});

/* ============================================================
 * 6) pesapalTransactionStatus — hali ya muamala wa PesaPal
 * ========================================================== */
exports.pesapalTransactionStatus = onCall({ region: REGION }, async (req) => {
    requireAuth(req);
    const d = req.data || {};
    const c = ppConfig();
    const orderTrackingId = String(d.orderTrackingId || d.externalId || '');
    if (!orderTrackingId) throw new HttpsError('invalid-argument', 'orderTrackingId inahitajika.');

    const token = await pesapalToken().catch(e => {
        throw new HttpsError('internal', 'PesaPal (RequestToken): ' + ((e && e.message) || 'Muunganisho umeshindikana.'));
    });
    let data = {};
    try {
        const r = await ppFetchJson(c.baseUrl + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + encodeURIComponent(orderTrackingId), { method: 'GET', token });
        data = r.json || {};
    } catch (e) {
        throw new HttpsError('internal', 'PesaPal (GetTransactionStatus): ' + ((e && e.message) || 'Muunganisho umeshindikana.'));
    }
    // [PHASE 1 SECURITY 2026-09] Ikiwa PesaPal inathibitisha COMPLETED, SERVER
    // inafunga oda/link zenye rejea hii (paymentRef / transactionId) —
    // kivinjari hakiandiki tena uthibitisho wa malipo kinachoaminiwa.
    let settled = [];
    const tx = ppTxFromStatus(data, orderTrackingId);
    if (tx.paid) {
        try { settled = (await settlePesaPalPayment(tx, 'status_check')).settled; }
        catch (e) { console.warn('[pesapalTransactionStatus] settle:', e && e.message); }
    }
    return { ok: true, raw: data, paid: isPesaPalPaid(data), settled };
});

/* ============================================================
 * 6b) postOrderPaymentProtectedEvent — oda ya majadiliano inapofungwa
 *     escrow ('held'), tuma tukio la mfumo NDANI ya chat (pande zote).
 *     Idempotent: tukio la 'protected' la oda hii lisirudiwe.
 * ========================================================== */
async function postOrderPaymentProtectedEvent(db, orderId, od, refKey, now) {
    const conversationId = od.conversationId;
    if (!conversationId) return; // oda za kikapu/legacy hazina thread ya chat
    try {
        const kind = od.commerceType || 'product';
        const qty = Number(od.quantity || 1);
        const unit = Number(od.unitPrice || 0);
        const amount = Number(od.amount != null ? od.amount : unit * qty);
        const snapshot = {
            orderId: String(orderId),
            orderNumber: od.orderNumber || null,
            commerceType: kind,
            itemsSummary: { kind: kind, title: od.itemTitle || 'Oda', quantity: qty, unitPrice: unit, amount: amount },
            amount: amount,
            totalAmount: amount,
            currency: od.currency || 'TZS',
            paymentStatus: 'paid',
            status: 'held',
            protected: true,
            paymentProtectedAt: now,
            paymentRef: refKey || null,
            negotiationId: od.negotiationId || null,
            conversationId: conversationId,
            sellerId: od.sellerId || null,
            buyerId: od.buyerId || null
        };
        // Kitambulisho THABITI (payprot_<oid>) + merge → tukio haliwezi kurudiwa
        // hata kama IPN inarudiwa au mteja naye alituma tukio lilelile.
        const protectedMsg = {
            senderId: 'system',
            senderName: 'SokoPay',
            system: true,
            type: 'order',
            eventKind: 'payment_protected',
            createdAt: now,
            readBy: [],
            replyToId: null,
            orderRef: { orderId: String(orderId) },
            orderSnapshot: snapshot,
            negotiationId: od.negotiationId || null,
            text: ''
        };
        await db.collection('conversations/' + conversationId + '/messages')
            .doc('payprot_' + String(orderId)).set(protectedMsg, { merge: true });
        await db.doc('conversations/' + conversationId).update({
            lastMessage: { text: '🛡 SokoPay Imelindwa · ' + (od.itemTitle || 'Oda'), senderId: 'system', at: now, type: 'order' },
            lastMessageAt: now,
            updatedAt: now
        }).catch(() => {});

        if (od.sellerId) {
            // Nayo idempotent (kitambulisho thabiti).
            await db.collection('notifications').doc('payprot_' + String(orderId)).set({
                userId: od.sellerId,
                title: '🛡 SokoPay: Malipo Yamelindwa',
                body: 'Oda #' + orderId + ' imelipwa na fedha zimehifadhiwa Escrow. Tayarisha oda.',
                createdAt: now, read: false, type: 'order',
                orderId: String(orderId), negotiationId: od.negotiationId || null
            }, { merge: true }).catch(() => {});
        }
    } catch (e) { /* tukio la chat si kikwazo cha IPN */ }
}

/* ============================================================
 * 7) pesapalIpn — (HTTP GET) PesaPal anaripoti malipo yalipokamilika
 *    URL: https://europe-west1-sokonet-3b847.cloudfunctions.net/pesapalIpn
 * ========================================================== */
exports.pesapalIpn = onRequest({ region: REGION }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Headers', 'Content-Type'); return res.status(204).send(''); }

    const q = req.query || {};
    const orderTrackingId = String(q.OrderTrackingId || q.orderTrackingId || q.order_tracking_id || '');
    const merchantReference = String(q.OrderMerchantReference || q.orderMerchantReference || '');
    const notificationType = String(q.OrderNotificationType || q.orderNotificationType || '');

    // Jibu la lazima kwa PesaPal: HTTP 200 + mwili huu
    const ackBody = {
        orderNotificationType: notificationType || 'IPNCHANGE',
        orderTrackingId,
        orderMerchantReference: merchantReference,
        status: 200
    };

    if (orderTrackingId || merchantReference) {
        try {
            // Kamwe usiamini IPN pekee — thibitisha hali halisi kwa GetTransactionStatus
            // [PHASE 1 SECURITY 2026-09] Uthibitisho + kiasi vinatoka PesaPal;
            // settlePesaPalPayment hufunga oda/link kwa rejea (tracking id AU
            // merchant_reference ya PesaPal) bila kuzidi kiasi kilicholipwa.
            // (Awali oda iliyowekwa 'held' na kivinjari iliachwa bila
            // uthibitisho wa server — sasa ushahidi ni escrow_holds.)
            const key = orderTrackingId || merchantReference;
            const tx = await ppVerifyTransaction(key);
            if (tx.paid) await settlePesaPalPayment(tx, 'ipn');
        } catch (e) { /* log tu */ }
    }

    return res.status(200).type('application/json').send(JSON.stringify(ackBody));
});

/* ============================================================
 * 7b) pesapalRegisterIpn — kusajili URL ya IPN (admin pekee)
 * ========================================================== */
exports.pesapalRegisterIpn = onCall({ region: REGION }, async (req) => {
    requireAuth(req);
    if (!isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee anaweza kusajili IPN.');
    const d = req.data || {};
    const c = ppConfig();
    const url = String(d.url || c.ipnUrl || '');
    if (!url) throw new HttpsError('invalid-argument', 'URL ya IPN inahitajika.');

    const token = await pesapalToken().catch(e => {
        throw new HttpsError('internal', 'PesaPal (RequestToken): ' + ((e && e.message) || 'Muunganisho umeshindikana.'));
    });
    let raw = null;
    try {
        const r = await ppFetchJson(c.baseUrl + '/api/URLSetup/RegisterIPN', {
            method: 'POST', token, body: { url, ipn_notification_type: 'GET' }
        });
        raw = r.json;
    } catch (e) {
        throw new HttpsError('internal', 'PesaPal (RegisterIPN): ' + ((e && e.message) || 'Muunganisho umeshindikana.'));
    }
    return { ok: true, raw };
});

/* ============================================================
 * 8) platformStatsRefresh / platformStatsHourly
 * ========================================================== */
async function recomputePlatformStats() {
    const snap = await db.collection('adminRevenue').get();
    let totalRevenue = 0;
    snap.forEach(d => { totalRevenue += Number(d.data().amount || 0); });
    await db.doc('platform_stats/current').set({
        totalRevenue,
        eventCount: snap.size,
        generatedAt: new Date().toISOString()
    });
    return { totalRevenue, eventCount: snap.size };
}

exports.platformStatsRefresh = onCall({ region: REGION }, async (req) => {
    requireAuth(req);
    if (!isAdmin(req)) throw new HttpsError('permission-denied', 'Wakala/admin pekee anaweza kusasisha stats.');
    const s = await recomputePlatformStats();
    return { ok: true, totalRevenue: s.totalRevenue, eventCount: s.eventCount };
});

exports.platformStatsHourly = onSchedule(
    { region: REGION, schedule: '0 * * * *', timeZone: 'Africa/Dar_es_Salaam' },
    async () => { await recomputePlatformStats(); }
);

/* ============================================================
 * [LIVE-FIX 2026-09] SokoPay Auto-Release — CRON YA SERVER
 *    Kabla: kila kivinjari kilikuwa kinaendesha runSokoPayTimeLockChronJob
 *    kila dakika 5 (setInterval) — kwa watumiaji 5000 hii ni mzigo mkubwa
 *    wa kusoma orders/sokopay_links zote + hatari ya double-release.
 *    Sasa: Cloud Scheduler inaendesha kila dakika 5 (server-side),
 *    atomic (transaction) + idempotent (wallet_ledger). Browser huendesha
 *    njia ya legacy TU wakati CRON_VIA_SERVER == false (fallback).
 * ========================================================== */
exports.sokopayAutoRelease = onSchedule(
    { region: REGION, schedule: '*/5 * * * *', timeZone: 'Africa/Dar_es_Salaam' },
    async (evt) => { await runSokoPayAutoRelease(evt); }
);

async function runSokoPayAutoRelease(evt) {
    // [PHASE 2 P3] Saa ya majaribio: kwenye EMULATOR PEKEE scheduleTime ya tukio
    // inaweza kusogeza saa (kuiga saa 24 zimepita). Production: Date.now() daima.
    const emuNow = process.env.FIRESTORE_EMULATOR_HOST && evt && evt.scheduleTime ? Date.parse(evt.scheduleTime) : 0;
    const nowMs = emuNow > 0 ? emuNow : Date.now();
    const timeLimitMs = 24 * 60 * 60 * 1000; // saa 24 za usalama
    const out = { orders: { released: 0, skipped: 0 }, links: { released: 0, skipped: 0 } };

    /* [PHASE 1 SECURITY 2026-09] Auto-release hutoa pesa TU pale server ina
     * ushahidi huru wa malipo (escrow_holds / ledger ya wallet ya server).
     * Rekodi zilizoandikwa na kivinjari (status 'held'/'shipped', paidAt,
     * shippedAt) pekee HAZITOSHI. Muda wa saa 24 unahesabiwa pia kuanzia
     * wakati SERVER ilipothibitisha malipo — tarehe ya client (shippedAt /
     * paidAt) haiwezi kurudishwa nyuma ili kuharakisha malipo. Utoaji
     * unatumia njia ZILEZILE za escrowRelease/haipayReleaseLink (atomic +
     * idempotent + hold moja = release moja). */
    function heldLongEnough(clientIso, ev) {
        const clientMs = clientIso ? Date.parse(clientIso) : 0;
        if (!(clientMs > 0 && (nowMs - clientMs) >= timeLimitMs)) return false;
        const verifiedMs = Date.parse((ev && ev.hold && ev.hold.verifiedAt) || '') || 0;
        return !(verifiedMs > 0 && (nowMs - verifiedMs) < timeLimitMs);
    }

    // [REPAIR 2026-10 H3] Policy-driven fallback release (see PHASE 3 header).
    // The old rule ("seller marks shipped, money moves 24h later") is removed:
    // a seller can no longer collect escrow without independent delivery proof.
    const cfg = await escrowConfig();
    out.config = cfg;
    // --- A. Orders with SERVER delivery proof, past the configured wait ---
    if (cfg.autoReleaseAfterDeliveryHours) {
        try {
            const delivered = await db.collection('orders').where('status', '==', 'delivered').limit(500).get();
            for (const snap of delivered.docs) {
                const od = snap.data() || {};
                const proofMs = Date.parse(od.deliveryProofAt || '') || 0;
                if (!proofMs || ['buyer_code', 'courier_token_c'].indexOf(String(od.deliveryProofBy || '')) === -1) { out.orders.skipped++; continue; }
                if (nowMs - proofMs < cfg.autoReleaseAfterDeliveryHours * 3600000) continue;
                if (await hasOpenDispute('order', snap.id)) { out.orders.skipped++; continue; }
                const ev = await getEscrowEvidence('order', snap.id, od, { recheckPesaPal: false });
                if (!ev.ok) { out.orders.skipped++; continue; }
                if (await orderHasActiveDelivery(snap.id, od)) { out.orders.skipped++; continue; }
                try {
                    const r = await releaseOrderEscrow(snap.id, { trigger: 'auto_release', callerUid: 'system', noCarrier: true, requireStatus: 'delivered' });
                    if (r && r.ok && !r.already) out.orders.released++; else out.orders.skipped++;
                } catch (e) { out.orders.skipped++; console.warn('sokopayAutoRelease (order ' + snap.id + '):', e && e.message); }
            }
        } catch (e) { console.error('sokopayAutoRelease (orders):', e && e.message); }
    }

    // --- B. SokoPay links: only when an admin configured linkAutoReleaseHours ---
    if (cfg.linkAutoReleaseHours) {
        const linkLimitMs = cfg.linkAutoReleaseHours * 3600000;
        try {
            const held = await db.collection('sokopay_links').where('status', '==', 'held').limit(500).get();
            for (const snap of held.docs) {
                const ld = snap.data() || {};
                const ev = await getEscrowEvidence('link', snap.id, ld, { recheckPesaPal: false });
                if (!ev.ok) { out.links.skipped++; continue; }
                const verifiedMs = Date.parse((ev.hold && ev.hold.verifiedAt) || '') || 0;
                if (!(verifiedMs > 0 && (nowMs - verifiedMs) >= linkLimitMs)) continue;
                if (await hasOpenDispute('link', snap.id)) { out.links.skipped++; continue; }
                try {
                    const r = await releaseLinkEscrow(snap.id, { trigger: 'auto_release', callerUid: 'system' });
                    if (r && r.ok && !r.already) out.links.released++; else out.links.skipped++;
                } catch (e) { out.links.skipped++; console.warn('sokopayAutoRelease (link ' + snap.id + '):', e && e.message); }
            }
        } catch (e) { console.error('sokopayAutoRelease (links):', e && e.message); }
    }
    return out;
}

/* ============================================================
 * 9) SOKOHAI AGENT ASSISTED ACCESS SYSTEM
 *    =========================================================
 *    Kanuni: Wakala ni NJIA YA KUFIKIA (access point) tu — HAWAHI
 *    kumiliki au kujifanya mwanachama. PIN/password ya mwanachama
 *    huishi SERVER pekee (hash) — wakala hawezi kuiona wala kuihifadhi.
 *
 *    memberRegister        — sajili mwanachama (bila simu) + PIN hash
 *    memberAuthenticate    — thibitisha PIN ya mwanachama (server) →
 *                            custom token + assistedSessions
 *    assistedSessionValidate — hakiki kipindi cha msaada kiko hai
 *    assistedSessionEnd    — funga kipindi + audit
 *    memberSetPin          — mwanachama abadilishe PIN yake mwenyewe
 *    agentMemberStatus     — wakala abadilishe uhusiano (ACTIVE/SUSPENDED/ENDED)
 *    agentListMembers      — orodha salama ya wanachama wa wakala
 * ============================================================ */

const ASSIST_PB2_ITERS = 12000;
const ASSIST_SESSION_MIN = Number(process.env.ASSISTED_SESSION_TIMEOUT_MINUTES || 30);
const ASSIST_MAX_PIN_ATTEMPTS = 5;
const ASSIST_LOCK_MINUTES = 30;

function assistHashPin(salt, pin) {
    return crypto.pbkdf2Sync(String(pin), String(salt), ASSIST_PB2_ITERS, 32, 'sha256').toString('hex');
}

function assistSafeEqual(a, b) {
    const ba = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

// Wakala lazima awe APPROVED ndio atumie mfumo wa msaada.
async function requireApprovedAgent(context) {
    const auth = requireAuth(context);
    // [FIX 2026-09] Query ya field MOJA (userId) — haihitaji composite index
    // (zamani where userId+status ilipiga "internal" bila index kwenye production).
    const q = await db.collection('agents')
        .where('userId', '==', auth.uid)
        .limit(50).get();
    let approved = false;
    // [REPAIR 2026-10 B-03] Before the C1 fix anyone could write agents.status /
    // users.isApprovedAgent, so a bare 'approved' flag cannot be trusted. Only an
    // approval stamped by the server for an admin (approvedBy / agentApprovedBy,
    // written by adminApproveAgent) or the custom claim `agent` counts.
    const tk = (auth && auth.token) || {};
    if (tk.agent === true) approved = true;
    q.forEach(d => { const a = d.data() || {}; if (a.status === 'approved' && a.approvedBy) approved = true; });
    // [FIX 2026-09] Kama agents bado haionyeshi approved, angalia alama ya
    // mtumiaji (users.isApprovedAgent) — approveAgent inaweka zote mbili,
    // lakini data ya zamani inaweza kuwa imekosa moja. Usimzuie wakala
    // aliyekwisha idhinishwa na Admin kwa sababu ya alama moja kupotea.
    if (!approved) {
        try {
            const uq = await db.collection('users')
                .where('uid', '==', auth.uid)
                .limit(5).get();
            uq.forEach(d => { const u = d.data() || {}; if (u.isApprovedAgent === true && u.agentApprovedBy) approved = true; });
        } catch (e) { /* hiari — agents ndiyo chanzo kikuu */ }
    }
    // [REPAIR 2026-10 C1] Both signals are now admin/server-only (rules). A
    // suspended/revoked agent or a suspended account is refused.
    if (approved) {
        try {
            const ud = await userDocFor(auth.uid);
            const u = (ud && ud.data) || {};
            if (u.isSuspended === true || u.accountStatus === 'suspended'
                || ['suspended', 'revoked'].indexOf(String(u.agentStatus || '')) !== -1) approved = false;
        } catch (e) { /* keep decision */ }
    }
    if (!approved) throw new HttpsError('permission-denied', 'Wakala wako hajaidhinishwa kutumia Msaada wa Mwanachama. Subiri Admin akubali ombi lako.');
    return auth;
}

function validPin(pin) {
    const p = String(pin || '');
    return /^\d{4,6}$/.test(p);
}

async function assistLog(userId, agentId, action, referenceId, sessionId) {
    try {
        await db.collection('assistedActivity').add({
            userId: userId || '',
            agentId: agentId || '',
            action: String(action || ''),
            timestamp: new Date().toISOString(),
            referenceId: referenceId || '',
            sessionId: sessionId || ''
        });
    } catch (e) { /* audit haiwezi kuzuia operesheni kuu */ }
}

function nextMemberCode(n) { return 'SKH-' + String(n).padStart(8, '0'); }

exports.memberRegister = onCall({ region: REGION }, async (req) => {
    const auth = await requireApprovedAgent(req);
    const d = req.data || {};
    const fullName = String(d.fullName || '').trim();
    const region = String(d.region || '').trim();
    const district = String(d.district || '').trim();
    const businessType = String(d.businessType || '').trim();
    const pin = String(d.pin || '');

    if (!fullName || !region) throw new HttpsError('invalid-argument', 'Jina na Mkoa vinahitajika.');
    if (!validPin(pin)) throw new HttpsError('invalid-argument', 'PIN lazima iwe tarakimu 4 hadi 6.');

    try {
        // Namba ya mwanachama (Member ID) — unique, atomic counter.
        const counterRef = db.collection('meta').doc('member_counter');
        const seq = await db.runTransaction(async (t) => {
            const snap = await t.get(counterRef);
            const n = snap.exists ? (Number(snap.data().n) || 0) : 0;
            t.set(counterRef, { n: n + 1 }, { merge: true });
            return n + 1;
        });
        const memberCode = nextMemberCode(seq);

        // Akaunti ya Auth ya mwanachama — HAKUNA password/email: anapata kuingia
        // kwa custom token baada ya kuthibitisha PIN yake mwenyewe (server).
        // [FIX 2026-09] HATUUITI admin.auth().createUser() wakati wa USAJILI
        // tena. createCustomToken(uid) kwenye memberAuthenticate inaunda akaunti
        // ya Auth LAZIMA wakati wa kuingia (Firebase huunda user kiotomatiki).
        // Hii iliondoa hitilafu "internal" (Auth API ikishindikana / uid
        // ikijirudia / permission) iliyokuwa ikizuia usajili wa mwanachama.
        const uid = 'skhm_' + crypto.randomBytes(16).toString('hex');

        const salt = crypto.randomBytes(16).toString('hex');
        const pinHash = assistHashPin(salt, pin);

        const now = new Date().toISOString();

        await db.collection('users').doc(uid).set({
            uid,
            fullName,
            memberId: memberCode,
            region,
            district,
            businessType,
            hasPhone: false,
            hasPin: true,
            isOfflineUser: true,
            createdByAgentId: auth.uid,
            photoURL: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(fullName) + '&background=f1f5f9&color=64748b',
            walletBalance: 0,
            createdAt: now
        });

        // SIRI ya mwanachama: hash tu (browser/wakala HAIWEZI kuisoma — rules).
        await db.collection('memberSecrets').doc(uid).set({
            uid,
            pinSalt: salt,
            pinHash,
            pinAttempts: 0,
            lockedUntil: null,
            updatedAt: now
        });

        await db.collection('agentMembers').add({
            agentId: auth.uid,
            memberId: uid,
            memberCode,
            status: 'ACTIVE',
            createdAt: now,
            lastAssistedAt: null
        });

        await assistLog(uid, auth.uid, 'MEMBER_REGISTERED', memberCode, '');

        // Kamisheni ya wakala (hiari) — inabaki server-authoritative.
        return { ok: true, memberId: memberCode, uid };
    } catch (e) {
        // [FIX 2026-09] Hakuna "internal" tupu — kila hitilafu inarudi na ujumbe wazi.
        if (e && e.code && typeof e.code === 'string' && /^(invalid-argument|permission-denied|unauthenticated|not-found|already-exists|failed-precondition|out-of-range|aborted|internal|data-loss|resource-exhausted|cancelled|deadline-exceeded|unknown)$/.test(e.code) && e.message) {
            throw e; // tayari HttpsError yenye ujumbe wazi
        }
        console.error('[memberRegister] hitilafu isiyotarajiwa:', e);
        throw new HttpsError('internal', 'Usajili wa mwanachama umeshindikana: ' + (e && e.message ? e.message : e));
    }
});

exports.memberAuthenticate = onCall({ region: REGION }, async (req) => {
    const auth = await requireApprovedAgent(req);
    const d = req.data || {};
    const memberCode = String(d.memberId || '').trim().toUpperCase();
    const pin = String(d.pin || '');

    if (!memberCode) throw new HttpsError('invalid-argument', 'Weka Member ID ya mwanachama.');
    if (!validPin(pin)) throw new HttpsError('invalid-argument', 'PIN lazima iwe tarakimu 4 hadi 6.');

    const uq = await db.collection('users').where('memberId', '==', memberCode).limit(1).get();
    if (uq.empty) throw new HttpsError('not-found', 'Mwanachama mwenye ID hiyo hajapatikana.');
    const uDoc = uq.docs[0];
    const uid = uDoc.id;

    // Uhusiano ACTIVE kati ya wakala na mwanachama unahitajika (no impersonation).
    // [FIX 2026-09] Query ya field MOJA (memberId) + uchujaji kwenye memory —
    // haihitaji composite index (hapo awali ilirusha "internal" kwenye production).
    const relq = await db.collection('agentMembers')
        .where('memberId', '==', uid)
        .limit(20).get();
    let relOk = false;
    relq.forEach(d => { const r = d.data(); if (r.agentId === auth.uid && r.status === 'ACTIVE') relOk = true; });
    if (!relOk) {
        throw new HttpsError('permission-denied', 'Huna uhusiano wa kumhudumia mwanachama huyu.');
    }

    const secSnap = await db.collection('memberSecrets').doc(uid).get();
    if (!secSnap.exists) throw new HttpsError('not-found', 'Mwanachama hana PIN iliyosajiliwa.');

    const sec = secSnap.data();
    if (sec.lockedUntil && Date.parse(sec.lockedUntil) > Date.now()) {
        throw new HttpsError('failed-precondition', 'Akaunti imefungiwa kwa muda. Jaribu tena baadaye.');
    }

    const hash = assistHashPin(sec.pinSalt, pin);
    if (!assistSafeEqual(hash, sec.pinHash)) {
        const attempts = (Number(sec.pinAttempts) || 0) + 1;
        const lockedUntil = attempts >= ASSIST_MAX_PIN_ATTEMPTS
            ? new Date(Date.now() + ASSIST_LOCK_MINUTES * 60000).toISOString() : null;
        await db.collection('memberSecrets').doc(uid).set({
            pinAttempts: lockedUntil ? 0 : attempts,
            lockedUntil,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        await assistLog(uid, auth.uid, 'AUTH_FAILED', memberCode, '');
        throw new HttpsError('invalid-argument', 'PIN si sahihi.');
    }

    // PIN sahihi → reset attempts + fungua kipindi cha msaada.
    await db.collection('memberSecrets').doc(uid).set({ pinAttempts: 0, lockedUntil: null }, { merge: true });

    const startedAt = Date.now();
    const expiresAt = new Date(startedAt + ASSIST_SESSION_MIN * 60000).toISOString();
    const sessionRef = await db.collection('assistedSessions').add({
        sessionType: 'ASSISTED_USER',
        userId: uid,
        agentId: auth.uid,
        startedAt: new Date(startedAt).toISOString(),
        lastActiveAt: new Date(startedAt).toISOString(),
        expiresAt,
        active: true,
        permissions: ['marketplace', 'buy', 'sell', 'chat', 'orders', 'profile', 'transport']
    });
    const sessionId = sessionRef.id;

    // [FIX 2026-09] Field moja (memberId) + uchujaji kwenye memory (hakuna composite index).
    let relDocId = null;
    const lr = await db.collection('agentMembers').where('memberId', '==', uid).limit(20).get();
    lr.forEach(r => { if (r.data().agentId === auth.uid) relDocId = r.id; });
    if (relDocId) await db.collection('agentMembers').doc(relDocId).update({ lastAssistedAt: new Date().toISOString() });

    await assistLog(uid, auth.uid, 'AUTH_SUCCESS', memberCode, sessionId);

    try {
        const customToken = await admin.auth().createCustomToken(uid, { assisted: true });
        return { ok: true, customToken, sessionId, memberId: memberCode, uid, expiresAt };
    } catch (e) {
        console.error('[memberAuthenticate] createCustomToken imeshindwa:', e);
        throw new HttpsError('internal', 'Imeshindwa kuandaa kikao cha kuingia: ' + (e && e.message ? e.message : e));
    }
});

exports.assistedSessionValidate = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const d = req.data || {};
    const sessionId = String(d.sessionId || '');
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId inahitajika.');

    const snap = await db.collection('assistedSessions').doc(sessionId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Kipindi hakipo.');
    const s = snap.data();
    if (s.userId !== auth.uid) throw new HttpsError('permission-denied', 'Kipindi sio chako.');
    if (s.active !== true) throw new HttpsError('failed-precondition', 'Kipindi kimefungwa.');
    if (Date.parse(s.expiresAt) <= Date.now()) {
        await db.collection('assistedSessions').doc(sessionId).update({ active: false });
        throw new HttpsError('failed-precondition', 'Kipindi kimeisha muda — ingia tena.');
    }
    await db.collection('assistedSessions').doc(sessionId).update({ lastActiveAt: new Date().toISOString() });
    return { ok: true, expiresAt: s.expiresAt };
});

exports.assistedSessionEnd = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const d = req.data || {};
    const sessionId = String(d.sessionId || '');
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId inahitajika.');

    const snap = await db.collection('assistedSessions').doc(sessionId).get();
    if (!snap.exists) return { ok: true };
    const s = snap.data();
    if (s.userId !== auth.uid && s.agentId !== auth.uid) {
        throw new HttpsError('permission-denied', 'Hauwezi kufunga kipindi hiki.');
    }
    await db.collection('assistedSessions').doc(sessionId).update({
        active: false,
        endedAt: new Date().toISOString(),
        endedBy: auth.uid
    });
    await assistLog(s.userId, s.agentId, 'SESSION_ENDED', '', sessionId);
    return { ok: true };
});

exports.memberSetPin = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const d = req.data || {};
    const newPin = String(d.newPin || '');
    const oldPin = String(d.oldPin || '');
    if (!validPin(newPin)) throw new HttpsError('invalid-argument', 'PIN mpya lazima iwe tarakimu 4 hadi 6.');

    const uid = auth.uid;
    const secSnap = await db.collection('memberSecrets').doc(uid).get();
    if (!secSnap.exists) throw new HttpsError('not-found', 'Huna PIN iliyosajiliwa.');

    const sec = secSnap.data();
    if (sec.pinHash) {
        // Kubadilisha PIN kunahitaji PIN ya sasa (mwanachama mwenyewe).
        if (!validPin(oldPin) || !assistSafeEqual(assistHashPin(sec.pinSalt, oldPin), sec.pinHash)) {
            throw new HttpsError('invalid-argument', 'PIN ya sasa si sahihi.');
        }
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const pinHash = assistHashPin(salt, newPin);
    await db.collection('memberSecrets').doc(uid).set({
        uid, pinSalt: salt, pinHash, pinAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString()
    }, { merge: true });
    await assistLog(uid, uid, 'PIN_CHANGED', '', '');
    return { ok: true };
});

exports.agentMemberStatus = onCall({ region: REGION }, async (req) => {
    const auth = await requireApprovedAgent(req);
    const d = req.data || {};
    const memberId = String(d.memberId || '').trim();
    const status = String(d.status || '').toUpperCase();
    if (!['ACTIVE', 'SUSPENDED', 'ENDED'].includes(status)) {
        throw new HttpsError('invalid-argument', 'Status si sahihi.');
    }
    // [FIX 2026-09] Field moja (memberId) + uchujaji kwenye memory (hakuna composite index).
    const relq = await db.collection('agentMembers')
        .where('memberId', '==', memberId)
        .limit(20).get();
    let relDoc = null;
    relq.forEach(r => { if (r.data().agentId === auth.uid) relDoc = r; });
    if (!relDoc) throw new HttpsError('not-found', 'Uhusiano haupo.');
    await db.collection('agentMembers').doc(relDoc.id).update({ status });
    await assistLog(memberId, auth.uid, 'RELATIONSHIP_' + status, '', '');
    return { ok: true };
});

exports.agentListMembers = onCall({ region: REGION }, async (req) => {
    const auth = await requireApprovedAgent(req);
    const d = req.data || {};
    const pageSize = Math.min(50, Math.max(1, Number(d.pageSize) || 20));
    const startAfterId = d.startAfterId || null;

    // [FIX 2026-09] Query ya field MOJA (agentId) bila orderBy — hakuna composite index.
    // Tunapanga kwenye memory (createdAt desc) na kugawa kurasa hapa hapa.
    const snap = await db.collection('agentMembers')
        .where('agentId', '==', auth.uid)
        .limit(200).get();
    const docs = [];
    snap.forEach(docSnap => docs.push(docSnap));
    docs.sort((a, b) => {
        const ta = Date.parse(a.data().createdAt) || 0;
        const tb = Date.parse(b.data().createdAt) || 0;
        return tb - ta;
    });
    let startIdx = 0;
    if (startAfterId) {
        const i = docs.findIndex(x => x.id === startAfterId);
        if (i !== -1) startIdx = i + 1;
    }
    const page = docs.slice(startIdx, startIdx + pageSize);
    const members = [];
    for (const docSnap of page) {
        const r = docSnap.data();
        const us = await db.collection('users').doc(r.memberId).get();
        const u = us.exists ? us.data() : {};
        members.push({
            agentMemberDocId: docSnap.id,
            memberId: r.memberId,
            memberCode: r.memberCode || u.memberId || '',
            fullName: u.fullName || '',
            region: u.region || '',
            district: u.district || '',
            businessType: u.businessType || '',
            hasPhone: !!u.hasPhone,
            status: r.status,
            createdAt: r.createdAt || null,
            lastAssistedAt: r.lastAssistedAt || null
        });
    }
    return { ok: true, members, hasMore: startIdx + pageSize < docs.length, lastDocId: page.length ? page[page.length - 1].id : null };
});

/* ============================================================
 * CHAIN OF CUSTODY — Uwasilishaji Salama wa Mzigo (2026-09)
 * ------------------------------------------------------------
 * deliveryGenerateToken   — token SALAMA (crypto) baada ya dereva
 *                           kukubali; PK (pickup) au TR (handover).
 * deliveryConfirmCustody  — uthibitisho wa makabidhiano/upokeaji
 *                           (seller | handover_from | transporter)
 *                           wenye validation KAMILI SERVER-SIDE
 *                           (umiliki, hatua, token single-use, muda
 *                           wa kuisha, dereva sahihi, pandembili).
 *
 * KANUNI: "ACCEPTED ≠ PICKED UP". Browser HAITHIBITISHI custody —
 * server ndiyo mamlaka. Arifa zinatumia collection ILIYOPO ya
 * `notifications` (hakuna mfumo mpya). Malipo yanabaki kwa engine
 * iliyopo (walletAdjust/escrowRelease) — hakuna mechanism mpya.
 * ========================================================== */
function custodyToken(prefix) {
    return (prefix || 'PK-') + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Rejea ya token isiyo ya siri (kamwe usihifadhi token kamili kwenye handover record).
function custodyMaskToken(t) {
    t = String(t || '');
    if (!t) return '';
    return t.slice(0, 3) + '\u2022\u2022\u2022\u2022' + t.slice(-2);
}

async function custodyGetRide(rideId) {
    if (!rideId) throw new HttpsError('invalid-argument', 'rideId inahitajika.');
    const ref = db.doc('ride_requests/' + rideId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Safari haipatikani.');
    return { ref, data: snap.data() };
}

function custodyExpired(rd) {
    const exp = rd && (rd.pickupTokenExpiresAt || rd.handoverTokenExpiresAt);
    if (!exp) return false;
    return Date.parse(exp) < Date.now();
}

function custodyEvent(deliveryId, event, auth, extra) {
    return db.collection('delivery_events').add(Object.assign({
        deliveryId, event,
        actorId: auth.uid,
        timestamp: new Date().toISOString()
    }, extra || {}));
}

async function custodyNotify(userId, title, body) {
    if (!userId) return;
    try {
        await db.collection('notifications').add({
            userId, title, body,
            createdAt: new Date().toISOString(), read: false, type: 'delivery'
        });
    } catch (e) { /* notifications si muhimu ku-crash */ }
}

// Weka leg ya mwisho ya custodyLegs kuwa completed (kwa handover).
async function custodyCompleteLeg(rideId, parcelCondition, evidence) {
    try {
        const snap = await db.doc('ride_requests/' + rideId).get();
        const rd = snap.data() || {};
        const legs = Array.isArray(rd.custodyLegs) ? rd.custodyLegs.slice() : [];
        if (!legs.length) return;
        const last = legs[legs.length - 1];
        if (last && last.status === 'pending') {
            legs[legs.length - 1] = Object.assign({}, last, {
                status: 'completed',
                completedAt: new Date().toISOString(),
                parcelCondition: parcelCondition || last.parcelCondition || null,
                evidence: evidence || ''
            });
            await db.doc('ride_requests/' + rideId).update({ custodyLegs: legs });
        }
    } catch (e) { /* hiari */ }
}

/* ============================================================
 * [CUSTODY PHASE B 2026-09] Token salama: hash + private delivery_tokens.
 * Token HALISI haihifadhiwi kwenye ride_requests (inayosomeka na wote) —
 * inaishi kwenye collection PRIVATE `delivery_tokens` inayosomeka na
 * wahusika pekee. ride doc hubeba hash + rejea (masked) tu.
 * ========================================================== */
function custodyHash(s) {
    return crypto.createHash('sha256').update(String(s || '')).digest('hex');
}

// Rejea ya token isiyo ya siri (kamwe usihifadhi token kamili kwenye ride doc).
function custodyMaskToken(t) {
    t = String(t || '');
    if (!t) return '';
    return t.slice(0, 3) + '••••••' + t.slice(-2);
}

async function custodySetToken(rideId, kind, token, participants, opts) {
    opts = opts || {};
    const now = new Date().toISOString();
    let ride = {};
    try {
        const rs = await db.doc('ride_requests/' + rideId).get();
        ride = rs.exists ? (rs.data() || {}) : {};
    } catch (e) {}
    const tokenId = rideId + '_' + kind + (opts.legId ? '_' + String(opts.legId) : '');
    await db.collection('delivery_tokens').doc(tokenId).set({
        tokenId: tokenId,
        rideId: rideId,
        shipmentId: opts.shipmentId || ride.shipmentId || (ride.cargoManifest && ride.cargoManifest.shipmentId) || null,
        orderId: opts.orderId || ride.orderId || null,
        kind: kind,
        tokenType: kind === 'pickup' ? 'PICKUP_TOKEN' : (kind === 'handover' ? 'TRANSFER_TOKEN' : 'DELIVERY_TOKEN'),
        stage: kind === 'pickup' ? 'pickup' : (kind === 'handover' ? 'transfer' : 'delivery'),
        legId: opts.legId || null,
        token: token,
        participants: participants || [],
        issuerUid: opts.issuerUid || null,
        issuerRole: opts.issuerRole || null,
        intendedActorUid: opts.intendedActorUid || null,
        intendedActorRole: opts.intendedActorRole || null,
        fromPartyUid: opts.fromPartyUid || null,
        fromPartyRole: opts.fromPartyRole || null,
        toPartyUid: opts.toPartyUid || null,
        toPartyRole: opts.toPartyRole || null,
        createdAt: now,
        issuedAt: now,
        presentedAt: null,
        verifiedAt: null,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        status: 'issued',
        attemptCount: 0
    }, { merge: true });
    return tokenId;
}

async function custodyGetToken(rideId, kind) {
    try {
        const s = await db.doc('delivery_tokens/' + rideId + '_' + kind).get();
        return (s.exists && s.data().token) ? s.data().token : null;
    } catch (e) { return null; }
}

async function custodyMarkTokenStatus(rideId, kind, status) {
    try {
        const patch = { status: status };
        const now = new Date().toISOString();
        if (status === 'presented') patch.presentedAt = now;
        if (status === 'verified') patch.verifiedAt = now;
        if (status === 'used' || status === 'consumed') patch.consumedAt = now;
        if (status === 'expired') patch.expiredAt = now;
        if (status === 'revoked') patch.revokedAt = now;
        await db.doc('delivery_tokens/' + rideId + '_' + kind).update(patch);
    } catch (e) { /* hiari */ }
}

// Uthibitisho wa token: hash ya sasa (PHASE B) au plaintext ya zamani (legacy).
function custodyTokenOk(rd, kind, token) {
    const key = kind === 'handover' ? 'handoverToken' : (kind === 'transfer' ? 'transferCode' : 'pickupToken');
    const hash = rd[key + 'Hash'] || null;
    const legacy = rd[key] || null;
    if (hash) return custodyHash(token) === hash;
    if (legacy) return token === String(legacy).toUpperCase();
    return false;
}

// [PHASE B] Rate-limit ya majaribio ya token (server-side, 15-dakika dirisha).
const CUSTODY_MAX_ATTEMPTS = 6;
const CUSTODY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
async function custodyAttemptsExceeded(rideId, role) {
    try {
        const snap = await db.collection('custody_attempts').doc(rideId + '_' + role).get();
        if (!snap.exists) return false;
        const d = snap.data() || {};
        if (Date.now() - Number(d.windowStart || 0) > CUSTODY_ATTEMPT_WINDOW_MS) return false;
        return Number(d.count || 0) >= CUSTODY_MAX_ATTEMPTS;
    } catch (e) { return false; }
}
async function custodyAttemptFail(rideId, role) {
    try {
        const ref = db.collection('custody_attempts').doc(rideId + '_' + role);
        const snap = await ref.get();
        const now = Date.now();
        const fresh = !snap.exists || (now - Number((snap.data() || {}).windowStart || 0) > CUSTODY_ATTEMPT_WINDOW_MS);
        await ref.set({
            count: fresh ? 1 : (Number((snap.data() || {}).count || 0) + 1),
            windowStart: fresh ? now : Number((snap.data() || {}).windowStart || now),
            lastAt: new Date().toISOString()
        });
    } catch (e) { /* hiari */ }
}
async function custodyAttemptClear(rideId, role) {
    try { await db.collection('custody_attempts').doc(rideId + '_' + role).delete(); } catch (e) { /* hiari */ }
}

/* [CUSTODY 2026-09] Kukubali kazi (accept) ni ya SERVER — browser haiwezi
 * kujipanga mwenyewe kama dereva. Hii inaweka accepted + driverId + inazalisha
 * token ya kuchukua (PK) + inaandika TRANSPORTER_ACCEPTED/PICKUP_TOKEN_GENERATED
 * + inaarifu muuzaji. KANUNI: "ACCEPTED ≠ PICKED UP". */
// [PHASE 2 P6] Hali za safari zinazoweza kukubaliwa (zinazotumiwa na waundaji
// waliopo: routing/43-delivery-choice/08-app-state = 'searching';
// 57-checkout-bridge/16-pos = 'pending_acceptance' yenye driverId aliyechaguliwa).
const RIDE_OPEN_STATES = ['searching', 'pending_acceptance'];
// Hali baada ya kukubali lakini kabla ya pickup (kukubali tena = idempotent).
const RIDE_ACCEPTED_PREPICKUP = ['accepted', 'pickup_pending', 'awaiting_pickup'];

exports.deliveryAccept = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    if (!rideId || rideId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'rideId inahitajika.');
    const ref = db.doc('ride_requests/' + rideId);
    const now = new Date().toISOString();

    /* [PHASE 2 P6] ATOMIC (transaction): madereva wawili hawawezi kukubali wote;
     * safari iliyo kwenye custody/imekamilika/imeghairiwa haiwezi kutekwa wala
     * kurudishwa nyuma; mteja hawezi kujifanya dereva; nauli inagandishwa
     * (agreedFare) — malipo ya carrier yanatumia agreedFare PEKEE. */
    let out = null, rd = null;
    await db.runTransaction(async (t) => {
        out = null;
        const snap = await t.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'Safari haipatikani.');
        rd = snap.data() || {};
        const st = String(rd.status || '');
        if (rd.customerId && rd.customerId === auth.uid) {
            throw new HttpsError('permission-denied', 'Mteja hawezi kukubali safari yake mwenyewe kama dereva.');
        }
        if (rd.driverId === auth.uid && rd.acceptedAt && RIDE_ACCEPTED_PREPICKUP.indexOf(st) !== -1) {
            out = { already: true };   // kukubali tena na dereva yule yule — bila kubadilisha hali
            return;
        }
        if (RIDE_OPEN_STATES.indexOf(st) === -1) {
            throw new HttpsError('failed-precondition', 'Safari hii haiko wazi kukubaliwa (status: ' + (st || 'haijulikani') + ').');
        }
        if (rd.driverId && rd.driverId !== auth.uid) {
            throw new HttpsError('failed-precondition', 'Safari tayari imekabidhiwa kwa dereva mwingine.');
        }
        if (rd.assignmentStatus === 'assigned' && rd.assignedAgentId && rd.assignedAgentId !== auth.uid) {
            throw new HttpsError('failed-precondition', 'Ombi tayari limegawiwa kwa msafirishaji mwingine.');
        }
        const pk = custodyToken('PK-');
        t.set(db.collection('delivery_tokens').doc(rideId + '_pickup'), {
            rideId: rideId, kind: 'pickup', token: pk,
            participants: [rd.customerId, auth.uid].filter(Boolean),
            createdAt: now, expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(), status: 'pending'
        });
        t.update(ref, {
            status: 'accepted',
            driverId: auth.uid,
            driverName: String(data.driverName || rd.driverName || auth.uid),
            driverPhone: String(data.driverPhone || ''),
            driverVehicleReg: String(data.driverVehicleReg || ''),
            acceptedAt: now,
            agreedFare: Math.max(0, Number(rd.fare || 0) || Number(rd.price || 0) || 0),
            pickupTokenHash: custodyHash(pk),
            pickupTokenRef: custodyMaskToken(pk),
            pickupTokenStatus: 'pending',
            pickupTokenCreatedAt: now,
            pickupTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            custodyStage: 'pickup'
        });
        out = { token: pk };
    });
    if (out && out.already) {
        const existing = await custodyGetToken(rideId, 'pickup');
        return { ok: true, already: true, token: existing || null, status: rd.status, driverId: auth.uid };
    }
    await custodyEvent(rideId, 'TRANSPORTER_ACCEPTED', auth, { actorRole: 'transporter' });
    await custodyEvent(rideId, 'PICKUP_TOKEN_GENERATED', auth, {});
    if (rd.customerId) {
        await custodyNotify(rd.customerId, 'Transporter Amekubali — Pickup Inasubiri',
            'Dereva amekubali kazi. Thibitisha makabidhiano ya mzigo kwenye Jopo la Mizigo & Dispatch.');
    }
    return { ok: true, token: out.token, status: 'accepted', driverId: auth.uid };
});

/* ============================================================
 * [REQUEST ROUTING 2026-09] Kukubali OFA ya routing (Agent Request
 * Inbox). Tofauti na deliveryAccept (marketplace ya jumla), hapa
 * msafirishaji amechambuliwa na Routing Engine na kupokea ofa binafsi
 * (delivery_offers). Accept ni ya SERVER na ni ya atomiki: ofa lazima
 * iwe yake, iwe 'offered' na bado iwe ndani ya muda; ofa zingine
 * zote za safari hughairiwa, safari hugawiwa kwake, na Pickup Token
 * (PK) inatengenezwa mara moja (tena, helpers za custody zilizopo).
 * ========================================================== */
exports.deliveryOfferAccept = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const offerId = String(data.offerId || '');
    if (!offerId) throw new HttpsError('invalid-argument', 'offerId inahitajika.');
    const offerRef = db.collection('delivery_offers').doc(offerId);
    const now = new Date().toISOString();
    let pk = null;
    let rideId = null;
    let customerId = null;
    let orderId = null;
    let agentName = '';

    await db.runTransaction(async (t) => {
        const ofSnap = await t.get(offerRef);
        if (!ofSnap.exists) throw new HttpsError('not-found', 'Ofa haipatikani.');
        const offer = ofSnap.data();
        if (offer.agentId !== auth.uid) throw new HttpsError('permission-denied', 'Si ofa yako.');
        if (offer.status !== 'offered') throw new HttpsError('failed-precondition', 'Ofa hii si hai tena.');
        if (offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now()) {
            throw new HttpsError('failed-precondition', 'Muda wa ofa umeisha; ombi limehamishiwa kwa mwingine.');
        }
        rideId = offer.rideId;
        customerId = offer.customerId;
        orderId = offer.orderId;
        agentName = offer.agentName || '';
        const rideRef = db.doc('ride_requests/' + rideId);
        const rideSnap = await t.get(rideRef);
        if (!rideSnap.exists) throw new HttpsError('not-found', 'Safari haipatikani.');
        const rd = rideSnap.data();
        if (rd.assignmentStatus === 'assigned' || (rd.driverId && rd.driverId !== auth.uid)) {
            throw new HttpsError('failed-precondition', 'Ombi tayari limegawiwa kwa msafirishaji mwingine.');
        }
        // [PHASE 2 P6] mteja hawezi kuwa msafirishaji wa safari yake; safari lazima iwe wazi.
        if (rd.customerId && rd.customerId === auth.uid) {
            throw new HttpsError('permission-denied', 'Mteja hawezi kukubali safari yake mwenyewe kama msafirishaji.');
        }
        if (RIDE_OPEN_STATES.indexOf(String(rd.status || '')) === -1) {
            throw new HttpsError('failed-precondition', 'Safari hii haiko wazi kukubaliwa (status: ' + (rd.status || 'haijulikani') + ').');
        }

        // Chota ofa zote za safari na utumie state machine ya routing.
        const qSnap = await t.get(db.collection('delivery_offers').where('rideId', '==', rideId));
        const offers = [];
        qSnap.forEach(d => offers.push(Object.assign({ id: d.id }, d.data())));
        const routingLogic = require('./routing-logic');
        let tr;
        try {
            tr = routingLogic.transitionOffers(offers, {
                type: 'accept', offerId: offerId, agentId: auth.uid
            });
        } catch (e2) {
            const m = String((e2 && e2.message) || e2);
            if (m === 'not_your_offer') throw new HttpsError('permission-denied', 'Si ofa yako.');
            if (m === 'offer_not_active') throw new HttpsError('failed-precondition', 'Ofa hii si hai tena.');
            if (m === 'offer_expired') throw new HttpsError('failed-precondition', 'Muda wa ofa umeisha.');
            if (m === 'ride_already_assigned') throw new HttpsError('failed-precondition', 'Ombi tayari limegawiwa kwa mwingine.');
            if (m === 'offer_not_found') throw new HttpsError('not-found', 'Ofa haipatikani.');
            throw e2;
        }
        Object.keys(tr.updates || {}).forEach(oid => {
            t.update(db.collection('delivery_offers').doc(oid), tr.updates[oid]);
        });

        // Pickup Token (PK) — crypto-random, single-use, 72h (kama deliveryAccept).
        pk = custodyToken('PK-');
        t.set(db.collection('delivery_tokens').doc(rideId + '_pickup'), {
            tokenId: rideId + '_pickup',
            rideId: rideId,
            orderId: orderId || null,
            shipmentId: rd.shipmentId || (rd.cargoManifest && rd.cargoManifest.shipmentId) || null,
            kind: 'pickup', tokenType: 'PICKUP_TOKEN', stage: 'pickup',
            token: pk, participants: [customerId, auth.uid].filter(Boolean),
            issuerUid: auth.uid, issuerRole: 'transporter',
            intendedActorUid: customerId || null, intendedActorRole: 'seller_or_sender',
            createdAt: now, issuedAt: now, presentedAt: null, verifiedAt: null, consumedAt: null,
            expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            status: 'issued', attemptCount: 0
        }, { merge: true });
        t.update(rideRef, {
            status: 'accepted',
            driverId: auth.uid,
            driverName: String(data.driverName || agentName || rd.driverName || auth.uid),
            driverPhone: String(data.driverPhone || ''),
            driverVehicleReg: String(data.driverVehicleReg || ''),
            acceptedAt: now,
            agreedFare: Math.max(0, Number(rd.fare || 0) || Number(rd.price || 0) || 0), // [PHASE 2 P1]
            routingStatus: 'assigned',
            assignmentStatus: 'assigned',
            assignedAgentId: auth.uid,
            activeOfferId: null,
            pickupTokenHash: custodyHash(pk),
            pickupTokenRef: custodyMaskToken(pk),
            pickupTokenStatus: 'pending',
            pickupTokenCreatedAt: now,
            pickupTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            custodyStage: 'pickup'
        });
    });

    // Token halali huishi kwenye delivery_tokens (PRIVATE), si ride doc.
    await custodySetToken(rideId, 'pickup', pk, [customerId, auth.uid].filter(Boolean));
    await custodyEvent(rideId, 'OFFER_ACCEPTED', auth, { offerId: offerId, actorRole: 'transporter', agentName: agentName });
    await custodyEvent(rideId, 'TRANSPORTER_ACCEPTED', auth, { actorRole: 'transporter', via: 'routing' });
    await custodyEvent(rideId, 'PICKUP_TOKEN_GENERATED', auth, {});
    // Unganisha order (bila kugusa malipo).
    try {
        if (orderId) {
            await db.doc('orders/' + orderId).update({
                rideRequestId: rideId, deliveryId: rideId,
                driverId: auth.uid, assignedAgentId: auth.uid, assignedAgentName: agentName,
                routingStatus: 'assigned', updatedAt: now
            });
        }
    } catch (e) { /* order link ni ya ziada */ }
    if (customerId) {
        await custodyNotify(customerId, 'Ombi Limekubaliwa — Pickup Token Imepatikana',
            'Msafirishaji amekubali ombi lako. Tokeni ya kuchukua mzigo (PK) imetengenezwa na ipo kwenye Token Box yako.');
    }
    return { ok: true, token: pk, status: 'accepted', rideId: rideId, driverId: auth.uid };
});

exports.deliveryGenerateToken = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    const kind = (data.kind === 'handover' || data.kind === 'transfer') ? data.kind : 'pickup';
    const { ref, data: rd } = await custodyGetRide(rideId);
    const now = new Date().toISOString();

    // [CUSTODY PHASE B 2026-09] Token C (DL) ya mpokeaji wa mwisho.
    // Imetolewa na SERVER kwa ombi la mmiliki wa mzigo (customerId) pekee.
    // Token halisi inaishi kwenye delivery_tokens (private); ride doc hubeba
    // transferCodeHash + transferCodeRef (masked) tu — hakuna plaintext.
    if (kind === 'transfer') {
        if (rd.customerId !== auth.uid) {
            throw new HttpsError('permission-denied', 'Ni mmiliki wa mzigo pekee anayeweza kuzalisha Token ya mwisho (Token C).');
        }
        if (rd.transferTokenStatus === 'pending' && rd.transferCodeHash) {
            const existing = await custodyGetToken(rideId, 'transfer');
            if (existing) return { ok: true, token: existing, kind, status: rd.status };
        }
        const dl = custodyToken('DL-');
        await custodySetToken(rideId, 'transfer', dl, [rd.customerId].filter(Boolean));
        await ref.update({
            transferCodeHash: custodyHash(dl),
            transferCodeRef: custodyMaskToken(dl),
            transferTokenStatus: 'pending',
            transferTokenCreatedAt: now,
            transferTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            // Ondoa plaintext ya zamani (legacy) — token kamili haihifadhiwi kwenye ride doc tena.
            transferCode: null
        });
        await custodyEvent(rideId, 'TRANSFER_TOKEN_GENERATED', auth, {});
        return { ok: true, token: dl, kind, status: rd.status };
    }

    if (kind === 'handover') {
        const custodian = rd.currentCustodian || rd.driverId;
        if (custodian !== auth.uid) {
            throw new HttpsError('permission-denied', 'Ni mshika mzigo wa sasa pekee anayeweza kuanzisha handover.');
        }
        const nextId = String(data.nextTransporterId || rd.nextTransporterId || '');
        const nextName = String(data.nextTransporterName || rd.nextTransporterName || nextId);
        if (!nextId) throw new HttpsError('invalid-argument', 'nextTransporterId inahitajika kwa handover.');
        if (rd.handoverTokenStatus === 'pending' && !custodyExpired(rd)) {
            const existing = await custodyGetToken(rideId, 'handover') || rd.handoverToken || null;
            if (existing) return { ok: true, token: existing, kind, status: rd.status, handoverId: rd.activeHandoverId || null };
        }
        const tr = custodyToken('TR-');
        const legNumber = (Array.isArray(rd.custodyLegs) ? rd.custodyLegs.length : 1) + 1;
        const leg = {
            leg: legNumber,
            fromId: custodian,
            from: rd.currentCustodianName || rd.driverName || 'Transporter A',
            toId: nextId,
            to: nextName,
            status: 'pending',
            location: String(data.location || '')
        };
        const hoRef = await db.collection('delivery_handovers').add({
            deliveryId: rideId,
            deliveryLegId: 'leg_' + legNumber,
            fromTransporterId: custodian,
            fromTransporterName: rd.currentCustodianName || rd.driverName || 'Transporter A',
            toTransporterId: nextId,
            toTransporterName: nextName,
            handoverLocation: String(data.location || ''),
            initiatedAt: now,
            completedAt: null,
            verificationMethod: 'token',
            pickupTokenReference: custodyMaskToken(tr),
            fromPartyConfirmed: false,
            toPartyConfirmed: false,
            status: 'pending',
            parcelCondition: null,
            evidence: ''
        });
        await custodySetToken(rideId, 'handover', tr, [custodian, nextId].filter(Boolean));
        await ref.update({
            handoverTokenHash: custodyHash(tr),
            handoverTokenRef: custodyMaskToken(tr),
            handoverTokenStatus: 'pending',
            handoverTokenCreatedAt: now,
            handoverTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            status: 'awaiting_handover',
            custodyStage: 'handover',
            nextTransporterId: nextId,
            nextTransporterName: nextName,
            handoverFromConfirmed: false,
            activeHandoverId: hoRef.id,
            custodyLegs: FieldValue.arrayUnion(leg)
        });
        await custodyEvent(rideId, 'HANDOVER_TOKEN_GENERATED', auth, {});
        await custodyEvent(rideId, 'HANDOVER_INITIATED', auth, { actorRole: 'transporter', legId: 'leg_' + legNumber, handoverId: hoRef.id, location: String(data.location || '') });
        await custodyNotify(nextId, 'Intermediate Pickup Required', 'Umepewa mkono wa usafirishaji. Thibitisha upokeaji kwa token ya TR.');
        return { ok: true, token: tr, kind, status: 'awaiting_handover', handoverId: hoRef.id };
    }

    // pickup
    const isDriver = rd.driverId === auth.uid;
    const isOwner = rd.customerId === auth.uid;
    if (!isDriver && !isOwner) {
        throw new HttpsError('permission-denied', 'Huna haki ya kuzalisha token ya safari hii.');
    }
    // [PHASE 2 P6] Token ya pickup ni ya hatua ya KABLA ya pickup tu — haiwezi
    // kurudisha nyuma safari iliyo njiani/imekamilika/imeghairiwa.
    const preStates = RIDE_ACCEPTED_PREPICKUP.concat(['seller_confirmed_handover']);
    if (!rd.driverId || !rd.acceptedAt || preStates.indexOf(String(rd.status || '')) === -1) {
        throw new HttpsError('failed-precondition', 'Token ya kuchukua mzigo haiwezi kutolewa katika hatua hii (status: ' + (rd.status || 'haijulikani') + ').');
    }
    // Token iliyopo (pending, haijaisha muda) → rudisha ile ile.
    if (rd.pickupTokenStatus === 'pending' && !custodyExpired(rd)) {
        const existing = await custodyGetToken(rideId, 'pickup') || rd.pickupToken || null;
        if (existing) return { ok: true, token: existing, kind, status: rd.status };
    }
    if (RIDE_ACCEPTED_PREPICKUP.indexOf(String(rd.status || '')) === -1) {
        throw new HttpsError('failed-precondition', 'Muuzaji tayari amethibitisha makabidhiano — token mpya haiwezi kutolewa sasa.');
    }
    const pk = custodyToken('PK-');
    await custodySetToken(rideId, 'pickup', pk, [rd.customerId, rd.driverId].filter(Boolean));
    await ref.update({
        pickupTokenHash: custodyHash(pk),
        pickupTokenRef: custodyMaskToken(pk),
        pickupTokenStatus: 'pending',
        pickupTokenCreatedAt: now,
        pickupTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        status: 'pickup_pending',
        custodyStage: 'pickup'
    });
    await custodyEvent(rideId, 'PICKUP_TOKEN_GENERATED', auth, {});
    return { ok: true, token: pk, kind, status: 'pickup_pending' };
});

exports.deliveryConfirmCustody = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    const role = String(data.role || '');
    const token = String(data.token || '').trim().toUpperCase();
    const direct = data.direct === true;
    const parcelCondition = String(data.parcelCondition || 'good');
    const parcelConditionNote = String(data.parcelConditionNote || '');
    const location = String(data.location || '');
    const isHandover = data.handover === true;
    const pickupCount = (data.pickupCount != null && !isNaN(Number(data.pickupCount))) ? Number(data.pickupCount) : null;

    if (!rideId || !role) {
        throw new HttpsError('invalid-argument', 'rideId na role zinahitajika.');
    }
    if (!token && !(role === 'handover_from' || (role === 'seller' && direct))) {
        throw new HttpsError('invalid-argument', 'token inahitajika.');
    }
    const { ref, data: rd } = await custodyGetRide(rideId);
    const now = new Date().toISOString();

    if (custodyExpired(rd)) {
        await ref.update(isHandover ? { handoverTokenStatus: 'expired' } : { pickupTokenStatus: 'expired' });
        await custodyMarkTokenStatus(rideId, isHandover ? 'handover' : 'pickup', 'expired');
        throw new HttpsError('failed-precondition', 'Token imeisha muda wake (expired).');
    }

    // [PHASE B] Rate-limit ya majaribio mabaya (server-side).
    if (await custodyAttemptsExceeded(rideId, role + (isHandover ? '_handover' : ''))) {
        throw new HttpsError('resource-exhausted', 'Majaribio mengi sana. Subiri dakika 15 kisha ujaribu tena.');
    }

    /* ---------- MUUZAJI (mmiliki wa mzigo) ---------- */
    if (role === 'seller') {
        /* [PHASE 2 P1] Safari ya ODA YA BIDHAA/HUDUMA (rd.orderId → oda isiyo ya
         * usafiri): makabidhiano ya mwanzo ni ya MUUZAJI HALISI wa oda
         * (orders.sellerId — haibadiliki kwa rules), si mteja aliyeomba safari
         * (ambaye ni mnunuzi). Safari za kawaida/booking za usafiri: kama zamani. */
        let handoverOwner = String(rd.customerId || '');
        if (rd.orderId && String(rd.orderId).indexOf('/') === -1) {
            const os = await db.doc('orders/' + rd.orderId).get();
            if (os.exists) {
                const od = os.data() || {};
                if ((od.commerceType || 'product') !== 'transport') handoverOwner = String(od.sellerId || '');
            }
        }
        if (!handoverOwner || handoverOwner !== auth.uid) {
            throw new HttpsError('permission-denied', 'Ni muuzaji/mmiliki halisi wa mzigo pekee anayeweza kuthibitisha makabidhiano.');
        }
        if (!rd.driverId) throw new HttpsError('failed-precondition', 'Dereva hajakubali safari bado.');
        if (rd.status === 'seller_confirmed_handover') return { ok: true, status: rd.status };
        if (['accepted', 'awaiting_pickup', 'pickup_pending'].indexOf(rd.status) === -1) {
            throw new HttpsError('failed-precondition', 'Hali ya safari hairuhusu uthibitisho wa muuzaji.');
        }
        // OPTION A: kwa token | OPTION B: direct (bila token) — zote bado zinahakikiwa hapa.
        if (!direct && !custodyTokenOk(rd, 'pickup', token)) {
            await custodyAttemptFail(rideId, role);
            throw new HttpsError('failed-precondition', 'Token ya kuchukua mzigo si sahihi.');
        }
        await ref.update({
            status: 'seller_confirmed_handover',
            sellerConfirmedAt: now,
            sellerConfirmedBy: auth.uid, // [PHASE 2 P1] rekodi ya server (rules: server-only)
            parcelCondition,
            parcelConditionNote,
            custodyStage: 'pickup'
        });
        await custodyAttemptClear(rideId, role);
        await custodyEvent(rideId, 'SELLER_HANDOVER_CONFIRMED', auth, { actorRole: 'seller', parcelCondition, parcelConditionNote, location, verificationMethod: direct ? 'direct' : 'token' });
        await custodyNotify(rd.driverId, 'Pickup Confirmation Required', 'Muuzaji amethibitisha makabidhiano. Thibitisha upokeaji wa mzigo kwa token yako.');
        return { ok: true, status: 'seller_confirmed_handover' };
    }

    /* ---------- HANDOVER_FROM (dereva wa awali anakabidhi) ---------- */
    if (role === 'handover_from') {
        const custodian = rd.currentCustodian || rd.driverId;
        if (custodian !== auth.uid) {
            throw new HttpsError('permission-denied', 'Ni mshika mzigo wa sasa pekee anayeweza kuthibitisha makabidhiano.');
        }
        if (rd.status !== 'awaiting_handover') {
            throw new HttpsError('failed-precondition', 'Handover haijaanzishwa bado.');
        }
        await ref.update({ handoverFromConfirmed: true, handoverFromConfirmedAt: now });
        const hoId = rd.activeHandoverId;
        if (hoId) {
            await db.collection('delivery_handovers').doc(hoId).update({ fromPartyConfirmed: true, fromConfirmedAt: now }).catch(() => {});
        }
        await custodyEvent(rideId, 'HANDOVER_CONFIRMED', auth, { actorRole: 'transporter', handoverId: hoId || null, location });
        await custodyNotify(rd.nextTransporterId, 'Handover Imethibitishwa', 'Dereva wa awali amethibitisha makabidhiano. Thibitisha upokeaji kwa token ya TR.');
        return { ok: true, status: 'awaiting_handover' };
    }

    /* ---------- DEREVA (transporter) ---------- */
    if (role === 'transporter') {
        if (isHandover) {
            if (rd.nextTransporterId !== auth.uid) {
                throw new HttpsError('permission-denied', 'Safari hii haijakabidhiwa kwako (dereva sahihi tu).');
            }
            if (rd.status === 'in_transit') return { ok: true, status: rd.status };
            if (rd.status !== 'awaiting_handover') {
                throw new HttpsError('failed-precondition', 'Handover haijaanzishwa bado.');
            }
            if (rd.handoverFromConfirmed !== true) {
                throw new HttpsError('failed-precondition', 'Subiri dereva wa awali athibitishe makabidhiano.');
            }
            if (rd.handoverTokenStatus !== 'pending') {
                throw new HttpsError('failed-precondition', 'Token ya handover tayari imetumika.');
            }
            if (!custodyTokenOk(rd, 'handover', token)) {
                await custodyAttemptFail(rideId, role + '_handover');
                throw new HttpsError('failed-precondition', 'Invalid pickup confirmation. Please verify the token and try again.');
            }
            await ref.update({
                status: 'in_transit',
                handoverTokenStatus: 'used',
                currentCustodian: auth.uid,
                currentCustodianName: rd.nextTransporterName || 'Dereva',
                driverId: auth.uid,
                driverName: rd.nextTransporterName || 'Dereva',
                nextTransporterId: null,
                nextTransporterName: null,
                custodyStage: 'transit'
            });
            await custodyMarkTokenStatus(rideId, 'handover', 'used');
            await custodyAttemptClear(rideId, role + '_handover');
            const hoId = rd.activeHandoverId;
            if (hoId) {
                await db.collection('delivery_handovers').doc(hoId).update({ toPartyConfirmed: true, completedAt: now, status: 'completed', parcelCondition, evidence: parcelConditionNote }).catch(() => {});
            }
            await custodyCompleteLeg(rideId, parcelCondition, parcelConditionNote);
            await custodyEvent(rideId, 'NEXT_TRANSPORTER_PICKUP_CONFIRMED', auth, { actorRole: 'transporter', handoverId: hoId || null, parcelCondition, parcelConditionNote, location });
            if (rd.currentCustodian) {
                await custodyNotify(rd.currentCustodian, 'Handover Imekamilika', 'Transporter mpya amepokea mzigo. Custody imehamia kwake.');
            }
            return { ok: true, status: 'in_transit' };
        }

        if (rd.driverId !== auth.uid) {
            throw new HttpsError('permission-denied', 'Dereva aliyekabidhiwa safari pekee ndiye anayeweza kuthibitisha upokeaji.');
        }
        if (rd.status === 'picked_up' || rd.status === 'in_transit') return { ok: true, status: rd.status };
        if (rd.status !== 'seller_confirmed_handover') {
            throw new HttpsError('failed-precondition', 'Subiri muuzaji athibitishe makabidhiano kwanza.');
        }
        if (rd.pickupTokenStatus !== 'pending') {
            throw new HttpsError('failed-precondition', 'Token tayari imetumika.');
        }
        if (!custodyTokenOk(rd, 'pickup', token)) {
            await custodyAttemptFail(rideId, role);
            throw new HttpsError('failed-precondition', 'Invalid pickup confirmation. Please verify the token and try again.');
        }
        const pickupPatch = {
            status: 'picked_up',
            pickupTokenStatus: 'used',
            currentCustodian: auth.uid,
            currentCustodianName: rd.driverName || 'Dereva',
            transporterConfirmedAt: now,
            parcelCondition,
            parcelConditionNote,
            dispatchedAt: now,
            custodyStage: 'transit',
            custodyLegs: FieldValue.arrayUnion({
                leg: 1,
                fromId: rd.customerId || null,
                from: rd.customerName || 'Muuzaji',
                toId: auth.uid,
                to: rd.driverName || 'Dereva',
                status: 'completed',
                completedAt: now,
                location: String(rd.fromLocation || ''),
                parcelCondition
            })
        };
        if (pickupCount != null) pickupPatch.verifiedPickupCount = pickupCount;
        await ref.update(pickupPatch);
        await custodyMarkTokenStatus(rideId, 'pickup', 'used');
        await custodyAttemptClear(rideId, role);
        await custodyEvent(rideId, 'TRANSPORTER_PICKUP_CONFIRMED', auth, { actorRole: 'transporter', parcelCondition, parcelConditionNote, location });
        await custodyNotify(rd.customerId, 'Mzigo Umechukuliwa (Picked Up)', 'Dereva amethibitisha kupokea mzigo. Mzigo sasa uko chini ya ulinzi wake.');
        return { ok: true, status: 'picked_up' };
    }

    throw new HttpsError('invalid-argument', 'role lazima iwe "seller", "handover_from" au "transporter".');
});

/* ============================================================
 * deliveryRevokeTokens — [CUSTODY 2026-09] batilisha tokeni
 * zinazosubiri (pending) wakati safari inaghairiwa. Single-use tokeni
 * huwa 'revoked' (hazitumiki tena; historia haifutwi).
 * ============================================================ */
exports.deliveryRevokeTokens = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    if (!rideId) throw new HttpsError('invalid-argument', 'rideId inahitajika.');

    const { ref, data: rd } = await custodyGetRide(rideId);
    const isCustodian = (rd.currentCustodian === auth.uid) || (rd.driverId === auth.uid);
    const isOwner = rd.customerId === auth.uid;
    if (!isCustodian && !isOwner) {
        throw new HttpsError('permission-denied', 'Huna ruhusa ya kubatilisha tokeni za safari hii.');
    }

    const patch = {};
    if (rd.pickupTokenStatus === 'pending') { patch.pickupTokenStatus = 'revoked'; await custodyMarkTokenStatus(rideId, 'pickup', 'revoked'); }
    if (rd.handoverTokenStatus === 'pending') { patch.handoverTokenStatus = 'revoked'; await custodyMarkTokenStatus(rideId, 'handover', 'revoked'); }
    if (Object.keys(patch).length) {
        await ref.update(patch);
        await custodyEvent(rideId, 'TOKEN_REVOKED', auth, { actorRole: isOwner ? 'seller' : 'transporter' });
    }
    return { ok: true, revoked: Object.keys(patch) };
});

/* ============================================================
 * deliveryStartTransit — [CUSTODY PHASE B 2026-09] picked_up → in_transit
 * (dereva wa sasa pekee; server-authoritative).
 * ============================================================ */
exports.deliveryStartTransit = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    if (!rideId) throw new HttpsError('invalid-argument', 'rideId inahitajika.');
    const { ref, data: rd } = await custodyGetRide(rideId);
    const custodian = rd.currentCustodian || rd.driverId;
    if (custodian !== auth.uid) {
        throw new HttpsError('permission-denied', 'Ni mshika mzigo wa sasa pekee anayeweza kuanza safari.');
    }
    if (rd.status !== 'picked_up') {
        throw new HttpsError('failed-precondition', 'Mzigo lazima uwe umethibitishwa (picked_up) kabla ya kuanza safari.');
    }
    const patch = { status: 'in_transit', custodyStage: 'transit' };
    if (data.pickupCount != null && !isNaN(Number(data.pickupCount))) patch.verifiedPickupCount = Number(data.pickupCount);
    await ref.update(patch);
    await custodyEvent(rideId, 'DELIVERY_STARTED', auth, { actorRole: 'transporter' });
    if (rd.customerId) {
        await custodyNotify(rd.customerId, 'Safari Imeanza', 'Dereva ameanza safari. Mzigo uko njiani.');
    }
    return { ok: true, status: 'in_transit' };
});

/* ============================================================
 * deliveryPassengerBoard — [CUSTODY PHASE B 2026-09] tiketi/OTP ya abiria.
 * Dereva anaingiza OTP ya abiria; SERVER huihakiki (hash-first + legacy
 * fallback) kabla ya kuhamisha safari hadi in_transit. Hakuna query ya
 * plaintext transferCode kwenye browser tena.
 * ============================================================ */
exports.deliveryPassengerBoard = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    const otp = String(data.otp || '').trim().toUpperCase();
    if (!rideId || !otp) throw new HttpsError('invalid-argument', 'rideId na OTP zinahitajika.');
    const { ref, data: rd } = await custodyGetRide(rideId);
    if (rd.driverId !== auth.uid) {
        throw new HttpsError('permission-denied', 'Ni dereva aliyekabidhiwa safari pekee anayeweza kuthibitisha kupanda kwa abiria.');
    }
    if (rd.status === 'in_transit') return { ok: true, status: 'in_transit' };
    if (await custodyAttemptsExceeded(rideId, 'boarding')) {
        throw new HttpsError('resource-exhausted', 'Majaribio mengi sana. Subiri dakika 15 kisha ujaribu tena.');
    }
    if (!custodyTokenOk(rd, 'transfer', otp)) {
        await custodyAttemptFail(rideId, 'boarding');
        throw new HttpsError('failed-precondition', 'Invalid pickup confirmation. Please verify the token and try again.');
    }
    await custodyAttemptClear(rideId, 'boarding');
    await custodyMarkTokenStatus(rideId, 'transfer', 'used');
    await ref.update({ status: 'in_transit', custodyStage: 'transit' });
    await custodyEvent(rideId, 'PASSENGER_BOARDED', auth, { actorRole: 'transporter' });
    if (rd.customerId) {
        await custodyNotify(rd.customerId, 'Abiria Amepanda — Safari Imeanza',
            'Dereva amethibitisha kupanda kwa abiria. Safari imeanza rasmi.');
    }
    return { ok: true, status: 'in_transit' };
});

/* ============================================================
 * deliveryComplete — [CUSTODY PHASE B 2026-09] uwasilishaji wa mwisho.
 * Auth: mshika mzigo wa sasa (dereva) AU mpokeaji (mteja). Token C (DL)
 * inathibitishwa SERVER-SIDE. Malipo ya dereva + auto-release ya bidhaa
 * yanafanyika hapa (server), si kwenye browser.
 * ============================================================ */
exports.deliveryComplete = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    if (!rideId) throw new HttpsError('invalid-argument', 'rideId inahitajika.');
    const { ref, data: rd } = await custodyGetRide(rideId);
    const now = new Date().toISOString();

    const isCustodian = ((rd.currentCustodian || rd.driverId) === auth.uid);
    const isReceiver = (rd.customerId === auth.uid);
    if (!isCustodian && !isReceiver) {
        throw new HttpsError('permission-denied', 'Ni mshika mzigo au mpokeaji pekee anayeweza kukamilisha uwasilishaji.');
    }
    if (rd.status === 'completed') return { ok: true, already: true, status: 'completed', finalPayout: Number(rd.finalPayout || 0) };
    if (['picked_up', 'in_transit', 'delivered'].indexOf(rd.status) === -1) {
        throw new HttpsError('failed-precondition', 'Safari haiko kwenye hatua ya uwasilishaji (status: ' + rd.status + ').');
    }
    /* [PHASE 1 SECURITY 2026-09] Mnyororo wa custody lazima uwe wa SERVER:
     *  • dereva amekabidhiwa na server (acceptedAt — deliveryAccept/OfferAccept);
     *  • mzigo umepita pickup/handover/boarding ya server (custodyStage 'transit').
     *  `status` ya ride inaweza kuandikwa na kivinjari — haitoshi peke yake. */
    if (!rd.driverId || !rd.acceptedAt) {
        throw new HttpsError('failed-precondition', 'Safari hii haijakabidhiwa dereva na server (deliveryAccept).');
    }
    if (String(rd.custodyStage || '') !== 'transit') {
        throw new HttpsError('failed-precondition', 'Mnyororo wa custody haujakamilika (pickup token / handover ya server haijathibitishwa).');
    }
    // Token C (DL) — mpokeaji wa mwisho. Ikiwa imewekwa, lazima ilingane.
    // [PHASE B] Uthibitisho wa hash-first (transferCodeHash) na fallback ya
    // legacy plaintext (transferCode) kwa safari za zamani.
    // [PHASE 1] Mshika mzigo (si mpokeaji) HAWEZI kukamilisha bila Token C:
    // Token C ndiyo uthibitisho kwamba mpokeaji amepokea.
    const hasTokenC = !!(rd.transferCode || rd.transferCodeHash);
    if (!hasTokenC && !isReceiver) {
        throw new HttpsError('failed-precondition', 'Token C (DL) inahitajika: mwombe mpokeaji aizalishe kisha aikupe wakati wa kupokea mzigo.');
    }
    if (hasTokenC) {
        if (await custodyAttemptsExceeded(rideId, 'delivery')) {
            throw new HttpsError('resource-exhausted', 'Majaribio mengi sana. Subiri dakika 15 kisha ujaribu tena.');
        }
        const given = String(data.transferCode || '').trim().toUpperCase();
        if (!custodyTokenOk(rd, 'transfer', given)) {
            await custodyAttemptFail(rideId, 'delivery');
            throw new HttpsError('failed-precondition', 'Invalid pickup confirmation. Please verify the token and try again.');
        }
    }
    await custodyAttemptClear(rideId, 'delivery');
    await custodyMarkTokenStatus(rideId, 'transfer', 'used');

    /* Nauli ya dereva (pamoja na faini ya mifugo kama inatumika).
     * [PHASE 1] Kiasi hiki ni MAKADIRIO tu — malipo halisi hutoka kwenye
     * escrow iliyothibitishwa ya oda iliyounganishwa (tazama chini) na
     * yamefungwa ndani ya kiasi hicho. Bei ya ride (cargoPrice/price) ni
     * data ya kivinjari — haitengenezi pesa tena. `cargoPrice` ya oda za
     * bidhaa ni THAMANI ya bidhaa, si nauli, hivyo haitumiki. */
    // [PHASE 2 P1] Nauli iliyogandishwa na server wakati wa kukubali (agreedFare)
    // PEKEE — fare/price za ride doc hazitumiki tena kwa malipo.
    const fareBase = Math.max(0, Number(rd.agreedFare || 0));
    let finalPayout = fareBase;
    let arrivalCount = null;
    if (rd.reqCategory === 'Livestock') {
        const pickupCount = Number(rd.verifiedPickupCount || rd.animalCount || 0);
        arrivalCount = Number(data.arrivalCount);
        if (isNaN(arrivalCount)) arrivalCount = pickupCount;
        if (arrivalCount < pickupCount && finalPayout > 0) {
            const lost = pickupCount - arrivalCount;
            const penalty = Math.round(finalPayout * 0.15) * lost;
            finalPayout = Math.max(0, finalPayout - penalty);
        }
    }

    await ref.update({
        status: 'completed',
        completedAt: now,
        currentCustodian: rd.customerId || null,
        currentCustodianName: rd.customerName || 'Mnunuzi',
        finalPayout: 0,
        payoutStatus: 'pending',
        verifiedArrivalCount: arrivalCount,
        custodyStage: 'completed'
    });
    await custodyEvent(rideId, 'DELIVERY_CONFIRMED', auth, { actorRole: isReceiver ? 'receiver' : 'transporter' });
    await custodyEvent(rideId, 'DELIVERY_COMPLETED', auth, { actorRole: isReceiver ? 'receiver' : 'transporter' });

    /* [PHASE 1 SECURITY 2026-09] MALIPO — kutoka escrow iliyothibitishwa PEKEE.
     * Oda iliyounganishwa: rd.orderId (routing ya server) au mnyororo wa zamani
     * (orders.itemId/productId == parentRideId). Mnunuzi wa oda LAZIMA awe
     * mpokeaji (customerId) wa safari. Utoaji unatumia releaseOrderEscrow
     * (ushahidi wa malipo + kiasi + hold moja = release moja):
     *   • oda ya bidhaa → muuzaji + nauli ya dereva (≤ escrow);
     *   • oda ya usafiri (booking) ambayo muuzaji NDIYE dereva → dereva analipwa kama muuzaji.
     * Hakuna oda iliyothibitishwa → hakuna malipo ya wallet (payoutStatus 'unfunded'). */
    let paidToDriver = 0;
    let payoutStatus = 'unfunded';
    let releaseInfo = null;
    if (data.skipPayout !== true && rd.customerId) {
        try {
            let orderId = null;
            if (rd.orderId && String(rd.orderId).indexOf('/') === -1) {
                const os = await db.doc('orders/' + rd.orderId).get();
                if (os.exists && String((os.data() || {}).buyerId || '') === rd.customerId) orderId = os.id;
            }
            if (!orderId && rd.parentRideId) {
                // [FIX 2026-09] Field MOJA (buyerId) + uchujaji itemId/status kwenye
                // memory — haiitaji composite index.
                const orderSnap = await db.collection('orders').where('buyerId', '==', rd.customerId).limit(50).get();
                orderSnap.forEach(function (dd) {
                    if (orderId) return;
                    const od2 = dd.data();
                    if (od2.status === 'held' && (od2.itemId === rd.parentRideId || od2.productId === rd.parentRideId)) orderId = dd.id;
                });
            }
            if (orderId) {
                const od = (await db.doc('orders/' + orderId).get()).data() || {};
                const driverIsSeller = String(od.sellerId || '') === String(rd.driverId || '');
                // [PHASE 2 P1] carrier: agreedFare + dereva ≠ mnunuzi/muuzaji + (bidhaa)
                // makabidhiano yamethibitishwa na muuzaji halisi. Vinginevyo hakuna
                // sehemu ya carrier (muuzaji analipwa kama kawaida).
                const carrierOk = !driverIsSeller && finalPayout > 0 && carrierRideEligible(rd, od);
                releaseInfo = await releaseOrderEscrow(orderId, {
                    callerUid: auth.uid,
                    trigger: 'delivery_complete',
                    carrier: carrierOk ? { rideId, driverUid: rd.driverId, amount: finalPayout } : null,
                    noCarrier: true
                });
                if (releaseInfo && releaseInfo.ok) {
                    const sp = releaseInfo.split || {};
                    paidToDriver = driverIsSeller ? Number(sp.sellerEarned || 0) : Number(sp.carrierShare || 0);
                    payoutStatus = releaseInfo.already ? 'already_released' : 'paid_from_escrow';
                }
            }
        } catch (e) {
            payoutStatus = 'unfunded';
            console.warn('[deliveryComplete] escrow haikutolewa:', rideId, e && e.message);
        }
    } else if (data.skipPayout === true) {
        payoutStatus = 'skipped';
    }
    try { await ref.update({ finalPayout: paidToDriver, payoutStatus: payoutStatus }); } catch (e) { /* hiari */ }

    if (rd.driverId && paidToDriver > 0 && payoutStatus === 'paid_from_escrow') {
        await custodyNotify(rd.driverId, 'SokoPay: Malipo ya Safari Yamepokelewa!',
            'Mteja amethibitisha kupokea mzigo. TSh ' + Number(paidToDriver).toLocaleString() + ' imeingizwa kwenye wallet yako.');
    } else if (rd.driverId && payoutStatus === 'unfunded') {
        await custodyNotify(rd.driverId, 'Uwasilishaji Umekamilika',
            'Safari imekamilika. Hakuna malipo ya escrow yaliyothibitishwa kwa safari hii, hivyo hakuna kiasi kilichoingizwa kwenye wallet.');
    }
    if (rd.customerId) {
        await custodyNotify(rd.customerId, 'Uwasilishaji Umekamilika', 'Mzigo wako umewasilishwa na kuthibitishwa. Asante kwa kutumia SokoHai.');
    }

    return { ok: true, status: 'completed', finalPayout: paidToDriver, payoutStatus: payoutStatus };
});

/* ============================================================
 * deliveryDispute — [CUSTODY PHASE B 2026-09] kusajili mgogoro
 * (mshika mzigo au mpokeaji). Server-authoritative.
 * ============================================================ */
exports.deliveryDispute = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    const reason = String(data.reason || '').slice(0, 500);
    if (!rideId || !reason) throw new HttpsError('invalid-argument', 'rideId na reason zinahitajika.');
    const { ref, data: rd } = await custodyGetRide(rideId);
    const isCustodian = ((rd.currentCustodian || rd.driverId) === auth.uid);
    const isReceiver = (rd.customerId === auth.uid);
    if (!isCustodian && !isReceiver) {
        throw new HttpsError('permission-denied', 'Ni mshika mzigo au mpokeaji pekee anayeweza kusajili mgogoro.');
    }
    await ref.update({ status: 'disputed', disputeReason: reason, disputedAt: new Date().toISOString() });
    await custodyEvent(rideId, 'DELIVERY_DISPUTED', auth, { actorRole: isReceiver ? 'receiver' : 'transporter', reason: reason });
    if (rd.customerId && rd.customerId !== auth.uid) {
        await custodyNotify(rd.customerId, 'Mgogoro wa Usafirishaji', reason);
    }
    if (rd.driverId && rd.driverId !== auth.uid) {
        await custodyNotify(rd.driverId, 'Mgogoro wa Usafirishaji', reason);
    }
    return { ok: true, status: 'disputed' };
});

/* ============================================================
 * deliveryTokenVerify — [CUSTODY PHASE B 2026-09] kuhakiki token
 * (kwa UI ya muuzaji) BILA kufichua data ya safari kwa watu wasiohusika.
 * ============================================================ */
exports.deliveryTokenVerify = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const token = String(data.token || '').trim().toUpperCase();
    if (!token) throw new HttpsError('invalid-argument', 'token inahitajika.');
    const kind = data.kind === 'handover' ? 'handover' : 'pickup';
    let rideId = String(data.rideId || '');
    if (!rideId) {
        // [FIX 2026-09] Field MOJA (token) + uchujaji kind kwenye memory —
        // haiitaji composite index (query ya token+kind ilirusha "internal").
        const hit = await db.collection('delivery_tokens').where('token', '==', token).limit(10).get();
        let tk = null;
        hit.forEach(function (d) { if (!tk && d.data().kind === kind) tk = d.data(); });
        if (!tk) throw new HttpsError('not-found', 'Invalid pickup confirmation. Please verify the token and try again.');
        if (!(tk.participants || []).includes(auth.uid)) {
            throw new HttpsError('permission-denied', 'Safari hii haihusiani nawe.');
        }
        rideId = tk.rideId;
    }
    const { data: rd } = await custodyGetRide(rideId);
    const isParty = (rd.customerId === auth.uid) || (rd.driverId === auth.uid) || (rd.currentCustodian === auth.uid) || (rd.nextTransporterId === auth.uid);
    if (!isParty) throw new HttpsError('permission-denied', 'Safari hii haihusiani nawe.');
    // Rudisha taarifa za kukabidhi BILA token yenyewe.
    return {
        ok: true,
        rideId: rideId,
        kind: kind,
        cargoName: rd.cargoName || '',
        customerName: rd.customerName || '',
        driverName: rd.driverName || '',
        vehicleType: rd.vehicleType || '',
        fromLocation: rd.fromLocation || '',
        toLocation: rd.toLocation || '',
        status: rd.status
    };
});

/* ============================================================
 * chatOfferAction — [OFERI 2026-09] accept/reject/counter ofa.
 * [NEGO ENGINE 2026-09] Sasa ni DARAJA kwa Injini ya Majadiliano
 * (functions/negotiation.js). accept/reject/counter zote hupitia
 * injini MOJA (spec §1, §46) — hakuna logic rudufu. Ofa za zamani
 * bila negotiationId huhamishwa kwa njia ya uvivu.
 * ============================================================ */
exports.chatOfferAction = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const offerId = String(data.offerId || '');
    const action = String(data.action || '');
    if (!offerId || ['accept', 'reject', 'counter'].indexOf(action) === -1) {
        throw new HttpsError('invalid-argument', 'offerId na action sahihi zinahitajika.');
    }
    const nego = require('./negotiation');
    const res = await nego.applyCommandByOffer(db, auth, {
        offerId: offerId,
        action: action,
        counterPrice: data.counterPrice,
        quantity: data.quantity,
        commandId: data.commandId || '',
        expectedVersion: data.expectedVersion
    });
    const st = res.status || 'unknown';
    const legacyStatus = (st === 'AGREEMENT' || st === 'FINAL_AGREEMENT') ? 'accepted'
        : (st === 'REJECTED') ? 'rejected'
        : (st === 'COUNTER_OFFER' || st === 'RE_NEGOTIATION') ? 'countered'
        : st;
    const n = res.negotiation || {};
    return {
        ok: true,
        status: legacyStatus,
        orderId: res.orderId || null,
        negotiationId: res.negotiationId || null,
        offer: {
            offerId: offerId,
            negotiationId: res.negotiationId || null,
            productId: n.productId || null,
            productTitle: n.productTitle || '',
            quantity: n.quantity || 1,
            acceptedPrice: n.currentUnitPrice != null ? n.currentUnitPrice : null,
            sellerId: n.sellerId || null,
            buyerId: n.buyerId || null
        }
    };
});

/* ============================================================
 * [MAONI USHAHIDI 2026-09] Thibitisha oda/usafirishaji wa mhusika
 * kwa tangazo (bidhaa/huduma/usafiri). SERVER-ONLY kabisa —
 * browser haiwezi kubandika beji za uongo.
 *
 * Hurudi:
 *   { order: {orderId, status, stage, at} | null,
 *     delivery: {orderId, status, stage, at, via} | null }
 *
 * Vyanzo vya ukweli vilivyopo:
 *   - orders (bidhaa: productId/itemId; huduma: serviceId/itemId;
 *     usafiri: transportId/itemId) pamoja na hatua za pipeline
 *     deliveryStatus/serviceStatus/transportStatus (negotiation.js).
 *   - Mfumo wa tokeni za custody (ride_requests + handovers) huandika
 *     orders.status='completed' mlolongo wa delivery ukamilika.
 * ============================================================ */
async function resolveCommentEvidence(uid, targetType, targetId) {
    const out = { order: null, delivery: null };
    if (!uid || !targetId) return out;
    let ordersSnap;
    try {
        ordersSnap = await db.collection('orders').where('buyerId', '==', uid).limit(100).get();
    } catch (e) {
        return out; // hakuna index / makosa — usidanganye uthibitisho
    }
    const PRODUCT_FULFILLED = ['shipped', 'in_transit', 'delivered', 'completed'];
    const PRODUCT_DELIVERED = ['delivered', 'completed'];
    const matchesTarget = (od) => {
        if (targetType === 'service') return od.serviceId === targetId || (od.itemId === targetId && (od.commerceType === 'service' || od.kind === 'service_order'));
        if (targetType === 'transport') return od.transportId === targetId || (od.itemId === targetId && (od.commerceType === 'transport' || od.kind === 'booking'));
        return od.productId === targetId || od.itemId === targetId;
    };
    const list = [];
    ordersSnap.forEach((o) => { list.push({ id: o.id, d: o.data() }); });
    list.forEach(({ id, od }) => {
        if (!matchesTarget(od)) return;
        const status = String(od.status || '');
        const stageField = targetType === 'service' ? 'serviceStatus' : (targetType === 'transport' ? 'transportStatus' : 'deliveryStatus');
        const stage = String(od[stageField] || '');
        const at = od.completedAt || od.deliveredAt || od.handoverAt || od.date || null;
        let hasOrder = false, hasDelivery = false;
        if (targetType === 'service') {
            // Oda ya huduma imethibitishwa pindi kazi imeanza/imewasilishwa/kukamilika.
            hasOrder = status === 'completed' ||
                ['service_in_progress', 'service_submitted', 'revision_requested', 'completed'].indexOf(stage) !== -1;
            // Huduma haina "delivery" ya mizigo — beji ya delivery haitumiki.
            hasDelivery = false;
        } else if (targetType === 'transport') {
            // Booking imethibitishwa pindi imeshikanishwa/ianza safari.
            hasOrder = PRODUCT_DELIVERED.indexOf(status) !== -1 ||
                ['booking_confirmed', 'pickup', 'in_transit', 'handover', 'confirmed'].indexOf(stage) !== -1;
            // Usafirishaji umethibitishwa na MFUMO wa delivery baada ya
            // kukabidhi/kuthibitisha kupokelewa.
            hasDelivery = PRODUCT_DELIVERED.indexOf(status) !== -1 ||
                ['handover', 'confirmed'].indexOf(stage) !== -1;
        } else {
            // Bidhaa: oda imethibitishwa pindi imeshatayarishwa/kusafirishwa.
            hasOrder = PRODUCT_FULFILLED.indexOf(status) !== -1 ||
                ['prepared', 'in_transit', 'delivered', 'confirmed'].indexOf(stage) !== -1;
            // "Delivery Imethibitishwa" inahitaji uthibitisho wa MNUNUZI wa
            // kupokea (stage 'confirmed' au status 'completed' — mtiririko wa
            // tokeni za custody nao huandika status hii).
            hasDelivery = status === 'completed' || stage === 'confirmed';
        }
        if (hasOrder && !out.order) out.order = { orderId: od.orderId || id, status: status, stage: stage, at: at };
        if (hasDelivery && !out.delivery) out.delivery = { orderId: od.orderId || id, status: status, stage: stage, at: at, via: 'orders' };
    });
    // Njia ya ziada ya bidhaa: ride_requests (tokeni za custody) zilizokamilika
    // na ambazo zina orderId/order inayohusisha tangazo hili.
    if (!out.delivery && targetType === 'product') {
        try {
            const rides = await db.collection('ride_requests')
                .where('customerId', '==', uid)
                .where('status', 'in', ['delivered', 'completed']).limit(50).get();
            rides.forEach((r) => {
                if (out.delivery) return;
                const rd = r.data() || {};
                const oid = rd.orderId || null;
                if (!oid) return;
                // Thibitisha oda hiyo inahusisha tangazo hili.
                const linked = list.find((x) => (x.id === oid || x.d.orderId === oid) && matchesTarget(x.d));
                if (linked) {
                    out.delivery = { orderId: linked.d.orderId || linked.id, status: String(rd.status || ''), stage: 'confirmed', at: rd.completedAt || rd.deliveredAt || null, via: 'ride_requests', rideId: r.id };
                    if (!out.order) out.order = { orderId: linked.d.orderId || linked.id, status: String(linked.d.status || ''), stage: '', at: linked.d.date || null };
                }
            });
        } catch (e) { /* index kukosa — achana */ }
    }
    return out;
}

/* ============================================================
 * commentsEvidence — [MAONI 2026-09] mwulize server je, mhusika
 * ana oda/usafirishaji uliothibitishwa (kufungua kiambatisho cha
 * ushahidi na kuonyesha beji za kweli tu).
 * ============================================================ */
exports.commentsEvidence = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const targetType = ['product', 'service', 'transport'].indexOf(String(data.targetType || 'product')) !== -1
        ? String(data.targetType || 'product') : 'product';
    const targetId = String(data.targetId || '');
    if (!targetId) throw new HttpsError('invalid-argument', 'targetId inahitajika.');
    const ev = await resolveCommentEvidence(auth.uid, targetType, targetId);
    return { ok: true, targetType: targetType, targetId: targetId, order: ev.order, delivery: ev.delivery, mediaAllowed: !!(ev.order || ev.delivery) };
});

/* ============================================================
 * commentsPublish — [MAONI 2026-09] chapisha maoni.
 * - Rate limit (max 5 maoni / dakika 1)
 * - verifiedPurchase/verifiedDelivery ni SERVER-ONLY (browser haiwezi kuiandika)
 * ============================================================ */
exports.commentsPublish = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const targetType = ['product', 'service', 'transport'].indexOf(String(data.targetType || 'product')) !== -1
        ? String(data.targetType || 'product') : 'product';
    const targetId = String(data.targetId || '');
    const text = String(data.text || '').trim();
    const parentId = data.parentId ? String(data.parentId) : null;
    const media = Array.isArray(data.media) ? data.media.slice(0, 4).map(String).filter(Boolean) : [];
    const productRef = (data.productRef && data.productRef.id) ? {
        id: String(data.productRef.id),
        collection: String(data.productRef.collection || 'products'),
        title: String(data.productRef.title || '').slice(0, 200),
        price: data.productRef.price != null ? Number(data.productRef.price) : null,
        image: String(data.productRef.image || '').slice(0, 500)
    } : null;
    if (!targetId) throw new HttpsError('invalid-argument', 'targetId inahitajika.');
    // Maoni yanaweza kuwa na maandishi au ushahidi wa picha/video (angalau kimoja).
    if ((!text && !media.length) || text.length > 2000) throw new HttpsError('invalid-argument', 'Maoni lazima yawe na maandishi au picha/video (max herufi 2000).');

    // Rate limit ya maoni (anti-spam) — max 5 kwa dakika.
    // [COMMENT FIX 2026-09] Soma-kuandika rahisi (sio transaction): transaction
    // inaweza kushindwa kwa hitilafu ya `internal` (retry) watumiaji wengi
    // wakituma kwa pamoja. Rate-limit ni best-effort — haipaswi kuzuia maoni.
    const nowMs = Date.now();
    const rlRef = db.doc('rateLimits/' + auth.uid);
    try {
        const rlSnap = await rlRef.get();
        const d = rlSnap.exists ? rlSnap.data() : {};
        const c = d.comments || { count: 0, windowStart: nowMs };
        if ((nowMs - c.windowStart) < 60000 && c.count >= 5) {
            throw new HttpsError('resource-exhausted', 'Umetuma maoni mengi sana. Subiri kidogo.');
        }
        const next = (nowMs - c.windowStart >= 60000) ? { count: 1, windowStart: nowMs } : { count: c.count + 1, windowStart: c.windowStart };
        await rlRef.set(Object.assign(d, { comments: next }), { merge: true });
    } catch (e) {
        if (e instanceof HttpsError) throw e; // resource-exhausted → mteja aonywe
        // Hitilafu nyingine (internal/network) isizuie uchapishaji wa maoni.
        console.warn('[commentsPublish] rate-limit imerukwa:', e && e.message);
    }

    // Taarifa za mwandishi (role + verified) — SERVER-ONLY, browser haiwezi kuidanganya.
    let authorRole = 'user';
    let authorVerified = false;
    try {
        const u = await db.doc('users/' + auth.uid).get();
        if (u.exists) { authorRole = u.data().role || 'user'; authorVerified = u.data().verificationStatus === 'verified' || u.data().verified === true; }
    } catch (e) { /* fallback */ }

    // [USHAHIDI HALISI] Thibitisha oda/delivery kutoka mifumo ya SokoHai.
    // Hii ni SERVER-ONLY kamwe isibandikwe na browser.
    const evidence = await resolveCommentEvidence(auth.uid, targetType, targetId);
    const verifiedPurchase = evidence.order;
    const verifiedDelivery = evidence.delivery;

    // Mwandishi wa maoni mzazi (kwa arifa ya reply).
    let parentAuthorId = null;
    if (parentId) {
        try {
            const ps = await db.doc('comments/' + parentId).get();
            if (ps.exists) parentAuthorId = ps.data().authorId || null;
        } catch (e) { /* ignore */ }
    }

    const nowIso = new Date().toISOString();
    const commentRef = await db.collection('comments').add({
        targetType, targetId,
        authorId: auth.uid,
        authorName: String(data.authorName || 'Mteja').slice(0, 80),
        authorPhoto: String(data.authorPhoto || '').slice(0, 500),
        authorRole: authorRole,
        authorVerified: authorVerified,
        parentId: parentId,
        rootId: data.rootId ? String(data.rootId) : parentId,
        text: text,
        media: media,
        productRef: productRef,
        likeCount: 0,
        replyCount: 0,
        verifiedPurchase: verifiedPurchase,
        verifiedDelivery: verifiedDelivery,
        moderationStatus: 'visible',
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null
    });
    if (parentId) {
        await db.doc('comments/' + parentId).update({ replyCount: FieldValue.increment(1) }).catch(() => {});
    }
    return { ok: true, id: commentRef.id, verifiedPurchase: verifiedPurchase, verifiedDelivery: verifiedDelivery, authorVerified: authorVerified, authorRole: authorRole, parentAuthorId: parentAuthorId };
});

/* ============================================================
 * commentsLike — [MAONI 2026-09] like/unlike (server-authoritative).
 * Hudumisha `likeCount` kwenye comment bila kuruhusu browser kuihariri.
 * ============================================================ */
exports.commentsLike = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const commentId = String((req.data || {}).commentId || '');
    if (!commentId) throw new HttpsError('invalid-argument', 'commentId inahitajika.');
    const cRef = db.doc('comments/' + commentId);
    const snap = await cRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Maoni hayapo.');
    const likeId = commentId + '__' + auth.uid;
    const likeRef = db.doc('commentLikes/' + likeId);
    const ls = await likeRef.get();
    if (ls.exists) {
        await likeRef.delete();
        await cRef.update({ likeCount: FieldValue.increment(-1) });
        return { ok: true, liked: false, likeCount: Math.max(0, (snap.data().likeCount || 0) - 1) };
    }
    await likeRef.set({ commentId: commentId, userId: auth.uid, createdAt: new Date().toISOString() });
    await cRef.update({ likeCount: FieldValue.increment(1) });
    return { ok: true, liked: true, likeCount: (snap.data().likeCount || 0) + 1 };
});

/* ============================================================
 * reviewsPublish — [TATHMINI 2026-09] review (rating + text + media).
 * verifiedPurchase ni SERVER-ONLY: inatokana na oda ILIYOKAMILIKA.
 * Inaandika kwenye product.comments (compat na 29-seller-store).
 * ============================================================ */
exports.reviewsPublish = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const targetId = String(data.targetId || '');
    const targetType = String(data.targetType || 'product');
    const rating = Number(data.rating || 0);
    const text = String(data.text || '').trim();
    const media = Array.isArray(data.media) ? data.media.slice(0, 6).map(String).filter(Boolean) : [];
    if (!targetId) throw new HttpsError('invalid-argument', 'targetId inahitajika.');
    if (rating < 1 || rating > 5) throw new HttpsError('invalid-argument', 'Rating lazima iwe kati ya 1 na 5.');
    if (text.length > 2000) throw new HttpsError('invalid-argument', 'Maoni marefu sana.');

    // Rate limit (anti-spam) — max 3 reviews kwa dakika.
    // [REVIEW FIX 2026-09] Soma-kuandika rahisi (sio transaction): transaction
    // inaweza kushindwa kwa hitilafu ya `internal` (retry) watumiaji wengi
    // wakituma kwa pamoja. Rate-limit ni best-effort — haipaswi kuzuia tathmini.
    const nowMs = Date.now();
    const rlRef = db.doc('rateLimits/' + auth.uid);
    try {
        const rlSnap = await rlRef.get();
        const d = rlSnap.exists ? rlSnap.data() : {};
        const c = d.reviews || { count: 0, windowStart: nowMs };
        if ((nowMs - c.windowStart) < 60000 && c.count >= 3) {
            throw new HttpsError('resource-exhausted', 'Umetuma tathmini nyingi sana. Subiri kidogo.');
        }
        const next = (nowMs - c.windowStart >= 60000) ? { count: 1, windowStart: nowMs } : { count: c.count + 1, windowStart: c.windowStart };
        await rlRef.set(Object.assign(d, { reviews: next }), { merge: true });
    } catch (e) {
        if (e instanceof HttpsError) throw e; // resource-exhausted → mteja aonywe
        // Hitilafu nyingine (internal/network) isizuie uchapishaji wa tathmini.
        console.warn('[reviewsPublish] rate-limit imerukwa:', e && e.message);
    }

    // [USHAHIDI HALISI] Thibitisha oda/delivery kutoka mifumo ya SokoHai.
    const rType = ['product', 'service', 'transport'].indexOf(targetType) !== -1 ? targetType : 'product';
    const rEv = await resolveCommentEvidence(auth.uid, rType, targetId);
    const verifiedPurchase = rEv.order;
    const verifiedDelivery = rEv.delivery;

    const reviewObj = {
        id: auth.uid + '_' + Date.now(),
        authorId: auth.uid,
        authorName: String(data.authorName || 'Mteja').slice(0, 80),
        rating: rating,
        text: text,
        media: media,
        photo: media[0] || '',
        verifiedPurchase: verifiedPurchase,
        verifiedDelivery: verifiedDelivery,
        timestamp: new Date().toISOString()
    };
    const coll = rType === 'service' ? 'services' : (rType === 'transport' ? 'drivers' : 'products');
    await db.doc(coll + '/' + targetId).update({ comments: FieldValue.arrayUnion(reviewObj) });
    return { ok: true, verifiedPurchase: verifiedPurchase, verifiedDelivery: verifiedDelivery };
});

/* ============================================================
 * commentsModerate — [USIMAMIZI 2026-09] admin: hide/unhide/delete
 * ============================================================ */
exports.commentsModerate = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const commentId = String(data.commentId || '');
    const action = String(data.action || '');
    const u = await db.doc('users/' + auth.uid).get();
    const isAdmin = u.exists && u.data().role === 'admin';
    if (!isAdmin) throw new HttpsError('permission-denied', 'Ni admin pekee anayeweza kusimamia maoni.');
    if (!commentId || ['hide', 'unhide', 'delete'].indexOf(action) === -1) {
        throw new HttpsError('invalid-argument', 'commentId na action sahihi zinahitajika.');
    }
    const ref = db.doc('comments/' + commentId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Maoni hayapo.');
    const patch = { moderatedBy: auth.uid, moderatedAt: new Date().toISOString() };
    if (action === 'hide') patch.moderationStatus = 'hidden';
    else if (action === 'unhide') patch.moderationStatus = 'visible';
    else patch.deletedAt = new Date().toISOString();
    await ref.update(patch);
    return { ok: true };
});

/* ============================================================
 * sitemapXml — (HTTP) orodha ya bidhaa/huduma/usafiri za umma
 * kwa ajili ya Google (SEO). Inajibu XML halisi ya sitemap.
 * Weka PUBLIC_BASE_URL kwenye functions/.env (mfano:
 *   PUBLIC_BASE_URL=https://sokohai.example.com
 * ). Kisha unaweza kufanya hosting rewrite ya /sitemap.xml
 * kwenda kwenye function hii, au kuwasilisha URL ya function
 * moja kwa moja kwenye Google Search Console.
 * ========================================================== */
exports.sitemapXml = onRequest({ region: REGION }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/xml; charset=utf-8');
    const base = (process.env.PUBLIC_BASE_URL || 'https://sokohai.example.com').replace(/\/+$/, '');
    const urls = [base + '/'];
    try {
        const colls = ['products', 'services', 'drivers'];
        for (const c of colls) {
            const snap = await db.collection(c).limit(5000).get();
            snap.forEach(d => {
                // Ziandike zile zenye jina halisi tu (sio drafts tupu)
                const dd = d.data() || {};
                if (dd.title || dd.itemTitle || dd.name) {
                    urls.push(base + '/p/' + encodeURIComponent(d.id));
                }
            });
        }
    } catch (e) { /* ikishindikana, rudisha ukurasa wa kwanza tu */ }
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls.map(u => '  <url><loc>' + u.replace(/&/g, '&amp;') + '</loc></url>').join('\n')
        + '\n</urlset>';
    return res.status(200).send(body);
});

/* ============================================================
 * [NEGO ENGINE 2026-09] Injini ya Majadiliano ya Biashara.
 * Functions zake zinamilikiwa na functions/negotiation.js (injini MOJA,
 * spec §1, §46). Zinatolewa hapa ili Firebase Functions izideploy.
 * chatOfferAction (juu) sasa ni daraJA linaloelekeza kwenye injini hiyo hiyo.
 * ============================================================ */
// [BUSINESS/STORE FOUNDATION] Owner-scoped canonical context bridge. It creates
// only the authenticated owner's Business/Store pair and preserves legacy fields.
const businessEngine = require('./business');
exports.businessEnsureContext = businessEngine.businessEnsureContext;

// [STEP 3A-0] One server-authoritative POS sale and inventory adjustment path.
// Product.stock is mutated here only, inside Firestore transactions; the client
// receives an idempotent result and never writes transactional stock directly.
const inventoryAuthority = require('./inventory-authority');
exports.posSale = inventoryAuthority.posSale;
exports.posReturn = inventoryAuthority.posReturn;
exports.posRefund = inventoryAuthority.posRefund;
exports.posCreditAdjustment = inventoryAuthority.posCreditAdjustment;
exports.posVoid = inventoryAuthority.posVoid;
exports.posReceipt = inventoryAuthority.posReceipt;
exports.posReconcile = inventoryAuthority.posReconcile;
exports.inventoryAdjust = inventoryAuthority.inventoryAdjust;
exports.productVariantsSave = inventoryAuthority.productVariantsSave;
// [PHASE 3 2026-10-31] Online reservation (OFF by default; system_config/inventory).
exports.inventoryReserve = inventoryReservation.inventoryReserve;
exports.inventoryReleaseReservation = inventoryReservation.inventoryReleaseReservation;
exports.inventoryReconcile = inventoryReservation.inventoryReconcile;
exports.inventoryOrderCreated = inventoryReservation.inventoryOrderCreated;
exports.inventoryOrderUpdated = inventoryReservation.inventoryOrderUpdated;
exports.inventoryReservationSweep = inventoryReservation.inventoryReservationSweep;
Object.defineProperty(exports, '_inventoryReservationForTest', { enumerable: false, value: Object.assign({}, inventoryReservation._internal, { settlePesaPalPayment }) });

// POS-7 server-authoritative reports; projections are derived from existing POS authorities.
const reportingAuthority = require('./reporting-authority');
exports.posReports = reportingAuthority.posReports;

// [CREATIVE STUDIO] Server-authoritative ownership, immutable versions,
// publication moderation and privacy-bounded event aggregation.
const creativeEngine = require('./creative');
exports.creativeSaveDraft = creativeEngine.creativeSaveDraft;
exports.creativePublish = creativeEngine.creativePublish;
exports.creativeTrackEvent = creativeEngine.creativeTrackEvent;

// Canonical campaign selection, temporary slot leases, frequency/cooldown
// enforcement and distinct delivery analytics for every placement.
const adsDeliveryEngine = require('./ads-delivery');
exports.adsRequestDelivery = adsDeliveryEngine.adsRequestDelivery;
exports.adsTrackDeliveryEvent = adsDeliveryEngine.adsTrackDeliveryEvent;
exports.adsUpdateCampaignDelivery = adsDeliveryEngine.adsUpdateCampaignDelivery;
exports.adsDeliverySweep = adsDeliveryEngine.adsDeliverySweep;

const negotiationEngine = require('./negotiation');
// [PHASE 2 P4] negotiationOrderAction hutumia injini ILIYOPO ya escrow (setter tu).
negotiationEngine.setEscrowEngine({ releaseOrderEscrow, getEscrowEvidence });
// [REQUEST ROUTING 2026-09] Injini ya kupeleka booking kwa mawakala
// waliostahili (offers + reassignment). Accept imo hapa index.js.
const routingEngine = require('./routing');
exports.deliveryRouteBooking = routingEngine.deliveryRouteBooking;
exports.deliveryOfferDecline = routingEngine.deliveryOfferDecline;
exports.deliveryRouteSweep = routingEngine.deliveryRouteSweep;
exports.deliveryRouteRetry = routingEngine.deliveryRouteRetry;
exports.deliveryReportTransportFault = routingEngine.deliveryReportTransportFault;
exports.negotiationSendOffer = negotiationEngine.negotiationSendOffer;
exports.negotiationAction = negotiationEngine.negotiationAction;
// [DELIVERY FLOW 2026-09] Mtiririko wa uwasilishaji wa oda za majadiliano
// (paid → prepared → in_transit → delivered → confirmed). Server-authoritative.
exports.negotiationOrderAction = negotiationEngine.negotiationOrderAction;

// [REPAIR 2026-10] Server-only privileged admin actions with a permanent audit
// trail (admin_audit_log). Agent approval, account suspension, role grants,
// provider verification and listing moderation are no longer browser writes.
// [REPAIR 2026-10 Phase 5] Auction bids and Group Buy joins are server-authoritative.
const commerceModes = require('./commerce-modes');
exports.auctionPlaceBid = commerceModes.auctionPlaceBid;
exports.groupBuyJoin = commerceModes.groupBuyJoin;
exports.commerceModesSweep = commerceModes.commerceModesSweep;
// Test hook (emulator only): run the auction sweep now. Not a deployed function (not an onCall/onSchedule).
Object.defineProperty(exports, '_commerceSweepForTest', { enumerable: false, value: () => commerceModes._testing.sweepAuctions() });
const adminAuthority = require('./admin-authority');
exports.adminApproveAgent = adminAuthority.adminApproveAgent;
exports.adminRejectAgent = adminAuthority.adminRejectAgent;
exports.adminSetAgentStatus = adminAuthority.adminSetAgentStatus;
exports.adminSetAccountStatus = adminAuthority.adminSetAccountStatus;
exports.adminSetRole = adminAuthority.adminSetRole;
exports.adminSetVerification = adminAuthority.adminSetVerification;
exports.adminModerateListing = adminAuthority.adminModerateListing;
exports.adminAuditQuery = adminAuthority.adminAuditQuery;
exports.adminWhoAmI = adminAuthority.adminWhoAmI;
exports.adminSetEscrowPolicy = adminAuthority.adminSetEscrowPolicy;
// [REPAIR 2026-10 C4] Public user cards: other people are read from userCards,
// never from users/{id} (which now holds private data only for its owner).
const userCards = require('./user-cards');
exports.userCardSync = userCards.userCardSync;
exports.adminBackfillUserCards = userCards.adminBackfillUserCards;
Object.defineProperty(exports, '_userCardsForTest', { enumerable: false, value: userCards._testing });
// [REPAIR 2026-10 M7] Every change to system/* settings is copied to admin_audit_log.
const systemAudit = require('./system-audit');
exports.systemConfigAudit = systemAudit.systemConfigAudit;
exports.announcementsAudit = systemAudit.announcementsAudit;
exports.adminMediaAudit = systemAudit.adminMediaAudit;
// [PHASE 9 B-18] signed admin edits of orders / products / users
exports.ordersAdminAudit = systemAudit.ordersAdminAudit;
exports.productsAdminAudit = systemAudit.productsAdminAudit;
exports.usersAdminAudit = systemAudit.usersAdminAudit;
// [REPAIR 2026-10 H7] Signed Cloudinary uploads (secret stays on the server).
const uploadSigning = require('./upload-signing');
exports.uploadSignature = uploadSigning.uploadSignature;
exports._pesapalGuardForTest = { pesapalLiveGuard, currentProjectId };
Object.defineProperty(exports, '_uploadSigningForTest', { enumerable: false, value: uploadSigning._testing });
Object.defineProperty(exports, '_systemAuditForTest', { enumerable: false, value: systemAudit._testing });

/* =====================================================================
 * [REPAIR 2026-10] PHASE 3 — SOKOPAY ESCROW POLICY, DELIVERY PROOF,
 * DISPUTES, PRICE REVIEW AND PAID ENTITLEMENTS
 * ---------------------------------------------------------------------
 * Escrow release policy (system/config.escrow — set by a Super Admin):
 *   1. Preferred: the BUYER confirms receipt (escrowRelease).
 *   2. Courier deliveries: deliveryComplete (Token C from the receiver).
 *   3. Seller/self delivery: the buyer gets a one-time delivery code
 *      (orderDeliveryCodeIssue) and gives it to the seller only on hand-over;
 *      the seller submits it (orderConfirmDelivery). The seller can never
 *      generate or view that code.
 *   4. Fallback auto-release only when `escrow.autoReleaseAfterDeliveryHours`
 *      is a positive number AND server delivery proof exists AND no dispute
 *      is open. If the setting is absent, there is NO automatic release.
 *   5. SokoPay links (no delivery tracking) auto-release only when
 *      `escrow.linkAutoReleaseHours` is set. Absent = buyer/admin release only.
 *   6. An open dispute freezes the funds until adminResolveDispute.
 * ===================================================================== */
const adminAuth = require('./admin-authority')._internal;

async function escrowConfig() {
    let e = {};
    try { const s = await db.doc('system/config').get(); e = (s.exists && (s.data() || {}).escrow) || {}; } catch (x) { e = {}; }
    const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    return {
        autoReleaseAfterDeliveryHours: num(e.autoReleaseAfterDeliveryHours),
        linkAutoReleaseHours: num(e.linkAutoReleaseHours),
        disputeWindowHours: num(e.disputeWindowHours),
        deliveryCodeTtlHours: num(e.deliveryCodeTtlHours) || 168
    };
}
async function hasOpenDispute(kind, id) {
    const q = await db.collection('disputes').where('targetKey', '==', kind + '_' + id).limit(10).get();
    let open = false;
    q.forEach(d => { if (['open', 'under_review'].indexOf(String((d.data() || {}).status || '')) !== -1) open = true; });
    return open;
}

/* Buyer: get (or re-issue) the one-time delivery code for a paid order. */
exports.orderDeliveryCodeIssue = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const orderId = String((req.data || {}).orderId || '');
    if (!orderId || orderId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'orderId inahitajika.');
    const snap = await db.doc('orders/' + orderId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Oda haipatikani.');
    const o = snap.data() || {};
    if (String(o.buyerId || '') !== auth.uid) throw new HttpsError('permission-denied', 'Mnunuzi pekee ndiye anapata namba ya kupokea.');
    if (['held', 'shipped', 'awaiting_pickup', 'in_transit'].indexOf(String(o.status || '')) === -1 || o.paymentVerified !== true) {
        throw new HttpsError('failed-precondition', 'Oda hii haiko kwenye escrow iliyothibitishwa (status: ' + o.status + ').');
    }
    const cfg = await escrowConfig();
    const code = custodyToken('DL-');
    const now = new Date();
    await db.doc('delivery_tokens/order_' + safeKey(orderId)).set({
        kind: 'order_delivery', orderId, participants: [auth.uid],
        tokenHash: custodyHash(code), tokenRef: custodyMaskToken(code), status: 'pending',
        createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + cfg.deliveryCodeTtlHours * 3600000).toISOString(), attempts: 0
    });
    return { ok: true, code, expiresInHours: cfg.deliveryCodeTtlHours };
});

/* Seller/provider: confirm hand-over with the buyer's code (= delivery proof). */
exports.orderConfirmDelivery = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const d = req.data || {};
    const orderId = String(d.orderId || '');
    const code = String(d.code || '').trim().toUpperCase();
    if (!orderId || orderId.indexOf('/') !== -1 || !code) throw new HttpsError('invalid-argument', 'orderId na code zinahitajika.');
    const orderRef = db.doc('orders/' + orderId);
    const tokRef = db.doc('delivery_tokens/order_' + safeKey(orderId));
    const cfg = await escrowConfig();
    let result = null;
    await db.runTransaction(async (t) => {
        const os = await t.get(orderRef);
        if (!os.exists) throw new HttpsError('not-found', 'Oda haipatikani.');
        const o = os.data() || {};
        const isSeller = String(o.sellerId || '') === auth.uid || String(o.providerId || '') === auth.uid;
        if (!isSeller) throw new HttpsError('permission-denied', 'Muuzaji/mtoa huduma wa oda hii pekee.');
        if (String(o.buyerId || '') === auth.uid) throw new HttpsError('permission-denied', 'Mnunuzi hawezi kuthibitisha upande wa muuzaji.');
        if (['held', 'shipped', 'awaiting_pickup', 'in_transit'].indexOf(String(o.status || '')) === -1) {
            throw new HttpsError('failed-precondition', 'Oda haiko tayari kwa makabidhiano (status: ' + o.status + ').');
        }
        const ts = await t.get(tokRef);
        if (!ts.exists) throw new HttpsError('failed-precondition', 'Mnunuzi bado hajapata namba ya kupokea. Mwombe aifungue kwenye oda yake.');
        const tk = ts.data() || {};
        if (Number(tk.attempts || 0) >= 5) throw new HttpsError('resource-exhausted', 'Majaribio mengi mno. Mnunuzi atoe namba mpya.');
        if (tk.expiresAt && Date.parse(tk.expiresAt) < Date.now()) throw new HttpsError('deadline-exceeded', 'Namba imeisha muda. Mnunuzi atoe mpya.');
        if (tk.status !== 'pending' || custodyHash(code) !== tk.tokenHash) {
            t.update(tokRef, { attempts: FieldValue.increment(1), lastFailAt: new Date().toISOString() });
            result = { ok: false, reason: 'wrong_code' };
            return;
        }
        const now = new Date().toISOString();
        const eligible = cfg.autoReleaseAfterDeliveryHours ? new Date(Date.now() + cfg.autoReleaseAfterDeliveryHours * 3600000).toISOString() : null;
        t.update(tokRef, { status: 'used', usedAt: now, usedBy: auth.uid });
        t.update(orderRef, {
            status: 'delivered', deliveredAt: now, deliveryProofAt: now, deliveryProofBy: 'buyer_code',
            releaseEligibleAt: eligible, updatedAt: now
        });
        result = { ok: true, status: 'delivered', releaseEligibleAt: eligible };
    });
    if (!result.ok) throw new HttpsError('permission-denied', 'Namba ya kupokea si sahihi.');
    const o = (await orderRef.get()).data() || {};
    try {
        await db.collection('notifications').add({ userId: o.buyerId, title: 'Mzigo umekabidhiwa',
            body: 'Muuzaji amethibitisha makabidhiano kwa namba yako. Thibitisha kupokea au fungua mgogoro ikiwa kuna tatizo.',
            createdAt: new Date().toISOString(), read: false, type: 'order', orderId });
    } catch (e) {}
    return result;
});

/* Buyer or seller opens a dispute: freezes escrow until an admin decides. */
exports.disputeOpen = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const d = req.data || {};
    const kind = d.linkId ? 'link' : 'order';
    const id = String(d.linkId || d.orderId || '');
    const reason = String(d.reason || '').trim().slice(0, 1000);
    if (!id || id.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'orderId au linkId inahitajika.');
    if (reason.length < 5) throw new HttpsError('invalid-argument', 'Eleza tatizo (angalau herufi 5).');
    const ref = db.doc((kind === 'order' ? 'orders/' : 'sokopay_links/') + id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Muamala haupatikani.');
    const x = snap.data() || {};
    const buyerId = String(x.buyerId || '');
    const sellerId = String(kind === 'order' ? (x.sellerId || '') : (x.userId || ''));
    if (auth.uid !== buyerId && auth.uid !== sellerId) throw new HttpsError('permission-denied', 'Mhusika wa muamala pekee.');
    const okStates = kind === 'order' ? ['held', 'shipped', 'awaiting_pickup', 'in_transit', 'delivered'] : ['held'];
    if (okStates.indexOf(String(x.status || '')) === -1) throw new HttpsError('failed-precondition', 'Mgogoro unafunguliwa tu fedha zikiwa escrow (status: ' + x.status + ').');
    const cfg = await escrowConfig();
    if (cfg.disputeWindowHours && x.deliveryProofAt && Date.now() - Date.parse(x.deliveryProofAt) > cfg.disputeWindowHours * 3600000) {
        throw new HttpsError('deadline-exceeded', 'Muda wa kufungua mgogoro umepita (saa ' + cfg.disputeWindowHours + ' baada ya makabidhiano).');
    }
    const disputeRef = db.collection('disputes').doc(kind + '_' + safeKey(id));
    const now = new Date().toISOString();
    await db.runTransaction(async (t) => {
        const ds = await t.get(disputeRef);
        if (ds.exists && ['open', 'under_review'].indexOf(String((ds.data() || {}).status)) !== -1) return;
        t.set(disputeRef, {
            targetKind: kind, targetId: id, targetKey: kind + '_' + id, buyerId, sellerId,
            openedBy: auth.uid, openedByRole: auth.uid === buyerId ? 'buyer' : 'seller', reason,
            amount: moneyOf(kind === 'order' ? x.amount : x.price), status: 'open', previousStatus: x.status || null,
            createdAt: now, updatedAt: now
        });
        t.update(ref, { status: 'disputed', disputeReason: reason, disputedAt: now, disputeId: disputeRef.id });
    });
    const other = auth.uid === buyerId ? sellerId : buyerId;
    try { await db.collection('notifications').add({ userId: other, title: 'Mgogoro umefunguliwa', body: 'Fedha zimesimamishwa kwenye escrow mpaka Admin atoe uamuzi. Sababu: ' + reason, createdAt: now, read: false, type: 'dispute' }); } catch (e) {}
    return { ok: true, disputeId: disputeRef.id };
});

/* Admin decision on a dispute — atomic payout from the server escrow hold. */
exports.adminResolveDispute = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    if (!isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    const d = req.data || {};
    const kind = d.linkId ? 'link' : 'order';
    const id = String(d.linkId || d.orderId || '');
    const outcome = String(d.outcome || '');
    const reason = String(d.reason || '').trim();
    if (!id || id.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'orderId au linkId inahitajika.');
    if (['release_seller', 'refund_buyer', 'split'].indexOf(outcome) === -1) throw new HttpsError('invalid-argument', 'outcome: release_seller | refund_buyer | split');
    if (reason.length < 10) throw new HttpsError('invalid-argument', 'Andika sababu ya uamuzi (angalau herufi 10).');
    const ref = db.doc((kind === 'order' ? 'orders/' : 'sokopay_links/') + id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Muamala haupatikani.');
    const x = snap.data() || {};
    const ev = await getEscrowEvidence(kind, id, x, { recheckPesaPal: true });
    if (!ev.ok) throw evidenceError(ev);
    const total = moneyOf(ev.amount);
    let buyerAmt = outcome === 'refund_buyer' ? total : (outcome === 'release_seller' ? 0 : moneyOf(d.buyerAmount));
    if (!(buyerAmt >= 0) || buyerAmt > total + MONEY_EPS) throw new HttpsError('invalid-argument', 'Kiasi cha mnunuzi si sahihi (0 - ' + total + ').');
    const sellerAmt = Math.max(0, moneyOf(total - buyerAmt));
    const buyerUid = String(x.buyerId || '');
    const sellerUid = String(kind === 'order' ? x.sellerId : x.userId);
    const bdoc = await userDocFor(buyerUid);
    const sdoc = await userDocFor(sellerUid);
    if ((buyerAmt > 0 && !bdoc) || (sellerAmt > 0 && !sdoc)) throw new HttpsError('failed-precondition', 'Akaunti ya mhusika haipatikani.');
    const holdRef = db.collection(ESCROW_HOLDS).doc(ev.holdId);
    const disputeRef = db.collection('disputes').doc(kind + '_' + safeKey(id));
    const now = new Date().toISOString();
    let applied = false;
    await db.runTransaction(async (t) => {
        const hs = await t.get(holdRef);
        if (hs.exists && hs.data().released === true) return; // already paid out
        const cur = (await t.get(ref)).data() || {};
        if (['completed', 'refunded_by_admin', 'split_refund_resolved'].indexOf(String(cur.status || '')) !== -1) return;
        if (buyerAmt > 0) {
            t.set(db.doc('wallet_ledger/dispute_' + kind + '_' + safeKey(id) + '_buyer'), { userId: bdoc.id, callerUid: auth.uid, amountTSh: buyerAmt, type: 'refund', note: 'Uamuzi wa mgogoro: ' + reason.slice(0, 200), byAdmin: true, createdAt: now });
            t.update(db.doc('users/' + bdoc.id), { walletBalance: FieldValue.increment(buyerAmt) });
        }
        if (sellerAmt > 0) {
            t.set(db.doc('wallet_ledger/dispute_' + kind + '_' + safeKey(id) + '_seller'), { userId: sdoc.id, callerUid: auth.uid, amountTSh: sellerAmt, type: 'escrow_release', note: 'Uamuzi wa mgogoro: ' + reason.slice(0, 200), byAdmin: true, createdAt: now });
            t.update(db.doc('users/' + sdoc.id), { walletBalance: FieldValue.increment(sellerAmt) });
        }
        t.set(holdRef, Object.assign(hs.exists ? {} : (ev.hold || {}), { released: true, releasedAt: now, releasedFor: 'admin_dispute', releaseTrigger: 'admin_dispute', disputePaid: total }), { merge: true });
        const status = outcome === 'refund_buyer' ? 'refunded_by_admin' : (outcome === 'release_seller' ? 'completed' : 'split_refund_resolved');
        t.update(ref, { status, disputeResolvedAt: now, disputeWinner: outcome === 'split' ? 'split' : (outcome === 'refund_buyer' ? 'buyer' : 'seller'),
            buyerRefund: buyerAmt, sellerEarned: sellerAmt, completedAt: now, refundStatus: buyerAmt > 0 ? 'refunded_to_wallet' : null });
        t.set(disputeRef, { targetKind: kind, targetId: id, targetKey: kind + '_' + id, buyerId: buyerUid, sellerId: sellerUid,
            status: 'resolved', outcome, buyerAmount: buyerAmt, sellerAmount: sellerAmt, resolvedBy: auth.uid, resolvedAt: now, resolutionReason: reason, updatedAt: now }, { merge: true });
        t.set(db.collection('admin_audit_log').doc(), adminAuth.auditEntry(req, 'DISPUTE_RESOLVED', { kind, id }, { outcome, buyerAmt, sellerAmt, total, reason }));
        applied = true;
    });
    if (!applied) return { ok: true, already: true };
    for (const [uid, amt, who] of [[buyerUid, buyerAmt, 'mnunuzi'], [sellerUid, sellerAmt, 'muuzaji']]) {
        try { await db.collection('notifications').add({ userId: uid, title: 'Uamuzi wa mgogoro', body: 'Admin ametoa uamuzi. Kiasi kwako (' + who + '): TSh ' + amt.toLocaleString() + '. Sababu: ' + reason.slice(0, 200), createdAt: now, read: false, type: 'dispute' }); } catch (e) {}
    }
    return { ok: true, outcome, buyerAmount: buyerAmt, sellerAmount: sellerAmt };
});

/* [PHASE 3 2026-10-31] T6 — admin decision on a PAID order whose goods were not
 * secured (late payment without stock, unresolved variant...). Exactly one of:
 *   fulfil: stock is back -> reserve+commit atomically, order goes to 'held'.
 *   refund: escrow hold -> buyer wallet ONCE (deterministic wallet_ledger id,
 *           refunds/online_<id> record, hold marked released, audit entry).
 * A provider (PesaPal / mobile money) refund API is NOT used: none is
 * integrated or verified; that decision belongs to the owner. */
exports.adminPaymentReviewResolve = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    if (!isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    const d = req.data || {};
    const orderId = String(d.orderId || '');
    const action = String(d.action || '');
    const reason = String(d.reason || '').trim();
    if (!orderId || orderId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'orderId inahitajika.');
    if (['refund', 'fulfil'].indexOf(action) === -1) throw new HttpsError('invalid-argument', 'action: refund | fulfil');
    if (reason.length < 10) throw new HttpsError('invalid-argument', 'Andika sababu (angalau herufi 10).');
    const ref = db.doc('orders/' + orderId);
    const first = await ref.get();
    if (!first.exists) throw new HttpsError('not-found', 'Oda haipo.');
    const o0 = first.data() || {};
    if (o0.inventoryReviewState === 'REFUNDED' || o0.inventoryReviewState === 'RESOLVED_FULFILLED') return { ok: true, already: true, state: o0.inventoryReviewState };
    if (!stockCore.escrowReleaseBlocked(o0)) throw new HttpsError('failed-precondition', 'Oda haiko kwenye ukaguzi.');
    const holdRef = db.collection(ESCROW_HOLDS).doc('order_' + orderId);
    const reviewRef = db.collection('payment_reviews').doc(stockCore.ids.review(orderId));
    const now = new Date().toISOString();
    let result = null;
    if (action === 'fulfil') {
        const cfg = Object.assign({}, await inventoryReservation._internal.loadConfig(), { mode: 'all' });
        await db.runTransaction(async (t) => {
            const cur = (await t.get(ref)).data() || {};
            if (['NEEDS_REVIEW', 'REFUND_PENDING'].indexOf(cur.inventoryReviewState) === -1) { result = { ok: true, already: true, state: cur.inventoryReviewState }; return; }
            const hs = await t.get(holdRef);
            if (!hs.exists || hs.data().released === true) throw new HttpsError('failed-precondition', 'Hakuna escrow hai ya oda hii.');
            const state = await inventoryReservation._internal.settlementPrepare(t, [{ id: orderId, data: cur }], cfg);
            const r = inventoryReservation._internal.settlementDecide(state, orderId, cur, now);
            if (r.action !== 'COMMITTED') throw new HttpsError('failed-precondition', 'Stock bado haitoshi (' + (r.reason || r.action) + ').');
            inventoryReservation._internal.settlementFlush(t, state, now);
            stockCore.assertTransition('review', cur.inventoryReviewState, 'RESOLVED_FULFILLED');
            t.update(ref, Object.assign({}, r.orderPatch, { status: 'held', heldAt: now, deliveryStatus: 'held', inventoryReviewState: 'RESOLVED_FULFILLED', reviewResolvedAt: now, reviewResolvedBy: auth.uid, updatedAt: now }));
            t.set(holdRef, { blocked: false, unblockedAt: now, unblockedBy: auth.uid }, { merge: true });
            t.set(reviewRef, { state: 'RESOLVED_FULFILLED', resolvedBy: auth.uid, resolvedAt: now, resolutionReason: reason, updatedAt: now }, { merge: true });
            t.set(db.collection('admin_audit_log').doc(), adminAuth.auditEntry(req, 'PAYMENT_REVIEW_FULFILLED', { kind: 'order', id: orderId }, { reason }));
            result = { ok: true, state: 'RESOLVED_FULFILLED' };
        });
        return result;
    }
    const buyerUid = String(o0.buyerId || '');
    const bdoc = await userDocFor(buyerUid);
    if (!bdoc) throw new HttpsError('failed-precondition', 'Akaunti ya mnunuzi haipatikani.');
    const refundRef = db.collection('refunds').doc(stockCore.ids.refund(orderId));
    const ledgerRef = db.doc('wallet_ledger/' + stockCore.ids.refundLedger(orderId));
    await db.runTransaction(async (t) => {
        const cur = (await t.get(ref)).data() || {};
        const ls = await t.get(ledgerRef);
        const rs = await t.get(refundRef);
        const hs = await t.get(holdRef);
        if (ls.exists || (rs.exists && rs.data().status === 'COMPLETED') || cur.inventoryReviewState === 'REFUNDED') { result = { ok: true, already: true, state: 'REFUNDED' }; return; }
        if (['NEEDS_REVIEW', 'REFUND_PENDING', 'REFUND_FAILED'].indexOf(cur.inventoryReviewState) === -1) throw new HttpsError('failed-precondition', 'Oda haiko kwenye ukaguzi.');
        if (!hs.exists || hs.data().released === true) throw new HttpsError('failed-precondition', 'Hakuna escrow hai ya kurudisha.');
        const hold = hs.data() || {};
        if (String(hold.payerUid || '') !== buyerUid) throw new HttpsError('failed-precondition', 'Mlipaji wa escrow si mnunuzi wa oda.');
        const amount = moneyOf(hold.amount);
        if (!(amount > 0)) throw new HttpsError('failed-precondition', 'Kiasi cha escrow si sahihi.');
        let from = cur.inventoryReviewState;
        if (from === 'NEEDS_REVIEW') from = stockCore.assertTransition('review', 'NEEDS_REVIEW', 'REFUND_PENDING');
        if (from === 'REFUND_FAILED') from = stockCore.assertTransition('review', 'REFUND_FAILED', 'REFUND_PENDING');
        stockCore.assertTransition('review', from, 'REFUNDED');
        t.create(ledgerRef, { userId: bdoc.id, callerUid: auth.uid, amountTSh: amount, type: 'refund', orderId,
            note: 'Refund: oda ililipwa bila stock (' + String(cur.inventoryReviewReason || '') + '). ' + reason.slice(0, 160), byAdmin: true, createdAt: now });
        t.update(db.doc('users/' + bdoc.id), { walletBalance: FieldValue.increment(amount) });
        t.set(holdRef, { released: true, releasedAt: now, releasedFor: 'late_payment_refund', releaseTrigger: 'admin_payment_review', refundedAmount: amount }, { merge: true });
        t.set(refundRef, { refundId: refundRef.id, orderId, buyerId: buyerUid, amount, method: 'wallet', status: 'COMPLETED',
            ledgerId: ledgerRef.id, reason, createdBy: auth.uid, createdAt: rs.exists ? (rs.data().createdAt || now) : now, completedAt: now });
        t.update(ref, { status: 'cancelled_not_fulfilled', inventoryReviewState: 'REFUNDED', refundStatus: 'refunded_to_wallet',
            refundedAt: now, buyerRefund: amount, refundId: refundRef.id, reviewResolvedAt: now, reviewResolvedBy: auth.uid, updatedAt: now });
        t.set(reviewRef, { state: 'REFUNDED', refundId: refundRef.id, resolvedBy: auth.uid, resolvedAt: now, resolutionReason: reason, updatedAt: now }, { merge: true });
        t.set(db.collection('admin_audit_log').doc(), adminAuth.auditEntry(req, 'PAYMENT_REVIEW_REFUNDED', { kind: 'order', id: orderId }, { amount, reason }));
        result = { ok: true, state: 'REFUNDED', amount };
    });
    if (result && result.ok && !result.already) {
        try { await db.collection('notifications').doc('refund_late_' + safeKey(orderId)).set({ userId: buyerUid, type: 'refund', system: true, title: 'Refund ya oda', body: 'Oda yako haikuweza kutimizwa kwa sababu ya stock. TSh ' + Number(result.amount).toLocaleString() + ' zimerudishwa kwenye wallet yako.', createdAt: now, read: false }); } catch (e) {}
    }
    return result;
});

/* Admin approves the price of an order held in 'price_review', then settles. */
exports.adminApproveOrderPrice = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    if (!isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    const d = req.data || {};
    const orderId = String(d.orderId || '');
    const reason = String(d.reason || '').trim();
    if (!orderId || orderId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'orderId inahitajika.');
    if (reason.length < 10) throw new HttpsError('invalid-argument', 'Andika sababu (angalau herufi 10).');
    const ref = db.doc('orders/' + orderId);
    const s = await ref.get();
    if (!s.exists) throw new HttpsError('not-found', 'Oda haipatikani.');
    const o = s.data() || {};
    if (o.paymentStatus !== 'price_review') throw new HttpsError('failed-precondition', 'Oda haiko kwenye ukaguzi wa bei.');
    const now = new Date().toISOString();
    const auditId = await adminAuth.writeAudit(req, 'ORDER_PRICE_APPROVED', { kind: 'order', id: orderId }, { amount: moneyOf(o.amount), reason });
    await ref.update({ priceApprovedBy: auth.uid, priceApprovedAt: now, priceApprovedAmount: moneyOf(o.amount), priceApprovalReason: reason,
        priceApprovalAuditId: auditId, paymentStatus: 'verification_pending' });
    let settled = [];
    const tid = String(o.pesapalTrackingId || o.transactionId || o.paymentRef || '');
    if (tid) {
        const tx = await ppVerifyTransaction(tid);
        if (tx.paid) settled = (await settlePesaPalPayment(tx, 'admin_price_review')).settled;
    }
    return { ok: true, settled };
});

/* ---------------------------------------------------------------------
 * PAID ENTITLEMENTS — boost, subscription, agent fee, serious deposit.
 * The server checks the admin fee switch; when a fee applies it verifies the
 * PesaPal transaction (paid, caller started it, amount >= server price, not
 * reused) before granting. The browser no longer writes these flags.
 * ------------------------------------------------------------------- */
async function consumePesaPal(tid, uid, minAmount, target) {
    const tx = await ppVerifyTransaction(tid);
    if (!tx.paid) throw new HttpsError('failed-precondition', 'Malipo ya PesaPal hayajathibitishwa (' + (tx.reason || 'not_paid') + ').');
    const initUid = await ppInitiatorUid(tx);
    if (initUid && initUid !== uid) throw new HttpsError('permission-denied', 'Muamala huu wa PesaPal si wako.');
    if (tx.amount + MONEY_EPS < minAmount) throw new HttpsError('failed-precondition', 'Kiasi kilicholipwa (TSh ' + tx.amount + ') ni pungufu ya bei (TSh ' + minAmount + ').');
    const usageRef = db.collection(ESCROW_HOLDS).doc('pptx_' + safeKey(tx.trackingId));
    await db.runTransaction(async (t) => {
        const u = await t.get(usageRef);
        const usage = u.exists ? (u.data() || {}) : {};
        const targets = Array.isArray(usage.targets) ? usage.targets : [];
        if (targets.indexOf(target) !== -1) return; // idempotent re-grant
        if (Number(usage.usedAmount || 0) + minAmount > tx.amount + MONEY_EPS) throw new HttpsError('failed-precondition', 'Muamala huu wa PesaPal tayari umetumika.');
        t.set(usageRef, { kind: 'pesapal_tx', trackingId: tx.trackingId, paidAmount: tx.amount, usedAmount: Number(usage.usedAmount || 0) + minAmount,
            targets: targets.concat([target]), updatedAt: new Date().toISOString() }, { merge: true });
    });
    return tx;
}
/* [2026-10-31] Seller account lifecycle: temporary <-> permanent on the SAME account.
 * Server-only (rules stop the browser from self-promoting). The uid, businessId,
 * storeId, products, services, inventory, orders, reviews and wallet are untouched;
 * only sellerType/productLimit change, with a status history entry and an audit row.
 * Requirement enforced: an active subscription when the subscription fee is ON
 * (paymentGate('subscription')) - the rule the UI already states. Identity
 * verification is reported (pendingVerification) but not invented as a legal rule. */
const businessCore = require('./shared/business-context-core');
exports.sellerLifecycleChange = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Ingia kwanza.');
    const target = String((req.data || {}).target || '').toLowerCase();
    const u = await userDocFor(req.auth.uid);
    if (!u) throw new HttpsError('not-found', 'Akaunti haipatikani.');
    const subscriptionRequired = await paymentGate('subscription');
    // Configurable verification (server-only doc; absent = nothing required, gaps only reported).
    const vcSnap = await db.doc('system_config/seller_verification').get();
    const verificationConfig = vcSnap.exists ? (vcSnap.data() || {}) : null;
    const nowIso = new Date().toISOString();
    let result;
    await db.runTransaction(async t => {
        const ref = db.doc('users/' + u.id);
        const snap = await t.get(ref);
        const profile = snap.data() || {};
        const subscriptionActive = profile.isSubscribed === true && String(profile.subscriptionValidUntil || '') > nowIso;
        const plan = businessCore.planSellerLifecycleChange({ profile, target, subscriptionRequired, subscriptionActive, verificationConfig });
        if (!plan.ok) throw new HttpsError('failed-precondition', plan.error + (plan.verificationUnmet && plan.verificationUnmet.length ? ': ' + plan.verificationUnmet.join(',') : ''));
        if (plan.noop) { result = { ok: true, already: true, sellerType: plan.to }; return; }
        const entry = { from: plan.from, to: plan.to, at: nowIso, by: req.auth.uid, reason: 'self_service', subscriptionRequired, subscriptionActive };
        const history = (Array.isArray(profile.sellerStatusHistory) ? profile.sellerStatusHistory : []).slice(-49).concat([entry]);
        t.update(ref, {
            sellerType: plan.to,
            isTemporaryStore: plan.to === 'temporary',
            productLimit: plan.limits.productLimit,
            sellerStatusHistory: history,
            sellerLifecycleUpdatedAt: nowIso
        });
        t.set(db.collection('seller_lifecycle_log').doc(), Object.assign({ uid: req.auth.uid, userDocId: u.id }, entry, { pendingVerification: plan.pendingVerification || [] }));
        result = { ok: true, from: plan.from, sellerType: plan.to, productLimit: plan.limits.productLimit, pendingVerification: plan.pendingVerification || [] };
    });
    return result;
});

exports.entitlementGrant = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const d = req.data || {};
    const kind = String(d.kind || '');
    const tid = String(d.orderTrackingId || '').trim();
    const now = new Date();
    const nowIso = now.toISOString();
    if (kind === 'boost') {
        const col = String(d.collectionName || '');
        if (['products', 'services'].indexOf(col) === -1) throw new HttpsError('invalid-argument', 'collectionName: products | services');
        const id = String(d.itemId || '');
        if (!id || id.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'itemId inahitajika.');
        const ref = db.doc(col + '/' + id);
        const s = await ref.get();
        if (!s.exists) throw new HttpsError('not-found', 'Tangazo halipo.');
        const it = s.data() || {};
        if (String(it.userId || '') !== auth.uid && String(it.managedByAgentUid || '') !== auth.uid) throw new HttpsError('permission-denied', 'Unaweza ku-boost tangazo lako tu.');
        const views = Math.min(1000000, Math.max(100, parseInt(d.targetViews, 10) || 1000));
        const days = Math.min(90, Math.max(1, parseInt(d.boostDays, 10) || (col === 'products' ? 3 : 7)));
        const price = boostPrice(col, views, days);
        if (await paymentGate('boost')) {
            if (!tid) throw new HttpsError('failed-precondition', 'Boost inahitaji malipo ya PesaPal (orderTrackingId).');
            await consumePesaPal(tid, auth.uid, price, 'boost_' + col + '_' + id + '_' + safeKey(tid));
        }
        await ref.update({ isBoosted: true, boostTargetViews: views, boostedViewsCount: 0, boostDays: days, boostedAt: nowIso,
            boostExpiresAt: new Date(now.getTime() + days * 86400000).toISOString(), boostPaidRef: tid || null, boostPrice: price });
        return { ok: true, price, views, days };
    }
    if (kind === 'subscription') {
        const title = String(d.title || '').toUpperCase();
        const price = SUBSCRIPTION_PRICES[title];
        if (!price) throw new HttpsError('invalid-argument', 'Kifurushi hakijulikani.');
        if (await paymentGate('subscription')) {
            if (!tid) throw new HttpsError('failed-precondition', 'Kifurushi kinahitaji malipo ya PesaPal.');
            await consumePesaPal(tid, auth.uid, price, 'sub_' + auth.uid + '_' + safeKey(tid));
        }
        const until = new Date(now.getTime());
        if (title.indexOf('YEAR') !== -1) until.setFullYear(until.getFullYear() + 1); else until.setMonth(until.getMonth() + 1);
        const u = await userDocFor(auth.uid);
        if (!u) throw new HttpsError('not-found', 'Akaunti haipatikani.');
        await db.doc('users/' + u.id).update({ isSubscribed: true, subscriptionType: title, subscriptionValidUntil: until.toISOString(), subStatus: 'Active', subscriptionPaidRef: tid || null });
        return { ok: true, title, validUntil: until.toISOString() };
    }
    if (kind === 'agent_registration') {
        const agentDocId = String(d.agentDocId || '');
        if (!agentDocId || agentDocId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'agentDocId inahitajika.');
        const ref = db.doc('agents/' + agentDocId);
        const s = await ref.get();
        if (!s.exists || String((s.data() || {}).userId || '') !== auth.uid) throw new HttpsError('permission-denied', 'Ombi hili si lako.');
        const fee = Number(process.env.AGENT_REG_FEE || 3100);
        if (!(await paymentGate('agent_registration'))) return { ok: true, free: true };
        if (!tid) throw new HttpsError('failed-precondition', 'Ada ya wakala inahitaji malipo ya PesaPal.');
        await consumePesaPal(tid, auth.uid, fee, 'agentfee_' + agentDocId);
        await ref.update({ isPaid: true, paymentStatus: 'paid', paidAt: nowIso, paymentRef: tid, verifiedPaymentRef: tid });
        return { ok: true, paid: true };
    }
    if (kind === 'deposit_item') {
        const itemId = String(d.itemId || '');
        if (!itemId || itemId.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'itemId inahitajika.');
        const fee = Number(process.env.SERIOUS_DEPOSIT_FEE || 1300);
        const depId = auth.uid + '_' + itemId;
        if (!(await paymentGate('deposit'))) {
            await db.doc('serious_deposits/' + depId).set({ uid: auth.uid, itemId, hasActiveDeposit: true, verified: true, verifiedBy: 'free_mode', amountPaid: 0, verifiedAt: nowIso }, { merge: true });
            return { ok: true, free: true };
        }
        if (!tid) throw new HttpsError('failed-precondition', 'Deposit inahitaji malipo ya PesaPal.');
        const tx = await consumePesaPal(tid, auth.uid, fee, 'deposit_' + depId);
        await db.doc('serious_deposits/' + depId).set({ uid: auth.uid, itemId, hasActiveDeposit: true, verified: true, verifiedBy: 'pesapal', amountPaid: fee,
            verifiedAmount: tx.amount, transactionId: tid, verifiedAt: nowIso, date: nowIso }, { merge: true });
        return { ok: true, paid: true };
    }
    throw new HttpsError('invalid-argument', 'kind: boost | subscription | agent_registration | deposit_item');
});

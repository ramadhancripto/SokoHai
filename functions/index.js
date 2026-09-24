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
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

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

// Token ya PesaPal inaishi ~dakika 5 — tunacache mpaka inakaribia kuisha
let _ppToken = { value: '', expiresAt: 0 };

async function pesapalToken() {
    const c = ppConfig();
    if (!c.consumerKey || !c.consumerSecret) {
        throw new Error('PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET hazijasanidiwa (angalia functions/.env).');
    }
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
    if (ADMIN_EMAILS().includes(em)) return true;
    return !!(context.auth.token && context.auth.token.admin === true);
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
    const ledgerKey = String(data.ledgerKey || ('auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)));
    const note = String(data.note || '');

    if (!docId) throw new HttpsError('invalid-argument', 'docId inahitajika.');
    if (!Number.isFinite(amountTSh) || amountTSh === 0) {
        throw new HttpsError('invalid-argument', 'amountTSh lazima iwe namba isiyo sifuri.');
    }
    const CAP = Number(process.env.WALLET_MAX_ABS || 50000000);
    if (Math.abs(amountTSh) > CAP) {
        throw new HttpsError('out-of-range', 'Kiasi kinazidi kikomo cha muamala mmoja (' + CAP + ').');
    }

    const userRef = db.doc('users/' + docId);
    const ledgerRef = db.doc('wallet_ledger/' + ledgerKey);

    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'Akaunti ya mtumiaji haipatikani (users/' + docId + ').');

    // ULINZI: mtu hawezi kujiongezea salio mwenyewe — isipokuwa aina halali za malipo
    const ALLOW_SELF_CREDIT = [
        'commission', 'agent_commission', 'payout', 'refund',
        'escrow_release', 'carrier_share', 'deposit', 'wallet_topup',
        'sales_income', 'income_offline', 'settlement'
    ];
    if (amountTSh > 0 && docId === auth.uid && ALLOW_SELF_CREDIT.indexOf(type) === -1) {
        throw new HttpsError('permission-denied', 'Huwezi kujiongezea salio mwenyewe (type: ' + type + ').');
    }

    let applied = false;
    await db.runTransaction(async (t) => {
        const ls = await t.get(ledgerRef);
        if (ls.exists) return; // idempotent — tayari imetekelezwa

        const us = await t.get(userRef);
        if (!us.exists) throw new Error('USER_MISSING');
        const cur = Number(us.data().walletBalance || 0);
        const next = cur + amountTSh;
        if (next < 0) throw new Error('INSUFFICIENT_BALANCE');

        t.set(ledgerRef, {
            userId: docId,
            callerUid: auth.uid,
            amountTSh,
            type,
            note,
            createdAt: new Date().toISOString()
        });
        t.update(userRef, { walletBalance: FieldValue.increment(amountTSh) });
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
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId inahitajika.');

    const orderRef = db.doc('orders/' + orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Oda haipatikani.');
    const o = orderSnap.data();

    if (o.status === 'completed') {
        return {
            ok: true, already: true, orderId,
            split: {
                sellerEarned: Number(o.sellerEarned || 0),
                carrierShare: Number(o.carrierEarned || 0),
                platformFee: Number(o.commission || 0)
            }
        };
    }
    if (['held', 'shipped', 'awaiting_pickup', 'in_transit'].indexOf(o.status) === -1) {
        throw new HttpsError('failed-precondition', 'Oda si kwenye escrow (status: ' + o.status + ').');
    }

    const totalAmount = Number(o.amount || 0);
    const sellerId = String(o.sellerId || '');
    const buyerId = String(o.buyerId || auth.uid);
    const itemId = String(o.itemId || '');

    // carrier share (ride_requests ya mnunuzi iliyoko in_transit)
    let carrierShare = 0, driverId = null, rideDocId = null;
    try {
        // [FIX 2026-09] Field MOJA (customerId) + uchujaji status kwenye memory
        // — haiitaji composite index (query ya customerId+status ilirusha
        // "internal" na carrier share ilipotea bila index).
        const rideSnap = await db.collection('ride_requests')
            .where('customerId', '==', buyerId)
            .limit(20).get();
        let rideMatch = null;
        rideSnap.forEach(function (dd) { if (!rideMatch && dd.data().status === 'in_transit') rideMatch = dd; });
        if (rideMatch) {
            const rd = rideMatch.data();
            rideDocId = rideMatch.id;
            driverId = rd.driverId || null;
            carrierShare = Number(rd.price || 0) || Math.round(totalAmount * 0.15);
        }
    } catch (e) { /* carrier ni hiari */ }

    // [ADMIN PAYMENTS SWITCH] Global OFF = FREE → kamisheni 0.
    const platformFee = (await paymentGate('commission')) ? Math.round(totalAmount * 0.05) : 0;
    const sellerEarned = Math.max(0, totalAmount - platformFee - carrierShare);

    // tafuta docs za wahusika
    let sellerDocId = null, sellerAgentCode = null;
    if (sellerId) {
        const sq = await db.collection('users').where('uid', '==', sellerId).limit(1).get();
        if (!sq.empty) { sellerDocId = sq.docs[0].id; sellerAgentCode = sq.docs[0].data().agentCode || null; }
    }
    let driverDocId = null;
    if (driverId) {
        const dq = await db.collection('users').where('uid', '==', driverId).limit(1).get();
        if (!dq.empty) driverDocId = dq.docs[0].id;
    }
    let agentDocId = null, agentUid = null, agentShare = 0, adminShare = platformFee;
    if (sellerAgentCode) {
        const aq = await db.collection('users').where('myAgentCode', '==', sellerAgentCode).limit(1).get();
        if (!aq.empty) {
            const au = aq.docs[0].data();
            if (String(au.uid || '') !== sellerId) {
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
    const now = new Date().toISOString();

    let applied = false;
    await db.runTransaction(async (t) => {
        const rel = await t.get(db.doc('wallet_ledger/' + releaseKey));
        if (rel.exists) return; // tayari ilitolewa (idempotent)

        t.set(db.doc('wallet_ledger/' + releaseKey), {
            orderId, type: 'escrow_release_marker', callerUid: auth.uid, createdAt: now
        });
        t.update(orderRef, {
            status: 'completed', commission: platformFee,
            carrierEarned: carrierShare, sellerEarned, completedAt: now
        });
        if (rideDocId) t.update(db.doc('ride_requests/' + rideDocId), { status: 'completed' });

        if (itemId) {
            const linkRef = db.doc('sokopay_links/' + itemId);
            const ls = await t.get(linkRef);
            if (ls.exists) t.update(linkRef, { status: 'completed' });
        }

        if (sellerDocId && sellerEarned > 0) {
            t.set(db.doc('wallet_ledger/' + sellerKey), {
                userId: sellerDocId, callerUid: auth.uid, amountTSh: sellerEarned,
                type: 'escrow_release', note: 'Escrow release — muuzaji', createdAt: now
            });
            t.update(db.doc('users/' + sellerDocId), { walletBalance: FieldValue.increment(sellerEarned) });
        }
        if (driverDocId && carrierShare > 0) {
            t.set(db.doc('wallet_ledger/' + carrierKey), {
                userId: driverDocId, callerUid: auth.uid, amountTSh: carrierShare,
                type: 'escrow_release', note: 'Escrow release — carrier', createdAt: now
            });
            t.update(db.doc('users/' + driverDocId), { walletBalance: FieldValue.increment(carrierShare) });
        }
        if (agentDocId && agentShare > 0) {
            t.set(db.doc('wallet_ledger/' + agentKey), {
                userId: agentDocId, callerUid: auth.uid, amountTSh: agentShare,
                type: 'escrow_release', note: 'Escrow release — kamisheni ya wakala', createdAt: now
            });
            t.update(db.doc('users/' + agentDocId), { walletBalance: FieldValue.increment(agentShare) });
        }

        t.set(db.collection('adminRevenue').doc(), {
            type: 'commission', amount: adminShare, orderId, date: now
        });
        applied = true;
    });

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
        ok: true, orderId, ledgerId: releaseKey,
        split: { sellerEarned, carrierShare, platformFee }
    };
});

/* ============================================================
 * 4) haipayReleaseLink — kutoa escrow ya SokoPay payment link
 * ========================================================== */
exports.haipayReleaseLink = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const linkId = String((req.data || {}).linkId || '');
    if (!linkId) throw new HttpsError('invalid-argument', 'linkId inahitajika.');

    const linkRef = db.doc('sokopay_links/' + linkId);
    const linkSnap = await linkRef.get();
    if (!linkSnap.exists) throw new HttpsError('not-found', 'Link haipatikani.');
    const L = linkSnap.data();

    if (L.status === 'completed') return { ok: true, already: true, linkId };
    if (L.status !== 'held') {
        throw new HttpsError('failed-precondition', 'Link si kwenye escrow (status: ' + L.status + ').');
    }

    const totalAmount = Number(L.price || 0);
    const sellerId = String(L.userId || '');
    const buyerId = String(L.buyerId || '');
    const carrierShare = Number(L.carrierShare || 0);
    // [ADMIN PAYMENTS SWITCH] Global OFF = FREE → kamisheni 0.
    const platformFee = (await paymentGate('commission')) ? Math.round(totalAmount * 0.05) : 0;
    const sellerEarned = Math.max(0, totalAmount - platformFee - carrierShare);

    let sellerDocId = null;
    if (sellerId) {
        const sq = await db.collection('users').where('uid', '==', sellerId).limit(1).get();
        if (!sq.empty) sellerDocId = sq.docs[0].id;
    }

    const releaseKey = 'spman_link_' + linkId;
    const now = new Date().toISOString();

    await db.runTransaction(async (t) => {
        const rel = await t.get(db.doc('wallet_ledger/' + releaseKey));
        if (rel.exists) return;

        t.set(db.doc('wallet_ledger/' + releaseKey), {
            linkId, type: 'haipay_release', callerUid: auth.uid, createdAt: now
        });
        t.update(linkRef, { status: 'completed', sellerEarned, platformFee, completedAt: now });

        if (sellerDocId && sellerEarned > 0) {
            t.set(db.doc('wallet_ledger/' + releaseKey + '_seller'), {
                userId: sellerDocId, callerUid: auth.uid, amountTSh: sellerEarned,
                type: 'escrow_release', note: 'SokoPay link release', createdAt: now
            });
            t.update(db.doc('users/' + sellerDocId), { walletBalance: FieldValue.increment(sellerEarned) });
        }
        t.set(db.collection('adminRevenue').doc(), {
            type: 'sokopay_commission', amount: platformFee, linkId, date: now
        });
    });

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
});

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
    const redirectUrl = String(d.redirectUrl || c.defaultCallback);
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
    return { ok: true, raw: data, paid: isPesaPalPaid(data) };
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
            let paid = false;
            try {
                const c = ppConfig();
                const token = await pesapalToken();
                const key = orderTrackingId || merchantReference;
                const sr = await ppFetchJson(c.baseUrl + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + encodeURIComponent(key), { method: 'GET', token });
                paid = isPesaPalPaid(sr.json);
            } catch (e) { /* endelea na IPN params */ }

            const refKey = String(orderTrackingId || merchantReference);
            const now = new Date().toISOString();
            if (paid) {
                const ordersQ = await db.collection('orders').where('paymentRef', '==', refKey).limit(20).get();
                const orderSettles = [];
                ordersQ.forEach(docSnap => {
                    const od = docSnap.data() || {};
                    const alreadyHeld = (od.status === 'held' || od.status === 'completed' || od.paymentVerified === true || od.paymentStatus === 'paid');
                    if (!alreadyHeld) {
                        const patch = {
                            status: 'held', paymentStatus: 'paid', paymentVerified: true,
                            paymentProtectedAt: now, paidAt: od.paidAt || now, heldAt: now, ipnAt: now, updatedAt: now
                        };
                        if (od.commerceType === 'service') patch.serviceStatus = 'held';
                        else if (od.commerceType === 'transport') patch.transportStatus = 'held';
                        else patch.deliveryStatus = 'held';
                        orderSettles.push(
                            db.doc('orders/' + docSnap.id).update(patch)
                                // [COMMERCE 2026-09] Tukio la mfumo ndani ya chat ya
                                // majadiliano: "🛡 SokoPay Imelindwa" (pande zote).
                                .then(() => postOrderPaymentProtectedEvent(db, docSnap.id, od, refKey, now))
                                .catch(() => {})
                        );
                    }
                });
                await Promise.all(orderSettles).catch(() => {});
                // sokopay_links pia
                const linksQ = await db.collection('sokopay_links').where('transactionId', '==', refKey).limit(20).get();
                linksQ.forEach(docSnap => {
                    db.doc('sokopay_links/' + docSnap.id).update({ status: 'held', paidAt: now }).catch(() => {});
                });
            }
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
    async () => { await runSokoPayAutoRelease(); }
);

async function runSokoPayAutoRelease() {
    const nowMs = Date.now();
    const timeLimitMs = 24 * 60 * 60 * 1000; // saa 24 za usalama
    let commission = false;
    try { commission = await paymentGate('commission'); } catch (e) { commission = false; }

    // --- A. ODA ZA SOKO KUU (status: shipped → completed baada ya 24h) ---
    try {
        const shipped = await db.collection('orders').where('status', '==', 'shipped').get();
        for (const snap of shipped.docs) {
            const od = snap.data() || {};
            const shippedTime = od.shippedAt ? new Date(od.shippedAt).getTime() : 0;
            if (!(shippedTime > 0 && (nowMs - shippedTime) >= timeLimitMs)) continue;

            const orderId = snap.id;
            const orderRef = db.doc('orders/' + orderId);
            let flipped = false;
            try {
                await db.runTransaction(async (t) => {
                    const os = await t.get(orderRef);
                    if (!os.exists) return;
                    if (String(os.data().status || '') !== 'shipped') return; // tayari imechakatwa
                    t.update(orderRef, { status: 'completed', autoReleased: true, autoReleasedAt: new Date().toISOString() });
                    flipped = true;
                });
            } catch (e) { continue; }
            if (!flipped) continue;

            const amount = parseFloat(od.amount || 0);
            const sellerId = od.sellerId;
            const platformFee = commission ? amount * 0.05 : 0;
            const sellerEarned = amount - platformFee;

            if (sellerId && sellerEarned > 0) {
                const sq = await db.collection('users').where('uid', '==', sellerId).limit(1).get();
                if (!sq.empty) {
                    const sellerDocId = sq.docs[0].id;
                    await creditWallet(sellerDocId, sellerEarned, 'escrow_release', 'spauto_order_' + orderId, 'SokoPay auto-release (saa 24) - oda');
                    await db.collection('notifications').add({
                        userId: sellerId,
                        title: ' SokoPay: Auto-Release Imekamilika!',
                        body: `Mteja hajaanzisha mgogoro wowote ndani ya saa 24 tangu usafirishaji kuanza kwa mkataba wa "${String(od.itemTitle || '')}". TSh ${sellerEarned.toLocaleString()} imesukumwa kwenye wallet yako automatically [1].`,
                        createdAt: new Date().toISOString(), read: false, type: 'wallet'
                    }).catch(() => {});
                }
            }
            await db.collection('adminRevenue').add({
                type: 'sokopay_commission', amount: platformFee,
                contractCode: od.paymentRef || 'AUTO_RELEASE', date: new Date().toISOString()
            }).catch(() => {});
        }
    } catch (e) { console.error('sokopayAutoRelease (orders):', e && e.message); }

    // --- B. MIKATABA YA NJE YA SOKOPAY (status: held → completed baada ya 24h) ---
    try {
        const held = await db.collection('sokopay_links').where('status', '==', 'held').get();
        for (const snap of held.docs) {
            const ld = snap.data() || {};
            const paidTime = ld.paidAt ? new Date(ld.paidAt).getTime() : 0;
            if (!(paidTime > 0 && (nowMs - paidTime) >= timeLimitMs)) continue;

            const linkId = snap.id;
            const linkRef = db.doc('sokopay_links/' + linkId);
            let flipped = false;
            try {
                await db.runTransaction(async (t) => {
                    const ls = await t.get(linkRef);
                    if (!ls.exists) return;
                    if (String(ls.data().status || '') !== 'held') return;
                    t.update(linkRef, { status: 'completed', autoReleased: true, autoReleasedAt: new Date().toISOString() });
                    flipped = true;
                });
            } catch (e) { continue; }
            if (!flipped) continue;

            const amount = parseFloat(ld.price || 0);
            const sellerId = ld.userId;
            const carrierShare = parseFloat(ld.carrierShare || 0);
            const platformFee = commission ? amount * 0.05 : 0;
            const sellerEarned = amount - (platformFee + carrierShare);

            if (sellerId && sellerEarned > 0) {
                const sq = await db.collection('users').where('uid', '==', sellerId).limit(1).get();
                if (!sq.empty) {
                    const sellerDocId = sq.docs[0].id;
                    await creditWallet(sellerDocId, sellerEarned, 'escrow_release', 'spauto_link_' + linkId, 'SokoPay auto-release (saa 24) - mkataba');
                    await db.collection('notifications').add({
                        userId: sellerId,
                        title: ' SokoPay: Auto-Release ya Mkataba!',
                        body: `Mkataba wako wa SokoPay "${String(ld.title || '')}" umekamilishwa kiotomatiki baada ya saa 24 [1]. Kiasi cha TSh ${sellerEarned.toLocaleString()} imewekwa kwenye wallet yako.`,
                        createdAt: new Date().toISOString(), read: false, type: 'wallet'
                    }).catch(() => {});
                }
            }
            await db.collection('adminRevenue').add({
                type: 'sokopay_commission', amount: platformFee,
                contractCode: ld.code || 'AUTO_RELEASE', date: new Date().toISOString()
            }).catch(() => {});
        }
    } catch (e) { console.error('sokopayAutoRelease (links):', e && e.message); }
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
    q.forEach(d => { if (d.data().status === 'approved') approved = true; });
    // [FIX 2026-09] Kama agents bado haionyeshi approved, angalia alama ya
    // mtumiaji (users.isApprovedAgent) — approveAgent inaweka zote mbili,
    // lakini data ya zamani inaweza kuwa imekosa moja. Usimzuie wakala
    // aliyekwisha idhinishwa na Admin kwa sababu ya alama moja kupotea.
    if (!approved) {
        try {
            const uq = await db.collection('users')
                .where('uid', '==', auth.uid)
                .limit(5).get();
            uq.forEach(d => { if (d.data().isApprovedAgent === true) approved = true; });
        } catch (e) { /* hiari — agents ndiyo chanzo kikuu */ }
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

async function custodySetToken(rideId, kind, token, participants) {
    const now = new Date().toISOString();
    await db.collection('delivery_tokens').doc(rideId + '_' + kind).set({
        rideId: rideId,
        kind: kind,
        token: token,
        participants: participants || [],
        createdAt: now,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        status: 'pending'
    });
}

async function custodyGetToken(rideId, kind) {
    try {
        const s = await db.doc('delivery_tokens/' + rideId + '_' + kind).get();
        return (s.exists && s.data().token) ? s.data().token : null;
    } catch (e) { return null; }
}

async function custodyMarkTokenStatus(rideId, kind, status) {
    try { await db.doc('delivery_tokens/' + rideId + '_' + kind).update({ status: status, usedAt: new Date().toISOString() }); } catch (e) { /* hiari */ }
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

// [PHASE B] Mkopo wa wallet wa server (atomic + idempotent) — kwa malipo ya
// dereva kwenye deliveryComplete (hakuna self-credit ya browser).
async function creditWallet(docId, amountTSh, type, ledgerKey, note) {
    if (!docId || !Number.isFinite(amountTSh) || amountTSh <= 0) return;
    try {
        const userRef = db.doc('users/' + docId);
        const ledgerRef = db.doc('wallet_ledger/' + ledgerKey);
        await db.runTransaction(async (t) => {
            const ls = await t.get(ledgerRef);
            if (ls.exists) return; // idempotent
            const us = await t.get(userRef);
            if (!us.exists) return;
            t.set(ledgerRef, {
                userId: docId, callerUid: 'system', amountTSh: amountTSh,
                type: type, note: note || '', createdAt: new Date().toISOString()
            });
            t.update(userRef, { walletBalance: FieldValue.increment(amountTSh) });
        });
    } catch (e) { /* malipo si muhimu kusitisha custody */ }
}

/* [CUSTODY 2026-09] Kukubali kazi (accept) ni ya SERVER — browser haiwezi
 * kujipanga mwenyewe kama dereva. Hii inaweka accepted + driverId + inazalisha
 * token ya kuchukua (PK) + inaandika TRANSPORTER_ACCEPTED/PICKUP_TOKEN_GENERATED
 * + inaarifu muuzaji. KANUNI: "ACCEPTED ≠ PICKED UP". */
exports.deliveryAccept = onCall({ region: REGION }, async (req) => {
    const auth = requireAuth(req);
    const data = req.data || {};
    const rideId = String(data.rideId || '');
    if (!rideId) throw new HttpsError('invalid-argument', 'rideId inahitajika.');
    const { ref, data: rd } = await custodyGetRide(rideId);
    const now = new Date().toISOString();

    // Safari ikiwa tayari na dereva mwingine (na haijakabidhiwa kwa huyu), kataa.
    if (rd.driverId && rd.driverId !== auth.uid &&
        ['accepted', 'pickup_pending', 'seller_confirmed_handover', 'picked_up',
         'in_transit', 'awaiting_handover'].indexOf(rd.status) !== -1) {
        throw new HttpsError('failed-precondition', 'Safari tayari imekabidhiwa kwa dereva mwingine.');
    }

    // Token ya kuchukua (PK) — crypto-random, single-use, 72h.
    // [PHASE B] Hash kwenye ride doc + plaintext kwenye delivery_tokens (private).
    const pk = custodyToken('PK-');
    await custodySetToken(rideId, 'pickup', pk, [rd.customerId, auth.uid].filter(Boolean));
    await ref.update({
        status: 'accepted',
        driverId: auth.uid,
        driverName: String(data.driverName || rd.driverName || auth.uid),
        driverPhone: String(data.driverPhone || ''),
        driverVehicleReg: String(data.driverVehicleReg || ''),
        acceptedAt: now,
        pickupTokenHash: custodyHash(pk),
        pickupTokenRef: custodyMaskToken(pk),
        pickupTokenStatus: 'pending',
        pickupTokenCreatedAt: now,
        pickupTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        custodyStage: 'pickup'
    });
    await custodyEvent(rideId, 'TRANSPORTER_ACCEPTED', auth, { actorRole: 'transporter' });
    await custodyEvent(rideId, 'PICKUP_TOKEN_GENERATED', auth, {});
    if (rd.customerId) {
        await custodyNotify(rd.customerId, 'Transporter Amekubali — Pickup Inasubiri',
            'Dereva amekubali kazi. Thibitisha makabidhiano ya mzigo kwenye Jopo la Mizigo & Dispatch.');
    }
    return { ok: true, token: pk, status: 'accepted', driverId: auth.uid };
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
        t.update(rideRef, {
            status: 'accepted',
            driverId: auth.uid,
            driverName: String(data.driverName || agentName || rd.driverName || auth.uid),
            driverPhone: String(data.driverPhone || ''),
            driverVehicleReg: String(data.driverVehicleReg || ''),
            acceptedAt: now,
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
    // Token iliyopo (pending, haijaisha muda) → rudisha ile ile.
    if (rd.pickupTokenStatus === 'pending' && !custodyExpired(rd)) {
        const existing = await custodyGetToken(rideId, 'pickup') || rd.pickupToken || null;
        if (existing) return { ok: true, token: existing, kind, status: rd.status };
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
        if (rd.customerId !== auth.uid) {
            throw new HttpsError('permission-denied', 'Ni mmiliki wa mzigo pekee anayeweza kuthibitisha makabidhiano.');
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
    // Token C (DL) — mpokeaji wa mwisho. Ikiwa imewekwa, lazima ilingane.
    // [PHASE B] Uthibitisho wa hash-first (transferCodeHash) na fallback ya
    // legacy plaintext (transferCode) kwa safari za zamani.
    if (rd.transferCode || rd.transferCodeHash) {
        const given = String(data.transferCode || '').trim().toUpperCase();
        if (!custodyTokenOk(rd, 'transfer', given)) {
            await custodyAttemptFail(rideId, 'delivery');
            throw new HttpsError('failed-precondition', 'Invalid pickup confirmation. Please verify the token and try again.');
        }
    }
    await custodyAttemptClear(rideId, 'delivery');
    await custodyMarkTokenStatus(rideId, 'transfer', 'used');

    // Hesabu malipo (pamoja na faini ya mifugo kama inatumika).
    const finalPrice = Number(rd.cargoPrice || rd.price || 40000);
    let finalPayout = finalPrice;
    let arrivalCount = null;
    if (rd.reqCategory === 'Livestock') {
        const pickupCount = Number(rd.verifiedPickupCount || rd.animalCount || 0);
        arrivalCount = Number(data.arrivalCount);
        if (isNaN(arrivalCount)) arrivalCount = pickupCount;
        if (arrivalCount < pickupCount) {
            const lost = pickupCount - arrivalCount;
            const penalty = Math.round(finalPrice * 0.15) * lost;
            finalPayout = Math.max(0, finalPrice - penalty);
        }
    }

    await ref.update({
        status: 'completed',
        completedAt: now,
        currentCustodian: rd.customerId || null,
        currentCustodianName: rd.customerName || 'Mnunuzi',
        finalPayout: finalPayout,
        verifiedArrivalCount: arrivalCount,
        custodyStage: 'completed'
    });
    await custodyEvent(rideId, 'DELIVERY_CONFIRMED', auth, { actorRole: isReceiver ? 'receiver' : 'transporter' });
    await custodyEvent(rideId, 'DELIVERY_COMPLETED', auth, { actorRole: isReceiver ? 'receiver' : 'transporter' });

    // Malipo ya dereva (server, atomic + idempotent). [PHASE B] skipPayout=true
    // inatumika pale malipo tayari yanashughulikiwa na mtiririko mwingine
    // (mfano escrowRelease ya marketplace) ili kuepuka malipo mara mbili.
    if (rd.driverId && finalPayout > 0 && data.skipPayout !== true) {
        await creditWallet(rd.driverId, finalPayout, 'payout', 'deliverycomplete_' + rideId, 'Malipo ya safari (deliveryComplete)');
        await custodyNotify(rd.driverId, 'SokoPay: Malipo ya Safari Yamepokelewa!',
            'Mteja amethibitisha kupokea mzigo. TSh ' + Number(finalPayout).toLocaleString() + ' imeingizwa kwenye wallet yako.');
    }
    if (rd.customerId) {
        await custodyNotify(rd.customerId, 'Uwasilishaji Umekamilika', 'Mzigo wako umewasilishwa na kuthibitishwa. Asante kwa kutumia SokoHai.');
    }

    // AUTO-RELEASE ya bidhaa inayohusiana na safari (chain order), kama ipo.
    try {
        // [FIX 2026-09] Field MOJA (buyerId) + uchujaji itemId/status kwenye
        // memory — haiitaji composite index (query ya field TATU ilirusha
        // "internal" na auto-release ya chain order ilipotea bila index).
        const orderSnap = await db.collection('orders')
            .where('buyerId', '==', rd.customerId)
            .limit(50).get();
        let orderMatch = null;
        orderSnap.forEach(function (dd) {
            if (orderMatch) return;
            const od2 = dd.data();
            if (od2.status === 'held' && (od2.itemId === (rd.parentRideId || 'N/A') || od2.productId === (rd.parentRideId || 'N/A'))) orderMatch = dd;
        });
        if (orderMatch) {
            const orderDoc = orderMatch;
            const od = orderDoc.data();
            await db.doc('orders/' + orderDoc.id).update({ status: 'completed' });
            if (od.sellerId) {
                const sq = await db.collection('users').where('uid', '==', od.sellerId).limit(1).get();
                if (!sq.empty) {
                    const platformFee = (await paymentGate('commission')) ? Math.round(Number(od.amount || 0) * 0.05) : 0;
                    const sellerEarned = Math.max(0, Number(od.amount || 0) - platformFee);
                    await creditWallet(sq.docs[0].id, sellerEarned, 'escrow_release', 'chain_order_' + orderDoc.id, 'Auto-release ya bidhaa ya safari (chain)');
                }
            }
        }
    } catch (e) { /* chain order si muhimu kusitisha uwasilishaji */ }

    return { ok: true, status: 'completed', finalPayout: finalPayout };
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
// [REQUEST ROUTING 2026-09] Injini ya kupeleka booking kwa mawakala
// waliostahili (offers + reassignment). Accept imo hapa index.js.
const routingEngine = require('./routing');
exports.deliveryRouteBooking = routingEngine.deliveryRouteBooking;
exports.deliveryOfferDecline = routingEngine.deliveryOfferDecline;
exports.deliveryRouteSweep = routingEngine.deliveryRouteSweep;
exports.deliveryRouteRetry = routingEngine.deliveryRouteRetry;
exports.negotiationSendOffer = negotiationEngine.negotiationSendOffer;
exports.negotiationAction = negotiationEngine.negotiationAction;
// [DELIVERY FLOW 2026-09] Mtiririko wa uwasilishaji wa oda za majadiliano
// (paid → prepared → in_transit → delivered → confirmed). Server-authoritative.
exports.negotiationOrderAction = negotiationEngine.negotiationOrderAction;

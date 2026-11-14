/**
 * SokoHai — pilot operations.                                         [PILOT OPS 2026-11-14]
 *  adminMoneyWatch   — admin-only, read-only: money that needs a human now (PesaPal payments not yet
 *                      confirmed, withdrawals waiting long / waiting a second approver, open payment
 *                      reviews, disputes open long) + when the money jobs last ran.
 *  clientErrorReport — the browser reports an uncaught error (sampled, size-limited, rate-limited);
 *                      production errors were only printed to the user's console before.
 *                      Never stores tokens, query strings or form values.
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const authority = require('./admin-authority');
const { isAdmin } = authority._internal;

const REGION = 'europe-west1';
const HOUR = 3600 * 1000;

const ageH = (iso, now) => { const t = Date.parse(iso || ''); return t ? (now - t) / HOUR : null; };

async function moneyWatch(nowMs) {
    const db = admin.firestore();
    nowMs = nowMs || Date.now();
    const out = { generatedAt: new Date(nowMs).toISOString(), items: [], jobs: {} };
    const add = (key, label, rows, hint) => out.items.push({ key, label, count: rows.length, hint, rows: rows.slice(0, 20) });

    const pp = await db.collection('escrow_holds').where('reconcileState', '==', 'open').limit(200).get();
    add('pesapal_open', 'Malipo ya PesaPal yasiyothibitishwa (> dk 10)', pp.docs
        .map(d => ({ id: d.id, d: d.data() || {} })).filter(x => (ageH(x.d.createdAt, nowMs) || 0) > 10 / 60)
        .map(x => ({ id: x.id, uid: x.d.uid || null, amount: x.d.amount || 0, ageHours: Math.round(ageH(x.d.createdAt, nowMs) * 10) / 10, attempts: x.d.reconcileAttempts || 0 })),
        'Server inaiuliza PesaPal kila dk 10 (pesapalReconcileSweep). Zikibaki > saa 2, wasiliana na PesaPal/mteja.');

    const wd = await db.collection('withdrawal_requests').where('status', '==', 'pending').limit(200).get();
    const wdRows = wd.docs.map(d => ({ id: d.id, d: d.data() || {} }));
    add('withdrawals_second', 'Kutoa pesa: zinasubiri idhini ya PILI', wdRows.filter(x => x.d.awaitingSecondApproval)
        .map(x => ({ id: x.id, amount: x.d.amount || 0, firstApprovedBy: x.d.firstApprovedBy || null, ageHours: Math.round((ageH(x.d.createdAt, nowMs) || 0) * 10) / 10 })),
        'Admin tofauti na wa kwanza akamilishe.');
    add('withdrawals_old', 'Kutoa pesa: zinasubiri > saa 48', wdRows.filter(x => (ageH(x.d.createdAt, nowMs) || 0) > 48)
        .map(x => ({ id: x.id, amount: x.d.amount || 0, ageHours: Math.round(ageH(x.d.createdAt, nowMs)) })),
        'Salio la mtumiaji limeshikiliwa tangu ombi; amua: lipa au kataa (kurudisha).');

    const pr = await db.collection('payment_reviews').where('state', 'in', ['NEEDS_REVIEW', 'REFUND_PENDING']).limit(200).get().catch(() => ({ docs: [] }));
    add('payment_reviews', 'Oda zilizolipwa lakini stock haipo (ukaguzi)', pr.docs.map(d => ({ id: d.id, orderId: (d.data() || {}).orderId || null })),
        'Admin → kurudisha pesa au kutimiza (adminPaymentReviewResolve).');

    const dp = await db.collection('disputes').where('status', '==', 'open').limit(200).get();
    add('disputes_old', 'Migogoro iliyo wazi > siku 3', dp.docs.map(d => ({ id: d.id, d: d.data() || {} }))
        .filter(x => (ageH(x.d.createdAt || x.d.openedAt, nowMs) || 0) > 72).map(x => ({ id: x.id, ageHours: Math.round(ageH(x.d.createdAt || x.d.openedAt, nowMs)) })),
        'Escrow imezuiwa wakati wote wa mgogoro.');

    for (const j of ['pesapalReconcile', 'deliveryOfferExpiry']) {
        const s = await db.doc('system_jobs/' + j).get().catch(() => null);
        out.jobs[j] = s && s.exists ? s.data() : null;
    }
    out.attention = out.items.reduce((n, i) => n + i.count, 0);
    return out;
}

exports.adminMoneyWatch = onCall({ region: REGION }, async (req) => {
    if (!req.auth || !isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    return Object.assign({ ok: true }, await moneyWatch());
});

/* ---------------- client error reports ---------------- */
const MAX_PER_HOUR = 30;
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
function cleanPath(u) {
    try { const x = new URL(String(u || ''), 'https://sokohai.com'); return clip(x.pathname, 200); } catch (e) { return ''; }
}
function cleanSource(u) {
    const s = String(u || '');
    const m = /\/(js\/[A-Za-z0-9_./-]+\.m?js)/.exec(s);
    return m ? clip(m[1], 160) : '';
}
function scrub(msg) {
    // never keep anything that looks like a credential, token, e-mail or phone number
    return clip(msg, 400)
        .replace(/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+)/g, '[token]')
        .replace(/(key|token|secret|password|pass|pwd)=([^&\s]+)/gi, '$1=[x]')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
        .replace(/\+?\d[\d\s-]{8,}\d/g, '[number]');
}

exports.clientErrorReport = onCall({ region: REGION }, async (req) => {
    const db = admin.firestore();
    const d = req.data || {};
    const uid = (req.auth && req.auth.uid) || null;
    const ip = String((req.rawRequest && (req.rawRequest.ip || (req.rawRequest.headers || {})['x-forwarded-for'])) || 'unknown').split(',')[0].trim();
    const who = uid ? 'u_' + uid : 'ip_' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
    const message = scrub(d.message);
    if (!message) throw new HttpsError('invalid-argument', 'message inahitajika.');
    const hourKey = new Date().toISOString().slice(0, 13);
    const rlRef = db.doc('client_error_limits/' + who + '_' + hourKey.replace(/[^0-9T]/g, ''));
    let allowed = false;
    await db.runTransaction(async (t) => {
        const s = await t.get(rlRef);
        const n = s.exists ? Number((s.data() || {}).n || 0) : 0;
        if (n >= MAX_PER_HOUR) return;
        t.set(rlRef, { n: n + 1, hour: hourKey, expireAt: new Date(Date.now() + 2 * HOUR).toISOString() }, { merge: true });
        allowed = true;
    });
    if (!allowed) return { ok: true, dropped: 'rate_limited' };
    const fingerprint = crypto.createHash('sha1').update(message + '|' + cleanSource(d.source)).digest('hex').slice(0, 20);
    await db.collection('client_errors').add({
        message, fingerprint,
        kind: clip(d.kind || 'error', 24), source: cleanSource(d.source), line: Number(d.line) || null,
        page: cleanPath(d.page), appVersion: clip(d.appVersion, 40), userAgent: clip(d.userAgent, 160),
        uid, createdAt: new Date().toISOString()
    });
    return { ok: true };
});

exports._testing = { moneyWatch, scrub, cleanPath, cleanSource };

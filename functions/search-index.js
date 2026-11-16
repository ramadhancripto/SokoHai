/**
 * SokoHai — catalogue search index.                                  [SEARCH 2026-11-14]
 * The feed search used to look only inside the 20–100 newest listings already in the browser,
 * so an older product could never be found by name. Every product/service now carries
 * `searchTokens` (shared/search-tokens.js), written ONLY here (rules refuse it from clients):
 *   - catalogSearchIndexProducts / catalogSearchIndexServices: triggers on every write;
 *     they rewrite the field only when it actually changes (no write loops).
 *   - adminSearchBackfill: admin callable that indexes existing listings page by page
 *     (run once after deploy; idempotent).
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const authority = require('./admin-authority');
const { isAdmin } = authority._internal;
const ST = require('./shared/search-tokens.js');

const REGION = 'europe-west1';
const COLLECTIONS = ['products', 'services'];

/** Index one document. Returns 'written' | 'same' | 'missing'. */
async function indexDoc(ref, data) {
    if (!data) return 'missing';
    const tokens = ST.tokensFor(data);
    if (ST.sameTokens(tokens, data.searchTokens)) return 'same';
    await ref.update({ searchTokens: tokens, searchIndexedAt: new Date().toISOString() });
    return 'written';
}

function trigger(collection) {
    return onDocumentWritten({ document: collection + '/{id}', region: REGION }, async (event) => {
        const after = event.data && event.data.after;
        if (!after || !after.exists) return;
        await indexDoc(after.ref, after.data());
    });
}
exports.catalogSearchIndexProducts = trigger('products');
exports.catalogSearchIndexServices = trigger('services');

/** One page of the backfill: { collection, startAfter } -> { next, written, same }. */
async function backfillPage(collection, startAfter, pageSize) {
    const db = admin.firestore();
    let q = db.collection(collection).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (startAfter) q = q.startAfter(startAfter);
    const snap = await q.get();
    let written = 0, same = 0;
    for (const d of snap.docs) {
        const r = await indexDoc(d.ref, d.data());
        if (r === 'written') written++; else if (r === 'same') same++;
    }
    const next = snap.size === pageSize ? snap.docs[snap.size - 1].id : null;
    return { next, written, same, scanned: snap.size };
}

/* [HARDENING 2026-11-16] ONE backfill run at a time, enforced by the SERVER.
 * Before: every page call was independent, so a double click (or two admins / two tabs)
 * started two full runs in parallel and every page wrote its own SEARCH_BACKFILL audit row
 * (the audit log showed dozens of "runs" for one click).
 * Now a run is a lease in `system_locks/search_backfill` (clients have no access — rules deny):
 *   - start  (no runId): refused with `already-exists` while another run holds a live lease;
 *                        otherwise a new runId is issued. An abandoned run expires after LEASE_MS.
 *   - page   ({runId}):  only the run owner (same runId + same admin) may continue, and only one
 *                        page may be in flight at a time (`failed-precondition` otherwise).
 *                        The SERVER keeps the cursor: products first, then services.
 *   - audit: SEARCH_BACKFILL_STARTED at start, exactly ONE SEARCH_BACKFILL row with the run's
 *            totals when it completes, SEARCH_BACKFILL_REFUSED for refused duplicate starts.
 *            (adminSetupStatus treats SEARCH_BACKFILL as "a run has completed".) */
const LOCK_PATH = 'system_locks/search_backfill';
const LEASE_MS = 10 * 60 * 1000;

function newRunId() { return 'sb_' + Date.now().toString(36) + '_' + require('crypto').randomBytes(6).toString('hex'); }
function isLive(lock, now) { return !!lock && lock.status === 'running' && Number(lock.leaseUntil) > now; }
function actorOf(req) { return { actorUid: req.auth.uid, actorEmail: (req.auth.token && req.auth.token.email) || null }; }
async function audit(action, req, details) {
    await admin.firestore().collection('admin_audit_log').add(Object.assign({
        action, actorRole: 'admin', target: { kind: 'search_index', lock: LOCK_PATH }, details, createdAt: new Date().toISOString()
    }, actorOf(req)));
}

exports.adminSearchBackfill = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
    if (!req.auth || !isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    const db = admin.firestore();
    const lockRef = db.doc(LOCK_PATH);
    const data = req.data || {};
    const pageSize = Math.min(Math.max(parseInt(data.pageSize, 10) || 300, 1), 500);
    let runId = data.runId ? String(data.runId) : null;
    if (runId && !/^sb_[a-z0-9]+_[a-f0-9]{12}$/.test(runId)) throw new HttpsError('invalid-argument', 'runId si sahihi.');

    // ---- 1) start a run, or claim the next page of an existing one (atomic) ----
    let lock;
    try {
        lock = await db.runTransaction(async (tx) => {
            const snap = await tx.get(lockRef);
            const cur = snap.exists ? snap.data() : null;
            const now = Date.now();
            if (!runId) {
                let cols = Array.isArray(data.collections) && data.collections.length ? data.collections.map(String) : COLLECTIONS.slice();
                if (!cols.every(c => COLLECTIONS.indexOf(c) !== -1)) throw new HttpsError('invalid-argument', 'collections: products | services');
                cols = COLLECTIONS.filter(c => cols.indexOf(c) !== -1);
                if (isLive(cur, now)) {
                    const e = new HttpsError('already-exists', 'Uandaaji wa utafutaji tayari unaendelea (ulianzishwa ' + (cur.startedAt || '') + '). Subiri ukamilike.');
                    e.__refused = { runningRunId: cur.runId, runningSince: cur.startedAt || null };
                    throw e;
                }
                const fresh = Object.assign({
                    runId: newRunId(), status: 'running', collections: cols, colIndex: 0, cursor: null,
                    pages: 0, written: 0, same: 0, scanned: 0, pageInFlight: true,
                    startedAt: new Date(now).toISOString(), leaseUntil: now + LEASE_MS,
                    replaced: cur && cur.status === 'running' ? { runId: cur.runId || null, reason: 'lease-expired' } : null
                }, actorOf(req));
                tx.set(lockRef, fresh);
                return Object.assign({ started: true }, fresh);
            }
            if (!cur || cur.runId !== runId) throw new HttpsError('failed-precondition', 'Uandaaji huu haupo tena (umeisha muda au umechukuliwa na mwingine). Anza upya.');
            if (cur.actorUid !== req.auth.uid) throw new HttpsError('permission-denied', 'Uandaaji huu ni wa admin mwingine.');
            if (cur.status !== 'running') throw new HttpsError('failed-precondition', 'Uandaaji huu umeshakamilika.');
            if (!(Number(cur.leaseUntil) > now)) throw new HttpsError('failed-precondition', 'Uandaaji huu umeisha muda. Anza upya.');
            if (cur.pageInFlight) throw new HttpsError('failed-precondition', 'Ukurasa mwingine wa uandaaji huu bado unaendelea.');
            tx.update(lockRef, { pageInFlight: true, leaseUntil: now + LEASE_MS });
            return Object.assign({ started: false }, cur);
        });
    } catch (e) {
        if (e && e.__refused) { try { await audit('SEARCH_BACKFILL_REFUSED', req, e.__refused); } catch (x) {} }
        throw e;
    }
    runId = lock.runId;
    if (lock.started) await audit('SEARCH_BACKFILL_STARTED', req, { runId, collections: lock.collections, startedAt: lock.startedAt });

    // ---- 2) do exactly one page ----
    const collection = lock.collections[lock.colIndex];
    let r;
    try {
        r = await backfillPage(collection, lock.cursor, pageSize);
    } catch (e) {
        try { await lockRef.update({ pageInFlight: false, lastError: String((e && e.message) || e).slice(0, 300) }); } catch (x) {}
        throw new HttpsError('internal', 'Ukurasa umeshindikana: ' + String((e && e.message) || e).slice(0, 200));
    }

    // ---- 3) record progress; finish the run after the last page of the last collection ----
    let colIndex = lock.colIndex, cursor = r.next;
    if (!cursor) { colIndex += 1; cursor = null; }
    const done = colIndex >= lock.collections.length;
    const totals = { pages: (lock.pages || 0) + 1, written: (lock.written || 0) + r.written, same: (lock.same || 0) + r.same, scanned: (lock.scanned || 0) + r.scanned };
    const finishedAt = done ? new Date().toISOString() : null;
    await lockRef.update(Object.assign({ colIndex, cursor, pageInFlight: false, leaseUntil: Date.now() + LEASE_MS, lastPageAt: new Date().toISOString() }, totals,
        done ? { status: 'completed', finishedAt, leaseUntil: 0 } : {}));
    if (done) {
        await audit('SEARCH_BACKFILL', req, Object.assign({ runId, collections: lock.collections, startedAt: lock.startedAt, finishedAt }, totals));
    }
    return Object.assign({ ok: true, runId, collection, done, nextCollection: done ? null : lock.collections[colIndex], page: r, totals });
});

exports._testing = { indexDoc, backfillPage, LOCK_PATH, LEASE_MS };

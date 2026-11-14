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

exports.adminSearchBackfill = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
    if (!req.auth || !isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    const data = req.data || {};
    const collection = String(data.collection || 'products');
    if (COLLECTIONS.indexOf(collection) === -1) throw new HttpsError('invalid-argument', 'collection: products | services');
    const startAfter = data.startAfter ? String(data.startAfter) : null;
    if (startAfter && startAfter.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'startAfter si sahihi.');
    const pageSize = Math.min(Math.max(parseInt(data.pageSize, 10) || 300, 1), 500);
    const r = await backfillPage(collection, startAfter, pageSize);
    await admin.firestore().collection('admin_audit_log').add({
        action: 'SEARCH_BACKFILL', actorUid: req.auth.uid, actorEmail: (req.auth.token && req.auth.token.email) || null,
        actorRole: 'admin', target: { kind: 'collection', collection }, details: r, createdAt: new Date().toISOString()
    });
    return Object.assign({ ok: true, collection }, r);
});

exports._testing = { indexDoc, backfillPage };

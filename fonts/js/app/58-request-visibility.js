/* ============================================================================
   SOKOHAI — REQUEST VISIBILITY & STATE AUDIT  (§17–§24)
   ----------------------------------------------------------------------------
   TATIZO: "baadhi ya maombi hayaonekani".

   AUDIT ILIYOFANYIKA (§18, §19):
     Queries za sasa zinatumia identity SAHIHI:
        where('userId','==',me) · where('sellerId','==',uid)
        where('buyerId','==',uid) · where('driverId','==',uid)
        where('customerId','==',me) · where('agentId','==',agentUid)  [agentMembers pekee]
     Hakuna query inayotumia `agentId` kama mmiliki wa Offline Member. ✓

   CHANZO HALISI cha "hayaonekani" ni MATATU:
     1. ERROR inaonekana kama EMPTY (§24). Mfano `41-request-inbox.js:93` —
        query ikishindwa (index/permission) UI inasema "hakuna maombi",
        hivyo mtumiaji anaamini hakuna, kumbe kuna lakini hayajapakia.
     2. Requests zinazotumia jina TOFAUTI la field kwa mhusika yuleyule
        (userId vs customerId vs requesterId) — moja ikitumika, nyingine
        zinapotea kwenye orodha.
     3. Hakuna njia ya kujua. Hakuna zana ya kuuliza "ombi langu liko wapi?"

   FAILI HII: haibadilishi queries zilizopo (§36 — usibadilishe bila sababu).
   Inaongeza:
     • skhQueryMulti()   — tafuta kwa majina yote ya field ya mhusika
     • skhStateHtml()    — EMPTY vs ERROR vs LOADING zikitofautishwa + Retry
     • skhWhereAreMyRequests() — uchunguzi wa kweli, si kubahatisha
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''; }
    function esc(s) { return skh.skhEscape ? skh.skhEscape(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function uid() { return (window.skhOwnerId ? window.skhOwnerId() : null) ||
                            (skh.currentUser && skh.currentUser.uid) || null; }

    /* ========================================================================
       1) MAJINA YA FIELD KWA KILA NAFASI (§19)
       ------------------------------------------------------------------------
       Ombi lilelile linaweza kuhifadhi mhusika kwa jina tofauti kutegemea
       njia lilipotokea. Hii ndiyo sababu baadhi hayaonekani.
       ======================================================================== */
    var ROLE_FIELDS = {
        requester:   ['userId', 'customerId', 'requesterId', 'buyerId', 'createdBy'],
        buyer:       ['buyerId', 'customerId', 'userId'],
        seller:      ['sellerId', 'ownerId', 'providerId'],
        transporter: ['driverId', 'transporterId', 'acceptedDriverId', 'assignedTransporterId'],
        provider:    ['providerId', 'sellerId', 'userId']
    };

    /**
     * skhQueryMulti(collection, role, opts)
     * Hutafuta kwa MAJINA YOTE ya field ya nafasi hiyo, kisha huunganisha
     * matokeo bila kurudia. Hii inazuia ombi kupotea kwa sababu ya jina.
     */
    window.skhQueryMulti = async function (collection, role, opts) {
        opts = opts || {};
        var me = opts.uid || uid();
        if (!me || !skh.db) return { ok: false, code: 'unauthenticated', items: [] };

        var fields = ROLE_FIELDS[role] || [role];
        var seen = {}, items = [], errors = [];

        for (var i = 0; i < fields.length; i++) {
            try {
                var q = skh.query(
                    skh.collection(skh.db, collection),
                    skh.where(fields[i], '==', me),
                    skh.limit(opts.limit || 50)
                );
                var snap = await skh.getDocs(q);
                if (snap && snap.forEach) {
                    snap.forEach(function (d) {
                        if (seen[d.id]) return;
                        seen[d.id] = 1;
                        items.push(Object.assign({ id: d.id, __matchedField: fields[i] }, d.data()));
                    });
                }
            } catch (e) {
                var x = window.skhErr ? window.skhErr(e, { fn: 'skhQueryMulti', collection: collection })
                                      : { code: 'internal' };
                errors.push({ field: fields[i], code: x.code });
                // failed-precondition = index inahitajika; endelea na field nyingine
            }
        }
        items.sort(function (a, b) {
            return String(b.createdAt || b.at || '').localeCompare(String(a.createdAt || a.at || ''));
        });
        return {
            ok: errors.length < fields.length,     // angalau moja imefanikiwa
            items: items,
            errors: errors,
            partial: errors.length > 0 && items.length > 0
        };
    };

    /* ========================================================================
       2) EMPTY ≠ ERROR ≠ LOADING (§24)
       ======================================================================== */
    window.skhStateHtml = function (state, opts) {
        opts = opts || {};
        if (state === 'loading') {
            return '<div class="rq-state">' +
                   '<div class="sh-sk sh-sk-line sh-sk-line--60" style="height:14px;margin:0 auto 10px"></div>' +
                   '<div class="sh-sk sh-sk-line sh-sk-line--40" style="height:12px;margin:0 auto"></div>' +
                   '</div>';
        }
        if (state === 'error') {
            return '<div class="rq-state rq-error">' +
                   '<div class="rq-ic rq-ic--err">' + ico('alert', 22) + '</div>' +
                   '<b>' + esc(opts.title || 'Imeshindikana kupakia maombi') + '</b>' +
                   '<p>' + esc(opts.message || 'Tatizo la muunganisho au ruhusa. Maombi yako hayajapotea.') + '</p>' +
                   (opts.onRetry
                     ? '<button type="button" class="sh-btn sh-btn--secondary sh-btn--sm" onclick="' +
                       opts.onRetry + '">' + ico('refresh', 14) + ' Jaribu tena</button>' : '') +
                   '</div>';
        }
        // empty
        return '<div class="rq-state">' +
               '<div class="rq-ic">' + ico(opts.icon || 'package', 22) + '</div>' +
               '<b>' + esc(opts.title || 'Bado hakuna maombi') + '</b>' +
               '<p>' + esc(opts.message || 'Maombi mapya yataonekana hapa.') + '</p>' +
               (opts.action || '') +
               '</div>';
    };

    /** Funika listener ili error isionekane kama empty */
    window.skhSafeSnapshot = function (q, onData, opts) {
        opts = opts || {};
        var target = opts.el || null;
        try {
            return skh.onSnapshot(q, function (snap) {
                var all = [];
                if (snap && snap.forEach) snap.forEach(function (d) {
                    all.push(Object.assign({ id: d.id }, d.data()));
                });
                onData(all, null);
            }, function (err) {
                var x = window.skhErr ? window.skhErr(err, { fn: opts.name || 'listener', operation: 'listen' })
                                      : { code: 'internal', userMessage: 'Imeshindikana kupakia.' };
                if (target) {
                    target.innerHTML = window.skhStateHtml('error', {
                        message: x.userMessage,
                        onRetry: opts.retry || ''
                    });
                }
                onData(null, x);
            });
        } catch (e) {
            if (target) target.innerHTML = window.skhStateHtml('error', {});
            return function () {};
        }
    };

    /* ========================================================================
       3) "OMBI LANGU LIKO WAPI?" (§17) — uchunguzi wa kweli
       ======================================================================== */
    var REQ_COLLECTIONS = [
        'ride_requests', 'requests', 'orders', 'seller_order_inbox',
        'negotiations', 'offers', 'delivery_offers', 'shipments', 'agentMembers'
    ];

    window.skhWhereAreMyRequests = async function () {
        var me = uid();
        if (!me) { console.warn('Hujaingia.'); return null; }
        console.info('Ninatafuta maombi ya:', me);
        var report = [];

        for (var i = 0; i < REQ_COLLECTIONS.length; i++) {
            var col = REQ_COLLECTIONS[i];
            var roles = ['requester', 'seller', 'transporter'];
            var total = 0, fields = {}, errs = [];
            for (var r = 0; r < roles.length; r++) {
                var res = await window.skhQueryMulti(col, roles[r], { limit: 30 });
                res.items.forEach(function (it) {
                    fields[it.__matchedField] = (fields[it.__matchedField] || 0) + 1;
                });
                total += res.items.length;
                res.errors.forEach(function (e) { errs.push(e.field + ':' + e.code); });
            }
            if (total || errs.length) {
                report.push({
                    collection: col, zilizopatikana: total,
                    kwa_field: Object.keys(fields).map(function (k) { return k + '=' + fields[k]; }).join(', ') || '—',
                    matatizo: errs.length ? [...new Set(errs)].join(', ') : '—'
                });
            }
        }
        console.table(report);
        if (!report.length) console.info('Hakuna ombi lolote lililopatikana kwa akaunti hii.');
        var idxErr = report.filter(function (r) { return /failed-precondition/.test(r.matatizo); });
        if (idxErr.length) {
            console.warn('INDEX INAHITAJIKA kwenye:', idxErr.map(function (r) { return r.collection; }).join(', '),
                         '— Firebase itatoa kiungo cha kuunda kwenye kosa la console.');
        }
        return report;
    };

    /* ========================================================================
       4) VIEWS ZA HALI (§21) — status isifiche ombi
       ======================================================================== */
    window.skhGroupByStatus = function (items) {
        var g = { pending: [], accepted: [], in_progress: [], completed: [],
                  rejected: [], cancelled: [], archived: [], other: [] };
        (items || []).forEach(function (it) {
            var s = String(it.status || it.orderStatus || '').toLowerCase();
            if (it.archived === true) { g.archived.push(it); return; }
            if (/pending|searching|new|requested/.test(s)) g.pending.push(it);
            else if (/accepted|confirmed|agreed/.test(s)) g.accepted.push(it);
            else if (/progress|transit|picked|preparing|shipped/.test(s)) g.in_progress.push(it);
            else if (/completed|delivered|closed|done/.test(s)) g.completed.push(it);
            else if (/reject/.test(s)) g.rejected.push(it);
            else if (/cancel/.test(s)) g.cancelled.push(it);
            else g.other.push(it);
        });
        return g;
    };

    console.info('[SokoHai] Request audit tayari. Endesha skhWhereAreMyRequests() kuona maombi yako.');
})();

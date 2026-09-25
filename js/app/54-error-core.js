/* ============================================================================
   SOKOHAI â€” CENTRALIZED ERROR SYSTEM + BACKEND RESILIENCE  (Â§13, Â§20, Â§21)
   ----------------------------------------------------------------------------
   UCHUNGUZI ULIOFANYIKA (Â§1) â€” matokeo halisi, si dhana:

     LOCAL DEVELOPMENT:
       Functions -> http://127.0.0.1:5056/__fn/*
       Firestore -> http://127.0.0.1:8085

     PRODUCTION:
       Functions -> https://europe-west1-sokonet-3b847.cloudfunctions.net/*
       Firestore -> https://firestore.googleapis.com/v1/...

   HITIMISHO:
   `skhDiagnose()` lazima itumie backend inayolingana na mazingira ya app.
   Ikiwa app iko localhost, diagnosis haitakiwi kwenda production kwa bahati
   mbaya. Ikiwa app iko production, production endpoints zitatumika.

   KILE FAILI HII INAFANYA (bila fake success â€” Â§2):
     1. Ramani ya makosa: code -> ujumbe wa mtumiaji + tabia ya retry
     2. Structured logging kwa developer (function/uid/entity/op/code)
     3. `skhGuard()` â€” huzuia mibofyo miwili (Â§14) na huonyesha hali ya kupakia
     4. `skhCallOrFirestore()` â€” callable ikishindwa KWA SABABU YA MIUNDOMBINU
        (404/unavailable), tunatumia njia ya Firestore yenye RULES ZILEZILE.
        Hii SI bypass: Security Rules ndizo bado zinaamua. Ikiwa operesheni
        inahitaji mamlaka ya server (escrow, token PK), HAIRUHUSIWI â€” tunakataa
        kwa uwazi badala ya kudanganya.
   ============================================================================ */

import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    /* ========================================================================
       1) RAMANI YA MAKOSA (Â§21)
       ======================================================================== */
    var MAP = {
        'permission-denied':   { user: 'Huna ruhusa ya kufanya kitendo hiki.', retry: false, log: 'warn' },
        'unauthenticated':     { user: 'Tafadhali ingia kwenye akaunti yako kwanza.', retry: false, log: 'warn' },
        'not-found':           { user: 'Taarifa hii haipatikani â€” huenda imeondolewa.', retry: false, log: 'warn' },
        'already-exists':      { user: 'Tayari ipo. Huhitaji kurudia.', retry: false, log: 'info' },
        'invalid-argument':    { user: 'Baadhi ya taarifa hazijakamilika. Angalia kisha jaribu tena.', retry: false, log: 'warn' },
        'failed-precondition': { user: 'Hali ya sasa hairuhusu kitendo hiki.', retry: false, log: 'warn' },
        'deadline-exceeded':   { user: 'Mtandao umechelewa kujibu. Jaribu tena.', retry: true,  log: 'warn' },
        'unavailable':         { user: 'Huduma ya server haipatikani kwa sasa. Jaribu tena baadaye.', retry: true,  log: 'error' },
        'internal':            { user: 'Imeshindikana kwa sasa. Jaribu tena baadaye.', retry: true,  log: 'error' },
        'resource-exhausted':  { user: 'Umefanya majaribio mengi. Subiri kidogo kisha jaribu tena.', retry: true,  log: 'warn' },
        'cancelled':           { user: 'Kitendo kimeghairiwa.', retry: false, log: 'info' },
        'network':             { user: 'Hakuna mtandao. Angalia muunganisho wako.', retry: true,  log: 'warn' }
    };

    function codeOf(e) {
        if (!e) return 'internal';

        var c = String(e.code || e.name || '').toLowerCase();

        c = c.replace(/^functions\//, '')
             .replace(/^firestore\//, '')
             .replace(/^auth\//, '');

        if (MAP[c]) return c;

        var t = String(e.message || e).toLowerCase();

        if (/failed to fetch|networkerror|err_failed|net::/.test(t)) {
            return 'network';
        }

        if (/cors|access-control-allow-origin|preflight/.test(t)) {
            return 'unavailable';
        }

        if (/permission|insufficient/.test(t)) {
            return 'permission-denied';
        }

        if (/requires an index|failed-precondition/.test(t)) {
            return 'failed-precondition';
        }

        if (/not.?found|404/.test(t)) {
            return 'not-found';
        }

        if (/unauthenticated|not signed/.test(t)) {
            return 'unauthenticated';
        }

        return 'internal';
    }

    /** skhErr(e, ctx) -> { code, userMessage, retry, isInfra } */
    window.skhErr = function (e, ctx) {
        ctx = ctx || {};

        var code = codeOf(e);
        var m = MAP[code] || MAP.internal;

        // Structured log kwa developer (Â§13, Â§23) â€” bila siri
        var entry = {
            fn: ctx.fn || '(haijulikani)',
            userId: (skh.currentUser && skh.currentUser.uid) || null,
            entityId: ctx.entityId || ctx.requestId || null,
            collection: ctx.collection || null,
            operation: ctx.operation || null,
            errorCode: code,
            raw: (e && (e.code || e.message)) || String(e),
            at: new Date().toISOString()
        };

        (m.log === 'error'
            ? console.error
            : m.log === 'warn'
                ? console.warn
                : console.info
        )('[SokoHai:' + entry.fn + ']', entry);

        return {
            code: code,
            userMessage: ctx.userMessage || m.user,
            retry: m.retry,
            isInfra:
                code === 'unavailable' ||
                code === 'not-found' ||
                code === 'network' ||
                code === 'internal',
            log: entry
        };
    };

    /** Onyesha kosa kwa mtumiaji kwa lugha rafiki (Â§13) */
    window.skhShowErr = function (e, ctx) {
        var x = window.skhErr(e, ctx);

        if (typeof skhToast === 'function') {
            skhToast(
                x.userMessage,
                x.retry ? 'info' : 'error',
                4000
            );
        }

        return x;
    };

    /* ========================================================================
       2) GUARD â€” huzuia mibofyo miwili + hali ya kupakia (Â§14, Â§15)
       ======================================================================== */
    var running = {};

    /**
     * skhGuard(key, btnOrSelector, asyncFn)
     * Kitufe kinazimwa wakati operesheni inaendelea; mbofyo wa pili unapuuzwa.
     */
    window.skhGuard = async function (key, btn, fn) {
        if (running[key]) {
            console.info(
                '[guard] ' + key +
                ' bado inaendelea â€” mbofyo umepuuzwa'
            );

            return {
                ok: false,
                busy: true
            };
        }

        running[key] = true;

        var el = (typeof btn === 'string')
            ? document.querySelector(btn)
            : btn;

        var prevHtml = null;
        var prevDis = false;

        if (el) {
            prevHtml = el.innerHTML;
            prevDis = el.disabled;

            el.disabled = true;
            el.classList.add('is-loading');

            el.innerHTML =
                '<span class="skh-spin" aria-hidden="true"></span> Inashughulikiaâ€¦';
        }

        try {
            return await fn();
        } finally {
            running[key] = false;

            if (el) {
                el.disabled = prevDis;
                el.classList.remove('is-loading');

                if (prevHtml !== null) {
                    el.innerHTML = prevHtml;
                }
            }
        }
    };

    /* ========================================================================
       3) CALLABLE -> FIRESTORE FALLBACK (Â§17, Â§19)
       ----------------------------------------------------------------------
       MUHIMU: hii SI fake success na SI bypass ya usalama.
         - Inatumika TU pale callable imeshindwa kwa sababu ya MIUNDOMBINU
           (404/unavailable/network) â€” si permission-denied.
         - Njia mbadala huandika Firestore moja kwa moja, hivyo SECURITY RULES
           ndizo bado zinaamua kama inaruhusiwa.
         - Operesheni zinazohitaji mamlaka ya server (escrow release, token PK,
           commission) HAZINA fallback â€” zinakataliwa waziwazi.
       ======================================================================== */
    window.skhCallOrFirestore = async function (opts) {
        opts = opts || {};

        var name = opts.name;

        var ctx = {
            fn: name,
            entityId: opts.entityId,
            collection: opts.collection,
            operation: opts.operation
        };

        // 1) Jaribu server kwanza â€” daima
        if (typeof opts.callable === 'function') {
            try {
                var res = await opts.callable();

                if (
                    res &&
                    res.data &&
                    res.data.ok !== false
                ) {
                    return {
                        ok: true,
                        via: 'server',
                        data: res.data
                    };
                }

                if (
                    res &&
                    res.data &&
                    res.data.error
                ) {
                    throw Object.assign(
                        new Error(res.data.error),
                        {
                            code: res.data.code || 'internal'
                        }
                    );
                }

            } catch (e) {
                var x = window.skhErr(e, ctx);

                // Kosa la MAMLAKA -> simama hapa. Usijaribu kukwepa.
                if (!x.isInfra) {
                    if (typeof skhToast === 'function') {
                        skhToast(
                            x.userMessage,
                            'error',
                            4000
                        );
                    }

                    return {
                        ok: false,
                        code: x.code,
                        error: x.userMessage
                    };
                }

                // Kosa la MIUNDOMBINU -> endelea na njia ya Firestore
                // ikiwa inaruhusiwa
                console.warn(
                    '[' + name + '] server haipatikani (' +
                    x.code +
                    ') â€” najaribu njia ya Firestore'
                );
            }
        }

        // 2) Hakuna fallback iliyoruhusiwa -> sema ukweli (Â§2)
        if (typeof opts.firestore !== 'function') {
            var msg = opts.serverOnlyMessage ||
                'Kitendo hiki kinahitaji server ya SokoHai ambayo haijawashwa kwa sasa.';

            if (typeof skhToast === 'function') {
                skhToast(
                    msg,
                    'error',
                    5000
                );
            }

            return {
                ok: false,
                code: 'unavailable',
                error: msg,
                needsServer: true
            };
        }

        // 3) Njia ya Firestore â€” Security Rules ndizo mlinzi
        try {
            var out = await opts.firestore();

            return {
                ok: true,
                via: 'firestore',
                data: out
            };

        } catch (e2) {
            var x2 = window.skhErr(e2, ctx);

            if (typeof skhToast === 'function') {
                skhToast(
                    x2.userMessage,
                    'error',
                    4000
                );
            }

            return {
                ok: false,
                code: x2.code,
                error: x2.userMessage
            };
        }
    };

    /* ========================================================================
       4) ULINZI WA LISTENERS (Â§16) â€” snapshot error isivunje UI
       ======================================================================== */
    if (
        typeof skh.onSnapshot === 'function' &&
        !skh.__snapGuarded
    ) {
        var origSnap = skh.onSnapshot;

        skh.onSnapshot = function (
            ref,
            next,
            error,
            complete
        ) {
            var safeErr = function (e) {
                var x = window.skhErr(
                    e,
                    {
                        fn: 'onSnapshot',
                        operation: 'listen'
                    }
                );

                if (x.code === 'failed-precondition') {
                    console.error(
                        '[INDEX INAHITAJIKA] Firebase itatoa kiungo cha kuunda index kwenye kosa hapo juu. ' +
                        'Tumia kiungo hicho â€” usibadilishe query kwa kubahatisha.'
                    );
                }

                if (typeof error === 'function') {
                    try {
                        error(e);
                    } catch (e3) {}
                }
            };

            try {
                if (
                    typeof next === 'object' &&
                    next !== null
                ) {
                    var obs = Object.assign({}, next);
                    var userErr = obs.error;

                    obs.error = function (e) {
                        safeErr(e);

                        if (typeof userErr === 'function') {
                            userErr(e);
                        }
                    };

                    return origSnap.call(
                        this,
                        ref,
                        obs
                    );
                }

                return origSnap.call(
                    this,
                    ref,
                    next,
                    safeErr,
                    complete
                );

            } catch (e) {
                safeErr(e);

                return function () {};
            }
        };

        skh.__snapGuarded = true;
    }

    /* ========================================================================
       5) MAKOSA YASIYOSHIKWA â€” yasionekane kama "Internal Error" tupu
       ======================================================================== */
    window.addEventListener(
        'unhandledrejection',
        function (ev) {
            var e = ev && ev.reason;

            if (!e) return;

            var x = window.skhErr(
                e,
                {
                    fn: 'unhandledrejection'
                }
            );

            if (x.isInfra) {
                ev.preventDefault();
            }
        }
    );

    /* ========================================================================
       6) UCHUNGUZI WA HALI YA BACKEND â€” kwa developer/admin
       ------------------------------------------------------------------------
       LOCAL:
         Functions -> http://127.0.0.1:5056/__fn/
         Firestore -> http://127.0.0.1:8085/

       PRODUCTION:
         Functions -> https://<region>-<project>.cloudfunctions.net/
         Firestore -> https://firestore.googleapis.com/v1/...
       ======================================================================== */
    window.skhDiagnose = async function () {
        var region = skh._functionsRegion || 'europe-west1';

        var project =
            (skh.fApp &&
             skh.fApp.options &&
             skh.fApp.options.projectId) ||
            'sokonet-3b847';

        /*
         * Tambua mazingira ya app.
         * Local server yetu hutumika kupitia localhost/127.0.0.1.
         */
        var isLocal =
            location.hostname === 'localhost' ||
            location.hostname === '127.0.0.1';

        /*
         * Local Functions server.
         */
        var localFnBase =
            'http://127.0.0.1:5056/__fn/';

        /*
         * Production Functions server.
         */
        var productionFnBase =
            'https://' +
            region +
            '-' +
            project +
            '.cloudfunctions.net/';

        /*
         * Chagua endpoint kulingana na mazingira.
         */
        var base = isLocal
            ? localFnBase
            : productionFnBase;

        var fns = [
            'deliveryAccept',
            'commentsPublish',
            'negotiationSendOffer',
            'deliveryGenerateToken'
        ];

        var out = [];

        for (var i = 0; i < fns.length; i++) {
            var status = '?';

            try {
                var r = await fetch(
                    base + fns[i],
                    {
                        method: 'POST',
                        mode: 'cors',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            data: {}
                        })
                    }
                );

                status = r.status;

            } catch (e) {
                status = 'CORS/404 (haipo)';
            }

            out.push({
                fn: fns[i],
                status: status
            });
        }

        var fire = '?';

        try {
            /*
             * Firestore REST diagnosis:
             *
             * Local  -> Firestore emulator
             * Prod   -> Google Firestore REST
             */
            var firestoreUrl = isLocal
                ? 'http://127.0.0.1:8085/v1/projects/' +
                  project +
                  '/databases/(default)/documents/products?pageSize=1'
                : 'https://firestore.googleapis.com/v1/projects/' +
                  project +
                  '/databases/(default)/documents/products?pageSize=1';

            var fr = await fetch(firestoreUrl);

            fire = fr.status;

        } catch (e) {
            fire = 'imeshindikana';
        }

        console.table(out);

        console.info(
            'SokoHai Backend:',
            isLocal ? 'LOCAL EMULATOR' : 'PRODUCTION'
        );

        console.info(
            'Functions Base:',
            base
        );

        console.info(
            'Firestore REST:',
            fire,
            '| region:',
            region,
            '| project:',
            project
        );

        return {
            functions: out,
            firestore: fire,
            region: region,
            project: project,
            local: isLocal,
            functionsBase: base
        };
    };

    console.info(
        '[SokoHai] Error core imepakia. Endesha skhDiagnose() kuona hali ya backend.'
    );

})();
/* ================================================================
 * 65-content-l10n.js — [CONTENT L10N §11-§16, §37-§39]
 *
 * CONTENT YA MTUMIAJI (jina/maelezo ya bidhaa-huduma-usafiri) haifanani
 * na interface: hii ni data ya wauzaji. Sheria:
 *   1. Original YA MWUZAJI ndiyo ukweli — haitafutwi kupitia overwrite.
 *   2. Tafsiri zinahifadhiwa KWENYE doc (merge): `i18n.<field>.<lang>` =
 *      { text, sourceHash, status, review, provider, translatedAt }.
 *   3. Resolver ni SYNCHRONOUS na fallback → original DAIMA (hakuna
 *      undefined/null kwenye UI, §14).
 *   4. Tafsiri ni ASYNC (§13): kadi haijaanguka; job inapokamilika,
 *      UI hurerender kwa digested event ya 'skh:contentTranslated'.
 *   5. HAKUNA API keys frontend (§33) — tafsiri inatekelezwa tu kupitia
 *      callable Cloud Function 'translateContent'. Ikikosekana,
 *      original huonyeshwa bila kuvuruga nchi.
 *   6. sourceHash inabadilika content ikibadilishwa → stale tafsiri
 *      huchanganuliwa na kuombwa upya TU (§15), si kila render (§38).
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhContentL10n) return;
    window.__skhContentL10n = true;

    /* --- sourceHash rahisi (FNV-1a 32bit) — kwa caching tu, si siri --- */
    function sourceHashOf(text) {
        var h = 0x811c9dc5;
        var str = String(text || '');
        for (var i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return 'h' + h.toString(36);
    }
    window.skhContentHash = sourceHashOf;

    function curLang() {
        try { return (window.SokoHaiLMS && window.SokoHaiLMS.lang) || 'sw'; } catch (e) { return 'sw'; }
    }

    /* --- Synopsis ya i18n record kwa field (usimamizi §14-§16) --- */
    function i18nRec(obj, field, lang) {
        try {
            var node = obj && obj.i18n && obj.i18n[field];
            if (!node || typeof node !== 'object') return null;
            var rec = node[lang];
            if (!rec || typeof rec !== 'object' || !rec.text) return null;
            // Human-reviewed/professional tafsiri zina power zaidi (§16)
            var st = rec.status || 'COMPLETED';
            if (st !== 'COMPLETED' && st !== 'PARTIAL') return null;
            // SourceHash tofauti → tafsiri ni stale (§15): acha (job itakokokotoa)
            var orig = String((obj && obj[field]) || '');
            if (rec.sourceHash && orig && rec.sourceHash !== sourceHashOf(orig)) return { stale: true };
            return rec;
        } catch (e) { return null; }
    }

    /**
     * skhLocField(obj, field) → tafsiri ya lang ya sasa KAMA IPO na hai stale,
     * vinginevyo ORIGINAL (fallback daima — §34). Haiwezi rudisha undefined.
     */
    window.skhLocField = function (obj, field) {
        try {
            if (!obj) return '';
            var lang = curLang();
            var orig = String(obj[field] != null ? obj[field] : '');
            var sl = obj.sourceLocale || 'sw';
            if (lang === sl) return orig;              // viewer katikia chanzo — si lazima tafsiri
            var rec = i18nRec(obj, field, lang);
            if (rec && rec.text) return String(rec.text);
            // stale au hakuna: job async inakokokota bila kuishikilia UI
            try { window.skhQueueContentTranslation(obj, field, orig, lang); } catch (eQ) {}
            return orig;
        } catch (e) { return String((obj && obj[field]) || ''); }
    };
    /* Shorthand kwa entity nzima (§22): { title, description, ... } localized */
    window.skhLocalizedEntity = function (obj, fields) {
        var out = Object.assign({}, obj || {});
        (fields || ['title', 'description']).forEach(function (f) {
            try { out[f] = window.skhLocField(obj, f); } catch (e) {}
        });
        return out;
    };

    /* ----------------------------------------------------------------
     * ASYNC translation job queue (§13/§38) — debounce + dedupe kwa key.
     * Haitekelezi chochote bila callable backend (§33/§10).
     * ---------------------------------------------------------------- */
    var JOBS = {};   // localStorage cache ya hashes zilizohitishwa ili kuzuia spam (§38)
    try { JOBS = JSON.parse(localStorage.getItem('skh_content_l10n_jobs') || '{}') || {}; } catch (eJ) {}
    var queue = [];
    var timer = null;

    window.skhQueueContentTranslation = function (obj, field, text, lang) {
        try {
            if (!text || text.length < 2 || text.length > 2000) return;
            var hash = sourceHashOf(text);
            var key = [obj.__col || obj.collectionName || obj.__collection || '', obj.id || obj.docId || '', field, lang, hash].join('|');
            if (JOBS[key]) return;      // tayari imesubiriwa/imefeli (§38: kurudia haramu)
            JOBS[key] = Date.now();
            try { localStorage.setItem('skh_content_l10n_jobs', JSON.stringify(JOBS)); } catch (eS) {}
            queue.push({ key: key, obj: obj, field: field, text: text, lang: lang, hash: hash });
            if (timer) return;
            timer = setTimeout(flush, 400);
        } catch (e) {}
    };

    async function flush() {
        var batch;
        try { batch = queue.splice(0, 10); } catch (e0) { batch = []; }
        timer = null;
        if (!batch.length) return;
        var fn;
        try { fn = skh.httpsCallable ? skh.httpsCallable(skh.functions, 'translateContent') : null; } catch (eF) { fn = null; }
        if (!fn) return; // hakuna backend inayopatikana — original inaonyeshwa (fallback)
        var anyOk = false;
        for (var i = 0; i < batch.length; i++) {
            var job = batch[i];
            try {
                var res = await fn({ text: job.text, from: 'sw', to: job.lang, field: job.field, sourceHash: job.hash });
                var out = (res && res.data && res.data.text) ? String(res.data.text) : '';
                if (!out) continue;
                // Weka tafsiri KWENYE doc iko halisi (merge salama, §37) — original haiguswi.
                var col = job.obj.__col || job.obj.collectionName || job.obj.__collection;
                var id = job.obj.id || job.obj.docId;
                if (col && id && skh.db) {
                    var patch = {};
                    patch['i18n.' + job.field + '.' + job.lang] = {
                        text: out, sourceHash: job.hash, status: 'COMPLETED',
                        review: 'machine', provider: 'translateContent', translatedAt: new Date().toISOString()
                    };
                    if (!job.obj.sourceLocale) patch.sourceLocale = 'sw';
                    await skh.updateDoc(skh.doc(skh.db, col, id), patch);
                    anyOk = true;
                }
            } catch (eJob) {
                // §34 fallback: onyesho la original hubaki — kosa linabaki console tu.
                try { console.warn('[content-l10n] job failed:', job.field, (eJob && eJob.code) || eJob); } catch (e0) {}
            }
        }
        if (anyOk) {
            // Hirerender feed iliyopo — mabadiliko yanaingia mara moja (§35)
            try {
                var ev = new CustomEvent('skh:contentTranslated', { detail: {} });
                window.dispatchEvent(ev);
                if (typeof skh.loadMainFeed === 'function') skh.loadMainFeed(skh.activeFeedCollection || 'products');
            } catch (eR) {}
        }
    }

    /* Debug/visibility: skhContentL10nStatus(obj, field) → {shown, status} */
    window.skhContentL10nStatus = function (obj, field) {
        var rec = i18nRec(obj, field, curLang());
        return { stale: !!(rec && rec.stale), status: rec ? 'COMPLETED' : 'FALLBACK_ORIGINAL' };
    };
})();

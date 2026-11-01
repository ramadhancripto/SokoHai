/* SOKOHAI — PUBLISH OUTBOX (bidhaa, huduma, usafiri)
   ============================================================================
   Kwa nini ipo:
   Mtumiaji aliripoti "kuchapisha bidhaa pia inagoma". Uchunguzi ulionyesha njia
   ya kawaida inafanya kazi, lakini kila kosa (mtandao, ruhusa, stock) liliacha
   mtumiaji na ujumbe mbaya au tangazo lililopotea. Moduli hii inahakikisha:
     1) Mtandao ukianguka, kazi ya mtumiaji HAIpotee — inahifadhiwa kwenye kifaa
        na kusambazwa server mtandao ukirudi.
     2) Msambazaji ni wa pekee (`clientId` = kitambulisho cha hati) — hivyo
        kusambaza mara mbili HAKUNAYI nakala mbili za bidhaa.
     3) Ujumbe kwa mtumiaji unasema ukweli: kimehifadhiwa kifaa, au kimeshindwa
        kwa ruhusa, n.k. — si "kosa la jumla".
   Hii SI mfumo wa pili wa data: bado ni `products` / `services` / `drivers`
   kupitia `skh.saveData`, na stock bado inapita `inventoryAdjust` (audited).
   ========================================================================= */
(function () {
    'use strict';

    var KEY = 'skh_publish_outbox_v1';
    var MAX = 25;
    var LABEL = { products: 'Bidhaa', services: 'Huduma', drivers: 'Usafiri' };
    var flushing = false;

    function read() {
        try {
            var raw = window.localStorage.getItem(KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    }

    function write(list) {
        try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); }
        catch (e) { console.warn('[publish-outbox] kumbukumbu imejaa:', e && e.message); }
        paint();
    }

    function newClientId() {
        return 'ob' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function enqueue(col, payload, opts) {
        opts = opts || {};
        var clientId = opts.clientId || newClientId();
        var item = {
            clientId: clientId,
            collection: col,
            label: String(payload.title || payload.headline || LABEL[col] || col).slice(0, 120),
            image: String(payload.image || (payload.imagesArray && payload.imagesArray[0]) || ''),
            price: Number(payload.price) || 0,
            /* opening stock inafuatwa tofauti: bidhaa inaandikwa kwa stock 0 halali,
               kisha `inventoryAdjust` (OPENING_BALANCE) inakamilisha — kama kawaida. */
            openingStock: opts.openingStock === undefined ? null : Math.max(0, Number(opts.openingStock) || 0),
            businessId: opts.businessId || null,
            storeId: opts.storeId || null,
            payload: payload,
            createdAtMs: Date.now(),
            createdAt: new Date().toISOString(),
            attempts: 0,
            status: 'pending',           // pending | blocked | synced
            lastError: '',
            ready: opts.openingStock !== undefined ? true : null
        };
        var list = read();
        list.unshift(item);
        write(list);
        localIdMap[localIdFor(clientId)] = clientId;
        announce(item);
        return localIdFor(clientId);
    }

    /* ---- vitambulisho vya ndani: 'local-<clientId>' ---- */
    var localIdMap = {};
    function localIdFor(clientId) { return 'local-' + clientId; }
    function isLocalId(id) { return typeof id === 'string' && id.indexOf('local-ob') === 0; }
    function clientIdOf(id) { return isLocalId(id) ? id.slice(6) : null; }

    function attach(localId, info) {
        info = info || {};
        var clientId = clientIdOf(localId);
        if (!clientId) return false;
        var list = read(), hit = false;
        list = list.map(function (i) {
            if (i.clientId !== clientId) return i;
            hit = true;
            return Object.assign({}, i, {
                openingStock: Math.max(0, Number(info.openingStock) || 0),
                businessId: info.businessId || i.businessId,
                storeId: info.storeId || i.storeId,
                ready: true
            });
        });
        if (hit) write(list);
        return hit;
    }

    function remove(clientId) {
        write(read().filter(function (i) { return i.clientId !== clientId; }));
    }

    function list() { return read(); }
    function count() { return read().length; }

    function announce(item) {
        try {
            if (typeof window.sokohaiToast === 'function') {
                window.sokohaiToast(LABEL[item.collection] + ' imehifadhiwa kwenye kifaa — itachapishwa mtandao ukirudi.', 'warn', 5200);
                return;
            }
        } catch (e) { /* toast si lazima — fomu yenyewe inatoa ujumbe kamili */ }
    }

    function isPermanent(msg) {
        return /permission-denied|invalid-argument|failed-precondition|insufficient permissions|Hauna ruhusa/i.test(String(msg || ''));
    }

    async function flush(opts) {
        opts = opts || {};
        if (flushing) return { skipped: true };
        var list = read();
        if (!list.length) { paint(); return { done: 0, failed: 0 }; }
        if (!window.skh || !window.skh.currentUser) { return { needsAuth: true }; }
        flushing = true; paint();
        var done = 0, failed = 0, lastError = '';
        /* ya zamani kwanza: mtumiaji aliyesubiri kwa muda mrefu achapishwe kwanza */
        for (var i = list.length - 1; i >= 0; i--) {
            var item = list[i];
            if (item.status === 'blocked' && !opts.forceBlocked) continue;
            /* bidhaa inasubiri opening stock iambatanishwe kabla ya kusambazwa */
            if (item.ready === null && Date.now() - item.createdAtMs < 4000) continue;
            var localId = localIdFor(item.clientId);
            try {
                var savedId = await window.skh.saveData(item.collection, item.payload, {
                    clientId: item.clientId, skipQueue: true
                });
                if (!savedId) throw new Error('Haikuhifadhiwa.');
                if (item.collection === 'products' && item.openingStock > 0) {
                    await window.skh.wrapCallable('inventoryAdjust')({
                        productId: savedId,
                        delta: item.openingStock,
                        movementType: 'OPENING_BALANCE',
                        source: 'PRODUCT_CREATION',
                        reason: 'Initial stock at product creation',
                        businessId: item.businessId || undefined,
                        storeId: item.storeId || undefined,
                        idempotencyKey: 'opening-' + savedId
                    });
                }
                remove(item.clientId);
                delete localIdMap[localId];
                done++;
            } catch (e) {
                lastError = String((e && e.message) || e);
                failed++;
                var patch = {
                    attempts: Number(item.attempts || 0) + 1,
                    lastError: lastError.slice(0, 240),
                    ready: true
                };
                patch.status = isPermanent(lastError) ? 'blocked' : 'pending';
                write(read().map(function (x) {
                    return x.clientId === item.clientId ? Object.assign({}, x, patch) : x;
                }));
            }
        }
        flushing = false;
        paint();
        if (done) {
            try { if (typeof window.loadAndRenderDashboard === 'function') window.loadAndRenderDashboard(); } catch (e) {}
            try { if (typeof window.sokohaiToast === 'function') window.sokohaiToast(done + ' ' + (done === 1 ? 'imechapishwa' : 'zimechapishwa') + ' sasa.', 'success', 4200); } catch (e) {}
        }
        if (opts.manual) {
            if (failed && lastError) {
                try { window.alert('Bado haiwezi kuchapishwa: ' + lastError + '\n\nUmepoteza hakuna kitu — kipo kwenye kifaa.'); } catch (e) {}
            } else if (!done) {
                try { window.alert('Hakuna kilichosubiri kuchapishwa.'); } catch (e) {}
            }
        }
        return { done: done, failed: failed };
    }

    /* ---------- UI: kipengele "Zinasubiri kuchapishwa" ---------- */
    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function blockHtml() {
        var items = read();
        if (!items.length) return '';
        var when = function (iso) {
            try { return new Date(iso).toLocaleDateString('sw-TZ', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
            catch (e) { return ''; }
        };
        return '<div id="skhPublishOutboxBlock" style="border:1px solid #F3D9A6;background:#FFFDF7;border-radius:14px;padding:14px 16px;margin:0 0 16px;">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">'
            + '<div style="font-weight:800;color:#7c4a03;font-size:15px;">Zinasubiri kuchapishwa <span style="background:#FDE68A;color:#7c4a03;border-radius:999px;padding:1px 8px;font-size:12px;">' + items.length + '</span></div>'
            + '<div style="display:flex;gap:8px;">'
            + '<button type="button" onclick="window.skhPublishOutbox.flush({manual:true})" style="padding:8px 12px;background:#0f6e55;color:#fff;border:none;border-radius:9px;font-weight:800;font-size:13px;cursor:pointer;">Tuma sasa</button>'
            + '</div></div>'
            + '<div style="color:#7c5a25;font-size:12.5px;margin:6px 0 10px;">Vitu hivi vimehifadhiwa kwenye kifaa chako; vitachapishwa soko linapopatikana mtandao.</div>'
            + items.map(function (i) {
                var blocked = i.status === 'blocked';
                return '<div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid ' + (blocked ? '#F3C7C2' : '#F3E3C3') + ';border-radius:10px;padding:9px 11px;margin-bottom:7px;">'
                    + (i.image ? '<img src="' + esc(i.image) + '" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:8px;flex:none;">' : '')
                    + '<div style="min-width:0;flex:1;">'
                    + '<div style="font-weight:700;color:#0f172a;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(i.label) + '</div>'
                    + '<div style="color:#64748b;font-size:12px;">' + esc(LABEL[i.collection] || i.collection) + ' · ' + esc(when(i.createdAt))
                    + (blocked ? ' · <span style="color:#b91c1c;font-weight:700;">inahitaji marekebisho</span>' : ' · inasubiri mtandao')
                    + (i.attempts ? ' · majaribio ' + i.attempts : '') + '</div></div>'
                    + (blocked
                        ? '<button type="button" onclick="window.skhPublishOutbox.flush({manual:true,forceBlocked:true})" style="padding:7px 10px;background:#eef2f7;color:#0f172a;border:none;border-radius:8px;font-weight:800;font-size:12.5px;cursor:pointer;">Jaribu tena</button>'
                        : '')
                    + '<button type="button" onclick="window.skhPublishOutbox.remove(\'' + esc(i.clientId) + '\')" style="padding:7px 10px;background:#fff;color:#b91c1c;border:1px solid #f3c7c2;border-radius:8px;font-weight:800;font-size:12.5px;cursor:pointer;">Ondoa</button>'
                    + '</div>';
            }).join('')
            + '</div>';
    }

    var lastHtml = '';
    function paint() {
        try {
            /* Mahali panapojulikana: juu ya orodha ya bidhaa za muuzaji. */
            var host = document.getElementById('mpTableWrap') || document.getElementById('productsList');
            if (!host) return;
            var html = blockHtml();
            if (html === lastHtml) return;
            lastHtml = html;
            var existing = document.getElementById('skhPublishOutboxBlock');
            if (existing) existing.remove();
            if (!html) return;
            host.insertAdjacentHTML('beforebegin', html);
        } catch (e) { /* UI haipaswi kuvunjika kwa sababu ya foleni */ }
    }

    function autoFlush() {
        if (!read().length) return;
        flush({}).catch(function () { /* kimya */ });
    }

    window.addEventListener('online', autoFlush);
    document.addEventListener('skh:auth-ready', function () { setTimeout(autoFlush, 1500); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') autoFlush(); });

    window.skhPublishOutbox = {
        enqueue: enqueue,
        attach: attach,
        flush: flush,
        remove: remove,
        list: list,
        count: count,
        refresh: paint,
        html: blockHtml,
        isLocalId: isLocalId,
        clientIdOf: clientIdOf,
        KEY: KEY
    };
    window.skhIsLocalId = isLocalId;
    window.skhRenderPublishOutbox = paint;

    /* Bidhaa zilizohifadhiwa kwa ndani zinaonekana mara orodha inapochorwa tena. */
    document.addEventListener('sokohai:dashboardRendered', paint);
})();

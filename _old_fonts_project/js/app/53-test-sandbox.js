/* ============================================================================
   SOKOHAI — TEST PAYMENT / SANDBOX MODE
   ----------------------------------------------------------------------------
   Lengo (§14): ku-test flow nzima — Order → Transport → SokoPay → Escrow →
   Release → Refund → Commission → Wallet → History — BILA pesa halisi.

   KANUNI KUU (§15): HII NI ADAPTER, SI PAYMENT SYSTEM YA PILI.
   Simulator inaita mantiki ILIYOPO:
       skh.updatePendingSokoPayAfterPayment()   (00-bootstrap.js:2471)
       sokopay_core_transactions                (escrow/paymentStatus)
       adminRevenue                             (commission)
       skhCustody*                              (transport/tokens)

   USALAMA (§9, §13): sandbox HAIWEZI kuwaka kwenye production kwa mtumiaji wa
   kawaida. Inahitaji MASHARTI YOTE MATATU:
       1) host ni localhost/staging  AU  SOKOHAI_CONFIG.ALLOW_SANDBOX === true
       2) mtumiaji ni admin (users/{uid}.role === 'admin')
       3) feature flag imewashwa kwa mkono (localStorage + system/config)
   Backend/Rules lazima pia zithibitishe `environment` (angalia firestore.rules).
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    var LS_ON   = 'skh_sandbox_on';
    var LS_WALL = 'skh_sandbox_wallet';
    var LS_SEQ  = 'skh_sandbox_seq';
    var START_BALANCE = 5000000;

    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''; }
    function esc(s) { return skh.skhEscape ? skh.skhEscape(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function money(v) { return 'TSh ' + Math.round(Number(v) || 0).toLocaleString('en-US'); }
    function nowIso() { return new Date().toISOString(); }
    function uid() { return (skh.currentUser && skh.currentUser.uid) || null; }

    /* ========================================================================
       1) MAZINGIRA (§1) — TEST vs PRODUCTION
       ======================================================================== */
    function isDevHost() {
        var h = String(location.hostname || '').toLowerCase();
        return h === 'localhost' || h === '127.0.0.1' || h === '::1' ||
               /^192\.168\./.test(h) || /^10\./.test(h) ||
               h.indexOf('staging') !== -1 || h.indexOf('test') !== -1 ||
               h.indexOf('.local') !== -1 || h.indexOf('e2b.app') !== -1;
    }
    function configAllows() {
        try { return !!(window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.ALLOW_SANDBOX === true); }
        catch (e) { return false; }
    }
    /** Je, sandbox INARUHUSIWA kabisa hapa? (§9) */
    function allowed() { return isDevHost() || configAllows(); }

    function isAdmin() {
        try {
            if (skh.currentUserRole === 'admin' || skh.userRole === 'admin') return true;
            var p = skh.currentUserProfile || skh.userProfile || {};
            return p.role === 'admin' || p.isAdmin === true;
        } catch (e) { return false; }
    }

    /** Je, sandbox IMEWASHWA sasa? Masharti yote matatu. */
    function on() {
        if (!allowed()) return false;
        if (!isAdmin()) return false;
        try { return localStorage.getItem(LS_ON) === '1'; } catch (e) { return false; }
    }

    window.skhSandbox = {
        allowed: allowed,
        isOn: on,
        env: function () { return on() ? 'test' : 'production'; }
    };
    /** Kila rekodi inayoundwa wakati wa test ipate alama hii (§1) */
    window.skhEnvStamp = function () {
        return on() ? { environment: 'test', isTest: true } : { environment: 'production' };
    };

    /* ========================================================================
       2) TEST WALLET (§7) — si pesa halisi, haiwezi withdrawal
       ======================================================================== */
    function wallet() {
        try {
            var w = JSON.parse(localStorage.getItem(LS_WALL) || 'null');
            if (w && typeof w.balance === 'number') return w;
        } catch (e) {}
        return { balance: START_BALANCE, held: 0, history: [] };
    }
    function saveWallet(w) { try { localStorage.setItem(LS_WALL, JSON.stringify(w)); } catch (e) {} }

    function walletMove(kind, amount, note) {
        var w = wallet();
        amount = Number(amount) || 0;
        if (kind === 'hold')     { w.balance -= amount; w.held += amount; }
        else if (kind === 'release') { w.held -= amount; }
        else if (kind === 'refund')  { w.held -= amount; w.balance += amount; }
        else if (kind === 'deposit') { w.balance += amount; }
        else if (kind === 'fee')     { w.balance -= amount; }
        w.history.unshift({ kind: kind, amount: amount, note: note || '', at: nowIso() });
        w.history = w.history.slice(0, 50);
        saveWallet(w);
        return w;
    }
    window.skhSandboxWallet = wallet;

    /* ========================================================================
       3) TEST PAYMENT ID (§6)
       ======================================================================== */
    function nextId() {
        var n = 1;
        try { n = (parseInt(localStorage.getItem(LS_SEQ), 10) || 0) + 1; localStorage.setItem(LS_SEQ, String(n)); } catch (e) {}
        return 'TEST-PAY-' + String(n).padStart(3, '0');
    }

    /* ========================================================================
       4) SIMULATE PAYMENT (§2, §3) — inatumia pipeline ILIYOPO
       ======================================================================== */
    var OUTCOMES = [
        ['successful', 'Imefanikiwa',  'Malipo yamekamilika, escrow imeshikilia fedha'],
        ['failed',     'Imeshindikana','Malipo hayajafanikiwa, oda inabaki haijalipwa'],
        ['pending',    'Inasubiri',    'Malipo yanasubiri uthibitisho'],
        ['cancelled',  'Imeghairiwa',  'Mtumiaji ameghairi malipo'],
        ['refunded',   'Imerejeshwa',  'Fedha zimerudishwa kwa mnunuzi'],
        ['disputed',   'Mgogoro',      'Mgogoro umefunguliwa kuhusu malipo hii']
    ];

    /**
     * skhSimulatePayment({ amount, orderId, coreId, type })
     * Hurudisha { ok, outcome, testPayId }
     */
    window.skhSimulatePayment = async function (opts) {
        opts = opts || {};
        if (!on()) { skhToast('Sandbox haijawashwa.', 'error'); return { ok: false }; }

        var amount = Number(opts.amount) || 0;
        var outcome = await pickOutcome(amount, opts);
        if (!outcome) return { ok: false, cancelled: true };

        var payId = nextId();
        skhBusy(true, 'Inasimulisha malipo…');
        try {
            var r = await applyOutcome(outcome, amount, payId, opts);
            skhBusy(false);
            skhToast('TEST: ' + labelOf(outcome) + ' · ' + payId, outcome === 'successful' ? 'success' : 'info', 3400);
            document.dispatchEvent(new CustomEvent('skh:sandbox-payment', {
                detail: { outcome: outcome, testPayId: payId, amount: amount, opts: opts }
            }));
            return Object.assign({ ok: true, outcome: outcome, testPayId: payId }, r || {});
        } catch (e) {
            skhBusy(false);
            console.warn('[sandbox]', e);
            skhToast('Simulation imeshindikana: ' + (e.message || ''), 'error', 3000);
            return { ok: false, error: e.message };
        }
    };

    function labelOf(k) {
        for (var i = 0; i < OUTCOMES.length; i++) if (OUTCOMES[i][0] === k) return OUTCOMES[i][1];
        return k;
    }

    function pickOutcome(amount, opts) {
        return new Promise(function (resolve) {
            var host = document.createElement('div');
            host.className = 'sbx-modal';
            host.innerHTML =
                '<div class="sbx-sheet">' +
                  '<div class="sbx-banner">' + ico('alert', 14) +
                    ' <b>TEST MODE</b> — muamala huu unatumia pesa za majaribio. Hakuna pesa halisi inayohamishwa.' +
                  '</div>' +
                  '<div class="sbx-head"><b>Simulate Payment</b>' +
                    '<button type="button" class="sbx-x" aria-label="Funga">' + ico('x', 18) + '</button></div>' +
                  (opts.orderId ? '<div class="sbx-ref">Oda: <b>' + esc(opts.orderId) + '</b></div>' : '') +
                  '<div class="sbx-amt">' + money(amount) + ' <span>TEST</span></div>' +
                  '<div class="sbx-opts">' + OUTCOMES.map(function (o) {
                      return '<button type="button" class="sbx-opt" data-k="' + o[0] + '">' +
                             '<b>' + esc(o[1]) + '</b><small>' + esc(o[2]) + '</small></button>';
                  }).join('') + '</div>' +
                '</div>';
            document.body.appendChild(host);
            function close(v) { host.remove(); resolve(v); }
            host.querySelector('.sbx-x').addEventListener('click', function () { close(null); });
            host.addEventListener('click', function (e) { if (e.target === host) close(null); });
            host.querySelectorAll('.sbx-opt').forEach(function (b) {
                b.addEventListener('click', function () { close(b.getAttribute('data-k')); });
            });
        });
    }

    /** Hapa ndipo tunaita MANTIKI ILIYOPO — hakuna payment logic mpya (§15) */
    async function applyOutcome(outcome, amount, payId, opts) {
        var stamp = { environment: 'test', isTest: true, testPayId: payId };
        var coreId = opts.coreId || null;

        if (outcome === 'successful') {
            walletMove('hold', amount, 'Escrow: ' + payId);
            // Pipeline halisi ya SokoPay (00-bootstrap.js)
            if (typeof skh.updatePendingSokoPayAfterPayment === 'function') {
                await skh.updatePendingSokoPayAfterPayment(payId, 'SANDBOX');
            }
            if (coreId) await patchCore(coreId, Object.assign({
                paymentStatus: 'Payment Protected', escrowStatus: 'Money Secured',
                orderStatus: 'Confirmed', paymentProvider: 'SANDBOX', paymentRef: payId
            }, stamp), 'Payment Verified (TEST)');
            return { escrow: 'funded' };
        }

        if (outcome === 'failed' || outcome === 'cancelled') {
            if (coreId) await patchCore(coreId, Object.assign({
                paymentStatus: outcome === 'failed' ? 'Failed' : 'Cancelled',
                orderStatus: outcome === 'failed' ? 'Payment Pending' : 'Cancelled'
            }, stamp), outcome === 'failed' ? 'Payment Failed (TEST)' : 'Payment Cancelled (TEST)');
            return {};
        }

        if (outcome === 'pending') {
            if (coreId) await patchCore(coreId, Object.assign({
                paymentStatus: 'Pending', orderStatus: 'Payment Pending'
            }, stamp), 'Payment Pending (TEST)');
            return {};
        }

        if (outcome === 'refunded') {
            walletMove('refund', amount, 'Refund: ' + payId);
            if (coreId) await patchCore(coreId, Object.assign({
                paymentStatus: 'Refunded', escrowStatus: 'Refunded', orderStatus: 'Cancelled'
            }, stamp), 'Refund Issued (TEST)');
            return { escrow: 'refunded' };
        }

        if (outcome === 'disputed') {
            if (coreId) await patchCore(coreId, Object.assign({
                orderStatus: 'Disputed', contractStatus: 'Dispute Active',
                dispute: { reason: 'TEST dispute', at: nowIso(), by: uid() }
            }, stamp), 'Dispute Opened (TEST)');
            return { escrow: 'held' };
        }
        return {};
    }

    async function patchCore(id, patch, timelineTitle) {
        if (!id || !skh.db) return;
        try {
            var body = Object.assign({ updatedAt: nowIso() }, patch);
            if (timelineTitle && skh.arrayUnion) {
                body.timeline = skh.arrayUnion({ title: timelineTitle, description: 'Sandbox simulation', at: nowIso(), done: true });
            }
            await skh.updateDoc(skh.doc(skh.db, 'sokopay_core_transactions', id), body);
        } catch (e) { console.warn('[sandbox patchCore]', e && e.message); }
    }

    /* ========================================================================
       5) ESCROW RELEASE + COMMISSION (§4)
       ======================================================================== */
    window.skhSandboxRelease = async function (coreId, amount, sellerId) {
        if (!on()) return { ok: false };
        amount = Number(amount) || 0;
        var fee = Math.round(amount * 0.05);            // kamisheni ya mfano
        walletMove('release', amount, 'Escrow released');
        await patchCore(coreId, {
            escrowStatus: 'Released', paymentStatus: 'Released',
            orderStatus: 'Completed', contractStatus: 'Completed',
            environment: 'test', isTest: true
        }, 'Escrow Released (TEST)');
        // Commission kwenye collection ILIYOPO
        try {
            await skh.addDoc(skh.collection(skh.db, 'adminRevenue'), {
                type: 'commission', amount: fee, sourceId: coreId || null,
                sellerId: sellerId || null, at: nowIso(),
                environment: 'test', isTest: true
            });
        } catch (e) {}
        skhToast('TEST: Escrow imeachiwa. Kamisheni ' + money(fee) + ' imerekodiwa.', 'success', 3200);
        return { ok: true, released: amount, commission: fee };
    };

    /* ========================================================================
       6) SCENARIOS (§11)
       ======================================================================== */
    var SCENARIOS = {
        A: { name: 'Oda iliyofanikiwa', steps: [
                'Tengeneza oda ya mfano', 'Simulate Payment: Successful', 'Escrow: Funded',
                'Usafirishaji', 'Pickup', 'Delivery', 'Mnunuzi athibitishe',
                'Escrow: Released', 'Kamisheni imerekodiwa'] },
        B: { name: 'Malipo yaliyoshindikana', steps: [
                'Tengeneza oda', 'Simulate Payment: Failed', 'Oda inabaki haijalipwa'] },
        C: { name: 'Refund', steps: [
                'Simulate Payment: Successful', 'Escrow: Funded',
                'Ghairi oda', 'Simulate Payment: Refunded', 'Fedha zimerudi'] },
        D: { name: 'Mgogoro', steps: [
                'Simulate Payment: Successful', 'Delivery', 'Simulate: Disputed',
                'Admin aamue', 'Release au Refund'] },
        E: { name: 'Usafirishaji', steps: [
                'Ombi la usafiri', 'Majadiliano', 'Makubaliano',
                'Simulate Payment: Successful', 'Pickup Token', 'Pickup', 'Transit', 'Delivery'] }
    };

    window.skhSandboxScenario = async function (key) {
        var sc = SCENARIOS[key]; if (!sc) return;
        var body = '<div class="sbx-steps">' + sc.steps.map(function (s, i) {
            return '<div class="sbx-step"><i>' + (i + 1) + '</i><span>' + esc(s) + '</span></div>';
        }).join('') + '</div>';
        await skhConfirm(body, { title: 'Scenario ' + key + ': ' + sc.name, okText: 'Nimeelewa', cancelText: null, html: true });
    };

    /* ========================================================================
       7) ADMIN TEST PANEL (§8)
       ======================================================================== */
    window.skhSandboxPanel = async function () {
        if (!allowed()) {
            await skhConfirm('Sandbox inapatikana kwenye mazingira ya majaribio pekee (localhost/staging).',
                { title: 'Haipatikani', okText: 'Sawa', cancelText: null });
            return;
        }
        if (!isAdmin()) {
            await skhConfirm('Vidhibiti vya majaribio ni kwa admin pekee.',
                { title: 'Huna ruhusa', okText: 'Sawa', cancelText: null });
            return;
        }
        var w = wallet();
        var isOn = on();

        var host = document.createElement('div');
        host.className = 'sbx-modal';
        host.innerHTML =
          '<div class="sbx-sheet sbx-sheet--wide">' +
            '<div class="sbx-banner">' + ico('alert', 14) +
              ' <b>TEST MODE</b> — hakuna pesa halisi inayotumika hapa.</div>' +
            '<div class="sbx-head"><b>Zana za Majaribio</b>' +
              '<button type="button" class="sbx-x" aria-label="Funga">' + ico('x', 18) + '</button></div>' +

            '<div class="sbx-toggle-row">' +
              '<div><b>Sandbox Mode</b><small>' + (isOn ? 'Imewashwa — miamala ni ya majaribio' : 'Imezimwa — mfumo uko LIVE') + '</small></div>' +
              '<button type="button" class="sh-btn ' + (isOn ? 'sh-btn--danger' : 'sh-btn--primary') + ' sh-btn--sm" id="sbxToggle">' +
                (isOn ? 'Zima' : 'Washa') + '</button>' +
            '</div>' +

            '<div class="sbx-wallet">' +
              '<div class="sbx-wallet-h">' + ico('wallet', 13) + ' TEST WALLET</div>' +
              '<div class="sbx-wallet-b">' + money(w.balance) + ' <span>TEST</span></div>' +
              '<div class="sbx-wallet-m">Imeshikiliwa (escrow): <b>' + money(w.held) + '</b></div>' +
              '<div class="sbx-wallet-note">Si pesa halisi · haiwezi kutolewa</div>' +
              '<div class="sbx-wallet-acts">' +
                '<button type="button" class="sh-btn sh-btn--secondary sh-btn--sm" id="sbxDeposit">Ongeza 1M</button>' +
                '<button type="button" class="sh-btn sh-btn--ghost sh-btn--sm" id="sbxResetWallet">Rudisha mwanzo</button>' +
              '</div>' +
            '</div>' +

            '<div class="sbx-sec">Scenarios</div>' +
            '<div class="sbx-grid">' +
              Object.keys(SCENARIOS).map(function (k) {
                  return '<button type="button" class="sbx-tile" data-sc="' + k + '">' +
                         '<b>' + k + '</b><span>' + esc(SCENARIOS[k].name) + '</span></button>';
              }).join('') +
            '</div>' +

            '<div class="sbx-sec">Vitendo</div>' +
            '<div class="sbx-grid">' +
              '<button type="button" class="sbx-tile" id="sbxPay"><b>' + ico('wallet', 16) + '</b><span>Simulate Payment</span></button>' +
              '<button type="button" class="sbx-tile" id="sbxList"><b>' + ico('clipboard', 16) + '</b><span>Miamala ya TEST</span></button>' +
              '<button type="button" class="sbx-tile sbx-tile--danger" id="sbxClear"><b>' + ico('trash', 16) + '</b><span>Futa data ya TEST</span></button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(host);

        function close() { host.remove(); }
        host.querySelector('.sbx-x').addEventListener('click', close);
        host.addEventListener('click', function (e) { if (e.target === host) close(); });

        host.querySelector('#sbxToggle').addEventListener('click', async function () {
            if (isOn) {
                try { localStorage.setItem(LS_ON, '0'); } catch (e) {}
                skhToast('Sandbox imezimwa. Mfumo uko LIVE.', 'info');
            } else {
                var ok = await skhConfirm(
                    'Miamala yote itakayofanyika itakuwa ya MAJARIBIO (environment: test).\n\nHakikisha hauko kwenye mfumo wa uzalishaji.',
                    { title: 'Washa Sandbox?', okText: 'Ndiyo, washa', cancelText: 'Ghairi' });
                if (!ok) return;
                try { localStorage.setItem(LS_ON, '1'); } catch (e) {}
                skhToast('Sandbox imewashwa.', 'success');
            }
            close(); paintBadge(); window.skhSandboxPanel();
        });

        host.querySelector('#sbxDeposit').addEventListener('click', function () {
            walletMove('deposit', 1000000, 'Test deposit');
            close(); window.skhSandboxPanel();
        });
        host.querySelector('#sbxResetWallet').addEventListener('click', function () {
            saveWallet({ balance: START_BALANCE, held: 0, history: [] });
            close(); window.skhSandboxPanel();
        });
        host.querySelector('#sbxPay').addEventListener('click', async function () {
            close();
            var amt = await skhPrompt('Kiasi cha kusimulisha:', '150000', { title: 'Simulate Payment', type: 'number' });
            if (amt) await window.skhSimulatePayment({ amount: Number(amt) });
        });
        host.querySelector('#sbxList').addEventListener('click', function () { close(); window.skhSandboxList(); });
        host.querySelector('#sbxClear').addEventListener('click', function () { close(); window.skhSandboxClear(); });
        host.querySelectorAll('[data-sc]').forEach(function (b) {
            b.addEventListener('click', function () { close(); window.skhSandboxScenario(b.getAttribute('data-sc')); });
        });
    };

    /** Orodha ya miamala ya TEST pekee (§8) */
    window.skhSandboxList = async function () {
        skhBusy(true, 'Inapakia…');
        var rows = [];
        try {
            var q = skh.query(skh.collection(skh.db, 'sokopay_core_transactions'),
                              skh.where('isTest', '==', true), skh.limit(40));
            var s = await skh.getDocs(q);
            if (s && s.forEach) s.forEach(function (d) { rows.push(Object.assign({ id: d.id }, d.data())); });
        } catch (e) { console.warn('[sandbox list]', e && e.message); }
        skhBusy(false);
        var w = wallet();
        var body = rows.length
            ? rows.map(function (r) {
                return '<div class="sbx-row"><b>' + esc(r.testPayId || r.id.slice(0, 8)) + '</b>' +
                       '<span>' + esc(r.paymentStatus || '-') + ' · ' + esc(r.escrowStatus || '-') + '</span></div>';
              }).join('')
            : '<p style="color:#64748b;font-size:13px">Hakuna miamala ya TEST bado.</p>';
        var hist = w.history.slice(0, 8).map(function (h) {
            return '<div class="sbx-row"><b>' + esc(h.kind) + '</b><span>' + money(h.amount) + '</span></div>';
        }).join('');
        await skhConfirm('<div class="sbx-sec">Miamala (' + rows.length + ')</div>' + body +
                         '<div class="sbx-sec">Wallet history</div>' + (hist || '<p style="color:#64748b;font-size:13px">—</p>'),
                         { title: 'Data ya TEST', okText: 'Funga', cancelText: null, html: true });
    };

    /** Cleanup — TEST DATA PEKEE (§10) */
    window.skhSandboxClear = async function () {
        var ok = await skhConfirm(
            'Hii itafuta miamala yenye environment: "test" PEKEE.\n\nData halisi ya uzalishaji (malipo, escrow, oda, kamisheni) HAITAGUSWA.',
            { title: 'Futa data ya majaribio?', okText: 'Ndiyo, futa TEST', cancelText: 'Ghairi' });
        if (!ok) return;
        skhBusy(true, 'Inafuta data ya TEST…');
        var n = 0;
        var cols = ['sokopay_core_transactions', 'adminRevenue', 'orders', 'ride_requests'];
        for (var i = 0; i < cols.length; i++) {
            try {
                var q = skh.query(skh.collection(skh.db, cols[i]), skh.where('isTest', '==', true), skh.limit(200));
                var s = await skh.getDocs(q);
                if (!s || !s.forEach) continue;
                var ids = [];
                s.forEach(function (d) {
                    var data = d.data() || {};
                    // ULINZI MARA MBILI: futa tu ikiwa ni test HALISI
                    if (data.isTest === true && data.environment === 'test') ids.push(d.id);
                });
                for (var j = 0; j < ids.length; j++) {
                    try { await skh.deleteDoc(skh.doc(skh.db, cols[i], ids[j])); n++; } catch (e) {}
                }
            } catch (e) { /* index/ruhusa */ }
        }
        saveWallet({ balance: START_BALANCE, held: 0, history: [] });
        skhBusy(false);
        skhToast('Imefuta rekodi ' + n + ' za TEST. Data halisi haijaguswa.', 'success', 3600);
    };

    /* ========================================================================
       8) BEJI YA "TEST MODE" (§12) — ionekane muda wote ikiwa imewaka
       ======================================================================== */
    function paintBadge() {
        var b = document.getElementById('skhSandboxBadge');
        if (!on()) { if (b) b.remove(); document.body.classList.remove('sbx-on'); return; }
        document.body.classList.add('sbx-on');
        if (b) return;
        b = document.createElement('button');
        b.id = 'skhSandboxBadge';
        b.type = 'button';
        b.className = 'sbx-badge';
        b.innerHTML = ico('alert', 13) + ' TEST MODE';
        b.title = 'Sandbox imewashwa — hakuna pesa halisi. Bonyeza kufungua zana.';
        b.addEventListener('click', function () { window.skhSandboxPanel(); });
        document.body.appendChild(b);
    }
    window.skhSandboxRefreshBadge = paintBadge;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintBadge);
    else paintBadge();
    setTimeout(paintBadge, 2500);

    /* ========================================================================
       9) ONYO LA PRODUCTION (§13)
       ======================================================================== */
    if (!allowed()) {
        // Ikiwa mtu alishawasha kwenye dev kisha akafungua production, zima.
        try { if (localStorage.getItem(LS_ON) === '1') localStorage.setItem(LS_ON, '0'); } catch (e) {}
    }
})();

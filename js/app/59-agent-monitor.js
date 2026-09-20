/* ============================================================================
   SOKOHAI — NOTIFICATION EVENT ENGINE + AGENT MONITORING
   ----------------------------------------------------------------------------
   KANUNI YA MSINGI (§8, §23):
       Offline Member = OWNER wa account yake
       Agent          = anaona shughuli MUHIMU za aliowasajili (monitoring)
       Notification kwa Agent HAIBADILISHI ownership ya data.

       registeredThroughAgentId  -> uhusiano (monitoring)
       ownerId/sellerId/buyerId  -> UMILIKI (haiguswi)

   AUDIT ILIYOFANYIKA KWANZA — kilichokuwepo:
       • `notifications` collection (matumizi 31) — TUNAITUMIA, hatuundi mpya
       • `skhWhoAmI()/skhOwnerId()` (56-nav-back.js) — utambulisho
       • Agent dashboard + `skhAssistMembersView()` (31-agent-assist.js)
       • `notificationChannel: 'sms'` kwenye profile ya member (tayari)

   HII INAONGEZA:
       1. Ngazi tatu za faragha (§10) — LEVEL 1/2/3
       2. Recipients dynamic (§15) — si kila event kwa kila mtu
       3. Channel architecture (§16) — in_app sasa, SMS/Kitochi baadaye
       4. Agent Monitoring feed (§7, §9)
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    function now() { return new Date().toISOString(); }
    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''; }
    function esc(s) { return skh.skhEscape ? skh.skhEscape(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function money(v) {
        var n = Number(v); if (!isFinite(n) || n <= 0) return 'TSh 0';
        return 'TSh ' + Math.round(n).toLocaleString('en-US');
    }

    /* ========================================================================
       1) NGAZI ZA FARAGHA (§10, §11, §12)
       ======================================================================== */
    // LEVEL 1 — matukio ya biashara: Agent anaweza kuona
    var AGENT_VISIBLE = {
        ORDER_CREATED:        { t: 'Oda mpya', ico: 'cart' },
        ORDER_CONFIRMED:      { t: 'Oda imethibitishwa', ico: 'check' },
        PAYMENT_CONFIRMED:    { t: 'Malipo yamethibitishwa', ico: 'wallet' },
        TRANSPORT_ACCEPTED:   { t: 'Usafirishaji umekubaliwa', ico: 'truck' },
        PICKUP_CONFIRMED:     { t: 'Mzigo umechukuliwa', ico: 'package' },
        IN_TRANSIT:           { t: 'Mzigo uko njiani', ico: 'truck' },
        HANDOFF_VERIFIED:     { t: 'Makabidhiano yamethibitishwa', ico: 'handshake' },
        DELIVERED:            { t: 'Mzigo umefika', ico: 'check' },
        ORDER_COMPLETED:      { t: 'Oda imekamilika', ico: 'check' },
        DISPUTE_OPENED:       { t: 'Mgogoro umefunguliwa', ico: 'alert' },
        ORDER_CANCELLED:      { t: 'Oda imeghairiwa', ico: 'x' },
        SERVICE_ACCEPTED:     { t: 'Huduma imekubaliwa', ico: 'wrench' },
        PRODUCT_SOLD:         { t: 'Bidhaa imeuzwa', ico: 'shop' }
    };
    // LEVEL 2 — muhtasari tu
    var AGENT_SUMMARY = {
        PRODUCT_PUBLISHED: { t: 'Bidhaa mpya imechapishwa', ico: 'package' },
        SERVICE_PUBLISHED: { t: 'Huduma mpya imechapishwa', ico: 'wrench' },
        PROFILE_UPDATED:   { t: 'Wasifu umesasishwa', ico: 'user' }
    };
    // LEVEL 3 — KAMWE kwa Agent (§10, §12)
    var PRIVATE_ONLY = {
        CHAT_MESSAGE: 1, NEGOTIATION_DETAIL: 1, WALLET_BALANCE: 1,
        PIN_CHANGED: 1, OTP: 1, PASSWORD: 1, SECURITY_SETTING: 1,
        PRIVATE_SETTING: 1, CUSTOMER_CONVERSATION: 1
    };

    function agentLevel(type) {
        if (PRIVATE_ONLY[type]) return 0;          // haiendi kwa agent
        if (AGENT_VISIBLE[type]) return 1;
        if (AGENT_SUMMARY[type]) return 2;
        return 0;                                   // isiyojulikana = salama
    }
    window.skhAgentLevel = agentLevel;

    /* ========================================================================
       2) MSAIDIZI: pata agent wa member (§19)
       ======================================================================== */
    var agentCache = {};
    async function agentOf(memberUid) {
        if (!memberUid || !skh.db) return null;
        if (agentCache[memberUid] !== undefined) return agentCache[memberUid];
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'users', memberUid));
            var d = (s && s.exists && s.exists()) ? (s.data() || {}) : {};
            var a = d.registeredThroughAgentId || d.createdByAgentId || d.managedByAgentUid || null;
            agentCache[memberUid] = a;
            return a;
        } catch (e) { agentCache[memberUid] = null; return null; }
    }
    window.skhAgentOfMember = agentOf;

    /** Njia ya notification kwa mtumiaji (§16, §18) */
    async function channelsFor(uidStr) {
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'users', uidStr));
            var d = (s && s.exists && s.exists()) ? (s.data() || {}) : {};
            var ch = ['in_app'];
            var phone = d.phone || d.phoneNumber;
            if (phone && (d.isOfflineUser || d.notificationChannel === 'sms')) ch.push('sms');
            return { channels: ch, phone: phone || null };
        } catch (e) { return { channels: ['in_app'], phone: null }; }
    }

    /* ========================================================================
       3) INJINI KUU YA EVENT (§14, §15)
       ------------------------------------------------------------------------
       skhEmitEvent({ type, memberId, orderId, amount, title, body, extra })
       Hutuma kwa:
         • member (daima)
         • agent  (ikiwa LEVEL 1/2 pekee)
       Inatumia `notifications` ILIYOPO — hakuna collection mpya.
       ======================================================================== */
    window.skhEmitEvent = async function (ev) {
        ev = ev || {};
        var type = String(ev.type || '').toUpperCase();
        var memberId = ev.memberId || (window.skhOwnerId ? window.skhOwnerId() : null);
        if (!type || !memberId || !skh.db) return { ok: false };

        var meta = AGENT_VISIBLE[type] || AGENT_SUMMARY[type] || { t: type, ico: 'bell' };
        var title = ev.title || meta.t;
        var body = ev.body || buildBody(ev, meta);
        var lvl = agentLevel(type);

        var results = { member: false, agent: false, level: lvl };

        /* ---- (a) MWANACHAMA — daima (ni account yake) ----
           [IDENTITY WIRING 2026-09-16] ev.memberSilent=true: taarifa ya member
           imeshatumwa na flow iliyopo (mf. 43-delivery-choice inaandika tayari
           'Oda Mpya' kwa seller) — bila hii member angepata notification mbili. */
        if (ev.memberSilent) { results.member = 'skipped_existing'; }
        else try {
            var mc = await channelsFor(memberId);
            await skh.addDoc(skh.collection(skh.db, 'notifications'), Object.assign({
                userId: memberId,                       // OWNER
                title: title, body: body,
                eventType: type,
                orderId: ev.orderId || null,
                transportId: ev.transportId || null,
                amount: ev.amount != null ? ev.amount : null,
                recipientRole: 'member',
                channels: mc.channels,
                // SMS/Kitochi bado haijaunganishwa — usidanganye (§16)
                smsStatus: mc.channels.indexOf('sms') !== -1 ? 'queued' : null,
                smsPhone: mc.channels.indexOf('sms') !== -1 ? mc.phone : null,
                smsProvider: mc.channels.indexOf('sms') !== -1 ? 'pending_configuration' : null,
                read: false, createdAt: now(), type: ev.kind || 'business'
            }, window.skhEnvStamp ? window.skhEnvStamp() : {}));
            results.member = true;
        } catch (e) {
            if (window.skhErr) window.skhErr(e, { fn: 'emitEvent:member', entityId: memberId });
        }

        /* ---- (b) WAKALA — LEVEL 1/2 pekee (§10) ---- */
        if (lvl > 0) {
            var agentId = ev.agentId || await agentOf(memberId);
            if (agentId && agentId !== memberId) {
                try {
                    await skh.addDoc(skh.collection(skh.db, 'notifications'), Object.assign({
                        userId: agentId,                 // mpokeaji = agent
                        memberId: memberId,              // LAKINI data ni ya member
                        title: (ev.memberName ? ev.memberName + ' — ' : '') + title,
                        body: lvl === 1 ? body : title,  // LEVEL 2 = muhtasari tu
                        eventType: type,
                        orderId: lvl === 1 ? (ev.orderId || null) : null,
                        amount: lvl === 1 && ev.amount != null ? ev.amount : null,
                        recipientRole: 'agent_monitor',  // SI owner (§23)
                        monitoring: true,
                        level: lvl,
                        read: false, createdAt: now(), type: 'agent_monitor'
                    }, window.skhEnvStamp ? window.skhEnvStamp() : {}));
                    results.agent = true;
                } catch (e) { /* monitoring si kikwazo cha biashara */ }
            }
        }
        return Object.assign({ ok: true }, results);
    };

    function buildBody(ev, meta) {
        var bits = [];
        if (ev.itemTitle) bits.push(ev.itemTitle);
        if (ev.orderId) bits.push('Oda ' + ev.orderId);
        if (ev.amount != null && Number(ev.amount) > 0) bits.push(money(ev.amount));
        if (ev.from && ev.to) bits.push(ev.from + ' → ' + ev.to);
        return bits.join(' · ') || meta.t;
    }

    /* ========================================================================
       4) AGENT MONITORING FEED (§7, §9)
       ======================================================================== */
    window.skhAgentMonitorFeed = async function (limit) {
        var me = (skh.currentUser && skh.currentUser.uid) || null;
        if (!me || !skh.db) return { ok: false, items: [] };
        try {
            var q = skh.query(
                skh.collection(skh.db, 'notifications'),
                skh.where('userId', '==', me),
                skh.where('monitoring', '==', true),
                skh.limit(limit || 50)
            );
            var snap = await skh.getDocs(q);
            var items = [];
            if (snap && snap.forEach) snap.forEach(function (d) {
                items.push(Object.assign({ id: d.id }, d.data()));
            });
            items.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
            return { ok: true, items: items };
        } catch (e) {
            var x = window.skhErr ? window.skhErr(e, { fn: 'agentMonitorFeed', collection: 'notifications' })
                                  : { code: 'internal', userMessage: 'Imeshindikana kupakia.' };
            return { ok: false, items: [], error: x };
        }
    };

    /** Takwimu za mwanachama mmoja (§9) */
    window.skhAgentMemberStats = async function (memberUid) {
        var out = { orders: 0, sales: 0, services: 0, transport: 0, pending: 0, completed: 0 };
        if (!memberUid || !skh.db) return out;
        async function count(col, role) {
            if (typeof window.skhQueryMulti !== 'function') return [];
            var r = await window.skhQueryMulti(col, role, { uid: memberUid, limit: 100 });
            return r.items || [];
        }
        try {
            var orders = await count('orders', 'seller');
            out.orders = orders.length;
            orders.forEach(function (o) {
                var s = String(o.status || o.orderStatus || '').toLowerCase();
                if (/completed|delivered/.test(s)) out.completed++;
                else out.pending++;
                var amt = Number(o.totalAmount || o.amount || 0);
                if (/paid|completed|delivered|released/.test(s) && amt > 0) out.sales += amt;
            });
            out.services = (await count('services', 'provider')).length;
            out.transport = (await count('ride_requests', 'transporter')).length;
        } catch (e) {}
        return out;
    };

    /* ========================================================================
       5) UI YA MONITORING (§7)
       ======================================================================== */
    window.skhAgentMonitorView = async function () {
        var host = document.getElementById('richDashboardContainer');
        if (!host) { skhToast('Fungua daftari la wakala kwanza.', 'info'); return; }
        if (typeof window.skhDashPush === 'function') window.skhDashPush('agentMonitor');

        host.innerHTML = '<div class="am-wrap">' +
            (typeof window.skhStateHtml === 'function' ? window.skhStateHtml('loading', {}) : 'Inapakia…') +
            '</div>';

        var res = await window.skhAgentMonitorFeed(50);
        var body;
        if (!res.ok) {
            body = (typeof window.skhStateHtml === 'function')
                ? window.skhStateHtml('error', {
                    message: (res.error && res.error.userMessage) || 'Imeshindikana kupakia taarifa.',
                    onRetry: 'window.skhAgentMonitorView()'
                  })
                : '<p>Imeshindikana kupakia.</p>';
        } else if (!res.items.length) {
            body = (typeof window.skhStateHtml === 'function')
                ? window.skhStateHtml('empty', {
                    icon: 'bell', title: 'Bado hakuna shughuli',
                    message: 'Wanachama uliowasajili wakifanya shughuli, taarifa zitaonekana hapa.'
                  })
                : '<p>Hakuna shughuli bado.</p>';
        } else {
            body = res.items.map(function (n) {
                var m = AGENT_VISIBLE[n.eventType] || AGENT_SUMMARY[n.eventType] || { ico: 'bell' };
                var when = '';
                try { when = new Date(n.createdAt).toLocaleString(); } catch (e) {}
                return '<div class="am-row">' +
                       '<span class="am-ic">' + ico(m.ico, 15) + '</span>' +
                       '<div class="am-b"><div class="am-t">' + esc(n.title || '') + '</div>' +
                       (n.body ? '<div class="am-s">' + esc(n.body) + '</div>' : '') +
                       '<div class="am-w">' + esc(when) + '</div></div></div>';
            }).join('');
        }

        host.innerHTML =
            '<div class="am-wrap">' +
              '<div class="am-head">' +
                '<div><b>Ufuatiliaji wa Wanachama</b>' +
                '<small>Taarifa za shughuli za wanachama uliowasajili</small></div>' +
              '</div>' +
              '<div class="am-note">' + ico('shield-check', 13) +
                ' Unaona matukio ya biashara pekee. Mazungumzo binafsi, salio na usalama ni vya mwanachama peke yake.' +
              '</div>' +
              '<div class="am-list">' + body + '</div>' +
            '</div>';
    };

    /* ========================================================================
       6) UNGANISHA NA MATUKIO YALIYOPO (bila kuvunja)
       ======================================================================== */
    document.addEventListener('skh:order-paid', function (e) {
        var d = (e && e.detail) || {};
        window.skhEmitEvent({
            type: 'PAYMENT_CONFIRMED', orderId: d.orderId,
            memberId: window.skhOwnerId ? window.skhOwnerId() : null,
            memberName: window.skhDisplayName ? window.skhDisplayName() : ''
        });
    });

    console.info('[SokoHai] Agent monitoring tayari. skhAgentMonitorView() kuona feed.');
})();

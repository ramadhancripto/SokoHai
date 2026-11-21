/* ==== js/app/98-admin-control-center.js ====
// ============================================================
// [REPAIR 2026-10 Phase 6] KITUO CHA UDHIBITI WA ADMIN
// ------------------------------------------------------------
// Kiolesura kimoja cha zana za admin zilizo upande wa SERVER
// (Cloud Functions). Kila kitendo kinachogusa mtu mwingine
// kinahitaji SABABU iliyoandikwa, na server huandika kumbukumbu
// ya kudumu (admin_audit_log). Kivinjari hakiandiki moja kwa moja
// hali ya akaunti, uwakala, bei, migogoro wala sera ya escrow.
//
// Sehemu: Muhtasari · Akaunti · Mawakala · Ukaguzi wa Bei ·
//         Migogoro · Uthibitisho · Matangazo · Sera ya Escrow ·
//         Kumbukumbu za Ukaguzi
// Kinaongezwa kama kitufe ndani ya dashibodi ya admin iliyopo.
// ============================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    var ME = { admin: false, superAdmin: false };
    var TAB = 'overview';

    function esc(s) { return skh.skhEscape ? skh.skhEscape(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
    function money(n) { return 'TSh ' + (Number(n) || 0).toLocaleString(); }
    function fn(name) {
        if (typeof skh.wrapCallable !== 'function') throw new Error('Huduma ya server haipatikani kwa sasa.');
        return skh.wrapCallable(name);
    }
    async function run(name, data) {
        var res = await fn(name)(data || {});
        return (res && res.data) || {};
    }
    function errText(e) { return String((e && (e.message || e.code)) || e).replace(/^FirebaseError:\s*/, ''); }
    function toast(msg, type) {
        if (typeof window.skhToast === 'function') window.skhToast(msg, type || 'info', 4500);
        else alert(msg);
    }
    async function ask(q) {
        if (typeof window.skhPrompt === 'function') return await window.skhPrompt(q);
        return window.prompt(q);
    }
    async function confirmIt(q) {
        if (typeof window.skhConfirm === 'function') return await window.skhConfirm(q);
        return window.confirm(q);
    }
    async function needReason(min) {
        var r = await ask('Andika SABABU ya kitendo hiki (itahifadhiwa kwenye kumbukumbu ya ukaguzi):');
        r = String(r || '').trim();
        if (r.length < (min || 5)) { toast('Sababu ni fupi mno (angalau herufi ' + (min || 5) + ').', 'error'); return null; }
        return r;
    }

    /* ---------------- shell ---------------- */
    function modal() {
        var m = document.getElementById('skhAdminCC');
        if (!m) {
            m = document.createElement('div');
            m.id = 'skhAdminCC';
            m.className = 'overlay-menu';
            m.setAttribute('role', 'dialog');
            m.setAttribute('aria-modal', 'true');
            m.style.cssText = 'z-index:100020;display:none;background:rgba(15,23,42,.55);align-items:flex-start;justify-content:center;padding:12px;overflow:auto;';
            document.body.appendChild(m);
        }
        return m;
    }
    window.skhAdminCCClose = function () { var m = document.getElementById('skhAdminCC'); if (m) m.style.display = 'none'; };

    var TABS = [
        ['overview', 'Muhtasari'], ['accounts', 'Akaunti'], ['agents', 'Mawakala'], ['prices', 'Ukaguzi wa Bei'],
        ['disputes', 'Migogoro'], ['withdrawals', 'Kutoa Pesa'], ['verify', 'Uthibitisho'], ['trust', 'Beji za uaminifu'], ['listings', 'Matangazo'], ['auctions', 'Minada'], ['groupbuy', 'Group Buy'], ['policy', 'Sera ya Escrow'], ['audit', 'Kumbukumbu']
    ];
    function frame(inner) {
        var tabs = TABS.map(function (t) {
            var on = t[0] === TAB;
            return '<button type="button" onclick="window.skhAdminCCTab(\'' + t[0] + '\')" style="padding:8px 10px;border-radius:999px;border:1px solid ' + (on ? '#17604E' : '#D5E2DE') + ';background:' + (on ? '#17604E' : '#fff') + ';color:' + (on ? '#fff' : '#18352D') + ';font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;">' + t[1] + '</button>';
        }).join('');
        var role = ME.superAdmin ? 'Super Admin' : (ME.admin ? 'Admin' : 'Hakuna ruhusa');
        return '<section style="width:min(100%,860px);background:#fff;border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(15,23,42,.24);margin:auto;">'
            + '<header style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">'
            + '<div><h3 style="margin:0;color:#17604E;font-size:18px;">Kituo cha Udhibiti wa Admin</h3>'
            + '<small style="color:#64748b;">Nafasi yako kwa mujibu wa server: <b>' + esc(role) + '</b>. Kila kitendo kinahifadhiwa kwenye kumbukumbu ya ukaguzi.</small></div>'
            + '<button type="button" onclick="window.skhAdminCCClose()" style="border:none;background:#e2e8f0;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700;">Funga</button></header>'
            + (ME.admin ? '<nav style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:10px;border-bottom:1px solid #eef2f1;">' + tabs + '</nav>' : '')
            + '<div id="skhAdminCCBody">' + inner + '</div></section>';
    }
    function render(inner) { modal().innerHTML = frame(inner); }
    function loading() { render('<p style="color:#64748b;padding:20px;text-align:center;">Inapakia…</p>'); }
    function box(title, body) {
        return '<div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:12px;"><h4 style="margin:0 0 8px;color:#18352D;font-size:14px;">' + title + '</h4>' + body + '</div>';
    }
    function btn(label, onclick, kind) {
        var c = { primary: ['#17604E', '#fff'], danger: ['#fee2e2', '#b91c1c'], plain: ['#f1f5f9', '#18352D'] }[kind || 'primary'];
        return '<button type="button" onclick="' + onclick + '" style="padding:8px 12px;border:none;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;background:' + c[0] + ';color:' + c[1] + ';margin:3px 6px 3px 0;">' + label + '</button>';
    }
    function input(id, ph, type) {
        return '<input id="' + id + '" type="' + (type || 'text') + '" placeholder="' + esc(ph) + '" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin:4px 0 8px;font-size:14px;">';
    }
    function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
    function empty(t) { return '<p style="color:#64748b;font-size:13px;margin:4px 0;">' + t + '</p>'; }

    /* ---------------- tabs ---------------- */
    var VIEWS = {};

    VIEWS.overview = async function () {
        var counts = { price: '—', disputes: '—', legacy: '—', agentsPending: '—', withdrawals: '—' };
        try { counts.price = (await skh.getDocs(skh.query(skh.collection(skh.db, 'orders'), skh.where('paymentStatus', '==', 'price_review'), skh.limit(200)))).size; } catch (e) {}
        try { counts.disputes = (await skh.getDocs(skh.query(skh.collection(skh.db, 'disputes'), skh.where('status', '==', 'open'), skh.limit(200)))).size; } catch (e) {}
        try { counts.withdrawals = (await skh.getDocs(skh.query(skh.collection(skh.db, 'withdrawal_requests'), skh.where('status', '==', 'pending'), skh.limit(200)))).size; } catch (e) {}
        try {
            var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'users'), skh.where('isApprovedAgent', '==', true), skh.limit(300)));
            var n = 0; s.forEach(function (d) { if (!(d.data() || {}).agentApprovedBy) n++; }); counts.legacy = n;
        } catch (e) {}
        try { counts.agentsPending = (await skh.getDocs(skh.query(skh.collection(skh.db, 'agents'), skh.where('status', '==', 'pending'), skh.limit(200)))).size; } catch (e) {}
        function tile(label, v, tab) {
            return '<button type="button" onclick="window.skhAdminCCTab(\'' + tab + '\')" style="text-align:left;border:1px solid #D5E2DE;background:#f8fbfa;border-radius:14px;padding:12px;cursor:pointer;">'
                + '<small style="color:#64748b;">' + label + '</small><div style="font-size:22px;font-weight:900;color:#17604E;">' + esc(v) + '</div></button>';
        }
        /* [R16] usanidi wa nje uliobaki (server inaripoti ndiyo/hapana tu — hakuna siri) */
        var setup = ''; try { var su = await run('adminSetupStatus', {}); setup = box('Usanidi wa nje (' + su.done + '/' + su.total + ')', '<ul data-setup-list style="margin:0;padding-left:0;list-style:none;font-size:13px;line-height:1.8;">' + (su.items || []).map(function (i) {
            return '<li data-setup="' + esc(i.key) + '" data-ok="' + (i.ok ? '1' : '0') + '"><b style="color:' + (i.ok ? '#16a34a' : '#b45309') + ';">' + (i.ok ? 'Tayari' : (i.optional ? 'Hiari' : 'Bado')) + '</b> · ' + esc(i.label) + (i.value ? ' <small style="color:#64748b;">(' + esc(i.value) + ')</small>' : '')
                + (i.key === 'search_backfill' && !i.ok ? ' ' + btn('Endesha sasa', 'window.skhAdminCCBackfill()') : '') + '</li>';
        }).join('') + '</ul><small style="color:#64748b;">Maelekezo: docs/SOKOHAI-USER-SETUP-CHECKLIST.md</small>'); } catch (e) {}
        /* [PILOT OPS 2026-11-14] pesa inayohitaji mtu sasa (server: adminMoneyWatch) */
        var watch = ''; try { var mw = await run('adminMoneyWatch', {}); watch = box('Ulinzi wa pesa (' + (mw.attention || 0) + ' za kushughulikia)', '<ul data-money-watch style="margin:0;padding-left:0;list-style:none;font-size:13px;line-height:1.8;">' + (mw.items || []).map(function (i) {
            return '<li data-watch="' + esc(i.key) + '" data-count="' + esc(i.count) + '"><b style="color:' + (i.count ? '#b45309' : '#16a34a') + ';">' + esc(i.count) + '</b> · ' + esc(i.label) + (i.count ? '<br><small style="color:#64748b;">' + esc(i.hint || '') + '</small>' : '') + '</li>';
        }).join('') + '</ul><small style="color:#64748b;">Kazi za server: PesaPal ' + esc(((mw.jobs || {}).pesapalReconcile || {}).lastRunAt ? String(mw.jobs.pesapalReconcile.lastRunAt).slice(0, 16).replace('T', ' ') : 'haijaendeshwa bado') + ' · Ofa za usafiri ' + esc(((mw.jobs || {}).deliveryOfferExpiry || {}).lastRunAt ? String(mw.jobs.deliveryOfferExpiry.lastRunAt).slice(0, 16).replace('T', ' ') : 'haijaendeshwa bado') + '</small>'); } catch (e) {}
        return setup + watch + box('Kazi zinazosubiri', '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">'
            + tile('Oda kwenye ukaguzi wa bei', counts.price, 'prices')
            + tile('Migogoro iliyo wazi', counts.disputes, 'disputes')
            + tile('Maombi ya kutoa pesa', counts.withdrawals, 'withdrawals')
            + tile('Mawakala wa zamani wa kuhakikiwa upya', counts.legacy, 'agents')
            + tile('Maombi mapya ya uwakala', counts.agentsPending, 'agents') + '</div>')
            + box('Kumbuka', '<ul style="margin:0;padding-left:18px;color:#334155;font-size:13px;line-height:1.6;">'
                + '<li>Fedha za escrow hazitolewi bila uthibitisho wa server (mnunuzi, namba ya kupokea au Token C).</li>'
                + '<li>Uamuzi wa mgogoro unalipa kutoka escrow iliyothibitishwa tu — hauwezi kulipa mara mbili.</li>'
                + '<li>Maombi mapya ya uwakala yanaidhinishwa kwenye orodha ya "Maombi ya Wawakala" ya dashibodi kuu.</li></ul>');
    };

    /* [DEPLOY 2026-11-16] one-time search index after deploy: products, then services, page by page.
       [HARDENING 2026-11-16] The SERVER allows one run at a time (functions/search-index.js lease);
       this page also ignores repeat clicks while its own run is going and disables the button. */
    var BACKFILL_BUSY = false;
    function backfillButtons(disabled) {
        document.querySelectorAll('#skhAdminCC button[onclick*="skhAdminCCBackfill()"]').forEach(function (b) {
            b.disabled = disabled; b.style.opacity = disabled ? '.55' : ''; b.style.cursor = disabled ? 'progress' : 'pointer';
            if (disabled) { b.dataset.label = b.dataset.label || b.textContent; b.textContent = 'Inaendelea…'; } else if (b.dataset.label) { b.textContent = b.dataset.label; }
        });
    }
    window.skhAdminCCBackfill = async function () {
        if (BACKFILL_BUSY) { toast('Uandaaji wa utafutaji tayari unaendelea.', 'info'); return; }
        BACKFILL_BUSY = true; backfillButtons(true);
        try {
            if (!(await confirmIt('Kuandaa utafutaji wa bidhaa na huduma zote zilizopo? (salama kurudia)'))) return;
            var runId = null, guard = 0, r = null;
            do {
                r = await run('adminSearchBackfill', runId ? { runId: runId, pageSize: 300 } : { pageSize: 300 });
                runId = r.runId; guard++;
                if (!r.done) toast('Utafutaji: ' + (r.totals ? r.totals.scanned : 0) + ' zimekaguliwa…', 'info');
            } while (r && !r.done && guard < 400);
            if (r && r.done) {
                toast('Utafutaji umeandaliwa: ' + r.totals.written + ' zimesasishwa (' + r.totals.scanned + ' zimekaguliwa).', 'success');
                window.skhAdminCCTab('overview');
            } else toast('Uandaaji haukukamilika — bonyeza tena baada ya dakika 10.', 'error');
        } catch (e) {
            var code = String((e && e.code) || '');
            toast(/already-exists/.test(code) ? 'Uandaaji wa utafutaji tayari unaendelea (labda kwenye tab au kifaa kingine). Subiri ukamilike.' : errText(e), 'error');
        } finally { BACKFILL_BUSY = false; backfillButtons(false); }
    };

    VIEWS.accounts = async function () {
        return box('Tafuta akaunti', input('ccUserQ', 'UID au barua pepe kamili') + btn('Tafuta', 'window.skhAdminCCFindUser()'))
            + '<div id="ccUserOut"></div>'
            + (ME.superAdmin ? box('Majukumu (Super Admin pekee)', empty('Kumpa mtu cheo cha admin: tafuta akaunti kwanza, kisha bonyeza "Mfanye Admin". Email ya akaunti lazima iwe imethibitishwa.')) : '');
    };
    window.skhAdminCCFindUser = async function () {
        var q = val('ccUserQ'), out = document.getElementById('ccUserOut');
        if (!q) return;
        out.innerHTML = empty('Inatafuta…');
        var docs = [];
        try {
            if (q.indexOf('@') !== -1) {
                var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'users'), skh.where('email', '==', q.toLowerCase()), skh.limit(5)));
                s.forEach(function (d) { docs.push({ id: d.id, data: d.data() || {} }); });
                if (!docs.length) { s = await skh.getDocs(skh.query(skh.collection(skh.db, 'users'), skh.where('email', '==', q), skh.limit(5))); s.forEach(function (d) { docs.push({ id: d.id, data: d.data() || {} }); }); }
            } else {
                var g = await skh.getDoc(skh.doc(skh.db, 'users', q));
                if (g.exists()) docs.push({ id: g.id, data: g.data() || {} });
            }
        } catch (e) { out.innerHTML = empty('Hitilafu: ' + esc(errText(e))); return; }
        if (!docs.length) { out.innerHTML = empty('Hakuna akaunti iliyopatikana.'); return; }
        out.innerHTML = docs.map(function (u) {
            var d = u.data, uid = esc(d.uid || u.id);
            var suspended = d.isSuspended === true || d.accountStatus === 'suspended';
            return box(esc(d.fullName || d.displayName || uid),
                '<div style="font-size:13px;color:#334155;line-height:1.7;">UID: <code>' + uid + '</code><br>Barua pepe: ' + esc(d.email || '—')
                + '<br>Hali: <b>' + (suspended ? 'IMESIMAMISHWA' : 'Hai') + '</b>' + (d.suspendReason ? ' — ' + esc(d.suspendReason) : '')
                + '<br>Wakala: ' + (d.isApprovedAgent ? (d.agentApprovedBy ? 'Ndiyo (amehakikiwa)' : 'Ndiyo (idhini ya zamani — HAKIKI UPYA)') : 'Hapana')
                + ' · Muuzaji amethibitishwa: ' + (d.sellerVerified ? 'Ndiyo' : 'Hapana') + '</div>'
                + (suspended ? btn('Rejesha akaunti', "window.skhAdminCCAccount('" + uid + "','active')") : btn('Simamisha akaunti', "window.skhAdminCCAccount('" + uid + "','suspended')", 'danger'))
                + btn(d.sellerVerified ? 'Ondoa uthibitisho wa muuzaji' : 'Thibitisha muuzaji', "window.skhAdminCCVerify('seller','" + uid + "'," + (!d.sellerVerified) + ")", 'plain')
                + (ME.superAdmin ? btn('Mfanye Admin', "window.skhAdminCCRole('" + uid + "','admin')", 'plain') + btn('Ondoa cheo cha admin', "window.skhAdminCCRole('" + uid + "','none')", 'plain') : ''));
        }).join('');
    };
    window.skhAdminCCAccount = async function (uid, status) {
        if (status === 'suspended' && !(await confirmIt('Kusimamisha kunamzuia mtumiaji kuingia hadi arejeshwe. Endelea?'))) return;
        var reason = await needReason(5); if (!reason) return;
        try { await run('adminSetAccountStatus', { uid: uid, status: status, reason: reason }); toast(status === 'suspended' ? 'Akaunti imesimamishwa.' : 'Akaunti imerejeshwa.', 'success'); window.skhAdminCCFindUser(); }
        catch (e) { toast(errText(e), 'error'); }
    };
    window.skhAdminCCRole = async function (uid, role) {
        if (!(await confirmIt(role === 'none' ? 'Ondoa cheo cha admin kwa akaunti hii?' : 'Mpe akaunti hii cheo cha ADMIN? Ataweza kuona data nyeti na kufanya maamuzi.'))) return;
        var reason = await needReason(5); if (!reason) return;
        try { await run('adminSetRole', { uid: uid, role: role, reason: reason }); toast('Cheo kimebadilishwa. Kitaanza kufanya kazi atakapoingia tena.', 'success'); }
        catch (e) { toast(errText(e), 'error'); }
    };

    VIEWS.agents = async function () {
        var rows = [];
        try {
            var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'users'), skh.where('isApprovedAgent', '==', true), skh.limit(300)));
            s.forEach(function (d) { rows.push({ id: d.id, data: d.data() || {} }); });
        } catch (e) { return box('Mawakala', empty('Hitilafu: ' + esc(errText(e)))); }
        var paused = [];
        try {
            var ps = await skh.getDocs(skh.query(skh.collection(skh.db, 'users'), skh.where('agentStatus', '==', 'suspended'), skh.limit(200)));
            ps.forEach(function (d) { paused.push({ id: d.id, data: d.data() || {} }); });
        } catch (e) {}
        var legacy = rows.filter(function (r) { return !r.data.agentApprovedBy; });
        var ok = rows.filter(function (r) { return !!r.data.agentApprovedBy; });
        function row(r, isLegacy) {
            var d = r.data, uid = esc(d.uid || r.id);
            return '<div style="padding:10px;border:1px solid #eef2f1;border-radius:10px;margin-bottom:8px;">'
                + '<b>' + esc(d.fullName || uid) + '</b> <small style="color:#64748b;">' + esc(d.myAgentCode || '') + ' · ' + esc(d.agentStatus || 'approved') + '</small><br>'
                + (isLegacy ? btn('Hakiki upya (baada ya kukagua nyaraka)', "window.skhAdminCCReverify('" + uid + "')") : '')
                + btn('Simamisha uwakala', "window.skhAdminCCAgentStatus('" + uid + "','suspended')", 'danger')
                + btn('Futa uwakala', "window.skhAdminCCAgentStatus('" + uid + "','revoked')", 'plain') + '</div>';
        }
        return box('Idhini za zamani zinazohitaji kuhakikiwa upya (' + legacy.length + ')',
                empty('Kabla ya marekebisho ya usalama, alama ya "wakala" ingeweza kughushiwa. Mawakala hawa hawataweza kutumia zana za wakala mpaka uwahakiki upya.')
                + (legacy.length ? legacy.map(function (r) { return row(r, true); }).join('') : empty('Hakuna.')))
            + box('Mawakala waliohakikiwa (' + ok.length + ')', ok.length ? ok.map(function (r) { return row(r, false); }).join('') : empty('Hakuna.'))
            + box('Mawakala waliosimamishwa (' + paused.length + ')', paused.length ? paused.map(function (r) {
                var d = r.data, uid = esc(d.uid || r.id);
                return '<div style="padding:10px;border:1px solid #eef2f1;border-radius:10px;margin-bottom:8px;"><b>' + esc(d.fullName || uid) + '</b> <small style="color:#64748b;">' + esc(d.myAgentCode || '') + '</small><br>'
                    + btn('Rejesha uwakala', "window.skhAdminCCAgentStatus('" + uid + "','approved')") + '</div>';
            }).join('') : empty('Hakuna.'));
    };
    window.skhAdminCCReverify = async function (uid) {
        try {
            var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'agents'), skh.where('userId', '==', uid), skh.limit(5)));
            if (s.empty) { toast('Ombi la uwakala la mtumiaji huyu halipatikani. Muombe aombe upya.', 'error'); return; }
            var note = await needReason(5); if (!note) return;
            await run('adminApproveAgent', { agentDocId: s.docs[0].id, note: note });
            toast('Wakala amehakikiwa upya.', 'success'); window.skhAdminCCTab('agents');
        } catch (e) { toast(errText(e), 'error'); }
    };
    window.skhAdminCCAgentStatus = async function (uid, status) {
        if (!(await confirmIt('Badilisha hali ya uwakala kuwa "' + status + '"?'))) return;
        var reason = await needReason(5); if (!reason) return;
        try { await run('adminSetAgentStatus', { uid: uid, status: status, reason: reason }); toast('Hali ya uwakala imebadilishwa.', 'success'); window.skhAdminCCTab('agents'); }
        catch (e) { toast(errText(e), 'error'); }
    };

    VIEWS.prices = async function () {
        var rows = [];
        try {
            var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'orders'), skh.where('paymentStatus', '==', 'price_review'), skh.limit(100)));
            s.forEach(function (d) { rows.push({ id: d.id, data: d.data() || {} }); });
        } catch (e) { return box('Ukaguzi wa bei', empty('Hitilafu: ' + esc(errText(e)))); }
        var REASONS = { underpriced: 'Kiasi kilicholipwa ni pungufu ya bei ya server', not_auction_winner: 'Mnunuzi si mshindi wa mnada', auction_live: 'Mnada bado unaendelea',
            auction_no_winner: 'Mnada umeisha bila mshindi', no_price_source: 'Hakuna chanzo cha bei', unknown_item: 'Bidhaa haipatikani', seller_mismatch: 'Muuzaji hailingani',
            service_requires_negotiation: 'Huduma inahitaji majadiliano', negotiation_not_agreed: 'Majadiliano hayajakubaliwa', price_approval_unverified: 'Idhini ya bei haina kumbukumbu' };
        return box('Oda zilizosimamishwa kwa ukaguzi wa bei (' + rows.length + ')',
            empty('Malipo yamethibitishwa na PesaPal lakini bei hailingani na rekodi za server, kwa hiyo fedha HAZIJAWEKWA escrow. Idhinisha TU baada ya kuthibitisha na muuzaji na mnunuzi.')
            + (rows.length ? rows.map(function (r) {
                var o = r.data, id = esc(r.id);
                return '<div style="padding:10px;border:1px solid #fde68a;background:#fffbeb;border-radius:10px;margin-bottom:8px;font-size:13px;">'
                    + '<b>' + esc(o.itemTitle || 'Oda') + '</b> <small>#' + id + '</small><br>'
                    + 'Kiasi cha oda: <b>' + money(o.amount) + '</b> · Bei ya server: <b>' + (o.priceExpected != null ? money(o.priceExpected) : '—') + '</b><br>'
                    + 'Sababu: ' + esc(REASONS[o.priceReviewReason] || o.priceReviewReason || '—') + '<br>'
                    + btn('Idhinisha bei hii', "window.skhAdminCCApprovePrice('" + id + "')") + '</div>';
            }).join('') : empty('Hakuna oda kwenye ukaguzi.')));
    };
    window.skhAdminCCApprovePrice = async function (orderId) {
        if (!(await confirmIt('Kuidhinisha kunaruhusu fedha kuingia escrow kwa kiasi cha oda kama kilivyo. Umethibitisha na pande zote mbili?'))) return;
        var reason = await needReason(10); if (!reason) return;
        try { var r = await run('adminApproveOrderPrice', { orderId: orderId, reason: reason }); toast('Imeidhinishwa' + (r.settled && r.settled.length ? ' na fedha zimeingia escrow.' : '. Malipo yatathibitishwa tena na PesaPal.'), 'success'); window.skhAdminCCTab('prices'); }
        catch (e) { toast(errText(e), 'error'); }
    };

    VIEWS.disputes = async function () {
        var rows = [];
        try {
            var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'disputes'), skh.where('status', 'in', ['open', 'under_review']), skh.limit(100)));
            s.forEach(function (d) { rows.push({ id: d.id, data: d.data() || {} }); });
        } catch (e) { return box('Migogoro', empty('Hitilafu: ' + esc(errText(e)))); }
        return box('Migogoro iliyo wazi (' + rows.length + ')',
            empty('Fedha zimesimamishwa mpaka utoe uamuzi. Soma maelezo ya pande zote mbili na ushahidi kwenye chat ya oda kabla ya kuamua.')
            + (rows.length ? rows.map(function (r) {
                var d = r.data, k = d.targetKind === 'link' ? 'link' : 'order', id = esc(d.targetId);
                return '<div style="padding:10px;border:1px solid #fecaca;background:#fff7f7;border-radius:10px;margin-bottom:8px;font-size:13px;">'
                    + '<b>' + (k === 'link' ? 'SokoPay link' : 'Oda') + ' #' + id + '</b> · ' + money(d.amount) + '<br>'
                    + 'Imefunguliwa na: ' + esc(d.openedByRole || '') + ' · ' + esc(String(d.createdAt || '').slice(0, 16).replace('T', ' ')) + '<br>'
                    + 'Sababu: ' + esc(d.reason || '') + '<br>'
                    + btn('Mpe muuzaji', "window.skhAdminCCResolve('" + k + "','" + id + "','release_seller')")
                    + btn('Mrudishie mnunuzi', "window.skhAdminCCResolve('" + k + "','" + id + "','refund_buyer')", 'plain')
                    + btn('Gawanya', "window.skhAdminCCResolve('" + k + "','" + id + "','split')", 'plain') + '</div>';
            }).join('') : empty('Hakuna migogoro iliyo wazi.')));
    };
    window.skhAdminCCResolve = async function (kind, id, outcome) {
        var payload = kind === 'link' ? { linkId: id } : { orderId: id };
        payload.outcome = outcome;
        if (outcome === 'split') {
            var b = await ask('Kiasi (TSh) cha kumrudishia MNUNUZI. Kilichobaki kitaenda kwa muuzaji:');
            payload.buyerAmount = Number(String(b || '').replace(/[^0-9.]/g, ''));
            if (!(payload.buyerAmount >= 0)) { toast('Kiasi si sahihi.', 'error'); return; }
        }
        if (!(await confirmIt('Uamuzi huu unalipa kutoka escrow na HAUWEZI kubadilishwa. Endelea?'))) return;
        var reason = await needReason(10); if (!reason) return;
        payload.reason = reason;
        try { await run('adminResolveDispute', payload); toast('Uamuzi umetekelezwa.', 'success'); window.skhAdminCCTab('disputes'); }
        catch (e) { toast(errText(e), 'error'); }
    };

    /* [P5-C2 2026-11-10] Foleni ya maombi ya kutoa pesa. 'paid' = admin
     * AMESHATUMA pesa nje (M-Pesa/benki mwongozo) — server hufunga ombi tu
     * (salio lilishakatwa wakati wa request). 'rejected' = server hurudisha
     * salio + ledger. Kila uamuzi una sababu + audit entry. */
    VIEWS.withdrawals = async function () {
        var rows = [];
        try {
            var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'withdrawal_requests'), skh.where('status', '==', 'pending'), skh.limit(100)));
            s.forEach(function (d) { rows.push({ id: d.id, data: d.data() || {} }); });
        } catch (e) { return box('Kutoa Pesa', empty('Hitilafu: ' + esc(errText(e)))); }
        return box('Maombi yanayosubiri (' + rows.length + ')',
            empty('Bonyeza "Nimelipa" TU BAADA ya kutuma pesa kwa mkono (M-Pesa/benki). "Kataa" hurudisha salio kwa mtumiaji moja kwa moja.')
            + (rows.length ? rows.map(function (r) {
                var d = r.data;
                return '<div style="padding:10px;border:1px solid #fde68a;background:#fffbeb;border-radius:10px;margin-bottom:8px;font-size:13px;">'
                    + '<b>' + money(d.amount) + '</b> · ' + esc(d.channel || '') + ' → ' + esc(d.account || '') + '<br>'
                    + 'Mtumiaji: ' + esc(d.userId || '') + ' · ' + esc(String(d.createdAt || '').slice(0, 16).replace('T', ' ')) + '<br>'
                    + 'Kumb: ' + esc(r.id) + '<br>'
                    + (d.awaitingSecondApproval ? '<div data-second-approval style="margin:6px 0;padding:6px 8px;border-radius:8px;background:#e0f2fe;color:#075985;"><b>Idhini ya kwanza:</b> ' + esc(d.firstApprovedBy || '') + ' · ' + esc(String(d.firstApprovedAt || '').slice(0, 16).replace('T', ' ')) + (d.firstExternalRef ? ' · Ref ' + esc(d.firstExternalRef) : '') + '<br>Inasubiri admin MWINGINE athibitishe.</div>' : '')
                    + btn(d.awaitingSecondApproval ? 'Thibitisha (idhini ya pili)' : 'Nimelipa (funga)', "window.skhAdminCCWithdrawal('" + esc(r.id) + "','paid')")
                    + btn('Kataa (rudisha salio)', "window.skhAdminCCWithdrawal('" + esc(r.id) + "','rejected')", 'danger') + '</div>';
            }).join('') : empty('Hakuna maombi yanayosubiri.')));
    };
    window.skhAdminCCWithdrawal = async function (requestId, decision) {
        var q = decision === 'paid'
            ? 'Umetuma TSh kwa mkono (M-Pesa/benki)? "Nimelipa" hufunga ombi na HAIWEZI kubadilishwa. Endelea?'
            : 'Kukataa kunarudisha salio kwa mtumiaji moja kwa moja. Endelea?';
        if (!(await confirmIt(q))) return;
        var note = await needReason(5); if (!note) return;
        var payload = { requestId: requestId, decision: decision, note: note };
        if (decision === 'paid') { var ref = String((await ask('Namba ya muamala (M-Pesa/benki) — hiari, acha wazi kama huna:')) || '').trim(); if (ref) payload.externalRef = ref.slice(0, 80); }
        try {
            var res = await run('withdrawalResolve', payload);
            if (res && res.needsSecondApproval) toast('Idhini ya kwanza imehifadhiwa. Admin MWINGINE athibitishe kabla pesa haijahesabiwa imelipwa.', 'info');
            else if (res && res.already) toast('Ombi hili lilishafungwa na mtu mwingine (' + (res.status || '') + ').', 'info');
            else toast(decision === 'paid' ? 'Ombi limefungwa (paid).' : 'Ombi limekataliwa; salio limerudishwa.', 'success');
            window.skhAdminCCTab('withdrawals');
        } catch (e) { toast(errText(e), 'error'); }
    };

    VIEWS.verify = async function () {
        /* [R16] maombi ya utambulisho ya watumiaji (hati za siri; kiungo cha muda kwa admin tu) */
        var q = { requests: [] }; try { q = await run('adminVerificationQueue', { status: 'pending' }); } catch (e) {}
        var DT = { national_id: 'Kitambulisho (NIDA)', passport: 'Pasipoti', driving_license: 'Leseni ya udereva', business_license: 'Leseni ya biashara', tin_certificate: 'Cheti cha TIN' };
        var rows = (q.requests || []).map(function (r) {
            return '<div data-idv-uid="' + esc(r.uid) + '" style="border:1px solid #eef2f1;border-radius:12px;padding:10px;margin-bottom:8px;">'
                + '<b>' + esc(DT[r.docType] || r.docType) + '</b> · ****' + esc(r.last4) + ' · picha ' + r.docs + '<br><small style="color:#64748b;">' + esc(r.uid) + ' · ' + esc(String(r.submittedAt || '').slice(0, 16).replace('T', ' ')) + (r.attempts > 1 ? ' · jaribio la ' + r.attempts : '') + '</small>'
                + '<div id="ccIdvDocs_' + esc(r.uid) + '"></div>'
                + btn('Tazama hati', "window.skhAdminIdvDocs('" + esc(r.uid) + "')", 'plain')
                + btn('Idhinisha', "window.skhAdminIdvDecide('" + esc(r.uid) + "','approve')")
                + btn('Kataa', "window.skhAdminIdvDecide('" + esc(r.uid) + "','reject')", 'danger') + '</div>';
        }).join('');
        return box('Maombi ya uthibitisho wa utambulisho (' + (q.requests || []).length + ')', rows || empty('Hakuna ombi linalosubiri.'))
            + box('Thibitisha au ondoa uthibitisho',
            '<label style="font-size:13px;">Aina</label><select id="ccVKind" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin:4px 0 8px;">'
            + '<option value="seller">Muuzaji (UID)</option><option value="driver">Dereva (drivers ID)</option><option value="transport">Msafirishaji (transport_profiles ID)</option>'
            + '<option value="logistics">Kampuni ya usafirishaji (logistics_companies ID)</option><option value="service">Huduma (services ID)</option></select>'
            + input('ccVId', 'ID ya rekodi')
            + btn('Thibitisha', "window.skhAdminCCVerify(document.getElementById('ccVKind').value, document.getElementById('ccVId').value, true)")
            + btn('Ondoa uthibitisho', "window.skhAdminCCVerify(document.getElementById('ccVKind').value, document.getElementById('ccVId').value, false)", 'plain'));
    };
    window.skhAdminIdvDocs = async function (uid) {
        var host = document.getElementById('ccIdvDocs_' + uid); if (!host) return;
        try {
            var r = await run('adminVerificationDocUrls', { uid: uid });
            host.innerHTML = r.configured ? (r.urls || []).map(function (u) { return '<a href="' + esc(u.url) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:6px 8px 0 0;font-size:12px;">' + esc(u.side) + '</a>'; }).join('')
                : '<small style="color:#b45309;">Viungo salama havijatengenezwa: CLOUDINARY_* haijasanidiwa kwenye server.</small>';
        } catch (e) { host.innerHTML = '<small style="color:#b91c1c;">' + esc(errText(e)) + '</small>'; }
    };
    window.skhAdminIdvDecide = async function (uid, decision) {
        var reason = await needReason(5); if (!reason) return;
        try { await run('adminVerificationDecide', { uid: uid, decision: decision, reason: reason }); toast(decision === 'approve' ? 'Imethibitishwa.' : 'Imekataliwa.', 'success'); window.skhAdminCCTab('verify'); }
        catch (e) { toast(errText(e), 'error'); }
    };
    window.skhAdminCCVerify = async function (kind, id, verified) {
        id = String(id || '').trim(); if (!id) { toast('Weka ID.', 'error'); return; }
        var reason = await needReason(3); if (!reason) return;
        try { await run('adminSetVerification', { kind: kind, id: id, verified: verified === true, reason: reason }); toast(verified ? 'Imethibitishwa.' : 'Uthibitisho umeondolewa.', 'success'); }
        catch (e) { toast(errText(e), 'error'); }
    };

    /* [R9] Four distinct trust badges — server callable adminSetTrustBadge. */
    VIEWS.trust = async function () {
        var sel = function (id, opts) { return '<select id="' + id + '" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin:4px 0 8px;">' + opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select>'; };
        return box('Beji za uaminifu (zinatolewa na server tu)',
            '<p style="font-size:12.5px;color:#475569;margin:0 0 8px;">Beji hazichanganywi: akaunti, supplier, bidhaa iliyokaguliwa, muamala. Kutoa au kurudisha kunahitaji kumbukumbu ya ushahidi.</p>'
            + '<label style="font-size:13px;">Beji</label>' + sel('ccTBadge', [['account', 'Akaunti / Biashara imethibitishwa'], ['supplier', 'Supplier aliyethibitishwa'], ['product_inspection', 'Bidhaa imekaguliwa'], ['transaction', 'Muamala umethibitishwa']])
            + '<label style="font-size:13px;">Aina ya rekodi</label>' + sel('ccTType', [['user', 'Mtumiaji (UID)'], ['business', 'Biashara (businesses ID)'], ['product', 'Bidhaa (products ID)'], ['order', 'Oda (orders ID)']])
            + input('ccTId', 'ID ya rekodi') + input('ccTEvidence', 'Kumbukumbu ya ushahidi (mf. ripoti ya ukaguzi, namba ya leseni)')
            + '<label style="font-size:13px;">Hatua</label>' + sel('ccTAction', [['grant', 'Toa'], ['suspend', 'Simamisha'], ['reinstate', 'Rudisha'], ['revoke', 'Ondoa kabisa']])
            + btn('Tekeleza', "window.skhAdminCCTrust()"));
    };
    window.skhAdminCCTrust = async function () {
        var v = function (id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
        if (!v('ccTId')) { toast('Weka ID.', 'error'); return; }
        var reason = await needReason(5); if (!reason) return;
        try {
            var r = await run('adminSetTrustBadge', { badge: v('ccTBadge'), targetType: v('ccTType'), targetId: v('ccTId'), action: v('ccTAction'), evidenceRef: v('ccTEvidence'), reason: reason });
            toast('Beji: ' + ((r && r.status) || 'imesasishwa'), 'success');
        } catch (e) { toast(errText(e), 'error'); }
    };

    VIEWS.listings = async function () {
        return box('Ficha au rudisha tangazo',
            '<select id="ccLCol" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin:4px 0 8px;"><option value="products">Bidhaa</option><option value="services">Huduma</option></select>'
            + input('ccLId', 'ID ya tangazo')
            + btn('Ficha tangazo', "window.skhAdminCCListing('hide')", 'danger') + btn('Rudisha tangazo', "window.skhAdminCCListing('restore')", 'plain')
            + empty('Mmiliki hupokea arifa yenye sababu yako. Tangazo halifutwi — linafichwa tu.'))
            // [SOKOHURU 2026-11-21] listing reports + paid promotion requests (manual payment verification)
            + (window.skhLaunch && typeof window.skhLaunch.adminSectionHtml === 'function' ? await window.skhLaunch.adminSectionHtml() : '');
    };
    window.skhAdminCCListing = async function (action) {
        var id = val('ccLId'); if (!id) { toast('Weka ID ya tangazo.', 'error'); return; }
        var reason = await needReason(5); if (!reason) return;
        var col = val('ccLCol') || 'products';
        try { await run('adminModerateListing', { collection: col, id: id, action: action, reason: reason }); toast(action === 'hide' ? 'Tangazo limefichwa.' : 'Tangazo limerudishwa.', 'success'); }
        catch (e) {
            // [SOKOHURU 2026-11-21] Cloud Functions not deployed yet: products are moderated from the browser with an
            // append-only audit record in the same write (firestore.rules moderationAuditOk). Services still need the server.
            var kind = skh.fnErrorKind ? skh.fnErrorKind(e) : 'server';
            if (col === 'products' && (kind === 'missing' || kind === 'unreachable') && window.skhLaunch && window.skhLaunch.moderateProduct) {
                try { await window.skhLaunch.moderateProduct(id, action, reason); toast(action === 'hide' ? 'Tangazo limefichwa (kumbukumbu imehifadhiwa).' : 'Tangazo limerudishwa (kumbukumbu imehifadhiwa).', 'success'); }
                catch (e2) { toast(errText(e2), 'error'); }
                return;
            }
            toast(errText(e), 'error');
        }
    };

    VIEWS.policy = async function () {
        var cfg = {};
        try { var s = await skh.getDoc(skh.doc(skh.db, 'system', 'config')); cfg = (s.exists() && s.data()) || {}; } catch (e) {}
        var e = cfg.escrow || {}, f = cfg.features || {};
        function num(id, label, v, help) {
            return '<label style="font-size:13px;font-weight:700;">' + label + '</label>' + '<input id="' + id + '" type="number" min="0" max="720" value="' + (v == null ? '' : esc(v)) + '" placeholder="Tupu = imezimwa" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin:4px 0 2px;">'
                + '<small style="color:#64748b;display:block;margin-bottom:10px;">' + help + '</small>';
        }
        var form = num('ccPAuto', 'Kuachia kiotomatiki baada ya makabidhiano (saa)', e.autoReleaseAfterDeliveryHours, 'Tupu = HAKUNA kuachia kiotomatiki; mnunuzi au admin pekee ndio wanaachia. Hutumika tu kukiwa na ushahidi wa server wa makabidhiano na hakuna mgogoro.')
            + num('ccPDisp', 'Muda wa kufungua mgogoro baada ya makabidhiano (saa)', e.disputeWindowHours, 'Tupu = mgogoro unaruhusiwa wakati wowote fedha zikiwa escrow.')
            + num('ccPLink', 'Kuachia SokoPay link kiotomatiki (saa tangu malipo)', e.linkAutoReleaseHours, 'Link hazina ufuatiliaji wa usafirishaji. Tupu = mnunuzi/admin pekee.')
            + num('ccPCode', 'Uhai wa Namba ya Kupokea (saa)', e.deliveryCodeTtlHours, 'Chaguo-msingi ni saa 168 (siku 7).')
            + '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:6px 0 12px;color:#64748b;"><input id="ccPGO" type="checkbox" disabled> Oda za Pamoja za makundi ya chat: IMEZIMWA (injini ya server bado haijajengwa; haiwezi kuwashwa)</label>';
        if (!ME.superAdmin) return box('Sera ya Escrow (soma tu)', empty('Super Admin pekee anaweza kubadilisha sera hii.') + form.replace(/<input /g, '<input disabled '));
        return box('Sera ya Escrow', form + btn('Hifadhi sera', 'window.skhAdminCCSavePolicy()'))
            + box('Kadi za umma za watumiaji (faragha)',
                empty('Majina, picha na maduka ya watu wengine yanasomwa kutoka "kadi za umma" (userCards) badala ya wasifu binafsi. Bonyeza mara moja baada ya kusasisha mfumo, ili watumiaji wa zamani wapate kadi. Ni salama kurudia.')
                + btn('Jaza kadi za umma sasa', 'window.skhAdminCCBackfillCards()', 'plain'));
    };
    window.skhAdminCCBackfillCards = async function () {
        if (!(await confirmIt('Kujaza kadi za umma za watumiaji wote? (Haibadilishi wasifu wowote.)'))) return;
        var total = 0, next = null, rounds = 0;
        try {
            do {
                var r = await run('adminBackfillUserCards', next ? { startAfter: next } : {});
                total += Number(r.written || 0); next = r.next || null; rounds++;
            } while (next && rounds < 200);
            toast('Kadi ' + total + ' zimesasishwa.', 'success');
        } catch (e) { toast(errText(e), 'error'); }
    };
    window.skhAdminCCSavePolicy = async function () {
        function n(id) { var v = val(id); return v === '' ? null : Number(v); }
        var payload = { escrow: { autoReleaseAfterDeliveryHours: n('ccPAuto'), disputeWindowHours: n('ccPDisp'), linkAutoReleaseHours: n('ccPLink'), deliveryCodeTtlHours: n('ccPCode') },
            features: { chatGroupOrders: !!(document.getElementById('ccPGO') || {}).checked } };
        if (!(await confirmIt('Sera mpya itaanza kutumika mara moja kwa oda zote. Endelea?'))) return;
        var reason = await needReason(10); if (!reason) return;
        payload.reason = reason;
        try { await run('adminSetEscrowPolicy', payload); toast('Sera imehifadhiwa.', 'success'); window.skhAdminCCTab('policy'); }
        catch (e) { toast(errText(e), 'error'); }
    };

    VIEWS.audit = async function () {
        var rows = [];
        try { rows = (await run('adminAuditQuery', { limit: 80 })).rows || []; }
        catch (e) { return box('Kumbukumbu za ukaguzi', empty('Hitilafu: ' + esc(errText(e)))); }
        return box('Vitendo 80 vya mwisho vya admin',
            rows.length ? '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="text-align:left;color:#64748b;">'
                + '<th style="padding:6px;">Wakati</th><th style="padding:6px;">Kitendo</th><th style="padding:6px;">Aliyefanya</th><th style="padding:6px;">Lengo</th><th style="padding:6px;">Sababu</th></tr></thead><tbody>'
                + rows.map(function (r) {
                    var d = r.details || {}, t = r.target || {};
                    return '<tr style="border-top:1px solid #eef2f1;"><td style="padding:6px;white-space:nowrap;">' + esc(String(r.createdAt || '').slice(0, 16).replace('T', ' ')) + '</td>'
                        + '<td style="padding:6px;"><b>' + esc(r.action) + '</b></td><td style="padding:6px;">' + esc(r.actorEmail || r.actorUid || '') + '</td>'
                        + '<td style="padding:6px;">' + esc((t.kind || '') + ' ' + (t.id || t.uid || t.userDocId || t.agentDocId || '')) + '</td>'
                        + '<td style="padding:6px;">' + esc(d.reason || d.note || '') + '</td></tr>';
                }).join('') + '</tbody></table></div>' : empty('Bado hakuna kumbukumbu.'));
    };

    /* [R14 2026-11-13] MINADA — dashibodi ya admin ya minada. Data na vitendo vyote vinapitia
       callables za server (adminAuctionsList / adminAuctionDetail / adminAuctionAction /
       auctionCancel): server inathibitisha u-admin na kuandika admin_audit_log. Malipo
       HAYAWEKWI kwa mkono — server pekee huthibitisha oda halisi ya mnada. */
    var AUC_ST = { all: 'Zote', active: 'Zinaendelea', paused: 'Zimesitishwa', closing: 'Zinafungwa', scheduled: 'Zijazo',
        awaiting_payment: 'Zinasubiri malipo', payment_expired: 'Malipo yamechelewa', paid: 'Zimelipwa', unsold: 'Hazikuuzwa', cancelled: 'Zimeghairiwa' };
    var AUC_F = 'all';
    function dt(ms) { return ms ? new Date(Number(ms)).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }
    function stPill(st) {
        var c = { active: '#dcfce7', paused: '#fef9c3', closing: '#e0f2fe', scheduled: '#f1f5f9', awaiting_payment: '#fef3c7', payment_expired: '#fee2e2', paid: '#d1fae5', unsold: '#f1f5f9', cancelled: '#fee2e2' }[st] || '#f1f5f9';
        return '<span style="background:' + c + ';border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;color:#18352D;">' + esc(AUC_ST[st] || st) + '</span>';
    }
    VIEWS.auctions = async function () {
        var r = await run('adminAuctionsList', { status: AUC_F });
        var chips = Object.keys(AUC_ST).map(function (k) {
            var n = k === 'all' ? r.total : (r.counts[k] || 0), on = k === AUC_F;
            return '<button type="button" onclick="window.skhAdminAucFilter(\'' + k + '\')" style="padding:6px 10px;border-radius:999px;border:1px solid ' + (on ? '#17604E' : '#D5E2DE') + ';background:' + (on ? '#17604E' : '#fff') + ';color:' + (on ? '#fff' : '#18352D') + ';font-size:12px;font-weight:700;cursor:pointer;">' + esc(AUC_ST[k]) + ' ' + n + '</button>';
        }).join('');
        var rows = (r.auctions || []).map(function (a) {
            return '<tr style="border-top:1px solid #eef2f1;"><td style="padding:8px 6px;"><b>' + esc(a.title || a.id) + '</b><br><small style="color:#64748b;">' + esc(a.sellerName || a.sellerId || '') + '</small></td>'
                + '<td style="padding:8px 6px;">' + stPill(a.status) + '</td>'
                + '<td style="padding:8px 6px;white-space:nowrap;">' + money(a.currentBid || a.startPrice) + '<br><small style="color:#64748b;">' + a.totalBids + ' zabuni · ' + a.bidderCount + ' wazabuni</small></td>'
                + '<td style="padding:8px 6px;white-space:nowrap;"><small>Mwisho: ' + esc(dt(a.endTime)) + (a.paymentDeadline ? '<br>Malipo: ' + esc(dt(a.paymentDeadline)) : '') + '</small></td>'
                + '<td style="padding:8px 6px;">' + btn('Fungua', "window.skhAdminAucOpen('" + esc(a.id) + "')", 'plain') + '</td></tr>';
        }).join('');
        return box('Minada', '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' + chips + '</div>'
            + (rows ? '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#64748b;font-size:11.5px;"><th style="padding:6px;">Mnada</th><th style="padding:6px;">Hali</th><th style="padding:6px;">Zabuni</th><th style="padding:6px;">Muda</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : empty('Hakuna mnada kwenye kundi hili.')))
            + '<div id="ccAucDetail"></div>';
    };
    /* [R16] GROUP BUY — kampeni zote + sera ya malipo (adminGroupBuyList / adminSetGroupBuyPolicy /
       groupBuyCancel / groupBuySettleNow). Pesa halisi (escrow_commit) inawashwa na Super Admin pekee. */
    var GB_ST = { active: 'Zinaendelea', successful: 'Zimefanikiwa', failed: 'Hazikufikia lengo', cancelled: 'Zimeghairiwa', closed: 'Zimefungwa' };
    VIEWS.groupbuy = async function () {
        var r = await run('adminGroupBuyList', {});
        var pol = r.policy || {};
        var rows = (r.campaigns || []).map(function (c) {
            var acts = btn('Sasisha hali', "window.skhAdminGbSettle('" + esc(c.id) + "')", 'plain')
                + (['active', 'successful'].indexOf(c.status) !== -1 && !c.ordersCreated ? btn('Ghairi', "window.skhAdminGbCancel('" + esc(c.id) + "')", 'danger') : '');
            return '<tr style="border-top:1px solid #eef2f1;"><td style="padding:8px 6px;"><b>' + esc(c.title || c.id) + '</b><br><small style="color:#64748b;">' + money(c.price) + '</small></td>'
                + '<td style="padding:8px 6px;">' + esc(GB_ST[c.status] || c.status) + '</td>'
                + '<td style="padding:8px 6px;white-space:nowrap;">' + c.joined + '/' + c.target + '</td>'
                + '<td style="padding:8px 6px;white-space:nowrap;"><small>Mwisho: ' + esc(dt(c.endTime)) + (c.paymentDeadline ? '<br>Malipo: ' + esc(dt(c.paymentDeadline)) : '') + '</small></td>'
                + '<td style="padding:8px 6px;">' + acts + '</td></tr>';
        }).join('');
        var mode = pol.effectiveMode === 'escrow_commit' ? 'Ahadi ya malipo kwenye escrow (pesa halisi IMEIDHINISHWA)' : 'Lipa baada ya lengo kufikiwa (salama, hakuna pesa wakati wa kampeni)';
        return box('Sera ya Group Buy', '<p style="margin:0 0 6px;font-size:13px;">Hali ya sasa: <b data-gb-mode="' + esc(pol.effectiveMode) + '">' + esc(mode) + '</b></p>'
                + '<p style="margin:0 0 8px;font-size:12px;color:#64748b;">Dirisha la malipo: saa ' + esc(pol.paymentWindowHours) + ' · Kampeni ndefu zaidi: siku ' + esc(pol.maxCampaignDays) + ' · Wanachama wa juu: ' + esc(pol.maxParticipants)
                + ' · Ombi la escrow: ' + esc(pol.paymentMode) + (pol.realMoneyApproved ? ' (imeidhinishwa)' : ' (haijaidhinishwa)') + '</p>'
                + input('ccGbWindow', 'Saa za kulipia (1-168)', 'number') + input('ccGbReason', 'Sababu ya mabadiliko (herufi 10+)')
                + btn('Hifadhi dirisha la malipo', 'window.skhAdminGbPolicy()')
                + (ME.superAdmin ? btn(pol.realMoneyApproved ? 'Zima pesa halisi (escrow_commit)' : 'Idhinisha pesa halisi (escrow_commit)', 'window.skhAdminGbMoney(' + (pol.realMoneyApproved ? 'false' : 'true') + ')', pol.realMoneyApproved ? 'danger' : 'plain') : '<small style="display:block;color:#64748b;">Pesa halisi inaidhinishwa na Super Admin (mmiliki) pekee.</small>'))
            + box('Kampeni (' + (r.campaigns || []).length + ')', rows ? '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#64748b;font-size:11.5px;"><th>Bidhaa</th><th>Hali</th><th>Watu</th><th>Muda</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : empty('Hakuna kampeni za Group Buy.'));
    };
    window.skhAdminGbPolicy = async function () {
        try { await run('adminSetGroupBuyPolicy', { paymentWindowHours: Number(val('ccGbWindow')), reason: val('ccGbReason') }); window.skhAdminCCTab('groupbuy'); }
        catch (e) { alert('Imeshindikana: ' + (e && e.message)); }
    };
    window.skhAdminGbMoney = async function (on) {
        var reason = window.skhPrompt ? await window.skhPrompt(on ? 'Unaidhinisha wanachama kuweka pesa halisi kwenye escrow wanapojiunga. Andika sababu (herufi 10+):' : 'Sababu ya kuzima (herufi 10+):') : prompt('Sababu');
        if (!reason) return;
        try { await run('adminSetGroupBuyPolicy', on ? { paymentMode: 'escrow_commit', realMoneyApproved: true, reason: reason } : { realMoneyApproved: false, reason: reason }); window.skhAdminCCTab('groupbuy'); }
        catch (e) { alert('Imeshindikana: ' + (e && e.message)); }
    };
    window.skhAdminGbSettle = async function (pid) {
        try { var r = await run('groupBuySettleNow', { productId: pid }); alert('Hali: ' + (r.status || 'haijabadilika')); window.skhAdminCCTab('groupbuy'); }
        catch (e) { alert('Imeshindikana: ' + (e && e.message)); }
    };
    window.skhAdminGbCancel = async function (pid) {
        var reason = window.skhPrompt ? await window.skhPrompt('Sababu ya kughairi kampeni (wanachama wataarifiwa, ahadi zote zinarudishwa):') : prompt('Sababu');
        if (!reason) return;
        try { await run('groupBuyCancel', { productId: pid, reason: reason }); window.skhAdminCCTab('groupbuy'); }
        catch (e) { alert('Imeshindikana: ' + (e && e.message)); }
    };
    window.skhAdminAucFilter = function (k) { AUC_F = k; window.skhAdminCCTab('auctions'); };
    window.skhAdminAucOpen = async function (pid) {
        var out = document.getElementById('ccAucDetail'); if (!out) return;
        out.innerHTML = empty('Inapakia mnada…');
        try {
            var r = await run('adminAuctionDetail', { productId: pid }), a = r.auction;
            var acts = [];
            if (a.status === 'closing') acts.push(btn('Funga mnada sasa', "window.skhAdminAucAct('" + esc(pid) + "','finalize')"));
            if (a.status === 'payment_expired') acts.push(btn('Mpe anayefuata nafasi', "window.skhAdminAucAct('" + esc(pid) + "','second_chance')"));
            if (a.status === 'awaiting_payment' || a.status === 'payment_expired') acts.push(btn('Ongeza muda wa malipo', "window.skhAdminAucAct('" + esc(pid) + "','extend_payment')", 'plain'));
            if (['active', 'paused', 'scheduled', 'closing'].indexOf(a.status) !== -1) acts.push(btn('Ghairi mnada', "window.skhAdminAucCancel('" + esc(pid) + "')", 'danger'));
            out.innerHTML = box('Mnada: ' + esc(a.title || pid) + ' ' + stPill(a.status),
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;font-size:12.5px;margin-bottom:10px;">'
                + '<div>Bei ya kuanzia<br><b>' + money(a.startPrice) + '</b></div><div>Zabuni ya juu<br><b>' + money(a.currentBid) + '</b></div>'
                + '<div>Mshindi<br><b>' + esc(a.winnerName || a.winnerId || '—') + '</b>' + (a.winnerBid ? ' · ' + money(a.winnerBid) : '') + (a.winnerRound > 1 ? ' (raundi ' + a.winnerRound + ')' : '') + '</div>'
                + '<div>Malipo<br><b>' + (a.winnerPaid ? 'Yamethibitishwa (' + esc(a.paidOrderId || '') + ')' : a.paymentDeadline ? 'Hadi ' + esc(dt(a.paymentDeadline)) : '—') + '</b></div>'
                + '<div>Stock<br><b>' + (a.stock == null ? '—' : a.stock) + '</b></div><div>Nyongeza za muda<br><b>' + a.extensions + '</b></div></div>'
                + (r.paidOrderFound && !a.winnerPaid ? '<p style="background:#ecfdf5;border-radius:10px;padding:8px;font-size:12.5px;">Server imepata oda ya malipo <b>' + esc(r.paidOrderFound) + '</b> — itathibitishwa na mshindi au sweep.</p>' : '')
                + (a.cancelled ? '<p style="background:#fee2e2;border-radius:10px;padding:8px;font-size:12.5px;">Imeghairiwa: ' + esc(a.cancelReason || '') + '</p>' : '')
                + (acts.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' + acts.join('') + '</div>' : '')
                + '<h4 style="margin:10px 0 6px;font-size:13px;">Zabuni (' + r.bids.length + ')</h4>'
                + (r.bids.length ? '<ol style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.6;">' + r.bids.map(function (b) { return '<li>' + money(b.amount) + ' — ' + esc(b.name || b.uid || '') + ' <small style="color:#64748b;">' + esc(String(b.at || '').slice(0, 16).replace('T', ' ')) + '</small></li>'; }).join('') + '</ol>' : empty('Hakuna zabuni.'))
                + '<h4 style="margin:10px 0 6px;font-size:13px;">Oda za mshindi kwa bidhaa hii</h4>'
                + (r.winnerOrders.length ? r.winnerOrders.map(function (o) { return '<div style="font-size:12.5px;">' + esc(o.id) + ' · ' + esc(o.status || '') + ' · ' + money(o.amount) + (o.commerceMode ? ' · ' + esc(o.commerceMode) : '') + '</div>'; }).join('') : empty('Hakuna.'))
                + '<h4 style="margin:10px 0 6px;font-size:13px;">Historia ya mnada</h4>'
                + (r.events.length ? '<ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.6;">' + r.events.map(function (e) { return '<li><b>' + esc(e.type || '') + '</b> <small style="color:#64748b;">' + esc(String(e.at || '').slice(0, 16).replace('T', ' ')) + (e.reason ? ' · ' + esc(e.reason) : '') + '</small></li>'; }).join('') + '</ul>' : empty('Hakuna matukio.')));
            out.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) { out.innerHTML = empty('Hitilafu: ' + esc(errText(e))); }
    };
    window.skhAdminAucAct = async function (pid, action) {
        var data = { productId: pid, action: action };
        if (action === 'extend_payment') {
            var h = Number(await ask('Ongeza saa ngapi? (1 hadi 72)'));
            if (!(h >= 1 && h <= 72)) { toast('Weka saa kati ya 1 na 72.', 'error'); return; }
            data.hours = h;
        }
        var reason = await needReason(5); if (!reason) return;
        data.reason = reason;
        try { await run('adminAuctionAction', data); toast('Kitendo kimefanyika na kuhifadhiwa kwenye kumbukumbu.', 'success'); }
        catch (e) { toast('Hitilafu: ' + errText(e), 'error'); }
        await window.skhAdminCCTab('auctions'); window.skhAdminAucOpen(pid);
    };
    window.skhAdminAucCancel = async function (pid) {
        if (!(await confirmIt('Ghairi mnada huu? Zabuni zitabaki kama historia; hakuna mshindi.'))) return;
        var reason = await needReason(5); if (!reason) return;
        try { await run('auctionCancel', { productId: pid, reason: reason }); toast('Mnada umeghairiwa.', 'success'); }
        catch (e) { toast('Hitilafu: ' + errText(e), 'error'); }
        await window.skhAdminCCTab('auctions'); window.skhAdminAucOpen(pid);
    };

    window.skhAdminCCTab = async function (t) {
        TAB = t || 'overview';
        loading();
        var html = '';
        try { html = await (VIEWS[TAB] || VIEWS.overview)(); } catch (e) { html = empty('Hitilafu: ' + esc(errText(e))); }
        render(html);
    };

    /* `tab` ni hiari (ADDITIVE): wito wa zamani `skhOpenAdminControlCenter()`
       unaendelea kufungua 'overview' kama awali; Business OS sidebar inaweza
       kufungua sub-view mahususi (accounts | verify | audit | policy ...). */
    window.skhOpenAdminControlCenter = async function (tab) {
        var m = modal(); m.style.display = 'flex';
        loading();
        try { var w = await run('adminWhoAmI', {}); ME = { admin: !!w.admin, superAdmin: !!w.superAdmin }; }
        catch (e) { ME = { admin: false, superAdmin: false }; }
        if (!ME.admin) { render(box('Hakuna ruhusa', empty('Server haikutambui kama admin. Hakikisha umeingia kwa akaunti ya admin yenye barua pepe iliyothibitishwa, kisha ujaribu tena.'))); return; }
        window.skhAdminCCTab(tab && VIEWS[tab] ? tab : 'overview');
    };

    // Kitufe ndani ya dashibodi ya admin iliyopo (bila kubadilisha muundo wake).
    var _prevLoadAdmin = window.loadAdminDashboard;
    window.loadAdminDashboard = async function () {
        var loading = typeof _prevLoadAdmin === 'function' ? _prevLoadAdmin.apply(this, arguments) : null;
        var renderSeq = skh._dashboardRenderSeq;
        if (loading) await loading;
        setTimeout(function () {
            if (skh.currentMode !== 'admin' || skh._dashboardRenderSeq !== renderSeq) return;
            var ws = document.getElementById('richDashboardContainer');
            if (!ws || document.getElementById('skhAdminCCBtn')) return;
            var host = document.createElement('div');
            host.style.cssText = 'margin:0 0 16px;';
            host.innerHTML = '<button type="button" id="skhAdminCCBtn" onclick="window.skhOpenAdminControlCenter()" style="width:100%;padding:14px 16px;background:#17604E;color:#fff;border:none;border-radius:14px;font-weight:900;font-size:14px;cursor:pointer;text-align:left;">'
                + 'Kituo cha Udhibiti wa Admin<br><small style="font-weight:600;opacity:.85;">Akaunti · Mawakala · Ukaguzi wa bei · Migogoro · Sera ya escrow · Kumbukumbu</small></button>';
            ws.insertBefore(host, ws.firstChild);
        }, 250);
    };
})();

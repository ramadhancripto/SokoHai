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
        ['disputes', 'Migogoro'], ['verify', 'Uthibitisho'], ['listings', 'Matangazo'], ['policy', 'Sera ya Escrow'], ['audit', 'Kumbukumbu']
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
        var counts = { price: '—', disputes: '—', legacy: '—', agentsPending: '—' };
        try { counts.price = (await skh.getDocs(skh.query(skh.collection(skh.db, 'orders'), skh.where('paymentStatus', '==', 'price_review'), skh.limit(200)))).size; } catch (e) {}
        try { counts.disputes = (await skh.getDocs(skh.query(skh.collection(skh.db, 'disputes'), skh.where('status', '==', 'open'), skh.limit(200)))).size; } catch (e) {}
        try {
            var s = await skh.getDocs(skh.query(skh.collection(skh.db, 'users'), skh.where('isApprovedAgent', '==', true), skh.limit(300)));
            var n = 0; s.forEach(function (d) { if (!(d.data() || {}).agentApprovedBy) n++; }); counts.legacy = n;
        } catch (e) {}
        try { counts.agentsPending = (await skh.getDocs(skh.query(skh.collection(skh.db, 'agents'), skh.where('status', '==', 'pending'), skh.limit(200)))).size; } catch (e) {}
        function tile(label, v, tab) {
            return '<button type="button" onclick="window.skhAdminCCTab(\'' + tab + '\')" style="text-align:left;border:1px solid #D5E2DE;background:#f8fbfa;border-radius:14px;padding:12px;cursor:pointer;">'
                + '<small style="color:#64748b;">' + label + '</small><div style="font-size:22px;font-weight:900;color:#17604E;">' + esc(v) + '</div></button>';
        }
        return box('Kazi zinazosubiri', '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">'
            + tile('Oda kwenye ukaguzi wa bei', counts.price, 'prices')
            + tile('Migogoro iliyo wazi', counts.disputes, 'disputes')
            + tile('Mawakala wa zamani wa kuhakikiwa upya', counts.legacy, 'agents')
            + tile('Maombi mapya ya uwakala', counts.agentsPending, 'agents') + '</div>')
            + box('Kumbuka', '<ul style="margin:0;padding-left:18px;color:#334155;font-size:13px;line-height:1.6;">'
                + '<li>Fedha za escrow hazitolewi bila uthibitisho wa server (mnunuzi, namba ya kupokea au Token C).</li>'
                + '<li>Uamuzi wa mgogoro unalipa kutoka escrow iliyothibitishwa tu — hauwezi kulipa mara mbili.</li>'
                + '<li>Maombi mapya ya uwakala yanaidhinishwa kwenye orodha ya "Maombi ya Wawakala" ya dashibodi kuu.</li></ul>');
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

    VIEWS.verify = async function () {
        return box('Thibitisha au ondoa uthibitisho',
            '<label style="font-size:13px;">Aina</label><select id="ccVKind" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin:4px 0 8px;">'
            + '<option value="seller">Muuzaji (UID)</option><option value="driver">Dereva (drivers ID)</option><option value="transport">Msafirishaji (transport_profiles ID)</option>'
            + '<option value="logistics">Kampuni ya usafirishaji (logistics_companies ID)</option><option value="service">Huduma (services ID)</option></select>'
            + input('ccVId', 'ID ya rekodi')
            + btn('Thibitisha', "window.skhAdminCCVerify(document.getElementById('ccVKind').value, document.getElementById('ccVId').value, true)")
            + btn('Ondoa uthibitisho', "window.skhAdminCCVerify(document.getElementById('ccVKind').value, document.getElementById('ccVId').value, false)", 'plain'));
    };
    window.skhAdminCCVerify = async function (kind, id, verified) {
        id = String(id || '').trim(); if (!id) { toast('Weka ID.', 'error'); return; }
        var reason = await needReason(3); if (!reason) return;
        try { await run('adminSetVerification', { kind: kind, id: id, verified: verified === true, reason: reason }); toast(verified ? 'Imethibitishwa.' : 'Uthibitisho umeondolewa.', 'success'); }
        catch (e) { toast(errText(e), 'error'); }
    };

    VIEWS.listings = async function () {
        return box('Ficha au rudisha tangazo',
            '<select id="ccLCol" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin:4px 0 8px;"><option value="products">Bidhaa</option><option value="services">Huduma</option></select>'
            + input('ccLId', 'ID ya tangazo')
            + btn('Ficha tangazo', "window.skhAdminCCListing('hide')", 'danger') + btn('Rudisha tangazo', "window.skhAdminCCListing('restore')", 'plain')
            + empty('Mmiliki hupokea arifa yenye sababu yako. Tangazo halifutwi — linafichwa tu.'));
    };
    window.skhAdminCCListing = async function (action) {
        var id = val('ccLId'); if (!id) { toast('Weka ID ya tangazo.', 'error'); return; }
        var reason = await needReason(5); if (!reason) return;
        try { await run('adminModerateListing', { collection: val('ccLCol') || 'products', id: id, action: action, reason: reason }); toast(action === 'hide' ? 'Tangazo limefichwa.' : 'Tangazo limerudishwa.', 'success'); }
        catch (e) { toast(errText(e), 'error'); }
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

    window.skhAdminCCTab = async function (t) {
        TAB = t || 'overview';
        loading();
        var html = '';
        try { html = await (VIEWS[TAB] || VIEWS.overview)(); } catch (e) { html = empty('Hitilafu: ' + esc(errText(e))); }
        render(html);
    };

    window.skhOpenAdminControlCenter = async function () {
        var m = modal(); m.style.display = 'flex';
        loading();
        try { var w = await run('adminWhoAmI', {}); ME = { admin: !!w.admin, superAdmin: !!w.superAdmin }; }
        catch (e) { ME = { admin: false, superAdmin: false }; }
        if (!ME.admin) { render(box('Hakuna ruhusa', empty('Server haikutambui kama admin. Hakikisha umeingia kwa akaunti ya admin yenye barua pepe iliyothibitishwa, kisha ujaribu tena.'))); return; }
        window.skhAdminCCTab('overview');
    };

    // Kitufe ndani ya dashibodi ya admin iliyopo (bila kubadilisha muundo wake).
    var _prevLoadAdmin = window.loadAdminDashboard;
    window.loadAdminDashboard = async function () {
        if (typeof _prevLoadAdmin === 'function') await _prevLoadAdmin.apply(this, arguments);
        setTimeout(function () {
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

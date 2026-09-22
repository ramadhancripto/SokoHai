/* ================================================================
 * 73-group-soga.js — [R20 SHARED SOGA ya VIKUNDI 2026-09-17]
 * FOUNDER SPEC §9–§14:
 *   - Group = sehemu ya watu waliounganishwa tayari — inafunguliwa
 *     kutoka SOGA > VIKUNDI; Discover inawaleta watu hapa kupitia
 *     Join/Invite (§6/§16).
 *   - SHARED CONTEXT: group doc + conversations doc zinabeba
 *     sharedContext {type, contextId, createdBy, participants} —
 *     chat HAIHESABU bei/thresholds: kila hesabu imo engines zao
 *     (07-product ya Group Buy; wholesale ya 39; transport ya 20).
 *   - Session data HALISI: messages subcollection ya
 *     conversations/conv_group_{gid} (doc ya pamoja — §44 no dup).
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    if (window.__skhGroupSogaBoot) return;
    window.__skhGroupSogaBoot = true;

    function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }
    function esc(s) { return skh.skhEscape(String(s == null ? '' : s)); }
    function uid() { return (skh.currentUser && skh.currentUser.uid) || ''; }
    function myName() { return (skh.currentUserData && (skh.currentUserData.fullName || skh.currentUserData.displayName)) || (skh.currentUser && skh.currentUser.email) || tk('me', 'Mimi'); }
    function gRef(gid) { return skh.doc(skh.db, 'chatGroups', gid); }
    function mRef(gid, muid) { return skh.doc(skh.db, 'chatGroups/' + gid + '/members', muid); }
    function cRef(gid) { return skh.doc(skh.db, 'conversations', 'conv_group_' + gid); }
    function msgsCol(gid) { return skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'); }
    function nowIso() { return new Date().toISOString(); }

    var CUR = { gid: null };
    var unsubMsgs = null;
    var unsubGO = null;
    function unsubscribeMsgs() {
        if (unsubMsgs) { try { unsubMsgs(); } catch (e) {} unsubMsgs = null; }
        if (unsubConv) { try { unsubConv(); } catch (e2) {} unsubConv = null; }
        if (unsubGO) { try { unsubGO(); } catch (e3) {} unsubGO = null; }
    }
    var unsubConv = null;
    // [R24] "… anaandika" — chips za typing zilizo fresh (<8s) kutoka typingMap
    function renderTypingLine(tp) {
        var el = document.getElementById('gsgTyping');
        if (!el) return;
        var names = [];
        try {
            Object.keys(tp || {}).forEach(function (k) {
                var t = tp[k];
                if (!t || t.uid === uid()) return;                 // mwenyewe haionyeshwi
                if (!t.at || (Date.now() - new Date(t.at).getTime()) > 8000) return;
                names.push(t.name || t.uid);
            });
        } catch (e) {}
        el.textContent = names.length
            ? names.slice(0, 3).join(', ') + ' ' + (names.length === 1 ? tk('ch_typing_one', 'anaandika…') : tk('ch_typing_many', 'wanaandika…'))
            : '';
    }

    /* ---------------- Conversation doc: lazy ensure (§44 deterministic) ---------------- */
    async function ensureConv(gid) {
        var cs = await skh.getDoc(cRef(gid));
        if (cs && cs.exists && cs.exists()) return cs.data();
        var members = [];
        try {
            var msnap = await skh.getDocs(skh.collection(skh.db, 'chatGroups/' + gid + '/members'));
            msnap.forEach(function (d) { var m = d.data() || {}; if (m.status === 'active') members.push(m.userId); });
        } catch (eM) {}
        var g = (await skh.getDoc(gRef(gid))).data() || {};
        await skh.setDoc(cRef(gid), {
            type: 'group', groupId: gid, name: g.name || 'Kikundi',
            participants: members, createdAt: nowIso(), updatedAt: nowIso(), lastMessageAt: null
        });
        return { participants: members };
    }

    /* ---------------- UI ---------------- */
    function buildModal() {
        var m = document.getElementById('skhGroupSogaModal');
        if (m) return m;
        m = document.createElement('div');
        m.className = 'skh-discover-overlay';
        m.id = 'skhGroupSogaModal';
        m.style.zIndex = '100010';
        document.body.appendChild(m);
        return m;
    }

    function ctxChipHtml(g) {
        var sc = g && g.sharedContext;
        var t = (sc && sc.type && sc.type !== 'GENERAL') ? sc.type : (g && g.contextType && g.contextType !== 'GENERAL' ? g.contextType : null);
        if (!t) return '';
        var label = t === 'GROUP_BUY' ? 'GROUP BUY' : t === 'WHOLESALE' ? 'WHOLESALE' : t === 'TRANSPORT' ? tk('gs_ctx_transport', 'USAFIRI') : esc(t);
        var canView = !!((sc && sc.contextId) || (g && g.contextId));
        return '<div class="skh-gs-ctx" data-act="gsg-view-ctx" '
            + 'style="display:flex;align-items:center;gap:8px;margin:8px 12px 4px;padding:8px 12px;border-radius:12px;background:#eef6fc;border:1px solid #d3e6f5;cursor:' + (canView ? 'pointer' : 'default') + ';">'
            + '<span style="width:26px;height:26px;border-radius:8px;background:#18A982;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;">⚑</span>'
            + '<div style="flex:1;min-width:0;"><b style="display:block;font-size:11.5px;color:#0B4F7A;">' + esc(label) + (sc && sc.participants ? ' · ' + sc.participants.length : '') + '</b>'
            + '<small style="color:#5b7f9a;font-size:10.5px;">' + tk('gs_ctx_sub', 'Context ya soga — engine ya commerce ndiyo inamiliki hesabu') + '</small></div>'
            + (canView ? '<span style="color:#1268A8;font-weight:800;font-size:11.5px;white-space:nowrap;">' + tk('disc_opp_view', 'Tazama') + ' ›</span>' : '')
            + '</div>';
    }

    // [R26] mentions render: @jina ya members (au @wote) → chip
    function renderMsgText(raw) {
        var txt = String(raw == null ? '' : raw);
        var names = Object.keys(CUR.__names || {}).map(function (k) { return CUR.__names[k]; });
        names = names.filter(function (n) { return n && n.length >= 2; }).sort(function (a, b) { return b.length - a.length; });
        var re = null;
        try {
            if (names.length) {
                var alts = names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
                re = new RegExp('(@wote|@(' + alts + '))', 'g');
            }
        } catch (eR) { re = null; }
        if (!re) return esc(txt);
        var last = 0, out = '', m2;
        while ((m2 = re.exec(txt))) {
            out += esc(txt.slice(last, m2.index))
                + '<span class="gsg-men" style="background:#e0f2fe;color:#0369a1;font-weight:800;border-radius:6px;padding:0 4px;">' + esc(m2[0]) + '</span>';
            last = m2.index + m2[0].length;
        }
        out += esc(txt.slice(last));
        return out;
    }

    /* [P3 §11] sender chip: initial avatar + name + role badge (no needless metadata) */
    function gsgRoleChip(uidS) {
        var role = (CUR.__roles || {})[uidS] || '';
        if (role === 'owner') return ' <span style="font-size:9px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#0B4F7A;background:#e0effa;border-radius:5px;padding:1px 5px;">' + tk('grp_owner', 'Mmilik') + '</span>';
        if (role === 'admin') return ' <span style="font-size:9px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#1268A8;background:#eef6fc;border-radius:5px;padding:1px 5px;">Admin</span>';
        if (role === 'moderator') return ' <span style="font-size:9px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#475569;background:#f1f5f9;border-radius:5px;padding:1px 5px;">Mod</span>';
        return '';
    }

    /* [P3 §12] quote kwenye jibu */
    function gsgQuoteHtml(rt, my) {
        if (!rt) return '';
        return '<div style="border-left:3px solid ' + (my ? '#18A982' : '#1268A8') + ';background:' + (my ? '#c8ecd9' : '#eef6fc') + ';border-radius:7px;padding:4px 8px;margin-bottom:5px;font-size:11px;color:#334155;">'
            + '<b style="color:' + (my ? '#0f7a5d' : '#0B4F7A') + ';">' + esc(rt.by || '') + '</b> '
            + '<span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(rt.preview || '') + '</span></div>';
    }

    /* [P3 §10] content per message type — shapes zinatofautishwa VIZUALI:
       - commerce (product) = GOLD frame §39 (gold=commerce/wholesale)
       - poll/announcement/others = blue/green frames per system colors
       SI bubbles zote sawa. */
    function gsgLinkChips(txt) {
        var out = [];
        try {
            var rx = /(https?:\/\/[^\s)<>"]{4,200})/g, mm2;
            while ((mm2 = rx.exec(String(txt || ''))) && out.length < 2) out.push(mm2[1]);
        } catch (eL) {}
        return out.map(function (u) {
            var dom = u.replace(/^https?:\/\//, '').split('/')[0];
            return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:5px;margin-top:5px;padding:5px 9px;border-radius:8px;background:#eef6fc;border:1px solid #d3e6f5;color:#0B4F7A;font-size:11px;font-weight:700;text-decoration:none;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1268A8" stroke-width="2.4" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
                + esc(dom) + '</a>';
        }).join('');
    }

    function gsgPollHtml(m, my) {
        var opts = Array.isArray(m.options) ? m.options : [];
        var votes = m.votes && typeof m.votes === 'object' ? m.votes : {};
        var total = 0;
        opts.forEach(function (o, i) { var v = votes[String(i)]; if (Array.isArray(v)) total += v.length; });
        var closed = !!m.pollClosed;
        var canManage = (CUR.__myRole === 'owner' || CUR.__myRole === 'admin');
        return '<div style="min-width:210px;max-width:270px;border:1px solid #d3e6f5;border-left:4px solid #1268A8;border-radius:13px;background:#fff;padding:10px 11px;">'
            + '<div style="display:flex;align-items:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1268A8" stroke-width="2.2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>'
            + '<b style="font-size:12px;color:#0B4F7A;">' + esc(m.question || '') + '</b></div>'
            + opts.map(function (o, i) {
                var v = votes[String(i)]; var n = Array.isArray(v) ? v.length : 0;
                var mine = Array.isArray(v) && v.indexOf(uid()) >= 0;
                var pct = total ? Math.round((n / total) * 100) : 0;
                return '<button type="button"' + (closed ? ' disabled' : '') + ' data-act="gsg-vote" data-mid="' + esc(m.__id || '') + '" data-idx="' + i + '" '
                    + 'style="position:relative;overflow:hidden;display:block;width:100%;text-align:left;margin-top:6px;padding:8px 10px;border:1.5px solid ' + (mine ? '#1268A8' : '#dbe4ed') + ';background:' + (mine ? '#e0f2fe' : '#f8fafc') + ';border-radius:10px;cursor:' + (closed ? 'not-allowed' : 'pointer') + ';font-size:12px;color:#0f172a;">'
                    + '<span style="position:absolute;left:0;top:0;bottom:0;width:' + pct + '%;background:' + (mine ? 'rgba(43,130,189,.18)' : 'rgba(148,163,184,.14)') + ';"></span>'
                    + '<span style="position:relative;">' + esc(o) + '</span>'
                    + '<span style="position:relative;float:right;font-weight:800;color:#0B4F7A;">' + (mine ? '\u2713 ' : '') + n + '</span></button>';
            }).join('')
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">'
            + '<small style="color:#64748b;font-size:10.5px;">' + total + ' ' + tk('gsg_votes', 'kura') + (closed ? ' · ' + tk('gsg_poll_closed', 'imefungwa') : '') + '</small>'
            + (canManage && !closed ? '<button type="button" data-act="gsg-poll-close" data-mid="' + esc(m.__id || '') + '" style="border:1px solid #fecaca;background:#fff;color:#dc2626;font-weight:700;font-size:10px;padding:4px 9px;border-radius:99px;cursor:pointer;">' + tk('gsg_poll_close', 'Funga kura') + '</button>' : '')
            + '</div></div>';
    }

    function gsgContentHtml(m, my) {
        var t = m.type || 'text';
        if (t === 'poll') return gsgPollHtml(m, my);
        if (t === 'image') {
            return '<div style="max-width:250px;">'
                + (m.imageUrl ? '<img src="' + esc(String(m.imageUrl)) + '" alt="" style="display:block;max-width:100%;border-radius:12px;border:1px solid #e2e8f0;padding:0;background:#fff;">' : '')
                + (m.caption ? '<div style="margin-top:5px;background:' + (my ? '#d8f3e5' : '#fff') + ';border:1px solid ' + (my ? '#bde7d1' : '#e2e8f0') + ';border-radius:12px;padding:8px 11px;font-size:13px;color:#0f172a;">' + renderMsgText(m.caption) + '</div>' : '')
                + '</div>';
        }
        if (t === 'document') {
            return '<div style="min-width:200px;display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #dbe4ed;border-radius:12px;padding:10px 12px;">'
                + '<span style="width:34px;height:34px;flex:none;border-radius:10px;background:#eef6fc;display:flex;align-items:center;justify-content:center;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#1268A8" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span>'
                + '<div style="min-width:0;"><b style="display:block;font-size:12.5px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(m.fileName || 'Nyaraka') + '</b>'
                + (m.fileSize ? '<small style="color:#64748b;">' + (m.fileSize > 1048576 ? (m.fileSize / 1048576).toFixed(1) + ' MB' : Math.round(m.fileSize / 1024) + ' KB') + '</small>' : '')
                + '</div></div>';
        }
        if (t === 'location') {
            var link = (m.lat !== undefined && m.lng !== undefined) ? 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(m.lat) + '&mlon=' + encodeURIComponent(m.lng) : '';
            return '<div style="min-width:200px;display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #cbe9dd;border-left:4px solid #18A982;border-radius:12px;padding:10px 12px;">'
                + '<span style="width:34px;height:34px;flex:none;border-radius:10px;background:#f0faf6;display:flex;align-items:center;justify-content:center;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#18A982" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="12" r="3"/></svg></span>'
                + '<div style="min-width:0;flex:1;"><b style="display:block;font-size:12.5px;color:#0f172a;">' + esc(m.label || 'Mahali') + '</b>'
                + (link ? '<a href="' + link + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#0B4F7A;font-weight:700;text-decoration:none;">' + tk('gsg_open_map', 'Fungua ramani') + ' ›</a>' : '')
                + '</div></div>';
        }
        if (t === 'contact') {
            return '<div style="min-width:200px;display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #dbe4ed;border-radius:12px;padding:10px 12px;">'
                + '<span style="width:34px;height:34px;flex:none;border-radius:99px;background:linear-gradient(135deg,#1268A8,#2B82BD);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;">' + esc(String(m.contactName || '?').charAt(0).toUpperCase()) + '</span>'
                + '<div style="min-width:0;flex:1;"><b style="display:block;font-size:12.5px;color:#0f172a;">' + esc(m.contactName || '') + '</b>'
                + (m.contactPhone ? '<small style="color:#64748b;">' + esc(m.contactPhone) + '</small>' : '') + '</div>'
                + (m.contactUid ? '<button type="button" data-act="gsg-dm" data-uid="' + esc(m.contactUid) + '" style="border:1px solid #1268A8;background:#fff;color:#1268A8;font-weight:800;font-size:10.5px;padding:6px 10px;border-radius:99px;cursor:pointer;flex:none;">' + tk('gsg_dm', 'Ongea') + '</button>' : '')
                + '</div>';
        }
        if (t === 'product') {
            var pr = m.product || {};
            return '<div style="min-width:210px;max-width:270px;background:#FFFBE8;border:1px solid #ead98a;border-left:4px solid #D8B83A;border-radius:13px;padding:10px 12px;">'
                + '<div style="display:flex;gap:9px;align-items:center;">'
                + (pr.imageUrl ? '<img src="' + esc(String(pr.imageUrl)) + '" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none;background:#fff;">' : '')
                + '<div style="min-width:0;"><small style="display:block;font-size:9px;font-weight:800;letter-spacing:.5px;color:#8a6d00;text-transform:uppercase;">' + tk('gsg_p_prod', 'Bidhaa') + '</small>'
                + '<b style="display:block;font-size:13px;color:#0f172a;">' + esc(pr.name || '') + '</b>'
                + (pr.price ? '<span style="font-size:12.5px;font-weight:800;color:#8a6d00;">TZS ' + esc(String(pr.price)) + '</span>' : '')
                + (pr.qty ? '<small style="color:#64748b;"> · ' + esc(String(pr.qty)) + (pr.unit ? ' ' + esc(pr.unit) : '') + '</small>' : '')
                + (pr.sellerName ? '<small style="display:block;color:#64748b;">' + esc(pr.sellerName) + '</small>' : '')
                + '</div></div>'
                + (pr.productId ? '<button type="button" data-act="gsg-view-product" data-pid="' + esc(pr.productId) + '" style="margin-top:8px;border:1px solid #D8B83A;background:#fff;color:#8a6d00;font-weight:800;font-size:10.5px;padding:6px 11px;border-radius:99px;cursor:pointer;">' + tk('disc_opp_view', 'Tazama') + ' ›</button>' : '')
                + '</div>';
        }
        if (t === 'service') {
            var sv = m.service || {};
            return '<div style="min-width:200px;max-width:270px;background:#fff;border:1px solid #c8ddf0;border-left:4px solid #2B82BD;border-radius:13px;padding:10px 12px;">'
                + '<small style="display:block;font-size:9px;font-weight:800;letter-spacing:.5px;color:#1268A8;text-transform:uppercase;">' + tk('gsg_p_serv', 'Huduma') + '</small>'
                + '<b style="display:block;font-size:13px;color:#0f172a;">' + esc(sv.name || '') + '</b>'
                + (sv.price ? '<span style="font-size:12.5px;font-weight:800;color:#1268A8;">TZS ' + esc(String(sv.price)) + '</span>' : '')
                + (sv.pricingMode ? '<small style="color:#64748b;"> · ' + esc(sv.pricingMode) + '</small>' : '')
                + (sv.note ? '<div style="margin-top:4px;font-size:11.5px;color:#475569;">' + esc(sv.note) + '</div>' : '')
                + '</div>';
        }
        if (t === 'group_order') return gsgGOCardHtml(m, my);
        if (t === 'supplier_request') return gsgSRCardHtml(m, my);
        // text (+ link preview chips §10 Link type — auto-detect)
        return renderMsgText(m.text) + gsgLinkChips(m.text);
    }

    function msgRow(m, my, ri, tc) {
        var t = '' + '';
        try { var d = new Date(m.at); t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); } catch (eT) {}
        // [R25] read receipts (haijuguswi)
        var tick = '';
        if (my) {
            tick = ri && ri.allRead
                ? ' <span title="' + tk('gsg_read_all', 'Wamesoma wote') + ': ' + esc((ri.names || []).join(', ')) + '" style="color:#1268A8;font-weight:800;">\u2713\u2713</span>'
                : ' <span title="' + tk('gsg_read_some', 'Bado wengine hawajasoma') + '" style="color:#94a3b8;font-weight:800;">\u2713\u2713</span>';
        }
        // [§33/§28] ORDER SPAWN — kadi ya mafanikio (aggregates tu)
        if (m.type === 'order_spawn') {
            var sp = m.spawn || {};
            return '<div data-mid="' + esc(m.__id || '') + '" style="margin:10px 8px;padding:11px 13px;border-radius:13px;background:#f0faf6;border:1px solid #cbe9dd;border-left:4px solid #18A982;">'
                + '<div style="display:flex;align-items:center;gap:6px;"><b style="font-size:10px;color:#0f766e;letter-spacing:.5px;text-transform:uppercase;">✅ ' + tk('gsg_spawn_t', 'Lengo limetimia — oda za kibinafsi') + '</b>'
                + '<span style="color:#94a3b8;font-size:10px;">· ' + t + '</span></div>'
                + '<div style="margin-top:5px;font-size:12.5px;color:#164e3f;line-height:1.5;">' + esc(m.text || '') + '</div>'
                + '<div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'
                + (sp.parentCode ? '<span style="font-size:10px;font-weight:900;color:#8a6d00;background:#fff;border:1px solid #ead98a;border-radius:6px;padding:3px 8px;">ORDER # ' + esc(sp.parentCode) + '</span>' : '')
                + (sp.count ? '<span style="font-size:10px;font-weight:800;color:#0f766e;background:#fff;border:1px solid #cbe9dd;border-radius:6px;padding:3px 8px;">' + (+sp.count) + ' × (' + esc(sp.firstId || 'SH-2001') + ' → ' + esc(sp.lastId || '') + ')</span>' : '')
                + (sp.price ? '<span style="font-size:10px;font-weight:800;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:3px 8px;">TZS ' + (+sp.price) + (sp.productName ? ' · ' + esc(sp.productName) : '') + '</span>' : '')
                + '</div>'
                + '<small style="display:block;margin-top:6px;color:#64748b;font-size:10px;line-height:1.5;">' + tk('gsg_spawn_n', 'Kila mshiriki ana oda yake — malipo hutokea tu ukiagiza wewe mwenyewe (hakuna chaji isiyotangazwa §36).') + '</small>'
                + '<button type="button" data-act="gsg-tab" data-tab="orders" style="margin-top:8px;border:1.5px solid #18A982;background:#fff;color:#0f766e;font-weight:800;font-size:10.5px;padding:6px 12px;border-radius:99px;cursor:pointer;">' + tk('gsg_tab_orders', 'Oda') + ' ›</button></div>';
        }
        // [§33/§34] ORDER EVENT — hatua ya oda (BILA kiasi; privacy §38)
        if (m.type === 'order_event') {
            var om = m.meta || {};
            var stepKey = String(om.step || m.text || '');
            var STEP_TXT = { paid: 'Malipo yamewekwa salama (escrow)', seller_accepted: 'Muuzaji amekubali oda', seller_rejected: 'Muuzaji amekataa — fedha imerudishwa', ready: 'Bidhaa iko tayari kuchukuliwa', transporter_accepted: 'Msafirishaji amekubali usafiri', in_transit: 'Imechukuliwa — njiani', delivered: 'Imefikishwa mikononi', completed: 'Oda imekamilika', assign_transporter: 'Msafirishaji ametewa' };
            var lbl2 = STEP_TXT[stepKey] || stepKey.replace(/_/g, ' ');
            var icn = { paid: '💳', seller_accepted: '✅', seller_rejected: '❌', ready: '📦', transporter_accepted: '🚚', in_transit: '🚚', delivered: '📬', completed: '🎉', assign_transporter: '🚚' }[stepKey] || 'ℹ️';
            return '<div data-mid="' + esc(m.__id || '') + '" style="margin:8px 8px;padding:8px 12px;border-radius:12px;background:#F1F7FC;border:1px solid #d3e6f5;display:flex;align-items:center;gap:8px;">'
                + '<span style="font-size:14px;">' + icn + '</span>'
                + (om.humanId ? '<b style="font-size:10px;font-weight:900;color:#0B4F7A;">' + esc(om.humanId) + '</b>' : '')
                + '<span style="flex:1;font-size:11.5px;color:#164e68;">' + esc(lbl2) + '</span>'
                + '<span style="color:#94a3b8;font-size:10px;">' + t + '</span></div>';
        }
        // [§10] ANNOUNCEMENT = kadi maalum center (si bubble ya sender)
        if (m.type === 'announcement') {
            return '<div data-mid="' + esc(m.__id || '') + '" style="margin:10px 8px;padding:11px 13px;border-radius:13px;background:#eef6fc;border:1px solid #d3e6f5;border-left:4px solid #1268A8;">'
                + '<div style="display:flex;align-items:center;gap:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1268A8" stroke-width="2.3" aria-hidden="true"><path d="M3 11l18-7-7 18-2-8-9-3z"/></svg>'
                + '<b style="font-size:10px;color:#0B4F7A;letter-spacing:.5px;text-transform:uppercase;">' + tk('gsg_ann_', 'Tangazo la kikundi') + '</b>'
                + '<span style="color:#94a3b8;font-size:10px;">· ' + esc(m.senderName || '') + ' · ' + t + '</span></div>'
                + '<div style="margin-top:5px;font-size:12.5px;color:#0B4F7A;line-height:1.5;">' + renderMsgText(m.text || '') + '</div></div>';
        }
        var nm = String(m.senderName || 'MJ');
        var avBg = my ? 'linear-gradient(135deg,#18A982,#0e7a5f)' : 'linear-gradient(135deg,#1268A8,#2B82BD)';
        var tCount = (tc && m.__id && tc[m.__id]) || 0;
        return '<div class="gsg-msg-row" data-mid="' + esc(m.__id || '') + '" style="display:flex;gap:7px;flex-direction:' + (my ? 'row-reverse' : 'row') + ';margin-bottom:9px;">'
            + '<span style="width:30px;height:30px;flex:none;border-radius:11px;background:' + avBg + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;margin-top:2px;">' + esc(nm.trim().charAt(0).toUpperCase() || '?') + '</span>'   // [§11] avatar
            + '<div style="display:flex;flex-direction:column;align-items:' + (my ? 'flex-end' : 'flex-start') + ';max-width:80%;min-width:0;">'
            + '<small style="color:#94a3b8;font-size:10px;margin:0 4px 2px;">' + esc(nm) + gsgRoleChip(m.senderUid) + ' · ' + t + tick + '</small>'   // [§11] name+role+time
            + (m.type && m.type !== 'text'
                ? '<div style="max-width:100%;">' + gsgQuoteHtml(m.replyTo, my) + gsgContentHtml(m, my) + '</div>'
                : '<div style="max-width:100%;padding:9px 12px;border-radius:14px;font-size:13.5px;color:#0f172a;background:' + (my ? '#d8f3e5' : '#fff') + ';border:1px solid ' + (my ? '#bde7d1' : '#e2e8f0') + ';border-' + (my ? 'bottom-right' : 'bottom-left') + '-radius:4px;">'
                    + gsgQuoteHtml(m.replyTo, my) + gsgContentHtml(m, my) + '</div>')
            // actions row: [§12] ↩ reply + thread + [R26] reactions (salama — haijuguswi)
            + (function () {
                if (!m.__id) return '';
                var rx = m.reactions && typeof m.reactions === 'object' ? m.reactions : {};
                var chips = Object.keys(rx).filter(function (k) { return Array.isArray(rx[k]) && rx[k].length; }).map(function (k) {
                    var mine = rx[k].indexOf(uid()) >= 0;
                    return '<button type="button" data-act="gsg-react" data-av="' + esc(k) + '" data-mid="' + esc(m.__id) + '" style="border:1px solid ' + (mine ? '#1268A8' : '#e2e8f0') + ';background:' + (mine ? '#e0f2fe' : '#fff') + ';border-radius:99px;font-size:11px;padding:2px 8px;cursor:pointer;">' + esc(k) + ' ' + rx[k].length + '</button>';
                }).join('');
                var prevTxt = (m.text || m.caption || (m.question ? ('\u{1F4CB} ' + m.question) : '') || (m.fileName || '') || '').slice(0, 80);
                return '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;max-width:100%;justify-content:' + (my ? 'flex-end' : 'flex-start') + ';align-items:center;">'
                    + '<button type="button" data-act="gsg-reply" data-mid="' + esc(m.__id) + '" data-by="' + esc(nm) + '" data-prev="' + esc(prevTxt) + '" data-root="' + esc(m.threadRootId || '') + '" title="' + tk('gsg_reply', 'Jibu') + '" style="border:1px dashed #cbd5e1;background:#fff;border-radius:99px;font-size:11px;padding:2px 8px;color:#64748b;cursor:pointer;">\u21a9</button>'   // [§12] reply
                    + (tCount > 0 && !m.threadRootId ? '<button type="button" data-act="gsg-thread" data-mid="' + esc(m.__id) + '" style="border:none;background:none;color:#1268A8;font-weight:800;font-size:10.5px;cursor:pointer;">' + tCount + ' ' + tk('gsg_replies', 'majibu') + ' ›</button>' : '')
                    + chips
                    + '<button type="button" data-act="gsg-rxn-pop" data-mid="' + esc(m.__id) + '" title="' + tk('gsg_react', 'Ongeza reaction') + '" style="border:1px dashed #cbd5e1;background:#fff;border-radius:99px;font-size:11px;padding:2px 8px;color:#64748b;cursor:pointer;">+</button>'
                    + '</div>';
            })()
            + '</div></div>';
    }

    window.skhOpenGroupSoga = async function (gid) {
        if (!gid) return;
        gid = String(gid).trim().replace(/^conv_group_/, '');
        if (!gid) return;
        if (!skh.requireAuth()) return;

        // Funga inbox na chat nyingine mara moja
        try {
            var inbox = document.getElementById('chatListModal');
            if (inbox) { inbox.style.display = 'none'; inbox.classList.remove('open'); }
            var cm = document.getElementById('chatModal');
            if (cm && window.innerWidth < 900) { cm.style.display = 'none'; }
        } catch (eInstant) {}

        CUR.gid = gid;
        CUR.__tab = 'chat';
        CUR.__annOpen = false;

        var m = buildModal();
        if (m) {
            // [ABRUPT FAST UI] Fungua dirisha kamili la kikundi MARA MOJA bila kusubiri queries
            m.innerHTML = '<div class="skh-discover-sheet" style="max-height:92vh;display:flex;flex-direction:column;">'
                + '<div class="skh-discover-head">'
                + '<button type="button" class="skh-discover-back" data-act="gsg-close" aria-label="' + tk('back', 'Rudi') + '">' + (window.skhNavIcon ? window.skhNavIcon('back', 18) : '‹') + '</button>'
                + '<div id="gsgAvatarTile" style="width:38px;height:38px;border-radius:11px;background:#EAF3FA;border:1px solid #CFDFEB;color:#39779B;display:flex;align-items:center;justify-content:center;font-weight:800;">#</div>'
                + '<div style="flex:1;min-width:0;"><b id="gsgTitleEl" class="skh-discover-title" style="font-size:15px;">' + tk('group', 'Kikundi') + '</b><br>'
                + '<small id="gsgSubEl" class="skh-discover-sub">' + tk('loading', 'Inapakia...') + '</small></div>'
                + '<button type="button" class="skh-discover-back" data-act="gsg-info" title="' + tk('gsg_info', 'Taarifa za kikundi') + '" style="margin-left:6px;">' + (window.skhNavIcon ? window.skhNavIcon('menu', 18) : '☰') + '</button>'
                + '</div>'
                + '<div id="gsgInfo" style="display:none;"></div>'
                + '<div id="gsgDesc" style="display:none;margin:7px 12px 0;padding:9px 12px;border-radius:12px;background:#fff;border:1px solid #e2e8f0;color:#475569;font-size:12px;line-height:1.45;"></div>'
                + '<div id="gsgTabs" role="tablist" style="display:flex;gap:2px;padding:9px 8px 0;border-bottom:1px solid #e2e8f0;background:#fff;"></div>'
                + '<div id="gsgTabChat" style="flex:1;min-height:0;display:flex;flex-direction:column;">'
                + '<div id="gsgAnnounce"></div>'
                + '<div id="gsgTyping" style="padding:0 14px;font-size:11px;color:#64748b;min-height:2px;font-style:italic;"></div>'
                + '<div id="gsgMsgs" style="flex:1;min-height:220px;overflow-y:auto;padding:12px;background:#efe7dd;">'
                + '<small style="color:#64748b;display:block;text-align:center;padding:16px;">' + tk('loading', 'Inapakia meseji...') + '</small></div>'
                + '<div id="gsgReplyBar" style="display:none;padding:7px 12px 0;"></div>'
                + '<div id="gsgComposerRow" style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e2e8f0;align-items:stretch;">'
                + '<button type="button" data-act="gsg-attach" title="' + tk('gsg_attach', 'Ambatisha') + '" aria-label="' + tk('gsg_attach', 'Ambatisha') + '" style="border:1.5px solid #CCEBDD;background:#fff;color:#178864;font-weight:900;font-size:17px;width:42px;border-radius:12px;cursor:pointer;line-height:1;">+</button>'
                + '<input id="gsgInput" type="text" autocomplete="off" placeholder="' + tk('ch_msg_ph', 'Andika ujumbe...') + '" style="flex:1;padding:11px 13px;border:1.5px solid #cbd5e1;border-radius:12px;font-size:14px;">'
                + '<button type="button" data-act="gsg-send" style="border:none;background:#18A982;color:#fff;font-weight:800;font-size:13px;padding:0 18px;border-radius:12px;cursor:pointer;">' + tk('ch_send', 'Tuma') + '</button>'
                + '</div></div>'
                + '<div id="gsgTabOrders" style="display:none;flex:1;min-height:0;overflow-y:auto;padding:12px;background:#fff;"></div>'
                + '<div id="gsgTabMembers" style="display:none;flex:1;min-height:0;overflow-y:auto;padding:12px;background:#fff;"></div>'
                + '<div id="gsgTabMedia" style="display:none;flex:1;min-height:0;overflow-y:auto;padding:12px;background:#fff;"></div>'
                + '</div>';
            m.classList.add('open');
            m.style.display = 'block';
            document.body.style.overflow = 'hidden';
            try { renderTabsBar(); } catch (eTB) {}
        }

        // 1) Anza kusoma na kusikiliza meseji za moja kwa moja bila kuzuia UI
        renderMsgs(gid);

        (function subscribeLive() {
            unsubscribeMsgs();
            if (typeof skh.onSnapshot !== 'function') return;
            try {
                unsubMsgs = skh.onSnapshot(msgsCol(gid), function () {
                    if (!CUR.gid || CUR.gid !== gid) return;
                    renderMsgs(gid);
                }, function () {});
            } catch (eSub) {}
            try {
                unsubConv = skh.onSnapshot(cRef(gid), function (snap) {
                    if (!CUR.gid || CUR.gid !== gid) return;
                    if (snap && snap.exists && snap.exists()) {
                        var cd = snap.data() || {};
                        renderTypingLine(cd.typingMap || {});
                    }
                }, function () {});
            } catch (eSub2) {}
        })();

        // 2) Kagua kikundi, uanachama na taarifa za ziada BACKGROUND (non-blocking)
        (async function loadGroupMeta() {
            try {
                var gsnap = await skh.getDoc(gRef(gid));
                var g = (gsnap && gsnap.exists && gsnap.exists()) ? gsnap.data() : { name: 'Kikundi' };
                if (CUR.gid !== gid) return;

                // Sasisha header ya kikundi
                var titleEl = document.getElementById('gsgTitleEl');
                if (titleEl && g.name) titleEl.textContent = g.name;
                var avEl = document.getElementById('gsgAvatarTile');
                if (avEl && g.avatar) avEl.textContent = g.avatar;
                var subEl = document.getElementById('gsgSubEl');
                if (subEl) {
                    subEl.textContent = (g.memberCount || '?') + ' ' + tk('grp_members', 'wanachama') + ' · ' + (g.groupType === 'PERMANENT_COMMUNITY' ? tk('grp_type_perm', 'Community') : tk('grp_type_temp', 'Commerce'));
                }
                var dEl = document.getElementById('gsgDesc');
                if (dEl && g.description) {
                    dEl.textContent = (g.groupType === 'PERMANENT_COMMUNITY' ? tk('grp_type_perm', 'Community') + ' · ' : '') + String(g.description);
                    dEl.style.display = 'block';
                }
                CUR.__sendPolicy = g.sendPolicy || 'everyone';
                try { renderAnnounce(g.announcement || null); } catch (eAN) {}

                // Uanachama
                var ms = null;
                try { ms = await skh.getDoc(mRef(gid, uid())); } catch (eM) {}
                var isActiveMember = (ms && ms.exists && ms.exists() && ms.data().status === 'active');

                if (!isActiveMember) {
                    // Kama kikundi kiko wazi au public, jiunge mara moja
                    if (g.visibility === 'public' || g.joinPolicy === 'open' || !g.joinPolicy) {
                        try {
                            if (window.skhGroupJoin) await window.skhGroupJoin(gid);
                            isActiveMember = true;
                        } catch (eJ) {}
                    }
                }

                if (!isActiveMember) {
                    var annHost = document.getElementById('gsgAnnounce');
                    if (annHost) {
                        annHost.innerHTML = '<div style="background:#fef3c7;border:1px solid #fde68a;padding:10px 14px;border-radius:12px;margin:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">'
                            + '<span style="font-size:12.5px;color:#92400e;font-weight:700;">Hujajiunga na kikundi hiki bado.</span>'
                            + '<button type="button" onclick="if(window.skhGroupJoin){window.skhGroupJoin(\'' + esc(gid) + '\').then(function(){window.skhOpenGroupSoga(\'' + esc(gid) + '\');});}" style="border:none;background:#18A982;color:#fff;padding:6px 14px;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">Jiunge Sasa</button>'
                            + '</div>';
                    }
                } else {
                    CUR.__myRole = (ms && ms.data && ms.data().role) || 'member';
                }

                try { await ensureConv(gid); } catch (eCV) {}

                // Read receipts na zero unread
                try {
                    var cs0 = await skh.getDoc(cRef(gid));
                    if (cs0 && cs0.exists && cs0.exists()) {
                        var c0 = cs0.data() || {};
                        if (c0.unread && c0.unread[uid()]) { c0.unread[uid()] = 0; skh.updateDoc(cRef(gid), { unread: c0.unread }).catch(function () {}); }
                    }
                    var lr0 = {}; lr0['lastReadAt.' + uid()] = nowIso();
                    skh.updateDoc(cRef(gid), lr0).catch(function () {});
                } catch (eRead) {}

                // Majina ya wanachama
                try {
                    var mems0 = await window.skhGroupMembers(gid);
                    CUR.__names = await fetchNames((mems0 || []).filter(function (mm) { return mm && mm.status === 'active'; }).map(function (mm) { return mm.userId; }));
                    CUR.__roles = {};
                    (mems0 || []).forEach(function (mm) { if (mm && mm.userId && mm.status === 'active') CUR.__roles[mm.userId] = mm.role || 'member'; });
                } catch (eN0) {}

                try { startGoTick(); } catch (eTK) {}
            } catch (eMeta) {
                console.warn('[loadGroupMeta]', eMeta);
            }
        })();

        if (CUR.__showInfo) { try { await renderInfoDrawer(gid); } catch (eI2) {} }
        // [R22 B2-UI] MAOMBI YA KUJIUNGA (joinPolicy:'request') — owner/admin
        // wanaona banner [Kubali][Kataa] — group haifanyi tena "dead-end".
        try {
            if (CUR.__myRole === 'owner' || CUR.__myRole === 'admin') {
                var pend = await window.skhGroupPendingRequests(gid);
                if (pend.length && window.__pendNamesCache === undefined) window.__pendNamesCache = {};
                if (pend.length) {
                    var names = {};
                    for (var i = 0; i < pend.length; i++) {
                        try {
                            var us = await skh.getDoc(skh.doc(skh.db, 'users', pend[i].userId));
                            names[pend[i].userId] = (us && us.exists && us.exists()) ? (us.data().fullName || us.data().displayName || pend[i].userId) : pend[i].userId;
                        } catch (eN) { names[pend[i].userId] = pend[i].userId; }
                    }
                    var banner = '<div id="gsgPending" style="margin:8px 12px;padding:10px 12px;border:1.5px dashed #f6c45e;border-radius:12px;background:#fffbeb;">'
                        + '<b style="display:block;font-size:11.5px;color:#b45309;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">' + tk('gsg_pend', 'Maombi ya kujiunga') + ' (' + pend.length + ')</b>'
                        + pend.map(function (p) {
                            return '<div class="gsg-pend-row" data-uid="' + esc(p.userId) + '" style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid rgba(246,196,94,.35);">'
                                + '<b style="flex:1;min-width:0;font-size:12.5px;color:#0f172a;">' + esc(names[p.userId] || p.userId) + '</b>'
                                + '<button type="button" data-act="gsg-pend-ok" style="border:none;background:#18A982;color:#fff;font-weight:800;font-size:11px;padding:6px 10px;border-radius:99px;cursor:pointer;">' + tk('grp_accept', 'Kubali') + '</button>'
                                + '<button type="button" data-act="gsg-pend-no" style="border:none;background:#f1f5f9;color:#475569;font-weight:700;font-size:11px;padding:6px 10px;border-radius:99px;cursor:pointer;">' + tk('grp_decline', 'Kataa') + '</button>'
                                + '</div>';
                        }).join('')
                        + '</div>';
                    var msgs = m.querySelector('#gsgMsgs');
                    if (msgs) msgs.insertAdjacentHTML('beforebegin', banner);
                }
            }
        } catch (ePD) {}
        var inp = m.querySelector('#gsgInput');
        if (inp) {
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendText(); });
            var __typLast = 0;
            inp.addEventListener('input', function () {
                var now = Date.now();
                if (now - __typLast < 1800) return;
                __typLast = now;
                try {
                    var patch = {}; patch['typingMap.' + uid()] = { uid: uid(), name: myName(), at: nowIso() };
                    skh.updateDoc(cRef(gid), patch).catch(function () {});
                } catch (eT2) {}
            });
        }
    };

    window.skhCloseGroupSoga = function () {
        var gid0 = CUR.gid;
        CUR.gid = null;
        CUR.__showInfo = false;
        CUR.__tab = 'chat';
        CUR.__annOpen = false;
        CUR.__replyTo = null;
        CUR.__lastRows = null;
        closeAttachPop(); closeTypedForm(); closeThreadPop(); closeGODetail(); closeJoinMdl(); stopGoTick();
        CUR.__names = null;
        closeRxnPop();
        unsubscribeMsgs();
        // [R24] typing yangu ifutwe nikifunga soga (best effort)
        if (gid0) { try { var tp = {}; tp['typingMap.' + uid()] = null; skh.updateDoc(cRef(gid0), tp).catch(function () {}); } catch (eT4) {} }
       var m = document.getElementById('skhGroupSogaModal');
        if (m) {
            m.classList.remove('open');
            m.style.display = 'none';
        }
        document.body.style.overflow = 'auto';
    };

    /* ================= [R23 B9] GROUP-INFO / MANAGE DRAWER =================
     * - Hajaundi ya WhatsApp clon; hii ni SokoHai panel: taarifa + wanachama
     *   + vitendo vya uongozi (invited/adds hufuata policies+roles za 69).
     */
    async function fetchNames(uids2) {
        var out = {};
        for (var i = 0; i < uids2.length; i++) {
            try {
                var us = await skh.getDoc(skh.doc(skh.db, 'users', uids2[i]));
                out[uids2[i]] = (us && us.exists && us.exists()) ? (us.data().fullName || us.data().displayName || uids2[i]) : uids2[i];
            } catch (eN) { out[uids2[i]] = uids2[i]; }
        }
        return out;
    }

    function polChip(label) {
        return '<span style="display:inline-flex;align-items:center;gap:4px;border:1px solid #dbe4ed;background:#fff;color:#334155;font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:99px;">' + label + '</span>';
    }

    async function renderInfoDrawer(gid) {
        CUR.__showInfo = true;
        var host = document.getElementById('gsgInfo');
        if (!host) return;
        var mrole = CUR.__myRole || 'member';
        var canManage = (mrole === 'owner' || mrole === 'admin');
        var gsnap = await skh.getDoc(gRef(gid));
        var g = (gsnap && gsnap.exists && gsnap.exists()) ? gsnap.data() : {};
        var members = await window.skhGroupMembers(gid);
        var active = members.filter(function (mm) { return mm.status === 'active'; });
        var pend =  canManage ? active ? members.filter(function (mm) { return mm.status === 'pending'; }) : [] : [];
        var names = await fetchNames(active.map(function (mm) { return mm.userId; }));
        var ownerId = g.ownerId || g.createdBy;
        var canInvite = (g.invitePolicy !== 'admins') || canManage;

        host.innerHTML = '<div style="margin:8px 12px;border:1px solid #dbe4ed;border-radius:14px;background:#fff;overflow:hidden;">'
            // meta
            + '<div style="padding:12px 14px;border-bottom:1px solid #eef2f7;">'
            + (g.description ? '<small style="display:block;color:#475569;font-size:12px;margin-bottom:8px;">' + esc(g.description) + '</small>' : '')
            + '<div style="display:flex;flex-wrap:wrap;gap:6px;">'
            + polChip((g.visibility === 'private' ? '🔒 ' : '🌐 ') + (g.visibility === 'private' ? tk('grp_private', 'Binafsi') : tk('grp_public', 'Hadharani')))
            + polChip(tk('gsg_join', 'Kujiunga:') + ' ' + (g.joinPolicy === 'request' ? tk('gsg_by_req', 'kwa ombi') : tk('gsg_open', 'wazi')))
            + polChip(tk('gsg_send_l', 'Kutuma:') + ' ' + (g.sendPolicy === 'admins' ? 'admins' : tk('gsg_everyone', 'wote')))
            + polChip(esc((g.groupType === 'PERMANENT_COMMUNITY' ? tk('grp_type_perm', 'Community') : tk('grp_type_temp', 'Ya muda'))))
            + '</div>'
            + (canManage
                ? '<div style="display:flex;gap:6px;align-items:center;margin-top:9px;flex-wrap:wrap;"><small style="font-size:10.5px;color:#64748b;font-weight:700;">' + tk('gsg_avatar_l', 'Alama ya kikundi:') + '</small>'
                    + ['🌾','🐄','🐔','🐟','🐝','🚜','🏪','🧺','💬'].map(function (av) {
                        return '<button type="button" data-act="gsg-avatar" data-av="' + av + '" style="width:30px;height:30px;border-radius:9px;border:1.5px solid ' + ((g.avatar || '#') === av ? '#1268A8' : '#e2e8f0') + ';background:#fff;font-size:15px;cursor:pointer;line-height:1;">' + av + '</button>';
                    }).join('')
                    + '</div>'
                : '')
            + '</div>'
            // members
            + (canManage
                ? '<div style="padding:10px 14px;border-bottom:1px solid #eef2f7;display:flex;flex-direction:column;gap:7px;">'
                    + '<input id="gsgEditName" type="text" maxlength="48" value="' + esc(g.name || '') + '" placeholder="' + tk('grp_name_ph', 'Jina la kikundi') + '" style="padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:13px;">'
                    + '<textarea id="gsgEditDesc" rows="2" maxlength="300" placeholder="' + tk('grp_desc_ph', 'Maelezo (hiari)') + '" style="padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:12.5px;resize:none;">' + esc(g.description || '') + '</textarea>'
                    + '<button type="button" data-act="gsg-save-info" style="align-self:flex-end;border:none;background:#18A982;color:#fff;font-weight:800;font-size:11.5px;padding:8px 13px;border-radius:99px;cursor:pointer;">' + tk('gsg_save_info', 'Hifadhi taarifa') + '</button>'
                    + '</div>'
                : '')
            // [SPEC P2 §9] PIN ANNOUNCEMENT (admins tu) — tangazo ni card maalum, si msg
            + (canManage
                ? '<div style="padding:10px 14px;border-bottom:1px solid #eef2f7;display:flex;flex-direction:column;gap:7px;">'
                    + '<small style="font-size:10.5px;color:#64748b;font-weight:700;">' + tk('gsg_ann_pin_l', 'Tangazo la kikundi (pinning):') + '</small>'
                    + '<textarea id="gsgAnnText" rows="2" maxlength="500" placeholder="' + tk('gsg_ann_ph', 'Andika tangazo (wazi neno tupu ku-unpin)') + '" style="padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:12.5px;resize:none;">' + esc(g.announcement && g.announcement.text ? g.announcement.text : '') + '</textarea>'
                    + '<button type="button" data-act="gsg-ann-save" style="align-self:flex-end;border:none;background:#18A982;color:#fff;font-weight:800;font-size:11.5px;padding:8px 13px;border-radius:99px;cursor:pointer;">' + tk('gsg_ann_save', 'Hifadhi tangazo') + '</button>'
                    + '</div>'
                : '')
            + '<div style="padding:10px 14px 6px;display:flex;justify-content:space-between;align-items:center;">'
            + '<b style="font-size:11.5px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;">' + tk('gsg_members', 'Wanachama') + ' (' + active.length + ')</b>'
            + (canInvite ? '<button type="button" data-act="gsg-invite" style="border:1px solid #1268A8;color:#1268A8;background:#fff;font-weight:800;font-size:11px;padding:6px 11px;border-radius:99px;cursor:pointer;">' + tk('gsg_invite', '+ Alika') + '</button>' : '')
            + '</div>'
            + '<div style="padding:0 14px 10px;max-height:180px;overflow-y:auto;">'
            + active.map(function (mm) {
                var uidM = mm.userId;
                var isMe = uidM === uid();
                var isOwner = mm.role === 'owner';
                var roleLbl = mm.role === 'owner' ? tk('gsg_owner', 'mmiliki') : mm.role === 'admin' ? tk('gsg_admin', 'admin') : mm.role === 'moderator' ? 'moderator' : mm.role === 'organizer' ? tk('gsg_organizer', 'organizer') : tk('gsg_member', 'mwana');
                var vTick = mm.verifiedBusiness ? ' <span title="' + tk('gsg_vbiz', 'Biashara iliyothibitishwa') + '" style="color:#1268A8;font-weight:900;">✓</span>' : '';
                var acts = '';
                if (canManage && !isMe && !isOwner) {
                    if (mrole === 'owner') {
                        // [R24] ownership inahamishwa mkono kwa mkono (sio setRole)
                        acts += '<button type="button" data-act="gsg-transfer" data-uid="' + esc(uidM) + '" style="border:1px solid #f6c45e;background:#fffbeb;color:#b45309;font-size:10.5px;font-weight:700;padding:5px 9px;border-radius:99px;cursor:pointer;">' + tk('gsg_transfer', 'kabidhi') + '</button>';
                        acts += (mm.role === 'admin'
                            ? '<button type="button" data-act="gsg-mkmember" data-uid="' + esc(uidM) + '" style="border:1px solid #cbd5e1;background:#fff;color:#475569;font-size:10.5px;font-weight:700;padding:5px 9px;border-radius:99px;cursor:pointer;">' + tk('gsg_mk_member', 'fanya mwana') + '</button>'
                            : '<button type="button" data-act="gsg-mkadmin"  data-uid="' + esc(uidM) + '" style="border:1px solid #1268A8;background:#eef6fc;color:#1268A8;font-size:10.5px;font-weight:700;padding:5px 9px;border-radius:99px;cursor:pointer;">' + tk('gsg_mk_admin', 'fanya admin') + '</button>');
                        // [§27] Order Organizer role — owner kupunguza/kuongeza (member ↔ organizer)
                        acts += (mm.role === 'organizer'
                            ? '<button type="button" data-act="gsg-mkmember" data-uid="' + esc(uidM) + '" style="border:1px solid #D8B83A;background:#FFFBE8;color:#8a6d00;font-size:10.5px;font-weight:700;padding:5px 9px;border-radius:99px;cursor:pointer;">' + tk('gsg_mk_demote', 'vua organizer') + '</button>'
                            : '<button type="button" data-act="gsg-mkorganizer" data-uid="' + esc(uidM) + '" style="border:1px solid #D8B83A;background:#FFFBE8;color:#8a6d00;font-size:10.5px;font-weight:700;padding:5px 9px;border-radius:99px;cursor:pointer;">' + tk('gsg_mk_organizer', 'fanya organizer') + '</button>');
                        // [§27] Verified Business tick toggle (canManage)
                        acts += '<button type="button" data-act="gsg-vbiz" data-uid="' + esc(uidM) + '" data-on="' + (mm.verifiedBusiness ? '0' : '1') + '" title="' + tk('gsg_vbiz', 'Biashara iliyothibitishwa') + '" style="border:1px solid ' + (mm.verifiedBusiness ? '#1268A8' : '#cbd5e1') + ';background:' + (mm.verifiedBusiness ? '#eef6fc' : '#fff') + ';color:' + (mm.verifiedBusiness ? '#1268A8' : '#64748b') + ';font-size:10.5px;font-weight:900;padding:5px 9px;border-radius:99px;cursor:pointer;">✓</button>';
                    }
                    acts += '<button type="button" data-act="gsg-remove" data-uid="' + esc(uidM) + '" style="border:none;background:#fef2f2;color:#dc2626;font-size:10.5px;font-weight:700;padding:5px 9px;border-radius:99px;cursor:pointer;">' + tk('gsg_remove', 'toa') + '</button>';
                }
                return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 0;border-top:1px solid #f1f5f9;">'
                    + '<span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#1268A8,#18A982);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;">' + esc(String(names[uidM] || '?').trim().charAt(0).toUpperCase()) + '</span>'
                    + '<span style="flex:1;min-width:0;font-size:12.5px;color:#0f172a;font-weight:600;">' + esc(names[uidM] || uidM) + vTick + (isMe ? ' <small style="color:#94a3b8;">(' + tk('me', 'Mimi') + ')</small>' : '') + '</span>'
                    + '<span style="font-size:10px;color:#64748b;border:1px solid #e2e8f0;border-radius:99px;padding:3px 8px;">' + esc(roleLbl) + '</span>'
                    + acts
                    + '</div>';
            }).join('')
            + '</div>'
            // pending inline (manage)
            + (pend.length ? '<div style="padding:8px 14px;border-top:1px dashed #f6c45e;background:#fffbeb;"><b style="font-size:11px;color:#b45309;">' + tk('gsg_pend2', 'Maombi yanayosubiri') + ' (' + pend.length + ')</b></div>' : '')
            // actions bottom
            + '<div style="display:flex;gap:8px;padding:11px 14px;border-top:1px solid #eef2f7;background:#f8fafc;">'
            + '<button type="button" data-act="gsg-leave" style="flex:1;border:1px solid #fecaca;background:#fff;color:#dc2626;font-weight:800;font-size:12px;padding:10px;border-radius:12px;cursor:pointer;">' + tk('grp_leave', 'Ondoka kikundi') + '</button>'
            + (canManage
                ? '<button type="button" data-act="gsg-archive" style="flex:1;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:800;font-size:12px;padding:10px;border-radius:12px;cursor:pointer;">' + tk('grp_archive', 'Weka kumbukumbu (archive)') + '</button>'
                : '')
            + '</div>'
            + '</div>';
        host.style.display = 'block';
    }
    /* [R26] reaction popover: fixed, chini ya message bubble */
    function closeRxnPop() { var p = document.getElementById('gsgRxnPop'); if (p) p.remove(); }
    function openRxnPop(anchorBtn, mid) {
        closeRxnPop();
        var r = anchorBtn.getBoundingClientRect();
        var pop = document.createElement('div');
        pop.id = 'gsgRxnPop';
        pop.style.cssText = 'position:fixed;z-index:100090;display:flex;gap:6px;background:#fff;border:1px solid #e2e8f0;border-radius:99px;padding:6px 10px;box-shadow:0 8px 24px rgba(15,23,42,.22);';
        pop.style.top = (r.bottom + 6) + 'px';
        pop.style.left = Math.max(8, r.left - 60) + 'px';
        pop.innerHTML = ['👍','❤️','😂','🙏','👏'].map(function (av) {
            return '<button type="button" data-act="gsg-react" data-av="' + av + '" data-mid="' + esc(mid) + '" style="border:none;background:#fff;font-size:17px;cursor:pointer;line-height:1;padding:2px;">' + av + '</button>';
        }).join('');
        document.body.appendChild(pop);
    }

    /* ================= [SPEC PHASE 2 §7/8/§9/§38] GROUP HOME =================
     * Tabs CHAT|ORDERS|MEMBERS|MEDIA (active=SokoHai blue) + description summary
     * + pinned announcement card. HAKUNA fake state: kila panel huchomoza data
     * halisi (collections halisi); tupu → empty state ya uaminifu. */
    var GSG_TABS = ['chat', 'orders', 'members', 'media'];   // [§45] explicit enum
    var gsgTabMeta = {
        chat:    { key: 'gsg_tab_chat',    fb: 'Mazungumzo' },
        orders:  { key: 'gsg_tab_orders',  fb: 'Group Orders' },
        members: { key: 'gsg_tab_members', fb: 'Wanachama' },
        media:   { key: 'gsg_tab_media',   fb: 'Media' }
    };

    function renderTabsBar() {
        var host = document.getElementById('gsgTabs');
        if (!host || !CUR.gid) return;
        var cur = CUR.__tab || 'chat';
        host.innerHTML = GSG_TABS.map(function (t) {
            var on = (t === cur);
            return '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" data-act="gsg-tab" data-tab="' + t + '" '
                + 'style="flex:1;border:none;background:none;cursor:pointer;padding:9px 2px 10px;font-size:11px;font-weight:800;letter-spacing:.2px;white-space:nowrap;color:' + (on ? '#1268A8' : '#64748b') + ';border-bottom:' + (on ? '2.5px solid #1268A8' : '2.5px solid transparent') + ';">'
                + esc(tk(gsgTabMeta[t].key, gsgTabMeta[t].fb)) + '</button>';
        }).join('');
    }

    function setGsgTab(tab) {
        if (!CUR.gid || GSG_TABS.indexOf(tab) < 0) return;      // [§45] hakuna free-form
        CUR.__tab = tab;
        var ids = { chat: 'gsgTabChat', orders: 'gsgTabOrders', members: 'gsgTabMembers', media: 'gsgTabMedia' };
        Object.keys(ids).forEach(function (t) {
            var el = document.getElementById(ids[t]);
            if (el) el.style.display = (t === tab) ? (t === 'chat' ? 'flex' : 'block') : 'none';
        });
        renderTabsBar();
        if (tab === 'orders') renderOrdersTab(CUR.gid);
        else if (tab === 'members') renderMembersTab(CUR.gid);
        else if (tab === 'media') renderMediaTab(CUR.gid);
    }

    function gsgEmptyTabHtml(title, sub) {
        return '<div style="text-align:center;padding:42px 18px;color:#94a3b8;background:#fff;border:1px dashed #dbe4ed;border-radius:14px;margin:8px 4px;">'
            + '<b style="display:block;font-size:13px;color:#64748b;">' + esc(title) + '</b>'
            + (sub ? '<small style="display:block;margin-top:5px;font-size:11px;">' + esc(sub) + '</small>' : '')
            + '</div>';
    }

    async function renderOrdersTab(gid) {
        var host = document.getElementById('gsgTabOrders');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var rows = [];
        try {
            var snap = await skh.getDocs(skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders'));
            if (snap && snap.forEach) snap.forEach(function (d) { var x = d.data() || {}; x.__id = d.id; if (x.status !== 'CANCELLED') rows.push(x); });
        } catch (eGO) {}
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'orders') return;
        // [§22] header + CTA unda — filters za hali zinakuja Phase 5 (bado halisi)
        // [§22] filters: Active / Closing Soon (≤48h) / Imekwisha / Zangu
        var f = CUR.__goFilter || 'active';
        var fChips = [ ['active', tk('gsg_f_active', 'Active')], ['soon', tk('gsg_f_soon', 'Inawahi')], ['done', tk('gsg_f_done', 'Imekwisha')], ['mine', tk('gsg_f_mine', 'Zangu')] ];
        function fMatch(o) {
            var st = String(o.status || 'OPEN');
            var doneish = ['CLOSED', 'COMPLETED', 'CANCELLED', 'PROCESSING'].indexOf(st) >= 0; // [§45/§28]
            if (f === 'active') return !doneish;
            if (f === 'done') return doneish;
            if (f === 'mine') return !!(o.participants && o.participants[uid()]);
            if (f === 'soon') {
                if (doneish) return false;
                var msD = o.deadline ? (new Date(String(o.deadline).slice(0,10) + 'T23:59:59').getTime() - Date.now()) : 9e15;
                return msD >= 0 && msD <= 48 * 3600000;
            }
            return true;
        }
        var filterBar = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px;">' + fChips.map(function (c) {
            var on = c[0] === f;
            return '<button type="button" data-act="gsg-go-filter" data-f="' + c[0] + '" style="border:1.5px solid ' + (on ? '#1268A8' : '#e2e8f0') + ';background:' + (on ? '#eef6fc' : '#fff') + ';color:' + (on ? '#0B4F7A' : '#64748b') + ';font-weight:800;font-size:10.5px;padding:6px 11px;border-radius:99px;cursor:pointer;">' + esc(c[1]) + '</button>';
        }).join('') + '</div>';
        var rowsAll = rows; rows = rows.filter(fMatch);
        var head = filterBar + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
            + '<b style="flex:1;font-size:13px;color:#0f172a;">' + tk('gsg_tab_orders', 'Group Orders') + ' (' + rows.length + ')</b>'
            + (g_sendPolicy_blocked() ? '' : '<button type="button" data-act="gsg-at-gorder" style="border:1px solid #D8B83A;background:#FFFBE8;color:#8a6d00;font-weight:800;font-size:11px;padding:7px 12px;border-radius:99px;cursor:pointer;">+ ' + tk('gsg_go_new', 'unda') + '</button>')
            + '</div>';
        if (!rows.length) { host.innerHTML = head + gsgEmptyTabHtml(tk('gsg_no_orders', 'Bado hakuna Group Order'), tk('gsg_no_orders_sub2', 'Tumia [+ unda] juu au kwenye composer — zimetimunya PHASE 4.')); return; }
        rows.sort(function (a, b) { return String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || '')); });
        host.innerHTML = head + rows.map(function (o) {
            var st = String(o.status || 'OPEN').replace(/_/g, ' ');
            var pct = o.targetQty ? Math.min(100, Math.round((+o.totalQty || 0) / (+o.targetQty || 1) * 100)) : 0;
            return '<div style="background:#FFF9E8;border:1px solid #ead98a;border-left:4px solid #D8B83A;border-radius:13px;padding:11px 13px;margin-bottom:9px;">'
                + '<div style="display:flex;align-items:center;gap:6px;">'
                + '<b style="flex:1;font-size:13px;color:#0f172a;">' + esc(o.productName || '') + '</b>'
                + '<span style="font-size:9.5px;font-weight:900;letter-spacing:.5px;color:#0f766e;background:#fff;border:1px solid #cbe9dd;border-radius:6px;padding:2px 7px;text-transform:uppercase;">' + esc(st) + '</span></div>'
                + '<div style="display:flex;justify-content:space-between;font-size:11px;color:#334155;font-weight:700;margin-top:6px;"><span>' + tk('gsg_go_qty', 'Kiasi kimejikusanywa') + '</span><span>' + (+o.totalQty || 0) + ' / ' + (+o.targetQty || 0) + '</span></div>'
                + '<div style="height:6px;border-radius:99px;background:#f1e9c6;margin-top:4px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#D8B83A,#18A982);"></div></div>'
                + '<div style="margin-top:6px;font-size:11px;color:#64748b;">TZS ' + (+o.targetPrice || 0) + (o.unit ? ' / ' + esc(o.unit) : '') + ' · ' + tk('gsg_go_dl', 'Mwisho') + ' ' + esc(String(o.deadline || '').slice(0, 10)) + ' · ' + (+o.participantCount || 0) + ' ' + tk('gsg_go_ppl', 'watoa ahadi') + '</div>'
                + '<button type="button" data-act="gsg-go-view" data-goid="' + esc(o.__id) + '" style="margin-top:8px;border:1px solid #D8B83A;background:#fff;color:#8a6d00;font-weight:800;font-size:10.5px;padding:6px 12px;border-radius:99px;cursor:pointer;">' + tk('disc_opp_view', 'Tazama') + ' ›</button>'
                + '</div>';
        }).join('');
    }

    async function renderMembersTab(gid) {
        var host = document.getElementById('gsgTabMembers');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var members = await window.skhGroupMembers(gid);
        var active = (members || []).filter(function (mm) { return mm.status === 'active'; });
        var names = await fetchNames(active.map(function (mm) { return mm.userId; }));
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'members') return;
        if (!active.length) { host.innerHTML = gsgEmptyTabHtml(tk('gsg_no_members', 'Hakuna wanachama'), ''); return; }
        var roleLbl = { owner: tk('grp_owner', 'Mmiliki'), admin: 'Admin', moderator: 'Moderator', organizer: tk('gsg_org2', 'Organizer'), member: tk('grp_member', 'Mwanachama') };
        host.innerHTML = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">'
            + '<div style="padding:10px 14px;border-bottom:1px solid #eef2f7;"><b style="font-size:11.5px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;">' + tk('gsg_members', 'Wanachama') + ' (' + active.length + ')</b></div>'
            + active.map(function (mm) {
                var nm = names[mm.userId] || mm.userId;
                var ini = esc(String(nm).trim().charAt(0).toUpperCase() || '?');
                var isMe = (mm.userId === uid());
                return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f1f5f9;">'
                    + '<span style="width:34px;height:34px;border-radius:11px;background:' + (isMe ? 'linear-gradient(135deg,#18A982,#0e7a5f)' : 'linear-gradient(135deg,#1268A8,#2B82BD)') + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;">' + ini + '</span>'
                    + '<div style="flex:1;min-width:0;"><b style="display:block;font-size:12.5px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(nm) + (mm.verifiedBusiness ? ' <span style="color:#1268A8;font-weight:900;">✓</span>' : '') + (isMe ? ' <small style="color:#94a3b8;font-weight:600;">(' + tk('me', 'Mimi') + ')</small>' : '') + '</b></div>'
                    + '<span style="font-size:9.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:' + (mm.role === 'owner' ? '#0B4F7A' : mm.role === 'admin' ? '#1268A8' : mm.role === 'organizer' ? '#8a6d00' : '#64748b') + ';background:' + (mm.role === 'owner' ? '#e0effa' : mm.role === 'admin' ? '#eef6fc' : mm.role === 'organizer' ? '#FFFBE8' : '#f1f5f9') + ';border-radius:6px;padding:3px 7px;">' + esc(roleLbl[mm.role] || mm.role || 'member') + '</span>'
                    + '</div>';
            }).join('')
            + '</div>'
            + '<small style="display:block;text-align:center;color:#94a3b8;margin-top:10px;font-size:10.5px;">' + tk('gsg_manage_hint', 'Udhibiti wa wanachama: tumia panel ya taarifa (☰) juu kulia.') + '</small>';
    }

    async function renderMediaTab(gid) {
        var host = document.getElementById('gsgTabMedia');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var imgs = [];
        try {
            var snap = await skh.getDocs(msgsCol(gid));
            if (snap && snap.forEach) snap.forEach(function (d) {
                var m = d.data() || {};
                var url = m.imageUrl || m.mediaUrl || (Array.isArray(m.attachments) && m.attachments.length ? (m.attachments[0].url || m.attachments[0].imageUrl) : null);
                if (url && (m.type === 'image' || m.type === 'photo' || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(url)))) imgs.push({ url: String(url), at: m.at || '', sender: m.senderName || '' });
            });
        } catch (eMD) {}
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'media') return;
        if (!imgs.length) { host.innerHTML = gsgEmptyTabHtml(tk('gsg_no_media', 'Bado hakuna media'), tk('gsg_no_media_sub', 'Picha/video/docs zinazoshirikiwa humu zitajaza sehemu hii — message types zinakuja kwenye phase ijayo.')); return; }
        host.innerHTML = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;">'
            + imgs.map(function (im) {
                return '<div title="' + esc(im.sender) + (im.at ? ' · ' + esc(String(im.at).slice(0, 10)) : '') + '" style="aspect-ratio:1;border-radius:9px;overflow:hidden;background:#e2e8f0 url(' + esc(im.url) + ') center/cover;"></div>';
            }).join('') + '</div>';
    }

    /* [§9] Pinned announcement card — subtle-blue, HAIWEEKANI ujumbe wa kawaida (pembeni, si bubble ya sender). */
    function renderAnnounce(ann) {
        var host = document.getElementById('gsgAnnounce');
        if (!host) return;
        if (!ann || !ann.text) { host.innerHTML = ''; host.style.display = 'none'; return; }
        var txt = String(ann.text);
        var full = !!CUR.__annOpen;
        var short = txt.length > 96 ? txt.slice(0, 96) + '…' : txt;
        host.style.display = 'block';
        host.innerHTML = '<div style="margin:9px 12px 0;padding:11px 13px;border-radius:13px;background:#eef6fc;border:1px solid #d3e6f5;border-left:4px solid #1268A8;" aria-live="polite">'
            + '<div style="display:flex;align-items:center;gap:7px;">'
            + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1268A8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v6l-2 4h10l-2-4V4"/><path d="M12 14v6"/><path d="M7 4h10"/></svg>'
            + '<b style="font-size:10.5px;color:#0B4F7A;letter-spacing:.5px;text-transform:uppercase;">' + tk('gsg_ann_', 'Tangazo la kikundi') + '</b>'
            + '<span style="flex:1;"></span>'
            + '<button type="button" data-act="gsg-ann-view" style="border:1px solid #1268A8;background:#fff;color:#1268A8;font-weight:800;font-size:10px;padding:4px 10px;border-radius:99px;cursor:pointer;">' + (full ? tk('gsg_ann_less', 'Funga') : tk('disc_opp_view', 'Tazama')) + '</button>'
            + '</div>'
            + '<div style="margin-top:6px;font-size:12px;color:#0B4F7A;line-height:1.5;">' + esc(full ? txt : short) + '</div>'
            + '</div>';
    }

    /* ================= [SPEC PHASE 4 §15] GROUP ORDER LIVE CARD =================
     * Msg ina SNAPSHOT ya kufungua haraka; hydrateGOCards huchakata VALUES halisi
     * kutoka doc (status/qty live) BILA full re-render — kadi HALITWINGA. */
    // [§24] SUPPLIER REQUEST: kadi ya maombi ya ofa — blue (sio gold); actions per-account
    function gsgSRCardHtml(m, my) {
        var sn = m.snapshot || {};
        var go = m.gorderId || '';
        return '<div data-srcard="1" data-goid="' + esc(go) + '" style="min-width:220px;max-width:280px;background:#F1F7FC;border:1px solid #cfe4f2;border-left:4px solid #1268A8;border-radius:13px;padding:11px 13px;">'
            + '<div style="display:flex;align-items:center;gap:6px;">'
            + '<span style="font-size:9px;font-weight:900;letter-spacing:.6px;color:#1268A8;background:#fff;border:1px solid #cfe4f2;border-radius:6px;padding:2px 7px;">' + tk('gsg_sr_badge', 'OMBA OFA') + '</span>'
            + '<span style="flex:1;font-size:11px;color:#475569;">' + esc(m.senderName || '') + '</span></div>'
            + '<b style="display:block;font-size:13.5px;color:#0f172a;margin-top:7px;">' + esc(sn.productName || '') + '</b>'
            + '<div style="margin-top:6px;font-size:11.5px;color:#334155;line-height:1.6;">'
            + tk('gsg_sr_need', 'Inahitajika:') + ' <b>' + (+sn.requiredQty || 0) + '</b>' + (sn.unit ? ' ' + esc(sn.unit) : '') + ' (' + tk('gsg_sr_tt', 'lengo') + ' ' + (+sn.targetQty || 0) + ')<br>'
            + tk('gsg_sr_area', 'Eneo:') + ' ' + esc(sn.deliveryArea || '—') + ' · ' + esc(sn.deliveryMethod === 'shared' ? tk('gsg_go_shared', 'Usafiri wa pamoja') : tk('gsg_go_individual', 'Kila mmoja')) + '<br>'
            + tk('gsg_sr_dl', 'Mwisho') + ': ' + esc(String(sn.deadline || '').slice(0, 10))
            + '</div>'
            + '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap;">'
            + '<button type="button" data-act="gsg-sr-offer" data-goid="' + esc(go) + '" style="flex:1;border:none;background:#18A982;color:#fff;font-weight:800;font-size:11.5px;padding:9px;border-radius:10px;cursor:pointer;">' + tk('gsg_sr_poly', 'Toa ofa') + '</button>'
            + '<span style="font-size:10px;font-weight:800;color:#1268A8;background:#fff;border:1px solid #cfe4f2;border-radius:6px;padding:6px 8px;align-self:center;" data-srcof="' + esc(go) + '">' + tk('gsg_sr_ofa', 'ofa') + ': ' + (+sn.offersCount || 0) + '</span>'
            + '</div></div>';
    }

    function gsgGOCardHtml(m, my) {
        var sn = m.snapshot || {};
        var go = m.gorderId || '';
        var pct = sn.targetQty ? Math.min(100, Math.round((+sn.totalQty || 0) / (+sn.targetQty || 1) * 100)) : 0;
        return '<div data-goid="' + esc(go) + '" style="min-width:220px;max-width:280px;background:#FFF9E8;border:1px solid #ead98a;border-left:4px solid #D8B83A;border-radius:13px;padding:11px 13px;">'
            + '<div style="display:flex;align-items:center;gap:6px;">'
            + '<span style="font-size:9px;font-weight:900;letter-spacing:.6px;color:#8a6d00;background:#fff;border:1px solid #ead98a;border-radius:6px;padding:2px 7px;">GROUP ORDER</span>'
            + '<span data-ls="1" style="font-size:9px;font-weight:900;letter-spacing:.5px;color:#0f766e;background:#fff;border:1px solid #cbe9dd;border-radius:6px;padding:2px 7px;">' + esc(String(sn.status || 'OPEN').replace(/_/g, ' ')) + '</span>'
            + '</div>'
            + '<b style="display:block;font-size:13.5px;color:#0f172a;margin-top:7px;">' + esc(sn.productName || '') + '</b>'
            + '<div style="margin-top:7px;">'
            + '<div style="display:flex;justify-content:space-between;font-size:11px;color:#334155;font-weight:700;">'
            + '<span>' + tk('gsg_go_qty', 'Kiasi kimejikusanywa') + '</span>'
            + '<span><span data-lvq="1">' + (+sn.totalQty || 0) + '</span> / ' + (+sn.targetQty || 0) + '</span></div>'
            + '<div style="height:7px;border-radius:99px;background:#f1e9c6;margin-top:4px;overflow:hidden;"><div data-lp="1" style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#D8B83A,#18A982);border-radius:99px;"></div></div>'
            + '</div>'
            + '<div style="margin-top:7px;font-size:11.5px;color:#334155;">'
            + (sn.targetPrice ? '<b style="color:#8a6d00;">TZS <span data-lpr="1">' + esc(String(sn.targetPrice)) + '</span></b>' + (sn.unit ? ' / ' + esc(String(sn.unit)) : '') : '')
            + ' · ' + tk('gsg_go_dl', 'Mwisho') + ': ' + esc(String(sn.deadline || '').slice(0, 10))
            + ' · ' + esc(sn.deliveryMethod === 'shared' ? tk('gsg_go_shared', 'Usafiri wa pamoja') : tk('gsg_go_individual', 'Kila mmoja'))
            + '</div>'
            + '<div data-gacts="1" data-goid="' + esc(go) + '" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:9px;">'
            + '<button type="button" data-act="gsg-go-interest" data-goid="' + esc(go) + '" style="border:1px solid #ead98a;background:#fffdf0;color:#8a6d00;font-weight:800;font-size:10px;padding:6px 10px;border-radius:99px;cursor:pointer;">☆ <span data-li="1">0</span> ' + tk('gsg_go_int', 'nivutie') + '</button>'
            + '<button type="button" data-act="gsg-go-join" data-goid="' + esc(go) + '" style="border:none;background:#D8B83A;color:#4a3900;font-weight:900;font-size:10.5px;padding:7px 13px;border-radius:99px;cursor:pointer;">' + tk('gsg_go_join', 'Jisajili') + '</button>'
            + '<button type="button" data-act="gsg-go-view" data-goid="' + esc(go) + '" style="border:1px solid #D8B83A;background:#fff;color:#8a6d00;font-weight:800;font-size:10.5px;padding:6px 12px;border-radius:99px;cursor:pointer;">' + tk('disc_opp_view', 'Tazama') + ' ›</button>'
            + '<span data-live="1" style="order:99;width:100%;font-size:10px;color:#b59a2e;margin-top:2px;"></span>'
            + '</div>'
            + '</div>';
    }

    async function hydrateGOCards(gid) {
        var host = document.getElementById('gsgMsgs');
        if (!host || !CUR.gid || CUR.gid !== gid) return;
        var seen = {}, ids = [];
        host.querySelectorAll('div[data-goid]').forEach(function (el) {
            var go = el.getAttribute('data-goid');
            if (go && !seen[go]) { seen[go] = 1; ids.push(go); }
        });
        for (var i = 0; i < ids.length; i++) {
            try {
                var d0 = await window.skhGroupOrderCheckDeadline(gid, ids[i]);   // [§36] auto-close zilizopita
                var d = await window.skhGroupOrderGet(gid, ids[i]);
                if (!d || CUR.gid !== gid) continue;
                var pct = d.targetQty ? Math.min(100, Math.round((+d.totalQty || 0) / (+d.targetQty || 1) * 100)) : 0;
                var st = String(d.status || 'OPEN').replace(/_/g, ' ');
                var stColor = d.status === 'CLOSED' ? '#64748b' : d.status === 'TARGET_REACHED' ? '#0f766e' : d.status === 'NEAR_TARGET' ? '#8a6d00' : '#0f766e';
                if (d.status === 'CANCELLED') stColor = '#dc2626';
                var needed = Math.max(0, (+d.targetQty || 0) - (+d.totalQty || 0));
                host.querySelectorAll('div[data-goid="' + ids[i] + '"]').forEach(function (el) {
                    if (el.getAttribute('data-act') === 'gsg-go-view') return;
                    var q = el.querySelector('[data-lvq]'); if (q) q.textContent = (+d.totalQty || 0);
                    var b2 = el.querySelector('[data-lp]'); if (b2) b2.style.width = pct + '%';
                    var st2 = el.querySelector('[data-ls]');
                    if (st2) { st2.textContent = st; st2.style.color = stColor; }
                    var acts = el.querySelector('[data-gacts]');
                    if (acts) acts.innerHTML = gsgGOActionsHtml(d, ids[i]);
                    var lv = el.querySelector('[data-live]');
                    if (lv) lv.textContent = gsgGOnextHint(d);
                    var pr2 = el.querySelector('[data-lpr]');
                    if (pr2 && window.skhTierInfo) pr2.textContent = String(window.skhTierInfo(d).price);
                });
                host.querySelectorAll('[data-srcof="' + ids[i] + '"]').forEach(function (sp) {
                    sp.textContent = tk('gsg_sr_ofa', 'ofa') + ': ' + (+d.offersCount || Object.keys(d.supplierOffers || {}).length || 0);
                });
            } catch (eH) {}
        }
    }

    /* [§36/§16-18] helpers za actions/countdown/count — text-only updates */
    function gsgONum(x) { return (+x || 0); }
    function gsgGOActionsHtml(d, goid) {
        var st = String(d.status || 'OPEN');
        var my = uid();
        var isPart = !!(d.participants && d.participants[my]);
        var isInt = !!(d.interested && d.interested[my]);
        var ic = d.interestedCount || 0;
        var joinable = (st === 'OPEN' || st === 'NEAR_TARGET');
        return (st === 'OPEN'
                ? '<button type="button" data-act="gsg-go-interest" data-goid="' + esc(goid) + '" style="border:1px solid ' + (isInt ? '#D8B83A' : '#ead98a') + ';background:' + (isInt ? '#FFF6D8' : '#fffdf0') + ';color:#8a6d00;font-weight:800;font-size:10px;padding:6px 10px;border-radius:99px;cursor:pointer;">' + (isInt ? '★ ' + tk('gsg_go_inted', 'ninavutiwa') : '☆ ' + tk('gsg_go_int', 'nivutie')) + ' · <span data-li="1">' + ic + '</span></button>'
                : '<span style="font-size:9.5px;color:#94a365;font-weight:700;">' + tk('gsg_go_int', 'nivutie') + ' ' + ic + '</span>')
            + (joinable
                ? '<button type="button" data-act="gsg-go-join" data-goid="' + esc(goid) + '" style="border:none;background:' + (isPart ? '#fff' : '#D8B83A') + ';color:' + (isPart ? '#4a3900' : '#4a3900') + ';' + (isPart ? 'border:1.5px solid #D8B83A;' : '') + 'font-weight:900;font-size:10.5px;padding:7px 13px;border-radius:99px;cursor:pointer;">'
                    + (isPart ? (tk('gsg_go_joined', 'Umejiunga') + ' · ' + (+d.participants[my].qty || 0)) : tk('gsg_go_join', 'Jisajili')) + '</button>'
                : '<button type="button" data-act="gsg-go-view-l" data-goid="' + esc(goid) + '" style="border:1px solid #ead98a;background:#fffdf0;color:#8a6d00;font-weight:800;font-size:10px;padding:6px 12px;border-radius:99px;cursor:pointer;">' + esc(st.replace(/_/g, ' ')) + '</button>')
            + '<button type="button" data-act="gsg-go-view" data-goid="' + esc(goid) + '" style="border:1px solid #D8B83A;background:#fff;color:#8a6d00;font-weight:800;font-size:10.5px;padding:6px 12px;border-radius:99px;cursor:pointer;">' + tk('disc_opp_view', 'Tazama') + ' ›</button>'
            + '<span data-live="1" style="order:99;width:100%;font-size:10px;color:#b59a2e;margin-top:2px;"></span>';
    }
    function gsgGOnextHint(d) {
        var parts = [];
        var st = String(d.status || 'OPEN');
        var dl = String(d.deadline || '').slice(0, 10);
        if (dl) {
            var msD = new Date(dl + 'T23:59:59').getTime() - Date.now();
            var days = Math.max(0, Math.ceil(msD / 86400000));
            parts.push(days > 0 ? (tk('gsg_go_left', 'baki') + ' ' + days + 'd') : tk('gsg_go_due', 'imewahi'));
        }
        var needed = Math.max(0, (+d.targetQty || 0) - (+d.totalQty || 0));
        if (needed > 0 && st !== 'CLOSED') parts.push(tk('gsg_go_need', 'bado') + ' ' + needed + ' ' + tk('gsg_go_need2', 'kutimiza lengo'));
        if (st === 'TARGET_REACHED') parts.push(tk('gsg_go_full', 'Lengo limetimia ✓'));
        return parts.join(' · ');
    }
    // interval huboresha countdown TU (text-only, no full rerender)
    var goTick = null;
    function startGoTick() {
        if (goTick) return;
        goTick = setInterval(function () {
            if (!CUR.gid) return;
            hydrateGOCards(CUR.gid);
        }, 45000);
    }
    function stopGoTick() { if (goTick) { clearInterval(goTick); goTick = null; } }

    /* [§28 placeholder-free] details sheet ya GROUP ORDER — data halisi tu, no fake CTA.
       Action za Interest/Join/Tiers/Offer zinakuja PHASE 5/6 — sasa siivi juu ya UI. */
    function closeGODetail() { var x = document.getElementById('gsgGoDetail'); if (x) x.remove(); }
    /* [§19] JOIN MODAL — product + price + QTY STEPPER + subtotal + estimate + [Join].
       JOIN ≠ PAY: hakuna malipo kabisa hatua hii — engine inaweka state COMMITTED. */
    function closeJoinMdl() { var x = document.getElementById('gsgGoJoin'); if (x) x.remove(); }
    async function openJoinMdl(goid) {
        closeJoinMdl();
        var gid = CUR.gid; if (!gid || !goid) return;
        var d = await window.skhGroupOrderGet(gid, goid);
        if (!d) return;
        if (['OPEN', 'NEAR_TARGET'].indexOf(String(d.status)) < 0) { try { window.showToast && window.showToast(tk('gsg_go_state', 'Group Order hii haijafunguliwa kwa ku-join sasa.'), 'info'); } catch (eT) {} return; }
        var myQty0 = (d.participants && d.participants[uid()]) ? (+d.participants[uid()].qty || 1) : 1;
        CUR.__joinQty = myQty0;
        var price = +d.targetPrice || 0;
        CUR.__joinPrice = price;
        var pop = document.createElement('div');
        pop.id = 'gsgGoJoin';
        pop.style.cssText = 'position:fixed;inset:0;z-index:100098;background:rgba(11,22,40,.45);display:flex;align-items:center;justify-content:center;padding:18px;';
        pop.innerHTML = '<div style="width:100%;max-width:380px;background:#fff;border-radius:16px;padding:17px;box-shadow:0 14px 44px rgba(11,22,40,.25);">'
            + '<div style="display:flex;align-items:center;gap:8px;">'
            + '<span style="font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#8a6d00;background:#FFF9E8;border:1px solid #ead98a;border-radius:6px;padding:2px 8px;">' + tk('gsg_go_join', 'Jisajili') + '</span>'
            + '<b style="flex:1;font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(d.productName || '') + '</b>'
            + '<button type="button" data-act="gsg-go-join-close" aria-label="' + tk('gsg_cancel', 'Ghairi') + '" style="border:none;background:#eef2f7;color:#334155;width:28px;height:28px;border-radius:99px;font-weight:900;cursor:pointer;">\u00d7</button></div>'
            + '<div style="margin-top:10px;font-size:12.5px;color:#334155;">' + tk('gsg_go_gprice', 'Bei ya kundi') + ': <b style="color:#8a6d00;">TZS ' + price + '</b>' + (d.unit ? ' / ' + esc(d.unit) : '') + '</div>'
            // stepper
            + '<div style="display:flex;align-items:center;gap:12px;margin-top:13px;">'
            + '<small style="font-size:11px;color:#64748b;font-weight:700;">' + tk('gsg_go_qty2', 'Kiasi') + ':</small>'
            + '<button type="button" data-act="gsg-jqty" data-d="-1" style="width:34px;height:34px;border-radius:11px;border:1.5px solid #cbd5e1;background:#fff;font-size:17px;font-weight:900;color:#334155;cursor:pointer;">−</button>'
            + '<b id="gsgJQty" style="flex:1;text-align:center;font-size:16px;color:#0f172a;">' + myQty0 + '</b>'
            + '<button type="button" data-act="gsg-jqty" data-d="1" style="width:34px;height:34px;border-radius:11px;border:1.5px solid #cbd5e1;background:#fff;font-size:17px;font-weight:900;color:#334155;cursor:pointer;">+</button></div>'
            + '<input id="gsgJVariant" type="text" maxlength="40" placeholder="' + tk('gsg_go_var_ph', 'Variant (hiari: size/rangi — mf: L, Nyekundu)') + '" value="' + ((d.participants && d.participants[uid()] && d.participants[uid()].variant) || '') + '" style="width:100%;margin-top:10px;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:12.5px;">'
            + '<input id="gsgJDest" type="text" maxlength="80" placeholder="' + tk('gsg_go_dest_ph', 'Pahala pa kupokea (hiari)') + '" value="' + ((d.participants && d.participants[uid()] && d.participants[uid()].destination) || d.deliveryArea || '') + '" style="width:100%;margin-top:7px;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:12.5px;">'
            + '<div style="display:flex;justify-content:space-between;margin-top:14px;padding:10px 12px;background:#f8fafc;border:1px solid #eef2f7;border-radius:11px;font-size:12.5px;color:#334155;">'
            + '<span>' + tk('gsg_go_subtotal', 'Subtotal') + '</span><b id="gsgJSub" style="color:#0f172a;">TZS ' + (price * myQty0) + '</b></div>'
            + '<div style="display:flex;justify-content:space-between;margin-top:6px;padding:10px 12px;background:#fffdf0;border:1px solid #ead98a;border-radius:11px;font-size:13px;color:#4a3900;">'
            + '<span>' + tk('gsg_go_total', 'JUMLA (ya makadirio)') + '</span><b id="gsgJTot">TZS ' + (price * myQty0) + '</b></div>'
            + '<div style="display:flex;justify-content:space-between;margin-top:7px;padding:9px 12px;background:#f8fafc;border:1px solid #eef2f7;border-radius:11px;font-size:11.5px;color:#64748b;">'
            + '<span>' + tk('gsg_go_est', 'Eneo/Njia') + '</span><span>' + esc(d.deliveryArea || '—') + ' · ' + esc(d.deliveryMethod === 'shared' ? tk('gsg_go_shared', 'Usafiri wa pamoja') : tk('gsg_go_individual', 'Kila mmoja')) + '</span></div>'
            + '<small style="display:block;margin-top:10px;color:#64748b;text-align:center;font-size:10.5px;">' + tk('gsg_go_no_pay', 'Join ≠ Lipa: hautadaiwi chochote sasa. Malipo yatafuatia logic ya escrow.') + '</small>'
            + '<button type="button" data-act="gsg-go-join-save" data-goid="' + esc(goid) + '" style="width:100%;margin-top:12px;border:none;background:#D8B83A;color:#4a3900;font-weight:900;font-size:13.5px;padding:13px;border-radius:12px;cursor:pointer;">' + (myQty0 > 0 && d.participants && d.participants[uid()] ? tk('gsg_go_update', 'Sasisha kiasi') : tk('gsg_go_join', 'Jisajili')) + '</button>'
            + '</div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeJoinMdl(); });
        document.body.appendChild(pop);
    }
    function refreshJoinQty() {
        var el = document.getElementById('gsgJQty'); var sb = document.getElementById('gsgJSub');
        if (el) el.textContent = CUR.__joinQty;
        if (sb) sb.textContent = 'TZS ' + ((CUR.__joinPrice || 0) * CUR.__joinQty);
        var tt2 = document.getElementById('gsgJTot'); if (tt2) tt2.textContent = sb.textContent;
    }

    /* ================= [SPEC PHASE 6 §16/17 §24/25] TIERS + OFFERS pops ================= */
    function closeP6() { ['gsgTierMdl', 'gsgOfferMdl', 'gsgOffersSh'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); }); }

    function openTierSetMdl(goid) {                      // [§16/46] organizer tu — mini-form 3 rows
        closeP6(); if (!CUR.gid || !goid) return;
        window.skhGroupOrderGet(CUR.gid, goid).then(function (d) {
            if (!d) return;
            var rows = (Array.isArray(d.priceTiers) ? d.priceTiers : []).slice(0, 3);
            while (rows.length < 3) rows.push({ minQty: '', price: '' });
            var pop = document.createElement('div');
            pop.id = 'gsgTierMdl';
            pop.style.cssText = 'position:fixed;inset:0;z-index:100099;background:rgba(11,22,40,.45);display:flex;align-items:center;justify-content:center;padding:18px;';
            pop.innerHTML = '<div style="width:100%;max-width:380px;background:#fff;border-radius:16px;padding:17px;box-shadow:0 14px 44px rgba(11,22,40,.25);">'
                + '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:2px 8px;">TIERS §16</span>'
                + '<b style="flex:1;font-size:14px;color:#0f172a;">' + tk('gsg_go_tiers3', 'Weka bei inaopungua') + '</b>'
                + '<button type="button" data-act="gsg-tier-close" style="border:none;background:#eef2f7;color:#334155;width:28px;height:28px;border-radius:99px;font-weight:900;cursor:pointer;">\u00d7</button></div>'
                + '<small style="display:block;margin-top:6px;color:#64748b;font-size:10.5px;">' + tk('gsg_go_tiers4', 'Kiasi ≥ bei haiwezi panda kwa row zifuatazo; rows zisivotumika acha wazi.') + '</small>'
                + rows.map(function (r, i) {
                    return '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;">'
                        + '<input id="tm_' + i + '_q" type="number" min="2" max="1000000" placeholder="' + tk('gsg_go_t_from', 'Kiasi ≥') + '" value="' + (r.minQty || '') + '" style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:13px;">'
                        + '<input id="tm_' + i + '_p" type="number" min="1" max="1000000000" placeholder="TZS / ' + esc(d.unit || 'unit') + '" value="' + (r.price || '') + '" style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:13px;"></div>';
                }).join('')
                + '<button type="button" data-act="gsg-tier-save" data-goid="' + esc(goid) + '" style="width:100%;margin-top:14px;border:none;background:#18A982;color:#fff;font-weight:900;font-size:13.5px;padding:12px;border-radius:12px;cursor:pointer;">' + tk('save', 'Hifadhi') + '</button>'
                + '</div>';
            pop.addEventListener('click', function (ev) { if (ev.target === pop) closeP6(); });
            document.body.appendChild(pop);
        });
    }

    function openOfferMdl(goid) {                        // [§25] seller — ea moja kwa muuzaji mmoja (replace inaruhusiwa kubadilisha)
        closeP6(); if (!CUR.gid || !goid) return;
        window.skhGroupOrderGet(CUR.gid, goid).then(function (d) {
            if (!d) return;
            var mine = (d.supplierOffers || {})[uid()] || null;
            var pop = document.createElement('div');
            pop.id = 'gsgOfferMdl';
            pop.style.cssText = 'position:fixed;inset:0;z-index:100099;background:rgba(11,22,40,.45);display:flex;align-items:center;justify-content:center;padding:18px;';
            pop.innerHTML = '<div style="width:100%;max-width:380px;background:#fff;border-radius:16px;padding:17px;box-shadow:0 14px 44px rgba(11,22,40,.25);">'
                + '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:2px 8px;">OFA §25</span>'
                + '<b style="flex:1;font-size:14px;color:#0f172a;">' + esc(d.productName || '') + '</b>'
                + '<button type="button" data-act="gsg-of-close" style="border:none;background:#eef2f7;color:#334155;width:28px;height:28px;border-radius:99px;font-weight:900;cursor:pointer;">\u00d7</button></div>'
                + (mine ? '<small style="display:block;margin-top:6px;color:#0f766e;background:#f0faf6;border:1px solid #cbe9dd;border-radius:8px;padding:6px 8px;font-size:10.5px;">' + tk('gsg_go_of_edit', 'Una ofa ya awali — ku-hifadhi kunasasisha yako ya mwanzo.') + '</small>' : '')
                + '<input id="ofPrice" type="number" min="1" max="1000000000" placeholder="' + tk('gsg_go_of_price', 'Bei yako (TZS / ' + (d.unit || 'unit') + ')') + '" value="' + (mine ? mine.price : '') + '" style="width:100%;margin-top:10px;padding:11px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:13px;">'
                + '<input id="ofQty" type="number" min="1" max="1000000" placeholder="' + tk('gsg_go_of_qty', 'Idadi unayoweza kutoa') + '" value="' + (mine ? mine.availableQty : '') + '" style="width:100%;margin-top:8px;padding:11px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:13px;">'
                + '<input id="ofDays" type="number" min="0" max="90" placeholder="' + tk('gsg_go_of_days', 'Siku za kutoa usafihinati (0-90)') + '" value="' + (mine ? mine.deliveryDays : '') + '" style="width:100%;margin-top:8px;padding:11px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:13px;">'
                + '<textarea id="ofNote" maxlength="200" placeholder="' + tk('gsg_go_of_note', 'Maelezo (mfano: grade, upatikanaji, njia)') + '" style="width:100%;margin-top:8px;padding:11px;border:1.5px solid #e2e8f0;border-radius:11px;font-size:12.5px;min-height:64px;">' + (mine ? esc(mine.note || '') : '') + '</textarea>'
                + '<button type="button" data-act="gsg-of-save" data-goid="' + esc(goid) + '" style="width:100%;margin-top:12px;border:none;background:#18A982;color:#fff;font-weight:900;font-size:13.5px;padding:12px;border-radius:12px;cursor:pointer;">' + tk('gsg_sr_poly', 'Toa ofa') + '</button>'
                + '</div>';
            pop.addEventListener('click', function (ev) { if (ev.target === pop) closeP6(); });
            document.body.appendChild(pop);
        });
    }

    async function openOffersSh(goid) {                   // [§25] comparison — SI auto-best; organizer humchagua
        closeP6(); if (!CUR.gid || !goid) return;
        var d = await window.skhGroupOrderGet(CUR.gid, goid);
        if (!d) return;
        var isOrg = (d.organizerId === uid()) || (CUR.__myRole === 'owner' || CUR.__myRole === 'admin');
        var offers = d.supplierOffers || {};
        var ids = Object.keys(offers);
        var selId = d.selectedOffer ? d.selectedOffer.supplierId : null;
        var pop = document.createElement('div');
        pop.id = 'gsgOffersSh';
        pop.style.cssText = 'position:fixed;inset:0;z-index:100099;background:rgba(11,22,40,.45);display:flex;align-items:flex-end;justify-content:center;';
        var head = '<div style="display:flex;align-items:center;gap:8px;">'
            + '<span style="font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:2px 8px;">OFA §25</span>'
            + '<b style="flex:1;font-size:14px;color:#0f172a;">' + esc(d.productName || '') + ' (' + ids.length + ')</b>'
            + '<button type="button" data-act="gsg-ofs-close" style="border:none;background:#eef2f7;color:#334155;width:28px;height:28px;border-radius:99px;font-weight:900;cursor:pointer;">\u00d7</button></div>'
            + '<small style="display:block;margin-top:5px;color:#94a365;font-size:10.5px;">' + tk('gsg_go_of_nobest', 'Mfumo HAUCHAGUI mwenyewe mwenye bei nzuri — mwandaaji huamua kwa sababu zote.') + '</small>';
        var rowsH = ids.length ? ids.map(function (sid) {
            var o = offers[sid];
            var sel = selId === sid;
            return '<div style="margin-top:8px;background:#fff;border:1px solid ' + (sel ? '#18A982' : '#e2e8f0') + ';border-radius:12px;padding:10px 11px;' + (sel ? 'box-shadow:0 0 0 2px #d1f2e4;' : '') + '">'
                + '<div style="display:flex;align-items:center;gap:8px;">'
                + '<b style="flex:1;font-size:13px;color:#0f172a;">' + esc(o.supplierName || sid) + '</b>'
                + (sel ? '<span style="font-size:9px;font-weight:900;color:#0f766e;background:#f0faf6;border:1px solid #cbe9dd;border-radius:5px;padding:2px 7px;">' + tk('gsg_go_of_sel', 'ILIYOCHAGULIWA ✓') + '</span>' : '') + '</div>'
                + '<div style="display:flex;gap:12px;margin-top:5px;font-size:12px;color:#334155;flex-wrap:wrap;">'
                + '<span>' + tk('gsg_go_of_price2', 'Bei') + ': <b style="color:#0B4F7A;">TZS ' + (+o.price || 0) + '</b></span>'
                + '<span>' + tk('qty', 'Idadi') + ': <b>' + (+o.availableQty || 0) + '</b></span>'
                + '<span>' + tk('gsg_go_of_days2', 'Siku') + ': <b>' + (+o.deliveryDays || 0) + '</b></span></div>'
                + (o.note ? '<div style="margin-top:4px;font-size:11.5px;color:#475569;">' + esc(o.note) + '</div>' : '')
                + (isOrg && !sel && ['OPEN', 'NEAR_TARGET'].indexOf(String(d.status)) >= 0 ? '<button type="button" data-act="gsg-ofs-select" data-goid="' + esc(goid) + '" data-sid="' + esc(sid) + '" style="margin-top:9px;border:1.5px solid #1268A8;background:#eef6fc;color:#0B4F7A;font-weight:800;font-size:11.5px;padding:8px 12px;border-radius:10px;cursor:pointer;">' + tk('gsg_go_of_choose', 'Chagua ofa hii') + '</button>' : '')
                + ((sid === uid() && !sel && ['OPEN', 'NEAR_TARGET'].indexOf(String(d.status)) >= 0) ? '<button type="button" data-act="gsg-ofs-withdraw" data-goid="' + esc(goid) + '" style="margin-top:9px;margin-left:6px;border:1px solid #fecaca;background:#fff;color:#dc2626;font-weight:800;font-size:11px;padding:7px 11px;border-radius:10px;cursor:pointer;">' + tk('gsg_go_of_with', 'Ondoa ofa yangu') + '</button>' : '')
                + '</div>';
        }).join('') : '<small style="display:block;margin-top:12px;text-align:center;color:#94a365;font-size:11.5px;">' + tk('gsg_go_of_none', 'Bado hakuna ofa iliyowasilishwa.') + '</small>';
        pop.innerHTML = '<div style="width:100%;max-width:430px;max-height:70vh;overflow-y:auto;background:#F1F7FC;border-radius:18px 18px 0 0;padding:16px 16px 22px;">' + head + rowsH + '</div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeP6(); });
        document.body.appendChild(pop);
    }

    async function openGODetail(goid) {
        closeGODetail();
        var gid = CUR.gid; if (!gid || !goid) return;
        // [FIX 2026-09-19 ONE-CLICK NO BLINK] Instant skeleton before fetch
        try {
            var popSk = document.createElement('div');
            popSk.id = 'gsgGoDetail';
            popSk.style.cssText = 'position:fixed;inset:0;z-index:100097;background:rgba(11,22,40,.4);display:flex;align-items:flex-end;';
            popSk.innerHTML = '<div style="width:100%;max-height:86vh;overflow-y:auto;background:#FFFBE8;border-radius:18px 18px 0 0;padding:20px;text-align:center;"><div style="display:inline-block;width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#1268A8;border-radius:50%;animation:spin 0.8s linear infinite;"></div><div style="margin-top:10px;color:#8a6d00;font-size:13px;">Inafungua Group Order...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
            popSk.addEventListener('click', function(ev){ if(ev.target===popSk) closeGODetail(); });
            document.body.appendChild(popSk);
        } catch(eSk){}
        var d;
        try { d = await window.skhGroupOrderGet(gid, goid); } catch(e){ d=null; }
        try { var skEl=document.getElementById('gsgGoDetail'); if(skEl) skEl.remove(); } catch(eR){}
        if (!d) { try { window.showToast && window.showToast(tk('gsg_go_gone', 'Group Order haipatikani'), 'info'); } catch (eT) {} return; }
        var pop = document.createElement('div');
        pop.id = 'gsgGoDetail';
        pop.style.cssText = 'position:fixed;inset:0;z-index:100097;background:rgba(11,22,40,.4);display:flex;align-items:flex-end;';
        var row = function (l, v) { return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #f1e9c6;"><small style="color:#8a6d00;font-weight:700;">' + esc(l) + '</small><b style="font-size:12.5px;color:#0f172a;text-align:right;">' + esc(String(v)) + '</b></div>'; };
        var meU = uid();
        var isOrg = (d.organizerId === meU) || (CUR.__myRole === 'owner' || CUR.__myRole === 'admin');
        var isPart = !!(d.participants && d.participants[meU]);
        var isInt = !!(d.interested && d.interested[meU]);
        var needed = Math.max(0, (+d.targetQty || 0) - (+d.totalQty || 0));
        var stOpen = ['OPEN', 'NEAR_TARGET'].indexOf(String(d.status)) >= 0;
        var namesCache = {};
        if (isOrg && d.participants) { try { namesCache = await fetchNames(Object.keys(d.participants)); } catch (eFN) {} }
        // [§26] organizer panel feed — shughuli za order hii (read-only)
        var orgFeed = [];
        if (isOrg && window.skhGroupEventsList) { try { orgFeed = await window.skhGroupEventsList(gid, goid, 6) || []; } catch (eFL) { orgFeed = []; } }
        var childInfo = null;
        if (window.skhGroupOrderChildList) { try { childInfo = await window.skhGroupOrderChildList(gid, goid); } catch (eCL) { childInfo = null; } }
        var pct = d.targetQty ? Math.min(100, Math.round((+d.totalQty || 0) / (+d.targetQty || 1) * 100)) : 0;
        pop.innerHTML = '<div style="width:100%;max-height:86vh;overflow-y:auto;background:#FFFBE8;border-radius:18px 18px 0 0;padding:16px 16px 24px;box-shadow:0 -8px 30px rgba(11,22,40,.22);">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
            + '<span style="font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#8a6d00;background:#fff;border:1px solid #ead98a;border-radius:6px;padding:2px 8px;">GROUP ORDER</span>'
            + '<span style="flex:1;"></span>'
            + '<button type="button" data-act="gsg-go-close" aria-label="' + tk('gsg_cancel', 'Ghairi') + '" style="border:none;background:#efe3b2;color:#8a6d00;width:29px;height:29px;border-radius:99px;font-weight:900;cursor:pointer;">\u00d7</button></div>'
            + '<b style="display:block;font-size:16px;color:#0f172a;margin-bottom:2px;">' + esc(d.productName || '') + '</b>'
            + '<span style="display:inline-block;font-size:10px;font-weight:900;letter-spacing:.5px;color:#0f766e;background:#fff;border:1px solid #cbe9dd;border-radius:6px;padding:3px 8px;text-transform:uppercase;">' + esc(String(d.status || 'OPEN').replace(/_/g, ' ')) + '</span>'
            + '<div style="margin:12px 0;height:8px;border-radius:99px;background:#f1e9c6;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#D8B83A,#18A982);"></div></div>'
            + row(tk('gsg_go_planned', 'Kiasi kilichoahidiwa'), (+d.totalQty || 0) + ' / ' + (+d.targetQty || 0))
            + row(tk('gsg_go_price', 'Bei lengo'), 'TZS ' + (+d.targetPrice || 0) + (d.unit ? ' / ' + d.unit : ''))
            + row(tk('gsg_go_dl', 'Mwisho'), String(d.deadline || '').slice(0, 10))
            + row(tk('gsg_go_area', 'Eneo la kufikisha'), d.deliveryArea || '—')
            + row(tk('gsg_go_method', 'Njia'), d.deliveryMethod === 'shared' ? tk('gsg_go_shared', 'Usafiri wa pamoja') : tk('gsg_go_individual', 'Kila mmoja'))
            + row(tk('gsg_go_sup', 'Muuzaji'), d.supplierMode === 'named' ? (d.supplierName || '—') : tk('gsg_go_ro', 'Kutafuta ofa (offers)'))
            + row(tk('gsg_go_org', 'Mwandaaji'), d.organizerName || '—')
            + row(tk('gsg_go_parts', 'Watoa ahadi'), (+d.participantCount || 0))
            // [§16/36] countdown + units-needed lines
            + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">'
            + '<span style="font-size:10px;font-weight:800;color:#8a6d00;background:#fff;border:1px solid #ead98a;border-radius:6px;padding:4px 8px;">' + esc(gsgGOnextHint(d) || '—') + '</span>'
            + (needed ? '<span style="font-size:10px;font-weight:800;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:4px 8px;">' + needed + ' ' + tk('gsg_go_need3', 'zipi zinahitajika') + '</span>' : '')
            + ((+d.interestedCount || 0) ? '<span style="font-size:10px;font-weight:800;color:#8a6d00;background:#fffdf0;border:1px solid #ead98a;border-radius:6px;padding:4px 8px;">' + (+d.interestedCount) + ' ' + tk('gsg_go_ints', 'wanaovutiwa') + '</span>' : '')
            + '</div>'
            // [§16/17] PRICE TIERS table — current tier highlighted, 'N more to next'
            + (window.skhTierInfo ? (function () {
                var ti = window.skhTierInfo(d);
                var tiers = Array.isArray(d.priceTiers) ? d.priceTiers : [];
                if (!tiers.length) {
                    return '<div style="margin-top:10px;background:#fffdf0;border:1px dashed #ead98a;border-radius:12px;padding:9px 11px;font-size:11px;color:#8a6d00;">'
                        + tk('gsg_go_notiers', 'Hakuna price tiers bado — organizer anaweza kuziweka bei inaopungua inapofuka.') + '</div>';
                }
                var th = '<b style="display:block;font-size:11px;color:#8a6d00;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">' + tk('gsg_go_tiers', 'Bei (Price Tiers)') + '</b>';
                var headRow = '<div style="display:flex;gap:8px;font-size:10px;font-weight:900;color:#94a365;text-transform:uppercase;padding:4px 10px;border-bottom:1px solid #f1e9c6;"><span style="flex:1;">' + tk('gsg_go_t_from', 'Kiasi ≥') + '</span><span>' + tk('gsg_go_t_price', 'Bei / ' + (d.unit || 'unit')) + '</span></div>';
                var rs = '<div style="display:flex;gap:8px;font-size:12px;padding:7px 10px;border-bottom:1px solid #faf6e8;' + (ti.idx === -1 ? 'background:#fde68a33;font-weight:800;' : 'color:#334155;') + '">'
                    + '<span style="flex:1;">1+</span><span>TZS ' + (+d.targetPrice || 0) + '</span>' + (ti.idx === -1 ? '<span style="font-size:9px;font-weight:900;color:#8a6d00;background:#fff;border:1px solid #ead98a;border-radius:5px;padding:1px 6px;">' + tk('gsg_go_t_now', 'SASA') + '</span>' : '') + '</div>';
                rs += tiers.map(function (t2, ii) {
                    var cur = (ti.idx === ii);
                    return '<div style="display:flex;gap:8px;font-size:12px;padding:7px 10px;border-bottom:1px solid #faf6e8;' + (cur ? 'background:#fde68a33;font-weight:800;' : 'color:#334155;') + '">'
                        + '<span style="flex:1;">' + (+t2.minQty) + '+</span><span>TZS ' + (+t2.price || 0) + '</span>'
                        + (cur ? '<span style="font-size:9px;font-weight:900;color:#8a6d00;background:#fff;border:1px solid #ead98a;border-radius:5px;padding:1px 6px;">' + tk('gsg_go_t_now', 'SASA') + '</span>' : '') + '</div>';
                }).join('');
                var nxt = ti.next ? '<div style="padding:8px 10px;font-size:11px;color:#0B4F7A;background:#eef6fc;border-top:1px solid #d3e6f5;">'
                    + tk('gsg_go_t_need', 'Bado') + ' <b>' + ti.needed + '</b> ' + tk('gsg_go_t_next', 'kufikia bei ya') + ' <b>TZS ' + (+ti.next.price || 0) + '</b>' + '</div>' : '';
                return '<div style="margin-top:10px;background:#fff;border:1px solid #ead98a;border-radius:12px;overflow:hidden;">' + th + headRow + rs + nxt + '</div>';
            })() : '')
            // [§24/25] SUPPLIER + OFFERS block
            + (function () {
                var offers = d.supplierOffers || {};
                var oCnt = +d.offersCount || Object.keys(offers).length || 0;
                if (d.selectedOffer && d.selectedOffer.supplierId) {
                    return '<div style="margin-top:10px;background:#f0faf6;border:1px solid #cbe9dd;border-radius:12px;padding:9px 11px;">'
                        + '<b style="display:block;font-size:10.5px;color:#0f766e;text-transform:uppercase;letter-spacing:.4px;">' + tk('gsg_go_seller2', 'Muuzaji aliyechaguliwa') + '</b>'
                        + '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:12px;color:#164e3f;"><b>' + esc(d.selectedOffer.supplierName || d.selectedOffer.supplierId) + '</b>'
                        + '<span>TZS ' + (+d.selectedOffer.price || 0) + (d.unit ? ' / ' + esc(d.unit) : '') + (d.selectedOffer.deliveryDays != null ? ' · ' + (+d.selectedOffer.deliveryDays) + 'd' : '') + '</span></div></div>';
                }
                var orgBtns = '';
                if (isOrg && stOpen && !d.selectedOffer) {
                    orgBtns = '<button type="button" data-act="gsg-go-tiers-set" data-goid="' + esc(goid) + '" style="border:1px solid #ead98a;background:#fffdf0;color:#8a6d00;font-weight:800;font-size:11px;padding:8px 11px;border-radius:10px;cursor:pointer;">' + (Array.isArray(d.priceTiers) && d.priceTiers.length ? tk('gsg_go_tiers2', 'Hariri tiers') : tk('gsg_go_tiers1', '+ Weka tiers')) + '</button>'
                        + (d.offersOpen === true
                            ? '<button type="button" data-act="gsg-go-offers" data-goid="' + esc(goid) + '" style="border:1px solid #d3e6f5;background:#eef6fc;color:#0B4F7A;font-weight:800;font-size:11px;padding:8px 11px;border-radius:10px;cursor:pointer;">' + tk('gsg_go_offers2', 'Tazama ofa') + ' (' + oCnt + ') §25</button>'
                            : '<button type="button" data-act="gsg-go-reqoffers" data-goid="' + esc(goid) + '" style="border:1px solid #d3e6f5;background:#eef6fc;color:#0B4F7A;font-weight:800;font-size:11px;padding:8px 11px;border-radius:10px;cursor:pointer;">' + tk('gsg_go_offers1', 'Omba ofa za wauzaji') + ' §24</button>');
                }
                var line = d.offersOpen === true
                    ? tk('gsg_go_of_open', 'Maombi ya ofa yamefunguliwa — ofa iliyowekwa:') + ' ' + oCnt + (oCnt === 0 ? '' : (isOrg ? '' : ' · ' + tk('gsg_go_priv2', '(details kwa mwandaaji)')))
                    : tk('gsg_go_of_wait', 'Bado kuomba ofa za wauzaji (mwandaaji huamua §24).');
                return '<div style="margin-top:10px;background:#fff;border:1px dashed #d3e6f5;border-radius:12px;padding:9px 11px;">'
                    + '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;"><small style="flex:1;font-size:11px;color:#64748b;">' + esc(line) + '</small>' + orgBtns + '</div></div>';
            })()
            // [§21] MY STATE row (viewer-side halisi)
            + '<div style="margin-top:10px;">' + (isPart
                ? '<span style="font-size:11.5px;font-weight:800;color:#0f766e;background:#f0faf6;border:1px solid #cbe9dd;border-radius:8px;padding:6px 10px;display:inline-block;">✓ ' + tk('gsg_go_joined', 'Umejiunga') + ' · ' + tk('gsg_go_qty2', 'kiasi') + ' ' + (+d.participants[meU].qty || 0) + ' · ' + esc(String(d.participants[meU].state || 'COMMITTED')) + '</span>'
                : '<span style="font-size:11px;color:#64748b;">' + tk('gsg_go_notjoined', 'Hujajiunga bado — join ≠ lipa: hutadaiwi chochote sasa.') + '</span>')
            + '</div>'
            // [§21/§27] participants details — ORGANIZER/ADMIN tu, wengine aggregates
            + (isOrg
                ? '<div style="margin-top:12px;background:#fff;border:1px solid #ead98a;border-radius:12px;overflow:hidden;">'
                    + '<b style="display:block;font-size:11px;color:#8a6d00;text-transform:uppercase;letter-spacing:.4px;padding:9px 12px;border-bottom:1px solid #f1e9c6;">' + tk('gsg_go_parts2', 'Watoa ahadi — details (mwandaaji tu)') + '</b>'
                    + Object.keys(d.participants || {}).map(function (pu) {
                        var pl = d.participants[pu];
                        return '<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid #faf6e8;font-size:12px;color:#334155;">'
                            + '<b style="font-weight:700;">' + esc((namesCache[pu] || pu)) + '</b>'
                            + '<span>' + (+pl.qty || 0) + ' · ' + esc(String(pl.state || 'COMMITTED')) + '</span></div>';
                    }).join('')
                    + '</div>'
                : '<small style="display:block;margin-top:12px;color:#94a365;text-align:center;font-size:10.5px;">' + tk('gsg_go_priv', 'Hesabu za wanunuzi ni aggregates — details ni ya mwandaaji/admin tu (§21).') + '</small>')
            // [§26] PANEL YA MWANDAAJI — yuko karibu na washikwasha participants; feed halisi
            + (isOrg
                ? '<div style="margin-top:12px;background:#F1F7FC;border:1px solid #cfe4f2;border-radius:12px;overflow:hidden;">'
                    + '<b style="display:block;font-size:10.5px;color:#1268A8;text-transform:uppercase;letter-spacing:.4px;padding:9px 12px;border-bottom:1px solid #dfeaf4;">' + tk('gsg_go_panel', 'Panel ya Mwandaaji') + ' · §26</b>'
                    + '<div style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;">'
                    + '<span style="font-size:10px;font-weight:800;color:#0B4F7A;background:#fff;border:1px solid #d3e6f5;border-radius:6px;padding:4px 8px;">' + (+d.participantCount || 0) + ' ' + tk('gsg_go_p_ppl', 'watoa ahadi') + '</span>'
                    + '<span style="font-size:10px;font-weight:800;color:#0B4F7A;background:#fff;border:1px solid #d3e6f5;border-radius:6px;padding:4px 8px;">' + (+d.interestedCount || 0) + ' ' + tk('gsg_go_p_int', 'wanaovutiwa') + '</span>'
                    + '<span style="font-size:10px;font-weight:800;color:#0B4F7A;background:#fff;border:1px solid #d3e6f5;border-radius:6px;padding:4px 8px;">' + ((+d.offersCount || Object.keys(d.supplierOffers || {}).length) || 0) + ' ' + tk('gsg_go_p_ofa', 'ofa') + '</span>'
                    + '</div>'
                    + (orgFeed.length
                        ? '<div style="padding:0 12px 8px;">' + orgFeed.map(function (ev2) {
                            var tm = String(ev2.at || '').slice(5, 16).replace('T', ' ');
                            var lbl = String(ev2.type || '').replace(/^go_/, '').replace(/_/g, ' ').toUpperCase();
                            return '<div style="display:flex;gap:8px;font-size:10.5px;color:#334155;padding:3px 0;">'
                                + '<span style="color:#94a3b8;font-weight:700;white-space:nowrap;">' + esc(tm) + '</span>'
                                + '<span style="flex:1;">' + esc(lbl) + (ev2.note ? ' · ' + esc(String(ev2.note).slice(0, 40)) : '') + '</span></div>';
                        }).join('') + '</div>'
                        : '<small style="display:block;padding:0 12px 9px;color:#94a3b8;font-size:10px;">' + tk('gsg_go_p_noev', 'Bado hakuna shughuli.') + '</small>')
                    + '<small style="display:block;padding:8px 12px;background:#f8fbfe;border-top:1px solid #dfeaf4;color:#64748b;font-size:10px;line-height:1.5;">' + tk('gsg_go_p_esc2', 'Mwandaaji HAIJALI/MILIKI fedha za washiriki — malipo hukaa kwenye SokoHai escrow architecture (§26).') + '</small>'
                    + '</div>'
                : '')
            + (childInfo && childInfo.count ? gsgChildOrdersBlock(childInfo, isOrg) : '')
            // [§37] INVITE + ACTIONS row
            + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:14px;">'
            + (stOpen
                ? (!isPart ? '<button type="button" data-act="gsg-go-join" data-goid="' + esc(goid) + '" style="flex:1;border:none;background:#D8B83A;color:#4a3900;font-weight:900;font-size:12.5px;padding:11px;border-radius:12px;cursor:pointer;">' + tk('gsg_go_join', 'Jisajili') + '</button>'
                            : '<button type="button" data-act="gsg-go-unjoin" data-goid="' + esc(goid) + '" style="flex:1;border:1.5px solid #D8B83A;background:#fff;color:#8a6d00;font-weight:800;font-size:12px;padding:11px;border-radius:12px;cursor:pointer;">' + tk('gsg_go_unjoin', 'Ondoa ahadi yangu') + '</button>')
                : '')
            + (stOpen ? '<button type="button" data-act="gsg-go-invite" data-goid="' + esc(goid) + '" style="border:1px solid #ead98a;background:#fffdf0;color:#8a6d00;font-weight:800;font-size:11.5px;padding:10px 13px;border-radius:12px;cursor:pointer;">' + tk('gsg_go_invite', 'Mwalike mwingine') + ' §37</button>' : '')
            + (isOrg && ['CLOSED', 'CANCELLED', 'COMPLETED', 'PROCESSING'].indexOf(String(d.status)) < 0
                ? '<button type="button" data-act="gsg-go-close2" data-goid="' + esc(goid) + '" style="border:1px solid #fecaca;background:#fff;color:#dc2626;font-weight:800;font-size:11.5px;padding:10px 13px;border-radius:12px;cursor:pointer;">' + tk('gsg_go_close3', 'Funga') + '</button>'
                : '')
            + '</div>'
            + (d.description ? '<div style="margin-top:10px;font-size:12px;color:#334155;line-height:1.55;background:#fff;border:1px solid #ead98a;border-radius:10px;padding:10px 11px;">' + esc(d.description) + '</div>' : '')
            + '</div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeGODetail(); });
        document.body.appendChild(pop);
    }

    /* ================= [SPEC PHASE 8 §28–§34] CHILD ORDERS BLOCK + ORDER WORKSPACE ================= */
    function gsgCOStatusChip(st) {
        var M = { payment_pending: ['#8a6d00', '#fffdf0', '#ead98a', 'INASUBIRI MALIPO'], secured: ['#0B4F7A', '#eef6fc', '#d3e6f5', 'IMELIPWA'], confirmed: ['#0B4F7A', '#eef6fc', '#d3e6f5', 'IMEKUBALIWA'], ready: ['#0f766e', '#f0faf6', '#cbe9dd', 'TAYARI'], in_transit: ['#9a3412', '#fff7ed', '#fed7aa', 'NJIANI'], delivered: ['#0f766e', '#f0faf6', '#cbe9dd', 'IMEWASILISHWA'], completed: ['#0f766e', '#f0faf6', '#18A982', 'IMEKAMILIKA'], rejected: ['#b91c1c', '#fef2f2', '#fecaca', 'IMEKATALIWA'] };
        var m2 = M[st] || ['#64748b', '#f8fafc', '#e2e8f0', String(st || '—').toUpperCase().replace(/_/g, ' ')];
        return '<span style="font-size:9px;font-weight:900;letter-spacing:.4px;color:' + m2[0] + ';background:' + m2[1] + ';border:1px solid ' + m2[2] + ';border-radius:5px;padding:2px 7px;">' + esc(m2[3]) + '</span>';
    }
    function gsgChildOrdersBlock(ci, isOrg2) {
        var h = '<div style="margin-top:12px;background:#fff;border:1px solid #cbe9dd;border-radius:12px;overflow:hidden;">'
            + '<b style="display:block;font-size:10.5px;color:#0f766e;text-transform:uppercase;letter-spacing:.4px;padding:9px 12px;border-bottom:1px solid #f0faf6;background:#fbfefd;">' + tk('gsg_co_hdr', 'Oda za Kibinafsi') + ' · §28'
            + (ci.parentCode ? ' <span style="font-weight:800;color:#8a6d00;">· ORDER # ' + esc(ci.parentCode) + '</span>' : '') + '</b>';
        function rowCO(o2, deep) {
            return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #faf6e8;font-size:12px;color:#334155;">'
                + '<b style="font-weight:900;color:#0f172a;white-space:nowrap;">' + esc(o2.humanId || '') + '</b>'
                + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (deep ? esc(o2.buyerName || o2.buyerId || '') + ' · ' : '') + 'TZS ' + esc(String(+o2.amount || 0)) + '</span>'
                + gsgCOStatusChip(o2.status)
                + '<button type="button" data-act="gsg-co-open" data-oid="' + esc(o2.__id) + '" title="' + tk('gsg_co_view', 'Tazama Order') + '" style="border:1px solid #d3e6f5;background:#eef6fc;color:#0B4F7A;font-weight:800;font-size:10px;padding:5px 9px;border-radius:99px;cursor:pointer;flex:none;">§29 ›</button></div>';
        }
        if (!isOrg2) {
            h += ci.mine ? '<div style="padding:8px 12px 0;"><span style="font-size:10px;font-weight:900;letter-spacing:.5px;color:#0f766e;text-transform:uppercase;">ODA YAKO</span></div>' + rowCO(ci.mine, false)
                : '<small style="display:block;padding:9px 12px;color:#94a365;font-size:11px;">' + tk('gsg_co_nomine', 'Huuna oda ya kibinafsi kwenye mchanganyiko huu.') + '</small>';
        } else {
            var all = ci.all || [];
            h += all.length ? all.map(function (o2) { return rowCO(o2, true); }).join('')
                : '<small style="display:block;padding:9px 12px;color:#94a365;font-size:11px;">—</small>';
        }
        h += '<small style="display:block;padding:7px 12px;background:#fbfefd;color:#64748b;font-size:9.5px;line-height:1.45;border-top:1px solid #f0faf6;">' + tk('gsg_co_note', 'Hakuna chaji isiyotangazwa (§36): malipo hutokea tu kwa kitendo chako wazi. Kiasi chako unaona wewe tu; mwandaaji anaona orodha pamoja na majina bila vipimo vya faragha (§32/§38).') + '</small></div>';
        return h;
    }
    function closeGOWorkspace() { var x = document.getElementById('gsgCoWS'); if (x) x.remove(); }
    window.skhGOWindowOpen = async function (orderDocId) {
        if (!skh.requireAuth()) return;
        closeGOWorkspace();
        var y = await window.skhGChildOrderGet(orderDocId);
        if (!y || !y.ok) { try { window.showToast && window.showToast(tk('gsg_co_noorder', 'Oda ya kibinafsi haipatikani'), 'info'); } catch (eT0) {} return; }
        var o = y.order, role = y.myRoleIn;
        var isOrg2 = ['owner', 'admin', 'organizer'].indexOf(String(y.groupRole || '')) >= 0;
        var st = String(o.status || 'payment_pending');
        var myWallet = 0;
        try { var uw = await skh.getDoc(skh.doc(skh.db, 'users', uid())); if (uw && uw.exists && uw.exists()) myWallet = +uw.data().walletBalance || 0; } catch (eW) {}
        var pop = document.createElement('div');
        pop.id = 'gsgCoWS';
        pop.style.cssText = 'position:fixed;inset:0;z-index:100120;background:rgba(11,22,40,.5);display:flex;align-items:flex-end;justify-content:center;';
        var row2 = function (l, v) { return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #eef6fc;"><small style="color:#0B4F7A;font-weight:700;">' + esc(l) + '</small><b style="font-size:12.5px;color:#0f172a;text-align:right;">' + esc(String(v)) + '</b></div>'; };
        var tl = (o.timeline && typeof o.timeline === 'object') ? o.timeline : {};
        var steps = [['placedAt', 'Oda imewekwa', '📝'], ['paymentSecuredAt', 'Malipo salama (escrow)', '💳'], ['sellerAcceptedAt', 'Muuzaji amekubali', '✅'], ['readyAt', 'Tayari kuchukuliwa', '📦'], ['inTransitAt', 'Njiani', '🚚'], ['deliveredAt', 'Imefikishwa', '📬'], ['completedAt', 'Imekamilika', '🎉']];
        var tlH = steps.map(function (s3) {
            var at = tl[s3[0]] || null;
            return '<div style="display:flex;align-items:center;gap:9px;padding:5px 0;' + (at ? '' : 'opacity:.42;') + '">'
                + '<span style="width:20px;height:20px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;background:' + (at ? '#f0faf6' : '#f1f5f9') + ';border:1.5px solid ' + (at ? '#18A982' : '#cbd5e1') + ';">' + s3[2] + '</span>'
                + '<span style="flex:1;font-size:12px;color:' + (at ? '#0f172a;font-weight:700;' : '#64748b;') + '">' + esc(s3[1]) + '</span>'
                + '<small style="color:#94a3b8;font-size:10px;white-space:nowrap;">' + (at ? esc(String(at).slice(5, 16).replace('T', ' ')) : '—') + '</small></div>';
        }).join('');
        if (st === 'rejected') tlH += '<div style="margin-top:6px;font-size:11px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:7px 9px;">❌ ' + tk('gsg_co_rej', 'Oda imekataliwa — malipo yamerudishwa.') + '</div>';
        var acts = [];
        if (role === 'buyer') {
            if (st === 'payment_pending') acts.push({ a: 'pay', l: '💳 ' + tk('gsg_co_pay', 'Lipa Sasa') + ' — TZS ' + (+o.amount || 0) + ' (ESCROW)', primary: 1 });
            if (st === 'delivered' || (st === 'ready' && !o.transporterId)) acts.push({ a: 'confirm_received', l: '🎉 ' + tk('gsg_co_recv', 'Thibitisha Umepokea'), primary: 1 });
        }
        if (role === 'seller') {
            if (st === 'secured') { acts.push({ a: 'accept_order', l: '✅ ' + tk('gsg_co_acc', 'Kubali Oda'), primary: 1 }); acts.push({ a: 'reject_order', l: '❌ ' + tk('gsg_co_rej2', 'Kataa'), danger: 1 }); }
            if (st === 'confirmed') acts.push({ a: 'mark_ready', l: '📦 ' + tk('gsg_co_ready', 'Weka Tayari'), primary: 1 });
        }
        if (role === 'transporter') {
            if (st === 'ready' && !o.transporterAccepted) acts.push({ a: 'accept_delivery', l: '🚚 ' + tk('gsg_co_tr_acc', 'Kubali usafiri'), primary: 1 });
            if (st === 'ready' && o.transporterAccepted) acts.push({ a: 'confirm_pickup', l: '🚚 ' + tk('gsg_co_tr_pk', 'Thibitisha umechukua'), primary: 1 });
            if (st === 'in_transit') acts.push({ a: 'delivered', l: '📬 ' + tk('gsg_co_tr_dl', 'Thibitisha imewasilishwa'), primary: 1 });
        }
        var actsH = acts.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">' + acts.map(function (ac) {
            return '<button type="button" data-act="gsg-co-act" data-a="' + esc(ac.a) + '" data-oid="' + esc(orderDocId) + '" style="flex:1;min-width:130px;border:' + (ac.primary ? 'none' : (ac.danger ? '1.5px solid #fecaca' : '1.5px solid #d3e6f5')) + ';background:' + (ac.primary ? '#1268A8' : '#fff') + ';color:' + (ac.primary ? '#fff' : (ac.danger ? '#dc2626' : '#0B4F7A')) + ';font-weight:900;font-size:12px;padding:12px 10px;border-radius:12px;cursor:pointer;">' + esc(ac.l) + '</button>';
        }).join('') + '</div>' : '';
        var roleLbl = { buyer: '🧾 ' + tk('gsg_co_r_b', 'Wewe ni Mnunuzi'), seller: '🏪 ' + tk('gsg_co_r_s', 'Wewe ni Muuzaji'), transporter: '🚚 ' + tk('gsg_co_r_t', 'Wewe ni Msafirishaji') }[role] || null;
        var escChip = { held: '🛡 ESCROW — imeshikiliwa', released: '✅ ESCROW — imetolewa', refunded: '↩ ESCROW — imerudishwa', pending: '⏳ ESCROW — bado' }[String(o.escrowStatus || 'pending')];
        var assignH = '';
        if (isOrg2 && !o.transporterId && ['secured', 'confirmed', 'ready'].indexOf(st) >= 0 && window.skhGroupMembers && o.groupId) {
            assignH = '<div id="gsgCoAssignBox" data-oid="' + esc(orderDocId) + '" data-gid="' + esc(o.groupId) + '" style="margin-top:12px;background:#FFFBE8;border:1px dashed #ead98a;border-radius:12px;padding:9px 11px;">'
                + '<b style="display:block;font-size:10.5px;color:#8a6d00;text-transform:uppercase;letter-spacing:.4px;">' + tk('gsg_co_assign_t', 'Mwandaaji: Teua msafirishaji') + '</b>'
                + '<div style="display:flex;gap:7px;margin-top:7px;"><select id="gsgCoAssignSel" style="flex:1;padding:9px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:12px;"><option value="">' + tk('gsg_co_assign_ph', '— chagua mwanachama —') + '</option></select>'
                + '<button type="button" data-act="gsg-co-assign" data-oid="' + esc(orderDocId) + '" style="border:none;background:#D8B83A;color:#4a3900;font-weight:900;font-size:11.5px;padding:9px 13px;border-radius:10px;cursor:pointer;">' + tk('gsg_co_assign_b', 'Teua') + '</button></div></div>';
            window.skhGroupMembers(o.groupId).then(function (mems) {
                var sel = document.getElementById('gsgCoAssignSel'); if (!sel) return;
                (mems || []).forEach(function (mm) {
                    var d2 = mm.data ? (mm.data() || {}) : (mm || {});
                    var uId = d2.uid || (mm.id || null);
                    if (!uId || uId === o.buyerId || uId === o.sellerId) return;
                    var op = document.createElement('option');
                    op.value = uId; op.textContent = d2.fullName || d2.displayName || d2.name || uId;
                    sel.appendChild(op);
                });
            }).catch(function () {});
        }
        pop.innerHTML = '<div id="gsgCoWSCard" style="width:100%;max-width:430px;max-height:90vh;overflow-y:auto;background:#F6FAFD;border-radius:18px 18px 0 0;padding:16px 16px 26px;box-shadow:0 -10px 34px rgba(11,22,40,.28);">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
            + '<span style="font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#0B4F7A;background:#eef6fc;border:1px solid #d3e6f5;border-radius:6px;padding:2px 8px;">ORDER # ' + esc(o.humanId || '') + '</span>'
            + gsgCOStatusChip(st)
            + '<span style="flex:1;"></span>'
            + '<button type="button" data-act="gsg-co-close" aria-label="' + tk('gsg_cancel', 'Ghairi') + '" style="border:none;background:#e2ecf5;color:#334155;width:29px;height:29px;border-radius:99px;font-weight:900;cursor:pointer;">\u00d7</button></div>'
            + '<b style="display:block;font-size:15px;color:#0f172a;margin-bottom:8px;">' + esc(o.productTitle || o.itemTitle || '') + '</b>'
            + (roleLbl ? '<div style="margin-bottom:9px;"><span style="font-size:10.5px;font-weight:800;color:#164e3f;background:#f0faf6;border:1px solid #cbe9dd;border-radius:8px;padding:5px 9px;">' + roleLbl + '</span>' + (o.parentCode ? ' <span style="font-size:10px;font-weight:800;color:#8a6d00;background:#fffdf0;border:1px solid #ead98a;border-radius:8px;padding:5px 9px;">' + esc(o.parentCode) + ' §28</span>' : '') + '</div>' : '')
            + row2(tk('qty', 'Idadi'), o.qty + (o.unit ? ' ' + o.unit : ''))
            + (o.variant ? row2(tk('gsg_co_var', 'Variant'), o.variant) : '')
            + row2(tk('price', 'Bei'), 'TZS ' + (+o.unitPrice || 0))
            + row2(tk('total', 'Jumla'), 'TZS ' + (+o.amount || 0))
            + row2(tk('gsg_co_esc', 'Escrow'), escChip)
            + (role === 'buyer' ? row2(tk('gsg_co_wallet', 'Wallet yangu'), 'TZS ' + myWallet) : '')
            + row2('🏪 ' + tk('gsg_co_seller', 'Muuzaji'), o.sellerName || '—')
            + row2('🧾 ' + tk('gsg_co_buyer', 'Mnunuzi'), o.buyerName || '—')
            + (o.transporterId ? row2('🚚 ' + tk('gsg_co_tr', 'Msafirishaji'), (o.transporterName || o.transporterId) + (o.transporterAccepted ? ' ✓' : '')) : '')
            + row2(tk('gsg_co_dm', 'Usafiri'), ((o.delivery && o.delivery.method === 'shared') ? tk('gsg_go_shared', 'Usafiri wa pamoja') : tk('gsg_go_individual', 'Kila mmoja')) + ((o.destination || (o.delivery && o.delivery.area)) ? ' · ' + esc(o.destination || o.delivery.area) : ''))
            + '<b style="display:block;margin-top:13px;margin-bottom:4px;font-size:10.5px;color:#0B4F7A;text-transform:uppercase;letter-spacing:.5px;">' + tk('gsg_co_tl', 'Ratiba ya oda') + ' · §31</b>'
            + tlH
            + assignH
            + actsH
            + '<small style="display:block;margin-top:12px;color:#64748b;font-size:9.5px;line-height:1.5;">' + tk('gsg_co_n3', 'Kiasi chako cha faragha hakionyeshwi kwa washiriki wengine; hatua za oda huonekana kama matukio ya mfumo kwenye soga ya kikundi bila viashiria vya pesa (§32/§33/§38).') + '</small>'
            + '</div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeGOWorkspace(); });
        document.body.appendChild(pop);
    };
    /* ================= [SPEC PHASE 3 §10/§12/§13] COMPOSER + ATTACH + THREAD ================= */
    function renderReplyBar() {
        var bar = document.getElementById('gsgReplyBar');
        if (!bar) return;
        var rt = CUR.__replyTo;
        if (!rt) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
        bar.style.display = 'block';
        bar.innerHTML = '<div style="display:flex;align-items:center;gap:8px;background:#eef6fc;border:1px solid #d3e6f5;border-left:3px solid #1268A8;border-radius:10px;padding:7px 10px;">'
            + '<span style="color:#1268A8;font-weight:800;">\u21a9</span>'
            + '<div style="flex:1;min-width:0;"><b style="font-size:11px;color:#0B4F7A;">' + esc(rt.by || '') + '</b>'
            + '<div style="font-size:11.5px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(rt.preview || '') + '</div></div>'
            + '<button type="button" data-act="gsg-reply-cancel" aria-label="' + tk('gsg_cancel', 'Ghairi') + '" style="border:none;background:none;color:#64748b;font-weight:900;font-size:14px;cursor:pointer;">\u00d7</button></div>';
    }

    function closeAttachPop() { var x = document.getElementById('gsgAttachPop'); if (x) x.remove(); }
    function atChip(act, icon, label, extra) {
        return '<button type="button" data-act="' + act + '" ' + (extra || '') + ' style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 6px;border:1px solid #dbe4ed;background:#fff;border-radius:13px;cursor:pointer;min-width:72px;">'
            + '<span style="font-size:20px;line-height:1;">' + icon + '</span><small style="font-size:10.5px;font-weight:700;color:#334155;">' + esc(label) + '</small></button>';
    }
    function openAttachPop() {
        closeAttachPop(); closeRxnPop();
        if (g_sendPolicy_blocked()) { alert(tk('gsg_send_denied', 'Admin pekee wanaruhusiwa kutuma.')); return; }
        var canManage = (CUR.__myRole === 'owner' || CUR.__myRole === 'admin');
        var pop = document.createElement('div');
        pop.id = 'gsgAttachPop';
        pop.style.cssText = 'position:fixed;inset:0;z-index:100095;background:rgba(11,22,40,.35);display:flex;align-items:flex-end;';
        // [§13] commerce actions ZINATOFUATISHWA kikamilifu kutoka attachments (gold = commerce §39)
        pop.innerHTML = '<div style="width:100%;background:#fff;border-radius:18px 18px 0 0;padding:16px 16px 22px;box-shadow:0 -8px 30px rgba(11,22,40,.18);">'
            + '<button type="button" data-act="gsg-attach-close" style="float:right;border:none;background:#e2e8f0;color:#334155;width:30px;height:30px;border-radius:99px;font-weight:900;cursor:pointer;">\u00d7</button>'
            + '<b style="display:block;font-size:13px;color:#0f172a;margin-bottom:10px;">' + tk('gsg_attach', 'Ambatisha') + '</b>'
            + '<small style="display:block;font-size:9.5px;font-weight:800;letter-spacing:.6px;color:#64748b;text-transform:uppercase;margin-bottom:6px;">' + tk('gsg_at_files', 'Viambatisho') + '</small>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
            + atChip('gsg-at-image', '\u{1F5BC}\uFE0F', tk('gsg_at_img', 'Picha/Gallery'))
            + atChip('gsg-at-doc', '\u{1F4C4}', tk('gsg_at_doc', 'Nyaraka'))
            + atChip('gsg-at-loc', '\u{1F4CD}', tk('gsg_at_loc', 'Mahali'))
            + atChip('gsg-at-contact', '\u{1F464}', tk('gsg_at_ctc', 'Mawasiliano'))
            + '</div>'
            + '<small style="display:block;font-size:9.5px;font-weight:800;letter-spacing:.6px;color:#8a6d00;text-transform:uppercase;margin:14px 0 6px;">' + tk('gsg_at_biz', 'BIASHARA') + '</small>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:10px;border-radius:13px;background:#FFFBE8;border:1px solid #ead98a;">'
            + atChip('gsg-at-product', '\u{1F6D2}\uFE0F', tk('gsg_p_prod', 'Bidhaa'))
            + atChip('gsg-at-service', '\u{1F527}', tk('gsg_p_serv', 'Huduma'))
            + atChip('gsg-at-poll', '\u{1F4CB}', tk('gsg_p_poll', 'Kura'))
            + (canManage ? atChip('gsg-at-announce', '\u{1F4E2}', tk('gsg_p_ann', 'Tangazo')) : '')   // [§46] UI hides invalid
            + atChip('gsg-at-gorder', '\u{1F4E6}', 'Group Order')
            + '</div></div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeAttachPop(); });
        document.body.appendChild(pop);
    }

    /* generic mini-form (typed msg creation) — fields: [{id,label,ph,opt,num}] */
    function closeTypedForm() { var x = document.getElementById('gsgFormPop'); if (x) x.remove(); }
    function openTypedForm(title, fields, onSave) {
        closeTypedForm(); closeAttachPop();
        var pop = document.createElement('div');
        pop.id = 'gsgFormPop';
        pop.style.cssText = 'position:fixed;inset:0;z-index:100096;background:rgba(11,22,40,.4);display:flex;align-items:center;justify-content:center;padding:18px;';
        pop.innerHTML = '<div style="width:100%;max-width:380px;max-height:86vh;overflow-y:auto;background:#fff;border-radius:16px;padding:16px;box-shadow:0 14px 44px rgba(11,22,40,.25);">'
            + '<b style="display:block;font-size:14px;color:#0f172a;margin-bottom:12px;">' + esc(title) + '</b>'
            + fields.map(function (f) {
                var ph = esc(f.ph || '');
                if (f.select) return '<label style="display:block;font-size:10.5px;font-weight:700;color:#64748b;margin:0 0 3px;">' + ph + '</label><select id="tf_' + f.id + '" style="width:100%;box-sizing:border-box;margin-bottom:9px;padding:10px 11px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:13px;background:#fff;">'
                    + f.select.map(function (o) { return '<option value="' + esc(o.v) + '"' + (f.def === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>';
                if (f.date) return '<label style="display:block;font-size:10.5px;font-weight:700;color:#64748b;margin:0 0 3px;">' + ph + '</label><input id="tf_' + f.id + '" type="date" min="' + new Date().toISOString().slice(0, 10) + '" style="width:100%;box-sizing:border-box;margin-bottom:9px;padding:10px 11px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:13px;">';
                if (f.textarea) return '<textarea id="tf_' + f.id + '" rows="3" placeholder="' + ph + '" style="width:100%;box-sizing:border-box;margin-bottom:9px;padding:10px 11px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:13px;resize:none;font-family:inherit;"></textarea>';
                return '<input id="tf_' + f.id + '" type="' + (f.num ? 'number' : 'text') + '" placeholder="' + ph + '" style="width:100%;box-sizing:border-box;margin-bottom:9px;padding:10px 11px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:13px;">';
            }).join('')
            + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">'
            + '<button type="button" data-act="gsg-form-cancel" style="border:1px solid #cbd5e1;background:#fff;color:#334155;font-weight:800;font-size:12px;padding:9px 14px;border-radius:10px;cursor:pointer;">' + tk('gsg_cancel', 'Ghairi') + '</button>'
            + '<button type="button" data-act="gsg-form-save" style="border:none;background:#18A982;color:#fff;font-weight:800;font-size:12px;padding:9px 16px;border-radius:10px;cursor:pointer;">' + tk('ch_send', 'Tuma') + '</button>'
            + '</div></div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeTypedForm(); });
        document.body.appendChild(pop);
        CUR.__typedForm = { fields: fields, onSave: onSave };
    }
    function collectTypedForm() {
        var f = CUR.__typedForm; if (!f) return null;
        var vals = {};
        f.fields.forEach(function (fd) {
            var el = document.getElementById('tf_' + fd.id);
            vals[fd.id] = el ? String(el.value || '').trim() : '';
        });
        return vals;
    }

    /* [§12] THREAD view — majibu ya root reply-chain */
    function closeThreadPop() { var x = document.getElementById('gsgThreadPop'); if (x) x.remove(); }
    async function openThreadPop(rootId) {
        closeThreadPop();
        var rows = (CUR.__lastRows || []);
        var root = null;
        rows.forEach(function (r) { if (r.__id === rootId) root = r; });
        if (!root) { try { window.showToast && window.showToast(tk('gsg_thr_gone', 'Ujumbe haujapatikana'), 'info'); } catch (eT) {} return; }
        var replies = rows.filter(function (r) { return r.threadRootId === rootId; });
        var pop = document.createElement('div');
        pop.id = 'gsgThreadPop';
        pop.style.cssText = 'position:fixed;inset:0;z-index:100094;background:rgba(11,22,40,.4);display:flex;align-items:flex-end;';
        pop.innerHTML = '<div style="width:100%;max-height:80vh;background:#fff;border-radius:18px 18px 0 0;display:flex;flex-direction:column;box-shadow:0 -8px 30px rgba(11,22,40,.22);">'
            + '<div style="display:flex;align-items:center;gap:9px;padding:13px 15px;border-bottom:1px solid #eef2f7;">'
                + '<b style="flex:1;font-size:13px;color:#0f172a;">' + tk('gsg_thread', 'Mti wa majibu') + ' (' + replies.length + ')</b>'
                + '<button type="button" data-act="gsg-thread-jump" data-mid="' + esc(rootId) + '" data-by="' + esc(root.senderName || '') + '" style="border:1px solid #1268A8;background:#fff;color:#1268A8;font-weight:800;font-size:10.5px;padding:6px 11px;border-radius:99px;cursor:pointer;">' + tk('gsg_thread_reply', 'Jibu ujumbe huu') + '</button>'
                + '<button type="button" data-act="gsg-thread-close" aria-label="' + tk('gsg_cancel', 'Ghairi') + '" style="border:none;background:#eef2f7;color:#334155;width:29px;height:29px;border-radius:99px;font-weight:900;cursor:pointer;">\u00d7</button></div>'
            + '<div style="flex:1;overflow-y:auto;padding:12px 14px;background:#fff;">'
            + '<div style="background:#fff;border:1px solid #d3e6f5;border-left:3px solid #1268A8;border-radius:12px;padding:9px 11px;">'
                + '<small style="color:#64748b;font-weight:700;">' + esc(root.senderName || '') + '</small>'
                + '<div style="font-size:13px;color:#0f172a;margin-top:2px;">' + renderMsgText(root.text || root.caption || root.question || '') + '</div></div>'
            + replies.map(function (r) {
                var mine = r.senderUid === uid();
                return '<div style="margin-top:8px;margin-left:' + (mine ? '24px' : '6px') + ';margin-right:' + (mine ? '6px' : '24px') + ';background:' + (mine ? '#d8f3e5' : '#fff') + ';border:1px solid ' + (mine ? '#bde7d1' : '#e2e8f0') + ';border-radius:12px;padding:8px 11px;">'
                    + '<small style="color:#64748b;font-weight:700;">' + esc(r.senderName || '') + '</small>'
                    + '<div style="font-size:12.5px;color:#0f172a;margin-top:1px;">' + renderMsgText(r.text || r.caption || '') + '</div></div>';
            }).join('')
            + '</div></div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeThreadPop(); });
        document.body.appendChild(pop);
    }

        function hideInfoDrawer() {
        CUR.__showInfo = false;
        var host = document.getElementById('gsgInfo');
        if (host) host.style.display = 'none';
    }

    async function renderMsgs(gid) {
        var host = document.getElementById('gsgMsgs');
        if (!host) return;

        // Ulinzi: Usikae kwenye "Inapakia meseji..." milele
        var loadTimer = setTimeout(function () {
            if (host && host.innerHTML.includes('Inapakia meseji')) {
                host.innerHTML = '<div style="text-align:center;padding:26px 16px;color:#64748b;">'
                    + '<p style="font-size:13px;margin:0 0 10px;">Mazungumzo yanachukua muda kupakia.</p>'
                    + '<button type="button" onclick="window.skhOpenGroupSoga(\'' + esc(gid) + '\')" style="padding:8px 16px;background:#18A982;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Jaribu Tena</button>'
                    + '</div>';
            }
        }, 8000);

        try {
            var snap = await skh.getDocs(msgsCol(gid));
            clearTimeout(loadTimer);
            var rows = [];
            snap.forEach(function (d) { var dd = d.data() || {}; dd.__id = d.id; rows.push(dd); });
            rows.sort(function (a, b) { return String(a.at || '').localeCompare(String(a.at || '')); });
            rows = rows.slice(-60);
            
            var convD = {}, othersActive = [];
            try {
                var cs = await skh.getDoc(cRef(gid));
                if (cs && cs.exists && cs.exists()) convD = cs.data() || {};
            } catch (eC) {}
            try {
                var mems = await window.skhGroupMembers(gid);
                othersActive = (mems || []).filter(function (mm) { return mm && mm.status === 'active' && mm.userId !== uid(); }).map(function (mm) { return mm.userId; });
            } catch (eM) {}
            if (!CUR.__names) { try { CUR.__names = await fetchNames(othersActive.concat([uid()])); } catch (eN) { CUR.__names = {}; } }
            var lra = convD.lastReadAt || {};
            
            var tc = {};
            rows.forEach(function (r) { if (r.threadRootId) tc[r.threadRootId] = (tc[r.threadRootId] || 0) + 1; });
            CUR.__lastRows = rows;
            var __prevBottom = host ? (host.scrollHeight - host.scrollTop - host.clientHeight) : 0;
            var needBottom = __prevBottom < 120;
            if (!host || host.childElementCount < 2) needBottom = true;
            host.innerHTML = rows.length
                ? rows.map(function (r) {
                    var ri = null;
                    if (r.senderUid === uid() && othersActive.length) {
                        var readers = othersActive.filter(function (u2) { return String(lra[u2] || '') >= String(r.at || ''); });
                        ri = { allRead: readers.length === othersActive.length, n: readers.length,
                               names: readers.map(function (u2) { return (CUR.__names || {})[u2] || u2; }) };
                    }
                    return msgRow(r, r.senderUid === uid(), ri, tc);
                }).join('')
                : '<div style="text-align:center;padding:30px;color:#94a3b8;"><b>' + tk('gsg_empty', 'Bado hakuna ujumbe') + '</b><br><small>' + tk('gsg_empty_sub', 'Anza mazungumzo — context ya kikundi iko juu.') + '</small></div>';
            
            var maxAt = rows.length ? String(rows[rows.length - 1].at || '') : '';
            try { hydrateGOCards(gid); } catch (eHR) {}
            if (maxAt && CUR.gid === gid && maxAt > String(lra[uid()] || '')) {
                try { var lr = {}; lr['lastReadAt.' + uid()] = maxAt; await skh.updateDoc(cRef(gid), lr); } catch (eLR) {}
            }
            if (needBottom) host.scrollTop = host.scrollHeight;
        } catch (e) { 
            clearTimeout(loadTimer);
            host.innerHTML = '<div style="text-align:center;padding:20px;color:#b91c1c;">'
                + '<p style="font-size:12.5px;margin:0 0 8px;">Imeshindikana kupakia meseji.</p>'
                + '<button type="button" onclick="window.skhOpenGroupSoga(\'' + esc(gid) + '\')" style="padding:6px 14px;background:#17604E;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:11.5px;cursor:pointer;">Jaribu Tena</button>'
                + '</div>';
        }
    }

    async function sendText() {
        var inp = document.getElementById('gsgInput');
        var txt = inp ? String(inp.value || '').trim() : '';
        if (!txt) { if (inp) inp.value = ''; return; }      // [R22 B4] ujumbe mtupu HAITUMI
        if (g_sendPolicy_blocked()) { alert(tk('gsg_send_denied', 'Admin pekee wanaruhusiwa kutuma.')); return; }
        try {
            // [R25 §35] send hupitia ENGINE — guards (archived/not_member/sendPolicy/
            // rate/empty) haziwezi bypassiwa kwa kubadili UI. lastMessage+unread humu.
            var opts = null;
            if (CUR.__replyTo) { opts = { replyTo: { id: CUR.__replyTo.id, by: CUR.__replyTo.by, preview: CUR.__replyTo.preview }, threadRootId: CUR.__replyTo.root || CUR.__replyTo.id }; }
            var res = await window.skhGroupSendMessage(CUR.gid, txt, opts);
            if (res && res.ok) { CUR.__replyTo = null; try { renderReplyBar(); } catch (eRB) {} }
            if (!res || !res.ok) {
                var rk = res ? res.reason : 'err';
                if (rk === 'sendPolicy') alert(tk('gsg_send_denied', 'Admin pekee wanaruhusiwa kutuma.'));
                else if (rk === 'rate') alert(tk('gsg_send_rate', 'Umetuma ujumbe mwingi mfululizo — subiri kidogo.'));
                else if (rk === 'archived') alert(tk('grp_archived', 'Kikundi hiki hakipo active tena.'));
                else if (rk === 'not_member') alert(tk('grp_inv_only_member', 'Wewe si mwanachama wa kikundi hiki.'));
                else alert(tk('gsg_err_send', 'Ujumbe haujatuma. Jaribu tena.'));
                return;
            }
            // [R24] baada ya kutuma — typing yangu ifutwe (si tena "… anaandika")
            try { var tp = {}; tp['typingMap.' + uid()] = null; await skh.updateDoc(cRef(CUR.gid), tp); } catch (eT3) {}
            inp.value = '';
            await renderMsgs(CUR.gid);
        } catch (e) { console.error('[gsg send]', e); alert(tk('gsg_err_send', 'Ujumbe haujatuma. Jaribu tena.')); }
    }
    // sendPolicy ya 69: 'everyone' (default) | 'admins' (owner/admin pekee)
    function g_sendPolicy_blocked() {
        return (CUR.__sendPolicy === 'admins') && !(CUR.__myRole === 'owner' || CUR.__myRole === 'admin');
    }

    /* ---------------- ctx resolve (§14: View Commerce → existing module) ---------------- */
    async function viewCtx() {
        if (!CUR.gid) return;
        try {
            var g = (await skh.getDoc(gRef(CUR.gid))).data() || {};
            var sc = g.sharedContext || {};
            var cid = sc.contextId || g.contextId || null;
            var t = (sc.type && sc.type !== 'GENERAL') ? sc.type : (g.contextType && g.contextType !== 'GENERAL' ? g.contextType : null);
            if (cid && (t === 'GROUP_BUY' || t === 'WHOLESALE' || t === 'COMMUNITY')) {
                window.skhCloseGroupSoga();
                try { window.openProduct(cid, 'products'); } catch (eV) {}
                return;
            }
            if (t === 'TRANSPORT') {
                window.skhCloseGroupSoga();
                if (typeof window.openTransportHub === 'function') { try { window.openTransportHub(); } catch (eT) {} }
                else if (window.showToast) window.showToast(tk('gs_ctx_hint', 'Fungua sehemu ya usafiri modal/katika app'), 'info');
                return;
            }
            if (window.showToast) window.showToast(tk('gs_ctx_none', 'Context hii haina reference ya moja kwa moja'), 'info');
        } catch (e) {}
    }

    document.addEventListener('click', function (ev) {
        try {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
            if (!b) return;
            var act = b.getAttribute('data-act');
            if (act === 'gsg-close') window.skhCloseGroupSoga();
            else if (act === 'gsg-send') { console.log('[gsg] send clicked, CUR.gid=', CUR && CUR.gid); sendText(); }
            else if (act === 'gsg-view-ctx') viewCtx();
            else if (act === 'gsg-tab') {
                setGsgTab(b.getAttribute('data-tab'));
                return;
            }
            else if (act === 'gsg-ann-view') {
                CUR.__annOpen = !CUR.__annOpen;
                (async function () {
                    try {
                        var cd = await skh.getDoc(cRef(CUR.gid));
                        renderAnnounce((cd && cd.exists && cd.exists()) ? (cd.data().announcement || null) : null);
                    } catch (eA4) {}
                })();
                return;
            }
            else if (act === 'gsg-ann-save') {
                var gidAnn = CUR.gid;
                if (!gidAnn) return;
                var ta = document.getElementById('gsgAnnText');
                var txtAnn = ta ? String(ta.value || '') : '';
                (async function () {
                    var resAnn = await window.skhGroupSetAnnouncement(gidAnn, txtAnn);
                    if (resAnn === null) {
                        try { window.showToast && window.showToast(tk('gsg_ann_fail', 'Angalia ujumbe/kuruhusiwa — tangazo liwe ≤500 herufi'), 'error'); } catch (eT5) {}
                    } else {
                        try { window.showToast && window.showToast(tk('gsg_ann_saved', txtAnn.trim() ? 'Tangazo limewekwa (pinned) ✓' : 'Tangazo limeondolewa'), 'success'); } catch (eT6) {}
                        if (CUR.__showInfo) { try { await renderInfoDrawer(gidAnn); } catch (eRD) {} }
                    }
                })();
                return;
            }
            else if (act === 'gsg-reply') {
                CUR.__replyTo = {
                    id: b.getAttribute('data-mid'),
                    by: b.getAttribute('data-by') || '',
                    preview: b.getAttribute('data-prev') || '',
                    root: b.getAttribute('data-root') || ''
                };
                renderReplyBar();
                var inpR = document.getElementById('gsgInput'); if (inpR) inpR.focus();
                return;
            }
            else if (act === 'gsg-reply-cancel') { CUR.__replyTo = null; renderReplyBar(); return; }
            else if (act === 'gsg-thread') { openThreadPop(b.getAttribute('data-mid')); return; }
            else if (act === 'gsg-thread-close') { closeThreadPop(); return; }
            else if (act === 'gsg-thread-jump') {
                CUR.__replyTo = { id: b.getAttribute('data-mid'), by: b.getAttribute('data-by') || '', preview: '', root: b.getAttribute('data-mid') };
                closeThreadPop(); renderReplyBar();
                var inpT = document.getElementById('gsgInput'); if (inpT) inpT.focus();
                return;
            }
            else if (act === 'gsg-attach') { if (document.getElementById('gsgAttachPop')) closeAttachPop(); else openAttachPop(); return; }
            else if (act === 'gsg-attach-close') { closeAttachPop(); return; }
            else if (act === 'gsg-form-cancel') { closeTypedForm(); return; }
            else if (act === 'gsg-form-save') {
                var tf = CUR.__typedForm;
                if (tf && tf.onSave) { var vals = collectTypedForm(); closeTypedForm(); try { tf.onSave(vals); } catch (eFS) { console.log('[gsg] form save err', eFS); } CUR.__typedForm = null; }
                else closeTypedForm();
                return;
            }
            else if (act === 'gsg-at-image') {
                closeAttachPop();
                var fi = document.createElement('input');
                fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
                document.body.appendChild(fi);
                fi.onchange = function () {
                    var f = fi.files && fi.files[0]; if (!f) { fi.remove(); return; }
                    if (f.size > 750 * 1024) { alert(tk('gsg_img_big', 'Picha ni kubwa — jaribu ndogo zaidi.')); fi.remove(); return; }
                    var rd = new FileReader();
                    rd.onload = function () {
                        window.skhGroupSendTyped(CUR.gid, { type: 'image', imageUrl: String(rd.result) }).then(function (r2) {
                            if (!r2 || !r2.ok) alert(tk('gsg_send_fail', 'Ujumbe haujatumiwa.'));
                        });
                        fi.remove();
                    };
                    rd.readAsDataURL(f);
                };
                fi.click();
                return;
            }
            else if (act === 'gsg-at-doc') {
                closeAttachPop();
                var fd = document.createElement('input');
                fd.type = 'file'; fd.style.display = 'none';
                document.body.appendChild(fd);
                fd.onchange = function () {
                    var f = fd.files && fd.files[0]; if (!f) { fd.remove(); return; }
                    if (f.size > 650 * 1024) { alert(tk('gsg_doc_big', 'Nyaraka ni kubwa — jaribu ndogo zaidi.')); fd.remove(); return; }
                    var rd = new FileReader();
                    rd.onload = function () {
                        window.skhGroupSendTyped(CUR.gid, { type: 'document', fileName: f.name, fileSize: f.size, fileType: f.type || '', fileData: String(rd.result) }).then(function (r3) {
                            if (!r3 || !r3.ok) alert(tk('gsg_send_fail', 'Ujumbe haujatumiwa.'));
                        });
                        fd.remove();
                    };
                    rd.readAsDataURL(f);
                };
                fd.click();
                return;
            }
            else if (act === 'gsg-at-loc') {
                openTypedForm(tk('gsg_at_loc', 'Mahali'), [
                    { id: 'label', ph: tk('gsg_loc_label_ph', 'Jina la mahali (mf: Duka la mlima, Mpanda)') },
                    { id: 'lat', ph: 'Lat (hiari, mf: -6.35)', num: true, opt: true },
                    { id: 'lng', ph: 'Lng (hiari, mf: 34.57)', num: true, opt: true }
                ], function (v) {
                    var pl = { type: 'location', label: v.label || tk('gsg_p_loc', 'Mahali') };
                    if (v.lat && v.lng) { pl.lat = parseFloat(v.lat); pl.lng = parseFloat(v.lng); }
                    window.skhGroupSendTyped(CUR.gid, pl);
                });
                return;
            }
            else if (act === 'gsg-at-contact') {
                closeAttachPop();
                if (window.skhContactPicker) {
                    window.skhContactPicker({ multi: false, onDone: function (uids2) {
                        var u2 = (uids2 || [])[0]; if (!u2) return;
                        var nm2 = '(mgeni)';
                        try { nm2 = (CUR.__names || {})[u2] || u2; } catch (eNm) {}
                        window.skhGroupSendTyped(CUR.gid, { type: 'contact', contactUid: u2, contactName: nm2 });
                    } });
                }
                return;
            }
            else if (act === 'gsg-at-product') {
                openTypedForm(tk('gsg_p_prod', 'Bidhaa'), [
                    { id: 'name', ph: tk('gsg_prod_name_ph', 'Jina la bidhaa (mf: Mahindi jumla gunia)') },
                    { id: 'price', ph: tk('gsg_prod_price_ph', 'Bei (TZS, hiari)'), num: true, opt: true },
                    { id: 'qty', ph: tk('gsg_prod_qty_ph', 'Kiasi (hiari, mf: 20)'), opt: true },
                    { id: 'unit', ph: tk('gsg_prod_unit_ph', 'Kipimo (hiari, mf: magunia)'), opt: true }
                ], function (v) {
                    window.skhGroupSendTyped(CUR.gid, { type: 'product', product: { name: v.name, price: v.price, qty: v.qty, unit: v.unit, sellerName: myName() } });
                });
                return;
            }
            else if (act === 'gsg-at-service') {
                openTypedForm(tk('gsg_p_serv', 'Huduma'), [
                    { id: 'name', ph: tk('gsg_srv_name_ph', 'Huduma gani (mf: Ushauri kilimo)') },
                    { id: 'price', ph: tk('gsg_prod_price_ph', 'Bei (TZS, hiari)'), num: true, opt: true },
                    { id: 'mode', ph: tk('gsg_srv_mode_ph', 'Mfano wa bei (hiari: kwa siku/kwa heka)'), opt: true },
                    { id: 'note', ph: tk('gsg_srv_note_ph', 'Maelezo mafupi (hiari)'), textarea: true, opt: true }
                ], function (v) {
                    window.skhGroupSendTyped(CUR.gid, { type: 'service', service: { name: v.name, price: v.price, pricingMode: v.mode, note: v.note } });
                });
                return;
            }
            else if (act === 'gsg-at-poll') {
                openTypedForm(tk('gsg_p_poll', 'Kura') + ' — ' + tk('gsg_p_poll_sub', 'chaguzi 2 hadi 6'), [
                    { id: 'q', ph: tk('gsg_poll_q_ph', 'Swali la kura (mf: Tunsonge bei gani?)') },
                    { id: 'o1', ph: tk('gsg_poll_o1_ph', 'Chaguzi 1 *') },
                    { id: 'o2', ph: tk('gsg_poll_o2_ph', 'Chaguzi 2 *') },
                    { id: 'o3', ph: tk('gsg_poll_o3_ph', 'Chaguzi 3'), opt: true },
                    { id: 'o4', ph: tk('gsg_poll_o4_ph', 'Chaguzi 4'), opt: true },
                    { id: 'o5', ph: tk('gsg_poll_o5_ph', 'Chaguzi 5'), opt: true },
                    { id: 'o6', ph: tk('gsg_poll_o6_ph', 'Chaguzi 6'), opt: true }
                ], function (v) {
                    var options = [v.o1, v.o2, v.o3, v.o4, v.o5, v.o6].filter(function (x) { return x && x.trim(); });
                    window.skhGroupSendTyped(CUR.gid, { type: 'poll', question: v.q, options: options }).then(function (r4) {
                        if (!r4 || !r4.ok) alert(tk('gsg_poll_bad', 'Kura haijatumika — swali na chaguzi ≥2 halali zinahitajika.'));
                    });
                });
                return;
            }
            else if (act === 'gsg-at-gorder') {
                // [§14] Group Order creation form — fields zote za spec
                openTypedForm('Group Order — ' + tk('gsg_go_new', 'unda oda ya pamoja'), [
                    { id: 'productName', ph: tk('gsg_go_pn_ph', 'Bidhaa (mf: Mahindi jumla, magunia)') },
                    { id: 'supplierMode', ph: tk('gsg_go_sup', 'Muuzaji'), select: [ { v: 'request_offers', l: tk('gsg_go_ro', 'Kutafuta ofa (offers)') + ' *' }, { v: 'named', l: tk('gsg_go_named', 'Najua muuzaji (kuweka jina)') } ], def: 'request_offers' },
                    { id: 'supplierName', ph: tk('gsg_go_sname_ph', 'Jina la muuzaji (kama amejulikana)') },
                    { id: 'targetQty', ph: tk('gsg_go_tq_ph', 'Kiasi lengo (TARGET) *'), num: true },
                    { id: 'minQty', ph: tk('gsg_go_minq_ph', 'Kiasi chini kabisa (MIN — default = target)'), num: true, opt: true },
                    { id: 'maxQty', ph: tk('gsg_go_maxq_ph', 'Kiasi juu kabisa (MAX — default = 10×target)'), num: true, opt: true },
                    { id: 'myQty', ph: tk('gsg_go_mq_ph', 'Kiasi changu *'), num: true },
                    { id: 'unit', ph: tk('gsg_prod_unit_ph', 'Kipimo (hiari: magunia/kilo/tenga)') },
                    { id: 'targetPrice', ph: tk('gsg_go_tp_ph', 'Bei lengo (TZS * kwa kipimo)'), num: true },
                    { id: 'deadline', ph: tk('gsg_go_edeal', 'Mwisho wa kutoa ahadi (joiningDeadline)'), date: true },
                    { id: 'paymentDeadline', ph: tk('gsg_go_pdeal_ph', 'Mwisho wa malipo (default = joining + siku 3)'), date: true, opt: true },
                    { id: 'deliveryArea', ph: tk('gsg_go_area_ph', 'Eneo la kufikisha *'),
                    opt: false },
                    { id: 'deliveryMethod', ph: tk('gsg_go_method', 'Njia ya kufikisha'), select: [ { v: 'individual', l: tk('gsg_go_individual', 'Kila mmoja kipekee') }, { v: 'shared', l: tk('gsg_go_shared', 'Usafiri wa pamoja') } ], def: 'individual' },
                    { id: 'description', ph: tk('gsg_go_desc_ph', 'Maelezo mengine (hiari)'), textarea: true }
                ], function (v) {
                    (async function () {
                        var r = await window.skhGroupOrderCreate(CUR.gid, {
                            productName: v.productName, supplierMode: v.supplierMode, supplierName: v.supplierName,
                            targetQty: v.targetQty, minQty: v.minQty, maxQty: v.maxQty, myQty: v.myQty, unit: v.unit, targetPrice: v.targetPrice,
                            deadline: v.deadline, paymentDeadline: v.paymentDeadline, deliveryArea: v.deliveryArea, deliveryMethod: v.deliveryMethod, description: v.description
                        });
                        if (!r || !r.ok) alert(tk('gsg_go_fail', 'Haijaingia — angalia sehemu zote (*).'));
                        else { try { window.showToast && window.showToast(tk('gsg_go_ok', 'Group Order imeundwa ✓'), 'success'); } catch (eTG) {} }
                    })();
                });
                return;
            }
            else if (act === 'gsg-go-interest') {
                var gi = b.getAttribute('data-goid');
                window.skhGroupOrderInterest(CUR.gid, gi).then(function (rI) {
                    if (!rI) { try { window.showToast && window.showToast(tk('gsg_go_int_fail', 'Interest haikubaliwa kwa sasa'), 'info'); } catch (eI) {} }
                });
                return;
            }
            else if (act === 'gsg-go-join') { openJoinMdl(b.getAttribute('data-goid')); return; }
            else if (act === 'gsg-go-tiers-set') { openTierSetMdl(b.getAttribute('data-goid')); return; }
            else if (act === 'gsg-tier-close' || act === 'gsg-of-close' || act === 'gsg-ofs-close') { closeP6(); return; }
            else if (act === 'gsg-tier-save') {
                var gy = b.getAttribute('data-goid');
                var tiersRow = [];
                for (var ti = 0; ti < 3; ti++) {
                    var qE = document.getElementById('tm_' + ti + '_q'), pE = document.getElementById('tm_' + ti + '_p');
                    if (qE && pE && String(qE.value).trim() !== '' && String(pE.value).trim() !== '') tiersRow.push({ minQty: qE.value, price: pE.value });
                }
                window.skhGroupOrderSetTiers(CUR.gid, gy, tiersRow).then(function (rT) {
                    if (rT && rT.ok) { closeP6(); openGODetail(gy); try { window.showToast && window.showToast(tk('gsg_go_tiers5', 'Tiers zimehifadhiwa ✓'), 'success'); } catch (eT5) {} }
                    else alert(tk('err', 'Imeshindwa'));
                });
                return;
            }
            else if (act === 'gsg-go-reqoffers') {
                var gr2 = b.getAttribute('data-goid');
                window.skhGroupOrderRequestOffers(CUR.gid, gr2).then(function (rQ) {
                    if (rQ && rQ.ok) { openGODetail(gr2); try { window.showToast && window.showToast(tk('gsg_go_of_reqd', 'Maombi ya ofa yamefungua ✓'), 'success'); } catch (eRQ) {} }
                    else alert((rQ && rQ.reason) || 'Imeshindwa');
                });
                return;
            }
            else if (act === 'gsg-go-offers') { openOffersSh(b.getAttribute('data-goid')); return; }
            else if (act === 'gsg-sr-offer') { openOfferMdl(b.getAttribute('data-goid')); return; }
            else if (act === 'gsg-of-save') {
                var gof = b.getAttribute('data-goid');
                var fP = { price: document.getElementById('ofPrice').value.replace(/[,\s]/g, ''),
                           availableQty: Math.floor(+document.getElementById('ofQty').value),
                           deliveryDays: Math.floor(+document.getElementById('ofDays').value),
                           note: document.getElementById('ofNote').value.slice(0, 200) };
                window.skhGroupOrderSubmitOffer(CUR.gid, gof, fP).then(function (rO) {
                    if (rO && rO.ok) { closeP6(); try { window.showToast && window.showToast(tk('gsg_go_of_saved', 'Ofa imewekwa ✓'), 'success'); } catch (eOF) {} }
                    else alert((rO && rO.reason) || tk('err', 'Imeshindwa'));
                });
                return;
            }
            else if (act === 'gsg-ofs-select') {
                var gsl = b.getAttribute('data-goid'), ssid = b.getAttribute('data-sid');
                window.skhGroupOrderSelectOffer(CUR.gid, gsl, ssid).then(function (rS) {
                    if (rS && rS.ok) { closeP6(); openOffersSh(gsl); try { window.showToast && window.showToast(tk('gsg_go_of_chosen', 'Muuzaji amechaguliwa ✓'), 'success'); } catch (eOFS) {} }
                    else alert((rS && rS.reason) || tk('err', 'Imeshindwa'));
                });
                return;
            }
            else if (act === 'gsg-ofs-withdraw') {
                var gwd = b.getAttribute('data-goid');
                window.skhGroupOrderWithdrawOffer(CUR.gid, gwd).then(function (rW) {
                    if (rW && rW.ok) { openOffersSh(gwd); try { window.showToast && window.showToast(tk('gsg_go_of_wd', 'Ofa imetolewa ✓'), 'info'); } catch (eWD) {} }
                    else alert((rW && rW.reason) || tk('err', 'Imeshindwa'));
                });
                return;
            }

            else if (act === 'gsg-go-join-close') { closeJoinMdl(); return; }
            else if (act === 'gsg-jqty') {
                var dq = parseInt(b.getAttribute('data-d'), 10) || 0;
                CUR.__joinQty = Math.max(1, (CUR.__joinQty || 1) + dq);
                refreshJoinQty();
                return;
            }
            else if (act === 'gsg-go-join-save') {
                var gj = b.getAttribute('data-goid');
                var qty = CUR.__joinQty || 1;
                var jv = document.getElementById('gsgJVariant'), jd = document.getElementById('gsgJDest');
                var jExtra = { variant: jv ? jv.value.trim() : '', destination: jd ? jd.value.trim() : '' };
                (async function () {
                    var rJ = await window.skhGroupOrderJoin(CUR.gid, gj, qty, jExtra);
                    if (!rJ || !rJ.ok) {
                        var why = rJ ? rJ.reason : 'err';
                        alert(tk('gsg_go_join_fail_' + why, why === 'qty' ? 'Kiasi si sahihi.' : why === 'state' ? 'Group Order imekwishafungwa.' : 'Haijafaulu.'));
                    } else {
                        closeJoinMdl();
                        try { window.showToast && window.showToast(tk('gsg_go_join_ok', 'Ahadi imewekwa ✓ — subtotal TZS ' + ((CUR.__joinPrice || 0) * qty)), 'success'); } catch (eTJ) {}
                    }
                })();
                return;
            }
            else if (act === 'gsg-go-unjoin') {
                var gu = b.getAttribute('data-goid');
                (async function () {
                    var rU = await window.skhGroupOrderUnjoin(CUR.gid, gu);
                    closeGODetail();
                    if (rU && rU.ok) { try { window.showToast && window.showToast(tk('gsg_go_unok', 'Ahadi imeondolewa'), 'success'); } catch (eTU) {} }
                })();
                return;
            }
            else if (act === 'gsg-go-invite') {
                var gin = b.getAttribute('data-goid');
                (async function () {
                    var dI = await window.skhGroupOrderGet(CUR.gid, gin);
                    if (!dI) return;
                    var neededI = Math.max(0, (+dI.targetQty || 0) - (+dI.totalQty || 0));
                    var txtI = 'Group Order: ' + (dI.productName || '') + ' — ' + (+dI.totalQty || 0) + '/' + (+dI.targetQty || 0) + ' @ TZS ' + (+dI.targetPrice || 0)
                        + (neededI ? ' — baki ' + neededI + ' kutimiza' : ' (lengo limetimia ✓)')
                        + ' — Jisajili katika kikundi cha SokoHai. ';
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txtI); window.showToast && window.showToast(tk('gsg_go_inv_copied', 'Mwaliko umenakiliwa ✓ — tuma kwa mtu yeyote'), 'success'); }
                        else { window.showToast && window.showToast(txtI, 'info'); }
                    } catch (eCB) { try { window.showToast && window.showToast(txtI, 'info'); } catch (eT2) {} }
                })();
                return;
            }
            else if (act === 'gsg-go-close2') {
                var gc2 = b.getAttribute('data-goid');
                (async function () {
                    await window.skhGroupOrderClose(CUR.gid, gc2, 'organizer');
                    closeGODetail();
                })();
                return;
            }
            else if (act === 'gsg-go-view-l') { openGODetail(b.getAttribute('data-goid')); return; }
            else if (act === 'gsg-go-filter') {
                CUR.__goFilter = b.getAttribute('data-f') || 'active';
                renderOrdersTab(CUR.gid);
                return;
            }
            else if (act === 'gsg-go-view') { openGODetail(b.getAttribute('data-goid')); return; }
            else if (act === 'gsg-go-close') { closeGODetail(); return; }
            else if (act === 'gsg-co-open') { window.skhGOWindowOpen(b.getAttribute('data-oid')); return; }
            else if (act === 'gsg-co-close') { closeGOWorkspace(); return; }
            else if (act === 'gsg-co-assign') {
                var asOid = b.getAttribute('data-oid');
                var asSel = document.getElementById('gsgCoAssignSel');
                var asUid = asSel ? asSel.value : '';
                if (!asUid) { try { window.showToast && window.showToast(tk('gsg_co_assign_ph', '— chagua mwanachama —'), 'info'); } catch (eTA) {} return; }
                (async function () {
                    var rA = await window.skhGChildOrderAction(asOid, 'assign_transporter', { transporterUid: asUid });
                    if (rA && rA.ok) { try { window.showToast && window.showToast(tk('gsg_co_assigned', 'Msafirishaji ameteuliwa'), 'success'); } catch (eTA2) {} window.skhGOWindowOpen(asOid); }
                    else { try { window.showToast && window.showToast(tk('gsg_co_fail2', 'Kitendo hakikubaliwa'), 'error'); } catch (eTA3) {} }
                })();
                return;
            }
            else if (act === 'gsg-co-act') {
                var coA = b.getAttribute('data-a'), coOid = b.getAttribute('data-oid');
                if (!coA || !coOid) return;
                if (coA === 'pay' && !confirm(tk('gsg_co_pay_q', 'Thibitisha: weka TZS ya oda yako kwenye SokoHai ESCROW (haitolewi hadi uthibitishe kupokea)?'))) return;
                if (coA === 'reject_order' && !confirm(tk('gsg_co_rej_q', 'Katakataa oda hii? Malipo yatarudishwa mnunuzi mara moja.'))) return;
                (async function () {
                    b.disabled = true;
                    var rX = await window.skhGChildOrderAction(coOid, coA, null);
                    if (rX && rX.ok) {
                        try { window.showToast && window.showToast(tk('gsg_co_done', 'Imefanikiwa'), 'success'); } catch (eOK) {}
                        window.skhGOWindowOpen(coOid);
                    } else {
                        b.disabled = false;
                        var msg = tk('gsg_co_fail2', 'Kitendo hakikubaliwa');
                        if (rX && rX.reason === 'insufficient') msg = tk('gsg_co_low', 'Salio la wallet halitoshi — jaza kwanza kisha jaribu tena');
                        alert(msg + (rX && rX.reason ? ' (' + rX.reason + ')' : ''));
                    }
                })();
                return;
            }
            else if (act === 'gsg-at-announce') {
                openTypedForm(tk('gsg_p_ann', 'Tangazo') + ' (' + tk('grp_owner', 'Mmilik') + '/Admin)', [
                    { id: 'text', ph: tk('gsg_ann_ph2', 'Maelezo ya tangazo (mf: mkutano, bei mpya...)'), textarea: true }
                ], function (v) {
                    window.skhGroupSendTyped(CUR.gid, { type: 'announcement', text: v.text }).then(function (r5) {
                        if (!r5 || !r5.ok) alert(tk('gsg_ann_fail', 'Imeshindikana — hakikisha sheria na ruhusa.'));
                    });
                });
                return;
            }
            else if (act === 'gsg-vote') {
                var gidV = CUR.gid, midV = b.getAttribute('data-mid'), idxV = parseInt(b.getAttribute('data-idx'), 10);
                if (!gidV || !midV || isNaN(idxV)) return;
                window.skhGroupVotePoll(gidV, midV, idxV).then(function (vr) {
                    if (!vr) { try { window.showToast && window.showToast(tk('gsg_vote_fail', 'Kura haikubaliwa (kura imefungwa?)'), 'info'); } catch (eV) {} }
                });
                return;
            }
            else if (act === 'gsg-poll-close') {
                var gidC = CUR.gid, midC = b.getAttribute('data-mid');
                if (!gidC || !midC) return;
                window.skhGroupClosePoll(gidC, midC).then(function () {});
                return;
            }
            else if (act === 'gsg-dm') {
                var tg = b.getAttribute('data-uid');
                if (tg && window.skhChatOpen) window.skhChatOpen(tg);
                return;
            }
            else if (act === 'gsg-view-product') {
                var pid = b.getAttribute('data-pid');
                if (pid && window.showProductDetail) window.showProductDetail(pid);
                else if (pid) { try { window.showToast && window.showToast(tk('gsg_prod_open', 'Kufungua bidhaa...'), 'info'); } catch (eP2) {} }
                return;
            }
            else if (act === 'gsg-info') {
                // toggle drawer (si overlay nyingine)
                if (!CUR.gid) return;
                if (CUR.__showInfo) hideInfoDrawer(); else renderInfoDrawer(CUR.gid);
                return;
            }
            else if (act === 'gsg-invite') {
                if (!CUR.gid) return;
                var gidInv = CUR.gid;
                if (window.skhContactPicker) {
                    window.skhContactPicker({
                        multi: true,
                        onDone: function (uids) {
                            (async function () {
                                var sent = 0;
                                for (var i = 0; i < (uids || []).length; i++) {
                                    try { var iv = await window.skhGroupInvite(gidInv, uids[i]); if (iv && iv.ok) sent++; } catch (eI) {}
                                }
                                try {
                                    if (window.showToast) window.showToast(sent
                                        ? tk('gsg_inv_sent', 'Vialio vimetumwa ✓') + ' ' + sent
                                        : tk('gsg_inv_none', 'Hakuna vialio vilivyotumwa (duplicates/limits)'), sent ? 'success' : 'info');
                                } catch (eT) {}
                                try { renderInfoDrawer(gidInv); } catch (eR2) {}
                            })();
                        }
                    });
                }
                return;
            }
            else if (act === 'gsg-mkorganizer') {
                var tgtO = b.getAttribute('data-uid'); var gidAdm2 = CUR.gid;
                if (!tgtO || !gidAdm2) return;
                (async function () {
                    var rrO = await window.skhGroupSetRole(gidAdm2, tgtO, 'organizer');
                    try { if (window.showToast) window.showToast(rrO ? tk('gsg_role_ok', 'Role imebadilika ✓') : tk('gsg_role_fail', 'Imeshindwa'), rrO ? 'success' : 'info'); } catch (eRO) {}
                    try { renderInfoDrawer(gidAdm2); } catch (eRO2) {}
                })();
                return;
            }
            else if (act === 'gsg-vbiz') {
                var tgtV = b.getAttribute('data-uid'); var gidAdm3 = CUR.gid; var onF = b.getAttribute('data-on') === '1';
                if (!tgtV || !gidAdm3) return;
                (async function () {
                    var rrV = await window.skhGroupSetVerifiedBusiness(gidAdm3, tgtV, onF);
                    try { if (window.showToast) window.showToast(rrV && rrV.ok ? (onF ? tk('gsg_vbiz2', 'Biashara imethibitishwa ✓') : tk('gsg_vbiz3', 'Tick imetolewa ✓')) : tk('gsg_role_fail', 'Imeshindwa'), rrV && rrV.ok ? 'success' : 'info'); } catch (eRV) {}
                    try { renderInfoDrawer(gidAdm3); } catch (eRV2) {}
                })();
                return;
            }
            else if (act === 'gsg-mkadmin' || act === 'gsg-mkmember') {
                var tgt1 = b.getAttribute('data-uid');
                var gidAdm = CUR.gid;
                if (!tgt1 || !gidAdm) return;
                (async function () {
                    var rr2 = await window.skhGroupSetRole(gidAdm, tgt1, act === 'gsg-mkadmin' ? 'admin' : 'member');
                    try {
                        if (window.showToast) window.showToast(rr2 ? tk('gsg_role_ok', 'Role imebadilika ✓') : tk('gsg_role_fail', 'Imeshindwa'), rr2 ? 'success' : 'info');
                    } catch (eT) {}
                    try { renderInfoDrawer(gidAdm); } catch (eR3) {}
                    try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR4) {}
                })();
                return;
            }
            else if (act === 'gsg-rxn-pop') {
                openRxnPop(b, b.getAttribute('data-mid'));
                return;
            }
            else if (act === 'gsg-react') {
                var midR = b.getAttribute('data-mid');
                var avR = b.getAttribute('data-av');
                var gidRx = CUR.gid;
                closeRxnPop();
                if (!midR || !avR || !gidRx) return;
                (async function () {
                    await window.skhGroupToggleReaction(gidRx, midR, avR);
                    try { if (CUR.gid === gidRx) renderMsgs(gidRx); } catch (eRX) {}
                })();
                return;
            }
            else if (act === 'gsg-save-info') {
                var gidSi = CUR.gid;
                if (!gidSi) return;
                var nmEl = document.getElementById('gsgEditName');
                var dsEl = document.getElementById('gsgEditDesc');
                (async function () {
                    var g2 = await window.skhGroupUpdateInfo(gidSi, { name: nmEl ? nmEl.value : undefined, description: dsEl ? dsEl.value : undefined });
                    try {
                        if (window.showToast) window.showToast(g2 ? tk('gsg_info_saved', 'Taarifa zimehifadhiwa ✓') : tk('gsg_nothing_changed', 'Hakuna mabadiliko'), g2 ? 'success' : 'info');
                    } catch (eSI) {}
                    if (g2 && g2.name) { try { var tt = document.querySelector('#skhGroupSogaModal .skh-discover-title'); if (tt) tt.textContent = g2.name; } catch (eTT) {} }
                    if (g2) { try { renderInfoDrawer(gidSi); } catch (eR2c) {} try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR2d) {} }
                })();
                return;
            }
            else if (act === 'gsg-avatar') {
                var av = b.getAttribute('data-av');
                var gidAv = CUR.gid;
                if (!av || !gidAv) return;
                (async function () {
                    var rr0 = await window.skhGroupSetAvatar(gidAv, av);
                    if (rr0) {
                        try { var tile = document.getElementById('gsgAvatarTile'); if (tile) tile.textContent = rr0; } catch (eAV) {}
                        try { if (window.showToast) window.showToast(tk('gsg_avatar_ok', 'Alama imebadilika ✓'), 'success'); } catch (eAV2) {}
                        try { renderInfoDrawer(gidAv); } catch (eAV3) {}
                        try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eAV4) {}
                    }
                })();
                return;
            }
            else if (act === 'gsg-transfer') {
                var tgt0 = b.getAttribute('data-uid');
                var gidTr = CUR.gid;
                if (!tgt0 || !gidTr) return;
                (async function () {
                    // [R24] kabidhi umiliki — mmoja kwa mmoja kupitia engine (owner-only guard)
                    var rr1 = await window.skhGroupTransferOwnership(gidTr, tgt0);
                    try {
                        if (window.showToast) window.showToast(rr1 ? tk('gsg_transfer_ok', 'Umiliki umehamishwa ✓') : tk('gsg_role_fail', 'Imeshindwa'), rr1 ? 'success' : 'info');
                    } catch (eT5) {}
                    if (rr1) {
                        // role yangu imebadilika engine-side (owner → admin) — sawazisha cache
                        try { var ms2 = await skh.getDoc(mRef(gidTr, uid())); CUR.__myRole = (ms2 && ms2.exists && ms2.exists() && ms2.data().status === 'active') ? (ms2.data().role || 'member') : null; } catch (eR1) {}
                        try { renderInfoDrawer(gidTr); } catch (eR2b) {}
                    }
                })();
                return;
            }
            else if (act === 'gsg-remove') {
                var tgt2 = b.getAttribute('data-uid');
                var gidRm = CUR.gid;
                if (!tgt2 || !gidRm) return;
                (async function () {
                    var rr3 = await window.skhGroupRemoveMember(gidRm, tgt2);
                    try {
                        if (window.showToast) window.showToast(rr3 ? tk('gsg_removed', 'Mwanachama ametolewa') : tk('gsg_role_fail', 'Imeshindwa'), rr3 ? 'info' : 'info');
                    } catch (eT) {}
                    try { renderInfoDrawer(gidRm); } catch (eR5) {}
                    try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR6) {}
                })();
                return;
            }
            else if (act === 'gsg-leave') {
                var gidLv = CUR.gid;
                if (!gidLv) return;
                (async function () {
                    await window.skhGroupLeave(gidLv);
                    window.skhCloseGroupSoga();
                    try {
                        if (window.showToast) window.showToast(tk('grp_left', 'Umetoka kikundi'), 'info');
                    } catch (eL) {}
                    try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR7) {}
                    try { if (window.skhSyncInvitesUI) window.skhSyncInvitesUI(); } catch (eR8) {}
                })();
                return;
            }
            else if (act === 'gsg-archive') {
                var gidAr = CUR.gid;
                if (!gidAr) return;
                (async function () {
                    var rr4 = await window.skhGroupArchive(gidAr, 'ARCHIVED');
                    window.skhCloseGroupSoga();
                    try {
                        if (window.showToast) window.showToast(rr4 ? tk('grp_archived_ok', 'Kikundi kimewekwa kumbukumbu ✓') : tk('gsg_role_fail', 'Imeshindwa'), 'info');
                    } catch (eA) {}
                    try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR9) {}
                })();
                return;
            }
            else if (act === 'gsg-pend-ok' || act === 'gsg-pend-no') {
                var prow = b.closest('.gsg-pend-row');
                var pu = prow ? prow.getAttribute('data-uid') : null;
                var gid3 = CUR.gid;
                if (!pu || !gid3) return;
                (async function () {
                    var rr = await window.skhGroupApproveJoin(gid3, pu, act === 'gsg-pend-ok');
                    if (!rr) return;
                    try {
                        if (window.showToast) window.showToast(
                            rr.approved ? tk('grp_approved', 'Mwanachama ameingia kikundini ✓')
                                        : tk('grp_rejected', 'Ombi limekataliwa.'), rr.approved ? 'success' : 'info');
                    } catch (eT) {}
                    try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR) {}
                    // re-refresh banner + header (members count / banner disappear)
                    try { window.skhOpenGroupSoga(gid3); } catch (eO2) {}
                })();
            }
        } catch (e) {}
    }, true);
})();

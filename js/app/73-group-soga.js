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
        // [TYPING 2026-11] Madoa matatu yanayopepesa — sawa na chat ya kawaida
        var subEl = document.getElementById('gsgSubEl');
        if (!names.length) {
            el.innerHTML = ''; el.classList.remove('is-on');
            if (subEl && subEl.__typing) { subEl.innerHTML = CUR.__subHtml || ''; subEl.__typing = false; }
            return;
        }
        var tx = esc(names.slice(0, 3).join(', ')) + ' '
            + (names.length === 1 ? tk('ch_typing_one', 'anaandika…') : tk('ch_typing_many', 'wanaandika…'));
        el.innerHTML = '<span class="gsg-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
            + '<span class="gsg-typing-tx">' + tx + '</span>';
        el.classList.add('is-on');
        // Kichwa: "• • • Baraka anaandika…" — kama chat ya kawaida (34-chat-core §updateHeaderSub)
        if (subEl) {
            subEl.innerHTML = '<span class="gsg-typing-dots gsg-typing-dots--hd" aria-hidden="true"><i></i><i></i><i></i></span>'
                + '<span class="gsg-typing-hd">' + tx + '</span>';
            subEl.__typing = true;
        }
    }

    // [TYPING] hook ya kipimo (bila athari kwenye app)
    try { window.__gsgTypingLine = renderTypingLine; } catch (eTY) {}

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
    /* [GROUP UI 2026-11] Ikoni za safu ya juu — familia moja (stroke ~2).
       Hazibadilishi handlers: zote zinabaki data-act="gsg-*". */
    var I = {
        back:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
        info:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none"/></svg>',
        plus:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
        emoji: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r=".85" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".85" fill="currentColor" stroke="none"/></svg>',
        send:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12 20 4l-7 16-3-7z"/></svg>',
        // [COMPOSER 2026-11] sawa na chat ya kawaida (index.html #voiceBtn / #chatTradeBtn)
        mic:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
        trade: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>'
    };

    var GI = {   // [R13-G]
        eye: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
        chat: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5a3 3 0 0 1-3 3H9l-4.5 3V6.5a3 3 0 0 1 3-3h9.5a3 3 0 0 1 3 3z"/></svg>'
    };
    function buildModal() {
        var m = document.getElementById('skhGroupSogaModal');
        if (m) return m;
        m = document.createElement('div');
        m.className = 'skh-sheet-overlay';
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
        /* [REPLY JUMP 2026-11] Bofya kilichojibiwa → rukia ujumbe husika.
           Rangi zimeunganishwa kwenye palette ya mfumo (kijani), sio buluu. */
        var rid = rt.id || rt.msgId || '';
        var clickable = rid ? ' data-quote-id="' + esc(rid) + '" role="button" tabindex="0" onclick="event.stopPropagation();window.skhChatJumpToMessage && window.skhChatJumpToMessage(\'' + esc(rid) + '\')"' : '';
        return '<div class="gsg-quote"' + clickable + ' style="border-left:3px solid ' + (my ? '#0F7E67' : '#18A982') + ';background:' + (my ? '#c8ecd9' : '#E7F4EE') + ';border-radius:7px;padding:4px 8px;margin-bottom:5px;font-size:11px;color:#334155;cursor:pointer;">'
            + '<b style="color:#0F6E55;">' + esc(rt.by || '') + '</b> '
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
        if (t === 'audio' || t === 'voice') {
            var secs = Math.max(0, Math.round((+m.durationMs || 0) / 1000));
            var mm = Math.floor(secs / 60), ss = secs % 60;
            return '<div class="gsg-audio" style="min-width:210px;max-width:270px;background:#fff;border:1px solid #cbe9dd;border-left:4px solid #18A982;border-radius:12px;padding:8px 10px;">'
                + '<div style="display:flex;align-items:center;gap:8px;">'
                + '<span style="width:32px;height:32px;flex:none;border-radius:50%;background:#E9F8F1;display:flex;align-items:center;justify-content:center;color:#0F7E67;">'
                + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg></span>'
                + '<div style="min-width:0;flex:1;"><b style="display:block;font-size:11.5px;color:#0f172a;">' + esc(tk('gsg_voice_msg', 'Ujumbe wa sauti')) + '</b>'
                + '<small style="color:#64748b;">' + (secs ? mm + ':' + (ss < 10 ? '0' : '') + ss : '') + '</small></div>'
                + '</div>'
                + (m.audioUrl ? '<audio controls preload="metadata" src="' + esc(String(m.audioUrl)) + '" style="margin-top:7px;width:100%;height:32px;"></audio>' : '')
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
            /* [R13-G] kadi ya bidhaa kama design ref: picha · jina · bei/kipimo · stock · mahali ·
               [Tazama] (ukurasa halisi wa bidhaa) + [Jadili] (chat binafsi na muuzaji). */
            var pr = m.product || {};
            var prN = String(pr.price == null ? '' : pr.price).replace(/[^0-9.]/g, '');
            var prTxt = prN ? 'TSh ' + Number(prN).toLocaleString('en-US') : (pr.price ? esc(String(pr.price)) : '');
            var stockBits = [];
            if (pr.qty) stockBits.push('Stock: ' + esc(String(pr.qty)) + (pr.unit ? ' ' + esc(pr.unit) : ''));
            if (pr.location) stockBits.push(esc(pr.location));
            return '<div class="gsg-pcard">'
                + '<span class="gsg-pc-img">' + (pr.imageUrl ? '<img src="' + esc(String(pr.imageUrl)) + '" alt="" loading="lazy">' : (ATC && ATC.prod ? ATC.prod : '')) + '</span>'
                + '<div class="gsg-pc-b">'
                +   '<b class="gsg-pc-t">' + esc(pr.name || '') + '</b>'
                +   (prTxt ? '<span class="gsg-pc-pr">' + prTxt + (pr.unit ? ' <small>/ ' + esc(pr.unit) + '</small>' : '') + '</span>' : '')
                +   (stockBits.length ? '<small class="gsg-pc-m">' + stockBits.join(' · ') + '</small>' : (pr.sellerName ? '<small class="gsg-pc-m">' + esc(pr.sellerName) + '</small>' : ''))
                +   '<span class="gsg-pc-acts">'
                +     (pr.productId ? '<button type="button" class="gsg-pc-btn" data-act="gsg-view-product" data-pid="' + esc(pr.productId) + '">' + GI.eye + ' Tazama</button>' : '')
                +     (pr.productId && !my ? '<button type="button" class="gsg-pc-btn is-pri" data-act="gsg-jadili" data-pid="' + esc(pr.productId) + '" data-uid="' + esc(m.senderUid || '') + '" data-name="' + esc(m.senderName || '') + '">' + GI.chat + ' Jadili</button>' : '')
                +   '</span>'
                + '</div></div>';
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

    function msgRow(m, my, ri, tc, gp) {   // gp = { first, grouped } — makundi ya mfululizo
        var t = '' + '';
        try { var d = new Date(m.at); t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); } catch (eT) {}
        // [R25] read receipts (haijuguswi)
        var tick = '';
        if (my) {
            tick = ri && ri.allRead
                ? ' <span title="' + tk('gsg_read_all', 'Wamesoma wote') + ': ' + esc((ri.names || []).join(', ')) + '" style="color:#1268A8;font-weight:800;">\u2713\u2713</span>'
                : ' <span title="' + tk('gsg_read_some', 'Bado wengine hawajasoma') + '" style="color:#94a3b8;font-weight:800;">\u2713\u2713</span>';
        }
        // [R13-G] ujumbe wa mfumo (tukio halisi la kikundi) — kidonge katikati
        if (m.type === '_sys') {
            var nmS = (CUR.__names || {})[m.actorUid] || tk('grp_member', 'Mwanachama');
            var nmT = (CUR.__names || {})[m.targetUid] || '';
            var sysTxt = m.evType === 'member_joined' ? nmS + ' amejiunga kwenye kundi'
                : m.evType === 'member_left' ? nmS + ' ameondoka kwenye kundi'
                : m.evType === 'member_removed' ? (nmT || 'Mwanachama') + ' ameondolewa kwenye kundi'
                : nmS + ' ameunda kundi' + (m.note ? ' \u201c' + m.note + '\u201d' : '');
            return '<div class="gsg-sys" role="note"><span class="gsg-sys-ic" aria-hidden="true">'
                + '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2"/><path d="M16.4 5.2a3.1 3.1 0 0 1 0 5.9"/><path d="M18 14.6c2 .6 3.3 2.2 3.3 4.4"/></svg></span>'
                + '<span class="gsg-sys-t">' + esc(sysTxt) + '</span><small>' + t + '</small></div>';
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
                + '<button type="button" data-act="gsg-tab" data-tab="groupOrders" style="margin-top:8px;border:1.5px solid #18A982;background:#fff;color:#0f766e;font-weight:800;font-size:10.5px;padding:6px 12px;border-radius:99px;cursor:pointer;">' + tk('gsg_tab_orders', 'Oda') + ' ›</button></div>';
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
        var tCount = (tc && m.__id && tc[m.__id]) || 0;
        var first = !gp || gp.first;
        var grouped = !!(gp && gp.grouped);
        // [GROUP UI 2026-11] Row yenye makundi: avatar mara moja kwa mfululizo,
        // jina/muda mara moja kwa mfululizo; handlers zote zimebaki zilezile.
        var rowCls = 'gsg-msg-row' + (my ? ' is-own' : '') + (first ? ' is-start' : '') + (grouped ? ' is-grouped' : '');
        return '<div class="' + rowCls + '" data-mid="' + esc(m.__id || '') + '">'
            + '<span class="gsg-mav' + (grouped ? ' ghost' : '') + '" aria-hidden="true">' + esc(nm.trim().charAt(0).toUpperCase() || '?') + '</span>'
            + '<div class="gsg-mwrap">'
            + (grouped ? '' : '<small class="gsg-mmeta"><span class="who">' + esc(nm) + '</span>' + gsgRoleChip(m.senderUid) + '<span>· ' + t + tick + '</span></small>')
            + (function () {
                var plainTxt = (!m.type || m.type === 'text');
                return '<div class="' + (plainTxt ? 'gsg-bubble' : 'gsg-rich') + '" title="' + esc(t) + '">'
                    + gsgQuoteHtml(m.replyTo, my) + gsgContentHtml(m, my) + '</div>';
            })()
            + (function () {
                if (!m.__id) return '';
                var rx = m.reactions && typeof m.reactions === 'object' ? m.reactions : {};
                var chips = Object.keys(rx).filter(function (k) { return Array.isArray(rx[k]) && rx[k].length; }).map(function (k) {
                    var mine = rx[k].indexOf(uid()) >= 0;
                    return '<button type="button"' + (mine ? ' class="is-mine"' : '') + ' data-act="gsg-react" data-av="' + esc(k) + '" data-mid="' + esc(m.__id) + '">' + esc(k) + ' ' + rx[k].length + '</button>';
                }).join('');
                var prevTxt = (m.text || m.caption || (m.question ? ('\u{1F4CB} ' + m.question) : '') || (m.fileName || '') || '').slice(0, 80);
                return '<div class="gsg-acts">'
                    + '<button type="button" data-act="gsg-reply" data-mid="' + esc(m.__id) + '" data-by="' + esc(nm) + '" data-prev="' + esc(prevTxt) + '" data-root="' + esc(m.threadRootId || '') + '" title="' + tk('gsg_reply', 'Jibu') + '">\u21a9</button>'
                    + '<button type="button" data-act="gsg-rxn-pop" data-mid="' + esc(m.__id) + '" title="' + tk('gsg_react', 'Ongeza reaction') + '">+</button>'
                    + (tCount > 0 && !m.threadRootId ? '<button type="button" data-act="gsg-thread" data-mid="' + esc(m.__id) + '">' + tCount + ' ' + tk('gsg_replies', 'majibu') + ' \u203a</button>' : '')
                    + (chips ? '<span class="gsg-rx">' + chips + '</span>' : '')
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
        CUR.__annOpen = false; CUR.__annHidden = null;

        var m = buildModal();
        try { document.body.classList.add('gsg-open'); } catch (eBO) {}
        if (m) {
            // [ABRUPT FAST UI] Fungua dirisha kamili la kikundi MARA MOJA bila kusubiri queries
            m.innerHTML = '<div class="skh-sheet">'
                + '<div class="gsg-fs">'
                /* ---- 1 · HEADER ---- */
                + '<header class="gsg-head">'
                +   '<button type="button" class="skh-sheet-back" data-act="gsg-close" aria-label="' + tk('back', 'Rudi') + '">' + I.back + '</button>'
                +   '<div id="gsgAvatarTile" class="gsg-avatar" aria-hidden="true">#</div>'
                +   '<div class="gsg-head-txt">'
                +     '<b id="gsgTitleEl" class="skh-sheet-title">' + tk('group', 'Kikundi') + '</b>'
                +     '<small id="gsgSubEl" class="skh-sheet-sub">' + tk('loading', 'Inapakia...') + '</small>'
                +   '</div>'
                +   '<button type="button" class="skh-sheet-back" data-act="gsg-info" aria-label="' + tk('gsg_info', 'Taarifa za kikundi') + '">' + I.info + '</button>'
                + '</header>'
                /* ---- 2 · MINI NAV CARDS (renderTabsBar) ---- */
                + '<div id="gsgTabs" role="tablist"></div>'
                + '<div id="gsgDesc" class="gsg-desc"></div>'
                /* ---- 3 · PINNED ANNOUNCEMENT ---- */
                + '<div id="gsgAnnounce"></div>'
                + '<div id="gsgAdSlot" data-skh-ad-slot="groups" data-skh-ad-protected="true" aria-label="Sponsored content" hidden style="margin:8px 12px;"></div>'
                /* ---- 4 · BODY ---- */
                + '<div class="gsg-body">'
                + '<div id="gsgTabChat">'
                +   '<div id="gsgTyping"></div>'
                +   '<div id="gsgMsgs"><small class="gsg-loading">' + tk('loading', 'Inapakia meseji...') + '</small></div>'
                +   '<div id="gsgReplyBar" style="display:none;"></div>'
                +   '<div id="gsgRecChip" role="status" aria-live="polite"></div>'
                +   '<div id="gsgComposerRow" class="gsg-comp-row">'
                +     '<button type="button" class="gsg-cbtn" data-act="gsg-attach" title="' + tk('gsg_attach', 'Ambatisha') + '" aria-label="' + tk('gsg_attach', 'Ambatisha') + '">' + I.plus + '</button>'
                +     '<button type="button" class="gsg-cbtn" data-act="gsg-emoji" id="gsgEmojiBtn" title="Emoji" aria-label="Emoji" aria-haspopup="true" aria-expanded="false">' + I.emoji + '</button>'
                +     '<div class="gsg-field">'
                +       '<input id="gsgInput" type="text" autocomplete="off" placeholder="' + tk('ch_msg_ph', 'Andika ujumbe...') + '">'
                +     '</div>'
                +     '<button type="button" class="gsg-cbtn" data-act="gsg-voice" id="gsgVoiceBtn" title="' + tk('ch_voice', 'Rekodi ujumbe wa sauti') + '" aria-label="' + tk('ch_voice', 'Rekodi ujumbe wa sauti') + '">' + I.mic + '</button>'
                +     '<button type="button" class="gsg-cbtn gsg-cbtn-trade" data-act="gsg-trade" id="gsgTradeBtn" title="' + tk('ch_trade', 'Biashara: bidhaa, oda, ofa') + '" aria-label="' + tk('ch_trade', 'Biashara') + '" aria-haspopup="true" aria-expanded="false">' + I.trade + '</button>'
                +     '<button type="button" class="gsg-send" data-act="gsg-send" title="' + tk('ch_send', 'Tuma') + '" aria-label="' + tk('ch_send', 'Tuma') + '">' + I.send + '</button>'
                +   '</div>'
                + '</div>'
                + '<div id="gsgTabMedia" style="display:none;"></div>'
                + '<div id="gsgTabProducts" style="display:none;"></div>'
                + '<div id="gsgTabOrders" style="display:none;"></div>'
                + '<div id="gsgTabIndiv" style="display:none;"></div>'
                + '<div id="gsgTabSoko" style="display:none;"></div>'
                + '<div id="gsgTabBuyers" style="display:none;"></div>'
                + '<div id="gsgTabTransport" style="display:none;"></div>'
                + '<div id="gsgTabOffers" style="display:none;"></div>'
                + '<div id="gsgTabMembers" style="display:none;"></div>'
                + '<div id="gsgInfo" style="display:none;"></div>'
                + '</div>'
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
                if (titleEl) {
                    var nm = g.name || (CUR.__convName || '') || '';
                    if (nm && nm !== 'Kikundi') titleEl.textContent = nm;
                }
                var avEl = document.getElementById('gsgAvatarTile');
                if (avEl) {
                    // [GROUP UI 2026-11] Tile ya kikundi: herufi ya jina lake (sio '#').
                    var gName = String(g.name || 'Kikundi').trim();
                    avEl.textContent = String(g.avatar || gName.charAt(0) || 'K').toUpperCase().slice(0, 2);
                }
                var subEl = document.getElementById('gsgSubEl');
                if (subEl) {
                    var memN = Number(g.memberCount || (Array.isArray(g.members) ? g.members.length : 0) || 0);
                    // [GROUP UI 2026-11] Lebo fupi — kichwa kifupi kisikatwe.
                    var typeLbl = (g.groupType === 'PERMANENT_COMMUNITY') ? tk('gsg_type_comm', 'Community') : tk('gsg_type_commr', 'Commerce');
                    subEl.innerHTML = '<span class="gsg-chip gsg-chip--members">'
                        + (memN > 0 ? memN + ' ' : '') + esc(tk('grp_members', 'wanachama'))
                        + '</span><span class="gsg-chip">' + esc(typeLbl) + '</span>';
                    CUR.__subHtml = subEl.innerHTML;   // [TYPING] hifadhi ya kurejesha
                }
                var dEl = document.getElementById('gsgDesc');
                if (dEl && g.description) {
                    // [GROUP UI 2026-11] Aina ya kikundi ipo kwenye chip ya kichwa — isirudiwe hapa.
                    dEl.textContent = String(g.description);
                    dEl.style.display = 'block';
                }
                CUR.__sendPolicy = g.sendPolicy || 'everyone';
                try { renderAnnounce(g.announcement || null); } catch (eAN) {}
                // Organic pinned announcements stay in #gsgAnnounce. Campaign ads
                // are a separate, optional slot and are enabled only for permanent
                // community groups (not commerce/transaction groups).
                try {
                    var groupAd = document.getElementById('gsgAdSlot');
                    if (groupAd) {
                        if (g.groupType === 'PERMANENT_COMMUNITY') {
                            groupAd.removeAttribute('data-skh-ad-protected');
                            groupAd.hidden = false;
                            groupAd.style.display = 'block';
                            groupAd.dataset.skhAdSurface = 'community_group';
                            groupAd.dataset.skhAdEntityType = 'group';
                            groupAd.dataset.skhAdEntityId = gid;
                            groupAd.dataset.skhAdCategory = String(g.category || 'community');
                            if (window.skhAdDeliveryController) window.skhAdDeliveryController.refreshSlot(groupAd, { force: true });
                        } else {
                            groupAd.dataset.skhAdProtected = 'true';
                            groupAd.hidden = true;
                            groupAd.style.display = 'none';
                            if (window.skhAdDeliveryController) window.skhAdDeliveryController.pauseSlot(groupAd);
                        }
                    }
                } catch (eAd) { /* Group chat remains usable if delivery fails. */ }

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
                    /* [R13-G] idadi HALISI ya wanachama active (memberCount ya doc haisasishwi mtu
                       akijiunga — rules zinaruhusu admin/owner tu kuandika group doc). */
                    var actN = Object.keys(CUR.__roles).length;
                    var subEl2 = document.getElementById('gsgSubEl');
                    if (subEl2 && actN) {
                        var typeLbl2 = (g.groupType === 'PERMANENT_COMMUNITY') ? tk('gsg_type_comm', 'Community') : tk('gsg_type_commr', 'Commerce');
                        subEl2.innerHTML = '<span class="gsg-chip gsg-chip--members"><i class="gsg-dot" aria-hidden="true"></i>' + actN + ' ' + esc(tk('grp_members', 'wanachama'))
                            + '</span><span class="gsg-chip">' + esc(typeLbl2) + '</span>';
                        CUR.__subHtml = subEl2.innerHTML;
                    }
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
                            var us = await skh.getUserCard(pend[i].userId);
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
        /* [GROUP UI 2026-11] Miondoko sawa na chat ya kawaida:
           swipe KULIA = jibu, swipe KUSHOTO = vitendo, long-press = vitendo. */
        try { gsgBindGestures(); } catch (eBG) {}
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
        try { document.body.classList.remove('gsg-open'); } catch (e0) {}
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
                var us = await skh.getUserCard(uids2[i]);
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
        // [GROUP UI 2026-11] Menyu ni PANEL kamili ndani ya dirisha: class inaficha
        // tabs + chat na kuonyesha #gsgInfo (ona css/53 §8). Handlers hazibadiliki.
        try {
            var fsWrap = document.querySelector('#skhGroupSogaModal .gsg-fs');
            if (fsWrap) fsWrap.classList.add('gsg-info-open');
        } catch (eFS) {}
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

        host.innerHTML = '<div class="gsg-info-head">'
            + '<b>' + tk('gsg_info', 'Taarifa za kikundi') + '</b>'
            + '<button type="button" class="gsg-sheet-x" data-act="gsg-info" aria-label="' + tk('close', 'Funga') + '">×</button></div>'
            + '<div class="gsg-info-body">'
            + '<div style="margin:8px 12px;border:1px solid #e6efea;border-radius:14px;background:#fff;overflow:hidden;">'
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
            + '</div>'
            // [GROUP UI 2026-11] Menyu ya kikundi kwa makundi, safu zenye ikoni moja.
            // Handlers ni zilezile: gsg-archive / gsg-leave (hakuna mpya).
            + '<div class="gsg-menu-grp">' + tk('gsg_menu_grp_g', 'Kikundi') + '</div>'
            + '<div style="padding:0 8px 12px;">'
            +   (canManage
                    ? '<button type="button" class="gsg-menu-row" data-act="gsg-archive">'
                        + '<span class="mic2"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4.5" rx="1.4"/><path d="M5 8.5V19a1.6 1.6 0 0 0 1.6 1.6h10.8A1.6 1.6 0 0 0 19 19V8.5"/><path d="M10 12.5h4"/></svg></span>'
                        + '<span class="mtx2"><span class="mt2">' + tk('grp_archive', 'Weka kumbukumbu') + '</span>'
                        + '<span class="ms2">' + tk('gsg_archive_sub', 'Ficha kikundi kwenye orodha yako') + '</span></span>'
                    + '</button>' : '')
            +   '<button type="button" class="gsg-menu-row is-danger" data-act="gsg-leave">'
                + '<span class="mic2"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/></svg></span>'
                + '<span class="mtx2"><span class="mt2">' + tk('grp_leave', 'Ondoka kikundi') + '</span>'
                + '<span class="ms2">' + tk('gsg_leave_sub', 'Hutapokea ujumbe wa kikundi tena') + '</span></span>'
                + '</button>'
            + '</div>'
            + '</div>'
            + '</div>';   // .gsg-info-body
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
    /* [GROUP BIZ 2026-11] Nav 9 ya mstari mmoja. Wanachama HAWAPO kwenye nav —
     * usimamizi upo Taarifa (ⓘ) / More. Group Oda ≠ Oda za Kawaida. */
    var GSG_TABS = ['chat', 'media', 'products', 'groupOrders', 'orders', 'transport', 'offers', 'members', 'soko', 'buyers'];   // [R13-G] order of the design ref (Wanachama added)   // [§45] explicit enum
    var gsgTabMeta = {
        chat:    { key: 'gsg_tab_chat',    fb: 'Mazungumzo' },
        products: { key: 'gsg_tab_products', fb: 'Bidhaa' },
        groupOrders: { key: 'gsg_tab_gorders', fb: 'Group Oda' },
        orders:  { key: 'gsg_tab_orders',  fb: 'Oda za Kawaida' },
        soko:    { key: 'gsg_tab_soko',    fb: 'Soko' },
        buyers:  { key: 'gsg_tab_buyers',  fb: 'Ununuzi' },
        transport: { key: 'gsg_tab_transport', fb: 'Usafiri' },
        offers:  { key: 'gsg_tab_offers',  fb: 'Ofa' },
        members: { key: 'gsg_tab_members', fb: 'Wanachama' },
        media:   { key: 'gsg_tab_media',   fb: 'Media' }
    };

    /* [GROUP UI 2026-11] Mini-nav cards: mstari mmoja unaosogeza kwa swipe/mouse.
     * Kadi zinazotolewa ni zile TU zenye view halisi (GSG_TABS). Soko / Ununuzi /
     * Usafiri / Ofa hazina handler → hazionyeshwi (capability gate), sio teaser za uongo. */
    var GSG_TAB_ICON = {
        chat: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5a3 3 0 0 1-3 3H9l-4.5 3V6.5a3 3 0 0 1 3-3h9.5a3 3 0 0 1 3 3z"/></svg>',
        orders: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1.4 12.1a1.8 1.8 0 0 1-1.8 1.9H6.4a1.8 1.8 0 0 1-1.8-1.9z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
        members: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2"/><path d="M16.4 5.2a3.1 3.1 0 0 1 0 5.9"/><path d="M18 14.6c2 .6 3.3 2.2 3.3 4.4"/></svg>',
        media: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.3L13 17l3-2.6 4 3.6"/></svg>',
        products: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8h12l1.2 12H4.8L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
        groupOrders: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
        soko: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l2-5h14l2 5"/><path d="M4 9h16v10H4z"/><path d="M9 19v-5h6v5"/></svg>',
        buyers: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4 4 0 0 1 0 7"/><path d="M18 6a8 8 0 0 1 0 12"/></svg>',
        transport: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg>',
        offers: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12l4-4 4 3 2-2 4 4"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M12 11l-3 3 2 2 3-3z"/></svg>',
    };
    var GSG_TAB_TONE = { chat: 'green', media: 'violet', products: 'blue', groupOrders: 'gold',
        orders: 'teal', soko: 'blue', buyers: 'gold', transport: 'teal', offers: 'green', members: 'violet' };
    // [GROUP UI 2026-11] Lebo FUPI kwa kadi (76px) — jina kamili linabaki kwenye title/aria.
    var GSG_TAB_SHORT = {
        chat:    function () { return 'Mazungumzo'; },   // [R13-G] lebo kamili (design ref)
        products: function () { return tk('gsg_tab_products', 'Bidhaa'); },
        groupOrders: function () { return 'Group Orders'; },
        orders:  function () { return 'Oda za Kawaida'; },
        soko:    function () { return tk('gsg_tab_soko', 'Soko'); },
        buyers:  function () { return tk('gsg_tab_buyers', 'Ununuzi'); },
        transport: function () { return tk('gsg_tab_transport', 'Usafiri'); },
        offers:  function () { return tk('gsg_tab_offers', 'Ofa'); },
        members: function () { return tk('gsg_short_members', 'Wanachama'); },
        media:   function () { return tk('gsg_short_media', 'Media'); }
    };

    function renderTabsBar() {
        var host = document.getElementById('gsgTabs');
        if (!host || !CUR.gid) return;
        var cur = CUR.__tab || 'chat';
        host.innerHTML = GSG_TABS.map(function (t) {
            var on = (t === cur);
            // Group Orders bado imezimwa (chatGroupOrders=false) → kadi inaonekana "is-off"
            var off = ((t === 'groupOrders') && !goOn()) || (t === 'buyers');
            var cls = 'gsg-card' + (on ? ' is-active' : '') + (off ? ' is-off' : '');
            return '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" '
                + 'class="' + cls + '" data-tone="' + (GSG_TAB_TONE[t] || 'green') + '" '
                + 'data-act="gsg-tab" data-tab="' + t + '"'
                + ' title="' + esc(tk(gsgTabMeta[t].key, gsgTabMeta[t].fb)) + '"'
                + ' aria-label="' + esc(tk(gsgTabMeta[t].key, gsgTabMeta[t].fb)) + '">'
                + '<span class="gsg-ic">' + (GSG_TAB_ICON[t] || '') + '</span>'
                + '<span class="gsg-lb" data-no-i18n>' + esc(GSG_TAB_SHORT[t] ? GSG_TAB_SHORT[t]() : tk(gsgTabMeta[t].key, gsgTabMeta[t].fb)) + '</span>'
                + '</button>';
        }).join('')
            /* [R13-G] kadi ya chini ya upande wa kushoto (desktop, design ref) */
            + '<div class="gsg-rail-card" aria-hidden="true"><span class="gsg-rail-shield"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg></span>'
            + '<b data-no-i18n>SokoHai</b><small data-no-i18n>Biashara Salama na Inayoaminika</small></div>';
    }

    /* [GROUP BIZ 2026-11] Ramani ya tab → container. Wanachama hakuna kwenye nav;
     * ufikiaji wake ni kupitia Taarifa (ⓘ) / More (gsgTabMembers inabaki kwa ajili ya
     * renderMembersTab inayotumiwa na panel ya taarifa). */
    var GSG_TAB_HOST = {
        chat: 'gsgTabChat', media: 'gsgTabMedia', products: 'gsgTabProducts',
        groupOrders: 'gsgTabOrders', orders: 'gsgTabIndiv',
        soko: 'gsgTabSoko', buyers: 'gsgTabBuyers', transport: 'gsgTabTransport', offers: 'gsgTabOffers', members: 'gsgTabMembers'
    };

    function setGsgTab(tab) {
        if (!CUR.gid || GSG_TABS.indexOf(tab) < 0) return;      // [§45] hakuna free-form
        CUR.__tab = tab;
        Object.keys(GSG_TAB_HOST).forEach(function (t) {
            var el = document.getElementById(GSG_TAB_HOST[t]);
            if (el) el.style.display = (t === tab) ? (t === 'chat' ? 'flex' : 'block') : 'none';
        });
        renderTabsBar();
        if (tab === 'groupOrders') renderOrdersTab(CUR.gid);
        else if (tab === 'orders') renderIndivOrdersTab(CUR.gid);
        else if (tab === 'products') renderProductsTab(CUR.gid);
        else if (tab === 'media') renderMediaTab(CUR.gid);
        else if (tab === 'soko') renderSokoTab(CUR.gid);
        else if (tab === 'buyers') renderBuyersTab(CUR.gid);
        else if (tab === 'transport') renderTransportTab(CUR.gid);
        else if (tab === 'offers') renderOffersTab(CUR.gid);
        else if (tab === 'members') renderMembersTab(CUR.gid);
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
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'groupOrders') return;
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
            + (g_sendPolicy_blocked() || goOn() ? '' : goSoonBadge())
            + '</div>';
        /* [R13-G] Feature ikiwashwa (emulator preview): kuunda Group Order ya kikundi bado kunahitaji
           injini ya server (rules: groupOrders write:false) — hatuonyeshi kitufe kitakachoshindwa.
           Tunaonyesha Group Buy HALISI za bidhaa za wanachama; [Jiunge] → ukurasa wa bidhaa (groupBuyJoin). */
        var gbHtml = '';
        if (goOn()) { try { gbHtml = await gsgMemberGroupBuys(gid); } catch (eGB) { gbHtml = ''; } }
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'groupOrders') return;
        if (!rows.length) { host.innerHTML = head + (goOn() ? gsgEmptyTabHtml(tk('gsg_no_orders', 'Bado hakuna Group Order ya kikundi'), 'Kuanzisha Group Order ndani ya kikundi kunahitaji injini ya server (Grp Oda 2.0) — inajengwa awamu ijayo.') + gbHtml : gsgEmptyTabHtml('Oda za Pamoja hazijafunguliwa bado', 'Huduma hii inakuja hivi karibuni. Kwa sasa tumia Group Buy kwenye ukurasa wa bidhaa.')); return; }
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
        }).join('') + gbHtml;
    }

    async function gsgMemberGroupBuys(gid) {
        var ids = Object.keys(CUR.__roles || {}).slice(0, 10);
        if (!ids.length) return '';
        var list = [];
        var snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.where('userId', 'in', ids), skh.limit(80)));
        snap.forEach(function (d) { var p = d.data() || {}; if (p.saleMode !== 'group_buy' || (p.publicationStatus && p.publicationStatus !== 'published')) return; p.__id = d.id; list.push(p); });
        if (!list.length) return '';
        return '<div class="gsg-gb"><b class="gsg-msec-t">Group Buy za wanachama</b>' + list.map(function (p) {
            var md = p.modeData || {}, tgt = +md.targetUsers || +md.targetQty || 0, jn = +md.joinedUsers || 0;
            var pct = tgt ? Math.min(100, Math.round(jn / tgt * 100)) : 0;
            var img = p.image || (Array.isArray(p.imagesArray) ? p.imagesArray[0] : '');
            return '<div class="gsg-gb-card"><span class="gsg-pc-img">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') + '</span>'
                + '<div class="gsg-pc-b"><b class="gsg-pc-t">' + esc(p.title || '') + '</b>'
                + '<span class="gsg-pc-pr">TSh ' + Number(md.groupPrice || p.price || 0).toLocaleString('en-US') + (p.unit ? ' <small>/ ' + esc(p.unit) + '</small>' : '') + '</span>'
                + (tgt ? '<small class="gsg-pc-m">Wamejiunga ' + jn + ' / ' + tgt + '</small><span class="gsg-gb-bar"><i style="width:' + pct + '%"></i></span>' : '')
                + '<span class="gsg-pc-acts"><button type="button" class="gsg-pc-btn is-pri" data-act="gsg-view-product" data-pid="' + esc(p.__id) + '">Jiunge</button></span></div></div>';
        }).join('') + '</div>';
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

    /* ================= [GROUP BIZ 2026-11] TAB MPYA =================
     * Kanuni: kila tab inaonyesha DATA HALISI pekee inayopatikana kwa sasa.
     * Sehemu zisizo na backend zinaonyeshwa kama "HAIJAUNGANISHWA" —
     * hakuna mock data, hakuna oda/malipo/tracking ya kubuni. */

    function gsgMoney(n) { return 'TZS ' + (Number(n) || 0).toLocaleString('en-US'); }

    function gsgBizCard(o) {
        var meta = (o.meta || []).filter(Boolean).map(function (m) {
            return '<span class="gsg-biz-mi">' + m + '</span>';
        }).join('');
        return '<div class="gsg-biz-card">'
            + '<div class="gsg-biz-th">' + (o.img || '<span class="gsg-biz-ic">' + (o.icon || '') + '</span>') + '</div>'
            + '<div class="gsg-biz-bd">'
            +   '<div class="gsg-biz-top">'
            +     (o.badge ? '<span class="gsg-biz-badge ' + (o.badge.cls || '') + '">' + esc(o.badge.txt) + '</span>' : '<span></span>')
            +     (o.right ? '<span class="gsg-biz-right">' + o.right + '</span>' : '')
            +   '</div>'
            +   '<b class="gsg-biz-tt">' + esc(o.title) + '</b>'
            +   (o.sub ? '<small class="gsg-biz-sub">' + esc(o.sub) + '</small>' : '')
            +   (o.price ? '<div class="gsg-biz-pr">' + o.price + '</div>' : '')
            +   (meta ? '<div class="gsg-biz-meta">' + meta + '</div>' : '')
            +   (o.act ? '<button type="button" class="gsg-biz-act" data-act="' + o.act + '"' + (o.actData || '') + '>' + esc(o.actLbl || 'Fungua') + '</button>' : '')
            + '</div></div>';
    }

    function gsgBizHead(title, sub, right) {
        return '<div class="gsg-biz-head"><div><b>' + esc(title) + '</b>'
            + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'
            + (right || '') + '</div>';
    }

    function gsgNotConnected(title, lines, icon) {
        return '<div class="gsg-nc">'
            + '<span class="gsg-nc-ic">' + (icon || '') + '</span>'
            + '<b>' + esc(title) + '</b>'
            + '<small>Sehemu hii <b>haijaunganishwa na backend</b> bado. Inaonekana kwa ajili ya muundo tu — hakuna data, oda, malipo au tracking ya kubuni.</small>'
            + (lines && lines.length ? '<ul>' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '')
            + '<span class="gsg-nc-tag">HAIJAUNGANISHWA</span>'
            + '</div>';
    }

    /* ---- Bidhaa & huduma: hutoka kwenye meseji HALISI za kikundi ---- */
    async function renderProductsTab(gid) {
        var host = document.getElementById('gsgTabProducts');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var items = [];
        try {
            var snap = await skh.getDocs(skh.query(msgsCol(gid), skh.limit(200)));
            if (snap && snap.forEach) snap.forEach(function (d) {
                var m = d.data() || {};
                var t = String(m.type || '');
                if (t !== 'product' && t !== 'service') return;
                var o = (t === 'product' ? (m.product || {}) : (m.service || {}));
                items.push({
                    type: t, name: o.name || o.title || '—',
                    price: (+o.price || 0), unit: o.unit || '', seller: m.senderName || '',
                    at: m.at || '', ref: o.id || o.productId || o.serviceId || '',
                    img: o.imageUrl || o.photo || o.thumb || '', loc: o.location || o.area || ''
                });
            });
        } catch (eP) {}
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'products') return;
        if (!items.length) {
            host.innerHTML = gsgEmptyTabHtml('Bado hakuna bidhaa au huduma zilizoshirikishwa',
                'Tumia (+) → Bidhaa / Huduma kutuma listing kwenye kikundi.');
            return;
        }
        host.innerHTML = '<div class="gsg-biz-wrap">'
            + gsgBizHead('Bidhaa', items.length + ' vitu · kutoka meseji za kikundi')
            + '<div class="gsg-biz-grid">' + items.map(function (it) {
                return gsgBizCard({
                    title: it.name,
                    sub: it.seller + (it.loc ? ' · ' + it.loc : ''),
                    price: it.price ? gsgMoney(it.price) + (it.unit ? ' <small>/ ' + esc(it.unit) + '</small>' : '') : '',
                    badge: { txt: it.type === 'product' ? 'Bidhaa' : 'Huduma', cls: it.type === 'product' ? 'blue' : 'gold' },
                    meta: [it.at ? String(it.at).slice(0, 10) : '', it.ref || ''],
                    img: it.img ? '<img src="' + esc(it.img) + '" alt="" loading="lazy">' : '',
                    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12l1.2 12H4.8L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>'
                });
            }).join('') + '</div>'
            + '<small class="gsg-biz-note">Vitu hivi ni vya meseji halisi za kikundi. Hakuna listing inayoundwa hapa.</small>'
            + '</div>';
    }

    /* ---- Oda za Kawaida: oda BINAFSI (GROUP_CHILD_ORDER) zangu kwenye kikundi hiki ---- */
    async function renderIndivOrdersTab(gid) {
        var host = document.getElementById('gsgTabIndiv');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var rows = [], denied = false;
        try {
            var q = skh.query(skh.collection(skh.db, 'orders'), skh.where('buyerId', '==', uid()), skh.limit(60));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) {
                var o = d.data() || {};
                if (String(o.groupId || '') !== String(gid)) return;
                o.__id = d.id; rows.push(o);
            });
        } catch (eIO) { denied = true; }
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'orders') return;
        var head = gsgBizHead('Oda za Kawaida',
            rows.length + ' oda zako kutoka kikundi hiki',
            '<span class="gsg-biz-pill">Mimi ↔ muuzaji</span>');
        if (!rows.length) {
            host.innerHTML = '<div class="gsg-biz-wrap">' + head
                + gsgEmptyTabHtml('Hakuna oda binafsi bado',
                    denied ? 'Imeshindikana kusoma oda zako kwa sasa.'
                           : 'Oda binafsi ni ya mwanachama mmoja kwa muuzaji mmoja — si Group Oda.')
                + '<small class="gsg-biz-note">Group Oda (ununuzi wa pamoja) ipo kwenye tab yake tofauti.</small>'
                + '</div>';
            return;
        }
        host.innerHTML = '<div class="gsg-biz-wrap">' + head
            + '<div class="gsg-biz-grid">' + rows.map(function (o) {
                return gsgBizCard({
                    title: o.itemTitle || o.productTitle || 'Oda',
                    sub: (o.sellerName || '') + (o.parentCode ? ' · ' + o.parentCode : ''),
                    price: gsgMoney(o.totalPrice || o.amount || 0),
                    badge: { txt: String(o.status || '—').replace(/_/g, ' '), cls: 'teal' },
                    meta: [o.humanId || o.orderId || '', o.paymentStatus ? ('malipo: ' + o.paymentStatus) : ''],
                    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 7h12l1.4 12.1a1.8 1.8 0 0 1-1.8 1.9H6.4a1.8 1.8 0 0 1-1.8-1.9z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
                    act: 'gsg-indiv-open', actData: ' data-oid="' + esc(o.__id) + '"', actLbl: 'Tazama'
                });
            }).join('') + '</div>'
            + '<small class="gsg-biz-note">Oda hizi zimeundwa na mfumo wa Group Oda (child orders).</small>'
            + '</div>';
    }

    /* ---- Soko: wauzaji/watoa huduma WALIOTHIBITISHWA wa kikundi ---- */
    async function renderSokoTab(gid) {
        var host = document.getElementById('gsgTabSoko');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var mems = [];
        try { mems = await window.skhGroupMembers(gid) || []; } catch (eS) {}
        var sellers = mems.filter(function (m) { return m && m.status === 'active' && m.verifiedBusiness; });
        var names = {};
        try { names = await fetchNames(sellers.map(function (m) { return m.userId; })); } catch (eN) {}
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'soko') return;
        if (!sellers.length) {
            host.innerHTML = '<div class="gsg-biz-wrap">' + gsgBizHead('Soko', '')
                + gsgEmptyTabHtml('Hakuna wauzaji waliothibitishwa bado',
                    'Soko la kikundi linaonyesha wanachama wenye biashara iliyothibitishwa (verifiedBusiness).')
                + '</div>';
            return;
        }
        host.innerHTML = '<div class="gsg-biz-wrap">'
            + gsgBizHead('Soko', sellers.length + ' wauzaji/watoa huduma waliothibitishwa')
            + '<div class="gsg-biz-grid">' + sellers.map(function (m) {
                var nm = names[m.userId] || m.userId;
                return gsgBizCard({
                    title: nm, sub: m.businessName || m.storeName || '',
                    price: '',
                    badge: { txt: 'Imethibitishwa', cls: 'green' },
                    meta: [m.role || 'member'],
                    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 9l2-5h14l2 5"/><path d="M4 9h16v10H4z"/><path d="M9 19v-5h6v5"/></svg>',
                    act: 'gsg-tab', actData: ' data-tab="chat"', actLbl: 'Uliza kwenye chat'
                });
            }).join('') + '</div>'
            + '<small class="gsg-biz-note">Chanzo: wanachama halisi wa kikundi (verifiedBusiness). Hakuna bidhaa za kubuni.</small>'
            + '</div>';
    }

    /* ---- Ofa: supplierOffers HALISI zilizomo kwenye Group Oda za kikundi ---- */
    async function renderOffersTab(gid) {
        var host = document.getElementById('gsgTabOffers');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var rows = [];
        try {
            var snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders'), skh.limit(40)));
            if (snap && snap.forEach) snap.forEach(function (d) {
                var o = d.data() || {};
                var offs = o.supplierOffers || {};
                Object.keys(offs).forEach(function (sid) {
                    var of = offs[sid] || {};
                    rows.push({ goid: d.id, product: o.productName || '', status: o.status || '',
                        supplier: of.supplierName || sid, price: +of.price || 0,
                        qty: +of.availableQty || 0, days: +of.deliveryDays || 0,
                        note: of.note || '',
                        selected: !!(o.selectedOffer && o.selectedOffer.supplierId === sid) });
                });
            });
        } catch (eOF) {}
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'offers') return;
        if (!rows.length) {
            host.innerHTML = '<div class="gsg-biz-wrap">' + gsgBizHead('Ofa', '')
                + gsgEmptyTabHtml('Hakuna ofa za supplier bado',
                    'Ofa huonekana hapa supplier akitoa ofa kwenye Group Oda yoyote ya kikundi.')
                + '<small class="gsg-biz-note">Kukubali ofa hakumaanishi malipo au delivery imekamilika.</small>'
                + '</div>';
            return;
        }
        host.innerHTML = '<div class="gsg-biz-wrap">'
            + gsgBizHead('Ofa', rows.length + ' ofa kutoka Group Oda')
            + '<div class="gsg-biz-grid">' + rows.map(function (r) {
                return gsgBizCard({
                    title: r.supplier + ' → ' + (r.product || '—'),
                    sub: r.note,
                    price: r.price ? gsgMoney(r.price) : '',
                    badge: { txt: r.selected ? 'Imechaguliwa ✓' : 'Ofa', cls: r.selected ? 'green' : 'gold' },
                    meta: [r.qty ? ('idadi: ' + r.qty) : '', r.days ? ('siku: ' + r.days) : '', String(r.status || '').replace(/_/g, ' ')],
                    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12l4-4 4 3 2-2 4 4"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/></svg>',
                    act: 'gsg-offers-open', actData: ' data-goid="' + esc(r.goid) + '"', actLbl: 'Tazama'
                });
            }).join('') + '</div>'
            + '<small class="gsg-biz-note">Kukubali ofa hakumaanishi malipo au delivery imekamilika — malipo ni hatua tofauti (SokoPay).</small>'
            + '</div>';
    }

    /* ---- Usafiri: delivery HALISI ya oda zangu; booking haijaunganishwa ---- */
    async function renderTransportTab(gid) {
        var host = document.getElementById('gsgTabTransport');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var rows = [];
        try {
            var snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'orders'), skh.where('buyerId', '==', uid()), skh.limit(60)));
            if (snap && snap.forEach) snap.forEach(function (d) {
                var o = d.data() || {};
                if (String(o.groupId || '') !== String(gid)) return;
                var dl = o.delivery || {};
                if (!dl || (!dl.area && !dl.method && !dl.destination)) return;
                rows.push({ id: d.id, title: o.itemTitle || '', method: dl.method || 'individual',
                    area: dl.area || dl.destination || '', shared: !!dl.shared, status: o.status || '' });
            });
        } catch (eT) {}
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'transport') return;
        host.innerHTML = '<div class="gsg-biz-wrap">'
            + gsgBizHead('Usafiri', rows.length + ' delivery kutoka oda zako')
            + (rows.length ? '<div class="gsg-biz-grid">' + rows.map(function (r) {
                return gsgBizCard({
                    title: r.title || 'Delivery',
                    sub: r.area,
                    price: '',
                    badge: { txt: r.shared ? 'Usafiri wa pamoja' : 'Binafsi', cls: r.shared ? 'green' : 'blue' },
                    meta: [r.method, String(r.status || '').replace(/_/g, ' ')],
                    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg>'
                });
            }).join('') + '</div>' : '')
            + '<div class="gsg-nc gsg-nc-inline">'
            +   '<b>Kubukua usafiri haujaunganishwa</b>'
            +   '<small>Uratibu wa msafirishaji, tracking na proof of handover bado hakuna backend. Hapa unaona tu delivery iliyowekwa kwenye oda zako.</small>'
            + '</div>'
            + '</div>';
    }

    /* ---- Ununuzi (Buyer Requests): hakuna backend ---- */
    async function renderBuyersTab(gid) {
        var host = document.getElementById('gsgTabBuyers');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<div class="gsg-biz-wrap">'
            + gsgBizHead('Ununuzi', 'Mahitaji ya wanachama (Buyer Requests)')
            + gsgNotConnected('Buyer Requests', [
                'Ombi la mnunuzi (bidhaa, kiasi, eneo, deadline)',
                'Majibu ya wauzaji kwa Seller Offer',
                'Uthibitisho wa ombi na historia'
            ], '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4 4 0 0 1 0 7"/><path d="M18 6a8 8 0 0 1 0 12"/></svg>')
            + '</div>';
    }

    /* =====================================================================
       [COMPOSER 2026-11] SAUTI + BIASHARA — sawa na chat ya kawaida
       (index.html #voiceBtn → toggleVoiceRecord(), #chatTradeBtn → trade menu).
       Hapa ni utendaji HALISI: MediaRecorder → upload → skhGroupSendTyped.
       Hakuna mock; ikikosa ruhusa au upload, mtumiaji anaambiwa wazi.
       ===================================================================== */
    var REC = { rec: null, chunks: [], stream: null, t0: 0, timer: null };

    function recChip(on, secs) {
        var el = document.getElementById('gsgRecChip');
        if (!el) return;
        if (!on) { el.style.display = 'none'; el.innerHTML = ''; return; }
        el.style.display = 'flex';
        el.innerHTML = '<span class="gsg-rec-dot" aria-hidden="true"></span>'
            + '<b>' + esc(tk('ch_rec_on', 'Inarekodi')) + ' ' + String(secs || 0) + 's</b>'
            + '<button type="button" class="gsg-rec-stop" data-act="gsg-voice-stop">'
            + esc(tk('ch_rec_stop', 'Acha na tuma')) + '</button>'
            + '<button type="button" class="gsg-rec-x" data-act="gsg-voice-cancel" aria-label="' + esc(tk('cancel', 'Ghairi')) + '">\u00d7</button>';
    }

    function recStopUI() {
        REC.rec = null; REC.chunks = [];
        try { if (REC.stream) REC.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        REC.stream = null;
        if (REC.timer) { clearInterval(REC.timer); REC.timer = null; }
        recChip(false);
        var b = document.getElementById('gsgVoiceBtn');
        if (b) b.classList.remove('is-recording');
    }

    function voiceStart() {
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            alert(tk('ch_mic_no', 'Kifaa hiki hakiwezi kurekodi sauti.'));
            return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            REC.stream = stream; REC.chunks = [];
            var rec = new MediaRecorder(stream);
            REC.rec = rec;
            rec.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) REC.chunks.push(ev.data); };
            rec.onstop = function () { voiceUpload(); };
            rec.start();
            REC.t0 = Date.now();
            var b = document.getElementById('gsgVoiceBtn');
            if (b) b.classList.add('is-recording');
            recChip(true, 0);
            REC.timer = setInterval(function () {
                var secs = Math.floor((Date.now() - REC.t0) / 1000);
                recChip(true, secs);
                if (secs >= 120) voiceStop();          // kikomo cha dakika 2
            }, 500);
        }).catch(function () {
            alert(tk('ch_mic', 'Ruhusu kipaza sauti kwanza.'));
            recStopUI();
        });
    }

    function voiceStop() {
        var rec = REC.rec;
        if (!rec) return;
        try { rec.stop(); } catch (e) { recStopUI(); }
    }

    function voiceCancel() {
        var rec = REC.rec;
        REC.rec = null;
        try { if (rec) rec.stop(); } catch (e) {}
        recStopUI();
    }

    async function voiceUpload() {
        var secs = Math.max(1, Math.round((Date.now() - (REC.t0 || Date.now())) / 1000));
        var blob = new Blob(REC.chunks, { type: 'audio/webm' });
        recStopUI();
        if (!blob.size) { alert(tk('ch_voice_fail', 'Imeshindwa kutuma sauti.')); return; }
        // 1) jaribu upload halisi; 2) ikikosa, tumia data URL ndogo tu
        var url = '';
        try {
            if (typeof window.skhUploadFromFile === 'function') {
                var up = await window.skhUploadFromFile(blob, { resourceType: 'video' });
                url = (up && ((up.url) || (up.data && up.data.secure_url))) || '';
            }
        } catch (e) { url = ''; }
        if (!url) {
            if (blob.size > 700 * 1024) {
                alert(tk('ch_voice_big', 'Sauti ni ndefu mno — jaribu tena kwa muda mfupi.'));
                return;
            }
            url = await new Promise(function (res) {
                var rd = new FileReader();
                rd.onload = function () { res(String(rd.result)); };
                rd.onerror = function () { res(''); };
                rd.readAsDataURL(blob);
            });
        }
        if (!url) { alert(tk('ch_voice_fail', 'Imeshindwa kutuma sauti.')); return; }
        var r = await window.skhGroupSendTyped(CUR.gid, {
            type: 'audio', audioUrl: url, durationMs: secs * 1000, mime: blob.type || 'audio/webm'
        });
        if (!r || !r.ok) {
            if (r && r.reason === 'sendPolicy') alert(tk('gsg_send_denied', 'Admin pekee wanaruhusiwa kutuma.'));
            else alert(tk('ch_voice_fail', 'Imeshindwa kutuma sauti.'));
        }
    }

    /* -------- Menyu ya BIASHARA (bidhaa · huduma · group oda · ofa) -------- */
    function closeTradePop() {
        var p = document.getElementById('gsgTradePop');
        if (p) { try { p.remove(); } catch (e) {} }
        var b = document.getElementById('gsgTradeBtn');
        if (b) { b.classList.remove('is-open'); b.setAttribute('aria-expanded', 'false'); }
    }

    function openTradePop() {
        closeTradePop();
        if (g_sendPolicy_blocked()) { alert(tk('gsg_send_denied', 'Admin pekee wanaruhusiwa kutuma.')); return; }
        var canManage = (CUR.__myRole === 'owner' || CUR.__myRole === 'admin');
        var pop = document.createElement('div');
        pop.id = 'gsgTradePop';
        pop.className = 'gsg-trade-pop';
        pop.setAttribute('role', 'menu');
        pop.innerHTML = '<div class="gsg-trade-hd">' + esc(tk('gsg_at_biz', 'BIASHARA')) + '</div>'
            + '<button type="button" role="menuitem" data-act="gsg-at-product">' + ATC.prod + '<span>' + esc(tk('gsg_p_prod', 'Bidhaa')) + '</span></button>'
            + '<button type="button" role="menuitem" data-act="gsg-at-service">' + ATC.serv + '<span>' + esc(tk('gsg_p_serv', 'Huduma')) + '</span></button>'
            + (goOn() ? '<button type="button" role="menuitem" data-act="gsg-at-gorder">' + ATC.go + '<span>Group Oda</span></button>' : '')
            + '<button type="button" role="menuitem" data-act="gsg-trade-offers">' + ATC.poll + '<span>' + esc(tk('gsg_tab_offers', 'Ofa')) + '</span></button>'
            + (canManage ? '<button type="button" role="menuitem" data-act="gsg-at-announce">' + ATC.ann + '<span>' + esc(tk('gsg_p_ann', 'Tangazo')) + '</span></button>' : '');
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeTradePop(); });
        document.getElementById('gsgTabChat').appendChild(pop);
        var b = document.getElementById('gsgTradeBtn');
        if (b) { b.classList.add('is-open'); b.setAttribute('aria-expanded', 'true'); }
    }

    /* [R13-G] Media ya kikundi (design ref "Media Group"): vichujio Zote/Picha/Sauti/Nyaraka,
       gridi ya picha yenye jina la aliyeshiriki, sauti na nyaraka — kutoka meseji HALISI tu. */
    async function renderMediaTab(gid) {
        var host = document.getElementById('gsgTabMedia');
        if (!host || CUR.gid !== gid) return;
        host.innerHTML = '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('loading', 'Inapakia...') + '</small>';
        var imgs = [], auds = [], docs = [];
        try {
            var snap = await skh.getDocs(msgsCol(gid));
            if (snap && snap.forEach) snap.forEach(function (d) {
                var m = d.data() || {}; m.__id = d.id;
                var url = m.imageUrl || m.mediaUrl || (Array.isArray(m.attachments) && m.attachments.length ? (m.attachments[0].url || m.attachments[0].imageUrl) : null);
                if (url && (m.type === 'image' || m.type === 'photo' || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(url)))) imgs.push({ url: String(url), at: m.at || '', sender: m.senderName || '' });
                else if ((m.type === 'audio' || m.type === 'voice') && m.audioUrl) auds.push({ url: String(m.audioUrl), at: m.at || '', sender: m.senderName || '', ms: +m.durationMs || 0 });
                else if (m.type === 'document') docs.push({ name: m.fileName || 'Nyaraka', size: +m.fileSize || 0, at: m.at || '', sender: m.senderName || '', data: m.fileData || '', mime: m.fileType || '' });
            });
        } catch (eMD) {}
        if (CUR.gid !== gid || (CUR.__tab || 'chat') !== 'media') return;
        var byAt = function (a, b) { return String(b.at).localeCompare(String(a.at)); };
        imgs.sort(byAt); auds.sort(byAt); docs.sort(byAt);
        var f = CUR.__mediaF || 'all';
        var chips = [['all', 'Zote', imgs.length + auds.length + docs.length], ['img', 'Picha', imgs.length], ['aud', 'Sauti', auds.length], ['doc', 'Nyaraka', docs.length]];
        var head = '<div class="gsg-media-chips" data-no-i18n>' + chips.map(function (c) {
            return '<button type="button" class="gsg-mchip' + (c[0] === f ? ' is-on' : '') + '" data-act="gsg-media-f" data-f="' + c[0] + '">' + c[1] + ' <small>' + c[2] + '</small></button>'; }).join('') + '</div>';
        var dd = function (at) { return at ? String(at).slice(0, 10) : ''; };
        var sec = function (t, body) { return '<div class="gsg-msec"><b class="gsg-msec-t">' + t + '</b>' + body + '</div>'; };
        var out = '';
        if ((f === 'all' || f === 'img') && imgs.length) out += sec('Picha', '<div class="gsg-mgrid">' + imgs.map(function (im) {
            return '<a class="gsg-mtile" href="' + esc(im.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(im.sender) + ' · ' + esc(dd(im.at)) + '"><img src="' + esc(im.url) + '" alt="" loading="lazy">'
                + '<span class="gsg-mwho"><i>' + esc(String(im.sender || '?').charAt(0).toUpperCase()) + '</i>' + esc(im.sender) + '</span></a>'; }).join('') + '</div>');
        if ((f === 'all' || f === 'aud') && auds.length) out += sec('Sauti', auds.map(function (a) {
            var sc = Math.round(a.ms / 1000);
            return '<div class="gsg-maud"><span class="gsg-maud-who">' + esc(a.sender) + ' · ' + esc(dd(a.at)) + (sc ? ' · ' + Math.floor(sc / 60) + ':' + String(sc % 60).padStart(2, '0') : '') + '</span>'
                + '<audio controls preload="none" src="' + esc(a.url) + '"></audio></div>'; }).join(''));
        if ((f === 'all' || f === 'doc') && docs.length) out += sec('Nyaraka', '<div class="gsg-mdocs">' + docs.map(function (d2) {
            var ext = (String(d2.name).split('.').pop() || 'DOC').slice(0, 4).toUpperCase();
            var size = d2.size ? (d2.size > 1048576 ? (d2.size / 1048576).toFixed(1) + ' MB' : Math.round(d2.size / 1024) + ' KB') : '';
            var inner = '<span class="gsg-mdoc-ic' + (ext === 'PDF' ? ' is-pdf' : '') + '">' + esc(ext) + '</span><b>' + esc(d2.name) + '</b><small>' + esc(d2.sender) + (size ? ' · ' + size : '') + '</small>';
            return /^data:/.test(d2.data) ? '<a class="gsg-mdoc" href="' + esc(d2.data) + '" download="' + esc(d2.name) + '">' + inner + '</a>' : '<div class="gsg-mdoc">' + inner + '</div>'; }).join('') + '</div>');
        if (!out) out = gsgEmptyTabHtml(tk('gsg_no_media', 'Bado hakuna media'), 'Picha, sauti na nyaraka zinazoshirikiwa kwenye kikundi zitaonekana hapa.');
        host.innerHTML = '<div class="gsg-media">' + head + out + '</div>';
    }

    /* [§9] Pinned announcement card — subtle-blue, HAIWEEKANI ujumbe wa kawaida (pembeni, si bubble ya sender). */
    function renderAnnounce(ann) {
        var host = document.getElementById('gsgAnnounce');
        if (!host) return;
        // [GROUP UI 2026-11] Tangazo = kadi iliyobandikwa (pin). Kikundi kisicho na
        // tangazo hakiachi nafasi tupu (host inafichwa kabisa).
        if (!ann || !ann.text || CUR.__annHidden === String(ann.text)) { host.innerHTML = ''; host.style.display = 'none'; CUR.__annOpen = false; return; }
        CUR.__ann = ann;
        var txt = String(ann.text);
        var full = !!CUR.__annOpen;
        var short = txt.length > 120 ? txt.slice(0, 120) + '\u2026' : txt;
        host.style.display = 'block';
        host.innerHTML = '<div class="gsg-pin' + (full ? ' is-open' : '') + '" aria-live="polite">'
            + '<button type="button" class="gsg-pin-row" data-act="gsg-ann-view" aria-expanded="' + (full ? 'true' : 'false') + '">'
            +   '<span class="gsg-pin-ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v6l-2 4h10l-2-4V4"/><path d="M12 14v6"/><path d="M7 4h10"/></svg></span>'
            +   '<span class="gsg-pin-txt">'
            +     '<span class="gsg-pin-lab" data-no-i18n>Tangazo:</span>'
            +     '<span class="gsg-pin-msg">' + esc(full ? txt : short) + '</span>'
            +   '</span>'
            +   '<span class="gsg-pin-more" data-no-i18n>' + (full ? 'Funga' : 'Soma zaidi') + '</span>'
            + '</button>'
            + '<button type="button" class="gsg-pin-x" data-act="gsg-ann-hide" aria-label="Ficha tangazo">\u00d7</button>'
            + (full ? '<div class="gsg-pin-full">' + renderMsgText(txt) + '</div>' : '')
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
    // [REPAIR 2026-10] Oda za Pamoja za kikundi: engine ya server haijajengwa.
    // Ikiwa imezimwa, UI inaonyesha "Inakuja hivi karibuni" badala ya kitufe kinachofanya kazi.
    function goOn() { return typeof window.skhGroupOrdersEnabled === 'function' && window.skhGroupOrdersEnabled(); }
    function goSoonBadge() { return '<span data-go-disabled="1" title="Inakuja hivi karibuni" style="border:1px dashed #cbd5e1;background:#f8fafc;color:#64748b;font-weight:700;font-size:10.5px;padding:6px 11px;border-radius:99px;">Inakuja hivi karibuni</span>'; }
    var ATC = {
        img: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.3L13 17l3-2.6 4 3.6"/></svg>',
        doc: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
        loc: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6.2-8 12-8 12s-8-5.8-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.6"/></svg>',
        ctc: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.4"/><path d="M5 20c0-3.5 3.1-5.6 7-5.6s7 2.1 7 5.6"/></svg>',
        prod: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1.4 12.1a1.8 1.8 0 0 1-1.8 1.9H6.4a1.8 1.8 0 0 1-1.8-1.9z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
        serv: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6.5a4 4 0 0 1 5 5L9 22l-5-5z"/><path d="m13 8-1.5 1.5"/></svg>',
        poll: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20V11"/><path d="M12 20V5"/><path d="M19 20v-6"/></svg>',
        ann: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4a1 1 0 0 0 1 1h2l4 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
        truck: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg>',
        offer: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>',
        ord: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4"/></svg>',
        go: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4"/><path d="M12 11.5v9"/></svg>'
    };

    /* [GROUP UI 2026-11] Chip ya kiambatisho — kadi ndani ya sheet, sio kitufe cha mstari. */
    function atChip(act, icon, label, extra) {
        var isBiz = /^gsg-at-(product|service|poll|announce|gorder)$/.test(act);
        var isOff = /data-off="1"/.test(extra || '');
        var cls = 'gsg-at-item' + (isBiz ? ' is-biz' : '') + (isOff ? ' is-off' : '');
        return '<button type="button" class="' + cls + '" data-act="' + act + '" ' + (extra || '').replace(/\s*data-off="1"/, '') + '>'
            + '<span class="aic">' + icon + '</span><span class="alab">' + esc(label) + '</span></button>';
    }
    function openAttachPop() {
        closeAttachPop(); closeRxnPop();
        if (g_sendPolicy_blocked()) { alert(tk('gsg_send_denied', 'Admin pekee wanaruhusiwa kutuma.')); return; }
        var canManage = (CUR.__myRole === 'owner' || CUR.__myRole === 'admin');
        var pop = document.createElement('div');
        pop.id = 'gsgAttachPop';
        pop.className = 'gsg-sheet-pop';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-modal', 'true');
        /* [R13-G] menyu ya (+) kama design ref: vitendo vya biashara + viambatisho. Kila kipengele
           kinaita kazi halisi iliyopo (typed message / tab ya module husika) — hakuna kipya cha uongo. */
        pop.innerHTML = '<div class="gsg-sheet-panel gsg-plus">'
            + '<div class="gsg-sheet-grab"></div>'
            + '<div class="gsg-sheet-head"><b>' + tk('gsg_attach', 'Ambatisha') + '</b>'
            +   '<button type="button" class="gsg-sheet-x" data-act="gsg-attach-close" aria-label="' + tk('close', 'Funga') + '">\u00d7</button></div>'
            + '<div class="gsg-sheet-body" data-no-i18n>'
            +   '<div class="gsg-at-grid gsg-plus-grid">'
            +     atChip('gsg-at-image', ATC.img, 'Tuma Media')
            +     atChip('gsg-at-pick', ATC.prod, 'Shiriki Bidhaa')
            +     atChip('gsg-at-service', ATC.serv, 'Shiriki Huduma')
            +     atChip('gsg-at-gotab', ATC.go, 'Anzisha Group Order')
            +     atChip('gsg-at-ordtab', ATC.ord, 'Shiriki Oda ya Kawaida')
            +     atChip('gsg-at-trtab', ATC.truck, 'Panga Usafiri')
            +     atChip('gsg-at-oftab', ATC.offer, 'Shiriki Ofa')
            +     atChip('gsg-at-doc', ATC.doc, 'Tuma Nyaraka/PDF')
            +     atChip('gsg-at-loc', ATC.loc, 'Shiriki Mahali')
            +     atChip('gsg-at-poll', ATC.poll, 'Kura')
            +     atChip('gsg-at-contact', ATC.ctc, 'Mawasiliano')
            +     (canManage ? atChip('gsg-at-announce', ATC.ann, 'Tangazo') : '')   // [§46] UI hides invalid
            +   '</div>'
            + '</div></div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closeAttachPop(); });
        // [GROUP UI 2026-11] Sheet inaishi NDANI ya dirisha la kikundi, juu ya composer.
        var hostEl = document.querySelector('#skhGroupSogaModal .gsg-fs') || document.getElementById('skhGroupSogaModal');
        (hostEl || document.body).appendChild(pop);
    }

    /* [R13-G] Shiriki Bidhaa: chagua kutoka listings HALISI zako (products, userId == wewe).
       Kadi inabeba productId → [Tazama]/[Jadili] zinaenda kwenye rekodi ile ile (source of truth). */
    function closePicker() { var x = document.getElementById('gsgPickPop'); if (x) x.remove(); }
    async function openProductPicker() {
        closePicker();
        var pop = document.createElement('div');
        pop.id = 'gsgPickPop'; pop.className = 'gsg-sheet-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
        pop.innerHTML = '<div class="gsg-sheet-panel"><div class="gsg-sheet-grab"></div><div class="gsg-sheet-head"><b>Shiriki Bidhaa</b>'
            + '<button type="button" class="gsg-sheet-x" data-act="gsg-pick-close" aria-label="Funga">\u00d7</button></div>'
            + '<div class="gsg-sheet-body" id="gsgPickBody"><small class="gsg-loading">Inapakia bidhaa zako\u2026</small></div></div>';
        pop.addEventListener('click', function (ev) { if (ev.target === pop) closePicker(); });
        var hostEl = document.querySelector('#skhGroupSogaModal .gsg-fs') || document.body; hostEl.appendChild(pop);
        var list = [];
        try {
            var snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', uid()), skh.limit(40)));
            snap.forEach(function (d) { var p = d.data() || {}; if (p.publicationStatus && p.publicationStatus !== 'published') return;
                list.push({ id: d.id, title: p.title || p.name || 'Bidhaa', price: p.price || '', unit: p.unit || p.priceUnit || '', stock: p.stock != null ? String(p.stock) : '',
                    seller: p.sellerName || p.ownerName || myName(), image: p.image || (Array.isArray(p.imagesArray) ? p.imagesArray[0] : '') || '', location: p.location || p.region || '' }); });
        } catch (eP) {}
        CUR.__pick = list;
        var body = document.getElementById('gsgPickBody'); if (!body) return;
        body.innerHTML = (list.length ? '<div class="gsg-pick-list">' + list.map(function (p) {
                return '<button type="button" class="gsg-pick" data-act="gsg-pick-send" data-pid="' + esc(p.id) + '">'
                    + '<span class="gsg-pick-img">' + (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : ATC.prod) + '</span>'
                    + '<span class="gsg-pick-tx"><b>' + esc(p.title) + '</b><small>' + (p.price ? 'TSh ' + Number(p.price).toLocaleString('en-US') : '') + (p.stock ? ' · Stock ' + esc(p.stock) : '') + '</small></span>'
                    + '<span class="gsg-pick-go">Shiriki</span></button>';
            }).join('') + '</div>'
            : '<div class="gsg-empty"><b>Huna bidhaa zilizochapishwa bado</b><small>Weka bidhaa sokoni kwanza, kisha uishiriki hapa.</small></div>')
            + '<button type="button" class="gsg-pick-manual" data-act="gsg-at-product">Andika maelezo ya bidhaa mwenyewe</button>';
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
        try {
            var fsWrap2 = document.querySelector('#skhGroupSogaModal .gsg-fs');
            if (fsWrap2) fsWrap2.classList.remove('gsg-info-open');
        } catch (eFS2) {}
    }

    /* [GROUP UI 2026-11] Lebo ya tarehe: Leo / Jana / tarehe kamili. */
    function gsgSepHtml(atStr) {
        var d = null;
        try { d = new Date(atStr); } catch (eD) { d = null; }
        if (!d || isNaN(d.getTime())) return '';
        var today = new Date();
        var mid = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
        var diff = Math.round((mid(today) - mid(d)) / 86400000);
        var lbl;
        if (diff === 0) lbl = tk('today', 'Leo');
        else if (diff === 1) lbl = tk('yesterday', 'Jana');
        else {
            var mn = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
            lbl = d.getDate() + ' ' + mn[d.getMonth()] + ' ' + d.getFullYear();
        }
        return '<div class="gsg-sep"><span>' + esc(lbl) + '</span></div>';
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
            rows.sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')); });   // [R13-G] was a.at vs a.at (no-op) → timeline out of order
            rows = rows.slice(-60);
            /* [R13-G] design ref: matukio halisi ya kikundi (kujiunga/kuondoka) ndani ya timeline
               kama ujumbe wa mfumo — kutoka chatGroups/{gid}/events (members wanasoma). */
            try {
                var evs = (typeof window.skhGroupEvents === 'function') ? await window.skhGroupEvents(gid, 500) : [];
                var firstAt = rows.length ? String(rows[0].at || '') : '';
                var SYS_T = { member_joined: 1, member_left: 1, member_removed: 1, group_created: 1 };
                (evs || []).filter(function (e) { return e && SYS_T[e.type] && (!firstAt || String(e.at || '') >= firstAt); }).slice(-30)
                    .forEach(function (e) { rows.push({ type: '_sys', at: e.at, evType: e.type, actorUid: e.actorUid || '', targetUid: e.targetUid || '', note: e.note || '' }); });
                rows.sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')); });
            } catch (eEv) {}
            CUR.__rows = rows;   // [GROUP UI 2026-11] kwa action sheet ya ujumbe
            
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
            try {
                if (convD && (convD.name || convD.title)) {
                    CUR.__convName = convD.name || convD.title;
                    var tEl0 = document.getElementById('gsgTitleEl');
                    if (tEl0 && (!tEl0.textContent || tEl0.textContent === 'Kikundi')) tEl0.textContent = CUR.__convName;
                }
            } catch (eCN) {}
            var lra = convD.lastReadAt || {};
            
            var tc = {};
            rows.forEach(function (r) { if (r.threadRootId) tc[r.threadRootId] = (tc[r.threadRootId] || 0) + 1; });
            CUR.__lastRows = rows;
            var __prevBottom = host ? (host.scrollHeight - host.scrollTop - host.clientHeight) : 0;
            var needBottom = __prevBottom < 120;
            if (!host || host.childElementCount < 2) needBottom = true;
            // [GROUP UI 2026-11] Date separators + unread divider + makundi ya mfululizo.
            var myLastRead = String(lra[uid()] || '');
            var unreadPlaced = false;
            var prevRow = null;
            var htmlParts = [];
            rows.forEach(function (r) {
                var ri = null;
                var isMine = (r.senderUid === uid());
                if (isMine && othersActive.length) {
                    var readers = othersActive.filter(function (u2) { return String(lra[u2] || '') >= String(r.at || ''); });
                    ri = { allRead: readers.length === othersActive.length, n: readers.length,
                           names: readers.map(function (u2) { return (CUR.__names || {})[u2] || u2; }) };
                }
                var dayKey = String(r.at || '').slice(0, 10);
                var prevDayKey = prevRow ? String(prevRow.at || '').slice(0, 10) : '';
                if (dayKey && dayKey !== prevDayKey) htmlParts.push(gsgSepHtml(r.at));
                // unread divider: kabla ya ujumbe wa kwanza usiosomwa (sio wangu)
                if (!unreadPlaced && myLastRead && String(r.at || '') > myLastRead && !isMine) {
                    htmlParts.push('<div class="gsg-unread" aria-hidden="true"><span>' + esc(tk('gsg_unread_new', 'Mpya')) + '</span></div>');
                    unreadPlaced = true;
                }
                var samePrev = !!(prevRow && prevRow.senderUid === r.senderUid && prevDayKey === dayKey
                                  && (!prevRow.type || prevRow.type === 'text') && (!r.type || r.type === 'text'));
                htmlParts.push(msgRow(r, isMine, ri, tc, { first: !samePrev, grouped: samePrev }));
                prevRow = r;
            });
            host.innerHTML = rows.length
                ? htmlParts.join('')
                : '<div class="gsg-empty"><b>' + tk('gsg_empty', 'Bado hakuna ujumbe') + '</b><small>' + tk('gsg_empty_sub', 'Anza mazungumzo — context ya kikundi iko juu.') + '</small></div>';
            
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

    /* [GROUP UI 2026-11] Emoji ya haraka — typing bar ya kikundi sasa ni sawa
       na chat ya kawaida (attach · emoji · input · tuma). */
    function gsgEmojiPop() {
        var btn = document.getElementById('gsgEmojiBtn');
        var old = document.getElementById('gsgEmojiPop');
        if (old) { old.remove(); return; }
        var EM = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅', '📦', '💰'];
        var pop = document.createElement('div');
        pop.id = 'gsgEmojiPop';
        pop.className = 'gsg-emoji-pop';
        pop.innerHTML = EM.map(function (e) { return '<button type="button" data-em="' + e + '">' + e + '</button>'; }).join('');
        pop.addEventListener('click', function (ev) {
            var b = ev.target.closest('button[data-em]');
            if (!b) return;
            var inp = document.getElementById('gsgInput');
            if (inp) { inp.value = (inp.value || '') + b.getAttribute('data-em'); inp.focus(); }
            pop.remove();
        });
        document.getElementById('gsgComposerRow').appendChild(pop);
        setTimeout(function () {
            document.addEventListener('click', function h(e2) {
                if (!pop.contains(e2.target) && e2.target !== btn) { pop.remove(); document.removeEventListener('click', h); }
            });
        }, 0);
    }

    function gsgRowById(mid) {
        var rows = CUR.__rows || [];
        for (var i = 0; i < rows.length; i++) if (String(rows[i].__id) === String(mid)) return rows[i];
        return null;
    }
    function gsgCopyText(txt) {
        try {
            if (navigator.clipboard) navigator.clipboard.writeText(txt);
            else { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
            if (window.skhToast) window.skhToast('Imenakiliwa', 'success', 1800);
        } catch (e) { if (window.skhToast) window.skhToast('Imeshindwa kunakili', 'error', 2000); }
    }
    function gsgShareText(txt) {
        try {
            if (navigator.share) { navigator.share({ title: 'SokoHai', text: txt }).catch(function () {}); return; }
        } catch (e) {}
        gsgCopyText(txt);
    }
    function gsgOpenActions(mid) {
        if (typeof window.skhSheetOpen !== 'function') return;
        var m = gsgRowById(mid) || {};
        var mine = m.senderUid === uid();
        var text = String(m.text || '');
        var acts = [];
        acts.push({ id: 'reply', label: tk('ch_reply', 'Jibu'), icon: 'reply', run: function () {
            var row = document.querySelector('.gsg-msg-row[data-mid="' + mid + '"]');
            var b = row && row.querySelector('[data-act="gsg-reply"]');
            if (b) b.click();
        } });
        if (text.trim()) acts.push({ id: 'copy', label: tk('ch_copy', 'Nakili'), icon: 'copy', run: function () { gsgCopyText(text); } });
        if (text.trim()) acts.push({ id: 'share', label: tk('ch_share', 'Shiriki'), icon: 'share', run: function () { gsgShareText(text); } });
        window.skhSheetOpen({
            msgId: mid,
            title: (m.senderName || (mine ? 'Wewe' : 'Mwanachama')),
            preview: text ? text.slice(0, 110) : 'Ujumbe wa kikundi',
            typeTag: 'Kikundi',
            reactions: [],
            actions: acts
        });
    }
    function gsgBindGestures() {
        if (typeof window.skhBindRowGestures !== 'function') return;
        window.skhBindRowGestures({
            container: 'gsgMsgs',
            rowSel: '.gsg-msg-row[data-mid]',
            idAttr: 'data-mid',
            onReply: function (mid, rowEl) {
                var b = rowEl && rowEl.querySelector('[data-act="gsg-reply"]');
                if (b) b.click();
            },
            onActions: function (mid) { gsgOpenActions(mid); }
        });
    }
    window.skhGroupMsgActions = gsgOpenActions;

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
            else if (act === 'gsg-offers-open') {
                // Ofa za supplier za Group Oda (data halisi kwenye order doc)
                openOffersSh(b.getAttribute('data-goid') || '');
                return;
            }
            else if (act === 'gsg-indiv-open') {
                // Oda binafsi: fungua kwenye ukurasa wa oda wa app (hakuna UI mpya ya oda)
                var oidX = b.getAttribute('data-oid') || '';
                if (!oidX) return;
                // Fungua kwenye dashboard ya mnunuzi (mfumo uliopo wa oda) — hakuna UI ya oda mpya.
                if (typeof window.skhBuyerOrderOpen === 'function') { window.skhCloseGroupSoga(); window.skhBuyerOrderOpen(oidX); }
                else if (typeof window.skhToast === 'function') window.skhToast('Oda ' + oidX + ' — fungua kutoka Oda zangu', 'info');
                return;
            }
            else if (act === 'gsg-ann-view') {
                CUR.__annOpen = !CUR.__annOpen;
                (async function () {
                    // [GROUP UI 2026-11] Chanzo cha ukweli ni chatGroups/{gid}.announcement
                    // (conversation doc ni mirror). Sasa tunasoma group kwanza, kisha mirror.
                    try {
                        var gd = await skh.getDoc(gRef(CUR.gid));
                        var annG = (gd && gd.exists && gd.exists()) ? (gd.data().announcement || null) : null;
                        if (!annG) {
                            var cd = await skh.getDoc(cRef(CUR.gid));
                            annG = (cd && cd.exists && cd.exists()) ? (cd.data().announcement || null) : null;
                        }
                        renderAnnounce(annG);
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
            else if (act === 'gsg-emoji') { gsgEmojiPop(); return; }
            else if (act === 'gsg-voice') { if (REC.rec) voiceStop(); else voiceStart(); return; }
            else if (act === 'gsg-voice-stop') { voiceStop(); return; }
            else if (act === 'gsg-voice-cancel') { voiceCancel(); return; }
            else if (act === 'gsg-trade') { if (document.getElementById('gsgTradePop')) closeTradePop(); else openTradePop(); return; }
            else if (act === 'gsg-trade-offers') {
                closeTradePop();
                setGsgTab('offers');
                return;
            }
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
            else if (act === 'gsg-media-f') { CUR.__mediaF = b.getAttribute('data-f') || 'all'; renderMediaTab(CUR.gid); return; }
            else if (act === 'gsg-ann-hide') { CUR.__annHidden = CUR.__ann ? String(CUR.__ann.text) : '1'; renderAnnounce(CUR.__ann); return; }
            else if (act === 'gsg-at-gotab') { closeAttachPop(); setGsgTab('groupOrders'); return; }
            else if (act === 'gsg-at-ordtab') { closeAttachPop(); setGsgTab('orders'); return; }
            else if (act === 'gsg-at-trtab') { closeAttachPop(); setGsgTab('transport'); return; }
            else if (act === 'gsg-at-oftab') { closeAttachPop(); setGsgTab('offers'); return; }
            else if (act === 'gsg-at-pick') { closeAttachPop(); openProductPicker(); return; }
            else if (act === 'gsg-pick-close') { closePicker(); return; }
            else if (act === 'gsg-pick-send') {
                var pk = (CUR.__pick || []).filter(function (x) { return x.id === b.getAttribute('data-pid'); })[0];
                closePicker();
                if (pk) window.skhGroupSendTyped(CUR.gid, { type: 'product', product: { name: pk.title, price: pk.price, unit: pk.unit, qty: pk.stock, productId: pk.id,
                    sellerName: pk.seller, imageUrl: pk.image, location: pk.location } }).then(function (rp) { if (!rp || !rp.ok) alert('Bidhaa haijashirikiwa (' + ((rp && rp.reason) || 'hitilafu') + ').'); });
                return;
            }
            else if (act === 'gsg-at-product') {
                closePicker();
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
                if (!goOn()) { if (typeof window.skhGroupOrdersDisabledNotice === 'function') window.skhGroupOrdersDisabledNotice(); return; }
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
            else if (act === 'gsg-jadili') {
                /* [R13-G] Jadili = mazungumzo binafsi na MUUZAJI halisi wa bidhaa (products/{pid}.userId) */
                var jp = b.getAttribute('data-pid');
                (async function () {
                    var sellerUid = b.getAttribute('data-uid') || '', sellerNm = b.getAttribute('data-name') || '';
                    try { var ps = await skh.getDoc(skh.doc(skh.db, 'products', jp)); if (ps && ps.exists && ps.exists()) { var pd = ps.data() || {}; sellerUid = pd.userId || sellerUid; sellerNm = pd.sellerName || pd.ownerName || sellerNm; } } catch (eJP) {}
                    if (!sellerUid || sellerUid === uid()) { try { window.skhToast && window.skhToast('Hii ni bidhaa yako.', 'info'); } catch (eT) {} return; }
                    window.skhCloseGroupSoga();
                    if (typeof window.openChatWithUser === 'function') window.openChatWithUser(sellerUid, sellerNm);
                })();
                return;
            }
            else if (act === 'gsg-view-product') {
                var pid = b.getAttribute('data-pid');
                // [R13-G] showProductDetail haipo kwenye mfumo — ukurasa halisi ni openProduct
                if (pid && typeof window.openProduct === 'function') { window.skhCloseGroupSoga(); window.openProduct(pid, 'products'); }
                else if (pid && window.showProductDetail) window.showProductDetail(pid);
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
                    if (g2 && g2.name) { try { var tt = document.querySelector('#skhGroupSogaModal .skh-sheet-title'); if (tt) tt.textContent = g2.name; } catch (eTT) {} }
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

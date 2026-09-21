/* ================================================================
 * 93-chat-inbox-repair.js — MAREKEBISHO YA MWISHO YA INBOX/CHAT
 * ----------------------------------------------------------------
 * [REPAIR 2026-09-20 — Phase 8, evidence-based]
 *
 * SHIDA (imegunduliwa kwa dynamic tracing):
 *   window.skhChatOpenInbox ilifungwa mara 5+ na patches tofauti
 *   (34 → 79 → 81 → 90 → 92 → 91). 79 na 61 zilishikana "orig" za
 *   kwao → recursion ya pande mbili (81→79→81→…); call ya pili
 *   ilizuiwa na double-click guard (canOpen) → kurudi kimya. Mwili
 *   wa 34-chat-core HAUKUWAFIKA → inbox haipakii milele.
 *   Pia: modules (34/79/81) zinaweza kupakia BAADA ya scripts za
 *   kawaida → zina-overwrite marekebisho → tunaji-reassert.
 *
 * SULUHO:
 *   1. skhChatOpenInbox mpya (schema ileile ya 34: conversations +
 *      legacy chats; row markup ileile .ch-*) + re-assert guard.
 *   2. Row click → openChatWithUser (chain safi) → chat inafunguka.
 *   3. Watchdog: skhChatOpen(uid) isipofungua chatModal ndani ya sek
 *      3.5 → openChatWithUser fallback.
 *   4. Errors ZINAONEKANA (hakuna empty catch) + Retry.
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhInboxRepairBooted) return;

    function S() { return window.skh || {}; }
    function myUid() { var s = S(); return (s.currentUser && s.currentUser.uid) || null; }

    function esc(s) {
        s = s == null ? '' : String(s);
        return s.replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function jsEsc(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
    function truncate(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    function fmtTime(t) {
        try {
            if (!t) return '';
            var d = (typeof t === 'number') ? new Date(t) : new Date(String(t).replace(' ', 'T'));
            if (isNaN(d.getTime())) return '';
            var now = new Date();
            if (d.toDateString() === now.toDateString()) return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
            var yest = new Date(now.getTime() - 86400000);
            if (d.toDateString() === yest.toDateString()) return 'Jana';
            return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
        } catch (e) { return ''; }
    }

    var items93 = [];
    var tab93 = 'all';
    var query93 = '';
    var loading93 = false;
    var loadSeq93 = 0;

    /* ---------------- LOAD (schema ya 34-chat-core) ---------------- */
    async function loadInbox93() {
        var s = S();
        var me = myUid();
        if (!me) throw new Error('Haujalogin — ingia kwanza.');
        if (!s.db || !s.getDocs) throw new Error('Firestore haijapatikana (skh.db).');
        var out = [];
        var convErr = null, legacyErr = null;

        try {
            var q = s.query(s.collection(s.db, 'conversations'), s.where('participants', 'array-contains', me), s.limit(100));
            var snap = await s.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) {
                var c = d.data() || {};
                if (c.type === 'group' || String(d.id).indexOf('conv_group_') === 0) {
                    out.push({
                        kind: 'conversation', type: 'group', id: d.id, convId: d.id,
                        gid: c.groupId || String(d.id).replace(/^conv_group_/, ''),
                        otherUid: null, name: c.name || 'Kikundi', photo: '',
                        verified: false, role: 'group', type2: c.type,
                        related: c.sharedContext || null, lastMessage: c.lastMessage || null,
                        lastMessageAt: c.lastMessageAt, unread: (c.unread || {})[me] || 0,
                        status: c.status, pinned: !!(c.pinned && c.pinned[me]),
                        memberCount: (c.participants || []).length,
                        avatar: c.avatar || '#',
                        drafts: c.drafts || null, archived: !!(c.archived && c.archived[me]),
                        hiddenForMe: !!(c.deletedForUser && c.deletedForUser[me]),
                        muted: !!(c.muted && c.muted[me])
                    });
                    return;
                }
                var other = (c.participants || []).filter(function (u) { return u !== me; })[0];
                var meta = (c.participantMeta || {})[other] || { name: 'Mawasiliano', photo: '', verified: false, role: 'user' };
                out.push({
                    kind: 'conversation', id: d.id, convId: d.id, otherUid: other,
                    name: meta.name, photo: meta.photo, verified: meta.verified, role: meta.role,
                    type: c.type || 'direct', related: c.related || null,
                    lastMessage: c.lastMessage || null, lastMessageAt: c.lastMessageAt,
                    unread: (c.unread || {})[me] || 0, status: c.status,
                    pinned: !!(c.pinned && c.pinned[me]),
                    drafts: c.drafts || null, archived: !!(c.archived && c.archived[me]),
                    hiddenForMe: !!(c.deletedForUser && c.deletedForUser[me]),
                    muted: !!(c.muted && c.muted[me])
                });
            });
        } catch (e) { convErr = e; console.error('[INBOX93] conversations query failed:', e && e.message); }

        try {
            var q2 = s.query(s.collection(s.db, 'chats'), s.where('senderUid', '==', me), s.limit(100));
            var q3 = s.query(s.collection(s.db, 'chats'), s.where('receiverUid', '==', me), s.limit(100));
            var snaps = await Promise.all([s.getDocs(q2), s.getDocs(q3)]);
            var seen = {};
            out.forEach(function (it) { if (it.otherUid) seen[it.otherUid] = true; });
            snaps.forEach(function (sn) {
                if (sn && sn.forEach) sn.forEach(function (d) {
                    var c = d.data() || {};
                    var other = c.senderUid === me ? c.receiverUid : c.senderUid;
                    if (!other || other === me || seen[other]) return;
                    seen[other] = true;
                    out.push({
                        kind: 'legacy', id: d.id, convId: null, otherUid: other,
                        name: (other === c.receiverUid ? c.receiverName : c.senderName) || 'Mawasiliano',
                        photo: '', verified: false, role: 'user', type: 'direct',
                        related: c.productId ? { productId: c.productId } : null,
                        lastMessage: { text: c.text || '', type: 'text' },
                        lastMessageAt: c.createdAt, unread: 0, status: 'active',
                        pinned: false, drafts: null, archived: false, muted: false
                    });
                });
            });
        } catch (e) { legacyErr = e; console.error('[INBOX93] legacy chats query failed:', e && e.message); }

        var best = {};
        out.forEach(function (it) {
            var k = (it.type === 'group') ? ('grp:' + (it.gid || it.convId)) : it.otherUid;
            if (!k) return;
            var cur = best[k];
            if (!cur) { best[k] = it; return; }
            if (!!it.pinned !== !!cur.pinned) { if (it.pinned) best[k] = it; return; }
            var curC = cur.kind === 'conversation', itC = it.kind === 'conversation';
            if (itC && !curC) { best[k] = it; return; }
            if (curC && !itC) return;
            if (String(it.lastMessageAt || '') > String(cur.lastMessageAt || '')) best[k] = it;
        });
        var loadedItems = Object.keys(best).map(function (k) { return best[k]; });
        loadedItems.sort(function (a, b) {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            return String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''));
        });
        console.log('[INBOX93] loaded:', loadedItems.length, 'items');
        if (convErr && legacyErr && loadedItems.length === 0) {
            throw new Error('Imeshindwa kusoma mazungumzo (' + String(convErr.message || convErr).slice(0, 80) + ')');
        }
        return loadedItems;
    }

    /* ---------------- RENDER (classes .ch-* za CSS ileile) ---------------- */
    function roleBadge(it) {
        var r = String((it && it.role) || '').toLowerCase();
        var label = '';
        if (r === 'seller' || r === 'store' || r === 'merchant') label = 'Muuzaji';
        else if (r === 'transporter' || r === 'driver') label = 'Msafirishaji';
        else if (r === 'agent') label = 'Wakala';
        if (!label) return '';
        var ico = (r === 'transporter' || r === 'driver') ? 'truck' : 'shop';
        return '<span class="ch-acct-badge">' + (window.skhNavIcon ? window.skhNavIcon(ico, 14) : '') + esc(label) + '</span>';
    }

    function rowHtml93(it) {
        if (it.type === 'group') {
            var gLast = it.lastMessage ? truncate(it.lastMessage.text || '', 60) : '';
            var gTime = it.lastMessageAt ? fmtTime(it.lastMessageAt) : '';
            var gUnr = (it.unread > 0) ? '<span class="ch-unread">' + (it.unread > 99 ? '99+' : it.unread) + '</span>' : '';
            var gCls = 'ch-contact ch-grp-row ch-tint-group' + (it.pinned ? ' ch-pinned' : '') + (it.unread > 0 ? ' ch-unread-row' : '');
            return '<div class="' + gCls + '" data-gid="' + esc(it.gid) + '" data-conv="' + esc(it.convId || '') + '" onclick="window.__skhInboxOpenRow93(\'g:' + jsEsc(it.gid || '') + '\')">'
                + '<div class="ch-cc-avatar"><span style="display:inline-flex;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#1268A8,#18A982);color:#fff;align-items:center;justify-content:center;font-weight:900;font-size:19px;">' + esc(it.avatar || '#') + '</span></div>'
                + '<div class="ch-cc-info">'
                + '<span class="ch-cc-name">' + esc(it.name || 'Kikundi') + '</span>'
                + '<span class="ch-cc-msg">' + (gLast ? esc(gLast) : 'Gusa kufungua kikundi') + '</span>'
                + '<span class="ch-cc-meta"><span class="ch-acct-badge">👥 Kikundi' + (it.memberCount ? ' · ' + it.memberCount : '') + '</span></span>'
                + '</div>'
                + '<div class="ch-cc-side">' + (gTime ? '<span class="ch-cc-time">' + esc(gTime) + '</span>' : '') + gUnr + '</div>'
                + '</div>';
        }
        var dp = (typeof window.skhUserAvatar === 'function') ? window.skhUserAvatar(it.photo || null, it.name, 48) : '';
        var verified = it.verified ? '<span class="ch-verified"></span>' : '';
        var timeStr = it.lastMessageAt ? fmtTime(it.lastMessageAt) : '';
        var ltype = (it.lastMessage && it.lastMessage.type) || 'text';
        var lastText = it.lastMessage ? (ltype !== 'text' ? '[' + ltype + ']' : truncate(it.lastMessage.text || '', 60)) : '';
        var unreadBadge = (it.unread > 0) ? '<span class="ch-unread">' + (it.unread > 99 ? '99+' : it.unread) + '</span>' : '';
        var acct = roleBadge(it);
        var me = myUid();
        var draftText = (it.drafts && it.drafts[me] && it.drafts[me].text) || '';
        var draftBadge = draftText ? '<span class="ch-draft-badge">📝 Rasimu</span>' : '';
        var muteIco = it.muted ? '<span class="ch-mute-ico" title="Imewekwa kimya">🔕</span>' : '';
        var cls = 'ch-contact' + (it.pinned ? ' ch-pinned' : '') + (it.unread > 0 ? ' ch-unread-row' : '');
        return '<div class="' + cls + '" data-uid="' + esc(it.otherUid || '') + '" data-conv="' + esc(it.convId || '') + '" onclick="window.__skhInboxOpenRow93(\'' + jsEsc(it.otherUid || '') + '\')">'
            + '<div class="ch-cc-avatar">' + dp + '</div>'
            + '<div class="ch-cc-info">'
            + '<span class="ch-cc-name">' + esc(it.name || 'Mawasiliano') + verified + '</span>'
            + '<span class="ch-cc-time">' + esc(timeStr) + '</span>'
            + '<span class="ch-cc-msg">' + (draftBadge ? draftBadge : '') + (lastText ? esc(lastText) : '<i style="color:#94a3b8;">Bonyeza kuanza mazungumzo</i>') + '</span>'
            + (acct ? '<span class="ch-cc-meta">' + acct + '</span>' : '')
            + '</div>'
            + '<div class="ch-cc-side">' + muteIco + unreadBadge + '</div>'
            + '</div>';
    }

    function matches93(it) {
        if (it.hiddenForMe) return false;
        if (tab93 === 'archive') return !!it.archived;
        if (it.archived) return false;
        if (tab93 === 'unread') return (it.unread || 0) > 0;
        if (tab93 === 'buyers') return !!(it.related && it.related.sellerId && it.related.sellerId === myUid());
        if (tab93 === 'sellers') return !!(it.related && it.related.buyerId && it.related.buyerId === myUid());
        if (tab93 === 'transport') return it.type === 'delivery' || (it.related && it.related.deliveryId);
        if (tab93 === 'agents') return String(it.role || '').toLowerCase() === 'agent' || it.type === 'agent';
        return true;
    }

    function renderInbox93() {
        var list = document.getElementById('inboxList');
        var chipsHost = document.getElementById('inboxChips');
        var clearBtn = document.getElementById('inboxSearchClear');
        if (chipsHost) {
            var tabs = [['all', 'Zote'], ['unread', 'Zisizosomwa'], ['buyers', 'Wanunuzi'], ['sellers', 'Wauzaji'], ['transport', 'Wasafirishaji'], ['agents', 'Mawakala'], ['archive', 'Kumbukumbu']];
            chipsHost.innerHTML = tabs.map(function (t) {
                return '<button type="button" class="ch-tab' + (tab93 === t[0] ? ' active' : '') + '" onclick="window.__skhInboxTab93(\'' + t[0] + '\')">' + t[1] + '</button>';
            }).join('');
        }
        if (clearBtn) clearBtn.style.display = query93 ? 'flex' : 'none';
        if (!list) return;

        if (!items93.length) {
            list.innerHTML = '<div style="text-align:center;padding:44px 20px;color:#64748b;">'
                + '<div style="width:74px;height:74px;margin:0 auto 14px;border-radius:22px;background:linear-gradient(135deg,#1268A8,#18A982);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:34px;">S</div>'
                + '<b style="color:#0f172a;font-size:15px;display:block;">Hakuna mazungumzo bado</b>'
                + '<span style="font-size:12.5px;display:block;margin-top:6px;">Ukibofya "Chat" kwenye bidhaa au mtumiaji, mazungumzo yataonekana hapa.</span>'
                + '<button type="button" class="skh-chat-btn" style="margin-top:14px;" onclick="window.skhChatStartEmpty && window.skhChatStartEmpty()">Nenda Sokoni</button>'
                + '</div>';
            return;
        }
        var rows = items93.filter(matches93);
        if (query93) {
            var ql = query93.toLowerCase();
            rows = rows.filter(function (it) {
                return String(it.name || '').toLowerCase().indexOf(ql) !== -1
                    || (it.lastMessage && String(it.lastMessage.text || '').toLowerCase().indexOf(ql) !== -1);
            });
        }
        if (!rows.length) {
            list.innerHTML = '<div style="text-align:center;padding:34px 16px;color:#64748b;font-size:13px;">Hakuna matokeo</div>';
            return;
        }
        var pinned = rows.filter(function (r) { return r.pinned; });
        var recent = rows.filter(function (r) { return !r.pinned; });
        var html = '';
        if (pinned.length) html += '<div class="ch-inbox-sec">' + (window.skhNavIcon ? window.skhNavIcon('tag', 14) : '') + ' Iliyobandikwa</div>' + pinned.map(rowHtml93).join('');
        if (recent.length) {
            if (pinned.length) html += '<div class="ch-inbox-sec">Hivi Karibuni</div>';
            html += recent.map(rowHtml93).join('');
        }
        list.innerHTML = html;
    }

    /* ---------------- OPEN ---------------- */
    function showModal93() {
        try {
            ['sidebarMenuModal', 'plusMenu', 'sokohaiAccountSettingModal', 'productModal', 'mySokoHaiModal', 'sellerProfileModal'].forEach(function (id) {
                var el = document.getElementById(id); if (el) { el.style.display = 'none'; el.classList.remove('open'); }
            });
        } catch (e) {}
        var opened = false;
        if (typeof window.skhAbsoluteShowOnly === 'function') {
            try { window.skhAbsoluteShowOnly('chatListModal', 'flex', true); opened = true; } catch (e) {}
        }
        if (!opened) {
            var cl = document.getElementById('chatListModal');
            if (cl) { cl.style.display = 'flex'; cl.classList.add('open'); }
        }
        document.body.style.overflow = 'hidden';
    }

    async function skhInbox93() {
        var s = S();
        if (!s.requireAuth || !s.requireAuth()) return;
        showModal93();
        try { wireSearch(); } catch (eWS) { /* input inaweza kutengenezwa upya */ }
        var list = document.getElementById('inboxList');
        if (!list) { console.error('[INBOX93] #inboxList haipo kwenye DOM'); return; }
        if (loading93) return;
        loading93 = true;
        var myLoadSeq = ++loadSeq93;
        list.innerHTML = '<div style="text-align:center;padding:30px 16px;">'
            + '<div style="display:inline-block;width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#0B4F7A;border-radius:50%;animation:skhSpin 0.8s linear infinite;"></div>'
            + '<p style="color:#64748b;font-size:13px;margin-top:10px;">Inapakia mazungumzo...</p>'
            + '</div>';
        if (!document.getElementById('skhSpinStyle')) {
            var st = document.createElement('style');
            st.id = 'skhSpinStyle';
            st.textContent = '@keyframes skhSpin{to{transform:rotate(360deg)}}';
            document.head.appendChild(st);
        }
        var timedOut = false;
        var to = setTimeout(function () {
            if (!timedOut && loading93 && myLoadSeq === loadSeq93) {
                timedOut = true;
                loading93 = false; // Retry lazima iweze kuanza; invalidate response ya zamani.
                loadSeq93++;
                list.innerHTML = '<div style="text-align:center;padding:24px 16px;">'
                    + '<p style="color:#64748b;font-size:13px;">Mazungumzo yanachukua muda kupakia.</p>'
                    + '<button type="button" onclick="window.skhChatOpenInbox()" style="margin-top:10px;padding:8px 16px;background:#0B4F7A;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Jaribu Tena</button>'
                    + '</div>';
            }
        }, 10000);
        try {
            var loaded = await loadInbox93();
            clearTimeout(to);
            if (myLoadSeq !== loadSeq93) return;
            items93 = loaded || [];
            loading93 = false;
            renderInbox93();
        } catch (e) {
            clearTimeout(to);
            if (myLoadSeq !== loadSeq93) return;
            loading93 = false;
            console.error('[INBOX93] load failed:', e);
            list.innerHTML = '<div style="text-align:center;padding:26px 16px;color:#b91c1c;">'
                + '<b style="font-size:13.5px;">Hitilafu kupakia mazungumzo</b>'
                + '<p style="color:#64748b;font-size:12px;margin-top:6px;word-break:break-word;">' + esc((e && e.message) || String(e)) + '</p>'
                + '<button type="button" onclick="window.skhChatOpenInbox()" style="margin-top:10px;padding:8px 16px;background:#0B4F7A;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Jaribu Tena</button>'
                + '</div>';
        }
    }
    skhInbox93.__skh93 = true;
    window.__skhInboxActive93 = skhInbox93;

    window.skhChatOpenInbox = skhInbox93;

    /* [AUTHORITY FIX 2026-09-22] 93 inashughulikia INBOX TU.
     * Kazi zote za Direct Chat (skhChatOpen, attachConversation, sendInternal,
     * realtime message listeners, na commerce cards) zinabaki chini ya
     * mamlaka kuu ya 34-chat-core.js.
     * Kubofya row kunaita moja kwa moja mamlaka ya 34 kupitia openChatWithUser/skhChatOpen. */
    window.__skhInboxOpenRow93 = function (key) {
        if (!key) return;
        if (key.charAt(0) === 'g' && key.charAt(1) === ':') {
            var gid = key.slice(2).replace(/^conv_group_/, '');
            var it = items93.filter(function (x) { return x.type === 'group' && (x.gid === gid || x.convId === gid || x.convId === ('conv_group_' + gid)); })[0];
            var targetGid = (it && it.gid) || gid;
            if (typeof window.skhChatOpenGroupRow === 'function') { try { window.skhChatOpenGroupRow(targetGid); return; } catch (e) { console.warn('[INBOX93] groupRow failed', e); } }
            if (typeof window.skhOpenGroupSoga === 'function') { try { window.skhOpenGroupSoga(targetGid); return; } catch (e) { console.warn('[INBOX93] groupSoga failed', e); } }
            return;
        }
        var uid = key;
        var row = items93.filter(function (x) { return x.otherUid === uid || x.convId === uid; })[0] || {};
        var actualUid = row.otherUid || uid;
        var name = row.name || '';
        
        // Funga inbox mara moja
        var inboxEl = document.getElementById('chatListModal');
        if (inboxEl) { inboxEl.style.display = 'none'; inboxEl.classList.remove('open'); }
        
        // Ita moja kwa moja mamlaka ya 34-chat-core.js
        if (typeof window.openChatWithUser === 'function') {
            try { window.openChatWithUser(actualUid, name); return; } catch (e) { console.warn('[INBOX93] openChatWithUser failed', e); }
        }
        if (typeof window.skhChatOpen === 'function') {
            try { window.skhChatOpen(actualUid, name, { convId: row.convId, related: row.related, ctx: row.ctx || '' }); return; } catch (e) { console.warn('[INBOX93] skhChatOpen failed', e); }
        }
    };

    window.__skhInboxTab93 = function (tab) {
        tab93 = tab || 'all';
        renderInbox93();
    };

    /* Search wiring */
    function wireSearch() {
        var i = document.getElementById('inboxSearchInput');
        if (i && !i.__skh93wired) {
            i.__skh93wired = true;
            i.addEventListener('input', function () { query93 = (i.value || '').trim(); renderInbox93(); });
        }
        var c = document.getElementById('inboxSearchClear');
        if (c && !c.__skh93wired) {
            c.__skh93wired = true;
            c.addEventListener('click', function () {
                query93 = '';
                var i2 = document.getElementById('inboxSearchInput');
                if (i2) i2.value = '';
                renderInbox93();
            });
        }
    }
    setTimeout(wireSearch, 800);

    console.log('[SOKOHAI 93] chat inbox repair loaded ✓ — Authoritative direct chat delegated to 34-chat-core.js');
    window.__skhInboxRepairBooted = true;
})();

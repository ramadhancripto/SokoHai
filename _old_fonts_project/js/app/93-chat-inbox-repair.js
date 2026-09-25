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
        items93 = Object.keys(best).map(function (k) { return best[k]; });
        items93.sort(function (a, b) {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            return String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''));
        });
        console.log('[INBOX93] loaded:', items93.length, 'items');
        if (convErr && legacyErr && items93.length === 0) {
            throw new Error('Imeshindwa kusoma mazungumzo (' + String(convErr.message || convErr).slice(0, 80) + ')');
        }
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
        var list = document.getElementById('inboxList');
        if (!list) { console.error('[INBOX93] #inboxList haipo kwenye DOM'); return; }
        if (loading93) return;
        loading93 = true;
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
            if (!timedOut && loading93) {
                timedOut = true;
                list.innerHTML = '<div style="text-align:center;padding:24px 16px;">'
                    + '<p style="color:#64748b;font-size:13px;">Mazungumzo yanachukua muda kupakia.</p>'
                    + '<button type="button" onclick="window.skhChatOpenInbox()" style="margin-top:10px;padding:8px 16px;background:#0B4F7A;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Jaribu Tena</button>'
                    + '</div>';
            }
        }, 15000);
        try {
            await loadInbox93();
            clearTimeout(to);
            loading93 = false;
            renderInbox93();
        } catch (e) {
            clearTimeout(to);
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

    /* Row click */
    window.__skhInboxOpenRow93 = function (key) {
        if (!key) return;
        if (key.charAt(0) === 'g' && key.charAt(1) === ':') {
            var gid = key.slice(2).replace(/^conv_group_/, '');
            var it = items93.filter(function (x) { return x.type === 'group' && (x.gid === gid || x.convId === gid || x.convId === ('conv_group_' + gid)); })[0];
            var targetGid = (it && it.gid) || gid;
            if (typeof window.skhChatOpenGroupRow === 'function') { try { window.skhChatOpenGroupRow(targetGid); return; } catch (e) { console.warn('[INBOX93] groupRow failed', e); } }
            if (typeof window.skhOpenGroupSoga === 'function') { try { window.skhOpenGroupSoga(targetGid); return; } catch (e) { console.warn('[INBOX93] groupSoga failed', e); } }
            console.error('[INBOX93] hakuna function ya kufungua kikundi');
            return;
        }
        var uid = key;
        var row = items93.filter(function (x) { return x.otherUid === uid || x.convId === uid; })[0] || {};
        var actualUid = row.otherUid || uid;
        var name = row.name || '';
        if (typeof window.skhChatOpen === 'function') {
            try { window.skhChatOpen(actualUid, name, { convId: row.convId, related: row.related, ctx: row.ctx || '' }); return; } catch (e) { console.warn('[INBOX93] skhChatOpen failed', e); }
        }
        if (typeof window.openChatWithUser === 'function') {
            try { window.openChatWithUser(actualUid, name); return; } catch (e) { console.warn('[INBOX93] openChatWithUser failed', e); }
        }
        console.error('[INBOX93] hakuna njia ya kufungua chat na', uid);
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
    setTimeout(wireSearch, 400);
    window.addEventListener('load', wireSearch, { once: true });

    /* ---------------- RE-ASSERT GUARD (PHASE 1 CLEAN) ---------------- */
    function ensureOurs93() {
        try {
            if (typeof window.skhChatOpenInbox !== 'function' || window.skhChatOpenInbox.__skh93 !== true) {
                window.skhChatOpenInbox = window.__skhInboxActive93;
            }
        } catch (e) {}
    }
    ensureOurs93();
    window.addEventListener('load', ensureOurs93, { once: true });

    /* ---------------- SKHCHATOPEN SAFI (badala ya chain tata) ----------------
     * Ina-replicate mtiririko wa 34-chat-core kwa idhai za umma:
     * skhChatConvId (deterministic), ensureConv (doc shape ileile),
     * stream ya messages (onSnapshot), legacy chats merge (historia),
     * typing/draft, nego listeners. RENDERER ni wa app yenyewe
     * (window.skhChatRenderStream) — bubbles/reply zinaonekana kama kawaida.
     * ---------------------------------------------------------------- */
    function ensureConv93(partnerUid, ctx, related, convIdOverride) {
        var s = S();
        var me = myUid();
        var id = convIdOverride || (window.skhChatConvId
            ? window.skhChatConvId(partnerUid, ctx)
            : 'conv_' + [me, partnerUid].sort().join('_') + (ctx ? '_' + String(ctx).replace(/[^A-Za-z0-9_-]/g, '') : ''));
        var ref = s.doc(s.db, 'conversations', id);
        return s.getDoc(ref).then(function (snap) {
            if (snap && snap.exists && snap.exists()) {
                var cData = snap.data() || {};
                if (related && (!cData.related || Object.keys(cData.related).length === 0)) {
                    s.updateDoc(ref, { related: related }).catch(function () {});
                    cData.related = related;
                }
                return { id: id, data: cData, created: false };
            }
            function metaOf(uid) {
                return s.getDoc(s.doc(s.db, 'users', uid)).then(function (u0) {
                    if (u0 && u0.exists && u0.exists()) {
                        var u = u0.data() || {};
                        return {
                            uid: uid,
                            name: u.displayName || u.fullName || u.storeName || 'Mwanachama SokoHai',
                            photo: u.photoURL || u.profileImage || u.logo || '',
                            role: u.role || 'user',
                            verified: !!(u.verificationStatus === 'verified' || u.verified === true)
                        };
                    }
                    return { uid: uid, name: 'Mwanachama SokoHai', photo: '', role: 'user', verified: false };
                }).catch(function () { return { uid: uid, name: 'Mwanachama SokoHai', photo: '', role: 'user', verified: false }; });
            }
            return Promise.all([metaOf(me), metaOf(partnerUid)]).then(function (ms) {
                var meta = {}; ms.forEach(function (m) { meta[m.uid] = m; });
                var unread = {}; unread[me] = 0; unread[partnerUid] = 0;
                var nowIso = new Date().toISOString();
                var doc = {
                    type: 'direct',
                    participants: [me, partnerUid].sort(),
                    participantMeta: meta,
                    related: related || null,
                    lastMessage: null,
                    lastMessageAt: null,
                    unread: unread,
                    lastReadAt: {},
                    typing: null,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    status: 'active'
                };
                return s.setDoc(ref, doc).then(function () { return { id: id, data: doc, created: true }; });
            });
        });
    }

    function fetchLegacy93(partnerUid) {
        var s = S();
        var me = myUid();
        var q2 = s.query(s.collection(s.db, 'chats'), s.where('senderUid', '==', me), s.limit(50));
        var q3 = s.query(s.collection(s.db, 'chats'), s.where('receiverUid', '==', me), s.limit(50));
        return Promise.all([s.getDocs(q2).catch(function () { return null; }), s.getDocs(q3).catch(function () { return null; })]).then(function (snaps) {
            var out = [];
            snaps.forEach(function (sn) {
                if (!sn || !sn.forEach) return;
                sn.forEach(function (d) {
                    var c = d.data() || {};
                    var other = c.senderUid === me ? c.receiverUid : c.senderUid;
                    if (other !== partnerUid) return;
                    var itm = {
                        id: 'lg_' + d.id,
                        senderId: c.senderUid,
                        text: c.text || '',
                        type: 'text',
                        createdAt: c.createdAt,
                        _legacy: true
                    };
                    if (c.productId) {
                        itm.type = 'product';
                        itm.productRef = { id: c.productId, collection: c.productCollection || 'products' };
                        itm.productSnapshot = {
                            title: c.productTitle || '',
                            image: c.productImg || '',
                            price: c.productPrice != null ? c.productPrice : null,
                            sellerId: c.sellerUid || null
                        };
                    }
                    out.push(itm);
                });
            });
            return out;
        });
    }

    async function skhChatOpen93(uid, name, opts) {
        var s = S();
        if (!uid) return null;
        if (!s.requireAuth || !s.requireAuth()) return null;
        if (uid === myUid()) { if (window.showToast) window.showToast('Huwezi kujitumia ujumbe mwenyewe.', 'info'); return null; }
        opts = opts || {};
        var cm = document.getElementById('chatModal');
        if (!cm) { console.error('[CHAT93] #chatModal haipo'); return null; }
        // Onyesha modal MARA MOJA (bila flash)
        if (typeof window.skhAbsoluteShowOnly === 'function') {
            try { window.skhAbsoluteShowOnly('chatModal', 'flex', true); } catch (e) { cm.style.display = 'flex'; }
        } else { cm.style.display = 'flex'; }
        var inboxEl = document.getElementById('chatListModal');
        if (inboxEl) { inboxEl.style.display = 'none'; inboxEl.classList.remove('open'); }
        document.body.style.overflow = 'hidden';
        skh.currentChatUid = uid;
        skh.currentChatEmail = opts.email || skh.currentChatEmail || '';
        skh.chatPartner = name || (skh.currentChatEmail ? skh.currentChatEmail.split('@')[0] : 'Mawasiliano');
        var cw = document.getElementById('chatWith');
        if (cw) cw.textContent = skh.chatPartner || '...';
        var chatDiv = document.getElementById('chatMessages');
        if (chatDiv) {
            chatDiv.innerHTML = '<div style="text-align:center;padding:40px 16px;">'
                + '<div style="display:inline-block;width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#0B4F7A;border-radius:50%;animation:skhSpin 0.8s linear infinite;"></div>'
                + '<p style="color:#64748b;font-size:13px;margin-top:12px;">Inaunganisha mazungumzo...</p></div>';
            chatDiv.__skhHasRows = false;
        }
        if (!document.getElementById('skhSpinStyle')) {
            var st0 = document.createElement('style'); st0.id = 'skhSpinStyle';
            st0.textContent = '@keyframes skhSpin{to{transform:rotate(360deg)}}';
            document.head.appendChild(st0);
        }
        try {
            // Jina/email za mwenzake (kama hazijapeanwa)
            if (!name || !skh.currentChatEmail) {
                try {
                    var u0 = await s.getDoc(s.doc(s.db, 'users', uid));
                    if (u0 && u0.exists && u0.exists()) {
                        var ud = u0.data() || {};
                        name = name || ud.displayName || ud.fullName || ud.storeName || '';
                        skh.currentChatEmail = skh.currentChatEmail || ud.email || ud.userEmail || '';
                    }
                } catch (eU) { console.warn('[CHAT93] user fetch:', eU && eU.message); }
            }
            skh.chatPartner = name || skh.chatPartner || 'Mawasiliano';
            if (cw) cw.textContent = skh.chatPartner;

            // Related context resolution: opts.related > scopedRelatedForPartner > globals
            var scopedRel = opts.related || (typeof scopedRelatedForPartner === 'function' ? scopedRelatedForPartner(uid) : null);
            if (!scopedRel && skh.activeChatProduct) {
                var p = skh.activeChatProduct;
                var pOwner = (typeof ctxOwnerOf === 'function' && ctxOwnerOf(p)) || p.userId || uid;
                scopedRel = { productId: p.id, sellerId: pOwner, buyerId: (pOwner === myUid() ? uid : myUid()), productTitle: p.title || p.itemTitle || null, productPrice: p.price != null ? p.price : null, productImage: p.image || (p.images && p.images[0]) || p.photo || null, productCollection: p.collectionName || 'products' };
            } else if (!scopedRel && skh.activeChatService) {
                var sItem = skh.activeChatService;
                var sOwner = (typeof ctxOwnerOf === 'function' && ctxOwnerOf(sItem)) || sItem.userId || uid;
                scopedRel = { serviceId: sItem.id, sellerId: sOwner, buyerId: (sOwner === myUid() ? uid : myUid()), serviceTitle: sItem.title || sItem.itemTitle || sItem.serviceName || null, servicePrice: sItem.price != null ? sItem.price : null, serviceImage: sItem.image || (sItem.images && sItem.images[0]) || sItem.photo || null, serviceScope: sItem.scope || sItem.description || null };
            } else if (!scopedRel && skh.activeChatTransport) {
                var tItem = skh.activeChatTransport;
                var tOwner = (typeof ctxOwnerOf === 'function' && ctxOwnerOf(tItem)) || tItem.userId || uid;
                scopedRel = { transportId: tItem.id, sellerId: tOwner, buyerId: (tOwner === myUid() ? uid : myUid()), transportTitle: tItem.title || tItem.cargoName || null, transportFare: tItem.price != null ? tItem.price : (tItem.fare != null ? tItem.fare : null), transportFrom: tItem.fromLocation || tItem.pickupRegion || null, transportTo: tItem.toLocation || tItem.destinationRegion || null, transportCollection: tItem.collectionName || tItem.collection || 'ride_requests' };
            }

            var conv = await ensureConv93(uid, opts.ctx || '', scopedRel, opts.convId || null);
            var legacy = await fetchLegacy93(uid);

            if (conv.data && conv.data.related) {
                skh.chatRelated = conv.data.related;
            }

            skh.chatCore = {
                convId: conv.id,
                partnerUid: uid,
                partnerName: skh.chatPartner,
                replyTo: null,
                msgs: [],
                conv: conv.data || {},
                _legacyMsgs: legacy
            };
            var merged = mergeMsgs93(legacy, []);
            skh.chatCore.msgs = merged;
            if (typeof window.skhChatRenderStream === 'function') { try { window.skhChatRenderStream(); } catch (eR) { console.warn('[CHAT93] render:', eR && eR.message); } }

            // Stream YA SASA ya messages (pattern ileile ya 34.listen)
            if (typeof window.skhOnSnapshot === 'function') {
                var q = s.query(s.collection(s.db, 'conversations/' + conv.id + '/messages'), s.orderBy('createdAt', 'asc'), s.limit(80));
                try { if (skh.chatCoreUnsub) { try { skh.chatCoreUnsub(); } catch (e1) {} } } catch (e0) {}
                skh.chatCoreUnsub = window.skhOnSnapshot('chat-msgs-93-' + conv.id, q, function (snap) {
                    var live = [];
                    if (snap && snap.forEach) snap.forEach(function (d) { live.push(Object.assign({ id: d.id }, d.data())); });
                    var core = skh.chatCore; if (!core || core.convId !== conv.id) return;
                    core.msgs = mergeMsgs93(core._legacyMsgs || [], live);
                    if (typeof window.skhIngestLatestNegoFromMsgs === 'function') {
                        try { window.skhIngestLatestNegoFromMsgs(live); } catch (eN) {}
                    }
                    if (typeof window.skhChatRenderStream === 'function') { try { window.skhChatRenderStream(); } catch (e2) {} }
                    if (typeof window.skhChatRefreshNegoCard === 'function') { try { window.skhChatRefreshNegoCard(); } catch (eC) {} }
                }, function (err) {
                    console.error('[CHAT93] messages stream failed:', err && err.message);
                    var cd = document.getElementById('chatMessages');
                    if (cd) cd.innerHTML = '<p style="text-align:center;color:#b91c1c;padding:30px 10px;font-size:13px;">Imeshindwa kupakia meseji. Jaribu tena.</p>';
                });
            }

            // Read receipts (unread/lastReadAt) — pattern ya 34.markRead
            try {
                var me2 = myUid();
                var unread0 = Object.assign({}, (conv.data && conv.data.unread) || {});
                var lra = Object.assign({}, (conv.data && conv.data.lastReadAt) || {});
                if ((unread0[me2] || 0) !== 0 || !lra[me2]) {
                    unread0[me2] = 0; lra[me2] = new Date().toISOString();
                    s.updateDoc(s.doc(s.db, 'conversations', conv.id), { unread: unread0, lastReadAt: lra }).catch(function () {});
                }
            } catch (eMr) {}

            // Input: typing + draft (globals za 34)
            var inp = document.getElementById('chatInput');
            if (inp) {
                inp.oninput = function () {
                    try { window.skhChatTyping && window.skhChatTyping(); } catch (eT) {}
                    try { window.skhChatSaveDraft && window.skhChatSaveDraft(inp.value); } catch (eD) {}
                };
                setTimeout(function () { try { inp.focus(); } catch (eF) {} }, 250);
            }

            // UX extras zote za app (kwa try/catch — si za lazima)
            try { window.skhSetChatHeaderAvatar && window.skhSetChatHeaderAvatar(uid, null, skh.chatPartner); } catch (e1) {}
            try { window.skhRenderAttachedProduct && window.skhRenderAttachedProduct(); } catch (e2) {}
            try { window.skhEnsureCommerceAnchor && window.skhEnsureCommerceAnchor(); } catch (eA0) {}
            try { window.skhChatRefreshNegoCard && window.skhChatRefreshNegoCard(); } catch (eA1) {}
            try { window.skhNegoListen && window.skhNegoListen(conv.id); } catch (e3) {}
            try { window.skhChatRenderBlockedState && window.skhChatRenderBlockedState(); } catch (e4) {}
            try { window.skhChatRenderSidePane && window.skhChatRenderSidePane(); } catch (e5) {}

            console.log('[CHAT93] opened conv', conv.id, 'legacy msgs:', legacy.length, (conv.created ? '(new)' : '(existing)'));
            return conv;
        } catch (e) {
            console.error('[CHAT93] open failed:', e);
            var cd2 = document.getElementById('chatMessages');
            if (cd2) cd2.innerHTML = '<p style="text-align:center;color:#b91c1c;padding:30px 10px;font-size:13px;">'
                + 'Imeshindwa kufungua mazungumzo: ' + esc((e && e.message) || String(e))
                + '<br><button type="button" onclick="window.skhChatOpen(\'' + jsEsc(uid) + '\')" style="margin-top:8px;padding:8px 14px;background:#0B4F7A;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Jaribu Tena</button></p>';
            return null;
        }
    }

    function mergeMsgs93(legacy, live) {
        var seen = {}; var out = [];
        live.forEach(function (m) { if (m && m.id && !seen[m.id]) { seen[m.id] = 1; out.push(m); } });
        legacy.forEach(function (m) { if (m && m.id && !seen[m.id]) { seen[m.id] = 1; out.push(m); } });
        out.sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
        return out;
    }

    skhChatOpen93.__skh93 = true;
    window.__skhChatActive93 = skhChatOpen93;
    window.skhChatOpen = skhChatOpen93;

    /* Re-assert: Hakikisha 93 ndiyo inabaki kwenye window (PHASE 1 CLEAN) */
    function ensureChatOurs93() {
        try {
            if (typeof window.skhChatOpen !== 'function' || window.skhChatOpen.__skh93 !== true) {
                window.skhChatOpen = window.__skhChatActive93;
            }
        } catch (e) {}
    }
    ensureChatOurs93();
    window.addEventListener('load', ensureChatOurs93, { once: true });

    console.log('[SOKOHAI 93] chat inbox repair loaded ✓ — clean inbox + re-assert guard + watchdog');
    window.__skhInboxRepairBooted = true;
})();

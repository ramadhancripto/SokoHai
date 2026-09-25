/* ================================================================
 * 69-chat-groups.js — [R18 GROUP ENGINE 2026-09-17]
 * GROUP CHAT engine (§12–§19) — coordination layer ya Soga.
 *
 * DATA MODEL (backend = source of truth §15/§43/§44):
 *   chatGroups/{gid}                   — group doc:
 *     { name, description, groupType: 'TEMPORARY_COMMERCE'|'PERMANENT_COMMUNITY',
 *       category, contextType: 'GROUP_BUY'|'WHOLESALE'|'GROUP_ORDER'|
 *           'TRANSPORT'|'PRODUCT'|'SERVICE'|'GENERAL', contextId|null,
 *       visibility: 'public'|'private',
 *       joinPolicy: 'open'|'request', invitePolicy: 'everyone'|'admins',
 *       sendPolicy: 'everyone'|'admins',
 *       status: 'ACTIVE'|'COMPLETED'|'CANCELLED'|'ARCHIVED',
 *       createdBy, ownerId, createdAt, updatedAt, archivedAt|null,
 *       memberCount, conversationId: null (R19 itaiweka UI ya group chat) }
 *   chatGroups/{gid}/members/{uid}     — DUP-PROOF (doc id = uid, §44):
 *     { userId, role:'owner'|'admin'|'moderator'|'member',
 *       joinedAt, invitedBy|null, status:'active'|'pending'|'left', leftAt|null }
 *   chatGroups/{gid}/events/{auto}     — chronological history HALISI (§29/§30):
 *     { type:'group_created'|'member_joined'|'member_left'|'member_invited'|
 *            'role_changed'|'status_changed', actorUid, targetUid|null, at, note? }
 *
 * RULES ZILIZOWEKWA:
 *   - Join public+open → active mara moja; 'request' → pending (§14).
 *   - Owner/Admin wanaweza remove/role/archive (§35); member hawezi (guard).
 *   - Leave: status='left', leftAt — HISTORIA HAIFUTWI (§29/§35).
 *   - Lifecycle: created→ACTIVE→COMPLETED|CANCELLED→ARCHIVED (§12).
 *   - memberCount husawaishi kwenye group doc (sec=write).
 *   - Hakuna duplicate membership (same doc id) wala duplicate events
 *     kwa rejoin: event huongezwa TU wakati status inabadilika kweli.
 *   - Lugha 2 kupitia t() — si strings hardcoded.
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    if (window.__skhGroupsBoot) return;
    window.__skhGroupsBoot = true;

    function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }
    function esc(s) { return skh.skhEscape(String(s == null ? '' : s)); }
    function uid() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function nowIso() { return new Date().toISOString(); }
    function gRef(gid) { return skh.doc(skh.db, 'chatGroups', gid); }
    function mRef(gid, muid) { return skh.doc(skh.db, 'chatGroups/' + gid + '/members', muid); }
    function evRef(gid) { return skh.collection(skh.db, 'chatGroups/' + gid + '/events'); }
    async function logEvent(gid, type, actor, targetUid, note, goid) {
        try {
            var ev = { type: type, actorUid: actor, targetUid: targetUid || null, note: note || null, at: nowIso() };
            if (goid) ev.goid = goid;        // [§26] per-order organizer feed filter-ready
            await skh.addDoc(evRef(gid), ev);
        } catch (e) { console.warn('[grp event]', e); }
    }

    /* ---------------- ROLES/GUARDS ---------------- */
    function roleOf(mem) { return (mem && mem.status === 'active') ? (mem.role || 'member') : null; }
    function canManage(role) { return role === 'owner' || role === 'admin'; }
    function canModerate(role) { return canManage(role) || role === 'moderator'; }
    function canOrganize(role) { return canManage(role) || role === 'organizer'; }   // [§27] Order Organizer peake inabeba group orders

    /* ---------------- CREATE (§14) ---------------- */
    window.skhGroupCreate = async function (cfg) {
        if (!uid()) { alert(tk('login_first', 'Ingia kwanza.')); return null; }
        cfg = cfg || {};
        var name = String(cfg.name || '').trim();
        if (name.length < 3) { alert(tk('grp_err_name', 'Weka jina la kikundi (herufi 3+).')); return null; }
        var gid = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        var doc = {
            name: name,
            description: String(cfg.description || '').trim(),
            groupType: cfg.groupType === 'PERMANENT_COMMUNITY' ? 'PERMANENT_COMMUNITY' : 'TEMPORARY_COMMERCE',
            category: String(cfg.category || 'general').trim(),
            contextType: cfg.contextType || 'GENERAL',
            contextId: cfg.contextId || null,
            // [R22 B10] engine default = UI default: 'public' + 'open' (zamani engine
            // ilikuwa 'private' kwa default ikinyorana na modal default = silent-pending)
            visibility: cfg.visibility === 'private' ? 'private' : 'public',
            joinPolicy: cfg.joinPolicy === 'request' ? 'request' : 'open',
            invitePolicy: cfg.invitePolicy === 'admins' ? 'admins' : 'everyone',
            sendPolicy: cfg.sendPolicy === 'admins' ? 'admins' : 'everyone',
            status: 'ACTIVE',
            createdBy: uid(), ownerId: uid(),
            createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null,
            memberCount: 1, conversationId: null
        };
        var convId = 'conv_group_' + gid;        // deterministic (§44 no dup)
        doc.conversationId = convId;
        // [R20 §10] sharedContext — chat haihesabu commerce, inarejea
        // entity halisi kwa ID tu (Group Buy/Wholesale/Transport kwenye engines zao).
        doc.sharedContext = {
            type: cfg.contextType || 'GENERAL',
            contextId: cfg.contextId || null,
            contextName: String(cfg.contextName || '').trim() || null,
            createdBy: uid(),
            participants: [uid()]
        };
        await skh.setDoc(gRef(gid), doc);
        try { await skh.setDoc(skh.doc(skh.db, 'sharedContexts', gid), doc.sharedContext); } catch (eSC) {}
        try { await skh.setDoc(skh.doc(skh.db, 'conversations', convId), {
            type: 'group', groupId: gid, name: name,
            participants: [uid()], createdAt: nowIso(), updatedAt: nowIso(), lastMessageAt: null
        }); } catch (eCV) {}
        await skh.setDoc(mRef(gid, uid()), {
            userId: uid(), role: 'owner', status: 'active',
            joinedAt: nowIso(), invitedBy: null, leftAt: null
        });
        await logEvent(gid, 'group_created', uid(), null, name);
        return { id: gid, data: doc };
    };

    /* ---------------- JOIN (dup-proof §44) ---------------- */
    window.skhGroupJoin = async function (gid) {
        if (!uid()) { alert(tk('login_first', 'Ingia kwanza.')); return null; }
        var gsnap = await skh.getDoc(gRef(gid));
        if (!gsnap || !gsnap.exists()) { alert(tk('grp_not_found', 'Kikundi hakipatikani.')); return null; }
        var g = gsnap.data();
        if (g.status !== 'ACTIVE') { alert(tk('grp_archived', 'Kikundi hiki hakipo active tena.')); return null; }

        var msnap = await skh.getDoc(mRef(gid, uid()));
        var existing = (msnap && msnap.exists && msnap.exists()) ? msnap.data() : null;
        if (existing && existing.status === 'active') return { already: true, membership: existing };   // §44 no dup
        if (existing && existing.status === 'pending') return { pending: true, membership: existing };

        var nowActive = (g.visibility === 'public' && g.joinPolicy === 'open');
        var mem = {
            userId: uid(),
            role: 'member',
            status: nowActive ? 'active' : 'pending',
            joinedAt: existing ? (existing.joinedAt || nowIso()) : nowIso(),
            invitedBy: null,
            leftAt: null
        };
        if (existing && existing.status === 'left') { mem.joinedAt = nowIso(); mem.leftAt = null; }
        await skh.setDoc(mRef(gid, uid()), mem);
        if (nowActive) {
            await syncConvParticipants(gid, uid(), true);
            await syncMemberCount(gid, +1);
            await logEvent(gid, 'member_joined', uid(), uid(), null);
            try { var gs2 = await skh.getDoc(gRef(gid)); var sc = (gs2.exists() ? gs2.data().sharedContext : null) || null;
                if (sc && sc.participants && sc.participants.indexOf(uid()) === -1) { sc.participants.push(uid()); await skh.setDoc(skh.doc(skh.db, 'sharedContexts', gid), { participants: sc.participants }, { merge: true }); } } catch (eSC2) {}
        } else {
            await logEvent(gid, 'member_request', uid(), uid(), null);
        }
        return { active: nowActive, membership: mem };
    };
    // Discover stub (R17 Discover) sasa ina target halisi
    window.skhDiscoverJoinGroup = async function (gid) {
        var r = await window.skhGroupJoin(gid);
        if (!r) return;
        try {
            if (r.active) window.showToast ? window.showToast(tk('grp_joined', 'Umejiunga kikundi hiki'), 'success') : 0;
            else if (r.already) window.showToast ? window.showToast(tk('grp_already', 'Tayari wewe ni mwanachama'), 'info') : 0;
            else window.showToast ? window.showToast(tk('grp_requested', 'Ombi la kujiunga limetumwa'), 'info') : 0;
        } catch (eT) {}
        // rudisha matokeo yatayarishe Discover kwa membership mpya
        try { if (window.skhDiscoverSearch) window.skhDiscoverSearch(window.skhDiscoverLastQ ? window.skhDiscoverLastQ() : '', 'all'); } catch (eR) {}
    };
    if (!window.skhDiscoverLastQ) window.skhDiscoverLastQ = function () { return ''; };  // 68 ndiyo ina q halisi

    // [R22] sharedContext.participants — REMOVE helper (leave/remove/rejectivate)
    async function removeCtxParticipant(gid, targetUid) {
        try {
            var gs = await skh.getDoc(gRef(gid)); var sc = (gs && gs.exists && gs.exists()) ? (gs.data().sharedContext || null) : null;
            if (sc && Array.isArray(sc.participants) && sc.participants.indexOf(targetUid) !== -1) {
                sc.participants = sc.participants.filter(function (x) { return x !== targetUid; });
                await skh.setDoc(skh.doc(skh.db, 'sharedContexts', gid), { participants: sc.participants }, { merge: true });
            }
        } catch (e) {}
    }
    /* ---------------- LEAVE (status='left', historia haifutwi) ---------------- */
    window.skhGroupLeave = async function (gid) {
        if (!uid()) return null;
        var msnap = await skh.getDoc(mRef(gid, uid()));
        if (!msnap || !msnap.exists()) return null;
        var mem = msnap.data();
        if (mem.status !== 'active') return mem;
        var wasOwner = mem.role === 'owner';
        mem.status = 'left'; mem.leftAt = nowIso();
        await skh.setDoc(mRef(gid, uid()), mem);
        await syncConvParticipants(gid, uid(), false);
        await syncMemberCount(gid, -1);
        await removeCtxParticipant(gid, uid());
        await logEvent(gid, 'member_left', uid(), uid(), null);
        // [R24] ownership HAIBAKI wazi bila mpangilio: owner akiondoka, mmiliki
        // mpya ni ADMIN wa mapema-joinedAt (au moderator, au member) — event
        // 'ownership_transferred' kwa historia. Hakuna ARCHIVE ya lazima
        // (public/community group inaweza kubaki wazi na ku-rejoin — probe78).
        if (wasOwner) { try { await autoTransferOwnership(gid, uid()); } catch (eT) {} }
        return mem;
    };

    /* ---------------- [R24] OWNERSHIP TRANSFER ----------------
     * - autoTransferOwnership: owner ameacha → mratibu mpya kwa ngazi
     *   (admin > moderator > member; earliest joinedAt anashinda).
     * - skhGroupTransferOwnership: explicit (owner pekee, UI "kabidhi mmiliki");
     *   owner wa zamani hubaki ACTIVE kama admin (hajatoka kikundi). */
    function ownerRank(r) { return r === 'admin' ? 1 : r === 'moderator' ? 2 : 3; }
    async function autoTransferOwnership(gid, oldOwnerUid) {
        var members = await window.skhGroupMembers(gid);
        var cands = (members || []).filter(function (mm) { return mm && mm.status === 'active' && mm.userId !== oldOwnerUid; });
        if (!cands.length) return null;   // hakuna mtu — kikundi kinaendelea ACTIVE (kwa probe78: public discoverable/rejoin)
        cands.sort(function (a, b) {
            var dr = ownerRank(a.role) - ownerRank(b.role);
            if (dr) return dr;
            return String(a.joinedAt || '').localeCompare(String(b.joinedAt || ''));
        });
        var next = cands[0];
        var tdoc = next; tdoc.role = 'owner';
        await skh.setDoc(mRef(gid, next.userId), tdoc);
        try {
            var gs = await skh.getDoc(gRef(gid));
            if (gs && gs.exists && gs.exists()) { var g = gs.data(); g.ownerId = next.userId; g.updatedAt = nowIso(); await skh.updateDoc(gRef(gid), g); }
        } catch (eG) {}
        await logEvent(gid, 'ownership_transferred', oldOwnerUid, next.userId, 'auto');
        return next.userId;
    }

    window.skhGroupTransferOwnership = async function (gid, targetUid) {
        var my = await window.skhGroupMyRole(gid);
        if (my !== 'owner') { alert(tk('grp_owner_only2', 'Mmiliki ndiye anayeweza kukabidhi umiliki.')); return null; }
        if (!targetUid || targetUid === uid()) return null;
        var tsnap = await skh.getDoc(mRef(gid, targetUid));
        if (!(tsnap && tsnap.exists && tsnap.exists()) || tsnap.data().status !== 'active') {
            alert(tk('grp_target_not_member', 'Huyu si mwanachama active.')); return null;
        }
        var mine = await skh.getDoc(mRef(gid, uid()));
        var m = mine.data(); m.role = 'admin';          // owner wa zamani = admin (hubaki kikundini)
        await skh.setDoc(mRef(gid, uid()), m);
        var t = tsnap.data(); t.role = 'owner';
        await skh.setDoc(mRef(gid, targetUid), t);
        try {
            var gs2 = await skh.getDoc(gRef(gid));
            if (gs2 && gs2.exists && gs2.exists()) { var g2 = gs2.data(); g2.ownerId = targetUid; g2.updatedAt = nowIso(); await skh.updateDoc(gRef(gid), g2); }
        } catch (eG2) {}
        await logEvent(gid, 'ownership_transferred', uid(), targetUid, 'explicit');
        return t;
    };

    /* ---------------- [R26] GROUP INFO EDIT (name/description) ---------------- */
    window.skhGroupUpdateInfo = async function (gid, patch) {
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) { alert(tk('grp_no_perm', 'Huna ruhusa ya kutendewa hili (owner/admin tu).')); return null; }
        var gs = await skh.getDoc(gRef(gid));
        if (!(gs && gs.exists && gs.exists())) return null;
        var g = gs.data() || {};
        var ch = {};
        if (patch && patch.name !== undefined) {
            var nm = String(patch.name || '').trim();
            if (nm.length >= 3 && nm !== g.name) { g.name = nm; ch.name = nm; }
        }
        if (patch && patch.description !== undefined) {
            var ds = String(patch.description || '').trim().slice(0, 300);
            if (ds !== (g.description || '')) { g.description = ds; ch.description = ds; }
        }
        if (!Object.keys(ch).length) return null;
        g.updatedAt = nowIso();
        await skh.updateDoc(gRef(gid), g);
        // [R26] sync conv doc — unified list (34) husoma jina/muda kutoka conv
        try {
            var cu = { updatedAt: nowIso() };
            if (ch.name) cu.name = ch.name;
            await skh.updateDoc(skh.doc(skh.db, 'conversations', 'conv_group_' + gid), cu);
        } catch (eCU) {}
        await logEvent(gid, 'group_info_updated', uid(), null, Object.keys(ch).join(','));
        return g;
    };

    /* ---------------- [R26] MENTIONS (parse @jina / @wote) ---------------- */
    async function extractMentions(gid, txt) {
        var out = [];
        try {
            if (String(txt || '').indexOf('@') < 0) return out;
            var mems = await window.skhGroupMembers(gid);
            var active = (mems || []).filter(function (mm) { return mm && mm.status === 'active'; });
            // @wote / @all → WOTE active (cap 50)
            if (/@(wote|wote\s|all)\b/i.test(txt + ' ')) {
                active.forEach(function (mm) { if (mm.userId !== uid()) out.push(mm.userId); });
                return out.slice(0, 50);
            }
            var names = [];
            for (var i = 0; i < active.length; i++) {
                var u2 = active[i].userId;
                if (u2 === uid()) continue;
                var nm2 = u2;
                try { var us = await skh.getDoc(skh.doc(skh.db, 'users', u2)); if (us && us.exists && us.exists()) nm2 = us.data().fullName || us.data().displayName || u2; } catch (eN) {}
                if (nm2 && txt.toLowerCase().indexOf('@' + String(nm2).toLowerCase()) >= 0) out.push(u2);
            }
        } catch (e) {}
        // dedupe
        return out.filter(function (x, i2) { return out.indexOf(x) === i2; });
    }

    /* ---------------- [R25 §35] GROUP SEND (guards engine-level) ----------------
     * Zamani 73 sendText ilifanya addDoc moja kwa moja — sendPolicy/archive/
     * membership zilikuwa UI-guard TU. Sasa send hupitia engine: mtu ye yote
     * aweza kubypass UI, sentv-guards HAZIWEZI bypassiwa (server-side rule):
     *   archived/CANCELLED, not_member, sendPolicy:'admins', empty, rate-limit.
     * lastMessage + unread bump + updatedAt hufanywa humu — HALISI kwa wote. */
    function myNameG() { return (skh.currentUserData && (skh.currentUserData.fullName || skh.currentUserData.displayName)) || 'MJ'; }
    window.skhGroupSendMessage = async function (gid, text, opts) {
        if (!uid()) return { ok: false, reason: 'auth' };
        var txt = String(text || '').trim();
        if (!txt) return { ok: false, reason: 'empty' };
        var gs = await skh.getDoc(gRef(gid));
        if (!(gs && gs.exists && gs.exists())) return { ok: false, reason: 'not_found' };
        var g = gs.data() || {};
        if (g.status !== 'ACTIVE') return { ok: false, reason: 'archived' };
        var my = await window.skhGroupMyRole(gid);
        if (!my) return { ok: false, reason: 'not_member' };
        if (g.sendPolicy === 'admins' && !canManage(my)) return { ok: false, reason: 'sendPolicy' };
        // [R25 anti-spam] limit ya ujumbe kwa dakika ya mwisho (group doc limits
        // .maxMsgsPerMinute hupitisha; default 20 — haiwahi block normal chat)
        var lim = (g && g.limits && +g.limits.maxMsgsPerMinute) || 20;
        try {
            var since = new Date(Date.now() - 60000).toISOString();
            var qs = await skh.getDocs(skh.query(skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'), skh.where('senderUid', '==', uid())));
            var n = 0;
            qs.forEach(function (d) { var mm = d.data() || {}; if (String(mm.at || '') >= since) n++; });
            if (n >= lim) return { ok: false, reason: 'rate', limit: lim };
        } catch (eR) {}
        var convRef = skh.doc(skh.db, 'conversations', 'conv_group_' + gid);
        var mentions = await extractMentions(gid, txt);   // [R26] @jina/@wote → msg.mentions
        var rto = fmtReplyTo(opts && opts.replyTo);       // [P3 §12] jibu la ujumbe
        var msgDoc = { senderUid: uid(), senderName: myNameG(), text: txt, at: nowIso(), mentions: mentions };
        if (rto) { msgDoc.replyTo = rto; msgDoc.threadRootId = (opts && opts.threadRootId) || rto.id; }
        var rr = await skh.addDoc(skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'), msgDoc);
        // syncs kwa unified list (34) — lastMessage + unread ya WANACHAMA WENGINE (§44-style RMW)
        try {
            var cs2 = await skh.getDoc(convRef);
            var c2 = (cs2 && cs2.exists && cs2.exists()) ? (cs2.data() || {}) : {};
            var unread2 = c2.unread || {};
            (c2.participants || []).forEach(function (pu) { if (pu !== uid()) unread2[pu] = (unread2[pu] || 0) + 1; });
            await skh.updateDoc(convRef, { lastMessage: { text: txt, type: 'text', mentions: mentions }, lastMessageAt: nowIso(), updatedAt: nowIso(), unread: unread2 });
        } catch (eU2) {}
        return { ok: true, id: rr && rr.id, mentions: mentions };
    };

    /* ================= [SPEC PHASE 3 §10/§12/§13/§23] TYPED MESSAGES =================
     * Aina za ujumbe (explicit enum §45 — hakuna free-form): text tayari ipo;
     * hapa: image | document | location | contact | product | service | poll |
     * announcement(admins). Guards ZILEZILE za sendText (archived/member/
     * sendPolicy/rate) — zisipitwe kwenye njia nyingine. */
    var GSG_MSG_TYPES = { image: 1, document: 1, location: 1, contact: 1, product: 1, service: 1, poll: 1, announcement: 1 };
    window.__GSG_MSG_TYPES = GSG_MSG_TYPES;

    function cln(v, mx) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, mx || 160); }
    function fmtReplyTo(rt) {
        if (!rt || !rt.id) return null;
        return { id: cln(rt.id, 80), by: cln(rt.by || rt.senderName || '', 60), preview: cln(rt.preview || rt.text || '', 80) };
    }

    async function grpSendGuard(gid) {
        if (!uid()) return { ok: false, reason: 'auth' };
        var gs = await skh.getDoc(gRef(gid));
        if (!(gs && gs.exists && gs.exists())) return { ok: false, reason: 'not_found' };
        var g = gs.data() || {};
        if (g.status !== 'ACTIVE') return { ok: false, reason: 'archived' };
        var my = await window.skhGroupMyRole(gid);
        if (!my) return { ok: false, reason: 'not_member' };
        if (g.sendPolicy === 'admins' && !canManage(my)) return { ok: false, reason: 'sendPolicy' };
        return { ok: true, g: g, my: my };
    }

    function grpTypePreview(type, fields) {
        switch (type) {
            case 'image': return '\u{1F5BC}\uFE0F ' + tk('gsg_p_image', 'Picha') + (fields.caption ? ': ' + fields.caption : '');
            case 'document': return '\u{1F4C4} ' + (fields.fileName || tk('gsg_p_doc', 'Nyaraka'));
            case 'location': return '\u{1F4CD} ' + (fields.label || tk('gsg_p_loc', 'Mahali'));
            case 'contact': return '\u{1F464} ' + (fields.contactName || tk('gsg_p_ctc', 'Mawasiliano'));
            case 'product': return '\u{1F6D2}\uFE0F ' + tk('gsg_p_prod', 'Bidhaa') + ': ' + (fields.product && fields.product.name || '');
            case 'service': return '\u{1F527} ' + tk('gsg_p_serv', 'Huduma') + ': ' + (fields.service && fields.service.name || '');
            case 'poll': return '\u{1F4CB} ' + tk('gsg_p_poll', 'Kura') + ': ' + (fields.question || '');
            case 'announcement': return '\u{1F4E2} ' + (fields.text || '');
        }
        return '';
    }

    window.skhGroupSendTyped = async function (gid, payload) {
        payload = payload || {};
        var type = String(payload.type || '');
        if (!GSG_MSG_TYPES[type]) return { ok: false, reason: 'bad_type' };   // [§45]
        var gch = await grpSendGuard(gid);
        if (!gch.ok) return gch;
        var g = gch.g, my = gch.my;
        if (type === 'announcement' && !canManage(my)) return { ok: false, reason: 'sendPolicy' };  // [§10/§46]
        // rate limit — kama text (hakuna kuvuka anti-spam kwa typed msgs)
        try {
            var lim = (g.limits && +g.limits.maxMsgsPerMinute) || 20;
            var since = new Date(Date.now() - 60000).toISOString();
            var qs = await skh.getDocs(skh.query(skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'), skh.where('senderUid', '==', uid())));
            var n = 0; qs.forEach(function (d) { var mm = d.data() || {}; if (String(mm.at || '') >= since) n++; });
            if (n >= lim) return { ok: false, reason: 'rate', limit: lim };
        } catch (eR) {}
        // validation per type (NO fake state — fields lazima ze mazungumzo hayo)
        var fields = {}, prev = '';
        if (type === 'image') {
            if (!payload.imageUrl || String(payload.imageUrl).length > 2500000) return { ok: false, reason: 'image' };
            fields.imageUrl = String(payload.imageUrl); if (payload.caption) fields.caption = cln(payload.caption, 300);
        } else if (type === 'document') {
            if (!payload.fileName) return { ok: false, reason: 'document' };
            fields.fileName = cln(payload.fileName, 120);
            fields.fileSize = Math.max(0, Math.min(50e6, +payload.fileSize || 0));
            if (payload.fileData && String(payload.fileData).length <= 900000) fields.fileData = String(payload.fileData);
            if (payload.fileType) fields.fileType = cln(payload.fileType, 60);
        } else if (type === 'location') {
            var la = payload.lat, ln = payload.lng;
            var hasC = (la !== undefined && la !== null && ln !== undefined && ln !== null && !isNaN(+la) && !isNaN(+ln));
            fields.label = cln(payload.label, 120) || tk('gsg_p_loc', 'Mahali');
            if (hasC) { fields.lat = Math.max(-90, Math.min(90, +la)); fields.lng = Math.max(-180, Math.min(180, +ln)); }
        } else if (type === 'contact') {
            if (!payload.contactUid || !payload.contactName) return { ok: false, reason: 'contact' };
            fields.contactUid = cln(payload.contactUid, 80); fields.contactName = cln(payload.contactName, 80);
            if (payload.contactPhone) fields.contactPhone = cln(payload.contactPhone, 24);
        } else if (type === 'product') {
            var pr = payload.product || {};
            if (!pr.name) return { ok: false, reason: 'product' };
            fields.product = { name: cln(pr.name, 80) };
            if (pr.price !== undefined && pr.price !== null && pr.price !== '') fields.product.price = cln(String(pr.price), 40);
            if (pr.qty) fields.product.qty = cln(String(pr.qty), 40);
            if (pr.unit) fields.product.unit = cln(pr.unit, 20);
            if (pr.productId) fields.product.productId = cln(pr.productId, 64);
            if (pr.sellerName) fields.product.sellerName = cln(pr.sellerName, 60);
            if (pr.imageUrl) fields.product.imageUrl = String(pr.imageUrl).slice(0, 2500000);
        } else if (type === 'service') {
            var sv = payload.service || {};
            if (!sv.name) return { ok: false, reason: 'service' };
            fields.service = { name: cln(sv.name, 80) };
            if (sv.price) fields.service.price = cln(String(sv.price), 40);
            if (sv.pricingMode) fields.service.pricingMode = cln(sv.pricingMode, 24);
            if (sv.note) fields.service.note = cln(sv.note, 160);
        } else if (type === 'poll') {
            var q2 = cln(payload.question, 200);
            var opts2 = (Array.isArray(payload.options) ? payload.options : []).map(function (o) { return cln(o, 60); }).filter(Boolean);
            opts2 = opts2.filter(function (o, i) { return opts2.indexOf(o) === i; });
            if (q2.length < 3 || opts2.length < 2 || opts2.length > 6) return { ok: false, reason: 'poll' };
            fields.question = q2; fields.options = opts2; fields.votes = {}; fields.pollClosed = false;   // [§23] counts huongezeka kwa vote
        } else if (type === 'announcement') {
            var tx = cln(payload.text, 500);
            if (!tx) return { ok: false, reason: 'empty' };
            fields.text = tx;
        }
        var mentions = await extractMentions(gid, fields.caption || fields.text || fields.question || '');
        var rto = fmtReplyTo(payload.replyTo);
        if (!prev) prev = grpTypePreview(type, fields);
        var doc = { senderUid: uid(), senderName: myNameG(), at: nowIso(), type: type };
        Object.keys(fields).forEach(function (k) { doc[k] = fields[k]; });
        if (mentions && mentions.length) doc.mentions = mentions;
        if (rto) { doc.replyTo = rto; doc.threadRootId = payload.threadRootId || rto.id; }
        var rr = await skh.addDoc(skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'), doc);
        try {
            var convRef = skh.doc(skh.db, 'conversations', 'conv_group_' + gid);
            var cs2 = await skh.getDoc(convRef);
            var c2 = (cs2 && cs2.exists && cs2.exists()) ? (cs2.data() || {}) : {};
            var unread2 = c2.unread || {};
            (c2.participants || []).forEach(function (pu) { if (pu !== uid()) unread2[pu] = (unread2[pu] || 0) + 1; });
            await skh.updateDoc(convRef, { lastMessage: { text: prev, type: type, mentions: mentions || [] }, lastMessageAt: nowIso(), updatedAt: nowIso(), unread: unread2 });
        } catch (eU2) {}
        if (type === 'poll') { try { await logEvent(gid, 'poll_started', uid(), null, q2); } catch (ePE) {} }
        return { ok: true, id: rr && rr.id };
    };

    /* [§23] POLLS — kura: chagua MOJA, unaweza kubadilisha; canManage hupiga funga.
     * votes{ "idx": [uid...] } — haichomozi API yoyote; mkataba wazi. */
    window.skhGroupVotePoll = async function (gid, msgId, optionIdx) {
        if (!uid()) return null;
        var ms = await skh.getDoc(mRef(gid, uid()));
        if (!(ms && ms.exists && ms.exists() && ms.data().status === 'active')) return null;
        var ref = skh.doc(skh.db, 'conversations/conv_group_' + gid + '/messages', msgId);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return null;
        var m = snap.data() || {};
        if (m.type !== 'poll' || m.pollClosed) return null;
        var idx = Math.floor(+optionIdx);
        if (isNaN(idx) || idx < 0 || idx >= (m.options || []).length) return null;
        var votes = m.votes && typeof m.votes === 'object' ? m.votes : {};
        var mine = null;
        Object.keys(votes).forEach(function (k) { if (Array.isArray(votes[k]) && votes[k].indexOf(uid()) >= 0) mine = String(k); });
        if (mine === String(idx)) { // tap tena = ondoa kura yangu (honest toggle)
            votes[mine] = votes[mine].filter(function (u) { return u !== uid(); });
        } else {
            if (mine !== null) votes[mine] = (votes[mine] || []).filter(function (u) { return u !== uid(); });
            votes[String(idx)] = (votes[String(idx)] || []).concat([uid()]);
        }
        m.votes = votes;
        await skh.updateDoc(ref, { votes: votes });
        return { ok: true, votes: votes };
    };

    window.skhGroupClosePoll = async function (gid, msgId) {
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) { alert(tk('grp_no_perm', 'Huna ruhusa ya kutendewa hili (owner/admin tu).')); return null; }
        var ref = skh.doc(skh.db, 'conversations/conv_group_' + gid + '/messages', msgId);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return null;
        var m = snap.data() || {};
        if (m.type !== 'poll' || m.pollClosed) return null;
        await skh.updateDoc(ref, { pollClosed: true });
        await logEvent(gid, 'poll_closed', uid(), null, m.question || null);
        return { ok: true };
    };

    /* ---------------- [R26] REACTIONS (emoji toggle; real-time kwa msgs listener) ----------------
     * msg doc: reactions = { emoji: [uids] } — dedupe ya kweli (uid moja-emoji moja).
     * Hakuna unread bump — reactions SI ujumbe; listener ina-render pekee. */
    window.skhGroupToggleReaction = async function (gid, msgId, emoji) {
        var my = await window.skhGroupMyRole(gid);
        if (!my) return null;
        var e = String(emoji || '').trim();
        if (!e || e.length > 4) return null;
        var ref = skh.doc(skh.db, 'conversations/conv_group_' + gid + '/messages', msgId);
        var ms = await skh.getDoc(ref);
        if (!(ms && ms.exists && ms.exists())) return null;
        var m = ms.data() || {};
        var rxn = m.reactions && typeof m.reactions === 'object' ? m.reactions : {};
        rxn[e] = Array.isArray(rxn[e]) ? rxn[e] : [];
        var i = rxn[e].indexOf(uid());
        if (i >= 0) rxn[e].splice(i, 1); else rxn[e].push(uid());
        if (!rxn[e].length) delete rxn[e];
        await skh.updateDoc(ref, { reactions: rxn });
        return { reactions: rxn };
    };

    /* ---------------- [R25] GROUP AVATAR (emoji ya alama ya kikundi) ----------------
     * Haipakii picha kwa sasa (storage): alama ni emoji HALISI iliyohifadhiwa
     * group doc + conv doc (row ya unified list + header hutumia moja). */
    window.skhGroupSetAvatar = async function (gid, emoji) {
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) { alert(tk('grp_no_perm', 'Huna ruhusa ya kutendewa hili (owner/admin tu).')); return null; }
        var e = String(emoji || '').trim();
        if (!e || e.length > 4) return null;
        var gs2 = await skh.getDoc(gRef(gid));
        if (!(gs2 && gs2.exists && gs2.exists())) return null;
        var g2 = gs2.data() || {};
        g2.avatar = e; g2.updatedAt = nowIso();
        await skh.updateDoc(gRef(gid), g2);
        try { await skh.updateDoc(skh.doc(skh.db, 'conversations', 'conv_group_' + gid), { avatar: e, updatedAt: nowIso() }); } catch (eA2) {}
        await logEvent(gid, 'avatar_changed', uid(), null, e);
        return e;
    };

    /* [§9 SPEC PHASE 2] ANNOUNCEMENT — admins wanapin tangazo (si ujumbe wa kawaida:
     * linahifadhiwa group doc + conv copy ya live card; event log). Tangazo LAZIMA
     * liwe text 1..500 chars; '' hu-on-pin. */
    /* ================= [SPEC PHASE 4 §14/§15/§45] GROUP ORDER — CREATE =================
     * GROUP ORDER NI mechanism ya ununuzi wa pamoja (SI ujumbe wa kawaida):
     * doc la kweli chatGroups/{gid}/groupOrders + REFERENCE card ndani ya chat.
     * States §45 explicit: OPEN → NEAR_TARGET → TARGET_REACHED → CLOSED →
     * PROCESSING → COMPLETED (au CANCELLED) — transitions zinakuja PHASE 5/6. */
    var GSG_GO_STATES = ['DRAFT', 'OPEN', 'NEAR_TARGET', 'TARGET_REACHED', 'CLOSED', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
    var GSG_GO_DELIVERY = ['individual', 'shared'];
    window.__GSG_GO_STATES = GSG_GO_STATES;

    window.skhGroupOrderCreate = async function (gid, cfg) {
        cfg = cfg || {};
        if (!uid()) return { ok: false, reason: 'auth' };
        var gs = await skh.getDoc(gRef(gid));
        if (!(gs && gs.exists && gs.exists())) return { ok: false, reason: 'not_found' };
        var g = gs.data() || {};
        if (g.status !== 'ACTIVE') return { ok: false, reason: 'archived' };
        // [§14] commerce action ya MWANACHAMA — member yukua active (HAMA-aday: sendPolicy ya chat haitatesi commerce)
        var ms = await skh.getDoc(mRef(gid, uid()));
        if (!(ms && ms.exists && ms.exists() && ms.data().status === 'active')) return { ok: false, reason: 'not_member' };
        if (!canOrganize(ms.data().role)) return { ok: false, reason: 'perm' };     // [§27] create/manage ni organizer-permission (member hujiunga tu)
        // ---- validation (server-side style guards §46; UI hide ni msaada tu) ----
        var productName = cln(cfg.productName, 80);
        if (productName.length < 3) return { ok: false, reason: 'productName' };
        var targetQty = Math.floor(+cfg.targetQty);
        if (!(targetQty >= 2 && targetQty <= 100000)) return { ok: false, reason: 'targetQty' };
        var myQty = Math.floor(+cfg.myQty);
        if (!(myQty >= 1 && myQty <= targetQty)) return { ok: false, reason: 'myQty' };
        // [FULL-SPEC PHASE 3 §11] minQty (=order haiendeshi chini yake) / maxQty (seller cap wa juu kabisa)
        var minQty = Math.floor(+cfg.minQty) || targetQty;
        if (!(minQty >= 1 && minQty <= targetQty)) return { ok: false, reason: 'minQty' };
        var maxQty = Math.floor(+cfg.maxQty) || targetQty * 10;
        if (!(maxQty >= targetQty && maxQty <= 1000000)) return { ok: false, reason: 'maxQty' };
        // [§68] deadlines tofauti: joining (deadline) + payment (default siku 3 baada ya joining)
        var paymentDeadline = cln(cfg.paymentDeadline, 24);
        if (paymentDeadline && !/^\d{4}-\d{2}-\d{2}/.test(paymentDeadline)) return { ok: false, reason: 'paymentDeadline' };
        // default hukokotwa BAADA ya deadline validation (hz. undefined hoisting) — angalia chini
        // [§9] OPTIONAL product snapshot passthrough (wizard-full PHASE 4 atachagua product halisi)
        var productSnapshot = null;
        if (cfg.productSnapshot && typeof cfg.productSnapshot === 'object') {
            productSnapshot = { productId: cln(cfg.productSnapshot.productId, 60) || null, sellerId: cln(cfg.productSnapshot.sellerId, 60) || null, name: cln(cfg.productSnapshot.name || productName, 80), image: cln(cfg.productSnapshot.image, 300) || null, variant: cln(cfg.productSnapshot.variant, 40) || null, price: +cfg.productSnapshot.price || targetPrice, takenAt: nowIso() };
        }
        var targetPrice = +String(cfg.targetPrice).replace(/[,\s]/g, '');
        if (!(targetPrice > 0 && targetPrice <= 1e9)) return { ok: false, reason: 'targetPrice' };
        var deadline = cln(cfg.deadline, 24);
        if (!/^\d{4}-\d{2}-\d{2}/.test(deadline) || String(deadline).slice(0, 10) < new Date().toISOString().slice(0, 10)) return { ok: false, reason: 'deadline' };
        var deliveryMethod = String(cfg.deliveryMethod || '');
        if (GSG_GO_DELIVERY.indexOf(deliveryMethod) < 0) return { ok: false, reason: 'deliveryMethod' };
        var deliveryArea = cln(cfg.deliveryArea, 80);
        if (!deliveryArea) return { ok: false, reason: 'deliveryArea' };
        if (!paymentDeadline && deadline) { var ddt = new Date(deadline.slice(0, 10) + 'T12:00:00Z'); ddt.setUTCDate(ddt.getUTCDate() + 3); paymentDeadline = ddt.toISOString().slice(0, 10); } // [§68] default = joining + 3d
        var supplierMode = cfg.supplierMode === 'named' ? 'named' : 'request_offers';
        var supplierName = cln(cfg.supplierName, 60);
        if (supplierMode === 'named' && !supplierName) return { ok: false, reason: 'supplierName' };
        if (String(cfg.description || '').length > 300) return { ok: false, reason: 'description' };
        var description = cln(cfg.description, 300);
        var doc = {
            type: 'GROUP_ORDER', status: 'OPEN',                      // §45: create → OPEN
            productName: productName,
            targetQty: targetQty, minQty: minQty, maxQty: maxQty, totalQty: myQty, participantCount: 1,
            paymentDeadline: paymentDeadline || null, agreementVersion: 'V1', productSnapshot: productSnapshot,
            targetPrice: targetPrice, unit: cln(cfg.unit, 20) || null,    // kipimo (gunia/kilo), hakuna currency gigez---bei ni TZS
            currency: 'TZS',
            deadline: deadline, deliveryArea: deliveryArea, deliveryMethod: deliveryMethod,
            supplierMode: supplierMode,
            supplierName: supplierMode === 'named' ? supplierName : null,
            description: description || null,
            organizerId: uid(), organizerName: myNameG(),             // [§26/27] ORGANIZER data-ready (role babubu: Phase 6)
            participants: (function () { var o = {}; o[uid()] = { qty: myQty, joinedAt: nowIso(), state: 'JOINED' }; return o; })(),  // [§19-20] creator's myQty THAMANI halisi
            priceTiers: [], supplierOffers: {}, offersCount: 0,        // [§16/17/24] Phase 5/6 — supplierOffers ni MAP (dedupe kwa uid), sio array
            createdAt: nowIso(), updatedAt: nowIso()
        };
        var rr = await skh.addDoc(skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders'), doc);
        var goid = rr && rr.id;
        await logEvent(gid, 'group_order_created', uid(), null, productName, goid);
        try { await syncConvGoHead(gid); } catch (eGH1) {}
        // ---- [§15] LIVE REFERENCE CARD ndani ya chat (msg type 'group_order') ----
        try {
            await skh.addDoc(skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'), {
                senderUid: uid(), senderName: myNameG(), at: nowIso(), type: 'group_order',
                gorderId: goid,
                snapshot: { productName: productName, targetQty: targetQty, totalQty: myQty, targetPrice: targetPrice, deadline: deadline, deliveryMethod: deliveryMethod, status: 'OPEN' }
            });
            var cs2 = await skh.getDoc(skh.doc(skh.db, 'conversations', 'conv_group_' + gid));
            var c2 = (cs2 && cs2.exists && cs2.exists()) ? (cs2.data() || {}) : {};
            var unread2 = c2.unread || {};
            (c2.participants || []).forEach(function (pu) { if (pu !== uid()) unread2[pu] = (unread2[pu] || 0) + 1; });
            await skh.updateDoc(skh.doc(skh.db, 'conversations', 'conv_group_' + gid), { lastMessage: { text: '\u{1F4E6} Group Order: ' + productName, type: 'group_order', mentions: [] }, lastMessageAt: nowIso(), updatedAt: nowIso(), unread: unread2 });
        } catch (eGO2) {}
        return { ok: true, id: goid };
    };

    window.skhGroupOrderGet = async function (gid, goid) {
        var s2 = await skh.getDoc(skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders', goid));
        return (s2 && s2.exists && s2.exists()) ? s2.data() : null;
    };

    /* ================= [SPEC PHASE 5 §18/§19/§36/§37] INTEREST + JOIN + STATES =================
     * INTEREST = tally ya "ninavutiwa" (§18) — SI ujumbe wala commitment.
     * JOIN = modal ya commit ya kiasi (§19) — state 'COMMITTED'; JOIN ≠ PAY
     * (hakuna malipo hatua hii; malipo ni PHASE 7+). NEAR_TARGET = bado ≤25%;
     * TARGET_REACHED = totalQty ≥ targetQty (spec §36 sample 87/100 → 13 needed). */
    function goRef(gid, goid) { return skh.doc(skh.db, 'chatGroups/' + gid + '/groupOrders', goid); }
    async function goActiveMember(gid) {
        if (!uid()) return null;
        var ms = await skh.getDoc(mRef(gid, uid()));
        return (ms && ms.exists && ms.exists() && ms.data().status === 'active') ? ms.data() : null;
    }
    /* [§16/17] PRICE TIERS: mkataba wa tiers kwenye doc (sorted ascending by minQty).
     * goTierIdx: idx ya tier ya sasa kutokana na totalQty (-1 = bei ya msingi targetPrice). */
    function goTierIdx(d) {
        var ts = Array.isArray(d.priceTiers) ? d.priceTiers : [];
        var idx = -1;
        for (var i = 0; i < ts.length; i++) { var mq = +((ts[i] && ts[i].minQty) || 0); if (mq > 0 && (+d.totalQty || 0) >= mq) idx = i; }
        return idx;
    }
    /* Implementation MOJA kwa engine + UI (§43): kurudisha {idx, price, next, needed} bila recompute. */
    window.skhTierInfo = function (d) {
        if (!d) return { idx: -1, price: 0, next: null, needed: 0 };
        var ts = Array.isArray(d.priceTiers) ? d.priceTiers : [];
        var idx = goTierIdx(d);
        var price = idx >= 0 ? (+ts[idx].price || 0) : (+d.targetPrice || 0);
        var next = null, needed = 0;
        for (var i = idx + 1; i < ts.length; i++) { var mq = +((ts[i] && ts[i].minQty) || 0); if (mq > (+d.totalQty || 0)) { next = ts[i]; needed = mq - (+d.totalQty || 0); break; } }
        return { idx: idx, price: price, next: next, needed: needed };
    };
    function goRecompute(d) {
        // totals + status (transitions haitabaki state baada ya CLOSED/PROCESSING/COMPLETED/CANCELLED)
        var tot = 0, n = 0;
        Object.keys(d.participants || {}).forEach(function (pu) { var q = +((d.participants || {})[pu].qty) || 0; if (q > 0) { tot += q; n++; } });
        d.totalQty = tot; d.participantCount = n;
        var locked = ['CLOSED', 'PROCESSING', 'COMPLETED', 'CANCELLED'].indexOf(String(d.status)) >= 0;
        if (!locked) {
            var prev = d.status;
            if (tot >= (+d.targetQty || 1)) d.status = 'TARGET_REACHED';
            else if (tot >= Math.ceil((+d.targetQty || 1) * 0.75)) d.status = 'NEAR_TARGET';
            else d.status = 'OPEN';
            d.__statusChanged = (prev !== d.status) ? { from: prev, to: d.status } : null;
        } else d.__statusChanged = null;
        // [§16/17] tier unlock kwenye mabadilko ya totalQty (up-only; unjoin downgrade si "unlock")
        var newTier = goTierIdx(d);
        d.__tierChanged = window.skhTierInfo(d).price !== d.__previousTierPrice ? { from: d.tierIdx, to: newTier, price: window.skhTierInfo(d).price } : (newTier !== (typeof d.tierIdx === 'number' ? d.tierIdx : -1) ? { from: d.tierIdx, to: newTier, price: window.skhTierInfo(d).price } : null);
        d.__previousTierPrice = window.skhTierInfo(d).price;
        d.tierIdx = newTier;
        return d;
    }

    window.skhGroupOrderInterest = async function (gid, goid) {
        var mem = await goActiveMember(gid); if (!mem) return null;
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return null;
        var d = snap.data() || {};
        if (String(d.status) !== 'OPEN') return null;              // interest ikiwa OPEN tu — si CLOSED+
        d.interested = (d.interested && typeof d.interested === 'object') ? d.interested : {};
        var had = !!d.interested[uid()];
        if (had) delete d.interested[uid()]; else d.interested[uid()] = nowIso();
        d.interestedCount = Object.keys(d.interested).length;
        d.updatedAt = nowIso();
        await skh.updateDoc(ref, { interested: d.interested, interestedCount: d.interestedCount, updatedAt: d.updatedAt });
        return { ok: true, interested: !had, count: d.interestedCount };
    };

    window.skhGroupOrderJoin = async function (gid, goid, qtyIn, extraIn) {
        var mem = await goActiveMember(gid); if (!mem) return { ok: false, reason: 'not_member' };
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
        var d = snap.data() || {};
        if (String(d.status) !== 'OPEN' && String(d.status) !== 'NEAR_TARGET') return { ok: false, reason: 'state' };   // [§45]
        var qty = Math.floor(+qtyIn);
        if (!(qty >= 1 && qty <= (+d.targetQty || 1) * 10)) return { ok: false, reason: 'qty' };
        // [FULL §11] maximum cap — oversell haikubaliki hata kwa 1
        var prevQ = (d.participants && d.participants[uid()]) ? (+d.participants[uid()].qty || 0) : 0;
        if (d.maxQty && ((+d.totalQty || 0) - prevQ + qty) > +d.maxQty) return { ok: false, reason: 'max_reached', maxQty: +d.maxQty };
        d.participants = (d.participants && typeof d.participants === 'object') ? d.participants : {};
        var prevExists = !!d.participants[uid()];
        // [FULL §17] participant record: qty + variant + destination + deliveryMethod + contact (snapshot ziwekezwe kwa PHASE 6)
        var extra = (extraIn && typeof extraIn === 'object') ? extraIn : {};
        var prevP = prevExists ? d.participants[uid()] : {};
        d.participants[uid()] = {
            qty: qty, state: 'COMMITTED',
            joinedAt: prevP.joinedAt || nowIso(), updatedAt: nowIso(),
            variant: cln(extra.variant, 40) || prevP.variant || null,
            destination: cln(extra.destination, 80) || prevP.destination || null,
            deliveryMethod: cln(extra.deliveryMethod, 20) || prevP.deliveryMethod || null,
            contact: cln(extra.contact, 40) || prevP.contact || null
        };
        d = goRecompute(d);
        // [§36] DEADLINE kuvuka: ruhusu ku-join KABLA — baki OPEN/NEAR; baada si-charge, CLOSE
        var pastDeadline = String(d.deadline || '').slice(0, 10) < nowIso().slice(0, 10);
        if (pastDeadline) { d.status = 'CLOSED'; d.closedReason = 'deadline'; }
        d.updatedAt = nowIso();
        await skh.updateDoc(ref, { participants: d.participants, totalQty: d.totalQty, participantCount: d.participantCount, status: d.status, tierIdx: d.tierIdx, __previousTierPrice: d.__previousTierPrice, closedReason: d.closedReason || null, updatedAt: d.updatedAt });
        if (d.__statusChanged) await logEvent(gid, 'go_' + String(d.__statusChanged.to).toLowerCase(), uid(), null, String(qty), goid);
        if (d.__tierChanged && d.__tierChanged.to > (d.__tierChanged.from || -1)) await logEvent(gid, 'go_price_unlocked', uid(), null, 'TZS ' + d.__tierChanged.price, goid);   // [§17]
        if (pastDeadline) await logEvent(gid, 'go_closed_deadline', uid(), null, null, goid);
        try { await syncConvGoHead(gid); } catch (eGH2) {}
        return { ok: true, totalQty: d.totalQty, participantCount: d.participantCount, status: d.status, changed: d.__statusChanged, closed: pastDeadline };
    };

    window.skhGroupOrderUnjoin = async function (gid, goid) {
        var mem = await goActiveMember(gid); if (!mem) return { ok: false, reason: 'not_member' };
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
        var d = snap.data() || {};
        // [§36/§45] TARGET_REACHED hadi mbele (CLOSED/PROCESSING...) — ahadi zimefungwa; kubadili
        // ruhusiwa tu kabla ya target kutimia (OPEN au NEAR_TARGET).
        if (['TARGET_REACHED', 'CLOSED', 'PROCESSING', 'COMPLETED', 'CANCELLED'].indexOf(String(d.status)) >= 0) return { ok: false, reason: 'state' };
        d.participants = (d.participants && typeof d.participants === 'object') ? d.participants : {};
        if (!d.participants[uid()]) return { ok: false, reason: 'not_joined' };
        delete d.participants[uid()];
        d = goRecompute(d);
        d.updatedAt = nowIso();
        await skh.updateDoc(ref, { participants: d.participants, totalQty: d.totalQty, participantCount: d.participantCount, status: d.status, tierIdx: d.tierIdx, __previousTierPrice: d.__previousTierPrice, updatedAt: d.updatedAt });
        await logEvent(gid, 'go_participant_left', uid(), null, null, goid);
        try { await syncConvGoHead(gid); } catch (eGH3) {}
        return { ok: true, totalQty: d.totalQty, status: d.status, changed: d.__statusChanged };
    };

    /* [§36] Mwisho wa muda: UI iweze check-and-close (org-side rules — NOT silently charge). */
    window.skhGroupOrderCheckDeadline = async function (gid, goid) {
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return null;
        var d = snap.data() || {};
        var open = ['OPEN', 'NEAR_TARGET', 'TARGET_REACHED'].indexOf(String(d.status)) >= 0;
        if (!open) return { ok: true, status: d.status, closedNow: false };
        var past = String(d.deadline || '').slice(0, 10) && String(d.deadline || '').slice(0, 10) < nowIso().slice(0, 10);
        if (!past) return { ok: true, status: d.status, closedNow: false };
        d.status = 'CLOSED'; d.closedReason = 'deadline'; d.updatedAt = nowIso();
        await skh.updateDoc(ref, { status: 'CLOSED', closedReason: 'deadline', updatedAt: d.updatedAt });
        await logEvent(gid, 'go_closed_deadline', uid() || null, null, null, goid);
        if ((+d.totalQty || 0) >= (+d.targetQty || 1)) {
            try { var sp2 = await window.skhGroupOrderSpawnChildren(gid, goid); if (sp2 && sp2.ok && sp2.spawned) return { ok: true, status: 'PROCESSING', closedNow: true, spawned: sp2.spawned }; } catch (eSP2) { console.warn('[go-spawn-dl]', eSP2); }
        }
        return { ok: true, status: 'CLOSED', closedNow: true };
    };

    window.skhGroupOrderClose = async function (gid, goid, reason) {
        var my = await window.skhGroupMyRole(gid);
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return null;
        var d = snap.data() || {};
        var isOrg = (d.organizerId && d.organizerId === uid());
        if (!(isOrg || canOrganize(my))) return null;               // [§46/§27] organizer/admin/organizer-role tu
        if (['CLOSED', 'COMPLETED', 'CANCELLED', 'PROCESSING'].indexOf(String(d.status)) >= 0) return null;   // [§45/§28] PROCESSING ime-shushiwa — re-close ni null
        d.status = (reason === 'cancelled') ? 'CANCELLED' : 'CLOSED';
        d.closedReason = reason || 'organizer';
        d.updatedAt = nowIso();
        await skh.updateDoc(ref, { status: d.status, closedReason: d.closedReason, updatedAt: d.updatedAt });
        await logEvent(gid, 'go_closed_' + d.closedReason, uid(), null, null, goid);
        if (d.status !== 'CANCELLED' && (+d.totalQty || 0) >= (+d.targetQty || 1) && !d.childOrdersSpawned) {
            try { await window.skhGroupOrderSpawnChildren(gid, goid); } catch (eSP) { console.warn('[go-spawn]', eSP); }
        }
        try { await syncConvGoHead(gid); } catch (eGH4) {}
        var cur2 = d.status;
        try { var rs2 = await skh.getDoc(ref); cur2 = (rs2 && rs2.exists && rs2.exists()) ? (rs2.data().status || d.status) : d.status; } catch (eR2) {}
        return { ok: true, status: cur2 };
    };

    /* ================= [SPEC PHASE 7 §26/§27] ORGANIZER PANEL FEED + VERIFIED BUSINESS ================= */
    /* [§26] Shughuli za order moja — kwa organizer panel (read-only kila mtu anaweza kuona feed ya order) */
    window.skhGroupEventsList = async function (gid, goid, lim) {
        var mem = await goActiveMember(gid); if (!mem) return [];
        var ev = await skh.getDocs(skh.collection(skh.db, 'chatGroups/' + gid + '/events'));
        var rows = ev ? ev.docs.map(function (e2) { var d2 = e2.data() || {}; d2.__id = e2.id; return d2; }) : [];
        rows = rows.filter(function (e2) {   // [§26] go_* events + creation event (group_order_created) za order hiyohiyo — lifecycle kamili
            var tp = String(e2.type || '');
            var isGo = tp.indexOf('go_') === 0 || tp === 'group_order_created';
            return isGo && (!goid || e2.goid === goid);
        });
        rows.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
        return rows.slice(0, Math.max(1, Math.min(20, +lim || 8)));
    };
    window.skhGroupSetVerifiedBusiness = async function (gid, targetUid, flag) {   // [§27] +optional Verified Business badge
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) return { ok: false, reason: 'perm' };
        var msnap = await skh.getDoc(mRef(gid, targetUid));
        if (!msnap || !msnap.exists()) return { ok: false, reason: 'not_found' };
        var mem = msnap.data();
        mem.verifiedBusiness = !!flag;
        await skh.setDoc(mRef(gid, targetUid), mem);
        await logEvent(gid, flag ? 'verified_business' : 'unverified_business', uid(), targetUid, null);
        return { ok: true };
    };

    /* ================= [FULL-SPEC PHASE 3 §7] CANONICAL GO STATE ENUMS =================
     * Legacy wire strings (OPEN/NEAR_TARGET/TARGET_REACHED/PROCESSING/CLOSED/CANCELLED/COMPLETED)
     * ZINABAKI; hii ndiyo canonical vocabulary ya spec mpya (phases mpya hutumia fields mpya). */
    var GO_STATUS = {
        DRAFT: 'DRAFT', CONFIGURING: 'CONFIGURING', PUBLISHED: 'PUBLISHED',
        OPEN: 'OPEN', INTEREST_PHASE: 'INTEREST_PHASE', JOINING: 'JOINING',
        TARGET_REACHED: 'TARGET_REACHED', AGREEMENT_PENDING: 'AGREEMENT_PENDING',
        PAYMENT_OPEN: 'PAYMENT_OPEN', PAYMENT_COLLECTING: 'PAYMENT_COLLECTING',
        PAYMENT_TARGET_REACHED: 'PAYMENT_TARGET_REACHED', FULFILLMENT_REQUESTED: 'FULFILLMENT_REQUESTED',
        SELLER_PROCESSING: 'SELLER_PROCESSING', READY_FOR_ALLOCATION: 'READY_FOR_ALLOCATION',
        ALLOCATING: 'ALLOCATING', ALLOCATED: 'ALLOCATED', DISTRIBUTION_READY: 'DISTRIBUTION_READY',
        IN_TRANSIT: 'IN_TRANSIT', DELIVERED: 'DELIVERED', AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
        PARTIALLY_CONFIRMED: 'PARTIALLY_CONFIRMED', COMPLETED: 'COMPLETED',
        CANCELLED: 'CANCELLED', EXPIRED: 'EXPIRED', PAYMENT_FAILED: 'PAYMENT_FAILED',
        SELLER_UNABLE_TO_FULFILL: 'SELLER_UNABLE_TO_FULFILL', PARTIALLY_FULFILLED: 'PARTIALLY_FULFILLED',
        DISPUTED: 'DISPUTED', REFUND_PENDING: 'REFUND_PENDING', REFUNDED: 'REFUNDED',
        NEAR_TARGET: 'NEAR_TARGET', PROCESSING: 'PROCESSING', CLOSED: 'CLOSED',
        P_UNPAID: 'UNPAID', P_PAYMENT_PENDING: 'PAYMENT_PENDING', P_PAID: 'PAID',
        P_PAYMENT_FAILED: 'P_PAYMENT_FAILED', P_REFUND_PENDING: 'REFUND_PENDING', P_REFUNDED: 'REFUNDED',
        D_READY: 'READY', D_PICKUP_PENDING: 'PICKUP_PENDING', D_PICKED_UP: 'PICKED_UP',
        D_IN_TRANSIT: 'IN_TRANSIT', D_ARRIVED: 'ARRIVED', D_OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
        D_DELIVERED: 'DELIVERED', D_AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
        D_CONFIRMED: 'CONFIRMED', D_AUTO_RELEASED: 'AUTO_RELEASED', D_DISPUTED: 'DISPUTED'
    };
    window.SKH_GO_STATUS = Object.freeze(GO_STATUS);
    window.skhGOPhaseOf = function (o) {
        var d = o || {}, st = String(d.status || '');
        if (st === 'CANCELLED') return GO_STATUS.CANCELLED;
        if (st === 'PROCESSING') return GO_STATUS.PAYMENT_COLLECTING;
        if (st === 'OPEN' || st === 'NEAR_TARGET') return GO_STATUS.JOINING;
        if (st === 'TARGET_REACHED') return GO_STATUS.TARGET_REACHED;
        if (st === 'CLOSED') { return ((+d.totalQty || 0) >= (+d.targetQty || 1)) ? GO_STATUS.PAYMENT_COLLECTING : GO_STATUS.EXPIRED; }
        if (st === 'COMPLETED') return GO_STATUS.COMPLETED;
        return st;
    };
    /* [FULL-SPEC PHASE 2 §4] chat-list commerce status — conv.goHead snippet (NO N+1 kwa inbox). */
    async function syncConvGoHead(gid) {
        if (!gid) return;
        try {
            var q0 = skh.query(skh.collection(skh.db, 'chatGroups/' + gid + '/groupOrders'), skh.limit(60));
            var sn = await skh.getDocs(q0);
            var best = null, pri = { OPEN: 1, NEAR_TARGET: 2, TARGET_REACHED: 3, PROCESSING: 4 };
            sn.forEach(function (dx) {
                var g = dx.data() || {}; g.__id = dx.id;
                var p = pri[String(g.status)] || 0;
                if (!p) return;
                if (!best || p > pri[String(best.status)] || (p === pri[String(best.status)] && String(g.updatedAt || '') > String(best.updatedAt || ''))) best = g;
            });
            var ref = skh.doc(skh.db, 'conversations', 'conv_group_' + gid);
            var cv = await skh.getDoc(ref);
            if (!(cv && cv.exists && cv.exists())) return;
            var head = best ? { goid: best.__id, productName: best.productName || '', totalQty: +best.totalQty || 0, targetQty: +best.targetQty || 0, status: String(best.status) } : null;
            await skh.updateDoc(ref, { goHead: head });
        } catch (eH) {}
    }
    window.skhGroupSyncGoHead = syncConvGoHead;

    /* ================= [SPEC PHASE 7b §28/§31/§33/§36] PARENT GO-x → CHILD SH-2xx =================
     * Kufunga kwa mafanikio: kila mshiriki anapata ODA yake INDIVIDUAL SH-2xx chini ya GO-x.
     * HAKUNA chaji isiyotangazwa: orders huundwa PAYMENT_PENDING (§36). */
    function goShortCode(goid) {
        var s = String(goid || 'x'), h = 0;
        for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
        if (!h) h = 47;
        var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
        for (var k = 0; k < 4; k++) { out = A[h % A.length] + out; h = Math.floor(h / A.length) || ((h * 31 + 7) >>> 0); }
        return out;
    }
    window.skhGOParentCode = function (goid) { return 'GO-' + goShortCode(goid); };
    window.skhGroupOrderSpawnChildren = async function (gid, goid) {
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
        var d = snap.data() || {};
        if (d.childOrdersSpawned) return { ok: true, already: true, count: (d.childOrderIds || []).length };
        if (d.status === 'CANCELLED' || d.closedReason === 'cancelled') return { ok: false, reason: 'cancelled' };
        var tot = +d.totalQty || 0, tgt = +d.targetQty || 1;
        if (tot < tgt) return { ok: false, reason: 'below_target' };
        var pcs = d.participants || {};
        var uids2 = Object.keys(pcs).filter(function (u) {
            return pcs[u] && (+pcs[u].qty || 0) > 0 && ['JOINED', 'COMMITTED', 'CONFIRMED'].indexOf(String(pcs[u].state || 'JOINED')) >= 0;
        });
        if (!uids2.length) return { ok: false, reason: 'no_participants' };
        var parentCode = d.parentCode || ('GO-' + goShortCode(goid));
        var price = +d.targetPrice || 0;
        try { var ti = window.skhTierInfo && window.skhTierInfo(d); if (ti && (+ti.price || 0) > 0) price = +ti.price; } catch (eTP) {}
        var sel = (d.selectedOffer && typeof d.selectedOffer === 'object') ? d.selectedOffer : null;
        var sellerUid = (sel && sel.supplierUid) || null;
        var sellerName = (sel && sel.supplierName) || d.supplierName || null;
        var snapInfo = d.productSnapshot || null;
        var ids = [], seq = 0;
        for (var i = 0; i < uids2.length; i++) {
            var pu = uids2[i], part = pcs[pu] || {}, qty = +part.qty || 0;
            seq++;
            var bName = pu;
            try { var us = await skh.getDoc(skh.doc(skh.db, 'users', pu)); if (us && us.exists && us.exists()) bName = us.data().fullName || us.data().displayName || bName; } catch (eBN) {}
            var humanId = 'SH-2' + String(seq).padStart(3, '0');
            var amount = Math.round(qty * price);
            var oRef = await skh.addDoc(skh.collection(skh.db, 'orders'), {
                kind: 'GROUP_CHILD_ORDER', source: 'GROUP_ORDER',
                orderId: humanId, humanId: humanId,
                parentCode: parentCode, parentGoid: goid, groupId: gid,
                buyerId: pu, buyerName: bName,
                sellerId: sellerUid, sellerName: sellerName,
                itemTitle: (d.productName || 'Bidhaa') + ' ×' + qty + (d.unit ? (' ' + d.unit) : ''),
                productTitle: d.productName || '', qty: qty, unit: d.unit || null,
                variant: part.variant || null, destination: part.destination || null,
                unitPrice: price, totalPrice: amount, amount: amount, currency: 'TZS',
                status: 'payment_pending', paymentStatus: 'pending', escrowStatus: 'pending',
                timeline: { placedAt: nowIso() },
                delivery: { method: part.deliveryMethod || d.deliveryMethod || 'individual', area: part.destination || d.deliveryArea || '', shared: (part.deliveryMethod || d.deliveryMethod) === 'shared' },
                deliveryRequired: false,
                groupOrder: { gid: gid, goid: goid, parentCode: parentCode, deadline: d.deadline || null, paymentDeadline: d.paymentDeadline || null, agreementVersion: d.agreementVersion || 'V1' },
                productSnapshot: snapInfo,
                participants: [{ uid: pu, qty: qty }],
                amountPaid: 0,
                createdAt: nowIso(), updatedAt: nowIso()
            });
            ids.push(oRef.id);
        }
        await skh.updateDoc(ref, {
            parentCode: parentCode, childOrdersSpawned: true, childOrderIds: ids,
            childOrderCount: ids.length, status: 'PROCESSING', updatedAt: nowIso()
        });
        await logEvent(gid, 'go_child_orders_spawned', uid() || null, null, ids.length, goid);
        try { await syncConvGoHead(gid); } catch (eGH) {}
        try {
            var lastIdx = String(ids.length).padStart(3, '0');
            var meta = { count: ids.length, parentCode: parentCode, firstId: 'SH-2001', lastId: 'SH-2' + lastIdx, goid: goid, productName: d.productName || '', totalQty: tot, price: price };
            await skh.addDoc(skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'), {
                senderUid: 'sys', senderName: 'SokoHai', type: 'order_spawn',
                text: '✅ Lengo limetimia — Oda ' + ids.length + ' (SH-2001 → SH-2' + lastIdx + ') chini ya ' + parentCode + ' zimeundwa',
                spawn: meta, at: nowIso(), clientId: 'sysspawn_' + goid
            });
            var convRef = skh.doc(skh.db, 'conversations', 'conv_group_' + gid);
            var cv = await skh.getDoc(convRef);
            if (cv && cv.exists && cv.exists()) {
                var cv0 = cv.data() || {}, unread2 = Object.assign({}, cv0.unread || {});
                (cv0.participants || []).forEach(function (ux) { if (ux !== uid()) unread2[ux] = (unread2[ux] || 0) + 1; });
                if (!Object.keys(unread2).length) Object.keys(pcs).forEach(function (ux) { if (ux !== uid()) unread2[ux] = (unread2[ux] || 0) + 1; });
                await skh.updateDoc(convRef, {
                    lastMessage: { text: '✅ Lengo limetimia — Oda ' + ids.length + ' zimeundwa', type: 'order_spawn', mentions: [] },
                    lastMessageAt: nowIso(), updatedAt: nowIso(), unread: unread2
                });
            }
        } catch (eSM) {}
        if (sellerUid) {
            try { await skh.addDoc(skh.collection(skh.db, 'seller_order_inbox'), {
                sellerId: sellerUid, orderId: parentCode, kind: 'group_parent_inbox', groupId: gid, parentGoid: goid,
                childOrderIds: ids, paymentStatus: 'pending', escrowStatus: 'pending',
                items: [{ title: d.productName || '', price: price, qty: tot }], createdAt: nowIso(), status: 'new_order'
            }); } catch (eSI) {}
        }
        return { ok: true, spawned: ids.length, orderIds: ids, parentCode: parentCode };
    };
    window.skhGroupOrderChildList = async function (gid, goid) {
        var mem = await goActiveMember(gid); if (!mem) return null;
        var y = await window.skhGroupOrderGet(gid, goid);
        if (!y) return null;
        var ids = y.childOrderIds || [];
        var rows = [], mine = null;
        for (var i = 0; i < ids.length; i++) {
            try {
                var os = await skh.getDoc(skh.doc(skh.db, 'orders', ids[i]));
                if (os && os.exists && os.exists()) { var od = os.data(); od.__id = os.id; rows.push(od); if (od.buyerId === uid() || od.sellerId === uid() || od.transporterId === uid()) mine = od; }   // [§29] wahusika wote wanaona 'ODA YAKO'
            } catch (eOL) {}
        }
        var myRole = await window.skhGroupMyRole(gid);
        var isOrg = (y.organizerId && y.organizerId === uid()) || canOrganize(myRole);
        return { parentCode: y.parentCode || null, count: ids.length, mine: mine, all: isOrg ? rows : null, state: y.status };
    };

    /* ================= [SPEC PHASE 8 §29–§36/§38] CHILD ORDER WORKSPACE: LIFECYCLE + ESCROW =================
     * payment_pending → secured → confirmed → ready → in_transit → delivered → completed; reject→refunded.
     * ESCROW: walletBalance + wallet_ledger (idempotent). §36: hakuna chaji isiyotangazwa. */
    var GCO_FEE = 0.015;
    async function gcoWalletAdd(uid2, delta, kind, orderDocId, note, meta) {
        if (!uid2) return { ok: false, reason: 'no_uid' };
        try {
            var q = skh.query(skh.collection(skh.db, 'wallet_ledger'), skh.where('kind', '==', kind), skh.where('orderDocId', '==', orderDocId), skh.where('uid', '==', uid2), skh.limit(1));
            var qy = await skh.getDocs(q);
            if (!qy.empty) return { ok: true, already: true };
        } catch (eQ0) {}
        var uref = skh.doc(skh.db, 'users', uid2);
        var us = null;
        try { us = await skh.getDoc(uref); } catch (eU) {}
        var before = (us && us.exists && us.exists()) ? (+us.data().walletBalance || 0) : 0;
        var after = before + (+delta);
        try { await skh.updateDoc(uref, { walletBalance: after }); }
        catch (eU2) { try { await skh.setDoc(uref, { walletBalance: after }, { merge: true }); } catch (eS2) {} }
        try { if (uid2 === uid()) window.skh.currentUserData = Object.assign({}, window.skh.currentUserData || {}, { walletBalance: after }); } catch (eSC) {}
        try {
            await skh.addDoc(skh.collection(skh.db, 'wallet_ledger'), {
                kind: kind, uid: uid2, orderDocId: orderDocId, delta: (+delta),
                before: before, after: after, note: note || null, meta: meta || null, at: nowIso()
            });
        } catch (eL2) {}
        return { ok: true, before: before, after: after };
    }
    window.skhGChildOrderGet = async function (orderDocId) {
        if (!orderDocId) return { ok: false, reason: 'need_id' };
        var ref = skh.doc(skh.db, 'orders', String(orderDocId));
        var snap = null;
        try { snap = await skh.getDoc(ref); } catch (eG) { return { ok: false, reason: 'perm' }; }
        if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
        var d = snap.data() || {};
        if (d.kind !== 'GROUP_CHILD_ORDER') return { ok: false, reason: 'not_group_child' };
        var gid = d.groupId || null;
        var mem = gid ? await goActiveMember(gid) : null;
        if (!mem) return { ok: false, reason: 'not_member' };
        var me = uid();
        var role = (d.buyerId && d.buyerId === me) ? 'buyer' : ((d.sellerId && d.sellerId === me) ? 'seller' : ((d.transporterId && d.transporterId === me) ? 'transporter' : null));
        d.__id = snap.id;
        return { ok: true, order: d, myRoleIn: role, groupRole: mem.role || 'member' };
    };
    window.skhGChildOrderAction = async function (orderDocId, action, extra) {
        if (!orderDocId || !action) return { ok: false, reason: 'need_args' };
        var ref = skh.doc(skh.db, 'orders', String(orderDocId));
        var snap = null;
        try { snap = await skh.getDoc(ref); } catch (eP) { return { ok: false, reason: 'perm' }; }
        if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
        var d = snap.data() || {};
        if (d.kind !== 'GROUP_CHILD_ORDER') return { ok: false, reason: 'not_group_child' };
        var me = uid();
        var role = (d.buyerId && d.buyerId === me) ? 'buyer' : ((d.sellerId && d.sellerId === me) ? 'seller' : ((d.transporterId && d.transporterId === me) ? 'transporter' : null));
        var mem = d.groupId ? await goActiveMember(d.groupId) : null;
        if (!mem) return { ok: false, reason: 'not_member' };
        var isOrg2 = canOrganize(mem.role);
        function fin(p, step, meta2) {
            return (async function () {
                p.updatedAt = nowIso();
                var target = d.groupId || null;
                await skh.updateDoc(ref, p);
                if (target) { try { await logEvent(target, 'go_child_order_event', me, step, null, orderDocId); } catch (eLEV) {} }
                if (target) {
                    try {
                        await skh.addDoc(skh.collection(skh.db, 'conversations/conv_group_' + target + '/messages'), {
                            senderUid: 'sys', senderName: 'SokoHai', type: 'order_event',
                            text: step, at: nowIso(),
                            meta: { humanId: d.humanId || null, step: step, parentCode: d.parentCode || null },
                            clientId: 'sysev_' + orderDocId + '_' + step
                        });
                    } catch (eMSG) {}
                }
                return { ok: true, step: step, status: p.status || d.status };
            })();
        }
        var amt = Math.round(+d.amount || +d.totalPrice || 0);
        var fee = Math.round(amt * GCO_FEE);
        switch (String(action)) {
            case 'pay': {
                if (role !== 'buyer') return { ok: false, reason: 'not_buyer' };
                if (d.status !== 'payment_pending') return { ok: false, reason: 'bad_state' };
                if (d.paymentStatus === 'secured') return { ok: false, reason: 'already_secure' };
                var bal = 0; try { var us2 = await skh.getDoc(skh.doc(skh.db, 'users', me)); if (us2 && us2.exists && us2.exists()) bal = +us2.data().walletBalance || 0; } catch (eB) {}
                if (bal < amt) return { ok: false, reason: 'insufficient', balance: bal, need: amt };
                await gcoWalletAdd(me, -amt, 'escrow_hold', orderDocId, 'ESCROW hold: ' + (d.humanId || orderDocId), { gid: d.groupId });
                return fin({ status: 'secured', paymentStatus: 'secured', escrowStatus: 'held', amountPaid: amt, 'timeline.paymentSecuredAt': nowIso() }, 'paid', { secured: true });
            }
            case 'accept_order': {
                if (role !== 'seller') return { ok: false, reason: 'not_seller' };
                if (d.status !== 'secured') return { ok: false, reason: 'bad_state' };
                return fin({ status: 'confirmed', 'timeline.sellerAcceptedAt': nowIso() }, 'seller_accepted');
            }
            case 'reject_order': {
                if (role !== 'seller') return { ok: false, reason: 'not_seller' };
                if (d.status !== 'secured') return { ok: false, reason: 'bad_state' };
                if (d.escrowStatus === 'held' && d.buyerId) await gcoWalletAdd(d.buyerId, amt, 'escrow_refund', orderDocId, 'ESCROW refund (mzabini amekataa): ' + (d.humanId || ''), { gid: d.groupId });
                return fin({ status: 'rejected', paymentStatus: 'refunded', escrowStatus: 'refunded', 'timeline.rejectedAt': nowIso() }, 'seller_rejected');
            }
            case 'assign_transporter': {
                if (!isOrg2) return { ok: false, reason: 'not_organizer' };
                var tUid = extra && extra.transporterUid;
                if (!tUid) return { ok: false, reason: 'need_transporter' };
                var tName = tUid;
                try { var ts = await skh.getDoc(skh.doc(skh.db, 'users', tUid)); if (ts && ts.exists && ts.exists()) tName = ts.data().fullName || tName; } catch (eT) {}
                return fin({ transporterId: tUid, transporterName: tName, deliveryRequired: true }, 'assign_transporter');
            }
            case 'mark_ready': {
                if (role !== 'seller') return { ok: false, reason: 'not_seller' };
                if (d.status !== 'confirmed') return { ok: false, reason: 'bad_state' };
                return fin({ status: 'ready', readyAt: nowIso(), 'timeline.readyAt': nowIso() }, 'ready');
            }
            case 'accept_delivery': {
                if (role !== 'transporter') return { ok: false, reason: 'not_transporter' };
                if (d.status !== 'ready') return { ok: false, reason: 'bad_state' };
                return fin({ transporterAccepted: true, transporterAcceptedAt: nowIso() }, 'transporter_accepted');
            }
            case 'confirm_pickup': {
                if (role !== 'transporter') return { ok: false, reason: 'not_transporter' };
                if (d.status !== 'ready' || !d.transporterAccepted) return { ok: false, reason: 'bad_state' };
                return fin({ status: 'in_transit', pickedUpAt: nowIso(), 'timeline.inTransitAt': nowIso() }, 'in_transit');
            }
            case 'delivered': {
                if (role !== 'transporter') return { ok: false, reason: 'not_transporter' };
                if (d.status !== 'in_transit') return { ok: false, reason: 'bad_state' };
                return fin({ status: 'delivered', deliveredAt: nowIso(), 'timeline.deliveredAt': nowIso() }, 'delivered');
            }
            case 'confirm_received': {
                if (role !== 'buyer') return { ok: false, reason: 'not_buyer' };
                var selfCollect = !d.transporterId;
                if (!(d.status === 'delivered' || (d.status === 'ready' && selfCollect))) return { ok: false, reason: 'bad_state' };
                if (d.escrowStatus === 'held' && d.sellerId) {
                    await gcoWalletAdd(d.sellerId, (amt - fee), 'escrow_release', orderDocId, 'ESCROW release: ' + (d.humanId || ''), { gid: d.groupId, fee: fee });
                    await gcoWalletAdd('platform', fee, 'escrow_fee', orderDocId, 'Kamisheni 1.5%: ' + (d.humanId || ''), { gid: d.groupId });
                }
                return fin({ status: 'completed', paymentStatus: 'released', escrowStatus: 'released', 'timeline.completedAt': nowIso() }, 'completed', { fee: fee });
            }
            default:
                return { ok: false, reason: 'unknown_action' };
        }
    };

    /* ================= [SPEC PHASE 6 §16/17 §24/25] PRICE TIERS + SUPPLIER OFFERS ================= */

    async function goOrgGuard(gid, goid) {            // [§46] organizer/admin tu — actions za order management
        var my = await window.skhGroupMyRole(gid);
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return null;
        var d = snap.data() || {};
        if (!((d.organizerId && d.organizerId === uid()) || canOrganize(my))) return null;   // [§26/27] organizer-role pia
        return { ref: ref, d: d };
    }
    window.skhGroupOrderSetTiers = async function (gid, goid, tiersIn) {   // [§16] organizer anaweza weka/bei tiers
        var g = await goOrgGuard(gid, goid); if (!g) return { ok: false, reason: 'perm' };
        var d = g.d;
        if (['CLOSED', 'PROCESSING', 'COMPLETED', 'CANCELLED'].indexOf(String(d.status)) >= 0) return { ok: false, reason: 'state' };
        var rows = Array.isArray(tiersIn) ? tiersIn.slice(0, 6) : [];
        var tiers = [];
        for (var i = 0; i < rows.length; i++) {
            var mq = Math.floor(+ rows[i].minQty); var pr = +String(rows[i].price).replace(/[,\s]/g, '');
            if (!(mq >= 2 && mq <= 1e6) || !(pr > 0 && pr <= 1e9)) return { ok: false, reason: 'tier' };
            tiers.push({ minQty: mq, price: pr });
        }
        tiers.sort(function (a, b) { return a.minQty - b.minQty; });
        for (var j = 1; j < tiers.length; j++) {
            if (tiers[j].minQty === tiers[j - 1].minQty) return { ok: false, reason: 'tier' };     // qty lazima ipande, haielewani
            if (tiers[j].price > tiers[j - 1].price) return { ok: false, reason: 'tier' };         // [§16] quantity discount: bei isipande kwa quantity zaidi
        }
        // proper unlock dedup: laweza kuondoa tier iliyovuka? hatakiwi zisivutishe — huruhusiwa tu logic ya discount sahihi jtalk
        d.priceTiers = tiers;
        var prevIdx = typeof d.tierIdx === 'number' ? d.tierIdx : -1;
        delete d.__previousTierPrice;
        d.tierIdx = goTierIdx(d);
        d.updatedAt = nowIso();
        await skh.updateDoc(g.ref, { priceTiers: tiers, tierIdx: d.tierIdx, updatedAt: d.updatedAt });
        if (d.tierIdx !== prevIdx) await logEvent(gid, 'go_tiers_updated', uid(), null, tiers.length + ' tiers', goid);
        return { ok: true, tierIdx: d.tierIdx };
    };

    window.skhGroupOrderRequestOffers = async function (gid, goid) {  // [§24] Request For Supplier ndani ya demand kadi
        var g = await goOrgGuard(gid, goid); if (!g) return { ok: false, reason: 'perm' };
        var d = g.d;
        if (['OPEN', 'NEAR_TARGET'].indexOf(String(d.status)) < 0) return { ok: false, reason: 'state' };
        if (d.offersOpen === true) return { ok: false, reason: 'already' };
        if (d.selectedOffer && d.selectedOffer.supplierId) return { ok: false, reason: 'selected' };
        d.offersOpen = true; d.offersOpenedAt = nowIso(); d.updatedAt = nowIso();
        await skh.updateDoc(g.ref, { offersOpen: true, offersOpenedAt: d.offersOpenedAt, updatedAt: d.updatedAt });
        await logEvent(gid, 'go_offers_requested', uid(), null, d.productName || null, goid);
        try {
            await skh.addDoc(skh.collection(skh.db, 'conversations/conv_group_' + gid + '/messages'), {
                senderUid: uid(), senderName: myNameG(), at: nowIso(), type: 'supplier_request', gorderId: goid,
                snapshot: { productName: d.productName, requiredQty: Math.max((+d.targetQty || 0) - (+d.totalQty || 0), 0), targetQty: d.targetQty,
                            unit: d.unit || null, deliveryArea: d.deliveryArea, deliveryMethod: d.deliveryMethod, deadline: d.deadline, offersCount: 0 }
            });
        } catch (eSR1) {}
        return { ok: true };
    };

    async function goMyAccountType() {
        try { var us = await skh.getDoc(skh.doc(skh.db, 'users', uid())); return (us && us.exists && us.exists()) ? String(us.data().accountType || '') : ''; } catch (eAT) { return ''; }
    }
    window.skhGroupOrderSubmitOffer = async function (gid, goid, f) {   // [§25] SUBMIT offer — seller (server-side type check)
        if (!uid()) return { ok: false, reason: 'auth' };
        var at = await goMyAccountType();
        if (at !== 'seller') return { ok: false, reason: 'not_seller' };
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
        var d = snap.data() || {};
        if (['OPEN', 'NEAR_TARGET'].indexOf(String(d.status)) < 0) return { ok: false, reason: 'state' };
        if (d.offersOpen !== true) return { ok: false, reason: 'not_open' };          // ofa zikifikisha tu wakati ombi limefunguliwa (§24)
        if (d.selectedOffer && d.selectedOffer.supplierId) return { ok: false, reason: 'selected' };
        f = f || {};
        var price = +String(f.price).replace(/[,\s]/g, '');
        if (!(price > 0 && price <= 1e9)) return { ok: false, reason: 'price' };
        var aq = Math.floor(+f.availableQty);
        if (!(aq >= 1 && aq <= 1e6)) return { ok: false, reason: 'availableQty' };
        var dd = Math.floor(+f.deliveryDays);
        if (!(dd >= 0 && dd <= 90)) return { ok: false, reason: 'deliveryDays' };
        var note = cln(f.note, 200);
        d.supplierOffers = (d.supplierOffers && typeof d.supplierOffers === 'object' && !Array.isArray(d.supplierOffers)) ? d.supplierOffers : {};   // [] ya legacy ni object-'typeof' trap mereage as {}
        d.supplierOffers[uid()] = { price: price, availableQty: aq, deliveryDays: dd, note: note, supplierName: myNameG(), submittedAt: nowIso(), updatedAt: nowIso() };  // [§44] ofa moja kwa muuzaji mmoja — natural dedupe
        d.offersCount = Object.keys(d.supplierOffers).length;
        d.updatedAt = nowIso();
        await skh.updateDoc(ref, { supplierOffers: d.supplierOffers, offersCount: d.offersCount, updatedAt: d.updatedAt });
        await logEvent(gid, 'go_offer_submitted', uid(), null, d.productName || null, goid);
        return { ok: true, count: d.offersCount };
    };

    window.skhGroupOrderWithdrawOffer = async function (gid, goid) {   // muuzaji anaweza jiondoa mwenyewe
        var ref = goRef(gid, goid);
        var snap = await skh.getDoc(ref);
        if (!(snap && snap.exists && snap.exists())) return { ok: false, reason: 'not_found' };
        var d = snap.data() || {};
        if (!(d.supplierOffers && d.supplierOffers[uid()])) return { ok: false, reason: 'not_offered' };
        if (d.selectedOffer && d.selectedOffer.supplierId === uid()) return { ok: false, reason: 'selected' };   // uliyo-chaguliwa: ongea na organizer kwanza
        delete d.supplierOffers[uid()];
        d.offersCount = Object.keys(d.supplierOffers).length;
        d.updatedAt = nowIso();
        await skh.updateDoc(ref, { supplierOffers: d.supplierOffers, offersCount: d.offersCount, updatedAt: d.updatedAt });
        await logEvent(gid, 'go_offer_withdrawn', uid(), null, null, goid);
        return { ok: true, count: d.offersCount };
    };

    window.skhGroupOrderSelectOffer = async function (gid, goid, supplierId) {   // [§25] organizer huamua — HAKUNA auto-best
        var g = await goOrgGuard(gid, goid); if (!g) return { ok: false, reason: 'perm' };
        var d = g.d;
        if (['OPEN', 'NEAR_TARGET'].indexOf(String(d.status)) < 0) return { ok: false, reason: 'state' };
        var off = (d.supplierOffers || {})[supplierId];
        if (!off) return { ok: false, reason: 'not_found' };
        d.selectedOffer = { supplierId: supplierId, price: off.price, availableQty: off.availableQty, deliveryDays: off.deliveryDays, note: off.note || null, supplierName: off.supplierName || null, selectedAt: nowIso() };
        d.supplierMode = 'selected';
        d.supplierName = off.supplierName || supplierId;
        d.offersOpen = false;
        d.updatedAt = nowIso();
        await skh.updateDoc(g.ref, { selectedOffer: d.selectedOffer, supplierMode: 'selected', supplierName: d.supplierName, offersOpen: false, updatedAt: d.updatedAt });
        await logEvent(gid, 'go_offer_selected', uid(), supplierId, d.supplierName, goid);
        return { ok: true };
    };

    window.skhGroupSetAnnouncement = async function (gid, text) {
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) { alert(tk('grp_no_perm', 'Huna ruhusa ya kutendewa hili (owner/admin tu).')); return null; }
        var raw = String(text == null ? '' : text).trim();
        if (raw.length > 500) return null;                        // guard: tangazo ni fupi
        var gs2 = await skh.getDoc(gRef(gid));
        if (!(gs2 && gs2.exists && gs2.exists())) return null;
        var g2 = gs2.data() || {};
        var prev = g2.announcement && g2.announcement.text ? String(g2.announcement.text) : '';
        if (raw === prev) return g2.announcement || null;         // hakuna mabadiliko
        if (raw) g2.announcement = { text: raw, by: uid(), at: nowIso() };
        else g2.announcement = null;
        g2.updatedAt = nowIso();
        await skh.updateDoc(gRef(gid), g2);
        try { await skh.updateDoc(skh.doc(skh.db, 'conversations', 'conv_group_' + gid), { announcement: g2.announcement, updatedAt: nowIso() }); } catch (eAN) {}
        await logEvent(gid, raw ? 'announcement_pinned' : 'announcement_unpinned', uid(), null, raw || null);
        return g2.announcement;
    };

    /* ---------------- ADMIN: remove / role / archive (guards §35) ---------------- */
    window.skhGroupRemoveMember = async function (gid, targetUid) {
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) { alert(tk('grp_no_perm', 'Huna ruhusa ya kutendewa hili (owner/admin tu).')); return null; }
        if (targetUid === uid()) return window.skhGroupLeave(gid);
        var msnap = await skh.getDoc(mRef(gid, targetUid));
        if (!msnap || !msnap.exists()) return null;
        var mem = msnap.data();
        if (mem.status !== 'active') return mem;
        if (mem.role === 'owner') { alert(tk('grp_owner_cant_remove', 'Huwezi kumtoa mmiliki — kwanza kabidhi umiliki.')); return null; } // [R24 server-guard]
        mem.status = 'left'; mem.leftAt = nowIso();
        await skh.setDoc(mRef(gid, targetUid), mem);
        await syncMemberCount(gid, -1);
        await syncConvParticipants(gid, targetUid, false);
        await removeCtxParticipant(gid, targetUid);
        await logEvent(gid, 'member_removed', uid(), targetUid, null);
        return mem;
    };
    window.skhGroupSetRole = async function (gid, targetUid, role) {
        var my = await window.skhGroupMyRole(gid);
        if (my !== 'owner') { alert(tk('grp_owner_only', 'Owner ndiye anayeweza kubadilisha roles.')); return null; }
        if (role === 'owner') { alert(tk('grp_owner_use_transfer', 'Tumia "kabidhi umiliki" (skhGroupTransferOwnership) badala ya setRole(owner).')); return null; } // [R24: mmiliki ni mmoja tu]
        if (['owner','admin','moderator','organizer','member'].indexOf(role) < 0) return null;   // [§27] 5 roles halisi
        var msnap = await skh.getDoc(mRef(gid, targetUid));
        if (!msnap || !msnap.exists()) return null;
        var mem = msnap.data();
        if (mem.role === role) return mem;
        mem.role = role;
        await skh.setDoc(mRef(gid, targetUid), mem);
        await logEvent(gid, 'role_changed', uid(), targetUid, role);
        return mem;
    };
    window.skhGroupArchive = async function (gid, finalStatus) {
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) { alert(tk('grp_no_perm', 'Huna ruhusa ya kutendewa hili (owner/admin tu).')); return null; }
        var gsnap = await skh.getDoc(gRef(gid));
        if (!gsnap || !gsnap.exists()) return null;
        var g = gsnap.data();
        if (g.status === 'ARCHIVED') return g;
        g.status = finalStatus === 'COMPLETED' || finalStatus === 'CANCELLED' ? finalStatus : 'ARCHIVED';
        if (g.status === 'ARCHIVED') g.archivedAt = nowIso();
        g.updatedAt = nowIso();
        await skh.updateDoc(gRef(gid), g);
        await logEvent(gid, 'status_changed', uid(), null, g.status);
        return g;
    };

    /* ---------------- READ: my role / members / events / my groups ---------------- */
    window.skhGroupMyRole = async function (gid) {
        if (!uid()) return null;
        try {
            var msnap = await skh.getDoc(mRef(gid, uid()));
            return roleOf((msnap && msnap.exists && msnap.exists()) ? msnap.data() : null);
        } catch (e) { return null; }
    };
    window.skhGroupMembers = async function (gid) {
        var out = [];
        try {
            var snap = await skh.getDocs(skh.collection(skh.db, 'chatGroups/' + gid + '/members'));
            snap.forEach(function (d) { var m = d.data() || {}; m.id = d.id; out.push(m); });
        } catch (e) {}
        return out;
    };
    window.skhGroupEvents = async function (gid, limit) {
        var out = [];
        try {
            var snap = await skh.getDocs(evRef(gid));
            snap.forEach(function (d) { var e = d.data() || {}; e.id = d.id; out.push(e); });
            out.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
        } catch (e) {}
        return out.slice(0, limit || 50);
    };
    window.skhMyGroups = async function () {
        if (!uid()) return [];
        var out = [];
        try {
            // collectionGroup si requirement: tunatafuta groups(public + niliyojiunga) kwa
            // memberships za kila group kwa helper ya mockfs/prod — query rahisi:
            var snap = await skh.getDocs(skh.collection(skh.db, 'chatGroups'));
            var tasks = [];
            snap.forEach(function (d) {
                tasks.push((async function (dd) {
                    var g = dd.data() || {}; g.id = dd.id;
                    var ms = await skh.getDoc(mRef(g.id, uid()));
                    if (ms && ms.exists && ms.exists() && ms.data().status === 'active') { g.__myRole = ms.data().role; out.push(g); }
                })(d));
            });
            await Promise.all(tasks);
        } catch (e) {}
        return out;
    };

    /* ---------------- conversation participants sync (R20) ---------------- */
    async function syncConvParticipants(gid, uid2, add) {
        try {
            var cRef = skh.doc(skh.db, 'conversations', 'conv_group_' + gid);
            var cs = await skh.getDoc(cRef);
            var parts = (cs && cs.exists && cs.exists()) ? (cs.data().participants || []) : [uid2];
            if (add && parts.indexOf(uid2) === -1) parts.push(uid2);
            if (!add) parts = parts.filter(function (x) { return x !== uid2; });
            await skh.setDoc(cRef, { participants: parts, updatedAt: nowIso() }, { merge: true });
        } catch (e) {}
    }
    window.skhGroupSyncParticipants = syncConvParticipants;

    /* ---------------- INVITATIONS (R20 §16) ----------------
     * Invite → chatGroups/{gid}/invitations/{targetUid} (dup-proof: doc id=uid).
     * Accept → member active OYOAMAN ADAya (ana-idhini). Decline → declined. */
    function iRef(gid, tuid) { return skh.doc(skh.db, 'chatGroups/' + gid + '/invitations', tuid); }

    window.skhGroupInvite = async function (gid, targetUid) {
        if (!uid() || !targetUid) { alert(tk('login_first', 'Ingia kwanza.')); return null; }
        if (targetUid === uid()) { alert(tk('grp_inv_self', 'Huwezi kujialika mwenyewe.')); return null; }
        var gs = await skh.getDoc(gRef(gid));
        if (!gs || !gs.exists()) { alert(tk('grp_not_found', 'Kikundi hakipatikani.')); return null; }
        var g = gs.data();
        if (g.status !== 'ACTIVE') { alert(tk('grp_archived', 'Kikundi hiki hakipo active tena.')); return null; }
        // [R22 §31] Block inaheshimiwa kwenye group-invite: blocked双方在两边
        //方向 chatBlocks/{a__b} 任一为真 → 拒绝 (bypass yoyote hakekwazu)
        // [R22 §31] Blocklist inaheshimiwa kwenye group-invite:
        // chatBlocks/{me__target} au {target__me} ipo → kataza.
        try {
            var b1 = await skh.getDoc(skh.doc(skh.db, 'chatBlocks', uid() + '__' + targetUid));
            var b2 = await skh.getDoc(skh.doc(skh.db, 'chatBlocks', targetUid + '__' + uid()));
            if ((b1 && b1.exists && b1.exists()) || (b2 && b2.exists && b2.exists())) {
                alert(tk('grp_inv_blocked', 'Huwezi kumwalika huyu — kuna kizuizui.'));
                return null;
            }
        } catch (eB) {}
        var mine = await skh.getDoc(mRef(gid, uid()));
        var myRole = (mine && mine.exists && mine.exists() && mine.data().status === 'active') ? mine.data().role : null;
        if (!myRole) { alert(tk('grp_inv_only_member', 'Wewe si mwanachama wa kikundi hiki.')); return null; }
        if (g.invitePolicy === 'admins' && !(myRole === 'owner' || myRole === 'admin')) { alert(tk('grp_inv_admins', 'Vialiko ni kwa owner/admin tu.')); return null; }
        var tgt = await skh.getDoc(mRef(gid, targetUid));
        if (tgt && tgt.exists && tgt.exists() && (tgt.data().status === 'active' || tgt.data().status === 'pending')) {
            alert(tk('grp_inv_dup', 'Huyu tayari ana uhusiano na kikundi (§44 hakuna duplicates).')); return { dup: true };
        }
        var prev = await skh.getDoc(iRef(gid, targetUid));
        if (prev && prev.exists && prev.exists() && prev.data().status === 'pending') return { already: true };
        await skh.setDoc(iRef(gid, targetUid), {
            status: 'pending', groupId: gid, invitedBy: uid(), invitedAt: nowIso(), targetUid: targetUid
        });
        await logEvent(gid, 'member_invited', uid(), targetUid, null);
        return { ok: true };
    };

    window.skhMyGroupInvitations = async function () {
        if (!uid()) return [];
        var out = [];
        try {
            var snap = await skh.getDocs(skh.collection(skh.db, 'chatGroups'));
            var tasks = [];
            snap.forEach(function (d) {
                tasks.push((async function (dd) {
                    var g = dd.data() || {}; g.id = dd.id;
                    if (g.status !== 'ACTIVE') return;
                    var iv = await skh.getDoc(iRef(g.id, uid()));
                    if (iv && iv.exists && iv.exists() && iv.data().status === 'pending') { g.__invitedBy = iv.data().invitedBy; out.push(g); }
                })(d));
            });
            await Promise.all(tasks);
        } catch (e) {}
        return out;
    };

    window.skhGroupInviteRespond = async function (gid, accept) {
        if (!uid()) return null;
        var iv = await skh.getDoc(iRef(gid, uid()));
        if (!iv || !iv.exists || !iv.exists() || iv.data().status !== 'pending') return null;
        if (!accept) {
            await skh.setDoc(iRef(gid, uid()), { status: 'declined', respondedAt: nowIso() }, { merge: true });
            return { declined: true };
        }
        var ms = await skh.getDoc(mRef(gid, uid()));
        var existing = (ms && ms.exists && ms.exists()) ? ms.data() : null;
        if (existing && existing.status === 'active') {   // §44 dup guard
            await skh.setDoc(iRef(gid, uid()), { status: 'accepted', respondedAt: nowIso() }, { merge: true });
            return { already: true };
        }
        await skh.setDoc(mRef(gid, uid()), {
            userId: uid(), role: 'member', status: 'active',
            joinedAt: existing ? (existing.joinedAt || nowIso()) : nowIso(),
            invitedBy: iv.data().invitedBy || null, leftAt: null
        });
        await skh.setDoc(iRef(gid, uid()), { status: 'accepted', respondedAt: nowIso() }, { merge: true });
        await syncMemberCount(gid, +1);
        await syncConvParticipants(gid, uid(), true);
        // [R22 B3] sharedContext.participants pia husawabishwi kwenye accept (ilikuwa 0)
        try { var gs2 = await skh.getDoc(gRef(gid)); var sc = (gs2.exists() ? gs2.data().sharedContext : null) || null;
            if (sc && sc.participants && sc.participants.indexOf(uid()) === -1) { sc.participants.push(uid()); await skh.setDoc(skh.doc(skh.db, 'sharedContexts', gid), { participants: sc.participants }, { merge: true }); } } catch (eSC2) {}
        await logEvent(gid, 'member_joined', uid(), uid(), 'invite_accepted');
        return { ok: true };
    };

    /* ---------------- [R22 B2] JOIN REQUESTS: owner/admin wanapata orodha + wanakubali/kataa ----------------
     * joinPolicy:'request' haikuwa inakwama "pending" milele — sasa ina njia. */
    window.skhGroupPendingRequests = async function (gid) {
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) return [];
        var members = await window.skhGroupMembers(gid);
        return members.filter(function (m) { return m.status === 'pending'; });
    };
    window.skhGroupApproveJoin = async function (gid, targetUid, approve) {
        if (!uid() || !targetUid) return null;
        var my = await window.skhGroupMyRole(gid);
        if (!canManage(my)) { alert(tk('grp_no_perm', 'Huna ruhusa ya kutendewa hili (owner/admin tu).')); return null; }
        var msnap = await skh.getDoc(mRef(gid, targetUid));
        if (!msnap || !msnap.exists() || msnap.data().status !== 'pending') return null;
        var mem = msnap.data();
        if (approve) {
            mem.status = 'active'; mem.approvedBy = uid(); mem.approvedAt = nowIso(); mem.leftAt = null;
            await skh.setDoc(mRef(gid, targetUid), mem);
            await syncMemberCount(gid, +1);
            await syncConvParticipants(gid, targetUid, true);
            try { var gs2 = await skh.getDoc(gRef(gid)); var sc = (gs2.exists() ? gs2.data().sharedContext : null) || null;
                if (sc && Array.isArray(sc.participants) && sc.participants.indexOf(targetUid) === -1) { sc.participants.push(targetUid); await skh.setDoc(skh.doc(skh.db, 'sharedContexts', gid), { participants: sc.participants }, { merge: true }); } } catch (eSC3) {}
            await logEvent(gid, 'member_joined', targetUid, targetUid, 'approved');
            return { ok: true, approved: true };
        }
        mem.status = 'left'; mem.leftAt = nowIso(); mem.rejectedBy = uid();
        await skh.setDoc(mRef(gid, targetUid), mem);
        await logEvent(gid, 'member_rejected', targetUid, targetUid, null);
        return { ok: true, rejected: true };
    };

    /* ---------------- memberCount sync (read-modify-write) ---------------- */
    async function syncMemberCount(gid, delta) {
        try {
            var gs = await skh.getDoc(gRef(gid));
            if (!gs || !gs.exists()) return;
            var g = gs.data();
            var n = Math.max(1, (g.memberCount || 1) + delta);
            await skh.updateDoc(gRef(gid), { memberCount: n, updatedAt: nowIso() });
        } catch (e) {}
    }

    /* ---------------- Participants map (R19 conversation hook) ---------------- */
    window.skhGroupParticipantsSnapshot = async function (gid) {
        var members = await window.skhGroupMembers(gid);
        var active = members.filter(function (m) { return m.status === 'active'; });
        return { uids: active.map(function (m) { return m.userId; }), roles: Object.fromEntries(active.map(function (m) { return [m.userId, m.role]; })) };
    };
})();

/* ================================================================
 * UI — DISCOVER PANEL EXTENSION (extend, si rebuild)
 *  - "+ Kikundi" button karibu na vichujio
 *  - Create modal (name/type/visibility/joinPolicy)
 *  - "VIKUNDI VYANGU" block (skhMyGroups) + Leave/Archive actions
 *  - Refresh ya Discover baada ya group events
 * ================================================================ */
import { skh as _skh } from './00-bootstrap.js';
(function () {
    function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }
    function esc(s) { return _skh.skhEscape(String(s == null ? '' : s)); }
    function uid() { return (_skh.currentUser && _skh.currentUser.uid) || null; }
    function closeAll() { try { if (window.closeModals) window.closeModals(); } catch (e) {} }

    /* =================================================================
     * [R22] SOGA = LIST MOJA (WhatsApp-like): humo chats humo groups.
     *  - Conversations za GROUP sasa zina-render na 34 kama rows halisi.
     *  - Block hii inabaki kwa "VIALIO VYA VIKUNDI" TU (invitations) —
     *    SIYO duplicate ya list. Ina-hide kabisa vialio zikikawa zipo.
     *  - Ilajengwa mara moja tu pekee (R21 hammering fix: MO haifanyi
     *    render tena kwa kila DOM-mutation).
     * ================================================================= */
    function inviteHtml(g) {
        return '<div class="skh-grp-inv" data-gid="' + esc(g.id) + '" style="display:flex;gap:10px;align-items:center;padding:10px;border:1px dashed #f6c45e;border-radius:12px;margin-bottom:8px;background:#fffbeb;">'
            + '<div style="width:36px;height:36px;border-radius:10px;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;">#</div>'
            + '<div style="flex:1;min-width:0;"><b style="display:block;font-size:13px;color:#0f172a;">' + esc(g.name) + '</b>'
            + '<small style="color:#64748b;font-size:11.5px;">' + tk('grp_inv_label', 'Umealikiwa') + ' · ' + (g.memberCount || 1) + ' ' + tk('grp_members', 'wanachama') + '</small></div>'
            + '<button type="button" data-act="grp-invite-accept" style="border:none;background:#18A982;color:#fff;font-weight:800;font-size:11.5px;padding:7px 11px;border-radius:99px;cursor:pointer;">' + tk('grp_accept', 'Kubali') + '</button>'
            + '<button type="button" data-act="grp-invite-decline" style="border:none;background:#f1f5f9;color:#475569;font-weight:700;font-size:11.5px;padding:7px 11px;border-radius:99px;cursor:pointer;">' + tk('grp_decline', 'Kataa') + '</button>'
            + '</div>';
    }

    var INV = { groups: [] };
    async function renderInvites() {
        var blk = document.getElementById('skhInboxGroupsBlock');
        if (!blk) return;
        if (!uid()) { blk.style.display = 'none'; blk.innerHTML = ''; return; }
        INV.groups = await window.skhMyGroupInvitations();
        if (!INV.groups.length) { blk.style.display = 'none'; blk.innerHTML = ''; return; }
        // [R24] arifa mara-moja-kwa-session: kuna vialio vinasubiri (WhatsApp parity)
        try {
            if (window.showToast && !window.__grpInvToastDone) {
                window.__grpInvToastDone = true;
                window.showToast(tk('grp_inv_you_have', 'Una vialio vya kujiunga na vikundi') + ' (' + INV.groups.length + ')', 'info');
            }
        } catch (eT6) {}
        blk.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin:10px 0 8px;border-top:1px solid #e2e8f0;padding-top:14px;">'
            + '<span style="font-size:12px;color:#b45309;font-weight:800;text-transform:uppercase;letter-spacing:.4px;">' + tk('grp_inv_pending', 'Vialio vya vikundi') + '</span>'
            + '<span style="font-size:11px;color:#64748b;">(' + INV.groups.length + ')</span></div>'
            + INV.groups.map(inviteHtml).join('');
        blk.style.display = 'block';
    }
    window.skhRenderMyGroups = renderInvites;          // alias ya jina la zamani
    window.skhSyncInvitesUI = renderInvites;

    function ensureCreateButton() {
        var list = document.getElementById('inboxList');
        if (!list || !list.parentNode) return;
        if (document.getElementById('skhInboxGroupsBlock')) return;
        var blk = document.createElement('div');
        blk.id = 'skhInboxGroupsBlock';
        blk.style.cssText = 'padding:0 12px 16px;display:none;';
        list.parentNode.appendChild(blk);
        renderInvites();   // mara moja tu — sio kwa kila mutation
    }

    /* ================= [R22 §11] SOGA "+" MENU: Contact / Chagua Contacts / Create Group ================= */
    window.skhSogaPlusMenu = function (e) {
        try { if (e && e.stopPropagation) e.stopPropagation(); } catch (eS) {}
        var old = document.getElementById('skhSogaPlusMenu');
        if (old) { old.remove(); return; }
        var m = document.createElement('div');
        m.id = 'skhSogaPlusMenu';
        m.style.cssText = 'position:fixed;top:64px;right:12px;background:#fff;border:1px solid #dbe4ed;border-radius:16px;box-shadow:0 18px 40px rgba(9,32,63,.28);padding:8px;z-index:100050;min-width:230px;';
        m.innerHTML =
            '<button type="button" data-spm="contact"   style="width:100%;display:flex;gap:12px;align-items:center;border:none;background:transparent;padding:11px 12px;border-radius:12px;cursor:pointer;font-family:inherit;">'
                + '<span style="width:36px;height:36px;border-radius:11px;background:#eef6fc;display:flex;align-items:center;justify-content:center;font-size:17px;">👤</span>'
                + '<span style="text-align:left;"><b style="display:block;font-size:13.5px;color:#0f172a;">' + tk('spm_contact', 'Contact') + '</b><small style="color:#64748b;font-size:11px;">' + tk('spm_contact_sub', 'Anza soga na mtu mmoja') + '</small></span></button>'
            + '<button type="button" data-spm="contacts"  style="width:100%;display:flex;gap:12px;align-items:center;border:none;background:transparent;padding:11px 12px;border-radius:12px;cursor:pointer;font-family:inherit;">'
                + '<span style="width:36px;height:36px;border-radius:11px;background:#eaf8f1;display:flex;align-items:center;justify-content:center;font-size:17px;">👥</span>'
                + '<span style="text-align:left;"><b style="display:block;font-size:13.5px;color:#0f172a;">' + tk('spm_contacts', 'Chagua Contacts') + '</b><small style="color:#64748b;font-size:11px;">' + tk('spm_contacts_sub', 'Watu wengi — kisha unde kikundi') + '</small></span></button>'
            + '<button type="button" data-spm="creategrp" style="width:100%;display:flex;gap:12px;align-items:center;border:none;background:transparent;padding:11px 12px;border-radius:12px;cursor:pointer;font-family:inherit;">'
                + '<span style="width:36px;height:36px;border-radius:11px;background:#fdf6e3;display:flex;align-items:center;justify-content:center;font-size:17px;">#</span>'
                + '<span style="text-align:left;"><b style="display:block;font-size:13.5px;color:#0f172a;">' + tk('spm_creategrp', 'Create Group') + '</b><small style="color:#64748b;font-size:11px;">' + tk('spm_creategrp_sub', 'Unda kikundi kipya cha soga') + '</small></span></button>';
        document.body.appendChild(m);
        setTimeout(function () {
            document.addEventListener('click', function off(ev) {
                if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off); }
            });
        }, 0);
    };

    /* ================= CONTACTS (account ya sasa: partners wa DIRECT conversations) ================= */
    window.skhMyContactsList = async function () {
        var me = uid(); var out = {}; var rows = [];
        try {
            var q = _skh.query(_skh.collection(_skh.db, 'conversations'), _skh.where('participants', 'array-contains', me), _skh.limit(100));
            var snap = await _skh.getDocs(q);
            snap.forEach(function (d) {
                var c = d.data() || {};
                if (c.type === 'group' || String(d.id).indexOf('conv_group_') === 0) return;
                var other = (c.participants || []).filter(function (u) { return u !== me; })[0];
                if (!other) return;
                var meta = (c.participantMeta || {})[other] || {};
                if (!out[other]) out[other] = { uid: other, name: meta.name || null, role: meta.role || 'user', photo: meta.photo || '' };
            });
        } catch (e) {}
        // kumbuka jina kutoka users/ kama participantMeta haina
        var needs = Object.values(out).filter(function (r) { return !r.name; }).map(function (r) { return r.uid; });
        for (var i = 0; i < needs.length; i++) {
            try {
                var us = await _skh.getDoc(_skh.doc(_skh.db, 'users', needs[i]));
                if (us && us.exists && us.exists()) { var u = us.data() || {}; out[needs[i]].name = u.fullName || u.displayName || u.username || needs[i]; }
            } catch (e2) {}
        }
        rows = Object.values(out).map(function (r) { if (!r.name) r.name = r.uid; return r; });
        rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
        return rows;
    };

    /* ================= CONTACT PICKER (§22: Search + Role filters + Multi-select + Chagua wote) ================= */
    /* opts: { multi:true/false, preselect:[uids], onDone(uidsOrUid) }  */
    var PKR = { sel: {}, opts: null };
    window.skhContactPicker = async function (opts) {
        PKR.opts = opts || {};
        PKR.sel = {};
        PKR.data = null; PKR.filter = 'all';   // [R22] kila ufunguzi: fresh data + Wote (filter stales si cache)
        (PKR.opts.preselect || []).forEach(function (u) { PKR.sel[u] = true; });
        var m = document.getElementById('skhContactPicker');
        if (!m) {
            m = document.createElement('div');
            m.id = 'skhContactPicker';
            m.style.cssText = 'display:none;position:fixed;inset:0;z-index:100060;align-items:center;justify-content:center;background:rgba(15,23,42,.55);';
            m.innerHTML = '<div style="background:#fff;border-radius:20px;padding:18px;width:92%;max-width:400px;max-height:86vh;overflow-y:auto;font-family:inherit;">'
                + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
                + '<b style="font-size:15px;color:#0f172a;" id="skhPkrTitle">' + tk('pkr_title', 'Chagua Contacts') + '</b>'
                + '<button type="button" data-pkr="close" style="border:none;background:#f1f5f9;width:30px;height:30px;border-radius:50%;cursor:pointer;font-weight:800;">&times;</button></div>'
                + '<input id="skhPkrQ" type="text" placeholder="' + tk('pkr_search', 'Tafuta jina...') + '" style="width:100%;padding:11px 12px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:14px;margin-bottom:8px;">'
                + '<div id="skhPkrFilters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"></div>'
                + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
                + '<small id="skhPkrCount" style="color:#64748b;"></small>'
                + '<button type="button" id="skhPkrAll" style="border:1px solid #1268A8;color:#1268A8;background:#fff;font-weight:800;font-size:11.5px;padding:6px 11px;border-radius:99px;cursor:pointer;">' + tk('pkr_all', 'Chagua wote') + '</button></div>'
                + '<div id="skhPkrList" style="max-height:46vh;overflow-y:auto;"></div>'
                + '<button type="button" id="skhPkrDone" style="width:100%;margin-top:14px;padding:13px;background:#1268A8;color:#fff;border:none;border-radius:12px;font-weight:900;font-size:14px;cursor:pointer;"></button>'
                + '</div>';
            document.body.appendChild(m);
            m.querySelector('#skhPkrQ').addEventListener('input', pickerRender);
            m.querySelector('#skhPkrAll').addEventListener('click', async function () {
                // §22: "Chagua wote" = WOTE WANAONEKANA ALIVYO current filtered/search result
                var vis = await pkrVisible();
                (vis || []).forEach(function (c) { PKR.sel[c.uid] = true; });
                pickerRender();
            });
            m.querySelector('#skhPkrDone').addEventListener('click', function () {
                var multi = !!(PKR.opts && PKR.opts.multi);
                var cb = PKR.opts && PKR.opts.onDone;
                var uids = Object.keys(PKR.sel).filter(function (u) { return PKR.sel[u]; });
                pickerClose();   // inafuta PKR.opts — kwa hiyo urecapture kwanza (R22 fix)
                if (cb) cb(multi ? uids : (uids[0] || null));
            });
            m.addEventListener('click', function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest('[data-pkr]') : null;
                if (!b) return;
                if (b.getAttribute('data-pkr') === 'close') pickerClose();
            });
        }
        m.querySelector('#skhPkrTitle').textContent = PKR.opts.multi ? tk('pkr_title_multi', 'Chagua Contacts (wengi)') : tk('pkr_title', 'Chagua Contact');
        m.querySelector('#skhPkrDone').textContent = PKR.opts.multi ? tk('pkr_done_multi', 'Endelea → Unda Kikundi') : tk('pkr_done', 'Endelea');
        m.querySelector('#skhPkrQ').value = '';
        m.style.display = 'flex';
        pickerRender();
    };
    function pickerClose() { var m = document.getElementById('skhContactPicker'); if (m) m.style.display = 'none'; PKR.opts = null; PKR.sel = {}; }
    function roleLabel(r) {
        r = String(r || '').toLowerCase();
        if (r.indexOf('seller') >= 0 || r === 'store') return 'seller';
        if (r.indexOf('transp') >= 0 || r === 'driver') return 'transport';
        if (r === 'agent') return 'agent';
        if (r === 'buyer') return 'buyer';
        return '';
    }
    PKR.data = null; PKR.filter = 'all';
    async function pkrVisible() {
        if (!PKR.data) PKR.data = await window.skhMyContactsList();
        var q = (document.getElementById('skhPkrQ') || { value: '' }).value.toLowerCase();
        return PKR.data.filter(function (c) {
            if (PKR.filter !== 'all' && roleLabel(c.role) !== PKR.filter) return false;
            if (q && c.name.toLowerCase().indexOf(q) === -1) return false;
            return true;
        });
    }
    async function pickerRender() {
        var host = document.getElementById('skhPkrList');
        if (host) host.innerHTML = '<small style="color:#64748b;display:block;text-align:center;padding:16px;">' + tk('loading', 'Inapakia...') + '</small>';
        var vis = await pkrVisible();
        var mult = PKR.opts && PKR.opts.multi;
        var filters = [['all', tk('pkr_f_all', 'Wote')], ['seller', tk('pkr_f_seller', 'Wauzaji')], ['buyer', tk('pkr_f_buyer', 'Wanunuzi')], ['transport', tk('pkr_f_transp', 'Wasafirishaji')], ['agent', tk('pkr_f_agent', 'Mawakala')]];
        document.getElementById('skhPkrFilters').innerHTML = filters.map(function (f) {
            return '<button type="button" data-pkrf="' + f[0] + '" style="border:1px solid ' + (PKR.filter === f[0] ? '#1268A8' : '#cbd5e1') + ';background:' + (PKR.filter === f[0] ? '#1268A8;color:#fff' : '#fff;color:#334155') + ';font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:99px;cursor:pointer;">' + f[1] + '</button>';
        }).join('');
        document.getElementById('skhPkrCount').textContent = vis.length + ' ' + tk('pkr_shown', 'wameonyeshwa');
        host.innerHTML = vis.length ? vis.map(function (c) {
            var on = !!PKR.sel[c.uid];
            return '<div data-pkruid="' + esc(c.uid) + '" style="display:flex;gap:10px;align-items:center;padding:9px;border:1px solid ' + (on ? '#1268A8' : '#e2e8f0') + ';border-radius:12px;margin-bottom:6px;background:' + (on ? '#eef6fc' : '#fff') + ';cursor:pointer;">'
                + (mult ? '<span style="width:20px;height:20px;border-radius:6px;border:2px solid ' + (on ? '#1268A8' : '#cbd5e1') + ';background:' + (on ? '#1268A8' : '#fff') + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;">' + (on ? '✓' : '') + '</span>' : '')
                + '<div style="flex:1;min-width:0;"><b style="display:block;font-size:13.5px;color:#0f172a;">' + esc(c.name) + '</b>'
                + '<small style="color:#64748b;font-size:11.5px;text-transform:capitalize;">' + esc(roleLabel(c.role) || 'user') + '</small></div>'
                + '</div>';
        }).join('') : '<small style="color:#94a3b8;display:block;text-align:center;padding:18px;">' + tk('pkr_none', 'Hakuna contacts bado — wasiliane na mtu kwanza au tumia 🔎 Discover.') + '</small>';
        host.onclick = function (ev) {
            var r = ev.target && ev.target.closest ? ev.target.closest('[data-pkruid]') : null;
            if (!r) return;
            var u = r.getAttribute('data-pkruid');
            if (PKR.opts && PKR.opts.multi) { PKR.sel[u] = !PKR.sel[u]; pickerRender(); }
            else { PKR.sel = {}; PKR.sel[u] = true; var cb = PKR.opts && PKR.opts.onDone; pickerClose(); if (cb) cb(u); }
        };
        document.getElementById('skhPkrFilters').onclick = function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-pkrf]') : null;
            if (!b) return;
            PKR.filter = b.getAttribute('data-pkrf');
            pickerRender();
        };
    }

    /* ---------------- create modal (identity → Choose Contacts → purpose/type → ctx → create) ---------------- */
    function openCreateModal(pre) {
        var m = document.getElementById('skhGrpCreateModal');
        if (!m) { buildCreateModal(); m = document.getElementById('skhGrpCreateModal'); }
        PRESEL = Array.isArray(pre) ? pre.slice() : [];
        pickerSeedState();
        m.style.display = 'flex';
        m.querySelector('#skhGrpName').focus();
    }
    window.skhOpenGroupCreateModal = openCreateModal;
    var PRESEL = [];
    function pickerSeedState() {
        var cnt = document.getElementById('skhGrpPickCount');
        if (cnt) cnt.textContent = PRESEL.length + ' ' + tk('grp_pick_n', 'wamechaguliwa');
    }
    function sel(id, label, options, val) {
        return '<label style="font-size:12px;font-weight:700;color:#334155;display:block;margin:10px 0 4px;">' + label + '</label>'
            + '<select id="' + id + '" style="width:100%;padding:11px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:13.5px;background:#fff;">'
            + options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('')
            + '</select>';
    }
    function buildCreateModal() {
        var m = document.createElement('div');
        m.id = 'skhGrpCreateModal';
        m.style.cssText = 'display:none;position:fixed;inset:0;z-index:100003;align-items:center;justify-content:center;background:rgba(15,23,42,.55);';
        m.innerHTML = '<div style="background:#fff;border-radius:20px;padding:20px;width:92%;max-width:420px;max-height:88vh;overflow-y:auto;font-family:inherit;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
            + '<b style="font-size:15px;color:#0f172a;">' + tk('grp_create_title', 'Unda Kikundi') + '</b>'
            + '<button type="button" data-act="grp-close-create" style="border:none;background:#f1f5f9;width:30px;height:30px;border-radius:50%;cursor:pointer;font-weight:800;">&times;</button></div>'
            + '<input id="skhGrpName" type="text" placeholder="' + tk('grp_name_ph', 'Jina la kikundi (mf: "Tununue Mchele — Tabora")') + '" style="width:100%;padding:12px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:14px;margin-top:6px;">'
            + '<input id="skhGrpDesc" type="text" placeholder="' + tk('grp_desc_ph', 'Maelezo mafupi (si lazima)') + '" style="width:100%;padding:12px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:14px;margin-top:8px;">'
            // [R22 §11/§22] CHOOSE CONTACTS step
            + '<div style="margin-top:12px;padding:12px;border:1.5px dashed #cbd5e1;border-radius:12px;background:#fbfdff;">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;">'
            + '<b style="font-size:12.5px;color:#0f172a;">👥 ' + tk('grp_pick_contacts', 'Chagua Contacts') + ' <small id="skhGrpPickCount" style="color:#1268A8;"></small></b>'
            + '<button type="button" id="skhGrpPickBtn" style="border:1px solid #1268A8;color:#1268A8;background:#fff;font-weight:800;font-size:11.5px;padding:7px 11px;border-radius:99px;cursor:pointer;">' + tk('grp_pick_go', 'Chagua...') + '</button></div>'
            + '<small style="color:#64748b;font-size:11px;display:block;margin-top:5px;">' + tk('grp_pick_hint', 'Search · role filters · multi-select · "Chagua wote" = iliyo-filtered. Watu watapewa mwaliko.') + '</small></div>'
            + sel('skhGrpType', tk('grp_type', 'Aina ya kikundi'), [['TEMPORARY_COMMERCE', tk('grp_type_temp', 'Ya muda (lengo la commerce)')], ['PERMANENT_COMMUNITY', tk('grp_type_perm', 'Community ya muda mrefu')]], 'TEMPORARY_COMMERCE')
            + sel('skhGrpVis', tk('grp_visibility', 'Mwonekano'), [['public', tk('grp_vis_public', 'Hadharani (waweza kuona)')], ['private', tk('grp_vis_private', 'Binafsi (vialio tu)')]], 'public')
            + sel('skhGrpJoin', tk('grp_join_policy', 'Nani anaweza kujiunga'), [['open', tk('grp_join_open', 'Wazi — kujiunga mara moja')], ['request', tk('grp_join_request', 'Omba — idhini ya admin')]], 'open')
            + sel('skhGrpCtxType', tk('grp_ctx', 'Context ya commerce (kwa soga ya pamoja)'), [['GENERAL', tk('grp_ctx_general', 'Ya kawaida (community)')], ['GROUP_BUY', 'Group Buy'], ['WHOLESALE', 'Wholesale / Group Order'], ['TRANSPORT', tk('grp_ctx_transport', 'Uratibu wa usafiri')], ['PRODUCT', tk('grp_ctx_product', 'Bidhaa maalum')], ['SERVICE', tk('grp_ctx_service', 'Huduma maalum')]], 'GENERAL')
            + '<input id="skhGrpCtxId" type="text" placeholder="' + tk('grp_ctx_id_ph', 'Context ID (si lazima) — mf: productId wa Group Buy') + '" style="width:100%;padding:12px;border:1.5px solid #cbd5e1;border-radius:10px;font-size:13.5px;margin-top:10px;">'
            + '<button id="skhGrpDoCreate" type="button" style="width:100%;margin-top:16px;padding:14px;background:#1268A8;color:#fff;border:none;border-radius:12px;font-weight:900;font-size:14px;cursor:pointer;">' + tk('grp_create_now', 'UNDA KIKUNDI') + '</button>'
            + '</div>';
        document.body.appendChild(m);
        m.querySelector('#skhGrpPickBtn').addEventListener('click', function () {
            PKR.data = null;
            window.skhContactPicker({
                multi: true, preselect: PRESEL,
                onDone: function (uids) { PRESEL = (uids || []).slice(); pickerSeedState(); }
            });
        });
        m.querySelector('#skhGrpDoCreate').addEventListener('click', async function () {
            var r = await window.skhGroupCreate({
                name: m.querySelector('#skhGrpName').value,
                description: m.querySelector('#skhGrpDesc').value,
                groupType: m.querySelector('#skhGrpType').value,
                visibility: m.querySelector('#skhGrpVis').value === 'public' ? 'public' : 'private',
                joinPolicy: m.querySelector('#skhGrpJoin').value === 'request' ? 'request' : 'open',
                contextType: (m.querySelector('#skhGrpCtxType') || {}).value || 'GENERAL',
                contextId: (m.querySelector('#skhGrpCtxId') || {}).value ? m.querySelector('#skhGrpCtxId').value.trim() : null
            });
            if (!r) return;
            // waalike wateule waliochaguliwa (membership ni kwa consent — §21/§16)
            var sent = 0;
            for (var i = 0; i < PRESEL.length; i++) { try { var iv = await window.skhGroupInvite(r.id, PRESEL[i]); if (iv && iv.ok) sent++; } catch (eIV) {} }
            m.style.display = 'none';
            PRESEL = [];
            try {
                if (window.showToast) window.showToast(sent
                    ? tk('grp_created_inv', 'Kikundi kimeundwa ✓ + vialio: ') + sent
                    : tk('grp_created_ok', 'Kikundi kimeundwa ✓'), 'success');
            } catch (eT) {}
            try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR) {}
            try { if (window.skhOpenGroupSoga) window.skhOpenGroupSoga(r.id); } catch (eO) {}
            try { if (window.skhDiscoverSearch) window.skhDiscoverSearch('', 'all'); } catch (eR2) {}
        });
    }

    /* ---------------- delegation ---------------- */
    document.addEventListener('click', function (ev) {
        try {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-act], [data-spm]') : null;
            if (!b) return;
            var spm = b.getAttribute && b.getAttribute('data-spm');
            if (spm) {
                var mm = document.getElementById('skhSogaPlusMenu'); if (mm) mm.remove();
                PKR.data = null;
                if (spm === 'contact') {
                    window.skhContactPicker({ multi: false, onDone: function (u, n) {
                        if (!u) return; closeAll();
                        var c = (PKR.data || []).find(function (x) { return x.uid === u; });
                        try { window.openChatWithUser ? window.openChatWithUser(u, (c && c.name) || '') : (window.skhChatOpen && window.skhChatOpen(u, (c && c.name) || '', {})); } catch (eC) {}
                    } });
                } else if (spm === 'contacts') {
                    window.skhContactPicker({ multi: true, onDone: function (uids) { if (uids && uids.length) openCreateModal(uids); else openCreateModal(); } });
                } else if (spm === 'creategrp') openCreateModal();
                return;
            }
            var act = b.getAttribute('data-act');
            if (act === 'grp-close-create') document.getElementById('skhGrpCreateModal').style.display = 'none';
            else if (act === 'grp-invite-accept' || act === 'grp-invite-decline') {
                var row2 = b.closest('.skh-grp-inv');
                var gid2 = row2 ? row2.getAttribute('data-gid') : null;
                if (!gid2) return;
                (async function () {
                    var rr = await window.skhGroupInviteRespond(gid2, act === 'grp-invite-accept');
                    if (!rr) return;
                    try {
                        if (window.showToast) window.showToast(
                            rr.declined ? tk('grp_inv_declined', 'Umekataa mwaliko.')
                                : rr.already ? tk('grp_already', 'Tayari wewe ni mwanachama')
                                : tk('grp_joined', 'Umejiunga kikundi hiki!'), rr.declined ? 'info' : 'success');
                    } catch (eT) {}
                    renderInvites();
                    try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR) {}
                    if (rr.ok && window.skhOpenGroupSoga) window.skhOpenGroupSoga(gid2);
                })();
            }
            else if (act === 'grp-leave') {
                var row = b.closest('.skh-grp-row');
                var gid = row ? row.getAttribute('data-gid') : null;
                if (!gid) return;
                (async function () {
                    await window.skhGroupLeave(gid);
                    try { if (window.showToast) window.showToast(tk('grp_left', 'Umetoka kikundi'), 'info'); } catch (eT) {}
                    renderInvites();
                    try { if (window.skhChatReloadInbox) window.skhChatReloadInbox(); } catch (eR) {}
                })();
            }
        } catch (e) {}
    }, true);

    // MO: tengeneza block MARA MOJA tu — HAKUNA render per mutation (R21 hammering fix) + debounce 300ms for blink fix
    if (typeof MutationObserver !== 'undefined') {
        var _moT=null;
        var mo = new MutationObserver(function () {
            if (_moT) return;
            _moT=setTimeout(function(){
                _moT=null;
                // skip during instant open flow to avoid flicker
                try {
                    if (window.__skhOpening && (Date.now()-window.__skhOpening.at)<1000) return;
                } catch(e){}
                var list = document.getElementById('inboxList');
                if (list && !document.getElementById('skhInboxGroupsBlock')) ensureCreateButton();
            }, 300);
        });
        var boot = function () { try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {} };
        if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
    }
    document.addEventListener('DOMContentLoaded', ensureCreateButton);
})();

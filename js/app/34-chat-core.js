/* ==== js/app/34-chat-core.js ====
   SOKOHAI — COMMERCE CHAT CORE (Phase 2–4)
   ------------------------------------------------------------
   Mkakati (ADDITIVE, haubadili mifumo iliyopo):
   - Tunatumia collection MPYA `conversations` (na subcollection `messages`)
     yenye mfano wa conversation halisi (participants, related, unread,
     lastReadAt, typing) — badala ya kuendelea kutegemea meseji tambarare
     za `chats` pekee.
   - Backward-compatible: kila ujumbe mpya unaandikwa PIA kwenye `chats`
     (dual-write) ili UI ya zamani / wateja wa zamani waendelee kuona.
   - `sendMessage`, `openChatList`, `openChatWithUser`, `resumeChat`, `startChat` zina-override hapa ili kutoa uzoefu mpya (reply/edit/
     delete/copy, read receipts, typing, inbox yenye tabs, kadi za
     bidhaa/oda/usafirishaji) BILA kugusa faili za zamani.
   - Arifa: tunatumia mfumo ULIOPO wa `notifications` (skhEngageSendNotif
     ikiwa ipo; la sivyo andika moja kwa moja) — hakuna mfumo mpya.
   - Malipo/Uwasilishaji: chat HAIBADILISHI payment/delivery state —
     kadi za oda/usafirishaji zinafungua UI halisi iliyopo.
   - Tokeni za Pickup/Handover HAZIANDIKWI kwenye chat kamwe.
   ============================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    // ---------- Tafsiri (lugha moja kwa wakati) ----------
    function T(key, en, vars) {
        var s = null;
        try { if (window.t) s = window.t(key, vars); } catch (e) {}
        if (!s || s === key) {
            s = en;
            if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
        }
        return s;
    }

    function nowIso() { return new Date().toISOString(); }
    function esc(s) { return skh.skhEscape(s == null ? '' : String(s)); }
    function jsEsc(s) { return skh.skhJsEsc(s == null ? '' : String(s)); }
    function myUid() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function myName() {
        if (skh.currentUser && skh.currentUser.displayName) return skh.currentUser.displayName;
        if (skh.currentUser && skh.currentUser.email) return skh.currentUser.email.split('@')[0];
        return 'Mimi';
    }
    function truncate(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function fmtTime(iso) {
        if (typeof window.skhChatTime === 'function') return window.skhChatTime(iso);
        try { var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(); } catch (e) { return ''; }
    }

    // ---------- Arifa (reuse) ----------
    function notify(uid, title, body, type, meta) {
        if (!uid) return Promise.resolve();
        if (typeof window.skhEngageSendNotif === 'function') {
            try { return window.skhEngageSendNotif(uid, title, body, type || 'chat', meta || {}); } catch (e) {}
        }
        try {
            return skh.addDoc(skh.collection(skh.db, 'notifications'), Object.assign({
                userId: uid, title: title, body: body, createdAt: nowIso(), read: false, type: type || 'chat'
            }, meta || {}));
        } catch (e) { return Promise.resolve(); }
    }

    // ---------- ID ya conversation (deterministic & canonical) ----------
    function sanitizeCtx(c) { return String(c || '').replace(/[^A-Za-z0-9_-]/g, ''); }
    function convIdFor(partnerUid, ctx) {
        var me = myUid();
        var sorted = [me, partnerUid].sort().join('_');
        return 'conv_' + sorted;
    }
    window.skhChatConvId = convIdFor;

    // ---------- Meta ya mshiriki (snapshot ndogo) ----------
    async function participantMeta(uid) {
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'users', uid));
            if (s && s.exists && s.exists()) {
                var u = s.data();
                return {
                    uid: uid,
                    name: u.displayName || u.fullName || u.storeName || 'Mwanachama SokoHai',
                    photo: u.photoURL || u.profileImage || u.logo || '',
                    role: u.role || 'user',
                    verified: !!(u.verificationStatus === 'verified' || u.verified === true)
                };
            }
        } catch (e) { /* fallback */ }
        return { uid: uid, name: 'Mwanachama SokoHai', photo: '', role: 'user', verified: false };
    }

    // ---------- Hakikisha conversation ipo ----------
    async function ensureConversation(partnerUid, opts) {
        opts = opts || {};
        var me = myUid();
        var ctx = opts.ctx || '';
        var id = convIdFor(partnerUid, ctx);
        var ref = skh.doc(skh.db, 'conversations', id);
        try {
            var snap = await skh.getDoc(ref);
            if (snap && snap.exists && snap.exists()) {
                return { id: id, ref: ref, data: snap.data(), created: false };
            }
            var a = await participantMeta(me);
            var b = await participantMeta(partnerUid);
            var meta = {}; meta[a.uid] = a; meta[b.uid] = b;
            // [CTX-LEAK FIX] related kutoka globals KAMA TU partner ndiye
            // mmiliki wa kipengele — kamwe tusandike related ya tangazo la mtu
            // mwingine kwenye conversation hii (hili ndilo lililotengeneza
            // "product cards kila inbox hata sio muuzaji husika").
            var related = opts.related || scopedRelatedForPartner(partnerUid);
            var unread = {}; unread[me] = 0; unread[partnerUid] = 0;
            var doc = {
                type: opts.type || 'direct',
                participants: [me, partnerUid].sort(),
                participantMeta: meta,
                related: related,
                lastMessage: null,
                lastMessageAt: null,
                unread: unread,
                lastReadAt: {},
                typing: null,
                createdAt: nowIso(),
                updatedAt: nowIso(),
                status: 'active'
            };
            await skh.setDoc(ref, doc);
            return { id: id, ref: ref, data: doc, created: true };
        } catch (e) {
            return { id: id, ref: ref, data: null, created: false };
        }
    }

    // ---------- Dual-write kwenye `chats` (legacy compat) ----------
    function writeLegacy(msg, preview, partnerUid, partnerName) {
        var me = myUid();
        var myEmail = (skh.currentUser && skh.currentUser.email || '').toLowerCase();
        var theirEmail = (skh.currentChatEmail || '').toLowerCase();
        try {
            return skh.addDoc(skh.collection(skh.db, 'chats'), {
                text: msg.mediaReference ? (' Attachment: ' + msg.mediaReference) : preview,
                sender: myEmail,
                receiver: theirEmail,
                senderUid: me,
                receiverUid: partnerUid,
                senderName: msg.senderName || myName(),
                receiverName: partnerName || 'Mawasiliano',
                createdAt: msg.createdAt || nowIso(),
                productId: msg.productRef ? msg.productRef.id : null,
                productTitle: msg.productSnapshot ? msg.productSnapshot.title : null,
                productImg: msg.productSnapshot ? msg.productSnapshot.image : null,
                productCollection: msg.productRef ? msg.productRef.collection : null,
                sellerUid: msg.productSnapshot ? msg.productSnapshot.sellerId : null,
                conversationId: (skh.chatCore && skh.chatCore.convId) || null
            });
        } catch (e) { return Promise.resolve(); }
    }

    // ---------- Block ----------
    async function blockedByMe(uid) {
        var me = myUid();
        if (!me || !uid) return false;
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'chatBlocks', me + '__' + uid));
            return !!(s && s.exists && s.exists());
        } catch (e) { return false; }
    }
    async function blockedByThem(uid) {
        var me = myUid();
        if (!me || !uid) return false;
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'chatBlocks', uid + '__' + me));
            return !!(s && s.exists && s.exists());
        } catch (e) { return false; }
    }
    window.skhChatBlockedByMe = blockedByMe;
    async function isBlockedEither(uid) {
        return (await blockedByMe(uid)) || (await blockedByThem(uid));
    }

    // ---------- Tuma ujumbe ----------
    async function sendInternal(text, opts) {
        opts = opts || {};
        var me = myUid();
        var core = skh.chatCore || {};
        var partnerUid = opts.partnerUid || core.partnerUid;
        var convId = opts.conversationId || core.convId;
        if (!me || !partnerUid || !convId) return { ok: false, error: 'no_partner' };

        if (await isBlockedEither(partnerUid)) return { ok: false, error: 'blocked' };

        // [ANTI-SPAM 2026-09] Rate limit (1 ujumbe / sekunde) + duplicate (3s).
        // [COMMERCE] Matukio ya MFUMO (ofa/oda/malipo) hayapitiwi kizingiti —
        // huandaliwa na programu kwa mlolongo (k.m. oda mara baada ya makubaliano).
        var nowTs = Date.now();
        if (!skh._noChatThrottle && !opts.system) {
            var last = core._lastSend || 0;
            if (nowTs - last < 1000) { alert(T('ch_slow_down', 'Unatuma haraka sana. Subiri kidogo.')); return { ok: false, error: 'rate_limited' }; }
            if (opts.type !== 'image' && opts.type !== 'video' && opts.type !== 'audio' && opts.type !== 'file') {
                var dupKey = String(text || '').trim();
                if (dupKey && core._lastText === dupKey && nowTs - (core._lastTextAt || 0) < 3000) {
                    alert(T('ch_duplicate', 'Ujumbe unaorudiwa umerukwa.')); return { ok: false, error: 'duplicate' };
                }
                core._lastText = dupKey; core._lastTextAt = nowTs;
            }
        }
        if (!opts.system) core._lastSend = nowTs;

        var type = opts.type || 'text';
        var msg = { senderId: me, type: type, createdAt: nowIso(), readBy: [me], replyToId: opts.replyToId || null, system: !!opts.system };
        var previewText = text;

        // Bidhaa iliyoambatishwa (product chat) inakuwa ujumbe wa aina 'product'.
        // [CTX-LEAK FIX] Ambatisha TU ikiwa partner ndiye mmiliki wa bidhaa —
        // hakuna tena "mapicha ya bidhaa ng'eni kwenye DM ya mtu mwingine".
        if (skh.activeChatProduct && skh.activeChatProduct.id && !opts.type
            && ctxOwnerOf(skh.activeChatProduct) === partnerUid) {
            type = 'product';
            msg.type = type;
            msg.productRef = { id: skh.activeChatProduct.id, collection: skh.activeChatProduct.collectionName || skh.currentFeedCollection || 'products' };
            msg.productSnapshot = {
                title: skh.activeChatProduct.title || skh.activeChatProduct.itemTitle || 'Bidhaa',
                price: skh.activeChatProduct.price != null ? skh.activeChatProduct.price : null,
                image: skh.activeChatProduct.image || (skh.activeChatProduct.images && skh.activeChatProduct.images[0]) || skh.activeChatProduct.photo || '',
                sellerId: skh.activeChatProduct.userId || null,
                sellerName: skh.activeChatProduct.ownerName || ''
            };
            msg.text = text || '';
            previewText = 'Bidhaa: ' + (msg.productSnapshot.title || 'Bidhaa');
        } else if (type === 'text') {
            msg.text = text;
        } else {
            msg.text = text || '';
            if (opts.product) { msg.productRef = opts.product.ref; msg.productSnapshot = opts.product.snapshot; previewText = 'Bidhaa: ' + (opts.product.snapshot && opts.product.snapshot.title || 'Bidhaa'); }
            if (opts.service) { msg.serviceRef = opts.service.ref; msg.serviceSnapshot = opts.service.snapshot; previewText = 'Huduma: ' + ((opts.service.snapshot && opts.service.snapshot.title) || 'Huduma'); }
            if (opts.transport) { msg.transportRef = opts.transport.ref; msg.transportSnapshot = opts.transport.snapshot; previewText = 'Usafiri: ' + ((opts.transport.snapshot && opts.transport.snapshot.title) || 'Usafiri'); }
            if (opts.order) { msg.orderRef = { orderId: opts.order.orderId }; msg.orderSnapshot = opts.order.snapshot; previewText = 'Oda: ' + ((opts.order.snapshot && opts.order.snapshot.orderId) || 'Oda'); }
            if (opts.delivery) { msg.deliveryRef = { deliveryId: opts.delivery.deliveryId }; msg.deliverySnapshot = opts.delivery.snapshot; previewText = 'Usafirishaji: ' + ((opts.delivery.snapshot && opts.delivery.snapshot.cargoName) || 'Usafirishaji'); }
            if (opts.offerId) { msg.offerId = opts.offerId; if (opts.offer) msg.offerSnapshot = opts.offer.snapshot; previewText = 'Ofa: ' + ((opts.offer && opts.offer.snapshot && opts.offer.snapshot.productTitle) || T('ch_offer', 'Ofa')); }
            if (opts.negotiationId) {
                msg.negotiationId = opts.negotiationId;
                if (opts.nego) msg.negotiationSnapshot = opts.nego.snapshot;
                // [COMMERCE 2026-09] Preview type-aware (spec §6/§10/§12).
                var _ns = opts.nego && opts.nego.snapshot;
                var _nt = (window.skhNego && window.skhNego.commerceTitleOf) ? window.skhNego.commerceTitleOf(_ns || {}) : ((_ns && (_ns.productTitle || _ns.serviceTitle || _ns.transportTitle)) || '');
                previewText = 'Majadiliano: ' + (_nt || T('ch_offer', 'Majadiliano'));
            }
            if (opts.location) { msg.location = opts.location; previewText = '' + (window.skhNavIcon?window.skhNavIcon('map',14):'') + '' + (opts.location.name || T('ch_location', 'Mahali')); }
        }
        if (opts.mediaReference) { msg.mediaReference = opts.mediaReference; previewText = mediaPreviewLabel(type, opts.mediaMeta); }
        // [FILE TYPES 2026-09-17] Hifadhi meta (jina/size/mime) ili kadi ya
        // faili ionyeshe AINA HALISI — hakuna fake data: chanzo ni File halisi.
        if (opts.mediaMeta) msg.mediaMeta = opts.mediaMeta;
        msg.senderName = myName();
        msg.senderPhoto = (skh.currentUserData && skh.currentUserData.photoURL) || (skh.currentUser && skh.currentUser.photoURL) || null;

        var convRef = skh.doc(skh.db, 'conversations', convId);
        // [COMMERCE 2026-09] opts.docId → kitambulisho THABITI cha ujumbe
        // (idempotent): tukio la 'payment_protected' liandikwe mara moja tu
        // hata kama mteja na server (IPN) wote wakijaribu kulituma.
        var msgCol = skh.collection(skh.db, 'conversations/' + convId + '/messages');
        var added = opts.docId
            ? await skh.setDoc(skh.doc(skh.db, 'conversations/' + convId + '/messages', opts.docId), msg)
            : await skh.addDoc(msgCol, msg);

        // [MUTE 2026-09] Kama mwenzake ameweka conversation KIMYA, usimtumie arifa.
        var partnerMuted = false;
        // Sasisha conversation (lastMessage + unread kwa mwenzako) — read-modify-write.
        try {
            var cs = await skh.getDoc(convRef);
            var cd = (cs && cs.exists && cs.exists()) ? cs.data() : {};
            partnerMuted = !!(cd.muted && cd.muted[partnerUid]);
            var unread = Object.assign({}, cd.unread || {});
            unread[partnerUid] = (unread[partnerUid] || 0) + 1;
            // [§15-§16 R8 CHAT DELETE] Ujumbe mpya luỵungezi uifunguliwe tena —
            // kumbukumbu ya `deletedForUser` inafutwa kwa MWENZAKE (na hata mimi,
            // kwa sababu mazungumzo yameendelea). Kuachiana-kunde hails hupotelea.
            var hidden = Object.assign({}, cd.deletedForUser || {});
            var hiddenDirty = false;
            if (hidden[partnerUid]) { hidden[partnerUid] = false; hiddenDirty = true; }
            if (hidden[me]) { hidden[me] = false; hiddenDirty = true; }
            var convPatch = {
                lastMessage: { text: truncate(previewText, 120), senderId: me, at: nowIso(), type: type },
                lastMessageAt: nowIso(),
                updatedAt: nowIso(),
                unread: unread
            };
            if (hiddenDirty) convPatch.deletedForUser = hidden;
            await skh.updateDoc(convRef, convPatch);
            // [DRAFT 2026-09] Futa rasimu yangu baada ya kutuma (spec §12).
            var drafts = Object.assign({}, cd.drafts || {});
            if (drafts[me]) { delete drafts[me]; skh.updateDoc(convRef, { drafts: drafts }).catch(function () {}); }
        } catch (e) { /* si kikwazo */ }

        // Dual-write kwa legacy `chats` (backward compatible).
        // [DELIVERY/INTERNAL FIX 2026-09] Ujumbe wa MFUMO (ofa/oda/delivery)
        // hauandikwi kwenye legacy `chats` — server ndiye chanzo cha kweli,
        // na migrateLegacyChats ingeurudisha kama ujumbe wa pili (duplicate).
        if (!opts.system) await writeLegacy(msg, previewText, partnerUid, core.partnerName);

        // Arifa kupitia mfumo uliopo.
        // [DELIVERY/INTERNAL FIX 2026-09] Ujumbe wa MFUMO hauarifu tena kupitia
        // chat — server tayari inatuma arifa maalum ("' + (window.skhNavIcon?window.skhNavIcon('wallet',14):'') + 'Ofa Mpya", "' + (window.skhNavIcon?window.skhNavIcon('handshake',14):'') + 'Ofa
        // Imekubaliwa", n.k.) ili mwenzake asipate arifa MBILI kwa kitendo kimoja.
        if (!opts.system && !partnerMuted) {
            notify(partnerUid, T('ch_new_msg_title', 'Ujumbe Mpya', { name: core.partnerName || '' }),
                previewText, 'chat', { conversationId: convId });
        }

        // Futa bidhaa iliyoambatishwa baada ya ujumbe wa kwanza (kama legacy).
        if (skh.activeChatProduct) {
            skh.activeChatProduct = null;
            if (typeof window.skhRenderAttachedProduct === 'function') window.skhRenderAttachedProduct();
        }
        return { ok: true, id: added && added.id, conversationId: convId };
    }
    function mediaPreviewLabel(type, meta) {
        if (type === 'image') return '' + (window.skhNavIcon?window.skhNavIcon('camera',14):'') + '' + T('ch_image', 'Picha');
        if (type === 'video') return '🎬 ' + T('ch_video', 'Video');
        if (type === 'audio') return '' + T('ch_audio', 'Sauti');
        // [FILE TYPES 2026-09-17] preview ya inbox ijionyeshe aina + jina la faili
        var nm = (meta && meta.name) ? String(meta.name) : '';
        var ex = nm ? fileExtOf(nm, '') : '';
        if (ex) return '' + T('ch_file', 'Faili') + ' ' + ex + (nm ? ': ' + nm : '');
        return '' + (window.skhNavIcon?window.skhNavIcon('tag',14):'') + '' + T('ch_file', 'Faili') + (nm ? ': ' + nm : '');
    }

    // API ya moja kwa moja ya kutuma (pia inatumika kwenye share cards + tests).
    window.skhChatSendMessage = function (text, opts) { return sendInternal(text, opts || {}); };

    /* ---------- UCHORAJI (render) ---------- */
    // [FILE TYPES 2026-09-17] "zip file harafu hatofautish" — aina ya faili
    // sasa inaonekana wazi: kipini cha extension + jina + ukubwa.
    // Hakuna fake: zote hutoka File halisi (mediaMeta) au URL path.
    function fileExtOf(name, url) {
        var src = String(name || '') || String(url || '');
        if (!src) return '';
        // defer madirisha ya query/hash kutoka URL kabla ya kutafuta dot ya mwisho
        src = src.split('#')[0].split('?')[0];
        var m = src.match(/\.([A-Za-z0-9]{1,5})$/);
        return m ? m[1].toUpperCase() : '';
    }
    function fileKindOf(ext, mime) {
        ext = String(ext || '').toLowerCase();
        mime = String(mime || '').toLowerCase();
        if (/^(zip|rar|7z|tar|gz|bz2)$/.test(ext) || /zip|compressed/.test(mime)) return 'archive';
        if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
        if (/^(doc|docx|odt)$/.test(ext) || /word|officedocument\.word/.test(mime)) return 'doc';
        if (/^(xls|xlsx|csv|ods)$/.test(ext) || /excel|spreadsheet|csv/.test(mime)) return 'sheet';
        if (/^(ppt|pptx|odp)$/.test(ext)) return 'slide';
        if (/^(txt|md|rtf|log)$/.test(ext) || /^text\//.test(mime)) return 'text';
        if (/^(apk|aab)$/i.test(ext)) return 'apk';
        return 'file';
    }
    var FILE_KIND_STYLE = {
        archive: { bg: '#7c2d12', fg: '#fff7ed', label: 'ZIP' },
        pdf:     { bg: '#b91c1c', fg: '#fef2f2', label: 'PDF' },
        doc:     { bg: '#1d4ed8', fg: '#eff6ff', label: 'DOC' },
        sheet:   { bg: '#15803d', fg: '#f0fdf4', label: 'XLS' },
        slide:   { bg: '#c2410c', fg: '#fff7ed', label: 'PPT' },
        text:    { bg: '#334155', fg: '#f1f5f9', label: 'TXT' },
        apk:     { bg: '#065f46', fg: '#ecfdf5', label: 'APK' },
        file:    { bg: '#475569', fg: '#f8fafc', label: 'FILE' }
    };
    function renderMedia(type, url, meta) {
        var u = /^https:\/\/[^\s"'<>]+$/.test(String(url || '')) ? String(url) : '';
        if (!u) return '';
        if (type === 'image') return '<img src="' + esc(u) + '" style="max-width:100%;max-height:250px;object-fit:cover;border-radius:12px;margin-top:5px;cursor:pointer;border:1px solid rgba(0,0,0,0.1);" onclick="window.open(\'' + jsEsc(u) + '\',\'_blank\')">';
        if (type === 'video') return '<video src="' + esc(u) + '" controls style="max-width:100%;border-radius:12px;margin-top:5px;"></video>';
        if (type === 'audio') return '<audio src="' + esc(u) + '" controls style="max-width:100%;margin-top:5px;"></audio>';
        // KADI YA FAILI (zip/pdf/doc/xls/...) — aina inajitofautisha kabisa.
        meta = meta || {};
        var name = String(meta.name || '').trim();
        var ext = fileExtOf(name, u) || '';
        var kind = fileKindOf(ext, meta.mime || '');
        var st = FILE_KIND_STYLE[kind] || FILE_KIND_STYLE.file;
        var badgeLabel = ext || st.label;
        var sizeTxt = '';
        if (meta.size && Number(meta.size) > 0) {
            var kb = Number(meta.size) / 1024;
            sizeTxt = kb >= 1024 ? (Math.round(kb / 102.4) / 10) + ' MB' : Math.ceil(kb) + ' KB';
        }
        var dlIco = window.skhNavIcon ? window.skhNavIcon('download', 16) : '';
        return '<a href="' + esc(u) + '" target="_blank" rel="noopener" download '
            + 'style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:12px;'
            + 'background:rgba(15,23,42,0.06);border:1px solid rgba(15,23,42,0.10);color:#0f172a;'
            + 'text-decoration:none;max-width:300px;margin-top:5px;">'
            + '<span style="flex:0 0 auto;background:' + st.bg + ';color:' + st.fg + ';font-size:10px;'
            + 'font-weight:900;letter-spacing:.04em;padding:6px 7px;border-radius:8px;min-width:38px;'
            + 'text-align:center;">' + esc(badgeLabel) + '</span>'
            + '<span style="min-width:0;flex:1;">'
            + '<b style="font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
            + esc(name || (T('ch_download', 'Pakua Faili'))) + '</b>'
            + '<span style="font-size:12px;color:#64748b;">' + esc(st.label)
            + (sizeTxt ? ' · ' + esc(sizeTxt) : '') + '</span>'
            + '</span>'
            + '<span style="flex:0 0 auto;color:#0369a1;">' + dlIco + '</span>'
            + '</a>';
    }

    function renderProductCard(msg) {
        var ref = msg.productRef; var s = msg.productSnapshot || {};
        if (!ref || !ref.id) return '';
        var pid = jsEsc(ref.id), coll = jsEsc(ref.collection || 'products'), seller = jsEsc(s.sellerId || '');
        var img = s.image || (window.SKH_PLACEHOLDER_IMG || '');
        var price = (s.price != null) ? ('TSh ' + Number(s.price).toLocaleString()) : '';
        // [NEGO ENGINE 2026-09] Vitendo vya mnunuzi (spec §10) vinaishi KWENYE
        // kadi ya bidhaa NDANI ya chat — si vitufe vilivyokwama kwenye composer.
        var isBuyer = !s.sellerId || s.sellerId !== myUid();
        var actions = isBuyer
            ? '<div class="ch-nego-actions" style="margin-top:6px;">'
                + '<button type="button" class="ch-nego-btn accept" onclick="event.stopPropagation();window.skhChatBuy()">' + (window.skhNavIcon ? window.skhNavIcon('cart', 14) : '') + '<span>' + T('ch_buy', 'Oda') + '</span></button>'
                + '<button type="button" class="ch-nego-btn outline" onclick="event.stopPropagation();window.skhChatMakeOffer()">' + (window.skhNavIcon ? window.skhNavIcon('tag', 14) : '') + '<span>' + T('ch_make_offer', 'Pendekeza Bei') + '</span></button>'
                + '</div>'
            : '';
        return '<div class="ch-card" onclick="window.openProduct(\'' + pid + '\', \'' + coll + '\')">'
            + (img ? '<img src="' + esc(img) + '" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||\'\';">' : '')
            + '<div class="ch-card-info"><span class="ch-card-title">' + esc(s.title || 'Bidhaa') + '</span>'
            + (price ? '<span class="ch-card-price">' + esc(price) + '</span>' : '')
            + '<span class="ch-card-link">' + (window.skhNavIcon ? window.skhNavIcon('search', 13) : '') + ' ' + T('ch_view_product', 'Tazama Bidhaa') + ' →</span>'
            + actions + '</div></div>';
    }

    // [COMMERCE 2026-09] Kadi ya HUDUMA (spec §6) — reference, si backend mpya.
    function renderServiceCard(msg) {
        var ref = msg.serviceRef; var s = msg.serviceSnapshot || {};
        if (!ref || !ref.id) return '';
        var sid = jsEsc(ref.id), coll = jsEsc(ref.collection || 'services');
        var img = s.image || '';
        var price = (s.price != null) ? ('TSh ' + Number(s.price).toLocaleString()) : '';
        var isBuyer = !s.sellerId || s.sellerId !== myUid();
        var actions = isBuyer
            ? '<div class="ch-nego-actions" style="margin-top:6px;">'
                + '<button type="button" class="ch-nego-btn outline" onclick="event.stopPropagation();window.skhChatOpenServiceOffer()">' + (window.skhNavIcon ? window.skhNavIcon('wrench', 14) : '') + '<span>' + T('ch_make_offer', 'Pendekeza Ofa') + '</span></button>'
                + '</div>'
            : '';
        var scope = s.scope || '';
        var sHeadIcon = window.skhNavIcon ? window.skhNavIcon('wrench', 14) : '';
        return '<div class="ch-card" onclick="window.openProduct(\'' + sid + '\', \'' + coll + '\')">'
            + (img ? '<img src="' + esc(img) + '" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||\'\';">' : '')
            + '<div class="ch-card-info"><span class="ch-card-title">' + sHeadIcon + ' ' + esc(s.title || 'Huduma') + '</span>'
            + (scope ? '<span class="ch-card-sub">' + esc(scope) + '</span>' : '')
            + (price ? '<span class="ch-card-price">' + esc(price) + '</span>' : '')
            + '<span class="ch-card-link">' + (window.skhNavIcon ? window.skhNavIcon('search', 13) : '') + ' ' + T('ch_view_service', 'Tazama Huduma') + ' →</span>'
            + actions + '</div></div>';
    }

    // [COMMERCE 2026-09] Kadi ya USAFIRI (spec §10) — reference kwenye ride_requests.
    function renderTransportCard(msg) {
        var ref = msg.transportRef; var s = msg.transportSnapshot || {};
        if (!ref || !ref.id) return '';
        var tid = jsEsc(ref.id);
        var from = s.fromLocation || (s.route && s.route.from) || '';
        var to = s.toLocation || (s.route && s.route.to) || '';
        var price = (s.price != null || s.fare != null) ? ('TSh ' + Number(s.price != null ? s.price : s.fare).toLocaleString()) : '';
        var tOwner = s.providerId || s.sellerId || s.userId || '';
        var isBuyer = !tOwner || tOwner !== myUid();
        var actions = isBuyer
            ? '<div class="ch-nego-actions" style="margin-top:6px;">'
                + '<button type="button" class="ch-nego-btn outline" onclick="event.stopPropagation();window.skhChatOpenTransportOffer()">' + (window.skhNavIcon ? window.skhNavIcon('truck', 14) : '') + '<span>' + T('ch_make_offer', 'Pendekeza Ofa') + '</span></button>'
                + '</div>'
            : '';
        var route = (from || to) ? (from || '?') + ' → ' + (to || '?') : '';
        var tHeadIcon = window.skhNavIcon ? window.skhNavIcon('truck', 14) : '';
        return '<div class="ch-card ch-card-delivery" onclick="if(window.openRideTracking)window.openRideTracking(\'' + tid + '\')">'
            + '<div class="ch-card-info"><span class="ch-card-title">' + tHeadIcon + ' ' + esc(s.title || 'Usafiri') + '</span>'
            + (route ? '<span class="ch-card-sub">' + esc(route) + '</span>' : '')
            + (s.packageDescription ? '<span class="ch-card-sub">' + esc(s.packageDescription) + '</span>' : '')
            + (price ? '<span class="ch-card-price">' + esc(price) + '</span>' : '')
            + '<span class="ch-card-link">' + (window.skhNavIcon ? window.skhNavIcon('search', 13) : '') + ' ' + T('ch_view_transport', 'Tazama Safari') + ' →</span>'
            + actions + '</div></div>';
    }

    // [COMMERCE 2026-09] Snapshot ya tukio la oda (order_created / payment_protected)
    // hutengenezwa KUTOKA MAKUBALIANO yaliyogandishwa — kamwe si bei ya sasa ya katalogi.
    function orderEventSnapshotFromNego(orderId, nego, isPaid, extra) {
        nego = nego || {};
        var qty = Number(nego.quantity || nego.agreedQuantity || 1);
        var unit = Number(nego.currentUnitPrice != null ? nego.currentUnitPrice : (nego.agreedUnitPrice || 0));
        var total = Math.round(unit * qty);
        var kind = nego.commerceType === 'service' ? 'service' : nego.commerceType === 'transport' ? 'transport' : 'product';
        var title = (window.skhNego && window.skhNego.commerceTitleOf) ? window.skhNego.commerceTitleOf(nego)
            : (nego.productTitle || nego.serviceTitle || nego.transportTitle || (kind === 'service' ? 'Huduma' : kind === 'transport' ? 'Usafiri' : 'Bidhaa'));
        var snap = {
            orderId: orderId,
            orderNumber: nego.orderNumber || null,
            commerceType: kind,
            itemsSummary: { kind: kind, title: title, quantity: qty, unitPrice: unit, amount: total },
            amount: total,
            totalAmount: total,
            currency: nego.currency || 'TSh',
            paymentStatus: isPaid ? 'paid' : 'pending',
            status: isPaid ? 'held' : 'awaiting_payment',
            protected: !!isPaid,
            negotiationId: nego.negotiationId || null,
            conversationId: nego.conversationId || null,
            sellerId: nego.sellerId || null,
            buyerId: nego.buyerId || null
        };
        if (extra) Object.assign(snap, extra);
        return snap;
    }

    function chMoney(n) { return 'TSh ' + Number(n || 0).toLocaleString(); }
    function renderOrderCard(msg) {
        var s = msg.orderSnapshot || {};
        if (!msg.orderRef || !msg.orderRef.orderId) return '';
        var id = s.orderId || msg.orderRef.orderId;
        var num = s.orderNumber || ('SH' + String(id).slice(-5));
        var is = s.itemsSummary;
        // itemsSummary inaweza kuwa kitu (mpya) au maandishi (zamani).
        var isObj = is && typeof is === 'object';
        var amount = s.amount != null ? s.amount : (isObj && is.amount != null ? is.amount : null);
        var unit = isObj ? is.unitPrice : null;
        var qty = isObj ? is.quantity : null;
        var kind = s.commerceType || (isObj ? is.kind : null);
        var title = isObj ? (is.title || '') : (is || s.productTitle || '');
        var iconName = kind === 'service' ? 'wrench' : kind === 'transport' ? 'truck' : 'package';
        var iconSvg = window.skhNavIcon ? window.skhNavIcon(iconName, 15) : '';
        var isProtected = s.protected === true || s.paymentStatus === 'paid' || s.paymentStatus === 'held' || s.status === 'held';
        var badge = isProtected
            ? '<span class="ch-order-badge ch-order-badge--ok">' + (window.skhNavIcon ? window.skhNavIcon('shield-check', 13) : '') + ' ' + T('ch_pay_protected', 'SokoPay Imelindwa') + '</span>'
            : '<span class="ch-order-badge ch-order-badge--wait">' + (window.skhNavIcon ? window.skhNavIcon('clock', 13) : '') + ' ' + T('ch_pay_waiting', 'Inasubiri Malipo') + '</span>';
        return '<div class="ch-card ch-card-order ' + (isProtected ? 'ch-card-order--paid' : '') + '" onclick="window.skhChatViewOrder(\'' + jsEsc(s.sellerId || '') + '\')">'
            + '<div class="ch-card-ico">' + (isProtected ? (window.skhNavIcon ? window.skhNavIcon('shield-check', 18) : '') : iconSvg) + '</div>'
            + '<div class="ch-card-info"><span class="ch-card-title">' + (isProtected ? (window.skhNavIcon ? window.skhNavIcon('shield-check', 15) : '') : iconSvg) + ' ' + esc(num) + '</span>'
            + (title ? '<span class="ch-card-sub">' + esc(title) + (qty ? ' × ' + esc(qty) : '') + '</span>' : '')
            + (unit ? '<span class="ch-card-sub">' + T('ch_unit_price', 'Bei ya makubaliano') + ': <b>' + chMoney(unit) + '</b></span>' : '')
            + (amount != null ? '<span class="ch-card-price ' + (isProtected ? 'ch-card-price--ok' : '') + '">' + chMoney(amount) + '</span>' : '')
            + badge
            + '<span class="ch-card-link">' + T('ch_view_order', 'Tazama Oda') + ' →</span></div></div>';
    }

    function renderDeliveryCard(msg) {
        var s = msg.deliverySnapshot || {};
        if (!msg.deliveryRef || !msg.deliveryRef.deliveryId) return '';
        // [DELIVERY FLOW 2026-09] Tukio la uwasilishaji wa oda ya MAJADILIANO
        // (paid→prepared→in_transit→delivered→confirmed) — kadi ya hatua.
        var isNegoOrder = !!(s.orderId || s.kind === 'negotiation_order');
        if (isNegoOrder) {
            var N = window.skhNego;
            var st2 = s.deliveryStatus || s.status || 'held';
            var lbl = skhGlossLabel(st2, 'delivery', (N && N.ORDER_STATUS_LABELS && N.ORDER_STATUS_LABELS[st2]) ? N.ORDER_STATUS_LABELS[st2] : String(st2).toUpperCase());
            var ordHeadIco = window.skhNavIcon ? window.skhNavIcon('cart', 14) : '';
            return '<div class="ch-card ch-card-delivery" onclick="window.skhChatViewOrder(\'' + jsEsc(s.sellerId || '') + '\')">'
                + '<div class="ch-card-info"><span class="ch-card-title">' + ordHeadIco + ' Oda #' + esc(s.orderId || msg.deliveryRef.deliveryId) + '</span>'
                + (s.cargoName ? '<span class="ch-card-sub">' + esc(s.cargoName) + '</span>' : '')
                + '<span class="ch-card-sub">' + T('ch_status', 'Hali') + ': <b>' + esc(lbl) + '</b></span>'
                + (N && N.orderTrackerHtml ? N.orderTrackerHtml({ deliveryStatus: st2, status: st2 }) : '')
                + '<span class="ch-card-link">' + (window.skhNavIcon ? window.skhNavIcon('clipboard', 13) : '') + ' ' + T('ch_view_order', 'Tazama Oda') + ' →</span></div></div>';
        }
        var status = (typeof window.skhCustodyStatusLabel === 'function' && s.status) ? window.skhCustodyStatusLabel(s.status) : (s.status || '').toUpperCase();
        var delHeadIco = window.skhNavIcon ? window.skhNavIcon('truck', 14) : '';
        return '<div class="ch-card ch-card-delivery" onclick="if(window.openMyDeliveries)window.openMyDeliveries()">'
            + '<div class="ch-card-info"><span class="ch-card-title">' + delHeadIco + ' ' + esc(s.cargoName || msg.deliveryRef.deliveryId) + '</span>'
            + '<span class="ch-card-sub">' + T('ch_status', 'Hali') + ': <b>' + esc(status) + '</b></span>'
            + (s.currentCustodianName ? '<span class="ch-card-sub">' + T('ch_custodian', 'Mshika Mzigo') + ': <b>' + esc(s.currentCustodianName) + '</b></span>' : '')
            + (s.toLocation ? '<span class="ch-card-sub">' + T('ch_to', 'Kwenda') + ': ' + esc(s.toLocation) + '</span>' : '')
            + '<span class="ch-card-link">' + (window.skhNavIcon ? window.skhNavIcon('map', 13) : '') + ' ' + T('ch_track', 'Fuatilia') + ' →</span></div></div>';
    }


    // [GLOSS EXT 2026-09] Label ya status iitokane glossary ya i18n (enum haibadilishi).
    function skhGlossLabel(status, family, fallback) {
        try { if (window.skhGloss) return window.skhGloss(status, family, fallback); } catch (eG) {}
        return fallback;
    }
    function renderOfferCard(msg) {
        var s = msg.offerSnapshot || {};
        var status = s.status || 'pending';
        var price = (s.proposedPrice != null) ? Number(s.proposedPrice).toLocaleString() : '';
        var cur = (s.currentPrice != null) ? Number(s.currentPrice).toLocaleString() : '';
        var title = s.productTitle || (msg.productSnapshot && msg.productSnapshot.title) || 'Bidhaa';
        var statusLabel = ({
            accepted: T('ch_offer_status_accepted', 'Imekubaliwa'),
            rejected: T('ch_offer_status_rejected', 'Imekataliwa'),
            countered: T('ch_offer_status_countered', 'Counter imetolewa'),
            expired: T('ch_offer_status_expired', 'Imeisha muda')
        })[status] || T('ch_offer_status_pending', 'Inasubiri Jibu');
        // [I18N CORE 2026-09] Namespace glossary (status.*) — backend enum haibadilishi,
        // label ya presentation inatoka kwenye i18n. Fallback iliyopo hapo juu inabaki.
        if (window.tStatus) {
            try { var gl = tStatus(status, 'offer'); if (gl) statusLabel = gl; } catch (eSt) {}
        }
        var html = '<div class="ch-offer-msg">'
            + '<div class="ch-offer-msg-top">' + (window.skhNavIcon ? window.skhNavIcon('tag', 13) : '' + (window.skhNavIcon?window.skhNavIcon('wallet',14):'') + '') + ' ' + T('ch_offer', 'Ofa') + ' · <b>' + esc(title) + '</b></div>'
            // [NEGO FIX 2026-09] IDADI KWANZA, KISHA BEI — mpangilio uleule wa fomu.
            + '<div class="ch-offer-msg-row">' + T('ch_offer_qty', 'Idadi') + ': <b>' + esc(s.quantity || 1) + '</b>'
            + ' · ' + T('ch_offer_price', 'Bei unayopendekeza') + ': <b>TSh ' + esc(price) + '</b>'
            + (cur ? ' <span class="ch-offer-was">(' + T('ch_offer_was', 'ilikuwa') + ' TSh ' + esc(cur) + ')</span>' : '')
            + '</div>'
            + '<div class="ch-offer-msg-status ' + esc(status) + '">' + esc(statusLabel) + '</div>';
        // [NEGO ENGINE 2026-09] Ikiwa ofa ina negotiationId, vitendo vyake
        // vinaonyeshwa kwenye Commerce Anchor (juu ya composer) — si hapa.
        const hasNego = !!(msg.negotiationId || s.negotiationId || msg.negotiationSnapshot);
        if (status === 'pending' && msg.offerId && !hasNego) {
            var me = myUid();
            var rel = relatedCtx();
            var iAmSeller = !!(rel && rel.sellerId === me);
            var partnerIsSender = !!(skh.chatCore && skh.chatCore.partnerUid && msg.senderId === skh.chatCore.partnerUid);
            if (partnerIsSender) {
                var lIc = function (n) { return window.skhNavIcon ? window.skhNavIcon(n, 14) : ''; };
                html += '<div class="ch-offer-msg-actions">'
                    + '<button type="button" class="is-accept" onclick="window.skhChatOfferReply(\'' + jsEsc(msg.offerId) + '\',\'accept\')">' + lIc('check') + ' ' + T('ch_accept', 'Kubali') + '</button>'
                    + (iAmSeller ? '<button type="button" onclick="window.skhChatOfferReply(\'' + jsEsc(msg.offerId) + '\',\'counter\')">' + lIc('refresh') + ' ' + T('ch_counter', 'Counter') + '</button>' : '')
                    + '<button type="button" class="is-reject" onclick="window.skhChatOfferReply(\'' + jsEsc(msg.offerId) + '\',\'reject\')">' + lIc('x') + ' ' + T('ch_reject', 'Kataa') + '</button>'
                    + '</div>';
            }
        }
        return html + '</div>';
    }

    function renderMessageBody(msg, isMe) {
        if (msg.type === 'product') return renderProductCard(msg) + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
        if (msg.type === 'service') return renderServiceCard(msg) + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
        if (msg.type === 'transport') return renderTransportCard(msg) + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
        if (msg.type === 'order') return renderOrderCard(msg) + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
        if (msg.type === 'delivery') return renderDeliveryCard(msg) + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
        if (msg.type === 'negotiation') return renderNegotiationEvent(msg) + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
        if (msg.type === 'offer') return renderOfferCard(msg) + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
        if (msg.type === 'image' || msg.type === 'video' || msg.type === 'audio' || msg.type === 'file') {
            return renderMedia(msg.type, msg.mediaReference, msg.mediaMeta || {}) + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
        }
        if (msg.type === 'location') return renderLocationCard(msg);
        return '<span style="white-space:pre-wrap;">' + esc(msg.text || '') + '</span>';
    }

    // [DELIVERY FLOW 2026-09] Vitendo halali vya ODA (spec §9) kulingana na
    // hali ya malipo + uwasilishaji + nafasi. Server ndiye anathibitisha.
    function renderOrderActions(order, nego) {
        if (!order || !window.skhNego || !window.skhNego.getAvailableOrderActions) return '';
        var me = myUid();
        var ctx = { iAmBuyer: !!(nego && nego.buyerId === me), iAmSeller: !!(nego && nego.sellerId === me) };
        var acts = window.skhNego.getAvailableOrderActions(order, ctx);
        if (!acts || !acts.length) return '';
        var oid = order.orderId || order.id;
        var html = '';
        acts.forEach(function (a) {
            var onclick = '';
            if (a.command === 'PAY_ORDER') onclick = 'window.skhChatPay()';
            else if (a.command === 'REVIEW_ORDER') onclick = "if(window.skhCommentsOpen){window.skhCommentsOpen({id:'" + jsEsc((nego && nego.productId) || '') + "',title:'" + jsEsc((nego && nego.productTitle) || '') + "'});}else if(window.openBuyerOrdersModal){window.openBuyerOrdersModal();}";
            else onclick = "window.skhNegoOrderCommand('" + a.command + "', { orderId: '" + jsEsc(oid) + "' })";
            html += '<button type="button" class="ch-nego-btn ' + (a.primary ? 'primary' : '') + '" onclick="' + onclick + '">' + a.label + '</button>';
        });
        return '<div class="ch-nego-actions">' + html + '</div>';
    }

    // [NEGO DIALOGUE FIX 2026-09] Ufreshi wa majadiliano: snapshot mpya zaidi
    // (version, kisha updatedAt) ndiyo chanzo cha kweli. Hii huzuia KADI
    // KUKWAMA upande wa mpokeaji wakati msikilizaji wa `negotiations`
    // amekosa/achelewa (mf. composite index isiyopelekwa) — kila jibu la
    // muuzaji/mnunuzi huja kama TUKIO la mfumo lenye snapshot kamili.
    function negoNewer(a, b) {
        if (!a) return false;
        if (!b) return true;
        var av = Number(a.version || 0), bv = Number(b.version || 0);
        if (av !== bv) return av > bv;
        var at = Date.parse(a.updatedAt || '') || 0;
        var bt = Date.parse(b.updatedAt || '') || 0;
        if (at !== bt) return at > bt;
        return false;
    }
    function nIcon(name, size) { return (typeof window !== 'undefined' && window.skhNavIcon) ? window.skhNavIcon(name, size || 15) : ''; }
    function negoTypeIcon(nego) {
        var t = (nego && nego.commerceType) || 'product';
        return t === 'service' ? 'wrench' : (t === 'transport' ? 'truck' : 'package');
    }

    // [NEGO DIALOGUE FIX] Kumeza snapshot ya hivi karibuni kutoka kwenye UKURASA
    // wa ujumbe — hufanya kazi hata kama msikilizaji wa negotiations haupo.
    // Haianzishi render mpya (inayoitwa NDANI ya render) kuepuka mizunguko.
    function ingestLatestNegoFromMsgs(msgs) {
        if (!msgs || !msgs.length) return;
        for (var i = msgs.length - 1; i >= 0; i--) {
            var m = msgs[i];
            if (m.type !== 'negotiation' || !m.negotiationId || !m.negotiationSnapshot) continue;
            var snap = m.negotiationSnapshot;
            var live = skh.negoCurrent;
            if (!live || live.negotiationId !== snap.negotiationId || negoNewer(snap, live)) {
                skh.negoCurrent = snap;
                try { negoMaybeAddToCart(snap); } catch (e) {}
                try { ensureOrderSubscription(snap); } catch (e) {}
                try { renderCommerceAnchor(); } catch (e) {}
            }
            return;
        }
    }

    // [NEGO ENGINE 2026-09] Tukio la mfumo (spec §35) — kadi RICHI ya negotiation
    // NDANI ya mtiririko wa chat. Inaendelea HATUA KWA HATUA (ofa → counter →
    // makubaliano → ombi la kiasi → oda), na VITUFE halali vya hali ya SASA
    // (spec §8) vinaonyeshwa kwenye kadi ya MWISHO ya negotiation — si vitufe
    // vilivyokwama kwenye sehemu ya kuandikia.
    function renderNegotiationEvent(msg) {
        var N = window.skhNego;
        var live0 = skh.negoCurrent || null;
        var snap0 = msg.negotiationSnapshot || null;
        // [FIX] Chagua snapshot ILIYO MPYA zaidi kati ya msikilizaji wa moja
        // kwa moja na tukio la ujumbe — jibu la mwenzako lisikwame kamwe.
        var nego = snap0 || live0 || {};
        if (live0 && live0.negotiationId === msg.negotiationId && negoNewer(live0, snap0)) nego = live0;
        var st = nego.currentState || 'DRAFT';
        var label = skhGlossLabel(st, 'nego', (N && N.STATE_LABELS && N.STATE_LABELS[st]) ? N.STATE_LABELS[st] : st);
        var qty = nego.quantity || 1;
        var unit = (nego.currentUnitPrice != null) ? Number(nego.currentUnitPrice) : null;
        var total = (nego.currentTotal != null) ? Number(nego.currentTotal) : (unit != null ? unit * qty : null);
        // [COMMERCE 2026-09] Type-aware (spec §6/§10/§12): title + terms za
        // bidhaa/huduma/usafiri kutoka kwa injini moja (commerceTitleOf/terms).
        var title = (N && N.commerceTitleOf) ? N.commerceTitleOf(nego) : (nego.productTitle || nego.serviceTitle || nego.transportTitle || 'Bidhaa');

        // [REMBA 2026-09] Kadi iliyopambwa upya: kichwa chenye ikoni + beji ya
        // hali, gridi ya masharti, bango la zamu lenye rangi, na jumla kuu.
        var stCls = 'st-' + String(st).toLowerCase().replace(/_/g, '-');
        var html = '<div class="ch-nego-event ' + stCls + '">'
            + '<div class="ch-nego-head">'
            + '<span class="ch-nego-ico">' + nIcon(negoTypeIcon(nego), 17) + '</span>'
            + '<div class="ch-nego-head-t"><span class="ch-nego-state">' + esc(label) + '</span>'
            + '<b class="ch-nego-title">' + esc(title) + '</b></div>'
            + '</div>';

        // [DIALOGUE TURN FIX] Bango la hali linalojua UPANDE (spec §7):
        // "Jibu lako linahitajika" kwa mhusika wa zamu; "Inasubiri X" kwa mwingine.
        if (msg._negoActive && N && !N.isTerminal(st)) {
            var me = myUid();
            var waitingId = nego.waitingForUserId || nego.currentActorId || null;
            var iAmBuyer = nego.buyerId === me, iAmSeller = nego.sellerId === me;
            var turnBanner = '', turnCls = 'wait', turnIco = 'clock';
            if (st === 'AGREEMENT' || st === 'FINAL_AGREEMENT') {
                // [COMMERCE 2026-09] Baada ya makubaliano, MPIRA uko kwa mnunuzi:
                // yeye huunda oda; muuzaji haoni kitufe cha kukubali/kupinga tena.
                if (iAmBuyer) { turnBanner = T('ch_agreed_buyer', 'Mmekubaliana — fungua oda ili kulipa'); turnCls = 'ok'; turnIco = 'handshake'; }
                else if (iAmSeller) { turnBanner = T('ch_wait_buyer_order', 'Inasubiri mnunuzi kutengeneza oda'); turnCls = 'wait'; turnIco = 'clock'; }
                else { turnBanner = T('ch_agreed', 'Mmekubaliana'); turnCls = 'ok'; turnIco = 'handshake'; }
            } else if (st === 'ORDER_CREATED') {
                // Oda imefungwa — mnunuzi akiwa bado hajalipa, kila upande
                // wao unaona jukumu lake (kadi ya oda nayo ina beji sahihi).
                var _ordPaid = skh.negoOrder && window.skhNego && window.skhNego.orderIsPaid
                    && window.skhNego.orderIsPaid(skh.negoOrder);
                if (_ordPaid) { turnBanner = T('ch_pay_protected', 'SokoPay Imelindwa'); turnCls = 'paid'; turnIco = 'shield-check'; }
                else if (iAmBuyer) { turnBanner = T('ch_wait_payment_buyer', 'Lipa oda kupitia SokoPay ili mzigo utayarishwe'); turnCls = 'pay-wait'; turnIco = 'wallet'; }
                else if (iAmSeller) { turnBanner = T('ch_wait_payment_seller', 'Inasubiri malipo ya mnunuzi (Escrow)'); turnCls = 'pay-wait'; turnIco = 'clock'; }
            } else if (waitingId && (iAmBuyer || iAmSeller)) {
                if (waitingId === me) { turnBanner = T('ch_your_turn', 'Jibu lako linahitajika'); turnCls = 'you'; turnIco = 'bell'; }
                else if (waitingId === nego.sellerId) { turnBanner = T('ch_wait_seller', 'Inasubiri muuzaji'); turnCls = 'wait'; turnIco = 'clock'; }
                else if (waitingId === nego.buyerId) { turnBanner = T('ch_wait_buyer', 'Inasubiri mnunuzi'); turnCls = 'wait'; turnIco = 'clock'; }
            } else if (nego.turn) {
                // Fallback kwa role token
                var iAmSide = iAmSeller ? 'seller' : (iAmBuyer ? 'buyer' : null);
                if (iAmSide && nego.turn === iAmSide) { turnBanner = T('ch_your_turn', 'Jibu lako linahitajika'); turnCls = 'you'; turnIco = 'bell'; }
            }
            if (turnBanner) html += '<div class="ch-nego-turnbanner ' + turnCls + '"><span class="ch-nb-ico">' + nIcon(turnIco, 14) + '</span><span>' + esc(turnBanner) + '</span></div>';
        }

        // [REMBA] Gridi ya masharti (thamani GHAFI kutoka injini → huchambuliwa
        // hapa kwa esc() kamili) — idadi/masharti kwanza, bei na jumla mwisho.
        var termParts = (N && N.commerceTermParts) ? N.commerceTermParts(nego) : [];
        if (termParts.length) {
            html += '<div class="ch-nego-terms">';
            termParts.forEach(function (p) {
                var strong = (p.label === 'Jumla' || p.label === 'Nauli') ? ' is-total' : '';
                var ic = p.label === 'Idadi' || p.label === 'Kiasi' ? 'hash'
                    : (p.label.indexOf('Bei') === 0 || p.label === 'Nauli') ? 'wallet'
                    : (p.label === 'Jumla') ? 'calculator' : '';
                html += '<div class="ch-nego-term' + strong + '">'
                    + '<span class="ch-nego-term-l">' + (ic ? nIcon(ic, 13) + ' ' : '') + esc(p.label) + '</span>'
                    + '<b>' + esc(p.value) + (p.suffix ? ' ' + esc(p.suffix) : '') + '</b></div>';
            });
            html += '</div>';
        } else if (unit != null) {
            html += '<div class="ch-nego-terms"><div class="ch-nego-term">'
                + '<span class="ch-nego-term-l">' + esc(String(qty)) + ' × TSh ' + esc(unit.toLocaleString()) + '</span>'
                + (total != null ? '<b>TSh ' + esc(total.toLocaleString()) + '</b>' : '')
                + '</div></div>';
        }
        // [DIALOGUE §17] Ombi la mabadiliko (kiasi/scope/njia) kwenye kadi hai.
        if (msg._negoActive && N && N.pendingChangeHtml) {
            N.pendingChangeHtml(nego).forEach(function (ln) {
                html += '<div class="ch-nego-event-row ch-nego-pending">' + ln + '</div>';
            });
        }
        // [ORDER CARD] Kwenye kadi hai yenye orderId: hydrate + sikiliza oda.
        // Kama live order haijarudi bado, jenga muhtasari kutoka snapshot ya
        // negotiation (ili "Lipia" lisionekane kuchelewa upande wa mnunuzi).
        var orderShown = null;
        if (msg._negoActive && nego.orderId) {
            if (!live0 || live0.negotiationId !== nego.negotiationId) {
                skh.negoCurrent = nego;
            }
            ensureOrderSubscription(nego);
            orderShown = (skh.negoOrder && (skh.negoOrder.orderId === nego.orderId || skh.negoOrder.id === nego.orderId))
                ? skh.negoOrder
                : {
                    id: nego.orderId, orderId: nego.orderId, negotiationId: nego.negotiationId,
                    commerceType: nego.commerceType || 'product', buyerId: nego.buyerId, sellerId: nego.sellerId,
                    itemTitle: title, quantity: qty, unitPrice: unit, amount: total,
                    status: 'payment_pending', paymentStatus: 'pending',
                    deliveryStatus: 'payment_pending', serviceStatus: 'payment_pending', transportStatus: 'payment_pending'
                };
        }
        if (orderShown) {
            var o = orderShown;
            var pay = o.paymentStatus || 'pending';
            var paidNow = pay === 'paid';
            html += '<div class="ch-nego-order ' + (paidNow ? 'is-paid' : '') + '">'
                + '<span class="ch-nego-order-ico">' + nIcon(paidNow ? 'shield-check' : 'cart', 15) + '</span>'
                + '<div class="ch-nego-order-t"><b>Oda #' + esc(String(o.orderId || o.id)) + '</b>'
                + '<span>' + (paidNow ? 'Imelipwa (SokoPay Protected)' : 'Inasubiri Malipo') + '</span></div></div>';
            // [DELIVERY FLOW 2026-09] Pipeline ya uwasilishaji (paid→prepared→
            // in_transit→delivered→confirmed) + vitendo halali vya hali ya sasa.
            if (N && N.orderTrackerHtml) html += N.orderTrackerHtml(o);
            var oActs = renderOrderActions(o, nego);
            if (oActs) html += oActs;
        }
        // VITUFE halali — kwenye kadi ya MWISHO tu ya negotiation hai.
        // [SELLER FIX 2026-09] Kama live listener haijarudi (index/race/
        // conversation ya zamani), tumia negotiationSnapshot iliyo ndani ya
        // ujumbe — ili upande wa pili USIKOSE vitufe vya Accept/Counter/Decline.
        if (N && msg._negoActive && nego.negotiationId) {
            var me2 = myUid();
            var ctx = { iAmBuyer: nego.buyerId === me2, iAmSeller: nego.sellerId === me2, order: skh.negoOrder };
            // [DIALOGUE FIX] buildButtons' default handler hubeba
            // negotiationId ya kadi hii wazi — vitufe vya pande zote
            // (hata muuzaji asiye na live snapshot) hufanya kazi.
            var btns = N.buildButtons(nego, ctx);
            if (btns) html += btns;
            var hist = N.historyLines(nego);
            if (hist) html += hist;
        }
        return html + '</div>';
    }

    function renderLocationCard(msg) {
        var loc = msg.location || {};
        var name = loc.name || T('ch_location', 'Mahali');
        var q = encodeURIComponent((loc.name || '') + (loc.lat ? ' ' + loc.lat + ',' + loc.lng : ''));
        var maps = 'https://maps.google.com/?q=' + q;
        return '<div class="ch-loc-card">'
            + '<div class="ch-loc-pin">' + (window.skhNavIcon?window.skhNavIcon('map',14):'') + '</div>'
            + '<div class="ch-loc-info"><b>' + esc(name) + '</b>'
            + (loc.lat ? '<span>' + Number(loc.lat).toFixed(5) + ', ' + Number(loc.lng).toFixed(5) + '</span>' : '')
            + '</div>'
            + '<a class="ch-loc-open" href="' + maps + '" target="_blank" rel="noopener">↗</a>'
            + '</div>'
            + (msg.text ? '<div style="margin-top:6px;white-space:pre-wrap;">' + esc(msg.text) + '</div>' : '');
    }

    // [CHAT UI v1.0 2026-09] Menyu ya ujumbe (spec §16): vitendo HALALI tu,
    // kulingana na hali/mhusika. Sio "ukuta wa vitufe" — vya haraka ni Jibu +
    // Nakili + More (⋯) tu; vingine vinafunguka kwenye menyu (long-press / right-click).
    function renderActions(msg, isMe) {
        var id = esc(msg.id);
        if (msg.deletedAt) return '';
        var a = '<div class="ch-actions">';
        a += '<button type="button" onclick="window.skhChatReply(\'' + id + '\')">↩ ' + T('ch_reply', 'Jibu') + '</button>';
        a += '<button type="button" onclick="window.skhChatCopy(\'' + id + '\')">⧉ ' + T('ch_copy', 'Nakili') + '</button>';
        a += '<button type="button" class="ch-more-btn" onclick="event.stopPropagation();window.skhChatMsgMenu(\'' + id + '\', event)">⋯ ' + T('ch_more', 'Zaidi') + '</button>';
        a += '</div>';
        return a;
    }

    // [COMMERCE SIDES 2026-09] Tambua upande wa tukio la biashara: kadi za
    // ofa/majadiliano/oda huonyeshwa upande wa ALIYETENDA (mtoaji ujumbe),
    // ili mnunuzi na muuzaji/msafirishaji watofautiane kama kwenye chat ya
    // kawaida. Matukio tupu (bila mtendaji) hurudi null → huonekana katikati.
    function eventSnapshotOf(msg) {
        if (msg.negotiationSnapshot) return msg.negotiationSnapshot;
        if (msg.nego && msg.nego.snapshot) return msg.nego.snapshot;
        if (msg.orderSnapshot) return msg.orderSnapshot;
        if (msg.deliverySnapshot) return msg.deliverySnapshot;
        if (msg.offerSnapshot) return msg.offerSnapshot;
        return null;
    }
    function eventSideOf(msg, isMe) {
        // Kadi tu (si ukumbusho wa maandishi wa mfumo).
        var cardTypes = ['negotiation', 'offer', 'order', 'delivery', 'product', 'service', 'transport'];
        if (cardTypes.indexOf(msg.type) === -1) return null;
        var snap = eventSnapshotOf(msg);
        var actorId = msg.senderId || null;
        if (!actorId && snap) {
            actorId = snap.lastActorId || snap.currentActorId
                || (Array.isArray(snap.history) && snap.history.length ? snap.history[snap.history.length - 1].actorId : null)
                || null;
        }
        if (!actorId) return null;
        return actorId === myUid() ? 'mine' : 'theirs';
    }
    // Jina dogo la juu ya kadi: "Wewe · Mnunuzi" / "Jina · Muuzaji".
    function eventCaption(msg, side) {
        var snap = eventSnapshotOf(msg) || {};
        var ctype = snap.commerceType || msg.type;
        var me = myUid();
        var roleFor = function (uid) {
            if (!uid) return '';
            if (snap.buyerId === uid) return ctype === 'service' ? 'Mteja' : 'Mnunuzi';
            if (snap.sellerId === uid) {
                if (ctype === 'transport') return 'Msafirishaji';
                if (ctype === 'service') return 'Mtoa huduma';
                return 'Muuzaji';
            }
            return '';
        };
        var who, role;
        if (side === 'mine') {
            who = 'Wewe'; role = roleFor(me);
        } else {
            var core = skh.chatCore || {};
            who = core.partnerName || (msg.senderName || '');
            var senderId = msg.senderId || (snap.lastActorId) || core.partnerUid;
            role = roleFor(senderId);
        }
        var dotIc = side === 'mine' ? (window.skhNavIcon ? window.skhNavIcon('check', 11) : '')
                                    : (window.skhNavIcon ? window.skhNavIcon('chat', 11) : '');
        return dotIc + ' ' + esc(who || (side === 'mine' ? 'Wewe' : 'Mwanza biashara')) + (role ? ' · ' + esc(role) : '');
    }

    function renderMessageList(msgs, conv) {
        var me = myUid();
        // [NEGO DIALOGUE FIX] Kumeza snapshot ya majadiliano iliyo kwenye ujumbe
        // wa hivi karibuni — huhakikisha jibu la mwenzaji (muuzaji→mnunuzi)
        // lionekane papo hata kama msikilizaji wa negotiations amekosa.
        ingestLatestNegoFromMsgs(msgs);
        var byId = {}; msgs.forEach(function (m) { byId[m.id] = m; });
        var lastMeIdx = -1;
        for (var i = msgs.length - 1; i >= 0; i--) { if (msgs[i].senderId === me && !msgs[i].system) { lastMeIdx = i; break; } }
        // [MSG STATUS UNIFY 2026-09] Tazama pia ni ujumbe wa mwisho wangu wa AINA
        // YOYOTE (normal // negotiation // offer // counter) — mtiririko huo
        // unahitaji hali ileile ya Sent/Delivered/Read kama meseji ya kawaida.
        var lastMineAnyIdx = -1;
        for (var i3 = msgs.length - 1; i3 >= 0; i3--) { if (msgs[i3].senderId === me) { lastMineAnyIdx = i3; break; } }

        // [§26-§28 R8 TICKS — TRIPLE STATE 2026-09] BACKEND-BASED:
        //   ✓  SENT     = ujumbe umethibitishwa Firestore (createdAt)
        //   ✓✓ DELIVERED = `deliveredAt[partner] >= createdAt` (receiver-device)
        //   ✓✓ READ     = `lastReadAt[partner] >= createdAt` (alifungua chat)
        // Hakuna fake state: deliveredAt huandikwa na receiver (deliverAck),
        // lastReadAt kwa markRead() — wote backend-truth. Ilioje ungwa juu.
        var __msgTick = function (msg) {
            var partner = (skh.chatCore && skh.chatCore.partnerUid) || null;
            if (!partner || !msg) return '';
            var read = conv.lastReadAt && conv.lastReadAt[partner] && conv.lastReadAt[partner] >= msg.createdAt;
            var delivered = false;
            try {
                var dda = (conv && conv.deliveredAt) || {};
                delivered = !!(dda[partner] && dda[partner] >= msg.createdAt);
            } catch (e) {}
            var singleTick = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            var doubleTick = '<svg width="17" height="14" viewBox="0 0 30 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="margin-left:-9px;"><polyline points="28 6 17 17 12 12"/><polyline points="20 6 9 17 4 12"/></svg>';
            var kind = read ? 'read' : (delivered ? 'delivered' : 'sent');
            var title = read ? T('ch_seen', 'Imesomwa') : (delivered ? T('ch_delivered', 'Imefikia') : T('ch_sent', 'Imetumwa'));
            var bodySvg = kind === 'sent' ? singleTick : (singleTick + doubleTick);
            return '<span class="ch-tick ch-tick--' + kind + '" title="' + title + '">' + bodySvg + '</span>';
        };

        // [NEGO ENGINE 2026-09] Kadi ya MWISHO ya negotiation inayoishi kwenye
        // mtiririko ndiyo inayobeba VITUFE vya hali ya sasa (spec §8, §28).
        // [SELLER FIX] Kama live listener haijarudi (index haijatumwa, race,
        // au negotiation ya conversation ya zamani iliyounganishwa), tumia
        // kadi ya mwisho ya negotiation pamoja na snapshot yake — ili upande
        // wa pili (mara nyingi muuzaji) usikose vitufe vya kujibu.
        var activeNegoId = (skh.negoCurrent && skh.negoCurrent.negotiationId) || null;
        var lastNegoMsgId = null;
        for (var i2 = msgs.length - 1; i2 >= 0; i2--) {
            if (msgs[i2].type !== 'negotiation' || !msgs[i2].negotiationId) continue;
            if (activeNegoId) {
                if (msgs[i2].negotiationId === activeNegoId) { lastNegoMsgId = msgs[i2].id; break; }
            } else {
                lastNegoMsgId = msgs[i2].id;
                activeNegoId = msgs[i2].negotiationId;
                break;
            }
        }

        var partnerName = (skh.chatCore && skh.chatCore.partnerName) || '';
        var html = '<div style="text-align:center;font-size:13px;color:#667781;margin-bottom:16px;background:#fff;padding:6px 14px;border-radius:8px;align-self:center;box-shadow:0 1px 1px rgba(0,0,0,0.08);">' + T('ch_secure', 'Mawasiliano yanalindwa') + '</div>'
            + '<div class="ch-swipe-hint">↔ ' + T('ch_swipe_hint', 'Telezesha ujumbe kando ili kujibu (reply)') + '</div>';
        if (!msgs.length) {
            html += '<p style="text-align:center;color:#667781;font-size:13px;margin-top:16px;">' + T('ch_empty', 'Hamna meseji bado. Anza mazungumzo!') + '</p>';
        }
        msgs.forEach(function (msg, idx) {
            msg._negoActive = (msg.type === 'negotiation' && lastNegoMsgId && msg.id === lastNegoMsgId) ? true : false;
            var isMe = msg.senderId === me;
            var deleted = !!msg.deletedAt;
            var body = deleted
                ? '<span style="font-style:italic;opacity:.6;">' + (window.skhNavIcon?window.skhNavIcon('trash',14):'') + '' + T('ch_deleted', 'Ujumbe umefutwa') + '</span>'
                : renderMessageBody(msg, isMe);
            // [COMMERCE SIDES 2026-09] Kadi za biashara/majadiliano zinafuata
            // UPANDE wa aliyetenda (kijani kulia = wewe, buluu kushoto = mwenzako)
            // kama mawingu ya kawaida; matukio tupu ya mfumo husalia katikati.
            if (msg.system) {
                var side = eventSideOf(msg, isMe);
                if (side === 'mine' || side === 'theirs') {
                    var roleCap = eventCaption(msg, side);
                    // [MSG STATUS UNIFY 2026-09] Tukio la mwisho la matumizi
                    // (offer/negotiation/counter) lionekane na tick — Sent/
                    // Delivered/Read — kama ujumbe wa kawaida. Root cause ilikuwa
                    // hii branch ikaacha tick kabisa kabla ya fix hii.
                    var evTick = (idx === lastMineAnyIdx) ? __msgTick(msg) : '';
                    html += '<div class="ch-msg ch-msg-event" data-msgid="' + esc(msg.id) + '" data-system="1" data-mine="' + (side === 'mine' ? '1' : '0') + '">'
                        + '<div class="ch-event-wrap">'
                        + (roleCap ? '<span class="ch-event-cap">' + roleCap + '</span>' : '')
                        + '<div class="ch-event-card">' + body + '</div>'
                        + '<div class="ch-meta ch-system-meta"><span>' + fmtTime(msg.createdAt) + '</span>' + evTick + '</div>'
                        + '</div></div>';
                    return;
                }
                html += '<div class="ch-msg ch-msg-system" data-msgid="' + esc(msg.id) + '" data-system="1">'
                    + '<div class="ch-system-body">' + body + '</div>'
                    + '<div class="ch-meta ch-system-meta"><span>' + fmtTime(msg.createdAt) + '</span></div>'
                    + '</div>';
                return;
            }
            var quote = '';
            if (!deleted && msg.replyToId && byId[msg.replyToId]) {
                var p = byId[msg.replyToId];
                quote = '<div class="ch-quote">' + esc(truncate((p.senderName || '') + ': ' + (p.text || ''), 80)) + '</div>';
            }
            var readStat = '';
            if (isMe && idx === lastMeIdx) {
                // [DEDUP 2026-09] Builder moja __msgTick (mlipuko wa codebase):
                // haijachezwa kwa nafasi zote — logic ya tick ni MOJA.
                readStat = __msgTick(msg);
            }
            // [CHAT FIX 2026-09] Jina la mtumaji kwenye ujumbe wa MWENZAKE (si wangu).
            var senderLabel = (!isMe && partnerName) ? '<span class="ch-sender">' + esc(partnerName) + '</span>' : '';
            html += '<div class="ch-msg" data-msgid="' + esc(msg.id) + '" data-mine="' + (isMe ? '1' : '0') + '">'
                + '<div class="chat-bubble ' + (isMe ? 'me' : 'them') + '">' + senderLabel + quote + body + '</div>'
                + renderReactions(msg, me)
                + '<div class="ch-meta"><span>' + fmtTime(msg.createdAt) + (msg.editedAt ? ' · ' + T('ch_edited', 'imehaririwa') : '') + '</span>' + readStat + '</div>'
                + renderActions(msg, isMe)
                + '</div>';
        });
        return html;
    }

    // [NEGO ENGINE 2026-09] Rejesha mtiririko wa chat (kadi za negotiation
    // hubadilika hali/vitufe mara injini inapobadilisha state) bila kupoteza
    // nafasi ya kusogeza.
    function renderChatStream() {
        var chatDiv = document.getElementById('chatMessages');
        var core = skh.chatCore || {};
        if (!chatDiv || !core.convId) return;
        var msgs = filteredMsgs(core.msgs || []);
        var html = renderMessageList(msgs, core.conv || {});
        if (msgs.length >= msgLimit) html += '<div style="text-align:center;margin-top:8px;"><button type="button" class="ch-ctxbtn" onclick="window.skhChatLoadOlder()">' + T('ch_load_older', 'Pakia ujumbe wa zamani') + '</button></div>';
        var atBottom = (chatDiv.scrollHeight - chatDiv.scrollTop - chatDiv.clientHeight) < 80;
        chatDiv.innerHTML = html;
        if (atBottom) chatDiv.scrollTop = chatDiv.scrollHeight;
    }

    window.skhChatRenderStream = renderChatStream;

    function markRead(convId, conv) {
        var me = myUid();
        var unread = Object.assign({}, conv.unread || {});
        var lastReadAt = Object.assign({}, conv.lastReadAt || {});
        if ((unread[me] || 0) === 0 && lastReadAt[me]) return; // hakuna kipya
        unread[me] = 0;
        lastReadAt[me] = nowIso();
        skh.updateDoc(skh.doc(skh.db, 'conversations', convId), { unread: unread, lastReadAt: lastReadAt }).catch(function () {});
    }

    function updateHeaderSub(conv) {
        var core = skh.chatCore || {};
        var el = core.subEl;
        if (!el) return;
        // [CHAT HEADER v2] Jina tu kawaida; "anaandika…" huonekana kwa maandishi
        // madogo tu wakati mwenzawe anaandika (km. sekunde 8 za mwisho).
        var typingFresh = conv.typing && conv.typing.at && ((Date.now() - new Date(conv.typing.at).getTime()) < 8000);
        if (conv.typing && conv.typing.uid && conv.typing.uid === core.partnerUid && typingFresh) {
            el.innerHTML = '<span class="ch-typing-dots"><i></i><i></i><i></i></span> ' + T('ch_typing', 'anaandika…');
            return;
        }
        el.textContent = '';
    }

    function listen(convId) {
        var chatDiv = document.getElementById('chatMessages');
        if (!chatDiv) return;
        if (skh.chatCoreUnsub) { try { skh.chatCoreUnsub(); } catch (e) {} }
        if (skh.chatCoreConvUnsub) { try { skh.chatCoreConvUnsub(); } catch (e) {} }

        chatDiv.innerHTML = '<p style="text-align:center;color:#667781;padding:30px 10px;font-size:13px;">' + T('ch_loading', 'Inapakia meseji...') + '</p>';

        var q = skh.query(skh.collection(skh.db, 'conversations/' + convId + '/messages'), skh.orderBy('createdAt', 'asc'), skh.limit(msgLimit));
        skh.chatCoreUnsub = skh.onSnapshot(q, function (snap) {
            var msgs = [];
            if (snap && snap.forEach) snap.forEach(function (d) { msgs.push(Object.assign({ id: d.id }, d.data())); });
            (skh.chatCore || {}).msgs = msgs;
            var html = renderMessageList(filteredMsgs(msgs), (skh.chatCore || {}).conv || {});
            if (msgs.length >= msgLimit) html += '<div style="text-align:center;margin-top:8px;"><button type="button" class="ch-ctxbtn" onclick="window.skhChatLoadOlder()">' + T('ch_load_older', 'Pakia ujumbe wa zamani') + '</button></div>';
            // [AUDIT anti-flicker] subiri: scroll chini TU user karibu-chini (au load ya kwanza & msgs chache)
            var atBottomL = (chatDiv.scrollHeight - chatDiv.scrollTop - chatDiv.clientHeight) < 90;
            if (!chatDiv.__skhHasRows) atBottomL = true;                 // first paint ⇒ enda chini
            chatDiv.innerHTML = html;
            chatDiv.__skhHasRows = true;
            if (atBottomL) chatDiv.scrollTop = chatDiv.scrollHeight;

            // [§27 R8 DELIVERED-ACK 2026-09] Ujumbe umeikawa DEVICE/session ya
            // mwenzangu — andika `deliveredAt[me]` backend (si timestamp ya client
            // pekee). SINGLE write per latest (ref-count throttled kwa `skh._lastDeliv`).
            try {
                var me0 = myUid();
                var core0 = skh.chatCore || {};
                var dlv0 = ((core0.conv && core0.conv.deliveredAt) || {});
                var myCurrent = dlv0[me0] || '';
                var latestPartner = null;
                for (var ki = msgs.length - 1; ki >= 0; ki--) {
                    if (msgs[ki] && msgs[ki].senderId && msgs[ki].senderId !== me0 && msgs[ki].createdAt) { latestPartner = msgs[ki].createdAt; break; }
                }
                if (latestPartner && (!myCurrent || latestPartner > myCurrent) && skh._lastDelivAck !== latestPartner) {
                    skh._lastDelivAck = latestPartner;
                    var nextDlv = Object.assign({}, dlv0); nextDlv[me0] = latestPartner;
                    skh.updateDoc(skh.doc(skh.db, 'conversations', convId), { deliveredAt: nextDlv }).catch(function () { skh._lastDelivAck = null; });
                }
            } catch (e) {}
        }, function () {
            chatDiv.innerHTML = '<p style="text-align:center;color:#b91c1c;padding:30px 10px;font-size:13px;">' + (window.skhNavIcon?window.skhNavIcon('alert',14):'') + '' + T('ch_load_fail', 'Imeshindwa kupakia meseji. Jaribu tena.') + '</p>';
        });

        // Msimamizi wa conversation (typing + read receipts + unread).
        var convRef = skh.doc(skh.db, 'conversations', convId);
        skh.chatCoreConvUnsub = skh.onSnapshot(convRef, function (snap) {
            if (!snap || !snap.exists || !snap.exists()) return;
            var conv = snap.data();
            var core = skh.chatCore || {};
            var oldConv = core.conv || {};
            core.conv = conv;
            updateHeaderSub(conv);
            markRead(convId, conv);
            // [§26-§28 R8 TICKS] partner lastReadAt imebadilika → re-render
            // stream (scroll inabaki) ili tick iwapo --read moja kwa moja —
            // backend-truth, si client e-mail.
            var partner = core.partnerUid;
            var oldLra = partner && oldConv.lastReadAt ? oldConv.lastReadAt[partner] : null;
            var newLra = partner && conv.lastReadAt ? conv.lastReadAt[partner] : null;
            if (oldLra !== newLra) { try { renderChatStream(); } catch (e) {} }
            // [§27 R8 DELIVERED] daliz-prototaga za deliveredAt zikibadilika kwa mwenzake —
            // re-render (scroll-stable) ili ✓✓ iwite-native-tumplet-yauna-nyesh-siv.
            try {
                var oldDlv = partner && oldConv.deliveredAt ? oldConv.deliveredAt[partner] : null;
                var newDlv = partner && conv.deliveredAt ? conv.deliveredAt[partner] : null;
                if (oldDlv !== newDlv) renderChatStream();
            } catch (e) {}
        }, function () {});
    }

    // ---------- Chip ya kujibu (reply) ----------
    function renderReplyChip() {
        var host = document.getElementById('chatReplyChip');
        var composer = document.getElementById('chatComposer');
        if (!composer) return;
        if (!host) {
            host = document.createElement('div');
            host.id = 'chatReplyChip';
            composer.parentElement.insertBefore(host, composer);
        }
        var core = skh.chatCore || {};
        if (!core.replyTo) { host.style.display = 'none'; host.innerHTML = ''; return; }
        host.style.display = 'block';
        host.innerHTML = '<div class="ch-replychip">' + T('ch_replying', 'Unajibu') + ': ' + esc(truncate(core.replyTo.text || '', 60))
            + ' <button type="button" onclick="window.skhChatCancelReply()" aria-label="Funga">' + (window.skhNavIcon ? window.skhNavIcon('x',16) : '') + '</button></div>';
    }

    // [CHAT HEADER v2 2026-09] Vitendo vya mazungumzo viko ndani ya menyu
    // ya nukta tatu (juu kulia): Nyamazisha, Hifadhi (Archive), Zuia, Ripoti.
    var headMenuState = { convId: null, partnerUid: null };
    function hIco(name, size) {
        return window.skhNavIcon ? window.skhNavIcon(name, size || 15) : '';
    }
    function closeHeadMenu() {
        var menu = document.getElementById('chatHeadMenu');
        var btn = document.getElementById('chatMenuBtn');
        if (menu) {
            menu.hidden = true;
            menu.setAttribute('hidden', '');
            menu.style.display = 'none';
        }
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    window.skhChatHeadMenuClose = closeHeadMenu;

    window.skhChatToggleHeadMenu = function (e) {
        if (e) {
            if (e.stopPropagation) e.stopPropagation();
            if (e.preventDefault) e.preventDefault();
        }
        var menu = document.getElementById('chatHeadMenu');
        var btn = document.getElementById('chatMenuBtn');
        if (!menu) return;
        var core = skh.chatCore || {};
        var partnerUid = core.partnerUid || skh.currentChatUid;
        var convId = core.convId;
        if (partnerUid && convId) {
            wireHeadMenu(partnerUid, convId);
        }
        var isHidden = menu.hidden || menu.hasAttribute('hidden') || menu.style.display === 'none';
        if (isHidden) {
            menu.removeAttribute('hidden');
            menu.hidden = false;
            menu.style.display = 'flex';
            if (btn) btn.setAttribute('aria-expanded', 'true');
        } else {
            closeHeadMenu();
        }
    };

    function wireHeadMenu(partnerUid, convId) {
        headMenuState = { convId: convId, partnerUid: partnerUid };
        var btn = document.getElementById('chatMenuBtn');
        var menu = document.getElementById('chatHeadMenu');
        if (!btn || !menu) return;
        // Weka icons za SVG (sheria ya icons — hakuna emoji).
        var setIc = function (id, name) { var el = document.getElementById(id); if (el) el.innerHTML = hIco(name, 15); };
        setIc('chatMenuViewProfileIc', 'user');
        setIc('chatMenuMuteIc', 'bell');
        setIc('chatMenuArchiveIc', 'folder');
        setIc('chatMenuBlockIc', 'x');
        setIc('chatMenuReportIc', 'alert');
        btn.onclick = function (e) {
            window.skhChatToggleHeadMenu(e);
        };
        var bind = function (id, fn) {
            var el = document.getElementById(id);
            if (el) el.onclick = function (e) {
                if (e) e.stopPropagation();
                closeHeadMenu();
                try { fn(); } catch (err) {}
            };
        };
        bind('chatMenuViewProfile', function () { if (partnerUid && window.openSellerProfile) window.openSellerProfile(partnerUid); });
        bind('chatMenuMute', function () { if (convId) window.skhChatToggleMute(convId); });
        bind('chatMenuArchive', function () { if (convId) window.skhChatToggleArchive(convId); });
        bind('chatMenuDeleteMe', function () { if (convId) window.skhChatDeleteForMe(convId); });
        bind('chatMenuBlock', function () { if (partnerUid) window.skhChatToggleBlock(partnerUid); });
        bind('chatMenuReport', function () { window.skhChatReport(convId); });
        // Funga menyu kubofya kando au kufungua mazungumzo mengine.
        if (!btn._skhDocBound) {
            btn._skhDocBound = true;
            document.addEventListener('click', function (e) {
                var menuEl = document.getElementById('chatHeadMenu');
                if (!menuEl || menuEl.hidden || menuEl.style.display === 'none') return;
                if (menuEl.contains(e.target) || (e.target.closest && e.target.closest('#chatMenuBtn'))) return;
                closeHeadMenu();
            });
        }
        refreshBlockMenu(partnerUid);
        refreshChatFlagsMenu(convId);
    }

    // Onyesha upya maandiko/hali za menyu (zuia, nyamazisha, hifadhi).
    function refreshBlockMenu(partnerUid) {
        var lbl = document.getElementById('chatMenuBlockLbl');
        var ic = document.getElementById('chatMenuBlockIc');
        var btn = document.getElementById('chatMenuBlock');
        if (!lbl || !partnerUid) return;
        blockedByMe(partnerUid).then(function (b) {
            lbl.textContent = b ? T('ch_unblock', 'Ondoa Mzuio (Unblock)') : T('ch_block', 'Zuia mwasiliani');
            if (btn) btn.classList.toggle('is-on', !!b);
            if (ic) ic.innerHTML = hIco(b ? 'refresh' : 'x', 15);
        }).catch(function () {});
    }

    function refreshChatFlagsMenu(convId) {
        if (!convId) return;
        try {
            skh.getDoc(skh.doc(skh.db, 'conversations', convId)).then(function (s) {
                var d = (s && s.exists && s.exists()) ? s.data() : {};
                var me = myUid();
                var muted = !!(d.muted && d.muted[me]);
                var archived = !!(d.archived && d.archived[me]);
                var mLbl = document.getElementById('chatMenuMuteLbl');
                var mIc = document.getElementById('chatMenuMuteIc');
                var aLbl = document.getElementById('chatMenuArchiveLbl');
                var aIc = document.getElementById('chatMenuArchiveIc');
                var mBtn = document.getElementById('chatMenuMute');
                var aBtn = document.getElementById('chatMenuArchive');
                if (mLbl) mLbl.textContent = muted ? 'Ondoa kunyamazisha' : T('ch_mute', 'Nyamazisha');
                if (mIc) mIc.innerHTML = hIco(muted ? 'bell' : 'bell', 15);
                if (mBtn) mBtn.classList.toggle('is-on', muted);
                if (aLbl) aLbl.textContent = archived ? 'Toa kwenye kumbukumbu' : 'Hifadhi (Archive)';
                if (aIc) aIc.innerHTML = hIc('folder', 15);
                if (aBtn) aBtn.classList.toggle('is-on', archived);
            }).catch(function () {});
        } catch (e) { /* ignore */ }
    }

    function renderContextBar(related, ctx) {
        var host = document.getElementById('chatAttachedProduct');
        var parent = host ? host.parentElement : null;
        if (!parent) return;
        var bar = document.getElementById('chatContextBar');
        if (!bar) { bar = document.createElement('div'); bar.id = 'chatContextBar'; parent.insertBefore(bar, host); }
        var btns = [];
        function b(label, onclick) { return '<button type="button" onclick="' + onclick + '" class="ch-ctxbtn">' + label + '</button>'; }
        // [§5/§6 CONTEXT CARD] Muktadha wa bidhaa/huduma/usafiri unaogombea kubaki
        // jukwaani kwenye chat header (sio tu kwenye vitufe vya 'p_'). CONTEXT:
        // aina + kichwa + bei/route + [Tazama X] → kufungua Details sahihi.
        // related hapa imeshapita pair-guard + leak-scrub, kwa hiyo ni salama.
        var card = '';
        if (related) {
            var ck = related.transportId ? 'transport' : related.serviceId ? 'service' : (related.productId ? 'product' : null);
            if (ck) {
                var cid    = ck === 'transport' ? related.transportId : ck === 'service' ? related.serviceId : related.productId;
                var ctitle = ck === 'transport' ? (related.transportTitle || 'Usafiri')
                           : ck === 'service' ? (related.serviceTitle || 'Huduma')
                           : (related.productTitle || 'Bidhaa');
                var cprice = ck === 'transport' ? related.transportFare : ck === 'service' ? related.servicePrice : related.productPrice;
                var csub   = ck === 'transport'
                    ? ((related.transportFrom || '—') + ' → ' + (related.transportTo || '—'))
                    : (ck === 'service' ? (related.serviceScope || '') : '');
                var cimg   = ck === 'product' ? (related.productImage || '') : (ck === 'service' ? (related.serviceImage || '') : '');
                var ccoll  = ck === 'transport' ? (related.transportCollection || 'ride_requests')
                           : ck === 'service' ? 'services' : (related.productCollection || 'products');
                var cicon  = ck === 'transport' ? 'truck' : ck === 'service' ? 'wrench' : 'cart';
                var clabel = ck === 'transport' ? T('ch_view_transport', 'Tazama Usafiri')
                           : ck === 'service' ? T('ch_view_service', 'Tazama Huduma')
                           : T('ch_view_product', 'Tazama Bidhaa');
                var money2 = (cprice != null && isFinite(Number(cprice)) && Number(cprice) > 0)
                    ? 'TSh ' + Math.round(Number(cprice)).toLocaleString('en-US') : '';
                // [§28 MODE CHIP] Chat ijue kama muktadha huu ni mnada/group/
                // price_drop/wholesale (related.productSaleMode iliyoandikwa
                // wakati conversation ikifunguzwa) — halisi, si placeholder.
                var modeChip = '';
                if (ck === 'product' && related.productSaleMode && related.productSaleMode !== 'free_market') {
                    var modeLbl = { auction: 'Mnada', group_buy: 'Group Buy', price_drop: 'Bei Kushuka', wholesale: 'Jumla' }[related.productSaleMode];
                    if (modeLbl) modeChip = ' <span style="background:#fff3cd;color:#8a6d00;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:900;">' + esc(modeLbl) + '</span>';
                }
                card = '<div class="ch-ctxcard" data-ctx-kind="' + ck + '" style="display:flex;align-items:center;gap:8px;background:#f0f7fc;border:1px solid #d7e9f5;border-radius:10px;padding:6px 10px;margin-bottom:4px;">'
                    + (cimg ? '<img src="' + esc(cimg) + '" alt="" style="width:34px;height:34px;border-radius:8px;object-fit:cover;">' : '')
                    + '<div style="flex:1;min-width:0;">'
                    + '<div style="font-weight:800;font-size:12px;color:var(--primary-dark,#0B4F7A);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                    +  (window.skhNavIcon ? window.skhNavIcon(cicon, 12) : '') + ' ' + esc(ctitle) + modeChip + '</div>'
                    + '<div style="font-size:11px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                    +  esc(money2) + (money2 && csub ? ' · ' : '') + esc(csub) + '</div>'
                    + '</div>'
                    + '<button type="button" class="ch-ctxbtn" onclick="window.openProduct(\'' + jsEsc(cid) + '\',\'' + jsEsc(ccoll) + '\')" style="flex-shrink:0;">' + esc(clabel) + '</button>'
                    + '</div>';
            }
        }
        if (ctx && ctx.indexOf('p_') === 0 && !card) {
            var pid = jsEsc(ctx.slice(2));
            btns.push(b('' + (window.skhNavIcon?window.skhNavIcon('cart',14):'') + ' ' + T('ch_view_product', 'Tazama Bidhaa'), 'window.openProduct(\'' + pid + '\')'));
            if (related && related.sellerId) btns.push(b('' + (window.skhNavIcon?window.skhNavIcon('shop',14):'') + '' + T('ch_view_store', 'Duka'), 'if(window.openSellerProfile)window.openSellerProfile(\'' + jsEsc(related.sellerId) + '\')'));
        }
        if (related && related.orderId) btns.push(b('' + (window.skhNavIcon?window.skhNavIcon('package',14):'') + '' + T('ch_order_status', 'Hali ya Oda'), 'if(window.openBuyerOrdersModal)window.openBuyerOrdersModal()'));
        if (related && related.deliveryId) btns.push(b('' + (window.skhNavIcon?window.skhNavIcon('truck',14):'') + '' + T('ch_track', 'Fuatilia'), 'if(window.openMyDeliveries)window.openMyDeliveries()'));
        if (!card && !btns.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        bar.style.display = 'block';
        bar.innerHTML = card + (btns.length ? '<div class="ch-ctxbar">' + btns.join('') + '</div>' : '');
    }

    function attachConversation(conv, partnerUid, partnerName, opts) {
        opts = opts || {};
        var core = skh.chatCore = {
            convId: conv.id,
            partnerUid: partnerUid,
            partnerName: partnerName,
            replyTo: null,
            msgs: [],
            conv: conv.data || {},
            subEl: null
        };
        var cw = document.getElementById('chatWith');
        if (cw) cw.textContent = partnerName;
        var cm0 = document.getElementById('chatModal');
        var card0 = cm0 ? cm0.querySelector('.chat-card') : null;
        if (card0 && isDesktopChat()) card0.classList.add('chat-two-pane');
        var sub = cw && cw.parentElement ? cw.parentElement.querySelector('small') : null;
        core.subEl = sub;
        // [CTX-LEAK FIX] Chat hii inapoanzishwa, ondoa globals za activeChat*
        // ambazo hazimuhusu partner — zisidondoke kama "bidhaa imeambatishwa"
        // au kadi ya negotiation kwa mtu asiyehusika.
        try {
            if (skh.activeChatProduct && ctxOwnerOf(skh.activeChatProduct) !== partnerUid) skh.activeChatProduct = null;
            if (skh.activeChatService && ctxOwnerOf(skh.activeChatService) !== partnerUid) skh.activeChatService = null;
            if (skh.activeChatTransport && ctxOwnerOf(skh.activeChatTransport) !== partnerUid) skh.activeChatTransport = null;
        } catch (eCtx) {}
        if (typeof window.skhSetChatHeaderAvatar === 'function') window.skhSetChatHeaderAvatar(partnerUid, null, partnerName);
        if (typeof window.skhRenderAttachedProduct === 'function') window.skhRenderAttachedProduct();
        // [CTX-LEAK FIX] related za zamani zilizoharibika kwenye docs
        // zisizidi kuonyesha context bar ya bidhaa kwa mtu mwingine.
        // [CTX-LEAK CLEAN] Doc inayobeba related ya MTU asiye partner
        // (umiliki mbaya kwa jozi hii — haiwezi kuwa sahihi): futa FIELDS
        // mbaya tu (muktadha + umiliki), ACHa related.commerce (nego/oda
        // link) na fields nyingine. Huu ni scrub wa on-read, si migration.
        try {
            var _rel0 = (conv.data && conv.data.related) || null;
            if (_rel0 && pairRelatedOrNull(_rel0, partnerUid) === null && typeof skh.deleteField === 'function') {
                var _del = skh.deleteField();
                var _scrub = {};
                ['productId','productTitle','productPrice','productImage','productCollection','productSaleMode',
                 'serviceId','serviceTitle','servicePrice','serviceImage','serviceScope',
                 'transportId','transportTitle','transportFare','transportFrom','transportTo',
                 'transportRoute','transportPackage','transportCollection',
                 'sellerId','buyerId'].forEach(function (k) {
                    if (_rel0[k] !== undefined) _scrub['related.' + k] = _del;
                });
                if (Object.keys(_scrub).length) {
                    skh.updateDoc(skh.doc(skh.db, 'conversations', conv.id), _scrub).catch(function () {});
                }
            }
        } catch (eScrub) { /* usafi si kikwazo */ }
        renderContextBar(pairRelatedOrNull(opts.related || (conv.data && conv.data.related) || null, partnerUid), opts.ctx || '');
        // [NEGO ENGINE 2026-09] Vitendo vya biashara vinaishi NDANI ya UI ya chat
        // (kadi za negotiation + kadi ya bidhaa), si vitufe vilivyokwama kwenye
        // sehemu ya kuandikia. Anchor hapa ni STRIP TULIVU tu (hali + oda).
        skh.negoCurrent = null; skh.negoOrder = null;
        ensureCommerceAnchor();
        renderCommerceAnchor();
        window.skhNegoListen(conv.id);
        renderReplyChip();
        closeHeadMenu();
        wireHeadMenu(partnerUid, conv.id);
        // [NAV §23 2026-09-16] Kumbuka modal ya tangazo iliyokuwa WAZI kabla
        // ya chat kufunguka (closeModals inaificha) — "Back" kutoka chat
        // iirejeshe Product Details, si Home moja kwa moja.
        core.reopenOnCloseId = null;
        try {
            ['productModal'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el && getComputedStyle(el).display !== 'none') core.reopenOnCloseId = id;
            });
        } catch (eOpen) {}
        // [FIX 2026-09-19 ONE-CLICK NO BLINK] — no redundant closeModals if instant open already hid inbox
        try {
            var __isInstant = !!(window.__skhOpening && window.__skhOpening.uid === partnerUid && (Date.now() - window.__skhOpening.at) < 1200);
            if (__isInstant) {
                // already hid chatListModal in 78 patch — keep chatModal visible, no blink
                var cmInstant = document.getElementById('chatModal');
                if (cmInstant) {
                    cmInstant.style.display = 'flex';
                    cmInstant.style.opacity = '1';
                    cmInstant.style.transform = 'none';
                }
                var inboxInstant = document.getElementById('chatListModal');
                if (inboxInstant) { inboxInstant.style.display = 'none'; inboxInstant.classList.remove('open'); }
            } else {
                // desktop two-pane: chatModal already open → don't hide it, just hide inbox list
                var cmExist = document.getElementById('chatModal');
                var isDesk = (typeof isDesktopChat === 'function' && isDesktopChat()) || (window.innerWidth >= 900);
                if (cmExist && cmExist.style.display !== 'none' && isDesk) {
                    var inboxDesk = document.getElementById('chatListModal');
                    if (inboxDesk) { inboxDesk.style.display = 'none'; inboxDesk.classList.remove('open'); }
                } else {
                    // mobile or no chat open: close only inbox, not all modals, to avoid UI→inbox double-hop
                    var inboxEl = document.getElementById('chatListModal');
                    if (inboxEl && inboxEl.style.display !== 'none') {
                        inboxEl.style.display = 'none';
                        inboxEl.classList.remove('open');
                        try { if (window.skhNavDepth && window.skhNavDepth() > 0) { /* let nav stack prune */ } } catch(e){}
                    } else {
                        closeModals();
                    }
                }
            }
        } catch(eBlink){ try{ closeModals(); }catch(e2){} }
        var cm = document.getElementById('chatModal');
        if (cm) cm.style.display = 'flex';
        // [NAV §23] Sajili chatModal kwenye rundo la 56-nav-back (dedupe ya
        // 56 huzuia nakala mbili) — restore ukitumwa itarejesha modal ya
        // mmelezi (Product Details) inapofungwa chat.
        try {
            if (typeof window.skhNavPush === 'function') {
                window.skhNavPush({ type: 'modal', id: 'chatModal', restore: function () {
                    // 56-skhaCloseTop: modal yenye restore haifungwi kiotomatiki
                    // — kifunge wewe (au restoration uliyokusudia).
                    var cmSelf = document.getElementById('chatModal');
                    var rid = null;
                    try { rid = (skh.chatCore && skh.chatCore.reopenOnCloseId) || null; } catch (e0) {}
                    if (!rid) { if (cmSelf) cmSelf.style.display = 'none'; return; }
                    try {
                        if (cmSelf) cmSelf.style.display = 'none';
                        var rel = document.getElementById(rid);
                        if (rel && skh.currentOpenProduct && skh.currentOpenProduct.id) {
                            rel.style.display = 'flex';
                            document.body.style.overflow = 'hidden';
                        }
                    } catch (eR) { /* navigation si kikwazo */ }
                } });
            }
        } catch (eNav) {}
        var inp = document.getElementById('chatInput');
        if (inp) {
            // [DRAFT 2026-09] Rejesha rasimu yangu ya mazungumzo haya (spec §12).
            try {
                var myDraft = (conv.data && conv.data.drafts && conv.data.drafts[myUid()]) || null;
                if (myDraft && myDraft.text && !core._draftRestored) { inp.value = myDraft.text; core._draftRestored = true; }
            } catch (e) { /* ignore */ }
            inp.oninput = function () {
                window.skhChatTyping();
                if (typeof window.skhNegoIntentHint === 'function') window.skhNegoIntentHint(inp.value);
                window.skhChatSaveDraft(inp.value);
            };
            setTimeout(function () { try { inp.focus(); } catch (e) {} }, 250);
        }
        listen(conv.id);
        bindSwipeReply();
        bindMessageMenu();
        // [BLOCK FIX 2026-09] Onyesha hali ya block na usajili msikilizaji wa
        // muda halisi wa chatBlocks — hali haibaki "imefungwa" baada ya mabadiliko.
        window.skhChatRenderBlockedState();
        refreshBlockIcon(partnerUid);
        setupBlockListener(partnerUid);
        window.skhChatRenderSidePane();
    }

    // [GESTURE REPLY 2026-09] Telezesha (swipe) ujumbe kando ili kumjibu —
    // kama WhatsApp. Inafanya kazi kwa kugusa (touch) na kwa panya (drag).
    function bindSwipeReply() {
        var list = document.getElementById('chatMessages');
        if (!list || list._skhSwipeBound) return;
        list._skhSwipeBound = true;
        var startX = 0, startY = 0, startEl = null, horiz = false;

        function onStart(x, y, el) {
            startX = x; startY = y; horiz = false;
            startEl = el && el.closest ? el.closest('.ch-msg') : null;
        }
        function onMove(x, y) {
            var dx = x - startX, dy = y - startY;
            if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4) horiz = true;
        }
        function onEnd() {
            if (!startEl || !horiz) { startEl = null; return; }
            var mid = startEl.getAttribute('data-msgid');
            if (!mid || startEl.getAttribute('data-mine') === '1') { startEl = null; return; } // jibu ujumbe wa MWENZAKE
            startEl.classList.add('ch-swipe-flash');
            setTimeout(function () { try { startEl.classList.remove('ch-swipe-flash'); } catch (e) {} }, 350);
            if (typeof window.skhChatReply === 'function') window.skhChatReply(mid);
            startEl = null;
        }

        // Touch
        list.addEventListener('touchstart', function (e) {
            var t = e.touches && e.touches[0]; if (!t) return;
            onStart(t.clientX, t.clientY, e.target);
        }, { passive: true });
        list.addEventListener('touchmove', function (e) {
            var t = e.touches && e.touches[0]; if (!t) return;
            onMove(t.clientX, t.clientY);
        }, { passive: true });
        list.addEventListener('touchend', onEnd);
        // Mouse (desktop drag)
        var dragging = false;
        list.addEventListener('mousedown', function (e) { dragging = true; onStart(e.clientX, e.clientY, e.target); });
        window.addEventListener('mousemove', function (e) { if (dragging) onMove(e.clientX, e.clientY); });
        window.addEventListener('mouseup', function () { if (dragging) { dragging = false; onEnd(); } });
    }

    // ---------- TAFUTA conversation ya watu hawa Wawili (identity MOJA) ----------
    // [CHAT FIX 2026-09] Sababu ya "mazungumzo kupotea": kila njia ya kufungua
    // chat ilikuwa inatumia ID tofauti (conv_..._p_xyz kwa bidhaa, conv_... kwa
    // inbox) → ujumbe ukiandikwa kwenye doc moja, halafu ukifungua nyingine
    // ukaona TUPU. Sasa: watu wawili = conversation MOJA daima (base id, bila
    // context). Context (bidhaa/oda) inaishi kwenye `related` — si kwenye ID.
    // [CHAT FIX 2026-09] Watu wawili = conversation MOJA (base id). Zile za zamani
    // zilizogawanyika kwa context kwenye ID zinachanganywa (merge) ndani ya base
    // (idempotent, dedup kwa id ya ujumbe) — ili historia ISIPOTEE kamwe.
    // HURUDISHA orodha ya IDs za zamani za jozi (kwa fallback ya skhNegoListen).
    var lastMergedConvIds = [];
    async function mergePairConversations(baseId, partnerUid) {
        var me = myUid();
        lastMergedConvIds = [];
        if (!me || !partnerUid || !baseId) return [];
        try {
            var q = skh.query(skh.collection(skh.db, 'conversations'), skh.where('participants', 'array-contains', me), skh.limit(100));
            var snap = await skh.getDocs(q);
            var others = [];
            if (snap && snap.forEach) snap.forEach(function (d) {
                if (d.id === baseId) return;
                var c = d.data() || {};
                if (c.type === 'group' || String(d.id).indexOf('conv_group_') === 0) return; // [NEVER TOUCH GROUPS]
                if (c.mergedInto) return;
                var oth = (c.participants || []).filter(function (u) { return u !== me; });
                if (oth.indexOf(partnerUid) !== -1) others.push(d.id);
            });
            lastMergedConvIds = others.slice();
            for (var i = 0; i < others.length; i++) {
                var srcId = others[i];
                try {
                    var mq = skh.query(skh.collection(skh.db, 'conversations/' + srcId + '/messages'), skh.orderBy('createdAt', 'asc'), skh.limit(500));
                    var ms = await skh.getDocs(mq);
                    var writes = [];
                    if (ms && ms.forEach) ms.forEach(function (d) {
                        writes.push(skh.setDoc(skh.doc(skh.db, 'conversations/' + baseId + '/messages', d.id), d.data()));
                    });
                    if (writes.length) await Promise.all(writes);
                    await skh.updateDoc(skh.doc(skh.db, 'conversations', srcId), { mergedInto: baseId }).catch(function () {});
                } catch (e2) { /* skip hii */ }
            }
        } catch (e) { /* best-effort */ }
        return others;
    }

    // ---------- HAMISHA ujumbe wa zamani (chats → conversations) mara MOJA ----------
    // [CHAT FIX 2026-09] Mazungumzo ya zamani yaliandikwa kwenye `chats` (legacy).
    // Tunayahamisha kwenye conversation husika (idempotent, dedup kwa
    // createdAt+text+senderUid) ili historia isipotee.
    async function migrateLegacyChats(convId, partnerUid) {
        if (!convId || !partnerUid || !skh.db) return;
        var me = myUid();
        if (!me) return;
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'conversations', convId));
            if (!s || !s.exists || !s.exists()) return;
            var conv = s.data() || {};
            if (conv.migratedLegacy) return;
            var q1 = skh.query(skh.collection(skh.db, 'chats'), skh.where('senderUid', '==', me), skh.limit(200));
            var q2 = skh.query(skh.collection(skh.db, 'chats'), skh.where('receiverUid', '==', me), skh.limit(200));
            var snaps = await Promise.all([skh.getDocs(q1), skh.getDocs(q2)]);
            var legacy = [], seen = {};
            snaps.forEach(function (sn) {
                if (!sn || !sn.forEach) return;
                sn.forEach(function (d) {
                    var c = d.data() || {};
                    var other = c.senderUid === me ? c.receiverUid : c.senderUid;
                    if (other !== partnerUid || seen[d.id]) return;
                    seen[d.id] = 1;
                    legacy.push({ id: d.id, data: c });
                });
            });
            if (!legacy.length) { await skh.updateDoc(skh.doc(skh.db, 'conversations', convId), { migratedLegacy: true }).catch(function () {}); return; }
            // Dedup dhidi ya ujumbe uliopo kwenye conversation (dual-write).
            var existing = {};
            try {
                var mq = skh.query(skh.collection(skh.db, 'conversations/' + convId + '/messages'), skh.orderBy('createdAt', 'asc'), skh.limit(400));
                var ms = await skh.getDocs(mq);
                if (ms && ms.forEach) ms.forEach(function (d) {
                    var m = d.data() || {};
                    existing[String(m.createdAt || '') + '|' + String(m.senderId || '') + '|' + String(m.text || '').slice(0, 80)] = 1;
                });
            } catch (e) { /* ignore */ }
            legacy.sort(function (a, b) { return String(a.data.createdAt || '').localeCompare(String(b.data.createdAt || '')); });
            var writes = [];
            legacy.forEach(function (l) {
                var c = l.data;
                var key = String(c.createdAt || '') + '|' + String(c.senderUid || '') + '|' + String(c.text || '').slice(0, 80);
                if (existing[key]) return;
                var m = { text: c.text || '', senderId: c.senderUid || '', receiverId: c.receiverUid || '', senderName: c.senderName || '', receiverName: c.receiverName || '', createdAt: c.createdAt || nowIso(), type: 'text', legacy: true };
                if (c.text && c.text.indexOf(' Attachment:') === 0) {
                    var url = String(c.text).replace(' Attachment:', '').trim();
                    if (/^https:\/\/[^\s"'<>]+$/.test(url)) {
                        var mt = /\.(mp4|webm|ogg)$/i.test(url) || url.indexOf('/video/upload/') !== -1 ? 'video'
                            : (/\.(jpeg|jpg|png|gif|webp)$/i.test(url) || url.indexOf('/image/upload/') !== -1 ? 'image' : 'file');
                        m.type = mt; m.mediaReference = url; m.text = '';
                    }
                }
                if (c.productId) {
                    m.type = 'product';
                    m.productRef = { id: c.productId, collection: c.productCollection || 'products' };
                    m.productSnapshot = { title: c.productTitle || '', image: c.productImg || '', sellerId: c.sellerUid || null };
                }
                writes.push(skh.setDoc(skh.doc(skh.db, 'conversations/' + convId + '/messages', l.id), m));
            });
            if (writes.length) await Promise.all(writes);
            await skh.updateDoc(skh.doc(skh.db, 'conversations', convId), { migratedLegacy: true }).catch(function () {});
        } catch (e) { /* best-effort */ }
    }

    // ---------- KUFUNGUA CHAT ----------
    // [INSTANT OPEN FIX 2026-09] Chat inafunguka MARA MOJA — UI inaonyeshwa
    // papo hapo na loading indicator, kisha queries za background zinafanyika
    // baadaye. Zamani ilikuwa inasubiri queries 10-20 SEQUENTIALLY (5-15s).
    window.skhChatOpen = async function (uid, name, opts) {
        if (!skh.requireAuth()) return null;
        if (!uid) { alert(T('ch_unknown_person', 'Hatujui mtu huyu bado.')); return null; }
        if (uid === myUid()) { alert(T('ch_self', 'Huwezi kujitumia ujumbe mwenyewe.')); return null; }
        opts = opts || {};
        var email = opts.email || skh.currentChatEmail || '';
        var partnerName = name || opts.name || '';

        // [INSTANT UI] Weka chat state na ufungue modal MARA MOJA
        skh.currentChatUid = uid;
        skh.currentChatEmail = email || '';
        skh.chatPartner = partnerName || (email ? email.split('@')[0] : 'Mawasiliano');

        // Fungua chatModal papo hapo na loading indicator
        var cmEarly = document.getElementById('chatModal');
        if (cmEarly) {
            cmEarly.style.display = 'flex';
            cmEarly.style.opacity = '1';
            cmEarly.style.transform = 'none';
        }
        var cwEarly = document.getElementById('chatWith');
        if (cwEarly) cwEarly.textContent = partnerName || '...';
        var chatDivEarly = document.getElementById('chatMessages');
        if (chatDivEarly) {
            chatDivEarly.innerHTML = '<div style="text-align:center;padding:40px 16px;">'
                + '<div style="display:inline-block;width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#0B4F7A;border-radius:50%;animation:skhSpin 0.8s linear infinite;"></div>'
                + '<p style="color:#64748b;font-size:13px;margin-top:12px;">' + T('ch_connecting', 'Inaunganisha mazungumzo...') + '</p>'
                + '</div>';
        }
        // Inject spinner animation kama haipo
        if (!document.getElementById('skhSpinStyle')) {
            var spinStyle = document.createElement('style');
            spinStyle.id = 'skhSpinStyle';
            spinStyle.textContent = '@keyframes skhSpin{to{transform:rotate(360deg)}}';
            document.head.appendChild(spinStyle);
        }

        // Fichua inbox (kama ilikuwa wazi)
        try {
            var inboxEl = document.getElementById('chatListModal');
            if (inboxEl && inboxEl.style.display !== 'none') {
                inboxEl.style.display = 'none';
                inboxEl.classList.remove('open');
            }
        } catch(e){}

        // Sasa fanya queries za background
        try {
            if (!email || !partnerName) {
                try {
                    var s = await skh.getDoc(skh.doc(skh.db, 'users', uid));
                    if (s && s.exists && s.exists()) {
                        var u = s.data();
                        email = email || u.email || u.userEmail || '';
                        partnerName = partnerName || u.displayName || u.fullName || u.storeName || '';
                    }
                } catch (e) { /* ignore */ }
            }
            partnerName = partnerName || (email ? email.split('@')[0] : 'Mawasiliano');
            skh.currentChatEmail = email || '';
            skh.chatPartner = partnerName;

            var me = myUid();
            var scopedRel = opts.related || scopedRelatedForPartner(uid);
            var ctx = opts.ctx || (scopedRel && scopedRel.productId ? 'p_' + scopedRel.productId : '');
            var related = scopedRel;
            var type = opts.type || ((ctx && ctx.indexOf('o_') === 0) ? 'order' : ((ctx && ctx.indexOf('d_') === 0) ? 'delivery' : 'direct'));

            // [PARALLEL FIX] Fanya ensureConversation kwanza (inategemewa na zingine)
            var conv = await ensureConversation(uid, { ctx: '', related: related, type: type });

            // [PARALLEL FIX] merge + migrate + related update kwa PARALLEL (si sequential)
            var mergedIds = [];
            try {
                var results = await Promise.allSettled([
                    mergePairConversations(conv.id, uid),
                    migrateLegacyChats(conv.id, uid),
                    related ? skh.updateDoc(skh.doc(skh.db, 'conversations', conv.id), { related: related }) : Promise.resolve()
                ]);
                mergedIds = (results[0] && results[0].status === 'fulfilled') ? results[0].value : [];
            } catch(e) { /* best-effort */ }

            // Sasa fungua chat kamili
            attachConversation(conv, uid, partnerName, { ctx: ctx, related: related });
            skh.chatCore.extraConvIds = (mergedIds || lastMergedConvIds || []).slice();
            return conv;
        } catch(e) {
            console.warn('[chat open error]', e);
            var chatDiv = document.getElementById('chatMessages');
            if (chatDiv) {
                chatDiv.innerHTML = '<p style="text-align:center;color:#b91c1c;padding:30px 10px;font-size:13px;">'
                    + T('ch_open_fail', 'Imeshindwa kufungua mazungumzo. Jaribu tena.') + '</p>';
            }
            return null;
        }
    };


    /* ---------- ACTIONS ZA UJUMBE ---------- */
    async function getMsg(msgId) {
        var core = skh.chatCore || {};
        var m = (core.msgs || []).filter(function (x) { return x.id === msgId; })[0];
        if (m) return m;
        var convId = core.convId;
        if (!convId || !msgId) return null;
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'conversations/' + convId + '/messages', msgId));
            if (s && s.exists && s.exists()) return Object.assign({ id: msgId }, s.data());
        } catch (e) { /* ignore */ }
        return null;
    }
    window.skhChatReply = async function (msgId) {
        var core = skh.chatCore; if (!core) return;
        var m = await getMsg(msgId);
        core.replyTo = m || { id: msgId, text: '' };
        renderReplyChip();
        var inp = document.getElementById('chatInput'); if (inp) inp.focus();
    };
    window.skhChatCancelReply = function () {
        if (skh.chatCore) skh.chatCore.replyTo = null;
        renderReplyChip();
    };
    window.skhChatCopy = async function (msgId) {
        var m = await getMsg(msgId);
        if (!m) return;
        var txt = m.text || (m.productSnapshot && m.productSnapshot.title) || '';
        if (typeof window.skhCopyText === 'function') window.skhCopyText(txt); else alert(txt);
    };
    window.skhChatEdit = async function (msgId) {
        var m = await getMsg(msgId);
        if (!m) return;
        var core = skh.chatCore || {};
        var oldText = m.text || '';
        var convId = core.convId;
        var doEdit = function (newText) {
            newText = (newText == null ? '' : String(newText)).trim();
            if (!newText) return;
            skh.updateDoc(skh.doc(skh.db, 'conversations/' + convId + '/messages', msgId), { text: newText, editedAt: nowIso() }).catch(function (e) { alert('Imeshindwa: ' + e.message); });
        };
        if (typeof window.customPrompt === 'function') window.customPrompt(T('ch_edit_msg', 'Hariri ujumbe'), oldText, doEdit);
        else { var v = await skhPrompt(T('ch_edit_msg', 'Hariri ujumbe'), oldText); if (v != null) doEdit(v); }
    };
    window.skhChatDelete = async function (msgId) {
        var convId = (skh.chatCore || {}).convId;
        if (!convId) return;
        var m = await getMsg(msgId);
        if (!m) return;
        if (!await skhConfirm(T('ch_delete_confirm', 'Futa ujumbe huu?'))) return;
        skh.updateDoc(skh.doc(skh.db, 'conversations/' + convId + '/messages', msgId), { deletedAt: nowIso(), text: '' }).catch(function () {});
    };
    window.skhChatReportMsg = function (msgId) {
        var convId = (skh.chatCore || {}).convId || null;
        window.skhChatReport(convId, msgId);
    };

    /* ---------- BLOCK / REPORT ---------- */
    // [BLOCK FIX 2026-09] Ikon ya block kwenye header lazima ilingane na hali HALISI
    // ya Firestore kila wakati (' + (window.skhNavIcon?window.skhNavIcon('lock',14):'') + '= hajazuiwa, 🔓 = amezuia) — si kubahatisha.
    // [CHAT HEADER v2] Hali ya block huonyeshwa ndani ya menyu ya nukta tatu.
    function refreshBlockIcon(partnerUid) {
        refreshBlockMenu(partnerUid);
    }

    // [BLOCK FIX 2026-09] Onyesha upya KILA sehemu inayoonyesha hali ya block,
    // ili UI isibaki "imefungwa/zimezuiliwa" baada ya block/unblock.
    window.skhChatRefreshBlockUi = async function (uid) {
        var partnerUid = uid || ((skh.chatCore || {}).partnerUid) || null;
        try { await window.skhChatRenderBlockedState(); } catch (e) {}
        if (partnerUid) refreshBlockIcon(partnerUid);
        // Orodha ya waliozuiwa (ikiwa paneli imefunguliwa) — irejeshe upya.
        var wrap = document.getElementById('chatBlockedUsersWrap');
        var host = document.getElementById('chatBlockedUsersList');
        if (wrap && host && wrap.style.display === 'block') renderBlockedUsers(host);
        // Side pane (desktop) — irejeshe upya ili hali iwianishe.
        if (typeof window.skhChatRenderSidePane === 'function') { try { window.skhChatRenderSidePane(); } catch (e) {} }
    };

    // [BLOCK FIX 2026-09] Msikilizaji wa muda halisi wa chatBlocks za mazungumzo
    // yaliyofunguliwa — hali inajirekebisha yenyewe hata kama block/unblock
    // inafanywa kutoka sehemu nyingine au mwenzako anakufungia.
    function setupBlockListener(partnerUid) {
        var me = myUid();
        if (!me || !partnerUid || typeof window.skhOnSnapshot !== 'function') return;
        try { if (typeof window.skhCancelListenersByPrefix === 'function') window.skhCancelListenersByPrefix('chat-block-'); } catch (e) {}
        var onBlockChange = function () {
            try { window.skhChatRenderBlockedState(); } catch (e) {}
            refreshBlockIcon(partnerUid);
        };
        try {
            window.skhOnSnapshot('chat-block-a-' + partnerUid, skh.doc(skh.db, 'chatBlocks', me + '__' + partnerUid), onBlockChange);
            window.skhOnSnapshot('chat-block-b-' + partnerUid, skh.doc(skh.db, 'chatBlocks', partnerUid + '__' + me), onBlockChange);
        } catch (e) { /* listener si wa kusitisha */ }
    }

    // Hali ya block kwenye chat iliyofunguliwa: composer inabadilishwa na
    // paneli ya "Umemzuia / Unblock" (au "Huwezi kumtumia") — sio kuficha tu.
    window.skhChatRenderBlockedState = async function () {
        var core = skh.chatCore; if (!core || !core.partnerUid) return;
        var composer = document.getElementById('chatComposer');
        if (!composer) return;
        var host = document.getElementById('chatBlockedState');
        if (!host) {
            host = document.createElement('div');
            host.id = 'chatBlockedState';
            composer.parentElement.insertBefore(host, composer);
        }
        var byMe = await blockedByMe(core.partnerUid);
        var byThem = await blockedByThem(core.partnerUid);
        var isBlocked = byMe || byThem;
        composer.style.display = isBlocked ? 'none' : 'flex';
        var ctxbar = document.getElementById('chatContextBar');
        if (ctxbar) ctxbar.style.display = isBlocked ? 'none' : '';
        var commerce = document.getElementById('chatCommerceBar');
        if (commerce) commerce.style.display = isBlocked ? 'none' : '';
        var reply = document.getElementById('chatReplyChip');
        if (reply) reply.style.display = isBlocked ? 'none' : '';
        if (!isBlocked) { host.style.display = 'none'; host.innerHTML = ''; return; }
        host.style.display = 'block';
        var blockIcoSvg = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#b91c1c" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>';
        if (byMe) {
            host.innerHTML = '<div class="ch-blocked-state">'
                + '<div class="ch-blocked-ico">' + blockIcoSvg + '</div>'
                + '<b>' + T('ch_you_blocked', 'Umemzuia mtumiaji huyu.') + '</b>'
                + '<span>' + T('ch_cant_send', 'Huwezi kutuma ujumbe kwa sasa.') + '</span>'
                + '<button type="button" class="ch-unblock-btn" onclick="window.skhChatUnblock(\'' + jsEsc(core.partnerUid) + '\', true)">' + T('ch_unblock', 'Ondoa Mzuio (Unblock)') + '</button>'
                + '</div>';
        } else {
            host.innerHTML = '<div class="ch-blocked-state">'
                + '<div class="ch-blocked-ico">' + blockIcoSvg + '</div>'
                + '<b>' + T('ch_they_blocked', 'Huwezi kutumia ujumbe kwa mtu huyu.') + '</b>'
                + '<span>' + T('ch_cant_send_them', 'Mawasiliano haya hayapo kwa sasa.') + '</span>'
                + '</div>';
        }
    };

    window.skhChatBlock = async function (uid) {
        var me = myUid(); if (!me || !uid || uid === me) return;
        if (!await skhConfirm(T('ch_block_confirm', 'Zuia mtu huyu? Hataweza kukutumia ujumbe.'))) return;
        await skh.setDoc(skh.doc(skh.db, 'chatBlocks', me + '__' + uid), { blockerId: me, blockedId: uid, createdAt: nowIso() });
        // [BLOCK FIX 2026-09] Onyesha upya hali YOTE (composer + icon + list + side pane).
        await window.skhChatRefreshBlockUi(uid);
        alert(T('ch_blocked_ok', 'Mtu huyu amezuiwa.'));
    };

    window.skhChatUnblock = async function (uid, noConfirm) {
        var me = myUid(); if (!me || !uid) return;
        if (noConfirm !== true && !await skhConfirm(T('ch_unblock_confirm', 'Ondoa mzuio? Mtaweza kuwasiliana tena.'))) return;
        await skh.deleteDoc(skh.doc(skh.db, 'chatBlocks', me + '__' + uid));
        // [BLOCK FIX 2026-09] Onyesha upya hali YOTE — composer irudi, icon ibadilike,
        // na orodha ya waliozuiwa ipunguke mara moja.
        await window.skhChatRefreshBlockUi(uid);
        alert(T('ch_unblocked_ok', 'Mzuio umeondolewa.'));
    };

    window.skhChatToggleBlock = async function (uid) {
        if (!uid) return;
        var byMe = await blockedByMe(uid);
        if (byMe) await window.skhChatUnblock(uid, false);
        else await window.skhChatBlock(uid);
    };

    // Orodha ya waliozuiwa (na kitufe cha Unblock) — Option B ya spec.
    async function loadBlockedUsers() {
        var me = myUid(); var items = [];
        try {
            var q = skh.query(skh.collection(skh.db, 'chatBlocks'), skh.where('blockerId', '==', me), skh.limit(200));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) {
                var b = d.data();
                items.push({ blockedId: b.blockedId, at: b.createdAt });
            });
        } catch (e) { /* ruhusa au tupu */ }
        for (var i = 0; i < items.length; i++) {
            var meta = await participantMeta(items[i].blockedId);
            items[i].name = meta.name; items[i].photo = meta.photo;
        }
        return items;
    }
    async function renderBlockedUsers(host) {
        var items = await loadBlockedUsers();
        if (!host) return;
        if (!items.length) {
            host.innerHTML = '<p class="skh-cm-empty">' + T('ch_no_blocked', 'Hujamzuia mtu yeyote.') + '</p>';
            return;
        }
        host.innerHTML = items.map(function (it) {
            var dp = (typeof window.skhUserAvatar === 'function') ? window.skhUserAvatar(it.photo || null, it.name, 40) : '';
            return '<div class="ch-blocked-row">' + dp
                + '<div class="ch-cc-info"><span class="ch-cc-name">' + esc(it.name) + '</span><span class="ch-cc-msg">' + T('ch_blocked_label', 'Amezuiwa') + '</span></div>'
                + '<button type="button" class="ch-unblock-btn small" onclick="window.skhChatUnblock(\'' + jsEsc(it.blockedId) + '\', false)">' + T('ch_unblock', 'Unblock') + '</button>'
                + '</div>';
        }).join('');
    }
    window.skhChatOpenBlockedUsers = function () {
        var wrap = document.getElementById('chatBlockedUsersWrap');
        if (!wrap) return;
        var open = (wrap.style.display === 'none' || wrap.style.display === '');
        wrap.style.display = open ? 'block' : 'none';
        if (open) {
            var host = document.getElementById('chatBlockedUsersList');
            if (host) renderBlockedUsers(host);
        }
    };

    window.skhChatReport = async function (convId, msgId) {
        var reason = 'other';
        if (typeof window.customPrompt === 'function') {
            window.customPrompt(T('ch_report_prompt', 'Sababu ya ripoti (scam, harassment, spam, fraud, fake product, n.k.):'), T('ch_report_ph', 'Mfano: spam'), async function (r) {
                if (r) await skh.addDoc(skh.collection(skh.db, 'chatReports'), { reportedBy: myUid(), conversationId: convId || null, messageId: msgId || null, reason: r, createdAt: nowIso(), status: 'open' });
                alert(T('ch_reported_ok', 'Ripoti imepokelewa.'));
            });
            return;
        }
        var v = await skhPrompt(T('ch_report_prompt', 'Sababu ya ripoti:'), 'spam');
        if (v) await skh.addDoc(skh.collection(skh.db, 'chatReports'), { reportedBy: myUid(), conversationId: convId || null, messageId: msgId || null, reason: v, createdAt: nowIso(), status: 'open' });
        alert(T('ch_reported_ok', 'Ripoti imepokelewa.'));
    };

    /* ---------- TYPING ---------- */
    window.skhChatTyping = function () {
        var core = skh.chatCore; if (!core || !core.convId) return;
        var me = myUid();
        clearTimeout(core.typingClear);
        skh.updateDoc(skh.doc(skh.db, 'conversations', core.convId), { typing: { uid: me, at: nowIso() } }).catch(function () {});
        core.typingClear = setTimeout(function () {
            skh.updateDoc(skh.doc(skh.db, 'conversations', core.convId), { typing: null }).catch(function () {});
        }, 3500);
    };

    /* ---------- INBOX (override) ---------- */
    var inboxItems = [];
    var inboxTab = 'all';

    // [CHAT UI v1.0 2026-09] Desktop (>=900px) hutumia two-pane (spec §12):
    // orodha kushoto + eneo la mazungumzo kulia; mobile hutumia ukurasa kamili.
    function isDesktopChat() {
        try { if (window.matchMedia) return !!(window.matchMedia('(min-width: 900px)').matches); } catch (e) {}
        return (typeof window.innerWidth === 'number') && window.innerWidth >= 900;
    }

    // [R22] Group row click → Group Soga (73). Hakuna direct-chat mix tena.
    window.skhChatOpenGroupRow = function (gid) {
        if (!gid) return;
        gid = String(gid).trim().replace(/^conv_group_/, '');
        try { closeModals(); } catch (e) {}
        if (typeof window.skhOpenGroupSoga === 'function') window.skhOpenGroupSoga(gid);
    };
    // [R22] Reload inbox (69/73 wanahitaji baada ya join/leave/create/invite-accept).
    window.skhChatReloadInbox = async function () {
        try { await loadInbox(); } catch (e) {}
        renderInbox();
        // [R24] vialio block/announce: event-driven refresh kama R22 ilivyokusudia
        try { if (window.skhSyncInvitesUI) window.skhSyncInvitesUI(); } catch (eI) {}
    };

    window.skhChatOpenInbox = async function () {
        if (!skh.requireAuth()) return;

        // [FIX 2026-09-20] Usifanye closeModals() hapa — 81-absolute-one-ui-live.js
        // inaweza kuwa imeshafungua inbox na skhAbsoluteShowOnly. Kuita closeModals()
        // hapa kunafunga inbox tena → "Inapakia..." milele. Badala yake, funga
        // modals za ziada TU (sidebar, plus menu) bila kugusa inbox wenyewe.
        try {
            ['sidebarMenuModal','plusMenu','sokohaiAccountSettingModal','productModal','mySokoHaiModal','sellerProfileModal'].forEach(function(id){
                var el=document.getElementById(id); if(el){ el.style.display='none'; el.classList.remove('open'); }
            });
        } catch(e){}

        // Inject spinner animation kama haipo
        if (!document.getElementById('skhSpinStyle')) {
            var spinStyle = document.createElement('style');
            spinStyle.id = 'skhSpinStyle';
            spinStyle.textContent = '@keyframes skhSpin{to{transform:rotate(360deg)}}';
            document.head.appendChild(spinStyle);
        }

        if (isDesktopChat()) {
            skh.chatCore = null;
            skh.currentChatUid = null;
            var cm = document.getElementById('chatModal');
            if (cm) cm.style.display = 'flex';
            var card = cm ? cm.querySelector('.chat-card') : null;
            if (card) card.classList.add('chat-two-pane');
            window.skhChatShowSelectPlaceholder();
            window.skhChatRenderSidePane();
            // Pakia inbox background (non-blocking)
            loadInbox().then(function() {
                window.skhChatRenderSidePane();
            }).catch(function(e) { console.warn('[inbox load]', e); });
            return;
        }

        // [INSTANT INBOX] Hakikisha chatListModal iko wazi
        var cl = document.getElementById('chatListModal');
        if (cl) { cl.style.display = 'flex'; cl.classList.add('open'); }

        var list = document.getElementById('inboxList');
        if (!list) return;

        // Onyesha loading mara moja
        list.innerHTML = '<div style="text-align:center;padding:30px 16px;">'
            + '<div style="display:inline-block;width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#0B4F7A;border-radius:50%;animation:skhSpin 0.8s linear infinite;"></div>'
            + '<p style="color:#64748b;font-size:13px;margin-top:10px;">' + T('ch_loading_inbox', 'Inapakia mazungumzo...') + '</p>'
            + '</div>';

        // Pakia inbox na timeout (sekunde 15) — kama loadInbox inachukua muda mrefu sana
        var loadTimeout = null;
        var loaded = false;
        loadTimeout = setTimeout(function() {
            if (!loaded) {
                loaded = true;
                // Timeout — jaribu kuonyesha chochote kilichopatikana
                if (inboxItems && inboxItems.length > 0) {
                    renderInbox();
                } else {
                    var listEl = document.getElementById('inboxList');
                    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;">'
                        + '<p style="color:#64748b;font-size:13px;">' + T('ch_inbox_slow', 'Mazungumzo yanachukua muda kupakia.') + '</p>'
                        + '<button onclick="window.skhChatOpenInbox()" style="margin-top:10px;padding:8px 16px;background:#0B4F7A;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">' + T('ch_retry', 'Jaribu Tena') + '</button>'
                        + '</div>';
                }
            }
        }, 15000);

        loadInbox().then(function() {
            if (loaded) return; // timeout imeshachukua
            loaded = true;
            clearTimeout(loadTimeout);
            renderInbox();
            try { if (window.skhSyncInvitesUI) window.skhSyncInvitesUI(); } catch (eI) {}
        }).catch(function(e) {
            if (loaded) return;
            loaded = true;
            clearTimeout(loadTimeout);
            console.warn('[inbox load error]', e);
            var listEl = document.getElementById('inboxList');
            if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;">'
                + '<p style="color:#b91c1c;font-size:13px;">' + T('ch_inbox_fail', 'Imeshindwa kupakia mazungumzo.') + '</p>'
                + '<button onclick="window.skhChatOpenInbox()" style="margin-top:10px;padding:8px 16px;background:#0B4F7A;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">' + T('ch_retry', 'Jaribu Tena') + '</button>'
                + '</div>';
        });
    };

    /* [FIX IDENTITY 2026-09-15] Utambulisho ukibadilika (mwanachama
       ameingia kwa msaada wa wakala, au ametoka), KILA kitu cha mtumiaji
       wa awali lazima kifutwe. Vinginevyo mwanachama anaona INBOX YA WAKALA
       — ndicho kilichokuwa kikitokea. */
    function wipeChatStateForIdentity() {
        try {
            inboxItems = [];
            inboxQuery = '';
            inboxTab = 'all';
            skh.chatCore = {};
            skh.negoCurrent = null;
            skh.negoOrder = null;
            skh.activeChatProduct = null;
            skh.activeChatService = null;
            skh.activeChatTransport = null;
            skh.chatRelated = null;
            window.skhChatInboxCache = null;
            // Funga listeners za mtumiaji wa awali
            if (typeof unsubMsgs === 'function') { try { unsubMsgs(); } catch (e) {} }
            var list = document.getElementById('inboxList');
            if (list) list.innerHTML = '';
            var msgs = document.getElementById('chatMessages');
            if (msgs) msgs.innerHTML = '';
        } catch (e) { console.warn('[chat wipe]', e && e.message); }
    }
    window.skhChatWipeState = wipeChatStateForIdentity;

    document.addEventListener('skh:identity-changed', function () {
        wipeChatStateForIdentity();
        // Pakia upya kwa UID MPYA
        setTimeout(function () {
            try {
                if (document.getElementById('chatListModal') &&
                    getComputedStyle(document.getElementById('chatListModal')).display !== 'none') {
                    loadInbox().then(function () { renderInbox(); });
                }
            } catch (e) {}
        }, 300);
    });

    async function loadInbox() {
        var me = myUid();
        if (!me) { console.warn('[inbox] loadInbox: no uid — user not logged in?'); inboxItems = []; return; }
        var items = [];
        try {
            var q = skh.query(skh.collection(skh.db, 'conversations'), skh.where('participants', 'array-contains', me), skh.limit(100));
            var snap = await skh.getDocs(q);
            console.log('[inbox] conversations found:', snap.size || 0);
            if (snap && snap.forEach) snap.forEach(function (d) {
                var c = d.data();
                // [R22 GROUP-ROW FIX] Group conversation NI row ya kikundi (WhatsApp-like
                // one list: humo chats humo groups) — SIYO "other member". Fungua Group Soga.
                if (c && (c.type === 'group' || String(d.id).indexOf('conv_group_') === 0)) {
                    items.push({
                        kind: 'conversation', type: 'group', id: d.id, convId: d.id,
                        gid: c.groupId || String(d.id).replace(/^conv_group_/, ''),
                        otherUid: null, name: c.name || T('grp_kikundi', 'Kikundi'), photo: '',
                        verified: false, role: 'group', type2: c.type,
                        related: c.sharedContext || null, lastMessage: c.lastMessage || null,
                        lastMessageAt: c.lastMessageAt, unread: (c.unread || {})[me] || 0,
                        status: c.status, pinned: !!(c.pinned && c.pinned[me]),
                        memberCount: (c.participants || []).length,
                        goHead: c.goHead || null,   // [FULL-SPEC PHASE 2 §4] active ORDER snippet (69 syncs)
                        avatar: c.avatar || '#',   // [R25] alama ya kikundi (engine SetAvatar inai-sync pia kwenye conv)
                        drafts: c.drafts || null, archived: !!(c.archived && c.archived[me]),
                        hiddenForMe: !!(c.deletedForUser && c.deletedForUser[me]),
                        muted: !!(c.muted && c.muted[me])
                    });
                    return;
                }
                var other = (c.participants || []).filter(function (u) { return u !== me; })[0];
                var meta = (c.participantMeta || {})[other] || { name: 'Mawasiliano', photo: '', verified: false, role: 'user' };
                items.push({
                    kind: 'conversation', id: d.id, convId: d.id, otherUid: other, name: meta.name, photo: meta.photo,
                    verified: meta.verified, role: meta.role, type: c.type || 'direct',
                    related: c.related || null, lastMessage: c.lastMessage || null, lastMessageAt: c.lastMessageAt,
                    unread: (c.unread || {})[me] || 0, status: c.status,
                    pinned: !!(c.pinned && c.pinned[me]),
                    drafts: c.drafts || null,
                    archived: !!(c.archived && c.archived[me]),
                    hiddenForMe: !!(c.deletedForUser && c.deletedForUser[me]),
                    muted: !!(c.muted && c.muted[me])
                });
            });
        } catch (e) { console.warn('[inbox] conversations query failed:', e && e.message); }

        // Legacy `chats` (kwa contacts za zamani zisizo na conversation bado).
        try {
            var q2 = skh.query(skh.collection(skh.db, 'chats'), skh.where('senderUid', '==', me), skh.limit(100));
            var q3 = skh.query(skh.collection(skh.db, 'chats'), skh.where('receiverUid', '==', me), skh.limit(100));
            var snaps = await Promise.all([skh.getDocs(q2), skh.getDocs(q3)]);
            var seen = {};
            items.forEach(function (it) { if (it.otherUid) seen[it.otherUid] = true; });
            snaps.forEach(function (sn) {
                if (sn && sn.forEach) sn.forEach(function (d) {
                    var c = d.data();
                    var other = c.senderUid === me ? c.receiverUid : c.senderUid;
                    if (!other || other === me || seen[other]) return;
                    seen[other] = true;
                    items.push({
                        kind: 'legacy', id: d.id, convId: null, otherUid: other,
                        name: (other === c.receiverUid ? c.receiverName : c.senderName) || 'Mawasiliano',
                        photo: '', verified: false, role: 'user', type: 'direct',
                        related: c.productId ? { productId: c.productId } : null,
                        lastMessage: { text: c.text || '', type: 'text' }, lastMessageAt: c.createdAt, unread: 0, status: 'active',
                        pinned: false, drafts: null, archived: false, muted: false
                    });
                });
            });
        } catch (e) { /* ignore */ }

        // [CHAT FIX 2026-09] Mtu MMOJA = chat MOJA kwenye orodha.
        // Ongea na mwenzako kwenye conversation moja hata kama kuna contexts
        // (direct / product / order) au legacy chats za zamani — tunachukua
        // iliyo bora zaidi (conversation ya hivi karibuni).
        var best = {};
        items.forEach(function (it) {
            // [R22] group rows: key = gid (si otherUid — haina mmoja "mwingine")
            var k = (it.type === 'group') ? ('grp:' + (it.gid || it.convId)) : it.otherUid;
            if (!k) return;
            var cur = best[k];
            if (!cur) { best[k] = it; return; }
            // [PIN 2026-09] Iliyo PINNED inashinda kila wakati — mtumiaji
            // ameichagua kwa makusudi, isipotezwe na dedupe (context mpya n.k.).
            if (!!it.pinned !== !!cur.pinned) { if (it.pinned) best[k] = it; return; }
            var curIsConv = cur.kind === 'conversation';
            var itIsConv = it.kind === 'conversation';
            if (itIsConv && !curIsConv) { best[k] = it; return; }
            if (curIsConv && !itIsConv) return;
            if (String(it.lastMessageAt || '') > String(cur.lastMessageAt || '')) best[k] = it;
        });
        items = Object.keys(best).map(function (k) { return best[k]; });

        // Pinned kwanza, kisha mpya zaidi.
        items.sort(function (a, b) {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            return String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''));
        });
        inboxItems = items;
        console.log('[inbox] loadInbox complete: total items =', items.length);
    }

    // [CHAT UI v1.0 2026-09] Njia ya nafasi ya mawasiliano (transporter/agent/seller).
    function accountRole(it) {
        var r = String((it && it.role) || '').toLowerCase();
        if (r) return r;
        if (it && it.type === 'delivery') return 'transporter';
        if (it && it.type === 'order') return 'seller';
        return 'user';
    }

    function inboxMatches(it) {
        var me = myUid();
        // [LIFECYCLE] Zilizofutwa KWANGU hazionekani popote (upande wa
        // mwenzangu hauguswi).
        if (it.hiddenForMe) return false;
        // [ARCHIVE 2026-09] Kumbukumbu imefichwa kwenye vichujio vya kawaida;
        // inaonekana tu kwenye tab yake ("archive").
        if (inboxTab === 'archive') return !!it.archived;
        if (it.archived) return false;
        if (inboxTab === 'all') return true;
        if (inboxTab === 'unread') return (it.unread || 0) > 0;
        if (inboxTab === 'buyers') return !!(it.related && it.related.sellerId && it.related.sellerId === me);
        if (inboxTab === 'sellers') return !!(it.related && it.related.buyerId && it.related.buyerId === me);
        if (inboxTab === 'transport') return it.type === 'delivery' || (it.related && it.related.deliveryId) || accountRole(it) === 'transporter';
        if (inboxTab === 'agents') return accountRole(it) === 'agent' || it.type === 'agent';
        // (vikokotoo vya zamani bado vinafanya kazi kama vichujio vya hiari)
        if (inboxTab === 'orders') return it.type === 'order' || (it.related && it.related.orderId);
        if (inboxTab === 'delivery') return it.type === 'delivery' || (it.related && it.related.deliveryId);
        if (inboxTab === 'offers') return !!(it.related && it.related.negotiationId);
        return true;
    }

    function accountTypeBadge(it) {
        var r = accountRole(it);
        var label = '';
        if (r === 'seller' || r === 'store' || r === 'merchant') label = '' + (window.skhNavIcon?window.skhNavIcon('shop',14):'') + 'Muuzaji';
        else if (r === 'transporter' || r === 'driver') label = '' + (window.skhNavIcon?window.skhNavIcon('truck',14):'') + 'Msafirishaji';
        else if (r === 'agent') label = '' + (window.skhNavIcon?window.skhNavIcon('handshake',14):'') + 'Wakala';
        else if (r === 'buyer') label = '🛒 Mnunuzi';
        if (!label) return '';
        return '<span class="ch-acct-badge">' + label + '</span>';
    }

    function inboxRowHtml(it, activeUid) {
        // [R22 GROUP-ROW] Kikundi kama row halisi — WhatsApp-like: # tile,
        // jina la kikundi, N wanachama, muhtasari wa ujumbe, time, pin btn.
        // Click → Group Soga (73), SIYO direct chat.
        // [PHASE 1 §5] ORDER GROUP / TRANSACTION WORKSPACE card: #F0FAF6 +
        // ORDER #id + product preview + status (text+dot — si rangi pekee §42).
        // Click-destination HAIJABADILIKA (bado inafungua mazungumzo hayohayo —
        // workspace kamili ni PHASE 8). Fields huchukuliwa tu zilizopo halisi.
        if (it && (it.type === 'order' || (it.related && it.related.orderId))) {
            var oCls = 'ch-contact ch-tint-order' + (it.pinned ? ' ch-pinned' : '') + (it.unread > 0 ? ' ch-unread-row' : '');
            var oTime = it.lastMessageAt ? fmtTime(it.lastMessageAt) : '';
            var oUnb = (it.unread > 0) ? '<span class="ch-unread">' + (it.unread > 99 ? '99+' : it.unread) + '</span>' : '';
            var oId = String(it.related.orderId || it.id || '').replace(/[#\s]/g, '');
            var oProd = (it.related.title || it.related.productName || '') || (it.lastMessage ? truncate(it.lastMessage.text || '', 48) : '');
            var oStRaw = String(it.related.status || '').trim();
            var oSt = oStRaw ? '<span class="ch-ord-status"><i class="dot"></i>' + esc(oStRaw.replace(/_/g, ' ')) + '</span>' : '';
            return '<div class="' + oCls + '" data-uid="' + esc(it.otherUid || '') + '" data-conv="' + esc(it.convId || it.id) + '" onclick="window.skhChatOpen(\'' + jsEsc(it.otherUid || '') + '\')">'
                + '<div class="ch-cc-avatar"><span style="display:inline-flex;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#18A982,#0e7a5f);color:#fff;align-items:center;justify-content:center;">' + (window.skhNavIcon ? window.skhNavIcon('package', 20) : '') + '</span></div>'
                + '<div class="ch-cc-info">'
                + '<span class="ch-cc-name"><span class="ch-ord-kind">ORDER</span> #' + esc(oId.toUpperCase()) + '</span>'
                + '<span class="ch-cc-time">' + esc(oTime) + '</span>'
                + '<div class="ch-cc-sub" title="' + esc(oProd) + '">' + (it.name ? esc(it.name) + (oProd ? ' · ' : '') : '') + esc(oProd) + '</div>'
                + (oSt ? '<div style="margin-top:3px;">' + oSt + '</div>' : '')
                + '</div>'
                + oUnb
                + '</div>';
        }

        if (it && it.type === 'group') {
            var gLast = it.lastMessage ? truncate(it.lastMessage.text || '', 60) : '';
            var gTime = it.lastMessageAt ? fmtTime(it.lastMessageAt) : '';
            // [R26] mention badge: mimi nikita'wa na lastMessage + unread>0 → 🔔 Umetajwa
            var meG = myUid();
            if (gLast && it.unread > 0 && it.lastMessage && Array.isArray(it.lastMessage.mentions) && it.lastMessage.mentions.indexOf(meG) >= 0) {
                gLast = '\uD83D\uDD14 ' + T('grp_mentioned', 'Umetajwa') + ': ' + gLast;
            }
            // [R23] unread badge ya group row (73 huisawazisha; ukiwa unafungua inafutika)
            var gUnr = (it.unread > 0) ? '<span class="ch-unread">' + (it.unread > 99 ? '99+' : it.unread) + '</span>' : '';
            // [FINAL SPEC 3 VISUAL DISTINCTION]
            // Normal Discussion Group = #F1F7FC (ch-tint-group)
            // Group Order = #FFF9E8 with gold accent (ch-tint-group-order has-go)
            // goHead present => this group row is commerce workspace
            var hasActiveGO = !!(it.goHead && (it.goHead.targetQty || it.goHead.status));
            var gCls = 'ch-contact ch-grp-row ' + (hasActiveGO ? 'ch-tint-group-order has-go' : 'ch-tint-group') + (it.pinned ? ' ch-pinned' : '') + (it.unread > 0 ? ' ch-unread-row' : '');  // [§3] #F1F7FC
            var gPin = '';
            if (it.convId) {
                gPin = (inboxTab === 'archive')
                    ? '<button type="button" class="ch-pin-btn" title="' + T('ch_unarchive', 'Rejesha (Unarchive)') + '" onclick="event.stopPropagation();window.skhChatToggleArchive(\'' + jsEsc(it.convId) + '\')">↩</button>'
                    : '<button type="button" class="ch-pin-btn' + (it.pinned ? ' on' : '') + '" title="' + T('ch_pin', 'Bandika juu (Pin)') + '" onclick="event.stopPropagation();window.skhChatTogglePin(\'' + jsEsc(it.convId) + '\')">' + (it.pinned ? '' : (window.skhNavIcon ? window.skhNavIcon('map', 14) : '')) + '</button>';
            }
            return '<div class="' + gCls + '" data-gid="' + esc(it.gid) + '" data-conv="' + esc(it.convId || '') + '" onclick="window.skhChatOpenGroupRow(\'' + jsEsc(it.gid) + '\')">'
                + '<div class="ch-cc-avatar"><span style="display:inline-flex;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#1268A8,#18A982);color:#fff;align-items:center;justify-content:center;font-weight:900;font-size:19px;">' + esc(it.avatar || '#') + '</span></div>'
                + '<div class="ch-cc-info">'
                + '<span class="ch-cc-name">' + esc(it.name || T('grp_kikundi', 'Kikundi')) + '</span>'
                + '<span class="ch-cc-msg">' + (gLast ? esc(gLast) : ('👥 ' + T('grp_tap_open', 'Gusa kufungua kikundi'))) + '</span>'
                + '<span class="ch-cc-meta"><span class="ch-acct-badge">👥 ' + T('grp_kikundi', 'Kikundi') + (it.memberCount ? ' · ' + it.memberCount : '') + '</span></span>'
                + (it.goHead && it.goHead.targetQty
                    ? '<span class="ch-cc-meta"><span style="display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:800;color:#8a6d00;background:#FFF9E8;border:1px solid #ead98a;border-radius:6px;padding:2px 7px;margin-right:4px;">🛍 ORDER ' + esc(it.goHead.totalQty + '/' + it.goHead.targetQty) + ' • ' + esc(String(it.goHead.status || '').replace(/_/g, ' ')) + '</span></span>'
                    : '')   // [§4] commerce-status snippet (details ziko workspace; hapa kiashiria tu)
                + '</div>'
                + '<div class="ch-cc-side">' + (gTime ? '<span class="ch-cc-time">' + esc(gTime) + '</span>' : '') + gUnr + '</div>'
                + gPin
                + '</div>';
        }
        var me = myUid();
        var dp = (typeof window.skhUserAvatar === 'function') ? window.skhUserAvatar(it.photo || null, it.name, 48) : '';
        var verified = it.verified ? '<span class="ch-verified"></span>' : '';
        var timeStr = it.lastMessageAt ? fmtTime(it.lastMessageAt) : '';
        var lastText = it.lastMessage ? truncate(it.lastMessage.text || '', 60) : '';
        var unreadBadge = (it.unread > 0) ? '<span class="ch-unread">' + (it.unread > 99 ? '99+' : it.unread) + '</span>' : '';
        // [CHAT UI v1.0 2026-09] Kiashiria cha biashara kwenye muhtasari (spec §5–§6).
        var ltype = (it.lastMessage && it.lastMessage.type) || 'text';
        // [COMMERCE 2026-09] Aina zote za biashara zinaonekana kwenye muhtasari.
        var isCommerce = ['offer','negotiation','order','delivery','payment','product','service','transport'].indexOf(ltype) !== -1;
        var acct = accountTypeBadge(it);
        // [DRAFT/MUTE 2026-09] Rasimu + alama ya kimya kwenye orodha (spec §12, §28).
        var draftText = (it.drafts && it.drafts[me] && it.drafts[me].text) || '';
        var muteIco = it.muted ? '<span class="ch-mute-ico" title="' + T('ch_muted', 'Imewekwa kimya (Muted)') + '">🔕</span>' : '';
        var draftBadge = draftText ? '<span class="ch-draft-badge">📝 ' + T('ch_draft', 'Rasimu') + '</span>' : '';
        var sideBtn = '';
        if (it.convId) {
            if (inboxTab === 'archive') {
                sideBtn = '<button type="button" class="ch-pin-btn" title="' + T('ch_unarchive', 'Rejesha (Unarchive)') + '" onclick="event.stopPropagation();window.skhChatToggleArchive(\'' + jsEsc(it.convId) + '\')">↩</button>';
            } else {
                sideBtn = '<button type="button" class="ch-pin-btn' + (it.pinned ? ' on' : '') + '" title="' + T('ch_pin', 'Bandika juu (Pin)') + '" onclick="event.stopPropagation();window.skhChatTogglePin(\'' + jsEsc(it.convId) + '\')">' + (it.pinned ? '' + (window.skhNavIcon?window.skhNavIcon('tag',14):'') + '' : '' + (window.skhNavIcon?window.skhNavIcon('map',14):'') + '') + '</button>';
            }
        }
        var cls = 'ch-contact' + (it.pinned ? ' ch-pinned' : '') + (it.unread > 0 ? ' ch-unread-row' : '') + (activeUid && activeUid === it.otherUid ? ' active' : '');
        return '<div class="' + cls + '" onclick="window.skhChatOpen(\'' + jsEsc(it.otherUid) + '\', \'' + jsEsc(it.name) + '\', {})">'
            + '<div class="ch-cc-avatar">' + dp + (it.unread > 0 ? '<i class="ch-dot"></i>' : '') + '</div>'
            + '<div class="ch-cc-info">'
            + '<span class="ch-cc-name">' + esc(it.name) + ' ' + verified + muteIco + '</span>'
            + '<span class="ch-cc-msg' + (isCommerce ? ' commerce' : '') + '">' + (draftText ? ('📝 ' + esc(truncate(draftText, 50))) : (lastText ? esc(lastText) : '👋 Anza mazungumzo')) + '</span>'
            + '<span class="ch-cc-meta">' + acct + draftBadge + '</span>'
            + '</div>'
            + '<div class="ch-cc-side">' + (timeStr ? '<span class="ch-cc-time">' + esc(timeStr) + '</span>' : '') + unreadBadge + '</div>'
            + sideBtn
            + '</div>';
    }

    // [CHAT UI v1.0 2026-09] Paneli ya pembeni (desktop two-pane, spec §12):
    // orodha ya mazungumzo (na utafutaji + vichujio) upande wa kushoto.
    window.skhChatRenderSidePane = async function () {
        var pane = document.getElementById('chatSidePane');
        if (!pane) return;
        if (!inboxItems.length) { await loadInbox(); }
        var core = skh.chatCore || {};
        pane.innerHTML = '<div class="ch-side-head">' + (window.skhNavIcon?window.skhNavIcon('chat',14):'') + '' + T('ch_chats', 'Chats') + '</div>'
            + '<div class="ch-side-search"><span>' + (window.skhNavIcon?window.skhNavIcon('search',14):'') + '</span><input type="text" id="sideSearchInput" placeholder="' + T('ch_search_ph', 'Tafuta...') + '" value="' + esc(inboxQuery) + '" oninput="window.skhChatInboxSearch(this.value)"></div>'
            + '<div class="ch-inbox-chips side">' + inboxChipsHtml() + '</div>'
            + '<div class="ch-side-list">' + inboxBodyHtml(core.partnerUid) + '</div>';
    };

    // [CHAT UI v1.0 2026-09] Hali ya "hakuna uteuzi" (spec §12).
    window.skhChatShowSelectPlaceholder = function () {
        var host = document.getElementById('chatMessages');
        if (host) host.innerHTML = '<div class="ch-select-empty">'
            + '<div class="ch-select-ico">' + (window.skhNavIcon?window.skhNavIcon('chat',14):'') + '</div>'
            + '<b>' + T('ch_select_conv', 'Chagua mazungumzo kuanza kupiga soga') + '</b>'
            + '<span>' + T('ch_select_conv_sub', 'Orodha ya mazungumzo yako iko kushoto.') + '</span>'
            + '</div>';
    };

    // Rudi kwenye orodha ya mazungumzo (mobile back button).
    window.skhChatBackToList = function () {
        var cm = document.getElementById('chatModal');
        if (isDesktopChat()) {
            // Desktop: acha kadi ya mazungumzo, onyesha tu hali ya uteuzi.
            skh.chatCore = null;
            skh.currentChatUid = null;
            window.skhChatShowSelectPlaceholder();
            window.skhChatRenderSidePane();
            return;
        }
        if (cm) cm.style.display = 'none';
        // [NAV §23] Mtumiaji amerudi orodhani kwa makusudi — restore ya
        // modal ya mmelezi isipepeke baadaye (flag isafishwe sasa).
        try { if (skh.chatCore) skh.chatCore.reopenOnCloseId = null; } catch (eRC) {}
        window.skhChatOpenInbox();
    };

    // [CHAT UI v1.0 2026-09] Vichujio (chips) — All/Unread/Buyers/Sellers/Transport/Agents.
    function inboxChipsHtml() {
        var tabs = [
            ['all', 'All'], ['unread', 'Unread'], ['buyers', 'Wanunuzi'], ['sellers', 'Wauzaji'],
            ['transport', 'Wasafirishaji'], ['agents', 'Mawakala'], ['archive', 'Kumbukumbu']
        ];
        return tabs.map(function (t) {
            return '<button type="button" class="ch-tab' + (inboxTab === t[0] ? ' active' : '') + '" onclick="window.skhChatInboxTab(\'' + t[0] + '\')">' + t[1] + '</button>';
        }).join('');
    }

    // Hali tupu ya BRAND (spec §8–§9): eneo LOTE la chat linakuwa onyesho la SokoHai.
    function inboxBrandedEmptyHtml() {
        return '<div class="ch-inbox-onboard">'
            + '<i class="ch-ob-blob b1"></i><i class="ch-ob-blob b2"></i><i class="ch-ob-blob b3"></i>'
            + '<div class="ch-ob-card">'
            + '<div class="ch-ob-mark">'
            + '<svg viewBox="0 0 64 64" width="76" height="76" role="img" aria-label="SokoHai Chat">'
            + '<defs><linearGradient id="chobg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B82BD"/><stop offset="1" stop-color="#0B4F7A"/></linearGradient></defs>'
            + '<rect x="4" y="4" width="56" height="56" rx="18" fill="url(#chobg)"/>'
            + '<circle cx="46" cy="17" r="3.4" fill="#d4af37"/>'
            + '<path d="M32 15c-8 0-14.5 5.6-14.5 12.5 0 3.8 2 7.2 5.2 9.5-.2 1.8-.9 3.4-1.9 4.9 2.4-.6 4.6-1.6 6.4-2.9 1.5.4 3.1.6 4.8.6 8 0 14.5-5.6 14.5-12.5S40 15 32 15z" fill="#ffffff"/>'
            + '<path d="M24.5 27.5h15M24.5 32h9.5" stroke="#1268A8" stroke-width="2.4" stroke-linecap="round"/>'
            + '<path d="M43.5 40.5c2.9 0 5.2-2.1 5.2-4.7s-2.3-4.7-5.2-4.7-5.2 2.1-5.2 4.7 2.3 4.7 5.2 4.7z" fill="#18A982"/>'
            + '<path d="M43.5 45.2V48" stroke="#18A982" stroke-width="2.2" stroke-linecap="round"/>'
            + '</svg>'
            + '</div>'
            + '<h2>' + T('ch_welcome_title', 'Karibu SokoHai Chat') + '</h2>'
            + '<p>' + T('ch_welcome_sub', 'Anza mazungumzo na wauzaji, wanunuzi, mawakala au wasafirishaji.') + '</p>'
            + '<button type="button" class="ch-ob-cta" onclick="window.skhChatStartEmpty()">' + (window.skhNavIcon?window.skhNavIcon('chat',14):'') + '' + T('ch_start_chat', 'Anza Chat') + '</button>'
            + '</div></div>';
    }

    // Hali ya utafutaji bila matokeo (spec §10) — tofauti na hali tupu ya brand.
    function inboxSearchEmptyHtml() {
        return '<div class="ch-inbox-search-empty">'
            + '<div class="ch-se-ico">' + (window.skhNavIcon?window.skhNavIcon('search',14):'') + '</div>'
            + '<b>' + T('ch_no_chat_found', 'Hakuna chat iliyopatikana') + '</b>'
            + '<span>' + T('ch_try_other', 'Jaribu jina au neno jingine.') + '</span>'
            + '</div>';
    }

    // Mwili wa orodha (PINNED + RECENT) au hali tupu.
    function inboxBodyHtml(activeUid) {
        var rows = inboxItems.filter(inboxMatches).filter(filterInbox);
        rows = rows.slice().sort(function (a, b) {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            return String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''));
        });
        var hasAny = inboxItems.length > 0;
        if (!hasAny) return inboxBrandedEmptyHtml();
        if (!rows.length) return inboxSearchEmptyHtml();
        var pinned = rows.filter(function (r) { return r.pinned; });
        var recent = rows.filter(function (r) { return !r.pinned; });
        var html = '';
        if (pinned.length) html += '<div class="ch-inbox-sec">' + (window.skhNavIcon?window.skhNavIcon('tag',14):'') + '' + T('ch_pinned_sec', 'Iliyobandikwa') + '</div>' + pinned.map(function (it) { return inboxRowHtml(it, activeUid); }).join('');
        if (recent.length) {
            if (pinned.length) html += '<div class="ch-inbox-sec">' + T('ch_recent_sec', 'Hivi Karibuni') + '</div>';
            html += recent.map(function (it) { return inboxRowHtml(it, activeUid); }).join('');
        }
        return html;
    }

    function renderInbox() {
        var list = document.getElementById('inboxList');
        var chipsHost = document.getElementById('inboxChips');
        var clearBtn = document.getElementById('inboxSearchClear');
        if (chipsHost) chipsHost.innerHTML = inboxChipsHtml();
        if (clearBtn) clearBtn.style.display = inboxQuery ? 'flex' : 'none';
        if (list) list.innerHTML = inboxBodyHtml(null);
        if (typeof window.skhChatRenderSidePane === 'function') window.skhChatRenderSidePane();
    }

    // [CHAT UI v1.0 2026-09] "Anza Chat" kwenye hali tupu → nenda sokoni kutafuta muuzaji.
    window.skhChatStartEmpty = function () {
        closeModals();
        var tab = document.getElementById('navTabMarket') || document.getElementById('navTabHome');
        if (tab && typeof window.updateApp === 'function') window.updateApp('market', tab);
    };

    window.skhChatClearInboxSearch = function () {
        inboxQuery = '';
        var i = document.getElementById('inboxSearchInput');
        if (i) i.value = '';
        renderInbox();
    };

    window.skhChatInboxTab = function (tab) {
        inboxTab = tab;
        renderInbox();
    };

    // [PIN 2026-09] Bandika/unbandika mazungumzo ili kupatikana kwa haraka.
    // Hifadhiwa kwenye doc ya conversation (pinned: {uid: true}) — per-user.
    window.skhChatTogglePin = async function (convId) {
        if (!convId || !skh.currentUser) return;
        var me = skh.currentUser.uid;
        try {
            var ref = skh.doc(skh.db, 'conversations', convId);
            var s = await skh.getDoc(ref);
            if (!s || !s.exists || !s.exists()) return;
            var data = s.data() || {};
            var pinned = Object.assign({}, data.pinned || {});
            if (pinned[me]) delete pinned[me]; else pinned[me] = true;
            await skh.updateDoc(ref, { pinned: pinned });
            await loadInbox();
            renderInbox();
        } catch (e) { console.warn('[chat-pin]', e && e.message); }
    };

    // [ARCHIVE 2026-09] Kumbukumbu (spec §13): conversation inafichwa kwenye
    // orodha bila kufutwa. Tab "Kumbukumbu" inairudisha.
    /* [LIFECYCLE] FUTA CHAT KWANGU (participant-specific).
       Mazungumzo yenye order/payment/transport/negotiation ni rekodi ya
       biashara — hayafutwi, yanapendekezwa kuwekwa Kumbukumbu. */
    function convHasCommerce(d) {
        if (!d) return false;
        if (d.orderId || d.negotiationId || d.transportId || d.serviceOrderId
            || d.escrowId || d.sokopayCode || d.disputeId) return true;
        var c = d.relatedContext || d.related || {};
        return !!(c.orderId || c.negotiationId || c.transportId || c.serviceId);
    }

    window.skhChatDeleteForMe = async function (convId) {
        if (!convId || !skh.currentUser) return;
        var me = skh.currentUser.uid;
        try {
            var ref = skh.doc(skh.db, 'conversations', convId);
            var s = await skh.getDoc(ref);
            if (!s || !s.exists || !s.exists()) return;
            var data = s.data() || {};
            if (convHasCommerce(data)) {
                var go = await skhConfirm('Mazungumzo haya yanahusiana na oda au malipo, hivyo ni rekodi ya biashara.\n\nUnaweza kuyaweka kwenye Kumbukumbu badala yake.',
                    { title: 'Rekodi ya biashara', okText: 'Weka kwenye Kumbukumbu', cancelText: 'Ghairi' });
                if (go) await window.skhChatToggleArchive(convId);
                return;
            }
            var ok = await skhConfirm('Yataondoka kwenye orodha yako. Upande wa mwenzako hautaguswa.',
                { title: 'Futa kwangu?', okText: 'Futa', cancelText: 'Ghairi' });
            if (!ok) return;
            var hidden = Object.assign({}, data.deletedForUser || {});
            hidden[me] = true;
            await skh.updateDoc(ref, { deletedForUser: hidden, deletedAt: nowIso() });
            try { window.skhLifecycle && window.skhLifecycle.writeAudit('conversations', convId, 'soft_delete', {}); } catch (e) {}
            skhToast('Yameondolewa kwenye orodha yako.', 'success');
            if ((skh.chatCore || {}).convId === convId && typeof window.skhChatBackToList === 'function') window.skhChatBackToList();
            await loadInbox(); renderInbox();
        } catch (e) { console.warn('[chat-delete-me]', e && e.message); }
    };

    window.skhChatToggleArchive = async function (convId) {
        if (!convId || !skh.currentUser) return;
        var me = skh.currentUser.uid;
        try {
            var ref = skh.doc(skh.db, 'conversations', convId);
            var s = await skh.getDoc(ref);
            if (!s || !s.exists || !s.exists()) return;
            var data = s.data() || {};
            var archived = Object.assign({}, data.archived || {});
            var wasArchived = !!archived[me];
            if (archived[me]) delete archived[me]; else archived[me] = true;
            await skh.updateDoc(ref, { archived: archived });
            refreshChatFlags(convId);
            await loadInbox();
            renderInbox();
            if (typeof window.skhChatRenderSidePane === 'function') window.skhChatRenderSidePane();
            // Ikiwa tunaweka kumbukumbu kwenye mazungumzo yaliyofunguliwa,
            // rudi kwenye orodha (mobile) au hali ya uteuzi (desktop).
            if (!wasArchived && ((skh.chatCore || {}).convId === convId)) {
                if (typeof window.skhChatBackToList === 'function') window.skhChatBackToList();
            }
        } catch (e) { console.warn('[chat-archive]', e && e.message); }
    };

    // [MUTE 2026-09] Kimya (spec §28): arifa za conversation hii hazitumwi.
    window.skhChatToggleMute = async function (convId) {
        if (!convId || !skh.currentUser) return;
        var me = skh.currentUser.uid;
        try {
            var ref = skh.doc(skh.db, 'conversations', convId);
            var s = await skh.getDoc(ref);
            if (!s || !s.exists || !s.exists()) return;
            var data = s.data() || {};
            var muted = Object.assign({}, data.muted || {});
            if (muted[me]) delete muted[me]; else muted[me] = true;
            await skh.updateDoc(ref, { muted: muted });
            refreshChatFlags(convId);
            await loadInbox();
            renderInbox();
            if (typeof window.skhChatRenderSidePane === 'function') window.skhChatRenderSidePane();
        } catch (e) { console.warn('[chat-mute]', e && e.message); }
    };

    // [ARCHIVE/MUTE 2026-09] Menyu ya header ilingane na hali halisi.
    function refreshChatFlags(convId) { refreshChatFlagsMenu(convId); }

    // [DRAFT 2026-09] Rasimu (spec §12): huhifadhiwa per-conversation per-user.
    var draftTimer = null;
    window.skhChatSaveDraft = function (text) {
        var core = skh.chatCore || {};
        var me = myUid();
        if (!core.convId || !me) return;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(function () {
            var t = String(text == null ? '' : text);
            try {
                var ref = skh.doc(skh.db, 'conversations', core.convId);
                skh.getDoc(ref).then(function (s) {
                    var d = (s && s.exists && s.exists()) ? s.data() : {};
                    var drafts = Object.assign({}, d.drafts || {});
                    if (t) drafts[me] = { text: t.slice(0, 2000), updatedAt: nowIso() };
                    else delete drafts[me];
                    skh.updateDoc(ref, { drafts: drafts }).catch(function () {});
                }).catch(function () {});
            } catch (e) { /* ignore */ }
        }, 600);
    };

    // [REACTIONS 2026-09] Kipande cha reactions kwenye bubble (spec §4).
    function renderReactions(msg, me) {
        var r = msg.reactions || {};
        var emojis = Object.keys(r);
        if (!emojis.length) return '';
        var html = '';
        emojis.forEach(function (emoji) {
            var uids = r[emoji] || [];
            var mine = uids.indexOf(me) !== -1;
            html += '<button type="button" class="ch-react-chip' + (mine ? ' on' : '') + '" onclick="event.stopPropagation();window.skhChatReactEmoji(\'' + esc(msg.id) + '\', \'' + esc(emoji) + '\')">' + emoji + '<span>' + uids.length + '</span></button>';
        });
        return '<div class="ch-reactions">' + html + '</div>';
    }

    // [REACTIONS 2026-09] Ongeza/ondoa emoji YAKO (map ya reactions kwenye msg).
    window.skhChatReactEmoji = async function (msgId, emoji) {
        if (!emoji) return;
        var m = await getMsg(msgId);
        if (!m) return;
        var me = myUid();
        var convId = (skh.chatCore || {}).convId;
        if (!convId) return;
        var reactions = Object.assign({}, m.reactions || {});
        var list = (reactions[emoji] || []).slice();
        var i = list.indexOf(me);
        if (i === -1) list.push(me); else list.splice(i, 1);
        if (list.length) reactions[emoji] = list; else delete reactions[emoji];
        try {
            await skh.updateDoc(skh.doc(skh.db, 'conversations/' + convId + '/messages', msgId), { reactions: reactions });
            var core = skh.chatCore;
            if (core) { (core.msgs || []).forEach(function (x) { if (x.id === msgId) x.reactions = reactions; }); }
            if (typeof window.skhChatRenderStream === 'function') window.skhChatRenderStream();
        } catch (e) { alert('Imeshindwa: ' + (e && e.message)); }
        window.skhChatReactClose();
    };

    /* ---------- OVERRIDES (additive; legacy bado ipo) ---------- */
    if (typeof window.sendMessage === 'function') window._skhLegacySendMessage = window.sendMessage;
    if (typeof window.openChatList === 'function') window._skhLegacyOpenChatList = window.openChatList;

    window.sendMessage = async function () {
        var input = document.getElementById('chatInput');
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;
        var core = skh.chatCore || {};
        if (!core.convId || !core.partnerUid) {
            if (typeof window._skhLegacySendMessage === 'function') return window._skhLegacySendMessage();
            return;
        }
        var res = await sendInternal(text, { conversationId: core.convId, partnerUid: core.partnerUid, replyToId: (core.replyTo && core.replyTo.id) || null });
        if (res.ok) {
            input.value = '';
            core.replyTo = null;
            renderReplyChip();
        } else if (res.error === 'blocked') {
            alert(T('ch_blocked', 'Huwezi kutumia ujumbe — umefungiwa au umemfunga mtu huyu.'));
        } else if (res.error === 'no_partner' && typeof window._skhLegacySendMessage === 'function') {
            window._skhLegacySendMessage();
        }
    };

    window.openChatList = function () { window.skhChatOpenInbox(); };

    window.openChatWithUser = function (uid, displayName) {
        if (!skh.requireAuth()) return;
        if (!uid) { alert(T('ch_unknown_person', 'Hatujui mtu huyu bado.')); return; }
        skh.currentChatUid = uid;
        skh.chatPartner = displayName || '';
        // [CTX-LEAK FIX] Futa TELE zote za context — DM safi haina tangazo.
        skh.activeChatProduct = null;
        skh.activeChatService = null;
        skh.activeChatTransport = null;
        window.skhChatOpen(uid, displayName || '', {});
    };

    window.resumeChat = function (uid, email, name) {
        skh.currentChatUid = uid || '';
        skh.currentChatEmail = email || '';
        skh.chatPartner = name || 'Mawasiliano';
        // [CTX-LEAK FIX] Futa TELE zote za context — resume safi haina tangazo.
        skh.activeChatProduct = null;
        skh.activeChatService = null;
        skh.activeChatTransport = null;
        if (typeof window.skhRenderAttachedProduct === 'function') window.skhRenderAttachedProduct();
        window.skhChatOpen(uid || '', name || '', { email: email || '' });
    };

    window.startChat = function () {
        if (!skh.requireAuth() || !skh.currentOpenProduct) return;
        var p = skh.currentOpenProduct;
        if (!p.userId) { alert(T('pr_no_email', 'Muuzaji huyu bado hana taarifa za mawasiliano.')); return; }
        if (p.userId === myUid()) { alert(T('pr_chat_self', 'Huwezi kujitumia meseji kwenye tangazo lako mwenyewe.')); return; }
        skh.currentChatUid = p.userId;
        skh.currentChatEmail = p.userEmail || '';
        skh.chatPartner = p.ownerName || (p.userEmail ? p.userEmail.split('@')[0] : 'Muuzaji');
        // [COMMERCE 2026-09] Weka muktadha UNAOFUATA aina ya tangazo —
        // tangazo la dereva si bidhaa, nalo huduma si bidhaa.
        var pCol = p.collectionName || p.itemCollection || skh.currentFeedCollection || 'products';
        skh.activeChatProduct = null;
        skh.activeChatService = null;
        skh.activeChatTransport = null;
        var greetRef = 'tangazo hili';
        if (pCol === 'drivers') {
            skh.activeChatTransport = Object.assign({}, p, { collectionName: 'drivers' });
            greetRef = 'tangazo lenu la usafiri';
        } else if (pCol === 'services') {
            skh.activeChatService = Object.assign({}, p, { collectionName: 'services' });
            greetRef = 'huduma yenu';
        } else {
            skh.activeChatProduct = p;
            greetRef = 'bidhaa hii';
        }
        var input = document.getElementById('chatInput');
        if (input) input.value = 'Habari, nimevutiwa na ' + greetRef + ': ' + (p.title || '');
        window.skhChatOpen(p.userId, skh.chatPartner, { ctx: 'p_' + p.id, type: 'direct', email: p.userEmail || '' });
    };

    /* ---------- Kadi za kushiriki (share) — Phase 4 ---------- */
    window.skhChatShareProduct = async function (product) {
        if (!product || !product.id) return;
        var partner = (skh.chatCore || {}).partnerUid || skh.currentChatUid;
        if (!partner) { alert(T('ch_open_first', 'Fungua chat kwanza.')); return; }
        var snap = {
            title: product.title || product.itemTitle || 'Bidhaa',
            price: product.price != null ? product.price : null,
            image: product.image || (product.images && product.images[0]) || product.photo || '',
            sellerId: product.userId || null,
            sellerName: product.ownerName || ''
        };
        await sendInternal('', {
            conversationId: (skh.chatCore || {}).convId, partnerUid: partner, type: 'product',
            product: { ref: { id: product.id, collection: product.collectionName || skh.currentFeedCollection || 'products' }, snapshot: snap }
        });
    };

    // [COMMERCE 2026-09] Shirikisha HUDUMA kwenye chat (spec §6, §14).
    window.skhChatShareService = async function (service) {
        if (!service || !service.id) return;
        var partner = (skh.chatCore || {}).partnerUid || skh.currentChatUid;
        if (!partner) { alert(T('ch_open_first', 'Fungua chat kwanza.')); return; }
        var snap = {
            title: service.title || service.serviceName || service.itemTitle || 'Huduma',
            price: service.price != null ? service.price : null,
            image: service.image || (service.images && service.images[0]) || service.photo || '',
            scope: service.scope || service.description || '',
            sellerId: service.userId || service.providerId || null,
            sellerName: service.ownerName || ''
        };
        await sendInternal('', {
            conversationId: (skh.chatCore || {}).convId, partnerUid: partner, type: 'service',
            service: { ref: { id: service.id, collection: service.collectionName || 'services' }, snapshot: snap }
        });
    };

    // [COMMERCE 2026-09] Shirikisha USAFIRI (ride request) kwenye chat (spec §10).
    window.skhChatShareTransport = async function (transport) {
        if (!transport || !transport.id) return;
        var partner = (skh.chatCore || {}).partnerUid || skh.currentChatUid;
        if (!partner) { alert(T('ch_open_first', 'Fungua chat kwanza.')); return; }
        var snap = {
            title: transport.title || transport.cargoName || 'Usafiri',
            price: transport.price != null ? transport.price : (transport.fare != null ? transport.fare : null),
            route: transport.route || { from: transport.fromLocation || '', to: transport.toLocation || '' },
            fromLocation: transport.fromLocation || '',
            toLocation: transport.toLocation || '',
            packageDescription: transport.packageDescription || transport.cargoName || '',
            providerId: transport.providerId || transport.driverId || null,
            providerName: transport.driverName || ''
        };
        await sendInternal('', {
            conversationId: (skh.chatCore || {}).convId, partnerUid: partner, type: 'transport',
            transport: { ref: { id: transport.id, collection: 'ride_requests' }, snapshot: snap }
        });
    };

    window.skhChatShareOrder = async function (orderId) {
        if (!orderId) return;
        var partner = (skh.chatCore || {}).partnerUid || skh.currentChatUid;
        if (!partner) { alert(T('ch_open_first', 'Fungua chat kwanza.')); return; }
        var snap = {};
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'orders', orderId));
            if (s && s.exists && s.exists()) {
                var o = s.data();
                snap = { orderId: o.orderId || orderId, itemsSummary: o.itemsSummary || o.productTitle || '', paymentStatus: o.paymentStatus, deliveryStatus: o.deliveryStatus || o.status };
            } else snap = { orderId: orderId };
        } catch (e) { snap = { orderId: orderId }; }
        await sendInternal('', { conversationId: (skh.chatCore || {}).convId, partnerUid: partner, type: 'order', order: { orderId: orderId, snapshot: snap } });
    };

    window.skhChatShareDelivery = async function (deliveryId) {
        if (!deliveryId) return;
        var partner = (skh.chatCore || {}).partnerUid || skh.currentChatUid;
        if (!partner) { alert(T('ch_open_first', 'Fungua chat kwanza.')); return; }
        var snap = {};
        try {
            var s = await skh.getDoc(skh.doc(skh.db, 'ride_requests', deliveryId));
            if (s && s.exists && s.exists()) {
                var r = s.data();
                snap = { cargoName: r.cargoName || '', status: r.status, currentCustodianName: r.currentCustodianName || r.driverName || '', toLocation: r.toLocation || '' };
            } else snap = { cargoName: '' };
        } catch (e) { snap = { cargoName: '' }; }
        await sendInternal('', { conversationId: (skh.chatCore || {}).convId, partnerUid: partner, type: 'delivery', delivery: { deliveryId: deliveryId, snapshot: snap } });
    };

    /* ============================================================
       [CHAT UI v1.0 2026-09] Menyu ya + (composer) + menyu ya ujumbe.
       Spec §15 (composer) na §16 (message actions). Hakuna ukuta wa vitufe:
       chaguzi zinaonekana tu baada ya kubonyeza + au long-press/right-click.
       ============================================================ */
    window.skhChatTogglePlusMenu = function (ev) {
        if (ev) ev.stopPropagation();
        var m = document.getElementById('chPlusMenu');
        if (!m) return;
        var open = m.style.display === 'flex';
        document.removeEventListener('click', window._skhPlusClose);
        m.style.display = open ? 'none' : 'flex';
        if (!open) {
            window._skhPlusClose = function () { m.style.display = 'none'; document.removeEventListener('click', window._skhPlusClose); };
            setTimeout(function () { document.addEventListener('click', window._skhPlusClose); }, 0);
        }
    };

    // Camera / Gallery / Document → dirisha la faili (native picker).
    window.skhChatPickMedia = function (kind) {
        var inp = document.getElementById('chatFileInput');
        if (!inp) return;
        try { inp.removeAttribute('capture'); } catch (e) {}
        if (kind === 'camera') { inp.setAttribute('capture', 'environment'); inp.setAttribute('accept', 'image/*,video/*'); }
        else if (kind === 'gallery') { inp.setAttribute('accept', 'image/*,video/*'); }
        else if (kind === 'document') { inp.setAttribute('accept', '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*'); }
        window.skhChatTogglePlusMenu();
        inp.click();
    };

    // Location → geolocation (au andika jina la mahali).
    window.skhChatAttachLocation = async function () {
        window.skhChatTogglePlusMenu();
        var core = skh.chatCore || {};
        if (!core.convId || !core.partnerUid) { alert(T('ch_open_first', 'Fungua chat kwanza.')); return; }
        var sendLoc = function (loc) {
            sendInternal('', { conversationId: core.convId, partnerUid: core.partnerUid, type: 'location', location: loc });
        };
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (pos) {
                sendLoc({ name: T('ch_my_location', 'Mahali pangu'), lat: pos.coords.latitude, lng: pos.coords.longitude });
            }, async function () {
                var v = await skhPrompt(T('ch_loc_name', 'Andika jina la mahali (mf. Kariakoo):'), '');
                if (v) sendLoc({ name: v.trim() });
            }, { timeout: 8000 });
        } else {
            var v2 = await skhPrompt(T('ch_loc_name', 'Andika jina la mahali (mf. Kariakoo):'), '');
            if (v2) sendLoc({ name: v2.trim() });
        }
    };

    // Product → orodha ya bidhaa zako (muuzaji) kushiriki kwenye chat.
    window.skhChatAttachProduct = async function () {
        window.skhChatTogglePlusMenu();
        var host = document.getElementById('chatAttachProductList');
        var modal = document.getElementById('chatAttachProductModal');
        if (!host || !modal) { alert(T('ch_open_first', 'Fungua chat kwanza.')); return; }
        modal.style.display = 'flex';
        host.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:16px;">' + T('ch_loading', 'Inapakia...') + '</p>';
        var me = myUid();
        var rows = [];
        try {
            var q = skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', me), skh.limit(30));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) { var it = d.data(); rows.push({ id: d.id, title: it.title || it.itemTitle || 'Bidhaa', price: it.price, image: it.image || (it.images && it.images[0]) || '' }); });
        } catch (e) { /* ignore */ }
        if (!rows.length) {
            host.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:16px;">' + T('ch_no_products', 'Huna bidhaa bado. Ongeza bidhaa kwenye duka lako.') + '</p>';
            return;
        }
        host.innerHTML = rows.map(function (it) {
            var img = it.image ? '<img src="' + esc(it.image) + '" alt="">' : '<span class="ch-attach-ph">' + (window.skhNavIcon?window.skhNavIcon('cart',14):'') + '️</span>';
            var price = it.price != null ? '<b>TSh ' + Number(it.price).toLocaleString() + '</b>' : '';
            return '<button type="button" class="ch-attach-row" onclick="window.skhChatShareProduct({id:\'' + jsEsc(it.id) + '\',title:\'' + jsEsc(it.title) + '\',price:' + (it.price == null ? 'null' : JSON.stringify(it.price)) + ',image:\'' + jsEsc(it.image) + '\'});document.getElementById(\'chatAttachProductModal\').style.display=\'none\';">'
                + img + '<span class="ch-attach-t"><b>' + esc(it.title) + '</b>' + price + '</span><span class="ch-attach-send"></span></button>';
        }).join('');
    };

    // Order → orodha ya oda zako (mnunuzi) kushiriki kwenye chat.
    window.skhChatAttachOrder = async function () {
        window.skhChatTogglePlusMenu();
        var host = document.getElementById('chatAttachOrderList');
        var modal = document.getElementById('chatAttachOrderModal');
        if (!host || !modal) { alert(T('ch_open_first', 'Fungua chat kwanza.')); return; }
        modal.style.display = 'flex';
        host.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:16px;">' + T('ch_loading', 'Inapakia...') + '</p>';
        var me = myUid();
        var rows = [];
        try {
            var q = skh.query(skh.collection(skh.db, 'orders'), skh.where('buyerId', '==', me), skh.limit(30));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) { var it = d.data(); rows.push({ id: d.id, orderId: it.orderId || d.id, summary: it.itemsSummary || it.productTitle || '', pay: it.paymentStatus || 'pending', del: it.deliveryStatus || it.status || '' }); });
        } catch (e) { /* ignore */ }
        if (!rows.length) {
            host.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:16px;">' + T('ch_no_orders', 'Huna oda bado za kushiriki.') + '</p>';
            return;
        }
        host.innerHTML = rows.map(function (it) {
            var pay = it.pay === 'paid' ? '🟢 Imelipwa' : '🟡 Malipo yanasubiri';
            return '<button type="button" class="ch-attach-row" onclick="window.skhChatShareOrder(\'' + jsEsc(it.id) + '\');document.getElementById(\'chatAttachOrderModal\').style.display=\'none\';">'
                + '<span class="ch-attach-ph">' + (window.skhNavIcon?window.skhNavIcon('package',14):'') + '</span>'
                + '<span class="ch-attach-t"><b>Oda #' + esc(String(it.orderId || '')) + '</b><span>' + esc(it.summary || '') + ' · ' + pay + '</span></span>'
                + '<span class="ch-attach-send"></span></button>';
        }).join('');
    };

    // ---------- Menyu ya ujumbe (long-press / right-click / ⋯) ----------
    window.skhChatMsgMenuClose = function () {
        var m = document.getElementById('chMsgMenu');
        if (m) m.style.display = 'none';
    };

    window.skhChatMsgMenu = async function (msgId, ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        window.skhChatMsgMenuClose();
        var msg = await getMsg(msgId);
        if (!msg) return;
        var isMe = msg.senderId === myUid();
        var deleted = !!msg.deletedAt;
        var core = skh.chatCore || {};
        var menu = document.getElementById('chMsgMenu');
        if (!menu) return;
        var html = '';
        function item(icon, label, fn) { return '<button type="button" onclick="' + fn + '">' + icon + ' ' + label + '</button>'; }
        if (!deleted) {
            html += item('↩', T('ch_reply', 'Jibu'), "window.skhChatMsgMenuClose();window.skhChatReply('" + esc(msgId) + "')");
            html += item('😀', T('ch_react', 'React'), "window.skhChatMsgMenuClose();window.skhChatReact('" + esc(msgId) + "')");
            html += item('⧉', T('ch_copy', 'Nakili'), "window.skhChatMsgMenuClose();window.skhChatCopy('" + esc(msgId) + "')");
            html += item('', T('ch_forward', 'Sambaza'), "window.skhChatMsgMenuClose();window.skhChatForward('" + esc(msgId) + "')");
            html += item('🔖', T('ch_save', 'Hifadhi'), "window.skhChatMsgMenuClose();window.skhChatSave('" + esc(msgId) + "')");
        }
        if (isMe && !deleted) {
            html += item('✏️', T('ch_edit', 'Hariri'), "window.skhChatMsgMenuClose();window.skhChatEdit('" + esc(msgId) + "')");
            html += item('' + (window.skhNavIcon?window.skhNavIcon('trash',14):'') + '', T('ch_delete', 'Futa'), "window.skhChatMsgMenuClose();window.skhChatDelete('" + esc(msgId) + "')");
        }
        if (!isMe && !deleted) html += item('' + (window.skhNavIcon?window.skhNavIcon('alert',14):'') + '️', T('ch_report', 'Ripoti'), "window.skhChatMsgMenuClose();window.skhChatReportMsg('" + esc(msgId) + "')");
        if (!html) { window.skhChatMsgMenuClose(); return; }
        menu.innerHTML = html;
        menu.style.display = 'flex';
        // Eneo la menyu: karibu na kishale (desktop) au katikati (mobile).
        var x = 16, y = 16;
        if (ev && ev.clientX) { x = ev.clientX; y = ev.clientY; }
        else {
            var el = document.querySelector('.ch-msg[data-msgid="' + esc(msgId) + '"]');
            if (el && el.getBoundingClientRect) { var r = el.getBoundingClientRect(); x = r.left; y = r.top; }
        }
        var vw = (typeof window.innerWidth === 'number') ? window.innerWidth : 360;
        var vh = (typeof window.innerHeight === 'number') ? window.innerHeight : 640;
        menu.style.left = Math.min(Math.max(8, x), Math.max(8, vw - 220)) + 'px';
        menu.style.top = Math.min(Math.max(8, y), Math.max(8, vh - 260)) + 'px';
        setTimeout(function () { document.addEventListener('click', window.skhChatMsgMenuClose); }, 0);
    };

    // [REACTIONS 2026-09] React: fungua picker halisi ya emoji (spec §4) —
    // sio prompt. Kwenye vifaa bila #chEmojiMenu, rudi kwenye prompt rahisi.
    window.skhChatReact = async function (msgId, ev) {
        window.skhChatMsgMenuClose();
        var menu = document.getElementById('chEmojiMenu');
        if (!menu) {
            var emoji = await skhPrompt(T('ch_react_ph', 'Emoji (mf. 👍, ❤️, 😂):'), '👍');
            if (emoji) window.skhChatReactEmoji(msgId, emoji.trim().slice(0, 4));
            return;
        }
        menu.setAttribute('data-msgid', msgId);
        menu.style.display = 'flex';
        var x = 16, y = 16;
        if (ev && ev.clientX) { x = ev.clientX; y = ev.clientY; }
        var vw = (typeof window.innerWidth === 'number') ? window.innerWidth : 360;
        var vh = (typeof window.innerHeight === 'number') ? window.innerHeight : 640;
        menu.style.left = Math.min(Math.max(8, x - 90), Math.max(8, vw - 260)) + 'px';
        menu.style.top = Math.min(Math.max(8, y - 60), Math.max(8, vh - 120)) + 'px';
        setTimeout(function () { document.addEventListener('click', window.skhChatReactClose); }, 0);
    };

    window.skhChatReactClose = function () {
        var m = document.getElementById('chEmojiMenu');
        if (m) m.style.display = 'none';
        document.removeEventListener('click', window.skhChatReactClose);
    };

    // Save: hifadhi ujumbe kwa ajili yako (savedMessages).
    window.skhChatSave = async function (msgId) {
        var m = await getMsg(msgId);
        if (!m) return;
        var me = myUid();
        try {
            await skh.addDoc(skh.collection(skh.db, 'savedMessages'), {
                uid: me, msgId: msgId, text: m.text || '', type: m.type || 'text',
                productSnapshot: m.productSnapshot || null, savedAt: nowIso()
            });
            alert(T('ch_saved', 'Ujumbe umehifadhiwa.'));
        } catch (e) { alert('Imeshindwa: ' + e.message); }
    };

    // Forward: sambaza ujumbe kwenye mazungumzo mengine.
    window.skhChatForward = async function (msgId) {
        var m = await getMsg(msgId);
        if (!m) return;
        var host = document.getElementById('chatForwardList');
        var modal = document.getElementById('chatForwardModal');
        if (!host || !modal) return;
        modal.style.display = 'flex';
        host.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:16px;">' + T('ch_loading', 'Inapakia...') + '</p>';
        if (!inboxItems.length) { try { await loadInbox(); } catch (e) {} }
        var items = inboxItems.filter(function (it) { return it.otherUid; });
        if (!items.length) { host.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:16px;">' + T('ch_no_chats', 'Hakuna mazungumzo bado.') + '</p>'; return; }
        host.innerHTML = items.map(function (it) {
            return '<button type="button" class="ch-attach-row" onclick="window.skhChatDoForward(\'' + esc(msgId) + '\', \'' + jsEsc(it.otherUid) + '\', \'' + jsEsc(it.name) + '\')">'
                + '<span class="ch-attach-ph">' + (window.skhNavIcon?window.skhNavIcon('user',14):'') + '</span>'
                + '<span class="ch-attach-t"><b>' + esc(it.name) + '</b></span>'
                + '<span class="ch-attach-send"></span></button>';
        }).join('');
    };

    window.skhChatDoForward = async function (msgId, targetUid, targetName) {
        var modal = document.getElementById('chatForwardModal');
        if (modal) modal.style.display = 'none';
        var m = await getMsg(msgId);
        if (!m || !targetUid) return;
        var core = skh.chatCore || {};
        if (!core.convId) return;
        try {
            var target = await ensureConversation(targetUid, { ctx: '' });
            var body = '';
            if (m.type === 'text') body = m.text || '';
            var opts = { conversationId: target.id, partnerUid: targetUid, type: 'text' };
            if (m.type === 'product' && m.productSnapshot) opts = { conversationId: target.id, partnerUid: targetUid, type: 'product', product: { ref: m.productRef || {}, snapshot: m.productSnapshot } };
            else if (m.type === 'order') opts = { conversationId: target.id, partnerUid: targetUid, type: 'order', order: { orderId: (m.orderRef && m.orderRef.orderId) || '', snapshot: m.orderSnapshot || {} } };
            else if (m.type === 'delivery') opts = { conversationId: target.id, partnerUid: targetUid, type: 'delivery', delivery: { deliveryId: (m.deliveryRef && m.deliveryRef.deliveryId) || '', snapshot: m.deliverySnapshot || {} } };
            else if (m.type === 'location') opts = { conversationId: target.id, partnerUid: targetUid, type: 'location', location: m.location || { name: 'Mahali' } };
            await sendInternal(body, opts);
            alert(T('ch_forwarded', 'Ujumbe umesambazwa.'));
        } catch (e) { alert('Imeshindwa: ' + e.message); }
    };

    // Long-press (touch) + right-click (mouse) → menyu ya ujumbe (spec §16).
    function bindMessageMenu() {
        var list = document.getElementById('chatMessages');
        if (!list || list._skhMsgMenuBound) return;
        list._skhMsgMenuBound = true;
        var pressTimer = null, pressX = 0, pressY = 0;
        function msgOf(el) { return el && el.closest ? el.closest('.ch-msg[data-msgid]') : null; }
        list.addEventListener('contextmenu', function (e) {
            var m = msgOf(e.target);
            if (!m) return;
            e.preventDefault();
            window.skhChatMsgMenu(m.getAttribute('data-msgid'), e);
        });
        list.addEventListener('touchstart', function (e) {
            var t = e.touches && e.touches[0]; if (!t) return;
            var m = msgOf(e.target); if (!m) return;
            pressX = t.clientX; pressY = t.clientY;
            pressTimer = setTimeout(function () {
                pressTimer = null;
                var el = msgOf(document.elementFromPoint(pressX, pressY)) || m;
                window.skhChatMsgMenu(el.getAttribute('data-msgid'), { clientX: pressX, clientY: pressY });
            }, 500);
        }, { passive: true });
        ['touchmove', 'touchend', 'touchcancel'].forEach(function (t) {
            list.addEventListener(t, function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }, { passive: true });
        });
    }

    /* ============================================================
       PHASE 5 — COMMERCE QUICK ACTIONS.
       Buy / Make Offer / Ask Delivery / Payment / Track Order /
       View Products — zote zinaelekeza kwenye mifumo ILIYOPO
       (smart cart, checkout, tracking, seller store). Chat HAIBADILISHI
       payment/delivery state moja kwa moja.
       ============================================================ */
    function cfCallable(name) {
        // [FUNCTIONS RESILIENCE] wrapper wa bootstrap (alama ya fnDown + ujumbe
        // wa Kiswahili); kwenye stub/majaribio tumia callable ya moja kwa moja.
        try {
            if (typeof skh.wrapCallable === 'function') return skh.wrapCallable(name);
            return skh.httpsCallable(skh.getFunctions(skh.fApp, 'europe-west1'), name);
        } catch (e) { return null; }
    }

    // [FIREBASE-NATIVE 2026-09] Kama Cloud Functions HAZIPO (Firestore + RTDB
    // pekee, bila billing/deploy), client inatumia njia ya Firestore-native.
    // Tunapotambua functions hazipatikani, tunabadili hadi transaction ya
    // Firestore (rules ndiye anathibitisha version/transition/roles).
    function isFunctionsDown(e) {
        if (!e) return true;
        // [FUNCTIONS RESILIENCE] wrapper wa bootstrap huweka alama hii wazi.
        if (e.fnDown === true || skh.functionsDown === true) return true;
        var code = String((e && (e.code || (e.errorInfo && e.errorInfo.code))) || '').toLowerCase();
        if (code.indexOf('not') !== -1 && code.indexOf('found') !== -1) return true;
        if (code === 'fndown' || code.indexOf('unavailable') !== -1 || code.indexOf('internal') !== -1 || code.indexOf('deadline') !== -1) return true;
        var m = String((e && (e.message || e.details)) || '');
        if (/NO_FUNCTIONS|not[-_ ]?found|unavailable|^internal$|hazipatikani/i.test(m)) return true;
        return true;
    }

    // Kuunda negotiation + ofa + event ya SEND_OFFER MOJA KWA MOJA (bila functions).
    window.skhNegoNativeCreate = async function (offerData) {
        var me = myUid();
        var now = nowIso();
        var negoId = 'nego_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        var negotiation = {
            negotiationId: negoId,
            conversationId: offerData.conversationId || null,
            productId: offerData.productId || '',
            productCollection: offerData.productCollection || 'products',
            productTitle: offerData.productTitle || 'Bidhaa',
            productImage: offerData.productImage || '',
            commerceType: offerData.commerceType || 'product',
            sellerId: offerData.sellerId,
            buyerId: me,
            buyerName: myName(),
            sellerName: offerData.sellerName || offerData.sellerId,
            currency: 'TZS',
            currentState: 'OFFER_SENT',
            turn: 'seller',
            quantity: offerData.quantity || 1,
            originalUnitPrice: (offerData.originalUnitPrice != null ? offerData.originalUnitPrice
                : (offerData.catalogPrice != null ? offerData.catalogPrice : null)),
            currentUnitPrice: offerData.price,
            // [NEGO MODULE 01] Jumla la mamlaka huja kutoka fomu (qty × bei);
            // kwa usafiri nauli ni ya safari nzima (qty 1).
            currentTotal: (offerData.currentTotal != null ? offerData.currentTotal
                : (offerData.quantity || 1) * offerData.price),
            notes: offerData.notes || offerData.note || '',
            currentProposedBy: 'buyer',
            agreementVersion: 0,
            agreements: [],
            // [COMMERCE 2026-09] Actor model + Turn (spec §4/§6/§21/§32) — native path.
            initiatorId: me,
            demandSideUserId: me,
            supplySideUserId: offerData.sellerId,
            currentActorId: offerData.sellerId,
            waitingForUserId: offerData.sellerId,
            lastActorId: me,
            proposalVersion: 1,
            turns: [{ turnId: negoId + '_t1', actorId: me, actorRole: 'buyer', action: 'SEND_OFFER', proposalVersion: 1, createdAt: now, respondedAt: null, status: 'open' }],
            history: [{ kind: 'offer_sent', actorId: me, actorRole: 'buyer', price: offerData.price, quantity: offerData.quantity || 1, at: now }],
            version: 1,
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            createdAt: now,
            updatedAt: now
        };
        // [COMMERCE 2026-09] Terms za Service / Transport (spec §6, §10, §12).
        if (negotiation.commerceType === 'service') {
            negotiation.serviceId = offerData.serviceId || offerData.productId || '';
            negotiation.serviceTitle = offerData.serviceTitle || offerData.productTitle || 'Huduma';
            negotiation.serviceCollection = offerData.serviceCollection || 'services';
            negotiation.scope = offerData.scope || '';
            negotiation.scopeUnit = offerData.scopeUnit || '';
            negotiation.deadline = offerData.deadline || '';
            negotiation.deadlineDate = offerData.deadlineDate || '';
            negotiation.location = offerData.location || '';
            negotiation.requirements = offerData.requirements || '';
        } else if (negotiation.commerceType === 'transport') {
            negotiation.transportId = offerData.transportId || offerData.productId || '';
            negotiation.transportTitle = offerData.transportTitle || offerData.productTitle || 'Usafiri';
            negotiation.transportCollection = offerData.transportCollection || 'ride_requests';
            negotiation.route = offerData.route || {};
            negotiation.packageDescription = offerData.packageDescription || '';
            negotiation.packageQuantity = offerData.packageQuantity || '';
            negotiation.weight = (offerData.weight != null && offerData.weight !== '') ? Number(offerData.weight) || null : null;
            negotiation.pickupDate = offerData.pickupDate || '';
            negotiation.pickupTime = offerData.pickupTime || '';
            negotiation.deliveryDeadline = offerData.deliveryDeadline || '';
            negotiation.vehicleType = offerData.vehicleType || '';
            negotiation.specialRequirements = offerData.specialRequirements || '';
            // Nauli ni ya safari nzima — jumla = nauli.
            negotiation.currentTotal = offerData.currentTotal != null ? offerData.currentTotal : offerData.price;
        } else {
            // [NEGO MODULE 01] Product-only foundation fields.
            negotiation.variants = offerData.variants || null;
            negotiation.deliveryLocation = offerData.deliveryLocation || '';
            negotiation.preferredDate = offerData.preferredDate || '';
        }
        // [NEGO LOCK §21/§22 — BACKEND GATE] Hii ni hatua ya kuunda doc mpya la
        // negotiation — ukurasa wowote (chat card, route matcher, forma ya moja kwa
        // moja) lazima upite hapa. Kabla ya kuandika, soma doc LA MWAMBAJIKO la
        // tangazo; kama mrekebisha (transporter/provider) amezima negotiation → kataa.
        // Hakuna upenyezaji wa UI unaoweza kuipitisha hii — ikishindwa kusoma,
        // tunafail-closed KWA SILIMIA ya usalama wa mpangilio (si fail-open).
        if (negotiation.commerceType === 'service' || negotiation.commerceType === 'transport') {
            try {
                var lockColl = negotiation.commerceType === 'service'
                    ? (negotiation.serviceCollection || 'services')
                    : (negotiation.transportCollection || 'ride_requests');
                var lockId = negotiation.commerceType === 'service' ? negotiation.serviceId : negotiation.transportId;
                if (lockId) {
                    var lockSnap = await skh.getDoc(skh.doc(skh.db, lockColl, lockId));
                    if (lockSnap && lockSnap.exists && lockSnap.exists()) {
                        var lockData = lockSnap.data() || {};
                        if (lockData.negotiationAllowed === false) {
                            return { ok: false, error: 'Negotiation haijaruhusiwa na mmiliki wa tangazo hili. Bei iliyotangazwa ndiyo sahihi — unaweza kuzungumza nae bado.' };
                        }
                    }
                }
            } catch (lockErr) {
                return { ok: false, error: 'Imeshindwa kuthibitisha uwekaji wa negotiation. Tafadhali jaribu tena.' };
            }
        }
        try {
            await skh.setDoc(skh.doc(skh.db, 'negotiations', negoId), negotiation);
            await skh.addDoc(skh.collection(skh.db, 'offers'), {
                negotiationId: negoId, conversationId: negotiation.conversationId,
                productId: negotiation.productId, productTitle: negotiation.productTitle, productCollection: negotiation.productCollection,
                commerceType: negotiation.commerceType,
                buyerId: me, sellerId: negotiation.sellerId, quantity: negotiation.quantity,
                currentPrice: negotiation.originalUnitPrice, proposedPrice: negotiation.currentUnitPrice,
                message: offerData.note || offerData.notes || '', counterOf: null, status: 'pending',
                expiresAt: negotiation.expiresAt, createdAt: now, updatedAt: now
            });
            await skh.addDoc(skh.collection(skh.db, 'negotiation_events'), {
                negotiationId: negoId, actorId: me, actorRole: 'buyer', command: 'SEND_OFFER',
                previousState: 'DRAFT', newState: 'OFFER_SENT',
                previousQuantity: null, newQuantity: negotiation.quantity, previousPrice: null, newPrice: negotiation.currentUnitPrice,
                commandId: offerData.commandId || '', version: 1, createdAt: now
            });
            notify(negotiation.sellerId, 'Ofa Mpya', (negotiation.serviceTitle || negotiation.transportTitle || negotiation.productTitle || 'Bidhaa') + ' · TSh ' + Number(negotiation.currentUnitPrice).toLocaleString(), 'negotiation', { negotiationId: negoId, conversationId: negotiation.conversationId, partnerUid: me });
            return { ok: true, negotiationId: negoId, negotiation: negotiation, native: true };
        } catch (e) {
            return { ok: false, error: (e && e.message) || 'Imeshindwa kuunda ofa.' };
        }
    };

    // Amri ya negotiation kupitia TRANSACTION ya Firestore (bila functions).
    // Transaction inathibitisha version (concurrency) + hali sahihi; rules
    // zinathibitisha roles + transitions kwenye server-side ya Firestore.
    window.skhNegoNativeCommand = async function (cmd, payload) {
        if (!skh.requireAuth()) return { ok: false, error: 'auth' };
        var N = window.skhNego;
        var me = myUid();
        var nego = skh.negoCurrent || null;
        var negoId = payload.negotiationId || (nego && nego.negotiationId) || null;
        if (!negoId) { alert(T('ch_no_product', 'Hakuna majadiliano bado.')); return { ok: false, error: 'no_nego' }; }
        if (!skh.runTransaction || !N || !N.applyCommandLocally) { alert(T('ch_offer_server_unavailable', 'Huduma ya ofa haipatikani sasa hivi.')); return { ok: false, error: 'no_tx' }; }
        var now = nowIso();
        var commandId = cmd + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var newOrderId = (cmd === 'CREATE_ORDER' || cmd === 'CREATE_BOOKING') ? ('ord_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)) : null;
        var orderPaid = false;
        if (cmd === 'REQUEST_ADDITIONAL_ITEMS' || cmd === 'ACCEPT_QUANTITY_CHANGE') {
            var oid = payload.orderId || (nego && nego.orderId) || null;
            if (oid) { try { var os2 = await skh.getDoc(skh.doc(skh.db, 'orders', oid)); if (os2 && os2.exists && os2.exists()) orderPaid = (os2.data().paymentStatus === 'paid'); } catch (e) {} }
        }
        try {
            var out = null;
            await skh.runTransaction(skh.db, async function (tx) {
                var ref = skh.doc(skh.db, 'negotiations', negoId);
                var snap = await tx.get(ref);
                if (!snap || !snap.exists || !snap.exists()) throw new Error('Majadiliano hayapo.');
                var cur = snap.data();
                var res = N.applyCommandLocally(cur, cmd, {
                    quantity: payload.quantity, price: payload.price, note: payload.note,
                    scope: payload.scope, scopeUnit: payload.scopeUnit, deadline: payload.deadline,
                    location: payload.location, requirements: payload.requirements,
                    route: payload.route, pickupDate: payload.pickupDate, pickupTime: payload.pickupTime,
                    vehicleType: payload.vehicleType, packageDescription: payload.packageDescription,
                    packageQuantity: payload.packageQuantity, specialRequirements: payload.specialRequirements,
                    commandId: commandId, newOrderId: newOrderId, orderPaid: orderPaid
                }, me, now);
                if (!res || !res.ok) throw new Error((res && res.error) || 'Imeshindwa.');
                tx.update(ref, res.patch);
                if (res.event) tx.set(skh.doc(skh.db, 'negotiation_events', negoId + '_' + commandId), res.event);
                out = res; out.base = cur;
            });
            if (!out) return { ok: false, error: 'Imeshindwa.' };
            var merged = Object.assign({}, out.base || {}, out.patch);
            if (out.order) { try { await skh.setDoc(skh.doc(skh.db, 'orders', out.order.id), out.order.doc); } catch (e) {} }
            if (out.adjustment) {
                try {
                    await skh.setDoc(skh.doc(skh.db, 'order_adjustments', out.adjustment.id), out.adjustment.doc);
                    await skh.updateDoc(skh.doc(skh.db, 'orders', out.adjustment.doc.parentOrderId), { adjustments: skh.arrayUnion(out.adjustment.orderAdjustment) });
                } catch (e) { /* hiari */ }
            }
            if (out.notification && out.notification.to) notify(out.notification.to, out.notification.title, out.notification.body, 'negotiation', { negotiationId: negoId, command: cmd, event: out.notification.event || null, params: out.notification.params || null });
            return { ok: true, status: out.status, negotiationId: negoId, orderId: (out.order && out.order.id) || null, negotiation: merged, native: true };
        } catch (e) {
            // [QUOTA GUARD] Quota hit: toast yenye maana, bila refresh-loop.
            if (quotaGuardHit(e)) {
                quotaNotice();
                return { ok: false, error: 'quota' };
            }
            var m = (e && e.message) || 'Imeshindwa.';
            alert(m);
            if (typeof window.skhNegoRefresh === 'function') { try { window.skhNegoRefresh(); } catch (e2) {} }
            return { ok: false, error: m };
        }
    };

    /* ================================================================
       [CTX-LEAK FIX 2026-09-16] ROOT CAUSE: "negotiation/product cards
       zilionekana KILA INBOX hata kwa muuzaji asiyehusika."

       Chanzo: `skh.activeChatProduct/Service/Transport` ni GLOBALS
       zinazowekwa mara zote mtumiaji anapofungua tangazo (07-product).
       `ensureConversation`/`skhChatOpen` zilichukua related kutoka kwazo
       BILA kuangalia kuwa MWENZIO ni mmiliki wa tangazo — kisha
       related hiyo mbaya iliandikwa HATA kwenye doc ya Firestore
       (milele!) na kadi kunyeshewa popote.

       Kanuni: muktadha wa biashara unaruhusiwa TU ikiwa mmiliki wake ni
       partner wa mazungumzo haya.
       ================================================================ */
    function ctxPartner() {
        var core = skh.chatCore || {};
        return core.partnerUid || skh.currentChatUid || null;
    }
    function ctxOwnerOf(x) {
        return x ? (x.userId || x.providerId || x.driverId || x.sellerId || null) : null;
    }
    /** related ya doc ya mazungumzo: kataza ikitaja mtu asiye partner. */
    function pairRelatedOrNull(rel, partnerUid) {
        if (!rel || !partnerUid) return rel || null;
        var owner = rel.sellerId || rel.providerId || rel.driverId || null;
        var other = rel.buyerId || null;
        if (owner && owner !== partnerUid && other !== partnerUid) return null;
        return rel;
    }
    /** related MBORA kutoka globals za activeChat* — ikiwa TU partner ndiye mmiliki. */
    function scopedRelatedForPartner(uid) {
        if (!uid) return null;
        var me = myUid();
        var p = skh.activeChatProduct;
        if (p && p.id && ctxOwnerOf(p) === uid) {
            return { productId: p.id, sellerId: ctxOwnerOf(p), buyerId: me,
                     productTitle: p.title || p.itemTitle || null, productPrice: p.price != null ? p.price : null,
                     productImage: p.image || (p.images && p.images[0]) || p.photo || null,
                     productCollection: p.collectionName || 'products',
                     // [§28 MODE CTX] Chat ijue mbichi kama hii ni bidhaa ya
                     // mnada/group/price_drop/wholesale (si 'KAWAIDA'). Related
                     // compact — data zaidi hupatikana kwa re-read ivyoionavyo.
                     productSaleMode: p.saleMode || 'free_market' };
        }
        var s = skh.activeChatService;
        if (s && s.id && ctxOwnerOf(s) === uid) {
            return { serviceId: s.id, sellerId: ctxOwnerOf(s), buyerId: me,
                     serviceTitle: s.title || s.itemTitle || null, servicePrice: s.price != null ? s.price : null,
                     serviceImage: s.image || (s.images && s.images[0]) || s.photo || null,
                     serviceScope: s.scope || s.description || null };
        }
        var t = skh.activeChatTransport;
        if (t && t.id && ctxOwnerOf(t) === uid) {
            return { transportId: t.id, sellerId: ctxOwnerOf(t), buyerId: me,
                     transportTitle: t.title || t.cargoName || null, transportFare: t.price != null ? t.price : (t.fare != null ? t.fare : null),
                     transportFrom: t.fromLocation || t.pickupRegion || null, transportTo: t.toLocation || t.destinationRegion || null,
                     transportCollection: t.collectionName || t.collection || (t.rideRequest ? 'ride_requests' : (t.pickupRegion || t.destinationRegion ? 'drivers' : 'ride_requests')) };
        }
        return null;
    }
    function relatedCtx() {
        var core = skh.chatCore || {};
        // [CTX-LEAK FIX] related iliyoharibika (iliyoandikwa kwa mtu mwingine)
        // isionekane tena — guard hii inafanya mageuzi ya majaribio yeye tu.
        return pairRelatedOrNull((core.conv && core.conv.related) || skh.chatRelated || null, core.partnerUid);
    }

    // Bidhaa bora inayojulikana: activeChatProduct > conversation.related > ujumbe wa bidhaa wa mwisho.
    function productCtx() {
        var core = skh.chatCore || {};
        // [CTX-LEAK FIX] global ya activeChatProduct inaitumia TU partner mmiliki.
        if (skh.activeChatProduct && skh.activeChatProduct.id && ctxOwnerOf(skh.activeChatProduct) === ctxPartner()) {
            var p = skh.activeChatProduct;
            return {
                id: p.id, collection: p.collectionName || skh.currentFeedCollection || 'products',
                title: p.title || p.itemTitle || 'Bidhaa',
                price: p.price != null ? p.price : null,
                image: p.image || (p.images && p.images[0]) || p.photo || '',
                sellerId: p.userId || null, sellerName: p.ownerName || ''
            };
        }
        var rel = relatedCtx();
        if (rel && rel.productId) {
            return {
                id: rel.productId, collection: rel.productCollection || 'products',
                title: rel.productTitle || 'Bidhaa',
                price: rel.productPrice != null ? rel.productPrice : null,
                image: rel.productImage || '', sellerId: rel.sellerId || null, sellerName: rel.sellerName || ''
            };
        }
        var msgs = core.msgs || [];
        for (var i = msgs.length - 1; i >= 0; i--) {
            var m = msgs[i];
            if (m.productRef && m.productRef.id) {
                var s = m.productSnapshot || {};
                return { id: m.productRef.id, collection: m.productRef.collection || 'products', title: s.title || 'Bidhaa', price: s.price != null ? s.price : null, image: s.image || '', sellerId: s.sellerId || null, sellerName: s.sellerName || '' };
            }
        }
        return null;
    }

    // [COMMERCE 2026-09] Huduma bora inayojulikana kwenye chat (kama productCtx).
    function serviceCtx() {
        var core = skh.chatCore || {};
        // [CTX-LEAK FIX] global ya activeChatService inaitumia TU partner mmiliki.
        if (skh.activeChatService && skh.activeChatService.id && ctxOwnerOf(skh.activeChatService) === ctxPartner()) {
            var s = skh.activeChatService;
            return {
                id: s.id, collection: s.collectionName || 'services',
                title: s.title || s.itemTitle || s.serviceName || 'Huduma',
                price: s.price != null ? s.price : null,
                image: s.image || (s.images && s.images[0]) || s.photo || '',
                scope: s.scope || s.description || '',
                sellerId: s.userId || s.providerId || null, sellerName: s.ownerName || ''
            };
        }
        var rel = relatedCtx();
        if (rel && rel.serviceId) {
            return {
                id: rel.serviceId, collection: 'services', title: rel.serviceTitle || 'Huduma',
                price: rel.servicePrice != null ? rel.servicePrice : null, image: rel.serviceImage || '',
                scope: rel.serviceScope || '', sellerId: rel.sellerId || null, sellerName: rel.sellerName || ''
            };
        }
        var msgs = core.msgs || [];
        for (var i = msgs.length - 1; i >= 0; i--) {
            var m = msgs[i];
            if (m.serviceRef && m.serviceRef.id) {
                var sn = m.serviceSnapshot || {};
                return { id: m.serviceRef.id, collection: m.serviceRef.collection || 'services', title: sn.title || 'Huduma', price: sn.price != null ? sn.price : null, image: sn.image || '', scope: sn.scope || '', sellerId: sn.sellerId || null, sellerName: sn.sellerName || '' };
            }
        }
        return null;
    }

    // [COMMERCE 2026-09] Usafiri bora unaojulikana kwenye chat (spec §10).
    function transportCtx() {
        var core = skh.chatCore || {};
        // [CTX-LEAK FIX] global ya activeChatTransport inaitumia TU partner mmiliki.
        if (skh.activeChatTransport && skh.activeChatTransport.id && ctxOwnerOf(skh.activeChatTransport) === ctxPartner()) {
            var t = skh.activeChatTransport;
            var tCol = t.collectionName || t.collection || 'ride_requests';
            return {
                id: t.id, collection: tCol, collectionName: tCol,
                title: t.title || t.cargoName || 'Usafiri',
                fare: t.price != null ? t.price : (t.fare != null ? t.fare : null),
                route: t.route || { from: t.fromLocation || t.pickupRegion || '', to: t.toLocation || t.destinationRegion || '' },
                fromLocation: t.fromLocation || t.pickupRegion || '', toLocation: t.toLocation || t.destinationRegion || '',
                packageDescription: t.packageDescription || '', vehicleType: t.vehicleType || '',
                providerId: t.userId || t.providerId || t.driverId || t.sellerId || null,
                providerName: t.driverName || t.ownerName || t.sellerName || ''
            };
        }
        var rel = relatedCtx();
        if (rel && rel.transportId) {
            var relCol = rel.transportCollection || rel.productCollection || 'ride_requests';
            return {
                id: rel.transportId, collection: relCol, collectionName: relCol, title: rel.transportTitle || 'Usafiri',
                fare: rel.transportFare != null ? rel.transportFare : null,
                route: rel.transportRoute || {}, fromLocation: rel.transportFrom || '', toLocation: rel.transportTo || '',
                packageDescription: rel.transportPackage || '', providerId: rel.sellerId || null, providerName: rel.sellerName || ''
            };
        }
        var msgs = core.msgs || [];
        for (var i = msgs.length - 1; i >= 0; i--) {
            var m = msgs[i];
            if (m.transportRef && m.transportRef.id) {
                var sn2 = m.transportSnapshot || {};
                var tCol2 = m.transportRef.collection || sn2.collection || 'ride_requests';
                return { id: m.transportRef.id, collection: tCol2, collectionName: tCol2, title: sn2.title || 'Usafiri', fare: sn2.price != null ? sn2.price : (sn2.fare != null ? sn2.fare : null), route: sn2.route || {}, fromLocation: sn2.fromLocation || (sn2.route && sn2.route.from) || sn2.pickupRegion || '', toLocation: sn2.toLocation || (sn2.route && sn2.route.to) || sn2.destinationRegion || '', packageDescription: sn2.packageDescription || '', vehicleType: sn2.vehicleType || '', providerId: sn2.providerId || sn2.sellerId || sn2.userId || null, providerName: sn2.providerName || sn2.sellerName || sn2.driverName || '' };
            }
        }
        return null;
    }

    function setCurrentOpenProduct(p) {
        if (!p) return false;
        skh.currentOpenProduct = Object.assign({}, skh.currentOpenProduct || {}, {
            id: p.id, title: p.title, price: p.price, image: p.image,
            userId: p.sellerId, sellerId: p.sellerId, sellerName: p.sellerName || '',
            collectionName: p.collection || 'products'
        });
        return true;
    }

    window.skhChatBuy = async function () {
        if (!skh.requireAuth()) return;
        var p = productCtx();
        if (!p) { if (typeof window.openCart === 'function') window.openCart(); else alert(T('ch_no_product', 'Hakuna bidhaa kwenye chat hii.')); return; }
        setCurrentOpenProduct(p);
        if (typeof window.addToCart === 'function') await window.addToCart(false);
        if (typeof window.openCart === 'function') window.openCart();
    };

    window.skhChatMakeOffer = function () {
        if (!skh.requireAuth()) return;
        var p = productCtx();
        if (!p) { alert(T('ch_no_product', 'Hakuna bidhaa kwenye chat hii.')); return; }
        window.skhChatOpenOffer(p);
    };

    window.skhChatAskDelivery = function () {
        if (!skh.requireAuth()) return;
        var p = productCtx();
        if (p && p.id) {
            try { sessionStorage.setItem('pending_order_product', JSON.stringify({ id: p.id, title: p.title, price: p.price, location: p.sellerName || '' })); } catch (e) {}
        }
        var tab = document.getElementById('navTabDelivery');
        if (tab && typeof window.updateApp === 'function') window.updateApp('delivery', tab);
        else if (typeof window.openMyDeliveries === 'function') window.openMyDeliveries();
        else alert(T('ch_open_delivery', 'Fungua kichupo cha Usafiri.'));
    };

    // [COMMERCE 2026-09] Lipa ODA YA MAJADILIANO kwa bei ILIYOGANDISHWA.
    // Hutumia njia ya PesaPal iliyopo (skhPesaPalPay); kwa DEMO MODE hufunga
    // oda moja kwa moja ('held'/escrow). HAIUNDWI oda mpya ya kikapu.
    window.skhChatPayNegoOrder = async function (order, nego) {
        order = order || skh.negoOrder || null;
        nego = nego || skh.negoCurrent || null;
        if (!order || !(order.orderId || order.id)) { alert(T('ch_no_order', 'Oda haijapatikana.')); return; }
        if (window.skhNego && window.skhNego.orderIsPaid && window.skhNego.orderIsPaid(order)) {
            if (typeof window.openBuyerOrdersModal === 'function') window.openBuyerOrdersModal();
            return;
        }
        var oid = order.orderId || order.id;
        var amount = Number(order.amount != null ? order.amount
            : (Number(order.unitPrice || 0) * Number(order.quantity || 1)));
        if (!(amount > 0)) { alert(T('ch_pay_no_amount', 'Bei ya oda haijapatikana.')); return; }
        var title = order.itemTitle
            || ((window.skhNego && window.skhNego.commerceTitleOf) ? window.skhNego.commerceTitleOf(nego) : 'Oda');
        var context = {
            orderId: oid,
            negotiationId: (nego && nego.negotiationId) || order.negotiationId || null,
            conversationId: (nego && nego.conversationId) || order.conversationId
                || (skh.chatCore && skh.chatCore.convId) || null,
            sellerId: order.sellerId || (nego && nego.sellerId) || null,
            amount: amount
        };

        // [DEMO MODE] backend ya malipo haipo — funga escrow moja kwa moja.
        if (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.DEMO_MODE) {
            if (!window.confirm(T('ch_pay_confirm', 'Thibitisha kulipa oda hii kupitia SokoPay Escrow?') + '\n\n'
                + title + '\nTSh ' + amount.toLocaleString())) return;
            var txRef = 'SKH_NEGO_' + Date.now();
            var pending = {
                kind: 'negotiation_order', txRef: txRef, orderTrackingId: txRef,
                amount: amount, provider: 'DEMO', demo: true,
                savedAt: new Date().toISOString(), context: context
            };
            try {
                if (typeof window.skhPesaPalFinishNegotiationOrder === 'function') {
                    var r = await window.skhPesaPalFinishNegotiationOrder(pending, { state: 'success', transactionId: 'DEMO_' + Date.now() });
                    if (!r || r.ok === false) throw new Error((r && r.error) || 'imeshindikana');
                    if (typeof window.skhNegoListen === 'function' && context.conversationId) window.skhNegoListen(context.conversationId);
                    alert(T('ch_pay_protected', '🛡 Malipo yamelindwa na SokoPay Escrow! Muuzaji amearifiwa atayarishe oda.'));
                    renderChatStream();
                } else {
                    throw new Error('malipo hayapatikani');
                }
            } catch (e) {
                alert(T('ch_pay_failed', 'Malipo yameshindikana: ') + (e && e.message));
            }
            return;
        }

        // [LIVE] PesaPal hosted checkout — kurudi kwake (17-pesapal-return)
        // huthibitisha na kuweka oda hii 'held' (si oda mpya ya kikapu).
        if (typeof window.skhPesaPalPay !== 'function') {
            alert(T('ch_pay_unavailable', 'Njia ya malipo haijapatikani.'));
            if (typeof window.openBuyerOrdersModal === 'function') window.openBuyerOrdersModal();
            return;
        }
        // Weka paymentRef KWENYE oda kabla ya redirect — ili IPN ya PesaPal
        // (inayotafuta orders.where('paymentRef','==',ref)) iweze kuifunga escrow.
        var txRef = 'SKH_NEGO_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        context.txRef = txRef;
        try {
            await skh.updateDoc(skh.doc(skh.db, 'orders', oid), {
                paymentRef: txRef,
                paymentType: 'PesaPal',
                paymentInitiatedAt: nowIso(),
                updatedAt: nowIso()
            });
        } catch (e) { console.warn('[chat] kuweka paymentRef kumeshindikana', e); }
        var r = await window.skhPesaPalPay({
            amount: amount,
            kind: 'negotiation_order',
            txRef: txRef,
            description: 'Oda ya majadiliano #' + oid + ' — ' + title,
            context: context
        });
        if (!r.ok && r.error) alert(T('ch_pay_failed', 'Malipo yameshindikana: ') + r.error);
    };

    window.skhChatPay = function () {
        if (!skh.requireAuth()) return;
        var nego = skh.negoCurrent || null;
        var o = skh.negoOrder || null;
        // Kama live listener haijarudi, jenga oda ya muda kutoka MAKUBALIANO
        // yaliyogandishwa (bei ya makubaliano, si ya sasa ya katalogi).
        if ((!o || !(o.orderId || o.id)) && nego && nego.orderId) {
            var _q = Number(nego.quantity || 1), _u = Number(nego.currentUnitPrice || 0);
            o = {
                orderId: nego.orderId, id: nego.orderId, negotiationId: nego.negotiationId,
                conversationId: nego.conversationId || null,
                commerceType: nego.commerceType || 'product',
                buyerId: nego.buyerId, sellerId: nego.sellerId,
                itemTitle: (window.skhNego && window.skhNego.commerceTitleOf) ? window.skhNego.commerceTitleOf(nego)
                    : (nego.productTitle || nego.serviceTitle || nego.transportTitle || 'Oda'),
                quantity: _q, unitPrice: _u, amount: Math.round(_q * _u),
                status: 'payment_pending', paymentStatus: 'pending'
            };
        }
        var orderUnpaid = o && (o.orderId || o.id)
            && !(window.skhNego && window.skhNego.orderIsPaid && window.skhNego.orderIsPaid(o));
        // [ORDER FLOW] Oda ya majadiliano bado haijalipwa → anzisha malipo ya
        // SokoPay/PesaPal kwa bei iliyogandishwa (si tena cart huru).
        if (orderUnpaid) { window.skhChatPayNegoOrder(o, nego); return; }
        // Oda tayari imelindwa / mlango wa jumla wa oda za mnunuzi.
        if ((nego && nego.orderId) || (o && (o.orderId || o.id))) {
            if (typeof window.openBuyerOrdersModal === 'function') { window.openBuyerOrdersModal(); return; }
        }
        var rel = relatedCtx();
        if (rel && rel.orderId) { if (typeof window.openBuyerOrdersModal === 'function') { window.openBuyerOrdersModal(); return; } }
        var p = productCtx();
        if (p) setCurrentOpenProduct(p);
        if (typeof window.openCheckout === 'function') window.openCheckout(p ? 'direct' : 'cart');
        else if (typeof window.openCart === 'function') window.openCart();
    };

    window.skhChatTrackOrder = function () {
        if (!skh.requireAuth()) return;
        var rel = relatedCtx();
        if (rel && rel.orderId && typeof window.openOrderTracking === 'function') { window.openOrderTracking(rel.orderId); return; }
        if (rel && rel.deliveryId && typeof window.openRideTracking === 'function') { window.openRideTracking(rel.deliveryId); return; }
        if (typeof window.openBuyerOrdersModal === 'function') window.openBuyerOrdersModal();
        else if (typeof window.openTrackingTokenLookup === 'function') window.openTrackingTokenLookup();
    };

    // [COMMERCE 2026-09] Fuatilia booking ya usafiri (ride_requests) — reference, sio duplication (spec §9).
    window.skhChatTrackBooking = function () {
        if (!skh.requireAuth()) return;
        var rel = relatedCtx();
        var trackId = (rel && (rel.transportId || rel.rideRequestId)) || (rel && rel.orderId) || '';
        if (trackId && typeof window.openRideTracking === 'function') { window.openRideTracking(trackId); return; }
        if (typeof window.openBuyerOrdersModal === 'function') window.openBuyerOrdersModal();
    };

    // [AUDIT 2026-09] Kifungua-oda kinachojua NAFASI: muuzaji → Seller Order Inbox,
    // mnunuzi → Buyer Orders (tracking). Rekebisha fallback ya "openSellerOrders"
    // (haikuwepo) — mtazamo sahihi kwa kila upande.
    window.skhChatViewOrder = function (sellerIdHint) {
        if (!skh.requireAuth()) return;
        var rel = relatedCtx();
        var nego = skh.negoCurrent || {};
        var sellerId = sellerIdHint || (rel && rel.sellerId) || nego.sellerId || null;
        if (sellerId && sellerId === myUid() && typeof window.openSellerOrderInbox === 'function') {
            window.openSellerOrderInbox(); return;
        }
        if (typeof window.openBuyerOrdersModal === 'function') { window.openBuyerOrdersModal(); return; }
    };


    window.skhChatViewProducts = function () {
        if (!skh.requireAuth()) return;
        var rel = relatedCtx();
        var p = productCtx();
        var sellerId = (rel && rel.sellerId) || (p && p.sellerId) || (skh.chatCore && skh.chatCore.partnerUid);
        var sellerName = (p && p.sellerName) || (skh.chatCore && skh.chatCore.partnerName) || '';
        if (sellerId && typeof window.openSellerProfile === 'function') { window.openSellerProfile(sellerId, sellerName); return; }
        var tab = document.getElementById('navTabMarket') || document.getElementById('navTabHome');
        if (tab && typeof window.updateApp === 'function') window.updateApp('market', tab);
    };

    function renderCommerceBar() {
        // [NEGO ENGINE 2026-09] Vitendo vya biashara (Nunua/Ofa/Lipa/Fuatilia)
        // vimehamishwa KWENYE kadi za NDANI ya chat (bidhaa / negotiation) —
        // si vitufe vilivyokwama juu ya sehemu ya kuandikia.
        var host = document.getElementById('chatCommerceBar');
        if (host) { host.style.display = 'none'; host.innerHTML = ''; }
    }

    /* ============================================================
       PHASE 6 — OFA (price negotiation).
       Browser inaunda ofa tu (create-only). Accept/reject/counter
       hupitia Cloud Function `chatOfferAction` (server-authoritative).
       Kukubali ofa ≠ kuthibitisha malipo.
       ============================================================ */
    window.skhChatOfferClose = function () {
        var s = document.getElementById('skhOfferModalShell');
        if (s) s.remove();
    };

    window.skhChatOpenOffer = function (p) {
        if (!skh.requireAuth()) return;
        p = p || productCtx();
        if (!p || !p.id) { alert(T('ch_no_product', 'Hakuna bidhaa kwenye chat hii.')); return; }
        // [NEGO MODULE 01 2026-09] Fomu mpya inayojua muktadha (38-negotiation-form).
        window.skhNegoFormOpen({ type: 'product', entity: p });
    };

    /* ============================================================
       [NEGO MODULE 01 — DYNAMIC NEGOTIATION FORM, 2026-09]
       Njia MOJA ya kutuma PROPOSAL iliyopangiliwa na fomu mpya
       (38-negotiation-form.js). Inaheshimu sheria zote zilizopo:
       - server negotiationSendOffer (mamlaka), fallback Firestore-native
       - haibadilishi bei ya sokoni/inventory/oda/malipo
       - huandaa ofa ya kwanza (OFFER_SENT) + tukio la mfumo kwenye chat
       ============================================================ */
    window.skhChatSubmitNegotiationProposal = async function (p) {
        if (!p) return { ok: false, error: 'Proposal haipo.' };
        var core = skh.chatCore || {};
        var convId = p.conversationId || core.convId;
        var partnerUid = core.partnerUid || (p.sellerId || null);
        if (!myUid() || !partnerUid || !convId) {
            return { ok: false, error: 'Fungua mazungumzo na muuzaji kwanza.' };
        }
        var commandId = 'send_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var ctype = p.commerceType || 'product';
        var sellerId = p.sellerId || partnerUid;
        var sellerName = p.sellerName || core.partnerName || '';

        // Mzigo wa kawaida (server huupokea tayari) + fields mpya za foundation.
        var payload = {
            conversationId: convId,
            commerceType: ctype,
            productId: p.productId || p.serviceId || p.transportId || '',
            productCollection: p.productCollection || (ctype === 'service' ? 'services' : (ctype === 'transport' ? 'ride_requests' : 'products')),
            productTitle: p.productTitle || p.serviceTitle || p.transportTitle || '',
            productImage: p.productImage || '',
            sellerId: sellerId,
            sellerName: sellerName,
            quantity: p.quantity || 1,
            price: p.unitPrice,
            currentTotal: p.total,
            catalogPrice: p.catalogPrice,
            originalUnitPrice: p.originalUnitPrice,
            note: p.notes || '',
            notes: p.notes || '',
            commandId: commandId
        };
        if (ctype === 'service') {
            Object.assign(payload, {
                serviceId: p.serviceId || p.productId,
                serviceTitle: p.serviceTitle || p.productTitle,
                serviceCollection: p.serviceCollection || p.productCollection,
                scope: p.scope || '', scopeUnit: p.scopeUnit || '',
                deadline: p.deadline || '', deadlineDate: p.deadlineDate || '',
                location: p.location || '', requirements: p.requirements || ''
            });
        } else if (ctype === 'transport') {
            Object.assign(payload, {
                transportId: p.transportId || p.productId,
                transportTitle: p.transportTitle || p.productTitle,
                transportCollection: p.transportCollection || p.productCollection,
                route: p.route || {}, packageDescription: p.packageDescription || '',
                packageQuantity: p.packageQuantity || '', weight: p.weight,
                pickupDate: p.pickupDate || '', pickupTime: p.pickupTime || '',
                deliveryDeadline: p.deliveryDeadline || '', vehicleType: p.vehicleType || '',
                specialRequirements: p.specialRequirements || ''
            });
        } else {
            Object.assign(payload, {
                variants: p.variants || null,
                deliveryLocation: p.deliveryLocation || '',
                preferredDate: p.preferredDate || ''
            });
        }

        var fn = cfCallable('negotiationSendOffer');
        var snap = null, negoId = null;
        try {
            if (!fn) throw Object.assign(new Error('NO_FUNCTIONS'), { code: 'unavailable' });
            var res = await fn(payload);
            var r = res && res.data;
            if (!r || !r.ok) throw Object.assign(new Error((r && r.error) || 'Imeshindwa.'), { code: (r && r.code) || null });
            snap = r.negotiation || null;
            negoId = r.negotiationId;
        } catch (e) {
            console.warn('[negotiationSendOffer] Falling back to Firestore-native:', e);
            // FIREBASE-NATIVE fallback (bila Cloud Functions) — huunda negotiation + offer + event mara moja.
            var nr = await window.skhNegoNativeCreate(payload);
            if (!nr || !nr.ok) return { ok: false, error: (nr && nr.error) || 'Imeshindwa kutuma ofa.' };
            snap = nr.negotiation;
            negoId = nr.negotiationId;
        }

        // Tukio la mfumo kwenye chat (kadi ya negotiation) — si ujumbe wa kawaida.
        await sendInternal(p.notes || '', {
            conversationId: convId, partnerUid: partnerUid, type: 'negotiation',
            negotiationId: negoId, nego: { snapshot: snap }, system: true
        });
        skh.negoCurrent = snap;
        updateConvCommerce(convId, {
            negotiationId: negoId,
            commerceType: ctype,
            productId: p.productId || null,
            serviceId: p.serviceId || null,
            transportId: p.transportId || null,
            sellerId: sellerId
        });
        renderCommerceAnchor();
        return { ok: true, negotiationId: negoId, negotiation: snap };
    };

    // [COMMERCE 2026-09] Fomu ya ofa ya HUDUMA (spec §6) — price + scope + deadline.
    window.skhChatOpenServiceOffer = function (s) {
        if (!skh.requireAuth()) return;
        s = s || serviceCtx();
        if (!s || !s.id) { alert(T('ch_no_service', 'Hakuna huduma kwenye chat hii.')); return; }
        // [NEGO MODULE 01 2026-09] Fomu mpya inayojua muktadha (38-negotiation-form).
        window.skhNegoFormOpen({ type: 'service', entity: s });
    };

    // [COMMERCE 2026-09] Fomu ya ofa ya USAFIRI (spec §10) — nauli + njia.
    window.skhChatOpenTransportOffer = function (t) {
        if (!skh.requireAuth()) return;
        t = t || transportCtx();
        if (!t || !t.id) { alert(T('ch_no_transport', 'Hakuna safari kwenye chat hii.')); return; }
        // [NEGO MODULE 01 2026-09] Fomu mpya inayojua muktadha (38-negotiation-form).
        window.skhNegoFormOpen({ type: 'transport', entity: t });
    };

    window.skhChatOfferReply = async function (offerId, action) {
        if (!skh.requireAuth()) return;
        var core = skh.chatCore || {};
        // Tafuta negotiationId kutoka kwenye ujumbe wa ofa.
        var negoId = null;
        (core.msgs || []).forEach(function (m) {
            if (!negoId && m.offerId === offerId) negoId = m.negotiationId || (m.offerSnapshot && m.offerSnapshot.negotiationId) || null;
        });
        if (negoId) {
            // [NEGO ENGINE 2026-09] Injini moja — amri zinapita negotiationAction.
            if (action === 'counter') return window.skhNegoOpenCounter({ negotiationId: negoId });
            var cmdMap = { accept: 'ACCEPT_OFFER', reject: 'REJECT_OFFER' };
            return window.skhNegoCommand(cmdMap[action] || action, { negotiationId: negoId, offerId: offerId });
        }
        // Legacy ofa (bila negotiationId) — njia ya zamani (chatOfferAction).
        var fn = cfCallable('chatOfferAction');
        if (!fn) { alert(T('ch_offer_server_unavailable', 'Huduma ya ofa haipatikani sasa hivi.')); return; }
        if (action === 'counter') {
            var cur = null;
            (core.msgs || []).forEach(function (m) { if (m.offerId === offerId && m.offerSnapshot) cur = m.offerSnapshot; });
            var base = cur && cur.proposedPrice ? cur.proposedPrice : '';
            var counterPrice = await skhPrompt(T('ch_counter_prompt', 'Weka bei ya counter (TSh):'), base);
            if (counterPrice == null) return;
            counterPrice = parseFloat(counterPrice);
            if (!(counterPrice > 0)) { alert(T('ch_offer_price_req', 'Weka bei sahihi.')); return; }
            try {
                var res = await fn({ offerId: offerId, action: 'counter', counterPrice: counterPrice });
                var r = res && res.data;
                if (r && r.status === 'countered') alert(T('ch_counter_sent', 'Counter ofa imetumwa.'));
            } catch (e) { alert((e && e.message) || T('ch_offer_fail', 'Imeshindwa.')); }
            return;
        }
        try {
            var res2 = await fn({ offerId: offerId, action: action });
            var r2 = res2 && res2.data;
            if (r2 && r2.status === 'accepted') {
                alert(T('ch_offer_accepted', 'Ofa imekubaliwa.'));
                if (typeof window.skhNegoListen === 'function') { try { window.skhNegoListen(core.convId); } catch (e) {} }
            } else if (r2 && r2.status === 'rejected') {
                alert(T('ch_offer_rejected', 'Ofa imekataliwa.'));
            }
        } catch (e) {
            alert((e && e.message) || T('ch_offer_fail', 'Imeshindwa.'));
        }
    };

    /* [ODA RELATIONAL 2026-09] Sync ya mnunuzi: server anapokubali ofa,
       inaunda oda na kuandika `orderId` kwenye ofa. Mlisikilizaji huu (kwa
       upande wa mnunuzi) anapokea mabadiliko hayo na kuweka bei ILIYOKUBALIWA
       moja kwa moja kwenye Smart Cart — ikiwa haijaongezwa bado. Idempotent:
       ofa moja = kipengee kimoja (tracked kwenye localStorage). */
    var offerCartDone = {};
    try { offerCartDone = JSON.parse(skh.localStorage.getItem('sokohai_offer_cart_done') || '{}') || {}; } catch (e) {}
    function offerCartPersist() { try { skh.localStorage.setItem('sokohai_offer_cart_done', JSON.stringify(offerCartDone)); } catch (e) {} }
    var skhOfferCartUnsub = null;
    window.skhOfferCartSync = function (uid) {
        if (!uid || !skh.db || !skh.collection) return;
        if (skhOfferCartUnsub) { try { skhOfferCartUnsub(); } catch (e) {} skhOfferCartUnsub = null; }
        try {
            var q = skh.query(skh.collection(skh.db, 'offers'),
                skh.where('buyerId', '==', uid),
                skh.where('status', '==', 'accepted'));
            skhOfferCartUnsub = skh.onSnapshot(q, function (snap) {
                var addedAny = false;
                if (snap && snap.forEach) snap.forEach(function (d) {
                    var of = d.data() || {};
                    var offerId = d.id;
                    if (!offerId || !of.orderId) return;          // lazima iwe na oda
                    if (offerCartDone[offerId]) return;           // tayari imewekwa
                    var item = {
                        id: of.productId, title: of.productTitle || 'Bidhaa',
                        price: Number(of.proposedPrice), image: '',
                        qty: Math.max(1, parseInt(of.quantity, 10) || 1),
                        sellerId: of.sellerId, sellerName: '',
                        offerId: offerId, orderId: of.orderId,
                        escrowEligible: true, fromOffer: true, addedAt: new Date().toISOString()
                    };
                    try {
                        skh.myCart = (typeof skh.smartCartItems === 'function') ? skh.smartCartItems() : (skh.myCart || []);
                        var exists = skh.myCart.some(function (x) {
                            return (x.orderId && x.orderId === of.orderId) || (x.offerId && x.offerId === offerId);
                        });
                        if (!exists) { skh.myCart.push(item); if (typeof skh.smartCartSave === 'function') skh.smartCartSave(); addedAny = true; }
                        offerCartDone[offerId] = true;
                    } catch (e2) { /* ignore */ }
                });
                if (addedAny) {
                    offerCartPersist();
                    var badge = document.getElementById('cartBadge');
                    if (badge) { badge.style.display = 'flex'; badge.innerText = (skh.myCart || []).length; }
                }
            }, function () { /* kimya — mtandao ukirudi onSnapshot itarudia */ });
        } catch (e) { /* ignore */ }
    };

    /* ============================================================
       [NEGO ENGINE 2026-09] COMMERCE CONTEXT ANCHOR + injini ya amri.
       Anchor ndiyo sehemu MOJA inayoonyesha hali ya biashara na vitendo
       halali (spec §27, §28, §38). Inasikiliza `negotiations` za mazungumzo
       haya na oda husika — na inajirekebisha yenyewe.
       ============================================================ */
    skh.negoCurrent = null;   // negotiation ya mazungumzo yaliyofunguliwa
    skh.negoOrder = null;     // oda ya negotiation (authoritative state)
    var negoUnsub = null, negoOrderUnsub = null, negoOrderUnsubFor = null;

    /* [NEGO START CARD 2026-09-15]
       Kadi inayoonekana kabla ya majadiliano kuanza. Inatumia muktadha
       ULIOPO (productCtx/serviceCtx/transportCtx) na kufungua fomu
       ILIYOPO (skhNegoFormOpen). Hakuna negotiation system mpya. */
    /* [NEGO LOCK §21/§22] Cache ya uwekaji wa negotiation wa tangazo (kwa msimu
       huu tu). Kweli iko kwenye doc la tangazo; tunasoma mara moja kwa msimu,
       kisha kadi ya "Bado hamjajadiliana" huonyesha hali ya kufungwa kama
       mmiliki amezima negotiation. Fail-open kwa makosa ya mtandao hapa (kadi
       tu — gate halisi iko MBELE kwenye fomu na kwenye create). */
    var negoAllowedCache = {};
    function negoAllowed(kind, t, cb) {
        var key = kind + ':' + ((t && t.id) || '');
        if (!t || !t.id) { cb(true); return; }
        if (negoAllowedCache[key] !== undefined) { cb(negoAllowedCache[key]); return; }
        if (t.negotiationAllowed !== undefined) {
            negoAllowedCache[key] = t.negotiationAllowed !== false;
            cb(negoAllowedCache[key]); return;
        }
        var col = t.collection || t.collectionName || (kind === 'service' ? 'services' : (kind === 'product' ? 'products' : 'ride_requests'));
        try {
            skh.getDoc(skh.doc(skh.db, col, t.id)).then(function (snap) {
                var allow = true;
                try { allow = !(snap && snap.exists && snap.exists() && (snap.data() || {}).negotiationAllowed === false); } catch (e2) {}
                negoAllowedCache[key] = allow;
                cb(allow);
            }).catch(function () { negoAllowedCache[key] = true; cb(true); });
        } catch (e) { negoAllowedCache[key] = true; cb(true); }
    }
    /* Locked-state: hakuna negotiation, lakini CHAT inabaki inayotumika (§23). */
    function negoIsLocked(kind, t) {
        if (kind === 'product') return false;
        if (!t || !t.id) return false;
        var v = negoAllowedCache[kind + ':' + t.id];
        return v === false;
    }

    function renderStartNegoCard(host) {
        var t = null, kind = null;

        try { t = transportCtx(); if (t && t.id) kind = 'transport'; } catch (e) {}
        if (!kind) { try { t = serviceCtx(); if (t && t.id) kind = 'service'; } catch (e) {} }
        if (!kind) { try { t = productCtx(); if (t && t.id) kind = 'product'; } catch (e) {} }

        if (!kind || !t) { host.style.display = 'none'; host.innerHTML = ''; return; }

        var me = myUid();
        var owner = t.sellerId || t.providerId || null;
        var iAmOwner = !!(me && owner && me === owner);

        var ico = function (n, sz) { return window.skhNavIcon ? window.skhNavIcon(n, sz || 14) : ''; };
        var money = function (v) {
            var n = Number(v);
            if (!isFinite(n) || n <= 0) return 'Maelewano';
            return 'TSh ' + Math.round(n).toLocaleString('en-US');
        };

        var meta = {
            product:   { ic: 'cart',   lbl: 'Bidhaa',  cta: 'Toa Ofa ya Bei' },
            service:   { ic: 'wrench', lbl: 'Huduma',  cta: 'Omba Kadirio / Toa Ofa' },
            transport: { ic: 'truck',  lbl: 'Usafiri', cta: 'Jadili Nauli' }
        }[kind];

        var price = kind === 'transport' ? t.fare : t.price;
        var sub = '';
        if (kind === 'transport' && (t.fromLocation || t.toLocation)) {
            sub = esc(t.fromLocation || '—') + ' &rarr; ' + esc(t.toLocation || '—');
        } else if (t.scope) {
            sub = esc(String(t.scope).slice(0, 60));
        }

        var html = '<div class="ch-startnego">'
            + '<div class="ch-sn-head">' + ico(meta.ic, 13) + ' ' + esc(meta.lbl)
            +   '<span class="ch-sn-tag">Bado hamjajadiliana</span></div>'
            + '<div class="ch-sn-title">' + esc(t.title || meta.lbl) + '</div>'
            + (sub ? '<div class="ch-sn-sub">' + sub + '</div>' : '')
            + '<div class="ch-sn-price">' + esc(money(price)) + '</div>';

        // [NEGO LOCK] Soma hali ya kufungwa BOOL sasa (cache), na usahihisha kwa
        // doc-la-tangazo na re-render kama hali imebadilika — usiozigong workflow.
        var lockedNow = (kind !== 'product') && negoIsLocked(kind, t);
        if (kind !== 'product' && t && t.id) {
            var wasLocked = lockedNow;
            negoAllowed(kind, t, function (allow) {
                // Re-render TU kama kusoma doc kumebadilisha uamuzi (epuka
                // infinite loop — cached callback hufika synchronously).
                try { if ((allow === false) !== wasLocked) renderCommerceAnchor(); } catch (e) {}
            });
        }

        if (lockedNow) {
            html += '<div class="ch-sn-note" data-nego-locked="1">🔒 '
                 +  'Negotiation haijaruhusiwa na mmiliki wa tangazo hili. '
                 +  'Bei iliyotangazwa ndiyo sahihi. Chat inafanya kazi bado.</div>';
        } else if (iAmOwner) {
            html += '<div class="ch-sn-note">' + ico('alert', 12)
                 +  ' Hili ni tangazo lako. Subiri mteja atoe ofa, au tuma ofa yako.</div>'
                 +  '<button type="button" class="ch-sn-btn" onclick="window.skhChatStartNego(\'' + kind + '\')">'
                 +  ico('tag', 14) + ' Tuma Ofa kwa Mteja</button>';
        } else {
            html += '<div class="ch-sn-note">' + ico('shield-check', 12)
                 +  ' Bei ikikubaliwa hapa, inagandishwa na kulindwa na SokoPay.</div>'
                 +  '<button type="button" class="ch-sn-btn" onclick="window.skhChatStartNego(\'' + kind + '\')">'
                 +  ico('tag', 14) + ' ' + esc(meta.cta) + '</button>';
        }
        html += '</div>';

        host.innerHTML = html;
        host.style.display = 'block';
    }

    /* Fichua render ili kadi isasishwe muktadha unapobadilika
       (mf. baada ya startChat kuweka activeChatService/Transport). */
    window.skhChatRefreshNegoCard = function () {
        try { renderCommerceAnchor(); } catch (e) {}
    };

    /** Fungua fomu ya ofa kwa muktadha wa mazungumzo haya */
    window.skhChatStartNego = function (kind) {
        var t = null;
        try {
            t = kind === 'transport' ? transportCtx()
              : kind === 'service'   ? serviceCtx()
              : productCtx();
        } catch (e) {}
        if (!t || !t.id) { skhToast('Hatujapata bidhaa/huduma ya kujadili.', 'info', 3000); return; }
        // [NEGO LOCK §21/§22 — UX halisi] Chat ≠ Negotiation (§23): chat hubaki,
        // lakini ofa hawezi kuanza ikiwa mmiliki wa tangazo amezima. Cache inajulikana
        // hapa tu kama msingi wa ukweli; kadi huchungulia fomu inayorekebisha bado.
        if (kind !== 'product' && negoIsLocked(kind, t)) {
            skhToast('Negotiation haijaruhusiwa kwa tangazo hili. Bei ni ile iliyotangazwa — unaweza kuzungumza bado.', 'info', 4200);
            return;
        }
        if (typeof window.skhNegoFormOpen !== 'function') {
            skhToast('Fomu ya majadiliano haipatikani kwa sasa.', 'error');
            return;
        }
        var entity = Object.assign({}, t, {
            collection: t.collection || t.collectionName ||
                        (kind === 'service' ? 'services' : kind === 'transport' ? 'ride_requests' : 'products'),
            sellerId: t.sellerId || t.providerId || null,
            sellerName: t.sellerName || t.providerName || ''
        });
        window.skhNegoFormOpen({ type: kind, entity: entity });
    };

    function ensureCommerceAnchor() {
        var composer = document.getElementById('chatComposer');
        if (!composer) return null;
        var host = document.getElementById('chatCommerceAnchor');
        if (!host) {
            host = document.createElement('div');
            host.id = 'chatCommerceAnchor';
            host.style.display = 'none';
            composer.parentElement.insertBefore(host, composer);
        }
        return host;
    }

    function updateConvCommerce(convId, patch) {
        if (!convId) return;
        try {
            skh.getDoc(skh.doc(skh.db, 'conversations', convId)).then(function (cs) {
                var rel = (cs && cs.exists && cs.exists()) ? cs.data().related || {} : {};
                var commerce = Object.assign({}, rel.commerce || {}, patch);
                skh.updateDoc(skh.doc(skh.db, 'conversations', convId), { 'related.commerce': commerce }).catch(function () {});
            }).catch(function () {});
        } catch (e) { /* best-effort */ }
    }

    // Mnunuzi: makubaliano yaliyofikiwa → weka kipengee kwenye cart (idempotent).
    var negoCartDone = {};
    try { negoCartDone = JSON.parse(skh.localStorage.getItem('sokohai_nego_cart_done') || '{}') || {}; } catch (e) {}
    function negoCartPersist() { try { skh.localStorage.setItem('sokohai_nego_cart_done', JSON.stringify(negoCartDone)); } catch (e) {} }
    function negoMaybeAddToCart(nego) {
        if (!nego || !nego.negotiationId) return;
        var st = nego.currentState;
        if (st !== 'AGREEMENT' && st !== 'FINAL_AGREEMENT') return;
        if (nego.orderId) return; // oda tayari imefungwa
        if (nego.buyerId !== myUid()) return;
        // [COMMERCE 2026-09] Huduma/usafiri huenda kwenye order/booking yao,
        // SI kwenye cart ya bidhaa (spec §6/§12 — sio Product workflow).
        if (nego.commerceType && nego.commerceType !== 'product') return;
        var ver = nego.agreementVersion || 1;
        var key = nego.negotiationId + '_' + ver;
        if (negoCartDone[key]) return;
        var item = {
            id: nego.productId, title: nego.productTitle || 'Bidhaa',
            price: Number(nego.currentUnitPrice || 0), image: nego.productImage || '',
            qty: Math.max(1, parseInt(nego.quantity, 10) || 1),
            sellerId: nego.sellerId, sellerName: nego.sellerName || '',
            negotiationId: nego.negotiationId, agreementVersion: ver,
            escrowEligible: true, fromOffer: true, addedAt: new Date().toISOString()
        };
        try {
            skh.myCart = (typeof skh.smartCartItems === 'function') ? skh.smartCartItems() : (skh.myCart || []);
            var exists = skh.myCart.some(function (x) {
                return (x.negotiationId && x.negotiationId === nego.negotiationId && x.agreementVersion === ver)
                    || (x.orderId && x.orderId === nego.orderId);
            });
            if (!exists) { skh.myCart.push(item); if (typeof skh.smartCartSave === 'function') skh.smartCartSave(); }
            negoCartDone[key] = true;
            negoCartPersist();
            var badge = document.getElementById('cartBadge');
            if (badge) { badge.style.display = 'flex'; badge.innerText = skh.myCart.length; }
        } catch (e) { /* ignore */ }
    }

    function negoCtx() {
        var nego = skh.negoCurrent || null;
        var me = myUid();
        return {
            iAmBuyer: !!(nego && nego.buyerId === me),
            iAmSeller: !!(nego && nego.sellerId === me),
            order: skh.negoOrder || null
        };
    }

    function renderCommerceAnchor() {
        var host = ensureCommerceAnchor();
        if (!host) return;
        var nego = skh.negoCurrent;
        /* [FIX 2026-09-15] TATIZO LILILOKUWEPO:
           Bila negotiation, anchor ilifichwa KABISA — hivyo mtumiaji
           akichati na mtoa huduma/msafirishaji aliona ujumbe wa kawaida tu
           ("Habari, nimevutiwa na huduma yenu"), bila njia yoyote ya
           kuanzisha majadiliano rasmi.

           Sasa: hakuna negotiation LAKINI kuna muktadha (bidhaa/huduma/
           usafiri) -> onyesha kadi ya KUANZISHA majadiliano. */
        if (!nego) { renderStartNegoCard(host); return; }
        var N = (window.skhNego && window.skhNego) || null;
        var st = nego.currentState || 'DRAFT';
        var label = skhGlossLabel(st, 'nego', (N && N.STATE_LABELS && N.STATE_LABELS[st]) ? N.STATE_LABELS[st] : st);
        var order = skh.negoOrder;
        var ctype = nego.commerceType || 'product';
        var title = (N && N.commerceTitleOf) ? N.commerceTitleOf(nego) : (nego.productTitle || nego.serviceTitle || nego.transportTitle || 'Bidhaa');
        var prefixIco = ctype === 'service' ? 'wrench' : (ctype === 'transport' ? 'truck' : 'cart');
        var prefix = (window.skhNavIcon ? window.skhNavIcon(prefixIco, 13) + ' ' : '') + (ctype === 'service' ? T('anchor_service', 'Huduma #') : (ctype === 'transport' ? T('anchor_trip', 'Safari #') : T('anchor_order', 'Oda #')));
        // [NEGO ENGINE 2026-09] Anchor ni STRIP TULIVU (spec §27–28): hali +
        // oda + malipo + usafirishaji + viungo vya kuangalia/kufuatilia.
        // VITUFE vya majadiliano vinaishi KWENYE kadi ya negotiation NDANI ya chat.
        var html = '<div class="ch-anchor">'
            + '<div class="ch-anchor-head">' + label + ' <span class="ch-anchor-prod">· ' + esc(title) + '</span></div>';
        if (order && order.id) {
            var pay = order.paymentStatus || 'pending';
            var payLabel = (window.skhNavIcon ? window.skhNavIcon(pay === 'paid' ? 'shield-check' : 'clock', 13) + ' ' : '')
                + (pay === 'paid' ? T('anchor_paid', 'Imelipwa (SokoPay Protected)') : T('st_del_PAYMENT_PENDING', 'Inasubiri Malipo'));
            // [COMMERCE 2026-09] Hali ya uwasilishaji/utekelezaji inategemea aina.
            var delLabel = '';
            var del;
            if (ctype === 'service') {
                del = order.serviceStatus || '';
                var sdl = skhGlossLabel(del, 'delivery', (N && N.SERVICE_STATUS_LABELS && N.SERVICE_STATUS_LABELS[del]) ? N.SERVICE_STATUS_LABELS[del] : del);
                delLabel = del ? esc(String(sdl)) : '';
            } else if (ctype === 'transport') {
                del = order.transportStatus || '';
                var tdl = skhGlossLabel(del, 'delivery', (N && N.TRANSPORT_STATUS_LABELS && N.TRANSPORT_STATUS_LABELS[del]) ? N.TRANSPORT_STATUS_LABELS[del] : del);
                delLabel = del ? esc(String(tdl)) : '';
            } else {
                del = order.deliveryStatus || order.status || '';
                if (del && del !== 'payment_pending') {
                    var dl = skhGlossLabel(del, 'delivery', (N && N.ORDER_STATUS_LABELS && N.ORDER_STATUS_LABELS[del]) ? N.ORDER_STATUS_LABELS[del] : del);
                    delLabel = esc(String(dl));
                }
            }
            var oid = String(order.orderId || order.id);
            html += '<div class="ch-anchor-order">' + prefix + esc(oid) + ' · ' + payLabel + (delLabel ? ' · ' + delLabel : '') + '</div>';
            var aIc = function (n) { return window.skhNavIcon ? window.skhNavIcon(n, 14) : ''; };
            html += '<div class="ch-anchor-links">'
                + '<button type="button" class="ch-nego-btn" onclick="window.skhChatViewOrder()">' + aIc('clipboard') + '<span>' + T('ch_view_order', 'Fikia Oda') + '</span></button>'
                + (ctype === 'transport' ? '<button type="button" class="ch-nego-btn" onclick="window.skhChatTrackBooking()">' + aIc('map') + '<span>' + T('ch_track', 'Fuatilia') + '</span></button>' : '')
                + (ctype === 'product' ? '<button type="button" class="ch-nego-btn" onclick="window.skhChatTrackOrder()">' + aIc('map') + '<span>' + T('ch_track', 'Fuatilia') + '</span></button>' : '')
                + '</div>';
            if (order.adjustments && order.adjustments.length) {
                order.adjustments.forEach(function (a) {
                    html += '<div class="ch-anchor-adj">' + aIc('plus') + ' ' + esc(a.productTitle || 'Bidhaa') + ' +' + esc(String(a.quantity || 0))
                        + ' · TSh ' + esc(Number(a.amount || 0).toLocaleString()) + ' · ' + (a.paymentStatus === 'paid' ? (aIc('shield-check') + ' imelipwa') : (aIc('clock') + ' inasubiri malipo')) + '</div>';
                });
            }
        } else if (nego.currentState && N && N.STATE_LABELS) {
            // Bado hakuna oda — onyesha terms za majadiliano kwa ufupi (type-aware).
            // [FIX] commerceTermsHtml = HTML salama (values zimeachiliwa).
            var thtml = (N && N.commerceTermsHtml) ? N.commerceTermsHtml(nego) : [];
            if (thtml.length) {
                html += '<div class="ch-anchor-terms">' + thtml.join(' · ') + '</div>';
            } else {
                var qty = nego.quantity || 1;
                var unit = nego.currentUnitPrice != null ? Number(nego.currentUnitPrice) : null;
                if (unit != null) {
                    html += '<div class="ch-anchor-terms">Kiasi: <b>' + esc(String(qty)) + '</b>'
                        + ' · Bei: <b>TSh ' + esc(unit.toLocaleString()) + '</b>/pc</div>';
                }
            }
        }
        html += '</div>';
        host.style.display = 'block';
        host.innerHTML = html;
    }

    // [SELLER FIX 2026-09] Vuta negotiation kwa IDs za conversation NA kwa jozi ya washiriki
    // ili hata mazungumzo yakianza kwenye muktadha tofauti, ofa ya mnunuzi ifike kwa muuzaji mara moja.
    async function negoFallbackFetch(convId) {
        try {
            var docs = await negoFallbackQuery(convId);
            if (!docs.length) return null;
            docs.sort(negoDocsCmp);
            return docs[0];
        } catch (e) { return null; }
    }
    function negoDocsCmp(a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }
    async function negoFallbackQuery(convId) {
        var me = myUid();
        var partner = (skh.chatCore || {}).partnerUid || skh.currentChatUid;
        var extras = ((skh.chatCore || {}).extraConvIds || lastMergedConvIds || []).slice(0, 9);
        var ids = [convId].concat(extras.filter(function (x) { return x && x !== convId; }));
        var docs = [];
        var seen = {};

        function addDoc(d) {
            if (d && !seen[d.id]) {
                seen[d.id] = true;
                docs.push(Object.assign({}, d.data(), { id: d.id }));
            }
        }

        try {
            var q = skh.query(skh.collection(skh.db, 'negotiations'), skh.where('conversationId', 'in', ids), skh.limit(30));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(addDoc);
        } catch (e) {}

        if (me && partner) {
            try {
                var q1 = skh.query(skh.collection(skh.db, 'negotiations'),
                    skh.where('buyerId', '==', me),
                    skh.where('sellerId', '==', partner),
                    skh.limit(10));
                var snap1 = await skh.getDocs(q1);
                if (snap1 && snap1.forEach) snap1.forEach(addDoc);
            } catch (e1) {}

            try {
                var q2 = skh.query(skh.collection(skh.db, 'negotiations'),
                    skh.where('sellerId', '==', me),
                    skh.where('buyerId', '==', partner),
                    skh.limit(10));
                var snap2 = await skh.getDocs(q2);
                if (snap2 && snap2.forEach) snap2.forEach(addDoc);
            } catch (e2) {}
        }
        return docs;
    }

    // [NEGO DIALOGUE FIX 2026-09] MSIKILIZAJI wa muda halisi:
    // Husikiliza negotiation kupitia conversationId na washiriki (buyer/seller).
    var negoFallbackUnsubs = [];
    function negoFallbackSubscribe(convId) {
        negoFallbackStop();
        try {
            var me = myUid();
            var partner = (skh.chatCore || {}).partnerUid || skh.currentChatUid;
            var extras = ((skh.chatCore || {}).extraConvIds || lastMergedConvIds || []).slice(0, 9);
            var ids = [convId].concat(extras.filter(function (x) { return x && x !== convId; }));

            var handleSnap = function (snap) {
                var docs = [];
                if (snap && snap.forEach) snap.forEach(function (d) { docs.push(Object.assign({}, d.data(), { id: d.id })); });
                if (!docs.length) return;
                docs.sort(negoDocsCmp);
                var n = docs[0];
                var cur = skh.negoCurrent;
                if (!cur || cur.negotiationId !== n.negotiationId || negoNewer(n, cur)) {
                    adoptNego(n, convId);
                }
            };

            var q = skh.query(skh.collection(skh.db, 'negotiations'), skh.where('conversationId', 'in', ids), skh.limit(30));
            var unsub = skh.onSnapshot(q, handleSnap, function () {});
            negoFallbackUnsubs.push(unsub);

            if (me && partner) {
                try {
                    var q1 = skh.query(skh.collection(skh.db, 'negotiations'),
                        skh.where('buyerId', '==', me),
                        skh.where('sellerId', '==', partner),
                        skh.limit(10));
                    var u1 = skh.onSnapshot(q1, handleSnap, function () {});
                    negoFallbackUnsubs.push(u1);
                } catch (e1) {}

                try {
                    var q2 = skh.query(skh.collection(skh.db, 'negotiations'),
                        skh.where('sellerId', '==', me),
                        skh.where('buyerId', '==', partner),
                        skh.limit(10));
                    var u2 = skh.onSnapshot(q2, handleSnap, function () {});
                    negoFallbackUnsubs.push(u2);
                } catch (e2) {}
            }
        } catch (e) {}
    }
    function negoFallbackStop() {
        if (negoFallbackUnsubs && negoFallbackUnsubs.length) {
            negoFallbackUnsubs.forEach(function (u) { try { if (typeof u === 'function') u(); } catch (e) {} });
            negoFallbackUnsubs = [];
        }
    }

    // [ORDER FIX] Hakikisha tunasikiliza oda ya majadiliano (huundwa baada ya
    // makubaliano, hivyo listener ya zamani inaweza kukosa orderId). Inaitwa
    // na adoptNego NA na renderer ya kadi (upande wa muuzaji, snapshot pekee).
    // [COMMERCE 2026-09] Oda inapohamia 'held' (malipo yamelindwa escrow),
    // tuma tukio la mfumo kwenye thread ili Pande ZOTE zione hatua. Mnunuzi
    // ndiye hutuma (ndiye mlipaji); server IPN hufanya kazi ikiwa hayuko mtandaoni.
    var negoPayEventsSent = {};
    function orderPaidSnapshot(order, nego) {
        order = order || {};
        nego = nego || {};
        var kind = order.commerceType || nego.commerceType || 'product';
        var qty = Number(order.quantity != null ? order.quantity : (nego.quantity || 1));
        var unit = Number(order.unitPrice != null ? order.unitPrice
            : (nego.currentUnitPrice != null ? nego.currentUnitPrice : 0));
        var amount = Number(order.amount != null ? order.amount : Math.round(unit * qty));
        var title = order.itemTitle
            || ((window.skhNego && window.skhNego.commerceTitleOf) ? window.skhNego.commerceTitleOf(nego) : 'Oda');
        return {
            orderId: order.orderId || order.id,
            orderNumber: order.orderNumber || null,
            commerceType: kind,
            itemsSummary: { kind: kind, title: title, quantity: qty, unitPrice: unit, amount: amount },
            amount: amount,
            totalAmount: amount,
            currency: order.currency || nego.currency || 'TSh',
            paymentStatus: 'paid',
            status: 'held',
            protected: true,
            paymentProtectedAt: order.paidAt || order.heldAt || nowIso(),
            negotiationId: order.negotiationId || nego.negotiationId || null,
            conversationId: order.conversationId || nego.conversationId || null,
            sellerId: order.sellerId || nego.sellerId || null,
            buyerId: order.buyerId || nego.buyerId || null
        };
    }

    async function maybePostPaymentProtected(order, nego) {
        if (!order || !(order.orderId || order.id)) return;
        var oid = String(order.orderId || order.id);
        if (negoPayEventsSent[oid]) return;
        var me = myUid();
        // Mnunuzi (mlipaji) ndiye hutuma tukio hili kutoka upande wa client.
        if (!nego || nego.buyerId !== me) return;
        var convId = nego.conversationId || (skh.chatCore && skh.chatCore.convId) || order.conversationId;
        if (!convId) return;
        try {
            // Dup-check: server IPN au kifaa kingine kinaweza kuwa keshatuma.
            var existing = false;
            var q = skh.query(skh.collection(skh.db, 'conversations/' + convId + '/messages'),
                skh.where('orderRef.orderId', '==', oid), skh.limit(20));
            var qs = await skh.getDocs(q);
            qs.forEach(function (d) {
                var m = d.data() || {};
                if (m.type === 'order' && m.orderSnapshot && m.orderSnapshot.protected === true) existing = true;
            });
            if (existing) { negoPayEventsSent[oid] = true; return; }
            negoPayEventsSent[oid] = true;
            await sendInternal('', {
                conversationId: convId, partnerUid: nego.sellerId, type: 'order', system: true,
                docId: 'payprot_' + oid,
                order: { orderId: oid, snapshot: orderPaidSnapshot(order, nego) }
            });
        } catch (e) { console.warn('[chat] payment_protected event failed', e); }
    }

    function ensureOrderSubscription(nego) {
        if (!nego || !nego.orderId || !skh.db) return;
        if (negoOrderUnsubFor === nego.orderId && negoOrderUnsub) return;
        if (negoOrderUnsub) { try { negoOrderUnsub(); } catch (e) {} negoOrderUnsub = null; }
        try {
            var oid = nego.orderId;
            // Anza 'false': snapshot ya kwanza ikiwa tayari 'held', hook ya
            // tukio hufanya dup-check yenyewe (server IPN huenda ikeshafunga).
            var wasPaid = false;
            negoOrderUnsubFor = oid;
            negoOrderUnsub = skh.onSnapshot(skh.doc(skh.db, 'orders', oid), function (os) {
                var live = (os && os.exists && os.exists()) ? Object.assign({ id: os.id }, os.data()) : null;
                skh.negoOrder = live;
                if (live && window.skhNego && window.skhNego.orderIsPaid && window.skhNego.orderIsPaid(live)) {
                    // Mara ya KWANZA tu inapoingia 'held' — tuma tukio escrow.
                    if (!wasPaid) maybePostPaymentProtected(live, nego);
                    wasPaid = true;
                } else {
                    wasPaid = !!(live && window.skhNego && window.skhNego.orderIsPaid && window.skhNego.orderIsPaid(live));
                }
                renderCommerceAnchor();
                renderChatStream();
            }, function () { /* ruhusu snapshot ya kadi ibaki */ });
        } catch (e) { /* bila db ya moja kwa moja, snapshot ya kadi inatosha */ }
    }

    function adoptNego(nego, convId) {
        skh.negoCurrent = nego;
        if (nego) {
            negoMaybeAddToCart(nego);
            updateConvCommerce(convId, { negotiationId: nego.negotiationId, productId: nego.productId || null, serviceId: nego.serviceId || null, transportId: nego.transportId || null, commerceType: nego.commerceType || 'product', sellerId: nego.sellerId });
            ensureOrderSubscription(nego);
        }
        renderCommerceAnchor();
        renderChatStream();
        skhNegoMaybeRemind(convId);
    }

    window.skhNegoListen = function (convId) {
        if (!convId || !skh.db) return;
        if (negoUnsub) { try { negoUnsub(); } catch (e) {} negoUnsub = null; }
        if (negoOrderUnsub) { try { negoOrderUnsub(); } catch (e) {} negoOrderUnsub = null; }
        negoFallbackStop();
        negoOrderUnsubFor = null;

        // Vuta na kusikiliza muda halisi kwa conversationId + washiriki (buyer/seller)
        negoFallbackSubscribe(convId);
        negoFallbackFetch(convId).then(function (n) {
            if (n) {
                var cur = skh.negoCurrent;
                if (!cur || cur.negotiationId !== n.negotiationId || negoNewer(n, cur)) adoptNego(n, convId);
            }
        }).catch(function () {});
    };

    // [REMINDER §35] Kumbusha mhusika anayesubiriwa (spec §35) — Firestore-native
    // (hakuna functions): mshiriki yeyote anaweza kugundua majadiliano yamekaa
    // na kumkumbusha mwenzake. Idempotent kupitia `lastReminderAt` + guard ya ndani.
    var negoRemindAttempt = {};
    function skhNegoMaybeRemind(convId) {
        try {
            var N = window.skhNego;
            var nego = skh.negoCurrent;
            if (!N || !nego || !nego.negotiationId || !nego.waitingForUserId) return;
            if (!N.reminderDue || !N.reminderDue(nego, nowIso())) return;
            var lastAttempt = negoRemindAttempt[nego.negotiationId] || 0;
            if (Date.now() - lastAttempt < 60000) return;
            negoRemindAttempt[nego.negotiationId] = Date.now();
            var waitingId = nego.waitingForUserId;
            var core = skh.chatCore || {};
            var cid = convId || core.convId;
            if (!cid || !core.partnerUid) return;
            var lines = N.reminderLines ? N.reminderLines(nego) : ('⏰ Kumbusho — una zamu ya kujibu.');
            // 1) idempotency — andika lastReminderAt (best-effort).
            try {
                skh.updateDoc(skh.doc(skh.db, 'negotiations', nego.negotiationId), {
                    lastReminderAt: nowIso(), lastReminderActorId: myUid()
                }).catch(function () {});
            } catch (e) {}
            // 2) arifa kwa anayesubiriwa (reuse `notifications`) — si kujiarifu mwenyewe.
            if (waitingId !== myUid()) {
                notify(waitingId, '⏰ Kumbusho la Majadiliano', lines, 'negotiation', {
                    negotiationId: nego.negotiationId, conversationId: cid
                });
            }
            // 3) tukio la mfumo kwenye chat (sio ujumbe wa kawaida).
            sendInternal(lines, { conversationId: cid, partnerUid: core.partnerUid, system: true, reminder: true });
        } catch (e) { /* ignore */ }
    }

    /* ================================================================
       [NEGO CLICK FIX 2026-09-17] Root cause: click za majadiliano zilikuwa
       "zikikwama" — mtumiaji anabonyeza Kubali/Counter/Badilisha njia na
       kitafanya chochote kwa sekunde 4-15 (mtandao wa simu: callable ina-
       subiriwa kabisa kabla native fallback; hakuna busy state; na after
       success kadi haichorwi hadi ujumbe wa mfumo umalize kuongezwa).
       1) BUSY GUARD: amri 1 kwa wakati — vitufe vyote vya nego vina-
          disabled mara moja (kuzuia mara-mbili: version conflicts/oda mbili).
       2) TIMEOUT RACE: callable isipojibu ndani ya sekunde 4.5 → native
          fallback papo hapo + _fnMissing[name] ifatiwe ili clicks zinazo-
          fuata ziende native MARA MOJA (bila kusubiri tena).
       3) RENDER-FIRST: mabadiliko yanapoingia, kadi + anchor hutawazwa
          KWANZE — si baada ya rundi la Firestore.
       ================================================================ */
    var _negoCmdBusy = {};
    function negoButtonsDisable(on) {
        try {
            document.querySelectorAll('.ch-nego-btn').forEach(function (b) {
                b.disabled = !!on;
                b.classList.toggle('skh-nego-busy', !!on);
            });
        } catch (e) { /* DOM haipo */ }
    }
    function negoGuardAcquire(key) {
        var at = _negoCmdBusy[key] || 0;
        // Hakikisha guard za zamani (crash ya async) hazifungi milele.
        if (at && (Date.now() - at) < 30000) return false;
        _negoCmdBusy[key] = Date.now();
        negoButtonsDisable(true);
        return true;
    }
    function negoGuardRelease(key) {
        delete _negoCmdBusy[key];
        negoButtonsDisable(false);
    }
    function cfCallRace(name, fn, data) {
        return new Promise(function (resolve, reject) {
            var settled = false;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                // Function haijajibu — itibu kama 'haipo' kwa dakika 10
                // (native path ni mioo kamili ya function).
                try { skh._fnMissing = skh._fnMissing || {}; skh._fnMissing[name] = Date.now(); } catch (e) {}
                try { skh.functionsDown = true; skh.functionsDownSince = skh.functionsDownSince || Date.now(); } catch (e) {}
                var err = new Error('Cloud Functions hazipatikani kwa muda huu (timeout).');
                err.code = 'unavailable';
                err.fnDown = true;
                reject(err);
            }, 4500);
            Promise.resolve(fn(data)).then(
                function (v) { if (settled) return; settled = true; clearTimeout(timer); resolve(v); },
                function (err) { if (settled) return; settled = true; clearTimeout(timer); reject(err); }
            );
        });
    }

    /* ================================================================
       [QUOTA GUARD 2026-09-17] "Quota exceeded" Firestore (free plan sindano)
       ilikuwa ikitimuliwa kama alert("Quota exceeded.") kavu — na click
       inaendelea kugonga server tena (refresh-loop kusogea kwenye zaidi).
       Sasa:
       1) Quota hit → andika `skh._fsQuotaUntil` (backoff 45s), onyesha
          taarifa ya pendo kwa Kiswahili (toast si alert).
       2) Click zote za negotiation kwa muda huo hushindwa MARA MOJA bila
          kugusa network kabisa (hazirudii quota).
       3) Listener refresh HAIJAWASHWA baada ya quota — itasogea kurudi
          lake mara moja quota irudi (hadina haja).
       ================================================================ */
    function isQuotaError(e) {
        if (!e) return false;
        var code = (e.code || '') + ' ' + (e.message || '');
        return /resource-exhausted|quota[_-]?exceeded|quota\s*exceeded|daily\s*limit|beyond\s*limit/i.test(code);
    }
    function quotaGuardHit(e) {
        if (!isQuotaError(e)) return false;
        try { skh._fsQuotaUntil = Date.now() + 45000; } catch (er) {}
        return true;
    }
    function skhQuotaActive() {
        return !!(skh._fsQuotaUntil && Date.now() < skh._fsQuotaUntil);
    }
    function quotaNotice() {
        var msg = T('ch_quota', 'Huduma za server zimepunguzwa kwa muda (quota ya kisasa imefika kikomo). Jaribu tena baada ya dk 1-2.');
        try {
            if (typeof window.sokohaiToast === 'function') window.sokohaiToast(msg, 'warn', 6000);
            else alert(msg);
        } catch (e) {}
    }

    // Amri moja kutoka anchor/vitufe → negotiationAction (server-authoritative).
    window.skhNegoCommand = async function (cmd, payload) {
        if (!skh.requireAuth()) return;
        payload = payload || {};
        var N = window.skhNego || null;
        var nego = skh.negoCurrent || null;
        var negoId = payload.negotiationId || (nego && nego.negotiationId) || null;
        if (!negoId) { alert(T('ch_no_product', 'Hakuna majadiliano ya biashara bado.')); return; }

        // Vitendo vinavyohitaji maelezo zaidi kabla ya kupelekwa server.
        // [_DIRECT FIX 2026-09] `_direct: true` inamaanisha data tayari
        // imekusanywa na fomu/modal — usirudi kwenye modal (kuzuia mzunguko).
        if (!payload._direct) {
            if (cmd === 'COUNTER_OFFER' || cmd === 'COUNTER_QUANTITY_CHANGE') return window.skhNegoOpenCounter({ negotiationId: negoId, mode: cmd === 'COUNTER_QUANTITY_CHANGE' ? 'quantity' : 'offer' });
            if (cmd === 'REQUEST_QUANTITY_CHANGE' || cmd === 'REQUEST_ADDITIONAL_ITEMS') return window.skhNegoOpenQuantity({ negotiationId: negoId, isAdditional: (cmd === 'REQUEST_ADDITIONAL_ITEMS') });
            if (cmd === 'CHANGE_SCOPE' || cmd === 'REQUEST_SCOPE_CHANGE' || cmd === 'COUNTER_SCOPE_CHANGE') return window.skhNegoOpenScope({ negotiationId: negoId, isRequest: (cmd === 'REQUEST_SCOPE_CHANGE'), isCounter: (cmd === 'COUNTER_SCOPE_CHANGE') });
            if (cmd === 'CHANGE_ROUTE' || cmd === 'REQUEST_ROUTE_CHANGE' || cmd === 'COUNTER_ROUTE_CHANGE') return window.skhNegoOpenRoute({ negotiationId: negoId, isRequest: (cmd === 'REQUEST_ROUTE_CHANGE'), isCounter: (cmd === 'COUNTER_ROUTE_CHANGE') });
            if (cmd === 'CREATE_ORDER' || cmd === 'CREATE_BOOKING') return window.skhNegoCreateOrder({ negotiationId: negoId });
        }
        if (cmd === 'SEND_OFFER') return window.skhChatMakeOffer();

        // [NEGO CLICK FIX] amri 1 kwa wakati + busy state la papo hapo.
        var _guardKey = negoId + '::' + cmd;
        if (!negoGuardAcquire(_guardKey)) return;
        // [QUOTA GUARD] Quota imeshika? shindwa MARA moja — usigusi network.
        if (skhQuotaActive()) { negoGuardRelease(_guardKey); quotaNotice(); return; }
        var fn = cfCallable('negotiationAction');
        var core = skh.chatCore || {};
        var commandId = cmd + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        try {
            var r = null;
            if (!fn) throw Object.assign(new Error('NO_FUNCTIONS'), { code: 'unavailable' });
            var res = await cfCallRace('negotiationAction', fn, {
                negotiationId: negoId,
                command: cmd,
                price: payload.price,
                quantity: payload.quantity,
                scope: payload.scope,
                scopeUnit: payload.scopeUnit,
                deadline: payload.deadline,
                location: payload.location,
                requirements: payload.requirements,
                route: payload.route,
                pickupDate: payload.pickupDate,
                pickupTime: payload.pickupTime,
                vehicleType: payload.vehicleType,
                packageDescription: payload.packageDescription,
                packageQuantity: payload.packageQuantity,
                specialRequirements: payload.specialRequirements,
                expectedVersion: payload.expectedVersion != null ? payload.expectedVersion : (nego ? nego.version : null),
                commandId: commandId
            });
            r = res && res.data;
            if (!r || !r.ok) throw Object.assign(new Error((r && r.error) || 'Imeshindwa.'), { code: (r && r.code) || null });
            await negoApplySuccess(r, core);
        } catch (e) {
            if (isFunctionsDown(e)) {
                // FIREBASE-NATIVE fallback — hakuna Cloud Functions.
                var nr = await window.skhNegoNativeCommand(cmd, {
                    negotiationId: negoId, quantity: payload.quantity, price: payload.price,
                    scope: payload.scope, scopeUnit: payload.scopeUnit, deadline: payload.deadline,
                    location: payload.location, requirements: payload.requirements,
                    route: payload.route, pickupDate: payload.pickupDate, pickupTime: payload.pickupTime,
                    vehicleType: payload.vehicleType, packageDescription: payload.packageDescription,
                    packageQuantity: payload.packageQuantity, specialRequirements: payload.specialRequirements
                });
                if (nr && nr.ok) await negoApplySuccess(nr, core);
                return;
            }
            // [QUOTA GUARD] Quota hit: toast yenye maana, bila refresh-loop.
            if (quotaGuardHit(e)) { quotaNotice(); return; }
            var m = (e && e.message) || '';
            // [§19 GENERIC-ALERT FIX 2026-09] Ripoti kiufundi kwa console +
            // ujumbe wa kueleweka wa mtumiaji (si raw Firebase error).
            if (/refresh|imebadilika/i.test(m)) {
                alert(T('ch_offer_stale', 'Ofa hii imebadilika. refresh.'));
            } else if (/^(Imeshindwa|Unknown|Internal error|UNAVAILABLE|FAILED_PRECONDITION|PERMISSION_DENIED)/i.test(m)) {
                if (typeof window.skhReportError === 'function') {
                    window.skhReportError('negotiationAction', e, { cmd: cmd, negotiationId: negoId, commandId: commandId, conversationId: core.convId });
                }
                alert(T('nego_send_fail', 'Ombi hili halikuweza kutumwa. Jaribu tena.'));
            } else {
                alert(m || T('ch_offer_fail', 'Imeshindwa.'));
            }
            if (typeof window.skhNegoListen === 'function') { try { window.skhNegoListen((skh.chatCore || {}).convId); } catch (e2) {} }
        } finally {
            negoGuardRelease(_guardKey);
        }
    };

    // Ujumuishaji wa matokeo ya amri (function au native) — kadi + anchor + chat.
    async function negoApplySuccess(r, core) {
        skh.negoCurrent = r.negotiation || skh.negoCurrent;
        // [NEGO CLICK FIX] Chorwgza kadi + anchor KWANZE (mabadiliko tayari
        // yameingia kutoka function/native); kurushi ujumbe wa mfumo hutawazwa
        // baadaye bila kufanya click ionekane imekufa.
        renderCommerceAnchor();
        renderChatStream();
        if (r.status === 'AGREEMENT' || r.status === 'FINAL_AGREEMENT') negoMaybeAddToCart(r.negotiation || skh.negoCurrent);
        await sendInternal('', {
            conversationId: core.convId, partnerUid: core.partnerUid, type: 'negotiation',
            negotiationId: r.negotiationId || (skh.negoCurrent && skh.negoCurrent.negotiationId),
            nego: { snapshot: r.negotiation || skh.negoCurrent },
            system: true
        });
        renderCommerceAnchor();
        renderChatStream();
        if (r.status === 'ORDER_CREATED') {
            alert(T('ch_order_created', 'Oda imefungwa! Lipia sasa kupitia SokoPay.'));
            if (r.orderId) {
                // [COMMERCE 2026-09] reference type-aware → tracking + oda modal sahihi (spec §9).
                var _n = r.negotiation || skh.negoCurrent || {};
                updateConvCommerce(core.convId, {
                    orderId: r.orderId,
                    commerceType: _n.commerceType || 'product',
                    serviceId: _n.serviceId || null,
                    transportId: _n.transportId || null
                });
                // [COMMERCE 2026-09] Tukio la mfumo: "Oda imefungwa — inasubiri malipo"
                // hutumwa kwenye thread ili pande zote zione hatua (bei iliyogandishwa).
                var _snap = orderEventSnapshotFromNego(r.orderId, _n, false);
                sendInternal('', {
                    conversationId: core.convId, partnerUid: core.partnerUid, type: 'order', system: true,
                    order: { orderId: r.orderId, snapshot: _snap }
                }).catch(function (e) { console.warn('[chat] order_created event failed', e); });
            }
            if (typeof window.skhNegoListen === 'function') window.skhNegoListen(core.convId);
        } else if (r.status === 'REJECTED') {
            alert(T('ch_offer_rejected', 'Ofa imekataliwa.'));
        } else if (r.status === 'EXPIRED') {
            alert(T('ch_offer_expired', 'Ofa imeisha muda wake.'));
        }
    }

    // [NEGO DIALOGUE FIX 2026-09] Counter modal — badala ya prompt mbili
    // zilizokatika, fomu MOJA nzuri inayofuata kanuni: IDADI KWANZA, KISHA
    // BEI, na jumla huhesabiwa papo hapo. Kwa usafiri nauli ni ya safari nzima
    // (bila idadi). Inafunguliwa na muuzaji AU mnunuzi.
    // mode: 'offer' (COUNTER_OFFER) au 'quantity' (COUNTER_QUANTITY_CHANGE).
    window.skhNegoOpenCounter = function (negoRef) {
        if (!skh.requireAuth()) return;
        var nego = skh.negoCurrent || null;
        var negoId = (negoRef && negoRef.negotiationId) || (nego && nego.negotiationId) || null;
        if (!negoId) { alert(T('ch_no_product', 'Hakuna majadiliano bado.')); return; }
        var mode = (negoRef && negoRef.mode) || 'offer';
        var isQty = mode === 'quantity';
        var ctype = (nego && nego.commerceType) || 'product';
        var isTransport = ctype === 'transport';
        // Counter ya ombi la kiasi: chaguo-msingi ni kiasi ALICHOOMBA mnunuzi
        // (pendingQuantity), si cha zamani — server nayo hufanya vivyo hivyo.
        var curQty = (nego && (isQty ? (nego.pendingQuantity != null ? nego.pendingQuantity : nego.quantity) : nego.quantity)) || 1;
        var curPrice = (nego && nego.currentUnitPrice != null) ? nego.currentUnitPrice : '';
        var title = (window.skhNego && window.skhNego.commerceTitleOf)
            ? window.skhNego.commerceTitleOf(nego || {})
            : ((nego && (nego.productTitle || nego.serviceTitle || nego.transportTitle)) || 'Bidhaa');
        var cmd = isQty ? 'COUNTER_QUANTITY_CHANGE' : 'COUNTER_OFFER';
        var ico = function (n, s) { return (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : ''); };
        var headIco = isTransport ? 'truck' : (ctype === 'service' ? 'wrench' : 'package');
        var qtyLabel = ctype === 'service' ? 'Idadi / Vitengo vya kazi' : 'Idadi (Quantity)';

        function counterShell() {
            var old = document.getElementById('skhCounterShell');
            if (old) old.remove();
            var qtyField = isTransport ? ''
                : '<div class="skh-cn-field">'
                + '<label for="skhCnQty">' + ico('hash', 14) + ' ' + esc(T('ch_qty_lbl', qtyLabel)) + ' <span class="skh-cn-req">*</span></label>'
                + '<input id="skhCnQty" type="number" inputmode="numeric" min="1" step="1" value="' + esc(String(curQty || 1)) + '" placeholder="2">'
                + '<div class="skh-cn-err" id="skhCnQtyErr"></div></div>';
            var priceLabel = isTransport ? 'Nauli unayopendekeza (TSh)' : 'Bei unayopendekeza kwa kipande (TSh)';
            var host = document.createElement('div');
            host.innerHTML = '<div class="ch-offer-shell skh-cn-shell" id="skhCounterShell">'
                + '<div class="ch-offer-card skh-cn-card">'
                + '<div class="ch-offer-head skh-cn-head"><b>' + ico(headIco, 17) + ' '
                + esc(isQty ? T('ch_counter_qty', 'Counter ya Kiasi') : T('ch_counter', 'Counter Ofa')) + '</b>'
                + '<button type="button" class="ch-offer-x" aria-label="Funga" onclick="window.skhCounterClose()">' + ico('x', 17) + '</button></div>'
                + '<div class="ch-offer-body skh-cn-body">'
                + '<div class="ch-offer-prod">' + esc(title) + '</div>'
                + qtyField
                + '<div class="skh-cn-field">'
                + '<label for="skhCnPrice">' + ico('wallet', 14) + ' ' + esc(priceLabel) + ' <span class="skh-cn-req">*</span></label>'
                + '<div class="skh-cn-money"><span>TSh</span><input id="skhCnPrice" type="number" inputmode="numeric" min="1" step="100" value="' + esc(String(curPrice || '')) + '" placeholder="68,000"></div>'
                + '<div class="skh-cn-err" id="skhCnPriceErr"></div></div>'
                + (isTransport ? ''
                    : '<div class="skh-cn-total"><span>' + ico('calculator', 14) + ' Jumla</span><b id="skhCnTotal">—</b></div>')
                + '<div class="ch-offer-actions">'
                + '<button type="button" class="ch-offer-btn primary" id="skhCnSend">' + ico('send', 15) + ' ' + esc(T('ch_send', 'Tuma')) + '</button>'
                + '<button type="button" class="ch-offer-btn light" onclick="window.skhCounterClose()">' + esc(T('ch_cancel', 'Ghairi')) + '</button>'
                + '</div></div></div></div>';
            document.body.appendChild(host.firstChild);
        }
        function refreshTotal() {
            var tel = document.getElementById('skhCnTotal');
            if (!tel || isTransport) return;
            var q = parseInt((document.getElementById('skhCnQty') || {}).value, 10);
            var p = parseFloat((document.getElementById('skhCnPrice') || {}).value);
            tel.textContent = (q > 0 && p > 0) ? ('TSh ' + Math.round(q * p).toLocaleString()) : '—';
        }
        function setErr(id, msg) {
            var el = document.getElementById(id);
            if (el) el.textContent = msg || '';
        }
        function submit() {
            var p = parseFloat((document.getElementById('skhCnPrice') || {}).value);
            var q = isTransport ? 1 : parseInt((document.getElementById('skhCnQty') || {}).value, 10);
            var bad = false;
            if (!(p > 0)) { setErr('skhCnPriceErr', T('ch_offer_price_req', 'Weka bei sahihi.')); bad = true; } else setErr('skhCnPriceErr', '');
            if (!isTransport && (!(q > 0) || !Number.isInteger(q) || q < 1)) {
                setErr('skhCnQtyErr', T('ch_qty_req', 'Weka kiasi sahihi (nambari kamili ya 1 au zaidi).')); bad = true;
            } else setErr('skhCnQtyErr', '');
            if (bad) return;
            window.skhCounterClose();
            window.skhNegoCommand(cmd, { negotiationId: negoId, price: p, quantity: q, _direct: true });
        }

        counterShell();
        var qtyEl = document.getElementById('skhCnQty');
        var priceEl = document.getElementById('skhCnPrice');
        if (qtyEl) qtyEl.addEventListener('input', refreshTotal);
        if (priceEl) priceEl.addEventListener('input', refreshTotal);
        var sendBtn = document.getElementById('skhCnSend');
        if (sendBtn) sendBtn.addEventListener('click', submit);
        setTimeout(function () { try { (qtyEl || priceEl).focus(); } catch (e) {} }, 120);
    };
    window.skhCounterClose = function () {
        var s = document.getElementById('skhCounterShell');
        if (s) s.remove();
    };

    // Ombi la kubadilisha kiasi (mnunuzi) — spec §17.
    window.skhNegoOpenQuantity = function (negoRef) {
        if (!skh.requireAuth()) return;
        var nego = skh.negoCurrent || null;
        var negoId = (negoRef && negoRef.negotiationId) || (nego && nego.negotiationId) || null;
        if (!negoId) { alert(T('ch_no_product', 'Hakuna majadiliano bado.')); return; }
        var cur = (nego && nego.quantity) || 1;
        var unit = (nego && nego.currentUnitPrice) || 0;
        window.customPrompt(
            T('ch_qty_change', 'Ongeza Kiasi') + ' — ' + (nego ? (nego.productTitle || 'Bidhaa') : '') + ' (sasa: ' + cur + ')', 'Kiasi kipya, mf. ' + (cur + 1),
            function (val) {
                var q = parseInt(val, 10);
                if (!(q > 0)) { alert(T('ch_qty_req', 'Weka kiasi sahihi.')); return; }
                var cmd = (negoRef && negoRef.isAdditional) ? 'REQUEST_ADDITIONAL_ITEMS' : 'REQUEST_QUANTITY_CHANGE';
                window.skhNegoCommand(cmd, { negotiationId: negoId, quantity: q, _direct: true });
            }
        );
    };

    // Tengeneza oda/booking kutoka makubaliano ya mwisho (spec §23, §12).
    window.skhNegoCreateOrder = async function (negoRef) {
        if (!skh.requireAuth()) return;
        var nego = skh.negoCurrent || null;
        var negoId = (negoRef && negoRef.negotiationId) || (nego && nego.negotiationId) || null;
        if (!negoId) { alert(T('ch_no_product', 'Hakuna majadiliano bado.')); return; }
        var cmd = (nego && nego.commerceType === 'transport') ? 'CREATE_BOOKING' : 'CREATE_ORDER';
        await window.skhNegoCommand(cmd, { negotiationId: negoId, _direct: true });
        // [REQUEST ROUTING 2026-09] Booking hupitia Routing Engine (server):
        // mteja aelekezwe kwenye Token Box/Request flow.
        if (cmd === 'CREATE_BOOKING' && window.sokohaiToast) {
            window.sokohaiToast('Booking imefungwa — SokoHai anatafuta mawakala wanaofaa route yako. Utaona hali kwenye Token Box.', 'success', 4200);
        }
    };

    // [COMMERCE 2026-09] Fomu ya kubadilisha SCOPE ya huduma (spec §8).
    window.skhNegoOpenScope = function (negoRef) {
        if (!skh.requireAuth()) return;
        var nego = skh.negoCurrent || null;
        var negoId = (negoRef && negoRef.negotiationId) || (nego && nego.negotiationId) || null;
        if (!negoId) { alert(T('ch_no_product', 'Hakuna majadiliano bado.')); return; }
        var title = (window.skhNego && window.skhNego.commerceTitleOf) ? window.skhNego.commerceTitleOf(nego) : ((nego && (nego.serviceTitle || nego.productTitle)) || 'Huduma');
        var curScope = (nego && nego.scope) || '';
        var curDeadline = (nego && nego.deadline) || '';
        var curPrice = (nego && nego.currentUnitPrice) || '';
        var isRequest = !!(negoRef && negoRef.isRequest);
        var isCounter = !!(negoRef && negoRef.isCounter);
        window.skhChatOfferClose();
        var host = document.createElement('div');
        host.innerHTML = '<div class="ch-offer-shell" id="skhOfferModalShell">'
            + '<div class="ch-offer-card">'
            + '<div class="ch-offer-head"><b>' + (window.skhNavIcon ? window.skhNavIcon('wrench', 16) : '') + ' ' + T('ch_change_scope', 'Badili Scope') + '</b>'
            + '<button type="button" class="ch-offer-x" aria-label="Funga" onclick="window.skhChatOfferClose()">' + (window.skhNavIcon ? window.skhNavIcon('x', 16) : '') + '</button></div>'
            + '<div class="ch-offer-body">'
            + '<div class="ch-offer-prod">' + esc(title) + '</div>'
            + '<label>' + T('ch_scope_lbl', 'Scope mpya (mf. posters 5)') + '</label>'
            + '<input id="skhScopeField" type="text" maxlength="120" placeholder="' + esc(curScope || 'mf. posters 5') + '">'
            + '<label>' + T('ch_deadline_lbl', 'Mwisho wa kazi (mf. siku 2)') + '</label>'
            + '<input id="skhDeadlineField" type="text" maxlength="60" placeholder="' + esc(curDeadline || 'mf. siku 2') + '">'
            + '<label>' + T('ch_offer_price', 'Bei (TSh)') + '</label>'
            + '<input id="skhScopePrice" type="number" min="1" value="' + esc(String(curPrice || '')) + '">'
            + '<div class="ch-offer-actions">'
            + '<button type="button" class="ch-offer-btn primary" onclick="window.skhNegoScopeSend(' + JSON.stringify(negoId) + ',' + (isCounter ? 1 : 0) + ',' + (isRequest ? 1 : 0) + ')">' + T('ch_send', 'Tuma') + '</button>'
            + '<button type="button" class="ch-offer-btn light" onclick="window.skhChatOfferClose()">' + T('ch_cancel', 'Ghairi') + '</button></div>'
            + '</div></div></div>';
        document.body.appendChild(host.firstChild);
    };

    window.skhNegoScopeSend = function (negoId, isCounter, isRequest) {
        var scopeEl = document.getElementById('skhScopeField');
        var deadlineEl = document.getElementById('skhDeadlineField');
        var priceEl = document.getElementById('skhScopePrice');
        var scope = (scopeEl && scopeEl.value || '').trim();
        var deadline = (deadlineEl && deadlineEl.value || '').trim();
        var price = parseFloat(priceEl && priceEl.value);
        if (!scope && !deadline && !(price > 0)) { alert(T('ch_scope_req', 'Weka scope, deadline au bei.')); return; }
        window.skhChatOfferClose();
        var cmd = isCounter ? 'COUNTER_SCOPE_CHANGE' : (isRequest ? 'REQUEST_SCOPE_CHANGE' : 'CHANGE_SCOPE');
        var payload = { negotiationId: negoId, _direct: true };
        if (scope) payload.scope = scope;
        if (deadline) payload.deadline = deadline;
        if (price > 0) payload.price = price;
        window.skhNegoCommand(cmd, payload);
    };

    // [COMMERCE 2026-09] Fomu ya kubadilisha NJIA ya usafiri (spec §12).
    window.skhNegoOpenRoute = function (negoRef) {
        if (!skh.requireAuth()) return;
        var nego = skh.negoCurrent || null;
        var negoId = (negoRef && negoRef.negotiationId) || (nego && nego.negotiationId) || null;
        if (!negoId) { alert(T('ch_no_product', 'Hakuna majadiliano bado.')); return; }
        var title = (window.skhNego && window.skhNego.commerceTitleOf) ? window.skhNego.commerceTitleOf(nego) : ((nego && (nego.transportTitle || nego.productTitle)) || 'Usafiri');
        var r0 = (nego && nego.route) || {};
        var isRequest = !!(negoRef && negoRef.isRequest);
        var isCounter = !!(negoRef && negoRef.isCounter);
        window.skhChatOfferClose();
        var host = document.createElement('div');
        host.innerHTML = '<div class="ch-offer-shell" id="skhOfferModalShell">'
            + '<div class="ch-offer-card">'
            + '<div class="ch-offer-head"><b>' + (window.skhNavIcon ? window.skhNavIcon('truck', 16) : '') + ' ' + T('ch_change_route', 'Badili Njia') + '</b>'
            + '<button type="button" class="ch-offer-x" aria-label="Funga" onclick="window.skhChatOfferClose()">' + (window.skhNavIcon ? window.skhNavIcon('x', 16) : '') + '</button></div>'
            + '<div class="ch-offer-body">'
            + '<div class="ch-offer-prod">' + esc(title) + '</div>'
            + '<label>' + T('ch_route_from', 'Kutoka (Pickup)') + '</label>'
            + '<input id="skhRouteFrom" type="text" maxlength="80" placeholder="' + esc(r0.from || 'mf. Tabora') + '">'
            + '<label>' + T('ch_route_to', 'Kwenda (Destination)') + '</label>'
            + '<input id="skhRouteTo" type="text" maxlength="80" placeholder="' + esc(r0.to || 'mf. Pangale') + '">'
            + '<label>' + T('ch_route_time', 'Saa ya pickup (mf. 10:00)') + '</label>'
            + '<input id="skhRouteTime" type="text" maxlength="30" placeholder="' + esc((nego && nego.pickupTime) || '') + '">'
            + '<label>' + T('ch_offer_price', 'Nauli (TSh)') + '</label>'
            + '<input id="skhRouteFare" type="number" min="1" value="' + esc(String((nego && nego.currentUnitPrice) || '')) + '">'
            + '<div class="ch-offer-actions">'
            + '<button type="button" class="ch-offer-btn primary" onclick="window.skhNegoRouteSend(' + JSON.stringify(negoId) + ',' + (isCounter ? 1 : 0) + ',' + (isRequest ? 1 : 0) + ')">' + T('ch_send', 'Tuma') + '</button>'
            + '<button type="button" class="ch-offer-btn light" onclick="window.skhChatOfferClose()">' + T('ch_cancel', 'Ghairi') + '</button></div>'
            + '</div></div></div>';
        document.body.appendChild(host.firstChild);
    };

    window.skhNegoRouteSend = function (negoId, isCounter, isRequest) {
        var fromEl = document.getElementById('skhRouteFrom');
        var toEl = document.getElementById('skhRouteTo');
        var timeEl = document.getElementById('skhRouteTime');
        var fareEl = document.getElementById('skhRouteFare');
        var from = (fromEl && fromEl.value || '').trim();
        var to = (toEl && toEl.value || '').trim();
        var time = (timeEl && timeEl.value || '').trim();
        var fare = parseFloat(fareEl && fareEl.value);
        if (!from && !to && !time && !(fare > 0)) { alert(T('ch_route_req', 'Weka njia, saa au nauli.')); return; }
        window.skhChatOfferClose();
        var cmd = isCounter ? 'COUNTER_ROUTE_CHANGE' : (isRequest ? 'REQUEST_ROUTE_CHANGE' : 'CHANGE_ROUTE');
        var payload = { negotiationId: negoId, _direct: true };
        if (from || to) payload.route = { from: from, to: to };
        if (time) payload.pickupTime = time;
        if (fare > 0) payload.price = fare;
        window.skhNegoCommand(cmd, payload);
    };

    // [DELIVERY FLOW 2026-09] Amri ya uwasilishaji (server-authoritative):
    // PREPARE_ORDER (muuzaji) → START_TRANSIT → MARK_DELIVERED →
    // CONFIRM_RECEIPT (mnunuzi). Chat HAIBADILISHI delivery state — inatuma
    // amri kwa negotiationOrderAction na kuonyesha tukio la mfumo tu.
    // [ORDER FALLBACK] Tekeleza amri ya oda kwa Firestore-native transaction
    // Cloud Functions zisipopatikana. Mioo kamili ya negotiationOrderAction
    // kwa kutumia N.applyOrderCommandLocally (logic tupu ya 37-negotiation).
    async function negoOrderCommandNative(cmd, payload, orderId) {
        var N = window.skhNego;
        var me = myUid();
        var now = nowIso();
        var commandId = cmd + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var out = null;
        await skh.runTransaction(skh.db, async function (tx) {
            var ref = skh.doc(skh.db, 'orders', orderId);
            var snap = await tx.get(ref);
            if (!snap || !snap.exists || !snap.exists()) throw new Error('Oda haipatikani.');
            var cur = snap.data();
            if (cur.source !== 'negotiation') throw new Error('Mtiririko huu ni wa oda za majadiliano pekee.');
            var res = N.applyOrderCommandLocally(cur, cmd, me, now);
            if (!res.ok) throw new Error(res.error);
            tx.update(ref, res.patch);
            var evId = (cur.negotiationId || ('order_' + orderId)) + '_' + commandId;
            tx.set(skh.doc(skh.db, 'negotiation_events', evId), Object.assign({
                negotiationId: cur.negotiationId || ('order_' + orderId),
                orderId: orderId, version: (cur.version || 0) + 1, commandId: commandId
            }, res.event));
            out = res; out.base = cur;
        });
        var merged = Object.assign({}, out.base || {}, out.patch);
        skh.negoOrder = Object.assign({ id: orderId }, merged);
        if (out.notification && out.notification.to) {
            notify(out.notification.to, out.notification.title, out.notification.body, 'delivery', { orderId: orderId, command: cmd, event: out.notification.event || null, params: out.notification.params || null });
        }
        return { ok: true, order: skh.negoOrder, stage: out.stage, native: true };
    }

    window.skhNegoOrderCommand = async function (cmd, payload) {
        if (!skh.requireAuth()) return;
        payload = payload || {};
        var order = skh.negoOrder || null;
        var orderId = payload.orderId || (order && (order.orderId || order.id)) || null;
        if (!orderId) { alert(T('ch_no_order', 'Hakuna oda iliyopo kwenye majadiliano haya.')); return; }
        var fn = cfCallable('negotiationOrderAction');
        // [NEGO CLICK FIX] amri 1 kwa wakati + busy state la papo hapo.
        var _guardKey = orderId + '::' + cmd;
        if (!negoGuardAcquire(_guardKey)) return;
        // [QUOTA GUARD] Quota imeshika? shindwa MARA moja — usigusi network.
        if (skhQuotaActive()) { negoGuardRelease(_guardKey); quotaNotice(); return; }
        var commandId = cmd + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        // [FALLBACK] Hakuna Cloud Functions kabisa → njia ya asili moja kwa moja.
        if (!fn) {
            try {
                var nr = await negoOrderCommandNative(cmd, payload, orderId);
                await negoOrderApplied(nr, orderId);
            } catch (e) { alert((e && e.message) || T('ch_offer_fail', 'Imeshindwa.')); }
            finally { negoGuardRelease(_guardKey); }
            return;
        }
        try {
            var res = await cfCallRace('negotiationOrderAction', fn, { orderId: orderId, command: cmd, commandId: commandId });
            var r = res && res.data;
            if (!r || !r.ok) throw new Error((r && r.error) || 'Imeshindwa.');
            skh.negoOrder = r.order || Object.assign({}, skh.negoOrder, { deliveryStatus: r.deliveryStatus, serviceStatus: r.serviceStatus, transportStatus: r.transportStatus, status: r.status });
            await negoOrderApplied({ stage: r.deliveryStatus || r.transportStatus || r.serviceStatus }, orderId);
        } catch (e) {
            if (isFunctionsDown(e)) {
                // Cloud Functions hazijapandikizwa — fallback ya asili.
                try {
                    var nr2 = await negoOrderCommandNative(cmd, payload, orderId);
                    await negoOrderApplied(nr2, orderId);
                    return;
                } catch (e2) { alert((e2 && e2.message) || T('ch_offer_fail', 'Imeshindwa.')); return; }
            }
            // [QUOTA GUARD] Quota hit: toast yenye maana, bila refresh-loop.
            if (quotaGuardHit(e)) { quotaNotice(); return; }
            var m = (e && e.message) || '';
            if (/hairuhusiwi|hali|haijalipwa/i.test(m)) { alert(m); if (typeof window.skhNegoRefresh === 'function') window.skhNegoRefresh(); }
            else alert(m || T('ch_offer_fail', 'Imeshindwa.'));
        } finally {
            negoGuardRelease(_guardKey);
        }
    };

    // Baada ya amri ya oda kufanikiwa (server au native): tukio la mfumo
    // kwenye chat + uchoraji upya + ujumbe wa mwisho.
    async function negoOrderApplied(r, orderId) {
        var core = skh.chatCore || {};
        var nego = skh.negoCurrent || {};
        var o = skh.negoOrder || {};
        var prodTitle = nego.productTitle || nego.serviceTitle || nego.transportTitle || o.itemTitle || 'Bidhaa';
        var stage = r.stage || o.deliveryStatus || o.serviceStatus || o.transportStatus || o.status;
        // [NEGO CLICK FIX] Chorwga mara moja kabla ya rundi la ujumbe wa mfumo.
        renderCommerceAnchor();
        renderChatStream();
        await sendInternal('', {
            conversationId: core.convId, partnerUid: core.partnerUid, type: 'delivery',
            delivery: { deliveryId: orderId, snapshot: { orderId: orderId, kind: 'negotiation_order', cargoName: prodTitle, status: stage, deliveryStatus: stage, commerceType: o.commerceType || nego.commerceType } },
            system: true
        });
        renderCommerceAnchor();
        renderChatStream();
        if (stage === 'confirmed' || stage === 'completed') alert(T('ch_delivery_confirmed', 'Umethibitisha kupokea. Asante!'));
        else if (stage === 'delivered' || stage === 'handover') alert(T('ch_delivered', 'Umewasilisha/kabidhi — mnunuzi athibitishe kupokea.'));
    }

    // AI/NLU ya ndani (spec §29) — inapendekeza TU; haitekelezi.
    window.skhNegoIntentHint = function (text) {
        var host = document.getElementById('chatNegoHint');
        var composer = document.getElementById('chatComposer');
        if (!composer) return;
        if (!host) {
            host = document.createElement('div');
            host.id = 'chatNegoHint';
            composer.parentElement.insertBefore(host, composer);
        }
        var N = window.skhNego;
        var nego = skh.negoCurrent;
        if (!N || !nego || !N.detectIntent) { host.style.display = 'none'; host.innerHTML = ''; return; }
        var ctx = { quantity: nego.quantity, state: nego.currentState, price: nego.currentUnitPrice };
        var intent = N.detectIntent(text, ctx);
        if (!intent) { host.style.display = 'none'; host.innerHTML = ''; return; }
        var label, onclick;
        if (intent.command === 'REQUEST_QUANTITY_CHANGE') {
            label = '➕ Ombi la kiasi: ' + (nego.quantity || 1) + ' → ' + intent.quantity;
            onclick = "window.skhNegoCommand('REQUEST_QUANTITY_CHANGE', { negotiationId: '" + jsEsc(nego.negotiationId) + "', quantity: " + intent.quantity + " })";
        } else if (intent.command === 'COUNTER_OFFER') {
            label = '' + (window.skhNavIcon?window.skhNavIcon('wallet',14):'') + 'Pendekeza bei: TSh ' + Number(intent.price).toLocaleString();
            onclick = "window.skhNegoCommand('COUNTER_OFFER', { negotiationId: '" + jsEsc(nego.negotiationId) + "', price: " + intent.price + " })";
        } else if (intent.command === 'ACCEPT_OFFER') {
            label = '' + (window.skhNavIcon?window.skhNavIcon('handshake',14):'') + 'Kubali ofa iliyopo';
            onclick = "window.skhNegoCommand('ACCEPT_OFFER', { negotiationId: '" + jsEsc(nego.negotiationId) + "' })";
        } else { host.style.display = 'none'; host.innerHTML = ''; return; }
        host.style.display = 'block';
        host.innerHTML = '<div class="ch-nego-hint"><span>💡 ' + T('ch_nego_detected', 'Nimegundua') + ':</span>'
            + '<button type="button" onclick="' + onclick + '">' + label + '</button>'
            + '<button type="button" class="x" onclick="document.getElementById(\'chatNegoHint\').style.display=\'none\'" aria-label="Funga">' + (window.skhNavIcon ? window.skhNavIcon('x',16) : '') + '</button></div>';
    };

    window.skhNegoRefresh = function () {
        // [QUOTA GUARD] Quota ikiwa haijarudi, usifungue listener mpya —
        // ingeongeza reads dhidi ya quota ambayo imeshaka kikomo.
        if (skhQuotaActive()) return;
        var core = skh.chatCore || {};
        if (core.convId) window.skhNegoListen(core.convId);
    };

    /* ============================================================
       PHASE 9 — MEDIA (image / video / voice / docs).
       Inatumia Cloudinary ILIYOPO (skhUploadFromFile) — hakuna mpya.
       Ukubwa/aina huthibitishwa; kushindwa → retry kwa kugonga tena.
       ============================================================ */
    function mediaTypeOf(file) {
        var t = String(file.type || '').toLowerCase();
        var n = String(file.name || '').toLowerCase();
        if (t.indexOf('image/') === 0) return 'image';
        if (t.indexOf('video/') === 0 || /\.(mp4|webm|ogg|mov)$/i.test(n)) return 'video';
        if (t.indexOf('audio/') === 0 || /\.(m4a|mp3|wav|webm|ogg)$/i.test(n)) return 'audio';
        return 'file';
    }

    window.skhChatAttachMedia = async function (url, type, meta) {
        if (!url) return { ok: false };
        var core = skh.chatCore || {};
        var partnerUid = core.partnerUid || skh.currentChatUid;
        var convId = core.convId;
        if (convId && partnerUid) {
            return sendInternal('', { type: type || 'file', mediaReference: url, mediaMeta: meta || {} });
        }
        // Fallback: legacy chats (bila conversation iliyofunguliwa)
        try {
            await skh.addDoc(skh.collection(skh.db, 'chats'), {
                text: ' Attachment: ' + url,
                sender: (skh.currentUser && skh.currentUser.email) || '',
                receiver: skh.currentChatEmail || '',
                senderUid: myUid(), receiverUid: partnerUid || null,
                createdAt: nowIso()
            });
        } catch (e) { /* ignore */ }
        return { ok: true, legacy: true };
    };

    window.skhChatAttachFile = async function (file) {
        if (!file) return;
        var type = mediaTypeOf(file);
        var MAX = { image: 8 * 1024 * 1024, video: 25 * 1024 * 1024, audio: 15 * 1024 * 1024, file: 10 * 1024 * 1024 };
        var max = MAX[type] || MAX.file;
        if (file.size > max) {
            alert(T('ch_media_too_big', 'Faili kubwa sana.', { size: Math.round(max / 1024 / 1024) }));
            return;
        }
        alert(T('ch_uploading', 'Inapakia...'));
        try {
            var opts = (type === 'audio' || type === 'video') ? { resourceType: 'video' } : undefined;
            var up = await window.skhUploadFromFile(file, opts);
            var url = up && up.data && up.data.secure_url;
            if (!url) throw new Error('no url');
            await window.skhChatAttachMedia(url, type, { kind: type, size: file.size, mime: file.type, name: file.name });
        } catch (e) {
            alert(T('ch_media_fail', 'Imeshindwa kupakia. Jaribu tena.'));
        }
    };

    // [PHASE 9] File attach ya zamani inaelekezwa kwenye mfumo mpya.
    const _legacyHandleChatFileUpload = window.handleChatFileUpload;
    window.handleChatFileUpload = async function (e) {
        var file = e && e.target && e.target.files && e.target.files[0];
        if (file && skh.chatCore && skh.chatCore.convId) {
            await window.skhChatAttachFile(file);
            if (e && e.target) e.target.value = '';
            return;
        }
        if (_legacyHandleChatFileUpload) return _legacyHandleChatFileUpload(e);
    };

    // [PHASE 9] Rekodi ya sauti inaelekezwa kwenye mfumo mpya.
    window.toggleVoiceRecord = async function () {
        var btn = document.getElementById('voiceBtn');
        if (!btn) return;
        if (!skh.isRecording) {
            try {
                var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                var rec = new MediaRecorder(stream);
                skh.mediaRecorder = rec; skh.audioChunks = [];
                rec.ondataavailable = function (ev) { if (ev.data.size > 0) skh.audioChunks.push(ev.data); };
                rec.onstop = async function () {
                    try {
                        var blob = new Blob(skh.audioChunks, { type: 'audio/webm' });
                        var up = await window.skhUploadFromFile(blob, { resourceType: 'video' });
                        var url = up && up.data && up.data.secure_url;
                        if (url) await window.skhChatAttachMedia(url, 'audio', { kind: 'audio', size: blob.size, mime: 'audio/webm' });
                    } catch (e) { alert(T('ch_voice_fail', 'Imeshindwa kutuma sauti.')); }
                    skh.isRecording = false;
                    btn.style.color = ''; btn.innerText = '';
                };
                rec.start(); skh.isRecording = true;
                btn.style.color = 'red';
                alert(T('ch_recording', 'Inarekodi... gonga tena kutuma.'));
            } catch (err) {
                alert(T('ch_mic', 'Ruhusu kipaza sauti kwanza.'));
            }
        } else {
            try { skh.mediaRecorder.stop(); } catch (e) { skh.isRecording = false; }
        }
    };

    /* ============================================================
       PHASE 10 — SEARCH + PAGINATION (inbox + ujumbe).
       ============================================================ */
    var inboxQuery = '';
    window.skhChatInboxSearch = function (q) {
        inboxQuery = String(q || '').trim().toLowerCase();
        renderInbox();
    };
    function filterInbox(items) {
        if (!inboxQuery) return items;
        return items.filter(function (it) {
            var hay = String((it.name || '') + ' ' + (it.preview || '') + ' ' + (it.type || '')).toLowerCase();
            return hay.indexOf(inboxQuery) !== -1;
        });
    }

    var msgSearch = '';
    window.skhChatSearchMessages = function (q) {
        msgSearch = String(q || '').trim().toLowerCase();
        var core = skh.chatCore; if (!core) return;
        var chatDiv = document.getElementById('chatMessages');
        if (chatDiv) chatDiv.innerHTML = renderMessageList(filteredMsgs(core.msgs || []), core.conv || {});
    };
    function filteredMsgs(msgs) {
        if (!msgSearch) return msgs;
        return msgs.filter(function (m) {
            if (m.deletedAt) return false;
            var hay = String((m.text || '') + ' ' + (m.senderName || '')).toLowerCase();
            if (m.productSnapshot) hay += ' ' + String(m.productSnapshot.title || '').toLowerCase();
            if (m.orderSnapshot) hay += ' ' + String(m.orderSnapshot.orderId || '').toLowerCase();
            if (m.deliverySnapshot) hay += ' ' + String(m.deliverySnapshot.cargoName || '').toLowerCase();
            if (m.offerSnapshot) hay += ' ' + String(m.offerSnapshot.productTitle || '').toLowerCase();
            return hay.indexOf(msgSearch) !== -1;
        });
    }

    var msgLimit = 300;
    window.skhChatLoadOlder = function () {
        msgLimit += 200;
        var core = skh.chatCore; if (!core || !core.convId) return;
        listen(core.convId);
    };
})();

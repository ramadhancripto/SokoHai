/* ==== js/app/35-comments.js ====
   SOKOHAI — PUBLIC COMMENTS (Phase 7)
   ------------------------------------------------------------
   Mkakati (ADDITIVE, haubadili mifumo iliyopo):
   - Maoni ya umma yanaishi kwenye collection MPYA `comments`
     (sio tena array isiyo na kikomo kwenye product doc).
   - Uchapishaji hupitia server `commentsPublish` (rate-limit,
     verifiedPurchase/authorVerified/authorRole ni SERVER-ONLY).
   - Like/unlike hupitia server `commentsLike` (likeCount server-side).
   - Edit/delete OWN huandika moja kwa moja (rules za author pekee).
   - Sehemu ya "Maoni" (reviews) ya zamani kwenye product modal
     HAIGUSWI — tunaongeza sehemu MPYA "Maswali & Majibu" chini yake.
   - Arifa: tunatumia mfumo ULIOPO (skhEngageSendNotif) — hakuna mpya.
   ============================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

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
        return 'Mteja';
    }
    function truncate(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function fmtDate(iso) {
        try { var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(); } catch (e) { return ''; }
    }

    function notify(uid, title, body, type, meta) {
        if (!uid) return Promise.resolve();
        if (typeof window.skhEngageSendNotif === 'function') {
            try { return window.skhEngageSendNotif(uid, title, body, type || 'comment', meta || {}); } catch (e) {}
        }
        try {
            return skh.addDoc(skh.collection(skh.db, 'notifications'), Object.assign({
                userId: uid, title: title, body: body, createdAt: nowIso(), read: false, type: type || 'comment'
            }, meta || {}));
        } catch (e) { return Promise.resolve(); }
    }

    function cfCallable(name) {
        // [FUNCTIONS RESILIENCE] pita kwenye wrapper wa bootstrap (huweka alama
        // ya fnDown + ujumbe wa Kiswahili); kwenye mazingira ya majaribio/stub
        // ambapo wrapper haipo, tumia callable ya moja kwa moja.
        try {
            if (typeof skh.wrapCallable === 'function') return skh.wrapCallable(name);
            return skh.httpsCallable(skh.getFunctions(skh.fApp, 'europe-west1'), name);
        } catch (e) { return null; }
    }

    // ---------- Hali ya maoni ----------
    var C = {
        targetType: 'product', targetId: null, product: null,
        sellerId: null, sellerName: '', sort: 'relevant',
        items: [], liked: {}, limit: 20, total: 0,
        replyingTo: null, attachProduct: false, loaded: false
    };

    function avatar(photo, name, size) {
        if (typeof window.skhUserAvatar === 'function') return window.skhUserAvatar(photo, name, size || 34);
        var nm = esc((name || 'M').charAt(0).toUpperCase());
        return '<span style="display:inline-flex;width:' + (size || 34) + 'px;height:' + (size || 34) + 'px;border-radius:50%;background:#00509d;color:#fff;align-items:center;justify-content:center;font-weight:800;">' + nm + '</span>';
    }

    // [MAONI 2026-09] Root ya maoni sasa inaishi ndani ya MAONI SHEET
    // (paneli ya chini/upande inayofunguka juu ya tangazo), si chini ya
    // ukurasa mzima wa bidhaa.
    function relocateReviews(host) {
        // [MAONI 2026-09] Tathmini/ratings ni sehemu ya Maoni — hamisha
        // bloki ya tathmini (iliyoandaliwa na 39-showcase) ndani ya sheet,
        // juu ya orodha ya maoni. Wiring yake ya zamani inaendelea kufanya
        // kazi (element inatafutwa kwa id).
        var rev = document.getElementById('pmReviewsSec');
        if (!rev) return;
        if (rev.parentNode !== host) {
            rev.classList.add('maoni-reviews');
            host.insertBefore(rev, host.firstChild);
        }
    }
    function ensureRoot() {
        var root = document.getElementById('skhCommentsRoot');
        var host = document.getElementById('maoniSheetBody');
        if (!host) {
            // Njia ya zamani ikiwa sheet haijapakizwa.
            host = document.querySelector('#productModal .comments-section');
        }
        if (!host) return root || null;
        if (host.id === 'maoniSheetBody') relocateReviews(host);
        if (root) {
            // Hakikisha root imo ndani ya host sahihi.
            if (root.parentNode !== host) {
                host.appendChild(root);
                if (host.id === 'maoniSheetBody') relocateReviews(host);
            }
            return root;
        }
        root = document.createElement('div');
        root.id = 'skhCommentsRoot';
        root.className = 'skh-comments';
        host.appendChild(root);
        return root;
    }

    // Aina ya lengo kulingana na tangazo (bidhaa/huduma/usafiri).
    function targetTypeOf(p) {
        var col = (p && (p.collectionName || p.collection)) || 'products';
        if (col === 'services') return 'service';
        if (col === 'drivers') return 'transport';
        return 'product';
    }

    function resetState(p) {
        C.targetType = targetTypeOf(p);
        C.targetId = p.id;
        C.product = p;
        C.sellerId = p.userId || p.sellerId || null;
        C.sellerName = p.ownerName || p.sellerName || '';
        C.sort = 'relevant';
        C.items = []; C.liked = {}; C.limit = 20; C.total = 0;
        C.replyingTo = null; C.attachProduct = false; C.loaded = false;
        // [MAONI 2026-09] Ushahidi wa oda/usafirishaji + midia inayosubiri.
        C.pendingMedia = [];
        C.eligibility = { order: null, delivery: null, checked: false, checking: false };
    }

    // ---------- Kuchukua maoni ----------
    async function fetchComments() {
        var q = skh.query(skh.collection(skh.db, 'comments'), skh.where('targetId', '==', C.targetId), skh.limit(200));
        var snap = await skh.getDocs(q);
        var list = [];
        if (snap && snap.forEach) snap.forEach(function (d) {
            var c = Object.assign({ id: d.id }, d.data());
            if (c.targetType === C.targetType) list.push(c);
        });
        // zile ambazo ni replies za top-level zinakaa chini ya mzazi
        var tops = [], byParent = {};
        list.forEach(function (c) {
            if (!c.parentId) tops.push(c);
            else { var key = c.rootId || c.parentId; (byParent[key] = byParent[key] || []).push(c); }
        });
        // panga
        var score = function (c) {
            return (c.likeCount || 0) + (c.replyCount || 0) * 2 + (c.verifiedPurchase ? 3 : 0);
        };
        tops.sort(function (a, b) {
            if (C.sort === 'newest') return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            if (C.sort === 'liked') return (b.likeCount || 0) - (a.likeCount || 0);
            var s = score(b) - score(a);
            if (s !== 0) return s;
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });
        Object.keys(byParent).forEach(function (k) {
            byParent[k].sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
        });
        C.items = tops; C.byParent = byParent;
        C.total = tops.length;
        // [COMMENTS POLISH] Idadi ya MAONI YOTE (maswali + majibu) kwa beji.
        var replies = 0;
        Object.keys(byParent).forEach(function (k) { replies += byParent[k].length; });
        C.allCount = tops.length + replies;
    }

    // [COMMENTS POLISH] Sasisha kaunta za maoni katika kadi ya bidhaa
    // (duara la hero na kichwa cha sehemu) — kutoka collection halisi.
    function syncCommentCounts() {
        var n = (typeof C.allCount === 'number') ? C.allCount : C.total;
        ['pmCommentsCount', 'pmCommentsTitleCount'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.textContent = n;
        });
        var tN = document.getElementById('skhCmPanelCount');
        if (tN) tN.textContent = n;
    }

    // [MAONI 2026-09] Hakuna tena paneli iliyofichwa chini ya tangazo —
    // Maoni hufunguka kama SHEET ya juu (bottom sheet / side panel).
    function setupPanelToggle() { /* kazi imehamia skhOpenMaoni (sheet) */ }

    // Fungua sheet ya Maoni na uhakikishe data imepakia (mvivu — si kabla).
    window.skhOpenMaoni = async function () {
        var p = skh.currentOpenProduct;
        if (!p || !p.id) return;
        var layer = document.getElementById('maoniLayer');
        var root = ensureRoot();
        if (!layer || !root) return;
        layer.hidden = false;
        // ruhusu onyesho kisha ongeza class ya uhuishaji
        requestAnimationFrame(function () { layer.classList.add('is-open'); });
        if (!C.loaded || C.targetId !== p.id) {
            await window.skhCommentsOpen(p, { open: true });
        } else {
            render();
        }
        checkEligibility();
        setTimeout(function () {
            var inp = document.getElementById('skhCommentInput');
            if (inp) { try { inp.focus(); } catch (e) {} }
        }, 320);
    };

    window.skhCloseMaoni = function () {
        var layer = document.getElementById('maoniLayer');
        if (!layer) return;
        layer.classList.remove('is-open');
        setTimeout(function () { layer.hidden = true; }, 220);
    };

    // Wajibu wa zamani (39-skHHeroComments na sehemu nyingine) -> elekeza sheet.
    window.skhCommentsToggle = function (forceOpen) {
        if (forceOpen === false) window.skhCloseMaoni();
        else window.skhOpenMaoni();
    };

    // Bofyo nje ya sheet (scrim) huifunga — binder ya mara moja.
    document.addEventListener('DOMContentLoaded', function () {
        var layer = document.getElementById('maoniLayer');
        if (!layer) return;
        layer.addEventListener('click', function (e) {
            if (e.target && e.target.classList && e.target.classList.contains('maoni-scrim')) {
                window.skhCloseMaoni();
            }
        });
    });
    // Escape nayo huifunga sheet (isifunge modali nzima).
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var layer = document.getElementById('maoniLayer');
        if (layer && !layer.hidden && layer.classList.contains('is-open')) {
            e.stopPropagation();
            window.skhCloseMaoni();
        }
    }, true);

    // [USHAHIDI WA KWELI] Uliza server kama mhusika ana oda/usafirishaji
    // uliothibitishwa kwa tangazo hili (ili kuweka alama za kweli tu).
    async function checkEligibility() {
        var p = skh.currentOpenProduct;
        if (!p || C.eligibility.checked || C.eligibility.checking) return;
        C.eligibility.checking = true;
        var fn = cfCallable('commentsEvidence');
        if (fn) {
            try {
                var res = await fn({ targetType: C.targetType, targetId: C.targetId });
                var d = (res && res.data) || {};
                C.eligibility = { order: d.order || null, delivery: d.delivery || null, checked: true, checking: false };
            } catch (e) {
                // Server isipopatikana: USIDANGANYE — usiwezeshe ushahidi.
                C.eligibility = { order: null, delivery: null, checked: true, checking: false };
            }
        } else {
            C.eligibility = { order: null, delivery: null, checked: true, checking: false };
        }
        render();
    }

    // Chagua faili ya picha/video (ushahidi) — upload hufanyika wakati wa kutuma.
    window.skhMaoniPickMedia = function () {
        if (!skh.requireAuth()) return;
        var inp = document.getElementById('skhCmFileInput');
        if (inp) inp.click();
    };
    window.skhMaoniFileChosen = function (input) {
        var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
        files.slice(0, 4 - C.pendingMedia.length).forEach(function (f) {
            var isImg = /^image\//.test(f.type);
            var isVid = /^video\//.test(f.type);
            if (!isImg && !isVid) return;
            var previewUrl = '';
            try { previewUrl = URL.createObjectURL(f); } catch (e) {}
            C.pendingMedia.push({ file: f, previewUrl: previewUrl, isVideo: isVid });
        });
        input.value = '';
        render();
    };
    window.skhMaoniRemoveMedia = function (i) {
        var m = C.pendingMedia[i];
        if (m && m.previewUrl) { try { URL.revokeObjectURL(m.previewUrl); } catch (e) {} }
        C.pendingMedia.splice(i, 1);
        render();
    };

    async function fetchMyLikes() {
        var me = myUid();
        C.liked = {};
        if (!me) return;
        try {
            var q = skh.query(skh.collection(skh.db, 'commentLikes'), skh.where('userId', '==', me), skh.limit(200));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) {
                var data = d.data();
                if (data && data.commentId) C.liked[data.commentId] = true;
            });
        } catch (e) { /* ignore */ }
    }

    // ---------- Uchoraji ----------
    // Beji hizi hubandikwa na SERVER tu (commentsPublish) kamwe na browser.
    function badgeVerifiedPurchase() {
        return '<span class="skh-cm-badge vp" title="' + T('cm_verified_order', 'Ana oda halisi iliyokamilika ya tangazo hili') + '"> ' + T('cm_verified_order_lbl', 'Oda Imethibitishwa') + '</span>';
    }
    function badgeVerifiedDelivery() {
        return '<span class="skh-cm-badge vd" title="' + T('cm_verified_delivery', 'Usafirishaji/uwasilishaji umethibitishwa kwenye mifumo ya SokoHai') + '"> ' + T('cm_verified_delivery_lbl', 'Delivery Imethibitishwa') + '</span>';
    }
    function badgeVerifiedAuthor() {
        return '<span class="skh-cm-badge ver" title="' + T('cm_verified', 'Akaunti imethibitishwa') + '"> ' + T('cm_verified', 'Imethibitishwa') + '</span>';
    }
    function badgeSeller() {
        return '<span class="skh-cm-badge seller">' + T('cm_seller', 'MUUZAJI') + '</span>';
    }

    function productCardHtml(pr) {
        if (!pr || !pr.id) return '';
        var price = (pr.price != null) ? 'TSh ' + Number(pr.price).toLocaleString() : '';
        return '<div class="skh-cm-prodcard" onclick="if(window.openProduct)window.openProduct(\'' + jsEsc(pr.id) + '\', \'' + jsEsc(pr.collection || 'products') + '\')">'
            + (pr.image ? '<img src="' + esc(pr.image) + '" onerror="this.style.display=\'none\'">' : '')
            + '<div><b>' + esc(pr.title || 'Bidhaa') + '</b>' + (price ? '<span>' + esc(price) + '</span>' : '') + '<em>' + T('cm_view_product', 'Tazama ->') + '</em></div></div>';
    }

    function commentHtml(c, isReply) {
        var me = myUid();
        var own = c.authorId === me;
        var isSeller = c.authorId === C.sellerId || c.authorRole === 'seller';
        var deleted = !!c.deletedAt;
        var replyTo = '';
        if (isReply && c.parentId && c.rootId && c.parentId !== c.rootId) {
            var all = [];
            (C.items || []).forEach(function (t) { all.push(t); (C.byParent[t.id] || []).forEach(function (r) { all.push(r); }); });
            var parent = all.filter(function (x) { return x.id === c.parentId; })[0];
            if (parent) replyTo = '<span class="skh-cm-replyto">↳ @' + esc(parent.authorName || '') + '</span>';
        }
        var badges = '';
        if (!deleted) {
            if (isSeller) badges += badgeSeller();
            // [MAONI 2026-09] Alama za kweli za ODA/DELIVERY (server-only).
            var deliveryOk = !!(c.verifiedDelivery || (c.evidence && c.evidence.kind === 'delivery'));
            var orderOk = !!(c.verifiedPurchase || (c.evidence && c.evidence.kind === 'order'));
            if (deliveryOk) badges += badgeVerifiedDelivery();
            else if (orderOk) badges += badgeVerifiedPurchase();
            else if (c.authorVerified) badges += badgeVerifiedAuthor();
        }
        function evidenceMediaHtml(media) {
            if (!media || !media.length) return '';
            var cells = media.map(function (u) {
                var isVid = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(String(u)) || /video\/upload/.test(String(u));
                if (isVid) return '<video src="' + esc(u) + '" controls preload="metadata"></video>';
                return '<img src="' + esc(u) + '" loading="lazy" alt="Picha ya ushahidi" onclick="window.open(\'' + jsEsc(u) + '\',\'_blank\')">';
            }).join('');
            return '<div class="skh-cm-evidence">' + cells + '</div>';
        }
        var body = deleted
            ? '<span class="skh-cm-deleted">' + (window.skhNavIcon ? window.skhNavIcon('x', 12) : '') + ' ' + T('cm_deleted', 'Maoni yamefutwa') + '</span>'
            : ('<span class="skh-cm-text">' + esc(c.text || '') + '</span>'
                + (badges ? '<div class="skh-cm-badges">' + badges + '</div>' : '')
                + evidenceMediaHtml(c.media) + productCardHtml(c.productRef));
        var liked = !!C.liked[c.id];
        var actions = deleted ? '' : '<div class="skh-cm-actions">'
            + '<button type="button" class="' + (liked ? 'on' : '') + '" onclick="window.skhCommentsLike(\'' + jsEsc(c.id) + '\')"><span class="skh-cm-like-ic">' + (window.skhNavIcon ? window.skhNavIcon('heart', 13) : '') + '</span> ' + (c.likeCount || 0) + '</button>'
            + '<button type="button" onclick="window.skhCommentsReply(\'' + jsEsc(c.id) + '\')">' + T('cm_reply', 'Jibu') + '</button>'
            + (own ? '<button type="button" onclick="window.skhCommentsEdit(\'' + jsEsc(c.id) + '\')">' + T('cm_edit', 'Hariri') + '</button>' : '')
            + (own ? '<button type="button" onclick="window.skhCommentsDelete(\'' + jsEsc(c.id) + '\')">' + T('cm_delete', 'Futa') + '</button>' : '')
            + (!own ? '<button type="button" onclick="window.skhCommentsReport(\'' + jsEsc(c.id) + '\')">' + T('cm_report', 'Ripoti') + '</button>' : '')
            + '</div>';
        return '<div class="skh-cm-item' + (isReply ? ' reply' : '') + '" data-cid="' + esc(c.id) + '">'
            + '<div class="skh-cm-head">' + avatar(c.authorPhoto, c.authorName, 32)
            + '<div class="skh-cm-who"><b>' + esc(c.authorName || 'Mteja') + '</b>' + replyTo
            + '<span class="skh-cm-time">' + fmtDate(c.createdAt) + (c.editedAt ? ' · ' + T('cm_edited', 'imehaririwa') : '') + '</span></div></div>'
            + body + actions
            + '</div>';
    }

    function render() {
        var root = ensureRoot();
        if (!root) return;
        syncCommentCounts();
        // [MAONI 2026-09] Kichwa cha sheet hupatikana pia nje ya root.
        var headCount = document.getElementById('skhCmPanelCount');
        if (headCount) headCount.textContent = C.total ? '(' + C.total + ')' : '';
        var elig = C.eligibility || {};
        var canEvidence = !!(elig.order || elig.delivery);
        var playSvg = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>';
        var pendingChips = C.pendingMedia.map(function (m, i) {
            var inner = m.isVideo
                ? (playSvg + '<small>video</small>')
                : (m.previewUrl ? '<img src="' + esc(m.previewUrl) + '" alt="">' : '');
            return '<span class="skh-cm-chip' + (m.isVideo ? ' vid' : '') + '">' + inner
                + '<button type="button" aria-label="Ondoa" onclick="window.skhMaoniRemoveMedia(' + i + ')">&times;</button></span>';
        }).join('');
        var eligNote = elig.checking
            ? '<span class="skh-cm-elig checking">Inakagua oda/usafirishaji…</span>'
            : (elig.delivery
                ? '<span class="skh-cm-elig delivery">&#10003; ' + T('cm_you_can_delivery', 'Una delivery iliyothibitishwa — ongeza picha/video ya uwasilishaji.') + '</span>'
                : (elig.order
                    ? '<span class="skh-cm-elig order">&#10003; ' + T('cm_you_can_order', 'Una oda iliyothibitishwa — ongeza picha/video ya bidhaa.') + '</span>'
                    : (elig.checked ? '<span class="skh-cm-elig none">' + T('cm_elig_none', 'Picha/video huruhusiwa baada ya oda/usafirishaji kuthibitishwa.') + '</span>' : '')));
        var html = '<div class="skh-cm-headbar">'
            + '<h5>' + T('cm_title', 'Maoni') + ' <span id="skhCmCount">(' + C.total + ')</span></h5>'
            + '<div class="skh-cm-sort">'
            + sortBtn('relevant', 'cm_sort_relevant', 'Muhimu Zaidi')
            + sortBtn('newest', 'cm_sort_newest', 'Mpya Zaidi')
            + sortBtn('liked', 'cm_sort_liked', 'Zilizopendwa')
            + '</div></div>'
            + '<div class="skh-cm-list" id="skhCmList"></div>'
            + '<div class="skh-cm-composer" id="skhCmComposer">'
            + (C.replyingTo
                ? '<div class="skh-cm-replying" id="skhCmReplying">' + T('cm_reply_to', 'Jibu @') + ' ' + esc(C.replyingTo.authorName || '') + ' <button type="button" onclick="window.skhCommentsCancelReply()">&times;</button></div>'
                : '<div class="skh-cm-replying" id="skhCmReplying" style="display:none;"></div>')
            + (pendingChips ? '<div class="skh-cm-chips" id="skhCmChips">' + pendingChips + '</div>' : '')
            + '<div class="skh-cm-inputrow">'
            + (canEvidence
                ? '<button type="button" class="skh-cm-attach-btn" id="skhCmAttachBtn" title="Ongeza picha/video ya ushahidi" onclick="window.skhMaoniPickMedia()">' + (window.skhNavIcon ? window.skhNavIcon('clipboard', 19) : '&#128206;') + '</button>'
                : '<span class="skh-cm-attach-btn disabled" id="skhCmAttachBtn" title="' + T('cm_attach_locked', 'Ushahidi wa picha/video hufunguka baada ya oda/usafirishaji') + '">' + (window.skhNavIcon ? window.skhNavIcon('clipboard', 19) : '&#128206;') + '</span>')
            + '<input type="file" id="skhCmFileInput" accept="image/*,video/*" multiple style="display:none" onchange="window.skhMaoniFileChosen(this)">'
            + '<input type="text" id="skhCommentInput" maxlength="2000" placeholder="' + T('cm_placeholder', 'Andika maoni, swali au uzoefu wako…') + '">'
            + '<button type="button" class="skh-cm-send" id="skhCmSendBtn" onclick="window.skhCommentsSubmit()">' + T('cm_send', 'Tuma') + '</button></div>'
            + '<div class="skh-cm-tools">'
            + eligNote
            + (myUid() === C.sellerId ? '<label class="skh-cm-attach' + (C.attachProduct ? ' on' : '') + '"><input type="checkbox" onchange="window.skhCommentsToggleProduct(this.checked)"> ' + T('cm_reply_with_product', 'Jibu na tangazo hili') + '</label>' : '')
            + '</div></div>';
        root.innerHTML = html;
        var list = document.getElementById('skhCmList');
        if (!C.items.length) {
            list.innerHTML = '<p class="skh-cm-empty">' + T('cm_empty', 'Bado hakuna maoni. Kuwa wa kwanza kutoa maoni!') + '</p>';
            return;
        }
        var shown = C.items.slice(0, C.limit);
        var out = shown.map(function (t) {
            var replies = (C.byParent[t.id] || []);
            var visible = replies.slice(0, C.threadLimit || 2);
            var hidden = replies.length - visible.length;
            var isReplyingHere = !!(C.replyingTo && C.replyingTo.id === t.id);
            return commentHtml(t, false)
                + (isReplyingHere ? replyFormHtml(t) : '')
                + (replies.length ? '<div class="skh-cm-thread">' + visible.map(function (r) { return commentHtml(r, true); }).join('') + '</div>' : '')
                + (hidden > 0 ? '<button type="button" class="skh-cm-more" onclick="window.skhCommentsShowReplies(\'' + jsEsc(t.id) + '\')">' + T('cm_show_replies', 'Onyesha majibu') + ' (' + hidden + ')</button>' : '');
        }).join('');
        list.innerHTML = out;
        if (C.total > C.limit) {
            list.innerHTML += '<button type="button" class="skh-cm-more" onclick="window.skhCommentsLoadMore()">' + T('cm_load_more', 'Pakia zaidi') + ' (' + (C.total - C.limit) + ')</button>';
        }
        // [GESTURE REPLY 2026-09] Fomu ya kujibu inaonekana MOJA kwa MOJA chini ya
        // swali — na ina focus mara moja (sio kuandika kwenye box ya juu tu).
        if (C.replyingTo) {
            var rinp = document.getElementById('skhCmReplyInput');
            if (rinp) { try { rinp.focus(); } catch (e) {} }
        }
        bindCommentsSwipe();
    }

    // [GESTURE REPLY 2026-09] Fomu ndogo ya kujibu inayoonekana chini ya swali.
    function replyFormHtml(parent) {
        return '<div class="skh-cm-replyform" id="skhCmReplyForm">'
            + '<input type="text" id="skhCmReplyInput" maxlength="2000" placeholder="' + T('cm_reply_ph', 'Andika jibu lako...') + '">'
            + '<button type="button" onclick="window.skhCommentsSubmit()">' + T('cm_send', 'Tuma') + '</button>'
            + '<button type="button" class="skh-cm-cancel" onclick="window.skhCommentsCancelReply()"></button>'
            + '</div>';
    }

    // [GESTURE REPLY 2026-09] Telezesha swali/maoni kando ili kumjibu.
    function bindCommentsSwipe() {
        var list = document.getElementById('skhCmList');
        if (!list || list._skhCmSwipe) return;
        list._skhCmSwipe = true;
        var sx = 0, sy = 0, el = null, horiz = false;
        list.addEventListener('touchstart', function (e) {
            var t = e.touches && e.touches[0]; if (!t) return;
            sx = t.clientX; sy = t.clientY; horiz = false;
            el = e.target && e.target.closest ? e.target.closest('.skh-cm-item') : null;
        }, { passive: true });
        list.addEventListener('touchmove', function (e) {
            var t = e.touches && e.touches[0]; if (!t) return;
            var dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4) horiz = true;
        }, { passive: true });
        list.addEventListener('touchend', function () {
            if (!el || !horiz) { el = null; return; }
            var id = el.getAttribute('data-cid');
            if (id) window.skhCommentsReply(id);
            el = null;
        });
        var md = false;
        list.addEventListener('mousedown', function (e) { md = true; sx = e.clientX; sy = e.clientY; horiz = false; el = e.target && e.target.closest ? e.target.closest('.skh-cm-item') : null; });
        window.addEventListener('mousemove', function (e) { if (md) { var dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4) horiz = true; } });
        window.addEventListener('mouseup', function () { if (md) { md = false; if (el && horiz) { var id = el.getAttribute('data-cid'); if (id) window.skhCommentsReply(id); } el = null; } });
    }
    function sortBtn(val, key, en) {
        return '<button type="button" class="' + (C.sort === val ? 'active' : '') + '" onclick="window.skhCommentsSort(\'' + val + '\')">' + T(key, en) + '</button>';
    }

    // ---------- API za umma ----------
    window.skhCommentsOpen = async function (p, opts) {
        if (!p || !p.id) return;
        opts = opts || {};
        var changed = (C.targetId !== p.id);
        resetState(p);
        var root = ensureRoot();
        if (!root) return;
        if (changed || !C.loaded) {
            // Hali ya kupakia ndani ya sheet.
            root.innerHTML = '<p class="skh-cm-empty">' + T('cm_loading', 'Inapakia maoni…') + '</p>';
            try {
                await Promise.all([fetchComments(), fetchMyLikes()]);
                C.loaded = true;
            } catch (e) {
                root.innerHTML = '<p class="skh-cm-empty skh-cm-err">' + T('cm_load_fail', 'Imeshindwa kupakia maoni.')
                    + ' <button type="button" class="skh-cm-more" onclick="window.skhCommentsOpen(skh.currentOpenProduct,{open:true})">Rudia</button></p>';
                return;
            }
        }
        render();
    };

    window.skhCommentsSort = async function (s) {
        C.sort = s; render();
    };
    window.skhCommentsLoadMore = function () {
        C.limit += 20; render();
    };
    window.skhCommentsShowReplies = function (id) {
        C.threadLimit = (C.threadLimit || 2) + 5; render();
    };
    window.skhCommentsToggleProduct = function (on) {
        C.attachProduct = !!on; render();
    };
    window.skhCommentsReply = function (id) {
        var all = [];
        (C.items || []).forEach(function (t) { all.push(t); (C.byParent[t.id] || []).forEach(function (r) { all.push(r); }); });
        var parent = all.filter(function (x) { return x.id === id; })[0];
        if (!parent) return;
        C.replyingTo = { id: parent.id, authorName: parent.authorName || '', rootId: parent.rootId || parent.id };
        render();
        var inp = document.getElementById('skhCmReplyInput') || document.getElementById('skhCommentInput');
        if (inp) { inp.focus(); }
    };
    window.skhCommentsCancelReply = function () {
        C.replyingTo = null;
        render();
        var inp = document.getElementById('skhCommentInput');
        if (inp) { inp.placeholder = T('cm_placeholder', 'Uliza kuhusu bidhaa hii…'); inp.focus(); }
    };

    // Kiulizo (?) kiotomatiki kwenye swali (top-level) — hata kama mtumiaji
    // hakuliweka. Majibu (reply) HAYABADILISHWI.
    function ensureQuestionMark(t) {
        t = String(t || '').trim();
        if (!t) return t;
        var last = t.charAt(t.length - 1);
        if (last === '?' || last === '\u061F') return t;               // ? au ؟
        if (/[.!…,;:]$/.test(t)) return t.slice(0, -1) + '?';
        return t + '?';
    }
    function callableUnavailable(e) {
        if (!e) return true;
        var c = String((e && e.code) || '');
        if (!c) return true; // hitilafu bila code (network) -> tuna fallback
        return c === 'functions/not-found' || c === 'unavailable' || c === 'internal' || /not-found/.test(c);
    }
    function findCommentById(id) {
        if (!id) return null;
        var all = [];
        (C.items || []).forEach(function (t) { all.push(t); (C.byParent && C.byParent[t.id] || []).forEach(function (r) { all.push(r); }); });
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
        return null;
    }

    window.skhCommentsSubmit = async function () {
        if (!skh.requireAuth()) return;
        // [GESTURE REPLY 2026-09] Ukijibu kwenye fomu ndogo (chini ya swali),
        // soma kutoka hapo; la sivyo tumia box kuu ya maoni. Ikiwa fomu ndogo ipo
        // lakini HAIJAZWA, rudia kwenye box kuu (mtumiaji anaweza kuandika huko).
        var inpReply = document.getElementById('skhCmReplyInput');
        var inpMain = document.getElementById('skhCommentInput');
        var inp = null, text = '';
        if (inpReply && String(inpReply.value || '').trim()) { inp = inpReply; text = inpReply.value.trim(); }
        else if (inpMain) { inp = inpMain; text = String(inpMain.value || '').trim(); }
        else { inp = inpReply; }
        var hasMedia = C.pendingMedia && C.pendingMedia.length > 0;
        if (!text && !C.attachProduct && !hasMedia) {
            if (inp) { inp.focus(); }
            return; // hakuna cha kutuma (haina madhara)
        }
        var parent = C.replyingTo || null;
        var isQuestion = !parent;
        if (isQuestion && text) text = ensureQuestionMark(text);
        // [USHAHIDI 2026-09] Pakia picha/video KABLA ya kutuma (Cloudinary).
        var mediaUrls = [];
        if (hasMedia) {
            var sendBtn = document.getElementById('skhCmSendBtn');
            if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '…'; }
            for (var mi = 0; mi < C.pendingMedia.length; mi++) {
                var mm = C.pendingMedia[mi];
                try {
                    var up = await window.skhUploadFromFile(mm.file, {
                        resourceType: mm.isVideo ? 'video' : 'image',
                        folder: 'sokohai/maoni'
                    });
                    if (up && up.url) mediaUrls.push(up.url);
                } catch (e) { /* ruka faili iliyoshindikana */ }
            }
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = T('cm_send', 'Tuma'); }
            if (!mediaUrls.length && !text) {
                alert(T('cm_media_fail', 'Picha/video haikupatikana. andika maoni au jaribu tena.'));
                return;
            }
        }
        var payload = {
            targetType: C.targetType, targetId: C.targetId, text: text || '',
            authorName: myName(),
            authorPhoto: (skh.currentUserData && skh.currentUserData.photoURL) || (skh.currentUser && skh.currentUser.photoURL) || '',
            parentId: parent ? parent.id : null,
            rootId: parent ? parent.rootId : null,
            media: mediaUrls
        };
        if (C.attachProduct && C.product) {
            payload.productRef = {
                id: C.product.id, collection: C.product.collectionName || skh.currentFeedCollection || 'products',
                title: C.product.title || C.product.itemTitle || 'Bidhaa', price: C.product.price != null ? C.product.price : null,
                image: C.product.image || (C.product.images && C.product.images[0]) || C.product.photo || ''
            };
        }
        inp.disabled = true;
        var published = null;
        var fn = cfCallable('commentsPublish');
        // 1) Server kwanza (badge za verifiedPurchase + rate-limit ni server-only).
        if (fn) {
            try {
                var res = await fn(payload);
                if (res && res.data && res.data.ok) published = res.data;
            } catch (e) {
                if (!callableUnavailable(e)) {
                    alert(T('cm_publish_fail', 'Imeshindwa kutuma maoni.') + ' ' + (e && e.message ? e.message : ''));
                    if (inp) { inp.disabled = false; inp.focus(); }
                    return;
                }
                // server haipatikani -> endelea na fallback ya client.
            }
        }
        // 2) Fallback: server haijatumwa/haipatikani -> andika moja kwa moja
        //    (rules zinaruhusu maoni ya mwandishi; bila badge za server).
        if (!published) {
            try {
                var parentDoc = parent ? findCommentById(parent.id) : null;
                var doc = {
                    targetType: C.targetType, targetId: C.targetId, authorId: myUid(),
                    authorName: myName(), authorPhoto: payload.authorPhoto,
                    parentId: payload.parentId, rootId: payload.rootId,
                    text: text || '', media: mediaUrls, productRef: payload.productRef || null,
                    // Kumbuka: beji za uthibitisho HAZIBANDIKWI na client —
                    // verifiedPurchase/verifiedDelivery huja server pekee.
                    createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null
                };
                var added = await skh.addDoc(skh.collection(skh.db, 'comments'), doc);
                published = { id: (added && added.id) || null, parentAuthorId: parentDoc ? parentDoc.authorId : null };
            } catch (e) {
                alert(T('cm_publish_fail', 'Imeshindwa kutuma maoni.') + ' ' + (e && e.message ? e.message : ''));
                if (inp) { inp.disabled = false; inp.focus(); }
                return;
            }
        }
        // 3) Arifa (mfumo uliopo) + reset.
        try {
            var body = text || (C.product && C.product.title) || '';
            if (parent) {
                var parentAuthorId = published.parentAuthorId || (parentDoc ? parentDoc.authorId : null);
                if (parentAuthorId && parentAuthorId !== myUid()) notify(parentAuthorId, T('cm_reply_title', 'Jibu jipya'), body, 'comment_reply', { commentId: published.id, targetId: C.targetId });
            }
            var mentioned = false;
            if (text.indexOf('@') !== -1 && C.sellerName) {
                var token = C.sellerName.replace(/\s+/g, '').toLowerCase();
                if (text.toLowerCase().indexOf('@' + token) !== -1 || text.toLowerCase().indexOf('@' + token.replace(/[^a-z0-9]/g, '')) !== -1) mentioned = true;
            }
            if (C.sellerId && C.sellerId !== myUid() && (!parent || mentioned)) {
                notify(C.sellerId, mentioned ? T('cm_mention_title', 'Umetajwa kwenye maoni') : T('cm_new_title', 'Maoni Mapya'), body, mentioned ? 'comment_mention' : 'new_comment', { commentId: published.id, targetId: C.targetId });
            }
        } catch (e) { /* arifa si ya kusitisha */ }
        inp.value = '';
        C.replyingTo = null; C.attachProduct = false;
        // Safisha midia inayokuwa imetumwa.
        C.pendingMedia.forEach(function (m) {
            if (m.previewUrl) { try { URL.revokeObjectURL(m.previewUrl); } catch (e) {} }
        });
        C.pendingMedia = [];
        C.loaded = false;
        await window.skhCommentsOpen(C.product, { open: true });
    };

    // [COMMENT-LIKES 2026-09] Kama Cloud Functions hazipo (Firestore pekee),
    // like/unlike inafanywa na client MOJA KWA MOJA: commentLikes (1 kwa
    // user/comment — id ina uid) + likeCount (increment/decrement). Rules
    // ndizo zinazoruhusu + kudhibiti (commentLikes haiwezi kuundwa mara mbili,
    // likeCount >= 0).
    function isCommentsServerDown(e) {
        if (!e) return true;
        var code = (e && (e.code || (e.errorInfo && e.errorInfo.code))) || '';
        var m = String((e && e.message) || '');
        return /functions\//.test(code) || /hazipatikani|haipatikani|not-found|unavailable|^internal$|deadline-exceeded|NO_FUNCTIONS/i.test(m);
    }

    window.skhCommentsLikeNative = async function (id) {
        var me = myUid();
        if (!me || !id) return { ok: false, error: 'no_user' };
        var likeId = id + '__' + me;   // (sawa na server: commentId__uid)
        var likeRef = skh.doc(skh.db, 'commentLikes', likeId);
        var cRef = skh.doc(skh.db, 'comments', id);
        var liked = !!C.liked[id];
        if (liked) {
            await skh.deleteDoc(likeRef);
            await skh.updateDoc(cRef, { likeCount: skh.increment(-1) });
            C.liked[id] = false;
        } else {
            await skh.setDoc(likeRef, { userId: me, commentId: id, createdAt: nowIso() });
            await skh.updateDoc(cRef, { likeCount: skh.increment(1) });
            C.liked[id] = true;
        }
        return { ok: true, liked: !liked, native: true };
    };

    window.skhCommentsLike = async function (id) {
        if (!skh.requireAuth()) return;
        var fn = cfCallable('commentsLike');
        if (fn) {
            try {
                await fn({ commentId: id });
                C.loaded = false;
                await window.skhCommentsOpen(C.product);
                return;
            } catch (e) {
                if (!isCommentsServerDown(e)) { /* njia ya server ilikataa kwa sababu nyingine */ }
                else { await window.skhCommentsLikeNative(id); C.loaded = false; await window.skhCommentsOpen(C.product); return; }
            }
        }
        // Hakuna callable -> Firestore-native moja kwa moja.
        await window.skhCommentsLikeNative(id);
        C.loaded = false;
        await window.skhCommentsOpen(C.product);
    };

    window.skhCommentsEdit = async function (id) {
        var all = [];
        (C.items || []).forEach(function (t) { all.push(t); (C.byParent[t.id] || []).forEach(function (r) { all.push(r); }); });
        var c = all.filter(function (x) { return x.id === id; })[0];
        if (!c) return;
        var doEdit = function (newText) {
            newText = (newText == null ? '' : String(newText)).trim();
            if (!newText) return;
            skh.updateDoc(skh.doc(skh.db, 'comments', id), { text: newText, editedAt: nowIso() }).then(function () {
                C.loaded = false; window.skhCommentsOpen(C.product);
            }).catch(function (e) { alert(T('cm_fail', 'Imeshindwa.') + ' ' + e.message); });
        };
        if (typeof window.customPrompt === 'function') window.customPrompt(T('cm_edit_prompt', 'Hariri maoni'), c.text || '', doEdit);
        else { var v = await skhPrompt(T('cm_edit_prompt', 'Hariri maoni'), c.text || ''); if (v != null) doEdit(v); }
    };

    window.skhCommentsDelete = async function (id) {
        if (!await skhConfirm(T('cm_delete_confirm', 'Futa maoni haya?'))) return;
        await skh.updateDoc(skh.doc(skh.db, 'comments', id), { deletedAt: nowIso(), text: '' });
        C.loaded = false; await window.skhCommentsOpen(C.product);
    };

    window.skhCommentsReport = async function (id) {
        var reason = 'other';
        var doReport = function (r) {
            if (!r) return;
            skh.addDoc(skh.collection(skh.db, 'chatReports'), {
                reportedBy: myUid(), conversationId: null, messageId: null, commentId: id,
                reason: r, createdAt: nowIso(), status: 'open'
            }).then(function () { alert(T('cm_reported_ok', 'Ripoti imepokelewa.')); }).catch(function () {});
        };
        if (typeof window.customPrompt === 'function') window.customPrompt(T('cm_report_prompt', 'Sababu ya ripoti (spam, udhalilishaji, udanganyifu, n.k.):'), T('cm_report_ph', 'Mfano: spam'), doReport);
        else { var v = await skhPrompt(T('cm_report_prompt', 'Sababu ya ripoti:'), 'spam'); doReport(v); }
    };

    // ---------- Auto-hook: product modal ----------
    // [MAONI 2026-09] USIPAKIE maoni kabla ya kufunguliwa — andaa hali tu na
    // uonyeshe kaunta ya awamu; upakuzi halisi hutokea sheet inapofunguliwa.
    function autoAttach() {
        var p = skh.currentOpenProduct;
        if (!p || !p.id) return;
        if (C.targetId !== p.id || !C.loaded) {
            resetState(p);
            var n = Array.isArray(p.comments) ? p.comments.length
                : (typeof p.commentCount === 'number' ? p.commentCount
                : (p.reviewCount || 0));
            C.total = n; C.allCount = n;
            syncCommentCounts();
            ensureRoot();
            // Funga sheet ikiwa bado wazi kutoka tangazo lililopita.
            var layer = document.getElementById('maoniLayer');
            if (layer && !layer.hidden) {
                layer.classList.remove('is-open');
                layer.hidden = true;
            }
        }
    }
    const _origUpdateInteractionUI = skh.updateInteractionUI;
    skh.updateInteractionUI = function () {
        if (_origUpdateInteractionUI) { try { _origUpdateInteractionUI.apply(this, arguments); } catch (e) {} }
        try { autoAttach(); } catch (e) { /* ignore */ }
    };
    window.skhCommentsRefresh = autoAttach;
    try { autoAttach(); } catch (e) { /* ignore */ }
})();

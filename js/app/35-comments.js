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
    /* ============================================================
       REAKSINI (2026-11-04) — set MOJA ya soko zima (marketplace).
       Huhifadhiwa kwenye `commentLikes` (doc: commentId__uid) kwa uga
       `reaction`; `penda` ni ile ya kawaida (❤️) na ni default.
       Rules za commentLikes zinaruhusu uga huu (hakuna hasOnly).
       ============================================================ */
    var REACTIONS = [
        { k: 'penda',   e: '\u2764\uFE0F', l: 'Penda' },
        { k: 'nzuri',   e: '\uD83D\uDC4D', l: 'Nzuri' },
        { k: 'moto',    e: '\uD83D\uDD25', l: 'Moto' },
        { k: 'deal',    e: '\uD83E\uDD1D', l: 'Deal' },
        { k: 'bora',    e: '\uD83D\uDCAF', l: 'Bora' },
        { k: 'shangaa', e: '\uD83D\uDE2E', l: 'Shangaa' }
    ];
    var REACTION_BY_KEY = {};
    REACTIONS.forEach(function (r) { REACTION_BY_KEY[r.k] = r; });
    window.skhReactionSet = REACTIONS;

    var C = {
        targetType: 'product', targetId: null, product: null,
        sellerId: null, sellerName: '', sort: 'relevant',
        items: [], liked: {}, limit: 20, total: 0,
        replyingTo: null, attachProduct: false, loaded: false,
        reactions: {}, mine: {}, reactionsLoaded: false, threadShown: {}, draft: '', requestSeq: 0, sessionSeq: 0, sending: false
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
        var details = document.getElementById('maoniReviewsDetails');
        if (!details) {
            details = document.createElement('details');
            details.id = 'maoniReviewsDetails';
            details.className = 'maoni-reviews-details';
            var summary = document.createElement('summary');
            summary.textContent = T('cm_reviews', 'Tathmini za bidhaa');
            details.appendChild(summary);
            host.insertBefore(details, host.firstChild);
        }
        if (rev.parentNode !== details) {
            rev.classList.add('maoni-reviews');
            details.appendChild(rev);
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
        C.reactions = {}; C.mine = {}; C.reactionsLoaded = false; C.reactionsLoading = false;
        (C.pendingMedia || []).forEach(function (m) { if (m.previewUrl) URL.revokeObjectURL(m.previewUrl); });
        C.replyingTo = null; C.attachProduct = false; C.loaded = false;
        C.threadShown = {}; C.draft = ''; C.sending = false; C.pendingAttempt = null; C.queryCapped = false; C.allCount = 0; C.cursor = null; C.allItems = []; C.serverCount = null;
        C.requestSeq++; C.sessionSeq++;
        // [MAONI 2026-09] Ushahidi wa oda/usafirishaji + midia inayosubiri.
        C.pendingMedia = [];
        C.eligibility = { order: null, delivery: null, checked: false, checking: false };
    }

    // ---------- Kuchukua maoni ----------
    async function fetchComments(targetId, targetType, cursor) {
        var args = [skh.collection(skh.db, 'comments'), skh.where('targetId', '==', targetId)];
        if (cursor && typeof skh.startAfter === 'function') args.push(skh.startAfter(cursor));
        args.push(skh.limit(200));
        var q = skh.query.apply(null, args);
        var snap = await skh.getDocs(q);
        var list = [];
        if (snap && snap.forEach) snap.forEach(function (d) {
            var c = Object.assign({ id: d.id }, d.data());
            if (c.targetType === targetType) list.push(c);
        });
        var docs = snap && snap.docs || [];
        return { items: list, capped: !!(snap && snap.size >= 200), cursor: docs.length ? docs[docs.length - 1] : null };
    }
    function groupComments() {
        var tops = [], byParent = {};
        C.allItems.forEach(function (c) {
            if (!c.parentId) tops.push(c);
            else { var key = c.rootId || c.parentId; (byParent[key] = byParent[key] || []).push(c); }
        });
        Object.keys(byParent).forEach(function (k) {
            byParent[k].sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
        });
        C.items = tops; C.byParent = byParent; C.total = tops.length; C.allCount = C.allItems.length;
        sortComments();
    }
    async function fetchTotal(targetId, targetType) {
        if (typeof skh.getCountFromServer !== 'function') return null;
        try {
            var q = skh.query(skh.collection(skh.db, 'comments'), skh.where('targetId', '==', targetId), skh.where('targetType', '==', targetType));
            var result = await skh.getCountFromServer(q);
            return result.data().count;
        } catch (e) { return null; }
    }
    function displayCount() {
        return C.serverCount != null ? String(C.serverCount) : String(C.allCount || 0) + (C.queryCapped ? '+' : '');
    }
    function sortComments() {
        var score = function (c) { return (Number(c.likeCount) || 0) + (Number(c.replyCount) || 0) * 2 + (c.verifiedPurchase ? 3 : 0); };
        C.items.sort(function (a, b) {
            if (C.sort === 'newest') return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            if (C.sort === 'liked') return (Number(b.likeCount) || 0) - (Number(a.likeCount) || 0);
            return score(b) - score(a) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });
    }

    // [COMMENTS POLISH] Sasisha kaunta za maoni katika kadi ya bidhaa
    // (duara la hero na kichwa cha sehemu) — kutoka collection halisi.
    function syncCommentCounts() {
        var n = C.loaded ? displayCount() : ((typeof C.allCount === 'number') ? C.allCount : C.total);
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
    // [FIX 2026-11-17] Angalia hata kama C.loaded ni true — kama product ilibadilishwa,
    // maoni yaliyopakia hapa hapasti iweze kuonekana kwenye bidhaa nyingine.
    window.skhOpenMaoni = async function () {
        var p = skh.currentOpenProduct;
        if (!p || !p.id) return;
        var layer = document.getElementById('maoniLayer');
        var root = ensureRoot();
        if (!layer || !root) return;
        if (layer.hidden) layer._previousFocus = document.activeElement;
        if (layer._closeTimer) { clearTimeout(layer._closeTimer); layer._closeTimer = null; }
        layer.hidden = false;
        // ruhusu onyesho kisha ongeza class ya uhuishaji
        requestAnimationFrame(function () { if (!layer.hidden) { layer.classList.add('is-open'); var back = layer.querySelector('.maoni-x'); if (back) back.focus({preventScroll:true}); } });
        // [FIX] Re-load maoni kila wakati product inabadilishwa, au kama state haiyo
        if (!C.loaded || C.targetId !== p.id || !C.product || C.product.id !== p.id) {
            await window.skhCommentsOpen(p, { open: true });
        } else {
            render();
        }
        checkEligibility();
    };

    window.skhCloseMaoni = function () {
        var layer = document.getElementById('maoniLayer');
        if (!layer) return;
        layer.classList.remove('is-open');
        if (layer._closeTimer) clearTimeout(layer._closeTimer);
        layer._closeTimer = setTimeout(function () { layer.hidden = true; layer._closeTimer = null; if (layer._previousFocus && layer._previousFocus.isConnected) layer._previousFocus.focus({preventScroll:true}); }, 220);
    };

    // Wajibu wa zamani (39-skHHeroComments na sehemu nyingine) -> elekeza sheet.
    window.skhCommentsToggle = function (forceOpen) {
        if (forceOpen === false) window.skhCloseMaoni();
        else window.skhOpenMaoni();
    };

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
        var targetId = C.targetId, targetType = C.targetType, seq = C.requestSeq;
        var fn = cfCallable('commentsEvidence');
        if (fn) {
            try {
                var res = await fn({ targetType: targetType, targetId: targetId });
                if (seq !== C.requestSeq || targetId !== C.targetId) return;
                var d = (res && res.data) || {};
                C.eligibility = { order: d.order || null, delivery: d.delivery || null, checked: true, checking: false };
            } catch (e) {
                if (seq !== C.requestSeq || targetId !== C.targetId) return;
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
        var liked = {};
        if (!me) return liked;
        try {
            var q = skh.query(skh.collection(skh.db, 'commentLikes'), skh.where('userId', '==', me), skh.limit(200));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) {
                var data = d.data();
                if (data && data.commentId) liked[data.commentId] = true;
            });
        } catch (e) { /* ignore */ }
        return liked;
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
        var isSeller = !!C.sellerId && c.authorId === C.sellerId;
        var deleted = !!c.deletedAt;
        var replyTo = '';
        if (isReply && c.parentId && c.rootId && c.parentId !== c.rootId) {
            var all = [];
            (C.items || []).forEach(function (t) { all.push(t); (C.byParent[t.id] || []).forEach(function (r) { all.push(r); }); });
            var parent = all.filter(function (x) { return x.id === c.parentId; })[0];
            replyTo = parent ? '<span class="skh-cm-replyto">↳ @' + esc(parent.authorName || 'Mteja') + '</span>' : '<span class="skh-cm-replyto">↳ Anajibu maoni</span>';
        }
        var badges = '';
        if (!deleted) {
            if (isSeller) badges += badgeSeller();
            // [MAONI 2026-09] Alama za kweli za ODA/DELIVERY (server-only).
            var deliveryOk = !!(c.verifiedDelivery || (c.evidence && c.evidence.kind === 'delivery'));
            var orderOk = !!(c.verifiedPurchase || (c.evidence && c.evidence.kind === 'order'));
            if (orderOk) badges += badgeVerifiedPurchase();
            if (deliveryOk) badges += badgeVerifiedDelivery();
            if (!orderOk && !deliveryOk && c.authorVerified) badges += badgeVerifiedAuthor();
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
        var rx = (C.reactions && C.reactions[c.id]) || {};
        var mineRx = (C.mine && C.mine[c.id]) || '';
        var rxChips = Object.keys(rx).filter(function (k) { return rx[k] > 0 && REACTION_BY_KEY[k]; })
            .sort(function (a, b) { return rx[b] - rx[a]; })
            .map(function (k) {
                var R = REACTION_BY_KEY[k];
                return '<button type="button" class="cm-rx-chip' + (mineRx === k ? ' on' : '') + '"'
                    + ' title="' + esc(R.l) + '" aria-label="' + esc(R.l) + '"'
                    + ' onclick="window.skhCommentsReact(\'' + jsEsc(c.id) + '\',\'' + k + '\')">'
                    + '<span class="cm-rx-e">' + R.e + '</span><b>' + rx[k] + '</b></button>';
            }).join('');
        var actions = deleted ? '' : '<div class="skh-cm-actions">'
            + '<button type="button" class="cm-like' + (liked ? ' on' : '') + '" aria-pressed="' + (liked ? 'true' : 'false') + '" onclick="window.skhCommentsLike(\'' + jsEsc(c.id) + '\')">' + (liked ? 'Umependa' : 'Penda') + ((Number(c.likeCount) || 0) ? ' · ' + Number(c.likeCount) : '') + '</button>'
            + '<div class="cm-rx-set">' + rxChips + '</div>'
            + '<button type="button" class="cm-rx-open' + (mineRx ? ' on' : '') + '"'
            +   ' title="' + T('cm_react', 'Reaksi') + '" aria-label="' + T('cm_react', 'Reaksi') + '"'
            +   ' onclick="window.skhCmPickReaction(\'' + jsEsc(c.id) + '\')">'
            +   (mineRx && REACTION_BY_KEY[mineRx] ? '<span class="cm-rx-e">' + REACTION_BY_KEY[mineRx].e + '</span>'
                    : '<span class="cm-act-ic">' + (window.skhNavIcon ? window.skhNavIcon('heart', 15) : '&#9825;') + '</span>')
            + '</button>'
            + '<button type="button" onclick="window.skhCommentsReply(\'' + jsEsc(c.id) + '\')"><span class="cm-act-ic">'
            +   (window.skhNavIcon ? window.skhNavIcon('chat', 14) : '') + '</span> ' + T('cm_reply', 'Jibu') + '</button>'
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
        var oldInput = document.getElementById('skhCommentInput');
        var wasFocused = oldInput && document.activeElement === oldInput;
        var cursor = wasFocused ? oldInput.selectionStart : null;
        if (oldInput) C.draft = oldInput.value;
        var summary = document.getElementById('maoniProductSummary');
        if (summary && C.product) {
            var p = C.product;
            var pic = p.image || (Array.isArray(p.imagesArray) && p.imagesArray[0]) || (Array.isArray(p.images) && p.images[0]) || p.photo || '';
            var price = p.price != null && p.price !== '' && Number.isFinite(Number(p.price)) ? 'TSh ' + Number(p.price).toLocaleString() : '';
            summary.innerHTML = (pic ? '<img src="' + esc(pic) + '" alt="" onerror="this.hidden=true">' : '<span class="maoni-product-icon" aria-hidden="true">◈</span>')
                + '<div><small>TANGAZO</small><b>' + esc(p.title || p.itemTitle || p.name || 'Bidhaa') + '</b>'
                + (price ? '<span>' + esc(price) + '</span>' : '') + '</div>';
        }
        syncCommentCounts();
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
            + '<h5>' + T('cm_title_sheet', 'Maoni & Maswali') + ' <span id="skhCmCount">(' + displayCount() + ')</span></h5>'
            + '<div class="skh-cm-sort">'
            + sortBtn('relevant', 'cm_sort_relevant', 'Muhimu Zaidi')
            + sortBtn('newest', 'cm_sort_newest', 'Mpya Zaidi')
            + sortBtn('liked', 'cm_sort_liked', 'Zilizopendwa')
            + '</div></div>'
            + '<div class="skh-cm-list" id="skhCmList"></div>'
            + '<div class="skh-cm-composer" id="skhCmComposer">'
            + (C.replyingTo
                ? '<div class="skh-cm-replying" id="skhCmReplying">' + T('cm_reply_to', 'Jibu') + ' @' + esc(C.replyingTo.authorName || '') + ' <button type="button" aria-label="Ghairi kujibu" onclick="window.skhCommentsCancelReply()">&times;</button></div>'
                : '<div class="skh-cm-replying" id="skhCmReplying" style="display:none;"></div>')
            + (pendingChips ? '<div class="skh-cm-chips" id="skhCmChips">' + pendingChips + '</div>' : '')
            + '<div class="skh-cm-inputrow">'
            + (canEvidence
                ? '<button type="button" class="skh-cm-attach-btn" id="skhCmAttachBtn" title="Ongeza picha/video ya ushahidi" onclick="window.skhMaoniPickMedia()">' + (window.skhNavIcon ? window.skhNavIcon('clipboard', 19) : '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 18a2 2 0 1 1-3-3l8-8"/></svg>') + '</button>'
                : '<span class="skh-cm-attach-btn disabled" id="skhCmAttachBtn" title="' + T('cm_attach_locked', 'Ushahidi wa picha/video hufunguka baada ya oda/usafirishaji') + '">' + (window.skhNavIcon ? window.skhNavIcon('clipboard', 19) : '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 18a2 2 0 1 1-3-3l8-8"/></svg>') + '</span>')
            + '<input type="file" id="skhCmFileInput" accept="image/*,video/*" multiple style="display:none" onchange="window.skhMaoniFileChosen(this)">'
            + '<input type="text" id="skhCommentInput" aria-label="Andika maoni, swali au jibu" maxlength="2000" placeholder="' + T('cm_placeholder', 'Andika maoni, swali au uzoefu wako…') + '">'
            + '<button type="button" class="skh-cm-send" id="skhCmSendBtn" onclick="window.skhCommentsSubmit()">' + T('cm_send', 'Tuma') + '</button></div>'
            + '<div class="skh-cm-tools">'
            + eligNote
            + (myUid() === C.sellerId ? '<label class="skh-cm-attach' + (C.attachProduct ? ' on' : '') + '"><input type="checkbox" onchange="window.skhCommentsToggleProduct(this.checked)"> ' + T('cm_reply_with_product', 'Jibu na tangazo hili') + '</label>' : '')
            + '</div></div>';
        root.innerHTML = html;
        var input = document.getElementById('skhCommentInput');
        if (input) {
            input.value = C.draft || '';
            input.disabled = !!C.sending;
            var send = document.getElementById('skhCmSendBtn'); if (send) send.disabled = !!C.sending;
            input.addEventListener('input', function () { C.draft = input.value; });
            input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); window.skhCommentsSubmit(); } });
            if (wasFocused) { input.focus({preventScroll:true}); if (cursor != null) input.setSelectionRange(cursor, cursor); }
        }
        var list = document.getElementById('skhCmList');
        if (!C.items.length) {
            list.innerHTML = C.queryCapped && C.cursor && typeof skh.startAfter === 'function'
                ? '<p class="skh-cm-empty">Majibu yamepatikana; pakia zaidi kuona maoni yake.</p><button type="button" class="skh-cm-more" onclick="window.skhCommentsFetchMore()">Pakia maoni zaidi</button>'
                : '<p class="skh-cm-empty">' + T('cm_empty', 'Bado hakuna maoni. Kuwa wa kwanza kutoa maoni!') + '</p>';
            return;
        }
        var shown = C.items.slice(0, C.limit);
        var out = shown.map(function (t) {
            var replies = (C.byParent[t.id] || []);
            var amount = Object.prototype.hasOwnProperty.call(C.threadShown, t.id) ? C.threadShown[t.id] : 2;
            var visible = replies.slice(0, amount);
            var hidden = replies.length - visible.length;
            var controls = '';
            if (hidden > 0) controls += '<button type="button" class="skh-cm-more" onclick="window.skhCommentsShowReplies(\'' + jsEsc(t.id) + '\')">Onyesha majibu zaidi (' + hidden + ')</button>';
            if (replies.length && amount > 0) controls += '<button type="button" class="skh-cm-more" onclick="window.skhCommentsCollapseReplies(\'' + jsEsc(t.id) + '\')">Ficha majibu</button>';
            return '<section class="skh-cm-conversation">' + commentHtml(t, false)
                + (visible.length ? '<div class="skh-cm-thread">' + visible.map(function (r) { return commentHtml(r, true); }).join('') + '</div>' : '')
                + (controls ? '<div class="skh-cm-thread-controls">' + controls + '</div>' : '') + '</section>';
        }).join('');
        list.innerHTML = out;
        if (C.queryCapped && C.cursor && typeof skh.startAfter === 'function') {
            list.innerHTML += '<p class="skh-cm-cap-note">Mpangilio unatumia maoni yaliyopakiwa. Pakia zaidi kuona mengine.</p>'
                + '<button type="button" class="skh-cm-more skh-cm-fetch-more" onclick="window.skhCommentsFetchMore()">Pakia maoni na majibu zaidi</button>';
        } else if (C.queryCapped) {
            list.innerHTML += '<p class="skh-cm-cap-note">Orodha inaonyesha maoni yaliyopatikana tu.</p>';
        }
        if (C.total > C.limit) {
            list.innerHTML += '<button type="button" class="skh-cm-more" onclick="window.skhCommentsLoadMore()">' + T('cm_load_more', 'Pakia zaidi') + ' (' + (C.total - C.limit) + ')</button>';
        }
        bindCommentsSwipe();
        // Reaksini za maoni (set moja ya soko) — hupakiwa mara moja kwa kila orodha.
        if (!C.reactionsLoaded && !C.reactionsLoading && (C.items || []).length) {
            try { loadReactions(); } catch (e) {}
        }
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
        list.addEventListener('mousemove', function (e) { if (md) { var dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4) horiz = true; } });
        list.addEventListener('mouseup', function () { if (md) { md = false; if (el && horiz) { var id = el.getAttribute('data-cid'); if (id) window.skhCommentsReply(id); } el = null; } });
    }
    function sortBtn(val, key, en) {
        return '<button type="button" aria-pressed="' + (C.sort === val ? 'true' : 'false') + '" class="' + (C.sort === val ? 'active' : '') + '" onclick="window.skhCommentsSort(\'' + val + '\')">' + T(key, en) + '</button>';
    }

    // ---------- API za umma ----------
    window.skhCommentsOpen = async function (p, opts) {
        if (!p || !p.id) return;
        var changed = C.targetId !== p.id || C.targetType !== targetTypeOf(p);
        if (changed || !C.product) resetState(p);
        else C.product = p;
        var root = ensureRoot();
        if (!root) return;
        var seq = ++C.requestSeq;
        C.reactionsLoading = false;
        if (changed || !C.loaded) {
            var existingInput = document.getElementById('skhCommentInput');
            if (!changed && existingInput) C.draft = existingInput.value;
            if (changed || !C.items.length) root.innerHTML = '<p class="skh-cm-empty">' + T('cm_loading', 'Inapakia maoni…') + '</p>';
            try {
                var result = await Promise.all([fetchComments(p.id, targetTypeOf(p)), fetchMyLikes(), fetchTotal(p.id, targetTypeOf(p))]);
                if (seq !== C.requestSeq || C.targetId !== p.id || C.targetType !== targetTypeOf(p)) return;
                C.allItems = result[0].items; C.cursor = result[0].cursor; C.queryCapped = result[0].capped;
                C.liked = result[1]; C.serverCount = result[2]; C.loaded = true; C.reactionsLoaded = false;
                groupComments();
            } catch (e) {
                if (seq !== C.requestSeq) return;
                root.innerHTML = '<p class="skh-cm-empty skh-cm-err">' + T('cm_load_fail', 'Imeshindwa kupakia maoni.')
                    + ' <button type="button" class="skh-cm-more" onclick="window.skhCommentsOpen(skh.currentOpenProduct,{open:true})">Rudia</button></p>';
                return;
            }
        }
        render();
    };

    window.skhCommentsSort = function (s) {
        if (['relevant', 'newest', 'liked'].indexOf(s) === -1) return;
        C.sort = s; sortComments(); render();
    };
    window.skhCommentsFetchMore = async function () {
        if (!C.cursor || C.loadingMore || typeof skh.startAfter !== 'function') return;
        var seq = C.requestSeq, id = C.targetId, type = C.targetType, cursor = C.cursor;
        C.loadingMore = true;
        var btn = document.querySelector('.skh-cm-fetch-more'); if (btn) btn.disabled = true;
        try {
            var page = await fetchComments(id, type, cursor);
            if (seq !== C.requestSeq || id !== C.targetId || type !== C.targetType) return;
            var seen = new Set(C.allItems.map(function (c) { return c.id; }));
            page.items.forEach(function (c) { if (!seen.has(c.id)) { C.allItems.push(c); seen.add(c.id); } });
            C.cursor = page.cursor; C.queryCapped = page.capped; C.reactionsLoaded = false;
            groupComments(); render();
        } catch (e) {
            alert(T('cm_load_fail', 'Imeshindwa kupakia maoni.'));
        } finally { C.loadingMore = false; if (btn) btn.disabled = false; }
    };
    window.skhCommentsLoadMore = function () { C.limit += 20; render(); };
    window.skhCommentsShowReplies = function (id) {
        C.threadShown[id] = (Object.prototype.hasOwnProperty.call(C.threadShown, id) ? C.threadShown[id] : 2) + 5; render();
    };
    window.skhCommentsCollapseReplies = function (id) { C.threadShown[id] = 0; render(); };
    window.skhCommentsToggleProduct = function (on) {
        C.attachProduct = !!on; render();
    };
    /* ============================================================
       REAKSINI — set MOJA (Penda · Nzuri · Moto · Deal · Bora · Shangaa)
       Data: commentLikes/{commentId__uid}.reaction (rules zinaruhusu).
       Hesabu: hupakiwa kwa query ya commentId `in [...]` (vipande 10).
       ============================================================ */
    async function loadReactions() {
        if (C.reactionsLoading) return;
        C.reactionsLoading = true;
        var ids = [];
        (C.items || []).forEach(function (t) {
            ids.push(t.id);
            (C.byParent[t.id] || []).forEach(function (r) { ids.push(r.id); });
        });
        ids = ids.slice(0, 40);
        if (!ids.length) { C.reactionsLoading = false; C.reactionsLoaded = true; return; }
        var me = myUid();
        var seq = C.requestSeq;
        var chunks = [];
        for (var i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
        var agg = {}, mine = {};
        try {
            for (var ci = 0; ci < chunks.length; ci++) {
                var q = skh.query(
                    skh.collection(skh.db, 'commentLikes'),
                    skh.where('commentId', 'in', chunks[ci]),
                    skh.limit(400)
                );
                var snap = await skh.getDocs(q);
                snap.forEach(function (d) {
                    var v = d.data() || {};
                    var cid = v.commentId;
                    if (!cid) return;
                    var k = (v.reaction && REACTION_BY_KEY[v.reaction]) ? v.reaction : 'penda';
                    agg[cid] = agg[cid] || {};
                    agg[cid][k] = (agg[cid][k] || 0) + 1;
                    if (me && v.userId === me) { mine[cid] = k; C.liked[cid] = true; }
                });
            }
            if (seq !== C.requestSeq) return;
            C.reactionsLoading = false;
            C.reactions = agg;
            C.mine = mine;
            C.reactionsLoaded = true;
            render();
        } catch (e) {
            if (seq !== C.requestSeq) return;
            C.reactionsLoading = false;
            C.reactionsLoaded = true;   // usirudie kwa kila render ikiwa imeshindikana
        }
    }

    window.skhCommentsReact = async function (id, key) {
        if (!skh.requireAuth()) return;
        var me = myUid();
        if (!me || !id) return;
        key = REACTION_BY_KEY[key] ? key : 'penda';
        var likeRef = skh.doc(skh.db, 'commentLikes', id + '__' + me);
        var cRef = skh.doc(skh.db, 'comments', id);
        var cur = (C.mine && C.mine[id]) || '';
        try {
            if (cur === key) {                                  // ondoa reaksini
                await skh.deleteDoc(likeRef);
                await skh.updateDoc(cRef, { likeCount: skh.increment(-1) });
                C.liked[id] = false;
            } else if (cur) {                                   // badilisha reaksini
                await skh.deleteDoc(likeRef);
                await skh.setDoc(likeRef, { userId: me, commentId: id, reaction: key, createdAt: nowIso() });
                C.liked[id] = true;
            } else {                                            // ongeza reaksini
                await skh.setDoc(likeRef, { userId: me, commentId: id, reaction: key, createdAt: nowIso() });
                await skh.updateDoc(cRef, { likeCount: skh.increment(1) });
                C.liked[id] = true;
            }
            C.reactionsLoaded = false;
            loadReactions();
        } catch (e) {
            console.warn('[maoni] reaksini', e);
        }
    };

    /* Baa ya kuchagua reaksini — moja kwa njia moja (soko lote) */
    function reactionBar() {
        var bar = document.getElementById('cmReactBar');
        if (bar) return bar;
        var host = document.querySelector('#maoniLayer .maoni-sheet') || document.querySelector('#maoniLayer') || document.body;
        bar = document.createElement('div');
        bar.id = 'cmReactBar';
        bar.className = 'cm-react-bar';
        bar.hidden = true;
        bar.innerHTML = '<div class="cm-react-list">' + REACTIONS.map(function (r) {
            return '<button type="button" data-k="' + r.k + '" title="' + esc(r.l) + '">'
                + '<span>' + r.e + '</span><small>' + esc(r.l) + '</small></button>';
        }).join('') + '</div>';
        bar.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('button[data-k]') : null;
            var cid = bar.__cid;
            bar.hidden = true;
            if (!b || !cid) return;
            window.skhCommentsReact(cid, b.getAttribute('data-k'));
        });
        host.appendChild(bar);
        return bar;
    }
    window.skhCmPickReaction = function (id) {
        var bar = reactionBar();
        if (!bar.hidden && bar.__cid === id) { bar.hidden = true; return; }
        if (!skh.requireAuth()) return;
        bar.__cid = id;
        bar.hidden = false;
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

    function findCommentById(id) {
        if (!id) return null;
        var all = [];
        (C.items || []).forEach(function (t) { all.push(t); (C.byParent && C.byParent[t.id] || []).forEach(function (r) { all.push(r); }); });
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
        return null;
    }

    window.skhCommentsSubmit = async function () {
        if (!skh.requireAuth() || C.sending) return;
        // [GESTURE REPLY 2026-09] Ukijibu kwenye fomu ndogo (chini ya swali),
        // soma kutoka hapo; la sivyo tumia box kuu ya maoni. Ikiwa fomu ndogo ipo
        // lakini HAIJAZWA, rudia kwenye box kuu (mtumiaji anaweza kuandika huko).
        var inpReply = document.getElementById('skhCmReplyInput');
        var inpMain = document.getElementById('skhCommentInput');
        var inp = null, text = '';
        if (inpReply && String(inpReply.value || '').trim()) { inp = inpReply; text = inpReply.value.trim(); }
        else if (inpMain) { inp = inpMain; text = String(inpMain.value || '').trim(); }
        else { inp = inpReply; }
        var mediaPending = (C.pendingMedia || []).slice();
        var hasMedia = mediaPending.length > 0;
        if (!text && !C.attachProduct && !hasMedia) {
            if (inp) { inp.focus(); }
            return; // hakuna cha kutuma (haina madhara)
        }
        var parent = C.replyingTo || null;
        var session = C.sessionSeq, targetId = C.targetId, targetType = C.targetType;
        var sellerId = C.sellerId, sellerName = C.sellerName, product = C.product;
        if (!inp) return;
        // Reuse a request key for the same draft after an ambiguous response.
        var attemptFingerprint = JSON.stringify([targetId, targetType, text, parent && parent.id, parent && parent.rootId, !!C.attachProduct,
            mediaPending.map(function (m) { var f = m.file || {}; return [f.name || '', f.size || 0, f.lastModified || 0, !!m.isVideo]; })]);
        if (!C.pendingAttempt || C.pendingAttempt.fingerprint !== attemptFingerprint) {
            var random = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID().replace(/-/g, '') : null;
            if (!random && window.crypto && window.crypto.getRandomValues) { var bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes); random = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
            C.pendingAttempt = { fingerprint: attemptFingerprint, id: random, mediaUrls: null };
        }
        var attempt = C.pendingAttempt;
        C.sending = true; inp.disabled = true;
        var sendControl = document.getElementById('skhCmSendBtn');
        if (sendControl) sendControl.disabled = true;
        function unlock() { if (session !== C.sessionSeq) return; C.sending = false; var i = document.getElementById('skhCommentInput'), b = document.getElementById('skhCmSendBtn'); if (i) i.disabled = false; if (b) { b.disabled = false; b.textContent = T('cm_send', 'Tuma'); } }
        // Preserve the author's words: comments may be feedback, not only questions.
        // [USHAHIDI 2026-09] Pakia picha/video KABLA ya kutuma (Cloudinary).
        var mediaUrls = attempt.mediaUrls ? attempt.mediaUrls.slice() : [];
        if (hasMedia && !attempt.mediaUrls) {
            var sendBtn = document.getElementById('skhCmSendBtn');
            if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '…'; }
            for (var mi = 0; mi < mediaPending.length; mi++) {
                var mm = mediaPending[mi];
                try {
                    var up = await window.skhUploadFromFile(mm.file, {
                        resourceType: mm.isVideo ? 'video' : 'image',
                        folder: 'sokohai/maoni'
                    });
                    if (up && up.url) mediaUrls.push(up.url);
                } catch (e) { /* A failed upload must not be silently discarded. */ }
            }
            if (session !== C.sessionSeq) return;
            if (mediaUrls.length !== mediaPending.length) {
                unlock();
                alert(T('cm_media_fail', 'Picha/video haikupakiwa. Tafadhali jaribu tena.'));
                return;
            }
            attempt.mediaUrls = mediaUrls.slice();
        }
        // [FIX 2026-11-17] Thibitisha kuwa maoni yatapanda kwenye bidhaa sahihi —
        // usiweze kuandika maoni ya bidhaa A kwenye bidhaa B kwa sababu C.targetId
        // ilibaki limeandaliwa yaliyopita.
        var curP = skh.currentOpenProduct;
        if (!curP || !curP.id || C.targetId !== curP.id || targetTypeOf(curP) !== targetType || session !== C.sessionSeq) {
            unlock();
            alert(T('cm_wrong_product', 'Tafadhali fungua maoni tena kwa bidhaa hii.') + ' ' +
                  T('cm_reload', 'Ikiwa shida hupakia, fungua bidhaa tena.'));
            if (inp) { inp.focus(); }
            return;
        }

        var payload = {
            targetType: C.targetType, targetId: C.targetId, text: text || '',
            authorName: myName(),
            authorPhoto: (skh.currentUserData && skh.currentUserData.photoURL) || (skh.currentUser && skh.currentUser.photoURL) || '',
            parentId: parent ? parent.id : null,
            rootId: parent ? parent.rootId : null,
            media: mediaUrls,
            ...(attempt.id ? { clientRequestId: attempt.id } : {})
        };
        if (C.attachProduct && C.product) {
            payload.productRef = {
                id: C.product.id, collection: C.product.collectionName || skh.currentFeedCollection || 'products',
                title: C.product.title || C.product.itemTitle || 'Bidhaa', price: C.product.price != null ? C.product.price : null,
                image: C.product.image || (C.product.images && C.product.images[0]) || C.product.photo || ''
            };
        }
        var published = null;
        var fn = cfCallable('commentsPublish');
        // 1) Server kwanza (badge za verifiedPurchase + rate-limit ni server-only).
        if (fn) {
            try {
                var res = await fn(payload);
                if (res && res.data && res.data.ok) published = res.data;
                else throw new Error(T('cm_publish_fail', 'Imeshindwa kutuma maoni.'));
            } catch (e) {
                // A dispatched request may already have committed: never retry as
                // a direct write on an ambiguous response.
                if (session !== C.sessionSeq) return;
                alert(T('cm_publish_fail', 'Imeshindwa kutuma maoni.') + ' ' + (typeof window.skhFnErrText === 'function' ? window.skhFnErrText(e, 'commentsPublish') : (e && e.message ? e.message : '')));
                unlock();
                var currentInput = document.getElementById('skhCommentInput'); if (currentInput) currentInput.focus();
                return;
            }
        }
        // Legacy direct-write fallback only when no callable can be constructed;
        // never repeat a request after the server has been contacted.
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
                if (session !== C.sessionSeq) return;
                alert(T('cm_publish_fail', 'Imeshindwa kutuma maoni.') + ' ' + (typeof window.skhFnErrText === 'function' ? window.skhFnErrText(e, 'commentsPublish') : (e && e.message ? e.message : '')));
                unlock();
                var currentInput = document.getElementById('skhCommentInput'); if (currentInput) currentInput.focus();
                return;
            }
        }
        // 3) Arifa (mfumo uliopo) + reset.
        if (session !== C.sessionSeq) return;
        try {
            var body = text || (product && product.title) || '';
            if (parent) {
                var parentAuthorId = published.parentAuthorId || (parentDoc ? parentDoc.authorId : null);
                if (parentAuthorId && parentAuthorId !== myUid()) notify(parentAuthorId, T('cm_reply_title', 'Jibu jipya'), body, 'comment_reply', { commentId: published.id, targetId: C.targetId });
            }
            var mentioned = false;
            if (text.indexOf('@') !== -1 && sellerName) {
                var token = sellerName.replace(/\s+/g, '').toLowerCase();
                if (text.toLowerCase().indexOf('@' + token) !== -1 || text.toLowerCase().indexOf('@' + token.replace(/[^a-z0-9]/g, '')) !== -1) mentioned = true;
            }
            if (sellerId && sellerId !== myUid() && (!parent || mentioned)) {
                notify(sellerId, mentioned ? T('cm_mention_title', 'Umetajwa kwenye maoni') : T('cm_new_title', 'Maoni Mapya'), body, mentioned ? 'comment_mention' : 'new_comment', { commentId: published.id, targetId: C.targetId });
            }
        } catch (e) { /* arifa si ya kusitisha */ }
        var finalInput = document.getElementById('skhCommentInput'); if (finalInput) finalInput.value = ''; C.draft = ''; C.sending = false; C.pendingAttempt = null;
        if (parent) C.threadShown[parent.rootId] = Math.max(C.threadShown[parent.rootId] || 2, (C.byParent[parent.rootId] || []).length + 1);
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
    window.skhCommentsLikeNative = async function (id) {
        var me = myUid();
        if (!me || !id) return { ok: false, error: 'no_user' };
        var likeId = id + '__' + me;   // (sawa na server: commentId__uid)
        var likeRef = skh.doc(skh.db, 'commentLikes', likeId);
        var cRef = skh.doc(skh.db, 'comments', id);
        var liked = !!C.liked[id];
        if (typeof skh.writeBatch !== 'function') throw new Error('Huduma ya maoni haipatikani.');
        // Rules check existsAfter: the like document and counter change must be
        // committed together, never leave a half-written like on failure.
        var batch = skh.writeBatch(skh.db);
        if (liked) batch.delete(likeRef);
        else batch.set(likeRef, { userId: me, commentId: id, createdAt: nowIso() });
        batch.update(cRef, { likeCount: skh.increment(liked ? -1 : 1) });
        await batch.commit();
        C.liked[id] = !liked;
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
                alert(T('cm_fail', 'Imeshindwa.') + ' ' + (typeof window.skhFnErrText === 'function' ? window.skhFnErrText(e, 'commentsLike') : T('cm_try_again', 'Tafadhali jaribu tena.')));
                return;
            }
        }
        // Hakuna callable -> Firestore-native, but only as one atomic batch.
        try {
            await window.skhCommentsLikeNative(id);
            C.loaded = false;
            await window.skhCommentsOpen(C.product);
        } catch (e) {
            alert(T('cm_fail', 'Imeshindwa.') + ' ' + T('cm_try_again', 'Tafadhali jaribu tena.'));
        }
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
        if (C.targetId !== p.id || C.targetType !== targetTypeOf(p) || !C.product) {
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

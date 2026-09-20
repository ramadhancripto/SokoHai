/* ==== js/app/28-buyer-engagement.js ==== */
// ============================================================
// BUYER ENGAGEMENT SYSTEM — Like / Save / Follow / Watch
// ------------------------------------------------------------
// Kanuni: relationships zinahifadhiwa kama DOCUMENTS tofauti
// (si arrays kubwa) ili mfumo uweze kukua (scalable):
//   productLikes/{uid__productId}
//   savedProducts/{uid__productId}
//   sellerFollowers/{uid__sellerId}
//   productWatches/{uid__productId}
//   notificationPreferences/{uid}
//   recommendationEvents/{autoId}
//   productPriceHistory/{productId}
//
// Backend (Firestore) ndio SOURCE OF TRUTH; UI ni optimistic tu.
// Anti-spam: doc moja kwa relationship — hakuna duplicates; muuzaji
// hawezi kujinunulia followers (organic pekee).
// ============================================================
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    var state = { liked: {}, saved: {}, watched: {}, following: {} };
    var prefsCache = null;

    // Tafsiri (lugha moja kwa wakati) — inatumia LMS ikiwa ipo, la sivyo fallback ya Kiingereza
    function engT(key, enFallback, vars) {
        var s = null;
        try { if (window.t) s = window.t(key, vars); } catch (e) {}
        if (!s || s === key) {
            s = enFallback || key;
            if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
        }
        return s;
    }

    // ---------- ICONS (SVG inline, HAKUNA emoji) ----------
    window.SKH_ICONS = {
        like: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px;display:block;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
        save: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px;display:block;"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>',
        follow: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;display:block;"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
        watch: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;display:block;"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-5v-1l-1-1v-5a6 6 0 0 0-4.5-5.8V3.5a1.5 1.5 0 0 0-3 0v.7A6 6 0 0 0 6 10v5l-1 1v1h14z"/></svg>',
        store: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;display:block;"><path d="M21 9V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v1H2v2c0 1.1.9 2 2 2h1v7h14v-7h1c1.1 0 2-.9 2-2V9h-1zm-4 8h-6v-4h6v4z"/></svg>',
        gear: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;display:block;"><path d="M19.14 12.94a7 7 0 0 0 .05-.94 7 7 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7 7 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54a7.2 7.2 0 0 0 1.62-.94l2.39.96c.21.1.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>'
    };

    // Jaza icons za SVG kwenye modali + My SokoHai tabs
    window.skhInitEngagementIcons = function () {
        var I = window.SKH_ICONS;
        var map = {
            engIcoFollow: I.follow, engIcoLike: I.like, engIcoSave: I.save, engIcoWatch: I.watch,
            skhTabIcoLiked: I.like, skhTabIcoSaved: I.save, skhTabIcoWatched: I.watch,
            skhTabIcoFollowing: I.follow, skhTabIcoPrefs: I.gear
        };
        Object.keys(map).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = map[id];
        });
        // Weka lebo za lugha sahihi kabla ya modali kufunguliwa
        var lbl = { 'btnFollow .eng-lbl': engT('eng_follow', 'Follow'), 'btnLike .eng-lbl': engT('eng_like', 'Like'), 'btnSave .eng-lbl': engT('eng_save', 'Save'), 'btnWatch .eng-lbl': engT('eng_watch', 'Watch Price')
        };
        Object.keys(lbl).forEach(function (sel) {
            var el = document.querySelector('#' + sel);
            if (el) el.textContent = lbl[sel];
        });
    };

    // ---------- Msaada ----------
    function relId(a, b) { return String(a || '') + '__' + String(b || ''); }
    function eKey(p) { return ((p && p.collectionName) || 'products') + '__' + (p && p.id); }
    function now() { return new Date().toISOString(); }
    function notifCol() { return skh.collection(skh.db, "notifications"); }
    function snapExists(s) { try { return !!(s && (typeof s.exists === 'function' ? s.exists() : s.exists)); } catch (e) { return false; } }
    function ownerNameOf(p) { return (p && (p.ownerName || p.driverName || p.sellerName || p.fullName || p.storeName)) || engT('eng_seller', 'Seller'); }
    function btnLabel(btn, txt) { if (!btn) return; var lbl = btn.querySelector('.eng-lbl'); if (lbl) lbl.textContent = txt; else btn.textContent = txt; }
    /* [FOLLOW UX 2026-09-14] Hapo awali kitufe kilibadilisha RANGI pekee —
       mtumiaji hakujua kama amefuata au la, wala hakuona idadi ya wafuasi.
       Sasa: neno linabadilika (Fuata -> Unafuata), rangi inabadilika,
       tiki inaonekana, na idadi ya wafuasi inaonyeshwa kando yake. */
    function fmtCount(n) {
        n = Number(n) || 0;
        if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
        if (n >= 1000)    return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
        return String(n);
    }

    function paintFollowBtn(btn, following, count) {
        if (!btn) return;
        btn.classList.toggle('is-following', !!following);
        btn.classList.toggle('btn-following', !!following);
        btn.classList.toggle('btn-not-following', !following);
        btn.setAttribute('aria-pressed', following ? 'true' : 'false');
        btn.setAttribute('title', following ? 'Unamfuata — bonyeza kuacha' : 'Mfuate muuzaji huyu');

        // Neno linalobadilika (ndilo linaloeleweka zaidi kuliko rangi pekee)
        var lbl = btn.querySelector('.eng-lbl');
        if (lbl) lbl.textContent = following ? 'Unafuata' : 'Fuata';

        // Ikoni: tiki ikiwa anafuata, plus ikiwa hafuati
        var ico = btn.querySelector('.eng-ico');
        if (ico && window.skhNavIcon) {
            ico.innerHTML = window.skhNavIcon(following ? 'check' : 'plus', 14);
        }

        // Idadi ya wafuasi
        if (count !== undefined && count !== null) {
            var n = btn.querySelector('.eng-count');
            if (!n) {
                n = document.createElement('span');
                n.className = 'eng-count';
                btn.appendChild(n);
            }
            var c = Number(count) || 0;
            n.textContent = c > 0 ? fmtCount(c) : '';
            n.style.display = c > 0 ? '' : 'none';
        }

        // Rangi (inabaki kama nyongeza, si ishara pekee)
        if (following) {
            btn.style.background = '#E7F7F2'; btn.style.color = '#0F7A5E'; btn.style.borderColor = '#BFE8DA';
        } else {
            btn.style.background = '#fff'; btn.style.color = 'var(--sh-blue, #1268A8)'; btn.style.borderColor = '#D4E0EC';
        }
    }
    window.skhPaintFollow = paintFollowBtn;

    /* Soma idadi halisi ya wafuasi wa muuzaji (users/{uid}.followers) */
    window.skhFollowerCount = async function (sellerId) {
        if (!sellerId || !skh.db) return null;
        try {
            var snap = await skh.getDoc(skh.doc(skh.db, 'users', sellerId));
            if (!snap || !snap.exists || !snap.exists()) return null;
            var d = snap.data() || {};
            if (Array.isArray(d.followers)) return d.followers.length;
            if (typeof d.followerCount === 'number') return d.followerCount;
            return null;
        } catch (e) { return null; }
    };

    function logEvent(type, data) {
        try {
            if (!skh.currentUser) return;
            skh.addDoc(skh.collection(skh.db, "recommendationEvents"), Object.assign({
                userId: skh.currentUser.uid,
                type: type,
                at: now()
            }, data || {})).catch(() => {});
        } catch (e) {}
    }

    function btnPaint(btn, active, activeColor) {
        if (!btn) return;
        if (active) {
            btn.classList.add('skh-eng-active');
            btn.style.color = activeColor || '#ef4444';
            btn.style.borderColor = (activeColor || '#ef4444');
        } else {
            btn.classList.remove('skh-eng-active');
            btn.style.color = '#64748b';
            btn.style.borderColor = '#cbd5e1';
        }
    }

    function productRef(p) {
        return skh.doc(skh.db, (p.collectionName || 'products'), p.id);
    }

    // ---------- LIKE ----------
    window.skhToggleLike = async function (p, btnEl) {
        if (!skh.requireAuth()) return;
        p = p || skh.currentOpenProduct;
        if (!p || !p.id) return;
        const id = p.id;
        const key = eKey(p);
        const wasLiked = !!state.liked[key];
        state.liked[key] = !wasLiked;
        btnPaint(btnEl, state.liked[key], '#ef4444');
        try {
            const relRef = skh.doc(skh.db, "productLikes", relId(skh.currentUser.uid, id));
            if (!wasLiked) {
                await skh.setDoc(relRef, { userId: skh.currentUser.uid, productId: id, collectionName: p.collectionName || 'products', likedAt: now() });
                await skh.updateDoc(productRef(p), { likes: skh.arrayUnion(skh.currentUser.uid), likeCount: skh.increment(1) });
                logEvent('PRODUCT_LIKED', { productId: id, collectionName: p.collectionName, sellerId: p.userId || null });
            } else {
                await skh.deleteDoc(relRef);
                await skh.updateDoc(productRef(p), { likes: skh.arrayRemove(skh.currentUser.uid), likeCount: skh.increment(-1) });
                logEvent('PRODUCT_UNLIKED', { productId: id, collectionName: p.collectionName });
            }
        } catch (e) {
            state.liked[key] = wasLiked; // rudisha hali
            btnPaint(btnEl, wasLiked, '#ef4444');
            console.warn('[engage:like]', e && e.message);
        }
    };

    // ---------- SAVE (WISHLIST) ----------
    window.skhToggleSave = async function (p, btnEl) {
        if (!skh.requireAuth()) return;
        p = p || skh.currentOpenProduct;
        if (!p || !p.id) return;
        const id = p.id;
        const key = eKey(p);
        const wasSaved = !!state.saved[key];
        state.saved[key] = !wasSaved;
        btnPaint(btnEl, state.saved[key], '#f59e0b');
        if (btnEl) btnLabel(btnEl, state.saved[key] ? engT('eng_saved', 'Saved') : engT('eng_save', 'Save'));
        try {
            const relRef = skh.doc(skh.db, "savedProducts", relId(skh.currentUser.uid, id));
            if (!wasSaved) {
                await skh.setDoc(relRef, {
                    userId: skh.currentUser.uid,
                    productId: id,
                    collectionName: p.collectionName || 'products',
                    title: p.title || '',
                    image: p.image || '',
                    price: p.price || 0,
                    prevPrice: p.prevPrice || null,
                    stockStatus: p.stockStatus || (Number(p.stock) > 0 ? 'in_stock' : 'unknown'),
                    delivery: p.delivery || p.deliveryOption || p.shipping || '',
                    sellerId: p.userId || '',
                    sellerName: ownerNameOf(p),
                    savedAt: now()
                });
                await skh.updateDoc(productRef(p), { savedCount: skh.increment(1) });
                logEvent('PRODUCT_SAVED', { productId: id, collectionName: p.collectionName, sellerId: p.userId || null });
            } else {
                await skh.deleteDoc(relRef);
                await skh.updateDoc(productRef(p), { savedCount: skh.increment(-1) });
                logEvent('PRODUCT_UNSAVED', { productId: id, collectionName: p.collectionName });
            }
        } catch (e) {
            state.saved[key] = wasSaved;
            btnPaint(btnEl, wasSaved, '#f59e0b');
            if (btnEl) btnLabel(btnEl, wasSaved ? engT('eng_saved', 'Saved') : engT('eng_save', 'Save'));
            console.warn('[engage:save]', e && e.message);
        }
    };

    // ---------- WATCH PRICE ----------
    window.skhToggleWatch = async function (p, btnEl) {
        if (!skh.requireAuth()) return;
        p = p || skh.currentOpenProduct;
        if (!p || !p.id) return;
        const id = p.id;
        const key = eKey(p);
        const wasWatched = !!state.watched[key];
        state.watched[key] = !wasWatched;
        btnPaint(btnEl, state.watched[key], '#0ea5e9');
        if (btnEl) btnLabel(btnEl, state.watched[key] ? engT('eng_watching', 'Watching') : engT('eng_watch', 'Watch Price'));
        try {
            const relRef = skh.doc(skh.db, "productWatches", relId(skh.currentUser.uid, id));
            if (!wasWatched) {
                await skh.setDoc(relRef, { userId: skh.currentUser.uid, productId: id, collectionName: p.collectionName || 'products', priceAtWatch: p.price || 0, watchedAt: now() });
                logEvent('PRODUCT_WATCHED', { productId: id, collectionName: p.collectionName });
            } else {
                await skh.deleteDoc(relRef);
                logEvent('PRODUCT_UNWATCHED', { productId: id, collectionName: p.collectionName });
            }
        } catch (e) {
            state.watched[key] = wasWatched;
            btnPaint(btnEl, wasWatched, '#0ea5e9');
            if (btnEl) btnLabel(btnEl, wasWatched ? engT('eng_watching', 'Watching') : engT('eng_watch', 'Watch Price'));
            console.warn('[engage:watch]', e && e.message);
        }
    };

    // ---------- FOLLOW SELLER ----------
    window.skhToggleFollowSeller = async function (sellerId, sellerName, btnEl) {
        if (!skh.requireAuth()) return;
        if (!sellerId || sellerId === skh.currentUser.uid) return;
        const key = sellerId;
        const wasFollowing = !!state.following[key];
        state.following[key] = !wasFollowing;
        if (btnEl) {
            // Idadi ibadilike PAPO HAPO (+1 / -1) ili mtumiaji aone athari mara moja
            var cur = Number(btnEl.dataset.count);
            if (!isFinite(cur)) cur = 0;
            cur = Math.max(0, cur + (state.following[key] ? 1 : -1));
            btnEl.dataset.count = cur;
            paintFollowBtn(btnEl, state.following[key], cur);
            if (typeof skhToast === 'function') {
                skhToast(state.following[key]
                    ? 'Unamfuata ' + (sellerName || 'muuzaji') + ' sasa.'
                    : 'Umeacha kumfuata ' + (sellerName || 'muuzaji') + '.',
                    state.following[key] ? 'success' : 'info', 2000);
            }
        }
        try {
            const relRef = skh.doc(skh.db, "sellerFollowers", relId(skh.currentUser.uid, sellerId));
            if (!wasFollowing) {
                await skh.setDoc(relRef, { followerId: skh.currentUser.uid, sellerId: sellerId, sellerName: sellerName || '', followedAt: now() });
            } else {
                await skh.deleteDoc(relRef);
            }
            // Sync ya zamani (users.following/followers) kwa dashboard za sasa
            try {
                const myDocRef = skh.doc(skh.db, "users", skh.currentUserData && skh.currentUserData.docId ? skh.currentUserData.docId : skh.currentUser.uid);
                const q = skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", sellerId));
                const snap = await skh.getDocs(q);
                if (!snap.empty) {
                    const tRef = skh.doc(skh.db, "users", snap.docs[0].id);
                    if (!wasFollowing) {
                        await skh.updateDoc(myDocRef, { following: skh.arrayUnion(sellerId) });
                        await skh.updateDoc(tRef, { followers: skh.arrayUnion(skh.currentUser.uid) });
                    } else {
                        await skh.updateDoc(myDocRef, { following: skh.arrayRemove(sellerId) });
                        await skh.updateDoc(tRef, { followers: skh.arrayRemove(skh.currentUser.uid) });
                    }
                }
            } catch (e2) { /* hiari */ }
            logEvent(wasFollowing ? 'SELLER_UNFOLLOWED' : 'SELLER_FOLLOWED', { sellerId: sellerId });
        } catch (e) {
            state.following[key] = wasFollowing;
            console.warn('[engage:follow]', e && e.message);
        }
    };
    // Alias ya legacy (kitufe cha Follow kwenye modali)
    window.skhToggleFollow = window.skhToggleFollowSeller;

    // ---------- CARD CACHE + QUICK TOGGLE ----------
    window.skhEngagementState = state;
    window.skhCardIndex = {};

    window.skhCardToggle = function (kind, id) {
        var p = window.skhCardIndex[id];
        if (!p) p = { id: id, collectionName: 'products' };
        var btn = null;
        if (kind === 'like') { btn = document.getElementById('cardLike_' + id); window.skhToggleLike(p, btn); }
        else if (kind === 'save') { btn = document.getElementById('cardSave_' + id); window.skhToggleSave(p, btn); }
        else if (kind === 'watch') { btn = document.getElementById('cardWatch_' + id); window.skhToggleWatch(p, btn); }
        if (btn) btn.classList.add('skh-eng-touched');
    };

    // Pakia hali ya likes/saves/watches za mtumiaji (kwa kadi za feed) — mara moja
    window.skhLoadMyEngagementMap = async function () {
        if (!skh.currentUser) return;
        try {
            var uid = skh.currentUser.uid;
            var q1 = skh.query(skh.collection(skh.db, "productLikes"), skh.where("userId", "==", uid), skh.limit(300));
            var q2 = skh.query(skh.collection(skh.db, "savedProducts"), skh.where("userId", "==", uid), skh.limit(300));
            var q3 = skh.query(skh.collection(skh.db, "productWatches"), skh.where("userId", "==", uid), skh.limit(300));
            var [s1, s2, s3] = await Promise.all([skh.getDocs(q1), skh.getDocs(q2), skh.getDocs(q3)]);
            s1.forEach(function (d) { var x = d.data(); state.liked[(x.collectionName || 'products') + '__' + x.productId] = true; });
            s2.forEach(function (d) { var x = d.data(); state.saved[(x.collectionName || 'products') + '__' + x.productId] = true; });
            s3.forEach(function (d) { var x = d.data(); state.watched[(x.collectionName || 'products') + '__' + x.productId] = true; });
        } catch (e) { /* hiari */ }
    };

    // ---------- MODAL WRAPPERS (kutoka product modal) ----------
    window.skhModalLike = function () { window.skhToggleLike(skh.currentOpenProduct, document.getElementById('btnLike')); };
    window.skhModalSave = function () { window.skhToggleSave(skh.currentOpenProduct, document.getElementById('btnSave')); };
    window.skhModalWatch = function () { window.skhToggleWatch(skh.currentOpenProduct, document.getElementById('btnWatch')); };
    window.skhModalFollow = function () {
        if (!skh.currentOpenProduct) return;
        window.skhToggleFollowSeller(skh.currentOpenProduct.userId, ownerNameOf(skh.currentOpenProduct), document.getElementById('btnFollow'));
    };

    // ---------- Pakia hali (liked/saved/watched/following) ----------
    window.skhLoadEngagementState = async function (p) {
        p = p || skh.currentOpenProduct;
        if (!p || !p.id || !skh.currentUser) return;
        const uid = skh.currentUser.uid;
        const key = eKey(p);
        const checks = [
            skh.getDoc(skh.doc(skh.db, "productLikes", relId(uid, p.id))),
            skh.getDoc(skh.doc(skh.db, "savedProducts", relId(uid, p.id))),
            skh.getDoc(skh.doc(skh.db, "productWatches", relId(uid, p.id)))
        ];
        if (p.userId && p.userId !== uid) {
            checks.push(skh.getDoc(skh.doc(skh.db, "sellerFollowers", relId(uid, p.userId))));
        }
        try {
            const results = await Promise.all(checks);
            state.liked[key] = snapExists(results[0]);
            state.saved[key] = snapExists(results[1]);
            state.watched[key] = snapExists(results[2]);
            if (results.length > 3 && p.userId) {
                state.following[p.userId] = snapExists(results[3]);
            }
        } catch (e) { /* hiari */ }
        window.skhRefreshEngagementButtons(p);
    };

    window.skhRefreshEngagementButtons = function (p) {
        p = p || skh.currentOpenProduct;
        if (!p) return;
        const key = eKey(p);
        const bLike = document.getElementById('btnLike');
        const bSave = document.getElementById('btnSave');
        const bWatch = document.getElementById('btnWatch');
        const bFollow = document.getElementById('btnFollow');
        if (bLike) { btnPaint(bLike, !!state.liked[key], '#ef4444'); btnLabel(bLike, state.liked[key] ? engT('eng_liked', 'Liked') : engT('eng_like', 'Like')); }
        if (bSave) { btnPaint(bSave, !!state.saved[key], '#f59e0b'); btnLabel(bSave, state.saved[key] ? engT('eng_saved', 'Saved') : engT('eng_save', 'Save')); }
        if (bWatch) { btnPaint(bWatch, !!state.watched[key], '#0ea5e9'); btnLabel(bWatch, state.watched[key] ? engT('eng_watching', 'Watching') : engT('eng_watch', 'Watch Price')); }
        if (bFollow) {
            const f = !!state.following[p.userId];
            bFollow.classList.toggle('btn-following', f);
            bFollow.classList.toggle('btn-not-following', !f);
            paintFollowBtn(bFollow, f);
            if (skh.currentUser && p.userId === skh.currentUser.uid) bFollow.style.display = 'none';
            else bFollow.style.display = 'flex';
            // Idadi halisi ya wafuasi (haizuii UI — inaingia ikishafika)
            if (p.userId) {
                window.skhFollowerCount(p.userId).then(function (c) {
                    if (c !== null && document.getElementById('btnFollow') === bFollow) {
                        bFollow.dataset.count = c;
                        paintFollowBtn(bFollow, !!state.following[p.userId], c);
                    }
                });
            }
        }
    };

    // ---------- NOTIFICATION PREFERENCES ----------
    var DEFAULT_PREFS = {
        seller: { newProducts: true, priceDrops: true, restock: true, deals: true, allUpdates: false },
        product: { priceDrop: true, restock: true, majorDeal: true },
        // [CHAT/COMMENTS 2026-09] vikundi vipya (additive) — chat & comments
        // zinaheshimu mapendeleo yaliyopo ya arifa.
        chat: { newMessage: true, newOffer: true },
        comments: { newComment: true, mention: true, reply: true }
    };
    function mergePrefs(o) {
        var s = Object.assign({}, DEFAULT_PREFS.seller, (o && o.seller) || {});
        var pr = Object.assign({}, DEFAULT_PREFS.product, (o && o.product) || {});
        var ch = Object.assign({}, DEFAULT_PREFS.chat, (o && o.chat) || {});
        var cm = Object.assign({}, DEFAULT_PREFS.comments, (o && o.comments) || {});
        return { seller: s, product: pr, chat: ch, comments: cm };
    }
    // Prefs za kila follower zinahifadhiwa Firestore (notificationPreferences/{uid})
    var prefsByUser = {};
    async function prefsForUser(uid) {
        if (prefsByUser[uid]) return prefsByUser[uid];
        try {
            var d = await skh.getDoc(skh.doc(skh.db, "notificationPreferences", uid));
            if (snapExists(d)) {
                prefsByUser[uid] = mergePrefs(d.data());
                return prefsByUser[uid];
            }
        } catch (e) { /* fallback chini */ }
        prefsByUser[uid] = mergePrefs(null);
        return prefsByUser[uid];
    }
    window.skhGetNotifPrefs = function () {
        if (prefsCache) return prefsCache;
        try {
            var raw = skh.localStorage.getItem('sokohai_notif_prefs');
            if (raw) { prefsCache = mergePrefs(JSON.parse(raw)); return prefsCache; }
        } catch (e) {}
        prefsCache = mergePrefs(null);
        return prefsCache;
    };
    window.skhSetNotifPref = function (group, key, value) {
        var p = window.skhGetNotifPrefs();
        if (p[group]) p[group][key] = !!value;
        try { skh.localStorage.setItem('sokohai_notif_prefs', JSON.stringify(p)); } catch (e) {}
        // Hifadhi kwenye Firestore (source of truth)
        try {
            if (skh.currentUser) {
                skh.setDoc(skh.doc(skh.db, "notificationPreferences", skh.currentUser.uid), p, { merge: true }).catch(() => {});
            }
        } catch (e) {}
        return p;
    };
    window.skhAllowedNotif = function (group, key) {
        var p = window.skhGetNotifPrefs();
        return !!(p[group] && p[group][key]);
    };

    // ---------- NOTIFICATION ENGINE ----------
    function sendNotif(userId, title, body, type, meta) {
        if (!userId) return Promise.resolve();
        return skh.addDoc(notifCol(), Object.assign({
            userId: userId, title: title, body: body, createdAt: now(), read: false, type: type || 'engagement'
        }, meta || {})).catch(() => {});
    }
    // [CHAT/COMMENTS 2026-09] Tumia injini HII HII kwa chat/comments —
    // hakuna mfumo wa pili wa arifa. (inayojitosheleza kwa modules za baadaye)
    window.skhEngageSendNotif = sendNotif;

    // Mteja anavutiwa na category gani? (kutoka likes/saves/watches zake)
    async function interestsOf(userId, limitN) {
        var cats = new Set(), words = new Set();
        var cols = ["productLikes", "savedProducts", "productWatches"];
        for (var i = 0; i < cols.length; i++) {
            try {
                var q = skh.query(skh.collection(skh.db, cols[i]), skh.where("userId", "==", userId), skh.limit(limitN || 8));
                var snap = await skh.getDocs(q);
                snap.forEach(function (d) {
                    var it = d.data();
                    if (it.category) cats.add(String(it.category).toLowerCase());
                    if (it.title) String(it.title).toLowerCase().split(/\s+/).forEach(function (w) { if (w.length > 3) words.add(w); });
                });
            } catch (e) {}
        }
        return { cats: cats, words: words };
    }

    function relevantTo(product, interests) {
        if (!product) return false;
        var cat = String(product.category || '').toLowerCase();
        var title = String(product.title || '').toLowerCase();
        if (cat && interests.cats.has(cat)) return true;
        var hit = false;
        interests.words.forEach(function (w) { if (title.indexOf(w) !== -1) hit = true; });
        return hit;
    }

    // NEW_PRODUCT_PUBLISHED -> arifu followers wenye interest husika
    window.skhNotifyNewProduct = async function (product, sellerId) {
        if (!sellerId) return { notified: 0 };
        try {
            var q = skh.query(skh.collection(skh.db, "sellerFollowers"), skh.where("sellerId", "==", sellerId), skh.limit(200));
            var snap = await skh.getDocs(q);
            var ids = [];
            snap.forEach(function (d) { var f = d.data(); if (f.followerId) ids.push(f.followerId); });
            var sent = 0;
            for (var i = 0; i < ids.length; i++) {
                var uid = ids[i];
                var prefs = await prefsForUser(uid);
                if (!prefs.seller.newProducts) continue; // hatahitaji taarifa za bidhaa mpya
                var interests = await interestsOf(uid, 8);
                // Smart: tuma tu ikiwa ana interest husika au amewasha "all updates"
                if (!relevantTo(product, interests) && !prefs.seller.allUpdates) continue;
                await sendNotif(uid,
                    engT('notif_new_product', 'New Product') + ': ' + (product.title || engT('products', 'Products')),
                    engT('notif_new_product_body', 'New product from a seller you follow: {title} — TSh {price}.', { title: product.title || '', price: Number(product.price || 0).toLocaleString() }), 'engagement', { productId: product.id, sellerId: sellerId });
                sent++;
            }
            return { notified: sent };
        } catch (e) {
            console.warn('[engage:new-product]', e && e.message);
            return { notified: 0 };
        }
    };

    // PRICE_DROPPED -> arifu watchers + savers
    window.skhNotifyPriceDrop = async function (product, oldPrice, newPrice) {
        if (!product || !product.id) return;
        try {
            var users = new Set();
            var qW = skh.query(skh.collection(skh.db, "productWatches"), skh.where("productId", "==", product.id), skh.limit(100));
            var qS = skh.query(skh.collection(skh.db, "savedProducts"), skh.where("productId", "==", product.id), skh.limit(100));
            var [sw, ss] = await Promise.all([skh.getDocs(qW), skh.getDocs(qS)]);
            sw.forEach(function (d) { users.add(d.data().userId); });
            ss.forEach(function (d) { users.add(d.data().userId); });
            var arr = Array.from(users);
            for (var i = 0; i < arr.length; i++) {
                var uid = arr[i];
                if (uid === (skh.currentUser && skh.currentUser.uid)) continue;
                var prefs = await prefsForUser(uid);
                if (!prefs.product.priceDrop) continue;
                sendNotif(uid,
                    engT('notif_price_drop', 'Price Dropped'),
                    engT('notif_price_drop_body', '{title} you saved/watched dropped from TSh {old} to TSh {new}.', { title: product.title || engT('products', 'Products'), old: Number(oldPrice || 0).toLocaleString(), new: Number(newPrice || 0).toLocaleString() }), 'engagement', { productId: product.id });
            }
            logEvent('PRODUCT_PRICE_DROPPED', { productId: product.id, oldPrice: oldPrice, newPrice: newPrice });
        } catch (e) { console.warn('[engage:price-drop]', e && e.message); }
    };

    // RESTOCKED -> arifu watchers + savers
    window.skhNotifyRestock = async function (product) {
        if (!product || !product.id) return;
        try {
            var users = new Set();
            var qW = skh.query(skh.collection(skh.db, "productWatches"), skh.where("productId", "==", product.id), skh.limit(100));
            var qS = skh.query(skh.collection(skh.db, "savedProducts"), skh.where("productId", "==", product.id), skh.limit(100));
            var [sw, ss] = await Promise.all([skh.getDocs(qW), skh.getDocs(qS)]);
            sw.forEach(function (d) { users.add(d.data().userId); });
            ss.forEach(function (d) { users.add(d.data().userId); });
            var arr = Array.from(users);
            for (var i = 0; i < arr.length; i++) {
                var uid = arr[i];
                if (uid === (skh.currentUser && skh.currentUser.uid)) continue;
                var prefs = await prefsForUser(uid);
                if (!prefs.product.restock) continue;
                sendNotif(uid,
                    engT('notif_restock', 'Back in Stock'),
                    engT('notif_restock_body', '{title} you saved/watched is available again.', { title: product.title || engT('products', 'Products') }), 'engagement', { productId: product.id });
            }
            logEvent('PRODUCT_RESTOCKED', { productId: product.id });
        } catch (e) { console.warn('[engage:restock]', e && e.message); }
    };

    // ---------- PRODUCT PUBLISHED (hook kutoka saveData) ----------
    // Inahifadhi snapshot ya bei/stock + kutambua price-drop/restock + arifu followers
    window.skhOnProductPublished = async function (product, collectionName, docId) {
        try {
            var histRef = skh.doc(skh.db, "productPriceHistory", docId);
            var prev = null;
            try {
                var h = await skh.getDoc(histRef);
                if (snapExists(h)) prev = h.data();
            } catch (e) {}
            var price = Number(product.price || 0);
            var stock = product.stock != null ? Number(product.stock) : (prev ? prev.stock : null);
            await skh.setDoc(histRef, {
                productId: docId, collectionName: collectionName || 'products',
                price: price, prevPrice: prev ? prev.price : null, stock: stock, updatedAt: now()
            }).catch(() => {});
            if (prev) {
                var dropThreshold = Math.max(1000, (prev.price || 0) * 0.05);
                if (prev.price > 0 && price > 0 && (prev.price - price) >= dropThreshold) {
                    await window.skhNotifyPriceDrop(Object.assign({}, product, { id: docId, collectionName: collectionName }), prev.price, price);
                }
                if ((prev.stock === 0 || prev.stock === '0') && stock > 0) {
                    await window.skhNotifyRestock(Object.assign({}, product, { id: docId, collectionName: collectionName }));
                }
            }
            // Arifu followers kuhusu bidhaa mpya (relevance-filtered)
            if (product.userId) {
                await window.skhNotifyNewProduct(Object.assign({}, product, { id: docId, collectionName: collectionName }), product.userId);
            }
        } catch (e) { console.warn('[engage:on-product]', e && e.message); }
    };

    // ---------- MY SOKOHAI (buyer dashboard) ----------
    var activeTab = 'liked';
    window.skhMySokoHaiTab = function (tab, el) {
        activeTab = tab;
        var btns = document.querySelectorAll('#mySokoHaiModal .skh-mytab');
        if (btns) btns.forEach(function (b) { b.style.background = '#e2e8f0'; b.style.color = '#334155'; });
        if (el) { el.style.background = '#001122'; el.style.color = '#fff'; }
        window.skhRenderEngagementTab(tab);
    };

    window.skhOpenMySokoHai = function (tab) {
        if (!skh.requireAuth()) return;
        closeModals();
        var m = document.getElementById('mySokoHaiModal');
        if (!m) { alert(engT('my_mod_missing', 'My SokoHai module is missing.')); return; }
        window.skhInitEngagementIcons();
        m.style.display = 'flex';
        window.skhMySokoHaiTab(tab || 'liked');
    };

    function relCard(it, kind) {
        var meta = [];
        if (kind === 'saved') {
            if (it.stockStatus === 'in_stock') meta.push(engT('eng_in_stock', 'In stock'));
            else meta.push(engT('eng_out_stock', 'Out of stock'));
            if (it.prevPrice && Number(it.prevPrice) > Number(it.price)) meta.push(engT('eng_was_price', 'Was TSh') + ' ' + Number(it.prevPrice).toLocaleString());
            if (it.delivery) meta.push(engT('delivery', 'Delivery') + ': ' + skh.skhEscape(String(it.delivery)));
            if (it.sellerName) meta.push(engT('eng_seller', 'Seller') + ': ' + skh.skhEscape(String(it.sellerName)));
            if (state.liked[(it.collectionName || 'products') + '__' + it.productId]) meta.push(engT('eng_liked_badge', 'You liked this'));
            if (it.savedAt) meta.push(engT('eng_saved_on', 'Saved on') + ' ' + new Date(it.savedAt).toLocaleDateString(window.SokoHaiLMS && window.SokoHaiLMS.lang === 'en' ? 'en-GB' : 'sw-TZ'));
        }
        return `
        <div class="list-item" style="cursor:pointer;" onclick="openProduct('${skh.skhJsEsc(it.productId || '')}', '${skh.skhJsEsc(it.collectionName || 'products')}')"> <img src="${skh.skhEscape(it.image || 'https://ui-avatars.com/api/?name=Bidhaa&background=f1f5f9&color=64748b')}" style="width:50px;height:50px;border-radius:10px;object-fit:cover;background:#f1f5f9;" onerror="this.src='https://ui-avatars.com/api/?name=Bidhaa&background=f1f5f9&color=64748b'"> <div class="list-info"> <b>${skh.skhEscape(it.title || engT('products', 'Products'))}</b> <span style="color:var(--terracotta);font-weight:900;">TSh ${Number(it.price || 0).toLocaleString()}</span>
                ${meta.length ? '<small style="color:#64748b;">' + meta.join(' · ') + '</small>' : ''}
            </div> </div>`;
    }

    window.skhRenderEngagementTab = async function (tab) {
        var box = document.getElementById('mySokoHaiContent');
        if (!box) return;
        box.innerHTML = '<p style="text-align:center;color:#64748b;padding:30px;">' + engT('my_loading', 'Loading...') + '</p>';
        var uid = skh.currentUser.uid;
        var q, col, kind;
        try {
            if (tab === 'liked') { col = 'productLikes'; kind = 'liked'; }
            else if (tab === 'saved') { col = 'savedProducts'; kind = 'saved'; }
            else if (tab === 'watched') { col = 'productWatches'; kind = 'watched'; }
            else if (tab === 'following') { col = 'sellerFollowers'; kind = 'following'; }
            else if (tab === 'prefs') { window.skhRenderNotifPrefs(); return; }
            else { box.innerHTML = ''; return; }

            if (tab === 'following') {
                q = skh.query(skh.collection(skh.db, col), skh.where("followerId", "==", uid), skh.limit(60));
                var snap = await skh.getDocs(q);
                var rows = '';
                snap.forEach(function (d) {
                    var f = d.data();
                    rows += `
                    <div class="list-item" style="justify-content:space-between;"> <div style="display:flex;align-items:center;gap:12px;"> <div style="width:45px;height:45px;background:#16a34a;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;">${window.SKH_ICONS ? window.SKH_ICONS.store : ''}</div> <div><b>${skh.skhEscape(f.sellerName || engT('eng_seller', 'Seller'))}</b><small style="display:block;color:#64748b;">${engT('eng_follow_since', 'Following since')} ${new Date(f.followedAt).toLocaleDateString(window.SokoHaiLMS && window.SokoHaiLMS.lang === 'en' ? 'en-GB' : 'sw-TZ')}</small></div> </div> <button onclick="window.skhToggleFollowSeller('${skh.skhJsEsc(f.sellerId)}','${skh.skhJsEsc(f.sellerName || '')}',this)" style="padding:8px 12px;background:#fee2e2;color:#ef4444;border:none;border-radius:8px;font-weight:800;cursor:pointer;">${engT('eng_unfollow', 'Unfollow')}</button> </div>`;
                });
                box.innerHTML = rows || '<p style="text-align:center;color:#64748b;">' + engT('my_no_following', 'You are not following any seller yet.') + '</p>';
                return;
            }

            // [LIVE-FIX 2026-09] Docs za engagement hazina `createdAt` — zinaweka
            // likedAt / watchedAt / savedAt. orderBy('createdAt') ilikuwa inarudisha
            // TUPU kila wakati (Firestore huacha docs zisizo na uga wa orderBy).
            q = skh.query(skh.collection(skh.db, col), skh.where("userId", "==", uid), skh.limit(60));
            var snap2 = await skh.getDocs(q);
            var items = [];
            snap2.forEach(function (d) { items.push(d.data()); });
            var tsField = col === 'productLikes' ? 'likedAt' : (col === 'productWatches' ? 'watchedAt' : 'savedAt');
            items.sort(function (a, b) { var x = String(a[tsField] || ''), y = String(b[tsField] || ''); return x < y ? 1 : (x > y ? -1 : 0); });
            if (!items.length) {
                box.innerHTML = '<p style="text-align:center;color:#64748b;padding:30px;">' + engT('my_no_items', 'Nothing here yet.') + '</p>';
                return;
            }
            box.innerHTML = items.map(function (it) { return relCard(it, kind); }).join('');
        } catch (e) {
            box.innerHTML = '<p style="color:red;text-align:center;">' + engT('my_error', 'Error') + ': ' + skh.skhEscape(e && e.message) + '</p>';
        }
    };

    window.skhRenderNotifPrefs = function () {
        var box = document.getElementById('mySokoHaiContent');
        if (!box) return;
        var p = window.skhGetNotifPrefs();
        function row(group, key, label) {
            var on = p[group][key];
            return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;"> <b style="font-size:13px;color:#0f172a;">${label}</b> <label style="position:relative;display:inline-block;width:42px;height:24px;"> <input type="checkbox" ${on ? 'checked' : ''} onchange="window.skhSetNotifPref('${group}','${key}',this.checked); this.checked ? this.parentElement.style.background='' : null;" style="opacity:0;width:0;height:0;"> <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${on ? '#16a34a' : '#cbd5e1'};border-radius:24px;transition:.3s;"></span> </label> </div>`;
        }
        box.innerHTML = `
            <b style="font-size:12px;color:#0f172a;display:block;margin:10px 0 8px;">${engT('my_seller_updates', 'Seller Updates')}</b>
            ${row('seller','newProducts', engT('my_new_products', 'New products'))}
            ${row('seller','priceDrops', engT('my_price_dropped', 'Price dropped'))}
            ${row('seller','restock', engT('my_restock', 'Restock'))}
            ${row('seller','deals', engT('my_special_deals', 'Special deals'))}
            ${row('seller','allUpdates', engT('my_all_updates', 'All updates'))}
            <b style="font-size:12px;color:#0f172a;display:block;margin:16px 0 8px;">${engT('my_product_updates', 'Product Updates (watched)')}</b>
            ${row('product','priceDrop', engT('my_price_drop', 'Price drop'))}
            ${row('product','restock', engT('my_restock', 'Restock'))}
            ${row('product','majorDeal', engT('my_major_deal', 'Major deal'))} `;
    };

    // ---------- PERSONALIZED HOME FEED ----------
    window.skhRenderPersonalizedFeed = async function () {
        if (!skh.currentUser) return;
        var host = document.getElementById('recommendedFeed');
        if (!host) return;
        try {
            var uid = skh.currentUser.uid;
            var q1 = skh.query(skh.collection(skh.db, "savedProducts"), skh.where("userId", "==", uid), skh.limit(4));
            var q2 = skh.query(skh.collection(skh.db, "productLikes"), skh.where("userId", "==", uid), skh.limit(4));
            var q3 = skh.query(skh.collection(skh.db, "sellerFollowers"), skh.where("followerId", "==", uid), skh.limit(4));
            var [s1, s2, s3] = await Promise.all([skh.getDocs(q1), skh.getDocs(q2), skh.getDocs(q3)]);
            var refs = {}; // key -> {collectionName, id}
            s1.forEach(function (d) { var x = d.data(); refs[x.collectionName + '__' + x.productId] = { collectionName: x.collectionName || 'products', id: x.productId }; });
            s2.forEach(function (d) { var x = d.data(); refs[x.collectionName + '__' + x.productId] = { collectionName: x.collectionName || 'products', id: x.productId }; });
            // bidhaa mpya kutoka kwa wauzaji unaowafuata
            var sellerIds = [];
            s3.forEach(function (d) { var f = d.data(); if (f.sellerId) sellerIds.push(f.sellerId); });
            if (sellerIds.length) {
                try {
                    // [FIX 2026-09] Hakuna orderBy — inaepuka hitaji la composite index.
                    var qp = skh.query(skh.collection(skh.db, "products"), skh.where("userId", "in", sellerIds.slice(0, 4)), skh.limit(4));
                    var sp = await skh.getDocs(qp);
                    var tmp = [];
                    sp.forEach(function (d) { tmp.push({ collectionName: 'products', id: d.id, createdAt: (d.data() || {}).createdAt }); });
                    tmp.sort(function (a, b) { return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0); });
                    tmp.forEach(function (t) { refs['products__' + t.id] = { collectionName: 'products', id: t.id }; });
                } catch (e) {}
            }
            var refVals = Object.keys(refs).map(function (k) { return refs[k]; });
            if (!refVals.length) { host.style.display = 'none'; return; }
            var docs = [];
            await Promise.all(refVals.slice(0, 6).map(async function (r) {
                try {
                    var ds = await skh.getDoc(skh.doc(skh.db, r.collectionName, r.id));
                    if (snapExists(ds)) docs.push(Object.assign({ id: ds.id, collectionName: r.collectionName }, ds.data()));
                } catch (e) {}
            }));
            if (!docs.length) { host.style.display = 'none'; return; }
            try { if (window.sessionStorage.getItem('skh_recommended_hidden') === '1') { host.style.display = 'none'; return; } } catch (e) {}
            host.style.display = 'block';
            host.innerHTML = `
                <div class="strategy-header" style="gap:8px; margin-bottom:10px;"> <div style="min-width:0;"> <b>${engT('eng_rec_title', 'Recommended for You')}</b> <small style="color:#94a3b8;font-size:12.5px; display:block; letter-spacing:0; text-transform:none;">${engT('eng_rec_sub', 'Based on your likes, saves and follows')}</small> </div> <button onclick="window.skhHideRecommended()" title="${engT('eng_hide', 'Hide')}" aria-label="${engT('eng_hide', 'Hide')}" style="background:#eef2f6; color:#475569; border:none; width:26px; height:26px; border-radius:50%; font-weight:900; font-size:13px; cursor:pointer; flex-shrink:0; line-height:1;">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button> </div> <div class="item-slider">${docs.map(function (d) {
                    var img = skh.skhEscape(d.image || 'https://ui-avatars.com/api/?name=Bidhaa&background=f1f5f9&color=64748b');
                    return `<div class="large-card" onclick="openProduct('${skh.skhJsEsc(d.id)}', '${skh.skhJsEsc(d.collectionName || 'products')}')"><div class="card-img" style="position:relative;overflow:hidden;"><img src="${img}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://ui-avatars.com/api/?name=Bidhaa&background=f1f5f9&color=64748b'"></div><b style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:8px;">${skh.skhEscape(d.title || 'Bidhaa')}</b><span style="color:var(--green);font-size:13px;font-weight:900;">TSh ${Number(d.price || 0).toLocaleString()}</span></div>`;
                }).join('')}</div>`;
        } catch (e) {
            console.warn('[engage:personalized]', e && e.message);
        }
    };

    // [FIX 2026-09] Ficha "Recommended for You" (sababu: likes/saves/follows)
    // isivuruge muonekano wa juu wa feed — mtumiaji anaweza kuificha kwa kipindi.
    window.skhHideRecommended = function () {
        var host = document.getElementById('recommendedFeed');
        if (host) host.style.display = 'none';
        try { window.sessionStorage.setItem('skh_recommended_hidden', '1'); } catch (e) {}
    };
    // ---------- SELLER DASHBOARD: WAFUASI (analytics ya muuzaji) ----------
    window.skhSellerFollowerStats = async function () {
        if (!skh.currentUser) return { total: 0, new7d: 0, active: 0, repeatBuyers: 0, conversion: 0 };
        var uid = skh.currentUser.uid;
        var nowMs = Date.now(), D7 = 7 * 24 * 3600 * 1000, D30 = 30 * 24 * 3600 * 1000;
        try {
            var qF = skh.query(skh.collection(skh.db, "sellerFollowers"), skh.where("sellerId", "==", uid), skh.limit(500));
            var fSnap = await skh.getDocs(qF);
            var total = 0, new7d = 0, recent30 = 0, followerIds = [];
            fSnap.forEach(function (d) {
                var f = d.data();
                if (!f.followerId) return;
                total++; followerIds.push(f.followerId);
                var t = f.followedAt ? new Date(f.followedAt).getTime() : 0;
                if (t && (nowMs - t) <= D7) new7d++;
                if (t && (nowMs - t) <= D30) recent30++;
            });
            // Wafuasi walionunua (conversion) + wanunuzi wa kurudia (repeat buyers)
            var qO = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", uid), skh.limit(300));
            var oSnap = await skh.getDocs(qO);
            var buyerCounts = {};
            oSnap.forEach(function (d) {
                var o = d.data();
                var bid = o.buyerId || o.buyerUid || o.buyerEmail;
                if (!bid) return;
                buyerCounts[bid] = (buyerCounts[bid] || 0) + 1;
            });
            var buyerKeys = Object.keys(buyerCounts);
            var followerBuyers = 0, repeatBuyers = 0;
            buyerKeys.forEach(function (b) {
                if (buyerCounts[b] >= 2) repeatBuyers++;
                if (followerIds.indexOf(b) !== -1) followerBuyers++;
            });
            var conversion = total ? Math.round((followerBuyers / total) * 100) : 0;
            var active = Math.max(recent30, followerBuyers); // wafuasi waliofollow hivi karibuni au walionunua
            return { total: total, new7d: new7d, active: active, repeatBuyers: repeatBuyers, conversion: conversion };
        } catch (e) {
            return { total: 0, new7d: 0, active: 0, repeatBuyers: 0, conversion: 0 };
        }
    };
    window.skhPopulateSellerFollowerKpi = async function () {
        var el = document.getElementById('kpiFollowersTotal');
        if (!el) return;
        var s = await window.skhSellerFollowerStats();
        var set = function (id, v) { var n = document.getElementById(id); if (n) n.innerText = v; };
        set('kpiFollowersTotal', s.total);
        set('kpiFollowersNew', '+' + s.new7d);
        set('kpiFollowersActive', s.active);
        set('kpiFollowersRepeat', s.repeatBuyers);
        set('kpiFollowersConversion', s.conversion + '%');
    };

    // Washa icons za SVG mara moja (module scripts huwa deferred baada ya DOM)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { window.skhInitEngagementIcons(); });
    } else {
        window.skhInitEngagementIcons();
    }
})();

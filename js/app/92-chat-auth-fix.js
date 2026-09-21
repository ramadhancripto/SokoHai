/* ================================================================
 * 92-chat-auth-fix.js — FIX CHAT INAYOSHINDWA KUFUNGUKA
 * ----------------------------------------------------------------
 * ROOT CAUSE:
 *   - skh.onAuthStateChanged haina callback inayoweka skh.currentUser
 *     mapema; callback pekee iko kwenye 04-orders-escrow.js.
 *   - Bootstrap inawasha __authResolved=true kabla currentUser haijawekwa
 *     → race condition: mtu akibonyeza Chat haraka, requireAuth()
 *     inaona currentUser=null na kufungua login modal / alert.
 *   - Wrapper ya skhChatOpen (90-fix) haijasubiri auth-resolve.
 *   - ensureConversation hufeli (rules) ikirusha silent; tunahitaji
 *     kuangalia data != null na kutoa fallback.
 *
 * FIX:
 *   1. Sajili onAuthStateChanged MWENYEWE kuweka skh.currentUser mapema.
 *   2. Patch requireAuth isubiri auth ikamilike (hadi sekunde 8).
 *   3. Open chat: subiri auth iwe ready kwanza, kisha fungua.
 *   4. Ongeza try/catch kwenye kila hatua yenye diagnostic ya console.
 *   5. Toast-error kamili ikiwa kuna hitilafu yoyote.
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhChatAuthFixed) return;
    window.__skhChatAuthFixed = true;

    /* [STABILIZE 2026-09-21] Urithi chain flags kutoka base — vinginevyo
       retry za 79/81/91 hu-wrap tena juu yetu (tabaka mara 2-3). */
    var __SKH_CHAIN_FLAGS = ['__blinkPatched','__blinkWrap','__oneUI','__oneUIAtomic','__abs81','__abs81_final','__skh90','__skhAuthPatched','__skhErrPatched','__skh93','__skhBack','__raw','__orig'];
    function __skhCopyChainFlags(from, to) {
        if (!from || !to) return to;
        for (var i = 0; i < __SKH_CHAIN_FLAGS.length; i++) {
            var k = __SKH_CHAIN_FLAGS[i];
            try { if (from[k] !== undefined && to[k] === undefined) to[k] = from[k]; } catch (e) {}
        }
        return to;
    }

    function showErr(title, err) {
        var msg = (err && err.message) ? String(err.message) : (typeof err === 'string' ? err : '');
        console.error('[SOKOHAI CHAT FIX] ' + title, err);
        try {
            if (window.showToast) { window.showToast(title + (msg ? ': ' + msg.slice(0, 100) : ''), 'error'); return; }
        } catch (e) {}
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#b91c1c;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:700;z-index:200002;max-width:90vw;box-shadow:0 8px 24px rgba(185,28,28,.4);';
        t.textContent = '⚠ ' + title + (msg ? ' — ' + msg.slice(0, 100) : '');
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 5000);
    }

    function info(title) {
        console.log('[SOKOHAI CHAT FIX]', title);
    }

    // ---------------- 1. WAIT FOR SKH ----------------
    function whenSkh(cb, tries) {
        tries = tries || 0;
        if (window.skh && skh.db && skh.auth && typeof skh.onAuthStateChanged === 'function') {
            cb();
        } else if (tries < 80) {
            setTimeout(function () { whenSkh(cb, tries + 1); }, 50);
        } else {
            console.warn('[SOKOHAI CHAT FIX] skh haijapatikana baada ya sekunde 4');
        }
    }

    whenSkh(function () {
        var skh = window.skh;

        // ---------------- 2. SAJILI ON-AUTH CHANGED MAPEMA ----------------
        // Hii inahakikisha currentUser inawekwa Punde baada ya Firebase kutoa
        // user — hata kabla ya 04-orders-escrow.js kupakia.
        var _ourAuthBound = false;
        function bindAuthListener() {
            if (_ourAuthBound) return;
            _ourAuthBound = true;
            try {
                skh.onAuthStateChanged(skh.auth, function (user) {
                    info('auth state changed: ' + (user ? 'user=' + (user.email || user.uid) : 'logged out'));
                    skh.currentUser = user;
                    skh.__authResolved = true;
                    // Notisha wengine wanaosubiri
                    try {
                        document.dispatchEvent(new CustomEvent('skh:auth-ready', { detail: { user: user } }));
                    } catch (e) {}
                    // Pia boresha currentUserData ikiwa ipo na sio offline-member override
                    if (user && (!skh.currentUserData || skh.currentUserData.uid !== user.uid)) {
                        skh.currentUserData = Object.assign({}, skh.currentUserData || {}, {
                            uid: user.uid,
                            displayName: user.displayName || null,
                            email: user.email || null,
                            photoURL: user.photoURL || null
                        });
                    }
                });
                // Mara moja jaribu kupata currentUser (auth imeshapeuliwa)
                try {
                    var cu = skh.auth && skh.auth.currentUser;
                    if (cu) {
                        skh.currentUser = cu;
                        skh.__authResolved = true;
                        info('currentUser already available: ' + (cu.email || cu.uid));
                    }
                } catch (e) {}
            } catch (e) {
                console.warn('[SOKOHAI CHAT FIX] kushindwa kusajili auth listener', e);
            }
        }
        // Kama auth imeshaanzishwa, funga sasa; la sivyo subiri.
        if (skh.auth) bindAuthListener();
        else setTimeout(bindAuthListener, 200);

        // ---------------- 3. SUBIRI AUTH IWE RESOLVED ----------------
        function waitForAuth(timeoutMs) {
            timeoutMs = timeoutMs || 8000;
            return new Promise(function (resolve) {
                // Ikiwa currentUser tayari ipo, rudi mara moja
                if (skh.currentUser) { resolve(skh.currentUser); return; }
                // Ikiwa __authResolved na bado hakuna user → user hajatoka
                if (skh.__authResolved === true && !skh.currentUser) { resolve(null); return; }

                var done = false;
                function onReady() {
                    if (done) return;
                    done = true;
                    resolve(skh.currentUser || null);
                }
                function onEv() { onReady(); }
                document.addEventListener('skh:auth-ready', onEv, { once: true });

                // Poll fall-back (kama event haijapigwa)
                var pollCount = 0;
                var poll = setInterval(function () {
                    pollCount++;
                    if (skh.currentUser || skh.__authResolved || pollCount > 80) {
                        clearInterval(poll);
                        onReady();
                    }
                }, 100);

                setTimeout(function () {
                    clearInterval(poll);
                    if (!done) { done = true; resolve(skh.currentUser || null); }
                }, timeoutMs);
            });
        }

        // ---------------- 4. PATCH requireAuth KUSUBIRI AUTH ----------------
        var _origRequireAuth = skh.requireAuth;
        skh.requireAuth = function () {
            // Kama currentUser yupo, rudi true mara moja
            if (skh.currentUser) return true;
            // Kama __authResolved na bado hakuna user, rudi behavior ya zamani
            if (skh.__authResolved) return _origRequireAuth.apply(this, arguments);
            // Bado inapakia — onyesha toast, USIFUNGUE login modal
            try {
                if (window.showToast) window.showToast('Inathibitisha akaunti… subiri kidogo.', 'info', 1500);
            } catch (e) {}
            return false;
        };

        // ---------------- 5. WRAP skhChatOpen NA AUTH WAIT ----------------
        function patchChatOpen() {
            if (!window.skhChatOpen || window.skhChatOpen.__skhAuthPatched) {
                if (!window.skhChatOpen) setTimeout(patchChatOpen, 100);
                return;
            }
            var _orig = window.skhChatOpen;
            window.skhChatOpen = async function (uid, name, opts) {
                try {
                    var user = await waitForAuth(8000);
                    if (!user) {
                        if (!skh.__authResolved) {
                            // bado inapakia
                            showErr('Inathibitisha akaunti', new Error('Subiri sekunde chache kisha ujaribu tena.'));
                        } else {
                            // fungua login
                            try {
                                if (typeof openAuthModal === 'function') openAuthModal();
                                else if (typeof window.openAuthModal === 'function') window.openAuthModal();
                            } catch (e) {}
                        }
                        return null;
                    }
                    if (skh.currentUser && skh.currentUser.uid === uid) {
                        showErr('Huji chat nawe mwenyewe', new Error('Huwezi kujituma ujumbe.'));
                        return null;
                    }
                    // Hakikisha db ipo
                    if (!skh.db) {
                        showErr('Database haijapakia', new Error('Subiri sekunde chache kisha jaribu tena.'));
                        return null;
                    }
                    info('opening chat with uid=' + uid + ' name=' + name);
                    var r = await _orig.call(this, uid, name, opts);
                    info('chat opened, convId=' + ((skh.chatCore && skh.chatCore.convId) || '(none)'));
                    return r;
                } catch (e) {
                    showErr('Imeshindwa kufungua chat', e);
                    return null;
                }
            };
            __skhCopyChainFlags(_orig, window.skhChatOpen);
            window.skhChatOpen.__skhAuthPatched = true;
            info('skhChatOpen wrapped');
        }
        patchChatOpen();

        // ---------------- 6. WRAP openChatWithUser similarly ----------------
        function patchOpenChat() {
            if (!window.openChatWithUser) { setTimeout(patchOpenChat, 100); return; }
            var _origOC = window.openChatWithUser;
            window.openChatWithUser = function (uid, displayName) {
                waitForAuth(8000).then(function (user) {
                    if (!user) {
                        try { if (typeof openAuthModal === 'function') openAuthModal(); } catch (e) {}
                        return;
                    }
                    // Weka UID mara moja kabla ya wito wowote
                    skh.currentChatUid = uid;
                    skh.chatPartner = displayName || 'Mawasiliano';
                    try {
                        window.skhChatOpen(uid, displayName || '', {});
                    } catch (e) {
                        showErr('Imeshindwa kufungua mazungumzo', e);
                    }
                });
            };
            __skhCopyChainFlags(_origOC, window.openChatWithUser);
            window.openChatWithUser.__skhAuthPatched = true;
            info('openChatWithUser wrapped');
        }
        patchOpenChat();

        // ---------------- 7. PATCH skhOpenGroupSoga kwa auth wait ----------------
        function patchGroupOpen() {
            if (!window.skhOpenGroupSoga) { setTimeout(patchGroupOpen, 200); return; }
            if (window.skhOpenGroupSoga.__skhAuthPatched) return;
            var _origG = window.skhOpenGroupSoga;
            window.skhOpenGroupSoga = async function (gid) {
                try {
                    gid = String(gid || '').trim().replace(/^conv_group_/, '');
                    if (!gid) return;
                    var user = await waitForAuth(8000);
                    if (!user) {
                        try { if (typeof openAuthModal === 'function') openAuthModal(); } catch (e) {}
                        return;
                    }
                    return await _origG.call(this, gid);
                } catch (e) {
                    showErr('Imeshindwa kufungua kikundi', e);
                }
            };
            __skhCopyChainFlags(_origG, window.skhOpenGroupSoga);
            window.skhOpenGroupSoga.__skhAuthPatched = true;
            info('skhOpenGroupSoga wrapped');
        }
        patchGroupOpen();

        // ---------------- 8. PATCH openSellerProfile ----------------
        function patchSellerProfile() {
            if (!window.openSellerProfile) { setTimeout(patchSellerProfile, 200); return; }
            if (window.openSellerProfile.__skhAuthPatched) return;
            var _origS = window.openSellerProfile;
            window.openSellerProfile = async function (uid, name) {
                try {
                    // Seller profile ya PUBLIC haiitaji auth, lakini follow/chat ndio zinahitaji.
                    return await _origS.call(this, uid, name);
                } catch (e) {
                    showErr('Imeshindwa kufungua profile', e);
                }
            };
            __skhCopyChainFlags(_origS, window.openSellerProfile);
            window.openSellerProfile.__skhAuthPatched = true;
            info('openSellerProfile wrapped');
        }
        patchSellerProfile();

        // ---------------- 9. PATCH skhChatOpenInbox ----------------
        function patchInbox() {
            if (!window.skhChatOpenInbox) { setTimeout(patchInbox, 200); return; }
            if (window.skhChatOpenInbox.__skhAuthPatched) return;
            var _origI = window.skhChatOpenInbox;
            window.skhChatOpenInbox = async function () {
                var user = await waitForAuth(8000);
                if (!user) {
                    try { if (typeof openAuthModal === 'function') openAuthModal(); } catch (e) {}
                    return;
                }
                try {
                    return await _origI.call(this);
                } catch (e) {
                    showErr('Imeshindwa kupakia inbox', e);
                }
            };
            __skhCopyChainFlags(_origI, window.skhChatOpenInbox);
            window.skhChatOpenInbox.__skhAuthPatched = true;
            info('skhChatOpenInbox wrapped');
        }
        patchInbox();

        // ---------------- 10. GLOBAL ERROR HANDLER CHINI ----------------
        window.addEventListener('error', function (ev) {
            if (!ev || !ev.error) return;
            var msg = ev.message || '';
            // Epuka kelele nyingi za kawaida
            if (msg.indexOf('ResizeObserver') !== -1) return;
            if (msg.indexOf('Script error') !== -1) return;
            console.warn('[GLOBAL ERROR]', msg, '\n  at', ev.filename + ':' + ev.lineno);
        });
        window.addEventListener('unhandledrejection', function (ev) {
            var r = ev.reason;
            if (!r) return;
            var msg = r.message || String(r);
            if (msg.indexOf('permission-denied') !== -1) return; // rules kawaida
            if (msg.indexOf('Missing or insufficient') !== -1) return;
            if (msg.indexOf('cancelled') !== -1) return;
            console.warn('[UNHANDLED PROMISE]', msg, '\n  code:', r.code || '');
        });

        // ---------------- 11. PATCH doLogin KUWEKA CURRENT USER MARA MOJA ----------------
        function patchDoLogin() {
            if (!window.doLogin || window.doLogin.__skhPatched) {
                if (!window.doLogin) { setTimeout(patchDoLogin, 200); return; }
            }
            var _origDL = window.doLogin;
            window.doLogin = async function (event) {
                try {
                    if (event && event.preventDefault) event.preventDefault();
                    var e = document.getElementById('loginEmail') ? document.getElementById('loginEmail').value.trim() : '';
                    var p = document.getElementById('loginPass') ? document.getElementById('loginPass').value : '';
                    if (!e || !p) { alert('Jaza email na password yako.'); return; }
                    var cred = await skh.signInWithEmailAndPassword(skh.auth, e, p);
                    skh.currentUser = cred.user;
                    skh.__authResolved = true;
                    info('login succeeded, user=' + (cred.user.email || cred.user.uid));
                    try { skh.localStorage.setItem('sokohai_last_email', e); } catch (e2) {}
                    try {
                        if (typeof closeModals === 'function') closeModals();
                    } catch (e3) {}
                    document.dispatchEvent(new CustomEvent('skh:auth-ready', { detail: { user: cred.user } }));
                    return cred;
                } catch (err) {
                    showErr('Imeshindwa kuingia', err);
                    alert('Kosa: ' + err.message);
                }
            };
            window.doLogin.__skhPatched = true;
            info('doLogin patched');
        }
        patchDoLogin();

        // ---------------- DIAGNOSTIC PANEL (bonyeza mara 3 S logo) ----------------
        var _diagClicks = 0; var _diagTimer = null;
        setTimeout(function () {
            var logo = document.querySelector('#sokohaiLogo, .logo, [class*="logo"]');
            if (logo) logo.addEventListener('click', function () {
                _diagClicks++;
                clearTimeout(_diagTimer);
                _diagTimer = setTimeout(function () { _diagClicks = 0; }, 1200);
                if (_diagClicks >= 3) {
                    _diagClicks = 0;
                    showDiagnostic();
                }
            });
        }, 1500);

        function showDiagnostic() {
            var s = skh;
            var msg = [
                'DIAGNOSTIC YA SOKOHAI:',
                '• currentUser: ' + (s.currentUser ? 'YES (' + (s.currentUser.email || s.currentUser.uid) + ')' : 'NO'),
                '• __authResolved: ' + s.__authResolved,
                '• db: ' + (s.db ? 'available' : 'MISSING'),
                '• chatCore: ' + (s.chatCore ? (s.chatCore.convId || 'active') : 'null'),
                '• currentChatUid: ' + (s.currentChatUid || '(none)')
            ].join('\n');
            alert(msg);
            console.log(msg);
        }
        window.skhDiag = showDiagnostic;

        info('chat-auth-fix installed ✓');
    });
})();

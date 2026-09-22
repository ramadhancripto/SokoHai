/* ==== js/app/31-agent-assist.js ==== */
// ============================================================
// SOKOHAI AGENT ASSISTED ACCESS SYSTEM
// ------------------------------------------------------------
// Wakala ni NJIA YA KUFIKIA (access point) tu — HAWAHI kumiliki
// wala kujifanya mwanachama. PIN/password ya mwanachama haishi
// browser wala kwa wakala — ni SERVER pekee (PBKDF2 hash).
//
//   - Mwanachama bila simu anasajiliwa na Member ID (SKH-XXXXXXXX)
//   - Mwanachama anajithibitisha MWENYEWE kwa PIN (server)
//   - Server inatoa custom token -> mwanachama anaingia kwenye
//     akaunti YAKE halisi (normal SokoHai experience)
//   - sessionType: "ASSISTED_USER" + banner + LOGOUT & RETURN TO AGENT
//   - Inactivity timeout (hakuna login ya kudumu kwenye kifaa cha pamoja)
// ============================================================
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    // [IDENTITY-FIX BUG-01 2026-09-16] Ufunguo canonical mmoja kote kwenye mfumo
    // (60-identity-layer / 56-nav-back / 61-full-system-repair hutumia huyu).
    // Awali 31 aliandika 'skh_assisted_session' — identity layer hakukuona session
    // kamwe, hivyo matukio yote yaliandikwa kwa UID YA WAKALA. Ufunguo wa zamani
    // unasomwa mara moja na kuhamishwa (legacy migrate) — hakuna kipindi kinachopotea.
    const SESSION_KEY = 'skh_assist_session';
    const LEGACY_SESSION_KEY = 'skh_assisted_session';
    const ACTIVITY_KEY = 'skh_assisted_last_activity';

    // Self-register: tuna ufikiaji wa moja kwa moja wa skh (module import).
    var deps = {
        db: skh.db, collection: skh.collection, query: skh.query, where: skh.where,
        orderBy: skh.orderBy, limit: skh.limit, getDocs: skh.getDocs, getDoc: skh.getDoc,
        doc: skh.doc, addDoc: skh.addDoc, updateDoc: skh.updateDoc, setDoc: skh.setDoc,
        deleteDoc: skh.deleteDoc, auth: skh.auth, signInWithCustomToken: skh.signInWithCustomToken
    };
    var callFns = null;
    try {
        callFns = {
            memberRegister: skh.wrapCallable("memberRegister"),
            memberAuthenticate: skh.wrapCallable("memberAuthenticate"),
            assistedSessionValidate: skh.wrapCallable("assistedSessionValidate"),
            assistedSessionEnd: skh.wrapCallable("assistedSessionEnd"),
            memberSetPin: skh.wrapCallable("memberSetPin"),
            agentMemberStatus: skh.wrapCallable("agentMemberStatus"),
            agentListMembers: skh.wrapCallable("agentListMembers")
        };
    } catch (e) { console.warn("[Assisted Access] callables hazikusajiliwa:", e && e.message); }

    // (Zinabaki exposed kwa majaribio — smoke test inazibadilisha)
    window.skhAgentAssistRegisterFirestore = function (fns) { deps = fns; };
    window.skhAgentAssistRegisterCallables = function (fns) { callFns = fns || {}; };

    // ---------- STATE (memory + localStorage — [§20 TEST A FIX]) ----------
    // Kabla: session ya mwanachama ilihifadhiwa kwenye sessionStorage (hukufa
    // browser ikifungwa). Spec inataka kuumiza: member-login → funga browser →
    // fungua tena → session+profile zinabaki (si agent). Hivyo tunahifadhi kwenye
    // localStorage + expiresAt enforcement; STASH_KEY inabaki sessionStorage
    // juu ni rasimu ya dashboard ya tab hii, si kitambulisho cha kudumu.
    var memSession = null;

    function sessionExpired(s) {
        try {
            return !!(s && s.expiresAt && new Date(s.expiresAt).getTime() < Date.now());
        } catch (e) { return false; }
    }
    function getSession() {
        try {
            var raw = window.localStorage.getItem(SESSION_KEY);
            // [IDENTITY-FIX BUG-01] Legacy migrate I — hamisha sessionStorage
            // (iliyopo kwa ufunguo huu au wa zamani) → localStorage mara moja.
            if (!raw) {
                var fromSession = window.sessionStorage.getItem(SESSION_KEY) || window.sessionStorage.getItem(LEGACY_SESSION_KEY);
                if (fromSession) {
                    try {
                        window.localStorage.setItem(SESSION_KEY, fromSession);
                        window.sessionStorage.removeItem(SESSION_KEY); window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
                    } catch (migErr) {}
                    raw = fromSession;
                }
            }
            if (!raw) return memSession;
            var s = JSON.parse(raw);
            if (!s || !s.sessionId) return null;
            // [§20] expiresAt ni lazima kuheshimiwa — session iliyopita muda
            // inafutwa SASA (isibaki kama "uongo" ambako ingeweza kutumiwa).
            if (sessionExpired(s)) { setSession(null); return null; }
            return s;
        } catch (e) { return memSession; }
    }
    function setSession(s) {
        memSession = s || null;
        try {
            if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
            else window.localStorage.removeItem(SESSION_KEY);
            // ufunguo wa zamani + sessionStorage vinapotea milele — asalama.
            try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e2) {}
            try { window.sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch (e3) {}
            try { window.localStorage.removeItem(LEGACY_SESSION_KEY); } catch (e4) {}
        } catch (e) { /* storage isiyopatikana */ }
    }
    function clearActivity() { try { window.localStorage.removeItem(ACTIVITY_KEY); } catch (e) {} }
    function touchActivity() { try { window.localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch (e) {} }
    function lastActivity() {
        try { var v = window.localStorage.getItem(ACTIVITY_KEY); return v ? Number(v) : Date.now(); }
        catch (e) { return Date.now(); }
    }

    // Usalama: server ndiyo mamlaka KILA WAKATI (PIN hash, token, vikao).
    // Kulemaza kunaruhusiwa tu kwa kuiweka wazi kuwa false (kwa majaribio).
    function viaServer() {
        return !window.SOKOHAI_CONFIG || window.SOKOHAI_CONFIG.AGENT_ASSIST_VIA_SERVER !== false;
    }
    function sessionTimeoutMs() {
        var mins = (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.ASSISTED_SESSION_TIMEOUT_MINUTES) || 30;
        return Number(mins) * 60000;
    }

    // Meta inayobandikwa kwenye oda/bidhaa (metadata pekee — umiliki unabaki kwa mwanachama)
    window.skhAssistMeta = function () {
        var s = getSession();
        if (s && s.sessionId) {
            return { assistedSessionId: s.sessionId, agentId: s.agentId || '' };
        }
        return {};
    };

    function callServer(name, data) {
        if (!callFns || !callFns[name]) {
            throw new Error('Backend ya Msaada wa Mwanachama haipatikani. Pakia Cloud Functions (memberRegister, memberAuthenticate, n.k.).');
        }
        return callFns[name](data).then(function (r) { return (r && r.data) || {}; });
    }

    // [FIX 2026-09] Njia moja ya wakala: registerOfflineMember (09) inaitumia
    // kuwasajili wanachama wa dukani kupitia SERVER (memberRegister) — sio
    // identitytoolkit wala PesaPal (chanzo cha hitilafu "internal" ya zamani).
    //
    // [OFFLINE-MEMBER 2026-09] Fallback ya Firestore-native: functions
    // zikikosekana ("internal"/"unavailable"/"not-found"), wakala anasajili
    // mwanachama MOJA KWA MOJA kwenye Firestore (users + memberSecrets +
    // agentMembers) kwa PBKDF2 (client-side) — rules ndiyo zinaruhusu
    // wakala ALIYEIDHINISHWA pekee kuandika.
    function isAssistServerDown(e) {
        if (!e) return true;
        var code = (e && (e.code || (e.errorInfo && e.errorInfo.code))) || '';
        var m = String((e && e.message) || '');
        return /functions\//.test(code) || /hazipatikani|haipatikani|not-found|unavailable|^internal$|deadline-exceeded|NO_FUNCTIONS/i.test(m);
    }

    function assistRandomHex(bytes) {
        var arr = new Uint8Array(bytes);
        if (window.crypto && window.crypto.getRandomValues) { try { window.crypto.getRandomValues(arr); } catch (e) {} }
        else { for (var i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256); }
        var out = '';
        for (var j = 0; j < arr.length; j++) out += ('0' + arr[j].toString(16)).slice(-2);
        return out;
    }

    // PBKDF2 ya PIN (sawa na assistHashPin ya server: 12000 iter, sha256, 32B).
    // Salt = hex string (server inatumia String(salt) kama salt bytes).
    async function assistPbkdf2Hex(pin, saltHex) {
        var pw = new TextEncoder().encode(String(pin));
        var salt = new TextEncoder().encode(String(saltHex));
        if (window.crypto && window.crypto.subtle && window.crypto.subtle.importKey) {
            try {
                var key = await window.crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
                var bits = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 12000, hash: 'SHA-256' }, key, 256);
                var bytes = new Uint8Array(bits);
                var h = '';
                for (var i = 0; i < bytes.length; i++) h += ('0' + bytes[i].toString(16)).slice(-2);
                return h;
            } catch (e) { /* endelea chini */ }
        }
        if (typeof window.skhPbkdf2 === 'function') return window.skhPbkdf2(pin, saltHex, 12000, 32);
        throw new Error('PBKDF2 haipatikani kwenye kifaa hiki.');
    }

    window.skhAssistRegisterMemberNative = async function (data) {
        var agentUid = (skh.currentUser && skh.currentUser.uid) || '';
        if (!agentUid) throw new Error('Wakala hajathibitishwa kuingia.');
        var fullName = String((data && data.fullName) || '').trim();
        var region = String((data && data.region) || '').trim();
        var district = String((data && data.district) || '').trim();
        var businessType = String((data && data.businessType) || '').trim();
        var pin = String((data && data.pin) || '');
        if (!fullName || !region) throw new Error('Jina na Mkoa vinahitajika.');
        if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN lazima iwe tarakimu 4 hadi 6.');

        // Member ID (SKH-XXXXXXXX) — bila counter ya server: hakikisha unique.
        var memberCode = '';
        try {
            for (var attempt = 0; attempt < 5; attempt++) {
                var candidate = 'SKH-' + String(Math.floor(10000000 + Math.random() * 90000000));
                var q = skh.query(skh.collection(skh.db, 'users'), skh.where('memberId', '==', candidate), skh.limit(1));
                var snap = await skh.getDocs(q);
                var empty = !snap || snap.empty || (snap.size === 0) || (snap.docs && snap.docs.length === 0);
                if (empty) { memberCode = candidate; break; }
            }
        } catch (e) { /* best-effort */ }
        if (!memberCode) memberCode = 'SKH-' + String(Date.now()).slice(-8);

        var uid = 'skhm_' + assistRandomHex(16);
        var salt = assistRandomHex(16);
        var pinHash = await assistPbkdf2Hex(pin, salt);
        var now = new Date().toISOString();

        await skh.setDoc(skh.doc(skh.db, 'users', uid), {
            /* [FIX §2,§4,§5,§13,§22] Mwanachama ndiye mmiliki. */
            uid: uid, fullName: fullName, memberId: memberCode,
            phone: (data && data.phone) || null,
            phoneNumber: (data && data.phone) || null,
            email: null,
            accountType: 'offline_member',
            ownerId: uid,
            notificationChannel: (data && data.phone) ? 'sms' : 'in_app',
            region: region, district: district, businessType: businessType,
            hasPhone: !!(data && data.phone), hasPin: true, isOfflineUser: true,
            // Wakala = facilitator, SI mmiliki (§13)
            registeredThroughAgentId: agentUid,
            createdByAgentId: agentUid,
            photoURL: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(fullName) + '&background=f1f5f9&color=64748b',
            walletBalance: 0, createdAt: now
        });
        await skh.setDoc(skh.doc(skh.db, 'memberSecrets', uid), {
            uid: uid, pinSalt: salt, pinHash: pinHash, pinAttempts: 0, lockedUntil: null, updatedAt: now
        });
        await skh.addDoc(skh.collection(skh.db, 'agentMembers'), {
            agentId: agentUid, memberId: uid, memberCode: memberCode,
            status: 'ACTIVE', createdAt: now, lastAssistedAt: null
        });
        return { ok: true, memberId: memberCode, uid: uid, native: true };
    };

    /* ========================================================================
       [FIX 2026-09-15] FALLBACK ZA KUINGIA NA USIMAMIZI
       ------------------------------------------------------------------------
       Uchunguzi: memberAuthenticate / agentListMembers / agentMemberStatus /
       memberSetPin ZOTE zinarudisha 404 (hazijadeploy). Usajili ulikuwa na
       fallback, lakini KUINGIA haukuwa nao — ndiyo maana mwanachama wa offline
       hakuweza KAMWE kuingia baada ya kusajiliwa.

       Usalama unabaki ULE ULE: PBKDF2 (12000 iter, SHA-256, 32B) ile ile
       inayotumika na server, pamoja na kufunga akaunti baada ya majaribio 5.
       Firestore Rules ndizo mlinzi wa mwisho.
       ======================================================================== */
    window.skhAssistAuthenticateNative = async function (memberId, pin) {
        var agentUid = (skh.currentUser && skh.currentUser.uid) || '';
        if (!agentUid) throw new Error('Wakala hajathibitishwa kuingia.');
        var code = String(memberId || '').trim().toUpperCase();
        if (!code) throw new Error('Weka Member ID.');
        if (!/^\d{4,6}$/.test(String(pin || ''))) throw new Error('PIN lazima iwe tarakimu 4 hadi 6.');

        // 1) Tafuta mwanachama kwa memberId
        var q = skh.query(skh.collection(skh.db, 'users'), skh.where('memberId', '==', code), skh.limit(1));
        var snap = await skh.getDocs(q);
        var docs = (snap && snap.docs) || [];
        if (!docs.length) throw new Error('Member ID haipatikani. Hakikisha namba ni sahihi.');
        var member = Object.assign({ uid: docs[0].id }, docs[0].data() || {});

        // 2) Soma siri yake
        var secSnap = await skh.getDoc(skh.doc(skh.db, 'memberSecrets', member.uid));
        if (!secSnap || !secSnap.exists || !secSnap.exists()) {
            throw new Error('Taarifa za usalama hazipatikani. Wasiliana na msaada.');
        }
        var sec = secSnap.data() || {};

        // 3) Je, akaunti imefungwa?
        if (sec.lockedUntil && new Date(sec.lockedUntil).getTime() > Date.now()) {
            var mins = Math.ceil((new Date(sec.lockedUntil).getTime() - Date.now()) / 60000);
            throw new Error('Akaunti imefungwa kwa dakika ' + mins + ' kwa sababu ya majaribio mengi.');
        }

        // 4) Thibitisha PIN (PBKDF2 ile ile ya server)
        var tryHash = await assistPbkdf2Hex(pin, sec.pinSalt);
        if (tryHash !== sec.pinHash) {
            var attempts = (Number(sec.pinAttempts) || 0) + 1;
            var patch = { pinAttempts: attempts, updatedAt: new Date().toISOString() };
            if (attempts >= 5) {
                patch.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString();
                patch.pinAttempts = 0;
            }
            try { await skh.updateDoc(skh.doc(skh.db, 'memberSecrets', member.uid), patch); } catch (e) {}
            throw new Error(attempts >= 5
                ? 'PIN si sahihi. Akaunti imefungwa kwa dakika 15.'
                : 'PIN si sahihi. Umebakiza majaribio ' + (5 - attempts) + '.');
        }

        // 5) Imefanikiwa — safisha majaribio, fungua kikao
        try {
            await skh.updateDoc(skh.doc(skh.db, 'memberSecrets', member.uid),
                { pinAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() });
        } catch (e) {}

        var sessionId = 'sess_' + assistRandomHex(12);
        try {
            await skh.addDoc(skh.collection(skh.db, 'activity_logs'), {
                type: 'ASSISTED_SESSION_START', agentId: agentUid, memberUid: member.uid,
                memberCode: code, sessionId: sessionId, at: new Date().toISOString(), native: true
            });
        } catch (e) { /* audit si kikwazo */ }

        // [IDENTITY-FIX BUG-07 2026-09-16] Server (memberAuthenticate) hurejesha
        // uid + memberId + expiresAt TOP-LEVEL; native ilikuwa haitoi — session
        // iliandikwa na memberUid=undefined, hivyo identity layer haikuwahi kufanya
        // kazi hata baada ya key fix. Contract sasa ni MMOJA pande zote mbili.
        return {
            ok: true, native: true, sessionId: sessionId,
            uid: member.uid, memberId: code,
            memberName: member.fullName || '',
            expiresAt: new Date(Date.now() + sessionTimeoutMs()).toISOString(),
            member: {
                uid: member.uid, memberId: code, fullName: member.fullName || '',
                region: member.region || '', district: member.district || '',
                businessType: member.businessType || '', walletBalance: member.walletBalance || 0,
                photoURL: member.photoURL || ''
            }
        };
    };

    window.skhAssistListMembersNative = async function () {
        var agentUid = (skh.currentUser && skh.currentUser.uid) || '';
        if (!agentUid) throw new Error('Wakala hajathibitishwa kuingia.');
        var q = skh.query(skh.collection(skh.db, 'agentMembers'),
                          skh.where('agentId', '==', agentUid), skh.limit(50));
        var snap = await skh.getDocs(q);
        var out = [];
        if (snap && snap.forEach) snap.forEach(function (d) {
            var v = d.data() || {};
            out.push({ id: d.id, memberId: v.memberCode || v.memberId, uid: v.memberId,
                       status: v.status || 'ACTIVE', createdAt: v.createdAt,
                       fullName: v.fullName || '' });
        });
        // Jaza majina kutoka users (best-effort)
        for (var i = 0; i < out.length && i < 20; i++) {
            if (out[i].fullName) continue;
            try {
                var u = await skh.getDoc(skh.doc(skh.db, 'users', out[i].uid));
                if (u && u.exists && u.exists()) out[i].fullName = (u.data() || {}).fullName || '';
            } catch (e) {}
        }
        out.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
        return { ok: true, native: true, members: out, nextCursor: null };
    };

    window.skhAssistMemberStatusNative = async function (memberId, status) {
        var agentUid = (skh.currentUser && skh.currentUser.uid) || '';
        if (!agentUid) throw new Error('Wakala hajathibitishwa kuingia.');
        var q = skh.query(skh.collection(skh.db, 'agentMembers'),
                          skh.where('agentId', '==', agentUid),
                          skh.where('memberCode', '==', String(memberId)), skh.limit(1));
        var snap = await skh.getDocs(q);
        var docs = (snap && snap.docs) || [];
        if (!docs.length) throw new Error('Mwanachama huyu hayupo kwenye orodha yako.');
        await skh.updateDoc(skh.doc(skh.db, 'agentMembers', docs[0].id),
            { status: status, updatedAt: new Date().toISOString() });
        return { ok: true, native: true };
    };

    window.skhAssistSetPinNative = async function (memberUid, oldPin, newPin) {
        if (!/^\d{4,6}$/.test(String(newPin || ''))) throw new Error('PIN mpya lazima iwe tarakimu 4 hadi 6.');
        var ref = skh.doc(skh.db, 'memberSecrets', memberUid);
        var snap = await skh.getDoc(ref);
        if (!snap || !snap.exists || !snap.exists()) throw new Error('Taarifa za usalama hazipatikani.');
        var sec = snap.data() || {};
        var oldHash = await assistPbkdf2Hex(oldPin, sec.pinSalt);
        if (oldHash !== sec.pinHash) throw new Error('PIN ya zamani si sahihi.');
        var salt = assistRandomHex(16);
        var hash = await assistPbkdf2Hex(newPin, salt);
        await skh.updateDoc(ref, { pinSalt: salt, pinHash: hash, pinAttempts: 0,
                                   lockedUntil: null, updatedAt: new Date().toISOString() });
        return { ok: true, native: true };
    };

    window.skhAssistRegisterMember = async function (data) {
        try {
            return await callServer('memberRegister', data);
        } catch (e) {
            if (isAssistServerDown(e)) return await window.skhAssistRegisterMemberNative(data);
            throw e;
        }
    };

    function escapeHtml(s) { return skh.skhEscape ? skh.skhEscape(s) : String(s); }

    // ---------- BANNER YA KIPINDI CHA MSAADA ----------
    function removeBanner() {
        var b = document.getElementById('skhAssistBanner');
        if (b) b.remove();
    }

    function injectBanner() {
        removeBanner();
        var s = getSession();
        if (!s) return;
        if (document.getElementById('skhAssistBanner')) return;

        var banner = document.createElement('div');
        banner.id = 'skhAssistBanner';
        banner.setAttribute('style', 'position:fixed; top:0; left:0; right:0; z-index:9000; ' + 'display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; ' + 'padding:10px 14px; background:#18A982; color:#fff; box-shadow:0 4px 16px rgba(0,0,0,0.25); font-family:inherit;');
        banner.innerHTML = '<div style="display:flex; align-items:center; gap:10px; min-width:0;">' + '  <span style="display:inline-flex; width:30px; height:30px; border-radius:50%; background:#ffd166; color:#0f172a; align-items:center; justify-content:center; font-weight:900; font-size:14px;">S</span>' + '  <div style="min-width:0;">' + '    <div style="font-weight:900; font-size:13px; letter-spacing:0.3px;">KIPINDI CHA MSAADA (ASSISTED SESSION)</div>' + '    <div style="font-size:13px; opacity:0.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + '      Mwanachama: <b>' + escapeHtml(s.memberCode || s.memberUid) + '</b>' +
            (s.memberName ? ' &middot; ' + escapeHtml(s.memberName) : '') + '</div>' + '  </div>' + '</div>' + '<div style="display:flex; gap:8px; align-items:center; flex-shrink:0;">' + '  <button id="skhAssistChangePinBtn" type="button" style="padding:10px 12px; background:rgba(255,255,255,0.15); color:#fff; border:1px solid rgba(255,255,255,0.4); border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer;">BADILISHA PIN</button>' + '  <button id="skhAssistLogoutBtn" type="button" style="padding:10px 14px; background:#e11d48; color:#fff; border:none; border-radius:10px; font-weight:900; font-size:12px; cursor:pointer; letter-spacing:0.4px;">TOKA &amp; RUDI KWA WAKALA</button>' + '</div>';

        banner.querySelector('#skhAssistLogoutBtn').addEventListener('click', function () { window.skhAssistLogout(); });
        banner.querySelector('#skhAssistChangePinBtn').addEventListener('click', function () { window.skhAssistOpenPinModal(); });

        document.body.appendChild(banner);
        document.body.style.paddingTop = '54px';
        touchActivity();
    }

    // Timer moja ya kimataifa — inakagua kama kuna kipindi hai na kama
    // mtumiaji amekaa bila shughuli kupita muda (no clearInterval needed).
    setInterval(function () {
        var s = getSession();
        if (!s) return;
        var idle = Date.now() - lastActivity();
        if (idle > sessionTimeoutMs()) {
            window.skhAssistLogout(true);
        }
    }, 15000);

    // Touch kwenye shughuli yoyote ya mtumiaji
    (function bindActivity() {
        ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(function (ev) {
            document.addEventListener(ev, function () {
                if (getSession()) touchActivity();
            }, { passive: true });
        });
    })();

    // ---------- USAFISHAJI WA DATA BAADA YA KUTOKA ----------
    var SENSITIVE_KEYS = ['sokohai_cart', 'sokohai_pending_checkout', 'sokohai_saved_later',
        'sokohai_wishlist', 'sokohai_saved_cart', 'sokohai_offline_sales',
        'sokohai_active_shift', 'haipay_saved_v1', 'currently_managed_offline_uid',
        'currently_managed_offline_name', 'currently_managed_offline_shop'];
    var STASH_KEY = 'skh_assist_stash';

    // [IDENTITY-FIX BUG-06 2026-09-16] Kabla ya kuingia kwa niaba ya mwanachama,
    // hifadhi mazingira ya wakala (cart, wishlist, nk.) kwenye stash, kisha safisha
    // — mwanachama asione wala kugusa data ya wakala. Rudi: rejesha yote.
    function stashAgentLocalState() {
        try {
            var stash = {};
            SENSITIVE_KEYS.forEach(function (k) {
                var v = window.localStorage.getItem(k);
                if (v !== null) stash[k] = v;
            });
            window.sessionStorage.setItem(STASH_KEY, JSON.stringify(stash));
        } catch (e) { /* storage isiyopatikana */ }
    }
    function restoreAgentLocalState() {
        try {
            var raw = window.sessionStorage.getItem(STASH_KEY);
            if (raw) {
                var stash = JSON.parse(raw) || {};
                Object.keys(stash).forEach(function (k) {
                    try { window.localStorage.setItem(k, stash[k]); } catch (e2) {}
                });
                window.sessionStorage.removeItem(STASH_KEY);
            }
        } catch (e) { /* storage isiyopatikana */ }
    }
    function clearSensitiveLocalState() {
        SENSITIVE_KEYS.forEach(function (k) {
            try { window.localStorage.removeItem(k); } catch (e) {}
            try { window.sessionStorage.removeItem(k); } catch (e) {}
        });
        try { window.sessionStorage.removeItem('sokohai_mode'); } catch (e) {}
        // In-memory cart — currentUser/currentUserData ZINASIMAMIWA na
        // 60-identity-layer (applyMemberIdentity/restore); tusizivunje hapa.
        try { if (skh.myCart) skh.myCart = []; } catch (e) {}
    }

    window.skhAssistLogout = async function (fromTimeout) {
        var s = getSession();
        try {
            if (s && s.sessionId && viaServer()) {
                await callServer('assistedSessionEnd', { sessionId: s.sessionId }).catch(function () {});
            }
        } catch (e) {}
        setSession(null);
        clearActivity();
        clearSensitiveLocalState();
        removeBanner();
        try { document.body.style.paddingTop = ''; } catch (e) {}
        // [IDENTITY-FIX BUG-03+06 2026-09-16] NATIVE-MODE: wakala ndiye Firebase
        // user — signOut ingemng'oa kabisa na kumkosesha profile yake ("Rudi kwa
        // Wakala" = navigation TU, si kubadilisha auth). Rejesha mazingira ya
        // wakala yaliyowekwa stash wakati wa kuingia, kisha identity-layer
        // (60) inarejesha currentUser — wakala anaendelea mara moja.
        // SERVER-MODE: mwanachama ndiye signed-in user — signOut NI LAZIMA.
        var sWas = s;
        if (sWas && sWas.nativeMode) {
            restoreAgentLocalState();
        } else {
            try { if (skh.auth && skh.signOut) await skh.signOut(); } catch (e) {}
        }
        try { if (typeof window.skhSyncOnLogout === 'function') window.skhSyncOnLogout(); } catch (e) {}
        if (fromTimeout) {
            alert('Kipindi cha msaada kimefungwa kwa sababu ya kutokuwa na shughuli kwa muda mrefu.');
        }
        // Rudi kwenye Agent Mode
        try { window.switchMode('agent'); } catch (e) {}
        try { window.closeModals(); } catch (e) {}
    };

    // ---------- MICHEPUO YA PIN (mwanachama anaandika mwenyewe) ----------
    function pinFieldsHtml(idPrefix) {
        return '' + '<label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:5px;">PIN YA MWANACHAMA (tarakimu 4–6) *</label>' + '<input type="password" inputmode="numeric" maxlength="6" id="' + idPrefix + 'Pin" placeholder="••••••" style="width:100%; padding:16px; border-radius:12px; border:2px solid #18A982; text-align:center; font-size:22px; letter-spacing:8px; font-weight:900; outline:none; box-sizing:border-box; margin-bottom:10px;">' + '<label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:5px;">THIBITISHA PIN *</label>' + '<input type="password" inputmode="numeric" maxlength="6" id="' + idPrefix + 'Pin2" placeholder="••••••" style="width:100%; padding:16px; border-radius:12px; border:2px solid #cbd5e1; text-align:center; font-size:22px; letter-spacing:8px; font-weight:900; outline:none; box-sizing:border-box; margin-bottom:10px;">';
    }
    function readPin(idPrefix) {
        var p1 = document.getElementById(idPrefix + 'Pin');
        var p2 = document.getElementById(idPrefix + 'Pin2');
        var pin = p1 ? p1.value : '';
        var pin2 = p2 ? p2.value : '';
        if (!/^\d{4,6}$/.test(pin)) { alert('PIN lazima iwe tarakimu 4 hadi 6.'); return null; }
        if (p2 && pin !== pin2) { alert('PIN mbili hazilingani. Jaribu tena.'); return null; }
        return pin;
    }

    // ---------- MICHORO YA AGENT ----------
    var assistState = { regName: '', regRegion: '', regDistrict: '', regBusiness: '' };

    window.skhAssistHome = function () {
        var c = document.getElementById('richDashboardContainer');
        if (!c) return;
        c.innerHTML = '<div style="max-width:640px; margin:0 auto;">' + '  <div style="background:#fff; color:#18352D; border:1px solid #D5E2DE; box-shadow:0 3px 14px rgba(24,53,45,.07); border-radius:20px; padding:24px; margin-bottom:18px;">' + '    <h2 style="margin:0 0 6px; font-weight:900;">Msaada wa Mwanachama</h2>' + '    <p style="margin:0; font-size:12px; opacity:0.85; line-height:1.5;">Sajili mwanachama asiye na simu, au msaidie aliyepo kuingia.</p>' + '  </div>' + '  <button onclick="window.skhAssistRegisterView()" style="width:100%; padding:18px; background:#18A982; color:#fff; border:none; border-radius:16px; font-weight:900; font-size:15px; cursor:pointer; margin-bottom:12px;">SAJILI MWANACHAMA MPYA (ASIYE NA SIMU)</button>' + '  <button onclick="window.skhAssistLoginView()" style="width:100%; padding:18px; background:#18A982; color:#fff; border:none; border-radius:16px; font-weight:900; font-size:15px; cursor:pointer; margin-bottom:12px;">SAIDIA MWANACHAMA ALIYEPO (INGIA)</button>' + '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">' + '    <button onclick="window.skhAssistMembersView()" style="padding:14px; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:14px; font-weight:bold; font-size:13px; cursor:pointer;">WANACHAMA WANGU</button>' + '    <button onclick="window.skhAssistActivityView()" style="padding:14px; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:14px; font-weight:bold; font-size:13px; cursor:pointer;">KUMBUKUMBU (AUDIT)</button>' +
  '  </div>' +
  '  <button onclick="window.skhAgentMonitorView()" style="width:100%; margin-top:12px; padding:14px; background:#EAF3FA; color:#0B4F7A; border:1px solid #D6E8F5; border-radius:14px; font-weight:bold; font-size:13px; cursor:pointer;">UFUATILIAJI WA SHUGHULI ZA WANACHAMA</button>' +
  '  <div style="display:none">' + '  </div>' + '  <button onclick="window.loadAgentDashboard()" style="width:100%; margin-top:12px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI KWENYE DAFTARI LA WAKALA</button>' + '</div>';
    };

    window.skhAssistRegisterView = function () {
        var c = document.getElementById('richDashboardContainer');
        if (!c) return;
        assistState = { regName: '', regRegion: '', regDistrict: '', regBusiness: '' };
        c.innerHTML = '<div style="max-width:480px; margin:0 auto; background:#fff; padding:24px; border-radius:20px; border:1.5px solid #cbd5e1;">' + '  <h3 style="margin:0 0 4px; color:var(--primary-dark); font-weight:900;">Sajili Mwanachama Mpya</h3>' + '  <p style="font-size:12px; color:#64748b; margin:0 0 16px; line-height:1.5;">Mwanachama anapata <b>Member ID</b> yake ya kudumu.</p>' + '  <label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">JINA KAMILI *</label>' + '  <input type="text" id="assistRegName" style="width:100%; padding:13px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:12px; box-sizing:border-box;" placeholder="mf. Juma Hassan">' + '  <label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">MKOA *</label>' + '  <select id="assistRegRegion" style="width:100%; padding:13px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; margin-bottom:12px;">' + '    <option value="Dar es Salaam">Dar es Salaam</option><option value="Arusha">Arusha</option><option value="Mwanza">Mwanza</option><option value="Mbeya">Mbeya</option><option value="Dodoma">Dodoma</option><option value="Tanga">Tanga</option><option value="Morogoro">Morogoro</option>' + '  </select>' + '  <label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">WILAYA</label>' + '  <input type="text" id="assistRegDistrict" style="width:100%; padding:13px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:12px; box-sizing:border-box;" placeholder="mf. Ilala">' + '  <label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">AINA YA BIASHARA (hiari)</label>' + '  <input type="text" id="assistRegBusiness" style="width:100%; padding:13px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:16px; box-sizing:border-box;" placeholder="mf. Kilimo / Duka">' + '  <button onclick="window.skhAssistRegisterStep2()" style="width:100%; padding:16px; background:#18A982; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">ENDELEA — MWANACHAMA AWEKE PIN</button>' + '  <button onclick="window.skhAssistHome()" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' + '</div>';
    };

    window.skhAssistRegisterStep2 = function () {
        var name = document.getElementById('assistRegName').value.trim();
        var region = document.getElementById('assistRegRegion').value;
        var district = document.getElementById('assistRegDistrict').value.trim();
        var business = document.getElementById('assistRegBusiness').value.trim();
        if (!name || !region) { alert('Jaza angalau Jina na Mkoa.'); return; }
        assistState = { regName: name, regRegion: region, regDistrict: district, regBusiness: business };

        var c = document.getElementById('richDashboardContainer');
        c.innerHTML = '<div style="max-width:480px; margin:0 auto; background:#fff; padding:24px; border-radius:20px; border:1.5px solid #1268A8;">' + '  <div style="text-align:center; margin-bottom:14px;">' + '    <div style="display:inline-block; background:#fffbeb; border:1px solid var(--gold); border-radius:12px; padding:10px 14px; font-size:12px; color:#92400e; font-weight:bold; margin-bottom:10px;">' + ' ' + escapeHtml(name) + ' aandike PIN yake mwenyewe' + '    </div>' + '  </div>' +
            pinFieldsHtml('assistReg') + '  <button id="btnAssistRegSubmit" onclick="window.skhAssistRegisterSubmit()" style="width:100%; padding:16px; background:#18A982; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">MALIZA USAJILI</button>' + '  <button onclick="window.skhAssistRegisterView()" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' + '</div>';
    };

    window.skhAssistRegisterSubmit = async function () {
        var pin = readPin('assistReg');
        if (!pin) return;
        var btn = document.getElementById('btnAssistRegSubmit');
        if (btn) { btn.disabled = true; btn.innerHTML = 'INASAJILI...'; }
        try {
            // [OFFLINE-MEMBER 2026-09] Njia MOJA (server) ikiwa functions zipo;
            // vinginevyo Firestore-native fallback — hakuna "internal" tena.
            var res = await window.skhAssistRegisterMember({
                fullName: assistState.regName,
                region: assistState.regRegion,
                district: assistState.regDistrict,
                businessType: assistState.regBusiness,
                pin: pin
            });
            if (!res || !res.ok) throw new Error((res && res.error) || 'Usajili umeshindikana.');
            window.skhAssistShowMemberCard(res);
        } catch (e) {
            alert('Hitilafu: ' + (e && e.message ? e.message : e));
            if (btn) { btn.disabled = false; btn.innerHTML = 'MALIZA USAJILI'; }
        }
    };

    window.skhAssistShowMemberCard = function (res) {
        var c = document.getElementById('richDashboardContainer');
        var code = res.memberId || '';
        c.innerHTML = '<div style="max-width:440px; margin:0 auto; text-align:center; background:#fff; padding:28px; border-radius:20px; border:1.5px solid #bbf7d0;">' + '  <div style="font-size:46px; margin-bottom:6px;">&#10003;</div>' + '  <h3 style="color:green; margin:0 0 4px; font-weight:900;">Mwanachama Amesajiliwa!</h3>' + '  <p style="font-size:12px; color:#64748b; margin:0 0 18px;">Kadi ya Mwanachama — hii ni namba yake ya kudumu ya kuingia.</p>' + '  <div style="background:#f0fdf4; border:2px dashed #16a34a; border-radius:16px; padding:20px 12px; margin-bottom:14px;">' + '    <div style="font-size:13px; color:#475569; font-weight:bold;">MEMBER ID</div>' + '    <div id="assistMemberCode" style="font-size:30px; font-weight:900; letter-spacing:2px; color:#0f172a; margin:6px 0;">' + escapeHtml(code) + '</div>' + '  </div>' + '  <button onclick="window.skhCopyText(document.getElementById(\'assistMemberCode\').innerText)" style="width:100%; padding:13px; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:12px; font-weight:bold; cursor:pointer; margin-bottom:10px;">NAKILI MEMBER ID</button>' + '  <button onclick="window.skhAssistLoginView(\'' + escapeHtml(code) + '\')" style="width:100%; padding:16px; background:#18A982; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer; margin-bottom:10px;">ENDELEA — MWANACHAMA ATUMIE SOKOHAI</button>' + '  <button onclick="window.skhAssistHome()" style="width:100%; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' + '</div>';
    };

    window.skhAssistLoginView = function (prefillCode) {
        var c = document.getElementById('richDashboardContainer');
        if (!c) return;
        c.innerHTML = '<div style="max-width:460px; margin:0 auto; background:#fff; padding:24px; border-radius:20px; border:1.5px solid #cbd5e1;">' + '  <h3 style="margin:0 0 4px; color:var(--primary-dark); font-weight:900;">Msaidie Mwanachama Kuingia</h3>' + '  <label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">MEMBER ID (mf. SKH-00012345) *</label>' + '  <input type="text" id="assistLoginMemberId" value="' + escapeHtml(prefillCode || '') + '" style="width:100%; padding:15px; border-radius:12px; border:1px solid #cbd5e1; text-align:center; font-size:20px; font-weight:900; letter-spacing:1px; margin-bottom:12px; box-sizing:border-box; text-transform:uppercase;" placeholder="SKH-XXXXXXXX">' + '  <input type="password" inputmode="numeric" maxlength="6" id="assistLoginPin" placeholder="PIN (4–6 tarakimu)" style="width:100%; padding:16px; border-radius:12px; border:2px solid #18A982; text-align:center; font-size:22px; letter-spacing:8px; font-weight:900; outline:none; box-sizing:border-box; margin-bottom:16px;">' + '  <button id="btnAssistLogin" onclick="window.skhAssistLoginSubmit()" style="width:100%; padding:16px; background:#18A982; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">THIBITISHA &amp; INGIA</button>' + '  <button onclick="window.skhAssistHome()" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:900; cursor:pointer;">RUDI</button>' + '</div>';
    };

    window.skhAssistLoginSubmit = async function () {
        var memberId = (document.getElementById('assistLoginMemberId').value || '').trim().toUpperCase();
        var pin = (document.getElementById('assistLoginPin').value || '').trim();
        if (!memberId) { alert('Weka Member ID ya mwanachama.'); return; }
        if (!/^\d{4,6}$/.test(pin)) { alert('PIN lazima iwe tarakimu 4 hadi 6.'); return; }

        var btn = document.getElementById('btnAssistLogin');
        if (btn) { btn.disabled = true; btn.innerHTML = 'INATHIBITISHA...'; }

        try {
            var res = null, nativeMode = false;
            try {
                res = await callServer('memberAuthenticate', { memberId: memberId, pin: pin });
            } catch (eSrv) {
                /* [FIX 2026-09-15] `memberAuthenticate` ni 404 (haijadeploy).
                   Hapo awali hii ilikuwa mwisho wa njia — mwanachama wa offline
                   HAKUWEZA KAMWE kuingia. Sasa tunathibitisha PIN kwa PBKDF2
                   ile ile ya server (Firestore + memberSecrets).

                   TOFAUTI MUHIMU (bila kudanganya): bila server hakuna
                   `customToken`, hivyo HAKUNA Firebase sign-in. Ni KIKAO CHA
                   WAKALA: wakala anaendesha kwa niaba, na kila kitendo
                   kinarekodiwa. Tunamwambia mtumiaji ukweli huu. */
                if (!isAssistServerDown(eSrv)) throw eSrv;
                res = await window.skhAssistAuthenticateNative(memberId, pin);
                nativeMode = true;
            }
            if (!res || !res.ok) throw new Error((res && res.error) || 'Uthibitisho umeshindikana.');
            if (!nativeMode && !res.customToken) throw new Error('Uthibitisho umeshindikana.');

            var agentId = (skh.currentUser && skh.currentUser.uid) || '';
            // [IDENTITY-FIX BUG-07] Linzi: jishikiza fields toka level yoyote
            // (server top-level au native nested member) — kamwe undefined.
            var state = {
                sessionId: res.sessionId,
                agentId: agentId,
                memberUid: res.uid || (res.member && res.member.uid) || null,
                memberCode: res.memberId || (res.member && res.member.memberId) || null,
                memberName: res.memberName || (res.member && res.member.fullName) || '',
                // [IDENTITY-FIX DP 2026-09-16] DP ya mwanachama ipakue kwenye
                // session — TopNav/sidebar ionyeshe YAKE, si avatar ya fallback.
                memberPhoto: res.memberPhoto || (res.member && res.member.photoURL) || null,
                startedAt: new Date().toISOString(),
                expiresAt: res.expiresAt || null
            };
            if (!state.memberUid) throw new Error('Uthibitisho umeshindikana (utambulisho ukosekana).');
            setSession(state);

            if (nativeMode) {
                // Kikao cha wakala: hakuna Firebase sign-in (server pekee ndiye
                // anaweza kutoa customToken). Wakala anaendesha kwa niaba.
                // [IDENTITY-FIX BUG-06] Stash+safisha data ya wakala KABLA —
                // mwanachama asione cart/wishlist ya wakala.
                stashAgentLocalState();
                clearSensitiveLocalState();
                state.memberName = (res.member && res.member.fullName) || '';
                state.nativeMode = true;
                setSession(state);
                skh.assistedMember = res.member || null;
                injectBanner();
                skhToast('Umeingia kwa niaba ya ' + (state.memberName || memberId) +
                         '. Kila kitendo kinarekodiwa.', 'success', 4000);
                try { window.switchMode('buyer'); } catch (e) {}
                if (typeof window.skhAssistHome === 'function') window.skhAssistHome();
                return;
            }

            // Mwanachama anaingia kwenye akaunti YAKE halisi (custom token ya server)
            if (deps && deps.signInWithCustomToken) {
                await deps.signInWithCustomToken(res.customToken);
            } else if (skh.signInWithCustomToken && skh.auth) {
                /* [AUDIT-FIX 2026-09-16] Firebase v10 modular:
                   signInWithCustomToken(auth, token) ni function huru —
                   SI method ya auth object (v8 style haifanyi kazi). */
                await skh.signInWithCustomToken(skh.auth, res.customToken);
            } else {
                throw new Error('signInWithCustomToken haipatikani.');
            }

            injectBanner();
            try { window.switchMode('buyer'); } catch (e) {}
        } catch (e) {
            alert('Hitilafu: ' + (e && e.message ? e.message : e));
            if (btn) { btn.disabled = false; btn.innerHTML = 'THIBITISHA & INGIA'; }
        }
    };

    // ---------- ORODHA YA WANACHAMA + ACTIONS ----------
    var membersPage = { cursor: null };

    window.skhAssistMembersView = async function () {
        var c = document.getElementById('richDashboardContainer');
        if (!c) return;
        c.innerHTML = '<div style="text-align:center; padding:40px;"><p>Inapakia wanachama...</p></div>';
        try {
            var res;
            try {
                res = await callServer('agentListMembers', { pageSize: 20, startAfterId: membersPage.cursor || null });
            } catch (eL) {
                if (!isAssistServerDown(eL)) throw eL;
                res = await window.skhAssistListMembersNative();
            }
            var members = (res && res.members) || [];
            membersPage.cursor = (res && res.lastDocId) || null;

            var rows = members.length ? members.map(function (m) {
                var statusColor = m.status === 'ACTIVE' ? 'green' : (m.status === 'SUSPENDED' ? '#b45309' : 'gray');
                return '' + '<div style="padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; align-items:center;">' + '  <div style="min-width:180px;">' + '    <b style="font-size:14px; color:#0f172a;">' + escapeHtml(m.fullName) + '</b>' + '    <span style="display:block; font-size:13px; font-weight:900; color:#178864;">' + escapeHtml(m.memberCode) + '</span>' + '    <span style="display:block; font-size:13px; color:gray;">' + escapeHtml(m.region) + (m.district ? ' · ' + escapeHtml(m.district) : '') + '</span>' + '    <span style="display:block; font-size:12.5px; color:gray;">Status: <b style="color:' + statusColor + ';">' + escapeHtml(m.status) + '</b>' + '      · Mwisho kusaidiwa: ' + (m.lastAssistedAt ? new Date(m.lastAssistedAt).toLocaleString() : '—') + '</span>' + '  </div>' + '  <div style="display:flex; gap:6px; flex-wrap:wrap;">' + '    <button onclick="window.skhAssistLoginView(\'' + escapeHtml(m.memberCode) + '\')" style="padding:9px 12px; background:#18A982; color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">SAIDIA</button>' +
                (m.status === 'ACTIVE'
                    ? '<button onclick="window.skhAssistMemberAction(\'' + escapeHtml(m.memberId) + '\',\'SUSPENDED\')" style="padding:9px 12px; background:#fef3c7; color:#92400e; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">SIMAMISHA</button>'
                    : '<button onclick="window.skhAssistMemberAction(\'' + escapeHtml(m.memberId) + '\',\'ACTIVE\')" style="padding:9px 12px; background:#dcfce7; color:#166534; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">WASHA</button>') + '    <button onclick="window.skhAssistMemberAction(\'' + escapeHtml(m.memberId) + '\',\'ENDED\')" style="padding:9px 12px; background:#fee2e2; color:#b91c1c; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">MALIZA</button>' + '  </div>' + '</div>';
            }).join('') : '<p style="color:gray; text-align:center; font-size:12px; padding:14px;">Hakuna wanachama bado.</p>';

            c.innerHTML = '<div style="max-width:640px; margin:0 auto;">' + '  <h3 style="color:var(--primary-dark); font-weight:900; margin:0 0 14px;">Wanachama Wangu (' + members.length + ')</h3>' + '  <div style="display:flex; flex-direction:column; gap:10px;">' + rows + '</div>' + '  <button onclick="window.skhAssistHome()" style="width:100%; margin-top:14px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' + '</div>';
        } catch (e) {
            c.innerHTML = '<div style="max-width:480px; margin:0 auto; text-align:center; padding:30px;"><p style="color:#b91c1c;">Hitilafu: ' + escapeHtml(e.message) + '</p><button onclick="window.skhAssistHome()" style="padding:12px 20px; background:#e2e8f0; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">RUDI</button></div>';
        }
    };

    window.skhAssistMemberAction = async function (memberId, status) {
        if (!memberId) return;
        if (status === 'ENDED' && !await skhConfirm('Unahakika unataka kumaliza uhusiano na mwanachama huyu?')) return;
        try {
            try {
                await callServer('agentMemberStatus', { memberId: memberId, status: status });
            } catch (eS) {
                if (!isAssistServerDown(eS)) throw eS;
                await window.skhAssistMemberStatusNative(memberId, status);
            }
            alert('Uhusiano umesasishwa kuwa ' + status + '.');
            window.skhAssistMembersView();
        } catch (e) {
            alert('Hitilafu: ' + (e && e.message ? e.message : e));
        }
    };

    // ---------- AUDIT (assistedActivity) ----------
    window.skhAssistActivityView = async function () {
        var c = document.getElementById('richDashboardContainer');
        if (!c) return;
        c.innerHTML = '<div style="text-align:center; padding:40px;"><p>Inapakia kumbukumbu...</p></div>';
        try {
            if (!deps) throw new Error('Firestore haijasajiliwa.');
            var uid = (skh.currentUser && skh.currentUser.uid) || '';
            // [FIX 2026-09] Hakuna orderBy — inaepuka hitaji la composite index;
            // tunapanga kwenye memory (mpya kwanza).
            var q = deps.query(deps.collection(deps.db, 'assistedActivity'),
                deps.where('agentId', '==', uid),
                deps.limit(100));
            var snap = await deps.getDocs(q);
            var actDocs = snap.docs.slice().sort(function (x, y) {
                return (Date.parse(y.data().timestamp) || 0) - (Date.parse(x.data().timestamp) || 0);
            }).slice(0, 50);
            var rows = actDocs.length === 0 ? '<p style="color:gray; text-align:center; font-size:12px;">Hakuna shughuli bado.</p>'
                : actDocs.map(function (d) {
                    var a = d.data();
                    return '' + '<div style="padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; font-size:12px;">' + '  <b style="color:#0f172a;">' + escapeHtml(a.action) + '</b>' + '  <span style="color:gray; display:block;">Mwanachama: ' + escapeHtml(a.userId) + (a.referenceId ? ' · Ref: ' + escapeHtml(a.referenceId) : '') + '</span>' + '  <span style="color:#94a3b8; font-size:12.5px;">' + new Date(a.timestamp).toLocaleString() + '</span>' + '</div>';
                }).join('');
            c.innerHTML = '<div style="max-width:640px; margin:0 auto;">' + '  <h3 style="color:var(--primary-dark); font-weight:900; margin:0 0 14px;">Kumbukumbu ya Shughuli za Msaada</h3>' + '  <p style="font-size:13px; color:#64748b; margin:0 0 12px;">Hakuna PIN wala siri yoyote inayorekodiwa hapa — vitendo tu.</p>' + '  <div style="display:flex; flex-direction:column; gap:8px;">' + rows + '</div>' + '  <button onclick="window.skhAssistHome()" style="width:100%; margin-top:14px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' + '</div>';
        } catch (e) {
            c.innerHTML = '<div style="max-width:480px; margin:0 auto; text-align:center; padding:30px;"><p style="color:#b91c1c;">Hitilafu: ' + escapeHtml(e.message) + '</p><button onclick="window.skhAssistHome()" style="padding:12px 20px; background:#e2e8f0; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">RUDI</button></div>';
        }
    };

    // ---------- Mwanachama abadilishe PIN yake mwenyewe ----------
    window.skhAssistOpenPinModal = function () {
        var existing = document.getElementById('skhAssistPinModal');
        if (existing) { existing.style.display = 'flex'; return; }
        var modal = document.createElement('div');
        modal.id = 'skhAssistPinModal';
        modal.setAttribute('style', 'position:fixed; inset:0; z-index:100000; background:rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; padding:16px;');
        modal.innerHTML = '<div style="background:#fff; border-radius:20px; padding:24px; width:100%; max-width:400px; box-shadow:0 15px 40px rgba(0,0,0,0.4);">' + '  <h3 style="margin:0 0 12px; color:var(--primary-dark); font-weight:900;">Badilisha PIN Yangu</h3>' + '  <label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">PIN YA SASA *</label>' + '  <input type="password" inputmode="numeric" maxlength="6" id="skhAssistOldPin" placeholder="••••••" style="width:100%; padding:14px; border-radius:12px; border:1px solid #cbd5e1; text-align:center; font-size:20px; letter-spacing:6px; font-weight:900; margin-bottom:12px; box-sizing:border-box;">' + '  <label style="font-size:13px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">PIN MPYA *</label>' + '  <input type="password" inputmode="numeric" maxlength="6" id="skhAssistNewPin" placeholder="••••••" style="width:100%; padding:14px; border-radius:12px; border:1px solid #cbd5e1; text-align:center; font-size:20px; letter-spacing:6px; font-weight:900; margin-bottom:12px; box-sizing:border-box;">' + '  <button onclick="window.skhAssistChangePin()" style="width:100%; padding:14px; background:#18A982; color:#fff; border:none; border-radius:12px; font-weight:900; cursor:pointer;">HIFADHI PIN MPYA</button>' + '  <button onclick="document.getElementById(\'skhAssistPinModal\').style.display=\'none\'" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">GHAIRI</button>' + '</div>';
        document.body.appendChild(modal);
    };

    window.skhAssistChangePin = async function () {
        var oldPin = document.getElementById('skhAssistOldPin').value.trim();
        var newPin = document.getElementById('skhAssistNewPin').value.trim();
        if (!/^\d{4,6}$/.test(oldPin)) { alert('Weka PIN ya sasa (tarakimu 4–6).'); return; }
        if (!/^\d{4,6}$/.test(newPin)) { alert('PIN mpya lazima iwe tarakimu 4–6.'); return; }
        try {
            try {
                await callServer('memberSetPin', { oldPin: oldPin, newPin: newPin });
            } catch (eP) {
                if (!isAssistServerDown(eP)) throw eP;
                var sess = getSession();
                if (!sess || !sess.memberUid) throw new Error('Hakuna kikao cha mwanachama.');
                await window.skhAssistSetPinNative(sess.memberUid, oldPin, newPin);
            }
            alert('PIN imebadilishwa kikamilifu.');
            document.getElementById('skhAssistPinModal').style.display = 'none';
        } catch (e) {
            alert('Hitilafu: ' + (e && e.message ? e.message : e));
        }
    };

    // ---------- RESTORE / LOGOUT via onAuthStateChanged ----------
    if (skh.onAuthStateChanged && skh.auth) {
        skh.onAuthStateChanged(skh.auth, function (user) {
            var s = getSession();
            if (!user && s) {
                // [IDENTITY-FIX BUG-02] Hakuna Firebase user kabisa — wakala ametoka
                // (native) au mwanachama ametoka (server). Kipindi ni lazima kiishe.
                setSession(null);
                clearActivity();
                clearSensitiveLocalState();
                removeBanner();
                try { document.body.style.paddingTop = ''; } catch (e) {}
            } else if (user && s) {
                if (s.nativeMode) {
                    // [IDENTITY-FIX BUG-02] NATIVE: Firebase user = WAKALA (uid ≠
                    // memberUid KILA WAKATI). Awali hii ilifuta session baada ya
                    // refresh — kipindi cha mwanachama kikatelekeza. Sasa: rejesha
                    // banner tu; utambulisho unashughulikiwa na 60-identity-layer.
                    setTimeout(function () { injectBanner(); }, 100);
                } else if (user.uid === s.memberUid) {
                    // Rejesha banner ya kipindi (mf. refresh).
                    setTimeout(function () { injectBanner(); }, 100);
                } else {
                    // Server-mode: mtumiaji tofauti — kipindi cha zamani hakihusiki tena.
                    setSession(null);
                    clearActivity();
                    removeBanner();
                }
            }
        });
    }

    // Expose kwa majaribio + masterCommands
    window.skhAssistGetSession = getSession;
    window.skhAssistSetSession = setSession;
})();

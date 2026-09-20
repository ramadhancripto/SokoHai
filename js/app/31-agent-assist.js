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
//   - Server inatoa custom token → mwanachama anaingia kwenye
//     akaunti YAKE halisi (normal SokoHai experience)
//   - sessionType: "ASSISTED_USER" + banner + LOGOUT & RETURN TO AGENT
//   - Inactivity timeout (hakuna login ya kudumu kwenye kifaa cha pamoja)
// ============================================================
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    const SESSION_KEY = 'skh_assisted_session';
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

    // (Zinabaki exposed kwa ajili ya majaribio — smoke test inazibadilisha)
    window.skhAgentAssistRegisterFirestore = function (fns) { deps = fns; };
    window.skhAgentAssistRegisterCallables = function (fns) { callFns = fns || {}; };

    // ---------- STATE (memory + sessionStorage) ----------
    var memSession = null;

    function getSession() {
        try {
            var raw = window.sessionStorage.getItem(SESSION_KEY);
            if (!raw) return memSession;
            var s = JSON.parse(raw);
            if (!s || !s.sessionId) return null;
            return s;
        } catch (e) { return memSession; }
    }
    function setSession(s) {
        memSession = s || null;
        try {
            if (s) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
            else window.sessionStorage.removeItem(SESSION_KEY);
        } catch (e) { /* storage isiyopatikana */ }
    }
    function clearActivity() { try { window.sessionStorage.removeItem(ACTIVITY_KEY); } catch (e) {} }
    function touchActivity() { try { window.sessionStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch (e) {} }
    function lastActivity() {
        try { var v = window.sessionStorage.getItem(ACTIVITY_KEY); return v ? Number(v) : Date.now(); }
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
            uid: uid, fullName: fullName, memberId: memberCode,
            region: region, district: district, businessType: businessType,
            hasPhone: false, hasPin: true, isOfflineUser: true,
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
        banner.setAttribute('style',
            'position:fixed; top:0; left:0; right:0; z-index:9000; ' +
            'display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; ' +
            'padding:10px 14px; background:#1268A8; color:#fff; box-shadow:0 4px 16px rgba(0,0,0,0.25); font-family:inherit;');
        banner.innerHTML =
            '<div style="display:flex; align-items:center; gap:10px; min-width:0;">' +
            '  <span style="display:inline-flex; width:30px; height:30px; border-radius:50%; background:#ffd166; color:#0f172a; align-items:center; justify-content:center; font-weight:900; font-size:14px;">S</span>' +
            '  <div style="min-width:0;">' +
            '    <div style="font-weight:900; font-size:13px; letter-spacing:0.3px;">KIPINDI CHA MSAADA (ASSISTED SESSION)</div>' +
            '    <div style="font-size:11px; opacity:0.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
            '      Mwanachama: <b>' + escapeHtml(s.memberCode || s.memberUid) + '</b>' +
            (s.memberName ? ' &middot; ' + escapeHtml(s.memberName) : '') + '</div>' +
            '  </div>' +
            '</div>' +
            '<div style="display:flex; gap:8px; align-items:center; flex-shrink:0;">' +
            '  <button id="skhAssistChangePinBtn" type="button" style="padding:10px 12px; background:rgba(255,255,255,0.15); color:#fff; border:1px solid rgba(255,255,255,0.4); border-radius:10px; font-weight:bold; font-size:11px; cursor:pointer;">BADILISHA PIN</button>' +
            '  <button id="skhAssistLogoutBtn" type="button" style="padding:10px 14px; background:#e11d48; color:#fff; border:none; border-radius:10px; font-weight:900; font-size:12px; cursor:pointer; letter-spacing:0.4px;">TOKA &amp; RUDI KWA WAKALA</button>' +
            '</div>';

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
    function clearSensitiveLocalState() {
        var keys = ['sokohai_cart', 'sokohai_pending_checkout', 'sokohai_saved_later',
            'sokohai_wishlist', 'sokohai_saved_cart', 'sokohai_offline_sales',
            'sokohai_active_shift', 'haipay_saved_v1', 'currently_managed_offline_uid',
            'currently_managed_offline_name', 'currently_managed_offline_shop'];
        keys.forEach(function (k) {
            try { window.localStorage.removeItem(k); } catch (e) {}
            try { window.sessionStorage.removeItem(k); } catch (e) {}
        });
        try { window.sessionStorage.removeItem('sokohai_mode'); } catch (e) {}
        // In-memory state
        try {
            if (skh.myCart) skh.myCart = [];
            skh.currentUserData = null;
        } catch (e) {}
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
        try {
            if (skh.auth && skh.signOut) await skh.signOut();
        } catch (e) {}
        try { if (typeof window.skhSyncOnLogout === 'function') window.skhSyncOnLogout(); } catch (e) {}
        if (fromTimeout) {
            alert('Kipindi cha msaada kimefungwa kwa sababu ya kutokuwa na shughuli kwa muda mrefu.');
        }
        // Rudi kwenye Agent Mode (wakala atajilojini mwenyewe tena)
        try { window.switchMode('agent'); } catch (e) {}
        try { window.closeModals(); } catch (e) {}
    };

    // ---------- MICHEPUO YA PIN (mwanachama anaandika mwenyewe) ----------
    function pinFieldsHtml(idPrefix) {
        return '' +
            '<label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:5px;">PIN YA MWANACHAMA (tarakimu 4–6) *</label>' +
            '<input type="password" inputmode="numeric" maxlength="6" id="' + idPrefix + 'Pin" placeholder="••••••" style="width:100%; padding:16px; border-radius:12px; border:2px solid #1268A8; text-align:center; font-size:22px; letter-spacing:8px; font-weight:900; outline:none; box-sizing:border-box; margin-bottom:10px;">' +
            '<label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:5px;">THIBITISHA PIN *</label>' +
            '<input type="password" inputmode="numeric" maxlength="6" id="' + idPrefix + 'Pin2" placeholder="••••••" style="width:100%; padding:16px; border-radius:12px; border:2px solid #cbd5e1; text-align:center; font-size:22px; letter-spacing:8px; font-weight:900; outline:none; box-sizing:border-box; margin-bottom:10px;">';
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
        c.innerHTML =
            '<div style="max-width:640px; margin:0 auto;">' +
            '  <div style="background:linear-gradient(135deg,#1268A8,#0f172a); color:#fff; border-radius:20px; padding:24px; margin-bottom:18px;">' +
            '    <h2 style="margin:0 0 6px; font-weight:900;">Msaada wa Mwanachama</h2>' +
            '    <p style="margin:0; font-size:12px; opacity:0.85; line-height:1.5;">Sajili mwanachama asiye na simu, au msaidie aliyepo kuingia.</p>' +
            '  </div>' +
            '  <button onclick="window.skhAssistRegisterView()" style="width:100%; padding:18px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:16px; font-weight:900; font-size:15px; cursor:pointer; margin-bottom:12px;">SAJILI MWANACHAMA MPYA (ASIYE NA SIMU)</button>' +
            '  <button onclick="window.skhAssistLoginView()" style="width:100%; padding:18px; background:#1268A8; color:#fff; border:none; border-radius:16px; font-weight:900; font-size:15px; cursor:pointer; margin-bottom:12px;">SAIDIA MWANACHAMA ALIYEPO (INGIA)</button>' +
            '  <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">' +
            '    <button onclick="window.skhAssistMembersView()" style="padding:14px; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:14px; font-weight:bold; font-size:13px; cursor:pointer;">WANACHAMA WANGU</button>' +
            '    <button onclick="window.skhAssistActivityView()" style="padding:14px; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:14px; font-weight:bold; font-size:13px; cursor:pointer;">KUMBUKUMBU (AUDIT)</button>' +
            '  </div>' +
            '  <button onclick="window.loadAgentDashboard()" style="width:100%; margin-top:12px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI KWENYE DAFTARI LA WAKALA</button>' +
            '</div>';
    };

    window.skhAssistRegisterView = function () {
        var c = document.getElementById('richDashboardContainer');
        if (!c) return;
        assistState = { regName: '', regRegion: '', regDistrict: '', regBusiness: '' };
        c.innerHTML =
            '<div style="max-width:480px; margin:0 auto; background:#fff; padding:24px; border-radius:20px; border:1.5px solid #cbd5e1;">' +
            '  <h3 style="margin:0 0 4px; color:var(--primary-dark); font-weight:900;">Sajili Mwanachama Mpya</h3>' +
            '  <p style="font-size:12px; color:#64748b; margin:0 0 16px; line-height:1.5;">Mwanachama anapata <b>Member ID</b> yake ya kudumu.</p>' +
            '  <label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">JINA KAMILI *</label>' +
            '  <input type="text" id="assistRegName" style="width:100%; padding:13px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:12px; box-sizing:border-box;" placeholder="mf. Juma Hassan">' +
            '  <label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">MKOA *</label>' +
            '  <select id="assistRegRegion" style="width:100%; padding:13px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; margin-bottom:12px;">' +
            '    <option value="Dar es Salaam">Dar es Salaam</option><option value="Arusha">Arusha</option><option value="Mwanza">Mwanza</option><option value="Mbeya">Mbeya</option><option value="Dodoma">Dodoma</option><option value="Tanga">Tanga</option><option value="Morogoro">Morogoro</option>' +
            '  </select>' +
            '  <label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">WILAYA</label>' +
            '  <input type="text" id="assistRegDistrict" style="width:100%; padding:13px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:12px; box-sizing:border-box;" placeholder="mf. Ilala">' +
            '  <label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">AINA YA BIASHARA (hiari)</label>' +
            '  <input type="text" id="assistRegBusiness" style="width:100%; padding:13px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:16px; box-sizing:border-box;" placeholder="mf. Kilimo / Duka">' +
            '  <button onclick="window.skhAssistRegisterStep2()" style="width:100%; padding:16px; background:#1268A8; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">ENDELEA — MWANACHAMA AWEKE PIN</button>' +
            '  <button onclick="window.skhAssistHome()" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' +
            '</div>';
    };

    window.skhAssistRegisterStep2 = function () {
        var name = document.getElementById('assistRegName').value.trim();
        var region = document.getElementById('assistRegRegion').value;
        var district = document.getElementById('assistRegDistrict').value.trim();
        var business = document.getElementById('assistRegBusiness').value.trim();
        if (!name || !region) { alert('Jaza angalau Jina na Mkoa.'); return; }
        assistState = { regName: name, regRegion: region, regDistrict: district, regBusiness: business };

        var c = document.getElementById('richDashboardContainer');
        c.innerHTML =
            '<div style="max-width:480px; margin:0 auto; background:#fff; padding:24px; border-radius:20px; border:1.5px solid #1268A8;">' +
            '  <div style="text-align:center; margin-bottom:14px;">' +
            '    <div style="display:inline-block; background:#fffbeb; border:1px solid var(--gold); border-radius:12px; padding:10px 14px; font-size:12px; color:#92400e; font-weight:bold; margin-bottom:10px;">' +
            '      ' + escapeHtml(name) + ' aandike PIN yake mwenyewe' +
            '    </div>' +
            '  </div>' +
            pinFieldsHtml('assistReg') +
            '  <button id="btnAssistRegSubmit" onclick="window.skhAssistRegisterSubmit()" style="width:100%; padding:16px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">MALIZA USAJILI</button>' +
            '  <button onclick="window.skhAssistRegisterView()" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' +
            '</div>';
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
        c.innerHTML =
            '<div style="max-width:440px; margin:0 auto; text-align:center; background:#fff; padding:28px; border-radius:20px; border:1.5px solid #bbf7d0;">' +
            '  <div style="font-size:46px; margin-bottom:6px;">&#10003;</div>' +
            '  <h3 style="color:green; margin:0 0 4px; font-weight:900;">Mwanachama Amesajiliwa!</h3>' +
            '  <p style="font-size:12px; color:#64748b; margin:0 0 18px;">Kadi ya Mwanachama — hii ni namba yake ya kudumu ya kuingia.</p>' +
            '  <div style="background:#f0fdf4; border:2px dashed #16a34a; border-radius:16px; padding:20px 12px; margin-bottom:14px;">' +
            '    <div style="font-size:11px; color:#475569; font-weight:bold;">MEMBER ID</div>' +
            '    <div id="assistMemberCode" style="font-size:30px; font-weight:900; letter-spacing:2px; color:#0f172a; margin:6px 0;">' + escapeHtml(code) + '</div>' +
            '  </div>' +
            '  <button onclick="window.skhCopyText(document.getElementById(\'assistMemberCode\').innerText)" style="width:100%; padding:13px; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:12px; font-weight:bold; cursor:pointer; margin-bottom:10px;">NAKILI MEMBER ID</button>' +
            '  <button onclick="window.skhAssistLoginView(\'' + escapeHtml(code) + '\')" style="width:100%; padding:16px; background:#1268A8; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer; margin-bottom:10px;">ENDELEA — MWANACHAMA ATUMIE SOKOHAI</button>' +
            '  <button onclick="window.skhAssistHome()" style="width:100%; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' +
            '</div>';
    };

    window.skhAssistLoginView = function (prefillCode) {
        var c = document.getElementById('richDashboardContainer');
        if (!c) return;
        c.innerHTML =
            '<div style="max-width:460px; margin:0 auto; background:#fff; padding:24px; border-radius:20px; border:1.5px solid #cbd5e1;">' +
            '  <h3 style="margin:0 0 4px; color:var(--primary-dark); font-weight:900;">Msaidie Mwanachama Kuingia</h3>' +
            '  <label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">MEMBER ID (mf. SKH-00012345) *</label>' +
            '  <input type="text" id="assistLoginMemberId" value="' + escapeHtml(prefillCode || '') + '" style="width:100%; padding:15px; border-radius:12px; border:1px solid #cbd5e1; text-align:center; font-size:20px; font-weight:900; letter-spacing:1px; margin-bottom:12px; box-sizing:border-box; text-transform:uppercase;" placeholder="SKH-XXXXXXXX">' +
            '  <input type="password" inputmode="numeric" maxlength="6" id="assistLoginPin" placeholder="PIN (4–6 tarakimu)" style="width:100%; padding:16px; border-radius:12px; border:2px solid #1268A8; text-align:center; font-size:22px; letter-spacing:8px; font-weight:900; outline:none; box-sizing:border-box; margin-bottom:16px;">' +
            '  <button id="btnAssistLogin" onclick="window.skhAssistLoginSubmit()" style="width:100%; padding:16px; background:#1268A8; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">THIBITISHA &amp; INGIA</button>' +
            '  <button onclick="window.skhAssistHome()" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:900; cursor:pointer;">RUDI</button>' +
            '</div>';
    };

    window.skhAssistLoginSubmit = async function () {
        var memberId = (document.getElementById('assistLoginMemberId').value || '').trim().toUpperCase();
        var pin = (document.getElementById('assistLoginPin').value || '').trim();
        if (!memberId) { alert('Weka Member ID ya mwanachama.'); return; }
        if (!/^\d{4,6}$/.test(pin)) { alert('PIN lazima iwe tarakimu 4 hadi 6.'); return; }

        var btn = document.getElementById('btnAssistLogin');
        if (btn) { btn.disabled = true; btn.innerHTML = 'INATHIBITISHA...'; }

        try {
            var res = await callServer('memberAuthenticate', { memberId: memberId, pin: pin });
            if (!res || !res.ok || !res.customToken) throw new Error((res && res.error) || 'Uthibitisho umeshindikana.');

            var agentId = (skh.currentUser && skh.currentUser.uid) || '';
            var state = {
                sessionId: res.sessionId,
                agentId: agentId,
                memberUid: res.uid,
                memberCode: res.memberId,
                memberName: '',
                startedAt: new Date().toISOString(),
                expiresAt: res.expiresAt
            };
            setSession(state);

            // Mwanachama anaingia kwenye akaunti YAKE halisi (custom token ya server)
            if (deps && deps.signInWithCustomToken) {
                await deps.signInWithCustomToken(res.customToken);
            } else if (skh.auth && skh.auth.signInWithCustomToken) {
                await skh.auth.signInWithCustomToken(res.customToken);
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
            var res = await callServer('agentListMembers', { pageSize: 20, startAfterId: membersPage.cursor || null });
            var members = (res && res.members) || [];
            membersPage.cursor = (res && res.lastDocId) || null;

            var rows = members.length ? members.map(function (m) {
                var statusColor = m.status === 'ACTIVE' ? 'green' : (m.status === 'SUSPENDED' ? '#b45309' : 'gray');
                return '' +
                '<div style="padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; align-items:center;">' +
                '  <div style="min-width:180px;">' +
                '    <b style="font-size:14px; color:#0f172a;">' + escapeHtml(m.fullName) + '</b>' +
                '    <span style="display:block; font-size:11px; font-weight:900; color:#1268A8;">' + escapeHtml(m.memberCode) + '</span>' +
                '    <span style="display:block; font-size:11px; color:gray;">' + escapeHtml(m.region) + (m.district ? ' · ' + escapeHtml(m.district) : '') + '</span>' +
                '    <span style="display:block; font-size:10px; color:gray;">Status: <b style="color:' + statusColor + ';">' + escapeHtml(m.status) + '</b>' +
                '      · Mwisho kusaidiwa: ' + (m.lastAssistedAt ? new Date(m.lastAssistedAt).toLocaleString() : '—') + '</span>' +
                '  </div>' +
                '  <div style="display:flex; gap:6px; flex-wrap:wrap;">' +
                '    <button onclick="window.skhAssistLoginView(\'' + escapeHtml(m.memberCode) + '\')" style="padding:9px 12px; background:#1268A8; color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:11px; cursor:pointer;">SAIDIA</button>' +
                (m.status === 'ACTIVE'
                    ? '<button onclick="window.skhAssistMemberAction(\'' + escapeHtml(m.memberId) + '\',\'SUSPENDED\')" style="padding:9px 12px; background:#fef3c7; color:#92400e; border:none; border-radius:8px; font-weight:bold; font-size:11px; cursor:pointer;">SIMAMISHA</button>'
                    : '<button onclick="window.skhAssistMemberAction(\'' + escapeHtml(m.memberId) + '\',\'ACTIVE\')" style="padding:9px 12px; background:#dcfce7; color:#166534; border:none; border-radius:8px; font-weight:bold; font-size:11px; cursor:pointer;">WASHA</button>') +
                '    <button onclick="window.skhAssistMemberAction(\'' + escapeHtml(m.memberId) + '\',\'ENDED\')" style="padding:9px 12px; background:#fee2e2; color:#b91c1c; border:none; border-radius:8px; font-weight:bold; font-size:11px; cursor:pointer;">MALIZA</button>' +
                '  </div>' +
                '</div>';
            }).join('') : '<p style="color:gray; text-align:center; font-size:12px; padding:14px;">Hakuna wanachama bado.</p>';

            c.innerHTML =
                '<div style="max-width:640px; margin:0 auto;">' +
                '  <h3 style="color:var(--primary-dark); font-weight:900; margin:0 0 14px;">Wanachama Wangu (' + members.length + ')</h3>' +
                '  <div style="display:flex; flex-direction:column; gap:10px;">' + rows + '</div>' +
                '  <button onclick="window.skhAssistHome()" style="width:100%; margin-top:14px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' +
                '</div>';
        } catch (e) {
            c.innerHTML = '<div style="max-width:480px; margin:0 auto; text-align:center; padding:30px;"><p style="color:#b91c1c;">Hitilafu: ' + escapeHtml(e.message) + '</p><button onclick="window.skhAssistHome()" style="padding:12px 20px; background:#e2e8f0; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">RUDI</button></div>';
        }
    };

    window.skhAssistMemberAction = async function (memberId, status) {
        if (!memberId) return;
        if (status === 'ENDED' && !confirm('Unahakika unataka kumaliza uhusiano na mwanachama huyu?')) return;
        try {
            await callServer('agentMemberStatus', { memberId: memberId, status: status });
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
                    return '' +
                    '<div style="padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; font-size:12px;">' +
                    '  <b style="color:#0f172a;">' + escapeHtml(a.action) + '</b>' +
                    '  <span style="color:gray; display:block;">Mwanachama: ' + escapeHtml(a.userId) + (a.referenceId ? ' · Ref: ' + escapeHtml(a.referenceId) : '') + '</span>' +
                    '  <span style="color:#94a3b8; font-size:10px;">' + new Date(a.timestamp).toLocaleString() + '</span>' +
                    '</div>';
                }).join('');
            c.innerHTML =
                '<div style="max-width:640px; margin:0 auto;">' +
                '  <h3 style="color:var(--primary-dark); font-weight:900; margin:0 0 14px;">Kumbukumbu ya Shughuli za Msaada</h3>' +
                '  <p style="font-size:11px; color:#64748b; margin:0 0 12px;">Hakuna PIN wala siri yoyote inayorekodiwa hapa — vitendo tu.</p>' +
                '  <div style="display:flex; flex-direction:column; gap:8px;">' + rows + '</div>' +
                '  <button onclick="window.skhAssistHome()" style="width:100%; margin-top:14px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">RUDI</button>' +
                '</div>';
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
        modal.innerHTML =
            '<div style="background:#fff; border-radius:20px; padding:24px; width:100%; max-width:400px; box-shadow:0 15px 40px rgba(0,0,0,0.4);">' +
            '  <h3 style="margin:0 0 12px; color:var(--primary-dark); font-weight:900;">Badilisha PIN Yangu</h3>' +
            '  <label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">PIN YA SASA *</label>' +
            '  <input type="password" inputmode="numeric" maxlength="6" id="skhAssistOldPin" placeholder="••••••" style="width:100%; padding:14px; border-radius:12px; border:1px solid #cbd5e1; text-align:center; font-size:20px; letter-spacing:6px; font-weight:900; margin-bottom:12px; box-sizing:border-box;">' +
            '  <label style="font-size:11px; font-weight:bold; color:#475569; display:block; margin-bottom:4px;">PIN MPYA *</label>' +
            '  <input type="password" inputmode="numeric" maxlength="6" id="skhAssistNewPin" placeholder="••••••" style="width:100%; padding:14px; border-radius:12px; border:1px solid #cbd5e1; text-align:center; font-size:20px; letter-spacing:6px; font-weight:900; margin-bottom:12px; box-sizing:border-box;">' +
            '  <button onclick="window.skhAssistChangePin()" style="width:100%; padding:14px; background:#1268A8; color:#fff; border:none; border-radius:12px; font-weight:900; cursor:pointer;">HIFADHI PIN MPYA</button>' +
            '  <button onclick="document.getElementById(\'skhAssistPinModal\').style.display=\'none\'" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">GHAIRI</button>' +
            '</div>';
        document.body.appendChild(modal);
    };

    window.skhAssistChangePin = async function () {
        var oldPin = document.getElementById('skhAssistOldPin').value.trim();
        var newPin = document.getElementById('skhAssistNewPin').value.trim();
        if (!/^\d{4,6}$/.test(oldPin)) { alert('Weka PIN ya sasa (tarakimu 4–6).'); return; }
        if (!/^\d{4,6}$/.test(newPin)) { alert('PIN mpya lazima iwe tarakimu 4–6.'); return; }
        try {
            await callServer('memberSetPin', { oldPin: oldPin, newPin: newPin });
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
                // Mwanachama (au mtu) ametoka — safisha kila kitu cha kipindi.
                setSession(null);
                clearActivity();
                clearSensitiveLocalState();
                removeBanner();
                try { document.body.style.paddingTop = ''; } catch (e) {}
            } else if (user && s) {
                if (user.uid === s.memberUid) {
                    // Rejesha banner ya kipindi (mf. refresh).
                    setTimeout(function () { injectBanner(); }, 100);
                } else {
                    // Mtumiaji tofauti — kipindi cha zamani hakihusiki tena.
                    setSession(null);
                    clearActivity();
                    removeBanner();
                }
            }
        });
    }

    // Expose kwa ajili ya majaribio + masterCommands
    window.skhAssistGetSession = getSession;
    window.skhAssistSetSession = setSession;
})();

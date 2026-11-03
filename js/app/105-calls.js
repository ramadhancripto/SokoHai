/* ==== js/app/105-calls.js ==== */
/* =====================================================================
   SokoHai — [CALLS 2026-11]  Simu za mtandao (sauti + video), WebRTC halisi.

   Kile kilichofanyika:
   • RTCPeerConnection halisi (getUserMedia → SDP offer/answer → ICE).
   • Vitufe vya kichwa cha chat (#chatAudioCallBtn / #chatVideoCallBtn)
     vinaita `window.skhChatCall('audio'|'video')`.
   • UI kamili: simu inayoingia (kubali/kataa), inaita, inaunganisha, muda,
     mkrofoni/kamera/spikaa/kata simu, dirisha dogo la kamera yako.

   Usafirishaji wa ishara (signalling) — TABAKA MBILI:
   1) `firestore` — hutumia `calls/{callId}` na `onSnapshot` (vifaa tofauti).
      Inahitaji Firestore rules kwa collection `calls` (mwongozo: README).
   2) `local` — BroadcastChannel (tabo mbili za kivinjari kimoja). Hutumika
      kwa majaribio na wakati Firestore haijaruhusu/kuwa tayari.

   UKWELI WA KIUFAHAMU (hakuna madai ya uongo):
   • Simu inaita tu ikiwa mwenzako YUPO ndani ya app (hakuna push/FCM ring).
   • STUN pekee hupita mitandao rahisi; mitandao ya simu (CGNAT) mara nyingi
     huhitaji TURN relay. Weka `window.SKH_CALL_ICE` kwa TURN yako.
   ===================================================================== */
(function () {
    'use strict';

    var DEFAULT_ICE = [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ];

    var S = {
        mode: 'local',          // 'firestore' | 'local'
        transport: null,
        pc: null,
        localStream: null,
        remoteStream: null,
        call: null,             // { id, from, to, kind, fromName, role }
        timer: null,
        startedAt: 0,
        ringing: null,          // audio context ya mlio
        busy: false,
        appliedRemote: 0,
        pendingRemote: [],
        lobbyUnsub: null,
        lobbyBc: null,
        camFacing: 'user',
        state: 'idle'
    };

    /* ---------------------------------------------------------- 1. NSAIDIZI */
    function me() { try { return (skh.currentUser && skh.currentUser.uid) || ''; } catch (e) { return ''; } }
    function myName() {
        try {
            var u = skh.currentUser || {}, d = skh.currentUserData || {};
            return d.shopName || d.businessName || d.fullName || d.displayName
                || u.displayName || (u.email ? String(u.email).split('@')[0] : 'Mimi');
        } catch (e) { return 'Mimi'; }
    }
    function toast(msg, type, ms) {
        if (typeof window.sokohaiToast === 'function') { window.sokohaiToast(msg, type || 'info', ms || 3200); return; }
        try { console.log('[call]', msg); } catch (e) {}
    }
    function ico(name, size) {
        return (window.skhNavIcon ? window.skhNavIcon(name, size || 22) : '');
    }
    function initials(name) {
        var s = String(name || '').trim();
        if (!s) return '?';
        var p = s.split(/\s+/);
        return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }
    function firestoreReady() {
        try {
            return !!(skh.db && me() && skh.doc && skh.setDoc && skh.updateDoc && skh.onSnapshot && skh.query && skh.where && skh.collection);
        } catch (e) { return false; }
    }

    /* ------------------------------------------------- 2. USAFIRISHAJI */
    // Kila transport inatoa: mode, ring(), update(), watchCall(), watchLobby(),
    // close().

    function makeFirestore(callId) {
        var ref = skh.doc(skh.db, 'calls', callId);
        return {
            mode: 'firestore',
            ref: ref,
            ring: function (payload) { return skh.setDoc(ref, payload); },
            update: function (patch) { return skh.updateDoc(ref, patch); },
            watchCall: function (cb) {
                return skh.onSnapshot(ref, function (snap) {
                    var d = snap && snap.data ? snap.data() : null;
                    if (d) cb(d);
                }, function () {});
            },
            close: function () {}
        };
    }

    function makeLocal(callId) {
        var ch = new BroadcastChannel('skh-call-' + callId);
        var listeners = [];
        ch.onmessage = function (ev) {
            var d = ev && ev.data;
            if (!d || d.callId !== callId) return;
            listeners.forEach(function (fn) { try { fn(d.doc || null); } catch (e) {} });
        };
        // "Hifadhidata" ndogo ya ndani kwa hali ya simu (kwa dirisha hili).
        var store = {};
        return {
            mode: 'local',
            ring: function (payload) {
                store = payload;
                ch.postMessage({ callId: callId, doc: payload });
                return Promise.resolve();
            },
            update: function (patch) {
                Object.keys(patch).forEach(function (k) {
                    var v = patch[k];
                    // arrayUnion-like: tumia orodha
                    if (v && typeof v === 'object' && v.__localAppend) {
                        var arr = (store[k] || []).slice();
                        arr.push(v.value);
                        store[k] = arr;
                    } else {
                        store[k] = v;
                    }
                });
                ch.postMessage({ callId: callId, doc: Object.assign({}, store) });
                return Promise.resolve();
            },
            watchCall: function (cb) {
                listeners.push(cb);
                cb(store);
                return function () {
                    listeners = listeners.filter(function (f) { return f !== cb; });
                };
            },
            close: function () { try { ch.close(); } catch (e) {} }
        };
    }

    function createTransportBase(callId) {
        if (firestoreReady()) {
            try { return makeFirestore(callId); } catch (e) {}
        }
        return makeLocal(callId);
    }

    /* ------------------------------------------------------- 3. UI SHELL */
    function ensureUI() {
        if (document.getElementById('skhCallOverlay')) return;

        var ov = document.createElement('div');
        ov.id = 'skhCallOverlay';
        ov.hidden = true;
        ov.innerHTML =
            '<video id="skhCallRemote" playsinline autoplay></video>' +
            '<div class="skh-call-art">' +
              '<div class="skh-call-art-av" id="skhCallArtAv">?</div>' +
              '<div class="skh-call-art-name" id="skhCallArtName">Mawasiliano</div>' +
              '<div class="skh-call-art-state" id="skhCallArtState">Inaita…</div>' +
            '</div>' +
            '<div class="skh-call-top">' +
              '<div class="skh-call-top-t">' +
                '<b id="skhCallName">Mawasiliano</b>' +
                '<span id="skhCallStatus">Inaita…</span>' +
              '</div>' +
              '<span class="skh-call-badge" id="skhCallBadge">Sauti</span>' +
              '<button type="button" class="skh-call-iconbtn" id="skhCallMin" title="Ficha dirisha (simu inaendelea)" aria-label="Ficha">' +
                ico('eye-off', 18) +
              '</button>' +
            '</div>' +
            '<video id="skhCallLocal" playsinline autoplay muted></video>' +
            '<div class="skh-call-ctrl">' +
              '<div class="skh-call-btn-wrap"><button type="button" class="skh-call-btn" id="skhCallMic" aria-label="Mkrofoni">' + ico('mic', 24) + '</button><span class="skh-call-lbl">Mkrofoni</span></div>' +
              '<div class="skh-call-btn-wrap"><button type="button" class="skh-call-btn" id="skhCallCam" aria-label="Kamera">' + ico('video', 24) + '</button><span class="skh-call-lbl">Kamera</span></div>' +
              '<div class="skh-call-btn-wrap"><button type="button" class="skh-call-btn" id="skhCallFlip" aria-label="Geuza kamera">' + ico('refresh', 24) + '</button><span class="skh-call-lbl">Geuza</span></div>' +
              '<div class="skh-call-btn-wrap"><button type="button" class="skh-call-btn" id="skhCallSpk" aria-label="Spikaa">' + ico('speaker', 24) + '</button><span class="skh-call-lbl">Spikaa</span></div>' +
              '<div class="skh-call-btn-wrap"><button type="button" class="skh-call-btn hangup" id="skhCallEnd" aria-label="Kata simu">' +
                '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1z"/><line x1="3" y1="21" x2="21" y2="3"/></svg>' +
              '</button><span class="skh-call-lbl">Kata</span></div>' +
            '</div>';
        document.body.appendChild(ov);

        var inc = document.createElement('div');
        inc.id = 'skhCallIncoming';
        inc.hidden = true;
        inc.innerHTML =
            '<div class="skh-ci-av" id="skhCiAv">?</div>' +
            '<div class="skh-ci-name" id="skhCiName">Mawasiliano</div>' +
            '<div class="skh-ci-kind" id="skhCiKind">Simu ya sauti inayoingia…</div>' +
            '<div class="skh-ci-actions">' +
              '<button type="button" class="skh-ci-btn decline" id="skhCiDecline" aria-label="Kataa">' +
                '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1z"/><line x1="3" y1="21" x2="21" y2="3"/></svg>' +
                '<span class="skh-ci-lbl">Kataa</span></button>' +
              '<button type="button" class="skh-ci-btn accept" id="skhCiAccept" aria-label="Kubali">' +
                '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1z"/></svg>' +
                '<span class="skh-ci-lbl">Kubali</span></button>' +
            '</div>';
        document.body.appendChild(inc);

        // Vitufe
        on('skhCallEnd', function () { hangup('ended'); });
        on('skhCallMic', function () { toggleMic(); });
        on('skhCallCam', function () { toggleCam(); });
        on('skhCallFlip', function () { flipCam(); });
        on('skhCallSpk', function () { toggleSpeaker(); });
        on('skhCallMin', function () { document.getElementById('skhCallOverlay').hidden = true; });
        on('skhCiAccept', function () { acceptIncoming(); });
        on('skhCiDecline', function () { declineIncoming(); });
    }
    function on(id, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    }

    function ui(el) { return document.getElementById(el); }
    function setAvatar(boxId, name, photo) {
        var el = ui(boxId);
        if (!el) return;
        if (photo) el.innerHTML = '<img src="' + String(photo).replace(/"/g, '&quot;') + '" alt="">';
        else el.textContent = initials(name);
    }
    function setState(state, text) {
        S.state = state;
        var st = ui('skhCallStatus'), ast = ui('skhCallArtState');
        if (st) st.textContent = text;
        if (ast) ast.textContent = text;
    }
    function showOverlay(kind) {
        ensureUI();
        var ov = ui('skhCallOverlay');
        ov.hidden = false;
        ov.classList.toggle('is-video', kind === 'video');
        var badge = ui('skhCallBadge');
        if (badge) badge.textContent = kind === 'video' ? 'Video' : 'Sauti';
        var cam = ui('skhCallCam'), flip = ui('skhCallFlip');
        [cam, flip].forEach(function (b) {
            var wrap = b ? b.closest('.skh-call-btn-wrap') : null;
            if (wrap) wrap.style.display = kind === 'video' ? '' : 'none';
        });
    }
    function hideOverlay() {
        var ov = ui('skhCallOverlay');
        if (ov) { ov.hidden = true; ov.classList.remove('has-remote-video'); }
    }
    function showIncoming(info) {
        ensureUI();
        var inc = ui('skhCallIncoming');
        setAvatar('skhCiAv', info.fromName, info.fromPhoto);
        var n = ui('skhCiName'); if (n) n.textContent = info.fromName || 'Mawasiliano';
        var k = ui('skhCiKind');
        if (k) k.textContent = (info.kind === 'video' ? 'Simu ya video' : 'Simu ya sauti') + ' inayoingia…';
        inc.hidden = false;
        startRinging();
    }
    function hideIncoming() {
        var inc = ui('skhCallIncoming');
        if (inc) inc.hidden = true;
        stopRinging();
    }

    /* -------------------------------------------------------- 4. MLIO */
    function startRinging() {
        stopRinging();
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            var ctx = new AC();
            S.ringing = ctx;
            var beep = function () {
                if (!S.ringing) return;
                var o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = 880;
                g.gain.value = 0.0001;
                o.connect(g); g.connect(ctx.destination);
                var t = ctx.currentTime;
                g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
                o.start(t); o.stop(t + 0.45);
            };
            beep();
            S.ringTimer = setInterval(beep, 1400);
        } catch (e) {}
        try { if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 500]); } catch (e2) {}
    }
    function stopRinging() {
        try { if (S.ringTimer) clearInterval(S.ringTimer); } catch (e) {}
        S.ringTimer = null;
        try { if (S.ringing && S.ringing.close) S.ringing.close(); } catch (e2) {}
        S.ringing = null;
        try { if (navigator.vibrate) navigator.vibrate(0); } catch (e3) {}
    }

    /* --------------------------------------------------- 5. MEDIA + PC */
    function mediaConstraints(kind) {
        var c = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
        if (kind === 'video') {
            c.video = { facingMode: S.camFacing, width: { ideal: 1280 }, height: { ideal: 720 } };
        }
        return c;
    }
    async function getMedia(kind) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Kivinjari hiki hakitumii simu za mtandao.');
        }
        try {
            return await navigator.mediaDevices.getUserMedia(mediaConstraints(kind));
        } catch (e) {
            var msg = (e && e.name === 'NotAllowedError')
                ? 'Ruhusu kipaza sauti' + (kind === 'video' ? ' na kamera' : '') + ' kwenye kivinjari ili kupiga simu.'
                : (e && e.name === 'NotFoundError')
                    ? 'Hakuna kipaza sauti' + (kind === 'video' ? '/kamera' : '') + ' kwenye kifaa hiki.'
                    : 'Imeshindwa kufungua kipaza sauti/kamera.';
            var err = new Error(msg); err.userMessage = msg; throw err;
        }
    }

    function makePC(callId, transport, role) {
        var pc = new RTCPeerConnection({ iceServers: (window.SKH_CALL_ICE || DEFAULT_ICE) });
        S.pc = pc;
        S.appliedRemote = 0;

        (S.localStream ? S.localStream.getTracks() : []).forEach(function (t) { pc.addTrack(t, S.localStream); });

        S.remoteStream = new MediaStream();
        var rv = ui('skhCallRemote');
        if (rv) rv.srcObject = S.remoteStream;

        pc.ontrack = function (ev) {
            (ev.streams && ev.streams[0] ? ev.streams[0].getTracks() : [ev.track]).forEach(function (t) {
                if (!S.remoteStream.getTracks().some(function (x) { return x.id === t.id; })) S.remoteStream.addTrack(t);
            });
            if (rv) {
                rv.srcObject = S.remoteStream;
                var ensurePlay = function () { try { rv.play(); } catch (e) {} };
                ensurePlay();
                rv.onloadedmetadata = ensurePlay;
            }
            watchRemoteVideo();
        };

        pc.onicecandidate = function (ev) {
            if (!ev.candidate) return;
            var key = role === 'caller' ? 'fromCandidates' : 'toCandidates';
            var patch = {}; patch[key] = { __localAppend: true, value: ev.candidate.toJSON() };
            if (transport.mode === 'firestore') {
                patch[key] = skh.arrayUnion(ev.candidate.toJSON());
                transport.update(patch).catch(function () {});
            } else {
                transport.update(patch).catch(function () {});
            }
        };

        pc.onconnectionstatechange = function () {
            var cs = pc.connectionState;
            if (cs === 'connected') {
                setState('connected', 'Inaunganishwa');
                startTimer();
            } else if (cs === 'failed') {
                setState('failed', 'Muunganisho umeshindikana');
                toast('Simu imeshindikana — angalia mtandao (TURN inaweza kuhitajika).', 'error', 4200);
                setTimeout(function () { hangup('failed'); }, 1600);
            } else if (cs === 'disconnected') {
                setState('connecting', 'Muunganisho unadhoofika…');
            }
        };
        return pc;
    }

    function watchRemoteVideo() {
        var rv = ui('skhCallRemote'), ov = ui('skhCallOverlay');
        if (!rv || !ov) return;
        var mark = function () {
            if (rv.videoWidth > 0 && rv.videoHeight > 0) ov.classList.add('has-remote-video');
        };
        rv.onresize = mark;
        mark();
        if (S.videoWatch) clearInterval(S.videoWatch);
        S.videoWatch = setInterval(function () {
            if (!S.pc || S.state === 'idle') { clearInterval(S.videoWatch); return; }
            mark();
        }, 700);
    }

    async function applyRemoteCandidates(list) {
        if (!S.pc || !Array.isArray(list)) return;
        for (var i = S.appliedRemote; i < list.length; i++) {
            try { await S.pc.addIceCandidate(new RTCIceCandidate(list[i])); } catch (e) {}
            S.appliedRemote = i + 1;
        }
    }

    function startTimer() {
        if (S.timer) return;
        S.startedAt = Date.now();
        var tick = function () {
            var s = Math.floor((Date.now() - S.startedAt) / 1000);
            var txt = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
            setState('connected', txt);
        };
        tick();
        S.timer = setInterval(tick, 1000);
    }
    function stopTimer() {
        if (S.timer) clearInterval(S.timer);
        S.timer = null;
        S.startedAt = 0;
    }

    /* ---------------------------------------------------- 6. KUPIGA SIMU */
    async function startCall(kind) {
        if (S.call && S.state !== 'idle') { toast('Kuna simu inaendelea.', 'info'); return; }
        var core = (window.skh && skh.chatCore) || {};
        var partnerUid = core.partnerUid || '';
        if (!partnerUid) { toast('Fungua mazungumzo na mtu kwanza, kisha piga simu.', 'error', 3400); return; }
        if (partnerUid === me()) { toast('Huwezi kupiga simu kwako mwenyewe.', 'error'); return; }

        var partnerName = core.partnerName || 'Mawasiliano';
        var callId = 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var call = { id: callId, from: me(), to: partnerUid, fromName: myName(), toName: partnerName, kind: kind, role: 'caller' };
        S.call = call;
        S.busy = true;

        showOverlay(kind);
        setAvatar('skhCallArtAv', partnerName, null);
        var nm = ui('skhCallName'); if (nm) nm.textContent = partnerName;
        var anm = ui('skhCallArtName'); if (anm) anm.textContent = partnerName;
        setState('outgoing', 'Inaita…');

        try {
            S.localStream = await getMedia(kind);
        } catch (e) {
            toast(e.userMessage || e.message, 'error', 4200);
            cleanup();
            return;
        }
        var lv = ui('skhCallLocal');
        if (lv) lv.srcObject = S.localStream;

        S.transport = createTransport(callId);
        var pc = makePC(callId, S.transport, 'caller');

        var offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: kind === 'video' });
        await pc.setLocalDescription(offer);

        var payload = {
            id: callId, from: call.from, to: call.to,
            fromName: call.fromName, toName: call.toName,
            kind: kind, state: 'ringing', role: 'caller',
            offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
            fromCandidates: [], toCandidates: [],
            createdAt: (firestoreReady() && skh.serverTimestamp) ? skh.serverTimestamp() : new Date().toISOString()
        };
        try {
            await S.transport.ring(payload);
        } catch (e) {
            var denied = String((e && (e.code || e.message)) || '').toLowerCase().indexOf('permission') !== -1;
            toast(denied
                ? 'Simu haijawashwa kwenye server bado (Firestore rules za `calls` zinahitajika).'
                : 'Imeshindwa kuunganisha simu. Angalia mtandao.', 'error', 5200);
            cleanup();
            return;
        }
        if (S.transport.mode === 'local') toast('Simu inaita (hali ya majaribio ya kivinjari kimoja).', 'info', 3600);

        S.unwatch = S.transport.watchCall(async function (d) {
            if (!d || !S.pc) return;
            if (d.state === 'declined') { setState('declined', 'Amekataa simu'); setTimeout(function () { cleanup(); }, 1200); return; }
            if (d.state === 'ended' || d.state === 'failed') { setState('ended', 'Simu imekatika'); setTimeout(function () { cleanup(); }, 1000); return; }
            if (d.answer && S.pc.signalingState === 'have-local-offer' && !S.gotAnswer) {
                S.gotAnswer = true;
                try {
                    await S.pc.setRemoteDescription(new RTCSessionDescription(d.answer));
                    setState('connecting', 'Inaunganisha…');
                } catch (e) {}
            }
            applyRemoteCandidates(d.toCandidates || []);
        });
    }

    /* ---------------------------------------------- 7. KUPOKEA SIMU */
    function incomingOffer(info) {
        if (S.busy || (S.call && S.state !== 'idle')) {
            // Tayari kwenye simu — kataa kwa upole.
            try {
                var t = createTransport(info.id);
                t.update({ state: 'declined' });
            } catch (e) {}
            return;
        }
        S.call = { id: info.id, from: info.from, to: me(), fromName: info.fromName, toName: myName(), kind: info.kind, role: 'callee' };
        S.pendingOffer = info.offer;
        S.incomingTransport = createTransport(info.id);
        showIncoming(info);
        // Funga simu yenyewe ikiisha muda (45s)
        S.incomingTimeout = setTimeout(function () {
            if (S.state === 'idle' || (S.call && S.call.role === 'callee' && !S.accepted)) declineIncoming();
        }, 45000);
    }

    async function acceptIncoming() {
        if (!S.call || !S.pendingOffer) return;
        hideIncoming();
        S.accepted = true;
        if (S.incomingTimeout) clearTimeout(S.incomingTimeout);
        var kind = S.call.kind;
        showOverlay(kind);
        setAvatar('skhCallArtAv', S.call.fromName, null);
        var nm = ui('skhCallName'); if (nm) nm.textContent = S.call.fromName;
        var anm2 = ui('skhCallArtName'); if (anm2) anm2.textContent = S.call.fromName;
        setState('connecting', 'Inaunganisha…');
        S.busy = true;

        try {
            S.localStream = await getMedia(kind);
        } catch (e) {
            toast(e.userMessage || e.message, 'error', 4200);
            declineIncoming(e.userMessage || '');
            return;
        }
        var lv = ui('skhCallLocal');
        if (lv) lv.srcObject = S.localStream;

        S.transport = S.incomingTransport || createTransport(S.call.id);
        var pc = makePC(S.call.id, S.transport, 'callee');
        await pc.setRemoteDescription(new RTCSessionDescription(S.pendingOffer));
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        try {
            await S.transport.update({
                state: 'accepted',
                answer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
            });
        } catch (e) {}

        S.unwatch = S.transport.watchCall(function (d) {
            if (!d) return;
            if (d.state === 'ended' || d.state === 'failed') { setState('ended', 'Simu imeisha'); setTimeout(function () { cleanup(); }, 900); return; }
            applyRemoteCandidates(d.fromCandidates || []);
        });
    }

    function declineIncoming(msg) {
        hideIncoming();
        if (S.incomingTimeout) clearTimeout(S.incomingTimeout);
        try {
            if (S.incomingTransport) S.incomingTransport.update({ state: 'declined', declineReason: msg || 'declined' });
        } catch (e) {}
        cleanup();
    }

    /* ------------------------------------------------- 8. VITUFE VYA NDANI */
    function toggleMic() {
        var tr = S.localStream ? S.localStream.getAudioTracks()[0] : null;
        if (!tr) return;
        tr.enabled = !tr.enabled;
        var b = ui('skhCallMic');
        if (b) b.classList.toggle('is-off', !tr.enabled);
        toast(tr.enabled ? 'Mkrofoni umewaka' : 'Mkrofoni umezimwa', 'info', 1600);
    }
    function toggleCam() {
        var tr = S.localStream ? S.localStream.getVideoTracks()[0] : null;
        if (!tr) return;
        tr.enabled = !tr.enabled;
        var b = ui('skhCallCam'), ov = ui('skhCallOverlay');
        if (b) b.classList.toggle('is-off', !tr.enabled);
        if (ov) ov.classList.toggle('is-cam-off', !tr.enabled);
    }
    async function flipCam() {
        if (!S.pc || S.call.kind !== 'video') return;
        S.camFacing = S.camFacing === 'user' ? 'environment' : 'user';
        try {
            var ns = await getMedia('video');
            var newTrack = ns.getVideoTracks()[0];
            var sender = S.pc.getSenders().find(function (s) { return s.track && s.track.kind === 'video'; });
            if (sender && newTrack) await sender.replaceTrack(newTrack);
            var old = S.localStream.getVideoTracks()[0];
            if (old) { old.stop(); S.localStream.removeTrack(old); }
            S.localStream.addTrack(newTrack);
            var lv = ui('skhCallLocal');
            if (lv) lv.srcObject = S.localStream;
        } catch (e) { toast('Imeshindwa kugeuza kamera.', 'error', 2600); }
    }
    async function toggleSpeaker() {
        var rv = ui('skhCallRemote');
        var b = ui('skhCallSpk');
        if (!rv) return;
        S.speakerOn = !S.speakerOn;
        if (b) b.classList.toggle('is-off', !S.speakerOn);
        rv.volume = S.speakerOn ? 1 : 0.55;
        // setSinkId inapatikana kwenye Chrome/Android — jaribu kwa upole.
        try {
            if (S.speakerOn && rv.setSinkId && navigator.mediaDevices.enumerateDevices) {
                var devs = await navigator.mediaDevices.enumerateDevices();
                var spk = devs.filter(function (d) { return d.kind === 'audiooutput'; });
                if (spk.length > 1) await rv.setSinkId(spk[0].deviceId);
            }
        } catch (e) {}
        toast(S.speakerOn ? 'Spikaa imewashwa' : 'Sauti imepunguzwa', 'info', 1500);
    }

    /* ------------------------------------------------------ 9. KUFUNGA */
    function hangup(reason) {
        try {
            if (S.transport) S.transport.update({ state: reason || 'ended' }).catch(function () {});
        } catch (e) {}
        cleanup();
    }

    function cleanup() {
        stopTimer();
        stopRinging();
        hideIncoming();
        setTimeout(hideOverlay, 200);
        try { if (S.unwatch) S.unwatch(); } catch (e) {}
        try { if (S.pc) { S.pc.getSenders().forEach(function (s) { try { s.track && s.track.stop(); } catch (e) {} }); S.pc.close(); } } catch (e2) {}
        try { if (S.localStream) S.localStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e3) {}
        try { if (S.transport) S.transport.close(); } catch (e4) {}
        try { if (S.incomingTransport) S.incomingTransport.close(); } catch (e5) {}
        try { if (S.videoWatch) clearInterval(S.videoWatch); } catch (e6) {}
        var lv = ui('skhCallLocal'), rv = ui('skhCallRemote');
        if (lv) lv.srcObject = null;
        if (rv) rv.srcObject = null;
        S.pc = null; S.localStream = null; S.remoteStream = null;
        S.call = null; S.transport = null; S.incomingTransport = null;
        S.pendingOffer = null; S.unwatch = null; S.appliedRemote = 0;
        S.busy = false; S.state = 'idle'; S.accepted = false; S.gotAnswer = false;
    }

    /* --------------------------------------------- 10. KUSIKILIZA SIMU */
    function watchLobby() {
        if (S.lobbyUnsub) { try { S.lobbyUnsub(); } catch (e) {} S.lobbyUnsub = null; }
        if (S.lobbyBc) { try { S.lobbyBc.close(); } catch (e) {} S.lobbyBc = null; }

        if (firestoreReady()) {
            try {
                var q = skh.query(skh.collection(skh.db, 'calls'), skh.where('to', '==', me()));
                S.mode = 'firestore';
                var warned = false;
                S.lobbyUnsub = skh.onSnapshot(q, function (snap) {
                    snap.docChanges().forEach(function (ch) {
                        if (ch.type !== 'added') return;
                        var d = ch.doc.data() || {};
                        if (d.state !== 'ringing' || !d.offer) return;
                        if (String(d.from) === me()) return;
                        incomingOffer(d);
                    });
                }, function (err) {
                    var denied = String((err && (err.code || err.message)) || '').toLowerCase().indexOf('permission') !== -1;
                    if (!warned) {
                        warned = true;
                        toast(denied
                            ? 'Simu za wateja zinaita tu ndani ya kifaa hiki — Firestore rules za `calls` zinahitajika kuwashwa.'
                            : 'Usikilizaji wa simu umeshindikana; natumia hali ya kifaa.', 'info', 5200);
                    }
                    try { if (S.lobbyUnsub) S.lobbyUnsub(); } catch (e2) {}
                    S.lobbyUnsub = null;
                    S.mode = 'local';
                    try {
                        S.lobbyBc = new BroadcastChannel('skh-calls-lobby');
                        S.lobbyBc.onmessage = function (ev) {
                            var d = ev && ev.data;
                            if (!d || d.type !== 'ring') return;
                            if (String(d.to) !== me()) return;
                            incomingOffer(d.doc);
                        };
                    } catch (e3) {}
                });
                return;
            } catch (e) {}
        }

        // Fallback: kivinjari kimoja (majaribio)
        try {
            S.mode = 'local';
            S.lobbyBc = new BroadcastChannel('skh-calls-lobby');
            S.lobbyBc.onmessage = function (ev) {
                var d = ev && ev.data;
                if (!d || d.type !== 'ring') return;
                if (String(d.to) !== me()) return;
                incomingOffer(d.doc);
            };
        } catch (e) {}
    }

    // Caller hutangaza kwenye lobby (kwa hali ya local tu).
    function createTransport(callId) {
        var t = createTransportBase(callId);
        if (t.mode === 'local') {
            var ring0 = t.ring;
            t.ring = function (payload) {
                var p = ring0(payload);
                try {
                    if (S.lobbyBc) S.lobbyBc.postMessage({ type: 'ring', to: payload.to, doc: payload });
                    else {
                        var bc = new BroadcastChannel('skh-calls-lobby');
                        bc.postMessage({ type: 'ring', to: payload.to, doc: payload });
                        setTimeout(function () { try { bc.close(); } catch (e) {} }, 400);
                    }
                } catch (e) {}
                return p;
            };
        }
        return t;
    }

    /* --------------------------------------------------------- 11. API */
    window.skhChatCall = function (kind) {
        ensureUI();
        watchLobbyIfNeeded();
        return startCall(kind === 'video' ? 'video' : 'audio');
    };
    window.skhCall = {
        start: window.skhChatCall,
        hangup: hangup,
        accept: acceptIncoming,
        decline: declineIncoming,
        state: function () { return { state: S.state, mode: S.mode, call: S.call }; }
    };
    window.skhCallWatchLobby = watchLobby;

    var lobbyStarted = false;
    function watchLobbyIfNeeded() {
        if (lobbyStarted) return;
        lobbyStarted = true;
        watchLobby();
    }

    /* --------------------------------------------------------- 12. INIT */
    function init() {
        ensureUI();
        watchLobbyIfNeeded();
        // Ikiwa auth inakuja baadaye, jaribu tena kupata Firestore.
        setInterval(function () {
            if (!lobbyStarted) return;
            if (S.mode === 'local' && firestoreReady()) { watchLobby(); }
        }, 5000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

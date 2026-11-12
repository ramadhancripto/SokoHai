/* ==== js/app/125-live-video.js ==== */
/* [FULL-AUCTION 2026-11] Live video provider abstraction + mesh WebRTC provider.
 *
 *  window.skhLiveVideo  facade object: { provider, useProvider, mount, unmount,
 *                       open, close, stopSession, retry, setCam, setMic,
 *                       switchCamera, state, stats }
 *  window.skhLiveCamToggle(on)   host camera on/off (preview #lv7CamPrev)
 *  window.skhLiveRtcRetry()      retry current connection
 *  window.skhLiveMicCam(opts?)   get/set {cam,mic}
 *  window.skhLiveMinimize() / window.skhLiveMiniRestore()  mini player (#lvxMini)
 *
 * Signalling store: live_sessions/{sid}/rtc/{viewerUid} with fields
 *   offer {type,sdp} (host -> viewer), answer {type,sdp} (viewer -> host),
 *   hostCandidates[] , viewerCandidates[]  (arrays of RTCIceCandidateInit-like maps).
 * Field ownership (mirrored by firestore.rules): host writes offer/hostCandidates,
 * viewer writes answer/viewerCandidates. Readers sanitize: unknown fields ignored.
 *
 * Provider abstraction (Phase: scalability): 120-live-commerce-ui.js talks ONLY to
 * window.skhLiveVideo. MeshRtcProvider is the default; an SFU provider implementing
 * the same interface (open/close/retry/setCam/setMic/switchCamera/state/stats) can be
 * installed via skhLiveVideo.useProvider() with zero changes to the auction UI.
 * See SfuRtcProvider below (stub: needs a server token endpoint + provider account).
 */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const me = () => (skh.currentUser && skh.currentUser.uid) || null;
/* [STAGE3 2026-11-12] ICE configuration is data, not code: a deployment injects TURN without
 * touching this file — `window.SKH_ICE = [{urls:'turn:…', username:…, credential:…}]` (set it in
 * the page head / host env) or a `<meta name="skh-ice" content='[{"urls":"turn:…"}]'>` tag.
 * Order of precedence: window.SKH_ICE → meta[skh-ice] → google STUN (real host only) → none.
 * Localhost/sandbox stays STUN-less on purpose (offline-safe, no console noise).
 * TURN itself is NOT configured or verified here: it needs an owner-provided server + credentials
 * (see docs/live/TURN-SFU-SETUP.md). Until then, connectivity works on the same network only. */
function iceConfig() {
    const clean = (list) => {
        if (!Array.isArray(list)) return null;
        const out = [];
        for (const x of list) {
            if (!x || !x.urls) continue;
            const row = { urls: String(x.urls) };
            if (x.username) row.username = String(x.username);
            if (x.credential) row.credential = String(x.credential);
            out.push(row);
        }
        return out.length ? out : null;
    };
    try {
        const fromWin = clean(typeof window !== 'undefined' ? window.SKH_ICE : null);
        if (fromWin) return fromWin;
        const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="skh-ice"]') : null;
        if (meta && meta.content) { const parsed = clean(JSON.parse(meta.content)); if (parsed) return parsed; }
    } catch (e) { try { console.warn('[SokoHai Live] ICE config imeshindikana kusoma', (e && e.message) || e); } catch (_) {} }
    const localHost = ['127.0.0.1', 'localhost', ''].indexOf(location.hostname) !== -1;
    return localHost ? [] : [{ urls: 'stun:stun.l.google.com:19302' }];
}
const ICE_SERVERS = iceConfig();
window.skhLiveIceConfig = iceConfig;

/* ---------- signalling field sanitize (defence in depth; rules enforce ownership) ---------- */
function cleanSdp(v) {
    if (!v || typeof v !== 'object') return null;
    if ((v.type !== 'offer' && v.type !== 'answer') || typeof v.sdp !== 'string' || !v.sdp || v.sdp.length > 200000) return null;
    return { type: v.type, sdp: v.sdp };
}
function cleanCands(v) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const c of v.slice(-100)) {
        if (c && typeof c === 'object' && typeof c.candidate === 'string' && c.candidate.length < 4000)
            out.push({ candidate: c.candidate, sdpMid: c.sdpMid == null ? null : String(c.sdpMid), sdpMLineIndex: c.sdpMLineIndex == null ? null : Number(c.sdpMLineIndex) });
    }
    return out;
}

/* ================= MeshRtcProvider (default; keyless, works on emulator/local) ================= */
class MeshRtcProvider {
    constructor() {
        this.sid = null; this.role = null; this.stream = null;
        this.pcs = new Map();        // viewerUid -> { pc, unsubDoc, appliedHost, appliedViewer, answeredSdp, answering, pendingIce[], waitT }
        this.unsubList = null; this.pendingOffer = new Set(); this.status = 'idle';
        this.statusCb = null; this.camOn = true; this.micOn = true; this.deviceId = null;
    }
    onStatus(cb) { this.statusCb = cb; }
    setStatus(s, detail) { this.status = s; try { this.statusCb && this.statusCb(s, detail); } catch (e) {} }
    rtcDoc(vid) { return skh.doc(skh.db, 'live_sessions', this.sid, 'rtc', vid); }
    rtcCol() { return skh.collection(skh.db, 'live_sessions', this.sid, 'rtc'); }

    async open(sid, role) {
        await this.close(false);
        this.sid = sid; this.role = role;
        if (role === 'host') {
            this.setStatus('idle');
            this.unsubList = skh.onSnapshot(this.rtcCol(), (snap) => {
                snap.docChanges().forEach(ch => {
                    if (ch.type === 'added') this.serveViewer(ch.doc.id, ch.doc.data() || {});
                    else if (ch.type === 'removed') this.dropViewer(ch.doc.id);
                });
                // docs that existed before we subscribed
                snap.docs.forEach(d => { if (!this.pcs.has(d.id)) this.serveViewer(d.id, d.data() || {}); });
            }, () => this.setStatus('error'));
        } else {
            await this.subscribe();
        }
    }
    /* ---------- host side ---------- */
    async ensureStream() {
        if (this.stream) { this.stream.getTracks().forEach(t => { t.enabled = t.kind === 'video' ? this.camOn : this.micOn; }); return this.stream; }
        const gum = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null;
        if (!gum) { this.setStatus('no-device'); throw new Error('no-device'); }
        try {
            this.stream = await gum({ video: this.deviceId ? { deviceId: { exact: this.deviceId } } : { width: { ideal: 640 }, height: { ideal: 360 } }, audio: true });
        } catch (e) {
            this.setStatus(e && e.name === 'NotAllowedError' ? 'denied' : 'no-device');
            throw e;
        }
        const prev = document.getElementById('lv7CamPrev');
        if (prev) { try { prev.srcObject = this.stream; prev.play().catch(() => {}); } catch (e) {} }
        this.stream.getTracks().forEach(t => { t.enabled = t.kind === 'video' ? this.camOn : this.micOn; });
        return this.stream;
    }
    /* Viewer left (rtc doc deleted) or rejoined: tear down the stale PC so a
     * rejoin (same uid, fresh doc) gets a brand-new offer. */
    dropViewer(vid) {
        const st = this.pcs.get(vid);
        if (!st) return;
        try { st.unsubDoc && st.unsubDoc(); } catch (e) {}
        try { st.pc.close(); } catch (e) {}
        this.pcs.delete(vid);
        this.pendingOffer.delete(vid);
    }
    async serveViewer(vid, data) {
        if (!this.sid || this.role !== 'host') return;
        const existing = this.pcs.get(vid);
        if (existing) {
            // stale PC (viewer rejoined after a drop): replace it
            if (existing.pc.connectionState === 'closed' || existing.pc.connectionState === 'failed') this.dropViewer(vid);
            else return;
        }
        if (!this.stream) { this.pendingOffer.add(vid); this.setStatus('waiting-cam'); return; }
        await this.offerTo(vid);
    }
    async offerTo(vid) {
        if (this.pcs.has(vid)) return;
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const st = { pc, unsubDoc: null, appliedViewer: 0, answeredSdp: null, answering: false, pendingIce: [], offerSdp: null };
        this.pcs.set(vid, st);
        try { this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream)); } catch (e) {}
        pc.onicecandidate = (e) => {
            if (e.candidate) skh.updateDoc(this.rtcDoc(vid), { hostCandidates: skh.arrayUnion({ candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }) }).catch(() => {});
        };
        pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.setStatus('failed'); };
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            st.offerSdp = offer.sdp;
            await skh.updateDoc(this.rtcDoc(vid), { offer: { type: offer.type, sdp: offer.sdp }, hostCandidates: [] });
        } catch (e) { this.setStatus('error'); }
        st.unsubDoc = skh.onSnapshot(this.rtcDoc(vid), (s) => {
            if (!s.exists()) return;
            const d = s.data() || {};
            const ans = cleanSdp(d.answer);
            if (ans && ans.sdp !== st.answeredSdp && !st.answering) {
                st.answering = true;
                pc.setRemoteDescription(new RTCSessionDescription(ans)).then(() => {
                    st.answeredSdp = ans.sdp; st.answering = false; this.flushPending(st);
                    this.setStatus('live');
                }).catch(() => { st.answering = false; });
            }
            const cands = cleanCands(d.viewerCandidates);
            for (let i = st.appliedViewer; i < cands.length; i++) {
                const c = cands[i]; st.appliedViewer = i + 1;
                if (pc.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                else st.pendingIce.push(c);
            }
        }, () => {});
    }
    flushPending(st) {
        const q = st.pendingIce.splice(0);
        q.forEach(c => { try { st.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}); } catch (e) {} });
    }
    /* ---------- viewer side ---------- */
    async subscribe() {
        const uid = me(); if (!uid) { this.setStatus('error'); return; }
        this.setStatus('connecting');
        const ref = this.rtcDoc(uid);
        try { await skh.deleteDoc(ref); } catch (e) {}
        try { await skh.setDoc(ref, { viewerCandidates: [] }); }
        catch (e) { this.setStatus('error'); return; }
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const st = { pc, unsubDoc: null, appliedHost: 0, pendingIce: [], answered: false };
        this.pcs.set(uid, st);
        pc.ontrack = (e) => {
            const v = document.getElementById('lv7Remote');
            if (v && e.streams && e.streams[0]) { try { v.srcObject = e.streams[0]; v.play().catch(() => {}); } catch (err) {} }
            this.setStatus('live');
        };
        pc.onicecandidate = (e) => {
            if (e.candidate) skh.updateDoc(ref, { viewerCandidates: skh.arrayUnion({ candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }) }).catch(() => {});
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed') this.setStatus('failed');
            else if (pc.connectionState === 'connected') this.setStatus('live');
        };
        st.unsubDoc = skh.onSnapshot(ref, async (s) => {
            if (!s.exists()) return;
            const d = s.data() || {};
            const offer = cleanSdp(d.offer);
            if (offer && !st.answered) {
                st.answered = true;
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(offer));
                    const cands = cleanCands(d.hostCandidates);
                    for (let i = st.appliedHost; i < cands.length; i++) { st.appliedHost = i + 1; await pc.addIceCandidate(new RTCIceCandidate(cands[i])).catch(() => {}); }
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    await skh.updateDoc(ref, { answer: { type: answer.type, sdp: answer.sdp } });
                    st.pendingIce.splice(0).forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
                } catch (e) { st.answered = false; this.setStatus('error'); return; }
            }
            if (st.answered) {
                const cands = cleanCands(d.hostCandidates);
                for (let i = st.appliedHost; i < cands.length; i++) {
                    const c = cands[i]; st.appliedHost = i + 1;
                    if (pc.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                    else st.pendingIce.push(c);
                }
            }
        }, () => this.setStatus('error'));
        st.waitT = setTimeout(() => { if (this.pcs.get(uid) === st && !st.answered) this.setStatus('waiting-host'); }, 8000);
    }
    /* ---------- shared controls ---------- */
    async setCam(on) {
        this.camOn = !!on;
        if (this.role === 'host' && on) {
            await this.ensureStream();
            const pend = [...this.pendingOffer]; this.pendingOffer.clear();
            for (const vid of pend) await this.offerTo(vid);
            this.setStatus(this.pcs.size ? 'live' : 'idle');
        }
        if (this.stream) this.stream.getVideoTracks().forEach(t => { t.enabled = this.camOn; });
        return this.camOn;
    }
    async setMic(on) {
        this.micOn = !!on;
        if (this.stream) this.stream.getAudioTracks().forEach(t => { t.enabled = this.micOn; });
        return this.micOn;
    }
    async switchCamera() {
        if (this.role !== 'host') return null;
        try {
            const devs = await navigator.mediaDevices.enumerateDevices();
            const cams = devs.filter(d => d.kind === 'videoinput');
            if (cams.length < 2) return this.deviceId;
            const i = Math.max(0, cams.findIndex(c => c.deviceId === this.deviceId));
            this.deviceId = cams[(i + 1) % cams.length].deviceId;
            const old = this.stream; this.stream = null;
            if (old) old.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
            await this.ensureStream();
            // swap sender tracks on live PCs without renegotiation
            const vt = this.stream.getVideoTracks()[0];
            this.pcs.forEach(({ pc }) => { try { const s = pc.getSenders().find(x => x.track && x.track.kind === 'video'); if (s && vt) s.replaceTrack(vt); } catch (e) {} });
            return this.deviceId;
        } catch (e) { return null; }
    }
    async retry() {
        if (!this.sid) return;
        const role = this.role;
        if (role === 'viewer') {
            const uid = me();
            const st = uid && this.pcs.get(uid);
            if (st) { try { st.unsubDoc && st.unsubDoc(); } catch (e) {} try { st.pc.close(); } catch (e) {} try { clearTimeout(st.waitT); } catch (e) {} this.pcs.delete(uid); }
            await this.subscribe();
        } else if (role === 'host') {
            // re-offer every viewer (ICE restart path: new offer on existing PC)
            for (const [vid, st] of this.pcs) {
                try {
                    const offer = await st.pc.createOffer({ iceRestart: true });
                    await st.pc.setLocalDescription(offer);
                    st.offerSdp = offer.sdp;
                    await skh.updateDoc(this.rtcDoc(vid), { offer: { type: offer.type, sdp: offer.sdp } });
                    this.setStatus('live');
                } catch (e) {}
            }
            if (!this.stream) { try { await this.setCam(true); } catch (e) {} }
        }
    }
    async close(deleteOwnDoc) {
        this.pcs.forEach((st) => {
            try { st.unsubDoc && st.unsubDoc(); } catch (e) {}
            try { clearTimeout(st.waitT); } catch (e) {}
            try { st.pc.close(); } catch (e) {}
        });
        this.pcs.clear(); this.pendingOffer.clear();
        try { this.unsubList && this.unsubList(); } catch (e) {}
        this.unsubList = null;
        if (this.stream) { this.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); this.stream = null; }
        if (deleteOwnDoc !== false && this.sid && this.role === 'viewer' && me()) {
            try { await skh.deleteDoc(this.rtcDoc(me())); } catch (e) {}
        }
        const rv = document.getElementById('lv7Remote');
        if (rv) { try { rv.srcObject = null; } catch (e) {} }
        const pv = document.getElementById('lv7CamPrev');
        if (pv) { try { pv.srcObject = null; } catch (e) {} }
        this.sid = null; this.role = null;
        this.setStatus('idle');
    }
    /* Host ends the live: full teardown + delete every signalling doc (E12). */
    async stopSession() {
        const sid = this.sid;
        await this.close(false);
        if (sid) {
            try {
                const snap = await skh.getDocs(skh.collection(skh.db, 'live_sessions', sid, 'rtc'));
                await Promise.all(snap.docs.map(d => skh.deleteDoc(d.ref).catch(() => {})));
            } catch (e) {}
        }
    }
    state() {
        return { sid: this.sid, role: this.role, status: this.status, pcs: this.pcs.size,
            listening: !!this.unsubList, cam: this.camOn, mic: this.micOn, hasStream: !!this.stream };
    }
    async stats() {
        const pcs = [];
        for (const [id, st] of this.pcs) {
            const row = { id: String(id).slice(0, 8), state: '?', outKbps: 0, inKbps: 0, rttMs: null, frames: 0 };
            try {
                row.state = st.pc.connectionState;
                const rs = await st.pc.getStats();
                rs.forEach(r => {
                    if (r.type === 'outbound-rtp' && !r.isRemote) {
                        const kb = ((Number(r.bytesSent) || 0) * 8) / 1000;
                        if (kb > row.outKbps) row.outKbps = Math.round(kb);
                        if (r.framesSent != null) row.frames = r.framesSent;
                    }
                    if (r.type === 'inbound-rtp' && !r.isRemote) {
                        const kb = ((Number(r.bytesReceived) || 0) * 8) / 1000;
                        if (kb > row.inKbps) row.inKbps = Math.round(kb);
                        if (r.framesDecoded != null) row.frames = r.framesDecoded;
                    }
                    if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) row.rttMs = Math.round(r.currentRoundTripTime * 1000);
                });
            } catch (e) {}
            pcs.push(row);
        }
        let heapMB = null;
        try { if (performance && performance.memory) heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (e) {}
        return { t: Date.now(), pcs, heapMB };
    }
}

/* ============ SfuRtcProvider (STUB — needs provider account + token endpoint) ============
 * Same interface as MeshRtcProvider. To migrate: implement open() to fetch a viewer/
 * publisher token from a server callable (e.g. liveSfuToken), connect to the SFU,
 * publish/subscribe there; host upload becomes ONE stream. No 120 changes needed:
 *   skhLiveVideo.useProvider(new SfuRtcProvider({ tokenFn: 'liveSfuToken' }));
 * Server needs (not built — provider-gated): token minting callable + webhook for
 * room events. Cost/latency comparison lives in the scalability report. */
class SfuRtcProvider {
    constructor(opts) { this.opts = opts || {}; this.status = 'idle'; this.statusCb = null; }
    onStatus(cb) { this.statusCb = cb; }
    setStatus(s) { this.status = s; try { this.statusCb && this.statusCb(s); } catch (e) {} }
    async open() { this.setStatus('error'); throw new Error('sfu_haijaunganishwa'); }
    async close() { this.setStatus('idle'); }
    async stopSession() {}
    async retry() {}
    async setCam() { return false; }
    async setMic() { return false; }
    async switchCamera() { return null; }
    state() { return { sid: null, role: null, status: this.status, pcs: 0, sfu: false }; }
    async stats() { return { t: Date.now(), pcs: [], heapMB: null }; }
}

/* ================= facade: stage DOM, overlay, mini player ================= */
const STATUS_TXT = {
    idle: '', connecting: 'Inaunganisha video…', 'waiting-host': 'Inasubiri mwenyeji awashe kamera…',
    'waiting-cam': '', live: '', failed: 'Muunganisho wa video umeshindwa — gusa kujaribu tena.',
    error: 'Hitilafu ya video — gusa kujaribu tena.', denied: 'Ruhusa ya kamera imekataliwa. Fungua ruhusa kwenye kivinjari kisha ujaribu tena.',
    'no-device': 'Kamera haipatikani kwenye kifaa hiki.', offline: 'Mtandao umepotea — inajaribu kuunganisha tena…', ended: 'Live imekwisha.'
};
const V = {
    provider: new MeshRtcProvider(),
    useProvider(p) { try { this.provider.close(false); } catch (e) {} this.provider = p; p.onStatus((s) => paintOverlay(s)); },
    mount(stage, sid, role) {
        if (!stage) return;
        let box = stage.querySelector('.lv7-webrtc');
        if (!box) {
            box = document.createElement('div');
            box.className = 'lv7-webrtc';
            box.innerHTML = (role === 'host'
                ? '<video id="lv7CamPrev" class="lv7-video" muted playsinline autoplay></video>'
                : '<video id="lv7Remote" class="lv7-video" playsinline autoplay></video>')
                + '<div class="lv7-rtcstate" id="lv7RtcState" hidden></div>';
            stage.innerHTML = '';
            stage.appendChild(box);
            const ov = box.querySelector('#lv7RtcState');
            ov.onclick = () => { try { window.skhLiveRtcRetry(); } catch (e) {} };
        }
        this.provider.onStatus((s) => paintOverlay(s));
        if (this.provider.sid !== sid || this.provider.role !== role) this.provider.open(sid, role).catch(() => {});
        else paintOverlay(this.provider.status);
    },
    unmount(stop) {
        if (stop !== false) { try { this.provider.close(true); } catch (e) {} }
    },
    open(sid, role) { return this.provider.open(sid, role); },
    close() { return this.provider.close(true); },
    stopSession() { return this.provider.stopSession(); },
    retry() { return this.provider.retry(); },
    setCam(on) { return this.provider.setCam(on); },
    setMic(on) { return this.provider.setMic(on); },
    /* [STAGE2 2026-11-12] The host paused the room. Design intent: the SAME session resumes,
     * so we must not tear down the peer connection or the camera stream. We only tell the UI
     * to look frozen (class + notice); every viewer keeps the RTC link and drops the
     * "live" appearance. `setPaused(false)` puts the normal status notice back. */
    setPaused(on) {
        const stage = document.querySelector('#lvxRoom .lv7-stage');
        if (stage) stage.classList.toggle('is-paused', !!on);
        const note = document.getElementById('lv7Frozen');
        if (note) note.hidden = !on;
        const ov = document.getElementById('lv7RtcState');
        if (ov) {
            if (on) { ov.hidden = false; ov.textContent = 'Live imesitishwa'; }
            else { try { paintOverlay((this.provider.state() || {}).status); } catch (e) { ov.hidden = true; } }
        }
        return Promise.resolve({ paused: !!on });
    },
    switchCamera() { return this.provider.switchCamera(); },
    state() { try { return this.provider.state(); } catch (e) { return { status: 'unknown' }; } },
    stats() { try { return this.provider.stats(); } catch (e) { return { t: Date.now(), pcs: [], heapMB: null }; } }
};
function paintOverlay(s) {
    const ov = document.getElementById('lv7RtcState');
    if (!ov) return;
    const t = STATUS_TXT[s] || '';
    ov.hidden = !t;
    if (t && ov.textContent !== t) ov.textContent = t;
}
/* offline/online: show state; auto-retry when the network returns */
window.addEventListener('offline', () => { if (V.provider.sid) paintOverlay('offline'); });
window.addEventListener('online', () => { if (V.provider.sid) V.retry().catch(() => {}); });

/* ---------- global API (B2/B3 contract) ---------- */
window.skhLiveVideo = V;
window.skhLiveCamToggle = function (on) { return V.setCam(on !== false); };
window.skhLiveRtcRetry = function () { return V.retry(); };
window.skhLiveMicCam = function (opts) {
    if (opts && typeof opts === 'object') {
        const jobs = [];
        if (opts.cam !== undefined) jobs.push(V.setCam(!!opts.cam));
        if (opts.mic !== undefined) jobs.push(V.setMic(!!opts.mic));
        return Promise.all(jobs).then(() => ({ cam: V.provider.camOn, mic: V.provider.micOn }));
    }
    return Promise.resolve({ cam: !!V.provider.camOn, mic: !!V.provider.micOn });
};
/* mini player: MOVE the stage node (video element survives, stream continues) */
window.skhLiveMinimize = function () {
    if (document.getElementById('lvxMini')) return;
    const stage = document.querySelector('#lvxRoom .lv7-stage');
    if (!stage) return;
    const mark = document.createComment('lvx-stage-home');
    stage.parentNode.insertBefore(mark, stage);
    const mini = document.createElement('div');
    mini.id = 'lvxMini'; mini.className = 'lvx-mini';
    mini.innerHTML = '<div class="lvx-mini-head"><b>Live inaendelea</b><span><button id="lvxMiniBack" aria-label="Rudi">Rudi</button><button id="lvxMiniX" aria-label="Funga">Funga</button></span></div><div class="lvx-mini-slot"></div>';
    mini.querySelector('.lvx-mini-slot').appendChild(stage);
    document.body.appendChild(mini);
    mini.querySelector('#lvxMiniBack').onclick = () => window.skhLiveMiniRestore();
    mini.querySelector('#lvxMiniX').onclick = () => { window.skhLiveMiniRestore(); if (typeof window.skhLiveClose === 'function') window.skhLiveClose('lvxRoom'); };
    const room = document.getElementById('lvxRoom');
    if (room) room.hidden = true;
};
window.skhLiveMiniRestore = function () {
    const mini = document.getElementById('lvxMini');
    if (!mini) return;
    const stage = mini.querySelector('.lv7-stage');
    const room = document.getElementById('lvxRoom');
    if (room) room.hidden = false;
    let home = null;
    if (room) {
        const it = document.createNodeIterator(room, NodeFilter.SHOW_COMMENT);
        let n; while ((n = it.nextNode())) if (n.textContent === 'lvx-stage-home') { home = n; break; }
    }
    if (stage && home && home.parentNode) home.parentNode.insertBefore(stage, home);
    else if (stage && room) { const fr = room.querySelector('.lv7'); if (fr) fr.insertBefore(stage, fr.firstChild); }
    if (home && home.parentNode) home.parentNode.removeChild(home);
    mini.remove();
};

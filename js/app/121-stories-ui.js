/* ==== js/app/121-stories-ui.js ==== */
/* [R13-B 2026-11] Hali (Stories) — rail in its OWN slot (#skhHxRail) placed just above Chat
 * Discovery's update strip (#skhDfHali stays owned by module 106 — not overwritten) + full-screen
 * story / video viewer.
 *   - one circle per author with active public stories (24h), newest first
 *   - viewer: progress bars, auto-advance (image 5 s, video = its length), tap left/right,
 *     arrow keys, Esc, swipe down to close; pause while held
 *   - "Fungua tangazo" opens the linked listing; "Tuma kwa chat" shares it into a conversation
 *     (existing share flow); "Ripoti"; the author can remove their own story
 *   - "+ Hali yako": photo/video -> existing signed upload -> storyCreate (server validates)
 * Views are counted by the server once per viewer.
 * [R13-F] Design refs 8/9: live sessions + Hali are tall cards inside Chat Discovery's
 * "Discover New Updates" row (slot #skhHxRail rendered by 106); viewer follows ref 9. */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (n, s) => (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : '');
const toast = (m, k) => { try { if (window.sokohaiToast) return window.sokohaiToast(m, k || 'info', 3500); } catch (e) {} console.log(m); };
const call = (n, d) => skh.callFunction(n, d).then(r => (r && r.data) || r);
const IMAGE_MS = 5000;
const svg = (d, f) => `<svg viewBox="0 0 24 24" width="18" height="18" ${f ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${d}</svg>`;
const SV = { play: svg('<polygon points="8,5 19,12 8,19"/>', 1), pause: svg('<rect x="7" y="5" width="3.6" height="14"/><rect x="13.4" y="5" width="3.6" height="14"/>', 1),
    prev: svg('<polygon points="18,6 9,12 18,18"/><rect x="5" y="6" width="2.4" height="12"/>', 1), next: svg('<polygon points="6,6 15,12 6,18"/><rect x="16.6" y="6" width="2.4" height="12"/>', 1),
    back: svg('<polyline points="15 18 9 12 15 6"/>'), check: svg('<path d="M12 2l2.4 2.2 3.2-.4.9 3.1 2.9 1.5-1 3 1 3-2.9 1.5-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.9-1.5 1-3-1-3 2.9-1.5.9-3.1 3.2.4z"/><polyline points="8.5 12 11 14.5 15.5 9.5" stroke="#fff" stroke-width="2" fill="none"/>', 1),
    share: svg('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>'),
    mute: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>'),
    sound: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>') };
let groups = [], lives = [], viewer = null, loading = false, lastLoad = 0;

async function load(force) {
    if (loading || (!force && Date.now() - lastLoad < 60000)) return paintRail();
    if (!skh.currentUser) return paintRail();
    loading = true;
    try {
        const q = skh.query(skh.collection(skh.db, 'stories'), skh.where('visibility', '==', 'public'), skh.where('status', '==', 'active'),
            skh.where('expiresAtMs', '>', Date.now()), skh.orderBy('expiresAtMs', 'desc'), skh.limit(80));
        const snap = await skh.getDocs(q);
        const by = {};
        snap.docs.forEach(d => { const s = Object.assign({ id: d.id }, d.data()); (by[s.authorUid] = by[s.authorUid] || { uid: s.authorUid, name: s.authorName, items: [] }).items.push(s); });
        groups = Object.values(by).map(g => { g.items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))); return g; })
            .sort((a, b) => String(b.items[b.items.length - 1].createdAt).localeCompare(String(a.items[a.items.length - 1].createdAt)));
        try {   // [R13-D] ref 9 "Watch Live": live sessions lead the rail
            const ls = await skh.getDocs(skh.query(skh.collection(skh.db, 'live_sessions'), skh.where('status', '==', 'live'), skh.orderBy('updatedAt', 'desc'), skh.limit(8)));
            lives = ls.docs.map(d => Object.assign({ id: d.id }, d.data()));
            await Promise.all(lives.map(async l => { const pid = l.pinnedProductId || (l.productIds || [])[0]; if (!pid) return;
                try { const p = await skh.getDoc(skh.doc(skh.db, 'products', pid)); const d = p.exists() ? p.data() : null;
                    if (d) l._cover = d.image || (d.imagesArray || [])[0] || ''; } catch (e) {} }));
        } catch (e) { lives = []; }
        lastLoad = Date.now();
    } catch (e) { console.warn('[stories]', e && e.message); groups = []; }
    loading = false; paintRail();
}
const ini = (n) => esc(String(n || 'S').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
const compact = (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'K' : String(n); };
function cardsHTML() {
    const me = skh.currentUser;
    const seen = (() => { try { return JSON.parse(localStorage.getItem('skh_hali_seen') || '{}'); } catch (e) { return {}; } })();
    const add = me ? `<button class="hx-item hx-add hx-card" onclick="skhStoryCreate()" aria-label="Weka hali yako"><span class="hx-add-ico">${ico('plus', 22)}</span><b>Hali yako</b><small>Picha au video · saa 24</small></button>` : '';
    const lv = lives.map(l => `<button class="hx-item hx-live hx-card" onclick="skhLiveOpen('${esc(l.id)}')" aria-label="Tazama live ya ${esc(l.hostName)}">
        ${l._cover ? `<img class="hx-bg" src="${esc(l._cover)}" alt="" loading="lazy">` : `<span class="hx-bg hx-bg-ph">${ico('video', 30)}</span>`}<span class="hx-shade"></span>
        <span class="hx-livebadge"><i></i>LIVE</span>
        <span class="hx-pill"><b>Live preview</b><small>Gusa kujiunga</small></span>
        <span class="hx-cbody"><b class="hx-ctitle">${esc(String(l.title || '').slice(0, 60))}</b>
          <span class="hx-who2"><span class="hx-av">${ini(l.hostName)}</span><span class="hx-whotx"><span>${esc(l.hostName)}</span><small>${compact(l.viewerCount)} wanatazama</small></span></span></span></button>`).join('');
    const st = groups.map((g, i) => { const last = g.items[g.items.length - 1]; const unseen = !seen[last.id];
        const head = last.listing && last.listing.title ? last.listing.title : (last.caption || 'Hali mpya');
        return `<button class="hx-item hx-story hx-card ${unseen ? 'is-new' : ''}" onclick="skhStoryOpen(${i})" aria-label="Hali ya ${esc(g.name)}">
        ${last.kind === 'image' ? `<img class="hx-bg" src="${esc(last.mediaUrl)}" alt="" loading="lazy">` : `<video class="hx-bg" src="${esc(last.mediaUrl)}#t=0.5" muted playsinline preload="metadata"></video><span class="hx-play">${ico('play', 18)}</span>`}<span class="hx-shade"></span>
        <span class="hx-cbars">${g.items.map(x => `<i class="${seen[x.id] ? 'on' : ''}"></i>`).join('')}</span>
        <span class="hx-chead"><span class="hx-av">${ini(g.name)}</span><span class="hx-whotx"><span>${esc(g.name)}</span><small>Hali · ${esc(timeAgo(last.createdAt, true))}</small></span></span>
        <span class="hx-cbody"><b class="hx-ctitle">${esc(String(head).slice(0, 70))}</b>${last.listing && last.listing.price ? `<small class="hx-cprice">TSh ${Number(last.listing.price).toLocaleString('en-US')}</small>` : ''}</span></button>`; }).join('');
    return add + lv + st;
}
let painting = false;
function paintRail() {
    if (painting) return; painting = true;
    try {
        const inRow = () => document.querySelector('#skhDfHali #skhHxRail');
        let slot = inRow();
        // 106 owns the row: ask it to render (it then includes our slot) when there is something to show
        if (!slot && hasCards() && typeof window.skhDfRepaint === 'function') { window.skhDfRepaint(); slot = inRow(); }
        if (slot) document.querySelectorAll('#skhHxRail.hx-standalone').forEach(e => e.remove());
        else slot = railSlot();
        if (!slot) return;
        slot.innerHTML = cardsHTML();
        slot.classList.toggle('hx-empty-slot', !slot.innerHTML.trim());
    } finally { painting = false; }
}
function hasCards() { return !!(skh.currentUser || lives.length || groups.length); }
window.skhHxHasCards = hasCards;
window.skhHxPaint = paintRail;

/* ---------------- viewer ---------------- */
window.skhStoryOpen = function (gi, si) {
    if (!groups[gi]) return;
    viewer = { gi, si: si || 0, t0: 0, dur: IMAGE_MS, raf: 0, paused: false, elapsed: 0 };
    let el = document.getElementById('hxViewer');
    if (!el) { el = document.createElement('div'); el.id = 'hxViewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    el.hidden = false; document.body.classList.add('lvx-open');
    document.addEventListener('keydown', onKey);
    show();
};
function story() { const g = groups[viewer.gi]; return g && g.items[viewer.si]; }
function show() {
    const g = groups[viewer.gi], s = story(); if (!s) return close();
    const el = document.getElementById('hxViewer');
    const mine = skh.currentUser && skh.currentUser.uid === s.authorUid;
    const head = s.listing && s.listing.title ? s.listing.title : '';
    // [R13-F] ref 9: back to chats, seller row, media card (bars + prev/play/next + sound), title, text, React/Comment/Share, actions
    el.innerHTML = `<div class="hx-stage hx9">
        <header class="hx-top"><button class="hx-back" onclick="skhStoryClose()" aria-label="Rudi kwenye Chat">${SV.back} Rudi kwenye Chat</button><small>${esc(timeAgo(s.createdAt))}</small></header>
        <div class="hx-head"><span class="hx-av">${ini(g.name)}</span><span class="hx-whotx"><b>${esc(g.name)}</b><small>Muuzaji · Hali</small></span>
          <button class="hx-btn" onclick="skhStoryClose()" aria-label="Funga">${ico('x', 18)}</button></div>
        <div class="hx-card9">
          <div class="hx-bars">${g.items.map((x, i) => `<span><i style="width:${i < viewer.si ? 100 : 0}%"></i></span>`).join('')}</div>
          <div class="hx-media" id="hxMedia">${s.kind === 'video' ? `<video src="${esc(s.mediaUrl)}" playsinline autoplay muted></video>` : `<img src="${esc(s.mediaUrl)}" alt="${esc(s.caption || 'Hali')}">`}</div>
          <button class="hx-tap hx-prev" aria-label="Iliyotangulia" onclick="skhStoryStep(-1)"></button><button class="hx-tap hx-next" aria-label="Inayofuata" onclick="skhStoryStep(1)"></button>
          <div class="hx-ctls"><button class="hx-ctl" onclick="skhStoryStep(-1)" aria-label="Iliyotangulia">${SV.prev}</button><button class="hx-ctl hx-pp" onclick="skhStoryPause(this)" aria-label="Simamisha">${SV.pause}</button><button class="hx-ctl" onclick="skhStoryStep(1)" aria-label="Inayofuata">${SV.next}</button></div>
          <span class="hx-dots">${g.items.map((x, i) => `<i class="${i === viewer.si ? 'on' : ''}"></i>`).join('')}</span>
          ${s.kind === 'video' ? `<button class="hx-mute" onclick="skhStoryMute(this)" aria-label="Sauti">${SV.mute}</button>` : ''}
        </div>
        <footer class="hx-foot">${head ? `<h3 class="hx-h">${esc(head)}</h3>` : ''}${s.listing && s.listing.price ? `<div class="hx-price">TSh ${Number(s.listing.price).toLocaleString('en-US')}</div>` : ''}
          ${s.caption ? `<p>${esc(s.caption)}</p>` : ''}
          ${mine ? '' : `<div class="hx-react"><button onclick="skhStoryReact(this)" class="${viewer.reacted && viewer.reacted[s.id] ? 'on' : ''}">${ico('heart', 18)} <span>${s.reactCount || 0}</span> Penda</button><button onclick="skhStoryChat('comment')">${ico('chat', 18)} Maoni</button><button onclick="skhStoryShare()">${SV.share} Shiriki</button></div>`}
          <div class="hx-actions">${s.listing ? `<button class="lvx-btn lvx-btn-primary hx-wide" onclick="skhStoryListing()">${ico('package', 15)} Tazama bidhaa</button>` : ''}
            ${mine ? '' : `<button class="lvx-btn hx-wide hx-chatbtn" onclick="skhStoryChat('seller')">${ico('chat', 15)} Chat na muuzaji</button>`}
            ${mine ? `<button class="lvx-btn" onclick="skhStoryRemove()">${ico('trash', 15)} Ondoa</button><span class="hx-views">${ico('eye', 13)} ${s.viewCount || 0}</span>`
                   : `<button class="lvx-btn hx-rep" onclick="skhStoryReport()">${ico('alert', 15)} Ripoti</button>`}</div></footer></div>`;
    const stage = el.querySelector('.hx-stage'), card = el.querySelector('.hx-media');
    card.addEventListener('pointerdown', () => { if (viewer.held) return; viewer.paused = true; const v = el.querySelector('video'); if (v) v.pause(); });
    card.addEventListener('pointerup', () => { if (viewer.held) return; viewer.paused = false; const v = el.querySelector('video'); if (v) v.play().catch(() => {}); });
    let y0 = null; stage.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90) close(); y0 = null; }, { passive: true });
    try { const seen = JSON.parse(localStorage.getItem('skh_hali_seen') || '{}'); seen[s.id] = 1; localStorage.setItem('skh_hali_seen', JSON.stringify(seen)); } catch (e) {}
    call('storyView', { storyId: s.id }).catch(() => {});
    viewer.elapsed = 0; viewer.dur = IMAGE_MS;
    const v = el.querySelector('video');
    if (v) v.addEventListener('loadedmetadata', () => { viewer.dur = Math.min(60000, Math.max(3000, (v.duration || 5) * 1000)); });
    cancelAnimationFrame(viewer.raf); let last = performance.now();
    const step = (t) => { if (!viewer) return; if (!viewer.paused) viewer.elapsed += t - last; last = t;
        const bar = el.querySelectorAll('.hx-bars i')[viewer.si]; if (bar) bar.style.width = Math.min(100, viewer.elapsed / viewer.dur * 100) + '%';
        if (viewer.elapsed >= viewer.dur) return window.skhStoryStep(1); viewer.raf = requestAnimationFrame(step); };
    viewer.raf = requestAnimationFrame(step);
}
window.skhStoryStep = function (d) {
    if (!viewer) return;
    const g = groups[viewer.gi];
    viewer.si += d;
    if (viewer.si >= g.items.length) { viewer.gi++; viewer.si = 0; if (!groups[viewer.gi]) return close(); }
    if (viewer.si < 0) { viewer.gi--; if (!groups[viewer.gi]) { viewer.gi = 0; viewer.si = 0; } else viewer.si = groups[viewer.gi].items.length - 1; }
    show();
};
function onKey(e) { if (!viewer) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') window.skhStoryStep(1); if (e.key === 'ArrowLeft') window.skhStoryStep(-1); }
function close() { if (viewer) cancelAnimationFrame(viewer.raf); viewer = null; const el = document.getElementById('hxViewer'); if (el) { el.hidden = true; el.innerHTML = ''; } document.removeEventListener('keydown', onKey); if (!document.querySelector('.lvx-overlay:not([hidden])')) document.body.classList.remove('lvx-open'); paintRail(); }
window.skhStoryClose = close;
window.skhStoryPause = function (b) { if (!viewer) return; viewer.held = !viewer.held; viewer.paused = viewer.held; const v = document.querySelector('#hxViewer video');
    if (v) { if (viewer.paused) v.pause(); else v.play().catch(() => {}); } if (b) { b.innerHTML = viewer.paused ? SV.play : SV.pause; b.setAttribute('aria-label', viewer.paused ? 'Endelea' : 'Simamisha'); } };
window.skhStoryMute = function (b) { const v = document.querySelector('#hxViewer video'); if (!v) return; v.muted = !v.muted; if (b) b.innerHTML = v.muted ? SV.mute : SV.sound; };
window.skhStoryReact = async function (btn) { const s = story(); if (!s) return;
    try { const r = await call('storyReact', { storyId: s.id }); viewer.reacted = viewer.reacted || {}; viewer.reacted[s.id] = r.on; s.reactCount = r.count; btn.classList.toggle('on', r.on); btn.querySelector('span').textContent = r.count; }
    catch (e) { toast(window.skhFnErrText ? window.skhFnErrText(e) : e.message, 'warn'); } };
/* comments and questions go to the author privately (the existing chat), never as public replies */
window.skhStoryChat = function () { const s = story(); if (!s) return; close(); if (typeof window.openChatWithUser === 'function') window.openChatWithUser(s.authorUid, s.authorName); };
window.skhStoryListing = function () { const s = story(); if (!s || !s.listing) return; close(); if (window.openProduct) window.openProduct(s.listing.id, s.listing.col || 'products'); };
// [R13-F] skhShareProduct shares the product page that is open (it ignores arguments), so a story builds its own public link
window.skhStoryShare = function () { const s = story(); if (!s) return;
    const link = s.listing && typeof window.skhProductPublicUrl === 'function' ? window.skhProductPublicUrl(s.listing.id) : location.origin + location.pathname;
    const data = { title: (s.listing && s.listing.title) || s.authorName, text: s.caption || (s.listing && s.listing.title) || '', url: link };
    if (navigator.share) return navigator.share(data).catch(() => {});
    try { navigator.clipboard.writeText(link).then(() => toast('Kiungo kimenakiliwa', 'success'), () => toast(link)); } catch (e) { toast(link); } };
window.skhStoryReport = async function () { const s = story(); if (!s) return; viewer.paused = true; const r = window.prompt('Eleza tatizo la hali hii:', ''); viewer && (viewer.paused = false); if (!r) return;
    try { await call('storyReport', { storyId: s.id, reason: r }); toast('Asante. Ripoti imetumwa.', 'success'); } catch (e) { toast(window.skhFnErrText ? window.skhFnErrText(e) : e.message, 'warn'); } };
window.skhStoryRemove = async function () { const s = story(); if (!s || !window.confirm('Ondoa hali hii?')) return;
    try { await call('storyRemove', { storyId: s.id }); toast('Hali imeondolewa.', 'success'); close(); load(true); } catch (e) { toast(window.skhFnErrText ? window.skhFnErrText(e) : e.message, 'warn'); } };
function timeAgo(iso, short) { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (short) return m < 1 ? 'sasa hivi' : m < 60 ? 'dak ' + m : 'saa ' + Math.round(m / 60);
    return m < 1 ? 'sasa hivi' : m < 60 ? 'dakika ' + m + ' zilizopita' : 'saa ' + Math.round(m / 60) + ' zilizopita'; }

/* ---------------- create ---------------- */
window.skhStoryCreate = async function () {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,video/mp4,video/webm,video/quicktime';
    inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        if (f.size > 40 * 1024 * 1024) return toast('Faili ni kubwa mno (zaidi ya 40 MB).', 'warn');
        const caption = window.prompt('Maelezo mafupi (hiari):', '') || '';
        toast('Inapakia hali yako…');
        const up = await window.skhUploadFromFile(f, { resourceType: f.type.indexOf('video') === 0 ? 'video' : 'image', folder: 'stories' });
        if (!up || !up.url) return toast((window.skhUploadLastError && window.skhUploadLastError.message) || 'Haikupakiwa.', 'warn');
        try { await call('storyCreate', { mediaUrl: up.url, caption, visibility: 'public' }); toast('Hali yako imewekwa kwa saa 24.', 'success'); load(true); }
        catch (e) { toast(window.skhFnErrText ? window.skhFnErrText(e) : e.message, 'warn'); }
    };
    inp.click();
};

/* mount when Chat Discovery renders its slot */
function railSlot() {   // fallback only: Chat Discovery's row is not rendered
    let el = document.getElementById('skhHxRail'); if (el) return el;
    const df = document.getElementById('skhDfHali'); if (!df || !df.parentNode) return null;
    el = document.createElement('div'); el.id = 'skhHxRail'; el.className = 'hx-slot hx-standalone'; df.parentNode.insertBefore(el, df); return el;
}
const mo = new MutationObserver(() => { const df = document.getElementById('skhDfHali'); if (df && !document.getElementById('skhHxRail')) load(false);
    else if (df && document.querySelector('#skhDfHali #skhHxRail:empty') && !painting && hasCards()) paintRail(); });
if (document.body) mo.observe(document.body, { childList: true, subtree: true });
window.skhStoriesReload = () => load(true);
// rail may mount before sign-in finishes: reload once auth state is known/changes
try { skh.onAuthStateChanged(skh.auth, () => { if (document.getElementById('skhHxRail')) load(true); }); } catch (e) {}

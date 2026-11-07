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
 * Views are counted by the server once per viewer. */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (n, s) => (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : '');
const toast = (m, k) => { try { if (window.sokohaiToast) return window.sokohaiToast(m, k || 'info', 3500); } catch (e) {} console.log(m); };
const call = (n, d) => skh.callFunction(n, d).then(r => (r && r.data) || r);
const IMAGE_MS = 5000;
let groups = [], viewer = null, loading = false, lastLoad = 0;

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
        lastLoad = Date.now();
    } catch (e) { console.warn('[stories]', e && e.message); groups = []; }
    loading = false; paintRail();
}
function paintRail() {
    const slot = railSlot(); if (!slot) return;
    const me = skh.currentUser;
    const seen = (() => { try { return JSON.parse(localStorage.getItem('skh_hali_seen') || '{}'); } catch (e) { return {}; } })();
    slot.innerHTML = `<div class="hx-rail" role="list" aria-label="Hali za wauzaji">
        ${me ? `<button class="hx-item hx-add" onclick="skhStoryCreate()" role="listitem"><span class="hx-ring">${ico('plus', 20)}</span><small>Hali yako</small></button>` : ''}
        ${groups.map((g, i) => { const last = g.items[g.items.length - 1]; const unseen = !seen[last.id];
            return `<button class="hx-item" onclick="skhStoryOpen(${i})" role="listitem" aria-label="Hali ya ${esc(g.name)}"><span class="hx-ring ${unseen ? 'is-new' : ''}">${last.kind === 'image' ? `<img src="${esc(last.mediaUrl)}" alt="" loading="lazy">` : ico('video', 20)}</span><small>${esc(g.name)}</small></button>`; }).join('')}
        ${!groups.length ? '<span class="hx-empty">Hakuna hali mpya kwa sasa.</span>' : ''}</div>`;
}

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
    el.innerHTML = `<div class="hx-stage">
        <div class="hx-bars">${g.items.map((x, i) => `<span><i style="width:${i < viewer.si ? 100 : 0}%"></i></span>`).join('')}</div>
        <header class="hx-head"><b>${esc(g.name)}</b><small>${esc(timeAgo(s.createdAt))}</small>
          <button class="hx-btn" onclick="skhStoryClose()" aria-label="Funga">${ico('x', 18)}</button></header>
        <div class="hx-media" id="hxMedia">${s.kind === 'video' ? `<video src="${esc(s.mediaUrl)}" playsinline autoplay muted></video>` : `<img src="${esc(s.mediaUrl)}" alt="${esc(s.caption || 'Hali')}">`}</div>
        <button class="hx-tap hx-prev" aria-label="Iliyotangulia" onclick="skhStoryStep(-1)"></button><button class="hx-tap hx-next" aria-label="Inayofuata" onclick="skhStoryStep(1)"></button>
        <footer class="hx-foot">${s.caption ? `<p>${esc(s.caption)}</p>` : ''}
          <div class="hx-actions">${s.listing ? `<button class="lvx-btn lvx-btn-primary" onclick="skhStoryListing()">${ico('package', 15)} Fungua tangazo${s.listing.price ? ' · TSh ' + Number(s.listing.price).toLocaleString('en-US') : ''}</button>` : ''}
            ${s.listing ? `<button class="lvx-btn" onclick="skhStoryShare()">${ico('send', 15)} Tuma kwa chat</button>` : ''}
            ${mine ? `<button class="lvx-btn" onclick="skhStoryRemove()">${ico('trash', 15)} Ondoa</button><span class="hx-views">${ico('eye', 13)} ${s.viewCount || 0}</span>`
                   : `<button class="lvx-btn" onclick="skhStoryReport()">${ico('alert', 15)} Ripoti</button>`}</div></footer></div>`;
    const stage = el.querySelector('.hx-stage');
    stage.addEventListener('pointerdown', () => { viewer.paused = true; const v = el.querySelector('video'); if (v) v.pause(); });
    stage.addEventListener('pointerup', () => { viewer.paused = false; const v = el.querySelector('video'); if (v) v.play().catch(() => {}); });
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
window.skhStoryListing = function () { const s = story(); if (!s || !s.listing) return; close(); if (window.openProduct) window.openProduct(s.listing.id, s.listing.col || 'products'); };
window.skhStoryShare = function () { const s = story(); if (!s || !s.listing) return; close();
    if (typeof window.skhShareProduct === 'function') window.skhShareProduct({ id: s.listing.id, collectionName: s.listing.col, title: s.listing.title, price: s.listing.price });
    else if (window.openProduct) window.openProduct(s.listing.id, s.listing.col || 'products'); };
window.skhStoryReport = async function () { const s = story(); if (!s) return; viewer.paused = true; const r = window.prompt('Eleza tatizo la hali hii:', ''); viewer && (viewer.paused = false); if (!r) return;
    try { await call('storyReport', { storyId: s.id, reason: r }); toast('Asante. Ripoti imetumwa.', 'success'); } catch (e) { toast(window.skhFnErrText ? window.skhFnErrText(e) : e.message, 'warn'); } };
window.skhStoryRemove = async function () { const s = story(); if (!s || !window.confirm('Ondoa hali hii?')) return;
    try { await call('storyRemove', { storyId: s.id }); toast('Hali imeondolewa.', 'success'); close(); load(true); } catch (e) { toast(window.skhFnErrText ? window.skhFnErrText(e) : e.message, 'warn'); } };
function timeAgo(iso) { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? 'sasa hivi' : m < 60 ? 'dakika ' + m + ' zilizopita' : 'saa ' + Math.round(m / 60) + ' zilizopita'; }

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
function railSlot() {
    let el = document.getElementById('skhHxRail'); if (el) return el;
    const df = document.getElementById('skhDfHali'); if (!df || !df.parentNode) return null;
    el = document.createElement('div'); el.id = 'skhHxRail'; el.className = 'hx-slot'; df.parentNode.insertBefore(el, df); return el;
}
const mo = new MutationObserver(() => { if (document.getElementById('skhDfHali') && !document.getElementById('skhHxRail')) { railSlot(); load(false); } });
if (document.body) mo.observe(document.body, { childList: true, subtree: true });
window.skhStoriesReload = () => load(true);
// rail may mount before sign-in finishes: reload once auth state is known/changes
try { skh.onAuthStateChanged(skh.auth, () => { if (document.getElementById('skhHxRail')) load(true); }); } catch (e) {}

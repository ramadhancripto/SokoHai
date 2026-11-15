/* ==== js/app/127-identity-verification.js ====  [R16 2026-11-13]
 * "Thibitisha utambulisho": mtumiaji anapakia hati (kitambulisho / leseni ya biashara) kwa njia
 * SALAMA (Cloudinary 'authenticated' — hati haionekani hadharani), anaandika herufi 4 za mwisho tu
 * za namba ya hati, kisha admin anakagua na kuamua (functions/verification.js). Kitufe kiko kwenye
 * wasifu (openProfile). Upakiaji salama usiposanidiwa, fomu inasema wazi — hakuna njia ya umma. */
const skh = window.skh || {};
const DOCS = [['national_id', 'Kitambulisho cha Taifa (NIDA)'], ['passport', 'Pasipoti'], ['driving_license', 'Leseni ya udereva'], ['business_license', 'Leseni ya biashara'], ['tin_certificate', 'Cheti cha TIN']];
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ST = { pending: ['Inasubiri ukaguzi', '#92400e', '#fef3c7'], approved: ['Imethibitishwa', '#065f46', '#d1fae5'], rejected: ['Imekataliwa', '#b91c1c', '#fee2e2'] };

function shell() {
    let m = document.getElementById('skhIdv');
    if (!m) { m = document.createElement('div'); m.id = 'skhIdv'; m.className = 'overlay-menu'; document.body.appendChild(m); }
    m.style.cssText = 'z-index:100030;display:flex;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:16px;';
    return m;
}
const close = () => { const m = document.getElementById('skhIdv'); if (m) m.style.display = 'none'; };
window.skhIdvClose = close;

window.skhOpenIdentityVerification = async function () {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const m = shell();
    let cur = null;
    try { const s = await skh.getDoc(skh.doc(skh.db, 'verification_requests', skh.currentUser.uid)); cur = s.exists() ? s.data() : null; } catch (e) {}
    const st = cur && ST[cur.status];
    const statusHtml = st ? '<p id="skhIdvStatus" data-status="' + esc(cur.status) + '" style="margin:0 0 12px;padding:10px;border-radius:12px;background:' + st[2] + ';color:' + st[1] + ';font-weight:700;font-size:13px;">' + st[0]
        + (cur.status === 'rejected' && cur.decisionReason ? ': ' + esc(cur.decisionReason) : '') + '</p>' : '';
    const canSubmit = !cur || cur.status === 'rejected' || cur.status === 'approved';
    m.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="skhIdvT" style="background:#fff;border-radius:18px;padding:20px;width:min(440px,100%);max-height:90vh;overflow:auto;font-family:Inter,system-ui,sans-serif;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><h3 id="skhIdvT" style="margin:0;color:#13231e;">Thibitisha utambulisho</h3><button type="button" onclick="window.skhIdvClose()" style="border:0;background:#e2e8f0;border-radius:8px;padding:6px 10px;cursor:pointer;">Funga</button></div>'
        + '<p style="font-size:12.5px;color:#475569;margin:8px 0 12px;">Hati yako inahifadhiwa kwa siri: admin wa SokoHai pekee anaiona kwa kiungo cha muda. Tunahifadhi herufi 4 za mwisho tu za namba yake.</p>'
        + statusHtml
        + (canSubmit ? '<label style="font-size:13px;font-weight:700;">Aina ya hati</label><select id="skhIdvType" style="width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:12px;margin:4px 0 10px;">' + DOCS.map(d => '<option value="' + d[0] + '">' + d[1] + '</option>').join('') + '</select>'
            + '<label style="font-size:13px;font-weight:700;">Herufi/namba 4 za mwisho</label><input id="skhIdvLast4" maxlength="4" autocomplete="off" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid #cbd5e1;border-radius:12px;margin:4px 0 10px;text-transform:uppercase;">'
            + '<label style="font-size:13px;font-weight:700;">Picha ya hati (mbele)</label><input id="skhIdvFront" type="file" accept="image/*" style="width:100%;margin:4px 0 10px;">'
            + '<label style="font-size:13px;font-weight:700;">Picha ya nyuma (hiari)</label><input id="skhIdvBack" type="file" accept="image/*" style="width:100%;margin:4px 0 10px;">'
            + '<p id="skhIdvMsg" role="alert" style="min-height:18px;margin:0 0 8px;color:#b91c1c;font-size:13px;"></p>'
            + '<button type="button" id="skhIdvGo" style="width:100%;border:0;border-radius:999px;background:#12946f;color:#fff;padding:13px;font-weight:800;cursor:pointer;">Tuma kwa ukaguzi</button>' : '')
        + '</div>';
    const go = document.getElementById('skhIdvGo');
    if (go) go.onclick = submit;
};

async function upload(file, side) {
    const up = await window.skhUploadFromFile(file, { folder: 'identity', resourceType: 'image' });
    if (!up || !up.data) throw new Error((window.skhUploadLastError && window.skhUploadLastError.message) || 'Upakiaji umeshindikana.');
    return { publicId: up.data.public_id, format: up.data.format || 'jpg', version: up.data.version || '', side };
}
async function submit() {
    const msg = document.getElementById('skhIdvMsg'), btn = document.getElementById('skhIdvGo');
    const last4 = (document.getElementById('skhIdvLast4').value || '').trim();
    const front = document.getElementById('skhIdvFront').files[0], back = document.getElementById('skhIdvBack').files[0];
    if (!/^[A-Za-z0-9]{4}$/.test(last4)) { msg.textContent = 'Andika herufi/namba 4 za mwisho za hati.'; return; }
    if (!front) { msg.textContent = 'Chagua picha ya hati.'; return; }
    btn.disabled = true; btn.textContent = 'Inapakia kwa usalama…'; msg.textContent = '';
    try {
        const sig = await window.skhUploadSignature('image', 'identity');
        if (!sig || sig.mode !== 'signed') {
            msg.textContent = /upakiaji_salama/.test(String(sig && sig.error)) ? 'Upakiaji salama wa nyaraka bado haujasanidiwa na SokoHai. Jaribu baadaye.' : 'Imeshindikana kuanzisha upakiaji salama.';
            btn.disabled = false; btn.textContent = 'Tuma kwa ukaguzi'; return;
        }
        const docs = [await upload(front, 'front')];
        if (back) docs.push(await upload(back, 'back'));
        await skh.wrapCallable('verificationSubmit')({ docType: document.getElementById('skhIdvType').value, last4, docs });
        window.skhOpenIdentityVerification();
    } catch (e) {
        btn.disabled = false; btn.textContent = 'Tuma kwa ukaguzi';
        msg.textContent = String((e && e.message) || e).replace(/^FirebaseError:\s*/, '');
    }
}

/* [UI 2026-11-15] The button goes INSIDE the profile card's action row. The profile body renders
   asynchronously, so it was appended to the modal backdrop instead: it floated outside the card and,
   being a flex sibling, squeezed the whole profile to ~60% of the phone width. Wait for the card. */
function placeIdvButton(tries) {
    const host = document.querySelector('#myProfileModal .mp-head-card .mp-actions');
    let b = document.getElementById('skhIdvBtn');
    if (!host) { if (tries < 30) setTimeout(() => placeIdvButton(tries + 1), 150); else if (b && !b.closest('.mp-head-card')) b.remove(); return; }
    if (!b) {
        b = document.createElement('button');
        b.type = 'button'; b.id = 'skhIdvBtn';
        b.className = 'mp-btn mp-btn-verify';
        b.style.cssText = 'border:1px solid #12946f;background:#fff;color:#0f5132;font-weight:800;cursor:pointer;';
        b.onclick = () => window.skhOpenIdentityVerification();
    }
    b.textContent = (skh.currentUserData && skh.currentUserData.isVerified) ? 'Umethibitishwa ✓' : 'Thibitisha utambulisho';
    if (b.parentElement !== host) host.appendChild(b);
}
/* kitufe ndani ya wasifu wako mwenyewe */
const origProfile = window.openProfile;
if (typeof origProfile === 'function' && !origProfile.__idv) {
    const wrapped = async function (uidOverride) {
        const r = await origProfile.apply(this, arguments);
        try {
            const mine = !uidOverride || (skh.currentUser && uidOverride === skh.currentUser.uid);
            if (mine) [0, 1200, 3000].forEach(ms => setTimeout(() => placeIdvButton(0), ms));   // the card may re-render once data arrives
        } catch (e) {}
        return r;
    };
    wrapped.__idv = true; window.openProfile = wrapped;
}

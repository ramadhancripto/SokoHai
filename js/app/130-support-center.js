/* ==== js/app/130-support-center.js ====                       [SUPPORT 2026-11-21]
 * Real support requests (replaces the dead "Contact Support / Report a Problem / Feedback / Rate" forms).
 *  - a signed-in user sends a request: category, subject, description, optional order/listing reference;
 *  - it is stored in Firestore `support_requests/{SR-…}` (rules: own uid, fixed fields, length limits, status "open");
 *  - the user gets the reference number and can follow status + the team's reply under "Maombi yangu";
 *  - admins triage in Kituo cha Udhibiti → Msaada (status + reply, audited by handledBy).
 * No e-mail, phone or attachment is collected here: the account identifies the person; attachments wait for a
 * signed upload path (chat media uses an unsigned preset that is not suitable for support files).
 * Opening from the public pages: /?support=<category> (signed-out users are asked to sign in first).
 */
import { skh } from './00-bootstrap.js';

const CATEGORIES = [
    ['account', 'Akaunti na kuingia'], ['buyer', 'Msaada kwa mnunuzi'], ['seller', 'Msaada kwa muuzaji'],
    ['listing', 'Tangazo / bidhaa'], ['payments', 'Malipo na SokoPay'], ['refunds', 'Marejesho na migogoro'],
    ['delivery', 'Usafiri na delivery'], ['live', 'Live na minada'], ['security', 'Usalama / shughuli ya kutiliwa shaka'],
    ['privacy', 'Faragha na data yangu'], ['technical', 'Tatizo la kiufundi'], ['feedback', 'Maoni na mapendekezo'], ['other', 'Mengineyo']
];
const STATUS = { open: ['Limepokelewa', '#92400e', '#fef3c7'], in_progress: ['Linashughulikiwa', '#1e40af', '#dbeafe'], resolved: ['Limetatuliwa', '#065f46', '#d1fae5'], closed: ['Limefungwa', '#475569', '#e2e8f0'] };
const COOLDOWN_MS = 60000;
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => skh.currentUser && skh.currentUser.uid;
const say = (m, t) => { if (typeof window.skhToast === 'function') window.skhToast(m, t || 'info', 4500); else alert(m); };

function newRef() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint8Array(10); crypto.getRandomValues(b);
    return 'SR-' + Array.from(b, x => A[x % A.length]).join('');
}
function shell() {
    let m = document.getElementById('skhSupportModal');
    if (!m) { m = document.createElement('div'); m.id = 'skhSupportModal'; m.className = 'overlay-menu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'skhSupT'); document.body.appendChild(m); }
    m.style.cssText = 'z-index:100040;display:flex;background:rgba(15,23,42,.5);align-items:flex-start;justify-content:center;padding:16px;overflow:auto;';
    m.onclick = (e) => { if (e.target === m) close(); };
    return m;
}
function close() { const m = document.getElementById('skhSupportModal'); if (m) m.style.display = 'none'; }
window.skhSupportClose = close;

const card = (inner) => '<section style="background:#fff;border-radius:20px;width:min(520px,100%);padding:20px;box-shadow:0 20px 60px rgba(15,23,42,.25);font-family:Inter,system-ui,sans-serif;color:#0f2a3d;">'
    + '<header style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px;"><div><h2 id="skhSupT" style="margin:0;font-size:20px;color:#16236b;">Wasiliana na Msaada wa SokoHai</h2>'
    + '<p style="margin:4px 0 0;font-size:13px;color:#5b6b7a;">Ombi lako linahifadhiwa kwenye akaunti yako na timu ya SokoHai inalijibu hapa.</p></div>'
    + '<button type="button" onclick="skhSupportClose()" aria-label="Funga" style="border:0;background:#eef2f6;border-radius:999px;width:36px;height:36px;font-size:18px;cursor:pointer;">×</button></header>' + inner + '</section>';
const fieldCss = 'width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #d8e3ea;border-radius:12px;font-size:16px;background:#f8fbfa;color:#0f2a3d;margin:4px 0 12px;';
const lbl = (t, f) => '<label for="' + f + '" style="display:block;font-size:13px;font-weight:700;">' + t + '</label>';

window.skhOpenSupport = function (category, opts) {
    opts = opts || {};
    if (!uid()) { if (skh.requireAuth) skh.requireAuth(() => window.skhOpenSupport(category, opts)); return; }
    const cat = CATEGORIES.some(c => c[0] === category) ? category : 'other';
    const m = shell();
    m.innerHTML = card(
        '<div role="tablist" style="display:flex;gap:6px;margin-bottom:14px;">'
        + '<button type="button" role="tab" aria-selected="true" style="flex:1;padding:9px;border-radius:999px;border:0;background:#18A982;color:#fff;font-weight:700;">Ombi jipya</button>'
        + '<button type="button" role="tab" aria-selected="false" onclick="skhOpenMySupport()" style="flex:1;padding:9px;border-radius:999px;border:1.5px solid #d8e3ea;background:#fff;color:#0f2a3d;font-weight:700;cursor:pointer;">Maombi yangu</button></div>'
        + '<form id="skhSupForm" novalidate>'
        + lbl('Aina ya ombi', 'skhSupCat') + '<select id="skhSupCat" style="' + fieldCss + '">' + CATEGORIES.map(c => '<option value="' + c[0] + '"' + (c[0] === cat ? ' selected' : '') + '>' + esc(c[1]) + '</option>').join('') + '</select>'
        + lbl('Kichwa (herufi 3–120)', 'skhSupSub') + '<input id="skhSupSub" maxlength="120" required style="' + fieldCss + '" value="' + esc(opts.subject || '') + '">'
        + lbl('Maelezo (herufi 20–2000)', 'skhSupDesc') + '<textarea id="skhSupDesc" maxlength="2000" required rows="6" style="' + fieldCss + 'resize:vertical;" placeholder="Eleza kilichotokea, lini, na ulichotarajia."></textarea>'
        + lbl('Namba ya oda au tangazo (hiari)', 'skhSupRef') + '<input id="skhSupRef" maxlength="80" style="' + fieldCss + '" value="' + esc(opts.relatedRef || '') + '" placeholder="Mf. kitambulisho cha tangazo">'
        + '<p style="font-size:12px;color:#5b6b7a;margin:0 0 12px;">Usiandike nenosiri, PIN, namba kamili ya kadi au namba ya kitambulisho. Tutakujibu ndani ya SokoHai. Soma <a href="/privacy.html" target="_blank" rel="noopener" style="color:#1268a8;">Sera ya Faragha</a>.</p>'
        + '<p id="skhSupMsg" role="status" style="font-size:13px;margin:0 0 10px;"></p>'
        + '<button type="submit" id="skhSupSend" style="width:100%;min-height:50px;border:0;border-radius:999px;background:linear-gradient(135deg,#1cb68d,#12946f);color:#fff;font-weight:800;font-size:16px;cursor:pointer;">Tuma ombi</button>'
        + '</form>');
    const f = m.querySelector('#skhSupForm');
    f.onsubmit = async (e) => {
        e.preventDefault();
        const msg = m.querySelector('#skhSupMsg'), btn = m.querySelector('#skhSupSend');
        const category = m.querySelector('#skhSupCat').value, subject = m.querySelector('#skhSupSub').value.trim(),
            description = m.querySelector('#skhSupDesc').value.trim(), relatedRef = m.querySelector('#skhSupRef').value.trim();
        if (subject.length < 3) { msg.style.color = '#b91c1c'; msg.textContent = 'Andika kichwa (angalau herufi 3).'; return; }
        if (description.length < 20) { msg.style.color = '#b91c1c'; msg.textContent = 'Eleza zaidi (angalau herufi 20).'; return; }
        if (relatedRef && !/^[A-Za-z0-9_\-\/ .#]{1,80}$/.test(relatedRef)) { msg.style.color = '#b91c1c'; msg.textContent = 'Namba ya oda/tangazo ina herufi zisizoruhusiwa.'; return; }
        let last = 0; try { last = Number(localStorage.getItem('skh_support_last') || 0); } catch (x) {}
        if (Date.now() - last < COOLDOWN_MS) { msg.style.color = '#b91c1c'; msg.textContent = 'Subiri dakika moja kabla ya kutuma ombi jingine.'; return; }
        const who = uid(); if (!who) return;
        btn.disabled = true; msg.style.color = '#0f2a3d'; msg.textContent = 'Inatuma…';
        const ref = newRef();
        try {
            await skh.setDoc(skh.doc(skh.db, 'support_requests', ref), {
                reference: ref, uid: who, category, subject: subject.slice(0, 120), description: description.slice(0, 2000),
                relatedRef: relatedRef.slice(0, 80), status: 'open', createdAt: new Date().toISOString(),
                appVersion: String((window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.APP_VERSION) || '').slice(0, 40),
                page: String(location.pathname || '/').slice(0, 120)
            });
            try { localStorage.setItem('skh_support_last', String(Date.now())); } catch (x) {}
            m.querySelector('section').innerHTML = '<div style="text-align:center;padding:10px 4px;">'
                + '<h2 id="skhSupT" style="margin:0 0 8px;color:#16236b;font-size:20px;">Ombi limepokelewa</h2>'
                + '<p style="margin:0 0 6px;font-size:14px;">Namba ya ombi lako:</p>'
                + '<p id="skhSupRefOut" style="font:800 22px/1.2 ui-monospace,monospace;letter-spacing:.04em;color:#12946f;margin:0 0 12px;">' + esc(ref) + '</p>'
                + '<p style="font-size:13px;color:#5b6b7a;margin:0 0 16px;">Fuatilia hali na jibu la timu chini ya “Maombi yangu”.</p>'
                + '<button type="button" onclick="skhOpenMySupport()" style="border:0;border-radius:999px;background:#18A982;color:#fff;font-weight:800;padding:12px 20px;cursor:pointer;margin-right:6px;">Maombi yangu</button>'
                + '<button type="button" onclick="skhSupportClose()" style="border:1.5px solid #d8e3ea;border-radius:999px;background:#fff;font-weight:700;padding:12px 20px;cursor:pointer;">Funga</button></div>';
        } catch (err) {
            btn.disabled = false; msg.style.color = '#b91c1c';
            msg.textContent = /permission/i.test(String(err && (err.code || err.message))) ? 'Ombi halikukubaliwa. Hakikisha maelezo yamekamilika kisha jaribu tena.' : 'Imeshindikana kutuma. Angalia mtandao kisha jaribu tena.';
        }
    };
    setTimeout(() => { const s = m.querySelector('#skhSupSub'); if (s) s.focus(); }, 50);
};

window.skhOpenMySupport = async function () {
    if (!uid()) { if (skh.requireAuth) skh.requireAuth(() => window.skhOpenMySupport()); return; }
    const m = shell();
    m.innerHTML = card('<p style="color:#5b6b7a;">Inapakia…</p>');
    let rows = [];
    try {
        const q = await skh.getDocs(skh.query(skh.collection(skh.db, 'support_requests'), skh.where('uid', '==', uid()), skh.limit(50)));
        rows = q.docs.map(d => d.data()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } catch (e) { rows = null; }
    const list = rows === null ? '<p style="color:#b91c1c;">Imeshindikana kupakia maombi.</p>'
        : !rows.length ? '<p style="color:#5b6b7a;">Bado hujatuma ombi lolote.</p>'
        : rows.map(r => { const st = STATUS[r.status] || STATUS.open; return '<article style="border:1px solid #e3ebf0;border-radius:14px;padding:12px;margin-bottom:10px;">'
            + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><b style="font-family:ui-monospace,monospace;">' + esc(r.reference) + '</b>'
            + '<span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;color:' + st[1] + ';background:' + st[2] + ';">' + st[0] + '</span></div>'
            + '<div style="font-weight:700;margin-top:6px;">' + esc(r.subject) + '</div><small style="color:#5b6b7a;">' + esc((CATEGORIES.find(c => c[0] === r.category) || [, r.category])[1]) + ' · ' + esc(String(r.createdAt || '').slice(0, 10)) + '</small>'
            + (r.adminReply ? '<div style="margin-top:8px;background:#E7F8F1;border-radius:10px;padding:8px 10px;font-size:13px;"><b>Jibu la SokoHai:</b> ' + esc(r.adminReply) + '</div>' : '')
            + (r.status !== 'closed' ? '<button type="button" onclick="skhCloseMySupport(\'' + esc(r.reference) + '\')" style="margin-top:8px;border:0;background:none;color:#1268a8;font-weight:700;cursor:pointer;padding:0;">Funga ombi hili</button>' : '')
            + '</article>'; }).join('');
    m.innerHTML = card('<div style="display:flex;gap:6px;margin-bottom:14px;"><button type="button" onclick="skhOpenSupport()" style="flex:1;padding:9px;border-radius:999px;border:1.5px solid #d8e3ea;background:#fff;font-weight:700;cursor:pointer;">Ombi jipya</button>'
        + '<button type="button" style="flex:1;padding:9px;border-radius:999px;border:0;background:#18A982;color:#fff;font-weight:700;">Maombi yangu</button></div>' + list);
};
window.skhCloseMySupport = async function (ref) {
    if (!uid() || !/^SR-[A-Z0-9]{8,24}$/.test(String(ref))) return;
    try { await skh.updateDoc(skh.doc(skh.db, 'support_requests', ref), { status: 'closed', closedAt: new Date().toISOString() }); window.skhOpenMySupport(); }
    catch (e) { say('Imeshindikana kufunga ombi.', 'error'); }
};

/* ---------------- admin (Kituo cha Udhibiti → Msaada) ---------------- */
window.skhSupportAdmin = {
    async html() {
        let rows = [];
        try { const q = await skh.getDocs(skh.query(skh.collection(skh.db, 'support_requests'), skh.where('status', 'in', ['open', 'in_progress']), skh.limit(50))); rows = q.docs.map(d => d.data()); }
        catch (e) { return '<p style="color:#b91c1c;font-size:13px;">Imeshindikana kusoma maombi ya msaada.</p>'; }
        rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        if (!rows.length) return '<p style="color:#64748b;font-size:13px;">Hakuna maombi yanayosubiri.</p>';
        return rows.map(r => '<div style="border-top:1px solid #eef2f1;padding:10px 0;font-size:13px;"><b style="font-family:monospace;">' + esc(r.reference) + '</b> · ' + esc(r.category) + ' · ' + esc((STATUS[r.status] || STATUS.open)[0]) + ' · ' + esc(String(r.createdAt).slice(0, 16)) + '<br>'
            + '<b>' + esc(r.subject) + '</b><br><span style="white-space:pre-wrap;color:#334155;">' + esc(r.description) + '</span>'
            + (r.relatedRef ? '<br><small>Rejea: ' + esc(r.relatedRef) + '</small>' : '') + '<br><small>Mtumiaji: <code>' + esc(r.uid) + '</code></small><br>'
            + '<textarea id="skhSupReply_' + esc(r.reference) + '" rows="2" maxlength="1000" placeholder="Jibu kwa mtumiaji" style="width:100%;box-sizing:border-box;margin:6px 0;padding:8px;border:1px solid #cbd5e1;border-radius:8px;">' + esc(r.adminReply || '') + '</textarea>'
            + ['in_progress', 'resolved', 'closed'].map(s => '<button type="button" onclick="skhSupportAdmin.set(\'' + esc(r.reference) + '\',\'' + s + '\')" style="padding:6px 10px;border:none;border-radius:8px;margin:2px 6px 2px 0;font-weight:700;font-size:12px;cursor:pointer;background:' + (s === 'resolved' ? '#17604E;color:#fff' : '#f1f5f9;color:#18352D') + ';">' + STATUS[s][0] + '</button>').join('') + '</div>').join('');
    },
    async set(ref, status) {
        const who = uid(); if (!who) return;
        const el = document.getElementById('skhSupReply_' + ref);
        try {
            await skh.updateDoc(skh.doc(skh.db, 'support_requests', ref), { status, adminReply: String(el && el.value || '').trim().slice(0, 1000), handledBy: who, updatedAt: new Date().toISOString() });
            say('Imehifadhiwa.', 'success'); if (typeof window.skhAdminCCTab === 'function') window.skhAdminCCTab('support');
        } catch (e) { say('Imeshindikana: ' + (e && e.message || e), 'error'); }
    }
};

/* ---------------- deep link from the public pages: /?support=<category> ---------------- */
(function () {
    let want = null;
    try { const p = new URLSearchParams(location.search); want = p.get('support'); } catch (e) {}
    if (!want) return;
    const go = () => { if (want === 'mine') window.skhOpenMySupport(); else window.skhOpenSupport(want); };
    let tries = 0;
    const wait = () => { if (skh.__authResolved) { setTimeout(go, 600); return; } if (++tries < 60) setTimeout(wait, 250); };
    wait();
})();

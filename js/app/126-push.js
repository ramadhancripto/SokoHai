/* ==== js/app/126-push.js ====  [R15 2026-11-13]
 * Arifa za simu/kompyuta (web push, FCM) juu ya kituo cha taarifa kilichopo (notifications/*).
 * - Kitufe kiko ndani ya "Taarifa Zako"; ruhusa ya kivinjari inaombwa TU mtumiaji akibonyeza.
 * - Kinahitaji: service worker hai (uzalishaji) + VAPID key ya Firebase (window.SKH_FCM_VAPID au
 *   <meta name="skh-fcm-vapid">). Visipokuwepo, kitufe kinasema wazi kwamba push haijawekwa.
 * - Token inahifadhiwa na server pekee (pushRegisterToken); mapendeleo kupitia pushSetPrefs.
 */
const skh = window.skh || {};
const MSG_URL = 'https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js';
const LABELS = { orders: 'Oda', payments: 'Malipo na SokoPay', delivery: 'Usafirishaji', chat: 'Ujumbe na maoni', auctions: 'Minada', promotions: 'Ofa na matangazo' };
const LS_TOKEN = 'skh_push_token';

function vapid() {
    if (window.SKH_FCM_VAPID) return String(window.SKH_FCM_VAPID);
    const m = document.querySelector('meta[name="skh-fcm-vapid"]');
    return m ? String(m.content || '').trim() : '';
}
async function support() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, why: 'Kivinjari hiki hakitumi arifa za push.' };
    if (!vapid()) return { ok: false, why: 'Arifa za simu bado hazijawekwa kwenye SokoHai. Taarifa zako zote zinaonekana hapa chini.' };
    const reg = window.__skhSwReg || await navigator.serviceWorker.getRegistration().catch(() => null);
    if (!reg) return { ok: false, why: 'Arifa za push zinapatikana kwenye toleo la mtandaoni la SokoHai.' };
    return { ok: true, reg };
}
let msgMod = null;
async function messaging() {
    if (!msgMod) msgMod = await import(MSG_URL);
    if (!(await msgMod.isSupported())) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
    return { m: msgMod, inst: msgMod.getMessaging(skh.fApp) };
}
const callable = (n, d) => skh.wrapCallable(n)(d).then(r => r && r.data);
function tokenSaved() { try { return localStorage.getItem(LS_TOKEN) || ''; } catch (e) { return ''; } }

async function enable() {
    if (!skh.currentUser) throw new Error('Ingia kwanza.');
    const s = await support(); if (!s.ok) throw new Error(s.why);
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Umezuia arifa kwenye kivinjari. Ziruhusu kwenye mipangilio ya kivinjari kisha ujaribu tena.' : 'Ruhusa haikutolewa.');
    const { m, inst } = await messaging();
    const token = await m.getToken(inst, { vapidKey: vapid(), serviceWorkerRegistration: s.reg });
    if (!token) throw new Error('Imeshindikana kupata kitambulisho cha kifaa.');
    await callable('pushRegisterToken', { token, platform: 'web', ua: navigator.userAgent.slice(0, 160) });
    try { localStorage.setItem(LS_TOKEN, token); } catch (e) {}
    try { m.onMessage(inst, () => {}); } catch (e) {} // app iko wazi: kituo cha taarifa tayari kinaonyesha (listener ya notifications)
    return true;
}
async function disable() {
    const token = tokenSaved();
    if (!token) return; // kifaa hiki hakijawahi kuwasha push
    try { await callable('pushUnregisterToken', { token }); } catch (e) {}
    try { const { m, inst } = await messaging(); await m.deleteToken(inst); } catch (e) {}
    try { localStorage.removeItem(LS_TOKEN); } catch (e) {}
}
async function prefs() {
    try { const s = await skh.getDoc(skh.doc(skh.db, 'push_prefs', skh.currentUser.uid)); return s.exists() ? s.data() : {}; } catch (e) { return {}; }
}

function panelHtml(state, p) {
    const cats = Object.assign({ orders: true, payments: true, delivery: true, chat: true, auctions: true, promotions: false }, (p && p.categories) || {});
    const on = state === 'on';
    let h = '<div id="skhPushPanel" style="border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin:0 0 12px;font-size:13px;color:#334155;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;"><b style="color:#13231e;">Arifa za simu</b>'
        + '<button type="button" id="skhPushBtn" style="border:0;border-radius:999px;padding:8px 14px;font-weight:800;cursor:pointer;' + (on ? 'background:#e2e8f0;color:#334155;' : 'background:#12946f;color:#fff;') + '">' + (on ? 'Zima' : 'Washa') + '</button></div>'
        + '<p id="skhPushMsg" role="status" style="margin:6px 0 0;color:#64748b;">' + (on ? 'Utapata arifa hata SokoHai ikiwa imefungwa.' : 'Pata taarifa za oda, malipo na usafirishaji hata app ikiwa imefungwa.') + '</p>';
    if (on) {
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">';
        Object.keys(LABELS).forEach(k => { h += '<label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" data-push-cat="' + k + '"' + (cats[k] ? ' checked' : '') + '> ' + LABELS[k] + '</label>'; });
        h += '</div>';
    }
    return h + '</div>';
}
async function renderPanel() {
    const list = document.getElementById('notifList'); if (!list || !skh.currentUser) return;
    const s = await support();
    const on = s.ok && Notification.permission === 'granted' && !!tokenSaved();
    const old = document.getElementById('skhPushPanel'); if (old) old.remove();
    const wrap = document.createElement('div'); wrap.innerHTML = panelHtml(on ? 'on' : 'off', on ? await prefs() : null);
    const panel = wrap.firstChild; list.parentNode.insertBefore(panel, list);
    const btn = panel.querySelector('#skhPushBtn'), msg = panel.querySelector('#skhPushMsg');
    if (!s.ok && !on) { btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed'; msg.textContent = s.why; }
    btn.onclick = async () => {
        btn.disabled = true;
        try { if (on) await disable(); else await enable(); await renderPanel(); }
        catch (e) { btn.disabled = false; msg.style.color = '#b91c1c'; msg.textContent = (e && e.message && !/^[a-z-]+\//.test(e.message)) ? e.message : 'Imeshindikana. Jaribu tena.'; }
    };
    panel.querySelectorAll('[data-push-cat]').forEach(cb => {
        cb.onchange = async () => {
            const c = {}; c[cb.getAttribute('data-push-cat')] = cb.checked;
            try { await callable('pushSetPrefs', { categories: c }); } catch (e) { cb.checked = !cb.checked; msg.style.color = '#b91c1c'; msg.textContent = 'Imeshindikana kuhifadhi. Jaribu tena.'; }
        };
    });
}

/* panel inaonekana kila "Taarifa Zako" ikifunguliwa */
const origOpen = window.openNotifications;
if (typeof origOpen === 'function' && !origOpen.__skhPush) {
    const wrapped = async function () { const r = await origOpen.apply(this, arguments); try { await renderPanel(); } catch (e) {} return r; };
    wrapped.__skhPush = true; window.openNotifications = wrapped;
}
/* logout: kifaa hiki kisiendelee kupokea arifa za akaunti iliyotoka */
window.skhPushOnLogout = disable;
window.skhPush = { enable, disable, support, renderPanel, _vapid: vapid };

/* push ikibonyezwa inafungua /?notif=<id>: fungua "Taarifa Zako" baada ya login kurudi */
(function () {
    let id = null; try { id = new URLSearchParams(location.search).get('notif'); } catch (e) {}
    if (!id) return;
    let tries = 0;
    const t = setInterval(() => {
        tries++;
        if (skh.currentUser && typeof window.openNotifications === 'function') {
            clearInterval(t); try { history.replaceState(null, '', location.pathname); } catch (e) {}
            window.openNotifications();
        } else if (tries > 40) clearInterval(t);
    }, 500);
})();

/* ==== js/app/120-live-commerce-ui.js ==== */
/* [R13-B 2026-11] Live, Live Commerce, Mnada Live, Bei Kushuka Live — one live room.
 *
 *  window.skhLiveHub()              orodha ya Live zinazoendelea / zijazo + "Anzisha Live"
 *  window.skhLiveOpen(sessionId)    chumba cha live (video au onyesho la bidhaa, maoni, bidhaa)
 *  window.skhLiveCreateForm()       muuzaji anaanzisha live (bidhaa zake tu)
 *  window.skhAuctionRoom(productId) chumba cha mnada cha bidhaa moja (bila live)
 *
 * Every write goes through the server callables (live-commerce.js / auctionPlaceBid);
 * cart, orders, inventory and SokoPay are the existing ones (product sheet + SokoCart).
 * Prices: Bei Kushuka uses the same schedule formula as checkout; checkout re-prices on the
 * server anyway. No fabricated viewers, bids or comments: everything shown is a real record. */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tsh = (n) => 'TSh ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const ico = (n, s) => (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : '');
const toast = (m, k) => { try { if (window.sokohaiToast) return window.sokohaiToast(m, k || 'info', 3500); } catch (e) {} console.log(m); };
const errText = (e) => (window.skhFnErrText ? window.skhFnErrText(e) : (e && e.message) || 'Hitilafu');
const call = (n, d) => skh.callFunction(n, d).then(r => (r && r.data) || r);
const KIND_LABEL = { live: 'Live', live_commerce: 'Live Commerce', auction: 'Mnada Live', price_drop: 'Bei Kushuka Live' };
const ERR = { si_bidhaa_yako: 'Unaweza kuonyesha bidhaa zako tu.', si_mnada: 'Mnada Live inahitaji bidhaa za mnada.', si_bei_kushuka: 'Bei Kushuka Live inahitaji bidhaa za Bei Kushuka.',
    video_haikubaliki: 'Link ya video haikubaliki. Tumia link ya YouTube au Vimeo.', chagua_bidhaa: 'Chagua angalau bidhaa moja.', subiri_kidogo: 'Subiri sekunde mbili kabla ya kutuma tena.',
    umezuiwa_kwenye_live: 'Mwenyeji amekuzuia kutoa maoni kwenye live hii.', live_haiendelei: 'Live haiendelei sasa.', akaunti_imesimamishwa: 'Akaunti yako imesimamishwa.',
    waliokuzidi: 'Zabuni iko chini ya kiwango cha chini.', mnada_umefungwa: 'Mnada umefungwa.', mnada_haujaanza: 'Mnada haujaanza bado.', tangazo_lako: 'Huwezi kushiriki mnada wa bidhaa yako.', tayari_unaongoza: 'Tayari unaongoza mnada.' };
const friendly = (e) => { const m = errText(e); const k = Object.keys(ERR).find(x => m.indexOf(x) !== -1); return k ? ERR[k] + (/:(\d+)/.test(m) && k === 'waliokuzidi' ? ' Kiwango cha chini: ' + tsh(m.match(/:(\d+)/)[1]) + '.' : '') : m; };

/* Bei Kushuka: same schedule formula as functions/pricing-core.js modeUnitPrice. */
// price shown in the product list = the price checkout will charge right now (drop formula / current bid)
function listPrice(p) { const md = p.modeData || {}, m = p.saleMode || md.mode; if (m === 'price_drop') return dropPrice(p, Date.now()).price; if (m === 'auction' && Number(md.currentBid) > 0) return Number(md.currentBid); return Number(p.price) || 0; }
function dropPrice(p, now) {
    const md = p.modeData || {}, base = Number(p.price) || 0;
    const start = Number(md.startTime) || now, interval = Number(md.intervalMs) || 60000, drop = Number(md.dropAmount) || 0, min = Number(md.minPrice) || 0;
    const steps = Math.max(0, Math.floor((now - start) / interval));
    return { price: Math.max(min, base - steps * drop), nextIn: interval - ((now - start) % interval), atFloor: base - steps * drop <= min };
}
const fmtLeft = (ms) => { if (!(ms > 0)) return '00:00'; const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };

let room = null; // { id, unsub:[], timer, session, products:{}, auctionId }

function sheet(id, html) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    el.className = 'lvx-overlay'; el.innerHTML = html; el.hidden = false;
    document.body.classList.add('lvx-open');
    return el;
}
function closeSheet(id) { const el = document.getElementById(id); if (el) { el.hidden = true; el.innerHTML = ''; } if (!document.querySelector('.lvx-overlay:not([hidden])')) document.body.classList.remove('lvx-open'); }

/* ---------------- HUB ---------------- */
window.skhLiveHub = async function () {
    const el = sheet('lvxHub', `<div class="lvx-panel lvx-hub" role="dialog" aria-label="Live">
        <header class="lvx-head"><button class="lvx-icon-btn" onclick="skhLiveClose('lvxHub')" aria-label="Funga">${ico('back', 18)}</button>
          <div><b>Live na Fursa za Soko</b><small>Live, Mnada Live, Bei Kushuka Live na Live Commerce</small></div>
          <button class="lvx-btn lvx-btn-gold" onclick="skhLiveCreateForm()">${ico('video', 15)} Anzisha Live</button></header>
        <div class="lvx-tabs" role="tablist"><button class="on" data-t="live">Live sasa</button><button data-t="scheduled">Zinazokuja</button><button data-t="ended">Zilizopita</button></div>
        <div class="lvx-grid" id="lvxHubGrid"><div class="lvx-empty">Inapakia…</div></div></div>`);
    el.querySelectorAll('.lvx-tabs button').forEach(b => b.onclick = () => { el.querySelectorAll('.lvx-tabs button').forEach(x => x.classList.toggle('on', x === b)); loadHub(b.dataset.t); });
    loadHub('live');
};
async function loadHub(status) {
    const grid = document.getElementById('lvxHubGrid'); if (!grid) return;
    try {
        const q = skh.query(skh.collection(skh.db, 'live_sessions'), skh.where('status', '==', status), skh.orderBy('updatedAt', 'desc'), skh.limit(30));
        const snap = await skh.getDocs(q);
        if (snap.empty) { grid.innerHTML = `<div class="lvx-empty">${ico('video', 28)}<b>${status === 'live' ? 'Hakuna live inayoendelea sasa' : status === 'scheduled' ? 'Hakuna live iliyopangwa' : 'Hakuna live zilizopita'}</b><span>Wauzaji wakianzisha live, zitaonekana hapa.</span></div>`; return; }
        grid.innerHTML = snap.docs.map(d => { const s = d.data(); return `<button class="lvx-card" onclick="skhLiveOpen('${esc(d.id)}')">
            <span class="lvx-card-media">${s.video && s.video.kind === 'embed' ? ico('video', 34) : ico('shop', 34)}<i class="lvx-badge lvx-badge-${esc(s.status)}">${s.status === 'live' ? 'LIVE' : s.status === 'scheduled' ? 'INAKUJA' : 'IMEPITA'}</i></span>
            <span class="lvx-card-body"><small>${esc(KIND_LABEL[s.kind] || 'Live')}</small><b>${esc(s.title)}</b><em>${esc(s.hostName)}</em>
            <span class="lvx-card-meta">${s.status === 'live' ? ico('eye', 13) + ' ' + (s.viewerCount || 0) + ' wanatazama' : (s.productIds || []).length + ' bidhaa'}</span></span></button>`; }).join('');
    } catch (e) { grid.innerHTML = `<div class="lvx-empty"><b>Imeshindikana kupakia</b><span>${esc(errText(e))}</span></div>`; }
}
window.skhLiveClose = function (id) { if (id === 'lvxRoom') leaveRoom(); closeSheet(id); };

/* ---------------- CREATE ---------------- */
window.skhLiveCreateForm = async function () {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const uid = skh.currentUser.uid;
    const el = sheet('lvxCreate', `<div class="lvx-panel lvx-form" role="dialog" aria-label="Anzisha Live">
        <header class="lvx-head"><button class="lvx-icon-btn" onclick="skhLiveClose('lvxCreate')" aria-label="Funga">${ico('back', 18)}</button><div><b>Anzisha Live</b><small>Onyesha bidhaa zako moja kwa moja</small></div></header>
        <label>Aina ya live<select id="lvxKind"><option value="live_commerce">Live Commerce (wanunuzi wanaagiza wakati wa live)</option><option value="live">Live ya kawaida</option><option value="auction">Mnada Live (bidhaa za mnada)</option><option value="price_drop">Bei Kushuka Live (bidhaa za Bei Kushuka)</option></select></label>
        <label>Kichwa<input id="lvxTitle" maxlength="120" placeholder="Mf. Ofa za simu leo jioni"></label>
        <label>Maelezo (hiari)<textarea id="lvxDesc" maxlength="500" rows="2"></textarea></label>
        <div class="lvx-label">Bidhaa zitakazoonyeshwa <small>(zako tu, hadi 20)</small></div><div id="lvxProducts" class="lvx-pick">Inapakia bidhaa zako…</div>
        <label>Link ya video (hiari)<input id="lvxVideo" placeholder="https://youtube.com/live/… au https://vimeo.com/…"><small>SokoHai haina seva ya kurusha video. Rusha kwenye YouTube au Vimeo kisha bandika link hapa; bila link, live inaonyesha bidhaa, bei na maoni kwa wakati halisi.</small></label>
        <label class="lvx-check"><input type="checkbox" id="lvxRec"> Ruhusu rekodi ya live ihifadhiwe baada ya kuisha</label>
        <div class="lvx-actions"><button class="lvx-btn" onclick="skhLiveClose('lvxCreate')">Ghairi</button><button class="lvx-btn lvx-btn-primary" id="lvxCreateGo">Tengeneza live</button></div></div>`);
    try {
        const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', uid), skh.limit(60)));
        const box = document.getElementById('lvxProducts');
        box.innerHTML = snap.empty ? '<span class="lvx-muted">Huna bidhaa bado. Unaweza kuanzisha live ya kawaida bila bidhaa.</span>'
            : snap.docs.map(d => { const p = d.data(); const mode = p.saleMode || (p.modeData || {}).mode || 'free_market';
                return `<label class="lvx-pick-item"><input type="checkbox" value="${esc(d.id)}" data-mode="${esc(mode)}"><span>${esc(p.title || 'Bidhaa')}</span><em>${esc(tsh(p.price))}${mode === 'auction' ? ' · Mnada' : mode === 'price_drop' ? ' · Bei Kushuka' : ''}</em></label>`; }).join('');
    } catch (e) { document.getElementById('lvxProducts').textContent = errText(e); }
    el.querySelector('#lvxCreateGo').onclick = async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true;
        const productIds = [...el.querySelectorAll('#lvxProducts input:checked')].map(i => i.value);
        try {
            const r = await call('liveCreate', { kind: el.querySelector('#lvxKind').value, title: el.querySelector('#lvxTitle').value, description: el.querySelector('#lvxDesc').value,
                productIds, videoUrl: el.querySelector('#lvxVideo').value.trim() || null, recordingAllowed: el.querySelector('#lvxRec').checked });
            closeSheet('lvxCreate'); toast('Live imetengenezwa. Bonyeza "Anza live" ukiwa tayari.', 'success'); window.skhLiveOpen(r.sessionId);
        } catch (e) { toast(friendly(e), 'warn'); btn.disabled = false; }
    };
};

/* ---------------- ROOM ---------------- */
function leaveRoom() {
    if (!room) return;
    room.unsub.forEach(u => { try { u(); } catch (e) {} });
    clearInterval(room.timer);
    if (room.id && room.joined) call('liveLeave', { sessionId: room.id }).catch(() => {});
    room = null;
}
window.skhLiveOpen = async function (sessionId) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    leaveRoom();
    room = { id: sessionId, unsub: [], products: {}, session: null, joined: false };
    renderRoomShell();
    room.unsub.push(skh.onSnapshot(skh.doc(skh.db, 'live_sessions', sessionId), (s) => {
        if (!room || room.id !== sessionId) return;
        if (!s.exists()) { document.getElementById('lvxStage').innerHTML = '<div class="lvx-empty"><b>Live haipatikani</b></div>'; return; }
        const prev = room.session; room.session = Object.assign({ id: s.id }, s.data());
        paintRoom(prev);
    }, (e) => { const st = document.getElementById('lvxStage'); if (st) st.innerHTML = `<div class="lvx-empty"><b>Live haipatikani</b><span>${esc(errText(e))}</span></div>`; }));
    const cq = skh.query(skh.collection(skh.db, 'live_sessions', sessionId, 'comments'), skh.orderBy('createdAt', 'desc'), skh.limit(60));
    room.unsub.push(skh.onSnapshot(cq, (snap) => paintComments(snap.docs.map(d => Object.assign({ id: d.id }, d.data())).reverse()), () => {}));
    try { const r = await call('liveJoin', { sessionId }); if (room) room.joined = r && r.status === 'live'; } catch (e) { /* the room still shows */ }
    room.timer = setInterval(tick, 1000);
};
function renderRoomShell() {
    sheet('lvxRoom', `<div class="lvx-room" role="dialog" aria-label="Chumba cha live">
        <header class="lvx-room-head"><button class="lvx-icon-btn" onclick="skhLiveClose('lvxRoom')" aria-label="Funga">${ico('back', 18)}</button>
          <div class="lvx-room-title" id="lvxTitleBox"><b>Inapakia…</b></div>
          <div class="lvx-room-tools" id="lvxTools"></div></header>
        <div class="lvx-room-body">
          <section class="lvx-stage" id="lvxStage"></section>
          <aside class="lvx-side">
            <div class="lvx-pinned" id="lvxPinned"></div>
            <div class="lvx-products" id="lvxProductList"></div>
            <div class="lvx-chat"><div class="lvx-chat-list" id="lvxComments" aria-live="polite"></div>
              <form class="lvx-chat-form" id="lvxChatForm"><input id="lvxChatInput" maxlength="300" placeholder="Andika swali au maoni…" autocomplete="off"><button class="lvx-btn lvx-btn-primary" aria-label="Tuma">${ico('send', 16)}</button></form></div>
          </aside></div></div>`);
    document.getElementById('lvxChatForm').onsubmit = async (e) => {
        e.preventDefault(); const i = document.getElementById('lvxChatInput'); const text = i.value.trim(); if (!text || !room) return;
        i.value = '';
        try { await call('liveComment', { sessionId: room.id, text, clientId: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }); }
        catch (er) { i.value = text; toast(friendly(er), 'warn'); }
    };
}
async function loadProduct(pid) {
    if (room.products[pid]) return room.products[pid];
    try { const s = await skh.getDoc(skh.doc(skh.db, 'products', pid)); room.products[pid] = s.exists() ? Object.assign({ id: s.id }, s.data()) : null; } catch (e) { room.products[pid] = null; }
    return room.products[pid];
}
function isHost() { return !!(room && room.session && skh.currentUser && skh.currentUser.uid === room.session.hostUid); }
async function paintRoom(prev) {
    const s = room.session;
    document.getElementById('lvxTitleBox').innerHTML = `<b>${esc(s.title)}</b><small>${esc(s.hostName)} · ${esc(KIND_LABEL[s.kind] || 'Live')} · <span class="lvx-badge lvx-badge-${esc(s.status)}">${s.status === 'live' ? 'LIVE' : s.status === 'scheduled' ? 'INAKUJA' : s.status === 'ended' ? 'IMEKWISHA' : 'IMEONDOLEWA'}</span> · ${ico('eye', 12)} ${s.viewerCount || 0}</small>`;
    const tools = [];
    if (isHost()) {
        if (s.status === 'scheduled') tools.push(`<button class="lvx-btn lvx-btn-primary" onclick="skhLiveHost('start')">Anza live</button>`);
        if (s.status === 'live' || s.status === 'scheduled') tools.push(`<button class="lvx-btn lvx-btn-danger" onclick="skhLiveHost('end')">Maliza live</button>`);
    } else tools.push(`<button class="lvx-btn" onclick="skhLiveReport()">${ico('alert', 14)} Ripoti</button>`);
    document.getElementById('lvxTools').innerHTML = tools.join('');
    if (!prev || prev.video?.url !== s.video?.url || prev.status !== s.status) {
        const stage = document.getElementById('lvxStage');
        const url = s.status === 'ended' && s.recordingUrl ? s.recordingUrl : (s.video && s.video.kind === 'embed' ? s.video.url : null);
        stage.innerHTML = url && s.status !== 'removed'
            ? `<iframe class="lvx-video" src="${esc(url)}" title="Video ya live" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
            : `<div class="lvx-showcase" id="lvxShowcase"></div>`;
    }
    const ids = s.productIds || [];
    await Promise.all(ids.map(loadProduct));
    if (!room) return;
    document.getElementById('lvxProductList').innerHTML = ids.length ? `<div class="lvx-label">Bidhaa kwenye live (${ids.length})</div>` + ids.map(pid => { const p = room.products[pid]; if (!p) return '';
        return `<div class="lvx-prod ${pid === s.pinnedProductId ? 'on' : ''}"><img src="${esc(p.image || (p.imagesArray || [])[0] || '')}" alt="" loading="lazy"><span><b>${esc(p.title)}</b><em data-lvx-price="${esc(pid)}">${esc(tsh(listPrice(p)))}</em></span>
          <button class="lvx-btn" onclick="skhLiveOpenProduct('${esc(pid)}')">Fungua</button>${isHost() && pid !== s.pinnedProductId && s.status !== 'ended' ? `<button class="lvx-btn" onclick="skhLiveHost('pin','${esc(pid)}')">Onyesha</button>` : ''}</div>`; }).join('') : '';
    paintPinned();
}
function paintPinned() {
    if (!room || !room.session) return;
    const s = room.session, p = room.products[s.pinnedProductId];
    const box = document.getElementById('lvxPinned'); const show = document.getElementById('lvxShowcase');
    if (!p) { box.innerHTML = ''; if (show) show.innerHTML = `<div class="lvx-empty">${ico('video', 30)}<b>${esc(s.hostName)}</b><span>${s.status === 'scheduled' ? 'Live itaanza hivi karibuni.' : 'Maoni na maswali yanaonekana upande wa kulia.'}</span></div>`; return; }
    const mode = p.saleMode || (p.modeData || {}).mode;
    const img = p.image || (p.imagesArray || [])[0] || '';
    let price = `<div class="lvx-price">${esc(tsh(p.price))}</div>`, extra = '';
    if (mode === 'price_drop') { const d = dropPrice(p, Date.now()); price = `<div class="lvx-price">${esc(tsh(d.price))} <s>${esc(tsh(p.price))}</s></div>`; extra = `<div class="lvx-meta" id="lvxDropMeta"></div>`; }
    if (mode === 'auction') { price = `<div class="lvx-price" id="lvxBidNow"></div>`; extra = `<div class="lvx-meta" id="lvxAucMeta"></div><div class="lvx-bid" id="lvxBidBox"></div><div class="lvx-bids" id="lvxBids"></div>`; }
    const html = `<div class="lvx-pin-card">${img ? `<img src="${esc(img)}" alt="">` : ''}<div><small>${mode === 'auction' ? 'Mnada' : mode === 'price_drop' ? 'Bei Kushuka' : 'Inaonyeshwa sasa'}</small><b>${esc(p.title)}</b>${price}${extra}
        <div class="lvx-actions">${mode === 'auction' ? '' : `<button class="lvx-btn lvx-btn-primary" onclick="skhLiveOpenProduct('${esc(p.id)}')">${ico('cart', 15)} Agiza / Weka kwenye kikapu</button>`}</div></div></div>`;
    box.innerHTML = html;
    if (show) show.innerHTML = `<div class="lvx-show-big">${img ? `<img src="${esc(img)}" alt="">` : ''}<b>${esc(p.title)}</b></div>`;
    if (mode === 'auction') watchAuction(p.id);
    tick();
}
function watchAuction(pid) {
    if (room.auctionId === pid) return;
    room.auctionId = pid;
    room.unsub.push(skh.onSnapshot(skh.doc(skh.db, 'products', pid), (s) => { if (room && s.exists()) { room.products[pid] = Object.assign({ id: s.id }, s.data()); tick(); } }, () => {}));
    room.unsub.push(skh.onSnapshot(skh.query(skh.collection(skh.db, 'products', pid, 'bids'), skh.orderBy('amount', 'desc'), skh.limit(10)), (snap) => {
        const el = document.getElementById('lvxBids'); if (!el) return;
        el.innerHTML = snap.empty ? '<span class="lvx-muted">Hakuna zabuni bado.</span>' : '<div class="lvx-label">Historia ya zabuni</div>' + snap.docs.map((d, i) => { const b = d.data(); return `<div class="lvx-bid-row"><i>${i + 1}</i><span>${esc(String(b.name || 'Mteja').replace(/^(.)(.*)(.)$/, (m, a, mid, z) => a + '•'.repeat(Math.min(4, mid.length)) + z))}</span><b>${esc(tsh(b.amount))}</b></div>`; }).join('');
    }, () => {}));
}
function tick() {
    if (!room || !room.session) return;
    const p = room.products[room.session.pinnedProductId]; if (!p) return;
    const mode = p.saleMode || (p.modeData || {}).mode, md = p.modeData || {}, now = Date.now();
    document.querySelectorAll('#lvxProductList [data-lvx-price]').forEach(e => { if (e.dataset.lvxPrice === p.id) e.textContent = tsh(listPrice(p)); }); // list follows the live price / current bid
    if (mode === 'price_drop') {
        const el = document.getElementById('lvxDropMeta'); if (!el) return;
        const ended = Number(md.endTime) > 0 && now >= Number(md.endTime), notYet = Number(md.startTime) > now;
        const d = dropPrice(p, now);
        const pe = document.querySelector('#lvxPinned .lvx-price'); if (pe) pe.innerHTML = `${esc(tsh(d.price))} <s>${esc(tsh(p.price))}</s> <em>-${Math.round((1 - d.price / (Number(p.price) || 1)) * 100)}%</em>`;
        el.innerHTML = notYet ? 'Ofa inaanza baada ya ' + fmtLeft(Number(md.startTime) - now) : ended ? 'Ofa imekwisha' : d.atFloor ? 'Bei ya mwisho imefikiwa' + (md.endTime ? ' · inaisha baada ya ' + fmtLeft(Number(md.endTime) - now) : '')
            : 'Inashuka tena baada ya ' + fmtLeft(d.nextIn) + (md.maxPerBuyer ? ' · kikomo: ' + md.maxPerBuyer + ' kwa mnunuzi' : '') + ' · zipo ' + (Number(p.stock) || 0);
    }
    if (mode === 'auction') {
        const cur = Number(md.currentBid) > 0 ? Number(md.currentBid) : Number(p.price) || 0;
        const pct = Number(md.minIncrementPct) > 0 ? Number(md.minIncrementPct) : 5, abs = Number(md.minIncrement) || 0;
        const minNext = Math.round(cur + Math.max(abs, Math.ceil(cur * pct / 100)));
        const left = (Number(md.endTime) || 0) - now, ended = md.ended || left <= 0, mine = skh.currentUser && md.maxBidder === skh.currentUser.uid;
        const bn = document.getElementById('lvxBidNow'); if (bn) bn.innerHTML = `${esc(tsh(cur))} <small>${md.totalBids ? md.totalBids + ' zabuni' : 'bei ya kuanzia'}</small>`;
        const am = document.getElementById('lvxAucMeta'); if (am) am.innerHTML = ended ? (md.winnerId ? 'Mnada umekwisha · mshindi: ' + esc(md.winnerName || md.maxBidderName || 'mteja') : 'Mnada umekwisha') : 'Muda uliobaki: <b>' + fmtLeft(left) + '</b>' + (md.extensions ? ' · umeongezwa mara ' + md.extensions : '');
        const bb = document.getElementById('lvxBidBox');
        if (bb && bb.dataset.state !== (ended ? 'ended' : 'open') + (mine ? 'm' : '')) {
            bb.dataset.state = (ended ? 'ended' : 'open') + (mine ? 'm' : '');
            bb.innerHTML = ended ? (skh.currentUser && md.winnerId === skh.currentUser.uid ? `<button class="lvx-btn lvx-btn-gold" onclick="skhLiveOpenProduct('${esc(p.id)}')">Umeshinda — lipia sasa</button>` : '')
                : mine ? '<span class="lvx-ok">Unaongoza mnada</span>' : `<input id="lvxBidIn" inputmode="numeric" placeholder="${minNext}"><button class="lvx-btn lvx-btn-gold" onclick="skhLiveBid('${esc(p.id)}')">Weka zabuni</button>`;
        }
        const bi = document.getElementById('lvxBidIn'); if (bi && !bi.value) bi.placeholder = 'Angalau ' + minNext.toLocaleString('en-US');
        if (ended && !md.endNotified && !room.finalizing) { room.finalizing = true; call('auctionFinalize', { productId: p.id }).catch(() => {}); }
    }
}
window.skhLiveBid = async function (pid) {
    const i = document.getElementById('lvxBidIn'); const amount = Math.round(Number(String(i && i.value || '').replace(/[^\d]/g, '')));
    if (!(amount > 0)) return toast('Andika kiasi cha zabuni.', 'warn');
    const btn = i.nextElementSibling; btn.disabled = true;
    try { const r = await call('auctionPlaceBid', { productId: pid, amount, clientBidId: 'b' + Date.now().toString(36), bidderName: (skh.currentUser && skh.currentUser.displayName) || undefined });
        toast(r.extended ? 'Zabuni imepokelewa. Muda umeongezwa dakika 2.' : 'Zabuni imepokelewa.', 'success'); i.value = ''; }
    catch (e) { toast(friendly(e), 'warn'); } finally { btn.disabled = false; }
};
function paintComments(list) {
    const el = document.getElementById('lvxComments'); if (!el) return;
    const host = isHost();
    el.innerHTML = list.filter(c => c.status !== 'removed' || host).map(c => `<div class="lvx-c lvx-c-${esc(c.kind || 'comment')} ${c.status === 'removed' ? 'is-removed' : ''}">
        ${c.kind === 'comment' ? `<b>${esc(c.name || 'Mteja')}</b> ` : ''}<span>${esc(c.text)}</span>
        ${host && c.kind === 'comment' && c.uid !== skh.currentUser.uid && c.status !== 'removed' ? `<span class="lvx-c-tools"><button onclick="skhLiveMod('remove_comment','${esc(c.id)}')" title="Ondoa ujumbe">${ico('trash', 12)}</button><button onclick="skhLiveMod('mute','${esc(c.uid)}')" title="Zuia mtumiaji">${ico('lock', 12)}</button></span>` : ''}</div>`).join('')
        || '<span class="lvx-muted">Hakuna maoni bado. Uliza swali la kwanza.</span>';
    el.scrollTop = el.scrollHeight;
}
window.skhLiveMod = async function (action, target) {
    if (!room) return;
    try { await call('liveModerate', Object.assign({ sessionId: room.id, action }, action === 'remove_comment' ? { commentId: target } : { uid: target })); toast(action === 'mute' ? 'Mtumiaji amezuiwa kwenye live hii.' : 'Ujumbe umeondolewa.', 'success'); }
    catch (e) { toast(friendly(e), 'warn'); }
};
window.skhLiveHost = async function (what, pid) {
    if (!room) return;
    try {
        if (what === 'start') { await call('liveStart', { sessionId: room.id }); await call('liveJoin', { sessionId: room.id }).then(() => { room.joined = true; }).catch(() => {}); }
        if (what === 'end') { if (!window.confirm('Maliza live sasa?')) return; const rec = room.session.recordingAllowed ? window.prompt('Link ya rekodi (YouTube/Vimeo), hiari:', '') : ''; await call('liveEnd', { sessionId: room.id, recordingUrl: rec || null }); }
        if (what === 'pin') await call('livePin', { sessionId: room.id, productId: pid });
    } catch (e) { toast(friendly(e), 'warn'); }
};
window.skhLiveReport = async function () {
    if (!room) return;
    const reason = window.prompt('Eleza tatizo la live hii (mf. bidhaa za uongo, lugha mbaya):', '');
    if (!reason) return;
    try { await call('liveReport', { sessionId: room.id, reason }); toast('Asante. Ripoti imetumwa kwa wasimamizi.', 'success'); } catch (e) { toast(friendly(e), 'warn'); }
};
/* Product sheet opens ABOVE the room (the live keeps running underneath); variants, quantity,
 * cart, orders and SokoPay are the existing ones. */
window.skhLiveOpenProduct = function (pid) { if (typeof window.openProduct === 'function') window.openProduct(pid, 'products'); };

/* ---------------- Mnada page / room for one product (no live session needed) ---------------- */
window.skhAuctionRoom = async function (productId) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    leaveRoom();
    room = { id: null, unsub: [], products: {}, session: null, joined: false };
    renderRoomShell();
    document.getElementById('lvxChatForm').hidden = true;
    const p = await loadProduct(productId);
    if (!room) return;
    room.session = { title: p ? p.title : 'Mnada', hostName: p ? (p.ownerName || p.sellerName || 'Muuzaji') : '', kind: 'auction', status: 'live', productIds: [productId], pinnedProductId: productId, video: { kind: 'none' }, viewerCount: 0 };
    paintRoom(null);
    document.getElementById('lvxComments').innerHTML = '<span class="lvx-muted">Zabuni zote zinaonekana kwa wakati halisi. Mshindi ana saa 24 kulipia kupitia SokoPay; asipolipa, nafasi inapewa mshiriki anayefuata.</span>';
    document.getElementById('lvxTools').innerHTML = '';
    room.timer = setInterval(tick, 1000);
};

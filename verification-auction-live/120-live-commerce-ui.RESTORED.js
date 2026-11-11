/* ==== js/app/120-live-commerce-ui.js ==== */
/* [R13-D 2026-11] Live, Live Commerce, Mnada Live, Bei Kushuka Live — built to the owner's
 * design references:
 *   ref 10  Live Commerce & Deals hub (LIVE SASA / YANAYOKUJA / DEALS, typed cards + CTA)
 *   ref 7   Live Auction Room (full-screen, LIVE + WATAZAMAJI pills, host + Fuata, product
 *           card, comments over the video, Likes / Share, WEKA ZABUNI + "Inayokubalika")
 *   ref 5   bid confirmation, outbid, winner announcement, Zabuni zangu
 *   ref 1/2 Bei Kushuka: price engine panel, Weka bei yako, Viongozi na nafasi, mwisho wa
 *           kampeni + fursa ya kununua
 *   ref 6   "Live na fursa za soko" on Nyumbani + auction panel on the product page
 *
 *  window.skhLiveHub(tab)            hub
 *  window.skhLiveOpen(sessionId)     live room of a session
 *  window.skhAuctionRoom(productId)  auction room for one product (no session needed)
 *  window.skhPriceDropRoom(productId) Bei Kushuka campaign room for one product
 *  window.skhLiveCreateForm()        seller starts a live (own products only)
 *  window.skhMyBids()                Zabuni zangu
 *
 * Every write goes through the server callables; cart, orders, inventory and SokoPay are the
 * existing ones. No fabricated viewers, likes, bids or comments: everything shown is a record. */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tsh = (n) => 'TSh ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const ALIAS = { award: 'trophy', chevron: 'arrow-right', zap: 'bolt' };
const EXTRA = {   // stroke icons not in js/18-icons.js
    radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>' };
const ico = (n, s) => { s = s || 16; if (EXTRA[n]) return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + EXTRA[n] + '</svg>'; return window.skhNavIcon ? window.skhNavIcon(ALIAS[n] || n, s) : ''; };
const toast = (m, k) => { try { if (window.sokohaiToast) return window.sokohaiToast(m, k || 'info', 3500); } catch (e) {} console.log(m); };
const errText = (e) => (window.skhFnErrText ? window.skhFnErrText(e) : (e && e.message) || 'Hitilafu');
const call = (n, d) => skh.callFunction(n, d).then(r => (r && r.data) || r);
const me = () => (skh.currentUser && skh.currentUser.uid) || null;
const kshort = (n) => { n = Number(n) || 0; return n >= 1000 ? (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'k' : String(n); };
const photo = (p) => (p && (p.image || (Array.isArray(p.imagesArray) && p.imagesArray[0]))) || '';
const modeOf = (p) => (p && (p.saleMode || (p.modeData || {}).mode)) || 'free_market';
const initials = (n) => String(n || 'M').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('') || 'M';
const LOGO = 'assets/img/sokohai-logo.png';
const ERR = { si_bidhaa_yako: 'Unaweza kuonyesha bidhaa zako tu.', si_mnada: 'Mnada Live inahitaji bidhaa za mnada.', si_bei_kushuka: 'Bei Kushuka Live inahitaji bidhaa za Bei Kushuka.',
    video_haikubaliki: 'Link ya video haikubaliki. Tumia link ya YouTube au Vimeo.', chagua_bidhaa: 'Chagua angalau bidhaa moja.', subiri_kidogo: 'Subiri sekunde mbili kabla ya kutuma tena.',
    umezuiwa_kwenye_live: 'Mwenyeji amekuzuia kutoa maoni kwenye live hii.', live_haiendelei: 'Live haiendelei sasa.', akaunti_imesimamishwa: 'Akaunti yako imesimamishwa.',
    waliokuzidi: 'Zabuni iko chini ya kiwango kinachokubalika.', mnada_umefungwa: 'Mnada umefungwa.', mnada_haujaanza: 'Mnada haujaanza bado.', tangazo_lako: 'Huwezi kushiriki ofa ya bidhaa yako.',
    tayari_unaongoza: 'Tayari unaongoza mnada.', juu_ya_bei_ya_sasa: 'Bei yako iko juu ya bei ya sasa.', chini_ya_bei_ya_mwisho: 'Bei yako iko chini ya bei ya mwisho.',
    kampeni_imeisha: 'Kampeni imeisha.', kampeni_haijaanza: 'Kampeni haijaanza bado.', stock_haitoshi: 'Idadi uliyoomba haipo kwenye stock.',
    /* [AUCTION-LIVE] pause / bid states */
    mnada_umesitishwa: 'Mnada umesitishwa na mwenyeji kwa muda. Subiri uendelee.', live_imesitishwa: 'Live imesitishwa kwa muda na mwenyeji.',
    mnada_una_zabuni: 'Mnada una zabuni tayari \u2014 hauwezi kusitishwa.' };
const friendly = (e) => { const m = errText(e);
    /* [LIVE-UX 2026-11-10] Missing-index: ujumbe safi kwa mtumiaji; URL ndefu
       ya console inaenda console pekee (mmiliki). */
    if (/requires an index|failed-precondition|needs an index/i.test(m)) {
        try { const u = (m.match(/https?:\/\/[^\s)]+/) || [])[0]; if (u) console.info('[SokoHai Live] index inayohitajika:', u); } catch (_) {}
        return 'Huduma ya Live bado haijaamilishwa kikamilifu. Tafadhali rudi baadaye.';
    }
    const k = Object.keys(ERR).find(x => m.indexOf(x) !== -1); if (!k) return m; const n = (m.match(/:(\d+)/) || [])[1]; return ERR[k] + (n ? ' (' + tsh(n) + ')' : ''); };

/* same formula as functions/pricing-core.js (checkout re-prices on the server anyway) */
function dropPrice(p, now) {
    const md = p.modeData || {}, base = Number(p.price) || 0;
    const start = Number(md.startTime) || now, interval = Number(md.intervalMs) || 60000, drop = Number(md.dropAmount) || 0, min = Number(md.minPrice) || 0;
    const steps = Math.max(0, Math.floor((now - start) / interval));
    const price = Math.max(min, Math.round(base - steps * drop));
    return { price, base, min, nextIn: interval - ((now - start) % interval), atFloor: base - steps * drop <= min,
        pct: base > min ? Math.max(0, Math.min(100, Math.round((base - price) / (base - min) * 100))) : 100 };
}
function auctionState(p, now) {
    const md = p.modeData || {};
    const cur = Number(md.currentBid) > 0 ? Number(md.currentBid) : Number(p.price) || 0;
    const pct = Number(md.minIncrementPct) > 0 ? Number(md.minIncrementPct) : 5, abs = Number(md.minIncrement) || 0;
    const left = (Number(md.endTime) || 0) - now;
    const winner = md.winnerId !== undefined ? md.winnerId : (md.ended ? md.maxBidder : null);
    /* [AUCTION-LIVE] paused / distinct bidders / anti-sniping extensions / ending-soon (server values) */
    const paused = md.livePaused === true, bidders = parseInt(md.bidderCount, 10) || 0, extensions = parseInt(md.extensions, 10) || 0;
    const ended = !!md.ended || left <= 0;
    return { cur, minNext: Math.round(cur + Math.max(abs, Math.ceil(cur * pct / 100))), left, ended, notStarted: Number(md.startTime) > now,
        leader: md.maxBidder || null, winner, winBid: Number(md.winnerBid) > 0 ? Number(md.winnerBid) : cur, bids: Number(md.totalBids) || 0, deadline: Number(md.paymentDeadline) || 0,
        paused, bidders, extensions, endingSoon: !ended && left > 0 && left <= 60000, md };
}
const dropEnded = (p, now) => { const md = p.modeData || {}; return !!md.stopped || (Number(md.endTime) > 0 && now >= Number(md.endTime)); };
/* group-buy display state (mirror of pricing-core; checkout re-prices on the server) */
function groupState(p, now) {
    const md = p.modeData || {}, base = Number(p.price) || 0;
    const joined = parseInt(md.joinedUsers, 10) || 1, target = parseInt(md.targetPeople, 10) || 10;
    const discVal = parseFloat(md.discountValue) || 0, extra = Math.max(0, joined - 1);
    const price = (md.discountType === 'percent') ? base - (base * Math.min(90, discVal * extra) / 100) : Math.max(base * 0.1, base - (discVal * extra));
    const endsAt = Number(md.endTime) || 0, timedOut = endsAt > 0 && now >= endsAt;
    const parts = Array.isArray(md.participants) ? md.participants : [];
    return { joined, target, price: Math.max(0, Math.round(price)), base, endsAt, left: Math.max(0, endsAt - now),
        status: joined >= target ? 'successful' : (timedOut ? 'failed' : 'active'), parts, md };
}
const fmtLeft = (ms) => { if (!(ms > 0)) return '00:00'; const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
function listPrice(p) { const m = modeOf(p); if (m === 'price_drop') return dropPrice(p, Date.now()).price; if (m === 'auction') return auctionState(p, Date.now()).cur; return Number(p.price) || 0; }

function sheet(id, html, cls) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    el.className = 'lvx-overlay ' + (cls || ''); el.innerHTML = html; el.hidden = false; el.style.display = '';
    document.body.classList.add('lvx-open');
    return el;
}
function closeSheet(id) { const el = document.getElementById(id); if (el) { el.hidden = true; el.innerHTML = ''; } if (!document.querySelector('.lvx-overlay:not([hidden])')) document.body.classList.remove('lvx-open'); }
window.skhLiveClose = function (id) { if (id === 'lvxRoom') leaveRoom(); closeSheet(id); };
async function getProduct(pid) { try { const s = await skh.getDoc(skh.doc(skh.db, 'products', pid)); return s.exists() ? Object.assign({ id: s.id, collectionName: 'products' }, s.data()) : null; } catch (e) { return null; } }

/* small centred dialog (ref 5 / ref 1 pop-ups) */
function modal(html, cls) {
    let el = document.getElementById('lvModal');
    if (!el) { el = document.createElement('div'); el.id = 'lvModal'; document.body.appendChild(el); }
    el.className = 'lv-modal ' + (cls || ''); el.hidden = false; el.style.display = '';   // the app's closeModals() may have set display:none
    el.innerHTML = `<div class="lv-modal-card" role="dialog" aria-modal="true"><button class="lv-modal-x" onclick="skhLvModalClose()" aria-label="Funga">${ico('x', 16)}</button>${html}</div>`;
    el.onclick = (e) => { if (e.target === el) window.skhLvModalClose(); };
    return el;
}
window.skhLvModalClose = function () { const el = document.getElementById('lvModal'); if (el) { el.hidden = true; el.innerHTML = ''; } };

/* ======================================================================
 * HUB — ref 10
 * ==================================================================== */
const TYPE = {
    auction: { badge: 'MNADA LIVE', cls: 'g', cta: 'FUNGUA MNADA' },
    price_drop: { badge: 'LIVE PRICE DROP', cls: 'b', cta: 'ANGALIA LIVE' },
    live: { badge: 'LIVE YA MUUZAJI', cls: 'y', cta: 'INGIA LIVE' }
};
const kindOf = (s) => (s.kind === 'auction' ? 'auction' : s.kind === 'price_drop' ? 'price_drop' : 'live');
let hubTimer = 0;
window.skhLiveHub = function (tab) {
    const el = sheet('lvxHub', `<div class="lvh" role="dialog" aria-label="Live na Fursa za Soko">
        <header class="lvh-head"><button class="lvh-back" onclick="skhLiveClose('lvxHub')" aria-label="Rudi">${ico('back', 18)}</button>
          <div class="lvh-title"><b>Live na Fursa za Soko</b><small>Mnada Live, Live Price Drop na Live za wauzaji</small></div>
          <div class="lvh-acts"><button class="lvh-ghost" onclick="skhMyBids()">${ico('gavel', 15)} Zabuni zangu</button><button class="lvh-gold" onclick="skhLiveCreateForm()">${ico('video', 15)} Anzisha Live</button></div></header>
        <nav class="lvh-tabs" role="tablist"><button data-t="live">LIVE SASA</button><button data-t="scheduled">YANAYOKUJA</button><button data-t="deals">DEALS</button></nav>
        <div class="lvh-grid" id="lvxHubGrid"></div></div>`, 'lvh-ov');
    const tabs = el.querySelectorAll('.lvh-tabs button');
    const go = (t) => { tabs.forEach(x => x.classList.toggle('on', x.dataset.t === t)); loadHub(t); };
    tabs.forEach(b => b.onclick = () => go(b.dataset.t));
    go(tab || 'live');
    clearInterval(hubTimer); hubTimer = setInterval(tickHub, 1000);
};
function tickHub() {
    const g = document.getElementById('lvxHubGrid'); if (!g) { clearInterval(hubTimer); return; }
    const now = Date.now();
    g.querySelectorAll('[data-lvh-end]').forEach(e => { const end = Number(e.dataset.lvhEnd); e.textContent = end ? fmtLeft(end - now) : '—'; });
}
function cardHtml(o) {   // o: {kind, title, img, sub, rows, cta, onclick, extra}
    const T = TYPE[o.kind];
    return `<article class="lvh-card">
        <div class="lvh-media">${o.img ? `<img src="${esc(o.img)}" alt="${esc(o.title)}" loading="lazy" onerror="this.remove()">` : `<span class="lvh-noimg">${ico('video', 34)}</span>`}
          <span class="lvh-badge lvh-${T.cls}">${ico('zap', 13)} ${T.badge}</span>${o.kind === 'live' ? `<span class="lvh-cam">${ico('video', 18)}</span>` : ''}</div>
        <div class="lvh-body"><h3>${esc(o.title)}</h3>${o.sub ? `<p class="lvh-sub">${esc(o.sub)}</p>` : ''}${o.rows}</div>
        <button class="lvh-cta lvh-${T.cls}" onclick="${o.onclick}">${o.cta || T.cta}</button></article>`;
}
function auctionRows(p, viewers) {
    const a = auctionState(p, Date.now());
    return `<small class="lvh-k">Zabuni ya sasa</small><strong class="lvh-big">${esc(tsh(a.cur))}</strong>
        <div class="lvh-row"><span>Muda: <b data-lvh-end="${Number(a.md.endTime) || 0}">${fmtLeft(a.left)}</b></span><span>Watazamaji: <b>${kshort(viewers)}</b></span></div>`;
}
function dropRows(p) {
    const d = dropPrice(p, Date.now()), md = p.modeData || {};
    return `<div class="lvh-two"><div><small>Sasa</small><b>${esc(tsh(d.price))}</b></div><div><small>Lengo</small><b>${esc(tsh(d.min))}</b></div></div>
        <div class="lvh-prog"><i style="width:${d.pct}%"></i></div><div class="lvh-pct">${d.pct}%</div>
        <div class="lvh-row"><span>Muda: <b data-lvh-end="${Number(md.endTime) || 0}">${fmtLeft(Number(md.endTime) - Date.now())}</b></span><span>Hali: <b>${d.atFloor ? 'Bei ya mwisho' : 'Kushuka'}</b></span></div>`;
}
async function loadHub(t) {
    const grid = document.getElementById('lvxHubGrid'); if (!grid) return;
    grid.className = 'lvh-grid' + (t === 'scheduled' ? ' lvh-grid--up' : '');
    grid.innerHTML = `<div class="lvh-empty">Inapakia…</div>`;
    try {
        if (t === 'deals') return await loadDeals(grid);
        /* [AUCTION-LIVE] paused lives stay visible under LIVE SASA with a tag. */
        const sts = t === 'live' ? ['live', 'paused'] : [t];
        const snaps = await Promise.all(sts.map(st => skh.getDocs(skh.query(skh.collection(skh.db, 'live_sessions'), skh.where('status', '==', st), skh.orderBy('updatedAt', 'desc'), skh.limit(30)))));
        const sessions = snaps.reduce((acc, x) => acc.concat(x.docs.map(d => Object.assign({ id: d.id }, d.data()))), []);
        if (!sessions.length) { grid.innerHTML = `<div class="lvh-empty">${ico('video', 30)}<b>${t === 'live' ? 'Hakuna live inayoendelea sasa' : 'Hakuna live zilizopangwa'}</b><span>Wauzaji wakianzisha live, zitaonekana hapa. ${t === 'live' ? 'Angalia "Deals" kwa ofa za Bei Kushuka na minada.' : ''}</span></div>`; return; }
        const prods = await Promise.all(sessions.map(s => (s.pinnedProductId || (s.productIds || [])[0]) ? getProduct(s.pinnedProductId || s.productIds[0]) : null));
        if (t === 'scheduled') {
            const mine = me();
            const rem = await Promise.all(sessions.map(s => mine ? skh.getDoc(skh.doc(skh.db, 'live_sessions', s.id, 'reminders', mine)).then(x => x.exists()).catch(() => false) : false));
            grid.innerHTML = `<h4 class="lvh-sec">Yanayokuja</h4>` + sessions.map((s, i) => `<article class="lvh-up"><div class="lvh-up-img">${photo(prods[i]) ? `<img src="${esc(photo(prods[i]))}" alt="" loading="lazy">` : ico('video', 22)}</div>
                <div><b>${esc(s.title)}</b><small>${esc(s.hostName)} · ${esc(TYPE[kindOf(s)].badge)}</small><span>Muda: ${s.scheduledAt ? new Date(s.scheduledAt).toLocaleString('sw-TZ', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Hivi karibuni'}</span></div>
                <div class="lvh-up-acts"><button class="lvh-pill ${rem[i] ? 'on' : ''}" onclick="skhLiveRemind('${esc(s.id)}', this)">${ico('bell', 14)} ${rem[i] ? 'Ukumbusho umewekwa' : 'Ukumbusho'}</button>
                <button class="lvh-pill" onclick="skhLiveOpen('${esc(s.id)}')">${ico('eye', 14)} Fungua</button></div></article>`).join('');
            return;
        }
        grid.innerHTML = sessions.map((s, i) => {
            const p = prods[i], k = kindOf(s);
            const ptag = s.status === 'paused' ? `<span class="lvh-pausedtag">\u23f8 IMESITISHWA</span>` : '';
            if (k === 'auction' && p) return cardHtml({ kind: k, title: p.title, img: photo(p), rows: ptag + auctionRows(p, s.viewerCount), onclick: `skhLiveOpen('${esc(s.id)}')` });
            if (k === 'price_drop' && p) return cardHtml({ kind: k, title: p.title, img: photo(p), rows: ptag + dropRows(p), onclick: `skhLiveOpen('${esc(s.id)}')` });
            return cardHtml({ kind: 'live', title: s.title, img: photo(p), sub: s.description || (p ? 'Inaonyesha: ' + p.title : s.hostName),
                rows: ptag + `<div class="lvh-three"><div><small>Watazamaji</small><b>${kshort(s.viewerCount)}</b></div><div><small>Muuzaji</small><b>${esc(s.hostName)}</b></div><span class="lvh-livetag">${ico('radio', 14)} LIVE</span></div>`,
                onclick: `skhLiveOpen('${esc(s.id)}')` });
        }).join('');
    } catch (e) { grid.innerHTML = `<div class="lvh-empty"><b>Imeshindikana kupakia</b><span>${esc(friendly(e))}</span></div>`; }
}
async function loadDeals(grid) {
    const now = Date.now();
    const [pd, au] = await Promise.all(['price_drop', 'auction'].map(m => skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.where('saleMode', '==', m), skh.limit(40))).catch(() => ({ docs: [] }))));
    const list = [];
    pd.docs.forEach(d => { const p = Object.assign({ id: d.id }, d.data()); if (!dropEnded(p, now) && !(Number((p.modeData || {}).startTime) > now)) list.push(['price_drop', p]); });
    au.docs.forEach(d => { const p = Object.assign({ id: d.id }, d.data()); if (!auctionState(p, now).ended) list.push(['auction', p]); });
    if (!list.length) { grid.innerHTML = `<div class="lvh-empty">${ico('tag', 30)}<b>Hakuna deals kwa sasa</b><span>Ofa za Bei Kushuka na minada inayoendelea zitaonekana hapa.</span></div>`; return; }
    grid.innerHTML = `<h4 class="lvh-sec">Deals</h4>` + list.map(([k, p]) => k === 'price_drop'
        ? cardHtml({ kind: k, title: p.title, img: photo(p), rows: dropRows(p), cta: 'ANGALIA KAMPENI', onclick: `skhPriceDropRoom('${esc(p.id)}')` })
        : cardHtml({ kind: k, title: p.title, img: photo(p), rows: auctionRows(p, (p.modeData || {}).totalBids ? 0 : 0).replace(/Watazamaji: <b>0<\/b>/, 'Zabuni: <b>' + (Number((p.modeData || {}).totalBids) || 0) + '</b>'), onclick: `skhAuctionRoom('${esc(p.id)}')` })).join('');
}
window.skhLiveRemind = async function (sid, btn) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const on = !btn.classList.contains('on');
    try { await call('liveRemind', { sessionId: sid, on }); btn.classList.toggle('on', on); btn.innerHTML = ico('bell', 14) + (on ? ' Ukumbusho umewekwa' : ' Ukumbusho'); toast(on ? 'Tutakujulisha live ikianza.' : 'Ukumbusho umeondolewa.', 'success'); }
    catch (e) { toast(friendly(e), 'warn'); }
};

/* ======================================================================
 * CREATE (seller)
 * ==================================================================== */
window.skhLiveCreateForm = async function () {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const uid = me();
    const el = sheet('lvxCreate', `<div class="lvx-panel lvx-form" role="dialog" aria-label="Anzisha Live">
        <header class="lvx-head"><button class="lvx-icon-btn" onclick="skhLiveClose('lvxCreate')" aria-label="Funga">${ico('back', 18)}</button><div><b>Anzisha Live</b><small>Onyesha bidhaa zako moja kwa moja</small></div></header>
        <label>Aina ya live<select id="lvxKind"><option value="live_commerce">Live ya muuzaji (wanunuzi wanaagiza wakati wa live)</option><option value="auction">Mnada Live (bidhaa za mnada)</option><option value="price_drop">Live Price Drop (bidhaa za Bei Kushuka)</option><option value="live">Live ya kawaida</option></select></label>
        <label>Kichwa<input id="lvxTitle" maxlength="120" placeholder="Mf. Muuza Nguo Maridadi: Mkusanyiko Mpya"></label>
        <label>Maelezo (hiari)<textarea id="lvxDesc" maxlength="500" rows="2"></textarea></label>
        <label>Itaanza lini (hiari)<input id="lvxWhen" type="datetime-local"><small>Ukiweka muda, live itaonekana "Yanayokuja" na wanunuzi wanaweza kuweka ukumbusho.</small></label>
        <div class="lvx-label">Bidhaa zitakazoonyeshwa <small>(zako tu, hadi 20)</small></div><div id="lvxProducts" class="lvx-pick">Inapakia bidhaa zako…</div>
        <label>Link ya video (hiari)<input id="lvxVideo" placeholder="https://youtube.com/live/… au https://vimeo.com/…"><small>SokoHai haina seva ya kurusha video bado. Rusha kwenye YouTube au Vimeo kisha bandika link hapa; bila link, live inaonyesha bidhaa, bei na maoni kwa wakati halisi (Product live).</small></label>
        <label class="lvx-check"><input type="checkbox" id="lvxRec"> Ruhusu rekodi ya live ihifadhiwe baada ya kuisha</label>
        <div class="lvx-actions"><button class="lvx-btn" onclick="skhLiveClose('lvxCreate')">Ghairi</button><button class="lvx-btn lvx-btn-primary" id="lvxCreateGo">Tengeneza live</button></div></div>`);
    try {
        const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', uid), skh.limit(60)));
        const box = document.getElementById('lvxProducts');
        box.innerHTML = snap.empty ? '<span class="lvx-muted">Huna bidhaa bado. Unaweza kuanzisha live ya kawaida bila bidhaa.</span>'
            : snap.docs.map(d => { const p = d.data(); const mode = modeOf(p);
                return `<label class="lvx-pick-item"><input type="checkbox" value="${esc(d.id)}">${photo(p) ? `<img src="${esc(photo(p))}" alt="">` : ''}<span>${esc(p.title || 'Bidhaa')}</span><em>${esc(tsh(p.price))}${mode === 'auction' ? ' · Mnada' : mode === 'price_drop' ? ' · Bei Kushuka' : ''}</em></label>`; }).join('');
    } catch (e) { document.getElementById('lvxProducts').textContent = errText(e); }
    el.querySelector('#lvxCreateGo').onclick = async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true;
        const productIds = [...el.querySelectorAll('#lvxProducts input:checked')].map(i => i.value);
        const when = el.querySelector('#lvxWhen').value;
        try {
            const r = await call('liveCreate', { kind: el.querySelector('#lvxKind').value, title: el.querySelector('#lvxTitle').value, description: el.querySelector('#lvxDesc').value,
                productIds, videoUrl: el.querySelector('#lvxVideo').value.trim() || null, recordingAllowed: el.querySelector('#lvxRec').checked, scheduledAt: when ? new Date(when).getTime() : null });
            closeSheet('lvxCreate'); toast('Live imetengenezwa. Bonyeza "Anza live" ukiwa tayari.', 'success'); window.skhLiveOpen(r.sessionId);
        } catch (e) { toast(friendly(e), 'warn'); btn.disabled = false; }
    };
};

/* ======================================================================
 * ROOM — ref 7 (auction), ref 2 (price drop), ref 6/10 (seller live)
 * ==================================================================== */
let room = null;   // { id, unsub:[], timer, session, products:{}, pid, lastLeader, wonShown, rank, comments:[] }
/* [AUCTION-LIVE] leave-once: the room object is dropped first so parallel close paths
 * (X button, mini close, re-open) can only send liveLeave a single time. keepJoin tears
 * the UI/listeners down without leaving (re-opening the same session, e.g. conn retry). */
function leaveRoom(keepJoin) {
    if (!room) return;
    const r = room; room = null;
    r.unsub.forEach(u => { try { u(); } catch (e) {} });
    clearInterval(r.timer); clearInterval(r.rankTimer);
    try { window.removeEventListener('online', onNetBack); window.removeEventListener('offline', onNetGone); } catch (e) {}
    if (!keepJoin && r.id && r.joined && !r.left) { r.left = true; call('liveLeave', { sessionId: r.id }).catch(() => {}); }
}
/* [AUCTION-LIVE] connection overlay: listener errors / offline show #lv7Conn with retry. */
function showConn(msg, retry) {
    const box = document.getElementById('lv7Conn'); if (!box) { toast(msg, 'warn'); return; }
    const m = document.getElementById('lv7ConnMsg'); if (m) m.textContent = msg;
    const btn = document.getElementById('lv7ConnRetry');
    if (btn) btn.onclick = () => { hideConn(); try { retry && retry(); } catch (e) { toast(friendly(e), 'warn'); } };
    box.hidden = false;
}
function hideConn() { const box = document.getElementById('lv7Conn'); if (box) box.hidden = true; }
function onNetGone() { showConn('Hakuna muunganisho wa intaneti. Ukirejea online, bonyeza Jaribu tena.', () => { try { tick(); } catch (e) {} }); }
function onNetBack() { hideConn(); toast('Umerrejea online \u2014 live inaendelea.', 'success'); try { tick(); } catch (e) {} }
/* [AUCTION-LIVE] real mini player: the stage node itself moves into the floating box,
 * so video/listeners/session continue untouched (no leave on minimize, no leaks).
 * Restore moves it back; only MiniClose leaves (once, via leaveRoom). */
function closeMiniBox() { const m = document.getElementById('lvxMini'); if (m) m.remove(); }
window.skhLiveMinimize = function () {
    if (!room || document.getElementById('lvxMini')) return;
    const stage = document.getElementById('lv7Stage'); if (!stage) return;
    const s = room.session || {};
    const box = document.createElement('div'); box.id = 'lvxMini'; box.className = 'lvx-mini';
    box.innerHTML = `<div class="lvx-mini-head"><b>${esc(s.title || 'Live')}</b><span><button onclick="skhLiveMiniRestore()">\u2197 Rudi</button><button onclick="skhLiveMiniClose()" aria-label="Funga">\u00d7</button></span></div><div class="lvx-mini-slot" id="lvxMiniSlot"></div>`;
    document.body.appendChild(box);
    box.querySelector('#lvxMiniSlot').appendChild(stage);
    const ov = document.getElementById('lvxRoom'); if (ov) ov.hidden = true;
};
window.skhLiveMiniRestore = function () {
    const box = document.getElementById('lvxMini'); if (!box || !room) { closeMiniBox(); return; }
    const stage = box.querySelector('#lv7Stage');
    let ov = document.getElementById('lvxRoom');
    if (!ov) { renderRoomShell(); ov = document.getElementById('lvxRoom'); }
    const host = ov && ov.querySelector('.lv7');
    if (stage && host) host.insertBefore(stage, host.firstChild);
    closeMiniBox();
    if (ov) ov.hidden = false;
    try { paintRoom(room.session); tick(); } catch (e) {}
};
window.skhLiveMiniClose = function () {
    closeMiniBox();
    const ov = document.getElementById('lvxRoom');
    leaveRoom();
    if (ov) { ov.hidden = true; ov.innerHTML = ''; }
    if (!document.querySelector('.lvx-overlay:not([hidden])')) document.body.classList.remove('lvx-open');
};
function isHost() { return !!(room && room.session && me() && me() === room.session.hostUid); }
function pinned() { return room && room.session ? room.products[room.session.pinnedProductId] : null; }

function renderRoomShell() {
    sheet('lvxRoom', `<div class="lv7" role="dialog" aria-label="Chumba cha live">
      <section class="lv7-stage" id="lv7Stage">
        <div class="lv7-bg" id="lvxStage"></div><div class="lv7-shade"></div>
        <header class="lv7-top">
          <div class="lv7-pills"><span class="lv7-live" id="lv7Status">${ico('radio', 15)} LIVE</span><span class="lv7-viewers" id="lv7Viewers">0 WATAZAMAJI</span></div>
          <div class="lv7-brand"><img src="${LOGO}" alt="SokoHai"><div><b>SokoHai</b><small id="lv7Sub">Live</small></div></div>
          <button class="lv7-x" onclick="skhLiveMinimize()" aria-label="Punguza" title="Punguza">${ico('minus', 18)}</button>
          <button class="lv7-x" onclick="skhLiveCloseAsk('lvxRoom')" aria-label="Funga">${ico('x', 18)}</button>
        </header>
        <div class="lv7-host" id="lv7Host"></div>
        <div class="lv7-frame">
          <div class="lv7-prod" id="lvxPinned"></div>
          <div class="lv7-feed" id="lvxComments" aria-live="polite"></div>
          <div class="lv7-rail">
            <button class="lv7-rb" id="lv7Like" onclick="skhLiveLike(this)"><em id="lv7Likes">0</em><span class="lv7-rc">${ico('heart', 22)}</span><small>Penda</small></button>
            <button class="lv7-rb" onclick="skhLiveShare()"><span class="lv7-rc">${ico('share', 22)}</span><small>Shiriki</small></button>
            <button class="lv7-rb" onclick="skhLiveSheet('products')"><span class="lv7-rc">${ico('shop', 22)}</span><small>Bidhaa</small></button>
            <button class="lv7-rb" id="lv7More" onclick="skhLiveSheet('more')"><span class="lv7-rc">${ico('more', 22)}</span><small>Zaidi</small></button>
          </div>
          <div class="lv7-bottom" id="lv7Bottom"></div>
        </div>
        <form class="lv7-chat lvx-chat-form" id="lvxChatForm"><input id="lvxChatInput" maxlength="300" placeholder="Andika maoni au swali…" autocomplete="off"><button aria-label="Tuma">${ico('send', 18)}</button></form>
        <div class="lvx-emoji" id="lvxEmoji"><button type="button" data-e="\u{1F525}">\u{1F525}</button><button type="button" data-e="\u2764\ufe0f">\u2764\ufe0f</button><button type="button" data-e="\u{1F602}">\u{1F602}</button><button type="button" data-e="\u{1F44F}">\u{1F44F}</button><button type="button" data-e="\u{1F4AF}">\u{1F4AF}</button></div>
        <div class="lv7-paused" id="lv7Paused" hidden><div><b>\u23f8 Live imesitishwa</b><span>Mwenyeji amesimamisha live kwa muda. Zabuni na maoni vimesimama \u2014 endelea kutazama.</span></div></div>
        <div class="lv7-conn" id="lv7Conn" hidden><div><b>Muunganisho umekatika</b><span id="lv7ConnMsg"></span><button class="lv-btn" id="lv7ConnRetry" type="button">JARIBU TENA</button></div></div>
        <div class="lv7-sheet" id="lv7Sheet" hidden></div>
      </section>
      <aside class="lv7-side" aria-label="Maelezo ya live">
        <nav class="lv7-side-tabs"><button data-s="chat" class="on">Maoni</button><button data-s="products">Bidhaa</button><button data-s="board" id="lv7BoardTab">Zabuni</button></nav>
        <div class="lv7-side-body" id="lv7Side"></div>
      </aside></div>`, 'lv7-ov');
    document.getElementById('lvxChatForm').onsubmit = async (e) => {
        e.preventDefault(); const i = document.getElementById('lvxChatInput'); const text = i.value.trim(); if (!text || !room) return;
        if (!room.id) { toast('Maoni yanapatikana kwenye live ya muuzaji.', 'info'); return; }
        i.value = '';
        try { await call('liveComment', { sessionId: room.id, text, clientId: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }); }
        catch (er) { i.value = text; toast(friendly(er), 'warn'); }
    };
    document.getElementById('lvxEmoji').onclick = (e) => { const b = e.target.closest('button[data-e]'); if (!b || !room) return; const i = document.getElementById('lvxChatInput'); if (i && !i.disabled) { i.value += b.dataset.e; try { i.focus(); } catch (_) {} } };
    document.querySelectorAll('.lv7-side-tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.lv7-side-tabs button').forEach(x => x.classList.toggle('on', x === b)); room && (room.side = b.dataset.s); paintSide(); });
}
window.skhLiveOpen = async function (sessionId, opts) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    opts = opts || {};
    leaveRoom(!!opts.keepJoin); closeMiniBox();
    room = { id: sessionId, unsub: [], products: {}, session: null, joined: false, side: 'chat', comments: [] };
    renderRoomShell();
    try { window.removeEventListener('online', onNetBack); window.removeEventListener('offline', onNetGone); window.addEventListener('online', onNetBack); window.addEventListener('offline', onNetGone); } catch (e) {}
    room.unsub.push(skh.onSnapshot(skh.doc(skh.db, 'live_sessions', sessionId), (s) => {
        if (!room || room.id !== sessionId) return;
        if (!s.exists()) { document.getElementById('lvxStage').innerHTML = '<div class="lv7-gone"><b>Live haipatikani</b></div>'; return; }
        const prev = room.session; room.session = Object.assign({ id: s.id }, s.data());
        paintRoom(prev);
    }, (e) => { showConn('Imeshindikana kupakia live: ' + friendly(e), () => window.skhLiveOpen(sessionId, { keepJoin: true })); }));
    const cq = skh.query(skh.collection(skh.db, 'live_sessions', sessionId, 'comments'), skh.orderBy('createdAt', 'desc'), skh.limit(60));
    room.unsub.push(skh.onSnapshot(cq, (snap) => { if (!room) return; room.comments = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).reverse(); paintComments(); }, () => {}));
    try { const r = await call('liveJoin', { sessionId }); if (room) room.joined = !!(r && (r.status === 'live' || r.status === 'paused')); } catch (e) {}
    room.timer = setInterval(tick, 1000);
};
/* one product, no session: Mnada (ref 5/7) or Bei Kushuka campaign (ref 2) */
async function productRoom(productId, kind) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    leaveRoom(); closeMiniBox();
    room = { id: null, unsub: [], products: {}, session: null, joined: false, side: kind === 'auction' ? 'board' : 'board', comments: [] };
    renderRoomShell();
    const p = await getProduct(productId);
    if (!room) return;
    if (!p) { document.getElementById('lvxStage').innerHTML = '<div class="lv7-gone"><b>Bidhaa haipatikani</b></div>'; return; }
    room.products[productId] = p;
    room.session = { title: p.title, hostName: p.ownerName || p.sellerName || 'Muuzaji', hostUid: p.userId, kind, status: 'live', productIds: [productId], pinnedProductId: productId, video: null, viewerCount: null };
    document.getElementById('lvxChatForm').hidden = true;
    paintRoom(null);
    room.timer = setInterval(tick, 1000);
}
window.skhAuctionRoom = (pid) => productRoom(pid, 'auction');
window.skhPriceDropRoom = (pid) => productRoom(pid, 'price_drop');

function paintRoom(prev) {
    const s = room.session, mode = (pinned() && modeOf(pinned())) || s.kind;
    document.getElementById('lv7Sub').textContent = mode === 'auction' ? 'Live Auction Room' : mode === 'price_drop' ? 'Price Drop Live' : 'Live ya Muuzaji';
    const st = document.getElementById('lv7Status');
    st.className = 'lv7-live' + (s.status === 'live' ? '' : ' is-off');
    st.innerHTML = s.status === 'live' ? ico('radio', 15) + ' LIVE' : s.status === 'paused' ? '\u23f8 IMESITISHWA' : s.status === 'scheduled' ? 'INAKUJA' : s.status === 'ended' ? 'IMEKWISHA' : 'IMEONDOLEWA';
    const pz = document.getElementById('lv7Paused'); if (pz) pz.hidden = s.status !== 'paused';
    const v = document.getElementById('lv7Viewers'); v.hidden = s.viewerCount == null; v.textContent = kshort(s.viewerCount) + ' WATAZAMAJI';
    document.getElementById('lv7Likes').textContent = kshort(s.likeCount || 0);
    document.getElementById('lv7Like').hidden = !room.id;
    paintHost();
    if (!prev || (prev.video && prev.video.url) !== (s.video && s.video.url) || prev.status !== s.status || prev.pinnedProductId !== s.pinnedProductId) paintStage();
    document.getElementById('lv7BoardTab').textContent = mode === 'price_drop' ? 'Nafasi' : mode === 'auction' ? 'Zabuni' : 'Muuzaji';
    const ids = s.productIds || [];
    Promise.all(ids.filter(pid => !room.products[pid]).map(pid => getProduct(pid).then(p => { if (room) room.products[pid] = p; }))).then(() => {
        if (!room) return;
        const p = pinned();
        if (p && !room.watching) watchProduct(p.id);
        paintStage(); paintPinned(); paintSide(); tick();
    });
}
function paintStage() {
    const s = room.session, p = pinned(), stage = document.getElementById('lvxStage'); if (!stage) return;
    const url = s.status === 'ended' && s.recordingUrl ? s.recordingUrl : (s.video && s.video.kind === 'embed' ? s.video.url : null);
    if (url && s.status !== 'removed') {
        if (!stage.querySelector('iframe') || stage.querySelector('iframe').getAttribute('src') !== url)
            stage.innerHTML = `<iframe class="lv7-video" src="${esc(url)}" title="Video ya live" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
        return;
    }
    const img = photo(p);
    stage.innerHTML = img ? `<div class="lv7-blur" style="background-image:url('${esc(img)}')"></div><img class="lv7-hero" src="${esc(img)}" alt="${esc(p.title)}">`
        : `<div class="lv7-gone">${ico('video', 40)}<b>${esc(s.hostName)}</b><span>${s.status === 'scheduled' ? 'Live itaanza hivi karibuni.' : 'Live bila video: bidhaa, bei na maoni kwa wakati halisi.'}</span></div>`;
}
async function paintHost() {
    const s = room.session, box = document.getElementById('lv7Host'); if (!box) return;
    const host = isHost();
    box.innerHTML = `<span class="lv7-av">${esc(initials(s.hostName))}</span><b>${esc(s.hostName)}</b>${host || !s.hostUid ? '' : `<button class="lv7-follow" id="lv7Follow" onclick="skhLiveFollow()">Fuata</button>`}
        ${host && s.status === 'scheduled' ? `<button class="lv7-follow lv7-start" onclick="skhLiveHost('start')">Anza live</button>` : ''}`;
    if (!host && s.hostUid && me() && room.followKnown === undefined) {
        room.followKnown = false;
        try { const f = await skh.getDoc(skh.doc(skh.db, 'sellerFollowers', me() + '__' + s.hostUid)); room.following = f.exists(); } catch (e) { room.following = false; }
        room.followKnown = true;
    }
    const b = document.getElementById('lv7Follow'); if (b && room.following) { b.textContent = 'Unafuata'; b.classList.add('on'); }
}
window.skhLiveFollow = async function () {
    if (!room || !room.session || !skh.requireAuth || !skh.requireAuth()) return;
    const s = room.session, ref = skh.doc(skh.db, 'sellerFollowers', me() + '__' + s.hostUid);
    try {
        if (room.following) await skh.deleteDoc(ref); else await skh.setDoc(ref, { followerId: me(), sellerId: s.hostUid, sellerName: s.hostName || '', followedAt: new Date().toISOString() });
        room.following = !room.following; paintHost(); toast(room.following ? 'Unamfuata ' + s.hostName + ' sasa.' : 'Umeacha kumfuata ' + s.hostName + '.', 'success');
    } catch (e) { toast(friendly(e), 'warn'); }
};
window.skhLiveLike = async function (btn) {
    if (!room || !room.id) return;
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    try { await call('liveLike', { sessionId: room.id }); } catch (e) { toast(friendly(e), 'warn'); }
};
window.skhLiveShare = async function () {
    const p = pinned(); const url = p && window.skhProductPublicUrl ? window.skhProductPublicUrl(p.id) : location.href;
    const title = room && room.session ? room.session.title : 'SokoHai Live';
    try { if (navigator.share) { await navigator.share({ title, url }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(url); toast('Kiungo kimenakiliwa.', 'success'); } catch (e) { window.prompt('Nakili kiungo:', url); }
};

function watchProduct(pid) {
    room.watching = pid;
    room.unsub.push(skh.onSnapshot(skh.doc(skh.db, 'products', pid), (s) => { if (room && s.exists()) { room.products[pid] = Object.assign({ id: s.id, collectionName: 'products' }, s.data()); paintPinned(); tick(); outcomeCheck(); } }, (e) => showConn('Imeshindikana kupakia bidhaa: ' + friendly(e), () => { if (room && room.watching === pid) { room.watching = null; watchProduct(pid); } })));
    const p = room.products[pid];
    if (modeOf(p) === 'auction') {
        room.unsub.push(skh.onSnapshot(skh.query(skh.collection(skh.db, 'products', pid, 'bids'), skh.orderBy('amount', 'desc'), skh.limit(15)), (snap) => {
            if (!room) return; room.bids = snap.docs.map(d => d.data()); paintSide(); if (!room.id) paintComments();
        }, (e) => showConn('Imeshindikana kupakia zabuni: ' + friendly(e), () => { try { tick(); } catch (_) {} })));
    }
    if (modeOf(p) === 'price_drop') {
        room.unsub.push(skh.onSnapshot(skh.doc(skh.db, 'price_drop_board', pid), (s) => { if (!room) return; room.board = s.exists() ? s.data() : null; paintSide(); refreshRank(); }, () => {}));
        refreshRank();
    }
}
const maskName = (n) => String(n || 'Mteja').replace(/^(.)(.*)$/, (m, a, rest) => a + '***' + (rest.length > 3 ? rest.slice(-1) : ''));
async function refreshRank() {
    const p = pinned(); if (!room || !p || modeOf(p) !== 'price_drop' || !me()) return;
    if (room.rankBusy) return; room.rankBusy = true;
    try { room.rank = await call('priceDropMyRank', { productId: p.id }); } catch (e) { room.rank = null; }
    room.rankBusy = false; tick(); paintSide(); outcomeCheck();
}

/* product card over the video (ref 7: "Jina / Hali / Bei") */
function paintPinned() {
    const box = document.getElementById('lvxPinned'); if (!box || !room) return;
    const p = pinned();
    if (!p) { box.innerHTML = ''; return; }
    const mode = modeOf(p), now = Date.now();
    let extra = '';
    if (mode === 'auction') { const a = auctionState(p, now); extra = `<i>Dau la juu: <b class="lvx-price">${esc(tsh(a.cur))}</b></i><i>Muda: <b>${a.paused ? '\u23f8 Imesitishwa' : a.ended ? 'Imefungwa' : fmtLeft(a.left)}</b></i><i>Wazabuni: <b>${a.bidders}</b></i>${a.extensions > 0 && !a.ended ? `<i>\u23f1 <b>+2:00 \u00d7${a.extensions}</b></i>` : ''}`; }
    else if (mode === 'group_buy') { const g = groupState(p, now); extra = `<i>Kikundi: <b>${g.joined}/${g.target}</b></i><i>Bei: <b class="lvx-price">${esc(tsh(g.price))}</b></i>`; }
    else if (mode === 'price_drop') { const d = dropPrice(p, now); extra = `<i>Bei sasa: <b class="lvx-price">${esc(tsh(d.price))}</b></i><i>Mwisho: <b>${esc(tsh(d.min))}</b></i>`; }
    box.innerHTML = `<button class="lv7-pcard" onclick="skhLiveOpenProduct('${esc(p.id)}')">${photo(p) ? `<img src="${esc(photo(p))}" alt="">` : ''}
        <span><i class="lv7-pmode">${mode === 'auction' ? 'MNADA LIVE' : mode === 'group_buy' ? 'GROUP BUY' : mode === 'price_drop' ? 'BEI KUSHUKA' : 'BIDHAA'}</i><i>Jina: <b>${esc(p.title)}</b></i><i>Hali: <b>${esc(String(p.condition || 'Mpya').toUpperCase())}</b></i>${extra}</span></button>`;
}
/* ---- close / leave confirmation (design: Close/Leave dialog; leave logic unchanged) ---- */
window.skhLiveCloseAsk = function (id) {
    modal(`<div class="lv-mav">${ico('logout', 26)}</div><h3>Toka kwenye Live?</h3>
        <p class="lv-muted">Ukifunga, utaondoka kwenye chumba na hesabu ya watazamaji itapungua.</p>
        <button class="lv-btn" onclick="skhLvModalClose();skhLiveClose('${esc(id || 'lvxRoom')}')">FUNGA / TOKA</button>
        <button class="lv-btn lv-ghost" onclick="skhLvModalClose()">ENDELEA KUTAZAMA</button>`, 'lv-leave');
};
function paintComments() {
    const el = document.getElementById('lvxComments'); if (!el || !room) return;
    let list = room.comments || [];
    if (!room.id) {   // product room: the feed shows the real bids (ref 7 "Bidder3: Weka Zabuni mpya")
        list = (room.bids || []).slice(0, 6).reverse().map((b, i, arr) => ({ kind: 'comment', name: maskName(b.name), text: (i === arr.length - 1 ? 'Unaongoza ' : 'Zabuni ') + '(' + tsh(b.amount) + ')' }));
    }
    const shown = list.filter(c => c.status !== 'removed').slice(-6);
    el.innerHTML = shown.map(c => c.kind === 'system' ? `<div class="lv7-c lv7-sys">${esc(c.text)}</div>`
        : `<div class="lv7-c"><span class="lv7-cav">${esc(initials(c.name))}</span><p><b>${esc(c.name || 'Mteja')}:</b> ${esc(c.text)}</p></div>`).join('');
    if (room.side === 'chat') paintSide();
}

/* bottom area (CTA) by mode */
function tick() {
    if (!room || !room.session) return;
    const p = pinned(), s = room.session, bottom = document.getElementById('lv7Bottom'); if (!bottom) return;
    const now = Date.now();
    if (!p) {
        bottom.innerHTML = isHost() ? `<div class="lv7-note">Chagua bidhaa ya kuonyesha kupitia "Bidhaa".</div>` : '';
        return;
    }
    const mode = modeOf(p);
    try { paintPinned(); } catch (e) {}   // keep the floating overlay timer/counts fresh (1s tick)
    if (mode === 'auction') {
        const a = auctionState(p, now), mine = me() && a.leader === me(), won = a.ended && me() && a.winner === me();
        /* [AUCTION-LIVE] frozen display while paused: the server clock stopped, so the client holds the last shown time. */
        if (a.paused && !a.ended) { if (room.pausedLeft == null) room.pausedLeft = a.left; a.left = room.pausedLeft; } else room.pausedLeft = null;
        let cta;
        if (a.notStarted) cta = `<button class="lv7-cta is-off" disabled><b>MNADA HAUJAANZA</b><small>Unaanza baada ya ${fmtLeft(Number(a.md.startTime) - now)}</small></button>`;
        else if (won) cta = `<button class="lv7-cta lv7-gold" onclick="skhLiveWinner('${esc(p.id)}')"><b>LIPA SASA</b><small>Umeshinda kwa ${esc(tsh(a.winBid))}</small></button>`;
        else if (a.ended) cta = `<button class="lv7-cta is-off" disabled><b>MNADA UMEFUNGWA</b><small>${a.winner ? 'Mshindi amepatikana' : 'Hakuna zabuni'}</small></button>`;
        else if (a.paused) cta = `<button class="lv7-cta is-off" disabled><b>\u23f8 IMESITISHWA</b><small>Live imesimamishwa kwa muda na mwenyeji</small></button>`;
        else if (mine) cta = `<button class="lv7-cta lv7-lead" onclick="skhBidConfirm('${esc(p.id)}')"><b>UNAONGOZA MNADA</b><small>Zabuni yako: ${esc(tsh(a.cur))} · Ongeza zabuni</small></button>`;
        else if (isHost() || p.userId === me()) cta = `<button class="lv7-cta is-off" disabled><b>MNADA WAKO</b><small>Inayokubalika: ${esc(tsh(a.minNext))}</small></button>`;
        else cta = `<button class="lv7-cta" id="lv7BidCta" onclick="skhBidConfirm('${esc(p.id)}')"><b>WEKA ZABUNI</b><small>Inayokubalika: ${esc(tsh(a.minNext))}</small></button>`;
        const soon = a.endingSoon && !a.paused ? `<div class="lv7-endsoon">\u23f3 INAKARIBIA KUISHA \u2014 chini ya dakika 1!</div>` : '';
        const ext = a.extensions > 0 && !a.ended ? ` <em class="lv7-ext">\u23f1 +2:00 \u00d7${a.extensions}</em>` : '';
        bottom.innerHTML = soon + cta + `<div class="lv7-foot"><button onclick="skhLiveSheet('board')">Zabuni ya Juu: <b id="lvxBidNow">${esc(tsh(a.cur))}</b></button><span>Muda: <b>${a.ended ? '00:00' : fmtLeft(a.left)}</b></span><span>Zabuni: <b>${a.bids}</b> \u00b7 Wazabuni: <b>${a.bidders}</b>${ext}</span></div>`;
        if (a.ended && !a.md.endNotified && !room.finalizing) { room.finalizing = true; call('auctionFinalize', { productId: p.id }).catch(() => {}); }
        return;
    }
    if (mode === 'price_drop') {
        const d = dropPrice(p, now), md = p.modeData || {}, ended = dropEnded(p, now), r = room.rank;
        const rankTxt = r && r.rank ? `Nafasi yako: <b>${r.rank}</b> kati ya ${r.count}` : (room.board && room.board.count ? room.board.count + ' wanashiriki' : 'Kuwa wa kwanza kuweka bei yako');
        const engine = `<div class="lv7-engine"><small>Bei ya sasa</small><strong class="lvx-price">${esc(tsh(ended ? d.min : d.price))}</strong>
            <span>awali: ${esc(tsh(d.base))}</span><span>mwisho: ${esc(tsh(d.min))}</span><div class="lv7-eprog"><i style="width:${d.pct}%"></i></div>
            <em id="lvxDropMeta">${ended ? 'Kampeni imeisha' : (d.atFloor ? 'Bei ya mwisho imefikiwa' : 'kushuka kunakofuata: ' + fmtLeft(d.nextIn)) + ' · kampeni: ' + fmtLeft(Number(md.endTime) - now)}</em></div>`;
        const offer = r && r.offer && Number(r.offer.deadline) > now ? r.offer : null;
        let ctas;
        if (offer) ctas = `<button class="lv7-cta lv7-gold" onclick="skhPriceDropOffer('${esc(p.id)}')"><b>POKEA FURSA YA KUNUNUA</b><small>Bei yako ${esc(tsh(offer.price))} · bado ${fmtLeft(offer.deadline - now)}</small></button>`;
        else if (ended) ctas = `<button class="lv7-cta is-off" onclick="skhPriceDropEnd('${esc(p.id)}')"><b>KAMPENI IMEISHA</b><small>${r && r.rank ? 'Uko nafasi ya ' + r.rank + ' · tutakujulisha nafasi ikifika' : 'Tazama matokeo'}</small></button>`;
        else if (p.userId === me()) ctas = `<button class="lv7-cta is-off" onclick="skhLiveSheet('board')"><b>KAMPENI YAKO</b><small>${room.board ? room.board.count : 0} wanashiriki · tazama foleni</small></button>`;
        else ctas = `<div class="lv7-ctas"><button class="lv7-cta" onclick="skhPriceSubmit('${esc(p.id)}')"><b>WEKA BEI YAKO</b><small>Kati ya ${esc(tsh(d.min))} na ${esc(tsh(d.price))}</small></button>
            <button class="lv7-cta lv7-white" onclick="skhLiveOpenProduct('${esc(p.id)}')"><b>NUNUA SASA</b><small>${esc(tsh(d.price))}</small></button></div>`;
        bottom.innerHTML = engine + ctas + `<div class="lv7-foot"><button onclick="skhLiveSheet('board')">${rankTxt}</button><span>${md.maxPerBuyer ? 'Kikomo: ' + md.maxPerBuyer + ' · ' : ''}Zipo: <b>${Number(p.stock) || 0}</b></span></div>`;
        return;
    }
    if (mode === 'group_buy') {
        const g = groupState(p, now), mine = me() && g.parts.indexOf(me()) !== -1, pct = Math.min(100, Math.round(g.joined / Math.max(1, g.target) * 100));
        const prog = `<div class="lv7-gprog"><div class="lv7-gbar"><i style="width:${pct}%"></i></div><span><b>${g.joined}</b>/${g.target} wamejiunga · ${pct}%</span></div>`;
        let cta;
        if (g.status === 'successful') cta = mine
            ? `<button class="lv7-cta lv7-gold" onclick="skhLiveOpenProduct('${esc(p.id)}')"><b>LIPA BEI YA KIKUNDI</b><small>${esc(tsh(g.price))} · lengo limefikiwa</small></button>`
            : `<button class="lv7-cta" onclick="skhGroupJoinConfirm('${esc(p.id)}')"><b>JIUNGE NA GROUP BUY</b><small>${esc(tsh(g.price))} · nafasi zimefunguka</small></button>`;
        else if (g.status === 'failed') cta = `<button class="lv7-cta is-off" disabled><b>KIKUNDI HAKIKUFANIKIWA</b><small>Muda umeisha bila kufikia lengo</small></button>`;
        else if (mine) cta = `<button class="lv7-cta lv7-lead" disabled><b>UMESHAJIUNGA</b><small>Subiri wengine: ${g.joined}/${g.target}</small></button>`;
        else if (isHost() || p.userId === me()) cta = `<button class="lv7-cta is-off" disabled><b>KIKUNDI CHAKO</b><small>${g.joined}/${g.target} wamejiunga</small></button>`;
        else cta = `<button class="lv7-cta" onclick="skhGroupJoinConfirm('${esc(p.id)}')"><b>JIUNGE NA GROUP BUY</b><small>${esc(tsh(g.price))} · badala ya ${esc(tsh(g.base))}</small></button>`;
        bottom.innerHTML = prog + cta + `<div class="lv7-foot"><span>Bei ya kikundi: <b>${esc(tsh(g.price))}</b></span><span>${g.endsAt ? 'Muda: <b>' + fmtLeft(g.left) + '</b>' : ''}</span></div>`;
        return;
    }
    bottom.innerHTML = `<div class="lv7-ctas"><button class="lv7-cta" onclick="skhLiveOpenProduct('${esc(p.id)}')"><b>AGIZA SASA</b><small>${esc(tsh(p.price))} · weka kwenye kikapu</small></button>
        <button class="lv7-cta lv7-white" onclick="skhLiveOpenProduct('${esc(p.id)}')"><b>MAELEZO</b><small>ya bidhaa</small></button></div>`;
}
/* ---- group-buy join (server: groupBuyJoin; counts are server-authoritative) ---- */
window.skhGroupJoinConfirm = async function (pid) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const p = (room && room.products[pid]) || await getProduct(pid); if (!p) return;
    const g = groupState(p, Date.now());
    modal(`<p class="lv-kicker">JIUNGE NA GROUP BUY</p>${photo(p) ? `<img class="lv-mimg" src="${esc(photo(p))}" alt="">` : ''}
        <div class="lv-kv"><small>Bei ya kikundi</small><b>${esc(tsh(g.price))}</b></div>
        <div class="lv-kv"><small>Wamejiunga</small><b>${g.joined} / ${g.target}</b></div>
        <div class="lv-gprog"><div class="lv7-gbar"><i style="width:${Math.min(100, Math.round(g.joined / Math.max(1, g.target) * 100))}%"></i></div></div>
        <div class="lv-info">${ico('check', 14)} Ukijiunga, bei yako ni ya kikundi. Kikundi kikifikia lengo, unalipia kwa bei hiyo; kisipofikia, hutalipishwa.</div>
        <button class="lv-btn" id="lvGrpGo">THIBITISHA KUJIUNGA</button>`, 'lv-grp');
    const go = document.getElementById('lvGrpGo');
    go.onclick = async () => {
        go.disabled = true; go.textContent = 'Inatuma…';
        try {
            const r = await call('groupBuyJoin', { productId: pid });
            window.skhLvModalClose();
            toast(r.already ? 'Tayari umeshajiunga kwenye kikundi hiki.' : 'Umejiunga! Kikundi: ' + r.joined + '/' + r.target + '.', 'success');
        } catch (e) { toast(friendly(e), 'warn'); go.disabled = false; go.textContent = 'THIBITISHA KUJIUNGA'; }
    };
};

/* auction outcome pop-ups: outbid (ref 5) and winner (ref 5); price-drop end (ref 2) */
function outcomeCheck() {
    const p = pinned(); if (!p || !me() || !room) return;
    const now = Date.now();
    if (modeOf(p) === 'auction') {
        const a = auctionState(p, now);
        if (room.lastLeader === me() && a.leader && a.leader !== me() && !a.ended) {
            modal(`<div class="lv-mav lv-red">${ico('alert', 26)}</div><h3>Zabuni yako imepitwa!</h3><p>Zabuni mpya ya juu: <b>${esc(tsh(a.cur))}</b></p>
                <button class="lv-btn" onclick="skhLvModalClose();skhBidConfirm('${esc(p.id)}')">Ongeza zabuni</button>`, 'lv-outbid');
        }
        room.lastLeader = a.leader;
        if (a.ended && a.winner === me() && !room.wonShown) { room.wonShown = true; window.skhLiveWinner(p.id); }
    }
    if (modeOf(p) === 'price_drop' && dropEnded(p, now) && room.rank && !room.endShown && (room.rank.rank || room.rank.offer)) { room.endShown = true; window.skhPriceDropEnd(p.id); }
}

/* ---- ref 5: bid confirmation ---- */
window.skhBidConfirm = async function (pid) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const p = (room && room.products[pid]) || await getProduct(pid); if (!p) return;
    const a = auctionState(p, Date.now());
    /* [AUCTION-LIVE] quick-bid chips: minimum + one/two increments up */
    const chipStep = Math.max(1, a.minNext - a.cur), chipAmts = [a.minNext, a.minNext + chipStep, a.minNext + chipStep * 2];
    modal(`<p class="lv-kicker">THIBITISHA ZABUNI</p>${photo(p) ? `<img class="lv-mimg" src="${esc(photo(p))}" alt="">` : ''}
        <div class="lv-kv"><small>Zabuni ya juu sasa</small><b>${esc(tsh(a.cur))}</b></div>
        <label class="lv-lab">Zabuni yako (angalau ${esc(tsh(a.minNext))})<input id="lvBidAmt" inputmode="numeric" value="${a.minNext}"></label>
        <div class="lv-chips" id="lvBidChips">${chipAmts.map(x => `<button type="button" data-amt="${x}">${esc(tsh(x))}</button>`).join('')}</div>
        <div class="lv-info">${ico('check', 14)} Zabuni yako ni ahadi ya kununua. Ukishinda, unalipa ndani ya saa 24 kupitia SokoPay (escrow); usipolipa, nafasi inapewa mzabuni anayefuata.</div>
        <button class="lv-btn" id="lvBidGo">THIBITISHA ZABUNI</button>`, 'lv-bid');
    const go = document.getElementById('lvBidGo');
    document.querySelectorAll('#lvBidChips button').forEach(b => b.onclick = () => { const i = document.getElementById('lvBidAmt'); if (i) i.value = b.dataset.amt; });
    go.onclick = async () => {
        const amount = Math.round(Number(String(document.getElementById('lvBidAmt').value).replace(/[^\d]/g, '')));
        if (!(amount > 0)) return toast('Andika kiasi cha zabuni.', 'warn');
        go.disabled = true; go.textContent = 'Inatuma…';
        try {
            const r = await call('auctionPlaceBid', { productId: pid, amount, clientBidId: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), bidderName: (skh.currentUserData && skh.currentUserData.fullName) || (skh.currentUser && skh.currentUser.displayName) || undefined });
            if (room) room.lastLeader = me();
            window.skhLvModalClose(); toast(r.extended ? 'Zabuni imepokelewa. Muda umeongezwa dakika 2.' : 'Zabuni imepokelewa. Unaongoza!', 'success');
        } catch (e) { toast(friendly(e), 'warn'); go.disabled = false; go.textContent = 'THIBITISHA ZABUNI'; }
    };
};
/* ---- ref 5: winner announcement ---- */
window.skhLiveWinner = async function (pid) {
    const p = (room && room.products[pid]) || await getProduct(pid); if (!p) return;
    const a = auctionState(p, Date.now());
    modal(`<div class="lv-mav lv-goldbg">${ico('award', 28)}</div><h3>UMESHINDA MNADA!</h3>
        <div class="lv-kv"><small>Zabuni iliyothibitishwa</small><b>${esc(tsh(a.winBid))}</b></div><div class="lv-kv"><small>Bidhaa</small><b>${esc(p.title)}</b></div>
        <div class="lv-box"><small>Muda wa malipo</small><b>${a.deadline ? fmtLeft(a.deadline - Date.now()) : 'saa 24'}</b><span>Lipa ndani ya muda huu; vinginevyo nafasi inapewa mzabuni anayefuata.</span></div>
        <div class="lv-info">${ico('truck', 14)} Chaguo la usafirishaji na malipo ya SokoPay (escrow) vinafuata kwenye checkout.</div>
        <button class="lv-btn" onclick="skhLvModalClose();skhAuctionWinnerCheckout('${esc(p.id)}')">LIPA SASA</button>`, 'lv-win');
};

/* ---- ref 1: Weka bei yako ---- */
window.skhPriceSubmit = async function (pid) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const p = (room && room.products[pid]) || await getProduct(pid); if (!p) return;
    const d = dropPrice(p, Date.now()), md = p.modeData || {};
    const name = (skh.currentUserData && skh.currentUserData.fullName) || (skh.currentUser && skh.currentUser.displayName) || 'Mteja';
    const r = room && room.rank;
    modal(`<div class="lv-mav">${esc(initials(name))}</div><h3>${esc(name)}</h3><p class="lv-muted">Weka bei unayotaka kulipa</p>
        <label class="lv-lab">Weka Bei Yako<input id="lvPdAmt" inputmode="numeric" value="${r && r.entry ? r.entry.price : d.min}"></label>
        <small class="lv-muted">Kati ya ${esc(tsh(d.min))} (bei ya mwisho) na ${esc(tsh(d.price))} (bei ya sasa).</small>
        ${Number(md.maxPerBuyer) > 1 ? `<label class="lv-lab">Idadi (hadi ${md.maxPerBuyer})<input id="lvPdQty" type="number" min="1" max="${md.maxPerBuyer}" value="1"></label>` : ''}
        <button class="lv-btn" id="lvPdGo">THIBITISHA</button>
        <div class="lv-box" id="lvPdRes" ${r && r.rank ? '' : 'hidden'}><small>Bei / nafasi uliyowasilisha</small><b>${r && r.entry ? esc(tsh(r.entry.price)) + ' · nafasi ya ' + r.rank : ''}</b></div>
        <div class="lv-info">${ico('check', 14)} Wanunuzi wanapangwa kwa bei ya juu kwanza, kisha aliyewahi. Kampeni ikiisha, wa kwanza anapata fursa ya kununua kwa bei yake; akishindwa, nafasi inapewa anayefuata.</div>`, 'lv-pd');
    const go = document.getElementById('lvPdGo');
    go.onclick = async () => {
        const price = Math.round(Number(String(document.getElementById('lvPdAmt').value).replace(/[^\d]/g, '')));
        const qEl = document.getElementById('lvPdQty');
        go.disabled = true;
        try {
            const res = await call('priceDropSubmit', { productId: pid, price, qty: qEl ? Number(qEl.value) : 1, name });
            const box = document.getElementById('lvPdRes'); box.hidden = false; box.querySelector('b').textContent = tsh(price) + ' · nafasi ya ' + res.rank + ' kati ya ' + res.count;
            toast('Bei yako imepokelewa. Uko nafasi ya ' + res.rank + '.', 'success'); refreshRank();
        } catch (e) { toast(friendly(e), 'warn'); }
        go.disabled = false;
    };
};
/* ---- ref 2: Mwisho wa kampeni ---- */
window.skhPriceDropEnd = async function (pid) {
    const p = (room && room.products[pid]) || await getProduct(pid); if (!p) return;
    let r = room && room.rank; if (!r) { try { r = await call('priceDropMyRank', { productId: pid }); } catch (e) { r = null; } }
    let b = room && room.board; if (!b) { try { const s = await skh.getDoc(skh.doc(skh.db, 'price_drop_board', pid)); b = s.exists() ? s.data() : null; } catch (e) {} }
    if (b && !b.closed) { try { await call('priceDropSettle', { productId: pid }); r = await call('priceDropMyRank', { productId: pid }); } catch (e) {} }
    const first = b && b.top && b.top[0];
    const offer = r && r.offer && Number(r.offer.deadline) > Date.now() ? r.offer : null;
    modal(`<h3 class="lv-big">KAMPENI IMEISHA</h3>${first ? `<p>Nafasi ya Kwanza:<br><b>Mnunuzi ${esc(first.name)} - ${esc(tsh(first.price))}</b></p>` : '<p>Hakuna mnunuzi aliyeweka bei.</p>'}
        ${offer ? `<button class="lv-btn" onclick="skhLvModalClose();skhPriceDropOffer('${esc(pid)}')">POKEA FURSA YA KUNUNUA<small>Bado ${fmtLeft(offer.deadline - Date.now())}</small></button>`
            : r && r.rank ? `<div class="lv-box"><small>Nafasi yako</small><b>${r.rank} kati ya ${r.count}</b><span>${r.entry && r.entry.status === 'expired' ? 'Muda wa fursa yako umeisha.' : r.entry && r.entry.status === 'bought' ? 'Umenunua bidhaa hii.' : 'Nafasi ikifika kwako tutakujulisha.'}</span></div>` : ''}
        <p class="lv-muted">Ikiwa mwenye nafasi atashindwa kununua, nafasi inayofuata itapewa fursa.</p>`, 'lv-end');
};
/* ---- ref 1: Purchase opportunity ---- */
window.skhPriceDropOffer = async function (pid) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const p = (room && room.products[pid]) || await getProduct(pid); if (!p) return;
    let r = room && room.rank; if (!r || !r.offer) { try { r = await call('priceDropMyRank', { productId: pid }); } catch (e) {} }
    const o = r && r.offer; if (!o || Number(o.deadline) < Date.now()) return toast('Huna fursa ya kununua kwa sasa.', 'warn');
    modal(`<div class="lv-hero-green"><small>Mnunuzi wa Nafasi ya ${r.rank || 1}</small><h3>PONGEZI! UNA NAFASI YA KUNUNUA</h3></div>
        <div class="lv-pline">${photo(p) ? `<img src="${esc(photo(p))}" alt="">` : ''}<div><b>${esc(p.title)}</b><small>Bei iliyokubaliwa: ${esc(tsh(o.price))} · idadi ${o.qty}</small></div></div>
        <div class="lv-box"><small>MUDA WA FURSA</small><b id="lvOffLeft">${fmtLeft(o.deadline - Date.now())}</b></div>
        <button class="lv-btn" onclick="skhLvModalClose();skhPriceDropOfferCheckout('${esc(pid)}', ${Number(o.price)})">THIBITISHA UNUNUZI</button>
        <div class="lv-rows"><div>${ico('truck', 16)}<span><b>Usafirishaji</b><small>Chagua njia kwenye checkout</small></span></div><div>${ico('shield', 16)}<span><b>SokoPay</b><small>Malipo yanashikiliwa kwenye escrow hadi upokee bidhaa</small></span></div></div>`, 'lv-offer');
};
window.skhPriceDropOfferCheckout = async function (pid, price) {
    const p = await getProduct(pid); if (!p) return;
    skh.currentOpenProduct = p;
    if (typeof window.checkoutSeriousMode === 'function') window.checkoutSeriousMode(price);   // server re-prices from modeData.opportunities
};

/* bottom sheets (phone) + side panel (desktop): products, board (bids / queue), host tools */
window.skhLiveSheet = function (what) {
    const sh = document.getElementById('lv7Sheet'); if (!sh || !room) return;
    if (window.matchMedia('(min-width: 1100px)').matches && what !== 'more') {
        room.side = what; document.querySelectorAll('.lv7-side-tabs button').forEach(x => x.classList.toggle('on', x.dataset.s === what)); paintSide(); return;
    }
    sh.hidden = false; sh.dataset.what = what;
    sh.innerHTML = `<div class="lv7-sheet-card"><header><b>${what === 'products' ? 'Bidhaa kwenye live' : what === 'board' ? boardTitle() : 'Zaidi'}</b><button onclick="document.getElementById('lv7Sheet').hidden=true" aria-label="Funga">${ico('x', 16)}</button></header><div class="lv7-sheet-body">${sideHtml(what)}</div></div>`;
    sh.onclick = (e) => { if (e.target === sh) sh.hidden = true; };
};
function boardTitle() { const p = pinned(); return p && modeOf(p) === 'price_drop' ? 'Viongozi na Nafasi' : 'Historia ya Zabuni'; }
function paintSide() {
    const side = document.getElementById('lv7Side'); if (!side || !room) return;
    const pm = pinned() ? modeOf(pinned()) : (room.session || {}).kind, tab = document.getElementById('lv7BoardTab');
    if (tab) tab.textContent = pm === 'price_drop' ? 'Nafasi' : pm === 'auction' ? 'Zabuni' : 'Muuzaji';
    side.innerHTML = sideHtml(room.side || 'chat');
    const sh = document.getElementById('lv7Sheet'); if (sh && !sh.hidden && sh.dataset.what && sh.dataset.what !== 'more') { const b = sh.querySelector('.lv7-sheet-body'); if (b) b.innerHTML = sideHtml(sh.dataset.what); }
}
function sideHtml(what) {
    const s = room.session || {}, p = pinned(), host = isHost();
    if (what === 'products') {
        const ids = s.productIds || [];
        const rows = ids.length ? ids.map(pid => { const x = room.products[pid]; if (!x) return '';
            return `<div class="lvx-prod ${pid === s.pinnedProductId ? 'on' : ''}">${photo(x) ? `<img src="${esc(photo(x))}" alt="" loading="lazy">` : ''}<span><b>${esc(x.title)}</b><em data-lvx-price="${esc(pid)}">${esc(tsh(listPrice(x)))}</em>${pid === s.pinnedProductId ? '<small class="lv7-now">Inaonyeshwa sasa</small>' : ''}</span>
              <button class="lvx-btn" onclick="skhLiveOpenProduct('${esc(pid)}')">Fungua</button>${host && pid !== s.pinnedProductId && s.status !== 'ended' ? `<button class="lvx-btn lvx-btn-gold" onclick="skhLiveHost('pin','${esc(pid)}')">Onyesha</button>` : ''}</div>`; }).join('')
            : '<p class="lvx-muted">Live hii haina bidhaa.</p>';
        // [D-D1 2026-11-10] Mwenyeji anaweza kubadilisha orodha katikati ya live
        // (liveSetProducts ilikuwepo server lakini haikuwa na UI).
        const edit = (host && s.status !== 'ended' && s.status !== 'removed' && room.id)
            ? `<div class="lvx-prod-edit"><button class="lvx-btn lvx-btn-gold" onclick="skhLiveEditProducts()">Badilisha orodha ya bidhaa</button></div>` : '';
        return rows + edit;
    }
    if (what === 'board') {
        if (p && modeOf(p) === 'price_drop') {
            const b = room.board, r = room.rank;
            const medal = (i) => ['lv-m1', 'lv-m2', 'lv-m3'][i] || '';
            return `<div class="lv7-rank">${b && b.top && b.top.length ? b.top.map((x, i) => `<div class="lv7-rrow ${i === 0 ? 'first' : ''}"><span class="lv7-medal ${medal(i)}">${i + 1}</span><b>${esc(x.name)}</b><em>${esc(tsh(x.price))}</em>${x.status && x.status !== 'queued' ? `<small>${x.status === 'offered' ? 'ana fursa' : x.status === 'bought' ? 'amenunua' : x.status === 'expired' ? 'muda umeisha' : ''}</small>` : ''}</div>`).join('') : '<p class="lvx-muted">Hakuna aliyeweka bei bado.</p>'}</div>
                <div class="lv-box"><small>Nafasi yako</small><b>${r && r.rank ? r.rank + ' kati ya ' + r.count : 'Hujaweka bei'}</b></div>
                <div class="lv-info">${ico('check', 14)} Hali ya foleni: kampeni ikiisha, wa kwanza anapata fursa ya kununua kwa bei yake kwa saa 3; asiponunua, fursa inapewa anayefuata. Majina yamefichwa kwa usalama.</div>
                ${p.userId === me() ? '' : `<button class="lv-btn" onclick="skhPriceSubmit('${esc(p.id)}')">WEKA BEI YAKO</button>`}`;
        }
        if (p && modeOf(p) === 'auction') {
            const list = room.bids || [];
            return list.length ? `<div class="lv7-bids">${list.map((b, i) => `<div class="lv7-brow ${i === 0 ? 'first' : ''}"><span class="lv7-medal">${i + 1}</span><span><b>${esc(maskName(b.name))}</b><small>${b.createdAt ? new Date(b.createdAt).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : ''}</small></span><em>${esc(tsh(b.amount))}</em></div>`).join('')}</div>`
                : '<p class="lvx-muted">Hakuna zabuni bado. Kuwa wa kwanza.</p>';
        }
        return `<div class="lv-kv"><small>Muuzaji</small><b>${esc(s.hostName || '')}</b></div><p class="lvx-muted">${esc(s.description || '')}</p>`;
    }
    if (what === 'more') {
        const rows = [];
        if (host) {
            if (s.status === 'scheduled') rows.push(`<button class="lv7-mrow" onclick="skhLiveHost('start')">${ico('video', 16)} Anza live</button>`);
            /* [AUCTION-LIVE] pause is offered for auction lives; the server enforces pre-1st-bid-only. */
            if (s.status === 'live' && kindOf(s) === 'auction') rows.push(`<button class="lv7-mrow" onclick="skhLiveHost('pause')">${ico('pause', 16)} Sitisha live kwa muda</button>`);
            if (s.status === 'paused') rows.push(`<button class="lv7-mrow" onclick="skhLiveHost('resume')">${ico('play', 16)} Endelea na live</button>`);
            if (s.status === 'live' || s.status === 'scheduled') rows.push(`<button class="lv7-mrow danger" onclick="skhLiveHost('end')">${ico('x', 16)} Maliza live</button>`);
            rows.push(`<div class="lv7-mhead">Simamia maoni</div>` + ((room.comments || []).filter(c => c.kind === 'comment' && c.uid !== me()).slice(-15).map(c => `<div class="lv7-mod"><span><b>${esc(c.name)}</b> ${esc(c.text)}</span>${c.status === 'removed' ? '<small>imeondolewa</small>' : `<button onclick="skhLiveMod('remove_comment','${esc(c.id)}')">Ondoa</button><button onclick="skhLiveMod('mute','${esc(c.uid)}')">Zuia</button>`}</div>`).join('') || '<p class="lvx-muted">Hakuna maoni ya kusimamia.</p>'));
        } else if (room.id) rows.push(`<button class="lv7-mrow" onclick="skhLiveReport()">${ico('alert', 16)} Ripoti live hii</button>`);
        if (p) rows.push(`<button class="lv7-mrow" onclick="skhLiveOpenProduct('${esc(p.id)}')">${ico('package', 16)} Maelezo ya bidhaa</button>`);
        rows.push(`<button class="lv7-mrow" onclick="skhMyBids()">${ico('gavel', 16)} Zabuni zangu</button>`);
        return rows.join('');
    }
    // chat (desktop side)
    const list = (room.comments || []).filter(c => c.status !== 'removed' || host);
    return `<div class="lv7-side-chat">${list.map(c => c.kind === 'system' ? `<div class="lv7-sc sys">${esc(c.text)}</div>` : `<div class="lv7-sc ${c.status === 'removed' ? 'is-removed' : ''}"><span class="lv7-cav">${esc(initials(c.name))}</span><p><b>${esc(c.name || 'Mteja')}</b> ${esc(c.text)}</p>
        ${host && c.uid !== me() && c.status !== 'removed' ? `<span class="lv7-sc-tools"><button onclick="skhLiveMod('remove_comment','${esc(c.id)}')" title="Ondoa">${ico('trash', 12)}</button><button onclick="skhLiveMod('mute','${esc(c.uid)}')" title="Zuia">${ico('lock', 12)}</button></span>` : ''}</div>`).join('') || `<p class="lvx-muted">${room.id ? 'Hakuna maoni bado. Uliza swali la kwanza.' : 'Zabuni zote zinaonekana kwa wakati halisi.'}</p>`}</div>`;
}
window.skhLiveMod = async function (action, target) {
    if (!room || !room.id) return;
    try { await call('liveModerate', Object.assign({ sessionId: room.id, action }, action === 'remove_comment' ? { commentId: target } : { uid: target })); toast(action === 'mute' ? 'Mtumiaji amezuiwa kwenye live hii.' : 'Ujumbe umeondolewa.', 'success'); }
    catch (e) { toast(friendly(e), 'warn'); }
};
window.skhLiveHost = async function (what, pid) {
    if (!room || !room.id) return;
    try {
        if (what === 'start') { await call('liveStart', { sessionId: room.id }); await call('liveJoin', { sessionId: room.id }).then(() => { if (room) room.joined = true; }).catch(() => {}); }
        if (what === 'end') { if (!window.confirm('Maliza live sasa?')) return; const rec = room.session.recordingAllowed ? window.prompt('Link ya rekodi (YouTube/Vimeo), hiari:', '') : ''; await call('liveEnd', { sessionId: room.id, recordingUrl: rec || null }); }
        if (what === 'pause') { await call('livePause', { sessionId: room.id }); toast('Live imesitishwa kwa muda. Zabuni zimesimama.', 'success'); }
        if (what === 'resume') { await call('liveResume', { sessionId: room.id }); toast('Live imeendelea.', 'success'); }
        if (what === 'pin') { await call('livePin', { sessionId: room.id, productId: pid }); room.watching = null; }
        const sh = document.getElementById('lv7Sheet'); if (sh) sh.hidden = true;
    } catch (e) { toast(friendly(e), 'warn'); }
};
/* [D-D1 2026-11-10] Mwenyeji anabadilisha bidhaa zinazoonyeshwa katikati ya live.
 * Orodha mpya inapohifadhiwa, snapshot ya session ina-refresh chumba chenyewe. */
window.skhLiveEditProducts = async function () {
    if (!room || !room.id || !isHost()) return;
    const s = room.session || {};
    if (s.status === 'ended' || s.status === 'removed') { toast('Live imekwisha.', 'warn'); return; }
    const kind = s.kind || 'live';
    const needMode = kind === 'auction' ? 'auction' : kind === 'price_drop' ? 'price_drop' : null;
    const uid = me();
    const el = sheet('lvxEditProducts', `<div class="lvx-panel lvx-form" role="dialog" aria-label="Badilisha bidhaa">
        <header class="lvx-head"><button class="lvx-icon-btn" onclick="skhLiveClose('lvxEditProducts')" aria-label="Funga">${ico('back', 18)}</button><div><b>Bidhaa za live</b><small>Chagua zinazoonyeshwa (hadi 20)</small></div></header>
        <div id="lvxEditPick" class="lvx-pick">Inapakia bidhaa zako…</div>
        <div class="lvx-actions"><button class="lvx-btn" onclick="skhLiveClose('lvxEditProducts')">Ghairi</button><button class="lvx-btn lvx-btn-primary" id="lvxEditGo">Hifadhi orodha</button></div></div>`);
    try {
        const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', uid), skh.limit(60)));
        const cur = s.productIds || [];
        const docs = snap.docs.filter(d => !needMode || modeOf(d.data()) === needMode);
        document.getElementById('lvxEditPick').innerHTML = docs.length ? docs.map(d => { const p = d.data();
            return `<label class="lvx-pick-item"><input type="checkbox" value="${esc(d.id)}"${cur.indexOf(d.id) !== -1 ? ' checked' : ''}>${photo(p) ? `<img src="${esc(photo(p))}" alt="">` : ''}<span>${esc(p.title || 'Bidhaa')}</span><em>${esc(tsh(p.price))}</em></label>`; }).join('')
            : `<span class="lvx-muted">${needMode === 'auction' ? 'Huna bidhaa za mnada.' : needMode === 'price_drop' ? 'Huna bidhaa za Bei Kushuka.' : 'Huna bidhaa bado.'}</span>`;
    } catch (e) { document.getElementById('lvxEditPick').textContent = errText(e); }
    el.querySelector('#lvxEditGo').onclick = async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true;
        const ids = [...el.querySelectorAll('#lvxEditPick input:checked')].map(i => i.value).slice(0, 20);
        try {
            await call('liveSetProducts', { sessionId: room.id, productIds: ids });
            closeSheet('lvxEditProducts'); toast('Orodha ya bidhaa imehifadhiwa.', 'success');
        } catch (e) { toast(friendly(e), 'warn'); btn.disabled = false; }
    };
};
window.skhLiveReport = async function () {
    if (!room || !room.id) return;
    const reason = window.prompt('Eleza tatizo la live hii (mf. bidhaa za uongo, lugha mbaya):', '');
    if (!reason) return;
    try { await call('liveReport', { sessionId: room.id, reason }); toast('Asante. Ripoti imetumwa kwa wasimamizi.', 'success'); } catch (e) { toast(friendly(e), 'warn'); }
};
/* Product sheet opens ABOVE the room (the live keeps running underneath). */
window.skhLiveOpenProduct = function (pid) { if (typeof window.openProduct === 'function') window.openProduct(pid, 'products'); };

/* ======================================================================
 * ZABUNI ZANGU — ref 5 "My Bids (Buyer Dashboard)"
 * ==================================================================== */
window.skhMyBids = async function (filter) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const el = sheet('lvxMyBids', `<div class="lvx-panel lvmb" role="dialog" aria-label="Zabuni zangu">
        <header class="lvx-head"><button class="lvx-icon-btn" onclick="skhLiveClose('lvxMyBids')" aria-label="Rudi">${ico('back', 18)}</button><div><b>Zabuni Zangu</b><small>Minada uliyoshiriki</small></div></header>
        <div id="lvmbBody" class="lvmb-body"><div class="lvh-empty">Inapakia…</div></div></div>`);
    let rows = [];
    try {
        const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'auction_participation'), skh.where('uid', '==', me()), skh.orderBy('lastBidAt', 'desc'), skh.limit(60)));
        rows = await Promise.all(snap.docs.map(async d => { const r = d.data(); const p = await getProduct(r.productId); return { r, p }; }));
    } catch (e) { el.querySelector('#lvmbBody').innerHTML = `<div class="lvh-empty"><b>Imeshindikana kupakia</b><span>${esc(friendly(e))}</span></div>`; return; }
    const now = Date.now();
    const cls = ({ p }) => { if (!p) return 'lost'; const a = auctionState(p, now); if (!a.ended) return 'active'; if (a.winner === me()) return (p.modeData || {}).winnerPaid ? 'won' : 'pay'; return 'lost'; };
    const groups = { active: [], won: [], lost: [], pay: [] }; rows.forEach(x => groups[cls(x)].push(x));
    const ROW = [['active', 'Zabuni zinazoendelea', 'gavel'], ['won', 'Minada niliyoshinda', 'award'], ['lost', 'Minada niliyoshindwa', 'x'], ['pay', 'Malipo yanayosubiri', 'wallet']];
    const body = el.querySelector('#lvmbBody');
    const list = (k) => groups[k].map(({ r, p }) => { const a = p ? auctionState(p, now) : null;
        return `<button class="lvmb-item" onclick="${k === 'pay' ? `skhLiveWinner('${esc(r.productId)}')` : `skhAuctionRoom('${esc(r.productId)}')`}">${r.image ? `<img src="${esc(r.image)}" alt="">` : ''}<span><b>${esc(r.title || 'Mnada')}</b><small>Zabuni yangu: ${esc(tsh(r.myBid))}${a ? ' · ya juu: ' + esc(tsh(a.cur)) : ''}</small>
        <em>${k === 'active' ? (a && a.leader === me() ? 'Unaongoza · ' : 'Umepitwa · ') + 'inaisha ' + fmtLeft(a.left) : k === 'pay' ? 'Lipa kabla ya ' + fmtLeft(a.deadline - now) : k === 'won' ? 'Imelipwa' : 'Mnada umefungwa'}</em></span></button>`; }).join('') || '<p class="lvx-muted">Hakuna hapa bado.</p>';
    body.innerHTML = `<div class="lvmb-rows">${ROW.map(([k, t, i]) => `<button class="lvmb-row ${filter === k ? 'on' : ''}" data-k="${k}"><span class="lvmb-ic lvmb-${k}">${ico(i, 18)}</span><b>${t}</b><em>${groups[k].length}</em>${ico('chevron', 14)}</button>`).join('')}</div><div class="lvmb-list" id="lvmbList">${list(filter || 'active')}</div>`;
    body.querySelectorAll('.lvmb-row').forEach(b => b.onclick = () => { body.querySelectorAll('.lvmb-row').forEach(x => x.classList.toggle('on', x === b)); body.querySelector('#lvmbList').innerHTML = list(b.dataset.k); });
    if (!filter) body.querySelector('.lvmb-row').classList.add('on');
};

/* ======================================================================
 * NYUMBANI: "Live na fursa za soko" — ref 6
 * ==================================================================== */
async function mountHomeLive() {
    const hero = document.getElementById('skhHomeHero'); if (!hero || document.getElementById('lvHome')) return;
    const box = document.createElement('section'); box.id = 'lvHome'; box.className = 'lvhome'; box.hidden = true;
    hero.parentNode.insertBefore(box, hero.nextSibling);
    try {
        const now = Date.now();
        const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'live_sessions'), skh.where('status', '==', 'live'), skh.orderBy('updatedAt', 'desc'), skh.limit(8)));
        const items = [];
        for (const d of snap.docs) { const s = Object.assign({ id: d.id }, d.data()); const pid = s.pinnedProductId || (s.productIds || [])[0]; const p = pid ? await getProduct(pid) : null; items.push({ s, p, open: `skhLiveOpen('${esc(s.id)}')` }); }
        if (items.length < 5) {
            const au = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.where('saleMode', '==', 'auction'), skh.limit(10))).catch(() => ({ docs: [] }));
            au.docs.forEach(d => { const p = Object.assign({ id: d.id }, d.data()); if (!auctionState(p, now).ended && !items.some(x => x.p && x.p.id === p.id)) items.push({ s: { kind: 'auction', viewerCount: null }, p, open: `skhAuctionRoom('${esc(p.id)}')` }); });
        }
        const feat = items.find(x => x.p && kindOf(x.s) === 'auction') || items.find(x => x.p);
        if (!feat) return;
        const rest = items.filter(x => x !== feat && x.p).slice(0, 4);
        const fa = modeOf(feat.p) === 'auction' ? auctionState(feat.p, now) : null;
        box.innerHTML = `<h2 class="lvhome-h">LIVE NA FURSA ZA SOKO <button onclick="skhLiveHub()">Zote ${ico('arrow-right', 14)}</button></h2>
          <div class="lvhome-grid"><article class="lvhome-feat" onclick="${feat.open}"><span class="lvhome-pill">${ico('radio', 12)} ${fa ? 'MNADA LIVE' : TYPE[kindOf(feat.s)].badge}</span>
            <div class="lvhome-img">${photo(feat.p) ? `<img src="${esc(photo(feat.p))}" alt="${esc(feat.p.title)}" loading="lazy">` : ''}</div>
            <div class="lvhome-body"><h3>${esc(feat.p.title)}</h3><p>Bei ya sasa: <b>${esc(tsh(listPrice(feat.p)))}</b></p>
            ${fa ? `<p>Muda uliobaki: <b data-lvh-end="${Number(fa.md.endTime) || 0}">${fmtLeft(fa.left)}</b></p>` : ''}${feat.s.viewerCount != null ? `<p>Watazamaji: <b>${kshort(feat.s.viewerCount)}</b></p>` : `<p>Zabuni: <b>${fa ? fa.bids : 0}</b></p>`}
            <button class="lvhome-cta">${fa ? 'ANGALIA MNADA' : 'INGIA LIVE'}</button></div></article>
          <div class="lvhome-small">${rest.map(x => `<article class="lvhome-mini" onclick="${x.open}"><div class="lvhome-img">${photo(x.p) ? `<img src="${esc(photo(x.p))}" alt="" loading="lazy">` : ''}</div><small>${esc(modeOf(x.p) === 'auction' ? 'Mnada' : modeOf(x.p) === 'price_drop' ? 'Bei kushuka' : 'Live')}</small><b>${esc(x.p.title)}</b><span>Bei ya sasa: <b>${esc(tsh(listPrice(x.p)))}</b></span></article>`).join('')}</div></div>`;
        box.hidden = false;
        setInterval(() => { const n = Date.now(); box.querySelectorAll('[data-lvh-end]').forEach(e => { e.textContent = fmtLeft(Number(e.dataset.lvhEnd) - n); }); }, 1000);
    } catch (e) { /* the home page stays as it is */ }
}
let homeTries = 0;
const homeTimer = setInterval(() => { homeTries++; if (skh.db && document.getElementById('skhHomeHero')) { clearInterval(homeTimer); mountHomeLive(); } if (homeTries > 60) clearInterval(homeTimer); }, 1000);

/* ======================================================================
 * PRODUCT PAGE panels — ref 5/6 (auction) and ref 2 (price drop)
 * called from js/app/07-product.js renderSpecialModesUI (falls back to the old panel if absent)
 * ==================================================================== */
window.skhLiveProductPanel = function (mode, p, area) {
    if (!p || !area) return false;
    const now = Date.now();
    if (mode === 'auction') {
        const a = auctionState(p, now), md = a.md, won = a.ended && me() && a.winner === me();
        const pillTxt = a.ended ? 'MNADA UMEFUNGWA' : a.paused ? '\u23f8 IMESITISHWA' : a.endingSoon ? 'MNADA LIVE \u00b7 \u23f3 INAKARIBIA KUISHA' : 'MNADA LIVE';
        area.innerHTML = `<div class="lvp">
            <div class="lvp-top"><span class="lvp-pill">${ico('radio', 12)} ${pillTxt}</span><span class="lvp-timer" data-lvh-end="${Number(md.endTime) || 0}">${a.ended ? '00:00' : fmtLeft(a.left)}</span></div>
            <div class="lvp-kv"><small>${a.ended ? 'Zabuni iliyoshinda' : 'Bei ya sasa'}</small><b>${esc(tsh(a.ended ? a.winBid : a.cur))}</b><em>${a.bids} zabuni \u00b7 ${a.bidders} wazabuni${a.extensions > 0 && !a.ended ? ` \u00b7 \u23f1 +2:00 \u00d7${a.extensions}` : ''}</em></div>
            <div class="lvp-rules"><b>SHERIA ZA MNADA</b><span>Bei ya kuanzia: ${esc(tsh(p.price))}</span><span>Nyongeza ya chini: ${md.minIncrement ? esc(tsh(md.minIncrement)) : (md.minIncrementPct || 5) + '% ya zabuni ya juu'}</span>
              <span>Inaisha: ${md.endTime ? new Date(Number(md.endTime)).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span><span>Malipo: ndani ya saa 24 kupitia SokoPay (escrow)</span></div>
            <div class="lvp-acts">${won ? `<button class="lvp-btn gold" onclick="skhLiveWinner('${esc(p.id)}')">LIPA SASA</button>` : a.ended ? '' : a.paused ? `<button class="lvp-btn" disabled>\u23f8 IMESITISHWA</button>` : `<button class="lvp-btn" onclick="skhBidConfirm('${esc(p.id)}')">WEKA ZABUNI</button>`}
              <button class="lvp-btn ghost skh-auction-room-btn" onclick="skhAuctionRoom('${esc(p.id)}')">INGIA KWENYE MNADA ${ico('arrow-right', 14)}</button></div></div>`;
        return true;
    }
    if (mode === 'price_drop') {
        const d = dropPrice(p, now), md = p.modeData || {}, ended = dropEnded(p, now);
        const per = Number(md.intervalMs) >= 3600000 ? 'saa' : 'dakika ' + Math.round((Number(md.intervalMs) || 60000) / 60000);
        area.innerHTML = `<div class="lvp lvp-pd" data-mode-panel="price_drop" data-live-price="${d.price}">
            <div class="lvp-top"><span class="lvp-pill blue">${ico('zap', 12)} PRICE DROP</span><span class="lvp-timer" data-lvh-end="${Number(md.endTime) || 0}">${ended ? '00:00' : fmtLeft(Number(md.endTime) - now)}</span></div>
            <div class="lvp-drop"><div><small>Bei ya Kuanzia</small><b>${esc(tsh(d.base))}</b></div><div><small>Bei ya Sasa (Inayoshuka)</small><b class="green">${esc(tsh(ended ? d.min : d.price))}</b></div><div><small>Bei ya Mwisho</small><b>${esc(tsh(d.min))}</b></div>
              <div><small>Punguzo la kila ${per}</small><b>${esc(tsh(md.dropAmount))}</b></div></div>
            <div class="lvp-prog"><i style="width:${d.pct}%"></i></div>
            <div class="lvp-q" id="lvpRank">Nafasi Yako: <b>—</b><span>Status: ${ended ? 'Kampeni imeisha' : 'Inaendelea'}</span></div>
            <div class="lvp-acts">${ended ? `<button class="lvp-btn" onclick="skhPriceDropEnd('${esc(p.id)}')">MATOKEO YA KAMPENI</button>` : p.userId === me() ? '' : `<button class="lvp-btn" onclick="skhPriceSubmit('${esc(p.id)}')">WEKA BEI YAKO</button><button class="lvp-btn ghost" onclick="skhPriceDropCheckout('${esc(p.id)}')">NUNUA SASA ${esc(tsh(d.price))}</button>`}
              <button class="lvp-btn ghost" onclick="skhPriceDropRoom('${esc(p.id)}')">INGIA LIVE ${ico('arrow-right', 14)}</button></div>
            <small class="lvp-note">Wanaoweka bei wanapangwa kwa bei ya juu kwanza. Kampeni ikiisha, wa kwanza anapata fursa ya kununua kwa bei yake.</small></div>`;
        if (me()) call('priceDropMyRank', { productId: p.id }).then(r => { const el = document.getElementById('lvpRank'); if (el && r) el.querySelector('b').textContent = r.offer ? 'Una fursa ya kununua!' : r.rank ? r.rank + ' kati ya ' + r.count : 'Hujaweka bei'; }).catch(() => {});
        return true;
    }
    return false;
};
setInterval(() => { const n = Date.now(); document.querySelectorAll('.lvp [data-lvh-end]').forEach(e => { const end = Number(e.dataset.lvhEnd); e.textContent = end > n ? fmtLeft(end - n) : '00:00'; }); }, 1000);
/* ==== js/app/123-home-layout.js ==== */
/* [R13-E 2026-11] Nyumbani in the owner's order (design refs 11, 12, 13, 14, 15):
 *   simu (ref 11):    Gundua Soko -> banner -> njia 4 -> Bidhaa Maarufu -> Live na fursa -> soko
 *   desktop (ref 14): carousel (Escrow / Jamii) -> njia 6 -> Discover New Updates -> matangazo 3 (ref 12)
 *                     -> Live na fursa -> Gundua Soko -> Bidhaa Maarufu -> soko
 * Order is CSS (css/66-home-layout.css) on #buyerView; this module only ADDS sections built from
 * real records (no invented sellers, sponsors, discounts or stock). Every button calls an existing
 * function. Sections with no data stay hidden (no empty boxes). */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tsh = (n) => 'TSh ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const ico = (n, s) => (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : '');
const pic = (p) => (p && (p.image || (Array.isArray(p.imagesArray) && p.imagesArray[0]) || p.vehicleImage || p.coverImage)) || '';
const short = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
// [NAME-FALLBACK 2026-11-09] Kadi za home: title -> name -> itemTitle -> cargoName.
// Kwa wenye title, matokeo ni sawa na p.title (name haifikiki). Hairudi uongo: '' kama hakuna.
const ptitle = (o) => { const v = o ? (o.title || o.name || o.itemTitle || o.cargoName) : ''; return (typeof v === 'string' || typeof v === 'number') ? String(v) : ''; };
const live = (p) => p && p.publicationStatus !== 'draft' && !p.adminHidden && p.moderationStatus !== 'removed';

/* ---------------- carousel (ref 12/13/14 arrows + dots) ---------------- */
let heroIdx = 0, heroTimer = 0;
window.skhHeroGo = function (d, abs) {
    const track = document.getElementById('shcTrack'); if (!track) return;
    const n = track.children.length;
    heroIdx = abs != null ? abs : (heroIdx + d + n) % n;
    track.style.transform = 'translateX(' + (-100 * heroIdx) + '%)';
    document.querySelectorAll('#shcDots button').forEach((b, i) => b.classList.toggle('on', i === heroIdx));
    clearInterval(heroTimer); heroTimer = setInterval(() => window.skhHeroGo(1), 9000);
};
function initCarousel() {
    const dots = document.querySelectorAll('#shcDots button'); if (!dots.length) return false;
    dots.forEach((b, i) => b.onclick = () => window.skhHeroGo(0, i));
    const track = document.getElementById('shcTrack'); let x0 = null;
    track.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) window.skhHeroGo(dx < 0 ? 1 : -1); x0 = null; }, { passive: true });
    // phone (ref 11) shows the community banner first; desktop (ref 14) the Escrow slide
    window.skhHeroGo(0, window.matchMedia('(max-width: 899px)').matches ? 1 : 0);
    return true;
}

/* ---------------- "Jifunze zaidi" about Escrow (no new money logic) ---------------- */
window.skhEscrowInfo = function () {
    let el = document.getElementById('lvModal');
    if (!el) { el = document.createElement('div'); el.id = 'lvModal'; document.body.appendChild(el); }
    el.className = 'lv-modal'; el.hidden = false; el.style.display = '';
    const steps = [['Weka oda', 'Chagua bidhaa na uweke oda.'], ['Malipo salama', 'Unalipa kupitia SokoPay; pesa zinashikiliwa kwenye Escrow.'], ['Tuma mzigo', 'Muuzaji anatuma bidhaa.'], ['Pokea na kagua', 'Unapokea na kukagua bidhaa.'], ['Malipo kwa muuzaji', 'Ukithibitisha, muuzaji analipwa.']];
    el.innerHTML = `<div class="lv-modal-card" role="dialog" aria-modal="true"><button class="lv-modal-x" onclick="skhLvModalClose()" aria-label="Funga">${ico('x', 16)}</button>
        <div class="lv-mav">${ico('shield-check', 26)}</div><h3>Malipo Salama kupitia Escrow</h3><p class="lv-muted">Malipo yako yanalindwa hadi upokee na kukagua mzigo wako.</p>
        <ol class="shc-info">${steps.map((s, i) => `<li><b>${i + 1}. ${s[0]}</b><span>${s[1]}</span></li>`).join('')}</ol>
        <button class="lv-btn" onclick="skhLvModalClose(); window.openBuyerOrdersModal && openBuyerOrdersModal()">Oda zangu</button></div>`;
    el.onclick = (e) => { if (e.target === el) el.hidden = true; };
    if (!window.skhLvModalClose) window.skhLvModalClose = () => { el.hidden = true; };
};

/* ---------------- sections ---------------- */
function section(id, title, more, icon) {
    let s = document.getElementById(id); if (s) return s;
    const host = document.getElementById('buyerView'); if (!host) return null;
    s = document.createElement('section'); s.id = id; s.className = 'shx'; s.hidden = true;
    s.innerHTML = `<header class="shx-h"><h2>${icon ? `<span class="shx-hi">${ico(icon, 18)}</span>` : ''}${esc(title)}</h2>${more ? `<button type="button" onclick="${more}">${more.indexOf('Hub') !== -1 ? 'Ona Zote' : 'Ona zaidi'} ${ico('arrow-right', 14)}</button>` : ''}</header><div class="shx-body"></div>`;
    host.appendChild(s);
    return s;
}
async function q(col, ...c) { try { return (await skh.getDocs(skh.query(skh.collection(skh.db, col), ...c))).docs.map(d => Object.assign({ id: d.id }, d.data())); } catch (e) { return []; } }

/* ref 11 "Bidhaa Maarufu": most viewed real listings; discount only when the listing has a real old price */
async function buildPopular() {
    const s = section('skhHomePopular', 'Bidhaa Maarufu', "updateApp('bidhaa')", 'star'); if (!s) return;
    const list = (await q('products', skh.limit(60))).filter(p => live(p) && pic(p) && !(p.saleMode && p.saleMode !== 'free_market' && p.saleMode !== 'wholesale'));
    list.sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const top = list.slice(0, 8); if (!top.length) return;
    s.querySelector('.shx-body').innerHTML = `<div class="shp-row">${top.map(p => {
        const old = Number(p.originalPrice || p.oldPrice || p.compareAtPrice || 0), price = Number(p.price) || 0;
        const off = old > price && price > 0 ? Math.round((1 - price / old) * 100) : 0, stock = Number(p.stock) || 0;
        return `<article class="shp-card" onclick="openProduct('${esc(p.id)}','products')">${off ? `<span class="shp-off">-${off}%</span>` : `<button class="shp-heart" aria-label="Hifadhi" onclick="event.stopPropagation(); window.skhToggleSave && skhToggleSave({id:'${esc(p.id)}',collectionName:'products',title:'${esc(String(ptitle(p)).replace(/'/g, ''))}'}, this)">${ico('heart', 18)}</button>`}
            <div class="shp-img"><img src="${esc(pic(p))}" alt="${esc(ptitle(p))}" loading="lazy" onerror="this.closest('.shp-card').remove()"></div>
            <b class="shp-t">${esc(short(ptitle(p), 40))}</b><strong>${esc(tsh(price))}</strong>${off ? `<s>${esc(tsh(old))}</s>` : ''}
            <span class="shp-stock ${stock > 0 ? '' : 'out'}" data-no-i18n>${ico(stock > 0 ? 'check' : 'x', 13)} ${stock > 0 ? 'Inapatikana' : 'Imeisha'}</span></article>`; }).join('')}</div>`;
    s.hidden = false;
}

/* ref 12/14 "Discover New Updates": one real, recent record per type; label = what it is (no fake "Sponsored") */
async function buildUpdates() {
    const s = section('skhHomeUpdates', 'Discover New Updates', "window.skhLiveHub ? skhLiveHub('deals') : updateApp('bidhaa')", 'bolt'); if (!s) return;
    const [prods, svcs, drv, pd, au] = await Promise.all([
        q('products', skh.orderBy('createdAt', 'desc'), skh.limit(20)), q('services', skh.limit(20)), q('drivers', skh.limit(20)),
        q('products', skh.where('saleMode', '==', 'price_drop'), skh.limit(10)), q('products', skh.where('saleMode', '==', 'auction'), skh.limit(10))]);
    const now = Date.now(), cards = [];
    const catPic = (p) => pic(p) || (window.skhCategoryImage ? window.skhCategoryImage({ category: p.category || p.reqCategory || p.vehicleType }) : '') || '';
    const prod = prods.find(p => live(p) && pic(p) && (!p.saleMode || p.saleMode === 'free_market' || p.saleMode === 'wholesale'));
    if (prod) cards.push({ tag: 'Bidhaa', cls: 'g', img: pic(prod), t: ptitle(prod), sub: prod.description || prod.category, who: prod.ownerName || prod.sellerName, cta: 'Angalia', go: `openProduct('${esc(prod.id)}','products')` });
    const svc = svcs.find(live); if (svc) cards.push({ tag: 'Huduma', cls: 'b', img: catPic(svc), t: svc.title, sub: svc.description || svc.subCategory || svc.category, who: svc.ownerName || svc.providerName, cta: 'Omba', go: `openProduct('${esc(svc.id)}','services')` });
    const d = drv.find(x => x.status !== 'suspended'); if (d) cards.push({ tag: 'Usafiri', cls: 'b', img: catPic(d), t: d.title || d.vehicleType || 'Usafiri', sub: d.description || d.route || d.location, who: d.driverName || d.ownerName, cta: 'Tafuta', go: `updateApp('delivery')` });
    const o = pd.find(p => live(p) && !(Number((p.modeData || {}).endTime) <= now)); if (o) cards.push({ tag: 'Ofa', cls: 'y', img: catPic(o), t: o.title, sub: 'Bei inashuka hadi ' + tsh((o.modeData || {}).minPrice), who: o.ownerName || o.sellerName, cta: 'Tumia Ofa', go: `skhPriceDropRoom('${esc(o.id)}')` });
    const a = au.find(p => live(p) && !(p.modeData || {}).ended && !(Number((p.modeData || {}).endTime) <= now)); if (a) cards.push({ tag: 'Mnada', cls: 'p', img: catPic(a), t: a.title, sub: 'Anza bei yako kuanzia ' + tsh(a.price), who: a.ownerName || a.sellerName, cta: 'Shiriki Mnada', go: `skhAuctionRoom('${esc(a.id)}')` });
    if (!cards.length) return;
    s.querySelector('.shx-body').innerHTML = `<div class="shu-row">${cards.map(c => `<article class="shu-card"><div class="shu-img">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : ''}<span class="shu-tag shu-${c.cls}">${esc(c.tag)}</span></div>
        <b>${esc(short(c.t, 36))}</b><small>${esc(short(c.sub, 46))}</small><div class="shu-foot"><span>${ico('shop', 14)} ${esc(short(c.who || 'SokoHai', 20))}</span><button class="shu-cta shu-${c.cls}" onclick="${c.go}">${esc(c.cta)}</button></div></article>`).join('')}</div>`;
    s.hidden = false;
}

/* ref 12 promo row: Malipo Salama · Ufuatiliaji wa Usafirishaji · Mawakala wa SokoHai */
function buildPromos() {
    const s = section('skhHomePromos', '', null); if (!s) return;
    s.classList.add('shx-promos'); s.querySelector('.shx-h').remove();
    s.querySelector('.shx-body').innerHTML = `<div class="shm-row">
        <button class="shm shm-g" onclick="skhEscrowInfo()"><span class="shm-ic">${ico('shield-check', 30)}</span><span><b>Malipo Salama</b><small>kupitia Escrow</small></span><em>Jifunze Zaidi ${ico('arrow-right', 13)}</em></button>
        <button class="shm shm-b" onclick="window.openTrackingTokenLookup ? openTrackingTokenLookup() : updateApp('delivery')"><span class="shm-ic">${ico('truck', 30)}</span><span><b>Ufuatiliaji wa Usafirishaji</b><small>Mzigo wako salama</small></span><em>Tazama Hapa ${ico('arrow-right', 13)}</em></button>
        <button class="shm shm-y" onclick="window.showForm ? showForm('agentForm') : null"><span class="shm-ic">${ico('handshake', 30)}</span><span><b>Mawakala wa SokoHai</b><small>Huduma karibu nawe</small></span><em>Jiunge Sasa ${ico('arrow-right', 13)}</em></button></div>`;
    s.hidden = false;
}

let built = false;
async function build() {
    if (built || !skh.db || !document.getElementById('buyerView') || !document.getElementById('skhHomeHero')) return false;
    built = true;
    initCarousel();
    buildPromos();
    await Promise.all([buildUpdates(), buildPopular()]);
    return true;
}
const t = setInterval(async () => { if (await build()) clearInterval(t); }, 800);
setTimeout(() => clearInterval(t), 60000);

/* ==== js/app/124-pos-grid.js ==== */
/* [R13-E 2026-11] POS cashier grid (owner design refs 17 "POS Mauzo ya Dukan - cashier workflow"
 * and 18 "Cashier workflow"): a grid of the shop's own products with photo, name, price and stock
 * above the existing search. Tapping a tile adds it through the SAME path as a search result
 * (skhPosRemember + addPosCartItemById), so cart, variants, payment, receipt and offline queue are
 * the existing POS. Read-only: no new data, collection or rule. */
import { skh } from './00-bootstrap.js';
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tsh = (n) => 'TSh ' + Math.round(Number(n) || 0).toLocaleString('en-US');
let items = [], loadedFor = null, filter = '';
async function load() {
    const owner = (skh.currentUserData && skh.currentUserData.shopOwnerUid) || (skh.currentUser && skh.currentUser.uid);
    if (!owner || loadedFor === owner) return;
    loadedFor = owner;
    let list = [];
    try { list = (await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', owner), skh.limit(80)))).docs.map(d => Object.assign({ id: d.id }, d.data())); }
    catch (e) { try { list = (skh.cachedItems || []).filter(d => d && d.userId === owner); } catch (x) {} }
    items = list.filter(d => d.publicationStatus !== 'draft' && !d.adminHidden && (!d.saleMode || d.saleMode === 'free_market' || d.saleMode === 'wholesale'));
    paint();
}
function paint() {
    const box = document.getElementById('posGrid'); if (!box) return;
    const cats = [...new Set(items.map(d => d.subCategory || d.category).filter(Boolean))].slice(0, 8);
    const list = items.filter(d => !filter || (d.subCategory || d.category) === filter);
    box.innerHTML = items.length ? `<div class="posg-cats"><button class="${filter ? '' : 'on'}" data-c="">Zote</button>${cats.map(c => `<button class="${filter === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="posg-grid">${list.map(d => { const img = d.image || (d.imagesArray || [])[0]; const st = Number(d.stock) || 0;
            return `<button type="button" class="posg-tile ${st > 0 ? '' : 'out'}" data-id="${esc(d.id)}" ${st > 0 ? '' : 'disabled'}>${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="posg-noimg"></span>'}<b>${esc(d.title)}</b><em>${esc(tsh(d.price))}</em><small>${st > 0 ? 'Zipo ' + st : 'Imeisha'}</small></button>`; }).join('')}</div>`
        : '<p class="posg-empty">Bidhaa za duka lako zitaonekana hapa. Unaweza pia kutafuta au kuscan hapo chini.</p>';
    box.querySelectorAll('.posg-cats button').forEach(b => b.onclick = () => { filter = b.dataset.c; paint(); });
    box.querySelectorAll('.posg-tile').forEach(b => b.onclick = () => { const d = items.find(x => x.id === b.dataset.id); if (!d || !window.skhPosRemember || !window.addPosCartItemById) return;
        window.skhPosRemember(d); window.addPosCartItemById(d.id); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); });
}
function mount() {
    const area = document.getElementById('posSaleArea'); if (!area || document.getElementById('posGrid')) return;
    const box = document.createElement('div'); box.id = 'posGrid'; box.className = 'posg';
    area.insertBefore(box, area.firstChild);
    paint(); load();
}
const mo = new MutationObserver(() => { const f = document.getElementById('businessOSForm'); if (f && f.offsetParent !== null) { mount(); load(); } });
if (document.body) mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
setTimeout(mount, 3000);

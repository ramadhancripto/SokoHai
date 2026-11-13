/* ==== js/app/125-group-business.js ==== */
/* [R13-H 2026-11] Group Chat — PHASE 2 business sections, called by js/app/73-group-soga.js.
 * Every section reads EXISTING records only (no duplicate catalogs/order/delivery systems):
 *   Huduma        services/{id}  (members' published services + services shared in the chat)
 *   Soko          chatGroups/{gid}/soko/{id}  listings that point at real products/services, or member ads;
 *                 approval / suspension / expiry by group owner/admin — ENFORCED by firestore.rules
 *   Group Buy     products with saleMode 'group_buy' (server: groupBuyJoin) + chatGroups/{gid}/groupOrders (read)
 *   Oda           orders/{id} (buyer or seller = me) linked to the group (groupId or a listing shared here)
 *   Mapatano      negotiations/{id} through the server engine (negotiationSendOffer / negotiationAction)
 *   Ofa           members' listings with a real discount / Bei Kushuka + supplier offers of group orders
 *   Usafirishaji  delivery data of those orders, delivery_offers for my orders, members' drivers/{id}
 *   Panel         group doc, members, rules, permissions, pinned notice, activity summary
 * Money that has no backend here (paid ad slots, ad revenue, chat group-order creation) is shown as
 * BLOCKED — never simulated. */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tzs = (n) => 'TSh ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const toast = (m, k) => { try { (window.skhToast || window.sokohaiToast || console.log)(m, k || 'info', 4200); } catch (e) {} };
const call = (n, d) => skh.callFunction(n, d).then(r => (r && r.data) || r);
const errText = (e) => (window.skhFnErrText ? window.skhFnErrText(e) : (e && e.message) || 'Hitilafu');
/* the app replaces window.prompt/confirm (js/05-dialogs.js) — use its async dialogs */
const ask = async (msg, def) => { if (typeof window.skhPrompt === 'function') { const v = await window.skhPrompt(msg, def == null ? '' : def); return v == null ? null : String(v); } return null; };
const askYes = async (msg) => (typeof window.skhConfirm === 'function' ? !!(await window.skhConfirm(msg)) : false);
const me = () => (skh.currentUser && skh.currentUser.uid) || '';
const C = (p) => skh.collection(skh.db, p), D = (p) => skh.doc(skh.db, p);
const imgOf = (p) => p.image || (Array.isArray(p.imagesArray) && p.imagesArray[0]) || (Array.isArray(p.images) && p.images[0]) || p.photo || '';
const day = (v) => { if (!v) return ''; const d = typeof v === 'number' ? new Date(v) : new Date(String(v)); return isNaN(d) ? '' : d.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short', year: 'numeric' }); };
const SVG = {
    eye: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    chat: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5a3 3 0 0 1-3 3H9l-4.5 3V6.5a3 3 0 0 1 3-3h9.5a3 3 0 0 1 3 3z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

/* ---------------- shared loaders (cached per group for 30 s) ---------------- */
const cache = {};
function memo(key, ms, fn) { const c = cache[key]; if (c && Date.now() - c.t < ms) return c.p; const p = fn(); cache[key] = { t: Date.now(), p }; p.catch(() => { delete cache[key]; }); return p; }
function bust(gid) { Object.keys(cache).forEach(k => { if (k.indexOf(gid) >= 0) delete cache[k]; }); }
function memberIds(ctx) { return Object.keys(ctx.roles || {}); }
async function byOwners(col, ids, extra) {
    const out = [];
    for (let i = 0; i < ids.length; i += 10) {
        const s = await skh.getDocs(skh.query(C(col), skh.where('userId', 'in', ids.slice(i, i + 10)), skh.limit(120)));
        s.forEach(d => { const x = Object.assign({ __id: d.id, __col: col }, d.data()); if (!extra || extra(x)) out.push(x); });
    }
    return out;
}
const published = (x) => !x.publicationStatus || x.publicationStatus === 'published';
/* listings shared inside the chat (typed product/service messages) */
function sharedRefs(gid) {
    return memo('sh:' + gid, 30000, async () => {
        const s = await skh.getDocs(skh.query(C('conversations/conv_group_' + gid + '/messages'), skh.limit(400)));
        const prod = new Set(), svc = new Set();
        s.forEach(d => { const m = d.data() || {};
            if (m.type === 'product' && m.product && m.product.productId) prod.add(m.product.productId);
            if (m.type === 'service' && m.service && m.service.serviceId) svc.add(m.service.serviceId);
            if (m.type === 'negotiation' && m.negotiation && m.negotiation.productId) prod.add(m.negotiation.productId); });
        return { prod, svc };
    });
}
async function docsByIds(col, ids) {
    const out = [];
    for (const id of ids) { try { const s = await skh.getDoc(D(col + '/' + id)); if (s.exists()) out.push(Object.assign({ __id: s.id, __col: col }, s.data())); } catch (e) {} }
    return out;
}
function memberProducts(ctx) { return memo('mp:' + ctx.gid, 30000, () => byOwners('products', memberIds(ctx), published)); }
function memberServices(ctx) { return memo('ms:' + ctx.gid, 30000, () => byOwners('services', memberIds(ctx), published)); }
function groupOrders(ctx) {
    return memo('or:' + ctx.gid, 20000, async () => {
        const sh = await sharedRefs(ctx.gid), mem = new Set(memberIds(ctx)), seen = {}, rows = [];
        for (const [field, role] of [['buyerId', 'buyer'], ['sellerId', 'seller']]) {
            try {
                const s = await skh.getDocs(skh.query(C('orders'), skh.where(field, '==', me()), skh.limit(80)));
                s.forEach(d => { if (seen[d.id]) return; const o = Object.assign({ __id: d.id, __role: role }, d.data());
                    const ref = o.productId || o.serviceId || o.itemId || '';
                    const other = role === 'buyer' ? o.sellerId : o.buyerId;
                    if (String(o.groupId || '') === ctx.gid || ((sh.prod.has(ref) || sh.svc.has(ref)) && mem.has(other))) { seen[d.id] = 1; rows.push(o); } });
            } catch (e) {}
        }
        rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return rows;
    });
}
async function nameOf(ctx, u) {
    if (!u) return '';
    if (ctx.names && ctx.names[u]) return ctx.names[u];
    try { const s = await skh.getDoc(D('userCards/' + u)); const n = s.exists() ? (s.data().fullName || s.data().displayName || '') : ''; (ctx.names = ctx.names || {})[u] = n; return n; } catch (e) { return ''; }
}
const catLabel = (c) => { try { if (c && window.skh && typeof window.skh.categoryLabel === 'function') return window.skh.categoryLabel(c) || c; } catch (e) {} return c || ''; };
const isMgr = (ctx) => ctx.myRole === 'owner' || ctx.myRole === 'admin';

/* ---------------- small UI kit ---------------- */
const head = (t, sub, right) => '<div class="gb-head" data-no-i18n><div><h3>' + esc(t) + '</h3>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' + (right || '') + '</div>';
const empty = (t, s) => '<div class="gb-empty"><b>' + esc(t) + '</b>' + (s ? '<small>' + esc(s) + '</small>' : '') + '</div>';
const blocked = (t, s) => '<div class="gb-blocked" role="note">' + SVG.lock + '<div><b>' + esc(t) + '</b><small>' + esc(s) + '</small></div></div>';
const chip = (t, cls) => '<span class="gb-chip ' + (cls || '') + '">' + esc(t) + '</span>';
function card(o) {
    return '<article class="gb-card' + (o.cls ? ' ' + o.cls : '') + '">'
        + '<span class="gb-img">' + (o.img ? '<img src="' + esc(o.img) + '" alt="" loading="lazy">' : '<i>' + esc(String(o.title || '?').charAt(0).toUpperCase()) + '</i>') + (o.flag || '') + '</span>'
        + '<div class="gb-bd">' + (o.chips || '') + '<b class="gb-t">' + esc(o.title) + '</b>'
        + (o.sub ? '<small class="gb-s">' + o.sub + '</small>' : '') + (o.price ? '<span class="gb-p">' + o.price + '</span>' : '') + (o.extra || '')
        + (o.acts ? '<div class="gb-acts">' + o.acts + '</div>' : '') + '</div></article>';
}
const btn = (lbl, act, data, pri) => '<button type="button" class="gb-btn' + (pri ? ' is-pri' : '') + '" data-gb="' + act + '"' + (data || '') + '>' + lbl + '</button>';
const loading = () => '<div class="gb-loading">Inapakia…</div>';
function subtabs(cur, list) { return '<div class="gb-subtabs" role="tablist">' + list.map(([k, l]) => '<button type="button" role="tab" class="' + (k === cur ? 'is-on' : '') + '" data-gb="sub" data-k="' + k + '">' + esc(l) + '</button>').join('') + '</div>'; }

/* ===================== HUDUMA ===================== */
async function services(host, ctx) {
    host.innerHTML = loading();
    const [mine, sh] = await Promise.all([memberServices(ctx), sharedRefs(ctx.gid)]);
    const extra = await docsByIds('services', [...sh.svc].filter(id => !mine.some(s => s.__id === id)));
    const list = mine.concat(extra.filter(published));
    const rows = await Promise.all(list.map(async s => Object.assign(s, { __prov: s.ownerName || s.providerName || await nameOf(ctx, s.userId) })));
    host.innerHTML = '<div data-no-i18n class="gb">' + head('Huduma', rows.length + ' huduma za wanachama na zilizoshirikishwa kwenye kundi', btn(SVG.plus + ' Shiriki huduma yako', 'svc-share', '', true))
        + (rows.length ? '<div class="gb-grid">' + rows.map(s => card({
            img: imgOf(s), title: s.title || s.name || 'Huduma',
            chips: chip(catLabel(s.category) || 'Huduma', 'blue') + (sh.svc.has(s.__id) ? chip('Imeshirikishwa', 'green') : ''),
            sub: esc(s.__prov || 'Mtoa huduma') + (s.location || s.region ? ' · ' + esc(s.location || s.region) : '') + (s.description ? '<br>' + esc(String(s.description).slice(0, 110)) : ''),
            price: s.price ? tzs(s.price) + (s.priceUnit || s.pricingMode ? ' <small>/ ' + esc(s.priceUnit || s.pricingMode) + '</small>' : '') : '<small>Bei kwa makubaliano</small>',
            acts: btn(SVG.eye + ' Tazama huduma', 'open', ' data-col="services" data-id="' + esc(s.__id) + '"')
                + (s.userId && s.userId !== me() ? btn(SVG.chat + ' Jadili', 'dm', ' data-uid="' + esc(s.userId) + '" data-name="' + esc(s.__prov) + '"', true) : '')
        })).join('') + '</div>'
        : empty('Bado hakuna huduma', 'Huduma za wanachama (services) na zinazoshirikishwa kwenye mazungumzo zitaonekana hapa.'))
        + '</div>';
}

/* ===================== SOKO ===================== */
const SOKO_KINDS = { product: 'Bidhaa', service: 'Huduma', ad: 'Tangazo', digital: 'Kidijitali' };
function sokoDocs(ctx) {
    return memo('sk:' + ctx.gid, 15000, async () => {
        const s = await skh.getDocs(skh.query(C('chatGroups/' + ctx.gid + '/soko'), skh.limit(200)));
        const out = []; s.forEach(d => out.push(Object.assign({ __id: d.id }, d.data())));
        out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return out;
    });
}
const live = (x) => x.status === 'approved' && (!x.expiresAtMs || x.expiresAtMs > Date.now());
const stLabel = (x) => x.status === 'approved' && x.expiresAtMs && x.expiresAtMs <= Date.now() ? ['Muda umeisha', 'grey']
    : ({ pending: ['Inasubiri idhini', 'gold'], approved: ['Imeidhinishwa', 'green'], rejected: ['Imekataliwa', 'red'], suspended: ['Imesimamishwa', 'red'], withdrawn: ['Imeondolewa', 'grey'] })[x.status] || [x.status, 'grey'];
async function soko(host, ctx) {
    host.innerHTML = loading();
    delete cache['sk:' + ctx.gid];   // section always shows the latest approvals
    const docs = await sokoDocs(ctx), mem = new Set(memberIds(ctx)), g = ctx.g || {};
    const sub = ctx.sub || 'all', mgr = isMgr(ctx);
    const visible = docs.filter(live).filter(x => sub === 'all' || x.kind === sub);
    const mine = docs.filter(x => x.submittedBy === me() && !live(x));
    const pend = docs.filter(x => x.status === 'pending');
    let h = '<div data-no-i18n class="gb gb-soko">' + head('Soko la Kundi', 'Bidhaa, huduma na matangazo yaliyoidhinishwa na viongozi wa kundi', btn(SVG.plus + ' Weka sokoni', 'soko-new', '', true))
        + subtabs(sub, [['all', 'Yote'], ['product', 'Bidhaa'], ['service', 'Huduma'], ['ad', 'Matangazo'], ['digital', 'Kidijitali']].concat(mgr ? [['admin', 'Usimamizi' + (pend.length ? ' (' + pend.length + ')' : '')]] : []));
    if (sub === 'admin' && mgr) { host.innerHTML = h + sokoAdmin(ctx, docs) + '</div>'; return; }
    h += visible.length ? '<div class="gb-grid">' + visible.map(x => card({
        img: x.image, title: x.title,
        chips: chip(SOKO_KINDS[x.kind] || x.kind, x.kind === 'ad' ? 'gold' : x.kind === 'service' ? 'blue' : x.kind === 'digital' ? 'violet' : 'green')
            + (x.sellerUid && !mem.has(x.sellerUid) ? chip('Biashara ya nje', 'grey') : chip('Mwanachama', 'green'))
            + (x.sponsored === true ? chip('Sponsored', 'gold') : ''),
        sub: esc(x.sellerName || '') + (x.category ? ' · ' + esc(catLabel(x.category)) : '') + (x.text ? '<br>' + esc(String(x.text).slice(0, 140)) : '') + (x.expiresAtMs ? '<br><em>Hadi ' + esc(day(x.expiresAtMs)) + '</em>' : ''),
        price: x.price ? tzs(x.price) : '',
        acts: (x.refId ? btn(SVG.eye + ' Tazama', 'open', ' data-col="' + esc(x.refCol) + '" data-id="' + esc(x.refId) + '"') : '')
            + (x.sellerUid && x.sellerUid !== me() ? btn(SVG.chat + ' Wasiliana', 'dm', ' data-uid="' + esc(x.sellerUid) + '" data-name="' + esc(x.sellerName || '') + '"', true) : '')
    })).join('') + '</div>' : empty('Hakuna kitu sokoni kwa sasa', 'Weka bidhaa, huduma au tangazo lako — viongozi wa kundi wataidhinisha.');
    if (mine.length) h += '<h4 class="gb-h4">Maombi yangu</h4><div class="gb-list">' + mine.map(x => { const [l, c] = stLabel(x);
        return '<div class="gb-row"><b>' + esc(x.title) + '</b>' + chip(l, c) + (x.note ? '<small>' + esc(x.note) + '</small>' : '')
            + (x.status === 'pending' ? btn('Ondoa ombi', 'soko-withdraw', ' data-id="' + esc(x.__id) + '"') : '') + '</div>'; }).join('') + '</div>';
    host.innerHTML = h + '</div>';
}
function sokoAdmin(ctx, docs) {
    const g = ctx.g || {}, s = g.soko || {};
    const cats = (window.skh && typeof window.skh.buyerProductCategories === 'function') ? window.skh.buyerProductCategories().slice(0, 24) : [];
    const allowed = Array.isArray(s.allowedCategories) ? s.allowedCategories : [];
    const rows = (arr, acts) => arr.length ? '<div class="gb-list">' + arr.map(x => { const [l, c] = stLabel(x);
        return '<div class="gb-row"><span class="gb-row-img">' + (x.image ? '<img src="' + esc(x.image) + '" alt="">' : '') + '</span><div><b>' + esc(x.title) + '</b>'
            + '<small>' + esc(SOKO_KINDS[x.kind] || x.kind) + ' · ' + esc(x.sellerName || '') + ' · ' + esc(day(x.createdAt)) + (x.category ? ' · ' + esc(catLabel(x.category)) : '') + '</small>'
            + (Array.isArray(x.history) && x.history.length ? '<small class="gb-hist">' + x.history.slice(-4).map(hh => esc(hh.status) + ' · ' + esc(day(hh.at))).join(' → ') + '</small>' : '') + '</div>'
            + chip(l, c) + acts(x) + '</div>'; }).join('') + '</div>' : '<small class="gb-muted">Hakuna.</small>';
    return '<div class="gb-admin">'
        + '<h4 class="gb-h4">Yanayosubiri idhini</h4>' + rows(docs.filter(x => x.status === 'pending'), x => btn('Kubali', 'soko-decide', ' data-id="' + esc(x.__id) + '" data-st="approved"', true) + btn('Kataa', 'soko-decide', ' data-id="' + esc(x.__id) + '" data-st="rejected"'))
        + '<h4 class="gb-h4">Yaliyo hewani</h4>' + rows(docs.filter(live), x => btn('Simamisha', 'soko-decide', ' data-id="' + esc(x.__id) + '" data-st="suspended"'))
        + '<h4 class="gb-h4">Historia ya matangazo</h4>' + rows(docs.filter(x => !live(x) && x.status !== 'pending'), x => x.status === 'suspended' ? btn('Rudisha hewani', 'soko-decide', ' data-id="' + esc(x.__id) + '" data-st="approved"') : '')
        + '<h4 class="gb-h4">Sheria za Soko</h4><div class="gb-form">'
        + '<label>Muda wa tangazo (siku)<input id="gbSokoDays" type="number" min="1" max="90" value="' + esc(s.durationDays || 14) + '"></label>'
        + '<label class="gb-check"><input id="gbSokoMembersOnly" type="checkbox"' + (s.membersOnly ? ' checked' : '') + '> Wanachama pekee (zuia biashara za nje)</label>'
        + '<fieldset><legend>Kategoria zinazoruhusiwa (usipochagua yoyote = zote)</legend><div class="gb-cats">' + cats.map(c => '<label><input type="checkbox" class="gbCat" value="' + esc(c.value) + '"' + (allowed.indexOf(c.value) >= 0 ? ' checked' : '') + '> ' + esc(c.label || c.value) + '</label>').join('') + '</div></fieldset>'
        + btn('Hifadhi sheria za Soko', 'soko-rules', '', true) + '</div>'
        + blocked('Nafasi za kulipia, bei za matangazo na mgawanyo wa mapato — BLOCKED', 'Hakuna malipo ya matangazo ya kundi kwenye SokoPay/escrow bado. Mapato yaliyorekodiwa: ' + tzs(0) + '. Alama "Sponsored" itatumika tu tangazo likilipiwa kupitia mfumo halisi.')
        + '</div>';
}
async function sokoSubmit(ctx) {
    const kind = await pickOne('Weka nini sokoni?', [['product', 'Bidhaa yangu'], ['service', 'Huduma yangu'], ['digital', 'Huduma ya kidijitali'], ['ad', 'Tangazo la biashara']]);
    if (!kind) return;
    let rec = null, ad = null;
    if (kind === 'ad') {
        const title = (await ask('Kichwa cha tangazo:', '') || '').trim(); if (title.length < 3) return;
        const text = (await ask('Maelezo mafupi ya tangazo:', '') || '').trim();
        ad = { title, text };
    } else {
        const col = kind === 'product' ? 'products' : 'services';
        const mine = (await byOwners(col, [me()], published));
        if (!mine.length) return toast('Huna ' + (col === 'products' ? 'bidhaa' : 'huduma') + ' iliyochapishwa bado.', 'warn');
        const id = await pickOne('Chagua', mine.map(x => [x.__id, (x.title || x.name) + (x.price ? ' · ' + tzs(x.price) : '')]));
        rec = mine.find(x => x.__id === id); if (!rec) return;
    }
    const s = (ctx.g && ctx.g.soko) || {};
    const cat = rec ? (rec.category || '') : '';
    if (Array.isArray(s.allowedCategories) && s.allowedCategories.length && rec && s.allowedCategories.indexOf(cat) < 0) return toast('Kategoria hii hairuhusiwi kwenye Soko la kundi hili.', 'warn');
    const now = new Date().toISOString(), mgr = isMgr(ctx), days = Math.max(1, Math.min(90, +s.durationDays || 14));
    const doc = { kind, title: rec ? (rec.title || rec.name) : ad.title, text: ad ? ad.text : String(rec.description || '').slice(0, 300), image: rec ? imgOf(rec) : '',
        price: rec && rec.price ? Number(rec.price) || 0 : 0, category: cat, refCol: rec ? rec.__col : '', refId: rec ? rec.__id : '',
        sellerUid: rec ? rec.userId : me(), sellerName: rec ? (rec.sellerName || rec.ownerName || ctx.myName || '') : (ctx.myName || ''),
        submittedBy: me(), createdAt: now, updatedAt: now, sponsored: false,
        status: mgr ? 'approved' : 'pending', history: [{ status: mgr ? 'approved' : 'pending', by: me(), at: now }] };
    if (mgr) Object.assign(doc, { decidedBy: me(), decidedAt: now, expiresAtMs: Date.now() + days * 864e5 });
    try { await skh.addDoc(C('chatGroups/' + ctx.gid + '/soko'), doc); bust(ctx.gid); toast(mgr ? 'Imewekwa sokoni.' : 'Ombi limetumwa — linasubiri idhini ya kiongozi wa kundi.', 'success'); }
    catch (e) { toast('Haikuwekwa: ' + errText(e), 'warn'); }
}
async function sokoDecide(ctx, id, st) {
    const s = (ctx.g && ctx.g.soko) || {}, days = Math.max(1, Math.min(90, +s.durationDays || 14));
    const ref = D('chatGroups/' + ctx.gid + '/soko/' + id), snap = await skh.getDoc(ref); if (!snap.exists()) return;
    const x = snap.data(), now = new Date().toISOString();
    let note = ''; if (st === 'rejected' || st === 'suspended') note = (await ask('Sababu (hiari):', '') || '').slice(0, 200);
    const patch = { status: st, decidedBy: me(), decidedAt: now, updatedAt: now, note, history: (x.history || []).concat([{ status: st, by: me(), at: now }]).slice(-20) };
    if (st === 'approved') patch.expiresAtMs = Date.now() + days * 864e5;
    try { await skh.updateDoc(ref, patch); bust(ctx.gid); toast('Imehifadhiwa.', 'success'); } catch (e) { toast('Imekataliwa: ' + errText(e), 'warn'); }
}

/* ===================== GROUP BUY ===================== */
async function groupBuy(host, ctx) {
    host.innerHTML = loading();
    const [mp, sh] = await Promise.all([memberProducts(ctx), sharedRefs(ctx.gid)]);
    const extra = await docsByIds('products', [...sh.prod].filter(id => !mp.some(p => p.__id === id)));
    const gb = mp.concat(extra).filter(p => p.saleMode === 'group_buy' && published(p));
    let gos = []; try { const s = await skh.getDocs(skh.query(C('chatGroups/' + ctx.gid + '/groupOrders'), skh.limit(40))); s.forEach(d => gos.push(Object.assign({ __id: d.id }, d.data()))); } catch (e) {}
    const on = typeof window.skhGroupOrdersEnabled === 'function' && window.skhGroupOrdersEnabled();
    const rows = gb.map(p => { let c = null; try { c = window.skhModesCompute ? window.skhModesCompute(p) : null; } catch (e) {}
        const md = p.modeData || {}, grp = (c && c.group) || {};
        const tgt = +grp.target || +md.targetUsers || 0, jn = +grp.joined || +md.joinedUsers || 0, end = +md.endTime || 0;
        const st = grp.status === 'active' ? ['Inaendelea', 'green'] : grp.status === 'success' || (tgt && jn >= tgt) ? ['Lengo limefikiwa', 'blue'] : (end && end < Date.now()) ? ['Muda umeisha', 'grey'] : [grp.status || 'Inaendelea', 'green'];
        const pct = tgt ? Math.min(100, Math.round(jn / tgt * 100)) : 0;
        return card({ img: imgOf(p), title: p.title, cls: 'gb-card--wide',
            chips: chip('Group Buy', 'gold') + chip(st[0], st[1]),
            sub: esc(p.sellerName || p.ownerName || '') + (p.location ? ' · ' + esc(p.location) : ''),
            price: tzs(md.groupPrice || grp.price || p.price) + (p.unit ? ' <small>/ ' + esc(p.unit) + '</small>' : '') + (p.price && (grp.price || md.groupPrice) && p.price > (md.groupPrice || grp.price) ? ' <del>' + tzs(p.price) + '</del>' : ''),
            extra: (tgt ? '<div class="gb-prog"><span><b>' + jn + '</b> / ' + tgt + ' wamejiunga</span><i style="--p:' + pct + '%"></i></div>' : '')
                + '<ul class="gb-terms">' + (end ? '<li>Mwisho wa kujiunga: <b>' + esc(day(end)) + '</b></li>' : '') + (md.maxPerBuyer ? '<li>Kiwango cha juu kwa mnunuzi: <b>' + esc(md.maxPerBuyer) + '</b></li>' : '')
                + '<li>Bei ya kundi inapatikana lengo likifikiwa; malipo ni kwa escrow ya SokoPay (sera ya sasa).</li></ul>',
            acts: btn('Jiunge / Tazama masharti', 'open', ' data-col="products" data-id="' + esc(p.__id) + '"', true) });
    });
    host.innerHTML = '<div data-no-i18n class="gb">' + head('Group Buy', 'Ununuzi wa pamoja — watu wengi wanajiunga kupata bei ya kundi')
        + '<ol class="gb-steps"><li><b>Chagua</b> Group Buy hapa chini</li><li><b>Jiunge</b> kwenye ukurasa wa bidhaa (idadi yako)</li><li><b>Subiri lengo</b> la washiriki lifikiwe</li><li><b>Lipia</b> kwa bei ya kundi — pesa inakaa escrow hadi upokee</li></ol>'
        + (rows.length ? '<div class="gb-grid gb-grid--1">' + rows.join('') + '</div>' : empty('Hakuna Group Buy inayoendelea', 'Wanachama wakiweka bidhaa kwa mfumo wa Group Buy, zitaonekana hapa.'))
        + (gos.length ? '<h4 class="gb-h4">Group Orders za kundi (rekodi za server)</h4><div class="gb-list">' + gos.map(o => '<div class="gb-row"><b>' + esc(o.productName || 'Group Order') + '</b>' + chip(String(o.status || 'OPEN').replace(/_/g, ' '), 'blue') + '<small>' + (+o.totalQty || 0) + ' / ' + (+o.targetQty || 0) + '</small></div>').join('') + '</div>' : '')
        + blocked('Kuanzisha Group Order mpya ndani ya kundi — BLOCKED', (on ? 'Imewashwa kwa preview ya emulator, lakini ' : '') + 'injini ya server (Grp Oda 2.0: michango, escrow, mgawanyo, usafirishaji) haipo; rules zinakataa kuandika groupOrders kutoka kwa kifaa. Hakuna oda ya majaribio inayoundwa.')
        + '</div>';
}

/* ===================== ODA ===================== */
const ORD_ST = { pending: 'Inasubiri', pending_payment: 'Inasubiri malipo', awaiting_payment: 'Inasubiri malipo', paid: 'Imelipwa', held: 'Malipo yameshikiliwa (escrow)', accepted: 'Imekubaliwa', processing: 'Inaandaliwa', shipped: 'Imesafirishwa', in_transit: 'Njiani', delivered: 'Imefika', completed: 'Imekamilika', cancelled: 'Imeghairiwa', refunded: 'Imerejeshwa' };
const stTxt = (s) => ORD_ST[String(s || '').toLowerCase()] || String(s || '—').replace(/_/g, ' ');
async function orders(host, ctx) {
    host.innerHTML = loading();
    const rows = await groupOrders(ctx);
    const out = await Promise.all(rows.map(async o => {
        const other = o.__role === 'buyer' ? (o.sellerName || await nameOf(ctx, o.sellerId)) : (o.buyerName || await nameOf(ctx, o.buyerId));
        return card({ img: o.itemImage || o.image || o.productImage || '', title: o.itemTitle || o.productTitle || o.title || 'Oda', cls: 'gb-card--wide',
            chips: chip(o.__role === 'buyer' ? 'Unanunua' : 'Unauza', o.__role === 'buyer' ? 'blue' : 'green') + chip(stTxt(o.status), 'gold'),
            sub: (o.__role === 'buyer' ? 'Muuzaji: ' : 'Mnunuzi: ') + esc(other || '—') + ' · ' + esc(o.humanId || o.orderNumber || o.__id.slice(0, 8)) + ' · ' + esc(day(o.createdAt)),
            price: tzs(o.totalPrice || o.amount || o.total || 0) + (o.quantity ? ' <small>· idadi ' + esc(o.quantity) + '</small>' : ''),
            extra: '<div class="gb-kv">' + (o.paymentStatus ? '<span>Malipo: <b>' + esc(stTxt(o.paymentStatus)) + '</b></span>' : '') + (o.deliveryStatus || o.serviceStatus || o.transportStatus ? '<span>Usafirishaji: <b>' + esc(stTxt(o.deliveryStatus || o.serviceStatus || o.transportStatus)) + '</b></span>' : '') + '</div>',
            acts: btn(SVG.eye + ' Fungua oda', 'order', ' data-id="' + esc(o.__id) + '" data-role="' + o.__role + '"', true) });
    }));
    host.innerHTML = '<div data-no-i18n class="gb">' + head('Oda', rows.length + ' oda zako zinazohusiana na kundi hili', '')
        + (out.length ? '<div class="gb-grid gb-grid--1">' + out.join('') + '</div>' : empty('Hakuna oda bado', 'Oda unazoweka (au kupokea) kwa bidhaa/huduma zilizoshirikishwa hapa zitaonekana — kutoka mfumo wa Oda uliopo.'))
        + '<small class="gb-note">Unaona oda ulizo mnunuzi au muuzaji tu (ruhusa za mfumo wa Oda).</small></div>';
}

/* ===================== MAPATANO NA OFA ===================== */
const NEGO_ST = { OFFER_SENT: ['Ofa imetumwa', 'gold'], COUNTER_OFFER: ['Inajadiliwa', 'gold'], RE_NEGOTIATION: ['Inajadiliwa upya', 'gold'], AGREEMENT: ['Mmekubaliana', 'green'], FINAL_AGREEMENT: ['Makubaliano ya mwisho', 'green'], ORDER_CREATED: ['Oda imeundwa', 'blue'], REJECTED: ['Imekataliwa', 'red'], CANCELLED: ['Imeghairiwa', 'grey'], EXPIRED: ['Muda umeisha', 'grey'] };
async function myNegotiations(ctx) {
    const sh = await sharedRefs(ctx.gid), mp = await memberProducts(ctx), mem = new Set(memberIds(ctx)), seen = {}, out = [];
    const groupProd = new Set([...sh.prod, ...mp.map(p => p.__id)]);
    for (const f of ['buyerId', 'sellerId']) {
        try { const s = await skh.getDocs(skh.query(C('negotiations'), skh.where(f, '==', me()), skh.limit(60)));
            s.forEach(d => { if (seen[d.id]) return; const n = Object.assign({ __id: d.id }, d.data());
                if (n.groupId === ctx.gid || (groupProd.has(n.productId) && mem.has(n.buyerId) && mem.has(n.sellerId))) { seen[d.id] = 1; out.push(n); } }); } catch (e) {}
    }
    out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return out;
}
async function deals(host, ctx) {
    host.innerHTML = loading();
    const sub = ctx.sub === 'ofa' ? 'ofa' : 'mapatano';
    let h = '<div data-no-i18n class="gb">' + head('Mapatano na Ofa', 'Majadiliano ya bei (injini ya server) na ofa halisi za wanachama') + subtabs(sub, [['mapatano', 'Mapatano ya Bei'], ['ofa', 'Ofa']]);
    if (sub === 'mapatano') {
        const ns = await myNegotiations(ctx);
        h += ns.length ? '<div class="gb-grid gb-grid--1">' + ns.map(n => {
            const [l, c] = NEGO_ST[n.currentState] || [n.currentState, 'grey'], mine = n.waitingForUserId === me();
            const role = n.buyerId === me() ? 'buyer' : 'seller', open = ['OFFER_SENT', 'COUNTER_OFFER', 'RE_NEGOTIATION'].indexOf(n.currentState) >= 0;
            const hist = (n.history || []).slice(-6).map(x => '<li>' + esc(x.actorRole === 'buyer' ? 'Mnunuzi' : x.actorRole === 'seller' ? 'Muuzaji' : x.actorRole || '') + ': ' + esc(({ offer_sent: 'ofa', counter: 'ofa mbadala', agreement: 'amekubali', quantity_change: 'amebadili idadi' })[x.kind] || x.kind) + (x.price ? ' ' + tzs(x.price) : '') + (x.quantity ? ' × ' + esc(x.quantity) : '') + ' · ' + esc(day(x.at)) + '</li>').join('');
            return card({ img: n.productImage, title: n.productTitle || 'Bidhaa', cls: 'gb-card--wide',
                chips: chip(l, c) + chip(role === 'buyer' ? 'Wewe ni mnunuzi' : 'Wewe ni muuzaji', 'blue') + (mine && open ? chip('Zamu yako', 'red') : ''),
                sub: 'Aliyeanzisha: ' + esc(n.buyerName || 'Mnunuzi') + ' · Muuzaji: ' + esc(n.sellerName || '') + (n.originalUnitPrice ? ' · Bei ya awali ' + tzs(n.originalUnitPrice) : ''),
                price: tzs(n.currentUnitPrice) + ' <small>× ' + esc(n.quantity || 1) + ' = ' + tzs(n.currentTotal || (n.currentUnitPrice * (n.quantity || 1))) + '</small>',
                extra: hist ? '<details class="gb-hist2"><summary>Historia ya mabadiliko</summary><ol>' + hist + '</ol></details>' : '',
                acts: (mine && open ? btn('Kubali', 'nego', ' data-id="' + esc(n.__id) + '" data-cmd="ACCEPT_OFFER" data-v="' + esc(n.version) + '"', true) + btn('Pendekeza bei', 'nego', ' data-id="' + esc(n.__id) + '" data-cmd="COUNTER_OFFER" data-v="' + esc(n.version) + '" data-q="' + esc(n.quantity || 1) + '"') + btn('Kataa', 'nego', ' data-id="' + esc(n.__id) + '" data-cmd="REJECT_OFFER" data-v="' + esc(n.version) + '"') : '')
                    + btn(SVG.eye + ' Bidhaa', 'open', ' data-col="' + esc(n.productCollection || 'products') + '" data-id="' + esc(n.productId) + '"') });
        }).join('') + '</div>' : empty('Hakuna mapatano bado', 'Anzisha kutoka kadi ya bidhaa kwenye mazungumzo: Jadili → Pendekeza bei. Ni wewe na muuzaji tu mnaoona maelezo kamili.');
    } else {
        const mp = await memberProducts(ctx);
        const offers = mp.filter(p => (Number(p.originalPrice) > Number(p.price)) || (p.saleMode === 'price_drop'));
        let sup = []; try { const s = await skh.getDocs(skh.query(C('chatGroups/' + ctx.gid + '/groupOrders'), skh.limit(40))); s.forEach(d => { const o = d.data() || {}; Object.keys(o.supplierOffers || {}).forEach(k => sup.push(Object.assign({ product: o.productName }, o.supplierOffers[k]))); }); } catch (e) {}
        h += head('', '', btn(SVG.plus + ' Shiriki ofa yako', 'offer-share', '', true));
        h += offers.length ? '<div class="gb-grid">' + offers.map(p => { let c = null; try { c = window.skhModesCompute ? window.skhModesCompute(p) : null; } catch (e) {}
            const now = (c && c.drop && !c.drop.ended) ? c.drop.currentPrice : Number(p.price), was = Number(p.originalPrice) || (c && c.base) || 0;
            const pct = was > now ? Math.round((1 - now / was) * 100) : 0, md = p.modeData || {};
            const ended = (md.endTime && md.endTime < Date.now()) || (c && c.drop && c.drop.ended);
            return card({ img: imgOf(p), title: p.title, flag: pct ? '<em class="gb-off">-' + pct + '%</em>' : '',
                chips: chip(p.saleMode === 'price_drop' ? 'Bei Kushuka' : 'Punguzo', 'gold') + chip(ended ? 'Imeisha' : 'Inaendelea', ended ? 'grey' : 'green'),
                sub: esc(p.sellerName || p.ownerName || '') + (md.endTime ? '<br><em>Hadi ' + esc(day(md.endTime)) + '</em>' : '') + (md.maxPerBuyer ? '<br>Kikomo: ' + esc(md.maxPerBuyer) + ' kwa mnunuzi' : ''),
                price: tzs(now) + (was > now ? ' <del>' + tzs(was) + '</del>' : ''),
                acts: btn(SVG.eye + ' Tazama ofa', 'open', ' data-col="products" data-id="' + esc(p.__id) + '"', true) }); }).join('') + '</div>'
            : empty('Hakuna ofa kwa sasa', 'Ofa ni bidhaa za wanachama zenye punguzo halisi (bei ya awali > bei ya sasa) au Bei Kushuka.');
        if (sup.length) h += '<h4 class="gb-h4">Ofa za wasambazaji (Group Orders)</h4><div class="gb-list">' + sup.map(o => '<div class="gb-row"><b>' + esc(o.supplierName || 'Msambazaji') + ' → ' + esc(o.product || '') + '</b><small>' + tzs(o.price) + (o.deliveryDays ? ' · siku ' + esc(o.deliveryDays) : '') + '</small></div>').join('') + '</div>';
    }
    host.innerHTML = h + '</div>';
}
/* start a negotiation from a product card in the group chat (server engine) */
async function proposePrice(ctx, pid) {
    let p = null; try { const s = await skh.getDoc(D('products/' + pid)); p = s.exists() ? s.data() : null; } catch (e) {}
    if (!p) return toast('Bidhaa haipatikani.', 'warn');
    if (p.userId === me()) return toast('Hii ni bidhaa yako.', 'info');
    const qty = parseInt(await ask('Idadi unayotaka (' + (p.unit || 'kipande') + '):', '1'), 10); if (!(qty >= 1)) return;
    const price = Number(String(await ask('Bei yako kwa kila ' + (p.unit || 'kipande') + ' (TSh). Bei ya sasa: ' + tzs(p.price), '') || '').replace(/[^0-9.]/g, '')); if (!(price > 0)) return;
    try {
        const r = await call('negotiationSendOffer', { productId: pid, productCollection: 'products', sellerId: p.userId, sellerName: p.sellerName || p.ownerName || '', quantity: qty, price, productTitle: p.title, productImage: imgOf(p), commandId: 'grp_' + ctx.gid + '_' + Date.now() });
        const nid = (r && (r.negotiationId || (r.negotiation && r.negotiation.negotiationId))) || '';
        if (typeof window.skhGroupSendTyped === 'function') await window.skhGroupSendTyped(ctx.gid, { type: 'negotiation', negotiation: { negotiationId: nid, productId: pid, productTitle: p.title, quantity: qty, price, unit: p.unit || '', sellerName: p.sellerName || p.ownerName || '' } });
        bust(ctx.gid); toast('Ofa yako ya bei imetumwa kwa muuzaji.', 'success');
    } catch (e) { toast('Haikutumwa: ' + errText(e), 'warn'); }
}
async function negoCommand(ctx, el) {
    const cmd = el.getAttribute('data-cmd'), payload = { negotiationId: el.getAttribute('data-id'), command: cmd, expectedVersion: Number(el.getAttribute('data-v')), commandId: 'grp_' + Date.now() };
    if (cmd === 'COUNTER_OFFER') { const pr = Number(String(await ask('Bei yako mpya (TSh kwa kila kipimo):', '') || '').replace(/[^0-9.]/g, '')); if (!(pr > 0)) return; payload.price = pr; payload.quantity = Number(el.getAttribute('data-q')) || 1; }
    if (cmd === 'REJECT_OFFER' && !(await askYes('Kataa ofa hii?'))) return;
    try { await call('negotiationAction', payload); bust(ctx.gid); toast('Imehifadhiwa.', 'success'); } catch (e) { toast(errText(e), 'warn'); }
}

/* ===================== USAFIRISHAJI ===================== */
async function delivery(host, ctx) {
    host.innerHTML = loading();
    const ords = await groupOrders(ctx);
    const needs = ords.filter(o => o.delivery || o.deliveryStatus || o.deliveryMethod || o.shippingAddress || o.deliveryAddress);
    const ids = new Set(ords.map(o => o.__id));
    let offers = []; try { const s = await skh.getDocs(skh.query(C('delivery_offers'), skh.where('customerId', '==', me()), skh.limit(60))); s.forEach(d => { const x = Object.assign({ __id: d.id }, d.data()); if (ids.has(x.orderId)) offers.push(x); }); } catch (e) {}
    let drivers = []; try { drivers = await memo('dr:' + ctx.gid, 30000, () => byOwners('drivers', memberIds(ctx))); } catch (e) {}
    const st = (o) => stTxt(o.deliveryStatus || (o.delivery && o.delivery.status) || o.status);
    let h = '<div data-no-i18n class="gb">' + head('Usafirishaji', 'Usafirishaji wa oda za kundi — kupitia mfumo wa delivery uliopo');
    h += '<h4 class="gb-h4">Oda zinazohitaji usafirishaji</h4>' + (needs.length ? '<div class="gb-list">' + needs.map(o => {
        const dl = o.delivery || {};
        const hist = (o.statusHistory || o.history || []).slice(-4).map(x => esc(stTxt(x.status || x.to || x.step)) + ' · ' + esc(day(x.at))).join(' → ');
        return '<div class="gb-row"><div><b>' + esc(o.itemTitle || 'Oda') + '</b><small>' + esc(dl.area || dl.destination || o.deliveryAddress || o.shippingAddress || '') + (dl.method || o.deliveryMethod ? ' · ' + esc(dl.method || o.deliveryMethod) : '') + (o.deliveryFee ? ' · ' + tzs(o.deliveryFee) : '') + '</small>' + (hist ? '<small class="gb-hist">' + hist + '</small>' : '') + '</div>'
            + chip(st(o), 'blue') + btn('Fungua', 'order', ' data-id="' + esc(o.__id) + '" data-role="' + o.__role + '"') + '</div>'; }).join('') + '</div>' : '<small class="gb-muted">Hakuna oda ya kundi yenye usafirishaji bado.</small>');
    h += '<h4 class="gb-h4">Ofa za usafiri kwa oda zangu</h4>' + (offers.length ? '<div class="gb-list">' + offers.map(x => '<div class="gb-row"><div><b>' + esc(x.agentName || x.transporterName || 'Msafirishaji') + '</b><small>' + (x.price || x.fee ? tzs(x.price || x.fee) : '') + ' · ' + esc(day(x.createdAt)) + '</small></div>' + chip(stTxt(x.status), 'gold') + '</div>').join('') + '</div>' : '<small class="gb-muted">Hakuna ofa za usafiri kwa sasa.</small>');
    h += '<h4 class="gb-h4">Watoa huduma wa usafirishaji (wanachama)</h4>' + (drivers.length ? '<div class="gb-grid">' + drivers.map(d => card({ img: imgOf(d), title: d.title || d.driverName || d.vehicleType || 'Msafirishaji',
        chips: chip(d.vehicleType || 'Usafiri', 'teal'), sub: esc(d.driverName || d.ownerName || '') + (d.location || d.region ? ' · ' + esc(d.location || d.region) : ''), price: d.price ? tzs(d.price) + (d.priceUnit ? ' <small>/ ' + esc(d.priceUnit) + '</small>' : '') : '',
        acts: btn('Omba usafiri', 'open', ' data-col="drivers" data-id="' + esc(d.__id) + '"', true) })).join('') + '</div>' : '<small class="gb-muted">Hakuna mwanachama mwenye huduma ya usafiri iliyosajiliwa.</small>');
    host.innerHTML = h + '</div>';
}

/* ===================== GROUP INFORMATION PANEL ===================== */
async function panel(host, ctx) {
    const g = ctx.g || {}, mgr = isMgr(ctx), ids = memberIds(ctx);
    const admins = ids.filter(u => ['owner', 'admin', 'moderator'].indexOf(ctx.roles[u]) >= 0);
    const an = await Promise.all(admins.map(async u => '<li><span class="gb-av">' + esc(String((await nameOf(ctx, u)) || '?').charAt(0)) + '</span>' + esc(await nameOf(ctx, u)) + chip(({ owner: 'Mmiliki', admin: 'Admin', moderator: 'Moderator' })[ctx.roles[u]], 'green') + '</li>'));
    const pol = (k, v) => '<li><span>' + esc(k) + '</span><b>' + esc(v) + '</b></li>';
    let sum = '';
    try {
        const [sh, sk, ords, mp] = await Promise.all([sharedRefs(ctx.gid), sokoDocs(ctx), groupOrders(ctx), memberProducts(ctx)]);
        const gbN = mp.filter(p => p.saleMode === 'group_buy').length;
        sum = '<div class="gb-stats">' + [[sh.prod.size, 'Bidhaa zilizoshirikishwa'], [sh.svc.size, 'Huduma zilizoshirikishwa'], [sk.filter(live).length, 'Sokoni sasa'], [gbN, 'Group Buy'], [ords.length, 'Oda zangu za kundi']]
            .map(([n, l]) => '<span><b>' + n + '</b><small>' + l + '</small></span>').join('') + '</div>';
    } catch (e) {}
    host.innerHTML = '<div class="gb-panel" data-no-i18n>'
        + '<div class="gb-p-top"><span class="gb-p-av">' + esc(String(g.avatar || g.name || 'K').slice(0, 2).toUpperCase()) + '</span><h3>' + esc(g.name || 'Kikundi') + '</h3>'
        + '<small>' + ids.length + ' wanachama · ' + esc(g.groupType === 'PERMANENT_COMMUNITY' ? 'Community' : 'Biashara ya muda') + '</small></div>'
        + (g.description ? '<section><h4>Maelezo na madhumuni</h4><p>' + esc(g.description) + '</p></section>' : '')
        + (g.announcement && g.announcement.text ? '<section><h4>Taarifa iliyobandikwa</h4><p class="gb-pin">' + esc(g.announcement.text) + '</p></section>' : '')
        + '<section><h4>Viongozi</h4><ul class="gb-people">' + an.join('') + '</ul></section>'
        + '<section><h4>Sheria za kundi</h4>' + (g.rules ? '<p class="gb-rules">' + esc(g.rules) + '</p>' : '<p class="gb-muted">Hakuna sheria zilizowekwa bado.</p>') + '</section>'
        + '<section><h4>Ruhusa za kundi</h4><ul class="gb-pol">' + pol('Kujiunga', g.joinPolicy === 'request' ? 'Kwa ombi' : 'Wazi') + pol('Kutuma ujumbe', g.sendPolicy === 'admins' ? 'Viongozi tu' : 'Wote')
        + pol('Kushiriki bidhaa/huduma', g.sharePolicy === 'admins' ? 'Viongozi tu' : 'Wote') + pol('Kualika', g.invitePolicy === 'admins' ? 'Viongozi tu' : 'Wote') + pol('Soko', 'Idhini ya kiongozi') + '</ul></section>'
        + (sum ? '<section><h4>Shughuli za kibiashara</h4>' + sum + '</section>' : '')
        + (mgr ? '<section class="gb-adm"><h4>Usimamizi (viongozi)</h4><div class="gb-form">'
            + '<label>Sheria za kundi<textarea id="gbRules" rows="3" maxlength="600">' + esc(g.rules || '') + '</textarea></label>'
            + '<label>Nani anatuma ujumbe<select id="gbSend"><option value="everyone">Wote</option><option value="admins"' + (g.sendPolicy === 'admins' ? ' selected' : '') + '>Viongozi tu</option></select></label>'
            + '<label>Nani anashiriki bidhaa/huduma<select id="gbShare"><option value="everyone">Wote</option><option value="admins"' + (g.sharePolicy === 'admins' ? ' selected' : '') + '>Viongozi tu</option></select></label>'
            + btn('Hifadhi', 'settings', '', true) + btn('Wanachama na roles', 'manage') + '</div><small class="gb-note">Ruhusa hizi zinatekelezwa na sheria za usalama za server (firestore.rules), si kifaa pekee.</small></section>' : '')
        + '</div>';
}
async function saveSettings(ctx) {
    const patch = { rules: String((document.getElementById('gbRules') || {}).value || '').slice(0, 600), sendPolicy: (document.getElementById('gbSend') || {}).value === 'admins' ? 'admins' : 'everyone',
        sharePolicy: (document.getElementById('gbShare') || {}).value === 'admins' ? 'admins' : 'everyone', updatedAt: new Date().toISOString() };
    try { await skh.updateDoc(D('chatGroups/' + ctx.gid), patch); Object.assign(ctx.g, patch);
        try { await skh.addDoc(C('chatGroups/' + ctx.gid + '/events'), { type: 'group_info_updated', actorUid: me(), targetUid: null, note: 'rules,sendPolicy,sharePolicy', at: new Date().toISOString() }); } catch (e2) {}
        toast('Mipangilio imehifadhiwa.', 'success'); } catch (e) { toast('Imekataliwa: ' + errText(e), 'warn'); }
}
async function saveSokoRules(ctx) {
    const soko = Object.assign({}, (ctx.g && ctx.g.soko) || {}, { durationDays: Math.max(1, Math.min(90, +(document.getElementById('gbSokoDays') || {}).value || 14)),
        membersOnly: !!(document.getElementById('gbSokoMembersOnly') || {}).checked, allowedCategories: [...document.querySelectorAll('.gbCat:checked')].map(i => i.value).slice(0, 40) });
    try { await skh.updateDoc(D('chatGroups/' + ctx.gid), { soko, updatedAt: new Date().toISOString() }); ctx.g.soko = soko; toast('Sheria za Soko zimehifadhiwa.', 'success'); } catch (e) { toast('Imekataliwa: ' + errText(e), 'warn'); }
}

/* ===================== pickers / shares ===================== */
function pickOne(title, opts) {
    return new Promise(res => {
        const el = document.createElement('div'); el.className = 'gb-pick-ov'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
        el.innerHTML = '<div class="gb-pick"><div class="gb-pick-h"><b>' + esc(title) + '</b><button type="button" data-x aria-label="Funga">×</button></div>'
            + opts.map(([k, l]) => '<button type="button" class="gb-pick-o" data-k="' + esc(k) + '">' + esc(l) + '</button>').join('') + '</div>';
        el.addEventListener('click', e => { const o = e.target.closest('[data-k]'); if (o) { el.remove(); res(o.getAttribute('data-k')); } else if (e.target === el || e.target.closest('[data-x]')) { el.remove(); res(null); } });
        (document.querySelector('#skhGroupSogaModal .gsg-fs') || document.body).appendChild(el);
    });
}
async function shareService(ctx) {
    const mine = await byOwners('services', [me()], published);
    if (!mine.length) return toast('Huna huduma iliyochapishwa bado.', 'warn');
    const id = await pickOne('Shiriki huduma', mine.map(x => [x.__id, (x.title || x.name) + (x.price ? ' · ' + tzs(x.price) : '')])); const s = mine.find(x => x.__id === id); if (!s) return;
    const r = await window.skhGroupSendTyped(ctx.gid, { type: 'service', service: { name: s.title || s.name, price: s.price || '', pricingMode: s.priceUnit || s.pricingMode || '', note: String(s.description || '').slice(0, 150), serviceId: s.__id, imageUrl: imgOf(s), providerName: s.ownerName || ctx.myName || '' } });
    if (!r || !r.ok) toast('Haikushirikishwa (' + ((r && r.reason) || 'hitilafu') + ').', 'warn'); else { bust(ctx.gid); toast('Huduma imeshirikishwa.', 'success'); }
}
async function shareOffer(ctx) {
    const mine = (await byOwners('products', [me()], published)).filter(p => Number(p.originalPrice) > Number(p.price) || p.saleMode === 'price_drop');
    if (!mine.length) return toast('Huna bidhaa yenye ofa (punguzo halisi au Bei Kushuka).', 'warn');
    const id = await pickOne('Shiriki ofa', mine.map(x => [x.__id, x.title + ' · ' + tzs(x.price)])); const p = mine.find(x => x.__id === id); if (!p) return;
    const r = await window.skhGroupSendTyped(ctx.gid, { type: 'product', product: { name: p.title, price: p.price, oldPrice: p.originalPrice || '', unit: p.unit || '', qty: p.stock != null ? String(p.stock) : '', productId: p.__id, sellerName: p.sellerName || p.ownerName || '', imageUrl: imgOf(p), location: p.location || p.region || '' } });
    if (!r || !r.ok) toast('Haikushirikishwa.', 'warn'); else toast('Ofa imeshirikishwa kwenye mazungumzo.', 'success');
}
/* forward a message to another group the user belongs to (same typed engine; private chat untouched) */
async function forward(fromGid, m) {
    let groups = []; try { groups = (await window.skhMyGroups()) || []; } catch (e) {}
    groups = groups.filter(g => (g.id || g.gid) !== fromGid);
    if (!groups.length) return toast('Huna kundi lingine la kupeleka.', 'info');
    const to = await pickOne('Peleka kwa kundi', groups.map(g => [g.id || g.gid, g.name || (g.data && g.data.name) || 'Kundi']));
    if (!to) return;
    const t = m.type || 'text'; let r;
    if (t === 'text') r = await window.skhGroupSendMessage(to, '↪ ' + String(m.text || ''));
    else if (['product', 'service', 'image', 'location', 'document', 'sticker'].indexOf(t) >= 0) { const p = { type: t }; ['product', 'service', 'imageUrl', 'caption', 'label', 'lat', 'lng', 'fileName', 'fileSize', 'fileType', 'fileData', 'sticker'].forEach(k => { if (m[k] !== undefined) p[k] = m[k]; }); r = await window.skhGroupSendTyped(to, p); }
    else return toast('Aina hii ya ujumbe haiwezi kupelekwa.', 'info');
    toast(r && r.ok ? 'Umepelekwa.' : 'Haukupelekwa (' + ((r && r.reason) || 'hitilafu') + ').', r && r.ok ? 'success' : 'warn');
}
async function report(gid, m) {
    const why = (await ask('Eleza tatizo la ujumbe huu:', '') || '').trim(); if (!why) return;
    try { await skh.addDoc(C('chatReports'), { reportedBy: me(), reportedUid: m.senderUid || '', groupId: gid, conversationId: 'conv_group_' + gid, messageId: m.__id || '', reason: why.slice(0, 500), preview: String(m.text || m.caption || '').slice(0, 200), status: 'open', createdAt: new Date().toISOString() });
        toast('Asante — ripoti imetumwa kwa wasimamizi.', 'success'); } catch (e) { toast('Haikutumwa: ' + errText(e), 'warn'); }
}
/* media + document preview */
function preview(kind, src, name) {
    const el = document.createElement('div'); el.className = 'gb-viewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="gb-viewer-bar"><b>' + esc(name || (kind === 'image' ? 'Picha' : 'Nyaraka')) + '</b><a href="' + esc(src) + '" download="' + esc(name || '') + '" target="_blank" rel="noopener noreferrer">Pakua</a><button type="button" data-x aria-label="Funga">×</button></div>'
        + (kind === 'image' ? '<img src="' + esc(src) + '" alt="">' : (/^data:application\/pdf|\.pdf(\?|$)/i.test(src) ? '<iframe src="' + esc(src) + '" title="' + esc(name || 'PDF') + '"></iframe>' : '<div class="gb-viewer-none">Hakiki haipatikani kwa aina hii — tumia "Pakua".</div>'));
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) el.remove(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', k); } });
    (document.querySelector('#skhGroupSogaModal') || document.body).appendChild(el);
}

/* ===================== delegated actions inside the sections ===================== */
let CTX = null;
document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-gb]'); if (!b || !CTX || !b.closest('#skhGroupSogaModal')) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.getAttribute('data-gb'), ctx = CTX;
    if (a === 'open') { const col = b.getAttribute('data-col') || 'products', id = b.getAttribute('data-id'); window.skhCloseGroupSoga && window.skhCloseGroupSoga(); if (window.openProduct) window.openProduct(id, col); }
    else if (a === 'dm') { const u = b.getAttribute('data-uid'); if (u === me()) return; window.skhCloseGroupSoga && window.skhCloseGroupSoga(); if (window.openChatWithUser) window.openChatWithUser(u, b.getAttribute('data-name') || ''); }
    else if (a === 'order') { const id = b.getAttribute('data-id'); if (typeof window.skhBuyerOrderOpen === 'function' && b.getAttribute('data-role') === 'buyer') { window.skhCloseGroupSoga(); window.skhBuyerOrderOpen(id); } else if (typeof window.openBuyerOrdersModal === 'function' && b.getAttribute('data-role') === 'buyer') { window.skhCloseGroupSoga(); window.openBuyerOrdersModal(); } else toast('Fungua oda ' + id.slice(0, 8) + ' kutoka Business OS → Oda.', 'info'); }
    else if (a === 'sub') { ctx.sub = b.getAttribute('data-k'); rerender(); }
    else if (a === 'svc-share') { await shareService(ctx); rerender(); }
    else if (a === 'offer-share') { await shareOffer(ctx); }
    else if (a === 'soko-new') { await sokoSubmit(ctx); rerender(); }
    else if (a === 'soko-decide') { await sokoDecide(ctx, b.getAttribute('data-id'), b.getAttribute('data-st')); rerender(); }
    else if (a === 'soko-withdraw') { try { const ref = D('chatGroups/' + ctx.gid + '/soko/' + b.getAttribute('data-id')); const x = (await skh.getDoc(ref)).data(); const now = new Date().toISOString();
        await skh.updateDoc(ref, { status: 'withdrawn', updatedAt: now, history: (x.history || []).concat([{ status: 'withdrawn', by: me(), at: now }]).slice(-20) }); bust(ctx.gid); rerender(); } catch (er) { toast(errText(er), 'warn'); } }
    else if (a === 'soko-rules') { await saveSokoRules(ctx); }
    else if (a === 'nego') { await negoCommand(ctx, b); rerender(); }
    else if (a === 'settings') { await saveSettings(ctx); }
    else if (a === 'manage') { const i = document.querySelector('#skhGroupSogaModal [data-act="gsg-info"]'); if (i) i.click(); }
}, true);
let lastRender = null;
function rerender() { if (lastRender) lastRender(); }
function run(fn) { return function (host, ctx) { CTX = ctx; bust(ctx.gid); /* opening a section always reads fresh records */ lastRender = () => fn(host, ctx).catch(err => { host.innerHTML = '<div data-no-i18n class="gb">' + empty('Imeshindikana kupakia', errText(err)) + '</div>'; }); return lastRender(); }; }

window.skhGB = {
    services: run(services), soko: run(soko), groupBuy: run(groupBuy), orders: run(orders), deals: run(deals), delivery: run(delivery),
    panel: (host, ctx) => { if (!CTX || CTX.gid !== ctx.gid) CTX = ctx; else Object.assign(CTX, { g: ctx.g, roles: ctx.roles, names: ctx.names, myRole: ctx.myRole }); return panel(host, CTX).catch(() => {}); },
    proposePrice: (ctx, pid) => proposePrice(ctx, pid), forward, report, preview, bust, sharedRefs, pickOne,
    setCtx: (ctx) => { CTX = ctx; }
};

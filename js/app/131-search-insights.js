/* ==== js/app/131-search-insights.js ====                 [SEARCH-INTEL + SEO 2026-11-21]
 * 1. Search analytics (privacy-conscious):
 *    - events go to Firestore `search_logs` (rules: signed-in writers only, fixed fields, create-only, admin read);
 *    - NO uid, e-mail, name or location is stored: a random per-tab session id links a search to its clicks;
 *    - long digit runs in a query (phone numbers, ids) are masked before storing; at most 40 events per tab session;
 *    - events: search (query, result count, zero-result, latency, top-10 ids = impressions), click (position, item,
 *      category, sponsored), filter (which filter), cart / contact (only for a listing opened from search, 30 min).
 *      Purchases are not tracked: checkout is not switched on (system/launch).
 * 2. Kituo cha Udhibiti → "Utafutaji": top searches, zero-result searches, search→click and search→cart/contact
 *    conversion, popular categories, slow searches (reads at most 1,500 recent events).
 * 3. Kituo cha Udhibiti → "SEO & Viungo": backlink register (`seo_backlinks`, admin-only) with Search Console CSV import,
 *    referring domains, link type (follow / nofollow / ugc / sponsored), quality and monthly growth.
 * 4. /?q=<words> opens the search (WebSite SearchAction in the head points here).
 * 5. Seller share kit: the public shop link + an optional "Tupo SokoHai" badge the seller may put on their own site. */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const say = (m, t) => { if (typeof window.skhToast === 'function') window.skhToast(m, t || 'info', 4000); };
const MAX_EVENTS = 40;
const ENGINE = () => (globalThis.SKHSearchEngine && globalThis.SKHSearchEngine.VERSION) || '';

function sid() {
    try {
        let s = sessionStorage.getItem('skh_sx_sid');
        if (!s) { const b = new Uint8Array(9); crypto.getRandomValues(b); s = Array.from(b, x => (x % 36).toString(36)).join('') + Date.now().toString(36).slice(-4); sessionStorage.setItem('skh_sx_sid', s); }
        return s;
    } catch (e) { return 'nostorage' + Date.now().toString(36); }
}
/** Lower-case, collapse spaces, mask 6+ digit runs (phone numbers), cap 80 characters. */
export function cleanQuery(q) {
    return String(q == null ? '' : q).toLowerCase().replace(/\s+/g, ' ').trim().replace(/\d[\d\s-]{5,}\d/g, '#').slice(0, 80);
}
function count() { try { return Number(sessionStorage.getItem('skh_sx_n') || 0); } catch (e) { return 0; } }
function bump() { try { sessionStorage.setItem('skh_sx_n', String(count() + 1)); } catch (e) {} }

window.skhSearchLog = function (type, data) {
    try {
        if (!skh.currentUser || !skh.db) return false;                       // anonymous searches are not stored
        if (['search', 'click', 'filter', 'cart', 'contact'].indexOf(type) === -1) return false;
        if (count() >= MAX_EVENTS) return false;
        data = data || {};
        const q = cleanQuery(data.q);
        if (type === 'search' && q.length < 2) return false;
        const now = new Date();
        const ev = { t: type, q, sid: sid(), day: now.toISOString().slice(0, 10), at: now.toISOString(), v: String(ENGINE()).slice(0, 40) };
        if (type === 'search') {
            ev.results = Math.max(0, Math.min(10000, Math.round(Number(data.results) || 0)));
            ev.zero = ev.results === 0;
            ev.ms = Math.max(0, Math.min(60000, Math.round(Number(data.ms) || 0)));
            ev.corrected = cleanQuery(data.corrected || '');
            ev.sort = String(data.sort || '').slice(0, 20);
            const top = (globalThis.__skhLastTop || []).slice(0, 10).map(x => String(x).slice(0, 128));
            ev.top = top;
        } else if (type === 'click') {
            ev.itemId = String(data.itemId || '').slice(0, 128); ev.col = ['products', 'services', 'drivers'].indexOf(data.col) !== -1 ? data.col : 'products';
            ev.pos = Math.max(0, Math.min(500, Math.round(Number(data.pos) || 0))); ev.cat = String(data.cat || '').slice(0, 20); ev.sponsored = !!data.sponsored;
            try { sessionStorage.setItem('skh_sx_last', JSON.stringify({ id: ev.itemId, q, at: Date.now() })); } catch (e) {}
        } else if (type === 'filter') {
            ev.filter = String(data.filter || '').slice(0, 20); ev.value = String(data.value == null ? '' : data.value).slice(0, 40);
        } else {
            ev.itemId = String(data.itemId || '').slice(0, 128);
        }
        bump();
        skh.addDoc(skh.collection(skh.db, 'search_logs'), ev).catch(e => console.warn('[search-log]', (e && e.code) || e));
        return true;
    } catch (e) { return false; }
};

/* the panel publishes the ids it showed (impressions) right before the search event is logged */
const _origService = window.skhSearchService;
if (typeof _origService === 'function' && !_origService.__sxWrapped) {
    window.skhSearchService = function (q, o) { const r = _origService(q, o); try { globalThis.__skhLastTop = (r.all || []).slice(0, 10).map(x => x.id); } catch (e) {} return r; };
    window.skhSearchService.__sxWrapped = true;
}

/* cart / contact attribution: only for the listing that was opened from search in the last 30 minutes */
function fromSearch(id) {
    try { const l = JSON.parse(sessionStorage.getItem('skh_sx_last') || 'null'); return l && l.id && l.id === id && Date.now() - l.at < 30 * 60000 ? l : null; } catch (e) { return null; }
}
function wrapConversion(name, type) {
    const tryWrap = () => {
        const f = window[name];
        if (typeof f !== 'function' || f.__sxWrapped) return !!(f && f.__sxWrapped);
        const w = function () {
            try { const p = skh.currentOpenProduct; const l = p && fromSearch(p.id); if (l) window.skhSearchLog(type, { q: l.q, itemId: p.id }); } catch (e) {}
            return f.apply(this, arguments);
        };
        w.__sxWrapped = true; window[name] = w; return true;
    };
    if (!tryWrap()) { let n = 0; const t = setInterval(() => { if (tryWrap() || ++n > 40) clearInterval(t); }, 500); }
}
wrapConversion('addToCart', 'cart');
wrapConversion('skhOpenInquiryBuilder', 'contact');

/* [SEO 2026-11-21] Unknown app paths would otherwise be "soft 404s" (the app shell with 200). The app only knows
   /, /index.html and the listing deep links (/p|s|d|post/<id>); anything else is marked noindex for crawlers. */
(function () {
    const p = location.pathname || '/';
    if (p === '/' || p === '/index.html' || /^\/(p|s|d|post)\/[^/]+\/?$/.test(p)) return;
    let m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    if (!/noindex/i.test(m.getAttribute('content') || '')) m.setAttribute('content', 'noindex, follow');   // never weaken a stricter page value (e.g. the admin portal's noindex, nofollow)
})();

/* /?q=<words> (SearchAction) — fill the search box and run the normal search */
(function () {
    let q = null;
    try { q = new URLSearchParams(location.search).get('q'); } catch (e) {}
    if (!q) return;
    q = String(q).slice(0, 100);
    let tries = 0;
    const go = () => {
        const i = document.getElementById('searchInput');
        if (!i || typeof window.handleSearch !== 'function' || !(skh.cachedItems && skh.cachedItems.length) && tries < 40) { if (++tries < 60) setTimeout(go, 250); return; }
        i.value = q;
        try { window.handleSearch(); } catch (e) {}
        try { i.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    };
    go();
})();

/* ------------------------------------------------------------------ admin: search analytics */
function pct(a, b) { return b ? Math.round(a * 1000 / b) / 10 + '%' : '—'; }
export function aggregateSearchLogs(rows) {
    const s = { searches: 0, zero: 0, clicks: 0, carts: 0, contacts: 0, filters: {}, queries: {}, zeroQ: {}, cats: {}, slow: [], sessionsWithSearch: new Set(), sessionsWithClick: new Set(), sessionsConverted: new Set(), ms: [] };
    rows.forEach(r => {
        if (r.t === 'search') {
            s.searches++; s.sessionsWithSearch.add(r.sid);
            const q = r.q || ''; s.queries[q] = (s.queries[q] || 0) + 1;
            if (r.zero) { s.zero++; s.zeroQ[q] = (s.zeroQ[q] || 0) + 1; }
            if (r.ms) { s.ms.push(r.ms); if (r.ms > 300) s.slow.push(r); }
        } else if (r.t === 'click') { s.clicks++; s.sessionsWithClick.add(r.sid); if (r.cat) s.cats[r.cat] = (s.cats[r.cat] || 0) + 1; }
        else if (r.t === 'cart') { s.carts++; s.sessionsConverted.add(r.sid); }
        else if (r.t === 'contact') { s.contacts++; s.sessionsConverted.add(r.sid); }
        else if (r.t === 'filter') { s.filters[r.filter] = (s.filters[r.filter] || 0) + 1; }
    });
    const top = o => Object.keys(o).sort((a, b) => o[b] - o[a]).slice(0, 15).map(k => [k, o[k]]);
    s.ms.sort((a, b) => a - b);
    return {
        searches: s.searches, zero: s.zero, zeroRate: pct(s.zero, s.searches), clicks: s.clicks, carts: s.carts, contacts: s.contacts,
        searchToClick: pct(s.sessionsWithClick.size, s.sessionsWithSearch.size), searchToConversion: pct(s.sessionsConverted.size, s.sessionsWithSearch.size),
        topQueries: top(s.queries), zeroQueries: top(s.zeroQ), topCategories: top(s.cats), filters: top(s.filters),
        p50ms: s.ms.length ? s.ms[Math.floor(s.ms.length / 2)] : null, p95ms: s.ms.length ? s.ms[Math.floor(s.ms.length * 0.95)] : null, slow: s.slow.length
    };
}
function table(title, rows, label) {
    if (!rows.length) return '<p style="color:#64748b;font-size:13px;margin:6px 0 12px;">' + esc(title) + ': hakuna data bado.</p>';
    return '<h4 style="margin:12px 0 6px;font-size:13.5px;color:#17604E;">' + esc(title) + '</h4><table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + rows.map(r => '<tr><td style="padding:5px 0;border-top:1px solid #eef2f1;">' + esc(label ? label(r[0]) : r[0]) + '</td><td style="text-align:right;border-top:1px solid #eef2f1;font-weight:700;">' + r[1] + '</td></tr>').join('') + '</table>';
}
window.skhSearchAdmin = {
    async html() {
        let rows = [];
        try { const q = await skh.getDocs(skh.query(skh.collection(skh.db, 'search_logs'), skh.orderBy('at', 'desc'), skh.limit(1500))); rows = q.docs.map(d => d.data()); }
        catch (e) { return '<p style="color:#b91c1c;font-size:13px;">Imeshindikana kusoma takwimu za utafutaji (' + esc(e && e.code || e) + ').</p>'; }
        if (!rows.length) return '<p style="color:#64748b;font-size:13px;">Bado hakuna utafutaji uliorekodiwa. Takwimu zinaanza kujaa watumiaji walioingia wakitafuta.</p>';
        const a = aggregateSearchLogs(rows);
        const days = rows.length ? (String(rows[rows.length - 1].day) + ' → ' + String(rows[0].day)) : '';
        const catName = c => (typeof skh.categoryLabel === 'function' && skh.categoryLabel(c)) || c;
        const kpi = (l, v) => '<div style="flex:1 1 120px;background:#f6fbf9;border:1px solid #dcefe7;border-radius:12px;padding:10px;"><small style="color:#526962;">' + esc(l) + '</small><br><b style="font-size:18px;color:#18352D;">' + esc(v) + '</b></div>';
        return '<p style="font-size:12px;color:#64748b;margin:0 0 8px;">Matukio ' + rows.length + ' (' + esc(days) + '). Hakuna jina, e-mail wala mahali vinavyohifadhiwa.</p>'
            + '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + kpi('Utafutaji', a.searches) + kpi('Bila matokeo', a.zero + ' (' + a.zeroRate + ')') + kpi('Utafutaji → kubofya', a.searchToClick)
            + kpi('Utafutaji → kikapu / mawasiliano', a.searchToConversion) + kpi('Kasi (p50 / p95)', (a.p50ms == null ? '—' : a.p50ms + ' / ' + a.p95ms + ' ms')) + '</div>'
            + table('Maneno yanayotafutwa zaidi', a.topQueries)
            + table('Utafutaji usio na matokeo (ongeza bidhaa au maneno kwenye kamusi)', a.zeroQueries)
            + table('Kategoria zinazobofywa kutoka kwenye utafutaji', a.topCategories, catName)
            + table('Vichujio vinavyotumika', a.filters)
            + '<p style="font-size:12px;color:#64748b;margin-top:10px;">Ununuzi haupimwi: malipo ya ndani ya app bado hayajawashwa. Utafutaji wenye kasi &gt; 300 ms: ' + a.slow + '.</p>';
    }
};

/* ------------------------------------------------------------------ admin: backlink register */
const LINK_TYPES = ['follow', 'nofollow', 'ugc', 'sponsored'];
const LINK_STATUS = ['active', 'lost', 'outreach'];
export function domainOf(u) { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } }
/** Parse a Search Console "Links → Top linking sites" (or "Latest links") CSV export, or any CSV with a URL/site column. */
export function parseLinksCsv(text) {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
    const head = split(lines[0]).map(h => h.toLowerCase());
    let col = head.findIndex(h => /linking site|site|domain|url|linking page|source/.test(h));
    const hasHeader = col !== -1; if (!hasHeader) col = 0;
    const tgt = head.findIndex(h => /target|destination|linked page/.test(h));
    const out = [], seen = {};
    lines.slice(hasHeader ? 1 : 0).forEach(l => {
        const c = split(l); const src = c[col] || ''; const d = domainOf(src);
        if (!d || seen[src]) return; seen[src] = 1;
        out.push({ sourceUrl: /^https?:\/\//i.test(src) ? src.slice(0, 300) : 'https://' + d + '/', sourceDomain: d, targetPath: tgt !== -1 ? String(c[tgt] || '/').replace(/^https?:\/\/[^/]+/i, '').slice(0, 200) || '/' : '/' });
    });
    return out;
}
function blId(d, p) { return ('bl_' + (d + '_' + p).toLowerCase().replace(/[^a-z0-9]+/g, '_')).slice(0, 120); }
window.skhSeoAdmin = {
    async html() {
        let rows = [];
        try { const q = await skh.getDocs(skh.query(skh.collection(skh.db, 'seo_backlinks'), skh.limit(500))); rows = q.docs.map(d => Object.assign({ id: d.id }, d.data())); }
        catch (e) { return '<p style="color:#b91c1c;font-size:13px;">Imeshindikana kusoma rejista ya viungo (' + esc(e && e.code || e) + ').</p>'; }
        const active = rows.filter(r => r.status === 'active');
        const domains = new Set(active.map(r => r.sourceDomain));
        const byType = {}; active.forEach(r => { byType[r.rel] = (byType[r.rel] || 0) + 1; });
        const byMonth = {}; rows.forEach(r => { const m = String(r.firstSeen || '').slice(0, 7); if (m) byMonth[m] = (byMonth[m] || 0) + 1; });
        const months = Object.keys(byMonth).sort().slice(-12);
        const sel = (id, opts, v) => '<select id="' + id + '" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;">' + opts.map(o => '<option' + (o === v ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>';
        return '<p style="font-size:12.5px;color:#526962;margin:0 0 8px;">Rejista ya viungo halali vinavyoelekeza SokoHai (data kutoka Google Search Console au uthibitisho wa mshirika). '
            + 'Hakuna viungo vya kununua, mitandao ya blogu (PBN), maoni ya spam wala viungo vilivyofichwa.</p>'
            + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">'
            + ['Domains zinazoelekeza: ' + domains.size, 'Viungo hai: ' + active.length, 'Vilivyopotea: ' + rows.filter(r => r.status === 'lost').length, 'Mawasiliano yanaendelea: ' + rows.filter(r => r.status === 'outreach').length]
                .map(t => '<span style="background:#f6fbf9;border:1px solid #dcefe7;border-radius:999px;padding:6px 10px;font-size:12.5px;font-weight:700;">' + esc(t) + '</span>').join('') + '</div>'
            + '<p style="font-size:12.5px;margin:0 0 6px;">Aina: ' + (LINK_TYPES.map(t => t + ' ' + (byType[t] || 0)).join(' · ')) + '</p>'
            + (months.length ? '<p style="font-size:12.5px;margin:0 0 10px;">Ukuaji (viungo vipya kwa mwezi): ' + months.map(m => esc(m) + ': <b>' + byMonth[m] + '</b>').join(' · ') + '</p>' : '')
            + '<details style="margin:8px 0;"><summary style="font-weight:700;cursor:pointer;">Ongeza kiungo</summary><div style="display:grid;gap:6px;margin-top:8px;">'
            + '<input id="skhBlSrc" placeholder="Ukurasa unaoelekeza (https://...)" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;">'
            + '<input id="skhBlTgt" placeholder="Ukurasa wa SokoHai unaolengwa (mf. /duka/... au /)" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;">'
            + '<input id="skhBlAnchor" placeholder="Maneno ya kiungo (anchor text)" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;">'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + sel('skhBlRel', LINK_TYPES, 'follow') + sel('skhBlStatus', LINK_STATUS, 'active')
            + '<select id="skhBlQ" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;"><option value="3">Ubora 3/5</option><option value="5">5 — tovuti husika yenye mamlaka</option><option value="4">4</option><option value="2">2</option><option value="1">1 — dhaifu / ya kutiliwa shaka</option></select>'
            + '<select id="skhBlKind" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;"><option value="merchant">Muuzaji anayeshiriki</option><option value="supplier">Msambazaji</option><option value="association">Chama cha biashara</option><option value="directory">Directory husika</option><option value="publisher">Mchapishaji / blogu</option><option value="community">Jumuiya ya biashara</option><option value="partner">Mshirika aliyeidhinishwa</option><option value="other">Nyingine</option></select></div>'
            + '<input id="skhBlNote" placeholder="Maelezo (hiari)" maxlength="300" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;">'
            + '<button type="button" onclick="skhSeoAdmin.add()" style="padding:9px;border:none;border-radius:10px;background:#18A982;color:#fff;font-weight:800;">Hifadhi kiungo</button></div></details>'
            + '<details style="margin:8px 0;"><summary style="font-weight:700;cursor:pointer;">Ingiza CSV ya Google Search Console</summary><p style="font-size:12px;color:#64748b;">Search Console → Links → "Top linking sites" → Export → CSV. Viungo vinaingizwa kama "follow", ubora 3 — kagua kisha rekebisha.</p>'
            + '<input type="file" id="skhBlCsv" accept=".csv,text/csv" onchange="skhSeoAdmin.importCsv(this)"></details>'
            + (rows.length ? '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px;"><tr style="text-align:left;color:#526962;"><th>Domain</th><th>Lengwa</th><th>Aina</th><th>Ubora</th><th>Hali</th><th></th></tr>'
                + rows.sort((a, b) => String(b.lastChecked || '').localeCompare(String(a.lastChecked || ''))).map(r => '<tr><td style="padding:5px 0;border-top:1px solid #eef2f1;"><a href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener nofollow">' + esc(r.sourceDomain) + '</a></td><td style="border-top:1px solid #eef2f1;">' + esc(r.targetPath) + '</td><td style="border-top:1px solid #eef2f1;">' + esc(r.rel) + '</td><td style="border-top:1px solid #eef2f1;">' + esc(r.quality) + '</td><td style="border-top:1px solid #eef2f1;">' + esc(r.status) + '</td>'
                    + '<td style="border-top:1px solid #eef2f1;text-align:right;"><button type="button" onclick="skhSeoAdmin.status(\'' + esc(r.id) + '\',\'' + (r.status === 'active' ? 'lost' : 'active') + '\')" style="font-size:11px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:3px 6px;">' + (r.status === 'active' ? 'Imepotea' : 'Hai') + '</button></td></tr>').join('') + '</table>'
                : '<p style="color:#64748b;font-size:13px;">Rejista ni tupu. Ongeza viungo halisi unavyoviona kwenye Search Console au vilivyothibitishwa na washirika.</p>');
    },
    async save(row) {
        const who = skh.currentUser && skh.currentUser.uid; if (!who) return false;
        const now = new Date().toISOString();
        const id = blId(row.sourceDomain, row.sourceUrl + '|' + row.targetPath);
        await skh.setDoc(skh.doc(skh.db, 'seo_backlinks', id), {
            sourceUrl: row.sourceUrl, sourceDomain: row.sourceDomain, targetPath: row.targetPath || '/', anchor: String(row.anchor || '').slice(0, 120),
            rel: LINK_TYPES.indexOf(row.rel) !== -1 ? row.rel : 'follow', quality: Math.max(1, Math.min(5, Number(row.quality) || 3)),
            kind: String(row.kind || 'other').slice(0, 20), status: LINK_STATUS.indexOf(row.status) !== -1 ? row.status : 'active',
            note: String(row.note || '').slice(0, 300), firstSeen: row.firstSeen || now.slice(0, 10), lastChecked: now, updatedBy: who
        });
        return true;
    },
    async add() {
        const v = id => String((document.getElementById(id) || {}).value || '').trim();
        const src = v('skhBlSrc'), d = domainOf(src);
        if (!d || !/^https?:\/\//i.test(src)) { say('Weka URL kamili ya ukurasa unaoelekeza (https://...).', 'error'); return; }
        if (/(^|\.)sokohai\.com$|netlify\.app$/.test(d)) { say('Hiki ni kiungo cha ndani, si backlink.', 'error'); return; }
        try { await this.save({ sourceUrl: src.slice(0, 300), sourceDomain: d, targetPath: v('skhBlTgt') || '/', anchor: v('skhBlAnchor'), rel: v('skhBlRel'), quality: v('skhBlQ'), kind: v('skhBlKind'), status: v('skhBlStatus'), note: v('skhBlNote') }); say('Kiungo kimehifadhiwa.', 'success'); if (window.skhAdminCCTab) window.skhAdminCCTab('seo'); }
        catch (e) { say('Imeshindikana: ' + (e && e.message || e), 'error'); }
    },
    async importCsv(input) {
        const f = input && input.files && input.files[0]; if (!f) return;
        if (f.size > 2 * 1024 * 1024) { say('Faili ni kubwa mno (zaidi ya 2 MB).', 'error'); return; }
        const rows = parseLinksCsv(await f.text()).filter(r => !/(^|\.)sokohai\.com$|netlify\.app$/.test(r.sourceDomain)).slice(0, 300);
        let n = 0; for (const r of rows) { try { if (await this.save(Object.assign({ rel: 'follow', quality: 3, kind: 'other', status: 'active', note: 'Search Console CSV' }, r))) n++; } catch (e) {} }
        say('Viungo ' + n + ' vimeingizwa.', 'success'); if (window.skhAdminCCTab) window.skhAdminCCTab('seo');
    },
    async status(id, status) {
        try { await skh.updateDoc(skh.doc(skh.db, 'seo_backlinks', id), { status, lastChecked: new Date().toISOString(), updatedBy: skh.currentUser.uid }); if (window.skhAdminCCTab) window.skhAdminCCTab('seo'); }
        catch (e) { say('Imeshindikana: ' + (e && e.message || e), 'error'); }
    }
};

/* ------------------------------------------------------------------ seller share kit */
window.skhOpenShareKit = function () {
    const u = skh.currentUser; if (!u) { if (skh.requireAuth) skh.requireAuth(() => window.skhOpenShareKit()); return; }
    const SP = globalThis.SKHSeoPaths; if (!SP) return;
    const name = (skh.currentUserData && (skh.currentUserData.storeName || skh.currentUserData.businessName || skh.currentUserData.fullName)) || u.displayName || 'Duka';
    const origin = (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.CANONICAL_ORIGIN) || location.origin;
    const url = origin + SP.seller(name, u.uid);
    const badge = '<a href="' + url + '" title="' + esc(name) + ' kwenye SokoHai"><img src="' + origin + '/assets/badges/tupo-sokohai.svg" alt="Tupo SokoHai" width="160" height="48"></a>';
    let m = document.getElementById('skhShareKit');
    if (!m) { m = document.createElement('div'); m.id = 'skhShareKit'; m.className = 'overlay-menu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.appendChild(m); }
    m.style.cssText = 'display:flex;position:fixed;inset:0;z-index:100000;background:rgba(15,42,61,.45);align-items:flex-end;justify-content:center;';
    m.innerHTML = '<div style="background:#fff;width:100%;max-width:520px;border-radius:22px 22px 0 0;padding:18px 18px 26px;font-family:Inter,system-ui,sans-serif;max-height:90vh;overflow:auto;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;"><h3 style="margin:0;color:#18352D;">Shiriki duka lako</h3><button type="button" aria-label="Funga" onclick="document.getElementById(\'skhShareKit\').style.display=\'none\'" style="border:0;background:#f1f5f9;border-radius:50%;width:34px;height:34px;font-size:18px;">×</button></div>'
        + '<p style="font-size:13px;color:#526962;">Ukurasa wako wa umma kwenye SokoHai unaonyesha matangazo yako yaliyo hai. Unasasishwa kila tovuti inapojengwa upya (kawaida mara moja kwa siku), kwa hiyo duka jipya linaweza kuchukua hadi siku moja kuonekana.</p>'
        + '<label style="font-size:12px;font-weight:700;color:#17604E;">Kiungo cha duka</label><input id="skhKitUrl" readonly value="' + esc(url) + '" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin:4px 0 6px;">'
        + '<button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById(\'skhKitUrl\').value).then(()=>window.skhToast&&skhToast(\'Kiungo kimenakiliwa\',\'success\'))" style="padding:9px 14px;border:0;border-radius:999px;background:#18A982;color:#fff;font-weight:800;">Nakili kiungo</button>'
        + '<p style="font-size:13px;color:#526962;margin-top:14px;">Una tovuti au blogu ya biashara? Unaweza (si lazima) kuweka beji hii inayoelekeza kwenye duka lako:</p>'
        + '<img src="/assets/badges/tupo-sokohai.svg" alt="Tupo SokoHai" width="160" height="48" style="display:block;margin:6px 0;">'
        + '<textarea id="skhKitBadge" readonly rows="3" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:10px;font:12px ui-monospace,monospace;">' + esc(badge) + '</textarea>'
        + '<button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById(\'skhKitBadge\').value).then(()=>window.skhToast&&skhToast(\'Msimbo umenakiliwa\',\'success\'))" style="padding:9px 14px;border:1px solid #18A982;border-radius:999px;background:#fff;color:#17604E;font-weight:800;margin-top:6px;">Nakili msimbo wa beji</button>'
        + '<p style="font-size:11.5px;color:#64748b;margin-top:12px;">SokoHai hailipi wala haiombi viungo kwa malipo. Usiweke beji kwenye tovuti zisizo zako au kwa njia ya spam.</p></div>';
};

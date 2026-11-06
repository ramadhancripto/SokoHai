/* ==== js/app/111-business-os-overview.js ==== */
/* ============================================================================
   SokoHai BUSINESS OS — Overview Dashboard (Stage 1A)
   ---------------------------------------------------------------------------
   KANUNI: hakuna namba ya kubuni. Kila kipimo kina chanzo rasmi:

     1) posReports (Cloud Function ya server)  → mauzo, oda, fedha taslimu,
        madeni ya wateja (credit), marejesho/refund, matumizi, mchanganyiko wa
        malipo, mauzo kwa mfanyakazi, mauzo kwa bidhaa. Server inahesabu;
        browser inatuma filters (period) tu.
     2) sales (server-written, rules: write:false) → shughuli za hivi karibuni.
     3) products / purchase_orders / POS offline queue → tahadhari za stoo,
        oda za manunuzi zinazosubiri, na foleni ya POS ya nje ya mtandao.

   Kipimo kisichopatikana kwa uhakika (mf. FAIDA — hakuna gharama ya bidhaa
   kwenye rekodi ya mauzo ya server) huonyeshwa kama "haipatikani" pamoja na
   sababu. Haijazwa kwa namba ya kudhaniwa.
   ========================================================================== */
import { skh } from './00-bootstrap.js';

function T(key, en, vars) {
    var s = null;
    try { if (window.t) s = window.t(key, vars); } catch (e) { }
    if (!s || s === key) {
        s = en;
        if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
    }
    return s;
}
const esc = (v) => (skh && skh.skhEscape ? skh.skhEscape(String(v == null ? '' : v)) : String(v == null ? '' : v));
const ico = (n, s) => (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : '');
const money = (v) => 'TSh ' + Number(v || 0).toLocaleString('en-US');
const num = (v) => Number(v || 0).toLocaleString('en-US');
const pct = (v) => (Number.isFinite(v) ? v.toFixed(1) + '%' : '—');
const shortId = (id) => String(id || '').replace(/^pos_/, '').slice(0, 10).toUpperCase();

/* ------------------------------ periods ------------------------------ */
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function buildPeriods(range) {
    const now = new Date();
    let start, end, label;
    if (range === 'week') {
        start = startOfDay(now);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Jumatatu
        end = new Date(start); end.setDate(end.getDate() + 7);
        label = T('ov_range_week', 'Wiki hii');
    } else if (range === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        label = T('ov_range_month', 'Mwezi huu');
    } else {
        start = startOfDay(now);
        end = new Date(start); end.setDate(end.getDate() + 1);
        label = T('ov_range_today', 'Leo');
    }
    const span = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime());
    const prevStart = new Date(start.getTime() - span);
    const prevLabel = range === 'today' ? T('ov_prev_day', 'jana')
        : range === 'week' ? T('ov_prev_week', 'wiki iliyopita')
            : T('ov_prev_month', 'mwezi uliopita');
    return {
        range, label, prevLabel,
        current: { start: start.toISOString(), end: end.toISOString() },
        previous: { start: prevStart.toISOString(), end: prevEnd.toISOString() }
    };
}

/* ------------------------------ data ------------------------------ */
async function callReport(period) {
    // [2026-11-06] legacy sellers: create the canonical Business/Store once (server).
    if (typeof window.skhEnsureBusinessScope === 'function') { try { await window.skhEnsureBusinessScope(); } catch (e) { } }
    const payload = {
        businessId: (skh.currentUserData && skh.currentUserData.businessId) || null,
        storeId: (skh.currentUserData && skh.currentUserData.storeId) || null,
        period: { start: period.start, end: period.end }
    };
    const res = await skh.wrapCallable('posReports')(payload);
    return (res && res.data) ? res.data : (res || null);
}

async function loadRecentSales(ownerUid) {
    if (!ownerUid) return [];
    const q = skh.query(
        skh.collection(skh.db, 'sales'),
        skh.where('sellerId', '==', ownerUid),
        skh.limit(25)
    );
    const snap = await skh.getDocs(q);
    const rows = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    rows.sort((a, b) => String(b.completedAt || b.createdAt || '').localeCompare(String(a.completedAt || a.createdAt || '')));
    return rows.slice(0, 8);
}

function productRows() {
    const cached = (window.dashboardCachedData && window.dashboardCachedData.prodSnap) || null;
    if (!cached) return null;
    const rows = [];
    cached.forEach(d => rows.push(Object.assign({ id: d.id }, d.data())));
    return rows;
}

function lowStockCount() {
    const prods = productRows();
    if (!prods) return 0;
    return prods.filter(x => {
        const stock = parseFloat(x.stock) || 0;
        const limit = parseInt(x.lowStockAlert, 10) || 5;
        return stock <= limit;
    }).length;
}

function pendingPOs() {
    const cached = (window.dashboardCachedData && window.dashboardCachedData.poSnap) || null;
    if (!cached) return null;
    let count = 0;
    cached.forEach(d => { const po = d.data() || {}; if (String(po.status || 'pending') === 'pending') count++; });
    return count;
}

function offlineQueueCount() {
    try {
        if (window.posOfflineQueue && typeof window.posOfflineQueue.read === 'function') {
            const q = window.posOfflineQueue.read();
            return Array.isArray(q) ? q.length : 0;
        }
    } catch (e) { }
    return null;
}

/* ------------------------------ small pieces ------------------------------ */
function card(label, value, opts) {
    opts = opts || {};
    const tone = opts.tone ? ' is-' + opts.tone : '';
    const sub = opts.sub ? '<small class="bos-kpi-sub">' + opts.sub + '</small>' : '';
    return '<div class="bos-kpi' + tone + '">'
        + '<span class="bos-kpi-label">' + esc(label) + '</span>'
        + '<b class="bos-kpi-value">' + value + '</b>'
        + sub
        + '</div>';
}

function emptyState(text, hint) {
    return '<div class="bos-empty">' + ico('folder', 22)
        + '<b>' + esc(text) + '</b>'
        + (hint ? '<p>' + esc(hint) + '</p>' : '')
        + '</div>';
}

function delta(current, previous) {
    const c = Number(current || 0), p = Number(previous || 0);
    if (!p && !c) return { text: '—', tone: 'flat' };
    if (!p) return { text: T('ov_new', 'mpya'), tone: 'up' };
    const change = ((c - p) / Math.abs(p)) * 100;
    return { text: (change >= 0 ? '+' : '') + change.toFixed(1) + '%', tone: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' };
}

function trendRow(label, current, previous, formatter) {
    const d = delta(current, previous);
    const arrow = d.tone === 'up' ? '↑' : d.tone === 'down' ? '↓' : '→';
    return '<div class="bos-trend-row">'
        + '<span class="bos-trend-label">' + esc(label) + '</span>'
        + '<b class="bos-trend-value">' + formatter(current) + '</b>'
        + '<span class="bos-trend-delta is-' + d.tone + '">' + arrow + ' ' + esc(d.text) + '</span>'
        + '</div>';
}

function panel(title, body, opts) {
    opts = opts || {};
    return '<section class="bos-panel' + (opts.wide ? ' is-wide' : '') + '">'
        + '<header class="bos-panel-head"><b>' + esc(title) + '</b>'
        + '<span class="bos-panel-tools">'
        + (opts.tools || '')
        + (opts.source ? '<span class="bos-source">' + esc(opts.source) + '</span>' : '')
        + '</span>'
        + '</header>'
        + '<div class="bos-panel-body">' + body + '</div>'
        + (opts.foot ? '<footer class="bos-panel-foot">' + opts.foot + '</footer>' : '')
        + '</section>';
}

/* ---------- C1: chart ya kila siku (HTML bars — hakuna library, hakuna gradient) ---------- */
function shortDay(dateISO) {
    const d = new Date(dateISO + 'T12:00:00Z');
    if (isNaN(d.getTime())) return dateISO;
    return d.toLocaleDateString('sw-TZ', { day: '2-digit', month: 'short' });
}

function dailyChart(rows) {
    if (!Array.isArray(rows) || !rows.length) {
        return emptyState(T('ov_chart_empty', 'Mfululizo wa kila siku haupatikani'),
            T('ov_chart_empty_hint', 'Server haijatoa daily[] kwa kipindi hiki. Hakuna namba iliyozuliwa.'));
    }
    const values = rows.map(r => Number(r.grossSales) || 0);
    const max = Math.max.apply(null, values.concat([1]));
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / rows.length;
    const best = rows.reduce((a, r) => (Number(r.grossSales) || 0) > (Number(a.grossSales) || 0) ? r : a, rows[0]);
    const labels = rows.length > 1 ? [0, Math.floor(rows.length / 2), rows.length - 1] : [0];

    const bars = rows.map(r => {
        const v = Number(r.grossSales) || 0;
        const h = max > 0 ? Math.max(v > 0 ? 3 : 0, Math.round((v / max) * 100)) : 0;
        const title = shortDay(r.date) + ': ' + money(v) + ' · ' + num(r.completedSales) + ' '
            + T('ov_chart_orders', 'oda') + ' · net ' + money(r.netSales);
        return '<div class="bos-chart-col" title="' + esc(title) + '">'
            + '<span class="bos-chart-bar' + (v > 0 ? '' : ' is-zero') + '" style="height:' + h + '%"></span>'
            + '</div>';
    }).join('');

    const axis = '<div class="bos-chart-axis">'
        + labels.map(i => '<span>' + esc(shortDay(rows[i].date)) + '</span>').join('')
        + '</div>';

    const legend = '<div class="bos-chart-meta">'
        + '<span>' + esc(T('ov_chart_total', 'Jumla')) + ': <b>' + money(total) + '</b></span>'
        + '<span>' + esc(T('ov_chart_avg', 'Wastani kwa siku')) + ': <b>' + money(avg) + '</b></span>'
        + '<span>' + esc(T('ov_chart_best', 'Siku bora')) + ': <b>' + esc(shortDay(best.date)) + ' — ' + money(best.grossSales) + '</b></span>'
        + '<span class="bos-chart-key"><i></i>' + esc(T('ov_chart_key', 'Mauzo (Gross) kwa siku')) + '</span>'
        + '</div>';

    const dense = rows.length > 45 ? ' is-dense' : '';
    return '<div class="bos-chart' + dense + '" role="img" aria-label="' + esc(T('ov_chart_aria', 'Chart ya mauzo kwa siku')) + '">'
        + '<div class="bos-chart-bars">' + bars + '</div>'
        + axis
        + '</div>' + legend;
}

/* ---------- C2: marejesho, refund na madeni (kutoka summary) ---------- */
function returnsBlock(s) {
    const rows = [
        [T('ov_ret_returned', 'Marejesho (RETURNED)'), money(s.returnedAmount), 'is-warn'],
        [T('ov_ret_refunded', 'Refund zilizolipwa'), money(s.refundedAmount), ''],
        [T('ov_ret_refund_pending', 'Refund zinazosubiri'), money(s.refundsPending), Number(s.refundsPending) > 0 ? 'is-warn' : ''],
        [T('ov_ret_credit', 'Marejesho yaliyowekwa kwa deni'), money(s.creditAdjusted), ''],
        [T('ov_ret_void', 'Mauzo yaliyofutwa (void)'), money(s.voidValue), Number(s.voidValue) > 0 ? 'is-warn' : ''],
        [T('ov_ret_debt', 'Madeni yanayodaiwa'), money(s.creditOutstanding), Number(s.creditOutstanding) > 0 ? 'is-danger' : '']
    ];
    return '<table class="bos-table"><thead><tr><th scope="col">' + esc(T('ov_ret_type', 'Aina')) + '</th><th scope="col">' + esc(T('ov_ret_amount', 'Kiasi')) + '</th></tr></thead><tbody>'
        + rows.map(([label, value, tone]) => '<tr><td>' + esc(label) + '</td><td class="bos-num ' + tone + '">' + value + '</td></tr>').join('')
        + '</tbody></table>';
}

/* ---------- C3: bidhaa zisizouza katika kipindi ---------- */
function slowMovers() {
    const prods = productRows();
    if (!prods) return null;
    return prods.map(x => ({
        id: x.id || x.productId || x.docId,
        title: x.title || x.name || T('ov_product', 'Bidhaa'),
        stock: parseFloat(x.stock) || 0
    })).filter(x => x.id);
}

function slowBlock(prods, report) {
    if (!prods) return emptyState(T('ov_slow_nocache', 'Orodha ya bidhaa haijapakiwa'));
    const soldIds = {};
    Object.keys((report && report.products) || {}).forEach(k => {
        const row = report.products[k];
        if (row && row.productId && (Number(row.quantitySold) || 0) > 0) soldIds[row.productId] = true;
    });
    const slow = prods.filter(x => !soldIds[x.id] && x.stock > 0).sort((a, b) => b.stock - a.stock).slice(0, 6);
    if (!slow.length) {
        if (!prods.length) return emptyState(T('ov_slow_empty', 'Hakuna bidhaa bado'));
        return '<div class="bos-ok">' + ico('check', 18) + '<span>' + esc(T('ov_slow_ok', 'Kila bidhaa iliyo na stoo imeuza angalau mara moja katika kipindi hiki.')) + '</span></div>';
    }
    return '<ul class="bos-list">' + slow.map(x =>
        '<li><span class="bos-list-main">' + esc(x.title) + '</span>'
        + '<span class="bos-tag is-warn">' + esc(T('ov_slow_stock', 'stoo')) + ' ' + num(x.stock) + ' · ' + esc(T('ov_slow_none', 'mauzo 0')) + '</span></li>').join('')
        + '</ul>';
}

/* ---------- C4: kituo cha tahadhari (kipaumbele) ---------- */
function alertsBlock(ctx) {
    const items = [];
    const push = (sev, label, value, action, actionLabel) => items.push({ sev, label, value, action, actionLabel });
    const s = ctx.summary || {};
    if (Number(s.creditOutstanding) > 0) push('danger', T('ov_al_credit', 'Madeni ya wateja yanayodaiwa'), money(s.creditOutstanding), "window.switchDashTab('expenses')", T('ov_al_open_ledger', 'Fungua Leja'));
    if (Number(s.refundsPending) > 0) push('danger', T('ov_al_refund', 'Refund zinazosubiri kulipwa'), money(s.refundsPending), "window.switchDashTab('expenses')", T('ov_al_open_ledger', 'Fungua Leja'));
    if (ctx.lowStock > 0) push('warn', T('ov_al_stock', 'Bidhaa zilizo chini ya kiwango'), num(ctx.lowStock), "window.switchDashTab('inventory')", T('ov_al_open_stock', 'Fungua Stoo'));
    if (Number(s.pendingPaymentSales) > 0) push('warn', T('ov_al_pending_pay', 'Mauzo yanayosubiri uthibitisho wa malipo'), num(s.pendingPaymentSales), "window.switchDashTab('expenses')", T('ov_al_open_ledger', 'Fungua Leja'));
    if (ctx.poPending > 0) push('warn', T('ov_al_po', 'Oda za manunuzi zinazosubiri'), num(ctx.poPending), "window.switchDashTab('inventory')", T('ov_al_open_stock', 'Fungua Stoo'));
    if (ctx.offline > 0) push('info', T('ov_al_offline', 'Mauzo ya POS yaliyosubiri mtandao'), num(ctx.offline), "window.skhBOSRunAction('openPos')", T('ov_al_open_pos', 'Fungua POS'));

    if (!items.length) {
        return '<div class="bos-ok">' + ico('check', 18) + '<span>' + esc(T('ov_al_ok', 'Hakuna tahadhari inayohitaji uangalizi kwa kipindi hiki.')) + '</span></div>';
    }
    const order = { danger: 0, warn: 1, info: 2 };
    items.sort((a, b) => order[a.sev] - order[b.sev]);
    return '<ul class="bos-alerts">' + items.map(it =>
        '<li class="bos-alert is-' + it.sev + '">'
        + '<span class="bos-alert-dot" aria-hidden="true"></span>'
        + '<span class="bos-alert-text"><b>' + esc(it.label) + '</b><small>' + esc(it.value) + '</small></span>'
        + '<button type="button" class="bos-btn is-mini" onclick="' + it.action + '">' + esc(it.actionLabel) + '</button>'
        + '</li>').join('') + '</ul>';
}

/* ---------- C5: quick actions zenye handlers halisi ---------- */
function quickActions() {
    const defs = [
        ['openPos', T('ov_qa_pos', 'POS — Uza'), 'calculator', "window.skhBOSRunAction('openPos')"],
        ['products', T('ov_qa_products', 'Bidhaa Zangu'), 'package', "window.switchDashTab('my_products')"],
        ['stock', T('ov_qa_stock', 'Stoo'), 'archive', "window.switchDashTab('inventory')"],
        ['ledger', T('ov_qa_ledger', 'Leja Kuu'), 'book', "window.switchDashTab('expenses')"],
        ['transfer', T('ov_qa_transfer', 'Uhamisho wa Matawi'), 'truck', "window.skhBOSRunAction('openStockTransferModal')"],
        ['staff', T('ov_qa_staff', 'Wafanyakazi'), 'users', "window.switchDashTab('staff')"]
    ];
    const live = defs.filter(d => d[0] !== 'transfer' || typeof window.openStockTransferModal === 'function');
    return '<div class="bos-qa" role="group" aria-label="' + esc(T('ov_qa_label', 'Vitendo vya haraka')) + '">'
        + live.map(d => '<button type="button" class="bos-qa-btn" data-bos-qa="' + d[0] + '" onclick="' + d[3] + '">'
            + '<span class="bos-qa-ico">' + ico(d[2], 18) + '</span><span>' + esc(d[1]) + '</span></button>').join('')
        + '</div>';
}

/* ------------------------------ render ------------------------------ */
function renderSkeleton(ws, p) {
    ws.innerHTML = '<div class="bos-overview">'
        + '<div class="bos-ov-head"><div><h2>' + esc(T('ov_title', 'Dashibodi Kuu')) + '</h2>'
        + '<p>' + esc(T('ov_sub', 'Takwimu zilizothibitishwa kutoka server, si namba za kudhaniwa.')) + '</p></div>'
        + '<div class="bos-range" role="tablist">' + rangeButtons(p.range) + '</div></div>'
        + '<div class="bos-skel-grid">' + Array.from({ length: 6 }).map(() => '<div class="bos-skel-card"></div>').join('') + '</div>'
        + '<div class="bos-skel-panel"></div>'
        + '</div>';
}

function rangeButtons(active) {
    const opts = [['today', T('ov_range_today', 'Leo')], ['week', T('ov_range_week', 'Wiki')], ['month', T('ov_range_month', 'Mwezi')]];
    return opts.map(([key, label]) =>
        '<button type="button" role="tab" aria-selected="' + (key === active ? 'true' : 'false') + '"'
        + ' class="bos-range-btn' + (key === active ? ' is-active' : '') + '"'
        + ' onclick="window.skhBusinessOverview.setRange(\'' + key + '\')">' + esc(label) + '</button>').join('');
}

function renderError(ws, p, message) {
    ws.innerHTML = '<div class="bos-overview">'
        + '<div class="bos-ov-head"><div><h2>' + esc(T('ov_title', 'Dashibodi Kuu')) + '</h2></div>'
        + '<div class="bos-range">' + rangeButtons(p.range) + '</div></div>'
        + '<div class="bos-error">' + ico('alert', 22)
        + '<b>' + esc(T('ov_error', 'Ripoti ya server haikuweza kupakiwa')) + '</b>'
        + '<p>' + esc(message || '') + '</p>'
        + '<p class="bos-muted">' + esc(T('ov_error_hint', 'Hakuna namba iliyoonyeshwa kwa sababu chanzo rasmi hakijajibu. Jaribu tena baada ya mtandao kupona.')) + '</p>'
        + '<button type="button" class="bos-btn" onclick="window.skhBusinessOverview.refresh()">' + esc(T('ov_retry', 'Jaribu tena')) + '</button>'
        + '</div></div>';
}

function renderOverview(ws, state) {
    const p = state.periods;
    const s = (state.report && state.report.summary) || {};
    const prev = (state.previous && state.previous.summary) || {};
    const payments = (state.report && state.report.payments) || {};
    const products = (state.report && state.report.products) || {};
    const cashiers = (state.report && state.report.cashiers) || {};
    const daily = (state.report && Array.isArray(state.report.daily)) ? state.report.daily : null;

    /* ---- KPI cards (kutoka posReports) ---- */
    const kpis = [
        card(T('ov_kpi_gross', 'Mauzo (Gross)'), money(s.grossSales), { sub: esc(p.label), tone: 'primary' }),
        card(T('ov_kpi_orders', 'Oda Zilizokamilika'), num(s.completedSales), { sub: esc(p.label) }),
        card(T('ov_kpi_net', 'Mauzo Halisi (Net)'), money(s.netSales), { sub: esc(T('ov_net_sub', 'Gross − marejesho − void')) }),
        card(T('ov_kpi_cash', 'Fedha Taslimu'), money(s.cashCollected), { sub: esc(T('ov_cash_sub', 'Zilizopokelewa kwa Cash')) }),
        card(T('ov_kpi_debt', 'Madeni ya Wateja'), money(s.creditOutstanding), { sub: esc(T('ov_debt_sub', 'Deni/Awamu — halisi')), tone: 'danger' }),
        card(T('ov_kpi_expenses', 'Matumizi'), money(s.expenses), { sub: esc(T('ov_exp_sub', 'Kutoka leja ya duka')) })
    ].join('');

    /* ---- Faida: kipimo kisichopatikana kwa uhakika ---- */
    const profitBlock = '<div class="bos-profit is-unavailable">'
        + '<div class="bos-profit-ico">' + ico('scales', 22) + '</div>'
        + '<div><b>' + esc(T('ov_profit', 'Faida halisi')) + '</b>'
        + '<p>' + esc(T('ov_profit_na', 'Haipatikani kwa uhakika kwa sasa.')) + '</p>'
        + '<small>' + esc(T('ov_profit_reason', 'Sababu: rekodi rasmi ya mauzo (sales) ya server haina gharama ya bidhaa kwa kila mauzo, hivyo faida haiwezi kuhesabiwa bila kudhani. Bei ya kununua iliyopo kwenye bidhaa ni ya sasa, si ya wakati wa mauzo.')) + '</small>'
        + '</div></div>';

    /* ---- Trends: kipindi hiki vs kilichopita ---- */
    const trends = '<div class="bos-trends">'
        + trendRow(T('ov_trend_sales', 'Mauzo'), s.grossSales, prev.grossSales, money)
        + trendRow(T('ov_trend_orders', 'Oda'), s.completedSales, prev.completedSales, num)
        + trendRow(T('ov_trend_net', 'Mauzo halisi'), s.netSales, prev.netSales, money)
        + trendRow(T('ov_trend_cash', 'Fedha taslimu'), s.cashCollected, prev.cashCollected, money)
        + '</div>'
        + '<p class="bos-muted bos-trends-note">' + esc(T('ov_trend_note', 'Kipimo: {cur} dhidi ya {prev}. Chanzo: posReports (server).', { cur: p.label, prev: p.prevLabel })) + '</p>';

    /* ---- Stoo ---- */
    const prods = productRows();
    let invBody;
    if (!prods) {
        invBody = emptyState(T('ov_inv_nocache', 'Orodha ya bidhaa haijapakiwa'));
    } else if (!prods.length) {
        invBody = emptyState(T('ov_inv_empty', 'Hakuna bidhaa bado'), T('ov_inv_empty_hint', 'Ongeza bidhaa ili tahadhari za stoo zianze kuonekana.'));
    } else {
        const low = prods.filter(x => {
            const stock = parseFloat(x.stock) || 0;
            const limit = parseInt(x.lowStockAlert, 10) || 5;
            return stock <= limit;
        }).sort((a, b) => (parseFloat(a.stock) || 0) - (parseFloat(b.stock) || 0)).slice(0, 6);
        invBody = low.length
            ? '<ul class="bos-list">' + low.map(x => {
                const stock = parseFloat(x.stock) || 0;
                return '<li><span class="bos-list-main">' + esc(x.title || x.name || 'Bidhaa') + '</span>'
                    + '<span class="bos-tag is-warn">' + esc(T('ov_stock_left', 'zimebaki')) + ' ' + num(stock) + '</span></li>';
            }).join('') + '</ul>'
            : '<div class="bos-ok">' + ico('check', 18) + '<span>' + esc(T('ov_inv_ok', 'Hakuna bidhaa iliyo chini ya kiwango cha tahadhari.')) + '</span></div>';
        const movements = (state.report && state.report.inventory) || {};
        invBody += '<div class="bos-mini-row">'
            + '<span>' + esc(T('ov_moves_sale', 'Mauzo (units)')) + ': <b>' + num(movements.SALE) + '</b></span>'
            + '<span>' + esc(T('ov_moves_return', 'Marejesho')) + ': <b>' + num(movements.RETURN) + '</b></span>'
            + '<span>' + esc(T('ov_moves_adj', 'Marekebisho')) + ': <b>' + num(movements.ADJUSTMENT) + '</b></span>'
            + '</div>';
    }

    /* ---- Shughuli zinazosubiri ---- */
    const poPending = pendingPOs();
    const offline = offlineQueueCount();
    const pendingRows = [];
    if (Number(s.pendingPaymentSales) > 0) pendingRows.push([T('ov_pend_payments', 'Mauzo yanayosubiri uthibitisho wa malipo'), num(s.pendingPaymentSales)]);
    if (Number(s.refundsPending) > 0) pendingRows.push([T('ov_pend_refunds', 'Marejesho yanayosubiri kulipwa'), money(s.refundsPending)]);
    if (Number(s.creditOutstanding) > 0) pendingRows.push([T('ov_pend_credit', 'Madeni ya wateja (Deni/Awamu)'), money(s.creditOutstanding)]);
    if (Number(s.refundsPending) === 0 && Number(s.pendingPaymentSales) === 0 && Number(s.creditOutstanding) === 0) {
        // hakuna kitu cha kuonyesha kutoka ripoti
    }
    if (poPending !== null && poPending > 0) pendingRows.push([T('ov_pend_po', 'Oda za manunuzi (pending)'), num(poPending)]);
    if (offline !== null && offline > 0) pendingRows.push([T('ov_pend_offline', 'Mauzo ya POS yaliyosubiri mtandao'), num(offline)]);
    const pendingBody = pendingRows.length
        ? '<ul class="bos-list">' + pendingRows.map(([label, value]) =>
            '<li><span class="bos-list-main">' + esc(label) + '</span><span class="bos-tag is-warn">' + esc(value) + '</span></li>').join('') + '</ul>'
        : '<div class="bos-ok">' + ico('check', 18) + '<span>' + esc(T('ov_pend_ok', 'Hakuna kazi inayosubiri kwa sasa.')) + '</span></div>';

    /* ---- Mchanganyiko wa malipo ---- */
    const payKeys = Object.keys(payments);
    const payBody = payKeys.length
        ? '<table class="bos-table"><thead><tr><th scope="col">' + esc(T('ov_pay_method', 'Njia')) + '</th><th scope="col">' + esc(T('ov_pay_count', 'Idadi')) + '</th><th scope="col">' + esc(T('ov_pay_amount', 'Kiasi')) + '</th></tr></thead><tbody>'
        + payKeys.sort((a, b) => (payments[b].authoritativeAmount || 0) - (payments[a].authoritativeAmount || 0)).map(k => {
            const row = payments[k] || {};
            return '<tr><td>' + esc(k) + '</td><td>' + num(row.count) + '</td><td class="bos-num">' + money(row.authoritativeAmount) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : emptyState(T('ov_pay_empty', 'Hakuna malipo katika kipindi hiki'));

    /* ---- Bidhaa zinazoongoza ---- */
    const prodKeys = Object.keys(products);
    const topProducts = prodKeys.map(k => products[k]).sort((a, b) => (b.grossSales || 0) - (a.grossSales || 0)).slice(0, 5);
    const topBody = topProducts.length
        ? '<table class="bos-table"><thead><tr><th scope="col">' + esc(T('ov_product', 'Bidhaa')) + '</th><th scope="col">' + esc(T('ov_qty', 'Idadi')) + '</th><th scope="col">' + esc(T('ov_amount', 'Mauzo')) + '</th></tr></thead><tbody>'
        + topProducts.map(x => '<tr><td>' + esc(x.productName || x.productId || '—') + '</td><td>' + num(x.quantitySold) + '</td><td class="bos-num">' + money(x.grossSales) + '</td></tr>').join('')
        + '</tbody></table>'
        : emptyState(T('ov_products_empty', 'Hakuna mauzo ya bidhaa katika kipindi hiki'));

    /* ---- C6: Mauzo ya hivi karibuni + filter ya njia ya malipo ---- */
    const allSales = state.recentSales || [];
    const payMethods = [];
    allSales.forEach(x => {
        const m = (x.payment && x.payment.method) || '';
        if (m && payMethods.indexOf(m) < 0) payMethods.push(m);
    });
    const salesFilter = state.salesFilter && state.salesFilter !== 'all' ? state.salesFilter : 'all';
    if (salesFilter !== 'all' && payMethods.indexOf(salesFilter) < 0) state.salesFilter = 'all';
    const sales = allSales.filter(x => salesFilter === 'all' || ((x.payment && x.payment.method) || '') === salesFilter);
    const salesTools = allSales.length
        ? '<label class="bos-filter"><span>' + esc(T('ov_sale_filter', 'Malipo')) + '</span>'
            + '<select onchange="window.skhBOSFilterSales(this.value)" aria-label="' + esc(T('ov_sale_filter_aria', 'Chuja mauzo kwa njia ya malipo')) + '">'
            + '<option value="all"' + (salesFilter === 'all' ? ' selected' : '') + '>' + esc(T('ov_sale_all', 'Zote')) + ' (' + allSales.length + ')</option>'
            + payMethods.map(m => '<option value="' + esc(m) + '"' + (salesFilter === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('')
            + '</select></label>'
        : '';
    const salesBody = state.recentSalesError
        ? emptyState(T('ov_sales_error', 'Mauzo ya hivi karibuni hayakuweza kupakiwa'), state.recentSalesError)
        : (sales.length
            ? '<table class="bos-table"><thead><tr><th scope="col">' + esc(T('ov_sale_id', 'Namba')) + '</th><th scope="col">' + esc(T('ov_sale_total', 'Kiasi')) + '</th><th scope="col">' + esc(T('ov_sale_pay', 'Malipo')) + '</th><th scope="col">' + esc(T('ov_sale_time', 'Muda')) + '</th></tr></thead><tbody>'
            + sales.map(x => {
                const when = x.completedAt || x.createdAt;
                const t = when ? new Date(when) : null;
                return '<tr><td>' + esc(shortId(x.saleId || x.id)) + '</td>'
                    + '<td class="bos-num">' + money(x.totals && x.totals.total) + '</td>'
                    + '<td>' + esc((x.payment && x.payment.method) || '—') + '</td>'
                    + '<td>' + esc(t && !isNaN(t.getTime()) ? t.toLocaleString('sw-TZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—') + '</td></tr>';
            }).join('') + '</tbody></table>'
            : (allSales.length
                ? emptyState(T('ov_sales_filter_empty', 'Hakuna mauzo kwa chaguo hili la malipo'), T('ov_sales_filter_empty_hint', 'Badilisha chaguo la malipo kuona mauzo mengine.'))
                : emptyState(T('ov_sales_empty', 'Hakuna mauzo yaliyorekodiwa bado'), T('ov_sales_empty_hint', 'Mauzo ya POS yataonekana hapa mara ya kwanza unapouza.'))));

    /* ---- Wafanyakazi (cashiers) ---- */
    const cashierKeys = Object.keys(cashiers);
    const cashierBody = cashierKeys.length
        ? '<ul class="bos-list">' + cashierKeys.sort((a, b) => (cashiers[b].grossSales || 0) - (cashiers[a].grossSales || 0)).slice(0, 5).map(k => {
            const row = cashiers[k] || {};
            return '<li><span class="bos-list-main">' + esc(k === 'unknown' ? T('ov_unknown_cashier', 'Haijulikani') : k) + '</span>'
                + '<span class="bos-tag">' + num(row.salesCount) + ' · ' + money(row.grossSales) + '</span></li>';
        }).join('') + '</ul>'
        : emptyState(T('ov_cashiers_empty', 'Hakuna mauzo kwa mfanyakazi katika kipindi hiki'));

    /* ---- C1/C2/C3/C4/C5: blocks mpya (data zote halisi) ---- */
    const chartPanel = panel(T('ov_panel_daily', 'Mauzo kwa kila siku'), dailyChart(daily), { wide: true, source: 'posReports.daily · server' });
    const returnsPanel = panel(T('ov_panel_returns', 'Marejesho, refund na madeni'), returnsBlock(s), { source: 'posReports.summary' });
    const slowList = slowMovers();
    const slowPanel = panel(T('ov_panel_slow', 'Bidhaa zisizouza'), slowBlock(slowList, state.report), { source: 'products × posReports.products' });
    const alertPanel = panel(T('ov_panel_alerts', 'Tahadhari za kipaumbele'), alertsBlock({
        summary: s, lowStock: lowStockCount(), poPending: poPending, offline: offline
    }), { source: 'posReports + products + purchase_orders + POS queue' });

    /* ---- Wafuasi (feature iliyokuwepo — IDs zilezile) ---- */
    const followers = '<div class="bos-followers">'
        + '<div class="bos-kpi-label">' + esc(T('ov_followers', 'Wafuasi (Followers)')) + '</div>'
        + '<b class="bos-kpi-value" id="kpiFollowersTotal">…</b>'
        + '<small class="bos-kpi-sub"><span id="kpiFollowersNew">+0</span> ' + esc(T('ov_followers_new', 'wiki hii')) + '</small>'
        + '<div class="bos-muted">'
        + esc(T('ov_followers_active', 'Hai')) + ': <b id="kpiFollowersActive">0</b> · '
        + esc(T('ov_followers_conv', 'Wanununua')) + ': <b id="kpiFollowersConversion">0%</b> · '
        + esc(T('ov_followers_repeat', 'Wanaorudia')) + ': <b id="kpiFollowersRepeat">0</b>'
        + '</div></div>';

    ws.innerHTML = '<div class="bos-overview">'
        + '<div class="bos-ov-head">'
        + '  <div><h2>' + esc(T('ov_title', 'Dashibodi Kuu')) + '</h2>'
        + '  <p>' + esc(T('ov_sub', 'Takwimu zilizothibitishwa kutoka server, si namba za kudhaniwa.')) + '</p></div>'
        + '  <div class="bos-ov-actions">'
        + '    <div class="bos-range" role="tablist">' + rangeButtons(p.range) + '</div>'
        + '    <button type="button" class="bos-btn is-ghost" onclick="window.skhBusinessOverview.refresh()" aria-label="' + esc(T('ov_refresh', 'Sasisha')) + '">' + ico('refresh', 15) + ' ' + esc(T('ov_refresh', 'Sasisha')) + '</button>'
        + '  </div>'
        + '</div>'
        + '<div class="bos-kpi-grid">' + kpis + '</div>'
        + profitBlock
        + quickActions()
        + chartPanel
        + alertPanel
        + '<div class="bos-grid-2">'
        + panel(T('ov_panel_trend', 'Mwenendo wa biashara'), trends, { source: 'posReports · server' })
        + panel(T('ov_panel_pending', 'Kazi zinazosubiri'), pendingBody, { source: 'posReports + purchase_orders + POS queue' })
        + '</div>'
        + '<div class="bos-grid-2">'
        + panel(T('ov_panel_inventory', 'Tahadhari za stoo'), invBody, { source: 'products' })
        + returnsPanel
        + '</div>'
        + '<div class="bos-grid-2">'
        + slowPanel
        + panel(T('ov_panel_top', 'Bidhaa zinazoongoza'), topBody, { source: 'posReports.products' })
        + '</div>'
        + '<div class="bos-grid-2">'
        + panel(T('ov_panel_pay', 'Mchanganyiko wa malipo'), payBody, { source: 'posReports.payments' })
        + panel(T('ov_panel_recent', 'Shughuli za hivi karibuni'), salesBody, { source: 'sales · server-written', tools: salesTools })
        + '</div>'
        + '<div class="bos-grid-2">'
        + panel(T('ov_panel_cashiers', 'Mauzo kwa mfanyakazi'), cashierBody, { source: 'posReports.cashiers' })
        + panel(T('ov_panel_followers', 'Wafuasi'), followers, { source: 'sellerFollowers' })
        + '</div>'
        + '<p class="bos-footnote">' + esc(T('ov_footnote', 'Vyanzo: posReports (server) pamoja na daily[] · sales · products · purchase_orders. Kila kipimo huonyesha chanzo chake; kipimo kisichopatikana huonyeshwa wazi, hakijazwa.')) + '</p>'
        + '</div>';

    if (typeof window.skhPopulateSellerFollowerKpi === 'function') {
        try { window.skhPopulateSellerFollowerKpi(); } catch (e) { }
    }
}

/* ------------------------------ controller ------------------------------ */
const state = { range: 'today', periods: buildPeriods('today'), report: null, previous: null, recentSales: null, recentSalesError: null, salesFilter: 'all' };

function ownerUid() {
    return (skh.currentUserData && (skh.currentUserData.shopOwnerUid || skh.currentUserData.ownerUid))
        || (skh.currentUser && skh.currentUser.uid) || null;
}

async function load(range, ws) {
    const p = buildPeriods(range);
    state.range = range;
    state.periods = p;
    ws = ws || document.getElementById('dashWorkspace');
    if (!ws) return;
    renderSkeleton(ws, p);
    try {
        const [report, previous, recent] = await Promise.all([
            callReport(p.current),
            callReport(p.previous).catch(() => null),
            loadRecentSales(ownerUid()).catch(e => { state.recentSalesError = String(e && e.message || e); return null; })
        ]);
        state.report = report;
        state.previous = previous;
        state.recentSales = recent || [];
        if (!state.recentSalesError) state.recentSalesError = null;
        renderOverview(ws, state);
    } catch (error) {
        state.report = null;
        console.warn('[BOS overview] posReports imeshindikana:', error && error.message);
        renderError(ws, p, String((error && (error.message || error.code)) || error));
    }
}

/* C6: filter ya mauzo — handler halisi (haibadilishi data, inachuja tu) */
window.skhBOSFilterSales = function (value) {
    state.salesFilter = value || 'all';
    const ws = document.getElementById('dashWorkspace');
    if (ws && state.report) renderOverview(ws, state);
};

window.skhBusinessOverview = {
    state,
    buildPeriods,
    render(ws) {
        ws = ws || document.getElementById('dashWorkspace');
        if (!ws) return;
        return load(state.range || 'today', ws);
    },
    setRange(range) {
        return load(range || 'today');
    },
    refresh() {
        return load(state.range || 'today');
    },
    /* Kwa tests: hakuna DOM inayohitajika */
    _pure: { buildPeriods, delta, dailyChart, returnsBlock, slowBlock, alertsBlock, quickActions, shortDay }
};

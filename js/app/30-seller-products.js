/* ==== js/app/30-seller-products.js ==== */
// ============================================================
// SELLER — MY PRODUCTS + PRODUCT PERFORMANCE + INSIGHTS + COMPARE
// ------------------------------------------------------------
// Kanuni: ADDITIVE tu. Inaongeza vitenzi vya usimamizi wa bidhaa
// kwenye dashboard ya muuzaji (Usimamizi) bila kugusa views zilizopo.
// Data zote (views/likes/saves/orders/units/revenue) zinatoka kwenye
// backend halisi — hakuna namba za kutungwa; hakuna false claims.
// ============================================================
import { skh } from './00-bootstrap.js';
import { channelsOf, resolveUnit } from '../../shared/product-listing-core.mjs';

(function () { 'use strict';

    var SOLD_STATUSES = ['completed', 'delivered', 'paid', 'delivered_confirmed', 'shipped'];
    var META = null; // { products:[], ordersAgg:{}, byProduct:{} }
    var MP_Q = '', MP_CAT = '', MP_STOCK = '', MP_STATUS = '', MP_SORT = 'newest';

    function esc(s) { return skh.skhEscape(s == null ? '' : String(s)); }
    function js(s) { return skh.skhJsEsc(s == null ? '' : String(s)); }
    function tzs(n) { return 'TSh ' + Number(n || 0).toLocaleString(); }
    function num(n) { return Number(n || 0); }
    function shopOwnerId() { return (skh.currentUserData && skh.currentUserData.shopOwnerUid) || skh.currentUser.uid; }
    // Tafsiri (lugha moja kwa wakati) — LMS ikiwa ipo, la sivyo fallback ya Kiingereza
    function T(key, en, vars) {
        var s = null;
        try { if (window.t) s = window.t(key, vars); } catch (e) {}
        if (!s || s === key) {
            s = en;
            if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
        }
        return s;
    }

    // ---------- AGGREGATION ----------
    async function loadSellerMetrics() {
        var uid = shopOwnerId();
        var products = [];
        var orders = [];
        try {
            var pq = skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', uid), skh.limit(300));
            var ps = await skh.getDocs(pq);
            ps.forEach(function (d) { products.push(Object.assign({ id: d.id }, d.data())); });
        } catch (e) { }
        try {
            var oq = skh.query(skh.collection(skh.db, 'orders'), skh.where('sellerId', '==', uid), skh.limit(300));
            var os = await skh.getDocs(oq);
            os.forEach(function (d) { orders.push(Object.assign({ id: d.id }, d.data())); });
        } catch (e) { }

        var byProduct = {}; // pid -> {orders, units, revenue}
        orders.forEach(function (o) {
            var st = String(o.status || '').toLowerCase();
            var isSold = SOLD_STATUSES.indexOf(st) !== -1;
            (o.items || []).forEach(function (it) {
                var pid = it.productId || it.id;
                if (!pid) return;
                var qty = num(it.qty || it.quantity) || 1;
                var price = num(it.price) || 0;
                if (!byProduct[pid]) byProduct[pid] = { orders: 0, units: 0, revenue: 0 };
                byProduct[pid].orders++;
                if (isSold || st === '') { byProduct[pid].units += qty; byProduct[pid].revenue += price * qty; }
            });
        });

        var rows = products.map(function (p) {
            var b = byProduct[p.id] || { orders: 0, units: 0, revenue: 0 };
            var views = num(p.views);
            var likes = num(p.likeCount != null ? p.likeCount : (p.likes ? p.likes.length : 0));
            var saves = num(p.savedCount);
            var units = b.units;
            var conv = views > 0 ? (units / views) * 100 : 0;
            var stock = num(p.stock);
            var si = stockInfo(p);
            var st = statusOf(p);
            var rd = readiness(p);
            return {
                id: p.id, title: p.title || 'Bidhaa', image: p.image || p.imagesArray?.[0] || '',
                category: p.category || 'N/A', price: num(p.price), stock: stock,
                stockStatus: si.tracked ? (si.available > 0 ? 'in_stock' : 'out_of_stock') : 'untracked',
                status: st,
                views: views, likes: likes, saves: saves,
                orders: b.orders, units: units, revenue: b.revenue,
                conversion: conv, createdAt: p.createdAt, updatedAt: p.updatedAt || p.createdAt,
                saleMode: p.saleMode,
                modeData: p.modeData || null,   // [§34] muuzaji aone metrics za modes
                /* [KPI 2026-11-03] nyongeza — hakuna uga wa awali ulioondolewa */
                sku: txt2(p.sku || p.productSku || ''), barcode: txt2(p.barcode || ''),
                unitLabel: unitLabel(p), unitPrecision: precisionOf(p),
                stockInfo: si, lowStockThreshold: lowStockThreshold(p),
                madeToOrder: String(p.productType || '').toLowerCase() === 'made_to_order',
                variantCount: (Array.isArray(p.variantCombinations) ? p.variantCombinations.length : 0),
                sellable: st === 'active' && rd.sellable,
                readinessReasons: rd.reasons,
                channels: rd.channels
            };
        });
        var rawMap = {};
        products.forEach(function (p) { rawMap[p.id] = p; });
        /* [COMPARE 2026-11-03] `raw` = nyongeza pekee (haibadilishi `rows`) — inatoa
           description/attributes/features/images/bidhaa mbichi kwa jedwali la kulinganisha. */
        META = { rows: rows, byProduct: byProduct, orders: orders, raw: rawMap };
        return META;
    }

    function rowSort(a, b) {
        if (MP_SORT === 'best') return b.units - a.units;
        if (MP_SORT === 'lowest') return a.units - b.units;
        if (MP_SORT === 'highest') return b.revenue - a.revenue;
        if (MP_SORT === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        if (MP_SORT === 'name') return String(a.title).localeCompare(String(b.title), 'sw');
        if (MP_SORT === 'stock') {
            var sa = (a.stockInfo && a.stockInfo.tracked) ? Number(a.stockInfo.available) : -1;
            var sb = (b.stockInfo && b.stockInfo.tracked) ? Number(b.stockInfo.available) : -1;
            return sa - sb;
        }
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); // newest
    }

    function kpiMatch(r) {
        if (MP_KPI === 'all') return true;
        if (MP_KPI === 'total') return true;
        if (MP_KPI === 'sellable') return !!r.sellable;
        if (MP_KPI === 'draft') return r.status === 'draft';
        if (MP_KPI === 'sold') return !!(MP_SALES.byProduct && MP_SALES.byProduct[r.id] > 0);
        var si = r.stockInfo || { tracked: false };
        if (!si.tracked || r.madeToOrder) return false;
        if (r.status !== 'active') return false;   // hali ileile ya KPI 3/4
        var avail = Number(si.available) || 0;
        var thr = Number(r.lowStockThreshold || MP_LOW_STOCK_DEFAULT);
        if (MP_KPI === 'out') return avail <= 0;
        if (MP_KPI === 'low') return avail > 0 && avail <= thr;
        return true;
    }

    function stockMatch(r) {
        if (!MP_STOCK) return true;
        var si = r.stockInfo || { tracked: false };
        var avail = Number(si.available) || 0;
        var thr = Number(r.lowStockThreshold || MP_LOW_STOCK_DEFAULT);
        if (MP_STOCK === 'untracked') return !si.tracked;
        if (!si.tracked || r.madeToOrder) return false;
        if (r.status !== 'active') return false;   // rule ileile ya KPI 3/4
        if (MP_STOCK === 'out') return avail <= 0;
        if (MP_STOCK === 'low') return avail > 0 && avail <= thr;
        return avail > thr;      // 'in' = in stock na haiko chini
    }

    function filteredRows() {
        if (!META) return [];
        var list = META.rows.slice();
        if (MP_Q) {
            var q = MP_Q.toLowerCase();
            list = list.filter(function (r) {
                return String(r.title).toLowerCase().indexOf(q) !== -1
                    || String(r.category).toLowerCase().indexOf(q) !== -1
                    || String(r.sku || '').toLowerCase().indexOf(q) !== -1
                    || String(r.barcode || '').toLowerCase().indexOf(q) !== -1;
            });
        }
        if (MP_CAT) list = list.filter(function (r) { return r.category === MP_CAT; });
        if (MP_STATUS) list = list.filter(function (r) { return String(r.status).toLowerCase() === MP_STATUS; });
        list = list.filter(stockMatch);
        list = list.filter(kpiMatch);
        list.sort(rowSort);
        return list;
    }

    function statPill(label, value, color) {
        return '<div style="text-align:center;"><small style="display:block;font-size:12px;color:#64748b;text-transform:uppercase;">' + label + '</small><b style="font-size:14px;color:' + (color || '#0f172a') + ';">' + value + '</b></div>';
    }

    function empty(msg) { return '<p style="text-align:center;color:#64748b;padding:30px;">' + (msg || T('smp_no_data', 'Not enough data yet.')) + '</p>'; }

    /* [§34 MODE METRICS] Muuzaji aone hali halisi ya commerce modes zake —
     * kutoka modeData ya Firestore (si placeholder). free_market haitaonyesha
     * chochote kilicho tofauti (Sokohuru = kawaida, SOKO HURU). */
    function modeMetricsLine(r) {
        if (!r || !r.saleMode || r.saleMode === 'free_market') return '';
        var md = r.modeData || {};
        var chip = function (txt, bg, fg) {
            return '<span style="background:' + bg + ';color:' + fg + ';border-radius:8px;padding:3px 8px;font-size:11px;font-weight:900;">' + esc(txt) + '</span>';
        };
        var endTxt = md.endTime ? new Date(Number(md.endTime)).toLocaleDateString('sw-TZ') + ' · ' + new Date(Number(md.endTime)).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : '';
        if (r.saleMode === 'auction') {
            var st = md.ended ? 'Umefungwa' : 'Live';
            return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">'
                + chip(' Mnada: ' + st, '#fdecec', '#c2410c')
                + chip('Dau: TSh ' + Number(md.currentBid || 0).toLocaleString(), '#fff7ed', '#c2410c')
                + chip('Zabuni: ' + (md.totalBids || 0), '#f0f9ff', '#0369a1')
                + (endTxt ? chip('Kuisha: ' + endTxt, '#f1f5f9', '#334155') : '')
                + '</div>';
        }
        if (r.saleMode === 'group_buy') {
            var joined = parseInt(md.joinedUsers) || 1, target = parseInt(md.targetPeople) || 10;
            var status = (joined >= target) ? 'Limekamilika' : (md.endTime && Date.now() >= Number(md.endTime) ? 'Imekwisha' : 'Inavyuma');
            return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">'
                + chip('Group Buy: ' + status, '#dcfce7', '#166534')
                + chip(joined + '/' + target + ' wamejiunga', '#f0fdf4', '#166534')
                + (endTxt ? chip('Kuisha: ' + endTxt, '#f1f5f9', '#334155') : '')
                + '</div>';
        }
        if (r.saleMode === 'price_drop') {
            return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">'
                + chip(' Bei Kushuka: live', '#f3e8ff', '#7c3aed')
                + chip('Min: TSh ' + Number(md.minPrice || 0).toLocaleString(), '#faf5ff', '#7c3aed')
                + (endTxt ? chip('Kuisha: ' + endTxt, '#f1f5f9', '#334155') : '')
                + '</div>';
        }
        if (r.saleMode === 'wholesale') {
            var minQ = parseInt(md.minQty) || 0;
            var tiersN = Array.isArray(md.tiers) ? md.tiers.length : 0;
            return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">'
                + chip(' Jumla: minQty ' + minQ, '#dbeafe', '#0B4F7A')
                + (tiersN ? chip('Tiers: ' + tiersN, '#eff6ff', '#0B4F7A') : chip('Punguzo: ' + (md.discountValue || 0) + (md.discountType === 'percent' ? '%' : ' TSh'), '#eff6ff', '#0B4F7A'))
                + '</div>';
        }
        return '';
    }

    // ================================================================
    // [KPI 2026-11-03] BIDHAA ZANGU — KPI 6 + filters + drill-down
    // Nyongeza pekee: hakuna function, ID, route au integration iliyoondolewa.
    // Vyanzo: products (+ variantCombinations/reservedStock) · orders · posReports (server)
    // ================================================================
    var MP_LOW_STOCK_DEFAULT = 5;     // default inayoweza kusanidiwa: shopSettings.lowStockDefault
    var MP_PAGE_SIZE = 12;
    var MP_KPI = 'all';               // all | total | sellable | low | out | draft | sold
    var MP_RANGE = '7d';              // today | 7d | 30d | month | custom
    var MP_FROM = '', MP_TO = '';
    var MP_LIMIT = MP_PAGE_SIZE;
    var MP_SALES = { loading: false, range: '7d', window: null, byProduct: {}, units: 0, products: 0, sources: [], posState: 'idle', posReason: '', trend: null, error: null };
    var MP_KPI_ERROR = null;

    function txt2(v) { return String(v == null ? '' : v).trim(); }

    /* ---------- uniti (Piece · Kg · L · m …) — rejea shared registry ---------- */
    var MP_UNIT_LABEL = { piece: 'pcs', pair: 'pair', set: 'set', pack: 'pack', box: 'box', carton: 'ctn', kg: 'kg', g: 'g', L: 'L', mL: 'mL', m: 'm', cm: 'cm', bundle: 'bundle', roll: 'roll' };
    function unitLabel(p) {
        var raw = txt2(p && (p.baseUnit || p.unit)) || 'Piece';
        try {
            var u = resolveUnit(raw);
            if (u && u.unitId) return MP_UNIT_LABEL[u.unitId] || u.unitId;
        } catch (e) { }
        return raw;
    }
    function precisionOf(p) {
        var q = Number(p && p.quantityPrecision);
        return Number.isFinite(q) && q > 0 && q <= 3 ? q : 0;
    }
    function roundQty(v, precision) {
        var f = Math.pow(10, precision || 0);
        return Math.round(Number(v || 0) * f) / f;
    }
    function fmtQty(v, precision) {
        var n = Number(v || 0);
        if (!Number.isFinite(n)) return '—';
        if (!precision) return String(Math.round(n));
        return n.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '');
    }

    /* ---------- stock: mamlaka ni product doc (stock/variantCombinations − reserved) ---------- */
    function stockInfo(p) {
        var precision = precisionOf(p);
        var combos = Array.isArray(p && p.variantCombinations) ? p.variantCombinations : [];
        if (combos.length) {
            var stockS = 0, reservedS = 0, variants = [];
            combos.forEach(function (c) {
                var s = Number(c && c.stock); if (!Number.isFinite(s)) s = 0;
                var r = Number(c && c.reserved); if (!Number.isFinite(r)) r = 0;
                stockS += s; reservedS += r;
                variants.push({
                    variantId: (c && c.variantId) || '', sku: (c && c.sku) || '',
                    stock: roundQty(s, precision), reserved: roundQty(r, precision),
                    available: roundQty(Math.max(0, s - r), precision)
                });
            });
            return { tracked: true, source: 'variantCombinations', stock: roundQty(stockS, precision), reserved: roundQty(reservedS, precision), available: roundQty(Math.max(0, stockS - reservedS), precision), variants: variants, precision: precision };
        }
        var hasStock = p && p.stock !== undefined && p.stock !== null && p.stock !== '';
        var raw = Number(p && p.stock);
        if (!hasStock || !Number.isFinite(raw)) {
            return { tracked: false, source: 'none', stock: null, reserved: 0, available: null, variants: [], precision: precision };
        }
        var rs = Number(p && p.reservedStock); if (!Number.isFinite(rs)) rs = 0;
        return { tracked: true, source: 'product.stock', stock: roundQty(raw, precision), reserved: roundQty(rs, precision), available: roundQty(Math.max(0, raw - rs), precision), variants: [], precision: precision };
    }

    function lowStockThreshold(p) {
        var own = Number(p && p.lowStockAlert);
        if (Number.isFinite(own) && own > 0) return own;
        var st = (skh.currentUserData && skh.currentUserData.shopSettings) || {};
        var d = Number(st.lowStockDefault);
        return Number.isFinite(d) && d > 0 ? d : MP_LOW_STOCK_DEFAULT;
    }

    /* ---------- status (Active · Draft · Suspended) ---------- */
    function statusOf(p) {
        if (!p) return 'suspended';
        if (p.suspended === true || p.archivedAt) return 'suspended';
        var pub = '';
        try { pub = String(skh.productPublicationStatus ? skh.productPublicationStatus(p) : (p.publicationStatus || p.status || 'published')).toLowerCase(); }
        catch (e) { pub = String(p.publicationStatus || p.status || 'published').toLowerCase(); }
        if (pub === 'published' || pub === 'active') return 'active';
        if (pub === 'draft') return 'draft';
        return 'suspended';
    }

    /* ---------- readiness: inaweza kununuliwa? (sababu zinaonyeshwa kwa draft) ---------- */
    function readiness(p) {
        var reasons = [];
        var chans = [];
        try { chans = channelsOf(p) || []; } catch (e) { chans = []; }
        if (txt2(p && p.title).length < 2) reasons.push('Jina la bidhaa halijakamilika');
        if (!(Number(p && p.price) > 0)) reasons.push('Bei halali haijawekwa');
        if (chans.indexOf('manage_only') >= 0) reasons.push('Hakuna njia ya mauzo (marketplace/POS)');
        if (chans.indexOf('marketplace') >= 0 && !txt2(p && p.category)) reasons.push('Kategoria inahitajika kwa mauzo mtandaoni');
        if ((p && p.availabilityStatus === 'hidden') || (p && p.hidden === true)) reasons.push('Bidhaa imefichwa');
        var si = stockInfo(p);
        if (si.tracked && Number(si.stock) < 0) reasons.push('Stock si halali');
        return { sellable: reasons.length === 0, reasons: reasons, channels: chans };
    }

    /* ---------- kipindi cha mauzo (KPI 6 pekee) ---------- */
    function startOfDayLocal(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function salesWindow(range) {
        var now = new Date();
        var start = startOfDayLocal(now);
        var end = new Date(now.getTime());
        var label = 'Leo';
        if (range === '7d') { start = startOfDayLocal(now); start.setDate(start.getDate() - 6); label = 'Siku 7'; }
        else if (range === '30d') { start = startOfDayLocal(now); start.setDate(start.getDate() - 29); label = 'Siku 30'; }
        else if (range === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); label = 'Mwezi huu'; }
        else if (range === 'custom' && MP_FROM && MP_TO) {
            start = new Date(MP_FROM + 'T00:00:00');
            end = new Date(MP_TO + 'T23:59:59.999');
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) { start = startOfDayLocal(now); end = new Date(now.getTime()); label = 'Leo'; range = 'today'; }
            else label = MP_FROM + ' → ' + MP_TO;
        }
        var span = Math.max(86400000, end.getTime() - start.getTime());
        return { range: range, start: start, end: end, label: label, prevStart: new Date(start.getTime() - span), prevEnd: new Date(start.getTime()) };
    }
    function inWindow(value, win) {
        if (!win) return false;
        var d = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
        if (isNaN(d.getTime())) return false;
        return d.getTime() >= win.start.getTime() && d.getTime() <= win.end.getTime();
    }

    /* ---------- mauzo: marketplace orders (halisi) ---------- */
    function unitsFromOrders(orders, win) {
        var byProduct = {}, total = 0;
        (Array.isArray(orders) ? orders : []).forEach(function (o) {
            var st = String(o && o.status || '').toLowerCase();
            if (!st || SOLD_STATUSES.indexOf(st) === -1) return;     // cancelled/pending hazijahesabiwa
            var when = o.completedAt || o.deliveredAt || o.paidAt || o.createdAt;
            if (!inWindow(when, win)) return;
            (o.items || []).forEach(function (it) {
                var pid = it && (it.productId || it.id); if (!pid) return;
                var qty = Number(it.qty != null ? it.qty : it.quantity);
                if (!Number.isFinite(qty) || qty <= 0) qty = 1;
                byProduct[pid] = (byProduct[pid] || 0) + qty;
                total += qty;
            });
        });
        return { byProduct: byProduct, units: total };
    }

    /* ---------- mauzo: POS (server, posReports) ---------- */
    function unitsFromPosReport(report) {
        var byProduct = {}, total = 0;
        var rows = (report && report.products) || {};
        Object.keys(rows).forEach(function (k) {
            var row = rows[k] || {};
            if (!row.productId) return;
            var sold = Number(row.quantitySold) || 0;
            var back = Number(row.quantityReturned) || 0;
            var voided = Number(row.quantityVoided) || 0;            // sale_voids (server)
            var net = sold - back - voided;                          // marejesho + void zimetolewa
            if (!(net > 0)) return;
            byProduct[row.productId] = (byProduct[row.productId] || 0) + net;
            total += net;
        });
        return { byProduct: byProduct, units: total };
    }

    async function callPosReport(win) {
        // [2026-11-06] legacy sellers get their canonical Business/Store once (server).
        if (typeof window.skhEnsureBusinessScope === 'function') { try { await window.skhEnsureBusinessScope(); } catch (e) { } }
        var data = skh.currentUserData || {};
        var businessId = data.businessId, storeId = data.storeId;
        if (!businessId || !storeId) return { ok: false, reason: 'Hakuna business/store kwenye akaunti hii' };
        try {
            var fn = skh.wrapCallable('posReports');
            var res = await fn({ businessId: businessId, storeId: storeId, period: { start: win.start.toISOString(), end: win.end.toISOString() } });
            var report = (res && res.data) ? res.data : res;
            if (!report || !report.products) return { ok: false, reason: 'POS report haijarudisha data' };
            return { ok: true, report: report };
        } catch (e) {
            return { ok: false, reason: String((e && (e.message || e.code)) || e) };
        }
    }

    function mergeUnits(a, b) {
        var map = {}, total = 0;
        [a, b].forEach(function (src) {
            Object.keys(src || {}).forEach(function (pid) {
                var v = Number(src[pid]) || 0;
                if (!(v > 0)) return;
                map[pid] = (map[pid] || 0) + v;
                total += v;
            });
        });
        return { byProduct: map, units: total };
    }

    async function loadSalesKpi() {
        var win = salesWindow(MP_RANGE);
        MP_SALES.loading = true;
        MP_SALES.range = MP_RANGE;
        MP_SALES.window = win;
        MP_SALES.error = null;
        renderKpiSection();
        try {
            var ordersCur = unitsFromOrders((META && META.orders) || [], win);
            var ordersPrev = unitsFromOrders((META && META.orders) || [], { start: win.prevStart, end: win.prevEnd });
            var posCur = { byProduct: {}, units: 0 }, posPrev = { byProduct: {}, units: 0 };
            var posState = 'unavailable', posReason = '';
            var cur = await callPosReport(win);
            if (cur.ok) {
                posState = 'ok';
                posCur = unitsFromPosReport(cur.report);
                var prev = await callPosReport({ start: win.prevStart, end: win.prevEnd });
                if (prev.ok) posPrev = unitsFromPosReport(prev.report);
            } else {
                posState = 'error';
                posReason = cur.reason || 'haipatikani';
            }
            var merged = mergeUnits(posCur.byProduct, ordersCur.byProduct);
            var mergedPrev = mergeUnits(posPrev.byProduct, ordersPrev.byProduct);
            MP_SALES.byProduct = merged.byProduct;
            MP_SALES.units = merged.units;
            MP_SALES.products = Object.keys(merged.byProduct).length;
            MP_SALES.sources = ['Marketplace (orders)'].concat(posState === 'ok' ? ['POS (posReports)'] : []);
            MP_SALES.posState = posState;
            MP_SALES.posReason = posReason;
            MP_SALES.prevUnits = mergedPrev.units;
            MP_SALES.prevProducts = Object.keys(mergedPrev.byProduct).length;
            /* [REVIEW F1] `merged` haina `.products` — trend ilikuwa daima -100%.
               Sasa tunahifadhi data mbichi; kadi inahesabu trend kutoka KPI iliyochujwa. */
            MP_SALES.prevByProduct = mergedPrev.byProduct;
            MP_SALES.trend = null;
        } catch (e) {
            MP_SALES.error = String((e && e.message) || e);
        } finally {
            MP_SALES.loading = false;
            renderKpiSection();
        }
    }

    /* ---------- hesabu za KPI ---------- */
    function computeKpis() {
        var rows = (META && META.rows) ? META.rows : [];
        var k = {
            total: rows.length, variants: 0,
            sellable: 0, low: 0, out: 0, untracked: 0, madeToOrder: 0,
            draft: 0, suspended: 0, active: 0,
            soldProducts: 0, soldUnits: 0, soldKnown: false,
            soldIds: {}, lowIds: {}, outIds: {}, draftIds: {}, sellableIds: {}, untrackedIds: {}
        };
        var soldMap = MP_SALES.byProduct || {};
        var soldPrevMap = MP_SALES.prevByProduct || {};
        var owned = {};
        k.soldKnown = MP_SALES.posState === 'ok' || (MP_SALES.byProduct && Object.keys(MP_SALES.byProduct).length >= 0 && !MP_SALES.loading && !MP_SALES.error);
        rows.forEach(function (r) {
            owned[r.id] = true;
            k.variants += (r.variantCount || 0);
            if (r.status === 'active') k.active++;
            if (r.status === 'draft') { k.draft++; k.draftIds[r.id] = true; }
            if (r.status === 'suspended') k.suspended++;
            if (r.sellable) { k.sellable++; k.sellableIds[r.id] = true; }
            var si = r.stockInfo || { tracked: false };
            if (!si.tracked) { k.untracked++; k.untrackedIds[r.id] = true; }
            else if (r.madeToOrder) { k.madeToOrder++; }
            /* Stock chini/imeisha zinahusu bidhaa ZINAZOUZWA (active) pekee —
               draft/suspended zinahesabiwa kwenye KPI yao; hazichanganywi hapa. */
            else if (r.status === 'active') {
                if (Number(si.available) <= 0) { k.out++; k.outIds[r.id] = true; }
                else if (Number(si.available) <= Number(r.lowStockThreshold || MP_LOW_STOCK_DEFAULT)) { k.low++; k.lowIds[r.id] = true; }
            }
        });
        /* [REVIEW F2] KPI 6 inahesabu bidhaa ZA MUUZAJI huyu pekee. POS inaweza
           kurudisha productId isiyo kwenye orodha (bidhaa iliyofutwa, duka lingine);
           ikihesabiwa, kadi inazidi orodha na kiasi kinavimba. */
        var ownedUnits = 0;
        Object.keys(soldMap).forEach(function (pid) {
            if (!owned[pid]) return;
            var v = Number(soldMap[pid]) || 0;
            if (v > 0) { k.soldIds[pid] = true; ownedUnits += v; }
        });
        k.soldProducts = Object.keys(k.soldIds).length;
        k.soldUnits = ownedUnits;
        k.soldUnitsAllSources = MP_SALES.units || 0;            // kwa uchunguzi pekee
        k.prevSoldProducts = 0;
        Object.keys(soldPrevMap).forEach(function (pid) {
            if (owned[pid] && Number(soldPrevMap[pid]) > 0) k.prevSoldProducts++;
        });
        /* MP_SALES.* zinazotumika kwenye kadi (trend + sub) zisome hizi, si raw */
        MP_SALES.ownedProducts = k.soldProducts;
        MP_SALES.ownedUnits = ownedUnits;
        return k;
    }

    var MP_LAST_KPIS = null;

    /* ---------- styles (zilizowekwa ndani ya module; prefix mpk-) ---------- */
    function ensureMpStyles() {
        if (document.getElementById('skhMpKpiStyles')) return;
        var css = ''
            + '.mp-kpi-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;}'
            + '.mp-kpi-head b{font-size:13px;color:#18352D;font-weight:900;}'
            + '.mp-kpi-head small{color:#7E9A91;font-size:11.5px;font-weight:700;}'
            + '.mp-range{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11.5px;font-weight:800;color:#526962;}'
            + '.mp-range select,.mp-range input{font-family:Inter,system-ui,sans-serif;font-size:11.5px;font-weight:800;color:#18352D;background:#fff;border:1px solid #D5E2DE;border-radius:9px;padding:5px 8px;cursor:pointer;}'
            + '.mpk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}'
            + '.mpk-card{display:flex;gap:10px;align-items:flex-start;text-align:left;width:100%;background:#fff;border:1px solid #E2EDE8;border-radius:14px;padding:12px 13px;font-family:inherit;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease;}'
            + '.mpk-card:hover{border-color:#BFE3D6;box-shadow:0 3px 10px rgba(24,169,130,.08);}'
            + '.mpk-card.is-active{border-color:#18A982;box-shadow:0 0 0 2px rgba(24,169,130,.18) inset;}'
            + '.mpk-card:focus-visible{outline:2px solid #18A982;outline-offset:2px;}'
            + '.mpk-ico{width:32px;height:32px;flex:0 0 auto;border-radius:10px;background:#EAF8F2;color:#17604E;display:inline-flex;align-items:center;justify-content:center;font-size:15px;}'
            + '.mpk-card.is-blue .mpk-ico{background:#EAF2F7;color:#2E6C86;}'
            + '.mpk-card.is-gold .mpk-ico{background:#FBF6E3;color:#8A6B16;}'
            + '.mpk-card.is-red .mpk-ico{background:#FDEFEE;color:#B33B37;}'
            + '.mpk-card.is-grey .mpk-ico{background:#F1F5F3;color:#526962;}'
            + '.mpk-body{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto;}'
            + '.mpk-label{font-size:11px;font-weight:900;color:#5B7168;text-transform:uppercase;letter-spacing:.2px;line-height:1.3;}'
            + '.mpk-value{font-size:20px;font-weight:900;color:#18352D;line-height:1.25;}'
            + '.mpk-sub{font-size:11px;font-weight:700;color:#7E9A91;line-height:1.35;}'
            + '.mpk-trend{font-size:11px;font-weight:900;}'
            + '.mpk-trend.is-up{color:#18A982;}'
            + '.mpk-trend.is-down{color:#D9534F;}'
            + '.mpk-badge{display:inline-block;font-size:10px;font-weight:900;border-radius:999px;padding:2px 7px;background:#FFF8E8;color:#8A6B16;border:1px solid #F0E3BC;}'
            + '.mpk-skel{height:86px;border-radius:14px;background:#F4F9F7;border:1px solid #EAF1EE;}'
            + '.mp-active-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#EAF8F2;border:1px solid #CDEBDD;border-radius:10px;padding:7px 10px;font-size:12px;font-weight:800;color:#17604E;margin-bottom:10px;}'
            + '.mp-active-filter button{background:#fff;border:1px solid #BFE3D6;color:#17604E;border-radius:8px;padding:3px 9px;font-size:11.5px;font-weight:900;cursor:pointer;font-family:inherit;}'
            + '.mp-more{display:block;width:100%;margin-top:10px;padding:10px;border-radius:12px;border:1px dashed #BFE3D6;background:#F7FBFA;color:#17604E;font-weight:900;font-size:12.5px;cursor:pointer;font-family:inherit;}'
            + '.mp-clear{background:#fff;border:1px solid #D5E2DE;color:#526962;border-radius:10px;padding:9px 11px;font-size:12px;font-weight:900;cursor:pointer;font-family:inherit;}'
            + '@media (max-width:900px){.mpk-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}'
            + '@media (max-width:480px){.mpk-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}.mpk-card{padding:10px;gap:8px;}.mpk-value{font-size:17px;}.mpk-label{font-size:10px;}.mpk-sub{font-size:10px;}}'
            + '@media (max-width:340px){.mpk-grid{grid-template-columns:1fr;}}';
        var style = document.createElement('style');
        style.id = 'skhMpKpiStyles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- KPI cards ---------- */
    function kpiCardsHtml() {
        if (!META) {
            return Array.from({ length: 6 }).map(function () { return '<div class="mpk-skel"></div>'; }).join('');
        }
        var k = computeKpis();
        MP_LAST_KPIS = k;
        var defs = [
            { id: 'total', icon: 'package', tone: '', label: T('mpk_total', 'Jumla ya Bidhaa'), value: k.total, sub: T('mpk_total_sub', 'Snapshot ya sasa · bidhaa {n} · variants {v}', { n: k.total, v: k.variants }) },
            { id: 'sellable', icon: 'check', tone: 'is-blue', label: T('mpk_sellable', 'Bidhaa Zinazouzwa'), value: k.sellable, sub: T('mpk_sellable_sub', 'Zimechapishwa · uchapishaji hauhakikishi stoo (stoo inaonekana kando)') },
            { id: 'low', icon: 'alert', tone: 'is-gold', label: T('mpk_low', 'Stock Iko Chini'), value: k.low, sub: T('mpk_low_sub', 'Stoo 0 < x ≤ kiwango cha tahadhari') },
            { id: 'out', icon: 'archive', tone: 'is-red', label: T('mpk_out', 'Stock Imeisha'), value: k.out, sub: T('mpk_out_sub', 'Stoo inayopatikana = 0 · bila tracking {n}', { n: k.untracked }) },
            { id: 'draft', icon: 'edit', tone: 'is-grey', label: T('mpk_draft', 'Bidhaa za Rasimu'), value: k.draft, sub: T('mpk_draft_sub', 'Hazijachapishwa · zinasimamishwa {n}', { n: k.suspended }) },
            { id: 'sold', icon: 'bolt', tone: 'is-blue', label: T('mpk_sold', 'Mauzo ya Bidhaa Zangu'), value: MP_SALES.loading ? '…' : k.soldProducts, sub: soldSub(), trend: soldTrend(k) }
        ];
        return defs.map(function (d) {
            var active = MP_KPI === d.id;
            var trend = '';
            /* [REVIEW F1] trend inaonekana TU pale denominator ni halali (>0) */
            if (d.trend && Number(d.trend.previous) > 0) {
                var cur = Number(d.trend.current) || 0, prev = Number(d.trend.previous) || 0;
                var diff = prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
                var up = diff >= 0;
                trend = '<span class="mpk-trend ' + (up ? 'is-up' : 'is-down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(diff).toFixed(0) + '% ' + esc(T('mpk_vs_prev', 'dhidi ya kipindi kilichopita')) + '</span>';
            }
            return '<button type="button" class="mpk-card ' + d.tone + (active ? ' is-active' : '') + '" data-mp-kpi="' + d.id + '" aria-pressed="' + (active ? 'true' : 'false') + '" onclick="window.skhMPKpiFilter(\'' + d.id + '\')">'
                + '<span class="mpk-ico" aria-hidden="true">' + (window.skhNavIcon ? window.skhNavIcon(d.icon, 17) : '') + '</span>'
                + '<span class="mpk-body">'
                + '<span class="mpk-label">' + esc(d.label) + '</span>'
                + '<b class="mpk-value">' + (typeof d.value === 'number' ? d.value.toLocaleString() : d.value) + '</b>'
                + '<span class="mpk-sub">' + esc(d.sub) + '</span>'
                + trend
                + '</span></button>';
        }).join('');
    }

    /* [REVIEW F1] trend = bidhaa zilizouza (zilizochujwa) dhidi ya kipindi kilichopita */
    function soldTrend(k) {
        if (MP_SALES.posState !== 'ok' || !MP_SALES.prevByProduct) return null;
        return { current: Number(k && k.soldProducts) || 0, previous: Number(k && k.prevSoldProducts) || 0 };
    }

    function soldSub() {
        if (MP_SALES.loading) return T('mpk_sold_loading', 'Inahesabu mauzo…');
        if (MP_SALES.error) return T('mpk_sold_err', 'Haipatikani: {r}', { r: MP_SALES.error });
        var units = (MP_SALES.ownedUnits != null ? MP_SALES.ownedUnits : (MP_SALES.units || 0));
        var parts = [T('mpk_sold_sub', 'Bidhaa zilizouza angalau 1 · jumla ya kiasi {u}', { u: units.toLocaleString() })];
        parts.push(MP_SALES.window ? MP_SALES.window.label : '');
        if (MP_SALES.posState !== 'ok') parts.push(T('mpk_pos_partial', 'POS haipatikani — marketplace pekee'));
        return parts.filter(Boolean).join(' · ');
    }

    function kpiRangeControlHtml() {
        var opts = [['today', 'Leo'], ['7d', 'Siku 7'], ['30d', 'Siku 30'], ['month', 'Mwezi huu'], ['custom', 'Kipindi maalum']];
        var sel = '<select aria-label="' + esc(T('mpk_range_aria', 'Kipindi cha mauzo')) + '" onchange="window.skhMPSalesRange(this.value)">'
            + opts.map(function (o) { return '<option value="' + o[0] + '"' + (MP_RANGE === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('')
            + '</select>';
        var custom = MP_RANGE === 'custom'
            ? '<input type="date" value="' + esc(MP_FROM) + '" aria-label="Kuanzia" onchange="window.skhMPSalesCustom(this.value, null)">'
              + '<input type="date" value="' + esc(MP_TO) + '" aria-label="Hadi" onchange="window.skhMPSalesCustom(null, this.value)">'
            : '';
        return '<span class="mp-range"><span>' + esc(T('mpk_range_label', 'Kipindi cha mauzo:')) + '</span>' + sel + custom + '</span>';
    }

    function renderKpiSection() {
        var host = document.getElementById('mpKpiGrid');
        if (!host) return;
        host.innerHTML = kpiCardsHtml();
        var rangeHost = document.getElementById('mpKpiRange');
        if (rangeHost) rangeHost.innerHTML = kpiRangeControlHtml();
        var info = document.getElementById('mpResultInfo');
        if (info && META) info.innerHTML = resultInfoHtml();
    }

    /* ---------- filters ---------- */
    function kpiLabel(id) {
        return {
            total: T('mpk_total', 'Jumla ya Bidhaa'),
            sellable: T('mpk_sellable', 'Bidhaa Zinazouzwa'),
            low: T('mpk_low', 'Stock Iko Chini'),
            out: T('mpk_out', 'Stock Imeisha'),
            draft: T('mpk_draft', 'Bidhaa za Draft'),
            sold: T('mpk_sold', 'Mauzo ya Bidhaa Zangu')
        }[id] || id;
    }

    window.skhMPKpiFilter = function (kpi) {
        MP_KPI = (MP_KPI === kpi) ? 'all' : (kpi || 'all');   // bonyeza tena = ondoa
        MP_LIMIT = MP_PAGE_SIZE;
        renderKpiSection();
        window.skhMPRenderTable();
    };

    window.skhMPFilter = function (k, v) {
        if (k === 'q') MP_Q = v;
        else if (k === 'cat') MP_CAT = v;
        else if (k === 'stock') MP_STOCK = v;
        else if (k === 'status') MP_STATUS = v;
        else if (k === 'sort') MP_SORT = v;
        MP_LIMIT = MP_PAGE_SIZE;
        window.skhMPRenderTable();
    };

    window.skhMPClearAll = function () {
        MP_Q = ''; MP_CAT = ''; MP_STOCK = ''; MP_STATUS = ''; MP_SORT = 'newest'; MP_KPI = 'all';
        MP_LIMIT = MP_PAGE_SIZE;
        var q = document.getElementById('mpSearch'); if (q) q.value = '';
        ['mpCat', 'mpStock', 'mpStatus', 'mpSort'].forEach(function (id) {
            var el = document.getElementById(id); if (!el) return;
            el.value = id === 'mpSort' ? 'newest' : '';
        });
        renderKpiSection();
        window.skhMPRenderTable();
    };

    window.skhMPMore = function () {
        MP_LIMIT += MP_PAGE_SIZE;
        window.skhMPRenderTable();
    };

    window.skhMPSalesRange = function (range) {
        MP_RANGE = range || '7d';
        MP_LIMIT = MP_PAGE_SIZE;
        renderKpiSection();
        loadSalesKpi();
        window.skhMPRenderTable();
    };

    window.skhMPSalesCustom = function (from, to) {
        if (from !== null && from !== undefined) MP_FROM = from;
        if (to !== null && to !== undefined) MP_TO = to;
        if (!MP_FROM || !MP_TO) return;
        MP_RANGE = 'custom';
        renderKpiSection();
        loadSalesKpi();
        window.skhMPRenderTable();
    };

    function statusLabel(s) {
        return s === 'active' ? T('smp_active', 'Inatumika') : (s === 'draft' ? T('mpk_st_draft', 'Rasimu') : T('mpk_suspended', 'Imesimamishwa'));
    }

    /* ---------- 1. MY PRODUCTS ---------- */
    window.skhRenderMyProducts = async function () {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ensureMpStyles();
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">' + T('smp_loading_products', 'Loading your products...') + '</p>';
        await loadSellerMetrics();
        if (!META) {
            ws.innerHTML = '<div style="background:#fff;border:1px solid #F2D7D5;border-radius:14px;padding:22px;text-align:center;color:#18352D;">'
                + '<b style="display:block;font-size:14px;">' + esc(T('mpk_err_title', 'Bidhaa hazikuweza kupakiwa')) + '</b>'
                + '<p style="font-size:12.5px;color:#7E9A91;margin:6px 0 12px;">' + esc(T('mpk_err_sub', 'Hakuna namba zinazoonyeshwa. Jaribu tena.')) + '</p>'
                + '<button onclick="window.skhRenderMyProducts()" style="background:#18A982;color:#fff;border:none;border-radius:10px;padding:9px 16px;font-weight:900;cursor:pointer;">' + esc(T('mpk_retry', 'Jaribu tena')) + '</button></div>';
            return;
        }
        var rows = META.rows;
        var cats = {};
        rows.forEach(function (r) { if (r.category && r.category !== 'N/A') cats[r.category] = true; });
        var catKeys = Object.keys(cats).sort();

        ws.innerHTML = `
        <div style="text-align:left; animation: fadeIn 0.3s ease;">${(window.skhPublishOutbox && window.skhPublishOutbox.html) ? window.skhPublishOutbox.html() : ''} <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;"> <div> <h2 style="margin:0;font-size:19px;color:#0f172a;font-weight:800;">${T('smp_my_products', 'My Products')}</h2> <p style="margin:3px 0 0;color:#64748b;font-size:12px;">${T('smp_products_sub', 'All products you listed on SokoHai — total: {n}', { n: rows.length })}</p> </div> </div>

        <!-- KPI 6 -->
        <div style="background:#fff;border:1px solid #E2EDE8;border-radius:16px;padding:12px;margin-bottom:14px;">
            <div class="mp-kpi-head"><span><b>${esc(T('mpk_section', 'Vipimo vya Bidhaa'))}</b> <small>${esc(T('mpk_section_sub', '· snapshot ya sasa; mauzo kwa kipindi kilichochaguliwa'))}</small></span><span id="mpKpiRange">${kpiRangeControlHtml()}</span></div>
            <div class="mpk-grid" id="mpKpiGrid">${kpiCardsHtml()}</div>
            <p style="margin:9px 0 0;font-size:11px;color:#94a3b8;line-height:1.5;">${esc(T('mpk_footnote', 'Vyanzo: products (stock, variantCombinations, reservedStock, lowStockAlert) · orders (mauzo ya marketplace) · posReports (mauzo ya POS, server). Kiwango cha tahadhari: lowStockAlert ya bidhaa, la sivyo default {d}. Stock chini/imeisha zinahusu bidhaa zinazouzwa (active) pekee.', { d: MP_LOW_STOCK_DEFAULT }))}</p>
        </div>

        <!-- filters -->
        <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:14px;"> <input id="mpSearch" value="${esc(MP_Q)}" oninput="window.skhMPFilter('q', this.value)" placeholder="${esc(T('smp_search_ph2', 'Tafuta jina, SKU au barcode...'))}" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;margin-bottom:8px;outline:none;"> <div style="display:flex;gap:6px;flex-wrap:wrap;"> <select id="mpCat" onchange="window.skhMPFilter('cat', this.value)" style="flex:1;min-width:120px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="">${T('smp_all_categories', 'All categories')}</option>
                        ${catKeys.map(function (c) { return '<option value="' + esc(c) + '"' + (MP_CAT === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('')}
                    </select> <select id="mpStatus" onchange="window.skhMPFilter('status', this.value)" style="flex:1;min-width:110px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="">${T('smp_all_status', 'Hali zote')}</option> <option value="active"${MP_STATUS === 'active' ? ' selected' : ''}>${T('mpk_st_active', 'Inatumika (Active)')}</option><option value="draft"${MP_STATUS === 'draft' ? ' selected' : ''}>${T('mpk_st_draft', 'Rasimu')}</option><option value="suspended"${MP_STATUS === 'suspended' ? ' selected' : ''}>${T('mpk_st_suspended', 'Imesimamishwa')}</option> </select> <select id="mpStock" onchange="window.skhMPFilter('stock', this.value)" style="flex:1;min-width:110px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="">${T('smp_all_stock', 'Stoo yote')}</option> <option value="in"${MP_STOCK === 'in' ? ' selected' : ''}>${T('eng_in_stock', 'In stock')}</option> <option value="low"${MP_STOCK === 'low' ? ' selected' : ''}>${T('mpk_stock_low', 'Stoo chini')}</option> <option value="out"${MP_STOCK === 'out' ? ' selected' : ''}>${T('eng_out_stock', 'Out of stock')}</option> <option value="untracked"${MP_STOCK === 'untracked' ? ' selected' : ''}>${T('mpk_stock_untracked', 'Bila stock tracking')}</option> </select> <select id="mpSort" onchange="window.skhMPFilter('sort', this.value)" style="flex:1;min-width:120px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="newest"${MP_SORT === 'newest' ? ' selected' : ''}>${T('smp_newest', 'Newest')}</option> <option value="oldest"${MP_SORT === 'oldest' ? ' selected' : ''}>${T('mpk_sort_oldest', 'Ya zamani zaidi')}</option> <option value="name"${MP_SORT === 'name' ? ' selected' : ''}>${T('mpk_sort_name', 'Jina (A–Z)')}</option> <option value="stock"${MP_SORT === 'stock' ? ' selected' : ''}>${T('mpk_sort_stock', 'Kiasi cha Stoo')}</option> <option value="best"${MP_SORT === 'best' ? ' selected' : ''}>${T('smp_best', 'Best selling')}</option> <option value="lowest"${MP_SORT === 'lowest' ? ' selected' : ''}>${T('smp_lowest', 'Slow selling')}</option> <option value="highest"${MP_SORT === 'highest' ? ' selected' : ''}>${T('smp_highest', 'Highest revenue')}</option> </select> <button type="button" class="mp-clear" onclick="window.skhMPClearAll()">${T('mpk_clear', 'Ondoa filters zote')}</button> </div> </div>
        <div id="mpResultInfo">${resultInfoHtml()}</div>
        <div id="mpTableWrap"></div> </div>`;
        window.skhMPRenderTable();
        loadSalesKpi();
    };

    function resultInfoHtml() {
        if (!META) return '';
        var rows = filteredRows();
        var parts = [];
        if (MP_KPI !== 'all') {
            parts.push('<div class="mp-active-filter" role="status"><span>' + esc(T('mpk_filter_active', 'Filter:')) + ' <b>' + esc(kpiLabel(MP_KPI)) + '</b> · ' + esc(T('mpk_results', '{n} matokeo', { n: rows.length })) + '</span>'
                + '<button type="button" onclick="window.skhMPKpiFilter(\'' + MP_KPI + '\')">' + esc(T('mpk_remove_filter', 'Ondoa filter')) + '</button></div>');
        } else {
            parts.push('<div style="font-size:11.5px;color:#7E9A91;font-weight:800;margin:0 0 8px;">' + esc(T('mpk_all_results', 'Bidhaa {n}', { n: rows.length })) + '</div>');
        }
        return parts.join('');
    }

    window.skhMPRenderTable = function () {
        var wrap = document.getElementById('mpTableWrap');
        if (!wrap || !META) return;
        var rows = filteredRows();
        if (!rows.length) {
            wrap.innerHTML = (MP_KPI !== 'all' || MP_Q || MP_CAT || MP_STOCK || MP_STATUS)
                ? '<div style="text-align:center;padding:30px;color:#64748b;">'
                  + '<p style="font-size:13px;margin:0 0 10px;">' + esc(T('smp_no_match', 'Hakuna bidhaa inayolingana na kigezo hiki.')) + '</p>'
                  + '<button type="button" class="mp-clear" onclick="window.skhMPClearAll()">' + esc(T('mpk_clear', 'Ondoa filters zote')) + '</button></div>'
                : empty(T('smp_no_products', 'Hakuna bidhaa bado.'));
            renderKpiSection();
            return;
        }
        var shown = rows.slice(0, MP_LIMIT);
        var rest = rows.length - shown.length;
        wrap.innerHTML = shown.map(productCardHtml).join('')
            + (rest > 0 ? '<button type="button" class="mp-more" onclick="window.skhMPMore()">' + esc(T('mpk_more', 'Onyesha bidhaa zaidi ({n} zimebaki)', { n: rest })) + '</button>' : '');
        renderKpiSection();
    };

    function stockText(r) {
        var si = r.stockInfo || { tracked: false };
        var unit = r.unitLabel || 'pcs';
        if (!si.tracked) return { text: T('mpk_no_tracking', 'Bila stock tracking'), color: '#526962', sub: '' };
        var avail = Number(si.available) || 0;
        var shown = fmtQty(avail, r.unitPrecision) + ' ' + unit;
        var color = avail <= 0 ? '#B33B37' : (avail <= Number(r.lowStockThreshold || MP_LOW_STOCK_DEFAULT) ? '#8A6B16' : '#17604E');
        var sub = r.variantCount ? T('mpk_variants_n', 'variants {n}', { n: r.variantCount }) : '';
        return { text: shown, color: color, sub: sub };
    }

    function productCardHtml(r) {
        var img = r.image ? esc(r.image) : '';
        var st = stockText(r);
        var statusText = statusLabel(r.status);
        var statusColor = r.status === 'active' ? '#16a34a' : (r.status === 'draft' ? '#8A6B16' : '#B33B37');
        var reasons = (r.readinessReasons && r.readinessReasons.length && r.status === 'draft')
            ? '<div style="font-size:11px;color:#8A6B16;margin-top:4px;">' + esc(T('mpk_draft_reason', 'Sababu:')) + ' ' + esc(r.readinessReasons.join(' · ')) + '</div>' : '';
        var skuLine = (r.sku || r.barcode)
            ? '<div style="font-size:11px;color:#94a3b8;margin:2px 0;">' + (r.sku ? 'SKU: ' + esc(r.sku) : '') + (r.sku && r.barcode ? ' · ' : '') + (r.barcode ? 'Barcode: ' + esc(r.barcode) : '') + '</div>' : '';
        return `
            <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;" data-mp-product="${esc(r.id)}"> <div style="display:flex;gap:10px;align-items:flex-start;"> <div style="width:56px;height:56px;flex:0 0 56px;aspect-ratio:1/1;border-radius:10px;background:#F1F5F3;display:flex;align-items:center;justify-content:center;overflow:hidden;">${img ? '<img src="' + img + '" onerror="this.style.display=\'none\'" style="width:100%;height:100%;object-fit:contain;display:block;">' : '<span style="font-size:11px;font-weight:900;color:#8FA69D;">—</span>'}</div> <div style="flex:1;min-width:0;"> <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"> <b style="font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.title)}</b> <span style="font-size:13px;font-weight:900;color:var(--terracotta);white-space:nowrap;">${tzs(r.price)}</span> </div>
                        ${skuLine}
                        <div style="font-size:12px;color:#64748b;margin:3px 0;">${esc(r.category)} · ${esc(r.unitLabel || 'pcs')}</div>
                        <div style="font-size:12px;color:#64748b;margin:3px 0;">${T('mpk_available', 'Inapatikana')}: <b style="color:${st.color};">${esc(st.text)}</b>${st.sub ? ' <span style="color:#94a3b8;">(' + esc(st.sub) + ')</span>' : ''} · <span style="color:${statusColor};font-weight:800;">${esc(statusText)}</span></div>
                        ${reasons}
                        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">
                            ${statPill(T('pm_views', 'Views'), r.views.toLocaleString())}
                            ${statPill(T('smp_likes', 'Likes'), r.likes.toLocaleString())}
                            ${statPill(T('smp_saves', 'Saves'), r.saves.toLocaleString())}
                            ${statPill(T('smp_orders', 'Orders'), r.orders.toLocaleString())}
                            ${statPill(T('smp_sold', 'Sold'), r.units.toLocaleString())}
                            ${statPill(T('smp_revenue', 'Revenue'), tzs(r.revenue), '#16a34a')}
                        </div>
                        ${modeMetricsLine(r)}
                        <div style="font-size:12.5px;color:#94a3b8;margin-top:5px;">
                            ${T('smp_added_on', 'Added on')} ${esc(new Date(r.createdAt).toLocaleDateString(window.SokoHaiLMS && window.SokoHaiLMS.lang === 'en' ? 'en-GB' : 'sw-TZ'))}${r.updatedAt && r.updatedAt !== r.createdAt ? ' · ' + T('smp_updated_on', 'Updated on') + ' ' + esc(new Date(r.updatedAt).toLocaleDateString(window.SokoHaiLMS && window.SokoHaiLMS.lang === 'en' ? 'en-GB' : 'sw-TZ')) : ''}
                        </div> <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;"> <button onclick="openProduct('${js(r.id)}','products')" style="padding:8px 12px;background:#e2e8f0;color:#0f172a;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${T('smp_view_btn', 'View')}</button> <button onclick="window.openEditModal('${js(r.id)}','products')" style="padding:8px 12px;background:#e0f2fe;color:#03509d;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${T('smp_edit_btn', 'Edit')}</button> <button onclick="window.skhDuplicateProduct('${js(r.id)}')" title="Nakili mipangilio (bila SKU, stock, picha na variants)" style="padding:8px 12px;background:#EAF8F2;color:#0f6e55;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">Nakili</button> <button onclick="window.skhMPStock('${js(r.id)}', ${Number(r.stock) || 0})" style="padding:8px 12px;background:#fef3c7;color:#92400e;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${T('smp_stock_btn', 'Stock')}</button> <button onclick="window.skhSetProductPublication('${js(r.id)}','${r.status === 'active' ? 'draft' : 'published'}')" style="padding:8px 12px;background:#ecfdf5;color:#047857;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${r.status === 'active' ? T('mpk_suspend', 'Simamisha') : T('mpk_publish', 'Chapisha')}</button> <button onclick="window.skhSetProductPublication('${js(r.id)}','archived')" style="padding:8px 12px;background:#fee2e2;color:#b91c1c;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">Archive</button> <button onclick="window.skhRenderProductPerformance('${js(r.id)}')" style="padding:8px 12px;background:#f3e8ff;color:#6b21a8;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${T('smp_perf_btn', 'Utendaji')}</button> </div> </div> </div> </div>`;
    }

    window.skhSetProductPublication = async function (id, state) {
        if (!['draft','published','archived'].includes(state)) return;
        var msg = state === 'archived' ? 'Archive bidhaa hii? Rekodi na historia zake hazitafutwa.' : (state === 'draft' ? 'Unpublish bidhaa hii?' : 'Publish bidhaa hii?');
        if (!await skhConfirm(msg)) return;
        try {
            var patch = { publicationStatus: state, status: state === 'published' ? 'active' : state, updatedAt: new Date().toISOString() };
            if (state === 'archived') patch.archivedAt = new Date().toISOString();
            await skh.updateDoc(skh.doc(skh.db, 'products', id), patch);
            if (skh._feedCache) skh._feedCache.clear();
            await window.skhRenderMyProducts();
        } catch (e) { alert('Imeshindwa kubadili hali: ' + (e && e.message)); }
    };

    window.skhMPStock = async function (id, current) {
        var v = await skhPrompt(T('smp_stock_prompt', 'Enter new stock amount (current: {n}):', { n: current }), String(current || 0));
        if (v === null) return;
        var n = Number(v);
        if (isNaN(n) || n < 0) { alert(T('smp_stock_invalid', 'Please enter a valid number (0 or more).')); return; }
        try {
            var delta = n - Number(current || 0);
            if (delta !== 0) {
                await skh.wrapCallable('inventoryAdjust')({
                    productId: id,
                    delta: delta,
                    movementType: 'ADJUSTMENT',
                    source: 'SELLER_STOCK_EDIT',
                    reason: 'Seller manual stock adjustment',
                    idempotencyKey: 'seller-adjust-' + id + '-' + Date.now(),
                    businessId: skh.currentUserData?.businessId || undefined,
                    storeId: skh.currentUserData?.storeId || undefined
                });
            }
            alert(T('smp_stock_updated', 'Stock updated to {n}.', { n: n }));
            window.skhRenderMyProducts();
        } catch (e) { alert(T('smp_stock_failed', 'Failed to update stock:') + ' ' + (e && e.message)); }
    };

    /* API kwa tests (read-only) */
    window.skhMpKpi = {
        state: function () { return { kpi: MP_KPI, range: MP_RANGE, from: MP_FROM, to: MP_TO, limit: MP_LIMIT, q: MP_Q, cat: MP_CAT, stock: MP_STOCK, status: MP_STATUS, sort: MP_SORT }; },
        kpis: function () { return computeKpis(); },
        sales: function () { return MP_SALES; },
        meta: function () { return META; },
        rows: function () { return filteredRows(); },
        stockInfo: stockInfo, readiness: readiness, statusOf: statusOf, salesWindow: salesWindow,
        lowStockDefault: MP_LOW_STOCK_DEFAULT,
        setRange: function (r) { return window.skhMPSalesRange(r); },
        filter: function (kpi) { return window.skhMPKpiFilter(kpi); },
        clear: function () { return window.skhMPClearAll(); }
    };

    // ---------- 2. PRODUCT PERFORMANCE (per product) ----------
    /* [PERF 2026-11-03] Mwonekano wa awali wa bidhaa moja umehifadhiwa kama
       `skhRenderProductPerformanceLegacy` — hakuna function iliyoondolewa. */
    window.skhRenderProductPerformanceLegacy = async function (pid) {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        if (!META) { ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">' + T('my_loading', 'Loading...') + '</p>'; await loadSellerMetrics(); }
        var r = META.rows.find(function (x) { return x.id === pid; });
        if (!r) { ws.innerHTML = empty(T('smp_not_found', 'Product not found in your list.')); return; }

        var convTxt = r.conversion.toFixed(2) + '%';
        var likeToSale = r.likes > 0 && r.units > 0 ? (r.units / r.likes * 100).toFixed(1) + '%' : (r.units > 0 ? '—' : '0%');
        ws.innerHTML = `
        <div style="text-align:left; animation: fadeIn 0.3s ease;"> <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;"> <button onclick="window.skhRenderMyProducts()" style="background:#e2e8f0;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">← ${T('smp_my_products', 'My Products')}</button> <h2 style="margin:0;font-size:18px;color:#0f172a;">${T('smp_perf_btn', 'Performance')}: ${esc(r.title)}</h2> </div> <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;">
                ${statPill(T('pm_views', 'Views'), r.views.toLocaleString())}
                ${statPill(T('smp_likes', 'Likes'), r.likes.toLocaleString())}
                ${statPill(T('smp_saves', 'Saves'), r.saves.toLocaleString())}
                ${statPill(T('smp_orders', 'Orders'), r.orders.toLocaleString())}
                ${statPill(T('smp_units_sold', 'Units sold'), r.units.toLocaleString())}
                ${statPill(T('smp_revenue', 'Revenue'), tzs(r.revenue), '#16a34a')}
                ${statPill(T('smp_conversion', 'Conversion'), convTxt, '#7c3aed')}
            </div> <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;"> <b style="font-size:12px;color:#0f172a;display:block;margin-bottom:8px;">${T('smp_explanation', 'Explanation')}</b> <div style="font-size:12px;color:#334155;line-height:1.8;"> <div>${T('smp_conv_line', 'Conversion (views -> purchases):')} <b>${convTxt}</b></div> <div>${T('smp_like_sale_line', 'Likes to sales rate (likes -> sold):')} <b>${likeToSale}</b></div> <div style="margin-top:6px;color:#64748b;">${T('smp_interest_note', 'Interest (likes/saves) and purchases (orders/sold) are different — many likes do not mean more sales.')}</div> </div> </div> </div>`;
    };

    // ---------- 6. PRODUCT PERFORMANCE [2026-11-03] ----------
    /* Dashboard ya utendaji wa bidhaa — inachukua nafasi ya alert+redirect.
       Nyongeza pekee: hakuna function/ID/route iliyoondolewa. Mwonekano wa zamani
       wa bidhaa moja umehifadhiwa kama `skhRenderProductPerformanceLegacy`.
       Vyanzo: products (+variants/stock) · orders (marketplace) · posReports (server).
       Hakuna collection mpya, hakuna cost/profit/conversion ya kubuni. */
    var PF_NEW_DAYS = 14;                  // bidhaa mpya: siku 14 za mwisho
    var PF_HIGH_RETURN = 0.10;             // returns >= 10% (na units >= 2) = F
    var PF_SCORE_W = { demand: 40, growth: 25, stock: 15, returns: 10, listing: 10 };
    var PF = {
        range: '30d', from: '', to: '',
        sort: 'score', q: '', label: '', cat: '', stock: '', pub: '', kpi: 'all',
        open: {}, showHow: false, loading: false, error: null, data: null
    };
    var PF_LABELS = {
        A: { code: 'A', name: 'Anaongoza', tone: 'ok' },
        B: { code: 'B', name: 'Inakua', tone: 'ok' },
        C: { code: 'C', name: 'Inashuka', tone: 'warn' },
        D: { code: 'D', name: 'Polepole', tone: 'muted' },
        E: { code: 'E', name: 'Hakuna mauzo', tone: 'warn' },
        F: { code: 'F', name: 'Marejesho makubwa', tone: 'bad' },
        G: { code: 'G', name: 'Stock imeisha', tone: 'bad' },
        N: { code: 'N', name: 'Mpya', tone: 'info' }
    };
    var PF_KPIS = [
        { id: 'top', label: 'Wanaongoza', icon: 'trophy', hint: 'Units ≥ 50% ya kiongozi' },
        { id: 'growing', label: 'Wanakua', icon: 'trending-up', hint: 'Units +30% au zaidi' },
        { id: 'declining', label: 'Wanashuka', icon: 'trending-down', hint: 'Units −30% au zaidi' },
        { id: 'no_sales', label: 'Hakuna mauzo + stock', icon: 'package', hint: 'Stock ipo, mauzo 0 (si bidhaa mpya)' },
        { id: 'returns', label: 'Marejesho makubwa', icon: 'rotate', hint: 'Marejesho ≥ 10% ya units' },
        { id: 'action', label: 'Wanahitaji hatua', icon: 'alert', hint: 'Stock imeisha, returns, kushuka, taarifa pungufu' }
    ];

    function pfWindow(range) {
        var now = new Date();
        var start = startOfDayLocal(now), end = new Date(now.getTime()), label = 'Leo';
        if (range === '7d') { start = startOfDayLocal(now); start.setDate(start.getDate() - 6); label = 'Siku 7'; }
        else if (range === '30d') { start = startOfDayLocal(now); start.setDate(start.getDate() - 29); label = 'Siku 30'; }
        else if (range === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); label = 'Mwezi huu'; }
        else if (range === '3m') { start = startOfDayLocal(now); start.setDate(start.getDate() - 89); label = 'Miezi 3'; }
        else if (range === 'custom') {
            if (!PF.from || !PF.to) { range = '30d'; start = startOfDayLocal(now); start.setDate(start.getDate() - 29); label = 'Siku 30'; }
            else {
                start = new Date(PF.from + 'T00:00:00');
                end = new Date(PF.to + 'T23:59:59.999');
                if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) { range = '30d'; start = startOfDayLocal(now); start.setDate(start.getDate() - 29); label = 'Siku 30'; }
                else label = PF.from + ' → ' + PF.to;
            }
        }
        var span = Math.max(86400000, end.getTime() - start.getTime());
        return { range: range, start: start, end: end, label: label, prevStart: new Date(start.getTime() - span), prevEnd: new Date(start.getTime()), days: Math.round(span / 86400000) };
    }

    /* marketplace orders → kwa bidhaa (units, oda, mapato, mauzo ya mwisho) */
    function pfOrderAgg(win) {
        var by = {};
        (META && META.orders ? META.orders : []).forEach(function (o) {
            var st = String(o && o.status || '').toLowerCase();
            if (!st || SOLD_STATUSES.indexOf(st) === -1) return;
            var when = o.completedAt || o.deliveredAt || o.paidAt || o.createdAt;
            if (!inWindow(when, win)) return;
            var d = when && typeof when.toDate === 'function' ? when.toDate() : new Date(when);
            (o.items || []).forEach(function (it) {
                var pid = it && (it.productId || it.id); if (!pid) return;
                var qty = Number(it.qty != null ? it.qty : it.quantity);
                if (!Number.isFinite(qty) || qty <= 0) qty = 1;
                var price = Number(it.price);
                if (!Number.isFinite(price) || price <= 0) price = 0;
                if (!by[pid]) by[pid] = { units: 0, orders: 0, revenue: 0, last: null };
                by[pid].units += qty;
                by[pid].orders += 1;
                by[pid].revenue += price * qty;
                if (!isNaN(d.getTime()) && (!by[pid].last || d > by[pid].last)) by[pid].last = d;
            });
        });
        return by;
    }

    /* posReports → kwa bidhaa (net units, gross, returns) */
    function pfPosAgg(report) {
        var by = {};
        var rows = (report && report.products) || {};
        Object.keys(rows).forEach(function (k) {
            var row = rows[k] || {};
            var pid = row.productId; if (!pid) return;
            var sold = Number(row.quantitySold) || 0;
            var ret = Number(row.quantityReturned) || 0;
            var voided = Number(row.quantityVoided) || 0;
            var net = sold - ret - voided;
            if (!by[pid]) by[pid] = { soldUnits: 0, returnedUnits: 0, voidedUnits: 0, net: 0, gross: 0, returnsValue: 0 };
            by[pid].soldUnits += sold;
            by[pid].returnedUnits += ret;
            by[pid].voidedUnits += voided;
            by[pid].net += Math.max(0, net);
            by[pid].gross += Number(row.grossSales) || 0;
            by[pid].returnsValue += Number(row.returnsValue) || 0;
        });
        return by;
    }

    function pfIsNew(row) {
        var c = row.createdAt && typeof row.createdAt.toDate === 'function' ? row.createdAt.toDate() : new Date(row.createdAt);
        if (!c || isNaN(c.getTime())) return { known: false, isNew: false, ageDays: null };
        var days = Math.floor((Date.now() - c.getTime()) / 86400000);
        return { known: true, isNew: days >= 0 && days < PF_NEW_DAYS, ageDays: days };
    }

    function pfClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    async function pfLoad() {
        PF.loading = true; PF.error = null;
        pfRenderShellLoading();
        try {
            if (!META) await loadSellerMetrics();
            var win = pfWindow(PF.range);
            var cur = pfOrderAgg(win);
            var prev = pfOrderAgg({ start: win.prevStart, end: win.prevEnd });
            var posState = 'unavailable', posReason = '', pos = {}, posPrev = {};
            var res = await callPosReport(win);
            if (res.ok) {
                posState = 'ok';
                pos = pfPosAgg(res.report);
                var resPrev = await callPosReport({ start: win.prevStart, end: win.prevEnd });
                if (resPrev.ok) posPrev = pfPosAgg(resPrev.report);
            } else {
                posState = 'error';
                posReason = res.reason || 'haipatikani';
            }

            var rows = (META && META.rows) ? META.rows.slice() : [];
            var recs = rows.map(function (r) {
                var si = r.stockInfo || { tracked: false, available: null, stock: null, reserved: null };
                var o = cur[r.id] || { units: 0, orders: 0, revenue: 0, last: null };
                var op = prev[r.id] || { units: 0, orders: 0, revenue: 0 };
                var p = pos[r.id] || null;
                var pp = posPrev[r.id] || null;
                var units = o.units + (p ? p.net : 0);
                var prevUnits = op.units + (pp ? pp.net : 0);
                var revenue = o.revenue + (p ? p.gross : 0);
                var prevRevenue = op.revenue + (pp ? pp.gross : 0);
                var returnedUnits = p ? p.returnedUnits : 0;
                var grossUnits = p ? (p.net + p.returnedUnits + p.voidedUnits) : 0;
                var returnRate = (posState === 'ok' && grossUnits > 0) ? returnedUnits / grossUnits : null;
                var newInfo = pfIsNew(r);
                return {
                    id: r.id, row: r, title: r.title,
                    units: units, prevUnits: prevUnits,
                    mpUnits: o.units, posUnits: p ? p.net : 0,
                    orders: o.orders, revenue: revenue, prevRevenue: prevRevenue,
                    mpRevenue: o.revenue, posRevenue: p ? p.gross : 0,
                    returnedUnits: returnedUnits, returnsValue: p ? p.returnsValue : 0,
                    voidedUnits: p ? p.voidedUnits : 0,
                    returnRate: returnRate,
                    last: o.last, posOnly: (!o.last && p && p.net > 0),
                    avail: si.tracked ? si.available : null,
                    tracked: !!si.tracked,
                    low: r.lowStockThreshold,
                    newProduct: newInfo.isNew, ageDays: newInfo.ageDays,
                    unitLabel: r.unitLabel, precision: r.unitPrecision
                };
            });

            var maxUnits = recs.reduce(function (m, x) { return Math.max(m, x.units); }, 0);
            recs.forEach(function (x) { pfScore(x, maxUnits, posState); });

            var alerts = [];
            recs.forEach(function (x) { alerts = alerts.concat(pfAlertsFor(x, win)); });

            PF.data = {
                window: win, recs: recs, maxUnits: maxUnits, alerts: alerts,
                posState: posState, posReason: posReason,
                sources: ['products'.replace('products', 'products'), 'orders (marketplace)', 'posReports (POS)'].filter(function (s, i) { return i < 2 || posState === 'ok'; })
            };
            PF.loading = false;
        } catch (e) {
            PF.loading = false;
            PF.error = String((e && e.message) || e);
            PF.data = null;
        }
    }

    /* ---------- alama 0–100 (uzito ulioandikwa) ---------- */
    function pfScore(x, maxUnits, posState) {
        var parts = {};
        parts.demand = maxUnits > 0 ? pfClamp(PF_SCORE_W.demand * (x.units / maxUnits), 0, PF_SCORE_W.demand) : 0;
        if (x.prevUnits > 0) {
            var g = (x.units - x.prevUnits) / x.prevUnits;
            parts.growth = pfClamp(12.5 + 12.5 * pfClamp(g, -1, 1), 0, PF_SCORE_W.growth);
        } else {
            parts.growth = x.units > 0 ? 12.5 : 0;      // hakuna msingi wa kulinganisha → neutro
        }
        if (!x.tracked) parts.stock = 10;               // haifuatiliwi → neutro, si 15
        else if (x.avail <= 0) parts.stock = 0;
        else if (x.avail <= x.low) parts.stock = 8;
        else parts.stock = 15;
        parts.returns = (posState === 'ok' && x.returnRate !== null)
            ? pfClamp(10 * (1 - x.returnRate / PF_HIGH_RETURN), 0, 10)
            : 5;                                        // POS haipatikani → neutro
        var raw = (META && META.raw && META.raw[x.id]) || {};
        var imgs = Array.isArray(raw.imagesArray) ? raw.imagesArray : (Array.isArray(raw.images) ? raw.images : (raw.image ? [raw.image] : []));
        var desc = String(raw.description || '').trim();
        parts.listing = (imgs.length ? 2 : 0) + (desc.length >= 80 ? 2 : 0)
            + (x.row.category && x.row.category !== 'N/A' ? 2 : 0)
            + ((x.row.sku || x.row.barcode) ? 2 : 0)
            + (Number(x.row.price) > 0 ? 2 : 0);
        var total = Math.round(parts.demand + parts.growth + parts.stock + parts.returns + parts.listing);
        var conf = (posState === 'ok' && (x.units >= 5 || x.prevUnits > 0)) ? 'high'
            : ((posState === 'ok' || x.units > 0 || x.prevUnits > 0) ? 'medium' : 'low');
        x.score = { total: total, parts: parts, confidence: conf };
        x.label = pfClassify(x, maxUnits);
        return x;
    }

    function pfClassify(x, maxUnits) {
        if (x.newProduct && x.units === 0) return 'N';                 // si "polepole"
        if (x.tracked && x.avail <= 0) return 'G';                     // stock-out ≠ no-sales
        if (x.returnRate !== null && x.returnRate >= PF_HIGH_RETURN && x.returnedUnits >= 2) return 'F';
        if (x.prevUnits > 0 && x.units <= x.prevUnits * 0.7) return 'C';
        if (x.prevUnits > 0 && x.units >= x.prevUnits * 1.3) return 'B';
        if (x.units === 0) return x.newProduct ? 'N' : 'E';
        if (maxUnits > 0 && x.units >= maxUnits * 0.5) return 'A';
        return 'D';
    }

    /* ---------- tahadhari (severity · kipindi · hatua · deep link) ---------- */
    function pfAlertsFor(x, win) {
        var out = [];
        var P = win.label;
        if (x.tracked && x.avail <= 0) {
            out.push({ sev: 'high', pid: x.id, title: 'Stock imeisha: ' + x.title, period: P, action: 'Ongeza stock', href: 'window.skhMPStock(\'' + js(x.id) + '\',' + (Number(x.row.stock) || 0) + ')' });
        } else if (x.tracked && x.avail <= x.low) {
            out.push({ sev: 'medium', pid: x.id, title: 'Stock iko chini: ' + x.title, period: P, action: 'Rekebisha stock', href: 'window.skhMPStock(\'' + js(x.id) + '\',' + (Number(x.row.stock) || 0) + ')' });
        }
        if (x.returnRate !== null && x.returnRate >= PF_HIGH_RETURN && x.returnedUnits >= 2) {
            out.push({ sev: 'high', pid: x.id, title: 'Marejesho ' + (x.returnRate * 100).toFixed(0) + '%: ' + x.title, period: P, action: 'Angalia mauzo', href: 'window.skhRenderSalesInsights()' });
        }
        if (x.prevUnits > 0 && x.units <= x.prevUnits * 0.7) {
            out.push({ sev: 'high', pid: x.id, title: 'Mauzo yameshuka: ' + x.title, period: P, action: 'Angalia mauzo', href: 'window.skhRenderSalesInsights()' });
        }
        if (x.units === 0 && !x.newProduct && x.tracked && x.avail > 0) {
            out.push({ sev: 'medium', pid: x.id, title: 'Hakuna mauzo ingawa stock ipo: ' + x.title, period: P, action: 'Kagua bidhaa', href: 'openProduct(\'' + js(x.id) + '\',\'products\')' });
        }
        if (!(Number(x.row.price) > 0) && x.row.status === 'active') {
            out.push({ sev: 'medium', pid: x.id, title: 'Bei haijawekwa: ' + x.title, period: 'sasa', action: 'Weka bei', href: 'window.openEditModal(\'' + js(x.id) + '\',\'products\')' });
        }
        if (x.row.status === 'active' && (!META.raw[x.id] || !(Array.isArray(META.raw[x.id].imagesArray) && META.raw[x.id].imagesArray.length) && !META.raw[x.id].image)) {
            out.push({ sev: 'low', pid: x.id, title: 'Hakuna picha: ' + x.title, period: 'sasa', action: 'Ongeza picha', href: 'window.openEditModal(\'' + js(x.id) + '\',\'products\')' });
        }
        if (!String((META.raw[x.id] || {}).description || '').trim()) {
            out.push({ sev: 'low', pid: x.id, title: 'Description haipo: ' + x.title, period: 'sasa', action: 'Ongeza maelezo', href: 'window.openEditModal(\'' + js(x.id) + '\',\'products\')' });
        }
        return out;
    }

    /* ---------- filters / sort / counts ---------- */
    function pfHasActionAlert(x) {
        if (!PF.data) return false;
        return PF.data.alerts.some(function (a) { return a.pid === x.id && (a.sev === 'high' || a.sev === 'medium'); });
    }
    function pfFiltered() {
        if (!PF.data) return [];
        var list = PF.data.recs.slice();
        if (PF.kpi === 'top') list = list.filter(function (x) { return x.label === 'A'; });
        else if (PF.kpi === 'growing') list = list.filter(function (x) { return x.label === 'B'; });
        else if (PF.kpi === 'declining') list = list.filter(function (x) { return x.label === 'C'; });
        else if (PF.kpi === 'no_sales') list = list.filter(function (x) { return x.label === 'E'; });
        else if (PF.kpi === 'returns') list = list.filter(function (x) { return x.label === 'F'; });
        else if (PF.kpi === 'action') list = list.filter(function (x) { return x.label === 'G' || x.label === 'F' || x.label === 'C' || pfHasActionAlert(x); });
        if (PF.label) list = list.filter(function (x) { return x.label === PF.label; });
        if (PF.cat) list = list.filter(function (x) { return String(x.row.category) === PF.cat; });
        if (PF.pub) list = list.filter(function (x) { return String(x.row.status) === PF.pub; });
        if (PF.stock === 'out') list = list.filter(function (x) { return x.tracked && x.avail <= 0; });
        else if (PF.stock === 'low') list = list.filter(function (x) { return x.tracked && x.avail > 0 && x.avail <= x.low; });
        else if (PF.stock === 'in') list = list.filter(function (x) { return x.tracked && x.avail > x.low; });
        else if (PF.stock === 'untracked') list = list.filter(function (x) { return !x.tracked; });
        var q = String(PF.q || '').trim().toLowerCase();
        if (q) list = list.filter(function (x) {
            return [x.title, x.row.sku, x.row.barcode].some(function (v) { return v && String(v).toLowerCase().indexOf(q) !== -1; });
        });
        var s = PF.sort;
        list.sort(function (a, b) {
            if (s === 'units') return b.units - a.units;
            if (s === 'revenue') return b.revenue - a.revenue;
            if (s === 'growth') return pfGrowth(a) - pfGrowth(b);
            if (s === 'returns') return (b.returnRate === null ? -1 : b.returnRate) - (a.returnRate === null ? -1 : a.returnRate);
            if (s === 'stock') return (a.tracked ? a.avail : 1e9) - (b.tracked ? b.avail : 1e9);
            if (s === 'name') return String(a.title).localeCompare(String(b.title), 'sw');
            if (s === 'last') return (b.last ? b.last.getTime() : 0) - (a.last ? a.last.getTime() : 0);
            return b.score.total - a.score.total;
        });
        return list;
    }
    function pfGrowth(x) { return x.prevUnits > 0 ? (x.units - x.prevUnits) / x.prevUnits : null; }
    function pfKpiCount(id) {
        var recs = (PF.data && PF.data.recs) || [];
        if (id === 'top') return recs.filter(function (x) { return x.label === 'A'; }).length;
        if (id === 'growing') return recs.filter(function (x) { return x.label === 'B'; }).length;
        if (id === 'declining') return recs.filter(function (x) { return x.label === 'C'; }).length;
        if (id === 'no_sales') return recs.filter(function (x) { return x.label === 'E'; }).length;
        if (id === 'returns') return recs.filter(function (x) { return x.label === 'F'; }).length;
        if (id === 'action') return recs.filter(function (x) { return x.label === 'G' || x.label === 'F' || x.label === 'C' || pfHasActionAlert(x); }).length;
        return recs.length;
    }

    /* ---------- vipande vya HTML ---------- */
    function pfChip(x) {
        var L = PF_LABELS[x.label] || PF_LABELS.D;
        return '<span class="pf-lab is-' + L.tone + '"><b>' + L.code + '</b> ' + esc(L.name) + '</span>';
    }
    function pfConfDot(c) {
        var map = { high: ['#18A982', 'Kamili'], medium: ['#D8B83A', 'Kati'], low: ['#D9534F', 'Pungufu'] };
        var m = map[c] || map.low;
        return '<span class="pf-conf" title="Uhakika wa data: ' + esc(m[1]) + '"><i style="background:' + m[0] + '"></i>' + esc(m[1]) + '</span>';
    }
    function pfGrowthTxt(x) {
        var g = pfGrowth(x);
        if (g === null) return x.units > 0 ? '<span class="pf-na">bila msingi</span>' : '<span class="pf-na">—</span>';
        var up = g >= 0;
        return '<span class="' + (up ? 'pf-up' : 'pf-down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(g * 100).toFixed(0) + '%</span>';
    }

    function pfKpiBar() {
        var total = (PF.data && PF.data.recs.length) || 0;
        return '<div class="pf-kpis">'
            + '<button type="button" class="pf-kpi' + (PF.kpi === 'all' ? ' is-on' : '') + '" onclick="window.skhPfKpi(\'all\')">'
            + '<small>Bidhaa zote</small><b>' + total + '</b></button>'
            + PF_KPIS.map(function (k) {
                return '<button type="button" class="pf-kpi' + (PF.kpi === k.id ? ' is-on' : '') + '" title="' + esc(k.hint) + '" onclick="window.skhPfKpi(\'' + k.id + '\')">'
                    + '<small>' + esc(k.label) + '</small><b>' + pfKpiCount(k.id) + '</b></button>';
            }).join('')
            + '</div>';
    }

    function pfToolbar() {
        var cats = {};
        ((PF.data && PF.data.recs) || []).forEach(function (x) { if (x.row.category && x.row.category !== 'N/A') cats[x.row.category] = true; });
        var ranges = [['today', 'Leo'], ['7d', 'Siku 7'], ['30d', 'Siku 30'], ['month', 'Mwezi huu'], ['3m', 'Miezi 3'], ['custom', 'Kipindi maalum']];
        var sorts = [['score', 'Alama'], ['units', 'Units'], ['revenue', 'Mapato'], ['growth', 'Ukuaji'], ['returns', 'Marejesho'], ['stock', 'Stock'], ['name', 'Jina'], ['last', 'Mauzo ya mwisho']];
        return '<div class="pf-tools">'
            + '<input type="search" value="' + esc(PF.q) + '" placeholder="Tafuta jina, SKU au barcode..." oninput="window.skhPfFilter(\'q\',this.value)">'
            + '<select aria-label="Kipindi" onchange="window.skhPfRange(this.value)">'
            + ranges.map(function (r) { return '<option value="' + r[0] + '"' + (PF.range === r[0] ? ' selected' : '') + '>' + esc(r[1]) + '</option>'; }).join('') + '</select>'
            + (PF.range === 'custom'
                ? '<input type="date" value="' + esc(PF.from) + '" onchange="window.skhPfCustom(this.value,null)"><input type="date" value="' + esc(PF.to) + '" onchange="window.skhPfCustom(null,this.value)">'
                : '')
            + '<select aria-label="Category" onchange="window.skhPfFilter(\'cat\',this.value)"><option value="">Kategoria zote</option>'
            + Object.keys(cats).sort().map(function (c) { return '<option value="' + esc(c) + '"' + (PF.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Lebo" onchange="window.skhPfFilter(\'label\',this.value)"><option value="">Lebo zote</option>'
            + Object.keys(PF_LABELS).map(function (k) { return '<option value="' + k + '"' + (PF.label === k ? ' selected' : '') + '>' + k + ' · ' + esc(PF_LABELS[k].name) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Stock" onchange="window.skhPfFilter(\'stock\',this.value)"><option value="">Stock yote</option>'
            + [['in', 'Ipo'], ['low', 'Chini'], ['out', 'Imeisha'], ['untracked', 'Bila tracking']].map(function (o) { return '<option value="' + o[0] + '"' + (PF.stock === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Publication" onchange="window.skhPfFilter(\'pub\',this.value)"><option value="">Hali zote</option>'
            + [['active', 'Inatumika'], ['draft', 'Draft'], ['suspended', 'Imesimamishwa']].map(function (o) { return '<option value="' + o[0] + '"' + (PF.pub === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Panga" onchange="window.skhPfSort(this.value)">'
            + sorts.map(function (s) { return '<option value="' + s[0] + '"' + (PF.sort === s[0] ? ' selected' : '') + '>Panga: ' + esc(s[1]) + '</option>'; }).join('') + '</select>'
            + '<button type="button" class="pf-link" onclick="window.skhPfClear()">Safisha</button>'
            + '</div>';
    }

    function pfSummaryCards() {
        var recs = PF.data.recs, win = PF.data.window;
        var units = 0, rev = 0, rets = 0, best = null, worst = null;
        recs.forEach(function (x) {
            units += x.units; rev += x.revenue; rets += x.returnedUnits;
            if (!best || x.score.total > best.score.total) best = x;
            if (!worst || x.score.total < worst.score.total) worst = x;
        });
        var cards = [
            { l: 'Units (' + win.label + ')', v: fmtQty(units) },
            { l: 'Mapato', v: tzs(rev) },
            { l: 'Units zilizorudishwa (POS)', v: PF.data.posState === 'ok' ? fmtQty(rets) : 'Haipatikani' },
            { l: 'Alama ya juu', v: best ? best.title + ' · ' + best.score.total : 'Hakuna data' },
            { l: 'Alama ya chini', v: worst ? worst.title + ' · ' + worst.score.total : 'Hakuna data' }
        ];
        return '<div class="pf-cards">' + cards.map(function (c) {
            return '<div class="pf-card"><small>' + esc(c.l) + '</small><b>' + esc(c.v) + '</b></div>';
        }).join('') + '</div>';
    }

    function pfChart(title, unit, items, fmt) {
        var valid = items.filter(function (i) { return i.value !== null && i.value !== undefined && Number.isFinite(Number(i.value)); });
        if (!valid.length) return '<div class="pf-chart"><b>' + esc(title) + '</b><p class="pf-empty">Hakuna data ya kutosha kwa chart hii.</p></div>';
        var max = Math.max.apply(null, valid.map(function (i) { return Math.abs(Number(i.value)); })) || 1;
        return '<div class="pf-chart"><b>' + esc(title) + '<small>' + esc(unit) + '</small></b>'
            + valid.map(function (i) {
                var w = Math.max(2, Math.round(Math.abs(Number(i.value)) / max * 100));
                return '<div class="pf-bar"><span class="pf-bar-l">' + esc(i.label) + '</span><span class="pf-bar-t"><span class="pf-bar-f" style="width:' + w + '%"></span></span><span class="pf-bar-v">' + esc(fmt(i.value)) + '</span></div>';
            }).join('') + '</div>';
    }

    function pfCharts() {
        var recs = PF.data.recs.slice();
        var byUnits = recs.slice().sort(function (a, b) { return b.units - a.units; }).slice(0, 8);
        var byRev = recs.slice().sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, 8);
        var byGrowth = recs.filter(function (x) { return x.prevUnits > 0; }).sort(function (a, b) { return pfGrowth(b) - pfGrowth(a); }).slice(0, 8);
        var counts = Object.keys(PF_LABELS).map(function (k) {
            return { label: k + ' · ' + PF_LABELS[k].name, value: recs.filter(function (x) { return x.label === k; }).length };
        }).filter(function (c) { return c.value > 0; });
        return '<div class="pf-charts">'
            + pfChart('Units kwa bidhaa (8 za juu)', 'units', byUnits.map(function (x) { return { label: x.title, value: x.units }; }), fmtQty)
            + pfChart('Mapato kwa bidhaa (8 za juu)', 'TSh', byRev.map(function (x) { return { label: x.title, value: x.revenue }; }), tzs)
            + pfChart('Ukuaji dhidi ya kipindi kilichopita', '%', byGrowth.map(function (x) { return { label: x.title, value: pfGrowth(x) * 100 }; }), function (v) { return (v >= 0 ? '+' : '') + Number(v).toFixed(0) + '%'; })
            + pfChart('Mgawanyo wa makundi', 'bidhaa', counts, fmtQty)
            + '</div>';
    }

    function pfAlertsPanel() {
        var alerts = PF.data.alerts || [];
        if (!alerts.length) return '';
        var order = { high: 0, medium: 1, low: 2 };
        alerts = alerts.slice().sort(function (a, b) { return order[a.sev] - order[b.sev]; }).slice(0, 8);
        return '<div class="pf-alerts"><div class="pf-alerts-head"><b>Tahadhari (' + alerts.length + ')</b><small>Kila tahadhari ina kipindi, hatua na kiungo.</small></div>'
            + alerts.map(function (a) {
                return '<div class="pf-alert is-' + a.sev + '">'
                    + '<span class="pf-sev">' + (a.sev === 'high' ? 'Peke' : a.sev === 'medium' ? 'Kati' : 'Chini') + '</span>'
                    + '<span class="pf-alert-b"><b>' + esc(a.title) + '</b><small>Kipindi: ' + esc(a.period) + '</small></span>'
                    + '<button type="button" class="pf-alert-a" onclick="' + a.href + '">' + esc(a.action) + '</button></div>';
            }).join('') + '</div>';
    }

    function pfHowPanel() {
        if (!PF.showHow) return '';
        return '<div class="pf-how"><b>Jinsi alama (0–100) inavyohesabiwa</b>'
            + '<ul>'
            + '<li><b>Mahitaji — pointi 40:</b> units za kipindi ÷ units za bidhaa inayoongoza × 40.</li>'
            + '<li><b>Ukuaji — pointi 25:</b> kipindi hiki dhidi ya kipindi cha awali cha urefu sawa (−100% → 0, 0% → 12.5, +100% → 25). Bila mauzo ya awali: 12.5 kama kuna mauzo, 0 kama hakuna.</li>'
            + '<li><b>Upatikanaji — pointi 15:</b> stock ipo 15 · chini ya kiwango 8 · imeisha 0 · bila tracking 10 (hakuna uthibitisho).</li>'
            + '<li><b>Marejesho — pointi 10:</b> 0% → 10, 10%+ → 0 (linear). POS haipatikani → 5 (neutro).</li>'
            + '<li><b>Ukamilifu wa taarifa — pointi 10:</b> picha 2 · maelezo (≥80 herufi) 2 · category 2 · SKU/barcode 2 · bei 2.</li>'
            + '</ul>'
            + '<p><b>Uhakika wa data:</b> <i>Kamili</i> = POS ipo na units ≥5 au kuna kipindi cha awali · <i>Kati</i> = POS ipo au kuna mauzo · <i>Pungufu</i> = hakuna cha kuthibitisha.</p>'
            + '<p><b>Makundi:</b> G stock imeisha (kwanza) · N bidhaa mpya (siku ' + PF_NEW_DAYS + ', mauzo 0 — <b>si</b> "polepole") · F returns ≥10% (units ≥2) · C kushuka ≥30% · B kukua ≥30% · E mauzo 0 lakini stock ipo · A units ≥50% ya kiongozi · D mengine yenye mauzo.</p>'
            + '<p class="pf-note">Hakuna faida, conversion, wateja au ratings zinazobuniwa: hakuna costAtSale kwenye data, na views ni za maisha yote (hazitumiki kwenye alama).</p>'
            + '</div>';
    }

    function pfTableRow(x) {
        var img = x.row.image ? '<img src="' + esc(x.row.image) + '" alt="" onerror="this.style.display=\'none\'">' : '—';
        var availTxt = x.tracked ? fmtQty(x.avail, x.precision) + ' ' + (x.unitLabel || '') : 'Bila tracking';
        var stockCls = !x.tracked ? 'is-na' : (x.avail <= 0 ? 'is-bad' : (x.avail <= x.low ? 'is-warn' : 'is-ok'));
        var retTxt = x.returnRate === null ? '<span class="pf-na">Haipatikani</span>' : (x.returnRate * 100).toFixed(0) + '%' + (x.returnedUnits ? ' · ' + x.returnedUnits : '');
        var open = !!PF.open[x.id];
        var row = '<tr class="pf-row' + (open ? ' is-open' : '') + '" data-pf-row="' + esc(x.id) + '">'
            + '<td class="pf-c-name" data-l="Bidhaa"><span class="pf-thumb">' + img + '</span><span class="pf-nm"><b>' + esc(x.title) + '</b><small>' + esc(x.row.sku || x.row.barcode || 'Haijawekwa') + '</small></span></td>'
            + '<td data-l="Category">' + esc(x.row.category || 'N/A') + '</td>'
            + '<td data-l="Lebo">' + pfChip(x) + '</td>'
            + '<td data-l="Alama"><b class="pf-score">' + x.score.total + '</b>' + pfConfDot(x.score.confidence) + '</td>'
            + '<td data-l="Units">' + fmtQty(x.units, x.precision) + ' <small>' + esc(x.unitLabel || '') + '</small></td>'
            + '<td data-l="Oda (MP)">' + (x.orders || 0) + '</td>'
            + '<td data-l="Mapato">' + tzs(x.revenue) + '</td>'
            + '<td data-l="Stock" class="' + stockCls + '">' + esc(availTxt) + '</td>'
            + '<td data-l="Marejesho">' + retTxt + '</td>'
            + '<td data-l="Ukuaji">' + pfGrowthTxt(x) + '</td>'
            + '<td data-l="Mauzo ya mwisho">' + (x.last ? x.last.toISOString().slice(0, 10) : (x.posOnly ? '<span class="pf-na">POS pekee</span>' : '<span class="pf-na">Hakuna</span>')) + '</td>'
            + '<td data-l="Hatua" class="pf-td-act">'
            + '<button type="button" class="pf-btn" onclick="window.skhPfDetail(\'' + js(x.id) + '\')">' + (open ? 'Funga' : 'Maelezo') + '</button>'
            + (x.tracked && x.avail <= x.low ? '<button type="button" class="pf-btn is-stock" onclick="window.skhMPStock(\'' + js(x.id) + '\',' + (Number(x.row.stock) || 0) + ')">Stock</button>' : '')
            + '</td></tr>';
        if (open) row += '<tr class="pf-detail-row"><td colspan="12">' + pfDetailHtml(x) + '</td></tr>';
        return row;
    }

    function pfDetailHtml(x) {
        var parts = x.score.parts;
        function bar(label, v, max) {
            return '<div class="pf-spart"><span>' + esc(label) + '</span><span class="pf-spart-t"><span style="width:' + Math.round(v / max * 100) + '%"></span></span><b>' + Math.round(v) + '/' + max + '</b></div>';
        }
        var alerts = (PF.data.alerts || []).filter(function (a) { return a.pid === x.id; });
        return '<div class="pf-detail">'
            + '<div class="pf-d-col"><b>Alama: ' + x.score.total + '/100</b>' + pfConfDot(x.score.confidence)
            + bar('Mahitaji', parts.demand, PF_SCORE_W.demand)
            + bar('Ukuaji', parts.growth, PF_SCORE_W.growth)
            + bar('Upatikanaji', parts.stock, PF_SCORE_W.stock)
            + bar('Marejesho', parts.returns, PF_SCORE_W.returns)
            + bar('Taarifa', parts.listing, PF_SCORE_W.listing)
            + '<small class="pf-note">Uzito na kanuni: bofya "Jinsi alama inavyohesabiwa".</small></div>'
            + '<div class="pf-d-col"><b>Data ya kipindi (' + esc(PF.data.window.label) + ')</b>'
            + '<div class="pf-kv"><span>Units (marketplace)</span><b>' + fmtQty(x.mpUnits, x.precision) + '</b></div>'
            + '<div class="pf-kv"><span>Units (POS, net)</span><b>' + (PF.data.posState === 'ok' ? fmtQty(x.posUnits, x.precision) : 'Haipatikani') + '</b></div>'
            + '<div class="pf-kv"><span>Oda za marketplace</span><b>' + x.orders + '</b></div>'
            + '<div class="pf-kv"><span>Transactions (POS)</span><b class="pf-na">Haipatikani</b></div>'
            + '<div class="pf-kv"><span>Mapato (marketplace)</span><b>' + tzs(x.mpRevenue) + '</b></div>'
            + '<div class="pf-kv"><span>Mapato (POS, ghafi)</span><b>' + (PF.data.posState === 'ok' ? tzs(x.posRevenue) : 'Haipatikani') + '</b></div>'
            + '<div class="pf-kv"><span>Units zilizorudishwa</span><b>' + (PF.data.posState === 'ok' ? x.returnedUnits + ' (' + tzs(x.returnsValue) + ')' : 'Haipatikani') + '</b></div>'
            + '<div class="pf-kv"><span>Voided (POS)</span><b>' + (PF.data.posState === 'ok' ? x.voidedUnits : 'Haipatikani') + '</b></div>'
            + '<div class="pf-kv"><span>Kipindi kilichopita</span><b>' + fmtQty(x.prevUnits, x.precision) + ' units</b></div>'
            + '<div class="pf-kv"><span>Stock (sasa)</span><b>' + (x.tracked ? fmtQty(x.row.stockInfo.stock, x.precision) + ' · reserved ' + fmtQty(x.row.stockInfo.reserved, x.precision) + ' · available ' + fmtQty(x.avail, x.precision) : 'Bila tracking') + '</b></div>'
            + '<div class="pf-kv"><span>Umri wa bidhaa</span><b>' + (x.ageDays === null ? 'Haijulikani' : x.ageDays + ' siku') + (x.newProduct ? ' · mpya' : '') + '</b></div>'
            + '<div class="pf-kv"><span>Views (maisha yote)</span><b>' + (x.row.views ? Number(x.row.views).toLocaleString() : 'Haipatikani') + '</b></div>'
            + '</div>'
            + '<div class="pf-d-col"><b>Tahadhari</b>'
            + (alerts.length ? alerts.map(function (a) { return '<div class="pf-alert is-' + a.sev + '"><span class="pf-sev">' + a.sev + '</span><span class="pf-alert-b"><b>' + esc(a.title) + '</b><small>Kipindi: ' + esc(a.period) + '</small></span><button type="button" class="pf-alert-a" onclick="' + a.href + '">' + esc(a.action) + '</button></div>'; }).join('') : '<small class="pf-note">Hakuna tahadhari kwa bidhaa hii.</small>')
            + '<div class="pf-actions">'
            + '<button type="button" class="pf-btn" onclick="openProduct(\'' + js(x.id) + '\',\'products\')">Tazama</button>'
            + '<button type="button" class="pf-btn" onclick="window.openEditModal(\'' + js(x.id) + '\',\'products\')">Hariri (bei/taarifa)</button>'
            + '<button type="button" class="pf-btn" onclick="window.skhMPStock(\'' + js(x.id) + '\',' + (Number(x.row.stock) || 0) + ')">Stock (POS)</button>'
            + '<button type="button" class="pf-btn" onclick="window.skhRenderSalesInsights()">Mauzo yote</button>'
            + '<button type="button" class="pf-btn" onclick="window.skhRenderCompareProducts()">Linganisha</button>'
            + '</div></div></div>';
    }

    function pfTableHtml() {
        var list = pfFiltered();
        if (!list.length) return '<p class="pf-empty-box">Hakuna bidhaa inayolingana na vichujio hivi.</p>';
        return '<div class="pf-table-wrap"><table class="pf-table"><thead><tr>'
            + '<th>Bidhaa</th><th>Category</th><th>Lebo</th><th>Alama</th><th>Units</th><th>Oda (MP)</th><th>Mapato</th><th>Stock</th><th>Marejesho</th><th>Ukuaji</th><th>Mauzo ya mwisho</th><th>Hatua</th>'
            + '</tr></thead><tbody>' + list.map(pfTableRow).join('') + '</tbody></table></div>';
    }

    function pfBody() {
        if (PF.loading) return '<p class="pf-loading">Inakusanya data ya utendaji...</p>';
        if (PF.error) return '<div class="pf-err"><b>Hitilafu:</b> ' + esc(PF.error) + '</div>';
        if (!PF.data) return '<p class="pf-empty-box">Hakuna data bado.</p>';
        var w = PF.data.window;
        return '<div class="pf-shell">'
            + '<div class="pf-top"><div><h2>Utendaji wa Bidhaa</h2>'
            + '<p>Kipindi: <b>' + esc(w.label) + '</b> · kipindi cha awali: ' + w.prevStart.toISOString().slice(0, 10) + ' → ' + w.prevEnd.toISOString().slice(0, 10)
            + ' · vyanzo: products · orders · ' + (PF.data.posState === 'ok' ? 'posReports' : '<span class="pf-na">posReports haipatikani</span>') + '</p></div>'
            + '<button type="button" class="pf-how-btn" onclick="window.skhPfHow()">Jinsi alama inavyohesabiwa</button></div>'
            + (PF.data.posState !== 'ok' ? '<div class="pf-warn">POS haipatikani (' + esc(PF.data.posReason) + ') — units na mapato ni ya marketplace pekee; marejesho = Haipatikani, si 0.</div>' : '')
            + pfKpiBar()
            + pfSummaryCards()
            + pfHowPanel()
            + pfToolbar()
            + pfAlertsPanel()
            + pfCharts()
            + pfTableHtml()
            + '<p class="pf-foot">Stock ni ya sasa (haichujwi kwa tarehe). Cancelled/void hazijahesabiwa. Marejesho na units za POS zinatoka posReports (sold − returns − voids). Hakuna faida, conversion, wateja wala ratings zinazobuniwa.</p>'
            + '</div>';
    }

    function pfRenderShellLoading() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">Inakusanya data ya utendaji...</p>';
    }
    function pfRender() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = pfBody();
    }

    /* ---------- handlers ---------- */
    window.skhPfKpi = function (k) { PF.kpi = (k === PF.kpi ? 'all' : (k || 'all')); pfRender(); };
    window.skhPfSort = function (s) { PF.sort = s || 'score'; pfRender(); };
    window.skhPfFilter = function (k, v) { PF[k] = v; pfRender(); };
    window.skhPfRange = async function (r) { PF.range = r || '30d'; if (r === 'custom' && (!PF.from || !PF.to)) { PF.range = '30d'; } await pfLoad(); pfRender(); };
    window.skhPfCustom = async function (from, to) {
        if (from) PF.from = from; if (to) PF.to = to;
        if (!PF.from || !PF.to) return;
        PF.range = 'custom'; await pfLoad(); pfRender();
    };
    window.skhPfDetail = function (id) { PF.open[id] = !PF.open[id]; pfRender(); };
    window.skhPfHow = function () { PF.showHow = !PF.showHow; pfRender(); };
    window.skhPfClear = function () { PF.q = ''; PF.label = ''; PF.cat = ''; PF.stock = ''; PF.pub = ''; PF.kpi = 'all'; pfRender(); };

    window.skhRenderProductPerformance = async function (pid) {
        await pfLoad();
        PF.open = {};
        if (pid) PF.open[pid] = true;
        pfRender();
        return true;
    };

    /* ---------- styles ---------- */
    function pfEnsureStyles() {
        if (document.getElementById('skhPfStyles')) return;
        var css = ''
            + '.pf-shell{text-align:left;font-family:inherit;}'
            + '.pf-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;}'
            + '.pf-top h2{margin:0;font-size:19px;color:#18352D;font-weight:900;}'
            + '.pf-top p{margin:3px 0 0;font-size:11.5px;color:#64748b;font-weight:700;}'
            + '.pf-how-btn{background:#fff;border:1px solid #D6E6DF;color:#17604E;border-radius:9px;padding:8px 11px;font-size:11.5px;font-weight:900;cursor:pointer;}'
            + '.pf-warn{background:#FBF6E3;border:1px solid #EFE3B8;color:#8A6B16;border-radius:10px;padding:8px 10px;font-size:11.5px;font-weight:800;margin-bottom:8px;}'
            + '.pf-kpis{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px;margin-bottom:9px;}'
            + '.pf-kpi{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:8px 9px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px;}'
            + '.pf-kpi small{font-size:9.5px;color:#7E9A91;font-weight:900;text-transform:uppercase;letter-spacing:.02em;line-height:1.2;}'
            + '.pf-kpi b{font-size:17px;color:#18352D;font-weight:900;}'
            + '.pf-kpi.is-on{background:#EAF8F2;border-color:#18A982;}'
            + '.pf-kpi.is-on b{color:#17604E;}'
            + '.pf-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-bottom:10px;}'
            + '.pf-card{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:9px;}'
            + '.pf-card small{display:block;font-size:9.5px;color:#7E9A91;font-weight:900;text-transform:uppercase;}'
            + '.pf-card b{display:block;font-size:13px;color:#18352D;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
            + '.pf-how{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:12px;margin-bottom:10px;font-size:11.5px;color:#334155;line-height:1.6;}'
            + '.pf-how b{color:#18352D;}'
            + '.pf-how ul{margin:6px 0 6px 16px;padding:0;}'
            + '.pf-how li{margin-bottom:3px;}'
            + '.pf-how p{margin:4px 0;}'
            + '.pf-note{font-size:10.5px;color:#8FA69D;font-weight:800;}'
            + '.pf-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:8px;margin-bottom:9px;}'
            + '.pf-tools input,.pf-tools select{border:1px solid #D6E6DF;border-radius:9px;padding:7px 8px;font-size:11.5px;font-weight:800;color:#18352D;background:#fff;}'
            + '.pf-tools input[type=search]{flex:1;min-width:170px;font-weight:600;}'
            + '.pf-link{background:none;border:none;color:#2E6C86;font-weight:900;font-size:11.5px;text-decoration:underline;cursor:pointer;}'
            + '.pf-alerts{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;margin-bottom:9px;}'
            + '.pf-alerts-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline;margin-bottom:6px;}'
            + '.pf-alerts-head b{font-size:12.5px;color:#18352D;}'
            + '.pf-alerts-head small{font-size:10.5px;color:#8FA69D;font-weight:800;}'
            + '.pf-alert{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:9px;margin-bottom:5px;background:#F8FBFA;border:1px solid #EEF4F1;}'
            + '.pf-alert.is-high{background:#FDF1F0;border-color:#F3D6D5;}'
            + '.pf-alert.is-medium{background:#FDFAF0;border-color:#EFE3B8;}'
            + '.pf-sev{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;color:#526962;background:#fff;border-radius:6px;padding:2px 5px;flex:0 0 auto;}'
            + '.pf-alert.is-high .pf-sev{color:#B33B37;}'
            + '.pf-alert.is-medium .pf-sev{color:#8A6B16;}'
            + '.pf-alert-b{flex:1;min-width:0;display:flex;flex-direction:column;}'
            + '.pf-alert-b b{font-size:11.5px;color:#18352D;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
            + '.pf-alert-b small{font-size:10px;color:#8FA69D;font-weight:800;}'
            + '.pf-alert-a{background:#fff;border:1px solid #D6E6DF;color:#17604E;border-radius:7px;padding:4px 8px;font-size:10px;font-weight:900;cursor:pointer;flex:0 0 auto;}'
            + '.pf-charts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}'
            + '.pf-chart{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;}'
            + '.pf-chart>b{display:flex;justify-content:space-between;gap:6px;font-size:11px;color:#18352D;font-weight:900;margin-bottom:6px;}'
            + '.pf-chart>b small{font-size:9.5px;color:#8FA69D;font-weight:800;}'
            + '.pf-bar{display:grid;grid-template-columns:66px 1fr 52px;gap:6px;align-items:center;margin-bottom:5px;}'
            + '.pf-bar-l{font-size:9.5px;color:#526962;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
            + '.pf-bar-t{height:8px;background:#EAF2EE;border-radius:999px;overflow:hidden;}'
            + '.pf-bar-f{display:block;height:100%;background:#18A982;border-radius:999px;}'
            + '.pf-bar-v{font-size:9.5px;color:#18352D;font-weight:900;text-align:right;}'
            + '.pf-table-wrap{overflow-x:auto;border:1px solid #E2EDE8;border-radius:12px;background:#fff;}'
            + '.pf-table{border-collapse:separate;border-spacing:0;width:100%;min-width:900px;table-layout:auto;}'
            + '.pf-table thead th{position:sticky;top:0;z-index:2;background:#F8FBFA;border-bottom:1px solid #E2EDE8;padding:8px;font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:.02em;color:#7E9A91;text-align:left;white-space:nowrap;}'
            + '.pf-table td{border-bottom:1px solid #F1F5F3;padding:7px 6px;font-size:11px;color:#18352D;font-weight:800;vertical-align:middle;white-space:nowrap;}'
            + '.pf-table thead th{padding:7px 6px;}'
            + '.pf-row:hover{background:#FBFDFC;}'
            + '.pf-row.is-open{background:#F4FBF8;}'
            + '.pf-c-name{display:flex;gap:6px;align-items:center;min-width:150px;}'
            + '.pf-thumb{width:30px;height:30px;flex:0 0 30px;border-radius:8px;background:#F1F5F3;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;color:#A7BCB3;font-size:10px;}'
            + '.pf-thumb img{width:100%;height:100%;object-fit:contain;}'
            + '.pf-nm{display:flex;flex-direction:column;min-width:0;}'
            + '.pf-nm b{font-size:11px;color:#18352D;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:132px;}'
            + '.pf-nm small{font-size:9.5px;color:#8FA69D;font-weight:800;}'
            + '.pf-lab{display:inline-flex;gap:4px;align-items:center;border-radius:999px;padding:3px 7px;font-size:9.5px;font-weight:900;background:#F1F5F3;color:#526962;}'
            + '.pf-lab b{font-size:10px;}'
            + '.pf-lab.is-ok{background:#EAF8F2;color:#17604E;}'
            + '.pf-lab.is-warn{background:#FBF6E3;color:#8A6B16;}'
            + '.pf-lab.is-bad{background:#FDF1F0;color:#B33B37;}'
            + '.pf-lab.is-info{background:#EAF2F7;color:#2E6C86;}'
            + '.pf-score{font-size:13px;}'
            + '.pf-conf{display:inline-flex;gap:3px;align-items:center;font-size:9px;font-weight:900;color:#8FA69D;margin-left:5px;}'
            + '.pf-conf i{width:6px;height:6px;border-radius:50%;display:inline-block;}'
            + '.pf-na{color:#A7BCB3;font-weight:800;font-style:italic;}'
            + '.pf-up{color:#18A982;font-weight:900;}'
            + '.pf-down{color:#D9534F;font-weight:900;}'
            + '.pf-td-act{display:flex;gap:4px;}'
            + '.pf-btn{background:#fff;border:1px solid #D6E6DF;color:#17604E;border-radius:7px;padding:4px 8px;font-size:10px;font-weight:900;cursor:pointer;}'
            + '.pf-btn.is-stock{background:#FBF6E3;border-color:#EFE3B8;color:#8A6B16;}'
            + '.pf-detail-row td{background:#FAFDFB;padding:0;white-space:normal;}'
            + '.pf-detail{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:12px;padding:12px;}'
            + '.pf-d-col{min-width:0;font-size:11px;color:#334155;}'
            + '.pf-d-col>b{display:block;font-size:11.5px;color:#18352D;font-weight:900;margin-bottom:6px;}'
            + '.pf-spart{display:grid;grid-template-columns:82px 1fr 40px;gap:6px;align-items:center;margin-bottom:5px;font-size:10px;font-weight:800;color:#526962;}'
            + '.pf-spart-t{height:7px;background:#EAF2EE;border-radius:999px;overflow:hidden;}'
            + '.pf-spart-t span{display:block;height:100%;background:#18A982;}'
            + '.pf-kv{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #F1F5F3;padding:3px 0;font-size:10.5px;}'
            + '.pf-kv span{color:#7E9A91;font-weight:800;}'
            + '.pf-kv b{color:#18352D;font-weight:900;text-align:right;}'
            + '.pf-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;}'
            + '.pf-empty,.pf-loading,.pf-empty-box{font-size:11.5px;color:#8FA69D;font-weight:800;text-align:center;padding:14px;margin:0;}'
            + '.pf-err{background:#FDF1F0;border:1px solid #F3D6D5;color:#B33B37;border-radius:10px;padding:10px;font-size:12px;}'
            + '.pf-foot{font-size:10px;color:#8FA69D;font-weight:800;margin:8px 0 0;}'
            + '@media (max-width:1100px){.pf-kpis{grid-template-columns:repeat(4,minmax(0,1fr));}.pf-charts{grid-template-columns:repeat(2,minmax(0,1fr));}.pf-cards{grid-template-columns:repeat(3,minmax(0,1fr));}}'
            + '@media (max-width:900px){.pf-detail{grid-template-columns:1fr;}}'
            + '@media (max-width:480px){'
            + '.pf-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}'
            + '.pf-cards{grid-template-columns:1fr 1fr;}'
            + '.pf-charts{grid-template-columns:1fr;}'
            + '.pf-table{min-width:0;}'
            + '.pf-table thead{display:none;}'
            + '.pf-table tbody,.pf-table tr,.pf-table td{display:block;width:auto;}'
            + '.pf-row{border-bottom:8px solid #F4F8F6;padding:8px 10px;}'
            + '.pf-row td{border:none;padding:3px 0;display:flex;justify-content:space-between;gap:10px;font-size:11.5px;}'
            + '.pf-row td:before{content:attr(data-l);font-size:10px;color:#8FA69D;font-weight:900;text-transform:uppercase;}'
            + '.pf-row td.pf-c-name{display:block;}'
            + '.pf-row td.pf-c-name:before{display:none;}'
            + '.pf-c-name{align-items:flex-start;}'
            + '.pf-td-act{display:flex;gap:5px;justify-content:flex-end;}'
            + '.pf-detail-row td{background:#FAFDFB;}'
            + '.pf-detail{grid-template-columns:1fr;padding:10px;}'
            + '}';
        var st = document.createElement('style');
        st.id = 'skhPfStyles';
        st.textContent = css;
        document.head.appendChild(st);
    }
    pfEnsureStyles();

    /* ---------- test API ---------- */
    window.skhPf = {
        state: function () { return { range: PF.range, sort: PF.sort, kpi: PF.kpi, q: PF.q, label: PF.label, cat: PF.cat, stock: PF.stock, pub: PF.pub, loading: PF.loading, error: PF.error, open: Object.assign({}, PF.open) }; },
        window: function () { return PF.data ? PF.data.window : null; },
        data: function () { return PF.data; },
        recs: function () { return PF.data ? PF.data.recs.map(function (x) { return { id: x.id, title: x.title, units: x.units, prevUnits: x.prevUnits, mpUnits: x.mpUnits, posUnits: x.posUnits, revenue: x.revenue, orders: x.orders, returnedUnits: x.returnedUnits, returnRate: x.returnRate, avail: x.avail, tracked: x.tracked, label: x.label, score: x.score.total, parts: x.score.parts, confidence: x.score.confidence, newProduct: x.newProduct }; }) : null; },
        alerts: function () { return PF.data ? PF.data.alerts : null; },
        filtered: function () { return pfFiltered().map(function (x) { return x.id; }); },
        kpiCount: function (id) { return pfKpiCount(id); },
        setRange: async function (r) { await window.skhPfRange(r); },
        sort: function (s) { window.skhPfSort(s); },
        kpi: function (k) { window.skhPfKpi(k); },
        filter: function (k, v) { window.skhPfFilter(k, v); },
        clear: function () { window.skhPfClear(); },
        detail: function (id) { window.skhPfDetail(id); }
    };

    // ---------- 3. SALES INSIGHTS (legacy, imehifadhiwa) ----------
    /* [SALES 2026-11-03] Mwonekano wa awali umehifadhiwa kama legacy function;
       hakuna function iliyoondolewa. Dashboard mpya iko chini. */
    window.skhRenderSalesInsightsLegacy = async function () {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">' + T('smp_analyzing', 'Analyzing sales...') + '</p>';
        await loadSellerMetrics();
        var rows = META.rows.slice();
        var best = rows.filter(function (r) { return r.units > 0; }).sort(function (a, b) { return b.units - a.units; }).slice(0, 5);
        var slow = rows.filter(function (r) { return r.units === 0; }).sort(function (a, b) { return new Date(a.createdAt || 0) - new Date(b.createdAt || 0); }).slice(0, 5);
        var mostViewed = rows.slice().sort(function (a, b) { return b.views - a.views; }).slice(0, 5);
        var mostLiked = rows.slice().sort(function (a, b) { return b.likes - a.likes; }).slice(0, 5);
        var mostSaved = rows.slice().sort(function (a, b) { return b.saves - a.saves; }).slice(0, 5);

        function listBlock(title, color, items, field, suffix) {
            var body = items.length ? items.map(function (r, i) {
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">'
                    + '<span style="color:#0f172a;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;">' + (i + 1) + '. ' + esc(r.title) + '</span>'
                    + '<b style="color:' + color + ';">' + r[field].toLocaleString() + (suffix || '') + '</b></div>';
            }).join('') : '<p style="font-size:12px;color:#94a3b8;margin:0;">' + T('smp_no_data', 'Not enough data yet.') + '</p>';
            return '<div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:10px;"><b style="font-size:12px;color:#0f172a;display:block;margin-bottom:6px;text-transform:uppercase;">' + title + '</b>' + body + '</div>';
        }

        ws.innerHTML = `
        <div style="text-align:left; animation: fadeIn 0.3s ease;"> <h2 style="margin:0 0 4px;font-size:19px;color:#0f172a;">${T('smp_sales_perf', 'Sales Performance')}</h2> <p style="margin:0 0 14px;color:#64748b;font-size:12px;">${T('smp_sales_sub', 'Based on your real order and product data.')}</p>
            ${listBlock(T('smp_best_selling', 'Best Selling Products'), '#16a34a', best, 'units', T('smp_suffix_sold', ' sold'))}
            ${listBlock(T('smp_slow_moving', 'Slow Moving Products'), '#ef4444', slow, 'units', T('smp_suffix_sold', ' sold'))}
            ${listBlock(T('smp_most_viewed', 'Most Viewed'), '#0369a1', mostViewed, 'views', T('smp_suffix_views', ' views'))}
            ${listBlock(T('smp_most_liked', 'Most Liked'), '#e11d48', mostLiked, 'likes', T('smp_suffix_likes', ' likes'))}
            ${listBlock(T('smp_most_saved', 'Most Saved'), '#b45309', mostSaved, 'saves', T('smp_suffix_saves', ' saves'))}
        </div>`;
    };

    // ---------- 3. SALES INSIGHTS [2026-11-03] ----------
    /* Dashboard ya mauzo: KPI 7, mwenendo (siku/wiki/mwezi/kipindi maalum),
       kipindi hiki dhidi ya kilichopita, siku za wiki, WoW, MoM, bidhaa
       zinazoongoza + zinazosonga polepole, na mauzo kwa category.
       Vyanzo: orders (marketplace) · posReports (server: summary + daily + products).
       Hakuna kubuni: refunds za marketplace hazithibitishiki → Haipatikani. */
    var SI = {
        range: '30d', from: '', to: '', bucket: 'day', source: 'all',
        loading: false, error: null, data: null
    };
    var SI_SOURCES = [['all', 'Zote'], ['pos', 'POS'], ['mp', 'Soko la Mtandaoni']];
    var SI_NA_MP_REFUND = 'refund/returns za marketplace hazirekodiwi kwa oda — hazithibitishiki';

    function siWindow(range) {
        var now = new Date();
        var start = startOfDayLocal(now), end = new Date(now.getTime()), label = 'Leo';
        if (range === '7d') { start = startOfDayLocal(now); start.setDate(start.getDate() - 6); label = 'Siku 7'; }
        else if (range === '30d') { start = startOfDayLocal(now); start.setDate(start.getDate() - 29); label = 'Siku 30'; }
        else if (range === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); label = 'Mwezi huu'; }
        else if (range === '3m') { start = startOfDayLocal(now); start.setDate(start.getDate() - 89); label = 'Miezi 3'; }
        else if (range === 'custom') {
            if (!SI.from || !SI.to) { range = '30d'; start = startOfDayLocal(now); start.setDate(start.getDate() - 29); label = 'Siku 30'; }
            else {
                start = new Date(SI.from + 'T00:00:00');
                end = new Date(SI.to + 'T23:59:59.999');
                if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) { range = '30d'; start = startOfDayLocal(now); start.setDate(start.getDate() - 29); label = 'Siku 30'; }
                else label = SI.from + ' → ' + SI.to;
            }
        }
        var span = Math.max(86400000, end.getTime() - start.getTime());
        return { range: range, start: start, end: end, label: label, prevStart: new Date(start.getTime() - span), prevEnd: new Date(start.getTime()), days: Math.round(span / 86400000) };
    }
    function siKey(d) {
        var x = d instanceof Date ? d : new Date(d);
        return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    }
    function siParseKey(k) { var p = String(k).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
    function siDayList(win) {
        var out = [], d = startOfDayLocal(win.start), guard = 0;
        while (d.getTime() <= win.end.getTime() && guard++ < 400) { out.push(siKey(d)); d = new Date(d.getTime() + 86400000); }
        return out;
    }

    /* marketplace orders → buckets za siku + saa + jumla */
    function siOrderBuckets(win) {
        var byDay = {}, byHour = {}, tx = 0, units = 0, gross = 0, seen = {};
        (META && META.orders ? META.orders : []).forEach(function (o) {
            var st = String(o && o.status || '').toLowerCase();
            if (!st || SOLD_STATUSES.indexOf(st) === -1) return;
            var when = o.completedAt || o.deliveredAt || o.paidAt || o.createdAt;
            if (!inWindow(when, win)) return;
            var d = when && o.completedAt ? new Date(when) : new Date(when);
            if (isNaN(d.getTime())) return;
            var k = siKey(d), h = d.getHours();
            var oUnits = 0, oGross = 0;
            (o.items || []).forEach(function (it) {
                var qty = Number(it && (it.qty != null ? it.qty : it.quantity));
                if (!Number.isFinite(qty) || qty <= 0) qty = 1;
                var price = Number(it && it.price); if (!Number.isFinite(price) || price <= 0) price = 0;
                oUnits += qty; oGross += price * qty;
            });
            if (!byDay[k]) byDay[k] = { tx: 0, units: 0, gross: 0 };
            byDay[k].tx += 1; byDay[k].units += oUnits; byDay[k].gross += oGross;
            if (!byHour[h]) byHour[h] = { tx: 0, units: 0, gross: 0 };
            byHour[h].tx += 1; byHour[h].units += oUnits; byHour[h].gross += oGross;
            tx += 1; units += oUnits; gross += oGross;
        });
        return { byDay: byDay, byHour: byHour, tx: tx, units: units, gross: gross };
    }

    function siPosDaily(report) {
        var byDay = {};
        (report && Array.isArray(report.daily) ? report.daily : []).forEach(function (row) {
            if (!row || !row.date) return;
            var k = String(row.date).slice(0, 10);
            byDay[k] = { tx: Number(row.completedSales) || 0, gross: Number(row.grossSales) || 0, net: Number(row.netSales) ?? 0 };
        });
        return byDay;
    }

    async function siLoad() {
        SI.loading = true; SI.error = null;
        siShellLoading();
        try {
            if (!META) await loadSellerMetrics();
            var win = siWindow(SI.range);
            var prevWin = { start: win.prevStart, end: win.prevEnd };
            var mp = siOrderBuckets(win);
            var mpPrev = siOrderBuckets(prevWin);
            var posState = 'unavailable', posReason = '', pos = null, posPrev = null;
            var res = await callPosReport(win);
            if (res.ok) {
                posState = 'ok';
                pos = res.report;
                var resPrev = await callPosReport(prevWin);
                if (resPrev.ok) posPrev = resPrev.report;
            } else {
                posState = 'error';
                posReason = res.reason || 'haipatikani';
            }
            var posAgg = pos ? pfPosAgg(pos) : {};
            var posAggPrev = posPrev ? pfPosAgg(posPrev) : {};
            var posSummary = (pos && pos.summary) || null;
            var posSummaryPrev = (posPrev && posPrev.summary) || null;
            var posDaily = siPosDaily(pos);

            var posTotals = {
                tx: posSummary ? Number(posSummary.completedSales) || 0 : 0,
                gross: posSummary ? Number(posSummary.grossSales) || 0 : 0,
                net: posSummary ? Number(posSummary.netSales) || 0 : null,
                returned: posSummary ? Number(posSummary.returnedAmount) || 0 : 0,
                voided: posSummary ? Number(posSummary.voidValue) || 0 : 0
            };
            var posUnits = Object.keys(posAgg).reduce(function (t, k) { return t + (posAgg[k].net || 0); }, 0);
            var posTotalsPrev = {
                tx: posSummaryPrev ? Number(posSummaryPrev.completedSales) || 0 : null,
                gross: posSummaryPrev ? Number(posSummaryPrev.grossSales) || 0 : null,
                net: posSummaryPrev ? Number(posSummaryPrev.netSales) || 0 : null
            };
            var posUnitsPrev = Object.keys(posAggPrev).reduce(function (t, k) { return t + (posAggPrev[k].net || 0); }, 0);

            /* mfululizo wa siku — siku zote za kipindi (zero ≠ missing) */
            var days = siDayList(win);
            var series = days.map(function (k) {
                var m = mp.byDay[k] || { tx: 0, units: 0, gross: 0 };
                var p = posDaily[k] || { tx: 0, gross: 0, net: 0 };
                return { key: k, mpTx: m.tx, mpUnits: m.units, mpGross: m.gross, posTx: p.tx, posGross: p.gross, gross: m.gross + p.gross, tx: m.tx + p.tx };
            });

            var prevSeries = siDayList({ start: win.prevStart, end: win.prevEnd }).map(function (k) {
                var m = mp.byDay[k] || { tx: 0, units: 0, gross: 0 };
                var p = posDaily[k] || { tx: 0, gross: 0 };   // POS ya awali haitumiki kwa siku (report ni ya kipindi kimoja)
                return { key: k, gross: m.gross, tx: m.tx };
            });


            /* siku za wiki (0=Jumapili … 6=Jumamosi) */
            var dow = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return { dow: i, gross: 0, tx: 0 }; });
            series.forEach(function (s) { var d = siParseKey(s.key).getDay(); dow[d].gross += s.gross; dow[d].tx += s.tx; });

            /* wiki hii dhidi ya wiki iliyopita (haitegemei range) */
            var now = new Date();
            var w1 = { start: startOfDayLocal(new Date(now.getTime() - 6 * 86400000)), end: new Date(now.getTime()) };
            var w0 = { start: new Date(w1.start.getTime() - 7 * 86400000), end: new Date(w1.start.getTime()) };
            var mpW1 = siOrderBuckets(w1), mpW0 = siOrderBuckets(w0);
            var posW1 = null, posW0 = null;
            if (posState === 'ok') {
                var rW1 = await callPosReport(w1); if (rW1.ok) posW1 = rW1.report.summary;
                var rW0 = await callPosReport(w0); if (rW0.ok) posW0 = rW0.report.summary;
            }
            var wow = {
                cur: { tx: mpW1.tx + (posW1 ? Number(posW1.completedSales) || 0 : 0), gross: mpW1.gross + (posW1 ? Number(posW1.grossSales) || 0 : 0) },
                prev: { tx: mpW0.tx + (posW0 ? Number(posW0.completedSales) || 0 : 0), gross: mpW0.gross + (posW0 ? Number(posW0.grossSales) || 0 : 0) },
                posOk: !!(posW1 && posW0)
            };
            /* mwezi huu (hadi leo) dhidi ya kipimo sawa cha mwezi uliopita */
            var mStart = new Date(now.getFullYear(), now.getMonth(), 1);
            var momLenDays = Math.max(1, Math.round((startOfDayLocal(now).getTime() - mStart.getTime()) / 86400000) + 1);
            var mNow = { start: mStart, end: new Date(now.getTime()) };
            var pStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            var mPrevW = { start: pStart, end: new Date(pStart.getTime() + momLenDays * 86400000) };
            var mpM1 = siOrderBuckets(mNow), mpM0 = siOrderBuckets(mPrevW);
            var posM1 = null, posM0 = null;
            if (posState === 'ok') {
                var rM1 = await callPosReport(mNow); if (rM1.ok) posM1 = rM1.report.summary;
                var rM0 = await callPosReport(mPrevW); if (rM0.ok) posM0 = rM0.report.summary;
            }
            var mom = {
                cur: { tx: mpM1.tx + (posM1 ? Number(posM1.completedSales) || 0 : 0), gross: mpM1.gross + (posM1 ? Number(posM1.grossSales) || 0 : 0) },
                prev: { tx: mpM0.tx + (posM0 ? Number(posM0.completedSales) || 0 : 0), gross: mpM0.gross + (posM0 ? Number(posM0.grossSales) || 0 : 0) },
                days: momLenDays, posOk: !!(posM1 && posM0)
            };

            /* bidhaa: top + polepole + category */
            var prodAgg = {};
            var perProdOrders = pfOrderAgg(win);
            Object.keys(perProdOrders).forEach(function (pid) {
                prodAgg[pid] = { units: perProdOrders[pid].units, gross: perProdOrders[pid].revenue, mpUnits: perProdOrders[pid].units, posUnits: 0 };
            });
            Object.keys(posAgg).forEach(function (pid) {
                if (!prodAgg[pid]) prodAgg[pid] = { units: 0, gross: 0, mpUnits: 0, posUnits: 0 };
                prodAgg[pid].units += posAgg[pid].net;
                prodAgg[pid].gross += posAgg[pid].gross;
                prodAgg[pid].posUnits += posAgg[pid].net;
            });
            var rows = (META && META.rows) || [];
            var prods = rows.map(function (r) {
                var a = prodAgg[r.id] || { units: 0, gross: 0, mpUnits: 0, posUnits: 0 };
                var info = pfIsNew(r);
                return { id: r.id, title: r.title, category: r.category, units: a.units, gross: a.gross, mpUnits: a.mpUnits, posUnits: a.posUnits, avail: r.stockInfo && r.stockInfo.tracked ? r.stockInfo.available : null, tracked: !!(r.stockInfo && r.stockInfo.tracked), newProduct: info.isNew, ageDays: info.ageDays, unitLabel: r.unitLabel, precision: r.unitPrecision };
            });
            var top = prods.filter(function (p) { return p.units > 0; }).sort(function (a, b) { return b.units - a.units; }).slice(0, 8);
            var slow = prods.filter(function (p) { return p.units === 0 && (!p.tracked || p.avail > 0) && !p.newProduct; })
                .sort(function (a, b) { return (b.avail || 0) - (a.avail || 0); }).slice(0, 8);

            var catMap = {};
            prods.forEach(function (p) {
                var c = p.category || 'N/A';
                if (!catMap[c]) catMap[c] = { cat: c, units: 0, gross: 0, n: 0 };
                catMap[c].units += p.units; catMap[c].gross += p.gross; catMap[c].n += 1;
            });
            var cats = Object.keys(catMap).map(function (k) { return catMap[k]; }).sort(function (a, b) { return b.gross - a.gross; });

            SI.data = {
                window: win, prevWindow: { label: win.prevStart.toISOString().slice(0, 10) + ' → ' + win.prevEnd.toISOString().slice(0, 10) }, series: series, dow: dow,
                mp: mp, posTotals: posTotals, posUnits: posUnits, posTotalsPrev: posTotalsPrev, posUnitsPrev: posUnitsPrev,
                mpPrev: { tx: mpPrev.tx, units: mpPrev.units, gross: mpPrev.gross },
                posState: posState, posReason: posReason,
                wow: wow, mom: mom, top: top, slow: slow, cats: cats,
                prodCount: prods.length
            };
            SI.loading = false;
        } catch (e) {
            SI.loading = false;
            SI.error = String((e && e.message) || e);
            SI.data = null;
        }
    }

    function siBucketSeries(series, mode) {
        if (mode === 'day') return series.map(function (s) { return { label: s.key.slice(5), full: s.key, gross: s.gross, tx: s.tx, units: s.mpUnits || 0 }; });
        var map = {};
        series.forEach(function (s) {
            var d = siParseKey(s.key), key;
            if (mode === 'week') {
                var tmp = new Date(d.getTime());
                var dow = (tmp.getDay() + 6) % 7;                 // Jumatatu = 0
                tmp.setDate(tmp.getDate() - dow);
                key = siKey(tmp);
            } else {
                key = s.key.slice(0, 7);
            }
            if (!map[key]) map[key] = { label: key, full: key, gross: 0, tx: 0 };
            map[key].gross += s.gross; map[key].tx += s.tx;
        });
        return Object.keys(map).sort().map(function (k) { return map[k]; });
    }

    /* ---------- hesabu za KPI (kwa chanzo kilichochaguliwa) ---------- */
    function siScopeTotals(scope) {
        var d = SI.data; if (!d) return null;
        var pos = { tx: d.posTotals.tx, units: d.posUnits, gross: d.posTotals.gross, net: d.posTotals.net };
        var posPrev = { tx: d.posTotalsPrev.tx, units: d.posUnitsPrev, gross: d.posTotalsPrev.gross, net: d.posTotalsPrev.net };
        var mp = { tx: d.mp.tx, units: d.mp.units, gross: d.mp.gross, net: null };
        var mpPrev = { tx: d.mpPrev.tx, units: d.mpPrev.units, gross: d.mpPrev.gross, net: null };
        var posOk = d.posState === 'ok';
        if (scope === 'mp') return { tx: mp.tx, units: mp.units, gross: mp.gross, net: null, prev: mpPrev, netPartial: false, posOk: posOk };
        if (scope === 'pos') return { tx: pos.tx, units: pos.units, gross: pos.gross, net: pos.net, prev: posPrev, netPartial: false, posOk: posOk };
        var prevKnown = posOk && posPrev.tx !== null && posPrev.gross !== null;
        return {
            tx: mp.tx + pos.tx, units: mp.units + pos.units, gross: mp.gross + pos.gross,
            net: null, netPosOnly: posOk ? pos.net : null,
            prev: prevKnown ? { tx: mpPrev.tx + posPrev.tx, units: mpPrev.units + posPrev.units, gross: mpPrev.gross + posPrev.gross, net: null } : null,
            netPartial: posOk, posOk: posOk
        };
    }
    function siPct(cur, prev) {
        if (prev === null || prev === undefined || !(Number(prev) > 0)) return null;   // hakuna denominator halali
        if (cur === null || cur === undefined) return null;
        return ((Number(cur) - Number(prev)) / Number(prev)) * 100;
    }
    function siDelta(cur, prev) {
        var p = siPct(cur, prev);
        if (p === null) return '<span class="si-na">' + (prev === null || prev === undefined ? 'Kipindi cha awali haipatikani' : 'Bila msingi (awali 0)') + '</span>';
        var up = p >= 0;
        return '<span class="' + (up ? 'si-up' : 'si-down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(p).toFixed(1) + '%</span>';
    }

    function siKpiCards() {
        var t = siScopeTotals(SI.source);
        var prev = t.prev || {};
        var aovNet, aovNetPrev, aovNetSub;
        if (SI.source === 'all' && t.netPosOnly !== null && t.netPosOnly !== undefined) {
            var posTx = SI.data.posTotals.tx, posTxPrev = SI.data.posTotalsPrev.tx;
            aovNet = posTx > 0 ? t.netPosOnly / posTx : null;
            aovNetPrev = (posTxPrev > 0 && SI.data.posTotalsPrev.net !== null) ? SI.data.posTotalsPrev.net / posTxPrev : null;
            aovNetSub = 'POS pekee (net ÷ transactions za POS)';
        } else {
            aovNet = (t.net !== null && t.tx > 0) ? t.net / t.tx : null;
            aovNetPrev = (prev.net !== null && prev.net !== undefined && prev.tx > 0) ? prev.net / prev.tx : null;
            aovNetSub = 'POS pekee';
        }
        var aovGross = t.tx > 0 ? t.gross / t.tx : null;
        var aovGrossPrev = (prev.tx > 0) ? prev.gross / prev.tx : null;
        var unitsPerTx = t.tx > 0 ? t.units / t.tx : null;
        var unitsPerTxPrev = (prev.tx > 0) ? prev.units / prev.tx : null;
        var growth = siPct(t.gross, prev.gross);
        function card(label, value, sub, deltaHtml, na) {
            return '<div class="si-kpi' + (na ? ' is-na' : '') + '">'
                + '<small>' + esc(label) + '</small>'
                + '<b>' + esc(value) + '</b>'
                + '<span class="si-kpi-sub">' + esc(sub) + '</span>'
                + '<span class="si-kpi-d">' + (deltaHtml || '') + '</span></div>';
        }
        var netTxt, netNa = false, netSub = '', netDelta = '';
        if (SI.source === 'pos') {
            netTxt = t.net === null ? 'Haipatikani' : tzs(t.net); netNa = t.net === null;
            netSub = 'ghafi − returns − void (POS)';
            netDelta = siDelta(t.net, prev.net);
        } else if (SI.source === 'mp') {
            netTxt = 'Haipatikani'; netNa = true;
            netSub = SI_NA_MP_REFUND;
        } else {
            netTxt = t.netPosOnly === null ? 'Haipatikani' : tzs(t.netPosOnly); netNa = t.netPosOnly === null;
            netSub = 'POS pekee — refunds za marketplace hazithibitishiki';
        }
        return '<div class="si-kpis">'
            + card('Transactions zilizokamilika', fmtQty(t.tx), 'POS completedSales + oda za marketplace', siDelta(t.tx, prev.tx))
            + card('Units zilizouzwa', fmtQty(t.units), 'POS net + marketplace', siDelta(t.units, prev.units))
            + card('Mauzo ghafi', tzs(t.gross), 'POS grossSales + bei za oda', siDelta(t.gross, prev.gross))
            + card('Mauzo halisi (net)', netTxt, netSub, netDelta, netNa)
            + card('AOV (net ÷ transactions)', aovNet === null ? 'Haipatikani' : tzs(aovNet),
                aovNet === null ? 'Net haithibitishiki kwa chanzo hiki' : aovNetSub, aovNet === null ? '' : siDelta(aovNet, aovNetPrev), aovNet === null)
            + card('AOV (ghafi ÷ transactions)', aovGross === null ? 'Haipatikani' : tzs(aovGross), 'chanzo kilichochaguliwa', aovGross === null ? '' : siDelta(aovGross, aovGrossPrev), aovGross === null)
            + card('Units kwa transaction', unitsPerTx === null ? 'Haipatikani' : unitsPerTx.toFixed(2), 'units ÷ transactions', unitsPerTx === null ? '' : siDelta(unitsPerTx, unitsPerTxPrev), unitsPerTx === null)
            + card('Ukuaji (ghafi)', growth === null ? 'Haipatikani' : (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%',
                'dhidi ya kipindi cha awali cha urefu sawa (' + esc(SI.data.prevWindow.label) + ')',
                growth === null ? '<span class="si-na">Denominator halali haipo</span>' : '', growth === null)
            + '</div>';
    }

    /* ---------- charts ---------- */
    function siBars(items, opt) {
        var valid = items.filter(function (i) { return i.value !== null && i.value !== undefined && Number.isFinite(Number(i.value)); });
        if (!valid.length) return '<p class="si-empty">Hakuna data ya kutosha kwa chart hii.</p>';
        var max = Math.max.apply(null, valid.map(function (i) { return Math.abs(Number(i.value)); })) || 1;
        return '<div class="si-bars' + (opt && opt.compact ? ' is-compact' : '') + '">' + valid.map(function (i) {
            var w = Math.max(1, Math.round(Math.abs(Number(i.value)) / max * 100));
            return '<div class="si-bar"><span class="si-bar-l" title="' + esc(i.title || i.label) + '">' + esc(i.label) + '</span>'
                + '<span class="si-bar-t"><span class="si-bar-f' + (i.zero ? ' is-zero' : '') + '" style="width:' + (i.zero ? 0 : w) + '%"></span></span>'
                + '<span class="si-bar-v">' + esc(i.text != null ? i.text : (opt && opt.fmt ? opt.fmt(i.value) : i.value)) + '</span></div>';
        }).join('') + '</div>';
    }

    function siCharts() {
        var d = SI.data;
        var b = siBucketSeries(d.series, SI.bucket);
        if (SI.bucket === 'day') b = b.slice().reverse();   // siku mpya kwanza (rahisi kusoma)
        var trend = siBars(b.map(function (x) { return { label: x.label, title: x.full + ' · ' + x.tx + ' transactions', value: x.gross, text: tzs(x.gross), zero: !(x.gross > 0) }; }), { fmt: tzs });
        var cur = d.mp, pos = d.posTotals;
        var cmp = siBars([
            { label: 'Kipindi hiki', value: cur.gross + pos.gross, text: tzs(cur.gross + pos.gross) },
            { label: 'Kilichopita', value: d.mpPrev.gross + (d.posState === 'ok' ? (d.posTotalsPrev.gross || 0) : 0), text: tzs(d.mpPrev.gross + (d.posState === 'ok' ? (d.posTotalsPrev.gross || 0) : 0)) }
        ], { fmt: tzs });
        var names = ['Jpili', 'Jtatu', 'Jnne', 'Jtano', 'Ijuma', 'Jmosi', 'Jmamosi'];
        var dow = siBars(d.dow.map(function (x) {
            return { label: names[x.dow], title: names[x.dow] + ' · ' + x.tx + ' transactions', value: x.gross, text: tzs(x.gross), zero: !(x.gross > 0) };
        }), { compact: true, fmt: tzs });
        var totalCat = d.cats.reduce(function (t, c) { return t + c.gross; }, 0);
        var cats = siBars(d.cats.slice(0, 8).map(function (c) {
            var share = totalCat > 0 ? (c.gross / totalCat * 100).toFixed(0) + '%' : '—';
            return { label: c.cat, title: c.cat + ' · ' + c.units + ' units · ' + share, value: c.gross, text: tzs(c.gross) + ' · ' + share, zero: !(c.gross > 0) };
        }), { fmt: tzs });
        return '<div class="si-charts">'
            + '<div class="si-chart"><b>Mwenendo (' + (SI.bucket === 'day' ? 'kila siku' : SI.bucket === 'week' ? 'kila wiki' : 'kila mwezi') + ')<small>mauzo ghafi</small></b>' + trend + '</div>'
            + '<div class="si-chart"><b>Kipindi hiki dhidi ya kilichopita<small>mauzo ghafi</small></b>' + cmp + '</div>'
            + '<div class="si-chart"><b>Siku za wiki<small>mauzo ghafi</small></b>' + dow + '</div>'
            + '<div class="si-chart"><b>Mauzo kwa category<small>mauzo ghafi · share</small></b>' + cats + '</div>'
            + '</div>';
    }

    function siWowMom() {
        var d = SI.data;
        function block(title, obj, sub) {
            var pct = siPct(obj.cur.gross, obj.prev.gross);
            return '<div class="si-cmp"><b>' + esc(title) + '</b>'
                + '<div class="si-kv"><span>Kipindi hiki</span><b>' + tzs(obj.cur.gross) + ' · ' + obj.cur.tx + ' transactions</b></div>'
                + '<div class="si-kv"><span>Kilichopita</span><b>' + tzs(obj.prev.gross) + ' · ' + obj.prev.tx + ' transactions</b></div>'
                + '<div class="si-kv"><span>Mabadiliko</span><b>' + (pct === null ? '<span class="si-na">Bila msingi (awali 0)</span>' : (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%') + '</b></div>'
                + '<small class="si-note">' + esc(sub) + '</small></div>';
        }
        return '<div class="si-cmps">'
            + block('Wiki hii dhidi ya wiki iliyopita', d.wow, d.wow.posOk ? 'Siku 7 za mwisho dhidi ya siku 7 zilizopita' : 'POS haipatikani — marketplace pekee')
            + block('Mwezi huu dhidi ya mwezi uliopita', d.mom, 'Siku ' + d.mom.days + ' za mwezi huu dhidi ya siku ' + d.mom.days + ' za mwezi uliopita' + (d.mom.posOk ? '' : ' · POS haipatikani'))
            + '</div>';
    }

    function siProducts() {
        var d = SI.data;
        function list(title, items, mode) {
            var body = items.length ? items.map(function (p, i) {
                var reason = mode === 'top'
                    ? 'Units ' + fmtQty(p.units) + (p.posUnits ? ' · POS ' + fmtQty(p.posUnits) : '') + (p.mpUnits ? ' · marketplace ' + fmtQty(p.mpUnits) : '')
                    : (p.tracked ? 'Stock ipo (' + fmtQty(p.avail) + ' ' + (p.unitLabel || '') + ') lakini units 0' : 'Hakuna mauzo; stock haifuatiliwi');
                return '<div class="si-prod" data-si-prod="' + esc(p.id) + '">'
                    + '<span class="si-rank">' + (i + 1) + '</span>'
                    + '<span class="si-prod-b"><b>' + esc(p.title) + '</b><small>' + esc(p.category || 'N/A') + ' · ' + esc(reason) + '</small></span>'
                    + '<span class="si-prod-v">' + (mode === 'top' ? tzs(p.gross) : '0') + '<small>' + esc(SI.data.window.label) + '</small></span>'
                    + '</div>';
            }).join('') : '<p class="si-empty">' + (mode === 'top' ? 'Hakuna mauzo kwenye kipindi hiki.' : 'Hakuna bidhaa inayosonga polepole kwenye kipindi hiki.') + '</p>';
            return '<div class="si-card"><b>' + esc(title) + '</b>' + body + '</div>';
        }
        return '<div class="si-prods">'
            + list('Bidhaa zinazoongoza (' + d.window.label + ')', d.top, 'top')
            + list('Bidhaa zinazosonga polepole (units 0, stock ipo, si mpya)', d.slow, 'slow')
            + '</div>';
    }

    function siBody() {
        if (SI.loading) return '<p class="si-loading">Inakusanya data ya mauzo...</p>';
        if (SI.error) return '<div class="si-err"><b>Hitilafu:</b> ' + esc(SI.error) + '</div>';
        if (!SI.data) return '<p class="si-empty">Hakuna data bado.</p>';
        var d = SI.data;
        var hasSales = d.mp.gross > 0 || (d.posState === 'ok' && d.posTotals.gross > 0);
        var ranges = [['today', 'Leo'], ['7d', 'Siku 7'], ['30d', 'Siku 30'], ['month', 'Mwezi huu'], ['3m', 'Miezi 3'], ['custom', 'Kipindi maalum']];
        return '<div class="si-shell">'
            + '<div class="si-top"><div><h2>Maarifa ya Mauzo</h2>'
            + '<p>Kipindi: <b>' + esc(d.window.label) + '</b> · kilichopita: ' + esc(d.prevWindow.label)
            + ' · vyanzo: orders (marketplace) · ' + (d.posState === 'ok' ? 'posReports (POS)' : '<span class="si-na">posReports haipatikani</span>') + '</p></div>'
            + '<div class="si-tools">'
            + '<select aria-label="Kipindi" onchange="window.skhSiRange(this.value)">' + ranges.map(function (r) { return '<option value="' + r[0] + '"' + (SI.range === r[0] ? ' selected' : '') + '>' + esc(r[1]) + '</option>'; }).join('') + '</select>'
            + (SI.range === 'custom' ? '<input type="date" value="' + esc(SI.from) + '" onchange="window.skhSiCustom(this.value,null)"><input type="date" value="' + esc(SI.to) + '" onchange="window.skhSiCustom(null,this.value)">' : '')
            + '<select aria-label="Chanzo" onchange="window.skhSiSource(this.value)">' + SI_SOURCES.map(function (s) { return '<option value="' + s[0] + '"' + (SI.source === s[0] ? ' selected' : '') + '>' + esc(s[1]) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Mwenendo" onchange="window.skhSiBucket(this.value)">'
            + [['day', 'Kila siku'], ['week', 'Kila wiki'], ['month', 'Kila mwezi']].map(function (b) { return '<option value="' + b[0] + '"' + (SI.bucket === b[0] ? ' selected' : '') + '>' + esc(b[1]) + '</option>'; }).join('') + '</select>'
            + '</div></div>'
            + (d.posState !== 'ok' ? '<div class="si-warn">POS haipatikani (' + esc(d.posReason) + ') — takwimu ni za marketplace pekee; mauzo halisi (net) na AOV(net) ni Haipatikani, si 0.</div>' : '')
            + (hasSales ? '' : '<div class="si-zero">Kipindi hiki hakina mauzo yaliyokamilika — hii ni <b>sifuri halisi</b>, si data inayokosekana. Chart zinaonyesha siku zote za kipindi.</div>')
            + siKpiCards()
            + siWowMom()
            + siCharts()
            + siProducts()
            + '<p class="si-foot">Transactions = POS <code>completedSales</code> + oda za marketplace zilizokamilika (hazihesabiwi mara mbili: POS haihifadhi <code>orderId</code>). Mauzo halisi (net) ya POS = ghafi − returns − void. Refunds za marketplace hazithibitishiki kwa bidhaa/oda → hayakadiriwi. Siku zisizo na mauzo ni 0, si "hakuna data".</p>'
            + '</div>';
    }

    function siShellLoading() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">Inakusanya data ya mauzo...</p>';
    }
    function siRender() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = siBody();
    }

    /* ---------- handlers ---------- */
    window.skhSiRange = async function (r) { SI.range = r || '30d'; if (r === 'custom' && (!SI.from || !SI.to)) SI.range = '30d'; await siLoad(); siRender(); };
    window.skhSiCustom = async function (from, to) {
        if (from) SI.from = from; if (to) SI.to = to;
        if (!SI.from || !SI.to) return;
        SI.range = 'custom'; await siLoad(); siRender();
    };
    window.skhSiSource = function (s) { SI.source = s || 'all'; siRender(); };
    window.skhSiBucket = function (b) { SI.bucket = b || 'day'; siRender(); };

    window.skhRenderSalesInsights = async function () {
        await siLoad();
        siRender();
        return true;
    };
    /* [SALES 2026-11-03] Mwonekano wa awali umehifadhiwa kama legacy (hakuna kuondoa). */

    /* ---------- styles ---------- */
    function siEnsureStyles() {
        if (document.getElementById('skhSiStyles')) return;
        var css = ''
            + '.si-shell{text-align:left;font-family:inherit;}'
            + '.si-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;}'
            + '.si-top h2{margin:0;font-size:19px;color:#18352D;font-weight:900;}'
            + '.si-top p{margin:3px 0 0;font-size:11.5px;color:#64748b;font-weight:700;}'
            + '.si-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}'
            + '.si-tools select,.si-tools input{border:1px solid #D6E6DF;border-radius:9px;padding:7px 8px;font-size:11.5px;font-weight:800;color:#18352D;background:#fff;}'
            + '.si-warn{background:#FBF6E3;border:1px solid #EFE3B8;color:#8A6B16;border-radius:10px;padding:8px 10px;font-size:11.5px;font-weight:800;margin-bottom:8px;}'
            + '.si-zero{background:#EAF2F7;border:1px solid #CFE0EA;color:#2E6C86;border-radius:10px;padding:8px 10px;font-size:11.5px;font-weight:800;margin-bottom:8px;}'
            + '.si-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}'
            + '.si-kpi{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:2px;}'
            + '.si-kpi.is-na{background:#FCFCFB;}'
            + '.si-kpi small{font-size:9.5px;color:#7E9A91;font-weight:900;text-transform:uppercase;letter-spacing:.02em;}'
            + '.si-kpi b{font-size:17px;color:#18352D;font-weight:900;line-height:1.2;}'
            + '.si-kpi.is-na b{color:#A7BCB3;}'
            + '.si-kpi-sub{font-size:10px;color:#8FA69D;font-weight:800;}'
            + '.si-kpi-d{font-size:11px;font-weight:900;}'
            + '.si-up{color:#18A982;}'
            + '.si-down{color:#D9534F;}'
            + '.si-na{color:#A7BCB3;font-style:italic;font-weight:800;}'
            + '.si-cmps{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}'
            + '.si-cmp{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;}'
            + '.si-cmp>b{display:block;font-size:12px;color:#18352D;font-weight:900;margin-bottom:6px;}'
            + '.si-kv{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #F1F5F3;padding:3px 0;font-size:10.5px;}'
            + '.si-kv span{color:#7E9A91;font-weight:800;}'
            + '.si-kv b{color:#18352D;font-weight:900;text-align:right;}'
            + '.si-note{font-size:10px;color:#8FA69D;font-weight:800;}'
            + '.si-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px;}'
            + '.si-chart{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;}'
            + '.si-chart>b{display:flex;justify-content:space-between;gap:6px;font-size:11.5px;color:#18352D;font-weight:900;margin-bottom:7px;}'
            + '.si-chart>b small{font-size:9.5px;color:#8FA69D;font-weight:800;}'
            + '.si-bars{display:flex;flex-direction:column;gap:4px;max-height:230px;overflow-y:auto;}'
            + '.si-bar{display:grid;grid-template-columns:56px 1fr 92px;gap:6px;align-items:center;}'
            + '.si-bar-l{font-size:9.5px;color:#526962;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
            + '.si-bar-t{height:9px;background:#EAF2EE;border-radius:999px;overflow:hidden;}'
            + '.si-bar-f{display:block;height:100%;background:#18A982;border-radius:999px;}'
            + '.si-bar-f.is-zero{background:transparent;}'
            + '.si-bar-v{font-size:9.5px;color:#18352D;font-weight:900;text-align:right;}'
            + '.si-bars.is-compact .si-bar{grid-template-columns:44px 1fr 92px;}'
            + '.si-prods{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}'
            + '.si-card{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;}'
            + '.si-card>b{display:block;font-size:12px;color:#18352D;font-weight:900;margin-bottom:6px;}'
            + '.si-prod{display:flex;gap:8px;align-items:center;border-bottom:1px solid #F1F5F3;padding:5px 0;}'
            + '.si-rank{width:18px;height:18px;flex:0 0 18px;border-radius:50%;background:#EAF8F2;color:#17604E;font-size:9.5px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;}'
            + '.si-prod-b{flex:1;min-width:0;display:flex;flex-direction:column;}'
            + '.si-prod-b b{font-size:11.5px;color:#18352D;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
            + '.si-prod-b small{font-size:9.5px;color:#8FA69D;font-weight:800;}'
            + '.si-prod-v{font-size:11.5px;color:#17604E;font-weight:900;text-align:right;display:flex;flex-direction:column;}'
            + '.si-prod-v small{font-size:9px;color:#A7BCB3;font-weight:800;}'
            + '.si-empty,.si-loading{font-size:11.5px;color:#8FA69D;font-weight:800;padding:12px;text-align:center;margin:0;}'
            + '.si-err{background:#FDF1F0;border:1px solid #F3D6D5;color:#B33B37;border-radius:10px;padding:10px;font-size:12px;}'
            + '.si-foot{font-size:10px;color:#8FA69D;font-weight:800;margin:8px 0 0;line-height:1.6;}'
            + '.si-foot code{background:#F1F5F3;border-radius:4px;padding:0 3px;}'
            + '@media (max-width:900px){.si-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}.si-charts,.si-prods,.si-cmps{grid-template-columns:1fr;}}'
            + '@media (max-width:480px){.si-kpis{grid-template-columns:1fr 1fr;}.si-bar{grid-template-columns:48px 1fr 84px;}}';
        var st = document.createElement('style');
        st.id = 'skhSiStyles';
        st.textContent = css;
        document.head.appendChild(st);
    }
    siEnsureStyles();

    /* ---------- test API ---------- */
    window.skhSi = {
        state: function () { return { range: SI.range, bucket: SI.bucket, source: SI.source, loading: SI.loading, error: SI.error }; },
        window: function () { return SI.data ? SI.data.window : null; },
        data: function () { return SI.data; },
        scope: function (s) { return siScopeTotals(s || SI.source); },
        bps: function () { return SI.data ? siBucketSeries(SI.data.series, SI.bucket) : null; },
        dow: function () { return SI.data ? SI.data.dow : null; },
        wow: function () { return SI.data ? SI.data.wow : null; },
        mom: function () { return SI.data ? SI.data.mom : null; },
        top: function () { return SI.data ? SI.data.top.map(function (p) { return { id: p.id, units: p.units, gross: p.gross }; }) : null; },
        slow: function () { return SI.data ? SI.data.slow.map(function (p) { return { id: p.id, avail: p.avail, newProduct: p.newProduct }; }) : null; },
        cats: function () { return SI.data ? SI.data.cats : null; },
        setRange: async function (r) { await window.skhSiRange(r); },
        source: function (s) { window.skhSiSource(s); },
        bucket: function (b) { window.skhSiBucket(b); }
    };

    // ---------- 4. DEMAND INSIGHTS (legacy, imehifadhiwa) ----------
    /* [DEMAND 2026-11-03] Uainishaji wa awali umehifadhiwa kama legacy function;
       hakuna function iliyoondolewa. Dashboard mpya ya ishara iko hapa chini. */
    window.skhRenderDemandInsightsLegacy = async function () {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">' + T('smp_analyzing_demand', 'Analyzing demand...') + '</p>';
        await loadSellerMetrics();
        var rows = META.rows.slice();
        var nowMs = Date.now();

        // Thresholds (zinazoweza kubadilishwa)
        var HIGH_VIEWS = 500, HIGH_UNITS = 10, HIGH_SAVES = 20;
        var SLOW_DAYS = 30, LOW_VIEWS = 100;

        var insights = rows.map(function (r) {
            var ageDays = r.createdAt ? Math.max(0, (nowMs - new Date(r.createdAt).getTime()) / 86400000) : 0;
            var level, reason, reco;
            if (ageDays < 7 && r.units === 0 && r.views < HIGH_VIEWS) {
                level = 'new'; reason = T('smp_reason_new', 'New product — not enough data yet.'); reco = T('smp_reco_new', 'Wait for more data before changing anything.');
            } else if (r.views >= HIGH_VIEWS && (r.units >= HIGH_UNITS || r.saves >= HIGH_SAVES)) {
                level = 'high'; reason = T('smp_reason_high', 'High views and sales/saves — stock is moving well.'); reco = T('smp_reco_high', 'Demand is high. Consider increasing stock.');
            } else if (ageDays >= SLOW_DAYS && r.views < LOW_VIEWS && r.units === 0) {
                level = 'slow'; reason = T('smp_reason_slow', 'Sitting for many days with low views and sales.'); reco = T('smp_reco_slow', 'Moving slowly. Lower price, improve photos or promote it.');
            } else {
                level = 'moderate'; reason = T('smp_reason_mod', 'Moderate interest or moderate sales.'); reco = T('smp_reco_mod', 'Improve price or promotion to increase sales.');
            }
            return Object.assign({}, r, { level: level, reason: reason, reco: reco });
        });

        var levels = { high: [T('smp_high_demand', 'High Demand'), '#dc2626', 'background:#fef2f2;border-left:4px solid #dc2626;'], moderate: [T('smp_moderate', 'Moderate Demand'), '#d97706', 'background:#fffbeb;border-left:4px solid #d97706;'], slow: [T('smp_slow_level', 'Slow Moving'), '#64748b', 'background:#f8fafc;border-left:4px solid #64748b;'], new: [T('smp_new_level', 'New (data limited)'), '#2563eb', 'background:#eff6ff;border-left:4px solid #2563eb;'] };
        var orderMap = { high: 0, moderate: 1, slow: 2, new: 3 };
        insights.sort(function (a, b) { return orderMap[a.level] - orderMap[b.level]; });

        ws.innerHTML = `
        <div style="text-align:left; animation: fadeIn 0.3s ease;"> <h2 style="margin:0 0 4px;font-size:19px;color:#0f172a;">${T('smp_prod_insights', 'Product Insights')}</h2> <p style="margin:0 0 14px;color:#64748b;font-size:12px;">${T('smp_insights_sub', 'Classification is based on real data — views, sales, saves, listing age and stock.')}</p>
            ${insights.length ? insights.map(function (r) {
                var L = levels[r.level];
                return '<div style="' + L[2] + 'border-radius:12px;padding:12px;margin-bottom:10px;">'
                    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">'
                    + '<b style="font-size:13px;color:#0f172a;">' + esc(r.title) + '</b>'
                    + '<span style="font-size:12.5px;font-weight:900;color:' + L[1] + ';text-transform:uppercase;">' + L[0] + '</span></div>'
                    + '<div style="font-size:13px;color:#64748b;margin:4px 0;">' + esc(r.reason) + '</div>'
                    + '<div style="font-size:12px;color:#0f172a;background:rgba(255,255,255,0.7);border-radius:8px;padding:8px;">' + T('smp_suggestion', 'Suggestion') + ': ' + esc(r.reco) + '</div>'
                    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">'
                    + statPill(T('pm_views', 'Views'), r.views.toLocaleString())
                    + statPill(T('smp_sold', 'Sold'), r.units.toLocaleString())
                    + statPill(T('smp_saves', 'Saves'), r.saves.toLocaleString())
                    + statPill(T('smp_stock_btn', 'Stock'), r.stock.toLocaleString())
                    + '</div></div>';
            }).join('') : empty(T('smp_no_products', 'No products yet.'))}
        </div>`;
    };

    // ---------- 4. DEMAND INSIGHTS [2026-11-03] ----------
    /* Ishara za mahitaji — aina tofauti zinazoonyeshwa kwa wazi, bila kuchanganya:
         1) Utafutaji (marketplace-wide; events ≤250, siku 14 za mwisho)
         2) Views / Saves (maisha yote ya bidhaa — si ya kipindi)
         3) Ununuzi (units za kipindi: marketplace + POS net)
         4) Pengo la upatikanaji (stock 0 wakati kuna ishara)
       Hakuna mahali/geo (hakuna data ya eneo), hakuna cart events, hakuna
       mapendekezo ya kuagiza yaliyobuniwa. "Mahitaji yasiyotimizwa" ≠ fursa. */
    var DI = { range: '30d', from: '', to: '', cat: '', trend: '', avail: '', q: '', loading: false, error: null, data: null };
    var DI_NA_GEO = 'Hakuna data ya eneo (mkoa/mji) kwenye mfumo — hakuna uchambuzi wa kijiografia.';
    var DI_CUTOFF_DAYS = 14;
    var DI_TERM_LIMIT = 250;

    function diWindow(range) {
        var now = new Date();
        var start = startOfDayLocal(now), end = new Date(now.getTime()), label = 'Leo';
        if (range === '7d') { start = startOfDayLocal(now); start.setDate(start.getDate() - 6); label = 'Siku 7'; }
        else if (range === '30d') { start = startOfDayLocal(now); start.setDate(start.getDate() - 29); label = 'Siku 30'; }
        else if (range === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); label = 'Mwezi huu'; }
        else if (range === '3m') { start = startOfDayLocal(now); start.setDate(start.getDate() - 89); label = 'Miezi 3'; }
        var span = Math.max(86400000, end.getTime() - start.getTime());
        return { range: range, start: start, end: end, label: label, prevStart: new Date(start.getTime() - span), prevEnd: new Date(start.getTime()), days: Math.round(span / 86400000) };
    }

    /* maandishi: ulinganisho wa moja kwa moja (hakuna fuzzy/inference) */
    function diMatch(term, p) {
        var t = String(term || '').toLowerCase().trim();
        if (t.length < 3) return false;
        var hay = [p.title, p.sku, p.barcode, p.category].map(function (v) { return String(v || '').toLowerCase(); }).join(' | ');
        return hay.indexOf(t) !== -1;
    }

    async function diLoad() {
        DI.loading = true; DI.error = null;
        diShellLoading();
        try {
            if (!META) await loadSellerMetrics();
            var win = diWindow(DI.range);

            /* 1) ishara za utafutaji (marketplace-wide) */
            var terms = [], searchState = 'unavailable', searchReason = '';
            try {
                if (typeof skh.loadMarketSearchSignals === 'function') {
                    terms = await skh.loadMarketSearchSignals() || [];
                    searchState = terms.length ? 'ok' : 'empty';
                    if (!terms.length) searchReason = 'hakuna search events zilizorekodiwa katika siku ' + DI_CUTOFF_DAYS + ' zilizopita';
                } else {
                    searchReason = 'search signals haipatikani kwenye toleo hili';
                }
            } catch (e) { searchState = 'error'; searchReason = String((e && e.message) || e); }
            var cutoff = Date.now() - DI_CUTOFF_DAYS * 86400000;
            terms = terms.filter(function (t) { return t && t.query && Date.parse(t.at || 0) >= cutoff; }).slice(0, DI_TERM_LIMIT);
            var termCounts = {};
            terms.forEach(function (t) { var q = String(t.query).toLowerCase(); termCounts[q] = (termCounts[q] || 0) + 1; });
            var topTerms = Object.keys(termCounts).map(function (q) { return { query: q, n: termCounts[q] }; })
                .sort(function (a, b) { return b.n - a.n; }).slice(0, 12);

            /* 3) ununuzi wa kipindi */
            var mpAgg = pfOrderAgg(win);
            var mpPrev = pfOrderAgg({ start: win.prevStart, end: win.prevEnd });
            var posState = 'unavailable', posReason = '', posAgg = {}, posPrevAgg = {};
            var res = await callPosReport(win);
            if (res.ok) { posState = 'ok'; posAgg = pfPosAgg(res.report); var rp = await callPosReport({ start: win.prevStart, end: win.prevEnd }); if (rp.ok) posPrevAgg = pfPosAgg(rp.report); }
            else { posState = 'error'; posReason = res.reason || 'haipatikani'; }

            var rows = (META && META.rows) || [];
            var recs = rows.map(function (r) {
                var raw = (META.raw && META.raw[r.id]) || {};
                var mp = mpAgg[r.id] || { units: 0, revenue: 0 };
                var p = posAgg[r.id] || null;
                var units = mp.units + (p ? p.net : 0);
                var prevUnits = (mpPrev[r.id] ? mpPrev[r.id].units : 0) + (posPrevAgg[r.id] ? posPrevAgg[r.id].net : 0);
                var matched = terms.filter(function (t) { return diMatch(t.query, { title: r.title, sku: r.sku, barcode: r.barcode, category: r.category }); });
                var searches = matched.length;
                var views = Number(r.views) || 0;
                var saves = Number(r.saves) || 0;
                var avail = r.stockInfo && r.stockInfo.tracked ? r.stockInfo.available : null;
                var tracked = !!(r.stockInfo && r.stockInfo.tracked);
                var gap = (avail !== null && avail <= 0) && (searches > 0 || views > 0);
                var trend = prevUnits > 0 ? (units - prevUnits) / prevUnits : null;
                var conf = (searches > 0 && units > 0) ? 'high' : ((searches > 0 || views > 0 || units > 0) ? 'medium' : 'low');
                return {
                    id: r.id, title: r.title, category: r.category || 'N/A', sku: r.sku,
                    searches: searches, terms: matched.map(function (t) { return String(t.query); }).slice(0, 4),
                    views: views, saves: saves, units: units, prevUnits: prevUnits, trend: trend,
                    avail: avail, tracked: tracked, gap: gap, confidence: conf,
                    posUnits: p ? p.net : 0, mpUnits: mp.units, ageDays: (pfIsNew(r).ageDays)
                };
            });

            var unmatched = topTerms.filter(function (t) {
                return !rows.some(function (r) { return diMatch(t.query, { title: r.title, sku: r.sku, barcode: r.barcode, category: r.category }); });
            });

            DI.data = {
                window: win, prevWindow: { label: win.prevStart.toISOString().slice(0, 10) + ' → ' + win.prevEnd.toISOString().slice(0, 10) },
                recs: recs, terms: topTerms, unmatched: unmatched, termTotal: terms.length,
                searchState: searchState, searchReason: searchReason,
                posState: posState, posReason: posReason,
                matchedTotal: recs.reduce(function (t, x) { return t + x.searches; }, 0)
            };
            DI.loading = false;
        } catch (e) {
            DI.loading = false; DI.error = String((e && e.message) || e); DI.data = null;
        }
    }

    function diFiltered() {
        if (!DI.data) return [];
        var list = DI.data.recs.slice();
        if (DI.cat) list = list.filter(function (x) { return String(x.category) === DI.cat; });
        if (DI.trend === 'up') list = list.filter(function (x) { return x.trend !== null && x.trend > 0; });
        else if (DI.trend === 'down') list = list.filter(function (x) { return x.trend !== null && x.trend < 0; });
        else if (DI.trend === 'none') list = list.filter(function (x) { return x.trend === null; });
        if (DI.avail === 'out') list = list.filter(function (x) { return x.tracked && x.avail <= 0; });
        else if (DI.avail === 'in') list = list.filter(function (x) { return x.tracked && x.avail > 0; });
        else if (DI.avail === 'untracked') list = list.filter(function (x) { return !x.tracked; });
        var q = String(DI.q || '').trim().toLowerCase();
        if (q) list = list.filter(function (x) { return [x.title, x.sku, x.category].some(function (v) { return v && String(v).toLowerCase().indexOf(q) !== -1; }); });
        list.sort(function (a, b) { return (b.searches - a.searches) || (b.units - a.units) || (b.views - a.views); });
        return list;
    }

    function diTrendTxt(x) {
        if (x.trend === null) return '<span class="di-na">bila msingi</span>';
        var up = x.trend >= 0;
        return '<span class="' + (up ? 'di-up' : 'di-down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(x.trend * 100).toFixed(0) + '%</span>';
    }

    function diTable() {
        var list = diFiltered();
        if (!list.length) return '<p class="di-empty-box">Hakuna bidhaa inayolingana na vichujio hivi.</p>';
        return '<div class="di-table-wrap"><table class="di-table"><thead><tr>'
            + '<th>Bidhaa</th><th>Category</th><th>Utafutaji (siku ' + DI_CUTOFF_DAYS + ')</th><th>Views (maisha yote)</th><th>Saves</th><th>Units (' + esc(DI.data.window.label) + ')</th><th>Stock</th><th>Mwenendo</th><th>Uhakika</th><th>Ishara</th>'
            + '</tr></thead><tbody>' + list.map(function (x) {
                var stock = x.tracked ? fmtQty(x.avail) : '<span class="di-na">bila tracking</span>';
                var signals = [];
                if (x.searches > 0) signals.push('utafutaji ' + x.searches);
                if (x.views > 0) signals.push('views');
                if (x.units > 0) signals.push('ununuzi');
                if (x.gap) signals.push('pengo la stock');
                return '<tr class="di-row" data-di-row="' + esc(x.id) + '">'
                    + '<td class="di-name">' + esc(x.title) + '<small>' + esc(x.sku || 'Haijawekwa') + '</small></td>'
                    + '<td>' + esc(x.category) + '</td>'
                    + '<td>' + (x.searches > 0 ? x.searches : '<span class="di-na">0</span>') + (x.terms.length ? '<small class="di-terms">' + esc(x.terms.join(', ')) + '</small>' : '') + '</td>'
                    + '<td>' + x.views.toLocaleString() + '</td>'
                    + '<td>' + x.saves.toLocaleString() + '</td>'
                    + '<td>' + fmtQty(x.units) + '</td>'
                    + '<td class="' + (x.gap ? 'di-bad' : '') + '">' + stock + '</td>'
                    + '<td>' + diTrendTxt(x) + '</td>'
                    + '<td>' + '<span class="di-conf is-' + x.confidence + '">' + (x.confidence === 'high' ? 'Kamili' : x.confidence === 'medium' ? 'Kati' : 'Pungufu') + '</span></td>'
                    + '<td class="di-sig">' + (signals.length ? esc(signals.join(' · ')) : '<span class="di-na">hakuna</span>') + '</td>'
                    + '</tr>';
            }).join('') + '</tbody></table></div>';
    }

    function diChart(title, unit, items, fmt) {
        var valid = items.filter(function (i) { return Number(i.value) > 0 || i.value === 0; });
        if (!valid.length) return '<div class="di-chart"><b>' + esc(title) + '</b><p class="di-empty">Hakuna data ya kutosha.</p></div>';
        var max = Math.max.apply(null, valid.map(function (i) { return Number(i.value) || 0; })) || 1;
        return '<div class="di-chart"><b>' + esc(title) + '<small>' + esc(unit) + '</small></b>' + valid.map(function (i) {
            var w = Math.max(1, Math.round((Number(i.value) || 0) / max * 100));
            return '<div class="di-bar"><span class="di-bar-l">' + esc(i.label) + '</span><span class="di-bar-t"><span class="di-bar-f' + (i.zero ? ' is-zero' : '') + '" style="width:' + (i.zero ? 0 : w) + '%"></span></span><span class="di-bar-v">' + esc(fmt(i.value)) + '</span></div>';
        }).join('') + '</div>';
    }

    function diBody() {
        if (DI.loading) return '<p class="di-loading">Inakusanya ishara za mahitaji...</p>';
        if (DI.error) return '<div class="di-err"><b>Hitilafu:</b> ' + esc(DI.error) + '</div>';
        if (!DI.data) return '<p class="di-empty">Hakuna data bado.</p>';
        var d = DI.data;
        var cats = {};
        d.recs.forEach(function (x) { if (x.category && x.category !== 'N/A') cats[x.category] = true; });
        var bySearch = d.recs.slice().sort(function (a, b) { return b.searches - a.searches; }).slice(0, 8);
        var byViews = d.recs.slice().sort(function (a, b) { return b.views - a.views; }).slice(0, 8);
        var byUnits = d.recs.slice().sort(function (a, b) { return b.units - a.units; }).slice(0, 8);
        var gaps = d.recs.filter(function (x) { return x.gap; });
        var ranges = [['today', 'Leo'], ['7d', 'Siku 7'], ['30d', 'Siku 30'], ['month', 'Mwezi huu'], ['3m', 'Miezi 3']];
        return '<div class="di-shell">'
            + '<div class="di-top"><div><h2>Mahitaji ya Soko</h2>'
            + '<p>Ishara zinazoonekana: <b>utaftutaji</b> (soko la mtandaoni, siku ' + DI_CUTOFF_DAYS + ') · <b>views/saves</b> (maisha yote) · <b>ununuzi</b> (' + esc(d.window.label) + ') · <b>pengo la stock</b>. Aina hizi <b>haziunganishwi</b> kuwa "mahitaji" moja.</p>'
            + '<p><b>Kumbuka:</b> ishara hizi ni za <b>duka lako mwenyewe</b> (bidhaa zako, utaftutaji unaogusa bidhaa zako na mauzo yako) — <b>si</b> kipimo cha mahitaji ya soko kwa ujumla.</p></div>'
            + '<div class="di-tools">'
            + '<input type="search" value="' + esc(DI.q) + '" placeholder="Tafuta bidhaa..." oninput="window.skhDiFilter(\'q\',this.value)">'
            + '<select aria-label="Kipindi" onchange="window.skhDiRange(this.value)">' + ranges.map(function (r) { return '<option value="' + r[0] + '"' + (DI.range === r[0] ? ' selected' : '') + '>' + esc(r[1]) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Category" onchange="window.skhDiFilter(\'cat\',this.value)"><option value="">Kategoria zote</option>' + Object.keys(cats).sort().map(function (c) { return '<option value="' + esc(c) + '"' + (DI.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Mwenendo" onchange="window.skhDiFilter(\'trend\',this.value)"><option value="">Mwenendo wote</option>'
            + [['up', 'Inapanda'], ['down', 'Inashuka'], ['none', 'Bila msingi']].map(function (o) { return '<option value="' + o[0] + '"' + (DI.trend === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Upatikanaji" onchange="window.skhDiFilter(\'avail\',this.value)"><option value="">Upatikanaji wote</option>'
            + [['in', 'Stock ipo'], ['out', 'Stock imeisha'], ['untracked', 'Bila tracking']].map(function (o) { return '<option value="' + o[0] + '"' + (DI.avail === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'
            + '<button type="button" class="di-link" onclick="window.skhDiClear()">Safisha</button>'
            + '</div></div>'
            + (d.searchState !== 'ok' ? '<div class="di-warn">Ishara za utafutaji: <b>Haipatikani</b> — ' + esc(d.searchReason || 'hakuna events') + '. Views na ununuzi bado vinaonyeshwa.</div>' : '')
            + (d.posState !== 'ok' ? '<div class="di-warn">POS haipatikani (' + esc(d.posReason) + ') — units ni za marketplace pekee.</div>' : '')
            + '<div class="di-cards">'
            + '<div class="di-card"><small>Search events (siku ' + DI_CUTOFF_DAYS + ', marketplace)</small><b>' + (d.searchState === 'ok' ? d.termTotal : 'Haipatikani') + '</b><span>kikomo ' + DI_TERM_LIMIT + ' events</span></div>'
            + '<div class="di-card"><small>Maneno yaliyolingana na bidhaa zako</small><b>' + (d.searchState === 'ok' ? d.matchedTotal : 'Haipatikani') + '</b><span>ulinganisho wa maandishi (title/SKU/category)</span></div>'
            + '<div class="di-card"><small>Bidhaa zenye pengo la stock</small><b>' + gaps.length + '</b><span>stock 0 wakati kuna ishara</span></div>'
            + '<div class="di-card"><small>Bidhaa zilizoangaliwa</small><b>' + d.recs.length + '</b><span>' + esc(d.window.label) + '</span></div>'
            + '</div>'
            + '<div class="di-charts">'
            + diChart('Utaftutaji uliolingana (siku ' + DI_CUTOFF_DAYS + ')', 'events', bySearch.map(function (x) { return { label: x.title, value: x.searches, zero: x.searches === 0 }; }), fmtQty)
            + diChart('Views (maisha yote)', 'views', byViews.map(function (x) { return { label: x.title, value: x.views, zero: x.views === 0 }; }), fmtQty)
            + diChart('Ununuzi (' + d.window.label + ')', 'units', byUnits.map(function (x) { return { label: x.title, value: x.units, zero: x.units === 0 }; }), fmtQty)
            + '</div>'
            + '<div class="di-panels">'
            + '<div class="di-panel"><b>Maneno yanayotafutwa (marketplace, siku ' + DI_CUTOFF_DAYS + ')</b>'
            + (d.terms.length ? d.terms.map(function (t) {
                var m = d.recs.some(function (r) { return diMatch(t.query, { title: r.title, sku: r.sku, category: r.category }); });
                return '<div class="di-term"><span>' + esc(t.query) + '</span><b>' + t.n + '</b><small>' + (m ? 'linapolingana na bidhaa yako' : 'halipatani na bidhaa yako') + '</small></div>';
            }).join('') : '<p class="di-empty">Haipatikani — hakuna search events zilizorekodiwa.</p>')
            + '<p class="di-note">Search ni ya marketplace kwa ujumla (watumiaji wote) — si ya wateja wako, na haihusiani na mtu binafsi.</p></div>'
            + '<div class="di-panel"><b>Pengo la upatikanaji (' + gaps.length + ')</b>'
            + (gaps.length ? gaps.map(function (x) {
                return '<div class="di-gap"><b>' + esc(x.title) + '</b><small>Stock 0 · utaftutaji ' + x.searches + ' · views ' + x.views.toLocaleString() + ' · units ' + fmtQty(x.units) + '</small>'
                    + '<button type="button" class="di-btn" onclick="window.skhMPStock(\'' + js(x.id) + '\',' + (Number(x.avail) || 0) + ')">Stock (POS)</button></div>';
            }).join('') : '<p class="di-empty">Hakuna bidhaa yenye stock 0 na ishara.</p>')
            + '<p class="di-note">Pengo la stock ni <b>ukweli wa upatikanaji</b>, si uthibitisho wa fursa wala kiasi cha kuagiza.</p></div>'
            + '</div>'
            + diTable()
            + '<p class="di-foot">Mbinu: utafutaji = events za <code>recommendationEvents(type=search)</code> zenye kikomo ' + DI_TERM_LIMIT + ', siku ' + DI_CUTOFF_DAYS + ', zinalinganishwa kwa maandishi (substring) na jina/SKU/category ya bidhaa yako. Views/saves ni za maisha yote ya bidhaa (hazichujwi kwa kipindi). Units = marketplace + POS net. ' + DI_NA_GEO + ' Hakuna data ya wateja/beacon/cart — hakuna ishara hizo.</p>'
            + '</div>';
    }

    function diShellLoading() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">Inakusanya ishara za mahitaji...</p>';
    }
    function diRender() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = diBody();
    }

    window.skhDiRange = async function (r) { DI.range = r || '30d'; await diLoad(); diRender(); };
    window.skhDiFilter = function (k, v) { DI[k] = v; diRender(); };
    window.skhDiClear = function () { DI.q = ''; DI.cat = ''; DI.trend = ''; DI.avail = ''; diRender(); };

    window.skhRenderDemandInsights = async function () {
        await diLoad();
        diRender();
        return true;
    };

    /* ---------- styles ---------- */
    function diEnsureStyles() {
        if (document.getElementById('skhDiStyles')) return;
        var css = ''
            + '.di-shell{text-align:left;font-family:inherit;}'
            + '.di-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;}'
            + '.di-top h2{margin:0;font-size:19px;color:#18352D;font-weight:900;}'
            + '.di-top p{margin:3px 0 0;font-size:11.5px;color:#64748b;font-weight:700;max-width:640px;}'
            + '.di-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}'
            + '.di-tools input,.di-tools select{border:1px solid #D6E6DF;border-radius:9px;padding:7px 8px;font-size:11.5px;font-weight:800;background:#fff;color:#18352D;}'
            + '.di-tools input[type=search]{font-weight:600;min-width:150px;}'
            + '.di-link{background:none;border:none;color:#2E6C86;font-weight:900;font-size:11.5px;text-decoration:underline;cursor:pointer;}'
            + '.di-warn{background:#FBF6E3;border:1px solid #EFE3B8;color:#8A6B16;border-radius:10px;padding:8px 10px;font-size:11.5px;font-weight:800;margin-bottom:8px;}'
            + '.di-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}'
            + '.di-card{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;}'
            + '.di-card small{display:block;font-size:9.5px;color:#7E9A91;font-weight:900;text-transform:uppercase;}'
            + '.di-card b{display:block;font-size:17px;color:#18352D;font-weight:900;}'
            + '.di-card span{font-size:9.5px;color:#8FA69D;font-weight:800;}'
            + '.di-charts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}'
            + '.di-chart{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;}'
            + '.di-chart>b{display:flex;justify-content:space-between;gap:6px;font-size:11px;color:#18352D;font-weight:900;margin-bottom:6px;}'
            + '.di-chart>b small{font-size:9.5px;color:#8FA69D;font-weight:800;}'
            + '.di-bar{display:grid;grid-template-columns:58px 1fr 42px;gap:6px;align-items:center;margin-bottom:4px;}'
            + '.di-bar-l{font-size:9.5px;color:#526962;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
            + '.di-bar-t{height:8px;background:#EAF2EE;border-radius:999px;overflow:hidden;}'
            + '.di-bar-f{display:block;height:100%;background:#4D91AA;border-radius:999px;}'
            + '.di-bar-f.is-zero{background:transparent;}'
            + '.di-bar-v{font-size:9.5px;color:#18352D;font-weight:900;text-align:right;}'
            + '.di-panels{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}'
            + '.di-panel{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;}'
            + '.di-panel>b{display:block;font-size:11.5px;color:#18352D;font-weight:900;margin-bottom:6px;}'
            + '.di-term{display:flex;gap:8px;align-items:center;border-bottom:1px solid #F1F5F3;padding:4px 0;font-size:11px;}'
            + '.di-term span{flex:1;color:#18352D;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
            + '.di-term b{color:#2E6C86;font-weight:900;}'
            + '.di-term small{color:#8FA69D;font-weight:800;font-size:9.5px;}'
            + '.di-gap{display:flex;gap:8px;align-items:center;border-bottom:1px solid #F1F5F3;padding:5px 0;}'
            + '.di-gap b{font-size:11px;color:#18352D;font-weight:900;flex:0 0 auto;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
            + '.di-gap small{flex:1;font-size:9.5px;color:#8FA69D;font-weight:800;}'
            + '.di-btn{background:#fff;border:1px solid #D6E6DF;color:#17604E;border-radius:7px;padding:3px 7px;font-size:9.5px;font-weight:900;cursor:pointer;}'
            + '.di-note{font-size:9.5px;color:#8FA69D;font-weight:800;margin:6px 0 0;}'
            + '.di-table-wrap{overflow-x:auto;border:1px solid #E2EDE8;border-radius:12px;background:#fff;}'
            + '.di-table{border-collapse:separate;border-spacing:0;width:100%;min-width:900px;}'
            + '.di-table thead th{position:sticky;top:0;background:#F8FBFA;border-bottom:1px solid #E2EDE8;padding:7px 6px;font-size:9px;font-weight:900;text-transform:uppercase;color:#7E9A91;text-align:left;white-space:nowrap;}'
            + '.di-table td{border-bottom:1px solid #F1F5F3;padding:7px 6px;font-size:11px;color:#18352D;font-weight:800;vertical-align:top;}'
            + '.di-name{display:flex;flex-direction:column;max-width:170px;}'
            + '.di-name small{font-size:9px;color:#A7BCB3;font-weight:800;}'
            + '.di-terms{display:block;font-size:8.5px;color:#8FA69D;font-weight:800;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
            + '.di-conf{font-size:9px;font-weight:900;border-radius:999px;padding:2px 6px;background:#F1F5F3;color:#526962;}'
            + '.di-conf.is-high{background:#EAF8F2;color:#17604E;}'
            + '.di-conf.is-medium{background:#FBF6E3;color:#8A6B16;}'
            + '.di-sig{font-size:9.5px;color:#526962;}'
            + '.di-bad{color:#B33B37;}'
            + '.di-na{color:#A7BCB3;font-style:italic;font-weight:800;}'
            + '.di-up{color:#18A982;font-weight:900;}'
            + '.di-down{color:#D9534F;font-weight:900;}'
            + '.di-empty,.di-loading{font-size:11.5px;color:#8FA69D;font-weight:800;padding:12px;text-align:center;margin:0;}'
            + '.di-empty-box{font-size:11.5px;color:#8FA69D;font-weight:800;padding:16px;text-align:center;background:#fff;border:1px solid #E2EDE8;border-radius:12px;}'
            + '.di-err{background:#FDF1F0;border:1px solid #F3D6D5;color:#B33B37;border-radius:10px;padding:10px;font-size:12px;}'
            + '.di-foot{font-size:10px;color:#8FA69D;font-weight:800;margin:8px 0 0;line-height:1.6;}'
            + '.di-foot code{background:#F1F5F3;border-radius:4px;padding:0 3px;}'
            + '@media (max-width:900px){.di-cards{grid-template-columns:repeat(2,minmax(0,1fr));}.di-charts,.di-panels{grid-template-columns:1fr;}}'
            + '@media (max-width:480px){.di-cards{grid-template-columns:1fr 1fr;}.di-table{min-width:0;}'
            + '.di-table thead{display:none;}.di-table tbody,.di-table tr,.di-table td{display:block;}'
            + '.di-row{border-bottom:6px solid #F4F8F6;padding:7px 9px;}'
            + '.di-row td{border:none;padding:2px 0;display:flex;justify-content:space-between;gap:8px;}'
            + '.di-row td.di-name{display:block;}}';
        var st = document.createElement('style');
        st.id = 'skhDiStyles';
        st.textContent = css;
        document.head.appendChild(st);
    }
    diEnsureStyles();

    /* ---------- test API ---------- */
    window.skhDi = {
        state: function () { return { range: DI.range, cat: DI.cat, trend: DI.trend, avail: DI.avail, q: DI.q, loading: DI.loading, error: DI.error }; },
        data: function () { return DI.data; },
        recs: function () { return DI.data ? DI.data.recs.map(function (x) { return { id: x.id, title: x.title, category: x.category, searches: x.searches, terms: x.terms, views: x.views, saves: x.saves, units: x.units, prevUnits: x.prevUnits, trend: x.trend, avail: x.avail, tracked: x.tracked, gap: x.gap, confidence: x.confidence, mpUnits: x.mpUnits, posUnits: x.posUnits }; }) : null; },
        terms: function () { return DI.data ? DI.data.terms : null; },
        unmatched: function () { return DI.data ? DI.data.unmatched : null; },
        searchState: function () { return DI.data ? { state: DI.data.searchState, reason: DI.data.searchReason, total: DI.data.termTotal, matched: DI.data.matchedTotal } : null; },
        sources: function () { return ['search:marketplace', 'views:lifetime', 'purchases:orders+posReports', 'availability:stock']; },
        filtered: function () { return diFiltered().map(function (x) { return x.id; }); },
        setRange: async function (r) { await window.skhDiRange(r); },
        filter: function (k, v) { window.skhDiFilter(k, v); },
        clear: function () { window.skhDiClear(); }
    };

    // ---------- 5. COMPARE PRODUCTS [2026-11-03] ----------
    /* Enhancement ya module iliyopo: uteuzi (2–5), dashboard ya makundi A–F,
       diff toggle, muhtasari wa kila metric, charts 4 na actions zilizopo.
       Chanzo kimoja cha data: META (products + orders) + posReports (server).
       Hakuna collection mpya, hakuna hesabu ya pili ya stock. */
    var CMP_MAX = 5;
    var CMP_GROUP_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
    var CMP = {
        ids: [], q: '', cat: '', status: '',
        range: '7d', from: '', to: '',
        diffOnly: false, view: 'pick',
        open: { A: true, B: true, C: true, D: true, E: true, F: true },
        built: null, busy: false,
        pos: { state: 'idle', reason: '', byProduct: {}, prevByProduct: {} }
    };
    var COMPARE_SET = {};   // compat na handlers za zamani

    var CMP_NA_STOCK = 'stock movement: server aggregate pekee';
    var CMP_NA_REFUND = 'refund za marketplace hazirekodiwi kwa kila bidhaa';
    var CMP_NA_RATING = 'hakuna reviews/ratings za bidhaa kwenye data';
    var CMP_NA_COST = 'hakuna costAtSale — gharama ya mauzo ya nyuma haithibitishiki';
    var CMP_NA_TXPOS = 'posReports haitoi idadi ya transactions kwa bidhaa';

    function cmpMoney(n) { return tzs(Number(n) || 0); }
    function cmpPct(n) { return (Number(n) || 0).toFixed(1) + '%'; }
    function cmpRow(id) { return META && META.rows ? META.rows.filter(function (r) { return r.id === id; })[0] : null; }
    function cmpRaw(id) { return (META && META.raw && META.raw[id]) || {}; }
    function cmpHas(id) { return CMP.ids.indexOf(id) !== -1; }

    /* ---------- uteuzi ---------- */
    function cmpMsg(text, tone) {
        var el = document.getElementById('cmpFlash');
        if (!el) return;
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
        el.className = 'cmp-flash' + (tone ? ' is-' + tone : '');
    }
    function cmpAdd(id) {
        if (cmpHas(id)) return { ok: false, reason: 'dup' };          // zuia duplicate
        if (CMP.ids.length >= CMP_MAX) return { ok: false, reason: 'max' };
        CMP.ids.push(id); COMPARE_SET[id] = true;
        return { ok: true };
    }
    function cmpDel(id) {
        CMP.ids = CMP.ids.filter(function (x) { return x !== id; });
        delete COMPARE_SET[id];
    }
    window.skhComparePick = function (id, cb) {
        var on = cb ? !!cb.checked : !cmpHas(id);
        if (on) {
            var res = cmpAdd(id);
            if (!res.ok) {
                if (cb) cb.checked = false;
                cmpMsg(res.reason === 'max'
                    ? T('cmp_max_msg', 'Unaweza kulinganisha bidhaa {n} tu kwa wakati mmoja.', { n: CMP_MAX })
                    : T('cmp_dup_msg', 'Bidhaa hii imechaguliwa tayari.'), 'warn');
                return;
            }
        } else { cmpDel(id); }
        cmpMsg('');
        cmpRenderTray();
        cmpRefreshListState();
    };
    /* compat: handler ya zamani ilikuwa na sahihi hii */
    window.skhToggleCompare = window.skhComparePick;
    window.skhCompareRemove = function (id) {
        cmpDel(id);
        var cb = document.getElementById('cmpChk_' + id); if (cb) cb.checked = false;
        cmpMsg('');
        cmpRenderTray();
        cmpRefreshListState();
    };
    window.skhCompareClearSel = function () {
        CMP.ids = []; COMPARE_SET = {};
        document.querySelectorAll('.cmp-chk').forEach(function (c) { c.checked = false; });
        cmpMsg(''); cmpRenderTray(); cmpRefreshListState();
    };
    window.skhCompareFilter = function (k, v) {
        if (k === 'q') CMP.q = v || '';
        else if (k === 'cat') CMP.cat = v || '';
        else if (k === 'status') CMP.status = v || '';
        cmpRenderPicker(true);
    };

    function cmpFilteredRows() {
        if (!META) return [];
        var list = META.rows.slice();
        if (CMP.q) {
            var q = CMP.q.toLowerCase();
            list = list.filter(function (r) {
                return String(r.title).toLowerCase().indexOf(q) !== -1
                    || String(r.category).toLowerCase().indexOf(q) !== -1
                    || String(r.sku || '').toLowerCase().indexOf(q) !== -1
                    || String(r.barcode || '').toLowerCase().indexOf(q) !== -1;
            });
        }
        if (CMP.cat) list = list.filter(function (r) { return r.category === CMP.cat; });
        if (CMP.status) list = list.filter(function (r) { return r.status === CMP.status; });
        return list.sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'sw'); });
    }

    function cmpPickRowHtml(r) {
        var on = cmpHas(r.id);
        var disabled = !on && CMP.ids.length >= CMP_MAX;
        var img = r.image ? esc(r.image) : '';
        var stock = r.stockInfo && r.stockInfo.tracked
            ? fmtQty(r.stockInfo.available, r.unitPrecision) + ' ' + (r.unitLabel || '')
            : T('cmp_no_tracking', 'bila tracking');
        return '<label class="cmp-pick' + (on ? ' is-on' : '') + (disabled ? ' is-disabled' : '') + '" data-cmp-pick="' + esc(r.id) + '">'
            + '<input type="checkbox" class="cmp-chk" id="cmpChk_' + esc(r.id) + '"' + (on ? ' checked' : '') + (disabled ? ' disabled' : '')
            + ' onchange="window.skhComparePick(\'' + js(r.id) + '\', this)">'
            + '<span class="cmp-thumb">' + (img ? '<img src="' + img + '" alt="" onerror="this.style.display=\'none\'">' : '<span>—</span>') + '</span>'
            + '<span class="cmp-pick-body"><b>' + esc(r.title) + '</b>'
            + '<small>' + esc(r.category || 'N/A')
            + (r.sku ? ' · SKU: ' + esc(r.sku) : ' · SKU: ' + T('cmp_unset', 'Haijawekwa'))
            + (r.barcode ? ' · ' + esc(r.barcode) : '') + '</small></span>'
            + '<span class="cmp-pick-price">' + tzs(r.price) + '<small>' + esc(stock) + '</small></span>'
            + '</label>';
    }

    function cmpRenderPicker(keepScroll) {
        var host = document.getElementById('cmpPickList');
        if (!host) return;
        var list = cmpFilteredRows();
        host.innerHTML = list.length
            ? list.map(cmpPickRowHtml).join('')
            : '<p class="cmp-empty">' + esc(T('smp_no_match', 'Hakuna bidhaa inayolingana na kigezo hiki.')) + '</p>';
        var cnt = document.getElementById('cmpPickCount');
        if (cnt) cnt.textContent = T('cmp_pick_count', 'bidhaa {n}', { n: list.length });
        if (!keepScroll) host.scrollTop = 0;
    }

    function cmpTrayHtml() {
        var picked = CMP.ids.map(cmpRow).filter(Boolean);
        var chips = picked.map(function (r) {
            return '<span class="cmp-chip"><span>' + esc(r.title) + '</span>'
                + '<button type="button" aria-label="' + esc(T('cmp_remove', 'Ondoa')) + '" onclick="window.skhCompareRemove(\'' + js(r.id) + '\')">×</button></span>';
        }).join('');
        var n = picked.length;
        var hint = n === 0
            ? T('cmp_hint_none', 'Chagua bidhaa 2–{max} kuanza kulinganisha.', { max: CMP_MAX })
            : (n === 1
                ? T('cmp_hint_one', 'Chagua angalau bidhaa moja zaidi (2–{max}).', { max: CMP_MAX })
                : T('cmp_hint_ok', 'Umachagua bidhaa {n} — tayari kulinganisha.', { n: n }));
        var canRun = n >= 2;
        return '<div class="cmp-tray">'
            + '<div class="cmp-tray-head"><b>' + esc(T('cmp_selected', 'Bidhaa zilizochaguliwa')) + ' · ' + n + '/' + CMP_MAX + '</b>'
            + '<button type="button" class="cmp-link" onclick="window.skhCompareClearSel()">' + esc(T('cmp_clear_sel', 'Ondoa zote')) + '</button></div>'
            + '<div class="cmp-chips">' + (n ? chips : '<span class="cmp-muted">' + esc(T('cmp_none', 'Hakuna bidhaa iliyochaguliwa')) + '</span>') + '</div>'
            + '<div class="cmp-tray-foot"><span class="cmp-hint' + (canRun ? ' is-ok' : '') + '">' + esc(hint) + '</span>'
            + '<button type="button" class="cmp-run" ' + (canRun ? '' : 'disabled aria-disabled="true"')
            + ' onclick="window.skhCompareRun()">' + esc(T('cmp_run', 'Linganisha Sasa')) + '</button></div>'
            + (canRun ? '' : '<p class="cmp-warn-note">' + esc(T('cmp_min_two', 'Onyesha angalau bidhaa mbili kabla ya kuendelea.')) + '</p>')
            + '</div>';
    }

    function cmpRenderTray() {
        var host = document.getElementById('cmpTray');
        if (host) host.innerHTML = cmpTrayHtml();
    }

    function cmpRefreshListState() {
        var wrap = document.getElementById('cmpPickList');
        if (!wrap) return;
        document.querySelectorAll('[data-cmp-pick]').forEach(function (el) {
            var id = el.getAttribute('data-cmp-pick');
            el.classList.toggle('is-on', cmpHas(id));
            var cb = el.querySelector('input');
            if (cb) { cb.checked = cmpHas(id); cb.disabled = !cmpHas(id) && CMP.ids.length >= CMP_MAX; }
            el.classList.toggle('is-disabled', !cmpHas(id) && CMP.ids.length >= CMP_MAX);
        });
        var run = document.getElementById('cmpRunBtn');
        if (run) { var ok2 = CMP.ids.length >= 2; run.disabled = !ok2; run.setAttribute('aria-disabled', ok2 ? 'false' : 'true'); }
    }

    /* ---------- kipindi ---------- */
    function cmpWindow() {
        if (CMP.range !== 'custom') return salesWindow(CMP.range);
        var a = new Date(CMP.from + 'T00:00:00'), b = new Date(CMP.to + 'T23:59:59.999');
        if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return salesWindow('7d');
        var span = Math.max(86400000, b.getTime() - a.getTime());
        return { range: 'custom', start: a, end: b, label: CMP.from + ' → ' + CMP.to, prevStart: new Date(a.getTime() - span), prevEnd: new Date(a.getTime()) };
    }

    /* ---------- hesabu za mauzo (orders + POS, chanzo kimoja) ---------- */
    function cmpAggOrders(win) {
        var map = {};
        var orders = (META && META.orders) || [];
        orders.forEach(function (o) {
            var st = String(o && o.status || '').toLowerCase();
            if (SOLD_STATUSES.indexOf(st) === -1) return;                 // cancelled/pending/refunded hazihesabiwi
            var when = o.completedAt || o.deliveredAt || o.paidAt || o.createdAt;
            if (!inWindow(when, win)) return;
            var seen = {};
            (o.items || []).forEach(function (it) {
                var pid = it && (it.productId || it.id); if (!pid) return;
                var qty = Number(it.qty != null ? it.qty : it.quantity);
                if (!Number.isFinite(qty) || qty <= 0) qty = 1;
                var price = Number(it.price) || 0;
                if (!map[pid]) map[pid] = { units: 0, orders: 0, revenue: 0 };
                map[pid].units += qty;
                map[pid].revenue += price * qty;
                if (!seen[pid]) { map[pid].orders++; seen[pid] = true; }   // oda moja = mara moja
            });
        });
        return map;
    }
    function cmpLastSale() {
        var out = {};
        ((META && META.orders) || []).forEach(function (o) {
            var st = String(o && o.status || '').toLowerCase();
            if (SOLD_STATUSES.indexOf(st) === -1) return;
            var when = o.completedAt || o.deliveredAt || o.paidAt || o.createdAt;
            var d = when && typeof when.toDate === 'function' ? when.toDate() : new Date(when);
            if (isNaN(d.getTime())) return;
            (o.items || []).forEach(function (it) {
                var pid = it && (it.productId || it.id); if (!pid) return;
                if (!out[pid] || d > out[pid]) out[pid] = d;
            });
        });
        return out;
    }
    function cmpAggPos(report) {
        var map = {};
        var rows = (report && report.products) || {};
        Object.keys(rows).forEach(function (k) {
            var row = rows[k] || {};
            if (!row.productId) return;
            if (!map[row.productId]) map[row.productId] = { units: 0, returned: 0, voided: 0, gross: 0, returns: 0, net: 0 };
            var m = map[row.productId];
            m.units += Number(row.quantitySold) || 0;
            m.returned += Number(row.quantityReturned) || 0;
            m.voided += Number(row.quantityVoided) || 0;
            m.gross += Number(row.grossSales) || 0;
            m.returns += Number(row.returnsValue) || 0;
            m.net += Number(row.netSales) || 0;
        });
        Object.keys(map).forEach(function (pid) {
            var m = map[pid];
            m.netUnits = Math.max(0, m.units - m.returned - m.voided);
        });
        return map;
    }

    async function cmpBuild() {
        CMP.busy = true;
        var win = cmpWindow();
        var prev = { start: win.prevStart, end: win.prevEnd };
        var cur = { state: 'unavailable', reason: '', byProduct: {}, prevByProduct: {} };
        var snap = await callPosReport(win);
        if (snap.ok) {
            cur.state = 'ok';
            cur.byProduct = cmpAggPos(snap.report);
            var pr = await callPosReport(prev);
            if (pr.ok) cur.prevByProduct = cmpAggPos(pr.report);
        } else {
            cur.state = 'error';
            cur.reason = snap.reason || 'haipatikani';
        }
        CMP.pos = cur;
        CMP.built = {
            win: win,
            orders: cmpAggOrders(win),
            prevOrders: cmpAggOrders(prev),
            lastSale: cmpLastSale(),
            pos: cur.byProduct,
            posPrev: cur.prevByProduct,
            posState: cur.state,
            posReason: cur.reason,
            rows: CMP.ids.map(cmpRow).filter(Boolean)
        };
        CMP.busy = false;
        return CMP.built;
    }

    /* ---------- thamani za jedwali ---------- */
    function V(t) { return { t: String(t), kind: null }; }
    function VNUM(t, n, better) { return { t: String(t), num: (n === null || n === undefined) ? null : Number(n), kind: null, better: better || null }; }
    function VUNSET() { return { t: T('cmp_unset', 'Haijawekwa'), kind: 'unset' }; }
    function VNA(reason) { return { t: T('cmp_na', 'Haipatikani'), kind: 'na', note: reason }; }

    function cmpPerProduct(d) {
        var orders = d.orders[0] || { units: 0, orders: 0, revenue: 0 };
        var prevOrders = d.prevOrders[0] || { units: 0, orders: 0, revenue: 0 };
        var pos = d.pos[d.id] || null;
        var posPrev = d.posPrev[d.id] || null;
        var posUnits = pos ? pos.netUnits : 0;
        var units = orders.units + posUnits;
        var prevUnits = prevOrders.units + (posPrev ? posPrev.netUnits : 0);
        var revenue = orders.revenue + (pos ? pos.gross : 0);
        var tracked = d.si.tracked;
        var avail = tracked ? d.si.available : null;
        var cost = Number(d.raw.buyPrice);
        var hasCost = Number.isFinite(cost) && cost > 0;
        var price = Number(d.row.price) || 0;
        var marginUnit = hasCost && price > 0 ? price - cost : null;
        return {
            units: units, prevUnits: prevUnits,
            orders: orders.orders,
            mpRevenue: orders.revenue,
            posUnits: posUnits, posGross: pos ? pos.gross : null, posReturns: pos ? pos.returns : null,
            posReturned: pos ? pos.returned : null, posVoided: pos ? pos.voided : null, posNet: pos ? pos.net : null,
            revenue: revenue,
            tracked: tracked, avail: avail, stock: tracked ? d.si.stock : null, reserved: tracked ? d.si.reserved : null,
            price: price,
            cost: hasCost ? cost : null, marginUnit: marginUnit,
            marginPct: (hasCost && price > 0) ? (marginUnit / price) * 100 : null,
            marginTotal: (hasCost) ? marginUnit * units : null,
            lastSale: d.lastSale || null
        };
    }

    /* ---------- tahadhari za uteuzi ---------- */
    function cmpSelectionWarn(rows) {
        var cats = {};
        rows.forEach(function (r) { cats[String(r.category || 'N/A')] = true; });
        var units = {};
        rows.forEach(function (r) { units[String(r.unitLabel || 'pcs')] = true; });
        var msgs = [];
        if (Object.keys(cats).length > 1) msgs.push(T('cmp_warn_cat', 'Bidhaa ziko kwenye categories tofauti — tunalinganisha taarifa zinazofanana tu.'));
        if (Object.keys(units).length > 1) msgs.push(T('cmp_warn_unit', 'Units ni tofauti ({u}) — bei na stock hazilinganishwi moja kwa moja; hakuna conversion isiyothibitishwa.', { u: Object.keys(units).join(', ') }));
        return msgs;
    }

    /* ---------- makundi ya vigezo (A–F) ---------- */
    function cmpGroups(d) {
        var p = cmpPerProduct(d);
        var raw = d.raw, row = d.row;
        var chans = (row.channels && row.channels.length) ? row.channels.join(', ') : null;
        var imgs = Array.isArray(raw.imagesArray) ? raw.imagesArray : (Array.isArray(raw.images) ? raw.images : (raw.image ? [raw.image] : []));
        var opts = Array.isArray(raw.options) ? raw.options : [];
        var attrs = Array.isArray(raw.attributes) ? raw.attributes : [];
        var feats = Array.isArray(raw.features) ? raw.features : [];
        var desc = String(raw.description || '').trim();
        var variantStocks = (row.stockInfo && row.stockInfo.variants) ? row.stockInfo.variants : [];
        var variantTxt = variantStocks.length
            ? variantStocks.map(function (v) { return (v.sku || v.variantId || 'variant') + ': ' + fmtQty(v.available, row.unitPrecision); }).join(' · ')
            : null;

        return [
            {
                id: 'A', title: T('cmp_group_a', 'A · Taarifa za Msingi'), rows: [
                    { label: T('cmp_name', 'Jina la bidhaa'), values: [V(row.title)] },
                    { label: T('cmp_category', 'Category'), values: [row.category && row.category !== 'N/A' ? V(row.category) : VUNSET()] },
                    { label: T('cmp_brand', 'Brand'), values: [raw.brand ? V(raw.brand) : VUNSET()] },
                    { label: T('cmp_sku', 'SKU'), values: [row.sku ? V(row.sku) : VUNSET()] },
                    { label: T('cmp_barcode', 'Barcode'), values: [row.barcode ? V(row.barcode) : VUNSET()] },
                    { label: T('cmp_desc', 'Description'), values: [desc ? V((desc.length > 90 ? desc.slice(0, 90) + '…' : desc) + ' (' + desc.length + ')') : VUNSET()] },
                    { label: T('cmp_status', 'Product status'), values: [V(statusLabel(row.status))] },
                    { label: T('cmp_pubstatus', 'Publication status'), values: [V(String(raw.publicationStatus || row.status || ''))] },
                    { label: T('cmp_channels', 'Sales channels'), values: [chans ? V(chans) : VNA(T('cmp_na_channels', 'hakuna salesChannels kwenye bidhaa'))] },
                    { label: T('cmp_created', 'Tarehe ya kuundwa'), values: [row.createdAt ? V(String(row.createdAt).slice(0, 10)) : VUNSET()] }
                ]
            },
            {
                id: 'B', title: T('cmp_group_b', 'B · Bei na Thamani'), rows: [
                    { label: T('cmp_price', 'Bei ya kuuza'), values: [VNUM(cmpMoney(row.price), row.price, 'none')] },
                    { label: T('cmp_unit', 'Unit'), values: [V(row.unitLabel || '—')] },
                    { label: T('cmp_prev_price', 'Bei ya awali'), values: [raw.previousPrice ? VNUM(cmpMoney(raw.previousPrice), raw.previousPrice) : VUNSET()] },
                    { label: T('cmp_discount', 'Punguzo'), values: [raw.discount ? V(String(raw.discount)) : VUNSET()] },
                    { label: T('cmp_price_per_unit', 'Bei kwa unit'), values: [V(cmpMoney(row.price) + ' / ' + (row.unitLabel || '—'))], note: T('cmp_price_unit_note', 'Tunalinganisha bei tu ikiwa unit ni sawa; hakuna conversion isiyothibitishwa.') },
                    { label: T('cmp_wholesale', 'Bei ya jumla'), values: [raw.wholesalePrice ? VNUM(cmpMoney(raw.wholesalePrice), raw.wholesalePrice) : VUNSET()] }
                ]
            },
            {
                id: 'C', title: T('cmp_group_c', 'C · Stock na Upatikanaji'), rows: [
                    { label: T('cmp_stock_total', 'Total stock'), values: [p.tracked ? VNUM(fmtQty(p.stock, row.unitPrecision), p.stock) : VNA(T('cmp_na_untracked', 'bidhaa haina stock tracking'))] },
                    { label: T('cmp_stock_reserved', 'Reserved stock'), values: [p.tracked ? VNUM(fmtQty(p.reserved, row.unitPrecision), p.reserved) : VNA(T('cmp_na_untracked', 'bidhaa haina stock tracking'))] },
                    { label: T('cmp_stock_available', 'Available stock'), values: [p.tracked ? VNUM(fmtQty(p.avail, row.unitPrecision) + ' ' + (row.unitLabel || ''), p.avail, 'none') : VNA(T('cmp_na_untracked', 'bidhaa haina stock tracking'))] },
                    { label: T('cmp_low_threshold', 'Low stock threshold'), values: [VNUM(fmtQty(row.lowStockThreshold, row.unitPrecision), row.lowStockThreshold)] },
                    { label: T('cmp_stock_status', 'Stock status'), values: [V(!p.tracked ? T('cmp_no_tracking', 'Bila tracking') : (p.avail <= 0 ? T('eng_out_stock', 'Haipo stoo') : (p.avail <= row.lowStockThreshold ? T('cmp_low', 'Chini') : T('cmp_ok', 'Ipo'))))] },
                    { label: T('cmp_tracking', 'Stock tracking'), values: [V(p.tracked ? T('cmp_tracked', 'Inafuatiliwa') : T('cmp_untracked', 'Haina tracking'))] },
                    { label: T('cmp_variants_n', 'Idadi ya variants'), values: [row.variantCount ? VNUM(String(row.variantCount), row.variantCount) : V(T('cmp_none_variants', 'Hakuna'))] },
                    { label: T('cmp_variant_stock', 'Stock ya variants'), values: [variantTxt ? V(variantTxt) : VNA(T('cmp_na_variants', 'bidhaa haina variants'))] },
                    { label: T('cmp_stock_movement', 'Stock movement'), values: [VNA(CMP_NA_STOCK)] }
                ]
            },
            {
                id: 'D', title: T('cmp_group_d', 'D · Mauzo na Utendaji'), rows: [
                    { label: T('cmp_units_sold', 'Units zilizouzwa'), values: [VNUM(fmtQty(p.units, row.unitPrecision) + ' ' + (row.unitLabel || ''), p.units, 'high')] },
                    { label: T('cmp_orders', 'Oda (marketplace)'), values: [VNUM(String(p.orders), p.orders, 'high')] },
                    { label: T('cmp_tx_pos', 'Transactions (POS)'), values: [VNA(CMP_NA_TXPOS)] },
                    { label: T('cmp_gross', 'Mauzo ghafi (kipindi)'), values: [VNUM(cmpMoney(p.revenue), p.revenue, 'high')] },
                    { label: T('cmp_source_breakdown', 'Mchanganuo wa chanzo'), values: [V(T('cmp_src_mp', 'Mtandaoni') + ': ' + cmpMoney(p.mpRevenue) + ' · POS: ' + (p.posGross === null ? T('cmp_na', 'Haipatikani') : cmpMoney(p.posGross)))] },
                    { label: T('cmp_returns', 'Marejesho (POS)'), values: [p.posReturns === null ? VNA(T('cmp_na_pos', 'POS haipatikani')) : VNUM(cmpMoney(p.posReturns) + (p.posReturned ? ' · ' + p.posReturned + ' ' + T('cmp_units_ret', 'units') : ''), p.posReturns)] },
                    { label: T('cmp_returns_mp', 'Marejesho (soko la mtandaoni)'), values: [VNA(CMP_NA_REFUND)] },
                    { label: T('cmp_net_pos', 'Net sales (POS)'), values: [p.posNet === null ? VNA(T('cmp_na_pos', 'POS haipatikani')) : VNUM(cmpMoney(p.posNet), p.posNet, 'high')] },
                    { label: T('cmp_net_total', 'Net sales (zote)'), values: [VNA(T('cmp_na_net_total', 'refund za marketplace hazithibitishiki — hatujumlishi vyanzo'))] },
                    { label: T('cmp_trend', 'Mwenendo dhidi ya kipindi kilichopita'), values: [cmpTrendValue(p)] },
                    { label: T('cmp_last_sale', 'Mauzo ya mwisho'), values: [p.lastSale ? V(p.lastSale.toISOString().slice(0, 10)) : VNA(T('cmp_na_last_sale', 'hakuna oda iliyokamilika'))] }
                ]
            },
            {
                id: 'E', title: T('cmp_group_e', 'E · Faida na Gharama'), rows: [
                    { label: T('cmp_cost', 'Cost price (buyPrice)'), values: [p.cost === null ? VUNSET() : VNUM(cmpMoney(p.cost), p.cost)] },
                    { label: T('cmp_margin_unit', 'Faida kwa unit (gharama ya sasa)'), values: [p.marginUnit === null ? VUNSET() : VNUM(cmpMoney(p.marginUnit), p.marginUnit, 'high')] },
                    { label: T('cmp_margin_pct', 'Margin %'), values: [p.marginPct === null ? VUNSET() : VNUM(cmpPct(p.marginPct), p.marginPct, 'high')] },
                    { label: T('cmp_margin_total', 'Faida jumla (makadirio)'), values: [p.marginTotal === null ? VUNSET() : VNUM(cmpMoney(p.marginTotal), p.marginTotal, 'high')], note: T('cmp_margin_note', 'Makadirio: faida kwa unit ya sasa × units zilizouzwa. Si faida iliyopatikana halisi.') },
                    { label: T('cmp_realised_profit', 'Faida iliyopatikana (halisi)'), values: [VNA(CMP_NA_COST)] }
                ]
            },
            {
                id: 'F', title: T('cmp_group_f', 'F · Ubora wa Taarifa'), rows: [
                    { label: T('cmp_images', 'Picha'), values: [imgs.length ? VNUM(String(imgs.length) + ' ' + T('cmp_images_n', 'picha'), imgs.length, 'high') : VUNSET()] },
                    { label: T('cmp_desc_complete', 'Description completeness'), values: [desc ? V((desc.length >= 80 ? T('cmp_complete', 'Kamili') : T('cmp_partial', 'Pungufu')) + ' (' + desc.length + ')') : VUNSET()] },
                    { label: T('cmp_specs', 'Specifications / attributes'), values: [attrs.length ? VNUM(String(attrs.length), attrs.length, 'high') : VUNSET()] },
                    { label: T('cmp_options', 'Options'), values: [opts.length ? VNUM(String(opts.length), opts.length, 'high') : VUNSET()] },
                    { label: T('cmp_features', 'Features'), values: [feats.length ? VNUM(String(feats.length), feats.length, 'high') : VUNSET()] },
                    { label: T('cmp_variant_avail', 'Upatikanaji wa variants'), values: [row.variantCount ? V(variantStocks.filter(function (v) { return v.available > 0; }).length + '/' + row.variantCount + ' ' + T('cmp_in_stock', 'zina stock')) : VUNSET()] },
                    { label: T('cmp_rating', 'Ratings / reviews'), values: [VNA(CMP_NA_RATING)] }
                ]
            }
        ];
    }

    function cmpTrendValue(p) {
        if (!(p.prevUnits > 0)) return VNA(T('cmp_na_trend', 'kipindi kilichopita hakina mauzo — hakuna %'));
        var diff = ((p.units - p.prevUnits) / p.prevUnits) * 100;
        var up = diff >= 0;
        return { t: (up ? '▲ ' : '▼ ') + Math.abs(diff).toFixed(0) + '% (' + fmtQty(p.prevUnits) + ' → ' + fmtQty(p.units) + ')', num: diff, kind: null, tone: up ? 'up' : 'down' };
    }

    function cmpRowSame(row) {
        var first = row.values[0] ? row.values[0].t : '';
        for (var i = 1; i < row.values.length; i++) {
            if ((row.values[i] ? row.values[i].t : '') !== first) return false;
        }
        return true;
    }
    function cmpRowHasMissing(row) {
        return row.values.some(function (v) { return v && v.kind; });
    }

    /* ---------- product headers (sticky) ---------- */
    /* [STAGE B] Kila kitufe kinarudiwa kwa kila bidhaa kwenye jedwali la
       kulinganisha — aria-label inaongeza JINA LA BIDHAA ili msomaji wa skrini
       aweze kutofautisha "Tazama" ya bidhaa A na ya bidhaa B. Tabia haijabadilika. */
    function cmpAria(action, r) {
        var t = (r && r.title) ? String(r.title) : '';
        return t ? (action + ' — ' + t) : action;
    }
    function cmpHeaderCell(r) {
        var p = cmpPerProduct({ id: r.id, row: r, raw: cmpRaw(r.id), si: r.stockInfo, orders: [CMP.built.orders[r.id]], prevOrders: [CMP.built.prevOrders[r.id]], pos: CMP.built.pos, posPrev: CMP.built.posPrev, lastSale: CMP.built.lastSale[r.id] });
        var img = r.image ? esc(r.image) : '';
        var stockTxt = p.tracked ? fmtQty(p.avail, r.unitPrecision) + ' ' + (r.unitLabel || '') : T('cmp_no_tracking', 'bila tracking');
        return '<th class="cmp-ph" data-cmp-col="' + esc(r.id) + '">'
            + '<div class="cmp-ph-inner">'
            + '<span class="cmp-thumb">' + (img ? '<img src="' + img + '" alt="" onerror="this.style.display=\'none\'">' : '<span>—</span>') + '</span>'
            + '<b class="cmp-ph-title">' + esc(r.title) + '</b>'
            + '<small>' + esc(r.sku ? 'SKU: ' + r.sku : (r.barcode ? 'Barcode: ' + r.barcode : T('cmp_unset', 'Haijawekwa'))) + '</small>'
            + '<small>' + esc(r.category || 'N/A') + ' · ' + tzs(r.price) + (r.unitLabel ? ' / ' + esc(r.unitLabel) : '') + '</small>'
            + '<small>' + esc(statusLabel(r.status)) + ' · ' + esc(stockTxt) + '</small>'
            + '<div class="cmp-ph-actions">'
            + '<button type="button" aria-label="' + esc(cmpAria(T('smp_view_btn', 'Tazama'), r)) + '" onclick="openProduct(\'' + js(r.id) + '\',\'products\')">' + esc(T('smp_view_btn', 'Tazama')) + '</button>'
            + '<button type="button" aria-label="' + esc(cmpAria(T('cmp_edit_price', 'Bei'), r)) + '" onclick="window.openEditModal(\'' + js(r.id) + '\',\'products\')" title="' + esc(T('cmp_price_title', 'Bei inahaririwa kwenye fomu ya kuhariri')) + '">' + esc(T('cmp_edit_price', 'Bei')) + '</button>'
            + '<button type="button" aria-label="' + esc(cmpAria(T('cmp_edit_stock', 'Stoo'), r)) + '" onclick="window.skhMPStock(\'' + js(r.id) + '\', ' + (Number(r.stock) || 0) + ')">' + esc(T('cmp_edit_stock', 'Stoo')) + '</button>'
            + '<button type="button" aria-label="' + esc(cmpAria(T('smp_edit_btn', 'Hariri'), r)) + '" onclick="window.openEditModal(\'' + js(r.id) + '\',\'products\')">' + esc(T('smp_edit_btn', 'Hariri')) + '</button>'
            + (r.status === 'active'
                ? '<button type="button" class="is-muted" aria-label="' + esc(cmpAria(T('mpk_suspend', 'Simamisha'), r)) + '" onclick="window.skhSetProductPublication(\'' + js(r.id) + '\',\'draft\')">' + esc(T('mpk_suspend', 'Simamisha')) + '</button>'
                : '<button type="button" class="is-go" aria-label="' + esc(cmpAria(T('cmp_open_sales', 'Fungua mauzo'), r)) + '" onclick="window.skhSetProductPublication(\'' + js(r.id) + '\',\'published\')">' + esc(T('cmp_open_sales', 'Fungua mauzo')) + '</button>')
            + '<button type="button" class="cmp-ph-remove" aria-label="' + esc(cmpAria(T('cmp_remove', 'Ondoa'), r)) + '" onclick="window.skhCompareRemoveInView(\'' + js(r.id) + '\')">×</button>'
            + '</div></div></th>';
    }

    /* ---------- jedwali ---------- */
    function cmpTableHtml(data) {
        var rows = data.rows;
        var groups = cmpGroupsFor(data);
        var head = '<thead><tr><th class="cmp-corner">' + esc(T('cmp_metric_col', 'Kigezo')) + '</th>'
            + rows.map(cmpHeaderCell).join('') + '</tr></thead>';
        var body = '';
        var hidden = 0;
        groups.forEach(function (g) {
            var open = CMP.open[g.id] !== false;
            var visibleRows = g.rows.filter(function (row) {
                if (!CMP.diffOnly) return true;
                return !cmpRowSame(row) || cmpRowHasMissing(row);
            });
            if (CMP.diffOnly && !visibleRows.length) { hidden++; return; }
            body += '<tr class="cmp-group-row"><td colspan="' + (rows.length + 1) + '">'
                + '<button type="button" class="cmp-group-toggle" aria-expanded="' + (open ? 'true' : 'false') + '" onclick="window.skhCompareGroup(\'' + g.id + '\')">'
                + '<span class="cmp-caret">' + (open ? '▾' : '▸') + '</span> ' + esc(g.title) + '</button></td></tr>';
            if (!open) return;
            visibleRows.forEach(function (row) {
                var best = null;
                if (row.values.some(function (v) { return v && v.better === 'high' && v.num !== null && v.num !== undefined; })) {
                    row.values.forEach(function (v, i) { if (v.num !== null && v.num !== undefined && (best === null || v.num > row.values[best].num)) best = i; });
                }
                body += '<tr class="cmp-row"><th class="cmp-metric" scope="row">' + esc(row.label)
                    + (row.note ? '<small>' + esc(row.note) + '</small>' : '') + '</th>'
                    + row.values.map(function (v, i) {
                        var cls = 'cmp-cell' + (v.kind ? ' is-' + v.kind : '') + (v.tone ? ' is-' + v.tone : '') + (best === i ? ' is-best' : '');
                        return '<td class="' + cls + '"' + (v.note ? ' title="' + esc(v.note) + '"' : '') + '>' + esc(v.t) + '</td>';
                    }).join('') + '</tr>';
            });
        });
        if (CMP.diffOnly && hidden) body += '<tr><td colspan="' + (rows.length + 1) + '" class="cmp-note">' + esc(T('cmp_hidden', 'Makundi {n} yamefichwa (hakuna tofauti).', { n: hidden })) + '</td></tr>';
        return '<p class="cmp-swipe">' + esc(T('cmp_swipe', '← sogeza kuona bidhaa zaidi →')) + '</p>'
            + '<div class="cmp-table-wrap"><table class="cmp-table">' + head + '<tbody>' + body + '</tbody></table></div>';
    }
    /* makundi ya bidhaa → makundi ya jedwali (kila kigezo = mstari, kolamu = bidhaa) */
    function cmpGroupsFor(data) {
        var per = data.rows.map(function (r) {
            return cmpGroups({ id: r.id, row: r, raw: cmpRaw(r.id), si: r.stockInfo, orders: [data.orders[r.id]], prevOrders: [data.prevOrders[r.id]], pos: data.pos, posPrev: data.posPrev, lastSale: data.lastSale[r.id] });
        });
        var out = [];
        per.forEach(function (groups) {
            groups.forEach(function (g) {
                var target = null;
                out.forEach(function (x) { if (x.id === g.id) target = x; });
                if (!target) { target = { id: g.id, title: g.title, rows: [] }; out.push(target); }
                g.rows.forEach(function (row) {
                    var trow = null;
                    target.rows.forEach(function (x) { if (x.label === row.label) trow = x; });
                    if (!trow) { trow = { label: row.label, values: [], note: row.note }; target.rows.push(trow); }
                    trow.values.push(row.values[0] || VUNSET());
                });
            });
        });
        out.forEach(function (g) { g.rows.forEach(function (row) { while (row.values.length < per.length) row.values.push(VUNSET()); }); });
        return out;
    }

    /* ---------- muhtasari (mshindi kwa kila metric) ---------- */
    function cmpSummaryHtml(data) {
        var items = data.rows.map(function (r) {
            var p = cmpPerProduct({ id: r.id, row: r, raw: cmpRaw(r.id), si: r.stockInfo, orders: [data.orders[r.id]], prevOrders: [data.prevOrders[r.id]], pos: data.pos, posPrev: data.posPrev, lastSale: data.lastSale[r.id] });
            return { row: r, p: p };
        });
        function winner(metric, dir, fmt) {
            var valid = items.filter(function (x) { var v = x.p[metric]; return v !== null && v !== undefined && Number.isFinite(Number(v)); });
            if (valid.length < 2) return { text: T('cmp_not_enough', 'Hakuna ushahidi wa kutosha'), tone: 'muted' };
            valid.sort(function (a, b) { return dir === 'low' ? (a.p[metric] - b.p[metric]) : (b.p[metric] - a.p[metric]); });
            var w = valid[0];
            return { text: w.row.title + ' · ' + fmt(w.p[metric]), tone: 'ok' };
        }
        var noSales = items.filter(function (x) { return !(x.p.units > 0); });
        var weak = items.filter(function (x) {
            var r = x.row, raw = cmpRaw(r.id);
            var missing = 0;
            if (!r.image) missing++;
            if (!r.category || r.category === 'N/A') missing++;
            if (!(Number(r.price) > 0)) missing++;
            if (!String(raw.description || '').trim()) missing++;
            if (!r.sku) missing++;
            return missing >= 2;
        });
        var cards = [
            { icon: 'bolt', label: T('cmp_w_units', 'Mauzo zaidi (units)'), w: winner('units', 'high', function (v) { return fmtQty(v); }) },
            { icon: 'wallet', label: T('cmp_w_rev', 'Mapato zaidi'), w: winner('revenue', 'high', cmpMoney) },
            { icon: 'archive', label: T('cmp_w_stock', 'Stock ndogo zaidi'), w: winner('avail', 'low', function (v) { return fmtQty(v); }) },
            { icon: 'tag', label: T('cmp_w_price', 'Bei kubwa zaidi'), w: winner('price', 'high', cmpMoney) },
            { icon: 'star', label: T('cmp_w_margin', 'Margin kubwa zaidi'), w: winner('marginPct', 'high', cmpPct) },
            { icon: 'refresh', label: T('cmp_w_returns', 'Marejesho (POS)'), w: winner('posReturns', 'high', cmpMoney) }
        ];
        var listCards = [];
        if (noSales.length) listCards.push({ icon: 'alert', label: T('cmp_w_nosales', 'Hakuna mauzo kwenye kipindi'), text: noSales.map(function (x) { return x.row.title; }).join(' · '), tone: 'muted' });
        if (weak.length) listCards.push({ icon: 'clipboard', label: T('cmp_w_weak', 'Taarifa pungufu'), text: weak.map(function (x) { return x.row.title; }).join(' · '), tone: 'muted' });
        return '<div class="cmp-summary">'
            + '<div class="cmp-sum-head"><b>' + esc(T('cmp_summary', 'Muhtasari wa uchambuzi')) + '</b>'
            + '<small>' + esc(T('cmp_summary_sub', 'Mshindi kwa kila metric — hakuna mshindi mmoja kwa yote.')) + '</small></div>'
            + '<div class="cmp-sum-grid">'
            + cards.concat(listCards).map(function (c) {
                return '<div class="cmp-sum-card ' + (c.w && c.w.tone === 'ok' ? 'is-ok' : '') + '">'
                    + '<span class="cmp-sum-ico">' + (window.skhNavIcon ? window.skhNavIcon(c.icon, 14) : '') + '</span>'
                    + '<span class="cmp-sum-body"><small>' + esc(c.label) + '</small><b>' + esc(c.w ? c.w.text : c.text) + '</b></span></div>';
            }).join('')
            + '</div></div>';
    }

    /* ---------- charts (div bars, hakuna library) ---------- */
    function cmpChartHtml(title, unit, items, fmt) {
        var valid = items.filter(function (x) { return x.value !== null && x.value !== undefined && Number.isFinite(Number(x.value)); });
        if (!valid.length) {
            return '<div class="cmp-chart"><b>' + esc(title) + '</b><p class="cmp-empty">' + esc(T('cmp_no_chart', 'Hakuna data ya kutosha kwa chart hii.')) + '</p></div>';
        }
        var max = Math.max.apply(null, valid.map(function (x) { return Math.abs(Number(x.value)); })) || 1;
        return '<div class="cmp-chart"><b>' + esc(title) + '<small>' + esc(unit) + '</small></b>'
            + valid.map(function (x) {
                var w = Math.max(2, Math.round((Math.abs(Number(x.value)) / max) * 100));
                return '<div class="cmp-bar-row"><span class="cmp-bar-label">' + esc(x.label) + '</span>'
                    + '<span class="cmp-bar-track"><span class="cmp-bar-fill" style="width:' + w + '%"></span></span>'
                    + '<span class="cmp-bar-val">' + esc(fmt(x.value)) + '</span></div>';
            }).join('') + '</div>';
    }
    function cmpChartsHtml(data) {
        var items = data.rows.map(function (r) {
            var p = cmpPerProduct({ id: r.id, row: r, raw: cmpRaw(r.id), si: r.stockInfo, orders: [data.orders[r.id]], prevOrders: [data.prevOrders[r.id]], pos: data.pos, posPrev: data.posPrev, lastSale: data.lastSale[r.id] });
            return { label: r.title, p: p, r: r };
        });
        var charts = [
            cmpChartHtml(T('cmp_ch_units', 'Units zilizouzwa'), data.win.label, items.map(function (x) { return { label: x.label, value: x.p.units }; }), fmtQty),
            cmpChartHtml(T('cmp_ch_rev', 'Mapato'), data.win.label, items.map(function (x) { return { label: x.label, value: x.p.revenue }; }), cmpMoney),
            cmpChartHtml(T('cmp_ch_stock', 'Available stock (sasa)'), T('cmp_now', 'snapshot'), items.map(function (x) { return { label: x.label, value: x.p.tracked ? x.p.avail : null }; }), fmtQty),
            cmpChartHtml(T('cmp_ch_price', 'Bei'), T('cmp_now', 'snapshot'), items.map(function (x) { return { label: x.label, value: Number(x.r.price) }; }), cmpMoney)
        ];
        return '<div class="cmp-charts">' + charts.join('') + '</div>';
    }

    /* ---------- dashboard ---------- */
    function cmpRangeControl() {
        var opts = [['today', 'Leo'], ['7d', T('cmp_7d', 'Siku 7')], ['30d', T('cmp_30d', 'Siku 30')], ['month', T('cmp_month', 'Mwezi huu')], ['custom', T('cmp_custom', 'Kipindi maalum')]];
        var sel = '<select aria-label="' + esc(T('cmp_range', 'Kipindi cha mauzo')) + '" onchange="window.skhCompareRange(this.value)">'
            + opts.map(function (o) { return '<option value="' + o[0] + '"' + (CMP.range === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
        var custom = CMP.range === 'custom'
            ? '<input type="date" value="' + esc(CMP.from) + '" onchange="window.skhCompareCustom(this.value,null)">'
              + '<input type="date" value="' + esc(CMP.to) + '" onchange="window.skhCompareCustom(null,this.value)">'
            : '';
        return '<span class="cmp-range"><span>' + esc(T('cmp_range', 'Kipindi cha mauzo')) + ':</span>' + sel + custom + '</span>';
    }

    function cmpDashboardHtml(data) {
        var warns = cmpSelectionWarn(data.rows);
        return '<div class="cmp-shell">'
            + '<div class="cmp-top">'
            + '<div><h2>' + esc(T('cmp_title', 'Linganisha Bidhaa')) + '</h2>'
            + '<p>' + esc(T('cmp_sub2', 'Bidhaa {n} · {p} · chanzo: products + orders + posReports', { n: data.rows.length, p: data.win.label })) + '</p></div>'
            + '<div class="cmp-top-controls">' + cmpRangeControl()
            + '<button type="button" class="cmp-toggle' + (CMP.diffOnly ? ' is-on' : '') + '" aria-pressed="' + (CMP.diffOnly ? 'true' : 'false') + '" onclick="window.skhCompareDiff()">' + esc(T('cmp_diff', 'Onyesha Tofauti Pekee')) + '</button>'
            + '<button type="button" class="cmp-link" onclick="window.skhCompareGroupsAll(true)">' + esc(T('cmp_open_all', 'Fungua makundi yote')) + '</button>'
            + '<button type="button" class="cmp-link" onclick="window.skhCompareGroupsAll(false)">' + esc(T('cmp_close_all', 'Funga makundi yote')) + '</button>'
            + '<button type="button" class="cmp-back" onclick="window.skhCompareBack()">← ' + esc(T('cmp_back', 'Chagua tena')) + '</button>'
            + '</div></div>'
            + (warns.length ? '<div class="cmp-warns">' + warns.map(function (w) { return '<div class="cmp-warn">' + esc(w) + '</div>'; }).join('') + '</div>' : '')
            + (data.posState !== 'ok' ? '<div class="cmp-warn">' + esc(T('cmp_pos_off', 'POS haipatikani ({r}) — takwimu za POS zinaonyeshwa Haipatikani; marketplace pekee imetumika.', { r: data.posReason || 'error' })) + '</div>' : '')
            + cmpSummaryHtml(data)
            + cmpChartsHtml(data)
            + cmpTableHtml(data)
            + '<p class="cmp-foot">' + esc(T('cmp_footnote', 'Vyanzo: products (stock/variants/bei) · orders (marketplace, zilizokamilika pekee) · posReports (server: sales − returns − voids). Stock = stock − reserved (mamlaka ileile ya POS). Cancelled/pending/refunded hazihesabiwi.')) + '</p>'
            + '</div>';
    }

    function cmpRenderDashboard() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws || !CMP.built) return;
        ws.innerHTML = cmpDashboardHtml(CMP.built);
    }

    /* ---------- render ya uteuzi ---------- */
    async function cmpRenderPickerScreen() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">' + esc(T('smp_loading_compare', 'Loading comparison...')) + '</p>';
        await loadSellerMetrics();
        CMP.view = 'pick';
        var rows = (META && META.rows) || [];
        var cats = {};
        rows.forEach(function (r) { if (r.category && r.category !== 'N/A') cats[r.category] = true; });
        var catKeys = Object.keys(cats).sort();
        ws.innerHTML = '<div class="cmp-shell">'
            + '<div class="cmp-top"><div><h2>' + esc(T('cmp_title', 'Linganisha Bidhaa')) + '</h2>'
            + '<p>' + esc(T('cmp_sub', 'Chagua bidhaa 2–{n}, kisha unganisha bei, stock, mauzo na ubora.', { n: CMP_MAX })) + '</p></div></div>'
            + '<div id="cmpTray">' + cmpTrayHtml() + '</div>'
            + '<div id="cmpFlash" class="cmp-flash" style="display:none;"></div>'
            + '<div class="cmp-filters">'
            + '<input id="cmpSearch" type="search" placeholder="' + esc(T('smp_search_ph', 'Tafuta jina, SKU au barcode...')) + '" oninput="window.skhCompareFilter(\'q\', this.value)">'
            + '<select aria-label="Category" onchange="window.skhCompareFilter(\'cat\', this.value)"><option value="">' + esc(T('smp_all_categories', 'Kategoria zote')) + '</option>'
            + catKeys.map(function (c) { return '<option value="' + esc(c) + '"' + (CMP.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
            + '<select aria-label="Status" onchange="window.skhCompareFilter(\'status\', this.value)"><option value="">' + esc(T('smp_all_status', 'Hali zote')) + '</option>'
            + '<option value="active"' + (CMP.status === 'active' ? ' selected' : '') + '>' + esc(T('smp_active', 'Inatumika')) + '</option>'
            + '<option value="draft"' + (CMP.status === 'draft' ? ' selected' : '') + '>Draft</option>'
            + '<option value="suspended"' + (CMP.status === 'suspended' ? ' selected' : '') + '>' + esc(T('mpk_suspended', 'Imesimamishwa')) + '</option></select>'
            + '<span class="cmp-count" id="cmpPickCount"></span>'
            + '</div>'
            + '<div class="cmp-pick-list" id="cmpPickList"></div>'
            + '</div>';
        cmpRenderPicker();
        cmpRenderTray();
    }

    /* ---------- handlers ---------- */
    window.skhCompareBack = function () { cmpRenderPickerScreen(); };
    window.skhCompareRemoveInView = function (id) {
        cmpDel(id);
        if (CMP.built) {
            CMP.built.rows = CMP.built.rows.filter(function (r) { return r.id !== id; });
            if (CMP.built.rows.length < 2) { cmpRenderPickerScreen(); return; }
            cmpRenderDashboard();
        }
    };
    window.skhCompareGroup = function (gid) {
        CMP.open[gid] = !CMP.open[gid];
        cmpRenderDashboard();
    };
    window.skhCompareGroupsAll = function (open) {
        CMP_GROUP_IDS.forEach(function (g) { CMP.open[g] = !!open; });
        cmpRenderDashboard();
    };
    window.skhCompareDiff = function () {
        CMP.diffOnly = !CMP.diffOnly;
        cmpRenderDashboard();
    };
    window.skhCompareRange = async function (r) {
        CMP.range = r || '7d';
        if (r === 'custom' && !CMP.from) { CMP.range = '7d'; }
        await cmpRebuild();
    };
    window.skhCompareCustom = async function (from, to) {
        if (from) CMP.from = from;
        if (to) CMP.to = to;
        if (!CMP.from || !CMP.to) return;
        CMP.range = 'custom';
        await cmpRebuild();
    };
    async function cmpRebuild() {
        if (!CMP.ids.length) return;
        var ws = document.getElementById('dashWorkspace');
        if (ws) ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">' + esc(T('cmp_recalc', 'Inahesabu upya...')) + '</p>';
        await cmpBuild();
        CMP.view = 'dash';
        cmpRenderDashboard();
    }
    window.skhCompareRun = async function () {
        if (CMP.ids.length < 2) { cmpMsg(T('cmp_min_two', 'Onyesha angalau bidhaa mbili kabla ya kuendelea.'), 'warn'); return; }
        await cmpRebuild();
    };
    /* compat: jina la zamani lilikuwa likiitwa na checkbox */
    window.skhCompareRefresh = function () {
        if (CMP.view === 'dash' && CMP.built) { cmpRenderDashboard(); return; }
        cmpRenderTray();
        cmpRefreshListState();
    };

    window.skhRenderCompareProducts = async function () {
        await cmpRenderPickerScreen();
        return true;
    };

    /* ---------- styles ---------- */
    function cmpEnsureStyles() {
        if (document.getElementById('skhCmpStyles')) return;
        var css = ''
            + '.cmp-shell{text-align:left;font-family:inherit;}'
            + '.cmp-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;}'
            + '.cmp-top h2{margin:0;font-size:19px;color:#18352D;font-weight:900;}'
            + '.cmp-top p{margin:3px 0 0;color:#64748b;font-size:12px;}'
            + '.cmp-top-controls{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11.5px;font-weight:800;color:#526962;}'
            + '.cmp-range{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}'
            + '.cmp-range select,.cmp-range input{border:1px solid #D6E6DF;border-radius:9px;padding:6px 8px;font-size:11.5px;font-weight:800;color:#18352D;background:#fff;}'
            + '.cmp-toggle{background:#fff;border:1px solid #D6E6DF;color:#17604E;border-radius:9px;padding:7px 10px;font-weight:900;font-size:11.5px;cursor:pointer;}'
            + '.cmp-toggle.is-on{background:#18A982;border-color:#18A982;color:#fff;}'
            + '.cmp-link{background:none;border:none;color:#2E6C86;font-weight:900;font-size:11.5px;cursor:pointer;text-decoration:underline;}'
            + '.cmp-back{background:#fff;border:1px solid #D6E6DF;color:#18352D;border-radius:9px;padding:7px 10px;font-weight:900;font-size:11.5px;cursor:pointer;}'
            + '.cmp-tray{background:#fff;border:1px solid #E2EDE8;border-radius:14px;padding:12px;margin-bottom:10px;}'
            + '.cmp-tray-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:#18352D;margin-bottom:8px;}'
            + '.cmp-chips{display:flex;gap:6px;flex-wrap:wrap;min-height:26px;}'
            + '.cmp-chip{display:inline-flex;align-items:center;gap:6px;background:#EAF8F2;color:#17604E;border-radius:999px;padding:4px 6px 4px 10px;font-size:11.5px;font-weight:900;}'
            + '.cmp-chip button{border:none;background:#fff;color:#17604E;width:18px;height:18px;border-radius:50%;font-weight:900;cursor:pointer;line-height:1;}'
            + '.cmp-muted{color:#8FA69D;font-size:11.5px;font-weight:800;}'
            + '.cmp-tray-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;}'
            + '.cmp-hint{font-size:11.5px;font-weight:800;color:#8A6B16;}'
            + '.cmp-hint.is-ok{color:#17604E;}'
            + '.cmp-run{background:#18A982;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:900;font-size:13px;cursor:pointer;}'
            + '.cmp-run:disabled{background:#CFE3DA;color:#7E9A91;cursor:not-allowed;}'
            + '.cmp-warn-note{margin:8px 0 0;font-size:11px;color:#B33B37;font-weight:800;}'
            + '.cmp-flash{margin-bottom:8px;padding:8px 10px;border-radius:10px;font-size:11.5px;font-weight:900;background:#FBF6E3;color:#8A6B16;border:1px solid #EFE3B8;}'
            + '.cmp-filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:8px;margin-bottom:10px;}'
            + '.cmp-filters input{flex:1;min-width:180px;padding:9px 10px;border:1px solid #D6E6DF;border-radius:9px;font-size:12.5px;}'
            + '.cmp-filters select{padding:9px;border:1px solid #D6E6DF;border-radius:9px;font-size:12px;background:#fff;}'
            + '.cmp-count{font-size:11.5px;font-weight:900;color:#7E9A91;}'
            + '.cmp-pick-list{max-height:420px;overflow-y:auto;background:#fff;border:1px solid #E2EDE8;border-radius:12px;}'
            + '.cmp-pick{display:flex;align-items:center;gap:10px;padding:9px 10px;border-bottom:1px solid #F1F5F3;cursor:pointer;}'
            + '.cmp-pick.is-on{background:#F4FBF8;}'
            + '.cmp-pick.is-disabled{opacity:.55;cursor:not-allowed;}'
            + '.cmp-thumb{width:38px;height:38px;flex:0 0 38px;border-radius:9px;background:#F1F5F3;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;color:#8FA69D;font-size:11px;font-weight:900;}'
            + '.cmp-thumb img{width:100%;height:100%;object-fit:contain;display:block;}'
            + '.cmp-pick-body{flex:1;min-width:0;display:flex;flex-direction:column;}'
            + '.cmp-pick-body b{font-size:12.5px;color:#18352D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
            + '.cmp-pick-body small{font-size:10.5px;color:#7E9A91;font-weight:700;}'
            + '.cmp-pick-price{font-size:12px;font-weight:900;color:#17604E;text-align:right;display:flex;flex-direction:column;}'
            + '.cmp-pick-price small{font-size:10px;color:#8FA69D;font-weight:800;}'
            + '.cmp-warns{display:flex;flex-direction:column;gap:6px;margin-bottom:8px;}'
            + '.cmp-warn{background:#FBF6E3;border:1px solid #EFE3B8;color:#8A6B16;border-radius:10px;padding:8px 10px;font-size:11.5px;font-weight:800;}'
            + '.cmp-summary{background:#fff;border:1px solid #E2EDE8;border-radius:14px;padding:12px;margin-bottom:10px;}'
            + '.cmp-sum-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline;margin-bottom:8px;}'
            + '.cmp-sum-head b{font-size:13px;color:#18352D;font-weight:900;}'
            + '.cmp-sum-head small{font-size:11px;color:#7E9A91;font-weight:700;}'
            + '.cmp-sum-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}'
            + '.cmp-sum-card{display:flex;gap:8px;align-items:flex-start;background:#F8FBFA;border:1px solid #EAF2EE;border-radius:11px;padding:9px;}'
            + '.cmp-sum-card.is-ok{background:#F4FBF8;border-color:#CDEBDD;}'
            + '.cmp-sum-ico{width:24px;height:24px;flex:0 0 24px;border-radius:8px;background:#EAF8F2;color:#17604E;display:inline-flex;align-items:center;justify-content:center;}'
            + '.cmp-sum-body{min-width:0;display:flex;flex-direction:column;}'
            + '.cmp-sum-body small{font-size:10px;color:#7E9A91;font-weight:900;text-transform:uppercase;letter-spacing:.02em;}'
            + '.cmp-sum-body b{font-size:11.5px;color:#18352D;font-weight:900;overflow:hidden;text-overflow:ellipsis;}'
            + '.cmp-charts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}'
            + '.cmp-chart{background:#fff;border:1px solid #E2EDE8;border-radius:12px;padding:10px;}'
            + '.cmp-chart>b{display:flex;justify-content:space-between;gap:6px;font-size:11.5px;color:#18352D;font-weight:900;margin-bottom:6px;}'
            + '.cmp-chart>b small{font-size:10px;color:#8FA69D;font-weight:800;text-transform:none;}'
            + '.cmp-bar-row{display:grid;grid-template-columns:64px 1fr 54px;gap:6px;align-items:center;margin-bottom:5px;}'
            + '.cmp-bar-label{font-size:10px;color:#526962;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
            + '.cmp-bar-track{height:8px;background:#EAF2EE;border-radius:999px;overflow:hidden;}'
            + '.cmp-bar-fill{display:block;height:100%;background:#18A982;border-radius:999px;}'
            + '.cmp-bar-val{font-size:10px;color:#18352D;font-weight:900;text-align:right;}'
            + '.cmp-table-wrap{overflow-x:auto;border:1px solid #E2EDE8;border-radius:14px;background:#fff;}'
            + '.cmp-table{border-collapse:separate;border-spacing:0;width:100%;min-width:680px;}'
            + '.cmp-corner{position:sticky;left:0;top:0;z-index:5;background:#F8FBFA;border-bottom:1px solid #E2EDE8;border-right:1px solid #E2EDE8;padding:8px;font-size:10.5px;color:#7E9A91;font-weight:900;text-transform:uppercase;text-align:left;min-width:150px;}'
            + '.cmp-ph{position:sticky;top:0;z-index:4;background:#fff;border-bottom:1px solid #E2EDE8;border-right:1px solid #F1F5F3;padding:8px;vertical-align:top;min-width:170px;max-width:200px;}'
            + '.cmp-ph-inner{display:flex;flex-direction:column;gap:3px;align-items:flex-start;}'
            + '.cmp-ph-title{font-size:12px;color:#18352D;font-weight:900;line-height:1.25;}'
            + '.cmp-ph small{font-size:10px;color:#7E9A91;font-weight:700;}'
            + '.cmp-ph-actions{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;}'
            + '.cmp-ph-actions button{border:1px solid #D6E6DF;background:#fff;color:#17604E;border-radius:7px;padding:3px 6px;font-size:10px;font-weight:900;cursor:pointer;}'
            + '.cmp-ph-actions button.is-go{background:#EAF8F2;border-color:#BFE3D6;}'
            + '.cmp-ph-actions button.is-muted{color:#8A6B16;}'
            + '.cmp-ph-remove{border-color:#F3D6D5 !important;color:#B33B37 !important;}'
            + '.cmp-group-row td{position:sticky;left:0;background:#F8FBFA;border-bottom:1px solid #E2EDE8;padding:0;}'
            + '.cmp-group-toggle{width:100%;text-align:left;background:none;border:none;padding:9px 10px;font-size:11.5px;font-weight:900;color:#17604E;cursor:pointer;}'
            + '.cmp-caret{color:#18A982;}'
            + '.cmp-row th.cmp-metric{position:sticky;left:0;background:#fff;border-bottom:1px solid #F1F5F3;border-right:1px solid #E2EDE8;padding:8px;font-size:11.5px;color:#526962;font-weight:800;text-align:left;min-width:150px;}'
            + '.cmp-row th.cmp-metric small{display:block;font-size:9.5px;color:#A7BCB3;font-weight:700;margin-top:2px;}'
            + '.cmp-cell{border-bottom:1px solid #F1F5F3;padding:8px;font-size:11.5px;color:#18352D;font-weight:800;text-align:center;vertical-align:top;}'
            + '.cmp-cell.is-unset{color:#A7BCB3;font-style:italic;font-weight:700;}'
            + '.cmp-cell.is-na{color:#B39A5B;font-style:italic;font-weight:700;}'
            + '.cmp-cell.is-up{color:#18A982;}'
            + '.cmp-cell.is-down{color:#D9534F;}'
            + '.cmp-cell.is-best{background:#F4FBF8;color:#17604E;}'
            + '.cmp-note{font-size:11px;color:#7E9A91;font-weight:800;padding:8px;text-align:center;}'
            + '.cmp-empty{font-size:11.5px;color:#8FA69D;font-weight:800;padding:12px;text-align:center;margin:0;}'
            + '.cmp-foot{font-size:10.5px;color:#8FA69D;font-weight:700;margin:8px 0 0;}'
            + '@media (max-width:900px){.cmp-sum-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.cmp-charts{grid-template-columns:repeat(2,minmax(0,1fr));}}'
            + '.cmp-swipe{display:none;font-size:10.5px;color:#7E9A91;font-weight:900;margin:0 0 6px;text-align:center;}'
            + '@media (max-width:480px){.cmp-sum-grid{grid-template-columns:1fr;}.cmp-charts{grid-template-columns:1fr;}'
            + '.cmp-table{min-width:0;}.cmp-bar-row{grid-template-columns:56px 1fr 48px;}'
            + '.cmp-swipe{display:block;}'
            + '.cmp-corner,.cmp-row th.cmp-metric{min-width:92px;max-width:92px;font-size:10.5px;}'
            + '.cmp-ph{min-width:128px;max-width:128px;padding:6px;}'
            + '.cmp-cell{font-size:10.5px;padding:6px 4px;}'
            + '.cmp-ph-actions button{font-size:9.5px;padding:3px 5px;}}';
        var st = document.createElement('style');
        st.id = 'skhCmpStyles';
        st.textContent = css;
        document.head.appendChild(st);
    }
    cmpEnsureStyles();

    /* ---------- test API (read-only) ---------- */
    window.skhCmp = {
        state: function () { return { ids: CMP.ids.slice(), range: CMP.range, diffOnly: CMP.diffOnly, open: Object.assign({}, CMP.open), view: CMP.view, posState: CMP.pos.state, busy: CMP.busy }; },
        add: function (id) { return cmpAdd(id); },
        remove: function (id) { cmpDel(id); return CMP.ids.slice(); },
        clear: function () { CMP.ids = []; COMPARE_SET = {}; },
        run: function () { return window.skhCompareRun(); },
        rebuilt: function () { return CMP.built; },
        groups: function () { return CMP.built ? cmpGroupsFor(CMP.built) : []; },
        perProduct: function (id) {
            if (!CMP.built) return null;
            var r = CMP.built.rows.filter(function (x) { return x.id === id; })[0];
            if (!r) return null;
            return cmpPerProduct({ id: id, row: r, raw: cmpRaw(id), si: r.stockInfo, orders: [CMP.built.orders[id]], prevOrders: [CMP.built.prevOrders[id]], pos: CMP.built.pos, posPrev: CMP.built.posPrev, lastSale: CMP.built.lastSale[id] });
        },
        window: function () { return CMP.built ? CMP.built.win : null; },
        setRange: function (r) { return window.skhCompareRange(r); },
        diff: function () { window.skhCompareDiff(); },
        group: function (g) { window.skhCompareGroup(g); }
    };

    // ---------- DELEGATION: kutoka switchDashTab ----------
    window.skhRenderSellerTab = function (tab) {
        var map = {
            my_products: window.skhRenderMyProducts,
            product_performance: window.skhRenderProductPerformance,
            sales_insights: window.skhRenderSalesInsights,
            demand_insights: window.skhRenderDemandInsights,
            product_compare: window.skhRenderCompareProducts
        };
        var fn = map[tab];
        if (fn) { fn(); return true; }
        return false;
    };
})();

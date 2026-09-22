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
        } catch (e) {}
        try {
            var oq = skh.query(skh.collection(skh.db, 'orders'), skh.where('sellerId', '==', uid), skh.limit(300));
            var os = await skh.getDocs(oq);
            os.forEach(function (d) { orders.push(Object.assign({ id: d.id }, d.data())); });
        } catch (e) {}

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
            return {
                id: p.id, title: p.title || 'Bidhaa', image: p.image || p.imagesArray?.[0] || '',
                category: p.category || 'N/A', price: num(p.price), stock: stock,
                stockStatus: stock > 0 ? 'in_stock' : 'out_of_stock',
                status: skh.productPublicationStatus ? (skh.productPublicationStatus(p) === 'published' ? 'active' : skh.productPublicationStatus(p)) : (p.status || 'active'),
                views: views, likes: likes, saves: saves,
                orders: b.orders, units: units, revenue: b.revenue,
                conversion: conv, createdAt: p.createdAt, updatedAt: p.updatedAt || p.createdAt,
                saleMode: p.saleMode,
                modeData: p.modeData || null   // [§34] muuzaji aone metrics za modes
            };
        });
        META = { rows: rows, byProduct: byProduct };
        return META;
    }

    function rowSort(a, b) {
        if (MP_SORT === 'best') return b.units - a.units;
        if (MP_SORT === 'lowest') return a.units - b.units;
        if (MP_SORT === 'highest') return b.revenue - a.revenue;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); // newest
    }

    function filteredRows() {
        if (!META) return [];
        var list = META.rows.slice();
        if (MP_Q) { var q = MP_Q.toLowerCase(); list = list.filter(function (r) { return String(r.title).toLowerCase().indexOf(q) !== -1 || String(r.category).toLowerCase().indexOf(q) !== -1; }); }
        if (MP_CAT) list = list.filter(function (r) { return r.category === MP_CAT; });
        if (MP_STOCK === 'in') list = list.filter(function (r) { return r.stockStatus === 'in_stock'; });
        if (MP_STOCK === 'out') list = list.filter(function (r) { return r.stockStatus === 'out_of_stock'; });
        if (MP_STATUS) list = list.filter(function (r) { return String(r.status).toLowerCase() === MP_STATUS; });
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

    // ---------- 1. MY PRODUCTS ----------
    window.skhRenderMyProducts = async function () {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">' + T('smp_loading_products', 'Loading your products...') + '</p>';
        await loadSellerMetrics();
        if (!META) return;
        var rows = META.rows;
        var cats = {};
        rows.forEach(function (r) { if (r.category) cats[r.category] = true; });
        var catKeys = Object.keys(cats);

        ws.innerHTML = `
        <div style="text-align:left; animation: fadeIn 0.3s ease;"> <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;"> <div> <h2 style="margin:0;font-size:19px;color:#0f172a;font-weight:800;">${T('smp_my_products', 'My Products')}</h2> <p style="margin:3px 0 0;color:#64748b;font-size:12px;">${T('smp_products_sub', 'All products you listed on SokoHai — total: {n}', { n: rows.length })}</p> </div> </div> <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:14px;"> <input id="mpSearch" oninput="window.skhMPFilter('q', this.value)" placeholder="${T('smp_search_ph', 'Search products (name or category)...')}" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;margin-bottom:8px;outline:none;"> <div style="display:flex;gap:6px;flex-wrap:wrap;"> <select onchange="window.skhMPFilter('cat', this.value)" style="flex:1;min-width:120px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="">${T('smp_all_categories', 'All categories')}</option>
                        ${catKeys.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('')}
                    </select> <select onchange="window.skhMPFilter('stock', this.value)" style="flex:1;min-width:110px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="">${T('smp_all_stock', 'All stock')}</option> <option value="in">${T('eng_in_stock', 'In stock')}</option> <option value="out">${T('eng_out_stock', 'Out of stock')}</option> </select> <select onchange="window.skhMPFilter('status', this.value)" style="flex:1;min-width:110px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="">${T('smp_all_status', 'All statuses')}</option> <option value="active">${T('smp_active', 'Published')}</option><option value="draft">Draft</option><option value="archived">Archived</option> </select> <select onchange="window.skhMPFilter('sort', this.value)" style="flex:1;min-width:120px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="newest">${T('smp_newest', 'Newest')}</option> <option value="best">${T('smp_best', 'Best selling')}</option> <option value="lowest">${T('smp_lowest', 'Slow selling')}</option> <option value="highest">${T('smp_highest', 'Highest revenue')}</option> </select> </div> </div> <div id="mpTableWrap"></div> </div>`;
        window.skhMPRenderTable();
    };

    window.skhMPFilter = function (k, v) {
        if (k === 'q') MP_Q = v;
        else if (k === 'cat') MP_CAT = v;
        else if (k === 'stock') MP_STOCK = v;
        else if (k === 'status') MP_STATUS = v;
        else if (k === 'sort') MP_SORT = v;
        window.skhMPRenderTable();
    };

    window.skhMPRenderTable = function () {
        var wrap = document.getElementById('mpTableWrap');
        if (!wrap || !META) return;
        var rows = filteredRows();
        if (!rows.length) { wrap.innerHTML = empty(T('smp_no_match', 'No products match this filter.')); return; }
        wrap.innerHTML = rows.map(function (r) {
            var img = esc(r.image || 'https://ui-avatars.com/api/?name=Bidhaa&background=f1f5f9&color=64748b');
            var stColor = r.status === 'active' ? '#16a34a' : '#94a3b8';
            var stockColor = r.stockStatus === 'in_stock' ? '#16a34a' : '#ef4444';
            return `
            <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;"> <div style="display:flex;gap:10px;align-items:flex-start;"> <img src="${img}" onerror="this.src='https://ui-avatars.com/api/?name=Bidhaa&background=f1f5f9&color=64748b'" style="width:56px;height:56px;border-radius:10px;object-fit:cover;background:#f1f5f9;"> <div style="flex:1;min-width:0;"> <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"> <b style="font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.title)}</b> <span style="font-size:13px;font-weight:900;color:var(--terracotta);white-space:nowrap;">${tzs(r.price)}</span> </div> <div style="font-size:13px;color:#64748b;margin:3px 0;">
                            ${esc(r.category)} ·
                            <span style="color:${stockColor};font-weight:800;">${r.stockStatus === 'in_stock' ? T('eng_in_stock', 'In stock') + ' (' + r.stock + ')' : T('eng_out_stock', 'Out of stock')}</span> ·
                            <span style="color:${stColor};font-weight:800;">${r.status === 'active' ? T('smp_active', 'Published') : esc(r.status)}</span> </div> <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">
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
                        </div> <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;"> <button onclick="openProduct('${js(r.id)}','products')" style="padding:8px 12px;background:#e2e8f0;color:#0f172a;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${T('smp_view_btn', 'View')}</button> <button onclick="window.openEditModal('${js(r.id)}','products')" style="padding:8px 12px;background:#e0f2fe;color:#03509d;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${T('smp_edit_btn', 'Edit')}</button> <button onclick="window.skhMPStock('${js(r.id)}', ${r.stock})" style="padding:8px 12px;background:#fef3c7;color:#92400e;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${T('smp_stock_btn', 'Stock')}</button> <button onclick="window.skhSetProductPublication('${js(r.id)}','${r.status === 'active' ? 'draft' : 'published'}')" style="padding:8px 12px;background:#ecfdf5;color:#047857;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${r.status === 'active' ? 'Unpublish' : 'Publish'}</button> <button onclick="window.skhSetProductPublication('${js(r.id)}','archived')" style="padding:8px 12px;background:#fee2e2;color:#b91c1c;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">Archive</button> <button onclick="window.skhRenderProductPerformance('${js(r.id)}')" style="padding:8px 12px;background:#f3e8ff;color:#6b21a8;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">${T('smp_perf_btn', 'Performance')}</button> </div> </div> </div> </div>`;
        }).join('');
    };

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
            await skh.updateDoc(skh.doc(skh.db, 'products', id), { stock: n, availabilityStatus: n <= 0 ? 'out_of_stock' : (n <= 3 ? 'low_stock' : 'available'), updatedAt: new Date().toISOString() });
            alert(T('smp_stock_updated', 'Stock updated to {n}.', { n: n }));
            window.skhRenderMyProducts();
        } catch (e) { alert(T('smp_stock_failed', 'Failed to update stock:') + ' ' + (e && e.message)); }
    };

    // ---------- 2. PRODUCT PERFORMANCE (per product) ----------
    window.skhRenderProductPerformance = async function (pid) {
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

    // ---------- 3. SALES INSIGHTS ----------
    window.skhRenderSalesInsights = async function () {
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

    // ---------- 4. DEMAND INSIGHTS ----------
    window.skhRenderDemandInsights = async function () {
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

    // ---------- 5. COMPARE PRODUCTS ----------
    var COMPARE_SET = {};
    window.skhToggleCompare = function (pid, cb) {
        if (cb.checked) COMPARE_SET[pid] = true; else delete COMPARE_SET[pid];
    };
    window.skhRenderCompareProducts = async function () {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return;
        ws.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">' + T('smp_loading_compare', 'Loading comparison...') + '</p>';
        await loadSellerMetrics();
        COMPARE_SET = {};
        var rows = META.rows.slice();
        var picked = rows.filter(function (r) { return COMPARE_SET[r.id]; });

        function colLabel(key) {
            return { views: T('pm_views', 'Views'), likes: T('smp_likes', 'Likes'), saves: T('smp_saves', 'Saves'), orders: T('smp_orders', 'Orders'), sold: T('smp_sold', 'Sold') }[key] || key;
        }
        function table(pickedRows) {
            if (pickedRows.length < 2) return empty(T('smp_compare_pick', 'Select at least 2 products by ticking them.'));
            var cols = ['views', 'likes', 'saves', 'orders', 'sold'];
            var head = '<tr style="text-align:left;"><th style="padding:8px;font-size:13px;color:#64748b;">' + T('smp_product_col', 'Product') + '</th>'
                + pickedRows.map(function (r) { return '<th style="padding:8px;font-size:12px;color:#0f172a;text-align:center;">' + esc(r.title) + '</th>'; }).join('') + '</tr>';
            var body = cols.map(function (c) {
                return '<tr><td style="padding:8px;font-size:13px;color:#64748b;font-weight:700;">' + colLabel(c) + '</td>'
                    + pickedRows.map(function (r) { return '<td style="padding:8px;font-size:13px;font-weight:900;text-align:center;">' + r[c].toLocaleString() + '</td>'; }).join('') + '</tr>';
            }).join('');
            return '<table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
        }

        ws.innerHTML = `
        <div style="text-align:left; animation: fadeIn 0.3s ease;"> <h2 style="margin:0 0 4px;font-size:19px;color:#0f172a;">${T('smp_compare', 'Compare Products')}</h2> <p style="margin:0 0 8px;color:#64748b;font-size:12px;">${T('smp_compare_sub', 'Compare attention (views/likes/saves) with conversion (orders/sold).')}</p> <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:8px;margin-bottom:12px;max-height:220px;overflow-y:auto;">
                ${rows.map(function (r) {
                    return '<label style="display:flex;align-items:center;gap:8px;padding:7px 6px;font-size:12px;color:#0f172a;border-bottom:1px solid #f1f5f9;cursor:pointer;">'
                        + '<input type="checkbox" onchange="window.skhToggleCompare(\'' + js(r.id) + '\', this); window.skhCompareRefresh();"> ' + esc(r.title) + '</label>';
                }).join('')}
            </div> <div id="cmpTable">${table(picked)}</div> </div>`;
    };
    window.skhCompareRefresh = function () {
        var wrap = document.getElementById('cmpTable');
        if (!wrap || !META) return;
        var picked = META.rows.filter(function (r) { return COMPARE_SET[r.id]; });
        if (picked.length < 2) { wrap.innerHTML = empty(T('smp_compare_pick', 'Select at least 2 products by ticking them.')); return; }
        var cols = ['views', 'likes', 'saves', 'orders', 'sold'];
        var colLabel = function (key) { return { views: T('pm_views', 'Views'), likes: T('smp_likes', 'Likes'), saves: T('smp_saves', 'Saves'), orders: T('smp_orders', 'Orders'), sold: T('smp_sold', 'Sold') }[key] || key; };
        var head = '<tr style="text-align:left;"><th style="padding:8px;font-size:13px;color:#64748b;">' + T('smp_product_col', 'Product') + '</th>'
            + picked.map(function (r) { return '<th style="padding:8px;font-size:12px;color:#0f172a;text-align:center;">' + esc(r.title) + '</th>'; }).join('') + '</tr>';
        var body = cols.map(function (c) {
            return '<tr><td style="padding:8px;font-size:13px;color:#64748b;font-weight:700;">' + colLabel(c) + '</td>'
                + picked.map(function (r) { return '<td style="padding:8px;font-size:13px;font-weight:900;text-align:center;">' + r[c].toLocaleString() + '</td>'; }).join('') + '</tr>';
        }).join('');
        wrap.innerHTML = '<table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    };

    // ---------- DELEGATION: kutoka switchDashTab ----------
    window.skhRenderSellerTab = function (tab) {
        var map = {
            my_products: window.skhRenderMyProducts,
            product_performance: function () { alert(T('smp_choose_perf', 'Choose "Performance" on a product in "My Products".')); window.skhRenderMyProducts(); },
            sales_insights: window.skhRenderSalesInsights,
            demand_insights: window.skhRenderDemandInsights,
            product_compare: window.skhRenderCompareProducts
        };
        var fn = map[tab];
        if (fn) { fn(); return true; }
        return false;
    };
})();

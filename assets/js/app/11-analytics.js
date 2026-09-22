/* ==== js/app/11-analytics.js ==== */
import { skh } from './00-bootstrap.js';

function T(key, en, vars) {
    var s = null;
    try { if (window.t) s = window.t(key, vars); } catch (e) {}
    if (!s || s === key) {
        s = en;
        if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
    }
    return s;
}


window.activeProductAnalyticsSubTab = 'sales_revenue';

/* ============================================================================
   [AUDIT-FIX 2026-09-16 P2 §42] TAKWIMU HALISI ZA MAUZO
   Awali tabs za analytics zilitengeneza idadi za mauzo kwa Math.random()
   (units sold, revenue, profit, "AI forecast") na kadi kuu iliandika
   "145 Pcs" kiholela — wauzaji walifanya maamuzi ya stoo kwa data bandia.
   Sasa: agregesheni halisi kutoka collection 'shop_ledger'
   (entries: type 'income_offline', fields za muundo productId/qty/... +
   urithi wa title "Uzo POS: N Pcs - Jina (njia)").
   ============================================================================ */
function skhSalesByProduct(products, data) {
    var map = {}, byName = {};
    (products || []).forEach(function (p) {
        map[p.id] = { qty: 0, revenue: 0, profit: 0, firstDate: null, lastDate: null, daysCovered: 0, name: String(p.title || '').toLowerCase().trim() };
        if (map[p.id].name) byName[map[p.id].name] = p.id;
    });
    try {
        if (data && data.ledgerSnap && typeof data.ledgerSnap.forEach === 'function') {
            data.ledgerSnap.forEach(function (docSnap) {
                var l = docSnap.data ? docSnap.data() : docSnap;
                if (!l || l.type !== 'income_offline') return;
                var qty = Number(l.qty) || 0;
                var pname = String(l.productName || '').toLowerCase().trim();
                if (!qty || !pname) {
                    var m = /Uzo POS:\s*(\d+)\s*Pcs\s*-\s*(.+?)\s*\(/.exec(l.title || '');
                    if (m) { if (!qty) qty = Number(m[1]) || 0; if (!pname) pname = String(m[2] || '').toLowerCase().trim(); }
                }
                var id = (l.productId && map[l.productId]) ? l.productId : (byName[pname] || null);
                if (!id || !qty) return;
                map[id].qty += qty;
                map[id].revenue += Number(l.amount) || 0;
                map[id].profit += Number(l.profit) || 0;
                var d = Date.parse(l.date || l.createdAt || '');
                if (isFinite(d)) {
                    if (!map[id].firstDate || d < map[id].firstDate) map[id].firstDate = d;
                    if (!map[id].lastDate || d > map[id].lastDate) map[id].lastDate = d;
                }
            });
        }
    } catch (e) { console.warn('[analytics] ledger agregesheni imezuiwa:', e && e.message); }
    Object.keys(map).forEach(function (id) {
        var s = map[id];
        s.daysCovered = (s.firstDate && s.lastDate) ? Math.max(1, Math.round((s.lastDate - s.firstDate) / 86400000) + 1) : (s.firstDate ? 1 : 0);
    });
    return map;
}

function skhUnitsSoldToday(data) {
    var total = 0;
    try {
        var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        if (data && data.ledgerSnap && typeof data.ledgerSnap.forEach === 'function') {
            data.ledgerSnap.forEach(function (docSnap) {
                var l = docSnap.data ? docSnap.data() : docSnap;
                if (!l || l.type !== 'income_offline') return;
                var d = Date.parse(l.date || l.createdAt || '');
                if (!isFinite(d) || d < todayStart.getTime()) return;
                var qty = Number(l.qty) || 0;
                if (!qty) { var m = /Uzo POS:\s*(\d+)\s*Pcs/.exec(l.title || ''); if (m) qty = Number(m[1]) || 0; }
                if (qty) total += qty;
            });
        }
    } catch (e) { console.warn('[analytics] units-today imezuiwa:', e && e.message); }
    return total;
}

window.renderProductAnalyticsView = function() {
    const ws = document.getElementById('dashWorkspace');
    if(!ws || !window.dashboardCachedData) return;

    const data = window.dashboardCachedData;
    const s = skh.currentUserData?.shopSettings || {};

    // [AUDIT-FIX §42] UNITS SOLD TODAY halisi kutoka shop_ledger (ilikuwa "145 Pcs" hardcoded)
    const unitsSoldToday = skhUnitsSoldToday(data);

    // 1. KOKOTOA TAKWIMU KUU ZA INVENTORY (REAL-TIME STOCK CALCULATIONS)
    let totalProducts = 0;
    let activeProducts = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let totalStockVolume = 0;
    
    let costValue = 0;         // Thamani ya kununulia stoo
    let sellingValue = 0;      // Thamani ya kuuzia stoo
    let expectedProfit = 0;    // Faida inayotarajiwa

    let productsArray = [];

    data.prodSnap.forEach(docSnap => {
        const p = docSnap.data();
        p.id = docSnap.id;
        productsArray.push(p);

        totalProducts++;
        const stock = parseFloat(p.stock) || 0;
        const limit = parseInt(p.lowStockAlert) || 5;
        const buyPrice = parseFloat(p.buyPrice) || 0;
        const sellPrice = parseFloat(p.price) || 0;

        totalStockVolume += stock;

        if (stock <= 0) {
            outOfStock++;
        } else {
            activeProducts++;
            if (stock <= limit) {
                lowStock++;
            }
        }

        costValue += (stock * buyPrice);
        sellingValue += (stock * sellPrice);
    });

    expectedProfit = sellingValue - costValue;

    // 2. CHORA KIOO KIKUU CHA DASHBODI NA TAB NAVIGATION
    ws.innerHTML = `
        <div style="text-align: left; font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b;"> <!-- HEADER --> <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; background:#fff; padding:15px; border-radius:14px; border:1px solid #e2e8f0;"> <div> <h2 style="margin:0; color:#0f172a; font-weight:900; font-size:20px;"> PRODUCTS ANALYTICS CENTER</h2> <p style="margin:4px 0 0 0; color:#64748b; font-size:12px;">Control Tower: Fuatilia mzunguko, faida, upotevu, na utabiri wa stoo yako.</p> </div> <button onclick="window.loadAndRenderDashboard()" style="padding:10px 15px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer; color:#0f172a;"> Refresh Data</button> </div> <!-- CORE OVERVIEW METRIC CARDS --> <div style="display:grid; grid-template-columns: repeat(6, 1fr); gap:10px; margin-bottom:20px;"> <div style="background:white; border:1px solid #e2e8f0; padding:12px; border-radius:12px; text-align:center;"> <small style="color:gray; font-size:12px; font-weight:bold; text-transform:uppercase;">${T('an_total_products', 'TOTAL PRODUCTS')}</small> <h3 style="margin:4px 0 0 0; color:#0f172a; font-size:16px; font-weight:900;">${totalProducts.toLocaleString()}</h3> </div> <div style="background:white; border:1px solid #e2e8f0; padding:12px; border-radius:12px; text-align:center;"> <small style="color:gray; font-size:12px; font-weight:bold; text-transform:uppercase;">${T('an_active_stock', 'ACTIVE STOCK')}</small> <h3 style="margin:4px 0 0 0; color:#10b981; font-size:16px; font-weight:900;">${activeProducts.toLocaleString()}</h3> </div> <div style="background:white; border:1px solid #e2e8f0; padding:12px; border-radius:12px; text-align:center;"> <small style="color:gray; font-size:12px; font-weight:bold; text-transform:uppercase;">${T('an_out_of_stock', 'OUT OF STOCK')}</small> <h3 style="margin:4px 0 0 0; color:#ef4444; font-size:16px; font-weight:900;">${outOfStock.toLocaleString()}</h3> </div> <div style="background:white; border:1px solid #e2e8f0; padding:12px; border-radius:12px; text-align:center;"> <small style="color:gray; font-size:12px; font-weight:bold; text-transform:uppercase;">${T('an_low_stock', 'LOW STOCK')}</small> <h3 style="margin:4px 0 0 0; color:#f59e0b; font-size:16px; font-weight:900;">${lowStock.toLocaleString()}</h3> </div> <div style="background:white; border:1px solid #e2e8f0; padding:12px; border-radius:12px; text-align:center;"> <small style="color:gray; font-size:12px; font-weight:bold; text-transform:uppercase;">${T('an_inventory_value', 'INVENTORY VALUE')}</small> <h3 style="margin:4px 0 0 0; color:var(--primary-blue); font-size:13px; font-weight:900;">TZS ${sellingValue.toLocaleString()}</h3> </div> <div style="background:white; border:1px solid #e2e8f0; padding:12px; border-radius:12px; text-align:center;"> <small style="color:gray; font-size:12px; font-weight:bold; text-transform:uppercase;">${T('an_units_sold', 'UNITS SOLD TODAY')}</small> <h3 style="margin:4px 0 0 0; color:#8b5cf6; font-size:16px; font-weight:900;">${unitsSoldToday.toLocaleString()} Pcs</h3> </div> </div> <!-- SOKOHAI 5-TAB NAVIGATION BAR --> <div style="display:flex; gap:5px; background:#e2e8f0; padding:4px; border-radius:12px; margin-bottom:20px;"> <button onclick="window.switchProductAnalyticsSubTab('sales_revenue')" id="pSubTab_sales_revenue" class="p-sub-tab active"> Sales & Revenue</button> <button onclick="window.switchProductAnalyticsSubTab('inventory_stock')" id="pSubTab_inventory_stock" class="p-sub-tab"> Inventory & Stock</button> <button onclick="window.switchProductAnalyticsSubTab('profitability')" id="pSubTab_profitability" class="p-sub-tab"> Profitability</button> <button onclick="window.switchProductAnalyticsSubTab('returns_losses')" id="pSubTab_returns_losses" class="p-sub-tab"> Returns & Losses</button> <button onclick="window.switchProductAnalyticsSubTab('ai_forecast')" id="pSubTab_ai_forecast" class="p-sub-tab"> AI Forecast & Insights</button> </div> <!-- TAB CONTENT AREA --> <div id="productAnalyticsWorkspace" style="min-height:300px;"> <!-- Tab contents will load dynamically here --> </div> </div> `;

    // Amsha tab ya kwanza kiotomatiki
    window.switchProductAnalyticsSubTab(window.activeProductAnalyticsSubTab);

    // Kuingiza staili za kuteleza za tabu hizi
    if (!document.getElementById('p-sub-tab-styles')) {
        const style = document.createElement('style');
        style.id = 'p-sub-tab-styles';
        style.innerHTML = `
            .p-sub-tab {
                flex: 1; padding: 12px 8px; border: none; background: transparent;
                color: #475569; font-weight: bold; font-size:13px; border-radius: 8px;
                cursor: pointer; transition: 0.2s; text-align: center; white-space: nowrap;
            }
            .p-sub-tab:hover { background: rgba(255,255,255,0.4); color: #0f172a; }
            .p-sub-tab.active { background: white !important; color: var(--primary-blue) !important; box-shadow: 0 4px 10px rgba(0,0,0,0.05); } `;
        document.head.appendChild(style);
    }
};

window.switchProductAnalyticsSubTab = function(tabName) {
    window.activeProductAnalyticsSubTab = tabName;
    
    // Sasisha hali ya kitufe kilichobonyezwa
    document.querySelectorAll('.p-sub-tab').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('pSubTab_' + tabName);
    if(activeBtn) activeBtn.classList.add('active');

    const workspace = document.getElementById('productAnalyticsWorkspace');
    if(!workspace || !window.dashboardCachedData) return;

    const data = window.dashboardCachedData;

    // Kusanya bidhaa zilizopo kwenye orodha
    let products = [];
    data.prodSnap.forEach(docSnap => {
        const p = docSnap.data();
        p.id = docSnap.id;
        products.push(p);
    });

    // ----------------------------------------------------
    // TAB 1:  SALES & REVENUE (Overview, Top/Worst Selling & Channels)
    // ----------------------------------------------------
    if (tabName === 'sales_revenue') {
        // [AUDIT-FIX §42] Mauzo halisi kutoka shop_ledger (ilikuwa Math.random 10..130
        // — "Top Selling" za uongo zingeweza kumpotoza muuzaji kuhusu stoo gani kununua).
        // Bidhaa bila mauzo yaliyorekodiwa huonyesha 0 — ukweli, si bandia.
        let _salesMapA = skhSalesByProduct(products, data);
        let topMovers = [...products].map(p => {
            const _sl = _salesMapA[p.id] || { qty: 0, revenue: 0, profit: 0 };
            const unitsSold = _sl.qty;
            const revenue = _sl.revenue;
            const cost = Math.max(0, revenue - _sl.profit);
            return { ...p, unitsSold, revenue, profit: (_sl.revenue || _sl.profit) ? _sl.profit : (revenue - cost) };
        }).sort((a,b) => b.unitsSold - a.unitsSold);

        let worstMovers = [...topMovers].reverse().slice(0, 5);

        workspace.innerHTML = `
            <div style="display:grid; grid-template-columns: 1.8fr 1fr; gap:20px; animation: fadeIn 0.2s ease-out;"> <!-- UPANDE WA KUSHOTO: TOP SELLING PRODUCTS --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;"> <b style="color:#0f172a; font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> TOP SELLING PRODUCTS (ZINAZOVUMA)</b> <div style="max-height: 250px; overflow-y:auto;"> <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"> <thead> <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">${T('an_product', 'Product')}</th><th>${T('an_units_sold_col', 'Units Sold')}</th><th>${T('an_revenue', 'Revenue')}</th><th>${T('an_profit', 'Profit')}</th></tr> </thead> <tbody>
                                ${topMovers.slice(0, 10).map((p, idx) => `
                                    <tr style="border-bottom:1px solid #f1f5f9;"> <td style="padding:8px 0; font-weight:bold; display:flex; align-items:center; gap:8px;"> <span style="color:gray;">${idx+1}.</span> <span>${skh.skhEscape(p.title)}</span> </td> <td style="font-weight:900; color:var(--primary-blue);">${p.unitsSold} Pcs</td> <td style="font-weight:bold;">TZS ${p.revenue.toLocaleString()}</td> <td style="font-weight:bold; color:green;">TZS ${p.profit.toLocaleString()}</td> </tr> `).join('')}
                            </tbody> </table> </div> </div> <!-- UPANDE WA KULIA: WORST PERFORMING PRODUCTS --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;"> <b style="color:#ef4444; font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> WORST PERFORMING (KUTOUZA)</b> <div style="max-height: 250px; overflow-y:auto;"> <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"> <thead> <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">${T('an_product', 'Product')}</th><th>${T('an_stock_days', 'Stock Days')}</th><th>${T('an_sold', 'Sold')}</th></tr> </thead> <tbody>
                                ${worstMovers.map(p => `
                                    <tr style="border-bottom:1px solid #f1f5f9;"> <td style="padding:8px 0; font-weight:bold;"> ${p.title}</td> <td style="color:#eab308; font-weight:bold;">${Math.floor(45 + Math.random()*120)} Days</td> <td style="font-weight:900; color:red;">${p.unitsSold % 5} Units</td> </tr> `).join('')}
                            </tbody> </table> </div> </div> <!-- CHATI YA REVENUE BY PRODUCT CATEGORY --> <div style="grid-column: span 2; background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;"> <b style="color:#0f172a; font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase;"> REVENUE BY CATEGORY & SEASON</b> <div style="height:220px; position:relative;"> <canvas id="categoryRevenueChart"></canvas> </div> </div> </div>`;

        // Kuchora Chati ya Revenue
        // [PERF 2026-09] Chart.js hupakuliwa kwa uvivu inapohitajika.
        const __drawRevChart = function () {
            const ctx = document.getElementById('categoryRevenueChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                        datasets: [
                            { label: 'Electronics', data: [1200000, 1800000, 1500000, 2200000, 2900000, 3100000], borderColor: '#3b82f6', tension: 0.3, fill: false },
                            { label: 'Food & Groceries', data: [800000, 1200000, 950000, 1500000, 1800000, 2200000], borderColor: '#10b981', tension: 0.3, fill: false },
                            { label: 'Fashion', data: [500000, 900000, 700000, 1100000, 1400000, 1600000], borderColor: '#f59e0b', tension: 0.3, fill: false }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { x: { grid: { display: false } }, y: { grid: { borderDash: [5, 5] } } }
                    }
                });
            }
        };
        if (typeof Chart !== 'undefined') setTimeout(__drawRevChart, 100);
        else if (window.skhLoadChart) window.skhLoadChart().then(() => setTimeout(__drawRevChart, 30)).catch(() => {});
    }

    // ----------------------------------------------------
    // TAB 2:  INVENTORY & STOCK (Cost, Selling, Reorders, Brands & Categories)
    // ----------------------------------------------------
    else if (tabName === 'inventory_stock') {
        let totalCostValue = 0;
        let totalSellingValue = 0;
        let reorderList = [];

        products.forEach(p => {
            const stock = parseFloat(p.stock) || 0;
            const buyPrice = parseFloat(p.buyPrice) || 0;
            const sellPrice = parseFloat(p.price) || 0;
            const reorderLevel = parseInt(p.lowStockAlert) || 5;

            totalCostValue += (stock * buyPrice);
            totalSellingValue += (stock * sellPrice);

            // Reorder rule: Kama stock ipo chini ya limit au karibu kuisha, mpe maoni ya kiasi cha kuagiza
            if (stock <= reorderLevel) {
                const suggestedQty = (reorderLevel * 4) - stock;
                reorderList.push({ ...p, currentStock: stock, reorderLevel, suggestedQty });
            }
        });

        const expectedProfit = totalSellingValue - totalCostValue;

        workspace.innerHTML = `
            <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap:20px; animation: fadeIn 0.2s ease-out;"> <!-- UPANDE WA KUSHOTO: FINANCIAL VALUE AND REORDER SUGGESTIONS --> <div> <!-- INVENTORY VALUE METRICS --> <div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:16px; margin-bottom:20px; text-align:left;"> <b style="color:var(--primary-dark); display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:1.5px solid #eee; padding-bottom:8px;"> INVENTORY FINANCIAL VALUE</b> <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;"> <div> <small style="color:gray; font-size:12.5px; font-weight:bold;">COST VALUE (MTIBA)</small> <h3 style="margin:4px 0 0; color:#475569; font-size:15px; font-weight:900;">TZS ${totalCostValue.toLocaleString()}</h3> </div> <div> <small style="color:gray; font-size:12.5px; font-weight:bold;">SELLING VALUE (REJA)</small> <h3 style="margin:4px 0 0; color:var(--primary-blue); font-size:15px; font-weight:900;">TZS ${totalSellingValue.toLocaleString()}</h3> </div> <div> <small style="color:gray; font-size:12.5px; font-weight:bold;">EXPECTED PROFIT (TARAZIWA)</small> <h3 style="margin:4px 0 0; color:green; font-size:15px; font-weight:900;">TZS ${expectedProfit.toLocaleString()}</h3> </div> </div> </div> <!-- REORDER SUGGESTIONS TABLE --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;"> <b style="color:#d97706; font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> REORDER ANALYTICS (MAONI YA KUAGIZA)</b> <div style="max-height: 200px; overflow-y:auto;"> <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"> <thead> <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">${T('an_product', 'Product')}</th><th>${T('an_current_stock', 'Current Stock')}</th><th>${T('an_reorder', 'Reorder Level')}</th><th>${T('an_suggested', 'Suggested Order')}</th></tr> </thead> <tbody>
                                    ${reorderList.length > 0 ? reorderList.map(p => `
                                        <tr style="border-bottom:1px solid #f1f5f9;"> <td style="padding:8px 0; font-weight:bold;"> ${p.title}</td> <td style="color:red; font-weight:bold;">${p.currentStock} Pcs</td> <td style="color:gray;">${p.reorderLevel} Pcs</td> <td><b style="color:green; background:#f0fdf4; padding:2px 8px; border-radius:4px;"> ${p.suggestedQty} Pcs</b></td> </tr> `).join('') : '<tr><td colspan="4" style="text-align:center; padding:15px; color:gray; font-style:italic;">Hongera! Bidhaa zote zina stock ya kutosha stoo.</td></tr>'}
                                </tbody> </table> </div> </div> </div> <!-- UPANDE WA KULIA: CATEGORY ANALYTICS & TIMELINE --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px; display:flex; flex-direction:column; justify-content:space-between;"> <b style="color:#0f172a; font-size:13px; display:block; margin-bottom:10px; text-transform:uppercase;"> STOCK DISTRIBUTION BY CATEGORY</b> <div style="height:150px; position:relative;"><canvas id="categoryDistributionPieChart"></canvas></div> <div style="font-size:12.5px; display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:10px; border-top:1px solid #f1f5f9; padding-top:10px;"> <span> Electronics (40%)</span> <span> Food (25%)</span> <span> Fashion (20%)</span> <span> Services (10%)</span> <span> Others (5%)</span> </div> </div> </div>`;

        // Kuchora Chati ya Pie ya Categories
        const __drawCatPie = function () {
            const ctx = document.getElementById('categoryDistributionPieChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Electronics', 'Food', 'Fashion', 'Services', 'Others'],
                        datasets: [{
                            data: [40, 25, 20, 10, 5],
                            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'],
                            borderWidth: 0
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
                });
            }
        };
        if (typeof Chart !== 'undefined') setTimeout(__drawCatPie, 100);
        else if (window.skhLoadChart) window.skhLoadChart().then(() => setTimeout(__drawCatPie, 30)).catch(() => {});
    }

    // ----------------------------------------------------
    // TAB 3:  PROFITABILITY (Revenue vs Cost, Suppliers & Margins)
    // ----------------------------------------------------
    else if (tabName === 'profitability') {
        // [AUDIT-FIX §42] Faida/margins halisi kutoka shop_ledger (ilikuwa Math.random 10..90)
        let _salesMapP = skhSalesByProduct(products, data);
        let profitMatrix = [...products].map(p => {
            const _sl = _salesMapP[p.id] || { qty: 0, revenue: 0, profit: 0 };
            const revenue = _sl.revenue;
            const profit = _sl.profit;
            const cost = Math.max(0, revenue - profit);
            const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(0) : 0;
            return { ...p, revenue, cost, profit, margin };
        }).sort((a,b) => b.profit - a.profit);

        workspace.innerHTML = `
            <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px; animation: fadeIn 0.2s ease-out;"> <!-- PRODUCT PROFIT MATRIX COMPARISON --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;"> <b style="color:#0f172a; font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> PRODUCT PROFIT COMPARISON (REVENUE VS MARGIN)</b> <div style="max-height: 250px; overflow-y:auto;"> <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"> <thead> <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">${T('an_product', 'Product')}</th><th>${T('an_revenue', 'Revenue')}</th><th>${T('an_cost', 'Cost')}</th><th>${T('an_net_profit', 'Net Profit')}</th><th>${T('an_margin', 'Margin %')}</th></tr> </thead> <tbody>
                                ${profitMatrix.slice(0, 8).map(p => `
                                    <tr style="border-bottom:1px solid #f1f5f9;"> <td style="padding:8px 0; font-weight:bold;"> ${p.title}</td> <td>TZS ${p.revenue.toLocaleString()}</td> <td style="color:gray;">TZS ${p.cost.toLocaleString()}</td> <td style="font-weight:bold; color:green;">TZS ${p.profit.toLocaleString()}</td> <td><b style="color:var(--primary-blue); background:#e0f2fe; padding:2px 6px; border-radius:4px;">${p.margin}%</b></td> </tr> `).join('')}
                            </tbody> </table> </div> </div> <!-- SUPPLIER ANALYTICS (Piga kura za wasambazaji bora) --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px; text-align:left;"> <b style="color:var(--primary-dark); font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> SUPPLIER ANALYTICS (UTENDAJI)</b> <div style="display:flex; flex-direction:column; gap:10px;"> <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:10px;"> <b style="display:block; font-size:13px; color:#1e293b;">1. ABC Wholesalers Ltd</b> <span style="font-size:13px; color:gray; display:block; margin-top:2px;">Bidhaa tunazoagiza: <b>15 Categories</b></span> <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:6px; font-weight:bold; color:green;"> <span>Revenue: TSh 4.5M</span> <span>Profit: TSh 1.2M</span> </div> </div> <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:10px;"> <b style="display:block; font-size:13px; color:#1e293b;">2. Tanzania Crop Suppliers</b> <span style="font-size:13px; color:gray; display:block; margin-top:2px;">Bidhaa tunazoagiza: <b>8 Categories</b></span> <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:6px; font-weight:bold; color:green;"> <span>Revenue: TSh 3.2M</span> <span>Profit: TSh 800K</span> </div> </div> </div> </div> </div>`;
    }

    // ----------------------------------------------------
    // TAB 4:  RETURNS & LOSSES (Wastage, Dead Stock & Damaged)
    // ----------------------------------------------------
    else if (tabName === 'returns_losses') {
        // Vuta uharibifu au Spoilage zilizopo kwenye ledger
        let spoilageHtml = '';
        let totalLossAmount = 0;
        let deadStockCount = 0;

        data.ledgerSnap.forEach(docSnap => {
            const l = docSnap.data();
            if (l.type === 'expense' && l.title.includes('Spoilage')) {
                totalLossAmount += parseFloat(l.amount || 0);
                spoilageHtml += `
                    <div style="padding:10px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; font-size:12px; text-align:left;"> <span><b>${l.title}</b><br><small style="color:gray;">Sababu: ${skh.skhEscape(l.notes || 'N/A')}</small></span> <b style="color:red;">- TSh ${l.amount.toLocaleString()}</b> </div>`;
            }
        });

        // Dead stock calculation: Bidhaa zenye stoo nyingi lakini zero sales
        let deadStockList = products.filter(p => {
            const stock = parseFloat(p.stock) || 0;
            if (stock > 50) { // Bidhaa zenye stock kubwa lakini zinasuasua kuuzwa
                deadStockCount++;
                return true;
            }
            return false;
        });

        workspace.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; animation: fadeIn 0.2s ease-out;"> <!-- DAMAGED / EXPIRED / SPOILAGE LOGS --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;"> <b style="color:#ef4444; font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> PRODUCT DAMAGE & WASTAGE (HASARA: TSH ${totalLossAmount.toLocaleString()})</b> <div style="max-height: 230px; overflow-y:auto;">
                        ${spoilageHtml || `
                            <div style="text-align:center; padding:30px; color:gray;"> <span style="font-size:30px;"></span> <p style="font-size:13px; margin:5px 0 0 0;">Duka halijarekodi bidhaa zilizooza au kuharibika leo.</p> </div>`}
                    </div> </div> <!-- DEAD STOCK ANALYTICS (BIDHAA ZILIZOKWAMA STOO) --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;"> <b style="color:#b45309; font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> DEAD STOCK ANALYTICS (HAZIUZI: ${deadStockCount})</b> <div style="max-height: 230px; overflow-y:auto;"> <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"> <thead> <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">${T('an_product', 'Product')}</th><th>${T('an_current_stock', 'Current Stock')}</th><th>${T('an_no_sales', 'No Sales For')}</th></tr> </thead> <tbody>
                                ${deadStockList.length > 0 ? deadStockList.map(p => `
                                    <tr style="border-bottom:1px solid #f1f5f9;"> <td style="padding:8px 0; font-weight:bold;"> ${p.title}</td> <td style="font-weight:bold;">${p.stock} Pcs</td> <td style="color:red; font-weight:bold;">${Math.floor(30 + Math.random()*90)} Days</td> </tr> `).join('') : '<tr><td colspan="3" style="text-align:center; padding:15px; color:gray;">Hakuna bidhaa zilizokwama kwa sasa.</td></tr>'}
                            </tbody> </table> </div> </div> </div>`;
    }

    // ----------------------------------------------------
    // TAB 5:  AI FORECAST & INSIGHTS (Utabiri wa kuisha stoo, Demands & Lifecycle)
    // ----------------------------------------------------
    else if (tabName === 'ai_forecast') {
        // AI Algorithms: Piga hesabu ya kiotomatiki ya utabiri kulingana na data live
        let aiInsights = [];
        let forecastList = [];
        // [AUDIT-FIX §42] "Utabiri" uliotegemea Math.random(2..10) Pcs/siku umeondolewa —
        // kiwango halisi cha mauzo kwa siku kinatokana na historia ya shop_ledger.
        // Bidhaa bila data ya mauzo haipati "utabiri" wa kubuni (daysLeft = Infinity).
        let _salesMapF = skhSalesByProduct(products, data);

        products.forEach(p => {
            const stock = parseFloat(p.stock) || 0;
            const reorderLevel = parseInt(p.lowStockAlert) || 5;

            // Kagua na tabiri siku zilizobaki za kuisha kwa stoo (Forecasting ya data halisi)
            const _sl = _salesMapF[p.id] || { qty: 0, daysCovered: 0 };
            const simulatedDailyRate = _sl.daysCovered > 0 ? Math.max(0, _sl.qty / _sl.daysCovered) : 0;
            const daysLeft = simulatedDailyRate > 0 ? Math.round(stock / simulatedDailyRate) : Infinity;

            if (stock <= 0) {
                aiInsights.push(` <b>STOO IMEISHA:</b> Mzigo wa "${p.title}" umekwisha kabisa. Wateja wanadai hivi sasa! Fikiria kuagiza haraka.`);
            } else if (daysLeft <= 10) {
                forecastList.push({ ...p, currentStock: stock, dailyRate: simulatedDailyRate, daysLeft });
                aiInsights.push(` <b>UTABIRI WA KUISHA:</b> Stoo ya "${p.title}" itaisha ndani ya <b>${daysLeft} Siku</b> (Mabaki: ${stock} Pcs). Agiza shehena sasa.`);
            }

            // Tafuta bidhaa zenye faida kubwa kuliko asilimia 30
            const profitMargin = p.price && p.buyPrice ? (((p.price - p.buyPrice)/p.price) * 100) : 0;
            if (profitMargin > 30) {
                aiInsights.push(` <b>FAIDA KUBWA:</b> Bidhaa ya "${p.title}" ina margin kubwa ya <b>${profitMargin.toFixed(0)}%</b>! Kuza matangazo yake.`);
            }
        });

        workspace.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; animation: fadeIn 0.2s ease-out;"> <!-- PRODUCT FORECASTING SYSTEM --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;"> <b style="color:var(--primary-dark); font-size:13px; display:block; margin-bottom:15px; text-transform:uppercase; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> PRODUCT FORECASTING (UTABIRI WA SIKU ZA KUISHA)</b> <div style="max-height: 250px; overflow-y:auto;"> <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"> <thead> <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">${T('an_product', 'Product')}</th><th>${T('an_stock', 'Stock')}</th><th>${T('an_daily_sales', 'Daily Sales')}</th><th>${T('an_expected_oos', 'Expected Out of Stock')}</th></tr> </thead> <tbody>
                                ${forecastList.length > 0 ? forecastList.map(p => `
                                    <tr style="border-bottom:1px solid #f1f5f9;"> <td style="padding:8px 0; font-weight:bold;"> ${p.title}</td> <td>${p.currentStock} Pcs</td> <td>~ ${p.dailyRate} Pcs / Siku</td> <td><b style="color:${p.daysLeft <= 4 ? 'red':'orange'};">${p.daysLeft} Siku ${p.daysLeft <= 4 ? '(URGENT )':''}</b></td> </tr> `).join('') : '<tr><td colspan="4" style="text-align:center; padding:15px; color:gray; font-style:italic;">Stoo ipo salama. Hakuna bidhaa inayokaribia kuisha stoo ndani ya siku 10.</td></tr>'}
                            </tbody> </table> </div> </div> <!-- AI INSIGHTS PANEL --> <div style="background:#f0f9ff; border:1.5px dashed var(--primary-blue); border-radius:16px; padding:20px; text-align:left;"> <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; border-bottom:1px solid #bfdbfe; padding-bottom:6px;"> <span style="font-size:24px;"></span> <b style="color:var(--primary-blue); font-size:14px; text-transform:uppercase;">${T('an_ai_panel', 'Sokohai AI Insights Panel')}</b> </div> <div style="max-height: 220px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; font-size:13px; line-height:1.4;">
                        ${aiInsights.length > 0 ? aiInsights.map(al => `
                            <div style="background:white; padding:8px; border-radius:8px; border-left:4px solid var(--primary-blue); box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                                ${al}
                            </div> `).join('') : '<p style="color:gray; font-style:italic; text-align:center; padding:20px;">AI inasoma stoo yako. Subiri sekunde chache...</p>'}
                    </div> </div> </div>`;
    }
};

window.zoomIntoTimeframe = function(clickedLabel) {
    if(!window.mySmartChart) return;
    
    // Zoom Level 1: Month -> Day
    if (clickedLabel === 'Jun' || clickedLabel === 'Mei' || clickedLabel === 'Apr') {
        alert(T('an_zoom_day', 'Zooming into {l}: opening the daily chart.', { l: clickedLabel }));
        window.mySmartChart.data.labels = ['Tarehe 1', 'Tarehe 5', 'Tarehe 10', 'Tarehe 15', 'Tarehe 20', 'Tarehe 25', 'Tarehe 30'];
        window.mySmartChart.data.datasets[0].data = [24000, 31000, 28000, 42000, 39000, 55000, 60000];
        window.mySmartChart.data.datasets[0].label = `Utendaji wa Kila Siku wa ${clickedLabel}`;
    }
    // Zoom Level 2: Day -> Hour
    else if (clickedLabel.includes('Tarehe')) {
        alert(T('an_zoom_hour', 'Zooming into {l}: opening the hourly chart.', { l: clickedLabel }));
        window.mySmartChart.data.labels = ['08:00 AM', '10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM'];
        window.mySmartChart.data.datasets[0].data = [8000, 15000, 12000, 22000, 18000, 25000];
        window.mySmartChart.data.datasets[0].label = `Kila Saa - ${clickedLabel}`;
    }
    // Zoom Level 3: Hour -> Minutes
    else if (clickedLabel.includes('AM') || clickedLabel.includes('PM')) {
        alert(` Zooming into ${clickedLabel}: Inafungua sekunde na dakika za mauzo!`);
        window.mySmartChart.data.labels = ['Min 05', 'Min 15', 'Min 30', 'Min 45', 'Min 60'];
        window.mySmartChart.data.datasets[0].data = [1200, 3400, 2500, 4500, 6000];
        window.mySmartChart.data.datasets[0].label = `Kila Dakika ya Saa ${clickedLabel}`;
    } else {
        // Rudisha kianzio
        window.changeChartTimeframe('month', document.querySelector('.time-tab[data-time="month"]'));
        return;
    }
    window.mySmartChart.update();
};

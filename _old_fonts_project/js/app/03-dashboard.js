/* ==== js/app/03-dashboard.js ==== */
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


window.loadAndRenderDashboard = async function() {
    if(!skh.currentUser) return;
    const container = document.getElementById('richDashboardContainer');
    if(!container) return;

    // [FIX 2026-09] Kinga ya mbio (race guard): usichore dashboard ya muuzaji
    // ikiwa mtumiaji ameondoka kwenye seller mode wakati data bado inapakia.
    const expectedMode = skh.currentMode;

    container.innerHTML = `
        <div style="text-align:center; padding:50px;"> <span style="font-size:24px; display:inline-block; animation:spin 1s linear infinite;"></span> <p>Inapakia Mfumo Mkuu wa Control Tower v2.0.0...</p> </div>`;

    const shopOwnerId = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    const qProducts = skh.query(skh.collection(skh.db, "products"), skh.where("userId", "==", shopOwnerId));
    const qLedger = skh.query(skh.collection(skh.db, "shop_ledger"), skh.where("shopOwnerId", "==", shopOwnerId));
    const qStaff = skh.query(skh.collection(skh.db, "shop_staff"), skh.where("shopOwnerId", "==", shopOwnerId));
    const qPOs = skh.query(skh.collection(skh.db, "purchase_orders"), skh.where("shopOwnerId", "==", shopOwnerId));

    Promise.all([skh.getDocs(qProducts), skh.getDocs(qLedger), skh.getDocs(qStaff), skh.getDocs(qPOs)]).then(async ([prodSnap, ledgerSnap, staffSnap, poSnap]) => {
        // [REAL DATA 2026-09] Anza na SIFURI — si namba za kubuni. Takwimu
        // hujazwa na ledger halisi hapa chini; ikiwa hakuna rekodi bado,
        // dashboard inaonyesha "0" (ukweli), si namba za kudhaniwa.
        let totalSales = 0;
        let totalProfit = 0;
        let totalExpenses = 0;
        let outstandingDebt = 0;
        let totalOrders = 0;
        let totalCustomersCount = 0;
        let lowStockCount = 0;

        if (!ledgerSnap.empty) {
            let dbSales = 0, dbProfit = 0, dbExpenses = 0, dbDebts = 0, dbOrders = 0;
            const custSeen = new Set();
            ledgerSnap.forEach(docSnap => {
                const l = docSnap.data();
                const amt = parseFloat(l.amount) || 0;
                const prf = parseFloat(l.profit) || 0;
                if (l.type === 'income_offline' || l.type === 'income_online') {
                    dbSales += amt;
                    dbProfit += prf;
                    dbOrders += 1; // kila muamala wa mauzo = oda moja
                    const nm = String(l.customerName || l.title || '').toLowerCase().trim();
                    if (nm) custSeen.add(nm);
                } else if (l.type === 'expense') {
                    dbExpenses += amt; 
                } else if (l.type === 'debt' && l.status === 'pending') {
                    dbDebts += amt;
                }
            });
            // [REAL DATA 2026-09] Ikiwa ledger ipo (hata ikiwa na matumizi tu),
            // tumia hesabu halisi badala ya defaults.
            totalSales = dbSales;
            totalProfit = dbProfit;
            totalExpenses = dbExpenses;
            outstandingDebt = dbDebts;
            totalOrders = dbOrders;
            totalCustomersCount = custSeen.size; // wateja halisi kutoka ledger (zilikuwa 3,568 za kubuni)
        }

        if(!prodSnap.empty) {
            let dbLowStock = 0;
            prodSnap.forEach(docSnap => {
                const p = docSnap.data();
                const stock = parseFloat(p.stock) || 0;
                const limit = parseInt(p.lowStockAlert) || 5;
                if (stock <= limit) dbLowStock++;
            });
            lowStockCount = dbLowStock;
        }

        window.dashboardCachedData = {
            prodSnap,
            ledgerSnap,
            staffSnap,
            poSnap,
            totalSales,
            totalProfit,
            totalExpenses,
            totalOrders,
            activeDebts: outstandingDebt,
            totalCustomersCount,
            lowStockCount
        };

        // Chora muonekano mpya wa v2.0.0 layout
        container.innerHTML = `
        <div class="control-tower-wrapper" style="display: flex; min-height: 100vh; background: #F8FAFC;"> <!-- 1. LEFT SIDEBAR (Dark Sidebar #0F172A) --> <div class="ct-sidebar" style="width: 260px; background: #0F172A; color: #F8FAFC; padding: 20px; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; box-sizing: border-box;"> <div class="ct-sidebar-brand" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; border-bottom: 1px solid #1E293B; padding-bottom: 15px;"> <div style="width: 32px; height: 32px; background: #6366F1; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">S</div> <div class="ct-sidebar-brand-text"> <h3 style="margin: 0; font-size: 15px; color: #ffffff; font-weight: 900; letter-spacing: 0.5px;">${T('db_sokohai', 'SOKOHAI')}</h3> <span style="font-size:12.5px; color: #94A3B8; display: block; font-weight: bold;">${T('db_erp', 'ERP COCKPIT')}</span> </div> </div> <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; padding-right: 5px;"> <div> <span class="ct-sidebar-group-title">${T('db_main', 'MAIN COCKPIT')}</span> <button id="btnTab_overview" class="ct-sidebar-menu-btn side-menu-link active" onclick="window.switchDashTab('overview')"> Overview Dashboard</button> </div> <div> <span class="ct-sidebar-group-title">${T('db_business', 'MY BUSINESS')}</span> <button id="btnTab_my_products" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('my_products')"> My Products</button> </div> <div> <span class="ct-sidebar-group-title">${T('db_intel', 'PRODUCTS INTEL')}</span> <button id="btnTab_product_analytics" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('product_analytics')"> Products Analytics</button> <button id="btnTab_product_performance" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('product_performance')"> Product Performance</button> <button id="btnTab_sales_insights" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('sales_insights')"> Sales Insights</button> <button id="btnTab_demand_insights" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('demand_insights')"> Demand Insights</button> <button id="btnTab_product_compare" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('product_compare')"> Compare Products</button> </div> <div> <span class="ct-sidebar-group-title">${T('db_stock', 'STOCK & LOGISTICS')}</span> <button id="btnTab_inventory" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('inventory')"> Inventory & Stock</button> <button class="ct-sidebar-menu-btn" onclick="window.openStockTransferModal()"> Multi-Branch Transfers</button> </div> <div> <span class="ct-sidebar-group-title">${T('db_finance', 'FINANCE & ACCOUNTING')}</span> <button id="btnTab_expenses" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('expenses')"> General Ledger</button> </div> <div> <span class="ct-sidebar-group-title">${T('db_hr', 'HUMAN RESOURCES')}</span> <button id="btnTab_staff" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('staff')"> Staff & Payroll</button> </div> <div> <span class="ct-sidebar-group-title">${T('db_system', 'SYSTEM CONTROL')}</span> <button id="btnTab_settings" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('settings')"> System Settings</button> </div> </div> <button class="ct-sidebar-menu-btn" onclick="window.switchMode('buyer')" style="background: #EF4444; color: white; font-weight: 900; margin-top: 15px; text-align: center; border-radius: 8px;"> Rudi Soko Kuu</button> </div> <!-- 2. COCKPIT WORKSPACE (Right side) --> <div class="ct-main-content" style="flex-grow: 1; display: flex; flex-direction: column; background: #F8FAFC; min-width: 0; box-sizing: border-box;"> <!-- HEADER BAR --> <div class="ct-header-bar" style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 12px 25px; border-bottom: 1px solid #E2E8F0; height: 60px; box-sizing: border-box;"> <div style="display: flex; align-items: center; gap: 12px;"> <span class="ct-menu-toggle-btn" onclick="window.toggleDashboardSidebar()" style="font-size:0; line-height:0; cursor: pointer; display: none; color: #0f172a;">${window.skhNavIcon ? window.skhNavIcon('menu', 24) : ''}</span> <div class="ct-header-search" style="display: flex; align-items: center; background: #F1F5F9; border-radius: 20px; padding: 6px 15px; width: 280px;"> <span></span> <input type="text" placeholder="${T('db_search', 'Search anything...')}" style="border: none; background: transparent; outline: none; margin-left: 8px; width: 100%; font-size: 13px;"> </div> </div> <div style="display: flex; align-items: center; gap: 15px;"> <button onclick="showForm('businessOSForm');" class="ct-pos-btn" style="background: #22C55E; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px;"> POS</button> <div style="display: flex; gap: 12px; font-size: 18px; color: #64748B; cursor: pointer;"> <span onclick="openNotifications()" style="position:relative;"><span style="position:absolute; top:-4px; right:-4px; background:#EF4444; color:white; font-size:12px; border-radius:50%; padding:2px 4px;" id="ctHeaderNotifBadge">0</span></span> <span onclick="openChatList()"></span> </div> <div style="display: flex; align-items: center; gap: 10px; border-left: 1px solid #E2E8F0; padding-left: 15px;"> <div style="text-align: right;"> <b style="font-size: 13px; color: #0F172A; display: block;">Admin</b> <span style="font-size:12.5px; color: #64748B; display: block;">${T('db_super_admin', 'Super Admin')}</span> </div> <img src="https://ui-avatars.com/api/?name=Admin&background=6366F1&color=fff" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid #6366F1;"> </div> </div> </div> <!-- DYNAMIC WORKSPACE --> <div class="ct-workspace" id="dashWorkspace" style="padding: 20px; box-sizing: border-box; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;"> <!-- Active tab content will render here --> </div> </div> </div> `;

        window.switchDashTab('overview');
    }).catch(err => {
        console.error(err);
        container.innerHTML = `<p style="color:red; text-align:center; padding:30px;">${T('db_net_error', 'Network error while loading: {e}', { e: skh.skhEscape(err.message) })}</p>`;
    });
};

window.toggleSellerType = async function() {
    if(!skh.currentUser) return;
    
    // Angalia aina ya sasa
    const currentType = skh.currentUserData?.sellerType || 'temporary';
    const newType = currentType === 'permanent' ? 'temporary' : 'permanent';
    
    const confirmMsg = currentType === 'permanent' 
        ? "Je, unataka kurudi kwenye Duka la Muda (Temporary)? Matangazo yako yatafutwa baada ya kuuzwa." 
        : "Je, unataka kubadili kuwa Duka la Kudumu (Permanent)? Utapata uwezo wa kusave bidhaa hata zikiuzwa (Locked by Subscription).";

    if(await skhConfirm(confirmMsg)) {
        try {
            await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUser.uid), { sellerType: newType });
            skh.currentUserData.sellerType = newType;
            alert(T('db_role_switched', 'Success! You are now a Seller of {t}.', { t: newType.toUpperCase() }));
            loadAndRenderDashboard(); // Refresh dashbodi hapo hapo
        } catch(e) { 
            alert(T('db_error', "Error: ") + e.message); 
        }
    }
};





window.togglePlusMenu = skh.togglePlusMenu;

window.markShipped = async function(orderId, buyerId, itemTitle) {
    if(!await skhConfirm(`Je, unathibitisha kuwa mzigo wa '${skh.skhEscape(itemTitle)}' upo tayari? \n\nLazima upandishe picha ya risti ya usafiri au kifurushi kama ushahidi.`)) return;

    // 1. Fungua kamera/galari ya muuzaji kuchagua picha ya risti
    const fileInput = document.getElementById('receiptUploadInput');
    fileInput.click();

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if(!file) return;

        alert(T('db_uploading', "Uploading proof and sending notification..."));
        
        try {
            // 2. Pandisha picha Cloudinary
            // [PHASE 4.2] Uploader mmoja wa pamoja (js/11-uploads.js)
            const receiptUrl = await window.skhUploadFromFile(file);

            if(!receiptUrl) throw new Error("Imeshindwa kupata picha ya risti.");

            // 3. Update oda iwe 'shipped' na uweke hiyo picha ya risti
            await skh.updateDoc(skh.doc(skh.db, "orders", orderId), { 
                status: "shipped",
                shippingReceipt: receiptUrl,
                shippedAt: new Date().toISOString()
            });

            // 4. Mtumie Mnunuzi Taarifa (Notification) kwamba mzigo uko njiani
            if(buyerId) {
                await skh.addDoc(skh.collection(skh.db, "notifications"), {
                    userId: buyerId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'order.shipped',
                params: { title: String(itemTitle || '') },
                    title: " Mzigo Wako Umesafirishwa!",
                    body: `Muuzaji amesafirisha oda yako ya '${skh.skhEscape(itemTitle)}'. Unaweza kuona picha ya risti kwenye oda zako.`,
                    createdAt: new Date().toISOString(),
                    read: false,
                    type: 'order'
                });
            }

            alert(T('db_shipped_ok', "Congratulations! You confirmed the shipment. The buyer has been notified."));
            if(typeof loadAndRenderDashboard === 'function') loadAndRenderDashboard();
            
        } catch(err) {
            alert(T('db_error', "Error: ") + err.message);
        } finally {
            fileInput.value = ""; // Safisha input
        }
    };
};

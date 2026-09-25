/* ==== js/app/15-pos-sales.js ==== */
import { skh } from './00-bootstrap.js';

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

window.switchSmartChart = function(type) {
    if(!window.mySmartChart) return;
    const btnSales = document.getElementById('btnChSales');
    const btnProfit = document.getElementById('btnChProfit');
    const activeTimeframe = document.querySelector('.time-tab.active')?.getAttribute('data-time') || 'month';

    if(type === 'sales') {
        window.mySmartChart.data.datasets[0].label = `Mauzo kulingana na ${activeTimeframe.toUpperCase()}`;
        window.mySmartChart.data.datasets[0].data = window.salesDataCache || [0,0,0,0,0,0];
        window.mySmartChart.data.datasets[0].borderColor = "#03509d";
        window.mySmartChart.data.datasets[0].backgroundColor = "rgba(3, 80, 157, 0.1)";
        if(btnSales) { btnSales.style.background = "var(--primary-blue)"; btnSales.style.color = "white"; }
        if(btnProfit) { btnProfit.style.background = "#eee"; btnProfit.style.color = "#475569"; }
    } else {
        window.mySmartChart.data.datasets[0].label = `Faida kulingana na ${activeTimeframe.toUpperCase()}`;
        window.mySmartChart.data.datasets[0].data = window.profitDataCache || [0,0,0,0,0,0];
        window.mySmartChart.data.datasets[0].borderColor = "var(--green)";
        window.mySmartChart.data.datasets[0].backgroundColor = "rgba(16, 185, 129, 0.1)";
        if(btnSales) { btnSales.style.background = "#eee"; btnSales.style.color = "#475569"; }
        if(btnProfit) { btnProfit.style.background = "var(--green)"; btnProfit.style.color = "white"; }
    }
    window.mySmartChart.update();
};

window.changeChartTimeframe = function(timeframe, el) {
    document.querySelectorAll('.time-tab').forEach(b => b.classList.remove('active'));
    el.classList.add('active');

    let labels = [];
    let salesData = [];
    let profitData = [];

    if (timeframe === 'hour') {
        labels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
        salesData = [50000, 120000, 80000, 240000, 150000, 90000];
        profitData = [15000, 40000, 25000, 85000, 50000, 30000];
    } else if (timeframe === 'day') {
        labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        salesData = [250000, 320000, 180000, 420000, 550000, 700000, 450000];
        profitData = [80000, 110000, 60000, 150000, 200000, 250000, 140000];
    } else if (timeframe === 'week') {
        labels = ['Wiki 1', 'Wiki 2', 'Wiki 3', 'Wiki 4'];
        salesData = [1200000, 1800000, 1500000, 2200000];
        profitData = [400000, 600000, 500000, 750000];
    } else if (timeframe === 'month') {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'];
        salesData = window.salesDataCache || [5000000, 6200000, 4800000, 7100000, 8500000, 9200000];
        profitData = window.profitDataCache || [1500000, 2100000, 1400000, 2400000, 2900000, 3100000];
    } else {
        labels = ['2023', '2024', '2025', '2026'];
        salesData = [45000000, 62000000, 78000000, 95000000];
        profitData = [15000000, 20000000, 26000000, 32000000];
    }

    window.salesDataCache = salesData;
    window.profitDataCache = profitData;

    if(window.mySmartChart) {
        window.mySmartChart.data.labels = labels;
        const isSales = window.mySmartChart.data.datasets[0].label.includes('Mauzo') || window.mySmartChart.data.datasets[0].label.includes('sales');
        window.switchSmartChart(isSales ? 'sales' : 'profit');
    }
};

window.switchStockTab = function(tab) {
    const sectionNew = document.getElementById('formNewStockSection');
    const sectionAdd = document.getElementById('formAddStockSection');
    const tabNew = document.getElementById('btnTabNewStock');
    const tabAdd = document.getElementById('btnTabAddStock');
    
    if (tab === 'new') {
        sectionNew.style.display = 'block';
        sectionAdd.style.display = 'none';
        tabNew.style.background = 'var(--primary-blue)';
        tabNew.style.color = 'white';
        tabAdd.style.background = '#f1f5f9';
        tabAdd.style.color = '#475569';
    } else {
        sectionNew.style.display = 'none';
        sectionAdd.style.display = 'block';
        tabNew.style.background = '#f1f5f9';
        tabNew.style.color = '#475569';
        tabAdd.style.background = 'var(--primary-blue)';
        tabAdd.style.color = 'white';
    }
};

window.searchExistingStockForUpdate = async function() {
    const queryStr = document.getElementById('searchStockToUpdate').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('stockSearchResults');
    if (!resultsDiv) return;
    if (queryStr.length < 2) { resultsDiv.innerHTML = ''; return; }

    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
    const q = skh.query(skh.collection(skh.db, "products"), skh.where("userId", "==", ownerUid));
    const snap = await skh.getDocs(q);
    
    let html = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.title.toLowerCase().includes(queryStr)) {
            html += `
                <div onclick="window.selectStockForUpdate('${docSnap.id}', '${d.title}', ${d.stock || 0})" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; background:white;"> <b> ${d.title}</b> (Stock ya sasa: ${d.stock || 0} Pcs)
                </div>`;
        }
    });
    resultsDiv.innerHTML = html || '<p style="padding:10px; font-size:13px; color:gray;">Haikupatikana...</p>';
};

window.selectStockForUpdate = function(id, name, currentQty) {
    document.getElementById('updateStockId').value = id;
    document.getElementById('updateStockName').innerText = name;
    document.getElementById('updateStockCurrentQty').innerText = currentQty + " " + T('pos_pcs', 'pcs');
    document.getElementById('selectedStockDetail').style.display = 'block';
    document.getElementById('stockSearchResults').innerHTML = '';
};

window.updateExistingStockAmount = async function() {
    const id = document.getElementById('updateStockId').value;
    const qtyNew = parseInt(document.getElementById('offInvQtyNew').value) || 0;
    const buyPriceNew = parseFloat(document.getElementById('offInvBuyPriceNew').value) || 0;

    if (!id || qtyNew <= 0) {
        alert(T('pos_pick_product_qty', "Select a product and enter the correct quantity."));
        return;
    }

    try {
        const itemRef = skh.doc(skh.db, "products", id); 
        await skh.updateDoc(itemRef, {
            stock: skh.increment(qtyNew),
            ...(buyPriceNew > 0 && { buyPrice: buyPriceNew })
        });

        alert(T('pos_stock_received', "New stock received and added successfully."));
        document.getElementById('offlineStockModal').style.display = 'none';
        document.getElementById('selectedStockDetail').style.display = 'none';
        document.getElementById('searchStockToUpdate').value = '';
        document.getElementById('offInvQtyNew').value = '';
        document.getElementById('offInvBuyPriceNew').value = '';
        window.loadAndRenderDashboard();
    } catch(e) { alert("Kosa: " + e.message); }
};

window.saveOfflineInventoryItem = async function() {
    const nameEl = document.getElementById('offInvName');
    const catEl = document.getElementById('offInvCategory');
    const unitEl = document.getElementById('offInvUnit');
    const pcsPerUnitEl = document.getElementById('offInvPcsPerUnit');
    const qtyUnitsEl = document.getElementById('offInvQty');
    const buyPriceEl = document.getElementById('offInvBuyPrice');
    const sellPriceEl = document.getElementById('offInvSellPrice');

    const name = nameEl ? nameEl.value.trim() : "";
    const cat = catEl ? catEl.value : "";
    const unit = unitEl ? unitEl.value : "";
    const pcsPerUnit = pcsPerUnitEl ? (parseInt(pcsPerUnitEl.value) || 1) : 1;
    const qtyUnits = qtyUnitsEl ? (parseInt(qtyUnitsEl.value) || 0) : 0;
    const buyPrice = buyPriceEl ? (parseFloat(buyPriceEl.value) || 0) : 0;
    const sellPrice = sellPriceEl ? (parseFloat(sellPriceEl.value) || 0) : 0;

    if (!name || qtyUnits <= 0 || sellPrice <= 0) {
        alert(T('pos_fill_name_stock_price', "Enter the product name, available stock, and a valid price."));
        return;
    }

    try {
        const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
        const docId = await skh.saveData('products', {
            title: name,
            price: sellPrice,
            buyPrice: buyPrice,
            category: cat,
            unitType: unit,
            pcsPerUnit: pcsPerUnit,
            stock: qtyUnits * pcsPerUnit, 
            isOffline: true, 
            isOnline: true, 
            userId: ownerUid,
            ownerName: skh.currentUser.displayName || "Duka letu",
            userEmail: skh.currentUser.email,
            createdAt: new Date().toISOString()
        });

        if (docId) {
            alert(T('pos_product_registered', 'Product "{n}" has been registered in the main database!\nIt is now live on the Online Market and in the POS.', { n: name }));
            const stockModal = document.getElementById('offlineStockModal');
            if (stockModal) stockModal.style.display = 'none';
            if (nameEl) nameEl.value = "";
            if (qtyUnitsEl) qtyUnitsEl.value = "";
            if (buyPriceEl) buyPriceEl.value = "";
            if (sellPriceEl) sellPriceEl.value = "";
            window.loadAndRenderDashboard();
        }
    } catch (e) {
        alert(T('pos_stock_save_error', "Error saving stock: ") + e.message);
    }
};

window.openOfflineSaleForm = function(itemId, name, unit, pcsPerUnit, sellPrice) {
    const existingModal = document.getElementById('quickOfflineSaleModal');
    if (existingModal) existingModal.remove();

    const div = document.createElement('div');
    div.id = 'quickOfflineSaleModal';
    div.className = 'overlay-menu';
    div.style.cssText = 'z-index: 1000002; display:flex;';
    div.innerHTML = `
        <div style="background:white; padding:25px; border-radius:24px; width:90%; max-width:390px; box-shadow: 0 15px 40px rgba(0,0,0,0.3); text-align:center;"> <h3 style="margin-top:0; color:var(--primary-dark); font-size:18px;"> ${T('pos_quick_sale', 'POS: QUICK SALE')}</h3> <b style="font-size:15px; color:#1e293b; display:block; margin-bottom:12px;">${name}</b> <div style="display:flex; gap:10px; margin-bottom:12px;"> <div style="flex:1;"> <label style="font-size:12.5px; font-weight:bold; display:block; text-align:left;">${T('pos_measure', 'MEASURE')}</label> <select id="saleMethod" onchange="calculatePosTotal(${sellPrice}, ${pcsPerUnit})" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;"> <option value="pc">Piece (Kipande) @ TSh ${sellPrice.toLocaleString()}</option> <option value="unit">${unit} @ TSh ${(sellPrice * pcsPerUnit).toLocaleString()}</option> </select> </div> <div style="flex:1;"> <label style="font-size:12.5px; font-weight:bold; display:block; text-align:left;">${T('pos_qty', 'QUANTITY (QTY)')}</label> <input type="number" id="saleQty" value="1" oninput="calculatePosTotal(${sellPrice}, ${pcsPerUnit})" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; text-align:center; font-weight:bold;"> </div> </div> <div style="background:#fffbeb; padding:10px; border-radius:10px; margin-bottom:12px; border:1px solid var(--gold);"> <span style="font-size:13px; color:#64748b;">${T('pos_total_due', 'Total to Pay:')}</span><br> <b id="posTotalDisplay" style="font-size:18px; color:var(--terracotta);">TSh ${sellPrice.toLocaleString()}</b> </div> <label style="font-size:13px; font-weight:bold; display:block; text-align:left; margin-bottom:4px;">${T('pos_payment_method', 'PAYMENT METHOD')}</label> <select id="posPaymentMethod" onchange="togglePosDebtFields()" style="width:100%; padding:12px; margin-bottom:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;"> <option value="Cash"> ${T('pos_cash', 'Cash')}</option> <option value="Mpesa"> ${T('pos_mobile', 'Mobile (Mpesa/Tigo/Airtel)')}</option> <option value="Deni"> ${T('pos_credit', 'Credit (pay later)')}</option> </select> <div id="posDebtFields" style="display:none; background:#fef2f2; padding:12px; border-radius:12px; border:1.5px dashed #ef4444; margin-bottom:12px; text-align:left;"> <label style="font-size:13px; font-weight:bold; color:#ef4444;">${T('pos_debt_customer_name_label', 'Customer Name (Credit) *')}</label> <input type="text" id="posDebtClientName" placeholder="${T('pos_debt_customer_ph', 'e.g. Mama Asha')}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:8px;"> <label style="font-size:13px; font-weight:bold; color:#ef4444;">${T('pos_customer_phone', 'Customer Phone Number')}</label> <input type="tel" id="posDebtClientPhone" placeholder="07XXXXXXXX" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:8px;"> <label style="font-size:13px; font-weight:bold; color:#ef4444;">${T('pos_deposit_paid', 'Amount Paid Upfront (TSh)')}</label> <input type="number" id="posDebtDepositPaid" value="0" placeholder="0" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1;"> </div> <button onclick="processSmartOfflineSale('${itemId}', ${pcsPerUnit}, ${sellPrice}, '${name}', '${unit}')" style="width:100%; padding:16px; background:var(--green); color:white; border:none; border-radius:12px; font-weight:900; font-size:14px; cursor:pointer;">${T('pos_record_sale', 'RECORD SALE NOW')} </button> <button onclick="document.getElementById('quickOfflineSaleModal').remove()" style="width:100%; margin-top:8px; padding:10px; background:#e2e8f0; color:#475569; border:none; border-radius:10px; cursor:pointer; font-weight:bold;">${T('pos_close', 'X Close')}</button> </div> `;
    document.body.appendChild(div);
};

window.calculatePosTotal = function(sellPrice, pcsPerUnit) {
    const method = document.getElementById('saleMethod').value;
    const qty = parseInt(document.getElementById('saleQty').value) || 1;
    const pricePerUnit = (method === 'unit') ? (sellPrice * pcsPerUnit) : sellPrice;
    const total = pricePerUnit * qty;
    document.getElementById('posTotalDisplay').innerText = `TSh ${total.toLocaleString()}`;
};

window.togglePosDebtFields = function() {
    const method = document.getElementById('posPaymentMethod').value;
    const debtDiv = document.getElementById('posDebtFields');
    if (method === 'Deni') {
        debtDiv.style.display = 'block';
    } else {
        debtDiv.style.display = 'none';
    }
};

window.processSmartOfflineSale = async function(itemId, pcsPerUnit, sellPrice, name, unitName) {
    const method = document.getElementById('saleMethod').value;
    const qty = parseInt(document.getElementById('saleQty').value) || 0;
    const payMethod = document.getElementById('posPaymentMethod').value;

    if (qty <= 0) { alert(T('pos_valid_qty', "Enter a valid quantity.")); return; }

    const pcsToDeduct = (method === 'unit') ? (qty * pcsPerUnit) : qty;
    const pricePerItem = (method === 'unit') ? (sellPrice * pcsPerUnit) : sellPrice;
    const totalAmount = pricePerItem * qty;

    try {
        const itemRef = skh.doc(skh.db, "products", itemId);
        const itemSnap = await skh.getDoc(itemRef);
        if(!itemSnap.exists()) return;

        const currentTotalPcs = itemSnap.data().stock || 0;
        if (currentTotalPcs < pcsToDeduct) {
            alert(T('pos_insufficient_stock', "Not enough stock! Restock first."));
            return;
        }

        const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
        await skh.updateDoc(itemRef, { stock: skh.increment(-pcsToDeduct) });

        let profit = totalAmount * 0.4; 
        
        if (payMethod === 'Deni') {
            const clientName = document.getElementById('posDebtClientName').value.trim();
            const clientPhone = document.getElementById('posDebtClientPhone').value.trim();
            const deposit = parseFloat(document.getElementById('posDebtDepositPaid').value) || 0;
            const remainingDebt = totalAmount - deposit;

            if (!clientName) {
                alert(T('pos_debt_client_name', "Enter the name of the customer being credited."));
                return;
            }

            await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                shopOwnerId: ownerUid,
                type: "debt",
                title: `Deni: ${skh.skhEscape(clientName)} - Mauzo ya ${name}`,
                amount: remainingDebt,
                notes: `Simu: ${clientPhone} | Jumla Mauzo: TSh ${totalAmount.toLocaleString()} | Alilipa: TSh ${deposit.toLocaleString()}`,
                /* [AUDIT-FIX §42] fields za muundo kwa ajili ya analytics halisi */
                productId: itemId, productName: name, qty: qty, unitPrice: pricePerItem, payMethod: payMethod,
                status: "pending",
                recordedBy: skh.currentUser.displayName || "POS",
                date: new Date().toISOString()
            });

            if (deposit > 0) {
                await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                    shopOwnerId: ownerUid,
                    type: "income_offline",
                    title: `Deposit: ${skh.skhEscape(clientName)} - Mauzo ya ${name}`,
                    amount: deposit,
                    profit: profit * (deposit / totalAmount),
                    /* [AUDIT-FIX §42] fields za muundo kwa ajili ya analytics halisi */
                    productId: itemId, productName: name, qty: qty, unitPrice: pricePerItem, payMethod: payMethod,
                    date: new Date().toISOString()
                });
            }

            alert(T('pos_debt_saved', 'Sale and credit of TSh {d} for {c} recorded!', { d: remainingDebt.toLocaleString(), c: skh.skhEscape(clientName) }));
        } else {
            await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                shopOwnerId: ownerUid,
                type: "income_offline",
                title: `Uzo POS: ${qty} Pcs - ${name} (${payMethod})`,
                amount: totalAmount,
                profit: profit,
                /* [AUDIT-FIX §42] fields za muundo kwa ajili ya analytics halisi
                   (kabla entries za zamani zilitegemea title tu — parser inazisoma pia) */
                productId: itemId, productName: name, qty: qty, unitPrice: pricePerItem, payMethod: payMethod,
                date: new Date().toISOString()
            });
            alert(T('pos_sale_done', 'You sold TSh {t} via {m}!', { t: totalAmount.toLocaleString(), m: payMethod }));
        }

        if (skh.currentUserData && skh.currentUserData.shopRole !== 'owner') {
            const staffQuery = skh.query(skh.collection(skh.db, "shop_staff"), skh.where("shopOwnerId", "==", ownerUid), skh.where("name", "==", skh.currentUser.displayName));
            const staffSnap = await skh.getDocs(staffQuery);
            if (!staffSnap.empty) {
                const staffDocId = staffSnap.docs[0].id;
                const staffRef = skh.doc(skh.db, "shop_staff", staffDocId);
                const s = staffSnap.docs[0].data();
                
                let currentScore = Math.min(100, (s.performanceScore || 50) + 2); 
                let level = "Bronze";
                if(currentScore >= 95) level = "Diamond";
                else if(currentScore >= 85) level = "Platinum";
                else if(currentScore >= 70) level = "Gold";
                else if(currentScore >= 50) level = "Silver";

                await skh.updateDoc(staffRef, {
                    performanceScore: currentScore,
                    performanceLevel: level
                });
            }
        }

        document.getElementById('quickOfflineSaleModal').remove();
        window.loadAndRenderDashboard();
    } catch(e) { alert("Kosa: " + e.message); }
};

window.saveLedgerEntry = async function() {
    const type = document.getElementById('ledgerType').value;
    const title = document.getElementById('ledgerTitle').value.trim();
    const amount = parseFloat(document.getElementById('ledgerAmount').value) || 0;
    const dueDate = document.getElementById('ledgerDueDate').value;
    const notes = document.getElementById('ledgerNotes').value.trim();

    if (!title || amount <= 0) return alert(T('pos_valid_desc_amount', "Enter a description and a valid amount."));

    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    try {
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: type,
            title: title,
            amount: amount,
            dueDate: dueDate || null,
            notes: notes,
            status: "pending",
            recordedBy: skh.currentUser.displayName || "Admin",
            date: new Date().toISOString()
        });

        alert(T('pos_txn_saved', "Transaction recorded successfully in the Ledger."));
        document.getElementById('shopLedgerModal').style.display = 'none';
        window.loadAndRenderDashboard();
    } catch(e) { alert("Kosa: " + e.message); }
};

window.toggleLedgerInputs = function() {
    const type = document.getElementById('ledgerType').value;
    const div = document.getElementById('debtDueDateDiv');
    if (type === 'debt') {
        div.style.display = 'block';
    } else {
        div.style.display = 'none';
    }
};

window.markDebtPaid = async function(id, amount) {
    if(await skhConfirm("Je, unathibitisha kuwa mteja huyu ameshalipa deni hili la " + amount.toLocaleString() + "?")) {
        try {
            await skh.updateDoc(skh.doc(skh.db, "shop_ledger", id), { status: "completed" });
            const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
            await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                shopOwnerId: ownerUid,
                type: "income_offline",
                title: "Deni lililolipwa - " + amount.toLocaleString(),
                amount: amount,
                recordedBy: skh.currentUser.displayName,
                date: new Date().toISOString()
            });
            alert(T('pos_debt_received', "Debt marked as RECEIVED."));
            window.loadAndRenderDashboard();
        } catch(e) { alert(e.message); }
    }
};

window.markLoanPaid = async function(id) {
    if(await skhConfirm("Je, unathibitisha kuwa umelipa mkopo huu?")) {
        try {
            await skh.updateDoc(skh.doc(skh.db, "shop_ledger", id), { status: "completed" });
            alert(T('pos_loan_paid', "Loan marked as PAID."));
            window.loadAndRenderDashboard();
        } catch(e) { alert(e.message); }
    }
};

window.switchOsTab = function(tab) {
    const areas = { pos: 'osPosArea', expenses: 'osExpArea', staff: 'osStaffArea' };
    const tabs = { pos: 'tabOsPos', expenses: 'tabOsExp', staff: 'tabOsStaff' };

    Object.keys(areas).forEach(key => {
        document.getElementById(areas[key]).style.display = (key === tab) ? 'block' : 'none';
        
        const btn = document.getElementById(tabs[key]);
        if (key === tab) {
            btn.style.background = 'var(--primary-blue)';
            btn.style.color = 'white';
        } else {
            btn.style.background = 'transparent';
            btn.style.color = '#475569';
        }
    });

    if (tab === 'pos' && typeof window.renderRecentProducts === 'function') window.renderRecentProducts();
    if (tab === 'expenses') window.loadDebtsListInLedger(); // Badiliko: Inaita madeni live!
    if (tab === 'staff' && typeof window.renderStaffList === 'function') window.renderStaffList();
};

window.openOfflineStockModal = function() {
    window.closeModals(); 
    const modal = document.getElementById('offlineStockModal');
    if (modal) {
        modal.style.display = 'flex'; 
        window.switchStockTab('new'); 
    }
};

window.simulateBarcodeScan = function() {
    window.customPrompt(" [Real Scanner]\nScan au andika namba ya Barcode ya bidhaa:", "Weka Barcode hapa...", async (barcodeInput) => {
        if (!barcodeInput) return;
        const code = String(barcodeInput).trim();
        if (!code) return;

        const shopOwnerId = skh.currentUserData?.shopOwnerUid || (skh.currentUser ? skh.currentUser.uid : null);
        if (!shopOwnerId) { alert(T('pos_login_shop_first', "Please log into your shop first.")); return; }

        const tryAdd = (d) => {
            if (!d) return false;
            window.addPosCartItem(d.id, d.title || 'Bidhaa', Number(d.price || 0), Number(d.stock || 0), Number(d.wholesalePrice || 0));
            alert(T('pos_barcode_added', 'Barcode scanned: "{t}" added to cart.', { t: d.title }));
            return true;
        };

        // 1) Tafuta kwenye cache ya ndani kwanza (inafanya kazi OFFLINE)
        try {
            const cached = (skh.cachedItems || []).concat(JSON.parse(skh.localStorage.getItem('sokohai_pos_products_' + shopOwnerId) || '[]'));
            for (const d of cached) {
                if (d && d.id && (String(d.barcode || '').trim() === code || String(d.sku || '').trim() === code)) {
                    tryAdd(d);
                    return;
                }
            }
        } catch(e) {}

        // 2) Mtandaoni: vuta kwa userId kisha chuja barcode (epuka composite index)
        try {
            const q = skh.query(skh.collection(skh.db, "products"), skh.where("userId", "==", shopOwnerId));
            const snap = await skh.getDocs(q);
            let found = null;
            snap.forEach(docSnap => {
                const d = docSnap.data();
                if (!found && d && (String(d.barcode || '').trim() === code || String(d.sku || '').trim() === code)) {
                    found = Object.assign({}, d, { id: docSnap.id });
                }
            });
            if (found) { tryAdd(found); }
            else alert(T('pos_barcode_not_found', "No product with that barcode in your stock."));
        } catch(e) {
            alert(T('pos_barcode_offline', "Could not read the barcode online. Try typing the product name in the search box."));
        }
    });
};

window.togglePosPaymentDetails = function() {
    const payMethod = (document.getElementById('posPayType') || {}).value || 'Cash';
    const cashArea = document.getElementById('posCashArea');
    const mnoArea = document.getElementById('posMnoArea');
    const debtArea = document.getElementById('posDebtFieldsArea');

    // Ficha zote kwanza
    if(cashArea) cashArea.style.display = 'none';
    if(mnoArea) mnoArea.style.display = 'none';
    if(debtArea) debtArea.style.display = 'none';

    if (payMethod === 'Cash') {
        if(cashArea) cashArea.style.display = 'block';
        window.calculatePosChange();
    } else if (payMethod === 'Deni' || payMethod === 'Awamu') {
        //  MPYA: Huwasha mazingira ya deni au malipo ya awamu/deposit ya samani
        if(debtArea) debtArea.style.display = 'block';
    } else if (['Mpesa', 'Tigo', 'Airtel', 'Bank'].includes(payMethod)) {
        if(mnoArea) mnoArea.style.display = 'block';
    }
};

window.calculatePosChange = function() {
    let baseTotal = 0;
    window.posCart.forEach(item => {
        const currentActivePrice = item.isWholesale ? item.wholesalePrice : item.retailPrice;
        baseTotal += currentActivePrice * item.qty;
    });

    //  MPYA: Piga hesabu ya Punguzo kulingana na Promosheni iliyochaguliwa
    let discountAmount = 0;
    const promoType = document.getElementById('posPromoType') ? document.getElementById('posPromoType').value : 'none';

    if (promoType === '10') {
        discountAmount = baseTotal * 0.10; // Punguzo la 10%
    } else if (promoType === 'weekend' && baseTotal > 10000) {
        discountAmount = 2000; // Punguza elfu 2 kama mzigo umezidi elfu 10
    } else if (promoType === 'buy2get1') {
        // Kununua 2 na kupewa 1 bure kwa kila bidhaa
        window.posCart.forEach(item => {
            if (item.qty >= 2) {
                const currentActivePrice = item.isWholesale ? item.wholesalePrice : item.retailPrice;
                const freeCount = Math.floor(item.qty / 2);
                discountAmount += freeCount * currentActivePrice;
            }
        });
    }

    const finalTotal = Math.max(0, baseTotal - discountAmount);

    // Sasisha kioo cha kikapu kuonyesha kiasi cha punguzo kilivyofyekwa
    const totalDisplay = document.getElementById('posCartTotal');
    if (totalDisplay) {
        if (discountAmount > 0) {
            totalDisplay.innerHTML = `
                <span style="text-decoration: line-through; color:gray; font-size:14px;">TSh ${baseTotal.toLocaleString()}</span><br> <b style="color:var(--terracotta); font-size:22px;">TSh ${finalTotal.toLocaleString()}</b><br> <small style="color:var(--green); font-weight:bold; font-size:13px;">Punguzo (Discount): - TSh ${discountAmount.toLocaleString()}</small> `;
        } else {
            totalDisplay.innerText = `TSh ${finalTotal.toLocaleString()}`;
        }
    }

    const cashReceivedInput = document.getElementById('posCashReceived');
    const changeDisplay = document.getElementById('posCashChange');
    if (!cashReceivedInput || !changeDisplay) return;

    const cashReceived = parseFloat(cashReceivedInput.value) || 0;
    const change = cashReceived - finalTotal;

    if (change < 0) {
        changeDisplay.innerHTML = `<span style="color:#ef4444;">Bado anadaiwa TSh ${Math.abs(change).toLocaleString()}</span>`;
    } else {
        changeDisplay.innerHTML = `<span style="color:#10b981;">TSh ${change.toLocaleString()}</span>`;
    }

    // Hifadhi data hizi kwa kusafirisha kwenye Ledger (submitPosSale)
    window.activePosFinalTotal = finalTotal;
    window.activePosDiscountApplied = discountAmount;
};

window.submitPredefinedExpense = async function() {
    const catSelect = document.getElementById('expCategorySelectOS') || document.getElementById('expCategorySelect');
    const amtInp = document.getElementById('expAmountInpOS') || document.getElementById('expAmountInp');

    const category = catSelect ? catSelect.value : '';
    const amount = amtInp ? (parseFloat(amtInp.value) || 0) : 0;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if (amount <= 0) { 
        alert(T('pos_valid_cash', "Enter a valid cash amount.")); 
        return; 
    }

    try {
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: "expense",
            title: `Matumizi: ${category}`,
            amount: amount,
            recordedBy: skh.currentUser.displayName || "POS",
            date: new Date().toISOString()
        });

        alert(T('pos_expense_saved', 'Expense "{c}" of TSh {a} saved.', { c: category, a: amount.toLocaleString() }));
        if(amtInp) amtInp.value = '';
        closeModals();
        loadAndRenderDashboard();
    } catch(e) { alert("Kosa: " + e.message); }
};

window.submitAddNewStaff = async function() {
    const sName = document.getElementById('staffNewName').value.trim();
    const sSalary = parseFloat(document.getElementById('staffSalary').value) || 0;
    const sRole = document.getElementById('staffNewRole').value;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if(!sName || sSalary <= 0) { 
        alert(T('pos_staff_name_salary', "Enter the staff name and salary.")); 
        return; 
    }

    try {
        await skh.addDoc(skh.collection(skh.db, "shop_staff"), {
            shopOwnerId: ownerUid,
            name: sName,
            salary: sSalary,
            role: sRole,
            paidSalary: 0,           
            pendingSalary: sSalary,  
            performanceScore: 100,    
            performanceLevel: "Bronze", 
            tasks: [],               
            status: "active",
            createdAt: new Date().toISOString()
        });

        alert(T('pos_staff_registered', 'Staff "{n}" registered and added to Payroll.', { n: sName }));
        document.getElementById('staffNewName').value = '';
        document.getElementById('staffSalary').value = '';
        loadAndRenderDashboard();
    } catch(e) { 
        alert("Kosa: " + e.message); 
    }
};

window.payStaffSalary = async function(staffDocId, fullSalary) {
    let payAmountPrompt = await skhPrompt(` INALIPA KWA SOKOPAY:\nMshahara Kamili: TSh ${fullSalary.toLocaleString()}\n\nIngiza kiasi unachotaka kumlipa (Unaweza kumlipa nusu au wote):`, fullSalary);
    if (!payAmountPrompt) return;

    const amountToPay = parseFloat(payAmountPrompt);
    if (isNaN(amountToPay) || amountToPay <= 0 || amountToPay > fullSalary) {
        alert(T('pos_invalid_payment', "Payment amount is invalid or exceeds the salary."));
        return;
    }

    const payPhone = skh.currentUserData.paymentAccount || skh.currentUserData.phone;
    if (!payPhone) {
        alert(T('pos_register_payment_number', "Register your receiving/paying number in the payment menu first."));
        return;
    }

    alert(T('pos_redirect_pesapal', 'Redirecting to PesaPal to safely pay TSh {a}...', { a: amountToPay.toLocaleString() }));

    try {
        const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
        // [PesaPal] Hosted checkout — payroll itakamilika baada ya kurudi (17-pesapal-return)
        const pay = await window.skhPesaPalPay({
            amount: amountToPay,
            kind: 'payroll',
            phone: payPhone,
            provider: 'PesaPal',
            description: 'Malipo ya mshahara wa mfanyakazi (SokoPay)',
            context: { staffDocId: staffDocId, fullSalary: fullSalary, ownerUid: ownerUid }
        });
        if (!pay.ok) {
            alert(T('pos_payment_error', "Payment error: ") + (pay.error || T('pos_payment_failed', "Payment request failed.")));
        }
        // Payroll itakamilika baada ya kurudi kutoka PesaPal

    } catch (e) {
        alert(T('pos_payment_error', "Payment error: ") + e.message);
    }
};

window.assignStaffTaskPrompt = async function(staffDocId) {
    const taskName = await skhPrompt("Andika kazi unayotaka kumpa leo (Mfano: Restock Rice, Safisha Kaunta):");
    if (!taskName) return;

    try {
        const staffRef = skh.doc(skh.db, "shop_staff", staffDocId);
        await skh.updateDoc(staffRef, {
            tasks: skh.arrayUnion(taskName)
        });
        alert(T('pos_task_assigned', 'Task "{t}" assigned to them.', { t: taskName }));
        loadAndRenderDashboard();
    } catch(e) { alert(e.message); }
};

window.completeStaffTask = async function(staffDocId, taskIndex) {
    try {
        const staffRef = skh.doc(skh.db, "shop_staff", staffDocId);
        const staffSnap = await skh.getDoc(staffRef);
        if (staffSnap.exists()) {
            let activeTasks = staffSnap.data().tasks || [];
            activeTasks.splice(taskIndex, 1); 

            let currentScore = parseInt(staffSnap.data().performanceScore || 100);
            currentScore = Math.min(100, currentScore + 10);

            let level = "Bronze";
            if(currentScore >= 95) level = "Diamond";
            else if(currentScore >= 85) level = "Platinum";
            else if(currentScore >= 70) level = "Gold";
            else if(currentScore >= 50) level = "Silver";

            await skh.updateDoc(staffRef, {
                tasks: activeTasks,
                performanceScore: currentScore,
                performanceLevel: level
            });

            alert(T('pos_task_complete', 'Great! Task completed. Score rose to {s}% ({l} Level).', { s: currentScore, l: level }));
            loadAndRenderDashboard();
        }
    } catch(e) { alert(e.message); }
};

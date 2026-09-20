/* ==== js/app/18-cockpit.js ==== */
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


window.initControlTowerCharts = function(data) {
    // [PERF 2026-09] Chart.js hupakuliwa kwa uvivu; pakua kisha jiite upya.
    if (typeof Chart === 'undefined') {
        if (window.skhLoadChart) window.skhLoadChart().then(function () { window.initControlTowerCharts(data); }).catch(function () {});
        return;
    }
    // 1. Sparklines za KPI Cards za Juu
    const sparklineConfigs = {
        sparklineSales: { data: [10, 15, 8, 25, 18, 30, 22], color: '#10b981' },
        sparklineProfit: { data: [5, 12, 10, 20, 15, 25, 24], color: '#3b82f6' },
        sparklineOrders: { data: [8, 14, 12, 22, 19, 28, 26], color: '#8b5cf6' },
        sparklineDebts: { data: [30, 25, 28, 18, 15, 10, 5], color: '#ef4444' },
        sparklineCustomers: { data: [5, 10, 12, 18, 22, 30, 32], color: '#06b6d4' }
    };

    Object.keys(sparklineConfigs).forEach(id => {
        window.safeCreateChart(id, {
            type: 'line',
            data: {
                labels: ['', '', '', '', '', '', ''],
                datasets: [{
                    data: sparklineConfigs[id].data,
                    borderColor: sparklineConfigs[id].color,
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { display: false }, y: { display: false } }
            }
        });
    });

    // 2. Chati Kuu ya Mwenendo wa Mauzo (Sales Line Chart)
    window.safeCreateChart('adaptiveShopChart', {
        type: 'line',
        data: {
            labels: ['01 Jun', '05 Jun', '09 Jun', '13 Jun', '17 Jun', '19 Jun'],
            datasets: [{
                label: 'Sales (TZS)',
                data: [1500000, 2400000, 1900000, 3100000, 4800000, data.totalSales || 12845300],
                borderColor: '#6366f1',
                borderWidth: 3,
                tension: 0.35,
                fill: true,
                backgroundColor: 'rgba(99, 102, 241, 0.05)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { borderDash: [5, 5] } }
            }
        }
    });

    // 3. Sales by Category (Donut Chart)
    window.safeCreateChart('salesCategoryChart', {
        type: 'doughnut',
        data: {
            labels: ['Electronics', 'Groceries', 'Fashion', 'Others'],
            datasets: [{
                data: [35, 25, 20, 20],
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#64748b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            cutout: '70%'
        }
    });
};

window.runBusinessAlertsEngine = function(data) {
    const alertsList = document.getElementById('ctAlertsList');
    if (!alertsList) return;

    let alertList = [];

    // 1. Kagua ufanisi wa faida
    if (data.totalProfit < (data.totalSales * 0.15)) {
        alertList.push({
            type: "danger",
            title: "Faida Ipo Chini ya 15%",
            desc: "Ufanisi wa faida upo chini leo. Kagua bei za stoo.",
            time: "Sasa hivi"
        });
    }

    // 2. Kagua bidhaa zinazokaribia kuisha stoo
    if (data.lowStockCount > 0) {
        alertList.push({
            type: "warning",
            title: "Low Stock Alert",
            desc: `${data.lowStockCount} products are running low`,
            time: "5m ago"
        });
    }

    // 3. Outstanding Debt Warning
    if (data.activeDebts > 2000000) {
        alertList.push({
            type: "danger",
            title: "High Debt Alert",
            desc: "Wateja wanadaiwa kiasi kikubwa sana leo.",
            time: "45m ago"
        });
    }

    // Fallback kama kila kitu kipo sawa kabisa
    if (alertList.length === 0) {
        alertList.push({
            type: "success",
            title: "System Update",
            desc: "System will be updated at 12AM",
            time: "1h ago"
        });
    }

    alertsList.innerHTML = alertList.map(al => {
        const iconBg = al.type === 'danger' ? '#fee2e2' : (al.type === 'warning' ? '#fef3c7' : '#dcfce7');
        const iconColor = al.type === 'danger' ? '#ef4444' : (al.type === 'warning' ? '#b45309' : '#16a34a');
        const iconSymbol = al.type === 'danger' ? '' : (al.type === 'warning' ? '' : '');
        return `
            <div class="ct-alert-item" style="display: flex; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 12px; align-items: center;">
                <div class="ct-alert-icon" style="font-size: 14px; background: ${iconBg}; color: ${iconColor}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    ${iconSymbol}
                </div>
                <div class="ct-alert-content">
                    <b style="display: block; font-size: 11px; color: #0f172a; margin: 0;">${al.title}</b>
                    <span style="font-size: 10px; color: #64748b;">${al.desc}</span>
                </div>
            </div>`;
    }).join('');
};

window.addEventListener('online', async () => {
    let queue = JSON.parse(skh.localStorage.getItem('sokohai_offline_sales')) || [];
    if (queue.length === 0) return;

    console.log(` Mtandao umerudi! Kusawazisha miamala...`);
    for (let tx of queue) {
        try {
            let totalAmount = 0;
            let profit = 0;
            
            for (let item of tx.cart) {
                const currentPrice = item.isWholesale ? item.wholesalePrice : item.retailPrice;
                totalAmount += currentPrice * item.qty;
                profit += (currentPrice - (item.price * 0.6)) * item.qty;

                await skh.updateDoc(skh.doc(skh.db, "products", item.id), { stock: skh.increment(-item.qty) });
            }

            await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                shopOwnerId: tx.ownerUid,
                type: "income_offline",
                title: `Offline Sale: ${tx.cart.length} items (${tx.payMethod})`,
                amount: totalAmount,
                profit: profit,
                date: tx.date
            });
        } catch (err) { console.error("Sync error:", err); }
    }
    skh.localStorage.removeItem('sokohai_offline_sales');
    alert(T('ck_sync', "[Sokohai Sync]: All your offline transactions have been synced online now!"));
    window.loadAndRenderDashboard();
});

window.openProcurementModal = function() {
    window.closeModals();
    const modal = document.getElementById('procurementModal');
    if (modal) {
        modal.style.display = 'flex';
        window.switchProcurementTab('supplier');
        // Kila duka linapoagiza, pakia list ya suppliers wa sasa
        window.loadSupplierDropdown();
    }
};

window.switchProcurementTab = function(tab) {
    const supArea = document.getElementById('procSupplierArea');
    const poArea = document.getElementById('procPoArea');
    const tabSup = document.getElementById('tabSupplier');
    const tabPo = document.getElementById('tabPo');

    if (tab === 'supplier') {
        if (supArea) supArea.style.display = 'block';
        if (poArea) poArea.style.display = 'none';
        if (tabSup) { tabSup.style.background = 'var(--primary-blue)'; tabSup.style.color = 'white'; }
        if (tabPo) { tabPo.style.background = '#f1f5f9'; tabPo.style.color = '#475569'; }
    } else {
        if (supArea) supArea.style.display = 'none';
        if (poArea) poArea.style.display = 'block';
        if (tabSup) { tabSup.style.background = '#f1f5f9'; tabSup.style.color = '#475569'; }
        if (tabPo) { tabPo.style.background = 'var(--primary-blue)'; tabPo.style.color = 'white'; }
    }
};

window.saveSupplierProfile = async function() {
    const name = document.getElementById('supName').value.trim();
    const phone = document.getElementById('supPhone').value.trim();
    const loc = document.getElementById('supLocation').value.trim();
    const terms = document.getElementById('supTerms').value.trim();
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if (!name || !phone) return alert(T('ck_fill_supplier', "Enter the Supplier name and phone number!"));

    try {
        await skh.addDoc(skh.collection(skh.db, "suppliers"), {
            shopOwnerId: ownerUid,
            name: name,
            phone: phone,
            location: loc,
            paymentTerms: terms,
            createdAt: new Date().toISOString()
        });
        alert(T('ck_supplier_saved', 'Supplier "{n}" registered successfully.', { n: name }));
        document.getElementById('supName').value = '';
        document.getElementById('supPhone').value = '';
        document.getElementById('supLocation').value = '';
        document.getElementById('supTerms').value = '';
        window.loadSupplierDropdown();
    } catch (e) { alert(T('ck_error', "Error: ") + e.message); }
};

window.loadSupplierDropdown = async function() {
    const select = document.getElementById('poSupplierSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Inapakia suppliers... --</option>';
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    try {
        const q = skh.query(skh.collection(skh.db, "suppliers"), skh.where("shopOwnerId", "==", ownerUid));
        const snap = await skh.getDocs(q);
        
        let html = '<option value="">-- Chagua Supplier --</option>';
        snap.forEach(docSnap => {
            const s = docSnap.data();
            html += `<option value="${docSnap.id}">${s.name} (${s.paymentTerms})</option>`;
        });
        select.innerHTML = html;
    } catch (e) { select.innerHTML = '<option value="">' + T('ck_supplier_fail', 'Failed to load suppliers') + '</option>'; }
};

window.searchProductForPO = async function() {
    const searchInp = document.getElementById('poProductSearch');
    const resultsDiv = document.getElementById('poProductResults');
    if (!searchInp || !resultsDiv) return;

    const queryStr = searchInp.value.trim().toLowerCase();
    if (queryStr.length < 2) { resultsDiv.innerHTML = ''; return; }

    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
    const q = skh.query(skh.collection(skh.db, "products"), skh.where("userId", "==", ownerUid));
    const snap = await skh.getDocs(q);

    let html = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.title.toLowerCase().includes(queryStr)) {
            html += `
                <div onclick="window.selectProductForPO('${docSnap.id}', '${d.title.replace(/'/g, "\\'")}')" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; background:white; font-size:12px;">
                    <b> ${d.title}</b>
                </div>`;
        }
    });
    resultsDiv.innerHTML = html || '<p style="padding:10px; font-size:11px; color:gray; text-align:center;">Haikupatikana...</p>';
};

window.selectProductForPO = function(id, name) {
    document.getElementById('poProductId').value = id;
    document.getElementById('poProductName').innerText = name;
    document.getElementById('selectedPoProductBox').style.display = 'block';
    document.getElementById('poProductResults').innerHTML = '';
};

window.createPurchaseOrder = async function() {
    const supId = document.getElementById('poSupplierSelect').value;
    const productId = document.getElementById('poProductId').value;
    const qty = parseInt(document.getElementById('poQty').value) || 0;
    const unitCost = parseFloat(document.getElementById('poUnitCost').value) || 0;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if (!supId || !productId || qty <= 0 || unitCost <= 0) {
        return alert(T('ck_fill_po', "Enter Supplier, product, quantity, and a valid price."));
    }

    try {
        const supDoc = await skh.getDoc(skh.doc(skh.db, "suppliers", supId));
        const prodDoc = await skh.getDoc(skh.doc(skh.db, "products", productId));

        if (!supDoc.exists() || !prodDoc.exists()) return;

        const totalCost = qty * unitCost;
        const poCode = "PO-" + Math.floor(1000 + Math.random() * 9000);
//  Capture kiasi cha landed cost kilichopigwa hesabu
        const isLandedCostActive = document.getElementById('enableLandedCost').checked;
        const finalUnitCost = isLandedCostActive && window.activeLandedCostPerUnit ? window.activeLandedCostPerUnit : unitCost;

        await skh.addDoc(skh.collection(skh.db, "purchase_orders"), {
            shopOwnerId: ownerUid,
            poCode: poCode,
            supplierId: supId,
            supplierName: supDoc.data().name,
            productId: productId,
            productName: prodDoc.data().title,
            quantity: qty,
            unitCost: finalUnitCost, // Inarekodi gharama halisi baada ya ushuru (Landed cost)
            totalCost: finalUnitCost * qty,
            status: "pending", 
            createdAt: new Date().toISOString()
        });
        alert(T('ck_po_created', 'Purchase Order "{c}" created! When it arrives in stock, the boss will receive it automatically.', { c: poCode }));
        document.getElementById('procurementModal').style.display = 'none';
        document.getElementById('selectedPoProductBox').style.display = 'none';
        document.getElementById('poProductSearch').value = '';
        document.getElementById('poQty').value = '';
        document.getElementById('poUnitCost').value = '';
        window.loadAndRenderDashboard();
    } catch (e) { alert(T('ck_po_error', "PO error: ") + e.message); }
};

window.receivePurchaseOrder = async function(poId, productId, quantity, totalCost, productName) {
    if (!confirm(`Je, unathibitisha kuwa mzigo wa "${productName}" (Pcs ${quantity}) umefika salama na unataka kuupokea stoo?`)) return;

    try {
        const prodRef = skh.doc(skh.db, "products", productId);
        const poRef = skh.doc(skh.db, "purchase_orders", poId);
        const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

        // 1. Ongeza stock kiotomatiki (Stock Intake)
        await skh.updateDoc(prodRef, { stock: skh.increment(quantity) });

        // 2. Mark PO kama 'completed'
        await skh.updateDoc(poRef, { status: "completed" });

        // 3. Rekodi Gharama za Supplier kwenye Daftari la Hasibu (Ledger Outflow)
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: "expense",
            title: `Ununuzi Mzigo: PO-${poId.substr(0,4)} (${productName})`,
            amount: totalCost,
            notes: `Auto-recorded from Procurement Stock Intake. Pcs received: ${quantity}`,
            date: new Date().toISOString()
        });

        alert(T('ck_received', 'GOODS RECEIVED SAFELY!\n\n• Stock of "{p}" increased by {q} pcs!\n• Cost of TSh {c} recorded in the books.', { p: productName, q: quantity, c: totalCost.toLocaleString() }));
        window.loadAndRenderDashboard();
    } catch (e) {
        alert(T('ck_receive_error', "Error receiving goods: ") + e.message);
    }
};

window.markLoanPaidPro = async function(id, amount, title) {
    if(!confirm(`Je, unathibitisha kuwa umelipa Mkopo/Deni hili la TSh ${amount.toLocaleString()} kwa supplier/mteja?`)) return;

    try {
        const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

        // 1. Badili status ya mkopo kuwa completed
        await skh.updateDoc(skh.doc(skh.db, "shop_ledger", id), { status: "completed" });

        // 2. Rekodi malipo haya kama Matumizi (Expense Outflow) kisheria
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: "expense",
            title: `Rejesha Mkopo: ${title}`,
            amount: amount,
            notes: `Mlipaji: ${skh.skhEscape(skh.currentUser.displayName || 'Bosi')}. Marejesho ya mkopo uliokuwa unadaiwa duka hili.`,
            date: new Date().toISOString()
        });

        alert(T('ck_loan_paid', 'LOAN PAID SAFELY!\nCost of TSh {a} recorded in the books.', { a: amount.toLocaleString() }));
        window.loadAndRenderDashboard();
    } catch(e) {
        alert("Hitilafu: " + e.message);
    }
};

window.openStartShiftPrompt = function() {
    window.customPrompt(" FUNGUA SHIFT YA LEO\nIngiza kiasi cha Mtaji wa kuanzia (Start Cash) uliopo kwenye Droo ya fedha:", "Mfano: 100000", (startCashInp) => {
        const cash = parseFloat(startCashInp);
        if (isNaN(cash) || cash < 0) return alert(T('ck_bad_amount', "Invalid amount!"));

        const shiftObj = {
            startCash: cash,
            expectedCash: cash, // Expected inaanza na mtaji wa drooni
            cashierName: skh.currentUser?.displayName || "Mhudumu",
            openedAt: new Date().toISOString()
        };

        skh.localStorage.setItem('sokohai_active_shift', JSON.stringify(shiftObj));
        alert(T('ck_shift_open', 'Shift opened!\nYou entered starting capital of TSh {c}. You can now sell!', { c: cash.toLocaleString() }));
        window.loadAndRenderDashboard();
    });
};

window.closeCashierShiftPrompt = function() {
    const activeShift = skh.localStorage.getItem('sokohai_active_shift');
    if (!activeShift) return;

    const shiftData = JSON.parse(activeShift);
    const expected = shiftData.expectedCash;

    window.customPrompt(` FUNGA SHIFT YA LEO\nKiasi kilichotarajiwa kwenye Droo ni: TSh ${expected.toLocaleString()}\n\nIngiza kiasi HALISI cha fedha ulizonazo mkononi sasa hivi:`, "Mfano: 150000", async (actualCashInp) => {
        const actual = parseFloat(actualCashInp);
        if (isNaN(actual) || actual < 0) return alert(" Kiasi si sahihi!");

        const difference = actual - expected;
        const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

        try {
            // Hifadhi historia ya shift Firebase kwa ajili ya ukaguzi wa bosi
            await skh.addDoc(skh.collection(skh.db, "shift_logs"), {
                shopOwnerId: ownerUid,
                cashierName: shiftData.cashierName,
                startCash: shiftData.startCash,
                expectedCash: expected,
                actualCash: actual,
                difference: difference,
                openedAt: shiftData.openedAt,
                closedAt: new Date().toISOString()
            });

            // Rekodi activity log
            await window.addActivityLog("SHIFT_CLOSED", `Mhudumu amefunga shift. Expected: ${expected}, Actual: ${actual}. Tofauti (Diff): ${difference}`);

            skh.localStorage.removeItem('sokohai_active_shift');
            alert(T('ck_shift_closed', 'SHIFT CLOSED SAFELY!\n\n• Expected: TSh {e}\n• Actual: TSh {a}\n• Difference: TSh {d}', { e: expected.toLocaleString(), a: actual.toLocaleString(), d: difference.toLocaleString() }));
            window.loadAndRenderDashboard();
        } catch (e) {
            alert(T('ck_shift_close_error', "Error closing shift: ") + e.message);
        }
    });
};

window.openSpoilagePrompt = function(productId, productName, buyPrice) {
    window.customPrompt(` REKODI BIDHAA ILIYOHARIBIKA (SPOILAGE)\nBidhaa: ${productName}\n\nIngiza kiasi cha kilo, lita au pcs zilizooza au kuharibika:`, "Mfano: 2.5", (qtyInp) => {
        const qty = parseFloat(qtyInp);
        if (isNaN(qty) || qty <= 0) return alert(T('ck_bad_qty', "Invalid quantity!"));

        window.customPrompt(`Sababu ya uharibifu / upotevu ni ipi?\n(Mfano: Oza, Imevunjika, Wizi, Kupungua Uzito):`, "Sababu ya upotevu...", async (reasonInp) => {
            const reason = reasonInp.trim() || "Oza / Kuharibika";
            const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

            // Piga hesabu ya hasara halisi ya mtaji
            const lossCost = qty * buyPrice;

            try {
                // 1. Kata stock automatically
                await skh.updateDoc(skh.doc(skh.db, "products", productId), {
                    stock: skh.increment(-qty)
                });

                // 2. Rekodi hasara kwenye Ledger
                await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                    shopOwnerId: ownerUid,
                    type: "expense",
                    title: `Hasara/Spoilage: ${qty} Pcs/Kg ya ${productName}`,
                    amount: lossCost,
                    notes: `Sababu: ${reason}. Mtaji uliopotea: TSh ${lossCost.toLocaleString()}`,
                    date: new Date().toISOString()
                });

                // 3. Rekodi log
                await window.addActivityLog("SPOILAGE_RECORDED", `Amerekodi uharibifu wa ${qty} wa ${productName}. Sababu: ${reason}`);

                alert(T('ck_loss_saved', 'LOSS RECORDED!\n\n• Stock lost: {q} pcs/kg\n• Capital loss value: TSh {c}', { q: qty, c: lossCost.toLocaleString() }));
                window.loadAndRenderDashboard();
            } catch (e) {
                alert(T('ck_loss_error', "Error recording damage: ") + e.message);
            }
        });
    });
};

window.selectProductSize = function(size, element) {
    if (!skh.currentOpenProduct) return;
    skh.currentOpenProduct.selectedVariants.size = size;

    // Futa alama kwenye chips zingine
    element.parentNode.querySelectorAll('.variant-chip').forEach(el => {
        el.style.borderColor = '#cbd5e1';
        el.style.background = 'white';
        el.style.color = '#1e293b';
    });

    // Washa chip iliyochaguliwa (Gold/Blue styling)
    element.style.borderColor = '#03509d';
    element.style.background = '#e0f2fe';
    element.style.color = '#03509d';

    //  Sheria ya duka lako: Saizi ya XXL inaongeza TSh 2,000 kwenye bei ya mtaji
    let basePrice = parseFloat(skh.currentOpenProduct.price) || 0;
    if (size === 'XXL') {
        basePrice += 2000;
        alert(T('ck_xxl_note', "Fashion note: XXL size adds an extra cost of TSh 2,000."));
    }
    
    document.getElementById('pmPrice').innerText = "TZS " + basePrice.toLocaleString() + T('ck_per_pc', " / pc");
    skh.currentOpenProduct.tempVariantPrice = basePrice;
    
    // Sasisha bei ya kikapu chake
    skh.calculateDynamicPrice();
};

window.selectProductColor = function(color, element) {
    if (!skh.currentOpenProduct) return;
    skh.currentOpenProduct.selectedVariants.color = color;

    element.parentNode.querySelectorAll('.variant-chip').forEach(el => {
        el.style.borderColor = '#cbd5e1';
        el.style.background = 'white';
        el.style.color = '#1e293b';
    });

    element.style.borderColor = '#03509d';
    element.style.background = '#e0f2fe';
    element.style.color = '#03509d';
    
    skh.calculateDynamicPrice();
};

window.openRepairModal = function() {
    window.closeModals();
    const modal = document.getElementById('repairModal');
    if (modal) modal.style.display = 'flex';
};

window.saveRepairOrder = async function() {
    const custName = document.getElementById('repCustName').value.trim();
    const custPhone = document.getElementById('repCustPhone').value.trim();
    const device = document.getElementById('repDevice').value.trim();
    const serial = document.getElementById('repSerial').value.trim();
    const issue = document.getElementById('repIssue').value.trim();
    const cost = parseFloat(document.getElementById('repCost').value) || 0;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if (!custName || !custPhone || !device || !issue || cost <= 0) {
        return alert(T('ck_fill_star', "Fill in all required fields (*)!"));
    }

    try {
        const repairCode = "REP-" + Math.floor(1000 + Math.random() * 9000);

        // 1. Hifadhi oda ya ukarabati
        await skh.addDoc(skh.collection(skh.db, "repairs"), {
            shopOwnerId: ownerUid,
            repairCode: repairCode,
            customerName: custName,
            customerPhone: custPhone,
            deviceModel: device,
            serialNumber: serial || "N/A",
            issueDetail: issue,
            repairCost: cost,
            status: "received", // inasubiri ukarabati
            createdAt: new Date().toISOString()
        });

        // 2. Rekodi mapato yanayotarajiwa kwenye Ledger
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: "income_offline",
            title: `Repair Booking: ${device} (${custName})`,
            amount: cost,
            profit: cost * 0.7, // Makadirio ya faida ya huduma ni 70% baada ya kutoa vifaa
            date: new Date().toISOString()
        });

        alert(T('ck_repair_saved', 'ITEM REGISTERED!\n\nRepair code: {c}\nRecord saved safely in the ledger.', { c: repairCode }));
        document.getElementById('repCustName').value = '';
        document.getElementById('repCustPhone').value = '';
        document.getElementById('repDevice').value = '';
        document.getElementById('repSerial').value = '';
        document.getElementById('repIssue').value = '';
        document.getElementById('repCost').value = '';
        
        window.closeModals();
        window.loadAndRenderDashboard();
    } catch (e) {
        alert(T('ck_record_error', "Error recording: ") + e.message);
    }
};

window.openProjectModal = function() {
    window.closeModals();
    const modal = document.getElementById('industrialProjectModal');
    if (modal) {
        modal.style.display = 'flex';
        window.switchIndustrialTab('project');
    }
};

window.switchIndustrialTab = function(tab) {
    const projArea = document.getElementById('indProjectArea');
    const garArea = document.getElementById('indGarageArea');
    const tabProj = document.getElementById('tabProject');
    const tabGar = document.getElementById('tabGarage');

    if (tab === 'project') {
        if (projArea) projArea.style.display = 'block';
        if (garArea) garArea.style.display = 'none';
        if (tabProj) { tabProj.style.background = 'var(--primary-blue)'; tabProj.style.color = 'white'; }
        if (tabGar) { tabGar.style.background = '#f1f5f9'; tabGar.style.color = '#475569'; }
    } else {
        if (projArea) projArea.style.display = 'none';
        if (garArea) garArea.style.display = 'block';
        if (tabProj) { tabProj.style.background = '#f1f5f9'; tabProj.style.color = '#475569'; }
        if (tabGar) { tabGar.style.background = 'var(--primary-blue)'; tabGar.style.color = 'white'; }
    }
};

window.saveConstructionProject = async function() {
    const name = document.getElementById('projName').value.trim();
    const client = document.getElementById('projClient').value.trim();
    const budget = parseFloat(document.getElementById('projBudget').value) || 0;
    const locationName = document.getElementById('projLocation').value.trim();
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if (!name || !client || budget <= 0) return alert(T('ck_fill_project', "Enter Project Name, Client and Budget!"));

    try {
        const projCode = "PRJ-" + Math.floor(1000 + Math.random() * 9000);

        // Sajili mradi kwenye Database
        await skh.addDoc(skh.collection(skh.db, "construction_projects"), {
            shopOwnerId: ownerUid,
            projectCode: projCode,
            projectName: name,
            clientName: client,
            budget: budget,
            location: locationName,
            status: "active",
            createdAt: new Date().toISOString()
        });

        alert(T('ck_project_saved', 'Project "{n}" (ID: {c}) registered successfully! Budget is locked.', { n: name, c: projCode }));
        document.getElementById('projName').value = '';
        document.getElementById('projClient').value = '';
        document.getElementById('projBudget').value = '';
        document.getElementById('projLocation').value = '';
        
        window.closeModals();
        window.loadAndRenderDashboard();
    } catch (e) { alert(T('ck_project_error', "Project error: ") + e.message); }
};

window.saveGarageService = async function() {
    const plate = document.getElementById('garPlateNo').value.trim().toUpperCase();
    const model = document.getElementById('garModel').value.trim();
    const parts = document.getElementById('garParts').value.trim();
    const labour = parseFloat(document.getElementById('garLabour').value) || 0;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if (!plate || !model || !parts || labour <= 0) return alert(T('ck_fill_garage', "Enter Plate No, Vehicle, Parts and labour!"));

    try {
        const serviceCode = "GAR-" + Math.floor(1000 + Math.random() * 9000);

        // 1. Sajili huduma ya gari garage
        await skh.addDoc(skh.collection(skh.db, "garage_services"), {
            shopOwnerId: ownerUid,
            serviceCode: serviceCode,
            plateNumber: plate,
            vehicleModel: model,
            partsReplaced: parts,
            labourCost: labour,
            createdAt: new Date().toISOString()
        });

        // 2. Rekodi mapato ya ufundi (100% faida maana hakuna cost ya ununuzi upande wa ufundi pekee)
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: "income_offline",
            title: `Huduma ya Garage: ufundi wa Gari ${plate}`,
            amount: labour,
            profit: labour, // Ufundi ni huduma, hivyo unahesabiwa kama faida tupu
            date: new Date().toISOString()
        });

        alert(T('ck_garage_saved', 'GARAGE SERVICE REGISTERED!\n\nVehicle {p} history recorded. Labour income of TSh {l} entered in the books.', { p: plate, l: labour.toLocaleString() }));
        document.getElementById('garPlateNo').value = '';
        document.getElementById('garModel').value = '';
        document.getElementById('garParts').value = '';
        document.getElementById('garLabour').value = '';
        
        window.closeModals();
        window.loadAndRenderDashboard();
    } catch (e) { alert(T('ck_garage_error', "Garage error: ") + e.message); }
};

window.toggleLandedCostCalculator = function() {
    const isChecked = document.getElementById('enableLandedCost').checked;
    document.getElementById('landedCostFields').style.display = isChecked ? 'block' : 'none';
    window.calculateLandedCost();
};

window.calculateLandedCost = function() {
    const qty = parseInt(document.getElementById('poQty').value) || 1;
    const unitCost = parseFloat(document.getElementById('poUnitCost').value) || 0;
    const customs = parseFloat(document.getElementById('poCustomsDuty').value) || 0;
    const freight = parseFloat(document.getElementById('poFreightInsurance').value) || 0;

    const baseCostTotal = qty * unitCost;
    const totalExtraCosts = customs + freight;
    const finalLandedTotal = baseCostTotal + totalExtraCosts;

    // Landed cost kwa kila unit moja (Pcs/Kg)
    const landedCostPerUnit = finalLandedTotal / qty;

    document.getElementById('poLandedCostDisplay').innerText = `TSh ${Math.round(landedCostPerUnit).toLocaleString()}`;
    window.activeLandedCostPerUnit = landedCostPerUnit;
};

window.openScrapModal = function() {
    window.closeModals();
    const modal = document.getElementById('scrapYardModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('scpWeight').value = 10;
        window.calculateScrapCost();
    }
};

window.calculateScrapCost = function() {
    const material = document.getElementById('scpMaterial').value;
    const weight = parseFloat(document.getElementById('scpWeight').value) || 0;

    let pricePerKg = 12000; // Shaba
    if (material === 'chuma') pricePerKg = 1500;
    else if (material === 'aluminium') pricePerKg = 4500;
    else if (material === 'plastic') pricePerKg = 500;
    else if (material === 'used_item') pricePerKg = 15000; // used item makadirio

    const totalCost = weight * pricePerKg;
    document.getElementById('scpTotalCostDisplay').innerText = `TSh ${totalCost.toLocaleString()}`;
    
    // Hifadhi thamani kwa ajili ya kulipa/kurekodi
    window.activeScrapTotalCost = totalCost;
};

window.saveScrapTransaction = async function() {
    const custName = document.getElementById('scpCustName').value.trim();
    const material = document.getElementById('scpMaterial').value;
    const grade = document.getElementById('scpGrade').value;
    const weight = parseFloat(document.getElementById('scpWeight').value) || 0;
    const txType = document.getElementById('scpTxType').value;
    const totalCost = window.activeScrapTotalCost || 0;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if (!custName || weight <= 0) return alert(T('ck_fill_collect', "Enter the customer name and a valid weight."));

    try {
        const txCode = "SCP-" + Math.floor(1000 + Math.random() * 9000);

        if (txType === 'purchase') {
            // Yard inanunua: ni Gharama (Outflow) ya ununuzi wa malighafi
            await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                shopOwnerId: ownerUid,
                type: "expense",
                title: `Buy Scrap: ${weight} Kg ya ${material.toUpperCase()} (Grade ${grade})`,
                amount: totalCost,
                notes: `Collector: ${custName}. Ununuzi wa chakavu kwa mzunguko wa upelekaji viwandani.`,
                date: new Date().toISOString()
            });
            alert(T('ck_collect_done', 'PURCHASE COMPLETE!\n\n• Capital of TSh {c} paid to the collector.\n• Raw material entered stock for sorting.', { c: totalCost.toLocaleString() }));
        } else {
            // Yard inauza: ni Mapato (Inflow)
            await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                shopOwnerId: ownerUid,
                type: "income_offline",
                title: `Sell Scrap: ${weight} Kg ya ${material.toUpperCase()} (Grade ${grade})`,
                amount: totalCost,
                profit: totalCost * 0.5, // Makadirio ya 50% faida ya uuzaji wa chakavu baada ya sorting
                date: new Date().toISOString()
            });
            alert(T('ck_sale_done', 'SALE COMPLETE!\n\n• Income of TSh {c} entered in the books.\n• Raw material removed from stock heading to the factory.', { c: totalCost.toLocaleString() }));
        }

        document.getElementById('scpCustName').value = '';
        window.closeModals();
        window.loadAndRenderDashboard();
    } catch (e) {
        alert("Hitilafu: " + e.message);
    }
};

window.initializeControlTowerCharts = function(data) {
    // 1. Sparklines za kadi zote tano za juu (Sasa zinafanya kazi)
    const sparklines = {
        sparklineSales: { data: [10, 15, 8, 25, 18, 30, 22], color: '#10b981' },
        sparklineProfit: { data: [5, 12, 10, 20, 15, 25, 24], color: '#3b82f6' },
        sparklineOrders: { data: [8, 14, 12, 22, 19, 28, 26], color: '#8b5cf6' },
        sparklineDebts: { data: [30, 25, 28, 18, 15, 10, 5], color: '#ef4444' },
        sparklineCustomers: { data: [5, 10, 12, 18, 22, 30, 32], color: '#06b6d4' }
    };

    Object.keys(sparklines).forEach(id => {
        const ctx = document.getElementById(id);
        if (ctx) {
            const old = Chart.getChart(id);
            if (old) old.destroy();

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['', '', '', '', '', '', ''],
                    datasets: [{
                        data: sparklines[id].data,
                        borderColor: sparklines[id].color,
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: false,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } }
                }
            });
        }
    });

    // 2. Chati Kuu ya Mwenendo wa Mauzo
    const ctxMain = document.getElementById('adaptiveShopChart');
    if (ctxMain) {
        const oldMain = Chart.getChart('adaptiveShopChart');
        if (oldMain) oldMain.destroy();

        new Chart(ctxMain, {
            type: 'line',
            data: {
                labels: ['01 Jun', '05 Jun', '09 Jun', '13 Jun', '17 Jun', '19 Jun'],
                datasets: [{
                    label: 'Sales TZS',
                    data: [1500000, 2400000, 1900000, 3100000, 4800000, data.totalSales || 12845300],
                    borderColor: '#6366f1',
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    backgroundColor: 'rgba(99, 102, 241, 0.05)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } }, y: { grid: { borderDash: [5, 5] } } }
            }
        });
    }

    // 3. Sales by Category (Donut Chart)
    const ctxCat = document.getElementById('salesCategoryChart');
    if (ctxCat) {
        const oldCat = Chart.getChart('salesCategoryChart');
        if (oldCat) oldCat.destroy();

        new Chart(ctxCat, {
            type: 'doughnut',
            data: {
                labels: ['Electronics', 'Groceries', 'Fashion', 'Others'],
                datasets: [{
                    data: [35, 25, 20, 20],
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#64748b'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
        });
    }

    // 4. Stock Overview (Donut Chart)
    const ctxStock = document.getElementById('stockOverviewChart');
    if (ctxStock) {
        const oldStock = Chart.getChart('stockOverviewChart');
        if (oldStock) oldStock.destroy();

        new Chart(ctxStock, {
            type: 'doughnut',
            data: {
                labels: ['In Stock', 'Low Stock', 'Out of Stock'],
                datasets: [{
                    data: [75, 15, 10],
                    backgroundColor: ['#22c55e', '#eab308', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
        });
    }

    // 5. Cash Flow Overview (Double Bar Chart)
    const ctxCash = document.getElementById('cashFlowChart');
    if (ctxCash) {
        const oldCash = Chart.getChart('cashFlowChart');
        if (oldCash) oldCash.destroy();

        new Chart(ctxCash, {
            type: 'bar',
            data: {
                labels: ['01 Jun', '05 Jun', '09 Jun', '13 Jun', '17 Jun', '19 Jun'],
                datasets: [
                    { label: 'Inflow', data: [1500000, 2400000, 1900000, 3100000, 4800000, data.totalSales], backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'Outflow', data: [800000, 1200000, 950000, 1500000, 2100000, data.totalExpenses], backgroundColor: '#ef4444', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } }, y: { grid: { borderDash: [5, 5] } } }
            }
        });
    }

    // 6. Sales Channels (Donut Chart)
    const ctxChan = document.getElementById('salesChannelsChart');
    if (ctxChan) {
        const oldChan = Chart.getChart('salesChannelsChart');
        if (oldChan) oldChan.destroy();

        new Chart(ctxChan, {
            type: 'doughnut',
            data: {
                labels: ['In-Store', 'Online', 'Others'],
                datasets: [{
                    data: [65, 25, 10],
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
        });
    }
};

window.populateControlTowerTables = function(prodSnap, ledgerSnap) {
    // 1. Table 1: Top Selling Products
    const topProdBody = document.getElementById('topSellingProductsTableBody');
    if (topProdBody) {
        let phtml = '';
        let count = 0;
        if (prodSnap && !prodSnap.empty) {
            prodSnap.forEach(docSnap => {
                const p = docSnap.data();
                if (count < 5) {
                    phtml += `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 0; font-weight: bold; text-align: left; display: flex; align-items: center; gap: 8px;">
                            <img src="${skh.skhEscape(window.getOptimizedImageUrl(p.image || window.SKH_PLACEHOLDER_IMG))}" style="width: 25px; height: 25px; border-radius: 6px; object-fit: cover;" onerror="this.src=window.SKH_PLACEHOLDER_IMG||'https://ui-avatars.com/api/?name=Stoo&background=cbd5e1&color=0f172a'">
                            <span>${skh.skhEscape(p.title)}</span>
                        </td>
                        <td style="text-align: center; color: #334155;">${Math.floor(40 + Math.random() * 90)}</td>
                        <td style="font-weight: bold; color: #4f46e5; text-align: right;">TZS ${(p.price || 0).toLocaleString()}</td>
                    </tr>`;
                    count++;
                }
            });
        }
        // Kama duka bado halina bidhaa, weka bidhaa hizi za mfano (Fallbacks) ili lisibaki wazi:
        topProdBody.innerHTML = phtml || `
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-weight: bold; text-align: left; display: flex; align-items: center; gap: 8px;"><span style="font-size:16px;"></span> iPhone 14 Pro</td><td style="text-align: center;">128</td><td style="font-weight: bold; color: #4f46e5; text-align: right;">TZS 4,480,000</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-weight: bold; text-align: left; display: flex; align-items: center; gap: 8px;"><span style="font-size:16px;"></span> Samsung Galaxy A54</td><td style="text-align: center;">96</td><td style="font-weight: bold; color: #4f46e5; text-align: right;">TZS 2,880,000</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-weight: bold; text-align: left; display: flex; align-items: center; gap: 8px;"><span style="font-size:16px;"></span> HP Laptop 15</td><td style="text-align: center;">78</td><td style="font-weight: bold; color: #4f46e5; text-align: right;">TZS 2,340,000</td></tr>
        `;
    }

    // 2. Table 2: Top Customers (By Sales)
    const topCustBody = document.getElementById('topCustomersTableBody');
    if (topCustBody) {
        topCustBody.innerHTML = `
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-weight: bold; text-align: left;"> John Doe</td><td style="text-align: center;">12</td><td style="font-weight: bold; color: #10b981; text-align: right;">TZS 2,450,000</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-weight: bold; text-align: left;"> Mary Joseph</td><td style="text-align: center;">9</td><td style="font-weight: bold; color: #10b981; text-align: right;">TZS 1,890,000</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-weight: bold; text-align: left;"> Peter Mwangi</td><td style="text-align: center;">7</td><td style="font-weight: bold; color: #10b981; text-align: right;">TZS 1,450,000</td></tr>
        `;
    }

    // 3. Table 3: Outstanding Debts
    const debtsBody = document.getElementById('outstandingDebtsTableBody');
    if (debtsBody) {
        let dhtml = '';
        if (ledgerSnap && !ledgerSnap.empty) {
            ledgerSnap.forEach(docSnap => {
                const l = docSnap.data();
                if (l.type === 'debt' && l.status === 'pending') {
                    dhtml += `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 0; font-weight: bold; text-align: left;"> ${l.title.replace("Deni: ", "")}</td>
                        <td style="font-weight: bold; color: #ef4444; text-align: right;">TZS ${l.amount.toLocaleString()}</td>
                        <td style="text-align: center;"><button onclick="window.markDebtPaid('${docSnap.id}', ${l.amount})" style="padding: 4px 8px; background: var(--green); color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 10px; cursor: pointer;">LIPWA ✓</button></td>
                    </tr>`;
                }
            });
        }
        debtsBody.innerHTML = dhtml || `
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-weight: bold; text-align: left;"> Aisha Salim</td><td style="font-weight: bold; color: #ef4444; text-align: right;">TZS 1,200,000</td><td style="text-align: center;"><button class="ct-pos-btn" style="padding: 4px 8px; font-size: 10px; background: #ef4444;">${T('ck_paid', 'PAID')}</button></td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-weight: bold; text-align: left;"> David Kamau</td><td style="font-weight: bold; color: #ef4444; text-align: right;">TZS 980,000</td><td style="text-align: center;"><button class="ct-pos-btn" style="padding: 4px 8px; font-size: 10px; background: #ef4444;">LIPWA</button></td></tr>
        `;
    }
};

window.skhCloseDashboardSidebar = function() {
    const sidebar = document.querySelector('.ct-sidebar');
    if (sidebar) sidebar.classList.remove('active');
};

window.toggleDashboardSidebar = function() {
    const sidebar = document.querySelector('.ct-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
};

// Gonga nje ya drawer -> funga (kivuli cha nyuma kinashughulikiwa na CSS :has())
document.addEventListener('click', function(e) {
    if (e.target && e.target.closest && e.target.closest('.ct-menu-toggle-btn')) return;
    const sidebar = document.querySelector('.ct-sidebar');
    if (!sidebar || !sidebar.classList.contains('active')) return;
    if (sidebar.contains(e.target)) {
        // Vitufe vya ACTION ndani ya drawer (sio tab-switch) vifunge drawer
        // ili modali zisifichike nyuma ya sidebar.
        const el = e.target.closest('button, .ct-sidebar-menu-btn');
        if (el && !el.classList.contains('side-menu-link')) {
            sidebar.classList.remove('active');
        }
        return;
    }
    sidebar.classList.remove('active');
});

const originalSwitchDashTab = window.switchDashTab;

window.switchDashTab = function(tabName) {
    if (typeof window.skhCloseDashboardSidebar === 'function') {
        window.skhCloseDashboardSidebar(); // Funga drawer kabla ya kubadili tab
    }
    if (typeof originalSwitchDashTab === 'function') {
        originalSwitchDashTab(tabName);
    }
};

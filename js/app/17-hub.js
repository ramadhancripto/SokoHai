/* ==== js/app/17-hub.js ==== */
import { skh } from './00-bootstrap.js';

const originalSwitchProviderDashTab = window.switchProviderDashTab;

window.switchProviderDashTab = function(tabName) {
    if (typeof originalSwitchProviderDashTab === 'function') {
        originalSwitchProviderDashTab(tabName);
    }
    
    // Ruta za kurasa za ziada (Secondary tabs)
    if (tabName === 'completed') {
        window.loadHubDetailedCompletedTasks();
    } else if (tabName === 'calendar') {
        window.loadHubDetailedCalendar();
    } else if (tabName === 'my_services') {
        window.loadHubDetailedMyServices();
    } else if (tabName === 'clients') {
        window.loadHubDetailedClients();
    } else if (tabName === 'contracts') {
        window.loadHubDetailedContracts();
    } else if (tabName === 'escrow') {
        window.loadHubDetailedEscrow();
    } else if (tabName === 'earnings') {
        window.loadHubDetailedEarnings();
    } else if (tabName === 'reviews') {
        window.loadHubDetailedReviews();
    } else if (tabName === 'disputes') {
        window.loadHubDetailedDisputes();
    } else if (tabName === 'analytics') {
        window.loadHubDetailedAnalytics();
    }
};



























// [FIX] masterCommands hujengwa kwenye 00-bootstrap.js KABLA ya modules nyingine,
// hivyo values zake nyingi ni `undefined`. Usizifute functions halisi za window —
// re-register zile zilizopo tu (kama ilivyokuwa kwenye monolith ya awali).
Object.keys(skh.masterCommands).forEach(key => {
    const cmd = skh.masterCommands[key];
    if (typeof cmd === 'function') window[key] = cmd;
});

populateFormCategories();

skh.localStorage.setItem('sokohai_mode', 'buyer');

skh.currentMode = 'buyer';

skh.updateCartUI();

skh.setupLazyLoad();

const _homeTab = document.getElementById('navTabHome'); if (_homeTab && typeof updateApp === 'function') updateApp('home', _homeTab);

if (typeof renderPosCart === 'function') window.renderPosCart = renderPosCart;

window.addActivityLog = async function(action, details) {
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
    try {
        await skh.addDoc(skh.collection(skh.db, "activity_logs"), {
            shopOwnerId: ownerUid,
            userId: skh.currentUser.uid,
            userName: skh.currentUser.displayName || "Mtumiaji",
            userRole: skh.currentUserData?.shopRole || "owner",
            action: action,
            details: details,
            createdAt: new Date().toISOString()
        });
    } catch(e) { console.error("Activity Log Error:", e); }
};

window.addPosCartItem = function(id, name, price, stockLeft, wholesalePrice = 0) {
    const s = skh.currentUserData?.shopSettings || {};
    const isStrict = s.stockMode !== 'flexible'; // Kama sio flexible, ipo strict

    if (isStrict && stockLeft <= 0) { 
        alert(" Mipangilio ya duka inazuia kuuza! Bidhaa hii imekwisha kabisa stoo yetu."); 
        return; 
    }

    if (!window.posCart) window.posCart = [];

    const existing = window.posCart.find(x => x.id === id);
    if (existing) {
        if (isStrict && existing.qty >= stockLeft) { 
            alert(" Huwezi kuuza zaidi ya idadi iliyopo stoo!"); 
            return; 
        }
        existing.qty += 1;
    } else {
        window.posCart.push({ 
            id, 
            name, 
            price: price, 
            retailPrice: price,
            wholesalePrice: wholesalePrice || price, 
            qty: 1, 
            stockLeft,
            isWholesale: false 
        });
    }

    // Kusafisha kisanduku kilichokuwa wazi (POS ipo ndani ya #businessOSForm kila wakati)
    const searchInput = document.getElementById('posSearchInput');
    const resultsDiv = document.getElementById('posSearchResults');
    
    if (searchInput) searchInput.value = '';
    if (resultsDiv) { resultsDiv.innerHTML = ''; resultsDiv.style.display = 'none'; }

    window.renderPosCart();
};

window.renderPosCart = function() {
    if (!window.posCart) window.posCart = [];

    // [FIX] POS inaishi ndani ya #businessOSForm kila wakati (hata ikifunguliwa kutoka dashboard)
    const container = document.getElementById('posCartItems');
    const totalEl = document.querySelector('#businessOSForm #posCartTotal') || document.getElementById('posCartTotal');

    if (!container) return;

    if (window.posCart.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:gray; font-size:13px; margin:15px 0;">Kikapu kiko wazi. Tafuta bidhaa juu kuingiza.</p>`;
        if(totalEl) totalEl.textContent = "TSh 0";
        return;
    }

    let html = '';
    let total = 0;

    window.posCart.forEach((item, index) => {
        const currentActivePrice = item.isWholesale ? item.wholesalePrice : item.retailPrice;
        const itemTotal = currentActivePrice * item.qty;
        total += itemTotal;

        const showWholesaleToggle = item.wholesalePrice > 0 && item.wholesalePrice < item.retailPrice;

        html += `
            <div class="pos-cart-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9; font-size:13px;"> <div> <b> ${item.name}</b><br> <small style="color:gray;">TSh ${currentActivePrice.toLocaleString()} x ${item.qty}</small>
                    ${showWholesaleToggle ? `
                        <label style="display:flex; align-items:center; gap:4px; font-size:12.5px; color:var(--primary-blue); font-weight:bold; margin-top:4px; cursor:pointer;"> <input type="checkbox" ${item.isWholesale ? 'checked':''} onchange="window.toggleCartItemPriceMode(${index}, this.checked)" style="width:14px; height:14px;">
                            Uza kwa bei ya Jumla (TSh ${item.wholesalePrice.toLocaleString()})
                        </label> ` : ''}
                </div> <div style="display:flex; align-items:center; gap:8px;"> <button type="button" onclick="window.updatePosCartQty(${index}, -1)" style="width:28px; height:28px; border-radius:5px; border:1px solid #cbd5e1; background:white; font-weight:bold; cursor:pointer;">-</button> <b>${item.qty}</b> <button type="button" onclick="window.updatePosCartQty(${index}, 1)" style="width:28px; height:28px; border-radius:5px; border:none; background:var(--primary-blue); color:white; font-weight:bold; cursor:pointer;">+</button> <button type="button" onclick="window.removePosCartItem(${index})" style="padding:6px 10px; border:none; background:#fee2e2; color:#ef4444; border-radius:6px; cursor:pointer; font-weight:bold; margin-left:10px;"></button> </div> </div>`;
    });

    container.innerHTML = html;
    if(totalEl) totalEl.textContent = `TSh ${total.toLocaleString()}`;
};

window.toggleCartItemPriceMode = function(index, isWholesale) {
    if(posCart[index]) {
        posCart[index].isWholesale = isWholesale;
        window.renderPosCart();
    }
};

window.updatePosCartQty = function(index, amount) {
    const item = posCart[index];
    if (!item) return;
    
    item.qty += amount;
    if (item.qty <= 0) {
        posCart.splice(index, 1);
    } else if (item.qty > item.stockLeft) {
        alert(" Huwezi kuzidi idadi iliyopo stoo!");
        item.qty = item.stockLeft;
    }
    window.renderPosCart();
};

window.removePosCartItem = function(index) {
    posCart.splice(index, 1);
    window.renderPosCart();
};

// [POS FIX] Hifadhi mauzo OFFLINE kwenye simu (queue) — inatumika pale mtandao upo wazi au hitilafu inapotokea mtandaoni.
const queueOfflinePosSale = function(payMethod, ownerUid) {
    let offlineSalesQueue = [];
    try { offlineSalesQueue = JSON.parse(skh.localStorage.getItem('sokohai_offline_sales')) || []; } catch(e) { offlineSalesQueue = []; }

    const offlineTx = {
        cart: (posCart || []).slice(),
        payMethod: payMethod,
        ownerUid: ownerUid,
        date: new Date().toISOString(),
        recordedBy: skh.currentUser?.displayName || "Offline POS"
    };
    offlineSalesQueue.push(offlineTx);
    try { skh.localStorage.setItem('sokohai_offline_sales', JSON.stringify(offlineSalesQueue)); } catch(e) {}

    // Punguza stoo ya ndani (Local cache) ili data ibaki sahihi hata bila internet
    (posCart || []).forEach(item => {
        const cachedProd = (skh.cachedItems || []).find(x => x.id === item.id);
        if (cachedProd) cachedProd.stock = Math.max(0, (cachedProd.stock || 0) - item.qty);
    });

    posCart = [];
    window.renderPosCart();
    if (typeof window.closeModals === 'function') window.closeModals();
};

window.submitPosSale = async function() {
    if (posCart.length === 0) { 
        alert(" Kikapu cha mauzo kipo wazi! tafuta na uongeze bidhaa."); 
        return; 
    }
    
    const payMethod = (document.getElementById('posPayType') || {}).value || 'Cash';
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
//  OFFLINE INTERCEPTOR (Kuuza bila Internet)
    if (!navigator.onLine) {
        queueOfflinePosSale(payMethod, ownerUid);
        alert(" [OFFLINE MODE]: Umesajili mauzo bila internet! Mfumo umehifadhi salama kwenye simu na utasawazisha (Sync) kiotomatiki mtandao ukirudi.");
        return; 
    }


    let saleCommitted = false; // Inaonyesha kama mauzo yameshaandikwa kwenye server
    try { 
        //  MPYA: Capture mapunguzo ya promosheni kuanzia kwenye calculator
        const finalSalesAmount = typeof window.activePosFinalTotal === 'number' ? window.activePosFinalTotal : 0;
        const discountApplied = typeof window.activePosDiscountApplied === 'number' ? window.activePosDiscountApplied : 0;
        let totalCartAmount = 0;
        let totalProfit = 0;
        let saleTitleParts = [];

        // Pitia bidhaa zote kwenye kikapu uhesabu bei, punguza stoo, na ukokotoe faida
        for (let item of posCart) {
            const currentPrice = item.isWholesale ? item.wholesalePrice : item.retailPrice;
            const itemCost = currentPrice * item.qty;
            totalCartAmount += itemCost;
            saleTitleParts.push(`${item.qty}x ${item.name} (${item.isWholesale ? 'Jumla':'Reja'})`);

            // Punguza stoo kwenye Master Product Document
            const prodRef = skh.doc(skh.db, "products", item.id);
            const prodSnap = await skh.getDoc(prodRef);
            
            let buyPrice = currentPrice * 0.6; // Fallback
            let lowAlert = 5;
            
            if (prodSnap.exists()) {
                const pData = prodSnap.data();
                buyPrice = parseFloat(pData.buyPrice) || (currentPrice * 0.6);
                lowAlert = parseInt(pData.lowStockAlert) || 5;

                const sSettings = skh.currentUserData?.shopSettings || {};
                const isStrictStock = sSettings.stockMode !== 'flexible';
                
                const newStock = (pData.stock || 0) - item.qty;
                
                if (isStrictStock && newStock < 0) {
                    alert(` Mauzo Yamekataliwa!\nBidhaa ya "${item.name}" ina idadi pungufu stoo (Iliyopo: ${pData.stock || 0} Pcs). Jaza stoo kwanza.`);
                    return;
                }
                
                // Kupunguza stock ya vipande live
                await skh.updateDoc(prodRef, { stock: newStock });

                if (newStock <= lowAlert) {
                    alert(` RESTOCK WARNING:\nBidhaa ya "${item.name}" imebakiwa na idadi ndogo stoo (${newStock} Pcs!). jaza stoo hivi karibuni.`);
                }
            }

            // Kokotoa faida ya bidhaa hii
            const itemProfit = (currentPrice - buyPrice) * item.qty;
            totalProfit += itemProfit;
        }

        const saleTitle = `POS Sale: ` + saleTitleParts.join(', ');

        if (payMethod === 'Deni' || payMethod === 'Awamu') {
            const customerName = document.getElementById('posCustomerName').value.trim();
            const customerPhone = document.getElementById('posCustomerPhone').value.trim();
            const deposit = parseFloat(document.getElementById('posCustomerDeposit').value) || 0;
            const remainingDebt = (finalSalesAmount > 0 ? finalSalesAmount : totalCartAmount) - deposit;

            if(!customerName || !customerPhone) {
                alert(" jaza Jina na Namba ya Simu ya mteja kwanza!");
                return;
            }

            //  MPYA: Sajili kama Deni au Malipo ya awamu/deposit ya duka la samani
            const ledgerTitle = payMethod === 'Awamu' ? `Malipo ya Awamu (Deposit): ${skh.skhEscape(customerName)}` : `Deni la: ${skh.skhEscape(customerName)}`;

            await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                shopOwnerId: ownerUid,
                type: "debt",
                title: ledgerTitle,
                amount: remainingDebt,
                notes: `Simu: ${customerPhone} | Bidhaa: ${saleTitle} | Thamani kuu: TSh ${totalCartAmount.toLocaleString()} | Deposit iliyolipwa: TSh ${deposit.toLocaleString()}`,
                status: "pending",
                recordedBy: skh.currentUser.displayName || "POS",
                date: new Date().toISOString()
            });
            saleCommitted = true;

            // Rekodi ile deposit iliyolipwa leo kama Kipato halisi
            if (deposit > 0) {
                await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                    shopOwnerId: ownerUid,
                    type: "income_offline",
                    title: `Deposit ya Samani: ${skh.skhEscape(customerName)}`,
                    amount: deposit,
                    profit: totalProfit * (deposit / totalCartAmount),
                    date: new Date().toISOString()
                });
            }

            await window.addActivityLog("INSTALLMENT_CREATED", `Amerekodi mauzo ya Awamu ya ${skh.skhEscape(customerName)}. Thamani: TSh ${totalCartAmount.toLocaleString()} (Deposit: TSh ${deposit.toLocaleString()})`);
            alert(` POS: Muamala wa Awamu ya "${skh.skhEscape(customerName)}" umesajiliwa. Salio lililosalia ni TSh ${remainingDebt.toLocaleString()}`);

            // Rekodi ile deposit kama Kipato/Income ya Leo
            if (deposit > 0) {
                await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                    shopOwnerId: ownerUid,
                    type: "income_offline",
                    title: `Deposit ya Deni: ${skh.skhEscape(customerName)}`,
                    amount: deposit,
                    profit: totalProfit * (deposit / totalCartAmount),
                    date: new Date().toISOString()
                });
            }
            
            // Rekodi Activity log ya nani aliyeweka hili deni POS
            await window.addActivityLog("DEBT_CREATED", `Amempa deni mteja ${skh.skhEscape(customerName)} la TSh ${remainingDebt.toLocaleString()}`);
            alert(` POS: Deni la TSh ${remainingDebt.toLocaleString()} ya "${skh.skhEscape(customerName)}" limeandikwa!`);

        } else {
            // Mauzo ya Kawaida
            const finalPaidAmount = finalSalesAmount > 0 ? finalSalesAmount : totalCartAmount;
            
            await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
                shopOwnerId: ownerUid,
                type: "income_offline",
                title: `${saleTitle} (${payMethod})`,
                amount: finalPaidAmount, // Pesa halisi iliyoingia
                profit: totalProfit - discountApplied, // Faida imekatwa kiasi cha punguzo tulilompa mteja
                date: new Date().toISOString()
            });
            saleCommitted = true;

            await window.addActivityLog("POS_SALE", `Ameuza bidhaa kwa njia ya ${payMethod}. Thamani ya mauzo: TSh ${finalPaidAmount.toLocaleString()} (Punguzo: TSh ${discountApplied.toLocaleString()})`);
            alert(` POS: Mauzo ya TSh ${finalPaidAmount.toLocaleString()} yamefanikiwa kwa njia ya ${payMethod}!`);
        }

//  LOYALTY SYSTEM (TSh 1,000 = Pointi 1)
        const activeCustomerId = document.getElementById('posCustomerId') ? document.getElementById('posCustomerId').value : null; 
        if (activeCustomerId) {
            const calculatedPoints = Math.floor(totalCartAmount / 1000);
            const custRef = skh.doc(skh.db, "customers", activeCustomerId);
            const custSnap = await skh.getDoc(custRef);
            
            if (custSnap.exists()) {
                const currentPoints = parseInt(custSnap.data().loyaltyPoints || 0);
                const totalPoints = currentPoints + calculatedPoints;
                
                let segment = "Retail Customer";
                if(totalPoints >= 1000) segment = " VIP Customer";
                else if(totalPoints >= 500) segment = " Gold Customer";

                await skh.updateDoc(custRef, {
                    loyaltyPoints: totalPoints,
                    customerType: segment,
                    totalPurchases: skh.increment(totalCartAmount),
                    lastVisit: new Date().toISOString()
                });
            }
        }

        // Safisha fomu ya POS
        posCart = [];
        window.renderPosCart();
        const cnInp = document.getElementById('posCustomerName'); if (cnInp) cnInp.value = '';
        const cpInp = document.getElementById('posCustomerPhone'); if (cpInp) cpInp.value = '';
        const cdInp = document.getElementById('posCustomerDeposit'); if (cdInp) cdInp.value = '0';
        const debtFieldsArea = document.getElementById('posDebtFieldsArea'); if (debtFieldsArea) debtFieldsArea.style.display = 'none';
        const paySel = document.getElementById('posPayType'); if (paySel) paySel.value = 'Cash';
        if (typeof window.togglePosPaymentDetails === 'function') window.togglePosPaymentDetails();
// Safisha kumbukumbu ya promosheni
        window.activePosFinalTotal = null;
        window.activePosDiscountApplied = null;
        if(document.getElementById('posPromoType')) document.getElementById('posPromoType').value = 'none';
        closeModals();
        loadAndRenderDashboard();

    } catch(e) { 
        // [POS FIX] Mtandao umekatika au server imeshindwa — hifadhi mauzo OFFLINE ili yasipotee
        if (!saleCommitted) {
            try {
                queueOfflinePosSale(payMethod, ownerUid);
                alert(" Mtandao haukuweza kuhifadhi mauzo sasa. Mfumo umehifadhi OFFLINE kwenye simu — utasawazisha (Sync) mtandao ukirudi. (" + (e && e.message ? e.message : '') + ")");
            } catch(e2) {
                alert(" Hitilafu ya POS: " + (e && e.message));
            }
        } else {
            alert(" Hitilafu ya POS: " + (e && e.message));
        }
    }
};

let __posResultsCache = {};
let __posDebounceTimer = null;

// Ulinganishaji wa maneno (substring au kila neno la query lipo)
const skhPosMatch = function(pool, q) {
    if (!q) return false;
    if (pool.includes(q)) return true;
    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(t => pool.includes(t));
};

window.searchPosProductsLive = function() {
    // [FIX] POS ipo ndani ya #businessOSForm kila wakati — hata ikifunguliwa kutoka dashboard
    const searchInput = document.getElementById('posSearchInput');
    const resultsDiv = document.getElementById('posSearchResults');
    if (!searchInput || !resultsDiv) return;

    const queryStr = searchInput.value.trim().toLowerCase();
    if (queryStr.length < 1) { resultsDiv.innerHTML = ''; resultsDiv.style.display = 'none'; return; }

    const shopOwnerId = skh.currentUserData?.shopOwnerUid || (skh.currentUser ? skh.currentUser.uid : null);
    if (!shopOwnerId) {
        resultsDiv.innerHTML = '<p style="padding:15px; font-size:13px; text-align:center; color:gray;">ingia kwenye duka lako kwanza...</p>';
        resultsDiv.style.display = 'block';
        return;
    }

    __posResultsCache = __posResultsCache || {};
    let items = [];
    const seen = {};

    const collect = (list, requireOwner) => {
        (Array.isArray(list) ? list : []).forEach(d => {
            if (!d || !d.id || seen[d.id]) return;
            if (d.collectionName && d.collectionName !== 'products') return;
            if (requireOwner && d.userId && d.userId !== shopOwnerId) return;
            const pool = `${d.title||''} ${d.category||''} ${d.subCategory||''} ${d.barcode||''} ${d.sku||''}`.toLowerCase();
            if (skhPosMatch(pool, queryStr)) {
                seen[d.id] = true;
                items.push(Object.assign({}, d, { id: d.id }));
            }
        });
    };

    const draw = () => {
        if (items.length === 0) {
            resultsDiv.innerHTML = '<p style="padding:15px; font-size:13px; text-align:center; color:gray;">Hakuna bidhaa inayofanana na ulichoandika. Jaribu neno fupi au jina la bidhaa.</p>';
            resultsDiv.style.display = 'block';
            return;
        }
        let html = '';
        items.forEach(d => {
            const safeTitle = skh.skhEscape(d.title || 'Bidhaa');
            const price = Number(d.price || 0);
            const stock = Number(d.stock || 0);
            __posResultsCache[d.id] = { id: d.id, title: d.title || 'Bidhaa', price: price, stock: stock, wholesalePrice: Number(d.wholesalePrice || 0) };
            html += `
                <div onclick="window.addPosCartItemById('${d.id}')" style="padding:12px; border-bottom:1px solid #f1f5f9; cursor:pointer; background:white; font-size:13px; display:flex; justify-content:space-between; align-items:center; transition: 0.2s;"> <span><b> ${safeTitle}</b> (Stock: ${stock} Pcs)</span> <b style="color:var(--green);">TSh ${price.toLocaleString()}</b> </div>`;
        });
        resultsDiv.innerHTML = html;
        resultsDiv.style.display = 'block';
    };

    // 1) Cache ya ndani (in-memory) — inafanya kazi OFFLINE bila kuchelewa
    try { collect(skh.cachedItems || [], true); } catch(e) {}

    // 2) Cache ya POS iliyohifadhiwa kwenye simu (localStorage) — offline
    try {
        const key = 'sokohai_pos_products_' + shopOwnerId;
        const saved = JSON.parse(skh.localStorage.getItem(key) || '[]');
        collect(saved, false);
    } catch(e) {}

    // Chora mara moja (haraka) — mtu aone matokeo hata kabla ya mtandao
    draw();

    // 3) Mtandaoni: sasisha stock kutoka Firestore (fresh) kwa kuchelewa kidogo
    if (navigator.onLine) {
        clearTimeout(__posDebounceTimer);
        __posDebounceTimer = setTimeout(async () => {
            try {
                const q = skh.query(skh.collection(skh.db, "products"), skh.where("userId", "==", shopOwnerId));
                const snap = await skh.getDocs(q);
                const fresh = [];
                snap.forEach(docSnap => {
                    const d = docSnap.data();
                    if (d) { d.id = docSnap.id; fresh.push(d); }
                });
                try { skh.localStorage.setItem('sokohai_pos_products_' + shopOwnerId, JSON.stringify(fresh)); } catch(e) {}

                // Re-chora ikiwa mtu bado ameandika query ile ile
                const cur = (document.getElementById('posSearchInput') || {}).value;
                if (cur && cur.trim().toLowerCase() === queryStr) {
                    items = []; const seen2 = {};
                    fresh.forEach(d => { if (d && d.id && !seen2[d.id]) { seen2[d.id] = true; const pool = `${d.title||''} ${d.category||''} ${d.subCategory||''} ${d.barcode||''} ${d.sku||''}`.toLowerCase(); if (skhPosMatch(pool, queryStr)) items.push(d); } });
                    draw();
                }
            } catch(err) {
                console.warn('POS search online error (tunatumia cache):', err && err.message);
            }
        }, 250);
    }
};

window.addPosCartItemById = function(id) {
    const it = __posResultsCache && __posResultsCache[id];
    if (!it) return;
    window.addPosCartItem(it.id, it.title, it.price, it.stock, it.wholesalePrice || 0);
};

// [POS FIX] Pasha joto cache ya bidhaa za duka lako mara POS inapofunguliwa —
// ili autosearch iwe haraka na ifanye kazi hata OFFLINE (muuzaji bila internet).
window.warmPosProductsCache = async function() {
    const shopOwnerId = skh.currentUserData?.shopOwnerUid || (skh.currentUser ? skh.currentUser.uid : null);
    if (!shopOwnerId) return;
    if (!navigator.onLine) return; // Offline — tumia cache iliyopo tayari kwenye simu

    try {
        const q = skh.query(skh.collection(skh.db, "products"), skh.where("userId", "==", shopOwnerId));
        const snap = await skh.getDocs(q);
        const fresh = [];
        snap.forEach(docSnap => {
            const d = docSnap.data();
            if (d) { d.id = docSnap.id; fresh.push(d); }
        });
        try { skh.localStorage.setItem('sokohai_pos_products_' + shopOwnerId, JSON.stringify(fresh)); } catch(e) {}
    } catch(err) {
        console.warn('POS cache warm error (tunaendelea na cache ya simu):', err && err.message);
    }
};

window.loadDebtsListInLedger = async function() {
    const container = document.getElementById('osDebtsListContainer');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:gray; font-size:13px; padding:15px;"> Inapakia madeni...</p>';
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    try {
        const q = skh.query(skh.collection(skh.db, "shop_ledger"), skh.where("shopOwnerId", "==", ownerUid), skh.where("type", "==", "debt"), skh.where("status", "==", "pending"));
        const snap = await skh.getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:13px; padding:15px;">Duka halidai mtu yeyote kwa sasa! Safe </p>';
            return;
        }

        let html = '';
        snap.forEach(docSnap => {
            const l = docSnap.data();
            const dateStr = new Date(l.date).toLocaleDateString();
            
            html += `
                <div style="padding:12px; border:1px solid #fecaca; display:flex; justify-content:space-between; align-items:center; font-size:12px; text-align:left; background:#fff5f5; border-radius:10px; margin-bottom:5px;"> <div> <b> ${l.title}</b><br> <small style="color:#ef4444; font-weight:bold;">${skh.skhEscape(l.notes || '')}</small><br> <small style="color:gray;">Tarehe: ${dateStr} | Mrekodi: ${l.recordedBy}</small> </div> <div style="text-align:right;"> <b style="color:red; display:block; margin-bottom:5px;">TSh ${l.amount.toLocaleString()}</b> <button type="button" onclick="window.markDebtPaid('${docSnap.id}', ${l.amount})" style="padding:6px 12px; background:var(--green); color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12.5px;">LIPWA </button> </div> </div>`;
        });
        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = '<p style="color:red; text-align:center; font-size:13px;">Maboresho ya mtandao yamekwama.</p>';
    }
};

window.recordStaffAttendance = async function(staffId, staffName) {
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
    try {
        await skh.addDoc(skh.collection(skh.db, "staff_attendance"), {
            shopOwnerId: ownerUid,
            staffId: staffId,
            staffName: staffName,
            date: new Date().toLocaleDateString(),
            timestamp: new Date().toISOString()
        });
        
        await window.addActivityLog("ATTENDANCE", `Amerekodi mahudhurio ya mfanyakazi ${staffName}`);
        alert(` Attendance ya "${staffName}" imerekodiwa leo.`);
    } catch(e) { alert("Hitilafu: " + e.message); }
};

window.openStockTransferModal = function() {
    window.closeModals();
    const modal = document.getElementById('stockTransferModal');
    if (modal) {
        modal.style.display = 'flex';
        // Safisha fomu ya nyuma
        document.getElementById('transferProductSearch').value = '';
        document.getElementById('transferSearchResults').innerHTML = '';
        document.getElementById('selectedTransferProductBox').style.display = 'none';
        document.getElementById('transferQty').value = '';
    }
};

window.openSokoPay = function() {
    if (!skh.requireAuth()) return; // Hakikisha mtumiaji ameingia (Auth Check)
    
    // Onyesha fomu ya SokoPay
    window.showForm('sokopayForm');
    
    // Weka tab ya kwanza ya Overview kuwa hai kwa asili
    window.toggleSokoPayTab('overview');
    
    // Jaza Jina la Mtumiaji kwenye ujumbe wa Karibu
    const welcomeEl = document.getElementById('spWelcomeMsg');
    if (welcomeEl && skh.currentUser) {
        // [REAL DATA 2026-09] Fallback ya bandia "John Mwangi" imeondolewa —
        // tumia jina halisi la akaunti; kama halijawekwa, tumia 'Mgeni'.
        const nameToDisplay = (skh.currentUserData && (skh.currentUserData.fullName || skh.currentUserData.displayName || skh.currentUserData.name)) || skh.currentUser.displayName || (skh.currentUser.email ? skh.currentUser.email.split('@')[0] : 'Mgeni');
        welcomeEl.innerText = `Welcome back, ${nameToDisplay}! `;
    }

    // [DP-EVERYWHERE] Avatar halisi ya mtumiaji kwenye header ya SokoPay (si placeholder)
    const spAv = document.getElementById('spHeaderAvatar');
    if (spAv && skh.currentUser) {
        const pu = (skh.currentUserData && skh.currentUserData.photoURL) || skh.currentUser.photoURL || '';
        if (pu && !/ui-avatars\.com/.test(String(pu))) {
            spAv.src = skh.getOptimizedImageUrl(pu);
            spAv.onerror = function () {
                this.onerror = null;
                this.src = (typeof window.skhInitialAvatar === 'function')
                    ? window.skhInitialAvatar(skh.currentUser.displayName || skh.currentUser.email)
                    : 'https://ui-avatars.com/api/?name=SokoHai&background=00509d&color=fff';
            };
        }
    }

    // Washa mfumo wa kusoma data live
    if (typeof window.syncSokoPayRealtimeData === 'function') {
        window.syncSokoPayRealtimeData();
    }

    // [SOKOPAY] Ikiwa kulikuwa na deep-link (#sokopay=CODE), jaza token kwenye Pay
    window.applyHaiPayDeepLink();
};

// [SOKOPAY] Deep-link: mtumiaji afungue linki moja kwa moja (#sokopay=CODE)
window.spHandleHaiPayDeepLink = function() {
    try {
        if (!/#(?:sokopay|haiPay)=/i.test(window.location.hash || '')) return;
        if (!skh.currentUser) return; // mtumiaji aingie kwanza, kisha afungue tena
        window.openSokoPay();
    } catch (e) {}
};
window.addEventListener('hashchange', window.spHandleHaiPayDeepLink);
// Angalia mara baada ya kurejesha auth (kama mtumiaji tayari ameingia)
setTimeout(window.spHandleHaiPayDeepLink, 1200);

window.syncSokoPayRealtimeData = async function() {
    if (!skh.currentUser) return;

    // Kusoma Salio la Wallet kutoka kwa Wasifu wa User (Live)
    const walletBalance = parseFloat(skh.currentUserData?.walletBalance || 0);
    window.updateSokoPayUIBalances(walletBalance, 0, 0, 0); // Anza na salio la wallet, zingine zitasubiri hesabu

    try {
        // Query 1: Tafuta miamala yote ya orders ambapo mtumiaji ni Payer au Payee
        const qBuyerOrders = skh.query(skh.collection(skh.db, "orders"), skh.where("buyerId", "==", skh.currentUser.uid));
        const qSellerOrders = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", skh.currentUser.uid));
        
        // Query 2: Tafuta miamala yote ya SokoPay links
        const qBuyerLinks = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("buyerId", "==", skh.currentUser.uid));
        const qOwnerLinks = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("userId", "==", skh.currentUser.uid));

        const [snapB, snapS, snapLBuyer, snapLOwner] = await Promise.all([
            skh.getDocs(skh.qSenderOrdersWorkaround(skh.currentUser.uid, 'buyerId')), // Workaround kuzuia crash
            skh.getDocs(skh.qSenderOrdersWorkaround(skh.currentUser.uid, 'sellerId')),
            skh.getDocs(qBuyerLinks),
            skh.getDocs(qOwnerLinks)
        ]);

        let totalEscrow = 0;   // Jumla ya miamala iliyofungwa
        let pendingPay = 0;    // Kiasi kinachosubiri (Awaiting Confirmation)
        let completedCount = 0; // Idadi ya miamala iliyofanikiwa
        let disputedAmt = 0;   // Kiasi chenye mgogoro

        let productsVal = 0, servicesVal = 0, transportVal = 0;
        let recentTransactions = [];
        let activeContracts = [];

        // Kazi ya kusoma na kuchambua kila muamala
        const processTransaction = (d, id, isLink = false) => {
            const status = d.status;
            const amt = parseFloat(d.price || d.amount || 0);
            const title = d.title || d.itemTitle || "Mkataba wa SokoPay";
            const type = d.contractType || d.collectionName || "product";

            // Piga hesabu za chati kulingana na kundi la huduma
            if (type.includes("product")) productsVal += amt;
            else if (type.includes("service")) servicesVal += amt;
            else if (type.includes("transport") || type.includes("logistics") || type.includes("driver")) transportVal += amt;

            if (status === 'held') {
                totalEscrow += amt;
                activeContracts.push({ id, title, amount: amt, status: "In Progress", type: type, partner: d.sellerName || d.ownerName || "SokoPay Partner" });
                recentTransactions.push({ title: `Escrow Held: ${title}`, amount: -amt, status: "Locked", date: d.createdAt || d.date });
            } else if (status === 'shipped' || status === 'awaiting_pickup' || status === 'in_transit') {
                pendingPay += amt;
                activeContracts.push({ id, title, amount: amt, status: "In Transit", type: type, partner: d.sellerName || "Partner" });
                recentTransactions.push({ title: `Transit: ${title}`, amount: amt, status: "Pending", date: d.createdAt || d.date });
            } else if (status === 'completed') {
                completedCount++;
                recentTransactions.push({ title: `Paid out: ${title}`, amount: amt, status: "Success", date: d.createdAt || d.date });
            } else if (status === 'disputed') {
                disputedAmt += amt;
                activeContracts.push({ id, title, amount: amt, status: "Disputed", type: type, partner: d.sellerName || "Partner" });
                recentTransactions.push({ title: `Disputed: ${title}`, amount: -amt, status: "Disputed", date: d.createdAt || d.date });
            }
        };

        // Kupitisha na kuchambua data zote zilizovutwa
        snapB.forEach(docSnap => processTransaction(docSnap.data(), docSnap.id));
        snapS.forEach(docSnap => processTransaction(docSnap.data(), docSnap.id));
        snapLBuyer.forEach(docSnap => processTransaction(docSnap.data(), docSnap.id, true));
        snapLOwner.forEach(docSnap => processTransaction(docSnap.data(), docSnap.id, true));

        // 3. SASISHA KIASI VYOTE KWENYE JUNGU LA SOKOPAY (KPIs & SUMMARY)
        window.updateSokoPayUIBalances(walletBalance, totalEscrow, pendingPay, completedCount);
        
        // Sasisha muhtasari wa ledger (SokoPay Summary Ledger)
        if (document.getElementById('spLedgerTotal')) document.getElementById('spLedgerTotal').innerText = `TZS ${(totalEscrow + pendingPay + disputedAmt).toLocaleString()}`;
        if (document.getElementById('spLedgerHeld')) document.getElementById('spLedgerHeld').innerText = `TZS ${totalEscrow.toLocaleString()}`;
        if (document.getElementById('spLedgerReleased')) document.getElementById('spLedgerReleased').innerText = `TZS ${(walletBalance).toLocaleString()}`;
        if (document.getElementById('spLedgerDisputed')) document.getElementById('spLedgerDisputed').innerText = `TZS ${disputedAmt.toLocaleString()}`;

        // 4. CHORA CHATI YA LIVE YA SOKOPAY (CHART.JS AT CORE)
        window.renderSokoPayPieChart(productsVal, servicesVal, transportVal);
        window.renderSokoPayWalletSummaryChart(walletBalance, totalEscrow, pendingPay);

        // 5. CHORA LIST YA MIKATABA HAI (ACTIVE OVERVIEW LIST)
        window.renderSokoPayActiveOverview(skh.activeContractsListFilter(skh.currentUser.uid, snapB, snapS, snapLBuyer, snapLOwner));

        // 6. CHORA LIST YA MIAMALA YA KARIBUNI (RECENT TRANSACTIONS FEED)
        window.renderSokoPayRecentTransactions(skh.currentUser.email);

    } catch (err) {
        console.warn("SokoPay Realtime Sync Note:", err);
    }
};

window.updateSokoPayUIBalances = function(wallet, escrow, pending, completed) {
    // Kwenye Sidebar
    const sideBal = document.getElementById('spSidebarBalance');
    if (sideBal) sideBal.innerText = `TZS ${wallet.toLocaleString()}`;
    // Kwenye top bar ya mobile (wallet chip)
    const sideBalTop = document.getElementById('spSidebarBalanceTop');
    if (sideBalTop) sideBalTop.innerText = `TZS ${wallet.toLocaleString()}`;
    
    // Kwenye KPI Cards
    const kpiWallet = document.getElementById('spKpiWallet');
    const kpiEscrow = document.getElementById('spKpiEscrow');
    const kpiPending = document.getElementById('spKpiPending');
    const kpiCompleted = document.getElementById('spKpiCompleted');

    if (kpiWallet) kpiWallet.innerText = `TZS ${wallet.toLocaleString()}`;
    if (kpiEscrow) kpiEscrow.innerText = `TZS ${escrow.toLocaleString()}`;
    if (kpiPending) kpiPending.innerText = `TZS ${pending.toLocaleString()}`;
    if (kpiCompleted) kpiCompleted.innerText = completed.toString();
};

window.renderSokoPayPieChart = function(prod, serv, trans) {
    const total = prod + serv + trans;
    const values = total > 0 ? [prod, serv, trans] : [1000, 1000, 1000]; // Weka mfano kama kila kitu ni zero
    
    // Inaita safe helper ya mradi wako kuzuia canvas crashes
    window.safeCreateChart('spEscrowPieChart', {
        type: 'doughnut',
        data: {
            labels: ['Products', 'Services', 'Transport'],
            datasets: [{
                data: values,
                backgroundColor: ['#03509d', '#10b981', '#f59e0b'],
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

window.renderSokoPayWalletSummaryChart = function(wallet, escrow, pending) {
    const total = wallet + escrow + pending;
    
    // Ikiwa salio lote ni zero (mteja mpya), mfumo unaonyesha muundo thabiti wa picha yetu kama fallback
    const values = total > 0 ? [wallet, escrow, pending] : [2450000, 1320000, 320000];
    
    // Sasisha kiasi cha mali zote (Total Assets) katikati ya chati ya duara
    const totalAssetsEl = document.getElementById('lblSpTotalAssetsVal');
    if (totalAssetsEl) {
        const displayTotal = total > 0 ? total : 4090000;
        totalAssetsEl.innerText = `TZS ${displayTotal.toLocaleString()}`;
    }

    window.safeCreateChart('spDashboardWalletChart', {
        type: 'doughnut',
        data: {
            labels: ['Available', 'Escrow / Locked', 'Pending'],
            datasets: [{
                data: values,
                backgroundColor: ['#10b981', '#00509d', '#3b82f6'],
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

window.renderSokoPayActiveOverview = function(contractsArray) {
    const container = document.getElementById('spActiveOverviewList');
    if (!container) return;

    if (contractsArray.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 25px; color: gray;"> <span style="font-size: 30px;"></span> <p style="font-size:13px; margin-top: 5px;">Huna mkataba wowote unaoendelea (Active) kwa sasa.</p> </div>`;
        return;
    }

    let html = '';
    contractsArray.forEach(c => {
        const amt = parseFloat(c.price || c.amount || 0);
        const type = c.contractType || c.collectionName || 'product';
        
        let typeLabel = "PRODUCT ORDER";
        let icon = "";
        let btnText = "Track Order";
        let btnClick = `window.openProduct('${c.id}')`;
        let statusColor = "#03509d";

        if (type.includes("service")) {
            typeLabel = "SERVICE ORDER"; icon = ""; btnText = "View Details"; statusColor = "#10b981";
        } else if (type.includes("job")) {
            typeLabel = "JOB CONTRACT"; icon = ""; btnText = "View Contract"; statusColor = "#8B5CF6";
        } else if (type.includes("transport") || type.includes("logistics")) {
            typeLabel = "TRANSPORT BOOKING"; icon = ""; btnText = "View Ticket"; statusColor = "#F59E0B";
        }

        html += `
            <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);"> <div style="display: flex; gap: 12px; align-items: center;"> <div style="width: 42px; height: 42px; background: #F8FAFC; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">${icon}</div> <div> <span style="font-size:12px; background: #F1F5F9; color: ${statusColor}; padding: 2px 8px; border-radius: 10px; font-weight: bold; text-transform: uppercase;">${typeLabel}</span> <b style="font-size: 13px; color: #0F172A; display: block; margin-top: 3px;">${skh.skhEscape(c.title || c.itemTitle)}</b> <small style="color: gray; font-size:12.5px; display: block;">Status: <b style="color: ${statusColor};">${c.status.toUpperCase()}</b></small> </div> </div> <div style="text-align: right;"> <b style="display: block; color: var(--terracotta); font-size: 13px; margin-bottom: 5px;">TZS ${amt.toLocaleString()}</b> <button type="button" onclick="${btnClick}" style="padding: 6px 12px; background: #e2e8f0; color: #475569; border: none; border-radius: 8px; font-weight: bold; font-size:12.5px; cursor: pointer;">${btnText}</button> </div> </div>`;
    });

    container.innerHTML = html;
};

window.renderSokoPayRecentTransactions = async function() {
    const container = document.getElementById('spRecentTransactionsList');
    if (!container || !skh.currentUser) return;

    container.innerHTML = '<p style="text-align: center; color: gray; font-size:12.5px;"> Inasoma miamala yako yote ya kifedha...</p>';

    try {
        const uid = skh.currentUser.uid;

        // Vuta miamala kutoka vyanzo vitatu (3) tofauti kwa wakati mmoja (Parallel Fetching)
        const qBuyerOrders = skh.query(skh.collection(skh.db, "orders"), skh.where("buyerId", "==", uid), skh.limit(5));
        const qSellerOrders = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", uid), skh.limit(5));
        const qBuyerLinks = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("buyerId", "==", uid), skh.limit(5));
        const qOwnerLinks = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("userId", "==", uid), skh.limit(5));
        const qLedger = skh.query(skh.collection(skh.db, "shop_ledger"), skh.where("shopOwnerId", "==", uid), skh.limit(5));

        const [snapBO, snapSO, snapBL, snapOL, snapLedger] = await Promise.all([
            skh.getDocs(qBuyerOrders), skh.getDocs(qSellerOrders),
            skh.getDocs(qBuyerLinks), skh.getDocs(qOwnerLinks),
            skh.getDocs(qLedger)
        ]);

        let combinedTransactions = [];

        // A. Jaza Oda ambazo mtumiaji amezilipia (Kama Mnunuzi - Pesa Imetoka/Locked)
        snapBO.forEach(docSnap => {
            const d = docSnap.data();
            combinedTransactions.push({
                title: d.itemTitle || "Order Payment",
                amount: -parseFloat(d.amount || 0), // Hasasi (Negative) kwa sababu imetoka/locked
                status: d.status === 'held' ? "Escrow Hold" : (d.status === 'completed' ? "Released" : d.status.toUpperCase()),
                date: d.date || d.createdAt,
                icon: ""
            });
        });

        // B. Jaza Oda ambazo mtumiaji ameuza (Kama Muuzaji - Pesa Inatarajiwa kuingia)
        snapSO.forEach(docSnap => {
            const d = docSnap.data();
            const isCompleted = d.status === 'completed';
            combinedTransactions.push({
                title: d.itemTitle || "Sales Income",
                amount: parseFloat(d.amount || 0), // Chanya (Positive) kwa sababu inaingia
                status: isCompleted ? "Success" : "Escrow Held",
                date: d.date || d.createdAt,
                icon: isCompleted ? "" : ""
            });
        });

        // C. Jaza Mikataba ya SokoPay ambayo mtumiaji ameilipia (Pesa Imetoka)
        snapBL.forEach(docSnap => {
            const d = docSnap.data();
            combinedTransactions.push({
                title: d.title || "Contract Payment",
                amount: -parseFloat(d.price || 0),
                status: d.status === 'held' ? "Escrow Hold" : d.status.toUpperCase(),
                date: d.createdAt,
                icon: ""
            });
        });

        // D. Jaza Mikataba ya SokoPay ambayo mtumiaji ameitengeneza na kulipwa (Pesa Inaingia)
        snapOL.forEach(docSnap => {
            const d = docSnap.data();
            const isCompleted = d.status === 'completed';
            combinedTransactions.push({
                title: d.title || "Contract Income",
                amount: parseFloat(d.price || 0),
                status: isCompleted ? "Released" : "Pending",
                date: d.createdAt,
                icon: isCompleted ? "" : ""
            });
        });

        // E. Jaza vitabu vya duka la POS la ndani (Mauzo au Matumizi ya dukani)
        snapLedger.forEach(docSnap => {
            const d = docSnap.data();
            const isExpense = d.type === 'expense';
            combinedTransactions.push({
                title: d.title || "POS Transaction",
                amount: isExpense ? -parseFloat(d.amount || 0) : parseFloat(d.amount || 0),
                status: d.status === 'completed' || d.type === 'income_offline' ? "Success" : "Pending",
                date: d.date,
                icon: isExpense ? "" : ""
            });
        });

        // Panga miamala yote kwa muda (kuanzia mpya zaidi hadi ya zamani)
        combinedTransactions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // Chukua miamala mitano (5) ya juu tu ili kuzuia mrundikano kwenye kioo
        const displayList = combinedTransactions.slice(0, 5);

        if (displayList.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: gray;"> <span style="font-size: 24px;"></span> <p style="font-size:12.5px; margin-top: 5px;">Hujafanya muamala wowote wa kifedha bado.</p> </div>`;
            return;
        }

        let html = '';
        displayList.forEach(tx => {
            const isNegative = tx.amount < 0;
            const displayAmt = Math.abs(tx.amount);
            const amtColor = isNegative ? "#EF4444" : "#10B981"; // Nyekundu au Kijani
            const amtSign = isNegative ? "-" : "+";
            
            // Format tarehe vizuri kwa masaa na dakika (k.m. 10:30 AM)
            const timeStr = tx.date ? new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Sasa";

            html += `
                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px 12px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; text-align: left; transition: 0.2s;"> <div style="display: flex; gap: 10px; align-items: center; min-width: 0;"> <span style="font-size: 16px; flex-shrink: 0;">${tx.icon}</span> <div style="min-width: 0;"> <b style="font-size:13px; color: #0F172A; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${tx.title}</b> <span style="font-size:12px; color: gray; display: block;">Today, ${timeStr}</span> </div> </div> <div style="text-align: right; flex-shrink: 0; margin-left: 10px;"> <b style="font-size:13px; color: ${amtColor}; display: block;">${amtSign} TZS ${displayAmt.toLocaleString()}</b> <small style="font-size:12px; background: white; border: 1px solid #E2E8F0; color: #475569; padding: 1px 4px; border-radius: 4px; font-weight: bold; text-transform: uppercase; display: inline-block; margin-top: 2px;">${tx.status}</small> </div> </div>`;
        });

        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = `<p style="color:red; text-align:center; font-size:12.5px; padding:10px;">Hitilafu: ${skh.skhEscape(err.message)}</p>`;
    }
};

// [SOKOPAY MVP] Orodha kamili ya miamala kwenye tab ya "Transactions"
window.renderSokoPayTransactions = async function() {
    const container = document.getElementById('spTransactionsList');
    if (!container || !skh.currentUser) return;

    container.innerHTML = '<p style="text-align: center; color: gray; font-size:13px;"> Inapakia miamala yako...</p>';

    try {
        const uid = skh.currentUser.uid;

        const qBuyerOrders = skh.query(skh.collection(skh.db, "orders"), skh.where("buyerId", "==", uid), skh.limit(50));
        const qSellerOrders = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", uid), skh.limit(50));
        const qBuyerLinks = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("buyerId", "==", uid), skh.limit(50));
        const qOwnerLinks = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("userId", "==", uid), skh.limit(50));
        const qLedger = skh.query(skh.collection(skh.db, "shop_ledger"), skh.where("shopOwnerId", "==", uid), skh.limit(50));

        const [snapBO, snapSO, snapBL, snapOL, snapLedger] = await Promise.all([
            skh.getDocs(qBuyerOrders), skh.getDocs(qSellerOrders),
            skh.getDocs(qBuyerLinks), skh.getDocs(qOwnerLinks),
            skh.getDocs(qLedger)
        ]);

        const rows = [];

        const push = (title, amount, status, date, code, role) => {
            rows.push({ title, amount, status, date: date || new Date().toISOString(), code: code || '', role: role || '' });
        };

        snapBO.forEach(d => { const x = d.data(); push(x.itemTitle || "Order Payment", -parseFloat(x.amount || 0), x.status || 'pending', x.date || x.createdAt, x.paymentRef, 'Buyer'); });
        snapSO.forEach(d => { const x = d.data(); push(x.itemTitle || "Sales Income", parseFloat(x.amount || 0), x.status || 'pending', x.date || x.createdAt, x.paymentRef, 'Seller'); });
        snapBL.forEach(d => { const x = d.data(); push(x.title || "Contract Payment", -parseFloat(x.price || 0), x.status || 'pending', x.createdAt, x.code, 'Buyer'); });
        snapOL.forEach(d => { const x = d.data(); push(x.title || "Contract Income", parseFloat(x.price || 0), x.status || 'pending', x.createdAt, x.code, 'Seller'); });
        snapLedger.forEach(d => { const x = d.data(); const neg = x.type === 'expense'; push(x.title || "POS Transaction", neg ? -parseFloat(x.amount || 0) : parseFloat(x.amount || 0), x.status || 'pending', x.date, '', 'Shop'); });

        rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        if (rows.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 25px; color: gray;"> <span style="font-size: 26px; display: block; margin-bottom: 6px;"></span> <p style="font-size:13px; margin: 0;">Hujafanya muamala wowote bado.</p> </div>`;
            return;
        }

        const badgeColor = {
            held: '#00509d', completed: '#10b981', pending: '#3b82f6', shipped: '#f59e0b',
            disputed: '#ef4444', refunded: '#8b5cf6', cancelled: '#64748b', paid: '#10b981',
            delivered: '#0ea5e9', released: '#10b981', processing: '#f59e0b', expired: '#64748b'
        };

        let html = '';
        rows.forEach(tx => {
            const neg = tx.amount < 0;
            const sign = neg ? '-' : '+';
            const color = neg ? '#EF4444' : '#10B981';
            const st = (tx.status || '').toString().toLowerCase();
            const badge = badgeColor[st] || '#64748b';
            const timeStr = tx.date ? new Date(tx.date).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sasa';

            html += `
                <div style="background: white; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; text-align: left; margin-bottom: 10px;"> <div style="min-width: 0;"> <b style="font-size: 12px; color: #0F172A; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${skh.skhEscape(tx.title)}</b> <span style="font-size:12px; color: gray; display: block; margin-top: 2px;">${timeStr}${tx.role ? ' • ' + tx.role : ''}${tx.code ? ' • <b style="color:#00509d;">' + skh.skhEscape(tx.code) + '</b>' : ''}</span> </div> <div style="text-align: right; flex-shrink: 0; margin-left: 10px;"> <b style="font-size: 12px; color: ${color}; display: block;">${sign} TZS ${Math.abs(tx.amount).toLocaleString()}</b> <small style="font-size:12px; background: ${badge}; color: white; padding: 2px 7px; border-radius: 8px; font-weight: bold; text-transform: uppercase; display: inline-block; margin-top: 3px;">${skh.skhEscape(st)}</small> </div> </div>`;
        });

        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = `<p style="color:red; text-align:center; font-size:12.5px; padding:10px;">Hitilafu: ${skh.skhEscape(err.message)}</p>`;
    }
};

window.updateSokoPayFormFields = function() {
    const type = document.getElementById('spContractType').value;
    
    const splitSection = document.getElementById('sokoPaySplitSection');
    const prodSection = document.getElementById('spProductFieldsSection');
    const jobSection = document.getElementById('spJobFieldsSection');
    const passSection = document.getElementById('spPassengerFieldsSection');

    // Onyesha sehemu za mhamisho wa fedha (Split) kwa bidhaa na logistics tu
    if (splitSection) splitSection.style.display = (type === 'product' || type === 'logistics') ? 'block' : 'none';
    
    // Onyesha na kuficha fomu maalum za kila aina ya mkataba
    if (prodSection) prodSection.style.display = (type === 'product') ? 'block' : 'none';
    if (jobSection) jobSection.style.display = (type === 'job') ? 'block' : 'none';
    if (passSection) passSection.style.display = (type === 'passenger') ? 'block' : 'none';

    // Kubadili placeholder za vichwa kulingana na aina ya kazi
    const itemNameInput = document.getElementById('spItemName');
    if (itemNameInput) {
        if (type === 'passenger') {
            itemNameInput.placeholder = "Mfano: Safari ya Dar es Salaam kwenda Dodoma *";
        } else if (type === 'job') {
            itemNameInput.placeholder = "Mfano: Graphic Designer (Mkataba wa miezi 3) *";
        } else if (type === 'service') {
            itemNameInput.placeholder = "Mfano: Website Development Contract *";
        } else {
            itemNameInput.placeholder = "Kichwa cha Mkataba / Jina la Kazi *";
        }
    }
    
    window.calculateSokoPaySplit();
};

window.calculateSokoPaySplit = function() {
    const totalAmount = parseFloat(document.getElementById('spAmount').value) || 0;
    const sellerInput = document.getElementById('spSplitSeller');
    const carrierInput = document.getElementById('spSplitCarrier');

    if (totalAmount <= 0) {
        if (sellerInput) sellerInput.value = '';
        if (carrierInput) carrierInput.value = '';
        return;
    }

    const platformFee = totalAmount * 0.05; // 5% Ada ya Platform ya Sokohai
    const carrierShare = totalAmount * 0.15; // 15% Ada ya Msafirishaji (Logistics/Carrier)
    const sellerShare = totalAmount - (platformFee + carrierShare); // Mabaki yanaenda kwa muuzaji

    if (sellerInput) sellerInput.value = Math.round(sellerShare);
    if (carrierInput) carrierInput.value = Math.round(carrierShare);
};

window.adjustSokoPaySplitManual = function() {
    const totalAmount = parseFloat(document.getElementById('spAmount').value) || 0;
    const carrierShare = parseFloat(document.getElementById('spSplitCarrier').value) || 0;
    const sellerInput = document.getElementById('spSplitSeller');

    if (totalAmount <= 0 || carrierShare > totalAmount) return;

    const platformFee = totalAmount * 0.05;
    const sellerShare = totalAmount - (platformFee + carrierShare);

    if (sellerInput) sellerInput.value = Math.round(Math.max(0, sellerShare));
};

window.generateSokoPayCode = async function() {
    if (!skh.requireAuth()) return;
    
    const type = document.getElementById('spContractType').value;
    const name = document.getElementById('spItemName').value.trim();
    const amount = parseFloat(document.getElementById('spAmount').value) || 0;
    const partner = document.getElementById('spPartnerContact').value.trim();
    const desc = document.getElementById('spDesc').value.trim();
    const imageFile = document.getElementById('spImageInput').files[0];

    // [SOKOPAY MVP] Partner contact na picha ni vya hiari
    if (!name || amount <= 0) {
        alert(" jaza maelezo ya bidhaa/huduma na kiasi cha Escrow!");
        return;
    }

    const btn = document.getElementById('btnGenerateSp');
    const originalText = btn.innerHTML;
    btn.innerHTML = " Inatengeneza Msimbo na Kupandisha Proof...";
    btn.disabled = true;

    try {
        // [SOKOPAY MVP] Pandisha picha ya ushahidi ikiwa ipo (si lazima)
        let imageUrl = '';
        if (imageFile) {
            imageUrl = await skh.uploadImage('spImageInput') || '';
        }

        // Kuzalisha Code ya Siri na ya Kipekee (SokoPay Code)
        const spCode = "SP-" + Math.random().toString(36).substr(2, 6).toUpperCase();

        // [SOKOPAY] Tengeneza Token + Linki + QR Code (zote tatu) kabla ya kuhifadhi kwenye cloud
        const sokopayLink = window.spBuildHaiPayLink(spCode);
        const sokopayQR = window.spMakeQRDataUrl(sokopayLink);

        const platformFee = amount * 0.05;
        const carrierShare = parseFloat(document.getElementById('spSplitCarrier')?.value) || 0;
        const sellerShare = amount - (platformFee + carrierShare);

        // Kusanya data za ziada kulingana na aina ya mkataba
        let additionalMetadata = {};
        if (type === 'product') {
            additionalMetadata = {
                qty: parseInt(document.getElementById('spProdQty').value) || 1,
                logisticsType: document.getElementById('spProdLogistics').value,
                pickupLocation: document.getElementById('spProdPickupLoc').value.trim(),
                dropLocation: document.getElementById('spProdDropLoc').value.trim()
            };
        } else if (type === 'job') {
            additionalMetadata = {
                releaseMethod: document.getElementById('spJobReleaseMethod').value,
                interval: document.getElementById('spJobInterval').value
            };
        } else if (type === 'passenger') {
            additionalMetadata = {
                busCompany: document.getElementById('spPassCompany').value.trim(),
                seatNumber: document.getElementById('spPassSeat').value.trim()
            };
        }

        // Hifadhi mkataba mpya kwenye Firestore collection ya "sokopay_links"
        await skh.addDoc(skh.collection(skh.db, "sokopay_links"), {
            contractType: type,
            title: name,
            price: amount,
            platformFee: platformFee,
            carrierShare: carrierShare,
            sellerShare: sellerShare,
            partnerContact: partner,
            description: desc,
            image: imageUrl,
            code: spCode,
            link: sokopayLink,          // [SOKOPAY] Linki ya kumshirikisha mnunuzi
            qrDataUrl: sokopayQR,       // [SOKOPAY] QR code (PNG data URL)
            userId: skh.currentUser.uid,
            ownerName: skh.currentUser.displayName || "Owner",
            userEmail: skh.currentUser.email,
            status: "pending", // Hali ya mwanzo: inasubiri malipo
            isSokoPay: true,
            metadata: additionalMetadata,
            createdAt: new Date().toISOString()
        });

        // [SOKOPAY MVP] Tuma taarifa kwa partner iwapo aliandika mawasiliano
        if (partner) {
            await skh.addDoc(skh.collection(skh.db, "notifications"), {
                userId: partner, // Kama ameandika uid ya partner
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.paymentLink',
                params: { title: String(name || ''), amount: amount.toLocaleString(), code: String(spCode || '') },
                title: " SokoPay: Payment Link Mpya Inakusubiri!",
                body: `Umetengenezewa payment link ya "${name}" (TSh ${amount.toLocaleString()}). Tumia Token ${spCode} au linki ${sokopayLink} kuukagua na kuulipia.`,
                createdAt: new Date().toISOString(),
                read: false
            }).catch(() => {}); // Kuzuia crash kama ameweka simu badala ya uid
        }

        // Onyesha matokeo: token, linki (zote zinakalika) + QR code
        window.spRenderGenResult({
            code: spCode,
            link: sokopayLink,
            qr: sokopayQR,
            title: name,
            amount: amount,
            createdAt: new Date().toISOString()
        });

        // Hifadhi kwenye orodha ya ndani (localStorage) na kwenye cloud (Firestore)
        window.spSaveHaiPayItem({ code: spCode, link: sokopayLink, qr: sokopayQR, title: name, amount: amount });

        // Safisha fomu
        document.getElementById('spItemName').value = '';
        document.getElementById('spAmount').value = '';
        document.getElementById('spPartnerContact').value = '';
        document.getElementById('spDesc').value = '';
        document.getElementById('spImageInput').value = '';
        
        // Andaa Tab ya Pay (token tayari imejazwa) bila kuacha ukurasa wa kutengeneza
        document.getElementById('spCodeInputPay').value = spCode;
        window.syncSokoPayRealtimeData(); // Refresh balances

        // Hakikisha matokeo yanaonekana kwa mtumiaji
        const genResEl = document.getElementById('spGenResult');
        if (genResEl && genResEl.scrollIntoView) {
            setTimeout(() => genResEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }

    } catch (e) {
        alert(" Imeshindwa kuunda mkataba: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

/* ============================================================
   [SOKOPAY] Token + Linki + QR Code — kuzalisha, kunakili, kuhifadhi
   ============================================================ */

// Jenga linki ya kumshirikisha mnunuzi (deep-link ya SokoPay)
window.spBuildHaiPayLink = function(code) {
    try {
        const base = window.location.origin + window.location.pathname;
        return base + '#sokopay=' + encodeURIComponent(code);
    } catch (e) {
        return '#sokopay=' + code;
    }
};

// QR encoder (Byte mode, EC L, v1..9, mask 0) — inarudisha PNG data URL
window.spMakeQRDataUrl = function(text) {
    try {
        var L_TABLE = {
            1: { blocks: 1, data: 19,  ec: 7,  rem: 0, align: [] },
            2: { blocks: 1, data: 34,  ec: 10, rem: 7, align: [6, 18] },
            3: { blocks: 1, data: 55,  ec: 15, rem: 7, align: [6, 22] },
            4: { blocks: 1, data: 80,  ec: 20, rem: 7, align: [6, 26] },
            5: { blocks: 1, data: 108, ec: 26, rem: 7, align: [6, 30] },
            6: { blocks: 2, data: 68,  ec: 18, rem: 7, align: [6, 34] },
            7: { blocks: 2, data: 78,  ec: 20, rem: 0, align: [6, 22, 38] },
            8: { blocks: 2, data: 97,  ec: 24, rem: 0, align: [6, 24, 42] },
            9: { blocks: 2, data: 116, ec: 30, rem: 0, align: [6, 26, 46] }
        };
        function utf8Bytes(s) {
            var out = [];
            for (var i = 0; i < s.length; i++) {
                var c = s.codePointAt(i);
                if (c > 0xFFFF) i++;
                if (c < 0x80) out.push(c);
                else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
                else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
                else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
            }
            return out;
        }
        var EXP = new Array(512), LOG = new Array(256);
        (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; } for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255]; })();
        function gmul(a, b) { if (a === 0 || b === 0) return 0; return EXP[LOG[a] + LOG[b]]; }
        function rsGeneratorPoly(n) {
            var poly = [1];
            for (var i = 0; i < n; i++) {
                var next = new Array(poly.length + 1).fill(0);
                next[0] = poly[0];
                for (var j = 1; j < poly.length; j++) next[j] = poly[j] ^ gmul(poly[j - 1], EXP[i]);
                next[poly.length] = gmul(poly[poly.length - 1], EXP[i]);
                poly = next;
            }
            return poly;
        }
        function rsEncode(data, ecLen) {
            var gen = rsGeneratorPoly(ecLen);
            var res = data.concat(new Array(ecLen).fill(0));
            for (var i = 0; i < data.length; i++) {
                var coef = res[i];
                if (coef !== 0) for (var j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef);
            }
            return res.slice(data.length);
        }
        var bytes = utf8Bytes(text);
        var versionNum = 0;
        for (var v = 1; v <= 9; v++) {
            if (L_TABLE[v].data * L_TABLE[v].blocks * 8 >= bytes.length * 8 + 12) { versionNum = v; break; }
        }
        if (versionNum === 0) { versionNum = 9; bytes = bytes.slice(0, L_TABLE[9].data * L_TABLE[9].blocks - 2); }
        var ver = L_TABLE[versionNum];
        var size = 17 + 4 * versionNum;
        var capBits = ver.data * ver.blocks * 8;

        var bits = [];
        function push(val, len) { for (var b = len - 1; b >= 0; b--) bits.push((val >>> b) & 1); }
        push(0x4, 4);
        push(bytes.length, 8);
        for (var k = 0; k < bytes.length; k++) push(bytes[k], 8);
        push(0, Math.min(4, capBits - bits.length));
        while (bits.length % 8 !== 0) push(0, 1);
        var pad = 0;
        while (bits.length < capBits) { push(pad === 0 ? 0xEC : 0x11, 8); pad ^= 1; }

        var codewords = [];
        for (var i2 = 0; i2 < capBits / 8; i2++) { var val = 0; for (var b2 = 0; b2 < 8; b2++) val = (val << 1) | bits[i2 * 8 + b2]; codewords.push(val); }
        var blocks = [], ecBlocks = [];
        for (var blk = 0; blk < ver.blocks; blk++) { blocks.push(codewords.slice(blk * ver.data, (blk + 1) * ver.data)); ecBlocks.push(rsEncode(blocks[blk], ver.ec)); }
        var inter = [];
        for (var d = 0; d < ver.data; d++) for (var b3 = 0; b3 < ver.blocks; b3++) inter.push(blocks[b3][d]);
        for (var e = 0; e < ver.ec; e++) for (var b4 = 0; b4 < ver.blocks; b4++) inter.push(ecBlocks[b4][e]);
        var allBits = [];
        for (var c = 0; c < inter.length; c++) for (var b5 = 7; b5 >= 0; b5--) allBits.push((inter[c] >>> b5) & 1);
        for (var r0 = 0; r0 < ver.rem; r0++) allBits.push(0);

        var m = [], func = [];
        for (var row = 0; row < size; row++) { m.push(new Array(size).fill(-1)); func.push(new Array(size).fill(false)); }
        function setFunc(x, y, dark) { m[y][x] = dark ? 1 : 0; func[y][x] = true; }

        function drawFinder(cx, cy) {
            for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
                var xx = cx + dx, yy = cy + dy;
                if (xx >= 0 && xx < size && yy >= 0 && yy < size) {
                    var dist = Math.max(Math.abs(dx), Math.abs(dy));
                    setFunc(xx, yy, dist !== 2);
                }
            }
        }
        drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
        for (var s = 0; s < 8; s++) {
            setFunc(s, 7, false); setFunc(7, s, false);
            setFunc(size - 1 - s, 7, false); setFunc(size - 8, s, false);
            setFunc(s, size - 8, false); setFunc(7, size - 1 - s, false);
        }
        for (var t = 8; t < size - 8; t++) { setFunc(t, 6, t % 2 === 0); setFunc(6, t, t % 2 === 0); }
        var ac = ver.align, last = size - 7;
        for (var ai = 0; ai < ac.length; ai++) for (var aj = 0; aj < ac.length; aj++) {
            var cx = ac[ai], cy = ac[aj];
            if ((cx === 6 && cy === 6) || (cx === 6 && cy === last) || (cx === last && cy === 6)) continue;
            for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++)
                setFunc(cx + dx2, cy + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
        }
        var data = (1 << 3) | 0; // EC L + mask 0
        var rem = data;
        for (var f = 0; f < 10; f++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        var fmt = (data << 10 | rem) ^ 0x5412;
        function getBit(x, i) { return ((x >>> i) & 1) !== 0; }
        for (var f1 = 0; f1 <= 5; f1++) setFunc(8, f1, getBit(fmt, f1));
        setFunc(8, 7, getBit(fmt, 6)); setFunc(8, 8, getBit(fmt, 7)); setFunc(7, 8, getBit(fmt, 8));
        for (var f2 = 9; f2 < 15; f2++) setFunc(14 - f2, 8, getBit(fmt, f2));
        for (var f3 = 0; f3 < 8; f3++) setFunc(size - 1 - f3, 8, getBit(fmt, f3));
        for (var f4 = 8; f4 < 15; f4++) setFunc(8, size - 15 + f4, getBit(fmt, f4));
        setFunc(8, size - 8, true); // dark module

        var i = 0;
        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (var vert = 0; vert < size; vert++) {
                for (var j = 0; j < 2; j++) {
                    var x = right - j;
                    var upward = ((right + 1) & 2) === 0;
                    var y = upward ? size - 1 - vert : vert;
                    if (m[y][x] === -1 && i < allBits.length) m[y][x] = allBits[i++];
                }
            }
        }
        for (var my = 0; my < size; my++) for (var mx = 0; mx < size; mx++) {
            if (!func[my][mx] && ((mx + my) & 1) === 0) m[my][mx] = m[my][mx] === 1 ? 0 : 1;
        }

        // Chora kwenye canvas -> PNG data URL
        var scale = 7, margin = 4;
        var dim = (size + margin * 2) * scale;
        var canvas = document.createElement('canvas');
        canvas.width = dim; canvas.height = dim;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, dim, dim);
        ctx.fillStyle = '#001122';
        for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
            if (m[yy][xx] === 1) ctx.fillRect((xx + margin) * scale, (yy + margin) * scale, scale, scale);
        }
        return canvas.toDataURL('image/png');
    } catch (err) {
        return '';
    }
};

// Nakili maandishi bila alert ya kelele — feedback inline kwenye button
window.spCopyHaiPay = function(text, btnRef) {
    const btn = (typeof btnRef === 'string') ? document.getElementById(btnRef) : btnRef;
    const done = () => {
        if (btn) {
            const old = btn.innerHTML;
            btn.innerHTML = '&#10003; Imenakiliwa';
            btn.style.background = '#16a34a';
            btn.style.color = '#fff';
            setTimeout(() => { btn.innerHTML = old; btn.style.background = ''; btn.style.color = ''; }, 1600);
        }
    };
    const fallback = () => {
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            done();
        } catch (e) { alert('Nakili kwa mkono: ' + text); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(text)).then(done, fallback);
    } else {
        fallback();
    }
};

// Hifadhi item (token + linki + QR) kwenye localStorage (cache) NA kwenye cloud (Firestore)
window.spSaveHaiPayItem = function(item) {
    try {
        const items = window.spGetSavedHaiPayItems();
        // Epuka marudio ya token ile ile
        const idx = items.findIndex(x => x.code === item.code);
        const entry = {
            id: (item.id || ('sp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5))),
            docId: item.docId || (idx >= 0 ? items[idx].docId : null),
            code: item.code,
            link: item.link || '',
            qr: item.qr || '',
            title: item.title || '',
            amount: item.amount || 0,
            createdAt: item.createdAt || new Date().toISOString()
        };
        if (idx >= 0) items[idx] = entry; else items.unshift(entry);
        // Weka kikomo (hifadhi 60 za karibuni)
        const trimmed = items.slice(0, 60);
        skh.localStorage.setItem('haipay_saved_v1', JSON.stringify(trimmed));
        window.spRenderSavedItems();
        // Piga push kwenye cloud (bila kusubiri)
        window.spSaveHaiPayItemCloud(entry).then(docId => {
            if (docId) {
                const all = window.spGetSavedHaiPayItems();
                const i = all.findIndex(x => x.id === entry.id);
                if (i >= 0) { all[i].docId = docId; skh.localStorage.setItem('haipay_saved_v1', JSON.stringify(all)); }
            }
        });
    } catch (e) { /* storage kamili au imezimwa */ }
};

window.spGetSavedHaiPayItems = function() {
    try {
        const raw = skh.localStorage.getItem('haipay_saved_v1');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
};

// Hifadhi item kwenye Firestore (cloud) — inarudisha docId au false
window.spSaveHaiPayItemCloud = async function(item) {
    if (!skh.currentUser || !skh.currentUser.uid) return false;
    try {
        const ref = await skh.addDoc(skh.collection(skh.db, "haipay_saved"), {
            userId: skh.currentUser.uid,
            code: item.code,
            link: item.link || '',
            qr: (item.qr && item.qr.length < 20000) ? item.qr : '',
            title: item.title || '',
            amount: item.amount || 0,
            createdAt: item.createdAt || new Date().toISOString()
        });
        return ref.id;
    } catch (e) { return false; }
};

// Leta vitu vya cloud (Firestore) na vichanganye na vya ndani
window.spSyncSavedFromCloud = async function() {
    const el = document.getElementById('spSavedItems');
    if (!el || !skh.currentUser || !skh.currentUser.uid) return;
    try {
        const q = skh.query(
            skh.collection(skh.db, "haipay_saved"),
            skh.where("userId", "==", skh.currentUser.uid),
            skh.limit(60)
        );
        const snap = await skh.getDocs(q);
        const merged = window.spGetSavedHaiPayItems().slice();
        snap.forEach(d => {
            const dt = d.data();
            if (!merged.some(x => x.code === dt.code)) {
                merged.push({ id: d.id, docId: d.id, code: dt.code, link: dt.link || '', qr: dt.qr || '', title: dt.title || '', amount: dt.amount || 0, createdAt: dt.createdAt || '' });
            }
        });
        merged.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        window.renderSavedItemsList(el, merged);
        skh.localStorage.setItem('haipay_saved_v1', JSON.stringify(merged.slice(0, 60)));
    } catch (e) {}
};

// Chora orodha ya vitu vilivyohifadhiwa
window.renderSavedItemsList = function(el, items) {
    if (!items.length) {
        el.innerHTML = '<p style="font-size:13px; color:#94a3b8; text-align:center; padding:8px;">Hakuna token/linki iliyohifadhiwa bado.</p>';
        return;
    }
    let html = '';
    items.forEach(it => {
        const d = it.createdAt ? new Date(it.createdAt) : null;
        const dStr = d ? d.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : '';
        html += `
        <div style="background:#fff; border:1px solid #E2E8F0; border-radius:12px; padding:10px 12px; margin-bottom:8px; display:flex; gap:10px; align-items:center; text-align:left;">
            ${it.qr ? `<img src="${it.qr}" alt="" style="width:52px; height:52px; border:1px solid #e2e8f0; border-radius:6px; background:#fff; flex-shrink:0;">` : ''}
            <div style="flex:1; min-width:0;"> <b style="font-size:13px; color:#0F172A; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${skh.skhEscape(it.title || 'SokoPay Link')} ${it.docId ? '<span style="font-size:12px; color:#0ea5e9; font-weight:900;"> CLOUD</span>' : ''}</b> <span style="font-family:monospace; font-size:13px; font-weight:800; color:#00509d;">${skh.skhEscape(it.code)}</span>
                ${it.amount ? `<span style="font-size:12.5px; color:#065f46; font-weight:700;">· TZS ${Number(it.amount).toLocaleString()}</span>` : ''}
                <span style="font-size:12px; color:#94a3b8; display:block;">${dStr}</span> </div> <div style="display:flex; flex-direction:column; gap:5px; flex-shrink:0;"> <button type="button" data-copy="${skh.skhEscape(it.code)}" onclick="window.spCopyHaiPay(this.dataset.copy, this)" style="padding:6px 10px; background:#e0f2fe; color:#00509d; border:none; border-radius:8px; font-weight:800; font-size:12.5px; cursor:pointer;">Nakili Token</button> <button type="button" data-copy="${skh.skhEscape(it.link)}" onclick="window.spCopyHaiPay(this.dataset.copy, this)" style="padding:6px 10px; background:#f0f9ff; color:#0369a1; border:none; border-radius:8px; font-weight:800; font-size:12.5px; cursor:pointer;">Nakili Linki</button> <button type="button" onclick="window.spDeleteSavedItem('${skh.skhJsEsc(it.id)}')" style="padding:6px 10px; background:#fee2e2; color:#b91c1c; border:none; border-radius:8px; font-weight:800; font-size:12.5px; cursor:pointer;">Futa</button> </div> </div>`;
    });
    el.innerHTML = html;
};

// Shiriki linki kwa WhatsApp
window.spShareWhatsApp = function(link, code, title, amount) {
    try {
        const msg = `SokoPay Malipo:\n${title || 'Malipo'} (TSh ${Number(amount || 0).toLocaleString()})\nToken: ${code}\nLipa kwa usalama wa Escrow: ${link}`;
        window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    } catch (e) {}
};

// Futa item moja (ndani + cloud) — cloud inafutwa kwanza kuepuka kurudishwa na sync
window.spDeleteSavedItem = async function(id) {
    try {
        let items = window.spGetSavedHaiPayItems();
        const target = items.find(x => x.id === id);
        items = items.filter(x => x.id !== id);
        skh.localStorage.setItem('haipay_saved_v1', JSON.stringify(items));
        // Futa kwenye cloud kwanza (docId au id), kisha render + sync
        const cloudId = (target && (target.docId || target.id)) || id;
        if (skh.currentUser && skh.currentUser.uid) {
            await skh.deleteDoc(skh.doc(skh.db, "haipay_saved", cloudId)).catch(() => {});
        }
        window.spRenderSavedItems();
    } catch (e) {}
};

// Ingiza token / linki kwa mkono (rejesha na hifadhi)
window.importHaiPayItem = function() {
    const input = document.getElementById('spImportInput');
    if (!input) return;
    const val = (input.value || '').trim();
    if (!val) { alert(' Bandika token au linki kwanza.'); return; }

    let code = '', link = '';
    const tokenMatch = val.toUpperCase().match(/SP-[A-Z0-9]{2,}/);
    if (tokenMatch) {
        code = tokenMatch[0];
        link = (val.indexOf('http') === 0) ? val : window.spBuildHaiPayLink(code);
    } else if (val.indexOf('http') === 0) {
        link = val;
        const h = val.split('#')[1] || '';
        const m = h.match(/(?:sokopay|haiPay)=([^&]+)/i);
        if (m) code = window.decodeURIComponent(m[1]).toUpperCase();
    }
    if (!code && !link) { alert(' Haisomeki. Tumia token (SP-XXXXXX) au linki kamili ya SokoPay.'); return; }
    if (!code) code = 'SP-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    window.spSaveHaiPayItem({
        code: code,
        link: link,
        qr: window.spMakeQRDataUrl(link),
        title: 'Imeingizwa kwa mkono',
        amount: 0,
        createdAt: new Date().toISOString()
    });
    input.value = '';
    // Onyesha orodha iliyohifadhiwa
    const savedBox = document.getElementById('spSavedItems');
    if (savedBox && savedBox.scrollIntoView) setTimeout(() => savedBox.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
};

// Onyesha matokeo ya kuzalisha (token + linki + QR) kwenye Create Link tab
window.spRenderGenResult = function(item) {
    const el = document.getElementById('spGenResult');
    if (!el) return;
    el.style.display = 'block';
    const fmtAmt = (item.amount || 0).toLocaleString();
    el.innerHTML = `
        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:14px; padding:16px; margin-bottom:4px;"> <b style="font-size:13px; color:#0369a1; display:flex; align-items:center; gap:6px;"> <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0369a1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                LINKI IMEZALISHWA (Token + Linki + QR)
            </b> <p style="font-size:13px; color:#334155; margin:6px 0 10px; line-height:1.5;">"${skh.skhEscape(item.title || '')}" &mdash; TZS ${fmtAmt}. Mpe mnunuzi token, linki au QR code; ataingia 'Pay' na kulipia kwa Escrow.</p> <label style="font-size:12.5px; font-weight:800; color:#0f172a; display:block; margin-bottom:3px;">TOKEN (nakili)</label> <div style="display:flex; gap:8px; margin-bottom:10px;"> <input id="spGenToken" readonly value="${skh.skhEscape(item.code)}" onclick="this.select()" style="flex:1; min-width:0; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px; font-family:monospace; font-weight:800; font-size:14px; color:#0f172a; background:#fff; outline:none;"> <button type="button" id="spCopyTokenBtn" onclick="window.spCopyHaiPay(document.getElementById('spGenToken').value, 'spCopyTokenBtn')" style="padding:10px 14px; background:#00509d; color:#fff; border:none; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; white-space:nowrap;">Nakili</button> </div> <label style="font-size:12.5px; font-weight:800; color:#0f172a; display:block; margin-bottom:3px;">LINKI (nakili & tuma kwa WhatsApp/SMS)</label> <div style="display:flex; gap:8px; margin-bottom:12px;"> <input id="spGenLink" readonly value="${skh.skhEscape(item.link)}" onclick="this.select()" style="flex:1; min-width:0; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px; font-size:12px; color:#0f172a; background:#fff; outline:none;"> <button type="button" id="spCopyLinkBtn" onclick="window.spCopyHaiPay(document.getElementById('spGenLink').value, 'spCopyLinkBtn')" style="padding:10px 14px; background:#00509d; color:#fff; border:none; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; white-space:nowrap;">Nakili</button> </div> <label style="font-size:12.5px; font-weight:800; color:#0f172a; display:block; margin-bottom:3px;">QR CODE (skanisha au pakua)</label> <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                ${item.qr ? `<img src="${item.qr}" alt="QR ${skh.skhEscape(item.code)}" style="width:150px; height:150px; background:#fff; border:1px solid #e2e8f0; border-radius:10px;">` : '<span style="font-size:13px;color:#b45309;">QR haikuweza kutengenezwa.</span>'}
                ${item.qr ? `<div style="display:flex; flex-direction:column; gap:8px;"> <a href="${item.qr}" download="sokopay-${skh.skhEscape(item.code)}.png" style="text-align:center; padding:9px 14px; background:#001122; color:#fff; border-radius:10px; font-weight:800; font-size:12px; text-decoration:none;">&#11015; Pakua PNG</a> <button type="button" id="spCopyQrBtn" onclick="window.spCopyHaiPay(document.querySelector('#spGenResult img').src, 'spCopyQrBtn')" style="padding:9px 14px; background:#e2e8f0; color:#0f172a; border:none; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer;">Nakili QR</button> </div>` : ''}
            </div> <button type="button" onclick="window.spShareWhatsApp('${skh.skhJsEsc(item.link)}','${skh.skhJsEsc(item.code)}','${skh.skhJsEsc(item.title || '')}',${Number(item.amount || 0)})" style="margin-top:12px; width:100%; padding:11px 14px; background:#25D366; color:#fff; border:none; border-radius:10px; font-weight:900; font-size:12.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;"> <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Shiriki kwa WhatsApp
            </button> <p style="font-size:12.5px; color:#64748b; margin:10px 0 0;">Token, linki na QR vimehifadhiwa kiotomatiki kwenye cloud na kwenye orodha ya "Hifadhi / Ingiza" hapa chini.</p> </div>`;
};

// Orodhesha vitu vilivyohifadhiwa (ndani mara moja, kisha cloud inaunganishwa)
window.spRenderSavedItems = function() {
    const el = document.getElementById('spSavedItems');
    if (!el) return;
    window.renderSavedItemsList(el, window.spGetSavedHaiPayItems());
    window.spSyncSavedFromCloud();
};

// Deep-link: #sokopay=CODE -> fungua SokoPay + Pay tab + jaza token + hakiki moja kwa moja
window.applyHaiPayDeepLink = function() {
    try {
        const h = window.location.hash || '';
        const m = h.match(/(?:sokopay|haiPay)=([^&]+)/i);
        if (!m) return false;
        const code = window.decodeURIComponent(m[1]).trim().toUpperCase();
        if (!code) return false;
        window.toggleSokoPayTab('pay');
        const input = document.getElementById('spCodeInputPay');
        if (input) input.value = code;
        // Hakiki mkataba moja kwa moja ili mpokeaji aone bidhaa + kiasi + kitufe cha kulipa
        setTimeout(() => {
            if (skh.currentUser && typeof window.verifyAndPreviewSokoPay === 'function') window.verifyAndPreviewSokoPay();
        }, 400);
        return true;
    } catch (e) { return false; }
};

// Soma chochote alichoandika mtumiaji (token au linki) — linki ibadilike kuwa token
window.spCodeInputChanged = function(val) {
    if (!val) return;
    const v = String(val).trim();
    // Kama ni linki kamili yenye #sokopay=CODE, toa token kutoka humo
    const m = v.match(/(?:sokopay|haiPay)=([^&]+)/i);
    if (m) {
        try {
            const code = window.decodeURIComponent(m[1]).trim().toUpperCase();
            const input = document.getElementById('spCodeInputPay');
            if (input && code) input.value = code;
        } catch (e) {}
        return;
    }
    // Kama ni token, rekebisha tu herufi kubwa
    const token = v.toUpperCase().match(/SP-[A-Z0-9]{2,}/);
    if (token) {
        const input = document.getElementById('spCodeInputPay');
        if (input) input.value = token[0];
    }
};

// Skanisha QR code (kamera) — inatumia BarcodeDetector ikiwepo, vinginevyo file input
window.spScanQr = function() {
    // Njia A: BarcodeDetector (Chrome/Android) — kamera moja kwa moja
    if (typeof window.BarcodeDetector === 'function') {
        window.toggleSokoPayTab('pay');
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    const video = document.createElement('video');
                    video.autoplay = true;
                    video.playsInline = true;
                    video.muted = true;
                    video.srcObject = stream;
                    video.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:100000; background:#000;';
                    document.body.appendChild(video);
                    const stopBtn = document.createElement('button');
                    stopBtn.innerText = 'GHARISHA';
                    stopBtn.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); z-index:100001; padding:14px 30px; background:#ef4444; color:#fff; border:none; border-radius:999px; font-weight:900;';
                    document.body.appendChild(stopBtn);
                    const scanLoop = window.setInterval(async () => {
                        try {
                            const codes = await detector.detect(video);
                            if (codes && codes.length) {
                                window.clearInterval(scanLoop);
                                window.spApplyScannedValue(codes[0].rawValue || '');
                                window.spStopQrCamera(stream, video, stopBtn);
                            }
                        } catch (e) {}
                    }, 600);
                    stopBtn.onclick = () => {
                        window.clearInterval(scanLoop);
                        window.spStopQrCamera(stream, video, stopBtn);
                    };
                })
                .catch(() => { window.spScanQrFromFilePicker(); });
            return;
        }
    }
    // Njia B: chagua picha ya QR kutoka kwenye kifaa
    window.spScanQrFromFilePicker();
};

window.spStopQrCamera = function(stream, video, stopBtn) {
    try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { if (video && video.parentNode) video.parentNode.removeChild(video); } catch (e) {}
    try { if (stopBtn && stopBtn.parentNode) stopBtn.parentNode.removeChild(stopBtn); } catch (e) {}
};

window.spScanQrFromFilePicker = function() {
    window.toggleSokoPayTab('pay');
    const fileInput = document.getElementById('spQrFileInput');
    if (fileInput) fileInput.click();
};

// Soma QR kutoka kwenye picha iliyochaguliwa
window.spScanQrFromFile = async function(fileList) {
    if (!fileList || !fileList.length) return;
    const file = fileList[0];
    try {
        if (typeof window.BarcodeDetector === 'function') {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const codes = await detector.detect(file);
            if (codes && codes.length) {
                window.spApplyScannedValue(codes[0].rawValue || '');
                return;
            }
            alert(" QR haikusomeka kwenye picha hiyo. Bandika token au linki kwa mkono.");
            return;
        }
        // Bila BarcodeDetector: mwelekezo wa kuandika kwa mkono
        const val = window.prompt ? window.prompt("QR haikuweza kusomwa moja kwa moja kwenye kifaa hiki. Bandika token (SP-XXXXXX) au linki uliyopewa:", "") : "";
        if (val) window.spApplyScannedValue(val);
    } catch (e) {
        alert(" Haikuweza kusoma QR. Bandika token au linki kwa mkono.");
    }
};

// Tumia thamani iliyosomwa (kutoka QR au linki) — jaza token na hakiki mkataba
window.spApplyScannedValue = function(raw) {
    if (!raw) { alert(" QR iko tupu."); return; }
    const v = String(raw).trim();
    let code = '';
    const tokenMatch = v.toUpperCase().match(/SP-[A-Z0-9]{2,}/);
    const linkMatch = v.match(/(?:sokopay|haiPay)=([^&]+)/i);
    if (linkMatch) {
        try { code = window.decodeURIComponent(linkMatch[1]).trim().toUpperCase(); } catch (e) { code = linkMatch[1].trim().toUpperCase(); }
    } else if (tokenMatch) {
        code = tokenMatch[0];
    }
    if (!code) {
        alert(" QR haina token wala linki ya SokoPay inayotambulika.");
        return;
    }
    const input = document.getElementById('spCodeInputPay');
    if (input) input.value = code;
    window.verifyAndPreviewSokoPay();
};

window.verifyAndPreviewSokoPay = async function() {
    const code = document.getElementById('spCodeInputPay').value.trim().toUpperCase();
    if (!code) {
        alert(" ingiza msimbo wa SokoPay (SP-XXXXXX) kwanza!");
        return;
    }

    const preview = document.getElementById('spItemPreview');
    const btnVerify = document.getElementById('btnVerifySp');
    const btnProceed = document.getElementById('btnProceedPaySp');

    if (preview) {
        preview.innerHTML = '<p style="text-align:center; color:gray; font-size:13px; padding:10px;"> Inahakiki msimbo kutoka kwenye daftari la mkataba...</p>';
        preview.style.display = 'block';
    }

    try {
        // Tafuta mkataba kwenye Firestore wenye msimbo huu na ambao haujalipiwa (status == pending)
        const q = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("code", "==", code), skh.where("status", "==", "pending"));
        const snap = await skh.getDocs(q);

        if (snap.empty) {
            if (preview) preview.style.display = 'none';
            alert(" Msimbo huu si sahihi, umeshatumika, au umefutwa na mmiliki!");
            return;
        }

        const docId = snap.docs[0].id;
        const d = snap.docs[0].data();

        // Kuzuia mtumiaji kulipia mkataba aliojitengenezea mwenyewe
        if (d.userId === skh.currentUser.uid) {
            if (preview) preview.style.display = 'none';
            alert(" Huwezi kulipia mkataba ulioutengeneza wewe mwenyewe!");
            return;
        }

        // Kuhifadhi data ya mkataba huu kwa muda kwenye global memory ya miamala
        skh.currentOpenProduct = { id: docId, isSokoPay: true, ...d };

        // Chora muonekano wa preview maridadi ya mkataba
        if (preview) {
            preview.innerHTML = `
                <div style="display:flex; gap:12px; align-items:center; text-align:left;"> <img src="${skh.skhEscape(skh.getOptimizedImageUrl(d.image))}" style="width:60px; height:65px; border-radius:12px; object-fit:cover; border:1px solid #E2E8F0;" onerror="this.src='https://ui-avatars.com/api/?name=SokoPay&background=cbd5e1&color=0f172a'"> <div> <span style="font-size:12px; background: #FFFBEB; color: #B45309; padding: 2px 8px; border-radius: 10px; font-weight: bold; text-transform: uppercase;">Mkataba wa ${skh.skhEscape(d.contractType.toUpperCase())}</span> <b style="font-size:13px; display:block; color:#0F172A; margin-top:4px;">${skh.skhEscape(d.title)}</b> <span style="display:block; color:var(--terracotta); font-weight:900; margin-top:2px;">TSh ${d.price.toLocaleString()}</span> <small style="color:gray; font-size:12.5px; display:block; margin-top:2px;">Umetengenezwa na: <b>${skh.skhEscape(d.ownerName)}</b></small> </div> </div> `;
        }

        // Badilisha vitufe vya muamala
        if (btnVerify) btnVerify.style.display = 'none';
        if (btnProceed) btnProceed.style.display = 'block';

    } catch (err) {
        if (preview) preview.style.display = 'none';
        alert(" Hitilafu ya mtandao wakati wa uhakiki: " + err.message);
    }
};

window.proceedToPaySokoPay = async function() {
    if (!skh.currentOpenProduct) return;

    const price = parseFloat(skh.currentOpenProduct.price || 0);
    const walletBalance = parseFloat(skh.currentUserData?.walletBalance || 0);

    // Kagua kama Salio la Wallet linatosha kufanya malipo ya papo hapo (Instant Escrow)
    if (walletBalance >= price) {
        if (await skhConfirm(` SALIO LA WALLET LINATOSHA!\n\nJe, unathibitisha kufanya malipo ya papo hapo ya TSh ${price.toLocaleString()} kutoka kwenye salio lako la Wallet (TSh ${walletBalance.toLocaleString()}) ili kufunga fedha kwenye Escrow?`)) {
            await window.executeSokoPayWalletPayment(skh.currentOpenProduct.id, price);
        }
    } else {
        // Ikiwa salio halitoshi, mpeleke kwenye dirisha la kawaida la checkout la PesaPal
        const confirmationMsg = ` Salio la wallet yako halitoshi (Salio la sasa: TSh ${walletBalance.toLocaleString()}).\n\nSokoPay inakuelekeza kwenye dirisha la malipo ya mitandao ya simu (M-Pesa, Tigo, Airtel) au benki ili kukamilisha Escrow ya TSh ${price.toLocaleString()}.`;
        alert(confirmationMsg);
        
        skh.activeCheckoutAmount = price;
        window.openCheckout('direct'); // Hii inaita function ya kawaida ya checkout iliyopo kwenye App yako
    }
};

window.executeSokoPayWalletPayment = async function(linkDocId, price) {
    const btnProceed = document.getElementById('btnProceedPaySp');
    const originalText = btnProceed ? btnProceed.innerHTML : "Lipia";
    
    if (btnProceed) {
        btnProceed.innerHTML = " Inakata Salio na Kufunga Escrow...";
        btnProceed.disabled = true;
    }

    try {
        const buyerDocRef = skh.doc(skh.db, "users", skh.currentUserData.docId);
        const linkDocRef = skh.doc(skh.db, "sokopay_links", linkDocId);

        // A. Kata kiasi cha mkataba kwenye salio la Wallet ya mnunuzi
        // [PHASE 5.2b] kituo kimoja — skhWalletAdjust (legacy 1:1 geti likiwa off; server+ledger ikiwa on)
        await window.skhWalletAdjust(buyerDocRef, -price, { type: 'purchase', ledgerKey: 'splink_buy_' + linkDocId, note: 'Ununuzi wa mkataba wa SokoPay kutoka wallet' });

        // B. Sasisha mkataba kwenye sokopay_links uwe 'held' (Escrow Active)
        await skh.updateDoc(linkDocRef, {
            status: "held",
            buyerId: skh.currentUser.uid,
            buyerName: skh.currentUser.displayName || "Mwanachama",
            paidAt: new Date().toISOString(),
            paymentType: "Wallet Payout"
        });

        // C. Sajili muamala kwenye orders collection kwa mnyororo mkuu wa kufuatilia (Tracking)
        await skh.addDoc(skh.collection(skh.db, "orders"), {
            buyerId: skh.currentUser.uid,
            buyerName: skh.currentUser.displayName || "Mwanachama",
            sellerId: skh.currentOpenProduct.userId,
            sellerName: skh.currentOpenProduct.ownerName,
            itemId: linkDocId,
            itemTitle: skh.currentOpenProduct.title,
            amount: price,
            status: "held", // Pesa ipo locked salama
            paymentRef: skh.currentOpenProduct.code,
            paymentType: "Wallet Payout",
            date: new Date().toISOString(),
            ...(typeof window.skhAssistMeta === 'function' ? window.skhAssistMeta() : {})
        });

        // D. Mtumie muuzaji/mtoa huduma taarifa (Notification) kwamba mkataba umefungwa na pesa ipo salama
        await skh.addDoc(skh.collection(skh.db, "notifications"), {
            userId: skh.currentOpenProduct.userId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.escrowFunded',
                params: { title: String(skh.currentOpenProduct.title || ''), amount: price.toLocaleString() },
            title: " SokoPay: Malipo ya Escrow Yamefungwa!",
            body: `Mteja ameshalipia mkataba wa "${skh.currentOpenProduct.title}" (TSh ${price.toLocaleString()}) kwa kutumia Wallet. Pesa ipo locked kwenye Escrow ya SokoPay, unaweza kuanza kazi/kusafirisha sasa.`,
            createdAt: new Date().toISOString(),
            read: false
        });

        alert(` USALAMA IMETIMIA!\n\nTSh ${price.toLocaleString()} imekatwa kwenye Wallet yako na kufungwa salama kwenye Escrow ya SokoPay.\n\nMuuzaji ameshapewa taarifa kuanza kutoa huduma au kusafirisha mzigo.`);
        
        // Weka upya muonekano
        document.getElementById('spCodeInputPay').value = '';
        document.getElementById('spItemPreview').style.display = 'none';
        if (btnProceedPaySp) btnProceedPaySp.style.display = 'none';
        document.getElementById('btnVerifySp').style.display = 'block';

        window.toggleSokoPayTab('track');
        window.syncSokoPayRealtimeData(); // Refreshes balances and charts live

    } catch (err) {
        alert(" Imeshindwa kukamilisha malipo ya wallet: " + err.message);
    } finally {
        if (btnProceed) {
            btnProceed.innerHTML = originalText;
            btnProceed.disabled = false;
        }
    }
};

window.trackSokoPayTransaction = async function() {
    const code = document.getElementById('spCodeInputTrack').value.trim().toUpperCase();
    const resultBox = document.getElementById('spTrackResult');
    const actionsArea = document.getElementById('spTrackActions');
    
    if (!code || !resultBox) {
        alert(" ingiza msimbo wa mkataba!");
        return;
    }

    resultBox.innerHTML = '<p style="text-align:center; color:gray; font-size:13px; padding:10px;"> Inatafuta mkataba kwenye daftari la miamala...</p>';
    resultBox.style.display = 'block';
    if (actionsArea) actionsArea.style.display = 'none';

    try {
        // Tafuta mkataba kwenye sokopay_links
        const q = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("code", "==", code));
        const snap = await skh.getDocs(q);

        if (snap.empty) {
            resultBox.innerHTML = '<p style="text-align:center; color:#EF4444; font-size:13px; padding:10px; font-weight:bold;"> Msimbo huu haupatikani kwenye mfumo wetu!</p>';
            return;
        }

        const docId = snap.docs[0].id;
        const d = snap.docs[0].data();
        let statusText = '';
        let statusColor = 'orange';

        if (d.status === 'pending') {
            statusText = ' Kusubiri Malipo (Pending Payment)';
            statusColor = 'orange';
        } else if (d.status === 'held') {
            statusText = ' Ipo Kwenye Ulinzi (Held in Escrow)';
            statusColor = 'green';
            
            // Washa vitufe vya Action (Confirm / Dispute) ikiwa pesa ipo Escrow na mnunuzi ndiye anayeangalia
            if (actionsArea && skh.currentUser && skh.currentUser.uid === d.buyerId) {
                actionsArea.style.display = 'flex';
                
                // Unganisha kazi za vitufe hivyo na mifumo yao ya payout na dispute
                document.getElementById('btnSpConfirmReceived').onclick = function() {
                    window.confirmSokoPayLinkDirect(docId, d.userId, d.price, d.carrierShare);
                };
                document.getElementById('btnSpRaiseDispute').onclick = function() {
                    window.raiseSokoPayLinkDispute(docId);
                };
            }
        } else if (d.status === 'completed') {
            statusText = ' Imekamilika & Imetolewa (Released)';
            statusColor = '#00509d';
        } else if (d.status === 'disputed') {
            statusText = ' Mkataba una Mgogoro (Disputed)';
            statusColor = 'red';
        }

        resultBox.innerHTML = `
            <div style="background:white; border:1px solid #cbd5e1; padding:15px; border-radius:16px; font-size:12px; text-align:left;"> <b style="font-size:14px; display:block; color:var(--primary-dark); margin-bottom:8px;">Mkataba: ${d.title}</b> <span style="display:block; margin-bottom:4px;">Aina ya Mkataba: <b>${d.contractType.toUpperCase()}</b></span> <span style="display:block; margin-bottom:4px;">Kiasi cha Escrow: <b style="color:var(--terracotta);">TSh ${d.price.toLocaleString()}</b></span> <span style="display:block; margin-bottom:4px;">Hali ya Muamala: <b style="color:${statusColor};">${statusText}</b></span> <span style="display:block; margin-bottom:4px;">Mmiliki wa Mkataba: <b>${skh.skhEscape(d.ownerName)}</b></span>
                ${d.disputeReason ? `<p style="font-size:13px; background:#fff5f5; color:red; padding:8px; border-radius:8px; margin-top:10px; border:1px solid #fecaca;"><b>Sababu ya Mgogoro:</b> ${d.disputeReason}</p>` : ''}
            </div>`;

    } catch (err) {
        resultBox.innerHTML = `<p style="color:red; text-align:center; padding:10px;">Hitilafu ya mtandao: ${skh.skhEscape(err.message)}</p>`;
    }
};

window.togglePosDebtArea = function() {
    if (typeof window.togglePosPaymentDetails === 'function') {
        window.togglePosPaymentDetails();
    }
};

window.selectSellerType = function(type) {
    // 1. Funga modal ya aina ya muuzaji ya mwanzo
    const sellerTypeModal = document.getElementById('sellerTypeModal');
    if (sellerTypeModal) sellerTypeModal.style.display = 'none';

    // 2. Fungua modal kuu ya Onboarding Setup Wizard
    const shopSetupModal = document.getElementById('shopSetupModal');
    if (shopSetupModal) shopSetupModal.style.display = 'flex';

    // 3. Tafuta kadi inayohusika (Muda au Kudumu) na uipe alama ya kuchaguliwa
    const targetCard = type === 'temporary' 
        ? document.querySelector("#setupStep_1 .setup-option-card[onclick*='temporary']")
        : document.querySelector("#setupStep_1 .setup-option-card[onclick*='permanent']");

    if (targetCard) {
        window.selectOnboardingOption('storeType', type, targetCard);
    }
    
    // 4. Anza usanidi kuanzia hatua ya kwanza (Step 1)
    window.currentSetupStep = 1;
    document.querySelectorAll('.setup-wizard-step').forEach(step => step.style.display = 'none');
    
    const step1 = document.getElementById('setupStep_1');
    if (step1) step1.style.display = 'block';
    
    const indicator = document.getElementById('setupStepIndicator');
    if (indicator) indicator.innerText = "HATUA 1/5";
    
    const btnPrev = document.getElementById('btnPrevSetup');
    if (btnPrev) btnPrev.style.display = 'none';
};

window.searchProductForTransfer = async function() {
    const searchInp = document.getElementById('transferProductSearch');
    const resultsDiv = document.getElementById('transferSearchResults');
    if (!searchInp || !resultsDiv) return;

    const queryStr = searchInp.value.trim().toLowerCase();
    if (queryStr.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
    const q = skh.query(skh.collection(skh.db, "products"), skh.where("userId", "==", ownerUid));
    const snap = await skh.getDocs(q);

    let html = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.title.toLowerCase().includes(queryStr)) {
            html += `
                <div onclick="window.selectProductForTransfer('${docSnap.id}', '${d.title}', ${d.stock || 0})" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; background:white; font-size:12px;"> <b> ${d.title}</b> (Stock: ${d.stock || 0} Pcs)
                </div>`;
        }
    });

    resultsDiv.innerHTML = html || '<p style="padding:10px; font-size:13px; color:gray; text-align:center;">Haikupatikana...</p>';
};

window.selectProductForTransfer = function(id, name, stock) {
    document.getElementById('transferProductId').value = id;
    document.getElementById('transferProductName').innerText = name;
    document.getElementById('transferProductCurrentQty').innerText = stock + " Pcs";
    document.getElementById('selectedTransferProductBox').style.display = 'block';
    document.getElementById('transferSearchResults').innerHTML = '';
};

window.submitStockTransfer = async function() {
    const productId = document.getElementById('transferProductId').value;
    const source = document.getElementById('transferSourceBranch').value;
    const dest = document.getElementById('transferDestBranch').value;
    const qty = parseInt(document.getElementById('transferQty').value) || 0;

    if (!productId || qty <= 0) {
        alert(" chagua bidhaa na uandike idadi sahihi ya kuhamisha!");
        return;
    }

    const btn = document.getElementById('btnSubmitTransfer');
    btn.disabled = true;
    btn.innerHTML = " Inatengeneza Token...";

    try {
        const prodRef = skh.doc(skh.db, "products", productId);
        const prodSnap = await skh.getDoc(prodRef);
        if (!prodSnap.exists()) return;

        const currentStock = prodSnap.data().stock || 0;
        if (currentStock < qty) {
            alert(` Stock haitoshi Head Office! (Iliyopo: ${currentStock} Pcs, Unayotaka kuhamisha: ${qty} Pcs)`);
            btn.disabled = false;
            btn.innerHTML = " ANZA MHAMISHO (GENERATE TOKENS)";
            return;
        }

        // Punguza stock ya Tawi Kuu na kuweka kwenye hali ya 'Safarini' (In-Transit)
        await skh.updateDoc(prodRef, { stock: skh.increment(-qty) });

        // Zalisha Pickup Token (Level 1 PT) na Delivery Token (Level 4 DT) za siri.
        // [CUSTODY 2026-09] Tokeni SALAMA (crypto-random 8 hex), si 4-digit tena.
        const pickupToken = (skh.secureToken ? skh.secureToken('PT-') : ("PT-" + Math.random().toString(16).slice(2, 10).toUpperCase()));
        const deliveryToken = (skh.secureToken ? skh.secureToken('DT-') : ("DT-" + Math.random().toString(16).slice(2, 10).toUpperCase()));

        // Hifadhi muamala wa mhamisho katika 'stock_transfers'
        await skh.addDoc(skh.collection(skh.db, "stock_transfers"), {
            shopOwnerId: skh.currentUserData?.shopOwnerUid || skh.currentUser.uid,
            productId: productId,
            productName: prodSnap.data().title,
            sourceBranch: source,
            destBranch: dest,
            quantity: qty,
            status: "awaiting_pickup", // inasubiri kuchukuliwa na dereva
            pickupToken: pickupToken,   // Level 1 Token
            deliveryToken: deliveryToken, // Level 4 Token
            createdAt: new Date().toISOString()
        });

        // Rekodi log ya duka
        await window.addActivityLog("STOCK_TRANSFER_INITIATED", `Ameanzisha mhamisho wa bidhaa "${prodSnap.data().title}" (${qty} Pcs) kutoka ${source} kwenda ${dest}`);

        alert(` MHAMISHO UMEANZISHWA!\n\n• Pickup Token (Level 1 PT): ${pickupToken}\n• Delivery Token (Level 4 DT): ${deliveryToken}\n\nMpe dereva Pickup Token kuchukua mzigo Head Office, na mpe Meneja wa Tawi la pili Delivery Token kupokea mzigo.`);
        
        document.getElementById('stockTransferModal').style.display = 'none';
        window.loadAndRenderDashboard();

    } catch (e) {
        alert("Kosa kuanzisha mhamisho: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = " ANZA MHAMISHO (GENERATE TOKENS)";
    }
};

window.saveShopSettings = async function() {
    if(!skh.currentUser) return;

    const btn = document.getElementById('btnSaveShopSettings');
    btn.disabled = true;
    btn.innerHTML = " Inahifadhi sheria...";

    const settingsObj = {
        stockMode: document.getElementById('setStockMode').value,
        showSales: document.getElementById('setRepSales').checked,
        showProfit: document.getElementById('setRepProfit').checked,
        showLowStock: document.getElementById('setRepLowStock').checked,
        showDebts: document.getElementById('setRepDebts').checked,
        cashierCanViewProfit: document.getElementById('setCashierViewProfit').checked,
        cashierCanEditStock: document.getElementById('setCashierEditStock').checked
    };

    try {
        await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUser.uid), {
            shopSettings: settingsObj
        });
        
        // Update local memory ya user hapa hapa
        if (skh.currentUserData) skh.currentUserData.shopSettings = settingsObj;

        await window.addActivityLog("SETTINGS_UPDATED", "Amebadilisha sheria na usanidi wa duka");
        alert(" Sheria za duka na usanidi wote zimehifadhiwa kikamilifu!");
        window.switchDashTab('overview');
        window.loadAndRenderDashboard();
    } catch(e) {
        alert("Hitilafu: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = " HIFADHI USANIDI WA BIASHARA";
    }
};

window.switchPosActionType = function() {
    const action = document.getElementById('posActionType').value;
    const areas = {
        sale: 'posSaleArea',
        receive_payment: 'posReceivePaymentArea',
        return: 'posReturnArea',
        expense: 'posExpenseArea',
        supplier: 'posSupplierArea'
    };

    // Ficha na uonyeshe eneo husika
    Object.keys(areas).forEach(key => {
        const el = document.getElementById(areas[key]);
        if(el) el.style.display = (key === action || (key === 'sale' && action === 'debt')) ? 'block' : 'none';
    });

    // Swichi maalum ya Cash vs Debt — sasa inaendana na posPayType (njia ya malipo)
    const paySel = document.getElementById('posPayType');
    if (action === 'sale' && paySel) { paySel.value = 'Cash'; }
    else if (action === 'debt' && paySel) { paySel.value = 'Deni'; }
    if (typeof window.togglePosPaymentDetails === 'function') window.togglePosPaymentDetails();
};

let __posDebtorCache = {};

window.searchDebtorsLive = function() {
    const input = document.getElementById('posSearchDebtorInp');
    const results = document.getElementById('posDebtorSearchResults');
    if(!input || !results) return;

    const queryStr = input.value.trim().toLowerCase();
    if(queryStr.length < 1) { results.innerHTML = ''; results.style.display = 'none'; return; }

    const ownerUid = skh.currentUserData?.shopOwnerUid || (skh.currentUser ? skh.currentUser.uid : null);
    if(!ownerUid) return;

    __posDebtorCache = __posDebtorCache || {};

    const draw = (items) => {
        if (!items || items.length === 0) {
            results.innerHTML = '<p style="padding:10px; font-size:13px; color:gray;">Mteja hajapatikana...</p>';
            results.style.display = 'block';
            return;
        }
        let html = '';
        items.forEach(d => {
            const safeTitle = skh.skhEscape(d.title || 'Mteja');
            __posDebtorCache[d.id] = { id: d.id, title: d.title || 'Mteja', amount: Number(d.amount || 0) };
            html += `
                <div onclick="window.selectDebtorForPaymentById('${d.id}')" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; background:white;"> <b> ${safeTitle}</b> (Inayodaiwa: TSh ${Number(d.amount || 0).toLocaleString()})
                </div>`;
        });
        results.innerHTML = html;
        results.style.display = 'block';
    };

    skh.getDocs(skh.query(skh.collection(skh.db, "shop_ledger"), skh.where("shopOwnerId", "==", ownerUid), skh.where("type", "==", "debt"), skh.where("status", "==", "pending")))
        .then(snap => {
            const items = [];
            snap.forEach(docSnap => {
                const d = docSnap.data();
                if (d && (d.title || '').toLowerCase().includes(queryStr)) { d.id = docSnap.id; items.push(d); }
            });
            draw(items);
        })
        .catch(err => {
            results.innerHTML = '<p style="padding:10px; font-size:13px; color:#b91c1c; text-align:center;">Imeshindwa kutafuta madeni. Angalia muunganisho.</p>';
            results.style.display = 'block';
        });
};

window.selectDebtorForPaymentById = function(id) {
    const it = __posDebtorCache && __posDebtorCache[id];
    if (!it) return;
    window.selectDebtorForPayment(it.id, it.title, it.amount);
};

window.selectDebtorForPayment = function(id, name, amount) {
    document.getElementById('selectedDebtDocId').value = id;
    document.getElementById('selectedDebtorName').innerText = name;
    document.getElementById('selectedDebtorAmount').innerText = `TSh ${amount.toLocaleString()}`;
    document.getElementById('selectedDebtorBox').style.display = 'block';
    document.getElementById('posDebtorSearchResults').innerHTML = '';
};

window.submitCollectDebtPayment = async function() {
    const id = document.getElementById('selectedDebtDocId').value;
    const amount = parseFloat(document.getElementById('debtCollectAmount').value) || 0;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if(!id || amount <= 0) return alert(" chagua mteja na uweke kiasi sahihi cha malipo.");

    try {
        const debtRef = skh.doc(skh.db, "shop_ledger", id);
        const debtSnap = await skh.getDoc(debtRef);
        if(!debtSnap.exists()) return;

        const outstanding = parseFloat(debtSnap.data().amount);
        const remaining = outstanding - amount;

        if (remaining <= 0) {
            // Kama amelipa yote
            await skh.updateDoc(debtRef, { status: "completed", amount: 0 });
        } else {
            // Kama amelipa sehemu tu (Partial)
            await skh.updateDoc(debtRef, { amount: remaining });
        }

        // Rekodi kama Kipato live kwenye Ledger
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: "income_offline",
            title: `Kusanya Deni: ${debtSnap.data().title}`,
            amount: amount,
            profit: amount, // Kurejesha deni kunahesabiwa kama faida iliyoingia
            date: new Date().toISOString()
        });

        alert(` Malipo ya TSh ${amount.toLocaleString()} yamepokelewa! Salio jipya la deni ni TSh ${Math.max(0, remaining).toLocaleString()}`);
        document.getElementById('selectedDebtorBox').style.display = 'none';
        document.getElementById('posSearchDebtorInp').value = '';
        closeModals();
        loadAndRenderDashboard();
    } catch(e) { alert("Hitilafu: " + e.message); }
};

let __posReturnCache = {};

window.searchProductsForReturnLive = function() {
    const input = document.getElementById('posSearchReturnInp');
    const results = document.getElementById('posReturnSearchResults');
    if(!input || !results) return;

    const queryStr = input.value.trim().toLowerCase();
    if(queryStr.length < 1) { results.innerHTML = ''; results.style.display = 'none'; return; }

    const ownerUid = skh.currentUserData?.shopOwnerUid || (skh.currentUser ? skh.currentUser.uid : null);
    if(!ownerUid) return;

    __posReturnCache = __posReturnCache || {};
    let items = [];
    const seen = {};

    const collect = (list) => {
        (Array.isArray(list) ? list : []).forEach(d => {
            if (!d || !d.id || seen[d.id]) return;
            if (d.userId && d.userId !== ownerUid) return;
            if (d.collectionName && d.collectionName !== 'products') return;
            const pool = `${d.title||''} ${d.barcode||''} ${d.sku||''}`.toLowerCase();
            if (skhPosMatch(pool, queryStr)) { seen[d.id] = true; items.push(d); }
        });
    };

    // Cache ya ndani — inafanya kazi OFFLINE
    try { collect(skh.cachedItems || []); } catch(e) {}
    try { collect(JSON.parse(skh.localStorage.getItem('sokohai_pos_products_' + ownerUid) || '[]')); } catch(e) {}

    const draw = () => {
        if (items.length === 0) {
            results.innerHTML = '<p style="padding:10px; font-size:13px; color:gray;">Bidhaa haikupatikana...</p>';
            results.style.display = 'block';
            return;
        }
        let html = '';
        items.forEach(d => {
            const safeTitle = skh.skhEscape(d.title || 'Bidhaa');
            __posReturnCache[d.id] = { id: d.id, title: d.title || 'Bidhaa', price: Number(d.price || 0) };
            html += `
                <div onclick="window.selectProductForReturnById('${d.id}')" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; background:white;"> <b> ${safeTitle}</b> (Bei: TSh ${Number(d.price || 0).toLocaleString()})
                </div>`;
        });
        results.innerHTML = html;
        results.style.display = 'block';
    };

    draw();

    // Online: sasisha stock ya hivi karibuni
    if (navigator.onLine) {
        skh.getDocs(skh.query(skh.collection(skh.db, "products"), skh.where("userId", "==", ownerUid))).then(snap => {
            const cur = (document.getElementById('posSearchReturnInp') || {}).value;
            if (!cur || cur.trim().toLowerCase() !== queryStr) return;
            items = []; const seen2 = {};
            snap.forEach(docSnap => {
                const d = docSnap.data();
                if (d) { d.id = docSnap.id; const pool = `${d.title||''} ${d.barcode||''} ${d.sku||''}`.toLowerCase(); if (skhPosMatch(pool, queryStr)) { seen2[d.id] = true; items.push(d); } }
            });
            draw();
        }).catch(() => {});
    }
};

window.selectProductForReturnById = function(id) {
    const it = __posReturnCache && __posReturnCache[id];
    if (!it) return;
    window.selectProductForReturn(it.id, it.title, it.price);
};

window.selectProductForReturn = function(id, name, price) {
    document.getElementById('selectedReturnProductId').value = id;
    document.getElementById('selectedReturnProductName').innerText = name;
    document.getElementById('selectedReturnProductPrice').innerText = `TSh ${price.toLocaleString()}`;
    document.getElementById('selectedReturnProductBox').style.display = 'block';
    document.getElementById('posReturnSearchResults').innerHTML = '';
};

window.submitReturnSale = async function() {
    const id = document.getElementById('selectedReturnProductId').value;
    const qty = parseInt(document.getElementById('returnProductQty').value) || 0;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if(!id || qty <= 0) return alert(" Chagua bidhaa na uweke idadi iliyorudishwa.");

    try {
        const prodRef = skh.doc(skh.db, "products", id);
        const prodSnap = await skh.getDoc(prodRef);
        if(!prodSnap.exists()) return;

        const pData = prodSnap.data();
        const price = parseFloat(pData.price || 0);
        const buyPrice = parseFloat(pData.buyPrice || 0);
        const refundAmount = price * qty;
        const profitLoss = (price - buyPrice) * qty;

        // Auto restock bidhaa iliyorudishwa
        await skh.updateDoc(prodRef, { stock: skh.increment(qty) });

        // Rekodi kama hasara/payout kwenye ledger
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: "expense",
            title: `Returned: ${qty}x ${pData.title}`,
            amount: refundAmount,
            notes: `Kurejesha pesa kwa mteja kutokana na kurudisha mzigo. Hasara ya faida: TSh ${profitLoss.toLocaleString()}`,
            date: new Date().toISOString()
        });

        alert(` Mzigo wa "${pData.title}" umerudishwa stoo vizuri! TSh ${refundAmount.toLocaleString()} imerejeshwa kwa mteja.`);
        document.getElementById('selectedReturnProductBox').style.display = 'none';
        document.getElementById('posSearchReturnInp').value = '';
        closeModals();
        loadAndRenderDashboard();
    } catch(e) { alert("Hitilafu: " + e.message); }
};

window.submitSupplierPaymentOS = async function() {
    const name = document.getElementById('supplierNameOS').value.trim();
    const amount = parseFloat(document.getElementById('supplierAmountOS').value) || 0;
    const ownerUid = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;

    if(!name || amount <= 0) return alert(" Jaza jina la supplier na kiasi kilicholipwa.");

    try {
        await skh.addDoc(skh.collection(skh.db, "shop_ledger"), {
            shopOwnerId: ownerUid,
            type: "expense",
            title: `Malipo ya Supplier: ${name}`,
            amount: amount,
            notes: `Purchases/Shehena mpya kutoka kwa muuzaji wa jumla.`,
            date: new Date().toISOString()
        });

        alert(` Malipo ya TSh ${amount.toLocaleString()} kwa supplier "${name}" yamefanikiwa kurekodiwa!`);
        document.getElementById('supplierNameOS').value = '';
        document.getElementById('supplierAmountOS').value = '';
        closeModals();
        loadAndRenderDashboard();
    } catch(e) { alert("Kosa: " + e.message); }
};

/* ==== js/app/14-map-onboarding.js ==== */
import { skh } from './00-bootstrap.js';

window.handleSearch = function() {
    const input = document.getElementById('searchInput');
    if(!input) return;
    skh.searchQuery = input.value.trim().toLowerCase();
    
    clearTimeout(skh.searchTimeout);
    skh.searchTimeout = setTimeout(() => {
        skh.currentLimit = 20;
        skh.loadMainFeed(skh.currentFeedCollection);
    }, 600); 
};

window.saveRealUserPaymentInfo = skh.saveRealUserPaymentInfo;

window.enableEditPaymentInfo = function() {
        console.log("Unlocking payment fields for editing...");
        const pm = document.getElementById('userPaymentModal');
        if(!pm) return;

        // 1. Ruhusu vibox vyote viandike (Unlock inputs)
        const allInputs = pm.querySelectorAll('input, select');
        allInputs.forEach(inp => {
            inp.disabled = false;
            inp.style.opacity = '1';
        });

        // 2. Badilisha vitufe (Ficha Edit, Onyesha Save)
        const btnSave = document.getElementById('btnSavePaymentAccount');
        const btnEdit = document.getElementById('btnEditPaymentAccount');
        
        if(btnSave) { 
            btnSave.style.display = 'block'; 
            btnSave.style.background = '#00509d'; 
        }
        if(btnEdit) { 
            btnEdit.style.display = 'none'; 
        }
        
        alert("Sasa unaweza kubadili taarifa zako za malipo. Ukimaliza bofya 'HIFADHI'.");
    };

window.l = loadAndRenderDashboard;

window.triggerFomo = function() {
    const names = ["Juma", "Asha", "Said", "Haji", "Kelvin", "Fatma", "Neema", "Brayan"];
    const cities = ["Dar es Salaam", "Mwanza", "Arusha", "Mbeya", "Dodoma", "Zanzibar"];
    const actions = ["amenunua bidhaa", "ameweka oda", "ameagiza usafiri", "amepata fundi"];

    const name = names[Math.floor(Math.random() * names.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];

    const toast = document.getElementById('fomoToast');
    if(!toast) return;

    toast.innerHTML = ` <b>${name}</b> wa ${city} <br> ${action} hivi punde!`;
    toast.style.display = 'block';

    // Ficha baada ya sekunde 5
    setTimeout(() => {
        toast.style.display = 'none';
    }, 5000);
};

setInterval(() => {
    if(Math.random() > 0.6) window.triggerFomo();
}, 25000);

// [FIX 2026-09] Lebo ya kitufe cha kutuma bidhaa inabadilika kulingana na Visibility:
//   - offline_only → "HIFADHI KWENYE INVENTORY" (duka la ndani tu)
//   - hybrid / online_only → "CHAPISHA BIDHAA SOKONI" (soko la mtandaoni)
window.skhUpdateSellerSubmitLabel = function() {
    const vis = document.getElementById('prodVisibility');
    const btn = document.getElementById('btnSeller');
    if (!btn) return;
    const v = vis ? vis.value : 'hybrid';
    if (v === 'offline_only') {
        btn.innerHTML = ' HIFADHI KWENYE INVENTORY';
    } else {
        btn.innerHTML = ' CHAPISHA BIDHAA SOKONI';
    }
};

window.toggleProductFormFields = function() {
    const visibility = document.getElementById('prodVisibility').value;
    const onlineFields = document.getElementById('onlineSpecificFields');
    const descInput = document.getElementById('prodDesc');
    const imgInput = document.getElementById('prodImage');
    
    const onlineCatSec = document.getElementById('onlineCategorySection');
    const offlineCatSec = document.getElementById('offlineCategorySection');
    const prodCatSelect = document.getElementById('prodCategory');

    if (visibility === 'offline_only') {
        if(onlineFields) onlineFields.style.display = 'none';
        if(descInput) descInput.removeAttribute('required');
        if(imgInput) imgInput.removeAttribute('required');
        if(prodCatSelect) prodCatSelect.removeAttribute('required');
        
        if(onlineCatSec) onlineCatSec.style.display = 'none';
        if(offlineCatSec) offlineCatSec.style.display = 'block';
    } else {
        if(onlineFields) onlineFields.style.display = 'block';
        if(descInput) descInput.setAttribute('required', 'true');
        if(imgInput) imgInput.setAttribute('required', 'true');
        if(prodCatSelect) prodCatSelect.setAttribute('required', 'true');
        
        if(onlineCatSec) onlineCatSec.style.display = 'block';
        if(offlineCatSec) offlineCatSec.style.display = 'none';
    }

    window.skhUpdateSellerSubmitLabel();

    // [FIX 2026-09] Swichi za modes (mnada/bei kushuka/group buy) ziheshimiwe
    // kwenye chaguo la mode ya bidhaa (prodSaleMode).
    if (typeof window.skhApplyModeSwitches === 'function') window.skhApplyModeSwitches();
};

window.runSokoPayTimeLockChronJob = async function() {
    console.log(" SokoPay Time-Lock Chron Job: Checking for eligible auto-releases...");
    const nowMs = Date.now();
    const timeLimitMs = 24 * 60 * 60 * 1000; // Saa 24 za usalama katika milisekunde

    try {
        // A. KAGUA ODA ZA SOKO KUU (STATUS: SHIPPED)
        const qOrders = skh.query(skh.collection(skh.db, "orders"), skh.where("status", "==", "shipped"));
        const snapOrders = await skh.getDocs(qOrders);

        snapOrders.forEach(async (docSnap) => {
            const od = docSnap.data();
            const shippedTime = od.shippedAt ? new Date(od.shippedAt).getTime() : 0;
            
            // Ikiwa imepita saa 24 tangu msafirishaji aondoke na mzigo na hakuna mgogoro
            if (shippedTime > 0 && (nowMs - shippedTime) >= timeLimitMs) {
                console.log(` SokoPay Auto-Release (Orders): Processing auto-release for order "${skh.skhEscape(od.itemTitle)}"...`);
                
                const orderRef = docSnap.ref;
                const amount = parseFloat(od.amount || 0);
                const sellerId = od.sellerId;

                // 1. Sasisha hali ya oda kuwa imekamilika
                await skh.updateDoc(orderRef, {
                    status: "completed",
                    autoReleased: true,
                    autoReleasedAt: new Date().toISOString()
                });

                // 2. Piga hesabu ya malipo ya muuzaji
                // [ADMIN PAYMENTS SWITCH] Ada ya kamisheni imezimwa = FREE → kamisheni 0.
                const platformFee = skh.paymentGate('commission') ? (amount * 0.05) : 0; // 5% platform fee
                const sellerEarned = amount - platformFee;

                const sellerQ = skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", sellerId));
                const sellerSnap = await skh.getDocs(sellerQ);
                if (!sellerSnap.empty) {
                    const sellerDocId = sellerSnap.docs[0].id;
                    // [PHASE 5.2b] kituo kimoja — skhWalletAdjust (legacy 1:1 geti likiwa off; server+ledger ikiwa on)
                    await window.skhWalletAdjust(skh.doc(skh.db, "users", sellerDocId), sellerEarned, { type: 'escrow_release', ledgerKey: 'spauto_order_' + orderRef.id, note: 'SokoPay auto-release (saa 24) - oda' });

                    // Mtumie muuzaji taarifa ya utoaji wa fedha wa kiotomatiki
                    await skh.addDoc(skh.collection(skh.db, "notifications"), {
                        userId: sellerId,
                        title: " SokoPay: Auto-Release Imekamilika!",
                        body: `Mteja hajaanzisha mgogoro wowote ndani ya saa 24 tangu usafirishaji kuanza kwa mkataba wa "${skh.skhEscape(od.itemTitle)}". TSh ${sellerEarned.toLocaleString()} imesukumwa kwenye wallet yako automatically [1].`,
                        createdAt: new Date().toISOString(),
                        read: false,
                        type: 'wallet'
                    });
                }

                // 3. Rekodi platform commission
                await skh.addDoc(skh.collection(skh.db, "adminRevenue"), {
                    type: "sokopay_commission",
                    amount: platformFee,
                    contractCode: od.paymentRef || "AUTO_RELEASE",
                    date: new Date().toISOString()
                });
            }
        });

        // B. KAGUA MIKATABA YA NJE YA SOKOPAY (STATUS: HELD)
        const qLinks = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("status", "==", "held"));
        const snapLinks = await skh.getDocs(qLinks);

        snapLinks.forEach(async (docSnap) => {
            const ld = docSnap.data();
            const paidTime = ld.paidAt ? new Date(ld.paidAt).getTime() : 0;

            // Kwa mikataba ya direct, kama imepita saa 24 bila dispute, inakamilika kiotomatiki
            if (paidTime > 0 && (nowMs - paidTime) >= timeLimitMs) {
                console.log(` SokoPay Auto-Release (Links): Processing auto-release for direct contract "${ld.title}"...`);
                
                const linkRef = docSnap.ref;
                const amount = parseFloat(ld.price || 0);
                const sellerId = ld.userId;
                const carrierShare = parseFloat(ld.carrierShare || 0);

                // 1. Sasisha hali ya mkataba kuwa umekamilika
                await skh.updateDoc(linkRef, {
                    status: "completed",
                    autoReleased: true,
                    autoReleasedAt: new Date().toISOString()
                });

                // 2. Mlipe muuzaji sehemu yake (SokoPay Smart Split)
                // [ADMIN PAYMENTS SWITCH] Ada ya kamisheni imezimwa = FREE → kamisheni 0.
                const platformFee = skh.paymentGate('commission') ? (amount * 0.05) : 0;
                const sellerEarned = amount - (platformFee + carrierShare);

                const sellerQ = skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", sellerId));
                const sellerSnap = await skh.getDocs(sellerQ);
                if (!sellerSnap.empty) {
                    const sellerDocId = sellerSnap.docs[0].id;
                    // [PHASE 5.2b] kituo kimoja — skhWalletAdjust (legacy 1:1 geti likiwa off; server+ledger ikiwa on)
                    await window.skhWalletAdjust(skh.doc(skh.db, "users", sellerDocId), sellerEarned, { type: 'escrow_release', ledgerKey: 'spauto_link_' + linkRef.id, note: 'SokoPay auto-release (saa 24) - mkataba' });

                    await skh.addDoc(skh.collection(skh.db, "notifications"), {
                        userId: sellerId,
                        title: " SokoPay: Auto-Release ya Mkataba!",
                        body: `Mkataba wako wa SokoPay "${ld.title}" umekamilishwa kiotomatiki baada ya saa 24 [1]. Kiasi cha TSh ${sellerEarned.toLocaleString()} imewekwa kwenye wallet yako.`,
                        createdAt: new Date().toISOString(),
                        read: false,
                        type: 'wallet'
                    });
                }

                // 3. Rekodi platform commission
                await skh.addDoc(skh.collection(skh.db, "adminRevenue"), {
                    type: "sokopay_commission",
                    amount: platformFee,
                    contractCode: ld.code,
                    date: new Date().toISOString()
                });
            }
        });

    } catch (err) {
        console.error(" SokoPay Chron Job Error:", err);
    }
};

// [LIVE-FIX 2026-09] Cron ya auto-release sasa inaendeshwa na Cloud Function
// 'sokopayAutoRelease' (server-side). Browser inaendesha njia ya legacy TU
// kama CRON_VIA_SERVER == false (fallback) — ili isiwe mzigo kwa watumiaji wote.
setInterval(() => {
    if (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.CRON_VIA_SERVER) return;
    window.runSokoPayTimeLockChronJob();
}, 300000);

window.openLogisticsTokenModal = function() {
    closeModals();
    document.getElementById('logisticsTokenModal').style.display = 'flex';
    toggleLogisticsTokenTab('verify');
};

window.toggleLogisticsTokenTab = function(tab) {
    const verifyArea = document.getElementById('tokenVerifyArea');
    const heldArea = document.getElementById('tokenHeldArea');
    const tabVerify = document.getElementById('tabVerifyToken');
    const tabHeld = document.getElementById('tabHeldCargo');

    if (tab === 'verify') {
        if (verifyArea) verifyArea.style.display = 'block';
        if (heldArea) heldArea.style.display = 'none';
        if (tabVerify) { tabVerify.style.background = 'var(--primary-blue)'; tabVerify.style.color = 'white'; }
        if (tabHeld) { tabHeld.style.background = '#f1f5f9'; tabHeld.style.color = '#475569'; }
        
        document.getElementById('logisticsTokenInput').value = '';
        document.getElementById('logisticsTokenResult').style.display = 'none';
        document.getElementById('btnVerifyLogisticsToken').style.display = 'block';
        document.getElementById('btnReleaseCargoToken').style.display = 'none';
        sessionStorage.removeItem('active_verified_ride_id');
    } else {
        if (verifyArea) verifyArea.style.display = 'none';
        if (heldArea) heldArea.style.display = 'block';
        if (tabVerify) { tabVerify.style.background = '#f1f5f9'; tabVerify.style.color = '#475569'; }
        if (tabHeld) { tabHeld.style.background = 'var(--primary-blue)'; tabHeld.style.color = 'white'; }
        
        loadHeldCargoList();
    }
};

window.verifyLogisticsToken = async function() {
    const token = document.getElementById('logisticsTokenInput').value.trim().toUpperCase();
    if (!token) return alert(" Tafadhali andika msimbo wa token kuhakiki!");

    const resultBox = document.getElementById('logisticsTokenResult');
    const btnVerify = document.getElementById('btnVerifyLogisticsToken');
    const btnRelease = document.getElementById('btnReleaseCargoToken');

    resultBox.style.display = 'none';
    btnVerify.innerHTML = " Inasoma token...";
    btnVerify.disabled = true;

    try {
        // 1. Kagua kwanza kama ni Token ya Mhamisho wa Tawi (Multi-Branch Transfer - Pickup Token)
        let qBranch = skh.query(skh.collection(skh.db, "stock_transfers"), skh.where("pickupToken", "==", token), skh.where("status", "==", "awaiting_pickup"));
        let snapBranch = await skh.getDocs(qBranch);

        if (!snapBranch.empty) {
            const transDoc = snapBranch.docs[0];
            const td = transDoc.data();
            
            sessionStorage.setItem('active_verified_ride_id', transDoc.id);
            sessionStorage.setItem('active_verified_token_type', 'branch_pickup');

            resultBox.innerHTML = `
                <div style="font-size:13px; color:#1e293b; line-height:1.5; text-align:left;">
                    <b style="color:var(--green); display:block; margin-bottom:10px; font-size:14px; text-transform:uppercase;"> Uhakiki wa Tawi Umefanikiwa!</b>
                    <b style="display:block; font-size:15px; margin-bottom:5px;"> Mhamisho: Head Office ➔ ${td.destBranch}</b>
                    <span>Bidhaa: <b>${td.productName}</b></span><br>
                    <span>Idadi: <b>${td.quantity} Pcs</b></span>
                </div>
            `;
            resultBox.style.display = 'block';
            btnVerify.style.display = 'none';
            btnRelease.style.display = 'block';
            return;
        }

        // 2. Kagua kama ni Delivery Token ya tawi la pili (Level 4 DT ya matawi)
        let qBranchDelivery = skh.query(skh.collection(skh.db, "stock_transfers"), skh.where("deliveryToken", "==", token), skh.where("status", "==", "in_transit"));
        let snapBranchDelivery = await skh.getDocs(qBranchDelivery);

        if (!snapBranchDelivery.empty) {
            const transDoc = snapBranchDelivery.docs[0];
            const td = transDoc.data();
            
            sessionStorage.setItem('active_verified_ride_id', transDoc.id);
            sessionStorage.setItem('active_verified_token_type', 'branch_delivery');

            resultBox.innerHTML = `
                <div style="font-size:13px; color:#1e293b; line-height:1.5; text-align:left;">
                    <b style="color:var(--green); display:block; margin-bottom:10px; font-size:14px; text-transform:uppercase;"> Uhakiki wa Delivery Umefanikiwa!</b>
                    <b style="display:block; font-size:15px; margin-bottom:5px;"> Mapokezi: Kupokea katika ${td.destBranch}</b>
                    <span>Bidhaa: <b>${td.productName}</b></span><br>
                    <span>Idadi ya kupokelewa: <b>${td.quantity} Pcs</b></span>
                </div>
            `;
            resultBox.style.display = 'block';
            btnVerify.style.display = 'none';
            btnRelease.style.display = 'block';
            return;
        }

        // 3. Ikiwa sio ya tawi, kagua kama ni ya wateja wa kikawaida (Pickup au Handover ya kawaida).
        // [CUSTODY 2026-09] Tunaangalia token yenyewe (sio status maalum) kisha
        // tunahakiki status/hatua CHINI, ili kusaidia mtiririko mpya wa pandembili:
        //   pickup → pickup_pending/seller_confirmed_handover; handover → awaiting_handover.
        let qNormal = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("pickupToken", "==", token), skh.limit(1));
        let snapNormal = await skh.getDocs(qNormal);
        let tokenType = "pickup";

        if (snapNormal.empty) {
            qNormal = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("handoverToken", "==", token), skh.limit(1));
            snapNormal = await skh.getDocs(qNormal);
            tokenType = "handover";
        }

        if (!snapNormal.empty) {
            const _rd = snapNormal.docs[0].data();
            const _okStage = tokenType === 'handover'
                ? (_rd.status === 'awaiting_handover')
                : (_rd.status === 'pickup_pending' || _rd.status === 'seller_confirmed_handover' || _rd.status === 'awaiting_pickup');
            if (!_okStage) {
                alert(" Token hii si sahihi kwa hatua ya sasa ya safari, au mzigo tayari umeshatoka stoo!");
                btnVerify.innerHTML = " HAKIKI SASA";
                btnVerify.disabled = false;
                return;
            }
            const rd = snapNormal.docs[0].data();
            sessionStorage.setItem('active_verified_ride_id', snapNormal.docs[0].id);
            sessionStorage.setItem('active_verified_token_type', tokenType);

            resultBox.innerHTML = `
                <div style="font-size:13px; color:#1e293b; line-height:1.5; text-align:left;">
                    <b style="color:var(--green); display:block; margin-bottom:10px; font-size:14px; text-transform:uppercase;"> Uhakiki wa Mzigo Umefanikiwa!</b>
                    <b> Mzigo: ${rd.cargoName}</b><br>
                    <span>Kutoka: ${rd.fromLocation} ➡ Kwenda: ${rd.toLocation}</span>
                </div>
            `;
            resultBox.style.display = 'block';
            btnVerify.style.display = 'none';
            btnRelease.style.display = 'block';
        } else {
            alert(" Token hii si sahihi au mzigo tayari umeshatoka stoo!");
        }

    } catch (e) {
        alert("Kosa la uhakiki: " + e.message);
    } finally {
        btnVerify.innerHTML = " HAKIKI SASA";
        btnVerify.disabled = false;
    }
};

window.setupDriverRealtimeQuery = function() {
    const activeContainer = document.getElementById('driverActiveJobsArea');
    const availableContainer = document.getElementById('driverAvailableJobsArea');
    const activeCountEl = document.getElementById('activeJobsCount');
    const availableCountEl = document.getElementById('availableJobsCount');

    if (!activeContainer || !availableContainer) return;

    const driverVehicleType = skh.currentUserData?.vehicleType || "Bodaboda";
    const driverServices = skh.currentUserData?.supportedServices || ["Passenger", "Parcel", "Cargo"];

    const qRides = skh.query(skh.collection(skh.db, "ride_requests"), skh.orderBy("createdAt", "desc"), skh.limit(40));

    if (window.driverRealtimeUnsubscribe) window.driverRealtimeUnsubscribe();

    window.driverRealtimeUnsubscribe = skh.onSnapshot(qRides, (snapshot) => {
        let activeJobsHtml = '';
        let availableJobsHtml = '';
        let activeCount = 0;
        let availableCount = 0;

        snapshot.forEach(docSnap => {
            const rd = docSnap.data();
            const rid = docSnap.id;

            // 1. Safari zangu active
            if (rd.driverId === skh.currentUser.uid && rd.status !== "completed" && rd.status !== "cancelled") {
                activeCount++;
                const cargoImg = rd.cargoImage || "https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff";
                const pToken = rd.pickupToken || "Bado";
                const cPhone = rd.customerPhone || "N/A";

                let tokenInstructions = '';
                if (rd.status === 'accepted' || rd.status === 'awaiting_pickup' || rd.status === 'pickup_pending' || rd.status === 'seller_confirmed_handover') {
                    tokenInstructions = `
                        <div style="background:#fffbeb; padding:12px; border-radius:10px; margin-top:10px; border:1.5px dashed #d97706; font-size:12px;">
                            <b style="color:#d97706; display:block; margin-bottom:4px;"> Token A (Pickup Token): ${pToken}</b>
                            Mwonyeshe Seller Token hii ya <b>${pToken}</b>. Seller ataingiza namba hii kwenye duka lake (Jopo la <b>Mizigo & Dispatch</b>) kuthibitisha makabidhiano [1].
                            ${rd.status === 'seller_confirmed_handover'
                                ? `<div style="margin-top:8px;"><button onclick="window.skhCustodyDriverPickupQuick('${rid}')" style="width:100%; padding:10px; background:var(--primary-blue); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;"> THIBITISHA UPOKEAJI (PICKED UP)</button></div>`
                                : ''}
                        </div>`;
                } else if (rd.status === 'picked_up') {
                    tokenInstructions = `
                        <div style="background:#f0fdf4; padding:12px; border-radius:10px; margin-top:10px; border:1.5px dashed var(--green); font-size:12px;">
                            <b style="color:var(--green); display:block; margin-bottom:4px;"> Mzigo uko chini ya ulinzi wako (Picked Up)</b>
                            Ukiwa tayari kuondoka, bonyeza "ANZA SAFARI".
                            <div style="margin-top:8px;"><button onclick="window.skhCustodyDriverStartQuick('${rid}')" style="width:100%; padding:10px; background:var(--green); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;"> ANZA SAFARI</button></div>
                        </div>`;
                } else if (rd.status === 'in_transit') {
                    tokenInstructions = `
                        <div style="background:#f0fdf4; padding:12px; border-radius:10px; margin-top:10px; border:1.5px dashed var(--green); font-size:12px;">
                            <b style="color:var(--green); display:block; margin-bottom:4px;"> Token C (Delivery Code/PIN):</b>
                            Mzigo upo njiani! Omba **PIN ya siri (Token C - DL)** kutoka kwa mteja anayepokea na uiingize hapa chini kukamilisha:
                            <div style="display:flex; gap:8px; margin-top:8px;">
                                <input type="text" id="deliveryTokenInp_${rid}" placeholder="Mfano: DL-XXXXXXXX" style="flex:1; padding:8px; border-radius:6px; border:1px solid #cbd5e1; text-transform:uppercase; font-weight:bold; text-align:center;">
                                <button onclick="window.verifyHandoverToken('${rid}', 'delivery')" style="padding:8px 15px; background:var(--green); color:white; border:none; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">THIBITISHA ➔</button>
                            </div>
                        </div>`;
                }

                activeJobsHtml += `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:15px; border-left:6px solid var(--primary-blue); text-align:left; margin-bottom:10px; width:100%;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-size:10px; background:#e0f2fe; color:#03509d; padding:2px 8px; border-radius:10px; font-weight:bold; text-transform:uppercase;">${rd.status.toUpperCase()}</span>
                            <small style="color:gray;">${rd.createdAt ? new Date(rd.createdAt).toLocaleDateString() : 'N/A'}</small>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <img src="${cargoImg}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid #eee;">
                            <div>
                                <b style="font-size:13px; color:#0f172a; display:block;">${rd.cargoName}</b>
                                <small style="color:gray;">Mteja: ${skh.skhEscape(rd.customerName)} | Simu: ${cPhone}</small>
                            </div>
                        </div>
                        <div style="background:white; padding:8px; border-radius:8px; margin-top:8px; font-size:12px; border:1px solid #eee;">
                             Kutoka: <b>${rd.fromLocation}</b> ➔ Kwenda: <b>${rd.toLocation}</b>
                        </div>
                        ${tokenInstructions}
                        <button onclick="window.triggerVehicleBreakdown('${rid}', '${rd.cargoName.replace(/'/g, "\\'")}')" style="width:100%; padding:10px; background:#fee2e2; color:#ef4444; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px; margin-top:10px;"> CHOMBO KIMEHARIBIKA (BREAKDOWN)</button>
                    </div>`;
            }

            // 2. Kazi mpya sokoni
            if (rd.status === "searching" && rd.vehicleType === driverVehicleType) {
                const isServiceSupported = driverServices.includes(rd.reqCategory);
                if (isServiceSupported) {
                    availableCount++;
                    const cargoImg = rd.cargoImage || "https://ui-avatars.com/api/?name=Usafiri&background=cccccc&color=fff";
                    availableJobsHtml += `
                        <div style="background:white; border:1px solid #cbd5e1; border-radius:14px; padding:15px; border-left:6px solid var(--gold); text-align:left; margin-bottom:10px; width:100%;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-size:10px; background:#fffbeb; color:#d97706; padding:2px 8px; border-radius:10px; font-weight:bold; text-transform:uppercase;">MPYA</span>
                                <small style="color:gray;">Kategoria: ${rd.reqCategory}</small>
                            </div>
                            <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px;">
                                <img src="${cargoImg}" style="width:45px; height:45px; border-radius:8px; object-fit:cover; border:1px solid #eee;">
                                <div>
                                    <b style="font-size:14px; color:var(--primary-dark);">${rd.cargoName}</b>
                                    <small style="display:block; color:gray;">Mteja: ${skh.skhEscape(rd.customerName || 'Mteja')}</small>
                                </div>
                            </div>
                            <div style="background:#f8fafc; padding:10px; border-radius:8px; font-size:12px; margin-bottom:12px;">
                                 Kutoka: <b>${rd.fromLocation}</b> ➔ Kwenda: <b>${rd.toLocation}</b>
                            </div>
                            <button onclick="window.acceptTransportMission('${rid}')" style="width:100%; padding:12px; background:var(--green); color:white; border:none; border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer;">KUBALI KAZI HII ➔</button>
                        </div>`;
                }
            }
        });

        if (activeCountEl) activeCountEl.innerText = activeCount;
        if (availableCountEl) availableCountEl.innerText = availableCount;

        activeContainer.innerHTML = activeJobsHtml || `
            <div style="background:#f8fafc; border:1.5px dashed #cbd5e1; padding:25px; border-radius:18px; text-align:center; width:100%;">
                <div style="font-size:36px; margin-bottom:5px;"></div>
                <b style="color:gray; font-size:12px;">Huna safari inayofanya kazi hivi sasa.</b>
            </div>`;

        availableContainer.innerHTML = availableJobsHtml || `
            <div style="background:#f8fafc; border:1.5px dashed #cbd5e1; padding:25px; border-radius:18px; text-align:center; width:100%;">
                <div style="font-size:36px; margin-bottom:5px;"></div>
                <b style="color:gray; font-size:12px;">Hakuna kazi mpya zinazofaa gari lako kwa sasa.</b>
            </div>`;
    });
};

window.releaseCargoWithToken = async function() {
    const rideId = sessionStorage.getItem('active_verified_ride_id');
    const tokenType = sessionStorage.getItem('active_verified_token_type');
    if(!rideId) return;

    const btnRelease = document.getElementById('btnReleaseCargoToken');
    btnRelease.innerHTML = " Inasave...";
    btnRelease.disabled = true;

    try {
        if (tokenType === 'branch_pickup') {
            // Badili mhamisho kuwa 'in_transit'
            const transRef = skh.doc(skh.db, "stock_transfers", rideId);
            await skh.updateDoc(transRef, { 
                status: "in_transit",
                pickupToken: "USED"
            });
            alert(" mzigo umeruhusiwa kutoka Head Office! Sasa upo safarini kuelekea tawi la pili.");
        } 
        else if (tokenType === 'branch_delivery') {
            // Badili mhamisho kuwa 'completed'
            const transRef = skh.doc(skh.db, "stock_transfers", rideId);
            const transSnap = await skh.getDoc(transRef);
            if (transSnap.exists()) {
                const td = transSnap.data();
                
                // UKWELI WA DATA: Ongeza stock live kwenye bidhaa ya tawi la pili
                const prodRef = skh.doc(skh.db, "products", td.productId);
                await skh.updateDoc(prodRef, { stock: skh.increment(td.quantity) });

                await skh.updateDoc(transRef, { 
                    status: "completed",
                    deliveryToken: "USED",
                    completedAt: new Date().toISOString()
                });

                await window.addActivityLog("STOCK_TRANSFER_COMPLETED", `Mhamisho umekamilika! Bidhaa ya "${td.productName}" (${td.quantity} Pcs) imepokelewa katika tawi la pili.`);
                alert(` MZIGO UMEPOKELEWA TAWINI SALAMA!\n\nStock ya tawi la pili imeongezeka automatically kwa Pcs ${td.quantity}!`);
            }
        } 
        else {
            // Mzigo wa mteja wa kawaida — mtiririko wa Chain of Custody.
            // [CUSTODY 2026-09] Hakuna tena token ya "TT-XXXX" ya kubahatisha.
            // Uthibitisho unafanywa kwenye moduli ya custody (server-authoritative).
            const token = document.getElementById('logisticsTokenInput') ? document.getElementById('logisticsTokenInput').value.trim().toUpperCase() : '';
            const rideRef = skh.doc(skh.db, "ride_requests", rideId);
            if (tokenType === 'handover') {
                // Dereva B anathibitisha upokeaji wa handover (pandembili).
                if (typeof window.skhCustodyConfirmIntermediatePickup === 'function') {
                    const res = await window.skhCustodyConfirmIntermediatePickup(rideId, token, 'good');
                    if (!res.ok) {
                        alert(res.error === 'bad_token'
                            ? " Token ya handover si sahihi!"
                            : (res.error === 'wrong_transporter' ? " Safari hii haijakabidhiwa kwako!" : " Handover haijakamilika: " + res.error));
                        return;
                    }
                } else {
                    await skh.updateDoc(rideRef, {
                        status: "in_transit",
                        driverId: skh.currentUser.uid,
                        driverName: skh.currentUser.displayName || "Dereva",
                        handoverToken: "USED"
                    });
                }
                alert(" Makabidhiano yamehakikiwa! Custody sasa iko kwako.");
            } else {
                // Pickup ya kawaida: dereva anathibitisha upokeaji (pande la pili)
                // baada ya muuzaji kuthibitisha makabidhiano → PICKED_UP.
                if (typeof window.skhCustodyConfirmTransporterPickup === 'function') {
                    const res = await window.skhCustodyConfirmTransporterPickup(rideId, token, 'good');
                    if (!res.ok) {
                        const msgs = {
                            bad_token: " Token si sahihi! Mwombe muuzaji akupe Token A (PK) sahihi.",
                            await_seller: " Subiri muuzaji athibitishe makabidhiano wa mzigo kwanza (uthibitisho wa pandembili).",
                            wrong_transporter: " Safari hii haijakabidhiwa kwako.",
                            token_used: " Token tayari imetumika.",
                            expired: " Token imeisha muda wake."
                        };
                        alert(msgs[res.error] || (" Uthibitisho umeshindwa: " + res.error));
                        return;
                    }
                    // Sasa status ni PICKED_UP; dereva anaanza safari kwa hiari yake.
                    alert(" Mzigo sasa uko chini ya ulinzi wako (Picked Up). Bonyeza \"Anza Safari\" ukiwa tayari.");
                } else {
                    await skh.updateDoc(rideRef, {
                        status: "in_transit",
                        pickupToken: "USED"
                    });
                    alert(" Mzigo umeruhusiwa!");
                }
            }
        }

        closeModals();
        window.loadAndRenderDashboard();
    } catch(e) {
        alert("Hitilafu: " + e.message);
    } finally {
        btnRelease.innerHTML = " THIBITISHA KUTOA / KUKABIDHI MZIGO";
        btnRelease.disabled = false;
    }
};

window.filterHeldCargo = function(filterType, btnElement) {
    const modal = document.getElementById('tokenHeldArea');
    if (modal) {
        modal.querySelectorAll('.time-tab').forEach(b => b.classList.remove('active'));
    }
    if (btnElement) btnElement.classList.add('active');

    window.currentHeldCargoFilter = filterType;
    window.loadHeldCargoList();
};

window.loadHeldCargoList = async function() {
    const list = document.getElementById('heldCargoList');
    if(!list) return;

    list.innerHTML = '<p style="text-align:center; color:gray; font-size:11px; padding:15px;"> Inapakia mizigo...</p>';

    try {
        const q = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("driverId", "==", skh.currentUser.uid));
        const snap = await skh.getDocs(q);

        if (snap.empty) {
            list.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:11px; padding:20px;">Huna mizigo iliyosajiliwa kwenye hadhi hii.</p>';
            return;
        }

        let html = '';
        let count = 0;

        snap.forEach(docSnap => {
            const rd = docSnap.data();
            const status = rd.status;
            
            let belongsToTab = false;
            if (window.currentHeldCargoFilter === 'transit' && (status === 'in_transit' || status === 'awaiting_handover' || status === 'arrived_destination')) {
                belongsToTab = true;
            } else if (window.currentHeldCargoFilter === 'pending' && (status === 'awaiting_pickup' || status === 'searching' || status === 'pending_acceptance')) {
                belongsToTab = true;
            } else if (window.currentHeldCargoFilter === 'completed' && status === 'completed') {
                belongsToTab = true;
            }

            if (belongsToTab) {
                count++;
                const cargoImgUrl = rd.cargoImage || "https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff";
                const badgeColor = status === 'completed' ? 'green' : (status === 'in_transit' ? 'orange' : 'gray');
                
                html += `
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:12px; border-radius:16px; margin-bottom:10px; font-size:12px; text-align:left;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-size:10px; background:${badgeColor}; color:white; padding:2px 6px; border-radius:6px; font-weight:bold;">${status.toUpperCase()}</span>
                            <small style="color:gray;">${new Date(rd.createdAt).toLocaleDateString()}</small>
                        </div>
                        
                        <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                            <img src="${cargoImgUrl}" style="width:45px; height:45px; border-radius:8px; object-fit:cover; border:1px solid #eee;">
                            <div style="flex:1; min-width:0;">
                                <b style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--primary-dark);">${rd.cargoName}</b>
                                <small style="color:gray; font-size:10px; display:block;">Mteja: ${skh.skhEscape(rd.customerName)} (Simu: ${rd.customerPhone})</small>
                            </div>
                        </div>

                        <div style="background:white; padding:6px; border-radius:8px; border:1px solid #e2e8f0; font-size:11px;">
                            <span> Njia: ${rd.fromLocation} ➡ ${rd.toLocation}</span>
                            ${rd.transitToken && status === 'in_transit' ? `<span style="display:block; color:orange; font-weight:bold; margin-top:4px;"> Transit Token: ${rd.transitToken}</span>` : ''}
                        </div>

                        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                            <button onclick="window.shareMyLocation('${docSnap.id}')" style="flex:1; min-width:120px; padding:9px; background:#2563eb; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">&#128205; SHIRIKISHA LOCATION LIVE</button>
                            <button onclick="window.stopSharingMyLocation()" style="flex:1; min-width:120px; padding:9px; background:#e2e8f0; color:#334155; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">ACHA KUSHIRIKISHA</button>
                            <button onclick="window.openChatWithUser('${skh.skhJsEsc(rd.customerId || '')}', '${skh.skhJsEsc(rd.customerName || 'Mteja')}')" style="flex:1; min-width:120px; padding:9px; background:#25D366; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">&#128172; CHAT NA MTEJA</button>
                        </div>
                    </div>`;
            }
        });

        list.innerHTML = count === 0 ? `<p style="text-align:center; color:gray; font-size:11px; padding:20px;">Hakuna mizigo kwenye kikundi hiki.</p>` : html;

    } catch (e) {
        list.innerHTML = `<p style="color:red; text-align:center;">Hitilafu: ${skh.skhEscape(e.message)}</p>`;
    }
};

window.openMyDeliveries = async function() {
    if(!skh.requireAuth()) return;
    closeModals();
    document.getElementById('deliveriesModal').style.display = 'flex';
    const list = document.getElementById('deliveriesModalList');
    list.innerHTML = '<p style="text-align:center; color:gray;"> Inapakia mizigo...</p>';

    try {
        const q = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", skh.currentUser.uid));
        const snap = await skh.getDocs(q);
        
        if(snap.empty) {
            list.innerHTML = '<p style="text-align:center; color:gray; padding:20px;">Huna mizigo inayokubiri kusafirishwa kwako kwa sasa.</p>';
            return;
        }

        let html = '';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            html += `
                <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:14px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <b> ${skh.skhEscape(d.itemTitle)}</b>
                        <span style="font-size:10px; font-weight:bold; background:#e0f2fe; color:#03509d; padding:2px 8px; border-radius:10px;">${d.status.toUpperCase()}</span>
                    </div>
                    <small style="display:block; color:#64748b;">Mteja: ${skh.skhEscape(d.buyerName || 'Mteja')}</small>
                    <small style="display:block; color:#64748b;">Malipo: TSh ${d.amount.toLocaleString()}</small>
                </div>
            `;
        });
        list.innerHTML = html;
    } catch(e) {
        list.innerHTML = `<p style="color:red; text-align:center;">Hitilafu: ${skh.skhEscape(e.message)}</p>`;
    }
};

window.openMyTrips = async function() {
    if(!skh.requireAuth()) return;
    closeModals();
    document.getElementById('tripsModal').style.display = 'flex';
    const list = document.getElementById('tripsModalList');
    list.innerHTML = '<p style="text-align:center; color:gray;"> Inapakia safari...</p>';

    try {
        const q = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("driverId", "==", skh.currentUser.uid));
        const snap = await skh.getDocs(q);
        
        if(snap.empty) {
            list.innerHTML = '<p style="text-align:center; color:gray; padding:20px;">Huna ratiba za safari zilizosajiliwa kwako kwa sasa.</p>';
            return;
        }

        let html = '';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            html += `
                <div style="background:#fffbeb; border:1px solid var(--gold); padding:15px; border-radius:14px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <b> Mzigo: ${d.cargoName}</b>
                        <span style="font-size:10px; font-weight:bold; background:orange; color:white; padding:2px 8px; border-radius:10px;">${d.status.toUpperCase()}</span>
                    </div>
                    <p style="font-size:12px; color:#475569; margin:4px 0;"> ${d.fromLocation} ➡ ${d.toLocation}</p>
                    <small style="display:block; color:#64748b;">Mteja: ${skh.skhEscape(d.customerName)}</small>
                </div>
            `;
        });
        list.innerHTML = html;
    } catch(e) {
        list.innerHTML = `<p style="color:red; text-align:center;">Hitilafu: ${skh.skhEscape(e.message)}</p>`;
    }
};

window.openSavedItems = async function() {
    if(!skh.requireAuth()) return;
    // [BUYER ENGAGEMENT] Fungua "My SokoHai" (tab ya Saved) — mfumo mpya
    if (typeof window.skhOpenMySokoHai === 'function') { window.skhOpenMySokoHai('saved'); return; }
    closeModals();
    document.getElementById('savedItemsModal').style.display = 'flex';
    const list = document.getElementById('savedItemsModalList');
    list.innerHTML = '<p style="text-align:center; color:gray;"> Inapakia vitu ulivyolike...</p>';

    try {
        const q = skh.query(skh.collection(skh.db, "products"), skh.where("likes", "array-contains", skh.currentUser.uid));
        const snap = await skh.getDocs(q);
        
        if(snap.empty) {
            list.innerHTML = '<p style="text-align:center; color:gray; padding:20px;">Hujachagua au kulike bidhaa yoyote kwa sasa. </p>';
            return;
        }

        let html = '';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            html += `
                <div class="list-item" style="cursor:pointer;" onclick="openProduct('${docSnap.id}', 'products')">
                    <img src="${skh.skhEscape(d.image)}" style="width:50px; height:50px; border-radius:10px; object-fit:cover;">
                    <div class="list-info">
                        <b>${skh.skhEscape(d.title)}</b>
                        <span>TSh ${(d.price || 0).toLocaleString()}</span>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
    } catch(e) {
        list.innerHTML = `<p style="color:red; text-align:center;">Hitilafu: ${skh.skhEscape(e.message)}</p>`;
    }
};

window.currentSetupStep = 1;

window.onboardingData = {
    storeType: 'temporary',    // temporary au permanent
    businessMode: 'online_only', // online_only, offline_only, au hybrid
    setupMode: 'auto'           // auto (Easy Mode) au custom (Boss Control)
};

window.selectOnboardingOption = function(key, value, element) {
    window.onboardingData[key] = value;
    
    // Ondoa alama ya 'selected' kwenye kadi zote za kundi hilo
    const parent = element.parentNode;
    parent.querySelectorAll('.setup-option-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Weka alama kwenye kadi iliyobonyezwa
    element.classList.add('selected');

    // Badiliko Maalum kulingana na uchaguzi
    if (key === 'storeType') {
        const tempFields = document.getElementById('temporaryOnlyFields');
        const permFields = document.getElementById('permanentOnlyIdentityFields');
        
        if (value === 'temporary') {
            if(tempFields) tempFields.style.display = 'block';
            if(permFields) permFields.style.display = 'none';
            // Temporary wengi default ni Online Only
            window.selectOnboardingOption('businessMode', 'online_only', document.getElementById('modeCard_online'));
        } else {
            if(tempFields) tempFields.style.display = 'none';
            if(permFields) permFields.style.display = 'block';
            // Permanent default ni Hybrid
            window.selectOnboardingOption('businessMode', 'hybrid', document.getElementById('modeCard_hybrid'));
        }
    }
    
    // Toa suggestions dynamically
    window.suggestOnboardingStructure();
};

window.suggestOnboardingStructure = function() {
    const profile = document.getElementById('regPrimaryProfile').value;
    const size = document.getElementById('regWorkforceSize').value;
    const textEl = document.getElementById('onboardingSuggestionText');
    if (!textEl) return;

    if (!profile) {
        textEl.innerText = "Tafadhali chagua wasifu wa duka katika hatua iliyopita ili kuona mapendekezo.";
        return;
    }

    let suggestText = `Wasifu wa: <b>${profile}</b> | Wafanyakazi: <b>${size}</b><br><br>`;
    
    if (profile === 'Pharmacy') {
        suggestText += ` <b>Marekebisho ya Kiotomatiki:</b><br>
        • Wafanyakazi: Tutapendekeza nafasi ya Pharmacist, Cashier na Storekeeper.<br>
        • Sheria za Stoo: Expiry tracking na Batch tracking zitawashwa.<br>
        • POS: Mfumo wa usajili wa maelezo ya madawa utaandaliwa.`;
    } else if (profile === 'Hardware Store') {
        suggestText += ` <b>Marekebisho ya Kiotomatiki:</b><br>
        • Wafanyakazi: Tutapendekeza nafasi ya Manager, Storekeeper, na Delivery Agent.<br>
        • Vipimo: Mifumo ya Mita, Tani, na Mifuko ya Cement itasakinishwa automatically.`;
    } else if (profile === 'Supermarket') {
        suggestText += ` <b>Marekebisho ya Kiotomatiki:</b><br>
        • Wafanyakazi: Wafanyakazi wa Cashier, Storekeeper na Floor Managers wataandaliwa.<br>
        • Sheria: Barcode scanner ya POS, Loyalty points na Multi-pricing zitawashwa kiofisi.`;
    } else {
        suggestText += ` <b>Marekebisho ya Kiotomatiki:</b><br>
        • Vipimo: Piece (pcs), Kilogram (kg), na Packet zitawashwa kwa ajili ya ${profile}.`;
    }

    textEl.innerHTML = suggestText;
};

window.nextSetupStep = function() {
    const totalSteps = window.onboardingData.storeType === 'temporary' ? 3 : 8;
    
    // Kabla ya kuvuka hatua ya 3, hakikisha duka lina Jina
    if (window.currentSetupStep === 3) {
        const name = document.getElementById('regShopName').value.trim();
        if (!name) {
            alert(" Tafadhali jaza Jina la Duka kwanza!");
            return;
        }
    }

    // Kama ni Temporary Store na umefika hatua ya 3, huna haja ya hatua za kudumu
    if (window.onboardingData.storeType === 'temporary' && window.currentSetupStep === 3) {
        window.saveShopSetup();
        return;
    }

    // Ficha hatua ya sasa
    document.getElementById(`setupStep_${window.currentSetupStep}`).style.display = 'none';
    window.currentSetupStep++;
    // Onyesha hatua inayofuata
    document.getElementById(`setupStep_${window.currentSetupStep}`).style.display = 'block';

    // Sasisha kifungo cha mwisho pindi ukifika mwisho
    const btnNext = document.getElementById('btnNextSetup');
    if (window.currentSetupStep === totalSteps) {
        btnNext.innerText = "KAMILISHA USAJILI ";
        btnNext.onclick = function() { window.saveShopSetup(); };
    } else {
        btnNext.innerText = "Endelea ❯";
        btnNext.onclick = function() { window.nextSetupStep(); };
    }

    document.getElementById('btnPrevSetup').style.display = 'block';
    document.getElementById('setupStepIndicator').innerText = `HATUA ${window.currentSetupStep}/${totalSteps}`;
};

window.prevSetupStep = function() {
    if (window.currentSetupStep <= 1) return;

    const totalSteps = window.onboardingData.storeType === 'temporary' ? 3 : 5;

    document.getElementById(`setupStep_${window.currentSetupStep}`).style.display = 'none';
    window.currentSetupStep--;
    document.getElementById(`setupStep_${window.currentSetupStep}`).style.display = 'block';

    const btnNext = document.getElementById('btnNextSetup');
    btnNext.innerText = "Endelea ❯";
    btnNext.onclick = function() { window.nextSetupStep(); };

    if (window.currentSetupStep === 1) {
        document.getElementById('btnPrevSetup').style.display = 'none';
    }
    document.getElementById('setupStepIndicator').innerText = `HATUA ${window.currentSetupStep}/${totalSteps}`;
};

window.saveShopSetup = async function() {
    if(!skh.currentUser) return;
    
    const name = document.getElementById('regShopName').value.trim();
    if (!name) {
        alert(" Tafadhali jaza Jina la Duka lako.");
        return;
    }

    const btnNext = document.getElementById('btnNextSetup');
    btnNext.disabled = true;
    btnNext.innerText = " INASAJILI... ";

    const businessId = "SKH-" + Math.floor(1000 + Math.random() * 9000);
    const storeType = window.onboardingData.storeType;

    let payload = {
        shopName: name,
        isTemporaryStore: storeType === 'temporary',
        sellMode: window.onboardingData.businessMode,
        shopRole: 'owner',
        shopOwnerUid: skh.currentUser.uid,
        myShopCode: businessId,
        businessSetupComplete: true,
        
        //  MPYA: capturing branches, approval-flow and analytics targets
        branchMode: window.onboardingData.branchMode || 'single',
        approvalFlow: window.onboardingData.approvalFlow || 'basic',
        salesTarget: parseFloat(document.getElementById('regSalesTarget').value) || 5000000,
        profitTarget: parseFloat(document.getElementById('regProfitTarget').value) || 1000000,
        
        createdAt: new Date().toISOString()
    };

    if (storeType === 'temporary') {
        const duration = parseInt(document.getElementById('regStoreDuration').value) || 30;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + duration);

        payload.storeDurationDays = duration;
        payload.storeVisibility = document.getElementById('regStoreVisibility').value;
        payload.storeExpiryDate = expiryDate.toISOString();
        payload.sellerType = 'temporary';
        payload.productLimit = 9; // Ukomo rahisi wa Temporary
    } else {
        // Permanent Store
        const secProfiles = Array.from(document.querySelectorAll('.reg-sec-profile:checked')).map(cb => cb.value);
        
        payload.primaryProfile = document.getElementById('regPrimaryProfile').value || "General Store";
        payload.secondaryProfiles = secProfiles;
        payload.workforceSize = document.getElementById('regWorkforceSize').value;
        payload.setupMode = window.onboardingData.setupMode;
        payload.sellerType = 'permanent';
        payload.productLimit = 9999; // Unlimited kwa permanent
        
        // Auto-Generate staff structure if "auto" was selected
        if (window.onboardingData.setupMode === 'auto') {
            payload.autoStructureGenerated = true;
        }
    }

    try {
        // Hifadhi kwenye profile ya User Firebase
        await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUser.uid), payload);
        
        // Pia kumuandalia database ya duka (Kama anatumia Auto smart setup)
        if (storeType === 'permanent' && window.onboardingData.setupMode === 'auto') {
            await window.autoGenerateStaffAndRules(payload.primaryProfile, payload.workforceSize);
        }
alert(` HONGERA!\nDuka la "${name}" limesajiliwa kwa ufanisi.\n\nBusiness Code yako ni: ${businessId}`);
        window.closeModals();
        window.switchMode('seller'); // Mtume moja kwa moja kwenye duka badala ya kurefresh
    } catch(e) {
        alert("Kosa: " + e.message);
        btnNext.disabled = false;
        btnNext.innerText = "KAMILISHA USAJILI ";
    }
};

window.autoGenerateStaffAndRules = async function(profile, size) {
    const ownerUid = skh.currentUser.uid;
    let suggestedStaff = [];

    if (profile === 'Pharmacy') {
        suggestedStaff = [
            { name: "Pharmacist Aliyependekezwa", role: "Pharmacist", salary: 350000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Kagua dawa zinazoisha muda", "Thibitisha maelekezo ya daktari"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() },
            { name: "Mshika Fedha Aliyependekezwa", role: "Cashier", salary: 200000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Mauzo ya POS", "Kutoa Risti"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() }
        ];
    } else if (profile === 'Hardware Store') {
        suggestedStaff = [
            { name: "Msimamizi wa Stoo Aliyependekezwa", role: "Storekeeper", salary: 250000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Kupokea Shehena ya Sementi", "Zana za Ujenzi Audit"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() },
            { name: "Cashier Aliyependekezwa", role: "Cashier", salary: 200000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Mauzo ya POS", "Kusanya miamala ya benki"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() }
        ];
    } else if (profile.includes("Grocery") || profile.includes("Supermarket")) {
        suggestedStaff = [
            { name: "Meneja wa Duka", role: "Manager", salary: 400000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Kagua ripoti za faida", "Thibitisha mabadiliko ya bei"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() },
            { name: "Muuza Duka (POS)", role: "Cashier", salary: 180000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Uza kwa wateja wa haraka", "Kutoa Risti"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() },
            { name: "Mshika Stoo", role: "Storekeeper", salary: 200000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Kagua bidhaa zinazoisha", "Panga rafu za mbele"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() }
        ];
    } else if (profile.includes("Agrovet") || profile.includes("Kilimo")) {
        suggestedStaff = [
            { name: "Mshauri wa Kilimo (Agronomist)", role: "Manager", salary: 450000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Toa ushauri wa mbegu/mbolea", "Kagua ubora wa sumu za wadudu"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() },
            { name: "Muuza Duka", role: "Cashier", salary: 180000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Uza mbolea na mbegu POS", "Sajili pointi za wakulima"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() }
        ];
    } else {
        suggestedStaff = [
            { name: "Muuza Duka (POS)", role: "Cashier", salary: 180000, performanceScore: 100, performanceLevel: "Bronze", tasks: ["Mauzo ya kila siku"], status: "active", shopOwnerId: ownerUid, createdAt: new Date().toISOString() }
        ];
    }

    for (let staff of suggestedStaff) {
        await skh.addDoc(skh.collection(skh.db, "shop_staff"), staff);
    }
    console.log("Wafanyakazi wa mapendekezo wameandaliwa kiotomatiki kulingana na profile.");
};

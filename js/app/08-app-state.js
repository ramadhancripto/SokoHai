/* ==== js/app/08-app-state.js ==== */
import { skh } from './00-bootstrap.js';

// Onyesha / ficha kitufe cha "+" (UZA) kwenye bottom nav.
// Nav tabs hubaki — ni kitufe cha "+" tu kinachobadilika.
window.setSellFab = function(show) {
    const wrap = document.querySelector('.bottom-area-wrapper');
    if (!wrap) return;
    if (show) wrap.classList.remove('fab-hidden');
    else wrap.classList.add('fab-hidden');
};

window.updateApp = function(mode, el = null) {
    window.resetAppState(); // Safisha kila kitu kwanza kabisa!
    // [FIX 2026-09] Kila tab ianze na "Zote/Huduma Zote" — sehemu za zamani
    // (physical/online... au Passenger/Cargo...) zisiendelee kuchuja tab nyingine.
    skh.activeServiceSection = 'all';
    skh.activeDeliverySection = 'all';
    // 1. Hakikisha tupo kwenye Buyer View (Ukurasa mkuu)
    skh.currentMode = 'buyer'; 
    skh.localStorage.setItem('sokohai_mode', 'buyer'); 
    
    // Onyesha buyerView na ficha dashboard
    document.getElementById('buyerView').style.display = 'block';
    document.getElementById('dashboardViews').style.display = 'none';

    // [FIX: top nav kupotea] Ukirudi kutoka Usimamizi/dashboard, rudisha
    // upau wa juu (top nav), upau wa chini na upau wa eneo — applyModeUI
    // ulikuwa unazificha (display:none) na updateApp hakuzirudisha.
    const _hdr = document.querySelector('.sticky-top-section');
    const _ftr = document.querySelector('.bottom-area-wrapper');
    const _loc = document.getElementById('locationFilterBar');
    if (_hdr) _hdr.style.display = 'flex';
    if (_ftr) _ftr.style.display = 'flex';
    if (_loc) _loc.style.display = 'flex';

    // Kitufe cha "+" kinaonekana kwenye kurasa za mbele (Home/Bidhaa/Huduma/Usafirishaji)
    window.setSellFab(true);

    // 2. Weka Rangi ya Active kwenye Tab ya chini
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active')); 
    if(el) {
        el.classList.add('active'); 
    } else {
        const tabIdMap = { 'home': 'navTabHome', 'bidhaa': 'navTabBidhaa', 'services': 'navTabHuduma', 'delivery': 'navTabDelivery' };
        const tabEl = tabIdMap[mode] ? document.getElementById(tabIdMap[mode]) : null;
        if (tabEl) tabEl.classList.add('active');
    }
    
    // 3. Badili aina ya vitu vinavyoonekana (Collection)
    const mappedData = skh.navMap[mode];
    skh.currentFeedCollection = mappedData ? mappedData.dbCollection : 'products';
    
    // 4. Washa/Zima Menu za juu (Sub-navs)
    document.getElementById('marketModesNav').style.display = (mode === 'bidhaa') ? 'flex' : 'none';
    document.getElementById('serviceModesNav').style.display = (mode === 'services') ? 'flex' : 'none';
    document.getElementById('deliveryModesNav').style.display = (mode === 'delivery') ? 'flex' : 'none';

    // [FIX 2026-09] Kila unapoingia tab, angaza kitufe cha "Zote" (cha kwanza)
    // cha sub-nav inayoonekana — liwiane na hali safi ya `resetAppState`.
    const activeNavId = (mode === 'bidhaa') ? 'marketModesNav' : (mode === 'services') ? 'serviceModesNav' : (mode === 'delivery') ? 'deliveryModesNav' : null;
    if (activeNavId) {
        const navEl = document.getElementById(activeNavId);
        if (navEl) {
            const btns = navEl.querySelectorAll('.mode-tab-btn');
            btns.forEach(b => b.classList.remove('active'));
            if (btns[0]) btns[0].classList.add('active');
        }
    }
    
    // 5. Pakia data mpya
    skh.currentLimit = 20;
    skh.loadMainFeed(skh.currentFeedCollection);
    
    // Funga fomu yoyote au modal iliyokuwa wazi
    closeModals();
    window.scrollTo({top: 0, behavior: 'smooth'});
};

window.setServiceSection = function(section, btnElement) {
    // [FIX 2026-09] Sehemu mpya = kategoria/subcategory/vichujio vya zamani havifai tena.
    window.resetAppState();
    skh.activeServiceSection = section;
    
    // Badili Rangi ya Button
    const buttons = document.getElementById('serviceModesNav').querySelectorAll('.mode-tab-btn');
    buttons.forEach(b => b.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');

    // Vuta matangazo mapya
    skh.currentLimit = 20;
    skh.loadMainFeed('services');
};

window.setDeliverySection = function(section, btnElement) {
    // [FIX 2026-09] Sehemu mpya = kategoria/subcategory/vichujio vya zamani havifai tena.
    window.resetAppState();

    // 1. Badili rangi ya button iliyobonyezwa ili ionekane imechaguliwa
    const nav = document.getElementById('deliveryModesNav');
    if(nav) {
        const buttons = nav.querySelectorAll('.mode-tab-btn');
        buttons.forEach(b => b.classList.remove('active'));
    }
    if(btnElement) btnElement.classList.add('active');

    // 2. Weka kigezo cha kuchuja (section itakuwa: 'Passenger', 'Product', 'Cargo', au 'Emergency').
    //    [FIX] Zamani iliweka `activeSubCategory = section` na renderFeedUI ilichuja
    // `data.subCategory` — sehemu ambayo madereva HAWANA — hivyo orodha ilifutwa kabisa.
    //    Sasa tunatumia kigezo chake maalum: `activeDeliverySection`.
    skh.activeDeliverySection = section;

    // 3. Vuta upya madereva/vyombo kulingana na kigezo ulichochagua
    skh.currentLimit = 20;
    skh.loadMainFeed('drivers'); // Hapa tunaita function inayopakia feed ya usafiri
    
    // Peleka screen juu kabisa baada ya kubonyeza
    window.scrollTo({top: 0, behavior: 'smooth'});
};

window.openAuthModal = function() { 
        closeModals(); 
        const am = document.getElementById('authModal');
        if(am) am.style.display = 'flex'; 
        // [OFFLINE 2026-09] Mtu aliyejisajili awali asilazimishwe kuandika email
        // tena — jaza ile ya mwisho aliyotumia (ikiwa sanduku liko wazi).
        try {
            const lastEmail = skh.localStorage.getItem('sokohai_last_email');
            const emailInp = document.getElementById('loginEmail');
            if (lastEmail && emailInp && !emailInp.value.trim()) emailInp.value = lastEmail;
        } catch (e) { /* ignore */ }
        toggleAuth('login'); 
    };

window.toggleAuth = function(mode) { 
        const lf = document.getElementById('loginForm');
        const sf = document.getElementById('signupForm');
        if(lf) lf.style.display = mode === 'login' ? 'block' : 'none'; 
        if(sf) sf.style.display = mode === 'signup' ? 'block' : 'none'; 
    };

window.doLogin = async function(event) { 
        if(event) event.preventDefault(); // Inazuia ukurasa kurefresh
        const e = document.getElementById('loginEmail')?.value.trim();
    
        const p = document.getElementById('loginPass')?.value; 
        if(!e || !p) { alert(" Jaza email na password yako."); return; } 
        try { 
            await skh.signInWithEmailAndPassword(skh.auth, e, p); 
            // [OFFLINE 2026-09] Kumbuka email — akipoteza session, isimwombe tena.
            try { skh.localStorage.setItem('sokohai_last_email', e); } catch (e2) {}
            closeModals(); 
        } catch(err) { 
            alert(" Kosa: " + err.message); 
        } 
    };

window.doSignup = async function(event) { 
    if(event) event.preventDefault();
    const n = document.getElementById('signupName')?.value.trim();
    const e = document.getElementById('signupEmail')?.value.trim(); 
    const ph = document.getElementById('signupPhone')?.value.trim(); 
    const p = document.getElementById('signupPass')?.value; 
    const agentCode = document.getElementById('signupAgentCode')?.value.trim() || ""; 
    
    if(!n || !e || !ph || !p) { alert(" Jaza sehemu zote."); return; } 
    
    try { 
        const cred = await skh.createUserWithEmailAndPassword(skh.auth, e, p); 
        await skh.sendEmailVerification(cred.user);
        await skh.updateProfile(cred.user, { displayName: n }); 
        
        await skh.setDoc(skh.doc(skh.db, "users", cred.user.uid), { 
            uid: cred.user.uid, 
            fullName: n, 
            phone: ph, 
            email: e, 
            agentCode: agentCode,
            createdAt: new Date().toISOString(), 
            walletBalance: 0,
            followers:[], 
            following:[] 
        }); 
        
        alert(" Akaunti imetengenezwa! Tumekutumia email ya uthibitisho.");
        // [OFFLINE 2026-09] Kumbuka email ya usajili kwa kuingia baadaye.
        try { skh.localStorage.setItem('sokohai_last_email', e); } catch (e2) {}
        closeModals(); 
        // [ONBOARDING §11] Baada ya signup, mwalike mtumiaji kukamilisha wasifu
        // wake (DP = picha yake binafsi, Cover = picha ya biashara) — HIARI,
        // akipiga Funga ('X') au acha, hakikulazimishwi kamwe. Non-blocking:
        // hakuna redirect/hakuna modal zinazofunguka kiotomatiki; ni kirai-dokezo
        // tu linalofungua Profile (Edit) modal, ambayo tayari ina vitufe vya
        // kupandisha DP + Cover (64-my-profile.js — muundo unaoheshimiwa).
        setTimeout(function () {
            try {
                if (typeof window.openProfile === 'function') {
                    window.openProfile();
                    if (typeof window.skhToast === 'function') {
                        window.skhToast('Karibu ' + n + '! Unaweza kuweka DP na Cover yako hapa sasa hivi (hiari).', 'info', 5200);
                    }
                }
            } catch (e3) { /* onboarding haizuii signup successful */ }
        }, 700);
    } catch(err) { 
        alert(" Kosa: " + err.message); 
    } 
};

window.getOptimizedImageUrl = skh.getOptimizedImageUrl;

window.doGoogleLogin = async function() {
    const provider = new skh.GoogleAuthProvider();
    try {
        const result = await skh.signInWithPopup(skh.auth, provider);
        const user = result.user;
        
        // Kagua kama huyu ni user mpya, kama ndio msajili Firestore
        const userDoc = await skh.getDoc(skh.doc(skh.db, "users", user.uid));
        if (!userDoc.exists()) {
            await skh.setDoc(skh.doc(skh.db, "users", user.uid), {
                uid: user.uid,
                fullName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: new Date().toISOString(),
                walletBalance: 0
            });
        }
        closeModals();
        console.log("Karibu " + user.displayName);
    } catch (error) {
        alert("Kosa la Google Login: " + error.message);
    }
};

window.doResetPassword = async function() {
    const email = document.getElementById('loginEmail').value.trim();
    if(!email) {
        alert(" andika email yako kwanza kwenye kisanduku cha 'Barua Pepe' kisha ubofye tena hapa.");
        return;
    }
    
    const btn = document.getElementById('btnResetPass');
    const originalText = btn.innerHTML;
    btn.innerHTML = " Inatuma...";
    btn.disabled = true;
    
    try {
        await skh.sendPasswordResetEmail(skh.auth, email);
        alert(" Link ya kubadili nenosiri imetumwa kwenye email: " + email + "\n\nKagua Inbox au Spam folder.");
    } catch (error) {
        // Badilisha ujumbe wa Kiingereza kuwa Kiswahili kwa makosa yanayojulikana
        if (error.code === 'auth/user-not-found') {
            alert(" Akaunti yenye email hii haipo. jisajili.");
        } else {
            alert(" Kosa: " + error.message);
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.toggleBulkPackagingFields = function() {
    const hasBulk = document.getElementById('prodHasBulk').checked;
    const bulkFields = document.getElementById('bulkPackagingFields');
    const wholesalePriceDiv = document.getElementById('wholesalePriceFieldDiv');
    const wholesalePriceInput = document.getElementById('prodWholesalePrice');
    const stockLabel = document.getElementById('stockQuantityLabel');

    if (hasBulk) {
        if(bulkFields) bulkFields.style.display = 'block';
        if(wholesalePriceDiv) wholesalePriceDiv.style.display = 'block';
        if(wholesalePriceInput) wholesalePriceInput.setAttribute('required', 'true');
        if(stockLabel) stockLabel.innerHTML = "IDADI YA BULK UNIT (BOX/KATONI) *";
    } else {
        if(bulkFields) bulkFields.style.display = 'none';
        if(wholesalePriceDiv) wholesalePriceDiv.style.display = 'none';
        if(wholesalePriceInput) wholesalePriceInput.removeAttribute('required');
        if(stockLabel) stockLabel.innerHTML = "IDADI YA STOCK *";
    }
};

window.updateFormSubcats = function() {
    const catVal = document.getElementById('prodCategory').value;
    const subContainer = document.getElementById('subCategoryContainer');
    const subSelect = document.getElementById('prodSubCategory');
    
    // Vikundi vya Bot Intelligence Elements
    const smartBox = document.getElementById('smartCategoryFieldsBox');
    const expiryFields = document.getElementById('smartExpiryFields');
    const imeiFields = document.getElementById('smartImeiFields');
    
    const expInput = document.getElementById('prodExpiryDate');
    const batchInput = document.getElementById('prodBatchNumber');
    const imeiInput = document.getElementById('prodImeiNumbers');

    // Ficha dynamic fields zote kwanza
    if(smartBox) smartBox.style.display = 'none';
    if(expiryFields) expiryFields.style.display = 'none';
    if(imeiFields) imeiFields.style.display = 'none';
    
    if(expInput) expInput.removeAttribute('required');
    if(batchInput) batchInput.removeAttribute('required');
    if(imeiInput) imeiInput.removeAttribute('required');

    if(!catVal || !skh.advancedCategories[catVal]) {
        if(subContainer) subContainer.style.display = 'none';
        return;
    }

    // BOT INTEL 1: Afya / Pharmacy au Vyakula/Drinks (Expiry tracking required)
    if (catVal.includes("Afya") || catVal.includes("Vyakula")) {
        if(smartBox) smartBox.style.display = 'block';
        if(expiryFields) expiryFields.style.display = 'block';
        if(expInput) expInput.setAttribute('required', 'true');
        if(batchInput) batchInput.setAttribute('required', 'true');
        console.log(" BOT SUGGESTION: Expiry na Batch numbers zimewashwa kwa afya!");
    } 
    // BOT INTEL 2: Phones / Computers (IMEI / Serial tracking required)
    else if (catVal.includes("Simu") || catVal.includes("Kompyuta")) {
        if(smartBox) smartBox.style.display = 'block';
        if(imeiFields) imeiFields.style.display = 'block';
        if(imeiInput) imeiInput.setAttribute('required', 'true');
        console.log(" BOT SUGGESTION: IMEI / Serial numbers tracking imewashwa!");
    }

    const subcats = Object.keys(skh.advancedCategories[catVal].subcategories);
    subSelect.innerHTML = `<option value="">-- Chagua Aina ya Bidhaa --</option>` + 
                          subcats.map(s => `<option value="${s}">${s}</option>`).join('');
    
    if(subContainer) subContainer.style.display = 'block';
    document.getElementById('dynamicFiltersContainer').style.display = 'none';
};

window.submitSeller = async function(event) {
    if(event) event.preventDefault();
    if(!skh.requireAuth()) return;
    
    const btn = document.getElementById('btnSeller');
    const visibility = document.getElementById('prodVisibility').value;
    
    const title = document.getElementById('prodName').value.trim();
   
// Baini kategoria sahihi kulingana na offline au online
let category = "";
let subCategory = "";

if (visibility === 'offline_only') {
    const offlineInp = document.getElementById('prodOfflineCategory');
    category = (offlineInp && offlineInp.value.trim() !== '') ? offlineInp.value.trim() : "Mchanganyiko";
    subCategory = "N/A"; // Duka la ndani halihitaji sub-category ngumu
} else {
    category = document.getElementById('prodCategory').value;
    subCategory = document.getElementById('prodSubCategory') ? document.getElementById('prodSubCategory').value : "";
}
    const buyPrice = parseFloat(document.getElementById('prodBuyPrice').value) || 0;
    const price = parseFloat(document.getElementById('prodPrice').value) || 0;
    const barcode = document.getElementById('prodBarcode').value.trim();
    const loc = document.getElementById('prodLocation').value.trim();
if(!title || !price || !loc || !buyPrice || (visibility !== 'offline_only' && !category)) {
    alert(" jaza sehemu zote zenye alama ya nyota (*).");
    return;
}
    // --- QUANTITY & UNIT CONVERSION CALCULATION ---
    const baseUnit = document.getElementById('prodBaseUnit').value;
    const hasBulk = document.getElementById('prodHasBulk').checked;
    
    let rawQtyEntered = parseInt(document.getElementById('prodStock').value) || 1;
    let finalCalculatedStock = rawQtyEntered;
    let bulkUnit = "";
    let conversionRatio = 1;
    let wholesalePrice = 0;

    if (hasBulk) {
        bulkUnit = document.getElementById('prodBulkUnit').value;
        conversionRatio = parseInt(document.getElementById('prodConversionRatio').value) || 12;
        wholesalePrice = parseFloat(document.getElementById('prodWholesalePrice').value) || 0;
        
        // Piga Hesabu Kiotomatiki: Vipande vyote vya stoo kuu
        finalCalculatedStock = rawQtyEntered * conversionRatio;
    }

    // --- DYNAMIC INTEL FIELDS CAPTURING ---
    let expiryDate = document.getElementById('prodExpiryDate')?.value || "";
    let batchNumber = document.getElementById('prodBatchNumber')?.value.trim() || "";
    let imeiNumbers = document.getElementById('prodImeiNumbers')?.value.trim() || "";

    let saleMode = 'free_market';
    let itemFilters = {};
    let modeData = {};
    let imageUrls = [];

    if (visibility !== 'offline_only') {
        saleMode = document.getElementById('prodSaleMode').value;
        const desc = document.getElementById('prodDesc').value.trim();
        if(!desc) { alert("Weka maelezo ya kina (Description) kwa soko la mtandaoni!"); return; }

        document.querySelectorAll('.universal-filter-input').forEach(inp => {
            if(inp.value.trim() !== '') {
                itemFilters[inp.getAttribute('data-filter')] = inp.value.trim();
            }
        });

        const nowMs = Date.now();
        if (saleMode === 'auction') {
            const endStr = document.getElementById('aucEndTime').value;
            if(!endStr) { alert("Weka tarehe na muda wa mnada kuisha."); return; }
            modeData = { endTime: new Date(endStr).getTime(), currentBid: price, maxBidder: null, totalBids: 0 };
        } 
        else if (saleMode === 'price_drop') {
            const minPrice = parseFloat(document.getElementById('pdMinPrice').value);
            const intervalMs = parseInt(document.getElementById('pdIntervalType').value);
            const endStr = document.getElementById('pdEndTime').value;
            if(!minPrice || !endStr) { alert("Weka Bei ya Mwisho na Muda wa Deal kuisha."); return; }
            
            const endMs = new Date(endStr).getTime();
            const totalDurationMs = endMs - nowMs;
            const totalIntervals = Math.floor(totalDurationMs / intervalMs);
            const dropAmt = totalIntervals > 0 ? ((price - minPrice) / totalIntervals) : 0;

            modeData = { minPrice: minPrice, intervalMs: intervalMs, dropAmount: dropAmt, endTime: endMs, startTime: nowMs };
        } 
        else if (saleMode === 'wholesale') {
            const discVal = parseFloat(document.getElementById('wsDiscount').value);
            const discType = document.getElementById('wsDiscountType').value;
            if(!discVal) { alert("Weka kiasi cha punguzo kwa Wholesale."); return; }
            const minQtyEl = document.getElementById('wsMinQty');
            const minQty = minQtyEl ? (parseInt(minQtyEl.value) || 0) : 0;
            if(!minQty || minQty <= 0) { alert("Weka IDADI YA CHINI ya jumla (minQty) — mfano: 10."); return; }
            // [§19] Tiers text: "minQty:bei; minQty:bei" → modeData.tiers[].
            // Frontend isivunje: ukifanya uchakataji vibaya, tutaonyesha kwa
            // muuzaji (si kuandika mbaya backend).
            const tiersEl = document.getElementById('wsTiersText');
            let tiers = [];
            if (tiersEl && tiersEl.value.trim()) {
                try {
                    tiers = tiersEl.value.split(';').map(function (pair) {
                        var kv = pair.split(':');
                        return { minQty: parseInt(kv[0], 10), price: parseFloat(kv[1]) };
                    }).filter(function (t) {
                        return Number.isFinite(t.minQty) && t.minQty > 0 && Number.isFinite(t.price) && t.price > 0;
                    });
                    tiers.sort(function (a, b) { return a.minQty - b.minQty; });
                } catch (e) { tiers = []; }
            }
            modeData = { discountValue: discVal, discountType: discType, minQty: minQty, tiers: tiers }; 
        }
        else if (saleMode === 'group_buy') {
            const discVal = parseFloat(document.getElementById('gbDiscount').value);
            const discType = document.getElementById('gbDiscountType').value;
            const endStr = document.getElementById('gbEndTime').value;
            const maxPpl = parseInt(document.getElementById('gbMaxPeople').value) || 10;
            if(!discVal || !endStr) { alert("Weka punguzo na Muda wa Kundi kuisha."); return; }
            modeData = { discountValue: discVal, discountType: discType, joinedUsers: 1, targetPeople: maxPpl, endTime: new Date(endStr).getTime() };
        }

    }

    // [FIX 2026-09] PICHA: LAZIMA angalau 3 kwa kila bidhaa (zaidi ya zamani).
    skh.setLoading('btnSeller', true, ' INAPANDISHA PICHA...');
    try {
        imageUrls = await window.skhUploadPicked('prodImage', 6);
    } catch (e) {
        console.warn('[5.7] upload ya picha imeshindikana:', e && e.message);
        imageUrls = [];
    }

    if (!imageUrls || imageUrls.length < 3) {
        skh.setLoading('btnSeller', false, ' CHAPISHA BIDHAA SOKONI');
        window.skhUpdateSellerSubmitLabel();
        alert(" Weka angalau picha 3 za bidhaa.");
        return;
    }

    const mainImage = imageUrls[0];
    const isStoreOnly = (visibility === 'offline_only');
    if (btn) btn.innerHTML = isStoreOnly ? ' INAHIFADHI KATIKA INVENTORY...' : ' INACHAPISHA BIDHAA SOKONI...';

    //  Capture eneo la ghala/rafu ya bidhaa
    const whZone = document.getElementById('prodWarehouseZone') ? document.getElementById('prodWarehouseZone').value.trim() : "N/A";

    const docId = await skh.saveData('products', {
        title: title,
        price: price,
        buyPrice: buyPrice,
        category: category,
        subCategory: subCategory,
        filters: itemFilters,
        description: (visibility !== 'offline_only') ? document.getElementById('prodDesc').value : "In-store Product",
        location: loc,
        warehouseZone: whZone, // Hifadhi eneo la rafu ghala
        coords: (skh.userLat && skh.userLon) ? { lat: skh.userLat, lon: skh.userLon } : null,
        image: mainImage,
        imagesArray: imageUrls,
        saleMode: saleMode,
        modeData: modeData,
        stock: finalCalculatedStock, // Sasa inahifadhi jumla ya Vipande vidogo dynamically
        barcode: barcode,

        // Baini na hifadhi alama (flags) kwa usahihi kulingana na aina 3 za visibility
isOnline: (visibility === 'online_only' || visibility === 'hybrid'),
isOffline: (visibility === 'offline_only' || visibility === 'hybrid'),
        
        // Vipimo & Multi Pricing Engine Elements
        baseUnit: baseUnit,
        hasBulkPackaging: hasBulk,
        bulkUnit: bulkUnit,
        conversionRatio: conversionRatio,
        wholesalePrice: wholesalePrice,
        rawUnitsQtyEntered: rawQtyEntered,
        
        // Expiry, Batch, na Serial / IMEI Data ya kiakili
        expiryDate: expiryDate,
        batchNumber: batchNumber,
        imeiNumbers: imeiNumbers,
        
        createdAt: new Date().toISOString()
    });
        
    if(docId) {
        const doneMsg = isStoreOnly
            ? " Bidhaa imehifadhiwa kikamilifu kwenye Inventory ya duka!"
            : " Bidhaa imechapishwa kikamilifu kwenye Soko la Mtandaoni!";
        alert(doneMsg);
        try { if (window.skhClearPickedPhotos && window.skhClearPickedPhotos['prodImage']) window.skhClearPickedPhotos['prodImage'](); } catch (e) {}
        document.getElementById('sellerForm').reset();
        document.getElementById('onlineSpecificFields').style.display = 'none';
        document.getElementById('bulkPackagingFields').style.display = 'none';
        document.getElementById('wholesalePriceFieldDiv').style.display = 'none';
        if(document.getElementById('smartCategoryFieldsBox')) document.getElementById('smartCategoryFieldsBox').style.display = 'none';
        
        closeModals();
        loadAndRenderDashboard();
    }
    skh.setLoading('btnSeller', false, ' CHAPISHA BIDHAA SOKONI');
    window.skhUpdateSellerSubmitLabel();
};

window.submitRating = async function() {
    // 1. Chukua data kutoka kwenye vibox vya fomu
    const targetId = document.getElementById('ratingTargetId').value;
    const rating = document.querySelector('input[name="rate"]:checked')?.value;
    const comment = document.getElementById('ratingComment').value.trim();
    const photoFile = document.getElementById('ratingPhoto').files[0];

    if(!rating) { 
        alert(" chagua idadi ya nyota (stars) kwanza!"); 
        return; 
    }

    const btn = document.getElementById('btnSubmitRating');
    const originalText = btn.innerHTML;
    btn.innerHTML = " INATUMA...";
    btn.disabled = true;

    try {
        let uploadedPhotoUrl = "";
        // 2. Ikiwa mteja ameweka picha, ipandishe Cloudinary
        if(photoFile) {
            // [PHASE 4.2] Uploader mmoja wa pamoja
            uploadedPhotoUrl = await window.skhUploadFromFile(photoFile) || "";
        }
        const videoUrl = (document.getElementById('ratingVideoUrl') && document.getElementById('ratingVideoUrl').value || "").trim();
        const media = [];
        if (uploadedPhotoUrl) media.push(uploadedPhotoUrl);
        if (videoUrl && /^https:\/\/[^\s"'<>]+$/.test(videoUrl)) media.push(videoUrl);

        // 3. [REVIEWS 2026-09] verifiedPurchase ni SERVER-ONLY — tunatumia
        //    server callable `reviewsPublish` (ina-stamp badge kutoka oda halisi).
        let verified = null;
        try {
            const fn = (typeof skh.wrapCallable === "function" ? skh.wrapCallable("reviewsPublish") : skh.httpsCallable(skh.getFunctions(skh.fApp, "europe-west1"), "reviewsPublish"));
            const res = await fn({
                targetId: targetId,
                targetType: (document.getElementById('ratingTargetType') && document.getElementById('ratingTargetType').value) || "product",
                rating: parseInt(rating),
                text: comment,
                media: media
            });
            verified = res && res.data && res.data.verifiedPurchase;
        } catch(e) {
            // Fallback (callable haipo/deployed): njia ya zamani bila badge.
            const reviewObj = {
                authorId: skh.currentUser ? skh.currentUser.uid : "guest",
                authorName: skh.currentUser ? (skh.currentUser.displayName || "Mteja") : "Mteja",
                rating: parseInt(rating),
                text: comment,
                photo: uploadedPhotoUrl,
                media: media,
                timestamp: new Date().toISOString()
            };
            const productRef = skh.doc(skh.db, "products", targetId);
            await skh.updateDoc(productRef, { comments: skh.arrayUnion(reviewObj) });
        }

        // Activity ya Buyer hutumia event stream iliyopo; si notification mpya.
        try {
            if (skh.currentUser) await skh.setDoc(skh.doc(skh.db, 'recommendationEvents', skh.currentUser.uid + '__review__' + targetId), {
                userId: skh.currentUser.uid,
                type: 'REVIEW_SUBMITTED',
                entityId: targetId,
                title: (skh.currentOpenProduct && skh.currentOpenProduct.title) || 'Review',
                rating: parseInt(rating),
                at: new Date().toISOString()
            }, { merge: true });
        } catch (eActivity) {}
        alert(verified ? " Asante kwa tathmini yako! ( Umenunua — imethibitishwa)" : " Asante kwa tathmini yako! Picha yako itaonekana kwa wateja wengine.");
        document.getElementById('ratingModal').style.display = 'none';
        
    } catch(e) {
        alert(" Hitilafu: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.updateServiceCategories = function() {
    const section = document.getElementById('servSection').value;
    const catContainer = document.getElementById('servCategoryContainer');
    const catSelect = document.getElementById('servCategory');
    
    // Ficha za chini yake kwanza
    document.getElementById('servSubCategoryContainer').style.display = 'none';
    document.getElementById('servFiltersContainer').style.display = 'none';
    
    if(!section || !skh.serviceDataMap[section]) {
        catContainer.style.display = 'none';
        return;
    }
    
    const categories = Object.keys(skh.serviceDataMap[section]);
    catSelect.innerHTML = `<option value="">-- Chagua Kategoria --</option>` + 
                          categories.map(c => `<option value="${c}">${c}</option>`).join('');
    
    catContainer.style.display = 'block';
};

window.updateServiceSubcats = function() {
    const section = document.getElementById('servSection').value;
    const cat = document.getElementById('servCategory').value;
    const subContainer = document.getElementById('servSubCategoryContainer');
    const subSelect = document.getElementById('servSubCategory');
    
    document.getElementById('servFiltersContainer').style.display = 'none';
    
    if(!cat || !skh.serviceDataMap[section] || !skh.serviceDataMap[section][cat]) {
        subContainer.style.display = 'none';
        return;
    }
    
    const subcategories = Object.keys(skh.serviceDataMap[section][cat]);
    subSelect.innerHTML = `<option value="">-- Chagua Aina Ndogo --</option>` + 
                          subcategories.map(s => `<option value="${s}">${s}</option>`).join('');
    
    subContainer.style.display = 'block';
};

window.generateServiceFilters = function() {
    const section = document.getElementById('servSection').value;
    const cat = document.getElementById('servCategory').value;
    const sub = document.getElementById('servSubCategory').value;
    
    const filterContainer = document.getElementById('servFiltersContainer');
    const filtersArea = document.getElementById('servFiltersArea');

    if(!sub || !skh.serviceDataMap[section] || !skh.serviceDataMap[section][cat] || !skh.serviceDataMap[section][cat][sub]) {
        filterContainer.style.display = 'none';
        return;
    }

    const data = skh.serviceDataMap[section][cat][sub];

    // Jenga Filters (Maswali ya kujaza)
    if(data.filters && data.filters.length > 0) {
        let inputsHtml = '';
        data.filters.forEach(f => {
            inputsHtml += `
            <div style="margin-top:10px;"> <label style="font-size:12px; font-weight:bold; display:block; color:var(--primary-dark);">${f}</label> <input type="text" class="service-filter-input" data-filter="${f}" placeholder="Jaza hapa..." style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; outline:none; background:white;"> </div>`;
        });
        filtersArea.innerHTML = inputsHtml;
        filterContainer.style.display = 'block';
    } else {
        filterContainer.style.display = 'none';
    }
};

window.submitService = async function(event) {
    if(event) event.preventDefault();
    if(!skh.requireAuth()) return;
    
    const role = document.getElementById('servRole').value;
    const title = document.getElementById('servTitle').value.trim();
    const section = document.getElementById('servSection').value;
    const category = document.getElementById('servCategory').value;
    const subCategory = document.getElementById('servSubCategory').value;
    const price = parseFloat(document.getElementById('servPrice').value) || 0;
    const desc = document.getElementById('servDesc').value.trim();
    const loc = document.getElementById('servLocation').value.trim();
    
    const isCategoryVisible = document.getElementById('servCategoryContainer').style.display !== 'none';
    const isSubCategoryVisible = document.getElementById('servSubCategoryContainer').style.display !== 'none';

    if(!title || !section || (isCategoryVisible && !category) || (isSubCategoryVisible && !subCategory) || !desc || !loc) {
        alert(" jaza sehemu zote zenye alama ya nyota (*)."); 
        return;
    }

    try {
        const imageUrl = await skh.uploadImage('servImage');
        const docId = await skh.saveData('services', {
            role: role,
            title: title,
            section: section,
            category: category,
            subCategory: subCategory,
            price: price,
            description: desc,
            location: loc,
            image: imageUrl || "",
            createdAt: new Date().toISOString()
        });

        if(docId) {
            alert(" Huduma imechapishwa kikamilifu!");
            document.getElementById('serviceForm').reset();
            closeModals();
        }
    } catch(e) {
        alert("Kosa: " + e.message);
    }
};

window.toggleTransportFields = function() {
    const type = document.getElementById('delType').value;
    const dynamicFields = document.getElementById('transportDynamicFields');
    const servicesDiv = document.getElementById('driverServicesDiv');
    const paxF = document.getElementById('paxField');
    const cargoF = document.getElementById('cargoField');
    const routeF = document.getElementById('routeField');

    if(!type) { dynamicFields.style.display = 'none'; servicesDiv.style.display = 'none'; return; }
    
    dynamicFields.style.display = 'block';
    servicesDiv.style.display = 'block';

    // Safisha tick zote aweke mwenyewe upya
    const chks = document.querySelectorAll('.drv-chk');
    chks.forEach(c => c.checked = false);

    // Weka tick za msingi kiotomatiki (Ili kumrahisishia)
    if (type === 'Lori') {
        paxF.style.display = 'none';
        cargoF.style.display = 'block';
        routeF.style.display = 'none';
        document.querySelector('.drv-chk[value="Cargo"]').checked = true; // Lori labeba Cargo
    } 
    else if (type === 'Daladala') {
        paxF.style.display = 'block';
        cargoF.style.display = 'none';
        routeF.style.display = 'block';
        document.querySelector('.drv-chk[value="Passenger"]').checked = true; // Daladala ni Abiria tu
    } 
    else {
        paxF.style.display = 'block';
        cargoF.style.display = 'block'; // Boda/Bajaji inaweza kubeba vyote viwili
        routeF.style.display = 'none';
        
        document.querySelector('.drv-chk[value="Passenger"]').checked = true;
        if(type === 'Boda' || type === 'Bajaji') {
            document.querySelector('.drv-chk[value="Product"]').checked = true;
            document.querySelector('.drv-chk[value="Food"]').checked = true;
            if(type === 'Boda') document.querySelector('.drv-chk[value="Emergency"]').checked = true;
        }
    }
};

window.submitDelivery = async function(event) {
    if(event) event.preventDefault();
    if(!skh.requireAuth()) return;

    const btn = document.getElementById('btnDelivery');
    if(!btn) return;
    const originalText = btn.innerHTML;

    // 1. Kusanya huduma zote alizozitiki (checkboxes) kama array ya huduma
    const selectedServices = Array.from(document.querySelectorAll('.del-supported-service:checked')).map(cb => cb.value);

    if (selectedServices.length === 0) {
        alert(" chagua angalau aina moja ya huduma unayoweza kubeba!");
        return;
    }

    skh.setLoading('btnDelivery', true, ' INAHIFADHI RATIBA...');

    try {
        // 2. Pandisha picha ya chombo
        const imageUrl = await skh.uploadImage('delImage');

        // 3. Jenga data kamili kwa database ya Sokohai
        const deliveryData = {
            title: document.getElementById('delTitle').value.trim(),
            accountType: document.getElementById('delAccountType').value,
            supportedServices: selectedServices, // Array ya mambo anayobeba
            vehicleType: document.getElementById('delVehicleType').value,
            vehicleReg: document.getElementById('delVehicleReg').value.trim().toUpperCase(),
            maxWeight: document.getElementById('delMaxWeight').value.trim(),
            pricingMethod: document.getElementById('delPricingMethod').value,
            price: parseFloat(document.getElementById('delBasePrice').value) || 0,
            pickupRegion: document.getElementById('delFromRegion').value.trim(),
            destinationRegion: document.getElementById('delToRegion').value.trim(),
            fullRoute: document.getElementById('delFullRoute').value.trim(),
            driverName: document.getElementById('delDriverName').value.trim(),
            contact: document.getElementById('delPhone').value.trim(),
            description: (document.getElementById('delDesc') ? document.getElementById('delDesc').value.trim() : ""),
            image: imageUrl || "https://ui-avatars.com/api/?name=Usafiri&background=03509d&color=fff",
            online: true, // Anaonekana live kuanzia sasa
            status: "available",
            // [NEGO LOCK §21/§22] Transporter Settings — msafiri anajiamulia.
            // Field hii ndiyo kweli ambayo Backend Gate inaitafuta (34-chat-core).
            negotiationAllowed: (function(){ var el = document.getElementById('delNegoAllowed'); return el ? !!el.checked : true; })(),
            createdAt: new Date().toISOString()
        };

        const docId = await skh.saveData('drivers', deliveryData);

        if(docId) {
            alert(" HONGERA!\nUsafiri wako umesajiliwa kikamilifu kwenye database ya Sokohai Transport Network.");
            document.getElementById('deliveryForm').reset();
            closeModals();
            loadAndRenderDashboard(); // Refresh dashbodi kuona huduma yako
        }
    } catch(e) {
        alert(" Imeshindikana: " + e.message);
    } finally {
        skh.setLoading('btnDelivery', false, originalText);
    }
};

window.toggleRideReqFields = function() {
    const type = document.getElementById('rideReqType').value;
    if(type === 'Lori') {
        document.getElementById('ridePaxDiv').style.display = 'none';
        document.getElementById('rideCargoDiv').style.display = 'block';
    } else {
        document.getElementById('ridePaxDiv').style.display = 'block';
        document.getElementById('rideCargoDiv').style.display = 'none';
    }
};

window.broadcastRideRequest = async function() {
    if(!skh.requireAuth()) return;

    const category = document.getElementById('rideReqCategory').value;
    const vType = document.getElementById('rideReqType').value;
    const toLoc = document.getElementById('rideReqTo').value.trim();
    const recPhone = document.getElementById('receiverPhone').value.trim();
    
    // Tunachukua jina la mzigo kutoka kwenye memory (chain) au kwenye fomu
    const fromLoc = sessionStorage.getItem('chain_from') || document.getElementById('rideReqFrom').value.trim();
    let finalCargoName = sessionStorage.getItem('chain_cargo_name') || "";
    const oldRideId = sessionStorage.getItem('chain_old_ride_id') || null;

    if (!category || !vType || !fromLoc || !toLoc || !recPhone) {
        alert(" jaza sehemu zote zenye alama ya nyota (*).");
        return;
    }

    // Baini jina la mzigo kulingana na aina ya safari
    let passengerCount = 1;
    let luggageEstimate = "No Luggage";
    let animalType = "";
    let animalCount = 0;
    let cargoWeight = 0;
    let cargoSize = "";
    let isFragile = false;
    let isLiquid = false;

    if (category === 'Passengers') {
        passengerCount = parseInt(document.getElementById('ridePaxCount').value) || 1;
        luggageEstimate = document.getElementById('ridePaxLuggage').value;
        finalCargoName = `Abiria ${passengerCount} (${luggageEstimate})`;
    } 
    else if (category === 'Livestock') {
        animalType = document.getElementById('rideAnimalType').value;
        animalCount = parseInt(document.getElementById('rideAnimalCount').value) || 1;
        finalCargoName = `Mifugo: ${animalType} x ${animalCount}`;
    } 
    else if (category === 'Cargo') {
        finalCargoName = document.getElementById('cargoName').value.trim();
        cargoWeight = parseFloat(document.getElementById('cargoWeight').value) || 0;
        cargoSize = document.getElementById('cargoSize').value.trim();
        isFragile = document.getElementById('isFragile').checked;
        isLiquid = document.getElementById('isLiquid').checked;

        if(!finalCargoName) {
            alert(" andika jina la mzigo unaotaka kuusafirisha!");
            return;
        }
    }

    // [ROUTE MATCHER 2026-09] Broadcast ni njia ya PILI (kitufe cha pili);
    // kitufe kiku sasa ni cha kuchambua magari kwa njia (skhRouteMatcherSearch).
    const btn = document.getElementById('btnBroadcastRideReq') || document.getElementById('btnSubmitRideReq');
    if(!btn) return;
    btn.innerHTML = " INATANGAZA OMBI... ";
    btn.disabled = true;

    // --- SOKOHAI TOKEN GENERATION (ANTI-FRAUD LOGISTICS CHAIN) ---
    // [CUSTODY 2026-09] Tokeni za zamani za tarakimu 4 (Math.random) zimeondolewa —
    // zilikuwa rahisi kubahatisha (1234/0000). Sasa tunatumia tokeni SALAMA
    // (crypto-random 8 hex). Token A (PK) itazalishwa TENA kwa usalama na SERVER
    // (deliveryGenerateToken) mara dereva atakapokubali safari; hii hapa ni ya
    // kuanzia kwa Token C (DL) inayotumiwa na mpokeaji kwenye uwasilishaji.
    const tokenA = "";                        // PK inazalishwa baada ya ACCEPT (server)
    const tokenB = "";                        // TR inazalishwa kwenye handover (server)
    // [CUSTODY PHASE B 2026-09] Token C (DL) inaundwa na SERVER
    // (deliveryGenerateToken kind=transfer) BAADA ya kuunda safari — tazama chini.

    // Vuta picha na maelezo kutoka kwenye kadi iliyofunguliwa kama ipo kwenye memory
    const productDataRaw = sessionStorage.getItem('leg_construction');
    let cargoImage = "https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff";
    let cargoPrice = 0;
    let cargoDetails = "N/A";
    
    if (productDataRaw) {
        try {
            const prod = JSON.parse(productDataRaw);
            cargoImage = prod.image || cargoImage;
            cargoPrice = prod.price || 0;
            cargoDetails = `Rangi: ${prod.color || 'N/A'}, Saizi: ${prod.size || 'N/A'}, Qty: ${prod.qty || 1}`;
        } catch(e) { console.log(e); }
    }

    // [R8 TRANSPORT §31-§35 DIRECT BOOKING 2026-09] Mteja alianzia kotlinx na
    // DETAIL ya transporter (chaguo lake: ‘Omba Usafiri’) — hakuna negotiation.
    // Ambatsha preferredDriverId+notification (il ilk Request Inbox ya TRANSPORTER).
    let preferredDriverId = null, preferredDriverName = '';
    try {
        const pd = JSON.parse(sessionStorage.getItem('ride_pref_driver') || 'null');
        if (pd && (pd.uid || pd.name)) {
            preferredDriverId = pd.uid || null;
            preferredDriverName = pd.name || '';
        }
        sessionStorage.removeItem('ride_pref_driver'); // tumia-mara-moja (hakuna state inayobaa blindi)
    } catch(e) {}

    try {
        const rideDocRef = await skh.addDoc(skh.collection(skh.db, "ride_requests"), {
            customerId: skh.currentUser.uid,
            customerName: skh.currentUser.displayName || "Mteja",
            customerPhone: skh.currentUserData?.phone || "",
            reqCategory: category,
            vehicleType: vType,
            fromLocation: fromLoc,
            toLocation: toLoc,
            receiverPhone: recPhone,
            cargoName: finalCargoName,
            cargoImage: cargoImage,
            cargoPrice: cargoPrice,
            cargoDetails: cargoDetails,
            
            // Hifadhi data za kina za mzigo
            passengerCount,
            luggageEstimate,
            animalType,
            animalCount,
            cargoWeight,
            cargoSize,
            isFragile,
            isLiquid,

            status: "searching", // Dereva anatafutwa

            // [R8 §31 DIRECT BOOKING] transporter allychaguliwa na mteja
            // (DETAILS-'Omba Usafiri') — anaiona kwenye Request Inbox yake
            // (27-route-dispatch inayo 'bila target' kwa madereva WAORORIJWA
            // wakiwa wamefuliza, na kwa wedge wengine kwa soko la kazi).
            preferredDriverId: preferredDriverId,
            preferredDriverName: preferredDriverName,

            // --- Hifadhi Tokens kwenye Firestore kwa Chain of Custody ---
            // [CUSTODY 2026-09] PK (pickup) na TR (handover) zinaundwa na SERVER
            // kwenye hatua sahihi (ACCEPT -> PK; handover -> TR). DL (delivery) ni ya
            // mpokeaji wa mwisho. Tokeni zote ni SALAMA (crypto-random), si 4-digit.
            pickupToken: null,             // Token A — itaundwa baada ya ACCEPT (server)
            pickupTokenStatus: 'unissued',
            handoverToken: null,           // Token B — itaundwa kwenye handover (server)
            handoverTokenStatus: 'unissued',
            // Token C (DL) — mpokeaji wa mwisho. Inatolewa na SERVER hapa chini;
            // HAKUNA plaintext ya transferCode inayoandikwa kwenye ride doc.
            transferTokenStatus: 'unissued',
            
            parentRideId: oldRideId,
            isIntermediateLeg: !!oldRideId,
            createdAt: new Date().toISOString()
        });

        // [ROUTE DISPATCH] Arifu vyombo vya usafiri vyenye route husika
        // (au Mawakala wa SokoHai kama hakuna dereva) — 27-route-dispatch.js
        if (typeof window.skhDispatchRideToCarriers === 'function') {
            window.skhDispatchRideToCarriers({
                customerId: skh.currentUser.uid,
                customerName: skh.currentUser.displayName || "Mteja",
                reqCategory: category,
                vehicleType: vType,
                fromLocation: fromLoc,
                toLocation: toLoc,
                cargoName: finalCargoName,
                parentRideId: oldRideId || null,
                isIntermediateLeg: !!oldRideId
            }, rideDocRef.id).catch(() => {});
        }

        // Safisha kumbukumbu ya flow
        sessionStorage.removeItem('chain_from');
        sessionStorage.removeItem('chain_cargo_name');
        sessionStorage.removeItem('chain_old_ride_id');

        // [R8 §31 DIRECT BOOKING] Notification kwa TRANSPORTER aliyechaguliwa
        // na mteja (Direct booking kwa Details-'Omba Usafiri'). HUO ni booking
        // request ya knotazi, haitegemei majadiliano. Backend-helpers za zamani
        // (preferredDriverId kwenye rideRequest) zimbo.
        if (typeof preferredDriverId !== 'undefined' && preferredDriverId) {
            try {
                await skh.addDoc(skh.collection(skh.db, 'notifications'), {
                    userId: preferredDriverId,
                    title: 'Ombi jipya la usafirishaji',
                    body: (skh.currentUser.displayName || 'Mteja') + ' · ' + (fromLoc || '') + ' → ' + (toLoc || ''),
                    type: 'delivery', rideId: rideDocRef.id,
                    createdAt: new Date().toISOString(), read: false
                });
            } catch (e) { /* si kikwazo cha ombi */ }
        }

        // [CUSTODY PHASE B 2026-09] Token C inatolewa na SERVER (salama).
        let tokenC = null;
        if (typeof window.skhCustodyMintTransferToken === 'function') {
            const minted = await window.skhCustodyMintTransferToken(rideDocRef.id);
            if (minted && minted.ok) tokenC = minted.token;
        }

        alert(` OMBI LIMERUSHWA SOKONI!\n\n• Token ya Kuchukulia Mzigo (Token A - PK): itaundwa kiusalama pindi dereva atakapokubali safari.\n• Token ya Mwisho (Token C - DL): ${tokenC || '(itazalishwa — fungua tracking kuiona)'}\n\nHifadhi Token C hii kwa usalama — utamkabidhi dereva anapokuletea mzigo.`);
        closeModals();
        loadBuyerOrdersWithTracking(); // Fungua mnyororo kuona tracking
    } catch(e) {
        alert(" Kosa kuanzisha ombi: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = " Usipopata gari: tangaza ombi kwa madereva/wakala wote";
    }
};

window.openRideRequestModal = function() {
    if(!skh.requireAuth()) return;
    closeModals();
    document.getElementById('rideRequestModal').style.display = 'flex';
};

window.filterByCategory = function(categoryName) {
        skh.activeCategory = categoryName;
        const ft = document.getElementById('feedTitleText');
        if(ft) ft.innerHTML = categoryName === "Zote" ? ' Uwanja wa Mchanganyiko' : ` Kategoria: ${categoryName}`;
        
        skh.currentLimit = 20;
        skh.loadMainFeed(skh.currentFeedCollection);
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

window.skhTopbarShow = function () {
        try {
            const nav = document.querySelector('.top-nav-row');
            const ann = document.getElementById('topAnnouncement');
            const fil = document.getElementById('topFilterToggles');
            if (nav) nav.classList.remove('scroll-hidden');
            if (ann) ann.classList.remove('scroll-hidden');
            if (fil) fil.classList.remove('scroll-hidden');
            skh.lastScrollY = window.scrollY; // linganisha na sasa sio zamani
        } catch (e) { /* defensive */ }
    };

window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;

        // [PHASE 5.8] ukurasa MFUPI (hakuna mahali ya kuscroll) -> upau LAZIMA uonekane
        // (kabla: ukurasa mfupi + class iliyobaki = upau umefichika MILELE)
        if ((document.documentElement.scrollHeight - window.innerHeight) <= 80) {
            window.skhTopbarShow();
            return;
        }
        // [PHASE 5.8] hysteresis: mabadiliko madogo (<10px) hayabadilishi hali
        // (kabla: jitter ya 1px ilikuwa inarudisha upau mara moja — flicker)
        if (Math.abs(currentScrollY - skh.lastScrollY) < 10 && currentScrollY > 80) return;
        
        // Tunashika vile vitu tunavyotaka kuvificha
        const topNav = document.querySelector('.top-nav-row');
        const announcement = document.getElementById('topAnnouncement');
        const filters = document.getElementById('topFilterToggles');
        const cDrop = document.getElementById('ctgDrop');
        const fDrop = document.getElementById('filterDrop');
        
        // Tunafanya kazi kama mtu ameshuka chini zaidi ya pixels 80
        if (currentScrollY > 80) {
            if (currentScrollY > skh.lastScrollY) {
                // ANASCROLL CHINI -> Ficha Announcement pekee.
                // [FIX] TOP NAV HAIFICHWI KAMWE (ilikuwa 'inapotea' kwa watumiaji)
                if(announcement) announcement.classList.add('scroll-hidden');
                
                // Funga Dropdowns kiotomatiki kama zilikuwa wazi
                if(cDrop) cDrop.style.display = 'none';
                if(fDrop) fDrop.style.display = 'none';
            } else {
                // ANASCROLL JUU -> Rudisha Announcement
                if(announcement) announcement.classList.remove('scroll-hidden');
            }
        } else {
            // YUPO JUU KABISA YA PAGE -> Hakikisha kila kitu kinaonekana
            if(topNav) topNav.classList.remove('scroll-hidden');
            if(announcement) announcement.classList.remove('scroll-hidden');
            if(filters) filters.classList.remove('scroll-hidden');
        }
        
        skh.lastScrollY = currentScrollY;
    });

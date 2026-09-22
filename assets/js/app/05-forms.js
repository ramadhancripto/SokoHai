/* ==== js/app/05-forms.js ==== */
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

window.closeWelcome = function() { 
        const wm = document.getElementById('welcomeModal');
        if(wm) wm.style.display = 'none'; 
    };

window.triggerDpUpload = function() { 
        if(!skh.requireAuth()) return; 
        const dp = document.getElementById('dpUploadInput');
        if(dp) dp.click(); 
    };

if(skh.dpu) {
        skh.dpu.addEventListener('change', async (e) => {
            const file = e.target.files[0]; 
            if(!file) return;
            if(file.size > 3 * 1024 * 1024) { 
                alert(T('pf_pic_too_big', 'Image is too large, maximum is 3MB.')); 
                return; 
            }
            
            try {
                const pic = document.getElementById('searchProfilePic');
                if(pic) pic.style.opacity = '0.5';
                
                // [PHASE 4.2] Uploader mmoja wa pamoja
                const up = await window.skhUploadFromFile(file);
                if(!up) throw new Error(T('pf_pic_upload_fail', 'Failed to upload image.'));
                const data = up.data;
                
                if(data.secure_url) {
                    const optImg = skh.getOptimizedImageUrl(data.secure_url);
                    await skh.updateProfile(skh.currentUser, { photoURL: optImg });
                    // [MEDIA PERSIST §10–§12] DP lazima iandikwe kwenye doc la
                    // Firestore — si Auth profile pekee. Nala kwa sepuleni, users
                    // docId ni uid (doSignup); fallback hiyo ni muhimu kwa watumiaji
                    // ambao currentUserData.docId haipo kwa sababu yoyote.
                    const _userDocId = (skh.currentUserData && skh.currentUserData.docId) || (skh.currentUser && skh.currentUser.uid);
                    if(_userDocId) { 
                        await skh.updateDoc(skh.doc(skh.db, "users", _userDocId), { photoURL: optImg }); 
                    }
                    if(pic) pic.src = optImg; 
                    alert(T('pf_pic_updated', 'Your profile picture has been updated!'));
                }
            } catch(err) { 
                alert(T('pf_pic_retry', 'Failed to upload image. Try again.')); 
            } finally { 
                const pic = document.getElementById('searchProfilePic');
                if(pic) pic.style.opacity = '1'; 
            }
        });
    }

window.openUserPaymentModal = function() {
    if(!skh.requireAuth()) return; // Hii inazuia watumiaji ambao hawajaingia
    window.closeModals();
    const pm = document.getElementById('userPaymentModal');
    if(!pm) return;
    
    pm.style.display = 'flex';

    const btnSave = document.getElementById('btnSavePaymentAccount');
    const btnEdit = document.getElementById('btnEditPaymentAccount');
    const allInputs = pm.querySelectorAll('input, select');

    if (skh.currentUserData && skh.currentUserData.paymentAccount && skh.currentUserData.paymentAccount !== "") {
        // Ipo: Honey Mode (Locked)
        allInputs.forEach(inp => {
            inp.disabled = true;
            inp.style.opacity = '0.8';
        });
        document.getElementById('paySetupType').value = skh.currentUserData.paymentType || 'Mobile';
        setTimeout(() => { window.togglePaymentSetupFields(); }, 100);
        if(btnEdit) { btnEdit.style.display = 'block'; btnEdit.style.background = '#D4AF37'; }
        if(btnSave) btnSave.style.display = 'none';
    } else {
        // Mpya: Blue Mode (Open)
        allInputs.forEach(inp => {
            inp.disabled = false;
            inp.style.opacity = '1';
        });
        if(btnEdit) { btnEdit.style.display = 'none'; }
        if(btnSave) { btnSave.style.display = 'block'; btnSave.style.background = '#18A982'; }
    }
    // Inasoma na kupakia miamala ya SokoPay ya mtumiaji
    window.loadUserSokoPayLinks();
};

window.loadUserSokoPayLinks = async function() {
    const listDiv = document.getElementById('userSokoPayList');
    const overviewDiv = document.getElementById('spHubActiveOverviewList');
    if(!skh.currentUser) return;

    if(listDiv) listDiv.innerHTML = '<p style="text-align:center; color:gray;">' + T('pf_reading', 'Reading...') + '</p>';
    if(overviewDiv) overviewDiv.innerHTML = '<p style="text-align:center; color:gray;">' + T('pf_loading_overview', 'Loading Active Overview...') + '</p>';

    try {
        const qOwner = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("userId", "==", skh.currentUser.uid));
        const qPaid = skh.query(skh.collection(skh.db, "sokopay_links"), skh.where("buyerId", "==", skh.currentUser.uid));
        const [snapOwner, snapPaid] = await Promise.all([skh.getDocs(qOwner), skh.getDocs(qPaid)]);
        
        let walletListHtml = '';
        let count = 0;

        // 1. Chora Kadi za Wallet Transactions List
        snapOwner.forEach(docSnap => {
            const d = docSnap.data();
            count++;
            const statusText = d.status === 'pending' ? T('pf_pending', 'Pending') : (d.status === 'held' ? T('pf_held', 'Held') : T('pf_completed', 'Completed'));
            walletListHtml += `
                <div style="background:white; border:1px solid #e2e8f0; padding:10px; border-radius:10px;"> <div style="display:flex; justify-content:space-between; font-weight:bold;"> <span>${T('pf_code', 'Code')}: ${d.code}</span> <span style="color:red;">TSh ${d.price.toLocaleString()}</span> </div> <span style="display:block; margin-top:3px; color:gray;">${T('pf_product', 'Product')}: ${d.title}</span> <span style="display:block; font-size:12.5px; color:#03509d; font-weight:bold;">${T('pf_status', 'Status')}: ${statusText}</span> </div>`;
        });

        snapPaid.forEach(docSnap => {
            const d = docSnap.data();
            count++;
            const statusText = d.status === 'held' ? T('pf_held', 'Held') : T('pf_completed', 'Completed');
            walletListHtml += `
                <div style="background:#fffbeb; border:1px solid var(--gold); padding:10px; border-radius:10px;"> <div style="display:flex; justify-content:space-between; font-weight:bold;"> <span>${T('pf_paid_code', 'Code I paid for')}: ${d.code}</span> <span style="color:red;">TSh ${d.price.toLocaleString()}</span> </div> <span style="display:block; margin-top:3px; color:gray;">${T('eng_seller', 'Seller')}: ${skh.skhEscape(d.ownerName)}</span> <span style="display:block; font-size:12.5px; color:green; font-weight:bold;">${T('pf_status', 'Status')}: ${statusText}</span> </div>`;
        });

        if(listDiv) {
            listDiv.innerHTML = count === 0 ? '<p style="text-align:center; color:gray;">' + T('pf_no_transactions', 'No SokoPay transactions yet.') + '</p>' : walletListHtml;
        }

        // 2. Chora Active Overview (Kama ilivyopo kwenye picha ya muundo)
        if(overviewDiv) {
            overviewDiv.innerHTML = `
                <!-- 1. PRODUCT ORDER (BIDHAA) --> <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:16px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02);"> <div style="display:flex; gap:12px; align-items:center;"> <div style="width:45px; height:45px; background:#eff6ff; color:#3b82f6; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;"></div> <div> <span style="font-size:12px; background:#e0f2fe; color:#03509d; padding:2px 8px; border-radius:10px; font-weight:bold; text-transform:uppercase;">${T('pf_product_order', 'PRODUCT ORDER')}</span> <b style="font-size:14px; color:#0F172A; display:block; margin-top:3px;">Samsung 55" Smart TV</b> <small style="color:gray; font-size:12.5px; display:block;">${T('pf_order_id', 'Order ID')}: ORD-7X92KQ | ${T('pf_status', 'Status')}: <span style="color:#03509d; font-weight:bold;">${T('pf_in_transit', 'In Transit')}</span></small> </div> </div> <div style="text-align:right;"> <b style="display:block; color:var(--terracotta); font-size:14px; margin-bottom:5px;">TZS 890,000</b> <button type="button" onclick="alert('${T('pf_open_map', 'Opening Live tracking map...')}')" style="padding:6px 12px; background:var(--primary-blue); color:white; border:none; border-radius:8px; font-weight:bold; font-size:12.5px; cursor:pointer;">${T('pf_track_order', 'Track Order')}</button> </div> </div> <!-- 2. SERVICE ORDER (HUDUMA) --> <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:16px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02);"> <div style="display:flex; gap:12px; align-items:center; flex:1;"> <div style="width:45px; height:45px; background:#f0fdf4; color:#22c55e; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;"></div> <div style="flex:1;"> <span style="font-size:12px; background:#dcfce7; color:#16a34a; padding:2px 8px; border-radius:10px; font-weight:900; text-transform:uppercase;">${T('pf_service_order', 'SERVICE ORDER')}</span> <b style="font-size:14px; color:#0F172A; display:block; margin-top:3px;">Website Development</b> <small style="color:gray; font-size:12.5px; display:block;">${T('pf_service_id', 'Service ID')}: SRV-82KX91 | ${T('pf_status', 'Status')}: <span style="color:#16a34a; font-weight:bold;">${T('pf_in_progress', 'In Progress')}</span></small> <!-- Progress Bar --> <div style="width:80%; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden; margin-top:6px;"> <div style="width:65%; height:100%; background:#10b981;"></div> </div> </div> </div> <div style="text-align:right;"> <b style="display:block; color:var(--terracotta); font-size:14px; margin-bottom:10px;">TZS 450,000</b> <button type="button" onclick="alert('${T('pf_open_contracts', 'Opening job details and contracts...')}')" style="padding:6px 12px; background:#e2e8f0; color:#475569; border:none; border-radius:8px; font-weight:bold; font-size:12.5px; cursor:pointer;">${T('view_details', 'View Details')}</button> </div> </div> <!-- 4. TRANSPORT BOOKING (USAFIRI) --> <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:16px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02);"> <div style="display:flex; gap:12px; align-items:center;"> <div style="width:45px; height:45px; background:#fffbeb; color:#d97706; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;"></div> <div> <span style="font-size:12px; background:#fffbeb; color:#d97706; padding:2px 8px; border-radius:10px; font-weight:bold; text-transform:uppercase;">${T('pf_transport_booking', 'TRANSPORT BOOKING')}</span> <b style="font-size:14px; color:#0F172A; display:block; margin-top:3px;">Dar es Salaam -> Dodoma</b> <small style="color:gray; font-size:12.5px; display:block;">${T('pf_trip_id', 'Trip ID')}: TRP-73A91 | ${T('pf_status', 'Status')}: <span style="color:#d97706; font-weight:bold;">${T('pf_confirmed', 'Confirmed')}</span></small> </div> </div> <div style="text-align:right;"> <b style="display:block; color:var(--terracotta); font-size:14px; margin-bottom:5px;">TZS 40,000</b> <button type="button" onclick="alert('${T('pf_open_ticket', 'Opening your trip ticket...')}')" style="padding:6px 12px; background:#e2e8f0; color:#475569; border:none; border-radius:8px; font-weight:bold; font-size:12.5px; cursor:pointer;">${T('pf_view_ticket', 'View Ticket')}</button> </div> </div> `;
        }

    } catch (e) {
        if(listDiv) listDiv.innerHTML = '<p style="color:red; text-align:center;">' + T('pf_network_error', 'Network error.') + '</p>';
    }
};

window.populateFormCategories = function() {
    const catSelect = document.getElementById('prodCategory');
    if(!catSelect) return;

    // Wasifu mkuu wa duka la mtumiaji (k.m. Pharmacy, Hardware, nk)
    const primaryProfile = skh.currentUserData?.primaryProfile || 'General Store';
    
    // Ramani inayounganisha Wasifu wa Duka na Kategoria za Bidhaa zenye uhusiano
    const profileMap = { 'Pharmacy': ["Afya (Health)", "Urembo (Beauty)"], 'Hardware Store': ["Ujenzi (Construction)", "Mabati na Vyuma (Industrial)", "Zana za Viwandani (Hardware)", "Spea (Spare Parts)"], 'Grocery Store': ["Vyakula na Vinywaji (Food)", "Vyombo vya Plastiki (Retail)", "Jumla (Wholesale Goods)"], 'Supermarket': ["Vyakula na Vinywaji (Food)", "Vyombo vya Plastiki (Retail)", "Urembo (Beauty)", "Mavazi (Fashion)"], 'Mini Market': ["Vyakula na Vinywaji (Food)", "Vyombo vya Plastiki (Retail)"], 'Agrovet': ["Kilimo (Agriculture)", "Ufugaji (Livestock)", "Uvuvi (Fisheries)"], 'Phone Shop': ["Simu (Phones)", "Kompyuta (Computers)", "Mifumo (Digital Products)"], 'Computer Store': ["Kompyuta (Computers)", "Simu (Phones)", "Mifumo (Digital Products)"], 'Boutique': ["Mavazi (Fashion)", "Urembo (Beauty)"], 'Shoe Store': ["Mavazi (Fashion)", "Mitumba (Second Hand)"]
    };

    const recommendedCats = profileMap[primaryProfile] || [];
    
    let recommendedHtml = '';
    let otherHtml = '';

    for (const catName in skh.advancedCategories) {
        if (recommendedCats.includes(catName)) {
            recommendedHtml += `<option value="${catName}" style="font-weight:bold; color:var(--green);">${T('suggested', 'Suggested')}: ${catName}</option>`;
        } else {
            otherHtml += `<option value="${catName}">${catName}</option>`;
        }
    }

    catSelect.innerHTML = `
        <option value="">${T('pf_choose_category', '-- Choose Category --')}</option>
        ${recommendedHtml ? `<optgroup label="${T('pf_recommended_for', 'Recommended for')} ${primaryProfile}">${recommendedHtml}</optgroup>` : ''}
        <optgroup label="${T('pf_other_categories', 'Other SokoHai Categories')}">${otherHtml}</optgroup> `;
};

window.generateSellerFilters = function() {
    const catVal = document.getElementById('prodCategory').value;
    const subVal = document.getElementById('prodSubCategory').value;
    const filterContainer = document.getElementById('dynamicFiltersContainer');
    const filtersArea = document.getElementById('filtersInputsArea');

    if(!subVal || !skh.advancedCategories[catVal].subcategories[subVal]) {
        filterContainer.style.display = 'none';
        return;
    }

    const filters = skh.advancedCategories[catVal].subcategories[subVal].filters;
    if(filters && filters.length > 0) {
        let inputsHtml = '';
        filters.forEach(f => {
            inputsHtml += `
            <div style="margin-bottom:12px;"> <label style="font-size:13px; font-weight:bold; color:#64748b;">${f} *</label> <input type="text" class="universal-filter-input" data-filter="${f}" placeholder="${T('pf_enter', 'Enter')} ${f}..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white;"> </div>`;
        });
        filtersArea.innerHTML = inputsHtml;
        filterContainer.style.display = 'block';
    } else {
        filterContainer.style.display = 'none';
    }
};

const originalSubmitSeller = window.submitSeller;

window.toggleModeFields = function() {
    const modeEl = document.getElementById('prodSaleMode');
    const container = document.getElementById('dynamicModeFields');
    if (!modeEl || !container) return;
    const mode = modeEl.value;
    const auctionF = document.getElementById('mode_auction_fields');
    const dropF = document.getElementById('mode_price_drop_fields');
    const bulkF = document.getElementById('mode_bulk_fields');
    const wsF = document.getElementById('mode_wholesale_fields');
    const gbF = document.getElementById('mode_groupbuy_fields');
    const pLabel = document.getElementById('priceLabel');

    // Ficha zote kwanza
    container.style.display = 'block';
    if (auctionF) auctionF.style.display = 'none';
    if (dropF) dropF.style.display = 'none';
    if (bulkF) bulkF.style.display = 'none';
    if (wsF) wsF.style.display = 'none';
    if (gbF) gbF.style.display = 'none';

    if (mode === 'free_market') {
        container.style.display = 'none';
        if (pLabel) pLabel.innerText = T('pf_normal_price', 'Normal Price (TSh) *');
    } else if (mode === 'auction') {
        if (auctionF) auctionF.style.display = 'block';
        if (pLabel) pLabel.innerText = T('pf_starting_bid', 'Starting Bid (TSh) *');
    } else if (mode === 'price_drop') {
        if (dropF) dropF.style.display = 'block';
        if (pLabel) pLabel.innerText = T('pf_starting_price', 'Starting Price (TSh) *');
    } else if (mode === 'wholesale') {
        if (bulkF) bulkF.style.display = 'block';
        if (wsF) wsF.style.display = 'block';
        if (pLabel) pLabel.innerText = T('pf_retail_price', 'Retail Price (TSh) *');
    } else if (mode === 'group_buy') {
        if (bulkF) bulkF.style.display = 'block';
        if (gbF) gbF.style.display = 'block';
        if (pLabel) pLabel.innerText = T('pf_retail_price', 'Retail Price (TSh) *');
    }
};

populateFormCategories();

window.showForm = function(formId) { 
    if(!skh.requireAuth()) return;

    // Funga madirisha mengine yote
    window.closeModals();

    // 1. Fungua "plusMenu" (Hii ndio background ya fomu)
    const pm = document.getElementById('plusMenu');
    if(pm) pm.style.display = 'flex';

    // 2. Ficha "mainMenu" (Orodha ya maandishi)
    const mm = document.getElementById('mainMenu');
    if(mm) mm.style.display = 'none';

    // 3. Onyesha fomu uliyochagua (Mf: sellerForm)
    const targetForm = document.getElementById(formId);
    if(targetForm) {
        targetForm.style.display = 'block';
        if(formId === 'sellerForm') {
            populateFormCategories();
            // [FIX] Hakikisha sehemu za mtandaoni (Maelezo, Mode ya Kuuza, Picha) zinaonekana
            // kulingana na default ya Visibility (Hybrid) — kabla haijabadilishwa na mtumiaji.
            if (window.toggleProductFormFields) window.toggleProductFormFields();
        }
        if(formId === 'businessOSForm') {
            // [POS FIX] Andaa cache ya bidhaa za duka ili autosearch ifanye kazi OFFLINE
            if (typeof window.warmPosProductsCache === 'function') window.warmPosProductsCache();
        }
    }
};

window.goBackToMenu = function() {
    const forms = ['sellerForm','serviceForm','deliveryForm','sokopayForm','offlineMemberForm','editModal','businessOSForm'];
    
    // Ficha fomu zote zilizotajwa juu
    forms.forEach(f => {
        const el = document.getElementById(f);
        if(el) el.style.display = 'none';
    });

    // Angalia kama duka lipo wazi (Dashboard Mode)
    const isDashboardActive = document.getElementById('dashboardViews') && document.getElementById('dashboardViews').style.display !== 'none';

    if (isDashboardActive) {
        // Ikiwa tupo kwenye Dashboard, funga tu fomu na usiathiri upande wa soko la mteja!
        const pm = document.getElementById('plusMenu');
        if (pm) pm.style.display = 'none';
        window.loadAndRenderDashboard(); // Refresh dashbodi kuonyesha data mpya
    } else {
        // Ikiwa tupo kwenye Soko la kawaida la Mnunuzi
        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) mainMenu.style.display = 'flex';
    }
};

if(skh.mm) skh.mm.style.display = 'flex';

document.querySelectorAll('form').forEach(form => form.reset());

;

/* ==== js/app/05-forms.js ==== */
import { skh } from './00-bootstrap.js';
// Canonical taxonomy is the authority for the visible seller category list.
// Existing skh.advancedCategories is still passed in, unchanged, for compatibility.
import { getSellerCategoryOptions, getSellerSubcategories } from '../../shared/product-taxonomy-bridge.mjs';
import { visibilityForBusinessMode, sellerFormRules, duplicateTemplate, DRAFT_FIELDS, draftKey, draftHasContent } from '../../shared/product-listing-core.mjs';

/* [REPAIR 2026-10 B-15] Products now store the canonical category id (e.g.
   "CAT-11"); buyers saw that raw id on the product page. Display-only lookup:
   id -> seller-facing label from the same registry the form uses. */
window.skhCategoryLabel = function (v) {
    try {
        const s = String(v == null ? '' : v); if (!/^CAT-\d+$/.test(s)) return s;
        const o = getSellerCategoryOptions(skh.advancedCategories || {}).find(x => x && x.value === s);
        return (o && o.label) || s;
    } catch (e) { return String(v == null ? '' : v); }
};

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

    // CANONICAL FIRST. The visible list now comes from the canonical taxonomy registry
    // through the existing bridge, instead of iterating the legacy skh.advancedCategories
    // map directly. Legacy-only categories are still offered, in their own group, so old
    // routes and saved products keep working. Nothing is deleted or reclassified.
    const options = getSellerCategoryOptions(skh.advancedCategories || {});
    const esc = function (v) { try { return skh.skhEscape(String(v)); } catch (e) { return String(v); } };

    let recommendedHtml = '';
    let canonicalHtml = '';
    let legacyHtml = '';

    for (const opt of options) {
        if (recommendedCats.includes(opt.label) || recommendedCats.includes(opt.value)) {
            recommendedHtml += `<option value="${esc(opt.value)}" style="font-weight:bold; color:var(--green);">${T('suggested', 'Suggested')}: ${esc(opt.label)}</option>`;
        } else if (opt.source === 'LEGACY_COMPATIBILITY') {
            legacyHtml += `<option value="${esc(opt.value)}">${esc(opt.label)}</option>`;
        } else {
            canonicalHtml += `<option value="${esc(opt.value)}">${esc(opt.label)}</option>`;
        }
    }

    catSelect.innerHTML = `
        <option value="">${T('pf_choose_category', '-- Choose Category --')}</option>
        ${recommendedHtml ? `<optgroup label="${T('pf_recommended_for', 'Recommended for')} ${primaryProfile}">${recommendedHtml}</optgroup>` : ''}
        ${canonicalHtml ? `<optgroup label="${T('pf_other_categories', 'Other SokoHai Categories')}">${canonicalHtml}</optgroup>` : ''}
        ${legacyHtml ? `<optgroup label="${T('pf_legacy_categories', 'Legacy categories (compatibility)')}">${legacyHtml}</optgroup>` : ''} `;
};

window.generateSellerFilters = function() {
    const catVal = document.getElementById('prodCategory').value;
    const subVal = document.getElementById('prodSubCategory').value;
    const filterContainer = document.getElementById('dynamicFiltersContainer');
    const filtersArea = document.getElementById('filtersInputsArea');

    // Canonical categories (CAT-xx) are not present in the legacy map. Guard the lookup
    // so a canonical route cannot throw here; canonical filter guidance is rendered by the
    // Product Builder's own Filters section, not by this legacy filter strip.
    const legacyCat = skh.advancedCategories ? skh.advancedCategories[catVal] : null;
    const legacyLeaf = legacyCat && legacyCat.subcategories ? legacyCat.subcategories[subVal] : null;

    if(!subVal || !legacyLeaf) {
        filterContainer.style.display = 'none';
        return;
    }

    const filters = legacyLeaf.filters;
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
            // [UX 2026-10-31] defaults from the business profile + draft offer (nothing is overwritten).
            if (typeof window.skhSellerFormOpened === 'function') window.skhSellerFormOpened();
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


/* =====================================================================
 * [UX 2026-10-31] ONE seller form: defaults, progress, taxonomy search,
 * local draft, clear validation messages and "copy a previous product".
 * Same form, same ids, same save path (submitSeller). No second builder.
 * ===================================================================== */
(function () {
    const $ = id => document.getElementById(id);
    const uid = () => (skh.currentUser && skh.currentUser.uid) || 'anon';
    const store = {
        get(k) { try { return JSON.parse(window.localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
        set(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: drafts are optional */ } },
        del(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
    };
    const fire = (el, type) => el && el.dispatchEvent(new Event(type, { bubbles: true }));
    const visibleIn = el => !!el && el.getClientRects().length > 0;
    let touched = false;
    let restoring = false;

    function fieldValue(id) { const el = $(id); if (!el) return ''; return el.type === 'checkbox' ? el.checked : el.value; }
    function setField(id, v) {
        const el = $(id); if (!el || v === undefined || v === null) return;
        if (el.type === 'checkbox') { el.checked = v === true; fire(el, 'change'); return; }
        if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(v))) return;
        el.value = String(v); fire(el, 'change');
    }

    /* ---- progress: which groups are complete (required fields only) ---- */
    window.skhSellerFormProgress = function () {
        const list = $('sellerFormProgress'); if (!list) return;
        const rules = sellerFormRules(fieldValue('prodVisibility'));
        const filled = id => String(fieldValue(id) || '').trim() !== '';
        const photos = () => { const p = $('prodImagePreviews'); return !!(p && p.children.length); };
        const done = {
            channel: true,
            what: filled('prodName') && (rules.taxonomy !== 'required' || filled('prodCategory')),
            price: filled('prodPrice') && filled('prodStock'),
            online: filled('prodDesc') && photos(),
            location: filled('prodLocation')
        };
        list.querySelectorAll('li').forEach(li => {
            const ok = !!done[li.dataset.group];
            li.style.cssText = 'padding:4px 8px; border-radius:999px; border:1px solid ' + (ok ? '#18A982' : '#cbd5e1') + '; background:' + (ok ? '#EAF8F2' : '#fff') + '; color:' + (ok ? '#0f6e55' : '#475569') + ';' + (rules.groups[li.dataset.group] ? '' : 'display:none;');
            li.setAttribute('aria-label', li.textContent.replace(/^\s*✓\s*/, '') + (ok ? ' (imekamilika)' : ' (bado)'));
            li.textContent = (ok ? '✓ ' : '') + li.textContent.replace(/^✓\s*/, '');
        });
    };

    /* ---- inline messages; never clears what the seller typed ---- */
    window.skhSellerFieldIssue = function (missing) {
        document.querySelectorAll('#sellerForm .sf-issue').forEach(n => n.remove());
        (missing || []).forEach(([id, label]) => {
            const el = $(id); if (!el) return;
            const msg = document.createElement('small');
            msg.className = 'sf-issue'; msg.setAttribute('role', 'alert');
            msg.style.cssText = 'display:block; color:#b91c1c; font-size:12px; margin:4px 0 8px;';
            msg.textContent = 'Jaza ' + label + '.';
            el.insertAdjacentElement('afterend', msg);
            el.setAttribute('aria-invalid', 'true');
        });
        const first = missing && missing[0] && $(missing[0][0]);
        if (first) { first.scrollIntoView({ block: 'center' }); try { first.focus({ preventScroll: true }); } catch (e) {} }
    };

    /* ---- local draft (per seller, this device only) ---- */
    function saveDraft() {
        if (restoring) return;
        const fields = {}; DRAFT_FIELDS.forEach(id => { if ($(id)) fields[id] = fieldValue(id); });
        const draft = { v: 1, savedAt: new Date().toISOString(), fields };
        if (draftHasContent(draft)) store.set(draftKey(uid()), draft);
    }
    let saveTimer = null;
    function scheduleSave() { if (restoring) return; touched = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 600); }
    function restoreDraft(draft) {
        restoring = true;
        const f = draft.fields || {};
        setField('prodVisibility', f.prodVisibility);
        if (f.prodCategory) { setField('prodCategory', f.prodCategory); if (window.updateFormSubcats) window.updateFormSubcats(); }
        DRAFT_FIELDS.filter(id => id !== 'prodVisibility' && id !== 'prodCategory').forEach(id => setField(id, f[id]));
        restoring = false; touched = true;
        if (window.toggleProductFormFields) window.toggleProductFormFields();
        window.skhSellerFormProgress();
    }
    window.skhSellerAfterSave = function ({ location } = {}) {
        store.del(draftKey(uid()));
        if (location) store.set('skh_last_location_' + uid(), String(location).slice(0, 160));
        touched = false;
        if ($('sellerCopyBanner')) $('sellerCopyBanner').hidden = true;
    };

    /* ---- defaults when the form opens ---- */
    window.skhSellerFormOpened = function () {
        const form = $('sellerForm'); if (!form) return;
        const profile = skh.currentUserData || {};
        const draft = store.get(draftKey(uid()));
        const banner = $('sellerDraftBanner');
        const wasTouched = touched;
        restoring = true; // defaults are not seller edits
        if (!touched) {
            // Sales mode default = the business mode (each product can still differ).
            setField('prodVisibility', visibilityForBusinessMode(profile));
            // Location default = store address, else the last location this seller used.
            const loc = $('prodLocation');
            if (loc && !loc.value.trim()) {
                const fromStore = String(profile.storeAddress || '').trim();
                const last = store.get('skh_last_location_' + uid());
                const v = fromStore || last || '';
                if (v) { loc.value = v; if ($('prodLocationHint')) $('prodLocationHint').textContent = fromStore ? 'Imejazwa kutoka anwani ya duka lako. Unaweza kubadilisha.' : 'Imejazwa kutoka bidhaa yako iliyopita. Unaweza kubadilisha.'; }
            }
        }
        restoring = false;
        if (banner) {
            const offer = draft && draftHasContent(draft) && !wasTouched;
            banner.hidden = !offer;
            if (offer && $('sellerDraftText')) $('sellerDraftText').textContent = 'Una rasimu ya "' + (draft.fields.prodName || 'bidhaa') + '" uliyoianza ' + new Date(draft.savedAt).toLocaleString() + '.';
        }
        if (window.toggleProductFormFields) window.toggleProductFormFields();
        window.skhSellerFormProgress();
    };

    /* ---- search-first taxonomy (canonical list + legacy compatibility, same as the selects) ---- */
    const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    function taxonomyIndex() {
        const out = [];
        const cats = getSellerCategoryOptions(skh.advancedCategories || {});
        cats.forEach(c => {
            out.push({ cat: c.value, catLabel: c.label, leaf: '', text: norm(c.label + ' ' + c.value) });
            getSellerSubcategories(c.value, skh.advancedCategories || {}).forEach(leaf => out.push({ cat: c.value, catLabel: c.label, leaf, text: norm(leaf + ' ' + c.label) }));
        });
        return out;
    }
    let index = null;
    window.skhSellerTaxonomySearch = function (q) {
        const box = $('prodTaxonomyResults'); if (!box) return [];
        const words = norm(q).split(/\s+/).filter(Boolean);
        if (!words.length) { box.innerHTML = ''; return []; }
        index = index || taxonomyIndex();
        const hits = index.filter(r => words.every(w => r.text.includes(w)))
            .sort((a, b) => (a.leaf ? 0 : 1) - (b.leaf ? 0 : 1)).slice(0, 8);
        const esc = v => String(v).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
        box.innerHTML = hits.length ? hits.map((h, i) => `<button type="button" role="option" data-tx="${i}" style="text-align:left; padding:10px 12px; border-radius:10px; border:1px solid #cbd5e1; background:white; cursor:pointer;">${esc(h.leaf || h.catLabel)}${h.leaf ? ` <small style="color:#64748b;">· ${esc(h.catLabel)}</small>` : ''}</button>`).join('')
            : '<small style="color:#64748b;">Hakuna kinacholingana. Chagua kwenye orodha hapa chini au tumia "Nyingine".</small>';
        box.querySelectorAll('[data-tx]').forEach(btn => btn.addEventListener('click', () => {
            const h = hits[Number(btn.dataset.tx)];
            setField('prodCategory', h.cat); if (window.updateFormSubcats) window.updateFormSubcats();
            if (h.leaf) setField('prodSubCategory', h.leaf);
            box.innerHTML = `<small style="color:#0f6e55;">Umechagua: ${esc(h.catLabel)}${h.leaf ? ' › ' + esc(h.leaf) : ''}</small>`;
            $('prodTaxonomySearch').value = '';
            window.skhSellerFormProgress(); scheduleSave();
        }));
        return hits;
    };

    /* ---- copy a previous product (settings only; never identity, stock or photos) ---- */
    window.skhDuplicateProduct = async function (productId) {
        const snap = await skh.getDoc(skh.doc(skh.db, 'products', String(productId)));
        if (!snap.exists()) { alert('Bidhaa haipatikani.'); return; }
        const t = duplicateTemplate(Object.assign({ id: snap.id }, snap.data()));
        if (window.showForm) window.showForm('sellerForm');
        if (typeof window.skhProductBuilderReset === 'function') window.skhProductBuilderReset();
        restoring = true;
        setField('prodVisibility', t.visibility);
        if (window.toggleProductFormFields) window.toggleProductFormFields();
        setField('prodName', t.title || t.name || '');
        if (t.category) { setField('prodCategory', t.category); if (window.updateFormSubcats) window.updateFormSubcats(); setField('prodSubCategory', t.subCategory || t.subcategory); }
        if (t.offlineCategory) setField('prodOfflineCategory', t.offlineCategory);
        setField('prodProductType', t.productType); setField('prodCondition', t.condition);
        setField('prodBaseUnit', t.baseUnit); setField('prodHasBulk', t.hasBulkPackaging === true);
        setField('prodBulkUnit', t.bulkUnit); setField('prodConversionRatio', t.conversionRatio);
        setField('prodPrice', t.price); setField('prodBuyPrice', t.buyPrice); setField('prodWholesalePrice', t.wholesalePrice);
        setField('prodLowStockAlert', t.lowStockAlert != null ? t.lowStockAlert : t.lowStockThreshold);
        setField('prodSaleMode', t.saleMode); setField('prodDesc', t.description);
        setField('prodLocation', t.location); setField('prodWarehouseZone', t.warehouseZone);
        setField('prodStock', 0); setField('prodBarcode', ''); setField('spbProductSku', '');
        restoring = false; touched = true;
        if (window.skhProductBuilder && typeof window.skhProductBuilder.prefill === 'function') window.skhProductBuilder.prefill(t);
        const cb = $('sellerCopyBanner');
        if (cb) { cb.hidden = false; cb.textContent = 'Umenakili mipangilio ya "' + (snap.data().title || 'bidhaa') + '". SKU, barcode, stock, picha na variants zake HAZIJANAKILIWA: weka za bidhaa hii mpya.'; }
        window.skhSellerFormProgress();
        return t;
    };

    function bind() {
        const form = $('sellerForm'); if (!form || form.dataset.uxBound) return;
        form.dataset.uxBound = '1';
        form.addEventListener('input', e => { if (e.target && e.target.id === 'prodTaxonomySearch') return; e.target && e.target.removeAttribute && e.target.removeAttribute('aria-invalid'); const n = e.target && e.target.nextElementSibling; if (n && n.classList && n.classList.contains('sf-issue')) n.remove(); scheduleSave(); window.skhSellerFormProgress(); });
        form.addEventListener('change', () => { if (restoring) return; scheduleSave(); window.skhSellerFormProgress(); });
        form.addEventListener('reset', () => { touched = false; });
        // Native validation on a hidden/collapsed field: open its group and show our message instead of a silent block.
        form.addEventListener('invalid', e => { const d = e.target.closest('details'); if (d) d.open = true; }, true);
        // [POS 2026-11-01] measured units (kg, litre, metre) accept decimal stock.
        $('prodBaseUnit')?.addEventListener('change', () => { const qc = globalThis.SKHQuantityCore; const p = qc ? qc.precisionForUnit(fieldValue('prodBaseUnit')) : 0; const st = $('prodStock'); if (st) st.step = p ? String(1 / Math.pow(10, p)) : '1'; });
        let t = null;
        $('prodTaxonomySearch')?.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => window.skhSellerTaxonomySearch(e.target.value), 150); });
        $('sellerDraftRestore')?.addEventListener('click', () => { const d = store.get(draftKey(uid())); if (d) restoreDraft(d); $('sellerDraftBanner').hidden = true; });
        $('sellerDraftDiscard')?.addEventListener('click', () => { store.del(draftKey(uid())); $('sellerDraftBanner').hidden = true; });
    }
    window.skhSellerDraftForTest = { save: saveDraft, key: () => draftKey(uid()), read: () => store.get(draftKey(uid())) };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();

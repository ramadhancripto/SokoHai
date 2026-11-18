/* ==== js/app/08-app-state.js ==== */
import { skh } from './00-bootstrap.js';
// Canonical taxonomy is the authority for the visible seller subcategory list.
// Existing skh.advancedCategories is still passed in, unchanged, for compatibility.
import { getSellerSubcategories } from '../../shared/product-taxonomy-bridge.mjs';
import { channelsFromVisibility } from '../../shared/product-listing-core.mjs';
import '../../shared/quantity-core.js'; // [POS 2026-11-01] sets globalThis.SKHQuantityCore (kg/L/m decimals)

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

    // [FIX: top nav kupotea] Rudisha upau wa juu, upau wa chini na upau wa eneo
    // KABLA ya kupa buyerView/dashboardViews — ili kama yoyote yaliondokea,
    // upau haufichwi. Null-safe kila waypoint.
    const _hdr = document.querySelector('.sticky-top-section');
    const _ftr = document.querySelector('.bottom-area-wrapper');
    const _loc = document.getElementById('locationFilterBar');
    if (_hdr) _hdr.style.display = 'flex';
    if (_ftr) _ftr.style.display = 'flex';
    if (_loc) _loc.style.display = 'flex';

    // Onyesha buyerView na ficha dashboard (null-safe)
    const _bv = document.getElementById('buyerView');
    const _dv = document.getElementById('dashboardViews');
    if (_bv) _bv.style.display = 'block';
    if (_dv) _dv.style.display = 'none';

    // Kitufe cha "+" kinaonekana kwenye kurasa za mbele (Home/Bidhaa/Huduma/Usafirishaji)
    window.setSellFab(true);

    // 2. Weka Rangi ya Active kwenye Tab ya chini
    document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.removeAttribute('aria-current'); });
    {
        // [NAV 2026-11-13] tab ya mode ndiyo active hata ikiitwa bila `el` (Back/Forward)
        const tabIdMap = { 'home': 'navTabHome', 'bidhaa': 'navTabBidhaa', 'services': 'navTabHuduma', 'delivery': 'navTabDelivery' };
        const tabEl = (el && el.classList && el.classList.contains('nav-tab')) ? el : (tabIdMap[mode] ? document.getElementById(tabIdMap[mode]) : null);
        if (tabEl) { tabEl.classList.add('active'); tabEl.setAttribute('aria-current', 'page'); }
    }
    
    // 3. Badili aina ya vitu vinavyoonekana (Collection)
    const mappedData = skh.navMap[mode];
    skh.currentFeedCollection = mappedData ? mappedData.dbCollection : 'products';
    if (typeof window.skhCategoryStripSync === 'function') window.skhCategoryStripSync(); // [R5] immediate, not on the next poll
    
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
    try { skh.loadMainFeed(skh.currentFeedCollection); } catch(e) {
        console.warn('[updateApp] loadMainFeed imeshindikana:', e && e.message);
    }
    
    // Funga fomu yoyote au modal iliyokuwa wazi
    /* [NAV 2026-11-13] Tab ni ukurasa mpya: funga KILA overlay. Zamani `closeModals()`
       (iliyofunikwa na 56-nav-back) ilifunga HATUA MOJA tu ya rundo — ukiwa na chat juu
       ya bidhaa na ukabonyeza Huduma, chat/bidhaa ilibaki juu ya ukurasa wa Huduma
       mpaka ubonyeze Back. Live inayoendelea inahamia mini-player (haifi). */
    try {
        const lvRoom = document.getElementById('lvxRoom');
        if (lvRoom && !lvRoom.hidden && !document.getElementById('lvxMini') && typeof window.skhLiveMinimize === 'function') window.skhLiveMinimize();
    } catch (e) {}
    if (window.skhNavClosing) window.skhNavClosing(true);
    try { closeModals(true); } finally { if (window.skhNavClosing) window.skhNavClosing(false); }
    if (typeof window.skhNavTab === 'function') window.skhNavTab(mode);
    if (!(window.skhNavRestoring && window.skhNavRestoring())) window.scrollTo({top: 0, behavior: 'auto'});
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
            const cred = await skh.signInWithEmailAndPassword(skh.auth, e, p); 
            // [OFFLINE 2026-09] Kumbuka email — akipoteza session, isimwombe tena.
            try { skh.localStorage.setItem('sokohai_last_email', e); } catch (e2) {}
            closeModals(); 
            const user = cred.user;
            const displayName = user?.displayName || (e.indexOf('@') > 0 ? e.split('@')[0] : 'Mwanachama');
            setTimeout(function() {
                if (typeof window.skhShowWelcomeAlert === 'function') {
                    window.skhShowWelcomeAlert(displayName);
                }
            }, 300);
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
        
        // [OFFLINE 2026-09] Kumbuka email ya usajili kwa kuingia baadaye.
        try { skh.localStorage.setItem('sokohai_last_email', e); } catch (e2) {}
        closeModals(); 
        
        // Onyesha Welcome Alert yenye jina lake halisi mara moja baada ya signup
        setTimeout(function () {
            try {
                if (typeof window.skhShowWelcomeAlert === 'function') {
                    window.skhShowWelcomeAlert(n);
                }
            } catch (e3) { /* non-blocking */ }
        }, 300);
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
        setTimeout(function() {
            if (typeof window.skhShowWelcomeAlert === 'function') {
                window.skhShowWelcomeAlert(user.displayName);
            }
        }, 300);
        console.log("Karibu " + user.displayName);
    } catch (error) {
        alert("Kosa la Google Login: " + error.message);
    }
};

/* [R15 2026-11-13] Kurejesha akaunti.
 * - Ujumbe ni ULE ULE akaunti ikiwepo au isipokuwepo (hakuna kufichua nani ana akaunti).
 * - Makosa ya Firebase yanatafsiriwa; hakuna maandishi ghafi ya mfumo.
 * - Ombi moja kwa dakika kwa kifaa hiki (Firebase pia ina kikomo chake upande wa server).
 * - Link ya barua pepe ikielekezwa kwenye app (mode=resetPassword&oobCode=...), mtumiaji
 *   anaweka nenosiri jipya hapa hapa (verifyPasswordResetCode + confirmPasswordReset). */
window.doResetPassword = async function() {
    const email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
    if (!email) { alert("Andika barua pepe yako kwanza kwenye kisanduku cha 'Barua Pepe', kisha ubofye tena hapa."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { alert("Barua pepe hii si sahihi. Iangalie tena."); return; }
    let last = 0; try { last = Number(localStorage.getItem('skh_reset_at') || 0); } catch (e) {}
    if (Date.now() - last < 60000) { alert("Subiri dakika moja kabla ya kuomba tena."); return; }
    const btn = document.getElementById('btnResetPass');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = " Inatuma..."; btn.disabled = true; }
    const neutral = "Kama akaunti yenye barua pepe hii ipo, tumetuma link ya kubadili nenosiri.\n\nKagua Inbox na Spam. Link inaisha muda baada ya saa 1.";
    try {
        await skh.sendPasswordResetEmail(skh.auth, email);
        try { localStorage.setItem('skh_reset_at', String(Date.now())); } catch (e) {}
        alert(neutral);
    } catch (error) {
        const c = String((error && error.code) || '');
        if (c === 'auth/user-not-found') { try { localStorage.setItem('skh_reset_at', String(Date.now())); } catch (e) {} alert(neutral); }
        else if (c === 'auth/invalid-email') alert("Barua pepe hii si sahihi. Iangalie tena.");
        else if (c === 'auth/too-many-requests') alert("Maombi mengi mno kwa sasa. Jaribu tena baadaye.");
        else if (c === 'auth/network-request-failed') alert("Hakuna mtandao. Angalia intaneti kisha ujaribu tena.");
        else { try { console.warn('[reset]', c, error && error.message); } catch (e) {} alert("Imeshindikana kutuma link kwa sasa. Jaribu tena baadaye."); }
    } finally {
        if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
    }
};

/* [R15] link ya kubadili nenosiri ndani ya app */
function skhResetErr(e) {
    const c = String((e && e.code) || '');
    if (c === 'auth/expired-action-code') return 'Link hii imeisha muda. Omba link mpya.';
    if (c === 'auth/invalid-action-code') return 'Link hii si sahihi au imeshatumika. Omba link mpya.';
    if (c === 'auth/weak-password') return 'Nenosiri ni dhaifu: tumia angalau herufi 8.';
    if (c === 'auth/network-request-failed') return 'Hakuna mtandao. Jaribu tena.';
    return 'Imeshindikana. Jaribu tena au omba link mpya.';
}
window.skhOpenPasswordReset = async function (oobCode) {
    let box = document.getElementById('skhResetPass');
    if (!box) { box = document.createElement('div'); box.id = 'skhResetPass'; document.body.appendChild(box); }
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(9,32,26,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    const card = (inner) => '<div role="dialog" aria-modal="true" aria-labelledby="skhRpT" style="background:#fff;border-radius:18px;padding:22px;width:min(400px,100%);font-family:Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.25);">' + inner + '</div>';
    box.innerHTML = card('<p style="margin:0;color:#475569;">Inakagua link…</p>');
    let email = '';
    try { email = await skh.verifyPasswordResetCode(skh.auth, oobCode); }
    catch (e) { box.innerHTML = card('<h3 id="skhRpT" style="margin:0 0 8px;color:#13231e;">Badili nenosiri</h3><p id="skhRpMsg" style="color:#b91c1c;margin:0 0 14px;">' + skhResetErr(e) + '</p><button type="button" onclick="document.getElementById(\'skhResetPass\').remove()" style="border:0;border-radius:999px;background:#e2e8f0;padding:10px 18px;font-weight:700;cursor:pointer;">Funga</button>'); return; }
    const masked = email.replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => a + '*'.repeat(Math.min(6, b.length)) + c);
    box.innerHTML = card('<h3 id="skhRpT" style="margin:0 0 6px;color:#13231e;">Weka nenosiri jipya</h3>'
        + '<p style="margin:0 0 14px;color:#475569;font-size:14px;">Akaunti: <b>' + masked + '</b></p>'
        + '<input id="skhRpP1" type="password" autocomplete="new-password" placeholder="Nenosiri jipya (herufi 8+)" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:12px;margin-bottom:10px;font-size:15px;">'
        + '<input id="skhRpP2" type="password" autocomplete="new-password" placeholder="Rudia nenosiri" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:12px;margin-bottom:10px;font-size:15px;">'
        + '<p id="skhRpMsg" role="alert" style="min-height:18px;margin:0 0 10px;color:#b91c1c;font-size:13px;"></p>'
        + '<button type="button" id="skhRpGo" style="width:100%;border:0;border-radius:999px;background:#12946f;color:#fff;padding:13px;font-weight:800;font-size:15px;cursor:pointer;">Hifadhi nenosiri</button>');
    document.getElementById('skhRpGo').onclick = async function () {
        const p1 = document.getElementById('skhRpP1').value, p2 = document.getElementById('skhRpP2').value, msg = document.getElementById('skhRpMsg');
        if (p1.length < 8) { msg.textContent = 'Nenosiri lazima liwe na angalau herufi 8.'; return; }
        if (p1 !== p2) { msg.textContent = 'Manenosiri hayafanani.'; return; }
        this.disabled = true; this.textContent = 'Inahifadhi…';
        try {
            await skh.confirmPasswordReset(skh.auth, oobCode, p1);
            try { history.replaceState(null, '', location.pathname); } catch (e) {}
            box.innerHTML = card('<h3 id="skhRpT" style="margin:0 0 8px;color:#12946f;">Nenosiri limebadilishwa</h3><p style="margin:0 0 14px;color:#475569;">Ingia sasa kwa nenosiri jipya.</p><button type="button" id="skhRpDone" onclick="document.getElementById(\'skhResetPass\').remove();window.openAuthModal&&openAuthModal()" style="border:0;border-radius:999px;background:#12946f;color:#fff;padding:11px 20px;font-weight:800;cursor:pointer;">Ingia</button>');
        } catch (e) { this.disabled = false; this.textContent = 'Hifadhi nenosiri'; msg.textContent = skhResetErr(e); }
    };
};
(function () {
    try {
        const q = new URLSearchParams(location.search);
        if (q.get('mode') === 'resetPassword' && q.get('oobCode')) {
            const go = () => window.skhOpenPasswordReset(q.get('oobCode'));
            if (document.readyState === 'complete') setTimeout(go, 300); else window.addEventListener('load', () => setTimeout(go, 300));
        }
    } catch (e) {}
})();

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

    // Canonical categories (CAT-xx) are not keys of the legacy map, so only bail when the
    // category is empty. Canonical routes must reach the subcategory list below.
    if(!catVal) {
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

    // CANONICAL FIRST: canonical product leaves lead, legacy-only leaves follow for
    // backward compatibility. getSellerSubcategories dedupes, so a canonical route always
    // wins over an identically named legacy route. skh.advancedCategories is unchanged.
    const subcats = getSellerSubcategories(catVal, skh.advancedCategories || {});
    subSelect.innerHTML = `<option value="">-- Chagua Aina ya Bidhaa --</option>` + 
                          subcats.map(s => `<option value="${s}">${s}</option>`).join('');

    if(subContainer) subContainer.style.display = subcats.length ? 'block' : 'none';
    document.getElementById('dynamicFiltersContainer').style.display = 'none';
};

window.submitSeller = async function(event) {
    if(event) event.preventDefault();
    if(!skh.requireAuth()) return;
    
    const btn = document.getElementById('btnSeller');
    const visibility = document.getElementById('prodVisibility').value;
    
    const title = document.getElementById('prodName').value.trim();
   
// [2026-11-06] Only keep the picked product type if the seller did not change the
// category/branch afterwards (ids are branch-scoped: PT-<cat>-<BRANCH_LABEL>).
function skhTaxonomyProductType(category, subCategory) {
    const idEl = document.getElementById('prodTaxonomyProductTypeId');
    const lbEl = document.getElementById('prodTaxonomyProductTypeLabel');
    const id = idEl ? idEl.value : '', label = lbEl ? lbEl.value : '';
    if (!id || !label || !subCategory || subCategory === 'N/A') return {};
    const slug = String(subCategory + '-' + label).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
    if (!id.endsWith('-' + slug)) return {};
    return { productTypeId: id, productTypeLabel: label };
}
// Baini kategoria sahihi kulingana na offline au online
let category = "";
let subCategory = "";

if (visibility === 'offline_only' || visibility === 'manage_only') {
    // [UX 2026-10-31] Taxonomy works for POS/stock too: a chosen category is kept;
    // without one, the free-text local group (or "Mchanganyiko") is used as before.
    const chosenCat = document.getElementById('prodCategory') ? document.getElementById('prodCategory').value : '';
    const chosenSub = document.getElementById('prodSubCategory') ? document.getElementById('prodSubCategory').value : '';
    const offlineInp = document.getElementById('prodOfflineCategory');
    if (chosenCat) {
        category = chosenCat;
        subCategory = chosenSub || "N/A";
    } else {
        category = (offlineInp && offlineInp.value.trim() !== '') ? offlineInp.value.trim() : "Mchanganyiko";
        subCategory = "N/A"; // Duka la ndani halihitaji sub-category ngumu
    }
} else {
    category = document.getElementById('prodCategory').value;
    subCategory = document.getElementById('prodSubCategory') ? document.getElementById('prodSubCategory').value : "";
}
    const buyPrice = parseFloat(document.getElementById('prodBuyPrice').value) || 0;
    const price = parseFloat(document.getElementById('prodPrice').value) || 0;
    const barcode = document.getElementById('prodBarcode').value.trim();
    const loc = document.getElementById('prodLocation').value.trim();
    const productType = document.getElementById('prodProductType')?.value || 'physical';
    const publicationStatus = document.getElementById('prodPublicationStatus')?.value || 'published';
    const availabilityStatus = document.getElementById('prodAvailabilityStatus')?.value || 'available';
    const condition = document.getElementById('prodCondition')?.value || (productType === 'digital' ? 'not_applicable' : 'new');
    const variants = skh.normalizeProductVariants(document.getElementById('prodVariants')?.value || '');
if(!title || price <= 0 || (productType !== 'digital' && !loc) || (visibility !== 'offline_only' && visibility !== 'manage_only' && !category)) {
    // [UX 2026-10-31] Say exactly what is missing and go there; nothing typed is cleared.
    const missing = [];
    if (!title) missing.push(['prodName', 'jina la bidhaa']);
    if (price <= 0) missing.push(['prodPrice', 'bei ya kuuza']);
    if (visibility !== 'offline_only' && visibility !== 'manage_only' && !category) missing.push(['prodCategory', 'kategoria (lazima kwa soko)']);
    if (productType !== 'digital' && !loc) missing.push(['prodLocation', 'mahali bidhaa ilipo']);
    if (typeof window.skhSellerFieldIssue === 'function') window.skhSellerFieldIssue(missing);
    else alert("Jaza: " + missing.map(m => m[1]).join(', ') + ".");
    return;
}
    // --- QUANTITY & UNIT CONVERSION CALCULATION ---
    const baseUnit = document.getElementById('prodBaseUnit').value;
    const hasBulk = document.getElementById('prodHasBulk').checked;
    
    // [POS 2026-11-01] kg / litre / metre products keep decimals (e.g. 12.5 kg); others stay whole units.
    const QC = globalThis.SKHQuantityCore;
    const quantityPrecision = QC ? QC.precisionForUnit(baseUnit) : 0;
    const stockRaw = Number(document.getElementById('prodStock').value);
    let rawQtyEntered = quantityPrecision && QC.isValidQuantity(stockRaw, quantityPrecision, { allowZero: true })
        ? stockRaw : (parseInt(document.getElementById('prodStock').value) || 1);
    let finalCalculatedStock = rawQtyEntered;
    let bulkUnit = "";
    let conversionRatio = 1;
    let wholesalePrice = 0;

    if (hasBulk) {
        bulkUnit = document.getElementById('prodBulkUnit').value;
        conversionRatio = parseInt(document.getElementById('prodConversionRatio').value) || 12;
        wholesalePrice = parseFloat(document.getElementById('prodWholesalePrice').value) || 0;
        
        // Piga Hesabu Kiotomatiki: Vipande vyote vya stoo kuu
        finalCalculatedStock = quantityPrecision ? QC.mulInt(rawQtyEntered, conversionRatio, quantityPrecision) : rawQtyEntered * conversionRatio;
    }

    // --- DYNAMIC INTEL FIELDS CAPTURING ---
    let expiryDate = document.getElementById('prodExpiryDate')?.value || "";
    let batchNumber = document.getElementById('prodBatchNumber')?.value.trim() || "";
    let imeiNumbers = document.getElementById('prodImeiNumbers')?.value.trim() || "";

    let saleMode = 'free_market';
    let itemFilters = {};
    let modeData = {};
    let imageUrls = [];

    if (visibility !== 'offline_only' && visibility !== 'manage_only') {
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
            // [R13-B] hiari: muda wa kuanza + nyongeza ya chini (auctionPlaceBid inazitekeleza server-side)
            const aucStartStr = (document.getElementById('aucStartTime') || {}).value || '';
            const aucStartMs = aucStartStr ? new Date(aucStartStr).getTime() : 0;
            if (aucStartMs && aucStartMs >= modeData.endTime) { alert("Muda wa mnada kuanza lazima uwe kabla ya muda wa kuisha."); return; }
            if (aucStartMs > nowMs) modeData.startTime = aucStartMs;
            const aucInc = Math.round(parseFloat((document.getElementById('aucMinIncrement') || {}).value) || 0);
            if (aucInc > 0) modeData.minIncrement = aucInc;
            /* [R14] campaign checks + preview before saving (server still enforces bids/locks) */
            if (!(modeData.endTime > nowMs + 5 * 60000)) { alert("Muda wa mnada kuisha lazima uwe angalau dakika 5 kuanzia sasa."); return; }
            if (!(price > 0)) { alert("Weka bei ya kuanzia ya mnada."); return; }
            if (aucInc > 0 && aucInc >= price) { alert("Nyongeza ya chini ya zabuni lazima iwe ndogo kuliko bei ya kuanzia."); return; }
            const fmt = (ms) => new Date(ms).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            if (!window.confirm('THIBITISHA MNADA\n\nBei ya kuanzia: TSh ' + Number(price).toLocaleString() + '\nNyongeza ya chini: ' + (aucInc > 0 ? 'TSh ' + aucInc.toLocaleString() : '5% ya zabuni ya juu')
                + '\nUnaanza: ' + (modeData.startTime ? fmt(modeData.startTime) : 'sasa hivi') + '\nUnaisha: ' + fmt(modeData.endTime)
                + '\n\nZabuni ya kwanza ikiwekwa, masharti haya hayawezi kubadilishwa; unaweza kughairi kabla ya zabuni ya kwanza tu.')) return;
        } 
        else if (saleMode === 'price_drop') {
            const minPrice = parseFloat(document.getElementById('pdMinPrice').value);
            const intervalMs = parseInt(document.getElementById('pdIntervalType').value);
            const endStr = document.getElementById('pdEndTime').value;
            if(!minPrice || !endStr) { alert("Weka Bei ya Mwisho na Muda wa Deal kuisha."); return; }
            
            const endMs = new Date(endStr).getTime();
            // [R13-B] hiari: ofa ianze baadaye; kikomo kwa mnunuzi (modeQuantityLimit server-side)
            const pdStartStr = (document.getElementById('pdStartTime') || {}).value || '';
            const pdStartMs = pdStartStr ? new Date(pdStartStr).getTime() : 0;
            if (pdStartMs && pdStartMs >= endMs) { alert("Ofa lazima ianze kabla ya muda wa kuisha."); return; }
            const startMs = pdStartMs > nowMs ? pdStartMs : nowMs;
            const totalDurationMs = endMs - startMs;
            const totalIntervals = Math.floor(totalDurationMs / intervalMs);
            const dropAmt = totalIntervals > 0 ? ((price - minPrice) / totalIntervals) : 0;

            modeData = { minPrice: minPrice, intervalMs: intervalMs, dropAmount: dropAmt, endTime: endMs, startTime: startMs };
            const pdMax = parseInt((document.getElementById('pdMaxPerBuyer') || {}).value, 10);
            if (pdMax > 0) modeData.maxPerBuyer = pdMax;
            /* [R14] campaign checks + preview before saving */
            if (!(minPrice > 0 && minPrice < price)) { alert("Bei ya mwisho lazima iwe kubwa kuliko 0 na ndogo kuliko bei ya kuanzia."); return; }
            if (!(endMs > nowMs + 5 * 60000) || totalIntervals < 1) { alert("Muda wa ofa ni mfupi mno: lazima upite angalau kipindi kimoja cha kushuka bei."); return; }
            const fmtP = (ms) => new Date(ms).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            if (!window.confirm('THIBITISHA BEI KUSHUKA\n\nBei ya kuanzia: TSh ' + Number(price).toLocaleString() + '\nBei ya mwisho: TSh ' + Number(minPrice).toLocaleString()
                + '\nInashuka: TSh ' + Math.round(dropAmt).toLocaleString() + ' kila dakika ' + Math.round(intervalMs / 60000)
                + '\nInaanza: ' + fmtP(startMs) + '\nInaisha: ' + fmtP(endMs) + (pdMax > 0 ? '\nKikomo kwa mnunuzi: ' + pdMax : '')
                + '\n\nWanunuzi wakiweka bei zao, masharti haya hayawezi kubadilishwa.')) return;
        } 
        else if (saleMode === 'wholesale') {
            const discVal = parseFloat(document.getElementById('wsDiscount').value);
            const discType = document.getElementById('wsDiscountType').value;
            // [2026-11-06] Punguzo linahitajika tu kama hakuna tiers (tiers ndizo bei halisi).
            const hasTierText = !!(document.getElementById('wsTiersText') && document.getElementById('wsTiersText').value.trim());
            if(!discVal && !hasTierText) { alert("Weka kiasi cha punguzo kwa Wholesale, au tiers za bei (mf. 5:22000; 20:19000)."); return; }
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
            // [2026-11-06] Tiers lazima ziwe ngazi halali (idadi inapanda, bei haipandi, chini ya rejareja).
            const tierMsg = window.skhWsTierIssues ? window.skhWsTierIssues(parseFloat(document.getElementById('prodPrice').value) || 0, tiers) : '';
            if (tierMsg) { alert(tierMsg); return; }
            modeData = { discountValue: discVal || 0, discountType: discType, minQty: minQty, tiers: tiers }; 
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

    // Product media: picha ya msingi ni lazima; nyingine ni hiari.
    // [REPAIR 2026-11-01] Upload outcome is now reported truthfully:
    // before this, ANY failure (network down, not signed in, Cloudinary refused
    // the preset) collapsed into the same "Weka angalau picha 1" alert, which
    // told the seller the wrong thing and hid the real cause.
    skh.setLoading('btnSeller', true, ' INAPANDISHA PICHA...');
    if (typeof window.sokohaiToast === 'function') {
        window.sokohaiToast('Inapanda picha… subiri kidogo.', 'info', 3000);
    }
    var uploadOutcome = { urls: [], attempted: 0, failed: [] };
    try {
        if (typeof window.skhUploadPickedDetailed === 'function') {
            uploadOutcome = await window.skhUploadPickedDetailed('prodImage', 6);
            imageUrls = uploadOutcome.urls || [];
        } else {
            imageUrls = await window.skhUploadPicked('prodImage', 6);
            uploadOutcome.attempted = (imageUrls || []).length;
        }
    } catch (e) {
        console.warn('[5.7] upload ya picha imeshindikana:', e && e.message);
        imageUrls = [];
        uploadOutcome = { urls: [], attempted: 0, failed: [{ name: '-', error: (e && e.message) || 'kosa lisilojulikana' }] };
    }

    // [UX 2026-10-31] A photo is required to SELL ONLINE. Dukani-tu / kusimamia-tu products
    // (POS, stock) may be saved without one; a photo can be added later in Edit.
    const photoRequired = !(visibility === 'offline_only' || visibility === 'manage_only');
    if (!imageUrls) imageUrls = [];
    if (photoRequired && imageUrls.length < 1) {
        skh.setLoading('btnSeller', false, ' CHAPISHA BIDHAA SOKONI');
        window.skhUpdateSellerSubmitLabel();
        var pickerCount = (typeof window.skhPhotoPickerFiles === 'function') ? window.skhPhotoPickerFiles('prodImage').length : 0;
        var firstErr = uploadOutcome.failed && uploadOutcome.failed[0];
        if (uploadOutcome.failed && uploadOutcome.failed.length) {
            window.alert('Picha haikupandishwa.\n\nSababu: ' + (firstErr.error || 'kosa la mtandao') +
                '\n\nBidhaa yako bado ipo kwenye fomu — jaribu tena bila kuandika upya.');
        } else if (!pickerCount) {
            window.alert('Weka angalau picha 1 ya bidhaa.\n\nBonyeza "Chagua kutoka galari" au "Piga picha".');
        } else {
            window.alert('Picha ulizochagua hazikupandishwa. Hakikisha una mtandao kisha ujaribu tena.');
        }
        return;
    }
    if (uploadOutcome.failed && uploadOutcome.failed.length) {
        // Partial success: publish with the photos that made it, and say so.
        try {
            window.sokohaiToast('Picha ' + uploadOutcome.failed.length + ' hazikupanda — bidhaa itatumia zilizofanikiwa.', 'warn', 5000);
        } catch (e) {}
    }

    const mainImage = imageUrls[0] || '';
    const isStoreOnly = (visibility === 'offline_only' || visibility === 'manage_only');
    if (btn) btn.innerHTML = isStoreOnly ? ' INAHIFADHI KATIKA INVENTORY...' : ' INACHAPISHA BIDHAA SOKONI...';

    //  Capture eneo la ghala/rafu ya bidhaa
    const whZone = document.getElementById('prodWarehouseZone') ? document.getElementById('prodWarehouseZone').value.trim() : "N/A";

    const structuredProduct = window.skhProductBuilderExport || {};
    const structuredFields = {};
    ['attributes','options','variantsStructured','features','additionalInfo'].forEach(function (key) {
        if (Array.isArray(structuredProduct[key]) && structuredProduct[key].length) structuredFields[key] = structuredProduct[key];
    });
    const docId = await skh.saveData('products', {
        title: title,
        price: price,
        buyPrice: buyPrice,
        category: category,
        subCategory: subCategory,
        // [2026-11-06] Canonical product type chosen via the taxonomy search (owner 01–44).
        ...skhTaxonomyProductType(category, subCategory),
        filters: itemFilters,
        ...structuredFields,
        description: (visibility !== 'offline_only') ? document.getElementById('prodDesc').value : "In-store Product",
        location: loc,
        warehouseZone: whZone, // Hifadhi eneo la rafu ghala
        coords: (skh.userLat && skh.userLon) ? { lat: skh.userLat, lon: skh.userLon } : null,
        image: mainImage,
        imagesArray: imageUrls,
        saleMode: saleMode,
        modeData: modeData,
        productType: productType,
        condition: condition,
        publicationStatus: publicationStatus,
        availabilityStatus: availabilityStatus,
        variants: variants,
        currency: 'TZS',
        // Stock starts at zero; the server creates the audited opening movement.
        stock: 0,
        reservedStock: 0,
        openingStockPending: true,
        openingStockInitialized: false,
        // Canonical Business/Store references; legacy userId remains for compatibility.
        // [FIX] businessId and storeId must be consistent: if businessId is null,
        // storeId must also be null, otherwise canonicalProductScopeValid rejects
        // the write (store.businessId != null !== product.businessId == null).
        businessId: skh.currentUserData?.businessId || null,
        storeId: (skh.currentUserData?.businessId ? skh.currentUserData?.storeId || null : null),
        barcode: barcode,

        // Baini na hifadhi alama (flags) kwa usahihi kulingana na aina 3 za visibility
isOnline: (visibility === 'online_only' || visibility === 'hybrid'),
isOffline: (visibility === 'offline_only' || visibility === 'hybrid'),
        // [PHASE 1 2026-10-31] explicit channels; 'manage_only' = inventory record only (not sold online or at POS)
        salesChannels: channelsFromVisibility(visibility) || ['marketplace', 'pos'],
        
        // Vipimo & Multi Pricing Engine Elements
        baseUnit: baseUnit,
        // [POS 2026-11-01] decimals allowed for kg / litre / metre (POS + stock authority read this)
        ...(quantityPrecision ? { quantityPrecision } : {}),
        hasBulkPackaging: hasBulk,
        bulkUnit: bulkUnit,
        conversionRatio: conversionRatio,
        wholesalePrice: wholesalePrice,
        // [2026-11-06] MOQ ya bei ya jumla sokoni (null = POS/dukani pekee).
        wholesaleMinQty: (wholesalePrice > 0 && (parseInt((document.getElementById('prodWholesaleMinQty') || {}).value, 10) || 0) >= 2) ? parseInt(document.getElementById('prodWholesaleMinQty').value, 10) : null,
        rawUnitsQtyEntered: rawQtyEntered,
        
        // Expiry, Batch, na Serial / IMEI Data ya kiakili
        expiryDate: expiryDate,
        batchNumber: batchNumber,
        imeiNumbers: imeiNumbers,
        
        createdAt: new Date().toISOString()
    });
        
    if(docId) {
        /* [PUBLISH OUTBOX 2026-11-01] Mtandao ulikatika: bidhaa imehifadhiwa kwenye
           kifaa. Hatuendi kwenye `inventoryAdjust` (server haipo), tunaambatanisha
           stock ya kuanzia kwenye kipengele cha foleni ili ikamilike inaposambazwa. */
        if (typeof window.skhIsLocalId === 'function' && window.skhIsLocalId(docId)) {
            try {
                window.skhPublishOutbox.attach(docId, {
                    openingStock: Math.max(0, Number(finalCalculatedStock) || 0),
                    businessId: skh.currentUserData?.businessId || null,
                    storeId: skh.currentUserData?.storeId || null
                });
            } catch (e) { console.warn('[publish-outbox] attach:', e && e.message); }
            alert('Bidhaa yako imehifadhiwa kwenye kifaa chako.\n\n' +
                'Itachapishwa sokoni mtandao ukipatikana — huna haja ya kuandika tena.\n' +
                'Unaweza kuiona kwenye "Bidhaa Zangu" ikiwa na alama ya kusubiri.');
            if (typeof window.skhSellerAfterSave === 'function') window.skhSellerAfterSave({ location: loc });
            try { if (window.skhClearPickedPhotos && window.skhClearPickedPhotos['prodImage']) window.skhClearPickedPhotos['prodImage'](); } catch (e) {}
            const f = document.getElementById('sellerForm'); if (f) f.reset();
            if (typeof window.skhProductBuilderReset === 'function') window.skhProductBuilderReset();
            ['onlineSpecificFields','bulkPackagingFields','wholesalePriceFieldDiv','smartCategoryFieldsBox'].forEach(function (id) {
                const el = document.getElementById(id); if (el) el.style.display = 'none';
            });
            skh.setLoading('btnSeller', false, ' CHAPISHA BIDHAA SOKONI');
            window.skhUpdateSellerSubmitLabel();
            closeModals();
            if (window.skhPublishOutbox) window.skhPublishOutbox.refresh();
            loadAndRenderDashboard();
            return;
        }
        let openingStockNote = '';
        try {
            await skh.wrapCallable('inventoryAdjust')({
                productId: docId,
                delta: Math.max(0, Number(finalCalculatedStock) || 0),
                movementType: 'OPENING_BALANCE',
                source: 'PRODUCT_CREATION',
                reason: 'Initial stock at product creation',
                businessId: skh.currentUserData?.businessId || undefined,
                storeId: skh.currentUserData?.storeId || undefined,
                idempotencyKey: 'opening-' + docId
            });
        } catch (e) {
            /* [2026-11-01] Bidhaa ILIUNDWA. Zamani tulirudi nyuma na kumwambia
               mtumiaji "jaribu tena" — hiyo ilizalisha bidhaa ya PILI kila mara.
               Sasa tunamalizia mchakato na kueleza ukweli kuhusu stock. */
            console.error('[product-opening-stock]', e);
            openingStockNote = '\n\nKumbuka: stock ya kuanzia haijakamilika bado. ' +
                'Usirudie kuichapisha (ingekuwa bidhaa ya pili) — ongeza stock kupitia "Bidhaa Zangu" → Stock.';
        }
        // [REPAIR 2026-10 B-07] The builder's own authority (collect/stockRequests)
        // was never called on CREATE, so the product SKU, canonical variant
        // combinations (SKU, unit, inventory key) and their opening stock were
        // silently dropped. Persist them now that the product id exists; variant
        // opening stock goes through the audited inventoryAdjust callable.
        try {
            const pb = window.skhProductBuilder;
            if (pb && typeof pb.collect === 'function') {
                const patch = pb.collect(docId, {}) || {};
                ['stock', 'userId', 'businessId', 'storeId', 'openingStockPending', 'openingStockInitialized', 'reservedStock'].forEach(k => { delete patch[k]; });
                // [F6 2026-10-31] Variant combinations (with their stock counters) are
                // saved by the server; the browser never writes variant stock.
                const combos = patch.variantCombinations;
                delete patch.variantCombinations;
                if (Object.keys(patch).length) await skh.updateDoc(skh.doc(skh.db, 'products', docId), patch);
                if (Array.isArray(combos) && combos.length) await skh.wrapCallable('productVariantsSave')({ productId: docId, variantCombinations: combos });
                const reqs = typeof pb.stockRequests === 'function' ? pb.stockRequests(docId, true) : [];
                for (const r of reqs) {
                    await skh.wrapCallable('inventoryAdjust')(Object.assign({}, r, {
                        businessId: skh.currentUserData?.businessId || undefined,
                        storeId: skh.currentUserData?.storeId || undefined
                    }));
                }
            }
        } catch (e) {
            console.error('[product-builder-create]', e);
            alert('Bidhaa imeundwa, lakini SKU/variants hazijakamilika: ' + (e && e.message ? e.message : e) + '. Fungua Edit ukamilishe.');
        }
        const doneMsg = (isStoreOnly
            ? " Bidhaa imehifadhiwa kikamilifu kwenye Inventory ya duka!"
            : " Bidhaa imechapishwa kikamilifu kwenye Soko la Mtandaoni!") + openingStockNote;
        alert(doneMsg);
        // [UX 2026-10-31] Saved: forget the local draft, remember the location for the next product.
        if (typeof window.skhSellerAfterSave === 'function') window.skhSellerAfterSave({ location: loc });
        try { if (window.skhClearPickedPhotos && window.skhClearPickedPhotos['prodImage']) window.skhClearPickedPhotos['prodImage'](); } catch (e) {}
        document.getElementById('sellerForm').reset();
        if (typeof window.skhProductBuilderReset === 'function') window.skhProductBuilderReset();
        document.getElementById('onlineSpecificFields').style.display = 'none';
        document.getElementById('bulkPackagingFields').style.display = 'none';
        document.getElementById('wholesalePriceFieldDiv').style.display = 'none';
        if(document.getElementById('smartCategoryFieldsBox')) document.getElementById('smartCategoryFieldsBox').style.display = 'none';
        
        closeModals();
        loadAndRenderDashboard();
        /* [FIX 2026-11-17] Baada ya kuweka bidhaa, wasanii feed ya nyumbani
           ili bidhaa iwezezwe kutokaakwa mara moja kwenye soko la mtandaoni
           bila kuwa na mtu aendelee kurudi nyumbani kwa bandari. */
        try { if (typeof window.loadMainFeed === 'function') window.loadMainFeed('all'); } catch (e) {
            console.warn('[submitSeller] loadMainFeed baada ya kuweka imeshindikana:', e && e.message);
        }
    }
    // [FIX 2026-11-17] Kama saveData kurudisha null (haujakubalika na mahiri,
    // mtandao umeanguka, n.k.), subiri hapa — usiifanye reset au close modals
    // ili mtumiaji asiweze kuona fomu yalimwisha lakini bidhaa haijasukumwa.
    if(!docId) return;
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
            // [PHASE 9 B-17] skhUploadFromFile returns {url, data}; keep the link only.
            const ratingUp = await window.skhUploadFromFile(photoFile);
            uploadedPhotoUrl = (ratingUp && ratingUp.url) || "";
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
            if (typeof window.skhIsLocalId === 'function' && window.skhIsLocalId(docId)) {
                alert('Huduma yako imehifadhiwa kwenye kifaa chako.\n\nItachapishwa mtandao ukipatikana.');
                const f = document.getElementById('serviceForm'); if (f) f.reset();
                closeModals(); if (window.skhPublishOutbox) window.skhPublishOutbox.refresh();
                if (typeof loadAndRenderDashboard === 'function') loadAndRenderDashboard();
                return;
            }
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
            if (typeof window.skhIsLocalId === 'function' && window.skhIsLocalId(docId)) {
                alert('Usafiri wako umehifadhiwa kwenye kifaa chako.\n\nUtasajiliwa mtandao ukipatikana.');
                const f = document.getElementById('deliveryForm'); if (f) f.reset();
                closeModals(); if (window.skhPublishOutbox) window.skhPublishOutbox.refresh();
                if (typeof loadAndRenderDashboard === 'function') loadAndRenderDashboard();
                return;
            }
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
        // [REMEDIATION R1] contact fields go to ride_requests/{id}/private/contact.
        const rideDocRef = await skh.createRideRequest({
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

/* ============================================================================
   [BOTTOM NAV · SCROLL SLIDE · 2026-11-01]
   Upau wa chini (Home/Bidhaa/Huduma/Usafiri/Chat + kitufe cha "Uza") unajificha
   unaposhuka chini, na unarudi mara mtu anapovuta juu — kama Facebook.

   Kanuni zilizowekwa kwa makusudi:
     · mtu akiwa karibu na juu ya ukurasa (chini ya 60px) upau UNAONEKANA KILA MARA;
     · ukurasa usioweza kuscroll → upau haufichwi kamwe;
     · ukifika mwisho wa ukurasa → upau unarudi (usimzuie mtu kugusa kitu cha mwisho);
     · mabadiliko madogo (<8px) hayabadilishi hali (hakuna kutetemeka);
     · hubadilisha class pekee; nafasi ya ukurasa (padding-bottom) haibadiliki,
       kwa hiyo hakuna kuruka kwa maudhui (layout shift) wala kufunikwa kwa maandishi.
   ============================================================================ */
(function skhBottomNavAutoHide() {
    if (window.__skhBottomNavScroll) return;      // usisikize mara mbili
    window.__skhBottomNavScroll = true;

    var HIDE_AFTER = 120;       // lazima ushuke hivi kabla ya kuficha
    var TOP_ALWAYS = 60;        // karibu na juu: onyesha kila mara
    var HYSTERESIS = 8;         // puuza mienendo midogo
    var lastY = window.scrollY || 0;
    var ticking = false;
    var hidden = false;

    function wrapper() { return document.querySelector('.bottom-area-wrapper'); }

    function apply(hide) {
        var el = wrapper();
        if (!el) return;
        if (hide === hidden && el.classList.contains('nav-slide-hidden') === hide) return;
        hidden = hide;
        el.classList.toggle('nav-slide-hidden', hide);
        el.setAttribute('data-nav-hidden', hide ? '1' : '0');
    }

    function maxScroll() {
        var doc = document.documentElement;
        return Math.max(0, (doc.scrollHeight || 0) - window.innerHeight);
    }

    function evaluate() {
        ticking = false;
        var y = Math.max(0, window.scrollY || window.pageYOffset || 0);
        var limit = maxScroll();
        var delta = y - lastY;

        // hakuna mahali pa kuscroll, au tuko juu kabisa → onyesha
        if (limit <= 80 || y <= TOP_ALWAYS) { lastY = y; apply(false); return; }
        // mwisho wa ukurasa → onyesha (tusimzuie mtu kugusa nav)
        // 80px si "karibu" tu: picha za feed zinazoanza kuonekana hubadilisha
        // urefu wa ukurasa, kwa hiyo scroll ya mwisho mara nyingi inaishia
        // px chache kabla ya maxY halisi.
        if (y >= limit - 80) { lastY = y; apply(false); return; }
        if (Math.abs(delta) < HYSTERESIS) return;

        if (delta > 0 && y > HIDE_AFTER) apply(true);   // anashuka chini → ficha
        else if (delta < 0) apply(false);               // anavuta juu → rudisha

        lastY = y;
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;
        (window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(evaluate);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('orientationchange', function () { apply(false); }, { passive: true });
    window.addEventListener('resize', function () { if (maxScroll() <= 80) apply(false); }, { passive: true });
    // kubadilisha ukurasa/chat/modal: upau urudi ili usikosekane
    window.addEventListener('hashchange', function () { apply(false); });
    window.addEventListener('resize', function () { var el = hdr(); if (el && hidden) measure(el); }, { passive: true });
    document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.nav-tab, .sell-action-fab') : null;
        if (t) apply(false);
    }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(false); });
    else apply(false);

    // kwa majaribio/uchunguzi
    window.skhBottomNav = {
        hide: function () { apply(true); },
        show: function () { apply(false); },
        isHidden: function () { return hidden; }
    };
})();

/* ============================================================================
   [UI 2026-11-16] UPAU WA JUU (top nav) UNARUDI UKIVUTA JUU
   Tatizo: .sticky-top-section ilikuwa position:relative (css/57) — ilitoka nje ya skrini
   ukishuka chini na HAIKURUDI hadi urudi juu kabisa ("top nav inapotea"). Sasa ni sticky
   (css/72) na, kama upau wa chini: inajificha unaposhuka (inaacha nafasi ya picha) na
   inarudi MARA MOJA unapovuta juu kidogo. Juu ya ukurasa / ukurasa mfupi -> inaonekana daima.
   Inabadilisha class pekee; hakuna layout shift.
   ============================================================================ */
(function skhTopNavAutoHide() {
    if (window.__skhTopNavScroll) return;
    window.__skhTopNavScroll = true;
    var lastY = window.scrollY || 0, ticking = false, hidden = false;
    function hdr() { return document.querySelector('.sticky-top-section'); }
    // Ikifichwa: band ya mapambo (juu) na upau wa eneo (chini) vinaondoka; LOGO + vitufe + SEARCH vinabaki daima.
    function measure(el) {
        var nav = el.querySelector('.top-nav-row'); var srch = document.getElementById('topSearchRow');
        if (!nav) return;
        var top = nav.offsetTop; var keepEnd = (srch && srch.offsetParent === el ? srch.offsetTop + srch.offsetHeight : nav.offsetTop + nav.offsetHeight);
        var bot = Math.max(0, el.offsetHeight - keepEnd);
        el.style.setProperty('--skh-hdr-cut-top', top + 'px');
        el.style.setProperty('--skh-hdr-cut-bot', bot + 'px');
    }
    function apply(hide) {
        var el = hdr(); if (!el) return;
        if (hide === hidden && el.classList.contains('skh-hdr-hide') === hide) return;
        if (hide) measure(el);
        hidden = hide; el.classList.toggle('skh-hdr-hide', hide);
    }
    function evaluate() {
        ticking = false;
        var y = Math.max(0, window.scrollY || 0);
        var el = hdr(); var h = el ? el.offsetHeight : 180;
        var limit = Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
        if (limit <= 80 || y <= h) { lastY = y; apply(false); return; }
        var d = y - lastY;
        if (Math.abs(d) < 6) return;
        // dropdown ya kategoria/chujio iko wazi -> usiifiche
        var open = document.querySelector('#ctgDrop[style*="block"], #filterDrop[style*="block"]');
        if (d > 0 && !open) apply(true); else if (d < 0) apply(false);
        lastY = y;
    }
    window.addEventListener('scroll', function () { if (ticking) return; ticking = true; (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(evaluate); }, { passive: true });
    window.addEventListener('hashchange', function () { apply(false); });
    window.addEventListener('resize', function () { var el = hdr(); if (el && hidden) measure(el); }, { passive: true });
    document.addEventListener('focusin', function (e) { var el = hdr(); if (el && e.target && el.contains(e.target)) apply(false); });
    window.skhTopNavShow = function () { apply(false); };
})();


/* [2026-11-06] Tiers za jumla: uchakataji + ukaguzi + hakiki (fomu ya kuunda na kuhariri).
   Sheria za bei zenyewe ziko shared/wholesale-price-core.js (sawa na server). */
window.skhParseWsTiers = function (text) {
    return String(text || '').split(';').map(function (pair) {
        var kv = pair.split(':');
        return { minQty: parseInt(kv[0], 10), price: parseFloat(String(kv[1] || '').replace(/[,\s]/g, '')) };
    }).filter(function (t) { return Number.isFinite(t.minQty) && t.minQty > 0 && Number.isFinite(t.price) && t.price > 0; })
      .sort(function (a, b) { return a.minQty - b.minQty; });
};
window.skhWsTierIssues = function (retail, tiers) {
    var core = window.SKHWholesalePriceCore;
    if (!core || !tiers || !tiers.length) return '';
    var msgs = { MIN_QTY_BELOW_2: 'idadi ya chini iwe 2 au zaidi', PRICE_REQUIRED: 'weka bei', NOT_BELOW_RETAIL: 'bei ya jumla iwe chini ya bei ya rejareja', MIN_QTY_NOT_INCREASING: 'idadi zisijirudie (kila ngazi iwe kubwa kuliko iliyotangulia)', PRICE_RISES: 'bei isipande kadri idadi inavyoongezeka' };
    var issues = core.validateTiers(retail, tiers);
    if (!issues.length) return '';
    return 'Tiers za jumla zina tatizo:\n' + issues.map(function (i) { return '• Ngazi ' + (i.index + 1) + ' (' + tiers[i.index].minQty + ':' + tiers[i.index].price + '): ' + (msgs[i.code] || i.code); }).join('\n');
};
window.skhWsTierPreview = function (textId, priceId, previewId) {
    var box = document.getElementById(previewId); if (!box) return;
    var core = window.SKHWholesalePriceCore;
    var retail = parseFloat((document.getElementById(priceId) || {}).value) || 0;
    var tiers = window.skhParseWsTiers((document.getElementById(textId) || {}).value);
    if (!core || !tiers.length) { box.innerHTML = ''; return; }
    var issue = window.skhWsTierIssues(retail, tiers);
    var rows = core.priceTable({ price: retail, saleMode: 'wholesale', modeData: { tiers: tiers } });
    var esc = function (v) { return skh.skhEscape(String(v)); };
    box.innerHTML = (issue ? '<div class="ws-tier-issue">' + esc(issue).replace(/\n/g, '<br>') + '</div>' : '')
        + '<div class="ws-tier-head">Mnunuzi ataona:</div>'
        + rows.map(function (r) { return '<div class="ws-tier-row"><span>' + (r.to ? r.from + '–' + r.to : r.from + '+') + ' vipande</span><b>TSh ' + Number(r.price).toLocaleString() + '</b><small>' + (r.retail ? 'rejareja' : 'jumla') + '</small></div>'; }).join('');
};

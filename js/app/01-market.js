/* ==== js/app/01-market.js ==== */
import { skh } from './00-bootstrap.js';

// [FIX 2026-09] `deliveryTaxonomy` ilikuwa ikitumika bila kufafanuliwa (ReferenceError)
// -> ilivunja modal ya kategoria za Usafirishaji kabisa. Sasa imefafanuliwa hapa,
// ikiendana na maadili ya `supportedServices` yanayohifadhiwa na madereva.
skh.deliveryTaxonomy = { "Passenger": { label: "Abiria (Watu)", items: ["Boda", "Bajaji", "Daladala", "Gari"], vehicles: ["Boda", "Bajaji", "Daladala", "Gari"] }, "Product":   { label: "Mizigo (Bidhaa)", items: ["Boda", "Bajaji", "Pickup", "Gari"], vehicles: ["Boda", "Bajaji", "Pickup", "Gari"] }, "Cargo":     { label: "Mizigo Mikubwa", items: ["Lori", "Pickup", "Fuso", "Trailer"], vehicles: ["Lori", "Pickup", "Fuso", "Trailer"] }, "Emergency": { label: "Dharura / Express", items: ["Boda", "Gari", "Ambulance"], vehicles: ["Boda", "Gari", "Ambulance"] }
};

// [LOCATION LIFECYCLE 2026-09] Kanuni (kutoka kwa mtumiaji):
//   UNKNOWN → REQUESTING → AVAILABLE → STALE (ikizidi muda wake)
//   DENIED/ERROR → tofauti na "hakuna bidhaa za karibu"
//   - Eneo halisi LINAHIFADHIWA (localStorage) na kutumika mara moja — GPS
//     haitafutwi upya kila wakati app inapofunguka.
//   - Hakuna loop: kupa ombi moja kwa wakati; fetch ina TIMEOUT.
//   - Marketplace haizuwi hata GPS ikifeli kabisa.
const SKH_LOC_TTL = 24 * 60 * 60 * 1000; // eneo lithibetwe lazima kwa siku mmoja
function skhLocGetSaved() {
    try {
        const raw = skh.localStorage.getItem('skh_last_loc');
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (typeof d === 'object' && d && typeof d.lat === 'number' && typeof d.lon === 'number') return d;
    } catch (e) {}
    return null;
}
function skhLocSave(lat, lon, name, source) {
    try {
        skh.localStorage.setItem('skh_last_loc', JSON.stringify({
            lat, lon, name: name || '', ts: Date.now(), source: source || 'gps'
        }));
    } catch (e) {}
}
function skhLocSetStatus(txt) {
    const statusEl = document.getElementById('userLocationStatus');
    if (statusEl) statusEl.innerText = txt;
}

window.requestUserLocation = function(force) {
    const statusEl = document.getElementById('userLocationStatus');

    // 1) TUMIA ILIYOHIFADHIWA mara moja (hii ndiyo sababu ya kufuta loop):
    //    kama location haijazidi muda wake, GPS hataisidiuliwa tena.
    //    `force = true` atakapogusa muonekano (au kubadilisha mkoa au karibu-nawe).
    const saved = skhLocGetSaved();
    if (!force && saved && (Date.now() - saved.ts) < SKH_LOC_TTL) {
        skh.userLat = saved.lat;
        skh.userLon = saved.lon;
        skh.userRegionName = saved.name || skh.userRegionName || '';
        if (skh.userRegionName) skhLocSetStatus(' Eneo: ' + skh.userRegionName);
        return;
    }

    // 2) Ombi moja kwa wakati — zizie request nyingi zinazosababisha "loop".
    if (skh._locInFlight) return;
    skh._locInFlight = true;

    const finish = function () { skh._locInFlight = false; };
    const fallbackText = function () {
        // ERROR ≠ flatten: Duka la SokoHai likuendelea kufanya kazi ziu.
        const st = skhLocGetSaved();
        if (st && st.name) {
            skh.userLat = st.lat; skh.userLon = st.lon; skh.userRegionName = st.name;
            skhLocSetStatus(' Eneo: ' + st.name + ' (imehifadhiwa)');
        } else {
            skhLocSetStatus(' Eneo halijapatikana — gusa kujaribu tena');
        }
    };

    if (!navigator.geolocation) {
        fallbackText();
        finish();
        return;
    }

    // TIMEOUT+CACHE ya browser: isibaki animation kuwasha "getCurrentPosition".
    navigator.geolocation.getCurrentPosition(async (position) => {
        skh.userLat = position.coords.latitude;
        skh.userLon = position.coords.longitude;

        skhLocSetStatus(' Inatafsiri jina la mtaa...');

        try {
            // reverse geocoding yenye TIMEOUT: fetch isinpinge milele (kichupi
            // cha "Inatafuta eneo..." isiyotamatika).
            const ctrl = new AbortController();
            const to = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${skh.userLat}&lon=${skh.userLon}&addressdetails=1`, { signal: ctrl.signal });
            clearTimeout(to);
            const data = await res.json();
            const addr = data.address || {};

            const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || "";
            const city = addr.city || addr.town || addr.village || addr.region || "";

            skh.userRegionName = neighborhood ? `${neighborhood}, ${city}` : city;
            if (!skh.userRegionName) skh.userRegionName = "Tanzania";

            // HIFADHI: eneo hili itatumika tena bila kuuliza GPS.
            skhLocSave(skh.userLat, skh.userLon, skh.userRegionName, 'gps');
            skhLocSetStatus(` Eneo: ${skh.userRegionName}`);
        } catch (err) {
            // GPS imerudi lakini geocoding imefeli — save coordinates tuwa tu.
            skh.userRegionName = skh.userRegionName || "Tanzania";
            skhLocSave(skh.userLat, skh.userLon, skh.userRegionName, 'gps-noname');
            skhLocSetStatus(" Eneo halisoma jina — gusa kujaribu tena");
        }

        // Kama tayari toggle ya "Karibu Nawe" imewashwa, refresh feed
        if (skh.filterNearMe) {
            skh.loadMainFeed(skh.currentFeedCollection);
        }
        finish();
    }, (err) => {
        // DENIED/ERROR — sio "sio karibu"; Duka likuendelea kufanya kazi.
        fallbackText();
        finish();
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: SKH_LOC_TTL });
};

// Boot: omba mara moja (isiyo-'force'). Kama cache ipo haitasusu GPS.
setTimeout(() => {
    window.requestUserLocation(false);
}, 1500);

window.toggleNearMeFilter = function() {
    const toggle = document.getElementById('nearMeToggle');
    skh.filterNearMe = toggle ? toggle.checked : false;
    
    if (skh.filterNearMe && (!skh.userLat || !skh.userLon)) {
        alert(" Kuruhusu eneo la karibu, tunahitaji GPS ya simu yako iwe imewashwa!");
        window.requestUserLocation();
    }
    
    skh.loadMainFeed(skh.currentFeedCollection);
};

// [MIKOA] Chujio la Location kwa kuchagua Mkoa (dropdown ya mikoa yote ya Tanzania)
window.filterByRegion = function(region) {
    if (region === 'nearme') {
        // "Karibu Nawe" — tumia GPS
        skh.filterRegion = "";
        skh.filterNearMe = true;
        if (!skh.userLat || !skh.userLon) {
            window.requestUserLocation();
        }
    } else {
        skh.filterNearMe = false;
        skh.filterRegion = region || "";
    }
    skh.loadMainFeed(skh.currentFeedCollection);
};

if(!skh.sysConfig.modes) {
    skh.sysConfig.modes = { free_market: true, auction: true, price_drop: true, wholesale: true, group_buy: true };
}

// [FIX 2026-09] Swichi za modes (Mnada/Bei Kushuka/Group Buy/Wholesale) —
// zifanye kazi KWELI KWELI: ficha/zima tab za feed, chaguo la muuzaji, na
// zuia serious actions za mode iliyozimwa.
skh.modeEnabled = function(mode) {
    return !(skh.sysConfig && skh.sysConfig.modes && skh.sysConfig.modes[mode] === false);
};

window.skhApplyModeSwitches = function() {
    try {
        // 1) Tab za mode kwenye feed (data-skh-mode) — zimezimwa -> zimezimwa (greyed, no click)
        document.querySelectorAll('[data-skh-mode]').forEach(function (el) {
            var mode = el.getAttribute('data-skh-mode');
            var on = skh.modeEnabled(mode);
            el.style.opacity = on ? '1' : '0.45';
            el.style.pointerEvents = on ? 'auto' : 'none';
            el.style.filter = on ? 'none' : 'grayscale(0.8)';
            el.setAttribute('aria-disabled', on ? 'false' : 'true');
        });
        // 2) Chaguo la mode kwenye fomu ya muuzaji (prodSaleMode) — ficha zilizozimwa
        var sel = document.getElementById('prodSaleMode');
        if (sel) {
            var current = sel.value;
            Array.prototype.forEach.call(sel.options || [], function (opt) {
                var m = opt.value;
                if (m && !skh.modeEnabled(m)) opt.disabled = true;
                else opt.disabled = false;
            });
            if (current && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].disabled) {
                sel.value = 'free_market';
            }
        }
        } catch (e) { console.warn('[modes]', e && e.message); }
};

// Tekeleza mara moja DOM ikiwa tayari (module scripts huwa deferred).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.skhApplyModeSwitches(); });
} else {
    window.skhApplyModeSwitches();
}

window.setMarketMode = function(mode, btnElement) {
    // Kama amechagua "Vyote", usimpe sheria yoyote, mruhusu aone vyote.
    if (mode === 'all_modes') {
        skh.activeMarketMode = mode;
        document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
        if(btnElement) btnElement.classList.add('active');
        skh.currentLimit = 20;
        skh.loadMainFeed(skh.currentFeedCollection);
        window.scrollTo({top: 0, behavior: 'smooth'});
        return;
    }

    // 1. Kagua kama Admin amezima hii Mode
    if(skh.sysConfig.modes && skh.sysConfig.modes[mode] === false) {
        alert(" mfumo huu umezimwa kwa muda na Admin.");
        return;
    }

    // 2. Maelezo mafupi ya kila mode (lugha moja kwa wakati — kupitia t()).
    const rules = { 'free_market': {
            icon: "",
            title: window.t('mode_free_market_title'),
            desc: window.t('mode_free_market_desc')
        }, 'auction': {
            icon: "",
            title: window.t('mode_auction_title'),
            desc: window.t('mode_auction_desc')
        }, 'price_drop': {
            icon: "",
            title: window.t('mode_price_drop_title'),
            desc: window.t('mode_price_drop_desc')
        }, 'wholesale': {
            icon: "",
            title: window.t('mode_wholesale_title'),
            desc: window.t('mode_wholesale_desc')
        }, 'group_buy': {
            icon: "",
            title: window.t('mode_group_buy_title'),
            desc: window.t('mode_group_buy_desc')
        }
    };

    const rule = rules[mode];

    // 3. Tengeneza Kioo cha Taarifa (Modal) Kiotomatiki
    const overlay = document.createElement("div");
    overlay.id = "modeRulesAlert";
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,34,68,0.85); z-index:99999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px); padding:20px;";
    
    const box = document.createElement("div");
    box.style.cssText = "background:white; padding:30px 25px; border-radius:24px; width:100%; max-width:380px; text-align:center; box-shadow:0 15px 40px rgba(0,0,0,0.4); animation:popIn 0.3s ease-out;";
    
    const iconDiv = document.createElement("div");
    iconDiv.style.cssText = "font-size:50px; margin-bottom:10px;";
    iconDiv.innerHTML = rule.icon;

    const titleEl = document.createElement("h3");
    titleEl.style.cssText = "color:var(--primary-dark); margin:0 0 15px; font-size:18px; font-weight:900;";
    titleEl.innerHTML = rule.title;

    const msg = document.createElement("p");
    msg.style.cssText = "font-size:14px; color:#475569; margin:0 0 25px; line-height:1.6; text-align:left; background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #e2e8f0;";
    msg.innerHTML = rule.desc;
    
    const btn = document.createElement("button");
    btn.innerText = window.t('mode_continue');
    btn.style.cssText = "background:linear-gradient(90deg, var(--green), #0da271); color:white; border:none; padding:16px; border-radius:14px; font-weight:900; font-size:15px; cursor:pointer; width:100%; text-transform:uppercase; box-shadow:0 4px 15px rgba(16,185,129,0.3); transition:0.2s;";
    
    // Kitendo cha kufanyika akibofya "Endelea"
    btn.onclick = () => {
        overlay.remove(); // Funga kioo cha taarifa
        
        // 4. Endelea na mchakato wa kubadili mode
        skh.activeMarketMode = mode;
        
        document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
        if(btnElement) btnElement.classList.add('active');

        skh.currentLimit = 20;
        skh.loadMainFeed(skh.currentFeedCollection); // Leta bidhaa
        window.scrollTo({top: 0, behavior: 'smooth'}); // Mpeleke juu
    };
    
    box.appendChild(iconDiv);
    box.appendChild(titleEl);
    box.appendChild(msg);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
};

window.openCategoryModal = function() {
    closeModals(); 
    const container = document.getElementById('catGridContainer');
    // [PHASE 5.9] ikoni za SVG (hakuna emoji) — js/18-icons.js
    let html = `<div class="cat-box" onclick="selectAdvancedCategory('Zote', 'all')"><div class="cat-icon">${window.skhCatIcon ? skhCatIcon('Zote') : ''}</div><div class="cat-name">ZOTE</div></div>`;
    // MPYA: KAMA UPO KWENYE TAB YA USAFIRI (DRIVERS)
    if (skh.currentFeedCollection === 'drivers') {
        html += `<div style="grid-column: span 3; color: var(--terracotta); font-weight: 900; font-size: 13px; margin-top: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">CHAGUA HUDUMA YA USAFIRI</div>`; // [PHASE 5.9] emoji imetolewa
        for (const catName in skh.deliveryTaxonomy) {
            html += `
                <div class="cat-box" onclick="selectAdvancedCategory('${catName}')"> <div class="cat-icon">${window.skhCatIcon ? skhCatIcon(catName) : ''}</div> <div class="cat-name">${catName.toUpperCase()}</div> </div>`;
        }
        container.innerHTML = html;
        document.getElementById('categoryModal').style.display = 'flex';
        return; // Maliza hapa isiendelee kusoma bidhaa
    }
    // 1. KAMA UPO KWENYE TAB YA HUDUMA
    if (skh.currentFeedCollection === 'services') {
        if (skh.activeServiceSection !== 'all' && skh.serviceDataMap[skh.activeServiceSection]) {
            // Kama amechagua Physical/Online juu, onyesha zake tu
            for (const catName in skh.serviceDataMap[skh.activeServiceSection]) {
                html += `<div class="cat-box" onclick="selectAdvancedCategory('${catName}', '${skh.activeServiceSection}')"><div class="cat-icon">${window.skhCatIcon ? skhCatIcon(catName) : ''}</div><div class="cat-name">${catName.toUpperCase()}</div></div>`;
            }
        } else {
            // Kama ni "Huduma Zote", onyesha kategoria zote za huduma
            for (const section in skh.serviceDataMap) {
                for (const catName in skh.serviceDataMap[section]) {
                    html += `<div class="cat-box" onclick="selectAdvancedCategory('${catName}', '${section}')"><div class="cat-icon">${window.skhCatIcon ? skhCatIcon(catName) : ''}</div><div class="cat-name">${catName.toUpperCase()}</div></div>`;
                }
            }
        }
    } 
    // 2. KAMA UPO KWENYE TAB YA BIDHAA
    else if (skh.currentFeedCollection === 'products') {
        for (const [catName, data] of Object.entries(skh.advancedCategories)) {
            html += `<div class="cat-box" onclick="selectAdvancedCategory('${catName}')"><div class="cat-icon">${window.skhCatIcon ? skhCatIcon(catName) : ''}</div><div class="cat-name">${catName.toUpperCase()}</div></div>`;
        }
    }
    // 3. KAMA UPO KWENYE HOME (MCHANGANYIKO ULIOPANGWA VIZURI)
    else if (skh.currentFeedCollection === 'all') {
         html += `<div style="grid-column: span 3; color: var(--primary-dark); font-weight: 900; font-size: 13px; margin-top: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">KATEGORIA ZA BIDHAA</div>`; // [PHASE 5.9]
         for (const [catName, data] of Object.entries(skh.advancedCategories)) {
             html += `<div class="cat-box" onclick="switchToTabAndCategory('bidhaa', '${catName}', null)"><div class="cat-icon">${window.skhCatIcon ? skhCatIcon(catName) : ''}</div><div class="cat-name">${catName.toUpperCase()}</div></div>`;
         }
         
         html += `<div style="grid-column: span 3; color: var(--primary-blue); font-weight: 900; font-size: 13px; margin-top: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">KATEGORIA ZA HUDUMA</div>`; // [PHASE 5.9]
         for (const section in skh.serviceDataMap) {
             for (const catName in skh.serviceDataMap[section]) {
                 html += `<div class="cat-box" onclick="switchToTabAndCategory('services', '${catName}', '${section}')"><div class="cat-icon">${window.skhCatIcon ? skhCatIcon(catName) : ''}</div><div class="cat-name">${catName.toUpperCase()}</div></div>`;
             }
         }
    }

    container.innerHTML = html;
    document.getElementById('categoryModal').style.display = 'flex';
};

window.switchToTabAndCategory = function(tabMode, catName, sectionName) {
    // 1. Mpeleke kwenye Tab husika
    const tabId = tabMode === 'bidhaa' ? 'navTabBidhaa' : (tabMode === 'services' ? 'navTabHuduma' : 'navTabHome');
    const tab = document.getElementById(tabId);
    if (tab) {
        updateApp(tabMode, tab);
    }
    
    // 2. Muwashe ile Sub-nav ya juu (Physical/Online n.k) kama ni Huduma
    if (tabMode === 'services' && sectionName) {
        const secBtns = document.getElementById('serviceModesNav').querySelectorAll('.mode-tab-btn');
        secBtns.forEach(b => {
            if(b.getAttribute('onclick').includes(`'${sectionName}'`)) {
                setServiceSection(sectionName, b);
            }
        });
    }
    
    // 3. Mfungulie Kategoria husika na Filters zake
    setTimeout(() => {
        selectAdvancedCategory(catName, sectionName);
    }, 150); 
};

window.selectAdvancedCategory = function(catName, sectionName = null) {
    skh.activeCategory = catName;
    skh.activeSubCategory = "Zote"; 
    skh.activeFilterValues = {}; 

    // [FIX 2026-09] USAFIRI: "ZOTE" kwenye modal = futa kichujio cha sehemu (all).
    if (skh.currentFeedCollection === 'drivers') {
        skh.activeDeliverySection = (catName === 'Zote') ? 'all' : catName;
    }
    
    const actText = document.getElementById('activeCategoryText');
    if(actText) actText.innerHTML = (window.skhNavIcon ? skhNavIcon('folder', 15) + ' ' : '') + `Kategoria: ${catName}`; // [PHASE 5.9]
    closeModals();

    const slidersDiv = document.getElementById('dynamicSliders');
    const subRow = document.getElementById('subcatRow');
    const filterRow = document.getElementById('filterRow');

    if (catName === 'Zote') {
        if(slidersDiv) slidersDiv.style.display = 'none'; 
    } else {
        if(slidersDiv) slidersDiv.style.display = 'flex';
        let subcatNames = [];

        // KAMA NI HUDUMA
        if (skh.currentFeedCollection === 'services') {
            if (sectionName && skh.serviceDataMap[sectionName] && skh.serviceDataMap[sectionName][catName]) {
                subcatNames = Object.keys(skh.serviceDataMap[sectionName][catName]);
            } else {
                // Tafuta section kiotomatiki kama sectionName inakosekana
                for(let sec in skh.serviceDataMap) {
                    if(skh.serviceDataMap[sec][catName]) {
                        subcatNames = Object.keys(skh.serviceDataMap[sec][catName]);
                        sectionName = sec;
                        break;
                    }
                }
            }
        } 
        // KAMA NI USAFIRI (DRIVERS)
        if (skh.currentFeedCollection === 'drivers') {
            // [FIX 2026-09] Kategoria ya usafiri = aina ya huduma (Passenger/Product/...)
            skh.activeDeliverySection = catName;
            if (skh.deliveryTaxonomy[catName] && skh.deliveryTaxonomy[catName].items) {
                subcatNames = skh.deliveryTaxonomy[catName].items;
            }
        }
        // KAMA NI BIDHAA
        else if (skh.currentFeedCollection !== 'services') {
            if (skh.advancedCategories[catName] && skh.advancedCategories[catName].subcategories) {
                subcatNames = Object.keys(skh.advancedCategories[catName].subcategories);
            }
        }
        
        if(subRow && subcatNames.length > 0) {
            subcatNames.unshift('Zote'); 
            subRow.innerHTML = subcatNames.map(sub => `<div class="subcat-chip ${sub === 'Zote' ? 'active' : ''}" onclick="selectSubCategory('${sub}', this, '${sectionName}')">${sub}</div>`
            ).join('');
        } else if (subRow) {
            subRow.innerHTML = '';
        }
        
        if(filterRow) {
            filterRow.innerHTML = '<span style="font-size:13px; color:#94a3b8; padding:5px;">Chagua aina hapo juu kuona vichujio (Filters)</span>';
        }
        
        if(subRow) { subRow.style.animation = 'none'; setTimeout(() => subRow.style.animation = 'slideInFromRight 0.4s ease forwards', 10); }
        if(filterRow) { filterRow.style.animation = 'none'; setTimeout(() => filterRow.style.animation = 'slideInFromRight 0.5s ease forwards', 10); }
    }

    skh.currentLimit = 20;
    skh.loadMainFeed(skh.currentFeedCollection);
    window.scrollTo({top: 0, behavior: 'smooth'});
};

window.selectSubCategory = function(subName, element, sectionName = 'null') {
    skh.activeSubCategory = subName;
    skh.activeFilterValues = {}; 
    
    document.querySelectorAll('.subcat-chip').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const filterRow = document.getElementById('filterRow');
    if(filterRow) {
        if(subName === 'Zote') {
            filterRow.innerHTML = '<span style="font-size:13px; color:#94a3b8; padding:5px;">Chagua aina kuona vichujio (Filters)</span>';
        } else {
            let filters = [];

            // KAMA NI HUDUMA VUTA FILTERS ZA HUDUMA
            if (skh.currentFeedCollection === 'services') {
                if(sectionName === 'null' || !skh.serviceDataMap[sectionName]) {
                    for(let sec in skh.serviceDataMap) {
                        if(skh.serviceDataMap[sec][skh.activeCategory]) { sectionName = sec; break; }
                    }
                }
                if(skh.serviceDataMap[sectionName] && skh.serviceDataMap[sectionName][skh.activeCategory] && skh.serviceDataMap[sectionName][skh.activeCategory][subName]) {
                    filters = skh.serviceDataMap[sectionName][skh.activeCategory][subName].filters || [];
                }
            } 
            
            // KAMA NI USAFIRI VUTA FILTERS ZA USAFIRI
            if (skh.currentFeedCollection === 'drivers') {
                if (skh.deliveryTaxonomy[skh.activeDeliverySection]) {
                    filters = skh.deliveryTaxonomy[skh.activeDeliverySection].vehicles || [];
                }
            }
            // KAMA NI BIDHAA VUTA FILTERS ZA BIDHAA
            else {
                const catData = skh.advancedCategories[skh.activeCategory];
                if(catData && catData.subcategories && catData.subcategories[subName]) {
                    filters = catData.subcategories[subName].filters || [];
                }
            }

            if(filters.length > 0) {
                filterRow.innerHTML = filters.map(filter => `<div class="filter-chip" onclick="handleFilterClick('${filter}', this)">${filter}</div>`
                ).join('');
                
                filterRow.style.animation = 'none'; 
                setTimeout(() => filterRow.style.animation = 'slideInFromRight 0.5s ease forwards', 10);
            } else {
                filterRow.innerHTML = '<span style="font-size:13px; color:#94a3b8; padding:5px;">Hakuna vichujio maalum (Filters)</span>';
            }
        }
    }

    skh.loadMainFeed(skh.currentFeedCollection); 
};

window.handleFilterClick = function(filterName, element) {
    if (skh.currentFeedCollection === 'drivers') {
        skh.searchQuery = filterName.toLowerCase(); 
        element.style.borderColor = "var(--gold)";
        element.style.background = "#fffbeb";
        // [FIX 2026-09] alert ya kila kubofya ilikuwa inasumbua UI — imeondolewa.
        skh.loadMainFeed('drivers');
        return;
    }

    // 1. Kusanya vigezo vyote vya kipekee (Unique Values) vilivyopo kwenye bidhaa za sasa hivi sokoni
    const uniqueValues = [];
    skh.cachedItems.forEach(item => {
        if (item.filters && item.filters[filterName]) {
            const val = item.filters[filterName].trim();
            // Kagua kuzuia majina kujirudia (case-insensitive check)
            if (val && !uniqueValues.some(v => v.toLowerCase() === val.toLowerCase())) {
                uniqueValues.push(val);
            }
        }
    });

    // 2. Ondoa popup ya zamani kama ipo
    const existing = document.getElementById('customFilterValueSelector');
    if (existing) existing.remove();

    // 3. Jenga Popup mpya na ya kuvutia
    const overlay = document.createElement("div");
    overlay.id = "customFilterValueSelector";
    overlay.className = "overlay-menu";
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,34,68,0.7); z-index:1000005; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);";

    const box = document.createElement("div");
    box.style.cssText = "background:white; padding:25px; border-radius:24px; width:90%; max-width:360px; text-align:center; box-shadow:0 15px 40px rgba(0,0,0,0.3); animation:popIn 0.3s ease-out;";

    const title = document.createElement("h3");
    title.style.cssText = "color:var(--primary-dark); margin:0 0 15px; font-size:16px; text-transform:uppercase; border-bottom:1px solid #eee; padding-bottom:10px;";
    title.innerText = `Chuja kwa: ${filterName}`;

    const desc = document.createElement("p");
    desc.style.cssText = "font-size:12px; color:#64748b; margin-bottom:15px;";
    desc.innerText = uniqueValues.length > 0 
        ? "Chagua kigezo kilichopo duka hivi sasa:" 
        : "Hakuna kigezo kilichosajiliwa kwenye bidhaa za duka kwa sasa. Unaweza kuandika cha kwako:";

    const optionsContainer = document.createElement("div");
    optionsContainer.style.cssText = "max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; margin-bottom:15px; padding-right:5px;";

    // Chora vigezo vilivyopo kama vifungo vya kubofya kwa urahisi (mfano: Samsung, Apple)
    uniqueValues.forEach(val => {
        const btn = document.createElement("button");
        btn.innerText = val;
        btn.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:bold; cursor:pointer; text-align:left; font-size:13px; transition:0.2s;";
        btn.onmouseover = () => btn.style.background = "#eef2f6";
        btn.onmouseout = () => btn.style.background = "#f8fafc";
        btn.onclick = () => {
            applyFilterValue(val);
            overlay.remove();
        };
        optionsContainer.appendChild(btn);
    });

    // Weka kisanduku cha mteja kuandika mwenyewe (kama anataka kutafuta kisicho kwenye orodha ya haraka)
    const textLabel = document.createElement("label");
    textLabel.style.cssText = "font-size:13px; font-weight:bold; color:gray; display:block; text-align:left; margin-bottom:4px;";
    textLabel.innerText = "Au andika mwenyewe hapa:";

    const manualInput = document.createElement("input");
    manualInput.type = "text";
    manualInput.placeholder = "Andika hapa... (Mf: Samsung, L, nk)";
    manualInput.style.cssText = "width:100%; padding:11px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:15px; outline:none; text-align:center; font-size:13px;";

    const btnSubmit = document.createElement("button");
    btnSubmit.innerText = "Tafuta Kigezo Hiki ";
    btnSubmit.style.cssText = "width:100%; padding:12px; background:var(--primary-blue); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer; font-size:13px; margin-bottom:8px;";
    btnSubmit.onclick = () => {
        const typedVal = manualInput.value.trim();
        if (typedVal) {
            applyFilterValue(typedVal);
            overlay.remove();
        } else {
            alert(" chagua kigezo kilichopo au andika mwenyewe!");
        }
    };

    const btnCancel = document.createElement("button");
    btnCancel.innerText = "Futa Chujio Hili (Clear)";
    btnCancel.style.cssText = "width:100%; padding:10px; background:#fee2e2; color:#ef4444; border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:12px;";
    btnCancel.onclick = () => {
        delete skh.activeFilterValues[filterName];
        element.style.borderColor = "#cbd5e1";
        element.style.background = "white";
        element.innerHTML = filterName;
        skh.loadMainFeed(skh.currentFeedCollection);
        overlay.remove();
    };

    // Ndani ya function hii tunasave kigezo na kurefresh feed
    function applyFilterValue(val) {
        skh.activeFilterValues[filterName] = val.trim().toLowerCase();
        element.style.borderColor = "var(--gold)";
        element.style.background = "#fffbeb";
        element.innerHTML = `${filterName}: <b>${val}</b>`;
        skh.loadMainFeed(skh.currentFeedCollection);
    }

    box.appendChild(title);
    box.appendChild(desc);
    if (uniqueValues.length > 0) {
        box.appendChild(optionsContainer);
        box.appendChild(textLabel);
    }
    box.appendChild(manualInput);
    box.appendChild(btnSubmit);
    box.appendChild(btnCancel);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    manualInput.focus();
};

window.openModeMenu = function() {
    window.closeModals(); // Tumia window. hapa pia
    const mm = document.getElementById('modeMenuModal');
    if(mm) {
        mm.style.display = 'flex';
        
        document.querySelectorAll('.menu-item').forEach(el => {
            if(el) el.style.background = '#f8fafc';
        });
        
        const activeItem = document.getElementById('mode-' + skh.currentMode);
        if(activeItem) activeItem.style.background = '#dcfce7'; 
    }
};

window.switchMode = async function(mode) {
    if(mode !== 'buyer' && !skh.requireAuth()) return; 

    if(mode === 'seller' || mode === 'business_os') {
    // Kagua kama mtumiaji ashasajili duka lake
    if(!skh.currentUserData || !skh.currentUserData.businessSetupComplete) {
        window.closeModals();
        document.getElementById('shopSetupModal').style.display = 'flex';
        return;
    }
}

    // Ulinzi wa Admin
    // [PHASE 2 - USALAMA] Custom claims (role: admin) ndiyo njia kuu; email fallback
    // inasimamiwa na SOKOHAI_CONFIG.ADMIN_EMAIL_FALLBACK (itafutwa Phase 5).
    const sokohaiIsAdmin = (window.SOKOHAI_CLAIMS && window.SOKOHAI_CLAIMS.isAdmin === true) ||
                           (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.ADMIN_EMAIL_FALLBACK === true && skh.currentUser.email === skh.MY_ADMIN_EMAIL);
    if(mode === 'admin' && !sokohaiIsAdmin) {
        alert(" Hauna ruhusa ya Admin."); return;
    }

    skh.currentMode = mode; 
    skh.localStorage.setItem('sokohai_mode', mode); 
    closeModals(); 
    skh.applyModeUI();
};

window.openBoostModal = function(id, collectionName) {
    // REAL ENFORCEMENT: Kagua switch ya admin kabla ya kufungua
    let catKey = 'bidhaa';
    if(collectionName === 'services') catKey = 'huduma';
    if(collectionName === 'delivery') catKey = 'usafiri';

    
    skh.activeBoostItem = { id, collectionName };
    closeModals();
    
    // Set default days
    document.getElementById('boostDays').value = (collectionName === 'products') ? 3 : 7;
    
    calculateBoost();
    document.getElementById('boostModal').style.display = 'flex';
};

window.calculateBoost = function() {
        const bv = document.getElementById('boostViews');
        const bd = document.getElementById('boostDays');
        if(!bv || !bd || !skh.activeBoostItem) return;
        
        const v = parseFloat(bv.value) || 1000;
        const d = parseFloat(bd.value) || 3;
        let cost = 0;
        
        // 3. Tenganisha Fomula kulingana na aina ya Tangazo (Bidhaa vs Huduma/Usafiri)
        if(skh.activeBoostItem.collectionName === 'products') {
            // FOMULA YA BIDHAA: Cost = 2000 * (((views / 1000) + (days / 3) + N) / 3) ^ 1.6
            let n = 1; // N = Idadi ya bidhaa (kwa tangazo hili tunahesabu 1 kwanza)
            let innerVal = ((v / 1000) + (d / 3) + n) / 3;
            cost = 2000 * Math.pow(innerVal, 1.6);
            cost = Math.max(2000, Math.round(cost)); // Gharama ya chini iwe TSh 2,000
        } else {
            // FOMULA YA HUDUMA NA USAFIRI: Cost = 1000 * (((views / 1000) + (days / 7)) / 2) ^ 1.4
            let innerVal = ((v / 1000) + (d / 7)) / 2;
            cost = 1000 * Math.pow(innerVal, 1.4);
            cost = Math.max(1000, Math.round(cost)); // Gharama ya chini iwe TSh 1,000
        }
        
        const bcd = document.getElementById('boostCostDisplay');
        if(bcd) {
            bcd.value = cost.toLocaleString();
            bcd.setAttribute('data-val', cost);
        }
    };

window.payForBoost = async function() {
    if(!skh.requireAuth() || !skh.activeBoostItem) return;
    
    const bcd = document.getElementById('boostCostDisplay');
    const amount = parseFloat(bcd.getAttribute('data-val'));
    const targetViews = parseInt(document.getElementById('boostViews').value) || 1000;
    const boostDays = Math.max(1, parseInt(document.getElementById('boostDays').value, 10) || (skh.activeBoostItem.collectionName === 'products' ? 3 : 7));
    const boostStart = new Date();
    const boostExpiresAt = new Date(boostStart.getTime() + boostDays * 86400000).toISOString();
    
    let catKey = 'bidhaa';
    if(skh.activeBoostItem.collectionName === 'services') catKey = 'huduma';
    if(skh.activeBoostItem.collectionName === 'delivery') catKey = 'usafiri';

    const isFreeMode = (!skh.paymentGate('boost')) || (skh.sysConfig && skh.sysConfig[catKey] && skh.sysConfig[catKey].boost === false);
    
    const btn = document.getElementById('btnPayBoost');
    const originalBtnText = btn.innerHTML;

    // [ADMIN PAYMENTS SWITCH] FREE MODE — boost papo hapo (hakuna namba wala malipo).
    if (isFreeMode) {
        btn.innerHTML = " INABOOST (FREE)...";
        btn.disabled = true;
        try {
            const ref = skh.doc(skh.db, skh.activeBoostItem.collectionName, skh.activeBoostItem.id);
            await skh.updateDoc(ref, { 
                isBoosted: true, 
                boostTargetViews: targetViews,
                boostedViewsCount: 0,
                boostDays: boostDays,
                boostedAt: boostStart.toISOString(),
                boostExpiresAt: boostExpiresAt
            });
            // Accounting is server-authoritative; no client adminRevenue write.

            alert(" Ada ya BOOST imezimwa (FREE MODE)! Tangazo lako limekuwa Boosted BURE.");
            closeModals();
            loadAndRenderDashboard();
        } catch (e) {
            alert(" Hitilafu: " + e.message);
        } finally {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
        return;
    }

    // PAID MODE — namba ya kulipia inahitajika.
    let phone = (skh.currentUserData && (skh.currentUserData.paymentAccount || skh.currentUserData.phone)) || '';
    if(!phone) {
        alert(" sajili Namba yako ya Malipo kwenye menyu kwanza.");
        openUserPaymentModal();
        return;
    }
    if(!await skhConfirm(`Lipa TSh ${amount.toLocaleString()} kwa kutumia namba yako: ${phone}?`)) return;
    if (phone.startsWith('0')) phone = '255' + phone.substring(1);

    btn.innerHTML = " INAKATA PESA...";
    btn.disabled = true;
    
    try {
        // 1. LIPA KWA PESAPAL KWANZA (hosted checkout — 17-pesapal-return inakamilisha boost)
        const pay = await window.skhPesaPalPay({
            amount: amount,
            kind: 'boost',
            phone: phone,
            provider: 'PesaPal',
            description: 'Boost ya tangazo la SokoHai',
            context: { collectionName: skh.activeBoostItem.collectionName, itemId: skh.activeBoostItem.id, targetViews: targetViews, boostDays: boostDays, boostExpiresAt: boostExpiresAt }
        });
        if (!pay.ok) throw new Error(pay.error || 'Malipo ya boost yamefeli.');
        return; // Mtumiaji ameelekezwa PesaPal — boost itakamilika akirudi
    } catch (e) {
        alert(" Hitilafu: " + e.message);
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
};

window.togglePhoneInput = function() {
    const provider = document.getElementById('checkoutProvider').value;
    const phoneDiv = document.getElementById('phoneInputDiv');
    const bankDiv = document.getElementById('bankInputDiv');
    const cardDiv = document.getElementById('cardInputDiv');

    // Tambua kundi la njia ya malipo
    const isMNO = ["Mpesa", "Airtel", "Tigo", "Halopesa"].includes(provider);
    const isBank = ["CRDB", "NMB", "NBC", "PBZ"].includes(provider);
    const isCard = ["Visa", "Mastercard"].includes(provider);

    // Onyesha kitalu husika na kuficha vingine vyote
    if (phoneDiv) phoneDiv.style.display = isMNO ? "block" : "none";
    if (bankDiv) bankDiv.style.display = isBank ? "block" : "none";
    if (cardDiv) cardDiv.style.display = isCard ? "block" : "none";
};

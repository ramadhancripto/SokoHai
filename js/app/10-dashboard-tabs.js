/* ==== js/app/10-dashboard-tabs.js ==== */
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


window.switchDashTab = function(tabName) {
    window.activeDashboardTab = tabName;
    document.querySelectorAll('.side-menu-link').forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById('btnTab_' + tabName);
    if(activeBtn) activeBtn.classList.add('active');

    // [SELLER MANAGEMENT] Vitenzi vipya vya muuzaji (My Products, Insights, Compare)
    if (typeof window.skhRenderSellerTab === 'function' && window.skhRenderSellerTab(tabName)) {
        return;
    }

    // Kagua kama mtumiaji ni Dereva, mpe kurasa zake, la sivyo mpe za bosi
    if (skh.currentMode === 'driver') {
        window.renderDriverActiveTabContent();
    } else {
        window.renderActiveTabContent();
    }
};

window.renderDriverActiveTabContent = async function() {
    const ws = document.getElementById('dashWorkspace');
    if(!ws || !skh.currentUser) return;

    const tab = window.activeDashboardTab;
    const vehicleType = skh.currentUserData?.vehicleType || "Bodaboda";
    const plateNo = skh.currentUserData?.vehicleReg || "N/A";

    // ==========================================
    // 1.  ROW 1 - 5: THE CORE LOGISTICS DASHBOARD
    // ==========================================
    if (tab === 'overview') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.3s ease;">

                <!-- LIVE BANNER: idadi halisi ya safari zako + maombi mapya sokoni -->
                <div id="driverLiveBanner" style="background:linear-gradient(135deg,#002244,#03509d); border-radius:16px; padding:16px 18px; margin-bottom:20px; color:white; display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;">
                    <div style="display:flex; gap:22px; flex-wrap:wrap;">
                        <div><small style="opacity:.8; display:block; font-size:10px; text-transform:uppercase; letter-spacing:.4px;">${T('dt_active_trips', 'My Active Trips')}</small><b id="drvLiveActive" style="font-size:24px;">—</b></div>
                        <div><small style="opacity:.8; display:block; font-size:10px; text-transform:uppercase; letter-spacing:.4px;">${T('dt_new_requests', 'New Requests in the Market')}</small><b id="drvLiveAvailable" style="font-size:24px; color:#FFD700;">—</b></div>
                    </div>
                    <button onclick="window.switchDashTab('bookings')" style="background:#FFD700; color:#001122; border:none; padding:10px 16px; border-radius:10px; font-weight:900; font-size:12px; cursor:pointer;"> ${T('dt_view_requests', 'ONA MAOMBI MAPYA')} ➔</button>
                </div>

                <!-- REAL STATS: imejazwa na skhDriverOverviewStats() — hakuna namba za kudhaniwa -->
                <div id="driverOverviewStatsArea" style="min-height:120px;">${T('dt_loading', 'Inapakia takwimu halisi za safari zako...')}</div>
            </div>`;

        if (typeof window.skhDriverOverviewStats === 'function') window.skhDriverOverviewStats();
        if (typeof window.skhLiveDriverStats === 'function') window.skhLiveDriverStats();
        return;
    }

    // ==========================================
    // 2.  REQUESTS MARKETPLACE — SOKO LA MAOMBI YA USAFIRISHAJI
    // [REDESIGN 2026-09] Hapa ni MAOMBI WALAZI tu (bado si safari, si
    // mazungumzo, si kumbukumbu). Kanda za juu zamtenganisha kila dhana:
    // yaliyotumwa kwako · maombi sokoni · yanayoendelea · kumbukumbu.
    // ==========================================
    else if (tab === 'bookings') {
        const lmIco = (n, s) => (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : '');
        ws.innerHTML = `
            <div class="lm-wrap" style="text-align:left; animation: fadeIn 0.25s ease;">
                <!-- BANGO KUU -->
                <div class="lm-hero">
                    <div class="lm-hero-ico">${lmIco('truck', 25)}</div>
                    <div class="lm-hero-txt">
                        <h3>Soko la Maombi ya Usafirishaji</h3>
                        <p>Hapa kuna MAOMBI WALAZI yanayotafuta chombo/msafirishaji. Bado si safari wala makubaliano — ukikubali, ombi linahamia “Yanaendelea”.</p>
                    </div>
                    <div class="lm-hero-count"><b id="lmTotalCount">—</b><small>maombi<br>wazi</small></div>
                </div>

                <!-- TENGANISHO LA DHANA: kwako / sokoni / yanaendelea / kumbukumbu -->
                <div class="lm-quicknav">
                    <button type="button" class="lm-qn" onclick="if(window.skhOpenRequestInbox) window.skhOpenRequestInbox()">
                        <span class="lm-qn-ico">${lmIco('target', 18)}</span>
                        <b>Yaliyotumwa Kwako</b>
                        <small>Ofa binafsi (routing)</small>
                    </button>
                    <button type="button" class="lm-qn is-primary is-active" onclick="window.skhMarketGoto('bookings')">
                        <span class="lm-qn-ico">${lmIco('truck', 18)}</span>
                        <b>Maombi Sokoni</b>
                        <small>Wazi kwa vyombo</small>
                    </button>
                    <button type="button" class="lm-qn" onclick="window.skhMarketGoto('trips')">
                        <span class="lm-qn-ico">${lmIco('map', 18)}</span>
                        <b>Yanaendelea</b>
                        <small>Safari ulizokubali</small>
                    </button>
                    <button type="button" class="lm-qn" onclick="window.skhMarketGoto('fleet')">
                        <span class="lm-qn-ico">${lmIco('clipboard', 18)}</span>
                        <b>Kumbukumbu</b>
                        <small>Safari zilizokwisha</small>
                    </button>
                </div>

                <!-- TAHADHARI YA TENGANISHO -->
                <div class="lm-sep-note">
                    ${lmIco('alert', 15)}
                    <span><b>Maelewano ya bei ni tofauti na ombi.</b> Majadiliano ya nauli/masharti huendeshwa kwenye <b>Gumzo</b> na kadi za ofa; rekodi rasmi ya usafirishaji (na msimbo wa kuchukulia) hutengenezwa BAADA ya makubaliano na kukubali ombi.</span>
                </div>

                <!-- VICHUPO VYA AINA YA KAZI -->
                <div class="lm-tabs" id="lmTabs" role="tablist">
                    <button type="button" class="lm-tab active" data-lm-filter="all_types" onclick="window.filterMarketplace('all_types', this)">${lmIco('briefcase', 14)} <span>Kazi Zote</span> <span class="lm-tab-n" id="lmN_all_types">—</span></button>
                    <button type="button" class="lm-tab" data-lm-filter="Cargo" onclick="window.filterMarketplace('Cargo', this)">${lmIco('package', 14)} <span>Mizigo</span> <span class="lm-tab-n" id="lmN_Cargo">—</span></button>
                    <button type="button" class="lm-tab" data-lm-filter="Passengers" onclick="window.filterMarketplace('Passengers', this)">${lmIco('users', 14)} <span>Watu</span> <span class="lm-tab-n" id="lmN_Passengers">—</span></button>
                    <button type="button" class="lm-tab" data-lm-filter="Livestock" onclick="window.filterMarketplace('Livestock', this)">${lmIco('tag', 14)} <span>Mifugo/Kandarasi</span> <span class="lm-tab-n" id="lmN_Livestock">—</span></button>
                </div>

                <div id="liveBookingsList" class="lm-list"></div>
            </div>`;

        // Mifupa ya upakiaji — orodha ionekane mara moja (milliseconds) kabla ya data.
        const _lmList = document.getElementById('liveBookingsList');
        if (_lmList) _lmList.innerHTML = window.skhMarketSkeleton ? window.skhMarketSkeleton(4) : '';

        window.loadMarketplaceRequests('all_types');
        return;
    }

    // ==========================================
    // 3.  ACTIVE SHIPMENTS & TRIPS
    // ==========================================
    else if (tab === 'trips') {
        const lmIco2 = (n, s) => (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : '');
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.3s ease;">
                <!-- BANGO: utengano wa dhana -->
                <div class="lm-hero" style="background:linear-gradient(135deg,#1d4ed8,#03509d);">
                    <div class="lm-hero-ico">${lmIco2('map', 25)}</div>
                    <div class="lm-hero-txt">
                        <h3>Safari Zinazoendelea</h3>
                        <p>Hii ni REKODI RASMI za usafirishaji ulioshakubali: kuchukua mzigo → njiani → kufikishwa → kuthibitishwa kupokea. Maombi mapya yapo kwenye “Soko la Maombi”, yaliyokwisha yapo “Kumbukumbu”.</p>
                    </div>
                </div>
                <div class="lm-quicknav" style="grid-template-columns:repeat(3,1fr);">
                    <button type="button" class="lm-qn" onclick="window.skhMarketGoto('bookings')">
                        <span class="lm-qn-ico">${lmIco2('truck', 18)}</span>
                        <b>Soko la Maombi</b><small>Maombi walazi</small>
                    </button>
                    <button type="button" class="lm-qn is-primary is-active">
                        <span class="lm-qn-ico">${lmIco2('map', 18)}</span>
                        <b>Yanaendelea</b><small>Safari za sasa</small>
                    </button>
                    <button type="button" class="lm-qn" onclick="window.skhMarketGoto('fleet')">
                        <span class="lm-qn-ico">${lmIco2('clipboard', 18)}</span>
                        <b>Kumbukumbu</b><small>Safari zilizokwisha</small>
                    </button>
                </div>

                <div id="driverActiveJobsArea" class="lm-list" style="min-height:80px;">
                    <div class="lm-skel"><div class="lm-skel-row"><div class="lm-skel-ico"></div><div style="flex:1;"><div class="lm-skel-bar w70"></div><div class="lm-skel-bar w40"></div></div></div></div>
                </div>
            </div>`;

        window.setupDriverActiveJobsQuery();
        return;
    }

    // ==========================================
    // 4.  SOKOPAY LOGISTICS TOKEN CENTER
    // ==========================================
    else if (tab === 'cargo') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.3s ease;">
                <h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> SOKOPAY LOGISTICS TOKEN CENTER</h3>
                <p style="color:gray; font-size:12px; margin-bottom:20px;">Dhibiti, hakiki na uwasilishe tokens za uokoaji na upelekaji mizigo [1].</p>

                <!-- PICKUP VERIFICATION BOX (TOKEN A) -->
                <div style="background:#fffbeb; border:1.5px dashed var(--gold); padding:20px; border-radius:16px; margin-bottom:20px;">
                    <b style="color:#d97706; font-size:13px; display:block; margin-bottom:10px; text-transform:uppercase;"> 1. PICKUP VERIFICATION (TOKEN A)</b>
                    <p style="font-size:11px; color:#475569; margin-bottom:15px;">Weka Token A (Pickup Token) uliyopewa na Muuzaji au kagua hali yake hapa:</p>
                    
                    <div id="pickupVerificationStatus" style="background:white; padding:15px; border-radius:12px; border:1px solid #cbd5e1;">
                        <span style="font-size:12px; display:block; color:gray;">Status: <b style="color:orange;">${T('dt_waiting_pickup', 'Waiting For Pickup')}</b></span>
                        <span style="font-size:11px; color:gray; display:block; margin-top:5px;">Token Code: <b style="color:var(--primary-blue);">${T('dt_auto_token', 'Auto Generated When Driver Arrives at Store')}</b></span>
                    </div>
                </div>

                <!-- DELIVERY VERIFICATION BOX (TOKEN C) -->
                <div style="background:#f0fdf4; border:1.5px dashed var(--green); padding:20px; border-radius:16px; margin-bottom:20px;">
                    <b style="color:var(--green); font-size:13px; display:block; margin-bottom:10px; text-transform:uppercase;"> 2. DELIVERY VERIFICATION (TOKEN C)</b>
                    <p style="font-size:11px; color:#475569; margin-bottom:15px;">Mpokeaji/Mnunuzi akikabidhi Token C, iingize hapa chini ili kumaliza safari na kuachia malipo:</p>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="tokenCenterInputDL" placeholder="${T('dt_token_c_ph', 'Enter Token C (e.g. DL-XXXX)...')}" style="flex:2; padding:15px; border-radius:12px; border:1px solid #cbd5e1; outline:none; text-align:center; font-weight:900; font-size:18px; text-transform:uppercase;">
                        <button onclick="window.verifyTokenCenterDL()" style="flex:1; padding:15px; background:var(--green); color:white; border:none; border-radius:12px; font-weight:900; cursor:pointer;">${T('dt_verify_release', 'VERIFY & RELEASE')} </button>
                    </div>
                </div>
            </div>`;
        return;
    }

    // 5. OTHER STATIC PRE-EXISTING TABS
    else if (tab === 'tracking') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.3s ease-out; display:flex; flex-direction:column; height:80vh;">
                <h3 style="color:var(--primary-dark); margin-top:0;"> SATELLITE LIVE TRACKING (CONTROL BRIDGE)</h3>
                <p style="color:gray; font-size:12px; margin-bottom:12px;">Fuatilia kwa urahisi mahali gari lako au mzigo unavyosogea live kwenye satellite ramani ya Sokohai [1].</p>
                <div style="flex:1; width:100%; height:320px; border-radius:20px; overflow:hidden; border:2px solid #cbd5e1; position:relative; margin-bottom:15px;">
                    <div id="liveLandedMap" style="height:100%; width:100%;"></div>
                </div>
            </div>`;

        setTimeout(() => {
            // [PERF 2026-09] Leaflet hupakuliwa kwa uvivu wakati wa kufungua ramani.
            const mapContainer = document.getElementById('liveLandedMap');
            if (!mapContainer || typeof window.skhWithLeaflet !== 'function') return;
            window.skhWithLeaflet((L) => {
                if (!document.getElementById('liveLandedMap')) return;
                const liveMap = L.map('liveLandedMap', { zoomControl: true }).setView([-6.7924, 39.2723], 13);
                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(liveMap);
                navigator.geolocation.getCurrentPosition((pos) => {
                    L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(liveMap).bindPopup(`<b>Nipo Hapa</b><br>${skh.skhEscape(skh.currentUser && skh.currentUser.displayName ? skh.currentUser.displayName : 'Dereva')}`).openPopup();
                    liveMap.setView([pos.coords.latitude, pos.coords.longitude], 14);
                });
            });
        }, 150);
    }


    else if (tab === 'finance') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.2s ease-out;">
                <h3 style="color:var(--primary-dark); margin-top:0;"> REVENUE, EXPENSES & COST COCKPIT</h3>
                <p style="color:gray; font-size:12px; margin-bottom:20px;">Rekodi matumizi halisi ya mafuta au ukarabati wa chombo chako.</p>
                <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:20px; max-width:420px;">
                    <b style="color:#0f172a; font-size:13px; display:block; margin-bottom:12px;"> RECORD TRAVEL EXPENSE</b>
                    <select id="expTypeTrans" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; margin-bottom:10px;">
                        <option value="Fuel">⛽ Fuel (Matumizi ya Mafuta)</option>
                        <option value="Maintenance"> Maintenance / Repair</option>
                    </select>
                    <input type="number" id="expAmountTrans" placeholder="${T('dt_expense_ph', 'Expense amount (TSh)...')}" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:10px;">
                    <button onclick="window.skhDriverSaveExpense()" style="width:100%; padding:14px; background:var(--terracotta); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">${T('dt_save', 'Save')} ✓</button>
                </div>
            </div>`;
    }

    // ==========================================
    // 6.  FLEET STATUS (Hali ya Vyombo)
    // ==========================================
    else if (tab === 'fleet') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.2s ease-out;">
                <h3 style="color:var(--primary-dark); margin-top:0;"> FLEET STATUS — HALI YA VYOMBO VYAKO</h3>
                <p style="color:gray; font-size:12px; margin-bottom:20px;">Taarifa halisi ya chombo chako na utendaji kutoka safari zilizorekodiwa.</p>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:15px;">
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:18px;">
                        <b style="font-size:12px; text-transform:uppercase; color:#0f172a; display:block;"> Chombo Chako</b>
                        <span style="font-size:12px; color:gray; display:block; margin-top:6px;">Aina: <b style="color:#0f172a;">${skh.skhEscape(vehicleType)}</b></span>
                        <span style="font-size:12px; color:gray; display:block; margin-top:4px;">Namba: <b style="color:#0f172a;">${skh.skhEscape(plateNo)}</b></span>
                    </div>
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:18px;">
                        <b style="font-size:12px; text-transform:uppercase; color:#0f172a; display:block;"> Safari Zilizokamilika</b>
                        <span id="drvFleetCompleted" style="font-size:22px; color:var(--green); font-weight:900; display:block; margin-top:6px;">—</span>
                        <span style="font-size:11px; color:gray; display:block; margin-top:2px;">Jumla ya safari zote zilizokamilika.</span>
                    </div>
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:18px;">
                        <b style="font-size:12px; text-transform:uppercase; color:#0f172a; display:block;"> Mapato ya Leo</b>
                        <span id="drvFleetEarnings" style="font-size:22px; color:var(--primary-blue); font-weight:900; display:block; margin-top:6px;">—</span>
                        <span style="font-size:11px; color:gray; display:block; margin-top:2px;">Kutoka safari zilizokamilika leo.</span>
                    </div>
                </div>

                <!-- [UTENGANO 2026-09] KUMBUKUMBU RASMI YA USAFIRISHAJI -->
                <div style="margin-top:22px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:var(--primary-dark);">${(window.skhNavIcon ? window.skhNavIcon('clipboard', 18) : '')}</span>
                        <h3 style="color:var(--primary-dark); margin:0; text-transform:uppercase; font-size:14px;">Kumbukumbu ya Usafirishaji</h3>
                    </div>
                    <p style="color:#64748b; font-size:11px; margin:0 0 12px;">Rekodi rasmi za safari zilizokamilika (na migogoro iliyopo) — si mazungumzo. Bonyeza rekodi kuona ufuatiliaji.</p>
                    <div id="driverTripHistoryArea" class="lm-list">
                        <div class="lm-skel"><div class="lm-skel-row"><div class="lm-skel-ico"></div><div style="flex:1;"><div class="lm-skel-bar w70"></div><div class="lm-skel-bar w40"></div></div></div></div>
                    </div>
                </div>
            </div>`;

        if (typeof window.skhDriverFleetStats === 'function') window.skhDriverFleetStats();
        if (typeof window.skhRenderTripHistory === 'function') window.skhRenderTripHistory();
    }

    // ==========================================
    // 7.  DRIVERS DIRECTORY (Orodha ya Madereva)
    // ==========================================
    else if (tab === 'drivers') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.2s ease-out;">
                <h3 style="color:var(--primary-dark); margin-top:0;"> DIRECTORY YA MADEREVA / WASAFIRISHAJI</h3>
                <p style="color:gray; font-size:12px; margin-bottom:20px;">Orodha halisi ya wasafirishaji waliosajiliwa kwenye SokoHai.</p>
                <div id="driverDirectoryArea" style="display:flex; flex-direction:column; gap:12px;">${T('dt_loading', 'Inapakia orodha ya madereva...')}</div>
            </div>`;
        window.loadDriverDirectoryList();
    }

    // ==========================================
    // 8.  PERFORMANCE ANALYTICS (Takwimu za Utendaji)
    // ==========================================
    else if (tab === 'analytics') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.2s ease-out;">
                <h3 style="color:var(--primary-dark); margin-top:0;"> PERFORMANCE ANALYTICS — TAKWIMU ZA UTENDAJI</h3>
                <p style="color:gray; font-size:12px; margin-bottom:20px;">Takwimu halisi za safari zako kulingana na rekodi za SokoHai.</p>
                <div id="driverAnalyticsArea" style="min-height:120px;">${T('dt_loading', 'Inapakia takwimu...')}</div>
            </div>`;
        if (typeof window.skhDriverAnalytics === 'function') window.skhDriverAnalytics();
    }
};

window.loadDriverDirectoryList = function() {
    const area = document.getElementById('driverDirectoryArea');
    if(!area) return;
    // Data HALISI kutoka Firestore (collection: drivers). Hakuna majina ya kudhaniwa.
    try {
        const q = skh.query(skh.collection(skh.db, "drivers"), skh.limit(60));
        skh.getDocs(q).then(function(snap) {
            const items = [];
            if (snap && snap.forEach) snap.forEach(function(d) {
                const dr = d.data() || {};
                // Chuja: mwenyewe asionekane kwenye directory yake mwenyewe.
                if (dr.userId && dr.userId === (skh.currentUser && skh.currentUser.uid)) return;
                items.push({
                    name: dr.driverName || dr.name || dr.fullName || 'Msafirishaji',
                    vehicle: dr.vehicleType || dr.vehicle || 'Chombo',
                    plate: dr.vehicleReg || dr.plateNo || dr.plate || '—',
                    rating: (dr.rating != null) ? Number(dr.rating) : null,
                    region: dr.region || dr.route || dr.baseLocation || '',
                    userId: dr.userId || null
                });
            });
            if (!items.length) {
                area.innerHTML = '<p style="text-align:center; color:#64748b; font-size:12px; padding:20px;">' + T('dt_no_drivers', 'Bado hakuna wasafirishaji waliosajiliwa.') + '</p>';
                return;
            }
            area.innerHTML = items.map(function(d) {
                const name = skh.skhEscape(d.name);
                const meta = skh.skhEscape(d.vehicle + (d.plate !== '—' ? ' · ' + d.plate : '') + (d.region ? ' · ' + d.region : ''));
                const rating = (d.rating != null) ? '<b style="color:var(--gold); font-size:12px;">★ ' + skh.skhEscape(String(d.rating)) + '</b>' : '';
                const action = d.userId
                    ? '<button onclick="window.openChatWithUser(\'' + skh.skhJsEsc(d.userId) + '\', \'' + skh.skhJsEsc(d.name) + '\')" style="margin-top:8px; padding:6px 12px; background:var(--green); color:white; border:none; border-radius:8px; font-weight:bold; font-size:11px; cursor:pointer;">WASILIANA</button>'
                    : '';
                return '<div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:14px; display:flex; justify-content:space-between; align-items:center;">'
                    + '<div><b style="font-size:13px; color:#0f172a; display:block;">' + name + '</b>'
                    + '<small style="color:#64748b;">' + meta + '</small></div>'
                    + '<div style="text-align:right;">' + rating + action + '</div></div>';
            }).join('');
        }).catch(function() {
            area.innerHTML = '<p style="text-align:center; color:#64748b; font-size:12px; padding:20px;">' + T('dt_dir_fail', 'Imeshindwa kupakia orodha ya madereva.') + '</p>';
        });
    } catch (e) {
        area.innerHTML = '<p style="text-align:center; color:#64748b; font-size:12px; padding:20px;">' + T('dt_dir_fail', 'Imeshindwa kupakia orodha ya madereva.') + '</p>';
    }
};

window.renderActiveTabContent = function() {
    const ws = document.getElementById('dashWorkspace');
    if(!ws || !window.dashboardCachedData) return;

    const data = window.dashboardCachedData;
    const tab = window.activeDashboardTab;

    // ==========================================
    // 1.  OVERVIEW - EXECUTIVE TOWER (Renders Real Dashboard Indicators)
    // ==========================================
    if (tab === 'overview') {
        ws.innerHTML = `
        <div style="text-align: left; animation: fadeIn 0.3s ease-out;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #0F172A;">Welcome, Executive Command Room! </h2>
                    <p style="margin: 4px 0 0; color: #64748B; font-size: 13px;">Real-time back-office sales, accounting, and logistics overview.</p>
                </div>
                <div style="background: white; padding: 8px 15px; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 800; color: #475569;">
                     ${new Date().toLocaleDateString('sw-TZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>

            <!-- ROW 1: 5 KPI CARDS WITH SPARKLINE GRAPHS (+ WAFUASI) -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 25px;">
                <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;">
                    <small style="color: #64748B; font-size: 10px; font-weight: bold; text-transform: uppercase;">TOTAL SALES</small>
                    <b style="font-size: 18px; color: #0F172A; display: block; margin: 4px 0;">TZS ${Number(data.totalSales || 0).toLocaleString()}</b>
                    <small style="color: #94A3B8; font-weight: bold;">Kutoka ledger yako</small>
                    <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineSales"></canvas></div>
                </div>
                
                <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;">
                    <small style="color: #64748B; font-size: 10px; font-weight: bold; text-transform: uppercase;">TOTAL PROFIT</small>
                    <b style="font-size: 18px; color: #6366F1; display: block; margin: 4px 0;">TZS ${Number(data.totalProfit || 0).toLocaleString()}</b>
                    <small style="color: #94A3B8; font-weight: bold;">Kutoka ledger yako</small>
                    <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineProfit"></canvas></div>
                </div>

                <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;">
                    <small style="color: #64748B; font-size: 10px; font-weight: bold; text-transform: uppercase;">TOTAL ORDERS</small>
                    <b style="font-size: 18px; color: #0F172A; display: block; margin: 4px 0;">${Number(data.totalOrders || 0).toLocaleString()}</b>
                    <small style="color: #94A3B8; font-weight: bold;">Oda zilizorekodiwa</small>
                    <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineOrders"></canvas></div>
                </div>

                <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;">
                    <small style="color: #64748B; font-size: 10px; font-weight: bold; text-transform: uppercase;">OUTSTANDING DEBT</small>
                    <b style="font-size: 18px; color: #EF4444; display: block; margin: 4px 0;">TZS ${Number(data.activeDebts || 0).toLocaleString()}</b>
                    <small style="color: #94A3B8; font-weight: bold;">Madeni yanayosubiri</small>
                    <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineDebts"></canvas></div>
                </div>

                <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;">
                    <small style="color: #64748B; font-size: 10px; font-weight: bold; text-transform: uppercase;">TOTAL CUSTOMERS</small>
                    <b style="font-size: 18px; color: #06B6D4; display: block; margin: 4px 0;">3,568</b>
                    <small style="color: #22C55E; font-weight: bold;">▲ +5.2%</small>
                    <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineCustomers"></canvas></div>
                </div>

                <!-- [BUYER ENGAGEMENT] WAFUASI (real, kutoka sellerFollowers) -->
                <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;">
                    <small style="color: #64748B; font-size: 10px; font-weight: bold; text-transform: uppercase;">WAFUASI (FOLLOWERS)</small>
                    <b id="kpiFollowersTotal" style="font-size: 18px; color: #8B5CF6; display: block; margin: 4px 0;">…</b>
                    <small style="color: #22C55E; font-weight: bold;"><span id="kpiFollowersNew">+0</span> wiki hii</small>
                    <div style="margin-top: 8px; font-size: 10px; color: #475569; line-height: 1.6;">
                        Active: <b id="kpiFollowersActive">0</b> · Wa kununua: <b id="kpiFollowersConversion">0%</b><br>
                        Wanunuzi wanaorudia: <b id="kpiFollowersRepeat">0</b>
                    </div>
                </div>
            </div>

            <!-- ROW 2: MAIN CHARTS ROW (Overview, Category & Summary) -->
            <div style="display: grid; grid-template-columns: 2.2fr 1.3fr; gap: 15px; margin-bottom: 25px;">
                <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px; box-sizing: border-box;">
                    <b style="font-size: 13px; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">Sales Overview</b>
                    <div style="height: 180px; position: relative; margin-top: 15px;"><canvas id="adaptiveShopChart"></canvas></div>
                </div>

                <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;">
                    <b style="font-size: 13px; color: #0F172A; text-transform: uppercase; margin-bottom: 10px; display: block;">Sales by Category</b>
                    <div style="height: 140px; position: relative;"><canvas id="salesCategoryChart"></canvas></div>
                </div>
            </div>

            <!-- TABLES & METRICS -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px;">
                    <b style="font-size: 12px; color: #0F172A; text-transform: uppercase; margin-bottom: 12px; display: block;"> Top Selling Products</b>
                    <table class="ct-table">
                        <thead>
                            <tr><th>Product</th><th>Sold</th><th>Revenue</th></tr>
                        </thead>
                        <tbody id="topSellingProductsTableBody"></tbody>
                    </table>
                </div>

                <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px;">
                    <b style="font-size: 12px; color: #0F172A; text-transform: uppercase; margin-bottom: 12px; display: block;"> Top Customers</b>
                    <table class="ct-table">
                        <thead>
                            <tr><th>Customer</th><th>Orders</th><th>Total Spent</th></tr>
                        </thead>
                        <tbody id="topCustomersTableBody"></tbody>
                    </table>
                </div>

                <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px;">
                    <b style="font-size: 12px; color: #0F172A; text-transform: uppercase; margin-bottom: 12px; display: block;"> Outstanding Debts</b>
                    <table class="ct-table">
                        <thead>
                            <tr><th>Customer Name</th><th>Amount</th><th>Action</th></tr>
                        </thead>
                        <tbody id="outstandingDebtsTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        
        setTimeout(() => {
            window.initControlTowerCharts(data);
            window.populateControlTowerTables(data.prodSnap, data.ledgerSnap);
            if (typeof window.skhPopulateSellerFollowerKpi === 'function') window.skhPopulateSellerFollowerKpi();
        }, 100);
        return;
    }

    // ==========================================
    // 2.  DETAILED PRODUCT ANALYTICS MODULE (15 Rows)
    // ==========================================
    if (tab === 'product_analytics') {
        ws.innerHTML = `
        <div style="animation: fadeIn 0.3s ease; display: flex; flex-direction: column; gap: 20px; text-align:left;">
            
            <h2 style="margin:0; font-size:20px; color:#0f172a; font-weight:800;"> Product Analytics Tower</h2>
            <p style="margin:0; color:#64748b; font-size:12px; margin-top:-15px;">Control Tower dashboard ya bidhaa zote za duka.</p>

            <!-- ROW 1: 8 KPI CARDS -->
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;">
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> TOTAL PRODUCTS</small>
                    <b style="font-size:16px; color:#0f172a; display:block; margin-top:4px;">1,250</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> ACTIVE PRODUCTS</small>
                    <b style="font-size:16px; color:#10b981; display:block; margin-top:4px;">1,100</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;">⚪ DRAFT PRODUCTS</small>
                    <b style="font-size:16px; color:#64748b; display:block; margin-top:4px;">100</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> OUT OF STOCK</small>
                    <b style="font-size:16px; color:#ef4444; display:block; margin-top:4px;">50</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> LOW STOCK</small>
                    <b style="font-size:16px; color:#f59e0b; display:block; margin-top:4px;">120</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> TOP SELLING PRODUCT</small>
                    <b style="font-size:16px; color:#0284c7; display:block; margin-top:4px;">Rice 25kg</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> INVENTORY VALUE</small>
                    <b style="font-size:16px; color:#0f172a; display:block; margin-top:4px;">TZS 45,000,000</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> PRODUCT GROWTH</small>
                    <b style="font-size:16px; color:#22c55e; display:block; margin-top:4px;">+12%</b>
                </div>
            </div>

            <!-- ROW 2: PRODUCT SALES PERFORMANCE (Line Chart) -->
            <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:15px;"> Sales Trend by Product (Rice vs Sugar vs Oil)</b>
                <div style="height:200px;"><canvas id="chart_pDemand"></canvas></div>
            </div>

            <!-- ROW 3: TOP & WORST SELLING PRODUCTS -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <!-- Top Selling -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px; color:green;"> Top Selling Products</b>
                    <table style="width:100%; font-size:11px; border-collapse:collapse;">
                        <thead>
                            <tr style="border-bottom:1px solid #eee; text-align:left; color:gray;"><th style="padding:6px 0;">Product</th><th>Units Sold</th><th>Revenue</th><th>Profit</th></tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; font-weight:bold;">Rice 25kg</td><td>520</td><td>10M</td><td style="color:green; font-weight:bold;">2.4M</td></tr>
                            <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; font-weight:bold;">Sugar</td><td>430</td><td>8M</td><td style="color:green; font-weight:bold;">1.8M</td></tr>
                            <tr><td style="padding:8px 0; font-weight:bold;">Cooking Oil</td><td>380</td><td>6M</td><td style="color:green; font-weight:bold;">1.1M</td></tr>
                        </tbody>
                    </table>
                </div>
                <!-- Worst Selling -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px; color:red;"> Worst Selling Products</b>
                    <table style="width:100%; font-size:11px; border-collapse:collapse;">
                        <thead>
                            <tr style="border-bottom:1px solid #eee; text-align:left; color:gray;"><th style="padding:6px 0;">Product</th><th>Days Unsold</th><th>Stock</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; font-weight:bold;">Printer</td><td>90 Days</td><td>10</td><td>2M</td></tr>
                            <tr><td style="padding:8px 0; font-weight:bold;">TV</td><td>60 Days</td><td>4</td><td>1.5M</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ROW 4 & 5: CATEGORY PERFORMANCE & INVENTORY HEALTH -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <!-- Category Performance -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px; display:flex; gap:15px; align-items:center;">
                    <div style="flex:1; height:150px; position:relative;"><canvas id="chart_pCategories"></canvas></div>
                    <div style="flex:1; font-size:11px; display:flex; flex-direction:column; gap:8px;">
                        <b style="color:#0f172a; text-transform:uppercase;">Category Performance</b>
                        <span> Electronics (40%)</span>
                        <span> Groceries (30%)</span>
                        <span> Fashion (20%)</span>
                        <span> Others (10%)</span>
                    </div>
                </div>
                <!-- Inventory Health -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px; display:flex; gap:15px; align-items:center;">
                    <div style="flex:1; height:150px; position:relative;"><canvas id="chart_pHealth"></canvas></div>
                    <div style="flex:1; font-size:11px; display:flex; flex-direction:column; gap:8px;">
                        <b style="color:#0f172a; text-transform:uppercase;">Inventory Health</b>
                        <span> Healthy Stock</span>
                        <span> Low Stock</span>
                        <span> Out of Stock</span>
                        <span> Overstock</span>
                    </div>
                </div>
            </div>

            <!-- ROW 6 & 7: STOCK MOVEMENT & PROFITABILITY ANALYSIS -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <!-- Stock Movement -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Stock Movement</b>
                    <div style="height:150px;"><canvas id="chart_pReturns"></canvas></div>
                </div>
                <!-- Profitability Analysis -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Profitability by Product</b>
                    <div style="height:150px;"><canvas id="chart_pProfit"></canvas></div>
                </div>
            </div>

            <!-- ROW 8 & 9: PRODUCT VIEWS VS SALES & DEMAND HEATMAP -->
            <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap:15px;">
                <!-- Funnel -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Product Conversion (Views ➔ Sales)</b>
                    <div style="height:180px;"><canvas id="chart_pConversion"></canvas></div>
                </div>
                <!-- Demand Heatmap -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px; display:flex; flex-direction:column; text-align:left;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Customer Demand Matrix (Time vs Day)</b>
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; font-size:11px; text-align:center;">
                        <div style="background:#f1f5f9; padding:6px; font-weight:bold;">Day / Time</div>
                        <div style="background:#f1f5f9; padding:6px; font-weight:bold;">Morning</div>
                        <div style="background:#f1f5f9; padding:6px; font-weight:bold;">Afternoon</div>
                        <div style="background:#f1f5f9; padding:6px; font-weight:bold;">Evening</div>
                        
                        <div style="font-weight:bold; padding:6px;">Mon</div>
                        <div style="background:#bbf7d0; padding:6px;">High</div>
                        <div style="background:#fef08a; padding:6px;">Med</div>
                        <div style="background:#bbf7d0; padding:6px;">High</div>

                        <div style="font-weight:bold; padding:6px;">Tue</div>
                        <div style="background:#fef08a; padding:6px;">Med</div>
                        <div style="background:#fecaca; padding:6px;">Low</div>
                        <div style="background:#bbf7d0; padding:6px;">High</div>

                        <div style="font-weight:bold; padding:6px;">Wed</div>
                        <div style="background:#bbf7d0; padding:6px;">High</div>
                        <div style="background:#bbf7d0; padding:6px;">High</div>
                        <div style="background:#bbf7d0; padding:6px;">High</div>
                    </div>
                </div>
            </div>

            <!-- ROW 10 & 11: RETURNS & RATINGS -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <!-- Returns -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px; color:red;"> Returns & Refunds</b>
                    <div style="display:flex; align-items:center; gap:15px; margin-bottom:10px;">
                        <div style="width:40%; height:110px; position:relative;"><canvas id="chart_pReturnsDonut"></canvas></div>
                        <div style="width:60%; font-size:10px; text-align:left;">
                            <div> Returned (40%)</div>
                            <div> Damaged (30%)</div>
                            <div> Wrong Item (20%)</div>
                            <div> Refunded (10%)</div>
                        </div>
                    </div>
                </div>
                <!-- Ratings -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:20px; text-align:left;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:8px; color:var(--gold);"> Product Ratings & Reviews</b>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div>
                            <h1 style="margin:0; font-size:36px; color:#0f172a;">4.8</h1>
                            <span style="color:var(--gold); font-size:14px;">★★★★★</span>
                        </div>
                        <div style="font-size:10px; flex-grow:1; margin-left:25px; display:flex; flex-direction:column; gap:3px;">
                            <div>5 Star: <b>70%</b></div>
                            <div>4 Star: <b>20%</b></div>
                            <div>3 Star: <b>5%</b></div>
                            <div>2 Star: <b>3%</b></div>
                            <div>1 Star: <b>2%</b></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ROW 12, 13 & 14: LOCATION, UNIT CONVERSIONS & EXPIRY -->
            <div style="display:grid; grid-template-columns: 1fr 1.2fr 1fr; gap:15px; text-align:left;">
                <!-- Location -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:15px;">
                    <b style="font-size:11px; text-transform:uppercase; display:block; margin-bottom:8px;"> Top Sales Regions</b>
                    <div style="font-size:12px; display:flex; flex-direction:column; gap:6px;">
                        <div> Dar es Salaam - <b style="color:green;">60%</b></div>
                        <div> Mwanza - <b style="color:green;">20%</b></div>
                        <div> Arusha - <b style="color:green;">12%</b></div>
                        <div> Mbeya - <b style="color:green;">8%</b></div>
                    </div>
                </div>
                <!-- Unit conversions -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:15px;">
                    <b style="font-size:11px; text-transform:uppercase; display:block; margin-bottom:8px;">⚖ Multi-Unit Conversion Engine</b>
                    <table style="width:100%; font-size:11px; text-align:left; border-collapse:collapse;">
                        <thead>
                            <tr style="border-bottom:1px solid #eee; color:gray;"><th>Product</th><th>Parent Unit</th><th>Base Unit</th><th>Total Pieces</th></tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #f1f5f9;"><td>Soda</td><td>10 Crates</td><td>240 Bottles</td><td style="font-weight:bold;">240</td></tr>
                            <tr style="border-bottom:1px solid #f1f5f9;"><td>Soap</td><td>5 Boxes</td><td>120 Pieces</td><td style="font-weight:bold;">120</td></tr>
                        </tbody>
                    </table>
                </div>
                <!-- Expiry -->
                <div style="background:white; border:1px solid #CBD5E1; border-radius:18px; padding:15px;">
                    <b style="font-size:11px; text-transform:uppercase; display:block; margin-bottom:8px; color:#ea580c;"> Product Expiry Analytics</b>
                    <div style="font-size:12px; display:flex; flex-direction:column; gap:6px;">
                        <div style="color:red; font-weight:bold;"> Expired: 5 Items</div>
                        <div style="color:orange; font-weight:bold;"> Expiring in 7 Days: 12 Items</div>
                        <div style="color:green; font-weight:bold;"> Safe: 1,233 Items</div>
                    </div>
                </div>
            </div>

            <!-- ROW 15: AI INSIGHTS PANEL -->
            <div style="background:#f0f9ff; border:1.5px dashed var(--primary-blue); border-radius:16px; padding:20px; text-align:left;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; border-bottom:1px solid #bfdbfe; padding-bottom:6px;">
                    <span style="font-size:24px;"></span>
                    <b style="color:var(--primary-blue); font-size:14px; text-transform:uppercase;">Sokohai AI Product Insights Panel</b>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12px;">
                    <div style="background:white; padding:10px; border-radius:10px; border-left:4px solid #10b981;">
                         <b>Rice sales increased 25%</b>: Kuza matangazo yake ya ofa wiki hii.
                    </div>
                    <div style="background:white; padding:10px; border-radius:10px; border-left:4px solid #10b981;">
                         <b>Sugar stock will finish in 4 days</b>: Agiza mzigo mpya sasa.
                    </div>
                    <div style="background:white; padding:10px; border-radius:10px; border-left:4px solid #10b981;">
                         <b>Cooking Oil demand is rising</b>: Ongeza bei kidogo au dhibiti stoo.
                    </div>
                    <div style="background:white; padding:10px; border-radius:10px; border-left:4px solid #10b981;">
                         <b>TV stock inactive for 60 days</b>: Weka discount ili kupunguza bidhaa.
                    </div>
                </div>
            </div>

        </div>`;

        setTimeout(() => {
            window.initProductAnalyticsCharts(data);
        }, 100);
        return;
    }

    // ==========================================
    // 3.  INVENTORY & STOCK - THE COMPLETE LIFE-CYCLE (With conversion & warehouse valuation)
    // ==========================================
    if (tab === 'inventory') {
        let totalCostValue = 0;
        let totalSellingValue = 0;
        let reorderList = [];
        let stockItemsRows = '';

        // Jaza bidhaa zilizopo stoo
        data.prodSnap.forEach(docSnap => {
            const p = docSnap.data();
            const stock = parseFloat(p.stock) || 0;
            const buyPrice = parseFloat(p.buyPrice) || 0;
            const sellPrice = parseFloat(p.price) || 0;
            const reorderLevel = parseInt(p.lowStockAlert) || 5;

            totalCostValue += (stock * buyPrice);
            totalSellingValue += (stock * sellPrice);

            if (stock <= reorderLevel) {
                const suggestedQty = (reorderLevel * 4) - stock;
                reorderList.push({ ...p, currentStock: stock, reorderLevel, suggestedQty });
            }

            // Base Unit Conversion Display (e.g. Crates to Bottles)
            let multiUnitText = `${stock} Pcs`;
            if (p.hasBulkPackaging && p.conversionRatio > 1) {
                const bulkCount = Math.floor(stock / p.conversionRatio);
                const remainingUnits = stock % p.conversionRatio;
                multiUnitText = `<b>${bulkCount} ${p.bulkUnit || 'Boxes'}</b> (${remainingUnits} ${p.baseUnit || 'Pcs'})`;
            }

            const isLow = stock <= reorderLevel;

            stockItemsRows += `
                <tr style="border-bottom:1px solid #f1f5f9; font-size:12px; text-align:left;">
                    <td style="padding:10px 0; font-weight:bold;"> ${p.title}</td>
                    <td style="color:#475569;">${p.barcode || 'N/A'}</td>
                    <td>${multiUnitText}</td>
                    <td>Piece</td>
                    <td>
                        <span style="background:${isLow ? '#fee2e2':'#dcfce7'}; color:${isLow ? '#ef4444':'#16a34a'}; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:bold;">
                            ${isLow ? 'LOW STOCK':'HEALTHY'}
                        </span>
                    </td>
                </tr>`;
        });

        const expectedProfit = totalSellingValue - totalCostValue;

        ws.innerHTML = `
        <div style="animation: fadeIn 0.3s ease; display:flex; flex-direction:column; gap:20px; text-align:left;">
            <h2 style="margin:0; font-size:20px; color:#0f172a; font-weight:800;"> Inventory & Stock Control Room</h2>
            
            <!-- ROW 1: 8 INVENTORY KPI CARDS -->
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;">
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> TOTAL SKUs</small>
                    <b style="font-size:16px; color:#0f172a; display:block; margin-top:4px;">1,250</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> TOTAL STOCK UNITS</small>
                    <b style="font-size:16px; color:#10b981; display:block; margin-top:4px;">52,000 Pcs</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> INVENTORY VALUE</small>
                    <b style="font-size:16px; color:#0284c7; display:block; margin-top:4px;">TZS 85,000,000</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> LOW STOCK</small>
                    <b style="font-size:16px; color:#f59e0b; display:block; margin-top:4px;">25</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> OUT OF STOCK</small>
                    <b style="font-size:16px; color:#ef4444; display:block; margin-top:4px;">10</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> PENDING RECEIPTS</small>
                    <b style="font-size:16px; color:#6366f1; display:block; margin-top:4px;">5</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> WAREHOUSES</small>
                    <b style="font-size:16px; color:#06b6d4; display:block; margin-top:4px;">3</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> STOCK TURNOVER</small>
                    <b style="font-size:16px; color:#22c55e; display:block; margin-top:4px;">8.5x</b>
                </div>
            </div>

            <!-- ROW 2: MOVEMENT & VALUATION CHARTS -->
            <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px;">
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Stock Movement Trend (In vs Out)</b>
                    <div style="height:150px;"><canvas id="invMovementLine"></canvas></div>
                </div>
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Valuation by Warehouse</b>
                    <div style="height:150px;"><canvas id="invWarehouseValuationBar"></canvas></div>
                </div>
            </div>

            <!-- ROW 3: DETAILED STOCK TABLE (Base Unit Conversion Aware) -->
            <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:15px; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> STOCK OVERVIEW (MULTI-UNIT CONVERSIONS)</b>
                <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">Product</th><th>Barcode</th><th>Current Stock</th><th>Base Unit</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${stockItemsRows || `
                            <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; font-weight:bold;"> Sugar Bag</td><td>N/A</td><td><b>5 Boxes</b> (60 Pcs)</td><td>Piece</td><td><span style="background:#dcfce7; color:#16a34a; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:bold;">HEALTHY</span></td></tr>
                        `}
                    </tbody>
                </table>
            </div>

            <!-- ROW 4: REORDERS & DAMAGES -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <!-- Reorders -->
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px; color:#d97706;"> Reorder Alerts</b>
                    <div style="display:flex; flex-direction:column; gap:8px; font-size:11px;">
                        ${reorderList.length > 0 ? reorderList.map(p => `
                            <div style="background:#fffbeb; padding:10px; border-radius:8px; border-left:4px solid #d97706; margin-bottom:6px;">
                                <b>${p.title}</b> is running low. Current Stock: <b>${p.currentStock} Pcs</b>. Suggested Order: <b style="color:green;">+${p.suggestedQty} Pcs</b> [1].
                            </div>
                        `).join('') : '<p style="color:gray; font-style:italic;">Stoo ipo salama! Hakuna bidhaa inayokaribia kuisha stoo.</p>'}
                    </div>
                </div>
                <!-- Damage Analysis -->
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px; display:flex; gap:15px; align-items:center;">
                    <div style="flex:1; height:120px; position:relative;"><canvas id="invDamagesChart"></canvas></div>
                    <div style="flex:1; font-size:11px; display:flex; flex-direction:column; gap:6px;">
                        <b style="color:#0f172a; text-transform:uppercase;">Damages & Expiry</b>
                        <span> Damaged (40%)</span>
                        <span> Expired (30%)</span>
                        <span> Lost (20%)</span>
                        <span> Other (10%)</span>
                    </div>
                </div>
            </div>

        </div>`;

        setTimeout(() => {
            // Sasa tunatumia chombo kipya 'safeCreateChart' kuzuia canvas crashes
            window.safeCreateChart('invMovementLine', {
                type: 'line',
                data: {
                    labels: ['01 Jun', '05 Jun', '09 Jun', '13 Jun', '17 Jun', '19 Jun'],
                    datasets: [
                        { label: 'Stock In', data: [100, 150, 80, 220, 190, 310], borderColor: '#10b981', fill: false },
                        { label: 'Stock Out', data: [40, 80, 50, 120, 110, 180], borderColor: '#ef4444', fill: false }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

            window.safeCreateChart('invWarehouseValuationBar', {
                type: 'bar',
                data: {
                    labels: ['Main Warehouse', 'Kariakoo Branch', 'Mbezi Branch'],
                    datasets: [{
                        label: 'Stock Value (TSh)',
                        data: [45000000, 25000000, 15000000],
                        backgroundColor: ['#6366f1', '#10b981', '#f59e0b']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

            window.safeCreateChart('invDamagesChart', {
                type: 'doughnut',
                data: {
                    labels: ['Damaged', 'Expired', 'Lost', 'Other'],
                    datasets: [{
                        data: [40, 30, 20, 10],
                        backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#cbd5e1'],
                        borderWidth: 0
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
            });
        }, 100);
        return;
    }

    // ==========================================
    // 4.  GENERAL LEDGER (DAFTARI KUU LA HASIBU)
    // ==========================================
    if (tab === 'expenses') {
        let expHtml = '';
        let debtHtml = '';
        let journalRows = '';
        
        data.ledgerSnap.forEach(docSnap => {
            const l = docSnap.data();
            const dateStr = new Date(l.date).toLocaleDateString();
            
            if (l.type === 'expense') {
                expHtml += `
                    <div style="padding:10px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; font-size:11px; text-align:left;">
                        <span><b>${l.title}</b><br><small>${dateStr}</small></span>
                        <b style="color:red;">- TSh ${l.amount.toLocaleString()}</b>
                    </div>`;
                    
                journalRows += `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td>${dateStr}</td>
                        <td>${l.title}</td>
                        <td style="color:red;">-</td>
                        <td style="color:red; font-weight:bold;">TSh ${l.amount.toLocaleString()}</td>
                    </tr>`;
            } else if (l.type === 'income_offline' || l.type === 'income_online') {
                journalRows += `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td>${dateStr}</td>
                        <td>${l.title}</td>
                        <td style="color:green; font-weight:bold;">TSh ${l.amount.toLocaleString()}</td>
                        <td style="color:green;">-</td>
                    </tr>`;
            } else if (l.type === 'debt' && l.status === 'pending') {
                debtHtml += `
                    <div style="padding:12px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; font-size:11px; text-align:left; background:#fff5f5; border-radius:10px; margin-bottom:8px;">
                        <div>
                            <b> ${l.title}</b><br>
                            <small>${skh.skhEscape(l.notes || '')}</small><br>
                            <small style="color:gray;">Muda: ${dateStr}</small>
                        </div>
                        <div style="text-align:right;">
                            <b style="color:red; display:block; margin-bottom:5px;">TSh ${l.amount.toLocaleString()}</b>
                            <button onclick="window.markDebtPaid('${docSnap.id}', ${l.amount})" style="padding:4px 8px; background:var(--green); color:white; border:none; border-radius:5px; font-weight:bold; font-size:10px; cursor:pointer;">LIPWA ✓</button>
                        </div>
                    </div>`;
            }
        });

        ws.innerHTML = `
        <div style="animation: fadeIn 0.3s ease; display:flex; flex-direction:column; gap:20px; text-align:left;">
            <h2 style="margin:0; font-size:20px; color:#0f172a; font-weight:800;"> General Ledger (Daftari Kuu)</h2>
            
            <!-- ROW 1: 8 FINANCIAL KPI CARDS -->
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;">
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold; text-transform:uppercase;"> CASH BALANCE</small>
                    <b style="font-size:16px; color:#10b981; display:block; margin-top:4px;">TZS 5,000,000</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold; text-transform:uppercase;"> BANK BALANCE</small>
                    <b style="font-size:16px; color:#0284c7; display:block; margin-top:4px;">TZS 15,000,000</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold; text-transform:uppercase;"> RECEIVABLES (MATEJA)</small>
                    <b style="font-size:16px; color:#f59e0b; display:block; margin-top:4px;">TZS ${(data.activeDebts || 3000000).toLocaleString()}</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold; text-transform:uppercase;"> PAYABLES (SUPPLIERS)</small>
                    <b style="font-size:16px; color:#ef4444; display:block; margin-top:4px;">TZS 2,000,000</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold; text-transform:uppercase;"> REVENUE</small>
                    <b style="font-size:16px; color:#06b6d4; display:block; margin-top:4px;">TZS ${(data.totalSales || 20000000).toLocaleString()}</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold; text-transform:uppercase;"> EXPENSES</small>
                    <b style="font-size:16px; color:#ea580c; display:block; margin-top:4px;">TZS ${(data.totalExpenses || 8000000).toLocaleString()}</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold; text-transform:uppercase;"> NET PROFIT</small>
                    <b style="font-size:16px; color:#10b981; display:block; margin-top:4px;">TZS ${(data.totalProfit || 12000000).toLocaleString()}</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold; text-transform:uppercase;"> UNRECONCILED</small>
                    <b style="font-size:16px; color:#64748b; display:block; margin-top:4px;">5 Entries</b>
                </div>
            </div>

            <!-- ROW 2: GENERAL LEDGER CHARTS -->
            <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px;">
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Revenue Trend & Escrow Dynamics</b>
                    <div style="height:150px;"><canvas id="ledgerRevenueLine"></canvas></div>
                </div>
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px; display:flex; gap:15px; align-items:center;">
                    <div style="flex:1; height:120px; position:relative;"><canvas id="ledgerExpenseDonut"></canvas></div>
                    <div style="flex:1; font-size:11px; display:flex; flex-direction:column; gap:6px;">
                        <b style="color:#0f172a; text-transform:uppercase;">Gharama (Expenses)</b>
                        <span> Rent (40%)</span>
                        <span> Salary (35%)</span>
                        <span> Transport (15%)</span>
                        <span> Utilities (10%)</span>
                    </div>
                </div>
            </div>

            <!-- ROW 3: REAL JOURNAL ENTRIES -->
            <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:15px; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> JOURNAL ENTRIES (KITABU CHA MIAMALA)</b>
                <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">Tarehe</th><th>Maelezo / Miamala</th><th style="color:green;">Debit (Ingia)</th><th style="color:red;">Credit (Toka)</th></tr>
                    </thead>
                    <tbody>
                        ${journalRows || `
                            <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;">${new Date().toLocaleDateString('sw-TZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td><td>Mauzo ya POS (Cash)</td><td style="color:green; font-weight:bold;">TSh 50,000</td><td style="color:red;">-</td></tr>
                        `}
                    </tbody>
                </table>
            </div>

        </div>`;

        setTimeout(() => {
            window.safeCreateChart('ledgerRevenueLine', {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Escrow Released TZS',
                        data: [3000000, 5000000, 4500000, 7000000, 8500000, data.totalSales],
                        borderColor: '#10b981',
                        fill: false
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

            window.safeCreateChart('ledgerExpenseDonut', {
                type: 'doughnut',
                data: {
                    labels: ['Rent', 'Salary', 'Transport', 'Utilities'],
                    datasets: [{
                        data: [40, 35, 15, 10],
                        backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#cbd5e1'],
                        borderWidth: 0
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
            });
        }, 100);
        return;
    }

    // ==========================================
    // 5.  STAFF & PAYROLL MODULE (Kazi, Mahudhurio na Mipangilio Maalum ya Mhudumu)
    // ==========================================
    if (tab === 'staff') {
        let staffRows = '';
        data.staffSnap.forEach(docSnap => {
            const s = docSnap.data();
            const salary = parseFloat(s.salary) || 300000;
            const paid = parseFloat(s.paidSalary) || 0;
            const pending = salary - paid;

            staffRows += `
                <tr style="border-bottom:1px solid #f1f5f9; font-size:12px; text-align:left;">
                    <td style="padding:10px 0; font-weight:bold;"> ${s.name}</td>
                    <td>${s.role || 'Cashier'}</td>
                    <td>${s.status || 'Active'}</td>
                    <td>TSh ${salary.toLocaleString()}</td>
                    <td style="color:green; font-weight:bold;">TSh ${paid.toLocaleString()}</td>
                    <td style="color:red; font-weight:bold;">TSh ${pending.toLocaleString()}</td>
                </tr>`;
        });

        ws.innerHTML = `
        <div style="animation: fadeIn 0.3s ease; display:flex; flex-direction:column; gap:20px; text-align:left;">
            <h2 style="margin:0; font-size:20px; color:#0f172a; font-weight:800;"> Staff & Payroll Management</h2>
            
            <!-- ROW 1: KPI CARDS -->
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;">
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> TOTAL STAFF</small>
                    <b style="font-size:16px; color:#0f172a; display:block; margin-top:4px;">25</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> PRESENT TODAY</small>
                    <b style="font-size:16px; color:#10b981; display:block; margin-top:4px;">20</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> MONTHLY PAYROLL</small>
                    <b style="font-size:16px; color:var(--primary-blue); display:block; margin-top:4px;">TZS 8,000,000</b>
                </div>
                <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">
                    <small style="color:gray; font-size:9px; font-weight:bold;"> TOP PERFORMER</small>
                    <b style="font-size:16px; color:#06b6d4; display:block; margin-top:4px;">John (Cashier)</b>
                </div>
            </div>

            <!-- ROW 2: STAFF PERFORMANCE CHARTS -->
            <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px;">
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Attendance Trend (Weekly)</b>
                    <div style="height:150px;"><canvas id="chart_pAttendanceLine"></canvas></div>
                </div>
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px; display:flex; gap:15px; align-items:center;">
                    <div style="flex:1; height:120px; position:relative;"><canvas id="chart_pStaffDistributionDonut"></canvas></div>
                    <div style="flex:1; font-size:11px; display:flex; flex-direction:column; gap:6px;">
                        <b style="color:#0f172a; text-transform:uppercase;">Staff Distribution</b>
                        <span> Sales (40%)</span>
                        <span> Operations (30%)</span>
                        <span> Finance (20%)</span>
                    </div>
                </div>
            </div>

            <!-- ROW 3: DETAILED EMPLOYEES TABLE -->
            <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:15px; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> EMPLOYEES DIRECTORY & PAYROLL DETAILS</b>
                <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">Name</th><th>Role</th><th>Status</th><th>Salary</th><th>Paid</th><th>Pending</th></tr>
                    </thead>
                    <tbody>
                        ${staffRows || `
                            <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; font-weight:bold;"> Ali Hassan</td><td>Cashier</td><td>Active</td><td>TSh 300,000</td><td style="color:green; font-weight:bold;">TSh 300,000</td><td style="color:red; font-weight:bold;">TSh 0</td></tr>
                        `}
                    </tbody>
                </table>
            </div>

        </div>`;

        setTimeout(() => {
            window.safeCreateChart('chart_pAttendanceLine', {
                type: 'line',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                        label: 'Present Count',
                        data: [18, 20, 19, 21, 20, 15, 12],
                        borderColor: '#3b82f6',
                        fill: false
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

            window.safeCreateChart('chart_pStaffDistributionDonut', {
                type: 'doughnut',
                data: {
                    labels: ['Sales', 'Operations', 'Finance'],
                    datasets: [{
                        data: [40, 30, 20],
                        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
                        borderWidth: 0
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
            });
        }, 100);
        return;
    }

    // ==========================================
    // 6. ⚙ SYSTEM SETTINGS
    // ==========================================
    if (tab === 'settings') {
        const s = skh.currentUserData?.shopSettings || {
            stockMode: 'strict',
            showSales: true,
            showProfit: true,
            showLowStock: true,
            showDebts: true,
            cashierCanViewProfit: false,
            cashierCanEditStock: false
        };

        ws.innerHTML = `
            <div style="text-align: left; animation: fadeIn 0.3s ease;">
                <h3 style="margin-top:0; color: var(--primary-dark); font-weight:900; text-transform: uppercase;">⚙ USANIDI NA SHERIA ZA BIASHARA</h3>
                
                <div style="background:#f8fafc; padding:20px; border-radius:18px; border:1px solid #cbd5e1; margin-bottom:20px;">
                    <label style="font-size:12px; font-weight:bold; color:var(--primary-dark); display:block; margin-bottom:5px;">STOCK MODE (SHERIA ZA STOO) *</label>
                    <select id="setStockMode" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;">
                        <option value="strict" ${s.stockMode === 'strict' ? 'selected' : ''}> Strict (Zuia kuuza stoo ikiisha)</option>
                        <option value="flexible" ${s.stockMode === 'flexible' ? 'selected' : ''}> Flexible (Ruhusu kuuza stoo ikiisha)</option>
                    </select>
                </div>

                <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:15px; margin-bottom:20px;">
                    <b style="font-size:12px; color:var(--primary-dark); display:block; margin-bottom:12px; text-transform:uppercase;"> MAMLAKA YA CASHIER (PERMISSIONS)</b>
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:12px; margin-bottom:10px;">
                        <input type="checkbox" id="setCashierViewProfit" ${s.cashierCanViewProfit ? 'checked':''} style="width:18px; height:18px;">
                        Mpe Cashier uwezo wa kuona ripoti ya Faida (Profit)
                    </label>
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:12px;">
                        <input type="checkbox" id="setCashierEditStock" ${s.cashierCanEditStock ? 'checked':''} style="width:18px; height:18px;">
                        Mpe Cashier uwezo wa kuhariri au kuongeza Stock stoo
                    </label>
                </div>

                <button onclick="window.saveShopSettings()" id="btnSaveShopSettings" style="width:100%; padding:16px; background:var(--green); color:white; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer; text-transform:uppercase;"> HIFADHI USANIDI ✓</button>
            </div>`;
        return;
    }
};

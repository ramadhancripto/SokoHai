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


/* ============================================================================
   [DATA INTEGRITY 2026-11-03] Wasaidizi wa uadilifu wa data
   ----------------------------------------------------------------------------
   Kanuni: kila namba inayoonyeshwa LAZIMA itokane na data halisi
   (`dashboardCachedData`: products, shop_ledger, shop_staff, purchase_orders).
   Data isipokuwa ipo → `—` au empty state yenye maelezo. Hakuna namba za kubuni.

   Hali tatu zinatenganishwa waziwazi:
     • LOADING → "Inapakia…" (skeleton ya shell)
     • EMPTY   → "Hakuna data" + sababu + kinachofuata
     • ERROR   → "Imeshindikana kupakia" + sababu
   ========================================================================== */
const SKH_NA = '—';
const skhIsNum = (v) => typeof v === 'number' && isFinite(v);

/* Snapshot (Firestore) AU array → array ya data safi. */
function skhDocs(snap) {
    const out = [];
    try {
        if (snap && typeof snap.forEach === 'function' && typeof snap.size === 'number') {
            snap.forEach(d => out.push(Object.assign({ id: d.id }, d.data() || {})));
        } else if (Array.isArray(snap)) {
            snap.forEach(x => out.push(x && x.data ? Object.assign({ id: x.id }, x.data() || {}) : x));
        }
    } catch (e) { }
    return out;
}
function skhHasDocs(snap) { return skhDocs(snap).length > 0; }

function skhMoney(v) { return skhIsNum(v) ? 'TZS ' + Math.round(v).toLocaleString('en-US') : SKH_NA; }
function skhCount(v) { return skhIsNum(v) ? Math.round(v).toLocaleString('en-US') : SKH_NA; }

/* Kadi ya KPI. `hint` huonekana chini ya thamani (mf. "Hakuna data"). */
function skhKpi(label, value, hint, tone) {
    const isNa = String(value) === SKH_NA;
    return '<div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:14px;">'
        + '<small style="color:gray; font-size:12px; font-weight:bold;"> ' + label + '</small>'
        + '<b style="font-size:16px; color:' + (isNa ? '#94A3B8' : (tone || '#0f172a')) + '; display:block; margin-top:4px;">' + value + '</b>'
        + (hint ? '<span style="display:block; margin-top:3px; font-size:11px; color:#94A3B8; line-height:1.3;">' + hint + '</span>' : '')
        + '</div>';
}
function skhKpiGrid(cards) {
    return '<div class="bos-kpi-grid">' + cards.join('') + '</div>';
}

/* Sanduku la hali (empty / error / loading). */
function skhStateBox(kind, title, msg, action) {
    const palette = {
        empty: ['#F8FBFA', '#D5E2DE', '#18352D'],
        error: ['#FFF5F5', '#F2D7D5', '#8A2C27'],
        loading: ['#F8FBFA', '#D5E2DE', '#526962'],
        warn: ['#FFF8E6', '#F0DFAE', '#5C4A12']
    }[kind] || ['#F8FBFA', '#D5E2DE', '#18352D'];
    return '<div style="background:' + palette[0] + '; border:1px solid ' + palette[1] + '; border-radius:14px; padding:18px; color:' + palette[2] + '; text-align:center;">'
        + '<b style="display:block; font-size:13.5px; margin-bottom:4px;">' + title + '</b>'
        + '<span style="font-size:12.5px; line-height:1.45; opacity:.9;">' + msg + '</span>'
        + (action || '') + '</div>';
}

/* Sanduku la chart: data ikiwepo → canvas; isipo → maelezo (hakuna namba za kubuni). */
function skhChartCard(title, canvasId, hasData, noDataMsg, height) {
    return '<div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">'
        + '<b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> ' + title + '</b>'
        + (hasData
            ? '<div style="height:' + (height || 150) + 'px;"><canvas id="' + canvasId + '"></canvas></div>'
            : skhStateBox('empty', 'Hakuna data', noDataMsg || 'Hakuna rekodi zilizopakiwa kwa chart hii.'))
        + '</div>';
}

/* Ramani ya rafu/sanduku la jedwali tupu. */
function skhTableEmpty(cols, msg) {
    return '<tr><td colspan="' + cols + '" style="padding:14px 0; color:#7E9A91; font-size:12.5px; text-align:center;">' + msg + '</td></tr>';
}

try {
    window.skhDataStates = { NA: SKH_NA, docs: skhDocs, hasDocs: skhHasDocs, money: skhMoney, count: skhCount };
} catch (e) { }

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

/* [REPAIR 2026-11-04] Token Center markup umoja: unatumika na dashibodi ya
   Usafirishaji (dereva) NA Business OS (mmiliki wa biashara). Markup ni ule
   ule uliokuwepo — hakuna UI iliyoongezwa au kuondolewa. */
window.skhTokenCenterHtml = function () {
    return `
            <div style="text-align:left; animation: fadeIn 0.3s ease;"> <h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> SOKOPAY LOGISTICS TOKEN CENTER</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Dhibiti, hakiki na uwasilishe tokens za uokoaji na upelekaji mizigo [1].</p> <!-- PICKUP VERIFICATION BOX (TOKEN A) --> <div style="background:#fffbeb; border:1.5px dashed var(--gold); padding:20px; border-radius:16px; margin-bottom:20px;"> <b style="color:#d97706; font-size:13px; display:block; margin-bottom:10px; text-transform:uppercase;"> 1. PICKUP VERIFICATION (TOKEN A)</b> <p style="font-size:13px; color:#475569; margin-bottom:15px;">Weka Token A (Pickup Token) uliyopewa na Muuzaji au kagua hali yake hapa:</p> <div id="pickupVerificationStatus" style="background:white; padding:15px; border-radius:12px; border:1px solid #cbd5e1;"> <span style="font-size:12px; display:block; color:gray;">Status: <b style="color:orange;">${T('dt_waiting_pickup', 'Waiting For Pickup')}</b></span> <span style="font-size:13px; color:gray; display:block; margin-top:5px;">Token Code: <b style="color:var(--primary-blue);">${T('dt_auto_token', 'Auto Generated When Driver Arrives at Store')}</b></span> </div> </div> <!-- DELIVERY VERIFICATION BOX (TOKEN C) --> <div style="background:#f0fdf4; border:1.5px dashed var(--green); padding:20px; border-radius:16px; margin-bottom:20px;"> <b style="color:var(--green); font-size:13px; display:block; margin-bottom:10px; text-transform:uppercase;"> 2. DELIVERY VERIFICATION (TOKEN C)</b> <p style="font-size:13px; color:#475569; margin-bottom:15px;">Mpokeaji/Mnunuzi akikabidhi Token C, iingize hapa chini ili kumaliza safari na kuachia malipo:</p> <div style="display:flex; gap:10px;"> <input type="text" id="tokenCenterInputDL" placeholder="${T('dt_token_c_ph', 'Enter Token C (e.g. DL-XXXX)...')}" style="flex:2; padding:15px; border-radius:12px; border:1px solid #cbd5e1; outline:none; text-align:center; font-weight:900; font-size:18px; text-transform:uppercase;"> <button onclick="window.verifyTokenCenterDL()" style="flex:1; padding:15px; background:var(--green); color:white; border:none; border-radius:12px; font-weight:900; cursor:pointer;">${T('dt_verify_release', 'VERIFY & RELEASE')} </button> </div> </div> </div>`;
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
            <div style="text-align:left; animation: fadeIn 0.3s ease;"> <!-- LIVE BANNER: idadi halisi ya safari zako + maombi mapya sokoni --> <div id="driverLiveBanner" style="background:#fff; border:1px solid #D5E2DE; border-radius:16px; padding:16px 18px; margin-bottom:20px; color:#18352D; box-shadow:0 3px 14px rgba(24,53,45,.07); display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;"> <div style="display:flex; gap:22px; flex-wrap:wrap;"> <div><small style="opacity:.8; display:block; font-size:12.5px; text-transform:uppercase; letter-spacing:.4px;">${T('dt_active_trips', 'My Active Trips')}</small><b id="drvLiveActive" style="font-size:24px;">—</b></div> <div><small style="opacity:.8; display:block; font-size:12.5px; text-transform:uppercase; letter-spacing:.4px;">${T('dt_new_requests', 'New Requests in the Market')}</small><b id="drvLiveAvailable" style="font-size:24px; color:#178864;">—</b></div> </div> <button onclick="window.switchDashTab('bookings')" style="background:#18A982; color:#fff; border:none; padding:10px 16px; border-radius:10px; font-weight:900; font-size:12px; cursor:pointer;"> ${T('dt_view_requests', 'ONA MAOMBI MAPYA')} -></button> </div> <!-- REAL STATS: imejazwa na skhDriverOverviewStats() — hakuna namba za kudhaniwa --> <div id="driverOverviewStatsArea" style="min-height:120px;">${T('dt_loading', 'Inapakia takwimu halisi za safari zako...')}</div> </div>`;

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
            <div class="lm-wrap" style="text-align:left; animation: fadeIn 0.25s ease;"> <!-- BANGO KUU --> <div class="lm-hero"> <div class="lm-hero-ico">${lmIco('truck', 25)}</div> <div class="lm-hero-txt"> <h3>Soko la Maombi ya Usafirishaji</h3> <p>Hapa kuna MAOMBI WALAZI yanayotafuta chombo/msafirishaji. Bado si safari wala makubaliano — ukikubali, ombi linahamia “Yanaendelea”.</p> </div> <div class="lm-hero-count"><b id="lmTotalCount">—</b><small>maombi<br>wazi</small></div> </div> <!-- TENGANISHO LA DHANA: kwako / sokoni / yanaendelea / kumbukumbu --> <div class="lm-quicknav"> <button type="button" class="lm-qn" onclick="if(window.skhOpenRequestInbox) window.skhOpenRequestInbox()"> <span class="lm-qn-ico">${lmIco('target', 18)}</span> <b>Yaliyotumwa Kwako</b> <small>Ofa binafsi (routing)</small> </button> <button type="button" class="lm-qn is-primary is-active" onclick="window.skhMarketGoto('bookings')"> <span class="lm-qn-ico">${lmIco('truck', 18)}</span> <b>Maombi Sokoni</b> <small>Wazi kwa vyombo</small> </button> <button type="button" class="lm-qn" onclick="window.skhMarketGoto('trips')"> <span class="lm-qn-ico">${lmIco('map', 18)}</span> <b>Yanaendelea</b> <small>Safari ulizokubali</small> </button> <button type="button" class="lm-qn" onclick="window.skhMarketGoto('fleet')"> <span class="lm-qn-ico">${lmIco('clipboard', 18)}</span> <b>Kumbukumbu</b> <small>Safari zilizokwisha</small> </button> </div> <!-- TAHADHARI YA TENGANISHO --> <div class="lm-sep-note">
                    ${lmIco('alert', 15)}
                    <span><b>Maelewano ya bei ni tofauti na ombi.</b> Majadiliano ya nauli/masharti huendeshwa kwenye <b>Gumzo</b> na kadi za ofa; rekodi rasmi ya usafirishaji (na msimbo wa kuchukulia) hutengenezwa BAADA ya makubaliano na kukubali ombi.</span> </div> <!-- VICHUPO VYA AINA YA KAZI --> <div class="lm-tabs" id="lmTabs" role="tablist"> <button type="button" class="lm-tab active" data-lm-filter="all_types" onclick="window.filterMarketplace('all_types', this)">${lmIco('briefcase', 14)} <span>Kazi Zote</span> <span class="lm-tab-n" id="lmN_all_types">—</span></button> <button type="button" class="lm-tab" data-lm-filter="Cargo" onclick="window.filterMarketplace('Cargo', this)">${lmIco('package', 14)} <span>Mizigo</span> <span class="lm-tab-n" id="lmN_Cargo">—</span></button> <button type="button" class="lm-tab" data-lm-filter="Passengers" onclick="window.filterMarketplace('Passengers', this)">${lmIco('users', 14)} <span>Watu</span> <span class="lm-tab-n" id="lmN_Passengers">—</span></button> <button type="button" class="lm-tab" data-lm-filter="Livestock" onclick="window.filterMarketplace('Livestock', this)">${lmIco('tag', 14)} <span>Mifugo/Kandarasi</span> <span class="lm-tab-n" id="lmN_Livestock">—</span></button> </div> <div id="liveBookingsList" class="lm-list"></div> </div>`;

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
            <div style="text-align:left; animation: fadeIn 0.3s ease;"> <!-- BANGO: utengano wa dhana --> <div class="lm-hero" style="background:#F0F7FA;"> <div class="lm-hero-ico">${lmIco2('map', 25)}</div> <div class="lm-hero-txt"> <h3>Safari Zinazoendelea</h3> <p>Hii ni REKODI RASMI za usafirishaji ulioshakubali: kuchukua mzigo -> njiani -> kufikishwa -> kuthibitishwa kupokea. Maombi mapya yapo kwenye “Soko la Maombi”, yaliyokwisha yapo “Kumbukumbu”.</p> </div> </div> <div class="lm-quicknav" style="grid-template-columns:repeat(3,1fr);"> <button type="button" class="lm-qn" onclick="window.skhMarketGoto('bookings')"> <span class="lm-qn-ico">${lmIco2('truck', 18)}</span> <b>Soko la Maombi</b><small>Maombi walazi</small> </button> <button type="button" class="lm-qn is-primary is-active"> <span class="lm-qn-ico">${lmIco2('map', 18)}</span> <b>Yanaendelea</b><small>Safari za sasa</small> </button> <button type="button" class="lm-qn" onclick="window.skhMarketGoto('fleet')"> <span class="lm-qn-ico">${lmIco2('clipboard', 18)}</span> <b>Kumbukumbu</b><small>Safari zilizokwisha</small> </button> </div> <div id="driverActiveJobsArea" class="lm-list" style="min-height:80px;"> <div class="lm-skel"><div class="lm-skel-row"><div class="lm-skel-ico"></div><div style="flex:1;"><div class="lm-skel-bar w70"></div><div class="lm-skel-bar w40"></div></div></div></div> </div> </div>`;

        window.setupDriverActiveJobsQuery();
        return;
    }

    // ==========================================
    // 4.  SOKOPAY LOGISTICS TOKEN CENTER
    // ==========================================
    else if (tab === 'cargo') {
        /* Markup ileile, sasa inatumika pia na Business OS (seller). */
        ws.innerHTML = window.skhTokenCenterHtml();
        return;
    }

    // 5. OTHER STATIC PRE-EXISTING TABS
    else if (tab === 'tracking') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.3s ease-out; display:flex; flex-direction:column; height:80vh;"> <h3 style="color:var(--primary-dark); margin-top:0;"> SATELLITE LIVE TRACKING (CONTROL BRIDGE)</h3> <p style="color:gray; font-size:12px; margin-bottom:12px;">Fuatilia kwa urahisi mahali gari lako au mzigo unavyosogea live kwenye satellite ramani ya Sokohai [1].</p> <div style="flex:1; width:100%; height:320px; border-radius:20px; overflow:hidden; border:2px solid #cbd5e1; position:relative; margin-bottom:15px;"> <div id="liveLandedMap" style="height:100%; width:100%;"></div> </div> </div>`;

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
            <div style="text-align:left; animation: fadeIn 0.2s ease-out;"> <h3 style="color:var(--primary-dark); margin-top:0;"> REVENUE, EXPENSES & COST COCKPIT</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Rekodi matumizi halisi ya mafuta au ukarabati wa chombo chako.</p> <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:20px; max-width:420px;"> <b style="color:#0f172a; font-size:13px; display:block; margin-bottom:12px;"> RECORD TRAVEL EXPENSE</b> <select id="expTypeTrans" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; margin-bottom:10px;"> <option value="Fuel"> Fuel (Matumizi ya Mafuta)</option> <option value="Maintenance"> Maintenance / Repair</option> </select> <input type="number" id="expAmountTrans" placeholder="${T('dt_expense_ph', 'Expense amount (TSh)...')}" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:10px;"> <button onclick="window.skhDriverSaveExpense()" style="width:100%; padding:14px; background:var(--terracotta); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">${T('dt_save', 'Save')} </button> </div> </div>`;
    }

    // ==========================================
    // 6.  FLEET STATUS (Hali ya Vyombo)
    // ==========================================
    else if (tab === 'fleet') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.2s ease-out;"> <h3 style="color:var(--primary-dark); margin-top:0;"> FLEET STATUS — HALI YA VYOMBO VYAKO</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Taarifa halisi ya chombo chako na utendaji kutoka safari zilizorekodiwa.</p> <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:15px;"> <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:18px;"> <b style="font-size:12px; text-transform:uppercase; color:#0f172a; display:block;"> Chombo Chako</b> <span style="font-size:12px; color:gray; display:block; margin-top:6px;">Aina: <b style="color:#0f172a;">${skh.skhEscape(vehicleType)}</b></span> <span style="font-size:12px; color:gray; display:block; margin-top:4px;">Namba: <b style="color:#0f172a;">${skh.skhEscape(plateNo)}</b></span> </div> <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:18px;"> <b style="font-size:12px; text-transform:uppercase; color:#0f172a; display:block;"> Safari Zilizokamilika</b> <span id="drvFleetCompleted" style="font-size:22px; color:var(--green); font-weight:900; display:block; margin-top:6px;">—</span> <span style="font-size:13px; color:gray; display:block; margin-top:2px;">Jumla ya safari zote zilizokamilika.</span> </div> <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:18px;"> <b style="font-size:12px; text-transform:uppercase; color:#0f172a; display:block;"> Mapato ya Leo</b> <span id="drvFleetEarnings" style="font-size:22px; color:var(--primary-blue); font-weight:900; display:block; margin-top:6px;">—</span> <span style="font-size:13px; color:gray; display:block; margin-top:2px;">Kutoka safari zilizokamilika leo.</span> </div> </div> <!-- [UTENGANO 2026-09] KUMBUKUMBU RASMI YA USAFIRISHAJI --> <div style="margin-top:22px;"> <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"> <span style="color:var(--primary-dark);">${(window.skhNavIcon ? window.skhNavIcon('clipboard', 18) : '')}</span> <h3 style="color:var(--primary-dark); margin:0; text-transform:uppercase; font-size:14px;">Kumbukumbu ya Usafirishaji</h3> </div> <p style="color:#64748b; font-size:13px; margin:0 0 12px;">Rekodi rasmi za safari zilizokamilika (na migogoro iliyopo) — si mazungumzo. Bonyeza rekodi kuona ufuatiliaji.</p> <div id="driverTripHistoryArea" class="lm-list"> <div class="lm-skel"><div class="lm-skel-row"><div class="lm-skel-ico"></div><div style="flex:1;"><div class="lm-skel-bar w70"></div><div class="lm-skel-bar w40"></div></div></div></div> </div> </div> </div>`;

        if (typeof window.skhDriverFleetStats === 'function') window.skhDriverFleetStats();
        if (typeof window.skhRenderTripHistory === 'function') window.skhRenderTripHistory();
    }

    // ==========================================
    // 7.  DRIVERS DIRECTORY (Orodha ya Madereva)
    // ==========================================
    else if (tab === 'drivers') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.2s ease-out;"> <h3 style="color:var(--primary-dark); margin-top:0;"> DIRECTORY YA MADEREVA / WASAFIRISHAJI</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Orodha halisi ya wasafirishaji waliosajiliwa kwenye SokoHai.</p> <div id="driverDirectoryArea" style="display:flex; flex-direction:column; gap:12px;">${T('dt_loading', 'Inapakia orodha ya madereva...')}</div> </div>`;
        window.loadDriverDirectoryList();
    }

    // ==========================================
    // 8.  PERFORMANCE ANALYTICS (Takwimu za Utendaji)
    // ==========================================
    else if (tab === 'analytics') {
        ws.innerHTML = `
            <div style="text-align:left; animation: fadeIn 0.2s ease-out;"> <h3 style="color:var(--primary-dark); margin-top:0;"> PERFORMANCE ANALYTICS — TAKWIMU ZA UTENDAJI</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Takwimu halisi za safari zako kulingana na rekodi za SokoHai.</p> <div id="driverAnalyticsArea" style="min-height:120px;">${T('dt_loading', 'Inapakia takwimu...')}</div> </div>`;
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
                const rating = (d.rating != null) ? '<b style="color:var(--gold); font-size:12px;"> ' + skh.skhEscape(String(d.rating)) + '</b>' : '';
                const action = d.userId
                    ? '<button onclick="window.openChatWithUser(\'' + skh.skhJsEsc(d.userId) + '\', \'' + skh.skhJsEsc(d.name) + '\')" style="margin-top:8px; padding:6px 12px; background:var(--green); color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">WASILIANA</button>'
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

function skhEsc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

/* ============================================================================
   [REPAIR 2026-11-04] TRANSPORT-LINKED TABS kwenye Business OS (seller)
   ----------------------------------------------------------------------------
   TABS hizi zilikuwa kwenye sidebar lakini `renderActiveTabContent` hakuwa na
   branch yao: iliruka kimya, workspace ikabaki na maudhui ya tab ILIYOPITA.
   Hivyo "Kituo cha Tokeni" ilionyesha Stoo, "Maombi ya Usafirishaji" ilionyesha
   Stoo, n.k. (maudhui ya zamani chini ya jina jipya).

   Sasa:
     • `cargo`  → Token Center HALISI (window.skhTokenCenterHtml — markup uleule
                  unaotumika kwenye dashibodi ya Usafirishaji).
     • nyingine → daraja la ukweli: jina la moduli, maelezo, na njia ya kweli ya
                  kufungua mfumo wa Usafirishaji. HAKUNA data ya kubuni.
   ========================================================================== */
/* Jina la kichwa = jina HALISI la kipengele kwenye sidebar (chanzo kimoja:
   shared/business-os-nav-model.mjs), ili kichwa kilingane na alichokibonyeza
   mtumiaji. Fallback: funguo ya i18n. */
function skhNavLabel(tab, fallback) {
    try {
        var model = (window.skhBOS && window.skhBOS.navModel) || [];
        for (var i = 0; i < model.length; i++) {
            var g = model[i] || {};
            var lists = [g.items || []];
            (g.subgroups || []).forEach(function (sg) { lists.push(sg.items || []); });
            for (var l = 0; l < lists.length; l++) {
                for (var j = 0; j < lists[l].length; j++) {
                    var it = lists[l][j];
                    if (it && it.tab === tab && it.label) return it.label;
                }
            }
        }
    } catch (e) { }
    return fallback;
}

/* Taarifa ya utegemezi kwa Token Center inayoonekana kwenye Business OS.
   HAIZUII kitufe chochote — inaeleza tokeni zinahusiana na safari zipi. */
window.skhTokenCenterNoticeHtml = function () {
    return ''
        + '<div class="bos-token-notice">'
        + '  <div class="bos-token-notice-ico">' + (window.skhNavIcon ? window.skhNavIcon('key', 18) : '') + '</div>'
        + '  <div class="bos-token-notice-txt">'
        + '    <b>' + T('bos_tc_notice_t', 'Logistics tokens belong to transport trips') + '</b>'
        + '    <span>' + T('bos_tc_notice_d', 'Token A (pickup) is generated when the driver arrives at your store and Token C (delivery) is verified on the specific trip. On a business account, verification applies only to trips linked to your transport account — no code or balance is invented here.') + '</span>'
        + '  </div>'
        + '  <button type="button" class="bos-btn is-ghost" onclick="if(window.openModeMenu) window.openModeMenu();">'
        + T('bos_tr_open', 'Open Transport System') + '</button>'
        + '</div>';
};

window.skhTransportBridgeHtml = function (tab) {
    /* MAP: [jina, maelezo] — funguo za i18n (32-i18n.js), default ni Kiingereza
       kama kanuni ya faili hii; Kiswahili kinatoka kwenye kamusi. */
    var MAP = {
        bookings:  { t: T('bos_tr_bookings', 'Transport Requests'), d: T('bos_tr_bookings_d', 'New transport requests offered on the market to drivers and agents.') },
        trips:     { t: T('bos_tr_trips', 'Active Trips'), d: T('bos_tr_trips_d', 'Accepted trips: pickup, in transit, delivered and verified.') },
        tracking:  { t: T('bos_tr_tracking', 'Live Tracking'), d: T('bos_tr_tracking_d', 'Live map tracking of the vehicle or cargo while a trip is running.') },
        drivers:   { t: T('bos_tr_drivers', 'Drivers & Agents'), d: T('bos_tr_drivers_d', 'List of drivers, agents and their transport vehicles.') },
        fleet:     { t: T('bos_tr_fleet', 'Fleet Status'), d: T('bos_tr_fleet_d', 'Vehicles that are ready, working or under repair.') },
        finance:   { t: T('bos_tr_finance', 'Trip Costs'), d: T('bos_tr_finance_d', 'Fuel, repairs and other trip costs.') },
        analytics: { t: T('bos_tr_analytics', 'Transport Analytics'), d: T('bos_tr_analytics_d', 'Transport performance: trips, revenue and efficiency.') }
    };
    var m = MAP[tab] || { t: tab, d: '' };
    m.t = skhNavLabel(tab, m.t);
    return ''
        + '<div class="bos-transport-bridge">'
        + '  <div class="bos-ov-head">'
        + '    <div>'
        + '      <h2>' + skhEsc(m.t) + '</h2>'
        + '      <p>' + T('bos_tr_subsys', 'Transport System module') + '</p>'
        + '    </div>'
        + '    <span class="bos-tag">' + T('bos_tr_tag', 'Separate system') + '</span>'
        + '  </div>'
        + '  <div class="bos-panel">'
        + '    <div class="bos-panel-body">'
        + '      <p class="bos-tr-lead">' + skhEsc(m.d) + '</p>'
        + '      <p class="bos-tr-note">' + T('bos_tr_dep',
            'Safari, mizigo, madereva na tokens zinahifadhiwa kwenye <b>Mfumo wa Usafiri</b>, ambao ni tofauti na akaunti ya biashara. Akaunti hii ya biashara haina rekodi za usafiri zilizounganishwa, kwa hiyo hakuna takwimu zinazobuniwa hapa.') + '</p>'
        + '      <div class="bos-tr-actions">'
        + '        <button type="button" class="bos-btn" onclick="if(window.openModeMenu) window.openModeMenu();">'
                   + T('bos_tr_open', 'Open Transport System') + '</button>'
        + '        <button type="button" class="bos-btn is-ghost" onclick="window.switchDashTab(\'overview\')">'
                   + T('bos_back_home', 'Back to Main Dashboard') + '</button>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + '</div>';
};

/* Fallback: tab isiyo na renderer — USIONYESHE maudhui ya tab iliyopita. */
window.skhTabNotFoundHtml = function (tab) {
    return skhStateBox(
        'empty',
        T('bos_tab_missing_t', 'This section is not built yet'),
        T('bos_tab_missing_d', 'The "{t}" module has no renderer yet. No previous content is shown to avoid confusion.', { t: String(tab || '') }),
        '<div style="margin-top:10px;"><button type="button" class="bos-btn" onclick="window.switchDashTab(\'overview\')">'
        + T('bos_back_home', 'Back to Main Dashboard') + '</button></div>'
    );
};

window.renderActiveTabContent = function() {
    const ws = document.getElementById('dashWorkspace');
    if (!ws) return;

    /* [DATA INTEGRITY 2026-11-03] Hali tatu zinatenganishwa:
       loading (skeleton ya shell) · empty (kila ukurasa) · error (hapa). */
    const skhTabNeedsCache = ['product_analytics', 'inventory', 'expenses', 'staff'].indexOf(window.activeDashboardTab) !== -1;
    if (!window.dashboardCachedData && skhTabNeedsCache) {
        ws.innerHTML = skhStateBox(
            'error',
            'Data ya dashibodi haijapakiwa',
            'Dashibodi bado haijapakia data kutoka Firestore. Hii si “hakuna data” — ni hitilafu au kupakia kusijakamilika.',
            '<div style="margin-top:10px;"><button type="button" onclick="window.loadAndRenderDashboard()" '
            + 'style="background:#18A982; color:#fff; border:none; border-radius:10px; padding:9px 16px; font-weight:800; cursor:pointer;">Jaribu tena</button></div>'
        );
        return;
    }

    const data = window.dashboardCachedData || {};
    const tab = window.activeDashboardTab;

    // ==========================================
    // 1.  OVERVIEW - EXECUTIVE TOWER (Renders Real Dashboard Indicators)
    // ==========================================
    if (tab === 'overview') {
        // [BUSINESS OS 1A] Dashboard overview kutoka vyanzo rasmi (posReports/sales).
        // Renderer ya awali IMEHIFADHIWA chini kama fallback — hakuna kitu kilichoondolewa.
        if (window.skhBusinessOverview && typeof window.skhBusinessOverview.render === 'function') {
            try { window.skhBusinessOverview.render(ws); return; }
            catch (e) { console.warn('[BOS] overview imeshindikana, tunatumia ya awali:', e && e.message); }
        }
        ws.innerHTML = `
        <div style="text-align: left; animation: fadeIn 0.3s ease-out;"> <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;"> <div> <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #0F172A;">Welcome, Executive Command Room! </h2> <p style="margin: 4px 0 0; color: #64748B; font-size: 13px;">Real-time back-office sales, accounting, and logistics overview.</p> </div> <div style="background: white; padding: 8px 15px; border-radius: 12px; border: 1px solid #e2e8f0; font-size:13px; font-weight: 800; color: #475569;">
                     ${new Date().toLocaleDateString('sw-TZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div> </div> <!-- ROW 1: 5 KPI CARDS WITH SPARKLINE GRAPHS (+ WAFUASI) --> <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 25px;"> <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;"> <small style="color: #64748B; font-size:12.5px; font-weight: bold; text-transform: uppercase;">TOTAL SALES</small> <b style="font-size: 18px; color: #0F172A; display: block; margin: 4px 0;">TZS ${Number(data.totalSales || 0).toLocaleString()}</b> <small style="color: #94A3B8; font-weight: bold;">Kutoka ledger yako</small> <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineSales"></canvas></div> </div> <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;"> <small style="color: #64748B; font-size:12.5px; font-weight: bold; text-transform: uppercase;">TOTAL PROFIT</small> <b style="font-size: 18px; color: #6366F1; display: block; margin: 4px 0;">TZS ${Number(data.totalProfit || 0).toLocaleString()}</b> <small style="color: #94A3B8; font-weight: bold;">Kutoka ledger yako</small> <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineProfit"></canvas></div> </div> <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;"> <small style="color: #64748B; font-size:12.5px; font-weight: bold; text-transform: uppercase;">TOTAL ORDERS</small> <b style="font-size: 18px; color: #0F172A; display: block; margin: 4px 0;">${Number(data.totalOrders || 0).toLocaleString()}</b> <small style="color: #94A3B8; font-weight: bold;">Oda zilizorekodiwa</small> <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineOrders"></canvas></div> </div> <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;"> <small style="color: #64748B; font-size:12.5px; font-weight: bold; text-transform: uppercase;">OUTSTANDING DEBT</small> <b style="font-size: 18px; color: #EF4444; display: block; margin: 4px 0;">TZS ${Number(data.activeDebts || 0).toLocaleString()}</b> <small style="color: #94A3B8; font-weight: bold;">Madeni yanayosubiri</small> <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineDebts"></canvas></div> </div> <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;"> <small style="color: #64748B; font-size:12.5px; font-weight: bold; text-transform: uppercase;">TOTAL CUSTOMERS</small> <b style="font-size: 18px; color: #06B6D4; display: block; margin: 4px 0;">${Number(data.totalCustomersCount || 0).toLocaleString()}</b> <small style="color: #94A3B8; font-weight: bold;">Wote kutoka ledger yako</small> <div style="height: 45px; margin-top: 10px;"><canvas id="sparklineCustomers"></canvas></div> </div> <!-- [BUYER ENGAGEMENT] WAFUASI (real, kutoka sellerFollowers) --> <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px;"> <small style="color: #64748B; font-size:12.5px; font-weight: bold; text-transform: uppercase;">WAFUASI (FOLLOWERS)</small> <b id="kpiFollowersTotal" style="font-size: 18px; color: #8B5CF6; display: block; margin: 4px 0;">…</b> <small style="color: #22C55E; font-weight: bold;"><span id="kpiFollowersNew">+0</span> wiki hii</small> <div style="margin-top: 8px; font-size:12.5px; color: #475569; line-height: 1.6;">
                        Active: <b id="kpiFollowersActive">0</b> · Wa kununua: <b id="kpiFollowersConversion">0%</b><br>
                        Wanunuzi wanaorudia: <b id="kpiFollowersRepeat">0</b> </div> </div> </div> <!-- ROW 2: MAIN CHARTS ROW (Overview, Category & Summary) --> <div style="display: grid; grid-template-columns: 2.2fr 1.3fr; gap: 15px; margin-bottom: 25px;"> <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px; box-sizing: border-box;"> <b style="font-size: 13px; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">Sales Overview</b> <div style="height: 180px; position: relative; margin-top: 15px;"><canvas id="adaptiveShopChart"></canvas></div> </div> <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;"> <b style="font-size: 13px; color: #0F172A; text-transform: uppercase; margin-bottom: 10px; display: block;">Sales by Category</b> <div style="height: 140px; position: relative;"><canvas id="salesCategoryChart"></canvas></div> </div> </div> <!-- TABLES & METRICS --> <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;"> <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px;"> <b style="font-size: 12px; color: #0F172A; text-transform: uppercase; margin-bottom: 12px; display: block;"> Top Selling Products</b> <table class="ct-table"> <thead> <tr><th>Product</th><th>Sold</th><th>Revenue</th></tr> </thead> <tbody id="topSellingProductsTableBody"></tbody> </table> </div> <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px;"> <b style="font-size: 12px; color: #0F172A; text-transform: uppercase; margin-bottom: 12px; display: block;"> Top Customers</b> <table class="ct-table"> <thead> <tr><th>Customer</th><th>Orders</th><th>Total Spent</th></tr> </thead> <tbody id="topCustomersTableBody"></tbody> </table> </div> <div style="background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 20px;"> <b style="font-size: 12px; color: #0F172A; text-transform: uppercase; margin-bottom: 12px; display: block;"> Outstanding Debts</b> <table class="ct-table"> <thead> <tr><th>Customer Name</th><th>Amount</th><th>Action</th></tr> </thead> <tbody id="outstandingDebtsTableBody"></tbody> </table> </div> </div> </div>`;
        
        setTimeout(() => {
            if (!window.dashboardCachedData) return;   /* fallback isiyo na data: usichore charts za kubuni */
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
        /* [DATA INTEGRITY 2026-11-03] Namba zote kutoka `products` halisi.
           KPI zote zimehifadhiwa; zisizo na chanzo zinaonyesha `—` + sababu. */
        const prods = skhDocs(data.prodSnap);
        const hasAny = prods.length > 0;
        const num = (v) => parseFloat(v) || 0;
        const outStock = prods.filter(p => num(p.stock) <= 0);
        const lowStock = prods.filter(p => { const s = num(p.stock); const l = parseInt(p.lowStockAlert, 10) || 5; return s > 0 && s <= l; });
        const hasPubField = prods.some(p => p.status != null || p.publicationStatus != null);
        const isDraft = p => String(p.status || p.publicationStatus || '').toLowerCase() === 'draft';
        const isActive = p => { const s = String(p.status || p.publicationStatus || '').toLowerCase(); return s === 'active' || s === 'published'; };
        const invValue = hasAny ? prods.reduce((t, p) => t + num(p.stock) * num(p.price), 0) : null;
        const noImage = prods.filter(p => !p.imageUrl && !p.image && !(Array.isArray(p.images) && p.images.length));
        const noDesc = prods.filter(p => !String(p.description || '').trim());
        const label = p => String(p.title || p.name || 'Bidhaa').slice(0, 60);

        const insights = [];
        if (outStock.length) insights.push(['#ef4444', 'Bidhaa zimeisha stoo (' + outStock.length + '): ' + outStock.slice(0, 4).map(label).join(', ') + (outStock.length > 4 ? ' +' + (outStock.length - 4) : '')]);
        if (lowStock.length) insights.push(['#f59e0b', 'Bidhaa zinakaribia kuisha (' + lowStock.length + '): ' + lowStock.slice(0, 4).map(label).join(', ') + (lowStock.length > 4 ? ' +' + (lowStock.length - 4) : '')]);
        if (noImage.length) insights.push(['#4D91AA', 'Bidhaa hazina picha (' + noImage.length + '): ' + noImage.slice(0, 4).map(label).join(', ') + (noImage.length > 4 ? ' +' + (noImage.length - 4) : '')]);
        if (noDesc.length) insights.push(['#4D91AA', 'Bidhaa hazina maelezo (' + noDesc.length + '): ' + noDesc.slice(0, 4).map(label).join(', ') + (noDesc.length > 4 ? ' +' + (noDesc.length - 4) : '')]);

        const kpiCards = [
            skhKpi(T('an_total_products', 'BIDHAA ZOTE'), hasAny ? skhCount(prods.length) : SKH_NA),
            /* [STAGE B] Lebo = hali ya UCHAPISHAJI pekee; haisemi upatikanaji wa stoo.
               Hesabu haijabadilishwa (bado `isActive`), stoo inaonekana kwenye kadi zake. */
            skhKpi(T('an_active_products', 'BIDHAA ZILIZOCHAPISHWA'), hasPubField ? skhCount(prods.filter(isActive).length) : SKH_NA, hasPubField ? 'Hali ya uchapishaji · haihakikishi stoo (stoo inaonekana kwenye kadi za Stoo)' : 'Sehemu ya hali haijawekwa kwenye bidhaa'),
            skhKpi(T('an_draft_products', 'BIDHAA ZA RASIMU'), hasPubField ? skhCount(prods.filter(isDraft).length) : SKH_NA, hasPubField ? '' : 'Sehemu ya hali haijawekwa kwenye bidhaa'),
            skhKpi(T('an_out_of_stock', 'IMESHA STOO'), hasAny ? skhCount(outStock.length) : SKH_NA, '', '#ef4444'),
            skhKpi(T('an_low_stock', 'STOO CHINI'), hasAny ? skhCount(lowStock.length) : SKH_NA, '', '#f59e0b'),
            skhKpi(T('an_top_selling', 'BIDHAA INAYOONGOZA KWA MAUZO'), SKH_NA, 'Chanzo: ripoti za mauzo (posReports) — hazipakiwi kwenye ukurasa huu'),
            skhKpi(T('an_inventory_value', 'THAMANI YA STOO'), invValue != null ? skhMoney(invValue) : SKH_NA, 'Stoo × bei ya mauzo', '#0284c7'),
            skhKpi(T('an_product_growth', 'UKUAJI WA BIDHAA'), SKH_NA, 'Inahitaji historia ya vipindi (haipo)')
        ];

        ws.innerHTML = `
        <div style="animation: fadeIn 0.3s ease; display: flex; flex-direction: column; gap: 20px; text-align:left;">
            <h2 style="margin:0; font-size:20px; color:#0f172a; font-weight:800;"> ${T('pa_title', 'Uchambuzi wa Bidhaa')}</h2>
            <p style="margin:0; color:#64748b; font-size:12px; margin-top:-15px;">Uchambuzi wa bidhaa zako kutoka data halisi (products). Sehemu zisizo na chanzo zinaonyesha ${SKH_NA}.</p>
            ${skhKpiGrid(kpiCards)}

            <div class="bos-grid-2">
                ${skhChartCard(T('an_chart_categories', 'Kategoria za Bidhaa'), 'chart_pCategories', hasAny && prods.some(p => p.category), 'Hakuna bidhaa zenye kategoria zilizopakiwa.')}
                ${skhChartCard(T('an_chart_health', 'Hali ya Stoo'), 'chart_pHealth', hasAny, 'Hakuna bidhaa zilizopakiwa.')}
            </div>
            <div class="bos-grid-2">
                ${skhChartCard(T('an_chart_revenue', 'Mapato kwa Bidhaa'), 'chart_pProfit', false, 'Inahitaji ripoti za mauzo (posReports) — hazipakiwi hapa.')}
                ${skhChartCard(T('an_chart_demand', 'Mwenendo wa Mahitaji'), 'chart_pDemand', false, 'Inahitaji historia ya mauzo kwa kipindi (haipo kwenye ukurasa huu).')}
            </div>
            <div class="bos-grid-2">
                ${skhChartCard(T('an_chart_returns', 'Marejesho'), 'chart_pReturns', false, 'Inahitaji rekodi za marejesho ya bidhaa — hazipakiwi hapa.')}
                ${skhChartCard(T('an_chart_conversion', 'Kiwango cha Ubadilishaji'), 'chart_pConversion', false, 'Inahitaji data ya wageni/wanaoangalia — haipo.')}
            </div>

            <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Maoni ya Bidhaa (kutoka data halisi)</b>
                ${insights.length
                    ? insights.map(([tone, text]) => '<div style="background:#F8FBFA; padding:10px; border-radius:10px; border-left:4px solid ' + tone + '; margin-bottom:8px; font-size:12.5px; color:#18352D;">' + text + '</div>').join('')
                    : skhStateBox('empty', 'Hakuna maoni', hasAny ? 'Bidhaa zote zina stoo ya kutosha, picha na maelezo.' : 'Hakuna bidhaa zilizopakiwa, kwa hiyo hakuna maoni.')}
            </div>
        </div>`;

        setTimeout(() => {
            if (typeof window.initProductAnalyticsCharts === 'function') {
                try { window.initProductAnalyticsCharts(data); } catch (e) { console.warn('[BOS] product analytics charts:', e && e.message); }
            }
        }, 100);
        return;
    }

    // ==========================================
    // 3.  INVENTORY & STOCK - THE COMPLETE LIFE-CYCLE (With conversion & warehouse valuation)
    // ==========================================
    if (tab === 'inventory') {
        /* [DATA INTEGRITY 2026-11-03] Stoo: namba zote kutoka `products` halisi
           (+ `purchase_orders` kwa risiti zinazosubiri). Charts zisizo na chanzo
           zinaonyesha "Hakuna data" — hakuna mfululizo wa kubuni. */
        const prods = skhDocs(data.prodSnap);
        const hasAny = prods.length > 0;
        const num = (v) => parseFloat(v) || 0;

        let totalCostValue = 0;
        let totalSellingValue = 0;
        let totalUnits = 0;
        const reorderList = [];
        const stockItemsRows = [];
        const warehouseMap = {};
        let damagedQty = 0, expiredQty = 0, lostQty = 0;
        let hasDamageData = false;

        prods.forEach(p => {
            const stock = num(p.stock);
            const buyPrice = num(p.buyPrice);
            const sellPrice = num(p.price);
            const reorderLevel = parseInt(p.lowStockAlert, 10) || 5;

            totalUnits += stock;
            totalCostValue += stock * buyPrice;
            totalSellingValue += stock * sellPrice;

            if (stock <= reorderLevel) {
                reorderList.push({ title: p.title || p.name || 'Bidhaa', currentStock: stock, reorderLevel, suggestedQty: Math.max(0, (reorderLevel * 4) - stock) });
            }

            let multiUnitText = `${skhCount(stock)} ${p.baseUnit || 'Pcs'}`;
            if (p.hasBulkPackaging && num(p.conversionRatio) > 1) {
                const bulkCount = Math.floor(stock / num(p.conversionRatio));
                const remainingUnits = stock % num(p.conversionRatio);
                multiUnitText = `<b>${bulkCount} ${p.bulkUnit || 'Boxes'}</b> (${remainingUnits} ${p.baseUnit || 'Pcs'})`;
            }
            const isLow = stock <= reorderLevel;
            stockItemsRows.push(`
                <tr style="border-bottom:1px solid #f1f5f9; font-size:12px; text-align:left;">
                    <td style="padding:10px 0; font-weight:bold;"> ${p.title || p.name || 'Bidhaa'}</td>
                    <td style="color:#475569;">${p.barcode || SKH_NA}</td>
                    <td>${multiUnitText}</td>
                    <td>${p.baseUnit || 'Pcs'}</td>
                    <td><span style="background:${stock <= 0 ? '#fee2e2' : (isLow ? '#fef3c7' : '#dcfce7')}; color:${stock <= 0 ? '#ef4444' : (isLow ? '#b45309' : '#16a34a')}; padding:2px 8px; border-radius:6px; font-size:12.5px; font-weight:bold;">
                        ${stock <= 0 ? 'OUT OF STOCK' : (isLow ? 'LOW STOCK' : 'HEALTHY')}
                    </span></td>
                </tr>`);

            const wh = String(p.warehouse || p.branchName || p.branch || p.location || '').trim();
            if (wh) warehouseMap[wh] = (warehouseMap[wh] || 0) + (stock * sellPrice);

            const dq = num(p.damagedQty), eq = num(p.expiredQty), lq = num(p.lostQty);
            if (dq || eq || lq) { hasDamageData = true; damagedQty += dq; expiredQty += eq; lostQty += lq; }
        });

        const outCount = prods.filter(p => num(p.stock) <= 0).length;
        const lowCount = reorderList.filter(r => r.currentStock > 0).length;
        const warehouseNames = Object.keys(warehouseMap);

        /* Risiti zinazosubiri: kutoka `purchase_orders` (status pending) */
        const pos = skhDocs(data.poSnap);
        const pendingReceipts = pos.length ? pos.filter(po => String(po.status || 'pending') === 'pending').length : null;

        const kpiCards = [
            skhKpi('TOTAL SKUs', hasAny ? skhCount(prods.length) : SKH_NA, hasAny ? '' : 'Hakuna bidhaa zilizopakiwa'),
            skhKpi('TOTAL STOCK UNITS', hasAny ? skhCount(totalUnits) : SKH_NA, '', '#10b981'),
            skhKpi('INVENTORY VALUE (COST)', hasAny ? skhMoney(totalCostValue) : SKH_NA, 'Stoo × bei ya kununua', '#0284c7'),
            skhKpi('LOW STOCK', hasAny ? skhCount(lowCount) : SKH_NA, '', '#f59e0b'),
            skhKpi('OUT OF STOCK', hasAny ? skhCount(outCount) : SKH_NA, '', '#ef4444'),
            skhKpi('PENDING RECEIPTS', pendingReceipts == null ? SKH_NA : skhCount(pendingReceipts), pendingReceipts == null ? 'Hakuna oda za manunuzi zilizopakiwa' : '', '#6366f1'),
            skhKpi('WAREHOUSES', warehouseNames.length ? skhCount(warehouseNames.length) : SKH_NA, warehouseNames.length ? '' : 'Hakuna sehemu ya ghala kwenye bidhaa'),
            skhKpi('STOCK TURNOVER', SKH_NA, 'Inahitaji historia ya mauzo (haipo kwenye ukurasa huu)'),
            skhKpi('EXPECTED SALES VALUE', hasAny ? skhMoney(totalSellingValue) : SKH_NA, 'Stoo × bei ya mauzo', '#22c55e'),
            skhKpi('EXPECTED PROFIT (STOCK)', hasAny ? skhMoney(totalSellingValue - totalCostValue) : SKH_NA, 'Mauzo − gharama ya stoo')
        ];

        ws.innerHTML = `
        <div style="animation: fadeIn 0.3s ease; display:flex; flex-direction:column; gap:20px; text-align:left;">
            <h2 style="margin:0; font-size:20px; color:#0f172a; font-weight:800;"> Inventory & Stock Control Room</h2>
            <p style="margin:0; color:#64748b; font-size:12px; margin-top:-15px;">Namba zote zinatoka kwenye bidhaa zako halisi. Sehemu zisizo na chanzo zinaonyesha ${SKH_NA}.</p>
            ${skhKpiGrid(kpiCards)}

            <div class="bos-grid-2">
                ${skhChartCard('Stock Movement Trend (In vs Out)', 'invMovementLine', false, 'Hakuna rekodi za mwendo wa stoo (stock movements) zilizopakiwa kwenye ukurasa huu.')}
                ${skhChartCard('Valuation by Warehouse', 'invWarehouseValuationBar', warehouseNames.length > 0, 'Bidhaa hazina sehemu ya ghala/tawi, kwa hiyo thamani kwa ghala haiwezi kuhesabiwa.')}
            </div>

            <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:15px; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> STOCK OVERVIEW (MULTI-UNIT CONVERSIONS)</b>
                <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">Product</th><th>Barcode</th><th>Current Stock</th><th>Base Unit</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${stockItemsRows.length
                            ? stockItemsRows.join('')
                            : skhTableEmpty(5, 'Hakuna bidhaa zilizopakiwa. Bidhaa zitaonekana hapa mara tu zitakapoongezwa kwenye Bidhaa Zangu.')}
                    </tbody>
                </table>
            </div>

            <div class="bos-grid-2">
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px; color:#d97706;"> Reorder Alerts</b>
                    <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
                        ${reorderList.length > 0
                            ? reorderList.map(p => `
                                <div style="background:#fffbeb; padding:10px; border-radius:8px; border-left:4px solid #d97706; margin-bottom:6px;">
                                    <b>${p.title}</b> — Stoo: <b>${skhCount(p.currentStock)} Pcs</b> (kiwango cha chini ${skhCount(p.reorderLevel)}). Pendekezo la kuagiza: <b style="color:green;">+${skhCount(p.suggestedQty)} Pcs</b>
                                </div>`).join('')
                            : (hasAny
                                ? '<p style="color:gray; font-style:italic;">Stoo ipo salama! Hakuna bidhaa inayokaribia kuisha stoo.</p>'
                                : skhStateBox('empty', 'Hakuna data ya stoo', 'Hakuna bidhaa zilizopakiwa, kwa hiyo hakuna tahadhari za kuagiza.'))}
                    </div>
                </div>
                <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                    <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Damages & Expiry</b>
                    ${hasDamageData
                        ? '<div style="display:flex; gap:15px; align-items:center;"><div style="flex:1; height:120px; position:relative;"><canvas id="invDamagesChart"></canvas></div>'
                          + '<div style="flex:1; font-size:13px; display:flex; flex-direction:column; gap:6px;"><span>Damaged: <b>' + skhCount(damagedQty) + '</b></span><span>Expired: <b>' + skhCount(expiredQty) + '</b></span><span>Lost: <b>' + skhCount(lostQty) + '</b></span></div></div>'
                        : skhStateBox('empty', 'Hakuna data', 'Rekodi za uharibifu/expiry (damagedQty / expiredQty / lostQty) hazipo kwenye bidhaa zilizopakiwa.')}
                </div>
            </div>
        </div>`;

        setTimeout(() => {
            try {
                if (warehouseNames.length > 0) {
                    window.safeCreateChart('invWarehouseValuationBar', {
                        type: 'bar',
                        data: {
                            labels: warehouseNames,
                            datasets: [{ label: 'Stock Value (TSh)', data: warehouseNames.map(w => Math.round(warehouseMap[w])), backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#4D91AA'] }]
                        },
                        options: { responsive: true, maintainAspectRatio: false }
                    });
                }
                if (hasDamageData) {
                    window.safeCreateChart('invDamagesChart', {
                        type: 'doughnut',
                        data: {
                            labels: ['Damaged', 'Expired', 'Lost'],
                            datasets: [{ data: [damagedQty, expiredQty, lostQty], backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6'], borderWidth: 0 }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
                    });
                }
            } catch (e) { console.warn('[BOS] inventory charts:', e && e.message); }
        }, 100);
        return;
    }

    // ==========================================
    // 4.  GENERAL LEDGER (DAFTARI KUU LA HASIBU)
    // ==========================================
    if (tab === 'expenses') {
        /* [DATA INTEGRITY 2026-11-03] Ukurasa huu ni MATUMIZI & GHARAMA, si General
           Ledger. Namba zote kutoka `shop_ledger` halisi. Salio la fedha taslimu/benki,
           AP na reconciliation hazipo kwenye data inayopakiwa → `—` + sababu. */
        const rows = skhDocs(data.ledgerSnap);
        const hasAny = rows.length > 0;
        const amt = (l) => parseFloat(l.amount) || 0;

        const incomeRows = rows.filter(l => l && (l.type === 'income_offline' || l.type === 'income_online'));
        const expenseRows = rows.filter(l => l && l.type === 'expense');
        const debtRows = rows.filter(l => l && l.type === 'debt' && String(l.status || 'pending') === 'pending');

        const revenue = hasAny ? incomeRows.reduce((t, l) => t + amt(l), 0) : null;
        const expenses = hasAny ? expenseRows.reduce((t, l) => t + amt(l), 0) : null;
        const profit = (revenue != null && expenses != null) ? revenue - expenses : null;
        const receivables = hasAny ? debtRows.reduce((t, l) => t + amt(l), 0) : null;
        const realDebts = skhIsNum(parseFloat(data.activeDebts)) ? parseFloat(data.activeDebts) : null;

        const dateOf = (l) => { const d = l.date ? new Date(l.date) : null; return d && !isNaN(d) ? d.toLocaleDateString('sw-TZ') : SKH_NA; };
        const journalRows = rows
            .filter(l => l && (l.type === 'expense' || l.type === 'income_offline' || l.type === 'income_online'))
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
            .map(l => {
                const isIncome = l.type !== 'expense';
                return `<tr style="border-bottom:1px solid #f1f5f9; font-size:12px; text-align:left;">
                    <td style="padding:9px 0;">${dateOf(l)}</td>
                    <td>${l.title || l.category || SKH_NA}</td>
                    <td style="font-weight:bold; color:${isIncome ? '#178864' : '#94A3B8'};">${isIncome ? skhMoney(amt(l)) : SKH_NA}</td>
                    <td style="font-weight:bold; color:${isIncome ? '#94A3B8' : '#ef4444'};">${isIncome ? SKH_NA : skhMoney(amt(l))}</td>
                </tr>`;
            });

        const kpiCards = [
            skhKpi('CASH BALANCE', SKH_NA, 'Hakuna rekodi ya fedha taslimu iliyopakiwa'),
            skhKpi('BANK BALANCE', SKH_NA, 'Hakuna rekodi ya benki iliyopakiwa'),
            skhKpi('RECEIVABLES (MATEJA)', revenue == null ? SKH_NA : skhMoney(realDebts != null ? realDebts : receivables), 'Madeni yanayodaiwa (shop_ledger)', '#f59e0b'),
            skhKpi('PAYABLES (SUPPLIERS)', SKH_NA, 'Hakuna rekodi za AP (Accounts Payable)'),
            skhKpi('REVENUE', revenue == null ? SKH_NA : skhMoney(revenue), incomeRows.length ? incomeRows.length + ' miamala' : '', '#0284c7'),
            skhKpi('EXPENSES', expenses == null ? SKH_NA : skhMoney(expenses), expenseRows.length ? expenseRows.length + ' matumizi' : '', '#f97316'),
            skhKpi('NET PROFIT', profit == null ? SKH_NA : skhMoney(profit), 'Mapato − matumizi', '#178864'),
            skhKpi('UNRECONCILED', SKH_NA, 'Ulinganisho wa benki haujajengwa (reconciliation)')
        ];

        ws.innerHTML = `
        <div style="animation: fadeIn 0.3s ease; display:flex; flex-direction:column; gap:20px; text-align:left;">
            <div style="background:#FFF8E6; border:1px solid #F0DFAE; border-radius:12px; padding:12px 14px; color:#5C4A12; font-size:12.5px; line-height:1.45;">
                <b style="display:block; font-size:13px; margin-bottom:2px;">General Ledger haijajengwa bado</b>
                Ukurasa huu unaonyesha matumizi, mapato na madeni yaliyorekodiwa (shop_ledger). Uwezo kamili wa uhasibu
                (Chart of Accounts, debit/credit kwa akaunti, trial balance, AR/AP, Cash &amp; Bank, Reconciliation)
                haupo kwenye mfumo — umo kwenye orodha ya vipengele vinavyohitaji idhini.
            </div>

            <h2 style="margin:0; font-size:20px; color:#0f172a; font-weight:800;"> Matumizi &amp; Gharama (Expenses &amp; Costs)</h2>
            <p style="margin:0; color:#64748b; font-size:12px; margin-top:-15px;">Namba zote zinatoka kwenye rekodi zako halisi. Sehemu zisizo na chanzo zinaonyesha ${SKH_NA}.</p>
            ${skhKpiGrid(kpiCards)}

            <div class="bos-grid-2">
                ${skhChartCard('Revenue Trend', 'ledgerRevenueLine', hasAny && incomeRows.length > 0, 'Hakuna rekodi za mapato zilizopakiwa, kwa hiyo mwenendo hauwezi kuonyeshwa.')}
                ${skhChartCard('Expenses by Category', 'ledgerExpenseDonut', hasAny && expenseRows.some(l => l.category), 'Matumizi hayana kategoria (category) kwenye rekodi, kwa hiyo mgawanyo hauwezi kuhesabiwa.')}
            </div>

            <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:15px; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> JOURNAL ENTRIES (KITABU CHA MIAMALA)</b>
                <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">Tarehe</th><th>Maelezo / Miamala</th><th>Debit (Ingia)</th><th>Credit (Toka)</th></tr>
                    </thead>
                    <tbody>
                        ${journalRows.length ? journalRows.join('') : skhTableEmpty(4, 'Hakuna miamala ya mapato/matumizi iliyorekodiwa bado. Rekodi zitaonekana hapa mara tu zitakapoongezwa.')}
                    </tbody>
                </table>
            </div>

            <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px;"> Madeni Yanayodaiwa (MATEJA)</b>
                ${debtRows.length
                    ? debtRows.map(l => `<div style="padding:10px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; font-size:12.5px;"><span><b>${l.title || 'Deni'}</b> · ${dateOf(l)}</span><b>${skhMoney(amt(l))}</b></div>`).join('')
                    : skhStateBox('empty', 'Hakuna madeni', 'Hakuna rekodi za madeni yanayosubiri malipo kwenye shop_ledger.')}
            </div>
        </div>`;

        setTimeout(() => {
            try {
                if (incomeRows.length > 0) {
                    /* Mwenendo halisi: jumla ya mapato kwa mwezi kutoka shop_ledger */
                    const byMonth = {};
                    incomeRows.forEach(l => {
                        const d = l.date ? new Date(l.date) : null;
                        if (!d || isNaN(d)) return;
                        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                        byMonth[key] = (byMonth[key] || 0) + amt(l);
                    });
                    const labels = Object.keys(byMonth).sort();
                    if (labels.length) {
                        window.safeCreateChart('ledgerRevenueLine', {
                            type: 'line',
                            data: {
                                labels: labels,
                                datasets: [{ label: 'Mapato (TZS)', data: labels.map(k => Math.round(byMonth[k])), borderColor: '#10b981', fill: false }]
                            },
                            options: { responsive: true, maintainAspectRatio: false }
                        });
                    }
                }
                const cats = {};
                expenseRows.forEach(l => {
                    const c = String(l.category || '').trim();
                    if (c) cats[c] = (cats[c] || 0) + amt(l);
                });
                const catKeys = Object.keys(cats);
                if (catKeys.length) {
                    window.safeCreateChart('ledgerExpenseDonut', {
                        type: 'doughnut',
                        data: {
                            labels: catKeys,
                            datasets: [{ data: catKeys.map(k => Math.round(cats[k])), backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#18A982', '#cbd5e1'], borderWidth: 0 }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
                    });
                }
            } catch (e) { console.warn('[BOS] ledger charts:', e && e.message); }
        }, 100);
        return;
    }

    // ==========================================
    // 5.  STAFF & PAYROLL MODULE (Kazi, Mahudhurio na Mipangilio Maalum ya Mhudumu)
    // ==========================================
    if (tab === 'staff') {
        /* [DATA INTEGRITY 2026-11-03] Wafanyakazi/mishahara kutoka `shop_staff` halisi.
           Mahudhurio na "top performer" hazina chanzo kwenye ukurasa huu → `—`. */
        const staff = skhDocs(data.staffSnap);
        const hasAny = staff.length > 0;
        const num = (v) => parseFloat(v) || 0;

        const payrollTotal = hasAny ? staff.reduce((t, s) => t + num(s.salary), 0) : null;
        const paidTotal = hasAny ? staff.reduce((t, s) => t + num(s.paidSalary), 0) : null;
        const withSalary = staff.filter(s => s.salary != null && s.salary !== '');

        const roleMap = {};
        staff.forEach(s => { const r = String(s.role || '').trim(); if (r) roleMap[r] = (roleMap[r] || 0) + 1; });
        const roleKeys = Object.keys(roleMap);
        const hasRoleData = roleKeys.length > 0;

        const staffRows = staff.map(s => {
            const salary = (s.salary != null && s.salary !== '') ? num(s.salary) : null;
            const paid = (s.paidSalary != null && s.paidSalary !== '') ? num(s.paidSalary) : 0;
            const pending = salary == null ? null : salary - paid;
            return `<tr style="border-bottom:1px solid #f1f5f9; font-size:12px; text-align:left;">
                <td style="padding:9px 0; font-weight:bold;"> ${s.name || s.fullName || s.staffName || SKH_NA}</td>
                <td>${s.role || SKH_NA}</td>
                <td>${s.status || SKH_NA}</td>
                <td>${salary == null ? SKH_NA : skhMoney(salary)}</td>
                <td style="color:green; font-weight:bold;">${skhMoney(paid)}</td>
                <td style="color:red; font-weight:bold;">${pending == null ? SKH_NA : skhMoney(pending)}</td>
            </tr>`;
        });

        /* [PHASE3-DEEP 2026-11-04] Fomu ya kusajili mfanyakazi (ADD-ONLY).
           Markup pekee — handler ni ile ile iliyopo: window.submitAddNewStaff (15-pos-sales.js).
           Nafasi (roles) zinatoka kwenye orodha moja: window.SKH_STAFF_ROLES. */
        const staffRoleList = (Array.isArray(window.SKH_STAFF_ROLES) && window.SKH_STAFF_ROLES.length)
            ? window.SKH_STAFF_ROLES
            : ['Manager', 'Cashier', 'Storekeeper', 'Pharmacist'];
        const staffRoleOptions = staffRoleList.map((r, i) =>
            `<option value="${skh.skhEscape(r)}">${skh.skhEscape(r)}</option>`).join('');

        const kpiCards = [
            skhKpi('TOTAL STAFF', hasAny ? skhCount(staff.length) : SKH_NA, hasAny ? '' : 'Hakuna wafanyakazi waliosajiliwa'),
            skhKpi('PRESENT TODAY', SKH_NA, 'Mahudhurio (attendance) hayapakiwi kwenye ukurasa huu'),
            skhKpi('MONTHLY PAYROLL', payrollTotal == null ? SKH_NA : skhMoney(payrollTotal), withSalary.length ? withSalary.length + ' wenye mshahara' : 'Hakuna mishahara iliyowekwa', '#178864'),
            skhKpi('TOP PERFORMER', SKH_NA, 'Inahitaji data ya mauzo kwa mfanyakazi (haipo)')
        ];

        ws.innerHTML = `
        <div style="animation: fadeIn 0.3s ease; display:flex; flex-direction:column; gap:20px; text-align:left;">
            <h2 style="margin:0; font-size:20px; color:#0f172a; font-weight:800;"> Staff & Payroll Management</h2>
            <p style="margin:0; color:#64748b; font-size:12px; margin-top:-15px;">Wafanyakazi na mishahara kutoka rekodi zako halisi. Sehemu zisizo na chanzo zinaonyesha ${SKH_NA}.</p>
            ${skhKpiGrid(kpiCards)}

            <div class="bos-grid-2">
                ${skhChartCard('Attendance Trend (Weekly)', 'chart_pAttendanceLine', false, 'Hakuna rekodi za mahudhurio (attendance) zilizopakiwa kwenye ukurasa huu.')}
                ${skhChartCard('Staff Distribution', 'chart_pStaffDistributionDonut', hasRoleData, 'Wafanyakazi hawana sehemu ya nafasi (role) kwenye rekodi.')}
            </div>

            <!-- [PHASE3-DEEP 2026-11-04] SAJILI MFANYAKAZI — markup mpya inayounganisha handler iliyopo -->
            <div id="staffRegisterCard" style="background:white; border:1px solid #E1EDE8; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:12px; border-bottom:2px solid #f1f5f9; padding-bottom:8px; color:#18352D;"> SAJILI MFANYAKAZI MPYA</b>
                <form id="staffRegisterForm" onsubmit="event.preventDefault(); if (window.submitAddNewStaff) window.submitAddNewStaff();" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; align-items:end;">
                    <label style="display:flex; flex-direction:column; gap:4px; font-size:11.5px; font-weight:800; color:#526962;">Jina la mfanyakazi
                        <input id="staffNewName" name="staffNewName" type="text" maxlength="80" autocomplete="off" placeholder="mf. Asha Juma" required aria-label="Jina la mfanyakazi" style="padding:9px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:600; color:#0f172a; background:#fff;">
                    </label>
                    <label style="display:flex; flex-direction:column; gap:4px; font-size:11.5px; font-weight:800; color:#526962;">Mshahara (TSh)
                        <input id="staffSalary" name="staffSalary" type="number" min="1" step="1" inputmode="numeric" autocomplete="off" placeholder="mf. 350000" required aria-label="Mshahara kwa TSh" style="padding:9px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:600; color:#0f172a; background:#fff;">
                    </label>
                    <label style="display:flex; flex-direction:column; gap:4px; font-size:11.5px; font-weight:800; color:#526962;">Nafasi / Role
                        <select id="staffNewRole" name="staffNewRole" aria-label="Nafasi ya mfanyakazi" style="padding:9px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:600; color:#0f172a; background:#fff;">${staffRoleOptions}</select>
                    </label>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button id="staffSaveBtn" type="submit" style="flex:1; padding:10px 14px; background:#18A982; color:#fff; border:none; border-radius:9px; font-weight:800; font-size:13px; cursor:pointer;">Hifadhi Mfanyakazi</button>
                        <button id="staffCancelBtn" type="button" onclick="var f=document.getElementById('staffRegisterForm'); if(f){f.reset();} var m=document.getElementById('staffFormMsg'); if(m){m.textContent='';}" style="padding:10px 14px; background:#fff; color:#526962; border:1px solid #D5E2DE; border-radius:9px; font-weight:800; font-size:13px; cursor:pointer;">Ghairi</button>
                    </div>
                    <div id="staffFormMsg" role="status" aria-live="polite" style="grid-column:1 / -1; min-height:16px; font-size:12px; font-weight:700; color:#526962;"></div>
                </form>
            </div>

            <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px;">
                <b style="font-size:12px; text-transform:uppercase; display:block; margin-bottom:15px; border-bottom:2px solid #f1f5f9; padding-bottom:8px;"> EMPLOYEES DIRECTORY &amp; PAYROLL DETAILS</b>
                <div class="bos-grid-2" style="margin-bottom:14px;">
                    <div style="background:#F8FBFA; border:1px solid #E1EDE8; border-radius:10px; padding:10px;"><small style="color:#7E9A91; font-weight:800; font-size:11px;">JUMLA ILIYOLIPWA</small><b style="display:block; color:#178864; font-size:14px;">${paidTotal == null ? SKH_NA : skhMoney(paidTotal)}</b></div>
                    <div style="background:#F8FBFA; border:1px solid #E1EDE8; border-radius:10px; padding:10px;"><small style="color:#7E9A91; font-weight:800; font-size:11px;">INASUBIRI KULIPWA</small><b style="display:block; color:#D9534F; font-size:14px;">${(payrollTotal != null && paidTotal != null) ? skhMoney(payrollTotal - paidTotal) : SKH_NA}</b></div>
                    <div style="background:#F8FBFA; border:1px solid #E1EDE8; border-radius:10px; padding:10px;"><small style="color:#7E9A91; font-weight:800; font-size:11px;">WENYE NAFASI</small><b style="display:block; color:#18352D; font-size:14px;">${hasRoleData ? skhCount(staff.filter(s => String(s.role || '').trim()).length) : SKH_NA}</b></div>
                </div>
                <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #e2e8f0; color:gray;"><th style="padding:6px 0;">Name</th><th>Role</th><th>Status</th><th>Salary</th><th>Paid</th><th>Pending</th></tr>
                    </thead>
                    <tbody>
                        ${staffRows.length ? staffRows.join('') : skhTableEmpty(6, 'Hakuna wafanyakazi waliosajiliwa bado. Ongeza mfanyakazi kwenye mipangilio ya duka ili aanze kuonekana hapa.')}
                    </tbody>
                </table>
            </div>
        </div>`;

        setTimeout(() => {
            try {
                if (hasRoleData) {
                    window.safeCreateChart('chart_pStaffDistributionDonut', {
                        type: 'doughnut',
                        data: {
                            labels: roleKeys,
                            datasets: [{ data: roleKeys.map(r => roleMap[r]), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#4D91AA', '#cbd5e1'], borderWidth: 0 }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
                    });
                }
            } catch (e) { console.warn('[BOS] staff charts:', e && e.message); }
        }, 100);
        return;
    }

    // ==========================================
    // 5b. TRANSPORT-LINKED MODULES (repair 2026-11-04)
    // ==========================================
    if (tab === 'cargo') {
        /* Token Center HALISI (markup uleule wa mfumo wa Usafirishaji) + taarifa
           ya utegemezi. Vitufe vyote vinabaki kama vilivyo. */
        ws.innerHTML = window.skhTokenCenterNoticeHtml() + window.skhTokenCenterHtml();
        return;
    }
    if (['bookings', 'trips', 'tracking', 'drivers', 'fleet', 'finance', 'analytics'].indexOf(tab) !== -1) {
        ws.innerHTML = window.skhTransportBridgeHtml(tab);
        return;
    }

    // ==========================================
    // 6.  SYSTEM SETTINGS
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
            <div style="text-align: left; animation: fadeIn 0.3s ease;"> <h3 style="margin-top:0; color: var(--primary-dark); font-weight:900; text-transform: uppercase;"> USANIDI NA SHERIA ZA BIASHARA</h3> <div style="background:#f8fafc; padding:20px; border-radius:18px; border:1px solid #cbd5e1; margin-bottom:20px;"> <label style="font-size:12px; font-weight:bold; color:var(--primary-dark); display:block; margin-bottom:5px;">STOCK MODE (SHERIA ZA STOO) *</label> <select id="setStockMode" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;"> <option value="strict" ${s.stockMode === 'strict' ? 'selected' : ''}> Strict (Zuia kuuza stoo ikiisha)</option> <option value="flexible" ${s.stockMode === 'flexible' ? 'selected' : ''}> Flexible (Ruhusu kuuza stoo ikiisha)</option> </select> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:15px; margin-bottom:20px;"> <b style="font-size:12px; color:var(--primary-dark); display:block; margin-bottom:12px; text-transform:uppercase;"> MAMLAKA YA CASHIER (PERMISSIONS)</b> <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:12px; margin-bottom:10px;"> <input type="checkbox" id="setCashierViewProfit" ${s.cashierCanViewProfit ? 'checked':''} style="width:18px; height:18px;">
                        Mpe Cashier uwezo wa kuona ripoti ya Faida (Profit)
                    </label> <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:12px;"> <input type="checkbox" id="setCashierEditStock" ${s.cashierCanEditStock ? 'checked':''} style="width:18px; height:18px;">
                        Mpe Cashier uwezo wa kuhariri au kuongeza Stock stoo
                    </label> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:15px; margin-bottom:20px;"> <b style="font-size:12px; color:var(--primary-dark); display:block; margin-bottom:12px; text-transform:uppercase;"> RIPOTI ZINAZOONEKANA KWENYE DASHIBODI</b> <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:12px; margin-bottom:10px;"> <input type="checkbox" id="setRepSales" ${s.showSales !== false ? 'checked' : ''} style="width:18px; height:18px;">
                        Onyesha mauzo (Sales)
                    </label> <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:12px; margin-bottom:10px;"> <input type="checkbox" id="setRepProfit" ${s.showProfit !== false ? 'checked' : ''} style="width:18px; height:18px;">
                        Onyesha faida (Profit)
                    </label> <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:12px; margin-bottom:10px;"> <input type="checkbox" id="setRepLowStock" ${s.showLowStock !== false ? 'checked' : ''} style="width:18px; height:18px;">
                        Onyesha tahadhari ya stoo ndogo (Low stock)
                    </label> <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:12px;"> <input type="checkbox" id="setRepDebts" ${s.showDebts !== false ? 'checked' : ''} style="width:18px; height:18px;">
                        Onyesha madeni ya wateja (Debts)
                    </label> </div> <button onclick="window.saveShopSettings()" id="btnSaveShopSettings" style="width:100%; padding:16px; background:var(--green); color:white; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer; text-transform:uppercase;"> HIFADHI USANIDI </button> </div>`;
        return;
    }

    /* Fallback: tab isiyojulikana — hii ndiyo ilikuwa sababu ya "maudhui ya
       zamani chini ya jina jipya". Sasa inaonyesha hali ya ukweli. */
    ws.innerHTML = window.skhTabNotFoundHtml(tab);

};

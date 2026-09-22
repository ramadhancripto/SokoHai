/* ==== js/app/19-roles.js ==== */
import { skh } from './00-bootstrap.js';

window.loadDriverDashboard = function() {
    const container = document.getElementById('richDashboardContainer');
    if(!container) return;

    container.innerHTML = `
    <div class="control-tower-wrapper"> <!-- 1. SOKOHAI COCKPIT LOGISTICS SIDEBAR --> <div class="ct-sidebar" style="background:#fff; color:#18352D; min-height:100vh; border-right:1px solid #E5ECEC;"> <div class="ct-sidebar-brand"> <span style="font-size: 28px;"></span> <div class="ct-sidebar-brand-text"> <h3>SOKOHAI</h3> <span>Logistics Hub</span> </div> </div> <span class="ct-sidebar-group-title">Logistics Menu</span> <button id="btnTab_overview" class="ct-sidebar-menu-btn side-menu-link active" onclick="window.switchDashTab('overview')"> Dashboard / Cockpit</button> <button id="btnTab_bookings" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('bookings')"> Requests Marketplace</button> <button id="btnTab_inbox" class="ct-sidebar-menu-btn" onclick="if(window.skhOpenRequestInbox) window.skhOpenRequestInbox()"> Request Inbox (NEW)</button> <button id="btnTab_trips" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('trips')"> Active Shipments</button> <button id="btnTab_cargo" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('cargo')"> Token Center</button> <button id="btnTab_tokenbox" class="ct-sidebar-menu-btn" onclick="if(window.skhOpenTokenBox) window.skhOpenTokenBox()"> My Token Box (PK · TR · DL)</button> <button id="btnTab_fleet" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('fleet')"> Fleet Status</button> <button id="btnTab_drivers" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('drivers')">✈ Drivers Directory</button> <button id="btnTab_tracking" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('tracking')"> Live Tracking</button> <button id="btnTab_finance" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('finance')"> Revenue & Costs</button> <button id="btnTab_analytics" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchDashTab('analytics')"> Performance Analytics</button> <button class="ct-sidebar-menu-btn" onclick="window.openModeMenu()" style="background:#fff; color:#526962; border:1px solid #D5E2DE; font-weight:900; margin-top:20px; text-align:center;"> Badili Dashboard / Rudi</button> </div> <!-- 2. MAIN FRAME --> <div class="ct-main-content"> <!-- HEADER BAR --> <div class="ct-header-bar" style="background: white; border-bottom: 1px solid #cbd5e1; padding: 15px 25px;"> <div style="display: flex; align-items: center; gap: 12px;"> <span class="ct-menu-toggle-btn" onclick="window.toggleDashboardSidebar()" style="font-size:0; line-height:0; cursor: pointer; display: none; color: #0f172a;">${window.skhNavIcon ? window.skhNavIcon('menu', 24) : ''}</span> <b style="font-size: 16px; color: #0f172a;">LOGISTICS HUB CONTROL BRIDGE</b> </div> <div class="ct-header-actions"> <button onclick="window.switchMode('buyer')" style="background:#fff; color:#526962; border:1px solid #D5E2DE; padding:10px 18px; border-radius:10px; font-weight:900; font-size:12px; cursor:pointer;"> FUNGA / SOKO KUU</button> </div> </div> <!-- WORKSPACE --> <div class="ct-workspace" id="dashWorkspace" style="padding: 25px;"> <!-- Tab contents render here --> </div> </div> </div> `;

    // Active tab selection
    window.switchDashTab('overview');
};

window.activeProviderTab = 'dashboard';

window.loadProviderDashboard = function() {
    const container = document.getElementById('richDashboardContainer');
    if(!container) return;

    container.innerHTML = `
    <div class="control-tower-wrapper" style="display:flex; min-height:100vh; background:#fff; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;"> <!-- 1. LEFT SIDEBAR (Dark Custom Theme #071625) --> <div class="ct-sidebar" style="width:260px; background:#fff; color:#18352D; border-right:1px solid #E5ECEC; padding:20px; display:flex; flex-direction:column; gap:12px; flex-shrink:0;"> <div class="ct-sidebar-brand" style="border-bottom:1px solid #E5ECEC; padding-bottom:15px; margin-bottom:10px;"> <span style="font-size:24px;"></span> <div class="ct-sidebar-brand-text"> <h3 style="color:white; margin:0; font-size:15px; font-weight:900; letter-spacing:0.5px;">SOKOHAI</h3> <span style="font-size:12.5px; color:#94a3b8; display:block; font-weight:bold;">Huduma Hub</span> </div> </div> <!-- Profile Card (DATA HALISI pekee — hakuna tiki/idadi za kubuni) --> <div style="background:#F8FBFA; padding:15px; border-radius:16px; text-align:center; border:1px solid #E5ECEC; margin-bottom:10px;"> <img src="${skh.skhEscape(skh.currentUser?.photoURL || 'https://ui-avatars.com/api/?name=User')}" style="width:55px; height:55px; border-radius:50%; object-fit:cover; border:2px solid var(--gold);"> <b style="display:block; color:#18352D; font-size:13px; margin-top:8px;">${skh.skhEscape(skh.currentUser?.displayName || (skh.currentUser?.email ? skh.currentUser.email.split('@')[0] : 'Fundi'))}</b> <small style="color:#94a3b8; font-size:12px; display:block; margin-top:3px; word-break:break-all;">${skh.skhEscape(skh.currentUser?.email || '')}</small> </div> <div style="flex-grow:1; display:flex; flex-direction:column; gap:8px; overflow-y:auto; padding-right:5px;"> <span class="ct-sidebar-group-title" style="font-size:12px; color:#475569;">HUB MANAGEMENT</span> <button id="pTab_dashboard" class="ct-sidebar-menu-btn side-menu-link active" onclick="window.switchProviderDashTab('dashboard')"> Dashboard</button> <button id="pTab_requests" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('requests')">Maombi Mapya</button> <button id="pTab_active_tasks" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('active_tasks')">Kazi Zinazoendelea</button> <button id="pTab_completed" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('completed')">Kazi Zilizokamilika</button> <button id="pTab_calendar" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('calendar')">Booking Calendar</button> <button id="pTab_my_services" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('my_services')">Huduma Zangu</button> <button id="pTab_clients" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('clients')">Wateja</button> <button id="pTab_contracts" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('contracts')">Mikataba</button> <button id="pTab_escrow" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('escrow')">Escrow Summary</button> <button id="pTab_earnings" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('earnings')">Mapato</button> <button id="pTab_reviews" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('reviews')">Reviews</button> <button id="pTab_disputes" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('disputes')">Migogoro</button> <button id="pTab_analytics" class="ct-sidebar-menu-btn side-menu-link" onclick="window.switchProviderDashTab('analytics')">Analytics</button> </div> <!-- SOKOPAY WIDGET --> <div style="background:#F8FBFA; border:1px solid #CCEBDD; border-radius:14px; padding:12px; font-size:12.5px; margin-top:10px;"> <b style="color:var(--primary-blue); display:block; margin-bottom:4px;"> SOKOPAY INSTANT</b> <span style="color:#94a3b8; display:block; margin-bottom:8px;">Pokea malipo kwa haraka na usalama.</span> <button onclick="window.openUserPaymentModal()" style="width:100%; padding:6px; background:var(--primary-blue); color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">Jifunze Zaidi</button> </div> <button class="ct-sidebar-menu-btn" onclick="window.switchMode('buyer')" style="background:#fff; color:#526962; border:1px solid #D5E2DE; font-weight:900; margin-top:15px; text-align:center;"> Rudi Soko Kuu</button> </div> <!-- 2. MAIN COCKPIT BRIDGE --> <div class="ct-main-content" style="flex-grow:1; display:flex; flex-direction:column; min-width:0; background:#fff;"> <!-- HEADER BAR --> <div class="ct-header-bar" style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:12px 25px; border-bottom:1px solid #E2E8F0; height:60px;"> <div style="display:flex; align-items:center; gap:12px;"> <span class="ct-menu-toggle-btn" onclick="window.toggleDashboardSidebar()" style="font-size:0; line-height:0; cursor: pointer; display: none; color: #0f172a;">${window.skhNavIcon ? window.skhNavIcon('menu', 24) : ''}</span> <div> <h2 style="margin:0; font-size:16px; color:#0f172a; font-weight:900; text-transform:uppercase;">Huduma Dashboard</h2> <small style="color:#64748b; font-size:13px;">Karibu, ${skh.skhEscape(skh.currentUser?.displayName || 'Fundi Umeme')}! Hapa ni muhtasari wa huduma zako.</small> </div> </div> <div style="background:white; padding:8px 15px; border-radius:10px; border:1px solid #e2e8f0; font-size:13px; font-weight:800; color:#475569;">
                     25 Mei, 2025 - 24 Jun, 2025
                </div> </div> <!-- DYNAMIC WORKSPACE --> <div class="ct-workspace" id="providerWorkspace" style="padding:20px; display:flex; flex-direction:column; gap:20px; overflow-y:auto; box-sizing:border-box;"> <!-- Tab views rendering dynamically --> </div> </div> </div>`;

    window.switchProviderDashTab('dashboard');
};

window.switchProviderDashTab = function(tabName) {
    if (typeof window.skhCloseDashboardSidebar === 'function') {
        window.skhCloseDashboardSidebar(); // Funga drawer kabla ya kubadili tab (simu)
    }
    window.activeProviderTab = tabName;

    document.querySelectorAll('.ct-sidebar .side-menu-link').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('pTab_' + tabName);
    if(activeBtn) activeBtn.classList.add('active');

    const workspace = document.getElementById('providerWorkspace');
    if(!workspace) return;

    // A.  OVERVIEW TOWER (Exact Match to Your Hub Image)
    if (tabName === 'dashboard') {
        workspace.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:20px; animation:fadeIn 0.2s ease-out;"> <!-- ROW 1: 4 FIRST KPI CARDS --> <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;"> <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:16px; text-align:left;"> <small style="color:gray; font-size:12px; font-weight:900; text-transform:uppercase;">Maombi Mapya</small> <b style="font-size:22px; color:#0f172a; display:block; margin:4px 0;">15</b> <span style="color:green; font-size:12.5px; font-weight:bold;"> 20% kutoka wiki iliyopita</span> </div> <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:16px; text-align:left;"> <small style="color:gray; font-size:12px; font-weight:900; text-transform:uppercase;">Yanayoendelea</small> <b style="font-size:22px; color:#10b981; display:block; margin:4px 0;">8</b> <span style="color:green; font-size:12.5px; font-weight:bold;"> 12% kutoka wiki iliyopita</span> </div> <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:16px; text-align:left;"> <small style="color:gray; font-size:12px; font-weight:900; text-transform:uppercase;">Yaliyokamilika</small> <b style="font-size:22px; color:#1d4ed8; display:block; margin:4px 0;">120</b> <span style="color:green; font-size:12.5px; font-weight:bold;"> 18% kutoka wiki iliyopita</span> </div> <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:16px; text-align:left;"> <small style="color:gray; font-size:12px; font-weight:900; text-transform:uppercase;">Rating</small> <b style="font-size:22px; color:#ea580c; display:block; margin:4px 0;">4.8</b> <span style="color:var(--gold); font-size:13px;"> (128)</span> </div> </div> <!-- ROW 2: 4 FINANCIAL KPI CARDS --> <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;"> <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:16px; text-align:left;"> <small style="color:gray; font-size:12px; font-weight:900; text-transform:uppercase;">Mapato Mwezi Huu</small> <b style="font-size:20px; color:#10b981; display:block; margin:4px 0;">TZS 2,500,000</b> <span style="color:green; font-size:12.5px; font-weight:bold;"> 22% kutoka mwezi jana</span> </div> <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:16px; text-align:left;"> <small style="color:gray; font-size:12px; font-weight:900; text-transform:uppercase;">Escrow Pending</small> <b style="font-size:20px; color:#e11d48; display:block; margin:4px 0;">TZS 800,000</b> <span style="color:gray; font-size:12.5px; font-weight:bold;">3 mikataba inasubiri</span> </div> <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:16px; text-align:left;"> <small style="color:gray; font-size:12px; font-weight:900; text-transform:uppercase;">Migogoro</small> <b style="font-size:20px; color:#d97706; display:block; margin:4px 0;">2</b> <span style="color:red; font-size:12.5px; font-weight:bold;">Inahitaji hatua yako</span> </div> <div style="background:white; border:1px solid #E2E8F0; padding:15px; border-radius:16px; text-align:left;"> <small style="color:gray; font-size:12px; font-weight:900; text-transform:uppercase;">Growth</small> <b style="font-size:20px; color:#06b6d4; display:block; margin:4px 0;">+18%</b> <span style="color:green; font-size:12.5px; font-weight:bold;">Kukuaji kwa wateja</span> </div> </div> <!-- ROW 3: CHARTS AND ACTIVE LISTS --> <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;"> <!-- Chart 1: Maombi ya Huduma (Line) --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px; text-align:left;"> <b style="font-size:12px; text-transform:uppercase;"> Maombi ya Huduma (Wiki Hii)</b> <div style="height:180px; position:relative; margin-top:15px;"><canvas id="hubRequestLineChart"></canvas></div> </div> <!-- Chart 2: Mapato (Bar) --> <div style="background:white; border:1px solid #cbd5e1; border-radius:16px; padding:20px; text-align:left;"> <b style="font-size:12px; text-transform:uppercase;"> Mapato (TZS)</b> <div style="height:180px; position:relative; margin-top:15px;"><canvas id="hubEarningsBarChart"></canvas></div> </div> </div> <!-- ROW 4: DATA LISTS GRID --> <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;"> <!-- New Requests list --> <div style="background:white; border:1px solid #cbd5e1; border-radius:18px; padding:20px; text-align:left;"> <b style="font-size:12px; color:var(--primary-dark); display:block; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:5px;"> Maombi Mapya</b> <div style="display:flex; flex-direction:column; gap:12px;" id="hubNewRequestsArea"> <!-- Loaded dynamically --> </div> </div> <!-- Active Tasks list --> <div style="background:white; border:1px solid #cbd5e1; border-radius:18px; padding:20px; text-align:left;"> <b style="font-size:12px; color:var(--primary-dark); display:block; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:5px;"> Kazi Zinazoendelea</b> <div style="display:flex; flex-direction:column; gap:12px;" id="hubActiveTasksArea"> <!-- Loaded dynamically --> </div> </div> </div> <!-- ROW 5: BOTTOM INFO BLOCKS --> <div style="display:grid; grid-template-columns: 1.2fr 1.5fr 1fr; gap:15px; text-align:left;"> <!-- Escrow summary --> <div style="background:white; border:1px solid #cbd5e1; padding:15px; border-radius:16px;"> <b style="font-size:13px; display:block; margin-bottom:10px;"> Escrow Summary</b> <div style="font-size:13px; display:flex; flex-direction:column; gap:8px;"> <div style="display:flex; justify-content:space-between;"><span>Held:</span><b>TZS 800,000</b></div> <div style="display:flex; justify-content:space-between;"><span>Released:</span><b>TZS 4,200,000</b></div> <div style="display:flex; justify-content:space-between;"><span>Pending:</span><b>TZS 600,000</b></div> <div style="display:flex; justify-content:space-between;"><span>Refunded:</span><b>TZS 150,000</b></div> </div> </div> <!-- Map View --> <div style="background:white; border:1px solid #cbd5e1; padding:15px; border-radius:16px; display:flex; flex-direction:column;"> <b style="font-size:13px; display:block; margin-bottom:8px;"> Map View (Dar es Salaam)</b> </div> <!-- Mapato Quick Table --> <div style="background:white; border:1px solid #cbd5e1; padding:15px; border-radius:16px;"> <b style="font-size:13px; display:block; margin-bottom:10px;"> Mapato Summary</b> <div style="font-size:13px; display:flex; flex-direction:column; gap:8px;"> <div style="display:flex; justify-content:space-between;"><span>Leo:</span><b>TZS 150,000</b></div> <div style="display:flex; justify-content:space-between;"><span>Wiki Hii:</span><b>TZS 750,000</b></div> <div style="display:flex; justify-content:space-between;"><span>Mwezi Huu:</span><b>TZS 2,500,000</b></div> <div style="display:flex; justify-content:space-between;"><span>Mwaka Huu:</span><b>TZS 18,600,000</b></div> </div> </div> </div> <!-- ROW 6: REVIEWS, CALENDAR & RECOMMENDATIONS --> <div style="display:grid; grid-template-columns: 1.2fr 1.5fr 1fr; gap:15px; text-align:left;"> <!-- Reviews --> <div style="background:white; border:1px solid #cbd5e1; padding:15px; border-radius:16px;"> <b style="font-size:13px; display:block; margin-bottom:8px; color:var(--gold);"> Reviews & Rating breakdown</b> <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;"> <h1 style="margin:0; font-size:32px;">4.8</h1> <span style="font-size:13px; color:gray;">(128 Reviews)</span> </div> <div style="font-size:12.5px; display:flex; flex-direction:column; gap:2px; color:gray;"> <div>5 Star: <b>85%</b></div> <div>4 Star: <b>10%</b></div> <div>3 Star: <b>3%</b></div> <div>2 Star: <b>1%</b></div> <div>1 Star: <b>1%</b></div> </div> </div> <!-- Booking Calendar --> <div style="background:white; border:1px solid #cbd5e1; padding:15px; border-radius:16px;"> <b style="font-size:13px; display:block; margin-bottom:8px;"> Kalendar ya Bookings (Juni 2025)</b> <div style="font-size:13px; display:flex; flex-direction:column; gap:8px;"> <div style="border-left:3px solid #10b981; padding-left:8px; margin-bottom:4px;"> <b>09:00 AM - House Wiring</b><br> <span style="color:gray;">Mikocheni, DSM • TZS 120,000</span> </div> <div style="border-left:3px solid #3b82f6; padding-left:8px;"> <b>11:00 AM - Repair Switch</b><br> <span style="color:gray;">Msasani, DSM • TZS 80,000</span> </div> </div> </div> <!-- Smart Recommendations --> <div style="background:white; border:1px solid #cbd5e1; padding:15px; border-radius:16px; font-size:13px;"> <b style="font-size:13px; display:block; margin-bottom:8px; color:var(--primary-blue);"> Smart Recommendations</b> <div style="display:flex; flex-direction:column; gap:6px;"> <span> Maombi Karibu Yako: 5 ndani ya 5km.</span> <span> Wateja wa Kawaida: Wasiliana na wateja 10 waliofanya kazi nawe.</span> </div> </div> </div> <!-- BOTTOM QUICK ACTIONS ROW --> <div style="background:white; border:1px solid #cbd5e1; border-radius:18px; padding:15px; display:flex; justify-content:space-around; align-items:center; gap:10px;"> <button onclick="showForm('serviceForm')" style="padding:10px 18px; background:var(--primary-blue); color:white; border:none; border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer;"> Ongeza Huduma</button> <button onclick="window.openUserPaymentModal()" style="padding:10px 18px; background:var(--green); color:white; border:none; border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer;"> Pokea Malipo</button> <button onclick="showForm('serviceForm')" style="padding:10px 18px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer;"> Tangaza Huduma</button> <button onclick="alert('Usimamizi wa Migogoro: Huna migogoro hai inayohitaji hatua yako hivi sasa.')" style="padding:10px 18px; background:#fef2f2; color:#ef4444; border:1px solid #fee2e2; border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer;"> Dai la Migogoro</button> </div> </div>`;

        setTimeout(() => {
            window.initHubOverviewCharts();
            window.loadHubNewRequests();
            window.loadHubActiveTasks();
        }, 100);
        return;
    }

    // B. OTHER TABS (Maombi Mapya n.k.)
    if (tabName === 'requests') {
        workspace.innerHTML = `
            <div style="text-align:left; animation:fadeIn 0.2s ease-out;"> <h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> Maombi Mapya ya Huduma</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Kagua maombi yote yaliyotumwa na wateja wa karibu kwako sasa hivi [1].</p> <div style="display:flex; flex-direction:column; gap:12px;" id="hubDetailedNewReqArea">Inapakia maombi...</div> </div>`;
        setTimeout(() => window.loadHubDetailedRequests(), 100);
        return;
    }

    if (tabName === 'active_tasks') {
        workspace.innerHTML = `
            <div style="text-align:left; animation:fadeIn 0.2s ease-out;"> <h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> Kazi Zinazoendelea (Active Tasks)</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Fuatilia maendeleo, fanya mawasiliano na thibitisha kumalizika kwa mikataba.</p> <div style="display:flex; flex-direction:column; gap:12px;" id="hubDetailedActiveArea">Inapakia kazi...</div> </div>`;
        setTimeout(() => window.loadHubDetailedActiveTasks(), 100);
        return;
    }

    // C. SECONDARY TABS — kila kitufe kinaelekeza kwenye view yake HALISI (sio kurudia ile ile)
    const secondaryTargets = {
        completed: 'loadHubDetailedCompletedTasks',
        calendar: 'loadHubDetailedCalendar',
        my_services: 'loadHubDetailedMyServices',
        clients: 'loadHubDetailedClients',
        contracts: 'loadHubDetailedContracts',
        escrow: 'loadHubDetailedEscrow',
        earnings: 'loadHubDetailedEarnings',
        reviews: 'loadHubDetailedReviews',
        disputes: 'loadHubDetailedDisputes',
        analytics: 'loadHubDetailedAnalytics'
    };
    if (secondaryTargets[tabName] && typeof window[secondaryTargets[tabName]] === 'function') {
        window[secondaryTargets[tabName]]();
        return;
    }
};

window.initHubOverviewCharts = function() {
    // 1. Maombi ya Huduma (Line Chart)
    window.safeCreateChart('hubRequestLineChart', {
        type: 'line',
        data: {
            labels: ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'],
            datasets: [{
                label: 'Maombi',
                data: [12, 18, 11, 25, 20, 38, 22],
                borderColor: '#1d4ed8',
                backgroundColor: 'rgba(29, 78, 216, 0.05)',
                fill: true,
                tension: 0.35,
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { grid: { borderDash: [5, 5] } } }
        }
    });

    // 2. Mapato ya Huduma (Bar Chart)
    window.safeCreateChart('hubEarningsBarChart', {
        type: 'bar',
        data: {
            labels: ['Wiki 1', 'Wiki 2', 'Wiki 3', 'Wiki 4'],
            datasets: [{
                label: 'Earnings (TZS)',
                data: [1500000, 2200000, 1300000, 1900000],
                backgroundColor: '#10b981',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { grid: { borderDash: [5, 5] } } }
        }
    });
};

// [REAL DATA 2026-09] Maombi halisi yanayungoja — mock names zimeondolewa kabisa.
window.loadHubNewRequests = async function () {
    const area = document.getElementById('hubNewRequestsArea');
    if (!area || !skh.currentUser) return;
    try {
        const q = skh.query(skh.collection(skh.db, "requests"),
            skh.where("receiverId", "==", skh.currentUser.uid),
            skh.where("status", "==", "pending"));
        const snap = await skh.getDocs(q);
        if (snap.empty) {
            area.innerHTML = `<div style="background:#f8fafc; border:1px dashed #e2e8f0; padding:16px; border-radius:12px; text-align:center; color:#94a3b8; font-size:12.5px;">Bado hakuna ombi jipya. Ombi la mteja litapofika litaonekana hapa.</div>`;
            return;
        }
        let html = '';
        snap.forEach(docSnap => {
            const r = docSnap.data();
            const price = parseFloat(r.detail2 || r.price || 0);
            const task = String(r.itemTitle || r.detail1 || 'Huduma').slice(0, 60);
            const name = String(r.senderName || 'Mteja');
            const sName = name.replace(/'/g, "\\'"), sTask = task.replace(/'/g, "\\'");
            html += `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;"> <div> <b style="font-size:13px; color:#0f172a; display:block;"> ${skh.skhEscape(name)}</b> <small style="color:gray;">${skh.skhEscape(task)}</small> <b style="display:block; color:var(--terracotta); font-size:13px; margin-top:2px;">TZS ${price.toLocaleString()}</b> </div> <div style="display:flex; gap:6px;"> <button onclick="window.acceptHubServiceRequest('${docSnap.id}', '${sName}', '${sTask}', ${price}, '${r.senderId || ''}')" style="padding:6px 12px; background:var(--green); color:white; border:none; border-radius:6px; font-weight:bold; font-size:12.5px; cursor:pointer;">Kubali</button> <button onclick="window.rejectHubServiceRequest('${docSnap.id}')" style="padding:6px 12px; background:#fee2e2; color:#ef4444; border:none; border-radius:6px; font-weight:bold; font-size:12.5px; cursor:pointer;">Kataa</button> </div> </div>`;
        });
        area.innerHTML = html;
    } catch (e) {
        area.innerHTML = `<div style="color:#b45309; font-size:12.5px; padding:12px; text-align:center;">Imeshindwa kupakia maombi: ${skh.skhEscape(e.message || '')}</div>`;
    }
};

// [REAL DATA 2026-09] Kazi halisi zilizokubaliwa (escrow orders za huduma)
window.loadHubActiveTasks = async function () {
    const area = document.getElementById('hubActiveTasksArea');
    if (!area || !skh.currentUser) return;
    try {
        const q = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", skh.currentUser.uid));
        const snap = await skh.getDocs(q);
        const active = [];
        snap.forEach(docSnap => {
            const o = docSnap.data();
            if (o.collectionName === 'services' && /held|accepted|in_progress|in progress|on route|on site/i.test(String(o.status || ''))) {
                active.push({ id: docSnap.id, ...o });
            }
        });
        if (active.length === 0) {
            area.innerHTML = `<div style="background:#f8fafc; border:1px dashed #e2e8f0; padding:16px; border-radius:12px; text-align:center; color:#94a3b8; font-size:12.5px;">Bado huna kazi inayoendelea iliyokubaliwa.</div>`;
            return;
        }
        area.innerHTML = active.slice(0, 6).map(t => {
            const progress = 0;
            return `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:12px; display:flex; flex-direction:column; gap:5px;"> <div style="display:flex; justify-content:space-between;"> <b> ${skh.skhEscape((t.itemTitle || 'Huduma') + '')}</b> <span style="font-size:12px; background:#eef2f6; color:#475569; padding:2px 8px; border-radius:8px; font-weight:bold;">${t.status || 'Accepted'}</span> </div> <small style="color:gray;">Mteja: ${skh.skhEscape(String(t.buyerName || '—'))} | TZS ${Number(t.amount || 0).toLocaleString()}</small> <div style="width:100%; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden; margin-top:4px;"> <div style="width:${progress}%; height:100%; background:#3b82f6;"></div> </div> </div>`;
        }).join('');
    } catch (e) {
        area.innerHTML = `<div style="color:#b45309; font-size:12.5px; padding:12px; text-align:center;">Imeshindwa kupakia kazi: ${skh.skhEscape(e.message || '')}</div>`;
    }
};

window.updateHubCategories = function() {
    const groupVal = document.getElementById('servGroupType').value;
    const catSelect = document.getElementById('servHubCategory');
    const subSelect = document.getElementById('servHubSubCategory');
    
    document.getElementById('hubServiceFiltersBox').style.display = 'none';
    subSelect.innerHTML = `<option value="">-- Chagua Aina Ndogo --</option>`;
    
    if(!groupVal || !skh.serviceDataMap[groupVal]) {
        catSelect.innerHTML = `<option value="">-- Chagua Kategoria --</option>`;
        return;
    }
    
    const categories = Object.keys(skh.serviceDataMap[groupVal]);
    catSelect.innerHTML = `<option value="">-- Chagua Kategoria --</option>` + 
                          categories.map(c => `<option value="${c}">${c}</option>`).join('');
};

window.updateHubSubcategories = function() {
    const groupVal = document.getElementById('servGroupType').value;
    const catVal = document.getElementById('servHubCategory').value;
    const subSelect = document.getElementById('servHubSubCategory');
    
    document.getElementById('hubServiceFiltersBox').style.display = 'none';
    
    if(!groupVal || !catVal || !skh.serviceDataMap[groupVal] || !skh.serviceDataMap[groupVal][catVal]) {
        subSelect.innerHTML = `<option value="">-- Chagua Aina Ndogo --</option>`;
        return;
    }
    
    const subcats = Object.keys(skh.serviceDataMap[groupVal][catVal]);
    subSelect.innerHTML = `<option value="">-- Chagua Aina Ndogo --</option>` + 
                          subcats.map(s => `<option value="${s}">${s}</option>`).join('');
};

window.generateHubServiceFilters = function() {
    const groupVal = document.getElementById('servGroupType').value;
    const catVal = document.getElementById('servHubCategory').value;
    const subVal = document.getElementById('servHubSubCategory').value;
    
    const filterContainer = document.getElementById('hubServiceFiltersBox');
    const filtersArea = document.getElementById('hubServiceFiltersArea');

    if(!subVal || !skh.serviceDataMap[groupVal] || !skh.serviceDataMap[groupVal][catVal] || !skh.serviceDataMap[groupVal][catVal][subVal]) {
        filterContainer.style.display = 'none';
        return;
    }

    const data = skh.serviceDataMap[groupVal][catVal][subVal];

    if(data.filters && data.filters.length > 0) {
        let inputsHtml = '';
        data.filters.forEach(f => {
            inputsHtml += `
            <div style="margin-top:10px;"> <label style="font-size:13px; font-weight:bold; color:gray; display:block; margin-bottom:3px;">${f} *</label> <input type="text" class="hub-service-filter-input" data-filter="${f}" placeholder="Jaza ${f}..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; outline:none; background:white;" required> </div>`;
        });
        filtersArea.innerHTML = inputsHtml;
        filterContainer.style.display = 'block';
    } else {
        filterContainer.style.display = 'none';
    }
};

window.submitSokohaiService = async function(event) {
    if(event) event.preventDefault();
    if(!skh.requireAuth()) return;

    const btn = document.getElementById('btnSubmitHubService');
    const title = document.getElementById('servHubTitle').value.trim();
    const grp = document.getElementById('servGroupType').value;
    const cat = document.getElementById('servHubCategory').value;
    const sub = document.getElementById('servHubSubCategory').value;
    const price = parseFloat(document.getElementById('servHubPrice').value) || 0;
    const desc = document.getElementById('servHubDesc').value.trim();
    const loc = document.getElementById('servHubLocation').value.trim();

    if (!title || !grp || !cat || !sub || !desc || !loc || price <= 0) {
        alert(" jaza sehemu zote zenye alama ya nyota (*).");
        return;
    }

    const origText = btn.innerHTML;
    btn.innerHTML = " Inachapisha...";
    btn.disabled = true;

    // Kusanya vigezo vya kipekee vya kila aina ya huduma
    let filtersObj = {};
    document.querySelectorAll('.hub-service-filter-input').forEach(inp => {
        const key = inp.getAttribute('data-filter');
        if (inp.value.trim() !== '') {
            filtersObj[key] = inp.value.trim();
        }
    });

    try {
        const imageUrl = await skh.uploadImage('servHubImage');
        const docId = await skh.saveData('services', {
            title: title,
            price: price,
            groupType: grp,
            category: cat, 
            subCategory: sub,
            filters: filtersObj,
            description: desc,
            location: loc,
            image: imageUrl || "https://ui-avatars.com/api/?name=Huduma&background=1d4ed8&color=fff",
            // [NEGO LOCK §21/§22] Provider Settings — kweli iliyo kwenye doc la huduma.
            negotiationAllowed: (function(){ var el = document.getElementById('servNegoAllowed'); return el ? !!el.checked : true; })(),
            createdAt: new Date().toISOString()
        });

        if (docId) {
            alert(` HUDUMA IMESAJILIWA!\nHuduma yako ya "${title}" imesajiliwa kikamilifu kwenye database ya Sokohai Huduma Hub.`);
            document.getElementById('serviceForm').reset();
            closeModals();
            if (typeof loadProviderDashboard === 'function') {
                loadProviderDashboard(); // Sasisha dashbodi ya mtoa huduma
            }
        }
    } catch (e) {
        alert(" Imeshindwa kusajili: " + e.message);
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
};



window.initExecutiveControlTowerCharts = function(data) {
    // Row 2: Revenue Trend Area Chart
    window.safeCreateChart('revenueTrendAreaChart', {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Revenue (TSh)',
                data: [4200000, 5800000, 6100000, 8400000, 9500000, data.totalSales || 12845300],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Row 3: Donut 1 - Sales Channels
    window.safeCreateChart('salesChannelsDonutChart', {
        type: 'doughnut',
        data: {
            labels: ['POS 40%', 'Online 35%', 'Agent 15%', 'Others 10%'],
            datasets: [{
                data: [40, 35, 15, 10],
                backgroundColor: ['#3b82f6', '#a855f7', '#10b981', '#cbd5e1']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });

    // Row 3: Pie 2 - Revenue Sources
    window.safeCreateChart('revenueSourcesPieChart', {
        type: 'pie',
        data: {
            labels: ['POS', 'Online', 'Agents', 'Services', 'Transport'],
            datasets: [{
                data: [45, 25, 15, 10, 5],
                backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#dc2626']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Row 3: Donut 3 - Inventory Health
    window.safeCreateChart('inventoryHealthDonutChart', {
        type: 'doughnut',
        data: {
            labels: ['Healthy 70%', 'Low Stock 20%', 'Out Stock 10%'],
            datasets: [{
                data: [70, 20, 10],
                backgroundColor: ['#10b981', '#ea580c', '#ef4444']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });

    // Row 4: Horizontal Bar 1 - Top Products
    window.safeCreateChart('topProductsHorizontalBarChart', {
        type: 'bar',
        data: {
            labels: ['Sugar Bag', 'HP Laptop', 'Samsung A55'],
            datasets: [{
                label: 'Sales (TSh)',
                data: [3500000, 2800000, 1500000],
                backgroundColor: '#3b82f6'
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });

    // Row 4: Horizontal Bar 2 - Top Branches
    window.safeCreateChart('topBranchesHorizontalBarChart', {
        type: 'bar',
        data: {
            labels: ['Dar Branch', 'Mwanza Branch', 'Arusha Branch'],
            datasets: [{
                label: 'Sales Vol',
                data: [7200000, 4100000, 2800000],
                backgroundColor: '#f59e0b'
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });

    // Row 5: Cash Flow Double Bar Chart
    window.safeCreateChart('cashFlowDoubleBarChart', {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [
                { label: 'Cash In', data: [4.2, 5.8, 6.1, 8.4, 9.5, 12.8], backgroundColor: '#10b981' },
                { label: 'Cash Out', data: [2.1, 3.4, 3.9, 4.8, 5.1, 6.4], backgroundColor: '#ef4444' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Row 6: Delivery Success Donut
    window.safeCreateChart('deliverySuccessDonutChart', {
        type: 'doughnut',
        data: {
            labels: ['Success 90%', 'Failed 10%'],
            datasets: [{
                data: [90, 10],
                backgroundColor: ['#10b981', '#dc2626']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });

    // Row 6: Delivery Trend Line
    window.safeCreateChart('deliveryTrendLineChart', {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            datasets: [{
                label: 'Deliveries',
                data: [15, 24, 18, 30, 25],
                borderColor: '#3b82f6',
                fill: false
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Row 6: Delivery Regions Bar Chart
    window.safeCreateChart('deliveryRegionsBarChart', {
        type: 'bar',
        data: {
            labels: ['Dar', 'Mwanza', 'Arusha'],
            datasets: [{
                label: 'Shipments',
                data: [85, 34, 12],
                backgroundColor: '#a855f7'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Row 7: Escrow Distribution Donut
    window.safeCreateChart('escrowDistributionDonutChart', {
        type: 'doughnut',
        data: {
            labels: ['Held', 'Released', 'Pending'],
            datasets: [{
                data: [15, 80, 5],
                backgroundColor: ['#ea580c', '#10b981', '#cbd5e1']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });

    // Row 7: Escrow Flow Trend Line
    window.safeCreateChart('escrowFlowTrendLineChart', {
        type: 'line',
        data: {
            labels: ['01 Jun', '05 Jun', '09 Jun', '13 Jun', '17 Jun', '19 Jun'],
            datasets: [{
                label: 'Escrow Movement (TSh)',
                data: [400000, 800000, 600000, 1100000, 1500000, 1280000],
                borderColor: '#10b981',
                fill: false
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
};

window.initProductAnalyticsCharts = function(data) {
    // 1. Product Revenue (Horizontal Bar Chart)
    window.safeCreateChart('chart_pRevenue', {
        type: 'bar',
        data: {
            labels: ['Samsung A55', 'Tecno Camon', 'iPhone 14'],
            datasets: [{
                label: 'Revenue Value (TSh)',
                data: [4500000, 3100000, 2400000],
                backgroundColor: '#3b82f6'
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });

    // 2. Product Profit (Horizontal Bar Chart)
    window.safeCreateChart('chart_pProfit', {
        type: 'bar',
        data: {
            labels: ['Samsung A55', 'Tecno Camon', 'iPhone 14'],
            datasets: [{
                label: 'Profit Value (TSh)',
                data: [1200000, 850000, 700000],
                backgroundColor: '#10b981'
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });

    // 3. Product Categories (Pie Chart)
    window.safeCreateChart('chart_pCategories', {
        type: 'pie',
        data: {
            labels: ['Electronics 40%', 'Fashion 25%', 'Food 20%', 'Others 15%'],
            datasets: [{
                data: [40, 25, 20, 15],
                backgroundColor: ['#3b82f6', '#f59e0b', '#10b981', '#cbd5e1']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 4. Product Demand Trend (Line Chart)
    window.safeCreateChart('chart_pDemand', {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Demand Demand Vol',
                data: [120, 150, 140, 210, 290, 310],
                borderColor: '#8b5cf6',
                fill: false
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 5. Product Views (Bar Chart)
    window.safeCreateChart('chart_pViews', {
        type: 'bar',
        data: {
            labels: ['Samsung', 'Tecno', 'iPhone'],
            datasets: [{
                label: 'View Count',
                data: [4500, 3100, 2800],
                backgroundColor: '#3b82f6'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 6. Product Conversion (Funnel Chart Simulation)
    window.safeCreateChart('chart_pConversion', {
        type: 'bar',
        data: {
            labels: ['Views (10k)', 'Clicks (3k)', 'Cart (700)', 'Orders (150)'],
            datasets: [{
                label: 'Conversion Funnel Steps',
                data: [10000, 3000, 700, 150],
                backgroundColor: ['#3b82f6', '#a855f7', '#f59e0b', '#10b981']
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });

    // 7. Product Ratings (Donut Chart)
    window.safeCreateChart('chart_pRatings', {
        type: 'doughnut',
        data: {
            labels: ['5 Star 60%', '4 Star 20%', '3 Star 10%', '2 Star 5%', '1 Star 5%'],
            datasets: [{
                data: [60, 20, 10, 5, 5],
                backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ea580c', '#dc2626']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });

    // 8. Product Returns (Bar Chart)
    window.safeCreateChart('chart_pReturns', {
        type: 'bar',
        data: {
            labels: ['Wrong Item', 'Damaged', 'Late Delivery'],
            datasets: [{
                label: 'Returns Reason Volume',
                data: [15, 8, 4],
                backgroundColor: '#ef4444'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 9. Product Lifecycle (Stacked Bar Chart)
    window.safeCreateChart('chart_pLifecycle', {
        type: 'bar',
        data: {
            labels: ['Lifecycle Stage Status %'],
            datasets: [
                { label: 'New', data: [15], backgroundColor: '#60a5fa' },
                { label: 'Growing', data: [35], backgroundColor: '#34d399' },
                { label: 'Peak', data: [30], backgroundColor: '#a78bfa' },
                { label: 'Declining', data: [15], backgroundColor: '#fbbf24' },
                { label: 'Dead', data: [5], backgroundColor: '#f87171' }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } }
        }
    });

    // 10. Inventory Health (Donut Chart)
    window.safeCreateChart('chart_pHealth', {
        type: 'doughnut',
        data: {
            labels: ['Healthy 70%', 'Low Stock 20%', 'Out Stock 10%'],
            datasets: [{
                data: [70, 20, 10],
                backgroundColor: ['#10b981', '#f59e0b', '#dc2626']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });
};

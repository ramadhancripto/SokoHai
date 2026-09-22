/* ==== js/app/22-printing.js ==== */
import { skh } from './00-bootstrap.js';

window.renderSokoHaiAccountMenu = function(){
    const modal=document.getElementById('sidebarMenuModal'); if(!modal) return;
    modal.className='overlay-menu skh-account-menu';
    modal.style.display='flex';
    modal.style.zIndex='100005';
    const name=skh.currentUserData?.fullName || skh.currentUser?.displayName || 'SokoHai User';
    const email=skh.currentUser?.email || skh.currentUserData?.phone || 'Account settings';
    const photo=skh.currentUserData?.photoURL || skh.currentUser?.photoURL || '';

    // ==== MENU MOJA IMARA (hakuna duplicates): Soko + Usimamizi + SokoPay + Account ====
    // sehemu kuu zinaonekana wazi; sehemu za akaunti zinakunjwa kwa asili (ili isiwe ndefu)
    const quick = [
        ['SOKO (MARKETPLACE)', false, [
            ['feed_all','','Soko Huru (Feed)','Mchanganyiko wa bidhaa, huduma na usafirishaji'],
            ['feed_products','','Bidhaa Sokoni','Ona bidhaa zote zinazouzwa'],
            ['feed_services','','Watoa Huduma','Mafundi na huduma mbalimbali'],
            ['feed_drivers','','Usafirishaji','Boda, bajaji, gari na mizigo']
        ]],
        ['USIMAMIZI (DASHBOARDS)', false, [
            ['mode_buyer','','Mnunuzi (Soko)','Tafuta, nunua na fuatilia oda zako'],
            ['mode_seller','','Muuzaji wa Bidhaa','Duka, stoo, mauzo na madeni'],
            ['mode_provider','','Mtoa Huduma / Fundi','Kazi, mikataba na mapato ya ufundi'],
            ['mode_driver','','Msafirishaji','Safari, mizigo, tokens na mapato'],
            ['mode_agent','','Wakala Sokohai','Sajili wanachama na maduka offline'],
            ['mode_admin','','Admin (Msimamizi)','Dhibiti mfumo mzima na mapato']
        ]],
        ['SOKOPAY & FINANCE', false, [
            ['sokopay','','SokoPay (Escrow & Trust)','Malipo salama na mikataba ya escrow'],
            ['wallet','','SokoPay Wallet','Salio lako na njia za malipo'],
            ['token','','Token Center','Tokens za mizigo na uhakiki'],
            ['orders','','My Orders','Oda na safari zako (ufuatiliaji)']
        ]],
        ['MAWASILIANO', false, [
            ['inbox','','Inbox (Chat)','Meseji zako na wauzaji/wateja'],
            ['notifications','','Taarifa','Notifications zako zote'],
            ['saved','','Saved Items','Vitu ulivyovipenda']
        ]]
    ];
    const account = window.sokohaiAccountMenuItems.map(sec => [sec.section, true, sec.items]);

    const secHtml = function(title, collapsed, items, accountItem) {
        const body = items.map(function(it) {
            const key = it[0], ico = it[1], label = it[2], sub = it[3];
            if (accountItem) {
                return `<button class="skh-menu-item" onclick="window.openSokoHaiAccountSetting('${key}')"><span class="ico">${ico}</span><span class="txt"><b>${label}</b><small>${sub}</small></span><span class="chev">›</span></button>`;
            }
            return `<button class="skh-menu-item" onclick="window.skhSidebarGo('${key}')"><span class="ico">${ico}</span><span class="txt"><b>${label}</b><small>${sub}</small></span><span class="chev">›</span></button>`;
        }).join('');
        return `<div class="skh-menu-sec"><div class="skh-menu-sec-h ${collapsed ? '' : 'open'}" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('skh-sec-hidden');"><span>${title}</span><span class="skh-sec-chev">▾</span></div><div class="skh-menu-sec-body ${collapsed ? 'skh-sec-hidden' : ''}">${body}</div></div>`;
    };

    modal.innerHTML = `<div class="skh-menu-drawer"><div class="skh-menu-head"><div class="skh-menu-top"><b><span class="skh-ico" data-ico="menu"></span> SOKOHAI</b><button class="skh-menu-close" onclick="window.closeModals()" aria-label="Funga"><span class="skh-ico" data-ico="x"></span></button></div><div class="skh-user-card"><img src="${skh.skhEscape(photo)}" onerror="this.style.display='none'"><div><b id="sidebarUserName">${skh.skhEscape(name)}</b><small id="sidebarUserPic">${skh.skhEscape(email)}</small><div style="display:flex; gap:10px; margin-top:6px; font-size:12.5px; font-weight:900;"><span style="color:var(--gold);">WALLET: <b id="sidebarWallet">TZS 0</b></span><span style="color:#00e5ff;">TOKENS: <b id="sidebarTokens">0</b></span></div></div></div></div><div class="skh-menu-scroll">${quick.map(function(s){ return secHtml(s[0], s[1], s[2], false); }).join('')}<div class="skh-menu-divider"></div>${account.map(function(s){ return secHtml(s[0], s[1], s[2], true); }).join('')}<button class="skh-menu-item skh-logout" onclick="window.openSokoHaiAccountSetting('logout')"><span class="ico"></span><span class="txt"><b>Logout</b><small>Logout, logout all devices, switch account</small></span><span class="chev">›</span></button></div></div>`;

    // Jasasisha salio/tokens kwenye kadi ya mtumiaji (kama data ipo)
    const wEl = document.getElementById('sidebarWallet');
    const tEl = document.getElementById('sidebarTokens');
    if (wEl && skh.currentUserData && typeof skh.currentUserData.walletBalance !== 'undefined') wEl.innerText = "TZS " + (skh.currentUserData.walletBalance || 0).toLocaleString();
    if (tEl && skh.currentUserData && typeof skh.currentUserData.tokens !== 'undefined') tEl.innerText = (skh.currentUserData.tokens || 0).toLocaleString();
};

// [SIDEBAR FIX] Kitufe kimoja kinachofungua menu na kupeleka mtumiaji sehemu husika
// — inaondoa kurudia/rudufu ya handlers kwenye kila onclick.
window.skhSidebarGo = function(key) {
    try { if (typeof window.closeModals === 'function') window.closeModals(); } catch(e) {}

    const feedGo = function(col) {
        if (skh.currentMode !== 'buyer' && typeof window.switchMode === 'function') {
            try { window.switchMode('buyer'); } catch(e) {}
        }
        if (typeof skh.loadMainFeed === 'function') skh.loadMainFeed(col);
    };
    const modeGo = function(m) {
        if (typeof window.switchMode === 'function') window.switchMode(m);
    };

    const map = {
        feed_all:      function(){ feedGo('all'); },
        feed_products: function(){ feedGo('products'); },
        feed_services: function(){ feedGo('services'); },
        feed_drivers:  function(){ feedGo('drivers'); },
        mode_buyer:    function(){ modeGo('buyer'); },
        mode_seller:   function(){ modeGo('seller'); },
        mode_provider: function(){ modeGo('provider'); },
        mode_driver:   function(){ modeGo('driver'); },
        mode_agent:    function(){ modeGo('agent'); },
        mode_admin:    function(){ modeGo('admin'); },
        sokopay:        function(){ if (typeof window.openSokoPay === 'function') window.openSokoPay(); },
        wallet:        function(){ if (typeof window.openUserPaymentModal === 'function') window.openUserPaymentModal(); },
        token:         function(){ if (typeof window.openLogisticsTokenModal === 'function') window.openLogisticsTokenModal(); },
        orders:        function(){ if (typeof window.openBuyerOrdersModal === 'function') window.openBuyerOrdersModal(); },
        inbox:         function(){ if (typeof window.openChatList === 'function') window.openChatList(); },
        notifications: function(){ if (typeof window.openNotifications === 'function') window.openNotifications(); },
        saved:         function(){ if (typeof window.skhOpenMySokoHai === 'function') window.skhOpenMySokoHai('saved'); else if (typeof window.openSavedItems === 'function') window.openSavedItems(); }
    };
    const fn = map[key];
    if (typeof fn === 'function') fn();
};

window.openSidebarMenu = function(){
    if(!skh.currentUser) { if(typeof window.openAuthModal==='function') window.openAuthModal(); return; }
    window.closeModals && window.closeModals();
    window.renderSokoHaiAccountMenu();
};

window.ensureSokoHaiAccountSettingModal = function(){
    let m=document.getElementById('sokohaiAccountSettingModal');
    if(m) return m;
    m=document.createElement('div'); m.id='sokohaiAccountSettingModal'; m.className='overlay-menu'; m.style.cssText='z-index:100006;display:none;background:rgba(15,23,42,.55);';
    document.body.appendChild(m); return m;
};

window.openSokoHaiAccountSetting = function(key){
    if(key==='logout') return window.doLogout && window.doLogout();
    if(key==='profile' && typeof window.openProfile==='function') { window.openProfile(); return; }
    if(key==='notifications' && typeof window.openNotifications==='function') { window.openNotifications(); return; }
    if(key==='payment_methods' && typeof window.openUserPaymentModal==='function') { window.openUserPaymentModal(); return; }
    const m=window.ensureSokoHaiAccountSettingModal();
    const all=window.sokohaiAccountMenuItems.flatMap(s=>s.items);
    const item=all.find(x=>x[0]===key) || [key,'','Settings','SokoHai settings'];
    const [_,ico,title,sub]=item;
    m.innerHTML = `<div class="skh-settings-modal-card"><div class="skh-settings-head"><div><b>${ico} ${title}</b><br><small>${sub}</small></div><button class="skh-menu-close" onclick="document.getElementById('sokohaiAccountSettingModal').style.display='none'; window.renderSokoHaiAccountMenu();" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="skh-settings-body">${window.sokohaiAccountSettingContent(key,title)}</div></div>`;
    m.style.display='flex';
};

window.sokohaiAccountSettingContent = function(key,title){
    const row=(label,control='')=>`<div class="skh-setting-row"><span>${label}</span>${control||'<span style="color:#94a3b8;font-weight:800;">›</span>'}</div>`;
    const toggle=(checked=false)=>`<input type="checkbox" ${checked?'checked':''}>`;
    const map={
        verification:[row('Identity verification status','<b style="color:#f59e0b;">Pending</b>'),row('Company verification'),row('Government verification'),'<button class="skh-action-btn">Start / Continue Verification</button>'],
        security:[row('Change password'),row('PIN / Security code'),row('Biometric login',toggle(false)),row('Two-Factor Authentication',toggle(false)),row('Recovery options'),'<button class="skh-action-btn">Save Security Settings</button>'],
        privacy:[row('Profile visibility','<b>Friends/Verified</b>'),row('Location visibility'),row('Media permissions'),row('Data sharing',toggle(false)),row('Activity visibility'),'<button class="skh-action-btn">Save Privacy</button>'],
        permissions:[row('Camera permission'),row('Microphone permission'),row('GPS / Location permission'),row('Notifications permission'),row('Storage permission'),row('Bluetooth permission'),'<button class="skh-action-btn" onclick="alert(\'Ruhusa za OS hubadilishwa kwenye Settings za simu/browser.\')">Check Permissions</button>'],
        messages:[row('Read receipts',toggle(true)),row('Auto-download media',toggle(false)),row('Archived chats'),row('Blocked users'),'<button class="skh-action-btn">Save Message Settings</button>'],
        language:[row('Language','<b>Swahili</b>'),row('Country','<b>Tanzania</b>'),row('Currency','<b>TZS</b>'),row('Time zone','<b>Africa/Dar_es_Salaam</b>'),row('Date format','<b>DD/MM/YYYY</b>')],
        appearance:[row('Theme','<b>System</b>'),row('Dark mode',toggle(false)),row('Font size','<b>Medium</b>'),row('Icon size','<b>Normal</b>'),'<button class="skh-action-btn">Apply Appearance</button>'],
        accessibility:[row('High contrast',toggle(false)),row('Large text',toggle(false)),row('Screen reader support',toggle(true)),row('Voice assistance',toggle(false))],
        connected_devices:[row('This device','<b style="color:#10b981;">Active</b>'),row('Logged-in phones'),row('Logged-in computers'),'<button class="skh-action-btn" style="background:#e11d48;">Logout Unknown Devices</button>'],
        downloads:[row('Offline downloads'),row('Saved receipts'),row('Cached maps'),'<button class="skh-action-btn">Manage Downloads</button>'],
        backup:[row('Cloud backup',toggle(true)),row('Auto sync',toggle(true)),row('Restore data'),'<button class="skh-action-btn">Backup Now</button>'],
        login_sessions:[row('Active sessions'),row('Login history'),row('Trusted devices'),'<button class="skh-action-btn" style="background:#e11d48;">Logout Other Devices</button>'],
        data_storage:[row('Cache used','<b>Calculating...</b>'),row('Downloads'),row('Data usage'),'<button class="skh-action-btn">Clear Cache</button>'],
        digital_identity:[row('SokoHai ID','<b>Auto-generated</b>'),row('QR Code'),row('Digital certificate'),row('Verification badge')],
        ai_settings:[row('AI language','<b>Swahili</b>'),row('AI voice'),row('Personalization',toggle(true)),row('AI permissions')],
        feedback:['<div class="skh-setting-card"><b>Toa Maoni</b><p>Tueleze unachotaka kuboresha SokoHai.</p><textarea style="width:100%;height:90px;border:1px solid #cbd5e1;border-radius:12px;padding:10px;margin-top:10px;" placeholder="Andika maoni..."></textarea><button class="skh-action-btn">Submit Feedback</button></div>'],
        help:['<div class="skh-setting-card"><b>Help Center</b><p>FAQs, user guide, documentation, na maelekezo ya modules zote za SokoHai.</p><button class="skh-action-btn">Open Help Center</button></div>'],
        tutorials:['<div class="skh-setting-card"><b>Tutorials</b><p>Jifunze kutumia Marketplace, SokoPay, Services na Business OS.</p><button class="skh-action-btn">View Tutorials</button></div>'],
        contact_support:['<div class="skh-setting-card"><b>Contact Support</b><p>Live chat, email, simu, ticket system.</p><button class="skh-action-btn">Create Support Ticket</button></div>'],
        report_problem:['<div class="skh-setting-card"><b>Report a Problem</b><p>Tuma bug, screenshot au log.</p><input type="file" style="margin:10px 0;"><textarea style="width:100%;height:80px;border:1px solid #cbd5e1;border-radius:12px;padding:10px;" placeholder="Eleza tatizo..."></textarea><button class="skh-action-btn">Send Report</button></div>'],
        rate:['<div class="skh-setting-card"><b>Rate SokoHai</b><p>Tupe rating yako.</p><div style="font-size:28px;color:#f59e0b;"></div><button class="skh-action-btn">Submit Rating</button></div>'],
        terms:['<div class="skh-setting-card"><b>Terms of Service</b><p>Sheria za matumizi ya SokoHai zitaonekana hapa.</p></div>'],
        privacy_policy:['<div class="skh-setting-card"><b>Privacy Policy</b><p>Sera ya faragha, data usage, media permissions na user control.</p></div>'],
        about:[row('Version','<b>Ultimate Pro</b>'),row('Build','<b>2026</b>'),row('Licenses'),row('Updates')]
    };
    const content=map[key] || [`<div class="skh-setting-card"><b>${title}</b><p>Sehemu hii ni ya account/system settings. Modules za biashara zipo kwenye navigation kuu.</p></div>`];
    return Array.isArray(content) ? content.join('') : content;
};

(function injectPrintingProCSS(){
    const css = `
    #printingServiceModal { z-index:100004 !important; }
    .prt-pro-card { background:white; width:96%; max-width:760px; max-height:92vh; border-radius:24px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 70px rgba(15,23,42,.40); }
    .prt-pro-head { background:#EAF8F2; color:#18352D; padding:16px; display:flex; justify-content:space-between; gap:12px; align-items:center; }
    .prt-pro-head b { font-size:17px; }
    .prt-pro-head small { color:#cbd5e1; font-size:13px; }
    .prt-pro-body { padding:14px; background:#f8fafc; overflow-y:auto; }
    .prt-grid { display:grid; grid-template-columns:1.2fr .8fr; gap:12px; }
    .prt-section { background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:14px; margin-bottom:12px; box-shadow:0 4px 14px rgba(15,23,42,.04); }
    .prt-section-title { font-size:12px; font-weight:950; color:#0f172a; margin-bottom:10px; display:flex; align-items:center; gap:7px; }
    .prt-field { margin-bottom:10px; }
    .prt-field label { display:block; font-size:12.5px; font-weight:950; color:#64748b; text-transform:uppercase; margin-bottom:5px; }
    .prt-field input,.prt-field select,.prt-field textarea { width:100%; border:1px solid #cbd5e1; border-radius:12px; padding:11px; font-size:13px; outline:none; box-sizing:border-box; background:#fff; }
    .prt-field textarea { min-height:74px; resize:vertical; }
    .prt-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .prt-row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
    .prt-summary { background:linear-gradient(135deg,#fff,#eff6ff); border:1px solid #bfdbfe; border-radius:18px; padding:14px; position:sticky; top:0; }
    .prt-total { text-align:center; padding:12px; background:#F8FBFA; color:#18352D; border:1px solid #E5ECEC; border-radius:16px; margin-bottom:10px; }
    .prt-total small { display:block; color:#cbd5e1; font-size:12.5px; font-weight:900; text-transform:uppercase; }
    .prt-total b { display:block; font-size:24px; margin-top:4px; }
    .prt-line { display:flex; justify-content:space-between; gap:10px; border-bottom:1px solid #e2e8f0; padding:8px 0; font-size:12px; color:#334155; }
    .prt-line:last-child { border-bottom:none; }
    .prt-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
    .prt-btn { border:none; border-radius:12px; padding:12px; min-height:42px; font-size:12px; font-weight:950; cursor:pointer; }
    .prt-btn-primary { background:#18A982; color:white; }
    .prt-btn-dark { background:#F8FBFA; color:#18352D; border:1px solid #E5ECEC; }
    .prt-btn-light { background:#e2e8f0; color:#334155; }
    .prt-btn-green { background:#10b981; color:white; }
    .prt-queue-item { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:10px; margin-bottom:8px; font-size:12px; }
    .prt-badge { display:inline-block; padding:3px 8px; border-radius:999px; font-size:12px; font-weight:950; background:#eef2ff; color:#3730a3; }
    @media(max-width:780px){ .prt-grid{grid-template-columns:1fr;} .prt-summary{position:relative;} }
    @media(max-width:520px){ .prt-row-2,.prt-row-3{grid-template-columns:1fr;} .prt-pro-card{width:98%; max-height:94vh;} .prt-actions{grid-template-columns:1fr;} } `;
    const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

window.printingRatesPro = {
    photocopy: 100,
    printing_bw: 200,
    printing_color: 500,
    scan: 300,
    lamination: 1000,
    binding: 1500,
    typing: 1000,
    passport_photo: 3000
};

window.renderPrintingModalPro = function(){
    const modal=document.getElementById('printingServiceModal'); if(!modal) return;
    modal.innerHTML = `<div class="prt-pro-card"> <div class="prt-pro-head"><div><b> SokoHai Printing Center</b><br><small>Print • Copy • Scan • Lamination • Binding • Queue • Receipt</small></div><button class="prt-btn prt-btn-light" onclick="window.closeModals()" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div> <div class="prt-pro-body"> <div class="prt-grid"> <div> <div class="prt-section"><div class="prt-section-title"> Customer & Document</div> <div class="prt-row-2"><div class="prt-field"><label>Customer / Office / School *</label><input id="prCustName" placeholder="Mfano: Shule ya Sekondari Mbezi"></div><div class="prt-field"><label>Phone / WhatsApp</label><input id="prCustPhone" placeholder="07XXXXXXXX"></div></div> <div class="prt-field"><label>Upload Document / Image (optional)</label><input type="file" id="prFileInput" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"></div> <div class="prt-field"><label>Job Notes</label><textarea id="prNotes" placeholder="Mfano: Print kurasa 1-10 tu, iwe stapled, binding blue cover..."></textarea></div> </div> <div class="prt-section"><div class="prt-section-title"> Job Details</div> <div class="prt-row-2"><div class="prt-field"><label>Aina ya Huduma *</label><select id="prJobType" onchange="window.calculatePrintingCost()"><option value="photocopy"> Photocopy</option><option value="printing_bw"> Printing B/W</option><option value="printing_color"> Printing Color</option><option value="scan"> Scan Document</option><option value="lamination"> Lamination</option><option value="binding"> Binding</option><option value="typing">⌨ Typing / Editing</option><option value="passport_photo"> Passport Photo</option></select></div><div class="prt-field"><label>Paper Size</label><select id="prPaperSize" onchange="window.calculatePrintingCost()"><option value="A4">A4</option><option value="A3">A3 (+80%)</option><option value="ID">ID / Small</option></select></div></div> <div class="prt-row-3"><div class="prt-field"><label>Pages / Pcs *</label><input type="number" id="prPages" value="10" min="1" oninput="window.calculatePrintingCost()"></div><div class="prt-field"><label>Copies *</label><input type="number" id="prCopies" value="1" min="1" oninput="window.calculatePrintingCost()"></div><div class="prt-field"><label>Sides</label><select id="prSides" onchange="window.calculatePrintingCost()"><option value="single">Single Side</option><option value="double">Double Side</option></select></div></div> <div class="prt-row-3"><div class="prt-field"><label>Finishing</label><select id="prFinishing" onchange="window.calculatePrintingCost()"><option value="none">None</option><option value="staple">Staple (Free)</option><option value="binding">Binding</option><option value="lamination">Lamination</option></select></div><div class="prt-field"><label>Urgency</label><select id="prUrgency" onchange="window.calculatePrintingCost()"><option value="normal">Normal</option><option value="urgent">Urgent (+20%)</option></select></div><div class="prt-field"><label>Delivery</label><select id="prDelivery" onchange="window.calculatePrintingCost()"><option value="pickup">Pickup</option><option value="delivery">Delivery (+2,000)</option></select></div></div> </div> <div class="prt-section"><div class="prt-section-title"> Payment</div> <div class="prt-row-3"><div class="prt-field"><label>Status</label><select id="prPaymentStatus"><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="deposit">Deposit</option></select></div><div class="prt-field"><label>Deposit (TSh)</label><input type="number" id="prDeposit" value="0"></div><div class="prt-field"><label>Due Time</label><input type="datetime-local" id="prDueTime"></div></div> </div> <div class="prt-section"><div class="prt-section-title"> Recent Printing Queue</div><div id="printingQueueList"><p style="font-size:12px;color:#64748b;text-align:center;">Inapakia foleni...</p></div></div> </div> <div><div class="prt-summary"><div class="prt-total"><small>Total Cost</small><b id="prTotalCostDisplay">TSh 0</b></div><div class="prt-line"><span>Unit rate</span><b id="prUnitRate">TSh 0</b></div><div class="prt-line"><span>Sheets used</span><b id="prSheetsUsed">0</b></div><div class="prt-line"><span>Base subtotal</span><b id="prBaseSubtotal">TSh 0</b></div><div class="prt-line"><span>Finishing</span><b id="prFinishCost">TSh 0</b></div><div class="prt-line"><span>Urgent/Delivery</span><b id="prExtraCost">TSh 0</b></div><div class="prt-line"><span>Balance</span><b id="prBalanceDisplay">TSh 0</b></div><div class="prt-actions"><button class="prt-btn prt-btn-primary" onclick="window.savePrintingJob()"> Save Job</button><button class="prt-btn prt-btn-green" onclick="window.printPrintingReceipt()"> Receipt</button><button class="prt-btn prt-btn-dark" onclick="window.loadPrintingQueue()"> Queue</button><button class="prt-btn prt-btn-light" onclick="window.closeModals()">Funga</button></div></div></div> </div> </div> </div>`;
    window.calculatePrintingCost();
    window.loadPrintingQueue();
};

window.calculatePrintingCost = function(){
    const val = id => document.getElementById(id)?.value;
    const jobType=val('prJobType') || 'photocopy';
    const pages=Math.max(1, parseInt(val('prPages')||'1'));
    const copies=Math.max(1, parseInt(val('prCopies')||'1'));
    const paperSize=val('prPaperSize') || 'A4';
    const sides=val('prSides') || 'single';
    const finishing=val('prFinishing') || 'none';
    const urgency=val('prUrgency') || 'normal';
    const delivery=val('prDelivery') || 'pickup';
    const deposit=parseFloat(val('prDeposit')||'0') || 0;
    let rate=window.printingRatesPro[jobType] || 100;
    if(paperSize==='A3') rate=Math.round(rate*1.8);
    const chargeUnits = (jobType==='binding' || jobType==='passport_photo') ? copies : pages*copies;
    const sheetsUsed = sides==='double' ? Math.ceil(pages/2)*copies : pages*copies;
    let base=rate*chargeUnits;
    let finishCost=0;
    if(finishing==='binding') finishCost += 1500*copies;
    if(finishing==='lamination') finishCost += 1000*pages*copies;
    let extra=0;
    if(urgency==='urgent') extra += Math.round((base+finishCost)*0.2);
    if(delivery==='delivery') extra += 2000;
    const total=base+finishCost+extra;
    const balance=Math.max(0,total-deposit);
    const set=(id,txt)=>{ const el=document.getElementById(id); if(el) el.innerText=txt; };
    set('prTotalCostDisplay', `TSh ${total.toLocaleString()}`); set('prUnitRate', `TSh ${rate.toLocaleString()}`); set('prSheetsUsed', sheetsUsed.toLocaleString()); set('prBaseSubtotal', `TSh ${base.toLocaleString()}`); set('prFinishCost', `TSh ${finishCost.toLocaleString()}`); set('prExtraCost', `TSh ${extra.toLocaleString()}`); set('prBalanceDisplay', `TSh ${balance.toLocaleString()}`);
    window.activePrintingCalc={ jobType,pages,copies,paperSize,sides,finishing,urgency,delivery,rate,sheetsUsed,base,finishCost,extra,total,balance,deposit };
    window.activePrintingTotalCost=total;
    return window.activePrintingCalc;
};

document.addEventListener('input', e => { if(e.target && ['prDeposit'].includes(e.target.id)) window.calculatePrintingCost(); });

window.savePrintingJob = async function(){
    if(!skh.currentUser) return alert('Ingia kwanza.');
    const custName=document.getElementById('prCustName')?.value?.trim();
    if(!custName) return alert(' Jaza jina la mteja/shule/ofisi.');
    const calc=window.calculatePrintingCost();
    const ownerUid=skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
    const btn=document.querySelector('.prt-btn-primary'); if(btn){ btn.disabled=true; btn.innerText='Saving...'; }
    try{
        const fileMeta=await skh.uploadPrintingFileIfAny();
        const jobCode='PRT-'+Math.floor(1000+Math.random()*9000);
        const payload={ shopOwnerId:ownerUid, userId:skh.currentUser.uid, jobCode, customerName:custName, customerPhone:document.getElementById('prCustPhone')?.value || '', notes:document.getElementById('prNotes')?.value || '', paymentStatus:document.getElementById('prPaymentStatus')?.value || 'paid', dueTime:document.getElementById('prDueTime')?.value || '', file:fileMeta, ...calc, status:'queued', createdAt:new Date().toISOString() };
        await skh.addDoc(skh.collection(skh.db,'printing_jobs'), payload);
        await skh.addDoc(skh.collection(skh.db,'shop_ledger'), { shopOwnerId:ownerUid, type: calc.balance>0 ? 'receivable' : 'income_offline', title:`Printing Job ${jobCode}: ${calc.jobType} - ${calc.pages} pages x ${calc.copies}`, amount:calc.total, paidAmount:calc.total-calc.balance, balance:calc.balance, profit:Math.round(calc.total*0.75), date:new Date().toISOString(), ref:jobCode });
        await window.reducePrintingPaperStock?.(ownerUid, calc.sheetsUsed);
        alert(` Kazi imehifadhiwa: ${jobCode}\nJumla: TSh ${calc.total.toLocaleString()}\nBalance: TSh ${calc.balance.toLocaleString()}`);
        window.loadPrintingQueue();
    }catch(e){ alert('Printing save failed: '+e.message); }
    finally{ if(btn){ btn.disabled=false; btn.innerText=' Save Job'; } }
};

window.reducePrintingPaperStock = async function(ownerUid, sheetsUsed){
    try{
        const qInv=skh.query(skh.collection(skh.db,'products'), skh.where('userId','==',ownerUid));
        const snap=await skh.getDocs(qInv);
        for(const d of snap.docs){ const p=d.data(); const name=String(p.name||p.title||'').toLowerCase(); if(name.includes('karatasi')||name.includes('ream')||name.includes('paper')){ await skh.updateDoc(skh.doc(skh.db,'products',d.id), { stock: skh.increment(-Math.max(1,sheetsUsed)) }); return true; } }
    }catch(e){ console.log('paper stock reduce skipped', e); }
    return false;
};

window.loadPrintingQueue = async function(){
    const box=document.getElementById('printingQueueList'); if(!box || !skh.currentUser) return;
    const ownerUid=skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
    try{ const qJobs=skh.query(skh.collection(skh.db,'printing_jobs'), skh.where('shopOwnerId','==',ownerUid), skh.orderBy('createdAt','desc'), skh.limit(8)); const snap=await skh.getDocs(qJobs); if(snap.empty){ box.innerHTML='<p style="font-size:12px;color:#64748b;text-align:center;">Hakuna kazi kwenye foleni.</p>'; return;} box.innerHTML=''; snap.forEach(d=>{ const j=d.data(); box.innerHTML += `<div class="prt-queue-item"><div style="display:flex;justify-content:space-between;gap:8px;"><b>${j.jobCode}</b><span class="prt-badge">${j.status}</span></div><div>${skh.skhEscape(j.customerName)} • ${j.jobType}</div><small>${j.pages} pages x ${j.copies} • TSh ${(j.total||0).toLocaleString()}</small></div>`; }); }catch(e){ box.innerHTML='<p style="font-size:12px;color:#e11d48;">Queue imeshindikana: '+e.message+'</p>'; }
};

window.printPrintingReceipt = function(){
    const calc=window.calculatePrintingCost();
    const cust=document.getElementById('prCustName')?.value || 'Customer';
    const html=`PRINTING RECEIPT\nCustomer: ${cust}\nService: ${calc.jobType}\nPages: ${calc.pages}\nCopies: ${calc.copies}\nSheets: ${calc.sheetsUsed}\nTotal: TSh ${calc.total.toLocaleString()}\nBalance: TSh ${calc.balance.toLocaleString()}`;
    alert(html);
};

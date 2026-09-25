/* ==== js/app/13-community.js ==== */
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

window.nextRegStep = function(step) {
    document.querySelectorAll('.reg-step').forEach(el => el.classList.remove('active'));
    document.getElementById('regStep' + step).classList.add('active');
    document.getElementById('regStepTitle').innerText = T('ag_step', 'STEP {n}', { n: step + '/5' });
};

window.openProfile = function() {
    closeModals();
    alert(T('ag_your_profile', 'YOUR PROFILE') + ":\n" + T('ag_name', 'Name') + ": " + (skh.currentUserData?.fullName || T('ag_user', 'User')) + "\nEmail: " + skh.currentUser?.email);
};

window.openCart = function() {
    if(!skh.requireAuth()) return;
    const cm = document.getElementById('cartModal');
    if(cm) {
        closeModals();
        cm.style.display = 'flex';
        // Hapa unaweza kuongeza logic ya kuonyesha bidhaa za cart
    }
};

window.moveStep = function(n) {
    document.querySelectorAll('.setup-step-box').forEach(box => {
        box.classList.remove('active');
        box.style.display = 'none';
    });
    const target = document.getElementById('setupStep' + n);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
        const titles = ["", T('ag_personal', 'PERSONAL INFO'), T('ag_location', 'WHERE YOU LIVE'), T('ag_health', 'YOUR HEALTH'), T('ag_relatives', 'RELATIVES NUMBERS'), T('ag_pin', 'SECURITY PIN'), T('ag_ready', 'READY')];
        document.getElementById('regStepTitle').innerText = T('ag_step', 'STEP {n}', { n: n + '/6' }) + ': ' + titles[n];
    }
};











window.togglePlusMenu = skh.togglePlusMenu;

// [FIX 2026-09] Kulikuwa na nakala ya PILI ya loadMainFeed hapa ambayo ilikuwa
// inapakia Home kwa limit(20/10/10) bila orderBy — ikisababisha bidhaa mpya
// kupotea na vichujio vya tab kutofanya kazi. Sasa tuna tafsiri MOJA tu:
// skh.loadMainFeed (00-bootstrap.js). Vifungo vya "Onyesha Vitu Vyote" vinaendelea
// kufanya kazi kwa sababu vinatumia jina la kimataifa `loadMainFeed`.
window.loadMainFeed = skh.loadMainFeed;

window.loadAgentDashboard = async function() {
    const container = document.getElementById('richDashboardContainer');
    if(!container) return;

    // [FIX 2026-09] Kinga ya mbio (race guard): usichore dashboard ya wakala
    // ikiwa mtumiaji ameondoka kwenye agent mode wakati data bado inapakia.
    const expectedMode = skh.currentMode;

    container.innerHTML = `<div style="text-align:center; padding:50px;"><span style="font-size:24px; display:inline-block; animation:spin 1s linear infinite;"></span><p>${T('ag_loading_profile', 'Loading your profile and member list...')}</p></div>`;

if (!skh.currentUser) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:#64748b;"><p>${T('ag_wait_signin', 'Please wait or sign in first...')}</p></div>`;
        return;
    }
    try {
        const agentQ = skh.query(skh.collection(skh.db, "agents"), skh.where("userId", "==", skh.currentUser.uid));
        const agentSnap = await skh.getDocs(agentQ);

        // Usiendelee kuchora kama mtumiaji amebadili mode wakati data inapakia.
        if (skh.currentMode !== expectedMode) return;

        if (agentSnap.empty) {
            // Kama sio wakala au hajalipia, onyesha form ya kujiunga
            container.innerHTML = `
                <div style="max-width: 450px; margin: 0 auto; background: white; padding: 25px; border-radius: 20px; border: 1.5px solid #cbd5e1; text-align: center;"> <div style="font-size: 50px;"></div> <h3 style="color:var(--primary-dark); margin-top:10px;">${T('ag_agreement', 'SokoHai Agency Agreement')}</h3> <p style="font-size:13px; color:#64748b; margin-bottom:20px; line-height:1.5;">${T('ag_join_pitch', 'Join as an agent, register offline members and earn 60% of each fee.')}</p> <div style="background:#fffbeb; border:1px solid var(--gold); padding:15px; border-radius:12px; margin-bottom:20px; text-align:left; font-size:12px;"> <b style="color:var(--primary-dark); display:block; margin-bottom:5px;">${T('ag_fee_label', 'Agency Registration Fee: TSh 3,100')}</b> <span>${T('ag_fee_note', 'A one-time fee to create your Agent Code.')}</span> </div> <div style="text-align:left;"> <label style="font-size:13px; font-weight:bold; color:gray;">${T('ag_full_name', 'FULL NAME *')}</label> <input type="text" id="dashAgentName" value="${skh.skhEscape(skh.currentUser.displayName || '')}" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:12px;"> <label style="font-size:13px; font-weight:bold; color:gray;">${T('ag_pay_phone', 'PAYMENT PHONE NUMBER (MPESA) *')}</label> <input type="tel" id="dashAgentPhone" value="${skh.currentUserData?.phone || ''}" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:12px;"> <label style="font-size:13px; font-weight:bold; color:gray;">${T('ag_region', 'REGION *')}</label> <select id="dashAgentRegion" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; margin-bottom:20px;"> <option value="Dar es Salaam">Dar es Salaam</option> <option value="Arusha">Arusha</option> <option value="Mwanza">Mwanza</option> <option value="Mbeya">Mbeya</option> <option value="Dodoma">Dodoma</option> </select> </div> <button id="btnDashAgent" onclick="window.submitAgentFromDash()" style="width:100%; padding:16px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">${T('ag_pay_submit', 'PAY AND SUBMIT')}</button> </div> `;
            return;
        }

        // [FIX 2026-09] Chagua document bora ya wakala (approved > pending > rejected)
        // — hii inaepuka kukwama kwenye "pending" ya zamani ikiwa kuna ombi jipya.
        let agentDoc = agentSnap.docs[0];
        const rank = { approved: 3, pending: 2, rejected: 1 };
        agentSnap.docs.forEach(d => {
            const s = (d.data() || {}).status;
            if ((rank[s] || 0) > (rank[(agentDoc.data() || {}).status] || 0)) agentDoc = d;
        });
        const agentData = agentDoc.data() || {};
        const agentDocId = agentDoc.id;
        const status = agentData.status;

        if (status === 'pending') {
            const paidNow = agentData.paymentStatus === 'paid' || agentData.isPaid === true;
            const payNowBtn = paidNow ? '' : `
                <button onclick="window.skhAgentPayPendingFee('${agentDocId}')" style="width:100%; padding:14px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:12px; font-weight:900; font-size:13px; cursor:pointer; margin-top:14px;">${T('ag_pay_now', 'PAY FEE NOW (TSh 3,100)')}</button>`;
            container.innerHTML = `
                <div style="max-width: 400px; margin: 50px auto; text-align:center; padding:30px; background:white; border-radius:20px; border:1px solid #cbd5e1;"> <div style="font-size: 50px; animation: pulse 1.5s infinite;"></div> <h3 style="color:orange; margin-top:15px;">${T('ag_under_review', 'Application Under Review')}</h3> <p style="font-size:13px; color:#64748b; line-height:1.5;">${paidNow
                        ? T('ag_paid_waiting', 'You have paid TSh 3,100. Your agency file is now being reviewed by the admin.')
                        : T('ag_not_paid', 'Your application reached the admin. The fee (TSh 3,100) is not paid yet — pay so the admin can approve you.')}</p> <b style="font-size:12px; color:gray; display:block; margin-top:10px;">${T('ag_reference', 'Reference')}: ${skh.skhEscape(agentData.paymentRef || 'N/A')}</b>
                    ${payNowBtn}
                </div> `;
            return;
        }

        if (status === 'approved') {
            // Vuta wateja wote wa offline waliopo chini ya wakala huyu
            const offlineUsersQ = skh.query(skh.collection(skh.db, "users"), skh.where("managedByAgentUid", "==", skh.currentUser.uid));
            const offlineUsersSnap = await skh.getDocs(offlineUsersQ);

            let normalClientsHtml = '';
            let businessClientsHtml = '';
            let watejaCount = 0;
            let biasharaCount = 0;

            offlineUsersSnap.forEach(docSnap => {
                const u = docSnap.data();
                const hasBusiness = u.businessId ? true : false;
                
                let clientCard = `
                    <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; text-align:left;"> <div style="display:flex; gap:12px; align-items:center;"> <img src="${skh.skhEscape(u.photoURL)}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid var(--gold);"> <div> <b style="font-size:14px; color:#0f172a;">${skh.skhEscape(u.fullName)}</b> <span style="display:block; font-size:13px; color:gray;">${T('ag_phone', 'Phone')}: ${skh.skhEscape(u.phone)} |  ${skh.skhEscape(u.region)}</span> <span style="display:block; font-size:12.5px; font-weight:bold; color:var(--primary-blue);">ID: ${skh.skhEscape(u.offlineAccountId || u.businessId)}</span> </div> </div> <div style="display:flex; flex-direction:column; gap:6px; text-align:right;"> <b style="color:green; font-size:13px;">TSh ${(u.walletBalance || 0).toLocaleString()}</b> <button onclick="window.enableOfflineManagement('${u.uid}', '${skh.skhJsEsc(u.fullName)}', '${skh.skhJsEsc(u.shopName || u.fullName)}')" style="padding:6px 12px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:8px; font-weight:900; font-size:13px; cursor:pointer;">${T('ag_manage', 'MANAGE')}</button> </div> </div> `;

                if (hasBusiness) {
                    businessClientsHtml += clientCard;
                    biasharaCount++;
                } else {
                    normalClientsHtml += clientCard;
                    watejaCount++;
                }
            });

            // Muonekano thabiti wa Dashboard
            container.innerHTML = `
                <div style="text-align: left;"> <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 25px; border-radius: 20px; margin-bottom: 25px; display:flex; justify-content:space-between; align-items:center;"> <div> <h2 style="margin:0; color: white; font-weight:900;">${T('ag_dashboard', 'SOKOHAI AGENT DASHBOARD')}</h2> <p style="margin:5px 0 0; opacity:0.9; font-size:13px;">${T('ag_bridge', 'Manage your members in the street and online.')}</p> </div> <div style="text-align:right;"> <small style="display:block; opacity:0.8; font-size:12px; font-weight:bold; letter-spacing:1px;">${T('ag_agent_code', 'AGENT CODE')}</small> <b style="font-size:24px; color:var(--gold); font-weight:900;">${agentData.agentCode}</b> </div> </div> <!-- [AGENT ASSISTED ACCESS] Kitendo kikuu cha Wakala: Msaada wa Mwanachama --> <div style="background: linear-gradient(135deg, #1268A8, #0f172a); color: white; padding: 22px; border-radius: 18px; margin-bottom: 25px; display:flex; flex-wrap:wrap; gap:14px; justify-content:space-between; align-items:center;"> <div style="min-width:200px;"> <h3 style="margin:0; font-weight:900; font-size:16px;">${T('ag_assist_title', 'HELP A SOKOHAI MEMBER')}</h3> <p style="margin:4px 0 0; opacity:0.85; font-size:12px; line-height:1.5;">${T('ag_assist_sub', 'Register a member without a phone or help them sign in.')}</p> </div> <button onclick="window.skhAssistHome()" style="padding:15px 22px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">${T('ag_open_assist', 'OPEN ASSISTED ACCESS')}</button> </div> <!-- METRICS KUU ZA WAKALA --> <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:15px; margin-bottom:25px;"> <div style="background:#f0fdf4; border: 1px solid #bbf7d0; padding:18px; border-radius:15px; text-align:center;"> <small style="color:gray; font-weight:bold;">${T('ag_wallet_comm', 'WALLET COMMISSION (INCOME)')}</small> <h3 style="margin:5px 0 0; color:green; font-size:20px; font-weight:900;">TSh ${(skh.currentUserData?.walletBalance || 0).toLocaleString()}</h3> <button onclick="window.requestWithdrawal()" style="margin-top:10px; padding:6px 12px; background:green; color:white; border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">${T('ag_withdraw', 'WITHDRAW NOW')}</button> </div> <div style="background:#eff6ff; border: 1px solid #bfdbfe; padding:18px; border-radius:15px; text-align:center;"> <small style="color:gray; font-weight:bold;">${T('ag_member_stats', 'MEMBER STATS')}</small> <h3 style="margin:5px 0 0; color:var(--primary-blue); font-size:20px; font-weight:900;">${T('ag_members_biz', '{m} Members | {b} Businesses', { m: watejaCount, b: biasharaCount })}</h3> <button onclick="window.skhAssistRegisterView()" style="margin-top:10px; padding:6px 12px; background:var(--primary-blue); color:white; border:none; border-radius:8px; font-size:13px; font-weight:900; cursor:pointer;">${T('ag_register_off', 'REGISTER OFFLINE')}</button> </div> <div style="background:#fffbeb; border: 1px solid #fde68a; padding:18px; border-radius:15px; text-align:center; display:flex; flex-direction:column; justify-content:center; align-items:center;"> <small style="color:gray; font-weight:bold; font-size:13px;">${T('ag_review_tokens', 'Review your customers shipment tokens safely')}</small> <button onclick="window.openLogisticsTokenModal()" style="margin-top:10px; width:100%; padding:8px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">${T('ag_logistics', 'LOGISTICS TOKENS')}</button> </div> </div> <!-- SEHEMU YA ORODHA YA WATEJA (MEMBERS LIST) --> <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;"> <div style="background: #f8fafc; padding:20px; border-radius:18px; border:1px solid #cbd5e1;"> <b style="font-size:14px; color:var(--primary-dark); display:block; margin-bottom:15px; border-bottom:1px solid #cbd5e1; padding-bottom:5px;">${T('ag_members_list', 'OFFLINE MEMBERS REGISTERED ({n})', { n: watejaCount })}</b> <div style="max-height: 350px; overflow-y:auto;">
                                ${normalClientsHtml || '<p style="text-align:center; color:gray; font-size:13px; padding:20px;">' + T('ag_no_members', 'No offline members yet.') + '</p>'}
                            </div> </div> <div style="background: #f8fafc; padding:20px; border-radius:18px; border:1px solid #cbd5e1;"> <b style="font-size:14px; color:var(--primary-dark); display:block; margin-bottom:15px; border-bottom:1px solid #cbd5e1; padding-bottom:5px;">${T('ag_biz_list', 'OFFLINE BUSINESSES REGISTERED ({n})', { n: biasharaCount })}</b> <div style="max-height: 350px; overflow-y:auto;">
                                ${businessClientsHtml || '<p style="text-align:center; color:gray; font-size:13px; padding:20px;">' + T('ag_no_biz', 'No offline businesses yet.') + '</p>'}
                            </div> </div> </div> </div> `;
            return;
        }

        // [FIX 2026-09] Ombi lililokataliwa — onyesha sababu badala ya kukwama kwenye "Inapakia..."
        if (status === 'rejected') {
            container.innerHTML = `
                <div style="max-width: 400px; margin: 50px auto; text-align:center; padding:30px; background:white; border-radius:20px; border:1px solid #fecaca;"> <div style="font-size: 44px; color:#ef4444;">!</div> <h3 style="color:#b91c1c; margin-top:10px;">${T('ag_rejected', 'Your Agency Application Was Rejected')}</h3> <p style="font-size:13px; color:#64748b; line-height:1.5;">${T('ag_reason', 'Reason')}: ${skh.skhEscape(agentData.rejectReason || agentData.reason || T('ag_not_stated', 'Not stated'))}</p> <p style="font-size:12px; color:#64748b;">${T('ag_resubmit_hint', 'You can submit a new application through the join form.')}</p> <button onclick="window.showForm('agentForm')" style="width:100%; padding:14px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:12px; font-weight:900; font-size:13px; cursor:pointer; margin-top:14px;">${T('ag_resubmit', 'SUBMIT NEW APPLICATION')}</button> </div> `;
            return;
        }

        // [FIX 2026-09] Hali isiyojulikana — usikwame kwenye spinner.
        container.innerHTML = `
            <div style="max-width: 400px; margin: 50px auto; text-align:center; padding:30px; background:white; border-radius:20px; border:1px solid #cbd5e1;"> <h3 style="color:var(--primary-dark); margin-top:10px;">${T('ag_unknown', 'Unknown Agency Status')}</h3> <p style="font-size:13px; color:#64748b; line-height:1.5;">${T('ag_unknown_hint', 'Your application status ({s}) is not recognized. Contact the admin for help.', { s: skh.skhEscape(status || 'N/A') })}</p> <button onclick="window.showForm('agentForm')" style="width:100%; padding:14px; background:var(--gold); color:var(--primary-dark); border:none; border-radius:12px; font-weight:900; font-size:13px; cursor:pointer; margin-top:14px;">${T('ag_resubmit', 'SUBMIT NEW APPLICATION')}</button> </div> `;
    } catch (e) {
        console.error("Agent Dashboard Error:", e);
        container.innerHTML = `<p style="color:red; text-align:center; padding:30px;">${T('ag_net_error', 'Network error while loading the Dashboard.')} <button onclick="window.loadAgentDashboard()" style="padding:10px 15px; background:var(--primary-blue); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; margin-top:10px;">${T('ag_retry', 'TRY AGAIN')}</button></p>`;
    }
};

window.togglePaymentSetupFields = function() {
    console.log("Inabadili muonekano wa fomu ya malipo...");
    
    const typeSelect = document.getElementById('paySetupType');
    if (!typeSelect) return;
    
    const type = typeSelect.value; // Inachukua 'Mobile', 'Bank', au 'Card'

    // Sehemu ya Mitandao ya Simu
    const mobileFields = document.getElementById('setupMobileFields');
    if (mobileFields) mobileFields.style.display = (type === 'Mobile') ? 'block' : 'none';

    // Sehemu ya Benki
    const bankFields = document.getElementById('setupBankFields');
    if (bankFields) bankFields.style.display = (type === 'Bank') ? 'block' : 'none';

    // Sehemu ya Kadi (Visa/Mastercard)
    const cardFields = document.getElementById('setupCardFields');
    if (cardFields) cardFields.style.display = (type === 'Card') ? 'block' : 'none';
};

window.openUniversalTrackingMap = async function() {
    if(!skh.currentUser) { alert(T('ag_signin_first', 'Sign in first!')); return; }

    try {
        const q = skh.query(skh.collection(skh.db, "shipments"), skh.where("buyerId", "==", skh.currentUser.uid), skh.limit(1));
        const snap = await skh.getDocs(q);
        if(snap.empty) { alert(T('ag_no_shipment', 'No shipment in transit right now.')); return; }

        window.closeModals();
        document.getElementById('mapModal').style.display = 'flex';
        const shipmentId = snap.docs[0].id;
        const sData = snap.docs[0].data();

        setTimeout(() => {
            // [PERF 2026-09] Leaflet hupakuliwa kwa uvivu ramani inapofunguliwa.
            if (typeof window.skhWithLeaflet !== 'function') return;
            window.skhWithLeaflet((L) => {
            if (window.myLiveMap) { window.myLiveMap.remove(); }
            window.myLiveMap = L.map('map').setView([-6.7924, 39.2723], 7);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.myLiveMap);

            window.skhOnSnapshot('shipment-track', skh.doc(skh.db, "shipments", shipmentId), (snapshot) => {
                const d = snapshot.data();
                // Mlinzi wa LatLng
                if(d && typeof d.driverLat === 'number' && typeof d.driverLon === 'number') {
                    if (window.driverMarker) { window.myLiveMap.removeLayer(window.driverMarker); }
                    window.driverMarker = L.marker([d.driverLat, d.driverLon]).addTo(window.myLiveMap)
                        .bindPopup(`<b>${T('ag_cargo', 'Cargo')}: ${d.product.name}</b><br>${T('pf_status', 'Status')}: ${T('pf_in_transit', 'In Transit')} `).openPopup();
                    window.myLiveMap.setView([d.driverLat, d.driverLon], 13);
                    document.getElementById('gpsText').innerText = T('ag_gps_reading', 'Reading driver GPS Live');
                } else {
                    document.getElementById('gpsText').innerText = T('ag_gps_waiting', 'Waiting for driver GPS...');
                }
            });
            });
        }, 500);
    } catch (e) { alert("Error: " + e.message); }
};

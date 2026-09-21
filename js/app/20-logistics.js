/* ==== js/app/20-logistics.js ==== */
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


window.boardPassengerByOtp = async function() {
    const otp = document.getElementById('paxTicketOtpInp').value.trim();
    if(!otp) return alert(T('lg_enter_otp', "Enter the Ticket OTP first!"));

    try {
        // [CUSTODY PHASE B 2026-09] OTP ya abiria inathibitishwa na SERVER
        // (deliveryPassengerBoard). Hakuna query ya plaintext transferCode
        // wala uandishi wa moja kwa moja wa status kwenye browser tena.
        const q = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("reqCategory", "==", "Passengers"), skh.where("driverId", "==", skh.currentUser.uid));
        const snap = await skh.getDocs(q);

        let boarded = false;
        if (snap && snap.docs && snap.docs.length) {
            for (const d of snap.docs) {
                const rd = d.data();
                if (rd.status === 'in_transit') continue;
                if (typeof window.skhCustodyPassengerBoard !== 'function') break;
                const res = await window.skhCustodyPassengerBoard(d.id, otp);
                if (res.ok) { boarded = true; break; }
                // bad_otp/forbidden kwa safari moja -> endelea kujaribu safari nyingine.
            }
        }
        if (!boarded) {
            alert(T('lg_otp_wrong', "Ticket OTP is wrong or this trip is not assigned to you!"));
            return;
        }

        alert(T('lg_boarding', "Passenger confirmed boarding safely (Boarding Complete)! Trip started."));
        document.getElementById('paxTicketOtpInp').value = '';
        window.renderDriverActiveTabContent();
    } catch(e) {
        alert(T('lg_error', "Error: ") + e.message);
    }
};

window.triggerVehicleBreakdown = async function(rideId, cargoName) {
    if(!await skhConfirm(` EMERGENCY BREAKDOWN RECOVERY ENGINE:\n\nJe, chombo chako kimepata hitilafu au dharura njiani?\n\nMfumo utahifadhi mkataba na Escrow yote, lakini utarudisha safari ya "${cargoName}" sokoni ili dereva wa karibu aje kuendeleza safari ya mzigo salama.`)) return;

    try {
        const rideRef = skh.doc(skh.db, "ride_requests", rideId);
        
        // Rudisha safari sokoni na weka alama ya uokoaji
        await skh.updateDoc(rideRef, {
            status: "searching", // Mzigo unarudi kutafuta dereva mpya
            oldDriverId: skh.currentUser.uid,
            oldDriverName: skh.currentUser.displayName,
            driverId: null,      // Ondoa dereva aliyepata ajali/hitilafu
            driverName: null,
            driverPhone: null,
            driverVehicleReg: null,
            isRecoveryActive: true,
            breakdownAt: new Date().toISOString()
        });

        // Vuta taarifa za safari ili kujua mnunuzi
        const docSnap = await skh.getDoc(rideRef);
        if(docSnap.exists()) {
            const rd = docSnap.data();
            
            // 1. Mtumie Mnunuzi arifa ya dharura
            await skh.addDoc(skh.collection(skh.db, "notifications"), {
                userId: rd.customerId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'logistics.recoveryStarted',
                params: { cargo: String(cargoName || '') },
                title: " Uokoaji wa Safari Umeanzishwa (Recovery Active)",
                body: `Chombo cha dereva kimepata hitilafu njiani. Safari ya "${cargoName}" imerudishwa sokoni automatically ili dereva wa karibu aje kuendeleza safari salama bila kuvunja Escrow.`,
                createdAt: new Date().toISOString(),
                read: false
            });

            // 2. Mtumie na Muuzaji (Dukani) arifa ili ajue kinachoendelea
            if (rd.parentRideId) {
                const qOrder = skh.query(skh.collection(skh.db, "orders"), skh.where("buyerId", "==", rd.customerId), skh.where("itemId", "==", rd.parentRideId));
                const orderSnap = await skh.getDocs(qOrder);
                if (!orderSnap.empty) {
                    await skh.addDoc(skh.collection(skh.db, "notifications"), {
                        userId: orderSnap.docs[0].data().sellerId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'logistics.transportFault',
                params: { cargo: '' },
                        title: " Ujumbe: Hitilafu ya Usafiri!",
                        body: `Mzigo wa mteja wako uliopo njiani umepata hitilafu ya chombo. Usijali, mfumo unatafuta gari lingine mtaani sasa hivi.`,
                        createdAt: new Date().toISOString(),
                        read: false
                    });
                }
            }
        }

        alert(T('lg_rescue_on', "Rescue system activated! Your contract is safe and the trip has been returned to the market for quick rescue."));
        window.renderDriverActiveTabContent();
    } catch(e) {
        alert(T('lg_rescue_error', "Error starting rescue: ") + e.message);
    }
};

window.renderSellerLogisticsTab = async function() {
    const ws = document.getElementById('dashWorkspace');
    if(!ws || !skh.currentUser) return;

    ws.innerHTML = `
        <div style="text-align:left; animation: fadeIn 0.3s ease;"> <h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> MIZIGO, DISPATCH & VERIFY PICKUP</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Hapa ndipo unapomthibitisha dereva anapokuja kuchukua mzigo dukani kwako kwa kutumia Token A (PK) [1].</p> <!-- INPUT YA KULIPIA/KUHAKIKI TOKEN A (SELLER DISPATCH CONTROLS) --> <div style="background:#fffbeb; border:1.5px dashed var(--gold); padding:20px; border-radius:16px; margin-bottom:25px;"> <b style="color:var(--primary-dark); font-size:13px; display:block; margin-bottom:10px; text-transform:uppercase;"> HAKIKI TOKENS ZA MAREJESHO / DISPATCH</b> <p style="font-size:13px; color:#475569; margin-bottom:15px;">Weka Token A (Pickup Token - PK-XXXX) uliyopewa na dereva kuthibitisha kuwa chombo chake kinalingana na oda:</p> <div style="display:flex; gap:10px; margin-bottom:15px;"> <input type="text" id="sellerDispatchTokenInp" placeholder="${T('lg_token_a_ph', 'Enter Token A (e.g. PK-XXXX)...')}" style="flex:2; padding:15px; border-radius:12px; border:1px solid #cbd5e1; outline:none; text-align:center; font-weight:900; font-size:18px; text-transform:uppercase;"> <button onclick="window.verifySellerDispatchToken()" id="btnVerifySellerDispatch" style="flex:1; padding:15px; background:var(--primary-blue); color:white; border:none; border-radius:12px; font-weight:900; cursor:pointer;">${T('lg_verify', 'VERIFY')} </button> </div> <div id="sellerDispatchResult" style="display:none; background:#f0fdf4; border:1px solid #bbf7d0; padding:15px; border-radius:14px; margin-bottom:15px; text-align:left;"></div> <div id="sellerParcelConditionBox" style="display:none; margin-bottom:15px; text-align:left;"> <label style="font-size:13px; color:#475569; display:block; margin-bottom:6px;">Hali ya mzigo unapoukabidhi (Parcel Condition):</label> <select id="sellerParcelCondition" style="width:100%; padding:12px; border-radius:12px; border:1px solid #cbd5e1; font-weight:600; outline:none;"> <option value="good"> Vizuri (Good)</option> <option value="packaging_damaged">Kifungashio kimeharibika (Packaging damaged)</option> <option value="parcel_damaged">Mzigo umeharibika (Parcel damaged)</option> <option value="seal_broken">Muhuri umevunjika (Seal broken)</option> <option value="other">Nyingine (Other)</option> </select> <label style="font-size:13px; color:#475569; display:block; margin:10px 0 6px;">Maelezo ya hali ya mzigo (kama kuna tatizo):</label> <textarea id="sellerParcelNote" rows="2" placeholder="Mfano: sanduku limechubuka pembeni..." style="width:100%; padding:10px; border-radius:12px; border:1px solid #cbd5e1; outline:none; font-size:12px;"></textarea> </div> <button onclick="window.confirmSellerDispatch()" id="btnConfirmSellerDispatch" style="display:none; width:100%; padding:16px; background:var(--green); color:white; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer; text-transform:uppercase;"> THIBITISHA KUKABIDHI KWA TOKEN (OPTION A)</button> <button onclick="window.confirmSellerDispatchDirect()" id="btnConfirmSellerDispatchDirect" style="display:none; width:100%; padding:14px; margin-top:8px; background:#0f172a; color:white; border:none; border-radius:14px; font-weight:900; font-size:13px; cursor:pointer; text-transform:uppercase;"> THIBITISHA KUKABIDHI MOJA KWA MOJA (OPTION B — BILA TOKEN)</button> </div> <!-- LIST YA ODA ZINAZOSUBIRI KUCHUKULIWA --> <b style="font-size:13px; color:var(--primary-dark); display:block; margin-bottom:12px; text-transform:uppercase;"> ODA ZINAZOSUBIRI KUCHUKULIWA (PENDING DISPATCH)</b> <div id="sellerPendingDispatchList">Inapakia mizigo...</div> </div> `;

    // Load pending dispatch items from Firestore
    const shopOwnerId = skh.currentUserData?.shopOwnerUid || skh.currentUser.uid;
    const qPending = skh.query(
        skh.collection(skh.db, "ride_requests"),
        skh.where("status", "in", ["accepted", "awaiting_pickup", "pickup_pending", "seller_confirmed_handover"]),
        skh.limit(30)
    );

    // Filter and render
    window.skhOnSnapshot('agent-pending', qPending, (snap) => {
        const listDiv = document.getElementById('sellerPendingDispatchList');
        if(!listDiv) return;

        let html = '';
        let count = 0;

        snap.forEach(docSnap => {
            const rd = docSnap.data();
            // [PHASE 8 FIX] Chuja ili muuzaji aone mizigo ya duka lake pekee, si ya maduka mengine
            if (rd.sellerId && rd.sellerId !== shopOwnerId && rd.customerId !== shopOwnerId) return;
            count++;
            const cargoImg = rd.cargoImage || "https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff";
            html += `
                <div style="background:white; border:1px solid #cbd5e1; padding:15px; border-radius:16px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;"> <div style="display:flex; gap:12px; align-items:center;"> <img src="${cargoImg}" style="width:45px; height:45px; border-radius:8px; object-fit:cover; border:1px solid #eee;"> <div> <b style="font-size:14px; color:#0f172a; display:block;"> ${rd.cargoName}</b> <span style="font-size:13px; color:gray; display:block;">Mteja: ${skh.skhEscape(rd.customerName)} | Njia: ${rd.fromLocation} -> ${rd.toLocation}</span> <span style="font-size:13px; color:orange; font-weight:bold; display:block; margin-top:2px;">Dereva: ${skh.skhEscape(rd.driverName || 'N/A')} (Chombo: ${rd.vehicleType})</span> </div> </div> <div style="text-align:right;"> <span style="font-size:12.5px; background:#fffbeb; color:#d97706; padding:4px 8px; border-radius:8px; font-weight:bold; display:block; margin-bottom:5px;">${rd.status.toUpperCase()}</span> <b style="font-size:12px; color:var(--primary-blue);">Token A: ${rd.pickupTokenRef || rd.pickupToken || 'Itaundwa baada ya dereva kukubali'}</b> </div> </div> `;
        });

        listDiv.innerHTML = count === 0 
            ? `<p style="text-align:center; color:gray; font-size:12px; padding:20px; background:white; border-radius:12px; border:1px solid #e2e8f0;">Hakuna mizigo inayokusubiri uikabidhi kwa sasa.</p>` 
            : html;
    });
};

window.verifySellerDispatchToken = async function() {
    const token = document.getElementById('sellerDispatchTokenInp').value.trim().toUpperCase();
    if(!token) return alert(T('lg_enter_token_a', "Enter Token A (PK) first!"));

    const resultBox = document.getElementById('sellerDispatchResult');
    const btnVerify = document.getElementById('btnVerifySellerDispatch');
    const btnConfirm = document.getElementById('btnConfirmSellerDispatch');
    const btnConfirmDirect = document.getElementById('btnConfirmSellerDispatchDirect');

    resultBox.style.display = 'none';
    btnVerify.innerHTML = " Inatafuta...";
    btnVerify.disabled = true;

    try {
        // [CUSTODY PHASE B 2026-09] Token inahakikiwa na SERVER (deliveryTokenVerify)
        // — hakuna query ya `pickupToken == token` kwenye browser tena (token ni
        // private, inaishi kwenye delivery_tokens inayosomeka na wahusika pekee).
        let rd = null, foundId = null;
        if (typeof window.skhCustodyServerTokenVerify === 'function') {
            try {
                const v = await window.skhCustodyServerTokenVerify({ token: token, kind: 'pickup' });
                if (v && v.data && v.data.ok) { rd = v.data; foundId = v.data.rideId; }
            } catch (e) { /* server haijibu -> fallback ya demo hapa chini */ }
        }
        if (!foundId && (typeof window.skhCustodyFallbackAllowed !== 'function' || !window.skhCustodyFallbackAllowed())) {
            alert(T('lg_token_wrong', "This token is wrong or the cargo has already been released!"));
            btnVerify.innerHTML = "HAKIKI ";
            btnVerify.disabled = false;
            return;
        }
        if (!foundId) {
            // Demo fallback (server haipatikani) — utafute kama awali (legacy).
            const q = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("pickupToken", "==", token), skh.limit(1));
            const snap = await skh.getDocs(q);
            if (snap.empty) {
                alert(T('lg_token_wrong', "This token is wrong or the cargo has already been released!"));
                btnVerify.innerHTML = "HAKIKI ";
                btnVerify.disabled = false;
                return;
            }
            rd = snap.docs[0].data(); foundId = snap.docs[0].id;
        }

        const okStage = ["accepted","awaiting_pickup","pickup_pending","seller_confirmed_handover"].indexOf(rd.status) !== -1;
        if (!okStage) {
            alert(T('lg_token_wrong', "This token is wrong or the cargo has already been released!"));
            btnVerify.innerHTML = "HAKIKI ";
            btnVerify.disabled = false;
            return;
        }
        sessionStorage.setItem('active_seller_verified_ride_id', foundId);

        resultBox.innerHTML = `
            <div style="font-size:13px; color:#1e293b; line-height:1.5; text-align:left;"> <b style="color:var(--green); display:block; margin-bottom:8px; font-size:14px; text-transform:uppercase;"> Token A Imethibitishwa!</b> <span>Mzigo: <b>${skh.skhEscape(rd.cargoName || '')}</b></span><br> <span>Mteja: <b>${skh.skhEscape(rd.customerName || '')}</b></span><br> <span>Dereva: <b style="color:var(--primary-blue);">${skh.skhEscape(rd.driverName || '')}</b> (Chombo: ${skh.skhEscape(rd.vehicleType || '')})</span> </div> `;
        resultBox.style.display = 'block';
        btnVerify.style.display = 'none';
        btnConfirm.style.display = 'block';
        if (btnConfirmDirect) btnConfirmDirect.style.display = 'block';
        document.getElementById('sellerParcelConditionBox').style.display = 'block';
    } catch (e) {
        alert("Hitilafu: " + e.message);
    } finally {
        btnVerify.innerHTML = "HAKIKI ";
        btnVerify.disabled = false;
    }
};

window.confirmSellerDispatch = async function() {
    const rideId = sessionStorage.getItem('active_seller_verified_ride_id');
    if(!rideId) return;

    const btnConfirm = document.getElementById('btnConfirmSellerDispatch');
    btnConfirm.innerHTML = " Inasave...";
    btnConfirm.disabled = true;

    try {
        // [CUSTODY 2026-09] Muuzaji anathibitisha MAKABIDHIANO (pande la kwanza)
        // tu — HAIWEKI mzigo "in_transit". Dereva ndiye atakayethibitisha upokeaji
        // kwa token yake -> PICKED_UP -> ndipo custody inapohamia kwake.
        // OPTION A: kwa token.
        const token = document.getElementById('sellerDispatchTokenInp').value.trim().toUpperCase();
        const condition = (document.getElementById('sellerParcelCondition') || {}).value || 'good';
        const note = (document.getElementById('sellerParcelNote') || {}).value || '';

        if (typeof window.skhCustodyConfirmSellerHandover === 'function') {
            const res = await window.skhCustodyConfirmSellerHandover(rideId, token, condition, note);
            if (!res.ok) {
                const msgs = {
                    bad_token: " Token A si sahihi!",
                    rate_limited: " Majaribio mengi sana. Subiri kidogo kisha ujaribu tena.",
                    owner_only: " Safari hii si yako.",
                    no_transporter: " Dereva bado hajakubali safari hii.",
                    bad_stage: " Hatua ya safari hairuhusu uthibitisho wa makabidhiano.",
                    expired: " Token imeisha muda wake."
                };
                alert(msgs[res.error] || (" Makabidhiano hayajathibitishwa: " + res.error));
                return;
            }
            alert(T('lg_handover', "MAKABIDHIANO YAMETHIBITISHWA!\n\nDereva sasa atathibitisha upokeaji kwa token yake. Mzigo utakuwa chini ya ulinzi wake (Picked Up) baada ya uthibitisho wa pandembili."));
        } else {
            // [PHASE 8 FIX] Muuzaji anathibitisha makabidhiano tu (seller_confirmed_handover); dereva ndiye anayeanza safari
            const rideRef = skh.doc(skh.db, "ride_requests", rideId);
            await skh.updateDoc(rideRef, {
                status: "seller_confirmed_handover",
                sellerConfirmedAt: new Date().toISOString(),
                parcelCondition: condition,
                parcelNote: note
            });
            alert("MAKABIDHIANO YAMETHIBITISHWA!\n\nDereva sasa atathibitisha upokeaji kwa Token A ili kuanza safari.");
        }
        
        window.skhResetSellerDispatchForm();
        window.renderSellerLogisticsTab();
    } catch (e) {
        alert("Hitilafu: " + e.message);
    } finally {
        btnConfirm.innerHTML = " THIBITISHA KUKABIDHI KWA TOKEN (OPTION A)";
        btnConfirm.disabled = false;
    }
};

// OPTION B — Muuzaji anathibitisha makabidhiano MOJA KWA MOJA (bila token).
// Backend bado inathibitisha umiliki, dereva aliyekubali, hatua sahihi na kwamba
// makabidhiano hayajafanywa tayari — si kitufe cha frontend tu.
window.confirmSellerDispatchDirect = async function() {
    const rideId = sessionStorage.getItem('active_seller_verified_ride_id');
    if(!rideId) return;

    const btnConfirm = document.getElementById('btnConfirmSellerDispatchDirect');
    if(btnConfirm) { btnConfirm.innerHTML = " Inasave..."; btnConfirm.disabled = true; }

    try {
        const condition = (document.getElementById('sellerParcelCondition') || {}).value || 'good';
        const note = (document.getElementById('sellerParcelNote') || {}).value || '';

        if (typeof window.skhCustodyConfirmSellerHandoverDirect === 'function') {
            const res = await window.skhCustodyConfirmSellerHandoverDirect(rideId, condition, note);
            if (!res.ok) {
                const msgs = {
                    rate_limited: " Majaribio mengi sana. Subiri kidogo kisha ujaribu tena.",
                    owner_only: " Safari hii si yako.",
                    no_transporter: " Dereva bado hajakubali safari hii.",
                    bad_stage: " Hatua ya safari hairuhusu uthibitisho wa makabidhiano."
                };
                alert(msgs[res.error] || (" Makabidhiano hayajathibitishwa: " + res.error));
                return;
            }
            alert(" MAKABIDHIANO YAMETHIBITISHWA (OPTION B)!\n\nDereva sasa atathibitisha upokeaji. Mzigo utakuwa chini ya ulinzi wake (Picked Up) baada ya uthibitisho wa pandembili.");
        } else {
            alert(" Uthibitisho wa makabidhiano haupatikani kwa sasa.");
            return;
        }

        window.skhResetSellerDispatchForm();
        window.renderSellerLogisticsTab();
    } catch (e) {
        alert("Hitilafu: " + e.message);
    } finally {
        if(btnConfirm) { btnConfirm.innerHTML = " THIBITISHA KUKABIDHI MOJA KWA MOJA (OPTION B — BILA TOKEN)"; btnConfirm.disabled = false; }
    }
};

window.skhResetSellerDispatchForm = function() {
    const inp = document.getElementById('sellerDispatchTokenInp');
    if (inp) inp.value = '';
    const res = document.getElementById('sellerDispatchResult');
    if (res) res.style.display = 'none';
    const cond = document.getElementById('sellerParcelConditionBox');
    if (cond) cond.style.display = 'none';
    const note = document.getElementById('sellerParcelNote');
    if (note) note.value = '';
    const bv = document.getElementById('btnVerifySellerDispatch');
    if (bv) bv.style.display = 'block';
    const bc = document.getElementById('btnConfirmSellerDispatch');
    if (bc) bc.style.display = 'none';
    const bd = document.getElementById('btnConfirmSellerDispatchDirect');
    if (bd) bd.style.display = 'none';
    sessionStorage.removeItem('active_seller_verified_ride_id');
};

// [TRANSPORT FIX 2026-09] Charts za dereva sasa zinatokana na data HALISI
// (skhDriverTripStats) — hakuna namba za kudhaniwa (15/45/35/5, 60/30/10, n.k.).
window.initLogisticsHubOverviewCharts = async function() {
    // Kama hakuna canvas (mf. overview mpya haitumii charts fake), usifanye chochote.
    if (!document.getElementById('shipmentStatusDonut')) return;
    try {
        // [PERF 2026-09] Chart.js hupakuliwa kwa uvivu inapohitajika.
        if (typeof window.Chart === 'undefined' && window.skhLoadChart) {
            await window.skhLoadChart();
        }
        if (typeof window.Chart === 'undefined' || typeof window.Chart.getChart !== 'function') return;
        const stats = await window.skhDriverTripStats();
        if (!stats) return;

        const clearChart = (id) => { try { const old = Chart.getChart(id); if (old) old.destroy(); } catch (e) {} };
        const colors = { awaiting: '#d97706', transit: '#3b82f6', delivered: '#10b981', disputed: '#ef4444', cancelled: '#94a3b8' };

        // Shipment status donut — kutoka hesabu halisi.
        const donut = document.getElementById('shipmentStatusDonut');
        if (donut && stats.total > 0) {
            clearChart('shipmentStatusDonut');
            new Chart(donut, {
                type: 'doughnut',
                data: {
                    labels: ['Pending', 'In Transit', 'Delivered', 'Disputed', 'Cancelled'],
                    datasets: [{ data: [stats.awaitingPickup, stats.inTransit, stats.completedTotal, stats.disputed, stats.cancelled], backgroundColor: [colors.awaiting, colors.transit, colors.delivered, colors.disputed, colors.cancelled], borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
            });
        }

        // Revenue trend — mapato halisi ya kila siku (siku 7 za mwisho) kutoka completed rides.
        const line = document.getElementById('revenueTrendLine');
        if (line) {
            const days = [];
            const perDay = {};
            const now = new Date();
            for (let k = 6; k >= 0; k--) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k);
                const key = d.toLocaleDateString('en-CA');
                days.push(key);
                perDay[key] = 0;
            }
            (stats.rides || []).forEach(function (r) {
                if (r.status !== 'completed') return;
                const iso = r.completedAt || r.createdAt || '';
                const key = iso ? new Date(iso).toLocaleDateString('en-CA') : null;
                if (key && perDay[key] != null) perDay[key] += Number(r.finalPayout || r.cargoPrice || r.price || 0);
            });
            clearChart('revenueTrendLine');
            new Chart(line, {
                type: 'line',
                data: {
                    labels: days.map(function (k) { return new Date(k + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }); }),
                    datasets: [{ label: 'Mapato (TSh)', data: days.map(function (k) { return perDay[k]; }), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.35 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }

        // Fleet & driver donuts hazina maana tena bila data ya vyombo — tunawaacha
        // wazi (hakuna chati za kudhaniwa). Zinafutwa iwapo zilikuwepo.
        ['fleetStatusDonut', 'driverStatusDonut'].forEach(function (id) { clearChart(id); });
    } catch (e) { console.warn('[driver-charts]', e && e.message); }
};

window.setupDriverActiveJobsQuery = function() {
    const container = document.getElementById('driverActiveJobsArea');
    if(!container) return;

    const qRides = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("driverId", "==", skh.currentUser.uid));

    window.skhOnSnapshot('driver-rides', qRides, (snapshot) => {
        let html = '';
        let count = 0;

        snapshot.forEach(docSnap => {
            const rd = docSnap.data();
            const rid = docSnap.id;

            if (rd.status !== "completed" && rd.status !== "cancelled") {
                count++;
                const cargoImg = rd.cargoImage || "https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff";
                const pToken = rd.pickupTokenRef || rd.pickupToken || "Bado";
                const cPhone = rd.customerPhone || "Haikujazwa";

                html += `
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:18px; padding:15px; margin-bottom:12px; border-left:6px solid var(--primary-blue); text-align:left;"> <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"> <span style="font-size:12.5px; background:#e0f2fe; color:#03509d; padding:2px 8px; border-radius:10px; font-weight:bold; text-transform:uppercase;">${rd.status.toUpperCase()}</span> <small style="color:gray;">${new Date(rd.createdAt).toLocaleDateString()}</small> </div> <div style="display:flex; gap:10px; align-items:center;"> <img src="${cargoImg}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid #eee;"> <div> <b style="font-size:14px; color:#0f172a; display:block;">${rd.cargoName}</b> <small style="color:gray;">Mteja: ${skh.skhEscape(rd.customerName)} | Simu: ${cPhone}</small> </div> </div> <div style="background:white; padding:8px; border-radius:8px; margin-top:8px; font-size:12px; border:1px solid #eee;">
                             Kutoka: <b>${rd.fromLocation}</b> -> Kwenda: <b>${rd.toLocation}</b> </div> <div style="background:#fffbeb; padding:10px; border-radius:10px; margin-top:10px; border:1.5px dashed #d97706; font-size:12px;"> <b style="color:#d97706; display:block; margin-bottom:4px;"> Token A (Pickup Verification): <span id="pktok_${rid}">${pToken === 'Bado' ? 'Itaundwa baada ya kukubali' : pToken}</span></b>
                            ${rd.status === 'in_transit' ? T('lg_in_transit', 'Cargo is on the way! Ask the customer for Token C when you hand it over.') : ''}
                            ${rd.status === 'seller_confirmed_handover'
                                ? `<p style="margin:8px 0; color:#92400e;">Muuzaji amethibitisha makabidhiano. Ingiza Token A kuthibitisha upokeaji:</p> <div style="display:flex; gap:8px;"> <input type="text" id="pickupTokenInp_${rid}" placeholder="Token A (PK-XXXXXXXX)" style="flex:1; padding:10px; border-radius:8px; border:1px solid #cbd5e1; text-transform:uppercase; font-weight:bold; text-align:center;"> <button onclick="window.verifyHandoverToken('${rid}', 'pickup')" style="padding:10px 14px; background:var(--primary-blue); color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">THIBITISHA UPOKEAJI</button> </div>`
                                : ''}
                            ${rd.status === 'picked_up'
                                ? `<p style="margin:8px 0; color:#065f46;">Mzigo uko chini ya ulinzi wako. Bonyeza "Anza Safari" ukiwa tayari.</p> <button onclick="window.skhCustodyDriverStartQuick('${rid}')" style="width:100%; padding:10px; background:var(--green); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;"> ANZA SAFARI</button>`
                                : ''}
                            ${(rd.status === 'accepted' || rd.status === 'awaiting_pickup' || rd.status === 'pickup_pending')
                                ? `<p style="margin:8px 0 0 0; color:#92400e;">Subiri muuzaji athibitishe makabidhiano kwenye Jopo la Mizigo & Dispatch.</p>`
                                : ''}
                        </div> <button onclick="window.triggerVehicleBreakdown('${rid}', '${rd.cargoName.replace(/'/g, "\\'")}')" style="width:100%; padding:10px; background:#fee2e2; color:#ef4444; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px; margin-top:10px;"> CHOMBO KIMEHARIBIKA (BREAKDOWN)</button> </div>`;
            }
        });

        container.innerHTML = count === 0 
            ? `<p style="text-align:center; color:gray; font-size:12px; padding:20px;">Huna safari inayofanya kazi hivi sasa.</p>` 
            : html;

        // [CUSTODY PHASE B 2026-09] Token halisi inasomwa kutoka delivery_tokens
        // (mhusika pekee) na kujaza span za PK hapa.
        if (typeof window.skhCustodyReadToken === 'function') {
            snapshot.forEach(docSnap => {
                const rid = docSnap.id;
                window.skhCustodyReadToken(rid, 'pickup').then(t => {
                    const el = document.getElementById('pktok_' + rid);
                    if (el && t) el.textContent = t;
                }).catch(() => {});
            });
        }
    });
};

// ============================================================
// [LOGISTICS MARKETPLACE REDESIGN 2026-09]
// Soko la MAOMBI WALAZI (ride_requests zenye hali searching/
// pending_acceptance). Hii SI safari (ziangalie "Yanaendelea"),
// SI kumbukumbu, na SI mazungumzo (yako kwenye Gumzo/makadi ya ofa).
// Msikilizaji mmoja hukaa hai; vichupo huchuja upande wa mteja
// (papoo hapo, bila kusubiri mtandao) kwa kasi ya milliseconds.
// ============================================================
(function () { 'use strict';

    var market = { rows: [], filter: 'all_types', started: false };
    var lmIco = function (n, s) { return (window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''); };
    var esc = function (s) { return (skh.skhEscape ? skh.skhEscape(s) : String(s == null ? '' : s)); };

    var CATEGORY_META = {
        Cargo:      { cls: 'lm-cat-cargo',      ico: 'package',  label: 'Mzigo' },
        Passengers: { cls: 'lm-cat-passengers', ico: 'users',    label: 'Abiria' },
        Livestock:  { cls: 'lm-cat-livestock',  ico: 'tag',      label: 'Mifugo/Kandarasi' }
    };
    function catMeta(cat) { return CATEGORY_META[cat] || { cls: 'lm-cat-other', ico: 'briefcase', label: cat ? esc(cat) : 'Nyingine' }; }

    // Muda jamaa (dakika/saa zilizopita) bila maktaba yoyote.
    function ago(iso) {
        if (!iso) return '';
        var t = Date.parse(typeof iso === 'string' ? iso.replace(' ', 'T') : iso);
        if (isNaN(t)) return '';
        var mins = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (mins < 1) return 'sasa hivi';
        if (mins < 60) return 'dakika ' + mins + ' zilizopita';
        var hrs = Math.round(mins / 60);
        if (hrs < 24) return 'saa ' + hrs + ' zilizopita';
        var days = Math.round(hrs / 24);
        return 'siku ' + days + ' zilizopita';
    }

    function money(n) {
        n = Number(n);
        if (!isFinite(n) || n <= 0) return '';
        return 'TSh ' + Math.round(n).toLocaleString();
    }

    function chip(icoName, text, extraCls) {
        return '<span class="lm-chip' + (extraCls ? ' ' + extraCls : '') + '">' + lmIco(icoName, 11) + ' ' + esc(text) + '</span>';
    }

    function requestCardHtml(rid, rd) {
        var meta = catMeta(rd.reqCategory);
        var img = rd.cargoImage && String(rd.cargoImage).indexOf('ui-avatars') === -1
            ? '<img src="' + esc(rd.cargoImage) + '" alt="" loading="lazy">'
            : lmIco(meta.ico, 24);
        var chips = [];
        if (rd.vehicleType) chips.push(chip('truck', rd.vehicleType));
        if (Number(rd.passengerCount) > 0) chips.push(chip('users', 'Abiria ' + rd.passengerCount));
        if (rd.animalType) chips.push(chip('tag', rd.animalType + (rd.animalCount ? ' (' + rd.animalCount + ')' : '')));
        if (Number(rd.cargoWeight) > 0) chips.push(chip('package', 'Uzito ' + rd.cargoWeight + ' kg'));
        else if (rd.cargoSize) chips.push(chip('package', rd.cargoSize));
        else if (rd.luggageEstimate) chips.push(chip('package', rd.luggageEstimate));
        if (rd.isFragile) chips.push(chip('alert', 'Dhaifu — shughulikia kwa tahadhari', 'is-warn'));
        if (rd.isLiquid) chips.push(chip('alert', 'Kimiminiko', 'is-warn'));
        if (rd.pickupDate) chips.push(chip('calendar', String(rd.pickupDate).slice(0, 10) + (rd.pickupTime ? ' · ' + rd.pickupTime : ''), 'is-date'));
        else if (rd.pickupTime) chips.push(chip('clock', rd.pickupTime, 'is-date'));

        var fare = money(rd.fare);
        var fareHtml = fare
            ? '<b>' + fare + '</b>'
            : '<b class="is-negotiable">Maelewano</b>';
        var goodsValue = money(rd.cargoPrice);

        return ''
            + '<article class="lm-card" data-rid="' + esc(rid) + '">'
            + '<div class="lm-card-top">'
            + '<span class="lm-cat ' + meta.cls + '">' + lmIco(meta.ico, 12) + ' ' + meta.label + '</span>'
            + '<span style="display:inline-flex;align-items:center;gap:8px;">'
            + '<span class="lm-time">' + esc(ago(rd.createdAt)) + '</span>'
            + '<span class="lm-new"><i></i>Mpya</span>'
            + '</span>'
            + '</div>'
            + '<div class="lm-card-main">'
            + '<div class="lm-cargo-ico">' + img + '</div>'
            + '<div class="lm-cargo-txt">'
            + '<b>' + esc(rd.cargoName || 'Mzigo') + '</b>'
            + '<small>' + lmIco('users', 11) + ' ' + esc(rd.customerName || 'Mteja') + '</small>'
            + '</div>'
            + '</div>'
            + '<div class="lm-route">'
            + '<div class="lm-route-line"><span class="lm-route-dot from"></span><span class="lm-route-dot to"></span></div>'
            + '<div class="lm-route-places">'
            + '<div><b>' + esc(rd.fromLocation || 'Sehemu ya kuchukua haijatajwa') + '</b><span class="lm-r-sub">Mahali pa KUCHUKUA</span></div>'
            + '<div class="lm-r-to"><b>' + esc(rd.toLocation || 'Sehemu ya kupeleka haijatajwa') + '</b><span class="lm-r-sub">MAHALI PA KUPELEKA</span></div>'
            + '</div>'
            + '</div>'
            +   (chips.length ? '<div class="lm-chips">' + chips.join('') + '</div>' : '')
            + '<div class="lm-foot">'
            + '<div class="lm-fare"><small>Nauli' + (goodsValue ? ' · mzigo ' + goodsValue : '') + '</small>' + fareHtml + '</div>'
            /* [FIX NEGOTIATION 2026-09-15] Hapo awali kulikuwa na "Kubali Kazi Hii"
               PEKEE. Nauli ikiwa "Maelewano", msafirishaji hakuwa na njia yoyote
               ya kupendekeza bei — alilazimika kukubali au kuachana nayo.
               Sasa: "Toa Ofa" inafungua injini ya majadiliano ILIYOPO
               (skhNegoFormOpen -> 37-negotiation.js), ambayo ina
               Offer -> Counter -> Accept/Reject -> Agreement. */
            + '<div class="lm-acts">'
            + '<button type="button" class="lm-offer" onclick="window.skhTransportOffer(\'' + esc(rid) + '\')">'
            +       lmIco('tag', 15) + ' Toa Ofa'
            + '</button>'
            + '<button type="button" class="lm-accept" onclick="window.acceptTransportMission(\'' + esc(rid) + '\')">'
            +       lmIco('check', 16) + ' Kubali Kazi Hii'
            + '</button>'
            + '</div>'
            + '</div>'
            + '</article>';
    }

    function emptyHtml(filter) {
        var meta = filter === 'all_types' ? null : catMeta(filter);
        var title = filter === 'all_types'
            ? 'Hamna ombi wazi sokoni kwa sasa'
            : 'Hamna ombi la ' + (meta ? meta.label.toLowerCase() : 'aina hii') + ' kwa sasa';
        var vehicle = (skh.currentUserData && skh.currentUserData.vehicleType) || '';
        var sub = vehicle
            ? 'Maombi yanayoendana na chombo chako (' + esc(vehicle) + ') yataonekana hapa mara yatakapotumwa. Angalia pia maombi yaliyotumwa KWAKO binafsi.'
            : 'Maombi mapya yanaendelea kuingia sokoni. Angalia pia maombi yaliyotumwa KWAKO binafsi kupitia routing.';
        return ''
            + '<div class="lm-empty">'
            + '<div class="lm-empty-ico">' + lmIco('truck', 28) + '</div>'
            + '<b>' + title + '</b>'
            + '<p>' + sub + '</p>'
            +   (window.skhOpenRequestInbox
                    ? '<button type="button" class="lm-empty-btn" onclick="window.skhOpenRequestInbox()">' + lmIco('target', 14) + ' Angalia Yaliyotumwa Kwako</button>'
                    : '')
            + '</div>';
    }

    // Mifupa ya upakiaji — orodha huonekana mara moja hata kabla ya data.
    window.skhMarketSkeleton = function (n) {
        var out = '';
        for (var i = 0; i < (n || 3); i++) {
            out += ''
                + '<div class="lm-skel">'
                + '<div class="lm-skel-row">'
                + '<div class="lm-skel-ico"></div>'
                + '<div style="flex:1;">'
                + '<div class="lm-skel-bar w70"></div>'
                + '<div class="lm-skel-bar w40"></div>'
                + '</div>'
                + '</div>'
                + '<div class="lm-skel-bar w90" style="margin-top:12px;"></div>'
                + '<div class="lm-skel-bar w90" style="margin-top:8px;"></div>'
                + '</div>';
        }
        return out;
    };

    // Vifungo vya kanda ya juu (Yanaendelea/Kumbukumbu) huenda kwenye tabo husika.
    window.skhMarketGoto = function (tabName) {
        if (tabName === 'bookings') return;
        if (typeof window.switchDashTab === 'function') window.switchDashTab(tabName);
    };

    function visibleRows() {
        var myVehicle = (skh.currentUserData && skh.currentUserData.vehicleType) || '';
        return market.rows.filter(function (r) {
            var rd = r.data;
            if (market.filter !== 'all_types' && rd.reqCategory !== market.filter) return false;
            // Endana na chombo cha dereva kama profile yake inajulikana;
            // wasiojulikana (bado profile inapakia) huona soko lote asikose kazi.
            if (myVehicle && rd.vehicleType && rd.vehicleType !== myVehicle) return false;
            return true;
        });
    }

    function paintCounts() {
        var myVehicle = (skh.currentUserData && skh.currentUserData.vehicleType) || '';
        var vehicleRows = market.rows.filter(function (r) {
            var rd = r.data;
            return !(myVehicle && rd.vehicleType && rd.vehicleType !== myVehicle);
        });
        var counts = { all_types: vehicleRows.length, Cargo: 0, Passengers: 0, Livestock: 0 };
        vehicleRows.forEach(function (r) {
            var c = r.data.reqCategory;
            if (counts[c] != null) counts[c]++;
        });
        Object.keys(counts).forEach(function (k) {
            var el = document.getElementById('lmN_' + k);
            if (el) el.textContent = String(counts[k]);
        });
        var tot = document.getElementById('lmTotalCount');
        if (tot) tot.textContent = String(counts.all_types);
    }

    function render() {
        var listDiv = document.getElementById('liveBookingsList');
        if (!listDiv) return;
        paintCounts();
        var rows = visibleRows();
        if (!rows.length) { listDiv.innerHTML = emptyHtml(market.filter); return; }
        listDiv.innerHTML = rows.map(function (r) { return requestCardHtml(r.id, r.data); }).join('');
    }

    window.loadMarketplaceRequests = function (filterType) {
        market.filter = filterType || 'all_types';
        var listDiv = document.getElementById('liveBookingsList');
        if (!listDiv) return;
        // Onyesha mifupa MARA MOJA kabla ya jibu la mtandao.
        if (!market.started) listDiv.innerHTML = window.skhMarketSkeleton(4);

        if (market.started) { render(); return; } // data tayari kache — chujio ni papo hapo
        market.started = true;

        const qBookings = skh.query(
            skh.collection(skh.db, "ride_requests"),
            skh.where("status", "in", ["searching", "pending_acceptance"]),
            skh.limit(60)
        );

        window.skhOnSnapshot('driver-bookings', qBookings, (snap) => {
            var rows = [];
            snap.forEach(function (docSnap) {
                var d = docSnap.data() || {};
                // Kinga ya mteja: ombi WALAZI pekee (swali la Firestore
                // linachuja hivyo; hii hulinda endapo mazingira tofauti).
                if (d.status !== 'searching' && d.status !== 'pending_acceptance') return;
                rows.push({ id: docSnap.id, data: d });
            });
            // Mpya zaidi kwanza.
            rows.sort(function (a, b) {
                return String(b.data.createdAt || '').localeCompare(String(a.data.createdAt || ''));
            });
            market.rows = rows;
            render();
        }, function () {
            if (!market.rows.length && listDiv) {
                listDiv.innerHTML = ''
                    + '<div class="lm-empty">'
                    + '<div class="lm-empty-ico">' + lmIco('alert', 28) + '</div>'
                    + '<b>Imeshindikana kupakua maombi</b>'
                    + '<p>Angalia muunganisho wako wa intaneti kisha fungua tena sehemu hii.</p>'
                    + '</div>';
            }
        });

        // Profile ya chombo ikichelewa kuja, chora upya mara moja baadaye
        // (muda mfupi tu — sekunde 3, kuzuia muda wa kusubiri usiohitajika).
        if (!(skh.currentUserData && skh.currentUserData.vehicleType)) {
            var tries = 0;
            var iv = setInterval(function () {
                tries++;
                if ((skh.currentUserData && skh.currentUserData.vehicleType) || tries > 6) {
                    clearInterval(iv);
                    if (market.rows.length) render();
                }
            }, 500);
        }
    };

    window.filterMarketplace = function (type, btnElement) {
        market.filter = type || 'all_types';
        document.querySelectorAll('.lm-tab').forEach(function (b) { b.classList.remove('active'); });
        if (btnElement) btnElement.classList.add('active');
        // Chujo hutekelezwa kutoka kache ya snapshot — hakuna kusubiri mtandao.
        if (market.started) render();
        else window.loadMarketplaceRequests(market.filter);
    };
})();

window.verifyTokenCenterDL = async function() {
    const code = document.getElementById('tokenCenterInputDL').value.trim().toUpperCase();
    if(!code) return alert(T('lg_enter_token_c', "Enter Token C to confirm delivery!"));

    try {
        // [CUSTODY PHASE B 2026-09] Token C inathibitishwa na SERVER (deliveryComplete).
        // Hakuna query ya transferCode kwenye browser tena.
        const q = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("driverId", "==", skh.currentUser.uid));
        const snap = await skh.getDocs(q);
        let completed = false;
        if (snap && snap.docs && snap.docs.length) {
            for (const d of snap.docs) {
                const rd2 = d.data();
                if (['picked_up', 'in_transit', 'delivered'].indexOf(rd2.status) === -1) continue;
                if (typeof window.skhCustodyCompleteDelivery !== 'function') break;
                const res = await window.skhCustodyCompleteDelivery(d.id, code, undefined);
                if (res.ok) { completed = true; break; }
                // bad_token kwa safari moja -> endelea kujaribu safari nyingine.
            }
        }
        if (!completed) {
            alert(T('lg_token_c_wrong', "The Token C you entered is wrong! Verify with the recipient."));
            return;
        }

        alert(T('lg_trip_done', 'TRIP COMPLETE!\n\nThe payment has been added to your wallet safely.'));
        document.getElementById('tokenCenterInputDL').value = '';
        window.switchDashTab('overview');
    } catch(e) {
        alert("Hitilafu: " + e.message);
    }
};

// ============================================================
// [LIVE STATS] Idadi halisi za dereva (overview banner)
// ============================================================
window.skhLiveDriverStats = async function () {
    if (!skh.currentUser) return;
    const activeEl = document.getElementById('drvLiveActive');
    const availEl = document.getElementById('drvLiveAvailable');
    if (!activeEl && !availEl) return;

    const myVehicleType = (skh.currentUserData && skh.currentUserData.vehicleType) || 'Bodaboda';

    try {
        const qMine = skh.query(
            skh.collection(skh.db, "ride_requests"),
            skh.where("driverId", "==", skh.currentUser.uid),
            skh.limit(200)
        );
        const qOpen = skh.query(
            skh.collection(skh.db, "ride_requests"),
            skh.where("status", "==", "searching"),
            skh.limit(100)
        );
        const [mineSnap, openSnap] = await Promise.all([skh.getDocs(qMine), skh.getDocs(qOpen)]);

        let active = 0;
        mineSnap.forEach(d => {
            const st = d.data().status;
            if (st !== 'completed' && st !== 'cancelled') active++;
        });

        let available = 0;
        openSnap.forEach(d => {
            const rd = d.data();
            if (rd.vehicleType === myVehicleType) available++;
        });

        if (activeEl) activeEl.textContent = String(active);
        if (availEl) availEl.textContent = String(available);
    } catch (e) {
        console.warn('[driver-live-stats]', e && e.message);
        if (activeEl) activeEl.textContent = '—';
        if (availEl) availEl.textContent = '—';
    }
};


// ============================================================
// [TRANSPORT FIX 2026-09] Takwimu HALISI za dereva (hakuna namba fake).
// Zinatumika na overview/fleet/analytics tabs za renderDriverActiveTabContent.
// ============================================================
window.skhDriverTripStats = async function () {
    if (!skh.currentUser) return null;
    var uid = skh.currentUser.uid;
    var now = new Date();
    var todayStr = now.toLocaleDateString('en-CA');
    function isToday(iso) {
        if (!iso) return false;
        var d = new Date(iso);
        if (isNaN(d.getTime())) return false;
        return d.toLocaleDateString('en-CA') === todayStr;
    }
    var stats = { total: 0, active: 0, awaitingPickup: 0, inTransit: 0, deliveredToday: 0, completedTotal: 0, earningsToday: 0, disputed: 0, cancelled: 0, tripsToday: 0, rides: [] };
    try {
        var q = skh.query(skh.collection(skh.db, 'ride_requests'), skh.where('driverId', '==', uid), skh.limit(300));
        var snap = await skh.getDocs(q);
        if (snap && snap.forEach) snap.forEach(function (d) {
            var rd = Object.assign({ id: d.id }, d.data());
            stats.rides.push(rd);
            stats.total++;
            var st = rd.status || '';
            if (st === 'completed') {
                stats.completedTotal++;
                var ca = rd.completedAt || rd.createdAt || '';
                if (isToday(ca)) { stats.deliveredToday++; stats.earningsToday += Number(rd.finalPayout || rd.cargoPrice || rd.price || 0); }
            } else if (st === 'cancelled') {
                stats.cancelled++;
            } else if (st === 'disputed') {
                stats.disputed++;
            } else {
                stats.active++;
                if (st === 'picked_up' || st === 'in_transit') stats.inTransit++;
                else stats.awaitingPickup++;
            }
            if (isToday(rd.createdAt || '')) stats.tripsToday++;
        });
    } catch (e) { console.warn('[driver-trip-stats]', e && e.message); }
    stats.rides.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    return stats;
};

// [GLOSS EXT 2026-09] Expose badge helper (kama wengine wa logistics) — wiring ya i18n inathibitishwa.
window.skhDriverStatusBadge = skhDriverStatusBadge;
function skhDriverStatusBadge(status) {
    var map = {
        completed: ['#dcfce7', '#16a34a', 'Imekamilika'],
        in_transit: ['#dbeafe', '#2563eb', 'Njiani'],
        picked_up: ['#ede9fe', '#7c3aed', 'Imepokewa'],
        awaiting_pickup: ['#fef9c3', '#ca8a04', 'Anasubiri Pickup'],
        pickup_pending: ['#fef9c3', '#ca8a04', 'Pickup Inasubiri'],
        seller_confirmed_handover: ['#ffedd5', '#ea580c', 'Handover Imethibitishwa'],
        accepted: ['#e0f2fe', '#0369a1', 'Imekubaliwa'],
        pending: ['#e0f2fe', '#0369a1', 'Inasubiri'],
        searching: ['#e0f2fe', '#0369a1', 'Inatafutwa'],
        cancelled: ['#fee2e2', '#b91c1c', 'Imefutwa'],
        disputed: ['#fee2e2', '#b91c1c', 'Mgogoro']
    };
    var m = map[status] || ['#f1f5f9', '#475569', status || '—'];
    // [GLOSS EXT 2026-09] Label itokane glossary ya i18n (delivery family); map ya zamani ni fallback.
    var lbl = m[2];
    try { if (window.skhGloss) lbl = window.skhGloss(status, 'delivery', m[2]); } catch (eG) {}
    return '<span style="background:' + m[0] + ';color:' + m[1] + ';font-size:12.5px;font-weight:800;padding:2px 8px;border-radius:99px;text-transform:uppercase;">' + skh.skhEscape(lbl) + '</span>';
}

window.skhDriverOverviewStats = async function () {
    var area = document.getElementById('driverOverviewStatsArea');
    if (!area) return;
    var stats = await window.skhDriverTripStats();
    if (!stats) { area.innerHTML = '<p style="text-align:center;color:#64748b;padding:20px;font-size:12px;">' + T('dt_no_stats', 'Imeshindwa kupakia takwimu.') + '</p>'; return; }
    if (!stats.total) {
        area.innerHTML = '<div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:26px;text-align:center;">'
            + '<div style="font-size:34px;"></div>'
            + '<b style="display:block;margin-top:8px;color:#0f172a;">' + T('dt_no_trips', 'Huna safari bado.') + '</b>'
            + '<p style="color:#64748b;font-size:12px;margin:6px 0 14px;">' + T('dt_no_trips_hint', 'Nenda kwenye Requests Marketplace ukubali kazi ya kwanza.') + '</p>'
            + '<button onclick="window.switchDashTab(\'bookings\')" style="background:#03509d;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:800;font-size:12px;cursor:pointer;">' + T('dt_view_requests', 'ONA MAOMBI MAPYA') + '</button></div>';
        return;
    }
    function kpi(label, value, color) {
        return '<div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;">'
            + '<small style="color:#64748b;font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;display:block;">' + label + '</small>'
            + '<b style="font-size:20px;color:' + color + ';display:block;margin-top:4px;">' + value + '</b></div>';
    }
    var money = 'TSh ' + Math.round(stats.earningsToday).toLocaleString();
    var kpis = kpi(T('dt_active', 'Active Trips'), stats.active, '#0f172a')
        + kpi(T('dt_await_pickup', 'Awaiting Pickup'), stats.awaitingPickup, '#d97706')
        + kpi(T('dt_in_transit', 'In Transit'), stats.inTransit, '#2563eb')
        + kpi(T('dt_delivered_today', 'Delivered Today'), stats.deliveredToday, '#16a34a')
        + kpi(T('dt_completed_total', 'Completed'), stats.completedTotal, '#0f172a')
        + kpi(T('dt_earnings_today', 'Earnings Today'), money, '#7c3aed')
        + kpi(T('dt_disputes', 'Disputes'), stats.disputed, '#b91c1c')
        + kpi(T('dt_cancelled', 'Cancelled'), stats.cancelled, '#64748b');

    // Breakdown ya hali (asilimia halisi).
    var denom = Math.max(1, stats.total);
    function bar(label, count, color) {
        var pct = Math.round((count / denom) * 100);
        return '<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;margin-bottom:3px;"><span>' + label + '</span><b>' + count + ' (' + pct + '%)</b></div>'
            + '<div style="height:7px;background:#eef2f6;border-radius:99px;"><div style="width:' + pct + '%;height:7px;background:' + color + ';border-radius:99px;"></div></div></div>';
    }
    var breakdown = '<div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-top:16px;">'
        + '<b style="font-size:12px;color:#0f172a;text-transform:uppercase;display:block;margin-bottom:12px;">' + T('dt_status_breakdown', 'Hali ya Safari Zako') + '</b>'
        + bar(T('dt_await_pickup', 'Awaiting Pickup'), stats.awaitingPickup, '#d97706')
        + bar(T('dt_in_transit', 'In Transit'), stats.inTransit, '#3b82f6')
        + bar(T('dt_completed_total', 'Completed'), stats.completedTotal, '#10b981')
        + bar(T('dt_disputes', 'Disputed'), stats.disputed, '#ef4444')
        + bar(T('dt_cancelled', 'Cancelled'), stats.cancelled, '#94a3b8')
        + '</div>';

    // Safari 5 za hivi karibuni (data halisi).
    var recent = stats.rides.slice(0, 5).map(function (r) {
        var when = '';
        try { var dd = new Date(r.createdAt); if (!isNaN(dd.getTime())) when = dd.toLocaleDateString() + ' ' + dd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) {}
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9;">'
            + '<div style="flex:1;min-width:0;"><b style="font-size:12px;color:#0f172a;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + skh.skhEscape(r.cargoName || 'Mzigo') + '</b>'
            + '<small style="color:#64748b;font-size:13px;">' + skh.skhEscape(String(r.fromLocation || '') + ' -> ' + String(r.toLocation || '')) + '</small></div>'
            + skhDriverStatusBadge(r.status)
            + '<small style="color:#94a3b8;font-size:12.5px;white-space:nowrap;">' + skh.skhEscape(when) + '</small></div>';
    }).join('');
    var recentHtml = recent
        ? '<div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;margin-top:16px;"><b style="font-size:12px;color:#0f172a;text-transform:uppercase;display:block;margin-bottom:4px;">' + T('dt_recent_trips', 'Safari za Hivi Karibuni') + '</b>' + recent + '</div>'
        : '';

    area.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">' + kpis + '</div>' + breakdown + recentHtml;
};

window.skhDriverFleetStats = async function () {
    var stats = await window.skhDriverTripStats();
    var elC = document.getElementById('drvFleetCompleted');
    var elE = document.getElementById('drvFleetEarnings');
    if (elC) elC.textContent = stats ? String(stats.completedTotal) : '—';
    if (elE) elE.textContent = stats ? ('TSh ' + Math.round(stats.earningsToday).toLocaleString()) : '—';
};

window.skhDriverAnalytics = async function () {
    var area = document.getElementById('driverAnalyticsArea');
    if (!area) return;
    var stats = await window.skhDriverTripStats();
    if (!stats) { area.innerHTML = '<p style="color:#64748b;font-size:12px;padding:16px;">' + T('dt_no_stats', 'Imeshindwa kupakia takwimu.') + '</p>'; return; }
    var total = stats.completedTotal;
    var avgEarn = total > 0 ? Math.round(stats.earningsToday / Math.max(1, stats.deliveredToday)) : 0;
    function card(label, value, color) {
        return '<div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:18px;text-align:center;">'
            + '<b style="font-size:13px;color:#64748b;text-transform:uppercase;display:block;">' + label + '</b>'
            + '<b style="font-size:22px;color:' + color + ';display:block;margin-top:6px;">' + value + '</b></div>';
    }
    area.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:15px;">'
        + card(T('dt_completed_total', 'Safari Zilizokamilika'), stats.completedTotal, '#03509d')
        + card(T('dt_delivered_today', 'Zilizokamilika Leo'), stats.deliveredToday, '#16a34a')
        + card(T('dt_earnings_today', 'Mapato ya Leo'), 'TSh ' + Math.round(stats.earningsToday).toLocaleString(), '#16a34a')
        + card(T('dt_avg_per_delivery', 'Wastani kwa Uwasilishaji Leo'), stats.deliveredToday > 0 ? ('TSh ' + avgEarn.toLocaleString()) : '—', '#7c3aed')
        + '</div>';
};

window.skhDriverSaveExpense = async function () {
    if (!skh.requireAuth()) return;
    var type = document.getElementById('expTypeTrans');
    var amt = document.getElementById('expAmountTrans');
    var val = parseFloat(amt && amt.value);
    if (!val || val <= 0) { alert(T('lg_enter_amount', 'Ingiza kiasi sahihi cha matumizi.')); if (amt) amt.focus(); return; }
    try {
        await skh.addDoc(skh.collection(skh.db, 'driver_expenses'), {
            driverId: skh.currentUser.uid,
            type: type && type.value === 'Maintenance' ? 'Maintenance' : 'Fuel',
            amount: val,
            createdAt: new Date().toISOString()
        });
        if (amt) amt.value = '';
        alert(T('dt_receipt_saved', 'Receipt saved!'));
    } catch (e) {
        alert(T('dt_save_fail', 'Imeshindwa kuhifadhi matumizi.') + ' ' + (e && e.message ? e.message : ''));
    }
};

// ============================================================
// [KUMBUKUMBU 2026-09] REKODI RASMI za safari zilizokamilika na
// migogoro — hutumia takwimu zilizopo (skhDriverTripStats),
// HAITENGENEZI query mpya wala mfumo mpya.
// ============================================================
window.skhRenderTripHistory = async function () {
    var area = document.getElementById('driverTripHistoryArea');
    if (!area || typeof window.skhDriverTripStats !== 'function') return;
    var lmic = function (n, s) { return (window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''); };
    var esc = skh.skhEscape || function (x) { return String(x == null ? '' : x); };
    var stats = await window.skhDriverTripStats();
    if (!document.getElementById('driverTripHistoryArea')) return;
    if (!stats || !stats.rides.length) {
        area.innerHTML = '<div class="lm-empty"><div class="lm-empty-ico">' + lmic('clipboard', 28)
            + '</div><b>Hamna rekodi ya safari</b><p>Kumbukumbu ya usafirishaji itajaa kwa safari utakazokubali na kumaliza.</p></div>';
        return;
    }
    function fmt(iso) {
        if (!iso) return '—';
        var d = new Date(typeof iso === 'string' ? iso.replace(' ', 'T') : iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function payout(r) {
        var v = Number(r.finalPayout || r.fare || r.cargoPrice || 0);
        return isFinite(v) && v > 0 ? 'TSh ' + Math.round(v).toLocaleString() : '—';
    }
    function ref(r) {
        var id = String(r.id || '');
        return 'SH-TR-' + id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    }
    function row(r, kind) {
        var problem = kind === 'problem';
        var statusBadgeHtml = problem
            ? ('<span class="lm-hist-badge is-problem">' + lmic('alert', 11) + ' Mgogoro</span>')
            : ('<span class="lm-hist-badge is-done">' + lmic('check', 11) + ' Imekamilika</span>');
        return ''
            + '<div class="lm-hist' + (problem ? ' is-problem' : '') + '">'
            + '<span class="lm-hist-ico ' + (problem ? 'is-problem' : 'is-done') + '">' + lmic(problem ? 'alert' : 'shield-check', 17) + '</span>'
            + '<div class="lm-hist-body">'
            + '<b>' + esc(r.cargoName || 'Mzigo') + ' <small>' + esc(ref(r)) + '</small></b>'
            + '<span class="lm-hist-route">' + lmic('map', 11) + ' ' + esc(r.fromLocation || '…') + ' -> ' + esc(r.toLocation || '…') + '</span>'
            + '<span class="lm-hist-meta">' + lmic('calendar', 11) + ' ' + esc(fmt(r.completedAt || r.createdAt))
            + ' · <b style="color:#0E7A5F;">' + payout(r) + '</b>'
            +       (r.driverName ? ' · ' + esc(r.driverName) : '') + '</span>'
            + '</div>'
            + '<div class="lm-hist-side">'
            +     statusBadgeHtml
            + '<button type="button" class="lm-hist-track" onclick="window.openLiveMap(\'' + esc(r.id) + '\')">' + lmic('map', 12) + ' Tazama</button>'
            + '</div>'
            + '</div>';
    }
    var done = stats.rides.filter(function (r) { return r.status === 'completed'; }).slice(0, 15);
    var problems = stats.rides.filter(function (r) { return r.status === 'disputed' || r.status === 'cancelled'; }).slice(0, 10);
    var html = '';
    if (problems.length) {
        html += '<div class="lm-hist-sep is-problem">' + lmic('alert', 13) + ' Matatizo / Migogoro (' + problems.length + ')</div>';
        html += problems.map(function (r) { return row(r, 'problem'); }).join('');
    }
    html += '<div class="lm-hist-sep">' + lmic('shield-check', 13) + ' Safari zilizokamilika (' + done.length + ')</div>';
    html += done.length
        ? done.map(function (r) { return row(r, 'done'); }).join('')
        : '<div class="lm-empty" style="padding:22px 16px;"><div class="lm-empty-ico">' + lmic('clipboard', 26) + '</div><b>Bado hamna safari iliyokamilika</b><p>Safari itakapothibitishwa kupokelewa na mpokeaji, itaonekana hapa.</p></div>';
    area.innerHTML = html;
};

// ============================================================
// [PHASE 8 FIX] UTEKELEZAJI WA KUKABILI KAZI NA KUTOA OFA YA USAFIRI
// ============================================================
window.acceptTransportMission = async function(rideId) {
    if (!skh.requireAuth()) return;
    if (typeof window.skhCustodyAcceptRide === 'function') {
        return window.skhCustodyAcceptRide(rideId);
    }
    try {
        const me = skh.currentUser.uid;
        const myName = (skh.currentUserData && skh.currentUserData.fullName) || skh.currentUser.displayName || 'Dereva';
        const myPhone = (skh.currentUserData && skh.currentUserData.phone) || '';
        const myVehicle = (skh.currentUserData && skh.currentUserData.vehicleType) || 'Usafiri';
        const rideRef = skh.doc(skh.db, 'ride_requests', rideId);
        const snap = await skh.getDoc(rideRef);
        if (!snap || !snap.exists || !snap.exists()) return alert('Safari hii haipatikani tena.');
        const rd = snap.data();
        if (rd.status !== 'searching' && rd.status !== 'pending_acceptance') {
            return alert('Safari hii imeshachukuliwa au kufungwa.');
        }

        const pkToken = 'PK-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        await skh.updateDoc(rideRef, {
            driverId: me,
            driverName: myName,
            driverPhone: myPhone,
            vehicleType: myVehicle,
            status: 'accepted',
            acceptedAt: new Date().toISOString(),
            pickupToken: pkToken,
            pickupTokenStatus: 'pending'
        });

        // Tuma arifa kwa mteja
        if (rd.customerId) {
            await skh.addDoc(skh.collection(skh.db, 'notifications'), {
                userId: rd.customerId,
                title: 'Dereva Amekubali Safari!',
                body: myName + ' amekubali kusafirisha ' + (rd.cargoName || 'mzigo wako') + '. Token A ya kuchukulia: ' + pkToken,
                type: 'delivery',
                rideId: rideId,
                createdAt: new Date().toISOString(),
                read: false
            });
        }
        // Tuma arifa kwa muuzaji
        if (rd.sellerId && rd.sellerId !== rd.customerId) {
            await skh.addDoc(skh.collection(skh.db, 'notifications'), {
                userId: rd.sellerId,
                title: 'Dereva Ameelekea Kuchukua Mzigo',
                body: myName + ' anakuja kuchukua mzigo #' + (rd.cargoName || '') + '. Hakiki Token A (' + pkToken + ') atakapofika.',
                type: 'delivery',
                rideId: rideId,
                createdAt: new Date().toISOString(),
                read: false
            });
        }

        alert('Umefanikiwa kukubali safari hii! Unaweza kuiona kwenye tab ya "Safari Zangu".');
        if (typeof window.switchDashTab === 'function') window.switchDashTab('active');
        if (typeof window.renderDriverActiveTabContent === 'function') window.renderDriverActiveTabContent();
    } catch(e) {
        alert('Hitilafu ya kukubali safari: ' + e.message);
    }
};

window.skhTransportOffer = async function(rideId) {
    if (!skh.requireAuth()) return;
    try {
        const snap = await skh.getDoc(skh.doc(skh.db, 'ride_requests', rideId));
        if (!snap || !snap.exists || !snap.exists()) return alert('Ombi hili halipatikani tena.');
        const rd = Object.assign({ id: rideId, collectionName: 'ride_requests' }, snap.data());
        if (!rd.customerId) return alert('Mteja wa ombi hili hajapatikana.');
        if (rd.customerId === skh.currentUser.uid) return alert('Huwezi kujitolea ofa kwenye safari yako mwenyewe.');

        // Unganisha muktadha na ufungue Chat + Negotiation Form
        skh.activeChatTransport = rd;
        if (typeof window.skhChatOpen === 'function') {
            await window.skhChatOpen(rd.customerId, rd.customerName || 'Mteja', {
                type: 'transport',
                related: { transportId: rideId, transportTitle: rd.cargoName || 'Usafiri', transportFare: rd.fare || null }
            });
            setTimeout(function() {
                if (typeof window.skhNegoFormOpen === 'function') {
                    window.skhNegoFormOpen({ type: 'transport', entity: rd });
                }
            }, 600);
        } else if (typeof window.openChatWithUser === 'function') {
            window.openChatWithUser(rd.customerId, rd.customerName || 'Mteja');
        }
    } catch(e) {
        alert('Hitilafu: ' + e.message);
    }
};
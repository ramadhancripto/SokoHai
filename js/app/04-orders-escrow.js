/* ==== js/app/04-orders-escrow.js ==== */
import { skh } from './00-bootstrap.js';

window.loadBuyerOrdersWithTracking = async function() {
    const list = document.getElementById('buyerOrdersModalList');
    if(!list) return;

    list.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;"> Inapakia oda na safari zako...</p>';

    try {
        // 1. Vuta Oda za Bidhaa na safari za usafiri kwa pamoja
        const qOrders = skh.query(skh.collection(skh.db, "orders"), skh.where("buyerId", "==", skh.currentUser.uid));
// Oda mpya itakuwa juu kabisa
const qRides = skh.query(
    skh.collection(skh.db, "ride_requests"), 
    skh.where("customerId", "==", skh.currentUser.uid),
    skh.orderBy("createdAt", "desc") // <--- Hii inapanga mpya juu
);
        const [snapOrders, snapRides] = await Promise.all([skh.getDocs(qOrders), skh.getDocs(qRides)]);

        let html = '';

        // 2. CHORA ODA ZA BIDHAA
        if(!snapOrders.empty) {
            snapOrders.forEach(docSnap => {
                const od = docSnap.data();
                const status = od.status;
                let progressWidth = "5%"; 
                let step1Class = "done", step2Class = "", step3Class = "", step4Class = "";

                if(status === 'shipped') { progressWidth = "50%"; step2Class = "active"; }
                else if(status === 'completed') { progressWidth = "100%"; step1Class = "done"; step2Class = "done"; step3Class = "done"; step4Class = "done"; }

                const canArchive = (status === 'completed' || status === 'refunded_by_admin');
                const odImg = od.itemImg || '';
                html += `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:15px; border-radius:16px; margin-bottom:15px;"> <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px;"> <img src="${odImg || 'https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff'}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff';" style="width:52px; height:52px; border-radius:12px; object-fit:cover; border:1px solid #e2e8f0; background:#f1f5f9; flex-shrink:0;"> <div style="flex:1; min-width:0;"> <b style="color:var(--primary-dark); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"> Bidhaa: ${skh.skhEscape(od.itemTitle)}</b> <span style="font-size:13px; font-weight:bold; color:var(--terracotta);">TSh ${Number(od.amount || 0).toLocaleString()}</span>
                                ${canArchive ? `<button onclick="window.deleteOrderLog('${docSnap.id}')" style="background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer;" title="Futa Rekodi"></button>` : ''}
                            </div> </div> <div class="tracker-wrap"> <div class="tracker-line"></div> <div class="tracker-fill" style="width: ${progressWidth};"></div> <div class="tracker-steps"> <div class="t-step ${step1Class}"><div class="t-dot"></div><span class="t-label">Seller</span></div> <div class="t-step ${step2Class}"><div class="t-dot"></div><span class="t-label">Safarini</span></div> <div class="t-step"><div class="t-dot"></div><span class="t-label">Kituoni</span></div> <div class="t-step ${step4Class}"><div class="t-dot"></div><span class="t-label">Mteja</span></div> </div> </div> <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;"> <button onclick="window.skhViewOrderProduct('${skh.skhJsEsc(String(od.itemId || ''))}')" style="flex:1; min-width:110px; padding:12px; background:#e0f2fe; color:#03509d; border:none; border-radius:10px; font-weight:bold; cursor:pointer;"> TAZAMA BIDHAA</button> <button onclick="window.openOrderTracking('${docSnap.id}')" style="flex:1; min-width:130px; padding:12px; background:var(--primary-blue); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">&#128506; FUATILIA MZIGO</button> <button onclick="window.openChatWithUser('${skh.skhJsEsc(od.sellerId || '')}', '${skh.skhJsEsc(od.sellerName || 'Muuzaji')}')" style="flex:1; min-width:130px; padding:12px; background:#25D366; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">CHAT NA MUUZAJI</button> </div> <div style="margin-top:10px;">
                            ${status === 'shipped' ? `<button onclick="openEscrowModal('${docSnap.id}', '${od.sellerId}', ${od.amount})" style="width:100%; padding:12px; background:var(--green); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;"> NIMEPOKEA MZIGO</button>` : `<p style="font-size:12px; color:#64748b; text-align:center; background:#eee; padding:5px; border-radius:5px;">Hali: <b>${status.toUpperCase()}</b></p>`
                            }
                        </div> </div> `;
            });
        }

        // 3. CHORA MAOMBI YA USAFIRI (RIDE REQUESTS)
     if(!snapRides.empty) {
            snapRides.forEach(rDoc => {
                const rd = rDoc.data();
                let actionArea = "";
                const isFinished = (rd.status === 'completed' || rd.status === 'cancelled');

                // Logic ya Chain: Kama mzigo umefika Hub (Mkoani), mteja aongeze safari nyingine
                if(rd.status === 'arrived_at_hub') {
                    actionArea = `<button onclick="chainNextLeg('${rDoc.id}', '${rd.toLocation}', '${rd.cargoName}')" style="width:100%; padding:12px; background:var(--gold); border:none; border-radius:10px; font-weight:900; margin-top:10px;"> UNGA USAFIRI WA WILAYANI</button>`;
                } 
                else if(rd.status === 'in_transit') {
                    actionArea = `<p style="color:var(--green); text-align:center; font-weight:bold;"> Mzigo upo njiani...</p>`;
                }

                const rideImg = rd.cargoImage || '';

    html += `
                    <div style="background:#fffbeb; border:1px solid var(--gold); padding:15px; border-radius:16px; margin-bottom:15px;"> <div style="display:flex; gap:12px; align-items:center; margin-bottom:8px;"> <img src="${rideImg || 'https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff'}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff';" style="width:52px; height:52px; border-radius:12px; object-fit:cover; border:1px solid #fcd34d; background:#fff; flex-shrink:0;"> <div style="flex:1; min-width:0;"> <b style="color:var(--primary-dark); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"> Safari: ${skh.skhEscape(rd.cargoName || 'Mzigo')}</b> <p style="font-size:12px; color:#475569; margin:2px 0;"> ${skh.skhEscape(rd.fromLocation)}  ${skh.skhEscape(rd.toLocation)}</p>
                                ${isFinished ? `<button onclick="deleteRideOrder('${rDoc.id}')" style="color:red; background:none; border:none; float:right; font-size:13px;"> Futa Kumbukumbu</button>` : ''}
                            </div> </div> <div style="display:flex; gap:8px; flex-wrap:wrap;"> <button onclick="window.openRideTracking('${rDoc.id}')" style="flex:1; min-width:130px; padding:12px; background:var(--primary-blue); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">&#128506; FUATILIA LIVE</button> <button onclick="window.openChatWithUser('${skh.skhJsEsc(rd.driverId || '')}', '${skh.skhJsEsc(rd.driverName || 'Msafirishaji')}')" style="flex:1; min-width:130px; padding:12px; background:#25D366; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">CHAT NA MSAFIRISHAJI</button> </div> <div style="background:white; padding:12px; border-radius:12px; margin-top:10px; border: 1px dashed #f97316;"> <p style="font-size:13px; color:#9a3412; margin:0;"><b> CODE YAKO YA UTHIBITISHO:</b></p> <h1 data-custody-token-ride="${rDoc.id}" data-custody-token-kind="transfer" style="text-align:center; color:orange; margin:5px 0;">• • •</h1> <small style="font-size:12px; display:block; text-align:center;">Mpe namba hii mtu anayepaswa kupokea mzigo huu (Dereva au Mteja wa mwisho).</small> </div>
                        ${actionArea}
                    </div>`;
            });
        }   
        
        if(snapOrders.empty && snapRides.empty) {
            list.innerHTML = '<p style="text-align:center; padding:20px;">Huna oda wala safari yoyote kwa sasa.</p>';
        } else {
            list.innerHTML = html;
            // [CUSTODY PHASE B] Jaza Token C halisi (kwa mhusika pekee).
            if (typeof window.skhCustodyHydrateTokenCodes === 'function') {
                window.skhCustodyHydrateTokenCodes(list);
            }
        }

    } catch(e) {
        list.innerHTML = '<p style="color:red; text-align:center;">Hitilafu: ' + e.message + '</p>';
    }
};

// [IDENTITY-FIX BUG-05] #offlineMemberForm imehamishwa — flow ya usajili ni MOJA
// (skhAssistRegisterView kwenye agent dashboard). Proxy hii inabaki ili kiungo
// chochote cha zamani kisianguke kimya kimya.
window.openOfflineRegister = function() {
    closeModals(); // Funga kila kitu kwanza
    if (typeof window.skhOpenMemberRegistration === 'function') {
        window.skhOpenMemberRegistration();
    }
};

window.requestWithdrawal = async function() {
    const kiasi = skh.currentUserData.walletBalance || 0;
    if(kiasi < 5000) {
        alert(" Huwezi kutoa chini ya TSh 5,000. Wallet yako ina TSh " + kiasi.toLocaleString());
        return;
    }
    const namba = await skhPrompt("Andika namba ya simu au namba ya benki ya kupokelea pesa:");
    if(namba) {
        alert(" Ombi lako la kutoa TSh " + kiasi.toLocaleString() + " limepokelewa. Admin atakutumia muamala kwenye namba " + namba);
        // Hapa unaweza kuongeza kodi ya kutuma notification kwa Admin Firebase
    }
};

window.openEscrowModal = function(orderId, sellerId, amount) {
        const aoi = document.getElementById('activeOrderId');
        if(aoi) {
            aoi.value = orderId;
            // Tuhifadhi hizi data kwa muda kwenye input ili tuzitumie kwenye confirmation
            aoi.dataset.seller = sellerId;
            aoi.dataset.amount = amount;
        }
        closeModals(); 
        const em = document.getElementById('escrowModal');
        if(em) em.style.display = 'flex';
    };

window.confirmEscrowOrder = async function() {
    const aoi = document.getElementById('activeOrderId');
    if(!aoi) return;
    const oid = aoi.value;
    
    if(await skhConfirm("Je, unathibitisha kukamilisha oda hii? SokoPay itagawanya malipo kwa Muuzaji na Msafirishaji (Smart Split) sasa hivi.")) {
        const btn = event.target || document.querySelector('#escrowModal button');
        const originalText = btn ? btn.innerHTML : "Thibitisha";
        if(btn) {
            btn.innerHTML = " Inaproses Smart Split...";
            btn.disabled = true;
        }

        try {
            // 1. Vuta data ya Oda kutoka Firebase
            const orderRef = skh.doc(skh.db, "orders", oid);
            const docSnap = await skh.getDoc(orderRef);
            if(!docSnap.exists()) throw new Error("Oda haijapatikana!");
            
            const orderData = docSnap.data();

            // [PHASE 5.2a] NJIA YA SERVER (WALLET_VIA_SERVER=true): escrow release
            // NZIMA inafanyika Cloud Function 'escrowRelease' — smart-split atomic,
            // wallet_ledger (idempotent), adminRevenue, na uhamisho wa hali zote.
            // Geti likiwa false / server ikikosekana -> njia ya client (hapa chini)
            // inabaki KAMA ILIVYO (tabia ya sasa).
            if (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.WALLET_VIA_SERVER && typeof window.skhEscrowRelease === 'function') {
                const srv = await window.skhEscrowRelease(oid);
                if (srv && srv.ok) {
                    const s = srv.split || {};
                    alert(`\U0001F389 SMART SPLIT PAYOUT (SERVER \u2014 salama & atomic)!\n\n\u2022 Muuzaji: TSh ${(s.sellerEarned || 0).toLocaleString()}\n\u2022 Carrier: TSh ${(s.carrierShare || 0).toLocaleString()}\n\u2022 Platform: TSh ${(s.platformFee || 0).toLocaleString()}\n\u2022 Ledger: ${srv.ledgerId}`);
                    window.closeModals();
                    if (window.loadBuyerOrdersWithTracking) window.loadBuyerOrdersWithTracking();
                    return;
                }
                throw new Error((srv && srv.message) || 'Server ya escrow imekataa muamala huu. Muamala HAUJAFANYIKA.');
            }
            const totalAmount = parseFloat(orderData.amount);
            const sellerId = orderData.sellerId;
            const itemId = orderData.itemId;

            // 2. Kagua kama kulikuwa na usafirishaji wa Sokohai uliounganishwa (Logistics check)
            let carrierShare = 0;
            let driverId = null;
            let rideDocId = null;

            const qRide = skh.query(skh.collection(skh.db, "ride_requests"), skh.where("customerId", "==", skh.currentUser.uid), skh.where("status", "==", "in_transit"));
            const rideSnap = await skh.getDocs(qRide);
            
            if(!rideSnap.empty) {
                // Ipo: Lipe gari nauli yake (Smart Split: 15% au kulingana na muamala)
                const rideDoc = rideSnap.docs[0];
                const rideData = rideDoc.data();
                rideDocId = rideDoc.id;
                driverId = rideData.driverId;
                carrierShare = parseFloat(rideData.price) || (totalAmount * 0.15); // 15% as default
            }

            // 3. PIGA HESABU YA KAMISHENI YA SOKOHAI (5% Platform Fee)
            // [ADMIN PAYMENTS SWITCH] Ada ya kamisheni imezimwa = FREE -> kamisheni 0.
            const platformFee = skh.paymentGate('commission') ? (totalAmount * 0.05) : 0;
            const sellerEarned = totalAmount - (platformFee + carrierShare);

            // 4. Badili status ya oda na usafiri kuwa COMPLETED
            await skh.updateDoc(orderRef, { 
                status: "completed", 
                commission: platformFee, 
                carrierEarned: carrierShare,
                sellerEarned: sellerEarned,
                completedAt: new Date().toISOString()
            });

            if (rideDocId) {
                // [CUSTODY PHASE B 2026-09] Safari inakamilishwa na SERVER
                // (deliveryComplete), si kwa uandishi wa moja kwa moja wa status.
                // skipPayout=true — malipo ya dereva yanashughulikiwa na Smart Split
                // hapo chini (carrierShare), ili kuepuka malipo mara mbili.
                try {
                    const dlTok = (typeof window.skhCustodyReadToken === 'function')
                        ? await window.skhCustodyReadToken(rideDocId, 'transfer') : null;
                    if (typeof window.skhCustodyCompleteDelivery === 'function') {
                        await window.skhCustodyCompleteDelivery(rideDocId, dlTok || '', undefined, { skipPayout: true });
                    }
                } catch (custErr) {
                    console.warn('[escrow] kukamilisha safari kumeshindikana:', custErr && custErr.message);
                }
            }
            
            // Ikiwa ni SokoPay direct link, thibitisha pia
            try {
                const spLinkRef = skh.doc(skh.db, "sokopay_links", itemId);
                const spSnap = await skh.getDoc(spLinkRef);
                if(spSnap.exists()) {
                    await skh.updateDoc(spLinkRef, { status: "completed" });
                }
            } catch(spErr) { console.log("Sio SokoPay link"); }
            
            // 5. Mpe Muuzaji pesa yake kwenye Wallet
            const sellerQuery = await skh.getDocs(skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", sellerId)));
            let sellerAgentCode = null;

            if(!sellerQuery.empty) {
                const sellerDocId = sellerQuery.docs[0].id;
                const sData = sellerQuery.docs[0].data();
                sellerAgentCode = sData.agentCode; 

                // [PHASE 5.2a] kituo kimoja (legacy 1:1 geti likiwa off; server ikiwa on)
                await window.skhWalletAdjust(skh.doc(skh.db, "users", sellerDocId), sellerEarned, { type: 'escrow_release', ledgerKey: 'order_' + oid + '_seller', note: 'Escrow release — muuzaji' });
                
                await skh.addDoc(skh.collection(skh.db, "notifications"), {
                    userId: sellerId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.saleCompleted',
                params: { amount: sellerEarned.toLocaleString() },
                    title: " SokoPay: Mauzo Yamekamilika!",
                    body: `Mnunuzi amethibitisha mapokezi. TSh ${sellerEarned.toLocaleString()} imeingizwa kwenye wallet yako salama.`,
                    createdAt: new Date().toISOString(),
                    read: false,
                    type: 'wallet'
                });
            }

            // 6. LIPA DEREVA / CARRIER (Kama alikuwepo kwenye mzunguko)
            if(driverId && carrierShare > 0) {
                const driverQuery = await skh.getDocs(skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", driverId)));
                if(!driverQuery.empty) {
                    const driverDocId = driverQuery.docs[0].id;
                    // [PHASE 5.2a] kituo kimoja
                    await window.skhWalletAdjust(skh.doc(skh.db, "users", driverDocId), carrierShare, { type: 'escrow_release', ledgerKey: 'order_' + oid + '_carrier', note: 'Escrow release — carrier' });

                    await skh.addDoc(skh.collection(skh.db, "notifications"), {
                        userId: driverId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.transportPaid',
                params: { amount: carrierShare.toLocaleString() },
                        title: " SokoPay: Malipo ya Usafiri Yamepokelewa!",
                        body: `Mteja amethibitisha kupokea mzigo. TSh ${carrierShare.toLocaleString()} imeingizwa kwenye wallet yako kama nauli.`,
                        createdAt: new Date().toISOString(),
                        read: false,
                        type: 'wallet'
                    });
                }
            }

            // 7. MGAWANYO WA KAMISHENI YA WAKALA (60% kwa Wakala aliyeandikisha muuzaji, 40% kwa System)
            let adminShare = platformFee;
            if(sellerAgentCode) {
                const agentQ = await skh.getDocs(skh.query(skh.collection(skh.db, "users"), skh.where("myAgentCode", "==", sellerAgentCode)));
                if(!agentQ.empty) {
                    const agentDocId = agentQ.docs[0].id;
                    const agentShare = platformFee * 0.60;
                    adminShare = platformFee * 0.40;

                    // [PHASE 5.2a] kituo kimoja
                    await window.skhWalletAdjust(skh.doc(skh.db, "users", agentDocId), agentShare, { type: 'escrow_release', ledgerKey: 'order_' + oid + '_agent', note: 'Escrow release — kamisheni ya wakala' });
                    
                    await skh.addDoc(skh.collection(skh.db, "notifications"), {
                        userId: agentQ.docs[0].data().uid,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.commissionEarned',
                params: { amount: agentShare.toLocaleString() },
                        title: " SokoPay: Kamisheni Mpya ya Uwakala!",
                        body: `Mteja wako amefanya mauzo. Umepata kiasi cha TSh ${agentShare.toLocaleString()} kwenye wallet yako.`,
                        createdAt: new Date().toISOString(),
                        read: false,
                        type: 'wallet'
                    });
                }
            }

            // Rekodi mapato ya msimamizi (Platform Revenue)
            // Accounting is server-authoritative; no client adminRevenue write.

            alert(` SMART SPLIT PAYOUT SUCCESS!\n\n• Muuzaji amelipwa: TSh ${sellerEarned.toLocaleString()}\n• Dereva/Carrier amelipwa: TSh ${carrierShare.toLocaleString()}\n• Platform Fee (System): TSh ${platformFee.toLocaleString()}`);
            window.closeModals(); 
            if(window.loadBuyerOrdersWithTracking) window.loadBuyerOrdersWithTracking();
        } catch(e) {
            // [FUNCTIONS RESILIENCE] escrowRelease haijapelekwa/haipatikani ->
            // usionyeshe "INTERNAL"; hakuna pesa iliyotoka.
            var emsg = (window.skhFnErrText && window.skhFnErrText(e, 'escrow')) || (e && e.message) || 'Imeshindwa.';
            alert(" Hitilafu ya kukamilisha: " + emsg);
        } finally {
            if(btn) {
                btn.innerHTML = originalText; 
                btn.disabled = false;
            }
        }
    }
};

window.disputeEscrowOrder = async function() {
        const aoi = document.getElementById('activeOrderId');
        if(!aoi) return;
        const oid = aoi.value;
        
        const sababu = await skhPrompt("Eleza tatizo la mzigo huu kwa ufupi:");
        if(sababu) {
            await skh.updateDoc(skh.doc(skh.db, "orders", oid), { status: "disputed", disputeReason: sababu });
            alert(" Tumepokea malalamiko yako. Pesa itaendelea kushikiliwa mpaka tatizo litatuliwe na Admin.");
            closeModals(); 
            if (typeof window.loadBuyerOrdersWithTracking === 'function') window.loadBuyerOrdersWithTracking();
        }
    };

skh.onAuthStateChanged(skh.auth, async (user) => { 
    skh.currentUser = user; 
    // [PHASE 4.3] State sync: pull on login / stop on logout (js/14-sync.js)
    try { if (user) window.skhSyncOnLogin(user.uid); else window.skhSyncOnLogout(); } catch(e) {}
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarPic = document.getElementById('sidebarUserPic');
    const sidebarWallet = document.getElementById('sidebarWallet');
    const sidebarTokens = document.getElementById('sidebarTokens');

    if (skh.userUnsubscribe) {
        skh.userUnsubscribe();
        skh.userUnsubscribe = null;
    }

    // [PHASE 2 - USALAMA] Admin role kutoka Firebase Custom Claims ( njia sahihi).
    // Inasomwa mara moja kila login; email fallback (ya chini) inaendelea kufanya kazi.
    try {
        const idTokenResult = user ? await user.getIdTokenResult() : null;
        window.SOKOHAI_CLAIMS = { isAdmin: (idTokenResult?.claims?.role === 'admin') };
    } catch(claimsErr) {
        console.warn("Claims hazikusomeka:", claimsErr);
        window.SOKOHAI_CLAIMS = { isAdmin: false };
    }

    if(user) {
        if(sidebarName) sidebarName.innerText = user.displayName || "Mtumiaji";
        if(sidebarPic) sidebarPic.src = user.photoURL || `https://ui-avatars.com/api/?name=${skh.skhEscape(user.displayName)}`;
        
        skh.userUnsubscribe = skh.onSnapshot(skh.doc(skh.db, "users", user.uid), (docSnap) => {
            if(docSnap.exists()) {
                skh.currentUserData = { docId: docSnap.id, ...docSnap.data() };
                if(sidebarWallet) sidebarWallet.innerText = "TZS " + (skh.currentUserData.walletBalance || 0).toLocaleString();
                if(sidebarTokens) sidebarTokens.innerText = (skh.currentUserData.tokens || 0).toLocaleString();
                
                const spHubWallet = document.getElementById('spHubWalletBalance');
                if(spHubWallet) spHubWallet.innerText = "TZS " + (skh.currentUserData.walletBalance || 0).toLocaleString();
                
                skh.updateCartUI();

                // Hapa sasa tunawasha na ku-sync chati na kadi za SokoPay wallet kwa usahihi
                setTimeout(() => {
                    if (typeof window.syncSokoPayRealtimeData === 'function') {
                        window.syncSokoPayRealtimeData();
                    }
                }, 1000);

            } else {
                skh.setDoc(skh.doc(skh.db, "users", user.uid), {
                    uid: user.uid, fullName: user.displayName, email: user.email,
                    walletBalance: 0, tokens: 0, createdAt: new Date().toISOString()
                });
            }
        });
    } else {
        if(sidebarName) sidebarName.innerText = "Guest User";
        if(sidebarWallet) sidebarWallet.innerText = "TZS 0";
    }

    // [PERF 2026-09] Pakia soko la mnunuzi TU ikiwa tupo kwenye buyer mode —
    // na kwa collection aliyonayo sasa (si 'all' kila wakati). Cache ndani ya
    // loadMainFeed inazuia kupakua tena kila auth-state inapobadilika.
    if (skh.currentMode === 'buyer') {
        skh.loadMainFeed(skh.currentFeedCollection || 'all');
    }

    // [ODA RELATIONAL 2026-09] Mnunuzi akiingia, anzisha mlisho wa ofa zake
    // zilizokubaliwa -> bei iliyokubaliwa iingie kwenye Smart Cart moja kwa moja.
    if (user && typeof window.skhOfferCartSync === 'function') {
        try { window.skhOfferCartSync(user.uid); } catch (e) { /* ignore */ }
    }

    // [NOTIF FIX 2026-09] Washa beji ya arifa baada ya DOM kuwa tayari;
    // zima listener akitoka (awali ilitegemea kuitwa kwa mkono — haikuitwa).
    if (user) {
        const startNotifs = function () {
            try { if (typeof skh.listenToUnreadNotifications === 'function') skh.listenToUnreadNotifications(); } catch (e) {}
        };
        if (document.getElementById('notifBadge')) startNotifs();
        else document.addEventListener('DOMContentLoaded', startNotifs, { once: true });
    } else {
        if (skh.notifUnsubscribe) { try { skh.notifUnsubscribe(); } catch (e) {} skh.notifUnsubscribe = null; }
        const nb = document.getElementById('notifBadge');
        if (nb) nb.style.display = 'none';
    }
});

/* [§19-§20 R8 VIEW PRODUCT] "Tazama Bidhaa" ya oda — RESOLVES correctly
 * (productId → Product Details), eller FAIL-GRACEFULLY when item imesitishwa
 * / archived — NO broken route au silent-do-nothing. */
window.skhViewOrderProduct = async function (itemId) {
    if (!itemId) {
        if (typeof skhToast === 'function') skhToast('Oda hii haina rejea ya bidhaa (rekodi ya zamani).', 'warning');
        return;
    }
    try {
        const cols = ['products', 'services', 'drivers'];
        let archivedFound = false;
        for (let i = 0; i < cols.length; i++) {
            try {
                const snap = await skh.getDoc(skh.doc(skh.db, cols[i], itemId));
                if (snap && snap.exists && snap.exists()) {
                    const d = snap.data() || {};
                    const st = String(d.status || '').toLowerCase();
                    // [R8 §20 GRACEFUL ARCHIVED 2026-09] Bidhaa/venini imeasisha au
                    // imefutwa — SI broken-route! Show graceful unavailable state,
                    // na hakika hakuna kufungua zililaoma zilizo-uzile kutoka matumizi.
                    if (st === 'archived' || st === 'deleted' || st === 'removed') { archivedFound = true; continue; }
                    if (typeof window.openProduct === 'function') {
                        window.openProduct(itemId, cols[i]);
                        return;
                    }
                }
            } catch (e) { /* kifaa-haossi endelea */ }
        }
        if (archivedFound && typeof skhToast === 'function') {
            skhToast('Bidhaa hii imepunguzwa/live haipo tena sokoni kwa sasa.', 'warning');
            return;
        }
        if (typeof skhToast === 'function') skhToast('Bidhaa hii haipatikani tena — inaweza kuwa imeachisha (au imefutwa na muuzaji wake).', 'warning');
        else alert('Bidhaa hii haipatikani tena.');
    } catch (e) {
        if (typeof skhToast === 'function') skhToast('Imeshindikana kufungua bidhaa: ' + (e && e.message), 'error');
    }
};

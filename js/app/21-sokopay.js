/* ==== js/app/21-sokopay.js ==== */
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


window.renderRoleBasedDashboard = function() {
    const role = skh.currentUserData?.shopRole || 'owner';
    const sidebar = document.querySelector('.ct-sidebar');

    if(role === 'Cashier') {
        // Mhudumu anaona POS tu
        alert(T('sp_cashier_role', "Cashier Privileges: Your dashboard is limited to Sales/POS only."));
        window.switchDashTab('overview');
        // Ficha menu zingine kwenye sidebar
        const linksToHide = ['_product_analytics', '_expenses', '_staff', '_settings'];
        linksToHide.forEach(id => {
            const el = document.getElementById('btnTab' + id);
            if(el) el.style.display = 'none';
        });
    } else if(role === 'Storekeeper') {
        // Shika stoo anaona stoo tu
        alert(T('sp_storekeeper_role', "Storekeeper Privileges: Your access is limited to Stock & Inventory only."));
        window.switchDashTab('inventory');
        const linksToHide = ['_product_analytics', '_expenses', '_staff', '_settings', '_overview'];
        linksToHide.forEach(id => {
            const el = document.getElementById('btnTab' + id);
            if(el) el.style.display = 'none';
        });
    } else {
        // Owner anaona kila kitu kiofisi
        document.querySelectorAll('.ct-sidebar-menu-btn').forEach(b => b.style.display = 'block');
    }
};

window.confirmSokoPayLinkDirect = async function(docId, sellerId, totalAmount, carrierShare = 0) {
    if(!await skhConfirm(`Je, unathibitisha kuwa mkataba huu umekamilika vizuri?\n\nPesa ya mkataba itatumwa kwa wahusika sasa hivi.`)) return;

    // [SOKOPAY LIVE] Server-authoritative release — Cloud Function 'haipayReleaseLink'.
    // Browser haitoi pesa wala haibadilishi status ya 'completed' — server ndiyo mamlaka.
    const viaServer = !!(window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.WALLET_VIA_SERVER);
    if (viaServer) {
        try {
            const call = (typeof skh.wrapCallable === "function" ? skh.wrapCallable("haipayReleaseLink") : skh.httpsCallable(skh.getFunctions(skh.fApp, "europe-west1"), "haipayReleaseLink"));
            const res = await call({ linkId: docId });
            const d = res && res.data;
            if (d && d.ok) {
                alert(T('sp_contract_done_server', "Congratulations! Contract completed safely (SERVER). Money sent to the seller."));
                window.trackSokoPayTransaction(); // Refresh taarifa
                return;
            }
            throw new Error((d && d.message) || 'Server ya escrow imekataa muamala huu.');
        } catch (e) {
            // [FUNCTIONS RESILIENCE] endpoint haipo/haipatikani -> ujumbe wa maana
            // (SokoPay haijatoa pesa yoyote), si "INTERNAL" mbichi.
            var msg = (window.skhFnErrText && window.skhFnErrText(e, 'sokopay')) || (e && e.message) || 'Imeshindwa.';
            alert(T('sp_complete_fail_server', "Could not complete (server): ") + msg);
            return;
        }
    }

    try {
        const linkRef = skh.doc(skh.db, "sokopay_links", docId);
        
        // 1. Badili hali ya mkataba kuwa completed
        await skh.updateDoc(linkRef, { status: "completed" });

        // 2. Toa pesa kwa muuzaji (itakayobaki baada ya kutoa carrier share na platform fee)
        // [ADMIN PAYMENTS SWITCH] Ada ya kamisheni imezimwa = FREE -> kamisheni 0.
        const platformFee = skh.paymentGate('commission') ? totalAmount * 0.05 : 0; // 5% Platform Fee
        const sellerEarned = totalAmount - (platformFee + carrierShare);

        const sellerQuery = await skh.getDocs(skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", sellerId)));
        if (!sellerQuery.empty) {
            const sellerDocId = sellerQuery.docs[0].id;
            // [PHASE 5.2b] kituo kimoja — skhWalletAdjust (legacy 1:1 geti likiwa off; server+ledger ikiwa on)
            await window.skhWalletAdjust(skh.doc(skh.db, "users", sellerDocId), sellerEarned, { type: 'escrow_release', ledgerKey: 'spman_link_' + linkRef.id, note: 'Kukamilisha mkataba wa SokoPay kwa mkono' });

            // Mtumie muuzaji taarifa
            await skh.addDoc(skh.collection(skh.db, "notifications"), {
                userId: sellerId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.contractCompleted',
                params: { amount: sellerEarned.toLocaleString() },
                title: " SokoPay: Mkataba Umekamilika!",
                body: `Mteja amethibitisha kukamilika kwa mkataba wako. TSh ${sellerEarned.toLocaleString()} imewekwa kwenye wallet yako.`,
                createdAt: new Date().toISOString(),
                read: false
            });
        }

        // 3. Rekodi makusanyo ya platform revenue
        await skh.addDoc(skh.collection(skh.db, "adminRevenue"), {
            type: "sokopay_commission",
            amount: platformFee,
            date: new Date().toISOString()
        });

        alert(T('sp_contract_done', "Congratulations! Contract completed safely and money sent to the seller."));
        window.trackSokoPayTransaction(); // Refresh taarifa
    } catch(err) {
        alert(T('sp_complete_fail', "Could not complete: ") + err.message);
    }
};

window.raiseSokoPayLinkDispute = async function(docId) {
    const reason = await skhPrompt("Andika sababu ya kufungua mgogoro huu kwa ufupi (Ushahidi):");
    if(!reason) return alert(T('sp_dispute_reason', "You must write a reason to open a dispute."));

    try {
        const linkRef = skh.doc(skh.db, "sokopay_links", docId);
        await skh.updateDoc(linkRef, {
            status: "disputed",
            disputeReason: reason,
            disputedAt: new Date().toISOString()
        });

        alert(T('sp_dispute_opened', "Dispute opened and your SokoPay account has been locked! Admin will review your complaint now."));
        window.trackSokoPayTransaction();
    } catch(err) {
        alert(T('sp_error', "Error: ") + err.message);
    }
};

window.sokopayActiveContractsCache = [];

const originalRenderSokoPayActiveOverview = window.renderSokoPayActiveOverview;

window.renderSokoPayActiveOverview = function(contractsArray) {
    // Hifadhi data zote kwenye cache ya kimataifa kabla ya kuchora
    window.sokopayActiveContractsCache = contractsArray;
    
    // Piga kadi za kawaida za uchoraji
    if (typeof originalRenderSokoPayActiveOverview === 'function') {
        originalRenderSokoPayActiveOverview(contractsArray);
    }
};

window.filterActiveOverview = function(filterType) {
    const container = document.getElementById('spActiveOverviewList');
    if (!container) return;

    // Badilisha rangi ya kitufe kilichobonyezwa ili kionekane kuwa kipo hai (Active)
    const tabButtons = document.querySelectorAll('#spActiveOverviewTabs .pos-quick-btn');
    tabButtons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes(`'${filterType}'`)) {
            btn.style.background = 'var(--primary-blue, #00509d)';
            btn.style.color = 'white';
        } else {
            btn.style.background = '#F1F5F9';
            btn.style.color = '#1e293b';
        }
    });

    // Kama amechagua 'all', onyesha mikataba yote kutoka kwenye Cache
    if (filterType === 'all') {
        window.renderSokoPayActiveOverview(window.sokopayActiveContractsCache);
        return;
    }

    // Kuchuja kulingana na kundi (Type) lililochaguliwa
    const filteredList = window.sokopayActiveContractsCache.filter(c => {
        const type = (c.contractType || c.collectionName || 'product').toLowerCase();
        
        if (filterType === 'product') return type.includes('product');
        if (filterType === 'service') return type.includes('service');
        if (filterType === 'job') return type.includes('job');
        if (filterType === 'transport') return (type.includes('transport') || type.includes('logistics') || type.includes('driver'));
        
        return false;
    });

    // Kuchora upya kadi zilizochujwa
    if (filteredList.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 25px; color: gray;"> <span style="font-size: 24px;"></span> <p style="font-size:13px; margin-top: 5px;">${T('sp_no_contracts', 'No active contracts of type {t} at the moment.', { t: filterType.toUpperCase() })}</p> </div>`;
        return;
    }

    // Kuchora kadi zilizochujwa
    let html = '';
    filteredList.forEach(c => {
        const amt = parseFloat(c.price || c.amount || 0);
        const type = c.contractType || c.collectionName || 'product';
        
        let typeLabel = "PRODUCT ORDER";
        let icon = "";
        let btnText = "Track Order";
        let btnClick = `window.openProduct('${c.id}')`;
        let statusColor = "#03509d";

        if (type.includes("service")) {
            typeLabel = "SERVICE ORDER"; icon = ""; btnText = "View Details"; statusColor = "#10b981";
        } else if (type.includes("job")) {
            typeLabel = "JOB CONTRACT"; icon = ""; btnText = "View Contract"; statusColor = "#8B5CF6";
        } else if (type.includes("transport") || type.includes("logistics")) {
            typeLabel = "TRANSPORT BOOKING"; icon = ""; btnText = "View Ticket"; statusColor = "#F59E0B";
        }

        html += `
            <div style="background: white; border: 1px solid #E2E8F0; padding: 15px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);"> <div style="display: flex; gap: 12px; align-items: center;"> <div style="width: 42px; height: 42px; background: #F8FAFC; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">${icon}</div> <div> <span style="font-size:12px; background: #F1F5F9; color: ${statusColor}; padding: 2px 8px; border-radius: 10px; font-weight: bold; text-transform: uppercase;">${typeLabel}</span> <b style="font-size: 13px; color: #0F172A; display: block; margin-top: 3px;">${skh.skhEscape(c.title || c.itemTitle)}</b> <small style="color: gray; font-size:12.5px; display: block;">${T('sp_status', 'Status:')} <b style="color: ${statusColor};">${c.status.toUpperCase()}</b></small> </div> </div> <div style="text-align: right;"> <b style="display: block; color: var(--terracotta); font-size: 13px; margin-bottom: 5px;">TZS ${amt.toLocaleString()}</b> <button type="button" onclick="${btnClick}" style="padding: 6px 12px; background: #e2e8f0; color: #475569; border: none; border-radius: 8px; font-weight: bold; font-size:12.5px; cursor: pointer;">${btnText}</button> </div> </div>`;
    });

    container.innerHTML = html;
};

const originalOpenProduct = window.openProduct;

window.openProduct = async function(id, manualCollection = null) {
    // Kagua kwanza kama ID hii ipo kwenye orodha ya SokoPay links
    const foundSokoPay = window.sokopayActiveContractsCache.find(c => c.id === id);

    if (foundSokoPay && foundSokoPay.isSokoPay) {
        // Ikiwa ni mkataba wa SokoPay, uonyeshe kwenye tracking tab moja kwa moja kwa urahisi
        window.closeModals();
        window.showForm('sokopayForm');
        window.toggleSokoPayTab('track');
        
        const trackInput = document.getElementById('spCodeInputTrack');
        if (trackInput) {
            trackInput.value = foundSokoPay.code;
            window.trackSokoPayTransaction(); // Anza kutafuta na kuonyesha data live
        }
        return;
    }

    // Kama sio SokoPay link ya direct, tumia mfumo wa kawaida wa bidhaa za soko
    if (typeof originalOpenProduct === 'function') {
        originalOpenProduct(id, manualCollection);
    }
};

window.openSokoPayDeposit = function() {
    if (!skh.requireAuth()) return;
    
    const depositModal = document.getElementById('sokopayDepositModal');
    if (depositModal) {
        depositModal.style.display = 'flex';
        
        // Jaza namba ya simu ya sasa automatically
        const phoneInput = document.getElementById('spDepositPhone');
        if (phoneInput) {
            phoneInput.value = skh.currentUserData?.paymentAccount || skh.currentUserData?.phone || '';
        }
    }
};

const originalToggleSokoPayTab = window.toggleSokoPayTab;

window.toggleSokoPayTab = function(tab) {
    // [SOKOPAY MVP] Orodha ya maeneo yanayopatikana (mvp-simplified)
    const areas = [ 'spOverviewArea', 'spCreateArea', 'spPayArea', 'spTrackArea', 'spTransactionsArea', 'spHelpArea', 'spSettingsArea', 'spDisputesArea', 'spLipaArea'
    ];
    
    // Links za sidebar ya kushoto
    const tabButtons = document.querySelectorAll('#sokopayLeftSidebar .sp-sidebar-link');

    // Ficha zote na uonyeshe tab inayotakiwa tu
    areas.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = (id === 'sp' + tab.charAt(0).toUpperCase() + tab.slice(1) + 'Area') ? 'block' : 'none';
        }
    });

    // Weka alama ya active kwenye sidebar link husika
    tabButtons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes(`'${tab}'`)) {
            btn.classList.add('active');
            btn.style.background = '#00509d';
            btn.style.color = 'white';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = 'rgba(255, 255, 255, 0.65)';
        }
    });

    // [SOKOPAY 2026-09] Sehemu zenye maudhui mapana (Disputes/Settings) huficha
    // paneli ya kulia ili zisiwe finyu (blockage) na maandishi yasisongwe.
    const spRight = document.getElementById('sokopayRightSidebar');
    if (spRight) spRight.style.display = (tab === 'disputes' || tab === 'settings') ? 'none' : '';

    // [SOKOPAY MVP] Mabadiliko kulingana na tab
    if (tab === 'overview') {
        if (typeof window.syncSokoPayRealtimeData === 'function') {
            window.syncSokoPayRealtimeData();
        }
    } else if (tab === 'transactions') {
        if (typeof (window.renderSokoPayTransactions) === 'function') {
            window.renderSokoPayTransactions();
        }
    } else if (tab === 'create') {
        // [SOKOPAY] Onyesha orodha ya token/linki/QR zilizohifadhiwa
        if (typeof (window.spRenderSavedItems) === 'function') {
            window.spRenderSavedItems();
        }
    } else if (tab === 'disputes') {
        // [SOKOPAY 2026-09] Jaza kesi halisi za migogoro (kabla: ilibaki "Inasoma..." milele).
        if (typeof (window.loadSokoPayInternalDisputes) === 'function') {
            window.loadSokoPayInternalDisputes();
        }
    } else if (tab === 'settings') {
        if (typeof (window.loadSokoPayInternalSettingsData) === 'function') {
            window.loadSokoPayInternalSettingsData();
        }
    }
};

window.toggleSokoPayInternalSetupFields = function() {
    const type = document.getElementById('spSettingsPayType').value;
    const mobileDiv = document.getElementById('spSetMobileFields');
    const bankDiv = document.getElementById('spSetBankFields');
    const cardDiv = document.getElementById('spSetCardFields');

    if (mobileDiv) mobileDiv.style.display = (type === 'Mobile') ? 'block' : 'none';
    if (bankDiv) bankDiv.style.display = (type === 'Bank') ? 'block' : 'none';
    if (cardDiv) cardDiv.style.display = (type === 'Card') ? 'block' : 'none';
};

window.loadSokoPayInternalSettingsData = function() {
    if (!skh.currentUserData) return;

    const pType = skh.currentUserData.paymentType || '';
    const pAccount = skh.currentUserData.paymentAccount || '';
    const pName = skh.currentUserData.paymentName || '';
    
    const typeSelect = document.getElementById('spSettingsPayType');
    const btnSave = document.getElementById('btnSpSavePayment');
    const btnEdit = document.getElementById('btnSpEditPayment');

    if (typeSelect) typeSelect.value = pType;
    window.toggleSokoPayInternalSetupFields();

    // Kama tayari mteja alishasajili akaunti ya malipo, weka 'Locked' kwa usalama wake
    if (pType && pAccount) {
        window.lockSokoPayInternalSettings(true);
        if (btnSave) btnSave.style.display = 'none';
        if (btnEdit) btnEdit.style.display = 'block';

        // Jaza data kulingana na aina
        if (pType === 'Mobile') {
            document.getElementById('spSetMobileNumber').value = pAccount;
            document.getElementById('spSetMobileName').value = pName;
        } else if (pType === 'Bank') {
            document.getElementById('spSetBankNumber').value = pAccount;
            document.getElementById('spSetBankName').value = pName;
        } else if (pType === 'Card') {
            document.getElementById('spSetCardNumber').value = pAccount;
            document.getElementById('spSetCardName').value = pName;
        }
    } else {
        window.lockSokoPayInternalSettings(false);
        if (btnSave) btnSave.style.display = 'block';
        if (btnEdit) btnEdit.style.display = 'none';
    }

};

window.lockSokoPayInternalSettings = function(isLocked) {
    const pm = document.getElementById('spSettingsArea');
    if (!pm) return;
    const inputs = pm.querySelectorAll('input, select');
    inputs.forEach(inp => {
        // Tuhakikishe namba za dharura za SOS hazigandishwi (mteja anaweza kuzibadili mda wowote)
        if (inp.id !== 'spTrustPhone1' && inp.id !== 'spTrustPhone2') {
            inp.disabled = isLocked;
            inp.style.opacity = isLocked ? '0.8' : '1';
        }
    });
};

window.enableSokoPayInternalPaymentEdit = function() {
    window.lockSokoPayInternalSettings(false);
    document.getElementById('btnSpSavePayment').style.display = 'block';
    document.getElementById('btnSpEditPayment').style.display = 'none';
    alert(T('sp_edit_payment_info', "You can now edit your payment details. When done, tap SAVE ACCOUNT."));
};

window.saveSokoPayInternalPaymentInfo = async function() {
    if (!skh.currentUser) return;

    const type = document.getElementById('spSettingsPayType').value;
    let accountNum = '';
    let accountName = '';

    if (type === 'Mobile') {
        accountNum = document.getElementById('spSetMobileNumber').value.trim();
        accountName = document.getElementById('spSetMobileName').value.trim();
    } else if (type === 'Bank') {
        accountNum = document.getElementById('spSetBankNumber').value.trim();
        accountName = document.getElementById('spSetBankName').value.trim();
    } else if (type === 'Card') {
        accountNum = document.getElementById('spSetCardNumber').value.trim();
        accountName = document.getElementById('spSetCardName').value.trim();
    }

    if (!type || !accountNum || !accountName) {
        alert(T('sp_fill_payment', "Fill in the payment method and account/line number correctly!"));
        return;
    }

    const btn = document.getElementById('btnSpSavePayment');
    btn.innerHTML = " Inahifadhi kiofisi...";
    btn.disabled = true;

    try {
        await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUserData.docId), {
            paymentType: type,
            paymentAccount: accountNum,
            paymentName: accountName,
            paymentSetupComplete: true
        });

        alert(T('sp_account_saved', "SokoPay Payment Account saved safely to your profile!"));
        window.loadSokoPayInternalSettingsData(); // Reload na kuji-lock automatically
    } catch (err) {
        alert(T('sp_account_fail', "Could not save account: ") + err.message);
    } finally {
        btn.innerHTML = " HIFADHI AKAUNTI YA MALIPO";
        btn.disabled = false;
    }
};

window.loadSokoPayInternalDisputes = async function() {
    const container = document.getElementById('spDisputesList');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:gray; font-size:13px;"> Inasoma kesi za migogoro...</p>';

    try {
        // Query migogoro ya mtumiaji kama Mnunuzi au Muuzaji
        const qBuyer = skh.query(skh.collection(skh.db, "orders"), skh.where("buyerId", "==", skh.currentUser.uid), skh.where("status", "==", "disputed"));
        const qSeller = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", skh.currentUser.uid), skh.where("status", "==", "disputed"));

        const [snapB, snapS] = await Promise.all([skh.getDocs(qBuyer), skh.getDocs(qSeller)]);
        
        let disputes = [];
        snapB.forEach(docSnap => disputes.push({ id: docSnap.id, role: "Mnunuzi", ...docSnap.data() }));
        snapS.forEach(docSnap => disputes.push({ id: docSnap.id, role: "Muuzaji", ...docSnap.data() }));

        if (disputes.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:30px; color:gray;"> <span style="font-size:36px;"></span> <p style="font-size:13px; margin-top:5px;">Huna kesi yoyote ya mgogoro iliyo hai hivi sasa. Kila kitu kipo salama na shwari!</p> </div>`;
            return;
        }

        let html = '';
        disputes.forEach(d => {
            const amt = parseFloat(d.amount || d.price || 0);
            html += `
                <div style="background:#FFF5F5; border-left:5px solid #EF4444; padding:15px; border-radius:12px; border-top:1px solid #FECACA; border-right:1px solid #FECACA; border-bottom:1px solid #FECACA; text-align:left;"> <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"> <span style="font-size:12px; background:#FECACA; color:#EF4444; padding:2px 8px; border-radius:10px; font-weight:bold;">DISPUTED (Upo kama ${d.role})</span> <small style="color:gray;">${new Date(d.date || d.createdAt).toLocaleDateString()}</small> </div> <b style="font-size:14px; color:#0F172A; display:block; margin-bottom:5px;"> Mkataba: ${skh.skhEscape(d.itemTitle || d.title)}</b> <span style="display:block; font-size:13px; color:#475569;">Kiasi kilichogandishwa: <b style="color:red;">TZS ${amt.toLocaleString()}</b></span> <p style="background:white; padding:8px; border-radius:6px; font-size:13px; color:#ef4444; margin-top:8px; border:1px solid #fecaca; line-height:1.4;"> <b>Sababu ya Mgogoro:</b> ${d.disputeReason || 'N/A'}
                    </p> <small style="display:block; color:gray; font-size:12.5px; margin-top:8px;">Uamuzi wa kesi hii utafanywa na msimamizi (Admin) baada ya kupitia ushahidi.</small> </div>`;
        });

        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = '<p style="color:red; text-align:center; font-size:13px;">Hitilafu ya kupakia kesi.</p>';
    }
};

window.processSokoPayDeposit = async function() {
    const amountVal = parseFloat(document.getElementById('spDepositAmount').value) || 0;
    const provider = document.getElementById('spDepositProvider').value;
    let phone = document.getElementById('spDepositPhone').value.trim();

    if (amountVal < 100) {
        alert(T('sp_min_deposit', "The minimum deposit is TSh 100!"));
        return;
    }

    if (!phone) {
        alert(T('sp_enter_phone', "Enter the phone number to pay with!"));
        return;
    }

    const btn = document.getElementById('btnSubmitSpDeposit');
    const originalText = btn.innerHTML;
    btn.innerHTML = " INATUMA OMBI LA USSD PUSH...";
    btn.disabled = true;

    // Badilisha format ya namba kwenda 255...
    if (phone.startsWith('0')) {
        phone = '255' + phone.substring(1);
    }

    alert(T('sp_redirect_pesapal', 'Redirecting to PesaPal to safely pay TSh {a}...', { a: amountVal.toLocaleString() }));

    try {
        // [PesaPal] Hosted checkout — wallet itaongezwa baada ya kurudi (17-pesapal-return)
        const dep = await window.skhPesaPalPay({
            amount: amountVal,
            kind: 'deposit',
            phone: phone,
            provider: provider,
            description: 'SokoPay Wallet Top-Up',
            context: { docId: (skh.currentUserData && skh.currentUserData.docId) || null, uid: skh.currentUser.uid }
        });

        if (!dep.ok) {
            alert(T('sp_process_error', "Processing error: ") + (dep.error || T('sp_payment_failed', "Payment request failed. Try again.")));
        }
        // Akiwa amefanikiwa, ukurasa unaelekeza PesaPal; salio linaongezwa akirudi.

    } catch (e) {
        alert(T('sp_deposit_error', "Error depositing money: ") + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.switchProductSubTab = function(subTabName, element) {
    document.querySelectorAll('#spProductsArea .sp-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#475569';
        btn.style.boxShadow = 'none';
    });

    if (element) {
        element.classList.add('active');
        element.style.background = 'white';
        element.style.color = '#00509d';
        element.style.boxShadow = '0 4px 10px rgba(0,0,0,0.05)';
    }

    const subWorkspace = document.getElementById('productSubTabContent');
    if(!subWorkspace) return;

    if (subTabName === 'active') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Active Product Payments (Mikataba Hai)</b> <div style="display:flex; flex-direction:column; gap:10px;"> <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; text-align:left;"> <div> <b style="font-size:13px; color:#00509d;">Mkataba: #CTR-9921 - Samsung 55" Smart TV</b><br> <small style="color:gray;">Seller: TechWorld Ltd | Njia: SokoPay Escrow Standard</small> </div> <span style="font-size:12.5px; background:#fef3c7; color:#d97706; padding:3px 10px; border-radius:10px; font-weight:bold; text-transform:uppercase;"> Awaiting Delivery</span> </div> <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; text-align:left;"> <div> <b style="font-size:13px; color:#00509d;">Mkataba: #CTR-9918 - Double Door Refrigerator</b><br> <small style="color:gray;">Seller: Home Appliances | Njia: SokoPay Escrow Express</small> </div> <span style="font-size:12.5px; background:#e0f2fe; color:#03509d; padding:3px 10px; border-radius:10px; font-weight:bold; text-transform:uppercase;"> In Transit</span> </div> </div> `;
    } 
    else if (subTabName === 'tracking') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Live Shipment Tracking (#CTR-9918)</b> <div class="sp-timeline" style="margin-left: 15px; border-left: 2px solid #cbd5e1; padding-left: 20px; position: relative; margin-bottom: 25px;"> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 20px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">● Step 1: Seller Dispatch (A1)</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 3px 0 0 0;">Mzigo umekabidhiwa kwa msafirishaji salama dukani kwa kutumia Token A.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 20px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">● Step 2: In Transit (Safarini)</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 3px 0 0 0;">Shehena ipo njiani kuelekea kituo cha kati (Hub).</p> </div> <div class="sp-timeline-item" style="position: relative; margin-bottom: 20px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#64748b;">○ Step 3: At Local Hub (Dodoma)</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 3px 0 0 0;">Mzigo utapokelewa na kuwekewa alama ukiwasili.</p> </div> <div class="sp-timeline-item" style="position: relative;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#64748b;">○ Step 4: Final Handover</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 3px 0 0 0;">Mpokeaji atapeana Token C na kukamilisha mzunguko.</p> </div> </div> <div style="background: #fffbeb; border: 1px solid #f59e0b; padding: 15px; border-radius: 12px; text-align: left;"> <b style="color: #b45309; font-size: 12px; display: block; margin-bottom: 5px;">Kama hakuna Logistics (Digital Delivery / Store Hold):</b> <b style="font-size: 14px; color: #0f172a; display: block;">${T('sp_payment_protected', 'Payment Protected')}</b> <small style="color: #475569; display: block; margin-top: 2px;">Waiting Buyer Confirmation • Estimated Auto Release: 2 Days</small> </div> `;
    } 
    else if (subTabName === 'escrow') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> SokoPay Escrow Protection Status</b> <div style="display: grid; grid-template-columns: 1fr 1fr; gap:15px; text-align: left;"> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:15px; border-radius:12px;"> <small style="color:#065f46; font-weight:bold;">${T('sp_amount_protected', 'Amount Protected')}</small><br> <b style="font-size:18px; color:#10b981; display:block; margin-top:5px;">450,000 TZS</b> <small style="color:gray; font-size:12px; display:block; margin-top:3px;">Status: Funds Protected by SokoPay.</small> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"> <small style="color:gray; font-weight:bold;">${T('sp_release_condition', 'Release Condition')}</small><br> <b style="font-size:14px; color:#0f172a; display:block; margin-top:5px;">${T('sp_buyer_confirmation', 'Buyer Confirmation')}</b> <small style="color:gray; font-size:12px; display:block; margin-top:3px;">Auto-Release: 2 Days post verification.</small> </div> </div> `;
    } 
    else if (subTabName === 'documents') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Financial Documents & receipts</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Nyaraka zote zipo hapa (Invoice, Receipt, Delivery Note, Warranty, Images, Videos):</p> <div style="display:flex; flex-direction:column; gap:8px;"> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> SokoPay_Invoice_CTR-9921.pdf</span> <button onclick="alert(T('sp_loading_file', 'Loading file...'))" class="pos-quick-btn">Download</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Secure_Receipt_CTR-9918.pdf</span> <button onclick="alert('Inapakia faili...')" class="pos-quick-btn">Download</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Delivery_Note_&_Warranty.pdf</span> <button onclick="alert('Inapakia faili...')" class="pos-quick-btn">Download</button> </div> </div> `;
    } 
    else if (subTabName === 'confirmations') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Confirmations (Matendo ya Kuidhinisha)</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Fanya maamuzi sahihi juu ya shehena uliyopokea:</p> <div style="background:#fffbeb; border:1px solid #fde68a; padding:15px; border-radius:12px; text-align:left; display:flex; justify-content:space-between; align-items:center;"> <div> <b style="font-size:13px;">Oda: #CTR-9918 - Refrigerator</b> <small style="color:gray; display:block; margin-top:2px;">Kiasi cha Payout: TZS 450,000 | Muuzaji: Home Appliances</small> </div> <div style="display:flex; gap:8px;"> <button onclick="window.confirmEscrowOrder()" style="padding:8px 15px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Confirm Delivery</button> <button onclick="alert(T('sp_cargo_rejected', 'Cargo rejected and returned to the transporter.'))" style="padding:8px 15px; background:#ef4444; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> ${T('sp_reject_delivery', 'Reject Delivery')}</button> <button onclick="window.disputeEscrowOrder()" style="padding:8px 15px; background:#f59e0b; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Report Issue</button> </div> </div> `;
    } 
    else if (subTabName === 'history') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> SokoPay Product Life-Cycle Timeline</b> <div class="sp-timeline" style="margin-left: 15px; border-left: 2px solid #cbd5e1; padding-left: 20px; position: relative;"> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">1. Payment Created</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mkataba wako unaanzishwa na kulipiwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">2. Funds Locked</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Pesa zimehifadhiwa salama kwenye SokoPay Escrow.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">3. Seller Accepted</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Muuzaji amethibitisha oda na kuandaa mzigo.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">4. Shipment Started</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mzigo umeanza safari na Token A imeskaniwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">5. Hub A -> Hub B</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mzigo umepokelewa vituo vya kati na Token B imethibitishwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">6. Delivered & Confirmed</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mteja amepokea mzigo na kutoa Token C.</p> </div> <div class="sp-timeline-item active" style="position: relative;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold; color:#10b981;">7. Payment Released</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Malipo yametumwa kwa muuzaji kikamilifu.</p> </div> </div> `;
    }
};

window.switchServiceSubTab = function(subTabName, element) {
    document.querySelectorAll('#spServicesArea .sp-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#475569';
        btn.style.boxShadow = 'none';
    });

    if (element) {
        element.classList.add('active');
        element.style.background = 'white';
        element.style.color = '#00509d';
        element.style.boxShadow = '0 4px 10px rgba(0,0,0,0.05)';
    }

    const subWorkspace = document.getElementById('serviceSubTabContent');
    if(!subWorkspace) return;

    if (subTabName === 'contracts') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Active Service Contracts</b> <div id="spContractsRealtime" style="display:flex; flex-direction:column; gap:10px;"><div style="color:#94a3b8; font-size:12.5px; text-align:center; padding:16px 0;">Inapakia mikataba yako halisi…</div></div> `;
        // [REAL DATA 2026-09] Mikataba halisi kutoka orders escrow (kuacha mfano wa uongo "John Mwangi / 850,000").
        window.skhLoadSokoPayContracts(function (list) {
            const box = document.getElementById('spContractsRealtime');
            if (!box) return;
            if (!list || list.length === 0) {
                box.innerHTML = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; padding:18px; border-radius:12px; text-align:center; color:#94a3b8; font-size:12.5px;">Bado huna mkataba wowote wa huduma ulio amilifu kwenye SokoPay. Mikataba inapotengenezwa itaonekana hapa.</div>`;
                return;
            }
            box.innerHTML = list.map(c => `
                <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; text-align:left; flex-wrap:wrap; gap:8px;"> <div> <b style="font-size:13px; color:#00509d;">${(c.itemTitle || 'Huduma').replace(/</g,'&lt;')}</b><br> <small style="color:gray;">Provider: ${(c.sellerName || '—').replace(/</g,'&lt;')} | Customer: ${(c.buyerName || '—').replace(/</g,'&lt;')}</small><br> <small style="color:gray;">Contract Amount: <b style="color:#00509d;">TZS ${Number(c.amount || 0).toLocaleString()}</b> | Status: ${(c.status || 'held')}</small> </div> <span style="font-size:12.5px; background:#ecfdf5; color:#10b981; padding:4px 12px; border-radius:10px; font-weight:bold; text-transform:uppercase;">Protected:  SokoPay</span> </div>`).join('');
        });
    }
    else if (subTabName === 'milestones') {
        // [REAL DATA 2026-09] Hatua halisi za mikataba yako (bado hakuna iliyojazwa → ujumbe wa kweli)
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Milestones Progress Tracker</b> <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; padding:22px; text-align:center; color:#64748b; font-size:12.5px;"> Bado hakuna mkataba unaoendelea wa huduma wenye hatua.<br><small style="color:#94a3b8;">Hatua za kazi na uthibitisho wataonekana hapa mkataba wako ukiwa amilifu.</small> </div> `;
    }
    else if (subTabName === 'proof') {
        // [REAL DATA 2026-09] Ushahidi halisi uliopandishwa (bado haujawahi)
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Proof Center (Ushahidi wa Kazi)</b> <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; padding:22px; text-align:center; color:#64748b; font-size:12.5px;"> Hakuna ushahidi wa kazi uliopakiwa bado.<br><small style="color:#94a3b8;">Picha, video na ripoti za kazi halisi zitasimama hapa zinapopandishwa na mtoa huduma.</small> </div> `;
    }
    else if (subTabName === 'payments') {
        // [REAL DATA 2026-09] Vipimo halisi kutoka escrow orders zako (protected vs released)
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Payments Breakdown</b> <div style="display: grid; grid-template-columns: 1fr 1fr; gap:15px; text-align: left;"> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:15px; border-radius:12px;"> <small style="color:#065f46; font-weight:bold;">Amount Protected</small><br> <b id="spProtectedAmount" style="font-size:18px; color:#10b981; display:block; margin-top:5px;">TZS …</b> <small style="color:gray; font-size:12px; display:block; margin-top:3px;">Pesa zipo kwenye ulinzi wa SokoPay.</small> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"> <small style="color:gray; font-weight:bold;">${T('sp_released_remaining', 'Released & Remaining')}</small><br> <b id="spReleasedAmount" style="font-size:14px; color:#0f172a; display:block; margin-top:5px;">Released: TZS …</b> <small id="spRemainingAmount" style="color:gray; font-size:13px; display:block; margin-top:2px;">Remaining: TZS …</small> </div> </div> `;
        window.skhLoadSokoPayContracts(function (list) {
            let protected_ = 0, released = 0;
            (list || []).forEach(c => {
                const amt = Number(c.amount) || 0;
                if (c.status === 'released' || c.status === 'completed' || c.status === 'done') released += amt;
                else protected_ += amt; // held/in escrow
            });
            const pEl = document.getElementById('spProtectedAmount');
            const rEl = document.getElementById('spReleasedAmount');
            const rmEl = document.getElementById('spRemainingAmount');
            if (pEl) pEl.textContent = 'TZS ' + protected_.toLocaleString();
            if (rEl) rEl.textContent = 'Released: TZS ' + released.toLocaleString();
            if (rmEl) rmEl.textContent = 'Remaining: TZS ' + protected_.toLocaleString() + (protected_ > 0 ? ' (Auto Release Active)' : '');
        });
    } 
    else if (subTabName === 'confirmations') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Service Confirmations</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Uidhinishaji wa hatua ya kazi (Milestones):</p> <div style="background:#fffbeb; border:1px solid #fde68a; padding:15px; border-radius:12px; text-align:left; display:flex; justify-content:space-between; align-items:center;"> <div> <b style="font-size:13px;">Service: Website Development</b> <small style="color:gray; display:block; margin-top:2px;">Milestone 2 (Frontend) | Payout: TZS 150,000</small> </div> <div style="display:flex; gap:8px;"> <button onclick="window.confirmEscrowOrder()" style="padding:8px 12px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Approve Milestone</button> <button onclick="alert(T('sp_work_rejected', 'Work rejected and returned to the professional.'))" style="padding:8px 12px; background:#ef4444; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> ${T('sp_reject', 'Reject')}</button> <button onclick="window.disputeEscrowOrder()" style="padding:8px 12px; background:#f59e0b; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Raise Issue</button> <button onclick="alert(T('sp_revision_sent', 'Revision request sent.'))" style="padding:8px 12px; background:#0f172a; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> ${T('sp_request_revision', 'Request Revision')}</button> </div> </div> `;
    } 
    else if (subTabName === 'history') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Service Life-Cycle Timeline</b> <div class="sp-timeline" style="margin-left: 15px; border-left: 2px solid #cbd5e1; padding-left: 20px; position: relative;"> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">1. Contract Created</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mkataba wa huduma umesainiwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">2. Payment Protected</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Pesa zimefungwa kwenye SokoPay Escrow.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">3. Work Started</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mtaalamu ameanza utekelezaji.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">4. Milestone 1 Verified</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Hatua ya kwanza imekaguliwa na kulipwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">5. Milestone 2 Submitted</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Hatua ya pili ipo chini ya ukaguzi.</p> </div> <div class="sp-timeline-item" style="position: relative;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold; color:#64748b;">6. Completed -> Funds Released</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Malipo ya mwisho kuachiliwa.</p> </div> </div> `;
    }
};

window.switchLogisticsSubTab = function(subTabName, element) {
    document.querySelectorAll('#spLogisticsArea .sp-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#475569';
        btn.style.boxShadow = 'none';
    });

    if (element) {
        element.classList.add('active');
        element.style.background = 'white';
        element.style.color = '#00509d';
        element.style.boxShadow = '0 4px 10px rgba(0,0,0,0.05)';
    }

    const subWorkspace = document.getElementById('logisticsSubTabContent');
    if(!subWorkspace) return;

    if (subTabName === 'shipments') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Active Shipments (Shehena Zilizopo Safarini)</b> <div id="spShipmentsRealtime" style="display:flex; flex-direction:column; gap:10px;"><div style="color:#94a3b8; font-size:12.5px; text-align:center; padding:16px 0;">Inapakia shehena zako halisi…</div></div> `;
        // [REAL DATA 2026-09] Shehena halisi kutoka collection "shipments" (uongo wa SHP-2026-001 umeondolewa)
        window.skhLoadSokoPayShipments(function (list) {
            const box = document.getElementById('spShipmentsRealtime');
            if (!box) return;
            if (!list || list.length === 0) {
                box.innerHTML = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; padding:18px; border-radius:12px; text-align:center; color:#94a3b8; font-size:12.5px;">Bado huna shehena yoyote kwenye usafiri hivi sasa. Shehena halisi zitakuwepo hapa.</div>`;
                return;
            }
            box.innerHTML = list.map(s => `
                <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; text-align:left; flex-wrap:wrap; gap:8px;"> <div> <b style="font-size:13px; color:#0284c7;">Shipment: ${(s.trackingCode || s.id || '').replace(/</g,'&lt;')}</b><br> <small style="color:gray;">Sender: ${(s.senderName || '—').replace(/</g,'&lt;')} | Receiver: ${(s.receiverName || '—').replace(/</g,'&lt;')} | Current Holder: ${(s.currentHolder || '—').replace(/</g,'&lt;')}</small><br> <small style="color:gray;">Contract Number: ${(s.contractNo || '—').replace(/</g,'&lt;')} | Amount Protected: <b style="color:#00509d;">TZS ${Number(s.amount || 0).toLocaleString()}</b></small> </div> <span style="font-size:12.5px; background:#e0f2fe; color:#03509d; padding:4px 12px; border-radius:10px; font-weight:bold; text-transform:uppercase;">Status: ${(s.status || 'In Transit')}</span> </div>`).join('');
        });
    }
    else if (subTabName === 'live') {
        // [REAL DATA 2026-09] Live track halisi ya shehena inayuofuatilia (kuacha timeline ya uongo)
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Live Tracking & Route GPS</b> <div id="spLiveTrackingBox" style="display:flex; flex-direction:column; gap:10px;"><div style="color:#94a3b8; font-size:12.5px; text-align:center; padding:16px 0;">Inatafuta shehena inayofuatiliwa live…</div></div> `;
        window.skhLoadSokoPayShipments(function (list) {
            const box = document.getElementById('spLiveTrackingBox');
            if (!box) return;
            const live = (list || []).filter(s => /transit|riding|moving|delivery/i.test(String(s.status || '')));
            if (live.length === 0) {
                box.innerHTML = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; padding:18px; border-radius:12px; text-align:center; color:#94a3b8; font-size:12.5px;">Hakuna shehena yoyote inayofuatiliwa live kwa sasa.</div>`;
                return;
            }
            box.innerHTML = live.map(s => `
                <div style="display:flex; flex-direction:column; gap:8px; text-align:left; background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #e2e8f0; font-size:12px;"> <span> Tracking: <b style="color:#00509d;">${(s.trackingCode || s.id || '').replace(/</g,'&lt;')}</b></span> <span> Route: <b>${((s.from || '') + ' -> ' + (s.to || '')).replace(/</g,'&lt;')}</b></span> <span> Current Handler: <b style="color:#10b981;">${(s.currentHolder || '—').replace(/</g,'&lt;')}</b></span> <span> Status: <b>${(s.status || 'In Transit')}</b></span> </div>`).join('');
        });
    } 
    else if (subTabName === 'tokens') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> SokoPay Multi-Token Handover Center</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Kila handover: Generate Token -> Scan Token -> Receive Token -> Confirm Transfer.</p> <div style="background:#fffbeb; border:1px solid #fde68a; padding:20px; border-radius:14px; text-align:left; font-size:12px; margin-bottom:20px;"> <b style="color:#b45309; display:block; margin-bottom:8px; font-size:14px;">Transfer Token Inayosubiri</b> <div id="spTokenBox" style="display:flex; flex-direction:column; gap:6px; color:#334155;"><span style="color:#94a3b8;">Inatafuta token zinazongoja…</span></div> <hr style="border:0; border-top:1px solid #fde68a; margin: 12px 0;"> <p style="margin:0; font-size:13px; color:#78350f;"> <b>Rule:</b> Baada ya upande wa pili kuscan token, upande wa kwanza haukuwa tena na ownership. Unapospata custody halisi, token inayosubiri inakuwepo juu hapa.
                </p> </div> `;
        // [REAL DATA 2026-09] Tafuta token halisi zilizoko kusubiri (kama zinazopo)
        setTimeout(() => {
            const tokBox = document.getElementById('spTokenBox');
            if (!tokBox) return;
            // Hakuna token za uongo zinazodendwa. Ukiwa na shipment inayoendelea ya kweli ina
            // transfer token, itakuwepo hapa; vinginevyo hii ni ukweli wa sasa:
            tokBox.innerHTML = `<span style="color:#78350f; font-size:12.5px;">Hakuna token inayosubiri kwa akaunti hii kwa sasa.</span>`;
        }, 0);
    } 
    else if (subTabName === 'custody') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;">⛓ Chain of Custody & Audit Trail</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Kila hatua inarekodiwa na ushahidi kamili (Time, GPS, Token, Signature, Evidence):</p> <div class="sp-timeline" style="margin-left: 15px; border-left: 2px solid #cbd5e1; padding-left: 20px; position: relative;"> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 20px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold;">1. Seller (ABC Traders)</span> <p class="sp-timeline-desc" style="font-size:13px; color:#334155; margin: 3px 0 0 0;">
                         Time: 08:30 |  GPS: Verified |  Token: TKN-102 |  Signature: Valid |  Evidence: Photos Uploaded
                    </p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 20px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold;">2. Driver A (Transporter)</span> <p class="sp-timeline-desc" style="font-size:13px; color:#334155; margin: 3px 0 0 0;">
                         Time: 10:15 |  GPS: Verified |  Token: TKN-45GH-89PL |  Signature: Valid |  Evidence: Picked Up
                    </p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 20px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold;">3. Hub A (Moro Hub)</span> <p class="sp-timeline-desc" style="font-size:13px; color:#334155; margin: 3px 0 0 0;">
                         Time: 14:20 |  GPS: Verified |  Token: TKN-9081 |  Signature: Valid |  Evidence: Stored
                    </p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 20px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">4. Driver B -> Hub C -> Buyer</span> <p class="sp-timeline-desc" style="font-size:13px; color:#334155; margin: 3px 0 0 0;">
                         Active on route. Waiting final handover confirmation.
                    </p> </div> </div> `;
    }
    else if (subTabName === 'escrow') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> SokoPay Escrow Protection Status</b> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:20px; border-radius:14px; text-align:left; font-size:13px; color:#065f46;"> <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #a7f3d0; padding-bottom:8px;"> <span>Protected Amount:</span> <b style="font-size:16px; color:#10b981;">850,000 TZS</b> </div> <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #a7f3d0; padding-bottom:8px;"> <span>${T('sp_release_rule', 'Release Rule:')}</span> <b>${T('sp_buyer_confirmation', 'Buyer Confirmation')}</b> </div> <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #a7f3d0; padding-bottom:8px;"> <span>${T('sp_release_trigger', 'Release Trigger:')}</span> <b>${T('sp_token_scan', 'Token Scan & Signature')}</b> </div> <div style="display:flex; justify-content:space-between;"> <span>${T('sp_current_status', 'Current Status:')}</span> <b style="color:#00509d;">${T('sp_funds_protected', 'Funds Protected by SokoPay')}</b> </div> </div> `;
    }
    else if (subTabName === 'confirmations') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Delivery Confirmations</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Hatua za uidhinishaji wa usafirishaji:</p> <div style="background:#fffbeb; border:1px solid #fde68a; padding:18px; border-radius:14px; text-align:left;"> <b style="font-size:13px; color:#0f172a; display:block; margin-bottom:12px;">Shipment: SHP-2026-001</b> <div style="display:flex; flex-wrap:wrap; gap:10px;"> <button onclick="window.confirmEscrowOrder()" style="padding:10px 15px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Confirm Pickup</button> <button onclick="window.confirmEscrowOrder()" style="padding:10px 15px; background:#0284c7; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Confirm Arrival</button> <button onclick="window.confirmEscrowOrder()" style="padding:10px 15px; background:#8b5cf6; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Confirm Handover</button> <button onclick="window.confirmEscrowOrder()" style="padding:10px 15px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Confirm Delivery</button> <button onclick="window.disputeEscrowOrder()" style="padding:10px 15px; background:#ef4444; color:white; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;"> Report Issue</button> </div> </div> `;
    }
    else if (subTabName === 'evidence') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Evidence Center</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Ushahidi wote upo hapa (Photos, Videos, GPS Logs, Digital Signature, Delivery Receipt, QR Scan History):</p> <div style="display:flex; flex-direction:column; gap:8px;"> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Cargo_Pickup_Proof_Photo.png</span> <button onclick="alert('Inafungua picha...')" class="pos-quick-btn">View Photo</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Loading_Dock_Inspection.mp4</span> <button onclick="alert('Inacheza video...')" class="pos-quick-btn">Play Video</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> GPS Logs & Route Coordinates</span> <button onclick="alert('Inaonyesha ramani...')" class="pos-quick-btn">View GPS</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Digital Signature (Mshika Stoo)</span> <button onclick="alert(T('sp_digital_sign', 'Digital signature verification...'))" class="pos-quick-btn">${T('sp_verify', 'Verify')}</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Delivery Receipt & QR Scan History</span> <button onclick="alert('Inapakia faili...')" class="pos-quick-btn">Download</button> </div> </div> `;
    }
    else if (subTabName === 'history') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Shipment Life-Cycle Timeline</b> <div class="sp-timeline" style="margin-left: 15px; border-left: 2px solid #cbd5e1; padding-left: 20px; position: relative;"> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">1. Shipment Created</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Oda ya usafiri iliandikishwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">2. Pickup Confirmed</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mzigo ulichukuliwa na msafirishaji.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">3. Hub A (Moro Hub)</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Kituo cha kwanza kimethibitisha.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">4. Hub B (Dodoma Hub)</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Kituo cha pili kimepokea.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">5. Delivered</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mzigo umefikishwa kwa mteja.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">6. Buyer Confirmed</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mteja ameskani Token C.</p> </div> <div class="sp-timeline-item active" style="position: relative;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold; color:#10b981;">7. Escrow Released</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Malipo yote yameachiliwa salama.</p> </div> </div> `;
    }
};

window.switchCompanySubTab = function(subTabName, element) {
    document.querySelectorAll('#spCompaniesArea .sp-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#475569';
        btn.style.boxShadow = 'none';
    });

    if (element) {
        element.classList.add('active');
        element.style.background = 'white';
        element.style.color = '#00509d';
        element.style.boxShadow = '0 4px 10px rgba(0,0,0,0.05)';
    }

    const subWorkspace = document.getElementById('companySubTabContent');
    if(!subWorkspace) return;

    if (subTabName === 'projects') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Active Company Projects</b> <div style="display:flex; flex-direction:column; gap:10px;"> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:18px; border-radius:14px; text-align:left;"> <b style="font-size:14px; color:#00509d; display:block; margin-bottom:8px;">Project: Road Construction (Phase 2)</b> <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; font-size:12px; color:#334155; background:white; padding:12px; border-radius:10px; border:1px solid #e2e8f0;"> <div>Budget: <b style="color:#0f172a;">1.2 Billion TZS</b></div> <div>Released: <b style="color:#10b981;">450 Million TZS</b></div> <div>Remaining: <b style="color:#ef4444;">750 Million TZS</b></div> </div> <small style="display:block; color:gray; margin-top:10px;">${T('sp_financial_execution', 'SokoPay does not show ordinary accounting — it shows Financial Execution.')}</small> </div> </div> `;
    } 
    else if (subTabName === 'execution') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Budget Execution (Data Driven Allocation)</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Pesa haitoki mpaka hatua zote zikamilike kikamilifu:</p> <div class="sp-timeline" style="margin-left: 15px; border-left: 2px solid #cbd5e1; padding-left: 20px; position: relative;"> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">1. Allocated </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Bajeti imetengwa na kulockiwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">2. Verified </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Ukaguzi wa data umefanyika.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">3. Approved </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Menejimenti imeidhinisha.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">4. Released </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Pesa inatumwa na SokoPay Settlement Engine.</p> </div> <div class="sp-timeline-item" style="position: relative;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#64748b;">5. Completed </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Kazi imefungwa rasmi.</p> </div> </div> `;
    } 
    else if (subTabName === 'approvals') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Approval Center</b> <div style="background:#fffbeb; border:1px solid #fde68a; padding:20px; border-radius:14px; text-align:left;"> <b style="font-size:14px; color:#b45309; display:block; margin-bottom:12px;">${T('sp_approval_chain', 'Approval Chain Flow')}</b> <div style="display:flex; flex-direction:column; gap:10px; font-size:12px; color:#334155;"> <div style="display:flex; justify-content:space-between; background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0;"><span>${T('sp_finance_officer', 'Finance Officer')}</span> <b style="color:#10b981;"> ${T('sp_approved', 'Approved')}</b></div> <div style="display:flex; justify-content:space-between; background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0;"><span>${T('sp_manager', 'Manager')}</span> <b style="color:#10b981;"> ${T('sp_approved', 'Approved')}</b></div> <div style="display:flex; justify-content:space-between; background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0;"><span>${T('sp_director', 'Director')}</span> <b style="color:#f59e0b;"> ${T('sp_waiting_review', 'Waiting Review')}</b></div> <div style="display:flex; justify-content:space-between; background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0;"><span>CEO</span> <b style="color:gray;"> Pending Final Seal</b></div> </div> </div> `;
    } 
    else if (subTabName === 'has_tree') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Hierarchy Allocation System (HAS Tree)</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Hii si Org Chart ya kawaida. Ni Allocation Tree inayoonyesha mgawanyo wa bajeti:</p> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:14px; text-align:left; font-family:monospace; font-size:12px; color:#0f172a; line-height: 1.8;">
                CEO (Total Budget: 5 Billion)<br>
                │<br>
                ├── Director A (Allocated: 1.5 Billion | Role Fund: 20M )<br>
                │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br>
                │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── Engineer A (Allocated: 600M | Role Fund: 8M )<br>
                │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br>
                │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── Labour Pool (Direct Settlement )<br>
                │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Material Supplier (Direct Settlement )<br>
                │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br>
                │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Engineer B (Allocated: 500M)<br>
                │<br>
                └── Director B (Allocated: 2 Billion | Role Fund: 20M )<br> </div> <p style="font-size:13px; color:#ef4444; margin-top:12px;"> <b>Rule:</b> Viongozi hawashiki pesa za mradi mkononi. Mshahara na posho zao zipo kwenye <b>Role Allocation (Locked)</b>. Pesa za mradi zinasambazwa kama <b>Data Only</b> na kulipwa moja kwa moja na SokoPay Settlement Engine!
            </p> `;
    } 
    else if (subTabName === 'contracts') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Company Contracts Directory</b> <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; text-align:left; font-size:12px;"> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"><b> Company Contracts</b><br><small style="color:gray;">Mikataba mikuu ya ushirikiano na taasisi.</small></div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"><b> Supplier Contracts</b><br><small style="color:gray;">Wabia wa uingizaji malighafi stoo.</small></div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"><b> Employee Contracts</b><br><small style="color:gray;">Mikataba ya wafanyakazi na wasimamizi wa miradi.</small></div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"><b> Service Contracts</b><br><small style="color:gray;">Watoa huduma na wakandarasi wa nje.</small></div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"><b> Construction Contracts</b><br><small style="color:gray;">Miradi ya ujenzi na maendeleo ya miundombinu.</small></div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"><b> Vendor Contracts</b><br><small style="color:gray;">Wachuuzi na wauzaji wa rejareja.</small></div> </div> `;
    }
    else if (subTabName === 'payments') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Enterprise Payments Hub</b> <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; text-align:left; font-size:12px;"> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:15px; border-radius:12px;"><b> Company Payments</b><br><small style="color:#065f46;">Miamala iliyothibitishwa na bodi.</small></div> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:15px; border-radius:12px;"><b> Supplier Payments</b><br><small style="color:#065f46;">Malipo ya shehena za mzigo.</small></div> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:15px; border-radius:12px;"><b> Payroll Settlement</b><br><small style="color:#065f46;">Mishahara iliyotolewa na SokoPay.</small></div> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:15px; border-radius:12px;"><b> Project Payments</b><br><small style="color:#065f46;">Malipo ya wakandarasi na wajenzi.</small></div> </div> `;
    }
    else if (subTabName === 'monitoring') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Live Project Monitoring</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Ufuatiliaji hai wa maendeleo ya mradi (Photos, Videos, Progress %, Milestones, GPS Evidence):</p> <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; text-align:left;"> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:14px;"> <b style="color:#00509d; font-size:13px;"> Live Site GPS</b><br> <small style="color:gray;">Mbezi Warehouse Site • Coordinates Active</small> <div style="margin-top:10px; height:120px; background:#eef2f5; border-radius:10px; display:flex; align-items:center; justify-content:center; border:1px solid #cbd5e1;"> <span style="font-size:24px;"> [GPS Live View]</span> </div> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:14px;"> <b style="color:#00509d; font-size:13px;"> Live Evidence Feeds</b><br> <small style="color:gray;">Picha na Video za Wajenzi zikipakiwa kila siku</small> <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"> <button onclick="alert('Inafungua picha...')" class="pos-quick-btn"> Site_Foundation_Day12.jpg</button> <button onclick="alert('Inacheza video...')" class="pos-quick-btn"> Beam_Concrete_Pour.mp4</button> </div> </div> </div> `;
    }
    else if (subTabName === 'documents') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Enterprise Documents</b> <div style="display:flex; flex-direction:column; gap:8px;"> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Purchase_Order_PO-2026-89.pdf</span> <button onclick="alert('Inapakia faili...')" class="pos-quick-btn">Download</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Completion_Inspection_Report.pdf</span> <button onclick="alert('Inapakia faili...')" class="pos-quick-btn">Download</button> </div> </div> `;
    }
    else if (subTabName === 'history') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Budget Lifecycle Timeline</b> <div class="sp-timeline" style="margin-left: 15px; border-left: 2px solid #cbd5e1; padding-left: 20px; position: relative;"> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">1. Budget Created</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Bajeti kuu iliandaliwa na kupitishwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">2. Approval Started</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mlolongo wa saini za bodi ulianza.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">3. Project Started</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mkandarasi alifika eneo la kazi.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">4. Milestone 1 Verified</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Msingi ulikaguliwa na kulipwa.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold;">5. Milestone 2 Verified</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Nguzo na lenta zimekamilika.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold; color:#10b981;">6. Funds Released</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Fedha zimetumwa na SokoPay Settlement Engine.</p> </div> <div class="sp-timeline-item active" style="position: relative;"> <span class="sp-timeline-title" style="font-size:13px; font-weight:bold; color:#10b981;">7. Completed</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mradi ulikabidhiwa rasmi.</p> </div> </div> `;
    }
    else if (subTabName === 'uris_reg') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> SokoPay Unified Registration & Identity System (URIS)</b> <p style="font-size:13px; color:#64748b; margin-bottom:20px; text-align:left;">
                Hakuna mtu anajisajili kama 'mtu binafsi tu'. Kila user anasajiliwa kama <b>Node</b> ndani ya hierarchy ya serikali, taasisi au kampuni.
            </p> <div style="display:flex; flex-direction:column; gap:20px; text-align:left; font-size:12px; color:#334155;"> <!-- STEP 1 --> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:14px;"> <b style="color:#00509d; font-size:13px; display:block; margin-bottom:10px;">STEP 1: ROOT CREATION & CHOOSE MODE</b> <div style="display:flex; gap:10px; margin-bottom:12px;"> <button class="pos-quick-btn" style="background:#00509d; color:white;">Government</button> <button class="pos-quick-btn">Company</button> <button class="pos-quick-btn">NGO</button> <button class="pos-quick-btn">Project Worker</button> </div> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">ORGANIZATION NAME *</label> <input type="text" value="Ministry of Infrastructure / ABC Company" readonly style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; font-weight:bold; margin-bottom:10px;"> <small style="color:gray;">Top Level Only: Created by Treasury Level.</small> </div> <!-- STEP 2 --> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:14px;"> <b style="color:#00509d; font-size:13px; display:block; margin-bottom:10px;">STEP 2: SELECT ROLE LEVEL (AUTHORITY CREATION)</b> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">SELECT POSITION *</label> <select style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; font-weight:bold; margin-bottom:12px;"> <option>Top Authority (President / CEO)</option> <option selected>Department Head (Director / Ministry)</option> <option>Operational Node (Engineer / Manager)</option> <option>Supervisor</option> <option>Field Node (Worker / Supplier / Citizen)</option> </select> <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"> <div> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">FULL NAME *</label> <input type="text" value="Ramadhan Said" readonly style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;"> </div> <div> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">NATIONAL ID / COMPANY ID *</label> <input type="text" value="NIDA-89329102" readonly style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;"> </div> </div> </div> <!-- STEP 3 --> <div style="background:#fffbeb; border:1px solid #fde68a; padding:20px; border-radius:14px;"> <b style="color:#b45309; font-size:13px; display:block; margin-bottom:10px;">STEP 3: ASSIGN PARENT NODE (MANDATORY HIERARCHY LINK)</b> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">PARENT NODE ID (CONNECTED TO) *</label> <input type="text" value="SP-ID-MIN-INFRA-001 (Ministry of Infrastructure -> Road Department)" readonly style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; font-weight:bold; color:#00509d;"> <small style="color:#b45309; display:block; margin-top:6px;"><b>Rule:</b> Kila user lazima awe connected kwenye Parent Node ID. Hakuna anayeingia standalone!</small> </div> <!-- STEP 4 & 5 --> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:20px; border-radius:14px;"> <b style="color:#065f46; font-size:13px; display:block; margin-bottom:10px;">STEP 4 & 5: SYSTEM AUTO-GENERATES & ACTIVATION</b> <div style="display:flex; flex-direction:column; gap:8px; font-size:12px;"> <div> <b>Role Allocation:</b> TZS 12,000,000 (Protected from parent)</div> <div> <b>Project Scope & Limits:</b> TZS 3.5 Billion (Distributable downward)</div> <div> <b>Approval Chain:</b> Inherited from Ministry level</div> <div style="margin-top:8px; padding-top:10px; border-top:1px solid #a7f3d0; display:flex; justify-content:space-between; align-items:center;"> <span>Account Status:</span> <b style="color:#10b981; font-size:14px;"> Active Node</b> </div> <div style="display:flex; justify-content:space-between; align-items:center;"> <span>SokoPay Node ID:</span> <b style="color:#00509d; font-size:14px;">SP-ID-0001-REG-ENG-77291</b> </div> </div> </div> </div> `;
    }
};

window.switchGovernanceSubTab = function(subTabName, element) {
    document.querySelectorAll('#spGovernanceArea .sp-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#475569';
        btn.style.boxShadow = 'none';
    });

    if (element) {
        element.classList.add('active');
        element.style.background = 'white';
        element.style.color = '#00509d';
        element.style.boxShadow = '0 4px 10px rgba(0,0,0,0.05)';
    }

    const subWorkspace = document.getElementById('governanceSubTabContent');
    if(!subWorkspace) return;

    if (subTabName === 'confirmations') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Governance Confirmation Center</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Foleni ya uidhinishaji kutoka chini kwenda juu (Bottom -> Top Flow):</p> <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin-bottom:20px;"> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:12px; border-radius:12px; text-align:center;"> <b style="font-size:16px; color:#0f172a;">18</b><br><small style="color:gray;">${T('sp_pending_confirmations', 'Pending Confirmations')}</small> </div> <div style="background:#fffbeb; border:1px solid #fde68a; padding:12px; border-radius:12px; text-align:center;"> <b style="font-size:16px; color:#d97706;">4</b><br><small style="color:#b45309;">${T('sp_waiting_my_approval', 'Waiting My Approval')}</small> </div> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:12px; border-radius:12px; text-align:center;"> <b style="font-size:16px; color:#10b981;">15</b><br><small style="color:#065f46;">${T('sp_completed_today', 'Completed Today')}</small> </div> <div style="background:#fef2f2; border:1px solid #fecaca; padding:12px; border-radius:12px; text-align:center;"> <b style="font-size:16px; color:#ef4444;">1</b><br><small style="color:#991b1b;">${T('sp_rejected', 'Rejected')}</small> </div> </div> <div style="background:#fffbeb; border:1px solid #fde68a; padding:18px; border-radius:14px; text-align:left;"> <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"> <b style="font-size:14px; color:#0f172a;">Road Project A (Ilala Sector)</b> <span style="font-size:12.5px; background:#fef3c7; color:#d97706; padding:3px 10px; border-radius:10px; font-weight:bold;"> Waiting You (Regional Engineer)</span> </div> <p style="font-size:13px; color:#334155; margin:0 0 12px 0; background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0;"> <b>Chain Flow:</b> Worker (Completed ) -> Supervisor (Verified ) -> District Engineer (Approved ) -> <b>Regional Engineer ( Waiting You)</b> </p> <div style="display:flex; gap:10px;"> <button onclick="window.confirmEscrowOrder()" style="padding:10px 18px; background:#10b981; color:white; border:none; border-radius:10px; font-weight:bold; font-size:12px; cursor:pointer;"> Approve</button> <button onclick="alert(T('sp_confirmation_rejected', 'Confirmation rejected and returned to the District Engineer.'))" style="padding:10px 18px; background:#ef4444; color:white; border:none; border-radius:10px; font-weight:bold; font-size:12px; cursor:pointer;"> Reject</button> <button onclick="alert(T('sp_report_revision_sent', 'Report revision request sent.'))" style="padding:10px 18px; background:#0f172a; color:white; border:none; border-radius:10px; font-weight:bold; font-size:12px; cursor:pointer;"> Request Revision</button> </div> </div> `;
    } 
    else if (subTabName === 'ecosystem') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Role Ecosystem (Mnyororo wa Wasaidizi)</b> <div style="display:flex; flex-direction:column; gap:12px; text-align:left;"> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px; border-left:5px solid #00509d;"> <small style="color:gray; font-weight:bold;">My Parent Role:</small> <b style="font-size:14px; color:#0f172a; display:block; margin-top:3px;">Permanent Secretary</b> <small style="color:#10b981; font-weight:bold; display:block; margin-top:2px;"> Online & Active</small> </div> <div style="background:#fffbeb; border:1px solid #f59e0b; padding:15px; border-radius:12px; border-left:5px solid #f59e0b;"> <small style="color:#b45309; font-weight:bold;">My Current Role:</small> <b style="font-size:14px; color:#0f172a; display:block; margin-top:3px;">Regional Engineer (Dar es Salaam)</b> <small style="color:gray; display:block; margin-top:2px;">Role Identity: RIT-MOW-REG-001</small> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px; border-left:5px solid #10b981;"> <small style="color:gray; font-weight:bold;">My Child Roles (Subordinates):</small> <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;"> <div style="background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between;"><span>District Engineer A (Ilala)</span> <span style="color:#10b981;"> Active (Allocation: 500M)</span></div> <div style="background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between;"><span>District Engineer B (Kinondoni)</span> <span style="color:#10b981;"> Active (Allocation: 450M)</span></div> <div style="background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between;"><span>District Engineer C (Temeke)</span> <span style="color:#10b981;"> Active (Allocation: 400M)</span></div> <div style="background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between;"><span>District Engineer D (Kigamboni)</span> <span style="color:#10b981;"> Active (Allocation: 350M)</span></div> </div> </div> </div> `;
    } 
    else if (subTabName === 'hierarchy') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Live Governance Hierarchy</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Hakuna level iliyofungwa (hardcoded). Mfumo unajenga hierarchy yenyewe (Dynamic Hierarchy Engine):</p> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:14px; text-align:left; font-family:monospace; font-size:13px; line-height: 2.0; color:#334155;">
                Treasury<br>
                &nbsp;&nbsp;└── Ministry of Works<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── <b style="color:#00509d; background:#e0f2fe; padding:2px 8px; border-radius:6px; border:1px solid #bae6fd;">Region - Dar es Salaam (You)</b><br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── District - Ilala<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Ward - Kariakoo<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Village / Street<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Road Project A<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Site Engineer<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Supervisor<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Worker<br> </div> `;
    } 
    else if (subTabName === 'map') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> National Governance Map</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Ramani hai ya serikali nzima (Digital Twin) inayoonyesha hadhi ya nchi kwa sekunde chache:</p> <div style="background:#001122; color:white; padding:20px; border-radius:16px; text-align:left; font-family:monospace; font-size:12px; line-height: 1.8;">
                 Treasury [100% Budget]<br>
                &nbsp;&nbsp;│<br>
                &nbsp;&nbsp;├── Ministry of Works  [92% Executed]<br>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Region (Dar es Salaam)  [87% Verified]<br>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── District (Ilala)  [81% Waiting Approval]<br>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Project A  [76% Complete]<br>
                &nbsp;&nbsp;│<br>
                &nbsp;&nbsp;├── Ministry of Health  [95% Executed]<br>
                &nbsp;&nbsp;└── Ministry of Education  [Delayed Audit Alert]<br> </div> <div style="display:flex; gap:10px; margin-top:15px; font-size:13px; font-weight:bold;"> <span style="background:#ecfdf5; color:#10b981; padding:4px 10px; border-radius:10px;"> Complete</span> <span style="background:#fffbeb; color:#d97706; padding:4px 10px; border-radius:10px;"> Awaiting</span> <span style="background:#fef2f2; color:#ef4444; padding:4px 10px; border-radius:10px;"> Alert</span> <span style="background:#eff6ff; color:#3b82f6; padding:4px 10px; border-radius:10px;"> Allocated</span> </div> `;
    } 
    else if (subTabName === 'cabinet') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Cabinet & Role Registry</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Baraza la Mawaziri na orodha ya wamiliki wa ofisi (Holders):</p> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:18px; border-radius:14px; text-align:left; font-size:12px;"> <b style="color:#00509d; font-size:14px; display:block; margin-bottom:8px;">Role: Minister of Health</b> <div style="display:flex; flex-direction:column; gap:6px; color:#334155;"> <div>Current Holder: <b>Dr. X</b></div> <div>Since: <b>12 Jan 2026</b></div> <div>Previous Holder: <b>Dr. Y</b></div> <div>Status: <b style="color:#10b981;"> Occupied</b></div> <div>Institution Token: <b style="color:#00509d;">IT-MOH-001</b></div> </div> <hr style="border:0; border-top:1px solid #e2e8f0; margin: 12px 0;"> <small style="color:gray;"><b>Principle:</b> Mtu akiondoka au kuhamishwa, Role Token (RIT) haibadiliki. Holder ndiye anayebadilika, na historia yote ya ukaguzi inabaki salama!</small> </div> `;
    } 
    else if (subTabName === 'transfer') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Role Transfer Center</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Mamlaka ya kuhamisha, kuteua na kusimamisha wamiliki wa ofisi (Holders):</p> <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px;"> <button onclick="alert('Mfumo unamteua Holder mpya na kuzalisha credentials mpya.')" style="padding:15px; background:#00509d; color:white; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">Assign Holder</button> <button onclick="alert('Holder amehamishwa ofisi. Dashboard inabadilika kiotomatiki.')" style="padding:15px; background:#10b981; color:white; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">Transfer Holder</button> <button onclick="alert('Holder amesimamishwa kazi kwa muda.')" style="padding:15px; background:#f59e0b; color:white; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">Suspend Holder</button> <button onclick="alert('Nafasi ipo wazi sasa (Vacant).')" style="padding:15px; background:#ef4444; color:white; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">Vacate Role</button> <button onclick="alert('Promoted! Mhandisi kapewa DNA ya Mkurugenzi.')" style="padding:15px; background:#8b5cf6; color:white; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">Promote</button> <button onclick="alert('Demoted! Sifa zimeondolewa.')" style="padding:15px; background:#0f172a; color:white; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">Demote</button> </div> `;
    } 
    else if (subTabName === 'audit') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Immutable Audit Trail</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Hakuna rekodi inayoweza kufutwa. Zote zinabaki kwa CAG na ukaguzi wa serikali:</p> <div style="display:flex; flex-direction:column; gap:10px; text-align:left; font-size:13px;"> <div style="background:#f8fafc; border-left:4px solid #00509d; padding:12px; border-radius:8px; border:1px solid #e2e8f0;"><b>[09:30] Budget Allocated</b> • Treasury ilitenga TZS 5 Billion kwa Ministry of Works.</div> <div style="background:#f8fafc; border-left:4px solid #10b981; padding:12px; border-radius:8px; border:1px solid #e2e8f0;"><b>[10:10] Engineer Approved</b> • Site Engineer alithibitisha mikataba ya kazi.</div> <div style="background:#f8fafc; border-left:4px solid #10b981; padding:12px; border-radius:8px; border:1px solid #e2e8f0;"><b>[11:02] Director Approved</b> • Mkurugenzi alipitisha malipo.</div> <div style="background:#f8fafc; border-left:4px solid #8b5cf6; padding:12px; border-radius:8px; border:1px solid #e2e8f0;"><b>[12:15] Settlement Released</b> • SokoPay ilituma pesa moja kwa moja kwenye wallet za wafanyakazi.</div> </div> `;
    } 
    else if (subTabName === 'ase_designer') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Allocation Structure Engine (ASE Designer)</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Ujenzi wa muundo wa ugawaji kwa kutumia <b>Role Tokens (RIT)</b> badala ya majina ya watu:</p> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:14px; text-align:left; font-family:monospace; font-size:12px; line-height:1.8; color:#0f172a;">
                RIT-MOW-DIRECTOR<br>
                &nbsp;&nbsp;│<br>
                &nbsp;&nbsp;├── RIT-MOW-REGIONAL-ENGINEER<br>
                &nbsp;&nbsp;│<br>
                &nbsp;&nbsp;├── RIT-MOW-DISTRICT-ENGINEER<br>
                &nbsp;&nbsp;│<br>
                &nbsp;&nbsp;├── RIT-MOW-WARD-ENGINEER<br>
                &nbsp;&nbsp;│<br>
                &nbsp;&nbsp;└── RIT-MOW-SUPERVISOR<br> </div> <p style="font-size:13px; color:#00509d; margin-top:12px;"> <b>Core Innovation:</b> Ukibadilisha mtu anayeshika role, Allocation Structure <b>haibadiliki</b>. Mnyororo unaendelea kwa usalama na uthabiti wa ofisi!
            </p> `;
    }
    else if (subTabName === 'uris_reg') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> SokoPay Unified Registration & Identity System (URIS)</b> <p style="font-size:13px; color:#64748b; margin-bottom:20px; text-align:left;">
                Hakuna mtu anajisajili kama 'mtu binafsi tu'. Kila user anasajiliwa kama <b>Node</b> ndani ya hierarchy ya serikali, taasisi au kampuni.
            </p> <div style="display:flex; flex-direction:column; gap:20px; text-align:left; font-size:12px; color:#334155;"> <!-- STEP 1 --> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:14px;"> <b style="color:#00509d; font-size:13px; display:block; margin-bottom:10px;">STEP 1: ROOT CREATION & CHOOSE MODE</b> <div style="display:flex; gap:10px; margin-bottom:12px;"> <button class="pos-quick-btn" style="background:#00509d; color:white;">Government</button> <button class="pos-quick-btn">Company</button> <button class="pos-quick-btn">NGO</button> <button class="pos-quick-btn">Project Worker</button> </div> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">ORGANIZATION NAME *</label> <input type="text" value="Ministry of Infrastructure / ABC Company" readonly style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; font-weight:bold; margin-bottom:10px;"> <small style="color:gray;">Top Level Only: Created by Treasury Level.</small> </div> <!-- STEP 2 --> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:14px;"> <b style="color:#00509d; font-size:13px; display:block; margin-bottom:10px;">STEP 2: SELECT ROLE LEVEL (AUTHORITY CREATION)</b> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">SELECT POSITION *</label> <select style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; font-weight:bold; margin-bottom:12px;"> <option>Top Authority (President / CEO)</option> <option selected>Department Head (Director / Ministry)</option> <option>Operational Node (Engineer / Manager)</option> <option>Supervisor</option> <option>Field Node (Worker / Supplier / Citizen)</option> </select> <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"> <div> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">FULL NAME *</label> <input type="text" value="Ramadhan Said" readonly style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;"> </div> <div> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">NATIONAL ID / COMPANY ID *</label> <input type="text" value="NIDA-89329102" readonly style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white;"> </div> </div> </div> <!-- STEP 3 --> <div style="background:#fffbeb; border:1px solid #fde68a; padding:20px; border-radius:14px;"> <b style="color:#b45309; font-size:13px; display:block; margin-bottom:10px;">STEP 3: ASSIGN PARENT NODE (MANDATORY HIERARCHY LINK)</b> <label style="font-size:12.5px; font-weight:bold; color:gray; display:block; margin-bottom:4px;">PARENT NODE ID (CONNECTED TO) *</label> <input type="text" value="SP-ID-MIN-INFRA-001 (Ministry of Infrastructure -> Road Department)" readonly style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; font-weight:bold; color:#00509d;"> <small style="color:#b45309; display:block; margin-top:6px;"><b>Rule:</b> Kila user lazima awe connected kwenye Parent Node ID. Hakuna anayeingia standalone!</small> </div> <!-- STEP 4 & 5 --> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:20px; border-radius:14px;"> <b style="color:#065f46; font-size:13px; display:block; margin-bottom:10px;">STEP 4 & 5: SYSTEM AUTO-GENERATES & ACTIVATION</b> <div style="display:flex; flex-direction:column; gap:8px; font-size:12px;"> <div> <b>Role Allocation:</b> TZS 12,000,000 (Protected from parent)</div> <div> <b>Project Scope & Limits:</b> TZS 3.5 Billion (Distributable downward)</div> <div> <b>Approval Chain:</b> Inherited from Ministry level</div> <div style="margin-top:8px; padding-top:10px; border-top:1px solid #a7f3d0; display:flex; justify-content:space-between; align-items:center;"> <span>Account Status:</span> <b style="color:#10b981; font-size:14px;"> Active Node</b> </div> <div style="display:flex; justify-content:space-between; align-items:center;"> <span>SokoPay Node ID:</span> <b style="color:#00509d; font-size:14px;">SP-ID-0001-REG-ENG-77291</b> </div> </div> </div> </div> `;
    }
};

window.switchEventSubTab = function(subTabName, element) {
    document.querySelectorAll('#spEventsArea .sp-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#475569';
        btn.style.boxShadow = 'none';
    });

    if (element) {
        element.classList.add('active');
        element.style.background = 'white';
        element.style.color = '#00509d';
        element.style.boxShadow = '0 4px 10px rgba(0,0,0,0.05)';
    }

    const subWorkspace = document.getElementById('eventSubTabContent');
    if(!subWorkspace) return;

    if (subTabName === 'overview') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Event Creation & Micro Governance</b> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:18px; border-radius:14px; text-align:left; font-size:12px; color:#334155;"> <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;"> <b style="color:#00509d; font-size:14px;"> Event: Harusi / Msiba / Kamati / Shughuli</b> <span style="font-size:12.5px; background:#eff6ff; color:#00509d; padding:3px 10px; border-radius:10px; font-weight:bold;">ID: EVT-88392</span> </div> <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;"> <div>Budget: <b style="color:#10b981;">3,000,000 TZS</b></div> <div>Organizer: <b style="color:#0f172a;">Committee Lead</b></div> <div>Duration: <b style="color:#0f172a;">3 Days</b></div> <div>Escrow Status: <b style="color:#ef4444;"> LOCKED (Active)</b></div> </div> <hr style="border:0; border-top:1px solid #e2e8f0; margin:12px 0;"> <p style="margin:0; font-size:13px; color:#78350f;"> <b>Important Rule:</b> Pesa <b>HAIPO</b> mikononi mwa mtu yeyote wala mwenyekiti. Pesa zote zipo salama kwenye SokoPay Escrow!
                </p> </div> `;
    } 
    else if (subTabName === 'tasks') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Task Breakdown Engine & Task Tokens</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Kila kazi inageuzwa kuwa Task Token yenye usimamizi maalum:</p> <div style="display:flex; flex-direction:column; gap:10px; text-align:left;"> <div style="background:#fffbeb; border:1px solid #fde68a; padding:15px; border-radius:12px; font-size:12px;"> <b style="color:#b45309; font-size:13px; display:block; margin-bottom:6px;"> Task Token: Food Supply (Mama A)</b> <div>Amount: <b style="color:#10b981;">800,000 TZS</b></div> <div style="margin-top:6px; font-size:13px; color:#334155;"> <b>Conditions:</b>  Food delivered |  Photos uploaded |  Committee verified |  Attendees confirmation
                    </div> </div> <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:15px; border-radius:12px; font-size:12px;"> <b style="color:#15803d; font-size:13px; display:block; margin-bottom:6px;"> Task Token: Tent Setup (Ali)</b> <div>Amount: <b style="color:#10b981;">600,000 TZS</b></div> <div style="margin-top:6px; font-size:13px; color:#334155;"> <b>Conditions:</b>  Setup completed |  Photos uploaded |  Verified by committee
                    </div> </div> <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:15px; border-radius:12px; font-size:12px;"> <b style="color:#0369a1; font-size:13px; display:block; margin-bottom:6px;"> Task Token: Transport (John)</b> <div>Amount: <b style="color:#10b981;">500,000 TZS</b></div> <div style="margin-top:6px; font-size:13px; color:#334155;"> <b>Conditions:</b>  Guests transported |  Verified by committee
                    </div> </div> </div> `;
    } 
    else if (subTabName === 'evidence') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Evidence Layer (Ushahidi wa Kamati)</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Ushahidi wa picha, video na uthibitisho wa wajumbe kabla ya kulipa watoa huduma:</p> <div style="display:flex; flex-direction:column; gap:8px;"> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Food_Delivered_Wedding.png  Verified</span> <button onclick="alert('Inafungua picha...')" class="pos-quick-btn">View Photo</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Tent_Setup_Completed.png  Verified</span> <button onclick="alert('Inafungua picha...')" class="pos-quick-btn">View Photo</button> </div> <div class="sp-doc-card" style="border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;"> <span style="font-size:12px; color:#1E293B;"> Security_Active_Inspection.mp4  Verified</span> <button onclick="alert('Inacheza video...')" class="pos-quick-btn">Play Video</button> </div> </div> `;
    } 
    else if (subTabName === 'verification') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Multi-Verification Chain</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Hakuna mtu mmoja anayeweza kuachilia malipo peke yake (Zero Single Approval):</p> <div class="sp-timeline" style="margin-left: 15px; border-left: 2px solid #cbd5e1; padding-left: 20px; position: relative;"> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">1. Worker Submission </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mtoa huduma (Mama A) awasilisha picha za chakula.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">2. Committee Member Verification </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mjumbe wa kamati athibitisha ubora.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">3. Event Supervisor Confirmation </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Msimamizi mkuu apitisha hand-off.</p> </div> <div class="sp-timeline-item active" style="position: relative; margin-bottom: 15px;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">4. System Rule Engine Check </span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Mfumo unakagua sheria na uthibitisho.</p> </div> <div class="sp-timeline-item active" style="position: relative;"> <span class="sp-timeline-title" style="font-size:12px; font-weight:bold; color:#10b981;">5. Final Approval -> Payout Released</span> <p class="sp-timeline-desc" style="font-size:12.5px; color:#64748b; margin: 2px 0 0 0;">Pesa inatumwa moja kwa moja kwa Mama A.</p> </div> </div> `;
    }
    else if (subTabName === 'escrow') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Event Escrow Protection</b> <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:20px; border-radius:14px; text-align:left; font-size:13px; color:#065f46;"> <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #a7f3d0; padding-bottom:8px;"> <span>Total Held in Escrow:</span> <b style="font-size:16px; color:#10b981;">3,000,000 TZS</b> </div> <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #a7f3d0; padding-bottom:8px;"> <span>Amount Released:</span> <b>0 TZS</b> </div> <div style="display:flex; justify-content:space-between;"> <span>Pending Verification Approval:</span> <b style="color:#00509d;">YES (In Progress)</b> </div> </div> `;
    }
    else if (subTabName === 'disputes') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Event Dispute Control</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Ikitokea shida (Kazi haijafanywa, evidence mismatch, au ucheleweshaji), mgogoro unagandisha malipo kiotomatiki:</p> <div style="background:#fff5f5; border:1px solid #fecaca; padding:20px; border-radius:14px; text-align:left;"> <b style="color:#ef4444; font-size:14px; display:block; margin-bottom:8px;"> TOKEN FREEZE LOGIC ACTIVE</b> <p style="font-size:12px; color:#334155; margin:0 0 12px 0;">
                    Ukifungua mgogoro, Task Token husika inafungwa mara moja. Hakuna malipo kuachiliwa wala kubadilishwa kwa ushahidi!
                </p> <button onclick="window.disputeEscrowOrder()" style="padding:12px 20px; background:#ef4444; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;"> RAISE EVENT DISPUTE (FREEZE PAYMENTS)</button> </div> `;
    }
    else if (subTabName === 'payments') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Event Payment Release Engine</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Malipo ya moja kwa moja kutoka SokoPay Settlement Engine baada ya kazi kuthibitishwa:</p> <div style="display:flex; flex-direction:column; gap:10px; text-align:left; font-size:12px;"> <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; border-left:5px solid #10b981;"> <div><b>Food Vendor (Mama A)</b><br><small style="color:gray;">Direct Payout from Escrow</small></div> <b style="color:#10b981; font-size:14px;">800,000 TZS</b> </div> <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; border-left:5px solid #10b981;"> <div><b>Tent Setup (Ali)</b><br><small style="color:gray;">Direct Payout from Escrow</small></div> <b style="color:#10b981; font-size:14px;">600,000 TZS</b> </div> <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; border-left:5px solid #10b981;"> <div><b>Transport (John)</b><br><small style="color:gray;">Direct Payout from Escrow</small></div> <b style="color:#10b981; font-size:14px;">500,000 TZS</b> </div> </div> `;
    }
    else if (subTabName === 'bulletproof') {
        subWorkspace.innerHTML = `
            <b style="font-size:13px; color:#0f172a; text-transform:uppercase; margin-bottom:15px; display:block; text-align:left;"> Bulletproof Features (Nyongeza 6 Muhimu za Events Layer)</b> <p style="font-size:13px; color:#64748b; margin-bottom:15px;">Nyongeza zinazoifanya SokoPay kuwa mfumo thabiti dhidi ya upotevu wa fedha na udanganyifu:</p> <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:15px; text-align:left; font-size:12px;"> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"> <b style="color:#00509d; display:block; margin-bottom:4px;">1.  Event Budget DNA</b> <span>Total: 3,000,000 TZS | Breakdown Hash: <b style="color:#8b5cf6;">#EVT-DNA-88392</b></span><br> <small style="color:gray;">Hakuna kubadilisha bajeti kimyakimya. Kila mabadiliko yana immutable hash.</small> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"> <b style="color:#00509d; display:block; margin-bottom:4px;">2.  Role of Trust (Anti-Corruption)</b> <span>Member A (Level 1 View) -> Supervisor (Level 2 Verify) -> Chairman (Level 3 Approve) -> System (Level 4 Release)</span><br> <small style="color:gray;">Hakuna mtu mmoja anayeweza kuibia mfumo.</small> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"> <b style="color:#00509d; display:block; margin-bottom:4px;">3.  Live Event Tracking</b> <span>Food:  In progress | Tent:  Completed | Transport:  Pending | Security:  Active</span><br> <small style="color:gray;">Unajua kila kitu kinachotokea live bila ubashiri.</small> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"> <b style="color:#ef4444; display:block; margin-bottom:4px;">4.  Smart Leakage Detector</b> <span> ALERT: Budget mismatch detected / Task overpriced (+30%)</span><br> <small style="color:gray;">Mfumo unakamata viashiria vya rushwa kabla pesa haijatoka.</small> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"> <b style="color:#10b981; display:block; margin-bottom:4px;">5.  Partial Release System</b> <span>30% Start -> 40% Mid verification -> 30% Completion</span><br> <small style="color:gray;">Inazuia wakandarasi kutoroka kazi katikati.</small> </div> <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:15px; border-radius:12px;"> <b style="color:#8b5cf6; display:block; margin-bottom:4px;">6.  Event Performance Score</b> <span>Transparency: 95% | Efficiency: 88% | Fraud Risk: LOW</span><br> <small style="color:gray;">Ikijumuisha <b>Event Cloning Protection</b> kuzuia copy feki za events.</small> </div> </div> `;
    }
};

window.resolvePlatformDispute = async function(orderId, winner) {
    if (!await skhConfirm(`Je, unathibitisha kuamua mgogoro huu kwa manufaa ya ${winner.toUpperCase()}? Mfumo utahamisha fedha zote za Escrow sasa hivi.`)) return;

    try {
        let orderRef = skh.doc(skh.db, "orders", orderId);
        let orderSnap = await skh.getDoc(orderRef);
        let amount = 0;
        let targetId = "";
        let title = "";
        let buyerId = "";
        let sellerId = "";

        // A. Kagua kama mgogoro upo kwenye orders au sokopay_links
        if (orderSnap.exists()) {
            const od = orderSnap.data();
            amount = parseFloat(od.amount || 0);
            buyerId = od.buyerId;
            sellerId = od.sellerId;
            title = od.itemTitle || "Order Dispute";
            targetId = winner === 'buyer' ? od.buyerId : od.sellerId;
            
            // Sasisha hali ya oda kwenye database
            await skh.updateDoc(orderRef, {
                status: winner === 'buyer' ? "refunded_by_admin" : "completed",
                disputeResolvedAt: new Date().toISOString(),
                disputeWinner: winner
            });
        } else {
            const linkRef = skh.doc(skh.db, "sokopay_links", orderId);
            const linkSnap = await skh.getDoc(linkRef);
            if (linkSnap.exists()) {
                const ld = linkSnap.data();
                amount = parseFloat(ld.price || ld.amount || 0);
                buyerId = ld.buyerId;
                sellerId = ld.userId;
                title = ld.title || "SokoPay Link Dispute";
                targetId = winner === 'buyer' ? ld.buyerId : ld.userId;

                await skh.updateDoc(linkRef, {
                    status: winner === 'buyer' ? "refunded_by_admin" : "completed",
                    disputeResolvedAt: new Date().toISOString(),
                    disputeWinner: winner
                });
            } else {
                alert(" Hitilafu: Mgogoro au muamala huu haujapatikana katika kanzidata!");
                return;
            }
        }

        // B. MTUME MSHINDI FEDHA KWENYE WALLET YAKE
        const userQ = skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", targetId));
        const userSnap = await skh.getDocs(userQ);
        if (!userSnap.empty) {
            const userDocId = userSnap.docs[0].id;
            // [PHASE 5.2b] kituo kimoja — skhWalletAdjust (legacy 1:1 geti likiwa off; server+ledger ikiwa on)
            await window.skhWalletAdjust(skh.doc(skh.db, "users", userDocId), amount, { type: 'refund', ledgerKey: 'dispwin_' + orderId + '_' + winner, note: 'Ushindi wa mgogoro - utatuzi wa Admin' });

            // Mtumie mshindi taarifa (Notification) ya ushindi na malipo
            await skh.addDoc(skh.collection(skh.db, "notifications"), {
                userId: targetId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.disputeWin',
                params: { title: String(title || ''), amount: amount.toLocaleString() },
                title: " SokoPay: Utatuzi wa Mgogoro!",
                body: `Msimamizi (Admin) ametatua mgogoro wa mkataba wa "${title}" na kuamua kuwa upewe TSh ${amount.toLocaleString()} [1]. Salio limeongezeka kwenye wallet yako.`,
                createdAt: new Date().toISOString(),
                read: false
            });
        }

        // C. MTUMIE ALIYEKOSA TAARIFA YA UTATUZI
        const loserId = winner === 'buyer' ? sellerId : buyerId;
        await skh.addDoc(skh.collection(skh.db, "notifications"), {
            userId: loserId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.disputeLose',
                params: { title: String(title || '') },
            title: " SokoPay: Uamuzi wa Mgogoro",
            body: `Mgogoro wa mkataba wa "${title}" umefungwa na kuamuliwa kwa manufaa ya upande wa pili [1]. Fedha zimetolewa kwenye Escrow.`,
            createdAt: new Date().toISOString(),
            read: false
        }).catch(() => {});

        alert(` MGOGORO UMETATULIWA!\n\nTSh ${amount.toLocaleString()} imetumwa salama kwenye wallet ya ${winner.toUpperCase()}.`);
        window.loadAdminDashboard(); // Refresh Admin Control Panel

    } catch (e) {
        alert(" Imeshindwa kutatua mgogoro: " + e.message);
    }
};

window.processSplitRefundPrompt = async function(orderId) {
    try {
        let orderRef = skh.doc(skh.db, "orders", orderId);
        let orderSnap = await skh.getDoc(orderRef);
        let amount = 0;
        let buyerId = "";
        let sellerId = "";
        let title = "";
        let isOrder = true;

        if (orderSnap.exists()) {
            const od = orderSnap.data();
            amount = parseFloat(od.amount || 0);
            buyerId = od.buyerId;
            sellerId = od.sellerId;
            title = od.itemTitle || "Order";
        } else {
            const linkRef = skh.doc(skh.db, "sokopay_links", orderId);
            const linkSnap = await skh.getDoc(linkRef);
            if (linkSnap.exists()) {
                const ld = linkSnap.data();
                amount = parseFloat(ld.price || ld.amount || 0);
                buyerId = ld.buyerId;
                sellerId = ld.userId;
                title = ld.title || "SokoPay Link";
                isOrder = false;
            } else {
                alert(" Hitilafu: Mkataba huu haujapatikana!");
                return;
            }
        }

        // Muulize Admin kiasi cha kumrejeshea mnunuzi (Refund amount)
        const refundInp = await skhPrompt(` SPLIT REFUND COCKPIT\nJumla ya Escrow iliyopo: TSh ${amount.toLocaleString()}\n\nAndika kiasi cha kumrudishia MNUNUZI (Buyer Refund):`, (amount / 2).toString());
        if (refundInp === null) return; // Mteja amebofya cancel

        const refundAmount = parseFloat(refundInp);
        if (isNaN(refundAmount) || refundAmount < 0 || refundAmount > amount) {
            alert(" Kiasi si sahihi au kimezidi kiasi kilichopo kwenye Escrow!");
            return;
        }

        const sellerAmount = amount - refundAmount; // Kiasi kinachobaki kinaenda kwa muuzaji

        if (!await skhConfirm(`Je, unathibitisha kugawa Escrow hivi:\n\n• Kurudisha kwa Mnunuzi: TSh ${refundAmount.toLocaleString()}\n• Kumlipa Muuzaji: TSh ${sellerAmount.toLocaleString()}`)) return;

        // A. Sasisha hali ya mkataba au oda kwenye database kuwa imetatuliwa kwa maelewano
        if (isOrder) {
            await skh.updateDoc(orderRef, { 
                status: "split_refund_resolved",
                buyerRefund: refundAmount,
                sellerPayout: sellerAmount,
                resolvedAt: new Date().toISOString()
            });
        } else {
            await skh.updateDoc(skh.doc(skh.db, "sokopay_links", orderId), { 
                status: "split_refund_resolved",
                buyerRefund: refundAmount,
                sellerPayout: sellerAmount,
                resolvedAt: new Date().toISOString()
            });
        }

        // B. LIPIA MNUNUZI (REFUND WALLET PAYMENT)
        const buyerQ = skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", buyerId));
        const buyerSnap = await skh.getDocs(buyerQ);
        if (!buyerSnap.empty) {
            // [PHASE 5.2b] kituo kimoja — skhWalletAdjust (legacy 1:1 geti likiwa off; server+ledger ikiwa on)
            await window.skhWalletAdjust(skh.doc(skh.db, "users", buyerSnap.docs[0].id), refundAmount, { type: 'refund', ledgerKey: 'splitref_buyer_' + orderId, note: 'Split refund - rejesho la mnunuzi' });
            await skh.addDoc(skh.collection(skh.db, "notifications"), {
                userId: buyerId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.splitRefund',
                params: { title: String(title || ''), amount: refundAmount.toLocaleString() },
                title: " SokoPay: Rejesho la Maelewano (Split Refund)!",
                body: `Mkataba wa "${title}" umesuluhishwa kwa maelewano [1]. Umerejeshewa TSh ${refundAmount.toLocaleString()} kwenye wallet yako.`,
                createdAt: new Date().toISOString(),
                read: false
            });
        }

        // C. LIPIA MUUZAJI (SELLER PAYOUT WALLET)
        const sellerQ = skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", sellerId));
        const sellerSnap = await skh.getDocs(sellerQ);
        if (!sellerSnap.empty) {
            // [PHASE 5.2b] kituo kimoja — skhWalletAdjust (legacy 1:1 geti likiwa off; server+ledger ikiwa on)
            await window.skhWalletAdjust(skh.doc(skh.db, "users", sellerSnap.docs[0].id), sellerAmount, { type: 'escrow_release', ledgerKey: 'splitref_seller_' + orderId, note: 'Split refund - malipo ya muuzaji' });
            await skh.addDoc(skh.collection(skh.db, "notifications"), {
                userId: sellerId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha ya msomaji.
                event: 'wallet.splitPayment',
                params: { title: String(title || ''), amount: sellerAmount.toLocaleString() },
                title: " SokoPay: Malipo ya Maelewano!",
                body: `Mkataba wa "${title}" umesuluhishwa kwa maelewano [1]. Umeingiziwa TSh ${sellerAmount.toLocaleString()} kwenye wallet yako.`,
                createdAt: new Date().toISOString(),
                read: false
            });
        }

        alert(` UTATUZI WA MAELEWANO UMEKABILIKA!\n\n• Mnunuzi amerudishiwa: TSh ${refundAmount.toLocaleString()}\n• Muuzaji amelipwa: TSh ${sellerAmount.toLocaleString()}`);
        window.loadAdminDashboard();

    } catch (e) {
        alert(" Imeshindwa kugawa Escrow: " + e.message);
    }
};

(function injectSokoHaiAccountMenuCSS(){
    const css = `
    #sidebarMenuModal.skh-account-menu { justify-content:flex-start !important; align-items:stretch !important; background:rgba(15,23,42,.45) !important; backdrop-filter:blur(6px); }
    .skh-menu-drawer { width:88%; max-width:360px; height:100%; background:#ffffff; border-radius:0 26px 26px 0; overflow:hidden; display:flex; flex-direction:column; box-shadow:12px 0 36px rgba(15,23,42,.28); }
    .skh-menu-head { background:linear-gradient(135deg,#0f172a,#00509d); color:white; padding:18px 16px; }
    .skh-menu-top { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px; }
    .skh-menu-top b { font-size:17px; letter-spacing:.4px; }
    .skh-menu-close { width:36px; height:36px; border:none; border-radius:12px; background:rgba(255,255,255,.14); color:white; font-weight:950; cursor:pointer; }
    .skh-user-card { display:flex; align-items:center; gap:12px; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.14); border-radius:16px; padding:12px; }
    .skh-user-card img { width:52px; height:52px; border-radius:50%; object-fit:cover; background:#e2e8f0; border:2px solid #D4AF37; flex-shrink:0; }
    .skh-user-card b { display:block; font-size:14px; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:210px; }
    .skh-user-card small { color:#cbd5e1; font-size:12.5px; }
    .skh-menu-scroll { flex:1; overflow-y:auto; padding:10px 10px 18px; background:#f8fafc; }
    .skh-menu-section-title { font-size:12.5px; font-weight:950; color:#64748b; text-transform:uppercase; letter-spacing:.8px; margin:14px 8px 7px; }
    .skh-menu-item { width:100%; display:flex; align-items:center; gap:12px; padding:12px 12px; border-radius:13px; background:white; border:1px solid #e2e8f0; color:#0f172a; font-size:13px; font-weight:850; cursor:pointer; margin-bottom:7px; text-align:left; min-height:46px; }
    .skh-menu-item:hover { background:#eef6ff; border-color:#bfdbfe; }
    .skh-menu-item .ico { width:24px; text-align:center; font-size:17px; flex-shrink:0; }
    .skh-menu-item .txt { min-width:0; flex:1; }
    .skh-menu-item .txt b { display:block; font-size:13px; color:#0f172a; }
    .skh-menu-item .txt small { display:block; font-size:12.5px; color:#64748b; font-weight:700; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .skh-menu-item .chev { color:#94a3b8; font-size:16px; }
    .skh-logout { background:#fff5f5 !important; border-color:#fecaca !important; color:#991b1b !important; }
    .skh-settings-modal-card { width:95%; max-width:560px; max-height:88vh; background:white; border-radius:24px; overflow:hidden; box-shadow:0 24px 70px rgba(15,23,42,.42); display:flex; flex-direction:column; }
    .skh-settings-head { background:linear-gradient(135deg,#0f172a,#00509d); color:white; padding:16px; display:flex; justify-content:space-between; align-items:center; gap:10px; }
    .skh-settings-head b { font-size:16px; }
    .skh-settings-body { padding:16px; overflow-y:auto; background:#f8fafc; }
    .skh-setting-card { background:white; border:1px solid #e2e8f0; border-radius:16px; padding:14px; margin-bottom:10px; }
    .skh-setting-card b { color:#0f172a; font-size:13px; }
    .skh-setting-card p { color:#64748b; font-size:12px; line-height:1.5; margin:6px 0 0; }
    .skh-setting-row { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #eef2f7; font-size:13px; color:#334155; }
    .skh-setting-row:last-child { border-bottom:none; }
    .skh-setting-row input[type="checkbox"] { width:18px; height:18px; }
    .skh-action-btn { width:100%; min-height:42px; border:none; border-radius:12px; background:#00509d; color:white; font-weight:950; margin-top:10px; cursor:pointer; }
    @media(max-width:520px){ .skh-menu-drawer{width:92%;max-width:none;border-radius:0 22px 22px 0;} .skh-user-card b{max-width:170px;} } `;
    const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

window.sokohaiAccountMenuItems = [
    { section:'Account', items:[
        ['profile','','My Profile','Taarifa binafsi, picha, mawasiliano'],
        ['verification','','Verification Center','Identity, company, government, community guard'],
        ['digital_identity','','Digital Identity','SokoHai ID, QR code, certificate']
    ]},
    { section:'Security & Privacy', items:[
        ['security','','Security','Password, PIN, biometric, 2FA'],
        ['privacy','','Privacy','Profile, location, media visibility'],
        ['permissions','','Permissions','Camera, microphone, GPS, notifications'],
        ['login_sessions','','Login & Sessions','Active sessions and login history'],
        ['connected_devices','','Connected Devices','Manage linked phones/computers']
    ]},
    { section:'Preferences', items:[
        ['notifications','','Notifications','Push, SMS, email, alerts'],
        ['messages','','Messages Settings','Chat, read receipts, blocked users'],
        ['language','','Language & Region','Language, country, currency, timezone'],
        ['appearance','','Appearance','Theme, font size, icon size'],
        ['accessibility','♿','Accessibility','High contrast, screen reader, large text']
    ]},
    { section:'Data & System', items:[
        ['downloads','','Downloads & Offline','Saved files and offline data'],
        ['backup','','Backup & Sync','Cloud backup, restore, sync'],
        ['data_storage','','Data & Storage','Cache, storage used, data usage'],
        ['ai_settings','','AI Assistant Settings','Language, voice, personalization']
    ]},
    { section:'Payments', items:[
                ['payment_methods','','Payment Methods','Mobile money, bank, cards']
    ]},
    { section:'Support', items:[
        ['feedback','','Feedback & Suggestions','Toa maoni au omba feature'],
        ['help','','Help Center','FAQs, guide, documentation'],
        ['tutorials','','Tutorials','Jifunze kutumia SokoHai'],
        ['contact_support','','Contact Support','Live chat, email, ticket'],
        ['report_problem','','Report a Problem','Bug, screenshot, logs'],
        ['rate','','Rate SokoHai','Rating and review']
    ]},
    { section:'Legal & About', items:[
        ['terms','','Terms of Service','Sheria za matumizi'],
        ['privacy_policy','','Privacy Policy','Sera ya faragha'],
        ['about','','About SokoHai','Version, build, licenses']
    ]}
];

// ==============================
// [REAL DATA 2026-09] SokoPay sub-tab data loaders — hakuna demo/theater tena.
// ==============================

// Mikataba wangu wa huduma (escrow orders zenye collectionName 'services')
window.skhLoadSokoPayContracts = function (cb) {
    if (!skh.currentUser) { if (cb) cb([]); return; }
    const uid = skh.currentUser.uid;
    const out = {}; // id -> order
    const finalize = () => {
        const list = Object.keys(out).map(id => out[id])
            .filter(o => o.collectionName === 'services')
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        if (cb) cb(list);
    };
    let done = 0;
    const go = () => { done++; if (done >= 2) finalize(); };
    skh.getDocs(skh.query(skh.collection(skh.db, 'orders'), skh.where('sellerId', '==', uid)))
        .then(snap => snap.forEach(d => { out[d.id] = { id: d.id, ...d.data() }; }))
        .catch(() => {}).finally(go);
    skh.getDocs(skh.query(skh.collection(skh.db, 'orders'), skh.where('buyerId', '==', uid)))
        .then(snap => snap.forEach(d => { out[d.id] = { id: d.id, ...d.data() }; }))
        .catch(() => {}).finally(go);
};

// Shehena zangu halisi (collection 'shipments'); fupisha kwa regex ya status fields ya kweli
window.skhLoadSokoPayShipments = function (cb) {
    if (!skh.currentUser) { if (cb) cb([]); return; }
    const uid = skh.currentUser.uid;
    const out = {};
    const finalize = () => {
        const list = Object.keys(out).map(id => out[id])
            .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
        if (cb) cb(list);
    };
    let done = 0;
    const go = () => { done++; if (done >= 4) finalize(); };
    const tryQ = (field) => skh.getDocs(skh.query(skh.collection(skh.db, 'shipments'), skh.where(field, '==', uid)))
        .then(snap => snap.forEach(d => { out[d.id] = { id: d.id, ...d.data() }; }))
        .catch(() => {}).finally(go);
    tryQ('senderId'); tryQ('receiverId'); tryQ('buyerId'); tryQ('sellerId');
};

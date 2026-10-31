/* ==== js/app/02-checkout.js ==== */
import { skh } from './00-bootstrap.js';

window.openCheckout = function(source) {
    if(!skh.requireAuth()) return;
    let amt = 0; 
    
    if(source === 'combined') {
        const productData = JSON.parse(sessionStorage.getItem('leg_construction'));
        const deliveryFee = 3000; 
        amt = parseFloat(productData.price) + deliveryFee;
        sessionStorage.setItem('final_combined_amount', amt);
        alert(`Unalipia: \nBidhaa: TSh ${productData.price.toLocaleString()} \nNauli: TSh ${deliveryFee.toLocaleString()}`);
    } 
    else if(source === 'cart') { 
        skh.myCart.forEach(x => { amt += parseFloat(x.price || 0); }); 
    } 
    else {
        // Imesahihishwa: SokoPay ikitumika, tunasoma currentOpenProduct
        if (skh.currentOpenProduct && (source === 'direct' || skh.currentOpenProduct.isSokoPay)) {
            amt = parseFloat(skh.currentOpenProduct.price || 0);
        } else {
            const product = JSON.parse(sessionStorage.getItem('pending_order_product'));
            amt = parseFloat(product?.price || 0);
        }
    }
    
    if(amt <= 0) { alert(" Hitilafu: Kiasi cha malipo hakijapatikana."); return; }
    
    skh.activeCheckoutAmount = amt;
    document.getElementById('checkoutAmount').value = `TSh ${amt.toLocaleString()}`; 
    closeModals();
    document.getElementById('checkoutModal').style.display = 'flex';
};

window.processPayment = async function() {
    const btn = document.getElementById('btnPay'); 
    let provider = "";
    let accountNumber = "";
    
    // Kagua kama anatumia akaunti iliyosaviwa au anaandika mpya
    const savedInfoDiv = document.getElementById('savedPaymentInfo');
    const isUsingSaved = savedInfoDiv && savedInfoDiv.style.display === 'block';

    if (isUsingSaved) {
        provider = document.getElementById('hiddenProvider').value;
        accountNumber = document.getElementById('hiddenPhone').value;
        provider = provider.replace(' Bank', ''); 
        if (provider === "Visa/Mastercard") provider = "Visa";
    } else {
        provider = document.getElementById('checkoutProvider').value;
        
        // Kuchagua namba sahihi kulingana na njia iliyochaguliwa
        const isMNO = ["Mpesa", "Airtel", "Tigo", "Halopesa"].includes(provider);
        const isBank = ["CRDB", "NMB", "NBC", "PBZ"].includes(provider);
        const isCard = ["Visa", "Mastercard"].includes(provider);

        if (isMNO) {
            accountNumber = document.getElementById('checkoutPhone')?.value.trim() || '';
        } else if (isBank) {
            accountNumber = document.getElementById('checkoutBankAccount')?.value.trim() || '';
        } else if (isCard) {
            accountNumber = document.getElementById('checkoutCardNumber')?.value.trim() || '';
        }
    }

    if (!provider || !accountNumber) {
        alert(" jaza taarifa zako za malipo (Namba ya simu, akaunti, au kadi ya benki)!");
        return;
    }

    // Uhakiki wa M-Pesa format
    const isMNO = ["Mpesa", "Airtel", "Tigo", "Halopesa"].includes(provider);
    if (isMNO) {
        if (accountNumber.startsWith('0')) {
            accountNumber = '255' + accountNumber.substring(1);
        } else if (!accountNumber.startsWith('255')) {
            alert(" Namba ya simu ya kulipia lazima ianze na 07XX au 2557XX");
            return;
        }
    }

    if (!btn) return;
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = ' INAELEKEZA KWA PESAPAL...'; 
    btn.disabled = true;
    
    try {
        const txRef = "ESCROW_" + Date.now(); 

        // [PesaPal] PesaPal ni hosted checkout kwa njia ZOTE (MNO/bank/kadi).
        // Tunaomba URL ya malipo kutoka Cloud Function 'pesapalCheckout' (secret server-side).
        if (!window.skhServerPaymentsCheckout) {
            throw new Error("Backend ya malipo (pesapalCheckout) haipatikani. Pakia Cloud Functions.");
        }

        // [DELIVERY OPTION 2026-09] Chaguo la usafirishaji ni HATUA YA HIARI
        // na haijumuishwi kwenye malipo ya bidhaa. Kama mteja alishachagua
        // (cart) au yuko kwenye mfululizo wa Lipa Sasa, peleka muktadha ili
        // oda iungane na usafiri HALISI baada ya malipo kuthibitishwa.
        let postPayDelivery = null, simpleDelivery = null, deliveryUndecided = false;
        try {
            var pp = sessionStorage.getItem('sokohai_delivery_session');
            if (pp) postPayDelivery = JSON.parse(pp);
        } catch (e) {}
        try {
            if (window.skhDeliveryState) {
                var dc = window.skhDeliveryState();
                if (dc.chosen) {
                    var payloadItems = (skh.myCart && skh.myCart.length) ? skh.myCart
                        : (skh.currentOpenProduct ? [skh.currentOpenProduct] : []);
                    if (window.skhDeliveryPayloadFor) simpleDelivery = window.skhDeliveryPayloadFor(payloadItems);
                } else if (sessionStorage.getItem('sokohai_buynow') === '1') {
                    deliveryUndecided = true;
                }
            }
        } catch (e) {}

        // 1) Hifadhi muktadha wa oda KABLA ya kwenda PesaPal (17-pesapal-return.js inamalizia)
        // [§31] Muktadha wa commerce mode zaidi — kama checkout ilitoka
        // auction/price_drop/group_buy/wholesale, hifadhi ili order ya 17
        // ipeleke commerceMode + modeData snapshot (kuthibitisha baadaye).
        let commerceContext = null;
        try {
            const cc = sessionStorage.getItem('skh_checkout_commerce_context');
            if (cc) commerceContext = JSON.parse(cc);
            sessionStorage.removeItem('skh_checkout_commerce_context');
        } catch (e) { commerceContext = null; }

        const pendingCheckout = {
            txRef: txRef,
            amount: skh.activeCheckoutAmount,
            provider: provider,
            commerceContext: commerceContext,   // [§31]
            buyerUid: skh.currentUser ? skh.currentUser.uid : null,
            savedAt: new Date().toISOString(),
            product: (skh.currentOpenProduct && (!skh.myCart || skh.myCart.length === 0)) ? {
                id: skh.currentOpenProduct.id,
                title: skh.currentOpenProduct.title || skh.currentOpenProduct.company || 'Bidhaa',
                userId: skh.currentOpenProduct.userId,
                ownerName: skh.currentOpenProduct.ownerName || 'Muuzaji',
                price: parseFloat(skh.currentOpenProduct.price) || skh.activeCheckoutAmount,
                quantity: Math.max(1, parseInt(document.getElementById('pmQty')?.value || '1', 10) || 1),
                selectedVariant: Object.assign({}, skh.currentOpenProduct.selectedVariants || {}, { color: skh.currentOpenProduct.chosenColor || undefined, size: skh.currentOpenProduct.chosenSize || undefined }),
                image: skh.currentOpenProduct.image || '',
                location: skh.currentOpenProduct.location || skh.currentOpenProduct.sellerLocation || '',
                isSokoPay: !!skh.currentOpenProduct.isSokoPay,
                // [§31] ndani ya every order — mode context
                commerceMode: skh.currentOpenProduct.commerceMode || (commerceContext && commerceContext && (commerceContext.commerceMode || commerceContext.mode || commerceContext.type)) || null,
                commerceModeSnapshot: skh.currentOpenProduct.commerceModeSnapshot || null
            } : null,
            cart: (skh.myCart && skh.myCart.length) ? skh.myCart.map(function (x) {
                return Object.assign({}, x, { location: x.location || x.sellerLocation || (x.cartMeta && x.cartMeta.pickupAddress) || '' });
            }) : [],
            delivery: simpleDelivery,
            deliveryUndecided: deliveryUndecided,
            postPayDelivery: postPayDelivery
        };

        // 2) Omba URL ya malipo ya PesaPal
        let d = {};
        try {
            const res = await window.skhServerPaymentsCheckout({
                amount: skh.activeCheckoutAmount,
                orderTrackingId: txRef,
                externalId: txRef,
                phone: accountNumber,
                provider: provider,
                description: "SokoHai Escrow Purchase",
                customerName: (skh.currentUser && (skh.currentUser.displayName || skh.currentUser.email)) || "Mteja",
                email: (skh.currentUser && skh.currentUser.email) || "",
                redirectUrl: (window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")) ? window.location.origin + "/?pesapal_return=1" : ""
            });
            d = (res && res.data) || {};
        } catch (serverError) {
            // [DEMO MODE] backend haipo — simulation inaruhusiwa kwa majaribio PEKEE
            if (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.DEMO_MODE) {
                pendingCheckout.orderTrackingId = txRef;
                try { skh.localStorage.setItem('sokohai_pending_checkout', JSON.stringify(pendingCheckout)); } catch (e) {}
                if (typeof window.skhPesaPalFinishCheckout === 'function') {
                    const fin = await window.skhPesaPalFinishCheckout(pendingCheckout, { state: 'success', transactionId: 'DEMO_' + Date.now() });
                    if (fin && fin.ok) {
                        alert(" [DEMO MODE] Malipo ya majaribio yamekubaliwa — oda imeumbwa kwenye Escrow.");
                        window.location.reload();
                        return;
                    }
                }
            }
            throw new Error("Server ya malipo imehitilafu (" + (window.skhPesaPalErrMsg ? window.skhPesaPalErrMsg(serverError) : ((serverError && serverError.message) || "haijulikani")) + "). Muamala HAUJAKAMILIKA.");
        }

        if (!d || !d.ok || !d.redirectUrl) {
            throw new Error((d && (d.message || d.error)) || "PesaPal haikurudisha URL ya malipo.");
        }

        // 3) Hifadhi pending + elekeza PesaPal
        pendingCheckout.orderTrackingId = d.orderTrackingId || txRef;
        try { skh.localStorage.setItem('sokohai_pending_checkout', JSON.stringify(pendingCheckout)); } catch (e) { console.warn('pending checkout haikuhifadhiwa', e && e.message); }
        window.location.href = d.redirectUrl;
        return;

    } catch (error) {
        alert(" Malipo hayajakamilika: " + (error.message || "Imeshindwa kukamilisha malipo."));
    } finally {
        if (btn) {
            btn.innerHTML = originalBtnText; 
            btn.disabled = false;
        }
    }
};

window.saveAdminSettings = function() {
        const inp = document.getElementById('adminAccountInput');
        if(inp && inp.value.trim() !== '') {
            alert(" Akaunti " + inp.value + " imehifadhiwa kikamilifu kwa kupokelea mapato ya mfumo.");
            closeModals();
        } else {
            alert("ingiza namba ya akaunti.");
        }
    };

window.approveAgent = async function(agentDocId, userUid) {
        /* [REPAIR 2026-10 C1] Uidhinishaji wa wakala ni wa SERVER (adminApproveAgent):
           server inathibitisha cheo cha admin, inatengeneza namba ya wakala ya kipekee,
           inaandika users.isApprovedAgent + agents.status kwa transaction moja, na
           kuweka rekodi ya kudumu kwenye admin_audit_log. Kivinjari hakiandiki tena. */
        if(!await skhConfirm("Una uhakika unataka kumpitisha mtumiaji huyu kuwa Wakala Rasmi?")) return;
        try {
            const call = (typeof skh.wrapCallable === 'function') ? skh.wrapCallable('adminApproveAgent') : null;
            if (!call) throw new Error('Huduma ya server (adminApproveAgent) haipatikani.');
            const res = await call({ agentDocId: agentDocId });
            const code = res && res.data && res.data.agentCode;
            alert(` Umempitisha Wakala! Namba yake ni ${code || '(imehifadhiwa)'}`);
            loadAdminDashboard();
        } catch(e) {
            alert("Kosa: " + ((e && e.message) || e));
        }
    };

window.rejectAgent = async function(agentDocId) {
        const sababu = await skhPrompt("Andika sababu ya kumkataa (k.m. Picha haionekani vizuri):");
        if(sababu === null) return; // Kama admin amecancel
        try {
            const call = (typeof skh.wrapCallable === 'function') ? skh.wrapCallable('adminRejectAgent') : null;
            if (!call) throw new Error('Huduma ya server (adminRejectAgent) haipatikani.');
            await call({ agentDocId: agentDocId, reason: sababu });
            alert(" Umekataa ombi hili.");
            loadAdminDashboard(); // Refresh dashbodi
        } catch(e) {
            alert("Kosa: " + ((e && e.message) || e));
        }
    };

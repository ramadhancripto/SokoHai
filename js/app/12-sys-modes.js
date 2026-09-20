/* ==== js/app/12-sys-modes.js ==== */
import { skh } from './00-bootstrap.js';

window.toggleSysMode = async function(modeName) {
    if(!skh.sysConfig) skh.sysConfig = {};
    if(!skh.sysConfig.modes) skh.sysConfig.modes = {};
    
    try {
        const configRef = skh.doc(skh.db, "system", "config");
        // [FIX 2026-09] Soma hali mpya kwanza (epuka mbio ya stale data).
        try {
            const snap = await skh.getDoc(configRef);
            if (snap && snap.exists && snap.exists() && snap.data()) {
                skh.sysConfig = Object.assign({}, snap.data());
                if (!skh.sysConfig.modes) skh.sysConfig.modes = {};
            }
        } catch (e) { /* endelea na memory */ }

        const newVal = skh.sysConfig.modes[modeName] === false ? true : false;
        skh.sysConfig.modes[modeName] = newVal;

        // [FEE FIX 2026-09] setDoc({merge}) — inaunda `system/config` ikiwa haipo
        // bado (badala ya updateDoc inayotupa "not-found" kwenye toggle ya kwanza).
        await skh.setDoc(configRef, { ['modes.' + modeName]: newVal }, { merge: true });
        console.log(`Mode ${modeName} imebadilishwa → ${newVal ? 'WASHA' : 'ZIMA'}.`);

        // Onyesha mabadiliko MARA MOJA kwenye UI (admin + tabs za feed + fomu).
        if (typeof window.skhApplyModeSwitches === 'function') window.skhApplyModeSwitches();
    } catch(e) {
        alert("Kosa: " + e.message);
        throw e; // [FIX 2026-09] Ruhusu kitufe kirudishe hali yake ikiwa save imeshindwa.
    }

    // Refresh ya UI ya admin — IKIWA imeshindwa, usifanye ionekane kama save imeshindwa.
    try { if (typeof loadAdminDashboard === 'function') loadAdminDashboard(); } catch(e) { console.error("Refresh ya admin imeshindwa:", e); }
};

setInterval(() => {
    const nowMs = Date.now();
    
    // 1. Timers (Mnada, Group Buy, Price Drop) zinashuka sekunde kwa sekunde
    document.querySelectorAll('.live-timer').forEach(el => {
        const end = parseInt(el.getAttribute('data-endtime'));
        const diff = end - nowMs;
        if (diff <= 0) {
            el.innerText = " Imeisha";
        } else {
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            if (d > 0) el.innerText = ` ${d}Siku ${h}h ${m}m`;
            else if (h > 0) el.innerText = ` ${h}h ${m}m ${s}s`;
            else el.innerText = ` ${m}m ${s}s`;
        }
    });

    // 2. Price Drop Live (Bei Inajishusha Yenyewe Machoni Live!)
    document.querySelectorAll('.live-price-drop').forEach(el => {
        const start = parseInt(el.getAttribute('data-start'));
        const end = parseInt(el.getAttribute('data-end'));
        const base = parseFloat(el.getAttribute('data-base'));
        const min = parseFloat(el.getAttribute('data-min'));
        const interval = parseInt(el.getAttribute('data-interval'));
        const dropAmt = parseFloat(el.getAttribute('data-drop'));

        if (nowMs >= end) {
            el.innerText = ` Sasa: TSh ${Math.round(min).toLocaleString()}`;
        } else {
            const dropsOccurred = Math.floor((nowMs - start) / interval);
            let currentP = base - (dropsOccurred * dropAmt);
            if (currentP < min) currentP = min;
            el.innerText = ` Sasa: TSh ${Math.round(currentP).toLocaleString()}`;
        }
    });
}, 1000);

window.verifyAndProceedSeriousAction = async function(actionName, itemMode, itemId, callbackFn) {
    if(!skh.requireAuth()) return;

    // [FIX 2026-09] Swichi za modes zifanye kazi: ikiwa Admin amezima mode
    // (mnada/bei kushuka/group buy), zuia serious action papo hapo.
    if (itemMode && skh.sysConfig && skh.sysConfig.modes && skh.sysConfig.modes[itemMode] === false) {
        alert(" Samahani, mfumo huu umezimwa kwa muda na Admin.");
        return;
    }

    // MAREKEBISHO: Kagua kwanza kama Admin amezima vigezo vya malipo ya dharura/deposit
    // [ADMIN PAYMENTS SWITCH] Ada ya deposit imezimwa = FREE (hakuna deposit). ON = lazima ulipe.
    if(!skh.paymentGate('deposit')) {
        callbackFn(); // Inaruhusu moja kwa moja bila kumdai pesa
        return;
    }

    let payPromptText = "";
    if (itemMode === 'group_buy') {
        payPromptText = ` Kushiriki GROUP BUY unahitaji Deposit ya TSh 1,300.\n(TSh 1,000 itarejeshwa kwenye bei ya mwisho ukikamilisha oda).\n\nJe, unathibitisha malipo haya?`;
    } else if (itemMode === 'auction') {
        payPromptText = ` Kushiriki Mnada unahitaji Deposit ya TSh 1,300.\n(TSh 1,000 itarejeshwa ukishinda).\n\nJe, unathibitisha malipo haya?`;
    } else if (itemMode === 'price_drop') {
        payPromptText = ` Kufungia bei hii, inahitajika Deposit ya TSh 1,300.\n(TSh 1,000 itarudi ukilipia bei ya mwisho).\n\nJe, unathibitisha malipo haya?`;
    } else {
        callbackFn();
        return;
    }

    const depositId = `${skh.currentUser.uid}_${itemId}`;
    const depositRef = skh.doc(skh.db, "serious_deposits", depositId);
    
    try {
        const depSnap = await skh.getDoc(depositRef);
        if (depSnap.exists() && depSnap.data().hasActiveDeposit) {
            callbackFn(); // Alishalipa hapo mwanzo, mruhusu aendelee
            return;
        }

        let payPhone = skh.currentUserData?.paymentAccount || skh.currentUserData?.phone;
        if(!payPhone) {
            alert(" Tafadhali sajili Namba yako ya Malipo kwenye akaunti yako kwanza.");
            window.openUserPaymentModal();
            return;
        }
        
        if(!confirm(`${payPromptText}\n\nNamba ya kulipia: ${payPhone}`)) return;
        if(payPhone.startsWith('0')) payPhone = '255' + payPhone.substring(1);

        alert(" Inaelekeza kwenye PesaPal ili ulipe deposit ya TSh 1,300...");

        // [PesaPal] Hosted checkout — deposit itahifadhiwa baada ya kurudi (17-pesapal-return)
        const dep = await window.skhPesaPalPay({
            amount: 1300,
            kind: 'deposit_item',
            phone: payPhone,
            provider: 'PesaPal',
            description: 'Deposit ya serious action (Group Buy / Mnada / Price Drop)',
            context: { depositId: depositId, itemId: itemId, uid: skh.currentUser.uid, email: (skh.currentUser && skh.currentUser.email) || '' }
        });
        if (!dep.ok) {
            alert(" Ombi la malipo ya deposit limeshindikana: " + (dep.error || "jaribu tena."));
        }
        // Deposit itaandikwa kwenye serious_deposits baada ya kurudi kutoka PesaPal
    } catch (err) {
        alert("Hitilafu ya Mtandao: " + err.message);
    }
};

window.handleModeAction = function() {
    if(!skh.currentOpenProduct) return;
    const mode = skh.currentOpenProduct.saleMode || 'free_market';
    const itemId = skh.currentOpenProduct.id;

    verifyAndProceedSeriousAction("Action", mode, itemId, async () => {
        if(mode === 'auction') {
            const bid = prompt("Ingiza Kiasi cha Ku-bid (TSh):");
            if(bid) {
                const bidAmt = parseFloat(bid);
                await skh.updateDoc(skh.doc(skh.db, skh.currentOpenProduct.collectionName, itemId), {
                    "modeData.currentBid": bidAmt,
                    "modeData.maxBidder": skh.currentUser.uid,
                    "modeData.totalBids": skh.increment(1)
                });
                alert(` Dau limewekwa!`);
            }
        } 
        else if(mode === 'group_buy') {
            await skh.updateDoc(skh.doc(skh.db, skh.currentOpenProduct.collectionName, itemId), {
                "modeData.joinedUsers": skh.increment(1),
                "modeData.participants": skh.arrayUnion(skh.currentUser.uid)
            });
            alert(" Umejiunga na Kundi!");
        } 
        else if(mode === 'price_drop') {
            await skh.updateDoc(skh.doc(skh.db, skh.currentOpenProduct.collectionName, itemId), {
                "modeData.lockedBy": skh.currentUser.uid,
                "modeData.lockedAt": Date.now()
            });
            alert(" Bei imefungiwa kwako!");
        }
    });
};

window.checkoutSeriousMode = function(finalPrice) {
    if(!skh.requireAuth() || !skh.currentOpenProduct) return;
    
    // Punguza Elfu 1,000 Kama Rejesho la Deposit yake aliyolipa mwanzo! TSh 300 inabaki kama faini ya mfumo.
    // Kata 1,000 tu kama admin amewasha mfumo wa Deposit ada (na malipo yako ON).
let amountToPay = Math.round(finalPrice);
if (skh.paymentGate('deposit')) {
    amountToPay = amountToPay - 1000;
}
    if(amountToPay < 0) amountToPay = 0;

    skh.activeCheckoutAmount = amountToPay;
    const ca = document.getElementById('checkoutAmount');
    if(ca) ca.value = `TSh ${amountToPay.toLocaleString()}`;

    // Safisha kikapu ili alipie hii bidhaa pekee
    skh.myCart = [];
    skh.currentOpenProduct.calculatedTotalCost = amountToPay;

    closeModals();
    const cm = document.getElementById('checkoutModal');
    if(cm) cm.style.display = 'flex';
};

window.listenToUnreadNotifications = skh.listenToUnreadNotifications;

window.loadMainFeed = skh.loadMainFeed;

window.renderFeedUI = skh.renderFeedUI;

window.openEditModal = async function(id, collectionName) {
    if(!skh.requireAuth()) return;
    
    // Vuta bidhaa
    let itemToEdit = skh.cachedItems.find(item => item.id === id);
    if(!itemToEdit) {
        try {
            const docSnap = await skh.getDoc(skh.doc(skh.db, collectionName, id));
            if(docSnap.exists()) { 
                itemToEdit = { id: docSnap.id, collectionName: collectionName, ...docSnap.data() }; 
            } 
            else { alert("Bidhaa haijapatikana."); return; }
        } catch(e) { alert("Kosa: " + e.message); return; }
    }

    document.getElementById('editId').value = itemToEdit.id;
    document.getElementById('editCollection').value = collectionName;
    document.getElementById('editTitle').value = itemToEdit.title || '';
    document.getElementById('editPrice').value = itemToEdit.price || '';
    document.getElementById('editLocation').value = itemToEdit.location || '';
    document.getElementById('editDesc').value = itemToEdit.description || '';

    const modeSelect = document.getElementById('editSaleMode');
    const warning = document.getElementById('editModeWarning');
    const currentModeVal = itemToEdit.saleMode || 'free_market';
    const mData = itemToEdit.modeData || {};
    const nowMs = Date.now();

    modeSelect.value = currentModeVal;

    let isTimeLocked = false;
    if (['auction', 'price_drop', 'group_buy'].includes(currentModeVal)) {
        if (mData.endTime && nowMs < mData.endTime) {
            isTimeLocked = true;
        }
    }

    if (isTimeLocked) {
        modeSelect.setAttribute('disabled', 'true');
        if(warning) warning.style.display = 'block';
    } else {
        modeSelect.removeAttribute('disabled');
        if(warning) warning.style.display = 'none';
    }

    window.toggleEditModeFields(); 
    
    closeModals();
    document.getElementById('plusMenu').style.display = 'flex';
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('editModal').style.display = 'block';}

window.toggleEditModeFields = function() {
    const mode = document.getElementById('editSaleMode').value;
    const container = document.getElementById('editDynamicModeFields');
    const sections = ['edit_mode_auction', 'edit_mode_price_drop', 'edit_mode_wholesale', 'edit_mode_group_buy'];
    
    if (mode === 'free_market') {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
        sections.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = (id === 'edit_mode_' + mode) ? 'block' : 'none';
        });
    }
};

window.submitEditForm = async function(event) {
    event.preventDefault();
    if(!skh.requireAuth()) return;

    const btn = document.getElementById('btnSubmitEdit');
    const originalText = btn.innerHTML;
    btn.innerHTML = " INAHIFADHI...";
    btn.disabled = true;

    const id = document.getElementById('editId').value;
    const collectionName = document.getElementById('editCollection').value;
    const title = document.getElementById('editTitle').value.trim();
    const price = parseFloat(document.getElementById('editPrice').value) || 0;
    const location = document.getElementById('editLocation').value.trim();
    const desc = document.getElementById('editDesc').value.trim();
    const saleMode = document.getElementById('editSaleMode').value;

    try {
        await skh.updateDoc(skh.doc(skh.db, collectionName, id), {
            title: title,
            price: price,
            location: location,
            description: desc,
            saleMode: saleMode
        });
        alert(" Tangazo limehaririwa!");
        window.closeModals();
        loadAndRenderDashboard();
    } catch(e) {
        alert(" Imeshindikana: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

setTimeout(function() {
    if (skh.currentUserData && skh.currentUserData.sosProfile && skh.currentUserData.sosProfile.voiceEnabled) {
        window.startVoiceListener();
    }
}, 3000);

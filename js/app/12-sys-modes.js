/* ==== js/app/12-sys-modes.js ==== */
import { skh } from './00-bootstrap.js';

/* [FIX TOGGLE 2026-09-14] MIGRATION
   Bug ya awali (setDoc + dot-notation) iliacha fields BAPA kwenye
   `system/config`, mfano: {"modes.auction": true} badala ya
   {modes: {auction: true}}. Usomaji ulikuwa unaangalia nested pekee,
   hivyo switch ilionekana OFF hata baada ya kuwasha.
   Hii inarekebisha data iliyokwishaharibika, mara moja tu. */
window.skhHealSysConfig = function (data) {
    if (!data || typeof data !== 'object') return { fixed: null, count: 0 };
    var flat = Object.keys(data).filter(function (k) { return k.indexOf('.') !== -1; });
    if (!flat.length) return { fixed: null, count: 0 };
    var out = Object.assign({}, data);
    flat.forEach(function (k) {
        var parts = k.split('.');
        var parent = parts.shift(), child = parts.join('.');
        if (!out[parent] || typeof out[parent] !== 'object') out[parent] = {};
        if (out[parent][child] === undefined) out[parent][child] = data[k];
        delete out[k];
    });
    return { fixed: out, count: flat.length, flatKeys: flat };
};

window.toggleSysMode = async function(modeName) {
    if(!skh.sysConfig) skh.sysConfig = {};
    if(!skh.sysConfig.modes) skh.sysConfig.modes = {};
    
    try {
        const configRef = skh.doc(skh.db, "system", "config");
        // [FIX 2026-09] Soma hali mpya kwanza (epuka mbio ya stale data).
        try {
            const snap = await skh.getDoc(configRef);
            if (snap && snap.exists && snap.exists() && snap.data()) {
                var raw = snap.data();
                var heal = window.skhHealSysConfig(raw);
                if (heal.count) {
                    skh.sysConfig = heal.fixed;
                    // Safisha Firestore: weka nested, ondoa bapa
                    try {
                        var patch = {};
                        heal.flatKeys.forEach(function (k) { patch[k] = skh.deleteField ? skh.deleteField() : null; });
                        await skh.setDoc(configRef, heal.fixed, { merge: true });
                        if (skh.deleteField) await skh.updateDoc(configRef, patch);
                    } catch (e) { /* si lazima ifanikiwe */ }
                } else {
                    skh.sysConfig = Object.assign({}, raw);
                }
                if (!skh.sysConfig.modes) skh.sysConfig.modes = {};
            }
        } catch (e) { /* endelea na memory */ }

        const newVal = skh.sysConfig.modes[modeName] === false ? true : false;
        skh.sysConfig.modes[modeName] = newVal;

        // [FIX TOGGLE 2026-09-14] BUG: `setDoc(..., {merge:true})` HAITAFSIRI
        // dot-notation. Ilikuwa inaunda field BAPA yenye jina "modes.auction"
        // badala ya kuingiza ndani ya map `modes`. Kwa hiyo usomaji
        // (`sysConfig.modes[modeName]`) haukuiona KAMWE — kila switch ilirudi OFF.
        // `updateDoc` ndiyo inayoelewa dot-paths; `setDoc` ya nested ni fallback
        // ikiwa doc bado haijaundwa.
        try {
            await skh.updateDoc(configRef, { ['modes.' + modeName]: newVal });
        } catch (errUpd) {
            var nested = { modes: {} };
            nested.modes[modeName] = newVal;
            await skh.setDoc(configRef, nested, { merge: true });
        }
        console.log(`Mode ${modeName} imebadilishwa -> ${newVal ? 'WASHA' : 'ZIMA'}.`);

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
        alert(" mfumo huu umezimwa kwa muda na Admin.");
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
            alert(" sajili Namba yako ya Malipo kwenye akaunti yako kwanza.");
            window.openUserPaymentModal();
            return;
        }
        
        if(!await skhConfirm(`${payPromptText}\n\nNamba ya kulipia: ${payPhone}`)) return;
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
            const bid = await skhPrompt("Ingiza Kiasi cha Ku-bid (TSh):");
            if(bid) {
                const bidAmt = parseFloat(bid);
                // [§8 ONE CORE] Pitia validator moja (07): re-read + transaction
                // + outbid/seller ARIFA + bids history — hakuna blind overwrite.
                const r = await window.skhAuctionPlaceBid(itemId, bidAmt);
                if (!r.ok) { alert('Dau halijakubaliwa: ' + r.error); return; }
                alert(` Dau limewekwa!`);
            }
        } 
        else if(mode === 'group_buy') {
            // [§8 ONE CORE] Na hapa pia (unique-joiner guard + lifecycle).
            const rg = await window.skhGroupBuyJoin(itemId);
            if (!rg.ok) { alert('Imeshindikana kujiunga: ' + rg.error); return; }
            alert(rg.already ? "Ulishajiunga kabisa! Endelea na malipo." : " Umejiunga na Kundi!");
        } 
        else if(mode === 'price_drop') {
            await skh.updateDoc(skh.doc(skh.db, skh.currentOpenProduct.collectionName, itemId), { "modeData.lockedBy": skh.currentUser.uid, "modeData.lockedAt": Date.now()
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
    // [§31 ORDER RECORD] Mada ya commerce-mode: order ijue hii purchase
    // inatoka mode gani (mode data snapshot — isije ika no ya kawaida).
    const srcMode = skh.currentOpenProduct.saleMode || 'free_market';
    skh.currentOpenProduct.commerceMode = srcMode;
    skh.currentOpenProduct.commerceModeSnapshot = {
        mode: srcMode, modeData: skh.currentOpenProduct.modeData || null,
        savedAt: new Date().toISOString()
    };
    try {
        sessionStorage.setItem('skh_checkout_commerce_context', JSON.stringify({
            type: srcMode, mode: srcMode, sourceType: skh.currentOpenProduct.collectionName || 'products',
            sourceId: skh.currentOpenProduct.id || null,
            amount: amountToPay, at: new Date().toISOString()
        }));
    } catch (e) {}

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

    // [§23-§24M PREFILL] Jaza fields za mode zilizopo — muuzaji aone
    // hali ya sasa badala ya tupu (kusangua-cookies = kubahatisha).
    try {
        const mdl = itemToEdit.modeData || {};
        const toLocalInput = (ms) => {
            if (!ms) return '';
            const d = new Date(Number(ms)); if (isNaN(d.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        };
        const SV = (id, v) => { const e = document.getElementById(id); if (e && v !== undefined && v !== null && v !== '') e.value = String(v); };
        SV('editAucEndTime', toLocalInput(mdl.endTime));
        SV('editPdMinPrice', mdl.minPrice);
        SV('editPdIntervalType', mdl.intervalMs);
        SV('editPdEndTime', toLocalInput(mdl.endTime));
        SV('editGbDiscount', mdl.discountValue);
        SV('editGbDiscountType', mdl.discountType);
        SV('editGbMaxPeople', mdl.targetPeople);
        SV('editGbEndTime', toLocalInput(mdl.endTime));
        SV('editWsDiscount', mdl.discountValue);
        SV('editWsDiscountType', mdl.discountType);
        SV('editWsMinQty', mdl.minQty);
        if (Array.isArray(mdl.tiers) && mdl.tiers.length) {
            SV('editWsTiersText', mdl.tiers.map(function (t) { return t.minQty + ':' + t.price; }).join('; '));
        }
    } catch (e) { console.warn('[EDIT-MODE PREFILL]', e && e.message); }

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
        // [§23 PROTECTION] Soma doc kwanza — baadhi ya fields ni LAZIRA
        // zikishapitia transactions (bids/participants/deals). Kubadili mode
        // kutoka/enye transactions = kuvuja uharari (nendee nishang'aa).
        const prodRef = skh.doc(skh.db, collectionName, id);
        const fresh = await skh.getDoc(prodRef);
        const fm = (fresh && fresh.exists && fresh.exists()) ? (fresh.data().modeData || {}) : {};
        const curMode = (fresh && fresh.exists && fresh.exists()) ? (fresh.data().saleMode || 'free_market') : null;
        const totalBids = parseInt(fm.totalBids) || 0;
        const joinedUsers = parseInt(fm.joinedUsers) || 0;

        // Protection A: kubadili mode kutoka/enye transactions haiiliruhusu.
        if (totalBids > 0 && curMode === 'auction' && saleMode !== 'auction') {
            alert(' Huwezi kubadili mode (mnada una zabuni ' + totalBids + ') — subiri umefungwe, au ghairi mnada kwanza.');
            btn.innerHTML = originalText; btn.disabled = false; return;
        }
        if (joinedUsers > 1 && curMode === 'group_buy' && saleMode !== 'group_buy') {
            alert(' Huwezi kubadili mode (kundi lina ' + joinedUsers + ' waliojiunga) — that inavuta wanaoshikilia deposit.');
            btn.innerHTML = originalText; btn.disabled = false; return;
        }
        // Protection B: bei (au bei ya kuanza-hiyo-hiyo) haiwezi kurekebishwa baada ya zabuni.
        const updateMap = { title: title, price: price, location: location, description: desc, saleMode: saleMode };
        if (totalBids > 0 && curMode === 'auction') {
            const oldPrice = parseFloat(fresh.data().price) || 0;
            if (isFinite(price) && price !== oldPrice) {
                // Usirekebishe bei baada ya zabuni — mnada unategemea bei ya msingi.
                updateMap.price = oldPrice;
                alert(' Kumbuka: bei (ya msingi) haikubadilishwa — mnada una zabuni tayari.');
            }
        }

        // [§23 SAVE modeData] Hifadhi ya fields ziperuzi za mode zinazoweza
        // kuharirwa KAMA SALAMA kulingana na hali ya transactions.
        if (saleMode === 'auction' && totalBids === 0) {
            const et = document.getElementById('editAucEndTime');
            if (et && et.value) updateMap['modeData.endTime'] = new Date(et.value).getTime();
        }
        if (saleMode === 'price_drop') {
            const pmin = document.getElementById('editPdMinPrice');
            const pit = document.getElementById('editPdIntervalType');
            const pend = document.getElementById('editPdEndTime');
            // [§23] Hifadhi regiment mpya ya Price Drop (recompute dropAmount
            // kwa jumla ya muda — sio kubahatisha ukuaji).
            if (pmin && pmin.value) {
                const minP = parseFloat(pmin.value);
                const itv = pit ? (parseInt(pit.value) || 60000) : 60000;
                const endE = pend && pend.value ? new Date(pend.value).getTime() : (fm.endTime || (Date.now() + 86400000));
                const total = Math.max(0, endE - (fm.startTime || Date.now()));
                const steps = Math.max(1, Math.floor(total / itv));
                const startP = parseFloat(price) || 0;
                updateMap['modeData.minPrice'] = minP;
                updateMap['modeData.intervalMs'] = itv;
                updateMap['modeData.endTime'] = endE;
                updateMap['modeData.dropAmount'] = steps > 0 ? ((startP - minP) / steps) : 0;
            }
        }
        if (saleMode === 'group_buy' && joinedUsers <= 1) {
            const gbd = document.getElementById('editGbDiscount');
            const gbt = document.getElementById('editGbDiscountType');
            const gbm = document.getElementById('editGbMaxPeople');
            const gbe = document.getElementById('editGbEndTime');
            if (gbd && gbd.value) updateMap['modeData.discountValue'] = parseFloat(gbd.value);
            if (gbt) updateMap['modeData.discountType'] = gbt.value;
            if (gbm && gbm.value) updateMap['modeData.targetPeople'] = parseInt(gbm.value);
            if (gbe && gbe.value) updateMap['modeData.endTime'] = new Date(gbe.value).getTime();
        }
        if (saleMode === 'wholesale') {
            const wsd = document.getElementById('editWsDiscount');
            const wst = document.getElementById('editWsDiscountType');
            if (wsd && wsd.value) updateMap['modeData.discountValue'] = parseFloat(wsd.value);
            if (wst) updateMap['modeData.discountType'] = wst.value;
            // [§23-§24M] minQty + tiers zinazerekodiwa kama za creation —
            // tiers ambazo zimejazwa na "minQty:bei;..." zinarathiwa kuwa
            // modeData.tiers[] (sorted + validated).
            const wsm = document.getElementById('editWsMinQty');
            if (wsm && wsm.value) updateMap['modeData.minQty'] = parseInt(wsm.value);
            const wst2 = document.getElementById('editWsTiersText');
            if (wst2 && wst2.value.trim()) {
                let t2 = [];
                try {
                    t2 = wst2.value.split(';').map(function (pair) {
                        var kv = pair.split(':');
                        return { minQty: parseInt(kv[0], 10), price: parseFloat(kv[1]) };
                    }).filter(function (t) {
                        return Number.isFinite(t.minQty) && t.minQty > 0 && Number.isFinite(t.price) && t.price > 0;
                    });
                    t2.sort(function (a, b) { return a.minQty - b.minQty; });
                } catch (e) { t2 = []; }
                updateMap['modeData.tiers'] = t2;
            }
        }

        await skh.updateDoc(prodRef, updateMap);
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
        /* [AUDIT-FIX 2026-09-16 §27] SOS voice listener haijapatikana kufafanuliwa
           popote kwenye codebase (MISSING). Kinga dhidi ya ReferenceError;
           ona ukaguzi: AUDIT-REPORT.md (SOS = feature inayokosekana). */
        if (typeof window.startVoiceListener === 'function') window.startVoiceListener();
    }
}, 3000);

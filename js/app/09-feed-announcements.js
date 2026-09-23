/* ==== js/app/09-feed-announcements.js ==== */
import { skh } from './00-bootstrap.js';

window.deleteAd = async function(id, collectionName, title) {
    // Products are durable commerce entities: archive, never client-delete.
    if (collectionName === 'products') {
        if (!await skhConfirm('Archive "' + (title || 'bidhaa') + '"? Historia ya oda/review itabaki salama.')) return;
        await skh.updateDoc(skh.doc(skh.db, 'products', id), {
            publicationStatus: 'archived', status: 'archived', archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        if (skh._feedCache) skh._feedCache.clear();
        loadAndRenderDashboard();
        return;
    }
    await window.skhRequestDelete(collectionName, id, { title: title, onDone: function () { loadAndRenderDashboard(); } });
};

window.handleImageSearch = async function(e) {
        const file = e.target.files[0];
        if(!file) return;

        const searchInput = document.getElementById('searchInput');
        searchInput.placeholder = " Inasoma picha...";
        searchInput.disabled = true;

        try {
            // Mfumo rahisi wa kuchukua jina la picha na kutafuta (Kama huna AI API kwa sasa)
            let fileName = file.name.split('.')[0].replace(/[-_]/g, ' ').replace(/[0-9]{10,}/g, '').trim(); 
            searchInput.value = fileName;
            searchInput.placeholder = "Tafuta Bidhaa...";
            handleSearch(); // Anza kutafuta live
        } catch (err) {
            console.error(err);
        } finally {
            searchInput.disabled = false;
            e.target.value = ""; 
        }
    };

window.toggleSys = async function(category, feature) {
    if(!skh.sysConfig) skh.sysConfig = {};
    if(!skh.sysConfig[category]) skh.sysConfig[category] = {};

    try {
        const configRef = skh.doc(skh.db, "system", "config");

        // [FIX 2026-09] Soma hali MPYA kutoka Firestore KABLA ya kubadilisha —
        // hii inaondoa mbio (race) iliyokuwa ikifanya "kuwasha ada moja kuzima
        // nyingine zote": hapo awali tulikuwa tunaandika skh.sysConfig NZIMA
        // (stale) kwa merge, hivyo kila kuwasha kulifuta zile za awali.
        try {
            const snap = await skh.getDoc(configRef);
            if (snap && snap.exists && snap.exists() && snap.data()) {
                skh.sysConfig = Object.assign({}, snap.data());
                if (!skh.sysConfig[category]) skh.sysConfig[category] = {};
            }
        } catch (e) { /* endelea na hali ya memory */ }

        const cat = skh.sysConfig[category];

        // [MIGRATION] fees.enabled ya zamani (global) -> per-feature.
        if (category === 'fees' && typeof cat.enabled === 'boolean') {
            const legacy = cat.enabled === true;
            ['deposit','subscription','boost','commission','offline_registration','agent_registration'].forEach(k => { cat[k] = legacy; });
            delete cat.enabled;
        }

        const newVal = !(cat[feature] === true);
        cat[feature] = newVal; // UI ya haraka (snapshot listener itasawazisha baadaye)

        // [FEE FIX 2026-09] Tumia setDoc({merge}) — si updateDoc — ili kwamba
        // ikiwa `system/config` HAIPO bado (toggle ya KWANZA), itaundwa badala
        // ya kutupa "not-found" na kufanya kitufe kirudi kwenye OFF. Uga moja
        // tu (dot-path) ndio unaandikwa — haiwezi kugusa ada nyingine.
        // [FIX TOGGLE 2026-09-14] setDoc({merge}) haitafsiri dot-notation —
        // ilikuwa inaunda field bapa "fees.boost" badala ya fees.boost nested,
        // hivyo switch ilionekana OFF daima. updateDoc inaelewa dot-paths.
        // [FLIP-FLOP FIX 2026-09-17] Tafuta-Kanda: futa legacy field
        // `{category}.enabled` kutoka Firestore — ingesimama huko milele na
        // kushinda yoyote jipya la per-feature (switch ilikuwa "ikarudi OFF").
        try {
            var payload = {};
            payload[category + '.' + feature] = newVal;
            try {
                if (category === 'fees' && skh.sysConfig[category] && !('enabled' in skh.sysConfig[category]) ) {
                    // imefutwa memory — futa na backend (kama ipo)
                    payload[category + '.enabled'] = skh.deleteField();
                }
            } catch (eDel0) {}
            await skh.updateDoc(configRef, payload);
        } catch (errUpd) {
            var nested2 = {}; nested2[category] = {};
            nested2[category][feature] = newVal;
            await skh.setDoc(configRef, nested2, { merge: true });
        }

        console.log(`Mabadiliko: ${category} ${feature} sasa ni ${newVal}`);

        //  Alert System ikizimwa/kuwashwa, lazimisha Announcement Bar ibadilike PAPO HAPO
        // badala ya kusubiri snapshot ijayo ya matangazo.
        if(category === 'alerts' && feature === 'active' && typeof window.updateLiveTicker === 'function') {
            window.updateLiveTicker('normal', '', '', true);
        }
    } catch(e) {
        console.error("Error saving config:", e);
        alert(" Imeshindwa kusave mabadiliko kwenye Firebase.");
        throw e; // [FIX 2026-09] Ruhusu kitufe kirudishe hali yake ikiwa save imeshindwa.
    }

    // Refresh ya UI ya admin — IKIWA imeshindwa, usifanye ionekane kama save imeshindwa.
    try { loadAdminDashboard(); } catch(e) { console.error("Refresh ya admin imeshindwa:", e); }
};

window.skhOnSnapshot('system-config', skh.doc(skh.db, "system", "config"), (docSnap) => {
    if(docSnap.exists()) {
        const prevAlertsActive = skh.sysConfig?.alerts?.active !== false;
        skh.sysConfig = docSnap.data();
        window.sysConfig = skh.sysConfig; // ipatikane globally kwa engine ya announcement bar
        console.log("Config imesomwa upya:", skh.sysConfig);

        // [FIX 2026-09] Swichi za modes (mnada/bei kushuka/group buy) zionekane mara moja.
        if (typeof window.skhApplyModeSwitches === 'function') window.skhApplyModeSwitches();

        const newAlertsActive = skh.sysConfig?.alerts?.active !== false;
        // Alert System ikizimwa na admin mwingine popote, watumiaji wote wabadilike papo hapo.
        if(prevAlertsActive && !newAlertsActive && typeof window.updateLiveTicker === 'function') {
            window.updateLiveTicker('normal', '', '', true);
        }
    }
});

window.__sokohaiAnnouncementsCache = [];

window.__sokohaiAnnouncementsUnsub = null;

window.sokohaiStartAnnouncementsListener = function(){
    if(window.__sokohaiAnnouncementsUnsub) return; // tayari inasikiliza
    try {
        const canManageAll = !!((window.SOKOHAI_CLAIMS && window.SOKOHAI_CLAIMS.isAdmin)
            || (skh.currentUser && skh.currentUser.email === skh.MY_ADMIN_EMAIL));
        
        const handleSnap = (snap) => {
            const all = [];
            snap.forEach(docSnap => {
                const d = docSnap.data();
                if (canManageAll || (d && d.archived !== true && d.status !== 'archived' && (d.status === 'published' || d.active !== false))) {
                    all.push({ id: docSnap.id, ...d });
                }
            });
            window.__sokohaiAnnouncementsCache = all;
            try {
                const publicOnly = all.filter(a => a && a.archived !== true && a.status !== 'archived' && (a.status === 'published' || a.active !== false));
                localStorage.setItem('skh_cached_announcements', JSON.stringify(publicOnly));
            } catch(e){}
            if(typeof window.__sokohaiOnAnnouncementsUpdate === 'function') {
                window.__sokohaiOnAnnouncementsUpdate(all);
            }
            if(typeof window.renderAnnouncementManagerList === 'function') {
                window.renderAnnouncementManagerList();
            }
        };

        const annQ = canManageAll
            ? skh.query(skh.collection(skh.db, "announcements"), skh.orderBy("createdAt", "desc"), skh.limit(50))
            : skh.query(skh.collection(skh.db, "announcements"), skh.where("status", "==", "published"), skh.where("archived", "==", false), skh.orderBy("createdAt", "desc"), skh.limit(50));
        
        window.__sokohaiAnnouncementsUnsub = skh.onSnapshot(annQ, handleSnap, (err) => {
            console.warn("Announcements primary query failed, falling back to basic stream:", err);
            try {
                const fallbackQ = skh.query(skh.collection(skh.db, "announcements"), skh.limit(50));
                window.__sokohaiAnnouncementsUnsub = skh.onSnapshot(fallbackQ, handleSnap, (err2) => {
                    console.error("Announcements fallback listener error:", err2);
                });
            } catch(e2) {
                console.error("Fallback query failed:", e2);
            }
        });
    } catch(e) { console.error("Imeshindwa kuanzisha listener ya matangazo:", e); }
};

window.sokohaiSaveAnnouncement = async function(payload, editId){
    try {
        const isAdmin = !!((window.SOKOHAI_CLAIMS && window.SOKOHAI_CLAIMS.isAdmin) || (skh.currentUser && skh.currentUser.email === skh.MY_ADMIN_EMAIL));
        if(!isAdmin) throw new Error('Admin authorization required.');
        const data = {
            text: String(payload.text || payload.description || '').trim(),
            description: String(payload.description || payload.text || '').trim(),
            headline: String(payload.headline || '').trim(),
            brandName: String(payload.brandName || '').trim(),
            creativeType: payload.creativeType || 'image_text',
            layoutStyle: payload.layoutStyle || payload.creativeType || 'image_text',
            image: String(payload.image || payload.imageUrl || '').trim(),
            imageUrl: String(payload.imageUrl || payload.image || '').trim(),
            videoUrl: String(payload.videoUrl || '').trim(),
            audioUrl: String(payload.audioUrl || '').trim(),
            logoUrl: String(payload.logoUrl || '').trim(),
            badgeText: String(payload.badgeText || '').trim(),
            badgeStyle: String(payload.badgeStyle || 'pill').trim(),
            badgeColor: /^#[0-9a-f]{6}$/i.test(String(payload.badgeColor||'')) ? String(payload.badgeColor) : '#F59E0B',
            badgeTextColor: /^#[0-9a-f]{6}$/i.test(String(payload.badgeTextColor||'')) ? String(payload.badgeTextColor) : '#FFFFFF',
            primaryColor: /^#[0-9a-f]{6}$/i.test(String(payload.primaryColor||'')) ? String(payload.primaryColor) : '#0E7A5F',
            accentColor: /^#[0-9a-f]{6}$/i.test(String(payload.accentColor||'')) ? String(payload.accentColor) : '#167A91',
            textColor: /^#[0-9a-f]{6}$/i.test(String(payload.textColor||'')) ? String(payload.textColor) : '#FFFFFF',
            surfaceColor: /^#[0-9a-f]{6}$/i.test(String(payload.surfaceColor||'')) ? String(payload.surfaceColor) : '#FFFFFF',
            frameOpacity: Math.max(0.08, Math.min(1, Number(payload.frameOpacity) || 0.42)),
            gradientAngle: Number.isFinite(Number(payload.gradientAngle)) ? Number(payload.gradientAngle) : 135,
            borderRadius: Number.isFinite(Number(payload.borderRadius)) ? Math.max(0, Math.min(36, Number(payload.borderRadius))) : 22,
            fontWeight: String(payload.fontWeight || '950'),
            fontSize: Number.isFinite(Number(payload.fontSize)) ? Number(payload.fontSize) : 0,
            textAlign: String(payload.textAlign || 'left'),
            textShadow: String(payload.textShadow || 'none'),
            priceTag: String(payload.priceTag || payload.price || '').trim(),
            ctaLabel: String(payload.ctaLabel || '').trim(),
            ctaStyle: String(payload.ctaStyle || 'solid').trim(),
            ctaIcon: String(payload.ctaIcon || 'arrow').trim(),
            link: String(payload.link || '').trim(),
            startAt: payload.startAt || '',
            endAt: payload.endAt || '',
            priority: Math.max(0, Number(payload.priority) || 0),
            status: payload.status || 'draft',
            archived: payload.archived === true,
            active: payload.status === 'published' && payload.archived !== true,
            updatedAt: new Date().toISOString()
        };
        let savedId = editId || '';
        if(editId) {
            await skh.updateDoc(skh.doc(skh.db, "announcements", editId), data);
        } else {
            data.createdAt = new Date().toISOString();
            const created = await skh.addDoc(skh.collection(skh.db, "announcements"), data);
            savedId = created.id;
        }

        // Render immediately after a confirmed Firestore write instead of waiting for
        // listener latency. The snapshot remains authoritative and will reconcile it.
        const cache = Array.isArray(window.__sokohaiAnnouncementsCache) ? window.__sokohaiAnnouncementsCache.slice() : [];
        const at = cache.findIndex(function (a) { return a.id === savedId; });
        const optimistic = Object.assign({}, at >= 0 ? cache[at] : {}, data, { id: savedId });
        if (at >= 0) cache[at] = optimistic; else cache.unshift(optimistic);
        window.__sokohaiAnnouncementsCache = cache;
        try {
            const publicOnly = cache.filter(a => a && a.archived !== true && a.status !== 'archived' && (a.status === 'published' || a.active !== false));
            localStorage.setItem('skh_cached_announcements', JSON.stringify(publicOnly));
        } catch(e){}
        if(typeof window.__sokohaiOnAnnouncementsUpdate === 'function') window.__sokohaiOnAnnouncementsUpdate(cache);
        if(typeof window.renderAnnouncementManagerList === 'function') window.renderAnnouncementManagerList();

        const state = typeof window.skhAdvertisementState === 'function' ? window.skhAdvertisementState(optimistic) : (data.status === 'published' ? 'active' : 'draft');
        if(typeof window.skhToast === 'function') window.skhToast(state === 'active' ? 'Advertisement published and visible on Home.' : state === 'scheduled' ? 'Advertisement scheduled.' : 'Advertisement saved as draft.', 'success');
        return { ok:true, id:savedId, state:state };
    } catch(e) {
        console.error("Kosa kuhifadhi tangazo:", e);
        alert(" Imeshindwa kuhifadhi tangazo: " + e.message);
        return false;
    }
};

window.sokohaiDeleteAnnouncement = async function(id){
    if(!await skhConfirm("Archive advertisement hii? Haitaonekana Home.")) return;
    try {
        await skh.updateDoc(skh.doc(skh.db, "announcements", id), { archived:true, status:'archived', active:false, archivedAt:new Date().toISOString() });
    } catch(e) {
        alert(" Imeshindwa ku-archive advertisement: " + e.message);
    }
};

window.sokohaiToggleAnnouncementActive = async function(id, currentlyActive){
    try {
        await skh.updateDoc(skh.doc(skh.db, "announcements", id), { active: !currentlyActive });
    } catch(e) {
        alert(" Imeshindwa kubadili hali ya tangazo: " + e.message);
    }
};

window.sokohaiStartAnnouncementsListener();

// [FIX 2026-09] Chanzo KIMOJA cha ukweli wa uwakala: agents collection
// (sio currentUserData.isApprovedAgent ambayo inaweza kukosa kusasishwa).
// Wakala aliyekwisha idhinishwa na Admin ataonekana "approved" hapa mara moja.
window.skhAgentApproval = async function() {
    if (!skh.currentUser) return { approved: false };
    if (skh.currentUserData && (skh.currentUserData.role === 'admin' || skh.currentUserData.isApprovedAgent === true || skh.currentUserData.role === 'agent' || skh.currentUserData.isAgent === true)) {
        window.__skhAgentApproved = true;
        return { approved: true, exists: true, status: 'approved' };
    }
    try {
        const q = skh.query(skh.collection(skh.db, "agents"), skh.where("userId", "==", skh.currentUser.uid), skh.limit(50));
        const snap = await skh.getDocs(q);
        let best = null;
        const rank = { approved: 3, pending: 2, rejected: 1 };
        snap.forEach(d => {
            const s = (d.data() || {}).status;
            if (!best || (rank[s] || 0) > (rank[(best.data() || {}).status] || 0)) best = d;
        });
        if (!best) return { approved: false, exists: false };
        const data = best.data() || {};
        const approved = data.status === 'approved' || data.isApprovedAgent === true;
        if (approved) window.__skhAgentApproved = true;
        return { approved: approved, exists: true, docId: best.id, data: data, status: data.status };
    } catch (e) {
        if (skh.currentUserData && (skh.currentUserData.isApprovedAgent === true || skh.currentUserData.role === 'agent')) {
            return { approved: true, exists: true, status: 'approved' };
        }
        return { approved: false, error: e };
    }
};

window.checkAgentAndShowForm = async function(formId) {
    const ap = await window.skhAgentApproval();
    if (!ap.approved) {
        alert("Akaunti yako ya Uwakala bado haijaidhinishwa na Admin.");
        showForm('agentForm');
        return;
    }
    showForm(formId);
};

setInterval(() => {
    const agentMenu = document.querySelector('.agent-only-menu');
    if (agentMenu) {
        agentMenu.style.display = 'flex';
    }
}, 2000);

window.skhOpenMemberRegistration = async function() {
    if (!skh.requireAuth()) return;

    const ap = await window.skhAgentApproval();
    if (!ap.approved) {
        alert("Akaunti yako ya Uwakala bado haijaidhinishwa.\n\nTafadhali jaza fomu ya kujiunga kuwa Wakala ili kupata idhini.");
        showForm('agentForm');
        return;
    }

    try { closeModals(); } catch (e) {}
    if (typeof window.loadAgentDashboard === 'function') await window.loadAgentDashboard();
    if (typeof window.skhAssistHome === 'function') window.skhAssistHome();
    if (typeof window.skhAssistRegisterView === 'function') window.skhAssistRegisterView();
};

// Proxy ya zamani — inaelekeza kwa flow moja (hakuna form iliyobaki).
window.registerOfflineMember = async function() {
    return window.skhOpenMemberRegistration();
};

window.submitAgentFromDash = async function() {
    if(!skh.requireAuth()) return;

    const name = document.getElementById('dashAgentName').value.trim();
    let phone = document.getElementById('dashAgentPhone').value.trim();
    const region = document.getElementById('dashAgentRegion').value;
    
    if(!name || !phone || !region) {
        alert(" jaza Jina, Simu, na Mkoa kabla ya kuendelea."); 
        return;
    }

    // 1. Maandalizi ya Malipo
    if(phone.startsWith('0')) phone = '255' + phone.substring(1);
    const txRef = "AGT_" + Date.now(); // Hii ndio namba ya kumbukumbu ya muamala

    const btn = document.getElementById('btnDashAgent');
    const originalText = btn.innerHTML;
    btn.innerHTML = " INASINDIKA MALIPO...";
    btn.disabled = true;
    
    try {
        // [FIX: MAOMBI YAFIKE KWA ADMIN] Ombi linaandikwa Firestore MARA MOJA (status: pending)
        // — hata kabla ya malipo. Admin huona kila ombi; malipo yanarekodiwa baadaye.
        const isFreeMode = !skh.paymentGate('agent_registration');
        const agentRef = await skh.addDoc(skh.collection(skh.db, "agents"), {
            userId: skh.currentUser.uid,
            userEmail: skh.currentUser.email || '',
            fullName: name,
            contact: phone,
            email: '',
            location: region,
            bio: '',
            status: 'pending',
            paymentStatus: isFreeMode ? 'free' : 'pending',
            isPaid: false,
            feeWaived: isFreeMode,
            paymentRef: txRef,
            source: 'dashboard_form',
            createdAt: new Date().toISOString()
        });
        const agentDocId = agentRef.id;

        if (isFreeMode) {
            alert(" Ombi lako la Uwakala LIMETUMWA kwa Admin.\nAda ya UWAKALA imezimwa (FREE MODE) — hakuna ada ya TSh 3,100 inayohitajika kwa sasa.\nAdmin atakagua na kukuidhinisha.");
            window.loadAgentDashboard();
            return;
        }

        try {
            // 2. LIPA KWANZA KWA PESAPAL — malipo yakikamilika, 17-pesapal-return inasasisha
            // document hii hii (agentDocId) kuwa paymentStatus: 'paid'.
            const payData = await window.skhPesaPalPay({
                amount: 3100,
                kind: 'agent_registration',
                phone: phone,
                provider: 'PesaPal',
                description: 'Ada ya usajili wa wakala',
                context: { uid: skh.currentUser.uid, email: skh.currentUser.email, name: name, phone: phone, region: region, txRef: txRef, agentDocId: agentDocId, recordRevenue: true }
            });
            if (!payData.ok) {
                alert(" Ombi lako LIMETUMWA kwa Admin (pending).\n\nMalipo ya ada (TSh 3,100) hayakuanza: " + (payData.error || "Angalia namba ya simu.") + "\nUtalipa baadaye kabla ya kuidhinishwa.");
            }
        } catch (payErr) {
            alert(" Ombi lako LIMETUMWA kwa Admin (pending).\nMalipo ya ada (TSh 3,100) yatahitajika kabla ya kuidhinishwa.\nKumbukumbu: " + txRef);
        }

    } catch(e) {
        console.error("Agent Registration Error:", e);
        alert(" Hitilafu imetumea: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// [FIX: MAOMBI YAFIKE KWA ADMIN] Kulipa ada ya usajili wa wakala kwa ombi lililopo tayari (pending).
// Baada ya malipo, 17-pesapal-return inasasisha document ya agents kuwa paymentStatus: 'paid'.
window.skhAgentPayPendingFee = async function(agentDocId) {
    if(!skh.requireAuth()) return;
    let phone = (skh.currentUserData && skh.currentUserData.phone) || '';
    const txRef = "AGT_" + Date.now();

    // [ADMIN PAYMENTS SWITCH] Ada ya wakala imezimwa -> hakuna ada; weka alama ya FREE.
    if (!skh.paymentGate('agent_registration')) {
        try {
            await skh.updateDoc(skh.doc(skh.db, "agents", agentDocId), { paymentStatus: 'free', feeWaived: true });
        } catch (e) {}
        alert(" Ada ya UWAKALA imezimwa (FREE MODE) — hakuna ada ya usajili wa wakala kwa sasa.\nOmbi lako litakaguliwa na Admin.");
        window.loadAgentDashboard();
        return;
    }

    try {
        const pay = await window.skhPesaPalPay({
            amount: 3100,
            kind: 'agent_registration',
            phone: phone,
            provider: 'PesaPal',
            description: 'Ada ya usajili wa wakala',
            context: { uid: skh.currentUser.uid, email: skh.currentUser.email, name: skh.currentUser.displayName || '', phone: phone, region: (skh.currentUserData && skh.currentUserData.region) || '', txRef: txRef, agentDocId: agentDocId, recordRevenue: true }
        });
        if (!pay.ok) {
            alert(" Malipo hayakuanza: " + (pay.error || "Angalia namba ya simu."));
        }
    } catch(e) {
        alert(" Hitilafu: " + e.message);
    }
};

window.openSubscriptionModal = function() {
    // A. Kagua kama mtumiaji ameingia (Auth Check)
    if(!skh.requireAuth()) return;

    // B. Tambua Kategoria (Category Key)
    let catKey = 'bidhaa';
    if(skh.currentMode === 'provider') catKey = 'huduma';
    if(skh.currentMode === 'driver') catKey = 'usafiri';

    // C. Kagua Ulinzi wa Admin (Admin Switch)
    if(skh.currentMode === 'driver') {
        alert(" Wasafirishaji hamuhitaji Kifurushi. Mfumo wenu ni wa Kamisheni tu kwa kila safari.");
        return;
    }

    

    const container = document.getElementById('subPackagesContainer');
    let html = '';

    // D. BEI HALISI KULINGANA NA KAZI YA MTU (Real Business Logic)
    if(skh.currentMode === 'seller') {

      // TAFUTA: title = ' Dashbodi ya Muuzaji';
// WEKA HII CHINI YAKE:

let businessTools = `
    <div style="background:white; padding:15px; border-radius:15px; margin-bottom:20px; border:1px solid #e2e8f0;"> <b style="font-size:12px; color:#17604E; display:block; margin-bottom:10px;"> MFUMO WA HASIBU (POS & ACCOUNTANT)</b> <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;"> <button onclick="showForm('businessOSForm')" style="padding:12px; background:#18A982; color:white; border:none; border-radius:10px; font-size:13px; font-weight:bold;"> REKODI MAUZO</button> <button onclick="window.skhShowTodayProfitReport()" style="padding:12px; background:#526962; color:white; border:none; border-radius:10px; font-size:13px; font-weight:bold;"> RIPOTI YA FAIDA</button> </div> </div>
`;
// Kisha hakikisha variable hii 'businessTools' inaongezwa kwenye container.innerHTML ya seller.
        // Vifurushi vya Wauzaji Bidhaa
        html = `
            <div class="sub-card-pro" onclick="paySubscription(10000, 'BASIC SELLER')"> <div class="sub-icon"></div> <div class="sub-info"> <b>BASIC (Bidhaa 6-99)</b> <span>TSh 10,000 / Mwezi</span> </div> </div> <div class="sub-card-pro gold" onclick="paySubscription(35000, 'UNLIMITED PRO')"> <div class="sub-icon"></div> <div class="sub-info"> <b>PRO (Bidhaa 1000+)</b> <span>TSh 35,000 / Mwezi</span> </div> </div>`;
    } else {
        // Vifurushi vya Mafundi (Providers) na Waajiri (Employers)
        html = `
            <div class="sub-card-pro" onclick="paySubscription(4000, 'MONTHLY PACKAGE')"> <div class="sub-icon"></div> <div class="sub-info"> <b>Kifurushi cha Mwezi</b> <span>TSh 4,000 / Mwezi</span> </div> </div> <div class="sub-card-pro gold" onclick="paySubscription(43000, 'YEARLY SAVER')"> <div class="sub-icon"></div> <div class="sub-info"> <b>Kifurushi cha Mwaka (Okoa)</b> <span>TSh 43,000 / Mwaka</span> </div> </div>`;
    }

    // [ADMIN PAYMENTS SWITCH] Onyesha bendera ya FREE MODE juu ya vifurushi.
    if (!skh.paymentGate('subscription')) {
        html = '<div style="background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; border-radius:12px; padding:12px 14px; margin-bottom:14px; font-size:12px; font-weight:bold; text-align:center;">ADA YA SUBSCRIPTION IMEZIMWA (FREE MODE) — vifurushi vyote vinaamilishwa BURE kwa sasa.</div>' + html;
    }

    container.innerHTML = html;
    // Funga modal zingine na ufungue ya Sub
    closeModals();
    document.getElementById('subModal').style.display = 'flex';
};

window.paySubscription = async function(amount, title) {
  let catKey = (skh.currentMode === 'provider') ? 'huduma' : 'bidhaa';
    const isFreeMode = (!skh.paymentGate('subscription')) || (skh.sysConfig && skh.sysConfig[catKey] && skh.sysConfig[catKey].sub === false);
    if(!skh.requireAuth()) return;

    try {
        // A. Tengeza tarehe ya ku-expire (Siku 30 au 365)
        const subExpiryDate = new Date();
        if(title.toLowerCase().includes('year')) {
            subExpiryDate.setFullYear(subExpiryDate.getFullYear() + 1);
        } else {
            subExpiryDate.setMonth(subExpiryDate.getMonth() + 1);
        }

        // B. IKIWA BURE — amilisha moja kwa moja (hakuna malipo, hakuna namba inayohitajika)
        if (isFreeMode) {
            if(skh.currentUserData && skh.currentUserData.docId) {
                await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUserData.docId), { 
                    isSubscribed: true,
                    subscriptionType: title,
                    subscriptionValidUntil: subExpiryDate.toISOString(),
                    subStatus: "Active"
                });
            }
            await skh.addDoc(skh.collection(skh.db, "adminRevenue"), { 
                type: "subscription", 
                amount: 0, 
                package: title,
                userEmail: skh.currentUser.email,
                waived: true,
                date: new Date().toISOString() 
            });
            alert(` Ada ya SUBSCRIPTION imezimwa (FREE MODE)! Kifurushi chako cha ${title} kimeamilishwa BURE.`);
            closeModals();
            loadAndRenderDashboard();
            return;
        }

        // C. NJIA YA MALIPO (PAID MODE) — namba ya kulipia inahitajika
        let payPhone = (skh.currentUserData && (skh.currentUserData.paymentAccount || skh.currentUserData.phone)) || '';
        if(!payPhone) {
            alert(" sajili Namba yako ya Malipo kwenye Akaunti kwanza.");
            openUserPaymentModal();
            return;
        }
        if(!await skhConfirm(`Je, unathibitisha kulipia Kifurushi cha ${title} (TSh ${amount.toLocaleString()}) kupitia namba yako: ${payPhone}?`)) return;
        if(payPhone.startsWith('0')) payPhone = '255' + payPhone.substring(1);
        closeModals();
        alert(` Ombi la malipo limetumwa kwenye namba ${payPhone}. weka PIN kukamilisha.`);

        // D. LIPA KWA PESAPAL — usajili utakamilika baada ya kurudi (17-pesapal-return)
        const pay = await window.skhPesaPalPay({
            amount: amount,
            kind: 'subscription',
            phone: payPhone,
            provider: 'PesaPal',
            description: 'Kifurushi cha ' + title,
            context: { docId: (skh.currentUserData && skh.currentUserData.docId) || null, title: title, subExpiryDate: subExpiryDate.toISOString(), email: (skh.currentUser && skh.currentUser.email) || '' }
        });
        if (!pay.ok) {
            alert(" Imeshindwa kuamilisha kifurushi. Kosa: " + (pay.error || "Ombi la malipo limeshindikana."));
        }

    } catch(e) {
        alert(" Imeshindwa kuamilisha kifurushi. Kosa: " + e.message);
    }
};

if (!document.getElementById('sub-pro-styles')) {
    const subCSS = document.createElement('style');
    subCSS.id = 'sub-pro-styles';
    subCSS.innerHTML = `
        .sub-card-pro { 
            display: flex; align-items: center; gap: 15px; 
            background: #ffffff; padding: 15px; border-radius: 14px; 
            border: 1px solid #e2e8f0; cursor: pointer; margin-bottom: 12px; 
            transition: all 0.3s ease; text-align: left;
            box-shadow: 0 2px 5px rgba(0,0,0,0.02);
        }
        .sub-card-pro:hover { transform: translateY(-2px); border-color: var(--primary-blue); box-shadow: 0 5px 15px rgba(0,0,0,0.05); }
        .sub-card-pro.gold { border-color: var(--gold); background: #fffbeb; }
        .sub-icon { font-size: 26px; }
        .sub-info b { display: block; color: var(--primary-dark); font-size: 14px; margin-bottom: 2px; }
        .sub-info span { color: var(--terracotta); font-weight: 900; font-size: 13px; } `;
    document.head.appendChild(subCSS);
}

window.activeDashboardTab = 'overview';

window.activeChartTimeframe = 'month';

// [REAL DATA 2026-09] Ripoti ya Faida ya LEO — hesabu halisi kutoka ledger ya duka.
// (Ilipokwisha kwama kwa namba za kubuni 150,000/20,000/130,000 — uongo tumekataza kabisa.)
window.skhShowTodayProfitReport = async function () {
    if (!skh.currentUser) return alert('Ingia kwanza akaunti yako.');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    try {
        const ownerUid = (skh.currentUserData && skh.currentUserData.shopOwnerUid) || skh.currentUser.uid;
        const q = skh.query(skh.collection(skh.db, 'shop_ledger'), skh.where('shopOwnerId', '==', ownerUid));
        const snap = await skh.getDocs(q);
        let salesToday = 0, expenseToday = 0, profitToday = 0, found = false;
        snap.forEach(function (docSnap) {
            const l = docSnap.data();
            const when = l.date ? new Date(l.date) : null;
            if (!when || isNaN(when.getTime()) || when < today) return;
            const amt = parseFloat(l.amount) || 0;
            if (l.type === 'income_offline' || l.type === 'income_online') { salesToday += amt; profitToday += (parseFloat(l.profit) || 0); found = true; }
            else if (l.type === 'expense') { expenseToday += amt; found = true; }
        });
        if (!found) return alert('Ripoti ya Leo:\n\nBado hakuna miamala yoyote iliyorekodiwa leo. Rekodi mauzo au matumizi kupitia POS ili kupata ripoti halisi.');
        alert('Ripoti ya Leo:\n\nMauzo: TZS ' + salesToday.toLocaleString() +
            '\nMatumizi: TZS ' + expenseToday.toLocaleString() +
            '\nFaida: TZS ' + profitToday.toLocaleString() +
            '\n\n(Hesabu hizi ni halisi kutoka ledger ya duka lako.)');
    } catch (e) {
        alert('Hitilafu ya kusoma ledger: ' + e.message);
    }
};

/* ==== js/app/16-pos-admin-jobs.js ==== */
import { skh } from './00-bootstrap.js';
import {
    contrastRatio as skhPaletteContrast,
    normalizeCreative,
    creativeToAdvertisement,
    DISPLAY_DURATION_SECONDS,
    BASIC_AD_TYPES,
    MAX_SLIDESHOW_SLIDES,
    MAX_AD_DURATION_SECONDS,
    MIN_AD_DURATION_SECONDS,
    DEFAULT_SLIDE_DURATION_SECONDS,
    MAX_SLIDE_DURATION_SECONDS,
    MIN_SLIDE_DURATION_SECONDS,
    MAX_SLIDESHOW_DURATION_SECONDS,
    TEXT_ROLE_LIMITS,
    TEXT_ROLE_SIZES,
    AD_MEDIA_FILE_LIMITS_BYTES,
    AD_MEDIA_UPLOAD_FOLDER,
    validateAdMediaFile
} from './creative/creative-model.js';
import {
    buildBasicCreative, basicFormFromCreative, validateBasicCreative, MEDIA_BY_TYPE
} from './creative/basic-ad-creative.js';
import {
    autoDesign, autoDesignSignature, applyDesignView, recommendDesign, inferCreativeType, analyzeContent,
    listDesignViews, getDesignView, DESIGN_PRESETS, ELEMENT_STYLE_KEYS, ORDERABLE_ELEMENTS, LAYER_ELEMENTS, STYLE_KEYS
} from './creative/ad-design-engine.js';

if(typeof window.__skhBasicPreviewMuted!=='boolean')window.__skhBasicPreviewMuted=true;
if(typeof window.__skhBasicPreviewPaused!=='boolean')window.__skhBasicPreviewPaused=false;

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

window.submitAgent = async function(event) {
    if(event && typeof event.preventDefault === 'function') event.preventDefault();
    if(!skh.requireAuth()) return;

    const name = document.getElementById('agentName')?.value?.trim();
    let phone = document.getElementById('agentPhone')?.value?.trim();
    const email = document.getElementById('agentEmail')?.value?.trim() || '';
    const region = document.getElementById('agentRegion')?.value;
    const bio = document.getElementById('agentBio')?.value?.trim();

    if(!name || !phone || !region || !bio) {
        alert(T('pa_fill_agent', "Tafadhali jaza Jina, Simu, Mkoa na Maelezo ya Uzoefu wako."));
        return;
    }

    if(phone.startsWith('0')) phone = '255' + phone.substring(1);
    const txRef = "AGTStand_" + Date.now();

    const btn = document.getElementById('btnAgent');
    const originalText = btn ? btn.innerHTML : " TUMA OMBI LAKO";
    if (btn) {
        btn.innerHTML = " INATUMA OMBI...";
        btn.disabled = true;
    }

    try {
        let photoUrl = '';
        const photoFile = document.getElementById('agentPhoto')?.files?.[0];
        if (photoFile && typeof window.skhUploadFromFile === 'function') {
            try {
                const upRes = await window.skhUploadFromFile(photoFile, { folder: 'sokohai/agents' });
                photoUrl = typeof upRes === 'string' ? upRes : (upRes && upRes.url) || '';
            } catch(e) { console.warn('Photo upload skipped/fallback:', e); }
        }

        // [FIX: MAOMBI YAFIKE KWA ADMIN] Ombi linaandikwa kwenye Firestore MARA MOJA
        // (status: pending) — hata kabla ya malipo ya ada. Admin anaona kila ombi.
        const isFreeMode = !skh.paymentGate('agent_registration');
        const agentPayload = {
            userId: skh.currentUser.uid,
            userEmail: skh.currentUser.email || '',
            fullName: name,
            contact: phone,
            email: email || '',
            location: region,
            bio: bio || '',
            photoUrl: photoUrl || '',
            status: 'pending',
            paymentStatus: isFreeMode ? 'free' : 'pending',
            isPaid: false,
            feeWaived: isFreeMode,
            paymentRef: txRef,
            source: 'agent_form',
            createdAt: new Date().toISOString()
        };

        const agentRef = await skh.addDoc(skh.collection(skh.db, "agents"), agentPayload);
        const agentDocId = agentRef.id;

        // Pia weka rekodi kwenye user profile
        try {
            await skh.setDoc(skh.doc(skh.db, "users", skh.currentUser.uid), {
                agentRequestStatus: 'pending',
                agentDocId: agentDocId,
                agentPhone: phone,
                agentRegion: region
            }, { merge: true });
        } catch(e) {}

        if (isFreeMode) {
            alert(T('pa_agent_sent_free', "Ombi lako la Uwakala LIMETUMWA kwa Admin.\n\nAda ya UWAKALA imezimwa (FREE MODE) — hakuna ada inayohitajika kwa sasa.\nAdmin atakagua na kukuidhinisha hivi punde."));
            if (typeof window.loadAgentDashboard === 'function') window.loadAgentDashboard();
            else if (typeof window.goBackToMenu === 'function') window.goBackToMenu();
            return;
        }

        try {
            // [PesaPal] Hosted checkout
            const pay = await window.skhPesaPalPay({
                amount: 3100,
                kind: 'agent_registration',
                phone: phone,
                provider: 'PesaPal',
                description: 'Ada ya usajili wa wakala',
                context: { uid: skh.currentUser.uid, email: skh.currentUser.email, name: name, phone: phone, agentEmail: email, region: region, bio: bio, txRef: txRef, agentDocId: agentDocId, recordRevenue: false }
            });
            if (!pay.ok) throw new Error(pay.error || "Malipo ya ada yameshindikana.");
        } catch (payErr) {
            // Malipo hayakuanza (mf. backend haipo), lakini ombi LIMESHAFIKA kwa admin.
            alert(T('pa_agent_sent_pending', "Ombi lako la Uwakala LIMETUMWA kwa Admin (status: pending).\n\nKumbukumbu: ") + txRef);
            if (typeof window.goBackToMenu === 'function') window.goBackToMenu();
        }

    } catch(e) { alert(T('pa_error', "Hitilafu: ") + (e && e.message ? e.message : e)); }
    finally { 
        if (btn) {
            btn.innerHTML = originalText; 
            btn.disabled = false; 
        }
    }
};

window.skhRefreshStats = async function() {
    try {
        if (typeof window.skhServerStatsRefresh !== "function") { alert(T('pa_stats_missing', "Stats callable is unavailable (functions not deployed?).")); return; }
        await window.skhServerStatsRefresh({});
        await window.loadAdminDashboard();
    } catch (e) {
        var emsg = (window.skhFnErrText && window.skhFnErrText(e, 'stats')) || (e && e.message) || 'Imeshindwa.';
        alert(T('pa_stats_error', "Error updating stats: ") + emsg);
    }
};

// ============================================================
// [ADMIN FIX] VIDHIBITI VYA MFUMO — handler na kijenzi KIMOJA.
// Kila safu = kitufe KIMOJA kinachodhibiti setting MOJA pekee.
// Hakuna switch rudufu tena: moduli -> toggleSys(), modes -> toggleSysMode().
// ============================================================
window.skhSysToggle = function(e, el) {
    if (!el) el = (e && e.currentTarget) || null;
    if (!el) return;
    if (e && e.stopPropagation) e.stopPropagation();
    if (el.getAttribute('data-busy') === '1') return;
    el.setAttribute('data-busy', '1');

    // Onyesha mabadiliko MARA MOJA (optimistic) kabla Firebase haijajibu.
    const wasOn = el.getAttribute('data-on') === '1';
    const nowOn = wasOn ? '0' : '1';
    el.setAttribute('data-on', nowOn);
    const st = el.querySelector('.sys-state');
    if (st) { st.textContent = nowOn === '1' ? 'ON' : 'OFF'; st.className = 'sys-state ' + (nowOn === '1' ? 'on' : 'off'); }

    const finish = function(ok) {
        el.setAttribute('data-busy', '0');
        if (!ok) {
            // Kama save imeshindwa, rudisha hali ya awali.
            el.setAttribute('data-on', wasOn ? '1' : '0');
            if (st) { st.textContent = wasOn ? 'ON' : 'OFF'; st.className = 'sys-state ' + (wasOn ? 'on' : 'off'); }
        } else if (typeof window.sokohaiToast === 'function') {
            window.sokohaiToast(nowOn === '1' ? 'Imewashwa ' : 'Imezimwa', nowOn === '1' ? 'success' : 'info');
        }
    };

    const mode = el.getAttribute('data-mode');
    if (mode) {
        if (typeof window.toggleSysMode === 'function') {
            Promise.resolve(window.toggleSysMode(mode)).then(function(){ finish(true); }, function(){ finish(false); });
        } else { finish(false); }
        return;
    }
    const cat = el.getAttribute('data-cat');
    const feat = el.getAttribute('data-feat');
    if (cat && feat && typeof window.toggleSys === 'function') {
        Promise.resolve(window.toggleSys(cat, feat)).then(function(){ finish(true); }, function(){ finish(false); });
        return;
    }
    finish(false);
};

// Kijenzi cha safu moja ya kibadilishaji (switch halisi ya ON/OFF).
function skhSysRow(kind, key, label, note) {
    let on = false, attrs = '';
    if (kind === 'module') {
        on = !!(skh.sysConfig && skh.sysConfig[key] && skh.sysConfig[key].active !== false);
        attrs = 'data-cat="' + key + '" data-feat="active"';
    } else if (kind === 'mode') {
        on = !!(skh.sysConfig && skh.sysConfig.modes && skh.sysConfig.modes[key] !== false);
        attrs = 'data-mode="' + key + '"';
    } else {
        on = skh.paymentGate(key);
        attrs = 'data-cat="fees" data-feat="' + key + '"';
    }
    return '<div class="sys-toggle" data-on="' + (on ? '1' : '0') + '" ' + attrs + ' onclick="window.skhSysToggle(event, this)" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.skhSysToggle(event, this);}">'
        + '<div class="sys-toggle-main">'
        + '<span class="sys-toggle-label">' + label + '</span>'
        + '<span class="sys-toggle-note">' + note + '</span>'
        + '</div>'
        + '<span class="sys-state ' + (on ? 'on' : 'off') + '">' + (on ? 'ON' : 'OFF') + '</span>'
        + '<span class="sys-switch" aria-hidden="true"></span>'
        + '</div>';
}

window.loadAdminDashboard = async function() {
    const container = document.getElementById('richDashboardContainer');
    if(!container) return;

    container.innerHTML = `<div style="text-align:center; padding:50px;"><span style="font-size:24px; display:inline-block; animation:spin 1s linear infinite;"></span><p>Inapakia Daftari Kuu la Admin...</p></div>`;

    try {
        const [disputesSnap, agentsSnap] = await Promise.all([
            skh.getDocs(skh.query(skh.collection(skh.db, "orders"), skh.where("status", "==", "disputed"), skh.limit(200))),
            skh.getDocs(skh.query(skh.collection(skh.db, "agents"), skh.where("status", "==", "pending"), skh.limit(200)))
        ]);

        // [PHASE 5.4] Geti STATS_VIA_DOC likiwa ON: somo DOC MOJA 'platform_stats/current'
        // (inasasishwa na 'platformStatsHourly' kila saa) badala ya full-scan yenye cap 1000.
        // Likizima au doc isipatikane: full-scan ya kawaida ya adminRevenue (tabia ya sasa).
        let totalPlatformRevenue = 0;
        let statsMeta = null;
        if (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.STATS_VIA_DOC) {
            try {
                const sd = await skh.getDoc(skh.doc(skh.db, "platform_stats", "current"));
                if (sd.exists() && typeof sd.data().totalRevenue === "number") {
                    totalPlatformRevenue = sd.data().totalRevenue;
                    statsMeta = { generatedAt: sd.data().generatedAt || null, eventCount: sd.data().eventCount || 0 };
                }
            } catch (e) { statsMeta = null; /* fallback hapa chini */ }
        }
        if (!statsMeta) {
            const revenueSnap = await skh.getDocs(skh.query(skh.collection(skh.db, "adminRevenue"), skh.orderBy("date", "desc"), skh.limit(1000)));
            revenueSnap.forEach(doc => {
                totalPlatformRevenue += parseFloat(doc.data().amount || 0);
            });
        }

        container.innerHTML = `
            <div style="text-align: left; font-family: inherit;"> <div style="background:#fff; color:#18352D; border:1px solid #D5E2DE; box-shadow:0 3px 14px rgba(24,53,45,.07); padding:25px; border-radius:20px; margin-bottom:25px;"> <h2 style="margin:0; color:#17604E;"> PLATFORM CONTROL PANEL</h2> <p style="margin: 5px 0 0 0; opacity: 0.8; font-size: 13px;">Usimamizi mkuu wa Sokohai, miamala, na ulinzi wa jamii.</p> </div> <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px;"> <div style="background:#f0fdf4; border: 1px solid #bbf7d0; padding:15px; border-radius:14px;"> <small style="color: gray;">PLATFORM REVENUE (MAPATO YA MFUMO)</small> <h3 style="margin:5px 0 0; color:green; font-size: 18px; font-weight:900;">TSh ${totalPlatformRevenue.toLocaleString()}</h3>
                        ${statsMeta ? `<small style="color:#16a34a;"> Aggregates (${statsMeta.eventCount} matukio)${statsMeta.generatedAt ? " · " + new Date(statsMeta.generatedAt).toLocaleString() : ""} <span style="color:#2563eb; text-decoration:underline; cursor:pointer;" onclick="window.skhRefreshStats()">↻ Sasisha</span></small>` : ""}
                    </div> <div style="background:#fffbeb; border: 1px solid #fde68a; padding:15px; border-radius:14px;"> <small style="color: gray;">MIGOGORO INAYOSUBIRI (PENDING DISPUTES)</small> <h3 style="margin:5px 0 0; color:orange; font-size: 18px; font-weight:900;">${disputesSnap.size} Disputes</h3> </div> <div style="background:#eff6ff; border: 1px solid #bfdbfe; padding:15px; border-radius:14px;"> <small style="color: gray;">MAOMBI YA WAWAKALA (PENDING AGENTS)</small> <h3 style="margin:5px 0 0; color:var(--primary-blue); font-size: 18px; font-weight:900;">${agentsSnap.size} Agents</h3> </div> </div> <!-- [ADMIN FIX] VIDHIBITI VYA MFUMO — KIBAO KIMOJA (hakuna switches rudufu) --> <div style="background: white; border: 1px solid #cbd5e1; border-radius: 18px; padding: 20px; margin-bottom: 25px;"> <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:center;"> <div style="min-width:0; flex:1;"> <h4 style="margin:0; color: var(--primary-dark); font-weight:900;"> VIDHIBITI VYA MFUMO &mdash; WASHA / ZIMA</h4> <p style="margin:6px 0 0; font-size:12px; color:#64748b; line-height:1.5;">Kila kibadilishaji kinadhibiti setting MOJA pekee. Hakuna kubadilisha kingine kwa bahati mbaya.</p> </div> <div style="text-align:right;"> <b style="display:block; font-size:18px; color:#0f172a; font-weight:900;">${(() => {
                                const _m = ['bidhaa','huduma','usafiri','alerts'].filter(k => skh.sysConfig && skh.sysConfig[k] && skh.sysConfig[k].active !== false).length;
                                const _md = ['free_market','auction','price_drop','group_buy'].filter(k => skh.sysConfig && skh.sysConfig.modes && skh.sysConfig.modes[k] !== false).length;
                                const _f = ['deposit','subscription','boost','commission','offline_registration','agent_registration'].filter(k => skh.paymentGate(k)).length;
                                return (_m + _md + _f) + '/14 ZIMEWASHWA';
                            })()}</b> <small style="color:#64748b; font-size:13px;">Moduli &middot; Hali za Uuzaji &middot; Ada</small> </div> </div> <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:14px; margin-top:16px;"> <div class="sys-group"> <div class="sys-group-title"> Moduli (Modules)</div>
                            ${skhSysRow('module', 'bidhaa', 'Bidhaa na Soko', 'Onesha / ficha moduli ya bidhaa kwenye soko.')}
                            ${skhSysRow('module', 'huduma', 'Huduma na Mafundi', 'Onesha / ficha moduli ya huduma na mafundi.')}
                            ${skhSysRow('module', 'usafiri', 'Usafirishaji na Dereva', 'Onesha / ficha moduli ya usafirishaji.')}
                            ${skhSysRow('module', 'alerts', 'Alert System (Biashara Live)', 'Ukizima, Announcement Bar itarudi kwenye matangazo ya kawaida pekee.')}
                        </div> <div class="sys-group"> <div class="sys-group-title"> Hali za Uuzaji (Modes)</div>
                            ${skhSysRow('mode', 'free_market', 'Soko Huru', 'Mauzo ya kawaida bila mnada.')}
                            ${skhSysRow('mode', 'auction', 'Mnada Live', 'Uwezo wa mnada wa moja kwa moja.')}
                            ${skhSysRow('mode', 'price_drop', 'Price Drop Mode', 'Bei inashuka kwa wingi (flash).')}
                            ${skhSysRow('mode', 'group_buy', 'Group Buy Mode', 'Manunuzi ya pamoja (group buying).')}
                        </div> <div class="sys-group"> <div class="sys-group-title"> Ada (Fees)</div>
                            ${skhSysRow('fee', 'commission', 'Kamisheni ya Mfumo (5%)', 'Inakatwa kwenye escrow / SokoPay payout ya muuzaji.')}
                            ${skhSysRow('fee', 'subscription', 'Ada ya Subscription', 'Usajili wa duka &mdash; lazima ulipe.')}
                            ${skhSysRow('fee', 'boost', 'Ada ya Boost', 'Kukuza matangazo ya bidhaa/huduma/usafiri.')}
                            ${skhSysRow('fee', 'deposit', 'Deposit ya Mnada/Group Buy', 'TSh 1,300 kwa serious actions (bid/join/lock).')}
                            ${skhSysRow('fee', 'offline_registration', 'Mwanachama Offline (TSh 2,100)', 'Usajili wa mwanachama asiye na simu (wakala).')}
                            ${skhSysRow('fee', 'agent_registration', 'Wakala (TSh 3,100)', 'Usajili wa wakala mpya wa SokoHai.')}
                        </div> </div> </div> <div style="background: white; border: 1px solid #cbd5e1; border-radius: 18px; padding: 20px; margin-bottom: 25px;"> <h4 style="margin:0 0 15px 0; color: var(--primary-dark); font-weight:900;"> MAOMBI YA WAWAKALA (AGENT APPROVALS)</h4> <div style="display:flex; flex-direction:column; gap:10px;">
                        ${agentsSnap.empty ? '<p style="color:gray; font-size:12px; text-align:center; padding:10px;">Hakuna maombi mapya kwa sasa.</p>' : ''}
                        ${agentsSnap.docs.map(doc => {
                            const ag = doc.data();
                            const paid = ag.paymentStatus === 'paid' || ag.isPaid === true;
                            const freeWaived = ag.paymentStatus === 'free' || ag.feeWaived === true;
                            const payBadge = paid
                                ? '<small style="color:green; font-weight:bold;"> ADA IMELIPWA</small>'
                                : (freeWaived ? '<small style="color:#2563eb; font-weight:bold;">FREE MODE — HAKUNA ADA</small>' : '<small style="color:#b45309; font-weight:bold;"> ADA HAIJALIPWA — pending</small>');
                            return `
                                <div style="padding:15px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;"> <div style="min-width: 200px;"> <b> Jina: ${skh.skhEscape(ag.fullName)}</b><br> <small style="color:gray;">Mkoa: ${skh.skhEscape(ag.location)} | Simu: ${skh.skhEscape(ag.contact)}</small><br>
                                        ${payBadge}
                                    </div> <div style="display:flex; gap:8px;"> <button onclick="window.approveAgent('${doc.id}', '${ag.userId}')" style="padding:8px 15px; background:var(--green); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">${T('pa_approve', 'APPROVE')} </button> <button onclick="window.rejectAgent('${doc.id}')" style="padding:8px 15px; background:#fee2e2; color:#ef4444; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">${T('pa_reject', 'REJECT')} </button> </div> </div>`;
                        }).join('')}
                    </div> </div> <div style="background: white; border: 1px solid #cbd5e1; border-radius: 18px; padding: 20px; margin-bottom: 25px;"> <h4 style="margin:0 0 15px 0; color: var(--primary-dark); font-weight:900;"> MIGOGORO YA ESCROW (ORDER DISPUTES)</h4> <div style="display:flex; flex-direction:column; gap:10px;">
                        ${disputesSnap.empty ? '<p style="color:gray; font-size:12px; text-align:center; padding:10px;">Hakuna migogoro inayoungojea utatuzi.</p>' : ''}
                        ${disputesSnap.docs.map(doc => {
                            const od = doc.data();
                            return `
                                <div style="padding:15px; background:#fbf2f2; border-left:5px solid red; border-radius:12px; text-align:left;"> <b> Oda: ${skh.skhEscape(od.itemTitle || 'Bidhaa')}</b> (TSh ${(od.amount != null ? Number(od.amount) : 0).toLocaleString()})<br> <span>Mnunuzi: ${skh.skhEscape(od.buyerName)} | Muuzaji: ${skh.skhEscape(od.sellerName)}</span><br> <p style="margin:5px 0; font-size:12px; background:white; padding:8px; border-radius:6px;">Sababu ya Mgogoro: <b>${od.disputeReason || 'N/A'}</b></p> <div style="display:flex; gap:8px; margin-top:10px;"> <button onclick="window.resolvePlatformDispute('${doc.id}', 'buyer')" style="padding:8px 15px; background:var(--primary-blue); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">${T('pa_refund_buyer', 'REFUND BUYER')}</button> <button onclick="window.resolvePlatformDispute('${doc.id}', 'seller')" style="padding:8px 15px; background:var(--green); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">${T('pa_pay_seller', 'PAY SELLER')}</button> </div> </div>`;
                        }).join('')}
                    </div> </div> <!-- HOME MANAGEMENT → ADVERTISEMENTS --> <div class="skh-ads-panel" style="background: white; border: 1px solid #cbd5e1; border-radius: 18px; padding: 20px;"> <div class="adm-ad-topnav"> <div> <h3 class="adm-ad-topnav-title">Matangazo</h3> <p class="adm-ad-topnav-sub">Unda, simamia na fuatilia matangazo ya Home Showcase. Ads active hubadilika kwa priority/rotation; scheduled, expired na archived hazionekani Home.</p> </div> <div class="adm-ad-actions"><button class="adm-ad-btn" onclick="window.skhOpenAdminMediaLibrary('libraryOnly')">Media Library</button><button class="adm-ad-btn primary" onclick="window.openAnnouncementFormModal()">+ Tengeneza Tangazo</button></div> </div> <div class="adm-ad-tabs"><button class="adm-ad-tab active" onclick="window.skhAdminAdSetFilter(\'active\',this)">Active</button><button class="adm-ad-tab" onclick="window.skhAdminAdSetFilter(\'scheduled\',this)">Scheduled</button><button class="adm-ad-tab" onclick="window.skhAdminAdSetFilter(\'paused\',this)">Paused</button><button class="adm-ad-tab" onclick="window.skhAdminAdSetFilter(\'draft\',this)">Draft</button><button class="adm-ad-tab" onclick="window.skhAdminAdSetFilter(\'completed\',this)">Completed</button><button class="adm-ad-tab" onclick="window.skhAdminAdSetFilter(\'expired\',this)">Expired</button><button class="adm-ad-tab" onclick="window.skhAdminAdSetFilter(\'archived\',this)">Archived</button><button class="adm-ad-tab" onclick="window.skhAdminAdSetFilter(\'campaigns\',this)">Campaigns</button><button class="adm-ad-tab" onclick="window.skhAdminAdSetFilter(\'analytics\',this)">Analytics</button></div><div id="adminAnnouncementListBox"> <p style="color:gray; font-size:12px; text-align:center; padding:10px;">Inapakia matangazo...</p> </div> </div> </div> `;

        window.renderAnnouncementManagerList();
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color:red; text-align:center; padding:30px;">Hitilafu imetokea.</p>`;
    }
};

window.__editingAnnouncementId = null;
window.__adminAdFilter = 'active';
window.__adminMediaTarget = 'annImage';

window.skhAdminAdState = function(a){
    if(!a || a.archived === true || a.lifecycleStatus === 'archived' || a.status === 'archived') return 'archived';
    if(a.lifecycleStatus === 'completed' || a.status === 'completed') return 'completed';
    if(a.lifecycleStatus === 'draft' || a.status === 'draft') return 'draft';
    const millis=value=>{if(value&&typeof value.toDate==='function'){try{return value.toDate().getTime();}catch(e){return 0;}}if(value instanceof Date)return value.getTime();const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?parsed:0;};
    const now=Date.now(), start=millis(a.startAt||a.startsAt||a.scheduledAt), end=millis(a.endAt||a.endsAt||a.expiresAt);
    if(end && end<=now) return 'expired';
    if(a.lifecycleStatus === 'paused') return 'paused';
    if((a.lifecycleStatus === 'scheduled' || a.status === 'scheduled') && (!start || start>now)) return 'scheduled';
    if(start && start>now) return 'scheduled';
    if(a.active === false) return a.status === 'published' || a.status === 'active' ? 'paused' : 'draft';
    return 'active';
};
window.skhAdminAdSetFilter=function(filter,btn){window.__adminAdFilter=filter;document.querySelectorAll('.adm-ad-tab').forEach(b=>b.classList.toggle('active',b===btn));window.renderAnnouncementManagerList();};
window.renderAnnouncementManagerList = function(){
    const box=document.getElementById('adminAnnouncementListBox');if(!box)return;
    const all=window.__sokohaiAnnouncementsCache||[], filter=window.__adminAdFilter||'active';
    /* [§26] Campaigns view — group active/published ads by campaignName */
    if(filter==='campaigns'){
      const groups={};
      all.filter(a=>a.campaignName).forEach(a=>{const k=String(a.campaignName);(groups[k]=groups[k]||[]).push(a);});
      const keys=Object.keys(groups).sort();
      if(!keys.length){box.innerHTML='<div style="padding:25px;text-align:center;color:#65757A;border:1px dashed #D7E6E1;border-radius:14px;">Hakuna campaigns bado — weka Campaign Name wakati unatengeneza tangazo.</div>';return;}
      box.innerHTML=keys.map(k=>'<div class="adm-ad-campaign"><h5 style="margin:12px 0 6px;">'+skh.skhEscape(k)+' <span style="font-weight:600;color:#65757A;font-size:11px;">('+groups[k].length+' ads)</span></h5><div class="adm-ad-list">'+groups[k].map(a=>{const state=window.skhAdminAdState(a);return '<article class="adm-ad-row"><div><div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><h5>'+skh.skhEscape(a.headline||a.title||'Ad')+'</h5><span class="adm-ad-state '+state+'">'+state+'</span></div><p>'+skh.skhEscape(a.brandName||'SokoHai')+' · Priority '+Number(a.priority||0)+' · clicks '+Number(a.clickCount||0)+' · views '+Number(a.viewCount||0)+'</p></div><div class="adm-ad-row-actions"><button class="adm-ad-mini" onclick="window.openAnnouncementFormModal(\''+a.id+'\')">Edit</button><button class="adm-ad-mini" onclick="window.skhAdminAdPreviewExisting(\''+a.id+'\')">Preview</button><button class="adm-ad-mini" onclick="window.skhOpenAdDeliverySettings(\''+skh.skhJsEsc(String(a.id))+'\')">Delivery</button></div></article>';}).join('')+'</div></div>').join('');
      return;
    }
    /* [§26] Analytics view — impressions / clicks / CTR per ad + totals */
    if(filter==='analytics'){
      const tot=all.reduce((acc,a)=>{acc.views+=Number(a.viewCount||0);acc.clicks+=Number(a.clickCount||0);return acc;},{views:0,clicks:0});
      const ctr=tot.views>0?((tot.clicks/tot.views)*100).toFixed(1):'0.0';
      const ranked=all.slice().sort((a,b)=>Number(b.clickCount||0)-Number(a.clickCount||0)).slice(0,15);
      box.innerHTML='<div class="adm-ad-analytics" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px;">'
        +'<div style="background:#F0F7FF;border-radius:12px;padding:12px;text-align:center;"><b style="font-size:22px;color:#1268A8;">'+all.length+'</b><p style="margin:4px 0 0;font-size:11px;color:#65757A;">Total ads</p></div>'
        +'<div style="background:#ECFDF5;border-radius:12px;padding:12px;text-align:center;"><b style="font-size:22px;color:#0E7A5F;">'+tot.views.toLocaleString()+'</b><p style="margin:4px 0 0;font-size:11px;color:#65757A;">Impressions</p></div>'
        +'<div style="background:#FFFBEB;border-radius:12px;padding:12px;text-align:center;"><b style="font-size:22px;color:#B45309;">'+tot.clicks.toLocaleString()+'</b><p style="margin:4px 0 0;font-size:11px;color:#65757A;">Clicks</p></div>'
        +'<div style="background:#F5F3FF;border-radius:12px;padding:12px;text-align:center;"><b style="font-size:22px;color:#6D28D9;">'+ctr+'%</b><p style="margin:4px 0 0;font-size:11px;color:#65757A;">CTR</p></div></div>'
        +(ranked.length?'<div class="adm-ad-list">'+ranked.map(a=>{const st=window.skhAdminAdState(a);return '<article class="adm-ad-row"><div><div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><h5>'+skh.skhEscape(a.headline||a.title||'Ad')+'</h5><span class="adm-ad-state '+st+'">'+st+'</span></div><p>👁 '+Number(a.viewCount||0)+' views · 🖱 '+Number(a.clickCount||0)+' clicks</p></div><div class="adm-ad-row-actions"><button class="adm-ad-mini" onclick="window.skhAdminAdPreviewExisting(\''+a.id+'\')">Preview</button><button class="adm-ad-mini" onclick="window.skhOpenAdDeliverySettings(\''+skh.skhJsEsc(String(a.id))+'\')">Delivery</button></div></article>';}).join('')+'</div>':'<div style="padding:20px;text-align:center;color:#65757A;">Hakuna events bado.</div>');
      return;
    }
    const items=all.filter(a=>window.skhAdminAdState(a)===filter).sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0));
    if(!items.length){box.innerHTML='<div style="padding:25px;text-align:center;color:#65757A;border:1px dashed #D7E6E1;border-radius:14px;">Hakuna advertisement kwenye hali hii.</div>';return;}
    box.innerHTML='<div class="adm-ad-list">'+items.map(a=>{const state=window.skhAdminAdState(a),thumb=a.image||a.imageUrl||a.posterUrl||a.logoUrl||'';return '<article class="adm-ad-row">'+(thumb?'<img class="adm-ad-thumb" src="'+skh.skhEscape(thumb)+'" onerror="this.style.visibility=\'hidden\'">':'<div class="adm-ad-thumb"></div>')+'<div><div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><h5>'+skh.skhEscape(a.headline||a.title||a.text||'Advertisement')+'</h5><span class="adm-ad-state '+state+'">'+state+'</span></div><p>'+skh.skhEscape(a.brandName||'SokoHai')+' · '+skh.skhEscape(a.creativeType||'image_text')+' · Priority '+Number(a.priority||0)+'</p><p>'+(a.startAt?new Date(a.startAt).toLocaleString():'Sasa')+' → '+(a.endAt?new Date(a.endAt).toLocaleString():'Bila mwisho')+'</p></div><div class="adm-ad-row-actions"><button class="adm-ad-mini" onclick="window.openAnnouncementFormModal(\''+a.id+'\')">Edit</button><button class="adm-ad-mini" onclick="window.skhAdminAdPreviewExisting(\''+a.id+'\')">Preview</button><button class="adm-ad-mini" onclick="window.skhOpenAdDeliverySettings(\''+skh.skhJsEsc(String(a.id))+'\')">Delivery</button><button class="adm-ad-mini danger" onclick="window.sokohaiDeleteAnnouncement(\''+a.id+'\')">Archive</button></div></article>';}).join('')+'</div>';
};

window.skhAdminAdPreviewExisting=function(id){const a=(window.__sokohaiAnnouncementsCache||[]).find(x=>x.id===id);if(!a)return;window.openAnnouncementFormModal(id);setTimeout(window.skhRenderAdminAdPreview,0);};
window.skhOpenAdDeliverySettings=async function(id){
  if(!((window.SOKOHAI_CLAIMS&&window.SOKOHAI_CLAIMS.isAdmin)||(skh.currentUser&&skh.currentUser.email===skh.MY_ADMIN_EMAIL))){alert('Admin authorization required.');return;}
  const announcementId=String(id||'');if(!announcementId)return;
  let campaign=(window.__sokohaiAnnouncementsCache||[]).find(item=>String(item.id)===announcementId);
  if(!campaign){try{const snap=await skh.getDoc(skh.doc(skh.db,'announcements',announcementId));if(snap.exists())campaign={...snap.data(),id:snap.id};}catch(e){}}
  if(!campaign){if(window.skhToast)window.skhToast('Campaign haijapatikana.','error');return;}
  const campaignLifecycle=String(campaign.lifecycleStatus||campaign.status||'').toLowerCase();
  if(campaign.archived===true||campaignLifecycle==='archived'){if(window.skhToast)window.skhToast('Archived campaigns ni read-only.','error');return;}
  const previous=document.getElementById('skhAdDeliverySettingsModal');if(previous)previous.remove();
  const modal=document.createElement('div');modal.id='skhAdDeliverySettingsModal';modal.className='overlay-menu';modal.style.cssText='position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.52);';
  modal.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="skhAdDeliveryTitle" style="width:min(100%,720px);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 20px 60px rgba(15,23,42,.24);"><header style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px"><div><h3 id="skhAdDeliveryTitle" style="margin:0;color:#18352D">Campaign Delivery Settings</h3><p style="margin:5px 0 0;color:#65757A;font-size:12px">Aina, placements, targeting, pacing goals na lifecycle ya delivery pekee — creative haibadilishwi.</p></div><button type="button" data-action="close" aria-label="Close" style="border:0;border-radius:9px;padding:8px 11px;background:#F1F5F4;color:#334155;font-weight:800;cursor:pointer">Funga</button></header><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px"><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Campaign type<select id="skhAdDeliveryType" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></select></label><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Lifecycle<select id="skhAdDeliveryState" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"><option value="keep">Keep current state</option><option value="active">Active / resume</option><option value="paused">Paused</option></select></label></div><fieldset style="border:1px solid #E5ECEC;border-radius:12px;padding:12px;margin:14px 0"><legend style="font-size:12px;font-weight:850;color:#18352D;padding:0 5px">Placements</legend><div id="skhAdDeliveryPlacements" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px"></div><small style="display:block;margin-top:9px;color:#65757A">Live/system alerts remain protected. A custom future placement still needs a host adapter before it can render.</small></fieldset><label style="display:grid;gap:5px;margin:10px 0;color:#18352D;font-size:12px;font-weight:800">Future placement keys (comma-separated, optional)<input id="skhAdDeliveryCustomPlacements" maxlength="400" placeholder="e.g. seller_dashboard" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px"><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Target categories<input id="skhAdDeliveryCategories" placeholder="footwear, beauty" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></label><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Target keywords<input id="skhAdDeliveryKeywords" placeholder="running, sports" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></label><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Target regions<input id="skhAdDeliveryRegions" placeholder="dar_es_salaam" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></label><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Target entity types<input id="skhAdDeliveryEntityTypes" placeholder="product, service" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></label><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Target entity IDs<input id="skhAdDeliveryEntityIds" placeholder="Optional exact IDs" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></label><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Daily viewable goal (0 = unlimited)<input id="skhAdDeliveryDailyGoal" type="number" min="0" max="1000000000" step="1" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></label><label style="display:grid;gap:5px;color:#18352D;font-size:12px;font-weight:800">Total viewable goal (0 = unlimited)<input id="skhAdDeliveryTotalGoal" type="number" min="0" max="1000000000" step="1" style="padding:10px;border:1px solid #D7E6E1;border-radius:9px"></label></div><p id="skhAdDeliveryStateNote" style="font-size:11px;color:#65757A;margin:12px 0"></p><footer style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" data-action="close" class="adm-ad-btn">Cancel</button><button type="button" id="skhAdDeliverySave" class="adm-ad-btn primary">Save delivery settings</button></footer></section>';
  document.body.appendChild(modal);
  const types=[['business','Business'],['product','Product'],['service','Service'],['event','Event'],['announcement','Announcement'],['promotion','Promotion'],['partnership','Partnership'],['community','Community'],['sokohai_announcement','SokoHai announcement'],['other','Other']];
  const typeSelect=modal.querySelector('#skhAdDeliveryType');types.forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;typeSelect.appendChild(option);});
  const placementOptions=[['home','Home'],['discover','Discover'],['search','Search'],['product_detail','Product detail'],['service_detail','Service detail'],['auction','Auction'],['group_buy','Group buy'],['price_drop','Price drop'],['chat','Chat inbox'],['groups','Community groups'],['dashboard','Buyer overview']];
  const placementRoot=modal.querySelector('#skhAdDeliveryPlacements');
  placementOptions.forEach(([value,label])=>{const wrapper=document.createElement('label');wrapper.style.cssText='display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #E5ECEC;border-radius:9px;color:#334155;font-size:12px';const input=document.createElement('input');input.type='checkbox';input.value=value;input.dataset.deliveryPlacement='true';const textNode=document.createElement('span');textNode.textContent=label;wrapper.append(input,textNode);placementRoot.appendChild(wrapper);});
  const splitList=value=>Array.isArray(value)?value.join(', '):(typeof value==='string'?value:'');
  const requestedType=String(campaign.campaignType||'other');typeSelect.value=types.some(item=>item[0]===requestedType)?requestedType:'other';
  const rawSelected=campaign.placements||campaign.delivery?.placements;
  const selectedPlacements=Array.isArray(rawSelected)?rawSelected.slice():(typeof rawSelected==='string'?rawSelected.split(/[;,|]/).map(value=>value.trim()).filter(Boolean):['home']);
  if(!selectedPlacements.length)selectedPlacements.push('home');
  modal.querySelectorAll('[data-delivery-placement]').forEach(input=>{input.checked=selectedPlacements.includes(input.value);});
  const known=new Set(placementOptions.map(item=>item[0]));
  modal.querySelector('#skhAdDeliveryCustomPlacements').value=selectedPlacements.filter(value=>!known.has(value)).join(', ');
  modal.querySelector('#skhAdDeliveryCategories').value=splitList(campaign.targetCategories||campaign.targeting?.categories);
  modal.querySelector('#skhAdDeliveryKeywords').value=splitList(campaign.targetKeywords||campaign.targeting?.keywords);
  modal.querySelector('#skhAdDeliveryRegions').value=splitList(campaign.targetRegions||campaign.targeting?.regions);
  modal.querySelector('#skhAdDeliveryEntityTypes').value=splitList(campaign.targetEntityTypes||campaign.targeting?.entityTypes);
  modal.querySelector('#skhAdDeliveryEntityIds').value=splitList(campaign.targetEntityIds||campaign.targeting?.entityIds);
  const existingGoals=campaign.goals||campaign.deliveryGoals||campaign.deliveryGoal||{};
  modal.querySelector('#skhAdDeliveryDailyGoal').value=String(Number(existingGoals.dailyImpressions||existingGoals.dailyGoal||campaign.dailyImpressionGoal)||0);
  modal.querySelector('#skhAdDeliveryTotalGoal').value=String(Number(existingGoals.totalImpressions||existingGoals.totalGoal||campaign.totalImpressionGoal||campaign.impressionGoal)||0);
  const stateSelect=modal.querySelector('#skhAdDeliveryState');
  const lifecycle=String(campaign.lifecycleStatus||campaign.status||'').toLowerCase();
  const moderation=String(campaign.moderationStatus||'').toLowerCase();
  const dateMillis=value=>{if(value&&typeof value.toDate==='function'){try{return value.toDate().getTime();}catch(e){return 0;}}if(value instanceof Date)return value.getTime();const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?parsed:0;};
  const currentStart=dateMillis(campaign.startAt||campaign.startsAt||campaign.scheduledAt),currentEnd=dateMillis(campaign.endAt||campaign.endsAt||campaign.expiresAt);
  const canChangeState=!campaign.archived&&lifecycle!=='archived'&&lifecycle!=='completed'&&lifecycle!=='draft'&&campaign.status!=='draft'&&(!currentEnd||currentEnd>Date.now())&&!(moderation&& !['approved','published','active'].includes(moderation));
  const currentlyPaused=lifecycle==='paused'||(campaign.active===false&&lifecycle!=='scheduled'&&campaign.status!=='scheduled');
  stateSelect.value=canChangeState?(currentlyPaused?'paused':'active'):'keep';stateSelect.disabled=!canChangeState;
  const note=modal.querySelector('#skhAdDeliveryStateNote');
  const isDraft=lifecycle==='draft'||campaign.status==='draft'||moderation==='draft';
  note.textContent=canChangeState?(currentStart>Date.now()?'Resuming keeps the existing future start time; the server will retain Scheduled until then.':'Paused campaigns stop immediately; total-goal and expiry completion are server-managed.'):(isDraft?'Draft delivery metadata can be saved now; the draft stays non-serving until the shared publish validation succeeds.':'Lifecycle is read-only here for moderation-pending, completed, expired, or archived campaigns.');
  const close=()=>modal.remove();modal.querySelectorAll('[data-action="close"]').forEach(button=>button.addEventListener('click',close));modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('#skhAdDeliverySave').addEventListener('click',async function(){
    const button=this;button.disabled=true;button.textContent='Saving…';
    try{
      const placements=Array.from(modal.querySelectorAll('[data-delivery-placement]:checked')).map(input=>input.value);
      const custom=modal.querySelector('#skhAdDeliveryCustomPlacements').value.split(/[;,|]/).map(value=>value.trim()).filter(Boolean);
      const allPlacements=Array.from(new Set(placements.concat(custom)));
      if(!allPlacements.length)throw new Error('Chagua angalau placement moja.');
      const goals={dailyImpressions:Number(modal.querySelector('#skhAdDeliveryDailyGoal').value)||0,totalImpressions:Number(modal.querySelector('#skhAdDeliveryTotalGoal').value)||0};
      for(const value of Object.values(goals)){if(!Number.isSafeInteger(value)||value<0||value>1000000000)throw new Error('Goal lazima iwe namba nzima kati ya 0 na 1,000,000,000.');}
      if(!skh.callFunction)throw new Error('Campaign delivery service haipatikani.');
      const response=await skh.callFunction('adsUpdateCampaignDelivery',{announcementId,delivery:{campaignType:typeSelect.value,placements:allPlacements,targetCategories:modal.querySelector('#skhAdDeliveryCategories').value,targetKeywords:modal.querySelector('#skhAdDeliveryKeywords').value,targetRegions:modal.querySelector('#skhAdDeliveryRegions').value,targetEntityTypes:modal.querySelector('#skhAdDeliveryEntityTypes').value,targetEntityIds:modal.querySelector('#skhAdDeliveryEntityIds').value,goals},lifecycleAction:stateSelect.value});
      const result=response&&response.data||response;if(!result||result.ok===false)throw new Error('Delivery settings hazikuhifadhiwa.');
      const cache=Array.isArray(window.__sokohaiAnnouncementsCache)?window.__sokohaiAnnouncementsCache.slice():[];const index=cache.findIndex(item=>String(item.id)===announcementId);
      if(index>=0)cache[index]=Object.assign({},cache[index],result);window.__sokohaiAnnouncementsCache=cache;
      if(typeof window.__sokohaiOnAnnouncementsUpdate==='function')window.__sokohaiOnAnnouncementsUpdate(cache);if(typeof window.renderAnnouncementManagerList==='function')window.renderAnnouncementManagerList();
      close();if(window.skhToast)window.skhToast('Delivery settings zimehifadhiwa.','success');
    }catch(error){/* Backend failure stays a failure: nothing is written to the cache, the modal stays open. */const reason=typeof window.skhFnErrText==='function'?window.skhFnErrText(error,'adsUpdateCampaignDelivery'):(error&&error.message||String(error));if(window.skhToast)window.skhToast('Imeshindwa kuhifadhi delivery settings: '+reason,'error');else alert('Imeshindwa kuhifadhi delivery settings: '+reason);button.disabled=false;button.textContent='Save delivery settings';}
  });
};
window.skhAdFormHtml=function(){return `
<section class="adm-ad-form adm-ad-basic-form adm-ad-designer" data-design-mode="auto" aria-labelledby="annFormTitle">
  <div class="adm-ad-form-head">
    <div><span class="adm-ad-eyebrow">SokoHai · ADVERTISEMENT DESIGNER</span><h3 id="annFormTitle">Tengeneza Tangazo</h3><p class="adm-ad-form-lead">Editor moja — Auto Design au Customize kwenye creative ileile na preview ileile.</p></div>
    <div class="adm-ad-head-actions">
      <div class="adm-ad-mode-switch" role="radiogroup" aria-label="Design mode">
        <button type="button" role="radio" data-design-mode-btn="auto" aria-checked="true">✨ <span>Easy · Auto</span></button>
        <button type="button" role="radio" data-design-mode-btn="manual" aria-checked="false">🎛 <span>Customize</span></button>
      </div>
      <button type="button" class="adm-ad-btn adm-ad-close" aria-label="Funga designer" onclick="document.getElementById('announcementFormModal').style.display='none'">✕ <span>Funga</span></button>
    </div>
  </div>
  <input id="annDesignMode" type="hidden" value="auto">
  <nav class="adm-ad-section-nav" aria-label="Sehemu za designer">
    <button type="button" data-jump="content">Content</button><button type="button" data-jump="media">Media</button><button type="button" data-jump="design">Design</button><button type="button" data-jump="text">Text</button><button type="button" data-jump="cta">CTA</button><button type="button" data-jump="layers">Layers</button><button type="button" data-jump="animation">Animation</button><button type="button" data-jump="preview">Preview</button><button type="button" data-jump="publish">Publish</button>
  </nav>

  <div class="adm-ad-form-grid adm-ad-basic-grid adm-ad-designer-grid">
    <aside class="adm-ad-preview-wrap adm-ad-basic-preview" id="annPreviewWrapper" data-basic-step="preview" aria-label="Live preview">
      <div class="adm-ad-preview-header"><div><h4>Live Preview</h4><small id="annTypeReadoutMini" class="adm-ad-type-mini"></small></div><div class="adm-ad-preview-head-actions"><span class="adm-live-pill"><i class="adm-live-dot"></i> LIVE</span><button type="button" class="adm-ad-btn adm-preview-toggle-btn" aria-expanded="true" aria-controls="annPreviewStage" onclick="window.skhToggleMobileAdPreview()">▾ <span>Ficha</span></button></div></div>
      <div id="annPreviewStage" class="adm-ad-preview-stage">
        <div class="adm-ad-preview-toolbar">
          <div class="adm-ad-seg" role="radiogroup" aria-label="Kifaa cha preview"><button type="button" role="radio" data-preview-device="mobile" aria-checked="true">📱 Mobile</button><button type="button" role="radio" data-preview-device="desktop" aria-checked="false">🖥 Desktop</button></div>
          <label class="adm-ad-placement-pick">Placement<select id="annPreviewPlacement" aria-label="Placement ya preview" onchange="window.skhAdSetPreviewPlacement(this.value)"><option value="home">Home</option><option value="discover">Discover</option><option value="chat">Chat</option><option value="groups">Group</option><option value="product">Product</option><option value="service">Service</option><option value="dashboard">Dashboard</option><option value="compact">Compact</option></select></label>
        </div>
        <div class="adm-ad-device-frame is-mobile" id="annDeviceFrame"><div id="annPreview" class="adm-ad-preview" aria-live="polite"></div></div>
        <div class="adm-ad-preview-transport"><button type="button" onclick="window.skhAdPreviewTransport('play')">▶ Preview</button><button type="button" onclick="window.skhAdPreviewTransport('pause')">⏸ Pause</button><button type="button" onclick="window.skhAdPreviewTransport('restart')">↻ Restart</button><button type="button" id="annPreviewMute" onclick="window.skhAdPreviewTransport('mute')">🔇 Mute</button></div>
        <div class="adm-ad-preview-duration">Duration: <b id="annPreviewDuration">9s</b> <span id="annPreviewSlideTiming"></span></div>
        <label class="adm-ad-preview-confirm"><input id="annPreviewConfirmed" type="checkbox"> Nimekagua tangazo lilivyoonekana</label>
        <button type="button" class="adm-ad-btn adm-preview-focus" onclick="window.skhAdPreviewTransport('play')">▶ Preview tangazo</button>
      </div>
    </aside>

    <div class="adm-ad-fields adm-ad-basic-fields adm-ad-controls">
      <div id="annEmptyState" class="adm-ad-empty-state" role="region" aria-label="Anza tangazo">
        <b>Create your advertisement</b><p>Start with anything — maandishi, picha, video, sauti au Auto Design. Hakuna hatua ya lazima.</p>
        <div class="adm-ad-empty-actions"><button type="button" class="adm-ad-btn" onclick="window.skhAdEmptyAction('text')">✎ Add Text</button><button type="button" class="adm-ad-btn" onclick="window.skhAdEmptyAction('media')">＋ Add Media</button><button type="button" class="adm-ad-btn primary" onclick="window.skhAdEmptyAction('auto')">✨ Use Auto Design</button></div>
      </div>

      <details class="adm-ad-step" open data-basic-step="content">
        <summary><span class="adm-ad-step-number" aria-hidden="true">✎</span><span class="adm-ad-step-copy"><b>Content</b><small>Biashara, brand, headline, maelezo, bei, ofa na badge.</small></span></summary>
        <div class="adm-ad-step-content">
          <div class="adm-ad-choice-grid adm-ad-category-grid" role="group" aria-label="Tangazo linahusu nini">
            <button type="button" data-basic-category="product"><span aria-hidden="true">▣</span><b>Bidhaa</b></button>
            <button type="button" data-basic-category="service"><span aria-hidden="true">✦</span><b>Huduma</b></button>
            <button type="button" data-basic-category="transport"><span aria-hidden="true">↗</span><b>Usafiri</b></button>
            <button type="button" data-basic-category="business"><span aria-hidden="true">⌂</span><b>Biashara</b></button>
            <button type="button" data-basic-category="general"><span aria-hidden="true">◉</span><b>Tangazo la Jumla</b></button>
          </div>
          <input id="annCategory" type="hidden" value="general">
          <label>Brand / Business name<input id="annBrand" maxlength="80" placeholder="Jina la biashara au brand" oninput="window.skhRenderAdminAdPreview()"></label>
          <div class="ann-copy-fields">
            <label>Headline<input id="annHeadline" maxlength="${TEXT_ROLE_LIMITS.headline}" placeholder="Kichwa kifupi kinachovutia" oninput="window.skhRenderAdminAdPreview()"></label>
            <label>Short description<textarea id="annText" rows="3" maxlength="${TEXT_ROLE_LIMITS.body}" placeholder="Eleza faida au ujumbe kwa sentensi chache" oninput="window.skhRenderAdminAdPreview()"></textarea></label>
            <div class="adm-ad-two">
              <label>Price / Offer<input id="annPriceTag" maxlength="${TEXT_ROLE_LIMITS.price}" placeholder="Mfano: TSh 45,000 · Ofa 20%" oninput="window.skhRenderAdminAdPreview()"></label>
              <label>Promotional badge<input id="annBadgeText" maxlength="${TEXT_ROLE_LIMITS.badge}" placeholder="Mfano: Ofa Maalum" oninput="window.skhRenderAdminAdPreview()"></label>
            </div>
            <div class="adm-ad-quick-badges"><span>Badges za haraka</span><div class="adm-ad-presets"><button type="button" onclick="window.skhSetAdBadge('🔥 OFA MAALUM','#E11D48')">🔥 Ofa Maalum</button><button type="button" onclick="window.skhSetAdBadge('⚡ FLASH SALE','#D97706')">⚡ Flash Sale</button><button type="button" onclick="window.skhSetAdBadge('🏷️ PUNGUZO 50%','#059669')">🏷️ Punguzo</button><button type="button" onclick="window.skhSetAdBadge('⭐ BORA','#7C3AED')">⭐ Bora</button><button type="button" onclick="window.skhSetAdBadge('🚚 USAFIRI BURE','#0284C7')">🚚 Usafiri Bure</button><button type="button" onclick="window.skhSetAdBadge('✨ MPYA','#0E7A5F')">✨ Mpya</button><button type="button" onclick="window.skhSetAdBadge('','')">✕ Bila Badge</button></div></div>
          </div>
          <label class="adm-ad-field-label adm-ad-campaign-field">Campaign name <span>(hiari)</span><input id="annCampaignName" maxlength="80" placeholder="Mfano: Ofa ya Wiki ya Saba" oninput="window.skhRenderAdminAdPreview()"></label>
          <input id="annCampaignId" type="hidden" value="">
        </div>
      </details>

      <details class="adm-ad-step" open data-basic-step="media">
        <summary><span class="adm-ad-step-number" aria-hidden="true">▣</span><span class="adm-ad-step-copy"><b>Media</b><small>Zote ni hiari: picha, video, sauti, picha nyingi, logo.</small></span></summary>
        <div class="adm-ad-step-content">
          <div id="annMediaDrop" class="adm-ad-dropzone" tabindex="0" role="group" aria-label="Ongeza media — buruta faili hapa au tumia vitufe">
            <p class="adm-ad-drop-hint">Buruta picha, video au sauti hapa — au chagua:</p>
            <div class="adm-ad-add-media">
              <button type="button" class="adm-ad-btn" data-add-media="image">+ Add Image</button>
              <button type="button" class="adm-ad-btn" data-add-media="video">+ Add Video</button>
              <button type="button" class="adm-ad-btn" data-add-media="audio">+ Add Audio</button>
              <button type="button" class="adm-ad-btn" data-add-media="logo">+ Add Logo</button>
              <button type="button" class="adm-ad-btn" data-add-media="slideshow">+ Picha nyingi</button>
            </div>
            <input id="annDropFiles" type="file" accept="image/*,video/*,audio/*" multiple hidden onchange="window.skhAdHandleMediaFiles(this.files);this.value=''">
          </div>
          <div class="adm-ad-type-line"><span>Aina ya tangazo:</span> <b id="annTypeReadout">Auto · Text</b> <button type="button" class="adm-ad-linkbtn" id="annTypeUnlock" hidden onclick="window.skhAdUnlockType()">↺ Rudi Auto</button></div>
          <details class="adm-ad-type-override"><summary>Badilisha aina mwenyewe (hiari)</summary>
            <div class="adm-ad-choice-grid adm-ad-kind-grid">
              <button type="button" data-basic-type="image_text"><span>▧</span><b>Image + Text</b></button>
              <button type="button" data-basic-type="image"><span>▣</span><b>Image Only</b></button>
              <button type="button" data-basic-type="solid_text"><span>✎</span><b>Text / Graphic</b></button>
              <button type="button" data-basic-type="video"><span>▶</span><b>Video</b></button>
              <button type="button" data-basic-type="video_text"><span>▷</span><b>Video + Text</b></button>
              <button type="button" data-basic-type="image_audio"><span>♫</span><b>Image + Audio</b></button>
              <button type="button" data-basic-type="audio"><span>♪</span><b>Audio + Background</b></button>
              <button type="button" data-basic-type="image_video"><span>▦</span><b>Image + Video</b></button>
              <button type="button" data-basic-type="video_audio"><span>▶♫</span><b>Video + Audio</b></button>
              <button type="button" data-basic-type="slideshow"><span>▤</span><b>Slideshow</b></button>
              <button type="button" data-basic-type="full_multimedia"><span>✧</span><b>Full Multimedia</b></button>
            </div>
          </details>
          <select id="annCreativeType" hidden aria-hidden="true">
            <option value="image_text">Image + Text</option><option value="image">Image Only</option><option value="solid_text">Text / Graphic</option><option value="video">Video</option><option value="video_text">Video + Text</option><option value="image_audio">Image + Audio</option><option value="slideshow">Slideshow</option><option value="full_multimedia">Full Multimedia</option><option value="image_video">Image + Video</option><option value="video_audio">Video + Audio</option><option value="audio">Audio + Background</option>
          </select>
          <input id="annTypeLocked" type="hidden" value=""><input id="annFormatLocked" type="hidden" value="">

          <div class="adm-ad-media-slot" data-media-kind="image" hidden>
            <div class="adm-ad-slot-head"><b>Picha</b><button type="button" class="adm-ad-remove" aria-label="Ondoa picha" onclick="window.skhAdRemoveMedia('image')">✕ Ondoa</button></div>
            <div class="adm-ad-upload"><input id="annImage" type="url" placeholder="HTTPS image URL" aria-label="Image URL" oninput="window.skhRenderAdminAdPreview()"><input id="annImageFile" type="file" accept="image/*" hidden onchange="window.skhAdminAdUpload('image',this)"><button type="button" class="adm-ad-btn" onclick="document.getElementById('annImageFile').click()">⬆ Upload</button><button type="button" class="adm-ad-btn" onclick="window.skhOpenAdminMediaLibrary('annImage')">Library</button></div>
          </div>
          <div class="adm-ad-media-slot" data-media-kind="video" hidden>
            <div class="adm-ad-slot-head"><b>Video</b><button type="button" class="adm-ad-remove" aria-label="Ondoa video" onclick="window.skhAdRemoveMedia('video')">✕ Ondoa</button></div>
            <div class="adm-ad-upload"><input id="annVideo" type="url" placeholder="HTTPS video URL" aria-label="Video URL" oninput="window.skhRenderAdminAdPreview()" onchange="window.skhProbeVideoDuration(this.value)"><input id="annVideoFile" type="file" accept="video/*" hidden onchange="window.skhAdminAdUpload('video',this)"><button type="button" class="adm-ad-btn" onclick="document.getElementById('annVideoFile').click()">⬆ Upload</button><button type="button" class="adm-ad-btn" onclick="window.skhOpenAdminMediaLibrary('annVideo')">Library</button></div>
            <div class="adm-ad-video-meta"><label>Muda wa original video (sekunde)<input id="annVideoOriginalDuration" type="number" min="0" step="0.1" placeholder="Utasomwa moja kwa moja" oninput="window.skhVideoDurationChanged()"></label><span id="annVideoDurationStatus">Duration itasomwa baada ya video kuchaguliwa.</span></div>
            <div id="annVideoTrimPanel" class="adm-ad-trim-panel" hidden><b>Trim Video</b><p id="annVideoTrimNote">Video ya original haibadilishwi; tunahifadhi trim range tu.</p><div class="adm-ad-two"><label>Trim start (s)<input id="annVideoTrimStart" type="number" min="0" max="${MAX_AD_DURATION_SECONDS}" step="0.1" value="0" oninput="window.skhVideoTrimChanged()"></label><label>Trim end (s)<input id="annVideoTrimEnd" type="number" min="${MIN_AD_DURATION_SECONDS}" max="${MAX_AD_DURATION_SECONDS}" step="0.1" value="${MAX_AD_DURATION_SECONDS}" oninput="window.skhVideoTrimChanged()"></label></div><button type="button" class="adm-ad-btn" onclick="window.skhTrimVideoTo59()">Trim Video to max ${MAX_AD_DURATION_SECONDS}s</button><small id="annVideoTrimLength">Final clip: —</small></div>
          </div>
          <div class="adm-ad-media-slot" data-media-kind="audio" hidden>
            <div class="adm-ad-slot-head"><b>Sauti</b><button type="button" class="adm-ad-remove" aria-label="Ondoa sauti" onclick="window.skhAdRemoveMedia('audio')">✕ Ondoa</button></div>
            <div class="adm-ad-upload"><input id="annAudio" type="url" placeholder="HTTPS audio URL" aria-label="Audio URL" oninput="window.skhRenderAdminAdPreview()"><input id="annAudioFile" type="file" accept="audio/*" hidden onchange="window.skhAdminAdUpload('audio',this)"><button type="button" class="adm-ad-btn" onclick="document.getElementById('annAudioFile').click()">⬆ Upload</button><button type="button" class="adm-ad-btn" onclick="window.skhOpenAdminMediaLibrary('annAudio')">Library</button></div>
          </div>
          <div class="adm-ad-media-slot" data-media-kind="logo" hidden>
            <div class="adm-ad-slot-head"><b>Logo</b><button type="button" class="adm-ad-remove" aria-label="Ondoa logo" onclick="window.skhAdRemoveMedia('logo')">✕ Ondoa</button></div>
            <div class="adm-ad-upload"><input id="annLogo" type="url" placeholder="HTTPS logo URL" aria-label="Logo URL" oninput="window.skhRenderAdminAdPreview()"><input id="annLogoFile" type="file" accept="image/*" hidden onchange="window.skhAdminAdUpload('logo',this)"><button type="button" class="adm-ad-btn" onclick="document.getElementById('annLogoFile').click()">⬆ Upload</button><button type="button" class="adm-ad-btn" onclick="window.skhOpenAdminMediaLibrary('annLogo')">Library</button></div>
          </div>
          <div class="adm-ad-media-slot" data-media-kind="slideshow" hidden>
            <div class="adm-ad-slot-head"><b>Picha nyingi · Slideshow</b></div>
            <div class="adm-ad-upload"><input id="annSlideshowFiles" type="file" accept="image/*" multiple hidden data-target="annSlideshow" onchange="window.skhAdminAdUpload('image',this)"><button type="button" class="adm-ad-btn" onclick="document.getElementById('annSlideshowFiles').click()">+ Add multiple images</button><button type="button" class="adm-ad-btn" onclick="window.skhOpenAdminMediaLibrary('annSlideshow')">Choose from Library</button></div>
            <div id="annSlidesList" class="adm-ad-slides-list"></div>
            <label>Default duration / slide (s)<input id="annSlideshowDefaultDuration" type="number" min="${MIN_SLIDE_DURATION_SECONDS}" max="${MAX_SLIDE_DURATION_SECONDS}" value="${DEFAULT_SLIDE_DURATION_SECONDS}" onchange="window.skhSlideshowChanged()"></label>
            <div class="adm-ad-slide-total"><span>Total slideshow duration</span><b id="annSlideshowTotal">0s</b><small id="annSlideshowWarning"></small></div>
          </div>
          <input id="annSlideshow" type="hidden" value=""><input id="annMediaDuration" type="hidden" value="">

          <fieldset class="adm-ad-group adm-ad-manual-only" id="annMediaTransform" data-owner="media"><legend>Media transform · crop &amp; position</legend>
            <label>Fit / crop<select id="annMediaFit" onchange="window.skhRenderAdminAdPreview()"><option value="cover">Cover (jaza frame)</option><option value="contain">Contain (bila kukata)</option><option value="fill">Fill (nyoosha)</option></select></label>
            <div class="adm-ad-two"><label class="adm-ad-range">Focal X (kushoto ↔ kulia)<span class="adm-ad-range-row"><input id="annFocalX" type="range" min="0" max="100" step="1" value="50" data-unit="%" aria-describedby="annFocalXOut" oninput="window.skhRenderAdminAdPreview()"><output id="annFocalXOut" for="annFocalX">50%</output></span></label><label class="adm-ad-range">Focal Y (juu ↕ chini)<span class="adm-ad-range-row"><input id="annFocalY" type="range" min="0" max="100" step="1" value="50" data-unit="%" aria-describedby="annFocalYOut" oninput="window.skhRenderAdminAdPreview()"><output id="annFocalYOut" for="annFocalY">50%</output></span></label></div>
            <div class="adm-ad-two"><label class="adm-ad-range">Overlay<span class="adm-ad-range-row"><input id="annOverlayOpacity" type="range" min="0" max="85" step="1" value="0" data-unit="%" aria-describedby="annOverlayOpacityOut" oninput="window.skhRenderAdminAdPreview()"><output id="annOverlayOpacityOut" for="annOverlayOpacity">0%</output></span></label><label class="adm-ad-range">Brightness<span class="adm-ad-range-row"><input id="annBrightness" type="range" min="50" max="150" step="1" value="100" data-unit="%" aria-describedby="annBrightnessOut" oninput="window.skhRenderAdminAdPreview()"><output id="annBrightnessOut" for="annBrightness">100%</output></span></label></div>
            <div class="adm-ad-two"><label class="adm-ad-range">Contrast<span class="adm-ad-range-row"><input id="annContrast" type="range" min="50" max="150" step="1" value="100" data-unit="%" aria-describedby="annContrastOut" oninput="window.skhRenderAdminAdPreview()"><output id="annContrastOut" for="annContrast">100%</output></span></label><label class="adm-ad-range">Saturation<span class="adm-ad-range-row"><input id="annSaturation" type="range" min="0" max="200" step="1" value="100" data-unit="%" aria-describedby="annSaturationOut" oninput="window.skhRenderAdminAdPreview()"><output id="annSaturationOut" for="annSaturation">100%</output></span></label></div>
            <input id="annFocalPoint" type="hidden" value="center">
          </fieldset>
        </div>
      </details>

      <details class="adm-ad-step" open data-basic-step="design">
        <summary><span class="adm-ad-step-number" aria-hidden="true">✦</span><span class="adm-ad-step-copy"><b>Design</b><small>Auto Design, Design Views, presets, layout, background, rangi, effects.</small></span></summary>
        <div class="adm-ad-step-content">
          <div class="adm-ad-auto-panel" role="region" aria-label="Auto Design">
            <div class="adm-ad-auto-head"><div><b>✨ Auto Design</b><small id="annAutoStatus">Inapanga design kulingana na content, media na placement.</small></div><button type="button" class="adm-ad-btn primary" id="btnAutoDesign" onclick="window.skhAdRunAutoDesign(true)">✨ Auto Design</button></div>
            <details class="adm-ad-auto-why"><summary>Kwa nini design hii?</summary><ul id="annAutoReasons"></ul></details>
            <button type="button" class="adm-ad-linkbtn adm-ad-manual-only" id="btnResetManual" onclick="window.skhAdResetManualEdits()">↺ Futa mabadiliko ya manual, rudisha Auto</button>
          </div>
          <div class="adm-ad-field-label">Presets</div>
          <div class="adm-ad-preset-row" id="annPresetRow" role="group" aria-label="Design presets"></div>
          <details class="adm-ad-palette-details adm-ad-views"><summary>Design Views <span id="annViewCount"></span></summary><div class="adm-ad-palette-grid" id="annPaletteGrid" role="group" aria-label="Design Views"></div></details>
          <input id="annPaletteId" type="hidden" value=""><input id="annDesignViewId" type="hidden" value=""><input id="annPresetId" type="hidden" value="">
          <small class="adm-ad-pal-hint" id="annPaletteHint"></small>
          <div class="adm-ad-format-block"><label class="adm-ad-field-label">Layout · Format</label><div class="adm-ad-format-options" role="group" aria-label="Format">
            <button type="button" data-basic-format="1:1"><b>Square</b><small>1:1</small></button><button type="button" data-basic-format="4:5"><b>Portrait</b><small>4:5</small></button><button type="button" data-basic-format="9:16"><b>Story</b><small>9:16</small></button><button type="button" data-basic-format="16:9"><b>Landscape</b><small>16:9</small></button>
          </div><select id="annMediaAspect" hidden aria-hidden="true"><option value="16:9">Landscape 16:9</option><option value="1:1">Square 1:1</option><option value="4:5">Portrait 4:5</option><option value="9:16">Story 9:16</option></select></div>
          <div class="adm-ad-manual-only">
            <fieldset class="adm-ad-group"><legend>Background</legend>
              <label>Background style<select id="annBackgroundMode" onchange="window.skhRenderAdminAdPreview()"><option value="gradient">Gradient</option><option value="solid">Solid color</option></select></label>
              <div class="adm-ad-color-grid"><label><span>Background color</span><input id="annPrimaryColor" type="color" value="#0E7A5F" oninput="window.skhRenderAdminAdPreview()"></label><label><span>Second / gradient color</span><input id="annAccentColor" type="color" value="#167A91" oninput="window.skhRenderAdminAdPreview()"></label></div>
              <label class="adm-ad-range">Gradient angle<span class="adm-ad-range-row"><input id="annGradientAngle" type="range" min="0" max="360" step="5" value="135" data-unit="°" aria-describedby="annGradientAngleOut" oninput="window.skhRenderAdminAdPreview()"><output id="annGradientAngleOut" for="annGradientAngle">135°</output></span></label>
              <div class="adm-ad-background-image"><label>Background image (hiari) · nyuma ya maandishi au media</label><div class="adm-ad-upload"><input id="annBackgroundImage" type="url" placeholder="HTTPS background image URL" aria-label="Background image URL" oninput="window.skhRenderAdminAdPreview()"><input id="annBackgroundImageFile" data-target="annBackgroundImage" type="file" accept="image/*" hidden onchange="window.skhAdminAdUpload('image',this)"><button type="button" class="adm-ad-btn" onclick="document.getElementById('annBackgroundImageFile').click()">⬆ Upload</button><button type="button" class="adm-ad-btn" onclick="window.skhOpenAdminMediaLibrary('annBackgroundImage')">Library</button></div></div>
            </fieldset>
            <fieldset class="adm-ad-group"><legend>Colors</legend>
              <div class="adm-ad-color-grid adm-ad-text-colors"><label><span>Headline color</span><input id="annTextColor" type="color" value="#102A43" oninput="window.__skhBasicTextColorTouched=true;window.skhRenderAdminAdPreview()"></label><label><span>Description color</span><input id="annDescriptionColor" type="color" value="#102A43" oninput="window.__skhBasicDescriptionColorTouched=true;window.skhRenderAdminAdPreview()"></label><label><span>Card surface</span><input id="annSurfaceColor" type="color" value="#FFFFFF" oninput="window.skhRenderAdminAdPreview()"></label><label><span>Offer background</span><input id="annOfferColor" type="color" value="#167A91" oninput="window.skhRenderAdminAdPreview()"></label><label><span>Offer text</span><input id="annOfferTextColor" type="color" value="#102A43" oninput="window.skhRenderAdminAdPreview()"></label><label><span>Badge color</span><input id="annBadgeColor" type="color" value="#F59E0B" oninput="window.skhRenderAdminAdPreview()"></label><label><span>Badge text</span><input id="annBadgeTextColor" type="color" value="#FFFFFF" oninput="window.skhRenderAdminAdPreview()"></label></div>
            </fieldset>
            <fieldset class="adm-ad-group"><legend>Badge &amp; shapes</legend>
              <div class="adm-ad-two"><label>Badge style<select id="annBadgeStyle" onchange="window.skhRenderAdminAdPreview()"><option value="pill">Pill</option><option value="ribbon">Ribbon</option><option value="sticker">Sticker</option><option value="stamp">Stamp</option><option value="glass">Glass</option><option value="outline">Outline</option></select></label><label>Badge position<select id="annBadgePosition" onchange="window.skhRenderAdminAdPreview()"><option value="tr">Juu kulia</option><option value="tl">Juu kushoto</option><option value="br">Chini kulia</option><option value="bl">Chini kushoto</option></select></label></div>
              <div class="adm-ad-two"><label>Badge size<select id="annBadgeSize" onchange="window.skhRenderAdminAdPreview()"><option value="sm">Ndogo</option><option value="md">Kati</option><option value="lg">Kubwa</option></select></label><label>Badge icon<select id="annBadgeIcon" onchange="window.skhRenderAdminAdPreview()"><option value="none">Bila icon</option><option value="fire">🔥</option><option value="bolt">⚡</option><option value="tag">🏷️</option><option value="star">⭐</option><option value="truck">🚚</option><option value="sparkle">✨</option></select></label></div>
              <label class="adm-ad-range">Badge opacity<span class="adm-ad-range-row"><input id="annBadgeOpacity" type="range" min="40" max="100" step="1" value="100" data-unit="%" aria-describedby="annBadgeOpacityOut" oninput="window.skhRenderAdminAdPreview()"><output id="annBadgeOpacityOut" for="annBadgeOpacity">100%</output></span></label>
            </fieldset>
            <fieldset class="adm-ad-group"><legend>Effects</legend>
              <label>Card shadow<select id="annCardShadow" onchange="window.skhRenderAdminAdPreview()"><option value="">Default</option><option value="none">None</option><option value="soft">Soft</option><option value="lifted">Lifted</option><option value="glow">Glow</option></select></label>
              <div class="adm-ad-two"><label class="adm-ad-range">Corner radius<span class="adm-ad-range-row"><input id="annBorderRadius" type="range" min="0" max="36" step="1" value="22" data-unit="px" aria-describedby="annBorderRadiusOut" oninput="window.skhRenderAdminAdPreview()"><output id="annBorderRadiusOut" for="annBorderRadius">22px</output></span></label><label class="adm-ad-range">Frame opacity<span class="adm-ad-range-row"><input id="annFrameOpacity" type="range" min="8" max="100" step="1" value="42" data-unit="%" aria-describedby="annFrameOpacityOut" oninput="window.skhAdOpacityChanged(this.value)"><output id="annFrameOpacityOut" for="annFrameOpacity">42%</output></span></label></div>
            </fieldset>
          </div>
          <div id="annContrastHint" class="adm-ad-contrast" role="status"></div>
          <p class="adm-ad-auto-note">Auto Design inasimamia background, rangi na effects. <button type="button" class="adm-ad-linkbtn" data-design-mode-btn="manual">🎛 Customize</button></p>
        </div>
      </details>

      <details class="adm-ad-step" data-basic-step="text">
        <summary><span class="adm-ad-step-number" aria-hidden="true">T</span><span class="adm-ad-step-copy"><b>Text</b><small>Font, weight, size, spacing, alignment, effects.</small></span></summary>
        <div class="adm-ad-step-content">
          <p class="adm-ad-auto-note">Typography inapangwa na Auto Design kulingana na urefu wa maandishi. <button type="button" class="adm-ad-linkbtn" data-design-mode-btn="manual">🎛 Customize</button></p>
          <div class="adm-ad-manual-only adm-ad-text-controls">
            <div class="adm-ad-two"><label>Font<select id="annFontFamily" onchange="window.skhRenderAdminAdPreview()"><option value="">Default (Inter)</option><option value="sans">Modern Sans</option><option value="display">Display / Bold</option><option value="rounded">Rounded / Friendly</option><option value="serif">Serif / Elegant</option></select></label><label>Headline weight<select id="annFontWeight" onchange="window.skhRenderAdminAdPreview()"><option value="600">Semibold</option><option value="700">Bold</option><option value="750">Bold+</option><option value="800">Extra bold</option><option value="850">Heavy</option><option value="900">Black</option><option value="950">Ultra</option></select></label></div>
            <div class="adm-ad-two"><label class="adm-ad-range">Headline size<span class="adm-ad-range-row"><input id="annHeadlineSize" type="range" min="${TEXT_ROLE_SIZES.headline.min}" max="${TEXT_ROLE_SIZES.headline.max}" step="1" value="64" data-unit=" px" aria-describedby="annHeadlineSizeOut" oninput="window.skhRenderAdminAdPreview()"><output id="annHeadlineSizeOut" for="annHeadlineSize">64 px</output></span></label><label>Headline alignment<select id="annTextAlign" onchange="window.skhRenderAdminAdPreview()"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
            <div class="adm-ad-two"><label class="adm-ad-range">Letter spacing<span class="adm-ad-range-row"><input id="annHeadlineLetterSpacing" type="range" min="-3" max="8" step="0.1" value="0" data-unit=" px" aria-describedby="annHeadlineLetterSpacingOut" oninput="window.skhRenderAdminAdPreview()"><output id="annHeadlineLetterSpacingOut" for="annHeadlineLetterSpacing">0 px</output></span></label><label class="adm-ad-range">Line height<span class="adm-ad-range-row"><input id="annHeadlineLineHeight" type="range" min="0.9" max="1.6" step="0.02" value="1.1" data-unit="" aria-describedby="annHeadlineLineHeightOut" oninput="window.skhRenderAdminAdPreview()"><output id="annHeadlineLineHeightOut" for="annHeadlineLineHeight">1.1</output></span></label></div>
            <label>Text effect<select id="annTextShadow" onchange="window.skhRenderAdminAdPreview()"><option value="none">None</option><option value="subtle">Subtle shadow</option><option value="strong">Strong shadow</option></select></label>
            <div class="adm-ad-two"><label class="adm-ad-range">Description size<span class="adm-ad-range-row"><input id="annDescriptionSize" type="range" min="${TEXT_ROLE_SIZES.body.min}" max="${TEXT_ROLE_SIZES.body.max}" step="1" value="20" data-unit=" px" aria-describedby="annDescriptionSizeOut" oninput="window.skhRenderAdminAdPreview()"><output id="annDescriptionSizeOut" for="annDescriptionSize">20 px</output></span></label><label>Description alignment<select id="annDescriptionAlign" onchange="window.skhRenderAdminAdPreview()"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
            <div class="adm-ad-two"><label class="adm-ad-range">Offer size<span class="adm-ad-range-row"><input id="annOfferSize" type="range" min="${TEXT_ROLE_SIZES.price.min}" max="${TEXT_ROLE_SIZES.price.max}" step="1" value="24" data-unit=" px" aria-describedby="annOfferSizeOut" oninput="window.skhRenderAdminAdPreview()"><output id="annOfferSizeOut" for="annOfferSize">24 px</output></span></label><label>Offer alignment<select id="annOfferAlign" onchange="window.skhRenderAdminAdPreview()"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
            <div class="adm-ad-two"><label class="adm-ad-range">Badge text size<span class="adm-ad-range-row"><input id="annBadgeFontSize" type="range" min="${TEXT_ROLE_SIZES.badge.min}" max="${TEXT_ROLE_SIZES.badge.max}" step="1" value="14" data-unit=" px" aria-describedby="annBadgeFontSizeOut" oninput="window.skhRenderAdminAdPreview()"><output id="annBadgeFontSizeOut" for="annBadgeFontSize">14 px</output></span></label><label>Badge text alignment<select id="annBadgeTextAlign" onchange="window.skhRenderAdminAdPreview()"><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select></label></div>
          </div>
        </div>
      </details>

      <details class="adm-ad-step" open data-basic-step="cta">
        <summary><span class="adm-ad-step-number" aria-hidden="true">➜</span><span class="adm-ad-step-copy"><b>CTA</b><small>Label, style, action, position.</small></span></summary>
        <div class="adm-ad-step-content">
          <label>Kitufe cha tangazo<select id="annCta" onchange="window.skhCtaChanged()"><option value="">None</option><option value="Nunua Sasa">Nunua Sasa</option><option value="Wasiliana Nasi">Wasiliana Nasi</option><option value="Tazama Zaidi">Tazama Zaidi</option><option value="Jisajili">Jisajili</option><option value="Custom">Custom</option></select></label>
          <div id="annCtaCustomWrap" hidden><label>Maandishi ya CTA yako<input id="annCtaCustom" maxlength="${TEXT_ROLE_LIMITS.cta}" placeholder="Mfano: Omba Ofa" oninput="window.skhRenderAdminAdPreview()"></label></div>
          <div id="annCtaUrlWrap" hidden><label>CTA URL / action<input id="annLink" type="url" placeholder="https://..." oninput="window.skhRenderAdminAdPreview()"><small>Weka HTTPS link pale CTA inapohitaji kufungua ukurasa.</small></label></div>
          <div class="adm-ad-manual-only">
            <div class="adm-ad-two"><label>CTA style<select id="annCtaStyle" onchange="window.skhRenderAdminAdPreview()"><option value="solid">Solid</option><option value="gradient">Gradient</option><option value="pill">Pill</option><option value="outline">Outline</option><option value="border">Border</option><option value="glass">Glass</option><option value="glow">Glow</option><option value="shine">Shine</option></select></label><label>CTA icon<select id="annCtaIcon" onchange="window.skhRenderAdminAdPreview()"><option value="arrow">→ arrow</option><option value="cart">🛒 cart</option><option value="phone">📞 phone</option><option value="whatsapp">💬 whatsapp</option><option value="star">⭐ star</option><option value="download">⬇ download</option><option value="external">↗ external</option><option value="calendar">📅 calendar</option><option value="location">📍 location</option><option value="none">Bila icon</option></select></label></div>
            <label>CTA position<select id="annCtaAlign" onchange="window.skhRenderAdminAdPreview()"><option value="">Auto</option><option value="left">Kushoto</option><option value="center">Katikati</option><option value="right">Kulia</option><option value="full">Upana wote</option></select></label>
          </div>
        </div>
      </details>

      <details class="adm-ad-step" data-basic-step="animation">
        <summary><span class="adm-ad-step-number" aria-hidden="true">◎</span><span class="adm-ad-step-copy"><b>Animation</b><small>Entrance, transition, motion, timing.</small></span></summary>
        <div class="adm-ad-step-content">
          <p class="adm-ad-auto-note">Auto Design huchagua mwendo mmoja tulivu. <button type="button" class="adm-ad-linkbtn" data-design-mode-btn="manual">🎛 Customize</button></p>
          <div class="adm-ad-manual-only">
            <div class="adm-ad-two"><label>Headline entrance<select id="annTextAnimation" onchange="window.skhRenderAdminAdPreview()"><option value="none">None</option><option value="fade">Fade</option><option value="slide-up">Slide up</option><option value="slide-down">Slide down</option><option value="slide-left">Slide left</option><option value="slide-right">Slide right</option><option value="zoom-in">Zoom in</option><option value="zoom-out">Zoom out</option><option value="pop">Pop</option><option value="bounce">Bounce</option><option value="blur-in">Blur in</option><option value="typewriter">Typewriter</option></select></label><label>Headline motion<select id="annTextEmphasis" onchange="window.skhRenderAdminAdPreview()"><option value="none">None</option><option value="pulse">Pulse</option><option value="glow">Glow</option><option value="shake">Shake</option><option value="bounce">Bounce</option><option value="scale">Scale</option><option value="wobble">Wobble</option><option value="highlight">Highlight</option></select></label></div>
            <div class="adm-ad-two"><label>Text reveal<select id="annAnimationMode" onchange="window.skhRenderAdminAdPreview()"><option value="whole">Whole</option><option value="word">Word by word</option><option value="character">Character</option><option value="line">Line by line</option></select></label><label class="adm-ad-range">Speed<span class="adm-ad-range-row"><input id="annAnimationDuration" type="range" min="100" max="3000" step="50" value="600" data-unit=" ms" aria-describedby="annAnimationDurationOut" oninput="window.skhRenderAdminAdPreview()"><output id="annAnimationDurationOut" for="annAnimationDuration">600 ms</output></span></label></div>
            <div class="adm-ad-two"><label>Badge animation<select id="annBadgeAnimation" onchange="window.skhRenderAdminAdPreview()"><option value="none">None</option><option value="pop">Pop</option><option value="pulse">Pulse</option><option value="glow">Glow</option><option value="slide">Slide</option><option value="scale">Scale</option><option value="shake">Shake</option></select></label><label>CTA animation<select id="annCtaAnimation" onchange="window.skhRenderAdminAdPreview()"><option value="none">None</option><option value="pulse">Pulse</option><option value="glow">Glow</option><option value="scale">Scale</option><option value="shine">Shine</option><option value="slide">Slide</option><option value="fade">Fade</option></select></label></div>
            <label id="annSlideshowTransitionWrap">Slideshow transition<select id="annSlideshowTransition" onchange="window.skhSlideshowChanged()"><option value="fade">Fade</option><option value="crossfade">Crossfade</option><option value="slide-left">Slide Left</option><option value="slide-right">Slide Right</option><option value="zoom">Zoom</option><option value="none">None</option></select></label>
          </div>
          <div class="adm-ad-group adm-ad-timing" data-basic-step="timing">
            <b>Timing</b>
            <div class="adm-ad-radio-row"><label><input type="radio" name="annTimingMode" value="auto" checked onchange="window.skhTimingModeChanged()"><span><b>Auto</b><small>Muda kulingana na content</small></span></label><label><input type="radio" name="annTimingMode" value="custom" onchange="window.skhTimingModeChanged()"><span><b>Custom</b><small>${MIN_AD_DURATION_SECONDS}–${MAX_AD_DURATION_SECONDS} sekunde</small></span></label></div>
            <label id="annCreativeDurationWrap">Creative duration (sekunde)<input id="annCreativeDuration" type="number" min="${MIN_AD_DURATION_SECONDS}" max="${MAX_AD_DURATION_SECONDS}" step="1" value="${DISPLAY_DURATION_SECONDS.default}" oninput="window.skhTimingDurationChanged()"><small id="annAutoDurationNote">Auto: muda hubadilika kulingana na video/slideshow au content.</small></label>
            <div class="adm-ad-duration-readout">Muda wa preview: <b id="annCreativeDurationReadout">9s</b><span id="annMediaDurationReadout"></span></div>
          </div>
          <input id="annVideoAutoplay" type="checkbox" hidden><input id="annVideoLoop" type="checkbox" checked hidden><input id="annVideoMuted" type="checkbox" checked hidden>
        </div>
      </details>
      <input id="annStatus" type="hidden" value="draft"><input id="annCreativeId" type="hidden" value=""><input id="annCreativeState" type="hidden" value="">
      <input id="annHiddenElements" type="hidden" value=""><input id="annLockedElements" type="hidden" value=""><input id="annElementOrder" type="hidden" value=""><input id="annMediaPosition" type="hidden" value="top"><input id="annTouched" type="hidden" value=""><input id="annAutoReasonsState" type="hidden" value="">
    </div>

    <aside class="adm-ad-properties" id="annPropertiesPanel" aria-label="Properties: mapendekezo na layers">
      <div class="adm-ad-sheet-handle"><b>Properties</b><button type="button" class="adm-ad-btn adm-ad-sheet-close" aria-label="Funga properties" onclick="window.skhAdToggleProperties(false)">✕</button></div>
      <section class="adm-ad-suggest" aria-labelledby="annSuggestTitle"><h4 id="annSuggestTitle">💡 Mapendekezo</h4><div id="annSuggestions" class="adm-ad-suggest-list" aria-live="polite"></div></section>
      <details class="adm-ad-step adm-ad-layers" open data-basic-step="layers">
        <summary><span class="adm-ad-step-number" aria-hidden="true">≡</span><span class="adm-ad-step-copy"><b>Layers</b><small>Order, show/hide, lock, move, resize.</small></span></summary>
        <div class="adm-ad-step-content"><ol id="annLayersList" class="adm-ad-layer-list" aria-label="Layers za tangazo"></ol><small class="adm-ad-help">🔒 Lock huzuia Auto Design kubadilisha kipengele hicho.</small></div>
      </details>
    </aside>
  </div>

  <div class="adm-ad-submit adm-ad-basic-actions" data-basic-step="publish" aria-label="Hifadhi au chapisha tangazo">
    <button type="button" class="adm-ad-btn adm-ad-props-trigger" aria-controls="annPropertiesPanel" onclick="window.skhAdToggleProperties()">💡 <span id="annSuggestCount">0</span></button>
    <button type="button" class="adm-ad-btn adm-ad-schedule-trigger" onclick="window.skhToggleAdSchedule()">Ratiba</button>
    <button type="button" class="adm-ad-btn" id="btnSaveAdDraft" onclick="window.submitAnnouncementForm('draft')">Hifadhi Draft</button>
    <button type="button" class="adm-ad-btn adm-ad-preview-submit" onclick="window.skhAdPreviewTransport('play')">▶ Preview</button>
    <button type="button" class="adm-ad-btn primary" id="btnSubmitAnnouncement" onclick="window.submitAnnouncementForm('publish')">Publish</button>
  </div>

  <details class="adm-ad-schedule-panel" id="annSchedulePanel">
    <summary><span>SCHEDULE</span> Ratiba ya tangazo (imejitenga na design controls)</summary>
    <div class="adm-ad-schedule-fields">
      <label>Start date / time<input id="annStartAt" type="datetime-local"></label><label>End date / time<input id="annEndAt" type="datetime-local"></label>
      <label>Priority<input id="annPriority" type="number" min="0" max="999" value="0"></label>
      <label>Display duration kwenye Home (${DISPLAY_DURATION_SECONDS.min}–${DISPLAY_DURATION_SECONDS.max}s)<input id="annDisplayDuration" type="number" min="${DISPLAY_DURATION_SECONDS.min}" max="${DISPLAY_DURATION_SECONDS.max}" step="1" value="${DISPLAY_DURATION_SECONDS.default}"></label>
    </div>
    <button type="button" class="adm-ad-btn primary" id="btnScheduleAnnouncement" onclick="window.submitAnnouncementForm('schedule')">Ratibu tangazo</button>
  </details>

  <div class="adm-ad-hidden-compat" hidden aria-hidden="true">
    <span>BASIC</span><span>DESIGN</span><span>MOTION</span><span>MEDIA</span><span>CTA</span><span>SCHEDULE</span>
    <select id="annCtaCompat"><option>Angalia Sasa</option><option>Jifunze Zaidi</option><option>Tembelea</option><option>Buy Now</option><option>Wasiliana Nasi</option><option>Pata Ofa Hii</option><option>Agiza Hapa</option><option>Piga Simu</option><option>Download</option><option>Install</option><option>Apply Now</option><option>Book Appointment</option><option>Register</option><option>Visit Website</option><option>Tazama Zaidi</option><option>Nunua Sasa</option></select>
    <input id="annDurationVal" value="600ms"><input id="annBrightVal" value="100%"><input id="annContrastVal" value="100%"><input id="annFrameOpacityValue" value="42%"><input id="annGradientAngleValue" value="135°"><input id="annBorderRadiusValue" value="22px">
  </div>
</section>`;};

window.skhSetAdBadge=function(text,color){
    const bInput=document.getElementById('annBadgeText'),cInput=document.getElementById('annBadgeColor');
    if(bInput)bInput.value=text||'';
    if(cInput&&color)cInput.value=color;
    window.skhRenderAdminAdPreview();
};

window.skhToggleMobileAdPreview=function(force){
    const pw=document.getElementById('annPreviewWrapper');
    if(!pw)return;
    const collapsed=typeof force==='boolean'?!force:!pw.classList.contains('is-collapsed');
    pw.classList.toggle('is-collapsed',collapsed);pw.classList.toggle('mobile-expanded',!collapsed);
    const btn=pw.querySelector('.adm-preview-toggle-btn');
    if(btn){btn.setAttribute('aria-expanded',String(!collapsed));btn.innerHTML=(collapsed?'▸ <span>Onyesha</span>':'▾ <span>Ficha</span>');}
};

function adInput(id){return document.getElementById(id);}
function adValue(id){return String(adInput(id)?.value||'').trim();}
function adSet(id,value){const el=adInput(id);if(el)el.value=value==null?'':String(value);}
window.skhAdUpdateReadouts=function(){document.querySelectorAll('#announcementFormModal input[type=range][data-unit]').forEach(input=>{const out=adInput(input.id+'Out');if(out)out.textContent=input.value+(input.dataset.unit||'');});};
function adLocalDate(value){
  if(!value)return '';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,16);
  const pad=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}
function adFormValueEqual(a,b){
  if(Number.isNaN(a)&&Number.isNaN(b))return true;
  if(a===b)return true;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){try{return JSON.stringify(a)===JSON.stringify(b);}catch(e){}}
  return false;
}
function adInputDateIso(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toISOString();}
function adReadSlideshow(){
  try{const x=JSON.parse(adValue('annSlideshow')||'{}');return x&&Array.isArray(x.slides)?x:{enabled:false,transition:'fade',defaultDuration:DEFAULT_SLIDE_DURATION_SECONDS,slides:[]};}
  catch(e){return{enabled:false,transition:'fade',defaultDuration:DEFAULT_SLIDE_DURATION_SECONDS,slides:[]};}
}
function adWriteSlideshow(ss,render=true){
  const normalized=window.SokoHaiAdsDesignRules?window.SokoHaiAdsDesignRules.normalizeSlideshow({...ss,enabled:Array.isArray(ss.slides)&&ss.slides.length>=2}):ss;
  const initial=window.__skhBasicInitialFormValues&&window.__skhBasicInitialFormValues.slideshow;
  window.__skhBasicSlideshowChanged=initial==null?!(!normalized.slides||!normalized.slides.length):!adFormValueEqual(normalized,initial);
  adSet('annSlideshow',JSON.stringify(normalized));
  adRenderSlideshow();
  if(render)window.skhRenderAdminAdPreview();
  return normalized;
}
function adRenderSlideshow(){
  const box=adInput('annSlidesList');if(!box)return;
  const ss=adReadSlideshow(),slides=ss.slides||[];
  if(!slides.length){box.innerHTML='<div class="adm-ad-empty-slides">Ongeza picha angalau mbili ili kuunda slideshow.</div>';}
  else box.innerHTML=slides.map((slide,index)=>'<article class="adm-ad-slide-row"><img src="'+skh.skhEscape(slide.src)+'" alt="'+skh.skhEscape(slide.name||('Slide '+(index+1)))+'"><div class="adm-ad-slide-main"><b>'+skh.skhEscape(slide.name||('Picha '+(index+1)))+'</b><label>Muda (sekunde)<input type="number" min="'+MIN_SLIDE_DURATION_SECONDS+'" max="'+MAX_SLIDE_DURATION_SECONDS+'" step="1" value="'+(Number(slide.duration)||DEFAULT_SLIDE_DURATION_SECONDS)+'" oninput="window.skhSlideDurationChanged('+index+',this.value)"></label></div><div class="adm-ad-slide-actions"><button type="button" aria-label="Move slide up" '+(index===0?'disabled':'')+' onclick="window.skhSlideMove('+index+',-1)">↑</button><button type="button" aria-label="Move slide down" '+(index===slides.length-1?'disabled':'')+' onclick="window.skhSlideMove('+index+',1)">↓</button><button type="button" aria-label="Remove slide" onclick="window.skhSlideRemove('+index+')">×</button></div></article>').join('');
  const total=slides.reduce((sum,x)=>sum+(Number(x.duration)||DEFAULT_SLIDE_DURATION_SECONDS),0),totalEl=adInput('annSlideshowTotal'),warning=adInput('annSlideshowWarning');
  if(totalEl)totalEl.textContent=total+'s · '+slides.length+' picha';
  if(warning){warning.textContent=total>MAX_SLIDESHOW_DURATION_SECONDS?'Jumla lazima iwe chini ya '+(MAX_SLIDESHOW_DURATION_SECONDS+1)+'s. Punguza muda wa slide.':'';warning.classList.toggle('is-error',total>MAX_SLIDESHOW_DURATION_SECONDS);}
  const transition=adInput('annSlideshowTransition'),def=adInput('annSlideshowDefaultDuration');
  if(transition)transition.value=ss.transition||'fade';
  if(def)def.value=ss.defaultDuration||DEFAULT_SLIDE_DURATION_SECONDS;
  const timing=adInput('annPreviewSlideTiming');if(timing)timing.textContent=slides.length?'Slideshow · '+total+'s':'';
}
function adBasicFormValues(){
  const ss=adReadSlideshow();
  const ctaMode=adValue('annCta');
  const ctaLabel=ctaMode==='Custom'?adValue('annCtaCustom'):(ctaMode==='None'?'':ctaMode);
  const rawDuration=Number(adValue('annVideoOriginalDuration'))||0;
  const trimStart=Number(adValue('annVideoTrimStart'))||0;
  const trimEnd=Number(adValue('annVideoTrimEnd'))||rawDuration;
  const mode=document.querySelector('#announcementFormModal input[name="annTimingMode"]:checked')?.value||'auto';
  return{
    ownerId:skh.currentUser?.uid||'',creativeId:adValue('annCreativeId'),
    creativeType:adResolvedType(),creativeTypeChanged:!!window.__skhBasicTypeChanged,formatChanged:!!window.__skhBasicFormatChanged,slideshowChanged:!!window.__skhBasicSlideshowChanged,category:adValue('annCategory')||'general',
    campaignName:adValue('annCampaignName'),campaignId:adValue('annCampaignId'),
    brandName:adValue('annBrand'),headline:adValue('annHeadline'),description:adValue('annText'),
    offer:adValue('annPriceTag'),priceTag:adValue('annPriceTag'),
    offerColor:adValue('annOfferColor')||'#167A91',offerTextColor:adValue('annOfferTextColor')||'#102A43',offerSize:Number(adValue('annOfferSize'))||24,offerAlign:adValue('annOfferAlign')||'left',
    descriptionColor:adValue('annDescriptionColor')||adValue('annTextColor')||'#102A43',descriptionSize:Number(adValue('annDescriptionSize'))||20,descriptionAlign:adValue('annDescriptionAlign')||adValue('annTextAlign')||'left',
    badgeText:adValue('annBadgeText'),badgeFontSize:Number(adValue('annBadgeFontSize'))||14,badgeTextAlign:adValue('annBadgeTextAlign')||'center',
    badgeStyle:adValue('annBadgeStyle')||'pill',badgeColor:adValue('annBadgeColor')||'#F59E0B',badgeTextColor:adValue('annBadgeTextColor')||'#FFFFFF',
    badgeAnimation:adValue('annBadgeAnimation')||'none',ctaLabel,cta:ctaLabel,ctaMode,ctaCustom:adValue('annCtaCustom'),
    ctaStyle:adValue('annCtaStyle')||'solid',ctaIcon:adValue('annCtaIcon')||'arrow',ctaAnimation:adValue('annCtaAnimation')||'none',
    link:adValue('annLink'),imageUrl:adValue('annImage'),image:adValue('annImage'),videoUrl:adValue('annVideo'),audioUrl:adValue('annAudio'),logoUrl:adValue('annLogo'),
    backgroundImageUrl:adValue('annBackgroundImage'),backgroundMode:adValue('annBackgroundMode')||'gradient',
    primaryColor:adValue('annPrimaryColor')||'#0E7A5F',accentColor:adValue('annAccentColor')||'#167A91',
    textColor:adValue('annTextColor')||'#102A43',surfaceColor:adValue('annSurfaceColor')||'#FFFFFF',
    frameOpacity:Math.max(.08,Math.min(1,(Number(adValue('annFrameOpacity'))||42)/100)),gradientAngle:Number(adValue('annGradientAngle'))||135,borderRadius:Number(adValue('annBorderRadius'))||22,
    fontWeight:Number(adValue('annFontWeight'))||800,fontSize:Number(adValue('annHeadlineSize'))||64,textAlign:adValue('annTextAlign')||'left',textShadow:adValue('annTextShadow')||'none',
    textAnimation:adValue('annTextAnimation')||'none',animationDuration:Number(adValue('annAnimationDuration'))||600,textEmphasis:adValue('annTextEmphasis')||'none',animationMode:adValue('annAnimationMode')||'whole',
    paletteId:adValue('annPaletteId'),format:adValue('annMediaAspect')||'16:9',aspectRatio:adValue('annMediaAspect')||'16:9',
    slideshow:ss,slideshowJson:ss,slideshowTransition:adValue('annSlideshowTransition')||ss?.transition||'fade',
    videoOriginalDuration:rawDuration,videoTrimStart:trimStart,videoTrimEnd:trimEnd,
    videoLoop:!!adInput('annVideoLoop')?.checked,videoMuted:adInput('annVideoMuted')?!!adInput('annVideoMuted').checked:true,
    timingMode:mode,creativeDuration:adValue('annCreativeDuration')===''?NaN:Number(adValue('annCreativeDuration')),durationAuto:mode!=='custom',
    startAt:adInputDateIso(adValue('annStartAt')),endAt:adInputDateIso(adValue('annEndAt')),
    priority:adValue('annPriority')===''?0:Number(adValue('annPriority')),displayDurationSeconds:adValue('annDisplayDuration')===''?DISPLAY_DURATION_SECONDS.default:Number(adValue('annDisplayDuration')),
    status:adValue('annStatus')||'draft',
    /* [AD DESIGNER 2026-09-24] previously hidden/dropped controls, now persisted */
    badgeSize:adValue('annBadgeSize')||'md',badgePosition:adValue('annBadgePosition')||'tr',badgeIcon:adValue('annBadgeIcon')||'none',badgeOpacity:Math.max(.4,Math.min(1,(Number(adValue('annBadgeOpacity'))||100)/100)),
    headlineLetterSpacing:Number(adValue('annHeadlineLetterSpacing'))||0,headlineLineHeight:Number(adValue('annHeadlineLineHeight'))||1.1,
    mediaFit:adValue('annMediaFit')||'cover',focalX:adNum('annFocalX',50),focalY:adNum('annFocalY',50),overlayOpacity:adNum('annOverlayOpacity',0)/100,
    brightness:adNum('annBrightness',100),contrast:adNum('annContrast',100),saturation:adNum('annSaturation',100),
    ctaAlign:adValue('annCtaAlign'),designMode:adValue('annDesignMode')==='manual'?'manual':'auto',designViewId:adValue('annDesignViewId'),presetId:adValue('annPresetId'),
    fontFamily:adValue('annFontFamily'),cardShadow:adValue('annCardShadow'),mediaPosition:adValue('annMediaPosition')==='bottom'?'bottom':'top',
    hiddenElements:adList('annHiddenElements'),lockedElements:adList('annLockedElements'),elementOrder:adList('annElementOrder').length?adList('annElementOrder'):ORDERABLE_ELEMENTS.slice(),
    typeLocked:adValue('annTypeLocked')==='1',formatLocked:adValue('annFormatLocked')==='1',touched:adList('annTouched'),autoReasons:adJson('annAutoReasonsState',[])
  };
}
function adNum(id,fallback){const v=adValue(id);if(v==='')return fallback;const n=Number(v);return Number.isFinite(n)?n:fallback;}
function adList(id){return adValue(id).split(',').map(x=>x.trim()).filter(Boolean);}
function adJson(id,fallback){try{const v=JSON.parse(adValue(id)||'null');return v==null?fallback:v;}catch(e){return fallback;}}
function adCurrentCreative(){
  const raw=adValue('annCreativeState');let current=window.__skhBasicCreative||null;
  if(raw)try{current=JSON.parse(raw);}catch(e){}
  const previous=window.__skhBasicInitialCreative||current;
  const form=adBasicFormValues(),baseline=window.__skhBasicInitialFormValues;
  if(baseline&&previous){
    form.changedFields=Object.keys(form).filter(key=>!adFormValueEqual(form[key],baseline[key]));
    if(form.changedFields.length===0)return previous;
  }
  const next=buildBasicCreative(form,previous);
  window.__skhBasicCreative=next;
  const hidden=adInput('annCreativeState');if(hidden)hidden.value=JSON.stringify(next);
  if(next.id)adSet('annCreativeId',next.id);
  return next;
}
function adTypeFromLegacy(value,existing){
  const allowed=BASIC_AD_TYPES;
  const text=String(value||'');if(allowed.includes(text))return text;
  if(text==='graphic'||text==='text_graphic'||text==='full_bleed')return 'solid_text';
  if(text==='video_audio'||text==='full_mix')return 'full_multimedia';
  if(existing?.slideshow?.enabled)return 'slideshow';
  if(existing?.videoUrl)return existing?.headline||existing?.description?'video_text':'video';
  if(existing?.image||existing?.imageUrl)return 'image_text';
  return 'solid_text';
}
function adFillFromCreative(creative,existing={}){
  const f=basicFormFromCreative(creative,existing),set=(id,v)=>adSet(id,v);
  const preserveOption=(id,value)=>{const el=adInput(id),v=String(value==null?'':value);if(!el||!v||Array.from(el.options||[]).some(option=>option.value===v))return;const option=document.createElement('option');option.value=v;option.textContent='Advanced value (preserved) · '+v;option.hidden=true;el.appendChild(option);};
  [['annTextAnimation',f.textAnimation],['annFontWeight',f.fontWeight],['annTextAlign',f.textAlign],['annDescriptionAlign',f.descriptionAlign],['annOfferAlign',f.offerAlign],['annBadgeTextAlign',f.badgeTextAlign],['annTextEmphasis',f.textEmphasis],['annCtaStyle',f.ctaStyle],['annCtaIcon',f.ctaIcon],['annBadgeStyle',f.badgeStyle],['annBadgeAnimation',f.badgeAnimation],['annCtaAnimation',f.ctaAnimation],['annMediaFit',f.mediaFit],['annTextShadow',f.textShadow]].forEach(([id,value])=>preserveOption(id,value));
  const type=adTypeFromLegacy(f.creativeType,existing);
  if(type==='slideshow'&&creative.slideshow&&Array.isArray(creative.slideshow.slides)&&creative.slideshow.slides.length>=2&&!creative.slideshow.enabled){
    creative.slideshow={...creative.slideshow,enabled:true};f.slideshow=creative.slideshow;
  }
  const values={
    annCreativeType:type,annCategory:f.category,annCampaignName:f.campaignName,annCampaignId:f.campaignId,
    annBrand:f.brandName,annHeadline:f.headline,annText:f.description,annDescriptionColor:f.descriptionColor,annDescriptionSize:f.descriptionSize,annDescriptionAlign:f.descriptionAlign,
    annPriceTag:f.offer,annOfferColor:f.offerColor,annOfferTextColor:f.offerTextColor,annOfferSize:f.offerSize,annOfferAlign:f.offerAlign,
    annBadgeText:f.badgeText,annBadgeFontSize:f.badgeFontSize,annBadgeTextAlign:f.badgeTextAlign,
    annBadgeStyle:f.badgeStyle,annBadgeColor:f.badgeColor,annBadgeTextColor:f.badgeTextColor,
    annCta:f.ctaLabel,annCtaCustom:f.ctaCustom,annLink:f.link,annImage:f.imageUrl,annVideo:f.videoUrl,annAudio:f.audioUrl,annLogo:f.logoUrl,
    annBackgroundImage:f.backgroundImageUrl,annBackgroundMode:f.backgroundMode,annPrimaryColor:f.primaryColor,annAccentColor:f.accentColor,
    annTextColor:f.textColor,annSurfaceColor:f.surfaceColor,annFrameOpacity:Math.round(f.frameOpacity*100),annGradientAngle:f.gradientAngle,annBorderRadius:f.borderRadius,
    annHeadlineSize:f.fontSize,annFontWeight:f.fontWeight,annTextAlign:f.textAlign,annTextShadow:f.textShadow,annTextAnimation:f.textAnimation,
    annPaletteId:f.paletteId,annMediaAspect:f.format,annSlideshow:JSON.stringify(f.slideshow||{}),annMediaDuration:f.mediaDurationSeconds||'',
    annVideoOriginalDuration:f.videoOriginalDuration,annVideoTrimStart:f.videoTrimStart,annVideoTrimEnd:f.videoTrimEnd,annVideoMuted:f.videoMuted,
    annPriority:f.priority,annStartAt:adLocalDate(f.startAt),annEndAt:adLocalDate(f.endAt),annDisplayDuration:f.displayDurationSeconds,
    annCreativeDuration:f.creativeDuration,annCreativeId:f.creativeId,annStatus:f.status||'draft',
    annBadgeAnimation:f.badgeAnimation,annCtaAnimation:f.ctaAnimation,annAnimationDuration:f.animationDuration,
    annBadgeSize:f.badgeSize||'md',annBadgePosition:f.badgePosition||'tr',annBadgeOpacity:Math.round((f.badgeOpacity||1)*100),annBadgeIcon:f.badgeIcon||'none',
    annTextEmphasis:f.textEmphasis||'none',annAnimationMode:f.animationMode||'whole',annCtaStyle:f.ctaStyle||'solid',annCtaIcon:f.ctaIcon||'arrow',annCtaAlign:f.ctaAlign||'',
    annHeadlineLetterSpacing:f.headlineLetterSpacing||0,annHeadlineLineHeight:f.headlineLineHeight||1.1,
    annMediaFit:f.mediaFit||'cover',annFocalX:f.focalX??50,annFocalY:f.focalY??50,annOverlayOpacity:Math.round((f.overlayOpacity||0)*100),
    annBrightness:f.brightness||100,annContrast:f.contrast||100,annSaturation:f.saturation??100,
    annDesignMode:f.designMode==='auto'?'auto':'manual',annDesignViewId:f.designViewId||'',annPresetId:f.presetId||'',annFontFamily:f.fontFamily||'',annCardShadow:f.cardShadow||'',
    annMediaPosition:f.mediaPosition||'top',annHiddenElements:(f.hiddenElements||[]).join(','),annLockedElements:(f.lockedElements||[]).join(','),annElementOrder:(f.elementOrder||ORDERABLE_ELEMENTS).join(','),
    annTouched:(f.touched||[]).join(','),annAutoReasonsState:JSON.stringify(f.autoReasons||[]),annFormatLocked:f.formatLocked?'1':''
  };
  /* Old creatives keep their stored type (no silent restyle); new/auto ones follow their content. */
  const inferred=inferCreativeType({headline:f.headline,description:f.description,offer:f.offer,badgeText:f.badgeText,imageUrl:f.imageUrl,videoUrl:f.videoUrl,audioUrl:f.audioUrl,slideshow:f.slideshow});
  values.annTypeLocked=(f.typeLocked||(existing&&existing.__isExisting&&inferred!==type))?'1':'';
  Object.keys(values).forEach(id=>set(id,values[id]));
  const timing=document.querySelectorAll('#announcementFormModal input[name="annTimingMode"]');timing.forEach(r=>r.checked=r.value===(f.timingMode||'auto'));
  const loop=adInput('annVideoLoop'),auto=adInput('annVideoAutoplay');if(loop)loop.checked=f.videoLoop!==false;if(auto)auto.checked=false;
  const ss=f.slideshow||{};adSet('annSlideshowTransition',ss.transition||'fade');adSet('annSlideshowDefaultDuration',ss.defaultDuration||DEFAULT_SLIDE_DURATION_SECONDS);
  const hint=adInput('annPaletteHint');if(hint&&f.paletteId){const p=window.skhPaletteTokens?window.skhPaletteTokens(f.paletteId):null;hint.textContent=p?'Palette: '+p.label:'';}
  const raw=JSON.stringify(creative),stateInput=adInput('annCreativeState');if(stateInput)stateInput.value=raw;window.__skhBasicCreative=creative;window.__skhBasicInitialCreative=JSON.parse(raw);
  window.__skhBasicTextColorTouched=!!existing;window.__skhBasicDescriptionColorTouched=!!existing;
}

window.skhAdInitializeForm=function(){
  window.__skhAdAutoSig='';window.__skhAdDismissed=new Set();
  adSetMode(adValue('annDesignMode')==='manual'?'manual':'auto',false);
  window.skhSetAdBasicType(adValue('annCreativeType')||'image_text',false);
  window.skhSetAdBasicCategory(adValue('annCategory')||'general',false);
  window.skhSetAdBasicFormat(adValue('annMediaAspect')||'16:9',false);
  window.skhCtaChanged(false);adRenderSlideshow();window.skhVideoDurationChanged(false);window.skhTimingModeChanged(false);
  if(typeof window.skhAdUpdateReadouts==='function')window.skhAdUpdateReadouts();
  if(typeof window.skhRenderAdPaletteSelector==='function')window.skhRenderAdPaletteSelector();
  adRenderPresetRow();adRenderLayers();adSyncMediaSlots();
  window.__skhBasicInitialFormValues=adBasicFormValues();
  window.__skhBasicTypeChanged=false;window.__skhBasicFormatChanged=false;window.__skhBasicSlideshowChanged=false;
  window.__skhAdAutoSig=autoDesignSignature(adEngineState(),adMediaInfo());
  window.skhRenderAdminAdPreview();
  const opacity=adInput('annFrameOpacity');if(opacity)window.skhAdOpacityChanged(opacity.value,false);
};

window.skhSetAdBasicType=function(type,rerender=true){
  const allowed=BASIC_AD_TYPES;
  const value=allowed.includes(type)?type:'image_text';
  if(rerender){adSet('annTypeLocked','1');}
  if(rerender&&adValue('annCreativeType')!==value){const initial=window.__skhBasicInitialFormValues;window.__skhBasicTypeChanged=initial?initial.creativeType!==value:true;}adSet('annCreativeType',value);
  document.querySelectorAll('#announcementFormModal [data-basic-type]').forEach(b=>{const on=b.dataset.basicType===value&&adValue('annTypeLocked')==='1';b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  adSyncMediaSlots();
  if(!window.__skhBasicTextColorTouched&&adValue('annDesignMode')!=='auto'){const text=adInput('annTextColor');if(text&&!adValue('annPaletteId'))text.value=value==='solid_text'&&!adValue('annImage')?'#FFFFFF':'#102A43';}
  if(!window.__skhBasicDescriptionColorTouched){const description=adInput('annDescriptionColor'),headline=adInput('annTextColor');if(description&&headline)description.value=headline.value||'#102A43';}
  if(rerender)window.skhRenderAdminAdPreview();
};
window.skhSetAdBasicCategory=function(value,rerender=true){
  const allowed=['product','service','transport','business','general'];const selected=allowed.includes(value)?value:'general';adSet('annCategory',selected);
  document.querySelectorAll('#announcementFormModal [data-basic-category]').forEach(b=>b.classList.toggle('active',b.dataset.basicCategory===selected));
  if(rerender)window.skhRenderAdminAdPreview();
};
window.skhSetAdBasicFormat=function(ratio,rerender=true,fromAuto=false){
  const value=['1:1','4:5','9:16','16:9'].includes(ratio)?ratio:'16:9';
  if(rerender&&!fromAuto)adSet('annFormatLocked','1'); /* user's explicit choice is respected by Auto Design */
  if((rerender||fromAuto)&&adValue('annMediaAspect')!==value){const initial=window.__skhBasicInitialFormValues;window.__skhBasicFormatChanged=initial?initial.format!==value:true;}adSet('annMediaAspect',value);
  document.querySelectorAll('#announcementFormModal [data-basic-format]').forEach(b=>b.classList.toggle('active',b.dataset.basicFormat===value));
  if(rerender)window.skhRenderAdminAdPreview();
};
document.addEventListener('click',function(e){
  const category=e.target.closest&&e.target.closest('[data-basic-category]');if(category){e.preventDefault();window.skhSetAdBasicCategory(category.dataset.basicCategory);return;}
  const type=e.target.closest&&e.target.closest('[data-basic-type]');if(type){e.preventDefault();window.skhSetAdBasicType(type.dataset.basicType);return;}
  const format=e.target.closest&&e.target.closest('[data-basic-format]');if(format){e.preventDefault();window.skhSetAdBasicFormat(format.dataset.basicFormat);return;}
  const slide=e.target.closest&&e.target.closest('[data-slide-action]');if(slide){const i=Number(slide.dataset.slideIndex)||0,action=slide.dataset.slideAction;if(action==='up')window.skhSlideMove(i,-1);else if(action==='down')window.skhSlideMove(i,1);else if(action==='remove')window.skhSlideRemove(i);}
});
window.skhCtaChanged=function(rerender=true){
  const mode=adValue('annCta'),custom=adInput('annCtaCustomWrap'),url=adInput('annCtaUrlWrap');
  const noCta=!mode||mode==='None';
  if(custom)custom.hidden=mode!=='Custom';if(url)url.hidden=noCta;
  if(noCta)adSet('annLink','');
  if(rerender)window.skhRenderAdminAdPreview();
};
window.skhTimingModeChanged=function(rerender=true){
  const mode=document.querySelector('#announcementFormModal input[name="annTimingMode"]:checked')?.value||'auto',input=adInput('annCreativeDuration'),note=adInput('annAutoDurationNote');
  if(input)input.disabled=mode==='auto';if(note)note.textContent=mode==='auto'?'Auto: muda hubadilika kulingana na video/slideshow au content.':'Custom: chagua muda kati ya sekunde '+MIN_AD_DURATION_SECONDS+' na '+MAX_AD_DURATION_SECONDS+'.';
  if(rerender)window.skhRenderAdminAdPreview();
};
window.skhTimingDurationChanged=function(){window.skhRenderAdminAdPreview();};
window.skhSlideshowChanged=function(){const ss=adReadSlideshow();ss.transition=adValue('annSlideshowTransition')||'fade';ss.defaultDuration=adValue('annSlideshowDefaultDuration')===''?DEFAULT_SLIDE_DURATION_SECONDS:Number(adValue('annSlideshowDefaultDuration'));adWriteSlideshow(ss);};
window.skhSlideDurationChanged=function(index,value){const ss=adReadSlideshow();if(!ss.slides[index])return;ss.slides[index].duration=Number(value);adWriteSlideshow(ss);};
window.skhSlideMove=function(index,delta){const ss=adReadSlideshow(),to=index+delta;if(!ss.slides[index]||to<0||to>=ss.slides.length)return;const [item]=ss.slides.splice(index,1);ss.slides.splice(to,0,item);adWriteSlideshow(ss);};
window.skhSlideRemove=function(index){const ss=adReadSlideshow();ss.slides.splice(index,1);adWriteSlideshow(ss);};
window.skhAddSlideshowSlide=function(url,name){if(!url)return;const ss=adReadSlideshow();if(ss.slides.length>=MAX_SLIDESHOW_SLIDES){if(window.skhToast)window.skhToast('Slideshow inaweza kuwa na picha zisizozidi '+MAX_SLIDESHOW_SLIDES+'.','warning');return;}ss.slides.push({src:url,name:name||('Picha '+(ss.slides.length+1)),duration:Number(ss.defaultDuration)||DEFAULT_SLIDE_DURATION_SECONDS});adWriteSlideshow(ss);};
window.skhToggleAdSchedule=function(){const panel=adInput('annSchedulePanel');if(!panel)return;panel.open=!panel.open;if(panel.open)panel.scrollIntoView({behavior:'smooth',block:'nearest'});};
window.skhAdPreviewTransport=function(action){
  const host=adInput('annPreview');if(!host)return;
  const videos=[...host.querySelectorAll('video')],audios=[...host.querySelectorAll('audio')],animations=[...host.querySelectorAll('[style*="animation"]')];
  if(action==='mute'){
    window.__skhBasicPreviewMuted=!window.__skhBasicPreviewMuted;
    [...videos,...audios].forEach(m=>m.muted=!!window.__skhBasicPreviewMuted);
    const b=adInput('annPreviewMute');if(b)b.textContent=window.__skhBasicPreviewMuted?'🔊 Unmute':'🔇 Mute';return;
  }
  if(action==='pause'){
    window.__skhBasicPreviewPaused=true;host.classList.add('adm-ad-preview-paused');[...videos,...audios].forEach(m=>m.pause());
    videos.forEach(v=>{const wrap=v.closest('.skh-ann-video-wrap'),cue=wrap?.querySelector('.skh-ann-video-play');wrap?.classList.remove('is-playing');if(cue)cue.style.display='';});return;
  }
  if(action==='restart'){
    window.__skhBasicPreviewPaused=false;host.classList.remove('adm-ad-preview-paused');
    videos.forEach(v=>{v.muted=!!window.__skhBasicPreviewMuted;const wrap=v.closest('.skh-ann-video-wrap'),cue=wrap?.querySelector('.skh-ann-video-play');wrap?.classList.remove('is-playing');if(cue)cue.style.display='';try{v.pause();v.currentTime=Number(v.dataset.trimStart)||0;}catch(e){}});
    audios.forEach(a=>{try{a.pause();a.currentTime=0;}catch(e){}});
    animations.forEach(el=>{const a=el.style.animation;el.style.animation='none';void el.offsetWidth;el.style.animation=a;});
    return;
  }
  window.__skhBasicPreviewPaused=false;host.classList.remove('adm-ad-preview-paused');
  videos.forEach(video=>{video.muted=!!window.__skhBasicPreviewMuted;const wrap=video.closest('.skh-ann-video-wrap'),cue=wrap?.querySelector('.skh-ann-video-play');wrap?.classList.add('is-playing');if(cue)cue.style.display='none';if(video.currentTime<(Number(video.dataset.trimStart)||0))try{video.currentTime=Number(video.dataset.trimStart)||0;}catch(e){}video.play?.().catch(()=>{});});
  audios.forEach(audio=>{audio.muted=!!window.__skhBasicPreviewMuted;audio.play?.().catch(()=>{});});
  const c=adInput('annPreviewConfirmed');if(c)c.checked=true;
  host.scrollIntoView({behavior:'smooth',block:'nearest'});
};
window.skhProbeVideoDuration=function(url,keepTrim=false){
  const input=adInput('annVideoOriginalDuration'),status=adInput('annVideoDurationStatus');if(!url){if(input)input.value='';window.skhVideoDurationChanged();return;}
  const video=document.createElement('video');video.preload='metadata';video.muted=true;
  if(status)status.textContent='Inasoma video duration…';
  const source=String(url);video.onloadedmetadata=function(){
    if(adValue('annVideo')!==source)return;
    const duration=Number(video.duration);if(!Number.isFinite(duration)||duration<=0)return;
    if(input)input.value=duration.toFixed(1);
    if(!keepTrim){adSet('annVideoTrimStart','0');adSet('annVideoTrimEnd',Math.min(MAX_AD_DURATION_SECONDS,duration).toFixed(1));}
    if(status)status.textContent='Original video: '+duration.toFixed(1)+'s · faili ya original haitabadilishwa.';
    window.skhVideoDurationChanged();
    video.removeAttribute('src');video.load();
  };
  video.onerror=function(){if(status)status.textContent='Duration haikusomeka. Weka muda wa video hapa chini kwa mkono.';};
  video.src=source;
};
window.skhVideoDurationChanged=function(rerender=true){
  const duration=Number(adValue('annVideoOriginalDuration'))||0,trimStart=Number(adValue('annVideoTrimStart'))||0,trimEnd=Number(adValue('annVideoTrimEnd'))||0;
  const panel=adInput('annVideoTrimPanel'),status=adInput('annVideoDurationStatus'),end=adInput('annVideoTrimEnd');
  if(duration>MAX_AD_DURATION_SECONDS){if(panel)panel.hidden=false;if(!trimEnd&&end)end.value=Math.min(MAX_AD_DURATION_SECONDS,duration).toFixed(1);if(status)status.textContent='Original video ni '+duration.toFixed(1)+'s. Chagua sehemu ya mwisho isiyozidi sekunde '+MAX_AD_DURATION_SECONDS+'.';}
  else{if(panel)panel.hidden=true;if(duration>0&&status)status.textContent='Original video: '+duration.toFixed(1)+'s · faili ya original haitabadilishwa.';}
  window.skhVideoTrimChanged(false);
  if(rerender)window.skhRenderAdminAdPreview();
};
window.skhVideoTrimChanged=function(rerender=true){
  const start=Number(adValue('annVideoTrimStart'))||0,end=Number(adValue('annVideoTrimEnd'))||0,duration=Number(adValue('annVideoOriginalDuration'))||0;
  const label=adInput('annVideoTrimLength');if(label){const length=Math.max(0,end-start);label.textContent='Final clip: '+length.toFixed(1)+'s'+(length>MAX_AD_DURATION_SECONDS?' · muda wa mwisho ni '+MAX_AD_DURATION_SECONDS+'s':'');label.classList.toggle('is-error',length>MAX_AD_DURATION_SECONDS||end>duration&&duration>0);}
  if(rerender)window.skhRenderAdminAdPreview();
};
window.skhTrimVideoTo59=function(){
  const duration=Number(adValue('annVideoOriginalDuration'))||MAX_AD_DURATION_SECONDS,start=Math.max(0,Number(adValue('annVideoTrimStart'))||0),actualStart=start>=duration?0:start;
  adSet('annVideoTrimStart',actualStart.toFixed(1));adSet('annVideoTrimEnd',Math.min(duration,actualStart+MAX_AD_DURATION_SECONDS).toFixed(1));window.skhVideoTrimChanged();
};

window.skhPersistBasicCreative=async function(input){
  const creative=input||adCurrentCreative();
  if(!skh.currentUser||!skh.currentUser.uid)throw new Error('Ingia kama admin ili kuhifadhi creative.');
  if(typeof window.skhPersistCreativeDraft!=='function')throw new Error('Creative persistence haijapakiwa.');
  creative.ownerId=creative.ownerId||skh.currentUser.uid;creative.status='DRAFT';creative.updatedAt=new Date().toISOString();
  const saved=await window.skhPersistCreativeDraft(creative);
  adSet('annCreativeId',saved.id);adSet('annCreativeState',JSON.stringify(saved));window.__skhBasicCreative=saved;
  return saved;
};

window.openAnnouncementFormModal=async function(editId){
  if(!((window.SOKOHAI_CLAIMS&&window.SOKOHAI_CLAIMS.isAdmin)||(skh.currentUser&&skh.currentUser.email===skh.MY_ADMIN_EMAIL))){alert('Admin authorization required.');return;}
  window.__editingAnnouncementId=editId||null;window.__skhBasicCreative=null;window.__skhBasicTypeChanged=false;window.__skhBasicFormatChanged=false;window.__skhBasicSlideshowChanged=false;window.__skhBasicTextColorTouched=false;window.__skhBasicDescriptionColorTouched=false;window.__skhBasicPreviewMuted=true;window.__skhBasicPreviewPaused=false;
  const existing=editId?(window.__sokohaiAnnouncementsCache||[]).find(a=>a.id===editId):null;
  let modal=document.getElementById('announcementFormModal');
  if(!modal){modal=document.createElement('div');modal.id='announcementFormModal';modal.className='overlay-menu';modal.style.cssText='z-index:9999;display:none;';document.body.appendChild(modal);}
  modal.innerHTML=window.skhAdFormHtml();modal.style.display='flex';
  const fallback=existing||{};
  const defaults={
    creativeType:adTypeFromLegacy(existing?.creativeType||existing?.layoutStyle,existing),category:existing?.category||'general',
    campaignName:existing?.campaignName||'',campaignId:existing?.campaignId||'',brandName:existing?.brandName||'',headline:existing?.headline||existing?.title||'',description:existing?.description||existing?.text||'',
    descriptionColor:existing?.descriptionColor||existing?.textColor||'#102A43',descriptionSize:existing?.descriptionSize||20,descriptionAlign:existing?.descriptionAlign||existing?.textAlign||'left',
    offer:existing?.offer||existing?.priceTag||'',offerColor:existing?.offerColor||existing?.accentColor||'#167A91',offerTextColor:existing?.offerTextColor||existing?.textColor||'#102A43',offerSize:existing?.offerSize||24,offerAlign:existing?.offerAlign||'left',
    badgeFontSize:existing?.badgeFontSize||14,badgeTextAlign:existing?.badgeTextAlign||'center',
    badgeText:existing?.badgeText||'',badgeColor:existing?.badgeColor||'#F59E0B',badgeTextColor:existing?.badgeTextColor||'#FFFFFF',badgeStyle:existing?.badgeStyle||'pill',badgeAnimation:existing?.badgeAnimation||'none',
    ctaLabel:existing?.ctaLabel||'',ctaStyle:existing?.ctaStyle||'solid',ctaIcon:existing?.ctaIcon||'arrow',ctaAnimation:existing?.ctaAnimation||'none',link:existing?.link||'',
    imageUrl:existing?.image||existing?.imageUrl||'',videoUrl:existing?.videoUrl||'',audioUrl:existing?.audioUrl||'',logoUrl:existing?.logoUrl||'',backgroundImageUrl:existing?.backgroundImageUrl||'',backgroundMode:existing?.backgroundMode||'gradient',
    primaryColor:existing?.primaryColor||'#0E7A5F',accentColor:existing?.accentColor||'#167A91',textColor:existing?.textColor||'#102A43',surfaceColor:existing?.surfaceColor||'#FFFFFF',frameOpacity:existing?.frameOpacity??.42,gradientAngle:existing?.gradientAngle||135,
    fontWeight:existing?.fontWeight||800,fontSize:existing?.fontSize||64,textAlign:existing?.textAlign||'left',textShadow:existing?.textShadow||'none',textAnimation:existing?.textAnimation||'none',animationDuration:existing?.animationDuration||600,
    paletteId:existing?.paletteId||'',format:existing?.aspectRatio||existing?.format||'16:9',slideshow:existing?.slideshow||null,
    designMode:existing?(existing.designMode==='auto'?'auto':'manual'):'auto',designViewId:existing?.designViewId||'',cardShadow:existing?.cardShadow||'',hiddenElements:existing?.hiddenElements||[],
    badgeSize:existing?.badgeSize||'md',badgePosition:existing?.badgePosition||'tr',badgeIcon:existing?.badgeIcon||'none',objectFit:existing?.objectFit||'cover',focalX:existing?.focalX??50,focalY:existing?.focalY??50,
    creativeDuration:existing?.creativeDuration||existing?.mediaDurationSeconds||DISPLAY_DURATION_SECONDS.default,timingMode:existing?.durationAuto===false?'custom':'auto',videoOriginalDuration:existing?.videoOriginalDuration||existing?.mediaDurationSeconds||0,
    videoTrimStart:existing?.videoTrimStart||0,videoTrimEnd:existing?.videoTrimEnd||existing?.mediaDurationSeconds||0,videoLoop:existing?.videoLoop!==false,
    priority:existing?.priority||0,startAt:existing?.startAt||'',endAt:existing?.endAt||'',displayDurationSeconds:existing?.displayDurationSeconds||(existing?.rotationMs?Math.round(existing.rotationMs/1000):DISPLAY_DURATION_SECONDS.default),status:existing?.status||'draft'
  };
  if(existing?.creativeId){
    try{
      const snap=await skh.getDoc(skh.doc(skh.db,'creatives',existing.creativeId));
      if(snap.exists()){
        const model=JSON.parse(JSON.stringify(snap.data()));model.id=snap.id;
        const creative=normalizeCreative(model);creative.id=snap.id;
        adFillFromCreative(creative,{...defaults,...existing,status:existing.status||'draft',__isExisting:true});
      }
    }catch(e){if(window.skhToast)window.skhToast('Creative state haikupakiwa; nimeendelea na data ya advertisement.','warning');}
  }
  if(!window.__skhBasicCreative){
    const creative=buildBasicCreative({...defaults,ownerId:skh.currentUser?.uid||''});
    creative.id=existing?.creativeId||'';
    adFillFromCreative(creative,{...defaults,...existing,status:existing?.status||'draft',__isExisting:!!existing});
  }
  adSet('annFormTitle',existing?'Hariri Tangazo':'Tengeneza Tangazo');
  const title=adInput('annFormTitle');if(title)title.textContent=existing?'Hariri Tangazo':'Tengeneza Tangazo';
  adSet('annStartAt',adLocalDate(existing?.startAt));adSet('annEndAt',adLocalDate(existing?.endAt));
  adSet('annStatus',existing?.status||'draft');
  if(typeof window.skhRenderAdPaletteSelector==='function')window.skhRenderAdPaletteSelector();
  window.__skhAdInitialised=false;window.__skhAdOpenSlots=new Set();window.__skhAdPreviewPlacement='home';window.__skhAdPreviewDevice='mobile';
  window.skhAdInitializeForm();
  /* New ads start in Easy/Auto: design is generated AFTER the baseline so it is persisted. */
  if(!existing&&adValue('annDesignMode')==='auto')window.skhAdRunAutoDesign(false);
  else adRenderReasons(adJson('annAutoReasonsState',[]));
  window.__skhAdInitialised=true;
  window.__skhBasicPreviewMuted=true;
  if(adValue('annVideo'))window.skhProbeVideoDuration(adValue('annVideo'),true);
};

window.skhAdFormData=function(){
  const creative=adCurrentCreative();
  const display=Number(creative.displayDurationSeconds)||DISPLAY_DURATION_SECONDS.default;
  return creativeToAdvertisement(creative,{
    status:adValue('annStatus')||'draft',
    active:adValue('annStatus')==='published',
    archived:false,
    rotationMs:display*1000,
    aspectRatio:creative.format==='portrait'?'4:5':creative.format==='story'?'9:16':creative.format==='square'||creative.format==='feed'?'1:1':'16:9'
  });
};

window.skhRenderAdminAdPreview=function(){
  const host=adInput('annPreview');if(!host)return;
  if(!window.__skhBasicTextColorTouched&&adValue('annCreativeType')==='solid_text'){
    const textColor=adInput('annTextColor'),fallback=adValue('annImage')?'#102A43':'#FFFFFF';
    if(textColor)textColor.value=fallback;
    if(!window.__skhBasicDescriptionColorTouched){const description=adInput('annDescriptionColor');if(description)description.value=fallback;}
  }
  adSyncResolvedType();
  const a=window.skhAdFormData();
  a.placementVariant=window.__skhAdPreviewPlacement||'home';
  const creative=window.__skhBasicCreative;
  const contrastHint=adInput('annContrastHint');
  const textOnlyCard=!(a.imageUrl||a.videoUrl||(a.slideshow&&a.slideshow.slides&&a.slideshow.slides.length>1));
  if(contrastHint){const ratio=skhPaletteContrast(a.textColor||'#102A43',textOnlyCard?(a.primaryColor||'#0E7A5F'):(a.surfaceColor||'#FFFFFF'));contrastHint.className='adm-ad-contrast '+(ratio>=4.5?'good':'warn');contrastHint.textContent=(ratio>=4.5?'✓':'⚠')+' Text contrast '+ratio.toFixed(1)+':1';}
  const hasMedia=!!(a.imageUrl||a.videoUrl||a.audioUrl||a.slideshow?.slides?.length>0);
  host.className='adm-ad-preview skh-home-ad skh-ann-story skh-ann-post '+(hasMedia?'has-media':'no-media');
  if(typeof window.skhAdvertisementCardHtml==='function')host.innerHTML=window.skhAdvertisementCardHtml(a,false);
  else host.innerHTML='<div class="adm-ad-preview-fallback">Preview ya tangazo</div>';
  if(typeof window.skhBindAdvertisementVideoControls==='function')window.skhBindAdvertisementVideoControls(host);
  [...host.querySelectorAll('video,audio')].forEach(media=>media.muted=!!window.__skhBasicPreviewMuted);
  const muteButton=adInput('annPreviewMute');if(muteButton)muteButton.textContent=window.__skhBasicPreviewMuted?'🔊 Unmute':'🔇 Mute';
  const confirmed=adInput('annPreviewConfirmed');if(confirmed)confirmed.checked=false;
  const duration=creative?.duration||a.creativeDuration||DISPLAY_DURATION_SECONDS.default,readout=adInput('annCreativeDurationReadout'),previewDuration=adInput('annPreviewDuration');
  if(readout)readout.textContent=duration+'s';if(previewDuration)previewDuration.textContent=duration+'s';
  const mediaReadout=adInput('annMediaDurationReadout');if(mediaReadout)mediaReadout.textContent=a.slideshow?.slides?.length?' · Slideshow '+(a.mediaDurationSeconds||0)+'s':a.videoUrl?' · Video '+(a.mediaDurationSeconds||0)+'s':'';
  const slideTiming=adInput('annPreviewSlideTiming');if(slideTiming&&a.slideshow?.slides?.length>1)slideTiming.textContent='Slideshow · '+(a.mediaDurationSeconds||0)+'s';
  host.classList.toggle('adm-ad-preview-paused',!!window.__skhBasicPreviewPaused);
  adAfterRender();
};
window.skhAdOpacityChanged=function(value,rerender=true){const n=Math.max(8,Math.min(100,Number(value)||42)),label=adInput('annFrameOpacityValue');if(label)label.textContent=n+'%';if(rerender)window.skhRenderAdminAdPreview();};

/* ==========================================================================
   [AD DESIGNER 2026-09-24] ONE Advertisement Designer controller.
   Easy/Auto and Customize are MODES of this editor over the SAME canonical
   creative (buildBasicCreative → normalizeCreative) and the SAME renderer
   (skhAdvertisementCardHtml). Design logic lives in ad-design-engine.js.
   ========================================================================== */
const AD_FIELD_IDS=Object.freeze({
  paletteId:'annPaletteId',designViewId:'annDesignViewId',presetId:'annPresetId',backgroundMode:'annBackgroundMode',gradientAngle:'annGradientAngle',
  primaryColor:'annPrimaryColor',accentColor:'annAccentColor',surfaceColor:'annSurfaceColor',textColor:'annTextColor',descriptionColor:'annDescriptionColor',
  offerColor:'annOfferColor',offerTextColor:'annOfferTextColor',badgeColor:'annBadgeColor',badgeTextColor:'annBadgeTextColor',frameOpacity:'annFrameOpacity',
  borderRadius:'annBorderRadius',cardShadow:'annCardShadow',fontFamily:'annFontFamily',fontWeight:'annFontWeight',fontSize:'annHeadlineSize',textAlign:'annTextAlign',
  headlineLetterSpacing:'annHeadlineLetterSpacing',headlineLineHeight:'annHeadlineLineHeight',textShadow:'annTextShadow',descriptionSize:'annDescriptionSize',
  descriptionAlign:'annDescriptionAlign',offerSize:'annOfferSize',offerAlign:'annOfferAlign',badgeStyle:'annBadgeStyle',badgePosition:'annBadgePosition',
  badgeSize:'annBadgeSize',badgeFontSize:'annBadgeFontSize',badgeIcon:'annBadgeIcon',badgeOpacity:'annBadgeOpacity',ctaStyle:'annCtaStyle',ctaIcon:'annCtaIcon',ctaAlign:'annCtaAlign',
  ctaAnimation:'annCtaAnimation',badgeAnimation:'annBadgeAnimation',textAnimation:'annTextAnimation',textEmphasis:'annTextEmphasis',animationMode:'annAnimationMode',
  animationDuration:'annAnimationDuration',mediaFit:'annMediaFit',focalX:'annFocalX',focalY:'annFocalY',overlayOpacity:'annOverlayOpacity',brightness:'annBrightness',
  contrast:'annContrast',saturation:'annSaturation',mediaPosition:'annMediaPosition'
});
const AD_PERCENT_KEYS=Object.freeze({frameOpacity:1,overlayOpacity:1,badgeOpacity:1});
const AD_ID_TO_FIELD=Object.freeze(Object.keys(AD_FIELD_IDS).reduce((m,k)=>{m[AD_FIELD_IDS[k]]=k;return m;},{annMediaAspect:'format'}));
const AD_TYPE_LABELS=Object.freeze({image_text:'Image + Text',image:'Image Only',solid_text:'Text / Graphic',video:'Video',video_text:'Video + Text',image_audio:'Image + Audio',slideshow:'Slideshow',full_multimedia:'Full Multimedia',image_video:'Image + Video',video_audio:'Video + Audio',audio:'Audio + Background'});
const AD_LAYER_LABELS=Object.freeze({brand:'Brand header',badge:'Badge',media:'Media',headline:'Headline',description:'Description',offer:'Offer / Price',cta:'CTA button'});
const AD_LAYER_EDIT=Object.freeze({brand:['content','annBrand'],badge:['text','annBadgeFontSize'],media:['media','annMediaFit'],headline:['text','annHeadlineSize'],description:['text','annDescriptionSize'],offer:['text','annOfferSize'],cta:['cta','annCtaStyle']});
const adEsc=v=>(skh&&typeof skh.skhEscape==='function')?skh.skhEscape(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(!window.__skhAdMediaInfo)window.__skhAdMediaInfo={};

function adModal(){return document.getElementById('announcementFormModal');}
function adContentState(){
  const mode=adValue('annCta'),cta=mode==='Custom'?adValue('annCtaCustom'):(mode==='None'?'':mode);
  return{headline:adValue('annHeadline'),description:adValue('annText'),offer:adValue('annPriceTag'),badgeText:adValue('annBadgeText'),imageUrl:adValue('annImage'),videoUrl:adValue('annVideo'),audioUrl:adValue('annAudio'),logoUrl:adValue('annLogo'),backgroundImageUrl:adValue('annBackgroundImage'),slideshow:adReadSlideshow(),link:adValue('annLink'),ctaLabel:cta,category:adValue('annCategory')||'general'};
}
function adResolvedType(){
  if(adValue('annTypeLocked')==='1'){const v=adValue('annCreativeType');if(BASIC_AD_TYPES.includes(v))return v;}
  return inferCreativeType(adContentState());
}
function adSyncResolvedType(){
  const locked=adValue('annTypeLocked')==='1',type=adResolvedType();
  if(!locked&&adValue('annCreativeType')!==type){adSet('annCreativeType',type);const initial=window.__skhBasicInitialFormValues;window.__skhBasicTypeChanged=initial?initial.creativeType!==type:true;}
  const label=(locked?'🔒 ':'Auto · ')+(AD_TYPE_LABELS[type]||type);
  const r=adInput('annTypeReadout');if(r)r.textContent=label;
  const mini=adInput('annTypeReadoutMini');if(mini)mini.textContent=label;
  const unlock=adInput('annTypeUnlock');if(unlock)unlock.hidden=!locked;
  document.querySelectorAll('#announcementFormModal [data-basic-type]').forEach(b=>{const on=locked&&b.dataset.basicType===type;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  return type;
}
window.skhAdUnlockType=function(){adSet('annTypeLocked','');window.skhRenderAdminAdPreview();};
function adMediaInfo(){
  const c=adContentState(),info=window.__skhAdMediaInfo||{};
  const firstSlide=c.slideshow&&c.slideshow.slides&&c.slideshow.slides[0]&&c.slideshow.slides[0].src;
  const imgUrl=c.imageUrl||firstSlide||'';
  if(imgUrl&&!info[imgUrl])adMeasureMedia(imgUrl,'image');
  if(c.videoUrl&&!info[c.videoUrl])adMeasureMedia(c.videoUrl,'video');
  return{imageAspect:imgUrl&&info[imgUrl]>0?info[imgUrl]:0,videoAspect:c.videoUrl&&info[c.videoUrl]>0?info[c.videoUrl]:0,placement:window.__skhAdPreviewPlacement||'home',device:window.__skhAdPreviewDevice||'mobile'};
}
function adMeasureMedia(url,kind){
  const info=window.__skhAdMediaInfo;if(!url||info[url])return;info[url]=-1; // pending; lazy, once per URL
  try{
    if(kind==='video'){const v=document.createElement('video');v.preload='metadata';v.muted=true;v.onloadedmetadata=()=>{if(v.videoWidth&&v.videoHeight){info[url]=v.videoWidth/v.videoHeight;adScheduleDesigner(true);}};v.src=url;}
    else{const img=new Image();img.decoding='async';img.onload=()=>{if(img.naturalWidth&&img.naturalHeight){info[url]=img.naturalWidth/img.naturalHeight;adScheduleDesigner(true);}};img.src=url;}
  }catch(e){}
}
function adEngineState(forAuto){
  const f=adBasicFormValues(),touched=new Set(f.touched);
  const s={...f,slideshowTransition:adValue('annSlideshowTransition')||'fade'};
  if(forAuto&&!touched.has('designViewId')){s.designViewId='';s.paletteId='';}
  return s;
}
function adSetMode(mode,run=true){
  const m=mode==='manual'?'manual':'auto';adSet('annDesignMode',m);
  const root=document.querySelector('#announcementFormModal .adm-ad-designer');if(root)root.dataset.designMode=m;
  document.querySelectorAll('#announcementFormModal .adm-ad-mode-switch [data-design-mode-btn]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.designModeBtn===m)));
  const status=adInput('annAutoStatus');
  if(status&&m==='manual')status.textContent='Customize: mabadiliko yako yanalindwa. Bonyeza Auto Design kupanga upya (edits zako zinabaki).';
  if(run&&m==='auto')window.skhAdRunAutoDesign(true);
}
window.skhAdSetDesignMode=function(mode){
  adSetMode(mode,true);
  if(mode==='manual'){const text=document.querySelector('#announcementFormModal [data-basic-step="text"]');if(text&&text.tagName==='DETAILS')text.open=true;}
  window.skhRenderAdminAdPreview();
};
function adApplyPatch(patch){
  Object.keys(patch||{}).forEach(key=>{
    const v=patch[key];
    if(key==='format'){window.skhSetAdBasicFormat(v,false,true);return;}
    if(key==='slideshowTransition'){adSet('annSlideshowTransition',v);const ss=adReadSlideshow();if(ss.slides&&ss.slides.length){ss.transition=v;adWriteSlideshow(ss,false);}return;}
    if(key==='cta'){adSet('annCta',v);window.skhCtaChanged(false);return;}
    if(key==='badgeText'){adSet('annBadgeText',v);return;}
    const id=AD_FIELD_IDS[key];if(!id)return;
    const el=adInput(id);if(!el)return;
    const val=String(AD_PERCENT_KEYS[key]?Math.round(Number(v)*100):v);
    if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===val)){const o=document.createElement('option');o.value=val;o.textContent=val;el.appendChild(o);}
    el.value=val;
  });
  if(patch&&('textColor' in patch||'paletteId' in patch)){window.__skhBasicTextColorTouched=true;window.__skhBasicDescriptionColorTouched=true;}
  const pal=adValue('annPaletteId'),view=adValue('annDesignViewId');
  document.querySelectorAll('#announcementFormModal [data-ad-preset]').forEach(b=>{const on=b.dataset.adPreset===view||(!view.startsWith('preset:')&&b.dataset.adPreset===pal);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  document.querySelectorAll('#announcementFormModal [data-design-view]').forEach(b=>{const on=b.dataset.designView===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  window.skhAdUpdateReadouts();window.skhAdOpacityChanged(adValue('annFrameOpacity'),false);
}
function adRenderReasons(reasons){
  const list=adInput('annAutoReasons');if(list)list.innerHTML=(reasons||[]).map(r=>'<li>'+adEsc(r)+'</li>').join('')||'<li>Bado — ongeza content au bonyeza Auto Design.</li>';
}
window.skhAdRunAutoDesign=function(force=false){
  const state=adEngineState(true),media=adMediaInfo();
  const res=autoDesign(state,{media,keep:adList('annTouched'),locked:adList('annLockedElements'),formatLocked:adValue('annFormatLocked')==='1'});
  window.__skhAdAutoSig=autoDesignSignature(adEngineState(true),media);
  adApplyPatch(res.patch);
  adSet('annAutoReasonsState',JSON.stringify(res.reasons.slice(0,12)));
  adRenderReasons(res.reasons);
  const status=adInput('annAutoStatus'),view=getDesignView(res.viewId);
  if(status)status.textContent='Imepangwa · '+(view?view.label:'')+' · '+(AD_TYPE_LABELS[res.creativeType]||res.creativeType)+(res.kept.length?' · edits '+res.kept.length+' zimehifadhiwa':'');
  window.__skhAdAutoSig=autoDesignSignature(adEngineState(true),media);
  window.skhRenderAdminAdPreview();
  if(force===true&&window.skhToast&&window.__skhAdInitialised)window.skhToast('Auto Design imetumika — content yako haijaguswa.','success');
  return res;
};
window.skhAdResetManualEdits=function(){adSet('annTouched','');adSet('annFormatLocked','');adSetMode('auto',false);window.skhAdRunAutoDesign(true);};
let adDesignerTimer=null;
function adScheduleDesigner(mediaMeasured){
  clearTimeout(adDesignerTimer);
  adDesignerTimer=setTimeout(()=>{
    if(!adModal()||!adInput('annPreview'))return;
    if(adValue('annDesignMode')==='auto'){
      const sig=autoDesignSignature(adEngineState(true),adMediaInfo());
      if(sig!==window.__skhAdAutoSig){window.skhAdRunAutoDesign(false);return;}
    }
    adRefreshSuggestions();
  },mediaMeasured?60:260);
}
function adRefreshSuggestions(){
  const box=adInput('annSuggestions');if(!box)return;
  const list=recommendDesign(adEngineState(false),{media:adMediaInfo(),dismissed:[...(window.__skhAdDismissed||new Set())]});
  window.__skhAdSuggestions=list;
  box.innerHTML=list.length?list.map(item=>'<article class="adm-ad-suggest-item level-'+adEsc(item.level)+'"><div><b>'+(item.level==='warning'?'⚠ ':'💡 ')+adEsc(item.title)+'</b><p>'+adEsc(item.detail)+'</p></div><div class="adm-ad-suggest-actions">'+(item.patch?'<button type="button" class="adm-ad-btn primary" data-suggest-apply="'+adEsc(item.id)+'">Apply</button>':'')+'<button type="button" class="adm-ad-btn" data-suggest-keep="'+adEsc(item.id)+'">Keep current</button></div></article>').join(''):'<p class="adm-ad-suggest-empty">✓ Hakuna pendekezo kwa sasa.</p>';
  const count=adInput('annSuggestCount');if(count)count.textContent=String(list.length);
}
window.skhAdApplySuggestion=function(id){
  const item=(window.__skhAdSuggestions||[]).find(x=>x.id===id);if(!item||!item.patch)return;
  (window.__skhAdDismissed=window.__skhAdDismissed||new Set()).add(id);
  if(item.patch.__applyView){window.skhAdApplyView(item.patch.__applyView);return;}
  adApplyPatch(item.patch);
  const touched=new Set(adList('annTouched'));Object.keys(item.patch).filter(k=>STYLE_KEYS.includes(k)).forEach(k=>touched.add(k));adSet('annTouched',[...touched].join(','));
  window.skhRenderAdminAdPreview();
};
window.skhAdKeepSuggestion=function(id){(window.__skhAdDismissed=window.__skhAdDismissed||new Set()).add(id);adRefreshSuggestions();};
window.skhAdApplyView=function(viewId){
  const res=applyDesignView(viewId,adEngineState(false),{media:adMediaInfo(),locked:adList('annLockedElements')});
  if(!res.view)return false;
  adApplyPatch(res.patch);
  const touched=new Set(adList('annTouched'));Object.keys(res.patch).forEach(k=>touched.delete(k));touched.add('designViewId');adSet('annTouched',[...touched].join(','));
  const hint=adInput('annPaletteHint');
  if(hint){const tok=res.view.tokens.colors;try{const text=adValue('annTextColor'),bgc=(adValue('annImage')||adValue('annVideo'))?tok.surface:tok.primary;hint.textContent='Design View: '+res.view.label+' · '+res.view.recipe+' · kichwa '+skhPaletteContrast(text,bgc).toFixed(1)+':1 · CTA '+skhPaletteContrast(tok.ctaText,tok.cta).toFixed(1)+':1';}catch(e){hint.textContent='Design View: '+res.view.label;}}
  window.skhRenderAdminAdPreview();
  return true;
};
function adRenderPresetRow(){
  const row=adInput('annPresetRow');if(!row)return;
  const cur=adValue('annDesignViewId');
  row.innerHTML=DESIGN_PRESETS.map(p=>{const v=getDesignView('preset:'+p.id);if(!v)return '';const c=v.tokens.colors;return '<button type="button" class="adm-ad-preset-chip'+(cur===v.id?' active':'')+'" data-design-view="'+v.id+'" aria-pressed="'+(cur===v.id)+'" style="--pal-a:'+c.primary+';--pal-b:'+c.accent+'"><i aria-hidden="true"></i>'+adEsc(p.label)+'</button>';}).join('');
  const count=adInput('annViewCount');if(count)count.textContent='('+listDesignViews().length+')';
}
function adOrder(){const o=adList('annElementOrder').filter(x=>ORDERABLE_ELEMENTS.includes(x));ORDERABLE_ELEMENTS.forEach(x=>{if(!o.includes(x))o.push(x);});return o;}
function adRenderLayers(){
  const list=adInput('annLayersList');if(!list)return;
  const hidden=new Set(adList('annHiddenElements')),locked=new Set(adList('annLockedElements')),order=adOrder(),c=adContentState();
  const present={brand:true,badge:!!c.badgeText,media:!!(c.imageUrl||c.videoUrl||c.audioUrl||(c.slideshow.slides||[]).length),headline:!!c.headline,description:!!c.description,offer:!!c.offer,cta:!!c.ctaLabel};
  const seq=['brand','badge'].concat(order);
  list.innerHTML=seq.map(el=>{
    const idx=order.indexOf(el),orderable=idx>=0,isHidden=hidden.has(el),isLocked=locked.has(el),name=AD_LAYER_LABELS[el];
    return '<li class="adm-ad-layer'+(isHidden?' is-hidden':'')+(present[el]?'':' is-empty')+'"><span class="adm-ad-layer-name">'+name+(present[el]?'':' <small>(tupu)</small>')+'</span><span class="adm-ad-layer-actions">'
      +'<button type="button" data-layer="'+el+'" data-layer-action="toggle" aria-pressed="'+(!isHidden)+'" aria-label="'+(isHidden?'Onyesha ':'Ficha ')+name+'">'+(isHidden?'🚫':'👁')+'</button>'
      +'<button type="button" data-layer="'+el+'" data-layer-action="lock" aria-pressed="'+isLocked+'" aria-label="'+(isLocked?'Fungua ':'Funga ')+name+'">'+(isLocked?'🔒':'🔓')+'</button>'
      +(orderable?'<button type="button" data-layer="'+el+'" data-layer-action="up" aria-label="Sogeza '+name+' juu"'+(idx===0?' disabled':'')+'>↑</button><button type="button" data-layer="'+el+'" data-layer-action="down" aria-label="Sogeza '+name+' chini"'+(idx===order.length-1?' disabled':'')+'>↓</button>':'')
      +'<button type="button" data-layer="'+el+'" data-layer-action="edit" aria-label="Badilisha ukubwa/mtindo wa '+name+'">⤢</button></span></li>';
  }).join('');
}
window.skhAdLayerAction=function(el,action){
  if(!LAYER_ELEMENTS.includes(el))return;
  if(action==='toggle'||action==='lock'){
    const id=action==='toggle'?'annHiddenElements':'annLockedElements',set=new Set(adList(id));
    if(set.has(el))set.delete(el);else set.add(el);adSet(id,[...set].join(','));
  }else if(action==='up'||action==='down'){
    const order=adOrder(),i=order.indexOf(el),j=i+(action==='up'?-1:1);
    if(i<0||j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];
    adSet('annElementOrder',order.join(','));adSet('annMediaPosition',order[0]==='media'?'top':'bottom');
  }else if(action==='edit'){
    const [step,control]=AD_LAYER_EDIT[el]||[];if(step!=='content')adSetMode('manual',false);
    const section=document.querySelector('#announcementFormModal [data-basic-step="'+step+'"]');if(section&&section.tagName==='DETAILS')section.open=true;
    window.skhAdToggleProperties(false);
    const target=adInput(control);if(target){if(target.scrollIntoView)target.scrollIntoView({block:'center',behavior:'smooth'});try{target.focus({preventScroll:true});}catch(e){}}
    return;
  }
  adRenderLayers();window.skhRenderAdminAdPreview();
};
function adSyncMediaSlots(){
  const c=adContentState(),open=window.__skhAdOpenSlots||(window.__skhAdOpenSlots=new Set());
  const has={image:!!c.imageUrl,video:!!c.videoUrl,audio:!!c.audioUrl,logo:!!c.logoUrl,slideshow:(c.slideshow.slides||[]).length>0};
  document.querySelectorAll('#announcementFormModal [data-media-kind]').forEach(slot=>{const k=slot.dataset.mediaKind;slot.hidden=!(has[k]||open.has(k));});
  const transform=adInput('annMediaTransform');if(transform)transform.hidden=!(has.image||has.video||(c.slideshow.slides||[]).length>1);
  const tw=adInput('annSlideshowTransitionWrap');if(tw)tw.hidden=(c.slideshow.slides||[]).length<2;
  const empty=adInput('annEmptyState');if(empty)empty.hidden=!!(c.headline||c.description||c.offer||c.badgeText||adValue('annBrand')||has.image||has.video||has.audio||has.logo||has.slideshow);
}
window.skhAdAddMedia=function(kind){
  (window.__skhAdOpenSlots=window.__skhAdOpenSlots||new Set()).add(kind);adSyncMediaSlots();
  const picker={image:'annImageFile',video:'annVideoFile',audio:'annAudioFile',logo:'annLogoFile',slideshow:'annSlideshowFiles'}[kind];
  const slot=document.querySelector('#announcementFormModal [data-media-kind="'+kind+'"]');if(slot&&slot.scrollIntoView)slot.scrollIntoView({block:'nearest',behavior:'smooth'});
  const input=adInput(picker);if(input&&typeof input.click==='function')input.click(); // native picker = mobile-friendly
};
window.skhAdRemoveMedia=function(kind){
  const ids={image:['annImage'],video:['annVideo','annVideoOriginalDuration'],audio:['annAudio'],logo:['annLogo']}[kind]||[];
  ids.forEach(id=>adSet(id,''));
  if(kind==='video'){adSet('annVideoTrimStart',0);adSet('annVideoTrimEnd','');window.skhVideoDurationChanged(false);}
  if(window.__skhAdOpenSlots)window.__skhAdOpenSlots.delete(kind);
  window.skhRenderAdminAdPreview();
};
window.skhAdHandleMediaFiles=function(fileList){
  const files=Array.from(fileList||[]);if(!files.length)return;
  const rules=window.SokoHaiAdsDesignRules,kindOf=f=>rules&&rules.detectAdMediaKind?rules.detectAdMediaKind(f):(String(f.type).split('/')[0]||'');
  const images=files.filter(f=>kindOf(f)==='image'),videos=files.filter(f=>kindOf(f)==='video'),audios=files.filter(f=>kindOf(f)==='audio');
  const stub=(list,target)=>({files:list,dataset:target?{target}:{},disabled:false,value:''});
  const jobs=[];
  if(images.length>1||(images.length&&(adValue('annImage')||adReadSlideshow().slides.length))){
    const ss=adReadSlideshow();
    if(!ss.slides.length&&adValue('annImage')){ss.slides.push({src:adValue('annImage'),name:'Picha 1',duration:DEFAULT_SLIDE_DURATION_SECONDS});adWriteSlideshow(ss,false);adSet('annImage','');}
    jobs.push(()=>window.skhAdminAdUpload('image',stub(images,'annSlideshow')));
  }else if(images.length)jobs.push(()=>window.skhAdminAdUpload('image',stub(images)));
  if(videos.length)jobs.push(()=>window.skhAdminAdUpload('video',stub(videos.slice(0,1))));
  if(audios.length)jobs.push(()=>window.skhAdminAdUpload('audio',stub(audios.slice(0,1))));
  if(!jobs.length){alert('Aina ya faili haitambuliki. Tumia picha, video au sauti.');return;}
  jobs.reduce((p,job)=>p.then(job),Promise.resolve());
};
function adBindDropzone(){
  const zone=adInput('annMediaDrop');if(!zone||zone.dataset.bound==='1')return;zone.dataset.bound='1';
  ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('is-drag');}));
  ['dragleave','dragend'].forEach(ev=>zone.addEventListener(ev,()=>zone.classList.remove('is-drag')));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('is-drag');window.skhAdHandleMediaFiles(e.dataTransfer&&e.dataTransfer.files);});
  zone.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===zone){e.preventDefault();adInput('annDropFiles')?.click();}});
}
window.skhAdEmptyAction=function(kind){
  if(kind==='auto'){adSetMode('auto',false);window.skhAdRunAutoDesign(true);return;}
  const step=kind==='media'?'media':'content',section=document.querySelector('#announcementFormModal [data-basic-step="'+step+'"]');
  if(section&&section.tagName==='DETAILS')section.open=true;
  const target=adInput(kind==='media'?'annMediaDrop':'annHeadline');
  if(target){if(target.scrollIntoView)target.scrollIntoView({block:'center',behavior:'smooth'});try{target.focus({preventScroll:true});}catch(e){}}
};
window.skhAdSetPreviewDevice=function(device){
  window.__skhAdPreviewDevice=device==='desktop'?'desktop':'mobile';
  const frame=adInput('annDeviceFrame');if(frame){frame.classList.toggle('is-mobile',window.__skhAdPreviewDevice==='mobile');frame.classList.toggle('is-desktop',window.__skhAdPreviewDevice==='desktop');}
  document.querySelectorAll('#announcementFormModal [data-preview-device]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.previewDevice===window.__skhAdPreviewDevice)));
};
window.skhAdSetPreviewPlacement=function(p){window.__skhAdPreviewPlacement=p||'home';const s=adInput('annPreviewPlacement');if(s&&s.value!==window.__skhAdPreviewPlacement)s.value=window.__skhAdPreviewPlacement;window.skhRenderAdminAdPreview();};
window.skhAdToggleProperties=function(force){const panel=adInput('annPropertiesPanel');if(!panel)return;const open=typeof force==='boolean'?force:!panel.classList.contains('is-open');panel.classList.toggle('is-open',open);document.querySelector('#announcementFormModal .adm-ad-props-trigger')?.setAttribute('aria-expanded',String(open));};
function adAfterRender(){adSyncMediaSlots();adRenderLayers();adBindDropzone();adScheduleDesigner(false);}

/* Touched = style fields the user changed by hand; Auto Design keeps them. */
function adTrackTouched(e){
  const el=e.target;if(!el||!el.id||!el.closest||!el.closest('#announcementFormModal'))return;
  const key=AD_ID_TO_FIELD[el.id];if(!key||key==='designViewId'||key==='paletteId')return;
  const touched=new Set(adList('annTouched'));if(!touched.has(key)){touched.add(key);adSet('annTouched',[...touched].join(','));}
  if(el.type==='range'){const out=adInput(el.id+'Out');if(out)out.textContent=el.value+(el.dataset.unit||'');}
}
document.addEventListener('input',adTrackTouched,true);
document.addEventListener('change',adTrackTouched,true);
document.addEventListener('click',function(e){
  const t=e.target&&e.target.closest?e.target:null;if(!t||!t.closest('#announcementFormModal'))return;
  const mode=t.closest('[data-design-mode-btn]');if(mode){e.preventDefault();window.skhAdSetDesignMode(mode.dataset.designModeBtn);return;}
  const view=t.closest('[data-design-view]');if(view){e.preventDefault();window.skhAdApplyView(view.dataset.designView);return;}
  const apply=t.closest('[data-suggest-apply]');if(apply){e.preventDefault();window.skhAdApplySuggestion(apply.dataset.suggestApply);return;}
  const keep=t.closest('[data-suggest-keep]');if(keep){e.preventDefault();window.skhAdKeepSuggestion(keep.dataset.suggestKeep);return;}
  const layer=t.closest('[data-layer-action]');if(layer){e.preventDefault();window.skhAdLayerAction(layer.dataset.layer,layer.dataset.layerAction);return;}
  const add=t.closest('[data-add-media]');if(add){e.preventDefault();window.skhAdAddMedia(add.dataset.addMedia);return;}
  const dev=t.closest('[data-preview-device]');if(dev){e.preventDefault();window.skhAdSetPreviewDevice(dev.dataset.previewDevice);return;}
  const jump=t.closest('[data-jump]');if(jump){
    e.preventDefault();const key=jump.dataset.jump;
    if(key==='layers')window.skhAdToggleProperties(true);
    if(key==='preview')window.skhToggleMobileAdPreview(true);
    const sec=document.querySelector('#announcementFormModal [data-basic-step="'+key+'"]');
    if(sec){if(sec.tagName==='DETAILS')sec.open=true;if(sec.scrollIntoView)sec.scrollIntoView({block:'start',behavior:'smooth'});}
  }
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&adInput('annPropertiesPanel')?.classList.contains('is-open')){window.skhAdToggleProperties(false);}});

/* Renders the grouped Design Palette selector into #annPaletteGrid.
   Uses the ONE canonical token system (window.SKH_AD_PALETTES / SKH_AD_PALETTE_GROUPS).
   Chips keep the existing data-ad-preset contract — the global delegation handler is unchanged. */
window.skhRenderAdPaletteSelector=function(){
  const grid=document.getElementById('annPaletteGrid');if(!grid)return;
  const groups=(window.SKH_AD_PALETTE_GROUPS&&window.SKH_AD_PALETTE_GROUPS.length)?window.SKH_AD_PALETTE_GROUPS:null;
  const pals=window.SKH_AD_PALETTES?Object.values(window.SKH_AD_PALETTES):null;
  const cur=document.getElementById('annPaletteId')?.value||'';
  if(!groups||!pals){
    // Legacy fallback: the original 8 chips, unchanged
    grid.innerHTML='<button type="button" data-ad-preset="emerald" class="palette-chip">Emerald</button><button type="button" data-ad-preset="ocean" class="palette-chip">Ocean</button><button type="button" data-ad-preset="royal" class="palette-chip">Royal</button><button type="button" data-ad-preset="sunset" class="palette-chip">Sunset</button><button type="button" data-ad-preset="mono" class="palette-chip">Mono</button><button type="button" data-ad-preset="gold" class="palette-chip">Gold Luxury</button><button type="button" data-ad-preset="rose" class="palette-chip">Rose</button><button type="button" data-ad-preset="neon" class="palette-chip">Neon</button>';
    return;
  }
  const chip=p=>'<button type="button" data-ad-preset="'+p.id+'" class="palette-chip'+(cur===p.id?' active':'')+'" title="'+p.label+'" style="--pal-a:'+p.primary+';--pal-b:'+p.secondary+'"><i></i>'+p.label+'</button>';
  grid.innerHTML=groups.map(g=>{
    const items=pals.filter(p=>(p.group||'classics')===g.id);
    if(!items.length)return '';
    return '<div class="adm-ad-pal-group">'+g.label+'</div>'+items.map(chip).join('');
  }).join('');
};

window.skhAdApplyPreset=function(name){
  // CANONICAL SOURCE: js/app/creative/ad-palettes.js (window.skhPaletteTokens).
  // [AD DESIGNER] Every palette chip is a complete Design View (tokens + recipe),
  // applied media-aware (text colour chosen by real contrast on its background).
  const tok=(window.skhPaletteTokens&&window.skhPaletteTokens(name))||null;
  if(tok&&getDesignView(name)){window.skhAdApplyView(name);return;}
  // Fallback table keeps the pre-upgrade behavior if the tokens file was not loaded.
  const legacy={emerald:['#0E7A5F','#18A982','#FFFFFF','#FFFFFF',42],ocean:['#075E73','#2697B8','#FFFFFF','#FFFFFF',48],royal:['#343A8F','#7559C7','#FFFFFF','#FFFFFF',50],sunset:['#A83E27','#E49A36','#FFFFFF','#FFFDFC',55],mono:['#1F2937','#6B7280','#FFFFFF','#FFFFFF',36],gold:['#1E2229','#D4AF37','#FFFFFF','#111827',85],rose:['#881337','#E11D48','#FFFFFF','#FFF1F2',50],neon:['#064E3B','#10B981','#A7F3D0','#064E3B',60]}[name];
  if(!tok&&!legacy)return;
  const p=tok?[tok.primary,tok.secondary,tok.headline,tok.surface,Math.round((tok.frameOpacity||.42)*100)]:legacy;
  const ids=['annPrimaryColor','annAccentColor','annTextColor','annSurfaceColor','annFrameOpacity'];
  ids.forEach((id,i)=>{const el=document.getElementById(id);if(el)el.value=p[i]});
  const descriptionColor=adInput('annDescriptionColor');if(descriptionColor)descriptionColor.value=p[2];
  window.__skhBasicTextColorTouched=true;window.__skhBasicDescriptionColorTouched=true;
  const hid=document.getElementById('annPaletteId');if(hid)hid.value=name;
  const hint=document.getElementById('annPaletteHint');if(hint){if(!tok)hint.textContent='';else{try{const rT=skhPaletteContrast(tok.headline,tok.primary),rC=skhPaletteContrast(tok.ctaText,tok.ctaBackground);hint.textContent='Palette: '+tok.label+' · kichwa '+rT.toFixed(1)+':1 · CTA '+rC.toFixed(1)+':1';}catch(e){hint.textContent='Palette: '+tok.label;}}}
  document.querySelectorAll('#announcementFormModal [data-ad-preset]').forEach(function(b){b.classList.toggle('active',b.dataset.adPreset===name);});
  window.skhAdOpacityChanged(p[4],false);window.skhRenderAdminAdPreview();
};
document.addEventListener('click',function(e){const b=e.target.closest&&e.target.closest('[data-ad-preset]');if(!b)return;e.preventDefault();window.skhAdApplyPreset(b.dataset.adPreset);},true);

async function adRefreshAnnouncementCache(announcementId,oldId){
  if(!announcementId)return;
  try{
    const snap=await skh.getDoc(skh.doc(skh.db,'announcements',announcementId));
    if(!snap.exists())return;
    const cache=Array.isArray(window.__sokohaiAnnouncementsCache)?window.__sokohaiAnnouncementsCache.filter(item=>item.id!==oldId&&item.id!==announcementId):[];
    cache.unshift({id:snap.id,...snap.data()});window.__sokohaiAnnouncementsCache=cache;
    try{localStorage.setItem('skh_cached_announcements',JSON.stringify(cache.filter(item=>item&&item.status==='published'&&item.archived!==true)));}catch(e){}
  }catch(e){console.warn('Announcement cache refresh skipped:',e);}
  if(typeof window.__sokohaiOnAnnouncementsUpdate==='function')window.__sokohaiOnAnnouncementsUpdate(window.__sokohaiAnnouncementsCache||[]);
  if(typeof window.renderAnnouncementManagerList==='function')window.renderAnnouncementManagerList();
}

window.submitAnnouncementForm=async function(mode='publish'){
  const action=mode==='draft'?'draft':mode==='schedule'?'schedule':'publish';
  const form=adBasicFormValues(),creative=adCurrentCreative();
  if(action!=='draft'){
    const check=validateBasicCreative(form,creative,{forPublish:true,requireSchedule:action==='schedule'});
    if(!check.ok){alert(check.errors.join('\n'));return false;}
    const start=form.startAt?Date.parse(form.startAt):NaN;
    if(action==='publish'&&Number.isFinite(start)&&start>Date.now()){
      alert('Tarehe ya baadaye imewekwa. Tumia kitufe tofauti cha Ratibu tangazo.');return false;
    }
    if(!adInput('annPreviewConfirmed')?.checked){alert('Tumia Preview na ukague tangazo kabla ya Publish.');return false;}
  }
  const actionButton=action==='draft'?adInput('btnSaveAdDraft'):action==='schedule'?adInput('btnScheduleAnnouncement'):adInput('btnSubmitAnnouncement');
  const old=actionButton?.textContent||'';
  if(actionButton){actionButton.disabled=true;actionButton.textContent=action==='draft'?'Inahifadhi…':action==='schedule'?'Inaratibu…':'Inachapisha…';}
  const otherButtons=[adInput('btnSaveAdDraft'),adInput('btnScheduleAnnouncement'),adInput('btnSubmitAnnouncement')].filter(button=>button&&button!==actionButton);
  otherButtons.forEach(button=>button.disabled=true);
  try{
    const savedCreative=await window.skhPersistBasicCreative(creative);
    if(typeof skh.callFunction!=='function')throw new Error('Creative service haipatikani.');
    if(action==='draft'){
      const draftResponse=await skh.callFunction('creativeSaveDraft',{creativeId:savedCreative.id,announcementId:window.__editingAnnouncementId||''});
      const draftResult=draftResponse&&draftResponse.data||draftResponse;
      if(!draftResult||draftResult.ok===false)throw new Error('Draft haikuhifadhiwa.');
      await adRefreshAnnouncementCache(draftResult.announcementId,null);
      const modal=adInput('announcementFormModal');if(modal)modal.style.display='none';
      window.__editingAnnouncementId=null;
      if(window.skhToast)window.skhToast('Draft imehifadhiwa.','success');
      return draftResult;
    }
    const response=await skh.callFunction('creativePublish',{
      creativeId:savedCreative.id,
      publicationType:'advertisement',
      action,
      requireSchedule:action==='schedule',
      replaceAnnouncementId:window.__editingAnnouncementId||''
    });
    const result=response&&response.data||response;
    if(!result||result.ok===false)throw new Error('Tangazo halikuhifadhiwa.');
    const oldId=window.__editingAnnouncementId;
    window.__editingAnnouncementId=null;
    const modal=adInput('announcementFormModal');if(modal)modal.style.display='none';
    await adRefreshAnnouncementCache(result.announcementId,oldId);
    if(window.skhToast)window.skhToast(action==='schedule'?'Tangazo limeratibiwa.':'Tangazo limepitishwa kwenye Creative publish pipeline.','success');
    return result;
  }catch(error){
    console.error('Basic advertisement save failed:',error);
    if(window.skhToast)window.skhToast('Imeshindwa kuhifadhi tangazo: '+(error.message||error),'error');else alert('Imeshindwa kuhifadhi tangazo: '+(error.message||error));
    return false;
  }finally{
    if(actionButton){actionButton.disabled=false;actionButton.textContent=old;}
    otherButtons.forEach(button=>button.disabled=false);
  }
};

window.skhAdminAdUpload=async function(kind,input){
  const files=Array.from(input?.files||[]);if(!files.length)return;
  const target=input.dataset.target||(kind==='video'?'annVideo':kind==='audio'?'annAudio':kind==='logo'?'annLogo':'annImage');
  if(target==='annSlideshow'&&adReadSlideshow().slides.length+files.length>MAX_SLIDESHOW_SLIDES){alert('Slideshow inaweza kuwa na picha zisizozidi '+MAX_SLIDESHOW_SLIDES+'.');input.value='';return;}
  const invalid=files.map(file=>({file,result:validateAdMediaFile(file,{kind:kind==='logo'?'image':kind,asLogo:kind==='logo'})})).find(entry=>!entry.result.ok);
  if(invalid){alert(invalid.result.message||'File type au size si sahihi.');input.value='';return;}
  input.disabled=true;if(window.skhToast)window.skhToast('Uploading '+files.length+' '+kind+'…','info');
  try{
    for(const file of files){
      const up=await window.skhUploadFromFile(file,{resourceType:kind==='video'||kind==='audio'?'video':'image',folder:AD_MEDIA_UPLOAD_FOLDER});
      if(!up||!up.url)throw new Error('Upload failed');
      const d=up.data||{},mediaKind=kind==='logo'?'logo':kind;
      await skh.addDoc(skh.collection(skh.db,'adminMedia'),{url:up.url,name:file.name,type:mediaKind,mime:file.type,size:file.size,width:d.width||null,height:d.height||null,duration:d.duration||null,uploadedAt:new Date().toISOString(),uploadedBy:skh.currentUser.uid,archived:false});
      if(target==='annSlideshow')window.skhAddSlideshowSlide(up.url,file.name);
      else{
        const inputTarget=adInput(target);if(inputTarget)inputTarget.value=up.url;
        if(kind==='video'){
          if(d.duration){adSet('annVideoOriginalDuration',Number(d.duration).toFixed(1));window.skhVideoDurationChanged(false);}
          window.skhProbeVideoDuration(up.url,!!d.duration);
        }
      }
    }
    window.skhRenderAdminAdPreview();if(window.skhToast)window.skhToast('Media uploaded and saved.','success');
  }catch(e){if(window.skhToast)window.skhToast('Upload imeshindwa: '+e.message,'error');else alert('Upload imeshindwa: '+e.message);}
  finally{input.disabled=false;input.value='';}
};

window.skhOpenAdminMediaLibrary=async function(target){if(!((window.SOKOHAI_CLAIMS&&window.SOKOHAI_CLAIMS.isAdmin)||(skh.currentUser&&skh.currentUser.email===skh.MY_ADMIN_EMAIL))){alert('Admin authorization required.');return;}window.__adminMediaTarget=target||'annImage';let m=document.getElementById('adminMediaLibraryModal');if(!m){m=document.createElement('div');m.id='adminMediaLibraryModal';m.className='overlay-menu';m.style.zIndex='10000';document.body.appendChild(m);}m.innerHTML='<section class="adm-ad-form" style="max-width:850px"><div class="adm-ad-form-head"><h3>Admin Media Library</h3><button class="adm-ad-btn" onclick="document.getElementById(\'adminMediaLibraryModal\').style.display=\'none\'">Close</button></div><div id="adminMediaLibraryGrid" class="adm-media-grid"><p>Loading media...</p></div></section>';m.style.display='flex';try{const q=skh.query(skh.collection(skh.db,'adminMedia'),skh.orderBy('uploadedAt','desc'),skh.limit(100)),snap=await skh.getDocs(q),items=[];snap.forEach(d=>items.push({id:d.id,...d.data()}));window.__adminMediaCache=items;window.skhRenderAdminMediaLibrary();}catch(e){document.getElementById('adminMediaLibraryGrid').innerHTML='<p style="color:#B43E3B">'+skh.skhEscape(e.message)+'</p>';}};
window.skhRenderAdminMediaLibrary=function(){const box=document.getElementById('adminMediaLibraryGrid');if(!box)return;const items=(window.__adminMediaCache||[]).filter(x=>!x.archived);box.innerHTML=items.length?items.map(x=>'<article class="adm-media-card">'+(x.type==='video'?'<video muted preload="metadata" src="'+skh.skhEscape(x.url)+'"></video>':x.type==='audio'?'<audio controls preload="none" src="'+skh.skhEscape(x.url)+'"></audio>':'<img src="'+skh.skhEscape(x.url)+'">')+'<b>'+skh.skhEscape(x.name||x.type)+'</b><div class="adm-media-meta">'+skh.skhEscape(x.type)+' · '+(x.width&&x.height?x.width+'×'+x.height+' · ':'')+new Date(x.uploadedAt).toLocaleDateString()+'</div><div class="adm-media-actions"><button onclick="window.skhSelectAdminMedia(\''+x.id+'\')">Select</button><button onclick="window.skhArchiveAdminMedia(\''+x.id+'\')">Archive</button><button onclick="window.skhDeleteAdminMedia(\''+x.id+'\')">Delete</button></div></article>').join(''):'<p>Media Library bado ni tupu.</p>';};
window.skhSelectAdminMedia=function(id){
  const item=(window.__adminMediaCache||[]).find(media=>media.id===id);if(!item)return;
  const targetName=window.__adminMediaTarget||'annImage';
  if(window.__adminMediaTarget==='studio'||targetName==='studio'){
    document.getElementById('adminMediaLibraryModal').style.display='none';
    if(typeof window.skhStudioApplyLibraryMedia==='function')window.skhStudioApplyLibraryMedia(item.url,item.type);return;
  }
  if(targetName==='libraryOnly'){
    document.getElementById('adminMediaLibraryModal').style.display='none';window.openAnnouncementFormModal();
    setTimeout(function(){const tid=item.type==='video'?'annVideo':item.type==='audio'?'annAudio':item.type==='logo'?'annLogo':'annImage';const target=adInput(tid);if(target){target.value=item.url;if(tid==='annVideo')window.skhProbeVideoDuration(item.url);window.skhRenderAdminAdPreview();}},0);return;
  }
  if(targetName==='annSlideshow'){
    if(item.type!=='image'&&item.type!=='logo'){alert('Slideshow inahitaji image pekee.');return;}
    window.skhAddSlideshowSlide(item.url,item.name||'Library image');document.getElementById('adminMediaLibraryModal').style.display='none';return;
  }
  const expected=targetName==='annVideo'?'video':targetName==='annAudio'?'audio':'image';
  if(expected==='image'&&!['image','logo'].includes(item.type)||expected!=='image'&&item.type!==expected){alert('Media hii haiendani na sehemu iliyochaguliwa.');return;}
  const target=adInput(targetName);if(!target)return;target.value=item.url;
  if(targetName==='annVideo')window.skhProbeVideoDuration(item.url);
  document.getElementById('adminMediaLibraryModal').style.display='none';window.skhRenderAdminAdPreview();
};
window.skhArchiveAdminMedia=async function(id){const x=(window.__adminMediaCache||[]).find(a=>a.id===id);if(!x)return;const inUse=(window.__sokohaiAnnouncementsCache||[]).some(a=>window.skhAdminAdState(a)==='active'&&[a.image,a.imageUrl,a.videoUrl,a.audioUrl,a.logoUrl].includes(x.url));if(inUse)return alert('Media hii inatumiwa na advertisement active. Replace creative kwanza.');if(!await skhConfirm('Archive media hii?'))return;await skh.updateDoc(skh.doc(skh.db,'adminMedia',id),{archived:true,archivedAt:new Date().toISOString()});x.archived=true;window.skhRenderAdminMediaLibrary();if(window.skhToast)window.skhToast('Media archived.','success');};
window.skhDeleteAdminMedia=async function(id){const x=(window.__adminMediaCache||[]).find(a=>a.id===id);if(!x)return;const inUse=(window.__sokohaiAnnouncementsCache||[]).some(a=>window.skhAdminAdState(a)==='active'&&[a.image,a.imageUrl,a.videoUrl,a.audioUrl,a.logoUrl].includes(x.url));if(inUse)return alert('Media hii inatumiwa na advertisement active. Replace creative kwanza.');if(!await skhConfirm('Delete media reference hii? Cloudinary asset haitafutwa bila signed deletion.'))return;await skh.deleteDoc(skh.doc(skh.db,'adminMedia',id));window.__adminMediaCache=(window.__adminMediaCache||[]).filter(a=>a.id!==id);window.skhRenderAdminMediaLibrary();if(window.skhToast)window.skhToast('Media reference deleted.','success');};

window.enableOfflineManagement = function(uid, name, shopName) {
    sessionStorage.setItem('currently_managed_offline_uid', uid);
    sessionStorage.setItem('currently_managed_offline_name', name);
    sessionStorage.setItem('currently_managed_offline_shop', shopName || name);
    
    let banner = document.getElementById('activeManagementBanner');
    if(!banner) {
        banner = document.createElement('div');
        banner.id = 'activeManagementBanner';
        document.body.appendChild(banner);
    }
    banner.style.cssText = "position:fixed; top:0; left:0; width:100%; background:#eab308; color:#0f172a; text-align:center; padding:8px; font-size:12px; font-weight:900; z-index:999999; box-shadow:0 2px 10px rgba(0,0,0,0.2);";
    banner.innerHTML = ` UNASIMAMIA KWA NIABA YA: ${skh.skhEscape(shopName || name)} | <button onclick="window.disableOfflineManagement()" style="background:red; color:white; border:none; padding:3px 10px; border-radius:6px; font-weight:900; cursor:pointer; margin-left:10px;">ZIMA</button>`;
    
    alert(T('pa_acting_enabled', 'ACTING-ON-BEHALF MODE ENABLED!\n\nEvery product, service or transport you publish now will appear under the profile of "{n}".', { n: skh.skhEscape(shopName || name) }));
    closeModals();
};

window.disableOfflineManagement = function() {
    sessionStorage.removeItem('currently_managed_offline_uid');
    sessionStorage.removeItem('currently_managed_offline_name');
    sessionStorage.removeItem('currently_managed_offline_shop');
    
    const banner = document.getElementById('activeManagementBanner');
    if(banner) banner.remove();
    
    alert(T('pa_acting_off', "Management is off. You are now using your personal agency account."));
};

window.deleteRideOrder = async function(rideId) {
    if(!await skhConfirm(" Una uhakika unataka kufuta kabisa historia ya safari hii kwenye kumbukumbu zako?")) return;

    // [LIFECYCLE] Safari ni rekodi ya biashara (token, makabidhiano, escrow).
    // Haifutwi ikishaanza — huwekwa kwenye Historia.
    await window.skhRequestDelete('ride_requests', rideId, {
        onDone: function () {
            if (skh.currentMode === 'buyer') window.loadBuyerOrdersWithTracking();
            else window.loadAndRenderDashboard();
        }
    });
};

window.chainNextLeg = function(oldRideId, lastStop, cargoName) {
    closeModals();
    sessionStorage.setItem('chain_from', lastStop);
    sessionStorage.setItem('chain_cargo_name', cargoName);
    sessionStorage.setItem('chain_old_ride_id', oldRideId);
    
    alert(T('pa_chain_next', 'Transport chain: cargo [{c}] reached stop [{s}]. Now choose the next driver or vehicle for the next leg.', { c: cargoName, s: lastStop }));
    document.getElementById('rideRequestModal').style.display = 'flex';
};

window.openLiveMap = function(rideId) {
    window.closeModals();
    const modal = document.getElementById('mapModal');
    if (modal) modal.style.display = 'flex';
    
    setTimeout(() => {
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            if (window.myLiveMap && typeof window.myLiveMap.remove === 'function') {
                try {
                    window.myLiveMap.remove();
                } catch(e) { console.log("Makosa ya kuondoa ramani:", e); }
            }
            mapContainer.innerHTML = "";
        }

        // [PERF 2026-09] Leaflet hupakuliwa kwa uvivu ramani inapofunguliwa.
        if (typeof window.skhWithLeaflet !== 'function') return;
        window.skhWithLeaflet((L) => {
        window.myLiveMap = L.map('map', { zoomControl: true }).setView([-6.7924, 39.2723], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.myLiveMap);

        window.skhOnSnapshot('ride-track', skh.doc(skh.db, "ride_requests", rideId), (snapshot) => {
            const d = snapshot.data();
            if(d && typeof d.driverLat === 'number' && typeof d.driverLon === 'number') {
                if (window.driverMarker) {
                    try { window.myLiveMap.removeLayer(window.driverMarker); } catch(e){}
                }
                window.driverMarker = L.marker([d.driverLat, d.driverLon]).addTo(window.myLiveMap)
                    .bindPopup(`<b>Dereva: ${skh.skhEscape(d.driverName || 'Safarini')}</b><br>Hali: ${d.status.toUpperCase()}`).openPopup();
                window.myLiveMap.setView([d.driverLat, d.driverLon], 14);
                document.getElementById('gpsText').innerText = T('pa_gps_live', "Reading driver GPS live ");
            } else {
                document.getElementById('gpsText').innerText = T('pa_gps_wait', "Waiting for driver GPS to come online... ");
            }
        });

        setTimeout(() => {
            if (window.myLiveMap) window.myLiveMap.invalidateSize();
        }, 200);
        });
    }, 500);
};

window.openDirectHire = function(driverId, driverName, vehicleType) {
    closeModals();
    const dhModal = document.getElementById('directHireModal');
    const display = document.getElementById('dhVehicleDisplay');
    
    document.getElementById('dhTargetDriverId').value = driverId;
    document.getElementById('dhVehicleType').value = vehicleType;
    
    if(display) display.innerHTML = `<b>Msaidizi:</b> ${skh.skhEscape(driverName)} <br> <b>Chombo:</b> ${vehicleType}`;
    if(dhModal) dhModal.style.display = 'flex';
};

window.submitDirectHire = async function() {
    const driverId = document.getElementById('dhTargetDriverId').value;
    const from = document.getElementById('dhFrom').value.trim();
    const to = document.getElementById('dhTo').value.trim();
    const cargo = document.getElementById('dhCargoName').value.trim();

    if(!from || !to || !cargo) { 
        alert(T('pa_fill_route', "Fill in all the fields (From, To and Cargo).")); 
        return; 
    }

    const btn = document.getElementById('btnSubmitDh');
    btn.innerHTML = " Inatuma..."; btn.disabled = true;

    try {
        // [CUSTODY PHASE B 2026-09] Token C (DL) inatolewa na SERVER — hakuna
        // plaintext transferCode inayoandikwa kwenye ride doc.
        const rideDocRef = await skh.addDoc(skh.collection(skh.db, "ride_requests"), {
            customerId: skh.currentUser.uid,
            customerName: skh.currentUser.displayName,
            driverId: driverId,
            status: "pending_acceptance",
            fromLocation: from,
            toLocation: to,
            cargoName: cargo,
            transferTokenStatus: 'unissued',
            createdAt: new Date().toISOString()
        });

        if (typeof window.skhCustodyMintTransferToken === 'function') {
            window.skhCustodyMintTransferToken(rideDocRef.id).catch(() => {});
        }

        alert(T('pa_request_sent', "Request sent to the driver! Wait for them to accept, then you will pay."));
        window.closeModals();
        if(window.loadBuyerOrdersWithTracking) window.loadBuyerOrdersWithTracking();
    } catch(e) { 
        alert(T('pa_error', "Error: ") + e.message); 
    } finally { 
        btn.disabled = false; btn.innerHTML = "TUMA OMBI KWA DEREVA "; 
    }
};

window.openActionModal = function(type) {
    if(!skh.requireAuth() || !skh.currentOpenProduct) return;
    const arm = document.getElementById('actionRequestModal');
    document.getElementById('armType').value = type;

    const input1 = document.getElementById('armInput1');
    const input2 = document.getElementById('armInput2');
    if (input1) input1.value = "";
    if (input2) input2.value = "";

    if(type === 'job') {
        document.getElementById('armTitle').innerText = T('pa_send_job', "Send Job Application");
        document.getElementById('armLabel1').innerText = T('pa_cv', "Describe yourself briefly (CV) *");
        document.getElementById('armLabel2').innerText = T('pa_phone_label', "Phone Number *");
    } else {
        document.getElementById('armTitle').innerText = T('pa_order_service', "Order a Service");
        document.getElementById('armLabel1').innerText = T('pa_describe_job', "Describe the job you want *");
        document.getElementById('armLabel2').innerText = T('pa_budget', "Your budget (TSh) *");
    }

    window.closeModals();
    if(arm) arm.style.display = 'flex';
};

window.submitActionRequest = async function() {
    const type = document.getElementById('armType').value;
    const info1 = document.getElementById('armInput1').value.trim();
    const info2 = document.getElementById('armInput2').value.trim();

    if(!info1 || !info2) return alert(T('pa_fill_all', "Fill in all fields."));

    const btn = document.getElementById('btnSubmitArm');
    btn.innerHTML = " Inatuma..."; btn.disabled = true;

    try {
        await skh.addDoc(skh.collection(skh.db, "requests"), {
            requestType: type, 
            itemId: skh.currentOpenProduct.id,
            itemTitle: skh.currentOpenProduct.title || 'Huduma/Kazi',
            receiverId: skh.currentOpenProduct.userId,
            senderId: skh.currentUser.uid,
            senderName: skh.currentUser.displayName,
            detail1: info1, detail2: info2,
            status: "pending", createdAt: new Date().toISOString()
        });
        alert(T('pa_req_sent_ok', "Request sent!"));
        document.getElementById('actionRequestModal').style.display = 'none';
    } catch(e) { alert(" Kosa: " + e.message); }
    finally { btn.innerHTML = "TUMA OMBI SASA "; btn.disabled = false; }
};

window.handleAuctionBid = function() {
    if(!skh.requireAuth()) return; 

    const bidInput = document.getElementById('userBidInput');
    const bidValue = parseFloat(bidInput.value);
    const currentMaxBid = skh.currentOpenProduct.modeData.currentBid || skh.currentOpenProduct.price;
    const minBidRequired = Math.round(currentMaxBid * 1.05); 

    if(!bidValue || bidValue < minBidRequired) {
        alert(T('pa_bid_low', "Your bid is too low! Place at least TSh ") + minBidRequired.toLocaleString());
        return;
    }

    window.verifyAndProceedSeriousAction("Auction", "auction", skh.currentOpenProduct.id, async () => {
        try {
            // [§8 ONE CORE] Pitia validator moja (07 skhAuctionPlaceBid): re-read
            // + transaction + outbid/seller notify + bids-history.
            const r = await window.skhAuctionPlaceBid(skh.currentOpenProduct.id, bidValue);
            if (!r.ok) { alert("Kosa: " + r.error); if (bidInput) bidInput.value = ""; return; }

            alert(T('pa_bid_lead', "Congratulations! You are now leading the auction."));
            bidInput.value = "";
        } catch(e) {
            alert("Kosa: " + e.message);
        }
    });
};

window.placeLiveBid = async function() {
    if(!skh.requireAuth()) return; 

    const bidInput = document.getElementById('userBidInput');
    const bidValue = parseFloat(bidInput.value);
    const currentMaxBid = skh.currentOpenProduct.modeData.currentBid || skh.currentOpenProduct.price;
    const minBidRequired = Math.round(currentMaxBid * 1.01); 

    if(!bidValue || bidValue < minBidRequired) {
        alert(T('pa_bid_too_low', "Your bid is too low! You must bid more than TZS ") + minBidRequired.toLocaleString());
        return;
    }

    window.verifyAndProceedSeriousAction("Auction", "auction", skh.currentOpenProduct.id, async () => {
        try {
            // [§8 ONE CORE] Na hapa: pitia validator moja (07).
            const r = await window.skhAuctionPlaceBid(skh.currentOpenProduct.id, bidValue);
            if (!r.ok) { alert(T('pa_bid_error', "Auction error: ") + r.error); if (bidInput) bidInput.value = ""; return; }

            alert(T('pa_bid_placed', "Congratulations! Your bid has been placed. Everyone's screen now shows your name!"));
            bidInput.value = ""; 
        } catch(e) {
            alert(T('pa_bid_error', "Auction error: ") + e.message);
        }
    });
};

window.updateDeliverySubcats = function() {
    const category = document.getElementById('rideReqCategory').value;
    
    // Vikundi vyote vya UI vya mteja
    const paxDiv = document.getElementById('passengerDetailsDiv');
    const livestockDiv = document.getElementById('livestockDetailsDiv');
    const cargoDiv = document.getElementById('cargoDetailsDiv');
    const typeSelect = document.getElementById('rideReqType');

    // 1. Ficha zote kwanza
    if(paxDiv) paxDiv.style.display = 'none';
    if(livestockDiv) livestockDiv.style.display = 'none';
    if(cargoDiv) cargoDiv.style.display = 'none';

    if (!category) return;

    let vehicles = [];

    if (category === 'Passengers') {
        // Maelezo ya abiria
        if(paxDiv) paxDiv.style.display = 'block';
        vehicles = ["Bodaboda", "Bajaji", "Taxi", "Van", "Bus"];
    } 
    else if (category === 'Livestock') {
        // Maelezo ya mifugo
        if(livestockDiv) livestockDiv.style.display = 'block';
        vehicles = ["Pickup", "Fuso", "Truck"];
    } 
    else if (category === 'Cargo') {
        // Maelezo ya mizigo mikubwa na vifurushi
        if(cargoDiv) cargoDiv.style.display = 'block';
        vehicles = ["Bodaboda", "Bajaji", "Pickup", "Van", "Fuso", "Truck", "Trailer"];
    }

    // Jaza Dropdown ya Chombo kiotomatiki kulingana na huduma
    if (typeSelect) {
        typeSelect.innerHTML = `<option value="">-- Chagua Chombo Kinachohitajika --</option>` + 
                               vehicles.map(v => `<option value="${v}">${v}</option>`).join('');
    }
};

window.updateDeliveryFilters = function() {
    const itemVal = document.getElementById('rideReqItem') ? document.getElementById('rideReqItem').value : '';
    if (itemVal) {
        sessionStorage.setItem('chain_cargo_name', itemVal);
        console.log("Aina ya mzigo iliyochaguliwa kwa usafiri:", itemVal);
    }
};

window.confirmDeliveryWithToken = async function(rideId, correctToken, driverId, price) {
    const inputToken = document.getElementById(`buyerDevToken_${rideId}`).value.trim().toUpperCase();
    if(!inputToken) return alert(T('pa_enter_token', "Enter the Delivery Token given by the driver!"));

    // [CUSTODY PHASE B 2026-09] Token C inathibitishwa na SERVER (deliveryComplete)
    // — hakuna kulinganisha frontend tena.
    try {
        if (typeof window.skhCustodyCompleteDelivery === 'function') {
            const res = await window.skhCustodyCompleteDelivery(rideId, inputToken, undefined);
            if (!res.ok) {
                alert(res.error === 'bad_token'
                    ? T('pa_token_wrong', "The token you entered is wrong! Verify with the driver.")
                    : (" Imeshindwa kukamilisha safari: " + res.error));
                return;
            }
            alert(T('pa_trip_done', "Trip confirmed and completed! Payment has been pushed to the driver's Wallet."));
            window.loadBuyerOrdersWithTracking();
            return;
        }
        // Legacy fallback (server haipatikani) — DEMO pekee.
        const rideRef = skh.doc(skh.db, "ride_requests", rideId);
        if(inputToken !== correctToken) {
            alert(T('pa_token_wrong', "The token you entered is wrong! Verify with the driver."));
            return;
        }
        await skh.updateDoc(rideRef, {
            status: "completed",
            auditTrail: skh.arrayUnion(`[${new Date().toLocaleTimeString()}] Safari imekamilika! Buyer amehakiki Delivery Token: ${inputToken}`)
        });
        alert(T('pa_trip_done', "Trip confirmed and completed! Payment has been pushed to the driver's Wallet."));
        window.loadBuyerOrdersWithTracking();
    } catch(e) {
        alert(T('pa_trip_error', "Error completing the trip: ") + e.message);
    }
};

window.deleteOrderLog = async function(orderId) {
    if (!await skhConfirm(" Una uhakika unataka kufuta kabisa rekodi hii ya mauzo kwenye historia yako? Hakuna kurudi nyuma.")) return;
    // [LIFECYCLE] Oda: isiyolipiwa inafutika; iliyolipiwa/iliyokamilika
    // huwekwa Kumbukumbu ili historia ya malipo/escrow isipotee.
    await window.skhRequestDelete('orders', orderId, {
        onDone: function () { window.loadBuyerOrdersWithTracking(); }
    });
};

window.directRequestTransporter = async function(rideId) {
    if(!skh.requireAuth()) return;
    if(!await skhConfirm("Je, unathibitisha kukubali usafiri huu na unataka kuanza sasa?")) return;

    try {
        const rideRef = skh.doc(skh.db, "ride_requests", rideId);
        const demoOk = (typeof window.skhCustodyFallbackAllowed === 'function') && window.skhCustodyFallbackAllowed();

        // [CUSTODY 2026-09] SERVER-AUTHORITATIVE: kukubali kazi kunapitia
        // callable `deliveryAccept` (accepted + driverId + token PK + event +
        // arifa kwa muuzaji). Browser HAJIPANGI yenyewe kama dereva.
        let serverDone = false;
        if (typeof window.skhCustodyServerAccept === 'function') {
            try {
                const acc = await window.skhCustodyServerAccept({
                    rideId: rideId,
                    driverName: skh.currentUser.displayName || "Dereva Sokohai",
                    driverPhone: (skh.currentUserData && skh.currentUserData.phone) || "N/A",
                    driverVehicleReg: (skh.currentUserData && skh.currentUserData.vehicleReg) || "N/A"
                });
                if (acc && acc.data && acc.data.ok) serverDone = true;
            } catch (e) { console.warn("[custody] deliveryAccept imeshindwa:", e && e.message); }
        }

        if (!serverDone) {
            /* [FIX 2026-09-15] Uchunguzi ulionyesha `deliveryAccept` inarudisha 404
               kwenye REGION ZOTE — haijadeploy. Hapo awali hii ilikuwa inasimama
               kabisa, hivyo dereva hakuweza KAMWE kukubali kazi.

               Tofautisho muhimu (§2 — hakuna fake success):
                 • KUKUBALI KAZI ni AHADI. Ni mabadiliko ya hali yanayolindwa na
                   Security Rules (dereva mwenyewe, ombi liwe bado 'searching').
                   Hii inaweza kuandikwa na client kwa usalama.
                 • TOKEN YA KUCHUKUA (PK), escrow na kamisheni ni MAMLAKA YA
                   SERVER. Hizi HAZIANDIKWI na browser — tunamwambia mtumiaji
                   ukweli badala ya kudanganya.                                */
            if (!demoOk) {
                var st = (typeof window.skhErr === 'function')
                    ? null : null;
                // Andika hali ya 'accepted' pekee — Rules ndizo mlinzi.
                try {
                    var snapPre = await skh.getDoc(rideRef);
                    if (!snapPre || !snapPre.exists || !snapPre.exists()) {
                        skhToast('Ombi hili halipatikani tena — huenda limeondolewa.', 'error', 4000);
                        return;
                    }
                    var cur = snapPre.data() || {};
                    // Usiruhusu kukubali ombi ambalo tayari lina dereva (§15 stale state)
                    if (cur.driverId && cur.driverId !== skh.currentUser.uid) {
                        skhToast('Samahani, kazi hii tayari imechukuliwa na dereva mwingine.', 'info', 4000);
                        if (typeof window.loadAvailableJobs === 'function') window.loadAvailableJobs();
                        return;
                    }
                    if (['completed','cancelled','delivered'].indexOf(String(cur.status||'').toLowerCase()) !== -1) {
                        skhToast('Kazi hii imeshafungwa.', 'info', 3500);
                        return;
                    }
                    await skh.updateDoc(rideRef, {
                        status: 'accepted',
                        driverId: skh.currentUser.uid,
                        driverName: skh.currentUser.displayName || 'Dereva Sokohai',
                        driverPhone: (skh.currentUserData && skh.currentUserData.phone) || 'N/A',
                        driverVehicleReg: (skh.currentUserData && skh.currentUserData.vehicleReg) || 'N/A',
                        acceptedAt: new Date().toISOString(),
                        tokenPending: true   // token itatolewa na server ikiwashwa
                    });
                    try {
                        var sn2 = await skh.getDoc(rideRef);
                        var d2 = (sn2 && sn2.data && sn2.data()) || {};
                        if (d2.customerId) {
                            await skh.addDoc(skh.collection(skh.db, 'notifications'), {
                                userId: d2.customerId,
                                title: 'Dereva amekubali kazi yako',
                                body: 'Dereva amekubali kusafirisha mzigo wako. Fungua mazungumzo kuendelea.',
                                createdAt: new Date().toISOString(), read: false, type: 'delivery'
                            });
                        }
                    } catch (eN) { /* arifa si kikwazo */ }

                    skhToast('Umekubali kazi hii. Namba ya kuchukua itatolewa server ikiwashwa.', 'success', 5000);
                    if (typeof window.loadAvailableJobs === 'function') window.loadAvailableJobs();
                    if (typeof window.loadAndRenderDashboard === 'function') window.loadAndRenderDashboard();
                    return;
                } catch (eAcc) {
                    if (typeof window.skhShowErr === 'function') {
                        window.skhShowErr(eAcc, { fn: 'acceptTransport', entityId: rideId,
                                                  collection: 'ride_requests', operation: 'update' });
                    } else {
                        skhToast('Imeshindikana kukubali ombi kwa sasa. Jaribu tena.', 'error', 4000);
                    }
                    return;
                }
            }

            // Demo/offline fallback (legacy) — kama ilivyokuwa awali.
            // "ACCEPTED ≠ PICKED UP" — kukubali ni ahadi tu.
            await skh.updateDoc(rideRef, {
                status: "accepted",
                driverId: skh.currentUser.uid,
                driverName: skh.currentUser.displayName || "Dereva Sokohai",
                driverPhone: skh.currentUserData?.phone || "N/A",
                driverVehicleReg: skh.currentUserData?.vehicleReg || "N/A"
            });

            // Tukio la audit: TRANSPORTER_ACCEPTED (append-only).
            if (typeof window.skhCustodyRecordEvent === 'function') {
                window.skhCustodyRecordEvent(rideId, 'TRANSPORTER_ACCEPTED', { role: 'transporter' }).catch(() => {});
            }

            // Token SALAMA ya kuchukua mzigo (PK) + arifa kwa muuzaji.
            if (typeof window.skhCustodyGenerateToken === 'function') {
                const gen = await window.skhCustodyGenerateToken(rideId, 'pickup');
                if (gen.ok) {
                    try {
                        const snap = await skh.getDoc(rideRef);
                        if (snap && snap.exists && snap.exists()) {
                            await skh.addDoc(skh.collection(skh.db, "notifications"), {
                                userId: snap.data().customerId,
                                // [SYSTEM EVENTS 2026-09] structured event — render hutafsiri kwa lugha ya msomaji.
                                event: 'delivery.transporterAccepted',
                                params: {},
                                title: "Transporter Amekubali — Pickup Inasubiri",
                                body: "Dereva amekubali kazi. Thibitisha makabidhiano ya mzigo kwenye Jopo la Mizigo & Dispatch.",
                                createdAt: new Date().toISOString(),
                                read: false,
                                type: 'delivery'
                            });
                        }
                    } catch (e) { /* si kikwazo */ }
                }
            }
        }

        alert(" Safari imefungwa kwako! Token ya kuchukua mzigo (PK) imeundwa na mmiliki wa mzigo amepewa taarifa.");
            
            // Umsukume Dereva kwenye Dashboard yetu Kuu ya kisasa
            skh.currentMode = 'driver';
            skh.localStorage.setItem('sokohai_mode', 'driver');
            skh.applyModeUI();
    } catch(e) {
        alert("Hitilafu: " + e.message);
    }
};

window.verifyHandoverToken = async function(rideId, stage) {
    const rideRef = skh.doc(skh.db, "ride_requests", rideId);
    const docSnap = await skh.getDoc(rideRef);
    
    if(!docSnap.exists()) return alert(" Hitilafu: Ombi la usafiri halijapatikana!");
    const rd = docSnap.data();

    if (stage === 'pickup') {
        // --- 1. PICKUP STAGE (TOKEN A - PK) ---
        const inputPK = document.getElementById(`pickupTokenInp_${rideId}`).value.trim().toUpperCase();
        if(!inputPK) return alert("Ingiza Token A (PK) kwanza!");

        // [CUSTODY 2026-09] Uthibitisho wa PANDEMBILI: muuzaji amethibitisha
        // makabidhiano (seller_confirmed_handover) -> sasa dereva anathibitisha
        // upokeaji kwa token salama. Hii ndiyo inayobadilisha custody kuwa PICKED_UP.
        if (typeof window.skhCustodyConfirmTransporterPickup === 'function') {
            // Uhakiki wa Mifugo ikiwa amebeba wanyama (kabla ya kuthibitisha).
            let startCount = rd.animalCount || 0;
            if(rd.reqCategory === 'Livestock') {
                const verifiedCount = await skhPrompt(` LIVE COUNT VERIFICATION:\nIdadi iliyotajwa kwenye oda: ${startCount} Heads.\n\nThibitisha idadi halisi unayopakia hivi sasa kwenye gari:`, startCount);
                if(verifiedCount === null) return;
                startCount = parseInt(verifiedCount) || startCount;
            }

            const res = await window.skhCustodyConfirmTransporterPickup(rideId, inputPK, 'good', '', '', rd.reqCategory === 'Livestock' ? startCount : undefined);
            if (!res.ok) {
                const msgs = {
                    bad_token: " Token si sahihi! Mwombe muuzaji akupe Token A (PK) sahihi.",
                    await_seller: " Subiri muuzaji athibitishe makabidhiano wa mzigo kwanza (uthibitisho wa pandembili).",
                    wrong_transporter: " Safari hii haijakabidhiwa kwako.",
                    token_used: " Token tayari imetumika.",
                    expired: " Token imeisha muda wake."
                };
                alert(msgs[res.error] || (" Uthibitisho umeshindwa: " + res.error));
                return;
            }

            alert(" UHAKIKI UMEFANIKIWA!\nMzigo sasa uko chini ya ulinzi wako (Picked Up). Bonyeza \"Anza Safari\" ukiwa tayari kuondoka.");
            window.renderDriverActiveTabContent();
            return;
        }

        // Legacy fallback (kama 33-custody.js haijapakia)
        if(inputPK !== rd.pickupToken) {
            alert(" Token uliyoweka SI sahihi! Dereva, mwombe muuzaji akupe Token A sahihi kutoka kwenye duka lake.");
            return;
        }
        
        // Uhakiki wa Mifugo ikiwa amebeba wanyama
        let startCount = rd.animalCount || 0;
        if(rd.reqCategory === 'Livestock') {
            const verifiedCount = await skhPrompt(` LIVE COUNT VERIFICATION:\nIdadi iliyotajwa kwenye oda: ${startCount} Heads.\n\nThibitisha idadi halisi unayopakia hivi sasa kwenye gari:`, startCount);
            if(verifiedCount === null) return;
            startCount = parseInt(verifiedCount) || startCount;
            await skh.updateDoc(rideRef, { verifiedPickupCount: startCount });
        }

        // Badili status ya safari kuwa ipo njiani (in_transit)
        await skh.updateDoc(rideRef, { 
            status: "in_transit",
            dispatchedAt: new Date().toISOString()
        });

        alert(" UHAKIKI UMEFANIKIWA!\nMzigo umeruhusiwa kuanza safari (In-Transit). Anza kuendesha kwa usalama.");
    } 
    else if (stage === 'delivery') {
        // --- 2. DELIVERY STAGE (TOKEN C - DL) — server-authoritative ---
        const inputDL = document.getElementById(`deliveryTokenInp_${rideId}`).value.trim().toUpperCase();
        if(!inputDL) return alert("Ingiza Token C (DL) kwanza!");

        // [CUSTODY PHASE B 2026-09] Token C inathibitishwa na SERVER
        // (deliveryComplete) — hakuna kulinganisha frontend tena.
        const finalPrice = rd.cargoPrice || rd.price || 40000;
        let arrivalCount;
        if(rd.reqCategory === 'Livestock') {
            const pickupCount = rd.verifiedPickupCount || rd.animalCount || 0;
            const arrivalCountPrompt = await skhPrompt(` ARRIVAL COUNT CHECK:\nIdadi iliyopakiwa mwanzo: ${pickupCount} Heads.\n\nIngiza idadi halisi ya mifugo iliyofika salama:`, pickupCount);
            if(arrivalCountPrompt === null) return;
            arrivalCount = parseInt(arrivalCountPrompt) || 0;

            if(arrivalCount < pickupCount) {
                const lostCount = pickupCount - arrivalCount;
                const penalty = (finalPrice * 0.15) * lostCount;
                const adjustedPayout = Math.max(0, finalPrice - penalty);
                if(!await skhConfirm(` MKATABA WA DHARURA: Mifugo ${lostCount} imepotea njiani!\n\nKiasi cha kulipwa kitapunguzwa kwa faini hadi TSh ${adjustedPayout.toLocaleString()}.\n\nJe, unakubali kupokea na kukamilisha safari?`)) {
                    // Mgogoro wa mifugo -> server (deliveryDispute).
                    if (typeof window.skhCustodyRaiseDispute === 'function') {
                        await window.skhCustodyRaiseDispute(rideId, `Mifugo ${lostCount} imepotea safarini. Dereva amekataa kukatwa faini ya upotevu.`);
                    }
                    alert(" Mgogoro umesajiliwa. Pesa imezuiwa kwenye Escrow hadi utatuzi wa Admin.");
                    window.renderDriverActiveTabContent();
                    return;
                }
            }
        }

        if (typeof window.skhCustodyCompleteDelivery === 'function') {
            const res = await window.skhCustodyCompleteDelivery(rideId, inputDL, arrivalCount);
            if (!res.ok) {
                const msgs = {
                    bad_token: " Token uliyoweka SI sahihi! Dereva, mwombe mpokeaji wa mzigo akupe Token C (DL Code) sahihi.",
                    server_unavailable: " Imeshindwa kuunganisha na server ili kukamilisha uwasilishaji. Jaribu tena."
                };
                alert(msgs[res.error] || (" Uwasilishaji haujakamilika: " + res.error));
                return;
            }
            alert(` SAFARI IMEKAMILIKA!\nTSh ${Number(res.finalPayout != null ? res.finalPayout : finalPrice).toLocaleString()} imeingizwa kwenye wallet yako vizuri.`);
            window.renderDriverActiveTabContent();
            return;
        }

        alert(" Huduma ya kukamilisha uwasilishaji haipatikani kwa sasa.");
    }
    
    window.renderDriverActiveTabContent();
};

window.simulateSellerHandover = async function(rideId) {
    const rideRef = skh.doc(skh.db, "ride_requests", rideId);
    const docSnap = await skh.getDoc(rideRef);
    if (!docSnap.exists()) return;

    const rd = docSnap.data();
    // [CUSTODY PHASE B 2026-09] Token halisi haiko kwenye ride doc tena —
    // inasomwa kutoka delivery_tokens (mhusika pekee).
    const tokenPlain = (typeof window.skhCustodyReadToken === 'function')
        ? (await window.skhCustodyReadToken(rideId, 'pickup')) : rd.pickupToken;
    
    window.customPrompt(` SELLER HANDOVER VERIFICATION\nDereva amefika! Mmiliki wa mzigo (Seller), ingiza Token PK (${tokenPlain || 'PK-XXXXXXXX'}) aliyokupa Dereva ili kumthibitisha kabla ya kukabidhi mzigo:`, "PK-XXXXXXXX", async (inputToken) => {
        if (!inputToken) return;

        // [CUSTODY 2026-09] Muuzaji anathibitisha MAKABIDHIANO (pande la kwanza) tu.
        // HAIWEKI mzigo "in_transit" — dereva ndiye atakayethibitisha upokeaji kwa token.
        if (typeof window.skhCustodyConfirmSellerHandover === 'function') {
            const res = await window.skhCustodyConfirmSellerHandover(rideId, inputToken, 'good');
            if (!res.ok) {
                const msgs = {
                    bad_token: " Token Wrong! Mfumo umeziba handover kwa sababu namba ya utambulisho hailingani.",
                    rate_limited: " Majaribio mengi sana. Subiri kidogo kisha ujaribu tena.",
                    owner_only: " Safari hii si yako.",
                    bad_stage: " Hatua ya safari hairuhusu uthibitisho wa makabidhiano."
                };
                alert(msgs[res.error] || (" Makabidhiano hayajathibitishwa: " + res.error));
                return;
            }
            alert(` Makabidhiano yamethibitishwa!\n\nDereva sasa atathibitisha upokeaji kwa token yake -> mzigo utakuwa chini ya ulinzi wake (Picked Up).`);
            return;
        }

        // Legacy fallback (33-custody.js haijapakia) — DEMO pekee.
        if (inputToken.toUpperCase() !== (tokenPlain || rd.pickupToken)) {
            alert(" Token Wrong! Mfumo umeziba handover kwa sababu namba ya utambulisho hailingani.");
            return;
        }
        await skh.updateDoc(rideRef, { status: "in_transit" });
        alert(` Driver Verified!\n\nMzigo umekabidhiwa salama kwa Dereva. Status imebadilika kuwa: SAFARINI (In Transit) `);
    });
};

window.acceptTransportMission = function(rideId) {
    window.directRequestTransporter(rideId);
};

window.loadHubDetailedRequests = async function() {
    const area = document.getElementById('hubDetailedNewReqArea');
    if(!area) return;

    area.innerHTML = '<p style="text-align:center; color:gray; padding:20px;"> Inapakia maombi mapya kutoka sokoni...</p>';

    try {
        const q = skh.query(skh.collection(skh.db, "requests"), skh.where("receiverId", "==", skh.currentUser.uid), skh.where("status", "==", "pending"));
        const snap = await skh.getDocs(q);
        let html = '';

        if(!snap.empty) {
            snap.forEach(docSnap => {
                const r = docSnap.data();
                html += `
                    <div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:16px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); text-align:left;"> <div> <b style="font-size:15px; color:#0f172a; display:block; margin-bottom:4px;"> Mteja: ${r.senderName}</b> <small style="color:gray; display:block; margin-bottom:5px;">Aina ya Kazi: ${skh.skhEscape(r.itemTitle)}</small> <span style="font-size:12px; display:block; color:#475569; background:#f1f5f9; padding:8px; border-radius:8px;">Maelezo: ${r.detail1}</span> <b style="display:block; color:var(--terracotta); font-size:14px; margin-top:8px;">Malipo yaliyotengwa: TZS ${parseFloat(r.detail2 || 0).toLocaleString()}</b> </div> <div style="display:flex; flex-direction:column; gap:8px;"> <button onclick="window.skhServiceOffer('${docSnap.id}', '${r.senderId}', '${skh.skhEscape(r.itemTitle)}')" style="padding:10px 20px; background:#fff; color:#1268A8; border:1px solid #1268A8; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">Toa Ofa</button> <button onclick="window.acceptHubServiceRequest('${docSnap.id}', '${r.senderName.replace(/'/g, "\\'")}', '${r.itemTitle.replace(/'/g, "\\'")}', ${parseFloat(r.detail2 || 0)}, '${r.senderId}')" style="padding:10px 20px; background:var(--green); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">Kubali Kazi</button> <button onclick="window.rejectHubServiceRequest('${docSnap.id}')" style="padding:10px 20px; background:#fee2e2; color:#ef4444; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">Kataa</button> </div> </div>`;
            });
        } else {
            // [REAL DATA 2026-09] MOCKS zimeondolewa kabisa — onyesha ukweli:
            html = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:16px; padding:30px; text-align:center; color:#64748b;"> <p style="margin:0; font-size:14px;"> Bado hakuna ombi jipya la kazi lililotumwa kwako kwa sasa.</p> <small style="color:#94a3b8;">Mteja atakapotuma ombi la huduma kwako, litaonekana hapa sasa hivi.</small> </div>`;
        }
        area.innerHTML = html;
    } catch(e) {
        area.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Makosa ya kupakia maombi: ${skh.skhEscape(e.message)}</p>`;
    }
};

window.acceptHubServiceRequest = async function(reqId, senderName, title, price, senderId) {
    if(!await skhConfirm(`Je, unathibitisha kukubali mkataba wa ufundi wa "${title}" kutoka kwa ${senderName} kwa TSh ${price.toLocaleString()}?`)) return;

    try {
        // Badilisha status ya request kwanza
        if (!reqId.startsWith('mock_')) {
            await skh.updateDoc(skh.doc(skh.db, "requests", reqId), { status: "accepted" });
        }

        // Tengeneza order mpya kiofisi kwenye Escrow system
        await skh.addDoc(skh.collection(skh.db, "orders"), {
            buyerId: senderId,
            buyerName: senderName,
            sellerId: skh.currentUser.uid,
            sellerName: skh.currentUser.displayName || "Fundi Pro",
            itemId: reqId,
            itemTitle: `Huduma: ${title}`,
            amount: price,
            status: "held", // Pesa ipo locked kwenye escrow sasa hivi
            collectionName: "services",
            date: new Date().toISOString(),
            ...(typeof window.skhAssistMeta === 'function' ? window.skhAssistMeta() : {})
        });

        alert(` Mkataba umesajiliwa salama!\n\nPesa ya mteja (TZS ${price.toLocaleString()}) imeshikiliwa kwenye Escrow. Unaweza kuanza kazi sasa.`);
        window.switchProviderDashTab('active_tasks');
    } catch(e) {
        alert("Hitilafu: " + e.message);
    }
};

window.rejectHubServiceRequest = async function(reqId) {
    if(!await skhConfirm("Una uhakika unataka kukataa ombi hili la huduma?")) return;
    try {
        if (!reqId.startsWith('mock_')) {
            await skh.updateDoc(skh.doc(skh.db, "requests", reqId), { status: "rejected" });
        }
        alert("Ombi limeghairiwa na kufutwa.");
        window.loadHubDetailedRequests();
    } catch(e) { alert(e.message); }
};

window.loadHubDetailedActiveTasks = async function() {
    const area = document.getElementById('hubDetailedActiveArea');
    if(!area) return;

    area.innerHTML = '<p style="text-align:center; color:gray; padding:20px;"> Inapakia kazi zinazoendelea sasa hivi...</p>';

    try {
        const q = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", skh.currentUser.uid), skh.where("status", "==", "held"));
        const snap = await skh.getDocs(q);
        let html = '';

        if(!snap.empty) {
            snap.forEach(docSnap => {
                const od = docSnap.data();
                html += `
                    <div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; text-align:left;"> <div style="flex:1;"> <span style="font-size:12.5px; background:#e0f2fe; color:#03509d; padding:2px 8px; border-radius:10px; font-weight:bold;">Safarini / In Progress</span> <b style="font-size:15px; color:#0f172a; display:block; margin-top:8px;"> Kazi: ${skh.skhEscape(od.itemTitle)}</b> <span style="font-size:12px; display:block; color:gray; margin-top:3px;">Mteja: ${skh.skhEscape(od.buyerName || '')} | Thamani: TZS ${(od.amount != null ? Number(od.amount) : 0).toLocaleString()}</span> <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden; margin-top:8px;"> <div style="width:60%; height:100%; background:var(--primary-blue);"></div> </div> </div> <div style="margin-left:20px; text-align:right;"> <button onclick="window.completeServiceTaskPro('${docSnap.id}', '${od.buyerId}', '${od.itemTitle.replace(/'/g, "\\'")}')" style="padding:10px 18px; background:var(--green); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">Kamilisha Kazi</button> </div> </div>`;
            });
        } else {
            // [REAL DATA 2026-09] Mock tasks zimeondolewa — hali ya kweli.
            html = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:16px; padding:30px; text-align:center; color:#64748b;"> <p style="margin:0; font-size:14px;">${T('hub_tasks_empty', 'Hakuna kazi inayoendelea kwa sasa.')}</p> </div>`;
        }
        area.innerHTML = html;
    } catch(e) {
        area.innerHTML = `<p style="color:red; text-align:center;">Makosa ya kupakia kazi: ${skh.skhEscape(e.message)}</p>`;
    }
};

window.completeServiceTaskPro = async function(orderId, buyerId, title) {
    if(!await skhConfirm(`Je, unathibitisha kuwa umekamilisha kazi ya "${title}" na mteja ameridhika?`)) return;

    try {
        if (!orderId.startsWith('mock_')) {
            // Badilisha status kuwa shipped ili mteja aweke DL Code kukubali
            await skh.updateDoc(skh.doc(skh.db, "orders", orderId), { status: "shipped", shippedAt: new Date().toISOString() /* [PHASE 2 P2] completedAt ni ya server */ });
            
            // Tuma notification kwa mteja kuthibitisha kupokea ukarabati
            await skh.addDoc(skh.collection(skh.db, "notifications"), {
                userId: buyerId,
                // [SYSTEM EVENTS 2026-09] structured event — lugha haitegemei mwandishi.
                event: 'tasks.completed',
                params: { title: String(title || '') },
                title: " Kazi Imekamilika!",
                body: `Mtaalamu ameweka alama kuwa amemaliza kazi ya "${title}". kagua na uthibitishe ili kuachia Escrow.`,
                createdAt: new Date().toISOString(),
                read: false,
                type: 'order'
            });
        }
        alert(" Hongera! Kazi imewekwa alama kama IMESHAWASILISHWA. Mteja amearifiwa kuthibitisha kwa Code C.");
        window.switchProviderDashTab('active_tasks');
    } catch(e) { alert("Kosa: " + e.message); }
};

window.loadHubDetailedCompletedTasks = async function() {
    const area = document.getElementById('providerWorkspace');
    if(!area) return;

    area.innerHTML = `
        <div style="text-align:left; animation:fadeIn 0.2s ease-out;"> <h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> Kazi Zilizokamilika (History)</h3> <p style="color:gray; font-size:12px; margin-bottom:20px;">Orodha ya kazi zote ulizozifanya na kuzikamilisha salama mtaani kwako [1].</p> <div style="display:flex; flex-direction:column; gap:10px;" id="hubHistoryArea">Inapakia...</div> </div>`;

    const listDiv = document.getElementById('hubHistoryArea');
    try {
        const q = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", skh.currentUser.uid), skh.where("status", "==", "completed"));
        const snap = await skh.getDocs(q);
        let html = '';

        if(!snap.empty) {
            snap.forEach(docSnap => {
                const od = docSnap.data();
                html += `
                    <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:14px; display:flex; justify-content:space-between; align-items:center;"> <div> <b> ${skh.skhEscape(od.itemTitle)}</b> <span style="display:block; font-size:13px; color:gray; margin-top:2px;">Mteja: ${skh.skhEscape(od.buyerName || '')} | Thamani: TZS ${(od.amount != null ? Number(od.amount) : 0).toLocaleString()}</span> </div> <span style="font-size:13px; background:#dcfce7; color:#16a34a; padding:4px 10px; border-radius:8px; font-weight:bold;">COMPLETED</span> </div>`;
            });
        } else {
            // [REAL DATA 2026-09] Mock historia imeondolewa — hali ya kweli ya ukurasa mtupu.
            html = `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:16px; padding:30px; text-align:center; color:#64748b;"> <p style="margin:0; font-size:14px;">${T('hub_history_empty', 'Hakuna kazi zilizokamilika bado — historia itajazwa hapa.')}</p> </div>`;
        }
        listDiv.innerHTML = html;
    } catch(e) { listDiv.innerHTML = `<p style="color:red;">Kosa la mtandao.</p>`; }
};

/* ================================================================
   [REAL DATA 2026-09] Paneli za Provider Hub: mockups zimeondolewa.
   Kila view inasoma data HALISI kutoka Firestore (sellerId/provider
   = mtumiaji aliyeingia). Statuses zinapitia glossary (skhGloss),
   fedha/tarehe zinapitia skhFmt. Routes + majina ya functions yamebaki.
   ================================================================ */

// Helper: oda zangu kama muuzaji/mtoa huduma (bila index maalum).
async function skhHubMyOrders() {
    try {
        var uid = skh.currentUser && skh.currentUser.uid;
        if (!uid) return [];
        var qy = skh.query(skh.collection(skh.db, "orders"), skh.where("sellerId", "==", uid), skh.limit(300));
        var snap = await skh.getDocs(qy);
        var list = [];
        snap.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
        return list;
    } catch (e) { console.warn('[hub-orders]', e && e.message); return []; }
}
function skhHubAmt(o) { return Number(o.amount != null ? o.amount : (o.total != null ? o.total : 0)) || 0; }
function skhHubMoney(n) { try { if (window.skhFmt) return window.skhFmt.money(n, 'TZS'); } catch (e) {} return 'TZS ' + Number(n || 0).toLocaleString(); }
function skhHubSt(o) {
    var st = String(o.deliveryStatus || o.status || 'payment_pending');
    try { if (window.skhGloss) return window.skhGloss(st, 'delivery', st); } catch (e) {}
    return st;
}
var SKH_HELD = ['payment_pending', 'held', 'prepared', 'shipped', 'in_transit', 'paid', 'processing', 'accepted'];
var SKH_DONE = ['completed', 'confirmed', 'delivered_confirmed'];

window.loadHubDetailedCalendar = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">' + T('common_loading', 'Inapakia...') + '</div>';
    var rows = (await skhHubMyOrders())
        .filter(function (o) { return SKH_HELD.indexOf(String(o.status || '')) !== -1; })
        .sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); })
        .slice(0, 8);
    var list = rows.length ? rows.map(function (o, i) {
        var col = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'][i % 4];
        var bg = ['#f0fdf4', '#eff6ff', '#f5f3ff', '#fffbeb'][i % 4];
        var d = ''; try { if (window.skhFmt) d = window.skhFmt.date(o.createdAt); } catch (e) {}
        return '<div style="border-left:4px solid ' + col + '; padding:10px; background:' + bg + '; border-radius:0 8px 8px 0; text-align:left;">'
            + '<b>' + skh.skhEscape(o.itemTitle || o.title || ('Oda #' + String(o.orderId || o.id).slice(0, 10))) + '</b><br>'
            + '<span style="color:gray; font-size:13px;">' + skh.skhEscape(o.buyerName || o.customerName || T('cust_customer', 'Mteja'))
            + ' • ' + skhHubMoney(skhHubAmt(o)) + ' • <b>' + skh.skhEscape(skhHubSt(o)) + '</b>'
            + (d ? ' • ' + d : '') + '</span></div>';
    }).join('') : '<p style="color:#64748b; font-size:13px;">' + T('hub_cal_empty', 'Hakuna oda au booking inayoendelea kwa sasa.') + '</p>';
    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out; display:flex; flex-direction:column; gap:20px;">'
        + '<div><h3 style="color:var(--primary-dark); margin:0; text-transform:uppercase;"> ' + T('hub_cal_title', 'Booking Calendar & Schedules') + '</h3>'
        + '<p style="color:gray; font-size:12px;">' + T('hub_cal_sub', 'Kagua na dhibiti ratiba zako zote za leo na siku zijazo.') + '</p></div>'
        + '<div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:16px; display:flex; flex-direction:column; gap:10px;">' + list + '</div></div>';
};

window.loadHubDetailedMyServices = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;

    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out;">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">'
        + '<div><h3 style="color:var(--primary-dark); margin:0; text-transform:uppercase;"> ' + T('hub_services_title', 'Huduma Zangu (My Services List)') + '</h3>'
        + '<p style="color:gray; font-size:12px;">' + T('hub_services_sub', 'Maelezo ya ujuzi na matoleo yote uliyosajili sokoni hivi sasa.') + '</p></div>'
        + '<button onclick="showForm(\'serviceForm\')" style="padding:10px 18px; background:var(--primary-blue); color:white; border:none; border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer;"> ' + T('hub_services_add', 'Ongeza Huduma') + '</button></div>'
        + '<div style="display:flex; flex-direction:column; gap:12px;" id="hubServicesListArea">' + T('common_loading', 'Inapakia...') + '</div></div>';

    const listDiv = document.getElementById('hubServicesListArea');
    try {
        const q = skh.query(skh.collection(skh.db, "services"), skh.where("userId", "==", skh.currentUser.uid));
        const snap = await skh.getDocs(q);
        let html = '';

        if (!snap.empty) {
            snap.forEach(docSnap => {
                const s = docSnap.data();
                var priceHtml = (s.price != null && window.skhFmt) ? window.skhFmt.money(s.price) : 'TZS ' + (s.price != null ? Number(s.price) : 0).toLocaleString();
                html += `
                    <div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:16px; display:flex; justify-content:space-between; align-items:center;"> <div style="display:flex; gap:12px; align-items:center;"> <img src="${s.image}" style="width:45px; height:45px; border-radius:8px; object-fit:cover; border:1px solid #eee;"> <div> <b style="font-size:14px; color:#0f172a; display:block;"> ${s.title}</b> <span style="font-size:13px; color:gray; display:block;">Kundi: ${s.groupType || s.category} |  ${s.location}</span> </div> </div> <div style="text-align:right;"> <b style="display:block; color:var(--terracotta); font-size:14px; margin-bottom:5px;">${priceHtml}</b> <button onclick="window.deleteAd('${docSnap.id}', 'services', '${s.title.replace(/'/g, "\\'")}')" style="padding:4px 10px; background:#fee2e2; color:#ef4444; border:none; border-radius:6px; font-weight:bold; font-size:12.5px; cursor:pointer;">Futa</button> </div> </div>`;
            });
        } else {
            // [REAL DATA 2026-09] Mockup imeondolewa — hali ya kweli ya ukurasa mtupu.
            html = '<p style="color:#64748b; font-size:13px; text-align:left;">' + T('empty_services', 'Hakuna huduma')
                + ' — ' + T('hub_services_empty_hint', 'Bonyeza "Ongeza Huduma" kusajili huduma yako ya kwanza.') + '</p>';
        }
        listDiv.innerHTML = html;
    } catch (e) { listDiv.innerHTML = '<p style="color:red;">' + T('err_network', 'Kosa la mtandao wakati wa kupakia.') + '</p>'; }
};

window.loadHubDetailedClients = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">' + T('common_loading', 'Inapakia...') + '</div>';
    var byBuyer = {};
    (await skhHubMyOrders()).forEach(function (o) {
        var k = o.buyerId || o.buyerName || '';
        if (!k) return;
        if (!byBuyer[k]) byBuyer[k] = { name: o.buyerName || T('cust_customer', 'Mteja'), n: 0 };
        byBuyer[k].n++;
    });
    var entries = Object.keys(byBuyer).map(function (k) { return byBuyer[k]; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 20);
    var cards = entries.length ? entries.map(function (c) {
        var initials = String(c.name || 'M').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase() || 'M';
        return '<div style="background:white; border:1px solid #e2e8f0; padding:15px; border-radius:14px; display:flex; gap:12px; align-items:center;">'
            + '<div style="width:45px; height:45px; background:var(--primary-blue); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:18px;">' + skh.skhEscape(initials) + '</div>'
            + '<div><b style="font-size:14px; display:block;">' + skh.skhEscape(c.name) + '</b>'
            + '<span style="font-size:13px; color:gray; display:block;">' + (window.tn ? tn('hub_client_orders', c.n) : ('Oda: ' + c.n)) + '</span></div></div>';
    }).join('') : '<p style="color:#64748b; font-size:13px;">' + T('hub_clients_empty', 'Bado huna wateja — wataonekana hapa baada ya oda ya kwanza.') + '</p>';
    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out;"><h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> ' + T('hub_clients_title', 'Wateja Wako') + '</h3>'
        + '<p style="color:gray; font-size:12px; margin-bottom:20px;">' + T('hub_clients_sub', 'Orodha ya wateja waliofanya kazi nawe.') + '</p>'
        + '<div style="display:flex; flex-direction:column; gap:10px;">' + cards + '</div></div>';
};

window.loadHubDetailedContracts = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">' + T('common_loading', 'Inapakia...') + '</div>';
    var rows = (await skhHubMyOrders()).filter(function (o) { return SKH_HELD.indexOf(String(o.status || '')) !== -1; });
    var list = rows.length ? rows.map(function (o) {
        return '<div style="border-left:4px solid var(--green); padding-left:12px; margin-bottom:15px; text-align:left;">'
            + '<b style="color:var(--primary-dark);">' + skh.skhEscape(o.itemTitle || ('Oda #' + String(o.orderId || o.id).slice(0, 10))) + '</b>'
            + '<p style="font-size:12px; color:gray; margin:4px 0;">' + skh.skhEscape(o.buyerName || T('cust_customer', 'Mteja'))
            + ' | ' + skhHubMoney(skhHubAmt(o)) + ' | ' + T('hub_status', 'Hali') + ': <b style="color:green;">' + skh.skhEscape(skhHubSt(o)) + '</b></p></div>';
    }).join('') : '<p style="color:#64748b; font-size:13px;">' + T('hub_contracts_empty', 'Hakuna mkataba unaoendelea kwa sasa.') + '</p>';
    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out;"><h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> ' + T('hub_contracts_title', 'Mikataba na Makubaliano') + '</h3>'
        + '<p style="color:gray; font-size:12px; margin-bottom:20px;">' + T('hub_contracts_sub', 'Orodha ya mikataba inayohusisha kazi zako za sasa.') + '</p>'
        + '<div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:16px;">' + list + '</div></div>';
};

window.loadHubDetailedEscrow = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">' + T('common_loading', 'Inapakia...') + '</div>';
    var agg = { held: 0, released: 0, pending: 0, refund: 0 };
    (await skhHubMyOrders()).forEach(function (o) {
        var st = String(o.status || '');
        var amt = skhHubAmt(o);
        if (SKH_HELD.indexOf(st) !== -1) agg.held += amt;
        else if (SKH_DONE.indexOf(st) !== -1) agg.released += amt;
        else if (st === 'delivered') agg.pending += amt;
        else if (st === 'disputed') agg.refund += amt;
    });
    function row(lbl, val, color) {
        return '<div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:8px; text-align:left;"><span>' + lbl + '</span><b style="color:' + color + ';">' + skhHubMoney(val) + '</b></div>';
    }
    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out;"><h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> ' + T('hub_escrow_title', 'Escrow Summary Ledger') + '</h3>'
        + '<p style="color:gray; font-size:12px; margin-bottom:20px;">' + T('hub_escrow_sub', 'Ulinzi wa malipo: hali halisi ya fedha kwenye oda zako.') + '</p>'
        + '<div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:16px; display:flex; flex-direction:column; gap:10px;">'
        + row(T('sp_escrow', 'Held (kwenye ulinzi)') , agg.held, 'orange')
        + row(T('sp_release', 'Released (zilizolipwa)'), agg.released, 'green')
        + row(T('st_pay_pending', 'Pending (inasubiri uthibitisho)'), agg.pending, 'var(--primary-blue)')
        + row(T('status_disputed', 'Refunded/Disputed'), agg.refund, 'red')
        + '</div></div>';
};

window.loadHubDetailedEarnings = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">' + T('common_loading', 'Inapakia...') + '</div>';
    var now = new Date();
    var d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var w0 = d0 - 6 * 864e5;
    var m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var y0 = new Date(now.getFullYear(), 0, 1).getTime();
    var agg = { day: 0, week: 0, month: 0, year: 0 };
    (await skhHubMyOrders()).forEach(function (o) {
        if (SKH_DONE.indexOf(String(o.status || '')) === -1) return;
        var ts = Date.parse(o.createdAt || o.completedAt || '') || 0;
        var amt = skhHubAmt(o);
        if (!ts) return;
        if (ts >= d0) agg.day += amt;
        if (ts >= w0) agg.week += amt;
        if (ts >= m0) agg.month += amt;
        if (ts >= y0) agg.year += amt;
    });
    function card(lbl, val, color) {
        return '<div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:15px; text-align:left;"><small style="color:gray; font-weight:bold; text-transform:uppercase;">' + lbl + '</small><h3 style="margin:5px 0 0; color:' + color + ';">' + skhHubMoney(val) + '</h3></div>';
    }
    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out;"><h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> ' + T('hub_earn_title', 'Ripoti ya Mapato (Earnings Hub)') + '</h3>'
        + '<p style="color:gray; font-size:12px; margin-bottom:20px;">' + T('hub_earn_sub', 'Mapato halisi kutoka kwenye oda zilizokamilika.') + '</p>'
        + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">'
        + card(T('hub_earn_day', 'MAPATO YA LEO'), agg.day, 'green')
        + card(T('hub_earn_week', 'MAPATO YA WIKI'), agg.week, 'green')
        + card(T('hub_earn_month', 'MAPATO YA MWEZI'), agg.month, 'var(--primary-blue)')
        + card(T('hub_earn_year', 'MAPATO YA MWAKA'), agg.year, 'var(--primary-blue)')
        + '</div></div>';
};

window.loadHubDetailedReviews = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">' + T('common_loading', 'Inapakia...') + '</div>';
    var reviews = [];
    try {
        var uid = skh.currentUser && skh.currentUser.uid;
        if (uid) {
            var snap = await skh.getDocs(skh.query(skh.collection(skh.db, "services"), skh.where("userId", "==", uid), skh.limit(100)));
            snap.forEach(function (d) {
                var sv = d.data();
                (sv.comments || []).forEach(function (c) {
                    if (Number(c.rating || 0) > 0 || c.text) {
                        reviews.push({ name: c.authorName || c.userName || T('cust_customer', 'Mteja'), text: c.text || '', rating: Number(c.rating || 0), at: c.createdAt || '' });
                    }
                });
            });
        }
    } catch (e) { console.warn('[hub-reviews]', e && e.message); }
    reviews.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
    var cards = reviews.length ? reviews.slice(0, 10).map(function (r) {
        var stars = r.rating ? ' ' + '★'.repeat(Math.min(5, r.rating)) : '';
        var d = ''; try { if (window.skhFmt && r.at) d = window.skhFmt.date(r.at); } catch (e) {}
        return '<div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:16px; margin-bottom:15px; text-align:left;">'
            + '<b style="color:#0f172a; display:block; margin-bottom:10px;">' + skh.skhEscape(r.name) + ' <span style="color:#f59e0b;">' + stars + '</span></b>'
            + (r.text ? '<p style="color:#475569; font-size:13px; line-height:1.4; margin:0;">"' + skh.skhEscape(r.text) + '"</p>' : '')
            + (d ? '<small style="color:gray; display:block; margin-top:6px;">' + d + '</small>' : '') + '</div>';
    }).join('') : '<p style="color:#64748b; font-size:13px;">' + T('hub_reviews_empty', 'Bado huna tathmini — zitaonekana hapa baada ya wateja kukadiria huduma zako.') + '</p>';
    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out;"><h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> ' + T('hub_reviews_title', 'Reviews & Client Feedbacks') + '</h3>'
        + '<p style="color:gray; font-size:12px; margin-bottom:20px;">' + T('hub_reviews_sub', 'Maoni halisi ya wateja waliokula huduma zako.') + '</p>' + cards + '</div>';
};

window.loadHubDetailedDisputes = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">' + T('common_loading', 'Inapakia...') + '</div>';
    var rows = (await skhHubMyOrders()).filter(function (o) { return String(o.status || '') === 'disputed'; });
    var cards = rows.length ? rows.map(function (o) {
        var buyer = o.buyerName || T('cust_customer', 'Mteja');
        var chatBtn = (o.buyerId && typeof window.openChatWithUser === 'function')
            ? '<button onclick="window.openChatWithUser(\'' + skh.skhJsEsc(String(o.buyerId)) + '\',\'' + skh.skhJsEsc(String(buyer)) + '\')" style="padding:6px 12px; background:var(--primary-blue); color:white; border:none; border-radius:6px; font-size:13px; cursor:pointer;">' + T('hub_dispute_chat', 'Wasiliana na Mteja') + '</button>' : '';
        return '<div style="background:#fff5f5; border-left:4px solid red; padding:15px; border-radius:0 12px 12px 0; text-align:left;">'
            + '<b style="color:red; display:block; margin-bottom:5px;">' + skh.skhEscape(o.itemTitle || ('Oda #' + String(o.orderId || o.id).slice(0, 10))) + '</b>'
            + '<span style="font-size:12px; color:#475569;">' + T('hub_dispute_desc', 'Mgogoro wazi')
            + ' • ' + skh.skhEscape(buyer) + ' • ' + skhHubMoney(skhHubAmt(o)) + '</span>'
            + '<div style="display:flex; gap:10px; margin-top:10px; align-items:center;">' + chatBtn
            + '<small style="color:#64748b;">' + T('hub_dispute_admin_note', 'Oda zenye mgogoro zinaonekana kwa Admin moja kwa moja kwa uhakiki.') + '</small></div></div>';
    }).join('') : '<p style="color:#64748b; font-size:13px;">' + T('hub_disputes_empty', 'Hakuna mgogoro wazi kwa sasa.') + '</p>';
    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out;"><h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> ' + T('hub_disputes_title', 'Migogoro Inayokusubiri (Disputes)') + '</h3>'
        + '<p style="color:gray; font-size:12px; margin-bottom:20px;">' + T('hub_disputes_sub', 'Oda zilizo kwenye mgogoro — wasiliana moja kwa moja kutatua.') + '</p>' + cards + '</div>';
};

window.loadHubDetailedAnalytics = async function () {
    const area = document.getElementById('providerWorkspace');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;color:#64748b;padding:40px;">' + T('common_loading', 'Inapakia...') + '</div>';
    var now = new Date();
    var m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var pm0 = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    var thisM = 0, lastM = 0, buyers = {}, mRev = 0;
    (await skhHubMyOrders()).forEach(function (o) {
        var ts = Date.parse(o.createdAt || '') || 0;
        if (o.buyerId) buyers[o.buyerId] = true;
        if (ts >= m0) { thisM++; if (SKH_DONE.indexOf(String(o.status || '')) !== -1) mRev += skhHubAmt(o); }
        else if (ts >= pm0 && ts < m0) lastM++;
    });
    var growth = lastM > 0 ? Math.round(((thisM - lastM) / lastM) * 100) : (thisM > 0 ? 100 : 0);
    var body = (thisM || lastM || Object.keys(buyers).length)
        ? '<span>' + T('hub_an_orders', 'Oda mwezi huu') + ': <b>' + thisM + '</b> · '
        + T('hub_an_last', 'Mwezi uliopita') + ': <b>' + lastM + '</b> · '
        + T('hub_an_trend', 'Mabadiliko') + ': <b style="color:' + (growth >= 0 ? 'green' : 'red') + ';">' + (growth >= 0 ? '+' : '') + growth + '%</b><br><br>'
        + T('hub_an_clients', 'Wateja wa kipekee') + ': <b>' + Object.keys(buyers).length + '</b> · '
        + T('hub_an_rev', 'Mapato ya mwezi huu (zilizokamilika)') + ': <b>' + skhHubMoney(mRev) + '</b></span>'
        : '<span style="color:#64748b;">' + T('hub_an_empty', 'Hakuna data ya kutosha bado — itajazwa kadiri oda zinavyokua.') + '</span>';
    area.innerHTML = '<div style="text-align:left; animation:fadeIn 0.2s ease-out;"><h3 style="color:var(--primary-dark); margin-top:0; text-transform:uppercase;"> ' + T('hub_an_title', 'Performance Analytics') + '</h3>'
        + '<p style="color:gray; font-size:12px; margin-bottom:20px;">' + T('hub_an_sub', 'Takwimu halisi za biashara yako kutoka kwenye oda.') + '</p>'
        + '<div style="background:white; border:1px solid #cbd5e1; padding:20px; border-radius:16px;">' + body + '</div></div>';
};

/* [NEGOTIATION 2026-09-15] Mtoa huduma anatoa ofa kwenye ombi (§17, §18).
   Hapo awali kulikuwa na "Kubali Kazi / Kataa" pekee — hakuna njia ya
   kujadili bei. Inatumia injini ILIYOPO (skhNegoFormOpen -> 37-negotiation). */
window.skhServiceOffer = async function (requestId, customerId, title) {
    if (!requestId) return;
    if (skh.requireAuth && !skh.requireAuth()) return;
    var me = (window.skhOwnerId ? window.skhOwnerId() : null)
             || (skh.currentUser && skh.currentUser.uid);
    if (customerId && customerId === me) {
        skhToast('Huwezi kujitolea ofa kwenye ombi lako mwenyewe.', 'info', 3000);
        return;
    }
    if (typeof window.skhNegoFormOpen !== 'function') {
        skhToast('Fomu ya majadiliano haipatikani kwa sasa.', 'error');
        return;
    }
    window.skhNegoFormOpen({
        type: 'service',
        entity: {
            id: requestId,
            collection: 'requests',
            collectionName: 'requests',
            title: title || 'Huduma',
            sellerId: me,              // mtoa huduma ndiye anayetoa ofa
            buyerId: customerId || null,
            customerId: customerId || null
        }
    });
};

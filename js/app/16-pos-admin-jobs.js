/* ==== js/app/16-pos-admin-jobs.js ==== */
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

window.submitAgent = async function(event) {
    if(event) event.preventDefault();
    if(!skh.requireAuth()) return;

    const name = document.getElementById('agentName').value.trim();
    let phone = document.getElementById('agentPhone').value.trim();
    const email = document.getElementById('agentEmail').value.trim();
    const region = document.getElementById('agentRegion').value;
    const bio = document.getElementById('agentBio').value.trim();

    if(!name || !phone || !region || !bio) {
        alert(T('pa_fill_agent', "Enter your Name, Phone, Region, and Description."));
        return;
    }

    if(phone.startsWith('0')) phone = '255' + phone.substring(1);
    const txRef = "AGTStand_" + Date.now();

    const btn = document.getElementById('btnAgent');
    const originalText = btn.innerHTML;
    btn.innerHTML = " INATUMA OMBI...";
    btn.disabled = true;

    try {
        // [FIX: MAOMBI YAFIKE KWA ADMIN] Ombi linaandikwa kwenye Firestore MARA MOJA
        // (status: pending) — hata kabla ya malipo ya ada. Admin anaona kila ombi.
        const isFreeMode = !skh.paymentGate('agent_registration');
        const agentRef = await skh.addDoc(skh.collection(skh.db, "agents"), {
            userId: skh.currentUser.uid,
            userEmail: skh.currentUser.email || '',
            fullName: name,
            contact: phone,
            email: email || '',
            location: region,
            bio: bio || '',
            status: 'pending',
            paymentStatus: isFreeMode ? 'free' : 'pending',
            isPaid: false,
            feeWaived: isFreeMode,
            paymentRef: txRef,
            source: 'agent_form',
            createdAt: new Date().toISOString()
        });
        const agentDocId = agentRef.id;

        if (isFreeMode) {
            alert(T('pa_agent_sent_free', "Your Agency application has been SENT to Admin.\n\nThe AGENCY fee is off (FREE MODE) — no TSh 3,100 fee for now.\nAdmin will review and approve you."));
            window.loadAgentDashboard();
            return;
        }

        try {
            // [PesaPal] Hosted checkout — malipo yakikamilika, 17-pesapal-return itasasisha
            // document hii hii (agentDocId) kuwa paymentStatus: 'paid'.
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
            alert(T('pa_agent_sent_pending', "Your Agency application has been SENT to Admin (status: pending).\n\nThe fee (TSh 3,100) will be required before approval — you can pay later.\nReference: ") + txRef);
        }

    } catch(e) { alert(T('pa_error', "Error: ") + e.message); }
    finally { btn.innerHTML = " TUMA OMBI LAKO"; btn.disabled = false; }
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
                    </div> </div> <!--  ANNOUNCEMENT BAR MANAGER (Marquee/Ticker) --> <div style="background: white; border: 1px solid #cbd5e1; border-radius: 18px; padding: 20px;"> <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;"> <h4 style="margin:0; color: var(--primary-dark); font-weight:900;"> USIMAMIZI WA ANNOUNCEMENT BAR (TICKER)</h4> <button onclick="window.openAnnouncementFormModal()" style="padding:10px 18px; background:var(--primary-dark); color:white; border:none; border-radius:10px; font-weight:900; cursor:pointer; font-size:12px;"> TANGAZO JIPYA</button> </div> <p style="font-size:13px; color:gray; margin:0 0 15px;">Weka matangazo yanayopita juu ya website (kama Amazon/Temu). Yanabadilika kiotomatiki, yanaonekana kwa watumiaji WOTE papo hapo, bila kubadili code.</p> <div id="adminAnnouncementListBox" style="display:flex; flex-direction:column; gap:10px;"> <p style="color:gray; font-size:12px; text-align:center; padding:10px;">Inapakia matangazo...</p> </div> </div> </div> `;

        window.renderAnnouncementManagerList();
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color:red; text-align:center; padding:30px;">Hitilafu imetokea.</p>`;
    }
};

window.__editingAnnouncementId = null;

window.renderAnnouncementManagerList = function(){
    const box = document.getElementById('adminAnnouncementListBox');
    if(!box) return; // Admin panel haipo wazi kwa sasa

    const items = window.__sokohaiAnnouncementsCache || [];
    if(!items.length){
        box.innerHTML = `<p style="color:gray; font-size:12px; text-align:center; padding:10px;">Hakuna matangazo bado. Bofya "TANGAZO JIPYA" kuanza.</p>`;
        return;
    }

    const now = Date.now();
    const typeLabels = {
        normal:' Welcome', breaking:' Breaking News', feature:' New Feature',
        promotion:' Promotion', maintenance:' Maintenance', 'security-notice':' Security Notice',
        tender:' Government Tender', event:' Event', security:' Escrow', launch:' Launch',
        company:' Companies', service:' Services', payment:' Payments', update:' Update'
    };

    box.innerHTML = items.map(a => {
        const startsOk = !a.startAt || new Date(a.startAt).getTime() <= now;
        const endsOk = !a.endAt || new Date(a.endAt).getTime() >= now;
        const isLive = a.active !== false && startsOk && endsOk;
        const statusBadge = isLive
            ? `<span style="background:#dcfce7; color:#16a34a; padding:3px 10px; border-radius:20px; font-size:12.5px; font-weight:900;"> LIVE</span>`
            : (a.active === false
                ? `<span style="background:#fee2e2; color:#ef4444; padding:3px 10px; border-radius:20px; font-size:12.5px; font-weight:900;"> IMEZIMWA</span>`
                : `<span style="background:#fef9c3; color:#a16207; padding:3px 10px; border-radius:20px; font-size:12.5px; font-weight:900;"> NJE YA MUDA</span>`);
        const dateInfo = (a.startAt || a.endAt)
            ? `<small style="color:#94a3b8; display:block; margin-top:4px;"> ${a.startAt ? new Date(a.startAt).toLocaleString() : 'Sasa'} -> ${a.endAt ? new Date(a.endAt).toLocaleString() : 'Bila mwisho'}</small>`
            : '';
        return `
            <div style="padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px;"> <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;"> <div style="flex:1; min-width:200px;"> <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;"> <b style="font-size:13px; background:#e2e8f0; padding:3px 10px; border-radius:20px;">${typeLabels[a.type] || a.type || 'Notice'}</b>
                            ${statusBadge}
                        </div> <p style="margin:8px 0 0; font-size:13px; font-weight:700; color:#0f172a;">${(a.icon || '')} ${a.text}</p>
                        ${a.link ? `<small style="color:var(--primary-blue); display:block; margin-top:4px;"> ${a.link}</small>` : ''}
                        ${dateInfo}
                    </div> <div style="display:flex; gap:6px; flex-wrap:wrap;"> <button onclick="window.openAnnouncementFormModal('${a.id}')" style="padding:6px 12px; background:var(--primary-blue); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">HARIRI </button> <button onclick="window.sokohaiToggleAnnouncementActive('${a.id}', ${a.active !== false})" style="padding:6px 12px; background:${a.active !== false ? '#fef9c3' : '#dcfce7'}; color:${a.active !== false ? '#a16207' : '#16a34a'}; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">${a.active !== false ? 'ZIMA ' : 'WASHA '}</button> <button onclick="window.sokohaiDeleteAnnouncement('${a.id}')" style="padding:6px 12px; background:#fee2e2; color:#ef4444; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">${T('pa_delete', 'DELETE')} </button> </div> </div> </div>`;
    }).join('');
};

window.openAnnouncementFormModal = function(editId){
    window.__editingAnnouncementId = editId || null;
    const existing = editId ? (window.__sokohaiAnnouncementsCache || []).find(a => a.id === editId) : null;

    let modal = document.getElementById('announcementFormModal');
    if(!modal){
        modal = document.createElement('div');
        modal.id = 'announcementFormModal';
        modal.className = 'overlay-menu';
        modal.style.cssText = 'z-index:9999; display:none; align-items:center; justify-content:center;';
        modal.innerHTML = `
            <div style="background:white; border-radius:24px; padding:28px; width:95%; max-width:480px; max-height:90vh; overflow-y:auto; box-shadow:0 15px 40px rgba(0,0,0,0.5);"> <h3 id="annFormTitle" style="margin-top:0; color:var(--primary-dark); font-weight:900;"> Tangazo Jipya</h3> <label style="font-size:13px; font-weight:900; color:gray; display:block; margin-bottom:4px;">AINA YA TANGAZO *</label> <select id="annType" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:14px; font-weight:bold; background:white;"> <option value="normal"> Welcome / General</option> <option value="breaking"> Breaking News</option> <option value="feature"> New Feature</option> <option value="promotion"> Promotion</option> <option value="maintenance"> Maintenance</option> <option value="security-notice"> Security Notice</option> <option value="tender"> Government Tender</option> <option value="event"> Event</option> <option value="security"> Escrow</option> <option value="launch"> Launch</option> <option value="company"> Companies</option> <option value="service"> Services</option> <option value="payment"> Payments</option> <option value="update"> Update</option> </select> <label style="font-size:13px; font-weight:900; color:gray; display:block; margin-bottom:4px;">ICON (HIARI, MF: )</label> <input type="text" id="annIcon" placeholder="${T('pa_icon_ph', 'e.g. icon')}" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:14px;"> <label style="font-size:13px; font-weight:900; color:gray; display:block; margin-bottom:4px;">UJUMBE WA TANGAZO *</label> <textarea id="annText" rows="3" placeholder="${T('pa_ann_ph', 'Write the announcement message here...')}" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:14px; resize:vertical; font-family:inherit;"></textarea> <label style="font-size:13px; font-weight:900; color:gray; display:block; margin-bottom:4px;">PICHA YA STORY/CAMPAIGN (HTTPS URL) *</label> <input type="url" id="annImage" placeholder="https://.../campaign.jpg" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:14px;"> <label style="font-size:13px; font-weight:900; color:gray; display:block; margin-bottom:4px;">KIUNGO CHA "READ MORE" (HIARI)</label> <input type="text" id="annLink" placeholder="${T('pa_link_ph', 'e.g. https://sokohai.com/promo')}" style="width:100%; padding:12px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:14px;"> <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;"> <div> <label style="font-size:13px; font-weight:900; color:gray; display:block; margin-bottom:4px;">${T('pa_start_date', 'START DATE')}</label> <input type="datetime-local" id="annStartAt" style="width:100%; padding:10px; border-radius:10px; border:1px solid #cbd5e1;"> </div> <div> <label style="font-size:13px; font-weight:900; color:gray; display:block; margin-bottom:4px;">${T('pa_end_date', 'END DATE')}</label> <input type="datetime-local" id="annEndAt" style="width:100%; padding:10px; border-radius:10px; border:1px solid #cbd5e1;"> </div> </div> <label style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:bold; margin-bottom:20px;"> <input type="checkbox" id="annActive" checked style="width:18px; height:18px;"> Tangazo Liwe LIVE Sasa
                </label> <button onclick="window.submitAnnouncementForm()" id="btnSubmitAnnouncement" style="width:100%; padding:15px; background:var(--primary-dark); color:white; border:none; border-radius:14px; font-weight:900; font-size:14px; cursor:pointer;">${T('pa_save_ann', 'SAVE ANNOUNCEMENT')} </button> <button onclick="document.getElementById('announcementFormModal').style.display='none'" style="width:100%; margin-top:10px; padding:12px; background:#e2e8f0; color:#475569; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">${T('pa_cancel', 'Cancel')}</button> </div>`;
        document.body.appendChild(modal);
    }

    document.getElementById('annFormTitle').innerText = existing ? T('pa_edit_ann', 'Edit Announcement') : T('pa_new_ann', 'New Announcement');
    document.getElementById('annType').value = existing?.type || 'normal';
    document.getElementById('annIcon').value = existing?.icon || '';
    document.getElementById('annText').value = existing?.text || '';
    document.getElementById('annImage').value = existing?.image || existing?.imageUrl || '';
    document.getElementById('annLink').value = existing?.link || '';
    document.getElementById('annStartAt').value = existing?.startAt ? existing.startAt.slice(0,16) : '';
    document.getElementById('annEndAt').value = existing?.endAt ? existing.endAt.slice(0,16) : '';
    document.getElementById('annActive').checked = existing ? (existing.active !== false) : true;

    modal.style.display = 'flex';
};

window.submitAnnouncementForm = async function(){
    const text = document.getElementById('annText').value.trim();
    const image = document.getElementById('annImage').value.trim();
    if(!text){ alert(T('pa_write_ann', 'Please write the announcement message.')); return; }
    if(!/^https:\/\/[^\s"'<>]+$/i.test(image)){ alert('Weka HTTPS URL halali ya picha ya campaign.'); return; }

    const payload = {
        type: document.getElementById('annType').value,
        icon: document.getElementById('annIcon').value.trim(),
        text,
        image,
        link: document.getElementById('annLink').value.trim(),
        startAt: document.getElementById('annStartAt').value ? new Date(document.getElementById('annStartAt').value).toISOString() : '',
        endAt: document.getElementById('annEndAt').value ? new Date(document.getElementById('annEndAt').value).toISOString() : '',
        active: document.getElementById('annActive').checked
    };

    const btn = document.getElementById('btnSubmitAnnouncement');
    const originalText = btn.innerHTML;
    btn.innerHTML = ' Inahifadhi...';
    btn.disabled = true;

    const ok = await window.sokohaiSaveAnnouncement(payload, window.__editingAnnouncementId);

    btn.innerHTML = originalText;
    btn.disabled = false;

    if(ok){
        document.getElementById('announcementFormModal').style.display = 'none';
        window.__editingAnnouncementId = null;
    }
};

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
            await skh.updateDoc(skh.doc(skh.db, "orders", orderId), { status: "shipped", completedAt: new Date().toISOString() });
            
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

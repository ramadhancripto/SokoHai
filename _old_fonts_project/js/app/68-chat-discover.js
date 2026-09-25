/* ================================================================
 * 68-chat-discover.js — [R17 DISCOVER 2026-09-17]
 * "Soga = COMMUNICATION + DISCOVER" (brief §1/§4).
 * Inaingia KATIKA inbox iliyopo (#chatListModal) kama chip 'Gundua'.
 * Results = Firestore HALISI (users: discoverable==true tu — §31 privacy;
 * chatGroups: visibility==public), CONTACT → openChatWithUser (conversation
 * iliyopo ndiyo inafunguliwa — chatCore get-or-create, §10/§44).
 * PRIVACY §33: haturudishi simu/email/likes/saves/private data.
 * UI = data-attributes + event delegation (hakuna inline-quotes kabisa).
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    if (window.__skhDiscoverBoot) return;
    window.__skhDiscoverBoot = true;

    function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }
    function esc(s) { return skh.skhEscape(String(s == null ? '' : s)); }
    function uid() { return (skh.currentUser && skh.currentUser.uid) || ''; }

    /* ---------- DISCOVERABILITY (§7) ---------- */
    function myDiscovery() {
        var u = skh.currentUserData || {};
        var d = u.discovery || {};
        return {
            findMe: !!u.discoverable,
            asBuyer: d.asBuyer !== false,
            asSeller: d.asSeller !== false,
            asBusiness: d.asBusiness !== false,
            showInterests: d.showInterests !== false
        };
    }
    window.skhMyDiscovery = myDiscovery;

    window.skhSaveDiscovery = async function (patch) {
        if (!uid()) { alert(tk('login_first', 'Ingia kwanza.')); return; }
        var d = Object.assign(myDiscovery(), patch || {});
        var data = {
            discoverable: !!d.findMe,
            discovery: { asBuyer: !!d.asBuyer, asSeller: !!d.asSeller, asBusiness: !!d.asBusiness, showInterests: !!d.showInterests },
            updatedAt: new Date().toISOString()
        };
        try {
            await skh.setDoc(skh.doc(skh.db, 'users', uid()), data, { merge: true });
            skh.currentUserData = Object.assign({}, skh.currentUserData || {}, data);
            renderSettings();
            try { if (window.showToast) window.showToast(tk('disc_saved', 'Mipangilio ya ugunduzi imehifadhiwa'), 'success'); } catch (eT) {}
        } catch (e) { alert(tk('disc_err_save', 'Imeshindikana kuhifadhi. Jaribu tena.')); }
    };

    /* ---------- SEARCH (§5/§32/§42) ---------- */
    function blockedSet() {
        try {
            var b = skh.chatCore && skh.chatCore.blockedUids;
            if (Array.isArray(b)) return b;
            return JSON.parse(localStorage.getItem('skh_blocked_uids') || '[]');
        } catch (e) { return []; }
    }
    function personMatches(u, q, kind) {
        if (!u || u.uid === uid()) return false;
        var ql = String(q || '').toLowerCase().replace(/^@/, '');
        var name = String(u.fullName || u.displayName || u.username || '').toLowerCase();
        var uname = String(u.username || '').toLowerCase();
        var biz = String(u.businessName || u.primaryProfile || '').toLowerCase();
        var ints = String((u.interests && u.interests.join ? u.interests.join(' ') : u.interests) || u.category || '').toLowerCase();
        if (ql && !(name.includes(ql) || uname.includes(ql) || biz.includes(ql) || ints.includes(ql))) return false;
        var d = u.discovery || {};
        if (kind === 'business' && !(d.asBusiness !== false && (u.businessName || u.primaryProfile || u.isSeller))) return false;
        // Role-keyword matching (§5): kama query ina keyword ya role, user lazima
        // awe KATI ya role hizo (anazoziruhusu kuonekana §10) — isipokuwa query
        // infanana na name/biashara/interests kwaki (discriminative).
        if (window.skhRoleSignalMatch) {
            var sig = window.skhRoleSignalMatch(u, ql);
            if (sig === false) return false;
        }
        return true;
    }

    var LAST = { q: '', kind: 'all', people: [], groups: [] };
    window.skhDiscoverKind = function () { return LAST.kind; };

    window.skhDiscoverSearch = async function (q, kind) {
        q = String(q || '').trim(); kind = kind || 'all';
        LAST.q = q; LAST.kind = kind;
        var out = { people: [], groups: [] };
        if (kind === 'connections' || kind === 'opportunities') { LAST.people = []; LAST.groups = []; return out; } // 72 inachunguza hizi
        if (kind !== 'groups') try {
            var snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'users'), skh.where('discoverable', '==', true), skh.limit(50)));
            var blocked = blockedSet();
            snap.forEach(function (dc) {
                var u = dc.data() || {};
                u.uid = u.uid || dc.id;
                if (!u.discoverable) return;
                if (blocked.includes(u.uid)) return;
                if (personMatches(u, q, kind === 'business' ? 'business' : 'all')) out.people.push(u);
            });
            out.people = out.people.slice(0, 24);
        } catch (eP) { console.warn('[discover people]', eP); }
        if (kind === 'all' || kind === 'groups') try {
            var gsnap = await skh.getDocs(skh.query(skh.collection(skh.db, 'chatGroups'), skh.where('visibility', '==', 'public'), skh.limit(24)));
            gsnap.forEach(function (dc) {
                var g = dc.data() || {}; g.id = dc.id;
                if (!q || String(g.name || g.title || '').toLowerCase().includes(q.toLowerCase())) out.groups.push(g);
            });
            out.groups = out.groups.slice(0, 12);
        } catch (eG) {}
        LAST.people = out.people; LAST.groups = out.groups;
        renderResults();
        return out;
    };
    window.skhDiscoverTab = function (kind) { window.skhDiscoverSearch(LAST.q, kind); };

    /* ---------------- [R20] public hooks (72-discover-global.js) ---------------- */
    window.skhDiscoverLastQ = function () { return LAST.q; };
    window.skhDiscoverKind2 = function () { return LAST.kind; };
    window.skhDiscoverSetQ = function (q) { LAST.q = String(q || '').trim(); };
    window.skhDiscoverPeople = function () { return LAST.people.slice(); };
    window.skhDiscoverGroups2 = function () { return LAST.groups.slice(); };
    window.skhDiscoverRenderResults = renderResults;
    window.skhDiscoverFind = function (uid2) { return LAST.people.find(function (u) { return u.uid === uid2; }) || null; };

    /* ---------- CONTACT (§10) ---------- */
    window.skhDiscoverContact = function (targetUid, displayName) {
        if (!targetUid) return;
        if (!skh.requireAuth()) return;
        try { if (window.openChatWithUser) window.openChatWithUser(targetUid, displayName || tk('disc_person', 'Mtu')); }
        catch (e) { console.warn('[disc contact]', e); }
    };

    /* ---------- UI ---------- */
    function tabBtn(kind, label) {
        var on = LAST.kind === kind;
        return '<button type="button" data-act="disc-tab" data-kind="' + kind + '" style="padding:6px 12px;border-radius:99px;border:1px solid #cbd5e1;background:' + (on ? '#1268A8;color:#fff' : '#fff') + ';font-size:12.5px;font-weight:700;cursor:pointer;">' + label + '</button>';
    }
    function personCard(u) {
        var name = u.fullName || u.displayName || u.username || tk('disc_person', 'Mtu');
        var role = u.primaryProfile || u.role || (u.isSeller ? tk('r16_role_seller', 'Product Seller') : tk('chat_customer', 'Customer'));
        var roleBadges = (window.skhRoleBadgesFor ? window.skhRoleBadgesFor(u) : '');
        var verifyBadge = (u.verified || u.verifiedBusiness)
            ? '<span class="skh-verified-badge" aria-label="' + tk('verified', 'Imethibitishwa') + '" title="' + tk('verified', 'Imethibitishwa') + '" style="color:#18A982;font-weight:900;">' + (window.skhNavIcon?window.skhNavIcon('check',11):'✓') + '</span>'
            : '';
        var biz = u.businessName || '';
        var d = u.discovery || {};
        var ints = d.showInterests !== false ? (u.interests && u.interests.slice ? u.interests.slice(0, 3).join(' · ') : (u.category || '')) : '';
        var initial = String(name).trim().charAt(0).toUpperCase() || '?';
        return '<div style="display:flex;gap:12px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:14px;margin-bottom:8px;background:#fff;">'
            + '<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#1268A8,#18A982);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;">' + esc(initial) + '</div>'
            + '<div style="flex:1;min-width:0;">'
            + '<b style="display:block;font-size:14px;color:#0f172a;">' + esc(name) + ' ' + verifyBadge + (u.username ? ' <small style="color:#64748b;">@' + esc(u.username) + '</small>' : '') + '</b>'
            + (roleBadges ? roleBadges : '')
            + '<small style="display:block;color:#64748b;font-size:12.5px;">' + esc(role) + (biz ? ' · ' + esc(biz) : '') + (u.region ? ' · ' + esc(u.region) : '') + '</small>'
            + (ints ? '<small style="display:block;color:#94a3b8;font-size:12px;">' + esc(ints) + '</small>' : '')
            + '</div>'
            + '<div style="display:flex;flex-direction:column;gap:6px;align-items:stretch;">'
            + '<button type="button" data-act="disc-contact" data-uid="' + esc(u.uid) + '" data-name="' + esc(name) + '" style="border:none;background:#18A982;color:#fff;font-weight:800;font-size:12.5px;padding:8px 13px;border-radius:99px;cursor:pointer;white-space:nowrap;">' + tk('disc_chatbtn', 'Wasiliana') + '</button>'
            + '<button type="button" data-act="disc-view-person" data-uid="' + esc(u.uid) + '" style="border:1px solid #cbd5e1;background:#fff;color:#1268A8;font-weight:800;font-size:12px;padding:7px 13px;border-radius:99px;cursor:pointer;white-space:nowrap;">' + tk('disc_view', 'Tazama Profaili') + '</button>'
            + '</div></div>';
    }
    function groupCard(g) {
        var name = g.name || g.title || tk('disc_group', 'Kikundi');
        var n = (g.memberCount != null ? g.memberCount : (Array.isArray(g.members) ? g.members.length : ''));
        return '<div style="display:flex;gap:12px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:14px;margin-bottom:8px;background:#fff;">'
            + '<div style="width:40px;height:40px;border-radius:12px;background:#e0f0fa;color:#1268A8;display:flex;align-items:center;justify-content:center;font-weight:800;">#</div>'
            + '<div style="flex:1;min-width:0;"><b style="display:block;font-size:14px;color:#0f172a;">' + esc(name) + '</b>'
            + '<small style="color:#64748b;">' + esc(g.category || '') + (n !== '' ? ' · ' + n + ' ' + tk('disc_members', 'wanachama') : '') + '</small></div>'
            + (g.id ? '<div style="display:flex;flex-direction:column;gap:6px;align-items:stretch;">'
                + '<button type="button" data-act="disc-join" data-gid="' + esc(g.id) + '" style="border:none;background:#1268A8;color:#fff;font-weight:800;font-size:12.5px;padding:8px 13px;border-radius:99px;cursor:pointer;white-space:nowrap;">' + tk('disc_join', 'Jiunge') + '</button>'
                + '<button type="button" data-act="disc-view-group" data-gid="' + esc(g.id) + '" style="border:1px solid #cbd5e1;background:#fff;color:#1268A8;font-weight:800;font-size:12px;padding:7px 13px;border-radius:99px;cursor:pointer;white-space:nowrap;">' + tk('disc_view_grp', 'Tazama') + '</button>'
                + '</div>' : '')
            + '</div>';
    }

    function renderResults() {
        var host = document.getElementById('skhDiscResults');
        if (!host) return;
        // [R20] kinds zilizokuwemo: all / people / business / groups.
        // connections / opportunities hutolewa na 72-discover-global.js.
        if (LAST.kind === 'connections' || LAST.kind === 'opportunities') return;
        var html = '';
        if (!LAST.q && !LAST.people.length && !LAST.groups.length) {
            html = '<div style="text-align:center;padding:38px 16px;color:#64748b;">'
                + '<div style="font-size:38px;margin-bottom:8px;">⌕</div>'
                + '<b style="display:block;color:#334155;">' + tk('disc_title', 'Tafuta Watu & Vikundi') + '</b>'
                + '<small>' + tk('disc_hint', 'Mf: "wauzaji wa mchele", "@juma", "washonaji", "transporters Tabora"') + '</small></div>';
        } else {
            if (LAST.people.length && LAST.kind !== 'groups') {
                html += '<b style="display:block;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin:6px 0 8px;">' + tk(LAST.kind === 'business' ? 'disc_business_tab' : 'disc_people', LAST.kind === 'business' ? 'BIASHARA' : 'WATU') + ' (' + LAST.people.length + ')</b>';
                html += LAST.people.map(personCard).join('');
            }
            if (LAST.groups.length && LAST.kind !== 'people' && LAST.kind !== 'business') {
                html += '<b style="display:block;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">' + tk('disc_groups', 'VIKUNDI') + (LAST.groups.length ? ' (' + LAST.groups.length + ')' : '') + '</b>';
                html += LAST.groups.map(groupCard).join('');
            }
            if (LAST.kind === 'groups' ? !LAST.groups.length : (!LAST.people.length && !LAST.groups.length)) {
                html = '<div style="text-align:center;padding:30px;color:#64748b;"><b>' + tk('disc_none', 'Hakuna matokeo') + '</b><small style="display:block;margin-top:6px;">' + tk('disc_none_hint', 'Hakuna mtu aliyeruhusu kugunduliwa kwenye context hii bado. Jaribu neno jingine.') + '</small></div>';
            }
        }
        host.innerHTML = html;
    }

    /* ---------- SETTINGS MODAL (§7) ---------- */
    window.skhOpenDiscoverSettings = function () {
        var m = document.getElementById('skhDiscSettingsModal');
        if (!m) { buildSettingsModal(); m = document.getElementById('skhDiscSettingsModal'); }
        renderSettings();
        m.style.display = 'flex';
    };
    function tog(key, label, sub) {
        var d = myDiscovery();
        var on = !!d[key];
        return '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px;cursor:pointer;">'
            + '<input type="checkbox" data-toggle="' + key + '" ' + (on ? 'checked' : '') + ' style="margin-top:2px;width:17px;height:17px;accent-color:#1268A8;">'
            + '<span><b style="display:block;font-size:13.5px;color:#0f172a;">' + label + '</b><small style="color:#64748b;font-size:12px;">' + sub + '</small></span></label>';
    }
    function buildSettingsModal() {
        var m = document.createElement('div');
        m.id = 'skhDiscSettingsModal';
        m.className = 'overlay-menu';
        m.style.cssText = 'display:none;z-index:100002;align-items:center;justify-content:center;';
        m.innerHTML = '<div style="background:#fff;border-radius:20px;padding:22px;width:92%;max-width:400px;max-height:86vh;overflow-y:auto;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><b style="font-size:15px;color:#0f172a;">' + tk('disc_settings', 'Mipangilio ya Ugunduzi') + '</b>'
            + '<button type="button" data-act="disc-close-settings" style="border:none;background:#f1f5f9;width:30px;height:30px;border-radius:50%;cursor:pointer;font-weight:800;">&times;</button></div>'
            + '<div id="skhDiscSettingsBody"></div></div>';
        document.body.appendChild(m);
    }
    function roleVisibilityToggles() {
        try {
            if (!window.skhGetUserRoles || !skh.currentUser) return '';
            var myRoles = window.skhGetUserRoles(skh.currentUserData || {});
            if (myRoles.length < 2) return '';            // role moja: hakuna cha kuficha
            var u = skh.currentUserData || {};
            var rv = (u.discovery && u.discovery.rolesVisible) || {};
            return '<b style="display:block;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">'
                + tk('disc_roles_vis', 'ONELEVY KA MA ROLES ZANGU') + '</b>'
                + myRoles.map(function (r) {
                    var on = rv[r] !== false;
                    return '<label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px;cursor:pointer;">'
                        + '<input type="checkbox" data-role-toggle="' + r + '" ' + (on ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#1268A8;">'
                        + (window.skhRoleBadge ? window.skhRoleBadge(r) : esc(r)) + '</label>';
                }).join('');
        } catch (e) { return ''; }
    }

    function renderSettings() {
        var host = document.getElementById('skhDiscSettingsBody');
        if (!host) return;
        host.innerHTML =
            tog('findMe', tk('disc_s_findme', 'Niruhusu kupatikana'), tk('disc_s_findme_sub', 'Watu wanaotafuta niwasiliane watakuona. SIMU haitaonyeshwa.'))
            + tog('asBuyer', tk('disc_s_buyer', 'Onelevy kama Mnunuzi'), tk('disc_s_buyer_sub', 'Nionekane kwenye utafutaji wa wanunuzi (Group Buy, Group Order).'))
            + tog('asSeller', tk('disc_s_seller', 'Onelevy kama Muuzaji'), tk('disc_s_seller_sub', 'Nionekane kwenye utafutaji wa wauzaji.'))
            + tog('asBusiness', tk('disc_s_business', 'Onelevy kama Biashara'), tk('disc_s_business_sub', 'Jina la duka/biashara lionekane hadharani.'))
            + tog('showInterests', tk('disc_s_interests', 'Onyesha maslahi yangu'), tk('disc_s_interests_sub', 'Maslahi niliyochagua (mf: "mchele", "viatu") yaonekane.'))
            + roleVisibilityToggles();
    }

    /* ---------- EVENT DELEGATION [FIX 2026-09-19] ----------
       Previously capture true caused three capture listeners (68,72,75) to compete
       and risk intercepting chat-contact. Changed to bubble false + namespace check
       to avoid intercepting unrelated clicks. Only handle if inside discover containers.
    */
    document.addEventListener('click', function (ev) {
        try {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
            if (!b) return;
            var act = b.getAttribute('data-act');
            if (!act || !act.startsWith('disc-')) return;
            // Namespace: only handle if inside chat discover or fab related containers
            // Avoid intercepting if inside product modal or other overlays not discover
            if (act === 'disc-tab') {
                // [R20] kinds za kawaida (people/business/groups) zinadhibitiwa na
                // 72-discover-global.js kuchilia top-refresh; custom kinds pia 72.
                return;
            }
            else if (act === 'disc-contact') window.skhDiscoverContact(b.getAttribute('data-uid'), b.getAttribute('data-name'));
            else if (act === 'disc-close-settings') { var m=document.getElementById('skhDiscSettingsModal'); if(m) m.style.display='none'; }
            else if (act === 'disc-join') { if (window.skhDiscoverJoinGroup) window.skhDiscoverJoinGroup(b.getAttribute('data-gid')); }
            else return;
        } catch (e) {}
    }, false);
    document.addEventListener('change', function (ev) {
        try {
            var inp = ev.target;
            if (!inp) return;
            if (inp.closest && !inp.closest('#skhDiscSettingsModal') && !inp.closest('#chatListModal')) {
                // Only handle settings toggles inside discover settings
                if (!inp.getAttribute || (!inp.getAttribute('data-toggle') && !inp.getAttribute('data-role-toggle'))) return;
            }
            if (inp && inp.getAttribute && inp.getAttribute('data-toggle')) {
                var patch = {}; patch[inp.getAttribute('data-toggle')] = !!inp.checked;
                window.skhSaveDiscovery(patch);
            } else if (inp && inp.getAttribute && inp.getAttribute('data-role-toggle')) {
                window.skhSetRoleVisibility && window.skhSetRoleVisibility(inp.getAttribute('data-role-toggle'), !!inp.checked);
            }
        } catch (e) {}
    }, false);

})();

/* ================================================================
 * R20: DISCOVER = GLOBAL discovery layer (si filter ya Soga row).
 * Panel/panel-in-inbox IMEOLELEZA — overlay ya standalone iko
 * 72-discover-global.js. Engine hii hubaki inbox-free.
 * ================================================================
 * [R19/R20] DISCOVER FAB — "Discover/Gundua Watu" floating button.
 * click → window.skhDiscoverOpen() (global overlay ya Discover).
 * ================================================================ */
(function () {
    if (window.__skhDiscFabBoot) return;
    window.__skhDiscFabBoot = true;

    function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }

    function label() {
        try { return (window.SokoHaiLMS && window.SokoHaiLMS.lang === 'en') ? 'Discover' : 'Gundua'; } catch (e) { return 'Gundua'; }
    }

    function ensureFab() {
        if (document.getElementById('skhDiscFab')) return;
        if (!document.body) return;
        var b = document.createElement('button');
        b.id = 'skhDiscFab';
        b.type = 'button';
        b.setAttribute('aria-label', label() === 'Discover' ? 'Discover people & groups' : 'Gundua watu na vikundi');
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m21 21-4.8-4.8"/></svg><span id="skhDiscFabLabel">' + tk('disc_chip', label()) + '</span>';
        b.addEventListener('click', function () {
            try {
                if (!skh.requireAuth()) return;
                var go = function () { if (window.skhDiscoverOpen) window.skhDiscoverOpen(); };
                if (window.skhDiscoverOpen) { go(); return; }
                var tries = 0;
                var t = setInterval(function () {
                    tries++;
                    if (window.skhDiscoverOpen) { clearInterval(t); go(); }
                    else if (tries > 40) clearInterval(t);
                }, 250);
            } catch (e) {}
        });
        document.body.appendChild(b);
        // Lugha ikibadilika — label ifuatie
        try {
            var LMS = window.SokoHaiLMS;
            if (LMS && !LMS.__skhFabLangHooked) {
                LMS.__skhFabLangHooked = true;
                var orig = LMS.setLanguage.bind(LMS);
                LMS.setLanguage = function (l) {
                    var r = orig(l);
                    try { var el = document.getElementById('skhDiscFabLabel'); if (el) el.textContent = tk('disc_chip', label()); } catch (eL) {}
                    return r;
                };
            }
        } catch (eH) {}
    }

    if (document.readyState !== 'loading') ensureFab();
    else document.addEventListener('DOMContentLoaded', ensureFab);
    setTimeout(ensureFab, 2500);
})();

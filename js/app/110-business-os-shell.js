/* ==== js/app/110-business-os-shell.js ==== */
/* ============================================================================
   SokoHai BUSINESS OS — Shell (Stage 1A)
   ---------------------------------------------------------------------------
   HUU SI mfumo mpya: ni SHELL ya kuonyesha modules zilizopo. Kila kitufe
   kinaita functions zilezile zilizokuwepo:
     • switchDashTab('<tab>')            — 10-dashboard-tabs.js (haijabadilishwa)
     • openStockTransferModal()          — 18-cockpit.js
     • skhOpenAdminControlCenter()       — 98-admin-control-center.js
     • skhOpenKamusi()                   — 71-visual-dictionary.js
     • showForm('businessOSForm')        — POS (05-forms.js)
     • switchMode('buyer')               — Rudi Soko Kuu
     • openNotifications() / openChatList()
   Hakuna tab, action, wala data iliyoondolewa. Model ya urambazaji iko
   shared/business-os-nav-model.mjs (chanzo kimoja, inatumika na tests pia).
   ========================================================================== */
import { skh } from './00-bootstrap.js';
import { BUSINESS_OS_NAV, BUSINESS_OS_ACTIONS, BUSINESS_OS_EXIT, BUSINESS_OS_DEFAULT_TAB, allTabs, groupOfTab, findItem, itemsOfGroup, findAction } from '../../shared/business-os-nav-model.mjs?v=20261103b';

function T(key, en, vars) {
    var s = null;
    try { if (window.t) s = window.t(key, vars); } catch (e) { }
    if (!s || s === key) {
        s = en;
        if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
    }
    return s;
}

/* Hali ya urambazaji: KIKUNDI KIMOJA wazi kwa wakati mmoja (accordion).
   `skh_bos_nav_open_v1` = { open: '<groupId>' | null }
   Ufunguo wa zamani (`..._collapsed_v1`) unasomwa mara moja tu kwa uhamisho,
   kisha unasafishwa — hakuna data ya mtumiaji inayohusika (hali ya UI pekee). */
const OPEN_KEY = 'skh_bos_nav_open_v1';
const COLLAPSE_KEY = 'skh_bos_nav_collapsed_v1';   // legacy (migration only)
const ico = (name, size) => (window.skhNavIcon ? window.skhNavIcon(name, size || 18) : '');
const esc = (v) => (skh && skh.skhEscape ? skh.skhEscape(String(v == null ? '' : v)) : String(v == null ? '' : v));

/* ---------- hali ya kikundi kilicho wazi (kifaa hiki) ---------- */
function readOpenGroup() {
    try {
        const raw = window.localStorage.getItem(OPEN_KEY);
        if (raw) {
            const v = JSON.parse(raw);
            if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'open')) {
                const id = v.open;
                // null = mtumiaji amefunga vikundi vyote kwa makusudi (tunaheshimu)
                if (id === null) return { has: true, open: null };
                if (typeof id === 'string' && BUSINESS_OS_NAV.some(g => g.id === id)) return { has: true, open: id };
                return { has: false, open: null };
            }
        }
        // Uhamisho kutoka hali ya zamani (orodha ya vikundi vilivyokunjwa):
        // kikundi cha kwanza kilichokuwa wazi ndicho kinachobaki wazi.
        const legacy = window.localStorage.getItem(COLLAPSE_KEY);
        if (legacy) {
            const arr = JSON.parse(legacy);
            const first = BUSINESS_OS_NAV.find(g => !Array.isArray(arr) || arr.indexOf(g.id) === -1);
            window.localStorage.removeItem(COLLAPSE_KEY);
            return { has: !!first, open: first ? first.id : null };
        }
    } catch (e) { }
    return { has: false, open: null };
}
function writeOpenGroup(id) {
    try { window.localStorage.setItem(OPEN_KEY, JSON.stringify({ open: id || null })); } catch (e) { }
}

/* Kikundi kinachopaswa kuwa wazi: kilichohifadhiwa → kikundi cha tab hai → cha kwanza. */
function resolveOpenGroup() {
    const saved = readOpenGroup();
    if (saved.has) return saved.open;
    const activeGroup = groupOfTab(window.activeDashboardTab || BUSINESS_OS_DEFAULT_TAB);
    if (activeGroup) return activeGroup;
    return BUSINESS_OS_NAV.length ? BUSINESS_OS_NAV[0].id : null;
}

/* ---------- maelezo ya mtumiaji (halisi, si ya kubuni) ---------- */
function viewerInfo() {
    const user = skh.currentUser || {};
    const data = skh.currentUserData || {};
    const uid = user.uid || '';
    const ownerUid = data.shopOwnerUid || '';
    const isOwner = !ownerUid || ownerUid === uid;
    let mode = '';
    let level = '';
    try {
        const ctx = (typeof window.skhResolveBusinessContext === 'function') ? window.skhResolveBusinessContext() : null;
        if (ctx) {
            mode = (ctx.sellerMode && ctx.sellerMode.mode) || ctx.sellerMode || '';
            if (typeof mode === 'object') mode = mode.mode || '';
            // Level huonyeshwa TU ikiwa mtumiaji ameiweka mwenyewe (hakuna default ya kubuni)
            const explicitLevel = data.managementLevel
                || (data.management && data.management.level)
                || (typeof mode === 'object' && mode.level)
                || (ctx.management && ctx.management.source && ctx.management.source !== 'canonical-default' ? ctx.management.level : '');
            level = explicitLevel || '';
        }
    } catch (e) { }
    const modeLabel = { ONLINE: 'Online', OFFLINE: 'Dukani', HYBRID: 'Mseto', MANAGE_ONLY: 'Usimamizi' }[mode] || '';
    const levelLabel = { BASIC: 'Msingi', PARTIAL: 'Kiasi', FULL: 'Kamili' }[level] || '';
    return {
        name: data.shopName || data.businessName || user.displayName || data.name || (user.email ? String(user.email).split('@')[0] : 'Mmiliki'),
        email: user.email || '',
        roleLabel: isOwner ? T('bos_role_owner', 'Mmiliki') : T('bos_role_staff', 'Mfanyakazi'),
        modeLabel,
        levelLabel,
        photoURL: data.photoURL || user.photoURL || ''
    };
}

/* ---------- markup ---------- */
function navItemHtml(item, groupId) {
    const key = item.action ? ('act_' + item.action + (item.arg ? '_' + item.arg : '')) : String(item.tab || '');
    const label = T('bos_nav_' + key, item.label);
    // Jina la Kiingereza linakuwa tooltip (title) — si mstari wa pili unaorudia
    // jina lilelile baada ya tafsiri ya wakati wa kuonyesha.
    const title = item.labelEn && item.labelEn !== label ? label + ' — ' + item.labelEn : label;
    const search = (label + ' ' + (item.labelEn || '')).toLowerCase();
    const icoHtml = '<span class="bos-nav-ico">' + ico(item.icon, 17) + '</span>'
        + '<span class="bos-nav-text"><b>' + esc(label) + '</b></span>';
    if (item.tab) {
        // tab + action (hiari): kwanza switchDashTab, kisha modal/panel.
        const click = item.action
            ? 'window.skhBOSNav(\'' + item.tab + '\',\'' + item.action + '\'' + (item.arg ? ',\'' + item.arg + '\'' : '') + ')'
            : 'window.switchDashTab(\'' + item.tab + '\')';
        return '<button type="button" id="btnTab_' + item.tab + '" class="ct-sidebar-menu-btn side-menu-link bos-nav-item"'
            + ' title="' + esc(title) + '" aria-label="' + esc(title) + '"'
            + ' data-bos-tab="' + esc(item.tab) + '" data-bos-group="' + esc(groupId) + '" data-bos-search="' + esc(search) + '"'
            + ' onclick="' + click + '">' + icoHtml + '</button>';
    }
    return '<button type="button" class="ct-sidebar-menu-btn bos-nav-item bos-nav-action"'
        + ' title="' + esc(title) + '" aria-label="' + esc(title) + '"'
        + ' data-bos-action="' + esc(item.action) + '"' + (item.arg ? ' data-bos-arg="' + esc(item.arg) + '"' : '')
        + ' data-bos-group="' + esc(groupId) + '" data-bos-search="' + esc(search) + '"'
        + ' onclick="window.skhBOSRunAction(\'' + item.action + '\'' + (item.arg ? ',\'' + item.arg + '\'' : '') + ')">'
        + icoHtml + '</button>';
}

function groupHtml(group, openGroupId) {
    const collapsed = group.id !== openGroupId;   // ACCORDION: kimoja tu wazi
    let itemsHtml;
    if (Array.isArray(group.subgroups) && group.subgroups.length) {
        // Sub-moduli zina lebo zao (A/B/C) — zinaonekana MODULI KUU vs SUBMODULI.
        itemsHtml = group.subgroups.map(sg =>
            '<div class="bos-nav-subgroup" data-bos-subgroup="' + esc(sg.id) + '">'
            + '<div class="bos-nav-sub-title">' + esc(T('bos_sub_' + sg.id, sg.label)) + '</div>'
            + sg.items.map(i => navItemHtml(i, group.id)).join('')
            + '</div>').join('');
    } else {
        itemsHtml = itemsOfGroup(group).map(i => navItemHtml(i, group.id)).join('');
    }
    return '<section class="bos-nav-group' + (collapsed ? ' is-collapsed' : '') + '" data-bos-group="' + group.id + '">'
        + '<button type="button" class="bos-nav-group-btn" data-bos-group-toggle="' + group.id + '"'
        + ' aria-expanded="' + (collapsed ? 'false' : 'true') + '" aria-controls="bosGroup_' + group.id + '"'
        + ' onclick="window.skhBOSToggleGroup(\'' + group.id + '\', event)">'
        + '<span class="bos-nav-group-num" aria-hidden="true">' + esc(String(group.num || '')) + '</span>'
        + '<span class="bos-nav-group-ico">' + ico(group.icon, 15) + '</span>'
        + '<span class="bos-nav-group-title-text">' + esc(T('bos_group_' + group.id, group.label)) + '</span>'
        + '<span class="bos-nav-chevron" aria-hidden="true">' + ico('arrow-right', 14) + '</span>'
        + '</button>'
        + '<div class="bos-nav-group-items" id="bosGroup_' + group.id + '" role="group" aria-label="' + esc(group.label) + '">' + itemsHtml + '</div>'
        + '</section>';
}

/**
 * Shell kamili: sidebar + header + workspace (#dashWorkspace).
 * Inarudisha HTML; `initShell()` huitwa baada ya kuwekwa kwenye DOM.
 */
function renderShell() {
    const openGroupId = resolveOpenGroup();
    const v = viewerInfo();
    const modeChips = [v.modeLabel, v.levelLabel].filter(Boolean)
        .map(l => '<span class="bos-chip">' + esc(l) + '</span>').join('');

    const actions = BUSINESS_OS_ACTIONS.map(a =>
        '<button type="button" class="ct-sidebar-menu-btn bos-nav-item bos-nav-action' + (a.primary ? ' is-primary' : '') + '"'
        + ' data-bos-action="' + esc(a.action) + '" data-bos-search="' + esc((a.label + ' ' + (a.labelEn || '')).toLowerCase()) + '"'
        + ' onclick="window.skhBOSRunAction(\'' + a.action + '\')">'
        + '<span class="bos-nav-ico">' + ico(a.icon, 17) + '</span>'
        + '<span class="bos-nav-text"><b>' + esc(T('bos_action_' + a.action, a.label)) + '</b></span>'
        + '</button>').join('');

    return ''
        + '<div class="control-tower-wrapper bos-shell">'
        /* ---------------- SIDEBAR ---------------- */
        + '  <aside class="ct-sidebar bos-nav" id="bosSidebar" aria-label="' + esc(T('bos_nav_label', 'Business OS navigation')) + '">'
        + '    <div class="ct-sidebar-brand bos-nav-brand">'
        + '      <div class="bos-brand-mark">S</div>'
        + '      <div class="ct-sidebar-brand-text">'
        + '        <h3>SOKOHAI</h3>'
        + '        <span>' + esc(T('bos_brand_sub', 'Business OS')) + '</span>'
        + '      </div>'
        + '      <button type="button" class="bos-nav-close" onclick="window.skhCloseDashboardSidebar()" aria-label="' + esc(T('bos_close', 'Funga menyu')) + '">' + ico('x', 18) + '</button>'
        + '    </div>'
        + '    <div class="bos-nav-scroll-wrap">'
        + '      <div class="bos-nav-scroll" id="bosNavScroll">'
        + BUSINESS_OS_NAV.map(g => { try { return groupHtml(g, openGroupId); } catch (e) { console.warn('[BOS] kikundi kimeshindikana:', g && g.id, e && e.message); return ''; } }).join('')
        + '      </div>'
        + '      <button type="button" class="bos-nav-scroll-hint" id="bosNavScrollHint" aria-label="' + esc(T('bos_more_below', 'Kuna moduli zaidi chini — skroli')) + '" title="' + esc(T('bos_more_below', 'Kuna moduli zaidi chini — skroli')) + '" onclick="window.skhBOSScrollNav(1, event)">'
        + '        <span>' + esc(T('bos_more_below_short', 'Zaidi')) + '</span>' + ico('arrow-right', 13)
        + '      </button>'
        + '    </div>'
        + '    <div class="bos-nav-footer">'
        + actions
        + '      <button type="button" class="ct-sidebar-menu-btn bos-nav-item bos-nav-exit" data-bos-action="' + BUSINESS_OS_EXIT.action + '" onclick="window.skhBOSRunAction(\'' + BUSINESS_OS_EXIT.action + '\')">'
        + '        <span class="bos-nav-ico">' + ico(BUSINESS_OS_EXIT.icon, 17) + '</span>'
        + '        <span class="bos-nav-text"><b>' + esc(T('bos_exit', BUSINESS_OS_EXIT.label)) + '</b></span>'
        + '      </button>'
        + '    </div>'
        + '  </aside>'
        /* ---------------- MAIN ---------------- */
        + '  <div class="ct-main-content bos-main">'
        + '    <header class="ct-header-bar bos-header">'
        + '      <div class="bos-header-left">'
        + '        <button type="button" class="ct-menu-toggle-btn bos-menu-btn" onclick="window.toggleDashboardSidebar()" aria-label="' + esc(T('bos_menu', 'Fungua menyu')) + '">' + ico('menu', 22) + '</button>'
        + '        <div class="bos-header-title">'
        + '          <b id="bosHeaderTitle">' + esc(T('bos_home_title', 'Dashibodi Kuu')) + '</b>'
        + '          <small id="bosHeaderSub">' + esc(T('bos_home_sub', 'Muhtasari wa biashara kwa muda halisi')) + '</small>'
        + '        </div>'
        + '        <div class="ct-header-search bos-header-search">'
        + '          ' + ico('search', 15)
        + '          <input type="search" id="bosNavSearch" autocomplete="off" placeholder="' + esc(T('bos_search', 'Tafuta moduli...')) + '" aria-label="' + esc(T('bos_search', 'Tafuta moduli...')) + '" oninput="window.skhBOSFilterNav(this.value)">'
        + '        </div>'
        + '      </div>'
        + '      <div class="ct-header-actions bos-header-actions">'
        + '        <button type="button" class="ct-pos-btn bos-pos-btn" onclick="window.skhBOSRunAction(\'openPos\')">' + ico('calculator', 15) + '<span>POS</span></button>'
        + '        <button type="button" class="bos-icon-btn" onclick="if(window.openNotifications)window.openNotifications()" aria-label="' + esc(T('bos_notifications', 'Taarifa')) + '">'
        + ico('bell', 19) /* idadi ya taarifa: hakuna chanzo halisi kwa Business OS, hivyo
           badge haina namba ya kubuni; itaonekana tu ikiwekwa namba halisi. */
        + '<span class="bos-notif-badge" id="ctHeaderNotifBadge"></span></button>'
        + '        <button type="button" class="bos-icon-btn" onclick="if(window.openChatList)window.openChatList()" aria-label="' + esc(T('bos_chat', 'Gumzo')) + '">' + ico('chat', 19) + '</button>'
        + '        <div class="bos-user">'
        + '          <div class="bos-user-meta">'
        + '            <b>' + esc(v.name) + '</b>'
        + '            <small>' + esc(v.roleLabel) + '</small>'
        + '          </div>'
        + (v.photoURL
            ? '<img src="' + esc(v.photoURL) + '" alt="" class="bos-user-avatar">'
            : '<div class="bos-user-avatar bos-user-avatar--text">' + esc(String(v.name).slice(0, 1).toUpperCase()) + '</div>')
        + '        </div>'
        + (modeChips ? '<div class="bos-chips">' + modeChips + '</div>' : '')
        + '      </div>'
        + '    </header>'
        /* data-skh-ad-protected: badges za matangazo za mfumo wa soko hazimounti
           ndani ya Business OS (mechanism iliyopo kwenye 103-ad-badges.js). */
        + '    <main class="ct-workspace bos-workspace" id="dashWorkspace" data-skh-ad-protected="true" tabindex="-1">'
        + '      <div class="bos-loading">' + esc(T('bos_loading', 'Inapakia dashibodi...')) + '</div>'
        + '    </main>'
        + '  </div>'
        + '</div>';
}

/* ---------- tab measures ---------- */
const TAB_META = {
    overview: { title: 'Dashibodi Kuu', sub: 'Muhtasari wa biashara kwa muda halisi' },
    my_products: { title: 'Bidhaa Zangu', sub: 'Orodha na udhibiti wa bidhaa zako' },
    product_analytics: { title: 'Uchambuzi wa Bidhaa', sub: 'Namba za bidhaa zako' },
    product_performance: { title: 'Utendaji wa Bidhaa', sub: 'Bidhaa zinazouzwa zaidi' },
    sales_insights: { title: 'Maarifa ya Mauzo', sub: 'Mwenendo wa mauzo' },
    demand_insights: { title: 'Mahitaji ya Soko', sub: 'Kile soko linahitaji' },
    product_compare: { title: 'Linganisha Bidhaa', sub: 'Fananisha bidhaa kwa namba' },
    inventory: { title: 'Stoo & Hifadhi', sub: 'Hali ya stoo na uhamishaji' },
    expenses: { title: 'Matumizi & Gharama', sub: 'Mapato, matumizi na madeni (General Ledger: haijajengwa)' },
    staff: { title: 'Wafanyakazi & Mishahara', sub: 'Timu, mahudhurio na mishahara' },
    settings: { title: 'Mipangilio ya Mfumo', sub: 'Usanidi wa duka na biashara' },
    bookings: { title: 'Maombi ya Usafirishaji', sub: 'Maombi mapya ya usafirishaji' },
    trips: { title: 'Safari Zinazoendelea', sub: 'Safari zilizo hai' },
    tracking: { title: 'Ufuatiliaji', sub: 'Ramani ya moja kwa moja' },
    drivers: { title: 'Madereva / Mawakala', sub: 'Orodha ya wasafirishaji' },
    fleet: { title: 'Vyombo', sub: 'Hali ya magari na vyombo' },
    cargo: { title: 'Kituo cha Tokeni', sub: 'Tokeni za mizigo (SokoPay)' },
    finance: { title: 'Matumizi ya Safari', sub: 'Mafuta, ukarabati na gharama' },
    analytics: { title: 'Takwimu za Usafirishaji', sub: 'Utendaji wa safari' },
    pos_page: { title: 'POS — Mauzo ya Dukani', sub: 'Kituo cha miamala cha duka' }
};

function setHeader(tab) {
    const meta = TAB_META[tab];
    const title = document.getElementById('bosHeaderTitle');
    const sub = document.getElementById('bosHeaderSub');
    if (title && meta) title.textContent = T('bos_head_' + tab, meta.title);
    if (sub && meta) sub.textContent = T('bos_sub_' + tab, meta.sub);
}

/* ---------- accordion: weka kikundi kimoja wazi (au hakuna) ---------- */
function applyOpenGroup(id) {
    const nav = document.getElementById('bosSidebar');
    if (!nav) return;
    try { watchBuyerChrome(); } catch (e) { }
    nav.querySelectorAll('.bos-nav-group').forEach(g => {
        const open = !!id && g.getAttribute('data-bos-group') === id;
        g.classList.toggle('is-collapsed', !open);
        const toggle = g.querySelector('[data-bos-group-toggle]');
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    updateScrollHint();
}

/* ---------- ishara ya scroll (inapohitajika tu) ---------- */
function updateScrollHint() {
    const nav = document.getElementById('bosSidebar');
    const sc = document.getElementById('bosNavScroll');
    if (!nav || !sc) return;
    const max = sc.scrollHeight - sc.clientHeight;
    const scrollable = max > 4;
    const atBottom = sc.scrollTop >= max - 4;
    const atTop = sc.scrollTop <= 4;
    nav.classList.toggle('is-scrollable', scrollable);
    nav.classList.toggle('has-more-below', scrollable && !atBottom);
    nav.classList.toggle('has-more-above', scrollable && !atTop);
}

/* Skroli ya menyu kwa mwelekeo: +1 chini, -1 juu (kitufe cha ishara na keyboard). */
function scrollNav(dir, ev) {
    // Vivyo hivyo: ishara ya scroll haifungui drawer ya simu.
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    const sc = document.getElementById('bosNavScroll');
    if (!sc) return;
    const step = Math.max(120, Math.round(sc.clientHeight * 0.6));
    try { sc.scrollBy({ top: dir * step, behavior: 'smooth' }); }
    catch (e) { sc.scrollTop = sc.scrollTop + dir * step; }
}

/* ---------- active state (vikundi + kitufe) ---------- */
let __bosLastActiveTab = null;

function currentOpenGroupId(nav) {
    const open = nav.querySelector('.bos-nav-group:not(.is-collapsed)');
    return open ? open.getAttribute('data-bos-group') : null;
}

/* Ondoa alama zote za "active" (tab na action) kabla ya kuweka mpya. */
function clearActiveMarks(nav) {
    nav.querySelectorAll('.bos-nav-item.is-active').forEach(el => {
        el.classList.remove('is-active');
        el.removeAttribute('aria-current');
    });
}

/* `autoOpen` (default true): kikundi cha ukurasa unaotumika kinafunguka.
   Wakati wa kuchora upya (re-render) tunaipitisha false ili uchaguzi wa
   mtumiaji (kikundi alichokifungua mwenyewe) usifutwe. */
function syncActive(tab, autoOpen) {
    const nav = document.getElementById('bosSidebar');
    if (!nav) return;
    const allowOpen = autoOpen !== false;
    clearActiveMarks(nav);
    const btn = document.getElementById('btnTab_' + tab);
    if (btn) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-current', 'page');
        const groupId = groupOfTab(tab);
        if (groupId) {
            const openNow = currentOpenGroupId(nav);
            const navigating = allowOpen && tab !== __bosLastActiveTab;
            // Fungua kikundi cha ukurasa huu: (a) hakuna kilichowazi,
            // (b) mtumiaji amebadilisha ukurasa (navigation halisi).
            if (!openNow || navigating) {
                applyOpenGroup(groupId);
                writeOpenGroup(groupId);
            }
            const group = nav.querySelector('[data-bos-group="' + groupId + '"]');
            if (group) group.classList.add('has-active');
        }
    }
    nav.querySelectorAll('.bos-nav-group.has-active').forEach(g => {
        if (!g.querySelector('.bos-nav-item.is-active')) g.classList.remove('has-active');
    });
    __bosLastActiveTab = tab;
    setHeader(tab);
    updateScrollHint();
}

/* ---------- actions ---------- */
/* Kila action inaita function ILIYOKUWEPO. `arg` ni hiari (mf. tab ya kituo
   cha udhibiti) — haiathiri wito wa zamani ambao haukuwa na arg. */
const ACTIONS = {
    openStockTransferModal: () => { if (typeof window.openStockTransferModal === 'function') return window.openStockTransferModal(); throw new Error('openStockTransferModal haipo'); },
    openOfflineStockModal: () => { if (typeof window.openOfflineStockModal === 'function') return window.openOfflineStockModal(); throw new Error('openOfflineStockModal haipo'); },
    openProcurementModal: () => { if (typeof window.openProcurementModal === 'function') return window.openProcurementModal(); throw new Error('openProcurementModal haipo'); },
    skhOpenAdminControlCenter: (arg) => { if (typeof window.skhOpenAdminControlCenter === 'function') return window.skhOpenAdminControlCenter(arg || 'overview'); throw new Error('skhOpenAdminControlCenter haipo'); },
    skhOpenKamusi: () => { if (typeof window.skhOpenKamusi === 'function') return window.skhOpenKamusi(); throw new Error('skhOpenKamusi haipo'); },
    openPos: () => { if (typeof window.showForm === 'function') return window.showForm('businessOSForm'); throw new Error('showForm haipo'); },
    switchModeBuyer: () => { if (typeof window.switchMode === 'function') return window.switchMode('buyer'); throw new Error('switchMode haipo'); }
};

/* Alama ya "umegusa" kwa kitufe cha action (hali ya UI pekee). */
function markActionActive(name, arg, el) {
    const nav = document.getElementById('bosSidebar');
    if (!nav) return;
    nav.querySelectorAll('.bos-nav-action.is-active').forEach(x => { x.classList.remove('is-active'); x.removeAttribute('aria-current'); });
    let btn = el;
    if (!btn) {
        btn = arg
            ? nav.querySelector('.bos-nav-action[data-bos-action="' + name + '"][data-bos-arg="' + arg + '"]')
            : nav.querySelector('.bos-nav-action[data-bos-action="' + name + '"]');
    }
    if (btn) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-current', 'true');
        const gid = btn.getAttribute('data-bos-group');
        if (gid) {
            const group = nav.querySelector('[data-bos-group="' + gid + '"]');
            if (group) group.classList.add('has-active');
        }
    }
}

/* [REPAIR 2026-11-04] Kosa la action LISIONEKANE KIMYA.
   Kabla: `catch (e) { console.warn(...) }` — mtumiaji hakiona chochote na
   promise rejection (switchMode ni async) haikamatwi kabisa. Sasa: console +
   toast inayoonekana, na makosa ya async yanakamatwa. */
function reportActionError(name, e) {
    const msg = (e && (e.message || e.code)) || String(e || '');
    console.warn('[BOS] action imeshindikana:', name, msg);
    const text = T('bos_action_failed', 'Kitendo hiki hakikufanikiwa') + (msg ? ': ' + msg : '');
    try {
        if (typeof window.skhToast === 'function') { window.skhToast(text, 'error', 6000); return; }
    } catch (err) { }
    try { alert(text); } catch (err2) { }
}

function runAction(name, arg) {
    const fn = ACTIONS[name];
    if (!fn) { console.warn('[BOS] action isiyojulikana:', name); return; }
    // Kikundi cha action kifunguke (hali ya sidebar).
    try {
        const item = findAction(name, arg);
        let gid = null;
        if (item) {
            const g = BUSINESS_OS_NAV.find(x => itemsOfGroup(x).indexOf(item) !== -1);
            gid = g ? g.id : null;
        }
        if (gid) {
            const nav = document.getElementById('bosSidebar');
            if (nav) {
                const openNow = currentOpenGroupId(nav);
                if (!openNow || openNow !== gid) { applyOpenGroup(gid); writeOpenGroup(gid); }
            }
        }
    } catch (e) { }
    try { markActionActive(name, arg); } catch (e) { }
    let out;
    try { out = fn(arg); }
    catch (e) { return reportActionError(name, e); }
    if (out && typeof out.then === 'function') return out.catch(e => reportActionError(name, e));
    return out;
}

/* tab + action kwa mpigo (item yenye zote mbili). */
function navGo(tab, action, arg) {
    try { if (typeof window.switchDashTab === 'function') window.switchDashTab(tab); } catch (e) { }
    if (action) return runAction(action, arg);
}

/* ---------- kikundi: kufungua / kufunga (ACCORDION — kimoja tu wazi) ----------
   Kubonyeza kichwa cha kikundi HAKUNA navigation: kinaonyesha au kinaficha
   sub-buttons zake pekee. Sub-button ndiyo inayobadilisha ukurasa. */
function toggleGroup(id, ev) {
    // MUHIMU (simu/tablet): 18-cockpit.js ina click listener kwenye `document`
    // unaofunga drawer kwa KILA kitufe kisicho na class `side-menu-link`.
    // Kichwa cha kikundi ni kitufe cha kufungua sub-buttons — si navigation —
    // hivyo kinazuia tukio lisifike kwenye listener huyo; la sivyo drawer
    // inafungwa na mtumiaji haoni sub-buttons zilizofunguliwa.
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    const nav = document.getElementById('bosSidebar');
    if (!nav) return;
    const group = nav.querySelector('[data-bos-group="' + id + '"]');
    if (!group) return;
    const willOpen = group.classList.contains('is-collapsed');
    applyOpenGroup(willOpen ? id : null);
    writeOpenGroup(willOpen ? id : null);
    // Kitufe kilichogusa kikundi kionekane (mf. kikundi cha mwisho)
    if (willOpen) {
        try {
            const sc = document.getElementById('bosNavScroll');
            const gb = group.getBoundingClientRect();
            const sb = sc.getBoundingClientRect();
            if (gb.bottom > sb.bottom) sc.scrollTop += (gb.bottom - sb.bottom) + 8;
            else if (gb.top < sb.top) sc.scrollTop -= (sb.top - gb.top) + 8;
        } catch (e) { }
    }
    updateScrollHint();
}

/* ---------- tafuta moduli ---------- */
function filterNav(query) {
    const q = String(query || '').trim().toLowerCase();
    const nav = document.getElementById('bosSidebar');
    if (!nav) return;
    let visible = 0;
    nav.querySelectorAll('.bos-nav-group').forEach(group => {
        let groupHits = 0;
        group.querySelectorAll('.bos-nav-item').forEach(item => {
            const hay = item.getAttribute('data-bos-search') || item.textContent.toLowerCase();
            const hit = !q || hay.indexOf(q) !== -1;
            item.classList.toggle('is-filtered-out', !hit);
            if (hit) groupHits++;
        });
        const groupTitle = (group.querySelector('.bos-nav-group-title-text') || {}).textContent || '';
        const titleHit = !!q && groupTitle.toLowerCase().indexOf(q) !== -1;
        group.classList.toggle('is-filtered-out', q ? (groupHits === 0 && !titleHit) : false);
        if (q && (groupHits > 0 || titleHit)) {
            group.classList.remove('is-collapsed');
            const toggle = group.querySelector('[data-bos-group-toggle]');
            if (toggle) toggle.setAttribute('aria-expanded', 'true');
        }
        visible += groupHits;
    });
    nav.classList.toggle('is-searching', !!q);
    // Baada ya kutafuta: rudi kwenye accordion (kikundi kimoja wazi)
    if (!q) applyOpenGroup(resolveOpenGroup());
    const empty = document.getElementById('bosNavEmpty');
    if (empty) empty.style.display = (q && visible === 0) ? 'block' : 'none';
    updateScrollHint();
}

/* ---------- init ---------- */
/* ============================================================================
   [REPAIR 2026-11-04] CHROME YA SOKO KUU ISIINGILIANE NA BUSINESS OS
   ----------------------------------------------------------------------------
   `81-absolute-one-ui-live.css` + `61-full-system-repair.js` hurudisha upau wa
   chini wa mnunuzi (`.bottom-area-wrapper` pamoja na FAB ya "+") kila baada ya
   muda. Upau huo ni `position:fixed` (z-index 4000–6900), hivyo ulifunika
   sehemu ya chini ya workspace ya Business OS — vitufe na mistari ya majedwali
   vilifichwa.

   Hapa tunausimamia kwa HALI HALISI: unaonekana tu pale dashboardViews
   inavyoonekana. `61-full-system-repair.js` ina latch kwenye `isDashboardMode()`
   (`body.classList.contains('skh-mode-dashboard')`) hivyo `body.skh-mode-buyer`
   hairejelei baada ya kuingia dashboard; kwa kupima kuonekana kwa dashboardViews
   badala ya class ya body, Soko Kuu (buyer) HAUATHIRIKI.
   ========================================================================== */
function syncBuyerChrome() {
    try {
        const ftr = document.querySelector('.bottom-area-wrapper');
        const dv = document.getElementById('dashboardViews');
        if (!ftr || !dv) return;
        const dashVisible = getComputedStyle(dv).display !== 'none';
        const bosMounted = !!document.querySelector('.bos-shell');
        /* `css/01-core.css` ina `.bottom-area-wrapper { display:flex !important }`,
           hivyo inline style haitoshi — tunaweka alama kwenye body na CSS yetu
           (52-business-os-shell.css §4.9) ndiyo inayoficha kwa specificity kubwa. */
        const body = document.body;
        if (dashVisible && bosMounted) {
            if (body.dataset.bosChrome !== 'hide') body.dataset.bosChrome = 'hide';
        } else if (body.dataset.bosChrome === 'hide') {
            delete body.dataset.bosChrome;
        }
    } catch (e) { }
}

function watchBuyerChrome() {
    syncBuyerChrome();
    if (window.__bosChromeObs) return;
    try {
        const obs = new MutationObserver(function () { syncBuyerChrome(); });
        const dv = document.getElementById('dashboardViews');
        if (dv) obs.observe(dv, { attributes: true, attributeFilter: ['style', 'class'] });
        // Upau wenyewe: modules nyingine huuweka `display:flex` upya (style attribute),
        // hivyo tunausikiliza pia ili usiingiliane na Business OS.
        const ftr = document.querySelector('.bottom-area-wrapper');
        if (ftr) obs.observe(ftr, { attributes: true, attributeFilter: ['style', 'class'] });
        obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-mode'] });
        window.__bosChromeObs = obs;
    } catch (e) { }
}

function initShell() {
    // Huitwa kila shell inapochorwa upya (mf. baada ya kuhifadhi mipangilio),
    // kwa hiyo hakuna flag ya "mara moja" hapa — ni idempotent.
    const nav = document.getElementById('bosSidebar');
    if (!nav) return;

    // Skroli: ishara ya scroll + kuhakikisha eneo la menyu linaskroli kikamilifu.
    const sc = document.getElementById('bosNavScroll');
    if (sc && !sc.dataset.bosScrollBound) {
        sc.addEventListener('scroll', updateScrollHint, { passive: true });
        sc.dataset.bosScrollBound = '1';
        // Ukubwa hubadilika (drawer ya simu, rotation, accordion) — husasisha ishara.
        if (typeof ResizeObserver === 'function') {
            try {
                if (window.__bosScrollRO) { try { window.__bosScrollRO.disconnect(); } catch (e) { } }
                window.__bosScrollRO = new ResizeObserver(function () { updateScrollHint(); });
                window.__bosScrollRO.observe(sc);
                const wrap = sc.parentElement;
                if (wrap) window.__bosScrollRO.observe(wrap);
            } catch (e) { }
        }
    }
    if (!window.__bosResizeBound) {
        window.addEventListener('resize', function () { try { updateScrollHint(); } catch (e) { } });
        window.__bosResizeBound = true;
    }
    // Vikundi vyote: accordion (kimoja wazi) — huwekwa upya kila render.
    applyOpenGroup(resolveOpenGroup());
    updateScrollHint();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(updateScrollHint);

    // Tab ya kwanza: ile iliyokuwa hai, la sivyo `overview`.
    // autoOpen=false → kikundi alichokifungua mtumiaji mwenyewe kinabaki wazi.
    const active = window.activeDashboardTab || BUSINESS_OS_DEFAULT_TAB;
    syncActive(active, false);

    // switchDashTab ileile ya mfumo — tunaifunika (additive) ili hali ya sidebar
    // na kichwa cha ukurasa vibaki sawa. Hakuna tab logic inayobadilishwa.
    if (typeof window.switchDashTab === 'function' && !window.__bosSwitchWrapped) {
        const previous = window.switchDashTab;
        window.switchDashTab = function (tabName) {
            const out = previous.apply(this, arguments);
            try { syncActive(tabName); } catch (e) { }
            return out;
        };
        window.__bosSwitchWrapped = true;
    }

    // Esc hufunga drawer kwenye simu (accessibility)
    if (!window.__bosEscBound) {
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') window.skhCloseDashboardSidebar();
        });
        window.__bosEscBound = true;
    }
}

/* ---------- public API ---------- */
window.skhBOS = {
    build: '2026-11-03b',
    renderShell,
    initShell,
    syncActive,
    setHeader,
    runAction,
    toggleGroup,
    applyOpenGroup,
    scrollNav,
    updateScrollHint,
    filterNav,
    navModel: BUSINESS_OS_NAV,
    meta: TAB_META,
    tabs: allTabs()
};
window.skhBOSsyncBuyerChrome = syncBuyerChrome; /* kwa vipimo/tests */
window.skhBOSToggleGroup = toggleGroup;
window.skhBOSScrollNav = scrollNav;
window.skhBOSRunAction = runAction;
window.skhBOSNav = navGo;
window.skhBOSFilterNav = filterNav;

window.skhRenderBusinessOSShell = function (container) {
    if (!container) return false;
    container.innerHTML = renderShell();
    initShell();
    return true;
};

// Kama shell itawekwa baadaye (mf. re-render), sync inaendelea kufanya kazi.
window.addEventListener('skh:bos-shell-ready', function () { try { initShell(); } catch (e) { } });

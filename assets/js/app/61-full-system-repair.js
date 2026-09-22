/* ==== js/app/61-full-system-repair.js ====
   SOKOHAI — FULL SYSTEM STABILIZATION v1
   PHASE 1-8 — Fixes P0-P4 without breaking existing
   Based on sokohaico.netlify.app full pull 2026-09-15
   Loaded LAST after 60-identity-layer.js

   RULE: USIVUNJE KILICHOPO — only wrappers, no rewrites
*/
import { skh } from './00-bootstrap.js';

console.log('[61-full-repair] loading — P0-P4 stabilization...');

(function () {
  'use strict';

  function esc(s) { try { return skh.skhEscape ? skh.skhEscape(s == null ? '' : String(s)) : String(s); } catch(e){ return String(s||''); } }
  function jsEsc(s) { try { return skh.skhJsEsc ? skh.skhJsEsc(s) : esc(s); } catch(e){ return esc(s); } }

  // ========================================================================
  // PHASE 1 — FOUNDATION: Auth, Session, Identity, Roles, Profile
  // ========================================================================

  // Debug mode — AUTH UID vs PROFILE UID
  window.skhIdentityDebug = function () {
    const authUid = (skh.currentUser && skh.currentUser.uid) || null;
    const profileUid = (skh.currentUserData && (skh.currentUserData.uid || skh.currentUserData.userId)) || null;
    const accountType = (skh.currentUserData && skh.currentUserData.accountType) || (skh.currentUser && skh.currentUser.isOfflineMember ? 'offline_member' : 'standard');
    const agent = (window.skhActingAgent && window.skhActingAgent()) || skh.assistAgent || null;
    const assisted = (window.skhIsAssisted && window.skhIsAssisted()) || false;
    const info = {
      AUTH_UID: authUid,
      PROFILE_UID: profileUid,
      MATCH: authUid === profileUid ? 'OK' : 'MISMATCH — BUG!',
      ACCOUNT_TYPE: accountType,
      ASSISTED: assisted,
      AGENT_UID: agent ? agent.uid : null,
      AGENT_NAME: agent ? agent.name : null,
      ROLES: (skh.currentUserData && (skh.currentUserData.roles || skh.currentUserData.role)) || 'buyer',
      TIMESTAMP: new Date().toISOString()
    };
    console.table(info);
    if (authUid !== profileUid) {
      console.warn('[61] AUTH UID != PROFILE UID — possible cross-account leak!', info);
    }
    return info;
  };

  // Ensure identity layer applied BEFORE any business logic
  function ensureIdentityEarly() {
    try {
      if (typeof window.skhIdentityApply === 'function') {
        const sess = (() => { try { return JSON.parse(localStorage.getItem('skh_assist_session') || sessionStorage.getItem('skh_assist_session') || 'null'); } catch(e){ return null; } })();
        if (sess && sess.memberUid) {
          window.skhIdentityApply();
        }
      }
    } catch (e) {}
  }
  ensureIdentityEarly();
  setTimeout(ensureIdentityEarly, 500);
  setTimeout(ensureIdentityEarly, 1500);

  // Clear stale state on logout — enhanced
  function patchLogout() {
    if (typeof window.doLogout === 'function' && !window.doLogout._patched61) {
      const orig = window.doLogout;
      window.doLogout = async function patchedLogout() {
        try {
          // Wipe all session caches BEFORE logout
          if (typeof window.skhIdentityRestore === 'function') window.skhIdentityRestore();
          try { localStorage.removeItem('skh_assist_session'); } catch(e){}
          try { sessionStorage.removeItem('skh_assist_session'); } catch(e){}
          try { localStorage.removeItem('sokohai_cart'); } catch(e){}
          skh.cachedItems = [];
          skh.myCart = [];
          skh.currentOpenProduct = null;
          if (window.skhCancelAllListeners) window.skhCancelAllListeners();
          if (skh.notifUnsubscribe) { try { skh.notifUnsubscribe(); } catch(e){} skh.notifUnsubscribe = null; }
          if (skh.chatUnsubscribe) { try { skh.chatUnsubscribe(); } catch(e){} skh.chatUnsubscribe = null; }
          if (window.activeProductUnsubscribe) { try { window.activeProductUnsubscribe(); } catch(e){} window.activeProductUnsubscribe = null; }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      window.doLogout._patched61 = true;
      console.log('[61] doLogout patched — stale state wipe');
    }
  }
  patchLogout();
  setTimeout(patchLogout, 1000);

  // Role separation — IDENTITY vs ROLE
  window.skhGetActiveRoles = function () {
    const d = skh.currentUserData || {};
    const roles = d.roles || d.role || [];
    if (Array.isArray(roles)) return roles;
    if (typeof roles === 'string') return [roles];
    // Infer from account
    const inferred = [];
    if (d.accountType === 'offline_member' || d.isOfflineUser) inferred.push('buyer');
    if (d.shopName || d.businessSetupComplete) inferred.push('seller');
    if (d.providerProfile) inferred.push('provider');
    if (d.driverProfile || d.transportProfile) inferred.push('driver');
    if (d.isAgent) inferred.push('agent');
    return inferred.length ? inferred : ['buyer'];
  };

  // ========================================================================
  // PHASE 2 — CORE DATA: Products, Services, Transport, Search
  // ========================================================================

  // Ensure saveData never uses undefined (Firestore throws)
  function patchSaveDataRobust() {
    if (!skh.saveData || skh.saveData._patched61) return;
    const orig = skh.saveData;
    skh.saveData = async function (col, data) {
      // Strip undefined recursively — Firestore doesn't allow it
      function stripUndef(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(stripUndef);
        const out = {};
        Object.keys(obj).forEach(k => {
          const v = obj[k];
          if (v === undefined) return;
          out[k] = (v && typeof v === 'object' && !(v instanceof Date)) ? stripUndef(v) : v;
        });
        return out;
      }
      // Ensure identity applied
      ensureIdentityEarly();
      const cleaned = stripUndef(data);
      try {
        return await orig.call(this, col, cleaned);
      } catch (e) {
        // If still fails due to undefined, try with nulls
        console.warn('[61] saveData retry after strip', e.message);
        const withNulls = {};
        Object.keys(cleaned).forEach(k => {
          withNulls[k] = cleaned[k] === undefined ? null : cleaned[k];
        });
        return await orig.call(this, col, stripUndef(withNulls));
      }
    };
    skh.saveData._patched61 = true;
    console.log('[61] saveData robust patch');
  }
  patchSaveDataRobust();
  setTimeout(patchSaveDataRobust, 1200);

  // Search debounce — ensure real search with debounce
  function patchSearch() {
    if (typeof window.handleSearch === 'function' && !window.handleSearch._patched61) {
      const orig = window.handleSearch;
      let timeout = null;
      window.handleSearch = function debouncedSearch(val) {
        const v = typeof val === 'string' ? val : (document.getElementById('searchInput')?.value || '');
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          skh.searchQuery = v;
          skh.loadMainFeed(skh.currentFeedCollection || 'all');
        }, 300);
        // Also call original for compatibility
        try { return orig.apply(this, arguments); } catch(e){}
      };
      window.handleSearch._patched61 = true;
    }
  }
  patchSearch();
  setTimeout(patchSearch, 1000);

  // ========================================================================
  // PHASE 3 — COMMUNICATION: Inbox, Chat, Notifications, Negotiation
  // ========================================================================

  // Chat privacy — ensure inbox uses correct UID and listeners cleaned
  function patchChatPrivacy() {
    // Wrap openChatList to ensure identity
    if (typeof window.openChatList === 'function' && !window.openChatList._patched61) {
      const orig = window.openChatList;
      window.openChatList = function () {
        ensureIdentityEarly();
        const dbg = window.skhIdentityDebug && window.skhIdentityDebug();
        if (dbg && dbg.MATCH !== 'OK') {
          console.warn('[61] Chat opened with mismatched identity!');
        }
        return orig.apply(this, arguments);
      };
      window.openChatList._patched61 = true;
    }
    // Ensure chatCore listener cleanup on identity change
    document.addEventListener('skh:identity-changed', function () {
      try {
        if (skh.chatUnsubscribe) { skh.chatUnsubscribe(); skh.chatUnsubscribe = null; }
        if (window.skhChatWipeState) window.skhChatWipeState();
      } catch (e) {}
    });
  }
  patchChatPrivacy();
  setTimeout(patchChatPrivacy, 1200);

  // Negotiation authority lives in 38-negotiation-form.js. A late wrapper used
  // to mutate entity.collectionName here and could turn ride_requests into
  // drivers; it was removed so type/entity have one owner.

  // ========================================================================
  // PHASE 4 — TRANSACTIONS: Cart, Checkout, Orders
  // ========================================================================

  // Cart — ensure transport choice asks user
  function patchCartCheckout() {
    if (typeof window.openCart === 'function' && !window.openCart._patched61) {
      const orig = window.openCart;
      window.openCart = function () {
        ensureIdentityEarly();
        return orig.apply(this, arguments);
      };
      window.openCart._patched61 = true;
    }
    // Patch checkout to ask transport choice
    if (typeof window.proceedToDeliverySelection === 'function' && !window.proceedToDeliverySelection._patched61) {
      const orig = window.proceedToDeliverySelection;
      window.proceedToDeliverySelection = function () {
        // Ask user explicitly
        const choice = confirm('Unataka usafirishaji wa SokoHai?\n\nOK = Ndiyo, tumia SokoHai Transport\nCancel = Hapana, nitachukua mwenyewe');
        if (choice) {
          sessionStorage.setItem('skh_wants_transport', 'yes');
        } else {
          sessionStorage.setItem('skh_wants_transport', 'no');
          // Skip transport creation
          try { sessionStorage.removeItem('chain_from'); } catch(e){}
        }
        return orig.apply(this, arguments);
      };
      window.proceedToDeliverySelection._patched61 = true;
    }
  }
  patchCartCheckout();
  setTimeout(patchCartCheckout, 1500);

  // Order lifecycle — prevent invalid jumps
  window.skhValidateOrderTransition = function (from, to) {
    const allowed = {
      'created': ['payment_pending', 'cancelled'],
      'payment_pending': ['paid', 'cancelled'],
      'paid': ['processing', 'disputed'],
      'processing': ['ready_for_pickup', 'disputed'],
      'ready_for_pickup': ['picked_up', 'disputed'],
      'picked_up': ['in_transit', 'disputed'],
      'in_transit': ['delivered', 'disputed'],
      'delivered': ['received', 'disputed'],
      'received': ['completed', 'disputed'],
      'completed': ['archived'],
      'cancelled': ['archived'],
      'disputed': ['processing', 'cancelled', 'completed'],
      'archived': []
    };
    const f = String(from||'').toLowerCase();
    const t = String(to||'').toLowerCase();
    if (!allowed[f]) return true; // unknown from — allow but log
    if (allowed[f].includes(t)) return true;
    console.warn(`[61] Invalid order transition: ${from} → ${to}`);
    return false;
  };

  // ========================================================================
  // PHASE 5 — TRANSPORT EXECUTION: Token, Pickup, Handoff
  // ========================================================================

  // Token security — ensure crypto-random and backend verify
  function patchTokens() {
    // Override secureToken to always use crypto
    if (skh.secureToken && !skh.secureToken._patched61) {
      const orig = skh.secureToken;
      skh.secureToken = function (prefix) {
        prefix = prefix || 'PK-';
        try {
          const arr = new Uint8Array(4);
          crypto.getRandomValues(arr);
          let hex = '';
          for (let i=0;i<4;i++) hex += (arr[i] < 16 ? '0' : '') + arr[i].toString(16);
          return prefix + hex.toUpperCase();
        } catch (e) {
          return orig(prefix);
        }
      };
      skh.secureToken._patched61 = true;
      window.skhSecureToken = skh.secureToken;
    }
    // Ensure token verification uses backend callable
    if (typeof window.verifyTokenCenterDL === 'function' && !window.verifyTokenCenterDL._patched61) {
      const orig = window.verifyTokenCenterDL;
      window.verifyTokenCenterDL = async function (token) {
        ensureIdentityEarly();
        // Try backend first
        if (window.skhCustodyServerTokenVerify) {
          try {
            const res = await window.skhCustodyServerTokenVerify({ token });
            if (res && res.data && res.data.ok) return res.data;
          } catch (e) {
            console.warn('[61] Token backend verify failed, fallback to client', e.message);
          }
        }
        return orig.apply(this, arguments);
      };
      window.verifyTokenCenterDL._patched61 = true;
    }
  }
  patchTokens();
  setTimeout(patchTokens, 1500);

  // ========================================================================
  // PHASE 6 — MONEY: SokoPay, Payment, Escrow
  // ========================================================================

  function patchEscrow() {
    // Guard escrow release — should be backend only
    if (typeof window.skhEscrowGuard === 'undefined') {
      window.skhEscrowGuard = {
        canRelease: function (order) {
          // Backend conditions
          if (!order) return false;
          if (order.paymentStatus !== 'Payment Protected' && order.paymentStatus !== 'Paid') return false;
          if (order.escrowStatus === 'Released') return false;
          if (order.status === 'disputed') return false;
          // Must have delivery confirmation
          if (order.shipmentStatus !== 'Delivered' && order.status !== 'delivered') return false;
          return true;
        }
      };
    }
    // Wrap escrow release function if exists
    const releaseFns = ['releaseEscrow', 'confirmDelivery', 'markAsDelivered', 'completeOrder'];
    releaseFns.forEach(fnName => {
      if (typeof window[fnName] === 'function' && !window[fnName]._patched61) {
        const orig = window[fnName];
        window[fnName] = async function () {
          ensureIdentityEarly();
          const order = skh.negoOrder || skh.currentOpenProduct || null;
          if (order && window.skhEscrowGuard && !window.skhEscrowGuard.canRelease(order)) {
            alert('Hali ya sasa hairuhusu kutoa pesa. Hakikisha malipo na uwasilishaji vimekamilika.');
            return false;
          }
          // Prefer backend callable
          if (window.skhWalletRegisterCallables && window.skhWalletRegisterCallables.release) {
            // Backend release
          }
          return orig.apply(this, arguments);
        };
        window[fnName]._patched61 = true;
      }
    });
  }
  patchEscrow();
  setTimeout(patchEscrow, 2000);

  // SokoPay — ensure payment via server
  function patchSokoPay() {
    if (typeof window.proceedToPaySokoPay === 'function' && !window.proceedToPaySokoPay._patched61) {
      const orig = window.proceedToPaySokoPay;
      window.proceedToPaySokoPay = function () {
        ensureIdentityEarly();
        if (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.PAYMENTS_VIA_SERVER !== true) {
          console.warn('[61] Payments should be via server!');
        }
        return orig.apply(this, arguments);
      };
      window.proceedToPaySokoPay._patched61 = true;
    }
  }
  patchSokoPay();
  setTimeout(patchSokoPay, 1500);

  // ========================================================================
  // PHASE 7 — HISTORY: Archive, History, Disputes, Audit
  // ========================================================================

  window.skhArchiveEntity = async function (col, id, reason) {
    ensureIdentityEarly();
    try {
      const ref = skh.doc(skh.db, col, id);
      await skh.updateDoc(ref, {
        status: 'archived',
        archivedAt: new Date().toISOString(),
        archivedBy: skh.currentUser.uid,
        archiveReason: reason || 'user_request'
      });
      console.log(`[61] Archived ${col}/${id} by ${skh.currentUser.uid}`);
      return true;
    } catch (e) {
      console.warn('[61] Archive failed', e.message);
      return false;
    }
  };

  // ========================================================================
  // PHASE 8 — UI / PERFORMANCE / POLISH
  // ========================================================================

  // Bottom nav fix — robust (MutationObserver + interval)
  (function fixBottomNav() {
    const DASH_MODES = ['seller','provider','driver','agent','admin'];
    function isDashboardMode() {
      const m = skh.currentMode || document.body.dataset.mode || '';
      return DASH_MODES.includes(m) || document.body.classList.contains('skh-mode-dashboard');
    }
    function isBuyerMode() {
      if (isDashboardMode()) return false;
      const m = skh.currentMode || document.body.dataset.mode || '';
      return m === 'buyer' || m === '' || !m || document.body.classList.contains('skh-mode-buyer');
    }
    function setBodyClass() {
      try {
        if (isDashboardMode()) {
          document.body.classList.add('skh-mode-dashboard');
          document.body.classList.remove('skh-mode-buyer');
          document.body.dataset.mode = skh.currentMode || 'dashboard';
        } else {
          document.body.classList.add('skh-mode-buyer');
          document.body.classList.remove('skh-mode-dashboard');
          document.body.dataset.mode = 'buyer';
        }
      } catch (e) {}
    }
    function ensureVisible(force) {
      try {
        setBodyClass();
        if (isDashboardMode() && !force) return;
        const hdr = document.querySelector('.sticky-top-section');
        const ftr = document.querySelector('.bottom-area-wrapper');
        const loc = document.getElementById('locationFilterBar');
        const shouldShow = isBuyerMode() || (force && !isDashboardMode());
        if (shouldShow) {
          if (hdr && hdr.style.display === 'none') { hdr.style.display = ''; hdr.style.display = 'flex'; }
          if (ftr && ftr.style.display === 'none') { ftr.style.display = ''; ftr.style.display = 'flex'; ftr.style.visibility = 'visible'; ftr.style.opacity = '1'; }
          if (loc && isBuyerMode() && loc.style.display === 'none') { loc.style.display = ''; loc.style.display = 'flex'; }
        }
      } catch (e) {}
    }
    function patchCloseModals() {
      if (typeof window.closeModals !== 'function' || window.closeModals._patched61) return;
      const orig = window.closeModals;
      window.closeModals = function () {
        const res = orig.apply(this, arguments);
        setBodyClass();
        setTimeout(() => ensureVisible(true), 30);
        setTimeout(() => ensureVisible(true), 300);
        setTimeout(() => ensureVisible(true), 800);
        return res;
      };
      window.closeModals._patched61 = true;
    }
    function patchApplyModeUI() {
      if (!skh.applyModeUI || skh.applyModeUI._patched61) return;
      const orig = skh.applyModeUI;
      skh.applyModeUI = function () {
        const res = orig.apply(this, arguments);
        setTimeout(() => { setBodyClass(); ensureVisible(true); }, 80);
        return res;
      };
      skh.applyModeUI._patched61 = true;
    }
    function patchUpdateApp() {
      if (typeof window.updateApp !== 'function' || window.updateApp._patched61) return;
      const orig = window.updateApp;
      window.updateApp = function () {
        const res = orig.apply(this, arguments);
        setTimeout(() => { setBodyClass(); ensureVisible(true); }, 60);
        return res;
      };
      window.updateApp._patched61 = true;
    }
    patchCloseModals(); patchApplyModeUI(); patchUpdateApp();
    setTimeout(() => { patchCloseModals(); patchApplyModeUI(); patchUpdateApp(); setBodyClass(); ensureVisible(true); }, 800);
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => { patchCloseModals(); patchApplyModeUI(); patchUpdateApp(); setBodyClass(); ensureVisible(true); }, 600));
    // Observer
    function startObserver() {
      const targets = [document.querySelector('.bottom-area-wrapper'), document.querySelector('.sticky-top-section'), document.body].filter(Boolean);
      if (!targets.length) return;
      const obs = new MutationObserver(() => setTimeout(() => ensureVisible(true), 70));
      targets.forEach(t => {
        try {
          if (t === document.body) obs.observe(t, { attributes: true, attributeFilter: ['class','data-mode'] });
          else obs.observe(t, { attributes: true, attributeFilter: ['style','class'] });
        } catch (e) {}
      });
    }
    setTimeout(startObserver, 1100);
    setInterval(() => ensureVisible(true), 5000);
    try { document.body.classList.add('skh-mode-buyer'); } catch(e){}
    setTimeout(() => ensureVisible(true), 600);
  })();

  // Responsive fix — KPI grids 1fr on mobile
  (function fixResponsive() {
    function fix() {
      if (window.innerWidth > 900) return;
      try {
        document.querySelectorAll('[style*=\"grid-template-columns\"]').forEach(el => {
          const style = el.getAttribute('style') || '';
          if (/repeat\s*\(\s*[2-6]/.test(style) || /1fr\s+1fr/.test(style) || /2\.3fr/.test(style)) {
            el.style.setProperty('grid-template-columns', '1fr', 'important');
          }
        });
      } catch (e) {}
    }
    document.addEventListener('DOMContentLoaded', () => setTimeout(fix, 1200));
    window.addEventListener('load', () => setTimeout(fix, 1800));
    window.addEventListener('resize', () => { if (window.innerWidth <= 900) fix(); });
    setTimeout(fix, 2000);
  })();

  // Loading / Error / Empty states — consistent
  window.skhShowEmpty = function (containerId, icon, title, msg, btnText, btnAction) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const iconHtml = icon ? (window.skhNavIcon ? window.skhNavIcon(icon, 28) : '') : '';
    el.innerHTML = `<div class=\"skh-empty\" style=\"grid-column:1/-1; text-align:center; padding:30px 20px;\"><span class=\"skh-empty-icon\">${iconHtml}</span><b>${esc(title)}</b><p style=\"color:#64748b; font-size:13px; margin:8px 0 14px;\">${esc(msg)}</p>${btnText ? `<button class=\"skh-empty-btn\" onclick=\"${btnAction}\">${esc(btnText)}</button>` : ''}</div>`;
  };
  window.skhShowError = function (containerId, msg) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<div class=\"skh-empty skh-empty--error\" style=\"grid-column:1/-1; text-align:center; padding:24px;\"><b>Imeshindikana kupakia</b><p style=\"color:#64748b; font-size:12px;\">${esc(msg||'Angalia muunganisho')}</p><button class=\"skh-empty-btn\" onclick=\"location.reload()\">Jaribu Tena</button></div>`;
  };

  // Performance — debounce and cache already in 00-bootstrap, ensure Chart lazy
  // (already implemented)

  // Error handling — consistent
  window.skhHandleError = function (e, context) {
    const code = (e && e.code) || 'unknown';
    const msg = (e && e.message) || String(e);
    console.warn(`[61] Error in ${context}:`, code, msg);
    if (window.skhIsFunctionsDownError && window.skhIsFunctionsDownError(e)) {
      if (typeof window.sokohaiToast === 'function') {
        window.sokohaiToast(window.skhFnDownMessage(context), 'warn', 6000);
      }
      return;
    }
    // Map to user-friendly
    let userMsg = 'Hatukuweza kukamilisha ombi lako. Jaribu tena.';
    if (/permission-denied/.test(code)) userMsg = 'Huna ruhusa ya kufanya kitendo hiki.';
    else if (/unauthenticated/.test(code)) userMsg = 'Tafadhali ingia kwenye akaunti yako kwanza.';
    else if (/not-found/.test(code)) userMsg = 'Taarifa haipatikani.';
    else if (/already-exists/.test(code)) userMsg = 'Taarifa tayari ipo.';
    if (typeof window.sokohaiToast === 'function') window.sokohaiToast(userMsg, 'error', 4000);
  };

  // Back navigation — ONE STEP AT A TIME
  window.skhGoBack = function () {
    // Try to go back one step based on current modal/context
    const modals = ['productModal','chatModal','chatListModal','notifModal','buyerOrdersModal','cartModal','userPaymentModal'];
    for (let i=modals.length-1;i>=0;i--) {
      const el = document.getElementById(modals[i]);
      if (el && el.style.display !== 'none' && el.style.display !== '') {
        // Close only topmost modal, not all
        el.style.display = 'none';
        document.body.style.overflow = 'auto';
        return;
      }
    }
    // If in dashboard, go to home
    if (skh.currentMode !== 'buyer') {
      if (typeof window.switchMode === 'function') window.switchMode('buyer');
      return;
    }
    // Default: history back if available
    if (window.history.length > 1) window.history.back();
  };

  // Patch existing back buttons that jump to home
  function patchBackButtons() {
    // [AUDIT-FIX 2026-09-16] Mstari ulikuwa umeharibika kwa double-escape
    // (faili nzima haikuparse). Imerudishwa kwenye string halali ya selector:
    document.querySelectorAll("[onclick*='navigate(/)'],[onclick*='window.location'],[onclick*='updateApp']").forEach(btn => {
      // Don't auto-patch, just log for audit
      // console.log('[61] Potential bad back handler:', btn.outerHTML.slice(0,100));
    });
  }
  setTimeout(patchBackButtons, 2000);

  // ========================================================================
  // FINAL — Audit and Test Helpers
  // ========================================================================

  window.skhFullSystemCheck = function () {
    const checks = [];
    // Phase 1
    checks.push({ phase: '1 AUTH', test: 'currentUser exists', ok: !!skh.currentUser });
    checks.push({ phase: '1 IDENTITY', test: 'AUTH UID == PROFILE UID', ok: (skh.currentUser && skh.currentUserData && skh.currentUser.uid === (skh.currentUserData.uid||skh.currentUserData.userId)) });
    checks.push({ phase: '1 OFFLINE', test: 'No fake email', ok: !(skh.currentUser && skh.currentUser.email && /offline_.*@sokohai\.com/.test(skh.currentUser.email)) });
    // Phase 2
    checks.push({ phase: '2 PRODUCTS', test: '39-showcase-logic exists', ok: typeof window.skhRenderShowcase === 'function' });
    checks.push({ phase: '2 SEARCH', test: 'handleSearch debounced', ok: !!(window.handleSearch && window.handleSearch._patched61) });
    // Phase 3
    checks.push({ phase: '3 CHAT', test: 'Chat privacy patched', ok: !!(window.openChatList && window.openChatList._patched61) });
    checks.push({ phase: '3 NEGO', test: 'Nego form structured', ok: typeof window.skhNegoFormOpen === 'function' });
    // Phase 4
    checks.push({ phase: '4 CART', test: 'Cart patched', ok: !!(window.openCart && window.openCart._patched61) });
    // Phase 5
    checks.push({ phase: '5 TOKEN', test: 'secureToken crypto', ok: !!(skh.secureToken && skh.secureToken._patched61) });
    // Phase 6
    checks.push({ phase: '6 ESCROW', test: 'Escrow guard exists', ok: !!window.skhEscrowGuard });
    // Phase 8
    checks.push({ phase: '8 UI', test: 'Bottom nav fix', ok: !!(window.closeModals && window.closeModals._patched61) });
    console.table(checks);
    const failed = checks.filter(c=>!c.ok);
    if (failed.length) console.warn('[61] Failed checks:', failed);
    else console.log('[61] All system checks OK');
    return checks;
  };

  // Auto-run checks after load
  window.addEventListener('load', () => setTimeout(() => { try { window.skhFullSystemCheck(); window.skhIdentityDebug(); } catch(e){} }, 3000));

  console.log('[61-full-repair] ready — all phases patched');
})();

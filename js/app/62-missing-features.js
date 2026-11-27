/**
 * SOKOHAI 62 — Missing Features Completion (PHASE 9)
 * Implements: image search visual, voice search, service order backend, multi-leg UI, POS void history, platform_stats doc, customToken real flow
 * [MODULE 2 DEF-006 2026-11-27] POS void and service orders go through the server only (see sections 3 and 5).
 * Depends on 60-identity-layer + 61-full-system-repair
 * Non-destructive: only adds, never removes
 */
(function(){
  'use strict';
  console.log('[62-missing] Loading...');

  /* ============================================================================
     [AUDIT-FIX 2026-09-16 P0 §28] COMPAT BRIDGE — v8-style API juu ya modular v10.
     TATIZO: faili hii ilitumia window.firebase/window.db ambavyo kwenye SokoHai
     HAVIJAWEKA — Firebase 10.8.1 modular inapakwa na js/app/00-bootstrap.js kama
     ES module (si compat globals). Matokeo: offlineMemberCustomToken flow,
     deliveryTokenVerify, serviceOrder backend, POS void history na platform_stats
     ZOTE zilikuwa BROKEN — zilipaswa kutumika lakini zilirushwa na
     'Firebase Functions not ready'.
     SULUHISHO: daraja dogo linalojenga API hizo kutoka window.skh (modular halisi).
     Lazima need() iitwe wakati wa MATUMIZI — si wakati wa kupakwa.
     ============================================================================ */
  (function buildSkhCompatBridge() {
    function need() {
      var x = window.skh || null;
      if (!x || !x.db) throw new Error('SKH modular haijaweka tayari bado');
      return x;
    }
    function docFacade(colName, docId) {
      return {
        get: async function () {
          var x = need();
          var snap = await x.getDoc(x.doc(x.db, colName, docId));
          var ok = snap && snap.exists && snap.exists();
          var d = ok ? snap.data() : undefined;
          return { exists: !!ok, data: function () { return d; } };
        },
        set: async function (data) { var x = need(); return x.setDoc(x.doc(x.db, colName, docId), data); },
        update: async function (data) { var x = need(); return x.updateDoc(x.doc(x.db, colName, docId), data); }
      };
    }
    if (!window.db) {
      window.db = {
        collection: function (colName) {
          return { doc: function (docId) { return docFacade(colName, docId); } };
        }
      };
    }
    if (!window.firebase) {
      window.firebase = {
        firestore: function () { return window.db; },
        app: function () {
          return {
            functions: function () {
              return {
                httpsCallable: function (fnName) {
                  return async function (payload) {
                    var x = need();
                    var r = await x.wrapCallable(fnName)(payload || {});
                    return (r && typeof r === 'object' && 'data' in r) ? r : { data: r };
                  };
                }
              };
            }
          };
        },
        auth: function () {
          return {
            signInWithCustomToken: async function (token) {
              var x = need();
              return x.signInWithCustomToken(x.auth, token);
            }
          };
        },
        functions: true
      };
      // FieldValue huishi kama static juu ya factory (v8 style)
      window.firebase.firestore.FieldValue = {
        serverTimestamp: function () { return new Date(); }
      };
    }
  })();

  // ========= 1. IMAGE SEARCH VISUAL ANALYSIS =========
  // Real image search: upload to Cloudinary + keyword extraction via local analysis
  // If Cloudinary fails, fallback to client-side color + shape heuristics + prompt user for keywords

  const skhImageSearch = {
    async analyze(file) {
      // Basic client-side analysis: dominant color + file name keywords
      try {
        const keywords = [];
        // 1. Filename keywords
        if (file.name) {
          const nameParts = file.name.toLowerCase().replace(/[^a-z0-9]/g,' ').split(' ').filter(w=>w.length>2);
          keywords.push(...nameParts);
        }
        // 2. Dominant color via canvas
        const color = await this._dominantColor(file);
        if (color) keywords.push(color);
        // 3. Size heuristic
        keywords.push(file.size > 2e6 ? 'large' : 'small');
        // 4. If user previously used image search, add history
        const history = JSON.parse(localStorage.getItem('skh_image_search_history')||'[]');
        // Dedupe
        const uniq = [...new Set(keywords)].slice(0, 8);
        // Store
        history.unshift({ at: new Date().toISOString(), keywords: uniq, fileName: file.name });
        localStorage.setItem('skh_image_search_history', JSON.stringify(history.slice(0,20)));
        return { keywords: uniq, color, fileName: file.name };
      } catch(e) {
        console.warn('[image-search] analyze fail', e);
        return { keywords: [file.name||'product'], color: null, fileName: file.name };
      }
    },
    _dominantColor(file) {
      return new Promise((resolve) => {
        try {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 20; canvas.height = 20;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0,0,20,20);
              const data = ctx.getImageData(0,0,20,20).data;
              let r=0,g=0,b=0,c=0;
              for (let i=0;i<data.length;i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; c++; }
              r=Math.round(r/c); g=Math.round(g/c); b=Math.round(b/c);
              // Map to color name
              const name = r>150&&g<100&&b<100?'red' : g>150&&r<100?'green' : b>150?'blue' : r>150&&g>150&&b<100?'yellow' : r>120&&g>120&&b>120?'white' : r<80&&g<80&&b<80?'black' : 'colorful';
              resolve(name);
            } catch(_){ resolve(null); }
          };
          img.onerror = ()=> resolve(null);
          img.src = URL.createObjectURL(file);
        } catch(_){ resolve(null); }
      });
    },
    async search(file) {
      const analysis = await this.analyze(file);
      // Build query from keywords
      const query = analysis.keywords.join(' ');
      // Use existing product search
      if (window.skh && typeof skh.searchProducts === 'function') {
        skh.searchProducts(query);
      } else if (window.searchProducts) {
        searchProducts(query);
      } else {
        // fallback: set search input
        const input = document.querySelector('#searchInput, [data-search-input], input[type="search"]');
        if (input) { input.value = query; input.dispatchEvent(new Event('input')); }
      }
      // Show feedback
      if (window.skhToast) skhToast(`Picha imechambuliwa: ${analysis.keywords.join(', ')}`, 'success');
      return analysis;
    }
  };
  window.skhImageSearch = skhImageSearch;

  // Patch existing image search buttons if present
  document.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('[data-image-search], .image-search-btn, #imageSearchBtn').forEach(btn=>{
      if (btn._skhPatched) return; btn._skhPatched=true;
      btn.addEventListener('click', async ()=>{
        const input = document.createElement('input'); input.type='file'; input.accept='image/*';
        input.onchange = async ()=>{ if (input.files[0]) await skhImageSearch.search(input.files[0]); };
        input.click();
      });
    });
    // Also hook file input for product image search if exists
    const imgInput = document.getElementById('imageSearchInput');
    if (imgInput && !imgInput._skhPatched) {
      imgInput._skhPatched=true;
      imgInput.addEventListener('change', async (e)=>{ if (e.target.files[0]) await skhImageSearch.search(e.target.files[0]); });
    }
  });

  // ========= 2. VOICE SEARCH =========
  const skhVoiceSearch = {
    recognition: null,
    isListening: false,
    init() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { console.warn('[voice-search] SpeechRecognition not supported'); return false; }
      this.recognition = new SR();
      this.recognition.lang = 'sw-TZ'; // Swahili TZ, fallback to en-US if fails
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.onresult = (event)=>{
        const transcript = event.results[0][0].transcript;
        console.log('[voice-search] heard:', transcript);
        // Use search
        if (window.skh && typeof skh.searchProducts === 'function') skh.searchProducts(transcript);
        else {
          const input = document.querySelector('#searchInput, [data-search-input], input[type="search"]');
          if (input) { input.value = transcript; input.dispatchEvent(new Event('input')); }
        }
        if (window.skhToast) skhToast(`Umesema: "${transcript}"`, 'success');
        this.isListening=false;
        document.querySelectorAll('[data-voice-search].listening').forEach(el=>el.classList.remove('listening'));
      };
      this.recognition.onerror = (e)=>{
        console.warn('[voice-search] error', e);
        // Fallback try en-US
        if (e.error==='language-not-supported') {
          this.recognition.lang='en-US';
          try{ this.recognition.start(); return; }catch(_){}
        }
        if (window.skhToast) skhToast('Sauti haikusikika, jaribu tena', 'error');
        this.isListening=false;
      };
      this.recognition.onend = ()=>{ this.isListening=false; document.querySelectorAll('[data-voice-search].listening').forEach(el=>el.classList.remove('listening')); };
      return true;
    },
    start() {
      if (!this.recognition && !this.init()) {
        if (window.skhToast) skhToast('Kivinjari chako hakiungi mkono utafutaji wa sauti', 'error');
        return;
      }
      if (this.isListening) return;
      this.isListening=true;
      document.querySelectorAll('[data-voice-search]').forEach(el=>el.classList.add('listening'));
      try{ this.recognition.start(); if (window.skhToast) skhToast('Nasikiliza... sema bidhaa unayotafuta', 'info'); }catch(e){ console.warn(e); }
    }
  };
  window.skhVoiceSearch = skhVoiceSearch;
  document.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('[data-voice-search], .voice-search-btn, #voiceSearchBtn').forEach(btn=>{
      if (btn._skhVoicePatched) return; btn._skhVoicePatched=true;
      btn.addEventListener('click', ()=> skhVoiceSearch.start());
    });
  });

  // ========= 3. SERVICE ORDER BACKEND =========
  // When negotiation agreed for service, create service_order doc + notify provider + client
  /* [MODULE 2 DEF-006 2026-11-27] SERVICE ORDERS ARE SERVER-OWNED.
   * Previously this helper wrote `service_orders/*` (no rule: always denied) and `orders/*` without a
   * buyerId (denied by the orders create rule), plus a notification. It had no caller. The real paths:
   *   - negotiation accepted -> the server creates the order (functions/negotiation.js, commerceType
   *     'service', priced by the server);
   *   - provider accepts a service request -> rule-backed order create (serviceOrderBackedByAcceptedRequest);
   *   - payment -> serviceOrderWalletPay / PesaPal (server).
   * The helper no longer writes anything; it returns the server order for the negotiation when one exists. */
  window.skhCreateServiceOrder = async function(negotiationId) {
    const x = window.skh || null;
    if (!negotiationId) return { ok: false, reason: 'negotiation_required' };
    try {
      if (!x || !x.db) return { ok: false, reason: 'server_owned' };
      const snap = await x.getDoc(x.doc(x.db, 'negotiations', String(negotiationId)));
      const nego = snap && snap.exists && snap.exists() ? (snap.data() || {}) : null;
      if (nego && nego.orderId) return { ok: true, orderId: nego.orderId, serverOwned: true };
      return { ok: false, reason: 'server_owned', message: 'Oda ya huduma inaundwa na server baada ya makubaliano.' };
    } catch (e) {
      return { ok: false, reason: 'server_owned', message: (e && e.message) || '' };
    }
  };

  // ========= 4. MULTI-LEG TRANSPORT UI =========
  window.skhMultiLeg = {
    legs: [],
    addLeg(leg){ this.legs.push({ id: 'LEG-'+Date.now()+'-'+Math.random().toString(36).slice(2,4).toUpperCase(), ...leg, status: 'pending' }); this.render(); },
    removeLeg(id){ this.legs = this.legs.filter(l=>l.id!==id); this.render(); },
    render(){
      const container = document.getElementById('multiLegContainer');
      if (!container) return;
      container.innerHTML = this.legs.map((leg,i)=>`
        <div class="multi-leg-item" style="border:1px solid #e5e7eb;padding:12px;border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <div><strong>Leg ${i+1}:</strong> ${leg.from||leg.pickup||''} → ${leg.to||leg.destination||''} <br><small>${leg.courierId||'Hajapangwa'} | ${leg.status}</small></div>
          <button onclick="skhMultiLeg.removeLeg('${leg.id}')" style="background:#fee2e2;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">Futa</button>
        </div>
      `).join('') || '<div style="padding:20px;text-align:center;color:#6b7280;">Hakuna legs bado</div>';
    },
    async createMultiLegShipment(orderId){
      if (this.legs.length<1) { if(window.skhToast) skhToast('Ongeza angalau leg moja','error'); return; }
      try{
        const db = window.db || firebase.firestore();
        const shipment = {
          orderId,
          type: 'multi-leg',
          legs: this.legs,
          status: 'Pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString(),
          chainOfCustody: []
        };
        const ref = await db.collection('shipments').add(shipment);
        if (window.skhToast) skhToast('Multi-leg shipment imetengenezwa','success');
        this.legs=[]; this.render();
        return ref.id;
      }catch(e){ console.error('[multi-leg] create fail', e); if(window.skhToast) skhToast('Imeshindwa: '+e.message,'error'); }
    }
  };

  // ========= 5. POS VOID HISTORY =========
  /* [MODULE 2 DEF-006 2026-11-27] AUTHORITATIVE SERVER VOID ONLY.
   * Previously this wrapper wrote `pos_voids` and `pos_transactions` from the browser. Neither
   * collection has a rule (catch-all deny), and `pos_transactions` is not the POS ledger: sales live
   * in `sales/*` and are voided by the `posVoid` callable (transaction + idempotency key + business/
   * store authorization + stock restoration + `sale_voids/*`). The wrapper now calls `posVoid` with
   * the same idempotency key format as the POS screen (17-hub.js submitPosVoid: 'void-ui-' + saleId),
   * so a void started from either place is applied once. The device-local history is kept as a
   * convenience and is written only after the server confirmed the void. */
  window.skhPOS = window.skhPOS || {};
  window.skhPOS.voidHistory = (function(){ try { return JSON.parse(localStorage.getItem('skh_pos_void_history')||'[]'); } catch(_) { return []; } })();
  window.skhPOS.voidTransaction = async function(txId, reason){
    const x = window.skh || null;
    const saleId = String(txId || '').trim();
    const why = String(reason || '').trim();
    if (!saleId) return { ok: false, reason: 'sale_required' };
    if (!why) return { ok: false, reason: 'reason_required' };
    if (!x || typeof x.wrapCallable !== 'function') {
      if (window.skhToast) skhToast('Void inahitaji mtandao na server. Jaribu tena baadaye.', 'error');
      return { ok: false, reason: 'server_unavailable' };
    }
    try {
      const ud = x.currentUserData || {};
      const response = await x.wrapCallable('posVoid')({ idempotencyKey: 'void-ui-' + saleId, businessId: ud.businessId || null, storeId: ud.storeId || null, originalSaleId: saleId, reason: why });
      const result = response && response.data ? response.data : response;
      const entry = { txId: saleId, reason: why, at: new Date().toISOString(), by: (x.currentUser && x.currentUser.uid) || null, status: (result && result.status) || 'VOIDED' };
      window.skhPOS.voidHistory.unshift(entry);
      try { localStorage.setItem('skh_pos_void_history', JSON.stringify(window.skhPOS.voidHistory.slice(0,100))); } catch(_) {}
      if (window.skhToast) skhToast('Sale imefutwa (void) na server. Refund ni hatua tofauti.', 'success');
      return { ok: true, result: result };
    } catch (e) {
      console.error('[pos-void] server refused', e);
      if (window.skhToast) skhToast('Imeshindwa ku-void: ' + ((e && e.message) || 'server'), 'error');
      return { ok: false, reason: (e && e.code) || 'server_error', message: (e && e.message) || '' };
    }
  };
  window.skhPOS.getVoidHistory = ()=> window.skhPOS.voidHistory;

  // ========= 6. PLATFORM_STATS DOC SEED =========
  window.skhEnsurePlatformStats = async function(){
    try{
      const db = window.db || firebase.firestore();
      if (!db) return;
      const ref = db.collection('platform_stats').doc('current');
      const snap = await ref.get();
      if (!snap.exists) {
        // platform_stats is server-authoritative. The browser may read it, but
        // must never create/update the document (see firestore.rules).
        console.info('[platform_stats] not initialized; waiting for platformStatsRefresh');
      }
    }catch(e){ console.warn('[platform_stats] seed fail', e); }
  };
  // Read-only health check after auth; initialization belongs to the server.
  setTimeout(()=>{ try{ window.skhEnsurePlatformStats(); }catch(_){} }, 3000);

  // ========= 7. REAL CUSTOMTOKEN FLOW FOR OFFLINE MEMBER =========
  // Frontend wrapper that calls backend offlineMemberCustomToken, then signInWithCustomToken as member
  window.skhSignInAsOfflineMember = async function(memberUid, memberPhone){
    try{
      // [SRV-12 2026-11-20] 'offlineMemberCustomToken' does not exist on the server (signing in AS another person
      // needs a written security design first). Off by default: the existing assisted mode is used directly.
      const feats = (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.FEATURES) || {};
      if (feats.offlineMemberTokenSignIn !== true) throw Object.assign(new Error('offline member token sign-in is disabled'), { code: 'feature-disabled' });
      if (!window.firebase || !firebase.functions) throw new Error('Firebase Functions not ready');
      const functions = firebase.app().functions('europe-west1');
      const callable = functions.httpsCallable('offlineMemberCustomToken');
      const res = await callable({ memberUid, memberPhone });
      const customToken = res.data.customToken;
      if (!customToken) throw new Error('No customToken returned');
      // Sign in as member — this will trigger auth state change, identity layer will pick up member UID
      const auth = firebase.auth();
      await auth.signInWithCustomToken(customToken);
      console.log('[identity] Signed in as offline member', memberUid);
      if (window.skhToast) skhToast(`Umeingia kama ${memberUid}`, 'success');
      // Save audit
      localStorage.setItem('skh_last_offline_signin', JSON.stringify({ memberUid, at: new Date().toISOString(), agentId: ((window.skh && window.skh.currentUser && window.skh.currentUser.uid) || null) }));
      return customToken;
    }catch(e){
      if (!(e && e.code === 'feature-disabled')) console.error('[customToken] signInAsOfflineMember fail', e);
      // Fallback to identity-layer assisted mode if backend not deployed
      if (window.skhIdentity && window.skhIdentity.enterAssistedMode) {
        console.warn('[customToken] fallback to assisted mode');
        window.skhIdentity.enterAssistedMode(memberUid);
        return null;
      }
      if (window.skhToast) skhToast('Imeshindwa kuingia kama offline member: '+e.message,'error');
      throw e;
    }
  };

  // ========= 8. BACKEND TOKEN VERIFY WRAPPER ENHANCED =========
  // If backend exists, use it; else fallback to local check (already in 61)
  const origVerify = window.skhVerifyTokenBackend;
  window.skhVerifyTokenBackend = async function(token, orderId){
    try{
      if (window.firebase && firebase.functions) {
        const functions = firebase.app().functions('europe-west1');
        const callable = functions.httpsCallable('deliveryTokenVerify');
        const res = await callable({ token, orderId });
        return res.data;
      }
    }catch(e){
      console.warn('[token-verify] backend fail, fallback local', e);
    }
    if (origVerify) return origVerify(token, orderId);
    return { ok: false, error: 'Backend not available' };
  };

  console.log('[62-missing] Ready — imageSearch, voiceSearch, serviceOrder, multiLeg, posVoid, platformStats, customToken');
})();

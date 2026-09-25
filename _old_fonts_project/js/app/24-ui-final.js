/* ==== js/app/24-ui-final.js ==== */
import { skh } from './00-bootstrap.js';

window.skhVisibleOverlays = function(){
    return Array.from(document.querySelectorAll('.overlay-menu, .form-box')).filter(el => {
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
    });
};

window.skhGoBack = function(){
    const overlays = window.skhVisibleOverlays();
    // Close topmost visible overlay/modal first
    if(overlays.length){
        const top = overlays.sort((a,b)=>(parseInt(getComputedStyle(b).zIndex)||0)-(parseInt(getComputedStyle(a).zIndex)||0))[0];
        if(top.id === 'sokopayForm' && typeof window.closeModals === 'function') { window.closeModals(); }
        else top.style.display = 'none';
        setTimeout(window.skhRefreshBackButton, 100);
        return;
    }
    // If inside a non-buyer mode, return buyer/home
    try {
        if(window.currentMode && window.currentMode !== 'buyer' && typeof window.switchMode === 'function') {
            window.switchMode('buyer');
            return;
        }
    } catch(e) {}
    // Last resort
    if(history.length > 1) history.back();
};

window.skhEnsureBackButton = function(){
    // [ONDOSHWA] Kitufe cha global "Rudi" (floating) kimeondolewa — kilitokea juu ya kila
    // ukurasa na kuharibu muonekano. Tunatumia vitufe vya asili vya kila fomu/modal.
    return null;
};

/* [AUDIT-FIX 2026-09-16 P1 §nav-kupotea] ROOT CAUSE ya "bottom nav zinapotea
   ukigusa search bar / filter ya mikoa":
   Awali class 'skh-keyboard-open' iliwekwa FOCUS yoyote ya input/select —
   hata pasipo keyboard ya kweli (select ya region, desktop clicks) — kisha
   23-smart-cart.js ilikuwa inaficha .bottom-area-wrapper. Blur restore ilikuwa
   timeout ya 180ms ikatoharibika mara kwa mara.
   SULUHISHO: ficha nav TU wakati keyboard ya SIMU ipo wazi kweli —
   (text input imefokusi) NA (visualViewport imepungua zaidi ya 25%). */
window.skhKeyboardStateSync = function(){
    let textFocused = false, inOverlay = false;
    try {
        const t = document.activeElement;
        textFocused = !!(t && /INPUT|TEXTAREA/.test(t.tagName)
            && ['checkbox','radio','date','button','submit','file','range'].indexOf(t.type) < 0);
        inOverlay = !!(t && t.closest('.overlay-menu,.modal,[class*=Modal],[class*=modal],[id*=Modal],[id*=modal]'));
    } catch(e) {}
    let keyboardLikely = false;
    if (window.visualViewport) {
        keyboardLikely = window.visualViewport.height < window.innerHeight * 0.75;
    }
    /* Ficha bottom nav TU wakati keyboard halisi ipo wazi na input
       iliyofokusi inaonekana IKINDE kwenye overlay/modal (chat, fomu).
       Search bar ya feed na filter za mikoa HAZINGERING'AKIWE nav — hiyo
       ilikuwa root cause ya "nav zinapotea, mpaka utouch sehemu yeyote". */
    document.body.classList.toggle('skh-keyboard-open', !!(textFocused && inOverlay && keyboardLikely));
};

window.skhInputFocusHandler = function(e){
    const t = e.target;
    if(!t || !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    window.skhKeyboardStateSync();
    setTimeout(() => {
        try { t.scrollIntoView({ block:'center', inline:'nearest', behavior:'smooth' }); } catch(err) {}
    }, 250);
};

window.skhInputBlurHandler = function(){
    setTimeout(window.skhKeyboardStateSync, 180);
};

document.addEventListener('focusin', window.skhInputFocusHandler, true);

document.addEventListener('focusout', window.skhInputBlurHandler, true);

if(window.visualViewport){
    window.visualViewport.addEventListener('resize', window.skhKeyboardStateSync);
}

if(typeof window.updateApp === 'function' && !window.__skhUpdateAppWrapped){
    window.__skhUpdateAppWrapped = true;
    const oldUpdateApp = window.updateApp;
    window.updateApp = function(mode, element){
        const r = oldUpdateApp.apply(this, arguments);
        setTimeout(() => window.skhFriendlyModuleHeader(mode), 100);
        return r;
    };
}

document.addEventListener('keydown', e => {
    if(e.key === 'Escape') window.skhGoBack();
});

(function(){
  if(window.__SOKOPAY_TOKEN_ARCH_FINAL__) return;
  window.__SOKOPAY_TOKEN_ARCH_FINAL__ = true;

  const safe = s => typeof skh.skhEscape === 'function' ? skh.skhEscape(s||'') : String(s||'');
  const money = n => 'TSh ' + Number(n||0).toLocaleString();
  const now = () => new Date().toISOString();
  const randPart = () => Math.random().toString(36).slice(2,6).toUpperCase();
  const gen = prefix => `${prefix}-${randPart()}-${randPart()}-${new Date().getFullYear()}`;
  const getCart = () => { try { return JSON.parse(skh.localStorage.getItem('sokohai_cart')||'[]') || []; } catch(e){ return window.myCart || []; } };
  const price = x => parseFloat(String(x.price ?? x.unitPrice ?? x.cartMeta?.unitPrice ?? 0).replace(/,/g,'')) || 0;
  const qty = x => Math.max(1, parseInt(x.qty || x.quantity || 1));
  const sellerId = x => x.sellerId || x.userId || x.ownerId || x.cartMeta?.sellerId || 'outside_seller';
  const sellerName = x => x.sellerName || x.ownerName || x.seller || x.cartMeta?.sellerName || 'Seller';
  const selectedCarrier = () => window.smartCartState?.selectedCarrier || null;

  function totals(){
    const items=getCart();
    const productsTotal=items.reduce((s,x)=>s+price(x)*qty(x),0);
    const shipping=Number(selectedCarrier()?.price || window.smartCartState?.shippingCost || 0);
    const escrowFee=Math.round(productsTotal*0.015);
    const discount=Number(window.smartCartState?.discount || 0);
    const grandTotal=Math.max(0, productsTotal+shipping+escrowFee-discount);
    const pkg=typeof skh.orchPackageSummary==='function' ? skh.orchPackageSummary(items) : {weightKg:1,sizeClass:'small',sellersCount:new Set(items.map(sellerId)).size};
    return {productsTotal,shipping,escrowFee,discount,grandTotal,package:pkg,itemsCount:items.reduce((s,x)=>s+qty(x),0)};
  }

  window.generateSokoPayCoreTokens = function(masterTransactionId){
    return {
      masterTransactionId,
      trackingToken: gen('TRK'),
      paymentToken: gen('PAY'),
      shipmentToken: gen('SHP'),
      escrowToken: gen('ESC'),
      contractToken: gen('CTR'),
      verificationToken: gen('VER')
    };
  };

  async function saveTokenCenterRecord(data){
    try { await skh.addDoc(skh.collection(skh.db,'sokopay_tokens'), { ...data, createdAt:now(), tokenCenterVersion:'unified_v1' }); } catch(e){ console.log('token center save skipped', e.message); }
  }

  async function saveCoreTokensToTokenCenter(coreId, core){
    const common = {
      masterTransactionId: core.masterTransactionId,
      orderId: core.orderId,
      sokopayCoreId: coreId,
      buyerId: core.buyerId,
      sellerId: core.sellerId,
      shipmentId: core.shipmentId || '',
      trackingId: core.trackingId || '',
      status:'active'
    };
    await saveTokenCenterRecord({ ...common, token:core.trackingToken, tokenType:'tracking', tokenPurpose:'Buyer/Seller shipment and transaction tracking', audience:'buyer_seller', visibleToBuyer:true, visibleToSeller:true, visibleToCourier:false });
    await saveTokenCenterRecord({ ...common, token:core.paymentToken, tokenType:'payment', tokenPurpose:'Payment reference token', audience:'sokopay_payment_engine', visibleToBuyer:true, visibleToSeller:true, visibleToCourier:false });
    await saveTokenCenterRecord({ ...common, token:core.shipmentToken, tokenType:'shipment', tokenPurpose:'Shipment engine token', audience:'shipment_engine', visibleToBuyer:true, visibleToSeller:true, visibleToCourier:true });
    await saveTokenCenterRecord({ ...common, token:core.escrowToken, tokenType:'escrow', tokenPurpose:'Escrow protection token', audience:'sokopay_escrow_engine', visibleToBuyer:true, visibleToSeller:true, visibleToCourier:false });
    await saveTokenCenterRecord({ ...common, token:core.contractToken, tokenType:'contract', tokenPurpose:'Digital agreement/contract token', audience:'buyer_seller_contract_center', visibleToBuyer:true, visibleToSeller:true, visibleToCourier:false });
    await saveTokenCenterRecord({ ...common, token:core.verificationToken, tokenType:'verification', tokenPurpose:'Step verification when needed by system', audience:'system', visibleToBuyer:false, visibleToSeller:false, visibleToCourier:false });
  }

  function makeStages(core, carrier){
    const mode = window.smartCartState?.deliveryMode || 'direct';
    const destination = String(window.smartCartState?.address || document.getElementById('smartShippingAddress')?.value || '').toLowerCase();
    let hubs = ['Seller Pickup','Buyer Delivery'];
    if(mode === 'multi'){
      if(destination.includes('kigoma')) hubs = ['Dar es Salaam Hub','Tabora Hub','Kigoma Local Delivery'];
      else if(destination.includes('mbeya') || destination.includes('songwe')) hubs = ['Dar es Salaam Hub','Morogoro Hub','Mbeya/Songwe Local Delivery'];
      else if(destination.includes('mwanza')) hubs = ['Dar es Salaam Hub','Dodoma/Manyoni Hub','Mwanza Local Delivery'];
      else hubs = ['Pickup Hub','Regional Hub','Local Delivery'];
    }
    const stages=[];
    for(let i=0;i<hubs.length-1;i++){
      stages.push({
        stageNumber:i+1,
        fromHub:hubs[i],
        toHub:hubs[i+1],
        courierId:i===0?(carrier?.id||'selected_courier'):'waiting_buyer_continue_delivery',
        courierName:i===0?(carrier?.company||carrier?.name||'Selected Courier'):'Waiting next courier',
        status:i===0?'active':'waiting_previous_stage',
        deliveryPermissionToken:gen('DLV'),
        pickupToken:gen('PU'),
        transportToken:gen('TRN'),
        arrivalToken:gen('ARR'),
        handoverToken:gen('HND'),
        expiryAt:new Date(Date.now()+24*3600000).toISOString(),
        oneTime:true,
        used:false
      });
    }
    return stages;
  }

  async function saveDeliveryPermissionTokens(coreId, core, shipmentDocId, stages){
    for(const st of stages){
      await saveTokenCenterRecord({
        token: st.deliveryPermissionToken,
        tokenType:'delivery_permission',
        tokenPurpose:'Authorization for assigned verified courier to pick/handover this shipment stage only',
        tokenCategory:'authorization_not_identity',
        audience:'assigned_courier_only',
        visibleToBuyer:false,
        visibleToSeller:false,
        visibleToCourier:true,
        masterTransactionId: core.masterTransactionId,
        trackingToken: core.trackingToken,
        orderId: core.orderId,
        sokopayCoreId: coreId,
        shipmentId: core.shipmentId,
        trackingId: core.trackingId,
        shipmentDocId,
        stageNumber: st.stageNumber,
        courierId: st.courierId,
        courierName: st.courierName,
        pickupHub: st.fromHub,
        destinationHub: st.toHub,
        expiryAt: st.expiryAt,
        oneTime:true,
        used:false,
        status: st.status==='active'?'active':'waiting',
        verificationEngine:'reuse_existing_sokohai_verification'
      });
    }
  }

  function buildCore({orderId, transactionToken, masterTransactionId, tokens, sellerIdValue, sellerItems, calc, carrier}){
    const amount=sellerItems.reduce((s,x)=>s+price(x)*qty(x),0);
    const outsideSeller = !sellerIdValue || sellerIdValue==='unknown_seller' || sellerItems.some(x=>x.outsideSeller || x.isExternalSeller);
    const shipmentId = gen('SHPID');
    const trackingId = gen('TRKID');
    const sellerPortalToken = gen('SEL');
    return {
      ...tokens,
      masterTransactionId,
      orderId, transactionToken,
      buyerId:skh.currentUser.uid,
      buyerName:skh.currentUser.displayName||skh.currentUserData?.fullName||'Buyer',
      sellerId:sellerIdValue||'outside_seller',
      sellerName:sellerName(sellerItems[0]),
      sellerVerified:!outsideSeller,
      outsideSeller,
      sellerPortalToken,
      sellerPortalLink:`sokohai://seller-portal/${sellerPortalToken}`,
      items:sellerItems,
      amount,
      totals:calc,
      shipmentId,
      trackingId,
      selectedCarrier:carrier,
      shippingService:carrier?.service||'customer_pickup',
      shippingCost:Number(carrier?.price||0),
      package:calc.package,
      escrowBreakdown:{ productCost:amount, shippingCost:Number(carrier?.price||0), escrowFee:calc.escrowFee, escrowTotal:amount+Number(carrier?.price||0) },
      paymentStatus:'Payment Pending',
      escrowStatus:'Waiting Payment',
      shipmentStatus:'Preparing',
      contractStatus:'Contract Active',
      orderStatus:'Pending',
      tokenStatus:'Core Tokens Ready',
      tokenArchitecture:'master_transaction_root_with_distinct_tokens',
      courier:{ name:carrier?.name||'Not assigned', phone:carrier?.driverPhone||'', vehicle:carrier?.selectedVehicle?.type||carrier?.vehicleType||'', currentLocation:null, eta:carrier?.eta||'—', distance:'—' },
      sellerDetails:{ rating:'—', businessName:sellerName(sellerItems[0]), supportContact:sellerItems[0]?.sellerPhone||'' },
      contract:{ warranty:'Warranty Active', returnPolicy:'Return Policy Available', protectionEnds:new Date(Date.now()+7*86400000).toISOString(), digitalAgreement:'Generated' },
      documents:{ receipt:true, invoice:true, deliveryNote:true, warranty:true, contract:true },
      timeline:[{title:'Order Created',description:'Order created in SokoPay Core',at:now(),done:true},{title:'Core Tokens Generated',description:'Tracking, payment, escrow, shipment and contract tokens generated.',at:now(),done:true}],
      createdAt:now(), updatedAt:now(), source:'smart_cart_sokopay_core_final_token_arch'
    };
  }

  // FINAL checkout override with distinct tokens.
  window.confirmSmartCartOrder = async function(){
    const items=getCart();
    if(!items.length) return alert('Cart iko wazi.');
    const carrier = selectedCarrier();
    if(!carrier) return alert('Chagua delivery kwenye SokoHai Logistics Marketplace kabla ya checkout.');
    const calc = totals();
    const orderId='ORD-'+Date.now();
    const transactionToken=gen('TXN');
    const grouped={};
    items.forEach(x=>{ const sid=sellerId(x); grouped[sid]=grouped[sid]||[]; grouped[sid].push(x); });
    const coreIds=[];
    try{
      for(const [sid,sellerItems] of Object.entries(grouped)){
        const masterTransactionId=gen('MTX');
        const tokens=window.generateSokoPayCoreTokens(masterTransactionId);
        const core=buildCore({orderId, transactionToken, masterTransactionId, tokens, sellerIdValue:sid, sellerItems, calc, carrier});
        const coreRef=await skh.addDoc(skh.collection(skh.db,'sokopay_core_transactions'), core);
        coreIds.push(coreRef.id);
        await saveCoreTokensToTokenCenter(coreRef.id, core);
        const stages=makeStages(core, carrier);
        const shipment={
          shipmentId:core.shipmentId,
          trackingId:core.trackingId,
          trackingToken:core.trackingToken,
          shipmentToken:core.shipmentToken,
          masterTransactionId:core.masterTransactionId,
          orderId, transactionToken,
          sokopayCoreId:coreRef.id,
          buyerId:core.buyerId,
          sellerId:core.sellerId,
          courierId:carrier.id||'selected_courier',
          courierName:carrier.company||carrier.name||'Courier',
          courierCompany:carrier.company||carrier.name||'Courier',
          driverName:carrier.driverName||'After assignment',
          driverPhone:carrier.driverPhone||'',
          vehicleType:carrier.selectedVehicle?.type||carrier.vehicleType||carrier.vehicle||'',
          vehiclePlate:carrier.plate||'After assignment',
          insuranceStatus:carrier.insurance?'insured':'not_insured',
          verificationBadge:carrier.verified?'verified':'pending',
          pickupLocation:sellerItems[0]?.sellerLocation||sellerItems[0]?.location||'Seller location',
          deliveryAddress:window.smartCartState?.address||document.getElementById('smartShippingAddress')?.value||'',
          specialInstructions:window.smartCartState?.notes||document.getElementById('smartOrderNotes')?.value||'',
          package:calc.package,
          escrowStatus:core.escrowStatus,
          shippingCost:core.shippingCost,
          deliveryMode:window.smartCartState?.deliveryMode||'direct',
          stages,
          chainOfCustody:[],
          status:'Courier Assigned',
          createdAt:now(), updatedAt:now()
        };
        const shipRef=await skh.addDoc(skh.collection(skh.db,'shipments'), shipment);
        await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',coreRef.id), { shipmentDocId:shipRef.id, stages:stages.map(s=>({stageNumber:s.stageNumber,status:s.status,from:s.fromHub,to:s.toHub})), deliveryPermissionVisibility:'courier_only', trackingTokenVisibility:'buyer_seller', updatedAt:now() });
        await saveDeliveryPermissionTokens(coreRef.id, core, shipRef.id, stages);
        await skh.addDoc(skh.collection(skh.db,'logistics_assignments'), { ...shipment, shipmentDocId:shipRef.id, assignmentStatus:'new_assignment', logisticsDashboardStatus:'pending_acceptance' });
        await skh.addDoc(skh.collection(skh.db,'seller_order_inbox'), { sellerId:sid, orderId, transactionToken, trackingToken:core.trackingToken, sokopayCoreId:coreRef.id, shipmentDocId:shipRef.id, buyerDetails:{buyerId:core.buyerId,buyerName:core.buyerName}, paymentStatus:core.paymentStatus, escrowStatus:core.escrowStatus, selectedShippingCompany:carrier.company||carrier.name, vehicle:shipment.vehicleType, shippingInstructions:shipment.specialInstructions, pickupAddress:shipment.pickupLocation, deliveryAddress:shipment.deliveryAddress, shipmentStatus:shipment.status, items:sellerItems, createdAt:now(), status:'new_order' });
        await skh.addDoc(skh.collection(skh.db,'orders'), { ...core, sokopayCoreId:coreRef.id, shipmentDocId:shipRef.id, status:'payment_pending', itemTitle:`Smart Cart Order (${sellerItems.length} items)`, shipping:{method:carrier.service, carrier, shipment}, orderNotes:shipment.specialInstructions, paymentMethod:window.smartCartState?.paymentMethod||'sokopay_wallet' });
      }
      await skh.addDoc(skh.collection(skh.db,'smart_cart_checkouts'), { orderId, transactionToken, buyerId:skh.currentUser.uid, sokopayCoreIds:coreIds, items, totals:calc, selectedCarrier:carrier, paymentMethod:window.smartCartState?.paymentMethod||'sokopay_wallet', createdAt:now() });
      sessionStorage.setItem('pending_sokopay_core_ids', JSON.stringify(coreIds));
      alert(` Order imeundwa na Token Architecture sahihi\nOrder: ${orderId}\nTracking Token imetumwa kwa buyer/seller.\nDelivery Permission Tokens zimehifadhiwa kwa couriers pekee.`);
      skh.activeCheckoutAmount=calc.grandTotal;
      const ca=document.getElementById('checkoutAmount'); if(ca) ca.value=money(calc.grandTotal);
      window.myCart=[]; skh.localStorage.setItem('sokohai_cart','[]');
      if(typeof closeModals==='function') closeModals();
      const chk=document.getElementById('checkoutModal'); if(chk) chk.style.display='flex';
    }catch(e){ alert('Token architecture checkout failed: '+e.message); }
  };

  // Buyer tracking by token.
  window.openTrackingTokenLookup = function(){
    let m=document.getElementById('trackingTokenLookupModal');
    if(!m){ m=document.createElement('div'); m.id='trackingTokenLookupModal'; m.className='overlay-menu'; m.style.cssText='z-index:100012;display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); }
    m.innerHTML=`<div class="spbuyer-modal-card"><div class="spbuyer-head"><div><h2> Track Shipment</h2><small>Enter Tracking Token or open your SokoPay orders</small></div><button class="spbuyer-btn light" onclick="document.getElementById('trackingTokenLookupModal').style.display='none'" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="spbuyer-body"><div class="spbuyer-card"><input id="trackingTokenInput" placeholder="TRK-7F9D-KQ82-2026" style="width:100%;padding:13px;border:1px solid #cbd5e1;border-radius:12px;font-weight:900;text-transform:uppercase;"><button class="spbuyer-btn primary" style="width:100%;margin-top:10px;" onclick="window.trackShipmentByTrackingToken()">Track Shipment</button><button class="spbuyer-btn light" style="width:100%;margin-top:8px;" onclick="window.openSokoPayBuyerOrders&&window.openSokoPayBuyerOrders()">My Orders</button></div><div id="trackingLookupResult"></div></div></div>`;
    m.style.display='flex';
  };
  window.trackShipmentByTrackingToken = async function(token){
    token = (token || document.getElementById('trackingTokenInput')?.value || '').trim().toUpperCase();
    if(!token) return alert('Weka Tracking Token.');
    const box=document.getElementById('trackingLookupResult'); if(box) box.innerHTML='<div class="spbuyer-card">Inatafuta...</div>';
    try{
      const qT=skh.query(skh.collection(skh.db,'sokopay_core_transactions'), skh.where('trackingToken','==',token), skh.limit(1));
      const snap=await skh.getDocs(qT);
      if(snap.empty){ if(box) box.innerHTML='<div class="spbuyer-card" style="color:#e11d48;">Tracking Token haijapatikana.</div>'; return; }
      const d=snap.docs[0];
      if(typeof window.openSokoPayOrderDetail==='function') return window.openSokoPayOrderDetail(d.id);
    }catch(e){ if(box) box.innerHTML='<div class="spbuyer-card" style="color:#e11d48;">Tracking failed: '+safe(e.message)+'</div>'; }
  };

  // Token Center UI: buyer sees tracking/escrow/shipment/contract; delivery permission hidden unless courier verifies.
  window.openSokoPayUnifiedTokenCenter = function(){
    let m=document.getElementById('unifiedTokenCenterModal');
    if(!m){ m=document.createElement('div'); m.id='unifiedTokenCenterModal'; m.className='overlay-menu'; m.style.cssText='z-index:100013;display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); }
    m.innerHTML=`<div class="spbuyer-modal-card"><div class="spbuyer-head"><div><h2> SokoPay Token Center</h2><small>Tracking tokens for buyer/seller. Delivery Permission tokens for assigned couriers only.</small></div><button class="spbuyer-btn light" onclick="document.getElementById('unifiedTokenCenterModal').style.display='none'" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="spbuyer-body"><div class="spbuyer-tabs"><button class="spbuyer-tab active" onclick="window.loadMyBuyerTokens()">My Tokens</button><button class="spbuyer-tab" onclick="window.openTrackingTokenLookup()">Track Shipment</button><button class="spbuyer-tab" onclick="window.openLogisticsTokenModal()">Courier Permission</button></div><div id="myBuyerTokensList"><p style="color:#64748b;text-align:center;">Inapakia tokens...</p></div></div></div>`;
    m.style.display='flex';
    window.loadMyBuyerTokens();
  };
  window.loadMyBuyerTokens = function(){
    const box=document.getElementById('myBuyerTokensList'); if(!box || !skh.currentUser) return;
    try{
      const qTok=skh.query(skh.collection(skh.db,'sokopay_tokens'), skh.where('buyerId','==',skh.currentUser.uid), skh.where('visibleToBuyer','==',true), skh.orderBy('createdAt','desc'), skh.limit(50));
      window.skhOnSnapshot('my-buyer-tokens', qTok, snap=>{
        if(snap.empty){ box.innerHTML='<div class="spbuyer-card" style="text-align:center;color:#64748b;">Huna tokens bado.</div>'; return; }
        box.innerHTML='';
        snap.forEach(d=>{ const t=d.data(); box.innerHTML += `<div class="spbuyer-card"><div style="display:flex;justify-content:space-between;gap:10px;"><b>${safe(t.tokenType).toUpperCase()} TOKEN</b><span class="spbuyer-pill green">${safe(t.status)}</span></div><p style="font-size:12px;color:#64748b;line-height:1.5;"><b>${safe(t.token)}</b><br>${safe(t.tokenPurpose)}<br>Order: ${safe(t.orderId)} • Master: ${safe(t.masterTransactionId)}</p>${t.tokenType==='tracking'?`<button class="spbuyer-btn primary" onclick="window.trackShipmentByTrackingToken('${t.token}')">Track Shipment</button>`:''}</div>`; });
      });
    }catch(e){ box.innerHTML='<div class="spbuyer-card" style="color:#e11d48;">Tokens failed: '+safe(e.message)+'</div>'; }
  };

  // Route old Token Center button to unified UI, but keep courier verification accessible inside it.
  const oldOpenLogisticsToken = window.openLogisticsTokenModal;
  window.openLogisticsTokenModal = function(){
    // If called from courier permission tab? open old modal by holding shift not possible; expose via function.
    if(window.__openCourierPermissionDirect){ window.__openCourierPermissionDirect=false; return oldOpenLogisticsToken ? oldOpenLogisticsToken() : null; }
    return window.openSokoPayUnifiedTokenCenter();
  };
  window.openCourierPermissionTokenVerifier = function(){ window.__openCourierPermissionDirect=true; window.openLogisticsTokenModal(); };
})();

(function injectSokoHaiDeconflictMobileCSS(){
    const css = `
    html, body { max-width:100% !important; overflow-x:hidden !important; }
    * { box-sizing:border-box !important; }

    /* Remove intrusive helper cards that appeared near search/top area */
    #skhFriendlySectionCard { display:none !important; }

    /* Global back button must NOT stay on top of normal screens */
    #skhGlobalBackBtn { display:none !important; }
    body.skh-overlay-active #skhGlobalBackBtn.skh-allowed { display:inline-flex !important; }

    /* Inline back buttons inside modals should be compact, not duplicated everywhere */
    .skh-inline-back-btn { min-height:36px !important; padding:8px 10px !important; margin:0 0 8px !important; font-size:13px !important; background:#eef2f7 !important; color:#0f172a !important; border:1px solid #dbe3ee !important; }
    .overlay-menu .skh-inline-back-btn ~ .skh-inline-back-btn { display:none !important; }

    /* Any modal must fit small smartphones */
    .overlay-menu { padding:8px !important; align-items:center !important; justify-content:center !important; }
    .overlay-menu > div:not(.app-sidebar-desktop), .form-box {
        width:min(96vw, 980px) !important;
        max-width:96vw !important;
        max-height:92vh !important;
        overflow-y:auto !important;
        -webkit-overflow-scrolling:touch !important;
    }

    /* Prevent cart/logistics panels leaking into normal home/search area */
    #cartModal:not([style*="display: flex"]):not([style*="display:flex"]),
    #logisticsMarketplaceModal:not([style*="display: flex"]):not([style*="display:flex"]),
    #sokopayBuyerOrdersModal:not([style*="display: flex"]):not([style*="display:flex"]),
    #sellerOrderInboxModal:not([style*="display: flex"]):not([style*="display:flex"]),
    #logisticsOpsModal:not([style*="display: flex"]):not([style*="display:flex"]) { display:none !important; }

    /* Tables and dashboards should scroll horizontally rather than overflow phone width */
    table, .ct-table, .sp-contracts-table { width:100% !important; max-width:100% !important; }
    .sp-premium-table-wrap, .dashboard-row-block, .ct-card, .sp-widget-card { overflow-x:auto !important; }

    /* Top navigation/search on small phones */
    @media(max-width:600px){
        body { padding-bottom:105px !important; }
        .top-nav-row { padding:8px 10px !important; gap:6px !important; }
        .brand-text { font-size:13px !important; }
        .top-nav-icons { gap:7px !important; font-size:16px !important; }
        .search-nav-row { padding:8px 10px !important; gap:8px !important; }
        .search-wrap { width:100% !important; max-width:none !important; }
        .search-wrap input { height:38px !important; font-size:12px !important; }
        .user-dp { width:34px !important; height:34px !important; }
        .big-announcement { margin:7px 10px !important; padding:8px !important; border-radius:10px !important; }
        .marquee-text { font-size:13px !important; white-space:normal !important; animation:none !important; }
        .cat-trigger-btn { margin:8px 10px 0 !important; padding:10px 12px !important; font-size:12px !important; }
        .market-modes-nav { padding:8px 10px !important; top:54px !important; }
        .mode-tab-btn { font-size:12.5px !important; padding:8px 11px !important; min-height:34px !important; }

        /* Product/service/job/transport grids */
        .main-feed { padding:0 10px !important; }
        .feed-grid { grid-template-columns:repeat(2, minmax(0, 1fr)) !important; gap:10px !important; }
        .feed-card-box { border-radius:14px !important; }
        .feed-info-box { padding:9px 8px !important; }
        .feed-info-box b { font-size:13px !important; }
        /* [R8 MOBILE CARDS] Bei 16px — ilitajaluka SPEC (readable price kwenye 360/390/412). old: 13px. */
        .feed-info-box .price { font-size:16px !important; }
        .strategy-row { margin-right:10px !important; margin-bottom:14px !important; padding:12px 10px 12px 12px !important; }
        .large-card { min-width:132px !important; height:172px !important; }
        .card-img { height:86px !important; }

        /* Bottom nav stays usable but not too tall — and stays BELOW all modals
           (chat 7800+, cart 7600+, overlay-menu 100000) so the "+" button never
           covers the chat writing area or any open dialog */
        .bottom-area-wrapper { z-index:6900 !important; }
        /* [FIX NAV 2026-09-14] CSS hii huingizwa na JS, hivyo ilikuwa
           inashinda stylesheets zote (ikiwemo design system). Ilikuwa
           inabana nav hadi 52px na kulazimisha 12px kwa labels — ndiyo
           sababu "Nyumbani"/"Chat Naye" zilikatika kwenye 320-360px.
           Sasa inafuata design tokens na inashuka kwa skrini finyu. */
        .main-nav-icons { min-height:58px; padding:4px 4px 8px !important; }
        .nav-tab svg { width:19px !important; height:19px !important; margin-bottom:3px !important; }
        .nav-tab span { font-size:clamp(10px, 2.9vw, 12px) !important; letter-spacing:-0.01em !important;
                        text-transform:none !important; font-weight:600 !important; }
        .sell-circle-glow { width:46px !important; height:46px !important; }

        /* Complex cart/logistics/sokopay layouts collapse to one column */
        .fcart-shell, .scart-shell, .lgx-final-shell, .lgx-shell, .spbuyer-modal-card, .ops-modal-card, .prt-pro-card { width:98vw !important; max-width:98vw !important; max-height:94vh !important; border-radius:18px !important; }
        .fcart-body, .scart-body, .prt-grid, .sp-dashboard-grid, .ct-dashboard-layout, .ct-chart-row { grid-template-columns:1fr !important; }
        .fcart-side, .scart-side { border-left:none !important; border-top:1px solid #e2e8f0 !important; }
        .fcart-item, .scart-item, .spbuyer-order-row { grid-template-columns:58px 1fr !important; gap:8px !important; }
        .fcart-item img, .scart-item img, .spbuyer-order-row img { width:58px !important; height:58px !important; }
        .fcart-item > div:last-child, .scart-item-actions, .spbuyer-order-row > div:last-child { grid-column:1/-1 !important; display:flex !important; flex-wrap:wrap !important; gap:6px !important; }
        .fcart-head, .scart-head, .lgx-final-head, .lgx-head, .spbuyer-head, .ops-head, .prt-pro-head { flex-direction:column !important; align-items:flex-start !important; padding:12px !important; }
        .fcart-head-actions, .scart-head-actions { width:100% !important; }
        .fcart-head-actions button, .scart-head-actions button { flex:1 !important; }
        .lgx-final-toolbar, .lgx-toolbar, .prt-row-2, .prt-row-3, .spbuyer-grid, .ops-grid { grid-template-columns:1fr !important; }
        .lgx-final-grid, .lgx-grid { grid-template-columns:1fr !important; }

    }

    @media(max-width:380px){
        .feed-grid { grid-template-columns:1fr 1fr !important; gap:8px !important; }
        .feed-info-box b { font-size:13px !important; }
        .top-nav-icons span { font-size:14px !important; }
        .brand-text { font-size:12px !important; }
        .fcart-btn, .scart-btn, .lgx-btn, .spbuyer-btn, .ops-btn { font-size:12px !important; padding:7px 8px !important; min-height:34px !important; }
    } `;
    const st=document.createElement('style'); st.id='sokohaiDeconflictMobileCSS'; st.textContent=css; document.head.appendChild(st);
})();

window.skhRefreshBackButton = function(){
    // [ONDOSHWA] Hakuna kitufe cha global back tena — hakuna cha kuboresha.
};

window.skhAddInlineBackButtons = function(){
    // [ONDOSHWA] Vitufe vya "Rudi Nyuma" vilivyoingizwa kwenye overlays vimeondolewa —
    // viliharibu muonekano. Kila modal sasa inatumia kitufe chake cha asili.
};

window.skhFriendlyModuleHeader = function(){ const el=document.getElementById('skhFriendlySectionCard'); if(el) el.remove(); };

setInterval(()=>{ document.getElementById('skhFriendlySectionCard')?.remove(); }, 1000);

/* [AUDIT-FIX §nav] DUPLICATE handlers zimeondolewa — zilikuwa zikarudisha
   kuruka 'skh-keyboard-open' kwa kila input focus bila ukaguzi. Handlers
   za msingi (skhInputFocusHandler/skhInputBlurHandler + skhKeyboardStateSync)
   juu hapo hapa kwenye faili hili hushughulikia hilo sasa. */

window.scanAndFixSokoHaiUI = function(){
    document.getElementById('skhFriendlySectionCard')?.remove();
    window.skhRefreshBackButton?.();
    window.skhAddInlineBackButtons?.();
    // Alert removed: UI scan/fix now runs silently.
};

setTimeout(()=>window.scanAndFixSokoHaiUI?.(),1200);

(function(){
  if(window.__SOKOHAI_LMS_FINAL__) return;
  window.__SOKOHAI_LMS_FINAL__ = true;

  const LS_KEY = 'sokohai_language';
  const DEFAULT_LANG = 'sw';
  const supported = ['sw','en'];

  const dict = {
    sw: {
      app_name:'SokoHai', language:'Lugha', language_region:'Lugha na Eneo', english:'English', swahili:'Kiswahili', save:'Hifadhi', close:'Funga', back:'Rudi', back_full:'Rudi Nyuma', cancel:'Ghairi', continue:'Endelea', continue_shopping:'Endelea Kununua', clear_cart:'Futa Kikapu', save_for_later:'Hifadhi Baadaye', checkout:'Endelea Kulipa', proceed_checkout:'Endelea hadi Kulipa', confirm_order:'Thibitisha Oda', cart:'Kikapu', my_cart:'Kikapu Changu', products:'Bidhaa', product_information:'Taarifa za Bidhaa', services:'Huduma', transport:'Usafiri', marketplace:'Soko', shipping:'Usafirishaji', delivery:'Uwasilishaji', delivery_selection:'Uchaguzi wa Uwasilishaji', select_delivery:'Chagua Uwasilishaji', logistics_marketplace:'SokoHai Logistics', selected_logistics:'Logistics Iliyochaguliwa', vehicle:'Gari', eta:'Muda wa Kufika', shipping_cost:'Gharama ya Usafirishaji', insurance:'Bima', tracking:'Ufuatiliaji', track_shipment:'Fuatilia Mzigo', payment:'Malipo', payment_method:'Njia ya Malipo', escrow:'Escrow / Ulinzi wa Malipo', escrow_protection:'Ulinzi wa Malipo wa SokoPay', order_summary:'Muhtasari wa Oda', cost_breakdown:'Mchanganuo wa Gharama', total:'Jumla', subtotal:'Jumla Ndogo', discount:'Punguzo', tax:'Kodi', notes:'Maelezo', order_notes:'Maelezo ya Oda', seller:'Muuzaji', buyer:'Mnunuzi', verified:'Imethibitishwa', verified_seller:'Muuzaji Aliyethibitishwa', seller_communication:'Mawasiliano na Muuzaji', send_message:'Tuma Ujumbe', open_chat:'Fungua Chat', chat:'Chat', comment:'Maoni', comments:'Maoni Yote', messages:'Ujumbe', notifications:'Taarifa', profile:'Wasifu Wangu', verification_center:'Kituo cha Uthibitisho', security:'Usalama', privacy:'Faragha', permissions:'Ruhusa', appearance:'Muonekano', accessibility:'Ufikikaji', connected_devices:'Vifaa Vilivyounganishwa', downloads_offline:'Vipakuliwa na Nje ya Mtandao', backup_sync:'Backup na Usawazishaji', login_sessions:'Kuingia na Vikao', data_storage:'Data na Hifadhi', payment_methods:'Njia za Malipo', digital_identity:'Utambulisho wa Kidigitali', ai_settings:'Mipangilio ya AI', feedback:'Maoni na Mapendekezo', help_center:'Kituo cha Msaada', tutorials:'Mafunzo', contact_support:'Wasiliana na Msaada', report_problem:'Ripoti Tatizo', rate_app:'Kadiria SokoHai', terms:'Masharti ya Matumizi', privacy_policy:'Sera ya Faragha', about:'Kuhusu SokoHai', logout:'Toka', search:'Tafuta', filter:'Chuja', sort:'Panga', suggested:'Zilizopendekezwa', sponsored:'Zilizodhaminiwa', nearby:'Karibu', premium:'Premium', standard:'Kawaida', economy:'Nafuu', view_details:'Ona Maelezo', select:'Chagua', selected:'Imechaguliwa', company_details:'Maelezo ya Kampuni', vehicle_selection:'Chagua Gari', motorcycle:'Pikipiki', bajaj:'Bajaji', car:'Gari Ndogo', pickup:'Pickup', van:'Van', truck:'Lori', trailer:'Trailer', container:'Kontena', refrigerated_truck:'Lori la Baridi', token_center:'Kituo cha Token', tracking_token:'Token ya Ufuatiliaji', delivery_permission_token:'Token ya Ruhusa ya Uwasilishaji', escrow_token:'Token ya Escrow', contract_token:'Token ya Mkataba', verification_token:'Token ya Uthibitisho', shipment_token:'Token ya Mzigo', payment_token:'Token ya Malipo', master_transaction_id:'Master Transaction ID', order_created:'Oda Imeundwa', payment_received:'Malipo Yamepokelewa', payment_protected:'Malipo Yamelindwa', seller_confirmed:'Muuzaji Amethibitisha', packed:'Imefungashwa', courier_assigned:'Courier Amepangiwa', picked_up:'Imechukuliwa', in_transit:'Ipo Safarini', delivered:'Imewasilishwa', completed:'Imekamilika', dispute:'Mgogoro', raise_dispute:'Fungua Mgogoro', confirm_delivery:'Thibitisha Uwasilishaji', receipt:'Risiti', invoice:'Ankara', delivery_note:'Hati ya Uwasilishaji', warranty:'Dhamana', contract:'Mkataba', download_receipt:'Pakua Risiti', live_map:'Ramani Live', location:'Eneo', exact_location:'Eneo Sahihi', accuracy:'Usahihi', source:'Chanzo', quality:'Ubora', coordinates:'Coordinates', distance:'Umbali', route:'Njia', media:'Media', audio:'Sauti', video:'Video', photos:'Picha', live:'LIVE', start_live:'Anza LIVE', watch_live:'Tazama LIVE', request_access:'Omba Ruhusa', safe:'Nipo Salama', network_error:'Hitilafu ya Mtandao', permission_denied:'Ruhusa Imekataliwa', required_field:'Jaza sehemu muhimu', no_items:'Hakuna vitu', loading:'Inapakia', processing:'Inashughulikia', success:'Imefanikiwa', failed:'Imeshindikana', settings:'Mipangilio', language_center:'Kituo cha Lugha', language_audit:'Ukaguzi wa Lugha', missing_translation:'Tafsiri Inakosekana', duplicate_translation:'Tafsiri Imejirudia', hardcoded_text:'Maandishi Yaliyowekwa Moja kwa Moja', translation_status:'Hali ya Tafsiri', published:'Imechapishwa', draft:'Rasimu', reviewed:'Imekaguliwa', deprecated:'Imeondolewa Matumizini', switch_language:'Badili Lugha', no_mixed_language:'Hakuna Kuchanganya Lugha', apply_language:'Tumia Lugha', export:'Export', import:'Import', audit_now:'Kagua Sasa'
    },
    en: {
      app_name:'SokoHai', language:'Language', language_region:'Language & Region', english:'English', swahili:'Kiswahili', save:'Save', close:'Close', back:'Back', back_full:'Go Back', cancel:'Cancel', continue:'Continue', continue_shopping:'Continue Shopping', clear_cart:'Clear Cart', save_for_later:'Save for Later', checkout:'Checkout', proceed_checkout:'Proceed to Checkout', confirm_order:'Confirm Order', cart:'Cart', my_cart:'My Cart', products:'Products', product_information:'Product Information', services:'Services', transport:'Transport', marketplace:'Marketplace', shipping:'Shipping', delivery:'Delivery', delivery_selection:'Delivery Selection', select_delivery:'Select Delivery', logistics_marketplace:'SokoHai Logistics Marketplace', selected_logistics:'Selected Logistics', vehicle:'Vehicle', eta:'ETA', shipping_cost:'Shipping Cost', insurance:'Insurance', tracking:'Tracking', track_shipment:'Track Shipment', payment:'Payment', payment_method:'Payment Method', escrow:'Escrow', escrow_protection:'SokoPay Escrow Protection', order_summary:'Order Summary', cost_breakdown:'Cost Breakdown', total:'Total', subtotal:'Subtotal', discount:'Discount', tax:'Tax', notes:'Notes', order_notes:'Order Notes', seller:'Seller', buyer:'Buyer', verified:'Verified', verified_seller:'Verified Seller', seller_communication:'Seller Communication', send_message:'Send Message', open_chat:'Open Chat', chat:'Chat', comment:'Comment', comments:'Comments', messages:'Messages', notifications:'Notifications', profile:'My Profile', verification_center:'Verification Center', security:'Security', privacy:'Privacy', permissions:'Permissions', appearance:'Appearance', accessibility:'Accessibility', connected_devices:'Connected Devices', downloads_offline:'Downloads & Offline', backup_sync:'Backup & Sync', login_sessions:'Login & Sessions', data_storage:'Data & Storage', payment_methods:'Payment Methods', digital_identity:'Digital Identity', ai_settings:'AI Assistant Settings', feedback:'Feedback & Suggestions', help_center:'Help Center', tutorials:'Tutorials', contact_support:'Contact Support', report_problem:'Report a Problem', rate_app:'Rate SokoHai', terms:'Terms of Service', privacy_policy:'Privacy Policy', about:'About SokoHai', logout:'Logout', search:'Search', filter:'Filter', sort:'Sort', suggested:'Suggested', sponsored:'Sponsored', nearby:'Nearby', premium:'Premium', standard:'Standard', economy:'Economy', view_details:'View Details', select:'Select', selected:'Selected', company_details:'Company Details', vehicle_selection:'Vehicle Selection', motorcycle:'Motorcycle', bajaj:'Bajaj', car:'Car', pickup:'Pickup', van:'Van', truck:'Truck', trailer:'Trailer', container:'Container', refrigerated_truck:'Refrigerated Truck', token_center:'Token Center', tracking_token:'Tracking Token', delivery_permission_token:'Delivery Permission Token', escrow_token:'Escrow Token', contract_token:'Contract Token', verification_token:'Verification Token', shipment_token:'Shipment Token', payment_token:'Payment Token', master_transaction_id:'Master Transaction ID', order_created:'Order Created', payment_received:'Payment Received', payment_protected:'Payment Protected', seller_confirmed:'Seller Confirmed', packed:'Packed', courier_assigned:'Courier Assigned', picked_up:'Picked Up', in_transit:'In Transit', delivered:'Delivered', completed:'Completed', dispute:'Dispute', raise_dispute:'Raise Dispute', confirm_delivery:'Confirm Delivery', receipt:'Receipt', invoice:'Invoice', delivery_note:'Delivery Note', warranty:'Warranty', contract:'Contract', download_receipt:'Download Receipt', live_map:'Live Map', location:'Location', exact_location:'Exact Location', accuracy:'Accuracy', source:'Source', quality:'Quality', coordinates:'Coordinates', distance:'Distance', route:'Route', media:'Media', audio:'Audio', video:'Video', photos:'Photos', live:'LIVE', start_live:'Start LIVE', watch_live:'Watch LIVE', request_access:'Request Access', safe:'I am Safe', network_error:'Network Error', permission_denied:'Permission Denied', required_field:'Required field', no_items:'No items', loading:'Loading', processing:'Processing', success:'Success', failed:'Failed', settings:'Settings', language_center:'Language Center', language_audit:'Language Audit', missing_translation:'Missing Translation', duplicate_translation:'Duplicate Translation', hardcoded_text:'Hardcoded Text', translation_status:'Translation Status', published:'Published', draft:'Draft', reviewed:'Reviewed', deprecated:'Deprecated', switch_language:'Switch Language', no_mixed_language:'No Mixed Language', apply_language:'Apply Language', export:'Export', import:'Import', audit_now:'Audit Now'
    }
  };

  const phraseKey = { 'My Cart':'my_cart','Kikapu Chako':'my_cart','Kikapu Changu':'my_cart','Cart':'cart','Kikapu':'cart','Checkout':'checkout','Endelea Kulipa':'checkout','Proceed to Checkout':'proceed_checkout','Clear Cart':'clear_cart','Futa Kikapu':'clear_cart','Continue Shopping':'continue_shopping','Endelea Kununua':'continue_shopping','Save for Later':'save_for_later','Hifadhi Baadaye':'save_for_later','Products':'products','Bidhaa':'products','Product Information':'product_information','Taarifa za Bidhaa':'product_information','Delivery Selection':'delivery_selection','Uchaguzi wa Uwasilishaji':'delivery_selection','Chagua Uwasilishaji':'select_delivery','Select Delivery':'select_delivery','SokoHai Logistics Marketplace':'logistics_marketplace','Selected Logistics':'selected_logistics','Vehicle':'vehicle','Gari':'vehicle','Shipping Cost':'shipping_cost','Gharama ya Usafirishaji':'shipping_cost','Escrow Protection':'escrow_protection','Ulinzi wa Malipo wa SokoPay':'escrow_protection','Order Summary':'order_summary','Muhtasari wa Oda':'order_summary','Payment Method':'payment_method','Njia ya Malipo':'payment_method','Seller Communication':'seller_communication','Mawasiliano na Muuzaji':'seller_communication','Send Message':'send_message','Tuma Ujumbe':'send_message','Open Chat':'open_chat','Fungua Chat':'open_chat','Track Shipment':'track_shipment','Fuatilia Mzigo':'track_shipment','View Details':'view_details','Ona Maelezo':'view_details','Select':'select','Chagua':'select','Token Center':'token_center','Kituo cha Token':'token_center','Tracking Token':'tracking_token','Token ya Ufuatiliaji':'tracking_token','Delivery Permission Token':'delivery_permission_token','Token ya Ruhusa ya Uwasilishaji':'delivery_permission_token','Language & Region':'language_region','Lugha na Eneo':'language_region','Security':'security','Usalama':'security','Privacy':'privacy','Faragha':'privacy','Notifications':'notifications','Taarifa':'notifications','Messages':'messages','Ujumbe':'messages','Help Center':'help_center','Kituo cha Msaada':'help_center','Logout':'logout','Toka':'logout','Search':'search','Tafuta':'search','Filter':'filter','Chuja':'filter','Sort':'sort','Panga':'sort','Nearby':'nearby','Karibu':'nearby','Verified':'verified','Imethibitishwa':'verified','Premium':'premium','Standard':'standard','Economy':'economy','Nafuu':'economy','Route':'route','Njia':'route','Location':'location','Eneo':'location','Exact Location':'exact_location','Eneo Sahihi':'exact_location','Accuracy':'accuracy','Usahihi':'accuracy','Distance':'distance','Umbali':'distance','Media':'media','Audio':'audio','Sauti':'audio','Video':'video','Photos':'photos','Picha':'photos','Chat':'chat','Close':'close','Funga':'close','Back':'back','Rudi':'back','Go Back':'back_full','Rudi Nyuma':'back_full','Cancel':'cancel','Ghairi':'cancel','Save':'save','Hifadhi':'save'
  };

  const LMS = {
    dict, phraseKey, supported,
    lang: (function(){ try { var s = skh.localStorage.getItem(LS_KEY); return supported.includes(s) ? s : DEFAULT_LANG; } catch(e){ return DEFAULT_LANG; } })(),
    t(key, vars={}){
      const d = dict[this.lang] || dict[DEFAULT_LANG];
      let s = d[key] || dict.en[key] || dict.sw[key] || key;
      Object.keys(vars||{}).forEach(k => s = s.replaceAll('{'+k+'}', vars[k]));
      return s;
    },
    keyFromPhrase(text){
      const clean = String(text||'').replace(/\s+/g,' ').trim();
      return phraseKey[clean] || null;
    },
    splitIcon(text){
      const raw = String(text || '').trim();
      // Keep common leading icons/arrows/numbers without using fragile Unicode regex escapes.
      const m = raw.match(/^([^A-Za-zÀ-ÿ]+)([A-Za-zÀ-ÿ].*)$/);
      if(m && m[2].trim()) return {prefix:m[1], core:m[2].trim()};
      return {prefix:'', core:raw};
    },
    translatePhrase(text){
      if(!text || !String(text).trim()) return text;
      const {prefix, core} = this.splitIcon(text);
      const key = this.keyFromPhrase(core) || this.keyFromPhrase(String(text).trim());
      if(!key) return text;
      return (prefix || '') + this.t(key);
    },
    setLanguage(lang){
      if(!supported.includes(lang)) lang = DEFAULT_LANG;
      this.lang = lang;
      skh.localStorage.setItem(LS_KEY, lang);
      document.documentElement.lang = lang === 'sw' ? 'sw' : 'en';
      this.apply(document.body);
      document.dispatchEvent(new CustomEvent('sokohai:languageChanged', {detail:{lang}}));
    },
    apply(root=document.body){
      if(!root) return;
      root.querySelectorAll('[data-i18n]').forEach(el => {
        const key=el.getAttribute('data-i18n'); if(!key) return;
        const txt=this.t(key);
        // [FIX 2026-09-14] `textContent=` ilifuta SVG ya icon iliyokuwa ndani
        // (vipengele vyenye data-skh-icon), hivyo menyu zilibaki bila icons.
        // Sasa tunabadilisha MAANDISHI pekee na kuacha icon mahali pake.
        const ico = el.querySelector('svg, img, .skh-ico');
        if(ico){
          let hit=false;
          el.childNodes.forEach(n=>{ if(n.nodeType===3 && n.nodeValue.trim()){ n.nodeValue=' '+txt; hit=true; } });
          if(!hit) el.appendChild(document.createTextNode(' '+txt));
        } else {
          el.textContent = txt;
        }
      });
      root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { const key=el.getAttribute('data-i18n-placeholder'); if(key) el.setAttribute('placeholder', this.t(key)); });
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node){
          const p=node.parentElement;
          if(!p) return NodeFilter.FILTER_REJECT;
          const tag=p.tagName;
          if(['SCRIPT','STYLE','TEXTAREA','INPUT','SELECT','OPTION','CODE','PRE'].includes(tag)) return NodeFilter.FILTER_REJECT;
          // [FIX 2026-09-14] Kipengele chenye `data-i18n` tayari kinatafsiriwa
          // na applyLanguage(). Sweep ya phrase ilikuwa inaandika juu yake na
          // kubadilisha maandishi sahihi kuwa mengine (mf. nav "Chat" ikawa
          // "Chat Naye", ikakatika kwenye simu ndogo). Iachwe.
          if(p.hasAttribute('data-i18n') || p.closest('[data-i18n],[data-no-i18n],.nav-tab')) return NodeFilter.FILTER_REJECT;
          const txt=node.nodeValue.replace(/\s+/g,' ').trim();
          if(!txt || txt.length>60) return NodeFilter.FILTER_REJECT;
          if(!LMS.keyFromPhrase(LMS.splitIcon(txt).core) && !LMS.keyFromPhrase(txt)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n => { const tr=this.translatePhrase(n.nodeValue); if(tr!==n.nodeValue) n.nodeValue=n.nodeValue.replace(n.nodeValue.trim(), tr.trim()); });
      root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => { const tr=this.translatePhrase(el.getAttribute('placeholder')); if(tr!==el.getAttribute('placeholder')) el.setAttribute('placeholder', tr); });
      root.querySelectorAll('button, a, span, b, small, label, option, h1, h2, h3, h4').forEach(el => {
        if(el.children.length) return;
        // [FIX 2026-09-14] Usiguse vilivyo na data-i18n wala labels za nav.
        if(el.hasAttribute('data-i18n') || el.closest('[data-i18n],[data-no-i18n],.nav-tab')) return;
        const txt=el.textContent?.trim();
        if(!txt || txt.length>70) return;
        const tr=this.translatePhrase(txt);
        if(tr!==txt) el.textContent=tr;
      });
    },
    audit(root=document.body){
      const missing=[]; const hardcoded=[]; const duplicates=[];
      const keys=new Set([...Object.keys(dict.sw),...Object.keys(dict.en)]);
      keys.forEach(k => { supported.forEach(lang => { if(!dict[lang][k]) missing.push({key:k, lang}); }); });
      const seenValue={};
      Object.entries(dict[this.lang]).forEach(([k,v]) => { const vv=String(v).toLowerCase(); if(seenValue[vv]) duplicates.push({value:v, keys:[seenValue[vv],k]}); else seenValue[vv]=k; });
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){ const p=node.parentElement; if(!p||['SCRIPT','STYLE','TEXTAREA','INPUT','CODE','PRE'].includes(p.tagName)) return NodeFilter.FILTER_REJECT; const t=node.nodeValue.trim(); if(t.length<3||t.length>55) return NodeFilter.FILTER_REJECT; if(LMS.keyFromPhrase(LMS.splitIcon(t).core)||LMS.keyFromPhrase(t)) return NodeFilter.FILTER_REJECT; if(/[A-Za-zÀ-ÿ]/.test(t)) return NodeFilter.FILTER_ACCEPT; return NodeFilter.FILTER_REJECT; }});
      let count=0; while(walker.nextNode() && count<100){ hardcoded.push(walker.currentNode.nodeValue.trim()); count++; }
      return {lang:this.lang, missing, duplicates, hardcoded};
    },
    register(key, en, sw, status='draft'){
      dict.en[key]=en; dict.sw[key]=sw; phraseKey[en]=key; phraseKey[sw]=key;
      const custom=JSON.parse(skh.localStorage.getItem('sokohai_lms_custom')||'{}'); custom[key]={en,sw,status,updatedAt:new Date().toISOString()}; skh.localStorage.setItem('sokohai_lms_custom',JSON.stringify(custom));
    },
    loadCustom(){ try{ const custom=JSON.parse(skh.localStorage.getItem('sokohai_lms_custom')||'{}'); Object.entries(custom).forEach(([k,v])=>this.register(k,v.en,v.sw,v.status)); }catch(e){} }
  };

  window.SokoHaiLMS = LMS;
  LMS.loadCustom();

  window.t = function(key, vars){ return window.SokoHaiLMS.t(key, vars); };
  window.setSokoHaiLanguage = function(lang){ window.SokoHaiLMS.setLanguage(lang); };
  window.trNotify = function(key, vars){ return window.SokoHaiLMS.t(key, vars); };
  window.trError = function(key, vars){ return window.SokoHaiLMS.t(key, vars); };
  window.trSMS = function(key, vars){ return window.SokoHaiLMS.t(key, vars); };
  window.trPDF = function(key, vars){ return window.SokoHaiLMS.t(key, vars); };

  const oldAlert = window.alert;
  window.alert = function(msg){ oldAlert.call(window, LMS.translatePhrase(String(msg))); };
  const oldConfirm = window.confirm;
  window.confirm = function(msg){ return oldConfirm.call(window, LMS.translatePhrase(String(msg))); };

  window.openSokoHaiLanguageCenter = function(){
    let m=document.getElementById('sokohaiLanguageCenterModal');
    if(!m){ m=document.createElement('div'); m.id='sokohaiLanguageCenterModal'; m.className='overlay-menu'; m.style.cssText='z-index:100020;display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); }
    const audit=LMS.audit(document.body);
    m.innerHTML=`<div class="skh-settings-modal-card"><div class="skh-settings-head"><div><b> ${LMS.t('language_center')}</b><br><small>${LMS.t('no_mixed_language')}</small></div><button class="skh-menu-close" onclick="document.getElementById('sokohaiLanguageCenterModal').style.display='none'" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="skh-settings-body"><div class="skh-setting-card"><b>${LMS.t('switch_language')}</b><p>${LMS.lang==='sw'?'Mfumo wote utumie lugha moja kwa wakati mmoja.':'The whole system uses one language at a time.'}</p><div style="display:flex;gap:8px;margin-top:10px;"><button class="skh-action-btn" style="flex:1;${LMS.lang==='sw'?'background:#10b981;':''}" onclick="window.setSokoHaiLanguage('sw'); window.openSokoHaiLanguageCenter();">Kiswahili</button><button class="skh-action-btn" style="flex:1;${LMS.lang==='en'?'background:#10b981;':''}" onclick="window.setSokoHaiLanguage('en'); window.openSokoHaiLanguageCenter();">English</button></div></div><div class="skh-setting-card"><b>${LMS.t('language_audit')}</b><p>${LMS.t('missing_translation')}: ${audit.missing.length}<br>${LMS.t('duplicate_translation')}: ${audit.duplicates.length}<br>${LMS.t('hardcoded_text')}: ${audit.hardcoded.length}</p><button class="skh-action-btn" onclick="window.runSokoHaiLanguageAudit()">${LMS.t('audit_now')}</button></div><div class="skh-setting-card"><b>Add Translation Key</b><div class="skh-setting-row"><span>Key</span><input id="lmsKey" style="width:60%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;"></div><div class="skh-setting-row"><span>English</span><input id="lmsEn" style="width:60%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;"></div><div class="skh-setting-row"><span>Kiswahili</span><input id="lmsSw" style="width:60%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;"></div><button class="skh-action-btn" onclick="window.addSokoHaiTranslationKey()">${LMS.t('save')}</button></div><div class="skh-setting-card"><b>Hardcoded Text Sample</b><p style="max-height:130px;overflow:auto;font-size:13px;">${audit.hardcoded.slice(0,30).map(x=>'- '+x).join('<br>') || 'None'}</p></div></div></div>`;
    m.style.display='flex';
  };
  window.addSokoHaiTranslationKey = function(){ const k=document.getElementById('lmsKey')?.value?.trim(); const en=document.getElementById('lmsEn')?.value?.trim(); const sw=document.getElementById('lmsSw')?.value?.trim(); if(!k||!en||!sw) return alert('Required field'); LMS.register(k,en,sw,'draft'); LMS.apply(document.body); alert('Success'); window.openSokoHaiLanguageCenter(); };
  window.runSokoHaiLanguageAudit = function(){ const a=LMS.audit(document.body); console.table(a.hardcoded); alert(`${LMS.t('language_audit')}\n${LMS.t('missing_translation')}: ${a.missing.length}\n${LMS.t('duplicate_translation')}: ${a.duplicates.length}\n${LMS.t('hardcoded_text')}: ${a.hardcoded.length}`); };

  // Hook account menu Language & Region to LMS Center.
  const oldOpenSetting = window.openSokoHaiAccountSetting;
  window.openSokoHaiAccountSetting = function(key){
    if(key === 'language') return window.openSokoHaiLanguageCenter();
    return oldOpenSetting ? oldOpenSetting.apply(this, arguments) : null;
  };

  // Debounced apply after DOM changes. Avoid translating while user is typing.
  let timer=null;
  const obs=new MutationObserver(muts=>{
    if(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    clearTimeout(timer); timer=setTimeout(()=>LMS.apply(document.body),250);
  });
  setTimeout(()=>{ try{ obs.observe(document.body,{childList:true,subtree:true}); LMS.setLanguage(LMS.lang); }catch(e){} },700);
})();

(function(){
  if(window.__TOKEN_CENTER_LOGIN_FIX__) return;
  window.__TOKEN_CENTER_LOGIN_FIX__ = true;

  const esc = s => typeof skh.skhEscape === 'function' ? skh.skhEscape(s||'') : String(s||'');
  const oldAlert = window.alert;
  window.alert = function(msg){
    const text = String(msg ?? '');
    // Remove login welcome popup when entering SokoHai; keep real warnings/errors.
    if(/^Karibu\s+/i.test(text.trim()) || /^Welcome\s+/i.test(text.trim())) {
      console.log('[SokoHai] Login welcome suppressed:', text);
      return;
    }
    return oldAlert.call(window, msg);
  };

  const prevTokenCenter = window.openSokoPayUnifiedTokenCenter || null;
  const prevOpenLogisticsTokenModal = window.openLogisticsTokenModal || null;

  function ensureCSS(){
    if(document.getElementById('tokenCenterPolishCSS')) return;
    const css = `
    .tok-shell{width:96%;max-width:880px;max-height:92vh;background:#fff;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 72px rgba(15,23,42,.45)}
    .tok-head{background:linear-gradient(135deg,#0f172a,#00509d);color:#fff;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}.tok-head h2{margin:0;font-size:18px}.tok-head small{color:#cbd5e1;font-size:13px}.tok-body{background:#f8fafc;padding:14px;overflow-y:auto}.tok-tabs{display:flex;gap:7px;overflow-x:auto;margin-bottom:12px}.tok-tab{border:1px solid #dbe3ee;background:#fff;color:#334155;border-radius:999px;padding:9px 13px;font-size:13px;font-weight:950;white-space:nowrap;cursor:pointer}.tok-tab.active{background:#00509d;color:#fff;border-color:#00509d}.tok-card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:14px;margin-bottom:12px;box-shadow:0 4px 14px rgba(15,23,42,.04)}
    .tok-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.tok-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:10px}.tok-box small{display:block;color:#64748b;font-size:12px;font-weight:950;text-transform:uppercase}.tok-box b{display:block;color:#0f172a;font-size:12px;margin-top:4px;word-break:break-word}.tok-pill{display:inline-flex;padding:3px 8px;border-radius:999px;background:#eef2f7;color:#334155;border:1px solid #dbe3ee;font-size:12px;font-weight:950}.tok-pill.green{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.tok-pill.amber{background:#fffbeb;color:#b45309;border-color:#fde68a}.tok-pill.red{background:#fff5f5;color:#991b1b;border-color:#fecaca}.tok-btn{border:none;border-radius:12px;min-height:40px;padding:9px 12px;font-size:13px;font-weight:950;cursor:pointer}.tok-btn.primary{background:#00509d;color:#fff}.tok-btn.dark{background:#0f172a;color:#fff}.tok-btn.green{background:#10b981;color:#fff}.tok-btn.red{background:#e11d48;color:#fff}.tok-btn.light{background:#eef2f7;color:#0f172a;border:1px solid #dbe3ee}.tok-input{width:100%;border:1px solid #cbd5e1;border-radius:13px;padding:13px;font-size:14px;font-weight:900;text-transform:uppercase;outline:none;box-sizing:border-box;background:#fff}.tok-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.tok-row .tok-btn{flex:1 1 140px}
    @media(max-width:560px){.tok-shell{width:98%;max-height:94vh;border-radius:18px}.tok-head{flex-direction:column;align-items:flex-start}.tok-tabs{padding-bottom:3px}.tok-tab{font-size:12.5px;padding:8px 11px}.tok-row .tok-btn{flex:1 1 100%}} `;
    const st=document.createElement('style'); st.id='tokenCenterPolishCSS'; st.textContent=css; document.head.appendChild(st);
  }

  window.openSokoPayUnifiedTokenCenter = function(tab='my'){
    ensureCSS();
    let m=document.getElementById('unifiedTokenCenterModal');
    if(!m){ m=document.createElement('div'); m.id='unifiedTokenCenterModal'; m.className='overlay-menu'; m.style.cssText='z-index:100013;display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); }
    m.innerHTML = `<div class="tok-shell"><div class="tok-head"><div><h2> SokoPay Token Center</h2><small>Tracking Token ≠ Delivery Permission Token. Kila token ina kazi yake.</small></div><button class="tok-btn light" onclick="document.getElementById('unifiedTokenCenterModal').style.display='none'"> Funga</button></div><div class="tok-body"><div class="tok-tabs"><button id="tokTab_my" class="tok-tab" onclick="window.renderTokenCenterTab('my')">My Tokens</button><button id="tokTab_track" class="tok-tab" onclick="window.renderTokenCenterTab('track')">Track Shipment</button><button id="tokTab_courier" class="tok-tab" onclick="window.renderTokenCenterTab('courier')">Courier Permission</button><button id="tokTab_info" class="tok-tab" onclick="window.renderTokenCenterTab('info')">Token Types</button></div><div id="tokenCenterContent"></div></div></div>`;
    m.style.display='flex';
    window.renderTokenCenterTab(tab);
  };

  window.renderTokenCenterTab = function(tab='my'){
    document.querySelectorAll('.tok-tab').forEach(b=>b.classList.remove('active'));
    document.getElementById('tokTab_'+tab)?.classList.add('active');
    const box=document.getElementById('tokenCenterContent'); if(!box) return;
    if(tab==='track'){
      box.innerHTML = `<div class="tok-card"><b> Track Shipment kwa Tracking Token</b><p style="font-size:12px;color:#64748b;line-height:1.5;">Tracking Token ni ya Buyer/Seller kufuatilia mzigo. Haibadiliki mpaka order ikamilike.</p><input id="trackingTokenInput" class="tok-input" placeholder="TRK-7F9D-KQ82-2026"><div class="tok-row"><button class="tok-btn primary" onclick="window.trackShipmentByTrackingToken()">Track Shipment</button><button class="tok-btn light" onclick="window.renderTokenCenterTab('my')">My Tokens</button></div></div><div id="trackingLookupResult"></div>`;
      return;
    }
    if(tab==='courier'){
      box.innerHTML = `<div class="tok-card"><b> Courier Delivery Permission Token</b><p style="font-size:12px;color:#64748b;line-height:1.5;">Hii si tracking token. Ni ruhusa ya courier aliyechaguliwa kuchukua/kukabidhi mzigo kwenye stage maalum. Identity verification inatumia SokoHai Verification Engine iliyopo.</p><input id="inlineCourierPermissionToken" class="tok-input" placeholder="DLV-XXXX-XXXX-2026"><div class="tok-row"><button class="tok-btn green" onclick="window.verifyInlineCourierPermissionToken()">Verify Permission</button><button class="tok-btn dark" onclick="window.openCourierPermissionTokenVerifier && window.openCourierPermissionTokenVerifier()">Open Full Verifier</button></div></div><div id="inlineCourierPermissionResult"></div>`;
      return;
    }
    if(tab==='info'){
      box.innerHTML = `<div class="tok-card"><b>Token Responsibilities</b><div class="tok-grid" style="margin-top:10px;"><div class="tok-box"><small>Tracking Token</small><b>Buyer/Seller tracking</b></div><div class="tok-box"><small>Delivery Permission</small><b>Current courier authorization</b></div><div class="tok-box"><small>Escrow Token</small><b>SokoPay protected funds</b></div><div class="tok-box"><small>Contract Token</small><b>Buyer/Seller agreement</b></div><div class="tok-box"><small>Verification Token</small><b>System step verification</b></div><div class="tok-box"><small>Shipment Token</small><b>Shipment engine link</b></div></div></div>`;
      return;
    }
    box.innerHTML = `<div class="tok-card"><b>My Token Center</b><p style="font-size:12px;color:#64748b;">Inaonyesha tokens zako zinazoonekana kwa buyer/seller. Delivery Permission Tokens hazionekani hapa.</p><div id="myBuyerTokensList"><p style="text-align:center;color:#64748b;">Inapakia tokens...</p></div></div>`;
    window.loadMyBuyerTokensPolished();
  };

  window.loadMyBuyerTokensPolished = function(){
    const list=document.getElementById('myBuyerTokensList'); if(!list) return;
    if(!skh.currentUser){ list.innerHTML='<p style="color:#e11d48;">Ingia kwanza kuona tokens.</p>'; return; }
    try{
      const qTok=skh.query(skh.collection(skh.db,'sokopay_tokens'), skh.where('buyerId','==',skh.currentUser.uid), skh.where('visibleToBuyer','==',true), skh.orderBy('createdAt','desc'), skh.limit(50));
      window.skhOnSnapshot('my-buyer-tokens-polished', qTok, snap=>{
        if(snap.empty){ list.innerHTML='<div style="text-align:center;color:#64748b;padding:20px;">Huna tokens bado.</div>'; return; }
        list.innerHTML='';
        snap.forEach(d=>{
          const t=d.data();
          const cls=String(t.status).includes('active')?'green':String(t.status).includes('waiting')?'amber':'';
          list.innerHTML += `<div class="tok-card" style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><b>${esc(String(t.tokenType||'TOKEN').toUpperCase())}</b><span class="tok-pill ${cls}">${esc(t.status||'active')}</span></div><div class="tok-grid" style="margin-top:10px;"><div class="tok-box"><small>Token</small><b>${esc(t.token)}</b></div><div class="tok-box"><small>Order</small><b>${esc(t.orderId||'—')}</b></div><div class="tok-box"><small>Purpose</small><b>${esc(t.tokenPurpose||'—')}</b></div></div>${t.tokenType==='tracking'?`<button class="tok-btn primary" style="margin-top:10px;width:100%;" onclick="window.trackShipmentByTrackingToken('${t.token}')">Track Shipment</button>`:''}</div>`;
        });
      });
    }catch(e){ list.innerHTML='<p style="color:#e11d48;">Token load failed: '+esc(e.message)+'</p>'; }
  };

  window.verifyInlineCourierPermissionToken = async function(){
    const token=(document.getElementById('inlineCourierPermissionToken')?.value||'').trim().toUpperCase();
    const result=document.getElementById('inlineCourierPermissionResult');
    if(!token) return alert('Weka Delivery Permission Token.');
    result.innerHTML='<div class="tok-card">Inahakiki...</div>';
    try{
      const qTok=skh.query(skh.collection(skh.db,'sokopay_tokens'), skh.where('token','==',token), skh.where('tokenType','==','delivery_permission'), skh.limit(1));
      const snap=await skh.getDocs(qTok);
      if(snap.empty){ result.innerHTML='<div class="tok-card" style="color:#e11d48;">ACCESS DENIED: Token haijapatikana au si Delivery Permission Token.</div>'; return; }
      const d=snap.docs[0]; const t=d.data();
      const expired=t.expiryAt && new Date(t.expiryAt).getTime()<Date.now();
      const denied=expired||t.used;
      result.innerHTML = `<div class="tok-card"><b style="color:${denied?'#e11d48':'#10b981'};">${denied?'ACCESS DENIED':' PERMISSION VALID'}</b><div class="tok-grid" style="margin-top:10px;"><div class="tok-box"><small>Master</small><b>${esc(t.masterTransactionId||t.masterShipmentToken||'—')}</b></div><div class="tok-box"><small>Stage</small><b>${esc(t.stageNumber||'—')}</b></div><div class="tok-box"><small>Route</small><b>${esc(t.pickupHub||'—')} -> ${esc(t.destinationHub||'—')}</b></div><div class="tok-box"><small>Courier</small><b>${esc(t.courierName||t.courierId||'—')}</b></div></div><p style="font-size:12px;color:#64748b;line-height:1.5;">Delivery Permission Token ni authorization tu. Identity verification inatoka kwenye SokoHai Verification Engine iliyopo.</p>${!denied?`<button class="tok-btn green" style="width:100%;" onclick="window.useInlineCourierPermissionToken('${d.id}','${esc(token)}')">Confirm Pickup / Handover</button>`:''}</div>`;
    }catch(e){ result.innerHTML='<div class="tok-card" style="color:#e11d48;">Verification failed: '+esc(e.message)+'</div>'; }
  };
  window.useInlineCourierPermissionToken = async function(docId, token){
    sessionStorage.setItem('active_verified_ride_id', docId);
    sessionStorage.setItem('active_verified_token_type', 'delivery_permission_token');
    sessionStorage.setItem('active_verified_token_value', token);
    if(typeof window.releaseCargoWithToken === 'function') return window.releaseCargoWithToken();
  };

  window.openSokoPayUnifiedTokenCenter('my');
  document.getElementById('unifiedTokenCenterModal').style.display='none';
  window.openLogisticsTokenModal = function(){ return window.openSokoPayUnifiedTokenCenter('my'); };
})();

(function () {
    function showTop() { try { if (window.skhTopbarShow) window.skhTopbarShow(); } catch (e) {} }
    function topAndScroll() { showTop(); try { window.scrollTo(0, 0); } catch (e) {} }

    var PAGE = ['showForm', 'loadMainFeed', 'switchMode', 'updateApp'];
    var VIEW = ['openProduct', 'closeModals', 'openBuyerOrdersModal', 'openMyDeliveries', 'openMyTrips', 'openCart', 'openNotifications', 'openChatList', 'openSavedItems', 'openProfile', 'openUserPaymentModal', 'openLogisticsTokenModal', 'openSokoPay'];

    PAGE.forEach(function (name) {
        var orig = window[name];
        if (typeof orig !== 'function') return;
        window[name] = function () { topAndScroll(); return orig.apply(this, arguments); };
    });
    VIEW.forEach(function (name) {
        var orig = window[name];
        if (typeof orig !== 'function') return;
        window[name] = function () { showTop(); return orig.apply(this, arguments); };
    });
})();

/* Kitufe cha "+" (UZA): kinachoweza kuonekana tu kwenye kurasa za mbele
   (Home/Bidhaa/Huduma/Usafirishaji) bila modal wazi. Nav tabs hubaki.
   setSellFab(show) inafafanuliwa kwenye 08-app-state.js. */
(function () {
    function refreshSellFab() {
        if (typeof window.setSellFab !== 'function') return;
        var buyer = !window.currentMode || window.currentMode === 'buyer';
        if (!buyer) { window.setSellFab(false); return; }
        var open = false;
        try {
            if (typeof window.skhVisibleOverlays === 'function') {
                open = window.skhVisibleOverlays().length > 0;
            }
        } catch (e) { /* defensive */ }
        window.setSellFab(!open);
    }
    window.skhRefreshSellFab = refreshSellFab;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { refreshSellFab(); setInterval(refreshSellFab, 800); });
    } else {
        refreshSellFab();
        setInterval(refreshSellFab, 800);
    }
})();

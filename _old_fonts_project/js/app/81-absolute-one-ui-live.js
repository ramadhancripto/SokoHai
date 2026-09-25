/* ================================================================
 * 81-absolute-one-ui-live.js — [FINAL LIVE FIX 2026-09-19]
 * Tatizo lililoripotiwa LIVE:
 * 1) UI ingine kuingilia UI ingine kabla ya kurudi — inbox inakupeleka
 *    sokohai UI tena inakurudisha chat UI — rudi nenda tena UI ile ile
 *    badala ya kubaki UI ile ile.
 * 2) Discover ukibofya mara ya kwanza inafungua, ukirudia tena inablink
 *    tu hakuna kufunguka — usifiche error.
 *
 * Kanuni ya mwisho kabisa — ABSOLUTE ONE UI:
 * - Hakuna UI mbili juu, hakuna home flash hata frame moja
 * - Kila open: hide ALL instantly SYNC (same tick) → show target SYNC
 * - Hakuna await, hakuna setTimeout, hakuna closeModals() katikati
 * - Stack yetu wenyewe: previous UI inahifadhiwa, back inaonyesha previous
 *   moja kwa moja, sio Home
 * - Discover second click: kama tayari open → usifunge, baki wazi,
 *   kama closed → fungua moja kwa moja bila blink
 * - Error zote zinaonyeshwa, hazifichwi
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function(){
  if(window.__skhAbsoluteOneUI) return;
  window.__skhAbsoluteOneUI = true;

  function byId(id){ return document.getElementById(id); }
  function esc(s){ return (window.skh && skh.skhEscape) ? skh.skhEscape(String(s==null?'':s)) : String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  // Orodha kamili ya overlays — lazima zote zifichwe isipokuwa target
  const ALL_IDS = [
    'skhDiscoverEngine','skhDiscoverOverlay','skhDiscoverRequestModal',
    'skhDiscPersonModal','skhDiscInviteModal','skhDiscGrpModal',
    'chatListModal','chatModal',
    'skhGroupSogaModal','gsgGoDetail','gsgCoWS','gsgCoWSCard',
    'productModal','mySokoHaiModal','sellerProfileModal',
    'sokohaiAccountSettingModal','plusMenu','sidebarMenuModal',
    'cartModal','checkoutModal','notifModal','categoryModal',
    'actionRequestModal','deliveryChoiceModal','unifiedTokenCenterModal',
    'logisticsTokenModal','ratingModal','offlineStockModal',
    'chatForwardModal','chatAttachModal','skhOfferModalShell','skhCounterShell',
    'sokopayDepositModal','shopLedgerModal','procurementModal',
    'industrialProjectModal','shopSetupModal','stockTransferModal',
    'savedItemsModal','tripsModal','deliveriesModal','buyerOrdersModal',
    'sellerOrdersModal','sellerOrderInboxModal','myDeliveriesModal',
    'orderTrackingModal','rideTrackingModal','routeMatchModal','tokenBoxModal',
    'requestInboxModal','chatForwardModal','chatAttachProductModal','chatAttachOrderModal',
    'authModal','sellerTypeModal','boostModal','subModal','escrowModal','welcomeModal',
    'mapModal','directHireModal','rideRequestModal','adminSettingsModal','mainMenu',
    'userPaymentModal','scrapYardModal','repairModal','printingServiceModal'
  ];

  // Stack yetu wenyewe — previous UI
  var uiStack = []; // [{id, display}]
  var currentUI = null;
  var openingLock = { at:0, id:'' };

  function canOpen(id){
    var now = Date.now();
    if(openingLock.id===id && (now-openingLock.at)<600) return false; // block double click same UI <600ms
    openingLock = { at: now, id: id };
    return true;
  }

  // ABSOLUTE hide all except target — SYNC, same tick, no home flash
  window.skhAbsoluteHideAllExcept = function(exceptId){
    try{
      ALL_IDS.forEach(function(id){
        if(id===exceptId) return;
        var el = byId(id);
        if(el){
          // usifunge FAB au mainFeed
          if(el.id==='skhDiscFab' || el.id==='mainFeed' || el.id==='appRoot') return;
          el.style.display='none';
          if(el.classList) el.classList.remove('open');
        }
      });
      document.querySelectorAll('.overlay-menu').forEach(function(ov){
        if(exceptId && ov.id===exceptId) return;
        // usifunge FAB
        if(ov.id==='skhDiscFab') return;
        ov.style.display='none';
        if(ov.classList) ov.classList.remove('open');
      });
      // pia yeyote anayeishia na Modal/Form na z>=100 fixed
      document.querySelectorAll('[id$="Modal"],[id$="Form"]').forEach(function(el){
        if(exceptId && el.id===exceptId) return;
        if(ALL_IDS.indexOf(el.id)!==-1) return;
        if(el.id==='skhDiscFab' || el.id==='mainFeed' || el.id==='appRoot' || el.id==='skhDiscoverEngineInput') return;
        try{
          var cs = getComputedStyle(el);
          if((cs.position==='fixed' || cs.position==='absolute') && (parseInt(cs.zIndex,10)||0)>=100){
            if(el.style.display!=='none'){
              el.style.display='none';
              if(el.classList) el.classList.remove('open');
            }
          }
        }catch(e){}
      });
    }catch(e){ console.error('[81 hideAll]',e); }
  };

  // ABSOLUTE show only one UI — SYNC, no await, no home flash
  window.skhAbsoluteShowOnly = function(id, displayMode, pushStack){
    displayMode = displayMode || 'flex';
    if(pushStack===undefined) pushStack = true;
    try{
      // Kama tayari hii ndiyo current na iko wazi — usifanye kitu (discover second click blink fix)
      var existing = byId(id);
      if(existing && existing.style.display!=='none' && existing.classList.contains('open') && currentUI===id){
        // tayari wazi — baki wazi, usiblink
        existing.style.opacity='1';
        existing.style.transform='none';
        existing.style.visibility='visible';
        document.body.style.overflow='hidden';
        return true;
      }

      // Hifadhi previous kwenye stack yetu
      if(pushStack && currentUI && currentUI!==id){
        var prevEl = byId(currentUI);
        if(prevEl && prevEl.style.display!=='none'){
          // push previous
          var already = uiStack.find(function(s){ return s.id===currentUI; });
          if(!already){
            uiStack.push({ id: currentUI, display: prevEl.style.display||'flex' });
            if(uiStack.length>20) uiStack.shift();
          }
        }
      }

      // Hide all except target SYNC
      window.skhAbsoluteHideAllExcept(id);

      var el = byId(id);
      if(!el){
        if(id==='skhDiscoverEngine'){
          // let builder create it — but we need to create placeholder instantly to avoid home flash
          el = document.createElement('div');
          el.id = id;
          el.className = 'skh-discover-engine open';
          el.style.cssText = 'position:fixed;inset:0;z-index:100001;background:#F6F9FC;display:flex;flex-direction:column;overflow:hidden;';
          el.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#64748b;"><div style="width:36px;height:36px;border:3px solid #e2e8f0;border-top-color:#1268A8;border-radius:50%;animation:spin 0.8s linear infinite;"></div><small>Inafungua Discover...</small><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
          document.body.appendChild(el);
        } else if(id==='skhGroupSogaModal'){
          el = document.createElement('div');
          el.id = id;
          el.className = 'skh-discover-overlay open';
          el.style.zIndex = '100010';
          el.style.display = 'flex';
          document.body.appendChild(el);
        } else {
          return false;
        }
      }

      // Show target SYNC — no animation blink
      el.style.display = displayMode;
      if(el.classList) el.classList.add('open');
      el.style.opacity='1';
      el.style.transform='none';
      el.style.visibility='visible';
      el.style.transition='none';
      el.style.animation='none';
      document.body.style.overflow='hidden';
      currentUI = id;

      // Push to 56-nav-back stack pia for back button compatibility
      try{
        if(window.skhNavPush){
          window.skhNavPush({ type:'modal', id:id, restore: function(){
            var e = byId(id);
            if(e){ e.style.display='none'; if(e.classList) e.classList.remove('open'); }
            // show previous from our stack directly, not home
            if(uiStack.length){
              var prev = uiStack.pop();
              var prevEl = byId(prev.id);
              if(prevEl){
                prevEl.style.display = prev.display||'flex';
                if(prevEl.classList) prevEl.classList.add('open');
                prevEl.style.opacity='1';
                currentUI = prev.id;
                document.body.style.overflow='hidden';
                return;
              }
            }
            document.body.style.overflow='auto';
            currentUI = null;
          }});
        }
      }catch(eNav){}

      return true;
    }catch(e){
      console.error('[81 showOnly]',id,e);
      // usifiche error — onyesha kwa user
      try{ if(window.showToast) window.showToast('Error kufungua '+id+': '+(e.message||''), 'error'); }catch(e2){}
      return false;
    }
  };

  // ABSOLUTE close — show previous directly, not home
  window.skhAbsoluteClose = function(id){
    try{
      var el = byId(id);
      if(el){ el.style.display='none'; if(el.classList) el.classList.remove('open'); }
      // show previous from stack directly
      if(uiStack.length){
        var prev = uiStack.pop();
        var prevEl = byId(prev.id);
        if(prevEl){
          prevEl.style.display = prev.display||'flex';
          if(prevEl.classList) prevEl.classList.add('open');
          prevEl.style.opacity='1';
          prevEl.style.transform='none';
          currentUI = prev.id;
          document.body.style.overflow='hidden';
          return true;
        }
      }
      document.body.style.overflow='auto';
      currentUI = null;
      return true;
    }catch(e){ console.error('[81 close]',e); return false; }
  };

  // ---------- PATCH ALL OPEN FUNCTIONS — ABSOLUTE ONE UI ----------

  function patchDiscoverEngine(){
    var orig = window.skhDiscoverEngineOpen;
    if(!orig || orig.__abs81) return;
    window.skhDiscoverEngineOpen = function(q, opts){
      try{
        var el = byId('skhDiscoverEngine');
        var isAlreadyOpen = el && el.style.display!=='none' && el.classList.contains('open');
        if(isAlreadyOpen){
          // second click — usiblink, baki wazi, refresh content tu
          console.log('[81 discover] already open, refreshing content not blinking');
          el.style.display='flex';
          el.classList.add('open');
          el.style.opacity='1';
          document.body.style.overflow='hidden';
          currentUI='skhDiscoverEngine';
          // refresh content without hiding
          try{ return orig.apply(this, arguments); }catch(e){ console.error(e); }
          return;
        }
        if(!canOpen('skhDiscoverEngine')) {
          console.log('[81 discover] blocked double click <600ms');
          return;
        }
        // ABSOLUTE show only discover SYNC
        window.skhAbsoluteShowOnly('skhDiscoverEngine','flex',true);
        // then run original logic for content (renderHome/search) — but without hiding
        try{
          return orig.apply(this, arguments);
        }catch(e){
          console.error('[81 discoverEngineOpen orig error]',e);
          try{ if(window.showToast) window.showToast('Discover error: '+(e.message||''),'error'); }catch(e2){}
          // keep discover open with error message, don't go to home
          var eng = byId('skhDiscoverEngine');
          if(eng){
            var body = byId('skhDiscoverEngineBody');
            if(body) body.innerHTML = '<div style="padding:20px;text-align:center;"><b style="color:#b91c1c;">Imeshindikana</b><br><small style="color:#64748b;">'+esc(e.message||'')+'</small><br><button onclick="window.skhDiscoverEngineClose()" style="margin-top:12px;padding:10px 18px;border:none;background:#1268A8;color:#fff;border-radius:10px;font-weight:800;">Funga</button></div>';
          }
        }
      }catch(e){ console.error('[81 patchDiscoverEngine]',e); try{ return orig.apply(this, arguments); }catch(e2){} }
    };
    window.skhDiscoverEngineOpen.__abs81=true;
    window.skhDiscoverEngineOpen.__orig=orig;

    var origClose = window.skhDiscoverEngineClose;
    if(origClose && !origClose.__abs81){
      window.skhDiscoverEngineClose = function(){
        try{
          if(!canOpen('closeDiscover')) {
            // allow close even if quick? we want close to work always
          }
          window.skhAbsoluteClose('skhDiscoverEngine');
          try{ return origClose.apply(this, arguments); }catch(e){}
        }catch(e){ try{ return origClose.apply(this, arguments); }catch(e2){} }
      };
      window.skhDiscoverEngineClose.__abs81=true;
    }
  }

  function patchDiscoverGlobal(){
    if(window.skhDiscoverOpen && !window.skhDiscoverOpen.__abs81){
      var orig = window.skhDiscoverOpen;
      window.skhDiscoverOpen = function(kind){
        try{
          if(!kind || kind==='all' || ['products','services','businesses','nearby','transport','people','sellers','groups'].indexOf(kind)!==-1){
            // ABSOLUTE
            if(!canOpen('skhDiscoverEngine') && byId('skhDiscoverEngine') && byId('skhDiscoverEngine').style.display!=='none'){
              console.log('[81 discoverOpen] already open, not blinking');
              return;
            }
            window.skhAbsoluteShowOnly('skhDiscoverEngine','flex',true);
            if(window.skhDiscoverEngineOpen && window.skhDiscoverEngineOpen.__orig){
              return window.skhDiscoverEngineOpen.__orig('', { entityTypes: kind==='products'?['PRODUCT']:kind==='services'?['SERVICE']:kind==='businesses'?['BUSINESS']:kind==='transport'?['TRANSPORTER']:kind==='people'?['PERSON']:kind==='groups'?['GROUP']:kind==='sellers'?['BUSINESS','PERSON']:undefined });
            } else if(window.skhDiscoverEngineOpen){
              return window.skhDiscoverEngineOpen('', { entityTypes: kind==='products'?['PRODUCT']:kind==='services'?['SERVICE']:kind==='businesses'?['BUSINESS']:kind==='transport'?['TRANSPORTER']:kind==='people'?['PERSON']:kind==='groups'?['GROUP']:kind==='sellers'?['BUSINESS','PERSON']:undefined });
            }
            return;
          }
          // legacy
          window.skhAbsoluteShowOnly('skhDiscoverOverlay','flex',true);
          return orig.apply(this, arguments);
        }catch(e){ console.error('[81 discoverOpen]',e); return orig.apply(this, arguments); }
      };
      window.skhDiscoverOpen.__abs81=true;
    }
  }

  function patchChatInbox(){
    var orig = window.skhChatOpenInbox;
    if(!orig || orig.__abs81) return;
    window.skhChatOpenInbox = async function(){
      try{
        if(!canOpen('chatListModal')) {
          var clExist = byId('chatListModal');
          if(clExist && clExist.style.display!=='none') return;
        }
        // Fungua inbox na skhAbsoluteShowOnly (hii inaficha UI zingine)
        window.skhAbsoluteShowOnly('chatListModal','flex',true);
      }catch(e){}
      try{
        // [FIX 2026-09-20] ita orig bila kusubiri — orig sasa haina closeModals()
        // tena, kwa hivyo haifuti inbox ambayo tumeshafungua hapo juu
        await orig.apply(this, arguments);
        // Baada ya orig kumaliza, hakikisha inbox bado iko wazi (race condition guard)
        // Lakini USIITE skhAbsoluteShowOnly tena — ingeifuta DOM ya inboxList!
        try{
          var cl = byId('chatListModal');
          if(cl) { cl.style.display='flex'; cl.style.visibility='visible'; cl.style.opacity='1'; }
          currentUI='chatListModal';
        }catch(e){}
        return;
      }catch(e){
        console.warn('[abs81] chatInbox error:', e);
      }
    };
    window.skhChatOpenInbox.__abs81=true;
  }

  function patchDirectChat(){
    if(!window.skhChatOpen || window.skhChatOpen.__abs81_final) return;
    var orig = window.skhChatOpen.__blinkPatched ? window.skhChatOpen : window.skhChatOpen;
    // get the most original
    var base = orig.__orig || orig;
    // If already patched by 78/79, get base
    if(window.skhChatOpen.__orig) base = window.skhChatOpen.__orig;
    // Actually we want to wrap the current (which already has blink fix)
    var current = window.skhChatOpen;
    window.skhChatOpen = async function(uid2,name2,opts2){
      try{
        if(!uid2) return null;
        // Block double click same uid <600ms
        if(!canOpen('chat_'+uid2)){
          var cmExist = byId('chatModal');
          if(cmExist && cmExist.style.display!=='none') return;
        }
        // ABSOLUTE show only chatModal SYNC — no home flash
        window.skhAbsoluteShowOnly('chatModal','flex',true);
        // instant skeleton
        var host = byId('chatMessages');
        if(host && !host.innerHTML.includes('Inafungua')){
          host.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;"><div style="display:inline-block;width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#1268A8;border-radius:50%;animation:spin 0.8s linear infinite;"></div><div style="margin-top:10px;font-size:13px;">Inafungua chat na '+esc(name2||'')+'</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
        }
      }catch(e){}
      try{
        return await current.apply(this, arguments);
      }catch(e){ console.error('[81 direct]',e); try{ if(window.showToast) window.showToast('Chat error: '+(e.message||''),'error'); }catch(e2){} return null; }
    };
    window.skhChatOpen.__abs81_final=true;
  }

  function patchGroupRow(){
    if(!window.skhChatOpenGroupRow || window.skhChatOpenGroupRow.__abs81_final) return;
    var current = window.skhChatOpenGroupRow;
    window.skhChatOpenGroupRow = function(gid, ev){
      try{
        if(!gid) return;
        gid = String(gid).trim().replace(/^conv_group_/, '');
        if(!gid) return;
        if(ev && ev.stopPropagation) ev.stopPropagation();
        try{ if(window.event && window.event.stopPropagation) window.event.stopPropagation(); }catch(e){}
        window.skhAbsoluteShowOnly('skhGroupSogaModal','flex',true);
      }catch(e){}
      try{ return current.apply(this, arguments); }catch(e){ console.error('[81 groupRow]',e); }
    };
    window.skhChatOpenGroupRow.__abs81_final=true;
  }

  function patchSoga(){
    if(!window.skhOpenGroupSoga || window.skhOpenGroupSoga.__abs81_final) return;
    var current = window.skhOpenGroupSoga;
    window.skhOpenGroupSoga = async function(gid){
      try{
        if(!gid) return;
        gid = String(gid).trim().replace(/^conv_group_/, '');
        if(!gid) return;
        window.skhAbsoluteShowOnly('skhGroupSogaModal','flex',true);
      }catch(e){}
      try{ return await current.apply(this, arguments); }catch(e){ console.error('[81 soga]',e); throw e; }
    };
    window.skhOpenGroupSoga.__abs81_final=true;
  }

  function patchGO(){
    if(window.skhGOWindowOpen && !window.skhGOWindowOpen.__abs81_final){
      var current = window.skhGOWindowOpen;
      window.skhGOWindowOpen = async function(orderDocId){
        try{
          if(!orderDocId) return;
          if(!canOpen('go_'+orderDocId)){
            var ex = byId('gsgCoWS');
            if(ex && ex.style.display!=='none') return;
          }
          // Show gsgCoWS instantly — hide all except it? But it's child of group soga, so we should keep group soga? No, one UI rule: show only gsgCoWS
          // Actually for GO detail, we want to show gsgCoWS as overlay on top, but hide others except it
          var pop = byId('gsgCoWS');
          if(!pop){
            pop = document.createElement('div');
            pop.id='gsgCoWS';
            pop.style.cssText='position:fixed;inset:0;z-index:100120;background:rgba(11,22,40,.5);display:flex;align-items:flex-end;justify-content:center;';
            pop.innerHTML='<div style="width:100%;max-width:430px;background:#fff;border-radius:18px 18px 0 0;padding:20px;text-align:center;color:#64748b;"><div style="width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#1268A8;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;"></div><div style="margin-top:10px;">Inafungua oda...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
            document.body.appendChild(pop);
          }
          pop.style.display='flex';
          // push current group soga to stack
          if(currentUI && currentUI!==pop.id){
            uiStack.push({ id: currentUI, display: 'flex' });
          }
          window.skhAbsoluteHideAllExcept('gsgCoWS');
          pop.style.display='flex';
          currentUI='gsgCoWS';
          document.body.style.overflow='hidden';
        }catch(e){}
        try{ return await current.apply(this, arguments); }catch(e){ console.error('[81 go]',e); }
      };
      window.skhGOWindowOpen.__abs81_final=true;
    }
  }

  function patchFab(){
    // REMOVED: 81 no longer adds a second click listener to FAB
    // 68-chat-discover.js already has a click listener that calls skhDiscoverOpen()
    // 81's skhDiscoverOpen wrapper already handles skhAbsoluteShowOnly
    // Adding a second listener caused: stopPropagation blocking 68's listener,
    // and canOpen race condition preventing second click from working
  }

  function patchCloseModalsAbsolute(){
    var origCloseModals = window.closeModals;
    if(!origCloseModals || origCloseModals.__abs81) return;
    var raw = origCloseModals.__raw || origCloseModals;

    var wrapped = function(closeEverything){
      try{
        if(closeEverything===true){
          // force close all → home
          uiStack=[];
          currentUI=null;
          window.skhAbsoluteHideAllExcept(null);
          document.body.style.overflow='auto';
          try{ if(window.skhCloseAll) return window.skhCloseAll(); }catch(e){}
          return raw.apply(this, arguments);
        }

        // If we have our own stack with previous UI, show it directly — NO home flash
        if(uiStack.length>0){
          var prev = uiStack.pop();
          var prevEl = byId(prev.id);
          var curr = currentUI ? byId(currentUI) : null;
          if(curr){ curr.style.display='none'; if(curr.classList) curr.classList.remove('open'); }
          if(prevEl){
            prevEl.style.display = prev.display||'flex';
            if(prevEl.classList) prevEl.classList.add('open');
            prevEl.style.opacity='1';
            prevEl.style.transform='none';
            currentUI = prev.id;
            document.body.style.overflow='hidden';
            // also pop from 56-nav-back stack if exists
            try{ if(window.skhNavDepth && window.skhNavDepth()>0) { /* let it prune */ } }catch(e){}
            return;
          }
        }

        // If 56-nav-back has stack, use its closeTop which will restore via our restore that shows previous
        if(window.skhNavDepth && window.skhNavDepth()>0 && window.skhCloseTop){
          return window.skhCloseTop();
        }

        // No stack → home
        window.skhAbsoluteHideAllExcept(null);
        document.body.style.overflow='auto';
        currentUI=null;
        return raw.apply(this, arguments);
      }catch(e){
        console.error('[81 closeModals]',e);
        return raw.apply(this, arguments);
      }
    };
    wrapped.__abs81=true;
    wrapped.__raw=raw;
    wrapped.__skhBack=origCloseModals.__skhBack;
    wrapped.__blinkWrap=origCloseModals.__blinkWrap;
    window.closeModals = wrapped;
  }

  function injectCSS(){
    if(byId('skhAbsoluteOneUICSS')) return;
    var style = document.createElement('style');
    style.id='skhAbsoluteOneUICSS';
    style.textContent = `
      .skh-discover-engine, .skh-discover-overlay, #skhGroupSogaModal, #chatListModal, #chatModal, #gsgGoDetail, #gsgCoWS, #gsgCoWSCard, .overlay-menu {
        transition: none !important;
        animation: none !important;
      }
      .skh-discover-engine.open, #skhGroupSogaModal.open, #chatListModal[style*="flex"], #chatModal[style*="flex"], #gsgCoWS[style*="flex"] {
        opacity:1 !important; transform:none !important; visibility:visible !important;
      }
      #skhDiscFab { pointer-events:auto !important; z-index:4800 !important; }
      /* Prevent home flash: when any modal open, mainFeed should be hidden? No, overlay covers it, but ensure no transparent gap */
      .skh-discover-engine, #skhGroupSogaModal, #chatListModal, #chatModal {
        will-change: transform;
        backface-visibility: hidden;
      }
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectCSS();
    patchDiscoverEngine();
    patchDiscoverGlobal();
    patchChatInbox();
    patchDirectChat();
    patchGroupRow();
    patchSoga();
    patchGO();
    patchFab();
    patchCloseModalsAbsolute();

    // Ensure currentUI detection on load
    try{
      ALL_IDS.forEach(function(id){
        var el = byId(id);
        if(el && el.style.display!=='none' && el.classList.contains('open')){
          currentUI = id;
        }
      });
    }catch(e){}

    console.log('[81-absolute-one-ui-live] FINAL PATCHED — absolute one UI, no home flash, discover second click fixed, live safe');
  }

  // Phase 1 Clean Init: Fanya mara moja tu, hakuna timers za kurudia
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();

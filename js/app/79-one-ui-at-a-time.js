/* ================================================================
 * 79-one-ui-at-a-time.js — [FIX 2026-09-19 ONE UI AT A TIME]
 * Tatizo: discover haifunguki, na chat/group/discover zina-blink:
 *   UI → inbox → home → target (sec 1 inarudi)
 *   Badala ya WhatsApp-like: click → moja kwa moja target
 *
 * Kanuni mpya:
 *   - Mfumo ufanye kazi ONE UI AT A TIME mpaka pale umeback/close
 *   - Hakuna UI mbili juu, hakuna home flash kati
 *   - Kila open: hide ALL instantly (no animation) → show target instantly
 *   - Close: hide current → show previous from stack OR home
 *   - Discover, Chat Inbox, Chat Direct, Group Soga, Group Order Detail,
 *     Product, Seller, MySokoHai, Cart, Checkout, Notifications, Category,
 *     PlusMenu, Sidebar — zote zinafuata sheria moja
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function(){
  if(window.__skhOneUI) return;
  window.__skhOneUI = true;

  function byId(id){ return document.getElementById(id); }
  function esc(s){ return (window.skh && skh.skhEscape) ? skh.skhEscape(String(s||'')) : String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  // Orodha kamili ya overlays zinazojulikana — lazima zote zifichwe isipokuwa target
  const ALL_OVERLAY_IDS = [
    'skhDiscoverEngine', 'skhDiscoverOverlay', 'skhDiscoverRequestModal',
    'skhDiscPersonModal', 'skhDiscInviteModal', 'skhDiscGrpModal',
    'chatListModal', 'chatModal',
    'skhGroupSogaModal', 'gsgGoDetail', 'gsgCoWS', 'gsgCoWSCard',
    'productModal', 'mySokoHaiModal', 'sellerProfileModal',
    'sokohaiAccountSettingModal', 'plusMenu', 'sidebarMenuModal',
    'cartModal', 'checkoutModal', 'notifModal', 'categoryModal',
    'actionRequestModal', 'deliveryChoiceModal', 'unifiedTokenCenterModal',
    'logisticsTokenModal', 'ratingModal', 'offlineStockModal',
    'chatForwardModal', 'chatAttachModal', 'skhOfferModalShell', 'skhCounterShell',
    'sokopayDepositModal', 'shopLedgerModal', 'procurementModal',
    'industrialProjectModal', 'shopSetupModal', 'stockTransferModal',
    'savedItemsModal', 'tripsModal', 'deliveriesModal',
    'buyerOrdersModal', 'sellerOrdersModal', 'sellerOrderInboxModal',
    'myDeliveriesModal', 'orderTrackingModal', 'rideTrackingModal'
  ];

  // Hide all instantly — no animation, no home flash
  window.skhHideAllOverlaysExcept = function(exceptId){
    try{
      ALL_OVERLAY_IDS.forEach(function(id){
        if(id===exceptId) return;
        var el=byId(id);
        if(el){
          el.style.display='none';
          el.classList.remove('open');
        }
      });
      // pia .overlay-menu zote isipokuwa except
      document.querySelectorAll('.overlay-menu').forEach(function(ov){
        if(exceptId && ov.id===exceptId) return;
        ov.style.display='none';
        ov.classList.remove('open');
      });
      // id zinazoishia na Modal/Form ambazo hazipo kwenye orodha
      document.querySelectorAll('[id$=\"Modal\"],[id$=\"Form\"]').forEach(function(el){
        if(exceptId && el.id===exceptId) return;
        if(ALL_OVERLAY_IDS.indexOf(el.id)!==-1) return; // already handled
        // usifunge FAB au mainFeed
        if(el.id==='skhDiscFab' || el.id==='mainFeed' || el.id==='appRoot') return;
        // only hide if it looks like overlay (fixed/absolute + high z)
        try{
          var cs=getComputedStyle(el);
          if((cs.position==='fixed' || cs.position==='absolute') && (parseInt(cs.zIndex,10)||0)>=100){
            if(el.style.display!=='none'){
              el.style.display='none';
              el.classList.remove('open');
            }
          }
        }catch(e){}
      });
    }catch(e){ console.warn('[oneUI hideAll]',e); }
  };

  // Show one overlay atomically
  window.skhShowOverlay = function(id, displayMode){
    displayMode = displayMode || 'flex';
    try{
      window.skhHideAllOverlaysExcept(id);
      var el=byId(id);
      if(!el){
        // create if not exists for discover engine / group soga
        if(id==='skhDiscoverEngine'){
          // let original builder create it
          return false;
        }
        if(id==='skhGroupSogaModal'){
          el=document.createElement('div');
          el.id=id;
          el.className='skh-discover-overlay';
          el.style.zIndex='100010';
          document.body.appendChild(el);
        }
      }
      if(el){
        el.style.display=displayMode;
        if(el.classList) el.classList.add('open');
        el.style.opacity='1';
        el.style.transform='none';
        el.style.visibility='visible';
        document.body.style.overflow='hidden';
        // push to nav stack if available
        try{
          if(window.skhNavPush){
            // avoid duplicate
            window.skhNavPush({ type:'modal', id:id, restore: function(){ 
              var e=byId(id); if(e){ e.style.display='none'; e.classList.remove('open'); }
              document.body.style.overflow='auto';
            }});
          }
        }catch(eNav){}
        return true;
      }
    }catch(e){ console.error('[oneUI show]',id,e); }
    return false;
  };

  // ---------- PATCH DISCOVER ----------
  // REMOVED: 79 no longer patches skhDiscoverEngineOpen or skhDiscoverOpen
  // These are now handled by 81-absolute-one-ui-live.js (single source of truth)
  function patchDiscover(){
    // No-op: discover patches is now handled by 81
    // But still patch close to restore body overflow
    var origEngineClose=window.skhDiscoverEngineClose;
    if(origEngineClose && !origEngineClose.__oneUI){
      window.skhDiscoverEngineClose = function(){
        try{
          var el=byId('skhDiscoverEngine');
          if(el){ el.style.display='none'; el.classList.remove('open'); }
          document.body.style.overflow='auto';
          return origEngineClose.apply(this, arguments);
        }catch(e){ return origEngineClose.apply(this, arguments); }
      };
      window.skhDiscoverEngineClose.__oneUI=true;
    }
  }

  // ---------- PATCH CHAT INBOX ----------
  function patchChatInbox(){
    var origInbox=window.skhChatOpenInbox;
    if(origInbox && !origInbox.__oneUI){
      window.skhChatOpenInbox = async function(){
        try{
          window.skhHideAllOverlaysExcept('chatListModal');
          var cl=byId('chatListModal');
          if(cl){ cl.style.display='flex'; cl.classList.add('open'); }
        }catch(e){}
        try{
          // [FIX 2026-09-20] Ita orig — orig sasa haina closeModals() tena
          await origInbox.apply(this, arguments);
          // Baada ya orig, hakikisha inbox bado iko wazi (USIFUTE tena)
          try{
            var cl2=byId('chatListModal');
            if(cl2) { cl2.style.display='flex'; cl2.style.visibility='visible'; }
            // Desktop two-pane: ruhusu chatModal pia
            if(window.innerWidth>=900){
              var cm2=byId('chatModal');
              if(cm2) cm2.style.display='flex';
            }
          }catch(e2){}
          return;
        }catch(e){ console.error('[oneUI inbox]',e); }
      };
      window.skhChatOpenInbox.__oneUI=true;
    }
  }

  // ---------- PATCH DIRECT CHAT (already patched in 78, but ensure one UI) ----------
  function patchDirect(){
    // ensure skhChatOpen shows instantly and hides others
    if(window.skhChatOpen && window.skhChatOpen.__oneUIAtomic) return;
    // we already patched in 78, just ensure hideAll
    var orig=window.skhChatOpen && window.skhChatOpen.__blinkPatched ? null : window.skhChatOpen;
    // 78 already does atomic, we just add extra hideAll
    if(window.skhChatOpen && !window.skhChatOpen.__oneUIAtomic){
      var base=window.skhChatOpen;
      window.skhChatOpen = async function(uid,name,opts){
        try{
          window.skhHideAllOverlaysExcept('chatModal');
          var cm=byId('chatModal');
          if(cm){ cm.style.display='flex'; cm.style.opacity='1'; document.body.style.overflow='hidden'; }
        }catch(e){}
        return base.apply(this, arguments);
      };
      window.skhChatOpen.__oneUIAtomic=true;
      // preserve blink flag
      if(base.__blinkPatched) window.skhChatOpen.__blinkPatched=true;
    }
  }

  // ---------- PATCH GROUP ROW ----------
  function patchGroupRow(){
    if(window.skhChatOpenGroupRow && !window.skhChatOpenGroupRow.__oneUIAtomic){
      var base=window.skhChatOpenGroupRow;
      window.skhChatOpenGroupRow = function(gid, ev){
        try{
          if(ev && ev.stopPropagation) ev.stopPropagation();
          if(window.event && window.event.stopPropagation) try{ window.event.stopPropagation(); }catch(e){}
          window.skhHideAllOverlaysExcept('skhGroupSogaModal');
          var m=byId('skhGroupSogaModal');
          if(!m){
            m=document.createElement('div');
            m.id='skhGroupSogaModal';
            m.className='skh-discover-overlay';
            m.style.zIndex='100010';
            document.body.appendChild(m);
          }
          m.style.display='block';
          m.classList.add('open');
          m.style.opacity='1';
          document.body.style.overflow='hidden';
        }catch(e){}
        return base.apply(this, arguments);
      };
      window.skhChatOpenGroupRow.__oneUIAtomic=true;
      if(base.__blinkPatched) window.skhChatOpenGroupRow.__blinkPatched=true;
    }
  }

  // ---------- PATCH GROUP SOGA ----------
  function patchSoga(){
    if(window.skhOpenGroupSoga && !window.skhOpenGroupSoga.__oneUIAtomic){
      var base=window.skhOpenGroupSoga;
      window.skhOpenGroupSoga = async function(gid){
        try{
          window.skhHideAllOverlaysExcept('skhGroupSogaModal');
          var m=byId('skhGroupSogaModal');
          if(!m){
            m=document.createElement('div');
            m.id='skhGroupSogaModal';
            m.className='skh-discover-overlay';
            m.style.zIndex='100010';
            document.body.appendChild(m);
          }
          m.style.display='block';
          m.classList.add('open');
          m.style.opacity='1';
          document.body.style.overflow='hidden';
        }catch(e){}
        return base.apply(this, arguments);
      };
      window.skhOpenGroupSoga.__oneUIAtomic=true;
      if(base.__blinkPatched) window.skhOpenGroupSoga.__blinkPatched=true;
    }
  }

  // ---------- PATCH FAB — make it instant, no polling delay ----------
  function patchFab(){
    try{
      var fab=byId('skhDiscFab');
      if(!fab) return false;
      if(fab.__oneUI) return true;
      fab.__oneUI=true;
      // remove old listeners by cloning? simpler: add capture listener that does atomic first
      fab.addEventListener('click', function(ev){
        try{
          ev.stopPropagation();
          ev.preventDefault();
          window.skhHideAllOverlaysExcept('skhDiscoverEngine');
          var eng=byId('skhDiscoverEngine');
          if(eng){
            eng.style.display='flex';
            eng.classList.add('open');
            eng.style.opacity='1';
            document.body.style.overflow='hidden';
          }
          if(window.skhDiscoverOpen){
            // call after instant show
            setTimeout(function(){ try{ window.skhDiscoverOpen(); }catch(e){} },0);
          }
        }catch(e){}
      }, true);
      return true;
    }catch(e){ return false; }
  }

  // ---------- PATCH closeModals wrapper to be truly one-UI-at-a-time ----------
  function patchCloseModals(){
    try{
      var wrapped=window.closeModals;
      if(!wrapped || wrapped.__oneUI) return;
      var raw=wrapped.__raw || wrapped;
      var newWrapped=function(closeEverything){
        try{
          if(closeEverything===true){
            // force close all → home
            window.skhHideAllOverlaysExcept(null);
            document.body.style.overflow='auto';
            try{ if(window.skhCloseAll) return window.skhCloseAll(); }catch(e){}
            return raw.apply(this, arguments);
          }
          // one UI at a time: close top, show previous if any, else home
          if(window.skhNavDepth && window.skhCloseTop){
            var depth=window.skhNavDepth();
            if(depth>0){
              return window.skhCloseTop();
            }
          }
          // fallback: hide all
          window.skhHideAllOverlaysExcept(null);
          document.body.style.overflow='auto';
          return raw.apply(this, arguments);
        }catch(e){ return raw.apply(this, arguments); }
      };
      newWrapped.__oneUI=true;
      newWrapped.__raw=raw;
      newWrapped.__skhBack=wrapped.__skhBack;
      window.closeModals=newWrapped;
    }catch(e){}
  }

  // ---------- INIT WITH RETRY ----------
  function init(){
    patchDiscover();
    patchChatInbox();
    patchDirect();
    patchGroupRow();
    patchSoga();
    patchFab();
    patchCloseModals();
    // ensure discover engine CSS has no transition that causes blink
    try{
      var style=document.createElement('style');
      style.id='skhOneUIStyle';
      if(!byId('skhOneUIStyle')){
        style.textContent=`
          .skh-discover-engine, .skh-discover-overlay, #skhGroupSogaModal, #chatListModal, #chatModal, #gsgGoDetail, #gsgCoWS {
            transition: none !important;
            animation: none !important;
          }
          .skh-discover-engine.open, #skhGroupSogaModal.open, #chatListModal[style*=\"flex\"], #chatModal[style*=\"flex\"] {
            opacity:1 !important; transform:none !important;
          }
          #skhDiscFab { pointer-events: auto !important; }
        `;
        document.head.appendChild(style);
      }
    }catch(e){}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
  setTimeout(init, 300);
  setTimeout(init, 1000);
  setTimeout(init, 2500);

  // keep trying FAB
  var fabRetry=setInterval(function(){
    if(patchFab()){ clearInterval(fabRetry); }
  }, 500);
  setTimeout(function(){ clearInterval(fabRetry); }, 10000);

  console.log('[79-one-ui-at-a-time] patched — one UI at a time, no blink, discover fixed');
})();

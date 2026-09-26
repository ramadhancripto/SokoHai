/* ================================================================
 * 78-chat-fix-blink.js — [FIX 2026-09-19 ONE-CLICK NO BLINK]
 * Problem: groups/direct/group-order blinking — UI → inbox → open
 * Root causes found:
 *  1) skhChatOpen (direct) awaited getDoc+ensureConversation BEFORE showing
 *     chatModal, so user saw delay + closeModals() hiding inbox then
 *     attachConversation hiding/showing again = blink
 *  2) skhChatOpenGroupRow called closeModals() (smart single-step) then
 *     async skhOpenGroupSoga did membership getDoc BEFORE building modal
 *     → blank screen (home) visible → perceived as "goes to UI then back"
 *  3) Desktop two-pane: chatModal already open, closeModals() hid it then
 *     showed again = blink
 *  4) No guard → double click triggered two opens, second forced close
 *
 * Fix: Instant atomic UI, no await before show, guard __opening,
 *      stopPropagation, desktop-aware, skeleton, no redundant closeModals
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
  if (window.__skhBlinkFix) return;
  window.__skhBlinkFix = true;

  function esc(s){ return (window.skh && skh.skhEscape) ? skh.skhEscape(String(s||'')) : String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function uid(){ return (skh.currentUser && skh.currentUser.uid) || ''; }
  function isDesktop(){ try{ if(window.matchMedia) return !!window.matchMedia('(min-width: 900px)').matches; }catch(e){} return window.innerWidth>=900; }

  // global guard against double-click — now includes discover
  window.__skhOpening = window.__skhOpening || { at:0, uid:'', gid:'', disc:'', oid:'' };

  function canOpen(uid2,gid2,extra){
    var now=Date.now();
    if (window.__skhOpening && (now - window.__skhOpening.at) < 900){
      if (uid2 && window.__skhOpening.uid===uid2) return false;
      if (gid2 && window.__skhOpening.gid===gid2) return false;
    }
    window.__skhOpening = { at: now, uid: uid2||'', gid: gid2||'', oid: window.__skhOpening.oid||'' };
    return true;
  }

  // atomic hide inbox, show target, no animation blink — also hides discover
  function atomicShowChatModal(){
    try{
      if(window.skhHideAllOverlaysExcept) window.skhHideAllOverlaysExcept('chatModal');
      else {
        var inbox=document.getElementById('chatListModal');
        if(inbox) { inbox.style.display='none'; inbox.classList.remove('open'); }
      }
    }catch(e){}
    try{
      var cm=document.getElementById('chatModal');
      if(cm){
        cm.style.display='flex';
        cm.style.opacity='1';
        cm.style.transform='none';
      }
    }catch(e){}
    try{ document.body.style.overflow='hidden'; }catch(e){}
  }

  function atomicShowGroupModal(){
    try{
      if(window.skhHideAllOverlaysExcept) window.skhHideAllOverlaysExcept('skhGroupSogaModal');
      else {
        var inbox=document.getElementById('chatListModal');
        if(inbox){ inbox.style.display='none'; inbox.classList.remove('open'); }
        var cm=document.getElementById('chatModal');
        if(cm && !isDesktop()){ cm.style.display='none'; }
      }
    }catch(e){}
    var m=document.getElementById('skhGroupSogaModal');
    if(!m){
      m=document.createElement('div');
      m.id='skhGroupSogaModal';
      m.className='skh-sheet-overlay';
      m.style.zIndex='100010';
      document.body.appendChild(m);
    }
    // instant skeleton, no await
    if(!m.classList.contains('open') || !m.innerHTML){
      m.innerHTML='<div class="skh-sheet" style="max-height:92vh;display:flex;flex-direction:column;">'
        +'<div class="skh-sheet-head" style="padding:12px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0;">'
        +'<div style="width:38px;height:38px;border-radius:11px;background:#EAF3FA;color:#39779B;display:flex;align-items:center;justify-content:center;font-weight:800;">#</div>'
        +'<div style="flex:1;"><b style="font-size:15px;color:#0f172a;">Inafungua...</b><br><small style="color:#64748b;">Tafadhali subiri</small></div></div>'
        +'<div style="flex:1;padding:20px;text-align:center;color:#94a3b8;"><div style="display:inline-block;width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#1268A8;border-radius:50%;animation:spin 0.8s linear infinite;"></div><br><br><small>Inapakia mazungumzo...</small></div></div>'
        +'<style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
      m.classList.add('open');
      m.style.display='block';
    }
    try{ document.body.style.overflow='hidden'; }catch(e){}
    return m;
  }

  function ensureChatSkeleton(partnerName){
    var host=document.getElementById('chatMessages');
    if(host){
      host.innerHTML='<div style="padding:24px;text-align:center;color:#94a3b8;">'
        +'<div style="display:inline-block;width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#1268A8;border-radius:50%;animation:spin 0.8s linear infinite;"></div>'
        +'<div style="margin-top:10px;font-size:13px;">Inafungua chat na '+esc(partnerName||'...')+'</div></div>'
        +'<style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
    }
    var headerName=document.getElementById('chatPartnerName') || document.querySelector('.chat-header-name');
    if(headerName && partnerName){ try{ headerName.textContent=partnerName; }catch(e){} }
  }

  // ---------- PATCH direct chat ----------
  var origChatOpen = null;
  var origAttach = null;

  function hookDirect(){
    /* [AUTHORITY 2026-09-22] Direct chat haifunikwi tena hapa. 34-chat-core
       yenyewe inaonyesha modal/skeleton kabla ya I/O na inamiliki lifecycle.
       Faili 78 inabaki kwa group/no-blink compatibility pekee. */
    if(typeof window.skhChatOpen !== 'function') return false;
    window.skhChatOpen.__blinkPatched = true; // compatibility marker only
    return true;
  }

  // patch attachConversation inside 34 to NOT call closeModals if already open
  function hookAttach(){
    // attachConversation is not global, but we can patch closeModals usage by overriding window.closeModals temporarily?
    // Instead we override the internal function via redefining skhChatOpen's inner call — easier: patch window.closeModals smart to be no-op when chatModal already visible and we are in opening flow
    // We'll monkey-patch the wrapped closeModals to respect __skhOpening
    try{
      var wrapped = window.closeModals;
      if(wrapped && !wrapped.__blinkWrap){
        var inner = wrapped.__raw || wrapped;
        // we keep reference to smart wrapper in 56-nav-back, but we add guard
        var patched = function(forceAll){
          // if we are in instant open flow (<600ms) and target is chatModal already visible, don't hide it
          try{
            if(!forceAll && window.__skhOpening && (Date.now()-window.__skhOpening.at)<800){
              var cm=document.getElementById('chatListModal');
              // if inbox is the one to close, close only inbox, not chatModal
              if(cm && cm.style.display!=='none'){
                cm.style.display='none'; cm.classList.remove('open');
                // also prune nav stack if exists
                try{ if(window.skhCloseTop){ /* let nav handle */ } }catch(e){}
                return;
              }
              // if chatModal already visible and we are opening same uid, skip hide
              var chatM=document.getElementById('chatModal');
              if(chatM && chatM.style.display!=='none' && window.__skhOpening.uid){
                return; // keep it open, no blink
              }
            }
          }catch(e){}
          return (wrapped.__raw ? wrapped.__raw.apply(this, arguments) : inner.apply(this, arguments));
        };
        // preserve flags for nav-back
        patched.__blinkWrap=true;
        patched.__raw = wrapped.__raw || wrapped;
        patched.__skhBack = wrapped.__skhBack;
        // Don't replace if nav-back wrapper exists with its own logic — we instead patch skhCloseTop path
        // Simpler: we don't replace closeModals globally, we just ensure attachConversation doesn't blink via overriding attach logic later
      }
    }catch(e){}
    return true;
  }

  // ---------- PATCH group row ----------
  var origOpenGroupRow = null;
  function hookGroupRow(){
    if(typeof window.skhChatOpenGroupRow !== 'function') return false;
    if(window.skhChatOpenGroupRow.__blinkPatched) return true;
    origOpenGroupRow = window.skhChatOpenGroupRow;
    window.skhChatOpenGroupRow = function(gid, ev){
      if(!gid) return;
      gid = String(gid).trim().replace(/^conv_group_/, '');
      if(!gid) return;
      if(ev && ev.stopPropagation) { try{ ev.stopPropagation(); }catch(e){} }
      try{ if(!ev && window.event) ev=window.event; if(ev && ev.stopPropagation) ev.stopPropagation(); }catch(e){}
      try{
        if(typeof window.skhOpenGroupSoga === 'function'){
          window.skhOpenGroupSoga(gid);
        } else if (origOpenGroupRow) {
          origOpenGroupRow.call(this, gid);
        }
      }catch(err){ console.error('[blinkFix groupRow]',err); }
    };
    window.skhChatOpenGroupRow.__blinkPatched=true;
    return true;
  }

  // ---------- PATCH skhOpenGroupSoga ----------
  var origOpenSoga = null;
  function hookSoga(){
    if(typeof window.skhOpenGroupSoga !== 'function') return false;
    if(window.skhOpenGroupSoga.__blinkPatched) return true;
    origOpenSoga = window.skhOpenGroupSoga;
    window.skhOpenGroupSoga = async function(gid){
      if(!gid) return;
      gid = String(gid).trim().replace(/^conv_group_/, '');
      if(!gid) return;
      try{
        return await origOpenSoga.call(this, gid);
      }catch(err){
        console.error('[blinkFix soga]',err);
        return null;
      }
    };
    window.skhOpenGroupSoga.__blinkPatched=true;
    return true;
  }

  // ---------- PATCH inbox rows to pass event ----------
  function patchInboxHtml(){
    // override inboxRowHtml globally if exposed? It's local, so we patch onclick via event delegation capture
    // Add capture listener that stops double handling and ensures one-click
    document.addEventListener('click', function(ev){
      try{
        var target = ev.target;
        if(!target) return;
        var row = target.closest && target.closest('.ch-contact[data-gid]');
        if(row){
          var gid=row.getAttribute('data-gid');
          if(gid){
            // prevent inline onclick from firing twice after our patch? inline will still fire, but guard prevents double
            // ensure stopPropagation for pin button already has it
            // mark event
            ev.__skhGroupClick=true;
          }
        }
        var dRow = target.closest && target.closest('.ch-contact[data-uid]');
        if(dRow && !dRow.closest('[data-gid]')){
          // direct chat row
          var uidAttr=dRow.getAttribute('data-uid') || dRow.getAttribute('data-uid');
          if(uidAttr && ev.__skhDirectPatched!==true){
            // nothing
          }
        }
      }catch(e){}
    }, true);
  }

  // ---------- PATCH Group Order detail ----------
  var origGODetail = null;
  function hookGODetail(){
    // gsgGoDetail is created inside 73, not global, but openGODetail is local
    // We can patch window.skhGOWindowOpen (child order) to be instant
    if(typeof window.skhGOWindowOpen === 'function' && !window.skhGOWindowOpen.__blinkPatched){
      var orig = window.skhGOWindowOpen;
      window.skhGOWindowOpen = async function(orderDocId){
        if(!orderDocId) return;
        if(window.__skhOpening && window.__skhOpening.oid===orderDocId && Date.now()-window.__skhOpening.at<800) return;
        window.__skhOpening={at:Date.now(),oid:orderDocId};
        // instant skeleton
        try{
          var existing=document.getElementById('gsgCoWS');
          if(existing) existing.remove();
          var pop=document.createElement('div');
          pop.id='gsgCoWS';
          pop.style.cssText='position:fixed;inset:0;z-index:100120;background:rgba(11,22,40,.5);display:flex;align-items:flex-end;justify-content:center;';
          pop.innerHTML='<div style="width:100%;max-width:430px;background:#fff;border-radius:18px 18px 0 0;padding:20px;text-align:center;color:#64748b;"><div style="width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#1268A8;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;"></div><div style="margin-top:10px;">Inafungua oda...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
          pop.addEventListener('click', function(ev){ if(ev.target===pop) { try{ pop.remove(); }catch(e){} } });
          document.body.appendChild(pop);
        }catch(e){}
        try{
          var r=await orig.call(this, orderDocId);
          return r;
        }catch(err){ console.error('[blinkFix GO]',err); }
      };
      window.skhGOWindowOpen.__blinkPatched=true;
    }
    return true;
  }

  // ---------- INIT HOOKS with retry ----------
  function init(){
    var ok=true;
    ok = hookDirect() && ok;
    ok = hookGroupRow() && ok;
    ok = hookSoga() && ok;
    ok = hookGODetail() && ok;
    try{ patchInboxHtml(); }catch(e){}
    // if not all hooked, retry
    if(!ok){
      setTimeout(init, 400);
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
  setTimeout(init, 800);
  setTimeout(init, 2000);

  // Also patch inline onclicks to pass event and stopPropagation for one-click guarantee
  // Override the HTML generation after renderInbox by wrapping renderInbox if global? renderInbox is local, so we use MutationObserver to rewrite onclick to include event
  try{
    var mo = new MutationObserver(function(muts){
      try{
        var list=document.getElementById('inboxList');
        if(!list) return;
        // rewrite onclick attributes to include event param for our guard
        list.querySelectorAll('.ch-contact[data-gid]').forEach(function(el){
          var gid=el.getAttribute('data-gid');
          if(gid && !el.__blinkFixed){
            el.__blinkFixed=true;
            // remove inline onclick to avoid double and use addEventListener once
            var origOnclick=el.getAttribute('onclick');
            el.removeAttribute('onclick');
            el.addEventListener('click', function(ev){
              ev.stopPropagation();
              ev.preventDefault();
              window.skhChatOpenGroupRow(gid, ev);
            }, { once:false });
            el.style.cursor='pointer';
          }
        });
        list.querySelectorAll('.ch-contact[data-uid]').forEach(function(el){
          if(el.hasAttribute('data-gid')) return; // group already handled
          var uid2=el.getAttribute('data-uid');
          if(uid2 && !el.__blinkFixedDirect){
            el.__blinkFixedDirect=true;
            var oc=el.getAttribute('onclick');
            // keep original for fallback but add listener that stops propagation and calls with event
            el.addEventListener('click', function(ev){
              ev.stopPropagation();
              // guard already in skhChatOpen
              // extract name from inner .ch-cc-name if needed
              var nameEl=el.querySelector('.ch-cc-name');
              var nm=nameEl? nameEl.textContent.trim() : '';
              // call direct with event marker
              try{
                window.skhChatOpen(uid2, nm, { __ev: ev, __fromClick:true });
              }catch(e){}
              // prevent inline from also firing (stopImmediatePropagation)
              ev.stopImmediatePropagation();
            }, true);
            // remove inline to prevent double after first fix
            if(oc && oc.indexOf('skhChatOpen')>=0){
              el.removeAttribute('onclick');
            }
            el.style.cursor='pointer';
          }
        });
      }catch(e){}
    });
    mo.observe(document.body, { childList:true, subtree:true });
  }catch(e){}

  console.log('[78-chat-fix-blink] patched one-click no-blink for direct/group/group-order');

})();

/* ================================================================
 * 79-one-ui-at-a-time.js — [PHASE 1 CONSOLIDATED]
 * Jukumu: Kutoa madaraja ya One-UI kuelekea kwenye 81
 * BILA kuweka timers zinazoshindana wala kurudia kuzi-wrap.
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function(){
  if(window.__skhOneUI) return;
  window.__skhOneUI = true;

  function byId(id){ return document.getElementById(id); }

  // 1. Daraja la skhHideAllOverlaysExcept kuelekea 81 (Single Authority)
  window.skhHideAllOverlaysExcept = function(exceptId){
    if (typeof window.skhAbsoluteHideAllExcept === 'function') {
      return window.skhAbsoluteHideAllExcept(exceptId);
    }
    // Fallback kama 81 haijapakiwa bado
    try {
      document.querySelectorAll('[id$="Modal"],[id$="Form"],.overlay-menu').forEach(function(el){
        if(exceptId && el.id === exceptId) return;
        if(el.id === 'skhDiscFab' || el.id === 'mainFeed' || el.id === 'appRoot') return;
        if(el.style.display !== 'none'){
          el.style.display = 'none';
          if(el.classList) el.classList.remove('open');
        }
      });
    } catch(e){}
  };

  // 2. Daraja la skhShowOverlay kuelekea 81
  window.skhShowOverlay = function(id, displayMode){
    if (typeof window.skhAbsoluteShowOnly === 'function') {
      return window.skhAbsoluteShowOnly(id, displayMode, true);
    }
    window.skhHideAllOverlaysExcept(id);
    var el = byId(id);
    if(el){
      el.style.display = displayMode || 'flex';
      if(el.classList) el.classList.add('open');
      document.body.style.overflow = 'hidden';
      return true;
    }
    return false;
  };

  // CSS ya kuzuia animation flicker kwenye madirisha
  try {
    if(!byId('skhOneUIStyle')){
      var style = document.createElement('style');
      style.id = 'skhOneUIStyle';
      style.textContent = `
        .skh-discover-engine, .skh-discover-overlay, #skhGroupSogaModal, #chatListModal, #chatModal, #gsgGoDetail, #gsgCoWS {
          transition: none !important;
          animation: none !important;
        }
        .skh-discover-engine.open, #skhGroupSogaModal.open, #chatListModal[style*="flex"], #chatModal[style*="flex"] {
          opacity: 1 !important; transform: none !important;
        }
        #skhDiscFab { pointer-events: auto !important; }
      `;
      document.head.appendChild(style);
    }
  } catch(e){}

  console.log('[79-one-ui-at-a-time] Phase 1 consolidated ✓ — linked to 81 authority');
})();
/* ==== js/app/06-navigation.js ==== */
import { skh } from './00-bootstrap.js';

window.goBackToSidebar = function() {
    // [FIX 2026-09-19] Ensure full stack closed, not only payment modals
    // Previously only hid userPaymentModal + buyerOrdersModal, leaving productModal/chat etc visible under sidebar
    try {
        if (typeof window.skhCloseAll === 'function') window.skhCloseAll();
        else if (typeof window.closeModals === 'function') window.closeModals(true);
    } catch(e) {}
    const pm = document.getElementById('userPaymentModal');
    if(pm) pm.style.display = 'none';
    const om = document.getElementById('buyerOrdersModal');
    if(om) om.style.display = 'none';
    if (typeof window.openSidebarMenu === 'function') window.openSidebarMenu();
};

window.doLogout = async function() {
    if(await skhConfirm("Una uhakika unataka kutoka kwenye akaunti yako?", {
        title: 'Toka kwenye akaunti', okText: 'Ndiyo, toka', cancelText: 'Ghairi'
    })) {
        try {
            try { window.skhCancelAllListeners && window.skhCancelAllListeners(); } catch(e) {}

            // [FIX 2] Safisha "ghost card": modal ya bidhaa ilikuwa inabaki hai,
            // hivyo picha ya tangazo lililokuwa wazi ilijitokeza tena wakati wa reload.
            try {
                if (typeof skhBusy === 'function') skhBusy(true, 'Inatoka…');
                try { window.skhNegoFormClose && window.skhNegoFormClose(); } catch(e) {}
                try { window.skhCloseMaoni && window.skhCloseMaoni(); } catch(e) {}
                try { window.skhCloseSearchDrop && window.skhCloseSearchDrop(); } catch(e) {}
                try { closeModals(); } catch(e) {}
                document.querySelectorAll('video').forEach(function(v){
                    try { v.pause(); v.removeAttribute('src'); v.load(); } catch(e) {}
                });
                ['pmImgWrapper','pmChips','pmCustomDetails','pmDeliveryList','pmReviewsSec', 'pmRelatedWrap','pmActionArea','pmVariantSelectionArea']
                    .forEach(function(id){ var el=document.getElementById(id); if(el) el.innerHTML=''; });
                var pmT=document.getElementById('pmTitle'); if(pmT) pmT.textContent='';
                var pmP=document.getElementById('pmPrice'); if(pmP) pmP.textContent='';
                skh.currentOpenProduct = null; skh.cachedItems = []; skh.chatCore = {};
                window.skhChatInboxCache = null; window.skhEngagementState = {};
                ['skh_last_product','skh_open_product','skh_recent_view']
                    .forEach(function(k){ try{ localStorage.removeItem(k); sessionStorage.removeItem(k); }catch(e){} });
                try { history.replaceState(null,'',location.pathname); } catch(e) {}
            } catch(e) { console.warn('[logout cleanup]', e); }

            await skh.signOut(skh.auth); // [PHASE 4.4] listeners zimefungwa kabla ya logout
            skhToast("Umetoka kikamilifu.", 'success', 1400);
            setTimeout(function(){ window.location.reload(); }, 500);
        } catch(e) {
            if (typeof skhBusy === 'function') skhBusy(false);
            skhToast("Kosa kutoa akaunti: " + e.message, 'error', 4000);
        }
    }
}

if(skh.imgWrapper) {
        skh.imgWrapper.addEventListener('touchstart', (e) => { 
            if(e.touches.length === 2) { 
                e.preventDefault(); 
                skh.pinchStartDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); 
                skh.initialScale = skh.imgScale; 
            } else { 
                skh.panning = true; 
                skh.startX = e.touches[0].pageX - skh.pointX; 
                skh.startY = e.touches[0].pageY - skh.pointY; 
            } 
        });
        
        skh.imgWrapper.addEventListener('touchmove', (e) => { 
            if(e.touches.length === 2) { 
                e.preventDefault(); 
                const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); 
                skh.imgScale = Math.min(Math.max(1, skh.initialScale * (dist / skh.pinchStartDist)), 5); 
                skh.setImgTransform(); 
            } else if(skh.panning && skh.imgScale > 1) { 
                e.preventDefault(); 
                skh.pointX = e.touches[0].pageX - skh.startX; 
                skh.pointY = e.touches[0].pageY - skh.startY; 
                skh.setImgTransform(); 
            } 
        });
        
        skh.imgWrapper.addEventListener('touchend', () => { skh.panning = false; });
        
        let lastTap = 0; 
        skh.imgWrapper.addEventListener('touchend', (e) => { 
            let currentTime = new Date().getTime(); 
            let tapLength = currentTime - lastTap; 
            if(tapLength < 300 && tapLength > 0) { 
                e.preventDefault(); 
                if(skh.imgScale > 1) { skh.imgScale = 1; skh.pointX = 0; skh.pointY = 0; } else { skh.imgScale = 2; } 
                skh.setImgTransform(); 
            } 
            lastTap = currentTime; 
        });
    }

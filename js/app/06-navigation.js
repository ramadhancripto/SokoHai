/* ==== js/app/06-navigation.js ==== */
import { skh } from './00-bootstrap.js';

window.goBackToSidebar = function() {
    // 1. Ficha Fomu ya Malipo na Oda
    const pm = document.getElementById('userPaymentModal');
    if(pm) pm.style.display = 'none';
    
    const om = document.getElementById('buyerOrdersModal');
    if(om) om.style.display = 'none';
    
    // 2. Fungua Menu moja ya pembeni (unified sidebar) — sio kufungua kifaa kilichovunjika
    if (typeof window.openSidebarMenu === 'function') window.openSidebarMenu();
};

window.doLogout = async function() {
    if(confirm("Una uhakika unataka kutoka kwenye akaunti yako?")) {
        try {
            try { window.skhCancelAllListeners && window.skhCancelAllListeners(); } catch(e) {}
            await skh.signOut(skh.auth); // [PHASE 4.4] listeners zimefungwa kabla ya logout
            alert("Umetoka kikamilifu.");
            closeModals();
            window.location.reload(); // Refresh page kuanza upya
        } catch(e) {
            alert("Kosa kutoa akaunti: " + e.message);
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

/* ==== js/06-announcement.js ==== */
(function(){
    if(window.__SOKOHAI_JS_MARQUEE_GUARANTEED_FINAL__) return;
    window.__SOKOHAI_JS_MARQUEE_GUARANTEED_FINAL__ = true;

    const normalItems = [
        {badge:'🚀 Welcome', text:'Welcome to SokoHai – Tanzania’s Smart Marketplace for Products, Services, Projects & Secure Escrow Payments.'},
        {badge:'🔒 Escrow', text:'All transactions are protected by Secure Escrow for safer buying and selling.'},
        {badge:'🎉 Beta Live', text:'SokoHai Beta is now live! Register today and experience secure digital commerce.'},
        {badge:'🎁 Promotion', text:'New sellers can register FREE for a limited time. Start selling today on SokoHai!'},
        {badge:'🏢 Companies', text:'Businesses, NGOs and Government Institutions can create verified accounts and manage projects securely.'},
        {badge:'👨‍💼 Services', text:'Find trusted professionals, skilled workers, and service providers across Tanzania.'},
        {badge:'💳 Payments', text:'Secure payment options are being expanded. More payment methods are coming soon.'},
        {badge:'🛒 Marketplace', text:'Buy Products • Sell Products • Hire Professionals • Manage Projects — all inside SokoHai.'}
    ];

    // Aina za matangazo na icon/jina lake la default (Admin Panel Announcement Types)
    const TYPE_META = {
        normal:          { icon:'🚀', label:'Welcome' },
        breaking:        { icon:'🔴', label:'Breaking News' },
        feature:         { icon:'🟢', label:'New Feature' },
        promotion:       { icon:'🔵', label:'Promotion' },
        maintenance:     { icon:'🟡', label:'Maintenance' },
        'security-notice':{ icon:'🟣', label:'Security Notice' },
        tender:          { icon:'⚫', label:'Government Tender' },
        event:           { icon:'🟠', label:'Event' },
        security:        { icon:'🔒', label:'Escrow' },
        launch:          { icon:'🎉', label:'Launch' },
        company:         { icon:'🏢', label:'Companies' },
        service:         { icon:'👨‍💼', label:'Services' },
        payment:         { icon:'💳', label:'Payments' },
        update:          { icon:'⭐', label:'Update' }
    };
    // Ipatikane globally ili Admin Panel itumie orodha hii hii ya aina za matangazo
    window.SOKOHAI_ANNOUNCEMENT_TYPE_META = TYPE_META;

    let rafId = null;
    let x = 0;
    let oneSetWidth = 0;
    let lastTime = 0;
    let speed = 52; // px/sec. Higher = faster. Smooth because requestAnimationFrame controls it.
    let lastRenderKey = '';

    function esc(s){
        return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }
    function getItems(){
        try{
            // 1. Kipaumbele: Matangazo ya Admin kutoka Firestore (live-sync, kila mtumiaji anaona)
            const fromFirestore = Array.isArray(window.__sokohaiAnnouncementsCache) ? window.__sokohaiAnnouncementsCache : [];
            const now = Date.now();
            const activeFromFirestore = fromFirestore.filter(a => {
                if(!a || !a.text) return false;
                if(a.active === false) return false;
                const startsOk = !a.startAt || new Date(a.startAt).getTime() <= now;
                const endsOk = !a.endAt || new Date(a.endAt).getTime() >= now;
                return startsOk && endsOk;
            }).map(a => {
                const meta = TYPE_META[a.type] || { icon:'📢', label:'Notice' };
                const badge = ((a.icon || meta.icon) + ' ' + meta.label).trim();
                return { badge, text: a.text, link: a.link || '', type: a.type || 'normal' };
            });
            if(activeFromFirestore.length) return activeFromFirestore;

            // 2. Legacy fallback: matangazo yaliyokuwa yamehifadhiwa localStorage (kabla ya Firestore sync)
            const custom = JSON.parse(localStorage.getItem('sokohai_admin_announcements') || '[]');
            const activeLocal = custom.filter(a => {
                const startsOk = !a.startAt || new Date(a.startAt).getTime() <= now;
                const endsOk = !a.endAt || new Date(a.endAt).getTime() >= now;
                return a && (a.text || a.message) && startsOk && endsOk;
            }).map(a => ({ badge: ((a.icon || '📢') + ' ' + (a.label || a.type || 'Notice')).trim(), text: a.text || a.message, link: a.link || '' }));
            return activeLocal.length ? activeLocal : normalItems;
        }catch(e){ return normalItems; }
    }
    function itemHtml(items){
        return '<div class="skh-js-marquee-set">' + items.map(it =>
            `<span class="skh-js-marquee-item"><span class="skh-js-marquee-badge">${esc(it.badge)}</span><span>${esc(it.text)}</span>${it.link ? `<a href="${esc(it.link)}" class="skh-js-readmore" onclick="event.stopPropagation();">Read More ➔</a>` : ''}<span class="skh-js-sep">•</span></span>`
        ).join('') + '</div>';
    }
    function stopLoop(){
        if(rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }
    function measureAndStart(){
        const bar = document.getElementById('topAnnouncement');
        const set = bar && bar.querySelector('.skh-js-marquee-set');
        if(!bar || !set){ return; }
        oneSetWidth = Math.ceil(set.getBoundingClientRect().width || set.scrollWidth || 0);
        if(!oneSetWidth){
            setTimeout(measureAndStart, 150);
            return;
        }
        x = 0;
        lastTime = performance.now();
        stopLoop();
        rafId = requestAnimationFrame(tick);
    }
    function tick(now){
        const bar = document.getElementById('topAnnouncement');
        const track = bar && bar.querySelector('.skh-js-marquee-track');
        if(!bar || !track){ rafId = null; return; }

        const dt = Math.min(64, Math.max(0, now - lastTime));
        lastTime = now;
        x -= (speed * dt / 1000);

        if(oneSetWidth > 0 && x <= -oneSetWidth){
            // seamless loop: keep the same visual position while recycling one full set
            x += oneSetWidth;
        }
        track.style.transform = `translate3d(${x}px,0,0)`;
        rafId = requestAnimationFrame(tick);
    }
    function render(items, highlight=false, key='normal'){
        const bar = document.getElementById('topAnnouncement');
        if(!bar) return;
        // Avoid rerendering normal marquee repeatedly; rerender resets movement.
        if(key === lastRenderKey && bar.classList.contains('skh-js-marquee') && rafId) return;
        lastRenderKey = key;
        const setHTML = itemHtml(items);
        // Two identical sets create an endless loop. JS moves the track by exactly one set width.
        bar.className = 'big-announcement skh-js-marquee' + (highlight ? ' skh-js-alert' : '');
        bar.innerHTML = `<div class="skh-js-marquee-viewport"><div class="skh-js-marquee-track">${setHTML}${setHTML}</div></div>`;
        setTimeout(measureAndStart, 60);
    }

    window.startSokoHaiSmoothMarquee = function(){
        if(window.__sokohaiAnnouncementInterval) clearInterval(window.__sokohaiAnnouncementInterval);
        if(window.__sokohaiProAnnouncementInterval) clearInterval(window.__sokohaiProAnnouncementInterval);
        if(window.__sokohaiProAnnouncementTimeout) clearTimeout(window.__sokohaiProAnnouncementTimeout);
        render(getItems(), false, 'normal');
    };

    // Firestore ikisasishwa (Admin akiongeza/kuhariri/kufuta tangazo), rudisha marquee mara moja
    window.__sokohaiOnAnnouncementsUpdate = function(){
        lastRenderKey = '';
        window.startSokoHaiSmoothMarquee();
    };
    // Re-check kila dakika ili start/end date za matangazo zizingatiwe hata bila mabadiliko mengine
    // (Haiguzi tangazo la dharura/mnada linaloendelea)
    let __lastItemsSignature = '';
    setInterval(function(){
        if(String(lastRenderKey).indexOf('normal') !== 0) return; // usiguze tangazo maalum linaloendelea
        const items = getItems();
        const sig = JSON.stringify(items);
        if(sig !== __lastItemsSignature){
            __lastItemsSignature = sig;
            lastRenderKey = '';
            window.startSokoHaiSmoothMarquee();
        }
    }, 30000);

    // Kill old engines that were causing freezing/jumping by resetting DOM or animation.
    window.startSokoHaiAnnouncementRotator = window.startSokoHaiSmoothMarquee;
    window.startSokoHaiProAnnouncementBar = window.startSokoHaiSmoothMarquee;
    window.playNextSokoHaiProAnnouncement = function(){};
    window.rotateSokoHaiAnnouncement = function(){};

    window.updateLiveTicker = function(type, message, mhusika='', forceReset=false){
        const t = String(type || 'normal');
        if(t === 'normal' && forceReset){
            // Inatumika Admin anapozima Alert System: lazimisha bar irudi kwenye
            // matangazo ya kawaida MARA MOJA, hata kama mnada ulikuwa unaonekana.
            clearTimeout(window.__sokohaiAlertMarqueeTimer);
            clearTimeout(window.__sokohaiPromoMarqueeTimer);
            lastRenderKey = '';
            window.startSokoHaiSmoothMarquee();
            return;
        }
  
        if(t === 'auction'){
            render([{badge:'🔥 Auction', text:`MNADA LIVE: ${String(mhusika || '').toUpperCase()} - dau linaendelea sasa.`}], false, 'auction:' + String(mhusika||''));
            clearTimeout(window.__sokohaiPromoMarqueeTimer);
            window.__sokohaiPromoMarqueeTimer = setTimeout(function(){ lastRenderKey=''; window.startSokoHaiSmoothMarquee(); }, 16000);
            return;
        }
        if(t === 'price_drop'){
            render([{badge:'📉 Price Drop', text:`BEI INASHUKA: ${String(mhusika || '').toUpperCase()} - wahi kabla haijaisha.`}], false, 'price:' + String(mhusika||''));
            clearTimeout(window.__sokohaiPromoMarqueeTimer);
            window.__sokohaiPromoMarqueeTimer = setTimeout(function(){ lastRenderKey=''; window.startSokoHaiSmoothMarquee(); }, 16000);
            return;
        }
        if(t === 'group_buy'){
            render([{badge:'👥 Group Buy', text:`GROUP BUY: jiunge na ${String(mhusika || '').toUpperCase()} uokoe pesa.`}], false, 'group:' + String(mhusika||''));
            clearTimeout(window.__sokohaiPromoMarqueeTimer);
            window.__sokohaiPromoMarqueeTimer = setTimeout(function(){ lastRenderKey=''; window.startSokoHaiSmoothMarquee(); }, 16000);
            return;
        }
        // Normal monitoring calls should NEVER reset; just ensure loop exists.
        const bar = document.getElementById('topAnnouncement');
        if(!bar || !bar.classList.contains('skh-js-marquee') || !rafId) window.startSokoHaiSmoothMarquee();
    };

    window.addEventListener('resize', function(){
        const bar = document.getElementById('topAnnouncement');
        if(bar && bar.classList.contains('skh-js-marquee')) setTimeout(measureAndStart, 120);
    });
    document.addEventListener('visibilitychange', function(){
        if(!document.hidden){ lastTime = performance.now(); if(!rafId) measureAndStart(); }
    });

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', window.startSokoHaiSmoothMarquee);
    } else {
        setTimeout(window.startSokoHaiSmoothMarquee, 250);
    }
})();

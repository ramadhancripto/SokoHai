/* ==== js/app/07-product.js ==== */
import { skh } from './00-bootstrap.js';

// Tafsiri (lugha moja kwa wakati) — LMS ikiwa ipo, la sivyo fallback ya Kiingereza
function T(key, en, vars) {
    var s = null;
    try { if (window.t) s = window.t(key, vars); } catch (e) {}
    if (!s || s === key) {
        s = en;
        if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
    }
    return s;
}

// [ZOOM] Kugusa picha au kubofya +/- -> viewer kamili ya kukuza/kupunguza
// inayoweza kusogeza picha upande wowote (pinch + drag) — 26-image-zoom.js
window.zoomProductImage = function(delta) {
    const pics = window.skhZoomImages || [];
    if (!pics.length) return;
    const idx = (typeof window.skhZoomIndex === 'number') ? window.skhZoomIndex : 0;
    // "+" inafungua viewer ikiwa imekuzwa kidogo; "−" inafungua ikiwa kawaida
    window.openImageZoom(pics, idx, delta > 0 ? 2 : 1);
};

// [FIX 2026-09] Slider ya picha kwenye modal ya bidhaa (prev/next).
window.skhSlideProductImage = function(dir) {
    const slider = document.getElementById('pmImageSlider');
    if (!slider) return;
    const pics = window.skhZoomImages || [];
    const width = slider.clientWidth || 1;
    const count = pics.length || 1;
    let current = Math.round(slider.scrollLeft / width);
    let next = current + dir;
    if (next < 0) next = count - 1;
    if (next >= count) next = 0;
    slider.scrollTo({ left: next * width, behavior: 'smooth' });
};

window.changeQty = function(amount) {
    const qtyInput = document.getElementById('pmQty');
    // [CARD 2026-09] Heshimu kiwango cha chini (min order) na stock halisi.
    let minQty = parseInt(qtyInput.dataset.min, 10);
    if (isNaN(minQty) || minQty < 1) minQty = 1;
    let maxQty = parseInt(qtyInput.dataset.max, 10);
    if (isNaN(maxQty) || maxQty < 0) maxQty = null; // null = haijulikani
    let currentQty = parseInt(qtyInput.value) || minQty;
    currentQty += amount;
    if (currentQty < minQty) currentQty = minQty;
    if (maxQty !== null && currentQty > maxQty) currentQty = maxQty;
    qtyInput.value = currentQty;

    // Ongeza/zuia vitufe kwenye mipaka.
    const minus = document.getElementById('pmQtyMinus');
    const plus = document.getElementById('pmQtyPlus');
    if (minus) minus.disabled = currentQty <= minQty;
    if (plus) plus.disabled = (maxQty !== null && currentQty >= maxQty);

    // [§20 WHOLESALE] Bidhaa za jumla — tiers za SELLER-DEFINED ndizo zenye
    // kula mamlaka (siyo calculateDynamicPrice ya bulk packaging).
    if (skh.currentOpenProduct && skh.currentOpenProduct.saleMode === 'wholesale' && typeof window.skhPsRefreshTotal === 'function') {
        try { window.skhPsRefreshTotal(skh.currentOpenProduct); } catch (e) {}
        return;
    }
    if (typeof skh.calculateDynamicPrice === 'function') {
        skh.calculateDynamicPrice();
    } else {
        // Refresh ya bei kupitia showcase ikiwa ipo.
        try {
            const totalEl = document.getElementById('pmTotalPriceCalc');
            const p = skh.currentOpenProduct;
            if (totalEl && p && window.skhPsRefreshTotal) window.skhPsRefreshTotal(p);
        } catch (e) {}
    }
};

// [AUDIT-FIX] Picha zinaweza kuhifadhiwa kama array, string (moja au zenye koma), au object {0:url,...}.
// Awali `imagesArray.filter` ilitupa TypeError kwa string/object -> kadi nzima haikuchorwa (modal tupu
// au ikiwa na maudhui/vitufe vya bidhaa iliyopita) bila ujumbe wowote.
window.skhNormalizeImages = function (p) {
    var out = [];
    function add(v) {
        if (v == null) return;
        if (Array.isArray(v)) { v.forEach(add); return; }
        if (typeof v === 'object') {
            if (typeof v.url === 'string' || typeof v.secure_url === 'string') { add(v.url || v.secure_url); return; }
            Object.keys(v).forEach(function (k) { add(v[k]); }); return;
        }
        var s = String(v).trim();
        if (!s) return;
        if (s.indexOf(',') !== -1 && !/^data:/i.test(s) && /,\s*https?:\/\//i.test(s)) { s.split(/,\s*(?=https?:\/\/)/i).forEach(add); return; }
        out.push(s);
    }
    if (p) { add(p.imagesArray); if (!out.length) add(p.images); if (!out.length) add(p.image); if (!out.length) add(p.photo); if (!out.length) add(p.imageUrl); }
    return out;
};

window.openProduct = async function(id, manualCollection = null) {
    // [FIX 2026-09-20] id tupu (mf. kipengee cha Saved kisicho na productId) ilifanya skh.doc(...)
    // itupe hitilafu isiyoonekana — kadi haikufunguka na hakukuwa na ujumbe.
    if (!id || typeof id !== 'string') {
        try { console.warn('[openProduct] id haipo:', id); } catch (e) {}
        try { (window.skhToast || window.alert)(T('pm_open_noid', 'Kadi hii haiwezi kufunguka (kiungo kimekosa taarifa).'), 'error'); } catch (e) {}
        return;
    }
    // 1. Tambua collection (Bidhaa, Huduma, nk)
    // 1. Tafuta kundi sahihi la bidhaa (Collection) kwenye kumbukumbu ya haraka (Cache)
    let colToUse = manualCollection;
    if (!colToUse) {
        const foundInCache = skh.cachedItems.find(item => item.id === id);
        if (foundInCache && foundInCache.collectionName) {
            colToUse = foundInCache.collectionName;
        }
    }
    // Kama bado haijatambulika, weka kundi la kawaida (products)
    if (!colToUse || colToUse === 'all') {
        colToUse = (skh.currentFeedCollection && skh.currentFeedCollection !== 'all') ? skh.currentFeedCollection : 'products';
    }
    
    // 3. ANZA LIVE LISTENER (Hapa ndipo mawasiliano yanatokea)
    // [AUDIT-FIX 2026-09-16 :: alert ya uongo "Bidhaa haipo" baada ya login]
    // KISABABISHI: bidhaa iliyoko collection isiyo 'products' (mf. services/drivers)
    // ilipofunguliwa MAPYAAAAAAAAAAAAAA/mapema baada ya login, cache haikuwa tayari —
    // colToUse ilikuwa 'products' kimakosa -> snapshot.exists() = false -> alert.
    // Sasa: listener inafuatilia doc; kama haipo, inaangalia makundi MENGINE kabla
    // ya kutangaza "haipo". Alert inatokea TU baada ya makundi yote kudhibitisha miss.
    const SKH_OPEN_COLS = ['products','services','drivers'];
    let skhOpenMissChecked = false;

    const skhAttachProductListener = (colName) => {
        if(window.activeProductUnsubscribe) window.activeProductUnsubscribe();
        const docRef = skh.doc(skh.db, colName, id);
        window.activeProductUnsubscribe = skh.onSnapshot(docRef, async (snapshot) => {
            if(!snapshot.exists()) {
                if (skhOpenMissChecked) {
                    alert(T('pm_deleted', 'Product no longer available!'));
                    closeModals();
                    return;
                }
                skhOpenMissChecked = true;
                // [AUDIT-FIX] Sura ya makundi mengine kabla ya alert (bila kuficha:
                // kama kweli bidhaa imefutwa, alerti itafika hapa baada ya ukaguzi wote).
                try {
                    const others = SKH_OPEN_COLS.filter(c => c !== colName);
                    for (const oc of others) {
                        const alt = await skh.getDoc(skh.doc(skh.db, oc, id));
                        if (alt && typeof alt.exists === 'function' && alt.exists()) {
                            colToUse = oc;
                            skhOpenMissChecked = false; // [AUDIT-FIX] mpya: ruhusu miss moja kwa collection iliyosahihishwa
                            skhAttachProductListener(oc);
                            return;
                        }
                    }
                } catch (e) {}
                alert(T('pm_deleted', 'Product no longer available!'));
                closeModals();
                return;
            }

        const found = { id: snapshot.id, collectionName: colName, ...snapshot.data() };
        skh.currentOpenProduct = found;

        // [BUYER DASHBOARD] Recent view moja kwa user+entity (bounded, central).
        // Tunatumia recommendationEvents iliyopo; hakuna BuyerProductHistory mpya.
        try {
            if (skh.currentUser && (!found.userId || found.userId !== skh.currentUser.uid)) {
                const recentId = skh.currentUser.uid + '__view__' + colName + '__' + found.id;
                skh.setDoc(skh.doc(skh.db, 'recommendationEvents', recentId), {
                    userId: skh.currentUser.uid,
                    type: 'ENTITY_VIEWED',
                    entityType: colName === 'services' ? 'service' : (colName === 'drivers' ? 'transport' : 'product'),
                    entityId: found.id,
                    collectionName: colName,
                    title: found.title || found.name || '',
                    image: found.image || found.photo || '',
                    at: new Date().toISOString()
                }, { merge: true }).catch(function () {});
            }
        } catch (e) {}

        // [PUBLIC LINKS] Weka URL ya bidhaa kwenye address bar (bila ku-reload)
        // — hii inafanya kiungo kiweze kushirikiwa na kuonekana na Google.
        window.skhSetProductUrl(found.id);
        window.skhUpdateSeoMeta(found);

        // --- CHORA UI (Renders everything inside the modal) ---
        
        try {
        // A. Jaza Picha (Ulinzi uliodhibitiwa dhidi ya picha tupu)
        const slider = document.getElementById('pmImageSlider');
        let pics = window.skhNormalizeImages(found);
        pics = pics.filter(p => p && !/ui-avatars\.com/.test(String(p))); // [PHASE 5.7] chuja na avatar za zamani za DB
        if (pics.length === 0) {
            pics = [window.SKH_PLACEHOLDER_IMG || "https://ui-avatars.com/api/?name=Soko&background=f1f5f9&color=64748b"]; // [PHASE 5.7] tile ya SOKOHAI
        }

        // [SHOWCASE 39] Tenga video na picha; viewer ya zoom hupokea picha tu.
        const _isVid = (u) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(String(u)) || /\/video\/upload\//.test(String(u));
        const _zoomImgs = pics.filter(u => !_isVid(u));
        window.skhZoomImages = _zoomImgs.length ? _zoomImgs : pics;
        slider.innerHTML = pics.map((pic) => {
            if (_isVid(pic)) {
                return `<div style="min-width:100%; height:100%; display:flex; align-items:center; justify-content:center; scroll-snap-align:start; background:#0f172a;"> <video src="${skh.skhEscape(pic)}" controls muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain;"></video> </div>`;
            }
            const zIdx = window.skhZoomImages.indexOf(pic);
            return `
            <div onclick="window.openImageZoom(window.skhZoomImages, ${zIdx >= 0 ? zIdx : 0})" style="min-width:100%; height:100%; display:flex; align-items:center; justify-content:center; scroll-snap-align:start; cursor:zoom-in;"> <img src="${skh.skhEscape(skh.getOptimizedImageUrl(pic))}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;" onerror="this.src=window.SKH_PLACEHOLDER_IMG||'https://ui-avatars.com/api/?name=Soko&background=f1f5f9&color=64748b'"> </div>`;
        }).join('');

        // [ZOOM] Index ya sasa kwa viewer ya kugusa (26-image-zoom.js)
        window.skhZoomIndex = 0;

        // [FIX 2026-09] Mishale (prev/next) + counter ya kuslide picha (zaidi ya 1)
        const hasMany = pics.length > 1;
        const _prevBtn = document.getElementById('pmPrevBtn');
        const _nextBtn = document.getElementById('pmNextBtn');
        const _counter = document.getElementById('pmImageCounter');
        if (_prevBtn) _prevBtn.style.display = hasMany ? 'block' : 'none';
        if (_nextBtn) _nextBtn.style.display = hasMany ? 'block' : 'none';
        if (_counter) { _counter.style.display = hasMany ? 'block' : 'none'; _counter.textContent = '1/' + pics.length; }

        // 1. Chora doti za picha dynamically kulingana na idadi ya picha
        const dotsContainer = document.getElementById('pmImageDots');
        if (dotsContainer) {
            dotsContainer.innerHTML = pics.map((_, idx) => `
                <span class="pm-dot ${idx === 0 ? 'active' : ''}" style="width:8px; height:8px; border-radius:50%; background:#cbd5e1; display:inline-block; transition: 0.3s;"></span> `).join('');
        }

        // 2. Sikiliza kusogea (scroll) kwa picha ili kuwasha doti inayohusika
        if (slider) {
            slider.onscroll = function() {
                const width = slider.clientWidth;
                const index = Math.round(slider.scrollLeft / width);
                window.skhZoomIndex = index;
                if (_counter) _counter.textContent = (index + 1) + '/' + pics.length;
                document.querySelectorAll('.pm-dot').forEach((dot, idx) => {
                    if (idx === index) {
                        dot.style.background = 'var(--gold)';
                        dot.style.transform = 'scale(1.2)';
                    } else {
                        dot.style.background = '#cbd5e1';
                        dot.style.transform = 'scale(1)';
                    }
                });
            };
        }
        } catch (eMedia) {
            // [AUDIT-FIX] hitilafu ya picha isizuie maelezo na vitufe vya kununua kuchorwa
            try { console.warn('[openProduct] media render error:', eMedia && (eMedia.stack || eMedia.message)); } catch (e) {}
        }
        // B. [SHOWCASE MODULE 39] Panga muonekano mzima wa bidhaa:
        //    identity/bei/upatikanaji, variants za data, panel ya mnada,
        //    maelezo/sifa, usambazaji/ulinzi, tathmini, muuzaji (fupi),
        //    kifimbo cha chini (Cart/Buy/Chat/Dau/Agiza). Renderer haigusi
        //    logic ya cart/checkout/order/negotiation — inatumia handlers zilizopo.
        if (typeof window.skhRenderShowcase === 'function') {
            window.skhRenderShowcase(found, colToUse);
        }
        // Search and direct product opening share the same Discovery Context.
        if (typeof window.skhActivateProductDiscovery === 'function') {
            try { window.skhActivateProductDiscovery(found, colToUse); } catch (eDiscovery) { console.warn('[product discovery context]', eDiscovery); }
        }

            // Ongeza view moja kiotomatiki (Ikiwa haijawa viewed)
            if(!sessionStorage.getItem('v_'+id)) {
                skh.updateDoc(docRef, { views: skh.increment(1) });
                sessionStorage.setItem('v_'+id, '1');
            }
            
            // Inaleta na kusasisha comments, views, na likes live!
            skh.updateInteractionUI();

            // [BUYER ENGAGEMENT] Pakia hali ya Like/Save/Watch/Follow (28-buyer-engagement.js)
            if (typeof window.skhLoadEngagementState === 'function') window.skhLoadEngagementState(skh.currentOpenProduct);

            // [MIKOA/WAUZAJI] Chora "Wauzaji Wengine" chini ya maelezo
            skh.loadRelatedProducts(found.category || found.subCategory || '', id, colToUse);
        }, function (listenErr) {
            // [FIX 2026-09-20] Awali hakukuwa na error callback: Firestore ikikataa (rules/mtandao)
            // kadi ilibaki na "Bidhaa / TSh 0" bila vitufe na bila maelezo. Sasa mtumiaji anaona
            // sababu na anaweza kujaribu tena.
            try { console.warn('[openProduct] listener error:', listenErr && (listenErr.code || listenErr.message)); } catch (e) {}
            try {
                window.__skhRetryOpenProduct = function () { window.openProduct(id, colToUse); };
                const aa = document.getElementById('pmActionArea');
                if (aa) aa.innerHTML = '<div class="pm-bar-loading"><span>' + skh.skhEscape(T('pm_load_fail', 'Imeshindikana kupakia kadi hii.')) + '</span>'
                    + '<button type="button" class="pm-bar-btn pm-bar-primary" onclick="window.__skhRetryOpenProduct()">' + skh.skhEscape(T('pm_retry', 'Jaribu tena')) + '</button></div>';
            } catch (e) {}
        });
    };

    // [AUDIT-FIX 2026-09-16] Anza na collection iliyotajwa; kama haipo,
    // listener (hapo juu) itafungua makundi mengine kabla ya alert.
    // [FIX 2026-09-20] Onyesha hali ya kupakia kwenye eneo la vitufe mara moja (badala ya
    // kuacha tupu hadi data ifike) — renderBar() inaandika juu yake data ikifika.
    try {
        const _aa0 = document.getElementById('pmActionArea');
        if (_aa0) _aa0.innerHTML = '<div class="pm-bar-loading"><span>' + skh.skhEscape(T('pm_loading', 'Inapakia…')) + '</span></div>';
    } catch (e) {}
    skhAttachProductListener(colToUse);

        // [FLOW 2026-09] Details inapofunguka: FUNSA scroll ya background —
        // ndiyo sababu mtumiaji aliona "card ikiwa sticky juu ya recommendations
        // zinazosogea nyuma yake". Sheet inafunika viewport, bg inabaki kimya
        // hadi ikifungwa (closeModals tayari hurudisha overflow='auto').
        try { document.body.style.overflow = 'hidden'; } catch (e) {}

        document.getElementById('productModal').style.display = 'flex';
        // [AUDIT-FIX] Kadi ifunguke JUU ya modal ilipofunguliwa (duka, saved, chat, oda...) — awali
        // productModal (z-index 7500) ilifunguka NYUMA ya sellerProfileModal (7900) n.k. na ilionekana
        // kama "kadi haifunguki".
        try { if (typeof window.skhBringToFront === 'function') window.skhBringToFront('productModal'); } catch (e) {}
    };

window.renderSpecialModesUI = function(mode, actionArea) {
    const mData = skh.currentOpenProduct.modeData || {};
    const nowMs = Date.now();
    let basePrice = parseFloat(skh.currentOpenProduct.price) || 0;

    // [MODES CORE §37] Msavindane ubora: malipo yanaanza na HESABU HALISI za
    // doc (skhModesCompute) — si placeholders. Lifecycle lazima igongwe mbele
    // ya render (ikiwezekana inaandika status/gamata mara moja hiya ya Firestore).
    try { window.skhModesLifecycle(skh.currentOpenProduct); } catch (e) {}
    const C = window.skhModesCompute(skh.currentOpenProduct);

    if (mode === 'auction') {
        const currentBid = C.auction.currentBid;
        const totalBids = C.auction.totalBids;
        const winner = C.auction.winnerName || "Bado hakuna";
        const isExpired = C.auction.ended;
        const meUid = skh.currentUser && skh.currentUser.uid;
        const iAmWinner = !!(meUid && C.auction.winnerId && meUid === C.auction.winnerId);

        if (isExpired) {
            // [§11 AUCTION END] Winner anaweza kulipia — ukweli kutoka Firestore.
            const winnerAction = iAmWinner
                ? `<button onclick="window.skhAuctionWinnerCheckout()" style="width:100%; padding:16px; background:var(--green,#18A982); color:white; border:none; border-radius:14px; font-weight:900; cursor:pointer; margin-top:12px;"> LIPILIA ZABUNI YANGU (TSh ${currentBid.toLocaleString()})</button>`
                : (C.auction.winnerId ? '' : `<p style="opacity:0.85;">Hakuna dau lililowekwa kabla ya muda kufika.</p>`);
            actionArea.innerHTML = `
                <div style="background:#fff; color:#18352D; border:1px solid #E5ECEC; padding:20px; text-align:center; border-radius:18px;"> <h3 style="color:var(--gold); margin:0;"> MNADA UMEFUNGWA</h3> <p>Mshindi: <b>${winner.toUpperCase()}</b></p> <h2 style="color:var(--gold);">TZS ${currentBid.toLocaleString()}</h2> ${winnerAction} </div>`;
        } else {
            actionArea.innerHTML = `
                <div style="background:#fef2f2; padding:15px; border-radius:18px; text-align:center; border: 2px dashed #ef4444;"> <b style="color:#ef4444;"> MNADA LIVE</b><br> <span class="live-timer" data-endtime="${mData.endTime}" style="color:#ef4444; font-weight:900; font-size:20px;"> ...</span> <div style="background:white; padding:10px; border-radius:12px; margin:10px 0; display:flex; justify-content:space-around;"> <div><small>Dau la Juu</small><br><b>${currentBid.toLocaleString()}</b></div> <div><small>Bids</small><br><b>${totalBids}</b></div> </div> <div style="background:white; padding:10px; border-radius:12px; margin-bottom:12px; border:1px solid #ddd;"> <input type="number" id="userBidInput" placeholder="Angalau TSh ${C.auction.minNextBid.toLocaleString()}" style="width:100%; border:none; outline:none; text-align:center; font-weight:900; font-size:18px;"> <small style="color:#64748b;">Dau lako lazima liwe angalau <b>TSh ${C.auction.minNextBid.toLocaleString()}</b> (dau la juu + 5%)</small> </div> <button onclick="window.placeBid()" style="width:100%; padding:16px; background:#ef4444; color:white; border:none; border-radius:14px; font-weight:900; cursor:pointer;">WEKA DAU LAKO </button> </div>`;
        }
    }
    else if (mode === 'price_drop') {
        // [§16-§18 PRICE DROP] Hesabu ya bei ya sasa kutoka modeData halisi
        // (startTime/intervalMs/dropAmount/minPrice) — si frontend cache.
        const end = C.drop.endsAt;
        const min = C.drop.minPrice;
        const currentP = C.drop.currentPrice;
        const isExpired = C.drop.ended;

        if (isExpired) {
            actionArea.innerHTML = `
                <div style="background:#fff; color:#18352D; border:1px solid #E5ECEC; padding:20px; text-align:center; border-radius:18px;"> <h3 style="color:#ef4444; margin:0;"> PRICE DROP DEAL IMEKWISHA</h3> <h2 style="color:var(--gold);">TZS ${min.toLocaleString()}</h2> <p style="opacity:0.85; font-size:12px;">Bei ya mwisho ilikuwa TSh ${min.toLocaleString()}</p></div>`;
        } else {
            actionArea.innerHTML = `
                <div style="background:#f3e8ff; padding:15px; border-radius:18px; text-align:center; border: 2px dashed #9333ea;" data-mode-panel="price_drop" data-live-price="${currentP}" data-live-ends="${end}"> <b style="color:#9333ea;"> PRICE DROP DEAL IS LIVE</b><br> <span class="live-timer" data-endtime="${end}" style="color:#9333ea; font-weight:900; font-size:20px;"> ...</span> <div style="background:white; padding:10px; border-radius:12px; margin:10px 0; text-align:center;"> <span style="font-size:12px; color:gray;">Bei ya Sasa Hivi:</span> <h2 style="color:#9333ea; margin:5px 0;">TZS ${Math.round(currentP).toLocaleString()}</h2> <small style="color:#94a3b8;">Ilizaliwa TSh ${basePrice.toLocaleString()} · inapungua hadi TSh ${min.toLocaleString()}</small></div> <button onclick="window.skhPriceDropCheckout()" style="width:100%; padding:16px; background:#9333ea; color:white; border:none; border-radius:14px; font-weight:900; cursor:pointer;"> NUNUA KWA BEI HALISI YA SASA & LIPYA (ESCROW)</button> </div>`;
        }
    }
    else if (mode === 'group_buy') {
        const joined = C.group.joined;
        const target = C.group.target;
        const end = C.group.endsAt;
        const currentPrice = C.group.price;
        const status = C.group.status; // active | successful | failed
        const meUid = skh.currentUser && skh.currentUser.uid;
        const alreadyIn = (C.group.participants || []).indexOf(meUid) !== -1;
        const isExpired = status !== 'active';
        const expiredTitle = status === 'successful'
            ? ' GROUP BUY IMEFANIKIWA (' + joined + '/' + target + ')'
            : ' GROUP BUY IMEKUTA MUDA (' + joined + '/' + target + ' wamejiunga)';

        if (isExpired) {
            actionArea.innerHTML = `
                <div style="background:#fff; color:#18352D; border:1px solid #E5ECEC; padding:20px; text-align:center; border-radius:18px;" data-mode-panel="group_buy"> <h3 style="color:${status === 'successful' ? '#10b981' : '#f59e0b'}; margin:0;">${expiredTitle}</h3> ${status === 'failed' ? '<p style="opacity:0.85; font-size:12px;">Lengo halikufikiwa — hakuna oda inayotoezna kutoka deal hii.</p>' : '<p>Bei ya kundi ni TSh ' + Math.round(currentPrice).toLocaleString() + '</p>'} </div>`;
        } else {
            let progressPercent = Math.min(100, (joined / target) * 100);
            const joinLabel = alreadyIn ? 'UMEJIUNGA — KAMILISHA MALIPO (ESCROW)' : 'JIUNGE NA KUNDI & HIFADHI NAFSI (ESCROW)';
            actionArea.innerHTML = `
                <div style="background:#dcfce7; padding:15px; border-radius:18px; text-align:center; border: 2px dashed #10b981;" data-mode-panel="group_buy" data-live-price="${currentPrice}" data-live-joined="${joined}" data-live-target="${target}"> <b style="color:#10b981;"> GROUP BUY INAVUMA</b><br> <span class="live-timer" data-endtime="${end}" style="color:#10b981; font-weight:900; font-size:20px;"> ...</span> <div style="background:white; padding:10px; border-radius:12px; margin:10px 0; text-align:center;"> <span style="font-size:12px; color:gray;">Bei ya Kundi Sasa:</span> <h2 style="color:#10b981; margin:5px 0;">TZS ${Math.round(currentPrice).toLocaleString()}</h2> <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden; margin-top:10px;"> <div style="width:${progressPercent}%; height:100%; background:#10b981;"></div> </div> <small style="font-size:12.5px; color:gray; display:block; margin-top:5px;">Watu waliojiunga: <b>${joined}/${target}</b></small> </div> <button onclick="window.skhGroupBuyJoinAndCheckout()" style="width:100%; padding:16px; background:#10b981; color:white; border:none; border-radius:14px; font-weight:900; cursor:pointer;"> ${joinLabel}</button> <small style="display:block; margin-top:8px; color:#64748b;">Umejiunga unarekodiwa kwenye Firestore — oda na usafirishaji hutathminiwa kulingana na deal. </small></div>`;
        }
    }
};

/* [§14 R4 GROUP BUY CORE] Join = Firestore update (unique-joiner guard).
 * Tel. flow: RE-READ → guard → update → lifecycle (SUCCESSFUL/Debugging) →
 * kisha malipo (escrow) kulingana na sera ya sasa (checkoutSeriousMode). */
window.skhGroupBuyJoin = async function (productId) {
    if (!skh.requireAuth()) return { ok: false, error: 'login' };
    const col = (skh.currentOpenProduct && skh.currentOpenProduct.collectionName) || 'products';
    const prodRef = skh.doc(skh.db, col, productId);
    const meUid = skh.currentUser && skh.currentUser.uid;

    try {
        const snap = await skh.getDoc(prodRef);
        if (!snap || !snap.exists || !snap.exists()) return { ok: false, error: 'bidhaa_haipo' };
        const p = Object.assign({ id: productId, collectionName: col }, snap.data());
        const c = window.skhModesCompute(p);
        if (c.mode !== 'group_buy') return { ok: false, error: 'si_group' };
        if (c.group.status !== 'active') return { ok: false, error: 'group_' + c.group.status };
        if ((c.group.participants || []).indexOf(meUid) !== -1) return { ok: true, already: true, joined: c.group.joined };

        await skh.updateDoc(prodRef, {
            'modeData.joinedUsers': skh.increment(1),
            'modeData.participants': skh.arrayUnion(meUid)
        });

        // [§37 LIFECYCLE] Mtalengo gusa → successful + arifa (guarded mara moja)
        const newP = Object.assign({}, p, { modeData: Object.assign({}, p.modeData, {
            joinedUsers: c.group.joined + 1, participants: (c.group.participants || []).concat([meUid])
        }) });
        try { await window.skhModesLifecycle(newP); } catch (e) {}
        return { ok: true, joined: c.group.joined + 1 };
    } catch (e) {
        return { ok: false, error: (e && e.message) || 'error' };
    }
};

/* Join + malipo (serious-action deposit gate inatumika ikiwa iko ON) — KADADAGA
 * inacooka "Lipa" bila ku-rekodi group membership kwanza. Hii ndiyo full §14. */
window.skhGroupBuyJoinAndCheckout = async function () {
    if (!skh.currentOpenProduct) return;
    const id = skh.currentOpenProduct.id, mode = skh.currentOpenProduct.saleMode || 'group_buy';
    if (typeof window.verifyAndProceedSeriousAction === 'function') {
        await window.verifyAndProceedSeriousAction("Action", mode, id, async () => {
            const r = await window.skhGroupBuyJoin(id);
            if (!r.ok) { alert('Imeshindikana kujiunga: ' + r.error); return; }
            // Bei halisi kutoka panel (inarender kutoka compute ya backend doc)
            const panel = document.querySelector('#pmSpecialModeArea [data-live-price]');
            const livePrice = panel ? parseFloat(panel.getAttribute('data-live-price')) : null;
            const p = window.skhModesCompute(skh.currentOpenProduct).group.price;
            window.checkoutSeriousMode(isFinite(livePrice) ? livePrice : p);
        });
    } else {
        const r = await window.skhGroupBuyJoin(id);
        if (!r.ok) { alert('Imeshindikana kujiunga: ' + r.error); return; }
        try { window.checkoutSeriousMode(window.skhModesCompute(skh.currentOpenProduct).group.price); } catch (e) {}
    }
};

/* [§18 PRICE DROP CORE] Malipo kwa bei halisi ya SASA. Bei inasomwa kutoka
 * panel iliyorender (#pmSpecialModeArea [data-live-price], uppendekeo: ina-
 * anISHIA ya compute ya modeData ya Firestore), AU compute moja kwa moja.
 * Inakubali productId (kutoka action-bar) AU currentOpenProduct; inarudisha
 * {ok, error} — imara kwa probes na tidy UX. */
window.skhPriceDropCheckout = async function (productId) {
    if (!skh.requireAuth()) return { ok: false, error: 'login' };
    let p = skh.currentOpenProduct;
    if (productId && (!p || p.id !== productId)) {
        try { const snap = await skh.getDoc(skh.doc(skh.db, 'products', productId)); p = snap && snap.exists() ? Object.assign({ id: snap.id, collectionName: 'products' }, snap.data()) : null; } catch (e) { p = null; }
    }
    if (!p) return { ok: false, error: 'bidhaa_haipo' };
    const c = window.skhModesCompute(p);
    if (c.mode !== 'price_drop') return { ok: false, error: 'si_price_drop' };
    if (c.drop.ended) { alert(' Deal imekwisha: bei haiyakati tena.'); return { ok: false, error: 'deal_imekwisha' }; }
    const panel = document.querySelector('#pmSpecialModeArea [data-live-price], #specialModePanel[data-live-price]');
    const livePrice = panel ? parseFloat(panel.getAttribute('data-live-price')) : null;
    const price = isFinite(livePrice) ? livePrice : c.drop.currentPrice;
    skh.currentOpenProduct = p;
    window.checkoutSeriousMode(price);
    return { ok: true, amount: price };
};

/* [§11 AUCTION WINNER] Wuhi: winner pekee aedae kulipia bidhaa. */
/* [§17 B WINNER PAY] Mshindi wa mnada pekee ndiye anaye-tajirisha oda.
 * Inachukua productId (kutoka action-bar/render) AU currentOpenProduct.
 * Guard: mnada umefungwa + uid === modeData.winnerId (dawa ya "kufinya
 * kufungua oda ya mwingine"). */
window.skhAuctionWinnerCheckout = async function (productId) {
    if (!skh.requireAuth()) return { ok: false, error: 'login_required' };
    let p = skh.currentOpenProduct;
    if (productId && (!p || p.id !== productId)) {
        try { const snap = await skh.getDoc(skh.doc(skh.db, 'products', productId)); p = snap.exists() ? Object.assign({ id: snap.id }, snap.data()) : null; } catch (e) { p = null; }
    }
    if (!p) return { ok: false, error: 'bidhaa_haipo' };
    const c = window.skhModesCompute(p);
    if (c.mode !== 'auction') return { ok: false, error: 'si_mnada' };
    if (!c.auction.ended) return { ok: false, error: 'mnada_bado_live' };
    const meUid = skh.currentUser && skh.currentUser.uid;
    if (!meUid || c.auction.winnerId !== meUid) {
        alert(' Mnada una kikwaya: oda haiundwi — malipo ni kwa mshindi (winner) tu.');
        return { ok: false, error: 'si_mshindi' };
    }
    skh.currentOpenProduct = p;
    window.checkoutSeriousMode(c.auction.currentBid);
    return { ok: true, amount: c.auction.currentBid };
};

/* ================================================================
 * [MODES CORE 2026-09] Chanzo kimoja cha HESABU + LIFECYCLE ya
 * commerce modes (auction / group_buy / price_drop / wholesale).
 * Sera: doc ya `products` + modeData ndiyo chanzo chetu; client hufanya
 * RE-READ kabla ya kukubali writable actions (Firestore-native
 * "server-authoritative" kwa app hii), hakuna fake state kwenye UI.
 * ================================================================ */
window.skhModesCompute = function (p) {
    // Hesabu za KUSOMA pekee kutoka data halisi ya doc — zirejeshwe kwa UI zote.
    const md = (p && p.modeData) || {};
    const base = parseFloat(p && p.price) || 0;
    const now = Date.now();
    const out = { mode: (p && p.saleMode) || 'free_market', base: base, modeData: md, now: now };
    if (out.mode === 'auction') {
        const currentBid = parseFloat(md.currentBid) || base;
        const totalBids = parseInt(md.totalBids) || 0;
        const endsAt = Number(md.endTime) || 0;
        const ended = !!md.ended || (endsAt > 0 && now >= endsAt);
        out.auction = {
            currentBid: currentBid, totalBids: totalBids, endsAt: endsAt,
            endsIn: Math.max(0, endsAt - now), ended: ended,
            minNextBid: Math.round(currentBid * 1.05),
            winnerId: md.maxBidder || null, winnerName: md.maxBidderName || 'Bado hakuna',
            notified: !!md.endNotified
        };
    } else if (out.mode === 'group_buy') {
        const joined = parseInt(md.joinedUsers) || 1;
        const target = parseInt(md.targetPeople) || 10;
        const discVal = parseFloat(md.discountValue) || 0;
        const discType = md.discountType || 'amount';
        let price = base;
        const extra = Math.max(0, joined - 1);
        if (discType === 'percent') price = base - (base * Math.min(90, discVal * extra) / 100);
        else price = Math.max(base * 0.1, base - (discVal * extra));
        const endsAt = Number(md.endTime) || 0;
        const timedOut = endsAt > 0 && now >= endsAt;
        // [GROUP LIFECYCLE] hali halisi: successful (target imefikiwa) |
        // failed (muda umekwisha bila target) | active (inaendelea).
        const status = (joined >= target) ? 'successful' : (timedOut ? 'failed' : 'active');
        out.group = {
            joined: joined, target: target, price: Math.max(0, Math.round(price)),
            endsAt: endsAt, endsIn: Math.max(0, endsAt - now),
            status: status, participants: md.participants || [],
            notified: !!md.successNotified
        };
    } else if (out.mode === 'price_drop') {
        const start = Number(md.startTime) || now;
        const endsAt = Number(md.endTime) || now;
        const min = parseFloat(md.minPrice) || 0;
        const interval = Number(md.intervalMs) || 60000;
        const drop = parseFloat(md.dropAmount) || 0;
        const steps = Math.max(0, Math.floor((now - start) / interval));
        let cur = base - (steps * drop);
        if (cur < min) cur = min;
        out.drop = {
            currentPrice: Math.max(min, Math.round(cur)), minPrice: min,
            endsAt: endsAt, endsIn: Math.max(0, endsAt - now),
            ended: now >= endsAt, stepsDone: steps,
            lockedBy: md.lockedBy || null
        };
    } else if (out.mode === 'wholesale') {
        const discVal = parseFloat(md.discountValue) || 0;
        const discType = md.discountType || 'amount';
        const minQty = parseInt(md.minQty) || 1;
        // Tiers (modeData.tiers = [{minQty, price}] — price = bei ya KIPANDE)
        let tiers = Array.isArray(md.tiers) ? md.tiers.slice() : [];
        tiers = tiers
            .map(function (t) { return { minQty: parseInt(t.minQty) || 0, price: parseFloat(t.price) || 0 }; })
            .filter(function (t) { return t.minQty > 0 && t.price > 0; })
            .sort(function (a, b) { return a.minQty - b.minQty; });
        // Legacy single-rule (discount {percent|amount}) hutengenezwa kuwa tier ya minQty.
        if (!tiers.length && minQty > 0 && discVal > 0) {
            let tprice = base;
            if (discType === 'percent') tprice = base - (base * discVal / 100);
            else tprice = Math.max(0, base - discVal);
            tiers = [ { minQty: minQty, price: Math.round(tprice) } ];
        }
        // Tier ya msingi (qty 1..minQty-1) bei kamili — muonekano wa jedwali lazima
        // uonyeshe safu zote ili buyer ajue bei anayolipia kwa kila kiwango.
        let rows = [ { range: '1' + (tiers.length && tiers[0].minQty > 1 ? '–' + (tiers[0].minQty - 1) : ''), qty: 1, price: base } ];
        tiers.forEach(function (t, i) {
            const hi = (i + 1 < tiers.length) ? (tiers[i + 1].minQty - 1) : null;
            rows.push({ range: hi ? (t.minQty + '–' + hi) : (t.minQty + '+'), qty: t.minQty, price: t.price });
        });
        const lowest = tiers.length ? tiers[tiers.length - 1].price : base;
        out.wholesale = {
            rows: rows, tiers: tiers, minQty: minQty,
            lowest: lowest,
            applicable: function (qty) {
                const q = parseInt(qty) || 1;
                let pr = base;
                tiers.forEach(function (t) { if (q >= t.minQty) pr = t.price; });
                return pr;
            }
        };
        out.wholesale.applicableSrc = 'backend-tiers';
    }
    return out;
};

/* Arifa halisi za modes — chimbua kupitia injini iliyopo (28-buyer-engagement)
 * au addDoc ya moja kwa moja kwenye `notifications`. */
window.skhModesNotify = function (userId, title, body, type, meta) {
    if (!userId) return Promise.resolve();
    if (typeof window.skhEngageSendNotif === 'function') {
        return Promise.resolve(window.skhEngageSendNotif(userId, title, body, type, meta));
    }
    return skh.addDoc(skh.collection(skh.db, 'notifications'), Object.assign({
        userId: userId, title: title, body: body, createdAt: new Date().toISOString(), read: false, type: type || 'engagement'
    }, meta || {})).catch(function () {});
};

/* [§37 LIFECYCLE] Mabadiliko ya mipaka ya muda, IDEMPOTENT: inaandika status
 * + arifa MARA MOJA (flag `_ended` / `successNotified`). Huchomozwa wakati
 * wa kufungua ukurasa wa bidhaa (listener iko tayari) na baada ya actions. */
window.skhModesLifecycle = async function (p) {
    if (!p || !p.id || !p.collectionName) return;
    const c = window.skhModesCompute(p);
    const prodRef = skh.doc(skh.db, p.collectionName, p.id);
    try {
        if (c.mode === 'auction' && c.auction.ended) {
            // [IDEMPOTENCY GAP] Snapshot p inaweza kuwa stale (tab mbili zikifunga
            // lifecycle mpapayo) → flags zingiandikwa mara mbili na ARIFA
            // zikirudia. RE-READ halisi kabla ya kuamua kama taarifa zimishapeleke.
            const p2snap = await skh.getDoc(prodRef);
            const p2md = (p2snap && p2snap.exists() && p2snap.data() && p2snap.data().modeData) || {};
            const alreadyEnded = !!p2md.ended;
            const alreadyNotified = !!p2md.endNotified;
            if (alreadyEnded && alreadyNotified) return;   // kila kitu kimemalizika
            c.modeData = p2md;   // tumia up-to-date state kwa hatua zifuatazo
        }
        if (c.mode === 'auction' && c.auction.ended && !c.modeData.ended) {
            // Auction imekwisha → watu wa mwisho (winner) + arifa.
            const patch = {
                'modeData.ended': true,
                'modeData.endedAt': new Date().toISOString()
            };
            if (c.auction.winnerId) patch['modeData.winnerId'] = c.auction.winnerId;
            await skh.updateDoc(prodRef, patch);
            if (!c.modeData.endNotified && c.auction.winnerId) {
                await skh.updateDoc(prodRef, { 'modeData.endNotified': true });
                const t = p.title || 'bidhaa';
                window.skhModesNotify(c.auction.winnerId, ' Umeshinda Mnada!',
                    'Umeshinda mnada wa ' + t + ' kwa TSh ' + Number(c.auction.currentBid).toLocaleString() + '. Lipia sasa ili kumaliza oda yako.', 'auction_won',
                    { productId: p.id, commerceMode: 'AUCTION' });
                if (p.userId && p.userId !== c.auction.winnerId) {
                    window.skhModesNotify(p.userId, 'Mnada wako umekamilika',
                        'Mnada wa ' + t + ' umefungwa. Mshindi ni ' + c.auction.winnerName + ' kwa TSh ' + Number(c.auction.currentBid).toLocaleString() + '.', 'auction_ended',
                        { productId: p.id, commerceMode: 'AUCTION' });
                }
            }
        } else if (c.mode === 'group_buy' && c.group.status === 'successful' && !c.modeData.successNotified) {
            await skh.updateDoc(prodRef, { 'modeData.successNotified': true, 'modeData.status': 'successful' });
            const t = p.title || 'bidhaa';
            const msg = 'Group Buy ya ' + t + ' imefikia lengo (' + c.group.joined + '/' + c.group.target + '). Bei ya makubaliano ni TSh ' + Number(c.group.price).toLocaleString() + ' huenda ikafanyizika — lipia oda yako sasa.';
            (c.group.participants || []).forEach(function (uid) {
                window.skhModesNotify(uid, ' Group Buy imefanikiwa!', msg, 'group_success', { productId: p.id, commerceMode: 'GROUP_BUY' });
            });
            if (p.userId) {
                window.skhModesNotify(p.userId, 'Group Buy imefiki lengo', 'Kundi la ' + t + ' limefika ' + c.group.joined + '/' + c.group.target + '.', 'group_success', { productId: p.id, commerceMode: 'GROUP_BUY' });
            }
        }
    } catch (e) { console.warn('[MODES] lifecycle: ' + (e && e.message)); }
};

/* [§10 R2+AUCTION CORE] Weka zabuni — RE-READ kabla ya kukubali.
 * Hakuna blind overwrite: ikiwa mtaji mwingine amekwisha weka dau kubwa kati
 * ya kusoma+kuiandika, dau la chini haliikubaliwi (analytics kwa hisani ya
 * Firestore SDK; atomic hike iko kwenye increment ya totalBids + bid docs
 * zinavyoandikwa kama makazi asilia — hakuna kipi cha speculative copy). */
window.skhAuctionPlaceBid = async function (productId, bidValue) {
    if (!skh.requireAuth()) return { ok: false, error: 'login' };
    const bid = parseFloat(bidValue);
    if (!isFinite(bid) || bid <= 0) return { ok: false, error: 'ingiza_kiasi' };

    const col = (skh.currentOpenProduct && skh.currentOpenProduct.collectionName) || 'products';
    const prodRef = skh.doc(skh.db, col, productId);

    // RE-READ: daima ona hali halisi ya Firestore kabla ya kukubali.
    const snap = await skh.getDoc(prodRef);
    if (!snap || !snap.exists || !snap.exists()) return { ok: false, error: 'bidhaa_haipo' };
    const p = Object.assign({ id: productId, collectionName: col }, snap.data());
    const c = window.skhModesCompute(p);
    if (c.mode !== 'auction') return { ok: false, error: 'si_mnada' };
    if (c.auction.ended) return { ok: false, error: 'mnada_umefungwa' };
    if (skh.currentUser && p.userId === skh.currentUser.uid) return { ok: false, error: 'tangazo_lako' };
    if (skh.sysConfig && skh.sysConfig.modes && skh.sysConfig.modes.auction === false) {
        return { ok: false, error: 'imezimwa_admin' };
    }

    const minRequired = c.auction.minNextBid; // =1.05 × dau la juu (policy iliyopo)
    if (bid < minRequired) return { ok: false, error: 'chini_ya_' + minRequired, minRequired: minRequired };

    const prevLeader = c.auction.winnerId;
    const prevBid = c.auction.currentBid;
    const myName = (skh.currentUser && skh.currentUser.displayName)
        || (skh.currentUser && skh.currentUser.email ? skh.currentUser.email.split('@')[0] : 'Mteja');

    try {
        if (typeof skh.runTransaction === 'function') {
            await skh.runTransaction(skh.db, async function (tx) {
                const fresh = await tx.get(prodRef);
                if (!fresh.exists()) throw new Error('bidhaa_haipo');
                const fp = fresh.data() || {};
                const fmd = fp.modeData || {};
                const fBid = parseFloat(fmd.currentBid) || (parseFloat(fp.price) || 0);
                if (Number(fmd.endTime) > 0 && Date.now() >= Number(fmd.endTime)) throw new Error('mnada_umefungwa');
                if (fmd.ended) throw new Error('mnada_umefungwa');
                if (bid < Math.round(fBid * 1.05)) throw new Error('waliokuzidi');
                tx.set(prodRef, { modeData: Object.assign({}, fmd, {
                    currentBid: bid, maxBidder: skh.currentUser.uid, maxBidderName: myName,
                    totalBids: (parseInt(fmd.totalBids) || 0) + 1
                }) }, { merge: true });
            });
        } else {
            await skh.updateDoc(prodRef, {
                'modeData.currentBid': bid, 'modeData.maxBidder': skh.currentUser.uid,
                'modeData.maxBidderName': myName, 'modeData.totalBids': skh.increment(1)
            });
        }

        // [§33] ARIFA HALISI: outbid + seller alert (wote — kama != mimi)
        const t = p.title || 'bidhaa';
        if (prevLeader && prevLeader !== skh.currentUser.uid) {
            window.skhModesNotify(prevLeader, ' Umezidiwa Dau',
                'Mteja mwingine ameweka TSh ' + Number(bid).toLocaleString() + ' kwenye mnada wa ' + t + ' (dau lako lilikuwa TSh ' + Number(prevBid).toLocaleString() + ').', 'auction_outbid',
                { productId: productId, commerceMode: 'AUCTION' });
        }
        if (p.userId && p.userId !== skh.currentUser.uid) {
            window.skhModesNotify(p.userId, 'Dau jipya kwenye mnada wako',
                myName + ' ameweka TSh ' + Number(bid).toLocaleString() + ' (zabuni: ' + (c.auction.totalBids + 1) + ').', 'auction_bid',
                { productId: productId, commerceMode: 'AUCTION' });
        }
        // Reje[§8] Hesabu halisi za historia — andika na bid doc (Firestore).
        try {
            await skh.addDoc(skh.collection(skh.db, col, productId, 'bids'), {
                uid: skh.currentUser.uid, name: myName, amount: bid,
                prevBid: prevBid || null, createdAt: new Date().toISOString()
            });
        } catch (e2) { /* historia ya ziada — bid kuu imeshahifadhiwa */ }
        return { ok: true, bid: bid, totalBids: c.auction.totalBids + 1 };
    } catch (e) {
        var code = (e && e.message) || 'error';
        return { ok: false, error: code };
    }
};

window.placeBid = async function() {
    if(!skh.requireAuth()) return;
    const bidInput = document.getElementById('userBidInput');
    const bidValue = parseFloat(bidInput.value);
    const minBidRequired = Math.round((skh.currentOpenProduct.modeData.currentBid || skh.currentOpenProduct.price) * 1.05);

    if(!bidValue || bidValue < minBidRequired) {
        alert(T('pr_bid_min', 'Your bid must be at least TSh {n}.', { n: minBidRequired.toLocaleString() }));
        return;
    }

    if(await skhConfirm(T('pr_bid_confirm', 'Confirm placing a bid of TSh {n}? If you win, you will have to pay.', { n: bidValue.toLocaleString() }))) {
        try {
            // [DEPOSIT GATE] Sera iliyopo: dau la serious actions (mnada/group/
            // price_drop) linahitaji deposit ya TSh 1,300 kama Admin ameyawasha
            // malipo — iwe imelipiwa mwanzoni, ikwarenjee mojamoja kama kawaida.
            if (typeof window.verifyAndProceedSeriousAction === 'function') {
                let proceedCore = false, errored = null, doneRes = null;
                await window.verifyAndProceedSeriousAction("Auction", "auction", skh.currentOpenProduct.id, async () => {
                    doneRes = await window.skhAuctionPlaceBid(skh.currentOpenProduct.id, bidValue);
                    proceedCore = true;
                });
                if (!proceedCore) return; // deposit ilianzishwa/imekataliwa — rudi baadaye
                var r = doneRes;
            } else {
                var r = await window.skhAuctionPlaceBid(skh.currentOpenProduct.id, bidValue);
            }
            if (!r.ok) {
                if (/^waliokuzidi/.test(r.error)) alert('Mteja mwingine amekuzidi — onyesha dau kubwa zaidi (rejareja ukurasa kwanza).');
                else if (/^mnada_umefungwa/.test(r.error)) alert(' Mnada huu umefungwa tayari. Haunaweza kuweka dau tena.');
                else if (/^bidhaa_haipo/.test(r.error)) alert('Bidhaa haipo tena.');
                else if (/^imezimwa_admin/.test(r.error)) alert('Mnada umezimwa kwa muda na Admin.');
                else alert(T('pr_error', 'Error') + ': ' + r.error);
                if (bidInput) bidInput.value = '';
                return;
            }
            alert(T('pr_bid_placed', 'Congratulations! Your bid is placed. You are now leading the auction!'));
            bidInput.value = '';
            // Refresh ya panel pia (listener inachoma pia, lakini haraka).
            try {
                const area = (typeof $ === 'function' ? $('pmSpecialModeArea') : document.getElementById('pmSpecialModeArea'));
                if (area) window.renderSpecialModesUI('auction', area);
            } catch (e2) {}
        } catch(e) {
            alert(T('pr_error', 'Error') + ": " + e.message);
        }
    }
}

window.handleLike = async function() {
        // [BUYER ENGAGEMENT] Tumia mfumo mpya (relationship docs + optimistic UI)
        if (typeof window.skhModalLike === 'function') { window.skhModalLike(); return; }
        if(!skh.requireAuth() || !skh.currentOpenProduct) return;
        const colName = skh.currentOpenProduct.collectionName || skh.currentFeedCollection;
        const ref = skh.doc(skh.db, colName, skh.currentOpenProduct.id);
        const hasLiked = skh.currentOpenProduct.likes && skh.currentOpenProduct.likes.includes(skh.currentUser.uid);
        try { 
            if(hasLiked) { 
                await skh.updateDoc(ref, { likes: skh.arrayRemove(skh.currentUser.uid) }); 
            } else { 
                await skh.updateDoc(ref, { likes: skh.arrayUnion(skh.currentUser.uid) }); 
            } 
        } catch(e) {}
    };

window.submitComment = async function() {
        if(!skh.requireAuth() || !skh.currentOpenProduct) return;
        const input = document.getElementById('pmCommentInput'); 
        if(!input) return;
        
        const text = input.value.trim(); 
        if(!text) return;
        
        input.value = T('pr_sending', 'Sending...');
        input.disabled = true;
        let published = null;
        try {
            // [COMMENTS 2026-09] Maoni ya umma yanaenda kwenye collection ya
            // `comments` kupitia server (verifiedPurchase/author ni SERVER-ONLY).
            const fn = (typeof skh.wrapCallable === "function" ? skh.wrapCallable("commentsPublish") : skh.httpsCallable(skh.getFunctions(skh.fApp, "europe-west1"), "commentsPublish"));
            try {
                const res = await fn({
                    targetType: 'product',
                    targetId: skh.currentOpenProduct.id,
                    text: text,
                    authorName: skh.currentUser.displayName || (skh.currentUser.email ? skh.currentUser.email.split('@')[0] : 'Mteja'),
                    authorPhoto: (skh.currentUserData && skh.currentUserData.photoURL) || skh.currentUser.photoURL || ''
                });
                if (res && res.data && res.data.ok) published = true;
            } catch (e) {
                const code = String((e && e.code) || '');
                // Server haipatikani (haijatumwa) -> fallback ya client (bila badge).
                if (code && code !== 'functions/not-found' && code !== 'unavailable' && code !== 'internal' && !/not-found/.test(code)) throw e;
            }
            // Fallback: andika moja kwa moja (rules zinaruhusu maoni ya mwandishi).
            if (!published) {
                await skh.addDoc(skh.collection(skh.db, 'comments'), {
                    targetType: 'product',
                    targetId: skh.currentOpenProduct.id,
                    authorId: skh.currentUser.uid,
                    authorName: skh.currentUser.displayName || (skh.currentUser.email ? skh.currentUser.email.split('@')[0] : 'Mteja'),
                    authorPhoto: (skh.currentUserData && skh.currentUserData.photoURL) || skh.currentUser.photoURL || '',
                    parentId: null, rootId: null,
                    text: text, media: [], productRef: null,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null
                });
            }
            input.value = ""; 
            // [COMMENT FIX 2026-09] Arifu muuzaji kwamba mteja ameuliza swali au
            // ameacha maoni — kwa kutumia mfumo ULIOPO wa notifications
            // (skhEngageSendNotif / collection `notifications`). Hakuna mfumo mpya.
            try {
                const sellerId = skh.currentOpenProduct.userId || skh.currentOpenProduct.sellerId || null;
                if (sellerId && sellerId !== skh.currentUser.uid) {
                    const body = text.length > 140 ? text.slice(0, 140) + '…' : text;
                    const ntitle = T('pr_comment_notif_title', 'Swali jipya kwenye bidhaa yako');
                    const nmeta = { targetId: skh.currentOpenProduct.id, productTitle: skh.currentOpenProduct.title || '' };
                    if (typeof window.skhEngageSendNotif === 'function') {
                        window.skhEngageSendNotif(sellerId, ntitle, body, 'new_comment', nmeta);
                    } else {
                        skh.addDoc(skh.collection(skh.db, 'notifications'), Object.assign({
                            userId: sellerId, title: ntitle, body: body,
                            createdAt: new Date().toISOString(), read: false, type: 'new_comment'
                        }, nmeta)).catch(() => {});
                    }
                }
            } catch (e) { /* arifa si ya kusitisha utumaji wa maoni */ }
            if (typeof window.skhCommentsOpen === 'function') window.skhCommentsOpen(skh.currentOpenProduct);
        } catch(e) { 
            alert(T('pr_comment_fail', 'Failed to send comment.')); 
            input.value = text; 
        } finally { 
            input.disabled = false; 
            input.focus(); 
        }
    };

window.handleShare = async function() {
        if(!skh.currentOpenProduct) return;
        try { 
            // Tengeneza link halisi ya bidhaa (Inasoma website yako automatically)
            const itemUrl = `${window.location.origin}${window.location.pathname}?item=${skh.currentOpenProduct.id}`;
            const shareText = T('pr_share_text', 'Check this out: {title} on SokoHai Pro! Tap here to view: {url}', { title: skh.currentOpenProduct.title || skh.currentOpenProduct.company, url: itemUrl });
            
            await navigator.clipboard.writeText(shareText); 
            alert(T('pr_link_copied', 'Link copied! You can paste it on WhatsApp, Facebook or anywhere.')); 
            
            const colName = skh.currentOpenProduct.collectionName || skh.currentFeedCollection; 
            await skh.updateDoc(skh.doc(skh.db, colName, skh.currentOpenProduct.id), { shares: skh.increment(1) }); 
            
            // Ongeza namba ya shares live kwenye kioo
            const psc = document.getElementById('pmSharesCount');
            if(psc) psc.innerText = parseInt(psc.innerText) + 1;
        } catch (err) {
            alert(T('pr_link_copy_fail', 'Failed to copy link.'));
        }
    };

window.toggleFollow = async function() {
        // [BUYER ENGAGEMENT] Tumia mfumo mpya wa follow (relationship docs)
        if (typeof window.skhModalFollow === 'function') { window.skhModalFollow(); return; }
        if(!skh.requireAuth() || !skh.currentOpenProduct) return; 
        const targetUid = skh.currentOpenProduct.userId; 
        if(targetUid === skh.currentUser.uid) return;
        
        try {
            const qTarget = skh.query(skh.collection(skh.db, "users"), skh.where("uid", "==", targetUid)); 
            const snapTarget = await skh.getDocs(qTarget);
            if(snapTarget.empty) return; 
            
            const targetDocRef = skh.doc(skh.db, "users", snapTarget.docs[0].id); 
            const myDocRef = skh.doc(skh.db, "users", skh.currentUserData.docId);
            const isFollowing = skh.currentUserData.following && skh.currentUserData.following.includes(targetUid);
            
            const btnF = document.getElementById('btnFollow'); 
            if(btnF) btnF.innerText = "..."; 
            
            if(isFollowing) { 
                await skh.updateDoc(myDocRef, { following: skh.arrayRemove(targetUid) }); 
                await skh.updateDoc(targetDocRef, { followers: skh.arrayRemove(skh.currentUser.uid) }); 
            } else { 
                await skh.updateDoc(myDocRef, { following: skh.arrayUnion(targetUid) }); 
                await skh.updateDoc(targetDocRef, { followers: skh.arrayUnion(skh.currentUser.uid) }); 
            }
        } catch(e) {}
    };

window.addToCart = async function(isBuyNow = false) {
    if(!skh.requireAuth()) return;
    
    if(!skh.currentOpenProduct) {
        alert(T('pr_error', 'Error') + ': ' + T('pr_wait_product', 'Please wait for the product to load or reopen it.'));
        return;
    }
    
    // Ulinzi wa Optional Chaining
    const chosenColor = skh.currentOpenProduct?.selectedVariants?.color || "N/A";
    const chosenSize = skh.currentOpenProduct?.selectedVariants?.size || "N/A";
    const qty = parseInt(document.getElementById('pmQty')?.value) || 1;

    if(isBuyNow) {
        // [DELIVERY OPTION 2026-09] Lipa Sasa = weka kwenyi cart/oda HALAFU
        // checkout/SokoPay. Usafirishaji ni HATUA YA HIARI inayofuata malipo
        // (sio kulazimisha transport).
        skh.smartCartItems && skh.smartCartItems();
        let liveProduct = { ...skh.currentOpenProduct };
        // Rudisha bei/tangazo la hivi karibuni kabla ya kuingiza cart.
        try {
            const snap = await skh.getDoc(skh.doc(skh.db, 'products', skh.currentOpenProduct.id));
            if (snap && snap.exists) liveProduct = { ...liveProduct, ...snap.data(), id: skh.currentOpenProduct.id };
        } catch (e) { /* tumia cached */ }
        const cartMeta = skh.orchProductMeta ? skh.orchProductMeta(liveProduct) : null;
        const buyItem = {
            ...liveProduct, qty, chosenColor, chosenSize,
            sellerId: liveProduct.userId || liveProduct.sellerId,
            sellerName: liveProduct.sellerName || liveProduct.ownerName || 'Seller',
            cartMeta, escrowEligible: true, orchestrationReady: true,
            addedAt: new Date().toISOString()
        };
        skh.myCart = (skh.smartCartItems ? skh.smartCartItems() : (skh.myCart || []));
        skh.myCart.push(buyItem);
        skh.smartCartSave ? skh.smartCartSave() : skh.updateCartUI && skh.updateCartUI();
        const badge = document.getElementById('cartBadge');
        if (badge) { badge.style.display = 'flex'; badge.innerText = skh.myCart.length; }
        // Chaguo la delivery litaulizwa baada ya malipo (payment-first).
        if (typeof window.skhBuyNowProceed === 'function') {
            window.skhBuyNowProceed();
            return;
        }
        // Njia ya zamani kabisa: fungua cart.
        if (typeof window.openCart === 'function') { window.openCart(); return; }
    } else {
        // Kuweka kwenye Cart — kwanza hakikisha myCart imesomwa upya (si stale)
        if (typeof skh.smartCartItems === 'function') skh.smartCartItems();

        // [PHASE 7 FIX] Kama ni wholesale mode, pata bei ya tier inayolingana na idadi
        let effectivePrice = parseFloat(skh.currentOpenProduct.price) || 0;
        if (skh.currentOpenProduct.saleMode === 'wholesale' && window.skhModesCompute) {
            const C = window.skhModesCompute(skh.currentOpenProduct);
            if (C && C.wholesale && typeof C.wholesale.applicable === 'function') {
                effectivePrice = C.wholesale.applicable(qty);
            }
        }

        let cartItem = {...skh.currentOpenProduct, price: effectivePrice, chosenColor, chosenSize, qty};
        if (!Array.isArray(skh.myCart)) skh.myCart = [];
        skh.myCart.push(cartItem);
        if (typeof skh.smartCartSave === 'function') skh.smartCartSave(); // Hifadhi local + cloud mara moja
        if (typeof skh.updateCartUI === 'function') skh.updateCartUI();
        alert(T('pr_added_cart', 'Product added to cart (qty: {qty})!', { qty: qty }));
    }
};

window.proceedToDeliverySelection = function() {
    closeModals();
    const product = JSON.parse(sessionStorage.getItem('pending_order_product'));
    
    // TUNAWEKA DATA MUHIMU: Mkoa unatoka wapi (Location ya Bidhaa)
    sessionStorage.setItem('chain_from', product.location || T('pr_shop', 'Shop'));
    sessionStorage.setItem('chain_cargo_name', product.title);
    sessionStorage.setItem('flow_step', 'awaiting_payment'); // Alama ya mnyororo

    alert(T('pr_held', 'Product held! Now choose a vehicle to deliver') + ' ' + product.title);
    
    // Mpeleke kwenye Tab ya Usafiri
    const deliveryTab = document.getElementById('navTabDelivery'); 
    updateApp('delivery', deliveryTab); 
};

window.openCart = function() {
        if(!skh.requireAuth()) return;
        const list = document.getElementById('cartItemsList');
        if(!list) return;
        
        let html = '';
        let total = 0;
        
        if(!skh.myCart || skh.myCart.length === 0) {
            html = '<p style="text-align:center; color:#64748b; margin-top:20px;">Kikapu chako kipo wazi.</p>';
        } else {
            skh.myCart.forEach((item, index) => {
                // [PHASE 7 FIX] Hesabu ya jumla lazima izidishe idadi (qty)
                const qty = Math.max(1, parseInt(item.qty, 10) || 1);
                const itemPrice = parseFloat(item.price || 0);
                const subtotal = itemPrice * qty;
                total += subtotal;

                // Beji ya ofa iliyojadiliwa
                const negoBadge = item.fromOffer ? '<span style="background:#e0f2fe;color:#0369a1;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;margin-left:6px;">Makubaliano</span>' : '';
                const variantInfo = (item.chosenColor && item.chosenColor !== 'N/A' || item.chosenSize && item.chosenSize !== 'N/A')
                    ? `<span style="font-size:11px;color:#64748b;display:block;">${item.chosenColor !== 'N/A' ? item.chosenColor : ''} ${item.chosenSize !== 'N/A' ? item.chosenSize : ''}</span>` : '';

                html += `
                    <div class="list-item" style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid #f1f5f9;">
                        <img src="${skh.getOptimizedImageUrl(item.image || 'https://via.placeholder.com/150')}" alt="item" style="width:48px;height:48px;border-radius:8px;object-fit:cover;background:#f8fafc;">
                        <div class="list-info" style="flex:1;min-width:0;">
                            <b style="font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${skh.skhEscape(item.title || 'Bidhaa')}</b>
                            ${variantInfo}
                            <span style="font-size:12px;color:#18A982;font-weight:700;">TSh ${itemPrice.toLocaleString()} × ${qty} = TSh ${subtotal.toLocaleString()}</span>${negoBadge}
                        </div>
                        <button onclick="removeFromCart(${index})" style="background:#fee2e2; color:#ef4444; border:none; padding:6px 10px; border-radius:8px; font-weight:bold; cursor:pointer;" aria-label="Ondoa">✕</button>
                    </div>`;
            });
        }
        
        list.innerHTML = html;
        const ct = document.getElementById('cartTotal');
        if(ct) ct.innerText = `TSh ${total.toLocaleString()}`; 
        
        closeModals();
        const cm = document.getElementById('cartModal');
        if(cm) cm.style.display = 'flex';
    };

window.removeFromCart = async function(index) { 
        skh.myCart.splice(index, 1); 
        skh.localStorage.setItem('sokohai_cart', JSON.stringify(skh.myCart));
        skh.updateCartUI(); 
        openCart(); 
        
        // Update database
        if(skh.currentUserData && skh.currentUserData.docId) {
            try {
                await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUserData.docId), { cart: skh.myCart });
            } catch(e) {}
        }
    };

// ============================================================
// [CHAT + DP + PUBLIC LINKS] wasaidizi wa chat, DP na URL za umma
// ============================================================

// Weka (au futa) URL ya bidhaa kwenye address bar bila ku-reload ukurasa.
window.skhSetProductUrl = function(id) {
    try {
        if (id) {
            history.replaceState(null, '', '#/product/' + encodeURIComponent(id));
        } else if (/^#\/?product\//.test(window.location.hash || '')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    } catch (e) { /* hash pekee — si muhimu */ }
};

// Kiungo cha umma cha bidhaa (clean URL /p/{id}) — kwa kushiriki + SEO.
window.skhProductPublicUrl = function(id) {
    const base = (window.location.origin || '') + (window.location.pathname || '/');
    return base.replace(/\/+$/, '') + '/p/' + encodeURIComponent(id || '');
};

// [SEO] Sasisha <title> + meta tags za bidhaa kwa Google na viungo vya umma.
window.skhUpdateSeoMeta = function(p) {
    try {
        const _pT = (window.skhLocField ? window.skhLocField(p, 'title') : null) || (p && (p.title || p.itemTitle)) || (window.skhTF ? window.skhTF('card_product_def','Bidhaa') : 'Bidhaa');
        const t = p ? (_pT + ' — SokoHai') : (window.skhTF ? window.skhTF('meta_home_title', 'SokoHai — Soko la Mtandaoni la Tanzania') : 'SokoHai — Soko la Mtandaoni la Tanzania');
        document.title = t;
        const desc = p
            ? (_pT + (p.price ? (window.skhTF?window.skhTF('meta_for_tsh',' kwa TSh '):' kwa TSh ') + Number(p.price).toLocaleString() : '') + (window.skhTF?window.skhTF('meta_on_skh',' kwenye SokoHai. Nunua kwa usalama kupitia escrow.'):' kwenye SokoHai. Nunua kwa usalama kupitia escrow.'))
            : 'Nunua na uuze bidhaa, huduma na usafiri kwa usalama kupitia SokoHai.';
        const set = function(id, attr, val) { const el = document.getElementById(id); if (el) el.setAttribute(attr, val || ''); };
        set('skhMetaDescription', 'content', desc);
        set('skhOgTitle', 'content', t);
        set('skhOgDescription', 'content', desc);
        set('skhOgImage', 'content', p ? (p.image || (p.images && p.images[0]) || p.photo || '') : '');
        const url = p ? window.skhProductPublicUrl(p.id) : (window.location.origin + window.location.pathname);
        set('skhOgUrl', 'content', url);
        set('skhCanonical', 'href', url);
    } catch (e) { /* meta ni ya ziada tu */ }
};

// Nakili kiungo cha umma cha bidhaa (kitufe cha share kwenye modal).
window.skhShareProduct = function() {
    const p = skh.currentOpenProduct;
    if (!p || !p.id) return;
    const link = window.skhProductPublicUrl(p.id);
    const done = function() {
        if (typeof window.sokohaiToast === 'function') {
            window.sokohaiToast('Kiungo kimenakiliwa: ' + link, 'success');
        } else {
            alert('Kiungo kimenakiliwa: ' + link);
        }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function() { window.prompt('Nakili kiungo:', link); });
    } else {
        try {
            const ta = document.createElement('textarea');
            ta.value = link;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
        } catch (e) { window.prompt('Nakili kiungo:', link); }
    }
};

// DP ya mwenzako kwenye kichwa cha chat (picha halisi ikiwepo).
window.skhSetChatHeaderAvatar = function(uid, photo, name) {
    const el = document.getElementById('chatHeaderAvatar');
    if (!el) return;
    if (typeof window.skhUserAvatar !== 'function') return;
    el.innerHTML = window.skhUserAvatar(photo || null, name || 'Mawasiliano', 42);
    if (uid && !photo) {
        try {
            skh.getDoc(skh.doc(skh.db, "users", uid)).then((us) => {
                if (us && us.exists && us.exists()) {
                    const ud = us.data();
                    const pu = ud.photoURL || ud.profileImage || ud.logo || '';
                    if (pu && !/ui-avatars\.com/.test(String(pu))) {
                        el.innerHTML = window.skhUserAvatar(pu, name || ud.fullName || ud.displayName, 42);
                    }
                }
            }).catch(() => {});
        } catch (e) { /* tumia tile ya herufi */ }
    }
};

// Strip ya bidhaa / huduma / usafiri iliyoambatishwa kwenye chat (juu ya composer).
window.skhRenderAttachedProduct = function() {
    const wrap = document.getElementById('chatAttachedProduct');
    if (!wrap) return;
    const p = skh.activeChatProduct || skh.activeChatService || skh.activeChatTransport;
    var partner = (skh.chatCore && skh.chatCore.partnerUid) || skh.currentChatUid || null;
    var myId = (skh.currentUser && skh.currentUser.uid) || null;
    var owner = p ? (p.userId || p.providerId || p.driverId || p.sellerId || null) : null;
    if (!p || !p.id || (partner && owner && owner !== partner && owner !== myId)) {
        wrap.style.display = 'none'; wrap.innerHTML = ''; return;
    }
    const img = p.image || (p.images && p.images[0]) || p.photo || (window.SKH_PLACEHOLDER_IMG || '');
    var defTitle = skh.activeChatService ? 'Huduma' : (skh.activeChatTransport ? 'Usafiri' : (window.skhTF?window.skhTF('card_product_def','Bidhaa'):'Bidhaa'));
    var attachLabel = skh.activeChatService ? 'Huduma imeambatishwa' : (skh.activeChatTransport ? 'Usafiri umeambatishwa' : (window.skhTF?window.skhTF('attach_product','Bidhaa imeambatishwa'):'Bidhaa imeambatishwa'));
    const title = (window.skhLocField ? window.skhLocField(p, 'title') : null) || p.title || p.itemTitle || p.cargoName || defTitle;
    wrap.style.display = 'block';
    wrap.innerHTML = '<div class="chat-attached">'
        + (img ? '<img src="' + skh.skhEscape(skh.getOptimizedImageUrl(img)) + '" alt="" style="width:38px;height:38px;border-radius:8px;object-fit:cover;background:#f1f5f9;flex-shrink:0;" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||\'\';">' : '')
        + '<div style="min-width:0;flex:1;"><b style="font-size:12px;color:#0f172a;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + skh.skhEscape(title) + '</b>'
        + '<small style="font-size:12.5px;color:#b45309;font-weight:700;">' + attachLabel + '</small></div>'
        + '<button class="ca-remove" onclick="window.skhClearAttachedProduct()" title="' + (window.skhTF?window.skhTF('attach_remove','Ondoa'):'Ondoa') + '">&times;</button>'
        + '</div>';
};

window.skhClearAttachedProduct = function() {
    skh.activeChatProduct = null;
    skh.activeChatService = null;
    skh.activeChatTransport = null;
    window.skhRenderAttachedProduct();
};

// Fungua bidhaa kutoka kadi ya chat — muuzaji (mmiliki) aione kwenye duka lake.
window.skhOpenChatProduct = function(pid, collection, sellerUid) {
    if (!pid) return;
    if (sellerUid && skh.currentUser && sellerUid === skh.currentUser.uid) {
        if (typeof window.openSellerProfile === 'function') {
            window.closeModals();
            window.openSellerProfile(sellerUid);
            return;
        }
    }
    if (typeof window.openProduct === 'function') window.openProduct(pid, collection || null);
};

// DP ya muuzaji kwenye kadi yake kwenye modal ya bidhaa.
window.skhFetchSellerAvatar = function(uid, photo, name) {
    const el = document.getElementById('pmSellerAvatar');
    if (!el) return;
    if (typeof window.skhUserAvatar !== 'function') return;
    el.innerHTML = window.skhUserAvatar(photo || null, name || 'Muuzaji', 38);
    if (uid && !photo) {
        try {
            skh.getDoc(skh.doc(skh.db, "users", uid)).then((us) => {
                if (us && us.exists && us.exists()) {
                    const ud = us.data();
                    const pu = ud.photoURL || ud.profileImage || ud.logo || '';
                    if (pu && !/ui-avatars\.com/.test(String(pu))) {
                        el.innerHTML = window.skhUserAvatar(pu, name || ud.fullName || ud.displayName, 38);
                    }
                }
            }).catch(() => {});
        } catch (e) { /* tumia tile ya herufi */ }
    }
};

// Tatua deep-link ya bidhaa (#/product/{id} au /p/{id}) kwenye kufungua ukurasa.
window.skhResolveProductDeepLink = function() {
    try {
        let pid = null;
        const h = window.location.hash || '';
        const hm = h.match(/^#\/?product\/([A-Za-z0-9_-]+)/);
        if (hm) pid = hm[1];
        if (!pid) {
            const pm = (window.location.pathname || '').match(/^\/p\/([A-Za-z0-9_-]+)\/?$/);
            if (pm) pid = pm[1];
        }
        if (!pid) return;
        // [FIX 2026-09-20] Timer ya 1400ms (chini) iliona URL /p/{id} iliyowekwa na kadi ambayo mtumiaji
        // ALIKWISHA kuifungua na kuifungua TENA — kadi ilirudi kwenye "Inapakia" na vitufe vilipotea kwa
        // muda. Usifungue kadi ile ile ambayo tayari iko wazi.
        try {
            const _pm = document.getElementById('productModal');
            if (_pm && _pm.style.display === 'flex' && skh.currentOpenProduct && String(skh.currentOpenProduct.id) === String(pid)) return;
        } catch (e) { /* endelea na ufunguzi wa kawaida */ }
        if (typeof window.openProduct === 'function') window.openProduct(pid);
    } catch (e) { /* si kiungo cha bidhaa */ }
};

window.startChat = function() {
    if(!skh.requireAuth() || !skh.currentOpenProduct) return;
    const p = skh.currentOpenProduct || {};
    const myId = (skh.currentUser && skh.currentUser.uid) || null;

    // [REKEBISHO KUU] Pata UID ya muuzaji kutoka field yoyote iliyotumika kwenye tangazo
    const sellerUid = p.sellerId || p.userId || p.sellerUid || p.ownerUid || p.ownerId || p.providerId || p.driverId || null;

    if(!sellerUid || sellerUid === 'undefined' || sellerUid === 'null') {
        alert("Hitilafu: Taarifa za mawasiliano ya muuzaji hazijapatikana kwenye tangazo hili.");
        return;
    }

    if(sellerUid === myId) {
        alert(T('pr_chat_self', 'Huwezi kujitumia meseji kwenye tangazo lako mwenyewe.'));
        return;
    }

    // Pata jina halisi la muuzaji au duka badala ya kubaki neno "Muuzaji"
    const sellerName = p.sellerName || p.ownerName || p.storeName || p.shopName || p.businessName || p.fullName || p.displayName || p.company || 'Mawasiliano';
    const sellerEmail = p.sellerEmail || p.userEmail || p.email || '';

    skh.currentChatUid = sellerUid;
    skh.currentChatEmail = sellerEmail;
    skh.chatPartner = sellerName;

    // Weka muktadha wa aina ya bidhaa/huduma
    var col = String(p.collectionName || p.itemCollection || 'products');
    skh.activeChatProduct = null;
    skh.activeChatService = null;
    skh.activeChatTransport = null;
    var greetRef = 'tangazo hili';

    if (col === 'services') {
        skh.activeChatService = Object.assign({}, p, { collectionName: 'services', sellerId: sellerUid, sellerName: sellerName });
        greetRef = 'huduma yenu';
    } else if (col === 'drivers' || col === 'ride_requests') {
        skh.activeChatTransport = Object.assign({}, p, { collectionName: col, sellerId: sellerUid, sellerName: sellerName });
        greetRef = 'tangazo lenu la usafiri';
    } else {
        skh.activeChatProduct = Object.assign({}, p, { collectionName: 'products', sellerId: sellerUid, sellerName: sellerName });
        greetRef = 'bidhaa hii';
    }

    var input = document.getElementById('chatInput');
    if(input) input.value = "Habari, nimevutiwa na " + greetRef + ": " + (p.title || '');

    // Fungua moja kwa moja kupitia mfumo mpya wa skhChatOpen
    if (typeof window.skhChatOpen === 'function') {
        return window.skhChatOpen(sellerUid, sellerName, {
            ctx: 'p_' + p.id,
            type: 'direct',
            email: sellerEmail
        });
    }
};

window.openChatWithUser = function(uid, displayName) {
    if(!skh.requireAuth()) return;
    if(!uid || uid === 'undefined' || uid === 'null') {
        alert("Hitilafu: Mpokeaji hajatambulika.");
        return;
    }
    skh.currentChatUid = uid;
    skh.chatPartner = displayName || 'Mawasiliano';
    skh.activeChatProduct = null;
    skh.activeChatService = null;
    skh.activeChatTransport = null;

    if (typeof window.skhChatOpen === 'function') {
        return window.skhChatOpen(uid, displayName || 'Mawasiliano', {});
    }
};

window.resumeChat = function(uid, email, name) {
    if (!uid || uid === 'undefined' || uid === 'null') return;
    if (typeof window.skhChatOpen === 'function') {
        return window.skhChatOpen(uid, name || 'Mawasiliano', { email: email || '' });
    }
};


window.resumeChat = function(uid, email, name) {
    skh.currentChatUid = uid || '';
    skh.currentChatEmail = email || '';
    skh.chatPartner = name || (email ? email.split('@')[0] : 'Mawasiliano');
    skh.activeChatProduct = null; // Futa bidhaa ya zamani

    const cw = document.getElementById('chatWith');
    if(cw) cw.innerText = skh.chatPartner;

    // [DP-EVERYWHERE] DP ya mwenzako kwenye kichwa cha chat
    window.skhSetChatHeaderAvatar(uid, null, skh.chatPartner);
    window.skhRenderAttachedProduct();

    closeModals(); 
    const cm = document.getElementById('chatModal');
    if(cm) cm.style.display = 'flex'; 
    
    skh.listenToChats(skh.currentChatEmail, skh.currentChatUid); 
};

// [CHAT] Fungua chat na mtu yeyote kwa uid (muuzaji/dereva/mteja) — kwa kuangalia email yake
window.openChatWithUser = function(uid, displayName) {
    if(!skh.requireAuth()) return;
    if(!uid || uid === 'undefined' || uid === 'null') {
        alert("Hitilafu: Taarifa za mpokeaji hazijapatikana.");
        return;
    }
    skh.currentChatUid = uid;
    skh.chatPartner = displayName || 'Mawasiliano';
    skh.activeChatProduct = null;
    skh.activeChatService = null;
    skh.activeChatTransport = null;

    if (typeof window.skhChatOpen === 'function') {
        return window.skhChatOpen(uid, displayName || '', {});
    }
};

window.openChatList = async function() { 
    if(!skh.requireAuth()) return; 
    
    closeModals();
    const clModal = document.getElementById('chatListModal');
    if(clModal) clModal.style.display = 'flex';
    
    const inboxList = document.getElementById('inboxList');
    inboxList.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">' + T('pr_loading_inbox', 'Loading inbox...') + '</p>';

    const myEmail = (skh.currentUser.email || '').toLowerCase();
    const myUid = skh.currentUser.uid;

    try {
        // Tunavuta chats zote ambazo mhusika yumo (kwa uid na email — zote mbili kwa usalama)
        const queries = [];
        if (myEmail) {
            queries.push(skh.query(skh.collection(skh.db, "chats"), skh.where("sender", "==", myEmail)));
            queries.push(skh.query(skh.collection(skh.db, "chats"), skh.where("receiver", "==", myEmail)));
        }
        if (myUid) {
            queries.push(skh.query(skh.collection(skh.db, "chats"), skh.where("senderUid", "==", myUid)));
            queries.push(skh.query(skh.collection(skh.db, "chats"), skh.where("receiverUid", "==", myUid)));
        }

        const snaps = await Promise.all(queries.map(q => skh.getDocs(q)));
        
        let allChats =[];
        snaps.forEach(snap => snap.forEach(doc => allChats.push(doc.data())));

        // Tunachuja ili kupata watu tofauti tuliochati nao (Unique Contacts) — kwa uid au email
        let contacts = {};
        allChats.forEach(chat => {
            const sUid = chat.senderUid, rUid = chat.receiverUid;
            const sEmail = (chat.sender || '').toLowerCase(), rEmail = (chat.receiver || '').toLowerCase();
            const isMeSender = (sUid ? sUid === myUid : sEmail === myEmail);
            const otherUid = isMeSender ? rUid : sUid;
            const otherEmail = isMeSender ? rEmail : sEmail;
            const key = otherUid ? ('u:' + otherUid) : ('e:' + otherEmail);
            if (!key || key === ('u:' + myUid) || key === ('e:' + myEmail)) return;
            if(!contacts[key] || new Date(chat.createdAt) > new Date(contacts[key].createdAt)) {
                contacts[key] = chat;
            }
        });

        if(Object.keys(contacts).length === 0) {
            inboxList.innerHTML = '<p style="text-align:center; color:#64748b;">' + T('pr_no_contacts', 'No contacts yet.') + '</p>';
            return;
        }

        // [DP-EVERYWHERE] Vuta DP za kila mwasiliani kwa mara moja (users/{uid})
        const contactKeys = Object.keys(contacts);
        const uidToPhoto = {};
        await Promise.all(contactKeys.map(async (key) => {
            const chat = contacts[key];
            const isMeSender = (chat.senderUid ? chat.senderUid === myUid : (chat.sender || '').toLowerCase() === myEmail);
            const otherUid = isMeSender ? chat.receiverUid : chat.senderUid;
            if (!otherUid) return;
            try {
                const us = await skh.getDoc(skh.doc(skh.db, "users", otherUid));
                if (us && us.exists && us.exists()) {
                    const ud = us.data();
                    uidToPhoto[otherUid] = ud.photoURL || ud.profileImage || ud.logo || '';
                }
            } catch (e) { /* tumia tile ya herufi */ }
        }));

        let html = '';
        contactKeys.forEach(key => {
            const chat = contacts[key];
            const isMeSender = (chat.senderUid ? chat.senderUid === myUid : (chat.sender || '').toLowerCase() === myEmail);
            const otherUid = isMeSender ? chat.receiverUid : chat.senderUid;
            const otherEmail = isMeSender ? chat.receiver : chat.sender;
            const otherName = isMeSender ? chat.receiverName : chat.senderName;
            let lastMsg = chat.text || '';
            if(lastMsg.includes(" Attachment")) lastMsg = "Picha/Faili";
            const timeStr = chat.createdAt ? (window.skhChatTime ? window.skhChatTime(chat.createdAt) : '') : '';

            const label = otherName || (otherEmail ? otherEmail.split('@')[0] : 'Mawasiliano');
            const escUid = skh.skhJsEsc(otherUid || '');
            const escEmail = skh.skhJsEsc(otherEmail || '');
            const escLabel = skh.skhJsEsc(label);
            const escMsg = skh.skhEscape(lastMsg);
            const escTime = skh.skhEscape(timeStr);
            const dp = (typeof window.skhUserAvatar === 'function') ? window.skhUserAvatar(uidToPhoto[otherUid] || null, label, 46) : '';
            html += `
                <div class="chat-contact" onclick="resumeChat('${escUid}', '${escEmail}', '${escLabel}')">
                    ${dp}
                    <div class="cc-info"> <span class="cc-name">${skh.skhEscape(label)}</span> <span class="cc-msg">${escMsg}</span> </div>
                    ${escTime ? `<span class="cc-time">${escTime}</span>` : ''}
                </div> `;
        });
        inboxList.innerHTML = html;
    } catch (e) {
        inboxList.innerHTML = '<p style="color:red; text-align:center;">' + T('pr_inbox_fail', 'Failed to load messages.') + '</p>';
    }
};

window.sendMessage = async function() { 
    const input = document.getElementById('chatInput'); 
    if(!input) return;
    const text = input.value.trim(); 
    if(!text) return;
    if(!skh.currentChatUid && !skh.currentChatEmail) { 
        alert(T('pr_open_chat_hint', 'This person is unknown yet. Open chat from a listing or order.')); 
        return; 
    }
    
    // Hakikisha mhusika ana identity inayojulikana
    const myEmail = (skh.currentUser.email || '').toLowerCase();
    const myUid = skh.currentUser.uid;
    const theirEmail = (skh.currentChatEmail || '').toLowerCase();
    const theirUid = skh.currentChatUid || '';
    const myName = (skh.currentUser.displayName || (myEmail ? myEmail.split('@')[0] : 'Mimi'));

    const msg = { 
        text: text, 
        sender: myEmail, 
        receiver: theirEmail,
        senderUid: myUid, 
        receiverUid: theirUid,
        senderName: myName,
        senderPhoto: (skh.currentUserData && skh.currentUserData.photoURL) || skh.currentUser.photoURL || null,
        receiverName: skh.chatPartner || (theirEmail ? theirEmail.split('@')[0] : 'Mawasiliano'),
        createdAt: new Date().toISOString(),
        productId: skh.activeChatProduct ? skh.activeChatProduct.id : null,
        productTitle: skh.activeChatProduct ? (skh.activeChatProduct.title || skh.activeChatProduct.itemTitle) : null,
        productImg: skh.activeChatProduct ? (skh.activeChatProduct.image || (skh.activeChatProduct.images && skh.activeChatProduct.images[0]) || skh.activeChatProduct.photo) : null,
        productCollection: skh.activeChatProduct ? (skh.activeChatProduct.collectionName || skh.currentFeedCollection || null) : null,
        sellerUid: skh.activeChatProduct ? (skh.activeChatProduct.userId || null) : null
    };
    
    input.value = ""; 

    // [OPTIMISTIC UI] Onyesha meseji papo hapo (hata kabla server haijajibu)
    const chatDiv = document.getElementById('chatMessages');
    if(chatDiv) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble me';
        bubble.innerHTML = skh.skhEscape(text);
        chatDiv.appendChild(bubble);
        chatDiv.scrollTop = chatDiv.scrollHeight;
    }

    try { 
        // Tunatuma meseji + Taarifa za bidhaa (kama ipo)
        await skh.addDoc(skh.collection(skh.db, "chats"), msg); 
        skh.activeChatProduct = null; // Epuka kutuma bidhaa hii kwenye kila meseji anayoandika baadae
        window.skhRenderAttachedProduct(); // Ficha strip ya bidhaa iliyoambatishwa
    } catch(err) { 
        alert(T('pr_msg_fail', 'Failed to send message:') + " " + ((err && err.message) || T('pr_connection', 'connection'))); 
    } 
};

// [FAKE FIX 2026-09] startAudioCall/startVideoCall ziliondolewa — zilikuwa
// vitufe bandia vya "Calling..." (alert tu, hakuna simu halisi). Vitufe vyao
// vimeondolewa kwenye kichwa cha chat (compact), na hatudanganyi upatikanaji
// wa simu/video.

window.toggleVoiceRecord = async function() {
    const btn = document.getElementById('voiceBtn');
    
    if(!skh.isRecording) { 
        try {
            // 1. Omba ruhusa ya Microphone kwa mtumiaji
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            skh.mediaRecorder = new MediaRecorder(stream);
            skh.audioChunks =[];
            
            skh.mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) skh.audioChunks.push(event.data);
            };
            
            skh.mediaRecorder.onstop = async () => {
                // 3. Rekodi ikisimama, ipandishe Cloudinary
                btn.innerText = "";
                const audioBlob = new Blob(skh.audioChunks, { type: 'audio/webm' });
                
                // [PHASE 4.2] Uploader mmoja (audio inapanda kama 'video' resource)
                try {
                    const up = await window.skhUploadFromFile(audioBlob, { resourceType: 'video' });
                    const data = up ? up.data : {}; 
                    
                    if(data.secure_url) { 
                        // Tuma url ya Sauti kwenye Firebase Chats
                        let receiverEmail = skh.currentOpenProduct ? skh.currentOpenProduct.userEmail : skh.chatPartner + "@gmail.com"; // Fallback logic
                        await skh.addDoc(skh.collection(skh.db, "chats"), { 
                            text: ` Attachment: ${data.secure_url}`, 
                            sender: skh.currentUser.email, 
                            receiver: receiverEmail, 
                            createdAt: new Date().toISOString() 
                        }); 
                    }
                } catch(err) {
                    alert(T('pr_voice_fail', 'Failed to send voice note.'));
                } finally {
                    btn.style.color = "var(--terracotta)"; 
                    btn.innerText = ""; 
                }
            };
            
            // 2. Anza kurekodi
            skh.mediaRecorder.start();
            skh.isRecording = true; 
            btn.style.color = "red"; 
            btn.innerText = ""; 
            alert(T('pr_recording', 'Recording... Tap again to send.'));
            
        } catch (err) {
            alert(T('pr_allow_mic', 'Allow your phone/browser to use the Microphone to send audio.'));
        }
    } else { 
        // Simamisha Kurekodi
        skh.mediaRecorder.stop();
        skh.isRecording = false; 
    }
};

window.triggerChatAttachment = function() { 
        const cfi = document.getElementById('chatFileInput');
        if(cfi) cfi.click(); 
    };

window.handleChatFileUpload = async function(e) { 
        const file = e.target.files[0]; 
        if(!file || !skh.currentOpenProduct) return; 
        
        alert(T('pr_uploading', 'Uploading your file...')); 
        
        try { 
            const up = await window.skhUploadFromFile(file);
            if(!up) throw new Error(T('pr_upload_fail', 'Failed to upload file.'));
            const data = up.data; 
            if(data.secure_url) { 
                await skh.addDoc(skh.collection(skh.db, "chats"), { 
                    text: ` Attachment: ${data.secure_url}`, 
                    sender: skh.currentUser.email, 
                    receiver: skh.currentOpenProduct.userEmail, 
                    createdAt: new Date().toISOString() 
                }); 
            } 
        } catch(err) { 
            alert(T('pr_upload_fail', 'Failed to upload file.')); 
        } finally { 
            const cfi = document.getElementById('chatFileInput');
            if(cfi) cfi.value = ""; 
        } 
    };

// ============================================================
// [NOTIF LINK] Taarifa ziwe na link — mtu abonyeze akaenda moja kwa moja
// ============================================================
window.skhNotifLabel = function(type) {
    const labels = {
        order: '<span style="display:inline-block; margin-top:6px; background:#0ea5e9; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Nenda kwenye Oda Zako</span>',
        wallet: '<span style="display:inline-block; margin-top:6px; background:#16a34a; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua SokoPay Wallet</span>',
        agent: '<span style="display:inline-block; margin-top:6px; background:#f97316; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Dashbodi ya Wakala</span>',
        delivery: '<span style="display:inline-block; margin-top:6px; background:#6366f1; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Mizigo Yangu</span>',
        ride_request: '<span style="display:inline-block; margin-top:6px; background:#d97706; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Requests Marketplace</span>',
        chat: '<span style="display:inline-block; margin-top:6px; background:#25D366; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Chat</span>',
        negotiation: '<span style="display:inline-block; margin-top:6px; background:#18A982; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Majadiliano</span>',
        booking: '<span style="display:inline-block; margin-top:6px; background:#d97706; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Requests Marketplace</span>',
        payment: '<span style="display:inline-block; margin-top:6px; background:#16a34a; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua SokoPay Wallet</span>',
        new_comment: '<span style="display:inline-block; margin-top:6px; background:#0ea5e9; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Maswali</span>',
        comment_reply: '<span style="display:inline-block; margin-top:6px; background:#0ea5e9; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Maswali</span>',
        comment_mention: '<span style="display:inline-block; margin-top:6px; background:#0ea5e9; color:#fff; font-size:12.5px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Maswali</span>'
    };
    return labels[type] || '';
};

// Helper: fungua conversation HALISI kwa ID yake — hutumika na arifa za
// negotiation/chat (ukigusa arifa inakwenda MOJA KWA MOJA kwenye mazungumzo,
// si kwenye list tena). Hakuna fake: hupata participants kutoka doc halisi.
window.skhOpenConvById = async function(convId) {
    if (!convId || !skh.db) return false;
    try {
        var s = await skh.getDoc(skh.doc(skh.db, 'conversations', convId));
        if (!s || !s.exists || !s.exists()) return false;
        var c = s.data() || {};
        var me = (skh.currentUser && skh.currentUser.uid) || '';
        var other = (c.participants || []).filter(function (u) { return u && u !== me; })[0];
        var nm = '';
        try {
            var metas = c.participantMeta || c.meta || {};
            var om = metas[other] || {};
            nm = om.name || om.displayName || '';
        } catch (e) {}
        if (other && typeof window.skhChatOpen === 'function') {
            await window.skhChatOpen(other, nm, {});
            return true;
        }
    } catch (e) { /* anguka chini: chat list */ }
    return false;
};

window.skhNotifGo = async function(type, targetId, conversationId) {
    try { closeModals(); } catch(e) {}
    try {
        // [NOTIF GO 2026-09-17] KILA gusa linapeleka mahali — hakuna "imeisha hivyo".
        // 1) Njia ya KUZUNGUMZA inapojulikana (negotiation/chat reminders):
        //    fungua conversation yenyewe moja kwa moja.
        var convId = conversationId
            || (targetId && /^(conv_|conv:)/.test(String(targetId)) ? targetId : null);
        if ((type === 'negotiation' || type === 'chat') && convId) {
            try { if (await window.skhOpenConvById(convId)) return; } catch (e2) {}
            if (typeof window.openChatList === 'function') { window.openChatList(); return; }
        }
        if (type === 'order') { if (typeof window.openBuyerOrdersModal === 'function') { window.openBuyerOrdersModal(); return; } }
        if (type === 'wallet' || type === 'payment') { if (typeof window.openUserPaymentModal === 'function') { window.openUserPaymentModal(); return; } }
        if (type === 'agent') { if (typeof window.switchMode === 'function') { window.switchMode('agent'); return; } }
        if (type === 'delivery') { if (typeof window.openMyDeliveries === 'function') { window.openMyDeliveries(); return; } }
        if (type === 'ride_request' || type === 'booking') {
            // Msafirishaji: fungua dashboard yake kwenye Requests Marketplace
            if (typeof window.switchMode === 'function') window.switchMode('driver');
            setTimeout(function() {
                if (typeof window.switchDashTab === 'function') window.switchDashTab('bookings');
            }, 350);
            return;
        }
        if (type === 'chat') { if (typeof window.openChatList === 'function') { window.openChatList(); return; } }
        if (type === 'new_comment' || type === 'comment_reply' || type === 'comment_mention') {
            // [COMMENT FIX 2026-09] Taarifa ya maoni -> fungua bidhaa (na Maswali & Majibu).
            if (targetId && typeof window.openProduct === 'function') { window.openProduct(targetId); return; }
            if (typeof window.updateApp === 'function') { window.updateApp('market'); return; }
        }
        // [DEEP-LINK 2026-09] Bidhaa mpya / price drop / engagement — Fungua
        // bidhaa yenyewe (hii ilikuwa ikifungiwa na kurudishwa sokoni bure).
        if (type === 'engagement' || type === 'product' || type === 'new_product' || type === 'price_drop' || type === 'saved' || type === 'watch') {
            if (targetId && typeof window.openProduct === 'function') { window.openProduct(targetId); return; }
        }
    } catch(e) {
        console.error('NotifGo error:', e);
    }
    // FALLBACK: aina mpya/isiyotambulika → peleka kwenye soko kuu (si chochole).
    try { if (typeof window.updateApp === 'function') window.updateApp('market'); } catch (e) {}
};

// Tambua aina ya notification kutoka kwenye maneno (kwa taarifa za zamani zisizo na `type`)
window.skhInferNotifType = function(title, body) {
    const t = ((title || '') + ' ' + (body || '')).toLowerCase();
    if (t.includes('wallet') || t.includes('sokopay') || t.includes('kamisheni') || t.includes('imeingizwa') || t.includes('imepokelewa') || t.includes('malipo')) return 'wallet';
    if (t.includes('wakala') || t.includes('uwakala') || t.includes('umeingia kazini')) return 'agent';
    if (t.includes('majadiliano') || t.includes('ofa mpya') || t.includes('kumbusho la') || t.includes('bei unayopendekeza')) return 'negotiation';
    if (t.includes('oda') || t.includes('mzigo') || t.includes('escrow') || t.includes('uthibitishe') || t.includes('kazi imekamilika')) return 'order';
    if (t.includes('usafiri') || t.includes('safari') || t.includes('dereva') || t.includes('mizigo')) return 'delivery';
    if (t.includes('ujumbe') || t.includes('meseji') || t.includes('chat') || t.includes('mawasiliano')) return 'chat';
    return '';
};

window.openNotifications = async function() {
        if(!skh.requireAuth()) return;

        const list = document.getElementById('notifList');
        const nb = document.getElementById('notifBadge');

        if(list) list.innerHTML = '<p style="text-align:center; padding:20px;"> ' + T('pr_loading_notifs', 'Loading your notifications...') + '</p>';

        const nm = document.getElementById('notifModal');
        if(nm) nm.style.display = 'flex';

        // [NOTIF FIX 2026-09] Ikoni kwa kila aina ya arifa (SVG — hakuna emoji).
        function notifIco(type) {
            var name = ({
                order: 'clipboard', wallet: 'wallet', agent: 'users',
                delivery: 'truck', ride_request: 'truck', chat: 'chat',
                new_comment: 'edit', comment_reply: 'edit', comment_mention: 'edit',
                negotiation: 'tag'
            })[type] || 'bell';
            return window.skhNavIcon ? window.skhNavIcon(name, 20) : '';
        }
        async function fetchNotifs() {
            // Swali kamili (userId + orderBy createdAt) — lahitaji index yake.
            try {
                const q = skh.query(skh.collection(skh.db, "notifications"),
                    skh.where("userId", "==", skh.currentUser.uid),
                    skh.orderBy("createdAt", "desc"), skh.limit(30));
                return await skh.getDocs(q);
            } catch (e1) {
                // [RESILIENCE] Index isipokuwepo/haijapelekwa: vuta kwa userId
                // kisha panga kwa tarehe UPANDE WA MTEJA — orodha isikose kamwe.
                console.warn('[notif] swali la orderBy limeanguka, fallback:', e1 && e1.code);
                const q2 = skh.query(skh.collection(skh.db, "notifications"),
                    skh.where("userId", "==", skh.currentUser.uid), skh.limit(50));
                return await skh.getDocs(q2);
            }
        }

        try {
            const snap = await fetchNotifs();
            const docs = [];
            snap.forEach(function (d) { docs.push(d); });
            // Panga kwa tarehe kushuka (kwa fallback isiyo na orderBy).
            docs.sort(function (a, b) {
                var ta = new Date((a.data() || {}).createdAt || 0).getTime();
                var tb = new Date((b.data() || {}).createdAt || 0).getTime();
                return tb - ta;
            });
            const top = docs.slice(0, 30);

            if(!top.length) {
                list.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;">'
                    + (window.skhNavIcon ? '<div style="opacity:.5;margin-bottom:10px;">' + window.skhNavIcon('bell', 34) + '</div>' : '')
                    + '<br>' + T('pr_no_notifs', 'No new notifications.') + '</div>';
            } else {
                let html = '';
                top.forEach(doc => {
                    const data = doc.data() || {};
                    let date = '';
                    try { date = new Date(data.createdAt).toLocaleString(); } catch (e) { date = ''; }
                    const ntype = data.type || window.skhInferNotifType(data.title, data.body);
                    const actionLabel = window.skhNotifLabel(ntype);
                    // [SYSTEM EVENTS 2026-09] Arifa zenye `event`+`params` hutafsiriwa
                    // kwa lugha ya MSOMAJI; za zamani (title/body tu) haziguswi.
                    const ntxt = window.skhNotifText ? window.skhNotifText(data) : { title: data.title || '', body: data.body || '' };
                    // [NOTIF GO 2026-09-17] kwa-arifa za kuzungumza, conversationId
                    // ndiyo kiinua cha deep-link; ziada (productId, rideId) hubaki.
                    const convPrm = data.conversationId ? skh.skhJsEsc(String(data.conversationId)) : '';
                    const targetId = data.targetId ? skh.skhJsEsc(String(data.targetId)) : (data.productId ? skh.skhJsEsc(String(data.productId)) : (convPrm ? convPrm : (data.negotiationId ? skh.skhJsEsc(String(data.negotiationId)) : (data.orderId ? skh.skhJsEsc(String(data.orderId)) : (data.rideId ? skh.skhJsEsc(String(data.rideId)) : '')))));
                    html += `
                    <div class="list-item skh-notif-item" onclick="window.skhNotifGo('${skh.skhJsEsc(ntype || '')}', '${targetId}', '${convPrm}')" style="cursor:pointer; ${data.read ? 'opacity:0.72;' : 'background:#F1FBF7;border:1px solid #D9EEE5;'}"> <div class="skh-notif-ico type-${skh.skhEscape(ntype || 'info')}">${notifIco(ntype)}</div> <div class="list-info"> <b>${skh.skhEscape(ntxt.title)}</b> <span style="color:#64748b; font-weight:normal; display:block; font-size:12px;">${skh.skhEscape(ntxt.body)}</span> <small style="font-size:12.5px; color:#94a3b8;">${skh.skhEscape(date)}</small>
                            ${actionLabel}
                        </div>
                        ${data.read ? '' : '<span class="skh-notif-dot" aria-label="Hijasomwa"></span>'}
                    </div>`;

                    // Mark as read (Tia alama zimesomwa)
                    if(!data.read) {
                        skh.updateDoc(doc.ref, { read: true }).catch(()=>{});
                    }
                });
                list.innerHTML = html;
            }
            if(nb) nb.style.display = 'none';
            // Beji isasishe mara moja (usiishie listener).
            if (typeof skh.listenToUnreadNotifications === 'function') {
                try { skh.listenToUnreadNotifications(); } catch (e) {}
            }
        } catch (error) {
            if(list) list.innerHTML = '<p style="text-align:center; color:#b91c1c;padding:24px;">'
                + (window.skhNavIcon ? '<div style="margin-bottom:8px;">' + window.skhNavIcon('bell', 30) + '</div>' : '')
                + T('pr_notifs_fail', 'Failed to load notifications.') + '</p>';
        }
    };

window.resetAppState = function() {skh.activeCategory = "Zote";
skh.activeSubCategory = "Zote";
skh.activeFilterValues = {};
skh.searchQuery = "";
skh.filterRegion = ""; // [MIKOA] Rudisha kwenye "Tanzania Nzima"
const regionSel = document.getElementById('regionFilterSelect');
if(regionSel) regionSel.value = "";

// Safisha vibox vya maandishi
const sInput = document.getElementById('searchInput');
if(sInput) sInput.value = "";

// Safisha kioo cha chips (Blue chips za subcategories)
const subRow = document.getElementById('subcatRow');
const filterRow = document.getElementById('filterRow');
if(subRow) subRow.innerHTML = "";
if(filterRow) filterRow.innerHTML = "";

const catText = document.getElementById('activeCategoryText');
if(catText) catText.innerHTML = (window.skhNavIcon ? skhNavIcon('folder', 15) + ' ' : '') + T('pr_cat_all', 'Category: All'); // [PHASE 5.9]

const sliders = document.getElementById('dynamicSliders');
if(sliders) sliders.style.display = 'none';


};

// ============================================================
// [PUBLIC LINKS] Deep-link ya bidhaa — fungua bidhaa kutoka
// kiungo kilichoshirikiwa (#/product/{id}) au clean URL (/p/{id}).
// Hii ndiyo inayofanya bidhaa ziweze kuonekana na Google baadaye.
// ============================================================
window.addEventListener('hashchange', function () {
    if (!window.skhProductHashGuard) window.skhResolveProductDeepLink();
});
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.skhResolveProductDeepLink);
} else {
    window.skhResolveProductDeepLink();
}
// Chelezo kama Firestore/auth bado inapakia (sawa na SokoPay deep-link).
setTimeout(window.skhResolveProductDeepLink, 1400);

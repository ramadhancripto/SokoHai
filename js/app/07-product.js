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

// [ZOOM] Kugusa picha au kubofya +/- → viewer kamili ya kukuza/kupunguza
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

window.openProduct = async function(id, manualCollection = null) {
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
    
    // 2. Funga listener ya zamani kama ipo ili zisijirudie
    if(window.activeProductUnsubscribe) window.activeProductUnsubscribe();

    // 3. ANZA LIVE LISTENER (Hapa ndipo mawasiliano yanatokea)
    const docRef = skh.doc(skh.db, colToUse, id);
    window.activeProductUnsubscribe = skh.onSnapshot(docRef, (snapshot) => {
        if(!snapshot.exists()) {
            alert(T('pm_deleted', 'Product no longer available!'));
            closeModals();
            return;
        }

        const found = { id: snapshot.id, collectionName: colToUse, ...snapshot.data() };
        skh.currentOpenProduct = found;

        // [PUBLIC LINKS] Weka URL ya bidhaa kwenye address bar (bila ku-reload)
        // — hii inafanya kiungo kiweze kushirikiwa na kuonekana na Google.
        window.skhSetProductUrl(found.id);
        window.skhUpdateSeoMeta(found);

        // --- CHORA UI (Renders everything inside the modal) ---
        
        // A. Jaza Picha (Ulinzi uliodhibitiwa dhidi ya picha tupu)
        const slider = document.getElementById('pmImageSlider');
        let pics = found.imagesArray || [];
        if (pics.length === 0 && (found.image || found.photo)) {
            pics = [found.image || found.photo];
        }
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
                return `<div style="min-width:100%; height:100%; display:flex; align-items:center; justify-content:center; scroll-snap-align:start; background:#0f172a;">
                    <video src="${skh.skhEscape(pic)}" controls muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain;"></video>
                </div>`;
            }
            const zIdx = window.skhZoomImages.indexOf(pic);
            return `
            <div onclick="window.openImageZoom(window.skhZoomImages, ${zIdx >= 0 ? zIdx : 0})" style="min-width:100%; height:100%; display:flex; align-items:center; justify-content:center; scroll-snap-align:start; cursor:zoom-in;">
                <img src="${skh.skhEscape(skh.getOptimizedImageUrl(pic))}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;" onerror="this.src=window.SKH_PLACEHOLDER_IMG||'https://ui-avatars.com/api/?name=Soko&background=f1f5f9&color=64748b'">
            </div>`;
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
                <span class="pm-dot ${idx === 0 ? 'active' : ''}" style="width:8px; height:8px; border-radius:50%; background:#cbd5e1; display:inline-block; transition: 0.3s;"></span>
            `).join('');
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
        // B. [SHOWCASE MODULE 39] Panga muonekano mzima wa bidhaa:
        //    identity/bei/upatikanaji, variants za data, panel ya mnada,
        //    maelezo/sifa, usambazaji/ulinzi, tathmini, muuzaji (fupi),
        //    kifimbo cha chini (Cart/Buy/Chat/Dau/Agiza). Renderer haigusi
        //    logic ya cart/checkout/order/negotiation — inatumia handlers zilizopo.
        if (typeof window.skhRenderShowcase === 'function') {
            window.skhRenderShowcase(found, colToUse);
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
        });

        document.getElementById('productModal').style.display = 'flex';
    };

window.renderSpecialModesUI = function(mode, actionArea) {
    const mData = skh.currentOpenProduct.modeData || {};
    const nowMs = Date.now();
    let basePrice = parseFloat(skh.currentOpenProduct.price) || 0;

    if (mode === 'auction') {
        const currentBid = mData.currentBid || skh.currentOpenProduct.price;
        const totalBids = mData.totalBids || 0;
        const winner = mData.maxBidderName || "Bado hakuna";
        const isExpired = Date.now() >= (mData.endTime || 0);

        if (isExpired) {
            actionArea.innerHTML = `
                <div style="background:#0f172a; color:white; padding:20px; text-align:center; border-radius:18px;">
                    <h3 style="color:var(--gold); margin:0;"> MNADA UMEFUNGWA</h3>
                    <p>Mshindi: <b>${winner.toUpperCase()}</b></p>
                    <h2 style="color:var(--gold);">TZS ${currentBid.toLocaleString()}</h2>
                </div>`;
        } else {
            actionArea.innerHTML = `
                <div style="background:#fef2f2; padding:15px; border-radius:18px; text-align:center; border: 2px dashed #ef4444;">
                    <b style="color:#ef4444;"> MNADA LIVE</b><br>
                    <span class="live-timer" data-endtime="${mData.endTime}" style="color:#ef4444; font-weight:900; font-size:20px;"> ...</span>
                    
                    <div style="background:white; padding:10px; border-radius:12px; margin:10px 0; display:flex; justify-content:space-around;">
                        <div><small>Dau la Juu</small><br><b>${currentBid.toLocaleString()}</b></div>
                        <div><small>Bids</small><br><b>${totalBids}</b></div>
                    </div>

                    <div style="background:white; padding:10px; border-radius:12px; margin-bottom:12px; border:1px solid #ddd;">
                         <input type="number" id="userBidInput" placeholder="${T('pr_bid_ph', 'Place a bid above')} ${(currentBid + 500).toLocaleString()}" style="width:100%; border:none; outline:none; text-align:center; font-weight:900; font-size:18px;">
                    </div>
                    
                    <button onclick="window.placeBid()" style="width:100%; padding:16px; background:#ef4444; color:white; border:none; border-radius:14px; font-weight:900; cursor:pointer;">WEKA DAU LAKO </button>
                </div>`;
        }
    } 
    else if (mode === 'price_drop') {
        const start = mData.startTime || nowMs;
        const end = mData.endTime || nowMs;
        const min = mData.minPrice || 0;
        const interval = mData.intervalMs || 60000;
        const dropAmt = mData.dropAmount || 0;

        const dropsOccurred = Math.floor((nowMs - start) / interval);
        let currentP = basePrice - (dropsOccurred * dropAmt);
        if (currentP < min) currentP = min;

        const isExpired = nowMs >= end;

        if (isExpired) {
            actionArea.innerHTML = `
                <div style="background:#0f172a; color:white; padding:20px; text-align:center; border-radius:18px;">
                    <h3 style="color:#ef4444; margin:0;"> PRICE DROP DEAL IMEKWISHA</h3>
                    <h2 style="color:var(--gold);">TZS ${min.toLocaleString()}</h2>
                </div>`;
        } else {
            actionArea.innerHTML = `
                <div style="background:#f3e8ff; padding:15px; border-radius:18px; text-align:center; border: 2px dashed #9333ea;">
                    <b style="color:#9333ea;"> PRICE DROP DEAL IS LIVE</b><br>
                    <span class="live-timer" data-endtime="${end}" style="color:#9333ea; font-weight:900; font-size:20px;"> ...</span>
                    
                    <div style="background:white; padding:10px; border-radius:12px; margin:10px 0; text-align:center;">
                        <span style="font-size:12px; color:gray;">Bei ya Sasa Hivi:</span>
                        <h2 style="color:#9333ea; margin:5px 0;">TZS ${Math.round(currentP).toLocaleString()}</h2>
                    </div>

                    <button onclick="window.checkoutSeriousMode(${currentP})" style="width:100%; padding:16px; background:#9333ea; color:white; border:none; border-radius:14px; font-weight:900; cursor:pointer;"> FUNGIA BEI HII & LIPYA (ESCROW)</button>
                </div>`;
        }
    } 
    else if (mode === 'group_buy') {
        const joined = mData.joinedUsers || 1;
        const target = mData.targetPeople || 10;
        const discVal = parseFloat(mData.discountValue) || 0;
        const discType = mData.discountType || 'amount';
        const end = mData.endTime || nowMs;

        let currentPrice = basePrice;
        const extraPeople = joined - 1;

        if (extraPeople > 0) {
            if (discType === 'percent') {
                let totalDiscPercent = Math.min(90, discVal * extraPeople);
                currentPrice = basePrice - (basePrice * (totalDiscPercent / 100));
            } else {
                currentPrice = Math.max(basePrice * 0.1, basePrice - (discVal * extraPeople));
            }
        }

        const isExpired = nowMs >= end;

        if (isExpired) {
            actionArea.innerHTML = `
                <div style="background:#0f172a; color:white; padding:20px; text-align:center; border-radius:18px;">
                    <h3 style="color:#10b981; margin:0;"> GROUP BUY DEAL IMEFUNGWA</h3>
                    <p>Watu waliojiunga: <b>${joined}/${target}</b></p>
                    <h2 style="color:var(--gold);">TZS ${Math.round(currentPrice).toLocaleString()}</h2>
                </div>`;
        } else {
            let progressPercent = Math.min(100, (joined / target) * 100);
            actionArea.innerHTML = `
                <div style="background:#dcfce7; padding:15px; border-radius:18px; text-align:center; border: 2px dashed #10b981;">
                    <b style="color:#10b981;"> GROUP BUY INAVUMA</b><br>
                    <span class="live-timer" data-endtime="${end}" style="color:#10b981; font-weight:900; font-size:20px;"> ...</span>
                    
                    <div style="background:white; padding:10px; border-radius:12px; margin:10px 0; text-align:center;">
                        <span style="font-size:12px; color:gray;">Bei ya Kundi Sasa:</span>
                        <h2 style="color:#10b981; margin:5px 0;">TZS ${Math.round(currentPrice).toLocaleString()}</h2>
                        
                        <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden; margin-top:10px;">
                            <div style="width:${progressPercent}%; height:100%; background:#10b981;"></div>
                        </div>
                        <small style="font-size:10px; color:gray; display:block; margin-top:5px;">Watu waliojiunga: <b>${joined}/${target}</b></small>
                    </div>

                    <button onclick="window.checkoutSeriousMode(${currentPrice})" style="width:100%; padding:16px; background:#10b981; color:white; border:none; border-radius:14px; font-weight:900; cursor:pointer;"> JIUNGE & LIPIA KWA ESCROW</button>
                </div>`;
        }
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

    if(confirm(T('pr_bid_confirm', 'Confirm placing a bid of TSh {n}? If you win, you will have to pay.', { n: bidValue.toLocaleString() }))) {
        try {
            const prodRef = skh.doc(skh.db, skh.currentOpenProduct.itemCollection || 'products', skh.currentOpenProduct.id);
            
            // Hifadhi dau jipya kwenye Firebase
            await skh.updateDoc(prodRef, {
                "modeData.currentBid": bidValue,
                "modeData.maxBidder": skh.currentUser.uid,
                "modeData.maxBidderName": skh.currentUser.displayName || T('pr_customer', 'Customer'),
                "modeData.totalBids": skh.increment(1)
            });

            alert(T('pr_bid_placed', 'Congratulations! Your bid is placed. You are now leading the auction!'));
            bidInput.value = "";
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
                // Server haipatikani (haijatumwa) → fallback ya client (bila badge).
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
        skh.smartCartItems();
        let cartItem = {...skh.currentOpenProduct, chosenColor, chosenSize, qty};
        skh.myCart.push(cartItem);
        skh.smartCartSave(); // Hifadhi local + cloud (users/{id}.cart) mara moja
        skh.updateCartUI();
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
        
        if(skh.myCart.length === 0) {
            html = '<p style="text-align:center; color:#64748b; margin-top:20px;">Kikapu chako kipo wazi. </p>';
        } else {
            skh.myCart.forEach((item, index) => {
                total += parseFloat(item.price || 0);
                html += `
                    <div class="list-item">
                        <img src="${skh.getOptimizedImageUrl(item.image || 'https://via.placeholder.com/150')}" alt="item">
                        <div class="list-info">
                            <b>${item.title}</b>
                            <span>TSh ${(item.price || 0).toLocaleString()}</span>
                        </div>
                        <button onclick="removeFromCart(${index})" style="background:#fee2e2; color:#ef4444; border:none; padding:8px 12px; border-radius:8px; font-weight:bold; cursor:pointer;">X</button>
                    </div>
                `;
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
        const t = p ? ((p.title || p.itemTitle || 'Bidhaa') + ' — SokoHai') : 'SokoHai — Soko la Mtandaoni la Tanzania';
        document.title = t;
        const desc = p
            ? ((p.title || p.itemTitle || 'Bidhaa') + (p.price ? ' kwa TSh ' + Number(p.price).toLocaleString() : '') + ' kwenye SokoHai. Nunua kwa usalama kupitia escrow.')
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

// Strip ya bidhaa iliyoambatishwa kwenye chat (juu ya composer).
window.skhRenderAttachedProduct = function() {
    const wrap = document.getElementById('chatAttachedProduct');
    if (!wrap) return;
    const p = skh.activeChatProduct;
    if (!p || !p.id) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    const img = p.image || (p.images && p.images[0]) || p.photo || (window.SKH_PLACEHOLDER_IMG || '');
    const title = p.title || p.itemTitle || 'Bidhaa';
    wrap.style.display = 'block';
    wrap.innerHTML = '<div class="chat-attached">'
        + (img ? '<img src="' + skh.skhEscape(skh.getOptimizedImageUrl(img)) + '" alt="" style="width:38px;height:38px;border-radius:8px;object-fit:cover;background:#f1f5f9;flex-shrink:0;" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||\'\';">' : '')
        + '<div style="min-width:0;flex:1;"><b style="font-size:12px;color:#0f172a;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + skh.skhEscape(title) + '</b>'
        + '<small style="font-size:10.5px;color:#b45309;font-weight:700;">Bidhaa imeambatishwa</small></div>'
        + '<button class="ca-remove" onclick="window.skhClearAttachedProduct()" title="Ondoa bidhaa">&times;</button>'
        + '</div>';
};

window.skhClearAttachedProduct = function() {
    skh.activeChatProduct = null;
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
        if (typeof window.openProduct === 'function') window.openProduct(pid);
    } catch (e) { /* si kiungo cha bidhaa */ }
};

window.startChat = function() {
    if(!skh.requireAuth() || !skh.currentOpenProduct) return;

    if(skh.currentOpenProduct.userId === skh.currentUser.uid) {
        alert(T('pr_chat_self', 'You cannot chat with yourself on your own listing.'));
        return;
    }

    if(!skh.currentOpenProduct.userEmail) {
        alert(T('pr_no_email', 'This seller has no registered email yet. You cannot start a chat.'));
        return;
    }

    skh.chatPartner = skh.currentOpenProduct.ownerName || (skh.currentOpenProduct.userEmail ? skh.currentOpenProduct.userEmail.split('@')[0] : T('eng_seller', 'Seller'));
    skh.currentChatEmail = skh.currentOpenProduct.userEmail || ''; // SHIKILIA EMAIL
    skh.currentChatUid = skh.currentOpenProduct.userId || '';       // SHIKILIA UID (ya kuaminika)
    skh.activeChatProduct = skh.currentOpenProduct; // SHIKILIA BIDHAA

    const cw = document.getElementById('chatWith');
    if(cw) cw.innerText = skh.chatPartner;

    // [DP-EVERYWHERE] DP ya muuzaji kwenye kichwa cha chat
    window.skhSetChatHeaderAvatar(skh.currentOpenProduct.userId, skh.currentOpenProduct.ownerPhoto || null, skh.chatPartner);

    // [ATTACH] Onyesha strip ya bidhaa iliyoambatishwa (juu ya composer)
    window.skhRenderAttachedProduct();

    // [SHOWCASE 39] Bebesha muktadha kamili (pamoja na variant iliyochaguliwa)
    var _vlabel = '';
    try {
        if (skh.currentOpenProduct.psVariants) {
            var _parts = [];
            Object.keys(skh.currentOpenProduct.psVariants).forEach(function (k) {
                var v = skh.currentOpenProduct.psVariants[k];
                if (v && String(v).toUpperCase() !== 'N/A') _parts.push(v);
            });
            if (_parts.length) _vlabel = ' (' + _parts.join(' / ') + ')';
        }
    } catch (e) {}
    skh.activeChatProductContext = {
        productId: skh.currentOpenProduct.id,
        sellerId: skh.currentOpenProduct.userId || null,
        collection: skh.currentOpenProduct.collectionName || 'products',
        variant: _vlabel ? _vlabel.slice(2, -1) : null
    };

    // Andaa ujumbe kwenye Input box wa kuvutia mteja
    const input = document.getElementById('chatInput');
    if(input) input.value = "Habari, nimevutiwa na bidhaa hii: " + skh.currentOpenProduct.title + _vlabel;

    closeModals();
    const cm = document.getElementById('chatModal');
    if(cm) cm.style.display = 'flex';

    skh.listenToChats(skh.currentChatEmail, skh.currentChatUid);
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
window.openChatWithUser = async function(uid, displayName) {
    if(!skh.requireAuth()) return;
    if(!uid) { alert(T('pr_unknown_person', 'We do not know this person yet (no info).')); return; }
    let email = null;
    try {
        const snap = await skh.getDoc(skh.doc(skh.db, "users", uid));
        if (snap && snap.exists()) {
            const ud = snap.data();
            email = ud.email || ud.userEmail || null;
            if (!displayName) displayName = ud.fullName || ud.displayName || email;
        }
    } catch (e) { email = null; }

    skh.chatPartner = displayName || (email ? email.split('@')[0] : 'Mawasiliano');
    skh.currentChatEmail = email || '';
    skh.currentChatUid = uid;
    skh.activeChatProduct = null;

    const cw = document.getElementById('chatWith');
    if(cw) cw.innerText = skh.chatPartner;

    // [DP-EVERYWHERE] DP ya mwenzako kwenye kichwa cha chat
    window.skhSetChatHeaderAvatar(uid, null, skh.chatPartner);
    window.skhRenderAttachedProduct();

    closeModals();
    const cm = document.getElementById('chatModal');
    if(cm) cm.style.display = 'flex';
    // Focus kwenye sanduku la kuandika ili mtumiaji aanze kuandika mara moja
    const inp = document.getElementById('chatInput');
    if (inp) setTimeout(() => { try { inp.focus(); } catch(e){} }, 250);

    skh.listenToChats(email || '', uid);
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
                    <div class="cc-info">
                        <span class="cc-name">${skh.skhEscape(label)}</span>
                        <span class="cc-msg">${escMsg}</span>
                    </div>
                    ${escTime ? `<span class="cc-time">${escTime}</span>` : ''}
                </div>
            `;
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
        order: '<span style="display:inline-block; margin-top:6px; background:#0ea5e9; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Nenda kwenye Oda Zako</span>',
        wallet: '<span style="display:inline-block; margin-top:6px; background:#16a34a; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua SokoPay Wallet</span>',
        agent: '<span style="display:inline-block; margin-top:6px; background:#f97316; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Dashbodi ya Wakala</span>',
        delivery: '<span style="display:inline-block; margin-top:6px; background:#6366f1; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Mizigo Yangu</span>',
        ride_request: '<span style="display:inline-block; margin-top:6px; background:#d97706; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Requests Marketplace</span>',
        chat: '<span style="display:inline-block; margin-top:6px; background:#25D366; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Inbox</span>',
        new_comment: '<span style="display:inline-block; margin-top:6px; background:#0ea5e9; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Maswali</span>',
        comment_reply: '<span style="display:inline-block; margin-top:6px; background:#0ea5e9; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Maswali</span>',
        comment_mention: '<span style="display:inline-block; margin-top:6px; background:#0ea5e9; color:#fff; font-size:10px; font-weight:900; padding:4px 10px; border-radius:99px;">&#8594; Fungua Maswali</span>'
    };
    return labels[type] || '';
};

window.skhNotifGo = function(type, targetId) {
    try { closeModals(); } catch(e) {}
    try {
        if (type === 'order') { if (typeof window.openBuyerOrdersModal === 'function') { window.openBuyerOrdersModal(); return; } }
        if (type === 'wallet') { if (typeof window.openUserPaymentModal === 'function') { window.openUserPaymentModal(); return; } }
        if (type === 'agent') { if (typeof window.switchMode === 'function') { window.switchMode('agent'); return; } }
        if (type === 'delivery') { if (typeof window.openMyDeliveries === 'function') { window.openMyDeliveries(); return; } }
        if (type === 'ride_request') {
            // Msafirishaji: fungua dashboard yake kwenye Requests Marketplace
            if (typeof window.switchMode === 'function') window.switchMode('driver');
            setTimeout(function() {
                if (typeof window.switchDashTab === 'function') window.switchDashTab('bookings');
            }, 350);
            return;
        }
        if (type === 'chat') { if (typeof window.openChatList === 'function') { window.openChatList(); return; } }
        if (type === 'new_comment' || type === 'comment_reply' || type === 'comment_mention') {
            // [COMMENT FIX 2026-09] Taarifa ya maoni → fungua bidhaa (na Maswali & Majibu).
            if (targetId && typeof window.openProduct === 'function') { window.openProduct(targetId); return; }
            if (typeof window.updateApp === 'function') { window.updateApp('market'); return; }
        }
    } catch(e) {
        console.error('NotifGo error:', e);
    }
};

// Tambua aina ya notification kutoka kwenye maneno (kwa taarifa za zamani zisizo na `type`)
window.skhInferNotifType = function(title, body) {
    const t = ((title || '') + ' ' + (body || '')).toLowerCase();
    if (t.includes('wallet') || t.includes('sokopay') || t.includes('kamisheni') || t.includes('imeingizwa') || t.includes('imepokelewa') || t.includes('malipo')) return 'wallet';
    if (t.includes('wakala') || t.includes('uwakala') || t.includes('umeingia kazini')) return 'agent';
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
                    const targetId = data.targetId ? skh.skhJsEsc(String(data.targetId)) : (data.negotiationId ? skh.skhJsEsc(String(data.negotiationId)) : (data.conversationId ? skh.skhJsEsc(String(data.conversationId)) : ''));
                    html += `
                    <div class="list-item skh-notif-item" onclick="window.skhNotifGo('${skh.skhJsEsc(ntype || '')}', '${targetId}')" style="cursor:pointer; ${data.read ? 'opacity:0.7;' : 'background:#f0f9ff;'}">
                        <div class="skh-notif-ico">${notifIco(ntype)}</div>
                        <div class="list-info">
                            <b>${skh.skhEscape(data.title || '')}</b>
                            <span style="color:#64748b; font-weight:normal; display:block; font-size:12px;">${skh.skhEscape(data.body || '')}</span>
                            <small style="font-size:10px; color:#94a3b8;">${skh.skhEscape(date)}</small>
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

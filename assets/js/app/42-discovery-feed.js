/* ==== js/app/42-discovery-feed.js ====
// ============================================================
// CONTINUOUS DISCOVERY (2026-09) — tangazo lililofunguliwa
// halikwami kama "bidhaa moja": mtumiaji anatelezesha juu/chini
// (au vifungo/vishale/vibonye) kuhamia tangazo linalofuata/la
// nyuma LA AINA HIYO HIYO, ndani ya muktadha wa soko alilomo.
//
// Kanuni:
//  - HAIUNDI mfumo mpya wa bidhaa/duka: urambazaji unaita
//    openProduct() ILIYOPO (live listener, cart, chat, variants,
//    Maoni, related rails zote zinaendelea kufanya kazi).
//  - Foleni inajengwa kutoka skh.cachedItems (tayari imechujwa na
//    renderFeedUI) + vichujio VILE VILE vya soko (collection,
//    activeCategory, activeServiceSection, activeDeliverySection).
//  - Haichanganyi aina ovyo: ukifungua bidhaa, watembea bidhaa;
//    huduma -> huduma; usafiri -> usafiri.
//  - Nafasi ya kusogeza ya kila tangazo inakumbukwa; picha ya
//    tangalo linalofuata inapakiwa kabla (preload); karibu na
//    mwisho wa foleni, soko la msingi linaombwa vipya zaidi
//    (tena, loadMainFeed ILIYOPO).
// ============================================================ */
import { skh } from './00-bootstrap.js';
import { resolveDiscoveryContext, createDiscoverySession, productAttributeMap, classifyProductMatches, listingOf } from './76-discover-foundation.js';

(function () { 'use strict';

    var D = {
        col: null,        // collection ya foleni ya sasa
        ids: [],          // mfuatano wa IDs (same collection/context)
        index: -1,
        tops: {},         // id -> scrollTop iliyokumbukwa
        visited: {},
        lock: false,      // zuia mipito ya haraka wakati wa animation
        wheelLock: false,
        moreRequested: false,
        start: null
    };
    skh.discovery = D;

    function norm(s) { return String(s == null ? '' : s).toLowerCase(); }

    /* ------------------ jenga foleni kutoka vitu vya soko ------------------
     * Mantiki hii ni TAKATIFU (inayopimika) — inafuata vichujio vya
     * renderFeedUI (00-bootstrap) bila kuibadili.
     * --------------------------------------------------------------------- */
    function buildQueue(items, ctx) {
        ctx = ctx || {};
        var col = ctx.collection || 'products';
        var cat = ctx.category ? String(ctx.category) : '';
        var sub = ctx.subCategory ? String(ctx.subCategory) : '';
        var serviceSec = ctx.serviceSection ? String(ctx.serviceSection) : 'all';
        var deliverySec = ctx.deliverySection ? String(ctx.deliverySection) : 'all';
        var filters = ctx.filters || null;
        var query = ctx.searchQuery ? String(ctx.searchQuery).trim().toLowerCase() : '';
        var out = [];
        (items || []).forEach(function (it) {
            if (!it || !it.id) return;
            var ic = it.collectionName || col;
            if (ic !== col) return;
            // Sehemu (huduma: physical/online/food/rental)
            if (col === 'services' && serviceSec && serviceSec !== 'all') {
                var sec = norm(it.section || it.groupType);
                if (sec !== norm(serviceSec)) return;
            }
            // Sehemu ya usafiri (Passenger/Product/Cargo/Emergency)
            if (col === 'drivers' && deliverySec && deliverySec !== 'all') {
                var ss0 = it.supportedServices || [];
                if (!ss0.some(function (s) { return norm(s) === norm(deliverySec); })) return;
            }
            // Kategoria kuu (kwa usafiri nayo iko supportedServices)
            if (cat && cat !== 'Zote' && cat !== 'all') {
                if (col === 'drivers') {
                    var ss1 = it.supportedServices || [];
                    if (!ss1.some(function (s) { return norm(s) === norm(cat); })) return;
                } else if (norm(it.category) !== norm(cat)) return;
            }
            // Kategoria ndogo (usafiri: vehicleType)
            if (sub && sub !== 'Zote' && sub !== 'all') {
                if (col === 'drivers') {
                    if (norm(it.vehicleType) !== norm(sub)) return;
                } else if (norm(it.subCategory) !== norm(sub)) return;
            }
            // Vigezo maalum (data.filters ramani)
            if (filters && Object.keys(filters).length) {
                if (!it.filters) return;
                var okF = true;
                Object.keys(filters).forEach(function (fk) {
                    if (!it.filters[fk] || norm(it.filters[fk]) !== norm(filters[fk])) okF = false;
                });
                if (!okF) return;
            }
            // Utafutaji (jina/maelezo/kategoria + vya usafiri)
            if (query) {
                var title = norm(it.title || it.driverName || it.company || '');
                var desc = norm(it.description || '');
                var icat = norm(it.category || '');
                var extra = norm((it.vehicleType || '') + ' ' + (Array.isArray(it.supportedServices) ? it.supportedServices.join(' ') : ''));
                if (title.indexOf(query) === -1 && desc.indexOf(query) === -1
                    && icat.indexOf(query) === -1 && extra.indexOf(query) === -1) return;
            }
            out.push(it.id);
        });
        return out;
    }
    window.skhDiscoveryBuildQueue = buildQueue;

    function currentContext(col) {
        return {
            collection: col,
            category: skh.activeCategory || '',
            subCategory: skh.activeSubCategory || '',
            serviceSection: skh.activeServiceSection || 'all',
            deliverySection: skh.activeDeliverySection || 'all',
            filters: skh.activeFilterValues || null,
            searchQuery: skh.searchQuery || ''
        };
    }

    // Kamilisha foleni endapo ID haipo kwenye cache (deep link, utafutaji).
    async function ensureFetched(col, id) {
        try {
            var q;
            var base = skh.collection(skh.db, col);
            try {
                q = skh.query(base, skh.orderBy('createdAt', 'desc'), skh.limit(120));
            } catch (e) { q = skh.query(base, skh.limit(120)); }
            var snap = await skh.getDocs(q);
            var items = [];
            snap.forEach(function (d) { items.push(Object.assign({ id: d.id, collectionName: col }, d.data())); });
            // Unganisha na cache bila kurudia
            var known = {};
            (skh.cachedItems || []).forEach(function (x) { known[x.collectionName + '/' + x.id] = 1; });
            items.forEach(function (x) {
                var k = col + '/' + x.id;
                if (!known[k]) skh.cachedItems.push(x);
            });
        } catch (e) { /* endelea na cache/iliyo nayo */ }
    }

    function rebuild(col) {
        var ids = buildQueue(skh.cachedItems || [], currentContext(col));
        D.col = col;
        D.ids = ids;
        return ids;
    }

    // Panga foleni kwa tangazo lililofunguliwa.
    async function syncTo(id, col) {
        if (!id) return;
        col = col || (function () {
            var inCache = (skh.cachedItems || []).filter(function (x) { return x.id === id; })[0];
            return (inCache && inCache.collectionName) || skh.currentFeedCollection || 'products';
        })();
        if (col === 'all') col = 'products';

        if (D.col !== col) rebuild(col);
        var pos = D.ids.indexOf(id);
        if (pos === -1) {
            // Labida limejengwa upya (kichujio kipya) au halipo kwenye cache.
            rebuild(col);
            pos = D.ids.indexOf(id);
        }
        if (pos === -1) {
            await ensureFetched(col, id);
            rebuild(col);
            pos = D.ids.indexOf(id);
        }
        if (pos === -1) {
            // Bado halipo (mf. tangazo la related nje ya chujio): weka baada
            // ya nafasi ya sasa ili "nyuma" irudi salama.
            var at = D.index >= 0 ? D.index + 1 : D.ids.length;
            D.ids.splice(at, 0, id);
            pos = at;
        }
        D.index = pos;
        updateNavUi();
        maybeLoadMore();
        preloadNeighbors();
    }

    /* ------------------ UI ------------------ */
    function sheet() { return document.querySelector('#productModal > .pm-sheet'); }
    function scrollEl() { return document.querySelector('#productModal .pm-scroll'); }

    function updateNavUi() {
        var count = document.getElementById('dfCount');
        var prev = document.getElementById('dfPrevBtn');
        var next = document.getElementById('dfNextBtn');
        if (count) count.textContent = D.ids.length ? (D.index + 1) + '/' + D.ids.length : '•';
        if (prev) prev.disabled = D.index <= 0;
        if (next) next.disabled = D.ids.length === 0 || D.index >= D.ids.length - 1;
    }

    function rememberScroll() {
        if (D.index < 0) return;
        var cur = D.ids[D.index];
        var sc = scrollEl();
        if (cur && sc) D.tops[cur] = sc.scrollTop;
    }

    function restoreScroll(id) {
        var sc = scrollEl();
        if (!sc) return;
        var top = D.tops[id] || 0;
        setTimeout(function () { try { sc.scrollTop = top; } catch (e) {} }, 70);
        setTimeout(function () { try { sc.scrollTop = D.tops[id] != null ? D.tops[id] : top; } catch (e) {} }, 220);
    }

    function animate(dir) {
        var sh = sheet();
        if (!sh) return;
        var cls = dir > 0 ? 'df-go-next' : 'df-go-prev';
        sh.classList.remove('df-go-next', 'df-go-prev');
        // reflow ili uhuishaji uruke tena
        void sh.offsetWidth;
        sh.classList.add(cls);
        setTimeout(function () { sh.classList.remove(cls); }, 320);
    }

    function preloadNeighbors() {
        var ids = D.ids;
        [-1, 1, 2].forEach(function (off) {
            var nid = ids[D.index + off];
            if (!nid) return;
            var item = (skh.cachedItems || []).filter(function (x) { return x.id === nid && x.collectionName === D.col; })[0];
            var url = item && (item.image || item.photo || (item.imagesArray && item.imagesArray[0]) || (item.images && item.images[0]));
            if (url && !/ui-avatars\.com/.test(String(url))) {
                try { var im = new Image(); im.src = url; } catch (e) {}
            }
        });
    }

    function maybeLoadMore() {
        if (D.moreRequested) return;
        if (D.ids.length - D.index <= 4) {
            D.moreRequested = true;
            try {
                skh.currentLimit = (skh.currentLimit || 100) + 30;
                // [§1-§5 R8 FILTERS] Discovery TRAIL IMESAKAA kutoku feed-card:
                // Ikiwa user nunaonekana kwa kuponjwa ya Home (all), loadMainFeed
                // BILA kukarabati would bed ya picha (mfadhiri omega kupotea feed).
                const curCol = skh.currentFeedCollection || 'all';
                if (D.col === curCol) skh.loadMainFeed(D.col);
            } catch (e) {}
            // Jengishe upya foleni baada ya muda wa kupakua.
            setTimeout(function () {
                var keepId = D.ids[D.index];
                var ids = buildQueue(skh.cachedItems || [], currentContext(D.col));
                if (ids.length > D.ids.length) { D.ids = ids; D.index = Math.max(0, ids.indexOf(keepId)); updateNavUi(); }
                D.moreRequested = false;
            }, 1600);
        }
    }

    window.skhDiscoveryMove = function (dir) {
        if (D.lock) return;
        var maoni = document.getElementById('maoniLayer');
        if (maoni && maoni.classList.contains('is-open')) return; // sharti Maoni yafungwe kwanza
        var modal = document.getElementById('productModal');
        if (!modal || modal.style.display === 'none') return;
        var target = D.ids[D.index + dir];
        if (!target) return;
        D.lock = true;
        // Kumbuka nafasi ya sasa; wrapper wa openProduct hufanya uhuishaji,
        // syncTo, urejeshaji wa scroll na preload.
        rememberScroll();
        try {
            Promise.resolve(window.openProduct(target, D.col)).catch(function () {});
        } catch (e) {}
        setTimeout(function () { D.lock = false; }, 320);
    };

    /* ------------------ ishara za kugusa/panya/kiibodi ------------------ */
    function gestures() {
        var hero = document.querySelector('#productModal .pm-hero');
        if (!hero || hero._dfReady) return;
        hero._dfReady = true;

        hero.addEventListener('touchstart', function (e) {
            var t = e.touches[0];
            D.start = { x: t.clientX, y: t.clientY, t: Date.now() };
        }, { passive: true });

        hero.addEventListener('touchend', function (e) {
            if (!D.start) return;
            var t = e.changedTouches[0];
            var dx = t.clientX - D.start.x;
            var dy = t.clientY - D.start.y;
            D.start = null;
            // Mlalo ni wa carousel ya picha; wima ni wa discovery.
            if (Math.abs(dy) < 52) return;
            if (Math.abs(dy) <= Math.abs(dx) * 1.1) return;
            // Usipitie vitufe/ikoni.
            if (e.target && e.target.closest && e.target.closest('button,a,input,.pm-image-slider')) return;
            window.skhDiscoveryMove(dy < 0 ? 1 : -1);
        }, { passive: true });

        // Wheel juu ya HERO (bado haina scroll yake) -> discovery moja kwa moja.
        hero.addEventListener('wheel', function (e) {
            if (Math.abs(e.deltaY) < 24) return;
            if (D.wheelLock) { e.preventDefault(); return; }
            if (!D.ids[D.index + (e.deltaY > 0 ? 1 : -1)]) return;
            D.wheelLock = true;
            window.skhDiscoveryMove(e.deltaY > 0 ? 1 : -1);
            setTimeout(function () { D.wheelLock = false; }, 700);
        }, { passive: false });

        // Wheel ndani ya MWILI: endelea na scroll ya kawaida, lakini ukishika
        // ukingo wa juu/chini, ruka tangazo linalofuata/la nyuma.
        var sc = scrollEl();
        if (sc && !sc._dfWheelReady) {
            sc._dfWheelReady = true;
            sc.addEventListener('wheel', function (e) {
                if (Math.abs(e.deltaY) < 20) return;
                if (D.wheelLock) { return; }
                var goingDown = e.deltaY > 0;
                var atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 8;
                var atTop = sc.scrollTop <= 4;
                if ((goingDown && atBottom) || (!goingDown && atTop)) {
                    var nid = D.ids[D.index + (goingDown ? 1 : -1)];
                    if (!nid) return;
                    e.preventDefault();
                    D.wheelLock = true;
                    window.skhDiscoveryMove(goingDown ? 1 : -1);
                    setTimeout(function () { D.wheelLock = false; }, 700);
                }
            }, { passive: false });
        }
    }

    document.addEventListener('keydown', function (e) {
        var modal = document.getElementById('productModal');
        if (!modal || modal.style.display === 'none') return;
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        var maoni = document.getElementById('maoniLayer');
        if (maoni && maoni.classList.contains('is-open')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); window.skhDiscoveryMove(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); window.skhDiscoveryMove(-1); }
    });

    /* ------------------ contextual product automation ------------------ */
    var session = window.skhDiscoverySession || (typeof createDiscoverySession === 'function' ? createDiscoverySession() : { current:null, stack:[], comparison:[], activate:function(c){this.current=c;return c}, back:function(){return null}, toggleCompare:function(){return[]} });
    window.skhDiscoverySession = session;
    function discoverySections(product) {
        var cache = (skh.cachedItems || []).filter(Boolean);
        var products = cache.filter(function (x) { return (x.collectionName || 'products') === 'products'; });
        if (product && !products.some(function (x) { return x.id === product.id; })) products.unshift(product);
        var q = String((product && (product.model || product.title)) || '');
        var qTokens = q.toLowerCase().split(/\s+/).filter(function (x) { return x.length > 2; });
        var related = products.filter(function (x) {
            if (x.id === product.id) return true;
            if (product.category && x.category === product.category) return true;
            if (product.brand && x.brand && String(x.brand).toLowerCase() === String(product.brand).toLowerCase()) return true;
            var title = String(x.title || '').toLowerCase();
            return qTokens.some(function (t) { return title.indexOf(t) !== -1; });
        }).slice(0, 120).map(function (x) {
            var E = window.SKH_DISCOVER_ENGINE;
            var l = E && E.buildDiscoverListing ? E.buildDiscoverListing(x, 'PRODUCT') : { entityId:x.id, entityType:'PRODUCT', title:x.title, categoryName:x.category, subCategory:x.subCategory, sellerId:x.userId||x.sellerId, businessId:x.businessId, businessName:x.businessName||x.storeName, sellerName:x.sellerName, price:x.price, location:x.location, region:x.region, availabilityStatus:x.availabilityStatus, saleMode:x.saleMode, raw:x };
            return { listing:l, score:x.id===product.id?100:1 };
        });
        function rows(col,type,predicate){return cache.filter(function(x){return x.collectionName===col&&(!predicate||predicate(x));}).slice(0,60).map(function(x){return{listing:{entityId:x.id,entityType:type,title:x.title||x.name,categoryName:x.category,subCategory:x.subCategory,sellerId:x.userId,price:x.price,location:x.location||x.pickupRegion,region:x.region||x.pickupRegion,raw:x},score:1}})}
        var productTerms=[product.category,product.subCategory,product.brand].concat(qTokens).filter(Boolean).map(function(x){return String(x).toLowerCase()});
        var productPlaces=[product.location,product.region,product.city,product.businessLocation&&product.businessLocation.formattedAddress].filter(Boolean).map(function(x){return String(x).toLowerCase()});
        var services=rows('services','SERVICE',function(x){var hay=String([x.title,x.category,x.subCategory,x.description].join(' ')).toLowerCase();return productTerms.some(function(t){return t.length>2&&hay.indexOf(t)!==-1})});
        var transport=rows('drivers','TRANSPORTER',function(x){if(!(product.deliveryAvailable||product.deliveryOptions||product.pickupAvailable))return false;var hay=String([x.location,x.region,x.pickupRegion,x.destinationRegion,x.coverageArea].join(' ')).toLowerCase();return productPlaces.some(function(p){return p&&hay.indexOf(p)!==-1})});
        return {products:related,services:services,transporters:transport,businesses:[],people:[],groups:[],onlineSellers:[],offlineSellers:[]};
    }
    function serviceDiscoverySections(service) {
        var cache=(skh.cachedItems||[]).filter(Boolean),E=window.SKH_DISCOVER_ENGINE;
        function wrap(x,type){var l=E&&E.buildDiscoverListing?E.buildDiscoverListing(x,type):{entityId:x.id,entityType:type,title:x.title,categoryName:x.category,subCategory:x.subCategory,sellerId:x.userId||x.providerId,providerId:x.providerId||x.userId,businessId:x.businessId||null,businessName:x.businessName||'',price:x.price,location:x.location,availabilityStatus:x.availabilityStatus,serviceType:x.serviceType||x.subCategory,pricingModel:x.pricingModel,serviceAreas:x.serviceAreas||x.coverageAreas||x.serviceArea||[],travelAvailable:x.travelAvailable===true,raw:x};return{listing:l,score:x.id===service.id?100:1}}
        var terms=[service.category,service.subCategory,service.serviceType,service.specialization].concat(Object.values(service.filters||{})).filter(function(x){return String(x).length>2}).map(function(x){return norm(x)});
        var services=cache.filter(function(x){if((x.collectionName||'')!=='services')return false;if(x.id===service.id)return true;var hay=norm([x.title,x.category,x.subCategory,x.serviceType,x.specialization,JSON.stringify(x.filters||{})].join(' '));return (service.category&&x.category===service.category)||terms.some(function(t){return hay.indexOf(t)!==-1})}).slice(0,120).map(function(x){return wrap(x,'SERVICE')});
        if(!services.some(function(x){return x.listing.entityId===service.id}))services.unshift(wrap(service,'SERVICE'));
        var products=cache.filter(function(x){if((x.collectionName||'products')!=='products')return false;var hay=norm([x.title,x.category,x.subCategory,x.brand,x.model,JSON.stringify(x.filters||{})].join(' '));var explicit=(service.relatedProductIds||[]).indexOf(x.id)!==-1;return explicit||terms.some(function(t){return hay.indexOf(t)!==-1})}).slice(0,60).map(function(x){return wrap(x,'PRODUCT')});
        var places=[service.location].concat(service.serviceAreas||service.coverageAreas||[]).filter(Boolean).map(norm),canTravel=service.travelAvailable===true||service.homeVisit===true||service.onSite===true||service.onsite===true||service.travelRadiusKm!=null;
        var transporters=canTravel?cache.filter(function(x){if(x.collectionName!=='drivers')return false;var hay=norm([x.location,x.region,x.pickupRegion,x.destinationRegion,x.coverageArea].join(' '));return places.some(function(p){return p&&hay.indexOf(p)!==-1})}).slice(0,40).map(function(x){return wrap(x,'TRANSPORTER')}):[];
        return{products:products,services:services,transporters:transporters,businesses:[],people:[],groups:[],onlineSellers:[],offlineSellers:[]};
    }
    function injectAutomationCss(){if(document.getElementById('product-discovery-automation-css'))return;var s=document.createElement('style');s.id='product-discovery-automation-css';s.textContent='@media(min-width:901px){#productModal.pm-overlay{align-items:stretch!important;justify-content:center!important;gap:14px!important;padding:14px!important}#productModal>.pm-sheet{margin:0!important;height:calc(100dvh - 28px)!important}.pda-side{display:block;width:278px;height:calc(100dvh - 28px);overflow:auto;background:#fff;border:1px solid #dce8e3;border-radius:20px;padding:14px;box-shadow:0 16px 40px rgba(23,53,45,.14)}}.pda-side{color:#17352d}.pda-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:12px}.pda-head b{font-size:13px}.pda-close{display:none}.pda-group{border-top:1px solid #e7efec;padding:11px 0}.pda-group h4{margin:0 0 7px;color:#6b8079;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.pda-btn{display:flex;width:100%;justify-content:space-between;gap:8px;border:0;background:transparent;border-radius:9px;padding:8px;color:#244a40;font-weight:750;font-size:12px;text-align:left}.pda-btn:hover{background:#e7f6f0;color:#087b5a}.pda-trigger{display:none;position:absolute;z-index:20;top:62px;left:12px;border:0;border-radius:999px;background:#17352d;color:#fff;padding:9px 12px;font-weight:850;box-shadow:0 5px 15px #17352d44}.pda-shade{display:none}@media(max-width:900px){.pda-trigger{display:block}.pda-side{display:block;position:fixed;z-index:12020;left:0;top:0;bottom:0;width:min(88vw,330px);padding:16px;overflow:auto;background:#fff;transform:translateX(-105%);transition:transform .22s ease;box-shadow:14px 0 35px #17352d44}.pda-side.show{transform:translateX(0)}.pda-close{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;background:#edf4f1}.pda-shade{position:fixed;inset:0;z-index:12010;background:#112d2566}.pda-shade.show{display:block}}';document.head.appendChild(s)}
    function pdaEsc(v){return skh.skhEscape(String(v==null?'':v))}function pdaAttr(v){return pdaEsc(v).replace(/`/g,'&#96;')}
    function pdaButton(label,attrs,count){return '<button type="button" class="pda-btn" '+attrs+'><span>'+pdaEsc(label)+'</span>'+(count!=null?'<small>'+Number(count)+'</small>':'')+'</button>'}
    function mountAutomation(product,col){if(!product||(col!=='products'&&col!=='services'))return;var isService=col==='services';injectAutomationCss();var sections=isService?serviceDiscoverySections(product):discoverySections(product),pool=isService?sections.services:sections.products,listing=pool.filter(function(x){return x.listing.entityId===product.id})[0]||{listing:product},ctx=resolveDiscoveryContext({query:(isService?(product.serviceType||product.subCategory):product.model)||product.title,activeEntity:listing,activeEntityType:isService?'SERVICE':'PRODUCT',sections:sections,state:{entityType:isService?'services':'products'}});var backNav=window.__skhDiscoveryBackNavigation===true;window.__skhDiscoveryBackNavigation=false;session.activate(ctx,{replace:backNav||(session.current&&session.current.activeEntity&&session.current.activeEntity.entityId===product.id)});var modal=document.getElementById('productModal'),old=document.getElementById('productDiscoveryAutomation');if(old)old.remove();var shade=document.getElementById('productDiscoveryShade');if(!shade){shade=document.createElement('div');shade.id='productDiscoveryShade';shade.className='pda-shade';modal.appendChild(shade)}var side=document.createElement('aside');side.id='productDiscoveryAutomation';side.className='pda-side';var layers=ctx.hierarchy||{},attrs=ctx.attributes||{},html='<div class="pda-head"><div><b>DISCOVER</b><small style="display:block;color:#789089;margin-top:3px">'+pdaEsc(product.title||'')+'</small></div><button class="pda-close" data-pda-close>×</button></div>';if(session.stack.length)html+=pdaButton('Back one level','data-pda-back="1"');
        function group(name,items){if(items.length)html+='<section class="pda-group"><h4>'+name+'</h4>'+items.join('')+'</section>'}
        group(isService?'Service hierarchy':'Product hierarchy',Object.keys(layers).filter(function(k){return layers[k].length}).map(function(k){var labels={serviceType:'Service type',specialization:'Specialization',supportService:'Support service',alternative:'Alternative'};return pdaButton(labels[k]||k,'data-pda-layer="'+k+'"',layers[k].length)}));
        Object.keys(attrs).slice(0,9).forEach(function(k){group(k,attrs[k].slice(0,7).map(function(v){return pdaButton(v,'data-pda-attr="'+pdaAttr(k)+'" data-pda-value="'+pdaAttr(v)+'"') }))});
        var eco=[];if(ctx.counts.providers)eco.push(pdaButton('Providers','data-pda-entity="providers"',ctx.counts.providers));if(ctx.counts.sellers)eco.push(pdaButton('Sellers','data-pda-entity="sellers"',ctx.counts.sellers));if(isService&&ctx.counts.products)eco.push(pdaButton('Related products','data-pda-entity="products"',ctx.counts.products));if(ctx.locations.length)eco.push(pdaButton('Locations','data-pda-entity="products"',ctx.locations.length));if(ctx.counts.transporters)eco.push(pdaButton('Transport / Routes','data-pda-entity="transporters"',ctx.counts.transporters));if(ctx.counts.deals)eco.push(pdaButton('Deals','data-pda-entity="offers"',ctx.counts.deals));if(ctx.counts.groupBuy)eco.push(pdaButton('Group Buy','data-pda-entity="group_buy"',ctx.counts.groupBuy));if(ctx.counts.auctions)eco.push(pdaButton('Auction','data-pda-entity="auction"',ctx.counts.auctions));group('Real ecosystem',eco);html+='<section class="pda-group">'+pdaButton(isService?'Compare this service':'Compare this product','data-pda-compare="1"')+'</section>';side.innerHTML=html;modal.insertBefore(side,modal.querySelector('.pm-sheet'));var trigger=document.getElementById('productDiscoveryTrigger');if(!trigger){trigger=document.createElement('button');trigger.id='productDiscoveryTrigger';trigger.className='pda-trigger';trigger.type='button';trigger.textContent='Discover';modal.appendChild(trigger)}}
    window.skhActivateDiscoveryContext=function(entity,col){mountAutomation(entity,col||entity.collectionName||'products')};window.skhActivateProductDiscovery=window.skhActivateDiscoveryContext;
    document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-pda-close],#productDiscoveryTrigger,#productDiscoveryShade,[data-pda-layer],[data-pda-attr],[data-pda-entity],[data-pda-compare],[data-pda-back]');if(!t)return;var side=document.getElementById('productDiscoveryAutomation'),shade=document.getElementById('productDiscoveryShade');if(t.id==='productDiscoveryTrigger'){side&&side.classList.add('show');shade&&shade.classList.add('show');return}if(t.hasAttribute('data-pda-close')||t.id==='productDiscoveryShade'){side&&side.classList.remove('show');shade&&shade.classList.remove('show');return}if(t.hasAttribute('data-pda-back')){var prev=session.back();if(!prev)return;if(prev.activeEntity&&prev.activeEntity.entityId&&window.openProduct){window.__skhDiscoveryBackNavigation=true;window.openProduct(prev.activeEntity.entityId,prev.activeEntity.entityType==='SERVICE'?'services':prev.activeEntity.entityType==='TRANSPORTER'?'drivers':'products')}else if(window.skhDiscoverEngineOpen)window.skhDiscoverEngineOpen(prev.query,prev.state||{});return}var cur=session.current||{},next={query:cur.query||'',entityType:t.dataset.pdaEntity||'products'};if(t.dataset.pdaLayer)next.matchLayer=t.dataset.pdaLayer;if(t.dataset.pdaAttr)next.attributes={[t.dataset.pdaAttr]:t.dataset.pdaValue};if(t.hasAttribute('data-pda-compare')){session.toggleCompare({listing:cur.activeEntity});next.entityType=cur.activeEntityType==='SERVICE'?'services':'products'}if(window.skhDiscoveryApply)window.skhDiscoveryApply(next)},true);

    // Provider/business profile openings join the same context stack. Identity is
    // derived only from public listing ownership already present in the cache.
    function installAccountContextWrapper(){var orig=window.openSellerProfile;if(typeof orig!=='function'||orig.__skhDiscoveryContextWrapped)return;window.openSellerProfile=function(uid,name){try{var cache=(skh.cachedItems||[]).filter(Boolean),ownedServices=cache.filter(function(x){return x.collectionName==='services'&&(x.providerId===uid||x.userId===uid)}),ownedProducts=cache.filter(function(x){return (x.collectionName||'products')==='products'&&(x.userId===uid||x.sellerId===uid)}),seed=ownedServices[0]||ownedProducts[0],sections=seed&&ownedServices.length?serviceDiscoverySections(seed):seed?discoverySections(seed):{products:[],services:[],transporters:[],businesses:[],people:[],groups:[],onlineSellers:[],offlineSellers:[]},type=ownedServices.length?'PROVIDER':'BUSINESS',active={listing:{entityId:uid,entityType:type,title:name||(seed&&(seed.businessName||seed.ownerName))||'Profile',sellerId:uid,providerId:ownedServices.length?uid:null,businessId:seed&&seed.businessId||null,raw:{}}};session.activate(resolveDiscoveryContext({query:active.listing.title,activeEntity:active,activeEntityType:type,sections:sections,state:{entityType:ownedServices.length?'providers':'businesses'}}));}catch(e){}return orig.apply(this,arguments)};window.openSellerProfile.__skhDiscoveryContextWrapped=true;}
    installAccountContextWrapper();

    /* ------------------ kaza openProduct ILIYOPO (wrapper) ------------------ */
    var baseOpen = null;
    function installWrapper() {
        if (baseOpen || typeof window.openProduct !== 'function') return;
        baseOpen = window.openProduct;
        window.openProduct = async function (id, col) {
            var before = D.ids[D.index];
            var beforeIdx = D.index;
            if (before && before !== id) {
                rememberScroll(); D.visited[before] = true;
                // Safisha rasilimali za video za tangazo linaloachwa.
                try {
                    var oldVids = document.querySelectorAll('#pmImgWrapper video');
                    Array.prototype.forEach.call(oldVids, function (v) {
                        try { v.pause(); v.removeAttribute('autoplay'); } catch (e) {}
                    });
                } catch (e) {}
                // Kama Maoni yalikuwa wazi, yafunge kwa tangazo jipya.
                var ml = document.getElementById('maoniLayer');
                if (ml && !ml.hidden && typeof window.skhCloseMaoni === 'function') window.skhCloseMaoni();
            }
            var r = await baseOpen.apply(this, arguments);
            var usedCol = col;
            if (!usedCol) {
                var inCache = (skh.cachedItems || []).filter(function (x) { return x.id === id; })[0];
                usedCol = (inCache && inCache.collectionName) || skh.currentFeedCollection || 'products';
            }
            if (usedCol === 'all') usedCol = 'products';
            await syncTo(id, usedCol);
            // Mwelekeo wa uhuishaji ukilinganisha na nafasi mpya.
            if (before && before !== id) {
                animate(beforeIdx >= 0 && D.index > beforeIdx ? 1 : -1);
            }
            // Rejesha scroll iliyokumbukwa; tangazo jipya laanza juu.
            if (D.visited[id]) restoreScroll(id);
            else { var sc = scrollEl(); if (sc) sc.scrollTop = 0; }
            gestures();
            return r;
        };
    }
    // openProduct ya 07-product.js huwa imeshawekwa wakati moduli hii inapakia
    // (mpangilio wa script), lakini tumia njia mbili za usalama.
    installWrapper();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installWrapper);
    else setTimeout(installWrapper, 0);
})();

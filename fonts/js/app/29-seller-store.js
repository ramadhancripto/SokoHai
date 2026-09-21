/* ==== js/app/29-seller-store.js ==== */
// ============================================================
// PUBLIC SELLER PROFILE — duka la muuzaji (mini storefront)
// ------------------------------------------------------------
// Kanuni: ADDITIVE tu. Hii ni sehemu ya safari ya mnunuzi:
//   Product -> (bofya jina la muuzaji) -> Seller Profile ->
//   All Products -> (chagua bidhaa nyingine) -> Like / Save / Buy / Follow
// Data zote za uaminifu (rating, orders, followers) zinatoka kwenye
// backend halisi — hakuna namba za kutungwa.
// ============================================================
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    var P = null; // data ya profile inayoonyeshwa sasa
    var P_TAB = 'store';
    var P_Q = '';      // search
    var P_CAT = '';    // category filter
    var P_SORT = 'newest';

    function esc(s) { return skh.skhEscape(s == null ? '' : String(s)); }
    function js(s) { return skh.skhJsEsc(s == null ? '' : String(s)); }
    function tzs(n) { return 'TSh ' + Number(n || 0).toLocaleString(); }
    function snapExists(s) { try { return !!(s && (typeof s.exists === 'function' ? s.exists() : s.exists)); } catch (e) { return false; } }
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
    function starSvg(c) { return '<svg viewBox="0 0 24 24" fill="' + c + '" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>'; }

    async function getSellerDoc(uid) {
        if (!uid) return null;
        try {
            var d = await skh.getDoc(skh.doc(skh.db, 'users', uid));
            if (snapExists(d)) return d.data();
        } catch (e) {}
        return null;
    }

    async function getFollowers(uid) {
        try {
            var q = skh.query(skh.collection(skh.db, 'sellerFollowers'), skh.where('sellerId', '==', uid), skh.limit(500));
            var s = await skh.getDocs(q);
            return s.size || 0;
        } catch (e) { return 0; }
    }

    async function getProducts(uid) {
        var list = [];
        try {
            // [FIX 2026-09] Hakuna orderBy — inaepuka hitaji la composite index; panga hapa.
            var q = skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', uid), skh.limit(120));
            var s = await skh.getDocs(q);
            s.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
            list.sort(function (a, b) { return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0); });
        } catch (e) {}
        return list;
    }

    async function getOrdersAgg(uid) {
        var agg = { success: 0, total: 0, byProduct: {} };
        try {
            var q = skh.query(skh.collection(skh.db, 'orders'), skh.where('sellerId', '==', uid), skh.limit(300));
            var s = await skh.getDocs(q);
            s.forEach(function (d) {
                var o = d.data();
                agg.total++;
                var st = String(o.status || '').toLowerCase();
                if (['completed', 'delivered', 'paid', 'delivered_confirmed', 'shipped'].indexOf(st) !== -1) agg.success++;
                (o.items || []).forEach(function (it) {
                    var pid = it.productId || it.id;
                    if (!pid) return;
                    var qty = Number(it.qty || it.quantity || 1) || 1;
                    agg.byProduct[pid] = (agg.byProduct[pid] || 0) + qty;
                });
            });
        } catch (e) {}
        return agg;
    }

    // Rating ya muuzaji = wastani wa ratings kwenye comments za bidhaa zake (data halisi)
    function ratingFromProducts(products) {
        var sum = 0, n = 0;
        products.forEach(function (p) {
            (p.comments || []).forEach(function (c) {
                var r = Number(c.rating || 0);
                if (r > 0) { sum += r; n++; }
            });
        });
        return { avg: n ? (sum / n) : 0, count: n };
    }

    window.openSellerProfile = async function (sellerUid, sellerName) {
        if (!sellerUid) { alert(T('sst_no_seller', 'Seller information is unavailable.')); return; }
        var m = document.getElementById('sellerProfileModal');
        if (!m) return;
        if (typeof closeModals === 'function') closeModals();
        m.style.display = 'flex';
        var body = document.getElementById('sellerProfileBody');
        if (body) body.innerHTML = '<p style="text-align:center;color:#64748b;padding:50px;">' + T('sst_loading_store', 'Loading store...') + '</p>';

        P_TAB = 'store'; P_Q = ''; P_CAT = ''; P_SORT = 'newest';

        var seller = await getSellerDoc(sellerUid);
        var followers = await getFollowers(sellerUid);
        var products = await getProducts(sellerUid);
        var ordersAgg = await getOrdersAgg(sellerUid);
        var rating = ratingFromProducts(products);

        var name = sellerName || (seller && (seller.storeName || seller.fullName || seller.displayName)) || T('eng_seller', 'Seller');
        var loc = (seller && (seller.location || seller.region || seller.city)) || 'Tanzania';
        var memberSince = seller && (seller.memberSince || seller.createdAt);
        var verified = !!(seller && (seller.verificationStatus === 'verified' || seller.verified === true));
        // [MY-PROFILE 2026-09-16] DP = picha ya MTU kwanza (photoURL/profileImage),
        // logo ya duka ni fallback TU — usichanganye identity za brief §1/§9.
        var logo = (seller && (seller.photoURL || seller.profileImage || seller.dp || seller.logo)) || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=03509d&color=ffffff');
        var cover = (seller && seller.coverImage) || '';
        var about = (seller && (seller.about || seller.bio || seller.description)) || '';

        products.forEach(function (p) { p.unitsSold = ordersAgg.byProduct[p.id] || 0; });
        var deals = products.filter(function (p) { return p.saleMode === 'price_drop' || p.saleMode === 'group_buy' || p.isDeal; });

        var fulfillment = ordersAgg.total ? Math.round((ordersAgg.success / ordersAgg.total) * 100) : null;
        var ratingTxt = rating.count ? (rating.avg.toFixed(1) + ' / 5') : T('sst_no_rating', 'No ratings yet');

        P = {
            uid: sellerUid, name: name, loc: loc, memberSince: memberSince, verified: verified,
            logo: logo, cover: cover, about: about, followers: followers,
            successOrders: ordersAgg.success, totalOrders: ordersAgg.total,
            fulfillment: fulfillment, rating: rating, ratingTxt: ratingTxt,
            products: products, deals: deals
        };

        window.skhRenderSellerProfile();
    };

    function profHeader() {
        // [MY-PROFILE 2026-09-16] Header ya kisasa: cover, DP circular overlapping,
        // jina/verified centered, stats row, Follow + Chat. Preach ya brief §4.
        var coverHtml = P.cover
            ? '<div style="height:140px;background:url(' + esc(P.cover) + ') center/cover no-repeat;background-color:#e2e8f0;"></div>'
            : '<div style="height:140px;background:linear-gradient(135deg,#0B4F7A,#1268A8 60%,#2B82BD);"></div>';
        var since = P.memberSince ? '<span style="font-size:13px;color:#64748b;">' + T('sst_member_since', 'Member since') + ' ' + esc(new Date(P.memberSince).getFullYear()) + '</span>' : '';
        var trustRow = P.fulfillment != null
            ? '<span style="font-size:13px;color:#0f172a;">' + T('sst_completion_rate', 'Completion rate') + ': <b>' + P.fulfillment + '%</b></span>' : '';
        var verifiedBadge = P.verified ? '<span style="font-size:12.5px;background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:10px;font-weight:800;">✓ ' + T('verified', 'Verified') + '</span>' : '';
        return `
        ${coverHtml}
        <div style="padding:0 16px 14px; background:white; border-radius:0 0 14px 14px; margin-bottom:10px; position:relative; text-align:center;"> <img src="${esc(P.logo)}" onerror="this.src='https://ui-avatars.com/api/?name=Store&background=03509d&color=ffffff'" style="width:82px;height:82px;border-radius:50%;border:4px solid white;background:#f1f5f9;object-fit:cover;box-shadow:0 4px 10px rgba(0,0,0,0.15);margin-top:-41px;display:inline-block;"> <div style="margin-top:6px;"> <b style="font-size:17px;color:#0f172a;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;">${esc(P.name)} ${verifiedBadge}</b> <div style="font-size:12px;color:#475569;margin-top:2px;">${esc(P.loc)} ${since ? '· ' + since : ''}</div> <div style="display:flex;gap:14px;margin-top:9px;flex-wrap:wrap;font-size:12px;justify-content:center;"> <span style="color:#f59e0b;font-weight:800;">${starSvg('#f59e0b')} ${esc(P.ratingTxt)}</span> <span><b id="spFollowers">${P.followers}</b> ${T('sst_followers', 'Followers')}</span> <span><b>${P.successOrders}</b> ${T('pm_completed_orders', 'Completed Orders')}</span>
                    ${trustRow}
                </div> <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;"> <button id="spFollowBtn" onclick="window.skhProfileFollow()" class="follow-btn btn-not-following" style="flex:1;max-width:170px;">${T('eng_follow', 'Follow')}</button> <button onclick="window.openChatWithUser && window.openChatWithUser('${js(P.uid)}', '${js(P.name)}')" style="flex:1;max-width:170px;padding:10px 14px;background:#1268A8;color:#fff;border:none;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;">Chat</button> </div> </div> </div>`;
    }

    function profTabs() {
        var tabs = [['store', T('sst_tab_store', 'Store')], ['products', T('sst_tab_products', 'Products')], ['deals', T('sst_tab_deals', 'Deals')], ['reviews', T('sst_tab_reviews', 'Reviews')], ['about', T('sst_tab_about', 'About')]];
        return `<div style="display:flex;gap:6px;padding:0 12px 10px;overflow-x:auto;">
            ${tabs.map(function (t) {
                var active = P_TAB === t[0];
                return `<button class="skh-mytab" onclick="window.skhSellerProfileTab('${t[0]}', this)" style="flex:1;min-width:70px;padding:9px 6px;background:${active ? '#001122' : '#e2e8f0'};color:${active ? '#fff' : '#334155'};border:none;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap;">${t[1]}</button>`;
            }).join('')}
        </div>`;
    }

    function cardGrid(list) {
        if (!list.length) return '<p style="text-align:center;color:#64748b;padding:30px;">' + T('sst_no_products_here', 'No products in this section.') + '</p>';
        return `<div class="feed-grid" style="padding:4px 12px 20px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));">
            ${list.map(function (p) {
                var img = esc(p.image || 'https://ui-avatars.com/api/?name=Bidhaa&background=f1f5f9&color=64748b');
                return `<div class="feed-card-box" onclick="openProduct('${js(p.id)}','products')"> <div class="feed-img-box"><img src="${img}" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=Bidhaa&background=f1f5f9&color=64748b'"></div> <div class="feed-info-box"> <b>${esc(p.title || T('products', 'Products'))}</b> <span class="price" style="color:var(--terracotta);font-weight:900;">${tzs(p.price)}</span> <div class="stats-row"><small>${p.views || 0} ${T('sst_views', 'views')}</small><small>${p.unitsSold || 0} ${T('sst_sold', 'sold')}</small></div> </div> </div>`;
            }).join('')}
        </div>`;
    }

    window.skhSellerProfileTab = function (tab, el) {
        P_TAB = tab;
        var btns = document.querySelectorAll('#sellerProfileModal .skh-mytab');
        if (btns) btns.forEach(function (b) { b.style.background = '#e2e8f0'; b.style.color = '#334155'; });
        if (el) { el.style.background = '#001122'; el.style.color = '#fff'; }
        window.skhRenderSellerProfile();
    };

    window.skhProfileFollow = function () {
        if (!P) return;
        var btn = document.getElementById('spFollowBtn');
        var f = document.getElementById('spFollowers');
        window.skhToggleFollowSeller(P.uid, P.name, btn);
        setTimeout(function () {
            if (window.skhEngagementState && window.skhEngagementState.following && window.skhEngagementState.following[P.uid]) {
                P.followers = (P.followers || 0);
                if (f) f.innerText = P.followers;
            }
        }, 300);
    };

    window.skhRenderSellerProfile = function () {
        var body = document.getElementById('sellerProfileBody');
        if (!body || !P) return;
        var html = '';
        html += `<div style="position:sticky;top:0;z-index:20;background:#f4f7fa;padding:8px 12px;display:flex;justify-content:flex-end;"> <button onclick="document.getElementById('sellerProfileModal').style.display='none'" style="background:#001122;border:none;color:white;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;">&#10005;</button> </div>`;
        html += profHeader();
        html += profTabs();

        if (P_TAB === 'store') {
            html += `<div style="padding:0 12px 20px;"> <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:10px;"> <b style="font-size:12px;color:#0f172a;display:block;margin-bottom:8px;text-transform:uppercase;">${T('sst_trust', 'Seller Trust')}</b> <div style="font-size:12px;color:#334155;line-height:1.9;"> <div>${P.verified ? '<span style="color:#16a34a;font-weight:800;">' + T('sst_verified_seller', 'Verified Seller') + '</span>' : '<span style="color:#94a3b8;">' + T('sst_not_verified', 'Not verified yet') + '</span>'}</div> <div>${T('pm_completed_orders', 'Completed Orders')}: <b>${P.successOrders}</b></div>
                        ${P.fulfillment != null ? '<div>' + T('sst_completion_rate', 'Completion rate') + ': <b>' + P.fulfillment + '%</b></div>' : ''}
                        <div>${T('sst_buyer_rating', 'Buyer rating')}: <b>${esc(P.ratingTxt)}</b> (${T('sst_ratings_count', '{n} ratings', { n: P.rating.count })})</div>
                        ${P.memberSince ? '<div>' + T('sst_member_since', 'Member since') + ': <b>' + new Date(P.memberSince).getFullYear() + '</b></div>' : ''}
                    </div> </div> <b style="font-size:12px;color:#0f172a;display:block;margin:6px 2px 8px;text-transform:uppercase;">${T('sst_featured', 'Featured')}</b>
                ${cardGrid(P.products.slice(0, 4))}
            </div>`;
        } else if (P_TAB === 'products') {
            var cats = {};
            P.products.forEach(function (p) { if (p.category) cats[p.category] = true; });
            var catKeys = Object.keys(cats);
            html += `<div style="padding:0 12px 12px;"> <input id="spSearch" oninput="window.skhProfileSearch(this.value)" placeholder="${T('sst_search_ph', 'Search this store...')}" value="${esc(P_Q)}" style="width:100%;box-sizing:border-box;padding:11px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;margin-bottom:8px;outline:none;"> <div style="display:flex;gap:6px;margin-bottom:8px;overflow-x:auto;"> <select id="spCat" onchange="window.skhProfileCat(this.value)" style="flex:1;min-width:120px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="">${T('smp_all_categories', 'All categories')}</option>
                        ${catKeys.map(function (c) { return '<option value="' + esc(c) + '" ' + (P_CAT === c ? 'selected' : '') + '>' + esc(c) + '</option>'; }).join('')}
                    </select> <select id="spSort" onchange="window.skhProfileSort(this.value)" style="flex:1;min-width:110px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:12px;background:white;"> <option value="newest" ${P_SORT === 'newest' ? 'selected' : ''}>${T('smp_newest', 'Newest')}</option> <option value="best" ${P_SORT === 'best' ? 'selected' : ''}>${T('smp_best', 'Best selling')}</option> <option value="deals" ${P_SORT === 'deals' ? 'selected' : ''}>${T('sst_tab_deals', 'Deals')}</option> </select> </div> <div id="spProductsGrid"></div> </div>`;
            html += '<div style="height:1px;"></div>';
        } else if (P_TAB === 'deals') {
            html += `<div style="padding:0 12px 20px;">${cardGrid(P.deals)}</div>`;
        } else if (P_TAB === 'reviews') {
            var reviews = [];
            P.products.forEach(function (p) {
                (p.comments || []).forEach(function (c) {
                    if (c.text || c.comment) reviews.push(c);
                });
            });
            html += `<div style="padding:0 12px 20px;">
                ${reviews.length ? reviews.map(function (c) {
                    var stars = '';
                    for (var i = 0; i < Number(c.rating || 5); i++) stars += starSvg('#f59e0b');
                    return `<div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:8px;"> <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"> <b style="font-size:12px;color:#0f172a;">${esc(c.authorName || T('sst_customer', 'Customer'))}</b> <span style="font-size:12.5px;color:#94a3b8;">${esc(new Date(c.timestamp).toLocaleDateString(window.SokoHaiLMS && window.SokoHaiLMS.lang === 'en' ? 'en-GB' : 'sw-TZ'))}</span> </div> <div style="margin-bottom:4px;">${stars}</div> <p style="margin:0;font-size:13px;color:#334155;">${esc(c.text || c.comment)}</p> </div>`;
                }).join('') : '<p style="text-align:center;color:#64748b;padding:30px;">' + T('sst_no_reviews', 'No reviews yet.') + '</p>'}
            </div>`;
        } else if (P_TAB === 'about') {
            html += `<div style="padding:0 12px 20px;"> <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;"> <b style="font-size:12px;color:#0f172a;display:block;margin-bottom:8px;text-transform:uppercase;">${T('sst_about_store', 'About Store')}</b> <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">${esc(P.about || T('sst_no_about', 'This seller has not written a store description yet.'))}</p> </div> </div>`;
        }

        body.innerHTML = html;
        // Jaza grid ya products baada ya render (kwa filters/sort)
        var grid = document.getElementById('spProductsGrid');
        if (grid) grid.innerHTML = window.skhProfileFilteredProducts();
    };

    window.skhProfileSearch = function (q) { P_Q = q; var g = document.getElementById('spProductsGrid'); if (g) g.innerHTML = window.skhProfileFilteredProducts(); };
    window.skhProfileCat = function (c) { P_CAT = c; var g = document.getElementById('spProductsGrid'); if (g) g.innerHTML = window.skhProfileFilteredProducts(); };
    window.skhProfileSort = function (s) { P_SORT = s; var g = document.getElementById('spProductsGrid'); if (g) g.innerHTML = window.skhProfileFilteredProducts(); };

    window.skhProfileFilteredProducts = function () {
        if (!P) return '';
        var list = P.products.slice();
        if (P_Q) { var q = P_Q.toLowerCase(); list = list.filter(function (p) { return String(p.title || '').toLowerCase().indexOf(q) !== -1; }); }
        if (P_CAT) list = list.filter(function (p) { return p.category === P_CAT; });
        if (P_SORT === 'newest') list.sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
        else if (P_SORT === 'best') list.sort(function (a, b) { return (b.unitsSold || 0) - (a.unitsSold || 0); });
        else if (P_SORT === 'deals') list = list.filter(function (p) { return p.saleMode === 'price_drop' || p.saleMode === 'group_buy' || p.isDeal; });
        return cardGrid(list);
    };
})();

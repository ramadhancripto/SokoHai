/* ==== js/app/64-my-profile.js ====
   =======================================================================
   SOKOHAI — MY PROFILE (Professional Identity + Business Cover)
   -----------------------------------------------------------------------
    SABABU YA KUJENGW:
   - `window.openProfile` awali ilikuwa ALERT tupu ("YOUR PROFILE ...") —
     hiyo ni INTERACTION BROKEN (user anabonyeza "Profile" kwenye menu
     akaona raw alert text bila muundo wala vitendo).
   - Container ya `coverImage` (user doc) ILIPO tayari ila hakukuwa na
     UPLOAD path wala API yake — mteja aliuliza Professional Profile.

   SHERIA (mpango wa mteja, ulioheshimiwa 100%):
   - DP        = picha ya MTU (photoURL/profileImage) — HAISI cover.
   - Cover     = picha ya BIASHARA/MAZINGIRA (coverImage) — HAISI DP.
   - Offline Member: data chanzo = doc YA MEMBER MWENYEWE (skh.currentUserData),
     agent hakikorofi chochote.
   - Hakuna architecture mpya: tunatumia overlay-menu iliyopo + skhUploadFromFile
     (uploader halisi ya DP) + updateDoc users/{uid} (pipeline ile ile).

   DATA FIELDS zinazotumika (tyaripo): users/{uid}.photoURL | .profileImage |
   .logo (fallback ya picha), .coverImage (HII NI MPYA kwa upload, lakini
   29-seller-store.js ISHAISOMIA kwa muda mrefu). COLLECTIONS: hakuna mpipya.
   ======================================================================== */
(function () {
    'use strict';

    var SKH = window.skh = window.skh || {};
    function ico(name, size) { return (window.skhNavIcon ? window.skhNavIcon(name, size || 16) : '' ); }
    function esc(s) { return (window.skhEscape ? window.skhEscape(String(s != null ? s : '')) : String(s != null ? s : '')); }
    function myUid() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function fmtK(n) { n = Number(n) || 0; return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n); }
    function fmtYears(d) { try { var t = new Date(d); return isNaN(t) ? '' : t.getFullYear(); } catch (e) { return ''; } }

    /* -------------------------------------------------- modal shell ---- */
    function ensureModal() {
        var m = document.getElementById('myProfileModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'myProfileModal';
        m.className = 'overlay-menu';
        m.style.zIndex = '7920'; // chini ya drawer (100k), juu ya sellerProfileModal (7900)
        m.innerHTML =
            '<div class="mp-shell" role="dialog" aria-modal="true" aria-labelledby="mpName">'
            + '  <div class="mp-body" id="mpBody"></div>'
            + '</div>';
        document.body.appendChild(m);
        return m;
    }

    function openModal(html, loading) {
        var m = ensureModal();
        var body = document.getElementById('mpBody');
        body.innerHTML =
            '<div class="mp-topbar">'
            + '  <button type="button" class="mp-x" aria-label="Funga" onclick="document.getElementById(\'myProfileModal\').style.display=\'none\'">' + ico('x', 18) + '</button>'
            + '</div>'
            + (html || '');
        m.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    /* --------------------------------------------- data aggregation ---- */
    async function gatherStats(uid) {
        var stats = { products: 0, services: 0, transports: 0, followers: 0, ratingAvg: null, ratingCount: 0, ratingsSum: 0 };
        // 1) Matangazo yangu kutoka kwenye cache (hakuna read za ziada).
        try {
            var items = (skh.cachedItems || []);
            for (var i = 0; i < items.length; i++) {
                var p = items[i] || {};
                var mine = (p.userId === uid) || (p.sellerId === uid) || (p.ownerId === uid);
                if (!mine) continue;
                if (p.collection === 'services') stats.services++;
                else if (p.collection === 'drivers' || p.collection === 'ride_requests') stats.transports++;
                else stats.products++;
            }
        } catch (e) { }
        // 2) Followers aggregator (ile ile inayotumwa na seller profile).
        try {
            var q = skh.query(skh.collection(skh.db, 'sellerFollowers'), skh.where('sellerId', '==', uid), skh.limit(500));
            var s = await skh.getDocs(q);
            stats.followers = (s && s.size) || 0;
        } catch (e) { }
        // 3) Rating (ikiwa ipo kwenye product docs za cache).
        try {
            var cnt = 0, sum = 0;
            (skh.cachedItems || []).forEach(function (p) {
                if (p.userId !== uid) return;
                var r = Number(p.rating || p.avgRating || (p.ratings && (p.ratings.avg || p.ratings.average)));
                if (!isNaN(r) && r > 0) { sum += r; cnt++; }
            });
            if (cnt) { stats.ratingAvg = sum / cnt; stats.ratingCount = cnt; }
        } catch (e) { }
        return stats;
    }

    /* --------------------------------------------------- header HTML ---- */
    function headerHtml(u, stats) {
        var name = u.__name;
        var verified = !!(u.verificationStatus === 'verified' || u.verified === true);
        var verifyChip = verified
            ? '<span class="mp-verified" title="' + esc(window.T ? T('verified', 'Verified') : 'Verified') + '">' + ico('shield-check', 14) + ' <span>' + esc(window.T ? T('verified', 'Verified') : 'Verified') + '</span></span>'
            : '<span class="mp-unverified">' + esc('Hajathibitishwa') + '</span>';
        var since = fmtYears(u.memberSince || u.createdAt);
        var roleLbl = (function () {
            if (stats.transports > 0 && stats.products === 0 && stats.services === 0) return 'Msafirishaji';
            if (stats.services > 0 && stats.products === 0) return 'Mtoa Huduma';
            if (stats.products > 0) return 'Muuzaji';
            return 'Mnunuzi';
        })();

        var coverInner = '';
        if (u.__cover) {
            coverInner = '<img src="' + esc(u.__cover) + '" alt="Business/' + esc(name) + '" class="mp-cover-img" onerror="this.style.display=\'none\'">';
        } else {
            coverInner = '<div class="mp-cover-ph"><span>' + ico('store', 26) + '</span><span>' + esc('Picha ya Duka / Biashara Yako') + '</span></div>';
        }

        var dp = u.__dp;
        return ''
            + '<div class="mp-cover">' + coverInner + '</div>'
            + '<div class="mp-head-card">'
            + '  <img src="' + esc(dp) + '" alt="' + esc(name) + '" class="mp-dp" id="mpDpImg">'
            + '  <h2 class="mp-name" id="mpName">' + esc(name) + '</h2>'
            + '  <div class="mp-subs">' + verifyChip + ' <span class="mp-role">' + esc(roleLbl) + '</span>' + (since ? ' <span class="mp-since">· ' + esc((window.T ? T('sst_member_since', 'Member since') : 'Mwanachama tangu') + ' ' + since) + '</span>' : '') + '</div>'
            + '  <div class="mp-stats">'
            + '    <span class="mp-stat">' + ico('heart', 14) + ' <b>' + fmtK(stats.followers) + '</b> ' + esc('Followers') + '</span>'
            + (stats.ratingAvg != null ? '<span class="mp-stat mp-stat-gold">' + ico('star', 14) + ' <b>' + stats.ratingAvg.toFixed(1) + '</b>/5</span>' : '')
            + '    <span class="mp-stat">' + ico('map', 14) + ' <b>' + esc(u.__loc || 'Tanzania') + '</b></span>'
            + '  </div>'
            + '  <div class="mp-actions">'
            + '    <button type="button" class="mp-btn mp-btn-light" onclick="window.triggerDpUpload()">' + ico('camera', 15) + ' ' + esc('Badilisha DP') + '</button>'
            + '    <button type="button" class="mp-btn mp-btn-light" onclick="window.openCoverUpload()">' + ico('image', 15) + ' ' + esc('Badilisha Cover') + '</button>'
            + '    <button type="button" class="mp-btn mp-btn-brand" onclick="document.getElementById(\'myProfileModal\').style.display=\'none\'; window.openSellerProfile && window.openSellerProfile((skh.currentUser&&skh.currentUser.uid)||\'\')">' + ico('store', 15) + ' ' + esc('Duka Langu Hadharani') + '</button>'
            + '  </div>'
            + '</div>';
    }

    function infoHtml(u, stats) {
        var rows = [];
        if (u.storeName) rows.push(['Duka / Biashara', u.storeName]);
        if (stats.products || stats.services || stats.transports) {
            var parts = [];
            if (stats.products) parts.push('<b>' + stats.products + '</b> Bidhaa');
            if (stats.services) parts.push('<b>' + stats.services + '</b> Huduma');
            if (stats.transports) parts.push('<b>' + stats.transports + '</b> Safari/Usafiri');
            rows.push(['Biashara Yangu', parts.join(' · ')]);
        }
        if (u.phone) rows.push(['Simu', u.phone]);
        if (u.email) rows.push(['Barua Pepe', u.email]);
        if (!rows.length) return '';
        return '<div class="mp-sec"><h3 class="mp-sec-t">Taarifa Za Akaunti</h3>'
            + rows.map(function (r) {
                var raw = String(r[1]);
                var safe = raw.indexOf('<b') !== -1 ? raw : esc(raw);
                return '<div class="mp-kv"><span>' + esc(r[0]) + '</span><b class="mp-kv-v">' + safe + '</b></div>';
            }).join('')
            + '</div>';
    }

    function aboutHtml(u) {
        var about = u.about || u.bio || u.description || '';
        if (!about) return '';
        return '<div class="mp-sec"><h3 class="mp-sec-t">Kuhusu</h3><p class="mp-about">' + esc(about) + '</p></div>';
    }

    function itemsHtml(uid) {
        var mine = [];
        try {
            (skh.cachedItems || []).forEach(function (p) {
                if ((p.userId === uid || p.sellerId === uid || p.ownerId === uid) && p.id) mine.push(p);
            });
        } catch (e) { }
        if (!mine.length) return '<div class="mp-sec"><h3 class="mp-sec-t">Matangazo Yangu</h3><p class="mp-empty">Bado huna tangazo lililochapishwa. Tumia kitufe cha + uanze kuuza.</p></div>';
        return '<div class="mp-sec"><h3 class="mp-sec-t">Matangazo Yangu <small>(' + mine.length + ')</small></h3>'
            + '<div class="mp-grid">'
            + mine.slice(0, 24).map(function (p) {
                var img = p.image || p.photo || (p.imagesArray && p.imagesArray[0]) || '';
                var col = p.collection === 'services' ? 'services' : (p.collection === 'drivers' || p.collection === 'ride_requests' ? 'drivers' : 'products');
                var price = Number(p.price || p.fare || 0);
                return '<button type="button" class="mp-item" onclick="document.getElementById(\'myProfileModal\').style.display=\'none\'; window.openProduct(\'' + esc(p.id) + '\',\'' + col + '\')">'
                    + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '<span class="mp-item-ph"></span>')
                    + '<b class="mp-item-t">' + esc(p.title || p.name || 'Tangazo').slice(0, 44) + '</b>'
                    + '<span class="mp-item-p">' + (price ? ('TSh ' + price.toLocaleString('en-US')) : 'Maelewano') + '</span>'
                    + '</button>';
            }).join('')
            + '</div></div>';
    }

    /* ------------------------------------------------- compose & open --- */
    window.openProfile = async function (uidOverride) {
        if (!skh.requireAuth()) return;
        var uid = uidOverride || myUid();
        if (!uid) return;
        if (typeof closeModals === 'function') closeModals();

        openModal('<div class="mp-loading"><span>' + ico('user', 20) + '</span><p>Inapakia wasifu wako…</p></div>');

        // Chanzo: users/{uid} reading (NYUMBA YA MFIsama, ni cheap na reliable).
        var u = {};
        try {
            u = (skh.currentUserData && skh.currentUserData.uid === uid) ? (skh.currentUserData || {})
                : {};
        } catch (e) { }
        try {
            var d = await skh.getDoc(skh.doc(skh.db, 'users', uid));
            if (d && d.exists && d.exists()) {
                var dd = d.data() || {};
                // firestore doc huwa na taarifa za firawa — zitangulize kabla ya cache.
                for (var k in dd) u[k] = dd[k];
            }
        } catch (e) { }

        var name = u.fullName || u.name || u.displayName || (skh.currentUser && skh.currentUser.displayName) || u.storeName || 'Mtumiaji';
        u.__name = name;
        u.__loc = u.location || u.region || u.city || (u.district ? (u.district + ', ' + (u.region || '')) : '') || 'Tanzania';
        u.__dp = u.photoURL || u.profileImage || u.dp || u.logo
            || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=03509d&color=ffffff');
        u.__cover = u.coverImage || u.cover || '';

        var stats = await gatherStats(uid);
        openModal(
            headerHtml(u, stats) + aboutHtml(u) + infoHtml(u, stats) + itemsHtml(uid)
        );
    };

    /* -------------------------------------- COVER UPLOAD (same pipeline) - */
    window.openCoverUpload = function () {
        if (!skh.requireAuth()) return;
        var input = document.getElementById('coverUploadInput');
        if (input) { input.value = ''; input.click(); }
    };

    function bindCoverInput() {
        var input = document.getElementById('coverUploadInput');
        if (!input || input.__mpBound) return;
        input.__mpBound = true;
        input.addEventListener('change', async function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) { alert((window.T ? T('pf_pic_too_big', 'Image is too large') : 'Picha ni kubwa sana') + ' (max 5MB).'); return; }
            var uid = myUid();
            if (!uid) return;
            var m = document.getElementById('myProfileModal');
            if (m) m.style.display = 'flex';
            var cover = document.querySelector('#myProfileModal .mp-cover');
            var ph = cover ? cover.innerHTML : '';
            if (cover) cover.innerHTML = '<div class="mp-cover-ph"><span>Inapakia cover…</span></div>';
            try {
                var up = await window.skhUploadFromFile(file);
                if (!up || !up.data || !up.data.secure_url) throw new Error('upload_failed');
                var url = skh.getOptimizedImageUrl ? skh.getOptimizedImageUrl(up.data.secure_url) : up.data.secure_url;
                await skh.updateDoc(skh.doc(skh.db, 'users', uid), { coverImage: url });
                try { if (skh.currentUserData) skh.currentUserData.coverImage = url; } catch (e) { }
                if (typeof window.sokohaiToast === 'function') window.sokohaiToast('Cover ya biashara imewekwa vizuri ✔', 'success', 2600);
                // Re-render kamili ya profile (inajumuisha cover mpya).
                if (document.getElementById('myProfileModal')) window.openProfile(uid);
            } catch (err) {
                if (cover) cover.innerHTML = ph;
                alert('Imeshindikana kuweka cover. Jaribu tena.');
            }
        });
    }

    /* Bonyeza nje ya shell kufunga */
    document.addEventListener('click', function (e) {
        var m = document.getElementById('myProfileModal');
        if (m && e.target === m) { m.style.display = 'none'; document.body.style.overflow = ''; }
    });
    document.addEventListener('keydown', function (e) {
        var m = document.getElementById('myProfileModal');
        if (m && m.style.display === 'flex' && e.key === 'Escape') { m.style.display = 'none'; document.body.style.overflow = ''; }
    });

    // Bind mara tu DOM iko tayari (ES modules hugooma baada ya parse).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindCoverInput);
    } else {
        bindCoverInput();
    }
})();

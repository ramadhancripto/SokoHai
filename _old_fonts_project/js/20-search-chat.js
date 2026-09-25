/* ==== js/20-search-chat.js ==== */
// ============================================================
// SOKOHAI UNIFIED SEARCH (2026-09)
// Upau mmoja wa utafutaji unaotumika kama:
//  · Utafutaji wa soko (bidhaa / huduma / usafiri) — kama zamani
//  · Utafutaji wa CHAT (watu, maduka, mazungumzo) — mpya
// Matokeo yanaonekana kwenye dropdown chini ya upau, yamegawanywa
// kwa sehemu. Kubofya mtu → kunafungua chat naye moja kwa moja.
// ============================================================
(function () { 'use strict';
    if (window.__skhUnifiedSearch) return;
    window.__skhUnifiedSearch = true;

    var DROP_ID = 'skhSearchDrop';
    var timer = null;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function jsq(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

    function drop() {
        var wrap = document.querySelector('.search-wrap');
        if (!wrap) return null;
        var d = document.getElementById(DROP_ID);
        if (!d) {
            d = document.createElement('div');
            d.id = DROP_ID;
            d.addEventListener('click', function (e) { e.stopPropagation(); });
            wrap.appendChild(d);
        }
        return d;
    }

    window.skhCloseSearchDrop = function () {
        var d = document.getElementById(DROP_ID);
        if (d) { d.classList.remove('open'); d.innerHTML = ''; }
    };

    document.addEventListener('click', function (e) {
        var wrap = document.querySelector('.search-wrap');
        if (wrap && !wrap.contains(e.target)) window.skhCloseSearchDrop();
    });

    // ---------- vyanzo vya data ----------
    function localItems() {
        try {
            var skh = window.skh || {};
            return Array.isArray(skh.cachedItems) ? skh.cachedItems : [];
        } catch (e) { return []; }
    }

    // Watu/mazungumzo: tunatumia cache ya chat ikiwa ipo, vinginevyo
    // tunasoma conversations za mtumiaji moja kwa moja.
    async function chatPeople(q) {
        var out = [];
        try {
            var cached = window.skhChatInboxCache;
            if (Array.isArray(cached) && cached.length) {
                out = cached.slice();
            } else if (typeof window.skhChatFetchInbox === 'function') {
                out = (await window.skhChatFetchInbox()) || [];
            }
        } catch (e) { /* bila chat cache, tutaonyesha wauzaji wa feed */ }

        // Fallback: wauzaji walio kwenye feed (unaweza kuanza nao chat mpya)
        if (!out.length) {
            var seen = {};
            localItems().forEach(function (it) {
                var uid = it.userId || it.ownerId;
                var name = it.ownerName || it.storeName || it.driverName || (it.userEmail ? String(it.userEmail).split('@')[0] : '');
                if (!uid || !name || seen[uid]) return;
                seen[uid] = true;
                out.push({ otherUid: uid, name: name, photo: it.ownerPhoto || '', lastMessage: null, _isSeller: true });
            });
        }
        return out.filter(function (p) {
            return String(p.name || '').toLowerCase().indexOf(q) !== -1
                || String((p.lastMessage && p.lastMessage.text) || '').toLowerCase().indexOf(q) !== -1;
        }).slice(0, 6);
    }

    function marketMatches(q) {
        return localItems().filter(function (it) {
            var hay = [it.title, it.name, it.category, it.subCategory, it.description,
                it.ownerName, it.storeName, it.vehicleType, it.region].join(' ').toLowerCase();
            return hay.indexOf(q) !== -1;
        }).slice(0, 8);
    }

    function kindLabel(it) {
        if (it.collectionName === 'services') return 'Huduma';
        if (it.collectionName === 'drivers') return 'Usafiri';
        return 'Bidhaa';
    }

    function avatarOf(p) {
        if (p.photo) return '<img src="' + esc(p.photo) + '" alt="">';
        var initial = esc(String(p.name || '?').trim().charAt(0).toUpperCase());
        return '<span class="skh-sd-ic" style="background:#1268A8;color:#fff;font-weight:900;">' + initial + '</span>';
    }

    /* [SMART SEARCH 2026-09-14] Dropdown mpya (23-smart-search.js) ndiyo
       inayoonyeshwa sasa. Tunahifadhi logic hii na kuifungua kama PROVIDER
       ya "Watu" ili tusirudie code wala tusipoteze search ya chat. */
    window.skhSearchChatMatches = function (q) {
        try { return marketMatches ? [] : []; } catch (e) { return []; }
    };
    window.skhSearchChatPeople = async function (q) {
        try { return await chatPeople(q); } catch (e) { return []; }
    };
    window.skhSearchChatHtml = function (people) {
        if (!people || !people.length) return '';
        var html = '<div class="skh-ss-grp"><div class="skh-ss-gh">'
            + (window.skhNavIcon ? window.skhNavIcon('chat', 13) : '') + ' Watu &amp; Mazungumzo <span>('
            + people.length + ')</span></div>';
        people.slice(0, 5).forEach(function (p) {
            var sub = p._isSeller ? 'Anza mazungumzo mapya'
                : ((p.lastMessage && p.lastMessage.text) ? p.lastMessage.text : 'Fungua mazungumzo');
            html += '<button type="button" class="skh-ss-row" onclick="window.skhSearchOpenChat(\'' + jsq(p.otherUid) + '\',\'' + jsq(p.name) + '\')">'
                + avatarOf(p)
                + '<span class="skh-ss-tx"><b>' + esc(p.name) + '</b><small>' + esc(sub) + '</small></span>'
                + '</button>';
        });
        return html + '</div>';
    };

    async function render(q) {
        // Smart search imechukua UI; tusionyeshe dropdown mbili.
        if (window.__skhSmartSearch) return;
        var d = drop();
        if (!d) return;
        if (!q) { window.skhCloseSearchDrop(); return; }

        var items = marketMatches(q);
        var people = await chatPeople(q);
        var html = '';

        if (people.length) {
            html += '<div class="skh-sd-sec">'+(window.skhNavIcon?window.skhNavIcon('chat',14):'')+' Chat &amp; Watu</div>';
            people.forEach(function (p) {
                var sub = p._isSeller ? 'Anza mazungumzo mapya'
                    : ((p.lastMessage && p.lastMessage.text) ? p.lastMessage.text : 'Fungua mazungumzo');
                html += '<div class="skh-sd-row" onclick="window.skhSearchOpenChat(\'' + jsq(p.otherUid) + '\',\'' + jsq(p.name) + '\')">'
                    + avatarOf(p)
                    + '<div class="skh-sd-tx"><b>' + esc(p.name) + '</b><small>' + esc(sub) + '</small></div>'
                    + '</div>';
            });
        }

        if (items.length) {
            html += '<div class="skh-sd-sec">'+(window.skhNavIcon?window.skhNavIcon('cart',14):'')+' Sokoni</div>';
            items.forEach(function (it) {
                var img = (it.images && it.images[0]) || it.imageUrl || it.photo || '';
                var title = it.title || it.name || it.driverName || 'Tangazo';
                var price = it.price ? ('TSh ' + Number(it.price).toLocaleString()) : kindLabel(it);
                html += '<div class="skh-sd-row" onclick="window.skhSearchOpenItem(\'' + jsq(it.id) + '\',\'' + jsq(it.collectionName || 'products') + '\')">'
                    + (img ? '<img src="' + esc(img) + '" alt="">' : '<span class="skh-sd-ic">'+(window.skhNavIcon?window.skhNavIcon('package',14):'')+'</span>')
                    + '<div class="skh-sd-tx"><b>' + esc(title) + '</b><small>' + esc(kindLabel(it)) + ' · ' + esc(price) + '</small></div>'
                    + '</div>';
            });
        }

        if (!html) {
            html = '<div class="skh-sd-empty">Hakuna kilichopatikana kwa "<b>' + esc(q) + '</b>".<br>Jaribu neno lingine.</div>';
        } else {
            html += '<div class="skh-sd-row" style="justify-content:center;font-weight:900;color:#1268A8;font-size:12.5px;" '
                + 'onclick="window.skhSearchSeeAll()">Ona matokeo yote sokoni →</div>';
        }
        d.innerHTML = html;
        d.classList.add('open');
    }

    window.skhSearchOpenChat = function (uid, name) {
        window.skhCloseSearchDrop();
        if (typeof window.skhChatOpen === 'function') window.skhChatOpen(uid, name, {});
        else if (typeof window.openChatList === 'function') window.openChatList();
    };

    window.skhSearchOpenItem = function (id, col) {
        window.skhCloseSearchDrop();
        if (col === 'drivers' && typeof window.openDriverProfile === 'function') return window.openDriverProfile(id);
        if (typeof window.openProduct === 'function') window.openProduct(id);
    };

    window.skhSearchSeeAll = function () {
        window.skhCloseSearchDrop();
        var skh = window.skh;
        if (skh && typeof skh.loadMainFeed === 'function') {
            skh.currentLimit = 40;
            skh.loadMainFeed(skh.currentFeedCollection || 'all');
        }
    };

    // ---------- Unganisha na upau uliopo ----------
    // handleSearch ya awali inabaki (inachuja feed); tunaongeza dropdown.
    var oldHandle = window.handleSearch;
    window.handleSearch = function () {
        var input = document.getElementById('searchInput');
        var q = input ? input.value.trim().toLowerCase() : '';
        var wrap = document.querySelector('.search-wrap');
        if (wrap) wrap.classList.toggle('skh-chat-mode', q.length > 0);

        clearTimeout(timer);
        timer = setTimeout(function () { render(q); }, 220);

        if (typeof oldHandle === 'function') return oldHandle.apply(this, arguments);
        // Fallback ikiwa moduli ya soko bado haijapakia
        var skh = window.skh;
        if (skh) {
            skh.searchQuery = q;
            clearTimeout(skh.searchTimeout);
            skh.searchTimeout = setTimeout(function () {
                skh.currentLimit = 20;
                if (typeof skh.loadMainFeed === 'function') skh.loadMainFeed(skh.currentFeedCollection);
            }, 600);
        }
    };

    // Modules (type="module") hupakia baada ya script hii — hakikisha
    // tunazunguka toleo lao pia mara tu linapopatikana.
    var tries = 0;
    var iv = setInterval(function () {
        tries++;
        if (window.handleSearch && !window.handleSearch.__skhWrapped) {
            var inner = window.handleSearch;
            var wrapped = function () {
                var input = document.getElementById('searchInput');
                var q = input ? input.value.trim().toLowerCase() : '';
                var w = document.querySelector('.search-wrap');
                if (w) w.classList.toggle('skh-chat-mode', q.length > 0);
                clearTimeout(timer);
                timer = setTimeout(function () { render(q); }, 220);
                return inner.apply(this, arguments);
            };
            wrapped.__skhWrapped = true;
            window.handleSearch = wrapped;
        }
        if (tries > 40) clearInterval(iv);
    }, 300);
})();

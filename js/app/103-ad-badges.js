/* SOKOHAI — AD BADGES (matangazo madogo kwenye dashboard, chat, n.k.)
   ============================================================================
   Ombi la mtumiaji (2026-11-01): "sehemu maalum kama badges ndogo, mfano
   dashboard, chatting ui, nk".
   Kwa hiyo tangazo linaonekana mahali pamoja na maudhui mengine, kwa ukubwa
   mdogo usiovuruga mtiririko — si bloku kubwa katikati ya kazi ya mtumiaji.

   KANUNI ZILIZOTUNZWA
   • Hakuna injini ya pili: kila badge ni `[data-skh-ad-slot]` inayotumia
     `skhAdDeliveryController.refreshSlot()` ile ile ya feed. Targeting,
     frequency, leases na tracking hubaki mahali pake.
   • Maeneo yaliyolindwa (admin, checkout, malipo, wallet, escrow, usalama)
     hayapati badge hata kidogo.
   • Hakuna namba zinazobuniwa: badge inaonyesha "Sponsored" na kichwa tu.
   • Kila badge ina kitufe cha kufunga; uamuzi huo unakumbukwa kwa kipindi cha
     session pekee (delivery policy bado inaheshimika).
   ========================================================================= */
(function () {
    'use strict';
    if (window.skhAdBadges) return;

    var MOUNTS = [
        /* placement ya engine, chaguo la host, jina la uso */
        { placement: 'dashboard', surface: 'seller_dashboard', find: findDashboardHost, position: 'top' },
        { placement: 'chat', surface: 'chat_inbox', find: findChatHost, position: 'top' }
    ];

    var dismissed = Object.create(null);

    function log() {
        try { console.debug.apply(console, ['[ad-badges]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function protectedContext(node) {
        var el = node;
        while (el && el.nodeType === 1) {
            var d = el.dataset || {};
            if (d.skhAdProtected === 'true' || d.skhAdminDashboard === 'true') return true;
            el = el.parentElement;
        }
        return false;
    }

    /* Dashboard: juu ya workspace ya dashibodi ya muuzaji. */
    function findDashboardHost() {
        var ws = document.getElementById('dashWorkspace');
        if (!ws || !ws.parentElement) return null;
        return {
            host: ws,
            insert: function (node) { ws.parentElement.insertBefore(node, ws); }
        };
    }

    /* Chat: juu ya orodha ya mazungumzo. */
    function findChatHost() {
        var list = document.getElementById('chatList') || document.getElementById('chatUsersList')
            || document.getElementById('chatInboxList');
        if (!list || !list.parentElement) return null;
        return {
            host: list,
            insert: function (node) { list.parentElement.insertBefore(node, list); }
        };
    }

    function makeBadge(placement, surface) {
        var wrap = document.createElement('div');
        wrap.className = 'skh-ad-badge-wrap';
        wrap.setAttribute('data-skh-ad-surface', surface);
        var slot = document.createElement('div');
        slot.className = 'skh-ad-badge';
        slot.setAttribute('data-skh-ad-slot', placement);
        slot.setAttribute('data-skh-ad-surface', surface);
        slot.setAttribute('data-skh-ad-compact', 'true');
        slot.setAttribute('aria-label', 'Tangazo lililodhaminiwa');
        slot.setAttribute('data-skh-ad-context', JSON.stringify({ surface: surface, compact: true }));
        wrap.appendChild(slot);

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'skh-ad-badge-close';
        close.setAttribute('aria-label', 'Funga tangazo');
        close.textContent = '×';
        close.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            dismissed[placement] = true;
            wrap.remove();
        });
        wrap.appendChild(close);
        return { wrap: wrap, slot: slot };
    }

    function mount(entry) {
        if (dismissed[entry.placement]) return false;
        if (document.querySelector('.skh-ad-badge[data-skh-ad-slot="' + entry.placement + '"]')) return false;
        var found = entry.find();
        if (!found) return false;
        if (protectedContext(found.host)) return false;
        var made = makeBadge(entry.placement, entry.surface);
        found.insert(made.wrap);
        try {
            if (window.skhAdDeliveryController && window.skhAdDeliveryController.refreshSlot) {
                window.skhAdDeliveryController.refreshSlot(made.slot, { force: false });
            }
        } catch (e) { log('refreshSlot', e && e.message); }
        watchFill(made);
        log('badge mounted', entry.placement);
        return true;
    }

    /* Kama injini haina tangazo kwa hapa, badge inaondolewa — hakuna kisanduku
       kitupu kinachobaki kwenye UI. */
    function watchFill(made) {
        var checked = false;
        function judge() {
            if (checked) return;
            checked = true;
            if (!made.wrap.isConnected) return;
            var filled = made.slot.querySelector('.skh-ann-card, .skh-ann-mini, [data-skh-ad-filled]')
                || made.slot.getAttribute('data-skh-ad-filled') === 'true';
            if (!filled) { made.wrap.remove(); log('badge removed (no fill)'); }
            else made.wrap.classList.add('is-filled');
        }
        if (typeof IntersectionObserver === 'undefined') { window.setTimeout(judge, 4000); return; }
        var io = new IntersectionObserver(function (entries) {
            if (!entries.some(function (e) { return e.isIntersecting; })) return;
            io.disconnect();
            window.setTimeout(judge, 3500);
        }, { rootMargin: '120px' });
        io.observe(made.wrap);
    }

    var queued = false;
    function scan() {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(function () {
            queued = false;
            MOUNTS.forEach(function (entry) {
                try { mount(entry); } catch (e) { log('mount', entry.placement, e && e.message); }
            });
        });
    }

    document.addEventListener('DOMContentLoaded', scan);
    document.addEventListener('sokohai:dashboardRendered', function () { window.setTimeout(scan, 400); });
    document.addEventListener('sokohai:chatOpened', function () { window.setTimeout(scan, 400); });
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('[data-nav="chat"], a[href="#chat"], .skh-tab-chat, [onclick*="openChatList"]')) {
            window.setTimeout(scan, 600);
        }
    }, true);
    /* Michoro ya dashibodi/chat hufanywa kwa innerHTML; tunatafuta kwa upole. */
    if (typeof MutationObserver !== 'undefined') {
        var mo = new MutationObserver(function () { scan(); });
        var start = function () {
            mo.observe(document.body, { childList: true, subtree: true });
            scan();
        };
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
        window.setTimeout(function () { mo.disconnect(); }, 60000);
    }

    window.skhAdBadges = { scan: scan, MOUNTS: MOUNTS };
})();

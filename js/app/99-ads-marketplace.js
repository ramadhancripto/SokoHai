/* ==== js/app/99-ads-marketplace.js ====
   [2026-11-01 TASK 01] Marketplace ad presentation — integration layer.

   WHAT IT DOES (and what it deliberately does NOT do)
   ------------------------------------------------------------------------
   • It does NOT create an ads engine. Campaign selection, leases, frequency
     policy, targeting and tracking stay exactly where they are:
     functions/ads-delivery*.js + js/app/96-ad-delivery-controller.js.
   • It does NOT re-implement the creative. Every ad is still rendered by the
     canonical renderer skhAdvertisementCardHtml() in js/06-announcement.js.
   • What it adds is PLACEMENT + PRESENTATION:
       1. a sponsored cell inside .feed-grid, taking the same grid slot as a
          normal product card, so ads appear *between* products instead of as a
          full-width block above them;
       2. one sponsored cell in the discover/search result grids;
       3. a "no duplicate creative on screen" guard for the local delivery path;
       4. a true-size marketplace preview inside the advertisement designer.

   MEASURED BEFORE: home slot 820×659 px vs product card 173×248 px.
   AFTER: the sponsored cell uses the product grid's own column width, and the
   creative inside it is capped to a product-card layout (css/41-ads-marketplace.css).
*/
(function () {
  'use strict';
  if (window.skhAdsMarketplace) return;

  var CFG = {
    feedPosition: 5,      // insert the sponsored cell after the 5th product
    minProducts: 6,       // never advertise in a grid too small to read as a grid
    maxPerGrid: 1,        // frequency: one in-feed ad per grid view
    // The marketplace feed is the 'home' delivery surface, and today that is the
    // only placement with live inventory. The discover/search slots inside the
    // Discover engine keep their own placements and are left untouched.
    feedPlacement: 'home'
  };

  function log() {
    try { console.debug.apply(console, ['[ads-marketplace]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  /* ---------------------------------------------------------------- helpers */
  function isProtectedContext(node) {
    var el = node;
    while (el && el.nodeType === 1) {
      var d = el.dataset || {};
      if (d.skhAdProtected === 'true' || d.skhAdminDashboard === 'true') return true;
      el = el.parentElement;
    }
    return false;
  }

  function gridProducts(grid) {
    return Array.prototype.filter.call(grid.children, function (child) {
      return child.nodeType === 1 && !child.classList.contains('skh-ad-cell') && child.getBoundingClientRect().height > 0;
    });
  }

  /* Mark every standalone slot host so the compact slot CSS applies to it.
     In-feed cells are excluded: they use the product-card presentation. */
  function markSlotHosts() {
    var hosts = document.querySelectorAll('[data-skh-ad-slot]');
    Array.prototype.forEach.call(hosts, function (host) {
      if (host.closest('.skh-ad-cell')) return;
      if (!host.classList.contains('skh-ad-slot-inline')) host.classList.add('skh-ad-slot-inline');
      if (host.querySelector('.skh-ann-card')) { labelCell(host); normalizeCopyColors(host); }
      if (!host.__skhLabelWatch) {
        host.__skhLabelWatch = true;
        var mo = new MutationObserver(function () { labelCell(host); normalizeCopyColors(host); });
        mo.observe(host, { childList: true, subtree: true });
      }
    });
  }

  /* ------------------------------------------------- 1. in-feed sponsored cell */
  function categoryOfGrid(grid) {
    try {
      var first = grid.querySelector('[data-category], [data-cat]');
      if (first) return first.getAttribute('data-category') || first.getAttribute('data-cat') || '';
      var t = (document.getElementById('feedTitleText') || {}).textContent || '';
      var m = /Kategoria:\s*(.+)$/i.exec(t);
      return m ? m[1].trim() : '';
    } catch (e) { return ''; }
  }

  function makeCell(grid, placement, surface) {
    var cell = document.createElement('div');
    cell.className = 'skh-ad-cell';
    cell.setAttribute('role', 'listitem');
    var host = document.createElement('div');
    host.setAttribute('data-skh-ad-slot', placement);
    host.setAttribute('data-skh-ad-surface', surface);
    host.setAttribute('aria-label', 'Tangazo lililodhaminiwa');
    var cat = categoryOfGrid(grid);
    if (cat) host.setAttribute('data-skh-ad-category', cat);
    host.setAttribute('data-skh-ad-context', JSON.stringify({ surface: surface, category: cat || '' }));
    cell.appendChild(host);
    return cell;
  }

  function injectInto(grid, placement, surface, position) {
    if (!grid || !grid.children) return false;
    if (isProtectedContext(grid)) return false;
    if (noFill[surface]) return false;   // engine had nothing here this session
    if (grid.querySelector(':scope > .skh-ad-cell')) return true;   // already has one
    var products = gridProducts(grid);
    if (products.length < CFG.minProducts) return false;
    var cell = makeCell(grid, placement, surface);
    var anchor = products[Math.min(position || CFG.feedPosition, products.length) - 1];
    if (anchor && anchor.nextSibling) grid.insertBefore(cell, anchor.nextSibling);
    else grid.appendChild(cell);

    // Ask the existing controller to fill this host. Delivery is lazy
    // (IntersectionObserver + lease), so we only judge "empty" AFTER the cell has
    // actually been on screen for a moment — never on a blind timer, which used
    // to delete cells that simply had not been scrolled to yet.
    var host = cell.querySelector('[data-skh-ad-slot]');
    try {
      if (window.skhAdDeliveryController && window.skhAdDeliveryController.refreshSlot) {
        window.skhAdDeliveryController.refreshSlot(host, { force: false });
      }
    } catch (e) { log('refreshSlot', e && e.message); }
    watchForFill(cell, host, surface);
    log('in-feed cell created (' + placement + ') after product #' + (position || CFG.feedPosition));
    return true;
  }

  var noFill = Object.create(null);   // surface -> true (engine had nothing)

  /* Presentation-only: the canonical renderer writes a short "AD" tag. In the
     marketplace we show the unambiguous "Sponsored". The renderer, the creative
     data and every other placement keep "AD" exactly as they were — this rewrites
     the visible label of a mounted cell only, and re-applies after each render. */
  function labelCell(host) {
    var chip = host.querySelector('.skh-ann-sponsored');
    if (chip && chip.textContent !== 'Sponsored') chip.textContent = 'Sponsored';
  }

  /* Advertiser creatives are designed for a full-bleed poster, so many set white
     text (to sit on a dark image). Inside a white product card that copy becomes
     invisible — a real bug, seen on mobile with an image_text creative whose
     inline color:#fff!important cannot be overridden by a stylesheet. Here we strip
     the inline colour/text-shadow from the mounted marketplace cell only, so the
     card uses the marketplace's ink colours. The creative record and every other
     placement keep their own colours untouched. */
  window.skhAdsNormalizeCell = function (host) { labelCell(host); normalizeCopyColors(host); };

  /* Creatives are authored as free-standing posters, so they arrive with inline
     colour/type/background decisions made for a full-bleed placement. Inside a
     white marketplace card those decisions are wrong (white text on white, 20px
     copy in a 220px card, a dark poster gradient behind a product grid). Only the
     marketplace-mounted copy is normalised; every other placement keeps the
     advertiser's styling exactly as designed. */
  function normalizeCopyColors(host) {
    var nodes = host.querySelectorAll('.skh-ann-title, .skh-ann-copy p, .skh-ann-title-wrap span, .skh-ann-title-wrap strong, .skh-ann-text-content p, .skh-ann-text-content strong, .skh-ann-offer, .skh-ann-text-offer');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.style.color) el.style.removeProperty('color');
      if (el.style.textShadow) el.style.removeProperty('text-shadow');
      if (el.style.fontSize) el.style.removeProperty('font-size');   // clamp size to the card
      if (el.style.textAlign) el.style.removeProperty('text-align');
      if (el.style.fontWeight) el.style.removeProperty('font-weight');
      /* [ADS STUDIO REBUILD] The offer/price pill also arrives with an inline
         `background: … !important` (the advertiser's accent colour). Inside a white
         product card that painted a solid colour bar over the price, hiding it —
         an inline !important wins over the stylesheet, so it has to go here. */
      if (el.style.background) el.style.removeProperty('background');
      if (el.style.backgroundColor) el.style.removeProperty('background-color');
      if (el.style.backgroundImage) el.style.removeProperty('background-image');
      if (el.style.padding) el.style.removeProperty('padding');
    });
    // the text-only poster: drop the inline gradient + fixed aspect ratio so the
    // card grid decides the box, not the creative
    var poster = host.querySelector('.skh-ann-text-creative');
    if (poster) {
      ['background', 'background-image', 'aspect-ratio', 'min-height', 'max-height'].forEach(function (prop) {
        if (poster.style.getPropertyValue(prop)) poster.style.removeProperty(prop);
      });
    }
  }
  var labeled = new WeakSet();
  function watchLabel(cell, host) {
    labelCell(host);
    normalizeCopyColors(host);
    if (labeled.has(cell) || typeof MutationObserver === 'undefined') return;
    labeled.add(cell);
    var mo = new MutationObserver(function () { labelCell(host); normalizeCopyColors(host); });
    mo.observe(host, { childList: true, subtree: true });
    window.setTimeout(function () { mo.disconnect(); labelCell(host); normalizeCopyColors(host); }, 30000);
  }

  function watchForFill(cell, host, surface) {
    watchLabel(cell, host);
    function drop(reason) {
      try { if (window.skhAdDeliveryController && window.skhAdDeliveryController.releaseSlot) window.skhAdDeliveryController.releaseSlot(host); } catch (e) {}
      if (cell.isConnected) cell.remove();
      if (reason === 'nofill') noFill[surface] = true;
      log('cell removed (' + surface + ': ' + reason + ')');
    }
    if (typeof IntersectionObserver === 'undefined') {
      window.setTimeout(function () { if (cell.isConnected && !host.querySelector('.skh-ann-card')) drop('nofill'); }, 4000);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      io.disconnect();
      // Give the controller its window to request + render, then judge honestly.
      window.setTimeout(function () {
        if (!cell.isConnected) return;
        if (host.querySelector('.skh-ann-card') && !host.hidden) {
          labelCell(host); normalizeCopyColors(host);
          log('cell filled (' + surface + ')');
          return;
        }
        drop('nofill');
      }, 3500);
    }, { rootMargin: '200px' });
    io.observe(cell);
  }

  /* ------------------------------------------------- 2. grids we integrate with
     Each entry: how to find the grid, which engine placement to ask for, and how
     many products must be present before an ad is acceptable there. */
  function grids() {
    var out = [];
    var feed = document.getElementById('mainFeed');
    if (feed) out.push({ el: feed, placement: CFG.feedPlacement, surface: 'marketplace_feed', pos: CFG.feedPosition, min: CFG.minProducts });
    // Discover engine result grids (existing markup: skh-de-section > grid div)
    var deProducts = document.querySelectorAll('.skh-de-section div[style*="grid"]');
    Array.prototype.forEach.call(deProducts, function (grid, i) {
      if (i > 0) return;
      out.push({ el: grid, placement: 'discover', surface: 'discover_results', pos: 3, min: 4 });
    });
    return out;
  }

  var scanQueued = false;
  function scan() {
    if (scanQueued) return;
    scanQueued = true;
    window.requestAnimationFrame(function () {
      scanQueued = false;
      markSlotHosts();
      installPreviewToggle();
      grids().forEach(function (g) {
        try { injectInto(g.el, g.placement, g.surface, g.pos); } catch (e) { log('inject', e && e.message); }
      });
    });
  }

  /* ----------------------------- 3. never show the same creative twice on screen
     Only affects the local (cache) delivery path used on localhost/staging and
     when Functions are unreachable. Server delivery keeps its own policy. */
  function guardDuplicates() {
    if (typeof window.skhLocalActiveCampaigns !== 'function' || window.skhLocalActiveCampaigns.__skhGuarded) return;
    var original = window.skhLocalActiveCampaigns;
    var guarded = function (placement, context) {
      var list = original.apply(this, arguments) || [];
      if (list.length < 2) return list;
      var inUse = Object.create(null);
      try {
        var status = window.skhAdDeliveryController && window.skhAdDeliveryController.getStatus
          ? window.skhAdDeliveryController.getStatus() : null;
        var slots = (status && status.slots) || [];
        slots.forEach(function (s) { if (s && s.campaignId) inUse[String(s.campaignId)] = true; });
      } catch (e) {}
      var filtered = list.filter(function (ad) { return ad && !inUse[String(ad.id)]; });
      // Deliberately NOT falling back to the full list: repeating the same
      // creative in two places on one screen is exactly what we are removing.
      return filtered;
    };
    guarded.__skhGuarded = true;
    window.skhLocalActiveCampaigns = guarded;
  }

  /* --------------------------------------- 4. designer: true-size market preview
     Shows the SAME compact cell the marketplace renders, next to an example
     ordinary product card, so the advertiser can compare. Nothing here is
     written to any campaign — it is a preview mode only. */
  function marketPreviewOn() { return window.__skhAdPreviewMarket === true; }

  function buildMarketPreview(host) {
    var card = host.querySelector('.skh-ann-card');
    if (!card) return;
    host.classList.add('is-market');
    // Same normalisation the marketplace applies (label + copy colours/sizes), so
    // the preview is literally the marketplace card.
    try { if (window.skhAdsNormalizeCell) window.skhAdsNormalizeCell(card.parentElement || host); } catch (e) {}
    if (host.querySelector('.skh-ad-preview-grid')) return;
    var grid = document.createElement('div');
    grid.className = 'skh-ad-preview-grid';

    var example = document.createElement('div');
    example.className = 'skh-ad-example-card';
    example.innerHTML = '<div class="skh-ad-example-img">Picha ya bidhaa</div>'
      + '<div class="skh-ad-example-body"><b>Jina la bidhaa ya kawaida</b><span>TSh 15,000</span></div>';

    var cell = document.createElement('div');
    cell.className = 'skh-ad-cell';
    cell.appendChild(card);              // move the live rendered creative into the cell
    var wide = host.clientWidth >= 420;
    if (wide) { grid.appendChild(example); }
    grid.appendChild(cell);

    var caption = document.createElement('p');
    caption.className = 'skh-ad-preview-caption';
    caption.innerHTML = '<span class="skh-ad-legend">Bidhaa ya kawaida</span>'
      + '<span class="skh-ad-legend is-ad">Tangazo lililodhaminiwa</span>'
      + '<span>Ukubwa halisi wa kwenye soko</span>';
    host.innerHTML = '';
    host.appendChild(caption);
    host.appendChild(grid);
    if (!wide) {
        // Narrow designer column: no second card, no scrolling, nothing clipped.
        grid.style.gridTemplateColumns = 'minmax(0,1fr)';
        grid.style.maxWidth = '230px';
        caption.lastElementChild.textContent = 'Ukubwa halisi wa tangazo kwenye soko';
    }
  }

  function wrapPreviewRenderer() {
    if (typeof window.skhRenderAdminAdPreview !== 'function' || window.skhRenderAdminAdPreview.__skhMarket) return;
    var original = window.skhRenderAdminAdPreview;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      try {
        if (marketPreviewOn()) {
          var host = document.getElementById('annPreview');
          if (host) buildMarketPreview(host);
        }
      } catch (e) { log('market preview', e && e.message); }
      return result;
    };
    wrapped.__skhMarket = true;
    window.skhRenderAdminAdPreview = wrapped;
  }

  function setMarketPreview(on) {
    window.__skhAdPreviewMarket = !!on;
    // 'compact' is an existing, supported preview placement variant of the
    // canonical renderer — no new ad format is introduced here.
    window.__skhAdPreviewPlacement = on ? 'compact' : 'home';
    var host = document.getElementById('annPreview');
    if (host) host.classList.toggle('is-market', !!on);
    var frame = document.getElementById('annDeviceFrame');
    if (frame) {
      frame.classList.toggle('is-market-frame', !!on);
      if (on) { frame.classList.remove('is-mobile'); frame.classList.add('is-desktop'); }
    }
    try { if (typeof window.skhRenderAdminAdPreview === 'function') window.skhRenderAdminAdPreview(); } catch (e) {}
    var wrap = document.getElementById('skhAdPreviewMode');
    if (wrap) Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', (b.dataset.mode === 'market') === !!on);
    });
  }
  window.skhAdSetPreviewMode = function (mode) { setMarketPreview(mode === 'market'); };

  function installPreviewToggle() {
    var header = document.querySelector('.adm-ad-preview-header');
    if (!header || header.querySelector('#skhAdPreviewMode')) return;
    var wrap = document.createElement('div');
    wrap.id = 'skhAdPreviewMode';
    wrap.className = 'skh-ad-preview-mode';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Ukubwa wa preview');
    wrap.style.cssText = 'display:inline-flex;gap:2px;padding:2px;border:1px solid #E2E8F0;border-radius:999px;background:#fff';
    wrap.innerHTML = '<button type="button" data-mode="full" class="active" style="border:0;border-radius:999px;padding:5px 10px;font:800 11px Inter,system-ui,sans-serif;background:#EAF8F3;color:#12866A;cursor:pointer">Ukubwa kamili</button>'
      + '<button type="button" data-mode="market" style="border:0;border-radius:999px;padding:5px 10px;font:800 11px Inter,system-ui,sans-serif;background:transparent;color:#64748B;cursor:pointer">Kwenye soko</button>';
    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) {
        var on = b === btn;
        b.classList.toggle('active', on);
        b.style.background = on ? '#EAF8F3' : 'transparent';
        b.style.color = on ? '#12866A' : '#64748B';
      });
      setMarketPreview(btn.dataset.mode === 'market');
    });
    header.appendChild(wrap);   /* flex:1 0 100% → its own row, never overlapping */
  }

  /* --------------------------------------------------------------- 5. lifecycle */
  function observe() {
    if (typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(function (muts) {
      var relevant = muts.some(function (m) {
        if (m.type !== 'childList') return false;
        var nodes = [].slice.call(m.addedNodes);
        if (!nodes.length) return false;
        return nodes.some(function (n) {
          if (n.nodeType !== 1) return false;
          return n.classList.contains('feed-card-box') || n.classList.contains('skh-card') ||
            n.id === 'mainFeed' || n.querySelector && (n.querySelector('.feed-grid') || n.querySelector('[data-skh-ad-slot]'));
        });
      });
      if (relevant) scan();
      installPreviewToggle();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    guardDuplicates();
    markSlotHosts();
    scan();
    observe();
    installPreviewToggle();
    wrapPreviewRenderer();
  }

  window.skhAdsMarketplace = { scan: scan, injectInto: injectInto, config: CFG, setMarketPreview: setMarketPreview };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  [600, 2000, 4000].forEach(function (ms) { setTimeout(function () { try { boot(); } catch (e) {} }, ms); });
})();

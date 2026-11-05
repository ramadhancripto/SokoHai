/* ==== js/00-pwa.js ==== */
// Load PWA manifest only on http/https. file:// blocks manifest by browser CORS rules.
(function () {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  var link = document.createElement('link');
  link.rel = 'manifest';
  link.href = './sokohai-manifest.json';
  document.head.appendChild(link);

  /* ---------------------------------------------------------------
     [JOB 13 R5d — 2026-11-05] Tofauti kati ya local server na screen shot
     ilitokana na service worker + cache ya zamani kwenye host ya preview.
     `localhost`/`127.0.0.1` pekee ilikuwa inarukwa, lakini preview ya Arena
     huja kupitia host nyingine (mf. *.e2b.app) — huko SW ilikuwa inajisajili
     na kuhifadhi CSS/JS ya zamani, hivyo mtumiaji aliona toleo la kale.

     Sasa: SW inasajiliwa kwenye domain HALISI ya uzalishaji pekee.
     Kwenye host yoyote ya maendeleo/preview tunaifuta SW na kufuta cache
     zote, ili kila reload ionyeshe faili zilizopo kwenye diski.
     --------------------------------------------------------------- */
  var host = location.hostname;
  var isDevHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '' ||
    /\.e2b\.app$/i.test(host) ||
    /\.e2b\.dev$/i.test(host) ||
    /\.arena\.(ai|dev|sh)$/i.test(host) ||
    /\.ngrok(-free)?\.app$/i.test(host) ||
    /\.trycloudflare\.com$/i.test(host) ||
    /\.local$/i.test(host) ||
    /^(192\.168|10)\./.test(host);

  if (isDevHost) {
    /* safisha kila kitu kilichohifadhiwa na toleo la zamani */
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { try { r.unregister(); } catch (e) {} });
        }).catch(function () {});
      }
      if (window.caches && caches.keys) {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { try { caches.delete(k); } catch (e) {} });
        }).catch(function () {});
      }
    } catch (e) {}
    try { console.log('[SokoHai] dev/preview host — service worker imezimwa, cache imesafishwa'); } catch (e) {}
    return;
  }

  /* uzalishaji: SW ya kawaida (network-first) */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sokohai-sw.js').catch(function (e) {
        console.log('SW registration skipped:', e && e.message);
      });
    });
  }
})();

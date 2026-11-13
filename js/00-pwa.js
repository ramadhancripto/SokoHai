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

  /* [R15] a tester can opt in on a dev host: localStorage skh_pwa_test = '1' (used by the PWA E2E) */
  var forcePwa = false;
  try { forcePwa = localStorage.getItem('skh_pwa_test') === '1'; } catch (e) {}
  if (isDevHost && !forcePwa) {
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

  /* uzalishaji: SW (network-first + offline fallback). [R15] toleo jipya likisubiri, mtumiaji
     anaambiwa na anachagua kupakia upya — hakuna mtu anayebaki na toleo la zamani bila kujua. */
  function offerUpdate(reg) {
    if (!reg || !reg.waiting || document.getElementById('skhUpdateBar')) return;
    var bar = document.createElement('div');
    bar.id = 'skhUpdateBar'; bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147482000;display:flex;gap:10px;align-items:center;max-width:calc(100% - 32px);background:#13231e;color:#fff;padding:10px 12px 10px 16px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);font:600 14px/1.3 Inter,system-ui,sans-serif;';
    bar.innerHTML = '<span>Toleo jipya la SokoHai lipo.</span>'
      + '<button type="button" id="skhUpdateGo" style="border:0;border-radius:999px;background:#12946f;color:#fff;padding:8px 14px;font-weight:800;cursor:pointer;white-space:nowrap;">Pakia upya</button>'
      + '<button type="button" id="skhUpdateLater" aria-label="Baadaye" style="border:0;background:transparent;color:#cbd5e1;font-size:18px;cursor:pointer;padding:4px 6px;">&times;</button>';
    var add = function () { (document.body || document.documentElement).appendChild(bar); };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
    bar.querySelector('#skhUpdateGo').onclick = function () { this.disabled = true; this.textContent = 'Inapakia…'; try { reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {} };
    bar.querySelector('#skhUpdateLater').onclick = function () { bar.remove(); };
  }
  if ('serviceWorker' in navigator) {
    /* [R15] reload only when a NEW version takes over; the very first install (clients.claim) must not reload the page */
    var reloading = false, hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      if (reloading) return; reloading = true; location.reload();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sokohai-sw.js').then(function (reg) {
        window.__skhSwReg = reg;
        offerUpdate(reg);
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(reg); });
        });
        setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000);
      }).catch(function (e) {
        console.log('SW registration skipped:', e && e.message);
      });
    });
  }
})();

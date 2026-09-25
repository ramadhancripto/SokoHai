/* ==== js/00-pwa.js ==== */
// Load PWA manifest only on http/https. file:// blocks manifest by browser CORS rules.
(function(){
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    var link=document.createElement('link');
    link.rel='manifest';
    link.href='./sokohai-manifest.json';
    document.head.appendChild(link);
    // Service worker ya SOKOHAI (network-first, haiflekei cache ya zamani)
    if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      window.addEventListener('load', function(){
        navigator.serviceWorker.register('./sokohai-sw.js').catch(function(e){ console.log('SW registration skipped:', e && e.message); });
      });
    }
  }
})();

// Cleanup worker for the retired accidental /fonts/ application scope.
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => Promise.all(clients.map((client) => client.navigate('/?ui=negotiation-host-v3'))))
      .then(() => self.registration.unregister())
  );
});
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

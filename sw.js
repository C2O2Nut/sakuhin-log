var CACHE = 'sakuhin-log-v3';
var FILES = ['/', '/sakuhin-log/index.html'];

self.addEventListener('install', function(e) {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(fetch(e.request).catch(function() { return caches.match(e.request); }));
});

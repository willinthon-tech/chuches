const CACHE_NAME = 'chuches-pos-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/functions.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve la caché si existe, si no, hace la petición a la red
        return response || fetch(event.request);
      })
  );
});
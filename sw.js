const CACHE_NAME = 'havadurum-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Hava verisi her zaman güncel olmalı — /api/* isteklerine hiç dokunma,
  // servis çalışanı sadece statik dosyaları (kabuk) önbellekler.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Stale-while-revalidate: önbellekte varsa hemen onu göster (hızlı +
  // çevrimdışı çalışır), arka planda ağdan tazesini çekip önbelleği güncelle.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

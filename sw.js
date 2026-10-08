// Limperial Luxury Showroom Service Worker - V25 Clean Slate
const CACHE_NAME = 'limperial-v4-default-background-1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './promotion-config.js?v=20261007-theme6',
  './quotation-registry.js?v=20261007-revisionhistory1',
  './seasonal-core.js?v=20261007-theme6',
  './seasonal-promotions.js?v=20261008-defaultbg1',
  './assets/seasonal/international-new-year.webp',
  './assets/seasonal/chinese-new-year.webp',
  './assets/seasonal/khmer-new-year.webp',
  './assets/seasonal/pchum-ben-data/01.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/02a.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/02b.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/03.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/04.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/05a.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/05b.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/06a.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/06b.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/07a.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/07b.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/08.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/09.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/10.js?v=20261007-pchumdata1',
  './assets/seasonal/pchum-ben-data/11.js?v=20261007-pchumdata1',
  './assets/seasonal/water-festival.webp',
  './assets/seasonal/christmas.webp',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon.svg',
  './apple-touch-icon.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Battambang:wght@400;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(url).catch((err) => console.warn('[SW] skip:', url)))
      );
    })
  );
});

// Force wipe ALL previous caches immediately on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First for HTML so new updates appear IMMEDIATELY
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // Never cache authenticated or time-sensitive campaign responses.
  if (new URL(request.url).hostname.endsWith('.supabase.co')) return;

  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  const isLocalScript = new URL(request.url).origin === self.location.origin && new URL(request.url).pathname.endsWith('.js');
  if (isDocument || isLocalScript) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(isDocument ? './index.html' : request))
    );
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.hostname.includes('google.com') || requestUrl.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {});
      return cachedResponse || fetchPromise;
    })
  );
});

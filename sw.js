/**
 * WortCoach Service Worker v3.1.0
 * Strateji: Yerel varlıklar için Network-First with Cache Fallback,
 * Harici API istekleri için Network-Only Pass-through (Canlı sözlük ve çeviri taramaları).
 */

const CACHE_NAME = 'wortcoach-v3.6.4';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css?v=3.6.2',
  './css/components.css?v=3.6.2',
  './js/config.js?v=3.6.2',
  './js/db.js?v=3.6.2',
  './js/verbHelper.js?v=3.6.2',
  './js/grammarEnrichment.js?v=3.6.2',
  './js/offlineDictionary.js?v=3.6.2',
  './js/dictionary.js?v=3.6.2',
  './js/curatedPacks.js?v=3.6.2',
  './js/seeder.js?v=3.6.2',
  './js/tts.js?v=3.6.2',
  './js/pronunciation.js?v=3.6.2',
  './js/translator.js?v=3.6.2',
  './js/game.js?v=3.6.2',
  './js/study.js?v=3.6.2',
  './js/stats.js?v=3.6.2',
  './js/coach.js?v=3.6.2',
  './js/deckBuilder.js?v=3.6.2',
  './js/social.js?v=3.6.2',
  './js/app.js?v=3.6.2',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Harici API çağrıları (Google Translate, DeepL, Tatoeba, Wiktionary, MyMemory, Google Fonts)
  if (url.origin !== self.location.origin) {
    // Sadece Google Fonts için Stale-While-Revalidate
    if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
      event.respondWith(
        caches.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((networkRes) => {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkRes.clone()));
            return networkRes;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      );
      return;
    }

    // Çeviri, MyMemory ve Wiktionary API çağrıları doğrudan canlı ağdan çekilir (Gerçek hata/başarı durumları korunur)
    event.respondWith(fetch(request));
    return;
  }

  // Yerel uygulama dosyaları için Network-First stratejisi
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 404, statusText: 'Not Found' });
        });
      })
  );
});

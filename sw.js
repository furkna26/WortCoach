/**
 * WortCoach Service Worker v3.1.0
 * Strateji: Yerel varlıklar için Network-First with Cache Fallback,
 * Harici API istekleri için Network-Only Pass-through (Canlı sözlük ve çeviri taramaları).
 */

const CACHE_NAME = 'wortcoach-v3.7.3';

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


// =========================================================================
// PWA Sistem Bildirimi Eylemleri (Notification Click & Actions: Katıl / Reddet)
// =========================================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};

  if (action === 'reject_match') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'REJECT_MATCH_INVITE', data });
        }
      })
    );
    return;
  }

  // 'join_match' veya doğrudan bildirime tıklama
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'JOIN_MATCH_INVITE', data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./#match-pin=' + (data.pin || ''));
      }
    })
  );
});


// =========================================================================
// PWA Web Push Bildirim Motoru (Uygulama Kapalıyken Uyandırma)
// =========================================================================
let currentPushUserId = null;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'STORE_PUSH_USER' && event.data.userId) {
    currentPushUserId = String(event.data.userId);
    if ('caches' in self) {
      caches.open('wortcoach-user-meta').then((c) => {
        c.put('/__active_user_id', new Response(String(event.data.userId)));
      }).catch(() => {});
    }
  }
});

async function getStoredPushUserId() {
  if (currentPushUserId) return currentPushUserId;
  try {
    if ('caches' in self) {
      const c = await caches.open('wortcoach-user-meta');
      const res = await c.match('/__active_user_id');
      if (res) return await res.text();
    }
  } catch (_) {}
  return null;
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    try {
      let title = 'WortCoach';
      let options = {
        body: 'Yeni bir davetiniz veya bildiriminiz var!',
        icon: 'icons/icon-192.svg',
        badge: 'icons/icon-192.svg',
        vibrate: [200, 100, 200],
        tag: 'wortcoach_remote_push',
        renotify: true
      };

      const userId = await getStoredPushUserId();
      if (userId) {
        const res = await fetch('https://wortcoach-proxy.mosmandurmaz26.workers.dev/api/decks/inbox/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        const data = await res.json();
        const items = Array.isArray(data.gifts) ? data.gifts : [];
        if (items.length > 0) {
          const latest = items[0];
          if (latest.type === 'match_invite') {
            title = 'WortCoach — Rekabet Daveti';
            options.body = `${latest.fromUsername} seni müsabakaya davet etti! (PIN: ${latest.pin})`;
            options.tag = 'match_inv_' + latest.id;
            options.data = { pin: latest.pin, giftId: latest.id, matchType: latest.matchType || 'kahoot' };
            options.actions = [
              { action: 'join_match', title: 'Katıl' },
              { action: 'reject_match', title: 'Reddet' }
            ];
          } else {
            title = 'WortCoach — Yeni Deste Hediyesi';
            options.body = `${latest.fromUsername} sana "${latest.deckTitle}" kelime destesini gönderdi.`;
            options.tag = 'gift_' + latest.id;
            options.data = { giftId: latest.id };
          }
        }
      }

      return self.registration.showNotification(title, options);
    } catch (err) {
      return self.registration.showNotification('WortCoach', {
        body: 'Yeni bir aktivite bildirimi aldınız.',
        icon: 'icons/icon-192.svg',
        badge: 'icons/icon-192.svg'
      });
    }
  })());
});

/**
 * @file sw.js
 * @description Service Worker for Smart Bill Auditor.
 * Implements Network-First for dynamic app code (HTML/JS/CSS) to ensure fresh updates,
 * and Cache-First for static assets (fonts, vendor).
 * Listens for user-initiated SKIP_WAITING to avoid disrupting active sessions.
 */

const SW_VERSION = '1.1.0';
const CACHE_NAME = `app-${SW_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.standalone.js',
  './manifest.json',
  './config.js',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/print.css',
  './js/demo/build-config.js',
  './js/demo/demo-data.js',
  './js/demo/demo-engine.js',
  './js/demo/synthetic-bills.js',
  './js/demo/tour.js',
  './i18n/en.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Some assets could not be precached during install:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('app-') && name !== CACHE_NAME)
          .map((name) => {
            console.log(`[SW] Purging outdated cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  const isFontOrVendor = url.pathname.includes('/fonts/') || url.pathname.includes('/vendor/');

  if (isFontOrVendor) {
    // Cache-First strategy for immutable static assets
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        });
      })
    );
  } else {
    // Network-First strategy for core app logic, HTML, JS, CSS
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Fallback for HTML navigation requests
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return new Response('Network error occurred and resource is not cached.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
        })
    );
  }
});

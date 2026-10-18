// Offline shell for the desktop / browser app. Supabase calls always go to the network.
const VERSION = 'bokra-v1.1.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/db.js', './js/model.js', './js/sync.js', './js/prayer.js', './js/util.js', './js/icons.js',
  './js/ui.js', './js/native.js', './js/sheets.js', './js/illus.js', './js/config.js',
  './js/views/parts.js', './js/views/today.js', './js/views/tasks.js', './js/views/week.js', './js/views/review.js', './js/views/settings.js',
  './icons/favicon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;
  if (url.hostname.includes('fonts.g')) {
    // fonts: cache first
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // app files: network first so updates land, cache when offline
  e.respondWith(fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});

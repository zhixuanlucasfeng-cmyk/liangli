/* 量力 Liangli — service worker
   改了 index.html 之后，把下面的版本号 +1，用户下次打开就会拿到新版本。 */
const VERSION = 'liangli-v5';
const VIDEO_CACHE = 'liangli-video-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/power-cat/idle.webp',
  './assets/power-cat/content.webp',
  './assets/power-cat/tired.webp',
  './assets/power-cat/exhausted.webp',
  './assets/power-human/idle.webp',
  './assets/power-human/content.webp',
  './assets/power-human/tired.webp',
  './assets/power-human/exhausted.webp'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION && k !== VIDEO_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 网络优先，失败回落到缓存 —— 保证联网时总能拿到最新版，断网时仍可用 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.pathname.endsWith('.mp4')) {
    e.respondWith(
      caches.open(VIDEO_CACHE).then(cache =>
        cache.match(e.request).then(cached => cached || fetch(e.request).then(res => {
          if (res.ok && res.status === 200) cache.put(e.request, res.clone()).catch(() => {});
          return res;
        }))
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

/* 量力 Liangli — service worker
   改了 index.html 之后，把下面的版本号 +1，用户下次打开就会拿到新版本。 */
const VERSION = 'liangli-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/power-cat/idle.mp4',
  './assets/power-cat/content.mp4',
  './assets/power-cat/tired.mp4',
  './assets/power-cat/exhausted.mp4',
  './assets/power-human/idle.mp4',
  './assets/power-human/content.mp4',
  './assets/power-human/tired.mp4',
  './assets/power-human/exhausted.mp4'
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
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 网络优先，失败回落到缓存 —— 保证联网时总能拿到最新版，断网时仍可用 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
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

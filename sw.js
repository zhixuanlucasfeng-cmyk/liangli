/* Powy — service worker
   改了 index.html 之后，把下面的版本号 +1，用户下次打开就会拿到新版本。 */
const VERSION = 'liangli-v12';
const VIDEO_CACHE = 'liangli-video-v1';
const ASSETS = [
  './',
  './index.html',
  './account-sync.js',
  './manifest.json?v=12',
  './powy-power-192.png',
  './powy-power-512.png',
  './powy-power-maskable-512.png',
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
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k =>
          k !== VERSION && k !== VIDEO_CACHE &&
          (/^liangli-v\d+$/.test(k) || /^liangli-video-v\d+$/.test(k))
        ).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function rangeResponse(response, rangeHeader) {
  if (!rangeHeader || response.status !== 200) return response;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return response;

  const body = await response.arrayBuffer();
  const size = body.byteLength;
  let start;
  let end;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (suffixLength <= 0) return rangeNotSatisfiable(size);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }

  if (start >= size || start > end) return rangeNotSatisfiable(size);

  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
}

function rangeNotSatisfiable(size) {
  return new Response(null, {
    status: 416,
    statusText: 'Range Not Satisfiable',
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes */${size}`,
      'Content-Length': '0',
    },
  });
}

async function serveVideo(request) {
  const cache = await caches.open(VIDEO_CACHE);
  const videoRequest = new Request(request.url);
  let response = await cache.match(videoRequest);
  if (!response) {
    response = await fetch(videoRequest);
    if (response.ok && response.status === 200) {
      await cache.put(videoRequest, response.clone());
    }
  }
  return rangeResponse(response, request.headers.get('Range'));
}

/* 网络优先，失败回落到缓存 —— 保证联网时总能拿到最新版，断网时仍可用 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  /* Supabase/Auth/CDN requests stay network-only and never enter the private PWA cache. */
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.mp4')) {
    e.respondWith(serveVideo(e.request));
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

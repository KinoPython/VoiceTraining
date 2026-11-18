// オフラインでも開くための Service Worker。パスは相対で書く（置き場所のフォルダ名に左右されないため）
const CACHE_PREFIX = 'koetore-';
const CACHE_NAME = CACHE_PREFIX + 'v1';

self.addEventListener('install', (event) => {
  // 入り口だけ先に保存する。残りは使ったときに保存される
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['./', './index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 古い版の保存分を消す（このアプリの名前のものだけ）
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// 保存分があればそれを返し、なければネットから取って保存する
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
  );
});

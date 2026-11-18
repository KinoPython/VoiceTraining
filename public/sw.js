// オフラインでも開くための Service Worker。パスは相対で書く（置き場所のフォルダ名に左右されないため）
const CACHE_PREFIX = 'koetore-';
// 下の2つの目印は、ビルドのときに vite.config.js が書きかえる
const CACHE_NAME = CACHE_PREFIX + '__BUILD_VERSION__';
const PRECACHE_LIST = '__PRECACHE_LIST__';

self.addEventListener('install', (event) => {
  // ビルドで出来た全ファイルを先に保存する（初めて開いたあと電波がなくても動かすため）
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_LIST)));
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
      if (response.ok) event.waitUntil(cache.put(request, response.clone()));
      return response;
    })
  );
});

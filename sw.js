// 課題トラッカー Service Worker（オフライン用）
// 画面を変えて公開したら、下の VERSION を上げると古いキャッシュが消えます
const VERSION = 'v1';
const CACHE = 'tracker-' + VERSION;
const SHELL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tracker-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // クラウド同期のAPI（別オリジンのWorker）や書き込み系はキャッシュしない
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // 画面：通信できれば最新を取って保存、できなければ保存済みを表示
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});

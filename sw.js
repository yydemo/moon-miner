// 月球挖矿离线缓存 Service Worker / Moon Miner offline-cache service worker
// 修改游戏文件后请把版本号加一，玩家会自动拿到新版本。
// Bump the version after changing game files so players receive the update.
const CACHE = 'moon-miner-v3-capsule-nft-1';
const FILES = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png',
  './js/data.js', './js/i18n.js', './js/core.js', './js/orbit.js', './js/vessel.js', './js/flight.js', './js/mining.js', './js/builder.js', './js/main.js'];

// 安装：预缓存全部文件 / install: pre-cache every file
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
// 激活：清理旧版本缓存 / activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 请求：缓存优先，失败再走网络 / fetch: cache first, then network
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});

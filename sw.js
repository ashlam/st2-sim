const CACHE = 'sts2sim-v10';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './src/main.js', './src/ui/app.js', './src/ui/inspect.js',
  './src/engine/combat.js', './src/engine/run.js', './src/engine/map.js', './src/engine/rng.js',
  './src/data/cards.js', './src/data/cards-silent.js', './src/data/cards-defect.js', './src/data/cards-regent.js', './src/data/orbs.js', './src/data/enemies.js', './src/data/items.js', './src/data/powers.js', './src/data/events.js', './src/data/characters.js', './src/data/glossary.js',
  './icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 先给缓存（离线可用），同时后台拉新版本写回缓存 —— 下次刷新即为最新，开发时也不用手动清缓存
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const network = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || network;
    })
  );
});

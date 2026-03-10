const CACHE_NAME = 'space-shooter-v8';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css?v=8',
  '/js/playerData.js?v=8',
  '/js/game.js?v=8',
  '/js/scenes/BootScene.js?v=8',
  '/js/scenes/MenuScene.js?v=8',
  '/js/scenes/ShopScene.js?v=8',
  '/js/scenes/GameScene.js?v=8',
  '/js/scenes/GameOverScene.js?v=8',
  '/js/chat.js?v=8',
  '/js/voice.js?v=8',
  '/js/menu.js?v=8',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: tenta rede, se falhar usa cache (funciona offline)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

const CACHE_NAME = 'space-shooter-v7';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css?v=7',
  '/js/game.js?v=7',
  '/js/scenes/BootScene.js?v=7',
  '/js/scenes/MenuScene.js?v=7',
  '/js/scenes/GameScene.js?v=7',
  '/js/scenes/GameOverScene.js?v=7',
  '/js/chat.js?v=7',
  '/js/voice.js?v=7',
  '/js/menu.js?v=7',
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

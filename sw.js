const CACHE_NAME = 'space-shooter-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/game.js',
  '/js/scenes/BootScene.js',
  '/js/scenes/MenuScene.js',
  '/js/scenes/GameScene.js',
  '/js/scenes/GameOverScene.js',
  '/js/chat.js',
  '/js/voice.js',
  '/js/menu.js',
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

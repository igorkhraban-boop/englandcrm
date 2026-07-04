const CACHE_NAME = 'england-crm-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/config.js',
  '/data.js',
  '/app.js',
  '/favicon.png',
  '/manifest.json'
];

// Установка: кэшируем основные файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Активация: удаляем старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => 
      Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Запросы: network-first, fallback на кэш
self.addEventListener('fetch', event => {
  // API-запросы (Supabase) всегда идут через сеть
  if (event.request.url.includes('supabase.co') || event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Обновляем кэш свежей копией
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

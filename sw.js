const CACHE_NAME = 'fin-hub-cache-v1';
const EXTERNAL_LIBS = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

const INTERNAL_FILES = [
    '/',
    '/index.html',
    '/mortgage.html',
    '/wealth.html',
    '/rent-vs-mortgage.html',
    '/time-is-money.html',
    '/inflation-shredder.html',
    '/car-vs-taxi.html',
    '/rates.json',
    '/inflation.json',
    '/regions.json'
];

// Установка Service Worker и кеширование ресурсов
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([...EXTERNAL_LIBS, ...INTERNAL_FILES]);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Стратегия обработки запросов
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Для внутренних файлов используем Network First (Сначала сеть)
    if (INTERNAL_FILES.some(file => url.pathname.endsWith(file) || url.pathname === '/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Обновляем кеш при успешном ответе
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Если сети нет — отдаем из кеша
                    return caches.match(event.request);
                })
        );
    }
    // Для внешних библиотек и прочего — Cache First (Сначала кеш)
    else {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});

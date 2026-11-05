const CACHE_NAME = 'yasnomera-cache-v18';
const PREVIOUS_CACHE_NAME = 'yasnomera-cache-v17';
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
    '/millionaire.html',
    '/financial-freedom.html',
    '/honest-credit.html',
    '/genetic-wealth.html',
    '/manifest.webmanifest',
    '/yasnomera-mark.svg',
    '/js/rent-vs-mortgage-model.js',
    '/css/product-polish.css',
    '/css/design-system.css',
    '/js/api.js',
    '/js/income-comparison.js',
    '/js/ndfl.js',
    '/js/calculator-state.js',
    '/js/inflation-calculator.js',
    '/js/theme.js',
    '/js/trust-layer.js',
    '/js/ui-utils.js',
    '/js/utils.js',
    '/rates.json',
    '/inflation.json',
    '/regions.json'
];

async function installCache() {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(INTERNAL_FILES);

    // Preserve existing CDN responses before activation can remove the old cache.
    const missing = await Promise.all(EXTERNAL_LIBS.map(async (url) => {
        if (await cache.match(url)) return null;
        const previous = await caches.match(url, { cacheName: PREVIOUS_CACHE_NAME });
        if (!previous || (!previous.ok && previous.type !== 'opaque')) return url;
        await cache.put(url, previous);
        return null;
    }));

    // A slow, unavailable or CORS-blocked CDN must not fail installation.
    await Promise.allSettled(missing.filter(Boolean).map(async (url) => {
        const response = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(4000) });
        if (response.ok) await cache.put(url, response);
    }));

    await self.skipWaiting();
}

self.addEventListener('install', (event) => {
    event.waitUntil(installCache());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter((name) => /^yasnomera-cache-v\d+$/.test(name) && name !== CACHE_NAME);
        await Promise.all(oldCaches.map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

// Стратегия обработки запросов
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Для внутренних файлов используем Network First (Сначала сеть)
    if (INTERNAL_FILES.some(file => url.pathname.endsWith(file) || url.pathname === '/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Keep the last usable response on HTTP errors and opaque CDN responses.
                    if (response.ok && event.request.method === 'GET') {
                        const responseClone = response.clone();
                        event.waitUntil(caches.open(CACHE_NAME)
                            .then((cache) => cache.put(event.request, responseClone))
                            .catch(() => {}));
                    }
                    return response;
                })
                .catch(() => {
                    // Если сети нет — отдаем из кеша
                    return caches.match(event.request, { cacheName: CACHE_NAME });
                })
        );
    }
    // Для внешних библиотек и прочего — Cache First (Сначала кеш)
    else {
        event.respondWith(
            caches.match(event.request, { cacheName: CACHE_NAME }).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});

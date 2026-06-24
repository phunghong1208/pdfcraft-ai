/**
 * Service Worker for PDFCraft
 */

const CACHE_NAME = 'pdfcraft-cache-v2';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Cache LibreOffice WASM assets
    const isLibreOfficeAsset = url.pathname.startsWith('/libreoffice-wasm/') &&
        (url.pathname.endsWith('.wasm') ||
            url.pathname.endsWith('.wasm.gz') ||
            url.pathname.endsWith('.data') ||
            url.pathname.endsWith('.data.gz') ||
            url.pathname.endsWith('.js'));

    // Cache CJK font files (used by LibreOffice WASM for Chinese/Japanese/Korean support)
    const isFontAsset = url.pathname.startsWith('/fonts/') &&
        (url.pathname.endsWith('.ttf') ||
            url.pathname.endsWith('.otf') ||
            url.pathname.endsWith('.woff2'));

    if (isLibreOfficeAsset || isFontAsset) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // Pass through all other requests
});

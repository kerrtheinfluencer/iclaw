/**
 * coi-serviceworker — Cross-Origin Isolation via Service Worker
 * Injects COOP/COEP headers on every response, enabling SharedArrayBuffer
 * which unlocks multi-thread WASM (wllama multi-thread = 3-5x faster)
 * 
 * Based on: https://github.com/gzuidhof/coi-serviceworker
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', function(e) {
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      // Only modify responses we can actually read
      if (response.status === 0) return response;

      const newHeaders = new Headers(response.headers);
      newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
      newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
      newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }).catch(function(e) {
      console.error(e);
    })
  );
});

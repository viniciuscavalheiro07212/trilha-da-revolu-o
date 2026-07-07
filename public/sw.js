// Service worker do app de validacao (PWA).
// Estrategia: rede primeiro para navegacao (HTML sempre fresco, com fallback
// offline) e cache-primeiro com atualizacao em segundo plano para assets, que
// o Vite versiona por hash no nome do arquivo.
const CACHE = "trilha-validacao-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // So paginas e assets do proprio site; chamadas ao Supabase vao direto.
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        // Offline: tenta a propria pagina no cache (ignorando query string,
        // ex.: ?vouchers=1) e, em ultimo caso, o app de validacao.
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((cached) => cached || caches.match("/validacao.html")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetched;
    }),
  );
});

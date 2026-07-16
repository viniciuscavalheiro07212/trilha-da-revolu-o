// Service worker do app de validacao (PWA).
// Estrategia: rede primeiro para navegacao (HTML sempre fresco, com fallback
// offline) e cache-primeiro com atualizacao em segundo plano para assets, que
// o Vite versiona por hash no nome do arquivo.
const CACHE = "trilha-validacao-v3";

function isCacheableAsset(request, url) {
  if (url.pathname.startsWith("/api/")) return false;
  if (request.cache === "no-store" || request.headers.has("authorization")) return false;

  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    ["style", "script", "image", "font", "worker"].includes(request.destination)
  );
}

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
  const url = new URL(request.url);

  // So paginas e assets publicos do proprio site. APIs, requisicoes autenticadas
  // e respostas marcadas como no-store nunca passam pelo cache offline.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || request.headers.has("authorization")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.headers.get("cache-control")?.includes("no-store")) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
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

  if (!isCacheableAsset(request, url)) return;

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
        .catch(() => cached || Response.error());

      return cached || fetched;
    }),
  );
});

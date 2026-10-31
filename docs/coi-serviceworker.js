/*! coi-serviceworker - Guido Zuidhof, licensed under MIT */
/* Service Worker: intercepts all fetches and adds COOP/COEP headers. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.status === 0) return r;
      const headers = new Headers(r.headers);
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
    }).catch((err) => console.error(err))
  );
});

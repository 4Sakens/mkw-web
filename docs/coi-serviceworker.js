/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
/*
 * Adds Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 * via a Service Worker so that SharedArrayBuffer works on static hosts
 * (GitHub Pages, Netlify, etc.) that don't let you set response headers.
 */
if (typeof window === 'undefined') {
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
} else {
  const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
  window.sessionStorage.removeItem("coiReloadedBySelf");
  const coepDegrading = reloadedBySelf === "coepdegrade";
  if (window.crossOriginIsolated !== false || !window.isSecureContext) {
    // Already isolated or not HTTPS — nothing to do.
  } else {
    navigator.serviceWorker
      .register(new URL(import.meta.url).pathname)
      .then(
        (reg) => {
          if (reg.controller) {
            if (!coepDegrading) {
              window.sessionStorage.setItem("coiReloadedBySelf", "coireload");
              window.location.reload();
            }
          } else {
            reg.addEventListener("controllerchange", () => {
              if (!coepDegrading) {
                window.sessionStorage.setItem("coiReloadedBySelf", "coireload");
                window.location.reload();
              }
            });
          }
        },
        (err) => console.error("COI SW registration failed:", err)
      );
  }
}

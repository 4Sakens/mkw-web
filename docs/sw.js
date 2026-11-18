/*! coi-serviceworker - Guido Zuidhof, licensed under MIT (modified) */
/* Service Worker: adds COOP/COEP headers + rewrites absolute paths for GitHub Pages subdir hosting. */
/* v3 — adds runtime caching of static assets (HTML/JS/WASM) so repeat loads are instant. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  (async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  })()
));

// The WASM binary hardcodes absolute fetch paths like /blobs/*, /play/*, etc.
// On GitHub Pages the site lives at /mkw-web/, so rewrite those to the correct subdir.
const BASE = new URL("./", self.registration.scope).pathname;
const REWRITE_PREFIXES = ["/blobs/", "/play/", "/game/"];

// Runtime cache for static assets (HTML/JS/WASM/JSON blobs). Bump when asset URLs change.
const CACHE = "mkw-static-v3";
// Large data files that must always come from the network (release archives / user imports).
const NO_CACHE_PREFIXES = ["/gamedata/", "/game/"];

function rewriteUrl(url) {
  const u = new URL(url);
  if (u.origin !== self.location.origin) return url;
  for (const prefix of REWRITE_PREFIXES) {
    if (u.pathname.startsWith(prefix) && !u.pathname.startsWith(BASE)) {
      u.pathname = BASE + u.pathname.slice(1);
      return u.href;
    }
  }
  return url;
}

function withIsolationHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener("fetch", (e) => {
  if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;
  // Let cross-origin requests (e.g. GitHub Release downloads) pass through untouched.
  const reqUrl = new URL(e.request.url);
  if (reqUrl.origin !== self.location.origin) return;

  const rewritten = rewriteUrl(e.request.url);
  const req = rewritten !== e.request.url ? new Request(rewritten, e.request) : e.request;
  const url = new URL(req.url);
  const cacheable = req.method === "GET" && !NO_CACHE_PREFIXES.some((p) => url.pathname.startsWith(p));

  const respond = async () => {
    if (cacheable) {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
    }
    const response = await fetch(req);
    if (response.status === 0) return response;
    const wrapped = withIsolationHeaders(response);
    if (cacheable) cache.put(req, wrapped.clone()).catch(() => {});
    return wrapped;
  };

  e.respondWith(
    respond().then(
      (r) => r,
      (err) => console.error(err)
    )
  );
});

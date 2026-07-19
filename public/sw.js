/**
 * Service worker — offline capability for an app that genuinely can run offline.
 *
 * The whole deterministic engine (astronomy, pillars, scoring, verification)
 * executes in the browser with no network in the calculation path, so once the
 * shell is cached a user can get a full reading on a plane. That's the reason
 * this exists — not installability theatre.
 *
 * Strategy:
 *   - navigations → network-first, falling back to the cached shell when offline
 *     (so a deploy is picked up immediately, but offline still boots).
 *   - same-origin static assets → cache-first (Vite content-hashes filenames, so
 *     a cached hit is always the right bytes and can never go stale).
 *   - everything else (Anthropic, Stripe, Firebase, the billing/chat functions)
 *     → not touched. Never cache a request that spends money or carries a token.
 *
 * No build-time precache manifest: the cache fills from real navigation, which
 * keeps this a plain static file with no plugin in the build.
 */
const VERSION = "wei-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener("install", (event) => {
  // Take over as soon as the new worker is ready rather than waiting for every
  // tab to close — a stale shell is the classic PWA support complaint.
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** Requests that must always hit the network, whatever the cache holds. */
function isBypassed(url, request) {
  if (url.origin !== self.location.origin) return true; // third-party APIs
  if (request.method !== "GET") return true;
  return url.pathname.includes("/api/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (isBypassed(url, request)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put("shell", fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL);
          const cached = (await cache.match("shell")) || (await caches.match(request));
          // No cached shell yet (first visit happened to be offline) — let the
          // browser show its own offline page rather than a blank response.
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      // Only store real, complete responses; an opaque or error response cached
      // here would be served forever.
      if (fresh.ok && fresh.type === "basic") cache.put(request, fresh.clone());
      return fresh;
    })(),
  );
});

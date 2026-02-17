// Automaker Service Worker - Optimized for mobile PWA loading performance
const CACHE_NAME = 'automaker-v3';

// Separate cache for immutable hashed assets (long-lived)
const IMMUTABLE_CACHE = 'automaker-immutable-v2';

// Separate cache for API responses (short-lived, stale-while-revalidate on mobile)
const API_CACHE = 'automaker-api-v1';

// Assets to cache on install (app shell for instant loading)
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
  '/logo_larger.png',
  '/automaker.svg',
  '/favicon.ico',
];

// Whether mobile caching is enabled (set via message from main thread)
let mobileMode = false;

// API endpoints that are safe to serve from stale cache on mobile.
// These are GET-only, read-heavy endpoints where showing slightly stale data
// is far better than a blank screen or reload on flaky mobile connections.
const CACHEABLE_API_PATTERNS = [
  '/api/features',
  '/api/settings',
  '/api/models',
  '/api/usage',
  '/api/worktrees',
  '/api/github',
  '/api/cli',
  '/api/sessions',
  '/api/running-agents',
  '/api/pipeline',
  '/api/workspace',
  '/api/spec',
];

// Max age for API cache entries (5 minutes).
// After this, even mobile will require a network fetch.
const API_CACHE_MAX_AGE = 5 * 60 * 1000;

// Maximum entries in API cache to prevent unbounded growth
const API_CACHE_MAX_ENTRIES = 100;

/**
 * Check if an API request is safe to cache (read-only data endpoints)
 */
function isCacheableApiRequest(url) {
  const path = url.pathname;
  if (!path.startsWith('/api/')) return false;
  return CACHEABLE_API_PATTERNS.some((pattern) => path.startsWith(pattern));
}

/**
 * Check if a cached API response is still fresh enough to use
 */
function isApiCacheFresh(response) {
  const cachedAt = response.headers.get('x-sw-cached-at');
  if (!cachedAt) return false;
  return Date.now() - parseInt(cachedAt, 10) < API_CACHE_MAX_AGE;
}

/**
 * Clone a response and add a timestamp header for cache freshness tracking
 */
async function addCacheTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sw-cached-at', String(Date.now()));
  const body = await response.clone().blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  // Activate immediately without waiting for existing clients
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove old caches (both regular and immutable)
  const validCaches = new Set([CACHE_NAME, IMMUTABLE_CACHE, API_CACHE]);
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.filter((name) => !validCaches.has(name)).map((name) => caches.delete(name))
        );
      }),
      // Enable Navigation Preload for faster navigation responses on mobile.
      // When enabled, the browser fires the navigation fetch in parallel with
      // service worker boot, eliminating the SW startup delay (~50-200ms on mobile).
      self.registration.navigationPreload && self.registration.navigationPreload.enable(),
    ])
  );
  // Take control of all clients immediately
  self.clients.claim();
});

/**
 * Determine if a URL points to an immutable hashed asset.
 * Vite produces filenames like /assets/index-D3f1k2.js or /assets/style-Ab12Cd.css
 * These contain content hashes and are safe to cache permanently.
 */
function isImmutableAsset(url) {
  const path = url.pathname;
  // Match Vite's hashed asset pattern: /assets/<name>-<hash>.<ext>
  if (path.startsWith('/assets/') && /\-[A-Za-z0-9_-]{6,}\.\w+$/.test(path)) {
    return true;
  }
  // Font files are immutable (woff2, woff, ttf, otf)
  if (/\.(woff2?|ttf|otf)$/.test(path)) {
    return true;
  }
  return false;
}

/**
 * Determine if a URL points to a static asset that benefits from stale-while-revalidate
 */
function isStaticAsset(url) {
  const path = url.pathname;
  return /\.(png|jpg|jpeg|gif|svg|ico|webp|mp3|wav)$/.test(path);
}

/**
 * Determine if a request is for a navigation (HTML page)
 */
function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
  );
}

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Strategy 5 (mobile only): Stale-while-revalidate for cacheable API requests.
  // On mobile, flaky connections cause blank screens and reloads. By serving
  // cached API responses immediately and refreshing in the background, we ensure
  // the UI always has data to render, even on slow or interrupted connections.
  // The main thread's React Query layer handles the eventual fresh data via its
  // own refetching mechanism, so the user sees updates within seconds.
  if (url.pathname.startsWith('/api/')) {
    if (mobileMode && isCacheableApiRequest(url)) {
      event.respondWith(
        (async () => {
          const cache = await caches.open(API_CACHE);
          const cachedResponse = await cache.match(event.request);

          // Start network fetch in background regardless
          const fetchPromise = fetch(event.request)
            .then(async (networkResponse) => {
              if (networkResponse.ok) {
                // Store with timestamp for freshness checking
                const timestampedResponse = await addCacheTimestamp(networkResponse);
                cache.put(event.request, timestampedResponse);
              }
              return networkResponse;
            })
            .catch((err) => {
              // Network failed - if we have cache, that's fine (returned below)
              // If no cache, propagate the error
              if (cachedResponse) return null;
              throw err;
            });

          // If we have a fresh-enough cached response, return it immediately
          if (cachedResponse && isApiCacheFresh(cachedResponse)) {
            // Return cached data instantly - network update happens in background
            return cachedResponse;
          }

          // If we have a stale cached response but network is slow, race them:
          // Return whichever resolves first (cached immediately vs network)
          if (cachedResponse) {
            // Give network a brief window (2s) to respond, otherwise use stale cache
            const networkResult = await Promise.race([
              fetchPromise,
              new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
            ]);
            return networkResult || cachedResponse;
          }

          // No cache at all - must wait for network
          return fetchPromise;
        })()
      );
      return;
    }
    // Non-mobile or non-cacheable API: skip SW, let browser handle normally
    return;
  }

  // Strategy 1: Cache-first for immutable hashed assets (JS/CSS bundles, fonts)
  // These files contain content hashes in their names - they never change.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(IMMUTABLE_CACHE).then((cache) => {
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

  // Strategy 2: Stale-while-revalidate for static assets (images, audio)
  // Serve cached version immediately, update cache in background.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.ok && networkResponse.type === 'basic') {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          // Return cached version immediately, or wait for network
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Strategy 3: Network-first for navigation requests (HTML)
  // Uses Navigation Preload when available - the browser fires the network request
  // in parallel with SW startup, eliminating the ~50-200ms SW boot delay on mobile.
  // Falls back to regular fetch when Navigation Preload is not supported.
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      (async () => {
        try {
          // Use the preloaded response if available (fired during SW boot)
          // This is the key mobile performance win - no waiting for SW to start
          const preloadResponse = event.preloadResponse && (await event.preloadResponse);
          if (preloadResponse) {
            // Cache the preloaded response for offline use
            if (preloadResponse.ok && preloadResponse.type === 'basic') {
              const clone = preloadResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return preloadResponse;
          }

          // Fallback to regular fetch if Navigation Preload is not available
          const response = await fetch(event.request);
          if (response.ok && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        } catch (e) {
          // Offline: serve the cached app shell
          const cached = await caches.match('/');
          return (
            cached ||
            (await caches.match(event.request)) ||
            new Response('Offline', { status: 503 })
          );
        }
      })()
    );
    return;
  }

  // Strategy 4: Network-first for everything else
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Periodic cleanup of the immutable cache to prevent unbounded growth
// Remove entries older than 30 days when cache exceeds 200 entries
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_CLEANUP') {
    const MAX_ENTRIES = 200;
    caches.open(IMMUTABLE_CACHE).then((cache) => {
      cache.keys().then((keys) => {
        if (keys.length > MAX_ENTRIES) {
          // Delete oldest entries (first in, first out)
          const deleteCount = keys.length - MAX_ENTRIES;
          keys.slice(0, deleteCount).forEach((key) => cache.delete(key));
        }
      });
    });

    // Also clean up API cache
    caches.open(API_CACHE).then((cache) => {
      cache.keys().then((keys) => {
        if (keys.length > API_CACHE_MAX_ENTRIES) {
          const deleteCount = keys.length - API_CACHE_MAX_ENTRIES;
          keys.slice(0, deleteCount).forEach((key) => cache.delete(key));
        }
      });
    });
  }

  // Enable/disable mobile caching mode.
  // Sent from main thread after detecting the device is mobile.
  // This allows the SW to apply mobile-specific caching strategies.
  if (event.data?.type === 'SET_MOBILE_MODE') {
    mobileMode = !!event.data.enabled;
  }

  // Warm the immutable cache with critical assets the app will need.
  // Called from the main thread after the initial render is complete,
  // so we don't compete with critical resource loading on mobile.
  if (event.data?.type === 'PRECACHE_ASSETS' && Array.isArray(event.data.urls)) {
    caches.open(IMMUTABLE_CACHE).then((cache) => {
      event.data.urls.forEach((url) => {
        cache.match(url).then((existing) => {
          if (!existing) {
            fetch(url, { priority: 'low' })
              .then((response) => {
                if (response.ok) {
                  cache.put(url, response);
                }
              })
              .catch(() => {
                // Silently ignore precache failures
              });
          }
        });
      });
    });
  }
});

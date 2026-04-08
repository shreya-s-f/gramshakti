/*
  ============================================================
  GRAMSHAKTI SERVICE WORKER
  ============================================================

  What is a Service Worker?
  ─────────────────────────
  A Service Worker is a JavaScript file that runs in the
  BACKGROUND — separate from your main web page.

  It sits between your app and the internet, like a middleman.
  Every time your app tries to fetch something from the internet,
  the service worker INTERCEPTS the request and decides:
  "Should I get this from cache or from the network?"

  This is how the app works OFFLINE!

  3 Life Events of a Service Worker:
  ─────────────────────────────────
  1. INSTALL   — runs once when SW is first registered
                 → We cache all our files here
  2. ACTIVATE  — runs after install, when SW takes control
                 → We delete old caches here
  3. FETCH     — runs on EVERY network request
                 → We serve from cache if available
*/

var CACHE_NAME = 'gramshakti-cache-v1';
/*
  Cache name = like a folder name for stored files
  When we update the app, we change v1 to v2
  This lets us clear old cached files in the activate event
*/

var FILES_TO_CACHE = [
  /*
    These are all the files we want to cache for offline use
    The service worker downloads all of these on first visit
  */
  '/',
  '/index.html',
  '/mandi.html',
  '/weather.html',
  '/scheme.html',
  '/crop.html',
  '/sos.html',
  '/manifest.json',
];

/* ============================================================
   INSTALL EVENT — Cache all files
   Runs once when service worker is first registered
   ============================================================ */
self.addEventListener('install', function(event) {
  /*
    self = the service worker itself (not the window)
    'install' = fires when service worker is first installed
  */

  console.log('[SW] Installing GramShakti Service Worker...');

  event.waitUntil(
    /*
      event.waitUntil() = "don't finish installing until this Promise resolves"
      Ensures all files are cached before SW becomes active
    */
    caches.open(CACHE_NAME)
      /*
        caches = browser's Cache Storage API
        caches.open(name) = open (or create) a cache with this name
        Returns a Promise that resolves with a Cache object
      */
      .then(function(cache) {
        console.log('[SW] Caching all app files...');
        return cache.addAll(FILES_TO_CACHE);
        /*
          cache.addAll([...]) = download and store all these files
          If ANY file fails to download, the whole install fails
        */
      })
      .then(function() {
        console.log('[SW] All files cached successfully!');
        return self.skipWaiting();
        /*
          skipWaiting() = activate immediately, don't wait for old SW to die
          Without this, new service worker waits until all tabs are closed
        */
      })
  );
});

/* ============================================================
   ACTIVATE EVENT — Clean up old caches
   Runs after install, when SW takes control of the page
   ============================================================ */
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');

  event.waitUntil(
    caches.keys()
      /*
        caches.keys() = get names of ALL caches stored in browser
        Returns a Promise with an array of cache names
        e.g. ['gramshakti-cache-v1', 'gramshakti-cache-v0']
      */
      .then(function(cacheNames) {
        return Promise.all(
          /*
            Promise.all([...]) = wait for ALL promises to resolve
            We delete multiple caches simultaneously
          */
          cacheNames
            .filter(function(name) {
              return name !== CACHE_NAME;
              /* Keep only the CURRENT cache, delete all OLD caches */
            })
            .map(function(name) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
              /* Delete each old cache */
            })
        );
      })
      .then(function() {
        return self.clients.claim();
        /*
          clients.claim() = immediately control all open tabs
          Without this, existing tabs still use the old service worker
        */
      })
  );
});

/* ============================================================
   FETCH EVENT — Serve from cache when offline
   Runs on EVERY network request the app makes
   ============================================================ */
self.addEventListener('fetch', function(event) {
  /*
    event.request = the network request being made
    event.request.url = the URL being requested
  */

  /* Skip non-GET requests (POST, PUT, DELETE) — don't cache these */
  if (event.request.method !== 'GET') return;

  /* Skip external API calls — only cache our own files */
  if (event.request.url.includes('openweathermap.org') ||
      event.request.url.includes('firebase') ||
      event.request.url.includes('googleapis.com/css')) {
    /* Let these go to network directly */
    return;
  }

  event.respondWith(
    /*
      event.respondWith() = "here is the response for this request"
      Instead of normal network fetch, we provide our own response
    */

    caches.match(event.request)
      /*
        caches.match() = search ALL caches for a matching request
        Returns the cached response if found, or undefined if not
      */
      .then(function(cachedResponse) {

        if (cachedResponse) {
          /* FILE FOUND IN CACHE — serve it immediately (even offline!) */
          console.log('[SW] Serving from cache:', event.request.url);
          return cachedResponse;
        }

        /* NOT IN CACHE — fetch from network */
        console.log('[SW] Fetching from network:', event.request.url);
        return fetch(event.request)
          .then(function(networkResponse) {
            /*
              We got a network response!
              Let's also CACHE IT so next time we can serve offline
            */

            if (!networkResponse || networkResponse.status !== 200) {
              /* Don't cache error responses */
              return networkResponse;
            }

            var responseToCache = networkResponse.clone();
            /*
              .clone() = make a copy of the response
              We need to clone because a Response can only be read ONCE
              We read one copy for the cache, and send the original to the browser
            */

            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseToCache);
              /* cache.put(request, response) = store this response for this URL */
            });

            return networkResponse;
            /* Send the original response to the browser */
          })
          .catch(function() {
            /*
              Network request failed (user is offline)
              AND file not in cache
              Show a fallback page
            */
            if (event.request.destination === 'document') {
              /* User tried to navigate to a page — show offline fallback */
              return caches.match('/index.html');
              /* Serve home page as fallback */
            }
          });
      })
  );
});

/* ============================================================
   BACKGROUND SYNC (bonus feature)
   Queues failed requests and retries when back online
   ============================================================ */
self.addEventListener('sync', function(event) {
  /*
    'sync' fires when connection is restored after being offline
    We can use this to retry failed SOS alerts or data saves
  */
  if (event.tag === 'sos-retry') {
    event.waitUntil(retrySOS());
  }
});

async function retrySOS() {
  /* Retry any failed SOS alerts that were queued while offline */
  console.log('[SW] Retrying queued SOS alerts...');
  /* In production: read from IndexedDB queue and re-send */
}

/* ============================================================
   PUSH NOTIFICATIONS (bonus feature)
   Receive notifications even when app is closed
   ============================================================ */
self.addEventListener('push', function(event) {
  /*
    'push' fires when a push notification arrives from server
    Works even when the app is completely closed!
  */
  var data = event.data ? event.data.json() : {};

  var options = {
    body:    data.body    || 'New alert from GramShakti',
    icon:    data.icon    || '/icon-192.png',
    badge:   data.badge   || '/icon-192.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'GramShakti Alert',
      options
    )
    /*
      showNotification() = show a system notification
      Appears on phone screen even if app is not open
    */
  );
});

self.addEventListener('notificationclick', function(event) {
  /* User tapped the notification */
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
    /* Open the app to the relevant page */
  );
});

console.log('[SW] GramShakti Service Worker loaded! ✅');

// EBA Materials Tracker — Service Worker
// Cache-first for app shell, network-first for Supabase API, background sync for offline queue

const CACHE_NAME    = 'eba-tracker-v1';
const SUPABASE_HOST = 'mtyyqmgjfzuwuylhxvqn.supabase.co';
const SYNC_TAG      = 'eba-offline-sync';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.filter(u => !u.startsWith('https'))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ───────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for Supabase API calls
  if (url.hostname === SUPABASE_HOST) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for app shell
  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// ── Background sync: flush offline queue ─────────────────────
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushOfflineQueue());
  }
});

async function flushOfflineQueue() {
  // Notify all clients to flush their IndexedDB offline queue
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'FLUSH_QUEUE' }));
}

// ── Push messages from client ─────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

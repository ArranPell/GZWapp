// Service worker: offline app shell + cached game data.
// VERSION is replaced with the commit SHA by the deploy workflow, so every
// release installs a fresh, complete copy of the shell. While it reads 'dev'
// the shell is fetched network-first so local edits show up immediately.

const VERSION = 'dev';
const SHELL_CACHE = `gzw-shell-${VERSION}`;
const API_CACHE = 'gzw-api-v1'; // keep in sync with js/api.js
const API_ORIGIN = 'https://gzw-data.dev';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/main.js',
  './js/api.js',
  './js/catalog.js',
  './js/data.js',
  './js/lib.js',
  './js/pwa.js',
  './js/store.js',
  './js/ui.js',
  './js/views/characters.js',
  './js/views/database.js',
  './js/views/home.js',
  './js/views/item.js',
  './js/views/keys.js',
  './js/views/loot.js',
  './js/views/search.js',
  './js/views/settings.js',
  './js/views/tasks.js',
  './js/views/vendors.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('gzw-shell-') && n !== SHELL_CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function fromCacheThenNetwork(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function fromNetworkThenCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: cacheName === SHELL_CACHE });
    if (hit) return hit;
    throw err;
  }
}

// Serve cached data instantly, refresh it in the background for next time.
async function staleWhileRevalidate(event) {
  const cache = await caches.open(API_CACHE);
  const hit = await cache.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(network.catch(() => {}));
    return hit;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === API_ORIGIN && url.pathname.startsWith('/api/')) {
    // Search results depend on the query and go stale fast: network first.
    if (url.pathname.endsWith('/search')) event.respondWith(fromNetworkThenCache(request, API_CACHE));
    else event.respondWith(staleWhileRevalidate(event));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Single-page app: every navigation is index.html.
    const index = new URL('./index.html', self.registration.scope).href;
    event.respondWith(VERSION === 'dev' ? fromNetworkThenCache(index, SHELL_CACHE) : fromCacheThenNetwork(index));
    return;
  }

  event.respondWith(VERSION === 'dev' ? fromNetworkThenCache(request, SHELL_CACHE) : fromCacheThenNetwork(request));
});

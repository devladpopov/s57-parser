// Service worker for the offline plotter: app shell is cached on install and
// refreshed in the background; OSM and OpenSeaMap tiles are cached as they are viewed so the
// areas you looked at stay visible offline. Charts live in IndexedDB.
const SHELL = 'plotter-shell-v2';
const TILES = 'plotter-tiles-v1';
const MAX_TILES = 3000;
const TILE_HOSTS = new Set(['tile.openstreetmap.org', 'tiles.openseamap.org']);
const SHELL_URLS = [
  './plotter.html',
  './dist/plotter.js',
  './plotter.webmanifest',
  './plotter-icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

self.addEventListener('install', (e) => {
  // One by one: in the Android app the Leaflet CSS is local and the unpkg
  // copy may be unreachable, which must not fail the whole install.
  e.waitUntil(caches.open(SHELL)
    .then((c) => Promise.allSettled(SHELL_URLS.map((u) => c.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (TILE_HOSTS.has(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const resp = await fetch(e.request);
      if (resp.ok) { cache.put(e.request, resp.clone()); trimTiles(); }
      return resp;
    }));
    return;
  }

  const shell = SHELL_URLS.some((u) => new URL(u, self.location).href === url.href.split('?')[0]);
  if (shell) {
    // Stale-while-revalidate: instant offline start, updates on the next visit.
    e.respondWith(caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then((resp) => { if (resp.ok) cache.put(e.request, resp.clone()); return resp; }).catch(() => hit);
      return hit ?? net;
    }));
  }
});

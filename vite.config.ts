import { defineConfig, type Plugin } from 'vite';

/**
 * Emits sw.js with the list of built files baked in, so the game works offline after the first visit.
 */
function serviceWorker(): Plugin {
  return {
    name: 'peregruzka-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const version = Date.now().toString(36);
      const precache = ['./', ...files, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'favicon.png'];
      const source = `
const CACHE = 'peregruzka-${version}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Google Fonts: stale-while-revalidate into the same cache.
  if (url.origin !== location.origin) {
    if (!url.hostname.endsWith('gstatic.com') && !url.hostname.endsWith('googleapis.com')) return;
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // Navigations: network first so updates arrive, cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: '/game-prototype/',
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1200 },
  plugins: [serviceWorker()],
});

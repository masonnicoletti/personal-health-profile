/* Personal Health Profile: offline support
 * Network first, so updates appear as soon as they are published; the cached copy is used when offline.
 * This only caches the app's own files. Health information stays in the browser's local storage.
 */
const CACHE = 'php-v3';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'js/schema.js',
  'js/pdf.js',
  'js/core.js',
  'js/fields.js',
  'js/sections.js',
  'js/screens.js',
  'js/pdf-panel.js',
  'js/main.js',
  'manifest.webmanifest',
  'vendor/jspdf.umd.min.js',
  'vendor/jspdf.plugin.autotable.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: true })
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : undefined))
          .then((hit) => hit || Response.error())
      )
  );
});

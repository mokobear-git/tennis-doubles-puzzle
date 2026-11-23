const CACHE = 'tdp-v2';
const FILES = ['./', 'index.html', 'css/style.css', 'js/engine.js', 'js/problems1.js', 'js/problems1b.js', 'js/problems2.js', 'js/problems3.js', 'js/problems4.js', 'js/app.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// ネット優先、失敗時はキャッシュ（更新が反映されやすい）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});

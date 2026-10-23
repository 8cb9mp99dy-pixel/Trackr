/* Trackr service worker — keeps a copy of the app itself (not your data: that stays in the
   browser storage and Supabase) so it opens instantly and works offline.

   Strategy for the app's own files: answer from the copy right away, fetch the online version
   in the background, store it for next time, and tell the open app when something changed so
   it can offer to reload. Only this site's own files are handled; Supabase, prices and fonts
   always go straight to the network. */
const CACHE = 'trackr-app-v52';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './excel-import.js', './rules.js', './budget-import.js', './trade-import.js', './notify.js', './loan.js', './wallet.js', './interest.js', './allocation.js', './freelance.js', './nav.js', './topbar.js', './overview.js', './wealth.js', './planner.js', './future.js', './nwmoves.js', './photos.js', './receipts.js', './goals.js', './cashflow.js', './forecast.js', './analysis.js', './returns.js', './xray.js', './box3.js', './invest.js', './staking.js', './report.js', './motion.js', './backup-excel.js', './ticker.js', './watchlist.js', './emergency.js', './palette.js', './insights.js', './yearreview.js', './quickadd.js', './ai-export.js', './safety.js',
  './assets/logos/logos.js', './assets/vendor/xlsx.full.min.js', './assets/vendor/jspdf.umd.min.js', './assets/vendor/html2canvas.min.js', './manifest.webmanifest',
  './assets/icons/apple-touch-icon.png', './assets/icons/icon-32.png', './assets/icons/icon-48.png', './assets/icons/icon-192.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const changed = (a, b) => {
  if (!a || !b) return false;
  const tag = r => r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length') || '';
  return tag(a) !== '' && tag(a) !== tag(b);
};
async function notifyUpdate() {
  const all = await self.clients.matchAll({ type: 'window' });
  all.forEach(c => c.postMessage({ type: 'trackr-updated' }));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(req, { cache: 'no-cache' }).then(async res => {
      if (res && res.ok && res.type === 'basic') {
        if (changed(cached, res) && /\.(js|css|html)$|\/$/.test(url.pathname)) notifyUpdate();
        await cache.put(key, res.clone());
      }
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    return res || (req.mode === 'navigate' ? (await cache.match('./index.html')) : null) || new Response('', { status: 504 });
  })());
});

// A Trackr notification tapped: bring the open app forward, or open it.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow('./');
  })());
});

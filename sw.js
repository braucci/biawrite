/* BiaWrite — service worker.
 * Tiene in cache i file dell'applicazione perché si apra anche senza rete.
 * Con la rete si preferisce sempre la versione pubblicata (gli aggiornamenti arrivano subito);
 * se la rete non risponde entro 3 secondi si usa la copia in cache.
 * Le chiamate a GitHub non passano di qui.                                                    */
const CACHE = 'biawrite-1.9.0';
const FILE = ['./', 'index.html', 'tema.js', 'core.js', 'archivio.js', 'importa.js', 'meteo.js', 'diario.js', 'cruscotto.js', 'diario.css', 'stile.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'fonts/kalam-latin-400-normal.woff2', 'fonts/kalam-latin-700-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2', 'fonts/ibm-plex-mono-latin-400-italic.woff2', 'fonts/ibm-plex-mono-latin-700-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // solo le cache di BiaWrite: le altre pagine dello stesso sito (braucci.github.io/…) hanno le loro
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('biawrite-') && n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const rete = fetch(r, { cache: 'no-cache' }).then(risp => { if (risp.ok) cache.put(r, risp.clone()); return risp; });
    const attesa = new Promise(res => setTimeout(res, 3000));
    try {
      const risp = await Promise.race([rete, attesa]);
      if (risp) return risp;
    } catch (x) { /* senza rete */ }
    const copia = await cache.match(r, { ignoreSearch: true });
    return copia || rete.catch(() => new Response('BiaWrite non è in linea e questa risorsa non è in cache.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  })());
});

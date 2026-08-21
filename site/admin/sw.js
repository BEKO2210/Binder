const SHELL = [
  './',
  './index.html',
  './admin.css',
  './admin.js',
  './pwa.js',
  './manifest.webmanifest',
  '../styles.css',
  '../assets/supabase.js',
  '../assets/binder-icon-192.png',
  '../assets/binder-icon-72.png',
  '../assets/Manrope-Regular.woff2',
  '../assets/Manrope-Bold.woff2',
  '../assets/Manrope-ExtraBold.woff2',
];

/* Binder Admin – Service Worker.
 *
 * Grundregel: Dieser Worker speichert ausschließlich die eigene Hülle der
 * App (HTML, CSS, JS, Schriften, Icons). Er speichert NIEMALS:
 *
 *  - Antworten der Supabase-API (*.supabase.co): Meldeschlangen, Profile,
 *    Audit-Protokoll und Session-Tokens sind personenbezogen und ändern
 *    sich laufend. Eine gecachte Schlange wäre ein Datenleck mit
 *    Verfallsdatum. Diese Requests werden nicht einmal abgefangen
 *    (kein respondWith), sie laufen direkt zum Server.
 *  - Supabase-Storage-Downloads (Profilbilder aus 'profile-media'):
 *    authentifizierte Blobs, selbe Begründung. Liegen ebenfalls auf
 *    *.supabase.co und fallen damit unter dieselbe Sperre.
 *  - Antworten mit Anmeldedaten oder nicht-GET-Requests: RPC-Mutationen
 *    (POST) dürfen ohnehin nie aus einem Cache kommen.
 *
 * Strategie: Navigationen network-first mit ehrlicher Offline-Seite,
 * Hüllen-Assets stale-while-revalidate. Cache-first wird nirgends benutzt.
 */

'use strict';

// Bei jeder inhaltlichen Änderung an Hülle oder Worker hochzählen — sonst
// bleibt die alte Hülle im Cache liegen.
const CACHE = 'binder-admin-shell-v2';

// Pfade relativ zu /Binder/admin/. Die Dateien unter ../assets/ liegen
// außerhalb des Scopes; der Scope begrenzt nur, welche Seiten dieser Worker
// kontrolliert, nicht, welche same-origin-Dateien er vorcachen darf. Es sind
// ausschließlich statische Hülle, keine Daten.

// Ehrliche Offline-Seite: wird direkt aus dem Worker erzeugt, damit sie ohne
// jede weitere Datei funktioniert. Sie zeigt keinen alten Stand der Schlange,
// sondern sagt, was ist: keine Verbindung, keine Daten.
function offlinePage() {
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Keine Verbindung – Binder Admin</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a0f;color:#f7f8f3;font-family:system-ui,sans-serif}
  main{max-width:420px;padding:32px;text-align:center}
  h1{font-size:24px;margin:0 0 12px}
  p{color:#9ea4b0;line-height:1.6;margin:0 0 24px}
  button{min-height:48px;min-width:200px;border:1px solid #c7ff4a;border-radius:14px;background:#c7ff4a;color:#10120d;font:800 14px system-ui;cursor:pointer}
  button:focus-visible{outline:3px solid rgba(199,255,74,.42);outline-offset:3px}
</style>
</head>
<body>
<main>
  <h1>Keine Verbindung</h1>
  <p>Binder Admin kann den Server nicht erreichen. Aus Sicherheitsgründen werden keine zwischengespeicherten Moderationsdaten angezeigt — die Meldeschlange siehst du nur mit aktiver Verbindung.</p>
  <button type="button" onclick="location.reload()">Erneut versuchen</button>
</main>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // Nicht automatisch skipWaiting(): Der neue Worker wartet, bis die
      // Seite ihn freigibt (pwa.js schickt SKIP_WAITING nach Klick auf den
      // Update-Hinweis). Sonst wechselt die Hülle mitten in einer
      // laufenden Moderations-Sitzung.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Sperrzone 1: alles außerhalb der eigenen Origin — insbesondere die
  // komplette Supabase-API, Auth-Endpunkte, Realtime und Storage. Kein
  // respondWith, kein Cache, der Browser handhabt den Request normal.
  if (url.origin !== self.location.origin) return;

  // Sperrzone 2: keine nicht-GET-Requests anfassen.
  if (request.method !== 'GET') return;

  // Sperrzone 3: Requests mit Credentials (Cookies/Authorization) nicht
  // cachen. Die Supabase-Calls liegen zwar auf fremder Origin (Sperrzone 1),
  // aber diese Zeile ist die zweite Tür am selben Schloss.
  if (request.credentials === 'include') return;

  // Navigationen: network-first. Ohne Netz gibt es die ehrliche
  // Offline-Seite — niemals eine gecachte index.html mit altem Stand.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Frische Hülle im Hintergrund in den Cache spiegeln.
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => offlinePage())
    );
    return;
  }

  // Hüllen-Assets: stale-while-revalidate. Sofort aus dem Cache, parallel
  // frisch geholt und ersetzt. Bewusst KEIN cache-first: ohne Cache-Treffer
  // geht es ans Netz, und jede Antwort aktualisiert den Cache.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

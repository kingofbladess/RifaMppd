// Service worker mínimo: hace la app instalable y muestra un aviso si no hay conexión.
// No guarda en caché datos personales ni respuestas de la API: todo lo dinámico va siempre a la red.
const CACHE = "rifa-shell-v2"; // subir el número borra la caché vieja de los celulares
const SHELL = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Archivos estáticos de Next CON hash en el nombre (npm run rapido / Vercel): caché primero.
  // Con npm run red (modo desarrollo) los nombres no llevan hash, p. ej. /_next/static/css/app/layout.css:
  // esos van siempre a la red, si no el celular se quedaría con los estilos viejos para siempre.
  const hashed = url.pathname.startsWith("/_next/static/") && /[0-9a-f]{8,}/i.test(url.pathname) && !url.search;
  if (hashed || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }
  // Páginas: siempre red; sin conexión, página de aviso.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
});

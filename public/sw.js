/**
 * Servis calisani — uygulamayi cevrimdisi acilabilir yapiyor.
 *
 * Elle yazildi: @serwist/next bir webpack eklentisi, bu proje ise Turbopack ile
 * derleniyor. Yapilan is zaten kucuk, araya bir derleme adimi sokmaya degmiyor.
 *
 * Strateji:
 *  - Gezinme (sayfa acilisi): once agdan dene, olmazsa onbellekteki kabuk.
 *    Boylece internet varken her zaman guncel surumu goruyorsun.
 *  - Statik dosyalar (/_next/static/...): once onbellek. Bu dosyalarin adinda
 *    icerik ozeti var, degisince adi da degisiyor; bayat kalma riski yok.
 *  - Model istekleri (api.deepseek.com, api.openai.com): hic dokunulmuyor.
 *    Zaten baska bir kaynaga gidiyorlar ve cevaplari onbelleklenmemeli.
 */

const VERSION = "v1";
const SHELL = `kabuk-${VERSION}`;
const ASSETS = `dosyalar-${VERSION}`;

/** Kapsam URL'i basePath'i de iceriyor; yollari ona gore kuruyoruz. */
const scope = new URL(self.registration.scope);
const START = scope.pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([START]))
      // Ilk kurulumda ag yoksa kurulum yine de tamamlansin.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL && key !== ASSETS)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Baska bir kaynak (model saglayicilari, yazi tipleri) — karismiyoruz.
  if (url.origin !== scope.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL).then((cache) => cache.put(START, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(START);
          return cached ?? Response.error();
        }),
    );
    return;
  }

  if (url.pathname.includes("/_next/static/") || /\.(png|ico|webmanifest|json)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

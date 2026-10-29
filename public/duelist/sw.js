// Service Worker – macht DUELIST nach dem ersten Laden komplett offline spielbar
const CACHE = "duelist-v2.0.0"
const PRECACHE = [
    "./",
    "index.html",
    "css/app.css",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "js/data.js",
    "js/settings.js",
    "js/assets.js",
    "js/audio.js",
    "js/input.js",
    "js/fx.js",
    "js/fighter.js",
    "js/ai.js",
    "js/match.js",
    "js/ui.js",
    "js/main.js",
    "../assets/ui/Arena2.png",
    "../assets/ui/StartBackground.png",
    "../assets/Überschriften/DUELIST.PNG",
    "../assets/characters/Knight Templar/Knight Templar-Idle.png",
    "../assets/characters/Knight Templar/Knight Templar-Walk02.png",
    "../assets/characters/Knight Templar/Knight Templar-Hurt.png",
    "../assets/characters/Knight Templar/Knight Templar-Death.png",
    "../assets/characters/Knight Templar/Knight Templar-Block.png",
    "../assets/characters/Knight Templar/Knight Templar-Attack01.png",
    "../assets/characters/Knight Templar/Knight Templar-Attack02.png",
    "../assets/characters/Knight Templar/Knight Templar-Attack03.png",
    "../assets/Faehigkeiten/schield.png",
    "../assets/characters/Elite Orc/Elite Orc-Idle.png",
    "../assets/characters/Elite Orc/Elite Orc-Walk.png",
    "../assets/characters/Elite Orc/Elite Orc-Hurt.png",
    "../assets/characters/Elite Orc/Elite Orc-Death.png",
    "../assets/characters/Elite Orc/Elite Orc-Attack01.png",
    "../assets/characters/Elite Orc/Elite Orc-Attack02.png",
    "../assets/characters/Elite Orc/Elite Orc-Attack03.png",
    "../assets/Faehigkeiten/bombe2.png",
    "../assets/characters/Armored Skeleton/Armored Skeleton-Idle.png",
    "../assets/characters/Armored Skeleton/Armored Skeleton-Walk.png",
    "../assets/characters/Armored Skeleton/Armored Skeleton-Hurt.png",
    "../assets/characters/Armored Skeleton/Armored Skeleton-Death.png",
    "../assets/characters/Armored Skeleton/Armored Skeleton-Attack01.png",
    "../assets/characters/Armored Skeleton/Armored Skeleton-Attack02.png",
    "../assets/Faehigkeiten/unsichtbar.png",
    "../assets/characters/Werebear/Werebear-Idle.png",
    "../assets/characters/Werebear/Werebear-Walk.png",
    "../assets/characters/Werebear/Werebear-Hurt.png",
    "../assets/characters/Werebear/Werebear-Death.png",
    "../assets/characters/Werebear/Werebear-Attack01.png",
    "../assets/characters/Werebear/Werebear-Attack02.png",
    "../assets/characters/Werebear/Werebear-Attack03.png",
    "../assets/Faehigkeiten/leben2.png"
]

self.addEventListener("install", e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => encodeURI(u)))).then(() => self.skipWaiting()))
})

self.addEventListener("activate", e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    )
})

// Erst Cache, im Hintergrund aktualisieren (auch Google Fonts werden so offline verfügbar)
self.addEventListener("fetch", e => {
    if (e.request.method !== "GET") return
    e.respondWith(
        caches.open(CACHE).then(async cache => {
            const cached = await cache.match(e.request, { ignoreSearch: true })
            const network = fetch(e.request)
                .then(res => {
                    if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone())
                    return res
                })
                .catch(() => cached)
            return cached || network
        })
    )
})

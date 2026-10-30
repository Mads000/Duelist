// Service Worker – macht DUELIST nach dem ersten Laden komplett offline spielbar
// (automatisch erzeugt von tools/make_sw.js)
const CACHE = "duelist-v3.0.32"
const PRECACHE = [
    "./",
    "index.html",
    "pad.html",
    "css/app.css",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "js/ai.js",
    "js/arena.js",
    "js/arena_shape.js",
    "js/assets.js",
    "js/audio.js",
    "js/data.js",
    "js/fighter.js",
    "js/fx.js",
    "js/input.js",
    "js/link.js",
    "js/main.js",
    "js/match.js",
    "js/modes.js",
    "js/net.js",
    "js/pad.js",
    "js/progress.js",
    "js/settings.js",
    "js/story.js",
    "js/tutorial.js",
    "js/ui.js",
    "../assets/ui/Knight Templar.png",
    "../assets/ui/Elite Orc.png",
    "../assets/ui/Armored Skeleton.png",
    "../assets/ui/Werebear.png",
    "../assets/Faehigkeiten/schield.png",
    "../assets/Faehigkeiten/leben2.png",
    "../assets/Faehigkeiten/unsichtbar.png",
    "../assets/ui/StartBackground.png",
    "../assets/Überschriften/DUELIST.PNG",
    "../assets/Überschriften/SelctionText.PNG",
    "../assets/Überschriften/end.PNG",
    "../assets/Faehigkeiten/bombe2.png",
    "../assets/ui/Arena2.png",
    "../assets/ui/Map-Wolkenhof.png",
    "../assets/ui/Map-Vulkan.png",
    "../assets/ui/Map-Frost.png",
    "../assets/characters-hd/Knight Templar/Knight Templar-Idle.png",
    "../assets/characters-hd/Knight Templar/Knight Templar-Walk02.png",
    "../assets/characters-hd/Knight Templar/Knight Templar-Hurt.png",
    "../assets/characters-hd/Knight Templar/Knight Templar-Death.png",
    "../assets/characters-hd/Knight Templar/Knight Templar-Block.png",
    "../assets/characters-hd/Knight Templar/Knight Templar-Attack01.png",
    "../assets/characters-hd/Knight Templar/Knight Templar-Attack02.png",
    "../assets/characters-hd/Knight Templar/Knight Templar-Attack03.png",
    "../assets/characters-hd/Elite Orc/Elite Orc-Idle.png",
    "../assets/characters-hd/Elite Orc/Elite Orc-Walk.png",
    "../assets/characters-hd/Elite Orc/Elite Orc-Hurt.png",
    "../assets/characters-hd/Elite Orc/Elite Orc-Death.png",
    "../assets/characters-hd/Elite Orc/Elite Orc-Attack01.png",
    "../assets/characters-hd/Elite Orc/Elite Orc-Attack02.png",
    "../assets/characters-hd/Elite Orc/Elite Orc-Attack03.png",
    "../assets/characters-hd/Armored Skeleton/Armored Skeleton-Idle.png",
    "../assets/characters-hd/Armored Skeleton/Armored Skeleton-Walk.png",
    "../assets/characters-hd/Armored Skeleton/Armored Skeleton-Hurt.png",
    "../assets/characters-hd/Armored Skeleton/Armored Skeleton-Death.png",
    "../assets/characters-hd/Armored Skeleton/Armored Skeleton-Attack01.png",
    "../assets/characters-hd/Armored Skeleton/Armored Skeleton-Attack02.png",
    "../assets/characters-hd/Werebear/Werebear-Idle.png",
    "../assets/characters-hd/Werebear/Werebear-Walk.png",
    "../assets/characters-hd/Werebear/Werebear-Hurt.png",
    "../assets/characters-hd/Werebear/Werebear-Death.png",
    "../assets/characters-hd/Werebear/Werebear-Attack01.png",
    "../assets/characters-hd/Werebear/Werebear-Attack02.png",
    "../assets/characters-hd/Werebear/Werebear-Attack03.png",
    "../assets/characters-hd/Werewolf/Werewolf-Idle.png",
    "../assets/characters-hd/Werewolf/Werewolf-Walk.png",
    "../assets/characters-hd/Werewolf/Werewolf-Hurt.png",
    "../assets/characters-hd/Werewolf/Werewolf-Death.png",
    "../assets/characters-hd/Werewolf/Werewolf-Attack01.png",
    "../assets/characters-hd/Werewolf/Werewolf-Attack02.png",
    "../assets/Faehigkeiten/leben.png",
    "../assets/characters-hd/Wizard/Wizard-Idle.png",
    "../assets/characters-hd/Wizard/Wizard-Walk.png",
    "../assets/characters-hd/Wizard/Wizard-Hurt.png",
    "../assets/characters-hd/Wizard/Wizard-DEATH.png",
    "../assets/characters-hd/Wizard/Wizard-Attack02.png",
    "../assets/characters-hd/Wizard/Wizard-Attack02_Effect.png",
    "../assets/characters-hd/Wizard/Wizard-Attack01.png",
    "../assets/characters-hd/Wizard/Wizard-Attack01_Effect.png",
    "../assets/characters-hd/Priest/Priest-Idle.png",
    "../assets/characters-hd/Priest/Priest-Walk.png",
    "../assets/characters-hd/Priest/Priest-Hurt.png",
    "../assets/characters-hd/Priest/Priest-Death.png",
    "../assets/characters-hd/Priest/Priest-Heal.png",
    "../assets/characters-hd/Priest/Priest-Attack.png",
    "../assets/characters-hd/Priest/Priest-Attack_Effect.png",
    "../assets/characters-hd/Lancer/Lancer-Idle.png",
    "../assets/characters-hd/Lancer/Lancer-Walk01.png",
    "../assets/characters-hd/Lancer/Lancer-Hurt.png",
    "../assets/characters-hd/Lancer/Lancer-Death.png",
    "../assets/characters-hd/Lancer/Lancer-Attack01.png",
    "../assets/characters-hd/Lancer/Lancer-Attack03.png",
    "../assets/characters-hd/Lancer/Lancer-Attack02.png",
    "../assets/Faehigkeiten/schield2.png",
    "../assets/characters-hd/Slime/Slime-Idle.png",
    "../assets/characters-hd/Slime/Slime-Walk.png",
    "../assets/characters-hd/Slime/Slime-Hurt.png",
    "../assets/characters-hd/Slime/Slime-Death.png",
    "../assets/characters-hd/Slime/Slime-Attack01.png",
    "../assets/characters-hd/Slime/Slime-Attack02.png",
    "../assets/characters-hd/Greatsword Skeleton/Greatsword Skeleton-Idle.png",
    "../assets/characters-hd/Greatsword Skeleton/Greatsword Skeleton-Walk.png",
    "../assets/characters-hd/Greatsword Skeleton/Greatsword Skeleton-Hurt.png",
    "../assets/characters-hd/Greatsword Skeleton/Greatsword Skeleton-Death.png",
    "../assets/characters-hd/Greatsword Skeleton/Greatsword Skeleton-Attack01.png",
    "../assets/characters-hd/Greatsword Skeleton/Greatsword Skeleton-Attack03.png",
    "../assets/characters-hd/Greatsword Skeleton/Greatsword Skeleton-Attack02.png",
    "../assets/Faehigkeiten/bombe.png"
]

self.addEventListener("install", e => {
    // cache: "reload" = am Browser-Cache vorbei, damit nie alte und neue Dateien gemischt werden
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(encodeURI(u), { cache: "reload" })))).then(() => self.skipWaiting()))
})

self.addEventListener("activate", e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    )
})

// Erst Netz (damit Updates sofort ankommen), sonst Cache – Schriften & Bibliotheken: erst Cache
self.addEventListener("fetch", e => {
    if (e.request.method !== "GET") return
    const url = new URL(e.request.url)
    const sameOrigin = url.origin === location.origin
    if (url.hostname.includes("peerjs")) return
    e.respondWith(
        caches.open(CACHE).then(async cache => {
            const cached = await cache.match(e.request, { ignoreSearch: true })
            const network = fetch(e.request, sameOrigin ? { cache: "no-cache" } : undefined)
                .then(res => {
                    if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone())
                    return res
                })
                .catch(() => cached)
            if (!sameOrigin) return cached || network
            return network.then(res => res || cached)
        })
    )
})

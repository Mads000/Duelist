// Erzeugt public/duelist/sw.js mit allen Dateien, die das Spiel offline braucht.
// Aufruf: node tools/make_sw.cjs   (erhöht die Cache-Version automatisch)
const fs = require("fs")
const path = require("path")
const vm = require("vm")

const dir = path.join(__dirname, "..", "public", "duelist")
const ctx = { console }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(dir, "js", "data.js"), "utf8").replace(/^const /gm, "var "), ctx)
const { CHAMPIONS, CHAMPION_ORDER, MAPS, MAP_ORDER } = ctx

const files = new Set(["./", "index.html", "pad.html", "css/app.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"])
for (const f of fs.readdirSync(path.join(dir, "js"))) files.add("js/" + f)
for (const f of ["ui/Knight Templar.png", "ui/Elite Orc.png", "ui/Armored Skeleton.png", "ui/Werebear.png", "Faehigkeiten/schield.png", "Faehigkeiten/leben2.png", "Faehigkeiten/unsichtbar.png", "ui/StartBackground.png", "Überschriften/DUELIST.PNG", "Überschriften/SelctionText.PNG", "Überschriften/end.PNG", "Faehigkeiten/bombe2.png"]) files.add("../assets/" + f)
for (const id of MAP_ORDER) files.add("../assets/" + MAPS[id].img)
for (const id of CHAMPION_ORDER) {
    const c = CHAMPIONS[id]
    const names = new Set([...Object.values(c.anims).map(a => a.file)])
    for (const m of [...c.light, c.heavy]) {
        names.add(m.anim.file)
        if (m.projectile) names.add(m.projectile.effect)
        if (m.zone) names.add(m.zone.effect)
    }
    for (const n of names) files.add(`../assets/characters/${c.folder}/${c.folder}-${n}.png`)
    files.add("../assets/" + c.ability.icon)
}
for (const f of files) {
    if (f !== "./" && !fs.existsSync(path.join(dir, f))) console.error("FEHLT:", f)
}

const swPath = path.join(dir, "sw.js")
const old = fs.existsSync(swPath) ? fs.readFileSync(swPath, "utf8") : ""
const m = old.match(/duelist-v(\d+)\.(\d+)\.(\d+)/)
const version = m && +m[1] >= 3 ? `${m[1]}.${m[2]}.${+m[3] + 1}` : "3.0.0"

const sw = `// Service Worker – macht DUELIST nach dem ersten Laden komplett offline spielbar
// (automatisch erzeugt von tools/make_sw.js)
const CACHE = "duelist-v${version}"
const PRECACHE = ${JSON.stringify([...files], null, 4)}

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
`
fs.writeFileSync(swPath, sw)

// CSS/JS in index.html mit Versionsnummer laden (verhindert veraltete Dateien aus dem Browser-Cache)
const htmlPath = path.join(dir, "index.html")
const html = fs.readFileSync(htmlPath, "utf8")
    .replace(/((?:src|href)="(?:js|css)\/[^"?]+)(\?v=[^"]*)?"/g, `$1?v=${version}"`)
fs.writeFileSync(htmlPath, html)
console.log(`sw.js geschrieben: Version ${version}, ${files.size} Dateien`)

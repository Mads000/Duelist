// ============================================================
//  Gold, Skins & Rang – jedes Match bringt etwas.
//  Skins färben die vorhandenen Sprites um (einmal berechnet, dann gecacht).
// ============================================================

const SKINS = [
    { id: "base", name: "Standard", price: 0 },
    { id: "crimson", name: "Karmesin", price: 250, hue: 355 },
    { id: "jade", name: "Jade", price: 250, hue: 145 },
    { id: "frost", name: "Frost", price: 450, hue: 195, light: 1.12 },
    { id: "shadow", name: "Schatten", price: 700, shadow: true },
    { id: "gold", name: "Gold", price: 1200, gold: true }
]

const RANKS = [
    { name: "Bronze", rp: 0, color: "#c07a43" },
    { name: "Silber", rp: 100, color: "#b9c4d4" },
    { name: "Gold", rp: 250, color: "#ffc93c" },
    { name: "Platin", rp: 450, color: "#6fe0d0" },
    { name: "Diamant", rp: 700, color: "#8ab8ff" },
    { name: "Legende", rp: 1000, color: "#ff6a5a" }
]
const RANK_WIN = { easy: 10, normal: 20, hard: 30, nightmare: 40 }
const RANK_LOSS = 12
const GOLD = { win: 60, loss: 20, round: 10, mission: 50, firstWin: 100, local: 30 }

// ---------------- Umfärben ----------------
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return [h * 60, s, l]
}

function hslToRgb(h, s, l) {
    const k = n => (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
    return [f(0) * 255, f(8) * 255, f(4) * 255]
}

function recolorPixel(skin, r, g, b) {
    const [h, s, l] = rgbToHsl(r, g, b)
    if (l < 0.1) return null // Umriss bleibt
    if (skin.gold) {
        // Helligkeit → Goldverlauf
        const t = Math.min(1, l * 1.15)
        return t < 0.5
            ? [90 + 280 * t, 50 + 240 * t, 10 + 60 * t]
            : [230 + 50 * (t - 0.5), 170 + 150 * (t - 0.5), 40 + 300 * (t - 0.5)]
    }
    // Hauttöne bleiben, damit Gesichter normal aussehen
    if (h > 12 && h < 42 && s > 0.25 && s < 0.75 && l > 0.45) return null
    if (skin.shadow) return hslToRgb(272, s * 0.35 + 0.08, l * 0.62)
    const light = Math.min(0.95, l * (skin.light || 1))
    return s > 0.18 ? hslToRgb(skin.hue, s, light) : hslToRgb(skin.hue, s * 0.5 + 0.12, light)
}

const skinCache = {}

// Sprite-Bild eines Champions in einem Skin (Standard = Originalbild)
function skinImage(champId, file, skinId) {
    const img = champImage(champId, file)
    if (!skinId || skinId === "base" || !img || !img.complete || !img.naturalWidth) return img
    const key = `${champId}:${file}:${skinId}`
    if (skinCache[key]) return skinCache[key]
    const skin = SKINS.find(s => s.id === skinId)
    if (!skin) return img
    const c = document.createElement("canvas")
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    try {
        const data = g.getImageData(0, 0, c.width, c.height)
        const px = data.data
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] === 0) continue
            const out = recolorPixel(skin, px[i], px[i + 1], px[i + 2])
            if (!out) continue
            px[i] = out[0]
            px[i + 1] = out[1]
            px[i + 2] = out[2]
        }
        g.putImageData(data, 0, 0)
    } catch (e) {
        // z. B. file:// – dann eben ohne Skin
        return (skinCache[key] = img)
    }
    c.complete = true
    return (skinCache[key] = c)
}

const Shop = {
    tab: null,

    get data() {
        const d = PlayerRecord.data
        if (d.gold === undefined) d.gold = 0
        if (d.rp === undefined) d.rp = 0
        if (!d.skins) d.skins = {}
        if (!d.skin) d.skin = {}
        return d
    },

    owns(champId, skinId) {
        return skinId === "base" || (this.data.skins[champId] || []).includes(skinId)
    },

    equipped(champId) {
        const s = this.data.skin[champId]
        return s && this.owns(champId, s) ? s : "base"
    },

    buy(champId, skinId) {
        const skin = SKINS.find(s => s.id === skinId)
        const d = this.data
        if (!skin || this.owns(champId, skinId) || d.gold < skin.price) return false
        d.gold -= skin.price
        d.skins[champId] = [...(d.skins[champId] || []), skinId]
        d.skin[champId] = skinId
        PlayerRecord.save()
        Sound.play("coin")
        return true
    },

    equip(champId, skinId) {
        if (!this.owns(champId, skinId)) return
        this.data.skin[champId] = skinId
        PlayerRecord.save()
    },

    rank(rp = this.data.rp) {
        let i = 0
        while (i < RANKS.length - 1 && rp >= RANKS[i + 1].rp) i++
        const cur = RANKS[i]
        const next = RANKS[i + 1]
        return { ...cur, index: i, next, progress: next ? (rp - cur.rp) / (next.rp - cur.rp) : 1 }
    },

    // Eigene Spieler tragen ihren Skin, Bots den Standard – gleiche Figuren werden unterscheidbar
    applySkins(match, random = false) {
        const alt = SKINS.filter(s => s.id !== "base" && s.id !== "gold")
        for (const f of match.fighters) {
            const own = f.isHuman && (match.localSide === undefined || f.side === match.localSide)
            f.skin = own ? this.equipped(f.champId) : random && Math.random() < 0.5 ? alt[Math.floor(Math.random() * alt.length)].id : "base"
        }
        match.fighters.forEach((f, i) => {
            const twins = match.fighters.slice(0, i).filter(o => o.champId === f.champId)
            if (!twins.some(o => o.skin === f.skin)) return
            const free = alt.find(s => !twins.some(o => o.skin === s.id))
            if (free) f.skin = free.id
        })
        // Umfärben gleich jetzt erledigen (während der VS-Einblendung), nicht mitten im Kampf
        for (const f of match.fighters) {
            if (f.skin === "base") continue
            for (const file of championFiles(f.champ)) skinImage(f.champId, file, f.skin)
        }
    },

    // ---------------- Bildschirm ----------------
    goldHtml() {
        return `<span class="gold-coin"></span>${this.data.gold}`
    },

    render() {
        const champs = playableChampions()
        if (!champs.includes(this.tab)) this.tab = champs.includes(App.config.champs[0]) ? App.config.champs[0] : champs[0]
        $("#shopGold").innerHTML = this.goldHtml()
        const tabs = $("#shopTabs")
        tabs.innerHTML = champs.map(id => `<button class="${id === this.tab ? "on" : ""}" data-champ="${id}">${CHAMPIONS[id].name}</button>`).join("")
        for (const b of $$("button", tabs)) b.addEventListener("click", () => {
            this.tab = b.dataset.champ
            this.render()
        })

        const id = this.tab
        const grid = $("#shopGrid")
        grid.innerHTML = ""
        for (const skin of SKINS) {
            const owned = this.owns(id, skin.id)
            const on = this.equipped(id) === skin.id
            const afford = this.data.gold >= skin.price
            const card = document.createElement("div")
            card.className = "shop-card glass" + (on ? " on" : "") + (owned ? " owned" : "")
            card.innerHTML = `<canvas width="150" height="150"></canvas>
                <div class="shop-name">${skin.name}</div>
                <button class="btn small ${owned ? "" : "start"}" ${!owned && !afford ? "disabled" : ""}>
                    ${on ? "Ausgerüstet" : owned ? "Ausrüsten" : `<span class="gold-coin"></span>${skin.price}`}
                </button>`
            grid.appendChild(card)
            const preview = new SpritePreview($("canvas", card), id, "idle", { zoom: 1.1 })
            preview.set(id, "idle", skin.id)
            card.addEventListener("pointerenter", () => preview.set(id, "light0", skin.id))
            $("button", card).addEventListener("click", () => {
                if (on) return
                if (owned) this.equip(id, skin.id)
                else if (this.buy(id, skin.id)) UI.toast(`${skin.name}-Skin für ${CHAMPIONS[id].name} gekauft!`)
                this.render()
            })
        }
    }
}

// ============================================================
//  Arena-Ausstattung: Deckung (Säulen, Kisten), Abgründe für
//  Ring-Outs und Power-ups, die vom Himmel fallen
// ============================================================

// Mauerlücken links und rechts – wer mit Wucht hindurchfliegt, stürzt in die Wolken
const RING_GAPS = [{ side: -1, y0: 470, y1: 650 }, { side: 1, y0: 470, y1: 650 }]
const RING_OUT_DMG = 20

const PROP_TYPES = {
    pillar: { r: 34, hp: Infinity },   // Deckung: blockt Laufen und Geschosse
    crate: { r: 28, hp: 3 }            // zerschlagbar, enthält ein Power-up
}

const prop = (type, x, y) => ({ type, x, y })
const ARENA_PROPS = {
    sky: [prop("pillar", 640, 420), prop("pillar", 896, 700), prop("crate", 896, 420), prop("crate", 640, 700)],
    classic: [prop("pillar", 560, 410), prop("pillar", 976, 710), prop("crate", 976, 410), prop("crate", 560, 710)],
    volcano: [prop("pillar", 768, 420), prop("pillar", 768, 700), prop("crate", 640, 560), prop("crate", 896, 560)],
    frost: [prop("pillar", 650, 470), prop("pillar", 886, 650), prop("crate", 768, 380), prop("crate", 768, 740)]
}

const ITEM_TYPES = {
    heal: { color: "#7dff9b", dark: "#1f8a3c", text: "+15 LEBEN" },
    energy: { color: "#ffe27a", dark: "#b07c10", text: "ENERGIE VOLL" },
    power: { color: "#ff7a5a", dark: "#9a2a14", text: "POWER! +30 %" }
}

// ---------------- Pixel-Sprites für Säulen und Kisten ----------------
const PROP_PALETTES = {
    sky: { light: "#ece8dc", mid: "#c8c0ae", dark: "#8e8676", accent: "#ffd65a" },
    classic: { light: "#f6f6fc", mid: "#d2d6e6", dark: "#959cb8", accent: "#ffd65a" },
    volcano: { light: "#6a585c", mid: "#4a3c40", dark: "#2a2024", accent: "#ff7a1e" },
    frost: { light: "#e6f6ff", mid: "#a8d4f2", dark: "#6a9cd0", accent: "#ffffff" }
}
const OUTLINE = "#160f1e"
const propSprites = {}

// grid = Zeilen aus Zeichen, key = Zeichen → Farbe; danach wird ein Umriss gezogen
function pixelSprite(grid, key) {
    const h = grid.length
    const w = grid[0].length
    const c = document.createElement("canvas")
    c.width = w + 2
    c.height = h + 2
    const g = c.getContext("2d")
    const filled = (x, y) => y >= 0 && y < h && x >= 0 && x < w && grid[y][x] !== "."
    for (let y = -1; y <= h; y++) {
        for (let x = -1; x <= w; x++) {
            if (filled(x, y)) {
                g.fillStyle = key[grid[y][x]]
                g.fillRect(x + 1, y + 1, 1, 1)
            } else if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) {
                g.fillStyle = OUTLINE
                g.fillRect(x + 1, y + 1, 1, 1)
            }
        }
    }
    return c
}

function propSprite(type, mapId, damaged = 0) {
    const id = `${type}:${mapId}:${damaged}`
    if (propSprites[id]) return propSprites[id]
    const p = PROP_PALETTES[mapId] || PROP_PALETTES.sky
    let grid
    let key
    if (type === "pillar") {
        // Säule: Kapitell, kannelierter Schaft, Sockel
        const shaft = "..LMMdMMdMMD.."
        grid = [
            "AAAAAAAAAAAAAA",
            "LLMMMMMMMMMMDD",
            ".LLMMMMMMMMDD.",
            ...Array.from({ length: 22 }, (_, i) => (mapId === "volcano" && i % 7 === 3) ? "..LMMAMMdMMD.." : shaft),
            ".LLMMMMMMMMDD.",
            "LLMMMMMMMMMMDD",
            "DDDDDDDDDDDDDD"
        ]
        key = { L: p.light, M: p.mid, D: p.dark, d: p.dark, A: p.accent }
    } else {
        // Holzkiste mit Metallecken und Querstrebe
        grid = [
            "SBBBBBBBBBBBBS",
            "BllllllllllllB",
            "BlwwwwwwwwwwXB",
            "BlwwwwwwwwwXwB",
            "BBBBBBBBBBXBBB",
            "BlwwwwwwwXwwwB",
            "BlwwwwwwXwwwwB",
            "BBBBBBBXBBBBBB",
            "BlwwwwXwwwwwwB",
            "BlwwwXwwwwwwwB",
            "BdddddddddddDB",
            "SBBBBBBBBBBBBS"
        ]
        key = { B: "#7a4a24", l: "#d89a58", w: "#b8783e", X: "#8a5a2e", d: "#94602e", D: "#94602e", S: "#c4ccd8" }
        if (damaged) {
            // Risse
            grid = grid.map((row, y) => [...row].map((ch, x) => (ch === "w" && (x * 3 + y * 5 + damaged * 7) % 9 === 0) ? "B" : ch).join(""))
        }
    }
    propSprites[id] = pixelSprite(grid, key)
    return propSprites[id]
}

function drawProp(ctx, pr, mapId) {
    const img = propSprite(pr.type, mapId, pr.type === "crate" ? 3 - pr.hp : 0)
    const s = SPRITE_SCALE
    const shake = pr.hitT > 0 ? (Math.random() - 0.5) * 6 : 0
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, Math.round(pr.x - img.width * s / 2 + shake), Math.round(pr.y + 10 - img.height * s), img.width * s, img.height * s)
    ctx.restore()
}

// Pixel-Orb für ein Power-up (in Sprite-Pixeln, wird in der Pixel-Ebene gezeichnet)
function drawItemOrb(ctx, x, y, type, t) {
    const it = ITEM_TYPES[type]
    const bob = Math.sin(t * 5) * 6
    const s = SPRITE_SCALE
    const cx = Math.round(x)
    const cy = Math.round(y - 34 + bob)
    const rows = [".XXX.", "XLLCX", "XLCCX", "XCCDX", ".XXX."]
    const col = { X: OUTLINE, L: "#ffffff", C: it.color, D: it.dark }
    ctx.save()
    ctx.globalAlpha = 0.35 + Math.sin(t * 8) * 0.15
    ctx.fillStyle = it.color
    ctx.fillRect(cx - 4 * s, cy - 4 * s, 8 * s, 8 * s)
    ctx.globalAlpha = 1
    rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
        if (ch === ".") return
        ctx.fillStyle = col[ch]
        ctx.fillRect(cx + (rx - 2.5) * s * 1.4, cy + (ry - 2.5) * s * 1.4, s * 1.4, s * 1.4)
    }))
    ctx.restore()
}

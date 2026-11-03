// ============================================================
//  Feinschliff für den Pixel-Look – die Spiellogik bleibt unberührt:
//  gedämpfte Map-Farben, Licht, echte Sprite-Schatten, Pixel-Schrift
// ============================================================

// Licht je Map: Sonnenfarbe, Sonnenposition (Bildschirm), Himmelsabdunklung
const MAP_LIGHT = {
    sky: { sun: "255,236,190", at: [0.14, -0.05], grade: [0.95, 1.02, 0.04], glow: 1, rays: 1 },
    classic: { sun: "255,190,150", at: [0.84, 0.02], grade: [0.9, 0.97, 0.02], glow: 1, rays: 1 },
    volcano: { sun: "255,120,60", at: [0.5, 1.1], grade: [1.05, 1, 0.07], glow: 0.55, rays: 0 },
    frost: { sun: "190,220,255", at: [0.2, -0.05], grade: [0.92, 0.98, 0.03], glow: 0.6, rays: 0.6 }
}

// Boden einmalig umfärben: weniger grelle Sättigung, mehr Kontrast
{
    const feathered = Match.prototype.featheredMap
    Match.prototype.featheredMap = function () {
        const c = feathered.call(this)
        if (c.graded) return c
        c.graded = true
        const [sat, val, contrast] = (MAP_LIGHT[this.map.id] || MAP_LIGHT.sky).grade
        const g = c.getContext("2d")
        try {
            const d = g.getImageData(0, 0, c.width, c.height)
            const px = d.data
            for (let i = 0; i < px.length; i += 4) {
                if (px[i + 3] === 0) continue
                const l = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11
                for (let k = 0; k < 3; k++) {
                    const v = (l + (px[i + k] - l) * sat) * val
                    px[i + k] = Math.max(0, Math.min(255, (v - 128) * (1 + contrast * 2) + 128))
                }
            }
            g.putImageData(d, 0, 0)
        } catch (e) {
            // file:// – dann bleibt die Map wie sie ist
        }
        return c
    }
}

// Schatten der Figur: das Sprite selbst, flach auf den Boden gekippt und weg von der Sonne
const SHADOW_DIR = { sky: 0.62, classic: -0.62, volcano: 0.2, frost: 0.55 }
{
    const shadow = Fighter.prototype.drawShadow
    Fighter.prototype.drawShadow = function (ctx) {
        if (this.state !== "fall" && this.stealthT <= 0) {
            const img = skinImage(this.champId, this.anim.file, this.skin)
            if (img && img.complete) {
                const g = this.geom
                const lean = SHADOW_DIR[this.match.map.id] ?? 0.6
                ctx.save()
                ctx.transform(this.facing < 0 ? -1 : 1, 0, -lean, -0.34, this.x, this.y + 2)
                ctx.imageSmoothingEnabled = false
                drawTintedFrame(ctx, img, this.frame, -g.ax, -g.ay, g.w, g.h, "#180c14", 0.34)
                ctx.restore()
            }
        }
        shadow.call(this, ctx)
    }

    const ground = Match.prototype.drawArenaGround
    Match.prototype.drawArenaGround = function (ctx) {
        const lean = SHADOW_DIR[this.map.id] ?? 0.6
        for (const pr of this.props) {
            if (pr.hp <= 0) continue
            const h = pr.type === "pillar" ? 104 : 54
            const dx = lean * h
            const dy = h * 0.34
            ctx.fillStyle = "rgba(24,12,20,0.3)"
            ctx.beginPath()
            ctx.moveTo(pr.x - pr.r, pr.y + 4)
            ctx.lineTo(pr.x + pr.r, pr.y + 4)
            ctx.lineTo(pr.x + pr.r + dx, pr.y + 4 + dy)
            ctx.lineTo(pr.x - pr.r + dx, pr.y + 4 + dy)
            ctx.fill()
        }
        ground.call(this, ctx)
    }
}

// Die Pixel-Ebene ist zu grob für kleine Schrift, deshalb wird Text ganz am Ende scharf gezeichnet
Effects.prototype.drawTexts = function () {}

function drawSharpTexts(match, ctx, w, h) {
    const cam = match.camera
    for (const p of match.fx.texts) {
        const k = p.t / p.life
        const pop = k < 0.1 ? 1.5 - k * 5 : 1
        const size = Math.round(Math.max(20, p.size * cam.zoom) * pop)
        const x = (p.x - cam.x) * cam.zoom + w / 2
        const y = (p.y - cam.y) * cam.zoom + h / 2
        ctx.save()
        ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1
        ctx.font = `${size}px "Bebas Neue", Impact, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.lineJoin = "round"
        // feiner Rand + weicher Schatten statt dicker schwarzer Kontur
        ctx.shadowColor = "rgba(0,12,45,0.55)"
        ctx.shadowBlur = Math.max(4, size / 6)
        ctx.shadowOffsetY = 2
        ctx.lineWidth = Math.max(2, size / 14)
        ctx.strokeStyle = "rgba(14,22,48,0.85)"
        ctx.strokeText(p.str, x, y)
        ctx.shadowColor = "transparent"
        ctx.fillStyle = p.color
        ctx.fillText(p.str, x, y)
        ctx.restore()
    }
}

// Licht über dem ganzen Bild: weicher Sonnenschein und Vignette (keine Lichtstrahlen)
{
    const layers = {}
    function lightLayer(id, w, h) {
        const key = `${id}:${w}x${h}`
        if (layers[key]) return layers[key]
        const L = MAP_LIGHT[id] || MAP_LIGHT.sky
        const c = document.createElement("canvas")
        c.width = Math.ceil(w / 2)
        c.height = Math.ceil(h / 2)
        const g = c.getContext("2d")
        g.scale(0.5, 0.5)
        const sx = L.at[0] * w
        const sy = L.at[1] * h
        const R = Math.hypot(w, h)
        const glow = g.createRadialGradient(sx, sy, 0, sx, sy, R * 0.75)
        glow.addColorStop(0, `rgba(${L.sun},${0.34 * L.glow})`)
        glow.addColorStop(0.35, `rgba(${L.sun},${0.1 * L.glow})`)
        glow.addColorStop(1, `rgba(${L.sun},0)`)
        g.fillStyle = glow
        g.fillRect(0, 0, w, h)
        layers[key] = c
        return c
    }

    const render = Match.prototype.render
    Match.prototype.render = function (ctx, w, h) {
        render.call(this, ctx, w, h)
        const L = MAP_LIGHT[this.map.id] || MAP_LIGHT.sky
        ctx.save()
        ctx.globalCompositeOperation = "screen"
        ctx.drawImage(lightLayer(this.map.id, w, h), 0, 0, w, h)
        ctx.globalCompositeOperation = "multiply"
        const v = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.5, w / 2, h * 0.52, Math.hypot(w, h) * 0.62)
        // Ränder leicht in Himmelsblau abdunkeln statt grau, passend zu den Menüs
        v.addColorStop(0, "rgb(255,255,255)")
        v.addColorStop(1, this.map.id === "volcano" ? "rgb(170,120,120)" : "rgb(185,198,235)")
        ctx.fillStyle = v
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
    }
}

// ============================================================
//  Glas in der Spielwelt: die Arena über den Wolken ist aus
//  Kristall. Reine Optik, Hitboxen und Regeln bleiben gleich.
// ============================================================
const GLASS = {
    sky: { edge: "rgba(32,62,150,0.92)", light: "rgba(190,226,255,0.74)", mid: "rgba(110,185,255,0.5)", deep: "rgba(40,100,225,0.7)", core: "#ffe27a", rgb: "120,190,255" },
    classic: { edge: "rgba(132,30,92,0.92)", light: "rgba(255,206,226,0.74)", mid: "rgba(255,140,185,0.5)", deep: "rgba(214,64,140,0.68)", core: "#ffe27a", rgb: "255,160,205" },
    volcano: { edge: "rgba(110,22,8,0.94)", light: "rgba(255,190,120,0.76)", mid: "rgba(255,110,40,0.5)", deep: "rgba(190,40,16,0.72)", core: "#fff0a8", rgb: "255,120,50" },
    frost: { edge: "rgba(14,84,140,0.92)", light: "rgba(190,246,255,0.76)", mid: "rgba(80,205,235,0.5)", deep: "rgba(24,125,195,0.72)", core: "#ffffff", rgb: "120,235,245" }
}
const glassSprites = {}

// Säule und Kiste als Pixel-Sprite aus durchscheinendem Glas: man sieht Figuren dahinter
propSprite = function (type, mapId, damaged = 0) {
    const id = `glass:${type}:${mapId}:${damaged}`
    if (glassSprites[id]) return glassSprites[id]
    const g = GLASS[mapId] || GLASS.sky
    let grid
    if (type === "pillar") {
        // heller Grat links, dunkler Rand rechts, schräge Glanzstreifen quer über den Schaft
        const shaft = i => {
            const row = [..."..EWLMMMMDDE.."]
            const glint = (i * 2 + 3) % 15
            if (glint >= 3 && glint <= 10) row[glint] = "W"
            if (glint + 1 >= 3 && glint + 1 <= 10) row[glint + 1] = "L"
            return row.join("")
        }
        grid = [
            ".EEEEEEEEEEEE.",
            "EWWWWLLLLMMDDE",
            ".EELLMMMMDDEE.",
            "..EEEEEEEEEE..",
            ...Array.from({ length: 21 }, (_, i) => shaft(i)),
            "..EEEEEEEEEE..",
            ".EELLMMMMDDEE.",
            "EWWLLMMMMMMDDE",
            ".EEEEEEEEEEEE."
        ]
    } else {
        grid = [
            "..EEEEEEEEEE..",
            ".EWWWLLLMMMDE.",
            "EWWLMMMMMMMMDE",
            "EWLMMMCCMMMMDE",
            "ELMMMCCCCMMMDE",
            "ELMMCCCCCCMMDE",
            "EMMMCCCCCCMMDE",
            "EMMMMCCCCMMDDE",
            "EMMMMMCCMMMDDE",
            ".EMMMMMMMDDDE.",
            "..EEEEEEEEEE.."
        ]
        // Sprünge im Glas zeigen, wie viele Treffer die Kiste noch aushält
        if (damaged) {
            const cracks = [[], [[3, 2], [4, 3], [5, 3], [6, 4], [7, 4]], [[3, 2], [4, 3], [5, 3], [6, 4], [7, 4], [10, 8], [9, 7], [8, 7], [7, 6], [4, 9], [5, 8], [6, 7]]][Math.min(2, damaged)]
            grid = grid.map((row, y) => [...row].map((ch, x) => cracks.some(c => c[0] === x && c[1] === y) ? "W" : ch).join(""))
        }
    }
    const c = document.createElement("canvas")
    c.width = grid[0].length
    c.height = grid.length
    const ctx = c.getContext("2d")
    const key = { E: g.edge, W: "rgba(255,255,255,0.92)", L: g.light, M: g.mid, D: g.deep, C: g.core }
    grid.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === ".") return
        ctx.fillStyle = key[ch]
        ctx.fillRect(x, y, 1, 1)
    }))
    return (glassSprites[id] = c)
}

// Power-ups als Glaskugel, die Farbe sitzt innen
drawItemOrb = function (ctx, x, y, type, t) {
    const it = ITEM_TYPES[type]
    const cx = Math.round(x)
    const cy = Math.round(y - 34 + Math.sin(t * 5) * 6)
    ctx.save()
    ctx.fillStyle = "rgba(255,255,255,0.2)"
    ctx.strokeStyle = "rgba(255,255,255,0.95)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, 18, 0, TAU_P)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = it.color
    ctx.beginPath()
    ctx.arc(cx, cy + 2, 8 + Math.sin(t * 8), 0, TAU_P)
    ctx.fill()
    ctx.fillStyle = "#fff"
    ctx.fillRect(cx - 10, cy - 11, 7, 4)
    ctx.restore()
}
const TAU_P = Math.PI * 2

// Kerne von Kisten und Säulen glimmen leise
{
    const draw = drawProp
    drawProp = function (ctx, pr, mapId) {
        draw(ctx, pr, mapId)
        const g = GLASS[mapId] || GLASS.sky
        const y = pr.type === "pillar" ? pr.y - 6 : pr.y - 26
        const r = pr.type === "pillar" ? 46 : 42
        const a = 0.2 + Math.sin(performance.now() / 700 + pr.x) * 0.07
        const glow = ctx.createRadialGradient(pr.x, y, 0, pr.x, y, r)
        glow.addColorStop(0, `rgba(${pr.type === "pillar" ? g.rgb : "255,226,122"},${a})`)
        glow.addColorStop(1, `rgba(${g.rgb},0)`)
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        ctx.fillStyle = glow
        ctx.fillRect(pr.x - r, y - r, r * 2, r * 2)
        ctx.restore()
    }
}

// Die Insel schwebt in den Wolken: weiche Wolkenbänke ziehen langsam vor ihrer Unterseite vorbei
const MAP_CLOUDS = {
    sky: { color: "255,255,255", alpha: 0.85 },
    classic: { color: "255,226,232", alpha: 0.8 },
    volcano: { color: "70,26,30", alpha: 0.75 },
    frost: { color: "214,232,255", alpha: 0.8 }
}
{
    const puffs = []
    let s = 7
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280
    for (let i = 0; i < 16; i++) {
        puffs.push({ x: -500 + i * 170 + rnd() * 80, y: 930 + rnd() * 90, r: 80 + rnd() * 90, speed: 6 + rnd() * 8 })
    }
    const span = 16 * 170
    Match.prototype.drawMapFront = function (ctx) {
        const look = MAP_CLOUDS[this.map.id] || MAP_CLOUDS.sky
        ctx.save()
        for (const p of puffs) {
            const x = ((p.x + this.time * p.speed + 500) % span + span) % span - 500
            const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r)
            g.addColorStop(0, `rgba(${look.color},${look.alpha})`)
            g.addColorStop(0.55, `rgba(${look.color},${look.alpha * 0.45})`)
            g.addColorStop(1, `rgba(${look.color},0)`)
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.ellipse(x, p.y, p.r * 1.4, p.r * 0.7, 0, 0, TAU_P)
            ctx.fill()
        }
        ctx.restore()
    }
}

// Glassplitter: Kisten, gebrochene Deckung und schwere Treffer zersplittern
{
    const burst = (fx, x, y, n, map, power = 520) => {
        const g = GLASS[map] || GLASS.sky
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU_P
            const v = power * (0.25 + Math.random() * 0.85)
            fx.particles.push({
                type: "shard", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 180, g: 980, drag: 1.6,
                life: 0.45 + Math.random() * 0.45, t: 0, size: 7 + Math.random() * 12,
                spin: (Math.random() - 0.5) * 18, rot: Math.random() * 6, fill: i % 3 ? g.light : "rgba(255,255,255,0.9)", edge: "rgba(255,255,255,0.9)"
            })
        }
    }

    const draw = Effects.prototype.draw
    Effects.prototype.draw = function (ctx) {
        draw.call(this, ctx)
        for (const p of this.particles) {
            if (p.type !== "shard") continue
            const k = p.t / p.life
            ctx.save()
            ctx.globalAlpha = 1 - k * k
            ctx.translate(p.x, p.y)
            ctx.rotate(p.rot + p.t * p.spin)
            ctx.beginPath()
            ctx.moveTo(0, -p.size)
            ctx.lineTo(p.size * 0.55, p.size * 0.4)
            ctx.lineTo(-p.size * 0.42, p.size * 0.55)
            ctx.closePath()
            ctx.fillStyle = p.fill
            ctx.fill()
            ctx.strokeStyle = p.edge
            ctx.lineWidth = 2
            ctx.stroke()
            ctx.restore()
        }
    }

    const guardBreak = Fighter.prototype.guardBreak
    Fighter.prototype.guardBreak = function () {
        guardBreak.call(this)
        burst(this.match.fx, this.x + this.facing * 18, this.y - 44, 26, this.match.map.id, 680)
    }

    const damageProp = Match.prototype.damageProp
    Match.prototype.damageProp = function (pr, by) {
        const hp = pr.hp
        damageProp.call(this, pr, by)
        if (pr.hp < hp) burst(this.fx, pr.x, pr.y - 30, pr.hp <= 0 ? 24 : 7, this.map.id, pr.hp <= 0 ? 620 : 360)
    }

    const knockout = Match.prototype.knockout
    Match.prototype.knockout = function (winner, loser) {
        const fighting = this.phase === "fight"
        knockout.call(this, winner, loser)
        if (fighting && this.phase === "ko") burst(this.fx, loser.x, loser.y - 50, 34, this.map.id, 820)
    }
}

// Hinweis über der Figur als Glaskapsel, passend zum HUD
Match.prototype.drawAbilityCues = function (ctx) {
    if (isTouchDevice()) return
    for (const f of this.fighters) {
        if (!f.isHuman || !f.abilityReady || f.state === "dead" || f.state === "fall") continue
        if (this.localSide !== undefined && f.side !== this.localSide) continue
        if (Link.padFor(f.slot)) continue
        const map = keymap(this.humanCount === 2 && this.localSide === undefined ? (f.side === 0 ? "p1" : "p2") : "solo")
        const key = keyLabel(map.ability[0])
        const t = f.readyPulse
        const pop = t < 0.35 ? 1 + Math.sin(t / 0.35 * Math.PI) * 0.45 : 1 + Math.sin(t * 6) * 0.04
        ctx.save()
        ctx.translate(f.x, f.y - (this.team2 ? 172 : 138))
        ctx.scale(pop, pop)
        ctx.font = '22px "Bebas Neue", Impact, sans-serif'
        ctx.textBaseline = "middle"
        const label = f.champ.ability.name.toUpperCase()
        const kw = Math.max(26, ctx.measureText(key).width + 14)
        const w = kw + ctx.measureText(label).width + 50
        const x0 = -w / 2
        ctx.beginPath()
        ctx.roundRect(x0, -16, w, 32, 16)
        // Glas-Pille: klar mit hellem Glanz oben
        const pill = ctx.createLinearGradient(0, -16, 0, 16)
        pill.addColorStop(0, "rgba(255,255,255,0.42)")
        pill.addColorStop(0.5, "rgba(255,255,255,0.14)")
        pill.addColorStop(1, "rgba(255,255,255,0.22)")
        ctx.fillStyle = "rgba(20,32,60,0.28)"
        ctx.fill()
        ctx.fillStyle = pill
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.95)"
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.roundRect(x0 + 6, -11, kw, 22, 11)
        ctx.fill()
        ctx.fillStyle = "#0e2268"
        ctx.textAlign = "center"
        ctx.fillText(key, x0 + 6 + kw / 2, 1)
        // dasselbe Icon wie im HUD, aus den SVG-Pfaden gezeichnet
        ctx.save()
        ctx.translate(x0 + kw + 12, -10)
        ctx.scale(20 / 24, 20 / 24)
        ctx.strokeStyle = "#ffd84a"
        ctx.fillStyle = "rgba(255,216,74,0.25)"
        ctx.lineWidth = 2.2
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        for (const p of abilityPaths(f.champ)) {
            if (p.fill) ctx.fill(p.path)
            ctx.stroke(p.path)
        }
        ctx.restore()
        ctx.fillStyle = "#fff"
        ctx.textAlign = "left"
        ctx.shadowColor = "rgba(0,12,45,0.6)"
        ctx.shadowBlur = 3
        ctx.shadowOffsetY = 1
        ctx.fillText(label, x0 + kw + 37, 1)
        ctx.restore()
    }
}

// SVG-Icon einer Fähigkeit als Path2D-Liste (für das Zeichnen im Canvas)
const abilityPathCache = {}
function abilityPaths(champ) {
    const name = champ.ability.name
    if (abilityPathCache[name]) return abilityPathCache[name]
    const svg = ABILITY_ICONS[name] || ABILITY_ICONS.Shield
    const out = []
    for (const m of svg.matchAll(/<path( class="f")? d="([^"]+)"/g)) out.push({ path: new Path2D(m[2]), fill: !!m[1] })
    for (const m of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
        const p = new Path2D()
        p.arc(+m[1], +m[2], +m[3], 0, Math.PI * 2)
        out.push({ path: p, fill: false })
    }
    return (abilityPathCache[name] = out)
}

// ============================================================
//  Champion- und Map-Farben: Das Glas nimmt die Farbe dessen an,
//  was gerade im Bild ist. Die Werte kommen direkt aus data.js.
// ============================================================
{
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(",")
    const setChamp = (el, id) => {
        if (el && CHAMPIONS[id]) el.style.setProperty("--champ", rgb(CHAMPIONS[id].color))
    }

    // Die Map färbt Kanten und Tönung aller Glasflächen
    const render = Match.prototype.render
    Match.prototype.render = function (ctx, w, h) {
        if (Match.tintMap !== this.map.id) {
            Match.tintMap = this.map.id
            document.documentElement.style.setProperty("--map", (GLASS[this.map.id] || GLASS.sky).rgb)
        }
        render.call(this, ctx, w, h)
    }

    const wrap = (name, after) => {
        const fn = UI[name]
        UI[name] = function (...args) {
            const out = fn.apply(this, args)
            after.apply(this, args)
            return out
        }
    }

    wrap("buildHud", match => {
        for (const f of match.leads) {
            const el = document.querySelector(`.hud-player[data-side="${f.side}"]`)
            setChamp(el, f.champId)
            const name = el.querySelector(".hud-name")
            if (!name.querySelector("small")) name.insertAdjacentHTML("beforeend", ` <small>${f.champ.role}</small>`)
        }
        const center = document.querySelector(".hud-center")
        let tag = center.querySelector(".hud-map")
        if (!tag) {
            tag = document.createElement("div")
            tag.className = "hud-map"
            center.appendChild(tag)
        }
        tag.textContent = match.map.name
        tag.classList.remove("show")
        void tag.offsetWidth
        tag.classList.add("show")
    })

    wrap("showVs", match => {
        match.leads.forEach((f, i) => setChamp(document.querySelector(`.in-side[data-side="${i}"]`), f.champId))
    })

    wrap("renderQuickChamp", () => setChamp(document.querySelector(".mm-champ"), App.config.champs[0]))

    wrap("renderSide", side => {
        const st = UI.select
        setChamp(document.querySelector(`.sel-side[data-side="${side}"]`), st && (st.picks[side] || st.hover[side]))
    })

    wrap("renderSelect", () => {
        for (const card of document.querySelectorAll(".champ-card")) setChamp(card, card.dataset.id)
    })

    // Im Kampf: farbiges Licht unter den Füßen, schwere Treffer splittern in der Champion-Farbe
    const shadow = Fighter.prototype.drawShadow
    Fighter.prototype.drawShadow = function (ctx) {
        if (this.state !== "fall" && this.state !== "dead" && this.stealthT <= 0) {
            const c = rgb(this.champ.color)
            const glow = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, 62)
            glow.addColorStop(0, `rgba(${c},0.5)`)
            glow.addColorStop(1, `rgba(${c},0)`)
            ctx.save()
            ctx.translate(this.x, this.y + 2)
            ctx.scale(1, 0.36)
            ctx.translate(-this.x, -this.y - 2)
            ctx.fillStyle = glow
            ctx.fillRect(this.x - 62, this.y - 62, 124, 124)
            ctx.restore()
        }
        shadow.call(this, ctx)
    }

    const emit = Match.prototype.emit
    Match.prototype.emit = function (type, data) {
        if (type === "hit" && data && data.heavy && data.att && data.def) {
            const color = `rgba(${rgb(data.att.champ.color)},0.85)`
            for (let i = 0; i < 12; i++) {
                const a = Math.random() * TAU_P
                const v = 240 + Math.random() * 380
                this.fx.particles.push({
                    type: "shard", x: data.def.x, y: data.def.y - 46, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, g: 980, drag: 1.8,
                    life: 0.35 + Math.random() * 0.35, t: 0, size: 6 + Math.random() * 9,
                    spin: (Math.random() - 0.5) * 18, rot: Math.random() * 6, fill: color, edge: "rgba(255,255,255,0.9)"
                })
            }
        }
        emit.call(this, type, data)
    }
}

{
    const render = Match.prototype.render
    Match.prototype.render = function (ctx, w, h) {
        render.call(this, ctx, w, h)
        drawSharpTexts(this, ctx, w, h)
    }
}

// ============================================================
//  Champions: schwebendes Glas-Zubehör und
//  sichtbares Zurückweichen bei Treffern. Nur Darstellung –
//  Trefferflächen, Reichweiten und Werte bleiben unverändert.
// ============================================================
// Positionen in Sprite-Pixeln relativ zu den Füßen, anhand der Idle-Sprites ausgemessen
const CHAMP_LOOK = {
    vanguard: { parts: [{ g: "shield", x: 21, y: 15 }] },
    warbrute: { parts: [{ g: "shard", x: -15, y: 22, ph: 0 }, { g: "shard", x: -20, y: 14, ph: 2 }] },
    boneguard: { parts: [{ g: "orb", orbit: 17, y: 12 }] },
    rageclaw: { parts: [{ g: "shard", x: -14, y: 21, ph: 0 }, { g: "shard", x: 13, y: 21, ph: 2.4 }] },
    nightfang: { parts: [{ g: "moon", x: -13, y: 21 }] },
    arcanis: { parts: [{ g: "orb", x: -14, y: 20 }] },
    seraphina: { parts: [{ g: "halo", x: -1, y: 25 }] },
    valor: { parts: [{ g: "shard", x: -6, y: 36 }] },
    gloop: { parts: [{ g: "bubble", x: -8, y: 17, ph: 0 }, { g: "bubble", x: 7, y: 20, ph: 2 }] },
    gravelord: { parts: [{ g: "crown", x: -1, y: 24 }] }
}

const GLASS_PARTS = {
    shield: [".EEEEE.", "EWLLLME", "EWLLLME", "ELLLMME", "ELLMMME", ".ELMME.", ".ELMME.", "..EME..", "...E..."],
    orb: [".EEE.", "EWLLE", "ELLME", "ELMME", ".EEE."],
    crown: ["E...E...E", "EL.ELE.LE", "ELLWLLLME", "ELLLLLMME", "EEEEEEEEE"],
    halo: ["..EEEEEEE..", ".EWLLLLLME.", "..EEEEEEE.."],
    shard: [".E.", "ELE", "EWE", "ELE", "EME", ".E."],
    moon: ["..EE.", ".EWE.", "ELE..", "ELE..", "ELE..", ".EME.", "..EE."],
    bubble: [".E.", "EWE", ".E."]
}

{
    const cache = {}
    const part = (name, color) => {
        const id = name + color
        if (cache[id]) return cache[id]
        const grid = GLASS_PARTS[name]
        const c = document.createElement("canvas")
        c.width = grid[0].length
        c.height = grid.length
        const g = c.getContext("2d")
        const col = { E: "rgba(16,20,56,0.9)", W: "rgba(255,255,255,0.95)", L: color, M: hexAlpha(color, 0.5) }
        grid.forEach((row, y) => [...row].forEach((ch, x) => {
            if (ch === ".") return
            g.fillStyle = col[ch]
            g.fillRect(x, y, 1, 1)
        }))
        return (cache[id] = c)
    }
    function hexAlpha(hex, a) {
        return `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(",")},${a})`
    }

    // Treffer: Figur weicht zurück und kippt kurz nach hinten
    const takeHit = Fighter.prototype.takeHit
    Fighter.prototype.takeHit = function (source, dmg, kb, heavy, opt) {
        const dir = Math.sign(this.x - source.x) || -this.facing
        takeHit.call(this, source, dmg, kb, heavy, opt)
        this.recoil = { t: this.match.time, dir, power: heavy ? 1.7 : 1 }
    }

    const blockHit = Fighter.prototype.blockHit
    Fighter.prototype.blockHit = function (source, dmg, kb, guardMul) {
        const dir = Math.sign(this.x - source.x) || -this.facing
        const chip = blockHit.call(this, source, dmg, kb, guardMul)
        this.recoil = { t: this.match.time, dir, power: 0.55 }
        return chip
    }

    const draw = Fighter.prototype.draw
    Fighter.prototype.draw = function (ctx) {
        const r = this.recoil
        const k = r ? (this.match.time - r.t) / 0.24 : 1
        if (r && k < 1 && this.state !== "dead" && this.state !== "fall") {
            const q = (1 - k) * (1 - k) * r.power
            ctx.save()
            ctx.translate(this.x + r.dir * q * 13, this.y)
            ctx.rotate(r.dir * q * 0.13)
            ctx.translate(-this.x, -this.y)
            draw.call(this, ctx)
            ctx.restore()
        } else {
            draw.call(this, ctx)
        }
        this.drawGlassPart(ctx)
    }

    Fighter.prototype.drawGlassPart = function (ctx) {
        if (this.state === "dead" || this.state === "fall" || this.stealthT > 0) return
        const look = CHAMP_LOOK[this.champId]
        if (!look) return
        const s = SPRITE_SCALE
        const t = performance.now() / 1000
        ctx.save()
        ctx.imageSmoothingEnabled = false
        ctx.translate(Math.round(this.x), Math.round(this.y))
        if (this.facing < 0) ctx.scale(-1, 1)
        for (const p of look.parts) {
            const img = part(p.g, this.champ.color)
            const bob = Math.round(Math.sin(t * 2.2 + (p.ph || 0)) * 1.2)
            const x = p.orbit ? Math.cos(t * 1.5) * p.orbit : p.x
            const y = p.y + bob + (p.orbit ? Math.sin(t * 1.5) * 3 : 0)
            ctx.drawImage(img, Math.round(x * s - img.width * s / 2), Math.round(-y * s - img.height * s / 2), img.width * s, img.height * s)
        }
        ctx.restore()
    }
}

// ============================================================
//  Weniger Cinematic: kein Kino-Zoom, keine lange Zeitlupe,
//  keine Speedlines. K.O. und Treffer bleiben spürbar, aber direkt.
//  Rundenablauf und Regeln ändern sich nicht.
// ============================================================
{
    Match.prototype.drawImpact = function () {}

    Match.prototype.impactFx = function (color, strength = 1) {
        if (!this.demo) this.flash = Math.max(this.flash, 0.1 * strength)
    }

    const finisherName = Match.prototype.finisherName
    Match.prototype.finisherName = function (h) {
        return { ...finisherName.call(this, h), big: false }
    }

    const knockout = Match.prototype.knockout
    Match.prototype.knockout = function (winner, loser) {
        knockout.call(this, winner, loser)
        if (this.phase !== "ko") return
        this.slowmoT = Math.min(this.slowmoT, 0.2)
        this.hitstop = Math.min(this.hitstop, 0.08)
        this.flash = Math.min(this.flash, 0.16)
        this.shake = Math.min(this.shake, 12)
    }

    // Kamera bleibt beim Kampf: kein Zoom auf den Verlierer, kein Zoom-Stoß bei Treffern
    const updateCamera = Match.prototype.updateCamera
    Match.prototype.updateCamera = function (dt) {
        const ko = this.koTarget
        this.koTarget = null
        this.punch = 0
        updateCamera.call(this, dt)
        this.koTarget = ko
    }
}

// ============================================================
//  Fähigkeiten aus Glas: Schild, Schleim-Pfützen, Bomben-Warnkreise
//  und Ringe werden nicht mehr in der groben Pixel-Ebene, sondern
//  glatt darüber gezeichnet – passend zu HUD und Menüs.
//  Nur Darstellung, an Treffern und Zeiten ändert sich nichts.
// ============================================================
{
    const TAU = Math.PI * 2

    // Pixel-Versionen ausblenden: die Listen kurz leeren, das Original zeichnen lassen, zurücklegen
    const without = (obj, keys, fn) => {
        const saved = keys.map(k => obj[k])
        keys.forEach(k => { obj[k] = [] })
        try { fn() } finally { keys.forEach((k, i) => { obj[k] = saved[i] }) }
    }

    const arenaGround = Match.prototype.drawArenaGround
    Match.prototype.drawArenaGround = function (ctx) {
        without(this, ["puddles"], () => arenaGround.call(this, ctx))
    }

    const telegraphs = Match.prototype.drawTelegraphs
    Match.prototype.drawTelegraphs = function (ctx) {
        without(this, ["bombs", "zones"], () => telegraphs.call(this, ctx))
    }

    const isRing = p => p.type === "ring"
    const drawGround = Effects.prototype.drawGround
    Effects.prototype.drawGround = function (ctx) {
        const all = this.ground
        this.ground = all.filter(p => !isRing(p))
        try { drawGround.call(this, ctx) } finally { this.ground = all }
    }
    const drawParticles = Effects.prototype.draw
    Effects.prototype.draw = function (ctx) {
        const all = this.particles
        this.particles = all.filter(p => !isRing(p))
        try { drawParticles.call(this, ctx) } finally { this.particles = all }
    }

    const fighterFx = Fighter.prototype.drawFx
    Fighter.prototype.drawFx = function (ctx) {
        const shield = this.shieldT
        this.shieldT = 0
        try { fighterFx.call(this, ctx) } finally { this.shieldT = shield }
    }

    // Ring als Glaskante: farbiger Streifen mit feiner weißer Innenlinie
    function glassRing(ctx, p, flat) {
        const k = Math.min(1, p.t / p.life)
        const r = p.radius * (flat ? 0.3 + k * 0.7 : 0.2 + k * 0.8)
        ctx.save()
        ctx.globalAlpha = 1 - k
        ctx.strokeStyle = p.color
        ctx.lineWidth = Math.max(1.5, p.width * 0.6 * (1 - k * 0.6))
        ctx.beginPath()
        if (flat) ctx.ellipse(p.x, p.y, r, r * 0.42, 0, 0, TAU)
        else ctx.arc(p.x, p.y, r, 0, TAU)
        ctx.stroke()
        ctx.strokeStyle = "rgba(255,255,255,0.85)"
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
    }

    // Schleim-Pfütze: grünes Glas mit heller Kante, Glanzlicht und Blasen
    function glassPuddle(ctx, pd) {
        const fade = Math.min(1, (pd.life - pd.t) * 2, pd.t * 6)
        const wob = 1 + Math.sin(pd.t * 3) * 0.03
        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(pd.x, pd.y)
        ctx.scale(wob, 1 / wob)
        const fill = ctx.createLinearGradient(0, -42, 0, 42)
        fill.addColorStop(0, "rgba(190,255,170,0.55)")
        fill.addColorStop(1, "rgba(60,175,80,0.62)")
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.ellipse(0, 0, 95, 42, 0, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = "rgba(225,255,215,0.9)"
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.strokeStyle = "rgba(40,120,50,0.5)"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(0, 2, 88, 37, 0, 0.2, Math.PI - 0.2)
        ctx.stroke()
        // Glanzlicht oben links
        ctx.fillStyle = "rgba(255,255,255,0.42)"
        ctx.beginPath()
        ctx.ellipse(-34, -18, 30, 6, -0.12, 0, TAU)
        ctx.fill()
        // Blasen steigen auf und platzen
        for (let i = 0; i < 6; i++) {
            const life = (pd.t * 0.8 + i * 0.37) % 1
            const a = i * 2.1
            const bx = Math.cos(a) * 58
            const by = Math.sin(a) * 20 - life * 10
            const r = 3 + i % 3 * 2 + life * 2
            ctx.globalAlpha = fade * (1 - life)
            ctx.fillStyle = "rgba(210,255,200,0.35)"
            ctx.strokeStyle = "rgba(255,255,255,0.9)"
            ctx.lineWidth = 1.2
            ctx.beginPath()
            ctx.arc(bx, by, r, 0, TAU)
            ctx.fill()
            ctx.stroke()
        }
        ctx.restore()
    }

    // Bomben-Warnkreis: rötliches Glas, das sich während der Zündung füllt
    function glassTelegraph(ctx, b) {
        const target = b.phase === "fuse" ? 1 : Math.min(1, b.t / b.flight)
        const blink = b.phase === "fuse" && Math.sin(b.t * (20 + b.t * 40)) > 0
        ctx.save()
        ctx.globalAlpha = 0.45 + target * 0.45
        ctx.fillStyle = blink ? "rgba(255,110,80,0.32)" : "rgba(255,90,60,0.16)"
        ctx.beginPath()
        ctx.ellipse(b.tx, b.ty, b.radius, b.radius * 0.5, 0, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = "rgba(255,170,140,0.95)"
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.strokeStyle = "rgba(255,255,255,0.7)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.ellipse(b.tx, b.ty, b.radius - 5, b.radius * 0.5 - 3, 0, 0, TAU)
        ctx.stroke()
        if (b.phase === "fuse") {
            const k = b.t / b.fuse
            const g = ctx.createRadialGradient(b.tx, b.ty, 0, b.tx, b.ty, b.radius * k + 1)
            g.addColorStop(0, "rgba(255,230,180,0.5)")
            g.addColorStop(1, "rgba(255,120,60,0.25)")
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.ellipse(b.tx, b.ty, b.radius * k, b.radius * 0.5 * k, 0, 0, TAU)
            ctx.fill()
        }
        ctx.restore()
    }

    // Schild: Glasblase mit heller Kante, innerem Farbring und Glanzbogen
    function glassShield(ctx, f) {
        const t = f.match.time
        if (f.shieldT < 0.8 && Math.sin(t * 40) > 0) return
        const cx = f.x
        const cy = f.y - 42
        ctx.save()
        const fill = ctx.createRadialGradient(cx - 14, cy - 18, 6, cx, cy, 74)
        fill.addColorStop(0, "rgba(255,255,255,0.08)")
        fill.addColorStop(0.7, "rgba(150,205,255,0.16)")
        fill.addColorStop(1, "rgba(215,238,255,0.5)")
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.ellipse(cx, cy, 62, 72, 0, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.9)"
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.strokeStyle = "rgba(120,185,255,0.55)"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(cx, cy, 56, 66, 0, 0, TAU)
        ctx.stroke()
        // Glanzbogen oben links und ein kleiner Lichtpunkt
        ctx.strokeStyle = "rgba(255,255,255,0.85)"
        ctx.lineWidth = 4
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.ellipse(cx, cy, 50, 60, 0, -2.55, -1.85)
        ctx.stroke()
        ctx.fillStyle = "rgba(255,255,255,0.8)"
        ctx.beginPath()
        ctx.arc(cx + 30, cy - 42, 3, 0, TAU)
        ctx.fill()
        // langsam wandernder Lichtschimmer
        const a = t * 1.8
        ctx.strokeStyle = "rgba(200,230,255,0.6)"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, 62, 72, 0, a, a + 0.6)
        ctx.stroke()
        ctx.restore()
    }

    // Heilen und Raserei: weicher Lichtkreis unter den Füßen statt nur Pixel-Färbung
    function glassAura(ctx, f) {
        let color = null
        if (f.healLeft > 0) color = "120,255,160"
        else if (f.frenzyT > 0) color = "255,90,130"
        if (!color || f.state === "dead" || f.state === "fall") return
        const pulse = 0.75 + Math.sin(f.match.time * 6) * 0.25
        ctx.save()
        ctx.translate(f.x, f.y)
        ctx.scale(1, 0.4)
        ctx.strokeStyle = `rgba(${color},${0.8 * pulse})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, 0, 50, 0, TAU)
        ctx.stroke()
        ctx.strokeStyle = "rgba(255,255,255,0.7)"
        ctx.lineWidth = 1.2
        ctx.stroke()
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 50)
        g.addColorStop(0, `rgba(${color},0)`)
        g.addColorStop(1, `rgba(${color},${0.28 * pulse})`)
        ctx.fillStyle = g
        ctx.fill()
        ctx.restore()
    }

    Match.prototype.drawGlassGround = function (ctx) {
        for (const pd of this.puddles) glassPuddle(ctx, pd)
        if (this.phase !== "replay") for (const f of this.fighters) glassAura(ctx, f)
        for (const b of this.bombs) glassTelegraph(ctx, b)
        for (const z of this.zones) {
            if (z.done) continue
            ctx.save()
            ctx.globalAlpha = 0.7
            ctx.strokeStyle = z.color
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.ellipse(z.x, z.y, z.radius, z.radius * 0.5, 0, 0, TAU)
            ctx.stroke()
            ctx.restore()
        }
        for (const p of this.fx.ground) if (isRing(p)) glassRing(ctx, p, true)
    }

    Match.prototype.drawGlassTop = function (ctx) {
        if (this.phase !== "replay") for (const f of this.fighters) if (f.shieldT > 0) glassShield(ctx, f)
        for (const p of this.fx.particles) if (isRing(p)) glassRing(ctx, p, false)
    }
}

// ============================================================
//  Klares, neutrales Glas für alles in der Arena, was keine Figur
//  und keine Karte ist: Säulen, Kisten, Power-ups, Heilblüten.
//  Gleiche Maße wie vorher – Hitboxen bleiben unverändert.
// ============================================================
{
    const rr = (ctx, x, y, w, h, r) => {
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + w, y, x + w, y + h, r)
        ctx.arcTo(x + w, y + h, x, y + h, r)
        ctx.arcTo(x, y + h, x, y, r)
        ctx.arcTo(x, y, x + w, y, r)
        ctx.closePath()
    }
    // Glaskörper: hell links, klar in der Mitte, dunklere Kante rechts, Glanzstreifen
    const glassBody = (ctx, x, y, w, h, r) => {
        const body = ctx.createLinearGradient(x, 0, x + w, 0)
        body.addColorStop(0, "rgba(255,255,255,0.55)")
        body.addColorStop(0.25, "rgba(255,255,255,0.18)")
        body.addColorStop(0.7, "rgba(220,230,245,0.14)")
        body.addColorStop(1, "rgba(70,84,110,0.38)")
        rr(ctx, x, y, w, h, r)
        ctx.fillStyle = body
        ctx.fill()
        ctx.strokeStyle = "rgba(30,40,60,0.35)"
        ctx.lineWidth = 4
        ctx.stroke()
        ctx.strokeStyle = "rgba(255,255,255,0.9)"
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.save()
        rr(ctx, x, y, w, h, r)
        ctx.clip()
        ctx.fillStyle = "rgba(255,255,255,0.75)"
        ctx.fillRect(x + w * 0.16, y + 6, Math.max(3, w * 0.09), h - 12)
        ctx.fillStyle = "rgba(255,255,255,0.35)"
        ctx.fillRect(x + w * 0.32, y + 6, Math.max(2, w * 0.04), h - 12)
        ctx.restore()
    }

    drawProp = function (ctx, pr) {
        const shake = pr.hitT > 0 ? (Math.random() - 0.5) * 6 : 0
        const cx = pr.x + shake
        const base = pr.y + 10
        ctx.save()
        // weicher Schatten auf dem Boden
        const sh = ctx.createRadialGradient(cx, base - 4, 4, cx, base - 4, 40)
        sh.addColorStop(0, "rgba(20,26,40,0.28)")
        sh.addColorStop(1, "rgba(20,26,40,0)")
        ctx.fillStyle = sh
        ctx.beginPath()
        ctx.ellipse(cx, base - 4, 40, 14, 0, 0, TAU_P)
        ctx.fill()
        if (pr.type === "pillar") {
            const w = 42, h = 92, x = cx - w / 2, y = base - h
            glassBody(ctx, x, y + 8, w, h - 16, 10)
            // Deckel und Fuß als Glasringe
            for (const [yy, a] of [[y + 8, 0.6], [base - 8, 0.3]]) {
                ctx.beginPath()
                ctx.ellipse(cx, yy, w / 2 + 3, 8, 0, 0, TAU_P)
                ctx.fillStyle = `rgba(255,255,255,${a})`
                ctx.fill()
                ctx.strokeStyle = "rgba(255,255,255,0.95)"
                ctx.lineWidth = 2
                ctx.stroke()
            }
        } else {
            const w = 44, h = 36, x = cx - w / 2, y = base - h
            // Oberseite des Glaswürfels
            ctx.beginPath()
            ctx.moveTo(x + 4, y + 6)
            ctx.lineTo(x + 10, y - 4)
            ctx.lineTo(x + w + 4, y - 4)
            ctx.lineTo(x + w - 2, y + 6)
            ctx.closePath()
            ctx.fillStyle = "rgba(255,255,255,0.5)"
            ctx.fill()
            ctx.strokeStyle = "rgba(255,255,255,0.9)"
            ctx.lineWidth = 2
            ctx.stroke()
            glassBody(ctx, x, y + 4, w, h - 4, 8)
            // innen schimmert die Beute
            const a = 0.55 + Math.sin(performance.now() / 500 + pr.x) * 0.2
            const core = ctx.createRadialGradient(cx, y + 20, 0, cx, y + 20, 14)
            core.addColorStop(0, `rgba(255,236,160,${a})`)
            core.addColorStop(1, "rgba(255,236,160,0)")
            ctx.fillStyle = core
            ctx.fillRect(cx - 14, y + 6, 28, 28)
            // Sprünge zeigen, wie viel die Kiste noch aushält
            const dmg = 3 - pr.hp
            if (dmg > 0) {
                ctx.strokeStyle = "rgba(255,255,255,0.95)"
                ctx.lineWidth = 1.5
                ctx.beginPath()
                ctx.moveTo(x + 8, y + 10); ctx.lineTo(x + 18, y + 20); ctx.lineTo(x + 15, y + 30)
                ctx.moveTo(x + 18, y + 20); ctx.lineTo(x + 26, y + 22)
                if (dmg > 1) {
                    ctx.moveTo(x + w - 6, y + 12); ctx.lineTo(x + w - 16, y + 18); ctx.lineTo(x + w - 12, y + 30)
                    ctx.moveTo(x + w - 16, y + 18); ctx.lineTo(x + w - 24, y + 14)
                }
                ctx.stroke()
            }
        }
        ctx.restore()
    }

    // Power-up: Glaskugel mit leuchtendem Kern, Lichtkante und Glanzpunkt
    drawItemOrb = function (ctx, x, y, type, t) {
        const it = ITEM_TYPES[type]
        const cx = x
        const cy = y - 36 + Math.sin(t * 5) * 6
        const R = 19
        ctx.save()
        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, R * 1.9)
        glow.addColorStop(0, it.color + "88")
        glow.addColorStop(1, it.color + "00")
        ctx.fillStyle = glow
        ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4)
        const ball = ctx.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, R)
        ball.addColorStop(0, "rgba(255,255,255,0.5)")
        ball.addColorStop(0.6, "rgba(255,255,255,0.12)")
        ball.addColorStop(1, "rgba(200,215,240,0.35)")
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, TAU_P)
        ctx.fillStyle = ball
        ctx.fill()
        // farbiger Kern
        const core = ctx.createRadialGradient(cx, cy + 3, 0, cx, cy + 3, 10 + Math.sin(t * 8))
        core.addColorStop(0, "#ffffff")
        core.addColorStop(0.35, it.color)
        core.addColorStop(1, it.color + "00")
        ctx.fillStyle = core
        ctx.beginPath()
        ctx.arc(cx, cy + 3, 11, 0, TAU_P)
        ctx.fill()
        // Kante
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, TAU_P)
        ctx.strokeStyle = "rgba(30,40,60,0.3)"
        ctx.lineWidth = 3.5
        ctx.stroke()
        ctx.strokeStyle = "rgba(255,255,255,0.95)"
        ctx.lineWidth = 1.8
        ctx.stroke()
        // Glanz oben links, Lichtbogen unten
        ctx.fillStyle = "rgba(255,255,255,0.9)"
        ctx.beginPath()
        ctx.ellipse(cx - 7, cy - 9, 6, 3.5, -0.6, 0, TAU_P)
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.55)"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, R - 4, 0.35, Math.PI - 0.35)
        ctx.stroke()
        ctx.restore()
    }
}

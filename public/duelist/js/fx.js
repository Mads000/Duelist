// ============================================================
//  Effekte – Partikel, Schadenszahlen, Ringe, Nachbilder
// ============================================================

class Effects {
    constructor() {
        this.particles = []
        this.texts = []
        this.ground = [] // Effekte auf dem Boden (unter den Figuren)
    }

    clear() {
        this.particles.length = 0
        this.texts.length = 0
        this.ground.length = 0
    }

    // Kleine Pixel-Funken beim Treffer
    sparks(x, y, dir, { count = 14, color = "#fff6c8", color2 = "#ffb02e", speed = 520, spread = 1.3, size = 7 } = {}) {
        for (let i = 0; i < count; i++) {
            const a = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * spread * 2
            const s = speed * (0.35 + Math.random() * 0.8)
            this.particles.push({
                type: "spark", x, y,
                vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120,
                g: 900, drag: 3,
                life: 0.25 + Math.random() * 0.3, t: 0,
                size: size * (0.5 + Math.random() * 0.7),
                color: Math.random() < 0.5 ? color : color2
            })
        }
    }

    slash(x, y, dir, color = "rgba(255,255,255,0.9)", big = false) {
        this.particles.push({ type: "slash", x, y, dir, life: big ? 0.2 : 0.14, t: 0, color, size: big ? 110 : 80 })
    }

    dust(x, y, { count = 3, size = 16, color = "rgba(214,170,110,0.55)", vx = 0 } = {}) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                type: "dust", x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 6,
                vx: vx + (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40,
                g: 0, drag: 2.5,
                life: 0.4 + Math.random() * 0.35, t: 0,
                size: size * (0.6 + Math.random() * 0.8), color
            })
        }
    }

    ring(x, y, { radius = 120, color = "rgba(255,255,255,0.8)", life = 0.4, width = 8, ground = true } = {}) {
        const p = { type: "ring", x, y, radius, color, life, t: 0, width }
        if (ground) this.ground.push(p)
        else this.particles.push(p)
    }

    explosion(x, y, radius) {
        this.ring(x, y, { radius: radius * 1.25, color: "rgba(255,210,120,0.95)", life: 0.45, width: 14 })
        this.ring(x, y, { radius: radius * 0.8, color: "rgba(255,120,40,0.8)", life: 0.3, width: 22 })
        this.ground.push({ type: "scorch", x, y, radius: radius * 0.75, life: 4, t: 0 })
        for (let i = 0; i < 46; i++) {
            const a = Math.random() * Math.PI * 2
            const s = 150 + Math.random() * 650
            this.particles.push({
                type: i % 3 === 0 ? "smoke" : "spark",
                x, y: y - 20,
                vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.55 - 220,
                g: i % 3 === 0 ? -40 : 800, drag: i % 3 === 0 ? 3 : 1.6,
                life: 0.4 + Math.random() * 0.6, t: 0,
                size: i % 3 === 0 ? 26 + Math.random() * 26 : 8 + Math.random() * 8,
                color: ["#fff1b0", "#ffb02e", "#ff6a1f", "#c8301c"][i % 4]
            })
        }
        this.particles.push({ type: "flash", x, y: y - 30, life: 0.18, t: 0, size: radius * 1.6 })
    }

    heal(x, y) {
        for (let i = 0; i < 3; i++) {
            this.particles.push({
                type: "plus", x: x + (Math.random() - 0.5) * 70, y: y - 20 - Math.random() * 60,
                vx: 0, vy: -70 - Math.random() * 40, g: 0, drag: 0.5,
                life: 0.7 + Math.random() * 0.3, t: 0, size: 10 + Math.random() * 6, color: "#7dff9b"
            })
        }
    }

    smoke(x, y, count = 16, color = "rgba(60,40,90,0.65)") {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2
            const s = 40 + Math.random() * 160
            this.particles.push({
                type: "smoke", x: x + Math.cos(a) * 10, y: y - 30 + Math.sin(a) * 30,
                vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 40,
                g: -30, drag: 3,
                life: 0.5 + Math.random() * 0.4, t: 0, size: 18 + Math.random() * 22, color
            })
        }
    }

    // Nachbild (Dash) – speichert das aktuelle Sprite-Frame
    // geom = { ax, ay, w, h } wie beim Zeichnen der Figur
    ghost(img, frame, x, y, geom, flip, color) {
        this.particles.push({ type: "ghost", img, frame, x, y, geom, flip, color, life: 0.22, t: 0 })
    }

    // Animiertes Effekt-Spritesheet (z.B. Eis-Explosion), zentriert auf x/y
    sheet(img, x, y, frames, fps, { flip = false, center = { x: 50, y: 50 }, scale = SPRITE_SCALE } = {}) {
        this.particles.push({ type: "sheet", img, x, y, frames, fps, flip, center, scale, life: frames / fps, t: 0 })
    }

    // Halbkreis-Schild vor einer blockenden Figur
    guardArc(x, y, dir, perfect) {
        this.particles.push({ type: "guard", x, y, dir, perfect, life: perfect ? 0.35 : 0.2, t: 0 })
    }

    // Umgebung: Glut (Vulkan), Schnee (Frost), Staubflocken (Himmel)
    ambient(kind, cam, view) {
        const left = cam.x - view.w / 2 / cam.zoom
        const top = cam.y - view.h / 2 / cam.zoom
        const w = view.w / cam.zoom
        const h = view.h / cam.zoom
        if (kind === "embers") {
            this.particles.push({
                type: "spark", x: left + Math.random() * w, y: top + h + 10,
                vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 120, g: -10, drag: 0.3,
                life: 2 + Math.random() * 2, t: 0, size: 3 + Math.random() * 5,
                color: Math.random() < 0.5 ? "#ffb347" : "#ff5a1f", glow: true
            })
        } else if (kind === "snow") {
            this.particles.push({
                type: "snow", x: left + Math.random() * (w + 200) - 100, y: top - 10,
                vx: 30 + Math.random() * 40, vy: 70 + Math.random() * 80, g: 0, drag: 0,
                life: h / 90 + 2, t: 0, size: 2 + Math.random() * 4, wobble: Math.random() * 6
            })
        } else if (kind === "clouds") {
            this.particles.push({
                type: "mote", x: left + Math.random() * w, y: top + Math.random() * h,
                vx: 10 + Math.random() * 15, vy: -5 - Math.random() * 10, g: 0, drag: 0,
                life: 3 + Math.random() * 3, t: 0, size: 2 + Math.random() * 2
            })
        }
    }

    // Feuerfontäne (Vulkan-Hazard)
    geyser(x, y) {
        this.ring(x, y, { radius: 120, color: "rgba(255,150,60,0.95)", life: 0.5, width: 12 })
        this.ground.push({ type: "scorch", x, y, radius: 80, life: 3, t: 0 })
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                type: i % 4 === 0 ? "smoke" : "spark",
                x: x + (Math.random() - 0.5) * 60, y,
                vx: (Math.random() - 0.5) * 160, vy: -400 - Math.random() * 600,
                g: i % 4 === 0 ? -40 : 900, drag: 1,
                life: 0.6 + Math.random() * 0.6, t: 0,
                size: i % 4 === 0 ? 24 + Math.random() * 20 : 7 + Math.random() * 8,
                color: ["#fff1b0", "#ffb02e", "#ff6a1f", "#c8301c"][i % 4]
            })
        }
    }

    text(x, y, str, { color = "#fff", size = 46, life = 0.9, vy = -160, stroke = "#1a0d06" } = {}) {
        this.texts.push({ x: x + (Math.random() - 0.5) * 24, y, str, color, size, life, t: 0, vy, stroke })
    }

    update(dt) {
        for (const list of [this.particles, this.ground, this.texts]) {
            for (let i = list.length - 1; i >= 0; i--) {
                const p = list[i]
                p.t += dt
                if (p.t >= p.life) {
                    list.splice(i, 1)
                    continue
                }
                if (p.vx !== undefined && p.type !== "ghost") {
                    p.vy += (p.g || 0) * dt
                    const d = Math.exp(-(p.drag || 0) * dt)
                    p.vx *= d
                    p.vy *= d
                    p.x += p.vx * dt
                    p.y += p.vy * dt
                }
                if (list === this.texts) {
                    p.y += p.vy * dt
                    p.vy *= Math.exp(-4 * dt)
                }
            }
        }
    }

    drawGround(ctx) {
        for (const p of this.ground) {
            const k = p.t / p.life
            if (p.type === "ring") {
                ctx.save()
                ctx.globalAlpha = 1 - k
                ctx.strokeStyle = p.color
                ctx.lineWidth = p.width * (1 - k * 0.6)
                ctx.beginPath()
                ctx.ellipse(p.x, p.y, p.radius * (0.3 + k * 0.7), p.radius * (0.3 + k * 0.7) * 0.42, 0, 0, Math.PI * 2)
                ctx.stroke()
                ctx.restore()
            } else if (p.type === "scorch") {
                ctx.save()
                ctx.globalAlpha = 0.45 * (1 - k)
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius)
                g.addColorStop(0, "rgba(30,15,5,1)")
                g.addColorStop(1, "rgba(30,15,5,0)")
                ctx.fillStyle = g
                ctx.beginPath()
                ctx.ellipse(p.x, p.y, p.radius, p.radius * 0.42, 0, 0, Math.PI * 2)
                ctx.fill()
                ctx.restore()
            }
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            const k = p.t / p.life
            ctx.save()
            switch (p.type) {
                case "spark":
                    ctx.globalAlpha = 1 - k * k
                    if (p.glow) ctx.globalCompositeOperation = "lighter"
                    ctx.fillStyle = p.color
                    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size * (1 - k * 0.5), p.size * (1 - k * 0.5))
                    break
                case "dust":
                case "smoke":
                    ctx.globalAlpha = (1 - k) * (p.type === "smoke" ? 0.8 : 0.7)
                    ctx.fillStyle = p.color
                    ctx.beginPath()
                    ctx.arc(p.x, p.y, p.size * (0.6 + k * 0.8), 0, Math.PI * 2)
                    ctx.fill()
                    break
                case "plus": {
                    ctx.globalAlpha = 1 - k
                    ctx.fillStyle = p.color
                    const s = p.size
                    ctx.fillRect(p.x - s / 2, p.y - s / 6, s, s / 3)
                    ctx.fillRect(p.x - s / 6, p.y - s / 2, s / 3, s)
                    break
                }
                case "ring":
                    ctx.globalAlpha = 1 - k
                    ctx.strokeStyle = p.color
                    ctx.lineWidth = p.width * (1 - k)
                    ctx.beginPath()
                    ctx.arc(p.x, p.y, p.radius * (0.2 + k * 0.8), 0, Math.PI * 2)
                    ctx.stroke()
                    break
                case "slash": {
                    // Sichel-förmiger Schlag-Bogen
                    ctx.globalAlpha = 1 - k
                    ctx.translate(p.x, p.y)
                    ctx.scale(p.dir, 1)
                    ctx.rotate(-0.6 + k * 1.2)
                    ctx.fillStyle = p.color
                    ctx.beginPath()
                    ctx.arc(0, 0, p.size, -1.1, 1.1)
                    ctx.arc(-p.size * 0.28, 0, p.size * 0.86, 1.1, -1.1, true)
                    ctx.fill()
                    break
                }
                case "flash": {
                    ctx.globalAlpha = 1 - k
                    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
                    g.addColorStop(0, "rgba(255,250,220,1)")
                    g.addColorStop(0.4, "rgba(255,190,90,0.7)")
                    g.addColorStop(1, "rgba(255,120,40,0)")
                    ctx.fillStyle = g
                    ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)
                    break
                }
                case "snow":
                    ctx.globalAlpha = Math.min(1, (p.life - p.t) * 2) * 0.9
                    ctx.fillStyle = "#f4f9ff"
                    ctx.fillRect(p.x + Math.sin(p.t * 2 + p.wobble) * 12, p.y, p.size, p.size)
                    break
                case "mote":
                    ctx.globalAlpha = Math.sin(k * Math.PI) * 0.5
                    ctx.fillStyle = "#ffffff"
                    ctx.fillRect(p.x, p.y, p.size, p.size)
                    break
                case "sheet": {
                    const f = Math.min(p.frames - 1, Math.floor(p.t * p.fps))
                    const s = p.scale
                    ctx.translate(p.x, p.y)
                    if (p.flip) ctx.scale(-1, 1)
                    ctx.drawImage(p.img, f * FRAME, 0, FRAME, FRAME, -p.center.x * s, -p.center.y * s, FRAME * s, FRAME * s)
                    break
                }
                case "guard": {
                    ctx.globalAlpha = (1 - k) * 0.95
                    ctx.translate(p.x, p.y)
                    ctx.scale(p.dir, 1)
                    ctx.strokeStyle = p.perfect ? "#fff4a8" : "#9fd0ff"
                    ctx.lineWidth = p.perfect ? 9 : 6
                    ctx.beginPath()
                    ctx.ellipse(0, 0, 34 + k * 22, 52 + k * 22, 0, -1.2, 1.2)
                    ctx.stroke()
                    break
                }
                case "ghost":
                    ctx.translate(p.x, p.y)
                    if (p.flip) ctx.scale(-1, 1)
                    drawTintedFrame(ctx, p.img, p.frame, -p.geom.ax, -p.geom.ay, p.geom.w, p.geom.h, p.color, 0.5 * (1 - k))
                    break
            }
            ctx.restore()
        }
    }

    drawTexts(ctx) {
        for (const p of this.texts) {
            const k = p.t / p.life
            const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : 1.3 - Math.min(0.3, (k - 0.12) * 1.5)
            ctx.save()
            ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
            ctx.translate(p.x, p.y)
            ctx.scale(pop, pop)
            ctx.font = `${p.size}px "Bebas Neue", Impact, sans-serif`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.lineJoin = "round"
            ctx.lineWidth = 8
            ctx.strokeStyle = p.stroke
            ctx.strokeText(p.str, 0, 0)
            ctx.fillStyle = p.color
            ctx.fillText(p.str, 0, 0)
            ctx.restore()
        }
    }
}

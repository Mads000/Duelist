// ============================================================
//  Bilder laden (mit Fortschritt für den Ladebildschirm)
// ============================================================

const IMAGES = {}

function spritePath(champ, file) {
    // aufgewertete Sprites (Umriss, Licht & Schatten) – erzeugt von tools/make_sprites.py
    return `${ASSET_ROOT}characters-hd/${champ.folder}/${champ.folder}-${file}.png`
}

function loadImage(key, src) {
    return new Promise(resolve => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => {
            console.warn("Bild konnte nicht geladen werden:", src)
            resolve(img)
        }
        img.src = src
        IMAGES[key] = img
    })
}

function championFiles(champ) {
    const files = new Set()
    for (const a of Object.values(champ.anims)) files.add(a.file)
    for (const m of [...champ.light, champ.heavy]) {
        files.add(m.anim.file)
        if (m.projectile) files.add(m.projectile.effect)
        if (m.zone) files.add(m.zone.effect)
    }
    return files
}

function loadAllAssets(onProgress) {
    const jobs = [
        ["sky", ASSET_ROOT + "ui/StartBackground.png"],
        ["logo", ASSET_ROOT + "Überschriften/DUELIST.PNG"]
    ]
    for (const id of MAP_ORDER) jobs.push(["map:" + id, ASSET_ROOT + MAPS[id].img])

    for (const id of CHAMPION_ORDER) {
        const champ = CHAMPIONS[id]
        for (const f of championFiles(champ)) jobs.push([`${id}:${f}`, spritePath(champ, f)])
        jobs.push([`icon:${id}`, ASSET_ROOT + champ.ability.icon])
    }
    jobs.push(["bomb", ASSET_ROOT + "Faehigkeiten/bombe2.png"])

    let done = 0
    return Promise.all(jobs.map(([key, src]) =>
        loadImage(key, src).then(() => {
            done++
            if (onProgress) onProgress(done / jobs.length)
        })
    ))
}

function champImage(champId, file) {
    return IMAGES[`${champId}:${file}`]
}

// Animation eines Champions per Name: idle, run, light0, light1, heavy, death ...
function champAnim(champ, name) {
    if (name.startsWith("light")) {
        const i = parseInt(name.slice(5)) || 0
        return champ.light[Math.min(i, champ.light.length - 1)].anim
    }
    if (name === "heavy") return champ.heavy.anim
    return champ.anims[name] || champ.anims.idle
}

let tintCanvas = null
let tintCtx = null

// Zeichnet ein Sprite-Frame einfarbig (weißer Treffer-Blitz, Nachbilder)
function drawTintedFrame(ctx, img, frame, dx, dy, dw, dh, color, alpha = 1) {
    if (!tintCanvas) {
        tintCanvas = document.createElement("canvas")
        tintCanvas.width = FRAME
        tintCanvas.height = FRAME
        tintCtx = tintCanvas.getContext("2d")
        tintCtx.imageSmoothingEnabled = false
    }
    tintCtx.globalCompositeOperation = "source-over"
    tintCtx.clearRect(0, 0, FRAME, FRAME)
    tintCtx.drawImage(img, frame * FRAME, 0, FRAME, FRAME, 0, 0, FRAME, FRAME)
    tintCtx.globalCompositeOperation = "source-atop"
    tintCtx.fillStyle = color
    tintCtx.fillRect(0, 0, FRAME, FRAME)

    const prev = ctx.globalAlpha
    ctx.globalAlpha = prev * alpha
    ctx.drawImage(tintCanvas, 0, 0, FRAME, FRAME, dx, dy, dw, dh)
    ctx.globalAlpha = prev
}

// Kleine animierte Vorschau eines Champions auf einem <canvas> (Menüs, HUD)
class SpritePreview {
    constructor(canvas, champId, animName = "idle", { zoom = 1, flip = false, locked = false } = {}) {
        this.canvas = canvas
        this.ctx = canvas.getContext("2d")
        this.zoom = zoom
        this.flip = flip
        this.locked = locked
        this.set(champId, animName)
        SpritePreview.all.add(this)
    }

    set(champId, animName = "idle") {
        this.champId = champId
        this.animName = animName
        this.time = 0
    }

    draw(dt) {
        if (!this.canvas.isConnected) {
            SpritePreview.all.delete(this)
            return
        }
        // nicht sichtbare Vorschauen nicht zeichnen
        if (this.canvas.offsetParent === null || this.canvas.closest(".screen:not(.active)")) return
        this.time += dt
        const ctx = this.ctx
        const w = this.canvas.width
        const h = this.canvas.height
        ctx.clearRect(0, 0, w, h)
        const champ = CHAMPIONS[this.champId]
        if (!champ) return
        const anim = champAnim(champ, this.animName)
        const img = champImage(this.champId, anim.file)
        if (!img || !img.complete) return

        // Angriffe einmal abspielen, danach zurück in die Ruhehaltung
        if (!["idle", "run", "death"].includes(this.animName) && this.time * anim.fps >= anim.frames) {
            this.set(this.champId, "idle")
            return this.draw(0)
        }
        let frame = Math.floor(this.time * anim.fps) % anim.frames
        if (this.animName === "death") frame = Math.min(anim.frames - 1, Math.floor(this.time * anim.fps))

        // Ausschnitt um die Figur herum (Figur ~25px in einem 100px Frame)
        const view = 44 / this.zoom
        const scale = Math.min(w, h) / view
        ctx.imageSmoothingEnabled = false
        ctx.save()
        ctx.translate(w / 2, h * 0.78)
        if (this.flip) ctx.scale(-1, 1)
        if (this.locked) ctx.filter = "brightness(0)"
        ctx.drawImage(img, frame * FRAME, 0, FRAME, FRAME,
            -champ.anchor.x * scale, -champ.anchor.y * scale, FRAME * scale, FRAME * scale)
        ctx.restore()
    }

    static tick(dt) {
        for (const p of SpritePreview.all) p.draw(dt)
    }
}
SpritePreview.all = new Set()

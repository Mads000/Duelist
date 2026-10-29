// ============================================================
//  Bilder laden (mit Fortschritt für den Ladebildschirm)
// ============================================================

const IMAGES = {}

function spritePath(champ, file) {
    return `${ASSET_ROOT}characters/${champ.folder}/${champ.folder}-${file}.png`
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

function loadAllAssets(onProgress) {
    const jobs = [
        ["arena", ASSET_ROOT + "ui/Arena2.png"],
        ["sky", ASSET_ROOT + "ui/StartBackground.png"],
        ["logo", ASSET_ROOT + "Überschriften/DUELIST.PNG"]
    ]

    for (const id of CHAMPION_ORDER) {
        const champ = CHAMPIONS[id]
        const files = new Set()
        for (const a of Object.values(champ.anims)) files.add(a.file)
        for (const c of champ.combo) files.add(c.anim.file)
        for (const f of files) jobs.push([`${id}:${f}`, spritePath(champ, f)])
        jobs.push([`icon:${id}`, ASSET_ROOT + champ.ability.icon])
    }

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

let tintCanvas = null
let tintCtx = null

// Zeichnet ein Sprite-Frame einfarbig (weißer Treffer-Blitz, Schatten, Nachbilder)
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
    constructor(canvas, champId, animName = "idle", { zoom = 1, flip = false } = {}) {
        this.canvas = canvas
        this.ctx = canvas.getContext("2d")
        this.zoom = zoom
        this.flip = flip
        this.time = Math.random() * 2
        this.set(champId, animName)
        SpritePreview.all.add(this)
    }

    set(champId, animName = "idle") {
        this.champId = champId
        this.animName = animName
        this.time = 0
    }

    currentAnim() {
        const champ = CHAMPIONS[this.champId]
        if (!champ) return null
        if (this.animName.startsWith("attack")) {
            const i = parseInt(this.animName.slice(6)) || 0
            return champ.combo[Math.min(i, champ.combo.length - 1)].anim
        }
        return champ.anims[this.animName] || champ.anims.idle
    }

    draw(dt) {
        if (!this.canvas.isConnected) {
            SpritePreview.all.delete(this)
            return
        }
        this.time += dt
        const ctx = this.ctx
        const w = this.canvas.width
        const h = this.canvas.height
        ctx.clearRect(0, 0, w, h)
        const anim = this.currentAnim()
        if (!anim) return
        const champ = CHAMPIONS[this.champId]
        const img = champImage(this.champId, anim.file)
        if (!img || !img.complete) return

        let frame = Math.floor(this.time * anim.fps) % anim.frames
        if (this.animName === "death") frame = Math.min(anim.frames - 1, Math.floor(this.time * anim.fps))

        // Ausschnitt um die Figur herum (Figur ~25px in einem 100px Frame)
        const view = 44 / this.zoom
        const scale = Math.min(w, h) / view
        ctx.imageSmoothingEnabled = false
        ctx.save()
        ctx.translate(w / 2, h * 0.78)
        if (this.flip) ctx.scale(-1, 1)
        ctx.drawImage(img, frame * FRAME, 0, FRAME, FRAME,
            -champ.anchor.x * scale, -champ.anchor.y * scale, FRAME * scale, FRAME * scale)
        ctx.restore()
    }

    static tick(dt) {
        for (const p of SpritePreview.all) p.draw(dt)
    }
}
SpritePreview.all = new Set()

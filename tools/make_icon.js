// ============================================================
//  App-Icon für DUELIST: Gloop in seiner Ruhe-Pose vor den Pixel-Wolken
//  aus dem Spiel. Das ganze Bild wirkt wie hinter Glas: Glanz oben,
//  heller Rand, schräger Lichtstreifen – ohne eigene Scheibe.
//  Läuft im Browser auf der Spielseite (braucht die geladenen Sprites):
//    1. Spiel lokal starten, http://localhost:8080/duelist/ öffnen, Titelbild abwarten
//    2. F12 → Konsole → Inhalt dieser Datei einfügen
//    3. await makeIcons() lädt icon-512.png und icon-192.png herunter
//       → nach public/duelist/icons/ kopieren
// ============================================================

async function makeIcons({ download = true } = {}) {
    const clouds = await new Promise((ok, fail) => {
        const img = new Image()
        img.onload = () => ok(img)
        img.onerror = fail
        img.src = "../assets/ui/StartBackground.png"
    })

    // erstes Ruhe-Bild von Gloop, auf die Figur zugeschnitten
    const champ = CHAMPIONS.gloop
    const anim = champAnim(champ, "idle")
    const sheet = skinImage("gloop", anim.file, "base")
    const frame = document.createElement("canvas")
    frame.width = frame.height = FRAME
    const fg = frame.getContext("2d")
    fg.drawImage(sheet, 0, 0, FRAME, FRAME, 0, 0, FRAME, FRAME)
    const data = fg.getImageData(0, 0, FRAME, FRAME).data
    let x0 = FRAME, y0 = FRAME, x1 = 0, y1 = 0
    for (let y = 0; y < FRAME; y++) {
        for (let x = 0; x < FRAME; x++) {
            if (data[(y * FRAME + x) * 4 + 3] < 20) continue
            x0 = Math.min(x0, x); y0 = Math.min(y0, y)
            x1 = Math.max(x1, x); y1 = Math.max(y1, y)
        }
    }
    const sw = x1 - x0 + 1
    const sh = y1 - y0 + 1

    function drawIcon(size) {
        const c = document.createElement("canvas")
        c.width = c.height = size
        const g = c.getContext("2d")
        g.scale(size / 512, size / 512)
        g.imageSmoothingEnabled = false

        // Himmel aus dem Spiel, leicht unscharf – wirkt wie tief hinter dem Glas
        g.save()
        g.filter = "blur(2.5px) saturate(1.25)"
        g.drawImage(clouds, 40, 470, 540, 540, -8, -8, 528, 528)
        g.restore()
        const shade = g.createLinearGradient(0, 0, 0, 512)
        shade.addColorStop(0, "rgba(16,52,150,0.62)")
        shade.addColorStop(0.7, "rgba(30,90,200,0.12)")
        shade.addColorStop(1, "rgba(30,90,200,0.05)")
        g.fillStyle = shade
        g.fillRect(0, 0, 512, 512)

        // Gloop groß in der Mitte, Pixel bleiben scharf
        const scale = Math.floor(Math.min(380 / sw, 300 / sh))
        const w = sw * scale
        const h = sh * scale
        const gx = Math.round(256 - w / 2)
        const gy = Math.round(300 - h / 2)
        g.save()
        g.filter = "blur(10px)"
        g.fillStyle = "rgba(10,30,90,0.35)"
        g.beginPath()
        g.ellipse(256, gy + h + 6, w * 0.42, 16, 0, 0, Math.PI * 2)
        g.fill()
        g.restore()
        // Gloop selbst glänzt wie Glas: Lichtkante oben, Glanzpunkt, Schimmer nur auf der Figur
        const body = document.createElement("canvas")
        body.width = body.height = 512
        const bg = body.getContext("2d")
        bg.imageSmoothingEnabled = false
        bg.drawImage(frame, x0, y0, sw, sh, gx, gy, w, h)
        bg.globalCompositeOperation = "source-atop"
        const sheen = bg.createLinearGradient(0, gy, 0, gy + h)
        sheen.addColorStop(0, "rgba(255,255,255,0.55)")
        sheen.addColorStop(0.45, "rgba(255,255,255,0.1)")
        sheen.addColorStop(0.46, "rgba(255,255,255,0)")
        sheen.addColorStop(1, "rgba(120,200,255,0.18)")
        bg.fillStyle = sheen
        bg.fillRect(0, 0, 512, 512)
        bg.fillStyle = "rgba(255,255,255,0.85)"
        bg.beginPath()
        bg.ellipse(gx + w * 0.5, gy + h * 0.26, w * 0.07, h * 0.045, -0.2, 0, Math.PI * 2)
        bg.fill()
        bg.beginPath()
        bg.arc(gx + w * 0.6, gy + h * 0.22, w * 0.018, 0, Math.PI * 2)
        bg.fill()
        g.drawImage(body, 0, 0)

        // Glas über dem ganzen Bild: kräftiger Glanz oben mit scharfer, gewölbter Unterkante
        const gloss = g.createLinearGradient(0, 0, 0, 230)
        gloss.addColorStop(0, "rgba(255,255,255,0.7)")
        gloss.addColorStop(0.6, "rgba(255,255,255,0.22)")
        gloss.addColorStop(1, "rgba(255,255,255,0.1)")
        g.fillStyle = gloss
        g.beginPath()
        g.moveTo(0, 0)
        g.lineTo(512, 0)
        g.lineTo(512, 160)
        g.quadraticCurveTo(256, 250, 0, 160)
        g.closePath()
        g.fill()
        g.strokeStyle = "rgba(255,255,255,0.55)"
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(0, 160)
        g.quadraticCurveTo(256, 250, 512, 160)
        g.stroke()

        // zwei schräge Lichtstreifen, breit und schmal
        g.save()
        g.globalCompositeOperation = "screen"
        for (const [mid, width, alpha] of [[0.5, 0.07, 0.3], [0.62, 0.025, 0.4]]) {
            const streak = g.createLinearGradient(60, 512, 360, 0)
            streak.addColorStop(mid - width, "rgba(255,255,255,0)")
            streak.addColorStop(mid, `rgba(255,255,255,${alpha})`)
            streak.addColorStop(mid + width, "rgba(255,255,255,0)")
            g.fillStyle = streak
            g.fillRect(0, 0, 512, 512)
        }
        g.restore()

        // Licht, das von unten durch das Glas fällt
        const low = g.createRadialGradient(256, 600, 20, 256, 600, 340)
        low.addColorStop(0, "rgba(140,230,255,0.55)")
        low.addColorStop(1, "rgba(140,230,255,0)")
        g.fillStyle = low
        g.fillRect(0, 0, 512, 512)

        // geschliffene Kante: oben/links hell, unten/rechts dunkel, innen eine feine Lichtlinie
        const bevel = g.createLinearGradient(0, 0, 512, 512)
        bevel.addColorStop(0, "rgba(255,255,255,0.9)")
        bevel.addColorStop(0.5, "rgba(255,255,255,0.35)")
        bevel.addColorStop(1, "rgba(10,30,90,0.6)")
        g.strokeStyle = bevel
        g.globalAlpha = 0.6
        g.lineWidth = 8
        g.strokeRect(4, 4, 504, 504)
        g.globalAlpha = 1
        const rim = g.createRadialGradient(256, 256, 190, 256, 256, 380)
        rim.addColorStop(0, "rgba(255,255,255,0)")
        rim.addColorStop(1, "rgba(200,235,255,0.28)")
        g.fillStyle = rim
        g.fillRect(0, 0, 512, 512)
        return c
    }

    const out = {}
    for (const size of [512, 192]) {
        out[size] = drawIcon(size).toDataURL("image/png")
        if (download) {
            const a = document.createElement("a")
            a.href = out[size]
            a.download = `icon-${size}.png`
            a.click()
        }
    }
    return out
}

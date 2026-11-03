// ============================================================
//  Erzeugt "Himmelsgarten" (Map-Himmel.png)
//  aus der Original-Arena (Arena2.png) durch Umfärben von Himmel / Boden / Steinen / Pflanzen.
//  Läuft im Browser (Python ist nicht nötig):
//    1. Spiel lokal starten, http://localhost:8080/duelist/ öffnen
//    2. F12 → Konsole → Inhalt dieser Datei einfügen
//    3. await makeMaps() lädt die Bilder als Download herunter → nach public/assets/ui/ kopieren
// ============================================================

async function makeMaps({ download = true } = {}) {
    const src = await new Promise((ok, fail) => {
        const img = new Image()
        img.onload = () => ok(img)
        img.onerror = fail
        img.src = "../assets/ui/Arena2.png"
    })
    const W = src.width
    const H = src.height
    const c = document.createElement("canvas")
    c.width = W
    c.height = H
    const g = c.getContext("2d")
    g.drawImage(src, 0, 0)
    const px = g.getImageData(0, 0, W, H).data

    // fester Zufall, damit jedes Mal dasselbe Bild entsteht
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

    const at = (x, y) => {
        const i = (y * W + x) * 4
        return [px[i], px[i + 1], px[i + 2]]
    }
    const hsv = ([r, gg, b]) => {
        r /= 255; gg /= 255; b /= 255
        const max = Math.max(r, gg, b)
        const min = Math.min(r, gg, b)
        const d = max - min
        let h = 0
        if (d) h = max === r ? ((gg - b) / d + 6) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4
        return [h / 6, max ? d / max : 0, max]
    }
    const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

    // Himmel per Flood-Fill vom Rand aus (helle Steine zählen so nicht als Wolke)
    const isSky = col => {
        const [h, s, v] = hsv(col)
        return (h > 0.52 && h < 0.7 && s > 0.25) || (s < 0.22 && v > 0.78 && col[2] >= col[0])
    }
    const sky = new Uint8Array(W * H)
    const stack = []
    for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1)
    for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y)
    while (stack.length) {
        const y = stack.pop()
        const x = stack.pop()
        const i = y * W + x
        if (sky[i] || !isSky(at(x, y))) continue
        sky[i] = 1
        if (x + 1 < W) stack.push(x + 1, y)
        if (x > 0) stack.push(x - 1, y)
        if (y + 1 < H) stack.push(x, y + 1)
        if (y > 0) stack.push(x, y - 1)
    }

    const classify = (x, y, col) => {
        if (sky[y * W + x]) return "sky"
        const [h, s, v] = hsv(col)
        if (h > 0.17 && h < 0.45 && s > 0.3) return "plant"
        // Pokal und Banner oben in der Mitte bleiben original
        if (x > 680 && x < 860 && y > 130 && y < 290) {
            const gold = h > 0.1 && h < 0.18 && s > 0.45 && v > 0.55
            const banner = (h < 0.04 || h > 0.9) && s > 0.35 && x > 700 && x < 840 && y < 275
            if (gold || banner) return "keep"
        }
        if (h > 0.03 && h < 0.13 && s > 0.38 && y > 250 && y < 840 && x > 110 && x < 1430) return "floor"
        return "stone"
    }

    // weiches Rauschen: Zufallsgitter, bilinear geglättet (0..1)
    const noise = scale => {
        const gw = Math.ceil(W / scale) + 2
        const gh = Math.ceil(H / scale) + 2
        const grid = Float32Array.from({ length: gw * gh }, rnd)
        const smooth = t => t * t * (3 - 2 * t)
        return (x, y) => {
            const fx = x / scale
            const fy = y / scale
            const x0 = Math.floor(fx)
            const y0 = Math.floor(fy)
            const tx = smooth(fx - x0)
            const ty = smooth(fy - y0)
            const a = grid[y0 * gw + x0]
            const b = grid[y0 * gw + x0 + 1]
            const c2 = grid[(y0 + 1) * gw + x0]
            const d = grid[(y0 + 1) * gw + x0 + 1]
            return (a + (b - a) * tx) * (1 - ty) + (c2 + (d - c2) * tx) * ty
        }
    }

    const CENTER = [768, 560]

    // ---------------- Himmelsgarten: Wiese, Steinkreis in der Mitte, heller Fels ----------------
    // ---------------- Himmelsgarten: gedämpftes Moos, verwitterter Steinkreis, grauer Fels ----------------
    function garden(kind, col, x, y, n, fine) {
        const [, , v] = hsv(col)
        if (kind === "sky") return col
        if (kind === "floor") {
            const d = Math.hypot(x - CENTER[0], (y - CENTER[1]) * 1.3)
            if (d < 178) {
                // Steinkreis aus Ringen und Speichen, alt und etwas bemoost
                if (d >= 170) return lerp([104, 110, 122], [132, 138, 150], v)
                const ring = Math.floor(d / 42)
                const a = Math.atan2((y - CENTER[1]) * 1.3, x - CENTER[0])
                const seg = Math.floor((a + Math.PI) / (Math.PI * 2) * (6 + ring * 6))
                const tone = 0.9 + ((seg * 7 + ring * 3) % 5) * 0.03
                const k = (0.82 + v * 0.16 + (n - 0.5) * 0.12) * tone
                let base = [214 * k, 212 * k, 202 * k]
                const joint = d % 42 < 2.5 || Math.abs(Math.sin((a + Math.PI) / 2 * (6 + ring * 6))) < 0.025 * (60 / Math.max(d, 30))
                if (joint) base = fine > 0.6 ? [110, 140, 90] : [146, 148, 150]
                else if (fine > 0.9) base = lerp(base, [170, 172, 166], 0.5)
                if (d < 22) base = d > 18 ? [130, 134, 142] : [196, 196, 190]
                return base
            }
            // Wiese: gedämpftes Moosgrün, ausgetretene Stellen, dunklere Büschel
            let base = lerp([96, 140, 78], [146, 182, 104], Math.min(1, v * 0.5 + n * 0.5))
            if (n < 0.3) base = lerp(base, [168, 172, 128], (0.3 - n) * 1.8)
            if (fine > 0.8) base = lerp(base, [74, 112, 64], (fine - 0.8) * 3)
            else if (fine < 0.035) base = (x + y) % 2 ? [236, 238, 222] : [226, 214, 150]
            return base
        }
        if (kind === "stone") return [136 * v + 74, 138 * v + 78, 144 * v + 86]
        if (kind === "plant") return lerp([46, 86, 52], [120, 160, 92], v)
        return col
    }

    const n1 = noise(24)
    const n2 = noise(5)
    const make = (name, recolor) => {
        const out = g.createImageData(W, H)
        const o = out.data
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const col = at(x, y)
                const res = recolor(classify(x, y, col), col, x, y, n1(x, y), n2(x, y))
                const i = (y * W + x) * 4
                o[i] = Math.max(0, Math.min(255, res[0]))
                o[i + 1] = Math.max(0, Math.min(255, res[1]))
                o[i + 2] = Math.max(0, Math.min(255, res[2]))
                o[i + 3] = 255
            }
        }
        const oc = document.createElement("canvas")
        oc.width = W
        oc.height = H
        oc.getContext("2d").putImageData(out, 0, 0)
        const url = oc.toDataURL("image/png")
        if (download) {
            const a = document.createElement("a")
            a.href = url
            a.download = name
            a.click()
        }
        return url
    }
    return { "Map-Himmel.png": make("Map-Himmel.png", garden) }
}

// ============================================================
//  Handy-Steuerung anpassen: Knöpfe frei verschieben und
//  einzeln vergrößern/verkleinern, Joystick-Größe einstellen.
//  Gespeichert wird pro Gerät: Mitte des Knopfs in % des Bildschirms + Größe.
// ============================================================

const TouchLayout = {
    key: "duelist.touchLayout",
    names: { light: "Leicht", heavy: "Schwer", dash: "Dash", block: "Block", ability: "Fähigkeit", stick: "Joystick" },
    data: null,
    base: {},          // Grundgröße jedes Knopfs (aus dem CSS)
    editing: false,
    selected: null,

    root() {
        return document.getElementById("touch")
    },

    buttons() {
        return Array.from(this.root().querySelectorAll(".t-btn[data-act]"))
    },

    load() {
        this.data = readStorage(this.key, {})
        return this.data
    },

    save() {
        writeStorage(this.key, this.data)
    },

    // Grundgröße und Standard-Lage jedes Knopfs messen (ohne eigene Werte, so wie im CSS)
    measure() {
        const root = this.root()
        const btns = this.buttons()
        if (btns.every(b => this.base[b.dataset.act])) return
        const wasHidden = root.hidden
        const custom = root.classList.contains("custom")
        const styles = btns.map(b => b.getAttribute("style"))
        root.hidden = false
        root.classList.remove("custom")
        btns.forEach(b => b.removeAttribute("style"))
        for (const btn of btns) {
            const r = btn.getBoundingClientRect()
            if (r.width) this.base[btn.dataset.act] = { w: r.width, x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }
        }
        btns.forEach((b, i) => { if (styles[i] !== null) b.setAttribute("style", styles[i]) })
        root.classList.toggle("custom", custom)
        root.hidden = wasHidden
    },

    // Gespeicherte Positionen und Größen anwenden
    apply() {
        if (!this.data) this.load()
        this.measure()
        const root = this.root()
        const custom = this.buttons().some(b => this.data[b.dataset.act])
        root.classList.toggle("custom", custom)
        for (const btn of this.buttons()) {
            const act = btn.dataset.act
            const base = this.base[act]
            const own = this.data[act]
            if (!custom || !base) {
                btn.removeAttribute("style")
                continue
            }
            const pos = own || base
            const size = base.w * (own ? own.s : 1)
            btn.style.left = (pos.x * 100) + "%"
            btn.style.top = (pos.y * 100) + "%"
            btn.style.right = "auto"
            btn.style.bottom = "auto"
            btn.style.width = btn.style.height = size + "px"
            btn.style.marginLeft = btn.style.marginTop = (-size / 2) + "px"
            btn.style.fontSize = Math.round(17 * size / base.w) + "px"
        }
        // Joystick: Größe der Scheibe und Ausschlag
        const s = (this.data.stick && this.data.stick.s) || 1
        root.style.setProperty("--stick", s)
        if (App.touch) App.touch.radius = 56 * s
    },

    // ---------------- Editor ----------------
    open() {
        this.load()
        this.measure()
        this.editing = true
        this.selected = null
        const root = this.root()
        root.hidden = false
        root.classList.add("editing")
        document.body.classList.add("touch-editing")
        // ungespeicherte Knöpfe bekommen ihre aktuelle Lage, damit alle frei beweglich sind
        for (const btn of this.buttons()) {
            const act = btn.dataset.act
            if (!this.data[act] && this.base[act]) this.data[act] = { x: this.base[act].x, y: this.base[act].y, s: 1 }
        }
        this.apply()
        this.bar().hidden = false
        this.select("stick")
    },

    close(save = true) {
        if (save) this.save()
        else this.load()
        this.editing = false
        const root = this.root()
        root.classList.remove("editing")
        document.body.classList.remove("touch-editing")
        root.hidden = App.state !== "game" || !isTouchDevice()
        this.bar().hidden = true
        for (const b of this.buttons()) b.classList.remove("selected")
        this.apply()
    },

    reset() {
        this.data = {}
        for (const b of this.buttons()) b.removeAttribute("style")
        this.root().classList.remove("custom")
        this.base = {}
        this.measure()
        for (const btn of this.buttons()) {
            const act = btn.dataset.act
            if (this.base[act]) this.data[act] = { x: this.base[act].x, y: this.base[act].y, s: 1 }
        }
        this.apply()
        this.select(this.selected || "stick")
    },

    select(act) {
        this.selected = act
        for (const b of this.buttons()) b.classList.toggle("selected", b.dataset.act === act)
        this.root().querySelector(".stick-demo").classList.toggle("selected", act === "stick")
        const item = this.data[act] || { s: 1 }
        document.getElementById("tlName").textContent = this.names[act]
        this.showSize(item.s || 1)
    },

    showSize(s) {
        const slider = document.getElementById("tlSize")
        slider.value = s
        slider.style.setProperty("--val", ((s - 0.6) / 1.2 * 100).toFixed(1) + "%")
    },

    setSize(s) {
        const act = this.selected
        if (!act) return
        this.data[act] = { ...(this.data[act] || {}), s }
        this.apply()
    },

    bar() {
        return document.getElementById("touchEdit")
    },

    init() {
        this.load()
        const root = this.root()
        // Vorschau-Scheibe des Joysticks (nur im Editor sichtbar)
        const demo = document.createElement("button")
        demo.className = "stick-demo"
        demo.type = "button"
        demo.textContent = "Joystick"
        root.appendChild(demo)
        demo.addEventListener("pointerdown", e => {
            if (!this.editing) return
            e.preventDefault()
            this.select("stick")
        })

        // Im Editor fangen wir die Finger ab, bevor die Spielsteuerung sie bekommt
        root.addEventListener("pointerdown", e => {
            if (!this.editing) return
            const btn = e.target.closest(".t-btn[data-act]")
            if (!btn) return
            e.stopPropagation()
            e.preventDefault()
            const act = btn.dataset.act
            this.select(act)
            const startX = e.clientX
            const startY = e.clientY
            const from = { ...this.data[act] }
            btn.setPointerCapture(e.pointerId)
            const move = ev => {
                const x = Math.min(0.97, Math.max(0.03, from.x + (ev.clientX - startX) / innerWidth))
                const y = Math.min(0.97, Math.max(0.05, from.y + (ev.clientY - startY) / innerHeight))
                this.data[act] = { ...this.data[act], x, y }
                this.apply()
            }
            const up = () => {
                btn.removeEventListener("pointermove", move)
                btn.removeEventListener("pointerup", up)
                btn.removeEventListener("pointercancel", up)
            }
            btn.addEventListener("pointermove", move)
            btn.addEventListener("pointerup", up)
            btn.addEventListener("pointercancel", up)
        }, true)

        document.getElementById("tlSize").addEventListener("input", e => {
            this.setSize(+e.target.value)
            this.showSize(+e.target.value)
        })
        document.getElementById("tlReset").addEventListener("click", () => this.reset())
        document.getElementById("tlDone").addEventListener("click", () => this.close(true))
        document.getElementById("touchLayoutBtn").addEventListener("click", () => this.open())
        window.addEventListener("resize", () => {
            this.base = {}
            if (!this.editing) setTimeout(() => this.apply(), 250)
        })
        setTimeout(() => this.apply(), 0)
    }
}

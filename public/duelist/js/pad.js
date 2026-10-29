// ============================================================
//  Controller-Modus – dieses Gerät wird zum Gamepad für einen
//  anderen Bildschirm (Code eingeben oder QR-Code scannen)
// ============================================================

const PadMode = {
    peer: null,
    conn: null,
    code: "",
    state: { x: 0, y: 0, b: 0, c: [0, 0, 0, 0, 0] },
    lastSent: "",
    bound: false,
    active: false,

    // Ansicht öffnen (optional direkt mit Code verbinden)
    open(code = "") {
        this.bind()
        Link.stop()
        this.active = true
        document.body.classList.add("pad-mode")
        App.setState("pad")
        UI.show("pad")
        const input = document.getElementById("padCode")
        input.value = code.toUpperCase()
        this.setConnected(false)
        if (code.length === 4) this.join(code)
        else setTimeout(() => input.focus(), 100)
    },

    close() {
        this.active = false
        if (this.conn) this.conn.close()
        if (this.peer) this.peer.destroy()
        this.conn = null
        this.peer = null
        document.body.classList.remove("pad-mode", "pad-connected")
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
        if (location.search.includes("pad=")) history.replaceState(null, "", location.pathname)
    },

    status(text) {
        document.getElementById("padStatus").textContent = text
    },

    setConnected(on) {
        document.body.classList.toggle("pad-connected", on)
    },

    async join(code) {
        code = (code || "").trim().toUpperCase()
        if (code.length !== 4) return this.status("Der Code hat 4 Zeichen.")
        this.code = code
        this.status("Verbinde …")
        try {
            await loadScript(PEER_LIB)
        } catch (e) {
            return this.status("Keine Internetverbindung – für die Kopplung wird kurz Internet benötigt.")
        }
        if (this.conn) this.conn.close()
        if (!this.peer || this.peer.destroyed) this.peer = new Peer()
        const go = () => {
            const conn = this.peer.connect(PEER_PREFIX + code.toLowerCase(), { reliable: true })
            this.conn = conn
            conn.on("open", () => {
                this.setConnected(true)
                this.keepAwake()
                Sound.play("coin")
                if (GameSettings.get().fullscreen) this.fullscreen(true)
            })
            conn.on("data", msg => this.onMessage(msg))
            conn.on("close", () => {
                if (this.conn !== conn) return
                this.setConnected(false)
                this.status("Verbindung getrennt – Code erneut eingeben.")
            })
            setTimeout(() => {
                if (this.conn === conn && !conn.open) this.status("Bildschirm nicht gefunden. Stimmt der Code? Ist dort „Handy als Controller“ geöffnet?")
            }, 7000)
        }
        if (this.peer.open) go()
        else this.peer.once("open", go)
        this.peer.on("error", e => this.status("Fehler: " + e.type))
    },

    onMessage(msg) {
        if (msg.t === "hi") {
            document.getElementById("padView").dataset.slot = msg.slot
            document.getElementById("padSlot").textContent = "Spieler " + (msg.slot + 1)
            this.vibrate(60)
        } else if (msg.t === "full") {
            this.status("Es sind schon zwei Handys verbunden.")
        } else if (msg.t === "vib") {
            this.vibrate(msg.ms)
        } else if (msg.t === "st") {
            document.getElementById("padChamp").textContent = msg.game ? `${msg.name} · ${msg.ability}` : "Menü – Stick + Leicht zum Auswählen"
            document.getElementById("padHp").style.transform = `scaleX(${msg.game ? msg.hp : 1})`
            const ab = document.querySelector("#padView .pb-ability")
            ab.classList.toggle("ready", !!msg.ready)
            ab.querySelector("circle").style.strokeDashoffset = String(289 * (1 - (msg.energy || 0)))
        }
    },

    vibrate(ms) {
        if (navigator.vibrate && GameSettings.get().vibration) navigator.vibrate(ms)
    },

    async keepAwake() {
        try { if (navigator.wakeLock) await navigator.wakeLock.request("screen") } catch (e) { }
    },

    fullscreen(force) {
        const el = document.documentElement
        if (!document.fullscreenElement && el.requestFullscreen) {
            el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => { })).catch(() => { })
        } else if (!force && document.exitFullscreen) document.exitFullscreen().catch(() => { })
    },

    send(force) {
        if (!this.conn || !this.conn.open) return
        const s = this.state
        const msg = { t: "i", x: +s.x.toFixed(2), y: +s.y.toFixed(2), b: s.b, c: s.c }
        const key = JSON.stringify(msg)
        if (!force && key === this.lastSent) return
        this.lastSent = key
        this.conn.send(msg)
    },

    // Bedienelemente einmalig verdrahten
    bind() {
        if (this.bound) return
        this.bound = true
        const $id = id => document.getElementById(id)
        $id("padJoin").onclick = () => this.join($id("padCode").value)
        $id("padCode").addEventListener("keydown", e => { if (e.key === "Enter") this.join($id("padCode").value) })
        $id("padCode").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
        $id("padLeave").onclick = () => {
            this.close()
            // Wurde die App direkt als Controller geöffnet, fehlen die Grafiken – dann normal neu laden
            if (!App.demo) location.href = location.pathname
            else App.quitToMenu()
        }
        $id("padFs").onclick = () => this.fullscreen(false)
        setInterval(() => this.send(true), 80)
        document.addEventListener("visibilitychange", () => { if (!document.hidden && this.conn && this.conn.open) this.keepAwake() })

        // Joystick
        const stick = $id("padStick")
        const knob = $id("padKnob")
        let id = null
        const move = e => {
            const r = stick.getBoundingClientRect()
            const R = r.width / 2
            const dx = e.clientX - (r.left + R)
            const dy = e.clientY - (r.top + R)
            const l = Math.hypot(dx, dy)
            const c = Math.min(l, R * 0.75)
            const nx = l ? dx / l : 0
            const ny = l ? dy / l : 0
            knob.style.transform = `translate(calc(-50% + ${nx * c}px), calc(-50% + ${ny * c}px))`
            const s = c / (R * 0.75)
            this.state.x = s < 0.15 ? 0 : nx * Math.min(1, s * 1.2)
            this.state.y = s < 0.15 ? 0 : ny * Math.min(1, s * 1.2)
            this.send()
        }
        stick.addEventListener("pointerdown", e => {
            id = e.pointerId
            stick.setPointerCapture(id)
            move(e)
        })
        stick.addEventListener("pointermove", e => { if (e.pointerId === id) move(e) })
        const release = e => {
            if (e.pointerId !== id) return
            id = null
            this.state.x = this.state.y = 0
            knob.style.transform = "translate(-50%, -50%)"
            this.send()
        }
        stick.addEventListener("pointerup", release)
        stick.addEventListener("pointercancel", release)

        // Knöpfe
        for (const btn of document.querySelectorAll("#padView [data-btn]")) {
            const i = +btn.dataset.btn
            btn.addEventListener("pointerdown", e => {
                e.preventDefault()
                this.state.b |= 1 << i
                this.state.c[i]++
                btn.classList.add("on")
                this.vibrate(10)
                this.send(true)
            })
            const up = () => {
                this.state.b &= ~(1 << i)
                btn.classList.remove("on")
                this.send()
            }
            btn.addEventListener("pointerup", up)
            btn.addEventListener("pointercancel", up)
            btn.addEventListener("pointerleave", up)
        }
    }
}

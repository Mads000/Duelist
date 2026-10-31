// ============================================================
//  Handy als Controller – der PC ist "Host", Handys verbinden
//  sich per QR-Code (WebRTC über PeerJS, direkt im WLAN)
// ============================================================

const PEER_LIB = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"
const QR_LIB = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"
const PEER_PREFIX = "duelist2-"
const PAD_BUTTONS = ["light", "heavy", "dash", "ability", "pause"]

// Lädt ein Skript nur einmal – auch wenn es mehrfach gleichzeitig angefragt wird
const scriptPromises = {}
function loadScript(src) {
    if (!scriptPromises[src]) {
        scriptPromises[src] = new Promise((resolve, reject) => {
            const s = document.createElement("script")
            s.src = src
            s.onload = resolve
            s.onerror = () => {
                delete scriptPromises[src]
                s.remove()
                reject(new Error("Konnte " + src + " nicht laden"))
            }
            document.head.appendChild(s)
        })
    }
    return scriptPromises[src]
}

function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

const Link = {
    peer: null,
    code: null,
    status: "off",       // off | loading | ready | error
    error: "",
    pads: [],            // { conn, slot, state, nav }
    onChange: () => {},

    async start() {
        if (this.peer && !this.peer.destroyed) return
        this.status = "loading"
        this.onChange()
        try {
            await loadScript(PEER_LIB)
            await loadScript(QR_LIB)
        } catch (e) {
            this.status = "error"
            this.error = "Keine Internetverbindung – für die Verbindung zum Handy wird kurz Internet benötigt."
            this.onChange()
            return
        }
        this.open()
    },

    open() {
        this.code = makeCode()
        const peer = new Peer(PEER_PREFIX + this.code.toLowerCase())
        this.peer = peer
        peer.on("open", () => {
            this.status = "ready"
            this.onChange()
        })
        peer.on("connection", conn => this.accept(conn))
        peer.on("error", err => {
            if (err.type === "unavailable-id") {
                peer.destroy()
                this.open()
                return
            }
            if (this.status !== "ready") {
                this.status = "error"
                this.error = "Verbindungsdienst nicht erreichbar (" + err.type + ")."
            }
            this.onChange()
        })
        peer.on("disconnected", () => {
            if (!peer.destroyed) peer.reconnect()
        })
    },

    // Dieses Gerät ist doch kein Bildschirm (z.B. weil es selbst Controller wird)
    stop() {
        if (this.peer) this.peer.destroy()
        this.peer = null
        this.pads = []
        this.code = null
        this.status = "off"
        this.onChange()
    },

    accept(conn) {
        conn.on("open", () => {
            const taken = this.pads.map(p => p.slot)
            const slot = [0, 1].find(s => !taken.includes(s))
            if (slot === undefined) {
                conn.send({ t: "full" })
                setTimeout(() => conn.close(), 300)
                return
            }
            const pad = { conn, slot, state: { x: 0, y: 0, b: 0, c: [0, 0, 0, 0, 0, 0] }, nav: { dir: null, c: [0, 0, 0, 0, 0, 0] } }
            this.pads.push(pad)
            this.send(pad, { t: "hi", slot })
            Sound.play("coin")
            UI.toast(`📱 Handy verbunden als Spieler ${slot + 1}`)
            this.onChange()
        })
        conn.on("data", msg => {
            const pad = this.pads.find(p => p.conn === conn)
            if (pad && msg && msg.t === "i") pad.state = msg
        })
        const drop = () => {
            const pad = this.pads.find(p => p.conn === conn)
            if (!pad) return
            this.pads = this.pads.filter(p => p !== pad)
            UI.toast(`📱 Handy von Spieler ${pad.slot + 1} getrennt`)
            this.onChange()
        }
        conn.on("close", drop)
        conn.on("error", drop)
    },

    send(pad, msg) {
        try {
            if (pad.conn.open) pad.conn.send(msg)
        } catch (e) { /* Verbindung weg */ }
    },

    padFor(slot) {
        return this.pads.find(p => p.slot === slot)
    },

    swapSlots() {
        for (const p of this.pads) {
            p.slot = 1 - p.slot
            this.send(p, { t: "hi", slot: p.slot })
        }
        this.onChange()
    },

    // Adresse, die das Handy öffnet (lokal gehostete PCs verweisen auf GitHub Pages)
    padUrl() {
        const local = !location.protocol.startsWith("http") || ["localhost", "127.0.0.1"].includes(location.hostname)
        const base = local ? ONLINE_URL : new URL("./", location.href).href
        return base + "?pad=" + this.code
    },

    qrSvg() {
        if (!window.qrcode || !this.code) return ""
        const qr = qrcode(0, "M")
        qr.addData(this.padUrl())
        qr.make()
        return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
    },

    // Zustand an die Handys schicken (Champion, Energie, Vibration)
    syncMatch(match) {
        if (!this.pads.length || !match) return
        const now = performance.now()
        if (now - (this.lastSync || 0) < 150) return
        this.lastSync = now
        for (const pad of this.pads) {
            const f = match.fighters[pad.slot]
            if (!f) continue
            this.send(pad, {
                t: "st", name: f.champ.name, color: f.champ.color, hp: f.hp / f.maxHp,
                energy: Math.min(1, f.energy / f.champ.ability.cost), ready: f.abilityReady,
                ability: f.champ.ability.name, game: true
            })
        }
    },

    menuState() {
        for (const pad of this.pads) this.send(pad, { t: "st", game: false })
    },

    vibrate(side, ms) {
        const pad = side === null ? null : this.padFor(side)
        if (pad) this.send(pad, { t: "vib", ms })
    },

    // Menüsteuerung mit dem Handy: Stick = Fokus bewegen, Leicht = OK, Ausweichen = Zurück
    pollNav(onBack) {
        for (const pad of this.pads) {
            const st = pad.state
            const dir = Math.abs(st.x) > 0.6 ? (st.x > 0 ? "right" : "left") : Math.abs(st.y) > 0.6 ? (st.y > 0 ? "down" : "up") : null
            if (dir && dir !== pad.nav.dir) Nav.move(dir)
            pad.nav.dir = dir
            const c = st.c || []
            if (c[0] !== pad.nav.c[0]) Nav.confirm()
            if (c[2] !== pad.nav.c[2] && onBack) onBack()
            pad.nav.c = [...c]
        }
    }
}

// Eingabequelle für einen Spieler-Slot
class PhoneSource {
    constructor(slot) {
        this.slot = slot
        this.seen = null
    }

    read(out) {
        const pad = Link.padFor(this.slot)
        if (!pad) return
        const st = pad.state
        if (Math.hypot(st.x, st.y) > 0.15) {
            out.mx = st.x
            out.my = st.y
        }
        const c = st.c || []
        if (!this.seen) this.seen = [...c]
        PAD_BUTTONS.forEach((name, i) => {
            if (c[i] !== this.seen[i]) out[name] = true
        })
        this.seen = [...c]
        if (st.b & 1) out.lightHeld = true
        if (st.b & 32) out.block = true
        pad.nav.c = [...c] // im Kampf nicht doppelt als Menü-Eingabe werten
    }

    destroy() {}
}

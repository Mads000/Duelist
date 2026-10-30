// ============================================================
//  Online-Duell – zwei Geräte, verbunden per 4-stelligem Code
//  (WebRTC über PeerJS). Der Host rechnet verbindlich, beide
//  schicken ihre Eingaben, der Host korrigiert regelmäßig den
//  Spielstand (Positionen, Leben, Energie, Zeit) beim Gast.
// ============================================================

const NET_PREFIX = "duelist2-duel-"

const Net = {
    peer: null,
    conn: null,
    role: null,          // "host" | "guest"
    code: "",
    status: "off",       // off | waiting | connecting | connected | error
    error: "",
    myPick: null,
    theirPick: null,
    map: "sky",
    remote: { x: 0, y: 0, b: 0, c: [0, 0, 0, 0, 0] },
    onChange: () => {},

    async ensureLib() {
        try {
            await loadScript(PEER_LIB)
            return true
        } catch (e) {
            this.fail("Keine Internetverbindung – für das Online-Duell wird Internet benötigt.")
            return false
        }
    },

    fail(text) {
        this.status = "error"
        this.error = text
        this.onChange()
    },

    async host() {
        this.close(false)
        if (!(await this.ensureLib())) return
        this.role = "host"
        this.code = makeCode()
        this.status = "waiting"
        this.onChange()
        const peer = new Peer(NET_PREFIX + this.code.toLowerCase())
        this.peer = peer
        peer.on("connection", conn => {
            if (this.conn && this.conn.open) {
                conn.on("open", () => conn.close())
                return
            }
            this.bind(conn)
        })
        peer.on("error", err => {
            if (err.type === "unavailable-id") return this.host()
            if (this.status !== "connected") this.fail("Verbindungsdienst nicht erreichbar (" + err.type + ").")
        })
    },

    async join(code) {
        code = (code || "").trim().toUpperCase()
        if (code.length !== 4) return this.fail("Der Code hat 4 Zeichen.")
        this.close(false)
        if (!(await this.ensureLib())) return
        this.role = "guest"
        this.code = code
        this.status = "connecting"
        this.onChange()
        const peer = new Peer()
        this.peer = peer
        peer.on("open", () => this.bind(peer.connect(NET_PREFIX + code.toLowerCase(), { reliable: true })))
        peer.on("error", err => this.fail(err.type === "peer-unavailable" ? "Kein Raum mit diesem Code gefunden." : "Fehler: " + err.type))
        setTimeout(() => {
            if (this.peer === peer && this.status === "connecting") this.fail("Keine Antwort. Stimmt der Code?")
        }, 9000)
    },

    bind(conn) {
        this.conn = conn
        conn.on("open", () => {
            this.status = "connected"
            this.myPick = null
            this.theirPick = null
            Sound.play("coin")
            this.onChange()
            UI.toast("🌐 Verbunden! Wählt eure Champions.")
            App.setState("select")
            UI.openSelect("online")
        })
        conn.on("data", msg => this.onMessage(msg))
        const drop = () => {
            if (this.conn !== conn) return
            const wasIngame = App.match && App.match.netRole
            this.close(false)
            UI.toast("🌐 Verbindung zum Gegner getrennt")
            if (wasIngame || UI.current === "select") App.quitToMenu()
        }
        conn.on("close", drop)
        conn.on("error", drop)
    },

    send(msg) {
        try {
            if (this.conn && this.conn.open) this.conn.send(msg)
        } catch (e) { /* Verbindung weg */ }
    },

    close(notify = true) {
        if (notify) this.send({ t: "bye" })
        if (this.conn) this.conn.close()
        if (this.peer) this.peer.destroy()
        this.conn = null
        this.peer = null
        this.status = "off"
        this.role = null
        this.onChange()
    },

    get connected() {
        return this.status === "connected"
    },

    // ---------------- Auswahl ----------------
    pick(champ, map) {
        this.myPick = champ
        if (this.role === "host") this.map = map
        this.send({ t: "pick", champ })
        this.tryStart()
    },

    tryStart() {
        if (this.role !== "host" || !this.myPick || !this.theirPick) {
            if (this.myPick) UI.toast("Warte auf den Gegner …")
            return
        }
        const s = GameSettings.get()
        const map = this.map && this.map !== "random" ? this.map : MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)]
        const start = { t: "start", champs: [this.myPick, this.theirPick], map, rounds: s.rounds, roundTime: s.roundTime }
        this.send(start)
        this.startMatch(start)
    },

    startMatch(msg) {
        this.remote = { x: 0, y: 0, b: 0, c: [0, 0, 0, 0, 0] }
        App.startMatch({
            rules: { mode: "online", map: msg.map, rounds: msg.rounds, roundTime: msg.roundTime, vs: true, noHazards: true },
            champs: msg.champs,
            net: this.role
        })
    },

    // ---------------- Nachrichten ----------------
    onMessage(msg) {
        if (!msg || !msg.t) return
        const m = App.match && App.match.netRole ? App.match : null
        switch (msg.t) {
            case "pick":
                this.theirPick = msg.champ
                if (this.role === "host") this.tryStart()
                else UI.toast("Gegner hat gewählt")
                break
            case "start":
                if (this.role === "guest") this.startMatch(msg)
                break
            case "i":
                this.remote = msg
                break
            case "snap":
                if (m && this.role === "guest") m.applySnapshot(msg)
                break
            case "ko":
                if (m && this.role === "guest") m.netKnockout(msg)
                break
            case "timeup":
                if (m && this.role === "guest") m.netTimeUp()
                break
            case "again":
                UI.toast("🌐 Gegner will eine Revanche – wählt eure Champions")
                this.myPick = null
                this.theirPick = null
                App.setState("select")
                UI.openSelect("online")
                break
            case "bye":
                UI.toast("🌐 Der Gegner hat das Spiel verlassen")
                this.close(false)
                if (App.match || UI.current === "select") App.quitToMenu()
                break
        }
    },

    rematch() {
        this.myPick = null
        this.theirPick = null
        this.send({ t: "again" })
        App.setState("select")
        UI.openSelect("online")
    },

    // Host: Spielstand an den Gast (≈15× pro Sekunde)
    syncMatch(match) {
        if (this.role !== "host" || !this.connected) return
        const now = performance.now()
        if (now - (this.lastSnap || 0) < 66) return
        this.lastSnap = now
        this.send({
            t: "snap",
            f: match.fighters.map(f => [Math.round(f.x), Math.round(f.y), +f.hp.toFixed(1), f.energy, Math.round(f.guard), +f.specialCd.toFixed(2)]),
            timer: +match.timer.toFixed(2),
            wins: match.wins,
            round: match.round
        })
    }
}

// Eingaben des Gegners (über das Netz) als Eingabequelle
class RemoteSource {
    constructor() {
        this.seen = null
    }

    read(out) {
        const st = Net.remote
        if (Math.hypot(st.x, st.y) > 0.15) {
            out.mx = st.x
            out.my = st.y
        }
        const c = st.c || []
        if (!this.seen) this.seen = [...c]
        PAD_BUTTONS.forEach((name, i) => {
            if (name !== "pause" && c[i] !== this.seen[i]) out[name] = true
        })
        this.seen = [...c]
        if (st.b & 1) out.lightHeld = true
    }

    destroy() {}
}

// Liest den lokalen Controller und schickt die Eingaben an den Gegner
class NetTapController {
    constructor(inner) {
        this.inner = inner
        this.state = { t: "i", x: 0, y: 0, b: 0, c: [0, 0, 0, 0, 0] }
        this.lastSend = 0
    }

    attach(...args) {
        if (this.inner.attach) this.inner.attach(...args)
    }

    read() {
        const inp = this.inner.read()
        const s = this.state
        let changed = Math.abs(s.x - inp.mx) > 0.05 || Math.abs(s.y - inp.my) > 0.05
        s.x = +inp.mx.toFixed(2)
        s.y = +inp.my.toFixed(2)
        PAD_BUTTONS.forEach((name, i) => {
            if (inp[name] && name !== "pause") {
                s.c[i]++
                changed = true
            }
        })
        const b = inp.lightHeld ? 1 : 0
        if (b !== s.b) changed = true
        s.b = b
        const now = performance.now()
        if (changed || now - this.lastSend > 100) {
            this.lastSend = now
            Net.send({ ...s, c: [...s.c] })
        }
        return inp
    }

    destroy() {
        if (this.inner.destroy) this.inner.destroy()
    }
}

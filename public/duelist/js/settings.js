// ============================================================
//  Einstellungen, Bilanz & Highscores – lokal im Browser gespeichert
// ============================================================

function readStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key)
        return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback }
    } catch (e) {
        return { ...fallback }
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
        // privater Modus o.ä. – dann eben nur für diese Sitzung
    }
}

const GameSettings = {
    data: readStorage("duelist.settings", DEFAULT_SETTINGS),

    get() {
        return this.data
    },

    set(key, value) {
        this.data[key] = value
        writeStorage("duelist.settings", this.data)
        Sound.setVolumes(this.data)
        document.body.classList.toggle("crt", !!this.data.crt)
    }
}

// Name des aktiven Profils
function playerName() {
    const p = Profiles.current()
    return p ? p.name : ""
}

const emptyRecord = () => ({
    wins: 0, losses: 0, byDifficulty: {}, byChampion: {}, streak: 0, bestStreak: 0,
    unlocked: [], arcadeClears: 0,
    highscores: { arcade: [] }
})

// PIN nur als Schloss gegen Geschwister – ohne Server gibt es keine echte Sicherheit
function pinHash(pin) {
    let h = 0x811c9dc5
    for (const c of "duelist:" + pin) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
    return h.toString(16)
}

// ---------------- Profile: mehrere Spieler auf einem Gerät ----------------
// Jedes Profil hat einen eigenen Spielstand (Gold, Skins, Level, Rang, Highscores)
const Profiles = {
    data: readStorage("duelist.profiles", { list: [], current: null }),

    save() {
        writeStorage("duelist.profiles", this.data)
    },

    key(id) {
        return "duelist.record." + id
    },

    get(id) {
        return this.data.list.find(p => p.id === id)
    },

    current() {
        return this.get(this.data.current)
    },

    init() {
        if (!this.data.list.length) {
            // erster Start mit Profilen: der bisherige Spielstand wird zum ersten Profil
            const p = this.create(String(GameSettings.get().name || "").trim() || "Spieler 1")
            try {
                const old = localStorage.getItem("duelist.record")
                if (old) localStorage.setItem(this.key(p.id), old)
            } catch (e) {}
        }
        if (!this.current()) this.data.current = this.data.list[0].id
        this.save()
    },

    uniqueName(name, exceptId = null) {
        const base = String(name || "").replace(/[<>"&]/g, "").trim().slice(0, 14) || "Spieler"
        const taken = n => this.data.list.some(p => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase())
        let n = base
        for (let i = 2; taken(n); i++) n = `${base.slice(0, 11)} ${i}`
        return n
    },

    // pin: Klartext (neues Profil) oder fertiger Hash (übertragenes Profil)
    create(name, { pin = "", pinIsHash = false, record = null } = {}) {
        const p = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: this.uniqueName(name),
            pin: pin ? (pinIsHash ? pin : pinHash(pin)) : ""
        }
        this.data.list.push(p)
        if (record) writeStorage(this.key(p.id), record)
        if (!this.data.current) this.data.current = p.id
        this.save()
        return p
    },

    switchTo(id) {
        if (!this.get(id)) return
        this.data.current = id
        this.save()
        PlayerRecord.data = readStorage(this.key(id), emptyRecord())
    },

    rename(id, name) {
        const p = this.get(id)
        if (!p || !String(name).trim()) return
        p.name = this.uniqueName(name, id)
        this.save()
    },

    setPin(id, pin) {
        const p = this.get(id)
        if (!p) return
        p.pin = pin ? pinHash(pin) : ""
        this.save()
    },

    checkPin(id, pin) {
        const p = this.get(id)
        return !!p && (!p.pin || p.pin === pinHash(pin))
    },

    remove(id) {
        this.data.list = this.data.list.filter(p => p.id !== id)
        try { localStorage.removeItem(this.key(id)) } catch (e) {}
        if (!this.data.list.length) this.create("Spieler 1")
        if (this.data.current === id || !this.current()) this.switchTo(this.data.list[0].id)
        this.save()
    },

    // Kurzinfo für die Profilkarten, ohne das Profil zu laden
    summary(id) {
        const r = id === this.data.current ? PlayerRecord.data : readStorage(this.key(id), emptyRecord())
        return { level: r.level || 1, gold: r.gold || 0, rp: r.rp || 0, wins: r.wins || 0 }
    }
}
Profiles.init()

const PlayerRecord = {
    data: readStorage(Profiles.key(Profiles.data.current), emptyRecord()),

    save() {
        writeStorage(Profiles.key(Profiles.data.current), this.data)
    },

    addSoloResult(won, difficulty, champId) {
        const d = this.data
        d.wins += won ? 1 : 0
        d.losses += won ? 0 : 1
        d.byDifficulty[difficulty] = d.byDifficulty[difficulty] || { w: 0, l: 0 }
        d.byDifficulty[difficulty][won ? "w" : "l"]++
        d.byChampion[champId] = d.byChampion[champId] || { w: 0, l: 0 }
        d.byChampion[champId][won ? "w" : "l"]++
        d.streak = won ? d.streak + 1 : 0
        d.bestStreak = Math.max(d.bestStreak, d.streak)
        this.save()
    },

    unlock(id) {
        if (!this.data.unlocked.includes(id)) {
            this.data.unlocked.push(id)
            this.save()
            return true
        }
        return false
    },

    // Platz in der Highscore-Liste (0-basiert) oder -1
    rankFor(mode, score) {
        const list = this.data.highscores[mode] || []
        if (score <= 0) return -1
        const i = list.findIndex(e => score > e.score)
        if (i >= 0) return i
        return list.length < 10 ? list.length : -1
    },

    addHighscore(mode, entry) {
        const list = this.data.highscores[mode] = this.data.highscores[mode] || []
        list.push(entry)
        list.sort((a, b) => b.score - a.score)
        list.length = Math.min(list.length, 10)
        this.save()
    },

    reset() {
        const unlocked = this.data.unlocked
        this.data = emptyRecord()
        this.data.unlocked = unlocked
        this.save()
    }
}

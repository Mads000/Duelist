// ============================================================
//  Einstellungen & Bilanz – lokal im Browser gespeichert
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
    }
}

const emptyRecord = () => ({ wins: 0, losses: 0, byDifficulty: {}, byChampion: {}, streak: 0, bestStreak: 0 })

const PlayerRecord = {
    data: readStorage("duelist.record", emptyRecord()),

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
        writeStorage("duelist.record", d)
    },

    reset() {
        this.data = emptyRecord()
        writeStorage("duelist.record", this.data)
    }
}

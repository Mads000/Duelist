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

// Eigener Name des Spielers (leer = noch keiner vergeben)
function playerName() {
    return String(GameSettings.get().name || "").trim()
}

const emptyRecord = () => ({
    wins: 0, losses: 0, byDifficulty: {}, byChampion: {}, streak: 0, bestStreak: 0,
    unlocked: [], arcadeClears: 0,
    highscores: { arcade: [] }
})

const PlayerRecord = {
    data: readStorage("duelist.record", emptyRecord()),

    save() {
        writeStorage("duelist.record", this.data)
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

// ============================================================
//  Fortschritt – Level & Erfahrungspunkte, drei tägliche Aufgaben.
//  Kleine Ziele, damit sich auch eine kurze Runde zwischendurch lohnt.
// ============================================================

const MISSIONS = [
    { id: "win2", text: "Gewinne 2 Kämpfe", goal: 2, ev: "win" },
    { id: "counter5", text: "Lande 5 Konter", goal: 5, ev: "counter" },
    { id: "special3", text: "Setze 3 Spezialangriffe ein", goal: 3, ev: "special" },
    { id: "perfect2", text: "Blocke 2× perfekt", goal: 2, ev: "perfectBlock" },
    { id: "finisher", text: "Gewinne mit einem Finisher", goal: 1, ev: "finisher" },
    { id: "combo5", text: "Schaffe eine 5er-Kombo", goal: 1, ev: "combo5" },
    { id: "throw3", text: "Wirf den Gegner 3×", goal: 3, ev: "throw" },
    { id: "flawless", text: "Gewinne eine Runde ohne Schaden", goal: 1, ev: "perfectRound" },
    { id: "ability4", text: "Setze 4× deine Fähigkeit ein", goal: 4, ev: "ability" }
]
const XP_MISSION = 150
const XP_FIRST_WIN = 150

const Progress = {
    pending: [],          // in diesem Match geschaffte Aufgaben (XP gibt es am Ende)
    finisher: false,

    get data() {
        const d = PlayerRecord.data
        if (d.xp === undefined) d.xp = 0
        if (d.level === undefined) d.level = 1
        return d
    },

    need(level) {
        return 200 + (level - 1) * 100
    },

    today() {
        const d = new Date()
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    },

    // drei Aufgaben pro Tag – durch das Datum bestimmt, also für alle gleich
    daily() {
        const d = this.data
        const t = this.today()
        if (!d.daily || d.daily.date !== t) {
            let seed = [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
            const pool = [...MISSIONS]
            const pick = []
            while (pick.length < 3) {
                seed = (seed * 1103515245 + 12345) >>> 0
                pick.push(pool.splice(seed % pool.length, 1)[0])
            }
            d.daily = { date: t, firstWin: false, missions: pick.map(m => ({ id: m.id, progress: 0, done: false })) }
            PlayerRecord.save()
        }
        return d.daily
    },

    mission(id) {
        return MISSIONS.find(m => m.id === id)
    },

    bump(ev, n = 1) {
        for (const m of this.daily().missions) {
            const def = this.mission(m.id)
            if (m.done || def.ev !== ev) continue
            m.progress = Math.min(def.goal, m.progress + n)
            if (m.progress >= def.goal) {
                m.done = true
                this.pending.push(def)
                UI.toast(`✔ Aufgabe geschafft: ${def.text} (+${XP_MISSION} XP)`)
                Sound.play("coin")
            }
            PlayerRecord.save()
        }
    },

    // zählt nur in echten Kämpfen (kein Training, keine Demo)
    counts(match) {
        return !!match && !match.demo && !match.training
    },

    mySide(match) {
        return match.localSide !== undefined ? match.localSide : 0
    },

    onEvent(type, data, match) {
        if (!this.counts(match)) return
        const me = this.mySide(match)
        if (type === "counter" && data.att.side === me) this.bump("counter")
        if (type === "special" && data.fighter.side === me) this.bump("special")
        if (type === "perfectBlock" && data.def.side === me) this.bump("perfectBlock")
        if (type === "combo" && data.fighter.side === me && data.count === 5) this.bump("combo5")
        if (type === "throw" && data.att.side === me) this.bump("throw")
        if (type === "ability" && data.side === me) this.bump("ability")
        if (type === "roundWin" && data.side === me && data.perfect) this.bump("perfectRound")
        if (type === "finisher") this.finisher = data.winner.side === me && data.name !== "K.O."
    },

    // nach dem Match: XP vergeben – Zusammenfassung für den Ergebnis-Bildschirm
    onMatchEnd(match, winner) {
        if (!this.counts(match)) return null
        const me = this.mySide(match)
        const won = winner === me
        const d = this.data
        const daily = this.daily()
        const lines = []
        let xp = (won ? 100 : 40) + match.wins[me] * 20
        lines.push(won ? `Sieg +${xp}` : `Kampf +${xp}`)
        if (won) {
            this.bump("win")
            if (this.finisher) this.bump("finisher")
        }
        this.finisher = false
        if (won && !daily.firstWin) {
            daily.firstWin = true
            xp += XP_FIRST_WIN
            lines.push(`Erster Sieg des Tages +${XP_FIRST_WIN}`)
        }
        for (const m of this.pending) {
            xp += XP_MISSION
            lines.push(`${m.text} +${XP_MISSION}`)
        }
        this.pending = []
        const before = d.level
        d.xp += xp
        while (d.xp >= this.need(d.level)) {
            d.xp -= this.need(d.level)
            d.level++
        }
        PlayerRecord.save()
        return { xp, lines, levelUp: d.level > before ? d.level : 0 }
    },

    // Level-Balken + Aufgaben (Hauptmenü)
    html() {
        const d = this.data
        const need = this.need(d.level)
        const missions = this.daily().missions.map(m => {
            const def = this.mission(m.id)
            return `<div class="mis${m.done ? " done" : ""}"><span>${m.done ? "✔" : "◆"} ${def.text}</span><b>${m.progress}/${def.goal}</b></div>`
        }).join("")
        return `
            <div class="pc-level"><input class="pc-name" id="playerName" maxlength="14" placeholder="Dein Name ✎" spellcheck="false" autocomplete="off" aria-label="Dein Name"><b>LEVEL ${d.level}</b><div class="xp-bar"><i style="transform:scaleX(${d.xp / need})"></i></div><span>${d.xp} / ${need} XP</span></div>
            <div class="pc-missions"><div class="pc-title">Heutige Aufgaben${this.daily().firstWin ? "" : " · Erster Sieg: +150 XP"}</div>${missions}</div>`
    }
}

// ============================================================
//  Fortschritt – Level & Erfahrungspunkte, Gold, Rang, drei tägliche Aufgaben.
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
                UI.toast(`✔ Aufgabe geschafft: ${def.text} (+${XP_MISSION} XP · +${GOLD.mission} Gold)`)
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

    // nach dem Match: XP, Gold und Rangpunkte vergeben – Zusammenfassung für den Ergebnis-Bildschirm
    onMatchEnd(match, winner) {
        if (!this.counts(match)) return null
        const me = this.mySide(match)
        const won = winner === me
        // zu zweit an einem Gerät: Gold für beide gleich, kein Rang
        const local = match.humanCount === 2 && match.localSide === undefined
        const d = this.data
        const wallet = Shop.data
        const daily = this.daily()
        const lines = []
        let xp = (won ? 100 : 40) + match.wins[me] * 20
        let gold = local ? GOLD.local : (won ? GOLD.win : GOLD.loss) + match.wins[me] * GOLD.round
        lines.push(`${won ? "Sieg" : "Kampf"} +${xp} XP · +${gold} Gold`)
        if (won) {
            this.bump("win")
            if (this.finisher) this.bump("finisher")
        }
        this.finisher = false
        if (won && !daily.firstWin) {
            daily.firstWin = true
            xp += XP_FIRST_WIN
            gold += GOLD.firstWin
            lines.push(`Erster Sieg des Tages +${XP_FIRST_WIN} XP · +${GOLD.firstWin} Gold`)
        }
        for (const m of this.pending) {
            xp += XP_MISSION
            gold += GOLD.mission
            lines.push(`${m.text} +${XP_MISSION} XP · +${GOLD.mission} Gold`)
        }
        this.pending = []

        let rank = null
        if (!local) {
            const opp = match.leads[1 - me]
            const diff = opp.controller && opp.controller.diff ? opp.controller.diff.id : "hard"
            const before = wallet.rp
            wallet.rp = Math.max(0, before + (won ? RANK_WIN[diff] || 20 : -RANK_LOSS))
            rank = { before, after: wallet.rp }
        }
        wallet.gold += gold

        const start = { level: d.level, xp: d.xp }
        d.xp += xp
        while (d.xp >= this.need(d.level)) {
            d.xp -= this.need(d.level)
            d.level++
        }
        PlayerRecord.save()
        return { xp, gold, rank, start, lines, levelUp: d.level > start.level ? d.level : 0 }
    },

    // Profil oben rechts: Name, Level, Gold
    profileHtml() {
        const d = this.data
        const need = this.need(d.level)
        return `<input class="pc-name" id="playerName" maxlength="14" placeholder="Dein Name ✎" spellcheck="false" autocomplete="off" aria-label="Dein Name">
            <button class="gold-pill" title="Shop">${Shop.goldHtml()}</button>
            <div class="pc-level"><b>LEVEL ${d.level}</b><div class="xp-bar"><i style="transform:scaleX(${d.xp / need})"></i></div><span>${d.xp} / ${need} XP</span></div>`
    },

    // Kachel: heutige Aufgaben
    missionsHtml() {
        const daily = this.daily()
        const missions = daily.missions.map(m => {
            const def = this.mission(m.id)
            return `<div class="mis${m.done ? " done" : ""}"><span>${m.done ? "✔" : "◆"} ${def.text}</span><b>${m.progress}/${def.goal}</b></div>`
        }).join("")
        const done = daily.missions.filter(m => m.done).length
        return `<div class="tile-head"><small>Heute</small><b>Aufgaben</b><span>${done}/${daily.missions.length}</span></div>
            <div class="tile-missions-list">${missions}</div>
            <div class="tile-foot">${daily.firstWin ? "✔ Erster Sieg des Tages geschafft" : `Erster Sieg des Tages: +${XP_FIRST_WIN} XP · +${GOLD.firstWin} Gold`}<br>Jede Aufgabe: +${XP_MISSION} XP · +${GOLD.mission} Gold</div>`
    }
}

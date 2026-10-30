// ============================================================
//  Tutorial – Schritt für Schritt durch das Kampfsystem
//  (läuft im Training gegen einen Dummy, Fortschritt oben im Bild)
// ============================================================

const Tutorial = {
    active: false,
    step: 0,
    count: 0,
    moved: 0,
    last: null,

    // Taste bzw. Touch-Knopf für eine Aktion – passend zur eigenen Belegung
    key(action) {
        if (isTouchDevice()) return { light: "LEICHT", heavy: "SCHWER", dash: "DASH", ability: "Fähigkeits-Knopf" }[action]
        return keyLabel(keymap("solo")[action][0])
    },

    steps() {
        const k = a => `<kbd>${this.key(a)}</kbd>`
        const m = keymap("solo")
        const move = isTouchDevice() ? "dem Joystick" : `<kbd>${[m.up, m.left, m.down, m.right].map(l => keyLabel(l[0])).join("")}</kbd>`
        const me = App.match.fighters[0].champ
        return [
            { id: "move", title: "Bewegen", text: `Lauf mit ${move} über den Platz.`, need: 1 },
            { id: "light", title: "Leichter Angriff", text: `Triff den Dummy 3× mit ${k("light")}.`, need: 3 },
            { id: "combo", title: "Kombo", text: `${k("light")} ${k("light")} und dann ${k("heavy")} – eine 3er-Kombo.`, need: 1 },
            { id: "vertical", title: "Oben & unten", text: `Stell dich über oder unter den Dummy und schlag zu (oder halte hoch/runter beim Angriff).`, need: 1 },
            { id: "dash", title: "Ausweichen", text: `Drück ${k("dash")} – während des Dash bist du kurz unverwundbar.`, need: 1 },
            { id: "block", title: "Blocken", text: `Der Dummy greift jetzt an! Halte die Richtung <b>vom Gegner weg</b> gedrückt, um zu blocken.`, need: 2 },
            { id: "ability", title: "Fähigkeit", text: `Deine Energie ist voll: ${k("ability")} setzt <b>${me.ability.name}</b> ein.`, need: 1 },
            { id: "special", title: "Spezialangriff", text: `Zum Dummy hin drücken + ${k("heavy")}: <b>${me.special.name}</b>!`, need: 1 }
        ]
    },

    begin() {
        const c = App.config
        this.active = true
        this.step = 0
        this.count = 0
        this.moved = 0
        this.last = null
        this.abilities = 0
        this.blocked = 0
        this.dummy = new BotController("easy", { dummy: "stand" })
        App.startMatch({
            rules: { mode: "tutorial", map: "sky", rounds: 1, roundTime: Infinity, infiniteEnergy: true, vs: false, noHazards: true },
            champs: [c.champs[0] || "vanguard", "warbrute"],
            opponent: { controller: this.dummy }
        })
        this.render()
    },

    stop() {
        this.active = false
        document.getElementById("tutorial").hidden = true
    },

    current() {
        return this.steps()[this.step]
    },

    render() {
        const el = document.getElementById("tutorial")
        const list = this.steps()
        const s = list[this.step]
        el.hidden = false
        el.innerHTML = s
            ? `<div class="tut-head"><span>TUTORIAL ${this.step + 1}/${list.length}</span><b>${s.title}</b></div><p>${s.text}</p>
               <div class="tut-bar"><i style="transform:scaleX(${this.step / list.length})"></i></div>`
            : `<div class="tut-head"><span>TUTORIAL</span><b>Geschafft!</b></div><p>Du kennst jetzt alle Techniken. Ab in die Arena!</p>`
    },

    progress(id, n = 1) {
        const s = this.current()
        if (!this.active || !s || s.id !== id) return
        this.count += n
        if (this.count < s.need) return
        this.count = 0
        this.step++
        Sound.play("select")
        UI.banner({ text: "GUT!", kind: "info", time: 0.7 })
        const next = this.current()
        // Beim Blocken greift der Dummy an, danach steht er wieder still
        this.dummy.dummy = next && next.id === "block" ? null : "stand"
        if (!next) {
            PlayerRecord.data.tutorialDone = true
            PlayerRecord.save()
            UI.banner({ text: "TUTORIAL GESCHAFFT!", kind: "win", side: 0, time: 2.2 })
            Sound.play("victory")
            setTimeout(() => { if (this.active) App.quitToMenu() }, 2600)
        }
        this.render()
    },

    // jede Frame: Bewegung, Dash, Blocken, Fähigkeit prüfen
    update(match) {
        if (!this.active || match.mode !== "tutorial") return
        const me = match.fighters[0]
        if (this.last) this.moved += Math.hypot(me.x - this.last.x, me.y - this.last.y)
        this.last = { x: me.x, y: me.y }
        if (this.moved > 450) this.progress("move")
        if (me.state === "dash") this.progress("dash")
        if (me.stats.abilities > (this.abilities || 0)) {
            this.abilities = me.stats.abilities
            this.progress("ability")
        }
        if (me.stats.blocked > (this.blocked || 0)) {
            this.progress("block", me.stats.blocked - (this.blocked || 0))
            this.blocked = me.stats.blocked
        }
    },

    onEvent(type, data) {
        if (!this.active) return
        if (type === "hit" && data.att.side === 0) {
            if (!data.heavy) this.progress("light")
            if (data.att.aimY) this.progress("vertical")
        }
        if (type === "combo" && data.fighter.side === 0 && data.count >= 3) this.progress("combo")
        if (type === "special" && data.fighter.side === 0) this.progress("special")
    }
}

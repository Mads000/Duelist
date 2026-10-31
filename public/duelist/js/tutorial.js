// ============================================================
//  Tutorial – Schritt für Schritt durch das Kampfsystem
//  (läuft im Training gegen einen Dummy, Fortschritt oben im Bild).
//  "Champions kennenlernen" nutzt denselben Ablauf mit Schritten je Champion.
// ============================================================

const Tutorial = {
    active: false,
    lesson: null, // Champion-ID bei "Champions kennenlernen", sonst null
    step: 0,
    count: 0,
    moved: 0,
    last: null,

    // Taste bzw. Touch-Knopf für eine Aktion – passend zur eigenen Belegung
    key(action) {
        if (isTouchDevice()) return { light: "LEICHT", heavy: "SCHWER", dash: "DASH", ability: "Fähigkeits-Knopf", block: "BLOCK" }[action]
        return keyLabel(keymap("solo")[action][0])
    },

    steps() {
        const k = a => `<kbd>${this.key(a)}</kbd>`
        const m = keymap("solo")
        const move = isTouchDevice() ? "dem Joystick" : `<kbd>${[m.up, m.left, m.down, m.right].map(l => keyLabel(l[0])).join("")}</kbd>`
        const me = App.match.fighters[0].champ
        if (this.lesson) {
            const st = me.stats
            return [
                { id: "intro", title: `${me.name} – ${me.title}`, text: `<b>${me.role}</b> · Tempo ${st.tempo} · Kraft ${st.kraft} · Reichweite ${st.reichweite}<br>${me.lore.split(". ")[0]}.`, auto: 5 },
                { id: "combo", title: "Grundkombo", text: `${Array(me.light.length).fill(k("light")).join(" ")} und dann ${k("heavy")} – lande eine 3er-Kombo am Dummy.`, need: 1 },
                { id: "special", title: `Spezialangriff: ${me.special.name}`, text: `${me.special.text}<br>Zum Dummy hin drücken + ${k("heavy")} – 2× einsetzen.`, need: 2 },
                { id: "ability", title: `Fähigkeit: ${me.ability.name}`, text: `${me.ability.text}<br>Hier ist die Energie immer voll: ${k("ability")}.`, need: 1 },
                { id: "spar", title: "Übungskampf", text: `Der Dummy wehrt sich jetzt! Lande 8 Treffer mit ${me.name} – nutze alles, was du gelernt hast.`, need: 8 }
            ]
        }
        return [
            { id: "move", title: "Bewegen", text: `Lauf mit ${move} über den Platz.`, need: 1 },
            { id: "light", title: "Leichter Angriff", text: `Triff den Dummy 3× mit ${k("light")}.`, need: 3 },
            { id: "combo", title: "Kombo", text: `${k("light")} ${k("light")} und dann ${k("heavy")} – eine 3er-Kombo.`, need: 1 },
            { id: "vertical", title: "Oben & unten", text: `Stell dich über oder unter den Dummy und schlag zu (oder halte hoch/runter beim Angriff).`, need: 1 },
            { id: "dash", title: "Ausweichen", text: `Drück ${k("dash")} – während des Dash bist du kurz unverwundbar.`, need: 1 },
            { id: "block", title: "Blocken", text: `Der Dummy greift jetzt an! Halte ${k("block")} oder die Richtung <b>vom Gegner weg</b> gedrückt, um zu blocken.`, need: 2 },
            { id: "ability", title: "Fähigkeit", text: `Deine Energie ist voll: ${k("ability")} setzt <b>${me.ability.name}</b> ein.`, need: 1 },
            { id: "special", title: "Spezialangriff", text: `Zum Dummy hin drücken + ${k("heavy")}: <b>${me.special.name}</b>!`, need: 1 }
        ]
    },

    begin(lesson = null) {
        const c = App.config
        this.lesson = lesson
        this.active = true
        this.step = 0
        this.count = 0
        this.moved = 0
        this.last = null
        this.abilities = 0
        this.blocked = 0
        this.stepStart = performance.now()
        this.dummy = new BotController("easy", { dummy: "stand" })
        const me = lesson || c.champs[0] || "vanguard"
        App.startMatch({
            rules: { mode: "tutorial", map: "sky", rounds: 1, roundTime: Infinity, infiniteEnergy: true, vs: false, noHazards: true },
            champs: [me, me === "warbrute" ? "vanguard" : "warbrute"],
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
        const label = this.lesson ? "CHAMPION" : "TUTORIAL"
        el.hidden = false
        el.innerHTML = s
            ? `<div class="tut-head"><span>${label} ${this.step + 1}/${list.length}</span><b>${s.title}</b></div><p>${s.text}</p>
               <div class="tut-bar"><i style="transform:scaleX(${this.step / list.length})"></i></div>`
            : this.lesson
                ? `<div class="tut-head"><span>${label}</span><b>Geschafft!</b></div><p>Du kennst jetzt ${CHAMPIONS[this.lesson].name}. Zeig es in der Arena!</p>`
                : `<div class="tut-head"><span>${label}</span><b>Geschafft!</b></div><p>Du kennst jetzt alle Techniken. Ab in die Arena!</p>`
    },

    progress(id, n = 1) {
        const s = this.current()
        if (!this.active || !s || s.id !== id) return
        this.count += n
        if (this.count < s.need) return
        this.count = 0
        this.step++
        this.stepStart = performance.now()
        Sound.play("select")
        UI.banner({ text: "GUT!", kind: "info", time: 0.7 })
        const next = this.current()
        // Beim Blocken und im Übungskampf greift der Dummy an, sonst steht er still
        this.dummy.dummy = next && (next.id === "block" || next.id === "spar") ? null : "stand"
        if (!next) {
            const d = PlayerRecord.data
            if (this.lesson) {
                d.lessons = d.lessons || []
                // einmalig Gold für jeden neuen Champion
                if (!d.lessons.includes(this.lesson)) {
                    d.lessons.push(this.lesson)
                    Shop.data.gold += 100
                    UI.toast(`+100 Gold – ${CHAMPIONS[this.lesson].name} gelernt!`)
                    Sound.play("coin")
                }
            } else d.tutorialDone = true
            PlayerRecord.save()
            UI.banner({ text: this.lesson ? `${CHAMPIONS[this.lesson].name.toUpperCase()} GELERNT!` : "TUTORIAL GESCHAFFT!", kind: "win", side: 0, time: 2.2 })
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
        const s = this.current()
        if (s && s.auto && performance.now() - this.stepStart > s.auto * 1000) this.progress(s.id)
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
            this.progress("spar")
            if (!data.heavy) this.progress("light")
            if (data.att.aimY) this.progress("vertical")
        }
        if (type === "combo" && data.fighter.side === 0 && data.count >= 3) this.progress("combo")
        if (type === "special" && data.fighter.side === 0) this.progress("special")
    }
}

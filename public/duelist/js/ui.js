// ============================================================
//  UI – Bildschirme, Auswahl, HUD, Banner, VS, Ergebnisse
// ============================================================

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

const STAT_LABELS = { tempo: "Tempo", kraft: "Kraft", reichweite: "Reichweite" }
const SINGLE_PICK_MODES = ["arcade", "survival", "training"]

const UI = {
    current: null,
    backTarget: {},
    select: null,
    hudCache: null,
    bannerTimer: null,

    init() {
        // Klick-/Hover-Sounds für alle Buttons
        document.addEventListener("pointerover", e => {
            const b = e.target.closest("button")
            if (b && !b.disabled && e.pointerType === "mouse" && b !== this.lastHover && !b.closest("#touch")) {
                this.lastHover = b
                Sound.play("uiHover")
            }
        })
        document.addEventListener("click", e => {
            const b = e.target.closest("button")
            if (!b || b.disabled || b.closest("#touch")) return
            Sound.play(b.hasAttribute("data-back") ? "uiBack" : "uiClick")
        })

        for (const btn of $$("[data-go]")) btn.addEventListener("click", () => App.go(btn.dataset.go))
        for (const btn of $$("[data-back]")) btn.addEventListener("click", () => App.back())

        this.buildLore()
        this.buildSettings()
        this.buildSelect()
        this.renderRecord()

        $("#fightBtn").addEventListener("click", () => this.confirmSelection())
        $("#resumeBtn").addEventListener("click", () => App.resume())
        $("#restartBtn").addEventListener("click", () => App.restart())
        $("#quitBtn").addEventListener("click", () => App.quitToMenu())
        $("#pauseSettingsBtn").addEventListener("click", () => {
            this.backTarget.settings = "pause"
            this.show("settings")
        })
        $("#rematchBtn").addEventListener("click", () => App.restart())
        $("#changeBtn").addEventListener("click", () => App.go(App.config.mode))
        $("#menuBtn").addEventListener("click", () => App.quitToMenu())
        $("#pauseBtn").addEventListener("click", () => App.pause())
        $("#swapPads").addEventListener("click", () => Link.swapSlots())
        $("#ladderGo").addEventListener("click", () => Modes.ladderGo())
        $("#hostBtn").addEventListener("click", () => {
            Link.start()
            this.renderController()
        })
        $("#joinBtn").addEventListener("click", () => PadMode.open($("#joinCode").value))
        $("#joinCode").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
        $("#joinCode").addEventListener("keydown", e => { if (e.key === "Enter") PadMode.open(e.target.value) })
    },

    show(id) {
        for (const s of $$(".screen")) s.classList.toggle("active", s.id === "screen-" + id)
        this.current = id
        document.body.dataset.screen = id
        const first = $(`#screen-${id} .btn.start:not([disabled]), #screen-${id} .btn`)
        if (first && !isTouchDevice()) setTimeout(() => first.focus({ preventScroll: true }), 30)
        if (id === "menu") this.renderRecord()
        if (id === "scores") this.renderScores()
        if (id === "lore") this.buildLore()
    },

    toast(text, ms = 2400) {
        const t = $("#toast")
        t.textContent = text
        t.classList.add("show")
        clearTimeout(this.toastTimer)
        this.toastTimer = setTimeout(() => t.classList.remove("show"), ms)
    },

    // ---------------- Hauptmenü: Bilanz ----------------
    renderRecord() {
        const r = PlayerRecord.data
        const total = r.wins + r.losses
        const rate = total ? Math.round(r.wins / total * 100) : 0
        const best = (r.highscores.arcade[0] || {}).score || 0
        $("#recordCard").innerHTML = `
            <div><b>${r.wins}</b><span>Siege</span></div>
            <div><b>${r.losses}</b><span>Niederlagen</span></div>
            <div><b>${rate}%</b><span>Quote</span></div>
            <div><b>${best.toLocaleString("de-DE")}</b><span>Arcade-Rekord</span></div>
            <div><b>${r.bestStreak}</b><span>Beste Serie</span></div>
        `
    },

    // ---------------- Champions / Lore ----------------
    buildLore() {
        const grid = $("#loreGrid")
        grid.innerHTML = ""
        for (const id of CHAMPION_ORDER) {
            const c = CHAMPIONS[id]
            const locked = !isUnlocked(id)
            const card = document.createElement("article")
            card.className = "lore-card glass" + (locked ? " locked" : "")
            card.innerHTML = locked ? `
                <div class="lore-top"><canvas width="160" height="160"></canvas><div><h3>???</h3><div class="lore-title">Geheimer Champion</div></div></div>
                <p class="lore-text">Wer im Arcade-Modus alle Gegner besiegt, erfährt, wer die Arena wirklich beherrscht.</p>
            ` : `
                <div class="lore-top">
                    <canvas width="160" height="160"></canvas>
                    <div>
                        <h3>${c.name}</h3>
                        <div class="lore-title">${c.title} · ${c.role}</div>
                        ${this.statBars(c)}
                    </div>
                </div>
                ${this.abilityBox(c)}
                <p class="lore-text">${c.lore}</p>
            `
            grid.appendChild(card)
            const preview = new SpritePreview($("canvas", card), id, "idle", { zoom: 1.05, locked })
            if (locked) continue
            const anims = [...c.light.map((_, i) => "light" + i), "heavy"]
            let i = 0
            card.addEventListener("pointerenter", () => preview.set(id, anims[i++ % anims.length]))
            card.addEventListener("pointerleave", () => preview.set(id, "idle"))
            card.addEventListener("click", () => preview.set(id, anims[i++ % anims.length]))
        }
    },

    statBars(c) {
        return `<div class="stat-bars">${Object.entries(c.stats).map(([k, v]) => `
            <div class="stat"><span>${STAT_LABELS[k]}</span><div class="pips">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= v ? "on" : ""}"></i>`).join("")}</div></div>`).join("")}</div>`
    },

    abilityBox(c, who = "") {
        const a = c.ability
        return `<div class="ability-box">
            <img src="${ASSET_ROOT}${a.icon}" alt="">
            <div><b>${who}${who ? c.name + " · " : ""}Ability: ${a.name}</b><p>${a.text}</p></div>
        </div>`
    },

    // ---------------- Einstellungen ----------------
    buildSettings() {
        const s = GameSettings.get()
        for (const input of $$("#settingsForm [data-setting]")) {
            const key = input.dataset.setting
            if (input.classList.contains("seg")) {
                input.innerHTML = ""
                for (const opt of input.dataset.options.split(",")) {
                    const [val, label] = opt.split(":")
                    const b = document.createElement("button")
                    b.textContent = label
                    b.classList.toggle("on", String(s[key]) === val)
                    b.addEventListener("click", () => {
                        GameSettings.set(key, parseFloat(val))
                        for (const o of input.children) o.classList.toggle("on", o === b)
                    })
                    input.appendChild(b)
                }
            } else if (input.type === "checkbox") {
                input.checked = !!s[key]
                input.addEventListener("change", () => {
                    GameSettings.set(key, input.checked)
                    if (key === "showFps") $("#fps").hidden = !input.checked
                })
            } else if (input.type === "range") {
                input.value = s[key]
                const update = () => input.style.setProperty("--val", (input.value * 100) + "%")
                update()
                input.addEventListener("input", () => {
                    GameSettings.set(key, parseFloat(input.value))
                    update()
                })
                input.addEventListener("change", () => Sound.play("hit", { heavy: false }))
            }
        }
        $("#resetRecord").addEventListener("click", () => {
            if (confirm("Bilanz und Highscores wirklich löschen?")) {
                PlayerRecord.reset()
                this.toast("Bilanz zurückgesetzt")
            }
        })
        $("#fps").hidden = !s.showFps
        document.body.classList.toggle("crt", !!s.crt)
    },

    // ---------------- Champion-Auswahl ----------------
    buildSelect() {
        this.sidePreviews = $$(".sel-side").map((side, i) => {
            side.addEventListener("click", () => {
                const st = this.select
                if (!st || st.single || st.step === i) return
                st.step = i
                st.picks[i] = null
                this.renderSelect()
            })
            return new SpritePreview($(".sel-sprite", side), "vanguard", "idle", { zoom: 1.25, flip: i === 1 })
        })

        // Schwierigkeit
        $("#difficulty").innerHTML = `<span class="opt-label">Bot</span>` + DIFFICULTY_ORDER.map(id =>
            `<button data-diff="${id}">${DIFFICULTIES[id].name}</button>`).join("")
        for (const b of $$("#difficulty button")) {
            b.addEventListener("click", () => {
                App.config.difficulty = b.dataset.diff
                this.renderSelect(false)
            })
        }
        // Map
        $("#mapPick").innerHTML = `<span class="opt-label">Map</span>` + [...MAP_ORDER, "random"].map(id =>
            `<button data-map="${id}" title="${id === "random" ? "Zufällige Map" : MAPS[id].text}">${id === "random" ? "Zufall" : MAPS[id].name}</button>`).join("")
        for (const b of $$("#mapPick button")) {
            b.addEventListener("click", () => {
                App.config.map = b.dataset.map
                this.renderSelect(false)
                if (b.dataset.map !== "random") this.toast(MAPS[b.dataset.map].text)
            })
        }
        // Trainingspuppe
        const dummies = { stand: "Steht", block: "Blockt", easy: "Kämpft (leicht)", normal: "Kämpft" }
        $("#dummyPick").innerHTML = `<span class="opt-label">Puppe</span>` + Object.entries(dummies).map(([id, n]) =>
            `<button data-dummy="${id}">${n}</button>`).join("")
        for (const b of $$("#dummyPick button")) {
            b.addEventListener("click", () => {
                App.config.dummy = b.dataset.dummy
                this.renderSelect(false)
            })
        }
        $("#chaosBox").addEventListener("change", e => { App.config.chaos = e.target.checked })
    },

    buildSelectCards() {
        const row = $("#selCards")
        row.innerHTML = ""
        for (const id of [...CHAMPION_ORDER, "random"]) {
            const b = document.createElement("button")
            b.className = "champ-card"
            b.dataset.id = id
            if (id === "random") {
                b.innerHTML = `<div class="cc-art random">?</div><div class="cc-name">Zufall</div>`
            } else {
                const locked = !isUnlocked(id)
                const c = CHAMPIONS[id]
                b.classList.toggle("locked", locked)
                b.innerHTML = `<canvas class="cc-art" width="96" height="96"></canvas><div class="cc-name">${locked ? "???" : c.name}</div>`
                new SpritePreview($("canvas", b), id, "idle", { zoom: 1.15, locked })
            }
            b.addEventListener("pointerenter", () => this.previewChamp(id))
            b.addEventListener("focus", () => this.previewChamp(id))
            b.addEventListener("click", () => this.pickChamp(id))
            row.appendChild(b)
        }
    },

    openSelect(mode) {
        this.buildSelectCards()
        const prev = App.config
        const single = SINGLE_PICK_MODES.includes(mode)
        let p0 = prev.champs[0] && isUnlocked(prev.champs[0]) ? prev.champs[0] : "vanguard"
        let p1 = mode === "solo" && prev.randomOpp ? "random" : (prev.champs[1] && isUnlocked(prev.champs[1]) ? prev.champs[1] : "warbrute")
        this.select = { mode, single, step: 0, picks: [null, null], hover: [p0, p1] }
        $("#chaosBox").checked = !!App.config.chaos
        this.renderSelect()
        this.show("select")
    },

    previewChamp(id) {
        const st = this.select
        if (!st || st.step > 1) return
        if (id === "random" && st.step !== 1) return
        if (id !== "random" && !isUnlocked(id)) return
        st.hover[st.step] = id
        this.renderSide(st.step)
        this.renderAbility()
    },

    pickChamp(id) {
        const st = this.select
        if (!st) return
        if (id !== "random" && !isUnlocked(id)) {
            this.toast("🔒 Schließe den Arcade-Modus ab, um diesen Champion freizuschalten.")
            return
        }
        if (st.step > 1) st.step = st.single ? 0 : 1
        if (id === "random" && st.step === 0) return
        st.picks[st.step] = id
        st.hover[st.step] = id
        Sound.play("select")
        const side = st.step
        st.lastSide = side
        if (id !== "random") {
            this.sidePreviews[side].set(id, "heavy")
            clearTimeout(this.pickTimer)
            this.pickTimer = setTimeout(() => {
                if (this.select && this.select.hover[side] === id) this.sidePreviews[side].set(id, "idle")
            }, 900)
        }
        const el = $(`.sel-side[data-side="${side}"]`)
        el.classList.remove("locked-anim")
        void el.offsetWidth
        el.classList.add("locked-anim")
        st.step = st.single ? 2 : (st.picks[1] && st.picks[0] ? 2 : st.step + 1)
        this.renderSelect(false)
        this.renderSide(side)
        if (st.step === 2) $("#fightBtn").focus({ preventScroll: true })
    },

    renderSelect(resetSides = true) {
        const st = this.select
        const m = st.mode
        const vsBot = m === "solo"
        const pill = $("#selStep")
        pill.textContent = st.step === 0 ? (vsBot || st.single ? "Wähle deinen Champion" : "Spieler 1 wählt")
            : st.step === 1 ? (vsBot ? "Wähle den Gegner" : "Spieler 2 wählt") : "Bereit?"
        pill.className = "step-pill " + (st.step === 0 ? "p1" : st.step === 1 ? "p2" : "ready")

        // Wer steuert womit? (Handy wird automatisch erkannt)
        const input = slot => Link.padFor(slot) ? "📱 Handy" : slot === 0 ? (isTouchDevice() ? "Touch / WASD" : "WASD + E F Q R") : "Pfeile + Numpad"
        $("#selTag0").innerHTML = (m === "local" ? "PLAYER 1" : "DU") + (m === "local" ? `<small>${input(0)}</small>` : "")
        $("#selTag1").innerHTML = m === "local" ? `PLAYER 2<small>${input(1)}</small>` : m === "training" ? "TRAININGSPUPPE" : "BOT · " + DIFFICULTIES[App.config.difficulty].name.toUpperCase()
        $(".sel-side[data-side='1']").hidden = st.single
        $(".sel-stage").style.gridTemplateColumns = st.single ? "minmax(0,1fr) minmax(0,2.1fr)" : ""

        $("#difficulty").hidden = !vsBot
        $("#mapPick").hidden = !["solo", "local", "training"].includes(m)
        $("#dummyPick").hidden = m !== "training"
        $("#chaosToggle").hidden = !["solo", "local"].includes(m)
        for (const b of $$("#difficulty button")) b.classList.toggle("on", b.dataset.diff === App.config.difficulty)
        for (const b of $$("#mapPick button")) b.classList.toggle("on", b.dataset.map === (App.config.map || "sky"))
        for (const b of $$("#dummyPick button")) b.classList.toggle("on", b.dataset.dummy === (App.config.dummy || "stand"))

        for (const c of $$(".champ-card")) {
            c.hidden = c.dataset.id === "random" && !(vsBot && st.step >= 1)
            c.classList.toggle("pick0", st.picks[0] === c.dataset.id)
            c.classList.toggle("pick1", st.picks[1] === c.dataset.id)
        }
        for (const side of [0, 1]) {
            const el = $(`.sel-side[data-side="${side}"]`)
            el.classList.toggle("active", st.step === side)
            el.classList.toggle("waiting", st.step < side && !st.picks[side])
            if (resetSides || st.step === side) this.renderSide(side)
        }
        this.renderAbility()
        $("#fightBtn").disabled = !(st.picks[0] && (st.single || st.picks[1]))
    },

    renderSide(side) {
        const st = this.select
        const el = $(`.sel-side[data-side="${side}"]`)
        const id = st.picks[side] || st.hover[side]
        const wrap = $(".sel-sprite-wrap", el)
        if (id === "random") {
            wrap.classList.add("random")
            $(".sel-name", el).textContent = "Zufall"
            $(".sel-role", el).textContent = "Der Bot wählt selbst"
            $(".sel-stats", el).innerHTML = ""
            return
        }
        wrap.classList.remove("random")
        const c = CHAMPIONS[id]
        if (this.sidePreviews[side].champId !== id) this.sidePreviews[side].set(id, "idle")
        $(".sel-name", el).textContent = c.name
        $(".sel-role", el).textContent = `${c.title} · ${c.role}`
        $(".sel-stats", el).innerHTML = this.statBars(c)
    },

    renderAbility() {
        const st = this.select
        // Nach der Wahl die Fähigkeit des zuletzt gewählten Champions zeigen (Einzelwahl: immer Spieler 1)
        const side = st.single ? 0 : st.step <= 1 ? st.step : st.lastSide
        const id = st.picks[side] || st.hover[side]
        $("#selAbility").outerHTML = id === "random"
            ? `<div class="ability-box" id="selAbility"><div><b>Zufälliger Gegner</b><p>Lass dich überraschen!</p></div></div>`
            : this.abilityBox(CHAMPIONS[id], st.single ? "" : side === 0 ? (st.mode === "local" ? "P1: " : "Du: ") : (st.mode === "local" ? "P2: " : "Gegner: ")).replace('class="ability-box"', 'class="ability-box" id="selAbility"')
    },

    confirmSelection() {
        const st = this.select
        if (!st || !st.picks[0] || (!st.single && !st.picks[1])) return
        App.config.mode = st.mode
        App.config.champs[0] = st.picks[0]
        if (!st.single) {
            App.config.randomOpp = st.picks[1] === "random"
            App.config.champs[1] = st.picks[1] === "random" ? pickRandomChamp([st.picks[0]]) : st.picks[1]
        }
        Modes.begin(st.mode)
    },

    // ---------------- HUD ----------------
    buildHud(match) {
        this.hudCache = { hp: [-1, -1], lag: [-1, -1], energy: [-1, -1], guard: [-1, -1], wins: [-1, -1], timer: -1, ready: [null, null] }
        this.hudPreviews = this.hudPreviews || []
        for (const f of match.fighters) {
            const el = $(`.hud-player[data-side="${f.side}"]`)
            let name = f.champ.name
            if (match.humanCount === 1 && f.side === 1) name += match.training ? " <small>Training</small>" : ` <small>BOT · ${DIFFICULTIES[match.fighters[1].controller.diff ? match.fighters[1].controller.diff.id : "normal"].name}</small>`
            $(".hud-name", el).innerHTML = name
            $(".hp-text", el).textContent = match.humanCount === 2 ? `Player ${f.side + 1}` : f.side === 0 ? "Player 1" : (match.training ? "Dummy" : "CPU")
            $(".energy", el).innerHTML = Array.from({ length: f.maxEnergy }, (_, i) =>
                `<i class="${i === f.champ.ability.cost - 1 ? "cost" : ""}"></i>`).join("") +
                `<img src="${ASSET_ROOT}${f.champ.ability.icon}" alt="">`
            $(".hud-wins", el).innerHTML = match.training ? "" : Array.from({ length: match.roundsToWin }, () => "<i></i>").join("")
            if (!this.hudPreviews[f.side]) {
                this.hudPreviews[f.side] = new SpritePreview($(".hud-portrait", el), f.champId, "idle", { zoom: 1.9, flip: f.side === 1 })
            } else {
                this.hudPreviews[f.side].set(f.champId, "idle")
            }
        }
        this.renderHudKeys(match)
        $("#touch .t-ability img").src = ASSET_ROOT + match.fighters[0].champ.ability.icon
        $("#hudScore").hidden = !Modes.showsScore()
        document.body.classList.toggle("has-score", Modes.showsScore())
        this.setScore(Modes.score(), false)
    },

    // Steuerung unten links/rechts – nur für Spieler an der Tastatur
    renderHudKeys(match) {
        const k = (key, label) => `<span><kbd>${key}</kbd>${label}</span>`
        const layouts = match.humanCount === 2
            ? [
                [k("WASD", "Laufen"), k("E", "Leicht"), k("F", "Schwer"), k("Q", "Dash"), k("R", "Spezial")],
                [k("Pfeile", "Laufen"), k("Num1", "Leicht"), k("Num2", "Schwer"), k("Num3", "Dash"), k("Num0", "Spezial")]
            ]
            : [[k("WASD", "Laufen"), k("J", "Leicht"), k("K", "Schwer"), k("L", "Dash"), k("I", "Spezial"), k("Esc", "Pause")], null]
        for (const side of [0, 1]) {
            const el = $(`.hud-keys[data-side="${side}"]`)
            const keys = layouts[side]
            const show = keys && !isTouchDevice() && !Link.padFor(side) && match.fighters[side].isHuman
            el.hidden = !show
            if (show) el.innerHTML = `<b>${match.humanCount === 2 ? "P" + (side + 1) : "Steuerung"}</b>${keys.join("")}<small>Hoch/Runter + Angriff = nach oben/unten schlagen</small>`
        }
    },

    updateHud(match) {
        const c = this.hudCache
        if (!c) return
        for (const f of match.fighters) {
            const el = $(`.hud-player[data-side="${f.side}"]`)
            const hp = Math.ceil(f.hp)
            if (c.hp[f.side] !== hp) {
                const dropped = hp < c.hp[f.side]
                c.hp[f.side] = hp
                $(".hp-fill", el).style.transform = `scaleX(${f.hp / f.maxHp})`
                el.classList.toggle("low", f.hp <= f.maxHp * 0.25)
                if (dropped) {
                    el.classList.remove("hit")
                    void el.offsetWidth
                    el.classList.add("hit")
                }
            }
            const lag = Math.round(f.hpLag)
            if (c.lag[f.side] !== lag) {
                c.lag[f.side] = lag
                $(".hp-lag", el).style.transform = `scaleX(${Math.max(f.hp, f.hpLag) / f.maxHp})`
            }
            const guard = Math.round(f.guard / 5)
            if (c.guard[f.side] !== guard) {
                c.guard[f.side] = guard
                $(".guard i", el).style.transform = `scaleX(${f.guard / COMBAT.guardMax})`
                $(".guard", el).classList.toggle("low", f.guard < 35)
            }
            if (c.energy[f.side] !== f.energy) {
                c.energy[f.side] = f.energy
                $$(".energy i", el).forEach((pip, i) => pip.classList.toggle("on", i < f.energy))
                el.classList.toggle("ready", f.abilityReady)
                if (f.side === 0) this.updateTouchAbility(f)
            }
            if (c.wins[f.side] !== match.wins[f.side]) {
                c.wins[f.side] = match.wins[f.side]
                $$(".hud-wins i", el).forEach((pip, i) => pip.classList.toggle("on", i < match.wins[f.side]))
            }
        }
        const sec = isFinite(match.timer) ? Math.ceil(match.timer) : "∞"
        if (c.timer !== sec) {
            c.timer = sec
            const t = $("#hudTimer")
            t.textContent = sec
            t.classList.toggle("urgent", typeof sec === "number" && sec <= 10)
        }
    },

    setScore(score, bump = true) {
        const el = $("#hudScore")
        el.textContent = String(score).padStart(7, "0")
        if (bump) {
            el.classList.remove("bump")
            void el.offsetWidth
            el.classList.add("bump")
        }
    },

    updateTouchAbility(f) {
        const btn = $("#touch .t-ability")
        const k = Math.min(1, f.energy / f.champ.ability.cost)
        $(".t-ring circle", btn).style.strokeDashoffset = String(289 * (1 - k))
        btn.classList.toggle("ready", f.abilityReady)
    },

    combo(side, count, damage) {
        const el = $(`.hud-player[data-side="${side}"] .combo`)
        el.innerHTML = `<b>${count}</b> HITS<small>${damage} Schaden</small>`
        el.classList.remove("show")
        void el.offsetWidth
        el.classList.add("show")
        clearTimeout(el._t)
        el._t = setTimeout(() => el.classList.remove("show"), 1200)
    },

    denyAbility(side) {
        const el = $(`.hud-player[data-side="${side}"] .energy`)
        el.classList.remove("deny")
        void el.offsetWidth
        el.classList.add("deny")
        if (side === 0) {
            const btn = $("#touch .t-ability")
            btn.classList.remove("deny")
            void btn.offsetWidth
            btn.classList.add("deny")
        }
    },

    banner({ text, sub = "", kind = "round", side = null, time = 1.2 }) {
        const b = $("#banner")
        $(".banner-text", b).textContent = text
        $(".banner-sub", b).textContent = sub
        b.className = ""
        b.dataset.kind = kind
        b.toggleAttribute("data-long", text.length > 6)
        if (side !== null) b.classList.add("side" + side)
        void b.offsetWidth
        b.classList.add("show")
        clearTimeout(this.bannerTimer)
        this.bannerTimer = setTimeout(() => b.classList.remove("show"), time * 1000)
    },

    hideBanner() {
        clearTimeout(this.bannerTimer)
        $("#banner").className = ""
        $("#vs").className = ""
    },

    // ---------------- VS-Bildschirm ----------------
    showVs(match) {
        const vs = $("#vs")
        this.vsPreviews = this.vsPreviews || []
        match.fighters.forEach((f, i) => {
            const side = $(`.vs-side.p${i + 1}`, vs)
            $(".vs-name", side).textContent = f.champ.name
            $(".vs-sub", side).textContent = match.humanCount === 2 ? `Player ${i + 1}` : i === 0 ? "Du" : (match.training ? "Trainingspuppe" : "CPU · " + (f.controller.diff ? f.controller.diff.name : ""))
            if (!this.vsPreviews[i]) this.vsPreviews[i] = new SpritePreview($("canvas", side), f.champId, "idle", { zoom: 1.2, flip: i === 1 })
            else this.vsPreviews[i].set(f.champId, "idle")
        })
        $(".vs-map", vs).textContent = (match.rules.stage ? match.rules.stage + " · " : "") + match.map.name + (match.rules.chaos ? " · CHAOS" : "")
        vs.className = ""
        void vs.offsetWidth
        vs.className = "show"
        Sound.play("select")
        clearTimeout(this.vsTimer)
        this.vsTimer = setTimeout(() => { vs.className = "" }, 2300)
    },

    // ---------------- Arcade-Leiter ----------------
    showLadder({ title, steps, current, info, button = "FIGHT!" }) {
        $("#ladderTitle").textContent = title
        const ladder = $("#ladder")
        ladder.innerHTML = ""
        steps.forEach((s, i) => {
            const d = document.createElement("div")
            d.className = "ladder-step" + (i < current ? " done" : i === current ? " current" : "") + (CHAMPIONS[s.champ].boss ? " boss" : "")
            const hidden = CHAMPIONS[s.champ].boss && !isUnlocked(s.champ) && i !== current
            d.innerHTML = `<canvas width="96" height="96"></canvas><span>${hidden ? "???" : CHAMPIONS[s.champ].name}</span>`
            ladder.appendChild(d)
            new SpritePreview($("canvas", d), s.champ, i === current ? "light0" : "idle", { zoom: 1.2, flip: true, locked: hidden })
        })
        $("#ladderInfo").innerHTML = info
        $("#ladderGo").textContent = button
        this.show("ladder")
    },

    // ---------------- Continue ----------------
    showContinue(onYes, onNo) {
        let n = 9
        const count = $("#continueCount")
        count.textContent = n
        this.show("continue")
        clearInterval(this.continueTimer)
        const done = fn => {
            clearInterval(this.continueTimer)
            $("#continueYes").onclick = null
            $("#continueNo").onclick = null
            fn()
        }
        this.continueTimer = setInterval(() => {
            n--
            count.textContent = n
            Sound.play("count")
            if (n <= 0) done(onNo)
        }, 1000)
        $("#continueYes").onclick = () => {
            Sound.play("coin")
            done(onYes)
        }
        $("#continueNo").onclick = () => done(onNo)
    },

    // ---------------- Initialen eintragen ----------------
    showEntry(score, title, onDone) {
        const letters = ["A", "A", "A"]
        let pos = 0
        const last = (localStorage.getItem("duelist.initials") || "").split("")
        if (last.length === 3) last.forEach((l, i) => { letters[i] = l })
        const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        const wrap = $("#entryLetters")
        const render = () => {
            wrap.innerHTML = letters.map((l, i) => `
                <div class="letter ${i === pos ? "active" : ""}" data-i="${i}">
                    <button data-d="-1" aria-label="hoch">▲</button><span>${l}</span><button data-d="1" aria-label="runter">▼</button>
                </div>`).join("")
            for (const b of $$("button", wrap)) {
                b.onclick = () => {
                    const i = +b.closest(".letter").dataset.i
                    pos = i
                    const k = (ABC.indexOf(letters[i]) + +b.dataset.d + ABC.length) % ABC.length
                    letters[i] = ABC[k]
                    render()
                }
            }
            for (const l of $$(".letter span", wrap)) l.onclick = () => { pos = +l.parentElement.dataset.i; render() }
        }
        render()
        $("#entryTitle").textContent = title
        $("#entryScore").textContent = score.toLocaleString("de-DE")
        this.show("entry")
        Sound.play("victory")

        const onKey = code => {
            if (this.current !== "entry") return
            if (code === "ArrowUp" || code === "KeyW") letters[pos] = ABC[(ABC.indexOf(letters[pos]) - 1 + ABC.length) % ABC.length]
            else if (code === "ArrowDown" || code === "KeyS") letters[pos] = ABC[(ABC.indexOf(letters[pos]) + 1) % ABC.length]
            else if (code === "ArrowRight" || code === "KeyD") pos = Math.min(2, pos + 1)
            else if (code === "ArrowLeft" || code === "KeyA") pos = Math.max(0, pos - 1)
            else if (/^Key[A-Z]$/.test(code) && !["KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) {
                letters[pos] = code.slice(3)
                pos = Math.min(2, pos + 1)
            } else return
            render()
        }
        Keyboard.listeners.add(onKey)
        $("#entryOk").onclick = () => {
            Keyboard.listeners.delete(onKey)
            const name = letters.join("")
            try { localStorage.setItem("duelist.initials", name) } catch (e) { }
            onDone(name)
        }
    },

    renderScores(highlight = null) {
        // Immer 10 Plätze wie am Automaten – leere Plätze als "---"
        const fill = (el, list) => {
            const rows = list.map(e => `
                <li class="${highlight && highlight === e ? "new" : ""}"><span class="sl-name">${e.name}</span><span>${CHAMPIONS[e.champ] ? CHAMPIONS[e.champ].name : ""}${e.detail ? " · " + e.detail : ""}</span><span class="sl-score">${e.score.toLocaleString("de-DE")}</span></li>`)
            for (let i = list.length; i < 10; i++) {
                rows.push(`<li class="placeholder"><span class="sl-name">---</span><span></span><span class="sl-score">0</span></li>`)
            }
            el.innerHTML = rows.join("")
        }
        fill($("#scoresArcade"), PlayerRecord.data.highscores.arcade || [])
        fill($("#scoresSurvival"), PlayerRecord.data.highscores.survival || [])
    },

    // ---------------- Handy-Controller ----------------
    renderController() {
        const s = Link.status
        const hosting = s !== "off"
        $("#hostBtn").hidden = hosting
        $("#pairCode").parentElement.hidden = !hosting
        $("#pairCode").textContent = Link.code || "····"
        $("#qr").innerHTML = s === "ready" ? Link.qrSvg() : `<span class="dark">${s === "error" ? "⚠" : s === "off" ? "📺" : "…"}</span>`
        $("#pairStatus").textContent = s === "ready" ? "Bereit – scanne den Code oder tippe ihn am Handy ein."
            : s === "error" ? Link.error : s === "off" ? "Tippe auf „QR-Code anzeigen“, wenn dieses Gerät das Spiel zeigen soll." : "Starte Verbindung …"
        $("#padList").innerHTML = [0, 1].map(slot => {
            const p = Link.padFor(slot)
            return `<span class="pad-chip ${p ? "p" + (slot + 1) : "none"}">Spieler ${slot + 1}: ${p ? "📱 verbunden" : "wartet auf Handy …"}</span>`
        }).join("")
        $("#swapPads").hidden = !Link.pads.length
        // Auf dem Handy steht "Controller" zuerst
        $(".controller-layout").classList.toggle("phone-first", isTouchDevice())
    },

    // ---------------- Ergebnis ----------------
    showResults(match, winner, { title, sub, note = "", rematch = "Revanche", change = true } = {}) {
        const solo = match.humanCount === 1
        const won = winner === 0
        const t = $("#resTitle")
        t.textContent = title || (solo ? (won ? "YOU WIN!" : "YOU LOSE") : `PLAYER ${winner + 1} WINS`)
        t.className = "res-title " + (solo ? (won ? "win" : "lose") : "p" + (winner + 1))
        const opp = match.fighters[1]
        $("#resSub").textContent = sub || (solo
            ? `gegen ${opp.champ.name} · ${match.map.name}`
            : `${match.fighters[winner].champ.name} beherrscht die Arena`)
        $("#resScore").innerHTML = `<span class="p1">${match.wins[0]}</span><i>:</i><span class="p2">${match.wins[1]}</span>`

        this.resPreviews = this.resPreviews || []
        for (const f of match.fighters) {
            const el = $(`.res-fighter[data-side="${f.side}"]`)
            el.classList.toggle("winner", f.side === winner)
            $(".res-name", el).textContent = solo ? (f.side === 0 ? "Du · " : "CPU · ") + f.champ.name : `P${f.side + 1} · ${f.champ.name}`
            const anim = f.side === winner ? "heavy" : "death"
            if (!this.resPreviews[f.side]) this.resPreviews[f.side] = new SpritePreview($("canvas", el), f.champId, anim, { zoom: 1.2, flip: f.side === 1 })
            else this.resPreviews[f.side].set(f.champId, anim)
        }

        const rows = [
            ["Schaden", "damage"], ["Treffer", "hits"], ["Beste Kombo", "maxCombo"], ["Konter", "counters"],
            ["Geblockt", "blocked"], ["Perfekt geblockt", "perfect"], ["Ausgewichen", "dodges"], ["Fähigkeiten", "abilities"]
        ]
        const [a, b] = match.fighters
        $("#resStats").innerHTML = rows.map(([label, key]) => {
            const va = Math.round(a.stats[key])
            const vb = Math.round(b.stats[key])
            const max = Math.max(1, va, vb)
            return `<div class="rs-row">
                <span class="rs-val p1 ${va > vb ? "best" : ""}">${va}</span>
                <div class="rs-bar left"><i style="width:${va / max * 100}%"></i></div>
                <span class="rs-label">${label}</span>
                <div class="rs-bar"><i style="width:${vb / max * 100}%"></i></div>
                <span class="rs-val p2 ${vb > va ? "best" : ""}">${vb}</span>
            </div>`
        }).join("")
        $("#resNote").textContent = note
        $("#rematchBtn").textContent = rematch
        $("#changeBtn").hidden = !change
        this.show("results")
    }
}

function pickRandomChamp(exclude = []) {
    const pool = playableChampions().filter(id => !exclude.includes(id) && !CHAMPIONS[id].boss)
    return pool[Math.floor(Math.random() * pool.length)] || "vanguard"
}

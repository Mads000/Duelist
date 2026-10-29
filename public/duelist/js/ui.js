// ============================================================
//  UI – Bildschirme, Champion-Auswahl, HUD, Banner, Ergebnisse
// ============================================================

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

const STAT_LABELS = { tempo: "Tempo", kraft: "Kraft", reichweite: "Reichweite" }

const UI = {
    current: null,
    backTarget: {},
    select: null,
    hudCache: null,
    bannerTimer: null,

    init() {
        // Klick-/Hover-Sounds für alle Buttons
        document.addEventListener("pointerover", e => {
            const b = e.target.closest("button, .menu-btn")
            if (b && !b.disabled && e.pointerType === "mouse" && b !== this.lastHover) {
                this.lastHover = b
                Sound.play("uiHover")
            }
        })
        document.addEventListener("click", e => {
            const b = e.target.closest("button, a.menu-btn")
            if (!b || b.disabled || b.closest("#touch")) return
            Sound.play(b.hasAttribute("data-back") ? "uiBack" : "uiClick")
        })

        for (const btn of $$("[data-go]")) {
            btn.addEventListener("click", () => App.go(btn.dataset.go))
        }
        for (const btn of $$("[data-back]")) {
            btn.addEventListener("click", () => App.back())
        }

        this.buildLore()
        this.buildSettings()
        this.buildSelectCards()
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
    },

    show(id) {
        for (const s of $$(".screen")) s.classList.toggle("active", s.id === "screen-" + id)
        this.current = id
        document.body.dataset.screen = id
        const first = $(`#screen-${id} .menu-btn, #screen-${id} .btn-primary:not([disabled])`)
        if (first && !isTouchDevice()) setTimeout(() => first.focus({ preventScroll: true }), 30)
        if (id === "menu") this.renderRecord()
    },

    toast(text, ms = 2200) {
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
        let fav = null
        for (const [id, v] of Object.entries(r.byChampion)) {
            if (!fav || v.w + v.l > fav.n) fav = { id, n: v.w + v.l }
        }
        const rows = DIFFICULTY_ORDER.map(id => {
            const v = r.byDifficulty[id] || { w: 0, l: 0 }
            return `<div class="rc-row"><span>${DIFFICULTIES[id].name}</span><b>${v.w}</b><i>:</i><b class="l">${v.l}</b></div>`
        }).join("")
        $("#recordCard").innerHTML = `
            <h3>Deine Bilanz</h3>
            <div class="rc-big"><div><b>${r.wins}</b><span>Siege</span></div><div><b>${r.losses}</b><span>Niederlagen</span></div><div><b>${rate}%</b><span>Quote</span></div></div>
            <div class="rc-list">${rows}</div>
            <div class="rc-foot">Beste Serie: <b>${r.bestStreak}</b>${fav ? ` · Main: <b>${CHAMPIONS[fav.id].name}</b>` : ""}</div>
        `
    },

    // ---------------- Champions / Lore ----------------
    buildLore() {
        const grid = $("#loreGrid")
        grid.innerHTML = ""
        for (const id of CHAMPION_ORDER) {
            const c = CHAMPIONS[id]
            const card = document.createElement("article")
            card.className = "lore-card panel"
            card.style.setProperty("--champ", c.color)
            card.innerHTML = `
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
            const preview = new SpritePreview($("canvas", card), id, "idle", { zoom: 1.05 })
            let i = 0
            card.addEventListener("pointerenter", () => preview.set(id, "attack" + (i++ % c.combo.length)))
            card.addEventListener("pointerleave", () => preview.set(id, "idle"))
            card.addEventListener("click", () => preview.set(id, "attack" + (i++ % c.combo.length)))
        }
    },

    statBars(c) {
        return `<div class="stat-bars">${Object.entries(c.stats).map(([k, v]) => `
            <div class="stat"><span>${STAT_LABELS[k]}</span><div class="pips">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= v ? "on" : ""}"></i>`).join("")}</div></div>`).join("")}</div>`
    },

    abilityBox(c) {
        const a = c.ability
        return `<div class="ability-box">
            <img src="${ASSET_ROOT}${a.icon}" alt="">
            <div><b>${a.name}</b><p>${a.text}</p></div>
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
                    b.dataset.value = val
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
            if (confirm("Deine Bilanz gegen Bots wirklich löschen?")) {
                PlayerRecord.reset()
                this.toast("Bilanz zurückgesetzt")
            }
        })
        $("#fps").hidden = !s.showFps
    },

    // ---------------- Champion-Auswahl ----------------
    buildSelectCards() {
        const row = $("#selCards")
        row.innerHTML = ""
        const ids = [...CHAMPION_ORDER, "random"]
        for (const id of ids) {
            const b = document.createElement("button")
            b.className = "champ-card"
            b.dataset.id = id
            if (id === "random") {
                b.innerHTML = `<div class="cc-art random">?</div><div class="cc-name">Zufall</div>`
            } else {
                const c = CHAMPIONS[id]
                b.style.setProperty("--champ", c.color)
                b.innerHTML = `<canvas class="cc-art" width="96" height="96"></canvas><div class="cc-name">${c.name}</div><div class="cc-role">${c.role}</div>`
                new SpritePreview($("canvas", b), id, "idle", { zoom: 1.15 })
            }
            b.addEventListener("pointerenter", () => this.previewChamp(id))
            b.addEventListener("focus", () => this.previewChamp(id))
            b.addEventListener("click", () => this.pickChamp(id))
            row.appendChild(b)
        }
        row.addEventListener("keydown", e => {
            const cards = $$(".champ-card:not([hidden])", row)
            const i = cards.indexOf(document.activeElement)
            if (i < 0) return
            if (e.code === "ArrowRight" || e.code === "KeyD") cards[(i + 1) % cards.length].focus()
            if (e.code === "ArrowLeft" || e.code === "KeyA") cards[(i - 1 + cards.length) % cards.length].focus()
        })

        this.sidePreviews = $$(".sel-side").map((side, i) => {
            side.addEventListener("click", () => {
                if (!this.select || this.select.step === i) return
                this.select.step = i
                this.select.picks[i] = null
                this.renderSelect()
            })
            return new SpritePreview($(".sel-sprite", side), "vanguard", "idle", { zoom: 1.25, flip: i === 1 })
        })

        // Schwierigkeit
        const diff = $("#difficulty")
        diff.innerHTML = `<span class="diff-label">Bot-Stärke</span>` + DIFFICULTY_ORDER.map(id =>
            `<button data-diff="${id}">${DIFFICULTIES[id].name}</button>`).join("")
        for (const b of $$("button", diff)) {
            b.addEventListener("click", () => {
                App.config.difficulty = b.dataset.diff
                this.renderSelect()
            })
        }
    },

    openSelect(mode) {
        const prev = App.config
        this.select = {
            mode,
            step: 0,
            picks: [null, null],
            hover: [prev.champs[0] || "vanguard", mode === "solo" && prev.randomOpp ? "random" : prev.champs[1] || "warbrute"]
        }
        this.renderSelect()
        this.show("select")
    },

    previewChamp(id) {
        const st = this.select
        if (!st || st.step > 1) return
        if (id === "random" && st.step !== 1) return
        st.hover[st.step] = id
        this.renderSide(st.step)
    },

    pickChamp(id) {
        const st = this.select
        if (!st) return
        if (st.step > 1) st.step = 1
        if (id === "random" && st.step === 0) return
        st.picks[st.step] = id
        st.hover[st.step] = id
        Sound.play("select")
        const preview = this.sidePreviews[st.step]
        if (id !== "random") {
            preview.set(id, "attack" + (CHAMPIONS[id].combo.length - 1))
            const side = st.step
            clearTimeout(this.pickTimer)
            this.pickTimer = setTimeout(() => {
                if (this.select && this.select.hover[side] === id) this.sidePreviews[side].set(id, "idle")
            }, 900)
        }
        $(`.sel-side[data-side="${st.step}"]`).classList.remove("locked-anim")
        void $(`.sel-side[data-side="${st.step}"]`).offsetWidth
        $(`.sel-side[data-side="${st.step}"]`).classList.add("locked-anim")
        const pickedSide = st.step
        st.step = st.picks[1] && st.picks[0] ? 2 : st.step + 1
        this.renderSelect(false)
        this.renderSide(pickedSide)
        if (st.step === 2) $("#fightBtn").focus({ preventScroll: true })
    },

    renderSelect(resetAnims = true) {
        const st = this.select
        const solo = st.mode === "solo"
        $("#selTitle").textContent = st.step === 0 ? "Wähle deinen Champion"
            : st.step === 1 ? (solo ? "Wähle deinen Gegner" : "Spieler 2 wählt")
                : "Bereit zum Kampf?"
        const pill = $("#selStep")
        pill.textContent = st.step === 0 ? (solo ? "Du" : "Spieler 1") : st.step === 1 ? (solo ? "Gegner" : "Spieler 2") : "Bereit"
        pill.className = "step-pill " + (st.step === 0 ? "p1" : st.step === 1 ? "p2" : "ready")
        $("#selTag0").textContent = solo ? "DU" : "SPIELER 1"
        $("#selTag1").textContent = solo ? "BOT · " + DIFFICULTIES[App.config.difficulty].name.toUpperCase() : "SPIELER 2"

        $("#difficulty").hidden = !solo
        for (const b of $$("#difficulty button")) b.classList.toggle("on", b.dataset.diff === App.config.difficulty)
        for (const c of $$(".champ-card")) {
            c.hidden = c.dataset.id === "random" && !(solo && st.step >= 1)
            c.classList.toggle("pick0", st.picks[0] === c.dataset.id)
            c.classList.toggle("pick1", st.picks[1] === c.dataset.id)
        }
        for (const side of [0, 1]) {
            const el = $(`.sel-side[data-side="${side}"]`)
            el.classList.toggle("active", st.step === side)
            el.classList.toggle("locked", !!st.picks[side])
            el.classList.toggle("waiting", st.step < side && !st.picks[side])
            if (resetAnims || st.step === side) this.renderSide(side)
        }
        $("#fightBtn").disabled = !(st.picks[0] && st.picks[1])
    },

    renderSide(side) {
        const st = this.select
        const el = $(`.sel-side[data-side="${side}"]`)
        const id = st.picks[side] || st.hover[side]
        const wrap = $(".sel-sprite-wrap", el)
        if (id === "random") {
            wrap.classList.add("random")
            $(".sel-name", el).textContent = "Zufall"
            $(".sel-role", el).textContent = "Überraschung!"
            $(".sel-stats", el).innerHTML = ""
            $(".sel-ability", el).innerHTML = `<p class="muted">Der Bot wählt zufällig einen Champion.</p>`
            el.style.setProperty("--champ", "#ffcf5a")
            return
        }
        wrap.classList.remove("random")
        const c = CHAMPIONS[id]
        if (this.sidePreviews[side].champId !== id) this.sidePreviews[side].set(id, "idle")
        el.style.setProperty("--champ", c.color)
        $(".sel-name", el).textContent = c.name
        $(".sel-role", el).textContent = `${c.title} · ${c.role}`
        $(".sel-stats", el).innerHTML = this.statBars(c)
        $(".sel-ability", el).innerHTML = this.abilityBox(c)
    },

    confirmSelection() {
        const st = this.select
        if (!st || !st.picks[0] || !st.picks[1]) return
        App.config.mode = st.mode
        App.config.randomOpp = st.picks[1] === "random"
        let opp = st.picks[1]
        if (opp === "random") opp = CHAMPION_ORDER[Math.floor(Math.random() * CHAMPION_ORDER.length)]
        App.config.champs = [st.picks[0], opp]
        App.startMatch()
    },

    // ---------------- HUD ----------------
    buildHud(match) {
        this.hudCache = { hp: [-1, -1], lag: [-1, -1], energy: [-1, -1], wins: [-1, -1], timer: -1, round: -1, ready: [null, null] }
        this.hudPreviews = this.hudPreviews || []
        for (const f of match.fighters) {
            const el = $(`.hud-player[data-side="${f.side}"]`)
            el.style.setProperty("--champ", f.champ.color)
            let name = f.champ.name
            if (match.mode === "solo" && f.side === 1) name += ` <small>BOT · ${DIFFICULTIES[App.config.difficulty].name}</small>`
            if (match.mode === "local") name = `<small>${f.side === 0 ? "P1" : "P2"}</small> ` + name
            $(".hud-name", el).innerHTML = name
            $(".energy", el).innerHTML = Array.from({ length: f.maxEnergy }, (_, i) =>
                `<i class="${i === f.champ.ability.cost - 1 ? "cost" : ""}"></i>`).join("") +
                `<img src="${ASSET_ROOT}${f.champ.ability.icon}" alt="">`
            $(".hud-wins", el).innerHTML = Array.from({ length: match.roundsToWin }, () => "<i></i>").join("")
            if (!this.hudPreviews[f.side]) {
                this.hudPreviews[f.side] = new SpritePreview($(".hud-portrait", el), f.champId, "idle", { zoom: 1.9, flip: f.side === 1 })
            } else {
                this.hudPreviews[f.side].set(f.champId, "idle")
            }
        }
        const human = match.fighters[0]
        $("#touch .t-ability img").src = ASSET_ROOT + human.champ.ability.icon
    },

    updateHud(match) {
        const c = this.hudCache
        if (!c) return
        for (const f of match.fighters) {
            const el = $(`.hud-player[data-side="${f.side}"]`)
            const hp = Math.ceil(f.hp)
            if (c.hp[f.side] !== hp) {
                c.hp[f.side] = hp
                $(".hp-fill", el).style.transform = `scaleX(${f.hp / COMBAT.hp})`
                $(".hp-num", el).textContent = hp
                el.classList.toggle("low", hp <= 25)
                el.classList.remove("hit")
                void el.offsetWidth
                if (hp < c.lag[f.side]) el.classList.add("hit")
            }
            const lag = Math.round(f.hpLag * 2) / 2
            if (c.lag[f.side] !== lag) {
                c.lag[f.side] = lag
                $(".hp-lag", el).style.transform = `scaleX(${Math.max(f.hp, f.hpLag) / COMBAT.hp})`
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
        const sec = Math.ceil(match.timer)
        if (c.timer !== sec) {
            c.timer = sec
            const t = $("#hudTimer")
            t.textContent = sec
            t.classList.toggle("urgent", sec <= 10)
        }
        if (c.round !== match.round) {
            c.round = match.round
            $("#hudRound").textContent = `Runde ${match.round}`
        }
    },

    updateTouchAbility(f) {
        const btn = $("#touch .t-ability")
        const k = Math.min(1, f.energy / f.champ.ability.cost)
        $(".t-ring circle", btn).style.strokeDashoffset = String(289 * (1 - k))
        btn.classList.toggle("ready", f.abilityReady)
    },

    combo(side, count) {
        const el = $(`.hud-player[data-side="${side}"] .combo`)
        el.innerHTML = `<b>${count}</b> Treffer`
        el.classList.remove("show")
        void el.offsetWidth
        el.classList.add("show")
        clearTimeout(el._t)
        el._t = setTimeout(() => el.classList.remove("show"), 1100)
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
        if (side !== null) b.classList.add("side" + side)
        void b.offsetWidth
        b.classList.add("show")
        clearTimeout(this.bannerTimer)
        this.bannerTimer = setTimeout(() => b.classList.remove("show"), time * 1000)
    },

    hideBanner() {
        clearTimeout(this.bannerTimer)
        $("#banner").className = ""
    },

    // ---------------- Ergebnis ----------------
    showResults(match, winner, note) {
        const solo = match.mode === "solo"
        const title = $("#resTitle")
        const won = winner === 0
        title.textContent = solo ? (won ? "SIEG!" : "NIEDERLAGE") : `SPIELER ${winner + 1} GEWINNT`
        title.className = "res-title " + (solo ? (won ? "win" : "lose") : "p" + (winner + 1))
        const opp = match.fighters[1]
        $("#resSub").textContent = solo
            ? `gegen ${opp.champ.name} · ${DIFFICULTIES[App.config.difficulty].name}`
            : `${match.fighters[winner].champ.name} beherrscht die Arena`
        $("#resScore").innerHTML = `<span class="p1">${match.wins[0]}</span><i>:</i><span class="p2">${match.wins[1]}</span>`

        this.resPreviews = this.resPreviews || []
        for (const f of match.fighters) {
            const el = $(`.res-fighter[data-side="${f.side}"]`)
            el.classList.toggle("winner", f.side === winner)
            $(".res-name", el).textContent = solo ? (f.side === 0 ? "Du · " : "Bot · ") + f.champ.name : `P${f.side + 1} · ${f.champ.name}`
            const anim = f.side === winner ? "attack" + (f.champ.combo.length - 1) : "death"
            if (!this.resPreviews[f.side]) {
                this.resPreviews[f.side] = new SpritePreview($("canvas", el), f.champId, anim, { zoom: 1.2, flip: f.side === 1 })
            } else {
                this.resPreviews[f.side].set(f.champId, anim)
            }
        }

        const rows = [
            ["Schaden", "damage"], ["Treffer", "hits"], ["Beste Kombo", "maxCombo"],
            ["Fähigkeiten", "abilities"], ["Ausgewichen", "dodges"], ["Geblockt", "blocked"]
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
        $("#resNote").textContent = note || ""
        this.show("results")
    }
}

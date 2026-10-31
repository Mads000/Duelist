// ============================================================
//  UI – Bildschirme, Auswahl, HUD, Banner, VS, Ergebnisse
// ============================================================

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

const STAT_LABELS = { tempo: "Tempo", kraft: "Kraft", reichweite: "Reichweite" }
const TIPS = [
    "Kurz vor dem Treffer blocken = PERFEKT: kein Schaden, der Gegner taumelt.",
    "Leicht + Schwer gleichzeitig nah am Gegner = Wurf. Geht durch jede Deckung.",
    "Triff den Gegner, während er ausholt – Konter machen 40 % mehr Schaden.",
    "Dash macht kurz unverwundbar – perfekt gegen Bomben und Feuerbälle.",
    "Schwere Angriffe leeren die Deckung. Ist sie leer: GUARD BREAK!",
    "Hinter Säulen bist du vor Feuerbällen sicher.",
    "Kisten zerschlagen = Power-up.",
    "Je weniger Leben, desto weiter fliegst du – pass am Rand auf!",
    "Zum Gegner drücken + Schwer = Spezialangriff deines Champions.",
    "Mit Gold aus jedem Match kaufst du im Shop neue Skins.",
    "Siege gegen stärkere Bots bringen mehr Rangpunkte.",
    "Der erste Sieg des Tages bringt extra XP und Gold.",
    "Wertung S gibt es nur mit viel Leben, Kombos, Kontern und perfekten Blocks."
]
const randomTip = () => TIPS[Math.floor(Math.random() * TIPS.length)]

const SINGLE_PICK_MODES = ["quick", "arcade", "training", "online", "team"]

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

        // Hauptmenü: kurze Erklärung zum Modus unter dem Mauszeiger / Fokus
        const info = $("#menuInfo")
        const explain = btn => {
            const [name, ...rest] = btn.dataset.info.split(": ")
            info.innerHTML = `<b>${name}</b> ${rest.join(": ")}`
        }
        for (const btn of $$("#screen-menu [data-info]")) {
            btn.addEventListener("mouseenter", () => explain(btn))
            btn.addEventListener("focus", () => explain(btn))
        }
        explain($(".menu-arcade"))

        this.buildLore()
        this.buildSettings()
        this.buildSelect()
        this.renderRecord()

        $("#fightBtn").addEventListener("click", () => this.confirmSelection())
        $("#pfNew").addEventListener("click", () => { ProfileUI.panel = { mode: "new" }; ProfileUI.renderPanel() })
        $("#pfManage").addEventListener("click", () => { ProfileUI.panel = { mode: "manage" }; ProfileUI.renderPanel() })
        $("#pfReceive").addEventListener("click", () => { ProfileUI.panel = { mode: "receive" }; ProfileUI.renderPanel() })
        $("#resumeBtn").addEventListener("click", () => App.resume())
        $("#restartBtn").addEventListener("click", () => App.restart())
        $("#quitBtn").addEventListener("click", () => App.quitToMenu())
        $("#pauseSettingsBtn").addEventListener("click", () => {
            this.backTarget.settings = "pause"
            this.show("settings")
        })
        $("#rematchBtn").addEventListener("click", () => App.restart())
        $("#changeBtn").addEventListener("click", () => App.go(App.config.mode === "quick" ? "quickpick" : App.config.mode))
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
        $("#onlineHostBtn").addEventListener("click", () => Net.host())
        $("#onlineJoinBtn").addEventListener("click", () => Net.join($("#onlineJoinCode").value))
        $("#onlineJoinCode").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
        $("#onlineJoinCode").addEventListener("keydown", e => { if (e.key === "Enter") Net.join(e.target.value) })
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
        if (id === "shop") Shop.render()
        if (id === "lessons") this.renderLessons()
        if (id === "profiles") ProfileUI.render()
        if (id === "trainhub") {
            const n = (PlayerRecord.data.lessons || []).filter(isUnlocked).length
            $("#lessonCount").textContent = `Kombo, Spezialangriff und Fähigkeit jedes Champions – ${n}/${playableChampions().length} gelernt.`
        }
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
        $("#menuProfile").innerHTML = Progress.profileHtml()
        $("#tileMissions").innerHTML = Progress.missionsHtml()
        this.renderRankTile()
        this.renderShopTile()
        const field = $("#playerName")
        field.value = playerName()
        // Name des Profils ändern (leer lassen = alter Name bleibt)
        field.addEventListener("change", () => {
            Profiles.rename(Profiles.data.current, field.value)
            field.value = playerName()
        })
        field.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") field.blur() })
        $("#menuProfile .gold-pill").addEventListener("click", () => App.go("shop"))
        $("#profileSwitch").addEventListener("click", () => App.go("profiles"))
        this.renderQuickChamp()
    },

    renderRankTile() {
        const r = Shop.rank()
        const best = (PlayerRecord.data.highscores.arcade || [])[0]
        $("#tileRank").innerHTML = `<span class="tile-head"><small>Dein Rang</small></span>
            <span class="rank-badge big" style="--rank:${r.color}">${r.name}</span>
            <span class="xp-bar rank-bar"><i style="transform:scaleX(${r.progress})"></i></span>
            <span class="tile-foot">${r.next ? `${Shop.data.rp} / ${r.next.rp} RP bis ${r.next.name}` : `${Shop.data.rp} RP · Höchster Rang!`}<br>Arcade-Rekord: ${best ? best.score : "–"}</span>`
    },

    // Kachel: ein Skin, den man noch nicht hat (zuerst für den eigenen Champion)
    renderShopTile() {
        const tile = $("#tileShop")
        const mine = isUnlocked(App.config.champs[0]) ? App.config.champs[0] : "vanguard"
        const champs = [mine, ...playableChampions().filter(id => id !== mine)]
        let offer = null
        for (const id of champs) {
            const skin = SKINS.find(s => !Shop.owns(id, s.id))
            if (skin) {
                offer = { id, skin }
                break
            }
        }
        if (!this.shopPreview) this.shopPreview = new SpritePreview($("canvas", tile), mine, "idle", { zoom: 1.3 })
        if (!offer) {
            this.shopPreview.set(mine, "idle", Shop.equipped(mine))
            $(".tile-text", tile).innerHTML = `<small>Shop</small><b>Alle Skins gesammelt!</b>`
            return
        }
        this.shopPreview.set(offer.id, "idle", offer.skin.id)
        const afford = Shop.data.gold >= offer.skin.price
        $(".tile-text", tile).innerHTML = `<small>Neu im Shop</small><b>${offer.skin.name}-${CHAMPIONS[offer.id].name}</b>
            <em><span class="gold-coin"></span>${offer.skin.price}${afford ? " · Jetzt kaufen!" : ""}</em>`
    },

    // Training → Champions kennenlernen
    renderLessons() {
        const done = PlayerRecord.data.lessons || []
        const grid = $("#lessonGrid")
        grid.innerHTML = ""
        for (const id of playableChampions()) {
            const c = CHAMPIONS[id]
            const card = document.createElement("button")
            card.className = "shop-card glass lesson-card" + (done.includes(id) ? " owned" : "")
            card.innerHTML = `<canvas width="150" height="150"></canvas>
                <div class="shop-name">${c.name}</div>
                <small>${c.role} · ${c.special.name}</small>
                <span class="lesson-state">${done.includes(id) ? "✔ Gelernt" : "+100 Gold"}</span>`
            grid.appendChild(card)
            const preview = new SpritePreview($("canvas", card), id, "idle", { zoom: 1.1 })
            preview.set(id, "idle", Shop.equipped(id))
            card.addEventListener("pointerenter", () => preview.set(id, "heavy"))
            card.addEventListener("click", () => Tutorial.begin(id))
        }
    },

    // Schnelles Match: zeigt, mit wem man gleich kämpft
    renderQuickChamp() {
        const id = isUnlocked(App.config.champs[0]) ? App.config.champs[0] : "vanguard"
        $("#quickName").textContent = CHAMPIONS[id].name
        if (!this.quickPreview) this.quickPreview = new SpritePreview($("#quickPortrait"), id, "idle", { zoom: 1.25 })
        if (this.quickPreview.champId !== id || this.quickPreview.skin !== Shop.equipped(id)) this.quickPreview.set(id, "idle", Shop.equipped(id))
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
            <div><b>${who}${who ? c.name + " · " : ""}Ability: ${a.name}</b><p>${a.text}</p>${c.special ? `<p class="sp-line"><b>Spezial (zum Gegner + Schwer): ${c.special.name}</b> – ${c.special.text}</p>` : ""}</div>
        </div>`
    },

    // ---------------- Online-Duell ----------------
    renderOnline() {
        const st = Net.status
        const hosting = Net.role === "host"
        $("#onlineCode").textContent = hosting && st !== "error" ? Net.code : "····"
        $("#onlineHostStatus").textContent = !hosting ? "" : st === "waiting" ? "Warte auf den Gegner … Gib ihm diesen Code." : st === "error" ? Net.error : ""
        $("#onlineJoinStatus").textContent = Net.role === "guest" ? (st === "connecting" ? "Verbinde …" : st === "error" ? Net.error : "") : ""
        $("#onlineHostBtn").textContent = hosting ? "Neuen Code erstellen" : "Raum erstellen"
    },

    // ---------------- Tastenbelegung ----------------
    buildKeys() {
        const tab = this.keyTab || "solo"
        $$("#keyTabs button").forEach(b => b.classList.toggle("on", b.dataset.map === tab))
        const m = keymap(tab)
        $("#keyList").innerHTML = KEY_ACTIONS.map(([a, label]) =>
            `<div class="key-row"><span>${label}</span><button class="btn small key-btn" data-action="${a}">${keyLabel(m[a][0])}</button></div>`).join("")
        for (const btn of $$("#keyList .key-btn")) btn.addEventListener("click", () => this.captureKey(tab, btn))
    },

    captureKey(map, btn) {
        btn.textContent = "Taste …"
        btn.classList.add("waiting")
        const onKey = e => {
            e.preventDefault()
            e.stopImmediatePropagation()
            window.removeEventListener("keydown", onKey, true)
            btn.classList.remove("waiting")
            if (e.code !== "Escape") {
                const all = readStorage("duelist.keys", {})
                const custom = all[map] || {}
                // dieselbe Taste nicht doppelt belegen
                for (const a of Object.keys(custom)) if (custom[a] === e.code) delete custom[a]
                custom[btn.dataset.action] = e.code
                all[map] = custom
                writeStorage("duelist.keys", all)
                Sound.play("select")
            }
            this.buildKeys()
        }
        window.addEventListener("keydown", onKey, true)
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
        for (const b of $$("#keyTabs button")) b.addEventListener("click", () => {
            this.keyTab = b.dataset.map
            this.buildKeys()
        })
        $("#resetKeys").addEventListener("click", () => {
            const all = readStorage("duelist.keys", {})
            delete all[this.keyTab || "solo"]
            writeStorage("duelist.keys", all)
            this.buildKeys()
            this.toast("Tastenbelegung zurückgesetzt")
        })
        this.buildKeys()
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
        const vsBot = m === "solo" || m === "team"
        const pill = $("#selStep")
        pill.textContent = st.step === 0 ? (vsBot || st.single ? "Wähle deinen Champion" : "Spieler 1 wählt")
            : st.step === 1 ? (vsBot ? "Wähle den Gegner" : "Spieler 2 wählt") : "Bereit?"
        pill.className = "step-pill " + (st.step === 0 ? "p1" : st.step === 1 ? "p2" : "ready")

        // Wer steuert womit? (Handy wird automatisch erkannt)
        const input = slot => Link.padFor(slot) ? "📱 Handy" : slot === 0 ? (isTouchDevice() ? "Touch / WASD" : "WASD + E F Q R") : "Pfeile + Numpad"
        $("#selTag0").innerHTML = (m === "local" ? "PLAYER 1" : "DU") + (m === "local" ? `<small>${input(0)}</small>` : "")
        if (m === "online") $("#selTag0").innerHTML = `DU<small>${Net.role === "host" ? "Host · wählt die Map" : "Gast"}</small>`
        $("#selTag1").innerHTML = m === "local" ? `PLAYER 2<small>${input(1)}</small>` : m === "training" ? "TRAININGSPUPPE" : "BOT · " + DIFFICULTIES[App.config.difficulty].name.toUpperCase()
        $(".sel-side[data-side='1']").hidden = st.single
        $(".sel-stage").style.gridTemplateColumns = st.single ? "minmax(0,1fr) minmax(0,2.1fr)" : ""

        $("#difficulty").hidden = !vsBot
        $("#mapPick").hidden = !(["solo", "local", "training", "team"].includes(m) || (m === "online" && Net.role === "host"))
        $("#dummyPick").hidden = m !== "training"
        $("#chaosToggle").hidden = !["solo", "local", "team"].includes(m)
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
        if (st.mode === "online") {
            App.config.champs[0] = st.picks[0]
            $("#fightBtn").disabled = true
            return Net.pick(st.picks[0], App.config.map)
        }
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
        this.hudCache = { hp: [-1, -1], lag: [-1, -1], energy: [-1, -1], guard: [-1, -1], wins: [-1, -1], sp: [null, null], timer: -1, ready: [null, null] }
        this.hudPreviews = this.hudPreviews || []
        for (const f of match.leads) {
            const el = $(`.hud-player[data-side="${f.side}"]`)
            let name = f.champ.name
            if (match.humanCount === 1 && f.side === 1) name += match.training ? " <small>Training</small>" : ` <small>BOT · ${DIFFICULTIES[match.leads[1].controller.diff ? match.leads[1].controller.diff.id : "normal"].name}</small>`
            if (match.team2) {
                const mate = match.fighters.find(m => m.side === f.side && m !== f)
                name = `${f.champ.name} <small>& ${mate.champ.name}</small>`
            }
            $(".hud-name", el).innerHTML = name
            $(".hp-text", el).textContent = match.localSide !== undefined ? (f.side === match.localSide ? playerName() || "Du" : "Gegner (online)")
                : match.humanCount === 2 ? `Player ${f.side + 1}` : f.side === 0 ? playerName() || "Player 1" : (match.training ? "Dummy" : "CPU")
            $(".energy", el).innerHTML = Array.from({ length: f.maxEnergy }, (_, i) =>
                `<i class="${i === f.champ.ability.cost - 1 ? "cost" : ""}"></i>`).join("") +
                `<img src="${ASSET_ROOT}${f.champ.ability.icon}" alt=""><span class="sp" title="Spezialangriff bereit">SP</span>`
            $(".hud-wins", el).innerHTML = match.training ? "" : Array.from({ length: match.roundsToWin }, () => "<i></i>").join("")
            if (!this.hudPreviews[f.side]) this.hudPreviews[f.side] = new SpritePreview($(".hud-portrait", el), f.champId, "idle", { zoom: 1.9, flip: f.side === 1 })
            this.hudPreviews[f.side].set(f.champId, "idle", f.skin)
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
        const keys = name => {
            const m = keymap(name)
            const move = [m.up, m.left, m.down, m.right].map(l => keyLabel(l[0])).join("")
            return [k(move.length === 4 ? move : "Pfeile", "Laufen"), k(keyLabel(m.light[0]), "Leicht"), k(keyLabel(m.heavy[0]), "Schwer"), k(keyLabel(m.dash[0]), "Dash"), k(keyLabel(m.block[0]), "Block"), k(keyLabel(m.ability[0]), "Fähigkeit").replace("<span>", '<span class="ab-key">')]
        }
        const layouts = match.localSide !== undefined
            ? (match.localSide === 0 ? [keys("solo"), null] : [null, keys("solo")])
            : match.humanCount === 2 ? [keys("p1"), keys("p2")] : [[...keys("solo"), k("Esc", "Pause")], null]
        for (const side of [0, 1]) {
            const el = $(`.hud-keys[data-side="${side}"]`)
            const keys = layouts[side]
            const show = keys && !isTouchDevice() && !Link.padFor(side) && match.leads[side].isHuman
            el.hidden = !show
            if (show) el.innerHTML = `<b>${match.humanCount === 2 && match.localSide === undefined ? "P" + (side + 1) : "Steuerung"}</b>${keys.join("")}<small>Zum Gegner + Schwer = Spezialangriff · Hoch/Runter + Angriff = nach oben/unten</small>`
        }
    },

    updateHud(match) {
        const c = this.hudCache
        if (!c) return
        for (const f of match.leads) {
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
                $(`.hud-keys[data-side="${f.side}"]`).classList.toggle("ready", f.abilityReady)
                if (f.side === 0) this.updateTouchAbility(f)
            }
            const sp = f.specialReady
            if (c.sp[f.side] !== sp) {
                c.sp[f.side] = sp
                $(".energy .sp", el).classList.toggle("on", sp)
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
        const word = count >= 10 ? "UNGLAUBLICH!" : count >= 8 ? "BRUTAL!" : count >= 5 ? "STARK!" : count >= 3 ? "GUT!" : ""
        el.innerHTML = `<b>${count}</b> HITS${word ? `<em>${word}</em>` : ""}<small>${damage} Schaden</small>`
        el.className = "combo" + (count >= 8 ? " huge" : count >= 5 ? " big" : "")
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
        match.leads.forEach((f, i) => {
            const side = $(`.vs-side.p${i + 1}`, vs)
            $(".vs-name", side).textContent = f.champ.name
            $(".vs-sub", side).textContent = match.humanCount === 2 ? `Player ${i + 1}` : i === 0 ? (playerName() || "Du") : (match.training ? "Trainingspuppe" : "CPU · " + (f.controller.diff ? f.controller.diff.name : ""))
            if (!this.vsPreviews[i]) this.vsPreviews[i] = new SpritePreview($("canvas", side), f.champId, "idle", { zoom: 1.2, flip: i === 1 })
            this.vsPreviews[i].set(f.champId, "idle", f.skin)
        })
        $(".vs-tip", vs).textContent = match.training ? "" : "Tipp: " + randomTip()
        $(".vs-map", vs).textContent = (match.rules.stage ? match.rules.stage + " · " : "") + match.map.name + (match.rules.chaos ? " · CHAOS" : "")
        vs.className = ""
        void vs.offsetWidth
        vs.className = "show"
        document.body.classList.add("vs-on")
        Sound.play("select")
        clearTimeout(this.vsTimer)
        clearTimeout(this.vsHudTimer)
        // HUD blendet ein, während die VS-Tafel ausblendet
        this.vsHudTimer = setTimeout(() => document.body.classList.remove("vs-on"), 1850)
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
        // ohne frühere Initialen: die ersten Buchstaben des eigenen Namens
        const fromName = playerName().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)
        if (last.length === 3) last.forEach((l, i) => { letters[i] = l })
        else if (fromName) [...fromName].forEach((l, i) => { letters[i] = l })
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
        const r = PlayerRecord.data
        const total = r.wins + r.losses
        const fav = Object.entries(r.byChampion || {}).sort((x, y) => (y[1].w + y[1].l) - (x[1].w + x[1].l))[0]
        $("#profileBoard").innerHTML = [
            ["Level", Progress.data.level],
            ["Siege / Niederlagen", `${r.wins} / ${r.losses}`],
            ["Siegquote", total ? Math.round(r.wins / total * 100) + " %" : "–"],
            ["Beste Siegesserie", r.bestStreak],
            ["Lieblings-Champion", fav && CHAMPIONS[fav[0]] ? CHAMPIONS[fav[0]].name : "–"],
            ["Arcade geschafft", (r.arcadeClears || 0) + "×"]
        ].map(([k, v]) => `<div class="rc-row"><span>${k}</span><b>${v}</b></div>`).join("")
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
        const online = match.localSide !== undefined
        const solo = match.humanCount === 1 || online
        const me = online ? match.localSide : 0
        const won = winner === me
        $("#screen-results").classList.toggle("lost", solo && !won)
        this.hideBanner()
        const t = $("#resTitle")
        t.textContent = title || (solo ? (won ? "SIEG!" : "NIEDERLAGE") : `PLAYER ${winner + 1} GEWINNT`)
        t.className = "res-title " + (solo ? (won ? "win" : "lose") : "p" + (winner + 1))
        const opp = match.leads[1 - me]
        $("#resSub").textContent = sub || (solo
            ? `gegen ${opp.champ.name} · ${match.map.name}`
            : `${match.team2 ? (winner === 0 ? "Team Blau" : "Team Rot") : match.leads[winner].champ.name} beherrscht die Arena`)
        $("#resScore").innerHTML = `<span class="p1">${match.wins[0]}</span><i>:</i><span class="p2">${match.wins[1]}</span>`

        // Sieger groß und im Licht, Verlierer grau daneben
        this.resPreviews = this.resPreviews || []
        for (const f of match.leads) {
            const el = $(`.res-fighter[data-side="${f.side}"]`)
            el.classList.toggle("winner", f.side === winner)
            el.classList.toggle("loser", f.side !== winner)
            $(".res-name", el).textContent = solo ? (f.side === me ? (playerName() || "Du") + " · " : (online ? "Gegner · " : "CPU · ")) + f.champ.name : `P${f.side + 1} · ${f.champ.name}`
            if (!this.resPreviews[f.side]) this.resPreviews[f.side] = new SpritePreview($("canvas", el), f.champId, "idle", { zoom: 1.2, flip: f.side === 1 })
            this.resPreviews[f.side].set(f.champId, f.side === winner ? "heavy" : "death", f.skin)
        }
        // Sieger-Pose: schlägt immer wieder zu
        clearInterval(this.resLoop)
        const champ = match.leads[winner]
        this.resLoop = setInterval(() => {
            if (this.current !== "results") return clearInterval(this.resLoop)
            this.resPreviews[winner].set(champ.champId, "heavy", champ.skin)
        }, 2600)

        // Wertung (aus Sicht des eigenen bzw. des siegreichen Spielers)
        const gradeSide = solo ? me : winner
        const grade = this.grade(match, gradeSide, winner === gradeSide)
        const g = $("#resGrade")
        g.className = "res-grade g-" + grade
        $("b", g).textContent = grade
        setTimeout(() => { if (this.current === "results") Sound.play(grade === "S" || grade === "A" ? "perfect" : "guard") }, 1100)

        const rows = [
            ["Schaden", "damage"], ["Treffer", "hits"], ["Beste Kombo", "maxCombo"], ["Konter", "counters"],
            ["Geblockt", "blocked"], ["Perfekt geblockt", "perfect"], ["Ausgewichen", "dodges"], ["Fähigkeiten", "abilities"]
        ]
        const [a, b] = match.leads
        $("#resStats").innerHTML = rows.map(([label, key], i) => {
            const va = Math.round(a.stats[key])
            const vb = Math.round(b.stats[key])
            const max = Math.max(1, va, vb)
            return `<div class="rs-row" style="--d:${(0.5 + i * 0.07).toFixed(2)}s">
                <span class="rs-val p1 ${va > vb ? "best" : ""}">${va}</span>
                <div class="rs-bar left"><i style="width:${va / max * 100}%"></i></div>
                <span class="rs-label">${label}</span>
                <div class="rs-bar"><i style="width:${vb / max * 100}%"></i></div>
                <span class="rs-val p2 ${vb > va ? "best" : ""}">${vb}</span>
            </div>`
        }).join("")
        $("#resNote").textContent = note
        this.showRewards()
        this.confetti(!solo || won)
        $("#rematchBtn").textContent = rematch
        $("#changeBtn").hidden = !change
        this.wipe()
        this.show("results")
    },

    // S bis D – Sieg, übrige Lebenspunkte, Kombos, Konter und perfekte Blocks zählen
    grade(match, side, won) {
        const f = match.leads[side]
        const s = f.stats
        const lostRounds = match.wins[1 - side]
        const p = (won ? 45 + f.hp / f.maxHp * 25 : 10) + Math.min(10, s.maxCombo) * 1.5 +
            Math.min(5, s.counters) * 2 + Math.min(5, s.perfect) * 2 - lostRounds * 8
        return p >= 80 ? "S" : p >= 65 ? "A" : p >= 48 ? "B" : p >= 30 ? "C" : "D"
    },

    // Belohnungen: XP, Gold und Rang zählen hoch
    showRewards() {
        const p = this.progressInfo
        this.progressInfo = null
        const box = $("#resProgress")
        box.hidden = !p
        $(".res-cols").classList.toggle("single", !p)
        if (!p) return
        const d = Progress.data
        const r = p.rank
        const rb = r && Shop.rank(r.before)
        const ra = r && Shop.rank(r.after)
        const diff = r ? r.after - r.before : 0
        box.innerHTML = `
            <div class="rw-row"><span class="rw-icon">XP</span><b class="rw-num" data-to="${p.xp}">+0</b>
                <b class="rw-level">LEVEL ${p.start.level}</b><div class="xp-bar"><i style="transform:scaleX(${p.start.xp / Progress.need(p.start.level)})"></i></div></div>
            <div class="rw-row"><span class="gold-coin big"></span><b class="rw-num gold" data-to="${p.gold}">+0</b>
                <span class="rw-total">Gold gesamt: ${Shop.data.gold}</span></div>
            ${r ? `<div class="rw-row"><span class="rank-badge" style="--rank:${rb.color}">${rb.name}</span><b class="rw-rp${diff < 0 ? " minus" : ""}">${diff >= 0 ? "+" : ""}${diff} RP</b>
                <div class="xp-bar rank-bar"><i style="transform:scaleX(${rb.progress})"></i></div></div>` : ""}
            <div class="rw-up" hidden></div>
            <div class="rp-lines">${p.lines.map((l, i) => `<span style="--d:${(1.4 + i * 0.15).toFixed(2)}s">${l}</span>`).join("")}</div>`

        const ups = []
        if (p.levelUp) ups.push(`LEVEL UP! ${p.levelUp}`)
        if (r && ra.index > rb.index) ups.push(`NEUER RANG: ${ra.name.toUpperCase()}!`)
        const setBar = (bar, k, instant = false) => {
            if (instant) {
                bar.style.transition = "none"
                bar.style.transform = `scaleX(${k})`
                void bar.offsetWidth
                bar.style.transition = ""
            } else bar.style.transform = `scaleX(${k})`
        }
        // kurz warten, bis der Bildschirm eingeblendet ist
        setTimeout(() => {
            for (const el of $$(".rw-num", box)) this.countUp(el, +el.dataset.to)
            const xpBar = $(".rw-row .xp-bar i", box)
            setBar(xpBar, p.levelUp ? 1 : d.xp / Progress.need(d.level))
            if (p.levelUp) setTimeout(() => {
                $(".rw-level", box).textContent = `LEVEL ${d.level}`
                setBar(xpBar, 0, true)
                setBar(xpBar, d.xp / Progress.need(d.level))
            }, 700)
            if (r) {
                const bar = $(".rank-bar i", box)
                const changed = ra.index !== rb.index
                setBar(bar, changed ? (ra.index > rb.index ? 1 : 0) : ra.progress)
                if (changed) setTimeout(() => {
                    const badge = $(".rank-badge", box)
                    badge.textContent = ra.name
                    badge.style.setProperty("--rank", ra.color)
                    badge.classList.add("pop")
                    setBar(bar, ra.index > rb.index ? 0 : 1, true)
                    setBar(bar, ra.progress)
                }, 700)
            }
            if (ups.length) setTimeout(() => {
                const up = $(".rw-up", box)
                up.innerHTML = ups.map(u => `<span>${u}</span>`).join("")
                up.hidden = false
                Sound.play("victory")
            }, 1000)
        }, 500)
    },

    countUp(el, to, ms = 900) {
        const start = performance.now()
        const ticks = Math.max(1, to / 8)
        let last = 0
        const step = now => {
            const k = Math.min(1, (now - start) / ms)
            const v = Math.round(to * (1 - Math.pow(1 - k, 3)))
            el.textContent = "+" + v
            if (Math.floor(v / ticks) !== Math.floor(last / ticks)) Sound.play("score")
            last = v
            if (k < 1) requestAnimationFrame(step)
            else if (el.classList.contains("gold")) Sound.play("coin")
        }
        requestAnimationFrame(step)
    },

    confetti(on) {
        const box = $("#resConfetti")
        box.innerHTML = ""
        if (!on) return
        const colors = ["#ffd84a", "#ff6a5a", "#6aa2ff", "#7dffa1", "#ffffff", "#c9a5ff"]
        for (let i = 0; i < 60; i++) {
            const c = document.createElement("i")
            c.style.left = (Math.random() * 100).toFixed(1) + "%"
            c.style.background = colors[i % colors.length]
            c.style.animationDelay = (Math.random() * 1.6).toFixed(2) + "s"
            c.style.animationDuration = (2.4 + Math.random() * 2).toFixed(2) + "s"
            c.style.setProperty("--x", (Math.random() * 160 - 80).toFixed(0) + "px")
            c.style.setProperty("--r", (Math.random() * 720 - 360).toFixed(0) + "deg")
            box.appendChild(c)
        }
    },

    // Übergang: diagonaler Streifen wischt über den Bildschirm
    wipe() {
        const w = $("#wipe")
        w.classList.remove("go")
        void w.offsetWidth
        w.classList.add("go")
    }
}

function pickRandomChamp(exclude = []) {
    const pool = playableChampions().filter(id => !exclude.includes(id) && !CHAMPIONS[id].boss)
    return pool[Math.floor(Math.random() * pool.length)] || "vanguard"
}

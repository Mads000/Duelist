// ============================================================
//  App – Spielschleife, Bildschirm-Wechsel, Matches starten
// ============================================================

const params = new URLSearchParams(location.search)

const App = {
    canvas: document.getElementById("game"),
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    match: null,
    demo: null,
    controllers: [],
    touch: null,
    state: "loading",
    config: {
        mode: "solo",
        champs: ["vanguard", "warbrute"],
        difficulty: "normal",
        randomOpp: true
    },

    async boot() {
        this.ctx = this.canvas.getContext("2d")
        this.loadConfig()
        Keyboard.init()
        Sound.setVolumes(GameSettings.get())
        document.body.classList.toggle("is-touch", isTouchDevice())
        this.resize()
        window.addEventListener("resize", () => this.resize())
        window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 200))
        document.addEventListener("visibilitychange", () => {
            if (document.hidden && this.state === "game") this.pause()
        })

        UI.init()
        this.touch = new TouchSource(document.getElementById("touch"))
        this.bindGlobalKeys()

        await loadAllAssets(p => {
            document.getElementById("loadFill").style.transform = `scaleX(${p})`
        })
        document.getElementById("loadText").textContent = "Bereit!"

        this.startDemo()
        this.last = performance.now()
        requestAnimationFrame(t => this.loop(t))

        // Alte Links (?player1=Soldier&player2=Orc) starten direkt ein lokales Duell
        const legacy1 = resolveChampion(params.get("player1"))
        const legacy2 = resolveChampion(params.get("player2"))
        const auto = params.get("autostart")
        if (legacy1 && legacy2) {
            this.config = { ...this.config, mode: "local", champs: [legacy1, legacy2] }
            this.startMatch()
        } else if (auto) {
            this.config.mode = auto === "local" ? "local" : "solo"
            this.config.champs = [resolveChampion(params.get("p1")) || "vanguard", resolveChampion(params.get("p2")) || "warbrute"]
            if (params.get("bot")) this.config.difficulty = params.get("bot")
            this.startMatch()
        } else {
            this.setState("title")
            UI.show("title")
            const start = () => {
                if (this.state !== "title") return
                Sound.unlock()
                Music.play("menu")
                this.setState("menu")
                UI.show("menu")
            }
            document.getElementById("screen-title").addEventListener("pointerup", start)
            Keyboard.listeners.add(code => { if (code !== "Escape") start() })
        }

        if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
            navigator.serviceWorker.register("sw.js").catch(() => {})
        }
    },

    loadConfig() {
        this.config = readStorage("duelist.lastConfig", this.config)
        if (!CHAMPIONS[this.config.champs[0]]) this.config.champs = ["vanguard", "warbrute"]
        if (!DIFFICULTIES[this.config.difficulty]) this.config.difficulty = "normal"
    },

    setState(s) {
        this.state = s
        document.body.classList.toggle("in-game", s === "game" || s === "paused")
        const inMatch = s === "game"
        document.getElementById("hud").hidden = !(s === "game" || s === "paused")
        document.getElementById("pauseBtn").hidden = !inMatch
        const showTouch = inMatch && isTouchDevice()
        document.getElementById("touch").hidden = !showTouch
        if (!showTouch && this.touch) this.touch.reset()
        document.getElementById("shade").className = (s === "game" || s === "paused") ? "" : "menu"
    },

    // ---------------- Navigation ----------------
    go(target) {
        Sound.unlock()
        // Vom Ergebnis-Bildschirm aus: altes Match verwerfen, Demo läuft wieder im Hintergrund
        if (this.match && this.state !== "game" && this.state !== "paused") {
            this.match = null
            this.startDemo()
        }
        if (target === "solo" || target === "local") {
            if (target === "local" && isTouchDevice() && !navigator.getGamepads?.()?.filter(Boolean).length) {
                UI.toast("Lokales Duell braucht Tastatur oder Gamepads – Touch steuert Spieler 1")
            }
            this.setState("select")
            UI.openSelect(target)
            return
        }
        if (target === "settings") UI.backTarget.settings = this.state === "paused" ? "pause" : "menu"
        UI.show(target)
    },

    back() {
        const cur = UI.current
        if (cur === "select" && UI.select && UI.select.step > 0) {
            UI.select.step--
            UI.select.picks[UI.select.step] = null
            UI.renderSelect()
            return
        }
        if (cur === "settings" && UI.backTarget.settings === "pause") {
            UI.backTarget.settings = null
            UI.show("pause")
            return
        }
        this.setState("menu")
        UI.show("menu")
    },

    bindGlobalKeys() {
        Keyboard.listeners.add(code => {
            if (code !== "Escape") return
            if (this.state === "game") this.pause()
            else if (this.state === "paused" && UI.current === "pause") this.resume()
            else if (UI.current && !["title", "menu", "results", "loading"].includes(UI.current)) this.back()
        })
    },

    // ---------------- Matches ----------------
    buildControllers(mode) {
        for (const c of this.controllers) c.destroy()
        const useTouch = isTouchDevice() ? [this.touch] : []
        if (mode === "solo") {
            this.controllers = [
                new Controller([new KeyboardSource(KEYMAPS.solo), new GamepadSource("any"), ...useTouch]),
                new BotController(this.config.difficulty)
            ]
            if (params.get("p1bot")) this.controllers[0] = new BotController("hard")
        } else {
            this.controllers = [
                new Controller([new KeyboardSource(KEYMAPS.p1), new GamepadSource(0), ...useTouch]),
                new Controller([new KeyboardSource(KEYMAPS.p2), new GamepadSource(1)])
            ]
        }
        return this.controllers
    },

    startMatch() {
        Sound.unlock()
        writeStorage("duelist.lastConfig", this.config)
        const { mode, champs } = this.config
        this.demo = null
        this.match = new Match({
            mode,
            champs,
            controllers: this.buildControllers(mode),
            humans: [true, mode === "local"],
            settings: { ...GameSettings.get() },
            onEvent: (type, data, m) => this.onMatchEvent(type, data, m)
        })
        if (params.get("p1bot")) this.match.fighters[0].controller.attach(this.match.fighters[0], this.match.fighters[1], this.match)
        this.match.setView(this.w, this.h)
        UI.buildHud(this.match)
        UI.hideBanner()
        this.setState("game")
        UI.show("none")
        Music.play("battle")
        this.requestFullscreen()
    },

    restart() {
        if (this.config.randomOpp && this.config.mode === "solo") {
            this.config.champs[1] = CHAMPION_ORDER[Math.floor(Math.random() * CHAMPION_ORDER.length)]
        }
        this.startMatch()
    },

    pause() {
        if (this.state !== "game" || !this.match) return
        this.match.paused = true
        this.setState("paused")
        UI.show("pause")
        this.touch.reset()
    },

    resume() {
        if (this.state !== "paused" || !this.match) return
        this.match.paused = false
        this.last = performance.now()
        this.setState("game")
        UI.show("none")
    },

    quitToMenu() {
        this.match = null
        UI.hideBanner()
        this.startDemo()
        this.setState("menu")
        UI.show("menu")
        Music.play("menu")
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
    },

    onMatchEvent(type, data, match) {
        if (match !== this.match) return
        switch (type) {
            case "banner":
                UI.banner(data)
                break
            case "combo":
                UI.combo(data.fighter.side, data.count)
                break
            case "abilityDenied":
                UI.denyAbility(data.side)
                break
            case "pauseRequest":
                this.pause()
                break
            case "matchEnd":
                setTimeout(() => this.finishMatch(match, data.winner), 900)
                break
        }
    },

    finishMatch(match, winner) {
        if (match !== this.match) return
        let note = ""
        if (match.mode === "solo") {
            PlayerRecord.addSoloResult(winner === 0, this.config.difficulty, match.fighters[0].champId)
            const s = PlayerRecord.data.streak
            if (winner === 0 && s >= 2) note = `🔥 ${s} Siege in Folge!`
        }
        Music.play("menu")
        this.setState("results")
        UI.showResults(match, winner, note)
        Sound.play(match.mode === "solo" && winner !== 0 ? "defeat" : "victory")
    },

    // Demo-Kampf (Bot gegen Bot) als lebendiger Menü-Hintergrund
    startDemo() {
        const pick = () => CHAMPION_ORDER[Math.floor(Math.random() * CHAMPION_ORDER.length)]
        let a = pick()
        let b = pick()
        if (a === b) b = CHAMPION_ORDER[(CHAMPION_ORDER.indexOf(a) + 1) % CHAMPION_ORDER.length]
        const demo = new Match({
            mode: "demo",
            champs: [a, b],
            controllers: [new BotController("hard"), new BotController("hard")],
            settings: { ...DEFAULT_SETTINGS, rounds: 3, roundTime: 60, shake: false, vibration: false },
            onEvent: type => {
                if (type === "matchEnd" && this.demo === demo) setTimeout(() => { if (this.demo === demo) this.startDemo() }, 1500)
            }
        })
        demo.setView(this.w, this.h)
        this.demo = demo
    },

    requestFullscreen() {
        if (!isTouchDevice() || !GameSettings.get().fullscreen) return
        const el = document.documentElement
        if (document.fullscreenElement || !el.requestFullscreen) return
        el.requestFullscreen({ navigationUI: "hide" })
            .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {}))
            .catch(() => {})
    },

    resize() {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2)
        this.w = window.innerWidth
        this.h = window.innerHeight
        this.canvas.width = Math.round(this.w * this.dpr)
        this.canvas.height = Math.round(this.h * this.dpr)
        if (this.match) this.match.setView(this.w, this.h)
        if (this.demo) this.demo.setView(this.w, this.h)
        // Im Hochformat auf dem Handy automatisch pausieren
        if (this.state === "game" && isTouchDevice() && this.h > this.w) this.pause()
    },

    // ---------------- Hauptschleife ----------------
    loop(now) {
        const dt = Math.min(0.05, (now - this.last) / 1000)
        this.last = now

        const active = this.match || this.demo
        if (active) {
            // feste Simulationsschritte => gleiches Spielgefühl bei 60 Hz und 144 Hz
            this.acc = (this.acc || 0) + dt
            const step = 1 / 120
            let n = 0
            while (this.acc >= step && n < 12) {
                active.update(step)
                this.acc -= step
                n++
            }
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
            active.render(this.ctx, this.w, this.h)
            if (this.match) UI.updateHud(this.match)
        }
        SpritePreview.tick(dt)

        if (GameSettings.get().showFps) {
            this.fpsAcc = (this.fpsAcc || 0) + dt
            this.fpsN = (this.fpsN || 0) + 1
            if (this.fpsAcc > 0.5) {
                document.getElementById("fps").textContent = Math.round(this.fpsN / this.fpsAcc) + " FPS"
                this.fpsAcc = 0
                this.fpsN = 0
            }
        }
        requestAnimationFrame(t => this.loop(t))
    }
}

App.boot()

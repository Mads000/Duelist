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
    lastStart: null,
    controllers: [],
    touch: null,
    state: "loading",
    config: {
        mode: "solo",
        champs: ["vanguard", "warbrute"],
        difficulty: "normal",
        randomOpp: true,
        map: "sky",
        chaos: false,
        dummy: "stand"
    },

    async boot() {
        this.ctx = this.canvas.getContext("2d")
        this.blockBrowserInput()
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
        Link.onChange = () => { if (UI.current === "controller") UI.renderController() }
        Net.onChange = () => { if (UI.current === "online") UI.renderOnline() }
        this.bindGlobalKeys()

        // Direkt als Controller starten (QR-Code: ...?pad=ABCD) – dafür braucht es keine Grafiken
        if (params.has("pad")) {
            PadMode.open(params.get("pad") || "")
            return
        }

        const tip = document.getElementById("loadTip")
        tip.textContent = "Tipp: " + randomTip()
        const tipTimer = setInterval(() => { tip.textContent = "Tipp: " + randomTip() }, 3500)
        await loadAllAssets(p => {
            document.getElementById("loadFill").style.transform = `scaleX(${p})`
        })
        clearInterval(tipTimer)
        document.getElementById("loadText").textContent = "Bereit!"

        this.startDemo()
        this.last = performance.now()
        requestAnimationFrame(t => this.loop(t))

        // Alte Links (?player1=Soldier&player2=Orc) starten direkt ein lokales Duell
        const legacy1 = resolveChampion(params.get("player1"))
        const legacy2 = resolveChampion(params.get("player2"))
        const auto = params.get("autostart")
        if (legacy1 && legacy2) {
            this.config.champs = [legacy1, legacy2]
            Modes.begin("local")
        } else if (auto) {
            this.config.champs = [resolveChampion(params.get("p1")) || "vanguard", resolveChampion(params.get("p2")) || "warbrute"]
            if (params.get("bot")) this.config.difficulty = params.get("bot")
            if (params.get("map")) this.config.map = params.get("map")
            Modes.begin(auto)
            if (this.state === "ladder") Modes.ladderGo()
        } else {
            this.setState("title")
            UI.show("title")
            const start = () => {
                if (this.state !== "title") return
                Sound.unlock()
                Sound.play("coin")
                Music.play("menu")
                this.setState("menu")
                UI.show("menu")
            }
            document.getElementById("screen-title").addEventListener("pointerup", start)
            Keyboard.listeners.add(code => { if (code !== "Escape") start() })
            this.titleStart = start
        }

        if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
            navigator.serviceWorker.register("sw.js").catch(() => {})
        }
    },

    // Browser-Eingaben abfangen, die das Spiel stören: Zoom, Kontextmenü, Markieren,
    // Ziehen, Scrollen, Suchen/Speichern/Drucken/Neu laden, Alt-Menü, F-Tasten …
    blockBrowserInput() {
        const isField = e => !!(e.target && e.target.closest && e.target.closest("input, textarea"))
        const opts = { passive: false }
        window.addEventListener("wheel", e => {
            if (e.ctrlKey || this.state === "game") e.preventDefault()
        }, opts)
        for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(t, e => e.preventDefault(), opts)
        document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault() }, opts)
        document.addEventListener("dblclick", e => e.preventDefault(), opts)
        document.addEventListener("contextmenu", e => { if (!isField(e)) e.preventDefault() })
        document.addEventListener("dragstart", e => e.preventDefault())
        document.addEventListener("selectstart", e => { if (!isField(e)) e.preventDefault() })
        window.addEventListener("keydown", e => {
            const field = isField(e)
            const ctrl = e.ctrlKey || e.metaKey
            // in Eingabefeldern Kopieren/Einfügen erlauben
            if (ctrl && field && ["a", "c", "v", "x", "z"].includes(e.key.toLowerCase())) return
            if (ctrl || e.altKey) e.preventDefault()
            if (/^F([1-9]|10)$/.test(e.key)) e.preventDefault()   // F11 (Vollbild) und F12 bleiben
            if (!field && ["Backspace", "Tab", "PageUp", "PageDown", "Home", "End"].includes(e.key)) e.preventDefault()
            if (!field && this.state === "game" && [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault()
        }, { capture: true })
        // Im Kampf vor versehentlichem Schließen/Neuladen warnen
        window.addEventListener("beforeunload", e => {
            if (this.state === "game" || this.state === "paused") {
                e.preventDefault()
                e.returnValue = ""
            }
        })
    },

    loadConfig() {
        this.config = readStorage("duelist.lastConfig", this.config)
        if (!CHAMPIONS[this.config.champs[0]]) this.config.champs = ["vanguard", "warbrute"]
        if (!DIFFICULTIES[this.config.difficulty]) this.config.difficulty = "normal"
    },

    setState(s) {
        this.state = s
        const inGame = s === "game" || s === "paused"
        document.body.classList.toggle("in-game", inGame)
        document.getElementById("hud").hidden = !inGame
        document.getElementById("pauseBtn").hidden = s !== "game"
        const showTouch = s === "game" && isTouchDevice()
        document.getElementById("touch").hidden = !showTouch
        if (!showTouch && this.touch) this.touch.reset()
        if (!inGame) {
            document.body.classList.remove("replaying")
            Link.menuState()
            document.getElementById("vs").className = ""
        }
    },

    // ---------------- Navigation ----------------
    go(target) {
        Sound.unlock()
        // Vom Ergebnis-Bildschirm aus: altes Match verwerfen
        if (this.match && this.state !== "game" && this.state !== "paused") {
            this.match = null
            Modes.run = null
        }
        if (target === "tutorial") return Tutorial.begin()
        if (target === "quick") return Modes.quick()
        if (target === "quickpick") {
            this.setState("select")
            UI.openSelect("quick")
            return
        }
        if (target === "online") {
            UI.renderOnline()
            UI.show("online")
            return
        }
        if (MODES[target]) {
            if (target === "local" && isTouchDevice() && !Link.pads.length) {
                UI.toast("Tipp: Mit „Handy als Controller“ spielt ihr zu zweit – oder mit Tastatur / Gamepads.")
            }
            this.setState("select")
            UI.openSelect(target)
            return
        }
        if (target === "settings") UI.backTarget.settings = this.state === "paused" ? "pause" : "menu"
        if (target === "controller") {
            // Am PC sofort den QR-Code zeigen, am Handy erst auf Wunsch
            if (!isTouchDevice()) Link.start()
            UI.renderController()
        }
        UI.show(target)
    },

    back() {
        const cur = UI.current
        if (cur === "select" && UI.select && UI.select.mode === "online") Net.close(true)
        if (cur === "online" && Net.status !== "off") Net.close(false)
        if (cur === "select" && UI.select && UI.select.step > 0 && !UI.select.single) {
            UI.select.step = Math.min(UI.select.step, 2) - 1
            UI.select.picks[UI.select.step] = null
            UI.renderSelect()
            return
        }
        if (cur === "settings" && UI.backTarget.settings === "pause") {
            UI.backTarget.settings = null
            UI.show("pause")
            return
        }
        if (["ladder", "continue", "entry", "pad"].includes(cur)) return
        if (cur === "lessons") return UI.show("trainhub")
        this.setState("menu")
        UI.show("menu")
    },

    bindGlobalKeys() {
        Keyboard.listeners.add(code => {
            if (code === "Escape") {
                if (this.state === "game") this.pause()
                else if (this.state === "paused" && UI.current === "pause") this.resume()
                else if (UI.current && !["title", "menu", "results", "loading"].includes(UI.current)) this.back()
                return
            }
            // Pfeiltasten im Menü (Auswahl + Optionen)
            if (this.state !== "game" && UI.current !== "entry" && UI.current !== "title" && !document.activeElement?.matches("input[type=range]")) {
                const dirs = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }
                if (dirs[code]) Nav.move(dirs[code])
            }
        })
    },

    // ---------------- Matches ----------------
    buildControllers(mode, opponent, net) {
        for (const c of this.controllers) if (c.destroy) c.destroy()
        const touch = isTouchDevice() ? [this.touch] : []
        let p1, p2
        if (net) {
            // Online: eigene Eingaben gehen ans Netz, die des Gegners kommen von dort
            const local = new NetTapController(new Controller([new KeyboardSource(keymap("solo")), new GamepadSource("any"), new PhoneSource(0), new PhoneSource(1), ...touch]))
            const remote = new Controller([new RemoteSource()])
            this.controllers = net === "host" ? [local, remote] : [remote, local]
            return this.controllers
        }
        if (mode === "team") {
            const diff = (opponent && opponent.difficulty) || "normal"
            this.controllers = [
                new Controller([new KeyboardSource(keymap("solo")), new GamepadSource("any"), new PhoneSource(0), new PhoneSource(1), ...touch]),
                new BotController(diff), new BotController(diff), new BotController(diff)
            ]
            return this.controllers
        }
        if (mode === "local") {
            p1 = new Controller([new KeyboardSource(keymap("p1")), new GamepadSource(0), new PhoneSource(0), ...touch])
            p2 = new Controller([new KeyboardSource(keymap("p2")), new GamepadSource(1), new PhoneSource(1)])
        } else if (opponent && opponent.controller) {
            p1 = new Controller([new KeyboardSource(keymap("solo")), new GamepadSource("any"), new PhoneSource(0), new PhoneSource(1), ...touch])
            p2 = opponent.controller
        } else {
            p1 = new Controller([new KeyboardSource(keymap("solo")), new GamepadSource("any"), new PhoneSource(0), new PhoneSource(1), ...touch])
            p2 = opponent && opponent.dummy
                ? new BotController("easy", { dummy: opponent.dummy })
                : new BotController((opponent && opponent.difficulty) || "normal")
        }
        if (params.get("p1bot")) p1 = new BotController("hard")
        this.controllers = [p1, p2]
        return this.controllers
    },

    startMatch({ rules, champs, opponent, net }) {
        Sound.unlock()
        this.lastStart = { rules, champs, opponent }
        writeStorage("duelist.lastConfig", this.config)
        this.demo = null
        if (rules.mode !== "tutorial") Tutorial.stop()
        const two = rules.mode === "local" || !!net
        this.match = new Match({
            rules: { ...rules, net },
            champs,
            controllers: this.buildControllers(rules.mode, opponent, net),
            humans: rules.mode === "team" ? [true, false, false, false] : [true, two],
            settings: { ...GameSettings.get() },
            onEvent: (type, data, m) => this.onMatchEvent(type, data, m)
        })
        Shop.applySkins(this.match)
        this.match.setView(this.w, this.h)
        UI.buildHud(this.match)
        UI.hideBanner()
        if (rules.vs) UI.showVs(this.match)
        else UI.wipe()
        this.setState("game")
        UI.show("none")
        Music.play("battle")
        this.requestFullscreen()
    },

    restart() {
        if (this.match && this.match.netRole) {
            this.match = null
            return Net.rematch()
        }
        this.match = null
        if (Tutorial.active) return Tutorial.begin(Tutorial.lesson)
        Modes.restart()
    },

    pause() {
        if (this.state !== "game" || !this.match) return
        // Online läuft das Spiel weiter – nur das Menü öffnet sich
        if (!this.match.netRole) this.match.paused = true
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
        if (Net.connected) Net.close(true)
        Tutorial.stop()
        this.match = null
        Modes.run = null
        UI.hideBanner()
        this.startDemo()
        this.setState("menu")
        UI.show("menu")
        Music.play("menu")
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
    },

    onMatchEvent(type, data, match) {
        if (match !== this.match) return
        Modes.onEvent(type, data, match)
        Tutorial.onEvent(type, data)
        Progress.onEvent(type, data, match)
        // Host meldet K.O. und Zeitablauf an den Gast
        if (match.netRole === "host") {
            if (type === "finisher") Net.send({ t: "ko", loser: data.loser.side, fin: data.fin })
            if (type === "timeUp") Net.send({ t: "timeup" })
        }
        switch (type) {
            case "banner":
                UI.banner(data)
                break
            case "combo":
                UI.combo(data.fighter.side, data.count, data.damage)
                break
            case "abilityDenied":
                UI.denyAbility(data.side)
                break
            case "vibrate":
                Link.vibrate(data.side, data.ms)
                break
            case "replay":
                document.body.classList.toggle("replaying", data.on)
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
        Music.play("menu")
        UI.progressInfo = Progress.onMatchEnd(match, winner)
        if (Modes.onMatchEnd(match, winner)) {
            if (UI.progressInfo && UI.current !== "results") UI.toast(`+${UI.progressInfo.xp} XP` + (UI.progressInfo.levelUp ? ` · LEVEL ${UI.progressInfo.levelUp}!` : ""))
            return
        }
        let note = ""
        if (match.mode === "solo") {
            PlayerRecord.addSoloResult(winner === 0, match.fighters[1].controller.diff.id, match.fighters[0].champId)
            const s = PlayerRecord.data.streak
            if (winner === 0 && s >= 2) note = `🔥 ${s} Siege in Folge!`
        }
        this.setState("results")
        UI.showResults(match, winner, { note })
        Sound.play(match.humanCount === 1 && winner !== 0 ? "defeat" : "victory")
    },

    // Demo-Kampf (Bot gegen Bot) als Attract-Modus auf dem Titelbildschirm
    startDemo() {
        const pool = CHAMPION_ORDER.filter(id => !CHAMPIONS[id].boss)
        const a = pool[Math.floor(Math.random() * pool.length)]
        let b = pool[Math.floor(Math.random() * pool.length)]
        if (a === b) b = pool[(pool.indexOf(a) + 1) % pool.length]
        const demo = new Match({
            rules: { mode: "demo", map: MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)], rounds: 3, roundTime: 60 },
            champs: [a, b],
            controllers: [new BotController("hard"), new BotController("hard")],
            settings: { ...DEFAULT_SETTINGS, shake: false, vibration: false },
            onEvent: type => {
                if (type === "matchEnd" && this.demo === demo) setTimeout(() => { if (this.demo === demo) this.startDemo() }, 1500)
            }
        })
        Shop.applySkins(demo, true)
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
        const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000))
        this.last = now

        // Im Kampf das Match, in Titel und Menüs läuft die Demo als Hintergrund
        if (!this.match && !this.demo && UI.current !== "loading" && UI.current !== "pad") this.startDemo()
        const active = this.match || (UI.current === "pad" ? null : this.demo)
        if (active) {
            // Variable Teilschritte (max. 1/120 s) – flüssig bei 60, 120 und 144 Hz
            const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
            const step = dt / steps
            for (let i = 0; i < steps; i++) active.update(step)
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
            active.render(this.ctx, this.w, this.h)
            if (this.match) {
                UI.updateHud(this.match)
                Link.syncMatch(this.match)
                if (this.match.netRole) Net.syncMatch(this.match)
                Tutorial.update(this.match)
            }
        }

        // Menüs mit Gamepad oder Handy bedienen
        if (this.state !== "game") {
            const back = () => {
                if (this.state === "paused" && UI.current === "pause") this.resume()
                else this.back()
            }
            if (UI.current === "title") {
                const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []
                const pressed = pads.some(p => p.buttons.some(b => b.pressed)) || Link.pads.some(p => p.state.b)
                if (pressed && this.titleStart) this.titleStart()
            } else {
                Nav.pollGamepads(back)
                Link.pollNav(back)
            }
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

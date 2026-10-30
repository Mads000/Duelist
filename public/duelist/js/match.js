// ============================================================
//  Match – Runden, Treffer, Projektile, Gefahren, Kamera, Zeichnen
// ============================================================

const MAP_DUST = {
    sky: "rgba(214,170,110,0.55)",
    classic: "rgba(220,180,120,0.55)",
    volcano: "rgba(90,70,70,0.6)",
    frost: "rgba(235,245,255,0.75)"
}

class Match {
    // rules: { mode, map, rounds, roundTime, chaos, infiniteEnergy, hp:[a,b], stage }
    constructor({ rules, champs, controllers, humans = [false, false], settings, onEvent }) {
        this.rules = rules
        this.mode = rules.mode
        this.demo = rules.mode === "demo"
        this.training = rules.mode === "training" || rules.mode === "tutorial"
        // Online: Host rechnet verbindlich, Gast spielt mit und wird korrigiert
        this.netRole = rules.net || null
        this.localSide = this.netRole === "host" ? 0 : this.netRole === "guest" ? 1 : undefined
        this.settings = settings
        this.onEvent = onEvent || (() => {})
        this.map = { ...MAPS[rules.map || "sky"], dust: MAP_DUST[rules.map || "sky"] }
        this.fx = new Effects()
        const hp = rules.hp || [null, null]
        // 2 gegen 2: Kämpfer 0+1 = Team Blau, 2+3 = Team Rot ("side" ist immer das Team)
        this.team2 = champs.length === 4
        this.fighters = champs.map((id, i) => new Fighter(id, this.team2 ? (i < 2 ? 0 : 1) : i, this, { hp: hp[i] ?? null, slot: i }))
        // Anführer je Team (HUD, VS, Ergebnis)
        this.leads = [this.fighters.find(f => f.side === 0), this.fighters.find(f => f.side === 1)]
        this.humanCount = humans.filter(Boolean).length
        this.fighters.forEach((f, i) => {
            f.controller = controllers[i]
            f.isHuman = !!humans[i]
            if (f.controller && f.controller.attach) f.controller.attach(f, this.targetFor(f), this)
            if (rules.infiniteEnergy && f.isHuman) f.energy = f.maxEnergy
        })
        this.bombs = []
        this.projectiles = []
        this.zones = []
        this.geysers = []
        this.blooms = []
        this.items = []
        this.puddles = []
        this.itemT = 8 + Math.random() * 4
        this.props = this.makeProps()
        this.wind = { t: 9 + Math.random() * 5, active: 0, warn: 0, dir: 1 }
        this.bloomT = 7 + Math.random() * 4
        this.rec = []          // Aufnahme der letzten Sekunden (für die Finisher-Wiederholung)
        this.hazardT = 4 + Math.random() * 3
        this.chaosT = 3
        this.time = 0
        this.round = 1
        this.wins = [0, 0]
        this.roundsToWin = Math.ceil((rules.rounds || 3) / 2)
        this.timer = rules.roundTime || 60
        this.phase = rules.vs ? "vs" : "intro"
        this.phaseT = 0
        this.hitstop = 0
        this.timeScale = 1
        this.slowmoT = 0
        this.shake = 0
        this.flash = 0
        this.paused = false
        this.over = false
        this.koTarget = null
        this.introStep = -1
        this.camera = { x: WORLD.width / 2, y: 560, zoom: 1, ready: false }
        this.view = { w: 1, h: 1 }
        this.lastSecond = Math.ceil(this.timer)
        if (this.phase === "vs") this.emit("vs", { match: this })
    }

    emit(type, data) {
        this.onEvent(type, data, this)
    }

    sound(name, opt) {
        if (!this.demo) Sound.play(name, opt)
    }

    vibrate(ms, fighter = null) {
        if (this.demo) return
        this.emit("vibrate", { ms, side: fighter ? fighter.side : null })
        if (!this.settings.vibration || !navigator.vibrate) return
        if (this.fighters.some(f => f.isHuman)) navigator.vibrate(ms)
    }

    callout(fighter, text, color) {
        this.fx.text(fighter.x, fighter.y - 120, text, { color, size: 32, life: 1, vy: -90 })
    }

    addShake(amount) {
        if (this.settings.shake || this.demo) this.shake = Math.max(this.shake, amount)
    }

    // ---------------- Ablauf ----------------
    update(realDt) {
        if (this.paused || this.over) return
        if (this.phase === "replay") return this.updateReplay(realDt)
        const dt = realDt * (this.settings.gameSpeed || 1)

        this.flash = Math.max(0, this.flash - realDt * 3)
        this.shake = Math.max(0, this.shake - realDt * 60)

        if (this.hitstop > 0) {
            this.hitstop -= realDt
            this.updateCamera(realDt)
            return
        }

        if (this.slowmoT > 0) {
            this.slowmoT -= realDt
            this.timeScale = 0.25
        } else {
            this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-6 * realDt))
        }
        const sdt = dt * this.timeScale
        this.time += sdt
        this.phaseT += realDt

        this.updatePhase()

        const fighting = this.phase === "fight"
        // jeder kämpft gegen den nächsten lebenden Gegner
        for (const f of this.fighters) {
            f.target = this.targetFor(f)
            if (f.controller && f.controller.retarget) f.controller.retarget(f.target)
        }
        const inputs = this.fighters.map(f => this.readInput(f, fighting))
        if (inputs.some(i => i.pause) && !this.demo) this.emit("pauseRequest")

        this.fighters.forEach((f, i) => f.update(sdt, f.target, inputs[i]))
        for (let i = 0; i < this.fighters.length; i++) {
            for (let j = i + 1; j < this.fighters.length; j++) this.separate(this.fighters[i], this.fighters[j])
        }
        this.updateBombs(sdt)
        this.updateProjectiles(sdt)
        this.updateZones(sdt)
        this.updateArena(sdt, fighting)
        if (fighting) this.updateHazards(sdt)
        this.updateTraining(sdt)
        this.fx.update(sdt)
        this.record()

        if (fighting && isFinite(this.timer)) {
            this.timer -= sdt
            const sec = Math.ceil(this.timer)
            if (sec !== this.lastSecond) {
                this.lastSecond = sec
                if (sec <= 5 && sec > 0) this.sound("count")
            }
            if (this.timer <= 0) {
                this.timer = 0
                if (this.netRole !== "guest") this.endRound()
            }
        }

        this.updateCamera(realDt)
    }

    readInput(f, fighting) {
        if (!f.controller) return NO_INPUT
        const inp = f.controller.read()
        if (!fighting) return { ...NO_INPUT, pause: inp.pause }
        return inp
    }

    updatePhase() {
        const t = this.phaseT
        if (this.phase === "vs") {
            if (t >= 2.2) this.setPhase("intro")
        } else if (this.phase === "intro") {
            // Rundenbanner, dann 3-2-1 (nur erste Runde) und "Kämpft!"
            const steps = this.training
                ? [[0, "fight"]]
                : this.round === 1 && !this.demo
                    ? [[0, "round"], [1.0, "3"], [1.5, "2"], [2.0, "1"], [2.5, "fight"]]
                    : [[0, "round"], [1.15, "fight"]]
            for (let i = this.introStep + 1; i < steps.length; i++) {
                if (t >= steps[i][0]) {
                    this.introStep = i
                    this.introBeat(steps[i][1])
                }
            }
        } else if (this.phase === "ko") {
            if (t >= 1.5 && !this.roundResolved) this.resolveRound()
            if (t >= 3.6) this.nextRoundOrEnd()
        } else if (this.phase === "timeup") {
            if (t >= 1.3 && !this.roundResolved) this.resolveRound()
            if (t >= 3.4) this.nextRoundOrEnd()
        }
    }

    introBeat(step) {
        if (step === "round") {
            const final = this.wins[0] === this.roundsToWin - 1 && this.wins[1] === this.roundsToWin - 1 && this.roundsToWin > 1
            const text = final ? "FINALE RUNDE" : `RUNDE ${this.round}`
            this.emit("banner", { text, sub: this.rules.stage || "", kind: "round", time: 1.1 })
            this.sound("count")
        } else if (step === "fight") {
            this.emit("banner", { text: "FIGHT!", kind: "fight", time: 0.8 })
            this.sound("fight")
            this.addShake(10)
            this.setPhase("fight")
        } else {
            this.emit("banner", { text: step, kind: "count", time: 0.5 })
            this.sound("count")
        }
    }

    setPhase(p) {
        this.phase = p
        this.phaseT = 0
    }

    // ---------------- Treffer ----------------
    // src = Position, von der der Treffer kommt (Figur, Projektil oder Zauber)
    tryHit(att, def, move, windowIdx, src = att) {
        if (def.state === "dead" || this.phase !== "fight") return false
        const melee = src === att

        if (melee) {
            const reach = move.reach * SPRITE_SCALE + COMBAT.bodyHalf
            if (move.around) {
                // Rundumschlag: trifft in alle Richtungen
                if (Math.abs(def.x - att.x) > reach || Math.abs(def.y - att.y) > COMBAT.depthReach * 1.4) return false
            } else if (att.aimY) {
                // Schlag nach oben/unten: Reichweite in der Tiefe, schmal zur Seite
                const dy = (def.y - att.y) * att.aimY
                if (dy < -COMBAT.bodyHalf || dy > reach || Math.abs(def.x - att.x) > COMBAT.depthReach * 1.6) return false
            } else {
                const dx = (def.x - att.x) * att.facing
                const dy = Math.abs(def.y - att.y)
                if (dx < -COMBAT.bodyHalf || dx > reach || dy > COMBAT.depthReach) return false
            }
        }

        const dir = Math.sign(def.x - src.x) || att.facing
        const vertical = melee && att.aimY
        const hitX = vertical ? (att.x + def.x) / 2 : melee ? att.x + att.facing * Math.min(Math.max((def.x - att.x) * att.facing, 0), 120) * 0.7 : def.x - dir * 20
        const hitY = (src.y + def.y) / 2 - 42

        // Ausweichen macht unverwundbar
        if (def.iframes > 0 && def.state === "dash") {
            if (!att.dodgedBy) {
                att.dodgedBy = true
                def.stats.dodges++
                this.fx.text(def.x, def.y - 120, "AUSGEWICHEN", { color: "#bfe3ff", size: 32, life: 0.7 })
                this.sound("whiff")
            }
            return false
        }
        if (def.invulnerable) return false

        const isHeavy = move === att.champ.heavy || move.guardBreak

        // Vanguards Lichtschild blockt alles
        if (def.shieldT > 0) {
            def.stats.blocked++
            this.fx.sparks(hitX, hitY, -dir, { color: "#dff3ff", color2: "#7cc4ff", count: 12 })
            this.fx.ring(hitX, hitY, { radius: 50, color: "rgba(180,225,255,0.9)", life: 0.25, width: 6, ground: false })
            if (melee) att.vx = -att.facing * 420
            if (!def.busy && def.champ.anims.block) {
                def.state = "block"
                def.stateT = 0
                def.stun = 0.2
                def.setAnim("block")
            }
            this.sound("block")
            this.hitstop = 0.05
            this.addShake(5)
            return true
        }

        // Deckung (rückwärts gedrückt halten, Gesicht zum Angreifer)
        // Deckung hält von vorn – und gegen Angriffe von oben/unten (dort zählt die Blickrichtung nicht)
        const fromAbove = Math.abs(def.y - src.y) > Math.abs(def.x - src.x)
        const facingSrc = fromAbove || def.facing === (Math.sign(src.x - def.x) || def.facing)
        if (def.guarding && facingSrc) {
            if (move.guardBreak) {
                // Spezialangriffe brechen die Deckung
                def.guardBreak()
                const dmg = Math.round(move.dmg * 0.5)
                def.hp = Math.max(1, def.hp - dmg)
                att.stats.damage += dmg
                def.stats.taken += dmg
                this.fx.sparks(hitX, hitY, dir, { count: 26, color: "#fff6a8", color2: "#ff8a3c", speed: 700 })
                this.fx.text(def.x, def.y - 125, "GUARD BREAK!", { color: "#ffd84a", size: 46, life: 1.1 })
                this.sound("guardBreak")
                this.hitstop = 0.12
                this.addShake(18)
                this.vibrate(60, def)
                this.emit("guardBreak", { att, def })
                return true
            }
            const perfect = this.time - def.guardSince <= COMBAT.perfectBlock
            def.stats.blocked++
            if (perfect) {
                def.stats.perfect++
                def.gainEnergy(1)
                this.fx.guardArc(def.x + def.facing * 18, def.y - 40, def.facing, true)
                this.fx.sparks(hitX, hitY, -dir, { count: 18, color: "#fffbe0", color2: "#ffe27a", speed: 500 })
                this.fx.text(def.x, def.y - 125, "PERFEKT!", { color: "#fff4a8", size: 44, life: 0.9 })
                this.sound("perfect")
                this.hitstop = 0.1
                this.slowmoT = Math.max(this.slowmoT, 0.14)
                this.flash = Math.max(this.flash, 0.25)
                def.state = "block"
                def.stateT = 0
                def.stun = 0.08
                if (melee) {
                    // Angreifer taumelt – Zeit für einen Konter
                    att.state = "hurt"
                    att.stateT = 0
                    att.stun = 0.42
                    att.setAnim("hurt")
                    att.vx = -att.facing * 320
                }
                this.emit("perfectBlock", { def })
                return true
            }
            // Schwere Angriffe zehren stärker an der Deckung und halten länger im Block
            const chip = def.blockHit(src, move.dmg, move.kb, isHeavy ? 1.6 : 1)
            def.stats.taken += chip
            att.stats.damage += chip
            // Angreifer prallt ab – nach dem Block ist wieder Abstand
            if (melee) att.vx -= att.facing * (isHeavy ? 260 : 160)
            this.fx.guardArc(def.x + def.facing * 18, def.y - 40, def.facing, false)
            this.fx.sparks(hitX, hitY, -dir, { count: 8, color: "#dff3ff", color2: "#9fc8ff", speed: 380 })
            this.sound("guard")
            this.hitstop = 0.035
            this.addShake(3)
            if (def.guard <= 0) {
                def.guardBreak()
                this.fx.text(def.x, def.y - 125, "GUARD BREAK!", { color: "#ffd84a", size: 46, life: 1.1 })
                this.sound("guardBreak")
            }
            return true
        }

        // Treffer!
        // Konter: schweren Angriff oder Fähigkeit beim Ausholen unterbrechen
        const counter = (def.inStartup && def.moveKind === "heavy") || (def.state === "throw" && !def.castDone)
        const finisher = isHeavy && windowIdx === move.hits.length - 1
        let dmg = move.dmg
        let kb = isHeavy ? (finisher || !move.hits.length ? move.kb : move.kb * 0.35) : move.kb
        let stun = null
        if (counter) {
            dmg *= 1.4
            stun = (isHeavy ? COMBAT.heavyStun : COMBAT.hitstun) + 0.15
            def.stats.counters++
            att.stats.counters++
            this.fx.text(def.x, def.y - 150, "KONTER!", { color: "#ff7a5a", size: 40, life: 0.9 })
            this.sound("counter")
            this.emit("counter", { att })
        }
        if (att.powerT > 0) dmg *= 1.3
        const ambushHit = att.ambush
        if (att.ambush) {
            dmg *= 2
            kb *= 1.3
            att.ambush = false
            this.callout(att, "HINTERHALT!", "#c9a5ff")
        }
        // Lange Kombos verlieren an Schaden (kein Endlos-Kombo)
        const scale = Math.max(0.45, 1 - 0.1 * Math.max(0, att.comboCount - 2))
        dmg = Math.max(1, Math.round(dmg * scale))
        const heavy = finisher || dmg >= 12 || (isHeavy && !move.hits.length)

        // Training: niemand stirbt – online entscheidet nur der Host über ein K.O.
        if ((this.training || this.netRole === "guest") && def.hp - dmg < 1) dmg = Math.max(0, Math.ceil(def.hp - 1))

        def.takeHit(src, dmg, kb, isHeavy && (finisher || !move.hits.length), { stun })
        att.stats.damage += dmg
        def.stats.taken += dmg
        att.stats.hits++
        att.comboCount++
        att.comboDamage += dmg
        att.comboTimer = 1.1
        att.stats.maxCombo = Math.max(att.stats.maxCombo, att.comboCount)
        if (att.frenzyT > 0) att.hp = Math.min(att.maxHp, att.hp + dmg * 0.5)
        if (!att.landedThisSwing) {
            att.landedThisSwing = true
            att.gainEnergy(1)
        }
        if (att.comboCount >= 2) this.emit("combo", { fighter: att, count: att.comboCount, damage: att.comboDamage })
        this.emit("hit", { att, def, dmg, heavy, counter })

        // Juice!
        this.fx.sparks(hitX, hitY, dir, { count: heavy ? 22 : 12, speed: heavy ? 700 : 480 })
        if (melee) this.fx.slash(hitX - att.facing * 20, hitY, att.facing, heavy ? "rgba(255,240,200,0.95)" : "rgba(255,255,255,0.85)", heavy)
        this.fx.text(def.x, def.y - 110, String(dmg), { color: counter ? "#ff7a5a" : heavy ? "#ffd84a" : "#ffffff", size: heavy ? 46 : 34 })
        this.sound("hit", { heavy })
        this.hitstop = heavy ? 0.085 : counter ? 0.065 : 0.035
        this.addShake(heavy ? 15 : 5)
        if (heavy || counter) this.punch = Math.max(this.punch || 0, heavy ? 0.07 : 0.045)
        this.vibrate(heavy ? 45 : 18, def)

        if (def.hp <= 0) {
            this.lastHit = { melee, heavy: heavy || isHeavy, counter, ambush: ambushHit, aimY: melee ? att.aimY : 0, combo: att.comboCount }
            this.knockout(att, def)
        }
        return true
    }

    // ---------------- Teams ----------------
    enemiesOf(f) {
        return this.fighters.filter(o => o.side !== f.side)
    }

    // nächster lebender Gegner (sonst irgendein Gegner)
    targetFor(f) {
        const foes = this.enemiesOf(f)
        const alive = foes.filter(o => o.state !== "dead" && o.state !== "fall")
        const pool = alive.length ? alive : foes
        return pool.reduce((best, o) => Math.hypot(o.x - f.x, o.y - f.y) < Math.hypot(best.x - f.x, best.y - f.y) ? o : best, pool[0])
    }

    teamAlive(side) {
        return this.fighters.some(o => o.side === side && o.state !== "dead" && o.hp > 0)
    }

    spawnFor(f) {
        const base = ARENA.spawn[f.side]
        if (!this.team2) return base
        return { x: base.x, y: base.y + (f.slot % 2 ? 95 : -95) }
    }

    // Spieler sollen nicht ineinander stehen
    separate(a, b) {
        if (a.state === "dead" || b.state === "dead") return
        const dx = b.x - a.x
        const dy = b.y - a.y
        const minX = COMBAT.bodyHalf * 1.6
        if (Math.abs(dx) < minX && Math.abs(dy) < 26) {
            const push = (minX - Math.abs(dx)) / 2
            const dir = Math.sign(dx) || (a.side === 0 ? 1 : -1)
            a.x -= dir * push
            b.x += dir * push
            a.clampToArena()
            b.clampToArena()
        }
    }

    // ---------------- Wurf ----------------
    // Leicht + Schwer nah am Gegner: geht durch jede Deckung, wird aber von Schlägen unterbrochen
    tryThrow(att, def) {
        if (this.phase !== "fight" || def.state === "dead") return
        const close = Math.abs(def.x - att.x) < 125 && Math.abs(def.y - att.y) < COMBAT.depthReach * 1.3
        const open = ["idle", "run", "block", "recover"].includes(def.state) && !def.invulnerable
        if (!close || !open) {
            this.fx.text(att.x, att.y - 110, "DANEBEN", { color: "#dfe7ff", size: 28, life: 0.6 })
            this.sound("whiff")
            return
        }
        // Wurf-Befreiung: der Gegner drückt im selben Moment auch Leicht + Schwer
        if (def.bufLight > 0 && def.bufHeavy > 0) {
            att.vx = -att.facing * 420
            def.vx = att.facing * 420
            this.fx.text((att.x + def.x) / 2, att.y - 120, "BEFREIT!", { color: "#bfe3ff", size: 34, life: 0.8 })
            this.fx.ring((att.x + def.x) / 2, att.y, { radius: 90, color: "rgba(200,230,255,0.9)", life: 0.3, width: 6 })
            this.sound("guard")
            this.hitstop = 0.06
            return
        }
        const dir = att.facing
        let dmg = 10
        if ((this.training || this.netRole === "guest") && def.hp - dmg < 1) dmg = Math.max(0, Math.ceil(def.hp - 1))
        // über die Schulter: der Gegner landet hinter dem Werfer
        def.x = att.x - dir * 40
        def.clampToArena()
        def.takeHit({ x: att.x + dir * 60, y: def.y }, dmg, 780, true)
        def.guard = Math.max(def.guard, COMBAT.guardMax * 0.3)
        att.facing = -dir
        att.stats.damage += dmg
        att.stats.hits++
        def.stats.taken += dmg
        if (!att.landedThisSwing) att.gainEnergy(1)
        this.fx.text(def.x, def.y - 120, "WURF!", { color: "#ffd84a", size: 40, life: 0.9 })
        this.fx.dust(def.x, def.y, { count: 12, size: 24, color: this.map.dust })
        this.fx.ring(def.x, def.y, { radius: 120, color: "rgba(255,240,200,0.9)", life: 0.35, width: 8 })
        this.sound("hit", { heavy: true })
        this.hitstop = 0.09
        this.punch = 0.06
        this.addShake(16)
        this.vibrate(50, def)
        this.emit("throw", { att, def })
        this.emit("hit", { att, def, dmg, heavy: true, counter: false })
        if (def.hp <= 0) {
            this.lastHit = { melee: true, heavy: true, throw: true }
            this.knockout(att, def)
        }
    }

    // ---------------- Projektile (Feuerball) ----------------
    spawnProjectile(owner, move) {
        const p = move.projectile
        const aimY = owner.aimY
        // Fächer (Feuersalve): weitere Geschosse mit Tiefenversatz
        for (let i = 1; i < (p.count || 1); i++) {
            const k = i % 2 ? 1 : -1
            this.projectiles.push({
                owner, move, cfg: p, aimY: 0,
                img: champImage(owner.champId, p.effect),
                x: owner.x + owner.facing * 70, y: owner.y, h: 62,
                vx: owner.facing * p.speed, vy: k * Math.ceil(i / 2) * p.spread * 0.5, dist: 0,
                t: 0, state: "fly", dodged: false
            })
        }
        this.projectiles.push({
            owner, move, cfg: p, aimY,
            img: champImage(owner.champId, p.effect),
            x: owner.x + (aimY ? 0 : owner.facing * 70), y: owner.y + aimY * 30, h: 62,
            vx: aimY ? 0 : owner.facing * p.speed, vy: aimY * p.speed * 0.78, dist: 0,
            t: 0, state: "fly", dodged: false
        })
    }

    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i]
            p.t += dt
            if (p.state === "fly") {
                p.x += p.vx * dt
                p.y += p.vy * dt
                p.dist += Math.hypot(p.vx, p.vy) * dt
                if (Math.random() < dt * 30) this.fx.sparks(p.x, p.y - p.h, -Math.sign(p.vx) || -p.owner.facing, { count: 1, speed: 80, size: 5, color: "#ffd08a", color2: "#ff7a2a" })
                const def = this.enemiesOf(p.owner).find(e => e.state !== "dead" && Math.abs(e.x - p.x) < 34 && Math.abs(e.y - p.y) < COMBAT.depthReach) || this.targetFor(p.owner)
                const touching = Math.abs(def.x - p.x) < 34 && Math.abs(def.y - p.y) < COMBAT.depthReach
                let boom = false
                if (touching && def.state !== "dead") {
                    if (def.iframes > 0 && def.state === "dash") {
                        if (!p.dodged) {
                            p.dodged = true
                            def.stats.dodges++
                            this.fx.text(def.x, def.y - 120, "AUSGEWICHEN", { color: "#bfe3ff", size: 32, life: 0.7 })
                        }
                    } else if (!def.invulnerable) {
                        boom = this.tryHit(p.owner, def, p.move, 0, { x: p.x - Math.sign(p.vx) * 30, y: p.y - p.aimY * 20, aimY: p.aimY })
                    }
                }
                if (p.dist > p.cfg.range || !ARENA.contains(p.x, p.y, 50)) boom = true
                // Deckung: Geschosse prallen an Säulen und Kisten ab
                const cover = this.propAt(p.x, p.y, 0.8)
                if (cover && !boom) {
                    boom = true
                    this.damageProp(cover, p.owner)
                }
                if (boom) {
                    p.state = "boom"
                    p.t = 0
                }
            } else if (p.t > 3 / 14) {
                this.projectiles.splice(i, 1)
            }
        }
    }

    // ---------------- Flächenzauber (Eis, Seelenbeben) ----------------
    spawnZone(owner, opp, move) {
        const z = move.zone
        let x, y
        if (z.ahead) {
            // Schockwelle direkt vor dem Angreifer (Spezialangriff)
            const [sx, sy] = ARENA.clamp(owner.x + owner.facing * z.ahead, owner.y)
            this.fx.ring(sx, sy, { radius: z.radius * 1.3, color: "rgba(255,220,150,0.95)", life: 0.5, width: 14 })
            this.fx.ring(sx, sy, { radius: z.radius * 0.8, color: owner.champ.color, life: 0.4, width: 18 })
            this.fx.dust(sx, sy, { count: 16, size: 26, color: this.map.dust })
            this.fx.sparks(sx, sy - 20, owner.facing, { count: 18, speed: 600, spread: 2.4, color: "#ffe2a8", color2: "#c8742c" })
            this.sound("quake")
            this.addShake(18)
            this.zones.push({ owner, move, x: sx, y: sy, t: 0, hitAt: 0.02, radius: z.radius, done: false, color: "rgba(255,220,150,0.5)" })
            return
        }
        const aimY = owner.aimY
        const inFront = aimY ? Math.sign(opp.y - owner.y) === aimY : (opp.x - owner.x) * owner.facing > 0
        const dist = Math.hypot(opp.x - owner.x, (opp.y - owner.y) * 1.3)
        if (opp.stealthT <= 0 && inFront && dist < z.maxDist) {
            x = opp.x
            y = opp.y
        } else {
            x = owner.x + (aimY ? 0 : owner.facing * z.maxDist * 0.55)
            y = owner.y + aimY * z.maxDist * 0.35
        }
        ;[x, y] = ARENA.clamp(x, y)
        const img = champImage(owner.champId, z.effect)
        this.fx.sheet(img, x, y - 50, z.frames, z.fps, { center: { x: 52, y: 50 } })
        this.zones.push({ owner, move, x, y, t: 0, hitAt: z.hitFrame / z.fps, radius: z.radius, done: false, color: "rgba(140,210,255,0.5)" })
    }

    quake(owner) {
        const move = { dmg: 16, kb: 720, hits: [], guardBreak: true }
        this.zones.push({ owner, move, x: owner.x, y: owner.y, t: 0, hitAt: 0.02, radius: 230, done: false, color: "rgba(230,220,190,0.5)" })
        this.fx.ring(owner.x, owner.y, { radius: 260, color: "rgba(240,230,200,0.95)", life: 0.6, width: 16 })
        this.fx.ring(owner.x, owner.y, { radius: 180, color: "rgba(160,120,255,0.8)", life: 0.45, width: 22 })
        this.fx.dust(owner.x, owner.y, { count: 18, size: 26, color: this.map.dust })
        this.fx.smoke(owner.x, owner.y, 14, "rgba(120,90,200,0.55)")
        this.sound("quake")
        this.addShake(28)
        this.flash = 0.25
        this.vibrate(90)
    }

    updateZones(dt) {
        for (let i = this.zones.length - 1; i >= 0; i--) {
            const z = this.zones[i]
            z.t += dt
            if (!z.done && z.t >= z.hitAt) {
                z.done = true
                for (const def of this.enemiesOf(z.owner)) {
                    const inside = Math.hypot((def.x - z.x) / z.radius, (def.y - z.y) / (z.radius * 0.5)) <= 1
                    if (inside) this.tryHit(z.owner, def, z.move, 0, { x: z.x, y: z.y - 1 })
                }
                for (const pr of this.props) if (pr.hp > 0 && Math.hypot((pr.x - z.x) / z.radius, (pr.y - z.y) / (z.radius * 0.5)) <= 1) this.damageProp(pr, z.owner)
            }
            if (z.t > z.hitAt + 0.4) this.zones.splice(i, 1)
        }
    }

    // ---------------- Bomben ----------------
    throwBomb(owner, target, dmg, stacks) {
        this.bombs.push({
            owner, dmg, stacks,
            x0: owner.x + owner.facing * 30, y0: owner.y,
            tx: target.x, ty: target.y,
            x: owner.x, y: owner.y, h: 0,
            t: 0, flight: 0.55, fuse: 0.5,
            phase: "air",
            radius: 110 + stacks * 10
        })
    }

    // Chaos-Modus: Bomben fallen vom Himmel und treffen jeden
    dropBomb(x, y) {
        this.bombs.push({
            owner: null, dmg: 12, stacks: 3,
            x0: x, y0: y, tx: x, ty: y, x, y, h: 700,
            t: 0, flight: 0.9, fuse: 0.6, phase: "air", radius: 120, falling: true
        })
    }

    updateBombs(dt) {
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const b = this.bombs[i]
            b.t += dt
            if (b.phase === "air") {
                const k = Math.min(1, b.t / b.flight)
                if (b.falling) {
                    b.h = 700 * (1 - k * k)
                } else {
                    b.x = b.x0 + (b.tx - b.x0) * k
                    b.y = b.y0 + (b.ty - b.y0) * k
                    b.h = 4 * 170 * k * (1 - k) + 40 * (1 - k)
                }
                if (k >= 1) {
                    b.phase = "fuse"
                    b.t = 0
                    this.fx.dust(b.x, b.y, { count: 5, size: 14, color: this.map.dust })
                    this.sound("fuse")
                }
            } else if (b.t >= b.fuse) {
                this.explode(b)
                this.bombs.splice(i, 1)
            }
        }
    }

    explode(b) {
        this.fx.explosion(b.tx, b.ty, b.radius)
        this.sound("explosion")
        this.addShake(24)
        this.flash = 0.3
        this.hitstop = 0.05
        this.vibrate(70)
        if (this.phase !== "fight") return
        for (const def of this.fighters) {
            if (b.owner && (def === b.owner || def.side === b.owner.side)) continue
            const inside = Math.hypot((def.x - b.tx) / b.radius, (def.y - b.ty) / (b.radius * 0.5)) <= 1
            if (!inside || def.state === "dead") continue
            if (def.invulnerable) {
                if (def.state === "dash") this.fx.text(def.x, def.y - 120, "AUSGEWICHEN", { color: "#bfe3ff", size: 32 })
                continue
            }
            if (def.shieldT > 0) {
                this.fx.text(def.x, def.y - 120, "GEBLOCKT", { color: "#9fd0ff", size: 34 })
                this.sound("block")
                continue
            }
            let dmg = b.dmg
            if (this.training && def.hp - dmg < 1) dmg = Math.max(0, Math.ceil(def.hp - 1))
            def.takeHit({ x: b.tx, y: b.ty }, dmg, 650, true)
            def.stats.taken += dmg
            if (b.owner) {
                b.owner.stats.damage += dmg
                b.owner.stats.hits++
                this.emit("hit", { att: b.owner, def, dmg, heavy: true })
            }
            this.fx.text(def.x, def.y - 120, String(dmg), { color: "#ff9a3c", size: 72 })
            if (def.hp <= 0) {
                this.lastHit = { bomb: true }
                this.knockout(b.owner || this.targetFor(def), def)
            }
        }
    }

    // ---------------- Map-Gefahren & Chaos ----------------
    updateHazards(dt) {
        if (this.rules.noHazards) return
        if (!this.training) {
            if (this.map.hazard === "wind") this.updateWind(dt)
            if (this.map.hazard === "bloom") this.updateBlooms(dt)
        }
        if (this.map.hazard === "geyser" && !this.training) {
            this.hazardT -= dt
            if (this.hazardT <= 0) {
                this.hazardT = 5 + Math.random() * 4
                const near = this.fighters[Math.floor(Math.random() * this.fighters.length)]
                const [x, y] = ARENA.clamp(near.x + (Math.random() - 0.5) * 220, near.y + (Math.random() - 0.5) * 120, 40)
                this.geysers.push({ x, y, t: 0, warn: 1.1, radius: 90 })
                this.sound("geyserWarn")
            }
        }
        for (let i = this.geysers.length - 1; i >= 0; i--) {
            const g = this.geysers[i]
            g.t += dt
            if (g.t < g.warn) {
                if (Math.random() < dt * 20) this.fx.sparks(g.x + (Math.random() - 0.5) * 60, g.y, Math.random() < 0.5 ? 1 : -1, { count: 1, speed: 120, size: 6 })
                continue
            }
            this.geysers.splice(i, 1)
            this.fx.geyser(g.x, g.y)
            this.sound("geyser")
            this.addShake(14)
            for (const f of this.fighters) {
                if (f.state === "dead" || f.invulnerable || f.shieldT > 0) continue
                if (Math.hypot((f.x - g.x) / g.radius, (f.y - g.y) / (g.radius * 0.5)) > 1) continue
                f.takeHit({ x: g.x, y: g.y }, 10, 450, true)
                f.stats.taken += 10
                this.fx.text(f.x, f.y - 120, "10", { color: "#ff9a3c", size: 56 })
                if (f.hp <= 0) {
                    this.lastHit = { hazard: true }
                    this.knockout(this.targetFor(f), f)
                }
            }
        }

        if (this.rules.chaos) {
            this.chaosT -= dt
            if (this.chaosT <= 0) {
                this.chaosT = 1.8 + Math.random() * 2
                const t = this.fighters[Math.floor(Math.random() * this.fighters.length)]
                const [x, y] = ARENA.clamp(t.x + (Math.random() - 0.5) * 400, t.y + (Math.random() - 0.5) * 200, 30)
                this.dropBomb(x, y)
            }
        }
    }

    // Himmelsarena: Windstoß mit Vorwarnung, schiebt beide zur Seite
    updateWind(dt) {
        const w = this.wind
        if (w.active > 0) {
            w.active -= dt
            for (const f of this.fighters) {
                if (f.state === "dead" || f.state === "dash") continue
                f.vx += w.dir * 1800 * dt // gegen die Reibung ~200 px/s – man kann noch dagegen anlaufen
            }
            if (Math.random() < dt * 40) this.fx.wind(w.dir, this.camera, this.view)
            return
        }
        if (w.warn > 0) {
            w.warn -= dt
            if (Math.random() < dt * 8) this.fx.wind(w.dir, this.camera, this.view)
            if (w.warn <= 0) {
                w.active = 2.2
                this.sound("dash", { pitch: 0.5 })
                this.addShake(6)
            }
            return
        }
        w.t -= dt
        if (w.t <= 0) {
            w.t = 11 + Math.random() * 7
            w.warn = 1.2
            w.dir = Math.random() < 0.5 ? -1 : 1
            const me = this.fighters.find(f => f.isHuman) || this.fighters[0]
            this.fx.text(me.x, me.y - 170, w.dir > 0 ? "WINDSTOSS  >>>" : "<<<  WINDSTOSS", { color: "#e8f4ff", size: 36, life: 1.4, vy: -40 })
        }
    }

    // Wolkenhof: Heilblüten – wer zuerst drauftritt, bekommt Leben zurück
    updateBlooms(dt) {
        this.bloomT -= dt
        if (this.bloomT <= 0 && this.blooms.length < 1) {
            this.bloomT = 9 + Math.random() * 5
            const [x, y] = ARENA.clamp(ARENA.x0 + Math.random() * (ARENA.x1 - ARENA.x0), ARENA.y0 + Math.random() * (ARENA.y1 - ARENA.y0), 70)
            this.blooms.push({ x, y, t: 0, life: 9 })
            this.fx.ring(x, y, { radius: 70, color: "rgba(255,170,210,0.9)", life: 0.5, width: 6 })
        }
        for (let i = this.blooms.length - 1; i >= 0; i--) {
            const b = this.blooms[i]
            b.t += dt
            const taker = this.fighters.find(f => f.state !== "dead" && Math.hypot(f.x - b.x, (f.y - b.y) * 1.5) < 46)
            if (taker || b.t >= b.life) {
                this.blooms.splice(i, 1)
                if (!taker) continue
                const heal = Math.min(10, taker.maxHp - taker.hp)
                taker.hp += heal
                this.fx.heal(taker.x, taker.y)
                this.fx.ring(b.x, b.y, { radius: 90, color: "rgba(255,170,210,0.95)", life: 0.45, width: 8 })
                this.callout(taker, "+" + Math.round(heal) + " HEILBLÜTE", "#ff9fd0")
                this.sound("heal")
            }
        }
    }

    // ---------------- Arena: Deckung, Abgründe, Power-ups ----------------
    get ringOuts() {
        return !this.rules.noHazards && !this.demo
    }

    makeProps() {
        const list = ARENA_PROPS[this.map.id] || []
        // online (und im Tutorial) nur feste Deckung – zerstörbare Kisten würden auseinanderlaufen
        return list.filter(p => !this.rules.noHazards || p.type === "pillar")
            .map(p => ({ ...p, r: PROP_TYPES[p.type].r, hp: PROP_TYPES[p.type].hp, hitT: 0 }))
    }

    propAt(x, y, k = 1) {
        return this.props.find(pr => pr.hp > 0 && Math.abs(x - pr.x) < pr.r * k && Math.abs(y - pr.y) < 30)
    }

    damageProp(pr, by) {
        if (pr.hp === Infinity) {
            this.fx.sparks(pr.x, pr.y - 50, by ? -by.facing : 1, { count: 6, speed: 300, color: "#ffffff", color2: "#aab4c8" })
            return
        }
        if (pr.hp <= 0 || pr.hitT > 0.12) return
        pr.hp--
        pr.hitT = 0.25
        this.fx.sparks(pr.x, pr.y - 30, by ? by.facing : 1, { count: 10, speed: 380, color: "#d89a58", color2: "#7a4a24", size: 8 })
        this.sound("hit")
        this.addShake(4)
        if (pr.hp <= 0) {
            this.fx.dust(pr.x, pr.y, { count: 10, size: 22, color: this.map.dust })
            this.fx.sparks(pr.x, pr.y - 30, 1, { count: 22, speed: 560, spread: 3, color: "#d89a58", color2: "#7a4a24", size: 10 })
            this.dropItem(pr.x, pr.y, true)
        }
    }

    // Power-up: fällt vom Himmel (mit Schatten als Vorwarnung) oder liegt in einer Kiste
    dropItem(x, y, instant = false) {
        const types = Object.keys(ITEM_TYPES)
        this.items.push({ x, y, type: types[Math.floor(Math.random() * types.length)], t: 0, fall: instant ? 0 : 1.1, life: 11 })
    }

    updateArena(dt, fighting) {
        for (const pr of this.props) pr.hitT = Math.max(0, pr.hitT - dt)

        // Power-ups vom Himmel
        if (fighting && !this.rules.noHazards && !this.training) {
            this.itemT -= dt
            if (this.itemT <= 0 && this.items.length < 2) {
                this.itemT = 10 + Math.random() * 5
                for (let tries = 0; tries < 8; tries++) {
                    const [x, y] = ARENA.clamp(ARENA.x0 + Math.random() * (ARENA.x1 - ARENA.x0), ARENA.y0 + Math.random() * (ARENA.y1 - ARENA.y0), 90)
                    if (this.propAt(x, y, 2)) continue
                    this.dropItem(x, y)
                    break
                }
            }
        }
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i]
            it.t += dt
            if (it.fall > 0) {
                it.fall -= dt
                if (it.fall <= 0) {
                    this.fx.ring(it.x, it.y, { radius: 60, color: ITEM_TYPES[it.type].color, life: 0.35, width: 6 })
                    this.fx.dust(it.x, it.y, { count: 4, size: 14, color: this.map.dust })
                    this.sound("block")
                }
                continue
            }
            const taker = fighting && this.fighters.find(f => f.state !== "dead" && f.state !== "fall" && Math.hypot(f.x - it.x, (f.y - it.y) * 1.5) < 48)
            if (taker) {
                this.items.splice(i, 1)
                this.applyItem(taker, it)
            } else if (it.t > it.life) {
                this.items.splice(i, 1)
            }
        }

        // Schleim-Pfützen: verlangsamen und ätzen
        for (let i = this.puddles.length - 1; i >= 0; i--) {
            const pd = this.puddles[i]
            pd.t += dt
            pd.tick += dt
            const victim = this.enemiesOf(pd.owner).find(e => Math.hypot((e.x - pd.x) / 95, (e.y - pd.y) / 42) <= 1 && e.state !== "dead") || this.targetFor(pd.owner)
            const inside = Math.hypot((victim.x - pd.x) / 95, (victim.y - pd.y) / 42) <= 1
            if (inside && victim.state !== "dead") {
                victim.slowT = 0.2
                if (pd.tick >= 0.5 && this.phase === "fight") {
                    pd.tick = 0
                    let dmg = 2
                    if ((this.training || this.netRole === "guest") && victim.hp - dmg < 1) dmg = Math.max(0, Math.ceil(victim.hp - 1))
                    victim.hp = Math.max(0, victim.hp - dmg)
                    victim.stats.taken += dmg
                    pd.owner.stats.damage += dmg
                    this.fx.text(victim.x, victim.y - 100, String(dmg), { color: "#9dff6a", size: 24, life: 0.6 })
                    if (victim.hp <= 0) {
                        this.lastHit = { hazard: true }
                        this.knockout(pd.owner, victim)
                    }
                }
            }
            if (pd.t > pd.life) this.puddles.splice(i, 1)
        }
    }

    applyItem(f, it) {
        const def = ITEM_TYPES[it.type]
        if (it.type === "heal") {
            f.hp = Math.min(f.maxHp, f.hp + 15)
            this.fx.heal(f.x, f.y)
        } else if (it.type === "energy") {
            f.energy = f.maxEnergy
        } else {
            f.powerT = 7
        }
        this.fx.ring(f.x, f.y, { radius: 100, color: def.color, life: 0.45, width: 8 })
        this.callout(f, def.text, def.color)
        this.sound("coin")
        this.emit("item", { fighter: f, type: it.type })
    }

    spawnPuddle(owner, opp) {
        const visible = opp.stealthT <= 0 && Math.hypot(opp.x - owner.x, opp.y - owner.y) < 560
        const [x, y] = visible ? [opp.x, opp.y] : ARENA.clamp(owner.x + owner.facing * 220, owner.y)
        this.puddles.push({ owner, x, y, t: 0, tick: 0.4, life: 4.5 })
        this.fx.ring(x, y, { radius: 110, color: "rgba(140,255,120,0.9)", life: 0.4, width: 8 })
        this.fx.sparks(x, y - 20, 1, { count: 16, speed: 420, spread: 3, color: "#b6ff8a", color2: "#3aa04a", size: 9 })
        this.sound("quake")
    }

    // Ring-Out: Schaden, dann zurück auf die Arena (oder K.O.)
    ringOut(f) {
        const opp = this.targetFor(f)
        let dmg = RING_OUT_DMG
        if ((this.training || this.netRole === "guest") && f.hp - dmg < 1) dmg = Math.max(0, Math.ceil(f.hp - 1))
        f.hp = Math.max(0, f.hp - dmg)
        f.stats.taken += dmg
        opp.stats.damage += dmg
        f.x = WORLD.width / 2 + (f.x < WORLD.width / 2 ? -180 : 180)
        f.y = 560
        f.vx = f.vy = f.mvx = f.mvy = 0
        this.sound("hit", { heavy: true })
        this.addShake(20)
        this.flash = 0.3
        this.vibrate(120, f)
        this.emit("ringout", { fighter: f })
        if (f.hp <= 0 && this.phase === "fight") {
            f.state = "dead"
            f.stateT = 0
            f.setAnim("death")
            this.lastHit = { ringout: true }
            this.knockout(opp, f)
            return
        }
        f.toIdle()
        f.iframes = 1.2
        f.flashT = 0.3
        this.fx.smoke(f.x, f.y, 12, "rgba(255,255,255,0.7)")
        this.fx.ring(f.x, f.y, { radius: 120, color: "rgba(255,255,255,0.9)", life: 0.5, width: 8 })
        this.fx.text(f.x, f.y - 130, "RING-OUT! -" + dmg, { color: "#ffd84a", size: 36, life: 1.2 })
    }

    drawArenaGround(ctx) {
        // Schatten unter Säulen und Kisten
        for (const pr of this.props) {
            if (pr.hp <= 0) continue
            ctx.fillStyle = "rgba(20,10,5,0.32)"
            ctx.beginPath()
            ctx.ellipse(pr.x, pr.y + 6, pr.r + 6, 12, 0, 0, Math.PI * 2)
            ctx.fill()
        }
        // Schleim-Pfützen
        for (const pd of this.puddles) {
            const fade = Math.min(1, (pd.life - pd.t) * 2, pd.t * 6)
            ctx.save()
            ctx.globalAlpha = 0.75 * fade
            ctx.fillStyle = "#4fbf3c"
            ctx.beginPath()
            ctx.ellipse(pd.x, pd.y, 95, 42, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = "#9dff6a"
            for (let k = 0; k < 5; k++) {
                const a = k * 1.3 + pd.t * 0.7
                const bubble = (Math.sin(pd.t * 4 + k) + 1) * 4
                ctx.fillRect(pd.x + Math.cos(a) * 55, pd.y + Math.sin(a) * 22 - bubble, 8, 8)
            }
            ctx.restore()
        }
        // Power-ups: Schatten beim Fallen, dann schwebender Orb
        for (const it of this.items) {
            const color = ITEM_TYPES[it.type].color
            if (it.fall > 0) {
                const k = 1 - it.fall / 1.1
                ctx.save()
                ctx.globalAlpha = 0.25 + k * 0.4
                ctx.fillStyle = "rgba(20,10,5,0.5)"
                ctx.beginPath()
                ctx.ellipse(it.x, it.y, 14 + k * 20, 6 + k * 8, 0, 0, Math.PI * 2)
                ctx.fill()
                ctx.restore()
                drawItemOrb(ctx, it.x, it.y - it.fall * 520, it.type, it.t)
                continue
            }
            const blink = it.life - it.t < 2.5 && Math.sin(it.t * 20) > 0
            if (blink) continue
            ctx.save()
            ctx.globalAlpha = 0.3
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.ellipse(it.x, it.y, 26, 10, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
            drawItemOrb(ctx, it.x, it.y, it.type, it.t)
        }
    }

    // ---------------- Online (Gast) ----------------
    // Spielstand vom Host übernehmen: kleine Abweichungen weich, große hart korrigieren
    applySnapshot(msg) {
        msg.f.forEach(([x, y, hp, energy, guard, spcd], i) => {
            const f = this.fighters[i]
            if (f.state === "dead") return
            const d = Math.hypot(f.x - x, f.y - y)
            const k = d > 70 ? 1 : 0.35
            f.x += (x - f.x) * k
            f.y += (y - f.y) * k
            if (hp > 0) f.hp = hp
            f.energy = energy
            f.guard = guard
            f.specialCd = spcd
        })
        if (this.phase === "fight") {
            this.timer = msg.timer
            this.wins = [...msg.wins]
        }
    }

    netKnockout(msg) {
        if (this.phase !== "fight") return
        const loser = this.fighters[msg.loser]
        const winner = this.fighters[1 - msg.loser]
        loser.hp = 0
        loser.state = "dead"
        loser.stateT = 0
        loser.setAnim("death")
        this.forcedFinisher = msg.fin
        this.knockout(winner, loser)
    }

    netTimeUp() {
        this.endRound()
    }

    // ---------------- Finisher-Wiederholung ----------------
    // Merkt sich die letzten ~1,6 s (Figuren + Geschosse), solange gekämpft wird
    record() {
        if (this.demo || this.training || !this.settings.replay) return
        if (this.phase !== "fight" && !(this.phase === "ko" && this.phaseT < 0.7)) return
        const snap = f => ({ x: f.x, y: f.y, facing: f.facing, anim: f.anim, frame: f.frame, champId: f.champId, alpha: f.stealthAlpha(), dead: f.state === "dead" })
        this.rec.push({
            t: this.time,
            f: this.fighters.map(snap),
            p: this.projectiles.map(p => ({ img: p.img, x: p.x, y: p.y, h: p.h, vx: p.vx, aimY: p.aimY, state: p.state, t: p.t, cfg: p.cfg }))
        })
        while (this.rec.length && this.rec[0].t < this.time - 1.6) this.rec.shift()
    }

    startReplay() {
        const ko = this.rec.findIndex(r => r.t >= this.koTime) // Moment des K.O.-Treffers
        this.replay = { i: 0, t: this.rec[0].t, koIdx: ko < 0 ? this.rec.length - 1 : ko, boom: false, skipReady: 0.4 }
        this.setPhase("replay")
        this.emit("replay", { on: true })
        this.emit("banner", { text: "WIEDERHOLUNG", kind: "info", time: 1.2 })
    }

    updateReplay(realDt) {
        const r = this.replay
        r.t += realDt * 0.4
        r.skipReady -= realDt
        while (r.i < this.rec.length - 1 && this.rec[r.i + 1].t <= r.t) r.i++
        if (!r.boom && r.i >= r.koIdx) {
            r.boom = true
            const loser = this.rec[r.i].f[this.koIndex]
            this.fx.sparks(loser.x, loser.y - 60, 1, { count: 40, speed: 900, spread: 3, size: 9 })
            this.fx.ring(loser.x, loser.y, { radius: 260, color: "rgba(255,255,255,0.95)", life: 0.7, width: 16 })
            this.sound("hit", { heavy: true })
            this.addShake(24)
            this.flash = 0.6
        }
        this.fx.update(realDt * 0.4)
        this.flash = Math.max(0, this.flash - realDt * 2)
        this.shake = Math.max(0, this.shake - realDt * 60)
        this.updateCamera(realDt)
        const skip = r.skipReady <= 0 && this.fighters.some(f => {
            if (!f.isHuman) return false
            const inp = f.controller && f.controller.read ? f.controller.read() : NO_INPUT
            return inp.light || inp.heavy || inp.ability || inp.dash || inp.pause
        })
        if (r.i >= this.rec.length - 1 || skip) {
            this.emit("replay", { on: false })
            this.setPhase("ko")       // letzte Szene ohne REPLAY-Balken stehen lassen
            this.phaseT = 9
            this.over = true
            this.emit("matchEnd", { winner: this.roundWinner })
        }
    }

    // Training: Leben füllt sich wieder auf, Energie ist unendlich
    updateTraining(dt) {
        if (!this.training) return
        for (const f of this.fighters) {
            f.regenT = (f.regenT || 0) + dt
            if (f.state === "hurt" || f.state === "dizzy" || f.state === "block") f.regenT = 0
            if (f.regenT > 1.4 && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + 60 * dt)
            if (f.isHuman) f.energy = f.maxEnergy
        }
    }

    // ---------------- Rundenende ----------------
    knockout(winner, loser) {
        if (this.phase !== "fight") return
        if (this.team2 && this.teamAlive(loser.side)) {
            this.fx.text(loser.x, loser.y - 130, "K.O.!", { color: "#ff6a6a", size: 40, life: 1.2 })
            this.fx.ring(loser.x, loser.y, { radius: 160, color: "rgba(255,255,255,0.9)", life: 0.5, width: 10 })
            this.sound("ko")
            this.addShake(18)
            this.hitstop = 0.12
            this.lastHit = null
            this.emit("teamKo", { winner, loser })
            return
        }
        this.koIndex = this.fighters.indexOf(loser)
        this.setPhase("ko")
        this.roundResolved = false
        this.roundWinner = winner.side
        this.koTarget = loser
        this.koTime = this.time
        const fin = this.forcedFinisher || this.finisherName(this.lastHit || {})
        this.forcedFinisher = null
        this.lastHit = null
        this.finisher = fin
        this.slowmoT = fin.big ? 1.6 : 1.1
        this.hitstop = fin.big ? 0.28 : 0.15
        this.flash = 0.8
        this.addShake(fin.big ? 40 : 30)
        this.sound("ko")
        if (fin.big) this.sound("guardBreak")
        this.vibrate(fin.big ? 260 : 160)

        // Finisher-Effekt: Schockwellen in der Farbe des Siegers, Funkenregen
        const x = loser.x
        const y = loser.y
        const dir = Math.sign(loser.x - winner.x) || 1
        this.fx.ring(x, y, { radius: 300, color: "rgba(255,255,255,0.95)", life: 0.8, width: 18 })
        this.fx.ring(x, y, { radius: 200, color: winner.champ.color, life: 0.6, width: 24 })
        this.fx.ring(x, y - 60, { radius: 150, color: "rgba(255,230,150,0.9)", life: 0.5, width: 10, ground: false })
        this.fx.sparks(x, y - 60, dir, { count: 40, speed: 950, spread: 2.6, size: 9 })
        this.fx.dust(x, y, { count: 14, size: 30, color: this.map.dust })
        if (fin.big) {
            this.fx.explosion(x, y, 110)
            loser.vx *= 1.4
        }
        this.emit("finisher", { winner, loser, name: fin.text, fin })
        this.emit("banner", { text: fin.text, sub: fin.sub, kind: "ko", time: fin.big ? 1.8 : 1.4 })
    }

    // Name des Finishers – je nachdem, womit der letzte Treffer kam
    finisherName(h) {
        if (h.ringout) return { text: "RING-OUT!", sub: "Ab in die Wolken", big: true }
        if (h.hazard) return { text: "K.O.", sub: "Die Arena schlägt zurück" }
        if (h.bomb) return { text: "BOOM!", sub: "Bomben-Finish", big: true }
        if (h.ambush) return { text: "SCHATTEN-FINISH", sub: "Aus dem Hinterhalt", big: true }
        if (h.counter) return { text: "KONTER-K.O.", sub: "Perfekt abgepasst", big: true }
        if (!h.melee) return { text: "SUPER FINISH", sub: "Magie-Treffer", big: true }
        if (h.combo >= 4) return { text: h.combo + "-HIT FINISH", sub: "Kombo-Finisher", big: true }
        if (h.aimY > 0) return { text: "VON OBEN!", sub: "Finisher", big: h.heavy }
        if (h.aimY < 0) return { text: "UPPERCUT!", sub: "Finisher", big: h.heavy }
        if (h.throw) return { text: "WURF-K.O.", sub: "Über die Schulter", big: true }
        if (h.heavy) return { text: "BRUTAL!", sub: "Schwerer Finisher", big: true }
        return { text: "K.O.", sub: "" }
    }

    endRound() {
        if (this.phase !== "fight") return
        this.setPhase("timeup")
        this.roundResolved = false
        // Zeit abgelaufen: Team mit mehr Leben (anteilig) gewinnt
        const share = side => {
            const team = this.fighters.filter(f => f.side === side)
            return team.reduce((s, f) => s + Math.max(0, f.hp) / f.maxHp, 0) / team.length
        }
        const ra = share(0)
        const rb = share(1)
        this.roundWinner = Math.abs(ra - rb) < 0.001 ? -1 : ra > rb ? 0 : 1
        this.emit("timeUp")
        this.emit("banner", { text: "TIME!", kind: "ko", time: 1.2 })
        this.sound("ko")
    }

    resolveRound() {
        this.roundResolved = true
        const w = this.roundWinner
        if (w === -1) {
            this.emit("banner", { text: "UNENTSCHIEDEN", kind: "info", time: 1.8 })
            return
        }
        this.wins[w]++
        const f = this.leads[w]
        const perfect = f.hp >= f.maxHp
        this.emit("roundWin", { side: w, perfect, hp: f.hp, maxHp: f.maxHp, timeLeft: this.timer })
        this.emit("banner", {
            text: perfect ? "PERFECT!" : this.winnerName(w) + " GEWINNT",
            sub: perfect ? this.winnerName(w) + " gewinnt die Runde" : `Runde ${this.round}`,
            kind: "win", side: w, time: 1.9
        })
        if (!f.isHuman && this.humanCount === 1) this.sound("defeat")
        else this.sound("victory")
    }

    winnerName(side) {
        if (this.demo) return this.fighters[side].champ.name.toUpperCase()
        if (this.team2) return side === 0 ? "TEAM BLAU" : "TEAM ROT"
        if (this.localSide !== undefined) return side === this.localSide ? "DU" : "GEGNER"
        if (this.humanCount === 1) return side === 0 ? "DU" : this.leads[1].champ.name.toUpperCase()
        return side === 0 ? "SPIELER 1" : "SPIELER 2"
    }

    nextRoundOrEnd() {
        const decided = this.wins[0] >= this.roundsToWin || this.wins[1] >= this.roundsToWin
        const tooLong = this.round >= (this.rules.rounds || 3) + 2
        if (decided || (tooLong && this.wins[0] !== this.wins[1])) {
            const winner = this.wins[0] > this.wins[1] ? 0 : 1
            // Entscheidender K.O.: Zeitlupen-Wiederholung des Finishers
            if (this.settings.replay && this.koTime !== undefined && this.rec.length > 30 && this.roundWinner === winner && this.koTarget) {
                this.roundWinner = winner
                return this.startReplay()
            }
            this.over = true
            this.emit("matchEnd", { winner })
            return
        }
        this.round++
        this.timer = this.rules.roundTime || 60
        this.lastSecond = Math.ceil(this.timer)
        this.bombs.length = 0
        this.projectiles.length = 0
        this.zones.length = 0
        this.geysers.length = 0
        this.blooms.length = 0
        this.items.length = 0
        this.puddles.length = 0
        this.props = this.makeProps()
        this.rec.length = 0
        this.koTime = undefined
        this.fx.clear()
        this.fighters.forEach(f => f.reset(this.spawnFor(f)))
        this.koTarget = null
        this.introStep = -1
        this.setPhase("intro")
        this.emit("roundStart", { round: this.round })
    }

    // ---------------- Kamera ----------------
    setView(w, h) {
        this.view.w = w
        this.view.h = h
    }

    updateCamera(dt) {
        const { w, h } = this.view
        const cover = Math.max(w / WORLD.width, h / WORLD.height)
        const [a, b] = this.fighters
        // Allein: die eigene Figur steht immer in der Bildmitte, der Gegner bleibt im Bild.
        // Zu zweit (oder Demo): Mitte zwischen beiden.
        const me = this.localSide !== undefined ? this.fighters[this.localSide] : this.humanCount === 1 ? this.fighters.find(f => f.isHuman) : null
        let cx, cy, needW, needH
        if (me) {
            const op = this.targetFor(me)
            cx = me.x
            cy = me.y - 70
            needW = Math.abs(op.x - me.x) * 2 + 460
            needH = Math.abs(op.y - me.y) * 2 + 400
        } else {
            cx = (a.x + b.x) / 2
            cy = (a.y + b.y) / 2 - 70
            needW = Math.abs(a.x - b.x) + 560
            needH = Math.abs(a.y - b.y) + 440
        }
        let zoom = Math.min(w / needW, h / needH)
        zoom = Math.max(cover * (me ? 0.8 : 1), Math.min(cover * 1.45, zoom))

        if (this.phase === "replay") {
            const snap = this.rec[this.replay.i].f[this.koIndex]
            cx = snap.x
            cy = snap.y - 60
            zoom = cover * 1.6
        } else if (this.koTarget && this.phase === "ko") {
            cx = this.koTarget.x
            cy = this.koTarget.y - 60
            zoom = Math.min(cover * 1.7, zoom * 1.3)
        }
        if (this.phase === "vs") zoom = cover

        const cam = this.camera
        const k = cam.ready ? 1 - Math.exp(-(this.koTarget ? 5 : 3.2) * dt) : 1
        const kPos = cam.ready ? 1 - Math.exp(-(me && !this.koTarget ? 9 : this.koTarget ? 5 : 3.2) * dt) : 1
        cam.zoom += (zoom - cam.zoom) * k
        // kurzer Zoom-Stoß bei harten Treffern
        if (this.punch > 0) {
            cam.zoom *= 1 + this.punch
            this.punch = Math.max(0, this.punch - dt * 0.6)
        }
        cam.x += (cx - cam.x) * kPos
        cam.y += (cy - cam.y) * kPos
        cam.ready = true

        // Zu zweit: Kamera nicht über den Bildrand hinaus (allein darf sie, damit man mittig bleibt)
        if (!me) {
            const halfW = w / 2 / cam.zoom
            const halfH = h / 2 / cam.zoom
            cam.x = Math.max(halfW, Math.min(WORLD.width - halfW, cam.x))
            cam.y = Math.max(halfH, Math.min(WORLD.height - halfH, cam.y))
        }
    }

    // ---------------- Zeichnen ----------------
    render(ctx, w, h) {
        const cam = this.camera
        ctx.save()
        ctx.imageSmoothingEnabled = false
        this.drawBackdrop(ctx, w, h)

        // Umgebungspartikel (nicht zu viele)
        if (this.fx.particles.length < 260 && Math.random() < (this.map.ambient === "snow" ? 0.9 : this.map.ambient === "embers" ? 0.6 : this.map.ambient === "petals" ? 0.25 : 0.15)) {
            this.fx.ambient(this.map.ambient, cam, this.view)
        }

        const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0
        const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0
        const px = SPRITE_SCALE * cam.zoom
        this.pixel = this.pixel || new PixelLayer()
        const toWorld = () => {
            ctx.translate(w / 2 + sx, h / 2 + sy)
            ctx.scale(cam.zoom, cam.zoom)
            ctx.translate(-cam.x, -cam.y)
        }
        ctx.save()
        toWorld()

        ctx.drawImage(this.featheredMap(), 0, 0, WORLD.width, WORLD.height)

        // Lava-Glühen auf der Vulkan-Map
        if (this.map.id === "volcano") {
            ctx.save()
            ctx.globalCompositeOperation = "lighter"
            ctx.globalAlpha = 0.06 + Math.sin(this.time * 1.7) * 0.03
            ctx.fillStyle = "#ff5a1f"
            // nur auf der Insel glühen, nicht über den Wolken
            ctx.fillRect(ARENA.x0 - 40, ARENA.y0 - 30, ARENA.x1 - ARENA.x0 + 80, ARENA.y1 - ARENA.y0 + 60)
            ctx.restore()
        }

        ctx.restore()

        // Boden-Effekte in Pixel-Auflösung: Brandflecken, Warnkreise, Schatten
        const ground = this.pixel.begin(w, h, cam, sx, sy, px)
        this.fx.drawGround(ground)
        this.drawTelegraphs(ground)
        this.drawArenaGround(ground)
        if (this.phase !== "replay") for (const f of this.fighters) f.drawShadow(ground)
        this.pixel.end(ctx)

        // Figuren & Geschosse (Sprites)
        ctx.save()
        toWorld()
        // Tiefensortierung: wer weiter unten steht, wird später gezeichnet
        const drawables = [...this.fighters].sort((p, q) => p.y - q.y)
        if (this.phase === "replay") this.drawReplay(ctx)
        else {
            const scene = [
                ...this.fighters.map(f => ({ y: f.state === "fall" ? -1 : f.y, d: () => f.draw(ctx) })),
                ...this.props.filter(pr => pr.hp > 0).map(pr => ({ y: pr.y, d: () => drawProp(ctx, pr, this.map.id) }))
            ].sort((p, q) => p.y - q.y)
            for (const o of scene) o.d()
            this.drawProjectiles(ctx)
        }
        this.drawBombs(ctx)
        ctx.restore()

        // Effekte darüber in Pixel-Auflösung: Funken, Ringe, Rauch, Fähigkeiten, Zahlen
        const top = this.pixel.begin(w, h, cam, sx, sy, px)
        if (this.phase !== "replay") for (const f of drawables) f.drawFx(top)
        if (this.team2 && this.phase !== "replay") this.drawTeamBars(top)
        this.fx.draw(top)
        this.fx.drawTexts(top)
        this.pixel.end(ctx)
        if (this.phase === "fight") {
            ctx.save()
            toWorld()
            this.drawAbilityCues(ctx)
            ctx.restore()
        }
        ctx.restore()

        // Bildschirm-Effekte
        if (this.flash > 0) {
            ctx.fillStyle = `rgba(255,250,235,${Math.min(0.75, this.flash)})`
            ctx.fillRect(0, 0, w, h)
        }
        if (this.phase === "ko" && this.phaseT < 1.6) {
            ctx.fillStyle = `rgba(10,5,20,${Math.min(0.35, this.phaseT * 0.5)})`
            ctx.fillRect(0, 0, w, h)
        }
        // Wiederholung: Kino-Balken, Sepia-Schleier und REPLAY-Anzeige
        if (this.phase === "replay") {
            ctx.fillStyle = "rgba(60,40,20,0.12)"
            ctx.fillRect(0, 0, w, h)
            ctx.fillStyle = "#05070f"
            ctx.fillRect(0, 0, w, h * 0.1)
            ctx.fillRect(0, h * 0.9, w, h * 0.1)
            ctx.font = `${Math.round(h * 0.045)}px "Bebas Neue", Impact, sans-serif`
            ctx.fillStyle = "#fff"
            ctx.textBaseline = "middle"
            ctx.fillText("REPLAY", w * 0.04 + h * 0.045, h * 0.05)
            if (Math.sin(this.phaseT * 6) > 0) {
                ctx.fillStyle = "#e33a3a"
                ctx.beginPath()
                ctx.arc(w * 0.04, h * 0.05, h * 0.013, 0, Math.PI * 2)
                ctx.fill()
            }
            ctx.textAlign = "right"
            ctx.font = `${Math.round(h * 0.03)}px "Quantico", sans-serif`
            ctx.fillText("Taste drücken zum Überspringen", w * 0.96, h * 0.95)
            ctx.textAlign = "left"
        }
        // Kino-Balken beim Finisher
        if (this.phase === "ko") {
            const t = this.phaseT
            const k = Math.min(1, t * 5) * (t > 3.1 ? Math.max(0, 1 - (t - 3.1) * 3) : 1)
            const bar = h * (this.finisher && this.finisher.big ? 0.1 : 0.07) * k
            ctx.fillStyle = "#05070f"
            ctx.fillRect(0, 0, w, bar)
            ctx.fillRect(0, h - bar, w, bar)
        }
        // Rote Ränder bei wenig Leben (nur wenn ein Mensch allein spielt)
        const human = this.humanCount === 1 && this.fighters.find(f => f.isHuman)
        if (human && human.hp > 0 && human.hp <= human.maxHp * 0.25) {
            const pulse = 0.25 + Math.sin(this.time * 6) * 0.12
            const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7)
            g.addColorStop(0, "rgba(200,0,0,0)")
            g.addColorStop(1, `rgba(200,0,20,${pulse})`)
            ctx.fillStyle = g
            ctx.fillRect(0, 0, w, h)
        }
    }

    // Am PC: über dem eigenen Kämpfer erscheint die Taste, sobald die Fähigkeit bereit ist
    drawAbilityCues(ctx) {
        if (isTouchDevice()) return
        for (const f of this.fighters) {
            if (!f.isHuman || !f.abilityReady || f.state === "dead" || f.state === "fall") continue
            if (this.localSide !== undefined && f.side !== this.localSide) continue
            if (Link.padFor(f.slot)) continue
            const map = keymap(this.humanCount === 2 && this.localSide === undefined ? (f.side === 0 ? "p1" : "p2") : "solo")
            const key = keyLabel(map.ability[0])
            const t = f.readyPulse
            const pop = t < 0.35 ? 1 + Math.sin(t / 0.35 * Math.PI) * 0.6 : 1 + Math.sin(t * 6) * 0.06
            const y = f.y - (this.team2 ? 172 : 140)
            ctx.save()
            ctx.translate(f.x, y)
            ctx.scale(pop, pop)
            ctx.font = '26px "Bebas Neue", Impact, sans-serif'
            ctx.textBaseline = "middle"
            const label = "FÄHIGKEIT"
            const kw = Math.max(30, ctx.measureText(key).width + 16)
            const lw = ctx.measureText(label).width
            const w = kw + lw + 22
            const x0 = -w / 2
            ctx.fillStyle = "rgba(14,10,30,0.82)"
            ctx.fillRect(x0 - 3, -20, w + 6, 40)
            ctx.fillStyle = f.champ.color
            ctx.fillRect(x0, -17, w, 34)
            ctx.fillStyle = "rgba(14,10,30,0.55)"
            ctx.fillRect(x0 + kw + 6, -17, w - kw - 6, 34)
            ctx.fillStyle = "#fff"
            ctx.fillRect(x0 + 4, -13, kw, 26)
            ctx.fillStyle = "#16102a"
            ctx.textAlign = "center"
            ctx.fillText(key, x0 + 4 + kw / 2, 1)
            ctx.fillStyle = "#fff"
            ctx.textAlign = "left"
            ctx.fillText(label, x0 + kw + 13, 1)
            // kleiner Zeiger nach unten
            ctx.fillStyle = "rgba(14,10,30,0.82)"
            ctx.fillRect(-6, 20, 12, 5)
            ctx.fillRect(-3, 25, 6, 5)
            ctx.restore()
        }
    }

    drawTeamBars(ctx) {
        for (const f of this.fighters) {
            if (f.state === "dead" || f.state === "fall") continue
            const x = f.x - 34
            const y = f.y - 112
            ctx.fillStyle = "rgba(10,10,30,0.75)"
            ctx.fillRect(x - 3, y - 3, 74, 13)
            ctx.fillStyle = SIDE_COLORS[f.side]
            ctx.fillRect(x, y, 68 * Math.max(0, f.hp) / f.maxHp, 7)
            if (f.isHuman) {
                // Pfeil über dem eigenen Kämpfer
                ctx.fillStyle = "#ffffff"
                ctx.fillRect(f.x - 9, y - 18, 18, 6)
                ctx.fillRect(f.x - 3, y - 12, 6, 6)
            }
        }
    }

    // Wolkenhimmel hinter der Map (bewegt sich langsamer als die Kamera = Tiefe), je Map eingefärbt
    drawBackdrop(ctx, w, h) {
        const img = IMAGES.sky
        const cam = this.camera
        const [top, bottom] = this.map.bg || ["#3f7bd9", "#9ccaf5"]
        const grad = ctx.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, top)
        grad.addColorStop(1, bottom)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
        if (!img || !img.complete) return
        const s = Math.max(h * 1.25 / img.height, w * 0.6 / img.width)
        const tw = img.width * s
        const th = img.height * s
        const shift = (cam.x * cam.zoom * 0.35 + this.time * 14) % (tw * 2)
        const y = (h - th) / 2 - (cam.y - WORLD.height / 2) * cam.zoom * 0.2
        ctx.save()
        ctx.imageSmoothingEnabled = true
        ctx.globalAlpha = this.map.cloudAlpha ?? 1
        // abwechselnd gespiegelt, damit keine Nahtstelle sichtbar ist
        for (let i = -1, x = -shift; x < w; i++, x += tw) {
            if (x + tw < 0) continue
            ctx.save()
            if (Math.abs(i) % 2 === 1) {
                ctx.translate(x + tw, y)
                ctx.scale(-1, 1)
                ctx.drawImage(img, -1, 0, tw + 2, th)
            } else {
                ctx.drawImage(img, x - 1, y, tw + 2, th)
            }
            ctx.restore()
        }
        ctx.restore()
        // Einfärbung passend zur Map (Abendrot, Glut, Nacht)
        if (this.map.tint) {
            ctx.save()
            ctx.globalAlpha = this.map.tint[1]
            ctx.fillStyle = this.map.tint[0]
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }
    }

    // Map-Bild mit weich ausgeblendeten Rändern (einmal pro Map erzeugt)
    featheredMap() {
        // mit Ring-Out: die Arena ist eine schwebende Insel ohne Mauern (man sieht, dass man runterfallen kann)
        const key = "feather:" + this.map.id + (this.ringOuts ? ":island" : "")
        if (IMAGES[key]) return IMAGES[key]
        const src = IMAGES["map:" + this.map.id]
        const c = document.createElement("canvas")
        c.width = WORLD.width
        c.height = WORLD.height
        const g = c.getContext("2d")
        g.drawImage(src, 0, 0)
        g.globalCompositeOperation = "destination-out"
        const F = 160
        const edges = [
            [0, 0, F, 0, 0, 0, F, WORLD.height],
            [WORLD.width, 0, WORLD.width - F, 0, WORLD.width - F, 0, F, WORLD.height],
            [0, 0, 0, F, 0, 0, WORLD.width, F],
            [0, WORLD.height, 0, WORLD.height - F, 0, WORLD.height - F, WORLD.width, F]
        ]
        for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
            const gr = g.createLinearGradient(x0, y0, x1, y1)
            gr.addColorStop(0, "rgba(0,0,0,1)")
            gr.addColorStop(1, "rgba(0,0,0,0)")
            g.fillStyle = gr
            g.fillRect(rx, ry, rw, rh)
        }
        if (this.ringOuts) this.cutIsland(g)
        IMAGES[key] = c
        return c
    }

    // Alles außerhalb der Bodenfläche wegschneiden, Abbruchkanten und eine Felswand darunter zeichnen
    cutIsland(g) {
        const W = WORLD.width
        const H = WORLD.height
        const [soil, rock, deep] = this.map.cliff || ["#8a5a32", "#6b4528", "#3a2416"]
        const jag = v => Math.round(Math.sin(v * 0.09) * 5 + Math.sin(v * 0.31) * 3)
        const top = ARENA.y0 - 22
        const bot = ARENA.y1 + 22
        const side = y => {
            const [l, r] = ARENA.span(Math.max(ARENA.y0, Math.min(ARENA.y1, y)))
            return [l - 30 + jag(y), r + 30 - jag(y + 50)]
        }
        const [l0, r0] = side(top)
        const [lb, rb] = side(bot)

        // 1) wegschneiden
        g.globalCompositeOperation = "destination-out"
        g.fillStyle = "#000"
        for (let x = 0; x < W; x += 3) {
            const yt = top + jag(x)
            const yb = bot + jag(x + 20)
            g.fillRect(x, 0, 3, yt)
            g.fillRect(x, yb, 3, H - yb)
        }
        for (let y = top - 12; y <= bot + 12; y += 3) {
            const [l, r] = side(y)
            g.fillRect(0, y, l, 3)
            g.fillRect(r, y, W - r, 3)
        }

        // 2) Felswand unter der vorderen Kante (Unterseite der Insel)
        g.globalCompositeOperation = "source-over"
        for (let x = lb + 6; x < rb - 6; x += 3) {
            const yb = bot + jag(x + 20)
            const edgeK = Math.min(1, (x - lb) / 120, (rb - x) / 120)
            const depth = (40 + jag(x * 2) * 3 + 30 * edgeK) * edgeK + 8
            g.fillStyle = soil
            g.fillRect(x, yb, 3, 10)
            g.fillStyle = rock
            g.fillRect(x, yb + 10, 3, depth)
            g.fillStyle = deep
            g.fillRect(x, yb + 10 + depth * 0.6, 3, depth * 0.4)
            if ((x / 3) % 7 === 0) {
                g.fillStyle = deep
                g.fillRect(x, yb + 14, 3, depth * 0.5)
            }
        }

        // 3) Abbruchkanten an den Seiten und hinten
        for (let y = top; y <= bot; y += 3) {
            const [l, r] = side(y)
            g.fillStyle = rock
            g.fillRect(l, y, 8, 3)
            g.fillRect(r - 8, y, 8, 3)
            g.fillStyle = deep
            g.fillRect(l, y, 3, 3)
            g.fillRect(r - 3, y, 3, 3)
        }
        for (let x = l0; x < r0; x += 3) {
            const yt = top + jag(x)
            g.fillStyle = deep
            g.fillRect(x, yt, 3, 3)
            g.fillStyle = rock
            g.fillRect(x, yt + 3, 3, 4)
        }
    }

    drawTelegraphs(ctx) {
        for (const b of this.bombs) {
            const target = b.phase === "fuse" ? 1 : Math.min(1, b.t / b.flight)
            const blink = b.phase === "fuse" && Math.sin(b.t * (20 + b.t * 40)) > 0
            ctx.save()
            ctx.globalAlpha = 0.25 + target * 0.35
            ctx.fillStyle = blink ? "rgba(255,80,40,0.45)" : "rgba(255,60,30,0.22)"
            ctx.strokeStyle = "rgba(255,120,60,0.95)"
            ctx.lineWidth = 4
            ctx.setLineDash([16, 10])
            ctx.beginPath()
            ctx.ellipse(b.tx, b.ty, b.radius, b.radius * 0.5, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
            if (b.phase === "fuse") {
                const k = b.t / b.fuse
                ctx.setLineDash([])
                ctx.fillStyle = "rgba(255,150,50,0.35)"
                ctx.beginPath()
                ctx.ellipse(b.tx, b.ty, b.radius * k, b.radius * 0.5 * k, 0, 0, Math.PI * 2)
                ctx.fill()
            }
            ctx.restore()
        }
        for (const b of this.blooms) {
            const pulse = 0.6 + Math.sin(b.t * 6) * 0.25
            const fade = Math.min(1, (b.life - b.t) * 2)
            ctx.save()
            ctx.globalAlpha = fade
            ctx.fillStyle = `rgba(255,170,210,${0.25 * pulse})`
            ctx.beginPath()
            ctx.ellipse(b.x, b.y, 54, 22, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = "rgba(255,200,230,0.9)"
            ctx.lineWidth = 4
            ctx.stroke()
            // Blüte: vier Blätter und eine goldene Mitte
            const s = 9
            const y = b.y - 16 - Math.sin(b.t * 3) * 3
            ctx.fillStyle = "#ff8fc2"
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillRect(b.x + dx * s - s / 2, y + dy * s - s / 2, s, s)
            ctx.fillStyle = "#ffe27a"
            ctx.fillRect(b.x - s / 2, y - s / 2, s, s)
            ctx.restore()
        }
        for (const g of this.geysers) {
            const k = g.t / g.warn
            ctx.save()
            ctx.globalAlpha = 0.3 + k * 0.5 + (Math.sin(g.t * 30) > 0 ? 0.15 : 0)
            const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.radius)
            grad.addColorStop(0, "rgba(255,220,120,0.9)")
            grad.addColorStop(0.6, "rgba(255,90,30,0.6)")
            grad.addColorStop(1, "rgba(255,60,20,0)")
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.ellipse(g.x, g.y, g.radius, g.radius * 0.5, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
        }
        for (const z of this.zones) {
            if (z.done) continue
            ctx.save()
            ctx.globalAlpha = 0.6
            ctx.strokeStyle = z.color
            ctx.lineWidth = 4
            ctx.beginPath()
            ctx.ellipse(z.x, z.y, z.radius, z.radius * 0.5, 0, 0, Math.PI * 2)
            ctx.stroke()
            ctx.restore()
        }
    }

    // Figuren und Geschosse aus der Aufnahme zeichnen
    drawReplay(ctx) {
        const r = this.rec[this.replay.i]
        const order = [...r.f].sort((a, b) => a.y - b.y)
        for (const s of order) {
            const f = this.fighters[r.f.indexOf(s)]
            const img = champImage(s.champId, s.anim.file)
            if (!f || !img) continue
            const g = f.geom
            ctx.save()
            ctx.translate(Math.round(s.x), Math.round(s.y))
            if (s.facing < 0) ctx.scale(-1, 1)
            ctx.globalAlpha = s.alpha
            ctx.drawImage(img, s.frame * FRAME, 0, FRAME, FRAME, -g.ax, -g.ay, g.w, g.h)
            ctx.restore()
        }
        const live = this.projectiles
        this.projectiles = r.p
        this.drawProjectiles(ctx)
        this.projectiles = live
    }

    drawProjectiles(ctx) {
        for (const p of this.projectiles) {
            if (!p.img || !p.img.complete) continue
            const fps = 14
            const frame = p.state === "fly"
                ? Math.floor(p.t * fps) % p.cfg.flyFrames
                : Math.min(p.cfg.hitFrames[1], p.cfg.hitFrames[0] + Math.floor(p.t * fps))
            const s = SPRITE_SCALE * 1.3
            ctx.save()
            ctx.translate(p.x, p.y - p.h)
            if (p.aimY && p.state === "fly") ctx.rotate(p.aimY * Math.PI / 2)
            else if (p.vx < 0) ctx.scale(-1, 1)
            ctx.drawImage(p.img, frame * FRAME, 0, FRAME, FRAME, -51 * s, -51 * s, FRAME * s, FRAME * s)
            ctx.restore()
            if (p.state === "fly") {
                ctx.save()
                ctx.fillStyle = "rgba(0,0,0,0.25)"
                ctx.beginPath()
                ctx.ellipse(p.x, p.y, 16, 6, 0, 0, Math.PI * 2)
                ctx.fill()
                ctx.restore()
            }
        }
    }

    drawBombs(ctx) {
        const img = IMAGES.bomb
        for (const b of this.bombs) {
            const size = 52 + b.stacks * 4
            ctx.save()
            ctx.fillStyle = "rgba(0,0,0,0.3)"
            ctx.beginPath()
            ctx.ellipse(b.x, b.y, 18, 7, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.translate(b.x, b.y - b.h - size / 2)
            if (b.phase === "air") ctx.rotate(b.t * 14)
            else ctx.scale(1 + Math.sin(b.t * 40) * 0.08, 1 - Math.sin(b.t * 40) * 0.08)
            ctx.drawImage(img, -size / 2, -size / 2, size, size)
            ctx.restore()
            if (b.phase === "fuse" && Math.random() < 0.5) {
                this.fx.sparks(b.x + 8, b.y - size + 4, Math.random() < 0.5 ? 1 : -1, { count: 1, speed: 160, size: 5 })
            }
        }
    }
}

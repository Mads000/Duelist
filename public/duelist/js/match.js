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
        this.training = rules.mode === "training"
        this.settings = settings
        this.onEvent = onEvent || (() => {})
        this.map = { ...MAPS[rules.map || "sky"], dust: MAP_DUST[rules.map || "sky"] }
        this.fx = new Effects()
        const hp = rules.hp || [null, null]
        this.fighters = [
            new Fighter(champs[0], 0, this, { hp: hp[0] }),
            new Fighter(champs[1], 1, this, { hp: hp[1] })
        ]
        this.humanCount = humans.filter(Boolean).length
        this.fighters.forEach((f, i) => {
            f.controller = controllers[i]
            f.isHuman = humans[i]
            if (f.controller && f.controller.attach) f.controller.attach(f, this.fighters[1 - i], this)
            if (rules.infiniteEnergy && f.isHuman) f.energy = f.maxEnergy
        })
        this.bombs = []
        this.projectiles = []
        this.zones = []
        this.geysers = []
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
        this.fx.text(fighter.x, fighter.y - 120, text, { color, size: 40, life: 1, vy: -90 })
    }

    addShake(amount) {
        if (this.settings.shake || this.demo) this.shake = Math.max(this.shake, amount)
    }

    // ---------------- Ablauf ----------------
    update(realDt) {
        if (this.paused || this.over) return
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
        const [a, b] = this.fighters
        const ia = this.readInput(a, fighting)
        const ib = this.readInput(b, fighting)
        if ((ia.pause || ib.pause) && !this.demo) this.emit("pauseRequest")

        a.update(sdt, b, ia)
        b.update(sdt, a, ib)
        this.separate(a, b)
        this.updateBombs(sdt)
        this.updateProjectiles(sdt)
        this.updateZones(sdt)
        if (fighting) this.updateHazards(sdt)
        this.updateTraining(sdt)
        this.fx.update(sdt)

        if (fighting && isFinite(this.timer)) {
            this.timer -= sdt
            const sec = Math.ceil(this.timer)
            if (sec !== this.lastSecond) {
                this.lastSecond = sec
                if (sec <= 5 && sec > 0) this.sound("count")
            }
            if (this.timer <= 0) {
                this.timer = 0
                this.endRound()
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
            if (att.aimY) {
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
        const facingSrc = def.facing === (Math.sign(src.x - def.x) || def.facing)
        if (def.guarding && facingSrc) {
            if (isHeavy) {
                // Schwere Angriffe brechen die Deckung
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
            const chip = def.blockHit(src, move.dmg, move.kb)
            def.stats.taken += chip
            att.stats.damage += chip
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

        // Training: niemand stirbt
        if (this.training && def.hp - dmg < 1) dmg = Math.max(0, Math.ceil(def.hp - 1))

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
        this.fx.text(def.x, def.y - 110, String(dmg), { color: counter ? "#ff7a5a" : heavy ? "#ffd84a" : "#ffffff", size: heavy ? 60 : 44 })
        this.sound("hit", { heavy })
        this.hitstop = heavy ? 0.085 : counter ? 0.065 : 0.035
        this.addShake(heavy ? 15 : 5)
        this.vibrate(heavy ? 45 : 18, def)

        if (def.hp <= 0) {
            this.lastHit = { melee, heavy: heavy || isHeavy, counter, ambush: ambushHit, aimY: melee ? att.aimY : 0, combo: att.comboCount }
            this.knockout(att, def)
        }
        return true
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

    // ---------------- Projektile (Feuerball) ----------------
    spawnProjectile(owner, move) {
        const p = move.projectile
        const aimY = owner.aimY
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
                const def = this.fighters[1 - p.owner.side]
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
                const def = this.fighters[1 - z.owner.side]
                const inside = Math.hypot((def.x - z.x) / z.radius, (def.y - z.y) / (z.radius * 0.5)) <= 1
                if (inside) this.tryHit(z.owner, def, z.move, 0, { x: z.x, y: z.y - 1 })
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
            if (b.owner && def === b.owner) continue
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
                this.knockout(b.owner || this.fighters[1 - def.side], def)
            }
        }
    }

    // ---------------- Map-Gefahren & Chaos ----------------
    updateHazards(dt) {
        if (this.map.hazard === "geyser" && !this.training) {
            this.hazardT -= dt
            if (this.hazardT <= 0) {
                this.hazardT = 5 + Math.random() * 4
                const near = this.fighters[Math.floor(Math.random() * 2)]
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
                    this.knockout(this.fighters[1 - f.side], f)
                }
            }
        }

        if (this.rules.chaos) {
            this.chaosT -= dt
            if (this.chaosT <= 0) {
                this.chaosT = 1.8 + Math.random() * 2
                const t = this.fighters[Math.floor(Math.random() * 2)]
                const [x, y] = ARENA.clamp(t.x + (Math.random() - 0.5) * 400, t.y + (Math.random() - 0.5) * 200, 30)
                this.dropBomb(x, y)
            }
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
        this.setPhase("ko")
        this.roundResolved = false
        this.roundWinner = winner.side
        this.koTarget = loser
        const fin = this.finisherName(this.lastHit || {})
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
        this.emit("finisher", { winner, loser, name: fin.text })
        this.emit("banner", { text: fin.text, sub: fin.sub, kind: "ko", time: fin.big ? 1.8 : 1.4 })
    }

    // Name des Finishers – je nachdem, womit der letzte Treffer kam
    finisherName(h) {
        if (h.hazard) return { text: "K.O.", sub: "Die Arena schlägt zurück" }
        if (h.bomb) return { text: "BOOM!", sub: "Bomben-Finish", big: true }
        if (h.ambush) return { text: "SCHATTEN-FINISH", sub: "Aus dem Hinterhalt", big: true }
        if (h.counter) return { text: "KONTER-K.O.", sub: "Perfekt abgepasst", big: true }
        if (!h.melee) return { text: "SUPER FINISH", sub: "Magie-Treffer", big: true }
        if (h.combo >= 4) return { text: h.combo + "-HIT FINISH", sub: "Kombo-Finisher", big: true }
        if (h.aimY > 0) return { text: "VON OBEN!", sub: "Finisher", big: h.heavy }
        if (h.aimY < 0) return { text: "UPPERCUT!", sub: "Finisher", big: h.heavy }
        if (h.heavy) return { text: "BRUTAL!", sub: "Schwerer Finisher", big: true }
        return { text: "K.O.", sub: "" }
    }

    endRound() {
        if (this.phase !== "fight") return
        const [a, b] = this.fighters
        this.setPhase("timeup")
        this.roundResolved = false
        const ra = a.hp / a.maxHp
        const rb = b.hp / b.maxHp
        this.roundWinner = Math.abs(ra - rb) < 0.001 ? -1 : ra > rb ? 0 : 1
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
        const f = this.fighters[w]
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
        if (this.humanCount === 1) return side === 0 ? "DU" : this.fighters[1].champ.name.toUpperCase()
        return side === 0 ? "SPIELER 1" : "SPIELER 2"
    }

    nextRoundOrEnd() {
        const decided = this.wins[0] >= this.roundsToWin || this.wins[1] >= this.roundsToWin
        const tooLong = this.round >= (this.rules.rounds || 3) + 2
        if (decided || (tooLong && this.wins[0] !== this.wins[1])) {
            this.over = true
            const winner = this.wins[0] > this.wins[1] ? 0 : 1
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
        this.fx.clear()
        this.fighters.forEach((f, i) => f.reset(ARENA.spawn[i]))
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
        const me = this.humanCount === 1 ? this.fighters.find(f => f.isHuman) : null
        let cx, cy, needW, needH
        if (me) {
            const op = this.fighters[1 - me.side]
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

        if (this.koTarget && this.phase === "ko") {
            cx = this.koTarget.x
            cy = this.koTarget.y - 60
            zoom = Math.min(cover * 1.7, zoom * 1.3)
        }
        if (this.phase === "vs") zoom = cover

        const cam = this.camera
        const k = cam.ready ? 1 - Math.exp(-(this.koTarget ? 5 : 3.2) * dt) : 1
        const kPos = cam.ready ? 1 - Math.exp(-(me && !this.koTarget ? 9 : this.koTarget ? 5 : 3.2) * dt) : 1
        cam.zoom += (zoom - cam.zoom) * k
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
        // Hintergrund außerhalb des Map-Bildes: Farbverlauf passend zur Map
        const [bgTop, bgBottom] = this.map.bg || ["#3d78d8", "#8ec5ff"]
        const bg = ctx.createLinearGradient(0, 0, 0, h)
        bg.addColorStop(0, bgTop)
        bg.addColorStop(1, bgBottom)
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, w, h)

        // Umgebungspartikel (nicht zu viele)
        if (this.fx.particles.length < 260 && Math.random() < (this.map.ambient === "snow" ? 0.9 : this.map.ambient === "embers" ? 0.6 : this.map.ambient === "petals" ? 0.25 : 0.15)) {
            this.fx.ambient(this.map.ambient, cam, this.view)
        }

        const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0
        const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0
        ctx.translate(w / 2 + sx, h / 2 + sy)
        ctx.scale(cam.zoom, cam.zoom)
        ctx.translate(-cam.x, -cam.y)

        ctx.drawImage(IMAGES["map:" + this.map.id], 0, 0, WORLD.width, WORLD.height)

        // Lava-Glühen auf der Vulkan-Map
        if (this.map.id === "volcano") {
            ctx.save()
            ctx.globalCompositeOperation = "lighter"
            ctx.globalAlpha = 0.06 + Math.sin(this.time * 1.7) * 0.03
            ctx.fillStyle = "#ff5a1f"
            ctx.fillRect(0, 0, WORLD.width, WORLD.height)
            ctx.restore()
        }

        this.fx.drawGround(ctx)
        this.drawTelegraphs(ctx)
        for (const f of this.fighters) f.drawShadow(ctx)

        // Tiefensortierung: wer weiter unten steht, wird später gezeichnet
        const drawables = [...this.fighters].sort((p, q) => p.y - q.y)
        for (const f of drawables) f.draw(ctx)

        this.drawProjectiles(ctx)
        this.drawBombs(ctx)
        this.fx.draw(ctx)
        this.fx.drawTexts(ctx)
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

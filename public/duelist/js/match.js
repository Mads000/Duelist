// ============================================================
//  Match – Runden, Treffer, Bomben, Kamera und Zeichnen
// ============================================================

class Match {
    // mode: "solo" | "local" | "demo"
    constructor({ mode, champs, controllers, humans = [false, false], settings, onEvent }) {
        this.mode = mode
        this.demo = mode === "demo"
        this.settings = settings
        this.onEvent = onEvent || (() => {})
        this.fx = new Effects()
        this.fighters = [new Fighter(champs[0], 0, this), new Fighter(champs[1], 1, this)]
        this.fighters.forEach((f, i) => {
            f.controller = controllers[i]
            f.isHuman = humans[i]
            if (f.controller instanceof BotController) f.controller.attach(f, this.fighters[1 - i], this)
        })
        this.bombs = []
        this.time = 0
        this.round = 1
        this.wins = [0, 0]
        this.roundsToWin = Math.ceil((settings.rounds || 3) / 2)
        this.timer = settings.roundTime
        this.phase = "intro"
        this.phaseT = 0
        this.hitstop = 0
        this.timeScale = 1
        this.slowmoT = 0
        this.shake = 0
        this.flash = 0
        this.paused = false
        this.over = false
        this.roundLog = []
        this.koTarget = null
        this.introStep = -1
        this.camera = { x: WORLD.width / 2, y: 560, zoom: 1, ready: false }
        this.view = { w: 1, h: 1 }
        this.lastSecond = Math.ceil(this.timer)
    }

    emit(type, data) {
        this.onEvent(type, data, this)
    }

    sound(name, opt) {
        if (!this.demo) Sound.play(name, opt)
    }

    vibrate(ms) {
        if (this.demo || !this.settings.vibration || !navigator.vibrate) return
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
        const dt = Math.min(realDt, 1 / 20) * (this.settings.gameSpeed || 1)

        this.flash = Math.max(0, this.flash - realDt * 3)
        this.shake = Math.max(0, this.shake - realDt * 60)

        if (this.hitstop > 0) {
            this.hitstop -= realDt
            this.updateCamera(realDt)
            return
        }

        if (this.slowmoT > 0) {
            this.slowmoT -= realDt
            this.timeScale = 0.22
        } else {
            this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-6 * realDt))
        }
        const sdt = dt * this.timeScale
        this.time += sdt
        this.phaseT += realDt

        this.updatePhase(realDt)

        const fighting = this.phase === "fight"
        const [a, b] = this.fighters
        const ia = this.readInput(a, fighting)
        const ib = this.readInput(b, fighting)
        if ((ia.pause || ib.pause) && !this.demo) this.emit("pauseRequest")

        a.update(sdt, b, ia)
        b.update(sdt, a, ib)
        this.separate(a, b)
        this.updateBombs(sdt)
        this.fx.update(sdt)

        if (fighting) {
            this.timer -= sdt
            const sec = Math.ceil(this.timer)
            if (sec !== this.lastSecond) {
                this.lastSecond = sec
                if (sec <= 5 && sec > 0) this.sound("count")
            }
            if (this.timer <= 0) {
                this.timer = 0
                this.endRound("time")
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
        if (this.phase === "intro") {
            // Rundenbanner, dann 3-2-1 (nur erste Runde) und "Kämpft!"
            const steps = this.round === 1 && !this.demo
                ? [[0, "round"], [1.0, "3"], [1.55, "2"], [2.1, "1"], [2.65, "fight"]]
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
            const final = this.wins[0] === this.roundsToWin - 1 && this.wins[1] === this.roundsToWin - 1
            this.emit("banner", { text: final ? "FINALE RUNDE" : `RUNDE ${this.round}`, kind: "round", time: 1.1 })
            this.sound("count")
        } else if (step === "fight") {
            this.emit("banner", { text: "KÄMPFT!", kind: "fight", time: 0.8 })
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
    tryHit(att, def, windowIdx) {
        if (def.state === "dead" || this.phase !== "fight") return false
        const d = att.attackDef
        const reach = d.reach * SPRITE_SCALE + COMBAT.bodyHalf
        const dx = (def.x - att.x) * att.facing
        const dy = Math.abs(def.y - att.y)
        if (dx < -COMBAT.bodyHalf || dx > reach || dy > COMBAT.depthReach) return false

        const hitX = att.x + att.facing * Math.min(Math.max(dx, 0), reach) * 0.7
        const hitY = (att.y + def.y) / 2 - 42

        // Unverwundbar durch Ausweichen
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

        // Schild blockt
        if (def.shieldT > 0) {
            def.stats.blocked++
            this.fx.sparks(hitX, hitY, -att.facing, { color: "#dff3ff", color2: "#7cc4ff", count: 12 })
            this.fx.ring(hitX, hitY, { radius: 50, color: "rgba(180,225,255,0.9)", life: 0.25, width: 6, ground: false })
            att.vx = -att.facing * 420
            if (!def.busy) {
                def.state = "block"
                def.stateT = 0
                def.setAnim("block")
            }
            this.sound("block")
            this.hitstop = 0.05
            this.addShake(5)
            return true
        }

        const finisherHit = d.finisher && windowIdx === d.hits.length - 1
        let dmg = d.dmg
        let kb = finisherHit ? d.kb : d.kb * 0.55
        if (att.ambush) {
            dmg *= 2
            kb *= 1.3
            att.ambush = false
            this.callout(att, "HINTERHALT!", "#c9a5ff")
        }
        const heavy = finisherHit || dmg >= 12

        def.takeHit(att, dmg, kb, heavy)
        att.stats.damage += dmg
        def.stats.taken += dmg
        att.stats.hits++
        att.comboCount++
        att.comboTimer = 1.1
        att.stats.maxCombo = Math.max(att.stats.maxCombo, att.comboCount)
        if (!att.landedThisSwing) {
            att.landedThisSwing = true
            att.gainEnergy()
        }
        if (att.comboCount >= 2) this.emit("combo", { fighter: att, count: att.comboCount })

        // Juice!
        this.fx.sparks(hitX, hitY, att.facing, { count: heavy ? 22 : 12, speed: heavy ? 700 : 480 })
        this.fx.slash(hitX - att.facing * 20, hitY, att.facing, heavy ? "rgba(255,240,200,0.95)" : "rgba(255,255,255,0.85)", heavy)
        this.fx.text(def.x, def.y - 110, String(dmg), {
            color: heavy ? "#ffd84a" : "#ffffff", size: heavy ? 60 : 44
        })
        this.sound("hit", { heavy })
        this.hitstop = heavy ? 0.12 : 0.055
        this.addShake(heavy ? 16 : 6)
        this.vibrate(heavy ? 45 : 18)

        if (def.hp <= 0) this.knockout(att, def)
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

    updateBombs(dt) {
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const b = this.bombs[i]
            b.t += dt
            if (b.phase === "air") {
                const k = Math.min(1, b.t / b.flight)
                b.x = b.x0 + (b.tx - b.x0) * k
                b.y = b.y0 + (b.ty - b.y0) * k
                b.h = 4 * 170 * k * (1 - k) + 40 * (1 - k)
                if (k >= 1) {
                    b.phase = "fuse"
                    b.t = 0
                    this.fx.dust(b.x, b.y, { count: 5, size: 14 })
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
        this.addShake(26)
        this.flash = 0.35
        this.hitstop = 0.06
        this.vibrate(80)
        const def = this.fighters[1 - b.owner.side]
        const inside = Math.hypot((def.x - b.tx) / b.radius, (def.y - b.ty) / (b.radius * 0.5)) <= 1
        if (!inside || def.state === "dead" || this.phase !== "fight") return
        if (def.invulnerable) {
            if (def.state === "dash") this.fx.text(def.x, def.y - 120, "AUSGEWICHEN", { color: "#bfe3ff", size: 32 })
            return
        }
        if (def.shieldT > 0) {
            this.fx.text(def.x, def.y - 120, "GEBLOCKT", { color: "#9fd0ff", size: 34 })
            this.sound("block")
            return
        }
        const fake = { x: b.tx, y: b.ty, facing: Math.sign(def.x - b.tx) || 1 }
        def.takeHit(fake, b.dmg, 650, true)
        b.owner.stats.damage += b.dmg
        def.stats.taken += b.dmg
        b.owner.stats.hits++
        this.fx.text(def.x, def.y - 120, String(b.dmg), { color: "#ff9a3c", size: 72 })
        if (def.hp <= 0) this.knockout(b.owner, def)
    }

    // ---------------- Rundenende ----------------
    knockout(winner, loser) {
        if (this.phase !== "fight") return
        this.setPhase("ko")
        this.roundResolved = false
        this.roundWinner = winner.side
        this.koTarget = loser
        this.slowmoT = 1.1
        this.hitstop = 0.18
        this.flash = 0.8
        this.addShake(30)
        this.sound("ko")
        this.vibrate(160)
        this.emit("banner", { text: "K.O.", kind: "ko", time: 1.4 })
    }

    endRound(reason) {
        if (this.phase !== "fight") return
        const [a, b] = this.fighters
        this.setPhase("timeup")
        this.roundResolved = false
        this.roundWinner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1
        this.emit("banner", { text: "ZEIT!", kind: "ko", time: 1.2 })
        this.sound("ko")
    }

    resolveRound() {
        this.roundResolved = true
        const w = this.roundWinner
        this.roundLog.push(w)
        if (w === -1) {
            this.emit("banner", { text: "UNENTSCHIEDEN", kind: "info", time: 1.8 })
            return
        }
        this.wins[w]++
        const f = this.fighters[w]
        const perfect = f.hp >= COMBAT.hp
        this.emit("roundWin", { side: w })
        this.emit("banner", {
            text: perfect ? "PERFEKT!" : this.winnerName(w) + " GEWINNT",
            sub: perfect ? this.winnerName(w) + " gewinnt die Runde" : `Runde ${this.round}`,
            kind: "win", side: w, time: 1.9
        })
        if (!f.isHuman && this.mode === "solo") this.sound("defeat")
        else this.sound("victory")
    }

    winnerName(side) {
        if (this.mode === "solo") return side === 0 ? "DU" : this.fighters[1].champ.name.toUpperCase()
        if (this.demo) return this.fighters[side].champ.name.toUpperCase()
        return side === 0 ? "SPIELER 1" : "SPIELER 2"
    }

    nextRoundOrEnd() {
        const decided = this.wins[0] >= this.roundsToWin || this.wins[1] >= this.roundsToWin
        const tooLong = this.round >= (this.settings.rounds || 3) + 2
        if (decided || (tooLong && this.wins[0] !== this.wins[1])) {
            this.over = true
            const winner = this.wins[0] > this.wins[1] ? 0 : 1
            this.emit("matchEnd", { winner })
            return
        }
        this.round++
        this.timer = this.settings.roundTime
        this.lastSecond = Math.ceil(this.timer)
        this.bombs.length = 0
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
        let cx = (a.x + b.x) / 2
        let cy = (a.y + b.y) / 2 - 70
        const needW = Math.abs(a.x - b.x) + 560
        const needH = Math.abs(a.y - b.y) + 440
        let zoom = Math.min(w / needW, h / needH)
        zoom = Math.max(cover, Math.min(cover * 1.45, zoom))

        if (this.koTarget && (this.phase === "ko")) {
            cx = this.koTarget.x
            cy = this.koTarget.y - 60
            zoom = Math.min(cover * 1.7, zoom * 1.3)
        }

        const cam = this.camera
        const k = cam.ready ? 1 - Math.exp(-(this.koTarget ? 5 : 3.2) * dt) : 1
        cam.zoom += (zoom - cam.zoom) * k
        cam.x += (cx - cam.x) * k
        cam.y += (cy - cam.y) * k
        cam.ready = true

        // Kamera nicht über den Bildrand hinaus
        const halfW = w / 2 / cam.zoom
        const halfH = h / 2 / cam.zoom
        cam.x = Math.max(halfW, Math.min(WORLD.width - halfW, cam.x))
        cam.y = Math.max(halfH, Math.min(WORLD.height - halfH, cam.y))
    }

    // ---------------- Zeichnen ----------------
    render(ctx, w, h) {
        const cam = this.camera
        ctx.save()
        ctx.imageSmoothingEnabled = false
        ctx.fillStyle = "#4f86d6"
        ctx.fillRect(0, 0, w, h)

        const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0
        const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0
        ctx.translate(w / 2 + sx, h / 2 + sy)
        ctx.scale(cam.zoom, cam.zoom)
        ctx.translate(-cam.x, -cam.y)

        ctx.drawImage(IMAGES.arena, 0, 0, WORLD.width, WORLD.height)

        this.fx.drawGround(ctx)
        this.drawBombTelegraphs(ctx)
        for (const f of this.fighters) f.drawShadow(ctx)

        // Tiefensortierung: wer weiter unten steht, wird später gezeichnet
        const drawables = [...this.fighters].sort((p, q) => p.y - q.y)
        for (const f of drawables) f.draw(ctx)

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
        // Rote Ränder bei wenig Leben (nur für Menschen)
        const human = this.fighters.find(f => f.isHuman && this.mode === "solo")
        if (human && human.hp > 0 && human.hp <= 25) {
            const pulse = 0.25 + Math.sin(this.time * 6) * 0.12
            const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7)
            g.addColorStop(0, "rgba(200,0,0,0)")
            g.addColorStop(1, `rgba(200,0,20,${pulse})`)
            ctx.fillStyle = g
            ctx.fillRect(0, 0, w, h)
        }
    }

    drawBombTelegraphs(ctx) {
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
            // Füllung wächst mit der Zündschnur
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
    }

    drawBombs(ctx) {
        const img = IMAGES["icon:warbrute"]
        for (const b of this.bombs) {
            const size = 52 + b.stacks * 4
            ctx.save()
            // Schatten
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
